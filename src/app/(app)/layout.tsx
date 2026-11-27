import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { requireUser } from "@/auth";
import { DesktopNav, MobileNav } from "@/components/Nav";
import { ThemeToggle } from "@/components/ThemeToggle";
import { prisma } from "@/lib/db";
import { signOutAction } from "../actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  if (!user) redirect("/");
  const pending = await prisma.subscription.count({ where: { userId: user.id, status: "detected" } });

  return (
    <div className="min-h-dvh pb-28 md:pb-12">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <Link href="/dashboard" className="font-display text-xl font-bold">
          <Image src="/logo.svg" alt="" unoptimized width={28} height={28} className="mr-1.5 inline-block h-7 w-7 align-[-0.3em]" />
          tally<span className="text-accent">.</span>
        </Link>
        <DesktopNav pending={pending} />
        <div className="flex items-center gap-2">
          {user.isDemo && <span className="chip bg-sun/25 text-ink">Demo</span>}
          <ThemeToggle />
          <form action={signOutAction}>
            <button className="h-10 rounded-full bg-surface-2 px-3 text-sm font-semibold text-ink-2 hover:text-ink" title="Sign out">
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 sm:px-6">{children}</main>
      <MobileNav pending={pending} />
    </div>
  );
}
