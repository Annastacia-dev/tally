import { prisma } from "./db";
import { daysBetween } from "./cycles";
import { TZ } from "./dates";
import { formatMoney } from "./money";

// Daily job: email the user a few days before each renewal, once per renewal date.

/** "Tally <noreply@example.com>" or a bare "noreply@example.com". */
export function parseSender(value: string | undefined) {
  const v = (value || "reminders@example.com").trim();
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  return m ? { name: m[1].trim() || "Tally", email: m[2].trim() } : { name: "Tally", email: v };
}

export async function sendBrevoEmail(to: { email: string; name?: string | null }, subject: string, html: string) {
  const key = process.env.BREVO_API_KEY;
  const sender = parseSender(process.env.REMINDER_FROM_EMAIL);
  if (!key) {
    console.log(`[reminders] BREVO_API_KEY not set, would send to ${to.email}: ${subject}`);
    return { dryRun: true };
  }
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender, to: [{ email: to.email, name: to.name ?? undefined }], subject, htmlContent: html }),
  });
  if (!res.ok) throw new Error(`Brevo send failed: ${res.status} ${await res.text()}`);
  return { dryRun: false };
}

export function reminderHtml(name: string, amount: string, date: Date, days: number, appUrl: string) {
  const when = days <= 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`;
  const nice = date.toLocaleDateString("en-KE", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
  return `<div style="font-family:system-ui,sans-serif;max-width:480px;margin:auto;padding:24px">
  <p style="font-size:14px;color:#6b6b80">Tally reminder</p>
  <h1 style="font-size:22px;margin:0 0 12px">${name} renews ${when}</h1>
  <p style="font-size:16px">You will be charged <b>${amount}</b> on ${nice}.</p>
  <p style="font-size:14px;color:#6b6b80">Still using it? Great, nothing to do. If not, cancel before then.</p>
  <p><a href="${appUrl}/dashboard" style="display:inline-block;background:#7c5cff;color:#fff;padding:10px 16px;border-radius:999px;text-decoration:none">Open Tally</a></p>
</div>`;
}

export async function runReminders(now = new Date()) {
  const appUrl = process.env.APP_URL || process.env.AUTH_URL || "http://localhost:3000";
  const users = await prisma.user.findMany({
    where: { remindersOn: true, email: { not: null } },
    include: { subscriptions: { where: { status: { not: "dismissed" }, possiblyCancelled: false, nextRenewalAt: { not: null } } } },
  });

  const sent: { user: string; service: string; renewsOn: string; dryRun: boolean }[] = [];
  for (const user of users) {
    for (const sub of user.subscriptions) {
      const renew = sub.nextRenewalAt!;
      const days = daysBetween(now, renew);
      if (days < 0 || days > user.remindDaysBefore) continue;
      if (sub.lastRemindedFor && sub.lastRemindedFor.getTime() === renew.getTime()) continue;

      const amount = formatMoney(sub.amount, sub.currency);
      const subject = `${sub.name} renews ${days <= 1 ? (days === 0 ? "today" : "tomorrow") : `in ${days} days`} (${amount})`;
      const res = await sendBrevoEmail(
        { email: user.email!, name: user.name },
        subject,
        reminderHtml(sub.name, amount, renew, days, appUrl),
      );
      await prisma.subscription.update({ where: { id: sub.id }, data: { lastRemindedFor: renew } });
      sent.push({ user: user.email!, service: sub.name, renewsOn: renew.toISOString().slice(0, 10), dryRun: res.dryRun });
    }
  }
  return sent;
}
