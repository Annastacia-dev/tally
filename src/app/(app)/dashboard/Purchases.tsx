import Link from "next/link";
import { ServiceLogo } from "@/components/ServiceLogo";
import { SpendChart } from "@/components/SpendChart";
import { fmtDate, TZ } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { convert, formatMoney } from "@/lib/money";
import { brandColor, serviceMeta } from "@/lib/services";

const SOURCE_LABEL: Record<string, string> = { email: "Email", mpesa: "M-Pesa", bank: "Bank" };

function monthKey(d: Date) {
  return d.toLocaleDateString("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" });
}

/** Home, Purchases tab: one-off payments found in emails and statements. */
export async function PurchasesView({ userId, home, now }: { userId: string; home: string; now: Date }) {
  const since = new Date(now);
  since.setMonth(since.getMonth() - 11, 1);
  const purchases = await prisma.purchase.findMany({
    where: { userId, at: { gte: since } },
    orderBy: { at: "desc" },
  });

  if (purchases.length === 0) {
    return (
      <div className="card mx-auto mt-6 max-w-lg p-8 text-center">
        <div className="text-5xl" aria-hidden>🧾</div>
        <h2 className="mt-4 font-display text-2xl font-bold">No purchases yet</h2>
        <p className="mt-2 text-ink-2">
          One-off payments show up here: orders, rides, meals and till payments. Scan your inbox or upload a statement to find them.
        </p>
        <Link href="/sources" className="btn btn-primary mt-6">
          Add a source
        </Link>
      </div>
    );
  }

  const inHome = (p: { amount: number; currency: string }) => convert(p.amount, p.currency, home);
  const thisMonth = monthKey(now);
  const monthTotal = purchases.filter((p) => monthKey(p.at) === thisMonth).reduce((t, p) => t + inHome(p), 0);
  const last30 = purchases.filter((p) => now.getTime() - p.at.getTime() <= 30 * 86_400_000);
  const yearTotal = purchases.reduce((t, p) => t + inHome(p), 0);

  // Last 12 months, oldest first, for the chart.
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now);
    d.setMonth(d.getMonth() - (11 - i), 15);
    const key = monthKey(d);
    return {
      key,
      label: d.toLocaleDateString("en-KE", { timeZone: TZ, month: "short" }),
      total: purchases.filter((p) => monthKey(p.at) === key).reduce((t, p) => t + inHome(p), 0),
    };
  });

  const byMerchant = new Map<string, { name: string; key: string; total: number; count: number }>();
  for (const p of purchases) {
    const m = byMerchant.get(p.merchantKey) ?? { name: p.merchant, key: p.merchantKey, total: 0, count: 0 };
    m.total += inHome(p);
    m.count++;
    byMerchant.set(p.merchantKey, m);
  }
  const top = [...byMerchant.values()].sort((a, b) => b.total - a.total).slice(0, 5);

  // The list: most recent first, grouped by month, capped so the page stays light.
  const recent = purchases.slice(0, 60);
  const groups: { label: string; items: typeof recent; total: number }[] = [];
  for (const p of recent) {
    const label = p.at.toLocaleDateString("en-KE", { timeZone: TZ, month: "long", year: "numeric" });
    let g = groups.at(-1);
    if (!g || g.label !== label) groups.push((g = { label, items: [], total: 0 }));
    g.items.push(p);
    g.total += inHome(p);
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-4 md:grid-cols-3">
        <div className="relative overflow-hidden rounded-[1.25rem] border-2 border-edge bg-lime p-6 text-[#17142b] shadow-[6px_6px_0_var(--edge)] md:col-span-2">
          <p className="text-sm font-semibold opacity-80">Spent on one-off purchases this month</p>
          <p className="mt-1 font-display text-5xl font-extrabold tracking-tight [font-stretch:75%] sm:text-7xl">
            {formatMoney(monthTotal, home)}
          </p>
          <p className="mt-3 text-sm font-semibold opacity-80">
            {last30.length} purchase{last30.length === 1 ? "" : "s"} in the last 30 days.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-1">
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Last 30 days</p>
            <p className="mt-1 font-display text-2xl font-bold">{formatMoney(last30.reduce((t, p) => t + inHome(p), 0), home)}</p>
          </div>
          <div className="card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-2">Past 12 months</p>
            <p className="mt-1 font-display text-2xl font-bold">{formatMoney(yearTotal, home)}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-5 lg:items-start">
        <div className="card p-5 lg:col-span-3">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold">Spend by month</h2>
            <span className="text-xs text-ink-2">in {home}</span>
          </div>
          <SpendChart months={months} currency={home} />
        </div>
        <div className="card p-5 lg:col-span-2">
          <h2 className="mb-3 font-display text-lg font-bold">Where it goes</h2>
          <ul className="space-y-3">
            {top.map((m) => (
              <li key={m.key} className="flex items-center gap-3">
                <ServiceLogo name={m.name} color={brandColor(m.key)} domain={serviceMeta(m.key).domain} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{m.name}</p>
                  <div className="mt-1 h-1.5 rounded-full bg-surface-2">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(4, (m.total / top[0].total) * 100)}%` }} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-display text-sm font-bold tabular-nums">{formatMoney(m.total, home)}</p>
                  <p className="text-xs text-ink-2">{m.count}×</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="card">
        {groups.map((g, i) => (
          <div key={g.label} className={i ? "border-t-2 border-line" : ""}>
            <div className="flex items-baseline justify-between px-5 pb-1 pt-4">
              <h2 className="font-display font-bold">{g.label}</h2>
              <span className="text-sm font-semibold tabular-nums text-ink-2">{formatMoney(g.total, home)}</span>
            </div>
            <ul>
              {g.items.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                  <ServiceLogo name={p.merchant} color={brandColor(p.merchantKey)} domain={serviceMeta(p.merchantKey).domain} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{p.merchant}</p>
                    <p className="truncate text-xs text-ink-2">
                      {fmtDate(p.at, { day: "numeric", month: "short" })}
                      {p.item && ` · ${p.item}`} · {SOURCE_LABEL[p.source] ?? p.source}
                    </p>
                  </div>
                  <p className="shrink-0 font-display font-bold tabular-nums">{formatMoney(p.amount, p.currency)}</p>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {purchases.length > recent.length && (
          <p className="border-t-2 border-line px-5 py-3 text-center text-xs text-ink-2">
            Showing the latest {recent.length} of {purchases.length} purchases from the past year.
          </p>
        )}
      </section>
    </div>
  );
}
