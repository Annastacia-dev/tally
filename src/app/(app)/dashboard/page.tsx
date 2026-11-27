import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { ServiceLogo } from "@/components/ServiceLogo";
import { SpendChart } from "@/components/SpendChart";
import { daysBetween } from "@/lib/cycles";
import { fmtDate, TZ } from "@/lib/dates";
import { convert, formatMoney } from "@/lib/money";
import { dashboardData } from "@/lib/queries";
import { brandColor } from "@/lib/services";

const CYCLE_LABEL: Record<string, string> = {
  weekly: "/wk",
  monthly: "/mo",
  quarterly: "/qtr",
  yearly: "/yr",
  unknown: "",
};

const SOURCE_LABEL: Record<string, string> = { email: "📧 Email", mpesa: "📱 M-Pesa", bank: "🏦 Bank", manual: "✍️ Manual" };

function relDays(d: Date, now: Date) {
  const n = daysBetween(now, d);
  if (n <= 0) return "today";
  if (n === 1) return "tomorrow";
  return `in ${n} days`;
}

export default async function Dashboard() {
  const user = await requireUser();
  if (!user) redirect("/");
  const home = user.homeCurrency;
  const now = new Date();
  const data = await dashboardData(user.id, home, now);

  if (data.subs.length === 0) {
    return (
      <div className="card mx-auto mt-10 max-w-lg p-8 text-center">
        <div className="text-5xl" aria-hidden>🔍</div>
        <h1 className="mt-4 font-display text-2xl font-bold">Nothing tracked yet</h1>
        <p className="mt-2 text-ink-2">Scan your inbox or upload an M-Pesa statement and Tally will find your subscriptions.</p>
        <Link href="/sources" className="btn btn-primary mt-6">Find my subscriptions</Link>
      </div>
    );
  }

  const cancelled = data.subs.filter((s) => s.possiblyCancelled);

  return (
    <div className="space-y-5">
      {data.pending > 0 && (
        <Link
          href="/review"
          className="flex items-center justify-between gap-3 rounded-3xl bg-sun/20 px-5 py-3 text-sm font-semibold ring-1 ring-sun/40 hover:bg-sun/30"
        >
          <span>✨ {data.pending} new subscription{data.pending > 1 ? "s" : ""} to review</span>
          <span aria-hidden>→</span>
        </Link>
      )}

      {/* Totals */}
      <section className="grid gap-4 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-[1.75rem] bg-accent p-6 text-accent-ink md:col-span-2">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/15" aria-hidden />
          <div className="absolute -bottom-16 right-20 h-32 w-32 rounded-full bg-white/10" aria-hidden />
          <p className="text-sm font-semibold opacity-85">You spend about</p>
          <p className="mt-1 font-display text-5xl font-extrabold tracking-tight sm:text-6xl">
            {formatMoney(data.monthly, home)}
            <span className="text-xl font-bold opacity-80"> /month</span>
          </p>
          <p className="mt-3 text-sm font-semibold opacity-90">
            That is {formatMoney(data.yearly, home)} a year across {data.active.length} subscription{data.active.length === 1 ? "" : "s"}.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-1">
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Yearly total</p>
            <p className="mt-1 font-display text-2xl font-bold">{formatMoney(data.yearly, home)}</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Next 30 days</p>
            <p className="mt-1 font-display text-2xl font-bold">
              {formatMoney(
                data.upcoming
                  .filter((s) => daysBetween(now, s.nextRenewalAt!) <= 30)
                  .reduce((t, s) => t + convert(s.amount, s.currency, home), 0),
                home,
              )}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-5 lg:items-start">
        {/* Upcoming timeline */}
        <div className="card p-5 lg:col-span-2">
          <h2 className="font-display text-lg font-bold">Coming up</h2>
          {data.upcoming.length === 0 ? (
            <p className="mt-3 text-sm text-ink-2">No renewals in the next 60 days.</p>
          ) : (
            <ol className="relative mt-4 space-y-4 before:absolute before:bottom-2 before:left-[1.35rem] before:top-2 before:w-0.5 before:bg-line">
              {data.upcoming.map((s) => {
                const d = s.nextRenewalAt!;
                const soon = daysBetween(now, d) <= user.remindDaysBefore;
                return (
                  <li key={s.id} className="relative flex items-center gap-3">
                    <div
                      className={`z-10 flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-2xl text-center leading-none ring-4 ring-surface ${soon ? "bg-sun text-black" : "bg-surface-2"}`}
                    >
                      <span className="text-[10px] font-bold uppercase">{d.toLocaleDateString("en-KE", { timeZone: TZ, month: "short" })}</span>
                      <span className="font-display text-base font-bold">{fmtDate(d, { day: "numeric" })}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{s.name}</p>
                      <p className="text-xs text-ink-2">{relDays(d, now)}</p>
                    </div>
                    <p className="font-semibold tabular-nums">{formatMoney(s.amount, s.currency)}</p>
                  </li>
                );
              })}
            </ol>
          )}
        </div>

        {/* Spend chart */}
        <div className="card p-5 lg:col-span-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold">Spend by month</h2>
            <span className="text-xs text-ink-2">last 12 months, in {home}</span>
          </div>
          <div className="mt-4">
            <SpendChart months={data.months} currency={home} />
          </div>
          <details className="mt-2 text-xs text-ink-2">
            <summary className="cursor-pointer select-none">Show as table</summary>
            <table className="mt-2 w-full">
              <tbody>
                {data.months.map((m) => (
                  <tr key={m.key} className="border-t border-line">
                    <td className="py-1">{m.key}</td>
                    <td className="py-1 text-right tabular-nums">{formatMoney(m.total, home)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      </section>

      {/* Cards */}
      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="font-display text-lg font-bold">Your subscriptions</h2>
          <Link href="/review" className="text-sm font-semibold text-accent">Edit</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.active.map((s) => (
            <article key={s.id} className="card flex flex-col gap-3 p-4 transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="flex items-center gap-3">
                <ServiceLogo name={s.name} color={brandColor(s.key)} domain={s.domain} />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate font-semibold">{s.name}</h3>
                  <p className="truncate text-xs text-ink-2">{s.plan ?? s.category ?? "Subscription"}</p>
                </div>
                <p className="text-right font-display text-lg font-bold tabular-nums">
                  {formatMoney(s.amount, s.currency)}
                  <span className="text-xs font-semibold text-ink-2">{CYCLE_LABEL[s.cycle]}</span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="chip">{s.cycle === "unknown" ? "cycle unknown" : s.cycle}</span>
                {s.sources.map((src) => (
                  <span key={src} className="chip">{SOURCE_LABEL[src] ?? src}</span>
                ))}
                {s.status === "detected" && <span className="chip bg-sun/25 text-ink">needs review</span>}
                <span className="ml-auto text-xs text-ink-2">
                  {s.nextRenewalAt ? `Renews ${s.nextRenewalAt.toLocaleDateString("en-KE", { timeZone: TZ, day: "numeric", month: "short" })}` : "No date"}
                </span>
              </div>
            </article>
          ))}
        </div>
      </section>

      {cancelled.length > 0 && (
        <section className="card p-5">
          <h2 className="font-display text-lg font-bold">Possibly cancelled</h2>
          <p className="text-sm text-ink-2">We expected a charge for these and did not see one. They are left out of your totals.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {cancelled.map((s) => (
              <li key={s.id} className="flex items-center gap-2 rounded-2xl bg-surface-2 py-1.5 pl-1.5 pr-3 text-sm">
                <ServiceLogo name={s.name} color={brandColor(s.key)} domain={s.domain} size={28} />
                <span className="font-semibold">{s.name}</span>
                <span className="text-ink-2">
                  last paid {s.lastChargedAt?.toLocaleDateString("en-KE", { timeZone: TZ, day: "numeric", month: "short" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
