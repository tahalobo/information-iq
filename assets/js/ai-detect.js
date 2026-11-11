/* ==========================================================
   المحقق الذكي: محرك كشف الصور المولّدة بالذكاء الاصطناعي
   - الأدلة داخل الملف تأتي من provenance.js
   - النماذج تعمل داخل المتصفح (ONNX في Web Worker)، تُحمَّل مرة واحدة وتُحفظ في الجهاز
   - الحكم مبني فقط على ما أثبت اختبارُنا أنه يفرّق فعلاً بين الحقيقي والمولّد.
     مؤشرات «الضوضاء» و«الطيف الترددي» و«ELA» و«الألوان» أُزيلت من الحكم:
     في الاختبار لم تفرّق بين النوعين، وكانت تضلّل أكثر مما تفيد.
   ========================================================== */
(function () {
  "use strict";

  /* ---------------- 1) حقائق الملف ---------------- */
  const STD_LUMA = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
  const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
  /* جودة JPEG من جدول التكميم، وهل الجدول قياسي (برنامج/منصة) أم خاص (كاميرا) */
  function jpegQuality(d) {
    if (!(d[0] === 0xFF && d[1] === 0xD8)) return null;
    let i = 2;
    while (i + 4 < d.length) {
      if (d[i] !== 0xFF) return null;
      const m = d[i + 1]; const len = (d[i + 2] << 8) | d[i + 3];
      if (m === 0xDA) return null;
      if (m === 0xDB) {
        const pq = d[i + 4] >> 4, tq = d[i + 4] & 15;
        if (pq === 0 && tq === 0) {
          const t = new Array(64); for (let k = 0; k < 64; k++) t[ZZ[k]] = d[i + 5 + k];
          let best = { q: 0, err: Infinity };
          for (let q = 1; q <= 100; q++) {
            const s = q < 50 ? 5000 / q : 200 - 2 * q; let err = 0;
            for (let k = 0; k < 64; k++) err += Math.abs(Math.min(255, Math.max(1, Math.floor((STD_LUMA[k] * s + 50) / 100))) - t[k]);
            if (err < best.err) best = { q, err };
          }
          return { quality: best.q, standard: best.err === 0 };
        }
      }
      i += 2 + len;
    }
    return null;
  }

  async function sha256(buf) {
    try { const h = await crypto.subtle.digest("SHA-256", buf); return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join(""); } catch { return ""; }
  }

  function canvasOf(src, w, h, sx = 0, sy = 0, sw = src.width, sh = src.height) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingQuality = "high"; x.drawImage(src, sx, sy, sw, sh, 0, 0, w, h);
    return { c, x, data: x.getImageData(0, 0, w, h).data };
  }

  /* ---------------- 2) تحليل الألوان (وصفي، لا يدخل في الحكم) ---------------- */
  const COLOR_NAMES = [[0, "أحمر"], [20, "برتقالي"], [45, "أصفر"], [70, "أخضر مصفر"], [100, "أخضر"], [160, "تركوازي"], [190, "سماوي"], [215, "أزرق"], [255, "بنفسجي"], [290, "أرجواني"], [320, "وردي"], [345, "أحمر"]];
  function rgb2hsv(r, g, b) {
    r /= 255; g /= 255; b /= 255; const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0; if (d) { h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h *= 60; if (h < 0) h += 360; }
    return [h, mx ? d / mx : 0, mx];
  }
  function colorName(r, g, b) {
    const [h, s, v] = rgb2hsv(r, g, b);
    if (v < .16) return "أسود"; if (s < .12) return v > .88 ? "أبيض" : v > .55 ? "رمادي فاتح" : "رمادي داكن";
    if (h >= 15 && h < 45 && v < .6) return "بني";
    let name = COLOR_NAMES[0][1]; for (const [deg, n] of COLOR_NAMES) if (h >= deg) name = n;
    return (v < .45 ? name + " داكن" : s < .35 ? name + " باهت" : name);
  }
  const hex = (r, g, b) => "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

  function colors(bmp) {
    const k = Math.min(1, 640 / Math.max(bmp.width, bmp.height));
    const w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const { data } = canvasOf(bmp, w, h); const n = w * h;
    const hR = new Uint32Array(256), hG = new Uint32Array(256), hB = new Uint32Array(256), hL = new Uint32Array(256), hue = new Float32Array(12);
    let sr = 0, sg = 0, sb = 0, sat = 0, hiSat = 0, rg = 0, yb = 0, rg2 = 0, yb2 = 0, lo = 0, hi = 0, l1 = 0, l2 = 0;
    const samples = [];
    for (let i = 0; i < n; i++) {
      const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
      hR[r]++; hG[g]++; hB[b]++; const L = Math.round(.299 * r + .587 * g + .114 * b); hL[L]++;
      sr += r; sg += g; sb += b; l1 += L; l2 += L * L;
      const [hh, s, v] = rgb2hsv(r, g, b); sat += s; if (s > .6 && v > .3) hiSat++;
      if (s > .15 && v > .15) hue[Math.floor(hh / 30) % 12] += s;
      const a = r - g, c = .5 * (r + g) - b; rg += a; yb += c; rg2 += a * a; yb2 += c * c;
      if (L <= 2) lo++; if (L >= 253) hi++;
      if (i % 7 === 0) samples.push([r, g, b]);
    }
    const mrg = rg / n, myb = yb / n;
    const colorfulness = Math.sqrt((rg2 / n - mrg * mrg) + (yb2 / n - myb * myb)) + .3 * Math.sqrt(mrg * mrg + myb * myb);
    const lmean = l1 / n, contrast = Math.sqrt(Math.max(0, l2 / n - lmean * lmean));
    let first = 0, last = 255; while (first < 255 && !hL[first]) first++; while (last > 0 && !hL[last]) last--;
    let gaps = 0; for (let i = first; i <= last; i++) if (!hL[i]) gaps++;
    const K = Math.min(6, samples.length); let cents = [];
    for (let j = 0; j < K; j++) cents.push([...samples[Math.floor((j + .5) * samples.length / K)]]);
    const assign = new Uint8Array(samples.length);
    for (let it = 0; it < 10; it++) {
      const acc = cents.map(() => [0, 0, 0, 0]);
      samples.forEach((p, i) => { let bi = 0, bd = Infinity; cents.forEach((c, j) => { const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2; if (d < bd) { bd = d; bi = j; } }); assign[i] = bi; const a = acc[bi]; a[0] += p[0]; a[1] += p[1]; a[2] += p[2]; a[3]++; });
      cents = acc.map((a, j) => a[3] ? [a[0] / a[3], a[1] / a[3], a[2] / a[3]] : cents[j]);
    }
    const counts = new Array(K).fill(0); assign.forEach((a) => counts[a]++);
    const palette = cents.map((c, j) => ({ hex: hex(...c), name: colorName(...c), pct: counts[j] / samples.length })).filter((p) => p.pct > .01).sort((a, b) => b.pct - a.pct);
    return {
      hist: { r: hR, g: hG, b: hB, l: hL }, hue, palette,
      mean: hex(sr / n, sg / n, sb / n), saturation: sat / n, hiSat: hiSat / n, colorfulness, brightness: lmean / 255, contrast,
      clipLow: lo / n, clipHigh: hi / n, gaps, range: [first, last], temperature: (sr - sb) / n
    };
  }

  /* ---------------- 3) نماذج الكشف ---------------- */
  const sigmoid = (x) => 1 / (1 + Math.exp(-x));
  const IMAGENET = { mean: [.485, .456, .406], std: [.229, .224, .225] };
  /* hi: من هذه الدرجة فما فوق يقول النموذج «مولّدة»، lo: منها فما دون يقول «لا مؤشرات».
     القيم مأخوذة من اختبارنا (انظر TEST أدناه)، لا من ادّعاءات أصحاب النماذج. */
  const MODELS = [
    { id: "cf", primary: true, lite: true, name: "Community Forensics", by: "OwensLab · نسخة Thermostatic 2026 (MIT)", size: 44,
      url: "https://huggingface.co/Thermostatic/community-forensics-frontier-detector-2026-08/resolve/main/community_forensics_frontier_fp16.onnx",
      input: 384, short: 440, ...IMAGENET, hi: .85, lo: .15,
      // النموذج يُخرج قيمة خام واحدة. في اختبارنا: الصور الحقيقية لم تتجاوز 4.1، ومعظم المولّدة فوق 6.4
      prob: (l) => sigmoid((l[0] - 4.25) / 1.25),
      desc: "الأدق في اختبارنا، وهو الذي يقود الحكم. مدرَّب على صور مولّدات 2025 و2026." },
    { id: "swin", name: "SwinV2 Detector", by: "haywoodsloan (Apache-2.0)", size: 199,
      url: "https://huggingface.co/SoldadoXara/ai-image-detector-deploy-ONNX/resolve/main/onnx/model_uint8.onnx",
      input: 256, squash: true, ...IMAGENET, hi: .9, lo: .1,
      prob: (l) => { const mx = Math.max(...l); const e = l.map((x) => Math.exp(x - mx)); return e[0] / e.reduce((a, b) => a + b, 0); },
      desc: "نموذج ثانٍ مستقل ببنية مختلفة، دوره التأكيد: رصده يرفع الثقة، لكنه يفوّت نحو ربع الصور المولّدة فسكوته لا يبرّئ الصورة، واتهم مرة مشهداً ثلاثي الأبعاد فرصده وحده لا يكفي." }
  ];
  /* نتائج اختبارنا الفعلي، تُعرض للزائر كما هي */
  const TEST = {
    date: "2026-11", nAi: 49, nReal: 47,
    summary: "اختبرنا الأداة (الوضع الشامل) في تشرين الثاني 2026 على 96 صورة: 49 مولّدة من نحو 12 مولّداً (منها GPT-image وMidjourney 7 وFlux 2 وZ-Image وDALL·E 3 وSDXL وGrok) و47 غير مولّدة (صور كاميرات وصور صحفية ورسوم وصور من أرشيفنا). ربعها (25 صورة) لم يدخل في ضبط العتبات. العينة صغيرة، وبعض المولّدات من فئات تدرّب عليها النموذج، فتوقّع دقة أقل مع صور الواقع.",
    rows: [
      ["مولّدة قالت عنها «على الأرجح مولّدة»", "40 من 49 (82%)"],
      ["مولّدة قالت عنها «مشبوهة» أو «غير محسومة»", "7 من 49 (14%)"],
      ["مولّدة أفلتت تماماً («لا مؤشرات»)", "2 من 49 (4%)"],
      ["غير مولّدة قالت عنها «على الأرجح مولّدة»", "0 من 47"],
      ["غير مولّدة قالت عنها «مشبوهة» أو «غير محسومة»", "5 من 47 (11%): رسم رقمي، مشهد ثلاثي الأبعاد، لقطة من فيلم، وصورتا كاميرا"],
      ["غير مولّدة قالت عنها «لا مؤشرات»", "42 من 47 (89%)"]
    ],
    likely: "في اختبارنا قالت الأداة «على الأرجح مولّدة» عن 40 صورة وكانت محقّة فيها كلها، ولم تقلها عن أي صورة غير مولّدة من 47. لكن العينة صغيرة، والخطأ وارد خصوصاً مع الرسوم الرقمية والمشاهد ثلاثية الأبعاد والصور المعدّلة بقوة والفلاتر التجميلية.",
    clean: "في اختبارنا أفلتت صورتان مولّدتان من 49 دون أي إنذار، و7 أخرى خرجت «مشبوهة» أو «غير محسومة». المولّدات الأحدث من تاريخ الاختبار، والصور التي أُعيد ضغطها مراراً، تفلت بنسبة أعلى.",
    removed: "حذفنا من الحكم كل ما فشل في المرحلة الأولى من الاختبار (71 صورة): نموذج SMOGY (اتهم 6 صور حقيقية من 37)، ونموذج SigLIP (فوّت 14 مولّدة من 34)، ومؤشرات الضوضاء والطيف الترددي وELA والألوان (لم تفرّق بين الحقيقي والمولّد)."
  };

  const CACHE = "iq-ai-models-v1";
  let worker = null, seq = 0; const jobs = {};
  function getWorker() {
    if (worker) return worker;
    worker = new Worker("assets/js/ai-worker.js");
    worker.onmessage = (e) => {
      const j = jobs[e.data.id]; if (!j) return;
      if (e.data.progress != null) { j.onProgress && j.onProgress(e.data.progress, e.data.cached); return; }
      delete jobs[e.data.id]; e.data.error ? j.rej(new Error(e.data.error)) : j.res(e.data.logits);
    };
    worker.onerror = () => { Object.keys(jobs).forEach((k) => { jobs[k].rej(new Error("تعطّل محرك التشغيل")); delete jobs[k]; }); worker = null; };
    return worker;
  }

  /* مناطق الصورة التي يراها النموذج، كما اختُبر تماماً */
  function viewsFor(bmp, m) {
    const short = Math.min(bmp.width, bmp.height), long = Math.max(bmp.width, bmp.height);
    const centre = (side) => [(bmp.width - side) / 2, (bmp.height - side) / 2, side, side];
    if (!m.squash) return [centre(short * m.input / m.short)];          // تصغير الضلع القصير ثم قص المربع الأوسط
    const v = [[0, 0, bmp.width, bmp.height]];                           // الصورة كاملة
    if (long / short > 1.25) v.push(centre(short));                      // + المربع الأوسط للصور المستطيلة
    return v;
  }
  function tensorFor(bmp, m, view) {
    const S = m.input;
    const { data } = canvasOf(bmp, S, S, ...view);
    const f = new Float32Array(3 * S * S);
    for (let i = 0; i < S * S; i++) for (let ch = 0; ch < 3; ch++) f[ch * S * S + i] = (data[i * 4 + ch] / 255 - m.mean[ch]) / m.std[ch];
    return f;
  }
  /** يعيد احتمال التوليد المعايَر (0..1) حسب النموذج */
  async function classify(bmp, m, onProgress) {
    const ps = [];
    for (const view of viewsFor(bmp, m)) {
      const data = tensorFor(bmp, m, view);
      ps.push(await new Promise((res, rej) => {
        const id = ++seq; jobs[id] = { res: (l) => res(m.prob(l)), rej, onProgress };
        getWorker().postMessage({ id, model: m.id, url: m.url, data, size: m.input }, [data.buffer]);
      }));
    }
    return ps.reduce((a, b) => a + b, 0) / ps.length;
  }

  async function cachedModels() {
    try { const c = await caches.open(CACHE); const keys = await c.keys(); return MODELS.filter((m) => keys.some((k) => k.url === m.url)).map((m) => m.id); } catch { return []; }
  }
  /* احذف من الجهاز ملفات النماذج التي أُلغيت (كانت ستبقى تأكل مساحة التخزين) */
  async function pruneCache() {
    try {
      for (const name of await caches.keys()) if (/^iq-ai-models/.test(name) && name !== CACHE) await caches.delete(name);
      const c = await caches.open(CACHE); for (const k of await c.keys()) if (!MODELS.some((m) => m.url === k.url)) await c.delete(k);
    } catch { /* ignore */ }
  }
  async function clearModels() { try { await caches.delete(CACHE); } catch { /* ignore */ } if (worker) { worker.terminate(); worker = null; } }

  /* ---------------- 4) الحكم ---------------- */
  const GEN_SIZES = ["512x512", "768x768", "1024x1024", "1024x1792", "1792x1024", "1024x1536", "1536x1024", "896x1152", "1152x896", "832x1216", "1216x832", "768x1344", "1344x768", "896x1344", "1344x896", "1456x816", "816x1456", "1232x928", "928x1232", "2048x2048", "1536x640", "640x1536", "1408x704"];
  const voteOf = (m, p) => (p >= m.hi ? "ai" : p <= m.lo ? "clean" : "unsure");

  /**
   * r = { prov, exif, hasExif, w, h, jpeg, models:[{id,p}], name }
   * يعيد الحكم مع قائمة «لماذا» مرتّبة، ودرجة الثقة، وحدود النتيجة.
   */
  function verdict(r) {
    const P = r.prov, ex = r.exif || {}; const why = [];
    // dir: +1 يدعم التوليد، -1 يدعم أنها حقيقية، 0 معلومة. s: قاطع / قوي / متوسط / ضعيف / معلومة
    const add = (dir, s, t, d) => why.push({ dir, s, t, d });

    /* ---- (أ) أدلة داخل الملف ---- */
    let hard = null;
    const gens = P.generators.map((g) => g.name).join("، ");
    if (P.sourceType === "ai") hard = { kind: "ai", t: "الملف نفسه يصرّح بأنه مولّد بالذكاء الاصطناعي", d: `وسم IPTC «trainedAlgorithmicMedia» موجود في ${P.sourceTypeFrom}. هذا هو الوسم الرسمي الذي تكتبه أدوات مثل ChatGPT وGemini وMeta AI وAdobe Firefly وMidjourney في صورها.` };
    else if (P.details) hard = { kind: "ai", t: "إعدادات التوليد محفوظة داخل الملف", d: `وجدنا في ${P.details.where} الأمر النصي وعدد الخطوات وقيمة Seed. هذه البيانات لا تكتبها إلا برامج التوليد (Stable Diffusion / ComfyUI).` };
    else if (P.generators.length) hard = { kind: "ai", t: `بصمة مولّد صور: ${gens}`, d: `اسم أداة التوليد مكتوب في حقل «${P.generators[0].where}» داخل الملف${P.generators[0].value ? ` (${P.generators[0].value})` : ""}.` };
    else if (P.sourceType === "composite-ai") hard = { kind: "edit", t: "الملف يصرّح بأن أجزاء منه صُنعت بالذكاء الاصطناعي", d: "وسم «compositeWithTrainedAlgorithmicMedia»: صورة أُضيفت إليها أو عُدّلت فيها عناصر بنموذج توليدي (مثل Generative Fill أو Magic Editor). قد يكون أصلها حقيقياً." };
    if (hard && P.sourceType === "composite-ai" && hard.kind === "ai" && !P.details) hard.kind = "edit";
    if (hard) add(1, "قاطع", hard.t, hard.d);

    if (P.c2pa) {
      const c = P.c2pa; const who = [c.generator, ...c.agents].filter(Boolean).join(" · ");
      add(0, "معلومة", "الملف يحمل «بيانات اعتماد المحتوى» C2PA", `${who ? `الأداة المسجّلة: ${who}. ` : ""}${c.signers.length ? `الجهة الموقّعة: ${c.signers.slice(0, 2).join("، ")}. ` : ""}نقرأ محتوى السجل لكننا لا نتحقق من صحة التوقيع الرقمي؛ افعل ذلك في الموقع الرسمي contentcredentials.org/verify.`);
    }
    const capture = P.sourceType === "capture";
    if (capture) add(-1, P.c2pa ? "قوي" : "متوسط", "الملف يصرّح بأنه التُقط بكاميرا", `وسم «${P.sourceTypeRaw}» في ${P.sourceTypeFrom}.${P.c2pa ? " وهو مدعوم بسجل C2PA موقّع." : " لكنه وسم نصي يمكن لأي شخص كتابته."}`);
    if (P.aiEditors.length) add(1, "متوسط", `عولجت بتطبيق ذكاء اصطناعي: ${P.aiEditors.map((e) => e.name).join("، ")}`, "تطبيقات التحسين والتكبير تعيد «توليد» التفاصيل (البشرة، العيون، الخلفية). قد يكون أصل الصورة حقيقياً لكن ما تراه ليس ما التقطته الكاميرا تماماً.");
    if (P.editors.length) add(0, "معلومة", `حُفظت ببرنامج تعديل: ${P.editors.map((e) => e.name).join("، ")}`, "هذا لا يعني التوليد ولا التزوير: المصورون المحترفون يمرّرون صورهم على هذه البرامج. لكنه يعني أن الملف ليس خاماً من الكاميرا.");

    /* ---- (ب) بيانات الكاميرا ---- */
    const camFields = ["Make", "Model", "ExposureTime", "FNumber", "ISO", "FocalLength", "DateTimeOriginal"].filter((k) => ex[k] != null).length;
    const cam = [ex.Make, ex.Model].filter(Boolean).join(" ");
    const fullCam = camFields >= 5 && !!cam;
    if (fullCam) add(-1, "متوسط", `بيانات كاميرا كاملة: ${cam}`, `الملف يحمل إعدادات التعريض والعدسة والتاريخ${P.hasMakerNote ? " وملاحظات المصنّع (MakerNote)" : ""}. المولّدات لا تكتب هذا. لكن هذه البيانات يمكن نسخها من صورة أخرى، فهي قرينة لا دليل.`);
    else if (camFields >= 2 && cam) add(-1, "ضعيف", `بيانات كاميرا جزئية: ${cam}`, "بعض حقول التصوير موجودة فقط.");

    /* ---- (ج) من أين جاء الملف ---- */
    const plat = P.platform; const hasAnyMeta = r.hasExif || P.fields.length > 0 || !!P.c2pa;
    if (plat && plat.screenshot) add(0, "معلومة", "الملف لقطة شاشة", "لقطة الشاشة صورة جديدة لا تحمل أي بيانات من الأصل، وتُضعف دقة النماذج. إن استطعت، افحص الملف الأصلي.");
    else if (plat) add(0, "معلومة", `الملف مرّ على ${plat.name}`, `(${plat.why}). هذه المنصات تحذف بيانات الكاميرا وبصمات المولّدات وتعيد ضغط الصورة، لذلك غياب البيانات هنا لا يدل على شيء.`);
    else if (!hasAnyMeta) add(0, "معلومة", "الملف بلا أي بيانات وصفية", "لا بيانات كاميرا ولا بصمة مولّد. هذا شائع جداً في الصور المتداولة (المنصات تحذفها) وفي الصور المولّدة أيضاً، فلا يرجّح أي احتمال.");

    /* ---- (د) النماذج ---- */
    const ms = (r.models || []).map((x) => { const m = MODELS.find((k) => k.id === x.id); return { ...x, name: m.name, by: m.by, hi: m.hi, lo: m.lo, vote: voteOf(m, x.p) }; });
    // النموذج الأساسي يقود، والثاني يؤكّد: سكوت الثاني لا يلغي رصد الأساسي (فهو يفوّت كثيراً)، لكن رصده يرفع الثقة
    const A = ms.find((m) => MODELS.find((k) => k.id === m.id).primary), B = ms.find((m) => m !== A);
    let agree = "none";
    if (A) {
      const b = B ? B.vote : null;
      agree = A.vote === "ai" ? (b === "ai" ? "ai" : b ? "ai-one" : "ai-solo")
        : A.vote === "unsure" ? (b === "ai" ? "lean" : "unsure")
        : b === "ai" ? "split" : b === "unsure" ? "unsure" : "clean";
    }
    ms.forEach((m) => {
      const pc = Math.round(m.p * 100) + "%";
      if (m.vote === "ai") add(1, "قوي", `نموذج ${m.name} يرصد توليداً (${pc})`, `درجته أعلى من عتبة «مولّدة» (${Math.round(m.hi * 100)}%).`);
      else if (m.vote === "clean") add(-1, "ضعيف", `نموذج ${m.name} لا يرصد توليداً (${pc})`, "غياب الرصد أضعف من الرصد: المولّدات الحديثة تفلت أحياناً من النماذج.");
      else add(0, "معلومة", `نموذج ${m.name} متردد (${pc})`, `الدرجة بين عتبة «لا مؤشرات» (${Math.round(m.lo * 100)}%) وعتبة «مولّدة» (${Math.round(m.hi * 100)}%).`);
    });
    if (GEN_SIZES.includes(`${r.w}x${r.h}`) && !fullCam) add(1, "ضعيف", `المقاس ${r.w}×${r.h} مقاس افتراضي لمولّدات الصور`, "في اختبارنا حملت 20 من 34 صورة مولّدة أحد هذه المقاسات مقابل صورة حقيقية واحدة من 37 (في المرحلة الأولى من الاختبار). لكنه قرينة ضعيفة: أي صورة يمكن قصّها إلى هذا المقاس، والمنصات تغيّر المقاس عند الرفع. لا يغيّر الحكم.");
    const small = Math.min(r.w || 0, r.h || 0) < 320;
    if (small && r.w) add(0, "معلومة", `الصورة صغيرة جداً (${r.w}×${r.h})`, "في الصور الصغيرة تضيع الآثار التي تبحث عنها النماذج، فتنخفض الدقة كثيراً.");

    /* ---- الخلاصة ---- */
    let level, label, confidence, note = "";
    if (hard && hard.kind === "ai") { level = "ai-proof"; label = "مولّدة بالذكاء الاصطناعي"; confidence = "certain"; }
    else if (hard) { level = "edit-proof"; label = "معدّلة بالذكاء الاصطناعي"; confidence = "certain"; }
    else if (agree === "ai" || agree === "ai-one" || agree === "ai-solo") {
      if (capture && P.c2pa) { level = "unsure"; label = "غير محسومة: النماذج ترصد توليداً لكن الملف موثّق ككاميرا"; confidence = "low"; note = "تعارض بين النماذج وسجل C2PA. تحقق من السجل رسمياً."; }
      else if (fullCam) { level = "suspect"; label = "مشبوهة: النماذج ترصد توليداً رغم وجود بيانات كاميرا"; confidence = "low"; note = "قد تكون صورة حقيقية أخطأت فيها النماذج، أو صورة مولّدة أُلصقت بها بيانات كاميرا، أو صورة حقيقية عُدّلت بقوة."; }
      else {
        level = "ai-likely"; label = "على الأرجح مولّدة بالذكاء الاصطناعي"; confidence = agree === "ai" && !small ? "high" : "medium";
        if (agree === "ai-one") note = "نموذج واحد فقط رصد التوليد بوضوح والآخر لم يؤكّد، لذلك الثقة متوسطة.";
        if (agree === "ai-solo") note = "الحكم مبني على نموذج واحد (الوضع الخفيف). شغّل الوضع الشامل لتحصل على رأي ثانٍ مستقل.";
      }
    } else if (agree === "lean") { level = "suspect"; label = "مشبوهة: مؤشرات توليد غير مكتملة"; confidence = "low"; note = "النموذج الثاني يرصد توليداً والأساسي متردد. في اختبارنا أصابت هذه الحالة مرتين وأخطأت مرة (مشهد ثلاثي الأبعاد من صنع مصمّم)."; }
    else if (agree === "split") { level = "suspect"; label = "مشبوهة: النموذج الثاني يرصد توليداً والأساسي لا"; confidence = "low"; note = "النموذجان مختلفان. لا نخفي الخلاف بمتوسط حسابي."; }
    else if (agree === "unsure") { level = "unsure"; label = "غير محسومة"; confidence = "low"; }
    else if (agree === "clean") {
      if (capture && P.c2pa) { level = "real-likely"; label = "على الأرجح حقيقية"; confidence = "high"; }
      else if (fullCam || capture) { level = "real-likely"; label = "على الأرجح حقيقية"; confidence = "medium"; }
      else { level = "clean"; label = "لم نرصد مؤشرات توليد"; confidence = small ? "low" : "medium"; }
    } else { // لا نماذج
      if (capture && P.c2pa) { level = "real-likely"; label = "على الأرجح حقيقية"; confidence = "medium"; }
      else { level = "unknown"; label = fullCam ? "لا أدلة توليد في الملف (النماذج لم تُشغَّل)" : "لا حكم: لا أدلة في الملف والنماذج لم تُشغَّل"; confidence = "low"; }
    }
    if (hard && agree === "clean") note = "النماذج لم ترصد شيئاً لكن الملف نفسه يحمل الدليل، والدليل المكتوب أقوى من تخمين النماذج.";
    const order = { "قاطع": 0, "قوي": 1, "متوسط": 2, "ضعيف": 3, "معلومة": 4 };
    why.sort((a, b) => order[a.s] - order[b.s]);
    return { level, label, confidence, note, hard, agree, models: ms, why, fullCam, camFields, small };
  }

  window.AIDetect = { jpegQuality, sha256, colors, colorName, MODELS, TEST, classify, cachedModels, pruneCache, clearModels, verdict };
})();
