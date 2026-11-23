/* ==========================================================
   صفحة المبدع: شهادة الترحيب
   صورة تُرسم داخل المتصفح (canvas) بمقاسين: أفقي 2000×1414 (نسبة A4 للطباعة والمشاركة) وطولي 1080×1920 للستوري.
   التصميم رافديني: جدار آجر لازوردي كبوابة عشتار، أشرطة ورود بابلية، أسود الموكب، رقيم طيني بشُرفات مدرّجة، الرافدان، وختم بنجمة شمش.
   بيانات المبدع تأتي من كتلة JSON في الصفحة (#creator-data) يكتبها scripts/build-pages.mjs.
   الرابط creators/<slug>.html#certificate يفتح الشهادة مباشرة.
   هي شهادة ترحيب وتكريم رمزية: لا تُكتب فيها أي عبارة توحي باعتماد رسمي أو مهني.
   ========================================================== */
(function () {
  const { $, esc, ic, toast, fmtDate } = App;
  let C;
  try { C = JSON.parse($("#creator-data").textContent); } catch { return; }
  if (!C || typeof C.name !== "string") return;

  const PLEX = '"IBM Plex Sans Arabic"';
  const NAVY = "#0b1530", GOLD = "#b07d14";
  const SIZES = { wide: { w: 2000, h: 1414, label: "أفقية", hint: "للطباعة والمشاركة" }, story: { w: 1080, h: 1920, label: "طولية", hint: "للستوري" } };
  const DISCLAIMER = "شهادة ترحيب وتكريم رمزية، وليست اعتماداً رسمياً أو مهنياً";
  const CONGRATS = "تهانينا على انضمامك إلى «مبدعون عراقيون»، موسوعة المبدعين العراقيين في موقع الإمبراطورية العراقية. نعتزّ بك وبأعمالك، ونتمنى لك مزيداً من الإبداع.";

  // رابط الصفحة العام (لا رابط localhost): يُكتب في الشهادة ويفتحه رمز QR
  const pageUrl = (() => {
    try { const u = new URL(C.url); if (/^https?:$/.test(u.protocol)) return u.href; } catch { /* ignore */ }
    return location.origin + location.pathname;
  })();
  const shortUrl = decodeURI(pageUrl).replace(/^https?:\/\//, "");

  /* ---------- أدوات الرسم ---------- */
  const loadImg = (src) => new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = new URL(src, document.baseURI).href; });
  function rr(x, X, Y, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); }
  function glow(x, cx, cy, r, color) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); }
  function wrap(x, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean), lines = []; let line = "";
    words.forEach((w) => { const t = line ? `${line} ${w}` : w; if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line); return lines;
  }
  // أكبر حجم خط يُبقي النص ضمن العرض وعدد الأسطر المسموح
  function fit(x, text, weight, maxW, maxLines, from, min) {
    let size = from, lines;
    for (;;) { x.font = `${weight} ${size}px ${PLEX}`; lines = wrap(x, text, maxW); if ((lines.length <= maxLines && lines.every((l) => x.measureText(l).width <= maxW)) || size <= min) break; size -= 4; }
    return { size, lines: lines.slice(0, maxLines) };
  }
  function diamonds(x, W, H, color, alpha, step) {
    x.save(); x.globalAlpha = alpha; x.strokeStyle = color; x.lineWidth = 2; const r = step * .44;
    for (let yy = 0, row = 0; yy < H + step; yy += step, row++) for (let xx = row % 2 ? step / 2 : 0; xx < W + step; xx += step) { x.beginPath(); x.moveTo(xx, yy - r); x.lineTo(xx + r, yy); x.lineTo(xx, yy + r); x.lineTo(xx - r, yy); x.closePath(); x.stroke(); }
    x.restore();
  }
  function diamond(x, cx, cy, r) { x.beginPath(); x.moveTo(cx, cy - r); x.lineTo(cx + r, cy); x.lineTo(cx, cy + r); x.lineTo(cx - r, cy); x.closePath(); x.fill(); }
  async function qrMatrix(text) {
    if (!window.qrcode) await new Promise((res) => { const s = document.createElement("script"); s.src = "assets/js/vendor/qrcode-generator-1.4.4.min.js"; s.onload = res; s.onerror = res; document.head.appendChild(s); });
    if (!window.qrcode) return null;
    try {
      qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));
      const q = qrcode(0, "M"); q.addData(text, "Byte"); q.make();
      return { n: q.getModuleCount(), dark: (r, k) => q.isDark(r, k) };
    } catch { return null; }
  }
  // رمز QR على خلفية فاتحة مع هامش صامت (4 خانات) حتى تقرؤه كل الكاميرات
  function drawQr(x, qm, X, Y, size, dark, light) {
    rr(x, X, Y, size, size, size * .08); x.fillStyle = light; x.fill();
    if (!qm) return;
    const cell = size / (qm.n + 8), o = cell * 4; x.fillStyle = dark;
    for (let r = 0; r < qm.n; r++) for (let k = 0; k < qm.n; k++) if (qm.dark(r, k)) x.fillRect(X + o + k * cell, Y + o + r * cell, cell + .6, cell + .6);
  }
  // نص لاتيني (الرابط، رقم الشهادة) يُرسم من اليسار إلى اليمين ثم يعود الاتجاه عربياً
  function ltr(x, text, X, Y, align) { x.save(); x.direction = "ltr"; x.textAlign = align; x.fillText(text, X, Y); x.restore(); }
  function fitLtr(x, text, weight, maxW, from, min) { let s = from; for (;;) { x.font = `${weight} ${s}px ${PLEX}`; if (x.measureText(text).width <= maxW || s <= min) return s; s -= 2; } }

  /* ---------- زخارف رافدينية (بوابة عشتار، الرقيم الطيني، ورود بابل، نجمة شمش، الرافدان) ---------- */
  const LAPIS = "#1d3a8a", LAPIS_D = "#10225a", OCHRE = "#b5791d", CLAY = "#f3e8cf", CLAY_D = "#e3d0a6", INK = "#2a1d08";
  const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  // جدار من الآجر المزجّج بالأزرق اللازوردي كجدار بوابة عشتار: كل آجرة بدرجة مختلفة قليلاً ولمعة خفيفة
  function bricks(x, X, Y, W, H, bw, bh) {
    x.save(); x.beginPath(); x.rect(X, Y, W, H); x.clip();
    x.fillStyle = "#0b1840"; x.fillRect(X, Y, W, H);
    for (let r = 0, yy = Y; yy < Y + H; r++, yy += bh) {
      for (let xx = X - (r % 2 ? bw / 2 : 0), k = 0; xx < X + W; xx += bw, k++) {
        const v = hash(r * 31 + k * 7), l = 26 + v * 9, s = 62 + hash(r * 13 + k) * 14;
        x.fillStyle = `hsl(${222 + v * 6} ${s}% ${l}%)`; x.fillRect(xx + 3, yy + 3, bw - 6, bh - 6);
        x.fillStyle = `rgba(255,255,255,${0.05 + v * 0.06})`; x.fillRect(xx + 3, yy + 3, bw - 6, (bh - 6) * 0.32);
      }
    }
    x.restore();
  }
  // وردة بابلية: بتلات بيضاء حول قلب أصفر، كما في أشرطة بوابة عشتار
  function rosette(x, cx, cy, r, petals = 12) {
    x.save(); x.translate(cx, cy);
    x.fillStyle = "#f7f1e1";
    for (let i = 0; i < petals; i++) { x.save(); x.rotate(i * Math.PI * 2 / petals); x.beginPath(); x.ellipse(0, -r * 0.55, r * 0.17, r * 0.42, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
    x.beginPath(); x.arc(0, 0, r * 0.3, 0, Math.PI * 2); x.fillStyle = "#e7a92e"; x.fill();
    x.beginPath(); x.arc(0, 0, r * 0.3, 0, Math.PI * 2); x.lineWidth = r * 0.06; x.strokeStyle = "#f7f1e1"; x.stroke();
    x.beginPath(); x.arc(0, 0, r * 0.12, 0, Math.PI * 2); x.fillStyle = "#b5791d"; x.fill();
    x.restore();
  }
  // شريط ورود بين خطّين ذهبيين
  function rosetteBand(x, X, Y, W, h) {
    x.fillStyle = "#0e1f52"; x.fillRect(X, Y, W, h);
    x.fillStyle = "#e7b54a"; x.fillRect(X, Y, W, 5); x.fillRect(X, Y + h - 5, W, 5);
    x.fillStyle = "#f7f1e1"; x.fillRect(X, Y + 9, W, 2); x.fillRect(X, Y + h - 11, W, 2);
    const r = h * 0.32, gap = r * 2.9, n = Math.floor(W / gap), off = X + (W - (n - 1) * gap) / 2;
    for (let i = 0; i < n; i++) rosette(x, off + i * gap, Y + h / 2, r);
  }
  // نجمة شمش ثمانية الرؤوس
  function star8(x, cx, cy, R, r, fill) {
    x.beginPath();
    for (let i = 0; i < 16; i++) { const a = -Math.PI / 2 + i * Math.PI / 8, rr2 = i % 2 ? r : R; x.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); }
    x.closePath(); x.fillStyle = fill; x.fill();
  }
  // أسد موكب بوابة عشتار (مُبسّط): جسم ذهبي، لِبدة فاتحة، خط أبيض حوله. dir = 1 يتجه يميناً، -1 يساراً
  function lion(x, cx, cy, s, dir) {
    x.save(); x.translate(cx, cy); x.scale(s * dir, s); x.translate(-200, -110);
    x.lineJoin = "round"; x.lineCap = "round";
    const body = new Path2D();
    body.moveTo(96, 78); body.bezierCurveTo(130, 58, 230, 56, 288, 70); // ظهر
    body.bezierCurveTo(300, 104, 298, 136, 286, 150); // صدر
    body.lineTo(300, 210); body.lineTo(282, 212); body.lineTo(266, 152); // ساق أمامية
    body.lineTo(252, 156); body.lineTo(246, 212); body.lineTo(228, 212); body.lineTo(232, 150); // ساق أمامية ثانية
    body.bezierCurveTo(190, 158, 150, 158, 128, 150); // بطن
    body.lineTo(138, 210); body.lineTo(120, 212); body.lineTo(104, 152); // ساق خلفية
    body.lineTo(96, 150); body.lineTo(80, 210); body.lineTo(62, 210); body.lineTo(76, 140); // ساق خلفية ثانية
    body.bezierCurveTo(70, 116, 76, 90, 96, 78); body.closePath();
    const tail = new Path2D(); tail.moveTo(80, 92); tail.bezierCurveTo(40, 96, 22, 60, 34, 34);
    const mane = new Path2D(); mane.ellipse(300, 92, 54, 64, -0.2, 0, Math.PI * 2);
    const head = new Path2D(); head.moveTo(300, 52); head.bezierCurveTo(330, 40, 368, 52, 384, 78); head.lineTo(392, 96); head.lineTo(372, 100); head.lineTo(386, 112);
    head.bezierCurveTo(360, 132, 322, 128, 304, 112); head.closePath();
    x.lineWidth = 7; x.strokeStyle = "#f7f1e1";
    x.stroke(tail); x.lineWidth = 9; x.strokeStyle = "#e9b84a"; x.stroke(tail); pathDot(x, 34, 34, 11, "#c9861e");
    x.lineWidth = 6; x.strokeStyle = "#f7f1e1"; x.stroke(body); x.fillStyle = "#e9b84a"; x.fill(body);
    x.save(); x.clip(body); x.fillStyle = "#c98a1a"; x.fillRect(60, 132, 260, 90); x.restore();
    x.stroke(mane); x.fillStyle = "#cfe0f2"; x.fill(mane);
    x.save(); x.clip(mane); x.strokeStyle = "rgba(29,58,138,.45)"; x.lineWidth = 3; for (let i = 0; i < 7; i++) { x.beginPath(); x.arc(300, 92, 20 + i * 8, 2.2, 4.3); x.stroke(); } x.restore();
    x.lineWidth = 6; x.stroke(head); x.fillStyle = "#e9b84a"; x.fill(head);
    pathDot(x, 350, 70, 5, INK); x.fillStyle = "#7a1d10"; x.beginPath(); x.moveTo(372, 100); x.lineTo(392, 96); x.lineTo(386, 112); x.closePath(); x.fill();
    x.restore();
  }
  function pathDot(x, cx, cy, r, c) { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fillStyle = c; x.fill(); }
  // نخلة عراقية بسيطة
  function palm(x, cx, by, h, col) {
    x.save(); x.strokeStyle = col; x.fillStyle = col; x.lineCap = "round";
    x.lineWidth = h * 0.06; x.beginPath(); x.moveTo(cx, by); x.quadraticCurveTo(cx + h * 0.06, by - h * 0.5, cx, by - h * 0.78); x.stroke();
    for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.36, L = h * (0.42 - Math.abs(i - 4) * 0.02); x.lineWidth = h * 0.035;
      x.beginPath(); x.moveTo(cx, by - h * 0.78); x.quadraticCurveTo(cx + Math.cos(a) * L * 0.6, by - h * 0.78 + Math.sin(a) * L * 0.6 - h * 0.08, cx + Math.cos(a) * L, by - h * 0.78 + Math.sin(a) * L + h * 0.14); x.stroke(); }
    for (let i = 0; i < 5; i++) pathDot(x, cx - h * 0.06 + i * h * 0.03, by - h * 0.7 + (i % 2) * h * 0.03, h * 0.022, "#b5791d");
    x.restore();
  }
  // الرافدان: خطان متموّجان (دجلة والفرات) يلتقيان عند نجمة صغيرة
  function rivers(x, cx, cy, w) {
    x.save(); x.lineWidth = 3; x.lineCap = "round";
    [[LAPIS, -7], [OCHRE, 7]].forEach(([c, dy]) => { x.strokeStyle = c; x.beginPath(); for (let i = 0; i <= 80; i++) { const t = i / 80, X = cx - w / 2 + t * w, Y = cy + dy * (1 - Math.abs(t - 0.5) * 2) + Math.sin(t * Math.PI * 6) * 4; i ? x.lineTo(X, Y) : x.moveTo(X, Y); } x.stroke(); });
    star8(x, cx, cy, 15, 6, OCHRE);
    x.restore();
  }
  // علامات مسمارية زخرفية (ليست كتابة): أسافين صغيرة في صفوف خافتة كخلفية رقيم طيني
  function wedges(x, X, Y, W, H, alpha) {
    x.save(); x.globalAlpha = alpha; x.fillStyle = INK; x.strokeStyle = INK; x.lineWidth = 2;
    for (let r = 0, yy = Y; yy < Y + H; r++, yy += 34) {
      let xx = X + hash(r) * 30;
      while (xx < X + W - 20) {
        const v = hash(r * 97 + xx), kind = Math.floor(v * 3);
        x.save(); x.translate(xx, yy);
        if (kind === 0) { x.beginPath(); x.moveTo(0, 0); x.lineTo(8, -4); x.lineTo(8, 4); x.closePath(); x.fill(); x.beginPath(); x.moveTo(8, 0); x.lineTo(20, 0); x.stroke(); }
        else if (kind === 1) { x.beginPath(); x.moveTo(-4, -8); x.lineTo(4, -8); x.lineTo(0, 0); x.closePath(); x.fill(); x.beginPath(); x.moveTo(0, 0); x.lineTo(0, 12); x.stroke(); }
        else { x.beginPath(); x.moveTo(0, 0); x.lineTo(10, -6); x.lineTo(6, 4); x.closePath(); x.fill(); }
        x.restore(); xx += 18 + v * 26;
      }
    }
    x.restore();
  }
  // لوح الرقيم: حافة علوية بشُرفات مدرّجة كأسوار بابل، وحواف دائرية في الأسفل
  function tabletPath(x, X, Y, W, H, mw) {
    const n = Math.max(3, Math.round(W / mw)), w = W / n, s = w / 4, step = w * 0.22;
    x.beginPath(); x.moveTo(X, Y + H - 30); x.lineTo(X, Y + step * 2);
    for (let i = 0; i < n; i++) { const a = X + i * w;
      x.lineTo(a + s * 0.5, Y + step * 2); x.lineTo(a + s * 0.5, Y + step); x.lineTo(a + s * 1.2, Y + step); x.lineTo(a + s * 1.2, Y); x.lineTo(a + s * 2.8, Y); x.lineTo(a + s * 2.8, Y + step); x.lineTo(a + s * 3.5, Y + step); x.lineTo(a + s * 3.5, Y + step * 2); x.lineTo(a + w, Y + step * 2); }
    x.lineTo(X + W, Y + H - 30); x.quadraticCurveTo(X + W, Y + H, X + W - 30, Y + H); x.lineTo(X + 30, Y + H); x.quadraticCurveTo(X, Y + H, X, Y + H - 30); x.closePath();
    return step * 2;
  }
  function tablet(x, X, Y, W, H, mw) {
    x.save(); x.shadowColor = "rgba(0,0,0,.55)"; x.shadowBlur = 40; x.shadowOffsetY = 14;
    const top = tabletPath(x, X, Y, W, H, mw);
    const g = x.createLinearGradient(0, Y, 0, Y + H); g.addColorStop(0, "#f7eed9"); g.addColorStop(1, CLAY_D); x.fillStyle = g; x.fill(); x.restore();
    x.save(); tabletPath(x, X, Y, W, H, mw); x.clip();
    for (let i = 0; i < 1600; i++) { const px = X + hash(i * 3.1) * W, py = Y + hash(i * 7.7) * H; x.fillStyle = `rgba(120,88,40,${0.04 + hash(i) * 0.06})`; x.fillRect(px, py, 2, 2); }
    const vg = x.createRadialGradient(X + W / 2, Y + H / 2, Math.min(W, H) * 0.3, X + W / 2, Y + H / 2, Math.max(W, H) * 0.7); vg.addColorStop(0, "rgba(0,0,0,0)"); vg.addColorStop(1, "rgba(120,80,20,.18)"); x.fillStyle = vg; x.fillRect(X, Y, W, H);
    x.restore();
    tabletPath(x, X, Y, W, H, mw); x.lineWidth = 5; x.strokeStyle = "#c8962f"; x.stroke();
    return top;
  }
  // الختم: حافة مسنّنة ذهبية، قرص لازوردي، نجمة شمش، ووردة في المركز
  function seal(x, cx, cy, r) {
    x.save();
    x.beginPath(); for (let i = 0; i <= 72; i++) { const a = i / 72 * Math.PI * 2, rr2 = r * (i % 2 ? 0.94 : 1); x.lineTo(cx + Math.cos(a) * rr2, cy + Math.sin(a) * rr2); }
    const g = x.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r); g.addColorStop(0, "#ffe7a6"); g.addColorStop(0.6, "#e0a93a"); g.addColorStop(1, "#a86c12");
    x.fillStyle = g; x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 16; x.shadowOffsetY = 6; x.fill(); x.shadowColor = "transparent";
    pathDot(x, cx, cy, r * 0.74, LAPIS);
    x.beginPath(); x.arc(cx, cy, r * 0.66, 0, Math.PI * 2); x.lineWidth = 2; x.strokeStyle = "#e7b54a"; x.stroke();
    star8(x, cx, cy, r * 0.6, r * 0.26, "#e7b54a");
    rosette(x, cx, cy, r * 0.24, 10);
    x.restore();
  }

  /* ---------- الشهادة الأفقية: جدار بوابة عشتار + رقيم طيني ---------- */
  function drawWide(x, W, H, logo, qm) {
    const cx = W / 2;
    bricks(x, 0, 0, W, H, 132, 56);
    rosetteBand(x, 0, 34, W, 110); rosetteBand(x, 0, H - 144, W, 110);
    // أسدا الموكب يتقدّمان نحو الرقيم، ونخلتان فوقهما
    lion(x, 200, 820, 0.78, 1); lion(x, W - 200, 820, 0.78, -1);
    palm(x, 200, 650, 300, "#e9b84a"); palm(x, W - 200, 650, 300, "#e9b84a");
    star8(x, 200, 1040, 34, 13, "#e9b84a"); star8(x, W - 200, 1040, 34, 13, "#e9b84a");
    const TX = 380, TY = 176, TW = W - 760, TH = H - 176 - 212;
    const top = tablet(x, TX, TY, TW, TH, 120);
    wedges(x, TX + 40, TY + top + 40, TW - 80, TH - top - 80, 0.05);
    x.direction = "rtl"; x.textAlign = "center"; x.textBaseline = "alphabetic";

    const T0 = TY + top;
    if (logo) { x.save(); x.beginPath(); x.arc(cx, T0 + 70, 52, 0, Math.PI * 2); x.clip(); x.drawImage(logo, cx - 52, T0 + 18, 104, 104); x.restore();
      x.beginPath(); x.arc(cx, T0 + 70, 54, 0, Math.PI * 2); x.lineWidth = 4; x.strokeStyle = "#c8962f"; x.stroke(); }
    x.fillStyle = LAPIS; x.font = `700 32px ${PLEX}`; x.fillText("الإمبراطورية العراقية", cx, T0 + 162);

    let g = x.createLinearGradient(cx - 360, 0, cx + 360, 0); g.addColorStop(0, "#7a4a0e"); g.addColorStop(.5, "#c48a22"); g.addColorStop(1, "#7a4a0e");
    x.fillStyle = g; x.font = `700 104px ${PLEX}`; x.fillText("شهادة ترحيب", cx, T0 + 278);
    x.fillStyle = "#5a4a2c"; x.font = `600 31px ${PLEX}`; x.fillText("مبدعون عراقيون · موسوعة المبدعين العراقيين", cx, T0 + 330);
    rivers(x, cx, T0 + 368, 500);

    x.fillStyle = "#4b3c22"; x.font = `400 32px ${PLEX}`; x.fillText("يسرّ فريق الإمبراطورية العراقية أن يرحّب بـ", cx, T0 + 428);
    let ns = 100; x.font = `700 ${ns}px ${PLEX}`; while (x.measureText(C.name).width > TW - 200 && ns > 46) { ns -= 4; x.font = `700 ${ns}px ${PLEX}`; }
    const name1 = x.measureText(C.name).width > TW - 200 ? wrap(x, C.name, TW - 200)[0] + "…" : C.name;
    x.fillStyle = LAPIS_D; x.fillText(name1, cx, T0 + 530);
    const uw = Math.min(TW - 200, x.measureText(name1).width + 140);
    g = x.createLinearGradient(cx - uw / 2, 0, cx + uw / 2, 0); g.addColorStop(0, "rgba(181,121,29,0)"); g.addColorStop(.5, OCHRE); g.addColorStop(1, "rgba(181,121,29,0)");
    x.fillStyle = g; x.fillRect(cx - uw / 2, T0 + 556, uw, 4);
    x.fillStyle = OCHRE; x.font = `600 38px ${PLEX}`; x.fillText([C.field, C.place].filter(Boolean).join(" · "), cx, T0 + 612);
    x.fillStyle = "#4b3c22"; x.font = `400 29px ${PLEX}`;
    wrap(x, CONGRATS, TW - 260).slice(0, 3).forEach((l, i) => x.fillText(l, cx, T0 + 670 + i * 44));

    // الصف السفلي: التاريخ والرقم يميناً، الختم في الوسط، رمز QR والرابط يساراً
    const by = TY + TH - 108, rx = TX + TW - 64;
    x.textAlign = "right";
    x.fillStyle = "#7a6744"; x.font = `400 25px ${PLEX}`; x.fillText("تاريخ الانضمام", rx, by);
    x.fillStyle = LAPIS_D; x.font = `700 31px ${PLEX}`; x.fillText(fmtDate(C.added), rx, by + 44);
    x.fillStyle = "#7a6744"; x.font = `400 25px ${PLEX}`; x.fillText("رقم الشهادة", rx - 300, by);
    x.fillStyle = LAPIS_D; x.font = `700 31px ${PLEX}`; ltr(x, C.code, rx - 300, by + 44, "right");
    seal(x, cx + 30, by + 14, 66);
    const qs = 140, qx = TX + 50, qy = by - 56;
    drawQr(x, qm, qx, qy, qs, LAPIS_D, "#fffaf0"); rr(x, qx, qy, qs, qs, qs * .08); x.lineWidth = 3; x.strokeStyle = "#c8962f"; x.stroke();
    x.textAlign = "left"; x.fillStyle = "#7a6744"; x.font = `400 24px ${PLEX}`; x.fillText("امسح الرمز لتفتح صفحة المبدع", qx + qs + 22, qy + 36);
    const [dom, ...rest] = shortUrl.split("/"), path = rest.length ? "/" + rest.join("/") : "";
    x.fillStyle = LAPIS_D; x.font = `600 ${fitLtr(x, dom, 600, 290, 25, 15)}px ${PLEX}`; ltr(x, dom, qx + qs + 22, qy + 82, "left");
    if (path) { x.font = `600 ${fitLtr(x, path, 600, 290, 22, 13)}px ${PLEX}`; ltr(x, path, qx + qs + 22, qy + 116, "left"); }

    x.textAlign = "center"; x.fillStyle = "#e9dcc0"; x.font = `400 24px ${PLEX}`; x.direction = "rtl"; x.fillText(DISCLAIMER, cx, H - 164);
  }

  /* ---------- الشهادة الطولية (للستوري): أسدان متقابلان فوق الرقيم ---------- */
  function drawStory(x, W, H, logo, qm) {
    const cx = W / 2;
    bricks(x, 0, 0, W, H, 120, 52);
    rosetteBand(x, 0, 40, W, 96); rosetteBand(x, 0, H - 136, W, 96);
    lion(x, cx - 280, 268, 0.5, 1); lion(x, cx + 280, 268, 0.5, -1);
    if (logo) { x.save(); x.beginPath(); x.arc(cx, 250, 64, 0, Math.PI * 2); x.clip(); x.drawImage(logo, cx - 64, 186, 128, 128); x.restore();
      x.beginPath(); x.arc(cx, 250, 67, 0, Math.PI * 2); x.lineWidth = 5; x.strokeStyle = "#e9b84a"; x.stroke(); }
    const TX = 70, TY = 380, TW = W - 140, TH = 1110;
    const top = tablet(x, TX, TY, TW, TH, 104);
    wedges(x, TX + 30, TY + top + 30, TW - 60, TH - top - 60, 0.05);
    x.direction = "rtl"; x.textAlign = "center"; x.textBaseline = "alphabetic";
    x.fillStyle = LAPIS; x.font = `700 36px ${PLEX}`; x.fillText("الإمبراطورية العراقية", cx, TY + top + 70);
    let g = x.createLinearGradient(cx - 300, 0, cx + 300, 0); g.addColorStop(0, "#7a4a0e"); g.addColorStop(.5, "#c48a22"); g.addColorStop(1, "#7a4a0e");
    x.fillStyle = g; x.font = `700 112px ${PLEX}`; x.fillText("شهادة ترحيب", cx, TY + top + 200);
    x.fillStyle = "#5a4a2c"; x.font = `600 32px ${PLEX}`; x.fillText("مبدعون عراقيون · موسوعة المبدعين العراقيين", cx, TY + top + 258);
    rivers(x, cx, TY + top + 300, 460);
    x.fillStyle = "#4b3c22"; x.font = `400 36px ${PLEX}`; x.fillText("نرحّب بـ", cx, TY + top + 372);
    let size = 104, lines; for (;;) { x.font = `700 ${size}px ${PLEX}`; lines = wrap(x, C.name, TW - 140); if ((lines.length <= 2 && lines.every((l) => x.measureText(l).width <= TW - 140)) || size <= 50) break; size -= 4; }
    lines = lines.slice(0, 2); const lh = size * 1.25;
    x.fillStyle = LAPIS_D; lines.forEach((l, i) => x.fillText(l, cx, TY + top + 390 + size + i * lh));
    const y = TY + top + 390 + size + (lines.length - 1) * lh + 72;
    x.fillStyle = OCHRE; x.font = `600 40px ${PLEX}`; x.fillText([C.field, C.place].filter(Boolean).join(" · "), cx, y);
    x.fillStyle = "#4b3c22"; x.font = `400 33px ${PLEX}`;
    const cl = wrap(x, CONGRATS, TW - 160).slice(0, 4);
    cl.forEach((l, i) => x.fillText(l, cx, y + 70 + i * 54));
    const ry = TY + TH - 120;
    x.fillStyle = "#7a6744"; x.font = `400 28px ${PLEX}`; x.fillText("تاريخ الانضمام", cx + 270, ry); x.fillText("رقم الشهادة", cx - 270, ry);
    x.fillStyle = LAPIS_D; x.font = `700 38px ${PLEX}`; x.fillText(fmtDate(C.added), cx + 270, ry + 52); ltr(x, C.code, cx - 270, ry + 52, "center");
    seal(x, cx, ry + 10, 70);

    // لوح ذهبي فيه رمز QR والرابط
    const M = 90, bh = 204, bt = TY + TH + 30;
    g = x.createLinearGradient(M, 0, W - M, 0); g.addColorStop(0, "#c98a1a"); g.addColorStop(.55, "#f4bd4f"); g.addColorStop(1, "#ffe7a6");
    x.save(); x.shadowColor = "rgba(0,0,0,.45)"; x.shadowBlur = 30; x.shadowOffsetY = 10; rr(x, M, bt, W - 2 * M, bh, 28); x.fillStyle = g; x.fill(); x.restore();
    rr(x, M + 10, bt + 10, W - 2 * M - 20, bh - 20, 20); x.lineWidth = 2; x.strokeStyle = "rgba(22,15,2,.35)"; x.stroke();
    const qs = 168, qx = M + 20, qy = bt + (bh - qs) / 2;
    drawQr(x, qm, qx, qy, qs, LAPIS_D, "#fff8e6");
    const tx = W - M - 36, tw = W - 2 * M - qs - 22 - 60;
    x.textAlign = "right"; x.fillStyle = "#160f02"; x.font = `700 40px ${PLEX}`; x.fillText("صفحتي في مبدعون عراقيون", tx, bt + 82);
    x.fillStyle = "rgba(22,15,2,.78)"; x.font = `600 28px ${PLEX}`; x.fillText("امسح الرمز لتفتحها", tx, bt + 128);
    x.fillStyle = "#160f02"; x.font = `600 ${fitLtr(x, shortUrl, 600, tw, 26, 14)}px ${PLEX}`; ltr(x, shortUrl, tx, bt + 176, "right");

    x.textAlign = "center"; x.fillStyle = "#e9dcc0"; x.font = `400 24px ${PLEX}`; x.fillText(DISCLAIMER, cx, H - 158);
  }

  /* ---------- الرسم (مرة واحدة لكل مقاس) ---------- */
  const cache = {};
  async function render(kind) {
    if (cache[kind]) return cache[kind];
    const { w: W, h: H } = SIZES[kind], cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const x = cv.getContext("2d");
    // النص يُمرَّر لطلب الخط حتى تُحمَّل مجموعة الحروف العربية لا اللاتينية فقط
    const sample = `شهادة ترحيب ${C.name} ${C.field} ${CONGRATS} 0123456789 ${shortUrl}`;
    try { await Promise.all([400, 600, 700].map((wt) => document.fonts.load(`${wt} 60px ${PLEX}`, sample))); } catch { /* خط النظام */ }
    const [logo, qm] = await Promise.all([loadImg("assets/img/logo-256.png").catch(() => null), qrMatrix(pageUrl)]);
    (kind === "wide" ? drawWide : drawStory)(x, W, H, logo, qm);
    const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    if (!blob) throw new Error("blob");
    return (cache[kind] = { blob, src: URL.createObjectURL(blob), file: new File([blob], `iraqi-creators-certificate-${C.slug}-${kind}.png`, { type: "image/png" }) });
  }

  /* ---------- النافذة ---------- */
  let open = false;
  async function show(mode) {
    if (open) return; open = true;
    let kind = "wide";
    const m = App.modal(`<div class="cert-modal">
      <span class="kicker">شهادة ترحيب</span><h2>شهادة ${esc(C.name)}</h2>
      <div class="cert-tabs" role="group" aria-label="مقاس الشهادة">${Object.entries(SIZES).map(([k, s]) => `<button type="button" class="chip${k === kind ? " active" : ""}" data-size="${k}" aria-pressed="${k === kind}">${esc(s.label)}<span class="count">${esc(s.hint)}</span></button>`).join("")}</div>
      <div class="cert-view" data-kind="${kind}" aria-busy="true"><img alt="معاينة شهادة ${esc(C.name)}" hidden><p class="small muted">نرسم الشهادة…</p></div>
      <div class="btn-row"><button class="btn btn-ghost" type="button" data-act="share" hidden>${ic("share-2")}شارك</button><button class="btn btn-primary" type="button" data-act="dl" disabled>${ic("download")}حمّل الصورة</button><button class="btn btn-ghost" type="button" data-copy="${esc(pageUrl)}#certificate">${ic("link")}انسخ رابط الشهادة</button></div>
      <p class="small muted mb-0 mt-2">${esc(DISCLAIMER)}. رمز QR في الشهادة يفتح صفحة ${esc(C.name)}.</p>
    </div>`, { onClose: () => { open = false; if (location.hash === "#certificate") history.replaceState(null, "", location.pathname + location.search); } });
    const el = m.el, view = $(".cert-view", el), img = $("img", view), wait = $("p", view), dl = $('[data-act="dl"]', el), sh = $('[data-act="share"]', el);
    let cur = null;
    async function load(k) {
      kind = k; cur = null; view.dataset.kind = k; view.setAttribute("aria-busy", "true"); img.hidden = true; wait.hidden = false; dl.disabled = true;
      App.$$("[data-size]", el).forEach((b) => { const on = b.dataset.size === k; b.classList.toggle("active", on); b.setAttribute("aria-pressed", String(on)); });
      try {
        const r = await render(k); if (kind !== k) return;
        cur = r; img.src = r.src; img.width = SIZES[k].w; img.height = SIZES[k].h; img.hidden = false; wait.hidden = true; dl.disabled = false; view.removeAttribute("aria-busy");
        sh.hidden = !(navigator.canShare && navigator.canShare({ files: [r.file] }));
      } catch { wait.textContent = "تعذّر رسم الشهادة على هذا المتصفح. جرّب متصفحاً آخر."; toast("تعذّر رسم الشهادة", "alert-triangle"); }
    }
    const share = () => cur && navigator.share({ files: [cur.file], title: `شهادة ${C.name} - مبدعون عراقيون`, text: `شهادة ترحيب ${C.name} في «مبدعون عراقيون»\n${pageUrl}` }).catch(() => {});
    el.addEventListener("click", (e) => {
      const s = e.target.closest("[data-size]"); if (s) { if (s.dataset.size !== kind) load(s.dataset.size); return; }
      const b = e.target.closest("[data-act]"); if (!b || !cur) return;
      if (b.dataset.act === "dl") { App.download(cur.blob, cur.file.name); toast("حُمّلت الشهادة", "download"); } else share();
    });
    await load(kind);
    if (mode === "share" && cur && !sh.hidden) share();
  }

  document.addEventListener("click", (e) => { const b = e.target.closest("[data-cert]"); if (b) show(b.dataset.cert); });
  const fromHash = () => { if (location.hash === "#certificate") show("open"); };
  addEventListener("hashchange", fromHash);
  fromHash();
})();
