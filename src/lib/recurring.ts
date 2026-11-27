import { cycleFromGap, daysBetween, type Cycle } from "./cycles";

// Finds recurring payments in a list of outgoing transactions from any
// statement (M-Pesa or bank): same payee, similar amounts, regular gaps.

export type RecurringGroup<T> = {
  items: T[];
  cycle: Cycle;
  confidence: number;
};

export function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function detectRecurring<T>(
  items: T[],
  by: { key: (t: T) => string | null; amount: (t: T) => number; at: (t: T) => Date },
): RecurringGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const t of items) {
    const k = by.key(t);
    if (!k || by.amount(t) <= 0) continue;
    const list = groups.get(k) ?? [];
    list.push(t);
    groups.set(k, list);
  }

  const results: RecurringGroup<T>[] = [];
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => by.at(a).getTime() - by.at(b).getTime());

    // Similar amounts: within 20% of the median.
    const med = median(list.map(by.amount));
    const similar = list.filter((t) => Math.abs(by.amount(t) - med) <= med * 0.2);
    if (similar.length < 2) continue;

    // Regular gaps that fit a known cycle.
    const gaps = similar.slice(1).map((t, i) => daysBetween(by.at(similar[i]), by.at(t)));
    const cycle = cycleFromGap(median(gaps));
    if (cycle === "unknown") continue;
    const fit = gaps.filter((g) => cycleFromGap(g) === cycle).length / gaps.length;
    if (fit < 0.6) continue;

    results.push({
      items: similar,
      cycle,
      confidence: Math.round((0.5 + 0.3 * fit + Math.min(0.2, similar.length * 0.04)) * 100) / 100,
    });
  }
  return results;
}
