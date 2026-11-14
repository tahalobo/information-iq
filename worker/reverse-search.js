/* ==========================================================
   عامل البحث العكسي — Cloudflare Worker (مجاني، بلا مفتاح API وبلا بطاقة دفع)

   يستقبل صورة من موقعنا ويبحث عنها في فهرس صور ياندكس (بحث بالصورة)، ثم يعيد
   النتائج JSON ليعرضها الموقع داخل صفحته. لا يحتاج أي مفتاح أو حساب مدفوع.

   مساران:
     POST /        { image: "data:image/jpeg;base64,..." } أو { url: "https://..." }
                   ← الصفحات التي ظهرت فيها الصورة + نسخها + الصور المشابهة + الوسوم
     POST /dates   { urls: ["https://...", ...] }   (حتى 8 روابط)
                   ← تاريخ نشر كل صفحة واسم موقعها (يزور الصفحة ويقرأ رأسها فقط)
     POST /link    { url: "https://..." } — لفاحص الروابط tool-link.html
                   ← يتتبّع التحويلات محطةً محطة (حتى 10) دون تنفيذ أي شيء، ويعيد الوجهة النهائية
                     وعنوان صفحتها وهل فيها حقل كلمة مرور أو بطاقة أو نموذج يرسل لموقع آخر
     POST /verify  { queries: ["نص البحث", ...] }   (حتى عبارتين) — لمحقّق الأخبار verify.html
                   ← يبحث في الويب، يفتح أفضل الصفحات، ويعيد نص كل صفحة ليقارنه الموقع بالخبر
                   محرك البحث: أول مفتاح موجود من SERPER_API_KEY (نتائج غوغل) أو
                   GOOGLE_API_KEY + GOOGLE_CX أو BRAVE_API_KEY، وإلا DuckDuckGo بلا مفتاح (قد يُحظر)

   تنبيه: هذا استخدام غير رسمي لصفحة نتائج ياندكس. قد يتغير شكلها أو تطلب كابتشا،
   وعندها يعيد العامل {error:"blocked"} ويعرض الموقع المحركات الخارجية بدلاً منه.

   الإعداد: راجع worker/README.md
   المتغيرات (اختيارية):
     ALLOWED_ORIGINS   (إلزامي) نطاقات موقعك مفصولة بفاصلة، مثل: https://information-iq.com
                       إن تُرك فارغاً يرفض العامل كل الطلبات (حتى لا يصير وسيطاً مفتوحاً لأي موقع).
     DEV               "1" للتجربة المحلية فقط: يسمح بطلبات http://localhost (يضبطه worker/dev-server.mjs)

   الأمان: فحص Origin يمنع المواقع الأخرى من استعمال العامل عبر المتصفح، لكنه ليس مصادقة (أي برنامج
   يستطيع تزوير الترويسة)، لذلك يوجد أيضاً حدّ للطلبات لكل عنوان IP، وحدّ لحجم الطلب والرد والوقت،
   ومنع جلب أي عنوان داخلي أو خاص (SSRF) مع إعادة الفحص عند كل تحويل.
   ========================================================== */

const MAX_B64 = 4_000_000;        // ≈ 3 MB image
const MAX_BODY = 5_500_000;       // أقصى حجم لجسم الطلب
const RL_MAX = 30, RL_WIN = 60;   // 30 طلباً في الدقيقة لكل عنوان IP
const SEC_HEADERS = { "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'" };
const MAX_DATE_URLS = 8;
const PAGE_TIMEOUT = 4000;
const PAGE_BYTES = 160_000;
const CACHE_TTL = 60 * 60 * 24 * 3;
const YA = "https://yandex.com";
const YA_HEADERS = { "User-Agent": "curl/8.10.1", Accept: "*/*", "Accept-Language": "en" };
const ADULT = /porn|xxx|xhamster|sex|nude|naked|hentai|onlyfans|chaturbate|strip|erotic|nsfw|escort|webcam|adult|18\+|порно|секс|эроти|голы/i;

