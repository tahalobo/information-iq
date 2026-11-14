#!/usr/bin/env node
/* ==========================================================
   مولّد الصفحات الثابتة ونظام SEO كاملاً (بلا مفاتيح ولا خدمات مدفوعة)
   لكل خبر/معلومة:  post/<id>.html  فيها المحتوى نفسه + عنوان ووصف فريدان + canonical مطلق
                     + Open Graph/Twitter بأبعاد الصورة + JSON-LD (Article/NewsArticle + BreadcrumbList)
                     + «مواضيع ذات صلة» محسوبة بتشابه TF-IDF
   صفحات تجميع:     topic/<الموضوع>.html  (أقسام، فروع، مواضيع مكتشفة من النص)  +  archive/  أرشيف مرقّم
   الصفحات الرئيسية والأدوات: يُحقن فيها <head> كامل وبيانات منظّمة وقسم روابط/شرح ظاهر (بين علامتي seo:head و seo:body)
   ملفات الزحف:     sitemap.xml (فهرس) + sitemap-*.xml + sitemap-news.xml (48 ساعة) + feed.xml + atom.xml + robots.txt + 404.html
   IndexNow:        ملف المفتاح + scripts/indexnow-pending.json (الروابط الجديدة/المعدّلة في هذا البناء)
   الاستخدام:  node scripts/build-pages.mjs      ثم      node scripts/seo-audit.mjs
   ========================================================== */
import fs from "node:fs/promises";
import { existsSync, readFileSync, writeFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { esc, strip, oneLine, clip, norm, tokens, stem, buildIndex, neighbours, phraseMatcher, slugify, hash } from "./seo/text.mjs";
import { imageSize } from "./seo/imgsize.mjs";
import { renderOgCards, pruneOg, TEMPLATE_VERSION } from "./seo/og.mjs";
import { PAGES, TOOLS as TOOL_SEO, TOPICS, TOPIC_MIN, PER_PAGE } from "./seo/content.mjs";
import { THEME_BOOT_JS, securityMeta } from "./seo/csp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
const { SITE, FACTS = [], CATEGORIES = [], TG, BR, BRANCHES = [], TOOLS = [] } = W.window;

const cfgFile = rel("scripts/site.config.json");
const siteCfg = existsSync(cfgFile) ? JSON.parse(readFileSync(cfgFile, "utf8")) : {};
const SITE_URL = (process.env.SITE_URL || siteCfg.siteUrl || "").replace(/\/+$/, "");
const SITE_PATH = SITE_URL ? new URL(SITE_URL + "/").pathname : "/";
/* رابط مطلق مرمَّز (الروابط العربية تُكتب %D8… في canonical والـ sitemap) */
const abs = (p) => { const clean = String(p).replace(/^\/+/, ""); return SITE_URL ? encodeURI(`${SITE_URL}/${clean}`) : encodeURI(clean); };
const absImg = (src) => (/^https?:/.test(src) ? src : abs(src));
const TODAY = new Date().toISOString().slice(0, 10);
const NOW = Date.now();

/* ---------- حالة البناء: تواريخ التعديل الحقيقية (تتغيّر فقط حين يتغيّر المحتوى) ---------- */
const stateFile = rel("scripts/seo-state.json");
const state = existsSync(stateFile) ? JSON.parse(readFileSync(stateFile, "utf8")) : {};
state.posts ||= {}; state.pages ||= {}; state.urls ||= {};

/* ---------- Helpers ---------- */
const branchOf = (id) => BRANCHES.find((b) => b.id === id);
const catOf = (id) => CATEGORIES.find((c) => c.id === id) || (branchOf(id) && { ...branchOf(id), name: branchOf(id).short }) || { id: "", name: "معلومات", icon: "book-open", c1: "#8a5a14", c2: "#d4a537" };
const TYPE_NAMES = { fact: "معلومة", news: "خبر", event: "فعالية", discussion: "سؤال للنقاش", literature: "شعر وأدب" };
const fmtDate = (d) => { try { return new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { year: "numeric", month: "long", day: "numeric", timeZone: "Asia/Baghdad" }).format(new Date(String(d).length <= 10 ? d + "T12:00:00+03:00" : d)); } catch { return d; } };
const iso = (d) => (String(d).length <= 10 ? `${d}T09:00:00+03:00` : String(d));
const day = (d) => String(d).slice(0, 10);
const unesc = (s) => String(s).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const ic = (n) => `<i data-lucide="${n}"></i>`;
const json = (o) => JSON.stringify(o).replace(/</g, "\\u003c");
const ORG_ID = abs("") + "#org";
const SITE_ID = abs("") + "#website";
const LOGO = { path: "assets/img/icon-512.png", width: 512, height: 512 };
const DEFAULT_OG = "assets/img/og/default.jpg";
const sameAs = [...Object.entries(SITE.links || {}).filter(([k, v]) => v && /^https?:/.test(v) && k !== "instagramDM").map(([, v]) => v), ...BRANCHES.map((b) => b.url).filter(Boolean)].filter((v, i, a) => a.indexOf(v) === i);
const orgNode = () => ({ "@type": "Organization", "@id": ORG_ID, name: SITE.name, alternateName: ["إمبراطورية المعلومات العراقية", SITE.shortName, `@${SITE.handle}`], url: abs(""), description: SITE.description,
  logo: { "@type": "ImageObject", url: abs(LOGO.path), width: LOGO.width, height: LOGO.height }, sameAs });
const orgRef = { "@type": "Organization", "@id": ORG_ID, name: SITE.name, url: abs(""), logo: { "@type": "ImageObject", url: abs(LOGO.path), width: LOGO.width, height: LOGO.height } };
const crumbsLd = (list) => ({ "@type": "BreadcrumbList", itemListElement: list.map(([name, p], i) => ({ "@type": "ListItem", position: i + 1, name, ...(p != null ? { item: abs(p) } : {}) })) });
const crumbsHtml = (list) => `<nav class="breadcrumbs" aria-label="مسار التنقل">${list.map(([name, p], i) => (p != null && i < list.length - 1 ? `<a href="${esc(p || "index.html")}">${esc(name)}</a>` : `<span aria-current="page">${esc(name)}</span>`)).join(ic("chevron-left"))}</nav>`;

function imgInfo(src) {
  if (!src) return null;
  if (/^https?:/.test(src)) return { src, url: src, remote: true };
  const s = imageSize(rel(src));
  return s ? { src, url: abs(src), ...s } : (existsSync(rel(src)) ? { src, url: abs(src) } : null);
}
const DEF_IMG = imgInfo(DEFAULT_OG) || { src: DEFAULT_OG, url: abs(DEFAULT_OG) };

