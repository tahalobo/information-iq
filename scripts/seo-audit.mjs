#!/usr/bin/env node
/* ==========================================================
   مدقّق SEO: يفحص كل صفحات الموقع الثابتة ويفشل (exit 1) عند أي خطأ.
   يفحص معاينة مواقع التواصل: og:image موجودة 1200×630 JPEG/PNG أقل من 300 ك.ب، كل روابط og مطلقة https، og:title/description ضمن حدود القطع، وسوم twitter كاملة.
   يفحص: العنوان والوصف (وجود، طول، تكرار) · canonical · lang/dir · h1 واحد · JSON-LD صالح ومطابق لما في الصفحة
          · الصور بلا alt · الروابط الداخلية المكسورة · وجود كل صفحة في sitemap والعكس · og:image مطلقة · الخلاصات
   الاستخدام:  node scripts/seo-audit.mjs [--verbose]
   ========================================================== */
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { imageSize } from "./seo/imgsize.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (...p) => path.join(ROOT, ...p);
const VERBOSE = process.argv.includes("--verbose");
const cfg = existsSync(rel("scripts/site.config.json")) ? JSON.parse(readFileSync(rel("scripts/site.config.json"), "utf8")) : {};
const SITE_URL = (process.env.SITE_URL || cfg.siteUrl || "").replace(/\/+$/, "");

const LIMITS = { titleMin: 15, titleMax: 95, descMin: 70, descMax: 170 };
/* حدود بطاقة المشاركة: 1200×630 (نسبة 1.91:1 المعتمدة في فيسبوك/واتساب/X/لينكدإن)، وأقل من 300 ك.ب لواتساب */
const SHARE = { w: 1200, h: 630, maxBytes: 300 * 1024, titleMax: 90, descMax: 200 };
const shareImages = new Set();
const errors = [], warnings = [];
const err = (page, msg) => errors.push(`${page}: ${msg}`);
const warn = (page, msg) => warnings.push(`${page}: ${msg}`);

/* ---------- Collect pages ---------- */
const pages = [];
for (const f of readdirSync(ROOT)) if (f.endsWith(".html") && !/^google[0-9a-f]+\.html$/.test(f)) pages.push(f);
for (const dir of ["post", "topic", "archive"]) if (existsSync(rel(dir))) for (const f of readdirSync(rel(dir))) if (f.endsWith(".html")) pages.push(`${dir}/${f}`);

const unescape = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = (h) => unescape(String(h).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const normText = (s) => String(s).replace(/[ً-ٰٟـ]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const attr = (tag, name) => { const m = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "i")); return m ? unescape(m[1] ?? m[2]) : null; };
const fileExists = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const toPath = (url) => { // رابط مطلق من الموقع ← مسار ملف
  if (!SITE_URL || !url.startsWith(SITE_URL)) return null;
  let p = decodeURI(url.slice(SITE_URL.length).split("#")[0].split("?")[0]).replace(/^\/+/, "");
  if (p === "" || p.endsWith("/")) p += "index.html";
  return p;
};

const titles = new Map(), descs = new Map(), indexable = new Set();
const ldTypes = {};
let ldCount = 0, linkCount = 0, imgCount = 0;

