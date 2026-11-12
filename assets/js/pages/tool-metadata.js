(function () {
  const { $, esc, ic, icons, toast, copy, download, fmtBytes, dropzone, store } = App;
  const M = window.ImgMeta, S = window.MetaScan, PV = window.Provenance;
  const items = []; let current = -1, uid = 0, busy = false;
  const opts = store.get("meta-opts", { keepICC: true, keepOrientation: true });

  const LEVELS = {
    clean: { t: "لا بيانات حساسة", d: "لم نجد في الملف ما يكشف شيئاً عن صاحبه.", color: "var(--success)", cls: "success" },
    low: { t: "خطر منخفض", d: "بيانات قليلة لا تكشف الكثير.", color: "var(--info)", cls: "info" },
    medium: { t: "خطر متوسط", d: "الملف يكشف معلومات عن الجهاز أو وقت الإنشاء.", color: "var(--warn)", cls: "warn" },
    high: { t: "خطر مرتفع", d: "الملف يكشف الموقع أو بيانات تعريفية. نظّفه قبل المشاركة.", color: "var(--danger)", cls: "danger" }
  };
  const STATES = {
    ai: { cls: "danger", icon: "bot", t: "تصريح بالذكاء الاصطناعي" }, edited: { cls: "warn", icon: "pencil-ruler", t: "آثار تعديل" },
    camera: { cls: "success", icon: "camera", t: "بيانات كاميرا" }, conflict: { cls: "warn", icon: "triangle-alert", t: "تعارضات" }, stripped: { cls: "info", icon: "eraser", t: "بلا ميتاداتا" }, partial: { cls: "info", icon: "file-question", t: "ميتاداتا جزئية" }
  };
  const KIND_ICON = { pdf: "file-text", mp4: "film", mov: "film" };
  const isImage = (k) => !["pdf", "mp4", "mov", "other"].includes(k);
  const plain = (h) => String(h).replace(/<[^>]+>/g, "");
  const fmtLocal = (ms) => new Intl.DateTimeFormat("ar-IQ-u-nu-latn-ca-gregory", { dateStyle: "medium", timeStyle: "short" }).format(ms);

  /* ---------- قراءة الملفات ---------- */
  async function addFiles(files) {
    if (!files.length) return;
    $("#upload").hidden = true; $("#workspace").hidden = false;
    const fresh = files.map((file) => ({ id: ++uid, file, loading: true }));
    items.push(...fresh);
    if (current < 0) current = 0;
    renderList(); renderDetail();
    for (const it of fresh) {
      try { await processFile(it); } catch (e) { it.error = "تعذّرت قراءة هذا الملف."; }
      it.loading = false;
      if (!items.includes(it)) continue; // أُعيدت الصفحة أثناء القراءة
      renderList();
      if (items[current] === it) renderDetail();
    }
  }

  async function processFile(it) {
    const f = it.file;
    const kind = S.sniff(new Uint8Array(await f.slice(0, 64).arrayBuffer()));
    const whole = isImage(kind) && f.size <= 400 * 1048576;
    const bytes = whole ? new Uint8Array(await f.arrayBuffer()) : null;
    it.R = await S.scan(f, { bytes });
    it.prov = null;
    if (bytes && PV && kind !== "other") { try { it.prov = await PV.provenance(bytes, { name: f.name }); } catch { /* اختياري */ } }
    it.dims = { w: 0, h: 0, url: null };
    if (isImage(kind) && kind !== "other") it.dims = await M.dims(f);
    else if (kind === "mp4" || kind === "mov") it.dims = { w: it.R.image.w || 0, h: it.R.image.h || 0, url: URL.createObjectURL(f), video: true };
    it.url = it.dims.url;
    it.thumbs = it.R.thumbs.map((t) => ({ src: t.src, size: t.bytes.length, blob: new Blob([t.bytes], { type: "image/jpeg" }) }));
    it.thumbs.forEach((t) => { t.url = URL.createObjectURL(t.blob); });
    it.thumbCmp = it.thumbs.length && it.url && !it.dims.video ? await compareThumb(f, it.thumbs[0].blob, it.R.orientation) : null;
    it.A = S.analyze(it.R, { name: f.name, lastModified: f.lastModified, dims: it.dims, prov: it.prov, thumbCmp: it.thumbCmp });
  }

  /* ---------- مقارنة الصورة المصغّرة بالصورة ---------- */
  const OT = (o, N) => ({ 2: [-1, 0, 0, 1, N, 0], 3: [-1, 0, 0, -1, N, N], 4: [1, 0, 0, -1, 0, N], 5: [0, 1, 1, 0, 0, 0], 6: [0, 1, -1, 0, N, 0], 7: [0, -1, -1, 0, N, N], 8: [0, -1, 1, 0, 0, N] })[o];
  function luma(bmp, N, crop, orient) {
    const mid = document.createElement("canvas"); mid.width = mid.height = 128;
    const m = mid.getContext("2d"); m.imageSmoothingQuality = "high";
    const c = crop || { x: 0, y: 0, w: bmp.width, h: bmp.height };
    const t = orient && OT(orient, 128); if (t) m.setTransform(...t);
    m.drawImage(bmp, c.x, c.y, c.w, c.h, 0, 0, 128, 128);
    const out = document.createElement("canvas"); out.width = out.height = N;
    const x = out.getContext("2d", { willReadFrequently: true }); x.imageSmoothingQuality = "high";
    x.drawImage(mid, 0, 0, N, N);
    const d = x.getImageData(0, 0, N, N).data, g = new Float32Array(N * N);
    for (let i = 0; i < g.length; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    return g;
  }
  // بعض الكاميرات تحفظ المصغّرة بأشرطة سوداء أعلى وأسفل: نقصّها قبل المقارنة
  function letterbox(bmp) {
    const N = 64, g = luma(bmp, N);
    const dark = (i, row) => { let s = 0, mx = 0; for (let k = 0; k < N; k++) { const v = row ? g[i * N + k] : g[k * N + i]; s += v; if (v > mx) mx = v; } return s / N < 14 && mx < 45; };
    let top = 0, bot = 0, left = 0, right = 0;
    while (top < N / 3 && dark(top, true)) top++; while (bot < N / 3 && dark(N - 1 - bot, true)) bot++;
    while (left < N / 3 && dark(left, false)) left++; while (right < N / 3 && dark(N - 1 - right, false)) right++;
    const c = { x: 0, y: 0, w: bmp.width, h: bmp.height };
    if (top >= 2 && bot >= 2) { c.y = Math.round((top / N) * bmp.height); c.h = Math.round(((N - top - bot) / N) * bmp.height); }
    if (left >= 2 && right >= 2) { c.x = Math.round((left / N) * bmp.width); c.w = Math.round(((N - left - right) / N) * bmp.width); }
    return c;
  }
  async function compareThumb(file, thumbBlob, orientation) {
    try {
      const [a, b] = await Promise.all([createImageBitmap(file), createImageBitmap(thumbBlob)]);
      const crop = letterbox(b), swap = orientation >= 5;
      const ra = a.width / a.height, rb = swap ? crop.h / crop.w : crop.w / crop.h;
      const aspect = Math.abs(ra - rb) / ra > 0.06;
      const N = 32, ga = luma(a, N), gb = luma(b, N, crop, orientation);
      let sum = 0, big = 0; for (let i = 0; i < ga.length; i++) { const d = Math.abs(ga[i] - gb[i]); sum += d; if (d > 40) big++; }
      const diff = sum / ga.length / 255, changed = big / ga.length;
      return { ok: true, aspect, diff: aspect ? null : Math.max(diff, changed), differs: aspect || diff > 0.07 || changed > 0.04, tw: b.width, th: b.height };
    } catch { return { ok: false }; }
  }

  /* ---------- قائمة الملفات ---------- */
  function renderList() {
    const n = items.length;
    $("#count").textContent = S.cnt(n, ["ملف واحد", "ملفان", "ملفات", "ملفاً"]);
    $("#clean-all").hidden = !items.some((x) => x.R && isImage(x.R.kind) && x.R.kind !== "other");
    $("#report-all").hidden = n < 2;
    $("#files").hidden = n < 2;
    $("#files").innerHTML = items.map((it, i) => {
      if (it.loading) return `<button class="mx-file${i === current ? " active" : ""}" data-i="${i}">${ic("loader")}<span class="mx-file-name ltr">${esc(it.file.name)}</span><span class="badge">جارِ القراءة</span></button>`;
      if (it.error || !it.A) return `<button class="mx-file${i === current ? " active" : ""}" data-i="${i}">${ic("file-x")}<span class="mx-file-name ltr">${esc(it.file.name)}</span><span class="badge badge-danger">تعذّرت القراءة</span></button>`;
      const st = STATES[it.A.state], lv = LEVELS[it.A.level];
      return `<button class="mx-file${i === current ? " active" : ""}" data-i="${i}" title="${esc(it.file.name)}">
        ${ic(KIND_ICON[it.R.kind] || "image")}<span class="mx-file-name ltr">${esc(it.file.name)}</span>
        <span class="mx-file-badges">${it.R.gps && !it.R.gps.zero ? `<span class="badge badge-danger">${ic("map-pin")}GPS</span>` : ""}<span class="badge badge-${st.cls}">${ic(st.icon)}${st.t}</span><span class="mx-dot" style="background:${lv.color}" title="الخصوصية: ${lv.t}"></span>${it.cleaned ? `<span class="badge badge-success">${ic("check")}نُظّف</span>` : ""}</span></button>`;
    }).join("");
    icons();
  }

  /* ---------- أجزاء العرض ---------- */
  function ring(score, color) {
    const C = 2 * Math.PI * 52;
    return `<div class="score-ring mx-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-2)" stroke-width="12"/>
      <circle cx="60" cy="60" r="52" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - score / 100)}"/></svg>
      <span class="val" style="color:${color}">${score}</span></div>`;
  }
  const card = (icon, title, body, extra = "") => `<div class="card"${extra}><div class="card-title"><span class="ico ico-sm">${ic(icon)}</span><h3>${title}</h3></div>${body}</div>`;

  function previewCard(it) {
    const R = it.R;
    let inner;
    if (it.dims.video) inner = `<video src="${it.url}" controls preload="metadata" playsinline></video>`;
    else if (it.url) inner = `<img src="${it.url}" alt="معاينة الملف">`;
    else inner = `<div class="empty">${ic(R.kind === "pdf" ? "file-text" : "image-off")}<p class="mt-1 small">${R.kind === "pdf" ? "مستند PDF: نقرأ بياناته الوصفية فقط." : R.kind === "other" ? "صيغة غير معروفة." : "متصفحك لا يعرض هذه الصيغة، لكننا قرأنا بياناتها كاملة."}</p></div>`;
    return `<div class="card" style="padding:12px"><div class="preview-box">${inner}</div></div>`;
  }

  function summaryCard(it) {
    const A = it.A, st = STATES[A.state];
    return `<div class="card mx-summary">
      <div class="card-title"><span class="ico ico-sm">${ic("search-check")}</span><h3>خلاصة للمتحقق</h3></div>
      <span class="badge badge-${st.cls}">${ic(st.icon)}${st.t}</span>
      <h3 class="mx-headline">${esc(A.headline)}</h3>
      <p class="muted mb-0">${esc(A.sub)}</p>
      ${A.verify.length ? `<div class="stack mt-2" style="gap:8px">${A.verify.map((f) => `<div class="alert alert-${f.level}">${ic(f.icon)}<div><strong>${esc(f.title)}</strong><p>${f.text}</p></div></div>`).join("")}</div>` : ""}
      <details class="mx-limits"><summary>${ic("scale")}كيف أقرأ هذه النتائج؟ (حدود الأداة)${ic("chevron-down")}</summary>
        <ul>
          <li><strong>غياب الميتاداتا لا يعني التزييف.</strong> فيسبوك وإنستغرام وإكس وواتساب وتليغرام تحذفها من كل صورة، حقيقية كانت أم مفبركة.</li>
          <li><strong>وجودها لا يثبت الأصالة.</strong> أي حقل هنا (التاريخ، الموقع، الكاميرا) يمكن كتابته أو نسخه من صورة أخرى بأدوات مجانية خلال ثوانٍ.</li>
          <li><strong>القيمة في الاتساق.</strong> التزوير المتقن صعب: يجب أن تتوافق التواريخ ووقت الأقمار الصناعية والأبعاد والصورة المصغّرة وملاحظات المصنّع معاً. كل تعارض نعرضه هنا خيط يستحق المتابعة.</li>
          <li><strong>ساعات الكاميرات تخطئ.</strong> تاريخ خاطئ قد يكون ساعة غير مضبوطة لا تلاعباً.</li>
          <li><strong>«برنامج تعديل» لا يساوي «مفبركة».</strong> القصّ وتصحيح الألوان يتركان الأثر نفسه الذي يتركه التركيب.</li>
          <li>لا نفكّ ملاحظات المصنّع (MakerNote) تفصيلياً، ولا نتحقق من توقيع C2PA الرقمي، ولا نفحص البكسلات هنا.</li>
        </ul></details>
      <div class="btn-row mt-2">
        <button class="btn btn-ghost btn-sm" id="copy-report">${ic("copy")}نسخ التقرير</button>
        <button class="btn btn-ghost btn-sm" id="export">${ic("file-json")}تنزيل JSON</button>
      </div>
      <div class="btn-row mt-1">
        <a class="btn btn-ghost btn-sm" href="tool-reverse.html">${ic("search")}بحث عكسي</a>
        <a class="btn btn-ghost btn-sm" href="tool-forensics.html">${ic("scan-eye")}فحص التلاعب بالبكسلات</a>
        <a class="btn btn-ghost btn-sm" href="tool-ai.html">${ic("scan-face")}كاشف الذكاء الاصطناعي</a>
      </div>
    </div>`;
  }

  function privacyCard(it) {
    const A = it.A, lv = LEVELS[A.level], R = it.R, can = isImage(R.kind) && R.kind !== "other";
    return `<div class="card" id="actions">
      <div class="card-title"><span class="ico ico-sm">${ic("shield")}</span><h3>الخصوصية والتنظيف</h3></div>
      <div class="flex gap-2 items-center wrap">
        ${ring(A.score, lv.color)}
        <div style="flex:1;min-width:180px">
          <span class="badge badge-${lv.cls}">${ic(A.level === "clean" ? "shield-check" : "shield-alert")}ما يكشفه الملف عن صاحبه</span>
          <h3 class="mt-1" style="font-size:1.25rem;color:${lv.color}">${lv.t}</h3>
          <p class="mb-0 muted">${lv.d}</p>
        </div>
      </div>
      ${A.privacy.length ? `<ul class="mx-leaks">${A.privacy.map((f) => `<li class="text-${f.level}">${ic(f.icon)}<span>${esc(f.text)}</span></li>`).join("")}</ul>` : ""}
      ${can ? `<hr class="mx-hr">
        <label class="check"><input type="checkbox" id="o-icc" ${opts.keepICC ? "checked" : ""}> الاحتفاظ بملف الألوان (ICC) لدقة الألوان</label>
        <label class="check"><input type="checkbox" id="o-orient" ${opts.keepOrientation ? "checked" : ""}> الاحتفاظ باتجاه الصورة (لكي لا تظهر مقلوبة)</label>
        <div class="btn-row mt-2"><button class="btn btn-primary" id="clean">${ic("eraser")}امسح كل الميتاداتا وحمّل نسخة نظيفة</button></div>
        <div id="clean-result" class="mt-2"></div>`
      : `<p class="small muted mt-2 mb-0">${ic("info")} التنظيف متاح للصور فقط. الفيديو والـ PDF نقرأ بياناتهما دون تعديل الملف.</p>`}
    </div>`;
  }

  function fileCard(it) {
    const R = it.R, f = it.file, d = it.dims.w ? it.dims : R.image.w ? R.image : null;
    return card("file-search", "الملف", `<table class="kv mx-kv"><tbody>
      <tr><th>الاسم</th><td class="ltr" style="text-align:right">${esc(f.name)}</td></tr>
      <tr${R.extMismatch ? ' class="sensitive"' : ""}><th>الصيغة الحقيقية</th><td>${esc(R.kindLabel)}${R.extMismatch ? ` <strong>(الامتداد .${esc(R.ext)} لا يطابق)</strong>` : ""}</td></tr>
      <tr><th>الحجم</th><td>${fmtBytes(f.size)} <span class="muted small ltr">(${f.size.toLocaleString("en")} بايت)</span></td></tr>
      ${d ? `<tr><th>الأبعاد</th><td><span class="ltr">${d.w} × ${d.h}</span> بكسل${isImage(R.kind) ? ` (${((d.w * d.h) / 1e6).toFixed(1)} ميغابكسل)` : ""}</td></tr>` : ""}
      ${f.lastModified ? `<tr><th>آخر تعديل على جهازك<br><span class="small muted">يتغيّر عند التنزيل أو النسخ، فلا يُعتمد عليه</span></th><td>${fmtLocal(f.lastModified)}</td></tr>` : ""}
      <tr><th>بصمة SHA-256<br><span class="small muted">تطابقها يعني أن الملفين متطابقان بايتاً ببايت</span></th><td><span class="mono ltr mx-hash" id="hash">${it.hash || "…"}</span></td></tr>
    </tbody></table>`);
  }

  function gpsCard(it) {
    const g = it.R.gps; if (!g) return "";
    const pos = `${g.lat.toFixed(6)}, ${g.lon.toFixed(6)}`;
    const extra = [g.alt != null ? `الارتفاع ${g.alt.toFixed(0)} م` : "", g.dir != null ? `الكاميرا موجّهة نحو ${S.compass(g.dir)} (${g.dir.toFixed(0)}°)` : "", g.acc != null ? `الدقة ± ${(+g.acc).toFixed(0)} م` : ""].filter(Boolean).join(" · ");
    return `<div class="card" id="gps-card">
      <div class="card-title"><span class="ico ico-sm" style="background:var(--danger-soft);color:var(--danger)">${ic("map-pin")}</span><h3>مكان ${it.R.video ? "تصوير الفيديو" : "التصوير"}</h3><span class="badge" style="margin-inline-start:auto">من ${esc(g.src)}</span></div>
      ${g.zero ? `<div class="alert alert-warn">${ic("map-pin-off")}<span>الإحداثيات (0، 0) قيمة فارغة لا مكان حقيقي.</span></div>` : `
      <div class="mx-map" id="map" dir="ltr"><div class="mx-map-cover"><button class="btn btn-primary btn-sm" id="map-load">${ic("map")}اعرض الخريطة</button><small>ستُحمَّل مربعات الخريطة المحيطة بالموقع من خوادم OpenStreetMap. الصورة نفسها لا تُرسل.</small></div></div>
      <p class="mono ltr mt-1 mb-0" style="text-align:right">${pos}</p>
      ${extra ? `<p class="small muted mb-0">${esc(extra)}</p>` : ""}
      <div class="btn-row mt-1">
        <button class="btn btn-ghost btn-sm" data-copy="${pos}">${ic("copy")}نسخ الإحداثيات</button>
        <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.openstreetmap.org/?mlat=${g.lat}&mlon=${g.lon}#map=17/${g.lat}/${g.lon}">${ic("map")}OpenStreetMap</a>
        <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${g.lat},${g.lon}&t=k">${ic("satellite")}صور الأقمار (غوغل)</a>
        <button class="btn btn-ghost btn-sm" id="geocode">${ic("map-pinned")}ما اسم هذا المكان؟</button>
      </div>
      <div id="place" class="mt-1"></div>
      <div class="alert alert-danger mt-2">${ic("triangle-alert")}<span><strong>تحذير خصوصية</strong>هذه الإحداثيات قد تدل على بيت أو مكان عمل. لا تنشرها عن شخص دون سبب صحفي واضح، ونظّف صورك قبل مشاركتها.</span></div>`}
    </div>`;
  }

  function timelineCard(it) {
    const R = it.R, f = it.file; const list = R.dates.map((d) => ({ ...d }));
    if (it.A.fileNameDate) list.push({ label: "التاريخ في اسم الملف", src: "الاسم", wall: it.A.fileNameDate.wall, dateOnly: it.A.fileNameDate.dateOnly, tz: null, soft: true, text: f.name });
    if (f.lastModified) { const off = -new Date(f.lastModified).getTimezoneOffset(); list.push({ label: "آخر تعديل للملف على جهازك", src: "نظام التشغيل", wall: f.lastModified + off * 60000, tz: off, soft: true, text: "" }); }
    if (!R.dates.length) return "";
    list.sort((a, b) => a.wall - b.wall);
    // الحقول التي تحمل اللحظة نفسها تُدمج في سطر واحد
    const merged = [];
    for (const d of list) {
      const m = merged.find((x) => x.wall === d.wall && !!x.dateOnly === !!d.dateOnly && !!x.soft === !!d.soft && (x.tz == null || d.tz == null || x.tz === d.tz));
      if (!m) { merged.push({ ...d, labels: [d.label], srcs: [d.src] }); continue; }
      if (!m.labels.includes(d.label)) m.labels.push(d.label); if (!m.srcs.includes(d.src)) m.srcs.push(d.src);
      if (m.tz == null && d.tz != null) { m.tz = d.tz; m.utc = d.utc; } if (d.id === "original") m.id = "original";
    }
    list.length = 0; list.push(...merged.map((m) => ({ ...m, label: m.labels.join(" · "), src: m.srcs.join(" + ") })));
    const hist = R.history.filter((h) => h.wall != null).length;
    return card("calendar-clock", "الخط الزمني", `<p class="small muted">الأوقات معروضة كما كُتبت في الملف، دون تحويلها إلى توقيت جهازك.${hist ? ` أحداث سجل التحرير المؤرَّخة (${hist}) في قسم «البرامج وآثار التعديل».` : ""}</p>
      <ol class="mx-tl">${list.map((d) => `<li class="${d.soft ? "soft" : ""}${d.id === "original" ? " main" : ""}"><span class="mx-tl-label">${esc(d.label)} <span class="badge">${esc(d.src)}</span></span>
        <strong>${esc(S.fmtDate(d.wall, d.dateOnly))}</strong>
        <span class="mono small muted ltr">${esc(S.isoWall(d.wall, d.dateOnly))}${d.utc != null && d.tz === 0 && !d.soft ? " UTC" : d.tz != null ? " " + S.tzText(d.tz) : " (بلا منطقة زمنية)"}</span></li>`).join("")}</ol>`);
  }

  function provCard(it) {
    const pv = it.prov; if (!pv) return "";
    const has = pv.c2pa || pv.generators.length || pv.sourceType || pv.prompt || pv.aiEditors.length;
    if (!has) return "";
    const d = pv.details, c = pv.c2pa;
    const ST = { ai: "مولَّدة بنموذج ذكاء اصطناعي", "composite-ai": "مركّبة تتضمن عناصر مولَّدة", composite: "مركّبة", algorithmic: "مولَّدة بخوارزمية (غير تعلّم آلي)", capture: "التقاط بكاميرا", screen: "لقطة شاشة", art: "رسم أو إبداع رقمي", edited: "صورة معدّلة يدوياً" };
    const rows = [
      pv.generators.length ? ["المولّد", pv.generators.map((g) => `${esc(g.name)} <span class="small muted">(${esc(g.where)})</span>`).join("، ")] : null,
      pv.sourceType ? ["نوع المصدر الرقمي", `${ST[pv.sourceType] || esc(pv.sourceTypeRaw)} <span class="small muted ltr">(${esc(pv.sourceTypeRaw)} · ${esc(pv.sourceTypeFrom)})</span>`] : null,
      c && c.generator ? ["منشئ سجل C2PA", esc(c.generator)] : null,
      c && c.signers.length ? ["الجهة الموقِّعة", esc(c.signers.join("، "))] : null,
      c && c.actions.length ? ["العمليات المسجّلة", esc(c.actions.map((a) => (PV.C2PA_ACTIONS && PV.C2PA_ACTIONS[a]) || a).join("، "))] : null,
      d && d.model ? ["النموذج", esc(d.model)] : null,
      d && (d.steps || d.sampler || d.cfg || d.seed) ? ["إعدادات التوليد", esc([d.steps && `Steps ${d.steps}`, d.sampler && `Sampler ${d.sampler}`, d.cfg && `CFG ${d.cfg}`, d.seed && `Seed ${d.seed}`, d.size && `Size ${d.size}`].filter(Boolean).join(" · "))] : null
    ].filter(Boolean);
    return card("bot", "المنشأ والذكاء الاصطناعي", `
      <table class="kv mx-kv"><tbody>${rows.map(([k, v]) => `<tr><th>${k}</th><td dir="auto">${v}</td></tr>`).join("")}</tbody></table>
      ${pv.prompt ? `<p class="small muted mt-2 mb-0">أمر التوليد (Prompt) المحفوظ داخل الملف:</p><div class="mx-long" dir="auto">${esc(pv.prompt)}</div>${d && d.negative ? `<p class="small muted mt-1 mb-0">الأمر السلبي:</p><div class="mx-long" dir="auto">${esc(d.negative)}</div>` : ""}` : ""}
      <p class="small muted mt-2 mb-0">هذه البطاقة تعرض ما يصرّح به الملف نفسه فقط. لفحص الصورة بصرياً بالنماذج استخدم <a class="link" href="tool-ai.html">كاشف الذكاء الاصطناعي</a>${c ? `، وللتحقق من توقيع C2PA استخدم <a class="link" href="https://contentcredentials.org/verify" target="_blank" rel="noopener">contentcredentials.org/verify</a>` : ""}.</p>`);
  }

  function thumbCard(it) {
    if (!it.thumbs.length) return "";
    const tc = it.thumbCmp;
    const verdict = !tc || !tc.ok ? `<div class="alert alert-info">${ic("info")}<span>تعذّرت المقارنة الآلية${it.url ? "" : " لأن المتصفح لا يعرض هذه الصيغة"}. قارن بالعين.</span></div>`
      : tc.differs ? `<div class="alert alert-warn">${ic("triangle-alert")}<div><strong>المصغّرة تختلف عن الصورة</strong><p>${tc.aspect ? "نسبة الأبعاد مختلفة، فالصورة قُصّت بعد حفظ المصغّرة." : `اختلاف في المحتوى بنسبة ${Math.round(tc.diff * 100)}%.`} المصغّرة قد تُظهر الصورة قبل التعديل.</p></div></div>`
      : `<div class="alert alert-success">${ic("badge-check")}<span>المصغّرة تطابق الصورة (فرق ${Math.round((tc.diff || 0) * 100)}%).</span></div>`;
    return card("images", "الصورة المصغّرة المضمّنة", `
      <p class="small muted">الكاميرا تحفظ نسخة صغيرة من الصورة داخل الملف لحظة الالتقاط. بعض برامج التعديل لا تحدّثها، فتبقى شاهدة على الأصل.</p>
      <div class="mx-thumbs">
        ${it.url ? `<figure><img src="${it.url}" alt="الصورة الحالية"><figcaption>الصورة الحالية</figcaption></figure>` : ""}
        ${it.thumbs.map((t, i) => `<figure><img src="${t.url}" alt="الصورة المصغّرة" class="${[0, 0, 0, "r180", 0, 0, "r90", 0, "r270"][it.R.orientation] || ""}"><figcaption>مصغّرة ${esc(t.src)} · ${fmtBytes(t.size)} <button class="btn btn-ghost btn-sm" data-thumb="${i}">${ic("download")}</button></figcaption></figure>`).join("")}
      </div>${verdict}`);
  }

  const longVal = (v) => v.length > 180 || /\n/.test(v);
  const valHtml = (r) => longVal(r.value) ? `<div class="mx-long" dir="auto">${esc(r.value.length > 6000 ? r.value.slice(0, 6000) + "…" : r.value)}</div><button class="btn btn-ghost btn-sm mt-1" data-copy="${esc(r.value)}">${ic("copy")}نسخ النص كاملاً</button>` : esc(r.value);

  function historyHtml(R) {
    if (!R.history.length) return "";
    return `<div class="mx-hist"><p class="small muted mb-0">سجل التحرير (XMP History): كل سطر عملية أجراها برنامج على الملف.</p><ol>${R.history.map((h) => `<li><strong>${esc(h.actionAr)}</strong>${h.agent ? ` بـ <span class="ltr">${esc(h.agent)}</span>` : ""}${h.wall != null ? `<br><span class="small muted">${esc(S.fmtDate(h.wall))}${h.tz != null ? ` <span class="ltr">${S.tzText(h.tz)}</span>` : ""}</span>` : ""}${h.params ? `<br><span class="small muted ltr">${esc(h.params)}</span>` : ""}</li>`).join("")}</ol></div>`;
  }

  function sectionsHtml(it) {
    const R = it.R, out = [];
    for (const sec of S.SECTIONS) {
      if (sec.id === "structure") continue;
      const rows = R.rows.filter((r) => r.sec === sec.id); if (!rows.length && !(sec.id === "software" && R.history.length)) continue;
      const sens = rows.filter((r) => r.sens).length;
      const open = ["gps", "device", "time", "author", "software", "text", "doc"].includes(sec.id);
      out.push(`<details class="card mx-sec" ${open ? "open" : ""}>
        <summary><span class="ico ico-sm">${ic(sec.icon)}</span><strong>${sec.title}</strong>${sens ? `<span class="badge badge-danger">${sens} حساس</span>` : ""}<span class="badge">${rows.length}</span>${ic("chevron-down")}</summary>
        <div class="mx-sec-body">${sec.id === "software" ? historyHtml(R) : ""}
        <table class="kv mx-kv"><tbody>${rows.map((r) => `<tr class="${r.sens ? "sensitive" : ""}"><th>${esc(r.label)}<br><span class="mono small muted ltr">${esc(r.src)}${r.label !== r.key ? " · " + esc(r.key) : ""}</span>${r.help ? `<span class="mx-help">${esc(r.help)}</span>` : ""}</th><td dir="auto">${valHtml(r)}</td></tr>`).join("")}</tbody></table></div></details>`);
    }
    if (R.structure.length) out.push(`<details class="card mx-sec"><summary><span class="ico ico-sm">${ic("layers")}</span><strong>بنية الملف (المقاطع)</strong><span class="badge">${R.structure.length}</span>${ic("chevron-down")}</summary>
      <div class="mx-sec-body"><p class="small muted">ترتيب المقاطع داخل الملف كما هي. يفيد في رؤية ما أضافته البرامج إلى الملف.</p>
      <table class="kv mx-kv mx-struct"><tbody>${R.structure.map((s) => `<tr><th class="mono ltr">${esc(s.name)}</th><td>${esc(s.note)}${s.size ? ` <span class="muted small">· ${S.bytesLabel(s.size)}</span>` : ""}</td></tr>`).join("")}</tbody></table></div></details>`);
    return out.join("");
  }

  function renderDetail() {
    const it = items[current], box = $("#detail");
    if (!it) { box.innerHTML = ""; return; }
    if (it.loading) { box.innerHTML = `<div class="card empty"><span class="ico">${ic("loader")}</span><h3>جارِ قراءة الملف…</h3><p class="mb-0 ltr">${esc(it.file.name)}</p></div>`; icons(); return; }
    if (it.error || !it.A) { box.innerHTML = `<div class="card empty"><span class="ico">${ic("file-x")}</span><h3>تعذّرت قراءة هذا الملف</h3><p class="mb-0 ltr">${esc(it.file.name)}</p></div>`; icons(); return; }
    const R = it.R;
    const unknown = R.kind === "other" ? `<div class="alert alert-warn mb-2">${ic("file-question")}<span>لم نتعرّف على صيغة هذا الملف. ندعم JPG و PNG و WebP و GIF و HEIC و AVIF و TIFF، وقراءة فقط لـ MP4 / MOV و PDF.</span></div>` : "";
    box.innerHTML = `${unknown}<div class="tool-layout">
      <div class="stack">${previewCard(it)}${summaryCard(it)}${privacyCard(it)}${fileCard(it)}</div>
      <div class="stack">${gpsCard(it)}${timelineCard(it)}${provCard(it)}${thumbCard(it)}${sectionsHtml(it) || `<div class="card empty"><span class="ico">${ic("shield-check")}</span><h3>لا توجد حقول ميتاداتا</h3><p class="mb-0">الملف لا يحمل بيانات وصفية. قد يكون نُظّف مسبقاً أو مرّ بمنصة تحذفها تلقائياً.</p></div>`}</div>
    </div>`;
    icons();

    if (!it.hash) M.sha256(it.file).then((h) => { it.hash = h || "غير متاح"; const el = $("#hash"); if (el && items[current] === it) el.textContent = it.hash; }).catch(() => {});
    const on = (sel, ev, fn) => { const el = $(sel); if (el) el.addEventListener(ev, fn); };
    on("#o-icc", "change", (e) => { opts.keepICC = e.target.checked; store.set("meta-opts", opts); });
    on("#o-orient", "change", (e) => { opts.keepOrientation = e.target.checked; store.set("meta-opts", opts); });
    on("#clean", "click", () => cleanOne(it, true).catch(() => {}));
    on("#export", "click", () => download(new Blob([JSON.stringify(report(it), null, 2)], { type: "application/json" }), it.file.name.replace(/\.[^.]+$/, "") + "-metadata.json"));
    on("#copy-report", "click", () => copy(textReport(it)));
    on("#map-load", "click", () => { it.mapZ = 15; drawMap(it); });
    on("#geocode", "click", () => geocode(it));
    box.querySelectorAll("[data-thumb]").forEach((b) => b.addEventListener("click", () => { const t = it.thumbs[+b.dataset.thumb]; download(t.blob, it.file.name.replace(/\.[^.]+$/, "") + "-thumbnail.jpg"); }));
    if (it.mapZ) drawMap(it);
    if (it.place) showPlace(it);
    if (it.cleaned) showCleanResult(it);
  }

  /* ---------- خريطة مربعات OpenStreetMap (بلا مكتبات) ---------- */
  function drawMap(it) {
    const el = $("#map"), g = it.R.gps; if (!el || !g) return;
    const z = it.mapZ, n = 2 ** z, W = el.clientWidth || 320, H = el.clientHeight || 260;
    const lat = Math.max(-85, Math.min(85, g.lat)) * Math.PI / 180;
    const px = ((g.lon + 180) / 360) * n * 256, py = ((1 - Math.log(Math.tan(lat) + 1 / Math.cos(lat)) / Math.PI) / 2) * n * 256;
    const left = px - W / 2, top = py - H / 2; let tiles = "";
    for (let tx = Math.floor(left / 256); tx * 256 < left + W; tx++) for (let ty = Math.floor(top / 256); ty * 256 < top + H; ty++) {
      if (ty < 0 || ty >= n) continue;
      tiles += `<img alt="" draggable="false" src="https://tile.openstreetmap.org/${z}/${((tx % n) + n) % n}/${ty}.png" style="left:${Math.round(tx * 256 - left)}px;top:${Math.round(ty * 256 - top)}px">`;
    }
    el.innerHTML = `${tiles}${g.dir != null ? `<span class="mx-map-dir" style="transform:translate(-50%,-100%) rotate(${g.dir}deg)"></span>` : ""}<span class="mx-map-pin">${ic("map-pin")}</span>
      <div class="mx-map-zoom"><button type="button" data-z="1" aria-label="تكبير">+</button><button type="button" data-z="-1" aria-label="تصغير">−</button></div>
      <a class="mx-map-attr" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">© OpenStreetMap</a>`;
    icons();
    el.querySelectorAll("[data-z]").forEach((b) => b.addEventListener("click", () => { it.mapZ = Math.max(2, Math.min(19, it.mapZ + +b.dataset.z)); drawMap(it); }));
  }
  async function geocode(it) {
    const g = it.R.gps, btn = $("#geocode"); if (!g || !btn) return;
    btn.disabled = true; $("#place").innerHTML = `<p class="small muted mb-0">${ic("loader")} جارِ السؤال عن اسم المكان…</p>`; icons();
    try {
      const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&accept-language=ar&lat=${g.lat.toFixed(6)}&lon=${g.lon.toFixed(6)}`);
      const j = await r.json(); if (!j || !j.display_name) throw new Error();
      it.place = j.display_name;
    } catch { it.place = ""; $("#place").innerHTML = `<p class="small text-warn mb-0">تعذّر جلب اسم المكان (تحتاج اتصالاً بالإنترنت). افتح الإحداثيات في الخريطة.</p>`; btn.disabled = false; return; }
    if (items[current] === it) showPlace(it);
  }
  function showPlace(it) { const el = $("#place"); if (el && it.place) { el.innerHTML = `<div class="alert alert-info">${ic("map-pinned")}<span><strong>أقرب عنوان (OpenStreetMap)</strong>${esc(it.place)}</span></div>`; icons(); const b = $("#geocode"); if (b) b.hidden = true; } }

  /* ---------- التنظيف والتحقق ---------- */
  const cleanName = (name, ext) => name.replace(/\.[^.]+$/, "") + "-clean." + ext;
  const LEFT = { exif: "EXIF", gps: "GPS", xmp: "XMP", iptc: "IPTC", makernote: "ملاحظات المصنّع", c2pa: "C2PA", comments: "تعليقات", text: "نصوص مضمّنة", thumbnail: "صورة مصغّرة", photoshop: "موارد فوتوشوب", trailing: "بيانات ملحقة" };

  async function pixelsEqual(a, b) {
    try {
      const [x, y] = await Promise.all([createImageBitmap(a), createImageBitmap(b)]);
      if (x.width !== y.width || x.height !== y.height) return false;
      const s = Math.min(1, Math.sqrt(12e6 / (x.width * x.height))), w = Math.max(1, Math.round(x.width * s)), h = Math.max(1, Math.round(x.height * s));
      const px = (bmp) => { const c = document.createElement("canvas"); c.width = w; c.height = h; const t = c.getContext("2d", { willReadFrequently: true }); t.imageSmoothingEnabled = false; t.drawImage(bmp, 0, 0, w, h); return t.getImageData(0, 0, w, h).data; };
      const p = px(x), q = px(y);
      for (let i = 0; i < p.length; i++) if (p[i] !== q[i]) return false;
      return true;
    } catch { return null; }
  }

  async function cleanOne(it, doDownload) {
    const btn = $("#clean"); if (btn && doDownload) { btn.disabled = true; btn.innerHTML = `${ic("loader")}جارِ التنظيف…`; icons(); }
    try {
      const r = await M.strip(it.file, { ...opts, orientation: it.R.orientation || 1 });
      const name = cleanName(it.file.name, r.ext);
      // التحقق: نعيد فحص الملف الناتج بالمحرك نفسه
      const cf = new File([r.blob], name, { type: r.blob.type });
      const R2 = await S.scan(cf);
      const left = Object.keys(LEFT).filter((k) => R2.has[k] && !(k === "exif" && R2.exifOnlyOrientation));
      const iccDropped = it.R.has.icc && !R2.has.icc;
      const same = r.method === "lossless" && !iccDropped && (!(it.R.orientation > 1) || R2.orientation === it.R.orientation) ? await pixelsEqual(it.file, r.blob) : null;
      it.cleaned = { ...r, name, left, same, iccDropped, keptOrient: R2.exifOnlyOrientation && R2.orientation > 1, keptIcc: R2.has.icc, hash: await M.sha256(r.blob).catch(() => null) };
      if (doDownload) { download(r.blob, name); toast("نُظّفت الصورة وبدأ تنزيلها"); }
      renderList();
      if (items[current] === it) showCleanResult(it);
      return it.cleaned;
    } catch (e) {
      const el = $("#clean-result");
      if (doDownload && el) { el.innerHTML = `<div class="alert alert-danger">${ic("circle-x")}<span>${esc(e.message)}</span></div>`; icons(); }
      throw e;
    } finally {
      if (btn && doDownload && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = `${ic("eraser")}امسح كل الميتاداتا وحمّل نسخة نظيفة`; icons(); }
    }
  }

  function showCleanResult(it) {
    const c = it.cleaned, el = $("#clean-result"); if (!el) return;
    const ok = !c.left.length, saved = it.file.size - c.blob.size;
    const li = (good, text) => `<li class="${good ? "ok" : "bad"}">${ic(good ? "check" : "x")}<span>${text}</span></li>`;
    el.innerHTML = `<div class="alert alert-${ok ? "success" : "warn"}">${ic(ok ? "badge-check" : "triangle-alert")}<div>
      <strong>${ok ? "تم التحقق: النسخة نظيفة" : `بقيت بيانات: ${c.left.map((k) => LEFT[k]).join("، ")}`}</strong>
      <p>أعدنا فحص الملف الناتج بالمحرّك نفسه بعد تنظيفه.</p></div></div>
      <ul class="mx-checks">
        ${li(ok, ok ? "لا EXIF ولا GPS ولا XMP ولا IPTC ولا تعليقات ولا صورة مصغّرة ولا بيانات ملحقة" : "ما زالت فيه مقاطع ميتاداتا")}
        ${c.method === "lossless" ? li(c.same !== false, c.same === true ? "البكسلات مطابقة للأصل 100% (قارنّاها بكسلاً ببكسل)" : c.same === false ? "البكسلات اختلفت عن الأصل" : c.iccDropped ? "حُذف ملف الألوان، فقد تختلف درجات الألوان قليلاً عند العرض (البيانات المضغوطة لم تُمسّ)" : "البيانات المضغوطة لم تُمسّ (تعذّرت المقارنة البصرية في هذا المتصفح)") : li(false, "أُعيد ترميز الصورة بأعلى جودة لأن صيغتها لا تُنظَّف مباشرة، فالبكسلات ليست مطابقة تماماً")}
        ${c.keptOrient ? li(true, "أُبقي حقل اتجاه الصورة فقط لتظهر معتدلة") : ""}
        ${c.keptIcc ? li(true, "أُبقي ملف الألوان (لا يحمل بيانات شخصية)") : ""}
        ${li(true, `الحجم: ${fmtBytes(it.file.size)} ← ${fmtBytes(c.blob.size)}${saved > 0 ? ` (أصغر بـ ${fmtBytes(saved)})` : ""}`)}
      </ul>
      ${c.removed.length ? `<p class="small muted">المحذوف: ${[...new Set(c.removed)].map(esc).join("، ")}</p>` : `<p class="small muted">لم يكن في الملف ما يُحذف.</p>`}
      <p class="small muted">اسم الملف نفسه قد يكشف التاريخ أو المصدر، فغيّره إن لزم.</p>
      <button class="btn btn-ghost btn-sm" id="redl">${ic("download")}تنزيل النسخة النظيفة مرة أخرى</button>`;
    icons();
    $("#redl").addEventListener("click", () => download(c.blob, c.name));
  }

  /* ZIP بلا ضغط (الصور مضغوطة أصلاً)، بلا مكتبات */
  function zipStore(files) {
    const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
    const u16 = (n) => [n & 255, (n >> 8) & 255], u32 = (n) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
    const now = new Date(), time = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1), date = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    for (const f of files) {
      const name = enc.encode(f.name), crc = M.crc32(f.bytes), head = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(time), ...u16(date), ...u32(crc), ...u32(f.bytes.length), ...u32(f.bytes.length), ...u16(name.length), ...u16(0)];
      parts.push(new Uint8Array([0x50, 0x4B, 3, 4, ...head]), name, f.bytes);
      central.push(new Uint8Array([0x50, 0x4B, 1, 2, ...u16(20), ...head, ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset)]), name);
      offset += 30 + name.length + f.bytes.length;
    }
    const csize = central.reduce((a, p) => a + p.length, 0);
    return new Blob([...parts, ...central, new Uint8Array([0x50, 0x4B, 5, 6, 0, 0, 0, 0, ...u16(files.length), ...u16(files.length), ...u32(csize), ...u32(offset), 0, 0])], { type: "application/zip" });
  }

  async function cleanAll() {
    const btn = $("#clean-all"); const ready = items.filter((x) => !x.loading && x.R && isImage(x.R.kind) && x.R.kind !== "other");
    if (!ready.length || busy) return;
    busy = true; btn.disabled = true; btn.innerHTML = `${ic("loader")}جارِ التنظيف…`; icons();
    try {
      const done = [], failed = [];
      for (const it of ready) { try { done.push(it.cleaned || await cleanOne(it, false)); } catch { failed.push(it.file.name); } }
      if (!done.length) throw new Error("لم نتمكن من تنظيف أي صورة.");
      if (done.length === 1) download(done[0].blob, done[0].name);
      else {
        const names = new Set(), files = [];
        for (const c of done) { let n = c.name, k = 1; while (names.has(n)) n = c.name.replace(/(\.[^.]+)$/, `-${++k}$1`); names.add(n); files.push({ name: n, bytes: new Uint8Array(await c.blob.arrayBuffer()) }); }
        download(zipStore(files), "images-clean.zip");
      }
      const dirty = done.filter((c) => c.left.length).length;
      toast(`نُظّف ${done.length} من ${ready.length}${failed.length ? `، وتعذّر ${failed.length}` : ""}${dirty ? `، وبقيت بيانات في ${dirty}` : ""}`, failed.length || dirty ? "triangle-alert" : "check");
      if (items[current] && items[current].cleaned) showCleanResult(items[current]);
    } catch (e) { toast(e.message, "triangle-alert"); }
    finally { busy = false; btn.disabled = false; btn.innerHTML = `${ic("eraser")}تنظيف كل الصور (ZIP)`; icons(); }
  }

  /* ---------- التقارير ---------- */
  function report(it) {
    const R = it.R, A = it.A, pv = it.prov, d = it.dims.w ? it.dims : R.image;
    const secs = {};
    for (const sec of S.SECTIONS) { const rows = R.rows.filter((r) => r.sec === sec.id); if (rows.length) secs[sec.title] = rows.map((r) => ({ field: r.key, label: r.label, source: r.src, value: r.value, raw: r.raw, sensitive: r.sens || undefined })); }
    return {
      tool: "الإمبراطورية العراقية - عارض ومزيل الميتاداتا", generated: new Date().toISOString(),
      note: "الميتاداتا قرينة لا دليل قاطع: يمكن حذفها أو تزويرها، وغيابها لا يعني التزييف.",
      file: { name: it.file.name, format: R.kindLabel, extensionMismatch: R.extMismatch || undefined, size: it.file.size, width: d.w || null, height: d.h || null, sha256: it.hash || null, lastModifiedOnDevice: it.file.lastModified ? new Date(it.file.lastModified).toISOString() : null },
      summary: { state: A.state, headline: A.headline, detail: A.sub, findings: A.verify.map((f) => ({ level: f.level, title: f.title, text: plain(f.text) })) },
      privacy: { score: A.score, level: A.level, leaks: A.privacy.map((f) => f.text) },
      gps: R.gps ? { latitude: R.gps.lat, longitude: R.gps.lon, altitude: R.gps.alt, direction: R.gps.dir, accuracy: R.gps.acc, source: R.gps.src, place: it.place || undefined } : null,
      dates: R.dates.map((x) => ({ label: x.label, source: x.src, asWritten: x.text, local: S.isoWall(x.wall, x.dateOnly), utcOffset: x.tz != null ? S.tzText(x.tz) : null })),
      device: R.device, software: R.tools, editHistory: R.history.map((h) => ({ action: h.action, when: h.when, software: h.agent, parameters: h.params || undefined })),
      provenance: pv ? { generators: pv.generators, digitalSourceType: pv.sourceTypeRaw || null, c2pa: pv.c2pa, prompt: pv.prompt || null, platform: pv.platform } : null,
      thumbnail: it.thumbCmp && it.thumbCmp.ok ? { differs: it.thumbCmp.differs, aspectDiffers: it.thumbCmp.aspect, difference: it.thumbCmp.diff } : null,
      trailingData: R.trailing, fields: secs, structure: R.structure
    };
  }

  function textReport(it) {
    const R = it.R, A = it.A, L = [], d = it.dims.w ? it.dims : R.image;
    L.push("تقرير فحص الميتاداتا - الإمبراطورية العراقية", `التاريخ: ${fmtLocal(Date.now())}`, "");
    L.push(`الملف: ${it.file.name}`, `الصيغة: ${R.kindLabel}${R.extMismatch ? ` (الامتداد .${R.ext} لا يطابق)` : ""}`, `الحجم: ${fmtBytes(it.file.size)}${d.w ? ` · الأبعاد: ${d.w}×${d.h}` : ""}`);
    if (it.hash) L.push(`SHA-256: ${it.hash}`);
    L.push("", `الخلاصة: ${A.headline}`, A.sub, "");
    if (A.verify.length) { L.push("ملاحظات المتحقق:"); A.verify.forEach((f) => L.push(`- ${f.title}: ${plain(f.text)}`)); L.push(""); }
    if (R.gps) L.push(`الموقع: ${R.gps.lat.toFixed(6)}, ${R.gps.lon.toFixed(6)} (من ${R.gps.src})${it.place ? `\nالعنوان التقريبي: ${it.place}` : ""}`, `https://www.openstreetmap.org/?mlat=${R.gps.lat}&mlon=${R.gps.lon}#map=17/${R.gps.lat}/${R.gps.lon}`, "");
    if (R.dates.length) { L.push("التواريخ (كما كُتبت في الملف):"); R.dates.forEach((x) => L.push(`- ${x.label} [${x.src}]: ${S.isoWall(x.wall, x.dateOnly)}${x.tz != null ? " " + S.tzText(x.tz) : ""}`)); L.push(""); }
    if (R.history.length) { L.push("سجل التحرير:"); R.history.forEach((h) => L.push(`- ${h.actionAr}${h.agent ? ` بـ ${h.agent}` : ""}${h.when ? ` (${h.when})` : ""}`)); L.push(""); }
    L.push(`الخصوصية: ${LEVELS[A.level].t} (${A.score}/100)`); A.privacy.forEach((f) => L.push(`- ${f.text}`)); L.push("");
    for (const sec of S.SECTIONS) {
      const rows = R.rows.filter((r) => r.sec === sec.id); if (!rows.length) continue;
      L.push(`== ${sec.title} ==`); rows.forEach((r) => L.push(`${r.label}${r.label !== r.key ? ` (${r.key})` : ""}: ${r.value.length > 500 ? r.value.slice(0, 500) + "…" : r.value}`)); L.push("");
    }
    L.push("تنبيه: الميتاداتا قرينة لا دليل قاطع. يمكن حذفها أو تزويرها، وغيابها لا يعني التزييف.");
    return L.join("\n");
  }

  /* ---------- الأحداث ---------- */
  function reset() {
    items.forEach((x) => { if (x.url) URL.revokeObjectURL(x.url); (x.thumbs || []).forEach((t) => URL.revokeObjectURL(t.url)); });
    items.length = 0; current = -1;
    $("#workspace").hidden = true; $("#upload").hidden = false; $("#detail").innerHTML = ""; $("#files").innerHTML = "";
  }
  dropzone($("#dz"), $("#file"), addFiles);
  $("#add-more").addEventListener("click", () => $("#file").click());
  $("#files").addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (!b) return; current = +b.dataset.i; renderList(); renderDetail(); $("#detail").scrollIntoView({ behavior: "smooth", block: "start" }); });
  $("#clean-all").addEventListener("click", cleanAll);
  $("#report-all").addEventListener("click", () => { const ready = items.filter((x) => x.A); if (ready.length) download(new Blob([JSON.stringify(ready.map(report), null, 2)], { type: "application/json" }), "metadata-report.json"); });
  $("#reset").addEventListener("click", reset);
  let rz; addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { const it = items[current]; if (it && it.mapZ) drawMap(it); }, 200); });
})();
