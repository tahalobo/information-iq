(function () {
  const { $, $$, icons, toast, download, debounce } = App;
  // byte-mode capacity of the largest QR version (40) for each error-correction level
  const CAP = { L: 2953, M: 2331, Q: 1663, H: 1273 };
  const EC_NAME = { L: "منخفض", M: "متوسط", Q: "عالٍ", H: "أعلى" };
  const TYPE_NAME = { url: "رابط أو نص", wifi: "شبكة واي فاي", wa: "رقم واتساب", vcard: "بطاقة تواصل", email: "رسالة بريد" };
  const MSG = { empty: "أدخل البيانات", long: "النص أطول من سعة الرمز", nolib: "تعذّر تحميل مكتبة QR", error: "تعذّر إنشاء الرمز" };
  const QUIET = 4;            // quiet zone, in modules
  const LOGO_MIN_VERSION = 5; // smaller codes can't survive a centre logo, even at level H

  let type = "url", qr = null, state = "empty", meta = { text: "", bytes: 0, notes: [], ec: "M" };
  let logo = null, ecBeforeLogo = null;

  if (window.qrcode) qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));
  const utf8Len = (s) => new TextEncoder().encode(s).length;
  const val = (id) => ($(id).value || "").trim();

  /* ---------- payloads ---------- */
  const wifiEsc = (s) => s.replace(/([\\;,:"])/g, "\\$1");
  const vEsc = (s) => s.replace(/([\\;,])/g, "\\$1").replace(/\r?\n/g, "\\n");

  function waNumber(notes) {
    let n = $("#f-wa").value.replace(/\D/g, "").replace(/^00/, "");
    if (/^07\d{9}$/.test(n)) { n = "964" + n.slice(1); notes.push(`حُوّل الرقم إلى الصيغة الدولية ${n}`); }
    else if (n.startsWith("0")) notes.push("⚠️ اكتب الرقم مع رمز الدولة وبدون الصفر الأول");
    return n;
  }

  function payload(notes) {
    switch (type) {
      case "wifi": {
        const ssid = val("#f-ssid"), enc = $("#f-enc").value;
        if (!ssid) return "";
        return `WIFI:T:${enc};S:${wifiEsc(ssid)};${enc !== "nopass" ? `P:${wifiEsc($("#f-pass").value)};` : ""}${$("#f-hidden").checked ? "H:true;" : ""};`;
      }
      case "wa": {
        const n = waNumber(notes), msg = val("#f-wamsg");
        return n ? `https://wa.me/${n}${msg ? `?text=${encodeURIComponent(msg)}` : ""}` : "";
      }
      case "vcard": {
        const name = val("#v-name"), tel = val("#v-tel"), email = val("#v-email"), org = val("#v-org"), url = val("#v-url");
        if (!name && !tel && !email) return "";
        const [given = "", ...rest] = name.split(/\s+/);
        return ["BEGIN:VCARD", "VERSION:3.0", `N:${vEsc(rest.join(" "))};${vEsc(given)};;;`, `FN:${vEsc(name || tel || email)}`,
          tel && `TEL;TYPE=CELL:${tel}`, email && `EMAIL:${email}`, org && `ORG:${vEsc(org)}`, url && `URL:${url}`, "END:VCARD"]
          .filter(Boolean).join("\r\n");
      }
      case "email": {
        const to = val("#e-to").replace(/\s+/g, "");
        if (!to) return "";
        const q = [["subject", val("#e-sub")], ["body", $("#e-body").value.trim().replace(/\r?\n/g, "\r\n")]]
          .filter(([, x]) => x).map(([k, x]) => `${k}=${encodeURIComponent(x)}`).join("&");
        return `mailto:${to}${q ? "?" + q : ""}`;
      }
      default: return $("#f-url").value.trim();
    }
  }

  /* ---------- encode ---------- */
  function make(version, ec, text) { const q = qrcode(version, ec); q.addData(text, "Byte"); q.make(); return q; }

  function build() {
    const notes = [], text = payload(notes), ec = $("#ec").value;
    meta = { text, bytes: text ? utf8Len(text) : 0, notes, ec };
    qr = null;
    if (!window.qrcode) return (state = "nolib");
    if (!text) return (state = "empty");
    if (meta.bytes > CAP[ec]) return (state = "long");
    try {
      qr = make(0, ec, text);
      if (logo && qr.getModuleCount() < 17 + 4 * LOGO_MIN_VERSION) qr = make(LOGO_MIN_VERSION, ec, text);
      return (state = "ok");
    } catch (e) { qr = null; return (state = /overflow/i.test(String(e)) ? "long" : "error"); }
  }

  /* ---------- layout: shapes in module units, shared by the canvas and SVG renderers ---------- */
  const isFinder = (r, c, n) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  // square of whole modules cleared for the logo, centred, about a quarter of the code wide (~6% of its area)
  function logoHole(n) { let k = Math.round(n * 0.25); if ((n - k) % 2) k++; const a = (n - k) / 2; return { a, b: a + k, k }; }

  function layout() {
    const n = qr.getModuleCount(), N = n + QUIET * 2, style = $("#style").value, ops = [];
    const hole = logo ? logoHole(n) : null;
    const inHole = (r, c) => hole && r >= hole.a && r < hole.b && c >= hole.a && c < hole.b;
    const on = (r, c) => qr.isDark(r, c) && !inHole(r, c) && !(style !== "square" && isFinder(r, c, n));
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      if (!on(r, c)) continue;
      const x = c + QUIET, y = r + QUIET;
      if (style === "square") { let w = 1; while (c + w < n && on(r, c + w)) w++; ops.push({ k: "rect", x, y, w, h: 1, f: "fg" }); c += w - 1; }
      // sizes tuned so scanners still read the code (tested with jsQR and ZXing)
      else if (style === "dots") ops.push({ k: "circle", x: x + .5, y: y + .5, r: .58, f: "fg" });
      else ops.push({ k: "rrect", x: x + .02, y: y + .02, w: .96, h: .96, r: .3, f: "fg" });
    }
    if (style !== "square") [[0, 0], [0, n - 7], [n - 7, 0]].forEach(([r, c]) => {
      const x = c + QUIET, y = r + QUIET;
      ops.push({ k: "rrect", x, y, w: 7, h: 7, r: 1.6, f: "fg" },
        { k: "rrect", x: x + 1, y: y + 1, w: 5, h: 5, r: .96, f: "bg" },
        { k: "rrect", x: x + 2, y: y + 2, w: 3, h: 3, r: .72, f: "fg" });
    });
    if (hole) {
      const p = hole.a + QUIET, k = hole.k, box = k - 1.2;
      const iw = logo.img.naturalWidth || 1, ih = logo.img.naturalHeight || 1, s = Math.min(box / iw, box / ih);
      ops.push({ k: "img", x: p + (k - iw * s) / 2, y: p + (k - ih * s) / 2, w: iw * s, h: ih * s });
    }
    return { N, ops };
  }

  /* ---------- canvas renderer ---------- */
  // arcTo works everywhere; ctx.roundRect needs Safari 16+ / Firefox 112+
  function rrPath(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function draw(canvas, size) {
    const ctx = canvas.getContext("2d"), fg = $("#fg").value, bg = $("#bg").value;
    canvas.width = canvas.height = size;
    ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size);
    if (state !== "ok") {
      ctx.fillStyle = "#8b90a0"; ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.direction = "rtl";
      ctx.font = `600 ${Math.round(size / 18)}px "IBM Plex Sans Arabic", sans-serif`;
      ctx.fillText(MSG[state], size / 2, size / 2);
      if (state === "long") {
        ctx.font = `${Math.round(size / 24)}px "IBM Plex Sans Arabic", sans-serif`;
        ctx.fillText(`${meta.bytes} من ${CAP[meta.ec]} بايت`, size / 2, size / 2 + size / 11);
      }
      return;
    }
    // whole-pixel modules: fractional cells blur edges and let dark modules eat their neighbours
    const { N, ops } = layout(), cell = Math.max(1, Math.floor(size / N)), off = Math.floor((size - cell * N) / 2);
    let fill = null;
    const flush = () => { if (fill) ctx.fill(); fill = null; };
    ctx.imageSmoothingQuality = "high";
    for (const o of ops) {
      const x = off + o.x * cell, y = off + o.y * cell;
      if (o.k === "img") { flush(); ctx.drawImage(logo.img, x, y, o.w * cell, o.h * cell); continue; }
      if (o.f !== fill) { flush(); fill = o.f; ctx.fillStyle = o.f === "bg" ? bg : fg; ctx.beginPath(); }
      if (o.k === "rect") ctx.rect(x, y, o.w * cell, o.h * cell);
      else if (o.k === "circle") { ctx.moveTo(x + o.r * cell, y); ctx.arc(x, y, o.r * cell, 0, Math.PI * 2); }
      else rrPath(ctx, x, y, o.w * cell, o.h * cell, o.r * cell);
    }
    flush();
  }

  /* ---------- SVG renderer (same shapes, logo embedded) ---------- */
  const num = (v) => +v.toFixed(3);
  function svg() {
    if (state !== "ok") return null;
    const { N, ops } = layout(), fg = $("#fg").value, bg = $("#bg").value, px = +$("#px").value;
    let body = "", d = "", fill = null;
    const flush = () => { if (d) body += `<path fill="${fill === "bg" ? bg : fg}" d="${d}"/>`; d = ""; fill = null; };
    for (const o of ops) {
      if (o.k === "img") {
        flush();
        body += `<image x="${num(o.x)}" y="${num(o.y)}" width="${num(o.w)}" height="${num(o.h)}" preserveAspectRatio="xMidYMid meet" href="${logo.src}" xlink:href="${logo.src}"/>`;
        continue;
      }
      if (o.f !== fill) { flush(); fill = o.f; }
      if (o.k === "rect") d += `M${o.x} ${o.y}h${o.w}v1h-${o.w}z`;
      else if (o.k === "circle") { const r = num(o.r), D = num(o.r * 2); d += `M${num(o.x - o.r)} ${num(o.y)}a${r} ${r} 0 1 1 ${D} 0a${r} ${r} 0 1 1 -${D} 0z`; }
      else {
        const r = num(Math.min(o.r, o.w / 2, o.h / 2)), w = num(o.w - 2 * r), h = num(o.h - 2 * r), a = `a${r} ${r} 0 0 1`;
        d += `M${num(o.x + r)} ${num(o.y)}h${w}${a} ${r} ${r}v${h}${a} -${r} ${r}h-${w}${a} -${r} -${r}v-${h}${a} ${r} -${r}z`;
      }
    }
    flush();
    const crisp = $("#style").value === "square" ? ' shape-rendering="crispEdges"' : "";
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${px}" height="${px}" viewBox="0 0 ${N} ${N}"${crisp}><rect width="${N}" height="${N}" fill="${bg}"/>${body}</svg>`;
  }

  /* ---------- status ---------- */
  function contrastOk() {
    const lum = (hex) => { const v = [1, 3, 5].map((i) => parseInt(hex.substr(i, 2), 16) / 255).map((x) => x <= .03928 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4); return .2126 * v[0] + .7152 * v[1] + .0722 * v[2]; };
    const a = lum($("#fg").value), b = lum($("#bg").value);
    return { ratio: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), inverted: a > b };
  }

  function describe() {
    if (state !== "ok") return MSG[state];
    const extra = type === "url" ? meta.text.slice(0, 80) : type === "wifi" ? val("#f-ssid") : type === "wa" ? val("#f-wa") : type === "vcard" ? val("#v-name") : val("#e-to");
    return `رمز QR، ${TYPE_NAME[type]}${extra ? `: ${extra}` : ""}`;
  }

  const update = debounce(() => {
    const prev = state, ec = $("#ec").value, info = [];
    // dense codes get a sharper preview (at least 4 px per module)
    build(); draw($("#qr"), state === "ok" ? Math.max(512, (qr.getModuleCount() + QUIET * 2) * 4) : 512);
    if (state === "ok") {
      const n = qr.getModuleCount(), c = contrastOk();
      info.push(`${n}×${n} وحدة · ${meta.bytes} بايت`);
      if (c.ratio < 3) info.push("⚠️ التباين ضعيف، وقد لا تقرؤه الكاميرات");
      else if (c.inverted) info.push("⚠️ الرمز الفاتح على خلفية داكنة لا تقرؤه بعض الكاميرات");
      if (logo && ec !== "H") info.push("⚠️ ننصح بمستوى تصحيح «أعلى» مع الشعار");
    } else if (state === "long") {
      info.push(`${meta.bytes} بايت، والحد الأقصى بمستوى «${EC_NAME[ec]}» ${CAP[ec]} بايت. اختصر النص${ec !== "L" ? " أو اختر مستوى تصحيح أقل" : ""}`);
    }
    info.push(...meta.notes);
    $("#info").textContent = info.join(" · ");
    $("#qr").setAttribute("aria-label", describe());
    if (state === "long" && prev !== "long") toast("النص أطول من سعة رمز QR", "alert-triangle");
  }, 120);

  /* ---------- inputs ---------- */
  $$("#types [data-t]").forEach((b) => b.addEventListener("click", () => {
    type = b.dataset.t;
    $$("#types [data-t]").forEach((x) => { x.classList.toggle("active", x === b); x.setAttribute("aria-pressed", String(x === b)); });
    $$("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== type));
    update();
  }));
  $$("main input, main textarea, main select").forEach((el) => {
    if (el.id === "logo" || el.id === "px") return;
    el.addEventListener("input", update); el.addEventListener("change", update);
  });
  $("#ec").addEventListener("change", () => { ecBeforeLogo = null; }); // the user picked a level: don't restore ours later
  const syncEnc = () => { $("#f-pass").disabled = $("#f-enc").value === "nopass"; };
  $("#f-enc").addEventListener("change", syncEnc); syncEnc();
  $("#brand").addEventListener("click", () => { $("#fg").value = "#0e1a33"; $("#bg").value = "#f6e7bf"; update(); });

  /* ---------- logo ---------- */
  function setLogo(next, name) {
    logo = next;
    const ecSel = $("#ec");
    if (logo && ecSel.value !== "H") { ecBeforeLogo = ecSel.value; ecSel.value = "H"; }
    if (!logo) {
      $("#logo").value = "";
      if (ecBeforeLogo && ecSel.value === "H") ecSel.value = ecBeforeLogo;
      ecBeforeLogo = null;
    }
    $("#logo-name").textContent = logo ? name : "لا يوجد شعار";
    $("#logo-clear").hidden = !logo;
    update();
  }
  // what goes inside the SVG: keep vector logos as they are, shrink big photos
  function embedSrc(img, file, dataUrl) {
    if (file.type === "image/svg+xml") return dataUrl;
    const k = Math.min(1, 512 / Math.max(img.naturalWidth, img.naturalHeight));
    if (k === 1 && file.size < 300e3) return dataUrl;
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/png");
  }
  $("#logo").addEventListener("change", (e) => {
    const f = e.target.files[0]; if (!f) return;
    const fail = () => { toast("تعذّرت قراءة الصورة، جرّب ملفاً آخر", "alert-triangle"); e.target.value = ""; };
    if (!f.type.startsWith("image/")) return fail();
    const fr = new FileReader();
    fr.onerror = fail;
    fr.onload = () => {
      const img = new Image();
      img.onerror = fail;
      img.onload = () => setLogo({ img, src: embedSrc(img, f, fr.result) }, f.name);
      img.src = fr.result;
    };
    fr.readAsDataURL(f);
  });
  $("#logo-clear").addEventListener("click", () => setLogo(null));

  /* ---------- export ---------- */
  $("#px").addEventListener("input", (e) => ($("#px-v").textContent = e.target.value));
  const notReady = () => toast(state === "long" ? "النص أطول من سعة رمز QR" : "أدخل البيانات أولاً", "alert-triangle");
  const pngBlob = () => new Promise((r) => { const c = document.createElement("canvas"); draw(c, +$("#px").value); c.toBlob(r, "image/png"); });
  const fileName = (ext) => `qr-${type}.${ext}`;

  $("#dl-png").addEventListener("click", async () => { if (state !== "ok") return notReady(); download(await pngBlob(), fileName("png")); });
  $("#dl-svg").addEventListener("click", () => { const s = svg(); if (!s) return notReady(); download(new Blob([s], { type: "image/svg+xml" }), fileName("svg")); });
  $("#cp").addEventListener("click", async () => {
    if (state !== "ok") return notReady();
    try { const b = await pngBlob(); await navigator.clipboard.write([new ClipboardItem({ "image/png": b })]); toast("نُسخ رمز QR"); }
    catch { toast("المتصفح لا يدعم نسخ الصور، استخدم التحميل", "info"); }
  });

  const shareBtn = $("#share");
  try { shareBtn.hidden = !(navigator.canShare && navigator.canShare({ files: [new File([""], "qr.png", { type: "image/png" })] })); } catch { shareBtn.hidden = true; }
  shareBtn.addEventListener("click", async () => {
    if (state !== "ok") return notReady();
    try { const b = await pngBlob(); await navigator.share({ files: [new File([b], fileName("png"), { type: "image/png" })], title: "رمز QR" }); }
    catch (e) { if (e.name !== "AbortError") toast("تعذّرت المشاركة، استخدم التحميل", "info"); }
  });

  if (!window.qrcode) toast("تعذّر تحميل مكتبة QR. حدّث الصفحة.", "alert-triangle");
  update(); icons();
})();