export default {
  async fetch(req, env, ctx) {
    const origin = req.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    // مغلق افتراضياً: بلا ALLOWED_ORIGINS لا يُقبل أي موقع؛ و localhost يُقبل في وضع التجربة فقط
    const okOrigin = !!origin && (allowed.includes(origin) || (env.DEV === "1" && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)));
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? origin : allowed[0] || "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin"
    };
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, ...SEC_HEADERS, "Content-Type": "application/json; charset=utf-8" } });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: { ...cors, ...SEC_HEADERS } });
    if (req.method === "GET" || req.method === "HEAD") return json({ ok: true, service: "empire-reverse-search" });
    if (req.method !== "POST") return json({ error: "method" }, 405);
    if (!okOrigin) return json({ error: "origin" }, 403);
    if (await limited(req)) return json({ error: "rate" }, 429);

    let body;
    try {
      if (+(req.headers.get("content-length") || 0) > MAX_BODY) return json({ error: "too-large" }, 413);
      const raw = await readCapped(req, MAX_BODY + 1);
      if (raw.length > MAX_BODY) return json({ error: "too-large" }, 413);
      body = JSON.parse(raw);
    } catch { return json({ error: "bad-json" }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return json({ error: "bad-json" }, 400);

    try {
      const route = new URL(req.url).pathname.replace(/\/+$/, "");
      if (route.endsWith("/link")) return json(await linkTrace(body));
      if (route.endsWith("/verify")) return json(await verifyNews(body, env));
      if (route.endsWith("/dates")) return json(await dates(body));
      return await search(body, json, ctx);
    } catch (e) {
      // لا نعيد للزائر نص الخطأ الداخلي (قد يكشف تفاصيل الخادم أو الموقع المجلوب)
      if (!e.code) console.error(e);
      return json({ error: e.code || "engine" }, e.code === "blocked" ? 503 : e.code === "bad-request" ? 400 : 502);
    }
  }
};

