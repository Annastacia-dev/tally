"use client";

import { useActionState, useEffect, useState } from "react";
import { addManual, updateSubscription, type ActionResult } from "@/app/actions";

type Values = { id?: string; name: string; amount: number | ""; currency: string; cycle: string; nextRenewalAt: string };

export function SubscriptionForm({ initial, mode, onDone }: { initial: Values; mode: "edit" | "add"; onDone?: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    mode === "edit" ? updateSubscription : addManual,
    null,
  );
  useEffect(() => {
    if (state?.ok) onDone?.();
  }, [state, onDone]);

  return (
    <form action={action} className="grid gap-3 sm:grid-cols-6">
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <label className="sm:col-span-2">
        <span className="mb-1 block text-xs font-semibold text-ink-2">Service</span>
        <input className="input" name="name" defaultValue={initial.name} placeholder="e.g. Iron Paradise Gym" required />
      </label>
      <label>
        <span className="mb-1 block text-xs font-semibold text-ink-2">Amount</span>
        <input className="input" name="amount" type="number" step="0.01" min="0" defaultValue={initial.amount} required />
      </label>
      <label>
        <span className="mb-1 block text-xs font-semibold text-ink-2">Currency</span>
        <select className="input" name="currency" defaultValue={initial.currency}>
          {["KES", "USD", "EUR", "GBP", "ZAR"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs font-semibold text-ink-2">Every</span>
        <select className="input" name="cycle" defaultValue={initial.cycle === "unknown" ? "monthly" : initial.cycle}>
          <option value="weekly">week</option>
          <option value="monthly">month</option>
          <option value="quarterly">quarter</option>
          <option value="yearly">year</option>
        </select>
      </label>
      <label>
        <span className="mb-1 block text-xs font-semibold text-ink-2">Next renewal</span>
        <input className="input" name="nextRenewalAt" type="date" defaultValue={initial.nextRenewalAt} />
      </label>
      <div className="flex items-center gap-2 sm:col-span-6">
        <button className="btn btn-primary" disabled={pending}>
          {pending ? "Saving..." : mode === "edit" ? "Save" : "Add subscription"}
        </button>
        {onDone && mode === "edit" && (
          <button type="button" className="btn btn-ghost" onClick={onDone}>
            Cancel
          </button>
        )}
        {state && <span className={`text-sm ${state.ok ? "text-mint" : "text-warn"}`}>{state.message}</span>}
      </div>
    </form>
  );
}

export function EditToggle({ initial, className }: { initial: Values; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!open)
    return (
      <button className={className ?? "btn btn-ghost px-3 py-1.5 text-xs"} onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-3 sm:items-center" onClick={() => setOpen(false)}>
      <div className="card w-full max-w-2xl p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 font-display text-lg font-bold">Edit {initial.name}</h3>
        <SubscriptionForm initial={initial} mode="edit" onDone={() => setOpen(false)} />
      </div>
    </div>
  );
}
