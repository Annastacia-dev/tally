"use client";

import { useActionState, useState, useTransition } from "react";
import { scanInbox, sendRemindersNow, uploadStatement, type ActionResult } from "@/app/actions";

function Result({ r }: { r: ActionResult | null }) {
  if (!r) return null;
  return <p className={`mt-3 rounded-2xl px-3 py-2 text-sm ${r.ok ? "bg-mint/15" : "bg-warn/15"}`}>{r.ok ? "🎉 " : "⚠️ "}{r.message}</p>;
}

export function ScanButton({ label }: { label: string }) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div>
      <button className="btn btn-primary" disabled={pending} onClick={() => start(async () => setResult(await scanInbox()))}>
        {pending ? (
          <>
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
            Reading your receipts...
          </>
        ) : (
          label
        )}
      </button>
      <Result r={result} />
    </div>
  );
}

export function StatementUpload({ demo }: { demo: boolean }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(uploadStatement, null);
  return (
    <div>
      <form action={action} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <label className="flex flex-1 cursor-pointer items-center gap-3 rounded-2xl border-2 border-dashed border-line px-4 py-3 text-sm text-ink-2 hover:border-accent">
          <span className="text-xl" aria-hidden>📄</span>
          <input type="file" name="statement" accept="application/pdf" className="w-full text-sm file:hidden" />
        </label>
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Reading..." : "Upload statement"}
        </button>
      </form>
      {demo && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 text-sm">
          <span className="text-ink-2">or try a sample:</span>
          {[
            ["mpesa", "M-Pesa statement"],
            ["bank", "bank statement"],
          ].map(([value, label]) => (
            <form key={value} action={action}>
              <input type="hidden" name="sample" value={value} />
              <button className="font-semibold text-accent underline-offset-2 hover:underline" disabled={pending}>
                {label}
              </button>
            </form>
          ))}
        </div>
      )}
      <Result r={state} />
    </div>
  );
}

export function RemindNow() {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  return (
    <div>
      <button className="btn btn-ghost" disabled={pending} onClick={() => start(async () => setResult(await sendRemindersNow()))}>
        {pending ? "Checking..." : "Run reminders now"}
      </button>
      <Result r={result} />
    </div>
  );
}
