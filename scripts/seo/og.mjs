/* ==========================================================
   مولّد صور المعاينة (Open Graph) 1200×630 لكل خبر وأداة وموضوع وصفحة.
   الرسم بمتصفح Chrome بلا واجهة (puppeteer-core) حتى تُشكَّل العربية وتتصل حروفها كما في الموقع تماماً.
   - تزايدي: اسم الملف يحمل بصمة محتوى البطاقة؛ الموجود لا يُعاد رسمه، وتغيّر العنوان يعطي اسماً جديداً (يكسر كاش المنصات).
   - JPEG أقل من 300 ك.ب (حد واتساب العملي).
   يحتاج: puppeteer-core (npm i --no-save puppeteer-core) ومتصفح Chrome/Chromium/Edge على الجهاز. إن غاب أحدهما يُكمل البناء بلا صور جديدة.
   ========================================================== */
import { existsSync, statSync, writeFileSync, unlinkSync, mkdirSync, readdirSync } from "node:fs";
// unlink لا rm: ‏fs.rm لا يحذف الملف في المسارات العربية على ويندوز (Node 24) ولا يرمي خطأ
const rmSync = (p) => { try { unlinkSync(p); } catch { /* غير موجود */ } };
import { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const OG_W = 1200, OG_H = 630, OG_MAX_BYTES = 300 * 1024;
export const TEMPLATE_VERSION = 3; // ارفعه عند تغيير التصميم ليُعاد رسم كل الصور

function findChrome() {
  const list = [process.env.CHROME_PATH, process.env.PUPPETEER_EXECUTABLE_PATH,
    "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium-browser", "/usr/bin/chromium",
    "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
  return list.find((p) => p && existsSync(p)) || null;
}
function loadPuppeteer(root) {
  for (const base of [root, path.join(root, "ad-video"), path.join(root, "scripts")]) {
    try { return createRequire(path.join(base, "package.json"))("puppeteer-core"); } catch { /* next */ }
    try { return createRequire(path.join(base, "package.json"))("puppeteer"); } catch { /* next */ }
  }
  return null;
}

const template = (root) => {
  const u = (p) => pathToFileURL(path.join(root, p)).href;
  const lucide = existsSync(path.join(root, "assets/js/vendor/lucide-0.460.0.min.js")) ? `<script src="${u("assets/js/vendor/lucide-0.460.0.min.js")}"></script>` : "";
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<style>
@font-face { font-family: "Kufi"; src: url("${u("scripts/fonts/ReemKufi.ttf")}"); font-weight: 400 700; }
@font-face { font-family: "Mega"; src: url("${u("scripts/fonts/Lalezar-Regular.ttf")}"); }
@font-face { font-family: "Body"; src: url("${u("scripts/fonts/Cairo.ttf")}"); font-weight: 200 1000; }
* { box-sizing: border-box; margin: 0; padding: 0; }
html, body { width: ${OG_W}px; height: ${OG_H}px; overflow: hidden; background: #060a16; }
#card { position: relative; width: ${OG_W}px; height: ${OG_H}px; overflow: hidden; color: #fff; font-family: "Body", sans-serif; --c1: #8a5a14; --c2: #d4a537;
  background: radial-gradient(900px 620px at 12% 8%, color-mix(in srgb, var(--c2) 42%, transparent), transparent 70%), linear-gradient(135deg, #070b18 0%, #0e1a36 60%, #14244a 100%); }
#pattern { position: absolute; inset: 0; opacity: .5; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='70' height='70'%3E%3Cpath d='M35 5 65 35 35 65 5 35Z' fill='none' stroke='%23d4a537' stroke-opacity='.13' stroke-width='2'/%3E%3C/svg%3E"); }
#bg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 28%; display: none; }
#shade { position: absolute; inset: 0; display: none; background: linear-gradient(to top, rgba(4,7,16,.97) 0%, rgba(4,7,16,.86) 34%, rgba(4,7,16,.38) 66%, rgba(4,7,16,.62) 100%); }
.photo #bg, .photo #shade { display: block; }
.photo #pattern { display: none; }
.dim #shade { background: linear-gradient(to top, rgba(4,7,16,.97) 0%, rgba(6,10,24,.9) 45%, rgba(6,10,24,.78) 100%); }
#bar { position: absolute; inset: 0 0 0 auto; width: 14px; background: linear-gradient(#f3d27a, #b8860b); }
#wm { position: absolute; left: 40px; bottom: 60px; width: 330px; height: 330px; opacity: .1; color: var(--c2); }
#wm svg { width: 100%; height: 100%; stroke-width: 1.2; }
.photo #wm { display: none; }
#top { position: absolute; top: 40px; right: 62px; left: 48px; display: flex; align-items: center; justify-content: space-between; }
#brand { display: flex; align-items: center; gap: 16px; }
#brand img { width: 68px; height: 68px; border-radius: 18px; box-shadow: 0 6px 22px rgba(0,0,0,.5); }
#brand b { display: block; font-family: "Kufi"; font-weight: 700; font-size: 30px; line-height: 1.25; text-shadow: 0 2px 10px rgba(0,0,0,.7); }
#brand span { display: block; font-size: 19px; color: #f3d27a; font-weight: 600; direction: ltr; text-align: right; text-shadow: 0 2px 8px rgba(0,0,0,.7); }
#badge { display: flex; align-items: center; gap: 10px; padding: 9px 22px 11px; border-radius: 999px; font-family: "Kufi"; font-weight: 600; font-size: 25px; background: linear-gradient(135deg, var(--c1), var(--c2)); box-shadow: 0 8px 26px rgba(0,0,0,.45); border: 1.5px solid rgba(255,255,255,.28); white-space: nowrap; }
#badge svg { width: 26px; height: 26px; }
#main { position: absolute; right: 62px; left: 52px; bottom: 44px; display: flex; flex-direction: column; gap: 16px; }
#icon { width: 108px; height: 108px; border-radius: 28px; display: none; place-items: center; background: linear-gradient(135deg, color-mix(in srgb, var(--c1) 80%, #000), var(--c2)); border: 2px solid rgba(243,210,122,.7); box-shadow: 0 14px 34px rgba(0,0,0,.5); margin-bottom: 6px; }
#icon svg { width: 58px; height: 58px; stroke-width: 1.7; }
.hasicon #icon { display: grid; }
#title { font-family: "Kufi"; font-weight: 700; line-height: 1.42; text-shadow: 0 3px 18px rgba(0,0,0,.85); overflow: hidden; text-wrap: balance; }
.mega #title { font-family: "Mega"; font-weight: 400; line-height: 1.25; }
#sub { font-size: 29px; line-height: 1.6; font-weight: 500; color: #d9deea; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; text-shadow: 0 2px 10px rgba(0,0,0,.8); }
#sub:empty { display: none; }
#foot { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 4px; padding-top: 16px; border-top: 2px solid rgba(243,210,122,.55); font-size: 23px; font-weight: 600; color: #f3d27a; }
#foot span:last-child { direction: ltr; color: #c9cfdd; font-weight: 500; }
</style>${lucide}</head><body>
<div id="card"><img id="bg" alt=""><div id="pattern"></div><div id="shade"></div><div id="wm"></div><div id="bar"></div>
<div id="top"><div id="brand"><img src="${u("assets/img/logo-256.png")}" alt=""><div><b id="site"></b><span id="handle"></span></div></div><div id="badge"></div></div>
<div id="main"><div id="icon"></div><div id="title"></div><div id="sub"></div><div id="foot"><span id="f1"></span><span id="f2"></span></div></div></div>
<script>
const $ = (s) => document.querySelector(s);
const ico = (name) => { if (!window.lucide || !name) return ""; const i = document.createElement("i"); i.dataset.lucide = name; const w = document.createElement("div"); w.hidden = true; w.appendChild(i); document.body.appendChild(w); lucide.createIcons(); const out = w.querySelector("svg") ? w.innerHTML : ""; w.remove(); return out; };
window.draw = async (s) => {
  const card = $("#card"), bg = $("#bg");
  card.className = ""; card.style.setProperty("--c1", s.c1 || "#8a5a14"); card.style.setProperty("--c2", s.c2 || "#d4a537");
  $("#site").textContent = s.site; $("#handle").textContent = s.handle;
  $("#badge").innerHTML = ico(s.badgeIcon); $("#badge").append(s.badge || "");
  $("#badge").style.display = s.badge ? "" : "none";
  $("#title").textContent = s.title; $("#sub").textContent = s.sub || "";
  $("#f1").textContent = s.foot || ""; $("#f2").textContent = s.host || "";
  const big = s.kind !== "post";
  if (big) card.classList.add("mega");
  const svg = ico(s.icon);
  $("#wm").innerHTML = svg; $("#icon").innerHTML = svg;
  if (svg && big) card.classList.add("hasicon");
  let photo = false;
  bg.removeAttribute("src");
  if (s.bg) photo = await new Promise((res) => { const t = setTimeout(() => res(false), 9000); bg.onload = () => { clearTimeout(t); res(bg.naturalWidth > 80); }; bg.onerror = () => { clearTimeout(t); res(false); }; bg.src = s.bg; });
  if (photo) { card.classList.add("photo"); if (big) card.classList.add("dim"); }
  await document.fonts.ready;
  // تصغير تلقائي: أكبر حجم يُبقي العنوان ضمن الارتفاع المتاح
  const t = $("#title"), maxH = big ? (svg ? 190 : 250) : (s.sub ? 250 : 300);
  let size = big ? 104 : 68; const min = big ? 54 : 38;
  t.style.display = "block"; t.style.webkitLineClamp = "";
  for (; size >= min; size -= 2) { t.style.fontSize = size + "px"; if (t.scrollHeight <= maxH) break; }
  if (t.scrollHeight > maxH) { t.style.display = "-webkit-box"; t.style.webkitBoxOrient = "vertical"; t.style.webkitLineClamp = String(Math.floor(maxH / (size * (big ? 1.25 : 1.42)))); }
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  return photo;
};
</script></body></html>`;
};

/* jobs: [{ file (نسبي لجذر الموقع), spec }] — يرسم الناقص فقط ويعيد إحصاءً */
export async function renderOgCards(root, jobs, { log = console.log } = {}) {
  // الصورة البعيدة (روابط تليغرام المؤقتة) قد تفشل: تُحفظ عندها بطاقة نصّية باسم بديل (fallback)، ويُعاد المحاولة للمنشورات الحديثة فقط
  const has = (f) => f && existsSync(path.join(root, f));
  const missing = jobs.filter((j) => !has(j.file) && !(has(j.fallback) && !j.retry));
  const stats = { total: jobs.length, rendered: 0, failed: 0, skipped: false };
  if (!missing.length) return stats;
  const puppeteer = loadPuppeteer(root), chrome = findChrome();
  if (!puppeteer || !chrome) {
    log(`  ⚠ صور المعاينة: ${missing.length} صورة ناقصة ولم تُرسم (${!puppeteer ? "puppeteer-core غير مثبّت: npm i --no-save puppeteer-core" : "لم يُعثر على Chrome؛ حدّد CHROME_PATH"})`);
    stats.skipped = true; return stats;
  }
  const tmp = path.join(root, "scripts", ".og-template.html");
  writeFileSync(tmp, template(root));
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox", "--allow-file-access-from-files", "--hide-scrollbars"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: OG_W, height: OG_H, deviceScaleFactor: 1 });
    await page.goto(pathToFileURL(tmp).href, { waitUntil: "load" });
    for (const j of missing) {
      try {
        const spec = { ...j.spec, bg: j.spec.bg ? (/^https?:/.test(j.spec.bg) ? j.spec.bg : pathToFileURL(path.join(root, j.spec.bg)).href) : null };
        const photo = await page.evaluate((s) => window.draw(s), spec);
        const useFallback = j.fallback && !photo;
        if (useFallback && has(j.fallback)) continue; // ما زالت الصورة غير متاحة والبطاقة النصّية موجودة
        const out = path.join(root, useFallback ? j.fallback : j.file);
        if (!useFallback && has(j.fallback)) rmSync(path.join(root, j.fallback));
        mkdirSync(path.dirname(out), { recursive: true });
        for (const quality of [82, 70, 58, 45]) {
          await page.screenshot({ path: out, type: "jpeg", quality, captureBeyondViewport: false });
          if (statSync(out).size <= OG_MAX_BYTES) break;
        }
        stats.rendered++;
        if (stats.rendered % 100 === 0) log(`  … صور المعاينة: ${stats.rendered}/${missing.length}`);
      } catch (e) { stats.failed++; log(`  ⚠ تعذّر رسم ${j.file}: ${e.message}`); }
    }
  } finally { await browser.close(); if (!process.env.OG_KEEP_TEMPLATE) rmSync(tmp); }
  return stats;
}

/* حذف الصور التي لم تعد أي صفحة تستعملها */
export function pruneOg(root, dir, keep) {
  let n = 0;
  const walk = (d) => { if (!existsSync(d)) return; for (const f of readdirSync(d, { withFileTypes: true })) { const p = path.join(d, f.name); if (f.isDirectory()) walk(p); else if (f.name.endsWith(".jpg") && !keep.has(path.relative(root, p).replace(/\\/g, "/"))) { if (process.env.OG_DEBUG) console.log("prune", path.relative(root, p)); rmSync(p); n++; } } };
  walk(path.join(root, dir));
  return n;
}
