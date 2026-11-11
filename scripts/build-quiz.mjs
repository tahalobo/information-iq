#!/usr/bin/env node
/* ==========================================================
   مولّد أسئلة «اختبر معلوماتك» من قناة تليغرام
   1) أسئلة تلقائية من منشورات المعلومات: «أكمل الفراغ» و«صح أم خطأ».
      الجواب الصحيح مأخوذ من نص المنشور نفسه، فلا يمكن أن يكون خاطئاً.
   2) أسئلة فعاليات القناة (الاستفتاءات وجمل الصواب والخطأ):
      تليغرام لا يكشف الجواب الصحيح علناً، لذا تُجمع في scripts/quiz-answers.json
      وكل سؤال تكتب جوابه هناك يدخل الاختبار تلقائياً.
   الاستخدام: node scripts/build-quiz.mjs
   ========================================================== */
import fs from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cleanText, makeTitle, norm } from "./telegram-classify.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (...p) => path.join(ROOT, ...p);
const STORE = rel("scripts/telegram-store.json");
const ANSWERS = rel("scripts/quiz-answers.json");
const OUT = rel("assets/js/quiz-data.js");
const THIS_YEAR = new Date().getFullYear();

if (!existsSync(STORE)) { console.log("لا توجد بيانات تليغرام بعد. شغّل telegram-sync.mjs أولاً."); process.exit(0); }
const store = JSON.parse(readFileSync(STORE, "utf8"));
const posts = Object.values(store.posts).sort((a, b) => b.id - a.id);

/* Deterministic randomness so questions stay stable between runs */
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const shuffle = (arr, r) => { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const toLatin = (s) => s.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d));
const stripSig = (t) => t.split("\n").filter((l) => !(/@[A-Za-z0-9_]{4,}/.test(l) && (l.replace(/@\w+/g, "").match(/[ء-ي]/g) || []).length < 6)).join("\n");

/* ---------- 1) Auto questions from information posts ---------- */
function distractors(n, isYear, r) {
  const out = new Set();
  const deltas = isYear ? (n >= 1500 ? [3, 5, 8, 10, 15, 20, 30, 50] : n >= 500 ? [20, 50, 80, 100, 150, 200] : [50, 100, 150, 200, 300])
    : n <= 12 ? [1, 2, 3, 4] : null;
  let guard = 0;
  while (out.size < 3 && guard++ < 100) {
    let v;
    if (deltas) v = n + (r() < .5 ? -1 : 1) * deltas[Math.floor(r() * deltas.length)];
    else { const f = [.5, .6, .75, 1.25, 1.5, 2, 3][Math.floor(r() * 7)]; v = n * f; const mag = 10 ** Math.max(0, String(Math.round(n)).length - 2); v = Math.round(v / mag) * mag; }
    if (v <= 0 || v === n || (isYear && v > THIS_YEAR)) continue;
    out.add(v);
  }
  return [...out];
}

function autoQuestion(p) {
  const text = cleanText(stripSig(p.text || ""));
  // track which sentences open a paragraph: they usually carry their own subject
  const sentences = [];
  for (const para of text.split(/\n+/)) para.split(/(?<=[.!])\s+/).forEach((s, i) => { s = s.trim().replace(/^[-–•●*]+\s*/, ""); if (s) sentences.push({ s, first: i === 0 }); });
  const titleWords = norm(makeTitle(text)).split(" ").filter((w) => w.length >= 4);
  let best = null;
  // A good question sentence stands on its own: no leading connective/pointer, no ads, no dates with month names
  const BAD_START = /^(و\S|ف\S|هذا|هذه|ذلك|تلك|هنا|هناك|تخي|التصحيح|لكن|أما|اما|كما|ثم|بل|حيث|إذ|اذ|لذلك|لذا|ولهذا|بعد ذلك|أي|اي|مثل|منها|منه|فيها|بها|عليه)/;
  const BAD_ANY = /[؟?…|]|[A-Za-z]-?\d|\d-?[A-Za-z]|لكم|إليكم|اليكم|سنعرض|مهمتك|راتب|دخل إضافي|>|أمراً|امرا|مسابقة|لعب|بوت|صفحتنا|قناتنا|متابع|المسابقات|https?:|@|«|»|"|“|”|■|سعر|دينار|الف دينار|خصم|هدية|اشترك|كانون|شباط|آذار|نيسان|أيار|حزيران|تموز|آب|أيلول|تشرين|يناير|فبراير|مارس|أبريل|ابريل|مايو|يونيو|يوليو|أغسطس|سبتمبر|أكتوبر|نوفمبر|ديسمبر/;
  for (const { s, first } of sentences) {
    if (!first && !titleWords.some((w) => norm(s).includes(w))) continue; // needs context
    if (s.length < 45 || s.length > 230 || s.split(/\s+/).length < 7 || BAD_ANY.test(s) || BAD_START.test(s) || /^(هل|لماذا|كيف|إذا|اذا)\s/.test(s)) continue;
    const L = toLatin(s).replace(/٫/g, ".");
    if ((L.match(/\d+/g) || []).length !== 1 || /\d[.,]\d|\d%/.test(L)) continue; // exactly one plain number
    const nums = [...L.matchAll(/\d{1,4}/g)];
    if (nums.length !== 1 || nums[0].index < 4) continue; // skip list numbering like "2. ..."
    const raw = nums[0][0], n = +raw;
    const before = L.slice(Math.max(0, nums[0].index - 12), nums[0].index);
    const isYear = n >= 100 && n <= THIS_YEAR && /(عام|سنة|سنه|العام|في|منذ|حتى|بين)\s*$/.test(before);
    if (!isYear && (n < 2 || n > 5000)) continue;
    const score = (isYear ? 3 : 1) + (s.length > 70 && s.length < 170 ? 1 : 0);
    if (!best || score > best.score) best = { s, raw, n, isYear, idx: nums[0].index, score };
  }
  if (!best) return null;
  const r = rng(p.id);
  const latin = toLatin(best.s);
  const clean = (x) => x.replace(/^(و|ف)(?=(قد|كان|كانت|في|تم|بلغ|يبلغ|يعود|عاش|ولد|توفي)\b)/, "").replace(/^(كما|ثم|لكن|وقد|وكان)\s+/, "");
  const ctxTitle = p.cls && p.cls.title;
  const fmt = (v) => String(v);
  if (p.id % 3 === 0) {
    // True / false: show the real number or a changed one
    const truth = r() < .5;
    const shown = truth ? best.n : distractors(best.n, best.isYear, r)[0];
    if (shown == null) return null;
    const statement = clean(latin.slice(0, best.idx) + fmt(shown) + latin.slice(best.idx + best.raw.length));
    return { q: `صح أم خطأ؟ ${statement}`, a: ["صح", "خطأ"], c: truth ? 0 : 1, fact: `tg-${p.id}`, src: "auto", explain: truth ? "" : `الصحيح: ${best.n}` };
  }
  const opts = shuffle([best.n, ...distractors(best.n, best.isYear, r)], r);
  if (opts.length < 4) return null;
  const blanked = clean(latin.slice(0, best.idx) + "_____" + latin.slice(best.idx + best.raw.length));
  return { q: `أكمل الفراغ: ${blanked}`, a: opts.map(fmt), c: opts.indexOf(best.n), fact: `tg-${p.id}`, src: "auto" };
}

