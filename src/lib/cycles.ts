// Pure functions that turn a list of charges for one service into a
// subscription: billing cycle, current price, next renewal and whether it
// looks cancelled. No database access here so it is easy to test.

export type Cycle = "weekly" | "monthly" | "quarterly" | "yearly" | "unknown";

export type ChargeLike = {
  amount: number;
  currency: string;
  chargedAt: Date;
  cycleHint?: string | null;
  plan?: string | null;
  confidence?: number;
};

export type Inferred = {
  cycle: Cycle;
  amount: number;
  currency: string;
  plan: string | null;
  lastChargedAt: Date;
  nextRenewalAt: Date | null;
  possiblyCancelled: boolean;
  confidence: number;
};

const DAY = 24 * 60 * 60 * 1000;

export function daysBetween(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / DAY);
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function cycleFromGap(days: number): Cycle {
  if (days >= 5 && days <= 9) return "weekly";
  if (days >= 24 && days <= 38) return "monthly";
  if (days >= 80 && days <= 100) return "quarterly";
  if (days >= 340 && days <= 390) return "yearly";
  return "unknown";
}

export function normaliseCycleHint(hint?: string | null): Cycle {
  const h = (hint ?? "").toLowerCase();
  if (/week/.test(h)) return "weekly";
  if (/quarter|3[- ]?month/.test(h)) return "quarterly";
  if (/year|annual|12[- ]?month/.test(h)) return "yearly";
  if (/month/.test(h)) return "monthly";
  return "unknown";
}

export function addCycle(date: Date, cycle: Cycle): Date {
  const d = new Date(date);
  switch (cycle) {
    case "weekly":
      d.setUTCDate(d.getUTCDate() + 7);
      break;
    case "quarterly":
      d.setUTCMonth(d.getUTCMonth() + 3);
      break;
    case "yearly":
      d.setUTCFullYear(d.getUTCFullYear() + 1);
      break;
    case "monthly":
    case "unknown":
      d.setUTCMonth(d.getUTCMonth() + 1);
      break;
  }
  return d;
}

/** How late a charge can be before we call it "possibly cancelled". */
export function graceDays(cycle: Cycle) {
  return { weekly: 4, monthly: 10, quarterly: 20, yearly: 30, unknown: 10 }[cycle];
}

/** Drop near-duplicates: the same charge seen in an email and on M-Pesa. */
export function dedupeCharges<T extends ChargeLike>(charges: T[]): T[] {
  const sorted = [...charges].sort((a, b) => a.chargedAt.getTime() - b.chargedAt.getTime());
  const out: T[] = [];
  for (const c of sorted) {
    const dup = out.find(
      (o) =>
        Math.abs(daysBetween(o.chargedAt, c.chargedAt)) <= 2 &&
        o.currency === c.currency &&
        Math.abs(o.amount - c.amount) <= Math.max(1, o.amount * 0.03),
    );
    if (!dup) out.push(c);
  }
  return out;
}

export function inferSubscription(charges: ChargeLike[], now = new Date()): Inferred | null {
  if (charges.length === 0) return null;
  const list = dedupeCharges(charges);
  const last = list[list.length - 1];

  // 1. Cycle: the median gap between charges wins; fall back to what the receipt said.
  let cycle: Cycle = "unknown";
  let gapConfidence = 0.5;
  if (list.length >= 2) {
    const gaps = list.slice(1).map((c, i) => daysBetween(list[i].chargedAt, c.chargedAt));
    cycle = cycleFromGap(median(gaps));
    if (cycle !== "unknown") {
      const fit = gaps.filter((g) => cycleFromGap(g) === cycle).length / gaps.length;
      gapConfidence = 0.6 + 0.4 * fit;
    }
  }
  if (cycle === "unknown") {
    const hinted = [...list].reverse().map((c) => normaliseCycleHint(c.cycleHint)).find((c) => c !== "unknown");
    if (hinted) {
      cycle = hinted;
      gapConfidence = 0.7;
    }
  }

  // 2. Next renewal = last charge + cycle.
  const nextRenewalAt = cycle === "unknown" ? null : addCycle(last.chargedAt, cycle);

  // 3. Possibly cancelled: the expected charge is overdue by more than the grace period.
  const possiblyCancelled =
    nextRenewalAt !== null && daysBetween(nextRenewalAt, now) > graceDays(cycle);

  const extractConfidence =
    list.reduce((s, c) => s + (c.confidence ?? 1), 0) / list.length;

  return {
    cycle,
    amount: last.amount,
    currency: last.currency,
    plan: [...list].reverse().find((c) => c.plan)?.plan ?? null,
    lastChargedAt: last.chargedAt,
    nextRenewalAt,
    possiblyCancelled,
    confidence: Math.round(Math.min(1, extractConfidence * gapConfidence + 0.15) * 100) / 100,
  };
}
