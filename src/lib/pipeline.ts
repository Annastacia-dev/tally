import { prisma } from "./db";
import { addCycle, inferSubscription, type Cycle } from "./cycles";
import { extract, type EmailInput } from "./extract";
import { findBankRecurring, readBankStatement } from "./bank";
import { findRecurring, parseStatementText, pdfToText } from "./mpesa";
import { displayName, serviceKey, serviceMeta } from "./services";

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

/**
 * Load each email, run extraction and store the subscription charges we find.
 * Emails are loaded and extracted a few at a time, so a scan that stops part
 * way (for example on a Gmail rate limit) keeps what it already found.
 */
export async function ingestEmails(userId: string, scanId: string, ids: string[], load: (id: string) => Promise<EmailInput>) {
  // Skip emails we already stored a charge for, before spending quota on them.
  const seen = new Set(
    (await prisma.charge.findMany({ where: { userId, source: "email" }, select: { sourceRef: true } })).map((c) => c.sourceRef),
  );
  const todo = ids.filter((id) => !seen.has(id));
  await prisma.scan.update({ where: { id: scanId }, data: { found: ids.length } });

  let processed = ids.length - todo.length;
  let stored = 0;
  try {
    await mapLimit(todo, 4, async (id) => {
      const email = await load(id);
      const x = await extract(email);
    processed++;
    if (processed % 5 === 0) await prisma.scan.update({ where: { id: scanId }, data: { processed } });
    if (!x || !x.is_subscription_charge || !x.service_name || x.amount <= 0 || x.confidence < MIN_CONFIDENCE) return;

    const chargedAt = new Date(x.charge_date);
    await prisma.charge.create({
      data: {
        userId,
        source: "email",
        sourceRef: email.id,
        serviceName: displayName(x.service_name),
        serviceKey: serviceKey(x.service_name),
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
    await prisma.scan.update({ where: { id: scanId }, data: { processed } });
    if (stored > 0) await rebuildSubscriptions(userId);
  }

  await prisma.scan.update({ where: { id: scanId }, data: { status: "done", finishedAt: new Date() } });
  if (stored === 0) await rebuildSubscriptions(userId);
  return { emails: ids.length, newCharges: stored };
}

export type StatementResult = {
  kind: "mpesa" | "bank";
  reader: "mpesa" | "claude" | "rules";
  transactions: number;
  recurring: number;
  newCharges: number;
};

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
export async function ingestStatement(userId: string, pdf: Uint8Array): Promise<StatementResult> {
  const text = await pdfToText(pdf);

  // M-Pesa statements have a fixed layout we can parse exactly.
  const mpesa = parseStatementText(text);
  if (mpesa.length > 0) {
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
    return { kind: "mpesa", reader: "mpesa", transactions: mpesa.length, recurring: recurring.length, newCharges };
  }

  const { txns, reader } = await readBankStatement(text);
  if (txns.length === 0) {
    throw new Error("No transactions found. Upload a full M-Pesa statement or a bank statement PDF.");
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
  return { kind: "bank", reader, transactions: txns.length, recurring: recurring.length, newCharges };
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
