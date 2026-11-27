import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { trimBody } from "./prefilter";

// What we pull out of a single billing email.
export const ExtractionSchema = z.object({
  is_subscription_charge: z
    .boolean()
    .describe("True only if this email confirms a payment, invoice or upcoming renewal for a recurring subscription."),
  service_name: z
    .string()
    .describe(
      "The brand or product being paid for, as the person would name it: 'Netflix', 'Supabase', 'Namecheap'. Not the sender or team ('Supabase Billing Team'), and no plan, domain or account details. Empty if none.",
    ),
  amount: z.number().describe("Amount charged, as a plain number. 0 if unknown."),
  currency: z.string().describe("ISO 4217 code, e.g. KES, USD. Use KES for 'Ksh' or 'KSh'."),
  plan: z.string().describe("Plan, tier or what is renewed, e.g. 'Pro', 'Premium Family', 'Domain: example.org'. Empty if not stated."),
  charge_date: z.string().describe("Date of the charge or renewal in YYYY-MM-DD."),
  billing_cycle: z.enum(["weekly", "monthly", "quarterly", "yearly", "unknown"]),
  confidence: z.number().describe("0 to 1: how sure you are about the fields above."),
});

export type Extraction = z.infer<typeof ExtractionSchema>;

export type EmailInput = {
  id: string;
  from: string;
  subject: string;
  date: string; // ISO
  body: string;
};

export const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const SYSTEM = `You read one email at a time from a person's inbox and extract subscription billing details.
Only mark is_subscription_charge true for recurring services (streaming, music, apps, cloud storage, SaaS, gyms, internet, TV).
One-off purchases, shipping notices, marketing, and password resets are not subscription charges.
If the email announces an upcoming renewal, use the renewal date as charge_date.
If the email has no explicit date, use the email's sent date.`;

let client: Anthropic | null = null;
export function anthropic() {
  client ??= new Anthropic();
  return client;
}

export function hasClaude() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export type Usage = { inputTokens: number; outputTokens: number };

/** Claude cannot be used at all right now (no credits, bad key, no access). Retrying will not help. */
export class ClaudeUnavailableError extends Error {}

function unavailable(err: unknown): string | null {
  if (err instanceof Anthropic.AuthenticationError) return "The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.";
  if (err instanceof Anthropic.PermissionDeniedError) return "This Anthropic API key cannot use the extraction model.";
  if (err instanceof Anthropic.BadRequestError && /credit balance/i.test(err.message)) {
    return "Your Anthropic credit balance ran out, so the scan stopped. Emails already read are kept. Add credits and scan again.";
  }
  return null;
}

export async function extractWithClaude(email: EmailInput): Promise<{ x: Extraction | null; usage: Usage }> {
  const response = await anthropic().beta.messages.parse({
    model: MODEL,
    max_tokens: 4000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low", format: betaZodOutputFormat(ExtractionSchema) },
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: `From: ${email.from}\nSubject: ${email.subject}\nSent: ${email.date}\n\n${trimBody(email.body)}`,
      },
    ],
  });
  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  if (response.stop_reason === "refusal") return { x: null, usage };
  return { x: response.parsed_output ?? null, usage };
}

// ---------------------------------------------------------------------------
// Rule-based fallback, used in demo mode or when no ANTHROPIC_API_KEY is set.
// Good enough for the fixture emails; Claude does the real work.
// ---------------------------------------------------------------------------

const MONEY = /(KES|KSh|Ksh|USD|US\$|\$|EUR|€|GBP|£)\s?([0-9][0-9,]*(?:\.[0-9]{1,2})?)/;
const CURRENCY_MAP: Record<string, string> = {
  KES: "KES", KSH: "KES", USD: "USD", "US$": "USD", $: "USD", EUR: "EUR", "€": "EUR", GBP: "GBP", "£": "GBP",
};

export function extractWithRules(email: EmailInput): Extraction {
  const text = `${email.subject}\n${email.body}`;
  const lower = text.toLowerCase();
  const recurring = /(subscription|renew|membership|plan|premium|monthly|annual|yearly|per month|\/mo)/.test(lower);
  const billing = /(receipt|invoice|payment|charged|billed|renew)/.test(lower);
  const notBilling = /(password|shipped|delivery|newsletter|% off|sale ends)/.test(lower);
  const m = text.match(MONEY);

  const fromName = email.from.replace(/<.*>/, "").replace(/"/g, "").trim();
  const service =
    text.match(/Item:\s*([^\n(]+)/)?.[1] ??
    text.match(/(?:subscription to|membership to|your)\s+([A-Z][\w+ ]{2,30}?)\s+(?:subscription|membership|plan|premium)/)?.[1] ??
    fromName;

  let cycle: Extraction["billing_cycle"] = "unknown";
  if (/(annual|yearly|per year|\/yr|12 months)/.test(lower)) cycle = "yearly";
  else if (/(monthly|per month|\/mo|every month)/.test(lower)) cycle = "monthly";
  else if (/(weekly|per week)/.test(lower)) cycle = "weekly";

  const plan = text.match(/plan:\s*([^\n]+)/i)?.[1]?.trim() ?? "";
  const dated = text.match(/(20\d\d-\d\d-\d\d)/)?.[1];

  const ok = recurring && billing && !notBilling && Boolean(m);
  return {
    is_subscription_charge: ok,
    service_name: ok ? service.trim() : "",
    amount: m ? Number(m[2].replace(/,/g, "")) : 0,
    currency: m ? CURRENCY_MAP[m[1].toUpperCase()] ?? "KES" : "KES",
    plan,
    charge_date: dated ?? email.date.slice(0, 10),
    billing_cycle: cycle,
    confidence: ok ? 0.75 : 0.2,
  };
}

export type ExtractResult = { x: Extraction | null; by: "claude" | "rules"; usage: Usage };

/**
 * Claude when a key is set, the rules otherwise. If Claude cannot be used at
 * all (no credits, bad key), this throws instead of quietly using the rules,
 * so a scan stops rather than filling up with worse results.
 */
export async function extract(email: EmailInput): Promise<ExtractResult> {
  const none = { inputTokens: 0, outputTokens: 0 };
  if (hasClaude()) {
    try {
      return { ...(await extractWithClaude(email)), by: "claude" };
    } catch (err) {
      const reason = unavailable(err);
      if (reason) throw new ClaudeUnavailableError(reason);
      if (err instanceof Anthropic.RateLimitError) throw err;
      // A one-off failure on this email: the rules are better than nothing.
      console.error(`[extract] Claude failed for ${email.id}, using rules`, err);
      return { x: extractWithRules(email), by: "rules", usage: none };
    }
  }
  return { x: extractWithRules(email), by: "rules", usage: none };
}

// Price per million tokens, input and output, for the cost shown after a scan.
const PRICES: Record<string, [number, number]> = {
  "claude-opus-5-5": [4, 20],
  "claude-sonnet-5-5": [2, 10],
  "claude-haiku-5-5": [0.1, 0.5],
};

/** Approximate cost in US dollars, or null for a model we have no price for. */
export function costUsd(usage: Usage, model = MODEL): number | null {
  const p = PRICES[model];
  return p ? (usage.inputTokens * p[0] + usage.outputTokens * p[1]) / 1_000_000 : null;
}
