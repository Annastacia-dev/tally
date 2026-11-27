import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Cycle } from "./cycles";
import { anthropic, hasClaude, MODEL } from "./extract";
import { detectRecurring } from "./recurring";
import { displayName, findKnownService, serviceKey } from "./services";

// Reads bank statements. Every bank lays its PDF out differently, so Claude
// does the reading when ANTHROPIC_API_KEY is set. Without it, a rule-based
// reader works out each debit from the change in the running balance.

export type BankTxn = {
  at: Date;
  description: string;
  payee: string;
  amount: number; // money out, positive
  currency: string;
  ref: string; // stable per statement row, used to skip rows seen before
};

export type BankRecurring = {
  serviceName: string;
  serviceKey: string;
  cycle: Cycle;
  txns: BankTxn[];
  confidence: number;
};

// ---------------------------------------------------------------------------
// Payee cleaning
// ---------------------------------------------------------------------------

const NOISE =
  /\b(pos|purchase|card|debit|visa|mastercard|mc|contactless|online|payment|pmt|trf|transfer|standing order|s\/o|direct debit|dd|ach|recurring|subscription|txn|ref|auth|ke|ken|nairobi|kenya|www)\b/gi;

/** "POS PURCHASE NETFLIX.COM 866-579 KE 4412**" -> "Netflix" */
export function cleanPayee(description: string): string {
  const known = findKnownService(description);
  if (known) return known.name;
  const cleaned = description
    .replace(/\.(com|net|io|co|org)\b.*/i, "") // keep the brand, drop the domain tail
    .replace(/[*#]+\S*/g, " ")
    .replace(/\b[A-Z0-9]*\d[A-Z0-9]*\b/gi, " ") // refs, card digits, phone numbers
    .replace(NOISE, " ")
    .replace(/[^A-Za-z&' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return displayName(cleaned || description.trim());
}

// ---------------------------------------------------------------------------
// Rule-based reader
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 };
const DATE =
  /\b(?:(\d{4})-(\d{2})-(\d{2})|(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})|(\d{1,2})[ -]([A-Za-z]{3})[a-z]*[ -](\d{4}|\d{2}))\b/g;
const MONEY = /(?<![\d.])-?\d{1,3}(?:,\d{3})*\.\d{2}(?![\d])(?:\s?(?:DR|CR)\b)?/gi;
// Footers that can trail the last row on a page or statement.
const FOOTER = /\b(?:closing balance|carried forward|balance c\/f|total debits|total credits|totals?:|page \d+ of)/i;
const SKIP = /^(opening balance|balance b\/f|brought forward)\b/i;

function toDate(m: RegExpMatchArray): Date | null {
  let y: number, mo: number, d: number;
  if (m[1]) [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
  else if (m[4]) [y, mo, d] = [Number(m[6]), Number(m[5]) - 1, Number(m[4])]; // dd/mm/yyyy, as Kenyan banks print it
  else {
    const month = MONTHS[m[8].slice(0, 3).toLowerCase()];
    if (month === undefined) return null;
    y = Number(m[9].length === 2 ? `20${m[9]}` : m[9]);
    [mo, d] = [month, Number(m[7])];
  }
  if (mo < 0 || mo > 11 || d < 1 || d > 31) return null;
  // Midday East Africa Time, so the calendar day is the same in any zone we show.
  return new Date(Date.UTC(y, mo, d, 9));
}

const money = (s: string) => Number(s.replace(/,|\s?(DR|CR)$/gi, ""));

type Row = { at: Date; description: string; amounts: number[]; balance: number };

/** Statement rows: a date, a narration, one or more amounts, then the running balance. */
export function parseBankRows(text: string): { rows: Row[]; opening: number | null } {
  const flat = text.replace(/\s+/g, " ");
  const opening = flat.match(/opening balance\D{0,20}(-?\d{1,3}(?:,\d{3})*\.\d{2})/i);
  const dates = [...flat.matchAll(DATE)];
  const rows: Row[] = [];

  for (let i = 0; i < dates.length; i++) {
    const m = dates[i];
    const at = toDate(m);
    if (!at) continue;
    let end = i + 1 < dates.length ? dates[i + 1].index! : flat.length;
    // A value date straight after the posting date belongs to the same row.
    while (i + 1 < dates.length && flat.slice(m.index! + m[0].length, dates[i + 1].index).trim() === "") {
      i++;
      end = i + 1 < dates.length ? dates[i + 1].index! : flat.length;
    }
    const body = flat.slice(m.index! + m[0].length, end).replace(DATE, " ").split(FOOTER)[0];
    const amounts = [...body.matchAll(MONEY)].map((x) => money(x[0]));
    if (amounts.length < 2) continue;
    const description = body.replace(MONEY, " ").replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]{3}/.test(description) || SKIP.test(description)) continue;
    rows.push({ at, description, amounts: amounts.slice(0, -1), balance: amounts[amounts.length - 1] });
  }
  return { rows, opening: opening ? money(opening[1]) : null };
}

/** Debits from a statement, worked out from the change in running balance. */
export function readBankWithRules(text: string, currency = guessCurrency(text)): BankTxn[] {
  const { rows, opening } = parseBankRows(text);
  if (rows.length === 0) return [];
  const ascending = rows[0].at.getTime() <= rows[rows.length - 1].at.getTime();
  const ordered = ascending ? rows : [...rows].reverse();

  const out: BankTxn[] = [];
  let prev = opening;
  for (const row of ordered) {
    let debit: number | null = null;
    if (prev !== null) {
      const delta = Math.round((row.balance - prev) * 100) / 100;
      if (delta < 0 && row.amounts.some((a) => Math.abs(Math.abs(a) - -delta) < 0.01)) debit = -delta;
    } else {
      // First row with no opening balance: trust an explicit minus sign.
      const neg = row.amounts.find((a) => a < 0);
      if (neg !== undefined) debit = -neg;
    }
    prev = row.balance;
    if (debit && debit > 0) out.push(txn(row.at, row.description, cleanPayee(row.description), debit, currency));
  }
  return withRefs(out);
}

export function guessCurrency(text: string): string {
  const m = text.match(/\b(KES|KSH|USD|EUR|GBP|UGX|TZS)\b/i);
  if (!m) return "KES";
  const c = m[1].toUpperCase();
  return c === "KSH" ? "KES" : c;
}

function txn(at: Date, description: string, payee: string, amount: number, currency: string): BankTxn {
  return { at, description, payee, amount, currency, ref: "" };
}

/** Stable refs: date, amount and payee, plus a counter for identical rows on the same day. */
function withRefs(txns: BankTxn[]): BankTxn[] {
  const seen = new Map<string, number>();
  return txns.map((t) => {
    const base = `${t.at.toISOString().slice(0, 10)}:${t.amount.toFixed(2)}:${serviceKey(t.payee)}`;
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return { ...t, ref: `${base}:${n}` };
  });
}

// ---------------------------------------------------------------------------
// Claude reader
// ---------------------------------------------------------------------------

const BankSchema = z.object({
  currency: z.string().describe("ISO 4217 code of the account, e.g. KES, USD. Use KES for 'Ksh' or 'KSh'."),
  transactions: z.array(
    z.object({
      date: z.string().describe("Posting date in YYYY-MM-DD."),
      description: z.string().describe("The narration exactly as printed."),
      payee: z.string().describe("Who was paid, cleaned up: 'Netflix', 'Iron Paradise Gym'. No card numbers or refs."),
      amount: z.number().describe("Money out as a positive number."),
    }),
  ),
});

const SYSTEM = `You read the text of one bank statement and list every transaction where money left the account (debits, card purchases, standing orders, direct debits, transfers out, fees).
Skip money in (credits, salary, refunds, reversals), opening and closing balances, and totals.
The text was pulled from a PDF, so columns may run together. Use the running balance to tell debits from credits when the columns are unclear.
Dates on Kenyan statements are day first (dd/mm/yyyy).`;

const CHUNK = 30_000;

function chunks(text: string): string[] {
  const lines = text.split("\n");
  const out: string[] = [];
  let cur = "";
  for (const line of lines) {
    if (cur.length + line.length > CHUNK && cur) {
      out.push(cur);
      cur = "";
    }
    cur += `${line}\n`;
  }
  if (cur.trim()) out.push(cur);
  return out;
}

async function readChunk(text: string, depth = 0): Promise<z.infer<typeof BankSchema>> {
  // Streaming, because a long statement can produce a large output.
  const stream = anthropic().beta.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(BankSchema) },
    system: SYSTEM,
    messages: [{ role: "user", content: text }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === "refusal") throw new Error("Claude declined to read this statement.");
  if (msg.stop_reason === "max_tokens") {
    // Too many rows for one answer: halve the page range and try again.
    if (depth >= 3 || text.length < 2000) throw new Error("Statement too long to read in one go.");
    const mid = text.lastIndexOf("\n", text.length / 2);
    const [a, b] = await Promise.all([readChunk(text.slice(0, mid), depth + 1), readChunk(text.slice(mid), depth + 1)]);
    return { currency: a.currency || b.currency, transactions: [...a.transactions, ...b.transactions] };
  }
  const json = msg.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return BankSchema.parse(JSON.parse(json));
}

