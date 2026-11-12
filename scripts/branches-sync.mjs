#!/usr/bin/env node
/* ==========================================================
   فروع الإمبراطورية العراقية: الأخبار، الألعاب، الموسيقى، الأنمي، الرياضة
   ----------------------------------------------------------
   يسحب كل قناة من صفحتها العامة t.me/s/<channel> (بلا API ولا توكن)، ثم يُبقي فقط
   الخبر الذي يصلح «عنواناً + وصفاً»، ويستبعد:
     - الإعلانات (استثمار، بوتات، قنوات أخرى، «قناتنا الاحتياطية»…)
     - الفعاليات والمسابقات والاستفتاءات وأسئلة التعليقات
     - الخبر القصير ذا السطر الواحد، والدردشة («شنو رأيكم؟»)، والشعر
     - المحوَّل من قنوات أخرى، والمكرر (بين الفروع ومع قناة المعلومات)
   الإعدادات: scripts/telegram.config.json ← branches

   الاستخدام:
     node scripts/branches-sync.mjs                 تحديث كل الفروع
     node scripts/branches-sync.mjs --only news     فرع واحد
     node scripts/branches-sync.mjs --pages 12      سحب أعمق
     node scripts/branches-sync.mjs --reclassify    إعادة الفرز دون إنترنت
     node scripts/branches-sync.mjs --report news   جدول: ما قُبل وما رُفض ولماذا
   ========================================================== */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parsePage, fetchPage, download, esc } from "./telegram-sync.mjs";
import { classify, cleanText, norm } from "./telegram-classify.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = {
  config: path.join(ROOT, "scripts/telegram.config.json"),
  infoStore: path.join(ROOT, "scripts/telegram-store.json"),
  stores: path.join(ROOT, "scripts/branches"),
  posts: path.join(ROOT, "assets/tg/posts"),
  img: path.join(ROOT, "assets/tg/br"),
  index: path.join(ROOT, "assets/js/branches-data.js")
};
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clip = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

/* ---------- Cleaning: signatures, channel links, decorative markers ---------- */
const MARK = /^[\s\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍|‖¦•●○◆◇■□▪▫◽◾◻◼⚪⚫▶►➖—–:-]+/u;
const SPLIT = /\s*(?:🔻|🔺|◻️?|◽️?|▫️?|◼️?|◾️?|▪️?|•|●|➖)\s*/gu;
export function cleanBranchText(text) {
  let t = String(text || "").replace(/\r/g, "");
  t = t.replace(/&(rlm|lrm|zwnj|zwj);/gi, "").replace(/[​-‏‪-‮⁠﻿]/g, "");
  t = t.replace(/●?\s*قناتنا الاحتياطي[ةه][^\n]*/g, "");                            // "● قناتنا الاحتياطية https://…"
  t = t.replace(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/\S+/gi, "");                 // channel links
  t = t.replace(/(?:\s*[|⇔↔&]?\s*@[A-Za-z0-9_]{4,})+\s*$/gm, "");                     // "@group | @channel" signatures
  t = t.split("\n").filter((l) => !(/@[A-Za-z0-9_]{4,}/.test(l) && (l.replace(/@[A-Za-z0-9_]+/g, "").match(/[ء-ي]/g) || []).length < 6)).join("\n");
  t = t.replace(SPLIT, "\n");                                                          // 🔻 ◻️ ◽ → paragraph
  t = t.split("\n").map((l) => l.replace(MARK, "").replace(/[\s|‖]+$/u, "").trim()).filter(Boolean).join("\n");
  return t.replace(/https?:\/\/\S+/g, "").replace(/[ \t]{2,}/g, " ").replace(/\n{2,}/g, "\n").trim();
}

