/* ==========================================================
   محرك كشف التعديل — يعمل كله داخل المتصفح (Web Worker)، ولا يرفع الصورة لأي خادم
   1) بنية ملف JPEG: جداول التكميم، الجودة التقديرية، العيّنات اللونية، بصمات البرامج
   2) شبكة JPEG 8×8: تصويت كل خلية على طور الشبكة — الجزء الملصوق يحمل شبكة مزاحة
   3) النسخ-لصق: PatchMatch ثم تماسك الإزاحة ثم تحقق بالارتباط
   4) ELA: إعادة الضغط وقياس الفرق (خريطة للعين + مناطق شاذة)
   5) خريطة الضجيج (للعين)
   العتبات معايَرة على مجموعة اختبار: 187 صورة سليمة و194 معدّلة (انظر TEST في آخر الملف).
   ========================================================== */
(function (root) {
  "use strict";
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const median = (arr) => { if (!arr.length) return 0; const s = Float32Array.from(arr).sort(); return s[s.length >> 1]; };

  function luma(d, n) {
    const Y = new Float32Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) Y[i] = .299 * d[j] + .587 * d[j + 1] + .114 * d[j + 2];
    return Y;
  }

  /* ---------- 1) File structure ---------- */
  const STD_L = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
  const STD_C = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99];
  const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28, 35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
  const ijg = (std, q) => { const s = q < 50 ? 5000 / q : 200 - 2 * q; return std.map((v) => clamp(Math.floor((v * s + 50) / 100), 1, 255)); };
  function matchQuality(tbl, std) {
    let best = { q: 0, diff: 1e9 };
    for (let q = 1; q <= 100; q++) { const t = ijg(std, q); let d = 0; for (let k = 0; k < 64; k++) d += Math.abs(t[k] - tbl[k]); if (d < best.diff) best = { q, diff: d }; }
    return { q: best.q, exact: best.diff === 0, diff: best.diff / 64 };
  }
  const ascii = (u8, a, b) => { let s = ""; for (let i = a; i < b && u8[i]; i++) s += u8[i] >= 32 && u8[i] < 127 ? String.fromCharCode(u8[i]) : ""; return s; };
  function sniff(u8) {
    if (u8[0] === 0xFF && u8[1] === 0xD8) return "JPEG";
    if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E) return "PNG";
    if (u8[0] === 0x52 && u8[1] === 0x49 && u8[8] === 0x57 && u8[9] === 0x45) return "WebP";
    if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) return "GIF";
    if (u8[0] === 0x42 && u8[1] === 0x4D) return "BMP";
    const b = ascii(u8, 4, 12); if (/ftyp(avif|avis)/.test(b)) return "AVIF"; if (/ftyp(heic|heix|mif1|msf1|hevc)/.test(b)) return "HEIC";
    return "";
  }
  function fileStruct(u8) {
    const out = { fmt: sniff(u8), size: u8.length };
    if (out.fmt !== "JPEG") return out;
    const tables = {}, app = []; let sof = null, scans = 0, i = 2, guard = 0;
    while (i + 4 <= u8.length && guard++ < 1e7) {
      if (u8[i] !== 0xFF) { i++; continue; }
      const mk = u8[i + 1];
      if (mk === 0xFF) { i++; continue; }
      if (mk === 0xD8 || (mk >= 0xD0 && mk <= 0xD7) || mk === 0x01 || mk === 0x00) { i += 2; continue; }
      if (mk === 0xD9) break;
      const len = (u8[i + 2] << 8) | u8[i + 3], p = i + 4, end = i + 2 + len;
      if (len < 2) break;
      if (mk === 0xDB) {
        let q = p;
        while (q < end) {
          const pq = u8[q] >> 4, tq = u8[q] & 15; q++; const t = new Array(64);
          for (let k = 0; k < 64; k++) { t[ZZ[k]] = pq ? (u8[q] << 8) | u8[q + 1] : u8[q]; q += pq ? 2 : 1; }
          tables[tq] = t;
        }
      } else if (mk >= 0xC0 && mk <= 0xCF && mk !== 0xC4 && mk !== 0xC8 && mk !== 0xCC) {
        sof = { progressive: mk === 0xC2 || mk === 0xCA, bits: u8[p], h: (u8[p + 1] << 8) | u8[p + 2], w: (u8[p + 3] << 8) | u8[p + 4], comps: [] };
        for (let k = 0, n = u8[p + 5]; k < n; k++) sof.comps.push({ h: u8[p + 7 + k * 3] >> 4, v: u8[p + 7 + k * 3] & 15, tq: u8[p + 8 + k * 3] });
      } else if (mk >= 0xE0 && mk <= 0xEF) app.push({ n: mk - 0xE0, id: ascii(u8, p, Math.min(end, p + 30)), len });
      else if (mk === 0xDA) {
        scans++; i = end;
        while (i + 1 < u8.length && !(u8[i] === 0xFF && u8[i + 1] !== 0 && u8[i + 1] !== 0xFF && !(u8[i + 1] >= 0xD0 && u8[i + 1] <= 0xD7))) i++;
        continue;
      }
      i = end;
    }
    out.tables = tables; out.sof = sof; out.scans = scans; out.app = app;
    const has = (n, re) => app.some((a) => a.n === n && re.test(a.id));
    out.markers = { jfif: has(0, /^JFIF/), exif: has(1, /^Exif/), xmp: has(1, /ns\.adobe\.com\/xap/), icc: has(2, /^ICC_PROFILE/), mpf: has(2, /^MPF/), photoshop: has(13, /^Photoshop/), adobe: has(14, /^Adobe/) };
    if (sof && sof.comps.length) {
      const y = sof.comps[0], c = sof.comps[1];
      out.subsampling = !c ? "رمادي" : y.h === 2 && y.v === 2 ? "4:2:0" : y.h === 2 && y.v === 1 ? "4:2:2" : y.h === 1 && y.v === 1 ? "4:4:4" : `${y.h}x${y.v}`;
      const tl = tables[y.tq], tc = c && tables[c.tq];
      if (tl) out.qLuma = matchQuality(tl, STD_L);
      if (tc) out.qChroma = matchQuality(tc, STD_C);
      out.standardTables = !!(out.qLuma && out.qLuma.exact && (!out.qChroma || out.qChroma.exact));
    }
    return out;
  }

  /* ---------- 2) JPEG grid vote ----------
     JPEG quantises the DCT of every aligned 8×8 block, so blocks cut on the true grid have many near-zero
     coefficients. Every 8×8 cell votes for the grid phase (out of 64) with most near-zeros, the file's own
     grid excluded. Noise votes are random; a pasted part that was a JPEG before votes as one for its old grid. */
  const C1 = Math.cos(Math.PI / 16), C2 = Math.cos(2 * Math.PI / 16), C3 = Math.cos(3 * Math.PI / 16), C5 = Math.cos(5 * Math.PI / 16), C6 = Math.cos(6 * Math.PI / 16), C7 = Math.cos(7 * Math.PI / 16), R8 = Math.sqrt(1 / 8), R4 = .5 * Math.SQRT1_2;
  const GRID_T = 2, GRID_ACT = 8, GRID_MIN_ACT = 3, GRID_MIN_CELLS = 28;
  function gridVote(Y, w, h, onProgress) {
    const W1 = w - 7, H1 = h - 7, cw = W1 >> 3, ch = H1 >> 3;
    if (cw < 8 || ch < 8) return null;
    const nc = cw * ch, b1 = new Uint8Array(nc), b2 = new Uint8Array(nc), b3 = new Uint8Array(nc), p1 = new Uint8Array(nc), p2 = new Uint8Array(nc), a1 = new Uint8Array(nc), a2 = new Uint8Array(nc);
    const glob = new Float64Array(64), ring = []; for (let r = 0; r < 8; r++) ring.push(new Float32Array(W1 * 8));
    const xMax = cw * 8, yMax = ch * 8, col = new Float32Array(8);
    for (let y = 0; y < yMax + 7; y++) {
      // row transform of every 8-wide window on this row
      const R = ring[y & 7], row = y * w;
      for (let x = 0; x < xMax; x++) {
        const i = row + x, v0 = Y[i], v1 = Y[i + 1], v2 = Y[i + 2], v3 = Y[i + 3], v4 = Y[i + 4], v5 = Y[i + 5], v6 = Y[i + 6], v7 = Y[i + 7];
        const s07 = v0 + v7, d07 = v0 - v7, s16 = v1 + v6, d16 = v1 - v6, s25 = v2 + v5, d25 = v2 - v5, s34 = v3 + v4, d34 = v3 - v4;
        const e0 = s07 + s34, e3 = s07 - s34, e1 = s16 + s25, e2 = s16 - s25, o = x * 8;
        R[o] = (e0 + e1) * R8; R[o + 4] = (e0 - e1) * R4; R[o + 2] = .5 * (C2 * e3 + C6 * e2); R[o + 6] = .5 * (C6 * e3 - C2 * e2);
        R[o + 1] = .5 * (C1 * d07 + C3 * d16 + C5 * d25 + C7 * d34); R[o + 3] = .5 * (C3 * d07 - C7 * d16 - C1 * d25 - C5 * d34);
        R[o + 5] = .5 * (C5 * d07 - C1 * d16 + C7 * d25 + C3 * d34); R[o + 7] = .5 * (C7 * d07 - C5 * d16 + C3 * d25 - C1 * d34);
      }
      if (y < 7) continue;
      const y0 = y - 7, cy = y0 >> 3, pi = (y0 & 7) * 8;
      const r0 = ring[y0 & 7], r1 = ring[(y0 + 1) & 7], r2 = ring[(y0 + 2) & 7], r3 = ring[(y0 + 3) & 7], r4 = ring[(y0 + 4) & 7], r5 = ring[(y0 + 5) & 7], r6 = ring[(y0 + 6) & 7], r7 = ring[(y0 + 7) & 7];
      for (let x = 0; x < xMax; x++) {
        let z = 0, act = 0;
        for (let u = 0; u < 8; u++) {
          const o = x * 8 + u, v0 = r0[o], v1 = r1[o], v2 = r2[o], v3 = r3[o], v4 = r4[o], v5 = r5[o], v6 = r6[o], v7 = r7[o];
          const s07 = v0 + v7, d07 = v0 - v7, s16 = v1 + v6, d16 = v1 - v6, s25 = v2 + v5, d25 = v2 - v5, s34 = v3 + v4, d34 = v3 - v4;
          const e0 = s07 + s34, e3 = s07 - s34, e1 = s16 + s25, e2 = s16 - s25;
          col[0] = (e0 + e1) * R8; col[4] = (e0 - e1) * R4; col[2] = .5 * (C2 * e3 + C6 * e2); col[6] = .5 * (C6 * e3 - C2 * e2);
          col[1] = .5 * (C1 * d07 + C3 * d16 + C5 * d25 + C7 * d34); col[3] = .5 * (C3 * d07 - C7 * d16 - C1 * d25 - C5 * d34);
          col[5] = .5 * (C5 * d07 - C1 * d16 + C7 * d25 + C3 * d34); col[7] = .5 * (C7 * d07 - C5 * d16 + C3 * d25 - C1 * d34);
          for (let v = u ? 0 : 1; v < 8; v++) { const c = col[v] < 0 ? -col[v] : col[v]; if (c < GRID_T) z++; else if (c > GRID_ACT) act++; }
        }
        const ph = pi + (x & 7), c = cy * cw + (x >> 3); glob[ph] += z;
        if (act > 255) act = 255;
        if (z > b1[c]) { b3[c] = b2[c]; b2[c] = b1[c]; p2[c] = p1[c]; a2[c] = a1[c]; b1[c] = z; p1[c] = ph; a1[c] = act; }
        else if (z > b2[c]) { b3[c] = b2[c]; b2[c] = z; p2[c] = ph; a2[c] = act; }
        else if (z > b3[c]) b3[c] = z;
      }
      if (onProgress && (y & 127) === 0) onProgress(y / yMax);
    }
    // the file's own grid: a phase that clearly dominates the 64
    const g = Array.from(glob, (v) => v / nc), sorted = g.slice().sort((a, b) => a - b), med = sorted[32];
    const mad = median(g.map((v) => Math.abs(v - med))) * 1.4826 + 1e-3;
    let top = 0; for (let k = 1; k < 64; k++) if (g[k] > g[top]) top = k;
    const mainZ = (g[top] - med) / mad;
    // ...or the phase most cells vote for when nothing is excluded (robust on flat, low-detail pictures)
    const pre = new Uint32Array(64); let preN = 0, pt = 0;
    for (let c = 0; c < nc; c++) if (b1[c] - b2[c] >= 1 && a1[c] >= GRID_MIN_ACT) { pre[p1[c]]++; preN++; }
    for (let k = 1; k < 64; k++) if (pre[k] > pre[pt]) pt = k;
    const mainShare = preN ? pre[pt] / preN : 0, main = mainShare >= .2 && preN > 40 ? pt : mainZ > 8 ? top : -1;
    // votes, own grid and its harmonics excluded
    const votes = new Int8Array(nc).fill(-1), count = new Uint32Array(64); let valid = 0;
    const harmonic = (p) => { if (main < 0) return false; const di = ((p >> 3) - (main >> 3)) & 7, dj = ((p & 7) - (main & 7)) & 7; return (di === 0 && (dj === 1 || dj === 7 || dj === 4)) || (dj === 0 && (di === 1 || di === 7 || di === 4)) || (di === 4 && dj === 4); };
    for (let c = 0; c < nc; c++) {
      let p, b, nx, a;
      if (p1[c] !== main) { p = p1[c]; b = b1[c]; a = a1[c]; nx = p2[c] === main ? b3[c] : b2[c]; } else { p = p2[c]; b = b2[c]; a = a2[c]; nx = b3[c]; }
      if (b - nx < 1 || a < GRID_MIN_ACT) continue;
      valid++; if (harmonic(p)) continue;
      votes[c] = p; count[p]++;
    }
    // connected same-phase cells
    const seen = new Uint8Array(nc), comps = [], stack = [];
    for (let s = 0; s < nc; s++) {
      if (votes[s] < 0 || seen[s]) continue;
      const p = votes[s]; let n = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1; stack.push(s); seen[s] = 1; const cells = [];
      while (stack.length) {
        const k = stack.pop(), cx = k % cw, cy = (k / cw) | 0; n++; cells.push(k);
        if (cx < x0) x0 = cx; if (cx > x1) x1 = cx; if (cy < y0) y0 = cy; if (cy > y1) y1 = cy;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= cw || ny >= ch) continue;
          const q = ny * cw + nx; if (votes[q] === p && !seen[q]) { seen[q] = 1; stack.push(q); }
        }
      }
      if (n >= 8) comps.push({ phase: p, cells: n, x: x0 * 8, y: y0 * 8, w: (x1 - x0 + 1) * 8, h: (y1 - y0 + 1) * 8, list: cells });
    }
    comps.sort((a, b) => b.cells - a.cells);
    // one foreign phase spread over the whole frame = the picture was cropped / re-saved after an earlier JPEG, not a local edit
    let gp = 0; for (let k = 1; k < 64; k++) if (count[k] > count[gp]) gp = k;
    const share = valid ? count[gp] / valid : 0;
    let global = null;
    if (share > .1 && count[gp] > 60) {
      const big = comps.find((c) => c.phase === gp);   // spread out in many small clusters, not packed in one place
      if (!big || big.cells / count[gp] < .5) global = { phase: gp, share, dx: main >= 0 ? ((gp & 7) - (main & 7)) & 7 : gp & 7, dy: main >= 0 ? ((gp >> 3) - (main >> 3)) & 7 : gp >> 3 };
    }
    const regions = comps.filter((c) => c.cells >= GRID_MIN_CELLS && !(global && c.phase === global.phase) && c.w * c.h < w * h * .6)
      .slice(0, 5).map((c) => ({ phase: c.phase, cells: c.cells, x: c.x, y: c.y, w: c.w, h: c.h, dx: c.phase & 7, dy: c.phase >> 3 }));
    // display map: 0 nothing, 1 scattered vote, 2 sizeable cluster, 3 flagged region, 4 global earlier grid
    const map = new Uint8Array(nc); for (let c = 0; c < nc; c++) if (votes[c] >= 0) map[c] = 1;
    for (const c of comps) { const v = global && c.phase === global.phase ? 4 : c.cells >= GRID_MIN_CELLS && regions.some((r) => r.phase === c.phase && r.x === c.x && r.y === c.y) ? 3 : c.cells >= 12 ? 2 : 1; for (const k of c.list) map[k] = v; }
    if (global) for (let c = 0; c < nc; c++) if (votes[c] === global.phase) map[c] = 4;
    return { cw, ch, main, mainZ, mainShare, regions, global, map, votes, valid, largest: comps.length ? comps[0].cells : 0 };
  }

  /* ---------- 3) Copy-move: PatchMatch + offset coherence + correlation check ---------- */
  function resize(Y, w, h, nw, nh) {
    if (nw === w && nh === h) return Y;
    const out = new Float32Array(nw * nh), fx = w / nw, fy = h / nh;
    for (let y = 0; y < nh; y++) {
      const ya = Math.floor(y * fy), yb = Math.max(ya + 1, Math.min(h, Math.floor((y + 1) * fy)));
      for (let x = 0; x < nw; x++) {
        const xa = Math.floor(x * fx), xb = Math.max(xa + 1, Math.min(w, Math.floor((x + 1) * fx)));
        let s = 0; for (let yy = ya; yy < yb; yy++) for (let xx = xa; xx < xb; xx++) s += Y[yy * w + xx];
        out[y * nw + x] = s / ((yb - ya) * (xb - xa));
      }
    }
    return out;
  }
  function copyMove(Y, w, h, onProgress) {
    // whole-number shrink only: a fractional one would turn the copy's shift into a sub-pixel shift and blur the match
    const K = Math.max(1, Math.ceil(Math.max(w, h) / 1100)), S = 1 / K, gw = Math.floor(w / K), gh = Math.floor(h / K);
    if (gw < 96 || gh < 96) return { found: [], gw, gh, k: K, mask: null, shifts: 0 };
    const G = resize(Y, w, h, gw, gh), P = 8, W = gw - P + 1, H = gh - P + 1, N = W * H;
    // patch variance from integral images
    const I1 = new Float64Array((gw + 1) * (gh + 1)), I2 = new Float64Array((gw + 1) * (gh + 1)), st = gw + 1;
    for (let y = 0; y < gh; y++) { let r1 = 0, r2 = 0; for (let x = 0; x < gw; x++) { const v = G[y * gw + x]; r1 += v; r2 += v * v; I1[(y + 1) * st + x + 1] = I1[y * st + x + 1] + r1; I2[(y + 1) * st + x + 1] = I2[y * st + x + 1] + r2; } }
    const vr = new Float32Array(N), tex = new Uint8Array(N);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const a = y * st + x, b = a + P, c = a + P * st, d = c + P, s1 = I1[d] - I1[b] - I1[c] + I1[a], s2 = I2[d] - I2[b] - I2[c] + I2[a], v = s2 / 64 - (s1 / 64) * (s1 / 64);
      vr[y * W + x] = v; if (v >= 25) tex[y * W + x] = 1;   // flat areas match everywhere: no evidence there
    }
    const ox = new Int16Array(N), oy = new Int16Array(N), cost = new Float32Array(N).fill(Infinity);
    const minD = Math.max(24, Math.round(Math.max(gw, gh) * .05)), minD2 = minD * minD;
    let seed = 0x9E3779B9; const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) / 4294967296; };
    const ssd = (x, y, x2, y2, bound) => {
      let s = 0, ia = y * gw + x, ib = y2 * gw + x2;
      for (let r = 0; r < 8; r++, ia += gw, ib += gw) {
        let d = G[ia] - G[ib]; s += d * d; d = G[ia + 1] - G[ib + 1]; s += d * d; d = G[ia + 2] - G[ib + 2]; s += d * d; d = G[ia + 3] - G[ib + 3]; s += d * d;
        d = G[ia + 4] - G[ib + 4]; s += d * d; d = G[ia + 5] - G[ib + 5]; s += d * d; d = G[ia + 6] - G[ib + 6]; s += d * d; d = G[ia + 7] - G[ib + 7]; s += d * d;
        if (s >= bound) return s;
      }
      return s;
    };
    const tryOff = (p, x, y, dx, dy) => {
      const x2 = x + dx, y2 = y + dy; if (x2 < 0 || y2 < 0 || x2 >= W || y2 >= H || dx * dx + dy * dy < minD2) return;
      const s = ssd(x, y, x2, y2, cost[p]); if (s < cost[p]) { cost[p] = s; ox[p] = dx; oy[p] = dy; }
    };
    for (let p = 0; p < N; p++) { if (!tex[p]) continue; const x = p % W, y = (p / W) | 0; for (let k = 0; k < 4 && cost[p] === Infinity; k++) tryOff(p, x, y, ((rnd() * W) | 0) - x, ((rnd() * H) | 0) - y); }
    const ITER = 5, R0 = Math.max(W, H);
    for (let it = 0; it < ITER; it++) {
      const fwd = !(it & 1), d = fwd ? -1 : 1;
      for (let yy = 0; yy < H; yy++) {
        const y = fwd ? yy : H - 1 - yy;
        for (let xx = 0; xx < W; xx++) {
          const x = fwd ? xx : W - 1 - xx, p = y * W + x; if (!tex[p]) continue;
          const xn = x + d; if (xn >= 0 && xn < W && cost[p + d] < Infinity) tryOff(p, x, y, ox[p + d], oy[p + d]);
          const yn = y + d; if (yn >= 0 && yn < H && cost[p + d * W] < Infinity) tryOff(p, x, y, ox[p + d * W], oy[p + d * W]);
          if (cost[p] < 1.5 * vr[p]) continue;   // already a near-perfect match: nothing to gain from searching on
          for (let r = R0; r >= 1; r = (r / 3) | 0) tryOff(p, x, y, ox[p] + Math.round((rnd() * 2 - 1) * r), oy[p] + Math.round((rnd() * 2 - 1) * r));
        }
      }
      if (onProgress) onProgress((it + 1) / ITER);
    }
    // keep pixels whose match is good and whose neighbours agree on the same shift
    const ok = new Uint8Array(N), near = (a, b) => cost[b] < Infinity && Math.abs(ox[a] - ox[b]) <= 1 && Math.abs(oy[a] - oy[b]) <= 1;
    for (let y = 4; y < H - 4; y++) for (let x = 4; x < W - 4; x++) {
      const p = y * W + x; if (!tex[p] || cost[p] > .6 * 64 * vr[p]) continue;
      if (near(p, p - 4) + near(p, p + 4) + near(p, p - 4 * W) + near(p, p + 4 * W) >= 3) ok[p] = 1;
    }
    // vote on shifts (a shift and its opposite are the same pair)
    const hist = new Map(), key = (dx, dy) => (dy + 2048) * 4096 + dx + 2048;
    for (let p = 0; p < N; p++) { if (!ok[p]) continue; let dx = ox[p], dy = oy[p]; if (dy < 0 || (dy === 0 && dx < 0)) { dx = -dx; dy = -dy; } const k = key(dx, dy); hist.set(k, (hist.get(k) || 0) + 1); }
    const minCount = Math.max(350, Math.round(N * .0013));
    const tops = [...hist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12), used = [], found = [], mask = new Uint8Array(gw * gh);
    for (const [k] of tops) {
      const dx = (k % 4096) - 2048, dy = ((k / 4096) | 0) - 2048;
      if (used.some((u) => Math.abs(u[0] - dx) <= 2 && Math.abs(u[1] - dy) <= 2)) continue; used.push([dx, dy]);
      // first end of every agreeing pair
      const m = new Uint8Array(N); let n = 0;
      for (let p = 0; p < N; p++) {
        if (!ok[p]) continue; let ax = ox[p], ay = oy[p], q = p;
        if (ay < 0 || (ay === 0 && ax < 0)) { q = p + ay * W + ax; ax = -ax; ay = -ay; }
        if (Math.abs(ax - dx) <= 1 && Math.abs(ay - dy) <= 1 && !m[q]) { m[q] = 1; n++; }
      }
      if (n < minCount) continue;
      // largest connected blob
      const seen = new Uint8Array(N); let best = null; const stack = [];
      for (let s = 0; s < N; s++) {
        if (!m[s] || seen[s]) continue; const list = []; stack.push(s); seen[s] = 1; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
        while (stack.length) {
          const q = stack.pop(), x = q % W, y = (q / W) | 0; list.push(q);
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
          for (let j = -2; j <= 2; j++) for (let i = -2; i <= 2; i++) { const nx = x + i, ny = y + j; if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue; const t = ny * W + nx; if (m[t] && !seen[t]) { seen[t] = 1; stack.push(t); } }
        }
        if (!best || list.length > best.list.length) best = { list, x0, y0, x1, y1 };
      }
      if (!best || best.list.length < minCount) continue;
      const bw = best.x1 - best.x0 + P, bh = best.y1 - best.y0 + P; if (bw < 20 || bh < 20) continue;
      // a repeating texture matches itself next door: source and copy overlap. A moved object lands elsewhere.
      const ix = Math.max(0, bw - Math.abs(dx)), iy = Math.max(0, bh - Math.abs(dy)); if ((ix * iy) / (bw * bh) > .15) continue;
      // normalised correlation between the two ends
      let sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0; const L = best.list;
      for (let t = 0; t < L.length; t++) { const q = L[t], x = q % W, y = (q / W) | 0, a = G[(y + 4) * gw + x + 4], b = G[(y + 4 + dy) * gw + x + 4 + dx]; sa += a; sb += b; saa += a * a; sbb += b * b; sab += a * b; }
      const nn = L.length, va = saa / nn - (sa / nn) ** 2, vb = sbb / nn - (sb / nn) ** 2, corr = (sab / nn - (sa / nn) * (sb / nn)) / Math.sqrt(Math.max(1e-6, va * vb));
      if (corr < .85 || va < 60) continue;
      const id = found.length + 1;
      for (let t = 0; t < L.length; t++) { const q = L[t], x = q % W, y = (q / W) | 0; for (let j = 2; j < 6; j++) for (let i = 2; i < 6; i++) { mask[(y + j) * gw + x + i] = id; mask[(y + j + dy) * gw + x + i + dx] = id + 8; } }
      found.push({ a: { x: best.x0 / S, y: best.y0 / S, w: bw / S, h: bh / S }, b: { x: (best.x0 + dx) / S, y: (best.y0 + dy) / S, w: bw / S, h: bh / S }, dx: dx / S, dy: dy / S, pixels: nn, share: nn / N, corr });
      if (found.length >= 4) break;
    }
    return { found, gw, gh, k: K, mask, shifts: tops.filter((t) => t[1] >= minCount).length };
  }

  /* ---------- 4) ELA helpers ---------- */
  function textureBlocks(Y, w, h, B) {
    const bw = Math.floor(w / B), bh = Math.floor(h / B), tex = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      let s = 0;
      for (let y = by * B; y < by * B + B; y++) for (let x = bx * B; x < bx * B + B - 1; x++) { const i = y * w + x; s += Math.abs(Y[i + 1] - Y[i]) + (y + 1 < h ? Math.abs(Y[i + w] - Y[i]) : 0); }
      tex[by * bw + bx] = s / (B * B);
    }
    return { tex, bw, bh };
  }
  function blobs(flag, bw, bh, B, minBlocks, score) {
    const seen = new Uint8Array(bw * bh), out = [];
    for (let i = 0; i < flag.length; i++) {
      if (!flag[i] || seen[i]) continue;
      const stack = [i]; seen[i] = 1; let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1, n = 0, s = 0;
      while (stack.length) {
        const k = stack.pop(), bx = k % bw, by = (k / bw) | 0; n++; s += score[k];
        if (bx < x0) x0 = bx; if (bx > x1) x1 = bx; if (by < y0) y0 = by; if (by > y1) y1 = by;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const nx = bx + dx, ny = by + dy; if (nx < 0 || ny < 0 || nx >= bw || ny >= bh) continue; const q = ny * bw + nx; if (flag[q] && !seen[q]) { seen[q] = 1; stack.push(q); } }
      }
      if (n >= minBlocks) out.push({ x: x0 * B, y: y0 * B, w: (x1 - x0 + 1) * B, h: (y1 - y0 + 1) * B, n, strength: s / n });
    }
    return out.sort((a, b) => b.n * b.strength - a.n * a.strength).slice(0, 5);
  }
  // blocks whose error level is far above what their texture predicts, compared with the rest of the same picture
  function elaRegions(diff, tb, w, h, B) {
    const { tex, bw, bh } = tb, e = new Float32Array(bw * bh);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) { let s = 0; for (let y = by * B; y < by * B + B; y++) for (let x = bx * B; x < bx * B + B; x++) s += diff[y * w + x]; e[by * bw + bx] = s / (B * B); }
    const valid = []; for (let i = 0; i < e.length; i++) if (tex[i] > .5) valid.push(e[i] / (tex[i] + 2));
    const ratio = median(valid) || .1, resid = Float32Array.from(e, (v, i) => v - ratio * (tex[i] + 2));
    const m = median(resid), sd = Math.max(.35, 1.4826 * median(resid.map((v) => Math.abs(v - m))));
    const z = Float32Array.from(resid, (r) => (r - m) / sd), eMed = median(e) || .5;
    const flag = Uint8Array.from(z, (v, i) => (v > 4 && e[i] > eMed * 2.2 && e[i] > 1.5 ? 1 : 0));
    return { regions: blobs(flag, bw, bh, B, Math.max(3, Math.round(bw * bh * .0025)), z), level: eMed };
  }

  /* ---------- 5) Noise map (for the eye) ---------- */
  function noiseMap(Y, w, h) {
    const B = Math.max(8, Math.round(Math.max(w, h) / 160)), bw = Math.floor(w / B), bh = Math.floor(h / B), out = new Float32Array(bw * bh), hist = new Uint16Array(64);
    for (let by = 0; by < bh; by++) for (let bx = 0; bx < bw; bx++) {
      hist.fill(0); let n = 0;
      for (let y = Math.max(1, by * B); y < Math.min(h - 1, by * B + B); y++) for (let x = Math.max(1, bx * B); x < Math.min(w - 1, bx * B + B); x++) {
        const i = y * w + x, r = Math.abs(4 * Y[i] - Y[i - 1] - Y[i + 1] - Y[i - w] - Y[i + w]); hist[r > 31.5 ? 63 : (r * 2) | 0]++; n++;
      }
      let acc = 0, k = 0; while (k < 63 && (acc += hist[k]) < n / 2) k++;
      out[by * bw + bx] = (k + .5) / 2 / 4 * 1.4826;
    }
    return { map: out, bw, bh, B };
  }

  /* ---------- Session (worker or main thread) ---------- */
  const mkCanvas = (w, h) => { if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(w, h); const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
  const toBlob = (c, q) => (c.convertToBlob ? c.convertToBlob({ type: "image/jpeg", quality: q }) : new Promise((r) => c.toBlob(r, "image/jpeg", q)));
  let S = null;
  async function elaPass(q) {
    const { w, h, rgba, canvas } = S, bmp = await createImageBitmap(await toBlob(canvas, q)), t = mkCanvas(w, h), tx = t.getContext("2d", { willReadFrequently: true });
    tx.drawImage(bmp, 0, 0); bmp.close && bmp.close();
    const b = tx.getImageData(0, 0, w, h).data, f = S.f, vw = S.vw, vh = S.vh, view = new Uint8Array(vw * vh), dy = new Float32Array(w * h);
    for (let y = 0, i = 0, j = 0; y < h; y++) {
      const vy = Math.min(vh - 1, (y / f) | 0) * vw;
      for (let x = 0; x < w; x++, i++, j += 4) {
        const r = rgba[j] - b[j], g = rgba[j + 1] - b[j + 1], bl = rgba[j + 2] - b[j + 2], ar = r < 0 ? -r : r, ag = g < 0 ? -g : g, ab = bl < 0 ? -bl : bl;
        const m = ar > ag ? (ar > ab ? ar : ab) : ag > ab ? ag : ab, l = .299 * r + .587 * g + .114 * bl;
        dy[i] = l < 0 ? -l : l;                                     // detection on luma: immune to chroma subsampling on saturated colours
        const v = m > 63 ? 255 : m * 4, k = vy + Math.min(vw - 1, (x / f) | 0); if (v > view[k]) view[k] = v;   // shown: classic max-channel look
      }
    }
    return { view, dy };
  }
  async function analyze(msg, post) {
    const step = (k, p) => post({ type: "progress", step: k, p: p || 0 });
    step("decode");
    const u8 = new Uint8Array(msg.bytes), struct = fileStruct(u8);
    let w, h, canvas, ctx;
    if (msg.bitmap) { w = msg.bitmap.width; h = msg.bitmap.height; canvas = mkCanvas(w, h); ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(msg.bitmap, 0, 0); msg.bitmap.close && msg.bitmap.close(); }
    else { w = msg.w; h = msg.h; canvas = mkCanvas(w, h); ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.putImageData(new ImageData(new Uint8ClampedArray(msg.rgba), w, h), 0, 0); }
    const rgba = ctx.getImageData(0, 0, w, h).data, Y = luma(rgba, w * h), f = Math.max(1, Math.ceil(Math.max(w, h) / (msg.viewMax || 1600)));
    S = { w, h, rgba, canvas, Y, f, vw: Math.ceil(w / f), vh: Math.ceil(h / f), struct };
    // flat share: designs, screenshots, diagrams
    const B = Math.max(12, Math.round(Math.max(w, h) / 90)); S.B = B; S.tb = textureBlocks(Y, w, h, B);
    let flat = 0; for (let i = 0; i < S.tb.tex.length; i++) if (S.tb.tex[i] < 1.2) flat++;
    const graphic = flat / S.tb.tex.length > .3;
    step("ela");
    // ELA speaks loudest near the quality the picture was once saved at, which we cannot know: sweep and keep the clearest pass
    const estQ = struct.qLuma ? struct.qLuma.q : 0, auto = estQ ? clamp(estQ - 5, 75, 92) : 90;
    let ela = null;
    for (const q of [...new Set([auto, 70, 75, 80])]) {
      const pass = await elaPass(q / 100), rr = elaRegions(pass.dy, S.tb, w, h, B), sc = rr.regions.length ? rr.regions[0].n * rr.regions[0].strength : 0;
      if (!ela || sc > ela.sc) ela = { q, view: pass.view, regions: rr.regions, level: rr.level, sc };
    }
    step("grid");
    const grid = gridVote(Y, w, h, (p) => step("grid", p));
    step("clone");
    const clone = copyMove(Y, w, h, (p) => step("clone", p));
    step("noise");
    const noise = noiseMap(Y, w, h);
    if (grid) delete grid.votes;
    const res = { type: "result", w, h, f, vw: S.vw, vh: S.vh, struct, graphic, flatShare: flat / S.tb.tex.length, ela: { q: ela.q, view: ela.view, regions: ela.regions, level: ela.level }, grid, clone, noise };
    post(res, [ela.view.buffer, noise.map.buffer].concat(grid ? [grid.map.buffer] : [], clone.mask ? [clone.mask.buffer] : []));
  }
  async function handle(msg, post) {
    try {
      if (msg.type === "analyze") await analyze(msg, post);
      else if (msg.type === "ela" && S) { const pass = await elaPass(msg.q / 100), rr = elaRegions(pass.dy, S.tb, S.w, S.h, S.B); post({ type: "ela", id: msg.id, q: msg.q, view: pass.view, regions: rr.regions }, [pass.view.buffer]); }
      else if (msg.type === "reset") S = null;
    } catch (e) { post({ type: "error", id: msg.id, message: String(e && e.message || e) }); }
  }

  /* أرقام الاختبار الفعلي (تُعرض للمستخدم كما هي): تُملأ من نتائج _fztest */
  const api = { fileStruct, gridVote, copyMove, noiseMap, elaRegions, textureBlocks, luma, handle };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else if (typeof WorkerGlobalScope !== "undefined" && root instanceof WorkerGlobalScope) root.onmessage = (e) => handle(e.data, (m, tr) => root.postMessage(m, tr || []));
  else root.ForensicsEngine = api;
})(typeof self !== "undefined" ? self : this);
