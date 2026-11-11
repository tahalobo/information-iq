#!/usr/bin/env node
/* ==========================================================
   مولّد الصفحات الثابتة: صفحة HTML لكل معلومة ومنشور
   - عنوان ووصف وصورة معاينة (Open Graph) تظهر عند المشاركة في واتساب وفيسبوك وتليغرام
   - المحتوى مكتوب داخل الصفحة نفسها ليقرأه غوغل
   - sitemap.xml وrobots.txt
   الاستخدام:  node scripts/build-pages.mjs
   ========================================================== */
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "post");
const rel = (...p) => path.join(ROOT, ...p);

/* ---------- Load the browser data files in a sandbox ---------- */
function loadBrowserScript(file, ctx = { window: {} }) {
  if (!existsSync(file)) return ctx.window;
  ctx.window.window = ctx.window;
  vm.runInNewContext(readFileSync(file, "utf8"), { window: ctx.window, Intl, Date, document: undefined });
  return ctx.window;
}
const W = { window: {} };
loadBrowserScript(rel("assets/js/config.js"), W);
loadBrowserScript(rel("assets/js/data.js"), W);
loadBrowserScript(rel("assets/js/telegram-data.js"), W);
loadBrowserScript(rel("assets/js/branches-data.js"), W);
const { SITE, FACTS = [], CATEGORIES = [], TG, BR, BRANCHES = [] } = W.window;

const siteCfg = existsSync(rel("scripts/site.config.json")) ? JSON.parse(readFileSync(rel("scripts/site.config.json"), "utf8")) : {};
const SITE_URL = (process.env.SITE_URL || siteCfg.siteUrl || "").replace(/\/+$/, "");
const abs = (p) => (SITE_URL ? `${SITE_URL}/${p.replace(/^\/+/, "")}` : p);

/* ---------- Helpers ---------- */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const strip = (h) => String(h || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, "") + "…" : s);
const branchOf = (id) => BRANCHES.find((b) => b.id === id);
const catName = (id) => (CATEGORIES.find((c) => c.id === id) || (branchOf(id) && { name: branchOf(id).short }) || { name: "معلومات" }).name;
const TYPE_NAMES = { fact: "معلومة", news: "خبر", event: "فعالية", discussion: "سؤال للنقاش", literature: "شعر وأدب" };
const fmtDate = (d) => { try { return new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { year: "numeric", month: "long", day: "numeric" }).format(new Date(d)); } catch { return d; } };

/* ---------- Collect every item ---------- */
const items = [];
for (const f of FACTS) {
  const og = existsSync(rel(`assets/img/og/${f.id}.jpg`)) ? `assets/img/og/${f.id}.jpg` : "assets/img/og/default.jpg";
  items.push({ id: f.id, type: "fact", title: f.title, desc: f.excerpt, cat: f.cat, date: f.date, image: og, images: [], body: f.body + (f.didYouKnow ? `<div class="didyouknow"><div><strong>هل تعلم؟</strong>${esc(f.didYouKnow)}</div></div>` : ""), sources: f.sources || [], tags: f.tags || [] });
}
for (const p of (TG && TG.posts) || []) {
  const detail = loadBrowserScript(rel(`assets/tg/posts/${p.id}.js`)).TG_POST || {};
  const url = `https://t.me/${TG.channel}/${p.id}`;
  items.push({
    id: `tg-${p.id}`, type: p.type, title: p.title, desc: p.excerpt, cat: p.cat, date: p.date,
    image: (p.image && !/^https?:/.test(p.image) ? p.image : null) || "assets/img/og/default.jpg",
    images: detail.images || [], body: detail.html || `<p>${esc(p.excerpt)}</p>`, video: !!p.video,
    sources: [{ name: "قناة إمبراطورية المعلومات على تليغرام", url }, ...(detail.sources || []).map((s) => ({ name: s.site && s.site !== s.name ? `${s.name} — ${s.site}` : s.name, url: s.url, quote: s.quote }))],
    tags: p.tags || [], tgUrl: url
  });
}

