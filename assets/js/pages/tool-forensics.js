(function () {
  const { $, $$, esc, ic, icons, toast, fmtBytes, dropzone, download, modal, copy } = App;
  const VIEW_MAX = 1600, MAX_PIX = 12e6, SWAP = { 5: 1, 6: 1, 7: 1, 8: 1 };
  let R = null, mode = "find", lensOn = false, elaSeq = 0;
  const gain = { ela: 1, noise: 1, grad: 1 }, base = { ela: 1, noise: 1, grad: 6 }, cache = {};

  /* أرقام الاختبار الفعلي (تُعرض كما هي في أسفل الصفحة): [الحالة، عدد الصور، ما رُصد] */
  const TEST = {
    clean: [["صور فوتوغرافية سليمة (حفظ واحد أو مزدوج، قص، تعديل إضاءة، PNG وWebP)", 80, 0], ["صور من قنوات تيليغرام ومواقع الأخبار", 99, 1], ["لقطات شاشة سليمة", 12, 0]],
    tamper: [["لصق من صورة أخرى، حفظ بجودة عالية أو PNG", 42, 0], ["نسخ-لصق داخل الصورة، حفظ بجودة عالية", 42, 0], ["نسخ-لصق ثم إعادة ضغط كمواقع التواصل", 14, 0], ["لصق ثم حفظ بجودة منخفضة أو إعادة ضغط كمواقع التواصل", 28, 0], ["مسح عنصر بالتنعيم", 28, 0], ["إضافة نص على صورة", 28, 0], ["تغيير رقم في لقطة شاشة", 12, 0]]
  };

  const MODES = {
    find: "المربعات تحدد ما التقطته الفحوص الآلية. كل مربع قرينة تدعوك إلى التدقيق بعينك في ذلك الموضع، لا إدانة. اسحب الشريط لتقارن مع الأصل.",
    ela: "قارن الشبيه بالشبيه: المناطق المتشابهة (سماء بسماء، جدار بجدار) يجب أن تلمع بالقدر نفسه. جسم أو نص يلمع أكثر بكثير من محيط يشبهه ربما أُضيف لاحقاً. الحواف والنصوص تلمع طبيعياً. غيّر الجودة وراقب أين يتبدّل المشهد.",
    grid: "كل نقطة خلية «صوّتت» لشبكة ضغط مزاحة. النقاط المتناثرة ضجيج طبيعي. الكتلة الحمراء المتصلة جزء يحمل شبكة JPEG غير شبكة الصورة: هكذا يبدو الجزء الملصوق. اللون الذهبي المنتشر في كل الصورة معناه أنها قُصّت بعد حفظ سابق.",
    clone: "اللونان يحددان منطقتين متطابقتين، والخط يصل بينهما. إن كان التطابق في حشد أو دخان أو جزء من جسم فقد نُسخ ولُصق. الأشياء المتكررة طبيعياً (بلاط، نوافذ، حروف) تتطابق أيضاً.",
    noise: "للعين فقط. الألوان الدافئة = ضجيج أعلى. ابحث في منطقة هادئة (سماء، جدار، بشرة) عن بقعة أنعم أو أخشن بوضوح من جاراتها. التفاصيل والحواف ترفع الضجيج طبيعياً.",
    grad: "للعين فقط. اللون يدل على اتجاه تغيّر الإضاءة. ابحث عن حافة قص مستقيمة حول جسم، أو هالة، أو جسم مضاء من جهة تخالف ما حوله.",
    orig: "الصورة كما هي، بلا أي تحليل."
  };
  const COL = { grid: "#ff6a5c", clone: "#3fe0c8", ela: "#f2c25b", thumb: "#b58cff" };
  const STR = { strong: ["قرينة قوية", "text-danger", "octagon-alert", "bad"], medium: ["قرينة متوسطة", "text-warn", "alert-triangle", "warn"], weak: ["قرينة ضعيفة", "muted", "circle-help", ""], info: ["معلومة", "muted", "info", ""], ok: ["لا شيء", "text-success", "check-circle-2", ""] };

  /* ---------- Engine (Web Worker, or the same code on the main thread when workers can't draw) ---------- */
  let eng = null;
  function engine() {
    if (eng) return eng;
    const subs = new Set(), emit = (d) => subs.forEach((f) => f(d)); let post;
    if (window.Worker && window.OffscreenCanvas) {
      const w = new Worker("assets/js/forensics-engine.js");
      w.onmessage = (e) => emit(e.data); w.onerror = (e) => emit({ type: "error", message: e.message || "worker" });
      post = (m, tr) => w.postMessage(m, tr || []);
    } else {
      const ready = new Promise((res, rej) => { const s = document.createElement("script"); s.src = "assets/js/forensics-engine.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
      post = (m) => ready.then(() => window.ForensicsEngine.handle(m, emit), () => emit({ type: "error", message: "engine" }));
    }
    return (eng = { post, on: (f) => { subs.add(f); return () => subs.delete(f); } });
  }
  const ask = (msg, tr, want, onProgress) => new Promise((res, rej) => {
    const e = engine(), off = e.on((d) => {
      if (d.type === "progress") onProgress && onProgress(d);
      else if (d.type === "error") { off(); rej(new Error(d.message)); }
      else if (d.type === want && (msg.id === undefined || d.id === msg.id)) { off(); res(d); }
    });
    e.post(msg, tr);
  });

  /* ---------- Upload ---------- */
  dropzone($("#dz"), $("#file"), (files) => { const f = files.find((x) => x.type.startsWith("image/")) || files[0]; if (f) run(f); });
  $("#again").addEventListener("click", () => {
    $("#workspace").hidden = true; $("#upload").hidden = false; R = null; engine().post({ type: "reset" });
    scrollTo({ top: $("#upload").getBoundingClientRect().top + scrollY - 120, behavior: "smooth" });
  });
  const mk = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const STEPS = ["decode", "ela", "grid", "clone", "noise", "meta"];
  function setStep(k, p) {
    const i = STEPS.indexOf(k);
    $$("#steps li").forEach((li, j) => { li.className = j < i || k === "done" ? "done" : j === i ? "on" : ""; const b = li.querySelector("b"); if (b) b.textContent = j === i && p ? `${Math.round(p * 100)}%` : ""; });
  }

  async function run(file) {
    if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp|gif|bmp|avif)$/i.test(file.name)) { toast("اختر ملف صورة", "image-off"); return; }
    $("#upload").hidden = true; $("#workspace").hidden = true; $("#progress").hidden = false; setStep("decode");
    const fail = (msg) => { $("#progress").hidden = true; $("#upload").hidden = false; toast(msg, "alert-triangle"); };
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "none" }); } catch { try { bmp = await createImageBitmap(file); } catch { return fail("تعذّر فتح هذه الصورة. جرّب صيغة JPG أو PNG"); } }
    let w = bmp.width, h = bmp.height, shrunk = 1;
    if (w * h > MAX_PIX) {   // too big for a phone's memory: analyse a reduced copy and say so (compression traces weaken)
      shrunk = Math.sqrt(MAX_PIX / (w * h)); const c = mk(Math.round(w * shrunk), Math.round(h * shrunk)), x = c.getContext("2d");
      x.imageSmoothingQuality = "high"; x.drawImage(bmp, 0, 0, c.width, c.height); bmp.close(); bmp = await createImageBitmap(c); w = bmp.width; h = bmp.height;
    }
    const f = Math.max(1, Math.ceil(Math.max(w, h) / VIEW_MAX)), vw = Math.ceil(w / f), vh = Math.ceil(h / f), orig = mk(vw, vh);
    { const x = orig.getContext("2d", { willReadFrequently: true }); x.imageSmoothingQuality = "high"; x.drawImage(bmp, 0, 0, vw, vh); }
    { const c = $("#pg-thumb"), s = Math.min(1, 220 / Math.max(vw, vh)); c.width = vw * s; c.height = vh * s; c.getContext("2d").drawImage(orig, 0, 0, c.width, c.height); }
    const bytes = await file.arrayBuffer();
    let sha = ""; try { sha = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((b) => b.toString(16).padStart(2, "0")).join(""); } catch { /* insecure context */ }
    let res;
    try { res = await ask({ type: "analyze", bytes, bitmap: bmp, viewMax: VIEW_MAX }, [bytes, bmp], "result", (d) => setStep(d.step, d.p)); }
    catch (e) { console.error(e); return fail("تعذّر تحليل هذه الصورة"); }
    setStep("meta");
    const meta = await readMeta(file);
    // the engine works on pixels as stored; turn them for display only when the browser did not
    const sof = res.struct.sof, stored = !sof || sof.w === sof.h || (sof.w > sof.h) === (w > h);
    R = { ...res, file, sha, shrunk, orig, meta, orient: stored && meta.orient > 1 ? meta.orient : 1, turned: !stored && meta.orient > 1 ? meta.orient : 1 };
    R.dw = SWAP[R.orient] ? vh : vw; R.dh = SWAP[R.orient] ? vw : vh;
    R.thumb = await thumbCheck(file);
    R.A = assess();
    setStep("done"); await new Promise((r) => setTimeout(r, 250));
    $("#progress").hidden = true; $("#workspace").hidden = false;
    for (const k in cache) delete cache[k];
    autoGains(); paintOrig(); setMode(R.A.items.some((i) => i.regions && i.regions.length) ? "find" : "ela");
    renderSummary(); renderInfo(); renderThumb();
    icons(); if (window.FX) FX.refresh($("#workspace"));
    const y = $("#workspace").getBoundingClientRect().top + scrollY - 100; window.FX ? FX.scrollTo(y) : scrollTo({ top: y, behavior: "smooth" });
  }

  /* ---------- Metadata we need as evidence (the full reading lives in tool-metadata) ---------- */
  const EDITORS = /photoshop|lightroom|gimp|snapseed|picsart|canva|facetune|meitu|photoroom|pixlr|affinity|paint\.net|photopea|faceapp|remini|lensa|vsco|polarr|fotor|capcut|inshot|photo ?director|corel|krita|darktable|luminar|pixelmator|airbrush/i;
  async function readMeta(file) {
    const out = { orient: 1 };
    if (!window.exifr) return out;
    try { out.orient = (await exifr.orientation(file)) || 1; } catch { /* none */ }
    let m = null; try { m = await exifr.parse(file, { tiff: true, exif: true, xmp: true, icc: false, iptc: false, mergeOutput: true }); } catch { m = null; }
    if (!m) return out;
    const sw = [...new Set([m.Software, m.CreatorTool, m.HistorySoftwareAgent, m.ProcessingSoftware].flat().filter(Boolean).map(String))].join(" · ");
    out.software = sw; out.editor = (sw.match(EDITORS) || [""])[0];
    out.make = [m.Make, m.Model].filter(Boolean).join(" ");
    const d = (v) => (v instanceof Date && !isNaN(v) ? v : null);
    out.taken = d(m.DateTimeOriginal) || d(m.CreateDate); out.modified = d(m.ModifyDate) || d(m.MetadataDate);
    return out;
  }

  /* ---------- Embedded EXIF thumbnail vs. the picture ---------- */
  async function thumbCheck(file) {
    if (!window.exifr || !exifr.thumbnail) return null;
    let buf; try { buf = await exifr.thumbnail(file); } catch { return null; }
    if (!buf || !buf.byteLength) return null;
    let tb; try { tb = await createImageBitmap(new Blob([buf], { type: "image/jpeg" })); } catch { return null; }
    const lum = (c) => { const d = c.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, c.width, c.height).data, o = new Float32Array(c.width * c.height); for (let i = 0, j = 0; i < o.length; i++, j += 4) o[i] = .299 * d[j] + .587 * d[j + 1] + .114 * d[j + 2]; return o; };
    // cameras pad the thumbnail with black bars when the photo is not 4:3: measure them and ignore them
    // the thumbnail is stored unturned; when the browser turned the picture for us, turn the thumbnail the same way
    const o = R.turned, sw = o >= 5, t0 = mk(sw ? tb.height : tb.width, sw ? tb.width : tb.height), tx = t0.getContext("2d");
    if (o === 3 || o === 4) tx.setTransform(-1, 0, 0, -1, tb.width, tb.height); else if (o === 6 || o === 5) tx.setTransform(0, 1, -1, 0, tb.height, 0); else if (o === 8 || o === 7) tx.setTransform(0, -1, 1, 0, 0, tb.width);
    tx.drawImage(tb, 0, 0); const L = lum(t0), tw = t0.width, th = t0.height;
    const rowMean = (y) => { let s = 0; for (let x = 0; x < tw; x++) s += L[y * tw + x]; return s / tw; }, colMean = (x) => { let s = 0; for (let y = 0; y < th; y++) s += L[y * tw + x]; return s / th; };
    let top = 0, bot = th, lef = 0, rig = tw;
    while (top < th / 3 && rowMean(top) < 14) top++; while (bot > th * 2 / 3 && rowMean(bot - 1) < 14) bot--;
    while (lef < tw / 3 && colMean(lef) < 14) lef++; while (rig > tw * 2 / 3 && colMean(rig - 1) < 14) rig--;
    const cw = rig - lef, chh = bot - top, ta = cw / chh, ia = R.orig.width / R.orig.height;
    const aspectDiff = Math.abs(ia - ta) / ta;
    const W = 96, H = Math.max(8, Math.round(W / ta)), a = mk(W, H), b = mk(W, H);
    a.getContext("2d").drawImage(t0, lef, top, cw, chh, 0, 0, W, H); { const x = b.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(R.orig, 0, 0, W, H); }
    const A = lum(a), B = lum(b), n = W * H; let ma = 0, mb = 0; for (let i = 0; i < n; i++) { ma += A[i]; mb += B[i]; } ma /= n; mb /= n;
    let sa = 0, sb = 0, raw = 0; for (let i = 0; i < n; i++) { sa += (A[i] - ma) ** 2; sb += (B[i] - mb) ** 2; raw += Math.abs(A[i] - B[i]); }
    const k = Math.sqrt(sa / Math.max(1e-6, sb));
    // after matching brightness and contrast, a local edit shows as one cell far from its thumbnail while the rest agree
    const G = 6, cell = new Float32Array(G * G), cnt = new Float32Array(G * G); let tot = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x, d = Math.abs(A[i] - ma - (B[i] - mb) * k), c = Math.min(G - 1, (y * G / H) | 0) * G + Math.min(G - 1, (x * G / W) | 0); cell[c] += d; cnt[c]++; tot += d; }
    let worst = 0, wi = 0; for (let c = 0; c < G * G; c++) { cell[c] /= cnt[c] || 1; if (cell[c] > worst) { worst = cell[c]; wi = c; } }
    const sorted = Float32Array.from(cell).sort(), med = sorted[(G * G) >> 1];
    const region = { x: (wi % G) / G * R.w, y: ((wi / G) | 0) / G * R.h, w: R.w / G, h: R.h / G };
    return { url: t0.toDataURL("image/png"), w: tw, h: th, aspectDiff, raw: raw / n, diff: tot / n, worst, med, region, bars: top > 0 || bot < th || lef > 0 || rig < tw };
  }

  /* ---------- What the evidence adds up to ---------- */
  function assess() {
    const items = [], st = R.struct, jpeg = st.fmt === "JPEG", photo = !R.graphic, big = Math.max(R.w, R.h) / R.shrunk;
    const box = (r, label, kind) => ({ x: r.x, y: r.y, w: r.w, h: r.h, label, kind });
    // 1) foreign JPEG grid, packed in one place
    const gr = R.grid ? R.grid.regions : [];
    if (gr.length) items.push({ id: "grid", s: "strong", mode: "grid", title: gr.length === 1 ? "جزء يحمل شبكة ضغط JPEG غير شبكة الصورة" : `${gr.length} أجزاء تحمل شبكة ضغط JPEG غير شبكة الصورة`,
      detail: `خلايا متصلة (${gr.map((r) => r.cells).join("، ")} خلية) تتفق كلها على شبكة 8×8 مزاحة بمقدار (${gr[0].dx}، ${gr[0].dy}) بكسل عن شبكة بقية الصورة. هكذا يبدو جزء قُصّ من صورة JPEG أخرى ولُصق هنا، أو جزء نُسخ من الصورة نفسها وحُرّك. في اختبارنا لم تظهر هذه القرينة في أي صورة سليمة.`,
      regions: gr.map((r, i) => box(r, `شبكة مزاحة ${gr.length > 1 ? i + 1 : ""}`.trim(), "grid")) });
    // 2) copy-move
    const cf = R.clone.found;
    if (cf.length) {
      const regs = cf.flatMap((f, i) => [box(f.a, `متطابق ${i + 1}أ`, "clone"), box(f.b, `متطابق ${i + 1}ب`, "clone")]);
      // big matches were always real copies in our tests; small ones are mostly repeated letters, logos or ornaments
      const bigCopy = cf.some((f) => f.pixels >= 1500 && f.share >= .002), small = !bigCopy && R.clone.shifts < 3;
      if (photo && bigCopy) items.push({ id: "clone", s: "strong", mode: "clone", title: cf.length === 1 ? "منطقتان متطابقتان داخل الصورة" : `${cf.length} أزواج من المناطق المتطابقة`, detail: `وجدنا ${cf.length === 1 ? "منطقة" : "مناطق"} يطابق محتواها منطقة أخرى في الصورة بإزاحة ثابتة (تطابق ${Math.round(cf[0].corr * 100)}%). هذه بصمة نسخ جزء ولصقه، أو إخفاء عنصر بتغطيته بجزء مجاور. تأكد بعينك أن المحتوى ليس متكرراً طبيعياً (بلاط، نوافذ، سياج).`, regions: regs });
      else if (photo && small) items.push({ id: "clone", s: "medium", mode: "clone", title: "تطابق صغير بين موضعين في الصورة", detail: "منطقتان صغيرتان متطابقتان. في اختبارنا كان هذا غالباً حروفاً أو أرقاماً متكررة في نص مضاف فوق الصورة، أو شعاراً أو نقشاً مكرراً، وأحياناً نسخ-لصق صغيراً. انظر ما الذي تطابق.", regions: regs });
      else items.push({ id: "clone", s: "weak", mode: "clone", title: "أجزاء متكررة داخل الصورة", detail: photo ? "وجدنا تطابقات صغيرة بعدة إزاحات مختلفة، وهذا نمط الزخارف والأسطح المتكررة أكثر مما هو نمط النسخ-لصق. افحصه بعينك في خريطة «المنسوخ»." : "الصورة تصميم أو لقطة شاشة، وفيها تتكرر الحروف والأيقونات والخانات طبيعياً، فالتطابق هنا لا يُعدّ دليلاً. انظر فقط إن كان التطابق في رقم أو اسم.", regions: regs });
    }
    // 3) embedded thumbnail
    const t = R.thumb;
    if (t) {
      if (t.worst > 20 && t.worst > t.med * 3.2 && t.aspectDiff < .06) items.push({ id: "thumb", s: "strong", mode: "thumb", title: "جزء من الصورة يختلف عن المصغّرة المحفوظة في الملف", detail: "المصغّرة التي حُفظت داخل الملف لحظة التصوير تطابق الصورة في كل المواضع إلا موضعاً واحداً. هذا يحدث حين تُعدَّل الصورة ببرنامج لا يحدّث المصغّرة. قارن بينهما أسفل الصورة.", regions: [box(t.region, "يخالف المصغّرة", "thumb")] });
      else if (t.aspectDiff >= .06) items.push({ id: "thumb", s: "info", mode: "thumb", title: "أبعاد الصورة تخالف أبعاد المصغّرة المحفوظة", detail: `نسبة العرض إلى الارتفاع تختلف ${Math.round(t.aspectDiff * 100)}% عن المصغّرة المحفوظة داخل الملف: الصورة قُصّت بعد التقاطها. القص وحده ليس تزويراً، لكن انظر في المصغّرة ما الذي أُخرج من الإطار.` });
      else if (t.diff > 14) items.push({ id: "thumb", s: "weak", mode: "thumb", title: "الصورة تختلف عن مصغّرتها في عمومها", detail: "الاختلاف موزّع على الصورة كلها لا في موضع بعينه: نمط فلتر أو تعديل ألوان وإضاءة، لا نمط لصق أو مسح." });
      else items.push({ id: "thumb", s: "ok", mode: "thumb", title: "الصورة تطابق المصغّرة المحفوظة في الملف", detail: "لم يتغيّر محتوى الصورة منذ حُفظت المصغّرة. انتبه: بعض البرامج تعيد توليد المصغّرة بعد التعديل، فالتطابق يطمئن ولا يحسم." });
    }
    // 4) error level
    const er = R.ela.regions;
    if (er.length) {
      const regs = er.map((r, i) => box(r, `مستوى خطأ ${er.length > 1 ? i + 1 : ""}`.trim(), "ela"));
      if (!jpeg || !photo) items.push({ id: "ela", s: "weak", mode: "ela", title: "مناطق بمستوى خطأ أعلى من محيطها", detail: !photo ? "في التصاميم ولقطات الشاشة تلمع النصوص والحواف الحادة طبيعياً، فهذه المناطق لا تعني تعديلاً بمفردها. قارن النص المشبوه بنص آخر من الحجم واللون نفسيهما." : `الملف بصيغة ${st.fmt || "غير JPEG"}، ومستوى الخطأ فيها أضعف دلالة. افحص المناطق المحددة بعينك.`, regions: regs });
      else items.push({ id: "ela", s: "medium", mode: "ela", title: er.length === 1 ? "منطقة تستجيب لإعادة الضغط بغير ما يستجيب محيطها" : `${er.length} مناطق تستجيب لإعادة الضغط بغير ما يستجيب محيطها`, detail: `عند إعادة الحفظ بجودة ${R.ela.q}% تغيّرت هذه المناطق أكثر مما يتوقَّع من تفاصيلها مقارنة ببقية الصورة. قد تكون جزءاً أُضيف أو عُدّل بعد الحفظ، وقد تكون نصاً أو شعاراً أو حافة حادة. افحصها بعينك.`, regions: regs });
    }
    // 5) context that is not evidence of forgery by itself
    if (R.grid && R.grid.global) items.push({ id: "crop", s: "info", mode: "grid", title: "الصورة قُصّت أو أُزيحت بعد حفظ JPEG سابق", detail: `في الصورة كلها أثر شبكة ضغط قديمة مزاحة (${R.grid.global.dx}، ${R.grid.global.dy}) بكسل عن شبكة الملف الحالي. معناه أن الصورة قُصّت من صورة JPEG أكبر ثم حُفظت من جديد. القص ليس تزويراً بحد ذاته، لكنه قد يُخفي ما كان خارج الإطار.` });
    if (!jpeg && R.grid && R.grid.main >= 0) items.push({ id: "wasjpeg", s: "info", mode: "grid", title: `الملف ${st.fmt || ""} لكنه كان JPEG من قبل`, detail: "في البكسلات آثار شبكة ضغط JPEG، أي أن الصورة حُفظت بصيغة JPEG ثم حُوّلت. هذا شائع (لقطة شاشة لصورة، أو تصدير من برنامج)، وهو يعني أيضاً أن الملف ليس الأصل." });
    if (R.meta.editor) items.push({ id: "soft", s: "info", mode: "", title: `مرّت على برنامج تحرير: ${R.meta.editor}`, detail: `مسجّل في بيانات الملف: «${R.meta.software}». لا يعني تزويراً بالضرورة؛ قد يكون قصاً أو تعديل إضاءة.` });
    else if (st.markers && (st.markers.photoshop || st.markers.adobe)) items.push({ id: "soft", s: "info", mode: "", title: "في الملف بصمة برامج Adobe", detail: "بنية الملف تحمل مقاطع يكتبها Photoshop أو Lightroom عند الحفظ. لا يعني تزويراً بالضرورة." });
    // how much evidence can this file still carry?
    const social = jpeg && st.standardTables && !st.markers.exif && big <= 1700 && st.qLuma.q <= 90;
    let cap, capWhy;
    if (!jpeg) { cap = R.grid && R.grid.main >= 0 ? "mid" : "low"; capWhy = R.graphic ? "لقطة شاشة أو تصميم بصيغة غير JPEG: التعديل الرقمي النظيف على نص أو رقم فيها لا يترك أثراً نستطيع قياسه." : `صيغة ${st.fmt || "غير معروفة"}: آثار ضغط JPEG التي نعتمد عليها غير موجودة أو ضعيفة.`; }
    else if (social || (st.qLuma && st.qLuma.q < 80)) { cap = "low"; capWhy = `ملف صغير أعيد ضغطه (جودة ${st.qLuma ? st.qLuma.q : "؟"}%${social ? "، بلا بيانات كاميرا" : ""}): نمط الصور المارّة بمواقع التواصل. إعادة الضغط تمحو أغلب آثار التعديل، فلا نكشف هنا إلا النسخ-لصق الواضح.`; }
    else if (R.shrunk < 1) { cap = "mid"; capWhy = "الصورة كبيرة جداً فحُلّلت نسخة مصغّرة منها، وهذا يُضعف آثار الضغط."; }
    else if (st.qLuma && st.qLuma.q >= 88) { cap = "high"; capWhy = `ملف JPEG بجودة عالية (${st.qLuma.q}%): أفضل حالة للفحص. اللصق والنسخ يتركان فيه غالباً أثراً نلتقطه.`; }
    else { cap = "mid"; capWhy = `ملف JPEG بجودة متوسطة (${st.qLuma ? st.qLuma.q : "؟"}%): بعض الآثار باقٍ وبعضها مُحي.`; }
    const strong = items.filter((i) => i.s === "strong").length, medium = items.filter((i) => i.s === "medium").length;
    const level = strong ? "strong" : medium ? "medium" : "none";
    const head = { strong: ["قرائن قوية على تعديل موضعي", "var(--danger)", "octagon-alert", strong > 1 ? "أكثر من فحص مستقل يشير إلى الموضع نفسه أو إلى مواضع معدّلة. دقّق في المناطق المحددة، وابحث عن الصورة الأصلية قبل أن تنشر." : "فحص واحد على الأقل التقط أثراً لا يظهر عادةً في الصور السليمة. دقّق في المنطقة المحددة، وابحث عن الصورة الأصلية قبل أن تنشر."],
      medium: ["قرائن تستحق التدقيق بالعين", "var(--warn)", "alert-triangle", "ظهرت مناطق شاذة، لكن هذا النوع من القرائن يظهر أحياناً في صور سليمة (نصوص، شعارات، حواف حادة). لا تبنِ عليه حكماً قبل أن تفحص الخرائط بنفسك."],
      none: ["لم تظهر قرائن آلية على تعديل", "var(--info)", "search-check", cap === "high" ? "الفحوص الآلية لم تلتقط شيئاً في ملف يحتفظ عادةً بآثار التعديل. هذا مطمئن وليس شهادة سلامة: التعديل المتقن، والمسح، والنص المضاف قد لا تترك ما نلتقطه." : "هذا <strong>ليس</strong> دليلاً على أن الصورة سليمة: هذا الملف لا يحتفظ إلا بالقليل من آثار التعديل. تصفّح الخرائط بعينك، وابحث عن النسخة الأصلية."] }[level];
    return { items, level, head, cap, capWhy };
  }

  /* ---------- Rendering the maps ---------- */
  const LUT = (() => {
    const stops = [[0, 0, 0, 0], [.18, 18, 28, 110], [.38, 110, 40, 170], [.6, 235, 90, 50], [.82, 255, 205, 80], [1, 255, 255, 235]], out = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) { const t = i / 255; let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++; const a = stops[k], b = stops[k + 1], f = (t - a[0]) / (b[0] - a[0]); for (let c = 0; c < 3; c++) out[i * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * f; }
    return out;
  })();
  const pct = (arr, p) => { const step = Math.max(1, Math.floor(arr.length / 200000)), s = []; for (let i = 0; i < arr.length; i += step) s.push(arr[i]); s.sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 1; };
  function autoGains() { base.ela = 235 / Math.max(8, pct(R.ela.view, .995)); base.noise = 220 / Math.max(.5, pct(R.noise.map, .97)); gain.ela = gain.noise = gain.grad = 1; }
  function heat(vals, w, h, g) {
    const c = mk(w, h), x = c.getContext("2d"), img = x.createImageData(w, h), d = img.data;
    for (let i = 0, j = 0; i < vals.length; i++, j += 4) { const v = Math.max(0, Math.min(255, Math.round(vals[i] * g))) * 3; d[j] = LUT[v]; d[j + 1] = LUT[v + 1]; d[j + 2] = LUT[v + 2]; d[j + 3] = 255; }
    x.putImageData(img, 0, 0); return c;
  }
  const dim = (x, a) => { x.drawImage(R.orig, 0, 0); x.fillStyle = `rgba(3,5,12,${a})`; x.fillRect(0, 0, R.vw, R.vh); };
  function renderNat(m) {   // a map in the picture's stored orientation, at view size
    const { vw, vh, f } = R, c = mk(vw, vh), x = c.getContext("2d");
    if (m === "ela") x.drawImage(heat(R.ela.view, vw, vh, base.ela * gain.ela), 0, 0);
    else if (m === "noise") { const n = R.noise; x.imageSmoothingQuality = "high"; x.drawImage(heat(n.map, n.bw, n.bh, base.noise * gain.noise), 0, 0, n.bw * n.B / f, n.bh * n.B / f); }
    else if (m === "grid") {
      dim(x, .66); const g = R.grid;
      if (g) {
        const s = mk(g.cw, g.ch), sx = s.getContext("2d"), img = sx.createImageData(g.cw, g.ch), d = img.data, P = [[0, 0, 0, 0], [63, 224, 200, 70], [63, 224, 200, 170], [255, 90, 70, 235], [242, 194, 91, 120]];
        for (let i = 0; i < g.map.length; i++) { const p = P[g.map[i]]; d[i * 4] = p[0]; d[i * 4 + 1] = p[1]; d[i * 4 + 2] = p[2]; d[i * 4 + 3] = p[3]; }
        sx.putImageData(img, 0, 0); x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0, g.cw * 8 / f, g.ch * 8 / f);
        x.lineWidth = Math.max(2, vw / 400); x.strokeStyle = COL.grid; g.regions.forEach((r) => x.strokeRect(r.x / f, r.y / f, r.w / f, r.h / f));
      }
    } else if (m === "clone") {
      dim(x, .62); const cl = R.clone;
      if (cl.mask) {
        const s = mk(cl.gw, cl.gh), sx = s.getContext("2d"), img = sx.createImageData(cl.gw, cl.gh), d = img.data;
        for (let i = 0; i < cl.mask.length; i++) { const v = cl.mask[i]; if (!v) continue; const b = v > 8; d[i * 4] = b ? 255 : 63; d[i * 4 + 1] = b ? 122 : 224; d[i * 4 + 2] = b ? 107 : 200; d[i * 4 + 3] = 150; }
        sx.putImageData(img, 0, 0); x.imageSmoothingEnabled = false; x.drawImage(s, 0, 0, cl.gw * cl.k / f, cl.gh * cl.k / f);
        x.lineWidth = Math.max(2, vw / 400); x.setLineDash([x.lineWidth * 4, x.lineWidth * 3]);
        cl.found.forEach((p) => { x.strokeStyle = "#3fe0c8"; x.strokeRect(p.a.x / f, p.a.y / f, p.a.w / f, p.a.h / f); x.strokeStyle = "#ff7a6b"; x.strokeRect(p.b.x / f, p.b.y / f, p.b.w / f, p.b.h / f);
          x.strokeStyle = "#f2c25b"; x.beginPath(); x.moveTo((p.a.x + p.a.w / 2) / f, (p.a.y + p.a.h / 2) / f); x.lineTo((p.b.x + p.b.w / 2) / f, (p.b.y + p.b.h / 2) / f); x.stroke(); });
      }
    } else if (m === "grad") {
      const s = R.orig.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, vw, vh).data, img = x.createImageData(vw, vh), d = img.data, g = base.grad * gain.grad;
      const Y = new Float32Array(vw * vh); for (let i = 0, j = 0; i < Y.length; i++, j += 4) Y[i] = .299 * s[j] + .587 * s[j + 1] + .114 * s[j + 2];
      for (let y = 1; y < vh - 1; y++) for (let xx = 1; xx < vw - 1; xx++) { const i = y * vw + xx, gx = Y[i + 1] - Y[i - 1], gy = Y[i + vw] - Y[i - vw], j = i * 4; d[j] = 128 + gx * g; d[j + 1] = 128 + gy * g; d[j + 2] = 128 - (gx + gy) * g * .5; d[j + 3] = 255; }
      x.putImageData(img, 0, 0);
    }
    return c;
  }
  function blit(cv, src) {   // stored orientation → the way the picture is meant to be seen
    const x = cv.getContext("2d"), { vw, vh } = R; x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, cv.width, cv.height);
    const o = R.orient; if (o === 3 || o === 4) x.setTransform(-1, 0, 0, -1, vw, vh); else if (o === 6 || o === 5) x.setTransform(0, 1, -1, 0, vh, 0); else if (o === 8 || o === 7) x.setTransform(0, -1, 1, 0, 0, vw);
    x.drawImage(src, 0, 0); x.setTransform(1, 0, 0, 1, 0, 0);
  }
  function toDisp(r) {
    const f = R.f, x = r.x / f, y = r.y / f, w = r.w / f, h = r.h / f, o = R.orient;
    if (o === 3 || o === 4) return { x: R.vw - x - w, y: R.vh - y - h, w, h };
    if (o === 6 || o === 5) return { x: R.vh - y - h, y: x, w: h, h: w };
    if (o === 8 || o === 7) return { x: y, y: R.vw - x - w, w: h, h: w };
    return { x, y, w, h };
  }
  function drawFind(cv) {
    const x = cv.getContext("2d"), W = cv.width, H = cv.height, src = $("#cv-orig"), lw = Math.max(2, W / 320);
    x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(src, 0, 0); x.fillStyle = "rgba(3,5,12,.62)"; x.fillRect(0, 0, W, H);
    const regs = R.A.items.flatMap((i) => i.regions || []), placed = [];
    regs.forEach((r0) => {
      const r = toDisp(r0), pad = lw * 2, rx = Math.max(0, r.x - pad), ry = Math.max(0, r.y - pad), rw = Math.min(W - rx, r.w + pad * 2), rh = Math.min(H - ry, r.h + pad * 2), col = COL[r0.kind];
      x.drawImage(src, rx, ry, rw, rh, rx, ry, rw, rh);
      x.save(); x.shadowColor = col; x.shadowBlur = lw * 6; x.strokeStyle = col; x.lineWidth = lw; x.strokeRect(rx, ry, rw, rh); x.restore();
      const fs = Math.max(13, W / 40); x.font = `700 ${fs}px "IBM Plex Sans Arabic", sans-serif`; x.direction = "rtl";
      const tw = x.measureText(r0.label).width + fs, lx = Math.max(0, Math.min(W - tw, rx + rw - tw)); let ly = ry > fs * 1.8 ? ry - fs * 1.6 : Math.min(H - fs * 1.5, ry + rh + 4);
      // two tests pointing at the same spot: stack their labels instead of hiding one behind the other
      while (placed.some((p) => lx < p[0] + p[2] && lx + tw > p[0] && ly < p[1] + fs * 1.5 && ly + fs * 1.5 > p[1]) && ly + fs * 3.1 < H) ly += fs * 1.6;
      placed.push([lx, ly, tw]);
      x.fillStyle = col; x.beginPath(); x.roundRect ? x.roundRect(lx, ly, tw, fs * 1.45, fs * .4) : x.rect(lx, ly, tw, fs * 1.45); x.fill();
      x.fillStyle = "#160f02"; x.textAlign = "right"; x.fillText(r0.label, lx + tw - fs / 2, ly + fs * 1.08);
    });
    if (!regs.length) {
      const fs = Math.max(15, W / 36); x.font = `700 ${fs}px "IBM Plex Sans Arabic", sans-serif`; x.textAlign = "center"; x.direction = "rtl";
      x.fillStyle = "rgba(242,236,221,.95)"; x.fillText("لا مناطق محددة آلياً", W / 2, H / 2 - fs * .3);
      x.font = `500 ${fs * .62}px "IBM Plex Sans Arabic", sans-serif`; x.fillStyle = "rgba(242,236,221,.75)"; x.fillText("وهذا ليس دليل سلامة: تصفّح الخرائط الأخرى", W / 2, H / 2 + fs);
    }
  }
  function paintOrig() {
    const o = $("#cv-orig"), m = $("#cv-map"); o.width = m.width = R.dw; o.height = m.height = R.dh; blit(o, R.orig);
    $("#stage").style.aspectRatio = `${R.dw} / ${R.dh}`;
  }
  function drawMap(fresh) {
    const m = $("#cv-map");
    if (mode === "orig") return;
    if (mode === "find") return drawFind(m);
    if (fresh || !cache[mode]) cache[mode] = renderNat(mode);
    blit(m, cache[mode]);
  }

  function controls() {
    const box = $("#controls"), g = (k) => `<label class="fz-ctl">${ic("sun-medium")}<span>تكبير التباين</span><input type="range" id="c-gain" min="0.3" max="4" step="0.05" value="${gain[k]}"></label>`;
    if (mode === "ela") box.innerHTML = `${g("ela")}<label class="fz-ctl">${ic("gauge")}<span>جودة إعادة الحفظ</span><input type="range" id="c-q" min="50" max="98" step="1" value="${R.ela.q}"><b id="c-qv" class="ltr">${R.ela.q}%</b></label>`;
    else if (mode === "noise" || mode === "grad") box.innerHTML = g(mode);
    else if (mode === "grid") box.innerHTML = `<div class="fz-legend"><span style="--c:#ff6a5c">جزء بشبكة دخيلة</span><span style="--c:#f2c25b">شبكة قديمة في كل الصورة (قص)</span><span style="--c:#3fe0c8">تصويت متناثر طبيعي</span></div>`;
    else if (mode === "clone") box.innerHTML = `<div class="fz-legend"><span style="--c:#3fe0c8">المنطقة أ</span><span style="--c:#ff7a6b">المنطقة ب</span></div><span class="small muted">${R.clone.found.length ? `${R.clone.found.length} ${R.clone.found.length === 1 ? "تطابق" : "تطابقات"}` : "لا تطابقات"}</span>`;
    else if (mode === "find") box.innerHTML = `<div class="fz-legend"><span style="--c:${COL.grid}">شبكة JPEG دخيلة</span><span style="--c:${COL.clone}">منسوخ</span><span style="--c:${COL.ela}">مستوى الخطأ</span><span style="--c:${COL.thumb}">يخالف المصغّرة</span></div>`;
    else box.innerHTML = "";
    icons();
    const gi = $("#c-gain"); if (gi) gi.addEventListener("input", () => { gain[mode] = +gi.value; drawMap(true); });
    const q = $("#c-q"); if (q) { let t; q.addEventListener("input", () => { $("#c-qv").textContent = `${q.value}%`; clearTimeout(t); t = setTimeout(() => reEla(+q.value), 220); }); }
  }
  async function reEla(q) {
    const id = ++elaSeq;
    try { const d = await ask({ type: "ela", id, q }, [], "ela"); if (id !== elaSeq || !R) return; R.ela.view = d.view; R.ela.q = q; base.ela = 235 / Math.max(8, pct(d.view, .995)); if (mode === "ela") drawMap(true); else delete cache.ela; }
    catch { toast("تعذّرت إعادة الحساب", "alert-triangle"); }
  }
  function setMode(m) {
    mode = m;
    $$("#modes button").forEach((b) => { const on = b.dataset.m === m; b.classList.toggle("active", on); b.setAttribute("aria-selected", on); });
    $("#stage").classList.toggle("only-orig", m === "orig");
    $("#explain").textContent = MODES[m];
    drawMap(); controls();
  }
  $("#modes").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b && R) setMode(b.dataset.m); });

  /* compare slider + magnifier */
  const stage = $("#stage"), lens = $("#lens"); let drag = false;
  const setSplit = (clientX) => { const r = stage.getBoundingClientRect(), p = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)); stage.style.setProperty("--split", `${p}%`); $("#handle").setAttribute("aria-valuenow", Math.round(p)); };
  function moveLens(e) {
    const r = stage.getBoundingClientRect(), sc = Math.min(r.width / R.dw, r.height / R.dh), ox = (r.width - R.dw * sc) / 2, oy = (r.height - R.dh * sc) / 2;
    const px = e.clientX - r.left, py = e.clientY - r.top, ix = (px - ox) / sc, iy = (py - oy) / sc, L = lens.width, D = 180, Z = 3;
    if (ix < 0 || iy < 0 || ix > R.dw || iy > R.dh) { lens.hidden = true; return; }
    lens.hidden = false; const x = lens.getContext("2d"), sw = D / (Z * sc), sh = sw / 2, half = L / 2, only = mode === "orig";
    x.imageSmoothingEnabled = sw > L; x.fillStyle = "#03050c"; x.fillRect(0, 0, L, L);
    if (only) x.drawImage($("#cv-orig"), ix - sw / 2, iy - sw / 2, sw, sw, 0, 0, L, L);
    else { x.drawImage($("#cv-orig"), ix - sw / 2, iy - sh / 2, sw, sh, 0, 0, L, half); x.drawImage($("#cv-map"), ix - sw / 2, iy - sh / 2, sw, sh, 0, half, L, half); x.fillStyle = "#f2c25b"; x.fillRect(0, half - 1, L, 2); }
    const top = py - D - 28 < 0 ? py + 28 : py - D - 28;
    lens.style.left = `${Math.max(0, Math.min(r.width - D, px - D / 2))}px`; lens.style.top = `${Math.max(0, Math.min(r.height - D, top))}px`;
  }
  stage.addEventListener("pointerdown", (e) => { if (!R) return; drag = true; try { stage.setPointerCapture(e.pointerId); } catch { /* synthetic */ } lensOn ? moveLens(e) : setSplit(e.clientX); });
  stage.addEventListener("pointermove", (e) => { if (!R) return; if (lensOn) { if (e.pointerType === "mouse" || drag) moveLens(e); } else if (drag) setSplit(e.clientX); });
  stage.addEventListener("pointerup", () => { drag = false; });
  stage.addEventListener("pointerleave", () => { if (lensOn) lens.hidden = true; });
  $("#handle").addEventListener("keydown", (e) => {
    const cur = parseFloat(getComputedStyle(stage).getPropertyValue("--split")) || 50, d = e.key === "ArrowLeft" ? -5 : e.key === "ArrowRight" ? 5 : 0;
    if (d) { e.preventDefault(); const p = Math.max(0, Math.min(100, cur + d)); stage.style.setProperty("--split", `${p}%`); e.currentTarget.setAttribute("aria-valuenow", p); }
  });
  $("#lens-btn").addEventListener("click", (e) => {
    lensOn = !lensOn; e.currentTarget.classList.toggle("active", lensOn); e.currentTarget.setAttribute("aria-pressed", lensOn); stage.classList.toggle("lens-on", lensOn); lens.hidden = true;
    if (lensOn) toast("حرّك المؤشر أو إصبعك فوق الصورة: الأعلى الأصل والأسفل الخريطة", "zoom-in");
  });
  const current = () => (mode === "orig" ? $("#cv-orig") : $("#cv-map"));
  const stem = () => (R.file.name || "image").replace(/\.[^.]+$/, "").slice(0, 60);
  $("#dl-view").addEventListener("click", () => R && current().toBlob((b) => b && download(b, `${stem()}-${mode}.png`), "image/png"));
  $("#full-view").addEventListener("click", () => R && modal(`<img src="${current().toDataURL("image/jpeg", .92)}" alt="" style="width:100%;border-radius:16px"><p class="small muted mt-2 mb-0">${esc(MODES[mode])}</p>`));

  /* ---------- Summary for the verifier ---------- */
  const CAP = { high: ["عالية", "var(--success)", 3], mid: ["متوسطة", "var(--warn)", 2], low: ["ضعيفة", "var(--danger)", 1] };
  function renderSummary() {
    const A = R.A, c = CAP[A.cap];
    $("#summary").innerHTML = `<span class="kicker">خلاصة للمتحقق</span>
      <h2 style="color:${A.head[1]}">${ic(A.head[2])}${A.head[0]}</h2><p>${A.head[3]}</p>
      <div class="fz-cap" style="--col:${c[1]}"><div><strong>قدرة هذا الملف على حمل الأدلة: ${c[0]}</strong><span class="fz-bars" aria-hidden="true">${[1, 2, 3].map((i) => `<i class="${i <= c[2] ? "on" : ""}"></i>`).join("")}</span></div><small>${esc(A.capWhy)}</small></div>`;
    const list = A.items.length ? A.items : [];
    $("#findings").innerHTML = `<div class="card-title"><span class="ico ico-sm">${ic("list-checks")}</span><h3>القرائن</h3></div>
      <ul class="fz-tests">${list.map((t) => { const s = STR[t.s]; return `<li class="${s[3]}"${t.mode ? ` data-jump="${t.mode}" tabindex="0" role="button"` : ""}><span class="${s[1]}">${ic(s[2])}</span><div><strong>${esc(t.title)}</strong><small class="${s[1]}">${s[0]}</small><p>${esc(t.detail)}</p></div></li>`; }).join("")}
      ${list.some((t) => t.s === "strong" || t.s === "medium") ? "" : `<li><span class="muted">${ic("circle-dashed")}</span><div><strong>لا قرائن آلية على لصق أو نسخ</strong><small class="muted">ليس دليل سلامة</small><p>لم نجد شبكة JPEG دخيلة ولا أجزاء منسوخة ولا مناطق شاذة في مستوى الخطأ. المسح بالتنعيم، والنص المضاف، وتعديل لقطات الشاشة، وكل ما مرّ بعده ضغط مواقع التواصل، كلها قد تفلت.</p></div></li>`}</ul>
      <p class="small muted mt-2 mb-0">${ic("info")} الفحوص الآلية: شبكة JPEG، النسخ-لصق، المصغّرة، ومستوى الخطأ. خريطتا الضجيج والتدرّج للعين فقط.</p>`;
    icons();
  }
  const jump = (li) => {
    if (li.dataset.jump === "thumb") { const c = $("#thumb-card"); if (!c.hidden) c.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    setMode(li.dataset.jump); $(".fz-viewer-card").scrollIntoView({ behavior: "smooth", block: "start" });
  };
  $("#findings").addEventListener("click", (e) => { const li = e.target.closest("[data-jump]"); if (li) jump(li); });
  $("#findings").addEventListener("keydown", (e) => { const li = e.target.closest("[data-jump]"); if (li && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); jump(li); } });

  const fmtDate = (x) => (x ? new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(x) : "");
  function infoRows() {
    const st = R.struct, m = R.meta, f = R.file, mk2 = st.markers || {};
    const sig = st.fmt !== "JPEG" ? "" : st.standardTables ? (st.qLuma.q === 87 && mk2.jfif && !mk2.exif ? "جداول قياسية بجودة 87: ما يخرجه تيليغرام" : "جداول libjpeg القياسية: تكتبها أغلب البرامج والمنصات وبعض الهواتف") : "جداول خاصة: نمط الكاميرات وبرامج Adobe";
    return [
      ["الاسم", f.name, true], ["الأبعاد", `${Math.round(R.w / R.shrunk)} × ${Math.round(R.h / R.shrunk)}`, true], ["الحجم", fmtBytes(f.size)], ["الصيغة", `${st.fmt || (f.type.split("/")[1] || "؟").toUpperCase()}${st.sof && st.sof.progressive ? " (تدريجي)" : ""}`],
      st.qLuma ? ["جودة الحفظ التقديرية", `${st.qLuma.q}%${st.qChroma && st.qChroma.q !== st.qLuma.q ? ` (الألوان ${st.qChroma.q}%)` : ""}`] : null,
      sig ? ["جداول التكميم", sig] : null, st.subsampling ? ["عيّنات اللون", st.subsampling, true] : null,
      st.markers ? ["مقاطع الملف", [mk2.jfif && "JFIF", mk2.exif && "EXIF", mk2.xmp && "XMP", mk2.icc && "ICC", mk2.mpf && "MPF", mk2.photoshop && "Photoshop", mk2.adobe && "Adobe"].filter(Boolean).join(" · ") || "لا شيء", true] : null,
      R.grid && R.grid.main >= 0 && st.fmt !== "JPEG" ? ["آثار JPEG سابق", "نعم"] : null,
      m.make ? ["الجهاز", m.make] : null, m.software ? ["البرنامج المسجّل", m.software] : null, m.taken ? ["تاريخ التصوير", fmtDate(m.taken)] : null, m.modified ? ["آخر حفظ", fmtDate(m.modified)] : null,
      ["حُلّلت", R.shrunk < 1 ? `نسخة مصغّرة ${R.w}×${R.h} (الصورة أكبر من 12 ميغابكسل)` : "بالدقة الكاملة"],
      R.sha ? ["بصمة SHA-256", R.sha, true] : null
    ].filter(Boolean);
  }
  function renderInfo() { $("#info").innerHTML = infoRows().map(([k, v, ltr]) => `<tr><th>${k}</th><td>${ltr ? `<span class="ltr">${esc(v)}</span>` : esc(v)}</td></tr>`).join(""); }
  function renderThumb() {
    const t = R.thumb, card = $("#thumb-card"); card.hidden = !t; if (!t) return;
    $("#th-old").src = t.url; const c = $("#th-now"), s = Math.min(1, 320 / Math.max(R.dw, R.dh)); c.width = Math.round(R.dw * s); c.height = Math.round(R.dh * s); c.getContext("2d").drawImage($("#cv-orig"), 0, 0, c.width, c.height);
    card.classList.toggle("mismatch", R.A.items.some((i) => i.id === "thumb" && i.s === "strong"));
  }

  /* ---------- Report ---------- */
  function reportText() {
    const A = R.A, plain = (s) => s.replace(/<[^>]+>/g, ""), L = [];
    L.push("تقرير فحص التعديل — الإمبراطورية العراقية", `التاريخ: ${fmtDate(new Date())}`, "");
    L.push("== الخلاصة ==", A.head[0], plain(A.head[3]), `قدرة الملف على حمل الأدلة: ${CAP[A.cap][0]} — ${A.capWhy}`, "");
    L.push("== القرائن ==");
    if (!A.items.length) L.push("لا قرائن آلية (وهذا ليس دليل سلامة).");
    A.items.forEach((t) => { L.push(`[${STR[t.s][0]}] ${t.title}`, `  ${t.detail}`); (t.regions || []).forEach((r) => L.push(`  • ${r.label}: س=${Math.round(r.x / R.shrunk)} ص=${Math.round(r.y / R.shrunk)} عرض=${Math.round(r.w / R.shrunk)} ارتفاع=${Math.round(r.h / R.shrunk)} بكسل`)); });
    L.push("", "== بطاقة الملف =="); infoRows().forEach(([k, v]) => L.push(`${k}: ${v}`));
    L.push("", "== حدود الفحص ==", "• القرائن تدعو إلى التدقيق وليست حكماً قاطعاً بالتزوير.", "• غياب القرائن ليس دليل سلامة: إعادة الضغط في مواقع التواصل تمحو أغلب آثار التعديل.", "• المسح بالتنعيم، والنص المضاف، وتعديل لقطات الشاشة، والنسخ مع تدوير أو تكبير، قد لا تترك أثراً نلتقطه.", "• التحليل جرى كله داخل المتصفح، ولم تُرفع الصورة إلى أي خادم.", "", location.origin + location.pathname);
    return L.join("\n");
  }
  $("#rep-copy").addEventListener("click", () => R && copy(reportText(), "نُسخ التقرير"));
  $("#rep-dl").addEventListener("click", () => R && download(new Blob(["﻿" + reportText()], { type: "text/plain;charset=utf-8" }), `${stem()}-forensics.txt`));
  $("#maps-dl").addEventListener("click", () => {
    if (!R) return;
    // one sheet with every map, captioned
    const names = [["orig", "الأصل"], ["find", "القرائن"], ["ela", `مستوى الخطأ (${R.ela.q}%)`], ["grid", "شبكة JPEG"], ["clone", "المنسوخ"], ["noise", "الضجيج"], ["grad", "التدرّج"]];
    const cw = Math.min(900, R.dw), chh = Math.round(cw * R.dh / R.dw), pad = 18, cap = 44, cols = R.dw >= R.dh ? 2 : 4, rows = Math.ceil(names.length / cols);
    const sheet = mk(cols * (cw + pad) + pad, rows * (chh + cap + pad) + pad + 50), x = sheet.getContext("2d"), tmp = mk(R.dw, R.dh);
    x.fillStyle = "#070c1d"; x.fillRect(0, 0, sheet.width, sheet.height); x.direction = "rtl"; x.textAlign = "right";
    names.forEach(([m, label], i) => {
      const px = pad + (i % cols) * (cw + pad), py = pad + Math.floor(i / cols) * (chh + cap + pad);
      if (m === "orig") x.drawImage($("#cv-orig"), px, py, cw, chh); else if (m === "find") { drawFind(tmp); x.drawImage(tmp, px, py, cw, chh); } else { if (!cache[m]) cache[m] = renderNat(m); blit(tmp, cache[m]); x.drawImage(tmp, px, py, cw, chh); }
      x.fillStyle = "#f2ecdd"; x.font = '700 24px "IBM Plex Sans Arabic", sans-serif'; x.fillText(label, px + cw, py + chh + 30);
    });
    x.fillStyle = "#9ba3bf"; x.font = '500 20px "IBM Plex Sans Arabic", sans-serif'; x.fillText(`${R.A.head[0]} · ${R.file.name} · كاشف التعديل — الإمبراطورية العراقية`, sheet.width - pad, sheet.height - 22);
    sheet.toBlob((b) => b && download(b, `${stem()}-maps.png`), "image/png");
  });

  /* ---------- Honest numbers ---------- */
  (function testTable() {
    const row = (r, bad) => `<tr><th>${r[0]}</th><td class="ltr">${r[2]} / ${r[1]}</td><td>${bad ? (r[2] ? "اتهام خاطئ" : "لا اتهام خاطئ") : r[2] === 0 ? "لا يُكشف" : r[2] / r[1] >= .5 ? "يُكشف غالباً" : "يُكشف أحياناً"}</td></tr>`;
    $("#test-table").innerHTML = `<table class="kv fz-tt"><thead><tr><th>الحالة</th><th>قرينة قوية</th><th>المعنى</th></tr></thead><tbody>
      <tr class="fz-tt-h"><td colspan="3">صور سليمة (كل قرينة قوية هنا خطأ)</td></tr>${TEST.clean.map((r) => row(r, true)).join("")}
      <tr class="fz-tt-h"><td colspan="3">صور عدّلناها بأنفسنا</td></tr>${TEST.tamper.map((r) => row(r, false)).join("")}</tbody></table>`;
  })();

  window.FZ = { run, get R() { return R; }, setMode };   // used by the test harness
})();
