import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { MpesaUpload, RemindNow, ScanButton } from "@/components/SourceActions";
import { fmtDate } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { hasClaude, MODEL } from "@/lib/extract";
import { resetData, updateSettings } from "../../actions";

export const maxDuration = 300;

export default async function Sources() {
  const user = await requireUser();
  if (!user) redirect("/");
  const [scans, google] = await Promise.all([
    prisma.scan.findMany({ where: { userId: user.id }, orderBy: { startedAt: "desc" }, take: 5 }),
    prisma.account.findFirst({ where: { userId: user.id, provider: "google" } }),
  ]);
  const lastEmail = scans.find((s) => s.kind !== "mpesa");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-3xl font-bold">Sources</h1>
        <p className="text-ink-2">Where Tally looks for your subscriptions.</p>
      </div>

      <section className="card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-accent-soft text-2xl" aria-hidden>📧</span>
          <div className="flex-1">
            <h2 className="font-display text-lg font-bold">{user.isDemo ? "Sample inbox" : "Gmail"}</h2>
            <p className="text-sm text-ink-2">
              {user.isDemo
                ? "Demo mode reads a built-in set of receipts, renewal notices and a few junk emails."
                : google
                  ? `Connected as ${user.email}. We search the last 18 months for receipts, invoices and renewal emails.`
                  : "Sign in with Google to connect your inbox."}
            </p>
            <p className="mt-1 text-xs text-ink-2">
              Extraction: {hasClaude() ? `Claude (${MODEL})` : "built-in rules (set ANTHROPIC_API_KEY to use Claude)"}
              {lastEmail && ` · last scan ${fmtDate(lastEmail.startedAt, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}, ${lastEmail.status}`}
            </p>
            <div className="mt-4">
              <ScanButton label={lastEmail ? "Scan again" : user.isDemo ? "Scan sample inbox" : "Scan my inbox"} />
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-mint/20 text-2xl" aria-hidden>📱</span>
          <div className="flex-1">
            <h2 className="font-display text-lg font-bold">M-Pesa statement</h2>
            <p className="text-sm text-ink-2">
              Many Kenyan subscriptions have no email receipt. In the M-PESA app go to <b>Statements</b>, request a full statement as PDF, then
              upload it here. We look for paybills and tills you pay on a regular schedule. Remove the PDF password first.
            </p>
            <div className="mt-4">
              <MpesaUpload demo={user.isDemo} />
            </div>
          </div>
        </div>
      </section>

      <section className="card p-5 sm:p-6">
        <div className="flex items-start gap-4">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sun/25 text-2xl" aria-hidden>⏰</span>
          <div className="flex-1">
            <h2 className="font-display text-lg font-bold">Reminders</h2>
            <p className="text-sm text-ink-2">We email {user.email} before each renewal. The check runs every morning.</p>
            <form action={updateSettings} className="mt-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm font-semibold">
                <input type="checkbox" name="remindersOn" defaultChecked={user.remindersOn} className="h-4 w-4 accent-[var(--accent)]" />
                Email me
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="number" name="remindDaysBefore" min={0} max={30} defaultValue={user.remindDaysBefore} className="input w-20" />
                days before
              </label>
              <button className="btn btn-ghost">Save</button>
            </form>
            <div className="mt-3">
              <RemindNow />
            </div>
          </div>
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 px-1 text-sm text-ink-2">
        <span>
          Coming later: a forwarding address, so you can forward receipts without connecting Gmail.
        </span>
        <form action={resetData}>
          <button className="font-semibold text-warn hover:underline">Clear my data</button>
        </form>
      </section>
    </div>
  );
}
