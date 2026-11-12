/* عامل معالجة الصور: يبقي الصفحة سلسة أثناء ضغط الصور الكبيرة */
importScripts("image-engine.js");
self.onmessage = async (e) => {
  const d = e.data;
  if (d.t !== "job") { ImageEngine.handle(d); return; }
  try { self.postMessage({ t: "done", jobId: d.jobId, res: await ImageEngine.handle(d) }); }
  catch (err) { self.postMessage({ t: "err", jobId: d.jobId, code: err.code || "fail", msg: String(err.message || err) }); }
};
