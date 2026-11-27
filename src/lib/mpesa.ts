import type { Cycle } from "./cycles";
import { detectRecurring } from "./recurring";
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

export function findRecurring(txns: MpesaTxn[]): RecurringPayment[] {
  const completed = txns.filter((t) => t.status === "Completed");
  const groups = detectRecurring(completed, {
    key: (t) => {
      const cp = counterpartyOf(t.details);
      return cp ? `${cp.kind}:${cp.number}:${cp.account ?? ""}` : null;
    },
    amount: (t) => t.withdrawn,
    at: (t) => t.at,
  });
  return groups.map((g) => {
    const cp = counterpartyOf(g.items[0].details)!;
    return {
      counterparty: cp,
      serviceName: displayName(cp.name),
      serviceKey: serviceKey(cp.name),
      cycle: g.cycle,
      txns: g.items,
      confidence: g.confidence,
    };
  });
}

/** Text of a statement PDF. Throws a readable error for locked or scanned files. */
export async function pdfToText(data: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  let text: string;
  try {
    const pdf = await getDocumentProxy(data);
    ({ text } = await extractText(pdf, { mergePages: true }));
  } catch (err) {
    if (err instanceof Error && /password/i.test(`${err.name} ${err.message}`)) {
      throw new Error("This PDF is password protected. Open it, print it to a new PDF without the password, then upload that.");
    }
    throw new Error("Could not read this file. Is it a PDF statement?");
  }
  if (text.replace(/\s/g, "").length < 50) {
    throw new Error("This PDF has no readable text (it may be a scan or photo). Download the statement as a PDF from your bank or the M-PESA app instead.");
  }
  return text;
}
