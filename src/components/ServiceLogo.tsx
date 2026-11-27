"use client";

import { useState } from "react";

// Shows the service's favicon when we know its domain, otherwise (or if the
// image fails to load) a bold initial. The image stays invisible until it loads on the brand colour.
export function ServiceLogo({ name, color, domain, size = 44 }: { name: string; color: string; domain?: string | null; size?: number }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const showImg = domain && !failed && process.env.NEXT_PUBLIC_LOGOS !== "off";
  return (
    <span
      className="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-2xl font-display font-bold text-white shadow-sm"
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
      aria-hidden
    >
      {name.trim().charAt(0).toUpperCase()}
      {showImg && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://www.google.com/s2/favicons?domain=${domain}&sz=128`}
          alt=""
          className={`absolute inset-0 h-full w-full bg-white object-contain p-1.5 transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
          onError={() => setFailed(true)}
          onLoad={(e) => {
            // Google returns a 16px globe for unknown domains; treat that as a miss.
            if ((e.target as HTMLImageElement).naturalWidth < 32) setFailed(true);
            else setLoaded(true);
          }}
        />
      )}
    </span>
  );
}
