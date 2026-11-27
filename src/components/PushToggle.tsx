"use client";

import { useEffect, useState, useTransition } from "react";
import { removePushDevice, savePushDevice, sendTestPush, type ActionResult } from "@/app/actions";

type State = "checking" | "unsupported" | "needs-install" | "blocked" | "off" | "on";

function keyBytes(base64url: string) {
  const pad = "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob((base64url + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** The registered service worker, or null if there is none within a few seconds. */
async function registration() {
  const reg = await navigator.serviceWorker.getRegistration("/");
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

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {state === "on" ? (
          <>
            <span className="chip bg-lime text-[#17142b]">🔔 On for this device</span>
            <button className="btn btn-ghost" disabled={pending} onClick={test}>
              Send a test notification
            </button>
            <button className="btn btn-ghost" disabled={pending} onClick={turnOff}>
              Turn off
            </button>
          </>
        ) : state === "off" ? (
          <button className="btn btn-primary" disabled={pending} onClick={turnOn}>
            {pending ? "Asking your browser..." : "🔔 Turn on notifications"}
          </button>
        ) : (
          <p className="text-sm text-ink-2">
            {state === "checking" && "Checking this browser..."}
            {state === "blocked" &&
              "Notifications are blocked for this site. Allow them in your browser's site settings, then reload."}
            {state === "needs-install" &&
              "On iPhone and iPad, add Tally to your Home Screen first (Share, then Add to Home Screen), then open it from there."}
            {state === "unsupported" && "This browser cannot show notifications from Tally. Try Chrome, Edge, Firefox or Safari."}
          </p>
        )}
      </div>
      {result && (
        <p className={`rounded-xl border-2 border-edge px-3 py-2 text-sm ${result.ok ? "bg-mint/20" : "bg-warn/15"}`}>
          {result.message}
        </p>
      )}
    </div>
  );
}
