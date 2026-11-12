#!/usr/bin/env node
/* ==========================================================
   بناء نسخة النشر dist/ لكل الموقع
   - تنسخ ملفات الموقع فقط (بلا السكربتات والعامل وملفات الاختبار والفيديو)
   - تضغط JS وCSS وJSON (إن وُجدت حزمة esbuild) دون تغيير أسماء الملفات أو المتغيرات العامة
   - تعطي عامل الخدمة sw.js رقم إصدار جديداً من بصمة المحتوى، فيحدّث الزوار ذاكرتهم تلقائياً
   الاستخدام:
     node scripts/build-dist.mjs            ← بناء dist/
     node scripts/build-dist.mjs --pages    ← تشغيل build-pages.mjs أولاً ثم البناء
     node scripts/build-dist.mjs --no-minify
   للضغط مرة واحدة: npm i --no-save --no-package-lock esbuild
   ========================================================== */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIST = path.join(ROOT, "dist");
const args = new Set(process.argv.slice(2));

/* ما لا يُنشر أبداً */
const SKIP_TOP = new Set([
  ".git", ".github", ".claude", ".gitignore", ".gitattributes", "dist", "node_modules",
  "scripts", "worker", "_fztest", "_aitest", "ad-video", "promo-video",
  "README.md", "خطة-الموقع.md", "package.json", "package-lock.json"
]);
const SKIP_ANY = new Set(["node_modules", ".DS_Store", "Thumbs.db", "desktop.ini"]);
const SKIP_EXT = new Set([".log", ".map", ".py", ".cjs", ".mjs", ".md"]);

if (args.has("--pages")) {
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts/build-pages.mjs")], { stdio: "inherit" });
  if (r.status !== 0) process.exit(r.status || 1);
}

let esbuild = null;
if (!args.has("--no-minify")) {
  try { esbuild = await import("esbuild"); }
  catch { console.warn("⚠ حزمة esbuild غير مثبّتة: ستُنسخ الملفات بلا ضغط. ثبّتها بـ: npm i --no-save --no-package-lock esbuild"); }
}

/* ---------- جمع الملفات ---------- */
async function walk(dir, rel = "") {
  const out = [];
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const r = rel ? `${rel}/${e.name}` : e.name;
    if (!rel && SKIP_TOP.has(e.name)) continue;
    if (SKIP_ANY.has(e.name)) continue;
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), r)));
    else if (e.isFile() && !SKIP_EXT.has(path.extname(e.name).toLowerCase())) out.push(r);
  }
  return out;
}

/* ---------- المعالجة ---------- */
const stats = { files: 0, before: 0, after: 0, minified: 0, failed: [] };
const isVendor = (r) => /(^|\/)vendor\//.test(r) || /\.min\.(js|css)$/.test(r);

async function transform(rel, buf) {
  const ext = path.extname(rel).toLowerCase();
  try {
    if (esbuild && !isVendor(rel) && (ext === ".js" || ext === ".css")) {
      const r = await esbuild.transform(buf.toString("utf8"), {
        loader: ext.slice(1), minify: true, charset: "utf8", legalComments: "none",
        // لا target: نحافظ على الصياغة كما هي، فقط نزيل المسافات والتعليقات ونقصّر الأسماء المحلية
      });
      stats.minified++; return Buffer.from(r.code);
    }
    if (ext === ".json" || ext === ".webmanifest") { const s = JSON.stringify(JSON.parse(buf.toString("utf8"))); stats.minified++; return Buffer.from(s); }
  } catch (e) {
    stats.failed.push(`${rel}: ${String(e.message || e).split("\n")[0]}`);
  }
  return buf;
}

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: n }, async () => { while (i < items.length) { const k = i++; await fn(items[k]); } }));
}

const t0 = Date.now();
await fs.rm(DIST, { recursive: true, force: true });
const files = (await walk(ROOT)).sort();
const hash = createHash("sha1");
const SW = "sw.js";

await pool(files.filter((f) => f !== SW), 24, async (rel) => {
  const src = await fs.readFile(path.join(ROOT, rel));
  const out = await transform(rel, src);
  const dest = path.join(DIST, rel);
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.writeFile(dest, out);
  stats.files++; stats.before += src.length; stats.after += out.length;
});
// البصمة بترتيب ثابت حتى تعطي النتيجة نفسها لنفس المحتوى
for (const rel of files) if (rel !== SW) hash.update(rel).update(await fs.readFile(path.join(DIST, rel)));
const build = hash.digest("hex").slice(0, 8);

if (files.includes(SW)) {
  const src = await fs.readFile(path.join(ROOT, SW));
  let code = src.toString("utf8");
  const m = code.match(/const VERSION = "([^"]+)"/);
  if (m) code = code.replace(m[0], `const VERSION = "${m[1]}-${build}"`);
  else console.warn("⚠ لم أجد VERSION في sw.js: لن يتغيّر إصدار ذاكرة الزوار");
  const out = await transform(SW, Buffer.from(code));
  await fs.writeFile(path.join(DIST, SW), out);
  stats.files++; stats.before += src.length; stats.after += out.length;
}

/* ---------- التقرير ---------- */
const mb = (n) => (n / 1048576).toFixed(2) + " MB";
console.log(`✔ dist/ جاهز: ${stats.files} ملف في ${((Date.now() - t0) / 1000).toFixed(1)} ث · بصمة البناء ${build}`);
console.log(`  الحجم: ${mb(stats.before)} ← ${mb(stats.after)} (وفّرنا ${mb(stats.before - stats.after)})${esbuild ? ` · ضُغط ${stats.minified} ملف` : " · بلا ضغط"}`);
if (stats.failed.length) { console.warn(`⚠ ${stats.failed.length} ملف نُسخ كما هو لأن ضغطه فشل:`); stats.failed.slice(0, 20).forEach((f) => console.warn("   - " + f)); }
