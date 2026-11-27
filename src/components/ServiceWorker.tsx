"use client";

import { useEffect } from "react";

/** Registers the service worker that makes Tally installable and able to receive push. */
export function ServiceWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Some embedded browsers refuse service workers. The app works without
    // one, so this is a warning, not an error.
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch((err) => {
      console.warn("[sw] not registered:", err instanceof Error ? err.message : err);
    });
  }, []);
  return null;
}
