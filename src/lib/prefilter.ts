import type { EmailInput } from "./extract";

// Cheap checks that run before an email is sent to Claude, so a scan does not
// pay to read newsletters, sign-in alerts and other noise.

const CODES = "KES|KSh|Ksh|KSH|USD|EUR|GBP|NGN|UGX|TZS|RWF|ZAR|INR|CAD|AUD|NZD|JPY|CHF|SEK|NOK|DKK|AED|SGD";
const SYMBOLS = "US\\$|A\\$|C\\$|NZ\\$|\\$|€|£|₦|₹|¥";
const NUMBER = "\\d[\\d,]*(?:\\.\\d{1,2})?";

/** A price written with a currency: "$9.99", "KES 1,200", "1,200.00 USD". */
export const MONEY_RE = new RegExp(
  `(?:(?:${SYMBOLS})\\s?${NUMBER})|(?:\\b(?:${CODES})\\.?\\s?${NUMBER})|(?:${NUMBER}\\s?(?:${CODES})\\b)`,
);

/** True if the subject or body names an amount of money. Emails without one cannot give us a charge. */
export function mentionsMoney(email: Pick<EmailInput, "subject" | "body">) {
  return MONEY_RE.test(email.subject) || MONEY_RE.test(email.body);
}

export const MAX_BODY_CHARS = 4000;
const HEAD_CHARS = 3400;
const WINDOW = 300;

/**
 * Shortens an email body for Claude: drops links and repeated blank space,
 * then keeps the start of the email. If the first amount of money appears
 * after the part kept, the text around it is kept too.
 */
export function trimBody(body: string, max = MAX_BODY_CHARS) {
  const clean = body
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
  if (clean.length <= max) return clean;
  const head = clean.slice(0, HEAD_CHARS);
  if (MONEY_RE.test(head)) return head;
  const at = clean.search(MONEY_RE);
  if (at < 0) return head;
  return `${head}\n[...]\n${clean.slice(Math.max(HEAD_CHARS, at - WINDOW), at + WINDOW)}`;
}
