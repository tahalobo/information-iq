#!/usr/bin/env node
/* ==========================================================
   اختبارات الأمان: تثبت أن كل إصلاح أمني ما زال يعمل (بلا إنترنت وبلا متصفح).
   الاستخدام:  node scripts/security-tests.mjs      (يستدعيه scripts/security-audit.mjs أيضاً)
   ========================================================== */
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];
const realError = console.error; console.error = () => {};   // العامل يكتب أخطاءه الداخلية في سجلّه (لا للزائر): لا نريدها في مخرجات الاختبار
const test = async (name, fn) => { try { await fn(); results.push([true, name]); } catch (e) { results.push([false, `${name} ← ${e.message}`]); } };
const eq = (a, b, msg = "") => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg} توقعنا ${JSON.stringify(b)} ووجدنا ${JSON.stringify(a)}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || "شرط غير محقق"); };

/* ---------- 1) عامل Cloudflare: الأصل، SSRF، الحدود ---------- */
{
  const worker = (await import(pathToFileURL(path.join(ROOT, "worker/reverse-search.js")).href)).default;
  const realFetch = globalThis.fetch; const fetched = [];
  // لا إنترنت في الاختبار: كل طلب خارجي يُسجَّل ويُرفض
  globalThis.fetch = async (u) => { fetched.push(String(u)); throw new Error("network disabled in tests"); };
  const ORIGIN = "https://tahalobo.github.io", env = { ALLOWED_ORIGINS: ORIGIN };
  const call = async (route, body, { origin = ORIGIN, e = env, method = "POST" } = {}) => {
    const r = await worker.fetch(new Request("https://w.example" + route, { method, headers: origin ? { Origin: origin } : {}, body: method === "POST" ? (typeof body === "string" ? body : JSON.stringify(body)) : undefined }), e, { waitUntil() {} });
    return { status: r.status, headers: r.headers, json: await r.json().catch(() => null) };
  };
  await test("العامل: يرفض الطلب بلا ALLOWED_ORIGINS (ليس وسيطاً مفتوحاً)", async () => eq((await call("/link", { url: "https://example.org" }, { e: {} })).status, 403));
  await test("العامل: يرفض أصلاً غير مسموح وبلا ترويسة Origin", async () => {
    eq((await call("/link", { url: "https://example.org" }, { origin: "https://evil.example" })).status, 403);
    eq((await call("/link", { url: "https://example.org" }, { origin: "" })).status, 403);
    eq((await call("/link", { url: "https://example.org" }, { origin: "http://localhost:5500" })).status, 403, "localhost بلا DEV");
  });
  await test("العامل: لا يعكس أصل المهاجم في CORS", async () => {
    const r = await call("/", {}, { origin: "https://evil.example" });
    ok(r.headers.get("Access-Control-Allow-Origin") !== "https://evil.example" && r.headers.get("Access-Control-Allow-Origin") !== "*");
    eq(r.headers.get("X-Content-Type-Options"), "nosniff");
  });
  const PRIVATE = ["http://127.0.0.1/", "http://localhost/", "http://localhost./", "http://x.localhost/", "http://10.0.0.5/", "http://192.168.1.1/", "http://172.20.0.1/", "http://169.254.169.254/latest/meta-data/",
    "http://[::1]/", "http://[fd00::1]/", "http://2130706433/", "http://0x7f.0.0.1/", "http://0177.0.0.1/", "http://0.0.0.0/", "http://100.64.0.1/", "http://127.0.0.1.nip.io/", "http://router.lan/", "http://intranet/",
    "http://user:pass@example.org/", "http://example.org:22/", "http://example.org:8080/"];
  await test("العامل /link: لا يجلب أي عنوان داخلي أو خاص (SSRF)", async () => {
    for (const u of PRIVATE) {
      fetched.length = 0;
      const r = await call("/link", { url: u });
      ok(!fetched.length, `جُلب ${u}`);
      ok(r.json && r.json.chain && r.json.chain[0].via === "private", `${u} لم يُحجب`);
    }
  });
  await test("العامل /dates و / : لا يجلبان العناوين الداخلية", async () => {
    fetched.length = 0;
    const r = await call("/dates", { urls: PRIVATE });
    eq(r.json.pages, []); ok(!fetched.length, "جُلب عنوان داخلي");
    eq((await call("/", { url: "http://169.254.169.254/x.jpg" })).status, 400);
    ok(!fetched.length, "جُلب عنوان داخلي");
  });
  await test("العامل: يرفض المخططات غير http/https", async () => {
    for (const u of ["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///etc/passwd", "ftp://example.org/"]) eq((await call("/link", { url: u })).status, 400, u);
  });
  await test("العامل: التحويل إلى عنوان داخلي يُحجب عند المحطة التالية", async () => {
    fetched.length = 0;
    globalThis.fetch = async (u) => { fetched.push(String(u)); return new Response(null, { status: 302, headers: { location: "http://169.254.169.254/latest/" } }); };
    const r = await call("/link", { url: "https://example.org/go" });
    eq(fetched, ["https://example.org/go"]); eq(r.json.chain[1].via, "private");
    fetched.length = 0;
    const d = await call("/dates", { urls: ["https://example.org/go"] });
    eq(fetched, ["https://example.org/go"]); eq(d.json.pages[0].date, undefined);
    globalThis.fetch = async (u) => { fetched.push(String(u)); return new Response(null, { status: 302, headers: { location: "javascript:alert(1)" } }); };
    const j = await call("/link", { url: "https://example.org/go" });
    ok(!JSON.stringify(j.json).includes("javascript:alert"), "رابط javascript: عاد إلى الصفحة");
    globalThis.fetch = async (u) => { fetched.push(String(u)); throw new Error("network disabled in tests"); };
  });
  await test("العامل: حدّ حجم الطلب، JSON فاسد، طرق غير مسموحة، لا تسريب للأخطاء", async () => {
    eq((await call("/", "{" + '"image":"' + "A".repeat(6_000_000) + '"}')).status, 413);
    eq((await call("/", "not json")).status, 400);
    eq((await call("/", "[1,2]")).status, 400);
    const r = await worker.fetch(new Request("https://w.example/", { method: "DELETE", headers: { Origin: ORIGIN } }), env, {});
    eq(r.status, 405);
    const e = await call("/verify", { queries: ["اختبار تسريب الأخطاء"] });
    ok(e.status >= 500 && !("detail" in e.json) && !JSON.stringify(e.json).includes("network disabled"), "نص الخطأ الداخلي عاد للزائر");
  });
  globalThis.fetch = realFetch;
}

