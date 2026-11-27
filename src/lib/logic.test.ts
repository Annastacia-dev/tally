import { describe, expect, it } from "vitest";
import { addCycle, cycleFromGap, inferSubscription } from "./cycles";
import { extractWithRules } from "./extract";
import { cleanPayee, findBankRecurring, readBankWithRules } from "./bank";
import { counterpartyOf, findRecurring, parseStatementText, pdfToText } from "./mpesa";
import { sampleBankRows, sampleBankStatementPdf } from "@/fixtures/bank-statement";
import { parseSender } from "./reminders";
import { serviceKey } from "./services";
import { fixtureEmails } from "@/fixtures/emails";

const NOW = new Date("2026-11-27T09:00:00Z");
const ago = (d: number) => new Date(NOW.getTime() - d * 86_400_000);

describe("cycle inference", () => {
  it("maps gaps to cycles", () => {
    expect(cycleFromGap(30)).toBe("monthly");
    expect(cycleFromGap(365)).toBe("yearly");
    expect(cycleFromGap(7)).toBe("weekly");
    expect(cycleFromGap(50)).toBe("unknown");
  });

  it("adds calendar months", () => {
    expect(addCycle(new Date("2026-01-15T00:00:00Z"), "monthly").toISOString().slice(0, 10)).toBe("2026-02-15");
  });

  it("infers a monthly subscription and its next renewal", () => {
    const r = inferSubscription([10, 40, 70].map((d) => ({ amount: 1100, currency: "KES", chargedAt: ago(d) })), NOW)!;
    expect(r.cycle).toBe("monthly");
    expect(r.possiblyCancelled).toBe(false);
    expect(r.nextRenewalAt!.getTime()).toBeGreaterThan(NOW.getTime());
  });

  it("flags possibly cancelled when a charge is overdue", () => {
    const r = inferSubscription([95, 125, 155].map((d) => ({ amount: 14.99, currency: "USD", chargedAt: ago(d) })), NOW)!;
    expect(r.possiblyCancelled).toBe(true);
  });

  it("uses the receipt's cycle hint for a single charge", () => {
    const r = inferSubscription([{ amount: 59.99, currency: "USD", chargedAt: ago(220), cycleHint: "yearly" }], NOW)!;
    expect(r.cycle).toBe("yearly");
  });

  it("dedupes the same charge seen in email and M-Pesa", () => {
    const r = inferSubscription(
      [
        { amount: 1099, currency: "KES", chargedAt: ago(26) },
        { amount: 1099, currency: "KES", chargedAt: ago(27) },
        { amount: 1099, currency: "KES", chargedAt: ago(56) },
      ],
      NOW,
    )!;
    expect(r.cycle).toBe("monthly");
  });
});

describe("service names", () => {
  it("normalises variants to one key", () => {
    expect(serviceKey("NETFLIX.COM")).toBe("netflix");
    expect(serviceKey("SHOWMAX AFRICA")).toBe("showmax");
    expect(serviceKey("iCloud+ with 50 GB storage")).toBe("apple");
    expect(serviceKey("IRON PARADISE GYM")).toBe("iron-paradise-gym");
  });
});

describe("rule extractor on fixtures", () => {
  const emails = fixtureEmails(NOW);
  it("accepts billing emails and rejects noise", () => {
    const results = emails.map((e) => ({ subject: e.subject, x: extractWithRules(e) }));
    const accepted = results.filter((r) => r.x.is_subscription_charge).map((r) => r.subject);
    expect(accepted).toContain("Your Netflix receipt");
    expect(accepted).not.toContain("Your order has shipped");
    expect(accepted).not.toContain("Reset your password");
    expect(accepted).not.toContain("50% off your next 3 rides");
  });
});

describe("M-Pesa", () => {
  const text = `Receipt No. Completion Time Details Transaction Status Paid In Withdrawn Balance
  TAA1111111 2026-11-01 10:00:00 Pay Bill Online to 444174 - SHOWMAX AFRICA Acc. 0712345678 Completed 0.00 -1,099.00 5,000.00
  TAA1111112 2026-10-02 10:00:00 Pay Bill Online to 444174 - SHOWMAX AFRICA Acc. 0712345678 Completed 0.00 -1,099.00 6,099.00
  TAA1111113 2026-09-01 10:00:00 Pay Bill Online to 444174 - SHOWMAX AFRICA Acc. 0712345678 Completed 0.00 -1,099.00 7,198.00
  TAA1111114 2026-10-15 10:00:00 Merchant Payment to 882211 - JAVA HOUSE Completed 0.00 -870.00 8,000.00
  TAA1111115 2026-10-16 10:00:00 Customer Transfer to 0722 *** 431 JOHN K Completed 0.00 -1,500.00 9,000.00`;

  it("parses rows", () => {
    const rows = parseStatementText(text);
    expect(rows).toHaveLength(5);
    expect(rows[0].withdrawn).toBe(1099);
  });

  it("extracts paybill and till counterparties", () => {
    expect(counterpartyOf("Pay Bill Online to 444174 - SHOWMAX AFRICA Acc. 0712345678")).toMatchObject({ kind: "paybill", number: "444174", account: "0712345678" });
    expect(counterpartyOf("Merchant Payment to 5123987 - IRON PARADISE GYM")).toMatchObject({ kind: "till", name: "IRON PARADISE GYM" });
    expect(counterpartyOf("Customer Transfer to 0722 *** 431 JOHN K")).toBeNull();
  });

  it("finds recurring payments only", () => {
    const rec = findRecurring(parseStatementText(text));
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ serviceKey: "showmax", cycle: "monthly" });
  });
});