/* ---------- Collect every item ---------- */
const items = [];
for (const f of FACTS) {
  const og = existsSync(rel(`assets/img/og/${f.id}.jpg`)) ? `assets/img/og/${f.id}.jpg` : null;
  items.push({ id: f.id, type: "fact", title: f.title, desc: f.excerpt, cat: f.cat, date: f.date, image: og, images: og ? [og] : [], cover: true,
    body: f.body + (f.didYouKnow ? `<div class="didyouknow"><div><strong>هل تعلم؟</strong>${esc(f.didYouKnow)}</div></div>` : ""), sources: f.sources || [], tags: f.tags || [] });
}
for (const p of (TG && TG.posts) || []) {
  const detail = loadBrowserScript(rel(`assets/tg/posts/${p.id}.js`)).TG_POST || {};
  const url = `https://t.me/${TG.channel}/${p.id}`;
  const images = (detail.images && detail.images.length ? detail.images : p.image ? [p.image] : []);
  items.push({
    id: `tg-${p.id}`, type: p.type, title: p.title, desc: p.excerpt, cat: p.cat, date: detail.date || p.date,
    image: images[0] || null, images, body: detail.html || `<p>${esc(p.excerpt)}</p>`, video: p.video || null,
    sources: [{ name: "قناة إمبراطورية المعلومات على تليغرام", url }, ...(detail.sources || []).filter((s) => /^https?:\/\//.test(s.url || "")).map((s) => ({ name: s.site && s.site !== s.name ? `${s.name} — ${s.site}` : s.name, url: s.url, quote: s.quote, lang: s.lang }))],
    tags: p.tags || [], tgUrl: url
  });
}
for (const p of (BR && BR.posts) || []) {
  const b = branchOf(p.b) || { name: p.b, channel: "" };
  const detail = loadBrowserScript(rel(`assets/tg/posts/${p.id}.js`)).TG_POST || {};
  const images = (detail.images && detail.images.length ? detail.images : p.image ? [p.image] : []);
  items.push({
    id: p.id, type: "news", branch: p.b, title: p.title, desc: p.excerpt, cat: p.b, date: detail.date || p.date,
    image: images[0] || null, images, body: detail.html || `<p>${esc(p.excerpt)}</p>`, video: p.video || null,
    sources: [{ name: `قناة ${b.name} على تليغرام`, url: detail.url || `https://t.me/${b.channel}/${p.msg}` }], tags: p.tags || []
  });
}
items.sort((a, b) => String(iso(b.date)).localeCompare(String(iso(a.date))) || String(b.id).localeCompare(String(a.id), "en", { numeric: true }));
const byId = new Map(items.map((i) => [i.id, i]));
const postPath = (it) => `post/${it.id}.html`;

/* ---------- نص كل منشور + كلماته ---------- */
for (const it of items) {
  it.text = strip(it.body);
  it.plain = oneLine(it.text);
  it.stems = tokens(`${it.title} ${it.plain} ${(it.tags || []).join(" ")}`).map(stem);
  it.titleStems = tokens(it.title).map(stem);
  it.c = catOf(it.cat);
  it.img = imgInfo(it.image);
  it.isNews = !!it.branch || it.type === "news";
}

/* ---------- العنوان والوصف: فريدان، بطول يناسب نتائج البحث ---------- */
const BRAND = ` | ${SITE.name}`;
const cleanTitle = (t) => oneLine(t).replace(/^[\s\-–—:·•|]+|[\s\-–—:·•|]+$/g, "");
function seoTitle(it) {
  let t = cleanTitle(it.title);
  if (t.length < 30) {
    // عنوان قصير لا يقول شيئاً لمحرك البحث: نكمله بأول جملة من النص
    const rest = oneLine(it.plain.startsWith(t) ? it.plain.slice(t.length) : it.plain).replace(/^[\s:،.\-–—]+/, "");
    const add = clip(rest.split(/(?<=[.؟!])\s/)[0] || rest, Math.max(24, 62 - t.length), 12).replace(/[.…،]+$/, "");
    if (add && add.length > 8) t = `${t.replace(/[.:؟!،]+$/, "")}: ${add}`;
  }
  if (t.length > 90) t = clip(t, 90, 50);
  return t;
}
function seoDesc(it) {
  let src = it.plain;
  const ttl = cleanTitle(it.title);
  if (src.startsWith(ttl)) src = src.slice(ttl.length).replace(/^[\s:،.\-–—]+/, "") || src;
  if (src.length < 60 && it.desc) src = oneLine(strip(it.desc)).replace(/…$/, "").length > src.length ? oneLine(strip(it.desc)) : src;
  let d = clip(src, 158, 90);
  if (d.length < 75) {
    const kind = it.branch ? `خبر من ${it.c.name}` : `${TYPE_NAMES[it.type] || "منشور"} في قسم ${it.c.name}`;
    d = oneLine(`${ttl}${d && !ttl.includes(d.replace(/…$/, "")) ? ": " + d : ""}. ${kind} من ${SITE.name}، نُشر في ${fmtDate(it.date)}.`);
    if (d.length > 165) d = clip(d, 165, 100);
  }
  return d;
}
{
  const seenT = new Map(), seenD = new Map();
  for (const it of [...items].reverse()) { // الأقدم يحتفظ بعنوانه، والأحدث يُميَّز بتاريخه
    let t = seoTitle(it), d = seoDesc(it);
    if (seenT.has(norm(t))) t = `${clip(t, 50, 30)} (${fmtDate(it.date)})`;
    if (seenT.has(norm(t))) t = `${t} #${String(it.id).replace(/^\D+/, "")}`;
    seenT.set(norm(t), 1);
    if (seenD.has(norm(d))) d = clip(`${fmtDate(it.date)}: ${d}`, 165, 100);
    if (seenD.has(norm(d))) d = clip(`${cleanTitle(it.title)} (${it.id}): ${d}`, 165, 100);
    seenD.set(norm(d), 1);
    it.seoTitle = t; it.seoDesc = d;
    it.fullTitle = (t + BRAND).length <= 70 ? t + BRAND : t;
  }
}

/* ---------- تواريخ التعديل ---------- */
for (const it of items) {
  const h = hash(it.title + "\u0001" + it.body + "\u0001" + JSON.stringify(it.sources));
  const st = state.posts[it.id];
  if (!st) state.posts[it.id] = { h, mod: iso(it.date) };
  else if (st.h !== h) state.posts[it.id] = { h, mod: new Date().toISOString().slice(0, 19) + "+00:00" };
  it.modified = state.posts[it.id].mod;
}
for (const id of Object.keys(state.posts)) if (!byId.has(id)) delete state.posts[id];

/* ---------- المواضيع (صفحات التجميع) ---------- */
const hubs = [];
const addHub = (h) => { h.slug = slugify(h.slug || h.name); h.items = h.items.filter(Boolean); if (h.items.length >= (h.min ?? TOPIC_MIN) && !hubs.some((x) => x.slug === h.slug)) hubs.push(h); return h; };
for (const c of CATEGORIES) addHub({ kind: "section", key: `cat:${c.id}`, name: c.name, icon: c.icon, c1: c.c1, c2: c.c2, parent: ["المعلومات", "facts.html"],
  title: `${c.name}: معلومات موثّقة بالمصادر`, desc: `معلومات ${c.name} من أرشيف إمبراطورية المعلومات العراقية، كل معلومة مع مصادرها.`, items: items.filter((i) => !i.branch && i.cat === c.id), min: 1 });
const BRANCH_TITLES = { news: "أخبار العراق والعالم", games: "أخبار الألعاب", music: "أخبار الموسيقى والمشاهير", anime: "أخبار الأنمي والمانغا", sport: "أخبار الرياضة" };
for (const b of BRANCHES.filter((b) => b.id !== "info")) addHub({ kind: "section", key: `branch:${b.id}`, name: BRANCH_TITLES[b.id] || `أخبار ${b.short}`, icon: b.icon, c1: b.c1, c2: b.c2, parent: ["الفروع", "branch.html"],
  title: `${BRANCH_TITLES[b.id] || `أخبار ${b.short}`}: آخر الأخبار من ${b.name}`, desc: b.desc, items: items.filter((i) => i.branch === b.id), min: 1, channel: b.url });
const TYPE_HUBS = { literature: ["شعر وأدب", "feather", "قصائد ونصوص أدبية اخترناها ونشرناها في قناة إمبراطورية المعلومات."], event: ["فعاليات القناة ومسابقاتها", "party-popper", "فعاليات قناة إمبراطورية المعلومات ومسابقاتها ونتائجها."], discussion: ["أسئلة للنقاش", "messages-square", "أسئلة طرحناها على المتابعين للنقاش وإبداء الرأي."] };
for (const [type, [name, icon, desc]] of Object.entries(TYPE_HUBS)) addHub({ kind: "type", key: `type:${type}`, name, icon, parent: ["قناة تليغرام", "channel.html"], title: `${name} من قناة إمبراطورية المعلومات`, desc, items: items.filter((i) => !i.branch && i.type === type) });
for (const t of TOPICS) {
  const m = phraseMatcher([t.name, ...t.match]);
  // الموضوع يخصّ المنشور إذا ورد في عنوانه، أو تكرّر 3 مرات في نصّه، أو كان من وسومه
  const members = items.filter((it) => m(it.titleStems) > 0 || m(it.stems) >= 3 || (it.tags || []).some((g) => norm(g) === norm(t.name)));
  addHub({ kind: "topic", key: `topic:${t.name}`, name: t.name, icon: "hash", parent: ["المواضيع", "topic/index.html"], title: `${t.name}: معلومات وأخبار موثّقة`, desc: t.desc, items: members });
}
const hubUrl = (h, page = 1) => `topic/${h.slug}${page > 1 ? `-page-${page}` : ""}.html`;
for (const h of hubs) {
  h.pages = Math.max(1, Math.ceil(h.items.length / PER_PAGE));
  h.c1 ||= "#8a5a14"; h.c2 ||= "#d4a537";
  h.latest = h.items.reduce((m, i) => (day(i.modified) > m ? day(i.modified) : m), day(h.items[0].date));
  for (const it of h.items) (it.hubs ||= []).push(h);
}
const sectionHub = (it) => (it.hubs || []).find((h) => h.key === (it.branch ? `branch:${it.branch}` : `cat:${it.cat}`));

/* ---------- مواضيع ذات صلة: تشابه TF-IDF + نفس القسم + مواضيع مشتركة ---------- */
const index = buildIndex(items.map((it) => ({ id: it.id, title: it.title, text: it.plain })));
items.forEach((it, i) => {
  const mine = new Set((it.hubs || []).filter((h) => h.kind === "topic").map((h) => h.slug));
  it.related = neighbours(index, i, 6, (j) => {
    const o = items[j];
    return (o.cat === it.cat ? 0.04 : 0) + ((o.hubs || []).filter((h) => mine.has(h.slug)).length ? 0.03 : 0) + (o.img ? 0.005 : 0);
  }).filter(([, s]) => s > 0.05).map(([j]) => items[j]);
  if (it.related.length < 3) { // لا شبيه بالنص: نكمل بأحدث ما في القسم
    const pool = items.filter((o) => o !== it && o.cat === it.cat && !it.related.includes(o));
    it.related.push(...pool.slice(0, 4 - it.related.length));
  }
});

/* ==========================================================
   صور المعاينة المصمَّمة (Open Graph): بطاقة 1200×630 لكل خبر وموضوع وأداة وصفحة
   ========================================================== */
const ogJobs = new Map();
const OG_BASE = { site: SITE.name, handle: `@${SITE.handle}`, host: (SITE.links.telegram || "").replace(/^https?:\/\//, "") };
function ogCard(key, name, spec) {
  // البصمة لا تشمل رابط الصورة البعيدة (روابط تليغرام تتغيّر مع كل مزامنة) حتى لا تُعاد الصورة بلا سبب
  const forHash = { ...spec, fresh: undefined, bg: spec.bg ? (/^https?:/.test(spec.bg) ? "remote" : spec.bg) : null, v: TEMPLATE_VERSION };
  const file = `assets/og/${name}.${hash(JSON.stringify(forHash)).slice(0, 8)}.jpg`;
  const remote = /^https?:/.test(spec.bg || "");
  ogJobs.set(key, { file, spec: { ...OG_BASE, ...spec }, ...(remote ? { fallback: file.replace(/.jpg$/, ".t.jpg"), retry: !!spec.fresh } : {}) });
  return file;
}
const ogImg = (key) => { const j = ogJobs.get(key); return j ? imgInfo(j.file) || (j.fallback ? imgInfo(j.fallback) : null) : null; };
const splitTitle = (t) => { const i = t.indexOf(": "); return i > 0 ? [t.slice(0, i), t.slice(i + 2)] : [t, ""]; };
for (const it of items) ogCard(`post:${it.id}`, `p/${it.id}`, { kind: "post", title: cleanTitle(it.title), badge: `${it.c.name}${it.branch ? "" : TYPE_NAMES[it.type] ? " · " + TYPE_NAMES[it.type] : ""}`, badgeIcon: it.c.icon, icon: it.c.icon,
  foot: fmtDate(it.date), bg: it.cover ? null : it.image, c1: it.c.c1, c2: it.c.c2, fresh: NOW - new Date(iso(it.date)).getTime() < 3 * 86400e3 });
for (const h of hubs) ogCard(`hub:${h.slug}`, `t/${hash(h.slug)}`, { kind: "topic", title: h.name, sub: clip(h.desc, 105, 50), badge: `${h.items.length} منشوراً`, badgeIcon: "layers", icon: h.icon === "hash" ? null : h.icon,
  foot: h.kind === "topic" ? "موضوع" : h.kind === "type" ? "من قناة تليغرام" : "قسم", bg: (h.items.find((i) => !i.cover && i.img && !i.img.remote) || {}).image || null, c1: h.c1, c2: h.c2 });
ogCard("topic-index", "s/topics", { kind: "page", title: "فهرس المواضيع", sub: `${hubs.length} قسماً وموضوعاً تجمع ${items.length} منشوراً`, badge: "المواضيع", badgeIcon: "hash", icon: "library", foot: SITE.tagline });
ogCard("archive", "s/archive", { kind: "page", title: "أرشيف المنشورات", sub: "كل الأخبار والمعلومات مرتّبة حسب التاريخ", badge: `${items.length} منشوراً`, badgeIcon: "archive", icon: "archive", foot: SITE.tagline });
const PAGE_ICONS = { "index.html": "crown", "facts.html": "book-open", "branch.html": "newspaper", "channel.html": "send", "news.html": "megaphone", "tools.html": "wrench", "quiz.html": "brain", "about.html": "crown", "contact.html": "mail", "privacy.html": "shield-check" };
for (const f of readdirSync(ROOT).filter((x) => x.endsWith(".html") && !["404.html", "fact.html", "offline.html"].includes(x)).sort()) {
  const tool = TOOL_SEO[f], cfg = PAGES[f];
  const t = TOOLS.find((x) => x.href === f);
  if (tool) ogCard(`page:${f}`, `s/${f.replace(".html", "")}`, { kind: "tool", title: tool.name.replace(/^[^:]+: /, ""), sub: clip(tool.intro.split(/(?<=[.؟])\s/)[0], 120, 40), badge: "أداة مجانية", badgeIcon: "wrench", icon: (t && t.icon) || "wrench", foot: "تعمل داخل متصفحك", c1: "#0d3b66", c2: "#3a86d4" });
  else {
    const raw = cfg ? cfg.title : unesc((readFileSync(rel(f), "utf8").match(/<title>([^<]*)<\/title>/) || [])[1] || SITE.name).replace(/\s*\|\s*[^|]*$/, "");
    const [head, tail] = f === "index.html" ? [SITE.name, "معلومات موثّقة وأخبار العراق والعالم وأدوات تحقق مجانية"] : splitTitle(raw);
    ogCard(`page:${f}`, `s/${f.replace(".html", "")}`, { kind: "page", title: head, sub: tail || (cfg ? clip(cfg.desc, 100, 40) : ""), badge: f === "index.html" ? "" : (cfg && cfg.crumb) || "", icon: PAGE_ICONS[f] || "crown", foot: SITE.tagline });
  }
}
{
  const jobs = [...ogJobs.values()];
  var ogStats = await renderOgCards(ROOT, jobs);
  var ogPruned = pruneOg(ROOT, "assets/og", new Set(jobs.flatMap((j) => [j.file, j.fallback]).filter(Boolean)));
}

/* ==========================================================
   القوالب
   ========================================================== */
const THEME_BOOT = `<script>${THEME_BOOT_JS}</script>`;
const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;600;700&family=Reem+Kufi:wght@500;600;700&family=Lalezar&display=swap" rel="stylesheet">
<link rel="stylesheet" href="assets/css/style.css">`;
const ICONS = `<link rel="icon" href="assets/img/favicon.svg" type="image/svg+xml">
<link rel="manifest" href="manifest.webmanifest">
<link rel="apple-touch-icon" href="assets/img/apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="الإمبراطورية">`;

/* وسوم SEO المشتركة: عنوان، وصف، canonical، OG، Twitter، خلاصات، JSON-LD */
function seoTags({ title, desc, path: p, image = DEF_IMG, imageAlt, ogType = "website", ogTitle, ogDesc, article, robots, ld = [], prev, next }) {
  const url = abs(p);
  const img = image || DEF_IMG;
  // نص المعاينة في مواقع التواصل: أقصر من نص محرك البحث حتى لا يُقطع داخل البطاقة
  const shareTitle = clip(ogTitle || title, 88, 50), shareDesc = ogDesc || clip(desc, 125, 60);
  const out = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    `<meta name="robots" content="${robots || "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"}">`,
    prev ? `<link rel="prev" href="${esc(abs(prev))}">` : "", next ? `<link rel="next" href="${esc(abs(next))}">` : "",
    `<meta property="og:type" content="${ogType}">`,
    `<meta property="og:site_name" content="${esc(SITE.name)}">`,
    `<meta property="og:locale" content="ar_IQ">`,
    `<meta property="og:title" content="${esc(shareTitle)}">`,
    `<meta property="og:description" content="${esc(shareDesc)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:image" content="${esc(img.url)}">`,
    /^https:/.test(img.url) ? `<meta property="og:image:secure_url" content="${esc(img.url)}">` : "",
    img.width ? `<meta property="og:image:width" content="${img.width}">\n<meta property="og:image:height" content="${img.height}">` : "",
    img.type ? `<meta property="og:image:type" content="${img.type}">` : "",
    `<meta property="og:image:alt" content="${esc(imageAlt || shareTitle)}">`,
    article ? [`<meta property="article:published_time" content="${esc(article.published)}">`, `<meta property="article:modified_time" content="${esc(article.modified)}">`, `<meta property="article:section" content="${esc(article.section)}">`,
      `<meta property="article:publisher" content="${esc(SITE.links.instagram || abs(""))}">`, ...(article.tags || []).map((t) => `<meta property="article:tag" content="${esc(t)}">`)].join("\n") : "",
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(shareTitle)}">`,
    `<meta name="twitter:description" content="${esc(shareDesc)}">`,
    `<meta name="twitter:image" content="${esc(img.url)}">`,
    `<meta name="twitter:image:alt" content="${esc(imageAlt || shareTitle)}">`,
    `<link rel="alternate" type="application/rss+xml" title="${esc(SITE.name)} - آخر المنشورات" href="${esc(abs("feed.xml"))}">`,
    `<link rel="alternate" type="application/atom+xml" title="${esc(SITE.name)} - Atom" href="${esc(abs("atom.xml"))}">`,
    ld.length ? `<script type="application/ld+json">${json({ "@context": "https://schema.org", "@graph": ld })}</script>` : ""
  ];
  return out.filter(Boolean).join("\n");
}

function shell({ seo, base = "../", body, bodyAttr = "", scripts = "", preload = "", csp = "hub" }) {
  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${securityMeta(csp, SITE)}
<base href="${base}">
${seo}
<meta name="theme-color" content="#03050c">
${ICONS}
${THEME_BOOT}
${preload}${FONTS}
</head>
<body ${bodyAttr}>
<div id="site-header"></div>
${body}
<div id="site-footer"></div>
${scripts}
</body>
</html>
`;
}
const LIGHT_SCRIPTS = `<script src="assets/js/vendor/lucide-subset.js"></script>
<script src="assets/js/config.js"></script>
<script src="assets/js/data.js"></script>
<script src="assets/js/static-index.js"></script>
<script src="assets/js/core.js"></script>
<script src="assets/js/fx.js"></script>`;

/* بطاقة ثابتة بنفس تصميم بطاقات الموقع (fc) */
function card(it, eager = false) {
  const c = it.c, im = it.img;
  return `<article class="fc fact-card${im ? " has-img" : ""}" style="--c1:${c.c1};--c2:${c.c2}">
  <div class="fc-media"><div class="fc-gen" aria-hidden="true"><span class="fc-ring"></span><span class="fc-ring r2"></span>${ic(c.icon)}</div>${im ? `<img src="${esc(im.src)}" alt="${esc(it.title)}"${im.width ? ` width="${im.width}" height="${im.height}"` : ""} loading="${eager ? "eager" : "lazy"}" decoding="async" data-err="card">` : ""}</div>
  <div class="fc-veil"></div>
  <div class="fc-top"><span class="fc-cat">${ic(c.icon)}${esc(c.name)}</span>${TYPE_NAMES[it.type] && it.type !== "fact" && !it.branch ? `<span class="fc-tag">${esc(TYPE_NAMES[it.type])}</span>` : ""}${it.video ? `<span class="fc-tag">${ic("play")}فيديو</span>` : ""}</div>
  <div class="fc-body"><h3><a href="${esc(postPath(it))}" class="fc-link">${esc(it.title)}</a></h3><p class="fc-ex">${esc(clip(it.seoDesc, 150))}</p>
  <div class="fc-meta"><span>${ic("calendar")}<time datetime="${esc(day(it.date))}">${esc(fmtDate(it.date))}</time></span><span class="fc-go" aria-hidden="true">${ic("arrow-up-left")}</span></div></div>
</article>`;
}
const itemListLd = (list, name) => ({ "@type": "ItemList", name, numberOfItems: list.length, itemListElement: list.map((it, i) => ({ "@type": "ListItem", position: i + 1, url: abs(it.path || postPath(it)), name: it.title || it.name })) });
const chips = (list, cur) => list.map((h) => `<a class="chip${h === cur ? " active" : ""}" href="${esc(hubUrl(h))}">${esc(h.name)}<span class="count">${h.items.length}</span></a>`).join("");
const topHubs = (n = 30) => [...hubs].sort((a, b) => (a.kind === "section" ? 0 : 1) - (b.kind === "section" ? 0 : 1) || b.items.length - a.items.length).slice(0, n);
function pager(pathOf, page, pages) {
  if (pages < 2) return "";
  const nums = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  let last = 0, out = "";
  for (const n of [...nums].sort((a, b) => a - b)) {
    if (n - last > 1) out += `<span class="seo-gap">…</span>`;
    out += n === page ? `<span class="chip active" aria-current="page">${n}</span>` : `<a class="chip" href="${esc(pathOf(n))}">${n}</a>`;
    last = n;
  }
  return `<nav class="seo-pager" aria-label="صفحات الأرشيف">${page > 1 ? `<a class="btn btn-ghost btn-sm" rel="prev" href="${esc(pathOf(page - 1))}">${ic("arrow-right")}الأحدث</a>` : ""}${out}${page < pages ? `<a class="btn btn-ghost btn-sm" rel="next" href="${esc(pathOf(page + 1))}">الأقدم${ic("arrow-left")}</a>` : ""}</nav>`;
}

/* ---------- صفحة المنشور ---------- */
/* ---------- سياق المنشور للواجهة (window.STATIC_CTX) ----------
   صفحة المنشور كانت تحمّل telegram-data.js و branches-data.js كاملين (نحو 550 ك.ب) لتعرف ثلاثة أشياء فقط:
   سجلّ المنشور نفسه، والأحدث/الأقدم منه، وثلاثة منشورات مشابهة. نحسبها هنا وقت البناء ونضمّنها في الصفحة.
   المنطق منسوخ حرفياً من assets/js/pages/fact.js (render) و core.js (tgToItem/brToItem/factsSorted): أي تعديل هناك يُكرَّر هنا. */
const CTX = (() => {
  const catIds = new Set(CATEGORIES.map((c) => c.id));
  const tgPosts = (TG && TG.posts) || [], brPosts = (BR && BR.posts) || [];
  const tgMini = (p) => ({ id: "tg-" + p.id, date: p.date, tg: p.id, cat: catIds.has(p.cat) ? p.cat : "culture", tags: p.tags || [], image: p.image, raw: p, kind: "tg" });
  const brMini = (p) => ({ id: p.id, date: p.date, tg: p.id, cat: p.b, tags: p.tags || [], image: p.image, raw: p, kind: "br", branch: p.b });
  const tgAll = tgPosts.map(tgMini), brAll = brPosts.map(brMini);
  // window.FACTS في المتصفح: معلومات data.js ثم منشورات القناة من نوع "معلومة"
  const facts = [...FACTS.map((f) => ({ id: f.id, date: f.date, tg: 0, cat: f.cat, tags: f.tags || [], image: f.image })), ...tgAll.filter((x) => x.raw.type === "fact")];
  const factsSorted = [...facts].sort((a, b) => b.date.localeCompare(a.date) || (b.tg || 0) - (a.tg || 0));
  const branchPools = new Map();
  const branchPool = (id) => branchPools.get(id) || branchPools.set(id, brAll.filter((x) => x.branch === id).sort((a, b) => b.date.localeCompare(a.date) || b.tg.localeCompare(a.tg))).get(id);
  const byId = new Map();
  for (const x of [...brAll].reverse()) byId.set(x.id, x);
  for (const x of [...tgAll].reverse()) byId.set(x.id, x);
  for (const x of [...facts].reverse()) byId.set(x.id, x); // نفس أولوية البحث في fact.js: FACTS ثم TG_ITEMS ثم BR_ITEMS
  return (id) => {
    const f = byId.get(id); if (!f) return null;
    const pool = f.branch && branchOf(f.branch) ? branchPool(f.branch) : null;
    const sorted = pool || factsSorted;
    const idx = sorted.findIndex((x) => x.id === f.id);
    const newer = idx > 0 ? sorted[idx - 1] : null, older = idx >= 0 ? sorted[idx + 1] || null : null;
    const related = (pool || facts).filter((x) => x.id !== f.id && x !== newer && x !== older)
      .map((x) => ({ x, score: (x.cat === f.cat ? 2 : 0) + x.tags.filter((t) => f.tags.includes(t)).length + (x.image ? .2 : 0) }))
      .sort((a, b) => b.score - a.score).slice(0, 3).map((r) => r.x);
    const need = [f, newer, older, ...related].filter(Boolean);
    const raw = (kind) => [...new Set(need.filter((x) => x.kind === kind).map((x) => x.raw))];
    return { n: newer ? newer.id : null, o: older ? older.id : null, r: related.map((x) => x.id), tg: raw("tg"), br: raw("br") };
  };
})();

function postPage(it) {
  const p = postPath(it);
  const sec = sectionHub(it);
  const topics = (it.hubs || []).filter((h) => h !== sec);
  const crumbs = [["الرئيسية", ""], it.branch ? ["الفروع", "branch.html"] : ["المعلومات", "facts.html"], ...(sec ? [[sec.name, hubUrl(sec)]] : []), [clip(cleanTitle(it.title), 60), p]];
  const images = it.images.map(imgInfo).filter(Boolean);
  const main = images[0] || null;
  const cardImg = ogImg(`post:${it.id}`);
  const shareImg = cardImg || (main && !main.remote ? main : main || DEF_IMG);
  const cites = it.sources.filter((s) => s.url && !/\/\/t\.me\//.test(s.url)).map((s) => s.url);
  const words = it.plain.split(/\s+/).filter(Boolean).length;
  const article = {
    "@type": it.isNews ? "NewsArticle" : "Article", "@id": abs(p) + "#article",
    headline: clip(cleanTitle(it.title), 110), description: it.seoDesc,
    image: (images.length && !it.cover ? images.slice(0, 4) : [cardImg || DEF_IMG]).map((m) => (m.width ? { "@type": "ImageObject", url: m.url, width: m.width, height: m.height } : m.url)),
    datePublished: iso(it.date), dateModified: it.modified, inLanguage: "ar", isAccessibleForFree: true,
    articleSection: it.c.name, wordCount: words,
    author: orgRef, publisher: orgRef,
    mainEntityOfPage: { "@type": "WebPage", "@id": abs(p) },
    isPartOf: { "@id": SITE_ID }
  };
  if (topics.length) article.keywords = topics.map((h) => h.name).join("، ");
  if (cites.length) article.citation = cites;
  const seo = seoTags({ title: it.fullTitle, ogTitle: cleanTitle(it.title), desc: it.seoDesc, path: p, image: shareImg, imageAlt: cleanTitle(it.title), ogType: "article",
    article: { published: iso(it.date), modified: it.modified, section: it.c.name, tags: topics.map((h) => h.name) }, ld: [article, crumbsLd(crumbs)] });
  const figure = images.length ? `<figure class="gallery${images.length === 1 ? " single" : ""}">${images.map((m, i) => `<img src="${esc(m.src)}" alt="${esc(cleanTitle(it.title))}${images.length > 1 ? ` - صورة ${i + 1}` : ""}"${m.width ? ` width="${m.width}" height="${m.height}"` : ""} loading="${i ? "lazy" : "eager"}"${i ? "" : ' fetchpriority="high"'} decoding="async" data-err="remove">`).join("")}</figure>` : "";
  const body = `<main>
  <div class="container" style="padding-top:28px;padding-bottom:64px" id="root">
    <article class="container-narrow" style="margin:0 auto">
      ${crumbsHtml(crumbs)}
      ${figure}
      <span class="badge mb-2">${esc(it.c.name)}${TYPE_NAMES[it.type] && it.type !== "fact" ? " · " + TYPE_NAMES[it.type] : ""}</span>
      <h1 style="font-size:clamp(1.6rem,4.5vw,2.4rem);line-height:1.45">${esc(it.title)}</h1>
      <p class="meta mb-3">نُشر في <time datetime="${esc(iso(it.date))}">${esc(fmtDate(it.date))}</time>${day(it.modified) !== day(it.date) ? ` · آخر تحديث <time datetime="${esc(it.modified)}">${esc(fmtDate(it.modified))}</time>` : ""} · ${esc(SITE.name)}</p>
      <div class="prose">${it.body}</div>
      <h2>المصادر</h2>
      <ol class="sources">${it.sources.map((s) => `<li>${s.url ? `<a class="link" href="${esc(s.url)}" rel="noopener"${s.lang && s.lang !== "ar" ? ' dir="auto"' : ""}>${esc(s.name)}</a>` : esc(s.name)}${s.quote ? `<br><small class="muted">«${esc(s.quote)}»</small>` : ""}</li>`).join("")}</ol>
    </article>
  </div>
  <section class="section seo-related" aria-labelledby="seo-rel-h">
    <div class="container">
      ${topics.length || sec ? `<div class="seo-topics"><span class="kicker">مواضيع هذا المنشور</span><div class="seo-chips">${chips([sec, ...topics].filter(Boolean))}</div></div>` : ""}
      ${it.related.length ? `<div class="section-head"><div><span class="kicker">اقرأ أيضاً</span><h2 id="seo-rel-h">مواضيع ذات صلة</h2></div></div>
      <ul class="seo-list">${it.related.map((r) => `<li><a href="${esc(postPath(r))}"><strong>${esc(r.title)}</strong><small>${esc(r.c.name)} · <time datetime="${esc(day(r.date))}">${esc(fmtDate(r.date))}</time></small></a></li>`).join("")}</ul>` : ""}
    </div>
  </section>
</main>`;
  const ctx = CTX(it.id);
  // بيانات لا تُنفَّذ (يقرؤها core.js): لا تحتاج استثناءً في سياسة أمن المحتوى، و json() يهرّب < فلا يمكن إغلاق الوسم من داخلها
  const scripts = `<script type="application/json" id="static-ctx">${json({ id: it.id, ctx: ctx || undefined })}</script>
<script src="assets/js/vendor/lucide-subset.js"></script>
<script src="assets/js/config.js"></script>
<script src="assets/js/data.js"></script>${ctx ? "" : `
<script src="assets/js/telegram-data.js"></script>
<script src="assets/js/branches-data.js"></script>`}
<script src="assets/js/static-index.js"></script>
<script src="assets/js/core.js"></script>
<script src="assets/js/pages/fact.js"></script>
<script src="assets/js/fx.js"></script>`;
  const preload = main && !main.remote ? `<link rel="preload" as="image" href="${esc(main.src)}" fetchpriority="high">\n` : "";
  return shell({ seo, body, bodyAttr: 'data-page="fact" data-progress', scripts, preload, csp: "post" });
}

/* ---------- صفحة موضوع / قسم ---------- */
function hubPage(h, page) {
  const p = hubUrl(h, page);
  const list = h.items.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const suffix = page > 1 ? ` (صفحة ${page})` : "";
  const first = day(h.items[h.items.length - 1].date), last = day(h.items[0].date);
  const crumbs = [["الرئيسية", ""], h.parent, [h.name, hubUrl(h)], ...(page > 1 ? [[`صفحة ${page}`, p]] : [])];
  const title = `${h.title}${suffix}`;
  const desc = clip(`${h.desc.replace(/[.\s]+$/, "")}. ${h.items.length} منشوراً من ${SITE.name}${page > 1 ? `، الصفحة ${page} من ${h.pages}` : `، آخرها في ${fmtDate(last)}`}.`, 165, 100);
  const others = hubs.filter((x) => x !== h && (x.kind === h.kind || x.kind === "section")).sort((a, b) => b.items.length - a.items.length).slice(0, 18);
  // مواضيع قريبة: التي تشترك معه في أكبر عدد من المنشورات
  const near = hubs.filter((x) => x !== h && x.kind === "topic").map((x) => [x, x.items.filter((i) => h.items.includes(i)).length]).filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([x]) => x);
  const ld = [{ "@type": "CollectionPage", "@id": abs(p), name: title, description: desc, url: abs(p), inLanguage: "ar", isPartOf: { "@id": SITE_ID }, about: h.name, dateModified: h.latest,
    mainEntity: itemListLd(list, h.name) }, crumbsLd(crumbs)];
  const seo = seoTags({ title: (title + BRAND).length <= 70 ? title + BRAND : title, ogTitle: title, desc, path: p, image: ogImg(`hub:${h.slug}`) || (list.find((i) => i.img && !i.img.remote) || {}).img || DEF_IMG, ld,
    prev: page > 1 ? hubUrl(h, page - 1) : null, next: page < h.pages ? hubUrl(h, page + 1) : null });
  const body = `<main>
  <section class="page-hero compact seo-hero" data-sc style="--c1:${h.c1};--c2:${h.c2}">
    <div class="ph-giant" aria-hidden="true">${esc(h.name.split(/\s+/)[0])}</div>
    <div class="container">
      ${crumbsHtml(crumbs)}
      <span class="ph-kicker"><b>${h.items.length}</b>${h.kind === "topic" ? "موضوع" : h.kind === "type" ? "من القناة" : "قسم"}</span>
      <h1>${esc(h.name)}${page > 1 ? ` <small class="seo-pg">صفحة ${page}</small>` : ""}</h1>
      <p>${esc(h.desc)} ${h.items.length} منشوراً بين ${esc(fmtDate(first))} و${esc(fmtDate(last))}.</p>
    </div>
  </section>
  <section class="section" style="padding-top:36px">
    <div class="container">
      <div class="section-head"><div><span class="kicker">${page > 1 ? `الصفحة ${page} من ${h.pages}` : "الأحدث أولاً"}</span><h2>${esc(h.kind === "topic" ? `كل ما نشرناه عن ${h.name}` : h.name)}</h2></div>
        ${h.channel ? `<a href="${esc(h.channel)}" class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer">${ic("send")}القناة على تليغرام</a>` : ""}</div>
      <div class="grid grid-3 seo-grid">${list.map((it, i) => card(it, i < 3)).join("\n")}</div>
      ${pager((n) => hubUrl(h, n), page, h.pages)}
      ${near.length ? `<div class="seo-topics mt-4"><h2 class="seo-h">مواضيع قريبة من ${esc(h.name)}</h2><div class="seo-chips">${chips(near)}</div></div>` : ""}
      <div class="seo-topics mt-4"><h2 class="seo-h">تصفّح مواضيع أخرى</h2><div class="seo-chips">${chips(others)}<a class="chip" href="topic/index.html">كل المواضيع</a><a class="chip" href="archive/index.html">الأرشيف الكامل</a></div></div>
    </div>
  </section>
</main>`;
  return shell({ seo, body, bodyAttr: 'data-page="topic"', scripts: LIGHT_SCRIPTS });
}

function topicsIndexPage() {
  const p = "topic/index.html";
  const crumbs = [["الرئيسية", ""], ["المواضيع", p]];
  const groups = [["أقسام المعلومات", hubs.filter((h) => h.key.startsWith("cat:"))], ["فروع الأخبار", hubs.filter((h) => h.key.startsWith("branch:"))], ["من القناة", hubs.filter((h) => h.kind === "type")],
    ["مواضيع", hubs.filter((h) => h.kind === "topic").sort((a, b) => b.items.length - a.items.length)]].filter(([, l]) => l.length);
  const title = "فهرس المواضيع: كل أقسام ومواضيع الإمبراطورية العراقية";
  const desc = clip(`فهرس ${hubs.length} قسماً وموضوعاً يجمع ${items.length} منشوراً: ${hubs.filter((h) => h.kind === "topic").sort((a, b) => b.items.length - a.items.length).slice(0, 8).map((h) => h.name).join("، ")} وغيرها.`, 165, 100);
  const flat = groups.flatMap(([, l]) => l);
  const seo = seoTags({ title, desc, path: p, image: ogImg("topic-index") || DEF_IMG, ld: [{ "@type": "CollectionPage", "@id": abs(p), name: title, description: desc, url: abs(p), inLanguage: "ar", isPartOf: { "@id": SITE_ID },
    mainEntity: itemListLd(flat.map((h) => ({ path: hubUrl(h), name: h.name })), "المواضيع") }, crumbsLd(crumbs)] });
  const body = `<main>
  <section class="page-hero compact seo-hero" data-sc>
    <div class="ph-giant" aria-hidden="true">مواضيع</div>
    <div class="container">${crumbsHtml(crumbs)}
      <span class="ph-kicker"><b>${hubs.length}</b>موضوعاً وقسماً</span>
      <h1>فهرس المواضيع</h1>
      <p>كل ما في أرشيف ${esc(SITE.name)} مرتّباً حسب الموضوع. تُحدَّث هذه الصفحات تلقائياً مع كل منشور جديد.</p>
    </div>
  </section>
  <section class="section" style="padding-top:36px"><div class="container">
    ${groups.map(([name, l]) => `<div class="seo-topics mb-3"><h2 class="seo-h">${esc(name)}</h2><div class="seo-chips">${chips(l)}</div></div>`).join("\n")}
    <p class="mt-3"><a class="btn btn-ghost" href="archive/index.html">${ic("archive")}الأرشيف الكامل حسب التاريخ</a></p>
  </div></section>
</main>`;
  return shell({ seo, body, bodyAttr: 'data-page="topic"', scripts: LIGHT_SCRIPTS });
}

/* ---------- الأرشيف المرقّم ---------- */
const archivePages = Math.max(1, Math.ceil(items.length / PER_PAGE));
const archiveUrl = (n) => (n > 1 ? `archive/page-${n}.html` : "archive/index.html");
function archivePage(page) {
  const p = archiveUrl(page);
  const list = items.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const from = day(list[list.length - 1].date), to = day(list[0].date);
  const crumbs = [["الرئيسية", ""], ["الأرشيف", archiveUrl(1)], ...(page > 1 ? [[`صفحة ${page}`, p]] : [])];
  const title = page > 1 ? `أرشيف المنشورات: صفحة ${page} من ${archivePages}` : "أرشيف كل الأخبار والمعلومات حسب التاريخ";
  const desc = clip(`أرشيف ${SITE.name}${page > 1 ? `، الصفحة ${page} من ${archivePages}` : ""}: المنشورات من ${fmtDate(from)} إلى ${fmtDate(to)}، ومنها: ${list.slice(0, 3).map((i) => cleanTitle(i.title)).join("، ")}.`, 165, 100);
  const seo = seoTags({ title: (title + BRAND).length <= 70 ? title + BRAND : title, ogTitle: title, desc, path: page > 1 ? p : "archive/", image: ogImg("archive") || DEF_IMG, ld: [{ "@type": "CollectionPage", "@id": abs(page > 1 ? p : "archive/"), name: title, description: desc, inLanguage: "ar", isPartOf: { "@id": SITE_ID }, mainEntity: itemListLd(list, title) }, crumbsLd(crumbs)],
    prev: page > 1 ? archiveUrl(page - 1) : null, next: page < archivePages ? archiveUrl(page + 1) : null });
  const body = `<main>
  <section class="page-hero compact seo-hero" data-sc>
    <div class="ph-giant" aria-hidden="true">أرشيف</div>
    <div class="container">${crumbsHtml(crumbs)}
      <span class="ph-kicker"><b>${items.length}</b>منشوراً</span>
      <h1>أرشيف المنشورات${page > 1 ? ` <small class="seo-pg">صفحة ${page}</small>` : ""}</h1>
      <p>كل الأخبار والمعلومات التي نشرتها ${esc(SITE.name)} مرتّبة من الأحدث إلى الأقدم. هذه الصفحة تعرض المنشورات من ${esc(fmtDate(from))} إلى ${esc(fmtDate(to))}.</p>
    </div>
  </section>
  <section class="section" style="padding-top:36px"><div class="container">
    <div class="section-head"><div><span class="kicker">الصفحة ${page} من ${archivePages}</span><h2>المنشورات حسب التاريخ</h2></div><a class="btn btn-ghost btn-sm" href="topic/index.html">${ic("hash")}تصفّح حسب الموضوع</a></div>
    <div class="grid grid-3 seo-grid">${list.map((it, i) => card(it, i < 3)).join("\n")}</div>
    ${pager(archiveUrl, page, archivePages)}
  </div></section>
</main>`;
  return shell({ seo, body, bodyAttr: 'data-page="archive"', scripts: LIGHT_SCRIPTS });
}

/* ---------- 404 ---------- */
function notFoundPage() {
  const seo = seoTags({ title: `الصفحة غير موجودة${BRAND}`, desc: "لم نجد الصفحة التي تبحث عنها. تصفّح أحدث الأخبار والمعلومات أو ابحث في الأرشيف.", path: "404.html", robots: "noindex, follow" }).replace(/<link rel="canonical"[^>]*>\n/, "");
  const body = `<main>
  <section class="page-hero compact seo-hero" data-sc>
    <div class="ph-giant" aria-hidden="true">404</div>
    <div class="container">
      <span class="ph-kicker"><b>404</b>لوح مفقود</span>
      <h1>الصفحة غير موجودة</h1>
      <p>ربما تغيّر الرابط أو حُذف المنشور. جرّب البحث في المكتبة أو تصفّح أحدث ما نشرناه.</p>
      <div class="btn-row mt-3"><a class="btn btn-primary" href="index.html">${ic("home")}الرئيسية</a><a class="btn btn-ghost" href="facts.html">${ic("book-open")}مكتبة المعلومات</a><a class="btn btn-ghost" href="archive/index.html">${ic("archive")}الأرشيف</a></div>
    </div>
  </section>
  <section class="section" style="padding-top:36px"><div class="container">
    <h2 class="seo-h">أحدث المنشورات</h2>
    <ul class="seo-list">${items.slice(0, 9).map((r) => `<li><a href="${esc(postPath(r))}"><strong>${esc(r.title)}</strong><small>${esc(r.c.name)} · ${esc(fmtDate(r.date))}</small></a></li>`).join("")}</ul>
    <div class="seo-topics mt-4"><h2 class="seo-h">تصفّح حسب الموضوع</h2><div class="seo-chips">${chips(topHubs(24))}</div></div>
  </div></section>
</main>`;
  return shell({ seo, base: SITE_PATH, body, bodyAttr: 'data-page="404"', scripts: `<script src="assets/js/pages/404.js"></script>\n${LIGHT_SCRIPTS}`, csp: "404.html" });
}

/* ==========================================================
   الكتابة
   ========================================================== */
let written = 0;
async function put(file, content) {
  const target = rel(file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  if (!existsSync(target) || readFileSync(target, "utf8") !== content) { await fs.writeFile(target, content); written++; }
}
async function prune(dir, keep, ext = ".html") {
  let removed = 0;
  if (!existsSync(rel(dir))) return 0;
  for (const f of await fs.readdir(rel(dir))) if (f.endsWith(ext) && !keep.has(f)) { await fs.unlink(rel(dir, f)); removed++; }
  return removed;
}
const sitemap = { pages: [], posts: [], topics: [] }; // { path, lastmod, images[] }

/* posts */
{
  const keep = new Set();
  for (const it of items) {
    keep.add(`${it.id}.html`);
    await put(postPath(it), postPage(it));
    sitemap.posts.push({ path: postPath(it), lastmod: day(it.modified), images: it.images.map(imgInfo).filter((m) => m && !m.remote).slice(0, 5).map((m) => ({ loc: m.url, title: cleanTitle(it.title) })) });
  }
  var removedPosts = await prune("post", keep);
}
/* topic hubs */
{
  const keep = new Set(["index.html"]);
  for (const h of hubs) for (let n = 1; n <= h.pages; n++) {
    keep.add(path.basename(hubUrl(h, n)));
    await put(hubUrl(h, n), hubPage(h, n));
    sitemap.topics.push({ path: hubUrl(h, n), lastmod: h.latest });
  }
  await put("topic/index.html", topicsIndexPage());
  sitemap.topics.unshift({ path: "topic/index.html", lastmod: day(items[0].modified) });
  await prune("topic", keep);
}
/* archive */
{
  const keep = new Set();
  for (let n = 1; n <= archivePages; n++) {
    keep.add(path.basename(archiveUrl(n)));
    await put(archiveUrl(n), archivePage(n));
    sitemap.topics.push({ path: n > 1 ? archiveUrl(n) : "archive/", lastmod: day(items[Math.min(items.length - 1, (n - 1) * PER_PAGE)].modified) });
  }
  await prune("archive", keep);
}
await put("404.html", notFoundPage());

await fs.writeFile(rel("assets/js/static-index.js"),
  `/* مولّد تلقائياً بواسطة scripts/build-pages.mjs */\nwindow.SITE_URL=${JSON.stringify(SITE_URL)};\nwindow.STATIC_POSTS=${JSON.stringify(Object.fromEntries(items.map((i) => [i.id, 1])))};\n`);

/* ==========================================================
   الصفحات الرئيسية والأدوات: حقن <head> وقسم ظاهر (لا نلمس منطق الصفحة)
   ========================================================== */
const HEAD_RE = /\n?<!-- seo:head -->[\s\S]*?<!-- \/seo:head -->/;
const BODY_RE = /\n?<!-- seo:body -->[\s\S]*?<!-- \/seo:body -->/;
/* وسوم قديمة نزيلها من <head> لأن الكتلة المحقونة تحلّ محلها */
const OLD_TAGS = /^[ \t]*<(?:title>[^\n]*<\/title|meta\s+(?:name="(?:description|robots|twitter:[^"]*)"|property="(?:og|article):[^"]*")[^>]*|link\s+rel="(?:canonical|alternate|prev|next)"[^>]*)>[ \t]*\r?\n/gm;

function browseBlock(list, heading, more) {
  return `<section class="section seo-browse" aria-labelledby="seo-browse-h">
  <div class="container">
    <div class="section-head"><div><span class="kicker">روابط سريعة</span><h2 id="seo-browse-h">${esc(heading)}</h2></div><a class="btn btn-ghost btn-sm" href="archive/index.html">الأرشيف الكامل${ic("arrow-left")}</a></div>
    <ul class="seo-list">${list.map((r) => `<li><a href="${esc(postPath(r))}"><strong>${esc(r.title)}</strong><small>${esc(r.c.name)} · <time datetime="${esc(day(r.date))}">${esc(fmtDate(r.date))}</time></small></a></li>`).join("")}</ul>
    <div class="seo-topics mt-3"><h3 class="seo-h">${esc(more)}</h3><div class="seo-chips">${chips(topHubs(28))}<a class="chip" href="topic/index.html">كل المواضيع</a></div></div>
  </div>
</section>`;
}
/* أزرار مشاركة ثابتة (نفس أصناف App.shareButtons)؛ زر «مشاركة» يظهر فقط حيث يدعم المتصفح Web Share */
function shareRow(url, text) {
  const u = encodeURIComponent(url), t = encodeURIComponent(text);
  return `<div class="share-row">
      <button class="btn btn-ghost btn-sm" type="button" data-copy="${esc(url)}">${ic("link")}نسخ الرابط</button>
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" href="https://wa.me/?text=${t}%20${u}">${ic("message-circle")}واتساب</a>
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" href="https://t.me/share/url?url=${u}&amp;text=${t}">${ic("send")}تليغرام</a>
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" href="https://x.com/intent/post?text=${t}&amp;url=${u}">${ic("twitter")}إكس</a>
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" href="https://www.facebook.com/sharer/sharer.php?u=${u}">${ic("facebook")}فيسبوك</a>
      <button class="btn btn-ghost btn-sm" type="button" data-native-share hidden>${ic("share-2")}مشاركة</button>
    </div>`;
}
function toolBlock(file, t) {
  const others = Object.entries(TOOL_SEO).filter(([f]) => f !== file);
  return `<section class="section seo-guide" id="guide" aria-labelledby="seo-guide-h">
  <div class="container">
    <div class="section-head"><div><span class="kicker">دليل الاستخدام</span><h2 id="seo-guide-h">${esc(t.h2)}</h2></div></div>
    <p class="seo-intro">${esc(t.intro)}</p>
    <ol class="seo-steps">${t.steps.map(([n, x]) => `<li><h3>${esc(n)}</h3><p>${esc(x)}</p></li>`).join("")}</ol>
    <h2 class="seo-h mt-4" id="faq">الأسئلة الأكثر بحثاً: ${esc(t.name)}</h2>
    <div class="acc seo-faq">${t.faq.map(([q, a]) => `<details><summary>${esc(q)}${ic("chevron-down")}</summary><div class="acc-body">${esc(a)}</div></details>`).join("")}</div>
    <div class="seo-topics mt-4"><h2 class="seo-h">شارك الأداة مع من يحتاجها</h2>${shareRow(abs(file), t.title)}</div>
    <div class="seo-topics mt-4"><h2 class="seo-h">أدوات مجانية أخرى</h2><div class="seo-chips">${others.map(([f, o]) => `<a class="chip" href="${f}">${esc(o.name)}</a>`).join("")}<a class="chip" href="tools.html">كل الأدوات</a></div></div>
  </div>
</section>`;
}
const webPageLd = (type, p, title, desc, extra = {}) => ({ "@type": type, "@id": abs(p) + "#webpage", url: abs(p), name: title, description: desc, inLanguage: "ar", isPartOf: { "@id": SITE_ID }, publisher: { "@id": ORG_ID }, ...extra });

const rootPages = (await fs.readdir(ROOT)).filter((f) => f.endsWith(".html")).sort();
const SKIP_INDEX = new Set(["fact.html", "offline.html", "404.html"]);
const pageMeta = {};
for (const f of rootPages) {
  if (f === "404.html") continue;
  const file = rel(f);
  const orig = readFileSync(file, "utf8");
  const headEnd = orig.indexOf("</head>");
  if (headEnd < 0) continue;
  let head = orig.slice(0, headEnd), rest = orig.slice(headEnd);
  const oldTitle = (head.match(/<title>([^<]*)<\/title>/) || [])[1] || SITE.name;
  const oldDesc = (head.match(/<meta name="description" content="([^"]*)"/) || [])[1] || SITE.description;
  const unescape = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
  const cfg = PAGES[f] || TOOL_SEO[f] || {};
  const p = f === "index.html" ? "" : f;
  const rawTitle = cfg.title || unescape(oldTitle).replace(/\s*\|\s*[^|]*$/, "");
  const title = f === "index.html" ? rawTitle : (rawTitle + BRAND).length <= 70 ? rawTitle + BRAND : rawTitle;
  const desc = cfg.desc || unescape(oldDesc);
  const tool = TOOL_SEO[f];
  let ld = [], block = "", robots;

  if (f === "index.html") {
    ld = [{ "@type": "WebSite", "@id": SITE_ID, url: abs(""), name: SITE.name, alternateName: "إمبراطورية المعلومات العراقية", description: SITE.description, inLanguage: "ar", publisher: { "@id": ORG_ID },
      potentialAction: { "@type": "SearchAction", target: { "@type": "EntryPoint", urlTemplate: `${abs("facts.html")}?q={search_term_string}` }, "query-input": "required name=search_term_string" } },
      orgNode(), itemListLd(items.slice(0, 12), "أحدث المنشورات")];
    block = browseBlock(items.slice(0, 12), "أحدث الأخبار والمعلومات", "تصفّح حسب الموضوع");
  } else if (tool) {
    const crumbs = [["الرئيسية", ""], ...(f === "verify.html" ? [] : [["الأدوات", "tools.html"]]), [tool.name, f]];
    ld = [{ "@type": "WebApplication", "@id": abs(f) + "#app", name: tool.name, url: abs(f), description: desc, applicationCategory: tool.category, operatingSystem: "Any", browserRequirements: "يتطلب متصفحاً حديثاً يدعم JavaScript", inLanguage: "ar", isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" }, publisher: { "@id": ORG_ID }, provider: orgRef },
      { "@type": "HowTo", "@id": abs(f) + "#howto", name: tool.h2.replace(/[؟?]$/, ""), description: tool.intro, inLanguage: "ar", totalTime: "PT2M", tool: [{ "@type": "HowToTool", name: tool.name }],
        step: tool.steps.map(([n, x], i) => ({ "@type": "HowToStep", position: i + 1, name: n, text: x, url: abs(f) + "#guide" })) },
      { "@type": "FAQPage", "@id": abs(f) + "#faq", mainEntity: tool.faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
      crumbsLd(crumbs)];
    block = toolBlock(f, tool);
  } else if (f === "tools.html") {
    ld = [webPageLd("CollectionPage", f, title, desc, { mainEntity: itemListLd(TOOLS.map((t) => ({ path: t.href, name: t.title })), "الأدوات الرقمية") }), crumbsLd([["الرئيسية", ""], ["الأدوات", f]])];
  } else if (f === "facts.html" || f === "branch.html" || f === "channel.html") {
    const pool = f === "facts.html" ? items.filter((i) => !i.branch && (i.type === "fact")) : f === "branch.html" ? items.filter((i) => i.branch) : items.filter((i) => String(i.id).startsWith("tg-"));
    const list = pool.slice(0, 12);
    const heading = f === "facts.html" ? "أحدث المعلومات" : f === "branch.html" ? "أحدث أخبار الفروع" : "أحدث منشورات القناة";
    ld = [webPageLd("CollectionPage", f, title, desc, { mainEntity: itemListLd(list, heading) }), crumbsLd([["الرئيسية", ""], [cfg.crumb, f]])];
    block = browseBlock(list, heading, "تصفّح حسب الموضوع");
  } else if (f === "about.html") {
    ld = [webPageLd("AboutPage", f, title, desc, { about: { "@id": ORG_ID } }), orgNode(), crumbsLd([["الرئيسية", ""], [cfg.crumb, f]])];
  } else if (f === "contact.html") {
    ld = [webPageLd("ContactPage", f, title, desc, { about: { "@id": ORG_ID } }), crumbsLd([["الرئيسية", ""], [cfg.crumb, f]])];
  } else if (f === "fact.html" || f === "offline.html") {
    robots = "noindex, follow";
  } else {
    const h1 = strip((orig.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1] || rawTitle);
    ld = [webPageLd("WebPage", f, title, desc), crumbsLd([["الرئيسية", ""], [cfg.crumb || clip(h1, 40), f]])];
  }

  let tags = seoTags({ title, desc, path: p, ld, robots, ogTitle: rawTitle, image: ogImg(`page:${f}`) || DEF_IMG });
  if (robots) tags = tags.replace(/<link rel="canonical"[^>]*>\n/, "");
  head = head.replace(HEAD_RE, "").replace(OLD_TAGS, "");
  // دالة استبدال لا نص: عنوان منشور فيه $1 أو $& كان يُفسَّر كنمط استبدال فيفسد الصفحة ويوقف البناء
  head = head.replace(/(<meta name="viewport"[^>]*>)/, (m) => `${m}\n<!-- seo:head -->\n${securityMeta(f, SITE)}\n${tags}\n<!-- /seo:head -->`);
  // سكربت منع الوميض يُكتب من المصدر الواحد حتى تطابق بصمته سياسة أمن المحتوى دائماً
  head = head.replace(/<script>try\{var d=document\.documentElement[\s\S]*?<\/script>/, () => THEME_BOOT);
  rest = rest.replace(BODY_RE, "");
  if (block) rest = rest.replace(/\n?<\/main>/, () => `\n<!-- seo:body -->\n${block}\n<!-- /seo:body -->\n</main>`);
  if (f === "fact.html") {
    // الروابط القديمة fact.html?id=… تُحوَّل إلى الصفحة الثابتة إن وُجدت (ويبقى العرض الديناميكي لغيرها)
    rest = rest.replace(/\n?<script>\/\* seo:redirect \*\/[\s\S]*?<\/script>/, "");
    if (!rest.includes("assets/js/pages/fact-redirect.js")) rest = rest.replace(/(<script src="assets\/js\/static-index\.js"><\/script>)/, (m) => `${m}\n<script src="assets/js/pages/fact-redirect.js"></script>`);
  }
  const next = head + rest;
  if (next !== orig) { await fs.writeFile(file, next); written++; }
  if (!SKIP_INDEX.has(f)) {
    // lastmod الحقيقي: يتغيّر فقط حين يتغيّر محتوى الصفحة
    const h = hash(next), st = state.pages[f];
    if (!st) state.pages[f] = { h, lastmod: TODAY }; else if (st.h !== h) state.pages[f] = { h, lastmod: TODAY };
    sitemap.pages.push({ path: p, lastmod: state.pages[f].lastmod });
    pageMeta[f] = { title, desc };
  }
}
for (const f of Object.keys(state.pages)) if (!rootPages.includes(f)) delete state.pages[f];

/* ==========================================================
   sitemap / feeds / robots / IndexNow
   ========================================================== */
// تاريخ معطوب في منشور واحد لا يوقف البناء كله
const isoSafe = (d) => { const t = new Date(d); return isNaN(t) ? new Date(TODAY + "T09:00:00+03:00").toISOString() : t.toISOString(); };
const xml = (s) => String(s ?? "").replace(/[^\x09\x0A\x0D\x20-\uD7FF\uE000-\uFFFD\u{10000}-\u{10FFFF}]/gu, "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[c]));
const urlset = (list, ns = "") => `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${ns}>\n${list.join("\n")}\n</urlset>\n`;
const urlEntry = (u) => `  <url><loc>${xml(abs(u.path))}</loc><lastmod>${u.lastmod}</lastmod>${(u.images || []).map((m) => `<image:image><image:loc>${xml(m.loc)}</image:loc></image:image>`).join("")}</url>`;
const IMG_NS = ' xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"';
const sitemapFiles = [];
if (SITE_URL) {
  const parts = [["sitemap-pages.xml", sitemap.pages, ""], ["sitemap-topics.xml", sitemap.topics, ""]];
  for (let i = 0, n = 1; i < sitemap.posts.length; i += 5000, n++) parts.push([`sitemap-posts${n > 1 ? "-" + n : ""}.xml`, sitemap.posts.slice(i, i + 5000), IMG_NS]);
  for (const [name, list, ns] of parts) {
    await put(name, urlset(list.map(urlEntry), ns));
    sitemapFiles.push({ name, lastmod: list.reduce((m, u) => (u.lastmod > m ? u.lastmod : m), "2000-01-01") });
  }
  await put("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapFiles.map((s) => `  <sitemap><loc>${xml(abs(s.name))}</loc><lastmod>${s.lastmod}</lastmod></sitemap>`).join("\n")}\n</sitemapindex>\n`);
  // Google News: أخبار آخر 48 ساعة فقط
  const fresh = items.filter((i) => i.isNews && NOW - new Date(iso(i.date)).getTime() < 48 * 3600e3 && NOW >= new Date(iso(i.date)).getTime() - 3600e3);
  await put("sitemap-news.xml", urlset(fresh.map((i) => `  <url><loc>${xml(abs(postPath(i)))}</loc><news:news><news:publication><news:name>${xml(SITE.name)}</news:name><news:language>ar</news:language></news:publication><news:publication_date>${xml(iso(i.date))}</news:publication_date><news:title>${xml(cleanTitle(i.title))}</news:title></news:news></url>`),
    ' xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"'));
  for (const f of await fs.readdir(ROOT)) if (/^sitemap-posts(-\d+)?\.xml$/.test(f) && !sitemapFiles.some((s) => s.name === f)) await fs.unlink(rel(f));
}

/* RSS + Atom: آخر 60 منشوراً */
{
  const feed = items.slice(0, 60);
  const updated = feed.reduce((m, i) => (i.modified > m ? i.modified : m), feed[0] ? feed[0].modified : iso(TODAY));
  const rfc = (d) => new Date(d).toUTCString();
  const html = (it) => `${it.img ? `<p><img src="${esc(it.img.url)}" alt="${esc(cleanTitle(it.title))}"></p>` : ""}${it.body}<p><a href="${esc(abs(postPath(it)))}">اقرأ في ${esc(SITE.name)}</a></p>`;
  await put("feed.xml", `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/">
<channel>
<title>${xml(SITE.name)}</title>
<link>${xml(abs(""))}</link>
<description>${xml(SITE.description)}</description>
<language>ar</language>
<lastBuildDate>${rfc(updated)}</lastBuildDate>
<atom:link href="${xml(abs("feed.xml"))}" rel="self" type="application/rss+xml"/>
<image><url>${xml(abs(LOGO.path))}</url><title>${xml(SITE.name)}</title><link>${xml(abs(""))}</link></image>
${feed.map((it) => `<item>
<title>${xml(cleanTitle(it.title))}</title>
<link>${xml(abs(postPath(it)))}</link>
<guid isPermaLink="true">${xml(abs(postPath(it)))}</guid>
<pubDate>${rfc(iso(it.date))}</pubDate>
<category>${xml(it.c.name)}</category>
<description>${xml(it.seoDesc)}</description>
<content:encoded><![CDATA[${html(it).replace(/]]>/g, "]]&gt;")}]]></content:encoded>${it.img ? `\n<media:content url="${xml(it.img.url)}" medium="image"${it.img.width ? ` width="${it.img.width}" height="${it.img.height}"` : ""}/>` : ""}
</item>`).join("\n")}
</channel>
</rss>
`);
  await put("atom.xml", `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="ar">
<title>${xml(SITE.name)}</title>
<subtitle>${xml(SITE.description)}</subtitle>
<id>${xml(abs(""))}</id>
<link href="${xml(abs(""))}" rel="alternate" type="text/html"/>
<link href="${xml(abs("atom.xml"))}" rel="self" type="application/atom+xml"/>
<updated>${new Date(updated).toISOString()}</updated>
<author><name>${xml(SITE.name)}</name><uri>${xml(abs(""))}</uri></author>
<icon>${xml(abs("assets/img/icon-192.png"))}</icon>
${feed.map((it) => `<entry>
<title>${xml(cleanTitle(it.title))}</title>
<id>${xml(abs(postPath(it)))}</id>
<link href="${xml(abs(postPath(it)))}" rel="alternate" type="text/html"/>
<published>${isoSafe(iso(it.date))}</published>
<updated>${isoSafe(it.modified)}</updated>
<category term="${xml(it.c.name)}"/>
<summary>${xml(it.seoDesc)}</summary>
<content type="html">${xml(html(it))}</content>
</entry>`).join("\n")}
</feed>
`);
}

