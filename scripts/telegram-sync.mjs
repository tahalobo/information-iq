#!/usr/bin/env node
/* ==========================================================
   مزامنة قناة تليغرام مع الموقع
   يقرأ الصفحة العامة t.me/s/<channel> (بلا API ولا توكن)، ثم يصنّف المنشورات،
   ويحمّل الصور، ويكتب ملفات البيانات التي يقرؤها الموقع.

   الاستخدام:
     node scripts/telegram-sync.mjs              تحديث (آخر الصفحات)
     node scripts/telegram-sync.mjs --pages 40   سحب 40 صفحة للخلف (≈ 800 منشور)
     node scripts/telegram-sync.mjs --reclassify إعادة التصنيف دون إنترنت
     node scripts/telegram-sync.mjs --report     طباعة جدول التصنيف
   ========================================================== */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classify, contextPass, groupEvents, makeTitle, makeExcerpt, cleanText, TYPES } from "./telegram-classify.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = {
  config: path.join(ROOT, "scripts/telegram.config.json"),
  store: path.join(ROOT, "scripts/telegram-store.json"),
  sources: path.join(ROOT, "scripts/sources-store.json"),
  index: path.join(ROOT, "assets/js/telegram-data.js"),
  posts: path.join(ROOT, "assets/tg/posts"),
  img: path.join(ROOT, "assets/tg/img")
};
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const UA = "Mozilla/5.0 (compatible; IQInfoEmpireSync/1.0; +https://www.instagram.com/information_1q/)";

/* ---------- HTML parsing of t.me/s pages ---------- */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
const decode = (s) => s.replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m);

function innerDiv(html, start) {
  // returns inner HTML of the <div> that opens at index `start`, honouring nesting
  let i = html.indexOf(">", start) + 1, depth = 1; const from = i;
  const re = /<div\b|<\/div>/g; re.lastIndex = i;
  let m; while ((m = re.exec(html))) { depth += m[0] === "</div>" ? -1 : 1; if (!depth) return html.slice(from, m.index); }
  return html.slice(from);
}

function htmlToText(h) {
  const links = [];
  let t = h.replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g, (m, href, inner) => {
    const label = decode(inner.replace(/<[^>]+>/g, "")).trim(); href = decode(href);
    links.push({ href, label });
    return label && !/^https?:/.test(label) && !href.startsWith("?q=") ? `${label}` : href.startsWith("?q=") ? label : href;
  });
  t = t.replace(/<br\s*\/?>/g, "\n").replace(/<\/(p|div)>/g, "\n").replace(/<[^>]+>/g, "");
  return { text: decode(t).replace(/ /g, " ").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim(), links };
}

const parseCount = (s) => { if (!s) return 0; const m = s.trim().match(/([\d.]+)\s*([KM]?)/i); if (!m) return 0; return Math.round(+m[1] * (m[2].toUpperCase() === "K" ? 1e3 : m[2].toUpperCase() === "M" ? 1e6 : 1)); };

