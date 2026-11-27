import { prisma } from "./db";
import { addCycle, inferSubscription, type Cycle } from "./cycles";
import { extract, hasClaude, type EmailInput } from "./extract";
import { findBankRecurring, readBankStatement } from "./bank";
import { counterpartyOf, findRecurring, parseStatementText, pdfToText } from "./mpesa";
import { mentionsMoney } from "./prefilter";
import { cleanServiceName, displayName, serviceKey, serviceMeta } from "./services";

// Glue between sources (email, M-Pesa, bank) and the Subscription table.

const MIN_CONFIDENCE = 0.5;

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        try {
          out[i] = await fn(items[i]);
        } catch (err) {
          next = items.length; // stop the other workers picking up new items
          throw err;
        }
      }
    }),
  );
  return out;
}

/** Emails already read for this user: stored charges plus everything a scan has read. */
export async function alreadyRead(userId: string) {
  const [charges, read] = await Promise.all([
    prisma.charge.findMany({ where: { userId, source: "email" }, select: { sourceRef: true } }),
    prisma.readEmail.findMany({ where: { userId }, select: { messageId: true } }),
  ]);
  return new Set([...charges.map((c) => c.sourceRef), ...read.map((r) => r.messageId)]);
}

/**
 * Load each email, run extraction and store the subscription charges we find.
 * Emails are loaded and extracted a few at a time, so a scan that stops part
 * way (for example on a Gmail rate limit) keeps what it already found.
 */
export async function ingestEmails(userId: string, scanId: string, ids: string[], load: (id: string) => Promise<EmailInput>) {
  // Skip emails read in earlier scans, before spending quota on them.
  const seen = await alreadyRead(userId);
  const todo = ids.filter((id) => !seen.has(id));
  await prisma.scan.update({ where: { id: scanId }, data: { found: ids.length } });

  let processed = ids.length - todo.length;
  let stored = 0;
  let skipped = 0;
  let purchases = 0;
  const tokens = { inputTokens: 0, outputTokens: 0 };
  try {
    await mapLimit(todo, 4, async (id) => {
      const email = await load(id);
      // No amount of money means no charge to find: do not pay Claude to read it.
      if (!mentionsMoney(email)) {
        await prisma.readEmail.createMany({ data: [{ userId, messageId: id }], skipDuplicates: true });
        skipped++;
        processed++;
        return;
      }
      const { x, by, usage } = await extract(email);
      tokens.inputTokens += usage.inputTokens;
      tokens.outputTokens += usage.outputTokens;
      // Only count an email as read once Claude has read it (or when Claude is
      // not set up), so a fallback result is retried by a later scan.
      if (by === "claude" || !hasClaude()) {
        await prisma.readEmail.createMany({ data: [{ userId, messageId: id }], skipDuplicates: true });
      }
    processed++;
    if (processed % 5 === 0) await prisma.scan.update({ where: { id: scanId }, data: { processed, ...tokens } });
    if (!x || !x.service_name || x.amount <= 0 || x.confidence < MIN_CONFIDENCE) return;
    const chargedAt = new Date(x.charge_date);
    if (!x.is_subscription_charge) {
      if (!x.is_one_off_purchase) return;
      const merchant = displayName(cleanServiceName(x.service_name));
      await prisma.purchase.createMany({
        data: [
          {
            userId,
            source: "email",
            sourceRef: email.id,
            merchant,
            merchantKey: serviceKey(merchant),
            item: x.plan || null,
            amount: x.amount,
            currency: x.currency.toUpperCase(),
            at: isNaN(chargedAt.getTime()) ? new Date(email.date) : chargedAt,
            snippet: `${email.subject}\n${email.body.slice(0, 400)}`,
          },
        ],
        skipDuplicates: true,
      });
      purchases++;
      return;
    }

    await prisma.charge.create({
      data: {
        userId,
        source: "email",
        sourceRef: email.id,
        serviceName: displayName(cleanServiceName(x.service_name)),
        serviceKey: serviceKey(cleanServiceName(x.service_name)),
        amount: x.amount,
        currency: x.currency.toUpperCase(),
        plan: x.plan || null,
        chargedAt: isNaN(chargedAt.getTime()) ? new Date(email.date) : chargedAt,
        cycleHint: x.billing_cycle,
        confidence: x.confidence,
        snippet: `${email.subject}\n${email.body.slice(0, 400)}`,
      },
    });
    stored++;
    });
  } finally {
    // Keep whatever was found, even if the scan stopped part way.
    await prisma.scan.update({ where: { id: scanId }, data: { processed, ...tokens } });
    if (stored > 0) await rebuildSubscriptions(userId);
  }

  await prisma.scan.update({ where: { id: scanId }, data: { status: "done", finishedAt: new Date() } });
  if (stored === 0) await rebuildSubscriptions(userId);
  return { emails: ids.length, newCharges: stored, purchases, skipped, ...tokens };
}

