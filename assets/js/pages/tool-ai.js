(function () {
  const { $, esc, ic, icons, toast, copy, download, fmtBytes, dropzone, store } = App;
  const D = window.AIDetect, PV = window.Provenance;
  let R = null, runId = 0, imgUrl = null;

  /* ---------- وضع النماذج وحالة التخزين ---------- */
  const modeSel = $("#mode");
  const sizeOf = (list) => list.reduce((a, m) => a + m.size, 0);
  const modelsFor = (mode) => (mode === "full" ? D.MODELS : mode === "lite" ? D.MODELS.filter((m) => m.lite) : []);
  modeSel.innerHTML = `
    <option value="full">شامل: ${D.MODELS.length === 2 ? "نموذجان" : D.MODELS.length + " نماذج"} (≈ ${sizeOf(D.MODELS)} م.ب لأول مرة) · الأدق</option>
    <option value="lite">خفيف: نموذج واحد (≈ ${sizeOf(modelsFor("lite"))} م.ب لأول مرة)</option>
    <option value="none">بدون نماذج: فحص الملف فقط (فوري)</option>`;
  const saved = store.get("ai-mode", (navigator.deviceMemory && navigator.deviceMemory <= 4) || innerWidth < 600 ? "lite" : "full");
  modeSel.value = ["full", "lite", "none"].includes(saved) ? saved : "full";
  D.pruneCache();
  async function refreshStatus() {
    const cached = await D.cachedModels(); const need = modelsFor(modeSel.value);
    const missing = need.filter((m) => !cached.includes(m.id));
    $("#model-status").innerHTML = !need.length ? "سيُكتفى بفحص الأدلة داخل الملف. لن يصدر حكم على الصور التي لا تحمل بيانات." :
      missing.length ? `${ic("download")} يحتاج تحميل ${sizeOf(missing)} م.ب مرة واحدة فقط، ثم يُحفظ في جهازك.` : `${ic("badge-check")} النماذج محفوظة في جهازك وتعمل فوراً، حتى بلا إنترنت.`;
    $("#clear-models").hidden = !cached.length;
    icons(); return missing;
  }
  modeSel.addEventListener("change", () => { store.set("ai-mode", modeSel.value); refreshStatus(); if (R) { R.models = []; renderVerdict(); renderModels(); } });
  $("#clear-models").addEventListener("click", async () => { await D.clearModels(); toast("حُذفت النماذج من جهازك", "trash-2"); refreshStatus(); });
  refreshStatus();

  /* ---------- ثوابت العرض ---------- */
  const pct = (p) => `${Math.round(p * 100)}%`;
  const LEVEL = {
    "ai-proof": { c: "var(--danger)", i: 4, icon: "bot" }, "edit-proof": { c: "var(--danger)", i: 4, icon: "wand-sparkles" }, "ai-likely": { c: "var(--danger)", i: 4, icon: "bot" },
    suspect: { c: "var(--warn)", i: 3, icon: "alert-triangle" }, unsure: { c: "var(--warn)", i: 2, icon: "help-circle" },
    clean: { c: "var(--info)", i: 1, icon: "search-check" }, "real-likely": { c: "var(--success)", i: 0, icon: "camera" }, unknown: { c: "var(--muted)", i: -1, icon: "circle-dashed" }
  };
  const SCALE = ["حقيقية على الأرجح", "لا مؤشرات", "غير محسومة", "مشبوهة", "مولّدة"];
  const SCALE_C = ["var(--success)", "var(--info)", "var(--warn)", "var(--warn)", "var(--danger)"];
  const CONF = { certain: ["دليل مكتوب داخل الملف", "badge-danger"], high: ["ثقة عالية", "badge-info"], medium: ["ثقة متوسطة", "badge-warn"], low: ["ثقة منخفضة", "badge-warn"] };
  const STRENGTH = { "قاطع": "badge-danger", "قوي": "badge-info", "متوسط": "badge-warn", "ضعيف": "", "معلومة": "" };
  const ST = { ai: "مولّد بالذكاء الاصطناعي", "composite-ai": "مركّب أو معدّل بالذكاء الاصطناعي", composite: "صورة مركّبة", algorithmic: "مولّد خوارزمياً (ليس ذكاءً اصطناعياً)", capture: "ملتقط بكاميرا", screen: "لقطة شاشة", art: "عمل رقمي من صنع إنسان", edited: "معدّل يدوياً" };
  const KIND = { jpeg: "JPEG", png: "PNG", webp: "WebP", heif: "HEIC", avif: "AVIF", gif: "GIF", tiff: "TIFF", other: "غير معروفة" };
  const methodOf = (v) => (v.hard ? "أدلة داخل الملف" : v.models.length ? `${v.models.length === 1 ? "نموذج كشف واحد" : v.models.length === 2 ? "نموذجا كشف" : v.models.length + " نماذج كشف"} + فحص الملف` : "فحص الملف فقط");
  const T = D.TEST;

  function scale(v) {
    const at = LEVEL[v.level].i;
    return `<div class="ai-scale" role="img" aria-label="موقع النتيجة: ${at < 0 ? "لا حكم" : SCALE[at]}">${SCALE.map((t, i) => `<div class="${i === at ? "on" : ""}" style="--c:${SCALE_C[i]}"><i></i><span>${t}</span></div>`).join("")}</div>`;
  }

  /* ---------- التحليل ---------- */
  async function analyze(files) {
    const file = files.find((f) => f.type.startsWith("image/") || /\.(heic|heif|avif)$/i.test(f.name));
    if (!file) return toast("اختر ملف صورة", "alert-triangle");
    const my = ++runId;
    const rep = $("#report"); rep.hidden = false;
    rep.innerHTML = `<div class="card mt-3 center"><span class="ico" style="margin:0 auto 12px">${ic("loader")}</span><h3>جارِ الفحص…</h3><p class="muted mb-0">قراءة الأدلة داخل الملف</p></div>`;
    icons(); rep.scrollIntoView({ behavior: "smooth", block: "start" });

    const buf = await file.arrayBuffer(); const d = new Uint8Array(buf);
    const [prov, hash] = await Promise.all([PV.provenance(d, { name: file.name }), D.sha256(buf)]);
    const jpeg = D.jpegQuality(d);
    let exif = null; try { exif = await exifr.parse(file, { tiff: true, exif: true, gps: false, xmp: false, iptc: false, icc: false, mergeOutput: true }); } catch { /* none */ }
    exif = Object.assign({}, prov.exif, exif || {});
    const hasExif = Object.keys(exif).some((k) => !/^(Orientation|XResolution|YResolution|ResolutionUnit|ExifImageWidth|ExifImageHeight|ColorSpace|YCbCrPositioning|MakerNote)$/.test(k));
    let bmp = null; try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); } catch { /* unsupported format */ }
    if (my !== runId) return;
    if (imgUrl) URL.revokeObjectURL(imgUrl); imgUrl = URL.createObjectURL(file);

    R = { file, name: file.name, hash, prov, jpeg, exif, hasExif, w: bmp ? bmp.width : 0, h: bmp ? bmp.height : 0, models: [], bmp, colors: null, when: new Date() };
    if (bmp) { try { R.colors = D.colors(bmp); } catch { /* optional */ } }
    renderReport();
    if (bmp && modelsFor(modeSel.value).length) {
      const missing = await refreshStatus();
      if (!missing.length) runModels(my);
    }
  }

  async function runModels(my) {
    const need = modelsFor(modeSel.value); R.models = []; R.modelErr = null; R.running = true; renderVerdict();
    for (const m of need) {
      const box = $("#v-models-body"); if (!box) return;
      box.innerHTML = `<div class="stack" style="gap:8px"><strong class="small">${esc(m.name)}</strong><div class="meter"><i id="mbar" style="width:2%;background:var(--gold-2)"></i></div><span class="small muted" id="mtxt">تجهيز النموذج…</span></div>`;
      try {
        const p = await D.classify(R.bmp, m, (f, cached) => {
          const b = $("#mbar"), t = $("#mtxt"); if (!b) return;
          b.style.width = `${Math.max(2, f * 100)}%`;
          t.textContent = cached ? "النموذج محفوظ في جهازك، وجارِ التشغيل…" : f >= 1 ? "اكتمل التحميل، وجارِ التشغيل…" : `تحميل النموذج: ${Math.round(f * m.size)} من ${m.size} م.ب (مرة واحدة فقط)`;
        });
        if (my !== runId) return;
        R.models.push({ id: m.id, p });
      } catch (e) {
        R.modelErr = "تعذّر تشغيل النموذج: " + (e.message || "خطأ غير معروف") + ". قد يكون الاتصال ضعيفاً أو ذاكرة الجهاز غير كافية؛ جرّب الوضع الخفيف.";
        break;
      }
    }
    R.running = false;
    refreshStatus(); renderVerdict(); renderModels();
  }

  /* ---------- العرض ---------- */
  function renderReport() {
    $("#report").innerHTML = `
      <div class="flex between items-center wrap gap-1 mt-3 mb-2 no-print">
        <h2 class="mb-0" style="font-size:1.5rem">تقرير الفحص</h2>
        <div class="btn-row">
          <button class="btn btn-ghost btn-sm" id="r-copy">${ic("clipboard-copy")}نسخ التقرير</button>
          <button class="btn btn-ghost btn-sm" id="r-txt">${ic("file-text")}نص</button>
          <button class="btn btn-ghost btn-sm" id="r-json">${ic("file-json")}JSON</button>
          <button class="btn btn-ghost btn-sm" id="r-print">${ic("printer")}طباعة / PDF</button>
          <button class="btn btn-primary btn-sm" id="r-new">${ic("image-plus")}صورة أخرى</button>
        </div>
      </div>
      <div class="stack">
        <div class="card" id="v-verdict"></div>
        <div class="card" id="v-why"></div>
        <div class="card" id="v-models"></div>
        <div class="card" id="v-prov"></div>
        <div class="card" id="v-file"></div>
        <div class="card" id="v-limits"></div>
        <div id="v-plan"></div>
        <details class="card" id="v-colors"></details>
        <div class="card" id="v-second"></div>
      </div>`;
    $("#r-new").addEventListener("click", () => $("#file").click());
    $("#r-print").addEventListener("click", () => window.print());
    $("#r-copy").addEventListener("click", () => copy(textReport(), "نُسخ التقرير المفصّل"));
    $("#r-txt").addEventListener("click", () => download(new Blob([textReport()], { type: "text/plain;charset=utf-8" }), baseName() + "-ai-report.txt"));
    $("#r-json").addEventListener("click", exportJson);
    renderVerdict(); renderModels(); renderProv(); renderFile(); renderLimits(); renderColors(); renderSecond();
  }

  function renderVerdict() {
    const v = R.verdict = D.verdict(R); const L = LEVEL[v.level];
    const waiting = !v.hard && !v.models.length && modelsFor(modeSel.value).length && R.bmp;
    $("#v-verdict").innerHTML = `<div class="flex gap-2 items-center wrap">
        ${imgUrl && R.bmp ? `<img src="${imgUrl}" alt="الصورة المفحوصة" style="width:120px;height:120px;object-fit:cover;border-radius:16px;border:1px solid var(--border)">` : ""}
        <div style="flex:1;min-width:220px">
          <span class="kicker">النتيجة</span>
          <h2 style="font-family:var(--font);font-size:clamp(1.3rem,3.4vw,1.85rem);color:${L.c};margin-bottom:8px">${ic(L.icon)} ${esc(waiting ? (R.running ? "جارِ تشغيل نماذج الكشف…" : "بانتظار تشغيل نماذج الكشف") : v.label)}</h2>
          <div class="flex wrap gap-1"><span class="badge ${CONF[v.confidence][1]}">${ic("gauge")}${CONF[v.confidence][0]}</span><span class="badge">${ic("microscope")}${methodOf(v)}</span></div>
          <p class="small muted mt-1 mb-0 ltr" style="text-align:right">${esc(R.name)} · ${R.w ? `${R.w}×${R.h} · ` : ""}${fmtBytes(R.file.size)}</p>
        </div>
      </div>
      ${scale(v)}
      ${v.hard ? `<div class="alert alert-${v.hard.kind === "ai" ? "danger" : "warn"} mt-2">${ic("fingerprint")}<div><strong>${esc(v.hard.t)}</strong><p>${esc(v.hard.d)}</p></div></div>` : ""}
      ${v.note ? `<div class="alert alert-warn mt-2">${ic("alert-triangle")}<div><p class="mb-0">${esc(v.note)}</p></div></div>` : ""}
      ${meaning(v)}`;
    renderWhy(); renderPlan(); icons();
  }

  /* ماذا تعني هذه النتيجة بالأرقام التي قسناها نحن */
  function meaning(v) {
    const box = (cls, icon, t, d) => `<div class="alert alert-${cls} mt-2">${ic(icon)}<div><strong>${t}</strong><p>${d}</p></div></div>`;
    if (v.level === "ai-proof") return box("info", "info", "ما مدى قوة هذا الدليل؟", "الدليل مكتوب في الملف نفسه، وهو أقوى ما يمكن أن تجده أداة آلية. نظرياً يمكن لشخص أن يضيف هذه الوسوم إلى صورة حقيقية ليشكّك فيها، لكن ذلك نادر جداً.");
    if (v.level === "edit-proof") return box("info", "info", "معدّلة لا تعني مزيّفة بالكامل", "قد يكون التعديل بسيطاً (إزالة عنصر من الخلفية) أو جوهرياً (إضافة شخص). الأداة لا تعرف حجم التعديل؛ ابحث عن النسخة الأصلية.");
    if (v.level === "ai-likely") return box("warn", "scale", "«على الأرجح» وليست «مؤكدة»", `${T.likely} لا تتهم أحداً بالتزييف اعتماداً على هذه النتيجة وحدها.`);
    if (v.level === "clean") return box("info", "info", "«لم نرصد مؤشرات» لا تعني «حقيقية»", `${T.clean} للصور الإخبارية والسياسية اتبع خطة التحقق أدناه قبل أن تصدّق أو تنشر.`);
    if (v.level === "real-likely") return box("info", "info", "قرائن لا أدلة قاطعة", "بيانات الكاميرا يمكن نسخها من صورة إلى أخرى، والنماذج تخطئ. النتيجة ترجيح مبني على اتفاق القرائن، ويبقى البحث عن مصدر الصورة هو الفيصل.");
    if (v.level === "unknown") return box("info", "info", "لا يمكن إصدار حكم", "الملف لا يحمل أدلة، ونماذج الكشف لم تُشغَّل. شغّلها من الأسفل، أو اتبع خطة التحقق اليدوية.");
    return box("info", "info", "النتيجة غير محسومة", "الأداة لا تملك ما يكفي للترجيح. لا تعاملها كإدانة ولا كتبرئة، واتبع خطة التحقق أدناه.");
  }

  function renderWhy() {
    const v = R.verdict;
    const row = (e) => `<div class="ai-why ${e.dir > 0 ? "pro" : e.dir < 0 ? "con" : ""}"><span class="ai-why-i">${ic(e.dir > 0 ? "bot" : e.dir < 0 ? "camera" : "info")}</span>
      <div><div class="flex gap-1 items-center wrap"><strong>${esc(e.t)}</strong><span class="badge ${STRENGTH[e.s]}">${e.s === "معلومة" ? "معلومة" : "وزنه: " + e.s}</span></div><p class="small muted mb-0 mt-1">${esc(e.d)}</p></div></div>`;
    $("#v-why").innerHTML = `<div class="card-title"><span class="ico ico-sm">${ic("list-checks")}</span><h3>لماذا هذه النتيجة؟</h3></div>
      <p class="small muted">كل ما بُني عليه الحكم، مرتّباً من الأقوى إلى الأضعف. ${ic("bot")} يدعم التوليد · ${ic("camera")} يدعم أنها حقيقية · ${ic("info")} معلومة لا ترجّح.</p>
      ${v.why.length ? v.why.map(row).join("") : `<p class="muted mb-0">لا توجد مؤشرات بعد.</p>`}`;
  }

  function renderPlan() {
    const v = R.verdict; const el = $("#v-plan"); if (!el) return;
    const steps = [
      ["images", "ابحث عن أصل الصورة", "الصورة الحقيقية لحدث مهم تجدها في وكالات الأنباء (رويترز، AP، الفرنسية، غيتي) بتاريخ ومصوّر. إن لم تظهر إلا في صفحات التواصل فهذا مؤشر خطر.", "tool-reverse.html", "البحث العكسي"],
      ["sparkles", "اسأل Gemini عن علامة SynthID", "صور غوغل المولّدة تحمل علامة مائية مخفية لا تستطيع أي أداة خارج غوغل قراءتها. ارفع الصورة إلى Gemini واسأله: «هل صُنعت هذه الصورة بذكاء غوغل الاصطناعي؟»", "https://gemini.google.com/", "افتح Gemini"],
      ["zoom-in", "دقّق بعينك في التفاصيل", "كبّر الصورة وافحص الأصابع والأسنان والأذنين، والكتابة على اللافتات والملابس، والوجوه في الخلفية، واتجاه الظلال والانعكاسات.", "#signs", "دليل العلامات"],
      ["newspaper", "تحقق من الحدث نفسه", "هل وقع هذا الحدث فعلاً؟ ابحث عنه في مصادر إخبارية موثوقة بتاريخه. الصورة المزيّفة غالباً «تخترع» حدثاً لم يحصل.", "https://news.google.com/", "أخبار غوغل"]
    ];
    const title = v.level === "ai-proof" || v.level === "edit-proof" ? "إن أردت التأكد أكثر" : v.level === "ai-likely" || v.level === "suspect" ? "قبل أن تصدّقها أو تتهم ناشرها" : v.level === "unsure" || v.level === "unknown" ? "النتيجة غير محسومة: هكذا تحسمها" : "خطة التحقق قبل النشر";
    el.innerHTML = `<div class="ai-plan"><div class="card-title"><span class="ico ico-sm">${ic("route")}</span><h3>${title}</h3></div>
      <ol>${steps.map(([i, t, d, h, l]) => `<li><span class="ico ico-sm">${ic(i)}</span><div><strong>${t}</strong><p>${d}</p><a class="link small" href="${h}"${h.startsWith("http") ? ' target="_blank" rel="noopener"' : ""}>${l}</a></div></li>`).join("")}</ol></div>`;
  }

  async function renderModels() {
    const need = modelsFor(modeSel.value); const el = $("#v-models"); if (!el || R.running) return;
    const v = R.verdict; let body;
    const about = `<p class="small muted">نماذج تعلّم آلي مفتوحة المصدر تفحص بكسلات الصورة داخل متصفحك. تعطي ترجيحاً لا دليلاً، ونعرض لك أداءها الفعلي في اختبارنا في بطاقة «حدود الأداة».</p>`;
    if (!R.bmp) body = `<p class="muted mb-0">المتصفح لا يستطيع فتح صيغة هذه الصورة، فلا يمكن تشغيل النماذج. حوّلها إلى JPG أو PNG وأعد المحاولة. (فحص الأدلة داخل الملف جرى بشكل طبيعي.)</p>`;
    else if (v.models.length) {
      const say = { ai: ["يرصد توليداً", "var(--danger)"], unsure: ["متردد", "var(--warn)"], clean: ["لا يرصد توليداً", "var(--success)"] };
      body = about + v.models.map((m) => { const [t, col] = say[m.vote]; const M = D.MODELS.find((k) => k.id === m.id); return `<div class="mb-2">
        <div class="flex between items-center gap-1 wrap"><strong>${esc(m.name)} <span class="small muted">· ${esc(m.by)}</span></strong><span style="color:${col};font-weight:700">${t} · ${pct(m.p)}</span></div>
        <div class="ai-bar mt-1"><i style="width:${Math.max(2, m.p * 100)}%;background:${col}"></i><b style="inset-inline-start:${m.lo * 100}%"></b><b style="inset-inline-start:${m.hi * 100}%"></b></div>
        <p class="small muted mt-1 mb-0">${esc(M.desc)} العتبتان: «لا مؤشرات» حتى ${pct(m.lo)}، و«مولّدة» من ${pct(m.hi)}.</p></div>`; }).join("")
        + (v.models.length > 1 ? `<p class="small mb-0">${v.agree === "split" ? `${ic("alert-triangle")} <strong>النماذج مختلفة.</strong> نعرض الخلاف كما هو ولا نخفيه بمتوسط.` : v.agree === "ai" ? `${ic("check-circle-2")} النماذج متفقة على رصد التوليد.` : v.agree === "clean" ? `${ic("check-circle-2")} النماذج متفقة: لا مؤشرات توليد.` : `${ic("info")} النماذج غير حاسمة.`}</p>` : "")
        + (R.modelErr ? `<div class="alert alert-warn mt-2">${ic("alert-triangle")}<span>${esc(R.modelErr)}</span></div>` : "");
    } else if (!need.length) body = `<p class="muted mb-0">النماذج معطّلة. اختر «شامل» أو «خفيف» من الإعدادات أعلى الصفحة ليصدر حكم على الصور التي لا تحمل بيانات.</p>`;
    else {
      const missing = await refreshStatus(); const size = sizeOf(missing);
      body = `${R.modelErr ? `<div class="alert alert-warn mb-2">${ic("alert-triangle")}<span>${esc(R.modelErr)}</span></div>` : ""}${about}
        <p class="small">${size ? `تحتاج تحميل <strong>${size} م.ب</strong> مرة واحدة، ثم تُحفظ في جهازك وتعمل فوراً في المرات القادمة.` : "النماذج جاهزة في جهازك."}</p>
        <button class="btn btn-primary" id="run-models">${ic("brain-circuit")}تشغيل نماذج الكشف</button>`;
    }
    el.innerHTML = `<div class="card-title"><span class="ico ico-sm">${ic("brain-circuit")}</span><h3>نماذج الكشف</h3></div><div id="v-models-body">${body}</div>`;
    icons();
    const b = $("#run-models"); if (b) b.addEventListener("click", () => runModels(runId));
  }

  function renderProv() {
    const P = R.prov, ex = R.exif, c = P.c2pa;
    const row = (k, v, cls = "") => `<tr class="${cls}"><th>${k}</th><td>${v}</td></tr>`;
    const ltr = (s) => `<span class="ltr" dir="ltr">${esc(s)}</span>`;
    const cam = ["Make", "Model", "LensModel", "ExposureTime", "FNumber", "ISO", "FocalLength", "DateTimeOriginal"].filter((k) => ex[k] != null);
    const fmt = (k) => { try { return window.ImgMeta.fmtValue(k, ex[k]); } catch { return String(ex[k]); } };
    const acts = c ? c.actions.map((a) => PV.C2PA_ACTIONS[a] || a) : [];
    $("#v-prov").innerHTML = `<div class="card-title"><span class="ico ico-sm">${ic("fingerprint")}</span><h3>الأدلة داخل الملف (بيانات المنشأ)</h3></div>
      <div class="table-wrap"><table class="kv"><tbody>
        ${row("بيانات اعتماد المحتوى (C2PA)", c ? `<strong class="text-warn">موجودة</strong> <a class="link small" href="https://contentcredentials.org/verify" target="_blank" rel="noopener">تحقق من التوقيع رسمياً</a>` : "غير موجودة")}
        ${c && c.generator ? row("↳ الأداة التي أنشأت السجل", ltr(c.generator)) : ""}
        ${c && c.agents.length ? row("↳ البرنامج المنفّذ", ltr(c.agents.join(" · "))) : ""}
        ${c && c.signers.length ? row("↳ الجهة الموقّعة", ltr(c.signers.join(" · "))) : ""}
        ${c && acts.length ? row("↳ العمليات المسجّلة", esc(acts.join("، "))) : ""}
        ${row("نوع المصدر الرقمي (IPTC)", P.sourceType ? `<strong>${ST[P.sourceType] || esc(P.sourceTypeRaw)}</strong> <span class="small muted">· ${ltr(P.sourceTypeRaw)} · من ${esc(P.sourceTypeFrom)}</span>` : "غير مصرّح به", /ai/.test(P.sourceType || "") ? "sensitive" : "")}
        ${row("بصمات مولّدات الصور", P.generators.length ? P.generators.map((g) => `<strong class="text-danger">${esc(g.name)}</strong> <span class="small muted">· في ${esc(g.where)}${g.value ? `: ${ltr(g.value)}` : ""}</span>`).join("<br>") : "لم يُعثر على أي بصمة", P.generators.length ? "sensitive" : "")}
        ${P.prompt ? row("الأمر النصي (Prompt)", `<span class="ltr" dir="ltr" style="display:block;text-align:left;font-size:.85rem">${esc(P.prompt)}</span>`, "sensitive") : ""}
        ${P.details ? row("إعدادات التوليد", `<span class="ltr mono small" dir="ltr">${[["Steps", P.details.steps], ["Sampler", P.details.sampler], ["CFG", P.details.cfg], ["Seed", P.details.seed], ["Model", P.details.model], ["Size", P.details.size]].filter((x) => x[1]).map((x) => esc(x.join(" "))).join(" · ")}</span>`, "sensitive") : ""}
        ${P.aiEditors.length ? row("تطبيقات تحسين بالذكاء الاصطناعي", `<strong class="text-warn">${P.aiEditors.map((e) => esc(e.name)).join("، ")}</strong>`) : ""}
        ${P.software ? row("البرنامج الذي حفظ الملف", ltr(P.software)) : ""}
        ${P.credit ? row("حقل الاعتماد (Credit)", ltr(P.credit)) : ""}
        ${row("بيانات الكاميرا", cam.length ? cam.map((k) => `<span class="badge" style="margin:2px">${esc((window.ImgMeta && window.ImgMeta.LABELS[k]) || k)}: ${esc(fmt(k))}</span>`).join("") : "لا توجد")}
      </tbody></table></div>
      ${P.fields.length ? `<details class="mt-2"><summary class="link small" style="cursor:pointer">كل الحقول النصية التي قرأناها (${P.fields.length})</summary><div class="table-wrap mt-1"><table class="kv"><tbody>${P.fields.map(([k, v]) => row(ltr(k), `<span class="ltr small" dir="ltr" style="display:block;text-align:left">${esc(v)}</span>`)).join("")}</tbody></table></div></details>` : ""}
      <p class="small muted mt-2 mb-0">${ic("info")} نبحث عن اسم المولّد في حقول «الأداة» فقط، لا في وصف الصورة، حتى لا تُتَّهم صورة صحفية وصفها يذكر «ChatGPT» مثلاً. ومواقع التواصل تحذف كل هذه البيانات عند الرفع، فغيابها لا يعني أن الصورة حقيقية. <a class="link" href="tool-metadata.html">عارض الميتاداتا الكامل</a></p>`;
    icons();
  }

  function renderFile() {
    const P = R.prov, j = R.jpeg;
    const row = (k, v) => `<tr><th>${k}</th><td>${v}</td></tr>`;
    $("#v-file").innerHTML = `<div class="card-title"><span class="ico ico-sm">${ic("file-search")}</span><h3>بطاقة الملف</h3></div>
      <div class="table-wrap"><table class="kv"><tbody>
        ${row("اسم الملف", `<span class="ltr" dir="ltr">${esc(R.name)}</span>`)}
        ${row("الصيغة والحجم", `${KIND[P.kind] || P.kind} · ${fmtBytes(R.file.size)}${R.w ? ` · ${R.w}×${R.h} بكسل (${(R.w * R.h / 1e6).toFixed(1)} ميغابكسل)` : ""}`)}
        ${j ? row("ضغط JPEG", `جودة تقديرية ${j.quality}% · ${j.standard ? "جداول ضغط قياسية (برنامج أو منصة أعادت حفظ الصورة)" : "جداول ضغط خاصة (كاميرا أو تطبيق متخصص)"}`) : ""}
        ${row("مصدر الملف المحتمل", P.platform ? `<strong>${esc(P.platform.name)}</strong> <span class="small muted">· ${esc(P.platform.why)}</span>` : "غير معروف")}
        ${R.hash ? row("بصمة الملف SHA-256", `<button class="ltr mono small" dir="ltr" data-copy="${R.hash}" title="نسخ" style="background:none;border:0;color:inherit;cursor:pointer;word-break:break-all;text-align:left;padding:0">${R.hash}</button>`) : ""}
        ${row("وقت الفحص", esc(R.when.toLocaleString("ar-IQ")))}
      </tbody></table></div>
      <p class="small muted mt-2 mb-0">${ic("info")} بصمة SHA-256 تعرّف هذا الملف بالذات: أرفقها بتقريرك ليتأكد غيرك أنه فحص النسخة نفسها. أي إعادة حفظ أو إرسال عبر واتساب تغيّرها.</p>`;
    icons();
  }

  function renderLimits() {
    $("#v-limits").innerHTML = `<div class="card-title"><span class="ico ico-sm">${ic("shield-alert")}</span><h3>حدود الأداة: اقرأها قبل أن تعتمد على النتيجة</h3></div>
      <div class="grid grid-2" style="gap:14px">
        <div><strong class="small">ما قسناه بأنفسنا</strong>
          <p class="small muted mt-1">${T.summary}</p>
          <div class="table-wrap"><table class="kv small"><tbody>${T.rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("")}</tbody></table></div>
          <p class="small muted mt-1 mb-0">${T.removed}</p>
        </div>
        <div><strong class="small">ما لا تستطيعه</strong>
          <ul class="small muted mt-1" style="padding-inline-start:18px;margin:0;display:grid;gap:6px">
            <li>لا يوجد كاشف دقيق 100%. النتيجة ترجيح يساعدك، وليست حكماً قضائياً.</li>
            <li>لا تقرأ العلامات المائية المخفية (مثل SynthID من غوغل)؛ لا تقرؤها إلا الشركة التي صنعتها.</li>
            <li>لا تتحقق من توقيع C2PA تشفيرياً؛ تقرأ محتواه فقط.</li>
            <li>تضعف مع لقطات الشاشة والصور الصغيرة والمضغوطة مراراً والصور التي فوقها نصوص وشعارات.</li>
            <li>تتردد أمام الرسوم الرقمية والمشاهد ثلاثية الأبعاد (CGI) ولقطات الأفلام، لأنها ليست «صورة كاميرا» ولا «صورة مولّدة».</li>
            <li>لا تكشف التعديل الجزئي (وجه مبدَّل أو عنصر مضاف في صورة حقيقية). لذلك استخدم <a class="link" href="tool-forensics.html">كاشف التعديل</a>.</li>
            <li>المولّدات تتطور كل شهر، وما يُكشف اليوم قد يفلت غداً.</li>
          </ul>
        </div>
      </div>`;
    icons();
  }

  function drawHist(cv, h) {
    const W = cv.width = 512, H = cv.height = 150, x = cv.getContext("2d");
    x.fillStyle = "#0b1224"; x.fillRect(0, 0, W, H);
    const all = [...h.r, ...h.g, ...h.b].sort((a, b) => a - b); const mx = all[Math.floor(all.length * .995)] || 1;
    x.globalCompositeOperation = "lighter";
    [[h.r, "rgba(239,83,80,.75)"], [h.g, "rgba(102,187,106,.75)"], [h.b, "rgba(66,165,245,.75)"]].forEach(([arr, col]) => {
      x.fillStyle = col; x.beginPath(); x.moveTo(0, H);
      for (let i = 0; i < 256; i++) x.lineTo(i * 2, H - Math.min(1, arr[i] / mx) * (H - 6));
      x.lineTo(W, H); x.closePath(); x.fill();
    });
    x.globalCompositeOperation = "source-over"; x.strokeStyle = "rgba(255,255,255,.85)"; x.lineWidth = 1.5; x.beginPath();
    for (let i = 0; i < 256; i++) { const y = H - Math.min(1, h.l[i] / mx) * (H - 6); i ? x.lineTo(i * 2, y) : x.moveTo(0, y); }
    x.stroke();
  }

  function renderColors() {
    const C = R.colors, el = $("#v-colors");
    if (!C) { el.hidden = true; return; }
    const HUES = ["أحمر", "برتقالي", "أصفر", "أخضر مصفر", "أخضر", "أخضر مزرق", "سماوي", "أزرق فاتح", "أزرق", "بنفسجي", "أرجواني", "وردي"];
    const hsum = C.hue.reduce((a, b) => a + b, 0) || 1;
    const stat = (v, l, hint) => `<div style="background:var(--surface-2);border-radius:12px;padding:12px"><strong style="display:block;font-size:1.15rem;color:var(--gold)">${v}</strong><span class="small">${l}</span>${hint ? `<span class="small muted" style="display:block">${hint}</span>` : ""}</div>`;
    const cf = C.colorfulness; const cfL = cf < 15 ? "باهتة جداً" : cf < 33 ? "هادئة" : cf < 59 ? "متوسطة الحيوية" : cf < 82 ? "حيوية" : "مشبعة جداً";
    const tempL = C.temperature > 25 ? "دافئة (تميل للأحمر والأصفر)" : C.temperature < -15 ? "باردة (تميل للأزرق)" : "متوازنة";
    const dom = C.palette[0];
    el.innerHTML = `<summary class="card-title" style="cursor:pointer;margin-bottom:0"><span class="ico ico-sm">${ic("palette")}</span><h3>تحليل الألوان <span class="small muted">· وصفي، لا يدخل في الحكم</span></h3></summary>
      <p class="small muted mt-2">اللون الغالب: <strong style="color:var(--text)">${esc(dom.name)}</strong> (${pct(dom.pct)}) · الطابع العام: <strong style="color:var(--text)">${cfL}</strong> و<strong style="color:var(--text)">${tempL}</strong></p>
      <div class="flex" style="height:64px;border-radius:14px;overflow:hidden;border:1px solid var(--border)">${C.palette.map((p) => `<div title="${esc(p.name)} ${pct(p.pct)}" style="flex:${p.pct};background:${p.hex}"></div>`).join("")}</div>
      <div class="grid mt-2" style="grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px">${C.palette.map((p) => `<button class="flex gap-1 items-center" data-copy="${p.hex}" title="نسخ" style="padding:8px;border-radius:12px;border:1px solid var(--border);background:var(--surface-2);cursor:pointer;text-align:start">
        <span style="width:32px;height:32px;border-radius:9px;background:${p.hex};border:1px solid var(--border);flex-shrink:0"></span><span><strong class="small" style="display:block">${esc(p.name)}</strong><span class="small muted ltr">${p.hex} · ${pct(p.pct)}</span></span></button>`).join("")}</div>
      <div class="grid grid-2 mt-3" style="align-items:start">
        <div><strong class="small">المدرج التكراري (أحمر وأخضر وأزرق، والسطوع بالأبيض)</strong><canvas id="hist" style="width:100%;height:auto;border-radius:12px;margin-top:8px"></canvas>
          <div class="flex between small muted"><span>ظلال</span><span>إضاءات</span></div></div>
        <div><strong class="small">توزيع الألوان على العجلة اللونية</strong>
          <div class="flex mt-1" style="height:28px;border-radius:8px;overflow:hidden;border:1px solid var(--border)">${Array.from(C.hue).map((v, i) => v / hsum > .005 ? `<div title="${HUES[i]} ${pct(v / hsum)}" style="flex:${v / hsum};background:hsl(${i * 30 + 15},75%,52%)"></div>` : "").join("") || '<div style="flex:1;background:var(--surface-2)"></div>'}</div>
          <div class="grid mt-2" style="grid-template-columns:repeat(2,1fr);gap:8px">
            ${stat(pct(C.saturation), "متوسط التشبع", `${pct(C.hiSat)} من البكسلات عالية التشبع`)}
            ${stat(cf.toFixed(0), "مؤشر الحيوية اللونية", cfL)}
            ${stat(pct(C.brightness), "متوسط السطوع", `التباين ${C.contrast.toFixed(0)}`)}
            ${stat(`${(C.clipLow * 100).toFixed(1)}% / ${(C.clipHigh * 100).toFixed(1)}%`, "سواد تام / بياض محروق", "")}
          </div>
        </div>
      </div>
      <p class="small muted mt-2 mb-0">${ic("info")} الألوان لا تكشف التوليد: في اختبارنا لم تختلف ألوان الصور المولّدة عن الحقيقية بما يكفي للتمييز، والفلاتر تصنع أي طابع لوني. هذا القسم للوصف والتوثيق فقط.</p>`;
    drawHist($("#hist"), C.hist); icons();
  }

  function renderSecond() {
    const L = [
      ["Content Credentials", "https://contentcredentials.org/verify", "shield-check", "الأداة الرسمية للتحقق من توقيع C2PA ومن أنشأ الصورة."],
      ["Google Gemini (SynthID)", "https://gemini.google.com/", "sparkles", "الجهة الوحيدة التي تقرأ علامة SynthID المخفية في صور غوغل."],
      ["Hive AI Detector", "https://hivemoderation.com/ai-generated-content-detection", "hexagon", "كاشف تجاري يحدد المولّد المحتمل، ومجاني للاستخدام المحدود."],
      ["AI or Not", "https://www.aiornot.com/", "scan-eye", "فحص مجاني محدود للصور."],
      ["Sightengine", "https://sightengine.com/detect-ai-generated-images", "eye", "نسخة تجريبية مجانية تقترح المولّد المستخدم."],
      ["البحث العكسي", "tool-reverse.html", "images", "ابحث عن أصل الصورة وأقدم ظهور لها."]
    ];
    $("#v-second").innerHTML = `<div class="card-title"><span class="ico ico-sm">${ic("users")}</span><h3>خذ رأياً ثانياً</h3></div>
      <p class="small muted">للأخبار الحساسة لا تكتفِ بأداة واحدة، ولا بأداتنا. انتبه: المواقع الخارجية ترفع صورتك إلى خوادمها، وبعضها يحدّد عدد الفحوص المجانية.</p>
      <div class="grid grid-3" style="gap:10px">${L.map(([t, h, i, d]) => `<a href="${h}" ${h.startsWith("http") ? 'target="_blank" rel="noopener"' : ""} class="flex gap-1" style="padding:12px;border-radius:12px;border:1px solid var(--border);align-items:flex-start">
        <span class="ico ico-sm">${ic(i)}</span><span><strong class="small">${t}</strong><span class="small muted" style="display:block">${d}</span></span></a>`).join("")}</div>`;
    icons();
  }

  /* ---------- التصدير ---------- */
  const baseName = () => R.name.replace(/\.[^.]+$/, "") || "image";
  function textReport() {
    const v = R.verdict, P = R.prov, c = P.c2pa; const L = [];
    const mark = (e) => (e.dir > 0 ? "▲ يدعم التوليد" : e.dir < 0 ? "▼ يدعم أنها حقيقية" : "• معلومة");
    L.push(`تقرير فحص صورة: هل هي مولّدة بالذكاء الاصطناعي؟`, `${window.SITE.name} · ${R.when.toLocaleString("ar-IQ")}`, "");
    L.push("■ النتيجة", `${v.label}`, `درجة الثقة: ${CONF[v.confidence][0]}`, `طريقة الفحص: ${methodOf(v)}`);
    if (v.note) L.push(`ملاحظة: ${v.note}`);
    L.push("", "■ الملف", `الاسم: ${R.name}`, `الصيغة: ${KIND[P.kind] || P.kind} · ${fmtBytes(R.file.size)}${R.w ? ` · ${R.w}×${R.h}` : ""}`);
    if (R.jpeg) L.push(`ضغط JPEG: جودة ${R.jpeg.quality}% · جداول ${R.jpeg.standard ? "قياسية" : "خاصة"}`);
    if (P.platform) L.push(`مصدر محتمل: ${P.platform.name} (${P.platform.why})`);
    if (R.hash) L.push(`SHA-256: ${R.hash}`);
    L.push("", "■ لماذا هذه النتيجة (من الأقوى إلى الأضعف)");
    v.why.forEach((e, i) => L.push(`${i + 1}. [${mark(e)}${e.s === "معلومة" ? "" : " · وزنه " + e.s}] ${e.t}`, `   ${e.d}`));
    L.push("", "■ الأدلة داخل الملف");
    L.push(`C2PA: ${c ? `موجودة${c.generator ? ` · الأداة: ${c.generator}` : ""}${c.agents.length ? ` · البرنامج: ${c.agents.join(", ")}` : ""}${c.signers.length ? ` · الموقّع: ${c.signers.join(", ")}` : ""} (التوقيع غير متحقق منه هنا)` : "غير موجودة"}`);
    L.push(`نوع المصدر الرقمي IPTC: ${P.sourceType ? `${ST[P.sourceType] || P.sourceTypeRaw} (${P.sourceTypeRaw})` : "غير مصرّح به"}`);
    L.push(`بصمات مولّدات: ${P.generators.length ? P.generators.map((g) => `${g.name} [${g.where}]`).join("؛ ") : "لا توجد"}`);
    if (P.prompt) L.push(`الأمر النصي: ${P.prompt}`);
    if (P.details) L.push(`إعدادات التوليد: ${["steps", "sampler", "cfg", "seed", "model"].filter((k) => P.details[k]).map((k) => `${k}=${P.details[k]}`).join(", ")}`);
    if (P.software) L.push(`البرنامج: ${P.software}`);
    const cam = [R.exif.Make, R.exif.Model].filter(Boolean).join(" "); L.push(`الكاميرا: ${cam || "لا بيانات"}`);
    L.push("", "■ نماذج الكشف");
    if (v.models.length) v.models.forEach((m) => L.push(`${m.name}: ${pct(m.p)} → ${m.vote === "ai" ? "يرصد توليداً" : m.vote === "clean" ? "لا يرصد توليداً" : "متردد"} (العتبتان ${pct(m.lo)} / ${pct(m.hi)})`));
    else L.push("لم تُشغَّل.");
    L.push("", "■ حدود هذه النتيجة", `- ${T.summary}`, ...T.rows.map(([k, val]) => `- ${k}: ${val}`), "- لا يوجد كاشف دقيق 100%؛ النتيجة ترجيح وليست دليلاً قاطعاً (إلا إذا كان الدليل مكتوباً داخل الملف).", "- الأداة لا تقرأ علامة SynthID ولا تتحقق من توقيع C2PA تشفيرياً ولا تكشف التعديل الجزئي.", "- جرى الفحص كله داخل المتصفح ولم تُرفع الصورة إلى أي خادم.");
    L.push("", `افحص صورك مجاناً: ${location.origin}${location.pathname}`);
    return L.join("\n");
  }
  function exportJson() {
    const v = R.verdict, P = R.prov;
    const rep = {
      tool: `${window.SITE.name}: المحقق الذكي`, generated: R.when.toISOString(),
      file: { name: R.name, size: R.file.size, sha256: R.hash, format: P.kind, width: R.w, height: R.h, jpeg: R.jpeg, platform: P.platform },
      verdict: { level: v.level, label: v.label, confidence: v.confidence, method: methodOf(v), note: v.note, hardEvidence: v.hard },
      reasons: v.why.map((e) => ({ direction: e.dir > 0 ? "ai" : e.dir < 0 ? "real" : "info", strength: e.s, title: e.t, detail: e.d })),
      models: v.models.map((m) => ({ id: m.id, name: m.name, source: m.by, aiProbability: +m.p.toFixed(4), vote: m.vote, thresholds: { clean: m.lo, ai: m.hi } })),
      provenance: { c2pa: P.c2pa, digitalSourceType: P.sourceTypeRaw || null, digitalSourceTypeFrom: P.sourceTypeFrom || null, generators: P.generators, aiEditors: P.aiEditors, editors: P.editors, prompt: P.prompt || null, generation: P.details, software: P.software || null, credit: P.credit || null, fields: P.fields },
      camera: { make: R.exif.Make || null, model: R.exif.Model || null, fields: v.camFields },
      limits: { test: T, notes: ["No detector is 100% accurate.", "SynthID watermarks are not read.", "C2PA signatures are parsed, not cryptographically verified.", "Analysis ran entirely in the browser."] }
    };
    download(new Blob([JSON.stringify(rep, null, 2)], { type: "application/json" }), baseName() + "-ai-report.json");
  }

  dropzone($("#dz"), $("#file"), analyze);
})();
