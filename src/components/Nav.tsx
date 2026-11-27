"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Home", icon: "🏠" },
  { href: "/review", label: "Review", icon: "✅" },
  { href: "/sources", label: "Sources", icon: "📥" },
];

export function DesktopNav({ pending }: { pending: number }) {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-1 rounded-xl border-2 border-edge bg-surface p-1 shadow-[3px_3px_0_var(--edge)] md:flex">
      {LINKS.map((l) => {
        const active = path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`relative rounded-lg px-4 py-1.5 text-sm font-bold transition ${active ? "bg-accent text-accent-ink" : "text-ink-2 hover:bg-lime hover:text-[#17142b]"}`}
          >
            {l.label}
            {l.href === "/review" && pending > 0 && (
              <span className="ml-1.5 rounded-full border border-edge bg-sun px-1.5 py-0.5 text-[10px] font-bold text-black">{pending}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

export function MobileNav({ pending }: { pending: number }) {
  const path = usePathname();
  return (
    <nav className="fixed inset-x-3 bottom-3 z-40 flex justify-around rounded-2xl border-2 border-edge bg-surface p-1.5 shadow-[4px_4px_0_var(--edge)] md:hidden">
      {LINKS.map((l) => {
        const active = path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`relative flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[11px] font-bold ${active ? "bg-accent text-accent-ink" : "text-ink-2"}`}
          >
            <span className="text-lg leading-none" aria-hidden>{l.icon}</span>
            {l.label}
            {l.href === "/review" && pending > 0 && (
              <span className="absolute right-[28%] top-1 rounded-full bg-sun px-1.5 text-[10px] font-bold text-black">{pending}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
