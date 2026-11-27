import Image from "next/image";
import { withBase } from "@/lib/base-path";

/** Tally's name: the logo and "TALLY" in Space Mono on a lime label. */
export function Wordmark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = {
    sm: { logo: 26, text: "text-sm", pad: "px-2 py-0.5" },
    md: { logo: 30, text: "text-base", pad: "px-2.5 py-0.5" },
    lg: { logo: 38, text: "text-xl", pad: "px-3 py-1" },
  }[size];
  return (
    <span className="inline-flex items-center gap-2">
      <Image src={withBase("/logo.svg")} alt="" unoptimized width={s.logo} height={s.logo} style={{ width: s.logo, height: s.logo }} />
      <span
        className={`font-brand ${s.text} ${s.pad} -rotate-2 rounded-md border-2 border-[#17142b] bg-lime font-bold uppercase tracking-[0.18em] text-[#17142b] shadow-[2px_2px_0_var(--edge)]`}
      >
        Tally
      </span>
    </span>
  );
}
