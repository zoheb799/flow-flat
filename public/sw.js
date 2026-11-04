const OFFLINE_CACHE = "flatflow-offline-v1";

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(OFFLINE_CACHE).then((cache) => cache.add("/offline")));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((key) => key !== OFFLINE_CACHE).map((key) => caches.delete(key))),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || request.mode !== "navigate") return;
  event.respondWith(fetch(request).catch(async () => {
    const cache = await caches.open(OFFLINE_CACHE);
    return (await cache.match("/offline")) || Response.error();
  }));
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "FlatFlow", body: event.data?.text() ?? "You have a new update." };
  }
  event.waitUntil(self.registration.showNotification(payload.title ?? "FlatFlow", {
    body: payload.body ?? "You have a new household update.",
    icon: "/flatflow-icon.svg",
    badge: "/flatflow-icon.svg",
    data: { url: payload.url ?? "/dashboard" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url ?? "/dashboard", self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    const existing = clients.find((client) => client.url === url);
    if (existing) return existing.focus();
    return self.clients.openWindow(url);
  }));
});
