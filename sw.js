/* ==========================================================
   عامل الخدمة: يجعل الموقع يعمل بدون إنترنت
   - الصفحات والسكربتات: من الشبكة أولاً (لتصل التحديثات فوراً)، ومن الذاكرة عند انقطاع الإنترنت
   - الصور والخطوط: من الذاكرة أولاً
   - المعلومات المحفوظة: تُخزَّن كاملة لحظة حفظها
   غيّر رقم VERSION عند أي تعديل كبير لتنظيف الذاكرة القديمة.
   ========================================================== */
const VERSION = "empire-v9";
const CORE = `${VERSION}-core`, PAGES = `${VERSION}-pages`, MEDIA = `${VERSION}-media`;
const SAVED = "empire-saved"; // the reader's saved facts: survives version bumps
const PRECACHE = [
  "./", "index.html", "offline.html", "facts.html", "fact.html", "manifest.webmanifest",
  "assets/css/style.css", "assets/js/config.js", "assets/js/data.js", "assets/js/core.js", "assets/js/fx.js", "assets/js/gl.js",
  "assets/js/static-index.js", "assets/js/telegram-data.js", "assets/js/branches-data.js", "branch.html", "assets/js/pages/branch.js", "assets/js/pages/home.js", "assets/js/pages/facts.js", "assets/js/pages/fact.js",
  "assets/img/favicon.svg", "assets/img/icon-192.png"
];
const MEDIA_MAX = 250;

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CORE).then((c) => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION) && k !== SAVED && !k.startsWith("iq-ai-models")).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

async function trim(name, max) {
  const c = await caches.open(name), keys = await c.keys();
  for (let i = 0; i < keys.length - max; i++) await c.delete(keys[i]);
}

async function networkFirst(req, cacheName, fallback) {
  try {
    const res = await fetch(req);
    if (res && res.ok) { const c = await caches.open(cacheName); c.put(req, res.clone()); }
    return res;
  } catch {
    const hit = await caches.match(req) || await caches.match(req, { ignoreSearch: true });
    if (hit) return hit;
    if (fallback) return offlinePage(fallback);
    return Response.error();
  }
}

// the offline page may stand in for any URL (e.g. post/x.html): pin its relative links to the site root
async function offlinePage(name) {
  const res = await caches.match(name); if (!res) return Response.error();
  const html = (await res.text()).replace("<head>", `<head><base href="${self.registration.scope}">`);
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function cacheFirst(req, cacheName) {
  const hit = await caches.match(req);
  if (hit) return hit;
  try {
    const res = await fetch(req);
    if (res && (res.ok || res.type === "opaque")) { const c = await caches.open(cacheName); c.put(req, res.clone()); trim(cacheName, MEDIA_MAX); }
    return res;
  } catch { return Response.error(); }
}

async function staleWhileRevalidate(req, cacheName) {
  const hit = await caches.match(req);
  const net = fetch(req).then(async (res) => { if (res && (res.ok || res.type === "opaque")) (await caches.open(cacheName)).put(req, res.clone()); return res; }).catch(() => hit);
  return hit || net;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (req.mode === "navigate") { e.respondWith(networkFirst(req, PAGES, "offline.html")); return; }
    if (/\.(png|jpe?g|webp|gif|svg|avif|woff2?)$/i.test(url.pathname)) { e.respondWith(cacheFirst(req, MEDIA)); return; }
    e.respondWith(networkFirst(req, PAGES));
    return;
  }
  // fonts, icon library, smooth scroll, exif readers… from public CDNs
  if (/(fonts\.googleapis\.com|fonts\.gstatic\.com|unpkg\.com|cdn\.jsdelivr\.net|cdnjs\.cloudflare\.com)$/.test(url.hostname)) {
    e.respondWith(staleWhileRevalidate(req, MEDIA));
  }
});

// a page asks us to keep a saved fact for offline reading
self.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.type !== "cache" || !Array.isArray(d.urls)) return;
  e.waitUntil(caches.open(SAVED).then((c) => Promise.all(d.urls.filter((u) => new URL(u).origin === self.location.origin)
    .map((u) => fetch(u).then((r) => r.ok && c.put(u, r)).catch(() => {})))));
});
