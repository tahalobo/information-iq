#!/usr/bin/env node
/* ==========================================================
   محرّك التوثيق: يبحث في الويب عن مصادر إضافية لكل معلومة من القناة
   ----------------------------------------------------------
   لكل منشور من نوع «معلومة» أو «خبر»:
     1) يستخرج مفاتيح المنشور: العنوان، أندر الكلمات (مقارنةً ببقية القناة)،
        الأرقام والسنوات، والأسماء اللاتينية.
     2) يبحث بها في: ويكيبيديا العربية ثم مقابلها الإنجليزي، ومحرك بحث ويب
        (غوغل إن وُجد مفتاحه، وإلا DuckDuckGo ثم Bing بلا مفاتيح).
     3) يفتح كل صفحة مرشّحة ويقرؤها فعلاً، ولا يقبلها إلا إذا وجد فيها
        مفاتيح المنشور وأرقامه. نتيجة البحث وحدها لا تكفي.
     4) يحفظ أفضل المصادر (واحد لكل موقع) مع اقتباس قصير ونسبة تطابق.

   الاستخدام:
     node scripts/enrich-sources.mjs               أحدث 25 منشوراً لم يُفحص
     node scripts/enrich-sources.mjs --limit 100   عدد آخر
     node scripts/enrich-sources.mjs --id 14511    منشور بعينه (مع شرح مفصّل)
     node scripts/enrich-sources.mjs --force       إعادة فحص ما فُحص
     node scripts/enrich-sources.mjs --stats       إحصائية فقط

   مفاتيح اختيارية (متغيرات بيئة):
     GOOGLE_API_KEY + GOOGLE_CX   بحث غوغل الرسمي (Custom Search JSON API)
     SERPER_API_KEY               نتائج غوغل عبر serper.dev
     BRAVE_API_KEY                Brave Search API
   ========================================================== */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { norm, cleanText, makeTitle } from "./telegram-classify.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const P = {
  config: path.join(ROOT, "scripts/telegram.config.json"),
  store: path.join(ROOT, "scripts/telegram-store.json"),
  sources: path.join(ROOT, "scripts/sources-store.json")
};
const args = process.argv.slice(2);
const flag = (f) => args.includes(f);
const opt = (f, d) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : d; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VERBOSE = flag("--verbose") || args.includes("--id");
const log = (...a) => VERBOSE && console.log(...a);

const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";
const BOT_UA = "IQInfoEmpireSources/1.0 (+https://www.instagram.com/information_1q/)";

const DEFAULTS = {
  enabled: true, perRun: 25, maxPerPost: 5, minScore: 0.5, retryDays: 14, types: ["fact", "news"],
  block: [], trusted: []
};

/* ---------- Domain knowledge ---------- */
// never cite: social networks, video, shops, forums, AI answers, and our own pages
const BLOCK = ["t.me", "telegram.me", "telegram.org", "facebook.com", "fb.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "youtube.com", "youtu.be",
  "pinterest.com", "linkedin.com", "reddit.com", "quora.com", "threads.net", "snapchat.com", "whatsapp.com", "vk.com", "amazon.", "ebay.", "aliexpress.", "noon.com",
  "scribd.com", "slideshare.net", "brainly.", "answers.com", "chatgpt.com", "openai.com", "duckduckgo.com", "bing.com", "google.", "translate.goog", "webcache."];
