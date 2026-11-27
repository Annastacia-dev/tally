"use client";

import { useRef, useState, useTransition } from "react";
import { sendRemindersNow, sendTestReminder, updateSettings, type ActionResult } from "@/app/actions";
import { ChannelRow, PushToggle, quietButton } from "./PushToggle";

type Props = { email: string | null; remindersOn: boolean; days: number; publicKey: string | null; demo: boolean };

/** Sources page: when reminders go out, where they go, and a way to test each. */
export function RemindersCard({ email, remindersOn, days, publicKey, demo }: Props) {
  const [on, setOn] = useState(remindersOn);
  const [before, setBefore] = useState(days);
  const [saved, setSaved] = useState(false);
  const [emailResult, setEmailResult] = useState<ActionResult | null>(null);
  const [runResult, setRunResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Settings save on their own, a moment after the last change.
  const save = (nextOn: boolean, nextDays: number) => {
    clearTimeout(timer.current);
    setSaved(false);
    timer.current = setTimeout(() => {
      const form = new FormData();
      if (nextOn) form.set("remindersOn", "on");
      form.set("remindDaysBefore", String(nextDays));
      start(async () => {
        await updateSettings(form);
        setSaved(true);
      });
    }, 500);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm font-semibold">
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => {
            setOn(!on);
            save(!on, before);
          }}
          className={`relative h-7 w-12 shrink-0 rounded-full border-2 border-edge transition ${on ? "bg-accent" : "bg-surface-2"}`}
        >
          <span className={`absolute top-0.5 h-5 w-5 rounded-full border-2 border-edge bg-surface transition-all ${on ? "left-[1.35rem]" : "left-0.5"}`} />
          <span className="sr-only">Reminders on</span>
        </button>
        <span className={on ? "" : "text-ink-2"}>Remind me</span>
        <input
          type="number"
          min={0}
          max={30}
          value={before}
          disabled={!on}
          onChange={(e) => {
            const v = Math.max(0, Math.min(30, Number(e.target.value) || 0));
            setBefore(v);
            save(on, v);
          }}
          className="input w-16 py-1 text-center disabled:opacity-50"
          aria-label="Days before renewal"
        />
        <span className={on ? "" : "text-ink-2"}>days before each renewal</span>
        <span className="text-xs font-medium text-ink-2" aria-live="polite">
          {pending ? "Saving..." : saved ? "Saved" : ""}
        </span>
      </div>

      <ul className={`divide-y-2 divide-line rounded-xl border-2 border-edge ${on ? "" : "opacity-60"}`}>
        <ChannelRow
          icon="📧"
          title="Email"
          detail={demo ? "Demo accounts are never emailed" : (email ?? "No email address")}
          on={on && !demo && Boolean(email)}
          result={emailResult}
          actions={
            !demo && (
              <button className={quietButton} disabled={pending} onClick={() => start(async () => setEmailResult(await sendTestReminder()))}>
                Test
              </button>
            )
          }
        />
        <PushToggle publicKey={publicKey} />
      </ul>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-2">
        <span>Checked every morning. Each renewal is reminded once.</span>
        {!demo && (
          <button className={quietButton} disabled={pending} onClick={() => start(async () => setRunResult(await sendRemindersNow()))}>
            Run now
          </button>
        )}
      </div>
      {runResult && <p className={`text-xs font-semibold ${runResult.ok ? "text-ink" : "text-warn"}`}>{runResult.message}</p>}
    </div>
  );
}