/* ---------- 2) مزامنة تليغرام: محتوى القناة لا يصير HTML ولا رابطاً خطراً ---------- */
{
  const { parsePage, bodyHtml, esc, isImageUrl, isImageBytes } = await import(pathToFileURL(path.join(ROOT, "scripts/telegram-sync.mjs")).href);
  const EVIL = '<img src=x onerror=alert(1)> "><svg onload=alert(2)> </script><script>alert(3)</script>';
  // كما تعرضها صفحة t.me/s: نص المنشور مهرَّب بكيانات HTML، ورابط javascript: داخل وسم a
  const page = '<div class="tgme_widget_message_wrap"><div class="tgme_widget_message" data-post="chan/77">' +
    '<div class="tgme_widget_message_text js-message_text" dir="auto">' + EVIL.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;") +
    '<br><a href="javascript:alert(4)">اضغط هنا</a> <a href="https://example.org/a?b=1&amp;c=2">رابط سليم</a> https://example.org/x&quot;onmouseover=&quot;alert(5)</div>' +
    '<a class="tgme_widget_message_photo_wrap" style="width:1px;background-image:url(\'https://cdn4.telesco.pe/file/abc.jpg\')"></a>' +
    '<time datetime="2026-01-01T00:00:00+00:00"></time></div></div>';
  const [post] = parsePage(page, "chan");
  await test("المزامنة: منشور خبيث يُقرأ نصاً، ورابط javascript: يُحذف من قائمة الروابط", async () => {
    ok(post && post.id === 77, "لم يُقرأ المنشور");
    ok(post.text.includes("<img src=x onerror=alert(1)>"), "النص الأصلي يجب أن يبقى نصاً كما هو");
    ok(!post.links.some((l) => !/^https?:/.test(l.href)), "رابط بمخطط غير http/https بقي في القائمة");
  });
  await test("المزامنة: نص المنشور يخرج HTML مهرَّباً بلا وسوم ولا خصائص محقونة", async () => {
    const html = bodyHtml(post.text, "");
    const tags = [...html.matchAll(/<\/?([a-z0-9]+)/gi)].map((m) => m[1].toLowerCase());
    ok(tags.every((t) => ["p", "br", "a"].includes(t)), "وسم غير متوقع: " + [...new Set(tags)].join(","));
    ok(!/<[^>]*\son[a-z]+\s*=/i.test(html), "معالج حدث داخل وسم");
    ok(!/href="\s*javascript:/i.test(html), "رابط javascript:");
    const links = [...html.matchAll(/<a\b[^>]*>/g)];
    ok(links.length >= 1, "لم يُحوَّل أي رابط");
    for (const m of links) ok(/^<a href="https?:\/\/[^"]*" target="_blank" rel="noopener noreferrer">$/.test(m[0]), "خصائص زائدة على الرابط: " + m[0].slice(0, 90));
    eq(esc("<>&\"'"), "&lt;&gt;&amp;&quot;&#39;");
  });
  await test("المزامنة: الصور تُنزَّل من خوادم تليغرام فقط، ولا يُحفظ إلا ما هو صورة", async () => {
    ok(isImageUrl("https://cdn4.telesco.pe/file/abc.jpg") && isImageUrl("https://cdn5.cdn-telegram.org/file/a.jpg"));
    for (const u of ["http://cdn4.telesco.pe/a.jpg", "https://evil.example/a.jpg", "https://telesco.pe.evil.example/a.jpg", "https://169.254.169.254/latest", "file:///etc/passwd", "javascript:alert(1)", "//evil.example/a.jpg", "https://user@cdn4.telesco.pe/a.jpg"]) ok(!isImageUrl(u), "قُبل " + u);
    ok(isImageBytes(Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0, 0, 0, 0, 0, 0])), "JPEG رُفض");
    ok(!isImageBytes(Buffer.from("<html><script>alert(1)</script></html>")), "HTML قُبل كصورة");
    ok(!isImageBytes(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>")), "SVG قُبل كصورة");
  });
}

/* ---------- 3) سياسة أمن المحتوى ---------- */
{
  const { cspFor, THEME_BOOT_HASH, THEME_BOOT_JS, sha256 } = await import(pathToFileURL(path.join(ROOT, "scripts/seo/csp.mjs")).href);
  const dir = (p, name) => (p.match(new RegExp("(?:^|; )" + name + " ([^;]*)")) || [])[1] || "";
  await test("CSP: لا 'unsafe-inline' ولا 'unsafe-eval' ولا نطاق خارجي في script-src لأي صفحة", async () => {
    for (const f of ["index.html", "post", "hub", "404.html", "contact.html", "tool-link.html", "tool-reverse.html", "tool-password.html", "tool-metadata.html", "verify.html", "quiz.html", "tool-ai.html"]) {
      eq(dir(cspFor(f, {}), "script-src"), "'self' '" + THEME_BOOT_HASH + "'", f);
    }
    eq(sha256(THEME_BOOT_JS), THEME_BOOT_HASH);
  });
  await test("CSP: كل صفحة تتصل بما تحتاجه فقط", async () => {
    eq(dir(cspFor("index.html", {}), "connect-src"), "'self'");
    eq(dir(cspFor("post", {}), "connect-src"), "'self'");
    eq(dir(cspFor("post", {}), "frame-src"), "https://t.me");
    eq(dir(cspFor("index.html", {}), "frame-src"), "'none'");
    eq(dir(cspFor("tool-password.html", {}), "connect-src"), "'self' https://api.pwnedpasswords.com data: blob:");
    ok(dir(cspFor("tool-reverse.html", { reverseSearchEndpoint: "https://w.example.workers.dev/x" }), "connect-src").includes("https://w.example.workers.dev"), "رابط العامل لم يُضف");
    ok(!dir(cspFor("tool-reverse.html", { reverseSearchEndpoint: "javascript:alert(1)" }), "connect-src").includes("javascript"), "مخطط خطر دخل السياسة");
    for (const f of ["index.html", "post", "tool-ai.html"]) { const p = cspFor(f, {}); ok(p.includes("object-src 'none'") && p.includes("base-uri 'self'") && p.includes("default-src 'self'"), f); }
  });
}

/* ---------- النتيجة ---------- */
const failed = results.filter((r) => !r[0]);
for (const [pass, name] of results) console.log(`${pass ? "✔" : "✖"} ${name}`);
console.log(`\n${results.length - failed.length}/${results.length} اختباراً ناجحاً`);
if (failed.length) process.exit(1);
