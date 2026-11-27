import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ThemeToggle } from "@/components/ThemeToggle";
import { demoEnabled, googleEnabled } from "@/lib/flags";
import { signInDemo, signInGoogle } from "./actions";

const FLOATERS = [
  { t: "Netflix", c: "#E50914", x: "left-[6%] top-[18%]", r: "-rotate-6" },
  { t: "Spotify", c: "#1DB954", x: "right-[8%] top-[14%]", r: "rotate-6" },
  { t: "Showmax", c: "#E4007C", x: "left-[10%] bottom-[16%]", r: "rotate-3" },
  { t: "Gym", c: "#F6A609", x: "right-[12%] bottom-[20%]", r: "-rotate-3" },
];

export default async function Landing() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden">
      <header className="flex items-center justify-between p-5">
        <span className="font-display text-xl font-bold">kumbuka<span className="text-accent">.</span></span>
        <ThemeToggle />
      </header>

      {FLOATERS.map((f) => (
        <span
          key={f.t}
          className={`absolute hidden rounded-2xl px-4 py-2 font-display text-sm font-bold text-white shadow-lg sm:block ${f.x} ${f.r}`}
          style={{ background: f.c }}
          aria-hidden
        >
          {f.t}
        </span>
      ))}

      <section className="relative z-10 mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 pb-16 text-center">
        <span className="chip mb-5 bg-accent-soft text-ink">Swahili for &ldquo;remember&rdquo;</span>
        <h1 className="font-display text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">
          Every subscription,
          <br />
          <span className="text-accent">remembered.</span>
        </h1>
        <p className="mt-5 max-w-md text-base text-ink-2 sm:text-lg">
          Kumbuka reads your billing emails and M-Pesa statement, finds what you pay for, and nudges you before each renewal.
        </p>

        <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
          {googleEnabled() && (
            <form action={signInGoogle}>
              <button className="btn btn-primary w-full py-3 text-base">Continue with Google</button>
            </form>
          )}
          {demoEnabled() && (
            <form action={signInDemo}>
              <button className={`btn w-full py-3 text-base ${googleEnabled() ? "btn-ghost" : "btn-primary"}`}>
                Try the demo
              </button>
            </form>
          )}
        </div>
        <p className="mt-4 max-w-sm text-xs text-ink-2">
          {googleEnabled()
            ? "We ask for read-only Gmail access. We never send, delete or change your mail."
            : "Demo mode uses a sample inbox and a sample M-Pesa statement. No real data needed."}
        </p>
      </section>
    </main>
  );
}