const KINDS = [
  ["encyclopedia", /(^|\.)(wikipedia\.org|britannica\.com|marefa\.org|worldhistory\.org|newworldencyclopedia\.org|encyclopedia\.com|iranicaonline\.org|plato\.stanford\.edu|arab-ency\.com\.sy)$/],
  ["science", /(^|\.)(nature\.com|science\.org|sciencedirect\.com|nih\.gov|nasa\.gov|esa\.int|noaa\.gov|usgs\.gov|cern\.ch|pnas\.org|thelancet\.com|bmj\.com|cell\.com|springer\.com|wiley\.com|jstor\.org|scientificamerican\.com|newscientist\.com|livescience\.com|space\.com|phys\.org|sciencedaily\.com|smithsonianmag\.com|nationalgeographic\.com|ngalarabiya\.com|mayoclinic\.org|webmd\.com|healthline\.com|si\.edu|ibelieveinsci\.com|nasainarabic\.net|syr-res\.com)$|\.edu(\.[a-z]{2})?$|\.ac\.[a-z]{2}$/],
  ["official", /(^|\.)(unesco\.org|who\.int|un\.org|europa\.eu|worldbank\.org|britishmuseum\.org|metmuseum\.org|louvre\.fr|loc\.gov|nobelprize\.org|guinnessworldrecords\.com)$|\.gov(\.[a-z]{2})?$|\.gouv\.[a-z]{2}$/],
  ["news", /(^|\.)(bbc\.com|bbc\.co\.uk|aljazeera\.net|aljazeera\.com|reuters\.com|apnews\.com|dw\.com|france24\.com|skynewsarabia\.com|cnn\.com|alarabiya\.net|independentarabia\.com|aawsat\.com|theguardian\.com|nytimes\.com|washingtonpost\.com|history\.com|rt\.com|alhurra\.com|ina\.iq|shafaq\.com|rudaw\.net|alsumaria\.tv|almadapaper\.net|alquds\.co\.uk|alaraby\.co\.uk|annahar\.com|youm7\.com|ahram\.org\.eg|okaz\.com\.sa|albayan\.ae)$/]
];
const KIND_BOOST = { encyclopedia: 0.12, science: 0.1, official: 0.1, news: 0.06, web: 0 };
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^(www|m|mobile|amp)\./, "").toLowerCase(); } catch { return ""; } };
const kindOf = (host, extra = []) => { for (const [k, re] of KINDS) if (re.test(host)) return k; return extra.some((d) => host === d || host.endsWith("." + d)) ? "news" : "web"; };
const blocked = (host, extra) => !host || /^\d+\.\d+\.\d+\.\d+$|^localhost$|^\[/.test(host) || [...BLOCK, ...extra].some((b) => b.endsWith(".") ? host.includes(b) : host === b || host.endsWith("." + b));
// one source per site: en.wikipedia.org and ar.wikipedia.org stay distinct, sub.site.com folds into site.com
const siteKey = (host) => /wikipedia\.org$/.test(host) ? host : host.split(".").slice(/\.(co|com|org|net|gov|edu|ac)\.[a-z]{2}$/.test(host) ? -3 : -2).join(".");

/* ---------- Text features ---------- */
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
const digits = (s) => String(s).replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d)).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
const stem = (w) => w.replace(/^(وال|بال|كال|فال|ولل|لل|ال)(?=.{3,})/, "").replace(/^[وفبلك](?=.{4,})/, "");
const STOP = new Set(("هذا هذه ذلك تلك الذي التي الذين اللذين حيث كان كانت يكون تكون كانوا ليس ليست قد لقد عند عندما بعد قبل بين خلال منذ حتى على الى إلى عن من في مع او أو ثم لكن بل اذ إذ اذا إذا ان أن إن كما مما ما لا لم لن هو هي هم هن نحن انه أنه انها أنها كل بعض غير اي أي ايضا أيضا جدا فقط اكثر أكثر اقل أقل مثل نحو حول ضد دون عبر لدى لها له لهم فيه فيها عليه عليها منه منها به بها الان اليوم يمكن يعد تعد يعتبر تعتبر كانت تم وقد وكان وهو وهي ولا وما ولم التى الذى هناك هنا ذات نفس عام سنة سنه عاما وفي ومن وعلى كشف كشفت نشر نشرت نشرها عرف عرفت عرفوا برز برزت عاش عاشت عاشوا ظهر ظهرت بدأ بدأت اصبح أصبح اصبحت أصبحت جعل جعلت وجد وجدت قام قامت قال قالت ذكر ذكرت اشار أشار اشارت أشارت اكد أكد اكدت أكدت يعود تعود يرجع ترجع يعرف تعرف يسمى تسمى يطلق اطلق أطلق يقع تقع يبلغ تبلغ استخدم استخدمت يستخدم تستخدم ساهم ساهمت اسهم أسهم اسهمت أسهمت تمكن تمكنت استطاع استطاعت حسب بحسب وفقا وفق نتيجة بسبب بفضل رغم بينما لذلك لهذا ولهذا واحد واحدة اول أول اولى أولى اخر آخر اخرى أخرى عدة عديد العديد كثير الكثير معظم جميع مختلف مختلفة كبير كبيرة صغير صغيرة جديد جديدة قديم قديمة اشهر أشهر ابرز أبرز اهم أهم اقدم أقدم اكبر أكبر مرة مره فترة مدة خاصة عامة تقريبا حوالي نحو قرابة يزال تزال مازال لايزال دراسة علمية العلماء الباحثون الباحثين مجلة")
  .split(/\s+/).map((w) => stem(norm(w))));
const tokens = (text) => norm(digits(text)).split(" ").map(stem).filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !/^[a-z]+$/.test(w) && !STOP.has(w));
const numbersOf = (text) => [...new Set((digits(text).replace(/(\d)[,٬](?=\d{3})/g, "$1").match(/\d+(?:\.\d+)?/g) || []).filter((n) => n.replace(".", "").length >= 2))];
const latinOf = (text) => [...new Set((text.match(/[A-Za-z][A-Za-z'’-]{3,}(?: [A-Z][A-Za-z'’-]{2,}){0,3}/g) || []).filter((w) => !/^https?$|^www$/i.test(w)))].slice(0, 6);
const sha = (s) => crypto.createHash("sha1").update(s).digest("hex").slice(0, 12);
const clip = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);

