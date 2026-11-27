import { prisma } from "./db";
import { CYCLE_PER_YEAR, convert } from "./money";

export async function dashboardData(userId: string, home = "KES", now = new Date()) {
  const subs = await prisma.subscription.findMany({
    where: { userId, status: { not: "dismissed" } },
    orderBy: [{ nextRenewalAt: "asc" }],
  });
  const active = subs.filter((s) => !s.possiblyCancelled);

  const yearly = active.reduce((sum, s) => sum + convert(s.amount, s.currency, home) * (CYCLE_PER_YEAR[s.cycle] ?? 12), 0);
  const monthly = yearly / 12;

  const in60 = new Date(now.getTime() + 60 * 86_400_000);
  const upcoming = active
    .filter((s) => s.nextRenewalAt && s.nextRenewalAt >= new Date(now.getTime() - 86_400_000) && s.nextRenewalAt <= in60)
    .slice(0, 8);

  // Spend by month: actual charges over the last 12 months, in home currency.
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 11, 1));
  const charges = await prisma.charge.findMany({
    where: { userId, chargedAt: { gte: start }, subscription: { status: { not: "dismissed" } } },
  });
  const months = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
    return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString("en-KE", { month: "short", timeZone: "UTC" }), total: 0 };
  });
  // Same receipt in email and M-Pesa: count once per service per day.
  const seen = new Set<string>();
  for (const c of charges) {
    const dedupe = `${c.serviceKey}:${c.chargedAt.toISOString().slice(0, 10)}`;
    const nearby = [-1, 0, 1].some((o) =>
      seen.has(`${c.serviceKey}:${new Date(c.chargedAt.getTime() + o * 86_400_000).toISOString().slice(0, 10)}`),
    );
    if (nearby) continue;
    seen.add(dedupe);
    const m = months.find((x) => x.key === c.chargedAt.toISOString().slice(0, 7));
    if (m) m.total += convert(c.amount, c.currency, home);
  }

  const pending = subs.filter((s) => s.status === "detected").length;
  return { subs, active, yearly, monthly, upcoming, months, pending };
}
