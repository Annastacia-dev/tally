"use client";

import { useEffect, useState, useTransition } from "react";
import { withBase } from "@/lib/base-path";
import { removePushDevice, savePushDevice, sendTestPush, type ActionResult } from "@/app/actions";

type State = "checking" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** The registered service worker, or null if there is none within a few seconds. */
async function registration() {
  const reg = await navigator.serviceWorker.getRegistration(withBase("/"));
  if (reg) return reg;
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 4000)),
  ]);
}

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

export function PushToggle({ publicKey }: { publicKey: string | null }) {
  const [state, setState] = useState<State>("checking");
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) return setState(isIos() && !isInstalled() ? "needs-install" : "unsupported");
      if (Notification.permission === "denied") return setState("blocked");
      const reg = await registration();
      if (!reg) return setState("unsupported");
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Keep the server's copy in step, in case it was removed there.
        await savePushDevice(sub.toJSON(), navigator.userAgent);
        setState("on");
      } else setState("off");
    })().catch(() => setState("unsupported"));
  }, []);

  const turnOn = () =>
    start(async () => {
      setResult(null);
      if (!publicKey) return setResult({ ok: false, message: "Push is not set up on the server yet (no VAPID keys)." });
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await registration();
      if (!reg) return setResult({ ok: false, message: "This browser did not start Tally's service worker." });
      try {
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
        const res = await savePushDevice(sub.toJSON(), navigator.userAgent);
        setResult(res);
        if (res.ok) setState("on");
      } catch (err) {
        setResult({ ok: false, message: err instanceof Error ? err.message : String(err) });
      }
    });

  const turnOff = () =>
    start(async () => {
      setResult(null);
      const reg = await registration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushDevice(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
      setResult({ ok: true, message: "Notifications are off for this device." });
    });

  const test = () => start(async () => setResult(await sendTestPush()));

  const status = {
    checking: "Checking this browser...",
    on: "On for this device",
    off: "Off on this device",
    blocked: "Blocked. Allow notifications for this site in your browser settings, then reload.",
    "needs-install": "On iPhone or iPad, add Tally to your Home Screen first, then open it from there.",
    unsupported: "This browser can't show notifications from Tally.",
  }[state];

  return (
    <ChannelRow
      icon="🔔"
      title="Notifications"
      detail={status}
      on={state === "on"}
      result={result}
      actions={
        state === "on" ? (
          <>
            <button className={quietButton} disabled={pending} onClick={test}>
              Test
            </button>
            <button className={quietButton} disabled={pending} onClick={turnOff}>
              Turn off
            </button>
          </>
        ) : state === "off" ? (
          <button className="btn btn-primary px-3 py-1 text-xs" disabled={pending} onClick={turnOn}>
            {pending ? "Asking..." : "Turn on"}
          </button>
        ) : null
      }
    />
  );
}

export const quietButton = "rounded-lg px-2.5 py-1 text-xs font-bold text-ink-2 hover:bg-surface-2 hover:text-ink disabled:opacity-50";

/** One way of reaching the user (email, this device): what it is, its state, and its buttons. */
export function ChannelRow({
  icon,
  title,
  detail,
  on,
  actions,
  result,
}: {
  icon: string;
  title: string;
  detail: string;
  on: boolean;
  actions: React.ReactNode;
  result: ActionResult | null;
}) {
  return (
    <li className="px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-xl" aria-hidden>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-sm font-bold">
            {title}
            <span className={`h-2 w-2 rounded-full ${on ? "bg-mint" : "bg-line"}`} aria-hidden />
          </p>
          <p className="truncate text-xs text-ink-2">{detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">{actions}</div>
      </div>
      {result && <p className={`mt-2 text-xs font-semibold ${result.ok ? "text-ink" : "text-warn"}`}>{result.message}</p>}
    </li>
  );
}
