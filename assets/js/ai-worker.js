/* عامل تشغيل نماذج الكشف (ONNX) خارج الخيط الرئيسي، حتى لا تتجمّد الصفحة أثناء الفحص.
   الصورة لا تغادر الجهاز: يستلم العامل مصفوفة البكسلات المجهّزة ويعيد درجة النموذج فقط. */
const ORT_VER = "1.30.0";
const ORT_BASE = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;
/* بصمات SHA-384 لملفات المحرّك بهذا الإصدار. الملفات تأتي من CDN عام، فلا ننفّذ أي ملف
   إلا إذا طابق بصمته هنا (المقابل اليدوي لخاصية integrity في وسم script). عند ترقية ORT_VER حدّث البصمات. */
const ORT_SRI = {
  "ort.min.js": "N94xSNjPDbfBJj4+QINst0nbHpcCm8kc1qNlIP/wA0muqjR3aVyIuDkMeccPrLvQ",
  "ort-wasm-simd-threaded.jsep.mjs": "oE7XJ3WFQfuTdk0T1EGXViKSjtupvq5xVNx8ODzs7dq8qjGnN5P2tZBPr8XKceJ4",
  "ort-wasm-simd-threaded.jsep.wasm": "Ueht0ynFKexyaENvQBCXJQmjjdEzUgnesolNNQPAhnDeYvh1YA53nYHw1mrWvaM1"
};
async function verified(name) {
  const r = await fetch(ORT_BASE + name, { credentials: "omit", referrerPolicy: "no-referrer" });
  if (!r.ok) throw new Error("http " + r.status);
  const buf = await r.arrayBuffer();
  const h = new Uint8Array(await crypto.subtle.digest("SHA-384", buf));
  let bin = ""; for (let i = 0; i < h.length; i++) bin += String.fromCharCode(h[i]);
  if (btoa(bin) !== ORT_SRI[name]) throw new Error("integrity");
  return buf;
}
const CACHE = "iq-ai-models-v1";
let ready = null;
const sessions = {};

function loadOrt() {
  if (!ready) ready = (async () => {
    try {
      const [js, mjs, wasm] = await Promise.all([verified("ort.min.js"), verified("ort-wasm-simd-threaded.jsep.mjs"), verified("ort-wasm-simd-threaded.jsep.wasm")]);
      const u = URL.createObjectURL(new Blob([js], { type: "text/javascript" }));
      try { importScripts(u); } finally { URL.revokeObjectURL(u); }
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.wasmPaths = { mjs: URL.createObjectURL(new Blob([mjs], { type: "text/javascript" })) };
      ort.env.wasm.wasmBinary = wasm;
    } catch (e) {
      ready = null;
      throw new Error(e && e.message === "integrity" ? "ملف محرك التشغيل لا يطابق بصمته المعتمدة، فأوقفنا تشغيله حمايةً لك" : "تعذّر تحميل محرك التشغيل (تحقق من الاتصال)");
    }
  })();
  return ready;
}

async function fetchCached(url, id) {
  let cache = null;
  try { cache = await caches.open(CACHE); const hit = await cache.match(url); if (hit) { postMessage({ id, progress: 1, cached: true }); return await hit.arrayBuffer(); } } catch { cache = null; }
  const r = await fetch(url); if (!r.ok) throw new Error("فشل تحميل النموذج (" + r.status + ")");
  const total = +r.headers.get("content-length") || 0; const reader = r.body.getReader(); const chunks = []; let got = 0;
  for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); got += value.length; if (total) postMessage({ id, progress: got / total, cached: false }); }
  const blob = new Blob(chunks);
  if (cache) { try { await cache.put(url, new Response(blob)); } catch { /* quota: still works for this visit */ } }
  return await blob.arrayBuffer();
}

onmessage = async (e) => {
  const { id, model, url, data, size } = e.data;
  try {
    await loadOrt();
    if (!sessions[model]) sessions[model] = await ort.InferenceSession.create(await fetchCached(url, id), { executionProviders: ["wasm"], graphOptimizationLevel: "all" });
    const s = sessions[model];
    const out = await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", data, [1, 3, size, size]) });
    postMessage({ id, logits: Array.from(out[s.outputNames[0]].data) });
  } catch (err) { postMessage({ id, error: String((err && err.message) || err) }); }
};
