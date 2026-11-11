/* ==========================================================
   بطاقة الستوري: نتيجة الاختبار بتصميم تاريخي خيالي (1080×1920)
   سماء بابل ليلاً، هلال، زقورة بعيدة، نخيل، بوابة عشتار بطابوقها الأزرق
   وورودها الذهبية، إطار مسماري، وميدالية ذهبية بالنتيجة.
   في الزاوية مربع «اختبر نفسك» مع باركود يفتح الموقع.
   يُرسم بالكامل داخل المتصفح (Canvas)، ولا يُرفع شيء إلى أي خادم.
   ========================================================== */
(function () {
  "use strict";
  const W = 1080, H = 1920;
  const GOLD = ["#fff1c2", "#f7cf6b", "#d39a26", "#8a5a0c"];

  function rng(seed) { let s = (seed >>> 0) || 7; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
  const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });

  async function fontsReady() {
    if (!document.fonts) return;
    await Promise.all([
      '400 120px "Lalezar"', '600 100px "Reem Kufi"', '700 60px "IBM Plex Sans Arabic"', '500 40px "IBM Plex Sans Arabic"'
    ].map((f) => document.fonts.load(f, "إمبراطورية 0123").catch(() => null)));
  }

  /* ---------- helpers ---------- */
  function goldGrad(x, x0, y0, x1, y1) {
    const g = x.createLinearGradient(x0, y0, x1, y1);
    g.addColorStop(0, GOLD[0]); g.addColorStop(.35, GOLD[1]); g.addColorStop(.7, GOLD[2]); g.addColorStop(1, GOLD[1]);
    return g;
  }
  function rr(x, X, Y, w, h, r) { x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath(); }
  function fit(x, text, weightFamily, size, maxW, min = 30) {
    let s = size; do { x.font = `${weightFamily.replace("{s}", s)}`; s -= 2; } while (x.measureText(text).width > maxW && s > min);
    return s + 2;
  }
  function wrap(x, text, maxW) {
    const words = String(text).split(/\s+/); const lines = []; let line = "";
    for (const w of words) { const t = line ? line + " " + w : w; if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; }
    if (line) lines.push(line); return lines;
  }
  function star4(x, cx, cy, r, a) {
    x.save(); x.translate(cx, cy); x.globalAlpha = a; x.beginPath();
    for (let i = 0; i < 8; i++) { const ang = i * Math.PI / 4, rad = i % 2 ? r * .22 : r; x.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad); }
    x.closePath(); x.fillStyle = "#fff6d8"; x.shadowColor = "#ffd77a"; x.shadowBlur = r * 1.4; x.fill(); x.restore();
  }
  // Babylonian rosette (8 petals)
  function rosette(x, cx, cy, r) {
    x.save(); x.translate(cx, cy);
    x.fillStyle = "#f6d27a"; x.strokeStyle = "#7a4f07"; x.lineWidth = 1.2;
    for (let i = 0; i < 8; i++) { x.rotate(Math.PI / 4); x.beginPath(); x.ellipse(r * .52, 0, r * .46, r * .2, 0, 0, Math.PI * 2); x.fill(); x.stroke(); }
    x.beginPath(); x.arc(0, 0, r * .26, 0, Math.PI * 2); x.fillStyle = "#fff4cf"; x.fill(); x.stroke();
    x.restore();
  }
  // glazed-brick wall: blue tiles + staggered mortar
  function bricks(x, X, Y, w, h, r) {
    const g = x.createLinearGradient(X, Y, X + w, Y + h);
    g.addColorStop(0, "#1b3db8"); g.addColorStop(.5, "#2550d6"); g.addColorStop(1, "#142f8f");
    x.fillStyle = g; x.fillRect(X, Y, w, h);
    const bh = 24, bw = 54;
    for (let row = 0, yy = Y; yy < Y + h; yy += bh, row++) {
      for (let xx = X - (row % 2 ? bw / 2 : 0); xx < X + w; xx += bw) {
        const sh = r() * .16; x.fillStyle = `rgba(${r() < .5 ? "120,170,255" : "10,20,80"},${sh})`;
        x.fillRect(Math.max(X, xx + 2), yy + 2, Math.min(bw - 4, X + w - xx - 2), bh - 4);
      }
      x.fillStyle = "rgba(170,200,255,.18)"; x.fillRect(X, yy, w, 1.5);
    }
  }
  // stepped crenellations (Babylonian merlons)
  function merlons(x, X, Y, w, size) {
    for (let xx = X; xx + size <= X + w + 1; xx += size * 1.5) {
      x.beginPath();
      x.moveTo(xx, Y); x.lineTo(xx, Y - size * .45); x.lineTo(xx + size * .2, Y - size * .45); x.lineTo(xx + size * .2, Y - size * .8);
      x.lineTo(xx + size * .8, Y - size * .8); x.lineTo(xx + size * .8, Y - size * .45); x.lineTo(xx + size, Y - size * .45); x.lineTo(xx + size, Y); x.closePath();
      x.fillStyle = "#1d42c4"; x.fill(); x.strokeStyle = "rgba(247,207,107,.75)"; x.lineWidth = 2; x.stroke();
    }
  }
  function palm(x, bx, by, h, flip) {
    x.save(); x.translate(bx, by); if (flip) x.scale(-1, 1);
    x.strokeStyle = "#050916"; x.lineCap = "round";
    // trunk
    x.lineWidth = 22; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(40, -h * .5, 20, -h); x.stroke();
    x.strokeStyle = "rgba(247,207,107,.18)"; x.lineWidth = 2;
    for (let i = 1; i < 12; i++) { const t = i / 12, px = 2 * (1 - t) * t * 40 + t * t * 20, py = -h * t; x.beginPath(); x.moveTo(px - 10, py); x.lineTo(px + 10, py - 6); x.stroke(); }
    // fronds
    x.translate(20, -h);
    const fr = [[-2.6, 1], [-2.1, 1.1], [-1.5, 1.15], [-.9, 1.05], [-.4, .95], [.1, .9], [-3.1, .85], [.6, .8]];
    fr.forEach(([a, l]) => {
      x.save(); x.rotate(a); x.fillStyle = "#050916"; x.beginPath(); x.moveTo(0, 0);
      x.quadraticCurveTo(h * .32 * l, -h * .12, h * .62 * l, h * .1 * l); x.quadraticCurveTo(h * .3 * l, -h * .02, 0, 10); x.fill();
      x.strokeStyle = "rgba(247,207,107,.22)"; x.lineWidth = 2; x.beginPath(); x.moveTo(0, 0); x.quadraticCurveTo(h * .32 * l, -h * .12, h * .62 * l, h * .1 * l); x.stroke();
      x.restore();
    });
    x.restore();
  }
  function cuneiformBand(x, Y, r) {
    x.save();
    x.fillStyle = "rgba(4,8,24,.75)"; x.fillRect(60, Y, W - 120, 46);
    x.strokeStyle = "rgba(247,207,107,.55)"; x.lineWidth = 2; x.strokeRect(60, Y, W - 120, 46);
    x.fillStyle = "rgba(247,207,107,.8)";
    for (let xx = 80; xx < W - 80; xx += 22 + r() * 16) {
      const n = 1 + Math.floor(r() * 3), vert = r() < .5;
      for (let k = 0; k < n; k++) {
        x.save(); x.translate(xx + k * 9, Y + 23 + (vert ? 0 : (k - 1) * 6)); x.rotate(vert ? Math.PI / 2 : 0);
        x.beginPath(); x.moveTo(-7, -5); x.lineTo(1, 0); x.lineTo(-7, 5); x.closePath(); x.fill();
        x.fillRect(0, -1, 10, 2); x.restore();
      }
    }
    x.restore();
  }

  async function iconImg(name, color) {
    try {
      const key = name.split("-").map((s) => s[0].toUpperCase() + s.slice(1)).join("");
      if (!window.lucide || !lucide.icons || !lucide.icons[key]) return null;
      const el = lucide.createElement(lucide.icons[key]);
      el.setAttribute("width", "96"); el.setAttribute("height", "96"); el.setAttribute("stroke", color); el.setAttribute("stroke-width", "1.7");
      el.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      return await loadImg("data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(el)));
    } catch { return null; }
  }

  function qrMatrix(text) {
    if (!window.qrcode) return null;
    try {
      qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));
      const q = qrcode(0, "M"); q.addData(text, "Byte"); q.make();
      const n = q.getModuleCount(); return { n, dark: (r, c) => q.isDark(r, c) };
    } catch { return null; }
  }

  /* ---------- main ---------- */
  async function render(o) {
    await fontsReady();
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    const r = rng(o.seed || 1);

    /* sky */
    const sky = x.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#03061a"); sky.addColorStop(.3, "#0a1750"); sky.addColorStop(.58, "#1a2c86"); sky.addColorStop(.78, "#0b1340"); sky.addColorStop(1, "#03050e");
    x.fillStyle = sky; x.fillRect(0, 0, W, H);
    const neb = (cx, cy, rad, col) => { const g = x.createRadialGradient(cx, cy, 0, cx, cy, rad); g.addColorStop(0, col); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(0, 0, W, H); };
    neb(540, 760, 620, "rgba(242,180,60,.32)"); neb(160, 420, 420, "rgba(90,120,255,.28)"); neb(920, 1180, 380, "rgba(170,90,255,.18)");

    /* stars */
    for (let i = 0; i < 320; i++) { x.globalAlpha = .25 + r() * .75; x.fillStyle = r() < .2 ? "#ffe3a1" : "#ffffff"; x.beginPath(); x.arc(r() * W, r() * H * .78, .5 + r() * 1.8, 0, Math.PI * 2); x.fill(); }
    x.globalAlpha = 1;
    for (let i = 0; i < 16; i++) star4(x, 60 + r() * (W - 120), 200 + r() * 1000, 6 + r() * 14, .5 + r() * .5);

    /* crescent moon */
    neb(185, 610, 170, "rgba(255,230,170,.32)");
    x.fillStyle = "#fff0c7"; x.beginPath(); x.arc(185, 610, 58, 0, Math.PI * 2); x.fill();
    x.fillStyle = sky; x.beginPath(); x.arc(207, 594, 55, 0, Math.PI * 2); x.fill();

    /* light rays behind the medallion */
    x.save(); x.translate(540, 760); x.globalCompositeOperation = "lighter";
    for (let i = 0; i < 24; i++) { x.rotate(Math.PI * 2 / 24); x.beginPath(); x.moveTo(0, 0); x.lineTo(-26, -760); x.lineTo(26, -760); x.closePath(); x.fillStyle = `rgba(247,207,107,${i % 2 ? .035 : .06})`; x.fill(); }
    x.restore();

    /* distant ziggurat */
    const tiers = [[820, 64], [650, 62], [490, 60], [340, 58], [200, 56]];
    let zy = 1500;
    x.save(); x.globalAlpha = .35;
    tiers.forEach(([w, h]) => { zy -= h; x.fillStyle = "#0a1235"; x.fillRect(540 - w / 2, zy, w, h); x.strokeStyle = "rgba(247,207,107,.35)"; x.lineWidth = 2; x.strokeRect(540 - w / 2, zy, w, h); });
    x.restore();

    /* palms */
    palm(x, 120, 1700, 520, false); palm(x, 970, 1710, 470, true); palm(x, 230, 1760, 360, true);

    /* Ishtar Gate */
    const base = H + 10;
    const tw = 230, th = 470, gx = 540;
    bricks(x, gx - 330, base - th, tw, th, r); bricks(x, gx + 100, base - th, tw, th, r);
    bricks(x, gx - 110, base - th + 90, 220, th - 90, r);
    // arch opening
    x.save(); x.beginPath(); x.moveTo(gx - 80, base); x.lineTo(gx - 80, base - 300); x.arc(gx, base - 300, 80, Math.PI, 0); x.lineTo(gx + 80, base); x.closePath();
    const ag = x.createLinearGradient(0, base - 380, 0, base); ag.addColorStop(0, "#f7cf6b"); ag.addColorStop(.25, "#5a3a0a"); ag.addColorStop(1, "#05060f");
    x.fillStyle = ag; x.fill(); x.lineWidth = 6; x.strokeStyle = goldGrad(x, gx - 80, base - 380, gx + 80, base); x.stroke(); x.restore();
    merlons(x, gx - 330, base - th, tw, 40); merlons(x, gx + 100, base - th, tw, 40); merlons(x, gx - 110, base - th + 90, 220, 34);
    // gold bands with rosettes
    [base - th + 64, base - th + 250].forEach((by) => {
      [[gx - 330, tw], [gx + 100, tw]].forEach(([bx, bw]) => {
        x.fillStyle = "rgba(10,20,70,.9)"; x.fillRect(bx, by - 22, bw, 44);
        x.fillStyle = goldGrad(x, bx, by, bx + bw, by); x.fillRect(bx, by - 24, bw, 3); x.fillRect(bx, by + 21, bw, 3);
        for (let k = 0; k < 4; k++) rosette(x, bx + 30 + k * (bw - 60) / 3, by, 17);
      });
    });

    /* gold dust */
    x.save(); x.globalCompositeOperation = "lighter";
    for (let i = 0; i < 140; i++) { const px = r() * W, py = 450 + r() * 1150, s = .8 + r() * 2.6; x.fillStyle = `rgba(255,215,120,${.2 + r() * .6})`; x.beginPath(); x.arc(px, py, s, 0, Math.PI * 2); x.fill(); }
    x.restore();

    /* frame + cuneiform frieze */
    x.save(); x.strokeStyle = goldGrad(x, 0, 0, W, H); x.lineWidth = 4; rr(x, 34, 34, W - 68, H - 68, 36); x.stroke();
    x.globalAlpha = .45; x.lineWidth = 1.5; rr(x, 50, 50, W - 100, H - 100, 26); x.stroke(); x.restore();
    [[34, 34], [W - 34, 34], [34, H - 34], [W - 34, H - 34]].forEach(([cx, cy]) => { x.save(); x.translate(cx, cy); x.rotate(Math.PI / 4); x.fillStyle = goldGrad(x, -14, -14, 14, 14); x.fillRect(-13, -13, 26, 26); x.fillStyle = "#0a1440"; x.fillRect(-6, -6, 12, 12); x.restore(); });
    cuneiformBand(x, 380, r);

    /* brand (below Instagram's top bar) */
    x.direction = "rtl"; x.textAlign = "center"; x.textBaseline = "alphabetic";
    x.save(); x.translate(540, 228);
    x.fillStyle = goldGrad(x, -40, -30, 40, 30);
    x.beginPath(); x.moveTo(-34, 14); x.lineTo(-38, -22); x.lineTo(-17, -4); x.lineTo(0, -32); x.lineTo(17, -4); x.lineTo(38, -22); x.lineTo(34, 14); x.closePath(); x.fill();
    x.fillRect(-34, 20, 68, 9); x.restore();
    x.fillStyle = "#f6ecd2"; x.font = '600 46px "Reem Kufi"'; x.fillText("إمبراطورية المعلومات العراقية", 540, 312);
    x.fillStyle = "rgba(247,207,107,.85)"; x.direction = "ltr"; x.font = '500 28px "IBM Plex Sans Arabic"'; x.fillText("@" + (o.handle || "information_1q"), 540, 352); x.direction = "rtl";
    if (o.date) { x.font = '500 26px "IBM Plex Sans Arabic"'; x.fillStyle = "rgba(255,240,200,.6)"; x.fillText(o.date, 540, 466); }

    /* kicker */
    x.fillStyle = "rgba(255,240,200,.92)"; x.font = '500 34px "IBM Plex Sans Arabic"'; x.fillText(o.kicker || "نتيجتي في تحدّي الإمبراطورية", 540, 522);

    /* medallion */
    const mx = 540, my = 760, mr = 205;
    x.save();
    x.shadowColor = "rgba(247,190,80,.75)"; x.shadowBlur = 80;
    x.beginPath(); x.arc(mx, my, mr + 24, 0, Math.PI * 2); x.fillStyle = goldGrad(x, mx - mr, my - mr, mx + mr, my + mr); x.fill();
    x.restore();
    x.beginPath(); x.arc(mx, my, mr + 10, 0, Math.PI * 2); x.strokeStyle = "rgba(90,55,5,.7)"; x.lineWidth = 3; x.stroke();
    // answer ring: one arc per question
    const total = o.total || 10, gap = .05, seg = (Math.PI * 2) / total;
    for (let k = 0; k < total; k++) {
      x.beginPath(); x.arc(mx, my, mr - 6, -Math.PI / 2 + k * seg + gap / 2, -Math.PI / 2 + (k + 1) * seg - gap / 2);
      x.lineWidth = 16; x.lineCap = "round"; x.strokeStyle = o.marks && o.marks[k] ? "#1e3fb8" : "rgba(60,30,0,.35)"; x.stroke();
    }
    const disk = x.createRadialGradient(mx, my - 60, 20, mx, my, mr - 22);
    disk.addColorStop(0, "#2a4fd6"); disk.addColorStop(.7, "#0e1d5c"); disk.addColorStop(1, "#060c2a");
    x.beginPath(); x.arc(mx, my, mr - 22, 0, Math.PI * 2); x.fillStyle = disk; x.fill();
    x.lineWidth = 3; x.strokeStyle = "rgba(247,207,107,.6)"; x.stroke();
    const icon = await iconImg(o.icon || "crown", "#f7cf6b");
    if (icon) x.drawImage(icon, mx - 42, my - 150, 84, 84);
    x.direction = "ltr"; x.textAlign = "center";
    x.font = '400 168px "Lalezar"'; x.fillStyle = goldGrad(x, mx - 120, my - 60, mx + 120, my + 80);
    x.shadowColor = "rgba(0,0,0,.5)"; x.shadowBlur = 20; x.fillText(`${o.score}/${total}`, mx, my + 78); x.shadowBlur = 0;
    x.direction = "rtl";

    /* rank title */
    const rs = fit(x, o.rank, '600 {s}px "Reem Kufi"', 112, 900, 60);
    x.font = `600 ${rs}px "Reem Kufi"`;
    x.shadowColor = "rgba(247,190,80,.6)"; x.shadowBlur = 40;
    x.fillStyle = goldGrad(x, 120, 1000, 960, 1100); x.fillText(o.rank, 540, 1078); x.shadowBlur = 0;

    let y = 1078;
    if (o.name) { y += 74; x.fillStyle = "#ffffff"; fit(x, o.name, '700 {s}px "IBM Plex Sans Arabic"', 54, 820, 30); x.fillText(o.name, 540, y); }
    if (o.message) {
      x.font = '500 34px "IBM Plex Sans Arabic"'; x.fillStyle = "rgba(220,226,245,.88)";
      wrap(x, o.message, 840).slice(0, 2).forEach((l) => { y += 54; x.fillText(l, 540, y); });
    }

    /* stats pills */
    const pills = (o.stats || []).slice(0, 3);
    if (pills.length) {
      x.font = '700 32px "IBM Plex Sans Arabic"';
      const pw = pills.map((p) => x.measureText(p).width + 64), totalW = pw.reduce((a, b) => a + b, 0) + (pills.length - 1) * 18;
      let px = 540 + totalW / 2; y += 96;
      pills.forEach((p, k) => {
        const w = pw[k]; rr(x, px - w, y - 46, w, 66, 33);
        x.fillStyle = "rgba(6,10,32,.72)"; x.fill(); x.strokeStyle = "rgba(247,207,107,.6)"; x.lineWidth = 2; x.stroke();
        x.fillStyle = "#ffe7a6"; x.fillText(p, px - w / 2, y); px -= w + 18;
      });
    }

    /* corner box: «اختبر نفسك» + QR */
    const bx = 74, bw = 330, bh = 392, by = H - 74 - bh - 150; // stays above Instagram's reply bar
    x.save(); x.shadowColor = "rgba(0,0,0,.6)"; x.shadowBlur = 40;
    rr(x, bx, by, bw, bh, 30); x.fillStyle = "rgba(5,9,28,.92)"; x.fill(); x.restore();
    rr(x, bx, by, bw, bh, 30); x.lineWidth = 4; x.strokeStyle = goldGrad(x, bx, by, bx + bw, by + bh); x.stroke();
    rr(x, bx + 10, by + 10, bw - 20, bh - 20, 22); x.lineWidth = 1.5; x.strokeStyle = "rgba(247,207,107,.4)"; x.stroke();
    x.textAlign = "center"; x.direction = "rtl";
    x.font = '600 48px "Reem Kufi"'; x.fillStyle = goldGrad(x, bx, by, bx + bw, by + 60); x.fillText("اختبر نفسك", bx + bw / 2, by + 70);
    const qs = 214, qx = bx + (bw - qs) / 2, qy = by + 96;
    rr(x, qx - 12, qy - 12, qs + 24, qs + 24, 16); x.fillStyle = "#fbf0d2"; x.fill();
    const m = qrMatrix(o.url || "https://www.instagram.com/information_1q/");
    if (m) {
      const cell = qs / m.n; x.fillStyle = "#0a1440";
      for (let rI = 0; rI < m.n; rI++) for (let cI = 0; cI < m.n; cI++) if (m.dark(rI, cI)) x.fillRect(qx + cI * cell, qy + rI * cell, Math.ceil(cell), Math.ceil(cell));
    }
    x.font = '500 25px "IBM Plex Sans Arabic"'; x.fillStyle = "rgba(255,240,200,.9)"; x.fillText("امسح الرمز وتحدَّني", bx + bw / 2, by + bh - 34);


    return c;
  }

  window.QuizStory = { render, W, H };
})();
