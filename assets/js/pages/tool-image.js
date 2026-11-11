(function () {
  const { $, $$, esc, ic, icons, toast, download, fmtBytes, dropzone, debounce } = App;
  const items = []; let current = 0; let uid = 0;

  const S = () => ({
    type: $("#fmt").value, q: +$("#q").value / 100, max: +$("#size").value,
    wm: $("#wm").checked, text: $("#wm-text").value, pos: $("#wm-pos").value, color: $("#wm-color").value,
    shadow: $("#wm-shadow").checked, size: +$("#wm-size").value / 100, op: +$("#wm-op").value / 100
  });
  const EXT = { "image/jpeg": "jpg", "image/webp": "webp", "image/png": "png" };

  function drawWatermark(ctx, w, h, s) {
    if (!s.wm || !s.text.trim()) return;
    const fs = Math.max(12, Math.round(Math.max(w, h) * s.size));
    ctx.save();
    ctx.globalAlpha = s.op; ctx.fillStyle = s.color;
    ctx.font = `600 ${fs}px "IBM Plex Sans Arabic", "Segoe UI", sans-serif`;
    ctx.direction = /[؀-ۿ]/.test(s.text) ? "rtl" : "ltr";
    ctx.textBaseline = "middle";
    if (s.shadow) { ctx.shadowColor = "rgba(0,0,0,.55)"; ctx.shadowBlur = fs * .25; ctx.shadowOffsetY = fs * .05; }
    const pad = Math.round(fs * .9);
    const tw = ctx.measureText(s.text).width;
    if (s.pos === "tile") {
      ctx.translate(w / 2, h / 2); ctx.rotate(-Math.PI / 6); ctx.textAlign = "center";
      const stepX = tw + fs * 3, stepY = fs * 4, R = Math.hypot(w, h);
      for (let row = 0, y = -R; y < R; y += stepY, row++) for (let x = -R + (row % 2 ? stepX / 2 : 0); x < R; x += stepX) ctx.fillText(s.text, x, y);
    } else {
      ctx.textAlign = "center";
      const pts = { br: [w - pad - tw / 2, h - pad], bl: [pad + tw / 2, h - pad], tr: [w - pad - tw / 2, pad], tl: [pad + tw / 2, pad], c: [w / 2, h / 2] };
      const [x, y] = pts[s.pos] || pts.br; ctx.fillText(s.text, x, y);
    }
    ctx.restore();
  }

  async function render(it, s, canvas) {
    const bmp = it.bmp || (it.bmp = await createImageBitmap(it.file, { imageOrientation: "from-image" }));
    let w = bmp.width, h = bmp.height;
    if (s.max && Math.max(w, h) > s.max) { const k = s.max / Math.max(w, h); w = Math.round(w * k); h = Math.round(h * k); }
    const c = canvas || document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d");
    ctx.clearRect(0, 0, w, h);
    if (s.type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(bmp, 0, 0, w, h);
    drawWatermark(ctx, w, h, s);
    const blob = await new Promise((r) => c.toBlob(r, s.type, s.q));
    return { blob, w, h };
  }

  async function processAll() {
    const s = S();
    for (const it of items) {
      try {
        const r = await render(it, s, items[current] === it ? $("#pv") : null);
        it.out = r;
      } catch { it.out = null; it.err = true; }
    }
    renderList();
    const cur = items[current];
    if (cur?.out) {
      const pct = Math.round((1 - cur.out.blob.size / cur.file.size) * 100);
      $("#pv-stats").innerHTML = `${fmtBytes(cur.file.size)} ← ${fmtBytes(cur.out.blob.size)} ${pct > 0 ? `<span class="text-success">(−${pct}%)</span>` : `<span class="text-warn">(+${-pct}%)</span>`}`;
    }
  }
  const reprocess = debounce(processAll, 250);

  function renderList() {
    $("#list").innerHTML = items.map((it, i) => {
      const o = it.out;
      const pct = o ? Math.round((1 - o.blob.size / it.file.size) * 100) : 0;
      return `<div class="file-item" style="${i === current ? "border-color:var(--gold-2)" : ""};cursor:pointer" data-i="${i}">
        <img src="${it.thumb}" alt="">
        <div class="info"><div class="name">${esc(it.file.name)}</div>
        <div class="sub">${it.err ? '<span class="text-danger">تعذّرت المعالجة</span>' : o ? `${fmtBytes(it.file.size)} ← <strong>${fmtBytes(o.blob.size)}</strong> · <span class="ltr">${o.w}×${o.h}</span> ${pct > 0 ? `<span class="badge badge-success">−${pct}%</span>` : ""}` : "جارِ المعالجة…"}</div></div>
        <button class="icon-btn" data-dl="${i}" aria-label="تحميل" ${o ? "" : "disabled"}>${ic("download")}</button>
      </div>`;
    }).join("");
    icons();
  }

  const outName = (it) => it.file.name.replace(/\.[^.]+$/, "") + "-iq." + EXT[S().type];

  function addFiles(files) {
    const imgs = files.filter((f) => f.type.startsWith("image/"));
    if (!imgs.length) return toast("اختر صوراً فقط", "alert-triangle");
    imgs.forEach((f) => items.push({ id: ++uid, file: f, thumb: URL.createObjectURL(f) }));
    $("#preview-card").hidden = false; $("#list-card").hidden = false;
    processAll();
  }

  dropzone($("#dz"), $("#file"), addFiles);
  $("#list").addEventListener("click", (e) => {
    const d = e.target.closest("[data-dl]");
    if (d) { const it = items[+d.dataset.dl]; if (it.out) download(it.out.blob, outName(it)); return; }
    const row = e.target.closest("[data-i]"); if (row) { current = +row.dataset.i; processAll(); }
  });
  $("#dl-all").addEventListener("click", async () => {
    const ready = items.filter((x) => x.out);
    if (ready.length === 1) return download(ready[0].out.blob, outName(ready[0]));
    if (!window.JSZip) await new Promise((res, rej) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"; s.onload = res; s.onerror = rej; document.head.appendChild(s); }).catch(() => toast("تعذّر تحميل مكتبة ZIP", "alert-triangle"));
    if (!window.JSZip) return;
    const zip = new JSZip(); const used = new Set();
    ready.forEach((it) => { let n = outName(it), k = 1; while (used.has(n)) n = outName(it).replace(/(\.\w+)$/, `-${++k}$1`); used.add(n); zip.file(n, it.out.blob); });
    download(await zip.generateAsync({ type: "blob" }), "images-iq.zip");
  });
  $("#clear").addEventListener("click", () => { items.forEach((x) => URL.revokeObjectURL(x.thumb)); items.length = 0; current = 0; $("#preview-card").hidden = true; $("#list-card").hidden = true; });

  $("#q").addEventListener("input", (e) => { $("#q-val").textContent = e.target.value; reprocess(); });
  $("#fmt").addEventListener("change", () => { $("#q-field").hidden = $("#fmt").value === "image/png"; reprocess(); });
  $("#wm").addEventListener("change", (e) => { $("#wm-opts").hidden = !e.target.checked; reprocess(); });
  $("#wm-size").addEventListener("input", (e) => { $("#wm-size-v").textContent = e.target.value; reprocess(); });
  $("#wm-op").addEventListener("input", (e) => { $("#wm-op-v").textContent = e.target.value; reprocess(); });
  ["#size", "#wm-text", "#wm-pos", "#wm-color", "#wm-shadow"].forEach((s) => { $(s).addEventListener("input", reprocess); $(s).addEventListener("change", reprocess); });
})();