describe("bank statements", () => {
  const text = `SAMPLE BANK Opening Balance: 10,000.00
  Txn Date Value Date Narration Debit Credit Balance
  03/09/2026 03/09/2026 POS PURCHASE NETFLIX.COM 866-579-7172 NL 441234******9012 1,293.40 8,706.60
  15/09/2026 15/09/2026 SALARY ACME LTD SEP 50,000.00 58,706.60
  03/10/2026 03/10/2026 POS PURCHASE NETFLIX.COM 866-579-7172 NL 441234******9012 1,301.75 57,404.85
  10/10/2026 10/10/2026 POS PURCHASE NAIVAS WESTLANDS 441234******9012 5,212.00 52,192.85
  02/11/2026 02/11/2026 POS PURCHASE NETFLIX.COM 866-579-7172 NL 441234******9012 1,297.20 50,895.65
  Closing Balance: 50,895.65`;

  it("reads debits from the running balance and skips credits", () => {
    const txns = readBankWithRules(text);
    expect(txns.map((t) => t.amount)).toEqual([1293.4, 1301.75, 5212, 1297.2]);
    expect(txns[0]).toMatchObject({ payee: "Netflix", currency: "KES" });
    expect(txns[0].at.toISOString().slice(0, 10)).toBe("2026-09-03");
  });

  it("cleans card narrations into payee names", () => {
    expect(cleanPayee("CARD PURCHASE SPOTIFY P2F8C1A9E STOCKHOLM 441234******9012")).toBe("Spotify");
    expect(cleanPayee("STANDING ORDER S/O 00231 IRON PARADISE GYM")).toBe("Iron Paradise Gym");
  });

  it("finds recurring card payments", () => {
    const rec = findBankRecurring(readBankWithRules(text));
    expect(rec).toHaveLength(1);
    expect(rec[0]).toMatchObject({ serviceKey: "netflix", cycle: "monthly" });
  });

  it("reads the generated sample bank statement PDF", async () => {
    const pdf = new Uint8Array(await sampleBankStatementPdf());
    const text = await pdfToText(pdf);
    const txns = readBankWithRules(text);
    expect(txns).toHaveLength(sampleBankRows().filter((r) => r.debit).length);
    const keys = findBankRecurring(txns).map((r) => r.serviceKey).sort();
    expect(keys).toEqual(["apple", "iron-paradise-gym", "jubilee-insurance-policy", "netflix", "spotify"].sort());
    // M-Pesa parser must not claim a bank statement.
    expect(parseStatementText(text)).toHaveLength(0);
  });
});

describe("mixed currencies", () => {
  it("keeps a monthly cycle when the same payments appear in USD email and KES bank charges", () => {
    const d = (s: string) => new Date(`${s}T09:00:00Z`);
    const charges = ["2026-08-01", "2026-09-01", "2026-10-01"].flatMap((day, i) => [
      { amount: 9.99, currency: "USD", chargedAt: d(day) },
      { amount: 1290 + i, currency: "KES", chargedAt: d(day.replace(/01$/, "02")) },
    ]);
    expect(inferSubscription(charges, d("2026-10-10"))).toMatchObject({ cycle: "monthly", currency: "KES" });
  });

  it("keeps a monthly cycle when a receipt and its bank charge post days apart", () => {
    const d = (s: string) => new Date(`${s}T09:00:00Z`);
    const charges = ["2026-08-01", "2026-09-01", "2026-10-01"].flatMap((day) => [
      { amount: 1100, currency: "KES", chargedAt: d(day), source: "email" },
      { amount: 1100, currency: "KES", chargedAt: d(day.replace(/01$/, "05")), source: "bank" },
    ]);
    expect(inferSubscription(charges, d("2026-10-10"))).toMatchObject({ cycle: "monthly" });
  });
});

describe("reminder sender", () => {
  it("accepts a display name or a bare address", () => {
    expect(parseSender("Tally <noreply@webcafe.africa>")).toEqual({ name: "Tally", email: "noreply@webcafe.africa" });
    expect(parseSender('"Tally Reminders" <a@b.co>')).toEqual({ name: "Tally Reminders", email: "a@b.co" });
    expect(parseSender("a@b.co")).toEqual({ name: "Tally", email: "a@b.co" });
    expect(parseSender("")).toEqual({ name: "Tally", email: "reminders@example.com" });
  });
});
