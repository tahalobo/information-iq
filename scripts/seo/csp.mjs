/* ==========================================================
   سياسة أمن المحتوى (Content-Security-Policy) لكل صفحة
   GitHub Pages لا يسمح بضبط ترويسات HTTP، فنكتب السياسة داخل الصفحة:
       <meta http-equiv="Content-Security-Policy" content="…">
   يكتبها scripts/build-pages.mjs في كل صفحة (الثابتة والمولَّدة)، ويتحقق منها scripts/security-audit.mjs.

   القواعد:
   - السكربتات: من ملفات الموقع فقط. لا 'unsafe-inline' ولا 'unsafe-eval'. السكربت المضمّن الوحيد المسموح
     هو سكربت منع الوميض في <head> (THEME_BOOT) ببصمته sha256. أي سكربت يُحقن في الصفحة لا يُنفَّذ.
   - الاتصالات (connect-src): الموقع نفسه فقط، وتُفتح لكل أداة الخدمات التي تحتاجها هي بالذات.
   - الأنماط: 'unsafe-inline' مسموح لأن الموقع يكتب خصائص style="--c1:…" في مئات العناصر (خطرها محدود: لا تنفّذ كوداً).

   ما لا يمكن تحقيقه عبر <meta> (يتجاهله المتصفح): frame-ancestors (منع تضمين الموقع داخل إطار)، report-uri، sandbox.
   وكذلك HSTS و X-Frame-Options و X-Content-Type-Options ترويسات HTTP لا وسوم. البديل: نطاق خاص خلف Cloudflare.
   ========================================================== */
import crypto from "node:crypto";

/* سكربت منع الوميض: يضبط الثيم والوضع الخفيف قبل أول رسم. أي تعديل عليه يغيّر بصمته تلقائياً في كل الصفحات عند البناء. */
export const THEME_BOOT_JS = "try{var d=document.documentElement,L=localStorage,S=sessionStorage,n=navigator,c=n.connection||{},M=function(q){return matchMedia(q).matches},t=L.getItem(\"theme\"),m=L.getItem(\"lite\"),r=M(\"(prefers-reduced-motion: reduce)\");if(t)d.dataset.theme=JSON.parse(t);if(m=='\"on\"'||m!='\"off\"'&&(r||c.saveData||/2g|3g/.test(c.effectiveType||\"\")||n.deviceMemory<=4||n.hardwareConcurrency<=4||+L.getItem(\"lite-auto\")>Date.now()||M(\"(pointer: coarse)\")&&M(\"(max-width: 1100px)\")&&!(n.deviceMemory>=8&&n.hardwareConcurrency>=8)&&!/iP(hone|ad|od)/.test(n.userAgent)))d.className+=\" lite rm no-gl\";else if(r)d.className+=\" rm\";else if(!S.getItem(\"fx-seen\"))d.className+=\" is-loading\";else if(S.getItem(\"fx-nav\"))d.className+=\" entering\";S.removeItem(\"fx-nav\")}catch(e){}";
export const sha256 = (s) => "sha256-" + crypto.createHash("sha256").update(s, "utf8").digest("base64");
export const THEME_BOOT_HASH = sha256(THEME_BOOT_JS);

const origin = (u) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.origin : ""; } catch { return ""; } };

/* ما تحتاجه كل صفحة فوق الأساس. المفتاح: اسم الملف، أو "post" لصفحات المنشورات (post/*.html و fact.html) */
const EXTRA = {
  // فيديو المنشور: إطار تليغرام الرسمي
  post: { frame: ["https://t.me"] },
  "contact.html": { connect: ["https://script.google.com", "https://script.googleusercontent.com", "https://formspree.io"] },
  "tool-password.html": { connect: ["https://api.pwnedpasswords.com"] },
  // فاحص الروابط يسأل خوادم RDAP لكل نطاق عليا (قائمتها من IANA وتتغيّر)، فلا يمكن حصرها: https فقط
  "tool-link.html": { connect: ["https:"] },
  "tool-metadata.html": { connect: ["https://nominatim.openstreetmap.org"], img: ["https://tile.openstreetmap.org"] },
  "verify.html": { connect: ["https://ar.wikipedia.org", "https://en.wikipedia.org", "https://factchecktools.googleapis.com"] },
  // نتائج البحث العكسي صور مصغّرة من مواقع لا يمكن حصرها + صورة من رابط يكتبه الزائر
  "tool-reverse.html": { img: ["https:"], form: ["https://lens.google.com"] },
  // نماذج الكشف تعمل داخل Web Worker: محرّك ONNX (ببصمة مثبّتة في assets/js/ai-worker.js) من jsDelivr، والنماذج من Hugging Face
  // (العامل لا يخضع لسياسة الصفحة في المتصفحات الحالية؛ نسمح بالاتصال هنا احتياطاً للمتصفحات التي تورّثها له)
  "tool-ai.html": { connect: ["https://cdn.jsdelivr.net", "https://huggingface.co", "https://*.huggingface.co", "https://*.hf.co"] }
};
const TOOL_PAGES = /^(tool-[a-z]+|verify)\.html$/;

/* file: اسم الصفحة ("index.html"، "tool-ai.html"…) أو "post" / "hub" للصفحات المولَّدة. site: window.SITE من config.js */
export function cspFor(file, site = {}) {
  const x = EXTRA[file === "fact.html" ? "post" : file] || {};
  const connect = ["'self'", ...(x.connect || [])], img = ["'self'", "data:", "blob:", ...(x.img || [])];
  if (TOOL_PAGES.test(file)) connect.push("data:", "blob:");   // الأدوات تقرأ ملفات الزائر محلياً عبر fetch(blob:/data:)
  // عامل Cloudflare (إن ضُبط رابطه في config.js) يُضاف تلقائياً للصفحات التي تستعمله
  const worker = { "tool-reverse.html": [site.reverseSearchEndpoint], "tool-link.html": [site.linkCheckEndpoint, site.reverseSearchEndpoint], "verify.html": [site.verifyEndpoint, site.reverseSearchEndpoint] }[file] || [];
  for (const o of worker.map(origin).filter(Boolean)) if (!connect.includes(o)) connect.push(o);
  if (file === "contact.html") { const o = origin(site.formEndpoint); if (o && !connect.includes(o)) connect.push(o); }
  const d = [
    ["default-src", ["'self'"]],
    ["script-src", ["'self'", `'${THEME_BOOT_HASH}'`, ...(x.script || [])]],
    ["style-src", ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"]],
    ["font-src", ["'self'", "https://fonts.gstatic.com"]],
    ["img-src", img],
    ["media-src", ["'self'", "data:", "blob:"]],
    ["connect-src", connect],
    ["worker-src", ["'self'", "blob:"]],
    ["frame-src", x.frame || ["'none'"]],
    ["manifest-src", ["'self'"]],
    ["object-src", ["'none'"]],
    ["base-uri", ["'self'"]],
    ["form-action", ["'self'", ...(x.form || [])]]
  ];
  return d.map(([k, v]) => `${k} ${v.join(" ")}`).join("; ");
}

/* الوسوم الأمنية التي تُكتب أول <head> (قبل أي سكربت أو رابط) */
export function securityMeta(file, site) {
  return `<meta http-equiv="Content-Security-Policy" content="${cspFor(file, site)}">\n<meta name="referrer" content="same-origin">`;
}
