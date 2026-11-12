#!/usr/bin/env node
/* ==========================================================
   IndexNow: إخبار محركات البحث (Bing و Yandex و Seznam و Naver…) بالروابط الجديدة والمعدّلة فوراً.
   مجاني وبلا حساب: يكفي ملف المفتاح الموجود في جذر الموقع (<indexNowKey>.txt، يولّده build-pages.mjs).
   ملاحظة: غوغل لا يستعمل IndexNow؛ غوغل يعتمد على sitemap.xml و Search Console.

   الاستخدام:
     node scripts/indexnow.mjs --dry      يعرض ما سيُرسَل دون إرسال (الوضع الافتراضي إن لم يُكتب --send)
     node scripts/indexnow.mjs --send     يرسل الروابط الموجودة في scripts/indexnow-pending.json
     node scripts/indexnow.mjs --send --all   يرسل كل روابط sitemap (مرة واحدة بعد أول نشر أو بعد تغيير النطاق)
   داخل GitHub Actions يُرسَل فقط إذا كان متغيّر المستودع INDEXNOW_ENABLED = true.
   ========================================================== */
import { readFileSync, existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rel = (...p) => path.join(ROOT, ...p);
const args = new Set(process.argv.slice(2));
const cfg = JSON.parse(readFileSync(rel("scripts/site.config.json"), "utf8"));
const SITE_URL = (process.env.SITE_URL || cfg.siteUrl || "").replace(/\/+$/, "");
const KEY = cfg.indexNowKey;

if (!SITE_URL || !KEY) { console.log("IndexNow: لم يُحدَّد siteUrl أو indexNowKey في scripts/site.config.json — لا شيء يُرسَل."); process.exit(0); }
const site = new URL(SITE_URL + "/");
const abs = (p) => encodeURI(`${SITE_URL}/${String(p).replace(/^\/+/, "")}`);

let paths = [];
if (args.has("--all")) {
  for (const f of readdirSync(ROOT)) if (/^sitemap-(pages|topics|posts(-\d+)?)\.xml$/.test(f))
    for (const m of readFileSync(rel(f), "utf8").matchAll(/<url><loc>([^<]+)<\/loc>/g)) paths.push(m[1].replace(/&amp;/g, "&"));
} else if (existsSync(rel("scripts/indexnow-pending.json"))) {
  paths = (JSON.parse(readFileSync(rel("scripts/indexnow-pending.json"), "utf8")).paths || []).map(abs);
}
paths = [...new Set(paths)].filter((u) => u.startsWith(SITE_URL));
if (!paths.length) { console.log("IndexNow: لا روابط جديدة."); process.exit(0); }

const body = { host: site.host, key: KEY, keyLocation: `${SITE_URL}/${KEY}.txt`, urlList: paths };
if (!args.has("--send")) {
  console.log(`IndexNow (تجربة بلا إرسال): ${paths.length} رابطاً إلى api.indexnow.org`);
  console.log(`  host: ${body.host}\n  keyLocation: ${body.keyLocation}`);
  for (const u of paths.slice(0, 8)) console.log("  - " + decodeURI(u));
  if (paths.length > 8) console.log(`  … و${paths.length - 8} أخرى`);
  console.log("أضف --send للإرسال الفعلي.");
  process.exit(0);
}

// المفتاح يجب أن يكون منشوراً قبل الإرسال، وإلا رُفض الطلب
try {
  const res = await fetch(body.keyLocation);
  const txt = res.ok ? (await res.text()).trim() : "";
  if (txt !== KEY) { console.log(`IndexNow: ملف المفتاح غير منشور بعد على ${body.keyLocation} (${res.status}). لم يُرسَل شيء.`); process.exit(0); }
} catch (e) { console.log(`IndexNow: تعذّر الوصول إلى ملف المفتاح (${e.message}). لم يُرسَل شيء.`); process.exit(0); }

let failed = 0;
for (let i = 0; i < paths.length; i += 10000) {
  const chunk = { ...body, urlList: paths.slice(i, i + 10000) };
  try {
    const res = await fetch("https://api.indexnow.org/indexnow", { method: "POST", headers: { "Content-Type": "application/json; charset=utf-8" }, body: JSON.stringify(chunk) });
    console.log(`IndexNow: ${chunk.urlList.length} رابطاً ← ${res.status} ${res.statusText}`);
    if (!res.ok && res.status !== 202) failed++;
  } catch (e) { console.log(`IndexNow: فشل الإرسال (${e.message})`); failed++; }
}
// لا نُفشل النشر بسبب IndexNow
process.exit(0);
