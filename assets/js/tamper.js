/* ==========================================================
   محرك كشف التعديل (كله داخل المتصفح)
   1) ELA: إعادة الضغط ومقارنة مستوى الخطأ — الأجزاء الملصوقة تحمل تاريخ ضغط مختلفاً
   2) الضوضاء: بصمة حساس الكاميرا يجب أن تكون متجانسة في كل الصورة
   3) النسخ واللصق: كتل متطابقة داخل الصورة نفسها مع إزاحة ثابتة (ختم الاستنساخ)
   4) الصورة المصغّرة في EXIF: تحفظها الكاميرا لحظة التصوير، فإن اختلفت عن الصورة فقد عُدّلت
   5) البيانات: برنامج التعديل، التواريخ، وجودة JPEG
   ========================================================== */
(function () {
  "use strict";
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const tick = () => new Promise((r) => setTimeout(r, 0));
  const median = (arr) => { if (!arr.length) return 0; const s = Float32Array.from(arr).sort(); return s[s.length >> 1]; };
  const mad = (arr, m) => median(arr.map((v) => Math.abs(v - m))) || 1e-6;

  /* ---------- Canvas helpers ---------- */
  function canvasFrom(src, maxSide) {
    const s = Math.min(1, maxSide / Math.max(src.width, src.height));
    const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.imageSmoothingQuality = "high"; x.drawImage(src, 0, 0, w, h);
    return { c, x, w, h, s, data: x.getImageData(0, 0, w, h).data };
  }
  function luma(d, n) { const Y = new Float32Array(n); for (let i = 0, j = 0; i < n; i++, j += 4) Y[i] = .299 * d[j] + .587 * d[j + 1] + .114 * d[j + 2]; return Y; }

  /* Heat palette: black → lapis → violet → ember → gold → white */
  const LUT = (() => {
    const stops = [[0, 0, 0, 0], [.18, 18, 28, 110], [.38, 110, 40, 170], [.6, 235, 90, 50], [.82, 255, 205, 80], [1, 255, 255, 235]];
    const out = new Uint8ClampedArray(256 * 3);
    for (let i = 0; i < 256; i++) {
      const t = i / 255; let k = 0; while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const a = stops[k], b = stops[k + 1], f = (t - a[0]) / (b[0] - a[0]);
      for (let c = 0; c < 3; c++) out[i * 3 + c] = a[c + 1] + (b[c + 1] - a[c + 1]) * f;
    }
    return out;
  })();
  function heatCanvas(vals, w, h, gain) {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"), img = x.createImageData(w, h), d = img.data;
    for (let i = 0, j = 0; i < vals.length; i++, j += 4) {
      const v = clamp(Math.round(vals[i] * gain), 0, 255) * 3;
      d[j] = LUT[v]; d[j + 1] = LUT[v + 1]; d[j + 2] = LUT[v + 2]; d[j + 3] = 255;
    }
    x.putImageData(img, 0, 0); return c;
  }
  function blockHeat(vals, bw, bh, gain, w, h) {
    const small = heatCanvas(vals, bw, bh, gain);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const x = c.getContext("2d"); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high"; x.drawImage(small, 0, 0, w, h); return c;
  }

  /* ---------- Connected regions on a block grid ---------- */
  function regions(flag, bw, bh, B, minBlocks, score) {
    const seen = new Uint8Array(bw * bh), out = [];
    for (let i = 0; i < flag.length; i++) {
      if (!flag[i] || seen[i]) continue;
      const stack = [i]; seen[i] = 1; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0, s = 0;
      while (stack.length) {
        const k = stack.pop(), bx = k % bw, by = (k / bw) | 0; n++; s += score ? score[k] : 1;
        x0 = Math.min(x0, bx); y0 = Math.min(y0, by); x1 = Math.max(x1, bx); y1 = Math.max(y1, by);
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = bx + dx, ny = by + dy; if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue;
          const q = ny * bw + nx; if (flag[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
        }
      }
      if (n >= minBlocks) out.push({ x: x0 * B, y: y0 * B, w: (x1 - x0 + 1) * B, h: (y1 - y0 + 1) * B, n, strength: s / n });
    }
    return out.sort((a, b) => b.n * b.strength - a.n * a.strength).slice(0, 6);
  }

  /* ---------- Texture per block (edges raise ELA/noise naturally, so we compare like with like) ---------- */
  function textureBlocks(Y, w, h, B) {
    const bw = Math.floor(w / B), bh = Math.floor(h / B), tex = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      let s = 0;
      for (let y = by * B; y < by * B + B; y++) for (let x = bx * B; x < bx * B + B - 1; x++) { const i = y * w + x; s += Math.abs(Y[i + 1] - Y[i]) + (y + 1 < h ? Math.abs(Y[i + w] - Y[i]) : 0); }
      tex[by * bw + bx] = s / (B * B);
    }
    return { tex, bw, bh };
  }

  /* ---------- 1) Error Level Analysis ---------- */
  async function ela(base, quality) {
    const blob = await new Promise((r) => base.c.toBlob(r, "image/jpeg", quality));
    const bmp = await createImageBitmap(blob);
    const t = document.createElement("canvas"); t.width = base.w; t.height = base.h;
    const tx = t.getContext("2d", { willReadFrequently: true }); tx.drawImage(bmp, 0, 0);
    const a = base.data, b = tx.getImageData(0, 0, base.w, base.h).data, n = base.w * base.h, diff = new Float32Array(n), dy = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) {
      const r = a[j] - b[j], g = a[j + 1] - b[j + 1], bl = a[j + 2] - b[j + 2];
      diff[i] = Math.max(Math.abs(r), Math.abs(g), Math.abs(bl));          // shown to the user (classic ELA look)
      dy[i] = Math.abs(.299 * r + .587 * g + .114 * bl);                    // used for detection: immune to chroma subsampling on saturated colours
    }
    diff.y = dy;
    return diff;
  }
  function elaRegions(diffRGB, Y, w, h) {
    const diff = diffRGB.y || diffRGB;
    const B = Math.max(12, Math.round(Math.max(w, h) / 90));
    const { tex, bw, bh } = textureBlocks(Y, w, h, B), e = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      let s = 0; for (let y = by * B; y < by * B + B; y++) for (let x = bx * B; x < bx * B + B; x++) s += diff[y * w + x];
      e[by * bw + bx] = s / (B * B);
    }
    // ELA expected from texture: fit ratio on the bulk of the image, then look for blocks far above it
    const valid = []; for (let i = 0; i < e.length; i++) if (tex[i] > .5) valid.push(e[i] / (tex[i] + 2));
    const ratio = median(valid) || .1;
    const resid = Array.from(e, (v, i) => v - ratio * (tex[i] + 2));
    const m = median(resid), sd = Math.max(.35, 1.4826 * mad(resid, m)); // floor: flat designs have ~zero spread, which would blow z up
    const z = Float32Array.from(resid, (r) => (r - m) / sd);
    const eMed = median(Array.from(e)) || .5;
    const flag = Uint8Array.from(z, (v, i) => v > 4 && e[i] > eMed * 2.2 && e[i] > 1.5 ? 1 : 0);
    const minB = Math.max(3, Math.round(bw * bh * .0025));
    const regs = regions(flag, bw, bh, B, minB, z);
    const share = flag.reduce((s, v) => s + v, 0) / flag.length;
    return { regions: regs, share, level: eMed, B, grid: { z, e, tex, bw, bh } };
  }

  /* ---------- 2) Noise consistency ---------- */
  function noise(Y, w, h) {
    const B = Math.max(8, Math.round(Math.max(w, h) / 110));
    const r = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; r[i] = Math.abs(4 * Y[i] - Y[i - 1] - Y[i + 1] - Y[i - w] - Y[i + w]) / 4; }
    const { tex, bw, bh } = textureBlocks(Y, w, h, B), nb = new Float32Array(bw * bh), clip = new Uint8Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      let s = 0, l = 0; for (let y = by * B; y < by * B + B; y++) for (let x = bx * B; x < bx * B + B; x++) { s += r[y * w + x]; l += Y[y * w + x]; }
      nb[by * bw + bx] = s / (B * B); l /= B * B;
      if (l > 228 || l < 22) clip[by * bw + bx] = 1; // blown-out snow/sky or crushed black carry no sensor noise
    }
    // judge noise only in calm areas, where sensor noise dominates over detail
    const texSorted = Float32Array.from(tex).sort(), calmT = texSorted[Math.floor(texSorted.length * .45)] || 1;
    const calm = []; for (let i = 0; i < nb.length; i++) if (tex[i] <= calmT && !clip[i]) calm.push(nb[i]);
    const m = median(calm), sd = 1.4826 * mad(calm, m);
    const z = new Float32Array(nb.length), flag = new Uint8Array(nb.length);
    for (let i = 0; i < nb.length; i++) {
      if (tex[i] > calmT * 1.15 || clip[i]) continue;
      z[i] = (nb[i] - m) / (sd || 1);
      // much noisier OR suspiciously clean (blurred / clone-stamped / pasted from a cleaner source)
      if ((z[i] > 4.5 && nb[i] > m * 1.8) || (m > 1.2 && z[i] < -3.2 && nb[i] < m * .35)) flag[i] = 1;
    }
    const minB = Math.max(4, Math.round(bw * bh * .003));
    const regs = regions(flag, bw, bh, B, minB, Float32Array.from(z, Math.abs));
    return { blocks: nb, bw, bh, B, level: m, regions: regs, calmCount: calm.length };
  }

  /* ---------- 3) Copy-move (clone) detection ---------- */
  async function clones(src, sensitivity = 1) {
    const g = canvasFrom(src, 420), w = g.w, h = g.h, Y = luma(g.data, w * h);
    const B = 12, step = 2, F = 9, sub = 4, minDist = 26;
    const xs = [], ys = [], feats = [], sds = [];
    for (let y = 0; y + B <= h; y += step) for (let x = 0; x + B <= w; x += step) {
      let s = 0, s2 = 0; const f = new Array(F);
      for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) {
        let m = 0; for (let yy = 0; yy < sub; yy++) for (let xx = 0; xx < sub; xx++) { const v = Y[(y + sy * sub + yy) * w + x + sx * sub + xx]; m += v; s2 += v * v; }
        f[sy * 3 + sx] = m / 16; s += m;
      }
      const mean = s / (B * B), sd = Math.sqrt(Math.max(0, s2 / (B * B) - mean * mean));
      if (sd < 11 - sensitivity * 3 || mean < 30 || mean > 235) continue; // flat, near-black or blown-out areas match everything
      xs.push(x); ys.push(y); feats.push(f); sds.push(sd);
    }
    await tick();
    // bucket blocks by coarse descriptors (two staggered grids so copies near a bin edge still meet), then verify precisely
    const shifts = new Map(), pairs = new Map(), seenPair = new Set(), Q = 7;
    for (const off of [0, Q / 2]) {
      const buckets = new Map();
      for (let i = 0; i < feats.length; i++) {
        const key = feats[i].map((v) => Math.floor((v + off) / Q)).join(",");
        const arr = buckets.get(key); if (arr) arr.push(i); else buckets.set(key, [i]);
      }
      for (const arr of buckets.values()) {
        if (arr.length < 2 || arr.length > 90) continue; // huge buckets = repetitive texture, not evidence
        for (let p = 0; p < arr.length; p++) for (let q = p + 1; q < arr.length; q++) {
          const A = arr[p], Bi = arr[q];
          let dx = xs[Bi] - xs[A], dy = ys[Bi] - ys[A];
          if (Math.hypot(dx, dy) < minDist) continue;
          let ok = Math.abs(sds[A] - sds[Bi]) < Math.max(3, sds[A] * .18);
          for (let k = 0; ok && k < F; k++) if (Math.abs(feats[A][k] - feats[Bi][k]) > 3.5) ok = false;
          if (!ok) continue;
          const pk = A < Bi ? A * 1e6 + Bi : Bi * 1e6 + A; if (seenPair.has(pk)) continue; seenPair.add(pk);
          let a1 = A, b1 = Bi; if (dx < 0 || (dx === 0 && dy < 0)) { dx = -dx; dy = -dy; a1 = Bi; b1 = A; }
          const key = `${Math.round(dx / 3)},${Math.round(dy / 3)}`;
          shifts.set(key, (shifts.get(key) || 0) + 1);
          if (!pairs.has(key)) pairs.set(key, []);
          pairs.get(key).push([a1, b1]);
        }
      }
    }
    // a real copy = one shift vector that clearly beats the background of chance matches, packed in one place
    const ranked = [...shifts.entries()].sort((p, q) => q[1] - p[1]);
    const bgArr = ranked.slice(3, 30).map((e) => e[1]);
    const bg = bgArr.length ? bgArr.reduce((t, v) => t + v, 0) / bgArr.length : 1;
    const need = Math.max(14 / Math.sqrt(sensitivity), (bg * 3 + 2) / sensitivity), R = Math.max(w, h) * .14, k = 1 / g.s, found = [];
    for (const [key] of ranked.slice(0, 8)) {
      const pr = pairs.get(key);
      const mx = median(pr.map(([a]) => xs[a])), my = median(pr.map(([a]) => ys[a]));
      const cl = pr.filter(([a]) => Math.abs(xs[a] - mx) < R && Math.abs(ys[a] - my) < R);
      if (cl.length < need) continue;
      let ax0 = 1e9, ay0 = 1e9, ax1 = 0, ay1 = 0, bx0 = 1e9, by0 = 1e9, bx1 = 0, by1 = 0;
      cl.forEach(([a, b2]) => {
        ax0 = Math.min(ax0, xs[a]); ay0 = Math.min(ay0, ys[a]); ax1 = Math.max(ax1, xs[a] + B); ay1 = Math.max(ay1, ys[a] + B);
        bx0 = Math.min(bx0, xs[b2]); by0 = Math.min(by0, ys[b2]); bx1 = Math.max(bx1, xs[b2] + B); by1 = Math.max(by1, ys[b2] + B);
      });
      const cells = ((ax1 - ax0) * (ay1 - ay0)) / (step * step);
      if (cl.length / Math.max(1, cells) < .004 || (ax1 - ax0) * (ay1 - ay0) > w * h * .3) continue;
      // periodic texture (fabric, bricks, tiles) matches itself at small shifts: source and copy overlap. A moved object lands elsewhere.
      const ix = Math.max(0, Math.min(ax1, bx1) - Math.max(ax0, bx0)), iy = Math.max(0, Math.min(ay1, by1) - Math.max(ay0, by0));
      if ((ix * iy) / Math.max(1, Math.min((ax1 - ax0) * (ay1 - ay0), (bx1 - bx0) * (by1 - by0))) > .15) continue;
      const [sdx, sdy] = key.split(",").map(Number);
      found.push({ count: cl.length, ratio: cl.length / Math.max(1, bg), aligned: Math.abs(sdx) <= 1 || Math.abs(sdy) <= 1, src: { x: ax0 * k, y: ay0 * k, w: (ax1 - ax0) * k, h: (ay1 - ay0) * k }, dst: { x: bx0 * k, y: by0 * k, w: (bx1 - bx0) * k, h: (by1 - by0) * k }, pairs: cl.slice(0, 400).map(([a, b2]) => [xs[a] * k, ys[a] * k, xs[b2] * k, ys[b2] * k]), block: B * k });
      if (found.length >= 3) break;
    }
    found.sort((p, q) => (p.aligned - q.aligned) || q.ratio - p.ratio);
    return { found, blocks: xs.length, bg };
  }
  function cloneCanvas(src, res) {
    const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
    const x = c.getContext("2d"); x.drawImage(src, 0, 0);
    x.fillStyle = "rgba(3,5,12,.55)"; x.fillRect(0, 0, c.width, c.height);
    const lw = Math.max(2, c.width / 400), cols = ["#3fe0c8", "#f2c25b", "#ff7a6b"];
    res.found.forEach((f, i) => {
      const col = cols[i % cols.length];
      x.globalAlpha = .9; x.strokeStyle = col; x.lineWidth = lw * .5;
      f.pairs.forEach(([ax, ay, bx, by], k) => { if (k % 6) return; x.beginPath(); x.moveTo(ax + f.block / 2, ay + f.block / 2); x.lineTo(bx + f.block / 2, by + f.block / 2); x.stroke(); });
      x.globalAlpha = .35; x.fillStyle = col; f.pairs.forEach(([ax, ay, bx, by]) => { x.fillRect(ax, ay, f.block, f.block); x.fillRect(bx, by, f.block, f.block); });
      x.globalAlpha = 1; x.lineWidth = lw * 1.6; x.setLineDash([lw * 5, lw * 3]);
      [f.src, f.dst].forEach((r) => x.strokeRect(r.x, r.y, r.w, r.h)); x.setLineDash([]);
    });
    return c;
  }

  /* ---------- 4) EXIF thumbnail vs. image ---------- */
  async function thumbCheck(file, src) {
    if (!window.exifr || !exifr.thumbnail) return null;
    let buf; try { buf = await exifr.thumbnail(file); } catch { return null; }
    if (!buf || !buf.byteLength) return null;
    let tb; try { tb = await createImageBitmap(new Blob([buf], { type: "image/jpeg" })); } catch { return null; }
    const ta = tb.width / tb.height, ia = src.width / src.height, rotated = Math.abs(ta - 1 / ia) < Math.abs(ta - ia);
    const aspectDiff = Math.abs((rotated ? 1 / ia : ia) - ta) / ta;
    const W = 96, H = Math.max(1, Math.round(W / ta));
    const draw = (img, rot) => {
      const c = document.createElement("canvas"); c.width = W; c.height = H; const x = c.getContext("2d", { willReadFrequently: true });
      if (rot) { x.translate(W / 2, H / 2); x.rotate(Math.PI / 2); x.drawImage(img, -H / 2, -W / 2, H, W); } else x.drawImage(img, 0, 0, W, H);
      return luma(x.getImageData(0, 0, W, H).data, W * H);
    };
    const a = draw(tb, false); let best = Infinity;
    for (const rot of rotated ? [true, false] : [false]) {
      const b = draw(src, rot); let s = 0; for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
      best = Math.min(best, s / a.length);
    }
    const url = URL.createObjectURL(new Blob([buf], { type: "image/jpeg" }));
    return { url, diff: best, aspectDiff, w: tb.width, h: tb.height };
  }

  /* ---------- 5) Metadata + JPEG quality ---------- */
  const EDITORS = /photoshop|lightroom|gimp|snapseed|picsart|canva|facetune|meitu|photoroom|pixlr|affinity|paint\.net|photopea|faceapp|remini|lensa|vsco|polarr|fotor|capcut|inshot|photo ?director|corel|krita|darktable|luminar/i;
  async function meta(file) {
    let m = null;
    try { if (window.exifr) m = await exifr.parse(file, { tiff: true, exif: true, xmp: true, icc: false, iptc: true, mergeOutput: true }); } catch { m = null; }
    const out = { raw: m || {} };
    if (m) {
      const sw = [m.Software, m.CreatorTool, m.HistorySoftwareAgent, m.ProcessingSoftware].flat().filter(Boolean).join(" · ");
      out.software = sw; out.editor = EDITORS.test(sw) ? (sw.match(EDITORS) || [""])[0] : "";
      out.make = [m.Make, m.Model].filter(Boolean).join(" ");
      const d = (v) => (v instanceof Date && !isNaN(v) ? v : null);
      out.taken = d(m.DateTimeOriginal) || d(m.CreateDate); out.modified = d(m.ModifyDate) || d(m.MetadataDate);
      out.dateGap = out.taken && out.modified ? Math.abs(out.modified - out.taken) / 36e5 : 0;
    }
    return out;
  }
  async function jpegInfo(file) {
    const u8 = new Uint8Array(await file.slice(0, Math.min(file.size, 600000)).arrayBuffer());
    const fmt = u8[0] === 0xFF && u8[1] === 0xD8 ? "JPEG" : u8[0] === 0x89 && u8[1] === 0x50 ? "PNG" : u8[8] === 0x57 && u8[9] === 0x45 ? "WebP" : (file.type.split("/")[1] || "؟").toUpperCase();
    if (fmt !== "JPEG") return { fmt };
    // luminance quantisation table → estimated quality (libjpeg scaling)
    const STD = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
    const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
    let quality = null, tables = 0;
    for (let i = 2; i < u8.length - 4;) {
      if (u8[i] !== 0xFF) { i++; continue; }
      const mk = u8[i + 1], len = (u8[i + 2] << 8) | u8[i + 3];
      if (mk === 0xDA) break;
      if (mk === 0xDB) {
        let p = i + 4; const end = i + 2 + len;
        while (p < end) {
          const pq = u8[p] >> 4, tq = u8[p] & 15; p++; tables++;
          const q = []; for (let k = 0; k < 64; k++) { q.push(pq ? (u8[p] << 8) | u8[p + 1] : u8[p]); p += pq ? 2 : 1; }
          if (tq === 0 && quality === null) {
            let s = 0; for (let k = 0; k < 64; k++) s += (q[k] * 100) / STD[ZZ.indexOf(k) >= 0 ? ZZ[k] : k];
            const scale = s / 64; quality = Math.round(scale <= 100 ? (200 - scale) / 2 : 5000 / scale);
            quality = clamp(quality, 1, 100);
          }
        }
      }
      i += 2 + len;
    }
    return { fmt, quality, tables };
  }

  /* ---------- Verdict ---------- */
  function verdict(r) {
    const tests = []; let score = 0;
    const add = (id, status, title, detail, pts) => { tests.push({ id, status, title, detail }); score += pts || 0; };
    // thumbnail
    if (r.thumb) {
      if (r.thumb.aspectDiff > .06) add("thumb", "bad", "الصورة قُصّت بعد التصوير", `أبعاد الصورة المصغّرة التي حفظتها الكاميرا لحظة التصوير تختلف عن أبعاد الصورة الحالية بنسبة ${Math.round(r.thumb.aspectDiff * 100)}%. أي أن الصورة قُصّت أو عُدّلت أبعادها لاحقاً.`, 30);
      else if (r.thumb.diff > 22) add("thumb", "bad", "محتوى الصورة تغيّر بعد التصوير", `الصورة المصغّرة الأصلية المخفية في الملف لا تطابق الصورة الحالية (فرق ${r.thumb.diff.toFixed(0)}). هذا من أقوى مؤشرات التعديل. قارن بينهما بالأسفل.`, 45);
      else if (r.thumb.diff > 12) add("thumb", "warn", "اختلاف بسيط عن الصورة المصغّرة الأصلية", `فرق ${r.thumb.diff.toFixed(0)} عن الصورة المصغّرة. قد يكون بسبب فلتر ألوان أو تعديل خفيف.`, 12);
      else add("thumb", "ok", "مطابقة للصورة المصغّرة الأصلية", "الصورة الحالية تطابق النسخة المصغّرة التي حفظتها الكاميرا لحظة التصوير.", -10);
    } else add("thumb", "na", "لا توجد صورة مصغّرة أصلية", "أغلب مواقع التواصل ولقطات الشاشة تحذفها، فغيابها لا يعني شيئاً.");
    // software & dates
    if (r.meta.editor) add("soft", "warn", `مرّت على برنامج تعديل: ${r.meta.editor}`, `مسجّل في بيانات الملف: «${r.meta.software}». هذا لا يعني التزوير بالضرورة، فقد يكون تعديلاً للإضاءة أو قصاً بسيطاً.`, 18);
    else if (r.meta.software) add("soft", "ok", "لا أثر لبرامج تعديل معروفة", `البرنامج المسجّل: ${r.meta.software}`);
    else add("soft", "na", "لا يوجد سجل للبرنامج", "البيانات المخفية محذوفة أو غير موجودة.");
    if (r.meta.dateGap > 1) add("date", "warn", "حُفظت بعد التصوير بوقت طويل", `الفرق بين تاريخ التصوير وتاريخ آخر تعديل ${r.meta.dateGap > 48 ? Math.round(r.meta.dateGap / 24) + " يوماً" : Math.round(r.meta.dateGap) + " ساعة"}.`, 8);
    // ELA
    const er = r.ela.regions;
    if (r.jpeg.fmt !== "JPEG") add("ela", "na", "تحليل مستوى الخطأ محدود", `الصيغة ${r.jpeg.fmt} ليست JPEG، فنتيجة هذا الاختبار أضعف. ${er.length ? "ظهرت مع ذلك مناطق مختلفة، ميّزناها على الصورة." : ""}`, er.length ? 8 : 0);
    else if (er.length && r.graphic && er.length <= 2 && er[0].strength > 6) add("ela", "warn", "جزء يختلف عن بقية التصميم", "في هذه الصورة الرسومية (لقطة شاشة أو تصميم) يلمع جزء محدد أكثر من بقية النصوص والأشكال المشابهة له. هكذا يبدو عادةً نص أو رقم عُدّل أو أضيف لاحقاً. افحصه بعينك.", 24);
    else if (er.length && r.graphic) add("ela", "na", "صورة تصميمية: مستوى الخطأ غير حاسم", "هذه صورة رسومية (تصميم أو شعار أو رسم توضيحي). النصوص والحواف الحادة تلمع فيها طبيعياً، فالمناطق المميّزة لا تعني تزويراً بالضرورة.", 6);
    else if (er.length === 1 && er[0].strength <= 7) add("ela", "warn", "منطقة صغيرة بمستوى خطأ مختلف", "منطقة واحدة تلمع أكثر من محيطها بقليل. قد تكون عنصراً أُضيف، أو مجرد نص أو شعار أو تفصيل حاد. افحصها بعينك.", 14);
    else if (er.length) { const s = clamp(er[0].strength, 4, 12); add("ela", s > 7 ? "bad" : "warn", `${er.length === 1 ? "منطقة واحدة" : er.length + " مناطق"} بمستوى خطأ غير طبيعي`, "بعد إعادة الضغط، تلمع هذه المناطق أكثر من بقية الصورة رغم أن تفاصيلها متشابهة. هذا نمط الأجزاء الملصوقة من مصدر آخر، أو المعدّلة بعد الحفظ.", (s > 7 ? 32 : 22) + Math.min(2, er.length - 1) * 5); }
    else add("ela", "ok", "مستوى الخطأ متجانس", "كل أجزاء الصورة تستجيب لإعادة الضغط بالطريقة نفسها تقريباً.");
    // noise
    const nr = r.noise.regions;
    if (r.noise.calmCount < 30) add("noise", "na", "الضوضاء: مساحات هادئة قليلة", "الصورة كثيرة التفاصيل، فلا يمكن مقارنة الضوضاء بثقة.");
    else if (nr.length) add("noise", "warn", `ضوضاء غير متجانسة في ${nr.length === 1 ? "منطقة" : nr.length + " مناطق"}`, "بصمة الحساس في هذه المناطق تختلف عن بقية الصورة: أنعم بكثير (تنعيم أو ختم استنساخ) أو أخشن (جزء ملصوق من صورة أخرى).", 7 + nr.length * 3);
    else add("noise", "ok", "الضوضاء متجانسة", "بصمة حساس الكاميرا متقاربة في كل المناطق الهادئة من الصورة.");
    // clones
    const cf = r.clone.found;
    if (cf.length && r.graphic) add("clone", "na", "تكرار داخل تصميم", "وجدنا أجزاء متطابقة، لكن الصورة تصميمية، والتصاميم تكرر الحروف والأشكال عادةً، فلا يُعدّ ذلك دليلاً.", 6);
    else if (cf.length && !cf[0].aligned) add("clone", cf[0].ratio > 4 ? "bad" : "warn", `أجزاء منسوخة داخل الصورة (${cf.length === 1 ? "نسخة واحدة" : cf.length + " نسخ"})`, "وجدنا مناطق متطابقة تقريباً في مكانين مختلفين بإزاحة ثابتة، وهذه بصمة أداة «ختم الاستنساخ» أو نسخ عنصر ولصقه. انتبه: العناصر المكررة طبيعياً (بلاط، أيقونات، نصوص) قد تظهر هنا أيضاً.", cf[0].ratio > 4 ? 38 : 26);
    else if (cf.length) add("clone", "na", "تكرار على خط أفقي أو عمودي", "وجدنا أجزاء متطابقة على السطر نفسه أو العمود نفسه. هذا شائع جداً في النصوص والزخارف والنقوش المتكررة، فلا يُعدّ دليلاً بمفرده. افحصه في عرض «المنسوخ».", 6);
    else add("clone", "ok", "لا أجزاء منسوخة", "لم نجد مناطق مكررة بشكل مريب داخل الصورة.");
    score = clamp(Math.round(score), 0, 100);
    const level = score >= 45 ? "high" : score >= 18 ? "mid" : "low";
    return { score, level, tests };
  }

  /* ---------- Orchestrator ---------- */
  async function analyze(file, onStep) {
    const step = async (k) => { onStep && onStep(k); await tick(); };
    await step("decode");
    const src = await createImageBitmap(file, { imageOrientation: "from-image" });
    const base = canvasFrom(src, 2400), n = base.w * base.h;
    const Y = luma(base.data, n);
    const [jpeg, metaInfo] = await Promise.all([jpegInfo(file), meta(file)]);
    await step("ela");
    // ELA speaks loudest when re-saving near the quality the image was once compressed at, which we can't know: sweep and keep the clearest pass
    const auto = jpeg.quality ? clamp(jpeg.quality - 5, 75, 92) / 100 : .9;
    let q = auto, elaDiff = null, elaR = null, best = -1;
    for (const qq of [...new Set([auto, .7, .75, .8])]) {
      const d = await ela(base, qq), rr = elaRegions(d, Y, base.w, base.h);
      const sc = rr.regions.length ? rr.regions[0].n * rr.regions[0].strength : 0;
      if (sc > best || !elaDiff) { if (sc > best) best = sc; if (sc > 0 || !elaDiff) { q = qq; elaDiff = d; elaR = rr; } }
      await tick();
    }
    await step("noise");
    const nz = noise(Y, base.w, base.h);
    await step("clone");
    const cl = await clones(src, 1);
    await step("meta");
    const thumb = await thumbCheck(file, src);
    // designs, logos, diagrams: big perfectly flat areas. Sharp text/edges light up in ELA and repeated letters look like clones there.
    const tx = elaR.grid.tex; let flat = 0; for (let i = 0; i < tx.length; i++) if (tx[i] < 1.2) flat++;
    const graphic = flat / tx.length > .3;
    const r = { file, src, base, jpeg, meta: metaInfo, elaDiff, elaQuality: q, ela: elaR, noise: nz, clone: cl, thumb, graphic };
    r.verdict = verdict(r);
    await step("done");
    return r;
  }

  window.Tamper = { analyze, ela, elaRegions, luma, heatCanvas, blockHeat, clones, cloneCanvas, verdict };
})();
