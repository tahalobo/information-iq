/* تشغيل عامل البحث العكسي محلياً للتجربة (بدون Cloudflare):

     node worker/dev-server.mjs

   ثم ضع في assets/js/config.js مؤقتاً:  reverseSearchEndpoint: "http://localhost:8787"

   يستمع على 127.0.0.1 فقط (لا يصل إليه أحد من الشبكة)، ويفعّل DEV=1 ليقبل طلبات http://localhost.
*/
import http from "node:http";
import worker from "./reverse-search.js";

const PORT = +(process.env.PORT || 8787);
http.createServer(async (req, res) => {
  const chunks = []; for await (const c of req) chunks.push(c);
  const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : Buffer.concat(chunks) });
  let r;
  try { r = await worker.fetch(request, { DEV: "1" }, { waitUntil() {} }); }
  catch (e) { console.error(e); r = new Response(JSON.stringify({ error: "crash" }), { status: 500 }); }
  res.writeHead(r.status, Object.fromEntries(r.headers));
  res.end(Buffer.from(await r.arrayBuffer()));
}).listen(PORT, "127.0.0.1", () => console.log(`reverse-search worker on http://localhost:${PORT}`));