/* ---------- 1) البحث بالصورة ---------- */
async function search(body, json, ctx) {
  const image = typeof body.image === "string" ? body.image.replace(/^data:image\/[\w+.-]+;base64,/, "") : "";
  const url = typeof body.url === "string" && body.url.length <= 2000 && isSafeUrl(body.url) ? body.url : "";
  if (!image && !url) return json({ error: "no-image" }, 400);
  if (image.length > MAX_B64) return json({ error: "too-large" }, 413);
  if (image && !/^[A-Za-z0-9+/=\s]+$/.test(image)) return json({ error: "no-image" }, 400);

  // الصورة نفسها ← الجواب نفسه، من الكاش
  const key = await sha256(image || url);
  const cacheKey = new Request(`https://cache.empire/rs2/${key}`);
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  if (cache) { const hit = await cache.match(cacheKey); if (hit) { const data = await hit.json(); data.cached = true; return json(data); } }

  let q;
  if (image) {
    const bytes = Uint8Array.from(atob(image), (c) => c.charCodeAt(0));
    const up = await fetch(`${YA}/images-apphost/image-download?cbird=111&images_avatars_size=preview&images_avatars_namespace=images-cbir`, { method: "POST", headers: { ...YA_HEADERS, "Content-Type": "image/jpeg" }, body: bytes, signal: AbortSignal.timeout(15000) });
    const u = await up.json().catch(() => null);
    const orig = u && u.sizes && u.sizes.orig && u.sizes.orig.path;
    if (!up.ok || !u || !u.cbir_id || !orig) throw fail("blocked", `upload ${up.status}`);
    q = `rpt=imageview&url=${encodeURIComponent(orig)}&cbir_id=${encodeURIComponent(u.cbir_id)}`;
  } else q = `rpt=imageview&url=${encodeURIComponent(url)}`;

  const r = await fetch(`${YA}/images/search?${q}`, { headers: YA_HEADERS, redirect: "follow", signal: AbortSignal.timeout(15000) });
  const html = await readCapped(r, 3_000_000);
  const st = readState(html);
  if (!st) throw fail(/captcha/i.test(r.url + html.slice(0, 20000)) ? "blocked" : "parse", `search ${r.status}`);

  const https = (u) => (u ? (u.startsWith("//") ? "https:" + u : u) : "");
  const seen = new Set();
  const pages = ((st.cbirSites && st.cbirSites.sites) || []).map((s) => ({
    url: stripUtm(s.url), title: clean(s.title), desc: clean(s.description), host: s.domain || "",
    thumb: https(s.thumb && s.thumb.url), img: (s.originalImage && s.originalImage.url) || "",
    w: (s.originalImage && s.originalImage.width) || 0, h: (s.originalImage && s.originalImage.height) || 0
  })).filter((p) => /^https?:/i.test(p.url) && !seen.has(p.url) && seen.add(p.url) && !ADULT.test(p.host + " " + p.title));

  const sizes = Object.values((st.cbirOtherSizes && st.cbirOtherSizes.items) || {}).flat()
    .map((s) => { const m = /(\d+)\D+(\d+)/.exec(s.text || ""); return { url: s.url, w: m ? +m[1] : 0, h: m ? +m[2] : 0 }; })
    .filter((s) => /^https?:/i.test(s.url || "")).slice(0, 24);

  const similar = ((st.cbirSimilar && st.cbirSimilar.thumbs) || []).map((t) => {
    let src = ""; try { src = new URL(t.linkUrl, YA).searchParams.get("img_url") || ""; } catch { /* ignore */ }
    return { thumb: https(t.imageUrl), url: /^https?:\/\//i.test(src) ? src : "", title: clean(t.title) };
  }).filter((t) => /^https:\/\//i.test(t.thumb) && !ADULT.test(t.title + " " + t.url)).slice(0, 24);

  const data = {
    ok: true, engine: "yandex", at: new Date().toISOString(),
    tags: ((st.cbirTags && st.cbirTags.tags) || []).map((t) => clean(t.text)).filter(Boolean).slice(0, 12),
    text: clean((st.cbirOcr && st.cbirOcr.plainText) || "", 600),
    pages, sizes, similar
  };
  if (cache && ctx) ctx.waitUntil(cache.put(cacheKey, new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json", "Cache-Control": `max-age=${CACHE_TTL}` } })));
  return json(data);
}

/* صفحة النتائج تحمل حالتها JSON داخل الخاصية data-state */
function readState(html) {
  const re = /data-state="([^"]+)"/g; let m;
  while ((m = re.exec(html))) {
    if (!m[1].includes("cbirSites")) continue;
    try { const d = JSON.parse(unescapeHtml(m[1])); if (d.initialState && d.initialState.cbirSites) return d.initialState; } catch { /* next */ }
  }
  return null;
}

/* ---------- 2) تواريخ النشر ---------- */
async function dates(body) {
  const urls = (Array.isArray(body.urls) ? body.urls : []).filter((u) => typeof u === "string" && u.length <= 2000 && isSafeUrl(u)).slice(0, MAX_DATE_URLS);
  const out = await Promise.all(urls.map(async (u) => ({ url: u, ...(await pageMeta(u)) })));
  return { ok: true, pages: out };
}

async function pageMeta(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), PAGE_TIMEOUT);
  try {
    const r = await safeFetch(url, { signal: ctl.signal, headers: { "User-Agent": "EmpireFactCheckBot/1.0 (+reverse-image-verification)", Accept: "text/html" } });
    if (!r.ok || !/html/i.test(r.headers.get("content-type") || "")) return {};
    // نقرأ رأس الصفحة فقط
    const reader = r.body.getReader(), dec = new TextDecoder(); let html = "", got = 0;
    while (got < PAGE_BYTES) { const { done, value } = await reader.read(); if (done) break; got += value.length; html += dec.decode(value, { stream: true }); if (/datePublished|published_time/i.test(html)) { const more = await reader.read(); if (!more.done) html += dec.decode(more.value, { stream: true }); break; } }
    try { reader.cancel(); } catch { /* ignore */ }
    const meta = (prop) => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name|itemprop)=["']${prop}["']`, "i")); return m ? m[1] : ""; };
    const candidates = [
      meta("article:published_time"), meta("og:published_time"), meta("datePublished"), meta("publish-date"), meta("pubdate"), meta("date"), meta("DC.date.issued"), meta("sailthru.date"), meta("parsely-pub-date"),
      (html.match(/"datePublished"\s*:\s*"([^"]+)"/) || [])[1], (html.match(/"uploadDate"\s*:\s*"([^"]+)"/) || [])[1],
      (html.match(/<time[^>]+datetime=["']([^"']+)["']/i) || [])[1]
    ].filter(Boolean);
    let date = "";
    for (const c of candidates) { const d = new Date(c); if (!isNaN(d) && d.getFullYear() > 1995 && d <= new Date(Date.now() + 864e5)) { date = d.toISOString(); break; } }
    return { date, site: clean(meta("og:site_name") || meta("application-name") || "") };
  } catch { return {}; } finally { clearTimeout(t); }
}

