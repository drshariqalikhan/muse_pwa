/* muse_pwa service worker — Step 1 app-shell cache only.
   API calls (Supabase, Edge Functions) are NEVER cached — network-only. */
const CACHE = "muse-pwa-v1";
const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./chat.js",
  "./history.js",
  "./api.js",
  "./auth.js",
  "./context.js",
  "./config.js",
  "./styles.css",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  // Never cache API calls
  if (url.pathname.includes("/functions/") || url.hostname.includes("supabase.co")) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => caches.match("./index.html")))
  );
});
