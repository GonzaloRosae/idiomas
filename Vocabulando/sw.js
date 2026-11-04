/* Vocabulando · copia sin conexión de la app.
   Red primero (así las actualizaciones llegan en cuanto hay conexión) y, si no hay red, la última copia guardada.
   Solo toca archivos de esta misma web: las consultas a Wikcionario, Tatoeba o MyMemory y las fuentes de Google pasan sin tocar,
   y los archivos de datos (.json) no se guardan nunca aquí. */
const VERSION = "vocabulando-v1";
const CORE = ["./Vocabulando.html", "./manifest.webmanifest", "./logo/vocabulando.svg", "./logo/vocabulando-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || url.pathname.endsWith(".json")) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((r) => r || caches.match("./Vocabulando.html")))
  );
});