/* IndexNow: مفتاح عام ثابت + قائمة الروابط الجديدة/المعدّلة في هذا البناء */
if (!siteCfg.indexNowKey) {
  siteCfg.indexNowKey = crypto.randomBytes(16).toString("hex");
  writeFileSync(cfgFile, JSON.stringify(siteCfg, null, 2) + "\n");
}
await put(`${siteCfg.indexNowKey}.txt`, siteCfg.indexNowKey);
{
  const all = [...sitemap.pages, ...sitemap.topics, ...sitemap.posts];
  const changed = all.filter((u) => state.urls[u.path] !== u.lastmod).map((u) => u.path);
  const known = new Set(all.map((u) => u.path));
  for (const u of all) state.urls[u.path] = u.lastmod;
  for (const k of Object.keys(state.urls)) if (!known.has(k)) delete state.urls[k];
  if (changed.length) await put("scripts/indexnow-pending.json", JSON.stringify({ generated: new Date().toISOString(), count: changed.length, paths: changed }, null, 1) + "\n");
  var changedCount = changed.length;
}

await put("robots.txt", `User-agent: *\nAllow: /\n${SITE_URL ? `\nSitemap: ${SITE_URL}/sitemap.xml\nSitemap: ${SITE_URL}/sitemap-news.xml\n` : ""}`);