export async function readBankWithClaude(text: string): Promise<BankTxn[]> {
  const parts = await Promise.all(chunks(text).map((c) => readChunk(c)));
  const out: BankTxn[] = [];
  for (const part of parts) {
    const currency = (part.currency || "KES").toUpperCase().replace("KSH", "KES");
    for (const t of part.transactions) {
      const at = new Date(`${t.date}T09:00:00Z`);
      if (isNaN(at.getTime()) || !(t.amount > 0)) continue;
      const payee = findKnownService(t.description)?.name ?? (t.payee.trim() ? displayName(t.payee) : cleanPayee(t.description));
      out.push(txn(at, t.description, payee, Math.abs(t.amount), currency));
    }
  }
  return withRefs(out);
}

/** Debits from a bank statement, using Claude when available. */
export async function readBankStatement(text: string): Promise<{ txns: BankTxn[]; reader: "claude" | "rules" }> {
  if (hasClaude()) {
    try {
      const txns = await readBankWithClaude(text);
      if (txns.length > 0) return { txns, reader: "claude" };
    } catch (err) {
      if (err instanceof Anthropic.RateLimitError) throw err;
      console.error("[bank] Claude failed, using rules", err);
    }
  }
  return { txns: readBankWithRules(text), reader: "rules" };
}

export function findBankRecurring(txns: BankTxn[]): BankRecurring[] {
  return detectRecurring(txns, {
    key: (t) => `${t.currency}:${serviceKey(t.payee)}`,
    amount: (t) => t.amount,
    at: (t) => t.at,
  }).map((g) => ({
    serviceName: g.items[g.items.length - 1].payee,
    serviceKey: serviceKey(g.items[0].payee),
    cycle: g.cycle,
    txns: g.items,
    confidence: g.confidence,
  }));
}