for (const page of pages) {
  const raw = readFileSync(rel(page), "utf8");
  const html = raw.replace(/<script\b(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  const head = html.slice(0, html.indexOf("</head>"));
  const body = html.slice(html.indexOf("</head>"));
  const dir = path.posix.dirname(page);
  const base = attr((head.match(/<base\b[^>]*>/i) || [""])[0], "href");
  const robots = attr((head.match(/<meta\s+name="robots"[^>]*>/i) || [""])[0], "content") || "";
  const noindex = /noindex/.test(robots);

  /* lang / dir */
  const htmlTag = (html.match(/<html\b[^>]*>/i) || [""])[0];
  if (attr(htmlTag, "lang") !== "ar") err(page, "الوسم <html> بلا lang=\"ar\"");
  if (attr(htmlTag, "dir") !== "rtl") err(page, "الوسم <html> بلا dir=\"rtl\"");

  /* title + description */
  const title = unescape((head.match(/<title>([^<]*)<\/title>/i) || [])[1] || "").trim();
  const desc = (attr((head.match(/<meta\s+name="description"[^>]*>/i) || [""])[0], "content") || "").trim();
  if (!title) err(page, "العنوان <title> مفقود");
  if (!noindex) {
    if (!desc) err(page, "الوصف meta description مفقود");
    if (title && (title.length < LIMITS.titleMin || title.length > LIMITS.titleMax)) err(page, `طول العنوان ${title.length} حرفاً (المقبول ${LIMITS.titleMin}–${LIMITS.titleMax}): «${title}»`);
    else if (title.length > 70) warn(page, `العنوان ${title.length} حرفاً وسيُقتطع في نتائج البحث`);
    if (desc && (desc.length < LIMITS.descMin || desc.length > LIMITS.descMax)) err(page, `طول الوصف ${desc.length} حرفاً (المقبول ${LIMITS.descMin}–${LIMITS.descMax})`);
    if (title) (titles.get(title) || titles.set(title, []).get(title)).push(page);
    if (desc) (descs.get(desc) || descs.set(desc, []).get(desc)).push(page);
  }

  /* canonical */
  const canon = attr((head.match(/<link\s+rel="canonical"[^>]*>/i) || [""])[0], "href");
  if (!noindex) {
    indexable.add(page);
    if (!canon) err(page, "canonical مفقود");
    else if (SITE_URL) {
      if (!/^https?:\/\//.test(canon)) err(page, `canonical ليس رابطاً مطلقاً: ${canon}`);
      else { const p = toPath(canon); if (p !== page) err(page, `canonical لا يشير إلى الصفحة نفسها: ${canon}`); }
    }
  }

  /* Open Graph */
  const og = (n) => attr((head.match(new RegExp(`<meta\\s+property="og:${n}"[^>]*>`, "i")) || [""])[0], "content");
  if (!noindex) {
    for (const n of ["title", "description", "url", "image", "type"]) if (!og(n)) err(page, `og:${n} مفقود`);
    if (SITE_URL && og("image") && !/^https?:\/\//.test(og("image"))) err(page, "og:image ليس رابطاً مطلقاً");
    const im = og("image") && toPath(og("image"));
    if (im && !fileExists(rel(im))) err(page, `og:image يشير إلى ملف غير موجود: ${im}`);
    /* --- معاينة مواقع التواصل (واتساب، تيليغرام، فيسبوك/ماسنجر/إنستغرام، X، لينكدإن، iMessage، ديسكورد) --- */
    const tw = (n) => attr((head.match(new RegExp(`<meta\\s+name="twitter:${n}"[^>]*>`, "i")) || [""])[0], "content");
    if (im && fileExists(rel(im))) {
      shareImages.add(im);
      const s = imageSize(rel(im)), bytes = statSync(rel(im)).size;
      if (!s) err(page, `og:image ليست JPEG/PNG مقروءة: ${im}`);
      else {
        if (s.width !== SHARE.w || s.height !== SHARE.h) err(page, `og:image بأبعاد ${s.width}×${s.height} (المطلوب ${SHARE.w}×${SHARE.h}): ${im}`);
        if (s.type !== "image/jpeg" && s.type !== "image/png") err(page, `og:image بصيغة ${s.type} لا تدعمها كل المنصات`);
        if (String(s.width) !== og("image:width") || String(s.height) !== og("image:height")) err(page, "og:image:width/height لا تطابق أبعاد الملف");
        if (s.type !== og("image:type")) err(page, "og:image:type لا يطابق صيغة الملف");
      }
      if (bytes > SHARE.maxBytes) err(page, `og:image حجمها ${Math.round(bytes / 1024)} ك.ب (حد واتساب ${SHARE.maxBytes / 1024} ك.ب): ${im}`);
    } else if (og("image") && !im && SITE_URL) err(page, `og:image على نطاق خارجي (قد تنتهي صلاحيتها): ${og("image").slice(0, 60)}`);
    for (const n of ["url", "image", "image:secure_url"]) if (SITE_URL && og(n) && !/^https:\/\//.test(og(n))) err(page, `og:${n} ليس رابط https مطلقاً`);
    if (SITE_URL && /^https:/.test(SITE_URL) && !og("image:secure_url")) err(page, "og:image:secure_url مفقود");
    if (canon && og("url") && og("url") !== canon) err(page, "og:url يختلف عن canonical");
    for (const n of ["site_name", "locale", "image:alt"]) if (!og(n)) err(page, `og:${n} مفقود`);
    if (og("locale") && og("locale") !== "ar_IQ") err(page, "og:locale ليس ar_IQ");
    const ot = og("title") || "", od = og("description") || "";
    if (ot.length > SHARE.titleMax) err(page, `og:title ${ot.length} حرفاً (سيُقطع في البطاقة، الحد ${SHARE.titleMax})`);
    if (od && (od.length > SHARE.descMax || od.length < 30)) err(page, `og:description ${od.length} حرفاً (المقبول 30–${SHARE.descMax})`);
    if (tw("card") !== "summary_large_image") err(page, "twitter:card يجب أن يكون summary_large_image");
    for (const n of ["title", "description", "image", "image:alt"]) if (!tw(n)) err(page, `twitter:${n} مفقود`);
    if (tw("image") && og("image") && tw("image") !== og("image")) err(page, "twitter:image تختلف عن og:image");
    if (og("type") === "article") for (const n of ["published_time", "modified_time", "section"]) if (!attr((head.match(new RegExp(`<meta\\s+property="article:${n}"[^>]*>`, "i")) || [""])[0], "content")) err(page, `article:${n} مفقود`);
    if ((dir === "post") !== (og("type") === "article")) err(page, `og:type = ${og("type")} لا يناسب نوع الصفحة`);
  }

  /* headings */
  const h1s = body.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/gi) || [];
  if (page !== "fact.html") {
    if (h1s.length !== 1) err(page, `عدد وسوم h1 = ${h1s.length} (يجب أن يكون واحداً)`);
    else if (!text(h1s[0])) err(page, "h1 فارغ");
    const firstH = body.search(/<h[2-6]\b/i), h1At = body.search(/<h1\b/i);
    if (firstH >= 0 && h1At >= 0 && firstH < h1At) warn(page, "عنوان فرعي يسبق h1");
  }

  /* images */
  for (const tag of body.match(/<img\b[^>]*>/gi) || []) {
    imgCount++;
    if (attr(tag, "alt") === null) err(page, `صورة بلا alt: ${tag.slice(0, 90)}`);
    const src = attr(tag, "src");
    if (src && !/^(https?:|data:|blob:)/.test(src) && (dir === "post" || dir === "topic" || dir === "archive") && attr(tag, "width") === null) warn(page, `صورة بلا أبعاد: ${src}`);
  }

  /* internal links + assets */
  const resolve = (href) => {
    if (!href || /^(https?:|mailto:|tel:|data:|blob:|javascript:|#|\{|\$)/.test(href)) { const p = href && toPath(href); return p ?? null; }
    let p = href.split("#")[0].split("?")[0];
    if (!p) return null;
    try { p = decodeURI(p); } catch { /* keep */ }
    const baseDir = base != null ? (base.startsWith("/") ? "" : path.posix.normalize(path.posix.join(dir === "." ? "" : dir, base))) : (dir === "." ? "" : dir);
    p = path.posix.normalize(path.posix.join(baseDir, p)).replace(/^(\.\.\/)+/, "");
    if (p === "." || p === "") p = "index.html";
    if (p.endsWith("/")) p += "index.html";
    return p;
  };
  const refs = [...(html.match(/<a\b[^>]*>/gi) || []).map((t) => attr(t, "href")), ...(html.match(/<(?:link|img|script|source)\b[^>]*>/gi) || []).map((t) => attr(t, "href") ?? attr(t, "src"))];
  for (const href of refs) {
    const p = resolve(href);
    if (!p) continue;
    linkCount++;
    if (!fileExists(rel(p))) err(page, `رابط داخلي مكسور: ${href}`);
  }

  /* JSON-LD */
  const bodyText = normText(text(body));
  for (const m of raw.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let data;
    try { data = JSON.parse(m[1]); } catch (e) { err(page, `JSON-LD غير صالح: ${e.message}`); continue; }
    const nodes = data["@graph"] || [data];
    if (data["@context"] !== "https://schema.org") err(page, "JSON-LD بلا @context صحيح");
    for (const n of nodes) {
      ldCount++; ldTypes[n["@type"]] = (ldTypes[n["@type"]] || 0) + 1;
      const need = (keys) => { for (const k of keys) if (n[k] == null || n[k] === "" || (Array.isArray(n[k]) && !n[k].length)) err(page, `JSON-LD ${n["@type"]}: الحقل ${k} مفقود`); };
      const urls = [];
      JSON.stringify(n, (k, v) => { if (typeof v === "string" && /^(url|item|@id|logo|contentUrl|urlTemplate)$/.test(k)) urls.push(v); return v; });
      for (const u of urls) if (SITE_URL && !/^https?:\/\//.test(u)) err(page, `JSON-LD ${n["@type"]}: رابط غير مطلق «${u}»`);
      switch (n["@type"]) {
        case "Article": case "NewsArticle": {
          need(["headline", "image", "datePublished", "dateModified", "author", "publisher", "mainEntityOfPage"]);
          if (n.headline && n.headline.length > 110) err(page, "JSON-LD: headline أطول من 110 حرفاً");
          if (n.headline && !bodyText.includes(normText(n.headline).slice(0, 40))) err(page, "JSON-LD: headline غير ظاهر في نص الصفحة");
          for (const k of ["datePublished", "dateModified"]) if (n[k] && isNaN(Date.parse(n[k]))) err(page, `JSON-LD: ${k} ليس تاريخاً صالحاً`);
          if (n.datePublished && n.dateModified && Date.parse(n.dateModified) < Date.parse(n.datePublished)) err(page, "JSON-LD: dateModified يسبق datePublished");
          if (!n.publisher?.logo?.url) err(page, "JSON-LD: publisher.logo مفقود");
          for (const im of [].concat(n.image || [])) { const p = toPath(typeof im === "string" ? im : im.url || ""); if (p && !fileExists(rel(p))) err(page, `JSON-LD: صورة غير موجودة ${p}`); }
          break;
        }
        case "BreadcrumbList":
          need(["itemListElement"]);
          (n.itemListElement || []).forEach((li, i) => {
            if (li.position !== i + 1) err(page, "BreadcrumbList: ترتيب position خاطئ");
            if (!li.name) err(page, "BreadcrumbList: عنصر بلا اسم");
            const p = li.item && toPath(li.item); if (p && !fileExists(rel(p))) err(page, `BreadcrumbList: رابط مكسور ${li.item}`);
          });
          break;
        case "FAQPage":
          need(["mainEntity"]);
          for (const q of n.mainEntity || []) {
            if (!q.name || !q.acceptedAnswer?.text) err(page, "FAQPage: سؤال بلا جواب");
            else if (!bodyText.includes(normText(q.name)) || !bodyText.includes(normText(q.acceptedAnswer.text).slice(0, 60))) err(page, `FAQPage: سؤال غير ظاهر في الصفحة «${q.name}»`);
          }
          break;
        case "HowTo":
          need(["name", "step"]);
          for (const s of n.step || []) if (!bodyText.includes(normText(s.name)) || !bodyText.includes(normText(s.text).slice(0, 50))) err(page, `HowTo: خطوة غير ظاهرة في الصفحة «${s.name}»`);
          break;
        case "WebSite": need(["name", "url", "potentialAction"]); break;
        case "Organization": need(["name", "url", "logo", "sameAs"]); break;
        case "WebApplication": need(["name", "url", "applicationCategory", "operatingSystem", "offers"]); break;
        case "ItemList": case "CollectionPage": {
          const list = n["@type"] === "ItemList" ? n : n.mainEntity;
          for (const li of (list && list.itemListElement) || []) { const p = li.url && toPath(li.url); if (p && !fileExists(rel(p))) err(page, `ItemList: رابط مكسور ${li.url}`); }
          break;
        }
        default: break;
      }
    }
  }
  if (!noindex && !/application\/ld\+json/.test(raw)) err(page, "لا توجد بيانات منظّمة JSON-LD");
}

/* ---------- duplicates ---------- */
for (const [t, list] of titles) if (list.length > 1) err(list.join(" + "), `عنوان مكرر: «${t}»`);
for (const [d, list] of descs) if (list.length > 1) err(list.join(" + "), `وصف مكرر: «${d.slice(0, 70)}…»`);

/* ---------- sitemap ---------- */
const inSitemap = new Set();
if (!SITE_URL) warn("sitemap.xml", "لم يُحدَّد siteUrl فلم يُفحص sitemap");
else if (!existsSync(rel("sitemap.xml"))) err("sitemap.xml", "الملف مفقود");
else {
  const locs = (f) => [...readFileSync(rel(f), "utf8").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => unescape(m[1].replace(/&apos;/g, "'")));
  const index = readFileSync(rel("sitemap.xml"), "utf8");
  const files = /<sitemapindex/.test(index) ? locs("sitemap.xml").map(toPath) : ["sitemap.xml"];
  for (const f of files) {
    if (!f || !existsSync(rel(f))) { err("sitemap.xml", `ملف sitemap مفقود: ${f}`); continue; }
    const xml = readFileSync(rel(f), "utf8");
    const urls = [...xml.matchAll(/<url>\s*<loc>([^<]+)<\/loc>/g)].map((m) => unescape(m[1]));
    if (urls.length > 50000) err(f, "أكثر من 50000 رابط في ملف واحد");
    for (const u of urls) {
      const p = toPath(u);
      if (!p) { err(f, `رابط خارج الموقع: ${u}`); continue; }
      if (!fileExists(rel(p))) err(f, `رابط في sitemap بلا ملف: ${u}`);
      else if (!indexable.has(p)) err(f, `صفحة noindex في sitemap: ${p}`);
      inSitemap.add(p);
    }
    for (const m of xml.matchAll(/<lastmod>([^<]+)<\/lastmod>/g)) if (isNaN(Date.parse(m[1]))) err(f, `lastmod غير صالح: ${m[1]}`);
  }
  for (const p of indexable) if (!inSitemap.has(p)) err(p, "الصفحة غير موجودة في sitemap");
  if (!existsSync(rel("sitemap-news.xml"))) err("sitemap-news.xml", "الملف مفقود");
  else for (const m of readFileSync(rel("sitemap-news.xml"), "utf8").matchAll(/<news:publication_date>([^<]+)</g)) if (Date.now() - Date.parse(m[1]) > 72 * 3600e3) warn("sitemap-news.xml", `خبر أقدم من 48 ساعة: ${m[1]}`);
}

/* ---------- robots + feeds + IndexNow ---------- */
const robotsTxt = existsSync(rel("robots.txt")) ? readFileSync(rel("robots.txt"), "utf8") : "";
if (!robotsTxt) err("robots.txt", "الملف مفقود");
else {
  if (SITE_URL && !robotsTxt.includes(`Sitemap: ${SITE_URL}/sitemap.xml`)) err("robots.txt", "لا يشير إلى sitemap.xml");
  if (/^Disallow:\s*\/\s*$/m.test(robotsTxt)) err("robots.txt", "يحجب الموقع كله");
}
for (const f of ["feed.xml", "atom.xml"]) {
  if (!existsSync(rel(f))) { err(f, "الخلاصة مفقودة"); continue; }
  const x = readFileSync(rel(f), "utf8");
  const n = (x.match(f === "feed.xml" ? /<item>/g : /<entry>/g) || []).length;
  if (!n) err(f, "الخلاصة فارغة");
  const opens = (x.match(/<(item|entry)>/g) || []).length, closes = (x.match(/<\/(item|entry)>/g) || []).length;
  if (opens !== closes) err(f, "XML غير متوازن");
  for (const m of x.matchAll(f === "feed.xml" ? /<link>([^<]+)<\/link>/g : /<link href="([^"]+)" rel="alternate"/g)) { const p = toPath(unescape(m[1])); if (p && !fileExists(rel(p))) err(f, `رابط مكسور: ${m[1]}`); }
}
if (cfg.indexNowKey && !existsSync(rel(`${cfg.indexNowKey}.txt`))) err("IndexNow", "ملف المفتاح مفقود");
if (!existsSync(rel("404.html"))) err("404.html", "صفحة 404 مفقودة");

/* ---------- Report ---------- */
console.log(`فُحصت ${pages.length} صفحة (${indexable.size} قابلة للفهرسة) · ${ldCount} كتلة بيانات منظّمة · ${linkCount} رابطاً داخلياً · ${imgCount} صورة`);
console.log(`صور المعاينة: ${shareImages.size} صورة ${SHARE.w}×${SHARE.h} فريدة لـ ${indexable.size} صفحة`);
console.log("أنواع البيانات المنظّمة: " + Object.entries(ldTypes).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join("، "));
if (warnings.length) { console.log(`\n⚠ ${warnings.length} تنبيهاً (لا تُفشل الفحص)`); for (const w of (VERBOSE ? warnings : warnings.slice(0, 12))) console.log("  - " + w); if (!VERBOSE && warnings.length > 12) console.log(`  … و${warnings.length - 12} أخرى (--verbose لعرضها)`); }
if (errors.length) {
  console.log(`\n✖ ${errors.length} خطأ`);
  for (const e of (VERBOSE ? errors : errors.slice(0, 60))) console.log("  - " + e);
  if (!VERBOSE && errors.length > 60) console.log(`  … و${errors.length - 60} أخرى (--verbose لعرضها)`);
  process.exit(1);
}
console.log("\n✔ نجح تدقيق SEO: لا أخطاء");
