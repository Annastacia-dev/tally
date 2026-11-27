import { redirect } from "next/navigation";
import Image from "next/image";
import { withBase } from "@/lib/base-path";
import { auth } from "@/auth";
import { ServiceLogo } from "@/components/ServiceLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { demoEnabled, googleEnabled } from "@/lib/flags";
import { signInDemo, signInGoogle } from "./actions";

// Illustrative data for the hero cards and the product preview. Not real charges.
type Sample = { t: string; d: string; c: string; amount: string; note: string; overdue?: boolean };

const NETFLIX: Sample = { t: "Netflix", d: "netflix.com", c: "#E50914", amount: "KES 1,100", note: "Renews in 3 days" };
const SPOTIFY: Sample = { t: "Spotify", d: "spotify.com", c: "#1DB954", amount: "KES 390", note: "Monthly" };
const SHOWMAX: Sample = { t: "Showmax", d: "showmax.com", c: "#E4007C", amount: "KES 549", note: "Overdue by 2 days", overdue: true };
const YOUTUBE: Sample = { t: "YouTube Premium", d: "youtube.com", c: "#FF0000", amount: "KES 3,000", note: "Yearly" };
const ICLOUD: Sample = { t: "iCloud+", d: "icloud.com", c: "#3693F3", amount: "USD 0.99", note: "Renews 14 Dec" };

// Hero cards sit in a box only slightly wider than the copy, so they hug the headline.
const FLOATERS: { s: Sample; pos: string }[] = [
  { s: NETFLIX, pos: "-left-10 top-[2%] -rotate-6" },
  { s: SPOTIFY, pos: "-right-6 top-[6%] rotate-6" },
  { s: SHOWMAX, pos: "-right-10 bottom-[18%] -rotate-3" },
  { s: YOUTUBE, pos: "-left-12 bottom-[12%] rotate-3" },
];

const PREVIEW: Sample[] = [NETFLIX, SHOWMAX, SPOTIFY, ICLOUD, YOUTUBE];

// Services Tally recognises by sender (see src/lib/services.ts).
const KNOWN = [
  { t: "Netflix", d: "netflix.com", c: "#E50914" },
  { t: "DStv", d: "dstv.com", c: "#0A6BC4" },
  { t: "Spotify", d: "spotify.com", c: "#1DB954" },
  { t: "Safaricom Home Fibre", d: "safaricom.co.ke", c: "#3CB54A" },
  { t: "ChatGPT", d: "openai.com", c: "#10A37F" },
  { t: "Showmax", d: "showmax.com", c: "#E4007C" },
  { t: "Canva", d: "canva.com", c: "#00C4CC" },
];

const STEPS = [
  {
    n: "01",
    bg: "bg-accent text-white",
    title: "Connect Gmail",
    body: "Sign in with Google. Tally reads receipts, invoices and renewal notices from the last 18 months, read-only.",
  },
  {
    n: "02",
    bg: "bg-lime text-[#17142b]",
    title: "Add your M-Pesa or bank statement",
    body: "Upload the PDF. Tally spots paybills, card payments and standing orders you pay on a schedule and merges them with what it found in email.",
  },
  {
    n: "03",
    bg: "bg-pink text-[#17142b]",
    title: "Get reminded in time",
    body: "Confirm what is real, then get an email a few days before each renewal, so nothing charges you by surprise.",
  },
];

const COMPARE = [
  { what: "Finding subscriptions", without: "Digging through months of receipts", with: "Found in Gmail, M-Pesa and bank statements" },
  { what: "Renewals", without: "You notice once the money is gone", with: "An email a few days before" },
  { what: "Yearly cost", without: "A rough guess", with: "One total, in KES" },
  { what: "M-Pesa paybills", without: "Not tracked anywhere", with: "Regular paybills and tills detected" },
  { what: "Things you stopped using", without: "Easy to miss", with: "Overdue or possibly cancelled, flagged" },
];

const PROMISES = [
  { title: "Read-only access", body: "Tally can read your mail. It can never send, delete or change anything." },
  {
    title: "Only what it needs",
    body: "Tally keeps the billing details and a short excerpt of each receipt, never a copy of your inbox.",
  },
  { title: "Built for Kenya", body: "Totals in KES, M-Pesa and bank statements, and reminders timed for Nairobi." },
];

function SubCard({ s }: { s: Sample }) {
  return (
    <span className={`nb inline-flex items-center gap-3 py-2.5 pl-2.5 pr-5 ${s.overdue ? "bg-danger-soft" : "bg-surface"}`}>
      <ServiceLogo name={s.t} color={s.c} domain={s.d} size={52} />
      <span className="text-left leading-tight">
        <span className="block font-display text-lg font-bold">{s.t}</span>
        <span className={`block font-display text-base font-extrabold ${s.overdue ? "text-danger" : ""}`}>{s.amount}</span>
        {s.overdue ? (
          <span className="mt-1 inline-block rounded-md bg-danger px-1.5 py-0.5 text-[0.7rem] font-bold uppercase tracking-wide text-white">
            {s.note}
          </span>
        ) : (
          <span className="block text-xs font-medium text-ink-2">{s.note}</span>
        )}
      </span>
    </span>
  );
}

