"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, signIn, signOut } from "@/auth";
import { fixtureEmails } from "@/fixtures/emails";
import { addCycle, type Cycle } from "@/lib/cycles";
import { prisma } from "@/lib/db";
import { fetchEmail, listBillingMessageIds } from "@/lib/gmail";
import { ingestEmails, ingestMpesa } from "@/lib/pipeline";
import { runReminders } from "@/lib/reminders";
import { displayName, serviceKey, serviceMeta } from "@/lib/services";

export type ActionResult = { ok: boolean; message: string };

async function me() {
  const user = await requireUser();
  if (!user) redirect("/");
  return user;
}

function refresh() {
  revalidatePath("/dashboard");
  revalidatePath("/review");
  revalidatePath("/sources");
}

export async function signInGoogle() {
  await signIn("google", { redirectTo: "/sources" });
}

export async function signInDemo() {
  await signIn("demo", { redirectTo: "/sources" });
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

export async function scanInbox(): Promise<ActionResult> {
  const user = await me();
  const useFixtures = user.isDemo;
  const scan = await prisma.scan.create({ data: { userId: user.id, kind: useFixtures ? "fixtures" : "gmail" } });
  try {
    let emails;
    if (useFixtures) {
      emails = fixtureEmails();
    } else {
      const months = Number(process.env.SCAN_MONTHS ?? 18);
      const { token, ids } = await listBillingMessageIds(user.id, months);
      emails = [];
      for (const id of ids) emails.push(await fetchEmail(token, id));
    }
    const res = await ingestEmails(user.id, scan.id, emails);
    refresh();
    return { ok: true, message: `Read ${res.emails} emails and found ${res.newCharges} new charges.` };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scan.update({ where: { id: scan.id }, data: { status: "failed", error: message, finishedAt: new Date() } });
    return { ok: false, message };
  }
}

export async function uploadMpesa(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await me();
  try {
    let bytes: Uint8Array;
    if (form.get("sample") === "1") {
      const { sampleStatementPdf } = await import("@/fixtures/mpesa-statement");
      bytes = new Uint8Array(await sampleStatementPdf());
    } else {
      const file = form.get("statement");
      if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a PDF first." };
      bytes = new Uint8Array(await file.arrayBuffer());
    }
    await prisma.scan.create({ data: { userId: user.id, kind: "mpesa", status: "done", finishedAt: new Date() } });
    const res = await ingestMpesa(user.id, bytes);
    refresh();
    return {
      ok: true,
      message: `Read ${res.transactions} transactions and spotted ${res.recurring} recurring payments.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function setStatus(id: string, status: "confirmed" | "dismissed" | "detected") {
  const user = await me();
  await prisma.subscription.updateMany({ where: { id, userId: user.id }, data: { status } });
  refresh();
}

export async function confirmAll() {
  const user = await me();
  await prisma.subscription.updateMany({ where: { userId: user.id, status: "detected" }, data: { status: "confirmed" } });
  refresh();
}

function parseForm(form: FormData) {
  const name = String(form.get("name") ?? "").trim();
  const amount = Number(form.get("amount"));
  const currency = String(form.get("currency") ?? "KES").toUpperCase();
  const cycle = String(form.get("cycle") ?? "monthly") as Cycle;
  const next = String(form.get("nextRenewalAt") ?? "");
  return { name, amount, currency, cycle, nextRenewalAt: next ? new Date(`${next}T09:00:00+03:00`) : null };
}

export async function updateSubscription(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await me();
  const id = String(form.get("id"));
  const v = parseForm(form);
  if (!v.name || !(v.amount > 0)) return { ok: false, message: "Name and a positive amount are required." };
  await prisma.subscription.updateMany({
    where: { id, userId: user.id },
    data: { ...v, edited: true, status: "confirmed", possiblyCancelled: false },
  });
  refresh();
  return { ok: true, message: "Saved" };
}

export async function addManual(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await me();
  const v = parseForm(form);
  if (!v.name || !(v.amount > 0)) return { ok: false, message: "Name and a positive amount are required." };
  const key = serviceKey(v.name);
  const meta = serviceMeta(key);
  const nextRenewalAt = v.nextRenewalAt ?? addCycle(new Date(), v.cycle);
  await prisma.subscription.upsert({
    where: { userId_key: { userId: user.id, key } },
    create: {
      userId: user.id,
      key,
      ...v,
      name: displayName(v.name),
      nextRenewalAt,
      manual: true,
      edited: true,
      status: "confirmed",
      sources: ["manual"],
      domain: meta.domain,
      category: meta.category,
    },
    update: { ...v, nextRenewalAt, edited: true, status: "confirmed" },
  });
  refresh();
  return { ok: true, message: `Added ${displayName(v.name)}` };
}

export async function updateSettings(form: FormData) {
  const user = await me();
  await prisma.user.update({
    where: { id: user.id },
    data: {
      remindDaysBefore: Math.max(0, Math.min(30, Number(form.get("remindDaysBefore") ?? 3))),
      remindersOn: form.get("remindersOn") === "on",
    },
  });
  refresh();
}

export async function sendRemindersNow(): Promise<ActionResult> {
  await me();
  const sent = await runReminders();
  return {
    ok: true,
    message: sent.length
      ? `${sent.length} reminder(s) ${sent.every((s) => s.dryRun) ? "logged (no BREVO_API_KEY, dry run)" : "sent"}.`
      : "Nothing renews inside your reminder window.",
  };
}

export async function resetData() {
  const user = await me();
  await prisma.charge.deleteMany({ where: { userId: user.id } });
  await prisma.subscription.deleteMany({ where: { userId: user.id } });
  await prisma.scan.deleteMany({ where: { userId: user.id } });
  refresh();
}
