import { cycleFromGap, daysBetween, type Cycle } from "./cycles";
import { displayName, serviceKey } from "./services";

// Parses the text of a Safaricom M-Pesa full statement and finds recurring
// payments: the same paybill or till, similar amounts, regular gaps.

export type MpesaTxn = {
  receipt: string;
  at: Date;
  details: string;
  status: string;
  paidIn: number;
  withdrawn: number;
};

export type Counterparty = {
  kind: "paybill" | "till";
  number: string;
  name: string;
  account: string | null;
};

export type RecurringPayment = {
  counterparty: Counterparty;
  serviceName: string;
  serviceKey: string;
  cycle: Cycle;
  txns: MpesaTxn[];
  confidence: number;
};

const num = (s: string) => Math.abs(Number(s.replace(/,/g, "")));

const ROW =
  /\b([A-Z0-9]{10})\s+(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})\s+(.+?)\s+(Completed|Failed|Reversed|Cancelled)\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})\s+(-?[\d,]+\.\d{2})/g;

export function parseStatementText(text: string): MpesaTxn[] {
  const flat = text.replace(/\s+/g, " ");
  const out: MpesaTxn[] = [];
  for (const m of flat.matchAll(ROW)) {
    out.push({
      receipt: m[1],
      // M-Pesa times are East Africa Time (UTC+3).
      at: new Date(`${m[2]}T${m[3]}+03:00`),
      details: m[4].trim(),
      status: m[5],
      paidIn: num(m[6]),
      withdrawn: num(m[7]),
    });
  }
  return out;
}

export function counterpartyOf(details: string): Counterparty | null {
  const paybill = details.match(/Pay ?Bill(?: Online)? to (\d{4,7}) - (.+?)(?: Acc\.? ?(\S+))?$/i);
  if (paybill) return { kind: "paybill", number: paybill[1], name: paybill[2].trim(), account: paybill[3] ?? null };
  const till = details.match(/(?:Merchant Payment|Buy Goods)(?: Online)? to (\d{4,8}) - (.+)$/i);
  if (till) return { kind: "till", number: till[1], name: till[2].trim(), account: null };
  return null;
}

function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function findRecurring(txns: MpesaTxn[]): RecurringPayment[] {
  const groups = new Map<string, { cp: Counterparty; txns: MpesaTxn[] }>();
  for (const t of txns) {
    if (t.status !== "Completed" || t.withdrawn <= 0) continue;
    const cp = counterpartyOf(t.details);
    if (!cp) continue;
    const key = `${cp.kind}:${cp.number}:${cp.account ?? ""}`;
    const g = groups.get(key) ?? { cp, txns: [] };
    g.txns.push(t);
    groups.set(key, g);
  }

  const results: RecurringPayment[] = [];
  for (const { cp, txns: list } of groups.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.at.getTime() - b.at.getTime());

    // Similar amounts: within 20% of the median.
    const med = median(list.map((t) => t.withdrawn));
    const similar = list.filter((t) => Math.abs(t.withdrawn - med) <= med * 0.2);
    if (similar.length < 2) continue;

    // Regular gaps that fit a known cycle.
    const gaps = similar.slice(1).map((t, i) => daysBetween(similar[i].at, t.at));
    const cycle = cycleFromGap(median(gaps));
    if (cycle === "unknown") continue;
    const fit = gaps.filter((g) => cycleFromGap(g) === cycle).length / gaps.length;
    if (fit < 0.6) continue;

    results.push({
      counterparty: cp,
      serviceName: displayName(cp.name),
      serviceKey: serviceKey(cp.name),
      cycle,
      txns: similar,
      confidence: Math.round((0.5 + 0.3 * fit + Math.min(0.2, similar.length * 0.04)) * 100) / 100,
    });
  }
  return results;
}

export async function pdfToText(data: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}