/* What makes this post findable: its rarest words (IDF over the whole channel), numbers, Latin names */
function features(text, title, df, N, entityWords = new Set()) {
  const idf = (w) => Math.log((N + 1) / ((df.get(w) || 0) + 1));
  const toks = tokens(text);
  const tf = new Map(); toks.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
  const titleSet = new Set(tokens(title));
  const ranked = [...tf.keys()].map((w) => ({ w, s: idf(w) * (1 + Math.log(tf.get(w))) * (titleSet.has(w) ? 1.5 : 1) * (entityWords.has(w) ? 1.7 : 1) })).sort((a, b) => b.s - a.s);
  const keys = ranked.slice(0, 22);
  // surface forms (as written) of the best keywords, in reading order, for search queries
  const top = new Set(ranked.slice(0, 7).map((k) => k.w));
  const surface = []; const seen = new Set();
  for (const raw of cleanText(text).replace(/[ً-ْٰـ]/g, "").split(/[^\p{L}\p{N}]+/u)) {
    const s = stem(norm(raw)); if (top.has(s) && !seen.has(s)) { seen.add(s); surface.push(raw); }
  }
  return { keys, total: keys.reduce((a, k) => a + k.s, 0), numbers: numbersOf(text).slice(0, 12), latin: latinOf(text), surface };
}

/* How well does a page support the post?  →  { score 0..1, kw, num, quote } */
function evidence(feat, pageText, lang, anchors = [], pageTitle = "") {
  const n = " " + norm(digits(pageText)).replace(/(\d) (?=\d{3}\b)/g, "$1") + " ";
  const raw = digits(pageText).replace(/(\d)[,٬.](?=\d{3}\b)/g, "$1").toLowerCase();
  const numHits = feat.numbers.filter((x) => new RegExp(`(^|[^\\d.])${x.replace(".", "\\.")}([^\\d]|$)`).test(raw));
  const num = feat.numbers.length ? numHits.length / feat.numbers.length : 0;
  const latHits = feat.latin.filter((l) => raw.includes(l.toLowerCase()));
  const lat = feat.latin.length ? latHits.length / feat.latin.length : 0;
  if (lang === "ar") {
    const cover = (hay) => feat.keys.reduce((a, k) => a + (hay.includes(k.w) ? k.s : 0), 0) / (feat.total || 1);
    const found = feat.keys.filter((k) => n.includes(k.w));
    const all = cover(n);
    // a long page mentions many words by chance; a real source has one passage that tells the same fact
    let win = 0; for (let i = 0; i < n.length; i += 900) { win = Math.max(win, cover(n.slice(i, i + 2600))); if (i + 2600 >= n.length) break; }
    // the subject itself (the post's most distinctive words) must be there, ideally in the page's headline
    const core = feat.keys.slice(0, 5); const coreHit = core.filter((k) => n.includes(k.w)).length / (core.length || 1);
    const tn = " " + norm(digits(pageTitle)) + " "; const inTitle = Math.min(3, feat.keys.slice(0, 8).filter((k) => tn.includes(k.w)).length);
    let score = win * 0.62 + all * 0.2 + inTitle * 0.04 + (feat.numbers.length ? num * 0.1 : win * 0.1) + (feat.latin.length ? lat * 0.06 : 0);
    if (coreHit < 0.6) score *= 0.6;
    if (win < 0.48) score = Math.min(score, 0.44);
    return { score: Math.min(1, score), kw: all, win, num, found: found.length };
  }
  // foreign-language page: we cannot compare words, so demand the subject's name plus matching figures or names
  const has = (hay, a) => a.toLowerCase().split(/\s+/).filter((w) => w.length > 2).every((w) => hay.includes(w));
  const anchorOk = anchors.length && anchors.every((a) => has(raw, a));
  if (!anchorOk) return { score: 0, kw: 0, num, found: 0 };
  const facts = feat.numbers.length + feat.latin.length ? (numHits.length + latHits.length * 1.5) / (feat.numbers.length + feat.latin.length * 1.5) : 0;
  const headline = anchors.every((a) => has(pageTitle.toLowerCase(), a)); // the page is about the subject itself
  return { score: Math.min(1, (headline ? 0.42 : 0.3) + facts * 0.55), kw: 0, num, found: numHits.length + latHits.length, headline };
}

/* The sentence of the page that best matches the post (shown as a short quote, never the whole text) */
function bestQuote(feat, pageText) {
  let best = null;
  for (const s of pageText.split(/(?<=[.!؟?])\s+|\n+/)) {
    const t = s.replace(/\s+/g, " ").trim(); if (t.length < 50 || t.length > 420 || /[|©]|\bcookie/i.test(t)) continue;
    const n = norm(digits(t));
    const sc = feat.keys.reduce((a, k) => a + (n.includes(k.w) ? k.s : 0), 0) / Math.sqrt(t.length / 80 + 1);
    if (!best || sc > best.sc) best = { sc, t };
  }
  return best && best.sc > 0 ? clip(best.t, 210) : "";
}

