/* ضغط الصور والعلامة المائية: الواجهة. المعالجة نفسها في image-engine.js داخل Web Worker. */
(function () {
  const { $, $$, esc, ic, icons, toast, download, fmtBytes, dropzone, debounce, store } = App;
  const E = window.ImageEngine;
  const KEY = "imgtool:v2", LOGO_KEY = "imgtool:logo";
  const DEF = {
    fmt: "keep", mode: "q", q: 80, tval: 200, tunit: "kb", bg: "#ffffff", exif: false,
    size: "none", cw: "", ch: "", fit: "cover", pad: "#ffffff", padt: false,
    wm: false, wtype: "text", text: "@information_1q", font: "IBM Plex Sans Arabic|700", color: "#ffffff", shadow: true, outline: false,
    pos: "br", tile: false, wsize: 28, op: 70, ang: 0, margin: 3, gap: 60
  };
  const WM_KEYS = ["wtype", "text", "font", "color", "shadow", "outline", "pos", "tile", "wsize", "op", "ang", "margin", "gap"];
  const S = Object.assign({}, DEF, store.get(KEY, {}));
  const EXT = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png", "image/avif": "avif" };
  const LABEL = { "image/jpeg": "JPG", "image/webp": "WebP", "image/png": "PNG", "image/avif": "AVIF" };

  const items = []; let current = 0, uid = 0, gen = 0, running = false, activeJob = 0;
  let logoData = store.get(LOGO_KEY, ""), logoVer = 0, stampKey = "", stampId = 0, hasStamp = false;
  let before = { key: "", url: "" };

  /* ---------- engine: worker when possible, same code on the page otherwise ---------- */
  const eng = (() => {
    let w = null, seq = 0; const pend = new Map();
    const direct = () => { w = null; pend.forEach((p) => p.rej(Object.assign(new Error("worker"), { code: "cancel" }))); pend.clear(); };
    try {
      if (window.Worker && E.HAS_OFF) {
        w = new Worker("assets/js/image-worker.js");
        w.onmessage = (e) => { const d = e.data, p = pend.get(d.jobId); if (!p) return; pend.delete(d.jobId); d.t === "done" ? p.res(d.res) : p.rej(Object.assign(new Error(d.msg), { code: d.code })); };
        w.onerror = (e) => { e.preventDefault?.(); direct(); stampKey = ""; };
      }
    } catch { w = null; }
    return {
      send(msg) { w ? w.postMessage(msg) : E.handle(msg); },
      job(msg) {
        const jobId = ++seq; msg = Object.assign({ t: "job", jobId }, msg);
        const promise = w ? new Promise((res, rej) => { pend.set(jobId, { res, rej }); w.postMessage(msg); }) : E.handle(msg);
        return { jobId, promise };
      }
    };
  })();

  /* ---------- settings <-> controls ---------- */
  const resizeOf = () => {
    let r = { mode: "none" };
    if (S.size.startsWith("m:")) r = { mode: "max", max: +S.size.slice(2) };
    else if (S.size.startsWith("x:")) { const [w, h] = S.size.slice(2).split("x").map(Number); r = { mode: "exact", w, h }; }
    else if (S.size === "custom") { const w = Math.min(16000, Math.max(0, Math.round(+S.cw || 0))), h = Math.min(16000, Math.max(0, Math.round(+S.ch || 0))); if (w || h) r = { mode: "exact", w, h }; }
    if (r.mode === "exact") { r.fit = S.fit; r.pad = S.padt ? "transparent" : S.pad; }
    return r;
  };
  const targetBytes = () => S.mode === "t" ? Math.max(0, Math.round((+S.tval || 0) * (S.tunit === "mb" ? 1048576 : 1024))) : 0;
  const optsOf = () => ({
    fmt: S.fmt, quality: S.q / 100, target: targetBytes(), bg: S.bg, exif: !!S.exif, resize: resizeOf(),
    wm: { on: !!S.wm && hasStamp, size: S.wsize / 100, opacity: S.op / 100, angle: +S.ang, pos: S.pos, tile: !!S.tile, gap: S.gap / 100, margin: S.margin / 100 }
  });

  function paint() {
    $$("[data-k]").forEach((el) => { const v = S[el.dataset.k]; if (el.type === "checkbox") el.checked = !!v; else if (el.value !== String(v)) el.value = v; });
    $$("[data-seg]").forEach((g) => $$("button", g).forEach((b) => b.classList.toggle("active", b.dataset.v === S[g.dataset.seg])));
    const exact = S.size.startsWith("x:") || (S.size === "custom" && +S.cw > 0 && +S.ch > 0), png = S.fmt === "image/png";
    $("#q-field").hidden = S.mode !== "q"; $("#t-field").hidden = S.mode !== "t";
    $("#bg-field").hidden = !(S.fmt === "image/jpeg" || S.fmt === "keep");
    $("#exif").disabled = !(S.fmt === "image/jpeg" || S.fmt === "keep");
    $("#custom-field").hidden = S.size !== "custom"; $("#fit-field").hidden = !exact; $("#pad-field").hidden = S.fit !== "contain"; $("#pad").disabled = !!S.padt;
    $("#wm-opts").hidden = !S.wm; $("#wm-text-opts").hidden = S.wtype !== "text"; $("#wm-logo-opts").hidden = S.wtype !== "logo";
    $("#margin-field").hidden = !!S.tile; $("#gap-field").hidden = !S.tile; $(".im-pos").classList.toggle("off", !!S.tile);
    ["q", "wsize", "op", "ang", "margin", "gap"].forEach((k) => { $(`#${k}-v`).textContent = S[k]; });
    $("#q-hint").textContent = png ? "PNG: أقل من 95% يقلّص عدد الألوان (ضغط قوي مثل TinyPNG مع بقاء الشفافية)، و95% فأعلى بلا أي فقدان."
      : S.fmt === "keep" ? "75–85% أفضل موازنة. صور PNG تُضغط بتقليص الألوان وتبقى شفافيتها." : "75–85% أفضل موازنة بين الحجم والوضوح.";
    $("#fmt-hint").textContent = png ? "PNG مناسب للشعارات ولقطات الشاشة، أما صور الكاميرا فتكبر به كثيراً: اختر JPG أو WebP لها." : "";
    $("#size-hint").textContent = S.size.startsWith("m:") ? "يُصغَّر الضلع الأطول إلى هذا المقاس، والصور الأصغر منه لا تُكبَّر."
      : S.size === "custom" ? "اكتب العرض أو الارتفاع فقط للحفاظ على النسبة، أو الاثنين معاً لأبعاد ثابتة." : exact ? "تخرج كل الصور بهذه الأبعاد بالضبط." : "";
    $("#meta-note").textContent = S.exif && !$("#exif").disabled ? "ستبقى بيانات EXIF (ومنها موقع التصوير إن وُجد) داخل صور JPG الناتجة. المعالجة كلها داخل متصفحك."
      : "تُحذف الميتاداتا (الموقع والجهاز والتاريخ) من الصور الناتجة، وكل المعالجة داخل متصفحك: صورك لا تُرفع لأي خادم.";
    $$("#t-chips .chip").forEach((c) => c.classList.toggle("active", c.dataset.t === `${+S.tval},${S.tunit}`));
    $("#logo-del").hidden = !logoData;
    $("#logo-pv").innerHTML = logoData ? `<img src="${logoData}" alt="الشعار">` : ic("image-plus"); if (!logoData) icons();
  }

  const apply = debounce(() => { store.set(KEY, S); invalidate(); }, 200);
  function setK(k, v) { S[k] = v; paint(); apply(); }

  /* ---------- watermark stamp (drawn here, where the web fonts live) ---------- */
  const lum = (hex) => { const n = parseInt(hex.slice(1), 16); return (.299 * (n >> 16) + .587 * ((n >> 8) & 255) + .114 * (n & 255)) / 255; };
  async function textStamp() {
    const text = S.text.trim(); if (!text) return null;
    const [family, weight] = S.font.split("|");
    try { await document.fonts.load(`${weight} 64px "${family}"`, text); } catch { /* falls back to system font */ }
    let fs = 160; const c = document.createElement("canvas"); let x = c.getContext("2d");
    const font = () => `${weight} ${fs}px "${family}", "IBM Plex Sans Arabic", "Segoe UI", Tahoma, sans-serif`;
    x.font = font(); let m = x.measureText(text);
    if (m.width > 2600) { fs = Math.max(40, Math.floor(fs * 2600 / m.width)); x.font = font(); m = x.measureText(text); }
    const pad = Math.ceil(fs * .3), asc = Math.ceil(m.fontBoundingBoxAscent || m.actualBoundingBoxAscent || fs), desc = Math.ceil(m.fontBoundingBoxDescent || m.actualBoundingBoxDescent || fs * .3);
    c.width = Math.ceil(m.width) + pad * 2; c.height = asc + desc + pad * 2;
    x = c.getContext("2d"); x.font = font(); x.direction = /[֐-ࣿ]/.test(text) ? "rtl" : "ltr"; x.textAlign = "center"; x.textBaseline = "alphabetic";
    const cx = c.width / 2, y = pad + asc, light = lum(S.color) > .5;
    if (S.outline) { x.lineJoin = "round"; x.lineWidth = fs * .09; x.strokeStyle = light ? "rgba(0,0,0,.85)" : "rgba(255,255,255,.9)"; x.strokeText(text, cx, y); }
    if (S.shadow) { x.shadowColor = light ? "rgba(0,0,0,.6)" : "rgba(255,255,255,.55)"; x.shadowBlur = fs * .14; x.shadowOffsetY = fs * .04; }
    x.fillStyle = S.color; x.fillText(text, cx, y);
    return createImageBitmap(c);
  }
  async function logoStamp() { if (!logoData) return null; return createImageBitmap(await (await fetch(logoData)).blob()); }
  async function ensureStamp() {
    if (!S.wm) { hasStamp = false; return; }
    const key = S.wtype === "text" ? ["t", S.text, S.font, S.color, S.shadow, S.outline].join("|") : "l" + logoVer;
    if (key === stampKey) return;
    stampKey = key; let bmp = null;
    try { bmp = S.wtype === "text" ? await textStamp() : await logoStamp(); } catch { bmp = null; }
    hasStamp = !!bmp; eng.send({ t: "stamp", stampId: ++stampId, bmp });
  }

  /* ---------- queue: the image on screen first, the rest in the background ---------- */
  function invalidate() {
    gen++; if (activeJob) eng.send({ t: "cancel", jobId: activeJob });
    kick();
  }
  const cur = () => items.find((x) => x.id === current);
  const pick = () => { const c = cur(); return c && c.gen !== gen ? c : items.find((x) => x.gen !== gen); };
  const beforeKeyOf = (it, o) => `${it.id}|${JSON.stringify(o.resize)}|${o.fmt}|${o.bg}`;

  async function kick() {
    if (running) return; running = true;
    try {
      for (let it; (it = pick());) {
        const g = gen; await ensureStamp(); if (g !== gen) continue;
        const o = optsOf(), isCur = it.id === current, bk = beforeKeyOf(it, o);
        it.status = "work"; draw();
        const j = eng.job({ id: it.id, file: it.file, opts: o, stampId, before: isCur && bk !== before.key });
        activeJob = j.jobId;
        try {
          const res = await j.promise; activeJob = 0;
          if (g !== gen || !items.includes(it)) continue;
          [it.url, it.thumb].forEach((u) => u && URL.revokeObjectURL(u));
          it.out = res; it.url = URL.createObjectURL(res.blob); it.thumb = URL.createObjectURL(res.thumb); it.status = "done"; it.gen = g; it.err = "";
          if (res.before) { if (before.url) URL.revokeObjectURL(before.url); before = { key: bk, url: URL.createObjectURL(res.before) }; }
        } catch (e) {
          activeJob = 0;
          if (e.code === "cancel" || g !== gen) continue;
          it.status = "err"; it.gen = g; it.out = null;
          it.err = e.code === "decode" ? (/\.hei[cf]$/i.test(it.file.name) ? "صيغة HEIC لا يدعمها هذا المتصفح. افتح الأداة من سفاري أو حوّل الصورة أولاً." : "تعذّرت قراءة الصورة: صيغة غير مدعومة أو ملف تالف.") : "تعذّرت معالجة الصورة في هذا المتصفح.";
        }
        draw();
      }
    } finally { running = false; draw(); }
  }

  /* ---------- rendering ---------- */
  const pct = (it) => Math.round((1 - it.out.blob.size / it.file.size) * 100);
  const saveBadge = (it) => { const p = pct(it); return p > 0 ? `<span class="badge badge-success ltr">−${p}%</span>` : p < 0 ? `<span class="badge badge-danger">أكبر من الأصل <span class="ltr">+${-p}%</span></span>` : `<span class="badge">بلا تغيير</span>`; };
  const NOTE = { shrunk: "صُغّرت الأبعاد لبلوغ الحجم", miss: "لم يبلغ الحجم المطلوب", limit: "صُغّرت لحدود هذا الجهاز", fmt: "الصيغة غير مدعومة هنا فحُفظت JPG", exif: "مع EXIF" };
  const notes = (it) => it.out.notes.filter((n) => NOTE[n]).map((n) => `<span class="badge ${n === "exif" ? "" : "badge-warn"}">${NOTE[n]}</span>`).join(" ");
  const outName = (it) => it.file.name.replace(/\.[^.]+$/, "").replace(/[\\/:*?"<>|]+/g, "_") + "-iq." + (EXT[it.out.type] || "jpg");

  let raf = 0;
  function draw() { if (!raf) raf = setTimeout(() => { raf = 0; drawList(); drawPreview(); }, 30); }

  function drawList() {
    const has = items.length > 0;
    $("#list-card").hidden = !has; $("#preview-card").hidden = !has;
    if (!has) return;
    const done = items.filter((x) => x.status === "done"), pending = items.filter((x) => x.gen !== gen && x.status !== "err" || x.status === "work").length;
    $("#count").textContent = items.length;
    const a = done.reduce((n, x) => n + x.file.size, 0), b = done.reduce((n, x) => n + x.out.blob.size, 0);
    $("#total").innerHTML = pending ? `${ic("loader")}<span>جارِ المعالجة… بقي ${pending} من ${items.length}</span>`
      : done.length ? `<span>الإجمالي: <span class="ltr">${fmtBytes(a)}</span> ← <strong class="ltr">${fmtBytes(b)}</strong></span>${a > b ? `<span class="badge badge-success">وفّرت ${fmtBytes(a - b)} <span class="ltr">(−${Math.round((1 - b / a) * 100)}%)</span></span>` : ""}` : "";
    $("#dl-all").disabled = !done.length || pending > 0;
    $("#list").innerHTML = items.map((it) => {
      const o = it.status === "done" && it.out, stale = it.gen !== gen;
      const sub = it.status === "err" ? `<span class="text-danger">${esc(it.err)}</span>`
        : o ? `<span class="ltr">${fmtBytes(it.file.size)}</span> ← <strong class="ltr">${fmtBytes(o.blob.size)}</strong> · <span class="ltr">${o.w}×${o.h}</span> · ${LABEL[o.type] || ""} ${saveBadge(it)} ${notes(it)}`
          : `<span class="ltr">${fmtBytes(it.file.size)}</span> · ${it.status === "work" ? "جارِ المعالجة…" : "في الانتظار…"}`;
      return `<div class="file-item im-row${it.id === current ? " is-cur" : ""}${stale && o ? " is-stale" : ""}" data-i="${it.id}" tabindex="0" role="button" aria-label="معاينة ${esc(it.file.name)}">
        ${it.thumb ? `<img src="${it.thumb}" alt="">` : `<span class="im-ph">${ic(it.status === "err" ? "image-off" : "loader")}</span>`}
        <div class="info"><div class="name">${esc(it.file.name)}</div><div class="sub">${sub}</div></div>
        <button type="button" class="icon-btn" data-dl="${it.id}" aria-label="تحميل" ${o && !stale ? "" : "disabled"}>${ic("download")}</button>
        <button type="button" class="icon-btn" data-rm="${it.id}" aria-label="حذف من القائمة">${ic("x")}</button>
      </div>`;
    }).join("");
    icons();
  }

  let shown = "";
  function drawPreview() {
    const it = cur(); if (!it) return;
    const o = it.status === "done" && it.out, busy = it.gen !== gen || it.status === "work";
    $("#pv-busy").hidden = !busy; $("#dl-cur").disabled = !o || busy;
    $("#cmp").hidden = !o; $("#pv-box").classList.toggle("is-err", it.status === "err");
    if (it.status === "err") { $("#pv-stats").innerHTML = `<span class="text-danger">${esc(it.err)}</span>`; return; }
    if (!o) { $("#pv-stats").textContent = ""; return; }
    const key = it.url + "|" + before.url;
    if (key !== shown) {
      shown = key;
      $("#cmp").style.setProperty("--ar", (o.w / o.h).toFixed(4));
      $("#cmp-after").src = it.url;
      $("#cmp-before").src = before.key.startsWith(it.id + "|") && before.url ? before.url : it.url;
    }
    const p = pct(it), t = targetBytes();
    $("#pv-stats").innerHTML = `
      <div><small>الأصل</small><b class="ltr">${fmtBytes(it.file.size)}</b><span class="ltr">${o.sw}×${o.sh}</span></div>
      <div><small>الناتج</small><b class="ltr">${fmtBytes(o.blob.size)}</b><span class="ltr">${o.w}×${o.h} · ${LABEL[o.type] || ""}</span></div>
      <div class="${p > 0 ? "good" : p < 0 ? "bad" : ""}"><small>${p >= 0 ? "التوفير" : "الزيادة"}</small><b class="ltr">${p >= 0 ? "−" : "+"}${Math.abs(p)}%</b><span>${t ? `الجودة المختارة ${Math.round(o.q * 100)}%` : o.type === "image/png" && o.q >= .95 ? "بلا فقدان" : `جودة ${Math.round(o.q * 100)}%`}</span></div>
      ${o.notes.some((n) => NOTE[n] && n !== "exif") || p < 0 ? `<p class="im-note">${ic("info")}<span>${[p < 0 ? "الناتج أكبر من الأصل: جرّب جودة أقل أو صيغة WebP/JPG." : "", ...o.notes.filter((n) => NOTE[n] && n !== "exif").map((n) => NOTE[n] + ".")].filter(Boolean).join(" ")}</span></p>` : ""}`;
    icons();
  }

  /* ---------- files ---------- */
  function addFiles(files) {
    const imgs = files.filter((f) => f.type.startsWith("image/") || /\.(hei[cf]|avif|jxl)$/i.test(f.name));
    if (!imgs.length) return toast("اختر صوراً فقط", "alert-triangle");
    imgs.forEach((f) => items.push({ id: ++uid, file: f, status: "wait", gen: -1 }));
    if (!cur()) current = items[0].id;
    draw(); kick();
  }
  function forget(it) { [it.url, it.thumb].forEach((u) => u && URL.revokeObjectURL(u)); eng.send({ t: "drop", id: it.id }); }
  function select(id) {
    if (id === current) return; current = id; const it = cur();
    if (it && it.gen === gen && it.status === "done") { it.gen = -1; kick(); } // needs its own "before" frame
    draw();
  }

  dropzone($("#dz"), $("#file"), addFiles);
  $("#list").addEventListener("click", (e) => {
    const d = e.target.closest("[data-dl]"), r = e.target.closest("[data-rm]"), row = e.target.closest("[data-i]");
    if (d) { const it = items.find((x) => x.id === +d.dataset.dl); if (it?.out) download(it.out.blob, outName(it)); return; }
    if (r) {
      const i = items.findIndex((x) => x.id === +r.dataset.rm); if (i < 0) return;
      forget(items[i]); items.splice(i, 1);
      if (!cur() && items.length) { current = 0; select(items[Math.min(i, items.length - 1)].id); }
      draw(); return;
    }
    if (row) select(+row.dataset.i);
  });
  $("#list").addEventListener("keydown", (e) => { if ((e.key === "Enter" || e.key === " ") && e.target.matches("[data-i]")) { e.preventDefault(); select(+e.target.dataset.i); } });
  $("#dl-cur").addEventListener("click", () => { const it = cur(); if (it?.out) download(it.out.blob, outName(it)); });
  $("#dl-all").addEventListener("click", async () => {
    const ready = items.filter((x) => x.status === "done" && x.out);
    if (!ready.length) return;
    if (ready.length === 1) return download(ready[0].out.blob, outName(ready[0]));
    const used = new Set(), files = ready.map((it) => { let n = outName(it), k = 1; while (used.has(n.toLowerCase())) n = outName(it).replace(/(\.\w+)$/, `-${++k}$1`); used.add(n.toLowerCase()); return { name: n, blob: it.out.blob }; });
    try { download(await E.zip(files), "images-iq.zip"); toast(`تم تجهيز ${files.length} صورة في ملف ZIP`, "file-archive"); }
    catch { toast("تعذّر إنشاء ملف ZIP، حمّل الصور واحدة واحدة", "alert-triangle"); }
  });
  $("#clear").addEventListener("click", () => {
    items.forEach(forget); items.length = 0; current = 0; eng.send({ t: "clear" });
    if (before.url) URL.revokeObjectURL(before.url); before = { key: "", url: "" }; shown = "";
    gen++; if (activeJob) eng.send({ t: "cancel", jobId: activeJob });
    draw();
  });

  /* ---------- controls ---------- */
  const read = (el) => el.type === "checkbox" ? el.checked : el.type === "range" ? +el.value : el.value;
  document.addEventListener("input", (e) => { const el = e.target.closest?.("[data-k]"); if (el) setK(el.dataset.k, read(el)); });
  document.addEventListener("change", (e) => { const el = e.target.closest?.("[data-k]"); if (el) setK(el.dataset.k, read(el)); });
  $$("[data-seg]").forEach((g) => g.addEventListener("click", (e) => { const b = e.target.closest("button[data-v]"); if (b) setK(g.dataset.seg, b.dataset.v); }));
  $("#t-chips").addEventListener("click", (e) => { const c = e.target.closest("[data-t]"); if (!c) return; const [v, u] = c.dataset.t.split(","); S.tval = +v; setK("tunit", u); });
  $("#tabs").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]"); if (!b) return;
    $$("#tabs button").forEach((x) => x.classList.toggle("active", x === b));
    $$(".im-pane").forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
  });
  $("#wm-reset").addEventListener("click", () => { WM_KEYS.forEach((k) => { S[k] = DEF[k]; }); paint(); apply(); toast("أُعيد ضبط العلامة المائية", "rotate-ccw"); });
  $("#cmp-range").addEventListener("input", (e) => $("#cmp").style.setProperty("--p", e.target.value + "%"));

  /* logo: shrink once, keep it in localStorage for next time */
  $("#logo-pick").addEventListener("click", () => $("#logo-file").click());
  $("#logo-file").addEventListener("change", async (e) => {
    const f = e.target.files[0]; e.target.value = ""; if (!f) return;
    try {
      const url = URL.createObjectURL(f), img = new Image();
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
      const nw = img.naturalWidth || 512, nh = img.naturalHeight || 512, k = Math.min(1, 800 / Math.max(nw, nh));
      const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(nw * k)); c.height = Math.max(1, Math.round(nh * k));
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      logoData = c.toDataURL("image/png"); logoVer++; store.set(LOGO_KEY, logoData);
      S.wtype = "logo"; paint(); apply();
    } catch { toast("تعذّرت قراءة الشعار، جرّب PNG أو JPG", "alert-triangle"); }
  });
  $("#logo-del").addEventListener("click", () => { logoData = ""; logoVer++; store.set(LOGO_KEY, ""); paint(); apply(); });

  /* hide formats this browser cannot write */
  (async () => {
    for (const t of ["image/avif", "image/webp"]) if (!(await E.supports(t))) { $(`#fmt option[value="${t}"]`)?.remove(); if (S.fmt === t) S.fmt = "keep"; }
    paint();
  })();
  paint();
})();