export function parsePage(html, channel) {
  const out = [];
  const blocks = html.split('<div class="tgme_widget_message_wrap').slice(1);
  for (const b of blocks) {
    const id = +((b.match(new RegExp(`data-post="${channel}/(\\d+)"`, "i")) || [])[1] || 0);
    if (!id) continue;
    const ti = b.search(/class="tgme_widget_message_text[^"]*"/);
    let text = "", links = [];
    if (ti >= 0) {
      const divStart = b.lastIndexOf("<div", ti);
      let inner = innerDiv(b, divStart);
      const nested = inner.search(/class="tgme_widget_message_text/);
      if (nested >= 0) inner = innerDiv(inner, inner.lastIndexOf("<div", nested));
      ({ text, links } = htmlToText(inner));
    }
    const photos = [...b.matchAll(/tgme_widget_message_photo_wrap[^"]*"[^>]*?background-image:url\('([^']+)'\)/g)].map((m) => m[1]);
    const vthumb = (b.match(/tgme_widget_message_video_thumb"[^>]*background-image:url\('([^']+)'\)/) || [])[1];
    const hasVideo = /tgme_widget_message_video_player|tgme_widget_message_roundvideo/.test(b);
    const duration = (b.match(/message_video_duration[^>]*>([^<]+)</) || [])[1];
    const pollQ = (b.match(/tgme_widget_message_poll_question">([\s\S]*?)<\/div>/) || [])[1];
    const pollOpts = [...b.matchAll(/tgme_widget_message_poll_option_text">([\s\S]*?)<\/div>/g)].map((m) => decode(m[1].replace(/<[^>]+>/g, "")).trim());
    const fwd = (b.match(/tgme_widget_message_forwarded_from_name[^>]*>(?:<span[^>]*>)?([^<]+)/) || [])[1];
    const preview = /tgme_widget_message_link_preview/.test(b);
    const date = (b.match(/<time datetime="([^"]+)"/) || [])[1];
    const views = parseCount((b.match(/tgme_widget_message_views">([^<]+)</) || [])[1]);
    const reactions = [...b.matchAll(/class="tgme_reaction"[\s\S]*?<\/i>([\d.KM]+)/g)].reduce((a, m) => a + parseCount(m[1]), 0);
    out.push({
      id, date, text, links: links.filter((l) => /^https?:/.test(l.href)).slice(0, 10),
      photos, video: hasVideo ? { thumb: vthumb || null, duration: duration ? duration.trim() : null } : null,
      poll: pollQ ? { q: decode(pollQ.replace(/<[^>]+>/g, "")).trim(), options: pollOpts } : null,
      forwardedFrom: fwd ? decode(fwd).trim() : null, linkPreview: preview, views, reactions
    });
  }
  return out;
}

async function fetchPage(channel, before) {
  const url = `https://t.me/s/${channel}${before ? `?before=${before}` : ""}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": UA, "Accept-Language": "ar,en;q=0.8" } });
      if (r.status === 429) { await sleep(5000 * attempt); continue; }
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.text();
    } catch (e) { if (attempt === 3) throw e; await sleep(1500 * attempt); }
  }
}

async function download(url, file) {
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA } });
    if (!r.ok) return false;
    await fs.writeFile(file, Buffer.from(await r.arrayBuffer()));
    return true;
  } catch { return false; }
}

/* ---------- Content shaping ---------- */
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
function stripSignature(text, cfg) {
  let t = text;
  for (const l of cfg.stripLinks) t = t.replace(new RegExp(`\\s*(https?:\\/\\/)?${l.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}\\S*`, "gi"), "");
  // signature lines such as "✸ @informationiq | @informationss_iq ✸"
  t = t.split("\n").filter((line) => !(/@[A-Za-z0-9_]{4,}/.test(line) && (line.replace(/@[A-Za-z0-9_]+/g, "").match(/[ء-ي]/g) || []).length < 6)).join("\n");
  return t.replace(/[\s|•·-]+$/g, "").trim();
}
function bodyHtml(text, title) {
  let t = text;
  if (title && t.startsWith(title) && t.slice(title.length).trim()) t = t.slice(title.length).replace(/^[\s.:،-]+/, "");
  return t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>").replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>')}</p>`).join("\n");
}
const hashtags = (t) => [...new Set((t.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.slice(1).replace(/_/g, " ")))].slice(0, 6);

/* ---------- Main ---------- */
async function main() {
  const cfg = JSON.parse(await fs.readFile(P.config, "utf8"));
  const ch = cfg.channel;
  const store = existsSync(P.store) ? JSON.parse(await fs.readFile(P.store, "utf8")) : { channel: ch, posts: {} };
  const known = new Set(Object.keys(store.posts).map(Number));
  // extra sources found on the web by scripts/enrich-sources.mjs (+ manual ones from overrides)
  const found = existsSync(P.sources) ? JSON.parse(await fs.readFile(P.sources, "utf8")).posts || {} : {};
  const blockedSrc = cfg.sources?.block || [];
  const sourcesOf = (id) => {
    const ov = cfg.overrides?.[id] || {};
    if (ov.noSources) return [];
    const manual = (ov.sources || []).filter((s) => s && /^https?:\/\//.test(s.url)).map((s) => ({ url: s.url, name: s.name || s.url, manual: true }));
    const auto = ((found[id] && found[id].sources) || []).filter((s) => !blockedSrc.some((b) => s.host === b || s.host.endsWith("." + b) || s.url === b) && !manual.some((m) => m.url === s.url));
    return [...manual, ...auto];
  };
  await fs.mkdir(P.posts, { recursive: true }); await fs.mkdir(P.img, { recursive: true });

  /* 1) Fetch */
  let fetched = 0, added = 0;
  if (!flag("--reclassify")) {
    const pages = +opt("--pages", known.size ? cfg.updatePages : cfg.firstRunPages);
    let before = null;
    for (let p = 0; p < pages; p++) {
      const html = await fetchPage(ch, before);
      const posts = parsePage(html, ch);
      if (!posts.length) break;
      for (const post of posts) {
        const prev = store.posts[post.id];
        if (!prev) added++;
        store.posts[post.id] = { ...prev, ...post, images: prev?.images, firstSeen: prev?.firstSeen || new Date().toISOString() };
        fetched++;
      }
      before = Math.min(...posts.map((x) => x.id));
      process.stdout.write(`\rصفحة ${p + 1}/${pages} · ${fetched} منشور · جديد ${added}   `);
      if (before <= 1) break;
      await sleep(900);
    }
    process.stdout.write("\n");
  }

  /* 2) Classify every stored post (so tuning rules applies to old posts too) */
  const all = Object.values(store.posts).sort((a, b) => b.id - a.id).slice(0, cfg.maxPosts);
  const keepIds = new Set(all.map((p) => p.id));
  const index = []; const counts = {};
  const visible = new Set(["fact", "news", "event", "discussion", "literature"]);
  const seenText = new Set();

  const items = all.map((post) => { const text = stripSignature(post.text || "", cfg); return { id: post.id, date: post.date, post, text, c: classify({ ...post, text }, cfg) }; });
  contextPass(items);
  // overrides + de-duplication of reposted texts (oldest copy wins)
  for (const it of [...items].sort((a, b) => a.id - b.id)) {
    const ov = cfg.overrides?.[it.id] || {};
    if (ov.type) it.c.type = ov.type; if (ov.cat) it.c.cat = ov.cat;
    const sig = cleanText(it.text).slice(0, 160);
    if (sig.length > 40 && seenText.has(sig)) it.c.type = "duplicate"; else if (sig.length > 40) seenText.add(sig);
    if (ov.hide) it.c.type = "hidden";
  }
  // one card per event: announcement + questions + polls + winners
  const groups = groupEvents(items);
  for (const g of groups) { g.leader.group = g; g.members.forEach((m) => { if (m !== g.leader) m.inGroup = g.leader.id; }); }

  for (const it of items) {
    const { post, text, c } = it;
    const ov = cfg.overrides?.[post.id] || {};
    const type = c.type, cat = c.cat;
    counts[type] = (counts[type] || 0) + 1;
    post.cls = { type, cat, media: c.media, len: c.len, confidence: c.confidence, reasons: c.reasons, group: it.inGroup || null };
    if (!visible.has(type) || it.inGroup) continue;

    /* 3) Images (Telegram CDN links expire, so keep local copies) */
    if (cfg.downloadImages && !post.images && ["fact", "news", "event"].includes(type)) {
      const srcs = [...(post.photos || []).slice(0, cfg.maxImagesPerPost), ...(post.video?.thumb ? [post.video.thumb] : [])];
      const saved = [];
      for (let i = 0; i < srcs.length; i++) {
        const name = `${post.id}-${i + 1}.jpg`;
        if (existsSync(path.join(P.img, name)) || await download(srcs[i], path.join(P.img, name))) saved.push(`assets/tg/img/${name}`);
        else saved.push(srcs[i]);
      }
      post.images = saved;
    }
    const imgs = post.images || [];
    const g = it.group;
    const title = ov.title || (g && (g.title || `${g.kind}: ${makeTitle(text)}`)) || (type === "literature" ? (cleanText(text).split("\n")[0].slice(0, 70) + (cleanText(text).split("\n")[0].length > 70 ? "…" : "")) : makeTitle(text)) || TYPES[type];
    const videoThumb = post.video && post.video.thumb ? imgs[imgs.length - 1] : null;
    const photos = post.video?.thumb ? imgs.slice(0, -1) : imgs;

    index.push({
      id: post.id, type, cat, media: c.media, date: (post.date || "").slice(0, 10), title,
      excerpt: g ? `${g.kind} من ${g.members.length} منشورات${g.questions ? ` تضم ${g.questions} سؤالاً وفقرة` : ""}${g.winners ? " مع إعلان الفائزين" : ""}. ${makeExcerpt(text, title, 120)}` : makeExcerpt(text, title),
      image: photos[0] || videoThumb || null, images: photos.length,
      video: post.video ? { duration: post.video.duration } : null, views: Math.max(post.views || 0, ...(g ? g.members.map((m) => m.post.views || 0) : [0])),
      tags: hashtags(text), len: g ? g.members.reduce((a, m) => a + m.c.len, 0) : c.len, conf: c.confidence, src: sourcesOf(post.id).length || undefined,
      why: g ? [`فعالية مجمّعة من ${g.members.length} منشورات (#${g.members[0].id} إلى #${g.members[g.members.length - 1].id})`, ...c.reasons.slice(0, 3)] : c.reasons.slice(0, 5)
    });

    // Event detail: every part of the event in order, winners highlighted
    const eventHtml = g ? `${bodyHtml(text, "")}\n<h2>فقرات الفعالية</h2>\n<ol class="event-parts">${g.members.filter((m) => m !== g.leader && m !== g.winners).map((m) =>
      `<li>${m.post.poll ? `<strong>${esc(m.post.poll.q)}</strong><br>${m.post.poll.options.map((o) => "◦ " + esc(o)).join("<br>")}` : esc(cleanText(m.text)).replace(/\n+/g, "<br>")} <a class="link small" href="https://t.me/${ch}/${m.id}" target="_blank" rel="noopener">#${m.id}</a></li>`).join("")}</ol>
      ${g.winners ? `<div class="didyouknow"><span>🏆</span><div><strong>الفائزون</strong>${esc(cleanText(g.winners.text)).replace(/\n/g, "<br>")}</div></div>` : ""}` : "";

    const detail = {
      id: post.id, type, cat, date: post.date, title, html: g ? eventHtml : (bodyHtml(text, title) || ""),
      images: photos, video: post.video ? { thumb: videoThumb, duration: post.video.duration } : null,
      poll: post.poll, views: post.views, reactions: post.reactions, forwardedFrom: post.forwardedFrom,
      links: (post.links || []).filter((l) => !cfg.stripLinks.some((s) => l.href.includes(s))),
      url: `https://t.me/${ch}/${post.id}`, sources: sourcesOf(post.id)
    };
    await fs.writeFile(path.join(P.posts, `${post.id}.js`), `window.TG_POST=${JSON.stringify(detail)};\n`);
  }

  /* 4) Prune old posts & orphan files */
  for (const id of Object.keys(store.posts)) if (!keepIds.has(+id)) delete store.posts[id];
  const indexIds = new Set(index.map((p) => String(p.id)));
  for (const f of await fs.readdir(P.posts)) if (!indexIds.has(f.replace(/\.js$/, ""))) await fs.rm(path.join(P.posts, f));
  for (const f of await fs.readdir(P.img)) if (!indexIds.has(f.split("-")[0])) await fs.rm(path.join(P.img, f));

  /* 5) Write */
  store.updated = new Date().toISOString();
  await fs.writeFile(P.store, JSON.stringify(store));
  const data = { channel: ch, updated: store.updated, minFactLength: cfg.minFactLength, counts, posts: index };
  await fs.writeFile(P.index, `/* مولّد تلقائياً بواسطة scripts/telegram-sync.mjs — لا تعدّله يدوياً */\nwindow.TG=${JSON.stringify(data)};\n`);

  console.log(`✔ ${index.length} منشور معروض من أصل ${all.length}`);
  console.log("  " + Object.entries(counts).map(([k, v]) => `${TYPES[k] || k}: ${v}`).join(" · "));

  if (flag("--report")) {
    for (const p of all.slice(0, +opt("--limit", 80))) {
      const c = p.cls; console.log(`${p.id}\t${(TYPES[c.type] || c.type).padEnd(10)}\t${c.cat.padEnd(8)}\t${c.media.padEnd(5)}\t${String(c.len).padStart(4)}\t${(index.find((x) => x.id === p.id)?.title || cleanText(p.text).slice(0, 50)).slice(0, 70)}`);
    }
  }
}

main().catch((e) => { console.error("✖ فشلت المزامنة:", e.message); process.exit(1); });