export type StatementResult = {
  kind: "mpesa" | "bank";
  reader: "mpesa" | "claude" | "rules";
  transactions: number;
  recurring: number;
  newCharges: number;
  purchases: number;
};

type StatementPurchase = { ref: string; merchant: string; amount: number; currency: string; at: Date; snippet: string };

// Bank rows that are moving money around rather than buying something.
const NOT_A_PURCHASE = /\b(atm|cash withdrawal|transfer|trf|salary|loan|reversal|interest|charges?|fee|tax|levy)\b/i;

/** One-off payments from a statement: everything paid out that is not part of a recurring payment. */
async function storePurchases(userId: string, source: "mpesa" | "bank", rows: StatementPurchase[]) {
  if (rows.length === 0) return 0;
  const res = await prisma.purchase.createMany({
    data: rows.map((r) => {
      const merchant = displayName(cleanServiceName(r.merchant));
      return {
        userId,
        source,
        sourceRef: r.ref,
        merchant,
        merchantKey: serviceKey(merchant),
        amount: r.amount,
        currency: r.currency,
        at: r.at,
        snippet: r.snippet,
      };
    }),
    skipDuplicates: true,
  });
  return res.count;
}

type StatementCharge = {
  ref: string;
  serviceName: string;
  serviceKey: string;
  amount: number;
  currency: string;
  at: Date;
  cycle: string;
  confidence: number;
  snippet: string;
};

/** Read an M-Pesa or bank statement PDF and store charges for recurring payments. */
export async function ingestStatement(userId: string, pdf: Uint8Array, kind: "mpesa" | "bank"): Promise<StatementResult> {
  const text = await pdfToText(pdf);

  // M-Pesa statements have a fixed layout we can parse exactly.
  const mpesa = parseStatementText(text);
  if (kind === "mpesa" && mpesa.length === 0) {
    throw new Error("This does not look like an M-Pesa statement. If it is from a bank or card, upload it under Bank or card statement.");
  }
  if (kind === "bank" && mpesa.length > 0) {
    throw new Error("This is an M-Pesa statement. Upload it under M-Pesa statement instead.");
  }
  if (kind === "mpesa") {
    const recurring = findRecurring(mpesa);
    const charges = recurring.flatMap((r) =>
      r.txns.map((t) => ({
        ref: t.receipt,
        serviceName: r.serviceName,
        serviceKey: r.serviceKey,
        amount: t.withdrawn,
        currency: "KES",
        at: t.at,
        cycle: r.cycle,
        confidence: r.confidence,
        snippet: t.details,
      })),
    );
    const newCharges = await storeCharges(userId, "mpesa", charges);
    // Paybill and till payments that do not repeat. Money sent to people is left out.
    const inRecurring = new Set(recurring.flatMap((r) => r.txns.map((t) => t.receipt)));
    const purchases = await storePurchases(
      userId,
      "mpesa",
      mpesa.flatMap((t) => {
        const cp = t.status === "Completed" && t.withdrawn > 0 && !inRecurring.has(t.receipt) ? counterpartyOf(t.details) : null;
        return cp ? [{ ref: t.receipt, merchant: cp.name, amount: t.withdrawn, currency: "KES", at: t.at, snippet: t.details }] : [];
      }),
    );
    return { kind: "mpesa", reader: "mpesa", transactions: mpesa.length, recurring: recurring.length, newCharges, purchases };
  }

  const { txns, reader } = await readBankStatement(text);
  if (txns.length === 0) {
    throw new Error("No transactions found. Upload a full bank or card statement PDF covering at least three months.");
  }
  const recurring = findBankRecurring(txns);
  const charges = recurring.flatMap((r) =>
    r.txns.map((t) => ({
      ref: t.ref,
      serviceName: r.serviceName,
      serviceKey: r.serviceKey,
      amount: t.amount,
      currency: t.currency,
      at: t.at,
      cycle: r.cycle,
      confidence: r.confidence,
      snippet: t.description,
    })),
  );
  const newCharges = await storeCharges(userId, "bank", charges);
  const inRecurring = new Set(recurring.flatMap((r) => r.txns.map((t) => t.ref)));
  const purchases = await storePurchases(
    userId,
    "bank",
    txns
      .filter((t) => !inRecurring.has(t.ref) && !NOT_A_PURCHASE.test(t.description))
      .map((t) => ({ ref: t.ref, merchant: t.payee, amount: t.amount, currency: t.currency, at: t.at, snippet: t.description })),
  );
  return { kind: "bank", reader, transactions: txns.length, recurring: recurring.length, newCharges, purchases };
}

