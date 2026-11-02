/* muse_pwa service worker — Step 1 app-shell cache only.
   API calls (Supabase, Edge Functions) are NEVER cached — network-only. */
const CACHE = "muse-pwa-v16";
const SHELL = [
  "./",
  "./index.html",
  "./app.js",
  "./chat.js",
  "./history.js",
  "./api.js",
  "./webllm.js",
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
  // App CSS/JS: network-first, cache as fallback. Cache-first here was
  // the cause of stale layouts in embedded previews (e.g. Responsively):
  // a preview could keep serving an old styles.css for many reloads,
  // so a fixed layout still looked broken. Network-first means a reload
  // always picks up the current file when the server is reachable.
  if (url.pathname.endsWith(".css") || url.pathname.endsWith(".js")) {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(event.request, copy));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => caches.match("./index.html")))
  );
});
