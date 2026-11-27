// Tally service worker. It makes the app installable and is ready to show
// push notifications. It does not cache pages, so the app is never stale.

// The app may live under a sub-path (e.g. /tally/). Paths in this file and in
// push payloads are app-relative ("/dashboard") and resolved against it.
const BASE = new URL(self.registration.scope).pathname.replace(/\/$/, "");
const inApp = (path) => (path.startsWith("/") && !path.startsWith(`${BASE}/`) ? `${BASE}${path}` : path);

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

// Payload: { title, body, url?, tag? }
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let data;
  try {
    data = event.data.json();
  } catch {
    data = { title: "Tally", body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || "Tally", {
      body: data.body || "",
      icon: inApp("/icons/icon-192.png"),
      badge: inApp("/icons/badge-96.png"),
      tag: data.tag,
      data: { url: inApp(data.url || "/dashboard") },
    }),
  );
});

// Focus an open Tally window if there is one, otherwise open a new one.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || inApp("/dashboard"), self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
      if (open) return open.navigate(url).then((w) => (w || open).focus());
      return self.clients.openWindow(url);
    }),
  );
});