/* ---------- helpers ---------- */
function fail(code, message) { return Object.assign(new Error(message), { code }); }
async function sha256(s) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- الحماية من SSRF: لا نجلب إلا عناوين http/https عامة، ونعيد الفحص عند كل تحويل ---------- */
function isSafeUrl(raw) {
  let u; try { u = new URL(raw); } catch { return null; }
  if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
  if (u.port && u.port !== "80" && u.port !== "443") return null;
  const h = u.hostname.toLowerCase().replace(/\.+$/, "");
  if (!h || h.startsWith("[") || !h.includes(".")) return null;              // IPv6 حرفي أو اسم بلا نطاق (localhost)
  if (/(^|\.)(localhost|local|internal|lan|home|corp|intranet|test|invalid|example|onion|arpa)$/.test(h)) return null;
  if (/(^|\.)(nip\.io|sslip\.io|xip\.io|localtest\.me|lvh\.me|vcap\.me)$/.test(h)) return null; // أسماء تشير إلى عناوين داخلية
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);       // new URL يحوّل الصيغ العشرية/الست عشرية/الثمانية إلى هذه الصيغة
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) || (a === 198 && (b === 18 || b === 19))) return null;
  } else if (/^[\d.]+$/.test(h)) return null;
  return u;
}
async function safeFetch(url, init, hops = 5) {
  for (let i = 0; i <= hops; i++) {
    const u = isSafeUrl(url); if (!u) throw fail("bad-request", "blocked url");
    const r = await fetch(u.href, { ...init, redirect: "manual" });
    const loc = r.headers.get("location");
    if (r.status < 300 || r.status >= 400 || !loc) return r;
    try { await r.body.cancel(); } catch { /* ignore */ }
    url = new URL(loc, u).href;
  }
  throw fail("bad-request", "too many redirects");
}
/* يقرأ حتى max بايت فقط (صفحة ضخمة أو بطيئة لا تستنزف الذاكرة) */
async function readCapped(r, max) {
  if (!r.body) return "";
  const reader = r.body.getReader(), dec = new TextDecoder(); let s = "", got = 0;
  while (got < max) { const { done, value } = await reader.read(); if (done) break; got += value.length; s += dec.decode(value, { stream: true }); }
  try { await reader.cancel(); } catch { /* ignore */ }
  return s;
}
/* حدّ الطلبات لكل IP (تقريبي: لكل مركز بيانات). للحدّ الصارم أضف قاعدة Rate Limiting من لوحة Cloudflare. */
async function limited(req) {
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null; if (!cache) return false;
  try {
    const ip = req.headers.get("CF-Connecting-IP") || "0";
    const k = new Request(`https://cache.empire/rl/${encodeURIComponent(ip)}/${Math.floor(Date.now() / (RL_WIN * 1000))}`);
    const hit = await cache.match(k), n = hit ? +(await hit.text()) || 0 : 0;
    if (n >= RL_MAX) return true;
    await cache.put(k, new Response(String(n + 1), { headers: { "Cache-Control": `max-age=${RL_WIN}` } }));
  } catch { /* الكاش غير متاح: لا نمنع الخدمة */ }
  return false;
}
function unescapeHtml(s) { return s.replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&"); }
function clean(s, max = 220) { return unescapeHtml(String(s || "").replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim().slice(0, max); }
function stripUtm(u) { try { const x = new URL(u); [...x.searchParams.keys()].filter((k) => /^utm_/i.test(k)).forEach((k) => x.searchParams.delete(k)); return x.href; } catch { return ""; } }

/* ---------- 3) محقّق الأخبار: بحث ويب + قراءة الصفحات ---------- */
const V_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const V_SKIP = /(^|\.)(t\.me|telegram\.org|facebook\.com|instagram\.com|twitter\.com|x\.com|tiktok\.com|youtube\.com|youtu\.be|pinterest\.com|linkedin\.com|reddit\.com|quora\.com|threads\.net|duckduckgo\.com|google\.[a-z.]+|bing\.com)$/i;
const vHost = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

async function vSearch(q, env) {
  const get = (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(7000) });
  if (env.SERPER_API_KEY) {
    const r = await get("https://google.serper.dev/search", { method: "POST", headers: { "X-API-KEY": env.SERPER_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ q, num: 10, hl: "ar" }) });
    if (r.ok) return { engine: "Google", items: ((await r.json()).organic || []).map((i) => ({ url: i.link, title: i.title })) };
  }
  if (env.GOOGLE_API_KEY && env.GOOGLE_CX) {
    const r = await get(`https://www.googleapis.com/customsearch/v1?key=${env.GOOGLE_API_KEY}&cx=${env.GOOGLE_CX}&num=10&q=${encodeURIComponent(q)}`);
    if (r.ok) return { engine: "Google", items: ((await r.json()).items || []).map((i) => ({ url: i.link, title: i.title })) };
  }
  if (env.BRAVE_API_KEY) {
    const r = await get(`https://api.search.brave.com/res/v1/web/search?count=10&q=${encodeURIComponent(q)}`, { headers: { "X-Subscription-Token": env.BRAVE_API_KEY, Accept: "application/json" } });
    if (r.ok) return { engine: "Brave", items: (((await r.json()).web || {}).results || []).map((i) => ({ url: i.url, title: clean(i.title) })) };
  }
  const r = await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=xa-ar`, { headers: { "User-Agent": V_UA, "Accept-Language": "ar,en;q=0.8" } });
  const html = r.ok ? await r.text() : "";
  if (!/result__a/.test(html)) throw fail("blocked", "search engine refused the request");
  const items = [];
  for (const b of html.split(/<div class="result results_links/).slice(1)) {
    const a = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/); if (!a) continue;
    let url = unescapeHtml(a[1]); const m = url.match(/[?&]uddg=([^&]+)/); if (m) url = decodeURIComponent(m[1]); if (url.startsWith("//")) url = "https:" + url;
    if (!/duckduckgo\.com\/y\.js/.test(url)) items.push({ url, title: clean(a[2]) });
  }
  return { engine: "DuckDuckGo", items };
}

async function vRead(item) {
  try {
    const r = await safeFetch(item.url, { headers: { "User-Agent": V_UA, "Accept-Language": "ar,en;q=0.8", Accept: "text/html" }, signal: AbortSignal.timeout(6000) });
    if (!r.ok || !/html/.test(r.headers.get("content-type") || "")) { try { await r.body.cancel(); } catch { /* ignore */ } return null; }
    const html = await readCapped(r, 700_000);
    const meta = (re) => { const m = html.match(re); return m ? clean(m[1], 200) : ""; };
    let body = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
    const main = body.match(/<article\b[\s\S]*<\/article>/i) || body.match(/<main\b[\s\S]*<\/main>/i);
    if (main && main[0].length > 1500) body = main[0];
    const text = unescapeHtml(body.replace(/<\/(p|div|li|h[1-6]|tr|section|blockquote)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/&nbsp;|&#160;/g, " ").replace(/[ \t\r\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
    if (text.length < 300) return null;
    return {
      url: stripUtm(item.url), text: text.slice(0, 24_000),
      title: meta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || meta(/<title[^>]*>([\s\S]*?)<\/title>/i) || item.title || "",
      site: meta(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i) || vHost(item.url),
      date: meta(/<meta[^>]+(?:property|name|itemprop)=["'](?:article:published_time|datePublished|date|pubdate)["'][^>]+content=["']([^"']+)/i) || meta(/"datePublished"\s*:\s*"([^"]+)"/)
    };
  } catch { return null; }
}

async function verifyNews(body, env) {
  const queries = (Array.isArray(body.queries) ? body.queries : []).map((q) => String(q || "").replace(/\s+/g, " ").trim().slice(0, 160)).filter((q) => q.length >= 6).slice(0, 2);
  if (!queries.length) throw fail("bad-request", "queries required");
  const seen = new Set(); const picked = []; let engine = "";
  for (const q of queries) {
    const s = await vSearch(q, env); engine = s.engine;
    for (const it of s.items) {
      const h = vHost(it.url); if (!/^https?:\/\//.test(it.url) || !h || V_SKIP.test(h) || /\.(pdf|docx?|pptx?|zip|jpg|png|mp4)(\?|$)/i.test(it.url) || seen.has(it.url)) continue;
      seen.add(it.url); picked.push(it); if (picked.length >= 10) break;
    }
    if (picked.length >= 10) break;
  }
  const results = (await Promise.all(picked.map(vRead))).filter(Boolean);
  return { ok: true, engine, searched: queries, opened: picked.length, results };
}

/* ---------- 4) فاحص الروابط: تتبّع التحويلات وقراءة رأس الصفحة النهائية ---------- */
const L_HOPS = 10, L_BYTES = 250_000;

async function linkTrace(body) {
  let url = typeof body.url === "string" ? body.url.trim() : "";
  if (!/^https?:\/\//i.test(url) || url.length > 2000) throw fail("bad-request", "url required");
  const chain = []; let html = "", status = 0, type = "", download = "";
  for (let i = 0; i < L_HOPS; i++) {
    let u; try { u = new URL(url); } catch { break; }
    // مخطط غير http/https (javascript: أو data:…): لا نعيد الرابط نفسه حتى لا يصير رابطاً قابلاً للنقر في الصفحة
    if (!/^https?:$/.test(u.protocol)) { chain.push({ url: "", scheme: u.protocol.slice(0, 20), status: 0, via: "scheme" }); break; }
    if (!isSafeUrl(url)) { chain.push({ url, status: 0, via: "private" }); break; }
    let r;
    try { r = await fetch(url, { redirect: "manual", headers: { "User-Agent": V_UA, Accept: "text/html,*/*;q=0.5", "Accept-Language": "ar,en;q=0.8" }, signal: AbortSignal.timeout(6000) }); }
    catch { chain.push({ url, status: 0, via: "unreachable" }); status = 0; break; }
    status = r.status; type = (r.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const hop = { url, status }; chain.push(hop);
    const loc = r.headers.get("location");
    if (status >= 300 && status < 400 && loc) { try { await r.body.cancel(); } catch { /* ignore */ } try { url = new URL(loc, url).href; } catch { break; } continue; }
    const cd = r.headers.get("content-disposition") || "";
    if (/attachment/i.test(cd) || (type && !/html|json|text|xml/.test(type) && /octet-stream|zip|x-msdownload|android\.package|x-rar|x-7z|x-apple-diskimage|msi|java-archive/.test(type))) {
      download = clean((cd.match(/filename\*?=(?:UTF-8'')?["']?([^"';]+)/i) || [])[1] || u.pathname.split("/").pop() || type, 120);
      try { await r.body.cancel(); } catch { /* ignore */ } break;
    }
    if (!/html/.test(type) || !r.body) { try { await r.body.cancel(); } catch { /* ignore */ } break; }
    const reader = r.body.getReader(), dec = new TextDecoder(); html = ""; let got = 0;
    while (got < L_BYTES) { const { done, value } = await reader.read(); if (done) break; got += value.length; html += dec.decode(value, { stream: true }); }
    try { reader.cancel(); } catch { /* ignore */ }
    // تحويل داخل الصفحة: meta refresh أو سطر JavaScript في صفحة قصيرة
    const meta = html.match(/<meta[^>]+http-equiv=["']?refresh["']?[^>]*content=["']?\s*\d+\s*;\s*url=['"]?([^"'>\s]+)/i);
    const js = !meta && html.length < 6000 && html.match(/(?:window\.|document\.|top\.|self\.)?location(?:\.href|\.replace|\.assign)?\s*(?:=|\()\s*["']((?:https?:)?\/\/[^"']+)["']/i);
    const next = (meta && meta[1]) || (js && js[1]);
    if (next && i < L_HOPS - 1) { let n; try { n = new URL(unescapeHtml(next), url).href; } catch { n = ""; } if (n && n !== url) { hop.via = meta ? "meta" : "js"; url = n; html = ""; continue; } }
    break;
  }
  const final = chain.length ? chain[chain.length - 1].url || (chain.length > 1 ? chain[chain.length - 2].url : "") : url; const fHost = vHost(final);
  const formHosts = [...new Set([...html.matchAll(/<form[^>]+action=["']?(https?:\/\/[^"'\s>]+)/gi)].map((m) => vHost(m[1])).filter((h) => h && h !== fHost && !h.endsWith("." + fHost)))].slice(0, 5);
  return {
    ok: true, final, status, type, chain,
    title: clean((html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "", 200),
    signals: {
      password: /<input[^>]+type=["']?password/i.test(html),
      card: /<input[^>]+(?:name|id|autocomplete|placeholder)=["'][^"']*(?:cvv|cvc|cc-number|card[-_ ]?number|cardnumber|رقم البطاقة)/i.test(html),
      formHosts, download
    }
  };
}

