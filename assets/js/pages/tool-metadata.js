(function () {
  const { $, $$, esc, ic, icons, toast, copy, download, fmtBytes, dropzone, store } = App;
  const M = window.ImgMeta;
  const items = []; let current = -1; let uid = 0;
  const opts = store.get("meta-opts", { keepICC: true, keepOrientation: true });

  const LEVELS = {
    clean: { t: "نظيفة", d: "لم نجد بيانات حساسة في هذه الصورة.", color: "var(--success)", cls: "success" },
    low: { t: "خطر منخفض", d: "بيانات قليلة لا تكشف الكثير عنك.", color: "var(--info)", cls: "info" },
    medium: { t: "خطر متوسط", d: "الصورة تكشف معلومات عن جهازك أو وقت التصوير.", color: "var(--warn)", cls: "warn" },
    high: { t: "خطر مرتفع", d: "الصورة تكشف موقعك أو بيانات تعريفية. امسحها قبل المشاركة!", color: "var(--danger)", cls: "danger" }
  };

  async function addFiles(files) {
    const imgs = files.filter((f) => f.type.startsWith("image/") || /\.(heic|heif|tiff?|dng)$/i.test(f.name));
    if (!imgs.length) { toast("اختر ملفات صور فقط", "alert-triangle"); return; }
    $("#upload").hidden = true; $("#workspace").hidden = false;
    for (const file of imgs) {
      const it = { id: ++uid, file, loading: true };
      items.push(it);
      if (current < 0) current = 0;
      renderThumbs();
      const [d, meta] = await Promise.all([M.dims(file), M.read(file)]);
      it.dims = d; it.url = d.url; it.meta = meta;
      it.groups = M.group(meta); it.risk = M.risk(meta, it.groups);
      it.loading = false;
      renderThumbs();
      if (items[current] === it) renderDetail();
    }
    if (items.length && !items[current].loading) renderDetail();
  }

  function renderThumbs() {
    $("#count").textContent = `${items.length} ${items.length === 1 ? "صورة" : "صور"}`;
    $("#thumbs").innerHTML = items.map((it, i) => {
      const lv = it.risk ? LEVELS[it.risk.level] : null;
      return `<button class="chip${i === current ? " active" : ""}" data-i="${i}" title="${esc(it.file.name)}">
        ${it.loading ? ic("loader") : `<span style="width:10px;height:10px;border-radius:50%;background:${lv.color};display:inline-block"></span>`}
        <span class="ltr" style="max-width:160px;overflow:hidden;text-overflow:ellipsis">${esc(it.file.name)}</span>${it.cleaned ? ic("check") : ""}</button>`;
    }).join("");
    icons();
  }

  function ring(score, color) {
    const C = 2 * Math.PI * 52;
    return `<div class="score-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-2)" stroke-width="12"/>
      <circle cx="60" cy="60" r="52" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - score / 100)}" style="transition:stroke-dashoffset .6s"/></svg>
      <span class="val" style="color:${color}">${score}</span></div>`;
  }

  function renderDetail() {
    const it = items[current]; if (!it || it.loading) return;
    const { meta, groups, risk, file, dims } = it;
    const lv = LEVELS[risk.level];
    const hints = M.sourceHints(file, dims);
    const g = meta.gps;
    const bbox = g ? [g.longitude - .01, g.latitude - .006, g.longitude + .01, g.latitude + .006].join(",") : "";
    const totalFields = groups.reduce((a, x) => a + x.items.length, 0);

    $("#detail").innerHTML = `
    <div class="tool-layout">
      <div class="stack">
        <div class="card" style="padding:12px">
          <div class="preview-box">${it.url ? `<img src="${it.url}" alt="معاينة الصورة">` : `<div class="empty">${ic("image-off")}<p class="mt-1 small">لا يمكن عرض هذه الصيغة في المتصفح، لكن تمت قراءة بياناتها.</p></div>`}</div>
        </div>
        <div class="card">
          <div class="card-title"><span class="ico ico-sm">${ic("file-image")}</span><h3>معلومات الملف</h3></div>
          <table class="kv"><tbody>
            <tr><th>الاسم</th><td class="ltr" style="text-align:right">${esc(file.name)}</td></tr>
            <tr><th>النوع</th><td>${esc(file.type || "غير معروف")}</td></tr>
            <tr><th>الحجم</th><td>${fmtBytes(file.size)}</td></tr>
            <tr><th>الأبعاد</th><td>${dims.w ? `<span class="ltr">${dims.w} × ${dims.h}</span> بكسل (${(dims.w * dims.h / 1e6).toFixed(1)} ميغابكسل)` : "—"}</td></tr>
            ${file.lastModified ? `<tr><th>آخر تعديل للملف</th><td>${new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(file.lastModified)}</td></tr>` : ""}
            <tr><th>بصمة SHA-256</th><td class="mono ltr" style="font-size:.75rem;text-align:right" id="hash">${it.hash || "…"}</td></tr>
          </tbody></table>
        </div>
        <div class="card" id="actions">
          <div class="card-title"><span class="ico ico-sm">${ic("eraser")}</span><h3>تنظيف الصورة</h3></div>
          <label class="check"><input type="checkbox" id="o-icc" ${opts.keepICC ? "checked" : ""}> الاحتفاظ بملف الألوان (ICC) لدقة الألوان</label>
          <label class="check"><input type="checkbox" id="o-orient" ${opts.keepOrientation ? "checked" : ""}> الاحتفاظ باتجاه الصورة (لكي لا تظهر مقلوبة)</label>
          <div class="btn-row mt-2">
            <button class="btn btn-primary" id="clean">${ic("download")}امسح الميتاداتا وحمّل</button>
            <button class="btn btn-ghost" id="export">${ic("file-json")}تصدير التقرير</button>
          </div>
          <div id="clean-result" class="mt-2"></div>
        </div>
      </div>

      <div class="stack">
        <div class="card">
          <div class="flex gap-2 items-center wrap">
            ${ring(risk.score, lv.color)}
            <div style="flex:1;min-width:200px">
              <span class="badge badge-${lv.cls}">${ic(risk.level === "clean" ? "shield-check" : "shield-alert")}مستوى الخطر</span>
              <h3 class="mt-1" style="font-size:1.35rem;color:${lv.color}">${lv.t}</h3>
              <p class="mb-0 muted">${lv.d} عثرنا على <strong>${totalFields}</strong> حقلاً من البيانات.</p>
            </div>
          </div>
          ${risk.findings.length ? `<div class="stack mt-2" style="gap:8px">${risk.findings.map((f) => `<div class="alert alert-${f.level}">${ic(f.icon)}<span>${f.text}</span></div>`).join("")}</div>` : ""}
          ${meta.error ? `<div class="alert alert-warn mt-2">${ic("alert-triangle")}<span>${esc(meta.error)}</span></div>` : ""}
        </div>

        ${g ? `<div class="card">
          <div class="card-title"><span class="ico ico-sm" style="background:var(--danger-soft);color:var(--danger)">${ic("map-pin")}</span><h3>مكان التصوير</h3></div>
          <iframe title="خريطة مكان التصوير" src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${g.latitude},${g.longitude}" style="width:100%;height:260px;border:0;border-radius:12px;background:var(--surface-2)" loading="lazy"></iframe>
          <p class="mono ltr mt-1 mb-0 small" style="text-align:right">${g.latitude.toFixed(6)}, ${g.longitude.toFixed(6)}</p>
          <div class="btn-row mt-1">
            <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.google.com/maps?q=${g.latitude},${g.longitude}">${ic("map")}غوغل ماب</a>
            <button class="btn btn-ghost btn-sm" data-copy="${g.latitude.toFixed(6)}, ${g.longitude.toFixed(6)}">${ic("copy")}نسخ الإحداثيات</button>
          </div>
        </div>` : ""}

        ${hints.length ? `<div class="card"><div class="card-title"><span class="ico ico-sm">${ic("search-check")}</span><h3>ملاحظات المحقق</h3></div>
          <ul class="mb-0" style="padding-inline-start:1.2em;color:var(--muted);font-size:.92rem">${hints.map((h) => `<li>${h}</li>`).join("")}</ul></div>` : ""}

        ${groups.length ? groups.map((gr, gi) => {
          const sens = gr.items.filter((x) => x.sensitive).length;
          const open = gi < 4 && !["xmp", "icc", "other"].includes(gr.id);
          return `<details class="card" ${open ? "open" : ""} style="padding:0">
            <summary style="padding:16px 20px;cursor:pointer;display:flex;align-items:center;gap:10px;list-style:none">
              <span class="ico ico-sm">${ic(gr.icon)}</span><strong style="flex:1">${gr.title}</strong>
              ${sens ? `<span class="badge badge-danger">${sens} حساس</span>` : ""}<span class="badge">${gr.items.length}</span></summary>
            <div class="table-wrap" style="padding:0 16px 12px"><table class="kv"><tbody>
              ${gr.items.map((x) => `<tr class="${x.sensitive ? "sensitive" : ""}"><th>${esc(x.label)}${x.label !== x.key ? `<br><span class="mono small muted ltr">${esc(x.key)}</span>` : ""}</th><td>${esc(x.value)}</td></tr>`).join("")}
            </tbody></table></div></details>`;
        }).join("") : `<div class="card empty"><span class="ico">${ic("shield-check")}</span><h3>لا توجد ميتاداتا</h3><p class="mb-0">هذه الصورة لا تحتوي على بيانات وصفية. قد تكون نُظّفت مسبقاً أو حُمّلت من منصة تحذفها تلقائياً.</p></div>`}
      </div>
    </div>`;
    icons();

    if (!it.hash) M.sha256(file).then((h) => { it.hash = h || "غير متاح"; const el = $("#hash"); if (el && items[current] === it) el.textContent = it.hash; });

    $("#o-icc").addEventListener("change", (e) => { opts.keepICC = e.target.checked; store.set("meta-opts", opts); });
    $("#o-orient").addEventListener("change", (e) => { opts.keepOrientation = e.target.checked; store.set("meta-opts", opts); });
    $("#clean").addEventListener("click", () => cleanOne(it, true));
    $("#export").addEventListener("click", () => exportReport(it));
    if (it.cleaned) showCleanResult(it);
  }

  const cleanName = (name, ext) => name.replace(/\.[^.]+$/, "") + "-clean." + ext;

  async function cleanOne(it, doDownload) {
    const btn = $("#clean"); if (btn && doDownload) { btn.disabled = true; btn.innerHTML = `${ic("loader")}جارِ التنظيف…`; icons(); }
    try {
      const r = await M.strip(it.file, { ...opts, orientation: it.meta.orientation || 1 });
      // verify
      const after = await M.read(new File([r.blob], "x", { type: r.blob.type }));
      const left = M.group(after).reduce((a, g) => a + g.items.filter((x) => x.sensitive).length, 0);
      it.cleaned = { ...r, left, name: cleanName(it.file.name, r.ext) };
      if (doDownload) { download(r.blob, it.cleaned.name); toast("تم تنظيف الصورة وتحميلها"); }
      renderThumbs();
      if (items[current] === it) showCleanResult(it);
      return it.cleaned;
    } catch (e) {
      if (doDownload) { $("#clean-result").innerHTML = `<div class="alert alert-danger">${ic("x-circle")}<span>${esc(e.message)}</span></div>`; icons(); }
      throw e;
    } finally {
      if (btn && doDownload && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = `${ic("download")}امسح الميتاداتا وحمّل`; icons(); }
    }
  }

  function showCleanResult(it) {
    const c = it.cleaned, el = $("#clean-result"); if (!el) return;
    const saved = it.file.size - c.blob.size;
    el.innerHTML = `<div class="alert alert-${c.left ? "warn" : "success"}">${ic(c.left ? "alert-triangle" : "badge-check")}<div>
      <strong>${c.left ? `بقي ${c.left} حقل حساس` : "تم التحقق: الصورة نظيفة"}</strong>
      <p>${c.method === "lossless" ? "تنظيف بلا فقدان للجودة" : "أُعيد ترميز الصورة بأعلى جودة"} · الحجم ${fmtBytes(it.file.size)} ← ${fmtBytes(c.blob.size)}${saved > 0 ? ` (وفّرت ${fmtBytes(saved)})` : ""}</p>
      ${c.removed.length ? `<p class="small">المحذوف: ${[...new Set(c.removed)].map(esc).join("، ")}</p>` : ""}
      </div></div>
      <button class="btn btn-ghost btn-sm mt-1" id="redl">${ic("download")}تحميل النسخة النظيفة مرة أخرى</button>`;
    icons();
    $("#redl").addEventListener("click", () => download(c.blob, c.name));
  }

  function exportReport(it) {
    const rep = {
      tool: "الإمبراطورية العراقية - عارض الميتاداتا",
      generated: new Date().toISOString(),
      file: { name: it.file.name, type: it.file.type, size: it.file.size, width: it.dims.w, height: it.dims.h, sha256: it.hash || null },
      risk: { score: it.risk.score, level: it.risk.level, findings: it.risk.findings.map((f) => f.text) },
      gps: it.meta.gps ? { latitude: it.meta.gps.latitude, longitude: it.meta.gps.longitude } : null,
      metadata: Object.fromEntries(it.groups.map((g) => [g.title, Object.fromEntries(g.items.map((x) => [x.key, x.value]))]))
    };
    download(new Blob([JSON.stringify(rep, null, 2)], { type: "application/json" }), it.file.name.replace(/\.[^.]+$/, "") + "-metadata.json");
  }

  function loadScript(src) {
    return new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = () => rej(new Error("تعذّر تحميل المكتبة")); document.head.appendChild(s); });
  }

  async function cleanAll() {
    const btn = $("#clean-all"); const ready = items.filter((x) => !x.loading);
    if (!ready.length) return;
    btn.disabled = true; btn.innerHTML = `${ic("loader")}جارِ التنظيف…`; icons();
    try {
      const done = [];
      for (const it of ready) { try { done.push(it.cleaned || await cleanOne(it, false)); } catch { /* skip unsupported */ } }
      if (!done.length) throw new Error("لم نتمكن من تنظيف أي صورة.");
      if (done.length === 1) { download(done[0].blob, done[0].name); }
      else {
        if (!window.JSZip) await loadScript("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js");
        const zip = new JSZip(); const names = new Set();
        done.forEach((c) => { let n = c.name, k = 1; while (names.has(n)) n = c.name.replace(/(\.[^.]+)$/, `-${++k}$1`); names.add(n); zip.file(n, c.blob); });
        download(await zip.generateAsync({ type: "blob" }), "images-clean.zip");
      }
      toast(`تم تنظيف ${done.length} من ${ready.length} صور`);
      if (items[current]?.cleaned) showCleanResult(items[current]);
    } catch (e) { toast(e.message, "alert-triangle"); }
    finally { btn.disabled = false; btn.innerHTML = `${ic("eraser")}تنظيف الكل وتحميل ZIP`; icons(); }
  }

  dropzone($("#dz"), $("#file"), addFiles);
  $("#add-more").addEventListener("click", () => $("#file").click());
  $("#thumbs").addEventListener("click", (e) => { const b = e.target.closest("[data-i]"); if (!b) return; current = +b.dataset.i; renderThumbs(); renderDetail(); });
  $("#clean-all").addEventListener("click", cleanAll);
  $("#reset").addEventListener("click", () => {
    items.forEach((x) => x.url && URL.revokeObjectURL(x.url)); items.length = 0; current = -1;
    $("#workspace").hidden = true; $("#upload").hidden = false; $("#detail").innerHTML = "";
  });
})();
