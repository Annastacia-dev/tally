"use client";

import { useState } from "react";
import { formatMoney } from "@/lib/money";

// Single-series bar chart of spend per month. One hue, no legend (the card
// title names the series), per-bar hover/focus tooltip, recessive gridlines.
export function SpendChart({ months, currency }: { months: { key: string; label: string; total: number }[]; currency: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...months.map((m) => m.total));
  const nice = Math.pow(10, Math.floor(Math.log10(max)));
  const top = Math.ceil(max / nice) * nice;
  const W = 600;
  const H = 200;
  const padL = 62;
  const padB = 24;
  const slot = (W - padL) / months.length;
  const barW = Math.min(30, slot - 8);
  const y = (v: number) => (H - padB) - (v / top) * (H - padB - 8);
  const current = months.length - 1;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Spend by month, last 12 months">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={padL} x2={W} y1={y(top * f)} y2={y(top * f)} stroke="var(--line)" strokeWidth={1} />
            <text x={padL - 8} y={y(top * f) + 4} textAnchor="end" fontSize={11} fill="var(--ink-2)">
              {formatMoney(top * f, currency, { compact: true })}
            </text>
          </g>
        ))}
        {months.map((m, i) => {
          const x = padL + i * slot + (slot - barW) / 2;
          const h = Math.max(m.total > 0 ? 3 : 0, (H - padB) - y(m.total));
          const r = Math.min(4, h / 2, barW / 2);
          const top = (H - padB) - h;
          return (
            <g
              key={m.key}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${m.label}: ${formatMoney(m.total, currency)}`}
              className="outline-none"
            >
              <rect x={padL + i * slot} y={0} width={slot} height={H} fill="transparent" />
              {h > 0 && (
                <path
                  d={`M${x},${H - padB} V${top + r} Q${x},${top} ${x + r},${top} H${x + barW - r} Q${x + barW},${top} ${x + barW},${top + r} V${H - padB} Z`}
                  fill="var(--accent)"
                  opacity={hover === null ? (i === current ? 1 : 0.55) : hover === i ? 1 : 0.35}
                />
              )}
              <text x={x + barW / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--ink-2)" fontWeight={i === current ? 700 : 400}>
                {m.label}
              </text>
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -translate-x-1/2 rounded-xl bg-ink px-2.5 py-1.5 text-xs font-semibold text-bg shadow-lg"
          style={{ left: `${((padL + hover * slot + slot / 2) / W) * 100}%`, top: 0 }}
        >
          {months[hover].label}: {formatMoney(months[hover].total, currency)}
        </div>
      )}
    </div>
  );
}