async function storeCharges(userId: string, source: "mpesa" | "bank", charges: StatementCharge[]) {
  const seen = new Set(
    (await prisma.charge.findMany({ where: { userId, source }, select: { sourceRef: true } })).map((c) => c.sourceRef),
  );
  const fresh = charges.filter((c) => !seen.has(c.ref) && seen.add(c.ref));
  // One round trip instead of one per row: statements can hold dozens of charges.
  await prisma.charge.createMany({
    data: fresh.map((c) => ({
      userId,
      source,
      sourceRef: c.ref,
      serviceName: c.serviceName,
      serviceKey: c.serviceKey,
      amount: c.amount,
      currency: c.currency,
      chargedAt: c.at,
      cycleHint: c.cycle,
      confidence: c.confidence,
      snippet: c.snippet,
    })),
  });
  await rebuildSubscriptions(userId);
  return fresh.length;
}

/** Re-derive every subscription from its charges. Keeps user edits and decisions. */
export async function rebuildSubscriptions(userId: string, now = new Date()) {
  const charges = await prisma.charge.findMany({ where: { userId }, orderBy: { chargedAt: "asc" } });
  const byKey = new Map<string, typeof charges>();
  for (const c of charges) {
    const list = byKey.get(c.serviceKey) ?? [];
    list.push(c);
    byKey.set(c.serviceKey, list);
  }

  for (const [key, list] of byKey) {
    const inferred = inferSubscription(list, now);
    if (!inferred) continue;
    const existing = await prisma.subscription.findUnique({ where: { userId_key: { userId, key } } });
    const meta = serviceMeta(key);
    const sources = [...new Set(list.map((c) => c.source))];
    const latestName = list[list.length - 1].serviceName;

    const derived = {
      lastChargedAt: inferred.lastChargedAt,
      possiblyCancelled: inferred.possiblyCancelled,
      sources,
      confidence: inferred.confidence,
    };

    let sub;
    if (existing) {
      // If the user edited the price or cycle, keep their values and only
      // move the renewal date forward from the latest charge.
      const cycle = existing.edited ? existing.cycle : inferred.cycle;
      sub = await prisma.subscription.update({
        where: { id: existing.id },
        data: {
          ...derived,
          ...(existing.edited
            ? {}
            : { amount: inferred.amount, currency: inferred.currency, cycle, plan: inferred.plan, name: latestName }),
          nextRenewalAt: existing.edited
            ? addCycle(inferred.lastChargedAt, cycle as Cycle)
            : inferred.nextRenewalAt,
        },
      });
    } else {
      sub = await prisma.subscription.create({
        data: {
          userId,
          key,
          name: latestName,
          amount: inferred.amount,
          currency: inferred.currency,
          cycle: inferred.cycle,
          plan: inferred.plan,
          nextRenewalAt: inferred.nextRenewalAt,
          domain: meta.domain,
          category: meta.category,
          ...derived,
        },
      });
    }
    await prisma.charge.updateMany({ where: { userId, serviceKey: key }, data: { subscriptionId: sub.id } });
  }
}
