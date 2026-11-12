#!/usr/bin/env node
/* ==========================================================
   مولّد مجموعة الأيقونات المصغّرة
   مكتبة lucide الكاملة (1700 أيقونة، 356 ك.ب) كانت تُحمَّل وتُنفَّذ في كل صفحة، والموقع يستعمل منها نحو 300.
   هذا السكربت يجمع أسماء الأيقونات المستعملة فعلاً ويكتب assets/js/vendor/lucide-subset.js بنفس الواجهة
   (window.lucide.icons / createElement / createIcons).

   كيف يعرف الأسماء؟ يأخذ كل نص بين علامتي اقتباس في ملفات الموقع ويبقي ما يطابق اسم أيقونة في lucide.
   الزيادة لا تضرّ، والنقص لا يكسر شيئاً: إن طُلبت أيقونة غير موجودة يحمّل core.js المكتبة الكاملة مرة واحدة.

   شغّله بعد إضافة أيقونات جديدة:   node scripts/build-icons.mjs
   ========================================================== */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FULL = path.join(ROOT, "assets/js/vendor/lucide-0.460.0.min.js");
const OUT = path.join(ROOT, "assets/js/vendor/lucide-subset.js");

const sb = { exports: {}, module: {} };
vm.runInNewContext(fs.readFileSync(FULL, "utf8"), sb);
const ICONS = sb.exports.icons;
const kebab = (k) => k.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/([A-Za-z])([0-9])/g, "$1-$2").toLowerCase();
const pascal = (n) => n.replace(/(^|-)([a-z0-9])/g, (m, a, c) => c.toUpperCase());

/* ---------- الملفات التي تُفحص ---------- */
const files = [];
const add = (dir, re, deep) => {
  const abs = path.join(ROOT, dir); if (!fs.existsSync(abs)) return;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    if (e.isDirectory()) { if (deep && e.name !== "vendor") add(path.join(dir, e.name), re, deep); }
    else if (re.test(e.name)) files.push(path.join(abs, e.name));
  }
};
add(".", /\.html$/);                     // الصفحات الرئيسية والأدوات
add("assets/js", /\.js$/, true);         // السكربتات والبيانات (بلا vendor)
add("scripts", /^build-pages\.mjs$/);    // قوالب الصفحات المولَّدة
add("scripts/seo", /\.mjs$/);

/* ---------- جمع الأسماء ---------- */
const used = new Set();
const lit = /["'`]([a-z][a-z0-9]*(?:-[a-z0-9]+)*)["'`]/g;
for (const f of files) {
  const s = fs.readFileSync(f, "utf8");
  for (const m of s.matchAll(lit)) { const key = pascal(m[1]); if (ICONS[key]) used.add(key); }
}
if (used.size < 50) { console.error("✖ عدد الأيقونات المكتشفة قليل جداً، هناك خطأ في الفحص"); process.exit(1); }

/* ---------- الكتابة: الأيقونة = أبناء عنصر svg فقط، والأسماء البديلة تشير إلى الأصل ---------- */
const canon = new Map(), body = {}, alias = {};
for (const key of [...used].sort()) {
  const node = ICONS[key];
  if (canon.has(node)) alias[key] = canon.get(node);
  else { canon.set(node, key); body[key] = node[2]; }
}
const code = `/* مولّد تلقائياً بواسطة scripts/build-icons.mjs من lucide v0.460.0 (ISC License) — ${Object.keys(body).length} أيقونة. لا تعدّله يدوياً. */
(function(){
var I=${JSON.stringify(body)},A=${JSON.stringify(alias)},k;
for(k in A)I[k]=I[A[k]];
var D={xmlns:"http://www.w3.org/2000/svg",width:24,height:24,viewBox:"0 0 24 24",fill:"none",stroke:"currentColor","stroke-width":2,"stroke-linecap":"round","stroke-linejoin":"round"};
function el(t,a,c){var e=document.createElementNS("http://www.w3.org/2000/svg",t),n;for(n in a)e.setAttribute(n,String(a[n]));if(c)for(n=0;n<c.length;n++)e.appendChild(el(c[n][0],c[n][1],c[n][2]));return e}
function createElement(node){return node&&node[0]==="svg"?el(node[0],node[1],node[2]):el("svg",D,node)}
function createIcons(o){var a=(o&&o.attrs)||{},L=document.querySelectorAll("i[data-lucide]"),i,e,n,s,x,P;for(i=0;i<L.length;i++){e=L[i];n=e.getAttribute("data-lucide");P=n.replace(/(^|-)([a-z0-9])/g,function(m,p,c){return c.toUpperCase()});if(!I[P])continue;s=createElement(I[P]);for(x=0;x<e.attributes.length;x++)if(e.attributes[x].name!=="class")s.setAttribute(e.attributes[x].name,e.attributes[x].value);for(x in a)s.setAttribute(x,a[x]);s.setAttribute("class","lucide lucide-"+n+(e.className?" "+e.className:""));e.parentNode.replaceChild(s,e)}}
window.lucide={icons:I,createElement:createElement,createIcons:createIcons,subset:true};
})();
`;
fs.writeFileSync(OUT, code);
console.log(`✔ ${path.relative(ROOT, OUT)}: ${used.size} اسماً (${Object.keys(body).length} أيقونة) من ${files.length} ملفاً · ${(code.length / 1024).toFixed(1)} ك.ب بدل ${(fs.statSync(FULL).size / 1024).toFixed(0)} ك.ب`);
