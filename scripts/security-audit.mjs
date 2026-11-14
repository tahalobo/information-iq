#!/usr/bin/env node
/* ==========================================================
   مدقّق الأمان: يفحص الموقع كله آلياً ويوقف النشر عند أي تراجع أمني.
   يعمل بلا إنترنت وبلا مكتبات. يستدعيه GitHub Action بعد بناء الصفحات.

   ماذا يفحص:
     1) كل صفحة HTML (الرئيسية والمولَّدة): فيها سياسة أمن المحتوى (CSP) الصحيحة قبل أي سكربت،
        لا سكربت خارجي، لا سكربت مضمّن غير معتمد، لا معالجات أحداث مضمّنة (onclick=…)، لا روابط javascript:،
        وكل target="_blank" معه rel="noopener"، وبيانات JSON-LD لا تستطيع إغلاق وسمها.
     2) ملفات JavaScript: لا eval ولا document.write، لا معالجات مضمّنة داخل القوالب، ولا قيمة خطرة
        (معامل رابط، اسم ملف، قيمة حقل…) تدخل HTML بلا esc().
     3) بيانات تليغرام المولَّدة: نص كل منشور لا يحوي إلا وسوماً مسموحة وروابط http/https.
     4) المكتبات المحلية (assets/js/vendor): بصماتها تطابق scripts/vendor-integrity.json.
     5) الأسرار: لا توكن ولا مفتاح بنمط معروف في أي ملف متتبَّع، و .gitignore يغطي الملفات الحساسة.
     6) GitHub Actions: صلاحيات بأقل امتياز، actions مثبّتة بالـ SHA، لا حقن ${{ … }} داخل run.
     7) عامل الخدمة والعامل السحابي وخادم التطوير: الضوابط الأساسية في مكانها.
     8) اختبارات scripts/security-tests.mjs.

   الاستخدام:
     node scripts/security-audit.mjs            فحص كامل (يخرج بكود 1 عند أي خطأ)
     node scripts/security-audit.mjs --update   تحديث بصمات المكتبات بعد ترقية مكتبة عمداً
   ========================================================== */