const auto = [];
for (const p of posts) {
  if (!p.cls || p.cls.type !== "fact") continue;
  const q = autoQuestion(p); if (q) auto.push(q);
}

/* ---------- 2) Questions from channel events ---------- */
const answers = existsSync(ANSWERS) ? JSON.parse(readFileSync(ANSWERS, "utf8")) : {};
const TF_RE = /(?:"|“)?\s*(?:ال)?[إا]جاب[ةه]\s+تكون\s+ب/;
let found = 0;
for (const p of posts) {
  if (!p.cls || p.cls.type !== "event") continue;
  let entry = null;
  if (p.poll && p.poll.options.length >= 2) {
    entry = { type: "poll", q: p.poll.q.trim(), options: p.poll.options.map((o) => o.replace(/^\s*[0-9٠-٩]+\s*[_\-.)]\s*/, "").trim()) };
  } else if (/صواب|خطأ|خطا/.test(p.text || "") && TF_RE.test(p.text || "")) {
    const statement = cleanText(stripSig(p.text)).split(TF_RE)[0].replace(/["“\s.]+$/, "").trim();
    if (statement.length > 15) entry = { type: "tf", q: statement };
  }
  if (!entry) continue;
  found++;
  const prev = answers[p.id] || {};
  answers[p.id] = { ...entry, answer: prev.answer ?? null, ...(prev.note ? { note: prev.note } : {}) };
}
const sortedAnswers = { "_تعليمات": "اكتب جواب كل سؤال في الحقل answer: للاستفتاء رقم الخيار الصحيح (1، 2، 3…)، ولصح أو خطأ اكتب \"صح\" أو \"خطأ\". الأسئلة التي تبقى null لا تظهر في الاختبار." };
for (const k of Object.keys(answers).filter((k) => /^\d+$/.test(k)).sort((a, b) => b - a)) sortedAnswers[k] = answers[k];
await fs.writeFile(ANSWERS, JSON.stringify(sortedAnswers, null, 2) + "\n");

const channel = [];
for (const [id, e] of Object.entries(sortedAnswers)) {
  if (!/^\d+$/.test(id) || e.answer == null || e.answer === "") continue;
  if (e.type === "poll") {
    const c = +e.answer - 1; if (!(c >= 0 && c < e.options.length)) continue;
    channel.push({ q: e.q, a: e.options, c, src: "channel", link: `https://t.me/${store.channel}/${id}` });
  } else {
    const t = String(e.answer).trim(); const c = /^(صح|صواب|true|1)$/i.test(t) ? 0 : /^(خطأ|خطا|false|0)$/i.test(t) ? 1 : -1;
    if (c < 0) continue;
    channel.push({ q: `صح أم خطأ؟ ${e.q}`, a: ["صح", "خطأ"], c, src: "channel", link: `https://t.me/${store.channel}/${id}` });
  }
}

await fs.writeFile(OUT, `/* مولّد تلقائياً بواسطة scripts/build-quiz.mjs */\nwindow.QUIZ_AUTO=${JSON.stringify(auto)};\nwindow.QUIZ_CHANNEL=${JSON.stringify(channel)};\n`);
const pending = Object.entries(sortedAnswers).filter(([k, e]) => /^\d+$/.test(k) && e.answer == null).length;
console.log(`✔ ${auto.length} سؤالاً تلقائياً من المعلومات · ${channel.length} سؤالاً من فعاليات القناة (${pending} بانتظار الجواب في scripts/quiz-answers.json)`);
