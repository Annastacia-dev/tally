"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser, signIn, signOut } from "@/auth";
import { fixtureEmails } from "@/fixtures/emails";
import { addCycle, type Cycle } from "@/lib/cycles";
import { prisma } from "@/lib/db";
import { costUsd } from "@/lib/extract";
import { fetchEmail, listBillingMessageIds } from "@/lib/gmail";
import { alreadyRead, ingestEmails, ingestStatement } from "@/lib/pipeline";
import { isDeviceInput, pushToUser, removeDevice, saveDevice } from "@/lib/push";
import { runReminders, sendTestEmail } from "@/lib/reminders";
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
    let res;
    if (useFixtures) {
      const emails = new Map(fixtureEmails().map((e) => [e.id, e]));
      res = await ingestEmails(user.id, scan.id, [...emails.keys()], async (id) => emails.get(id)!);
    } else {
      const months = Number(process.env.SCAN_MONTHS || 18);
      const max = Number(process.env.SCAN_MAX_EMAILS || 1000);
      const { token, ids } = await listBillingMessageIds(user.id, months, max, await alreadyRead(user.id));
      res = await ingestEmails(user.id, scan.id, ids, (id) => fetchEmail(token, id));
    }
    refresh();
    const tokens = res.inputTokens + res.outputTokens;
    const cost = costUsd(res);
    const spent = tokens ? ` Claude used ${tokens.toLocaleString()} tokens${cost !== null ? ` (about US$${cost.toFixed(2)})` : ""}.` : "";
    return { ok: true, message: `Read ${res.emails} emails and found ${res.newCharges} new charges.${res.skipped ? ` Skipped ${res.skipped} with no amount in them.` : ""}${spent}` };
  } catch (err) {
    refresh();
    const message = err instanceof Error ? err.message : String(err);
    await prisma.scan.update({ where: { id: scan.id }, data: { status: "failed", error: message, finishedAt: new Date() } });
    return { ok: false, message };
  }
}

export async function uploadStatement(_: ActionResult | null, form: FormData): Promise<ActionResult> {
  const user = await me();
  try {
    let bytes: Uint8Array;
    const sample = form.get("sample");
    if (sample === "mpesa") {
      const { sampleStatementPdf } = await import("@/fixtures/mpesa-statement");
      bytes = new Uint8Array(await sampleStatementPdf());
    } else if (sample === "bank") {
      const { sampleBankStatementPdf } = await import("@/fixtures/bank-statement");
      bytes = new Uint8Array(await sampleBankStatementPdf());
    } else {
      const file = form.get("statement");
      if (!(file instanceof File) || file.size === 0) return { ok: false, message: "Choose a PDF first." };
      bytes = new Uint8Array(await file.arrayBuffer());
    }
    const res = await ingestStatement(user.id, bytes);
    await prisma.scan.create({ data: { userId: user.id, kind: res.kind, status: "done", finishedAt: new Date() } });
    refresh();
    const what = res.kind === "mpesa" ? "M-Pesa statement" : "bank statement";
    return {
      ok: true,
      message: `Read your ${what}: ${res.transactions} payments out, ${res.recurring} recurring.`,
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

export async function sendTestReminder(): Promise<ActionResult> {
  const user = await me();
  if (user.isDemo || !user.email) return { ok: false, message: "Sign in with Google to send a test email." };
  try {
    const res = await sendTestEmail({ email: user.email, name: user.name });
    return {
      ok: true,
      message: res.dryRun ? "No BREVO_API_KEY set, so the test email was only logged." : `Test email sent to ${user.email}.`,
    };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function savePushDevice(device: unknown, userAgent?: string): Promise<ActionResult> {
  const user = await me();
  if (!isDeviceInput(device)) return { ok: false, message: "That push subscription looks wrong." };
  await saveDevice(user.id, device, userAgent);
  return { ok: true, message: "Notifications are on for this device." };
}

export async function removePushDevice(endpoint: string): Promise<ActionResult> {
  const user = await me();
  await removeDevice(user.id, String(endpoint));
  return { ok: true, message: "Notifications are off for this device." };
}

export async function sendTestPush(): Promise<ActionResult> {
  const user = await me();
  const reached = await pushToUser(user.id, {
    title: "Netflix renews in 3 days (test)",
    body: "KES 1,100 will be charged. This is a test notification from Tally.",
    url: "/dashboard",
    tag: "tally-test",
  });
  return reached
    ? { ok: true, message: `Test notification sent to ${reached} device${reached === 1 ? "" : "s"}.` }
    : { ok: false, message: "No device has notifications on yet." };
}

export async function sendRemindersNow(): Promise<ActionResult> {
  const user = await me();
  if (user.isDemo) return { ok: false, message: "Demo accounts never get emails. Sign in with Google to try reminders." };
  const sent = await runReminders(new Date(), user.id);
  return {
    ok: true,
    message: sent.length
      ? `${sent.length} reminder(s) ${sent.every((s) => s.dryRun) ? "logged (no BREVO_API_KEY, dry run)" : "sent"}${sent.some((s) => s.pushed) ? ", with notifications" : ""}.`
      : "Nothing renews inside your reminder window.",
  };
}

export async function resetData() {
  const user = await me();
  await prisma.charge.deleteMany({ where: { userId: user.id } });
  await prisma.subscription.deleteMany({ where: { userId: user.id } });
  await prisma.scan.deleteMany({ where: { userId: user.id } });
  await prisma.readEmail.deleteMany({ where: { userId: user.id } });
  refresh();
}
