/* عامل تشغيل نماذج الكشف (ONNX) خارج الخيط الرئيسي، حتى لا تتجمّد الصفحة أثناء الفحص.
   الصورة لا تغادر الجهاز: يستلم العامل مصفوفة البكسلات المجهّزة ويعيد درجة النموذج فقط. */
const ORT_VER = "1.30.0";
const CACHE = "iq-ai-models-v1";
let ready = null;
const sessions = {};

function loadOrt() {
  if (!ready) ready = new Promise((res, rej) => {
    try {
      importScripts(`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/ort.min.js`);
      ort.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VER}/dist/`;
      res();
    } catch (e) { ready = null; rej(new Error("تعذّر تحميل محرك التشغيل (تحقق من الاتصال)")); }
  });
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