/* ---------- Headline + description ---------- */
export function headline(t) {
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  let title = lines[0], body = lines.slice(1).join("\n");
  if (title.length > 150) {
    // a long opening paragraph: its first sentence (or clause) is the headline, the rest is the description
    const m = title.match(/^(.{20,150}?[.!؟?…]["”»]?)(\s+|$)/) || title.match(/^(.{30,130}?)[،:]\s/);
    if (m) { body = [title.slice(m[0].length).trim(), body].filter(Boolean).join("\n"); title = m[1]; }
    else { body = [title, body].filter(Boolean).join("\n"); title = clip(title, 110); }
  }
  title = title.replace(/[\s\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}️‍!]+$/u, (m) => (m.includes("!") ? "!" : "")).replace(/[.:،\s]+$/u, "").trim();
  // a headline wrapped in quotes loses them; a quote opened inside it gets closed
  const quotes = (title.match(/"/g) || []).length;
  if (/^["“«]/.test(title) && /["”»]$/.test(title) && quotes <= 2) title = title.slice(1, -1).trim();
  else if (quotes % 2) title += '"';
  return { title, body: body.trim() };
}

/* ---------- Decide: keep as news, or reject with a reason ---------- */
// the channel's own contests and activities (news *about* a festival or an anime event is still news)
const EVENT_RE = / (شاركونا|شاركوا معنا|اكتبوا|علقوا|خمنوا|خمن|جاوبوا|اجيبوا|صوتوا|في التعليقات|خانه التعليقات|بالتعليقات|سحب على|السحب على|مسابقتنا|فعاليتنا|فعاليه القناه|فعاليات القناه|فقره اليوم|من انا|الاجابه تكون|الجواب الصحيح) /;
const SELF_PROMO = / (قناتنا|انضموا|انضم الينا|اشتركوا|اشترك الان|تابعونا|تابعوا قناه|للاعلان|اعلان ممول|ممول|برعايه|كود خصم|رابط المجموعه|كروب|كروبنا) /;
const CHAT_RE = / (رايكم|رايك|برايك|شنو رايكم|شو رايكم|ما هو الافضل|اي لعبه|من الافضل|منو الافضل|ليله سعيده|صباح الخير|مساء الخير) /;
export function judge(post, b, cfg, seen) {
  if (post.forwardedFrom) return { ok: false, why: `محوّل من «${post.forwardedFrom}»` };
  if (post.poll) return { ok: false, why: "استفتاء" };
  const text = cleanBranchText(post.text);
  const n = " " + norm(text) + " ";
  if (!text) return { ok: false, why: "بلا نص" };
  const c = classify({ ...post, text, forwardedFrom: null, linkPreview: false }, { minFactLength: 250, minNewsLength: 150, minEventLength: 60 });
  const ad = c.reasons.find((r) => /إعلان استثمار|ترويج لبوت|رابط بوت|عدد مشتركين|رابط قناة أخرى|تعريف بقناة/.test(r));
  if (ad) return { ok: false, why: `إعلان: ${ad}` };
  if (SELF_PROMO.test(n)) return { ok: false, why: "إعلان أو ترويج للقناة" };
  const ev = c.reasons.find((r) => /سؤال مسابقة|سؤال فعالية|فقرة تفاعلية|ختام فعالية|استفتاء/.test(r))
    || (c.reasons.includes("إعلان فعالية أو نتائجها") && / (فعاليه|مسابقه|سحب) /.test(n) ? "إعلان فعالية أو نتائجها" : null);
  if (ev || EVENT_RE.test(n)) return { ok: false, why: `فعالية أو مسابقة${ev ? `: ${ev}` : ""}` };
  if (c.dia > .2) return { ok: false, why: "شعر أو نص أدبي" };
  if (text.length < (cfg.minChars || 160)) return { ok: false, why: `قصير (${text.length} حرفاً)`, text };
  const h = headline(text);
  if (!h || h.title.length < 12) return { ok: false, why: "بلا عنوان واضح", text };
  if (h.body.length < (cfg.minBody || 70)) return { ok: false, why: `سطر واحد بلا وصف (${h.body.length} حرفاً بعد العنوان)`, text };
  if (CHAT_RE.test(n) && text.length < 260) return { ok: false, why: "دردشة أو سؤال للمتابعين" };
  const sig = norm(text).slice(0, 140);
  if (seen.has(sig)) return { ok: false, why: `مكرر (${seen.get(sig)})` };
  seen.set(sig, `${b.short} #${post.id}`);
  return { ok: true, text, ...h };
}

/* ---------- Images: saved locally, because Telegram's CDN links expire within days ---------- */
const liveImages = new Set();
async function localImage(url, name) {
  if (!url) return null;
  const file = path.join(P.img, name);
  if (!existsSync(file) && !(await download(url, file))) return null;   // expired link: no image rather than a broken one
  liveImages.add(name);
  return `assets/tg/br/${name}`;
}

/* ---------- Output helpers ---------- */
const paragraphs = (t) => t.split("\n").map((p) => p.trim()).filter(Boolean).map((p) => `<p>${esc(p)}</p>`).join("\n");
const hashtags = (t) => [...new Set((t.match(/#[\p{L}\p{N}_]+/gu) || []).map((h) => h.slice(1).replace(/_/g, " ")))].slice(0, 6);

async function main() {
  const all = JSON.parse(await fs.readFile(P.config, "utf8"));
  const cfg = all.branches || { list: [] };
  const only = opt("--only"); const report = opt("--report", flag("--report") ? "*" : null);
  await fs.mkdir(P.stores, { recursive: true }); await fs.mkdir(P.posts, { recursive: true }); await fs.mkdir(P.img, { recursive: true });

  // the info channel's texts: a branch repost of an info post is a duplicate, not news
  const seen = new Map();
  if (existsSync(P.infoStore)) for (const p of Object.values(JSON.parse(await fs.readFile(P.infoStore, "utf8")).posts)) {
    const s = norm(cleanBranchText(p.text)).slice(0, 140); if (s.length > 60) seen.set(s, `المعلومات #${p.id}`);
  }

  const branches = []; const posts = [];
  for (const b of cfg.list) {
    const file = path.join(P.stores, `${b.key}.json`);
    const store = existsSync(file) ? JSON.parse(await fs.readFile(file, "utf8")) : { channel: b.channel, posts: {} };
    const skipNet = flag("--reclassify") || (only && only !== b.key);
    if (!skipNet) {
      const pages = +opt("--pages", Object.keys(store.posts).length ? cfg.updatePages : cfg.firstRunPages);
      let before = null, got = 0, fresh = 0;
      for (let p = 0; p < pages; p++) {
        let html; try { html = await fetchPage(b.channel, before); } catch (e) { console.log(`  ⚠ ${b.short}: ${e.message}`); break; }
        const list = parsePage(html, b.channel); if (!list.length) break;
        for (const x of list) { if (!store.posts[x.id]) fresh++; store.posts[x.id] = { ...store.posts[x.id], ...x, firstSeen: store.posts[x.id]?.firstSeen || new Date().toISOString() }; got++; }
        before = Math.min(...list.map((x) => x.id));
        process.stdout.write(`\r${b.short}: صفحة ${p + 1}/${pages} · ${got} منشور · جديد ${fresh}   `);
        if (before <= 1) break; await sleep(900);
      }
      process.stdout.write("\n");
    }
    // keep the newest maxPosts, judge oldest first so the original of a repost wins
    const kept = Object.values(store.posts).sort((a, x) => x.id - a.id).slice(0, cfg.maxPosts);
    store.posts = Object.fromEntries(kept.map((p) => [p.id, p]));
    const counts = {}; let shown = 0; const rows = [];
    for (const p of [...kept].sort((a, x) => a.id - x.id)) {
      const r = judge(p, b, cfg, seen);
      const why = r.ok ? "مقبول" : r.why.split(":")[0].replace(/\s*\(.*$/, "");
      counts[why] = (counts[why] || 0) + 1;
      if (report === "*" || report === b.key) rows.push(`${p.id}\t${r.ok ? "✓" : "✗"} ${r.ok ? "" : r.why}\t${clip((r.ok ? r.title : cleanBranchText(p.text) || "").replace(/\n/g, " "), 90)}`);
      if (!r.ok) continue;
      shown++;
      const id = `${b.key}-${p.id}`;
      const images = (await Promise.all((p.photos || []).slice(0, 4).map((u, i) => localImage(u, `${id}-${i + 1}.jpg`)))).filter(Boolean);
      const thumb = p.video ? await localImage(p.video.thumb, `${id}-v.jpg`) : null;
      const detail = {
        id, msg: p.id, branch: b.key, channel: b.channel, type: "news", cat: b.key, date: p.date, title: r.title, html: paragraphs(r.body),
        images, video: p.video ? { thumb, duration: p.video.duration } : null, poll: null,
        views: p.views, reactions: p.reactions, forwardedFrom: null, links: (p.links || []).filter((l) => !/t\.me\//.test(l.href)).slice(0, 5),
        url: `https://t.me/${b.channel}/${p.id}`, sources: []
      };
      const out = `window.TG_POST=${JSON.stringify(detail)};\n`;
      const target = path.join(P.posts, `${id}.js`);
      if (!existsSync(target) || (await fs.readFile(target, "utf8")) !== out) await fs.writeFile(target, out);
      posts.push({ id, b: b.key, msg: p.id, date: (p.date || "").slice(0, 10), ts: p.date || "", title: r.title, excerpt: clip(r.body.replace(/\n+/g, " "), 190),
        image: images[0] || thumb || null, images: images.length, media: p.video ? "video" : images.length > 1 ? "album" : images.length ? "photo" : "text",
        video: p.video ? { duration: p.video.duration } : null, views: p.views || 0, len: r.text.length, tags: hashtags(p.text || "") });
    }
    await fs.writeFile(file, JSON.stringify(store));
    branches.push({ key: b.key, channel: b.channel, name: b.name, short: b.short, icon: b.icon, c1: b.c1, c2: b.c2, desc: b.desc, count: shown, url: `https://t.me/${b.channel}` });
    console.log(`✔ ${b.name}: ${shown} خبر معروض من ${kept.length} · ${Object.entries(counts).sort((a, x) => x[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(" · ")}`);
    if (rows.length) console.log(rows.reverse().join("\n"));
  }

  // remove detail files of posts that are no longer shown (only branch files: "<key>-<id>.js")
  const keys = new Set(cfg.list.map((b) => b.key)); const live = new Set(posts.map((p) => `${p.id}.js`));
  for (const f of await fs.readdir(P.posts)) { const k = f.split("-")[0]; if (keys.has(k) && !live.has(f)) await fs.rm(path.join(P.posts, f)); }
  for (const f of await fs.readdir(P.img)) if (!liveImages.has(f)) await fs.rm(path.join(P.img, f));

  posts.sort((a, x) => x.ts.localeCompare(a.ts));
  posts.forEach((p) => delete p.ts);
  const data = { updated: new Date().toISOString(), branches, posts };
  await fs.writeFile(P.index, `/* مولّد تلقائياً بواسطة scripts/branches-sync.mjs — لا تعدّله يدوياً */\nwindow.BR=${JSON.stringify(data)};\n`);
  console.log(`✔ المجموع: ${posts.length} خبراً في ${branches.length} فروع`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error("✖ فشلت مزامنة الفروع:", e.message); process.exit(1); });