/* ---------- HTTP ---------- */
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", ndash: "–", mdash: "—", hellip: "…", rlm: "", lrm: "", zwnj: "" };
const decode = (s) => String(s).replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => { try { return e[0] === "#" ? String.fromCodePoint(/^#x/i.test(e) ? parseInt(e.slice(2), 16) : +e.slice(1)) : ENT[e] ?? m; } catch { return m; } });
const untag = (s) => decode(String(s).replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();

async function get(url, { ua = BROWSER_UA, timeout = 12000, max = 900_000, headers = {}, method = "GET", body } = {}) {
  const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeout);
  try {
    const r = await fetch(url, { method, body, signal: ctl.signal, redirect: "follow", headers: { "User-Agent": ua, "Accept-Language": "ar,en;q=0.8", Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.5", ...headers } });
    if (!r.ok) return { ok: false, status: r.status };
    const type = r.headers.get("content-type") || "";
    if (!/html|json|xml|text\/plain/.test(type)) return { ok: false, status: 415 };
    const chunks = []; let size = 0;
    for await (const c of r.body) { chunks.push(c); size += c.length; if (size > max) { ctl.abort(); break; } }
    const buf = Buffer.concat(chunks);
    let cs = (type.match(/charset=([\w-]+)/i) || [])[1] || (buf.subarray(0, 2048).toString("latin1").match(/<meta[^>]+charset=["']?([\w-]+)/i) || [])[1] || "utf-8";
    let text; try { text = new TextDecoder(cs).decode(buf); } catch { text = buf.toString("utf8"); }
    return { ok: true, status: r.status, text, url: r.url, type };
  } catch (e) { return { ok: false, status: 0, error: e.name }; } finally { clearTimeout(timer); }
}
const getJson = async (url, o) => { const r = await get(url, o); if (!r.ok) return null; try { return JSON.parse(r.text); } catch { return null; } };

/* Readable text + metadata of an HTML page */
function readPage(html) {
  const meta = (re) => { const m = html.match(re); return m ? untag(m[1]) : ""; };
  const title = meta(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || meta(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const site = meta(/<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)/i);
  const desc = meta(/<meta[^>]+(?:name=["']description["']|property=["']og:description["'])[^>]+content=["']([^"']+)/i);
  const lang = ((html.match(/<html[^>]+lang=["']?([a-zA-Z-]+)/i) || [])[1] || "").slice(0, 2).toLowerCase();
  let body = html.replace(/<(script|style|noscript|svg|nav|header|footer|aside|form|iframe|template)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--[\s\S]*?-->/g, " ");
  const main = body.match(/<article\b[\s\S]*<\/article>/i) || body.match(/<main\b[\s\S]*<\/main>/i);
  if (main && main[0].length > 1500) body = main[0];
  const text = decode(body.replace(/<\/(p|div|li|h[1-6]|tr|section|blockquote)>|<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t\r\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
  return { title, site, desc, lang, text };
}
const arabicShare = (t) => { const s = t.slice(0, 6000); const l = (s.match(/\p{L}/gu) || []).length; return l ? (s.match(/[ء-ي]/g) || []).length / l : 0; };
const cleanTitle = (t, site) => {
  let x = t.replace(/\s+/g, " ").trim();
  const parts = x.split(/\s+[|–—\-•·:]\s+/);
  if (parts.length > 1) { const longest = [...parts].sort((a, b) => b.length - a.length)[0]; if (longest.length >= 12) x = longest; }
  return clip(x || site || "", 110);
};

/* ---------- Search providers: each returns [{ url, title, snippet }] ---------- */
const providers = {
  async google(q, lang) {
    const u = `https://www.googleapis.com/customsearch/v1?key=${process.env.GOOGLE_API_KEY}&cx=${process.env.GOOGLE_CX}&num=10&q=${encodeURIComponent(q)}${lang === "ar" ? "&lr=lang_ar" : ""}`;
    const j = await getJson(u, { ua: BOT_UA }); if (!j) return null;
    return (j.items || []).map((i) => ({ url: i.link, title: i.title, snippet: i.snippet || "" }));
  },
  async serper(q, lang) {
    const r = await get("https://google.serper.dev/search", { method: "POST", ua: BOT_UA, headers: { "X-API-KEY": process.env.SERPER_API_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ q, num: 10, hl: lang === "ar" ? "ar" : "en" }) });
    if (!r.ok) return null; let j; try { j = JSON.parse(r.text); } catch { return null; }
    return (j.organic || []).map((i) => ({ url: i.link, title: i.title, snippet: i.snippet || "" }));
  },
  async brave(q, lang) {
    const j = await getJson(`https://api.search.brave.com/res/v1/web/search?count=10&q=${encodeURIComponent(q)}${lang === "ar" ? "&search_lang=ar" : ""}`, { ua: BOT_UA, headers: { "X-Subscription-Token": process.env.BRAVE_API_KEY, Accept: "application/json" } });
    if (!j) return null;
    return ((j.web && j.web.results) || []).map((i) => ({ url: i.url, title: untag(i.title), snippet: untag(i.description || "") }));
  },
  async duckduckgo(q, lang) {
    const r = await get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}&kl=${lang === "ar" ? "xa-ar" : "us-en"}`);
    if (!r.ok || !/result__a/.test(r.text)) return null;
    const out = [];
    for (const b of r.text.split(/<div class="result results_links/).slice(1)) {
      const a = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/); if (!a) continue;
      let url = decode(a[1]); const m = url.match(/[?&]uddg=([^&]+)/); if (m) url = decodeURIComponent(m[1]); if (url.startsWith("//")) url = "https:" + url;
      if (/duckduckgo\.com\/y\.js/.test(url)) continue; // ad
      out.push({ url, title: untag(a[2]), snippet: untag((b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/a>/) || [])[1] || "") });
    }
    return out;
  },
  async bravehtml(q) {
    const r = await get(`https://search.brave.com/search?q=${encodeURIComponent(q)}&source=web`);
    if (!r.ok || !/data-type="web"/.test(r.text)) return null;
    const out = [];
    for (const b of r.text.split(/data-type="web"/).slice(1)) {
      const a = b.match(/<a href="(https?:\/\/[^"]+)"/); if (!a) continue;
      out.push({ url: decode(a[1]), title: untag((b.match(/class="title[^"]*"[^>]*>([\s\S]*?)<\/div>/) || [])[1] || ""), snippet: "" });
    }
    return out;
  }
};
const chain = [process.env.GOOGLE_API_KEY && process.env.GOOGLE_CX && "google", process.env.SERPER_API_KEY && "serper", process.env.BRAVE_API_KEY && "brave", "duckduckgo", "bravehtml"].filter(Boolean);
const dead = new Map(); // provider → consecutive failures; a provider that keeps failing (quota, block) is skipped for this run
async function webSearch(q, lang) {
  for (const name of chain) {
    if ((dead.get(name) || 0) >= 2) continue;
    const res = await providers[name](q, lang).catch(() => null);
    await sleep(/duckduckgo|bravehtml/.test(name) ? 2200 : 250);
    if (res && res.length) { dead.set(name, 0); log(`    ${name}: ${res.length} نتيجة ← ${q}`); return { name, res }; }
    if (res === null) dead.set(name, (dead.get(name) || 0) + 1);
    log(`    ${name}: ${res === null ? "لم يستجب (حظر مؤقت أو انتهاء الحصة)" : "لا نتائج"} ← ${q}`);
  }
  return { name: null, res: [] };
}

/* ---------- Wikipedia (free API, no key): Arabic article, then its English twin ---------- */
const wikiApi = (lang, params) => getJson(`https://${lang}.wikipedia.org/w/api.php?format=json&formatversion=2&${new URLSearchParams(params)}`, { ua: BOT_UA });
async function wikiSearch(lang, q, limit = 4) {
  const j = await wikiApi(lang, { action: "query", list: "search", srsearch: q, srlimit: limit, srnamespace: 0 });
  return ((j && j.query && j.query.search) || []).map((s) => s.title);
}
async function wikiPage(lang, title) {
  const j = await wikiApi(lang, { action: "query", prop: "extracts|langlinks|info", explaintext: 1, exlimit: 1, lllang: lang === "ar" ? "en" : "ar", lllimit: 1, inprop: "url", redirects: 1, titles: title });
  const p = j && j.query && j.query.pages && j.query.pages[0];
  if (!p || p.missing || !p.extract) return null;
  return { title: p.title, url: p.fullurl, text: p.extract, other: p.langlinks && p.langlinks[0] ? p.langlinks[0].title : null };
}
/* Which phrases of the post are subjects with their own Wikipedia article?
   Every 1–4 word phrase is checked against article titles and redirects, 50 per request. */
const EDGE = new Set("في من على الى إلى عن مع او أو ثم بل لكن ان أن إن ما لا لم لن قد هو هي هم كان كانت حتى منذ بين عند بعد قبل كل اي أي ذلك هذا هذه التي الذي الذين حيث اذ إذ كما و ف".split(" ").map(norm));
async function wikiEntities(text, df, N) {
  const plain = cleanText(text).replace(/[ً-ْٰـ]/g, "");
  const segs = plain.split(/[.،؛:!؟?()«»"\[\]\n\-–—\/]+/).map((x) => x.trim().split(/\s+/).filter(Boolean)).filter((x) => x.length);
  const cand = new Map(); let pos = 0;
  const add = (phrase, n, at) => { if (!cand.has(phrase)) cand.set(phrase, { n, at }); };
  for (const seg of segs) {
    for (let i = 0; i < seg.length && pos + i < 110; i++) for (let n = 4; n >= 1; n--) {
      const g = seg.slice(i, i + n); if (g.length < n) continue;
      if (EDGE.has(norm(g[0])) || EDGE.has(norm(g[n - 1])) || g.some((w) => /^\d+$/.test(digits(w)))) continue;
      if (n === 1) { const st = stem(norm(g[0])); if (st.length < 4 || STOP.has(st) || (df.get(st) || 0) / N > 0.03) continue; }
      const p = g.join(" "); add(p, n, pos + i);
      const bare = p.replace(/^و(?=\S{3,})/, ""); if (bare !== p) add(bare, n, pos + i); // «وبغداد» ← «بغداد»
      if (/^لل/.test(p)) add("ال" + p.slice(2), n, pos + i);
    }
    pos += seg.length;
  }
  const phrases = [...cand.keys()]; const hits = new Map();
  for (let i = 0; i < phrases.length; i += 50) {
    const batch = phrases.slice(i, i + 50);
    const j = await wikiApi("ar", { action: "query", titles: batch.join("|"), redirects: 1, prop: "pageprops|info", ppprop: "disambiguation" }); await sleep(120);
    if (!j || !j.query) continue;
    const fwd = new Map(); for (const m of [...(j.query.normalized || []), ...(j.query.redirects || [])]) fwd.set(m.from, m.to);
    const pages = new Map((j.query.pages || []).map((p) => [p.title, p]));
    for (const ph of batch) {
      let t = ph; for (let k = 0; k < 3 && fwd.has(t); k++) t = fwd.get(t);
      const pg = pages.get(t); if (!pg || pg.missing || pg.invalid || (pg.pageprops && "disambiguation" in pg.pageprops) || (pg.length || 0) < 1500) continue;
      const c = cand.get(ph); const prev = hits.get(t);
      if (!prev || c.n > prev.n) hits.set(t, { title: t, phrase: ph, n: c.n, at: c.at });
    }
  }
  // a longer phrase is a more specific subject; then whatever comes first in the post
  const rare = (e) => Math.min(...tokens(e.phrase).map((w) => df.get(w) || 0), N) / N;
  const weight = (e) => (e.n > 1 ? 1.5 : 0) + (e.at < 12 ? 2 : e.at < 30 ? 1 : 0) + (rare(e) < 0.004 ? 1.5 : rare(e) < 0.015 ? 0.7 : 0);
  return [...hits.values()].map((e) => ({ ...e, w: weight(e) })).sort((a, b) => b.w - a.w || a.at - b.at);
}

async function wikipedia(feat, title, entities, cfg) {
  const out = []; const tried = new Set();
  const consider = async (t, via, lead = false) => {
    if (tried.has(t)) return; tried.add(t);
    const pg = await wikiPage("ar", t); await sleep(120); if (!pg) return;
    const ev = evidence(feat, pg.text, "ar", [], pg.title);
    // the subject named in the post's own headline beats a broader article that happens to share its words
    if (lead && ev.win >= 0.4) ev.score = Math.min(1, ev.score + 0.1);
    log(`    ويكيبيديا ar «${t}» (${via}${lead ? "، في العنوان" : ""}) ← ${(ev.score * 100).toFixed(0)}% · مقطع ${(ev.win * 100).toFixed(0)}% · كامل ${(ev.kw * 100).toFixed(0)}%`);
    out.push({ url: pg.url, name: pg.title, site: "ويكيبيديا العربية", lang: "ar", ev, quote: bestQuote(feat, pg.text), other: pg.other });
  };
  for (const e of entities.slice(0, 9)) await consider(e.title, "موضوع في النص", e.at < 10 && e.w >= 3.5);
  // the headline as a search phrase: finds the subject when its spelling differs from the article title («أدا» / «آدا»)
  const headWords = new Set(tokens(title));
  for (const t of await wikiSearch("ar", title.replace(/…$/, ""), 2)) { const tw = tokens(t); await consider(t, "بحث بالعنوان", tw.length > 0 && tw.every((w) => headWords.has(w))); }
  if (!out.some((o) => o.ev.score >= cfg.minScore)) {
    for (const q of [...new Set([feat.surface.slice(0, 3).join(" "), title.replace(/…$/, "")])].filter(Boolean)) {
      for (const t of await wikiSearch("ar", q, 3)) await consider(t, "بحث");
      if (out.some((o) => o.ev.score >= cfg.minScore)) break;
    }
  }
  out.sort((a, b) => b.ev.score - a.ev.score);
  const best = out[0] && out[0].ev.score >= cfg.minScore ? out[0] : null;
  let enAnchor = null;
  // the English twin of the verified Arabic article inherits its trust
  if (best && best.other) {
    const pg = await wikiPage("en", best.other); await sleep(120);
    if (pg) {
      enAnchor = pg.title.replace(/\s*\(.*?\)\s*/g, "");
      const ev = { score: best.ev.score * 0.94, num: 0 };
      log(`    ويكيبيديا en «${pg.title}» ← المقابل الإنجليزي لـ«${best.name}»`);
      out.push({ url: pg.url, name: pg.title, site: "Wikipedia", lang: "en", ev, quote: clip(pg.text.split(/\n/)[0], 210) });
    }
  }
  // a distinctive Latin name written in the post (e.g. Thermopolium) that is itself an article title
  const lat = feat.latin.find((l) => l.length >= 8);
  if (lat && !(enAnchor && enAnchor.toLowerCase() === lat.toLowerCase())) {
    const pg = await wikiPage("en", lat); await sleep(120);
    if (pg && pg.title.toLowerCase() === lat.toLowerCase()) {
      log(`    ويكيبيديا en «${pg.title}» ← اسم لاتيني ورد في المنشور`);
      out.push({ url: pg.url, name: pg.title, site: "Wikipedia", lang: "en", ev: { score: Math.max(0.6, best ? best.ev.score * 0.9 : 0), num: 0 }, quote: clip(pg.text.split(/\n/)[0], 210) });
      if (!enAnchor) enAnchor = pg.title;
    }
  }
  return { cands: out, enAnchor, best };
}

/* ---------- Verify one web result by actually reading the page ---------- */
async function verify(r, feat, cfg, anchors) {
  const host = hostOf(r.url);
  if (!/^https?:\/\//.test(r.url) || blocked(host, cfg.block) || /\.(pdf|docx?|pptx?|xlsx?|zip|jpg|png|mp4)(\?|$)/i.test(r.url)) return null;
  const pg = await get(r.url, { headers: { Referer: "https://www.google.com/" } });
  if (!pg.ok || !/html/.test(pg.type)) { log(`      ✗ ${host} (تعذّر الفتح ${pg.status || pg.error || ""})`); return null; }
  const page = readPage(pg.text);
  if (page.text.length < 400) { log(`      ✗ ${host} (صفحة فارغة أو محمية)`); return null; }
  const lang = arabicShare(page.text) > 0.35 ? "ar" : (page.lang && page.lang !== "ar" ? page.lang : "en");
  const ev = evidence(feat, page.text, lang, anchors, page.title);
  log(`      ${ev.score >= cfg.minScore ? "✓" : "·"} ${host} ← ${(ev.score * 100).toFixed(0)}% (${lang}${ev.win != null ? ` · مقطع ${(ev.win * 100).toFixed(0)}% · كامل ${(ev.kw * 100).toFixed(0)}%` : ""})`);
  return { url: pg.url && hostOf(pg.url) === host ? pg.url.split("#")[0] : r.url, name: cleanTitle(page.title || r.title, page.site || host), site: page.site || "", lang, ev,
    quote: lang === "ar" ? bestQuote(feat, page.text) : clip(page.desc || r.snippet || "", 210) };
}
async function pool(list, n, fn) {
  const out = []; let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => { while (i < list.length) { const k = i++; out[k] = await fn(list[k]).catch(() => null); } }));
  return out.filter(Boolean);
}

/* ---------- One post ---------- */
async function enrich(post, text, title, df, N, cfg) {
  const entities = await wikiEntities(text, df, N);
  const entityWords = new Set(entities.filter((e) => e.n > 1 || e.at < 25).flatMap((e) => tokens(e.phrase)));
  const feat = features(text, title, df, N, entityWords);
  log(`  مواضيع: ${entities.slice(0, 8).map((e) => e.title).join(" · ") || "—"}`);
  log(`  مفاتيح: ${feat.surface.join(" · ")}${feat.latin.length ? ` | لاتيني: ${feat.latin.join(", ")}` : ""}${feat.numbers.length ? ` | أرقام: ${feat.numbers.join(", ")}` : ""}`);
  const queries = [];
  const wiki = await wikipedia(feat, title, entities, cfg);
  let cands = [...wiki.cands];
  // the subjects that this post is really about: those whose article passed, else the most specific ones
  const subjects = [...new Set([wiki.best && wiki.best.name.replace(/\s*\(.*?\)/g, ""), ...entities.filter((e) => e.n > 1).map((e) => e.phrase)].filter(Boolean))].slice(0, 2);

  const seenUrl = new Set(cands.map((c) => c.url));
  const run = async (q, lang, anchors) => {
    if (!q.trim()) return; queries.push(q);
    const { res } = await webSearch(q, lang);
    const fresh = res.filter((r) => r.url && !seenUrl.has(r.url) && !/wikipedia\.org/.test(r.url) && (seenUrl.add(r.url), true)).slice(0, 8);
    cands.push(...await pool(fresh, 4, (r) => verify(r, feat, cfg, anchors)));
  };
  const good = () => new Set(cands.filter((c) => c.ev.score >= cfg.minScore).map((c) => siteKey(hostOf(c.url)))).size;

  // 1) the post's own headline, plus a Latin name if it has one
  await run(`${title.replace(/…$/, "")} ${feat.latin[0] || ""}`.trim(), "ar");
  // 2) its rarest words: catches pages that tell the same fact under another headline
  if (good() < cfg.maxPerPost) {
    const extra = feat.surface.filter((w) => !subjects.some((sj) => sj.includes(w))).slice(0, subjects.length ? 2 : 5);
    await run([...subjects, ...extra, feat.numbers.find((n) => /^(1[0-9]|20)\d\d$/.test(n)) || ""].join(" ").trim(), "ar");
  }
  // 3) the wider world: search in English by the subject's English name
  const en = wiki.enAnchor;
  if (en && good() < cfg.maxPerPost) await run([en, ...feat.latin.filter((l) => l !== en).slice(0, 1)].join(" "), "en", [en]);

  // rank: evidence first, known-reliable sites get a nudge; one source per site
  const picked = []; const sites = new Set();
  for (const c of cands.map((c) => { const host = hostOf(c.url); const kind = kindOf(host, cfg.trusted); return { ...c, host, kind, rank: c.ev.score + KIND_BOOST[kind] }; })
    .filter((c) => c.ev.score >= cfg.minScore).sort((a, b) => b.rank - a.rank)) {
    const k = siteKey(c.host); if (sites.has(k)) continue; sites.add(k);
    picked.push({ url: c.url, name: c.name, site: c.site || c.host, host: c.host, lang: c.lang, kind: c.kind, match: Math.round(c.ev.score * 100), quote: c.quote || "" });
    if (picked.length >= cfg.maxPerPost) break;
  }
  return { sources: picked, queries, seen: cands.length };
}

/* ---------- Main ---------- */
async function main() {
  const cfgAll = JSON.parse(await fs.readFile(P.config, "utf8"));
  const cfg = { ...DEFAULTS, ...(cfgAll.sources || {}) };
  const tg = JSON.parse(await fs.readFile(P.store, "utf8"));
  const store = existsSync(P.sources) ? JSON.parse(await fs.readFile(P.sources, "utf8")) : { posts: {} };
  const all = Object.values(tg.posts).filter((p) => p.cls && cfg.types.includes(p.cls.type) && !p.cls.group).sort((a, b) => b.id - a.id);

  if (flag("--stats")) return stats(store, all);
  if (!cfg.enabled && !flag("--force") && !opt("--id")) { console.log("البحث عن المصادر معطّل في telegram.config.json"); return; }

  // document frequency of every word across the channel → which words are distinctive for a post
  const df = new Map(); const docs = Object.values(tg.posts);
  for (const p of docs) for (const w of new Set(tokens(p.text || ""))) df.set(w, (df.get(w) || 0) + 1);

  const only = opt("--id"); const limit = +opt("--limit", cfg.perRun); const now = Date.now();
  const due = all.filter((p) => {
    if (only) return String(p.id) === String(only);
    const s = store.posts[p.id]; if (!s || flag("--force")) return true;
    if (s.hash !== sha(cleanText(p.text || ""))) return true;                          // the post was edited
    return !s.sources.length && now - Date.parse(s.checked) > cfg.retryDays * 864e5;     // nothing found last time: try again later
  }).slice(0, only ? 1 : limit);

  console.log(`محرّك التوثيق · محركات البحث: ويكيبيديا + ${chain.join(" ← ")} · ${due.length} منشوراً للفحص`);
  let found = 0, withSrc = 0, done = 0;
  for (const p of due) {
    const text = cleanText(p.text || ""); const title = makeTitle(text) || text.slice(0, 60);
    console.log(`#${p.id} ${clip(title, 70)}`);
    let r;
    try { r = await enrich(p, text, title, df, docs.length, cfg); }
    catch (e) { console.log(`  ✖ ${e.message}`); continue; }
    store.posts[p.id] = { hash: sha(text), checked: new Date().toISOString(), queries: r.queries, sources: r.sources };
    found += r.sources.length; if (r.sources.length) withSrc++; done++;
    console.log(r.sources.length ? r.sources.map((s) => `  ✓ ${String(s.match).padStart(3)}% ${s.host} — ${clip(s.name, 60)}`).join("\n") : `  — لا مصدر مطابق (فُحصت ${r.seen} صفحة)`);
    if (done % 5 === 0) await save(store);
  }
  // forget posts that left the channel archive
  const alive = new Set(Object.keys(tg.posts)); for (const id of Object.keys(store.posts)) if (!alive.has(id)) delete store.posts[id];
  await save(store);
  console.log(`✔ فُحص ${done} منشوراً · ${withSrc} وُجدت لها مصادر · ${found} مصدراً جديداً`);
  stats(store, all);

  // rewrite the site's data files so the pages show the new sources
  if (!flag("--no-build") && done) {
    const r = spawnSync(process.execPath, [path.join(HERE, "telegram-sync.mjs"), "--reclassify"], { stdio: "inherit" });
    if (r.status) process.exitCode = r.status;
  }
}
async function save(store) { store.updated = new Date().toISOString(); await fs.writeFile(P.sources, JSON.stringify(store, null, 1)); }
function stats(store, all) {
  const checked = all.filter((p) => store.posts[p.id]); const have = checked.filter((p) => store.posts[p.id].sources.length);
  const total = have.reduce((a, p) => a + store.posts[p.id].sources.length, 0);
  const kinds = {}; have.forEach((p) => store.posts[p.id].sources.forEach((s) => (kinds[s.kind] = (kinds[s.kind] || 0) + 1)));
  console.log(`  الأرشيف: ${all.length} معلومة · فُحص ${checked.length} · لها مصادر إضافية ${have.length} · مجموع المصادر ${total}${total ? ` (${Object.entries(kinds).map(([k, v]) => `${k}: ${v}`).join("، ")})` : ""} · بانتظار الفحص ${all.length - checked.length}`);
}

main().catch((e) => { console.error("✖ فشل البحث عن المصادر:", e.message); process.exit(1); });
