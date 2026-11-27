import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { ServiceLogo } from "@/components/ServiceLogo";
import { EditToggle, SubscriptionForm } from "@/components/SubscriptionEditor";
import { fmtDate, isoDay } from "@/lib/dates";
import { prisma } from "@/lib/db";
import { formatMoney } from "@/lib/money";
import { brandColor } from "@/lib/services";
import { confirmAll, setStatus } from "../../actions";

const SOURCE_LABEL: Record<string, string> = { email: "Email", mpesa: "M-Pesa", bank: "Bank", manual: "Manual" };
const CYCLE: Record<string, string> = { weekly: "/wk", monthly: "/mo", quarterly: "/qtr", yearly: "/yr" };
// Below this a found subscription gets an "unsure" tag, to look at closely.
const UNSURE = 0.7;

function load(userId: string) {
  return prisma.subscription.findMany({
    where: { userId },
    include: { charges: { orderBy: { chargedAt: "desc" }, take: 4 }, _count: { select: { charges: true } } },
    orderBy: [{ confidence: "desc" }, { name: "asc" }],
  });
}

type Sub = Awaited<ReturnType<typeof load>>[number];

const quiet = "rounded-lg px-2.5 py-1 text-xs font-bold text-ink-2 hover:bg-surface-2 hover:text-ink";

function Row({ s }: { s: Sub }) {
  const sources = s.sources.map((x) => SOURCE_LABEL[x] ?? x).join(" + ");
  return (
    <li className="px-4 py-3 sm:px-5">
      <div className="flex items-center gap-3">
        <ServiceLogo name={s.name} color={brandColor(s.key)} domain={s.domain} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="truncate font-bold">{s.name}</h3>
            {s.possiblyCancelled && <span className="chip border-warn text-warn">maybe cancelled</span>}
            {!s.manual && s.status === "detected" && s.confidence < UNSURE && <span className="chip bg-sun">unsure</span>}
          </div>
          <p className="truncate text-xs text-ink-2">
            {s.nextRenewalAt ? `Next ${fmtDate(s.nextRenewalAt, { day: "numeric", month: "short" })}` : "No renewal date"}
            {sources && ` · ${sources}`}
          </p>
        </div>
        <p className="shrink-0 text-right font-display font-bold tabular-nums">
          {formatMoney(s.amount, s.currency)}
          <span className="text-xs font-semibold text-ink-2">{CYCLE[s.cycle] ?? ""}</span>
        </p>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1 sm:pl-[3.25rem]">
        {s.status !== "confirmed" && (
          <form action={setStatus.bind(null, s.id, "confirmed")}>
            <button className="btn btn-primary px-3 py-1 text-xs">{s.status === "dismissed" ? "Restore" : "✓ Confirm"}</button>
          </form>
        )}
        <EditToggle
          className={quiet}
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
            <button className={quiet}>{s.status === "confirmed" ? "Remove" : "Not a subscription"}</button>
          </form>
        )}
        {s.charges.length > 0 && (
          <details className="group w-full text-xs sm:ml-auto sm:w-auto">
            <summary className={`${quiet} inline-block cursor-pointer list-none`}>
              {s._count.charges} charge{s._count.charges === 1 ? "" : "s"}{" "}
              <span className="inline-block transition group-open:rotate-180">▾</span>
            </summary>
            <ul className="mt-1 space-y-1 rounded-xl border-2 border-edge bg-surface p-2 sm:w-[26rem]">
              {s.charges.map((c) => (
                <li key={c.id} className="flex justify-between gap-3 px-1 py-0.5">
                  <span className="truncate text-ink-2">{c.snippet?.split("\n")[0] || SOURCE_LABEL[c.source]}</span>
                  <span className="shrink-0 tabular-nums">
                    {fmtDate(c.chargedAt, { day: "numeric", month: "short", year: "2-digit" })} · {formatMoney(c.amount, c.currency)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </li>
  );
}

function List({ items }: { items: Sub[] }) {
  return (
    <ul className="divide-y-2 divide-line">
      {items.map((s) => (
        <Row key={s.id} s={s} />
      ))}
    </ul>
  );
}

const chevron = <span className="text-sm font-bold text-ink-2 transition group-open:rotate-180">▾</span>;

function Folded({ title, hint, items }: { title: string; hint?: string; items: Sub[] }) {
  if (items.length === 0) return null;
  return (
    <details className="card group">
      <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
        <span className="font-display text-lg font-bold">
          {title} <span className="text-ink-2">{items.length}</span>
        </span>
        {chevron}
      </summary>
      {hint && <p className="-mt-2 px-5 pb-3 text-sm text-ink-2">{hint}</p>}
      <div className="border-t-2 border-line">
        <List items={items} />
      </div>
    </details>
  );
}

export default async function Review() {
  const user = await requireUser();
  if (!user) redirect("/");
  const subs = await load(user.id);
  const toReview = subs.filter((s) => s.status === "detected");
  const confirmed = subs.filter((s) => s.status === "confirmed");
  const dismissed = subs.filter((s) => s.status === "dismissed");

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Review</h1>
        <p className="text-ink-2">
          {toReview.length
            ? `Tally found ${toReview.length} subscription${toReview.length === 1 ? "" : "s"}. Confirm the right ones, fix or drop the rest.`
            : "All caught up. Anything new Tally finds will show up here."}
        </p>
      </div>

      {toReview.length > 0 && (
        <section className="card">
          <div className="flex items-center justify-between gap-3 border-b-2 border-line px-5 py-3">
            <h2 className="font-display text-lg font-bold">
              To review <span className="text-ink-2">{toReview.length}</span>
            </h2>
            {toReview.length > 1 && (
              <form action={confirmAll}>
                <button className="btn btn-ghost px-3 py-1 text-xs">Confirm all</button>
              </form>
            )}
          </div>
          <List items={toReview} />
        </section>
      )}

      <Folded title="Confirmed" items={confirmed} />
      <Folded title="Dismissed" hint="Not counted anywhere. Restore one if we got it wrong." items={dismissed} />

      <details className="card group">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4">
          <span>
            <span className="font-display text-lg font-bold">+ Add one we missed</span>
            <span className="ml-2 text-sm text-ink-2">cash, card or no receipt</span>
          </span>
          {chevron}
        </summary>
        <div className="border-t-2 border-line p-5">
          <SubscriptionForm mode="add" initial={{ name: "", amount: "", currency: "KES", cycle: "monthly", nextRenewalAt: "" }} />
        </div>
      </details>
    </div>
  );
}
