"use client";

import { useEffect } from "react";

/** Registers the service worker that makes Tally installable and able to receive push. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((err) => {
      console.error("[sw] registration failed", err);
    });
  }, []);
  return null;
}