// onAccent: for the dark call-to-action panel at the bottom.
function SignInButtons({ onAccent = false }: { onAccent?: boolean }) {
  const primary = onAccent ? "bg-lime text-[#17142b] shadow-[4px_4px_0_#fff]!" : "bg-edge text-paper";
  const ghost = onAccent ? "bg-transparent text-white border-white! shadow-none!" : "bg-surface text-ink";
  return (
    <div className="flex w-full max-w-md flex-col gap-3 sm:flex-row">
      {googleEnabled() && (
        <form action={signInGoogle} className="flex-1">
          <button className={`nb-btn w-full whitespace-nowrap text-base ${primary}`}>Continue with Google</button>
        </form>
      )}
      {demoEnabled() && (
        <form action={signInDemo} className="flex-1">
          <button className={`nb-btn w-full whitespace-nowrap text-base ${googleEnabled() ? ghost : primary}`}>Try the demo</button>
        </form>
      )}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="nb inline-block rounded-full bg-lime px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#17142b] shadow-[2px_2px_0_var(--edge)]">
      {children}
    </span>
  );
}

export default async function Landing() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="overflow-hidden bg-paper">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <span className="font-display text-3xl font-extrabold tracking-tight">
          <Image src={withBase("/logo.svg")} alt="" unoptimized width={36} height={36} className="mr-2 inline-block h-9 w-9 align-[-0.3em]" />
          tally<span className="text-accent">.</span>
        </span>
        <nav className="flex items-center gap-2 text-sm font-bold">
          <a href="#how" className="hidden rounded-full px-3 py-2 hover:bg-surface-2 sm:inline">
            How it works
          </a>
          <a href="#compare" className="hidden rounded-full px-3 py-2 hover:bg-surface-2 sm:inline">
            Why Tally
          </a>
          <a href="#privacy" className="hidden rounded-full px-3 py-2 hover:bg-surface-2 sm:inline">
            Privacy
          </a>
          <ThemeToggle />
        </nav>
      </header>

      {/* Hero */}
      <section className="px-6 pb-20 pt-10 sm:pt-14">
        <div className="relative mx-auto w-full max-w-[66rem]">
          {FLOATERS.map(({ s, pos }) => (
            <span key={s.t} aria-hidden className={`absolute z-20 hidden xl:block ${pos}`}>
              <SubCard s={s} />
            </span>
          ))}

          <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center text-center">
            <Eyebrow>Gmail receipts + M-Pesa, in one place</Eyebrow>
            <h1 className="mt-7 font-display text-6xl font-extrabold uppercase leading-[0.9] tracking-tight [font-stretch:75%] sm:text-8xl">
              Every subscription,
              <br />
              <span className="nb mt-3 inline-block -rotate-2 rounded-2xl bg-accent px-4 pb-1 text-white">tallied.</span>
            </h1>
            <p className="mt-8 max-w-xl text-lg font-medium text-ink-2">
              Tally reads your billing emails and your M-Pesa or bank statement, finds everything you pay for, and nudges you before
              each renewal.
            </p>
            <div className="mt-9 flex w-full justify-center">
              <SignInButtons />
            </div>
            <p className="mt-5 max-w-sm text-xs font-medium text-ink-2">
              {googleEnabled()
                ? "Read-only Gmail access. Tally never sends, deletes or changes your mail."
                : "Demo mode uses a sample inbox and a sample M-Pesa statement. No real data needed."}
            </p>
          </div>
        </div>
      </section>

      {/* Recognised senders */}
      <section className="border-y-2 border-edge bg-lime px-6 py-5 text-[#17142b]">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-3">
          <span className="font-display text-sm font-extrabold uppercase tracking-wider">Spots receipts from</span>
          {KNOWN.map((k) => (
            <span key={k.t} className="inline-flex items-center gap-2 text-sm font-bold">
              <ServiceLogo name={k.t} color={k.c} domain={k.d} size={26} />
              {k.t}
            </span>
          ))}
          <span className="text-sm font-bold">and more</span>
        </div>
      </section>

      {/* Product preview */}
      <section className="px-6 py-24">
        <div className="mx-auto grid max-w-5xl items-center gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <Eyebrow>Your money, at a glance</Eyebrow>
            <h2 className="mt-5 font-display text-5xl font-extrabold uppercase leading-[0.95] tracking-tight [font-stretch:75%]">
              See what you really spend in a year
            </h2>
            <p className="mt-5 text-lg text-ink-2">
              Tally works out whether each charge is weekly, monthly or yearly, when it renews next, and what it all adds
              up to. If an expected charge does not show up, it flags it so you can check.
            </p>
          </div>

          <div aria-hidden className="nb bg-surface p-5 sm:p-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-ink-2">Yearly total</p>
                <p className="font-display text-4xl font-extrabold">KES 29,001</p>
              </div>
              <span className="rounded-full border-2 border-edge bg-lime px-3 py-1 text-xs font-bold text-[#17142b]">
                5 subscriptions
              </span>
            </div>
            <ul className="mt-5 space-y-2.5">
              {PREVIEW.map((s) => (
                <li
                  key={s.t}
                  className={`flex items-center gap-3 rounded-xl border-2 px-3 py-2.5 ${
                    s.overdue ? "border-danger bg-danger-soft" : "border-line"
                  }`}
                >
                  <ServiceLogo name={s.t} color={s.c} domain={s.d} size={40} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold">{s.t}</p>
                    <p className={`text-xs ${s.overdue ? "font-bold text-danger" : "text-ink-2"}`}>{s.note}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-display font-extrabold ${s.overdue ? "text-danger" : ""}`}>{s.amount}</p>
                    {s.overdue && (
                      <span className="rounded-md bg-danger px-1.5 py-0.5 text-[0.65rem] font-bold uppercase text-white">
                        Overdue
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-6 border-y-2 border-edge bg-surface px-6 py-24">
        <div className="mx-auto max-w-5xl text-center">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-5 font-display text-5xl font-extrabold uppercase leading-[0.95] tracking-tight [font-stretch:75%]">
            Three steps, about two minutes
          </h2>
          <div className="mt-14 grid gap-6 text-left md:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.n} className={`nb p-6 ${step.bg} ${i === 1 ? "md:-rotate-1" : i === 2 ? "md:rotate-1" : ""}`}>
                <span className="font-display text-6xl font-extrabold [font-stretch:75%]">{step.n}</span>
                <h3 className="mt-3 font-display text-2xl font-extrabold">{step.title}</h3>
                <p className="mt-2 text-sm font-medium opacity-85">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison */}
      <section id="compare" className="scroll-mt-6 px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <Eyebrow>Why Tally</Eyebrow>
            <h2 className="mt-5 font-display text-5xl font-extrabold uppercase leading-[0.95] tracking-tight [font-stretch:75%]">
              Life with and without it
            </h2>
          </div>
          <div className="nb mt-12 overflow-hidden bg-surface">
            <div className="grid grid-cols-[1fr_1fr] border-b-2 border-edge font-display text-lg font-extrabold uppercase sm:grid-cols-[0.8fr_1fr_1fr]">
              <span className="hidden px-5 py-4 sm:block" />
              <span className="border-edge px-5 py-4 text-ink-2 sm:border-l-2">Without Tally</span>
              <span className="border-l-2 border-edge bg-accent px-5 py-4 text-white">With Tally</span>
            </div>
            {COMPARE.map((row, i) => (
              <div
                key={row.what}
                className={`grid grid-cols-[1fr_1fr] text-sm sm:grid-cols-[0.8fr_1fr_1fr] ${
                  i < COMPARE.length - 1 ? "border-b-2 border-line" : ""
                }`}
              >
                <span className="col-span-2 px-5 pt-4 font-bold sm:col-span-1 sm:py-4">{row.what}</span>
                <span className="flex items-start gap-2 border-edge px-5 py-4 text-ink-2 sm:border-l-2">
                  <span className="font-bold text-danger" aria-hidden>
                    ✕
                  </span>
                  {row.without}
                </span>
                <span className="flex items-start gap-2 border-l-2 border-edge bg-accent-soft px-5 py-4 font-semibold">
                  <span className="font-bold text-mint" aria-hidden>
                    ✓
                  </span>
                  {row.with}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Privacy */}
      <section id="privacy" className="scroll-mt-6 px-6 pb-24">
        <div className="mx-auto max-w-5xl">
          <div className="text-center">
            <Eyebrow>Privacy</Eyebrow>
            <h2 className="mt-5 font-display text-5xl font-extrabold uppercase leading-[0.95] tracking-tight [font-stretch:75%]">
              Careful with your inbox
            </h2>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {PROMISES.map((p) => (
              <div key={p.title} className="nb bg-surface p-6">
                <h3 className="font-display text-xl font-extrabold">{p.title}</h3>
                <p className="mt-2 text-sm text-ink-2">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="px-6 pb-20">
        <div className="nb mx-auto flex max-w-5xl flex-col items-center bg-[#17142b] px-6 py-16 text-center text-white">
          <h2 className="font-display text-5xl font-extrabold uppercase leading-[0.95] tracking-tight [font-stretch:75%] sm:text-6xl">
            Stop paying for <span className="text-lime">what you forgot</span>
          </h2>
          <p className="mt-4 max-w-md text-white/80">Find every subscription you pay for in a couple of minutes.</p>
          <div className="mt-9 flex w-full justify-center">
            <SignInButtons onAccent />
          </div>
        </div>
      </section>

      <footer className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 border-t-2 border-edge px-6 py-8 text-sm font-medium text-ink-2 sm:flex-row">
        <span className="font-display text-xl font-extrabold text-ink">
          <Image src={withBase("/logo.svg")} alt="" unoptimized width={28} height={28} className="mr-1.5 inline-block h-7 w-7 align-[-0.3em]" />
          tally<span className="text-accent">.</span>
        </span>
        <span>Made in Nairobi. Logos belong to their owners.</span>
      </footer>
    </main>
  );
}
