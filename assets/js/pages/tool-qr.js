(function () {
  const { $, $$, icons, toast, download, debounce } = App;
  let type = "url", logoImg = null, matrix = null;

  if (window.qrcode) qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));

  const wifiEsc = (s) => s.replace(/([\\;,:"])/g, "\\$1");
  function payload() {
    const v = (id) => ($(id).value || "").trim();
    switch (type) {
      case "wifi": return v("#f-ssid") ? `WIFI:T:${v("#f-enc")};S:${wifiEsc(v("#f-ssid"))};${v("#f-enc") !== "nopass" ? `P:${wifiEsc($("#f-pass").value)};` : ""}${$("#f-hidden").checked ? "H:true;" : ""};` : "";
      case "wa": { const n = v("#f-wa").replace(/\D/g, "").replace(/^00/, ""); return n ? `https://wa.me/${n}${v("#f-wamsg") ? `?text=${encodeURIComponent(v("#f-wamsg"))}` : ""}` : ""; }
      case "vcard": return v("#v-name") || v("#v-tel") ? ["BEGIN:VCARD", "VERSION:3.0", `N:;${v("#v-name")};;;`, `FN:${v("#v-name")}`, v("#v-tel") && `TEL;TYPE=CELL:${v("#v-tel")}`, v("#v-email") && `EMAIL:${v("#v-email")}`, v("#v-org") && `ORG:${v("#v-org")}`, v("#v-url") && `URL:${v("#v-url")}`, "END:VCARD"].filter(Boolean).join("\n") : "";
      case "email": { if (!v("#e-to")) return ""; const p = new URLSearchParams(); if (v("#e-sub")) p.set("subject", v("#e-sub")); if (v("#e-body")) p.set("body", v("#e-body")); const q = p.toString().replace(/\+/g, "%20"); return `mailto:${v("#e-to")}${q ? "?" + q : ""}`; }
      default: return $("#f-url").value.trim();
    }
  }

  function build() {
    const text = payload();
    if (!text || !window.qrcode) { matrix = null; return null; }
    try {
      const qr = qrcode(0, $("#ec").value); qr.addData(text, "Byte"); qr.make();
      const n = qr.getModuleCount(); matrix = { n, dark: (r, c) => qr.isDark(r, c), len: new TextEncoder().encode(text).length };
      return matrix;
    } catch { matrix = null; toast("النص طويل جداً على رمز QR", "alert-triangle"); return null; }
  }

  const isFinder = (r, c, n) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);

  function draw(canvas, size) {
    const ctx = canvas.getContext("2d"); canvas.width = canvas.height = size;
    const fg = $("#fg").value, bg = $("#bg").value, style = $("#style").value;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    if (!matrix) { ctx.fillStyle = "#999"; ctx.font = `${size / 16}px sans-serif`; ctx.textAlign = "center"; ctx.fillText("أدخل البيانات", size / 2, size / 2); return; }
    const { n } = matrix, q = 4, cell = size / (n + q * 2);
    ctx.fillStyle = fg;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!matrix.dark(r, c) || (style !== "square" && isFinder(r, c, n))) continue;
      const x = (c + q) * cell, y = (r + q) * cell;
      // sizes tuned so scanners still read the code (tested with jsQR)
      if (style === "dots") { ctx.beginPath(); ctx.arc(x + cell / 2, y + cell / 2, cell * .58, 0, Math.PI * 2); ctx.fill(); }
      else if (style === "rounded") { ctx.beginPath(); ctx.roundRect(x + cell * .02, y + cell * .02, cell * .96, cell * .96, cell * .3); ctx.fill(); }
      else ctx.fillRect(x, y, Math.ceil(cell), Math.ceil(cell));
    }
    if (style !== "square") {
      [[0, 0], [0, n - 7], [n - 7, 0]].forEach(([r, c]) => {
        const x = (c + q) * cell, y = (r + q) * cell, rad = cell * 1.6;
        ctx.fillStyle = fg; ctx.beginPath(); ctx.roundRect(x, y, cell * 7, cell * 7, rad); ctx.fill();
        ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(x + cell, y + cell, cell * 5, cell * 5, rad * .6); ctx.fill();
        ctx.fillStyle = fg; ctx.beginPath(); ctx.roundRect(x + cell * 2, y + cell * 2, cell * 3, cell * 3, rad * .45); ctx.fill();
      });
    }
    if (logoImg) {
      const ls = size * .22, lx = (size - ls) / 2;
      ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(lx - cell, lx - cell, ls + cell * 2, ls + cell * 2, cell * 2); ctx.fill();
      const k = Math.min(ls / logoImg.width, ls / logoImg.height), w = logoImg.width * k, h = logoImg.height * k;
      ctx.drawImage(logoImg, (size - w) / 2, (size - h) / 2, w, h);
    }
  }

  function svg() {
    if (!matrix) return null;
    const { n } = matrix, q = 4, N = n + q * 2, fg = $("#fg").value, bg = $("#bg").value;
    let d = "";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (matrix.dark(r, c)) d += `M${c + q} ${r + q}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N} ${N}" shape-rendering="crispEdges"><rect width="${N}" height="${N}" fill="${bg}"/><path d="${d}" fill="${fg}"/></svg>`;
  }

  function contrastOk() {
    const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255).map((x) => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
    const a = lum($("#fg").value), b = lum($("#bg").value);
    return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), inverted: a > b };
  }

  const update = debounce(() => {
    build(); draw($("#qr"), 512);
    const c = contrastOk();
    let info = matrix ? `${matrix.n}×${matrix.n} وحدة · ${matrix.len} بايت` : "";
    if (c.ratio < 3) info += " · ⚠️ التباين ضعيف، وقد لا تقرؤه الكاميرات";
    else if (c.inverted) info += " · ⚠️ الرمز الفاتح على خلفية داكنة لا تقرؤه بعض الكاميرات";
    if (logoImg && $("#ec").value !== "H") info += " · ننصح بمستوى تصحيح «أعلى» مع الشعار";
    $("#info").textContent = info;
  }, 120);

  $$("#types [data-t]").forEach((b) => b.addEventListener("click", () => {
    type = b.dataset.t;
    $$("#types [data-t]").forEach((x) => x.classList.toggle("active", x === b));
    $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== type));
    update();
  }));
  document.querySelectorAll("main input, main textarea, main select").forEach((el) => { if (el.id !== "logo" && el.id !== "px") { el.addEventListener("input", update); el.addEventListener("change", update); } });
  $("#brand").addEventListener("click", () => { $("#fg").value = "#0e1a33"; $("#bg").value = "#f6e7bf"; update(); });
  $("#logo").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) { logoImg = null; update(); return; }
    const img = new Image(); img.onload = () => { logoImg = img; if ($("#ec").value !== "H") $("#ec").value = "H"; update(); }; img.src = URL.createObjectURL(f);
  });
  $("#px").addEventListener("input", (e) => ($("#px-v").textContent = e.target.value));
  const exportCanvas = () => { const c = document.createElement("canvas"); draw(c, +$("#px").value); return c; };
  $("#dl-png").addEventListener("click", () => { if (!matrix) return toast("أدخل البيانات أولاً", "alert-triangle"); exportCanvas().toBlob((b) => download(b, "qr-code.png")); });
  $("#dl-svg").addEventListener("click", () => { const s = svg(); if (!s) return toast("أدخل البيانات أولاً", "alert-triangle"); download(new Blob([s], { type: "image/svg+xml" }), "qr-code.svg"); if (logoImg || $("#style").value !== "square") toast("ملف SVG بالشكل المربع ودون شعار", "info"); });
  $("#cp").addEventListener("click", async () => {
    if (!matrix) return;
    try { const b = await new Promise((r) => exportCanvas().toBlob(r)); await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); toast("نُسخ رمز QR"); }
    catch { toast("المتصفح لا يدعم نسخ الصور، استخدم التحميل", "info"); }
  });

  if (!window.qrcode) toast("تعذّر تحميل مكتبة QR. تحقق من الإنترنت.", "alert-triangle");
  update(); icons();
})();