for (const p of (BR && BR.posts) || []) {
  const b = branchOf(p.b) || { name: p.b, channel: "" };
  const detail = loadBrowserScript(rel(`assets/tg/posts/${p.id}.js`)).TG_POST || {};
  items.push({
    id: p.id, type: "news", branch: p.b, title: p.title, desc: p.excerpt, cat: p.b, date: p.date,
    image: p.image || "assets/img/og/default.jpg", images: detail.images || [], body: detail.html || `<p>${esc(p.excerpt)}</p>`, video: !!p.video,
    sources: [{ name: `قناة ${b.name} على تليغرام`, url: detail.url || `https://t.me/${b.channel}/${p.msg}` }], tags: p.tags || []
  });
}

/* ---------- Page template ---------- */
function page(it) {
  const file = `post/${it.id}.html`;
  const title = `${it.title} | ${SITE.name}`;
  const desc = clip(strip(it.desc) || strip(it.body), 200);
  const img = /^https?:/.test(it.image) ? it.image : abs(it.image);
  const ld = {
    "@context": "https://schema.org", "@type": it.type === "news" ? "NewsArticle" : "Article",
    headline: clip(it.title, 110), description: desc, image: [img], datePublished: it.date, inLanguage: "ar",
    author: { "@type": "Organization", name: SITE.name, url: abs("index.html") },
    publisher: { "@type": "Organization", name: SITE.name, logo: { "@type": "ImageObject", url: abs("assets/img/favicon.svg") } },
    mainEntityOfPage: abs(file)
  };
  const cites = it.sources.filter((s) => s.url && !/\/\/t\.me\//.test(s.url)).map((s) => s.url);
  if (cites.length) ld.citation = cites;
  const gallery = it.images.length ? `<div class="gallery${it.images.length === 1 ? " single" : ""}">${it.images.map((s, i) => `<img src="${esc(s)}" alt="${esc(it.title)} - صورة ${i + 1}" loading="lazy" onerror="this.remove()">`).join("")}</div>` : "";
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<base href="../">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(abs(file))}">
<meta name="theme-color" content="#03050c">
<meta property="og:type" content="article">
<meta property="og:site_name" content="${esc(SITE.name)}">
<meta property="og:locale" content="ar_IQ">
<meta property="og:title" content="${esc(it.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:url" content="${esc(abs(file))}">
<meta property="article:published_time" content="${esc(it.date)}">
<meta property="article:section" content="${esc(catName(it.cat))}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(it.title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>
<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="الإمبراطورية">
<script>try{var d=document.documentElement,t=localStorage.getItem("theme");if(t)d.dataset.theme=JSON.parse(t);if(!matchMedia("(prefers-reduced-motion: reduce)").matches){if(!sessionStorage.getItem("fx-seen"))d.classList.add("is-loading");else if(sessionStorage.getItem("fx-nav"))d.classList.add("entering")}sessionStorage.removeItem("fx-nav")}catch(e){}</script>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Reem+Kufi:wght@500;600;700&family=Lalezar&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/style.css">
</head>
<body data-page="fact" data-progress>
<div id="site-header"></div>
<main>
  <div class="container" style="padding-top:28px;padding-bottom:64px" id="root">
    <article class="container-narrow" style="margin:0 auto">
      <nav class="breadcrumbs"><a href="index.html">الرئيسية</a> › ${it.branch ? `<a href="branch.html">الفروع</a> › <a href="branch.html?b=${esc(it.branch)}">${esc(catName(it.cat))}</a>` : `<a href="facts.html">المعلومات</a> › <a href="facts.html?cat=${esc(it.cat)}">${esc(catName(it.cat))}</a>`}</nav>
      ${gallery}
      <span class="badge mb-2">${esc(catName(it.cat))}${TYPE_NAMES[it.type] && it.type !== "fact" ? " · " + TYPE_NAMES[it.type] : ""}</span>
      <h1 style="font-size:clamp(1.6rem,4.5vw,2.4rem);line-height:1.45">${esc(it.title)}</h1>
      <p class="meta mb-3"><time datetime="${esc(it.date)}">${esc(fmtDate(it.date))}</time></p>
      <div class="prose">${it.body}</div>
      <h2>المصادر</h2>
      <ol class="sources">${it.sources.map((s) => `<li>${s.url ? `<a class="link" href="${esc(s.url)}" rel="noopener">${esc(s.name)}</a>` : esc(s.name)}${s.quote ? `<br><small class="muted">«${esc(s.quote)}»</small>` : ""}</li>`).join("")}</ol>
      ${it.tags.length ? `<p class="tags mt-2">${it.tags.map((t) => `<a class="tag-link" href="facts.html?q=${encodeURIComponent(t)}">#${esc(t)}</a>`).join(" ")}</p>` : ""}
    </article>
  </div>
</main>
<div id="site-footer"></div>
<script>window.STATIC_ID=${JSON.stringify(it.id)};</script>
<script src="https://unpkg.com/lucide@0.460.0/dist/umd/lucide.min.js"></script>
<script src="assets/js/config.js"></script>
<script src="assets/js/data.js"></script>
<script src="assets/js/telegram-data.js"></script>
<script src="assets/js/branches-data.js"></script>
<script src="assets/js/static-index.js"></script>
<script src="assets/js/core.js"></script>
<script src="assets/js/pages/fact.js"></script>
<script src="https://unpkg.com/lenis@1.1.13/dist/lenis.min.js"></script>
<script src="assets/js/fx.js"></script>
<script src="assets/js/gl.js"></script>
</body>
</html>
`;
}

/* ---------- Write ---------- */
await fs.mkdir(OUT, { recursive: true });
const keep = new Set();
for (const it of items) {
  const name = `${it.id}.html`; keep.add(name);
  const html = page(it);
  const target = path.join(OUT, name);
  if (!existsSync(target) || readFileSync(target, "utf8") !== html) await fs.writeFile(target, html);
}
let removed = 0;
for (const f of await fs.readdir(OUT)) if (f.endsWith(".html") && !keep.has(f)) { await fs.rm(path.join(OUT, f)); removed++; }

await fs.writeFile(rel("assets/js/static-index.js"),
  `/* مولّد تلقائياً بواسطة scripts/build-pages.mjs */\nwindow.SITE_URL=${JSON.stringify(SITE_URL)};\nwindow.STATIC_POSTS=${JSON.stringify(Object.fromEntries(items.map((i) => [i.id, 1])))};\n`);

/* Absolute og:image on the main pages (WhatsApp ignores relative ones) */
const mainPages = (await fs.readdir(ROOT)).filter((f) => f.endsWith(".html"));
for (const f of mainPages) {
  const p = rel(f); let h = readFileSync(p, "utf8");
  const next = h.replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${abs("assets/img/og/default.jpg")}$2`)
                .replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${abs(f)}$2`);
  if (next !== h) await fs.writeFile(p, next);
}

/* sitemap + robots */
const today = new Date().toISOString().slice(0, 10);
if (SITE_URL) {
  const urls = [...mainPages.filter((f) => f !== "fact.html" && f !== "offline.html").map((f) => ({ loc: abs(f === "index.html" ? "" : f), lastmod: today })),
    ...items.map((i) => ({ loc: abs(`post/${i.id}.html`), lastmod: String(i.date).slice(0, 10) }))];
  await fs.writeFile(rel("sitemap.xml"), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${u.lastmod}</lastmod></url>`).join("\n")}\n</urlset>\n`);
}
await fs.writeFile(rel("robots.txt"), `User-agent: *\nAllow: /\n${SITE_URL ? `Sitemap: ${SITE_URL}/sitemap.xml\n` : ""}`);

console.log(`✔ ${items.length} صفحة ثابتة في post/ (حُذف ${removed} قديمة)`);
console.log(SITE_URL ? `  الرابط الأساسي: ${SITE_URL} · sitemap.xml جاهز` : "  ⚠ لم يُحدَّد siteUrl: روابط المعاينة نسبية، وsitemap.xml لم يُكتب. ضع الرابط في scripts/site.config.json أو متغير SITE_URL.");