/* state: مرتّب المفاتيح حتى لا يتغيّر الملف بلا سبب */
const sortObj = (o) => Object.fromEntries(Object.keys(o).sort().map((k) => [k, o[k]]));
await put("scripts/seo-state.json", JSON.stringify({ _: "مولّد تلقائياً: تواريخ آخر تعديل حقيقي لكل صفحة. لا تعدّله يدوياً.", posts: sortObj(state.posts), pages: sortObj(state.pages), urls: sortObj(state.urls) }) + "\n");

console.log(`✔ ${items.length} صفحة منشور في post/ (حُذف ${removedPosts} قديمة) · ${hubs.length} موضوعاً/قسماً (${sitemap.topics.length - archivePages - 1} صفحة) · ${archivePages} صفحة أرشيف`);
console.log(`  صور المعاينة: ${ogStats.total} بطاقة · رُسمت الآن ${ogStats.rendered}${ogStats.failed ? ` · فشل ${ogStats.failed}` : ""}${ogStats.skipped ? " · (تعذّر الرسم: راجع التنبيه أعلاه)" : ""} · حُذفت ${ogPruned} قديمة`);
console.log(`  ملفات تغيّرت في هذا البناء: ${written} · روابط جديدة/معدّلة لـ IndexNow: ${changedCount}`);
console.log(SITE_URL ? `  الرابط الأساسي: ${SITE_URL} · sitemap.xml (${sitemapFiles.length} ملفات) + sitemap-news.xml + feed.xml + atom.xml` : "  ⚠ لم يُحدَّد siteUrl: الروابط نسبية ولم يُكتب sitemap. ضع الرابط في scripts/site.config.json أو متغير SITE_URL.");
