/* ==========================================================
   عامل البحث العكسي — Cloudflare Worker (مجاني، بلا مفتاح API وبلا بطاقة دفع)

   يستقبل صورة من موقعنا ويبحث عنها في فهرس صور ياندكس (بحث بالصورة)، ثم يعيد
   النتائج JSON ليعرضها الموقع داخل صفحته. لا يحتاج أي مفتاح أو حساب مدفوع.

   مساران:
     POST /        { image: "data:image/jpeg;base64,..." } أو { url: "https://..." }
                   ← الصفحات التي ظهرت فيها الصورة + نسخها + الصور المشابهة + الوسوم
     POST /dates   { urls: ["https://...", ...] }   (حتى 8 روابط)
                   ← تاريخ نشر كل صفحة واسم موقعها (يزور الصفحة ويقرأ رأسها فقط)
     POST /verify  { queries: ["نص البحث", ...] }   (حتى عبارتين) — لمحقّق الأخبار verify.html
                   ← يبحث في الويب، يفتح أفضل الصفحات، ويعيد نص كل صفحة ليقارنه الموقع بالخبر
                   محرك البحث: أول مفتاح موجود من SERPER_API_KEY (نتائج غوغل) أو
                   GOOGLE_API_KEY + GOOGLE_CX أو BRAVE_API_KEY، وإلا DuckDuckGo بلا مفتاح (قد يُحظر)

   تنبيه: هذا استخدام غير رسمي لصفحة نتائج ياندكس. قد يتغير شكلها أو تطلب كابتشا،
   وعندها يعيد العامل {error:"blocked"} ويعرض الموقع المحركات الخارجية بدلاً منه.

   الإعداد: راجع worker/README.md
   المتغيرات (اختيارية):
     ALLOWED_ORIGINS   نطاقات موقعك مفصولة بفاصلة، مثل: https://information-iq.com
   ========================================================== */

const MAX_B64 = 4_000_000;        // ≈ 3 MB image
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
    const okOrigin = !allowed.length || allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = {
      "Access-Control-Allow-Origin": okOrigin ? origin || "*" : allowed[0] || "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      Vary: "Origin"
    };
    const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });

    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return json({ ok: true, service: "empire-reverse-search", engine: "yandex" });
    if (!okOrigin) return json({ error: "origin" }, 403);

    let body;
    try { body = await req.json(); } catch { return json({ error: "bad-json" }, 400); }

    try {
      const route = new URL(req.url).pathname.replace(/\/+$/, "");
      if (route.endsWith("/verify")) return json(await verifyNews(body, env));
      if (route.endsWith("/dates")) return json(await dates(body));
      return await search(body, json, ctx);
    } catch (e) {
      return json({ error: e.code || "engine", detail: String(e.message || e).slice(0, 200) }, e.code === "blocked" ? 503 : 502);
    }
  }
};

/* ---------- 1) البحث بالصورة ---------- */
async function search(body, json, ctx) {
  const image = typeof body.image === "string" ? body.image.replace(/^data:image\/[\w+.-]+;base64,/, "") : "";
  const url = typeof body.url === "string" && /^https?:\/\//i.test(body.url) ? body.url : "";
  if (!image && !url) return json({ error: "no-image" }, 400);
  if (image.length > MAX_B64) return json({ error: "too-large" }, 413);

  // الصورة نفسها ← الجواب نفسه، من الكاش
  const key = await sha256(image || url);
  const cacheKey = new Request(`https://cache.empire/rs2/${key}`);
  const cache = typeof caches !== "undefined" && caches.default ? caches.default : null;
  if (cache) { const hit = await cache.match(cacheKey); if (hit) { const data = await hit.json(); data.cached = true; return json(data); } }

  let q;
  if (image) {
    const bytes = Uint8Array.from(atob(image), (c) => c.charCodeAt(0));
    const up = await fetch(`${YA}/images-apphost/image-download?cbird=111&images_avatars_size=preview&images_avatars_namespace=images-cbir`, { method: "POST", headers: { ...YA_HEADERS, "Content-Type": "image/jpeg" }, body: bytes });
    const u = await up.json().catch(() => null);
    const orig = u && u.sizes && u.sizes.orig && u.sizes.orig.path;
    if (!up.ok || !u || !u.cbir_id || !orig) throw fail("blocked", `upload ${up.status}`);
    q = `rpt=imageview&url=${encodeURIComponent(orig)}&cbir_id=${encodeURIComponent(u.cbir_id)}`;
  } else q = `rpt=imageview&url=${encodeURIComponent(url)}`;

  const r = await fetch(`${YA}/images/search?${q}`, { headers: YA_HEADERS, redirect: "follow" });
  const html = await r.text();
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
    return { thumb: https(t.imageUrl), url: src, title: clean(t.title) };
  }).filter((t) => t.thumb && !ADULT.test(t.title + " " + t.url)).slice(0, 24);

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
  const urls = (Array.isArray(body.urls) ? body.urls : []).filter((u) => typeof u === "string" && /^https?:\/\//i.test(u)).slice(0, MAX_DATE_URLS);
  const out = await Promise.all(urls.map(async (u) => ({ url: u, ...(await pageMeta(u)) })));
  return { ok: true, pages: out };
}

async function pageMeta(url) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), PAGE_TIMEOUT);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": "EmpireFactCheckBot/1.0 (+reverse-image-verification)", Accept: "text/html" } });
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
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s.length > 200000 ? s.slice(0, 100000) + s.length + s.slice(-100000) : s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
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
    const r = await fetch(item.url, { headers: { "User-Agent": V_UA, "Accept-Language": "ar,en;q=0.8", Accept: "text/html" }, redirect: "follow", signal: AbortSignal.timeout(6000) });
    if (!r.ok || !/html/.test(r.headers.get("content-type") || "")) return null;
    const html = (await r.text()).slice(0, 700_000);
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
