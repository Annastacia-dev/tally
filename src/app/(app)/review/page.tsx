import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { ServiceLogo } from "@/components/ServiceLogo";
import { EditToggle, SubscriptionForm } from "@/components/SubscriptionEditor";
import { fmtDate, isoDay } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { brandColor } from "@/lib/services";
import { confirmAll, setStatus } from "../../actions";

const SOURCE_LABEL: Record<string, string> = { email: "📧 Email", mpesa: "📱 M-Pesa", bank: "🏦 Bank", manual: "✍️ Manual" };

export default async function Review() {
  const user = await requireUser();
  if (!user) redirect("/");
  const subs = await prisma.subscription.findMany({
    where: { userId: user.id },
    include: { charges: { orderBy: { chargedAt: "desc" }, take: 4 }, _count: { select: { charges: true } } },
    orderBy: [{ confidence: "desc" }, { name: "asc" }],
  });

  const groups = [
    { title: "To review", hint: "Found automatically. Confirm what is right, fix what is not.", items: subs.filter((s) => s.status === "detected") },
    { title: "Confirmed", hint: "", items: subs.filter((s) => s.status === "confirmed") },
    { title: "Dismissed", hint: "Not counted anywhere. Restore if we got it wrong.", items: subs.filter((s) => s.status === "dismissed") },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold">Review</h1>
          <p className="text-ink-2">Check what Tally found, and add anything it missed.</p>
        </div>
        {groups[0].items.length > 1 && (
          <form action={confirmAll}>
            <button className="btn btn-primary">Confirm all {groups[0].items.length}</button>
          </form>
        )}
      </div>

      {groups.map((g) =>
        g.items.length === 0 ? null : (
          <section key={g.title}>
            <h2 className="font-display text-lg font-bold">
              {g.title} <span className="text-ink-2">{g.items.length}</span>
            </h2>
            {g.hint && <p className="mb-3 text-sm text-ink-2">{g.hint}</p>}
            <ul className="space-y-3">
              {g.items.map((s) => (
                <li key={s.id} className={`card p-4 ${s.status === "dismissed" ? "opacity-60" : ""}`}>
                  <div className="flex flex-wrap items-center gap-3">
                    <ServiceLogo name={s.name} color={brandColor(s.key)} domain={s.domain} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <h3 className="font-semibold">{s.name}</h3>
                        {s.possiblyCancelled && <span className="chip bg-warn/15 text-warn">possibly cancelled</span>}
                        {!s.manual && (
                          <span className="chip" title="How sure we are">
                            {Math.round(s.confidence * 100)}% sure
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-ink-2">
                        <b className="text-ink">{formatMoney(s.amount, s.currency)}</b> {s.cycle === "unknown" ? "(cycle unknown)" : s.cycle}
                        {s.nextRenewalAt && <> · next {fmtDate(s.nextRenewalAt, { day: "numeric", month: "short", year: "numeric" })}</>}
                      </p>
                    </div>
                    <div className="flex w-full gap-2 sm:w-auto">
                      {s.status !== "confirmed" && (
                        <form action={setStatus.bind(null, s.id, "confirmed")} className="flex-1 sm:flex-none">
                          <button className="btn btn-primary w-full px-3 py-1.5 text-xs">{s.status === "dismissed" ? "Restore" : "Confirm"}</button>
                        </form>
                      )}
                      <EditToggle
                        initial={{
                          id: s.id,
                          name: s.name,
                          amount: s.amount,
                          currency: s.currency,
                          cycle: s.cycle,
                          nextRenewalAt: s.nextRenewalAt ? isoDay(s.nextRenewalAt) : "",
                        }}
                      />
                      {s.status !== "dismissed" && (
                        <form action={setStatus.bind(null, s.id, "dismissed")}>
                          <button className="btn btn-ghost px-3 py-1.5 text-xs">Dismiss</button>
                        </form>
                      )}
                    </div>
                  </div>
                  {s.charges.length > 0 && (
                    <details className="mt-3 text-sm">
                      <summary className="cursor-pointer select-none text-xs font-semibold text-ink-2">
                        Evidence: {s._count.charges} charge{s._count.charges === 1 ? "" : "s"} from {s.sources.map((x) => SOURCE_LABEL[x] ?? x).join(", ")}
                      </summary>
                      <ul className="mt-2 space-y-1">
                        {s.charges.map((c) => (
                          <li key={c.id} className="flex justify-between gap-3 rounded-xl bg-surface-2 px-3 py-1.5 text-xs">
                            <span className="truncate">
                              {SOURCE_LABEL[c.source]} · {c.snippet?.split("\n")[0]}
                            </span>
                            <span className="shrink-0 tabular-nums">
                              {fmtDate(c.chargedAt)} · {formatMoney(c.amount, c.currency)}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          </section>
        ),
      )}

      <section className="card p-5">
        <h2 className="font-display text-lg font-bold">Add one we missed</h2>
        <p className="mb-4 text-sm text-ink-2">Cash, card or anything without a receipt.</p>
        <SubscriptionForm mode="add" initial={{ name: "", amount: "", currency: "KES", cycle: "monthly", nextRenewalAt: "" }} />
      </section>
    </div>
  );
}
