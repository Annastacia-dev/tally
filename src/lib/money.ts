// Currency helpers. Totals are shown in the user's home currency (KES by default).
// Rates are static for the prototype and can be overridden with FX_RATES_JSON,
// e.g. FX_RATES_JSON='{"USD":129.5,"EUR":140}' (value = KES per 1 unit).

const DEFAULT_RATES_TO_KES: Record<string, number> = {
  KES: 1,
  USD: 129,
  EUR: 140,
  GBP: 164,
  ZAR: 7.1,
  UGX: 0.035,
  TZS: 0.05,
};

function rates(): Record<string, number> {
  try {
    if (process.env.FX_RATES_JSON) {
      return { ...DEFAULT_RATES_TO_KES, ...JSON.parse(process.env.FX_RATES_JSON) };
    }
  } catch {
    // fall through to defaults
  }
  return DEFAULT_RATES_TO_KES;
}

export function convert(amount: number, from: string, to = "KES"): number {
  const r = rates();
  const fromRate = r[from.toUpperCase()] ?? 1;
  const toRate = r[to.toUpperCase()] ?? 1;
  return (amount * fromRate) / toRate;
}

export const CYCLE_PER_YEAR: Record<string, number> = {
  weekly: 52,
  monthly: 12,
  quarterly: 4,
  yearly: 1,
  unknown: 12,
};

export function yearlyCost(amount: number, cycle: string) {
  return amount * (CYCLE_PER_YEAR[cycle] ?? 12);
}

export function formatMoney(amount: number, currency = "KES", opts: { compact?: boolean } = {}) {
  const digits = currency === "KES" || amount >= 1000 ? 0 : 2;
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency,
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
    notation: opts.compact ? "compact" : "standard",
  }).format(amount);
}