import { readFileSync, readdirSync, existsSync, writeFileSync, statSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { cspFor, sha256, THEME_BOOT_HASH } from "./seo/csp.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (...p) => path.join(ROOT, ...p);
const read = (p) => readFileSync(rel(p), "utf8");
const UPDATE = process.argv.includes("--update");

const errors = [], warnings = [], stats = {};
const MAX_SHOWN = 12, seen = {};
const err = (group, msg) => { seen[group] = (seen[group] || 0) + 1; if (seen[group] <= MAX_SHOWN) errors.push(`[${group}] ${msg}`); else if (seen[group] === MAX_SHOWN + 1) errors.push(`[${group}] … وأخطاء أخرى من النوع نفسه`); };
const warn = (msg) => warnings.push(msg);
const line = (text, i) => text.slice(0, i).split("\n").length;

/* ---------- إعدادات الموقع (لحساب السياسة المتوقعة لكل صفحة) ---------- */
const W = { window: {} }; W.window.window = W.window;
vm.runInNewContext(read("assets/js/config.js"), { window: W.window, Date });
const SITE = W.window.SITE || {};

/* ==========================================================
   1) صفحات HTML
   ========================================================== */
const htmlFiles = [
  ...readdirSync(ROOT).filter((f) => f.endsWith(".html")),
  ...["post", "topic", "archive"].flatMap((d) => (existsSync(rel(d)) ? readdirSync(rel(d)).filter((f) => f.endsWith(".html")).map((f) => `${d}/${f}`) : []))
];
const cspKey = (f) => (f.startsWith("post/") ? "post" : f.includes("/") ? "hub" : f);
const expected = new Map();
const INLINE_OK_TYPES = /^(application\/ld\+json|application\/json)$/i;
const OK_STYLE_HOSTS = new Set(["fonts.googleapis.com"]);

for (const f of htmlFiles) {
  const h = read(f);
  const key = cspKey(f);
  if (!expected.has(key)) expected.set(key, cspFor(key, SITE));

  /* CSP موجودة، صحيحة، وقبل أي سكربت أو رابط */
  const metas = [...h.matchAll(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]*)"\s*\/?>/gi)];
  if (metas.length !== 1) err("csp", `${f}: ${metas.length ? "أكثر من وسم CSP" : "لا يوجد وسم Content-Security-Policy"}`);
  else {
    const policy = metas[0][1], at = metas[0].index;
    if (policy !== expected.get(key)) err("csp", `${f}: سياسة CSP لا تطابق scripts/seo/csp.mjs (أعد تشغيل build-pages)`);
    const firstActive = h.search(/<script\b|<link\b[^>]*\brel="?stylesheet|<style\b|<img\b|<iframe\b/i);
    if (firstActive >= 0 && firstActive < at) err("csp", `${f}: وسم CSP يأتي بعد سكربت أو ملف أنماط (يجب أن يسبق كل شيء)`);
    const scriptSrc = (policy.match(/(?:^|;\s*)script-src ([^;]*)/) || [])[1] || "";
    if (/'unsafe-inline'|'unsafe-eval'|\*|https?:(?:\s|$)|\bdata:/.test(scriptSrc)) err("csp", `${f}: script-src فيه مصدر خطر (${scriptSrc})`);
    for (const need of ["default-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action "]) if (!policy.includes(need)) err("csp", `${f}: السياسة ينقصها ${need}`);
  }
  if (!/<meta name="referrer" content="(same-origin|no-referrer|strict-origin)">/.test(h)) err("csp", `${f}: لا يوجد <meta name="referrer">`);

  /* السكربتات */
  for (const m of h.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1], code = m[2];
    const src = (attrs.match(/\bsrc\s*=\s*["']?([^"'\s>]+)/i) || [])[1];
    const type = (attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i) || [])[1] || "";
    if (src) {
      if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) err("external-script", `${f}: سكربت خارجي ${src} (انقله إلى assets/js/vendor)`);
      else if (!existsSync(rel(src.split(/[?#]/)[0]))) err("external-script", `${f}: سكربت غير موجود ${src}`);
    } else if (INLINE_OK_TYPES.test(type)) {
      if (code.includes("<")) err("json-block", `${f}: بيانات ${type} فيها الرمز < بلا تهريب (يمكن أن تغلق الوسم)`);
      try { JSON.parse(code); } catch { err("json-block", `${f}: بيانات ${type} ليست JSON صالحاً`); }
    } else if (sha256(code) !== THEME_BOOT_HASH) {
      err("inline-script", `${f}:${line(h, m.index)}: سكربت مضمّن غير معتمد (انقله إلى ملف في assets/js)`);
    }
  }
  /* ملفات الأنماط الخارجية */
  for (const m of h.matchAll(/<link\b[^>]*\brel\s*=\s*["']?stylesheet[^>]*>/gi)) {
    const href = (m[0].match(/\bhref\s*=\s*["']([^"']+)/i) || [])[1] || "";
    if (/^(?:https?:)?\/\//i.test(href)) { let host = ""; try { host = new URL(href, "https://x").hostname; } catch { /* ignore */ } if (!OK_STYLE_HOSTS.has(host)) err("external-style", `${f}: ملف أنماط خارجي ${href}`); }
  }
  /* معالجات الأحداث المضمّنة */
  for (const m of h.matchAll(/<[a-z][^<>]*?\s(on[a-z]+)\s*=\s*["'][^>]*>/gi)) err("inline-handler", `${f}:${line(h, m.index)}: معالج مضمّن ${m[1]}= (استعمل addEventListener أو data-err)`);
  /* روابط خطرة */
  for (const m of h.matchAll(/\b(href|src|action|formaction|poster|data)\s*=\s*["']\s*(javascript:|vbscript:|data:text\/html)/gi)) err("bad-url", `${f}:${line(h, m.index)}: رابط بمخطط خطر ${m[2]}`);
  /* target=_blank بلا noopener */
  for (const m of h.matchAll(/<(a|area|form)\b[^>]*\btarget\s*=\s*["']?_blank[^>]*>/gi)) if (!/\brel\s*=\s*["'][^"']*\bnoopener\b/i.test(m[0])) err("noopener", `${f}:${line(h, m.index)}: target="_blank" بلا rel="noopener"`);
  /* وسوم لا مكان لها في الموقع */
  for (const m of h.matchAll(/<(object|embed|applet|iframe|frame)\b/gi)) err("tag", `${f}:${line(h, m.index)}: وسم <${m[1]}> غير متوقع`);
  if ((h.match(/<base\b/gi) || []).length > 1) err("tag", `${f}: أكثر من وسم <base>`);
}
stats.pages = htmlFiles.length;

/* ==========================================================
   2) ملفات JavaScript (واجهة الموقع + قوالب البناء)
   ========================================================== */
const jsDir = (d) => (existsSync(rel(d)) ? readdirSync(rel(d)).filter((f) => /\.(m?js)$/.test(f)).map((f) => `${d}/${f}`) : []);
const DATA_FILES = new Set(["assets/js/telegram-data.js", "assets/js/branches-data.js", "assets/js/static-index.js", "assets/js/quiz-data.js", "assets/js/image-index.js", "assets/js/pw-data.js"]);
const clientJs = [...jsDir("assets/js"), ...jsDir("assets/js/pages"), "sw.js"].filter((f) => !DATA_FILES.has(f));
const buildJs = [...jsDir("scripts"), ...jsDir("scripts/seo"), ...jsDir("worker")].filter((f) => !/security-(audit|tests)\.mjs$/.test(f));

/* قيمة لا يتحكم بها الموقع: لا تدخل HTML إلا عبر esc() (أو رقماً، أو مرمَّزة للرابط) */
const RISKY = /\b(param\(|location\.(href|search|hash|pathname)|document\.(referrer|cookie|URL)|\.searchParams|URLSearchParams|(?:file|f|it|x)\.name\b|\.value\b|\.dataset\.|\.textContent\b|\.innerText\b|localStorage|sessionStorage|e\.data\b|\.responseText|await\s+\w+\.(text|json)\(\))/;
const SAFE_WRAP = /^\s*(?:esc|App\.esc|encodeURIComponent|encodeURI|fmtNum|fmtCompact|fmtK|fmtBytes|fmtDate|Number|parseInt|parseFloat|Math\.\w+|String\(\s*\+|ic|icons|href|safeHref|\+|!|\()/;
const HTML_SINK = /\.(innerHTML|outerHTML)\s*[+]?=|insertAdjacentHTML\s*\(|\bmodal\s*\(|document\.write/;

for (const f of [...clientJs, ...buildJs]) {
  const s = read(f), client = clientJs.includes(f);
  if (/\beval\s*\(|\bnew\s+Function\s*\(|document\.write(ln)?\s*\(|\bsetTimeout\s*\(\s*["'`]|\bsetInterval\s*\(\s*["'`]/.test(s)) err("js-eval", `${f}: استعمال eval / new Function / document.write / setTimeout بنص`);
  for (const m of s.matchAll(/[\s"'`](on(?:error|click|load|mouseover|mouseenter|focus|change|input|submit|toggle|animationend))\s*=\s*\\?["']/g)) {
    const ln = s.split("\n")[line(s, m.index) - 1] || "";
    if (/<[a-z]/i.test(ln)) err("inline-handler", `${f}:${line(s, m.index)}: معالج مضمّن ${m[1]}= داخل قالب HTML`);
  }
  for (const m of s.matchAll(/target=\\?["']_blank\\?["'](?![^<>\n]{0,200}?rel=\\?["'][^"'\n]*noopener)/g)) {
    const before = s.slice(Math.max(0, m.index - 220), m.index);
    if (!/rel=\\?["'][^"'\n]*noopener[^<>]*$/.test(before)) err("noopener", `${f}:${line(s, m.index)}: target="_blank" بلا rel="noopener"`);
  }
  if (/\bhref=\\?["']javascript:/i.test(s)) err("bad-url", `${f}: رابط javascript: في قالب`);
  if (client && /https?:\/\/(?:unpkg\.com|cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net)\/[^"'`\s]*\.js\b/.test(s) && f !== "assets/js/ai-worker.js") err("external-script", `${f}: تحميل سكربت من CDN (انقله إلى assets/js/vendor)`);
  if (!client) continue;

  /* قيم خطرة داخل قوالب HTML بلا تهريب: نفحص كل ${…} في سطر يبني HTML */
  const lines = s.split("\n");
  lines.forEach((ln, i) => {
    if (!/<[a-z!\/][^>]*>|<[a-z]+[\s>]/i.test(ln) && !HTML_SINK.test(ln)) return;
    for (const m of ln.matchAll(/\$\{((?:[^{}]|\{[^{}]*\})*)\}/g)) {
      const expr = m[1];
      if (!RISKY.test(expr) || SAFE_WRAP.test(expr)) continue;
      // قيمة خطرة ظهرت داخل تعبير شرطي لكنها لا تُطبع (مثل: ${x.value ? "a" : "b"}): مقبول إذا لم تُذكر بعد علامة ?
      // كل ذكر للقيمة الخطرة مغلّف بـ esc(…) أو encodeURIComponent(…)
      const stripped = expr.replace(/(?:esc|encodeURIComponent|fmtDate|fmtNum|fmtBytes|ltr|revealInvisibles)\((?:[^()]|\([^()]*\))*\)/g, "");
      if (!RISKY.test(stripped)) continue;
      const q = stripped.indexOf("?"); if (q > 0 && !RISKY.test(stripped.slice(q))) continue;
      err("unescaped", `${f}:${i + 1}: قيمة غير مهرَّبة داخل HTML: \${${expr.slice(0, 70)}}`);
    }
  });
}
stats.scripts = clientJs.length + buildJs.length;

/* ==========================================================
   3) بيانات تليغرام المولَّدة
   ========================================================== */
const ALLOWED_TAGS = new Set(["p", "br", "a", "strong", "h2", "ol", "li", "div", "span"]);
const ALLOWED_ATTR = { a: /^(href|target|rel|class)$/, ol: /^class$/, div: /^class$/, span: /^$/, p: /^$/, br: /^$/, strong: /^$/, h2: /^$/, li: /^$/ };
function checkBody(html, where) {
  for (const m of String(html || "").matchAll(/<\/?([a-zA-Z][\w-]*)((?:\s+[^<>]*)?)>/g)) {
    const tag = m[1].toLowerCase();
    if (!ALLOWED_TAGS.has(tag)) { err("post-html", `${where}: وسم غير مسموح <${tag}> في نص المنشور`); continue; }
    for (const a of m[2].matchAll(/([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'|([\w:-]+)(?=\s|$)/g)) {
      const name = (a[1] || a[3] || a[5]).toLowerCase(), value = a[2] ?? a[4] ?? "";
      if (!ALLOWED_ATTR[tag].test(name)) err("post-html", `${where}: خاصية غير مسموحة ${name}= على <${tag}>`);
      if (name === "href" && !/^https?:\/\//i.test(value.replace(/&amp;/g, "&"))) err("post-html", `${where}: رابط ليس http/https (${value.slice(0, 40)})`);
    }
  }
  const bare = String(html || "").replace(/<\/?[a-zA-Z][\w-]*(?:\s+[^<>]*)?>/g, "");
  if (/[<>]/.test(bare)) err("post-html", `${where}: رمز < أو > غير مهرَّب في نص المنشور`);
}
const safeImg = (u) => typeof u === "string" && /^assets\/tg\/(img|br)\/[\w.-]+$/.test(u);
let posts = 0;
if (existsSync(rel("assets/tg/posts"))) {
  for (const f of readdirSync(rel("assets/tg/posts"))) {
    if (!/^(\d+|[a-z]+-\d+)\.js$/.test(f)) { err("post-file", `assets/tg/posts/${f}: اسم ملف غير متوقع`); continue; }
    const s = read(`assets/tg/posts/${f}`);
    const m = s.match(/^window\.TG_POST=(\{[\s\S]*\});\s*$/);
    if (!m) { err("post-file", `assets/tg/posts/${f}: الملف ليس «window.TG_POST={…};» فقط`); continue; }
    let j; try { j = JSON.parse(m[1]); } catch { err("post-file", `assets/tg/posts/${f}: JSON غير صالح`); continue; }
    posts++;
    checkBody(j.html, `assets/tg/posts/${f}`);
    for (const u of j.images || []) if (!safeImg(u)) err("post-file", `assets/tg/posts/${f}: صورة ليست ملفاً محلياً (${String(u).slice(0, 50)})`);
    if (j.video && j.video.thumb && !safeImg(j.video.thumb)) err("post-file", `assets/tg/posts/${f}: صورة فيديو ليست محلية`);
    if (j.url && !/^https:\/\/t\.me\/[A-Za-z0-9_]+\/\d+$/.test(j.url)) err("post-file", `assets/tg/posts/${f}: رابط المنشور ليس على t.me`);
    for (const l of [...(j.links || []).map((x) => x.href), ...(j.sources || []).map((x) => x.url)]) if (!/^https?:\/\//i.test(String(l))) err("post-file", `assets/tg/posts/${f}: رابط ليس http/https`);
  }
}
stats.posts = posts;
/* ملفات البيانات: سطر تعليق اختياري ثم إسناد JSON واحد لا غير */
for (const [f, name] of [["assets/js/telegram-data.js", "TG"], ["assets/js/branches-data.js", "BR"], ["assets/js/static-index.js", null]]) {
  if (!existsSync(rel(f))) continue;
  const s = read(f).replace(/^\s*\/\*[\s\S]*?\*\/\s*/, "");
  const parts = s.split(/;\s*\n/).map((x) => x.trim()).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^window\.([A-Z_]+)=([\s\S]+?);?$/);
    if (!m || (name && m[1] !== name)) { err("data-file", `${f}: محتوى غير متوقع (يجب أن يكون إسناد بيانات فقط)`); break; }
    try { JSON.parse(m[2]); } catch { err("data-file", `${f}: قيمة ${m[1]} ليست JSON خالصاً`); }
  }
}

/* ==========================================================
   4) المكتبات المحلية: بصمات مثبّتة
   ========================================================== */
{
  const file = "scripts/vendor-integrity.json";
  const now = Object.fromEntries(readdirSync(rel("assets/js/vendor")).sort().map((f) => [f, "sha384-" + crypto.createHash("sha384").update(readFileSync(rel("assets/js/vendor", f))).digest("base64")]));
  if (UPDATE || !existsSync(rel(file))) { writeFileSync(rel(file), JSON.stringify(now, null, 2) + "\n"); console.log(`✎ كُتبت بصمات ${Object.keys(now).length} مكتبة في ${file}`); }
  const pinned = JSON.parse(read(file));
  for (const [f, h] of Object.entries(now)) if (!pinned[f]) err("vendor", `assets/js/vendor/${f}: مكتبة بلا بصمة مثبّتة (شغّل --update بعد التأكد من مصدرها)`); else if (pinned[f] !== h) err("vendor", `assets/js/vendor/${f}: المحتوى تغيّر عن البصمة المثبّتة`);
  for (const f of Object.keys(pinned)) if (!now[f]) err("vendor", `assets/js/vendor/${f}: مذكورة في البصمات لكنها غير موجودة`);
  stats.vendor = Object.keys(now).length;
}

/* ==========================================================
   5) الأسرار
   ========================================================== */
{
  const SECRET = [
    ["توكن بوت تليغرام", /\b\d{8,10}:AA[A-Za-z0-9_-]{32,}\b/],
    ["مفتاح Google API", /\bAIza[0-9A-Za-z_-]{35}\b/],
    ["توكن GitHub", /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
    ["مفتاح خاص", /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/],
    ["مفتاح AWS", /\bAKIA[0-9A-Z]{16}\b/],
    ["توكن Slack", /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/],
    ["مفتاح API (sk-)", /(?<![\w/+=-])sk-(?:ant-|proj-)?[A-Za-z0-9_-]{32,}\b/],
    ["توكن Cloudflare/Serper/Brave مكتوب في الكود", /\b(?:api[_-]?key|token|secret|password|passwd|authorization)\b["']?\s*[:=]\s*["'][A-Za-z0-9_\-/.+]{20,}["']/i]
  ];
  const git = spawnSync("git", ["ls-files", "-z"], { cwd: ROOT, encoding: "utf8", maxBuffer: 64e6 });
  const tracked = git.status === 0 ? git.stdout.split("\0").filter(Boolean) : [];
  if (!tracked.length) warn("تعذّر قراءة قائمة ملفات git: فحص الأسرار اقتصر على ملفات المشروع الأساسية");
  const list = (tracked.length ? tracked : [...clientJs, ...buildJs, ...htmlFiles.filter((f) => !f.includes("/"))])
    .filter((f) => !/\.(png|jpe?g|webp|gif|svg|ico|woff2?|ttf|mp4|zip|onnx|wasm)$/i.test(f) && !/^(post|topic|archive)\//.test(f) && !/^assets\/js\/vendor\//.test(f));
  let scanned = 0;
  for (const f of list) {
    if (!existsSync(rel(f)) || statSync(rel(f)).size > 30e6) continue;
    const s = read(f); scanned++;
    for (const [name, re] of SECRET) { const m = s.match(re); if (m) err("secret", `${f}:${line(s, m.index)}: يبدو أنه ${name}. احذفه ودوّره فوراً (لا تكتب الأسرار في المستودع)`); }
  }
  stats.secretFiles = scanned;
  for (const f of tracked) if (/(^|\/)(\.env(\..*)?|.*\.pem|.*\.p12|.*\.key|id_rsa|credentials\.json|settings\.local\.json)$/i.test(f) && !/\.env\.example$/.test(f)) err("secret", `${f}: ملف حساس متتبَّع في git`);
  const ignore = existsSync(rel(".gitignore")) ? read(".gitignore") : "";
  for (const need of ["node_modules/", ".claude/settings.local.json"]) if (!ignore.includes(need)) err("secret", `.gitignore لا يغطي ${need}`);
  for (const need of [".env", "*.pem", "*.key"]) if (!ignore.includes(need)) err("secret", `.gitignore لا يغطي ${need}`);
  const sc = JSON.parse(read("scripts/site.config.json"));
  for (const k of Object.keys(sc)) if (!["siteUrl", "indexNowKey"].includes(k) && !k.startsWith("_")) warn(`scripts/site.config.json: حقل غير متوقع «${k}» (هذا الملف علني، لا تضع فيه سراً)`);
  if (SITE.factCheckApiKey) warn("config.js: factCheckApiKey يظهر في المتصفح. تأكد أنه مقيَّد برابط موقعك (HTTP referrer) من لوحة Google Cloud.");
}

/* ==========================================================
   6) GitHub Actions
   ========================================================== */
for (const f of existsSync(rel(".github/workflows")) ? readdirSync(rel(".github/workflows")).filter((x) => /\.ya?ml$/.test(x)) : []) {
  const p = `.github/workflows/${f}`, y = read(p), ls = y.split("\n");
  if (!/^permissions:\s*(\{\}|read-all)\s*$/m.test(y)) err("workflow", `${p}: الصلاحيات العامة يجب أن تكون «permissions: {}» وتُمنح لكل مهمة على حدة`);
  if (/^on:[\s\S]*?\bpull_request_target\b/m.test(y)) err("workflow", `${p}: pull_request_target يشغّل كود الغرباء بصلاحيات المستودع`);
  ls.forEach((ln, i) => {
    const u = ln.match(/^\s*(?:-\s*)?uses:\s*([^\s#]+)/);
    if (u && !u[1].startsWith("./") && !/@[0-9a-f]{40}$/.test(u[1])) err("workflow", `${p}:${i + 1}: ${u[1]} غير مثبّت برقم commit كامل (SHA)`);
    if (/\bcurl\b[^|\n]*\|\s*(ba)?sh\b|\bwget\b[^|\n]*\|\s*(ba)?sh\b/.test(ln)) err("workflow", `${p}:${i + 1}: تنفيذ سكربت منزَّل مباشرة (curl | sh)`);
    if (/pip3? install|python3? -m pip install/.test(ln) && /install\s+(?:--?[\w-]+\s+)*"?[A-Za-z][\w.-]*"?\s*$/.test(ln) && !/==/.test(ln)) err("workflow", `${p}:${i + 1}: pip install بلا إصدار مثبّت`);
    if (/npm install\b/.test(ln) && !/--ignore-scripts/.test(ln)) err("workflow", `${p}:${i + 1}: npm install بلا --ignore-scripts`);
  });
  /* حقن: ${{ github.event… }} أو مدخلات داخل run */
  let inRun = false, indent = 0;
  ls.forEach((ln, i) => {
    const m = ln.match(/^(\s*)(?:-\s*)?run:\s*(.*)$/);
    if (m) { inRun = /^[|>]/.test(m[2].trim()) || m[2].trim() === ""; indent = m[1].length; if (/\$\{\{\s*(github\.(event|head_ref)|inputs)\b/.test(m[2])) err("workflow", `${p}:${i + 1}: \${{ … }} من مدخل خارجي داخل run (مرّره عبر env)`); return; }
    if (inRun) { if (ln.trim() && ln.match(/^\s*/)[0].length <= indent) inRun = false; else if (/\$\{\{\s*(github\.(event|head_ref)|inputs)\b/.test(ln)) err("workflow", `${p}:${i + 1}: \${{ … }} من مدخل خارجي داخل run (مرّره عبر env)`); }
  });
  if (/deploy-pages/.test(y) && !/rm -rf[^\n]*\bscripts\b[^\n]*\bworker\b[^\n]*\.claude\b/.test(y)) err("workflow", `${p}: خطوة النشر يجب أن تحذف scripts و worker و .claude قبل الرفع`);
  if (!/security-audit\.mjs/.test(y)) err("workflow", `${p}: مدقّق الأمان غير مربوط بالـ Action`);
}
if (!existsSync(rel(".github/dependabot.yml"))) warn(".github/dependabot.yml غير موجود: الـ actions المثبّتة بالـ SHA لن تُحدَّث تلقائياً");

/* ==========================================================
   7) عامل الخدمة، العامل السحابي، خادم التطوير
   ========================================================== */
{
  const sw = read("sw.js");
  if (!/const VERSION = "empire-v\d+"/.test(sw)) err("sw", "sw.js: لا يوجد VERSION");
  if (!/res\.type === "basic"/.test(sw)) err("sw", "sw.js: يجب ألا تُخزَّن إلا ردود موقعنا (type basic)");
  if (/hostname\)\s*\)|\.test\(url\.hostname\)/.test(sw) && !/CDN_HOSTS\.has\(url\.hostname\)/.test(sw)) err("sw", "sw.js: مطابقة نطاقات CDN يجب أن تكون بالاسم الكامل");
  if (!/e\.source/.test(sw)) err("sw", "sw.js: معالج الرسائل لا يتحقق من المرسل");

  if (existsSync(rel("worker/reverse-search.js"))) {
    const w = read("worker/reverse-search.js");
    if (/redirect:\s*"follow"/.test(w.replace(/fetch\(`\$\{YA\}[^\n]*/g, ""))) err("worker", "worker/reverse-search.js: جلب بـ redirect:\"follow\" لرابط يحدده الزائر (استعمل safeFetch)");
    for (const [need, why] of [["function isSafeUrl", "فحص SSRF"], ["async function limited", "حدّ الطلبات"], ["MAX_BODY", "حدّ حجم الطلب"], ["nosniff", "ترويسات الأمان"]]) if (!w.includes(need)) err("worker", `worker/reverse-search.js: ينقصه ${why} (${need})`);
    if (/!allowed\.length\s*\|\|/.test(w)) err("worker", "worker/reverse-search.js: العامل مفتوح لكل المواقع حين لا يُضبط ALLOWED_ORIGINS");
    if (/detail:\s*String\(/.test(w)) err("worker", "worker/reverse-search.js: نص الخطأ الداخلي يعود للزائر");
    const t = existsSync(rel("worker/wrangler.toml")) ? read("worker/wrangler.toml") : "";
    if (!/^ALLOWED_ORIGINS\s*=\s*"https:\/\//m.test(t)) err("worker", "worker/wrangler.toml: ALLOWED_ORIGINS غير مضبوط");
    if (!/listen\(PORT,\s*"127\.0\.0\.1"/.test(read("worker/dev-server.mjs"))) err("worker", "worker/dev-server.mjs: يجب أن يستمع على 127.0.0.1 فقط");
  }
  if (existsSync(rel(".claude/dev_server.py"))) {
    const d = read(".claude/dev_server.py");
    if (!/ThreadingHTTPServer\(\("127\.0\.0\.1"/.test(d)) err("dev-server", ".claude/dev_server.py: يجب أن يستمع على 127.0.0.1 فقط");
    if (/def do_PUT/.test(d) && !/re\.fullmatch\(r"\/assets\/img\/og\//.test(d)) err("dev-server", ".claude/dev_server.py: PUT يجب أن يُحصر في assets/img/og");
  }
  const gs = existsSync(rel("scripts/contact-form.gs")) ? read("scripts/contact-form.gs") : "";
  if (gs) {
    if (!/getScriptProperties\(\)/.test(gs) || /TELEGRAM_BOT_TOKEN\s*=\s*["']\d/.test(gs)) err("contact", "scripts/contact-form.gs: التوكن يجب أن يُقرأ من Script Properties فقط");
    for (const [need, why] of [["LockService", "قفل العدّاد"], ["MAX_BODY", "حدّ حجم الطلب"], ["typeof b.t !== \"number\"", "فخ الزمن"], ["SITE_PREFIXES", "تقييد رابط الصفحة"]]) if (!gs.includes(need)) err("contact", `scripts/contact-form.gs: ينقصه ${why}`);
  }
}

/* ==========================================================
   8) اختبارات الأمان
   ========================================================== */
{
  const r = spawnSync(process.execPath, [rel("scripts/security-tests.mjs")], { cwd: ROOT, encoding: "utf8" });
  const out = (r.stdout || "").trim().split("\n");
  stats.tests = (out[out.length - 1] || "").trim();
  if (r.status !== 0) { for (const l of out.filter((x) => x.startsWith("✖"))) err("tests", l); if (!out.some((x) => x.startsWith("✖"))) err("tests", `security-tests.mjs فشل: ${(r.stderr || "").trim().split("\n").slice(-2).join(" ")}`); }
}

/* ---------- التقرير ---------- */
console.log(`مدقّق الأمان: ${stats.pages} صفحة · ${stats.scripts} ملف سكربت · ${stats.posts} منشوراً · ${stats.vendor} مكتبة محلية · ${stats.secretFiles} ملفاً فُحص بحثاً عن أسرار · الاختبارات: ${stats.tests}`);
for (const w of warnings) console.log(`⚠ ${w}`);
if (errors.length) {
  console.log(`\n✖ ${Object.values(seen).reduce((a, b) => a + b, 0)} خطأ أمني:`);
  for (const e of errors) console.log("  " + e);
  process.exit(1);
}
console.log("✔ لا أخطاء أمنية");
