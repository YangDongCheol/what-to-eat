// One-shot cleanup worker for the old app: drop old wte- caches (never eik-), unregister, reload open windows.
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("wte-")).map((k) => caches.delete(k))))
      .then(() => self.registration.unregister())
      .then(() => clients.matchAll({ type: "window" }))
      .then((list) => Promise.all(list.map((c) => c.navigate(c.url))))
  );
});
