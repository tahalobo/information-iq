/* ==========================================================
   محرك معالجة الصور: ضغط، تغيير مقاس، علامة مائية، هدف حجم، PNG مفهرس، ZIP
   يعمل داخل Web Worker (OffscreenCanvas) أو في الصفحة مباشرة كبديل.
   بلا أي مكتبة خارجية: الصور لا تغادر الجهاز.
   ========================================================== */
(function (root) {
  "use strict";
  const HAS_OFF = typeof OffscreenCanvas !== "undefined";
  const JPEG = "image/jpeg", PNG = "image/png", WEBP = "image/webp", AVIF = "image/avif";

  const fail = (code, msg) => Object.assign(new Error(msg || code), { code });
  function mkCanvas(w, h) {
    w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
    if (HAS_OFF) return new OffscreenCanvas(w, h);
    const c = document.createElement("canvas"); c.width = w; c.height = h; return c;
  }
  const rawBlob = (c, type, q) => c.convertToBlob ? c.convertToBlob({ type, quality: q }) : new Promise((r) => c.toBlob(r, type, q));

  /* ---------- which encoders does this browser really have ---------- */
  const support = {};
  async function supports(type) {
    if (type in support) return support[type];
    try { const c = mkCanvas(8, 8); c.getContext("2d").fillRect(0, 0, 8, 8); const b = await rawBlob(c, type, .8); support[type] = !!b && b.type === type; }
    catch { support[type] = false; }
    return support[type];
  }

  /* ---------- CRC32 (PNG chunks + ZIP) ---------- */
  const CRC = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; }
  function crc32(u8, crc = 0) {
    crc = ~crc >>> 0;
    for (let i = 0; i < u8.length; i++) crc = CRC[(crc ^ u8[i]) & 255] ^ (crc >>> 8);
    return ~crc >>> 0;
  }

  /* ---------- ZIP (store only: images are already compressed) ---------- */
  async function zip(files) {
    const enc = new TextEncoder(), parts = [], central = []; let offset = 0;
    const d = new Date(), time = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
    for (const f of files) {
      const data = new Uint8Array(await f.blob.arrayBuffer()), name = enc.encode(f.name), crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, time, true); lh.setUint16(12, date, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(lh.buffer, name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
      ch.setUint16(12, time, true); ch.setUint16(14, date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(ch.buffer, name);
      offset += 30 + name.length + data.length;
    }
    const cdSize = central.reduce((n, p) => n + p.byteLength, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...parts, ...central, end.buffer], { type: "application/zip" });
  }

  /* ---------- lossy PNG: median-cut palette + Floyd–Steinberg + indexed PNG ---------- */
  const HAS_CS = typeof CompressionStream !== "undefined";
  const QUANT_MAX_PX = 40e6;

  function buildPalette(data, n) {
    const px = data.length >> 2, stride = Math.max(1, Math.floor(px / 200000));
    const s = new Uint32Array(Math.ceil(px / stride)); let m = 0;
    for (let i = 0; i < px; i += stride) { const o = i << 2, a = data[o + 3]; s[m++] = a === 0 ? 0 : (data[o] | (data[o + 1] << 8) | (data[o + 2] << 16) | (a << 24)) >>> 0; }
    const ch = (v, c) => (v >>> (c * 8)) & 255;
    const mkBox = (lo, hi) => {
      const mn = [255, 255, 255, 255], mx = [0, 0, 0, 0];
      for (let i = lo; i < hi; i++) for (let c = 0; c < 4; c++) { const v = ch(s[i], c); if (v < mn[c]) mn[c] = v; if (v > mx[c]) mx[c] = v; }
      let axis = 0, range = -1; for (let c = 0; c < 4; c++) if (mx[c] - mn[c] > range) { range = mx[c] - mn[c]; axis = c; }
      return { lo, hi, axis, range, score: range * Math.sqrt(hi - lo) };
    };
    const boxes = [mkBox(0, m)];
    while (boxes.length < n) {
      let bi = -1, best = 0; for (let i = 0; i < boxes.length; i++) if (boxes[i].range > 0 && boxes[i].hi - boxes[i].lo > 1 && boxes[i].score > best) { best = boxes[i].score; bi = i; }
      if (bi < 0) break;
      const b = boxes[bi], sh = b.axis * 8;
      s.subarray(b.lo, b.hi).sort((x, y) => ((x >>> sh) & 255) - ((y >>> sh) & 255));
      let mid = (b.lo + b.hi) >> 1; const mv = ch(s[mid], b.axis);
      // keep equal values on one side so a flat colour is never split in two
      let l = mid; while (l > b.lo && ch(s[l - 1], b.axis) === mv) l--;
      let r = mid; while (r < b.hi && ch(s[r], b.axis) === mv) r++;
      mid = l > b.lo ? l : r; if (mid <= b.lo || mid >= b.hi) { b.range = 0; continue; }
      boxes.splice(bi, 1, mkBox(b.lo, mid), mkBox(mid, b.hi));
    }
    const pal = new Uint8Array(boxes.length * 4);
    boxes.forEach((b, i) => {
      let r = 0, g = 0, bl = 0, a = 0; const cnt = b.hi - b.lo;
      for (let j = b.lo; j < b.hi; j++) { const v = s[j]; r += v & 255; g += (v >>> 8) & 255; bl += (v >>> 16) & 255; a += v >>> 24; }
      pal.set([Math.round(r / cnt), Math.round(g / cnt), Math.round(bl / cnt), Math.round(a / cnt)], i * 4);
    });
    return pal;
  }

  function mapPixels(data, w, h, pal) {
    const n = pal.length >> 2, out = new Uint8Array(w * h), cache = new Int16Array(1 << 20).fill(-1);
    const nearest = (r, g, b, a) => {
      const key = ((r >> 3) << 15) | ((g >> 3) << 10) | ((b >> 3) << 5) | (a >> 3);
      let hit = cache[key]; if (hit >= 0) return hit;
      let best = 1e12;
      for (let i = 0; i < n; i++) {
        const o = i << 2, dr = r - pal[o], dg = g - pal[o + 1], db = b - pal[o + 2], da = a - pal[o + 3];
        const dist = dr * dr * 2 + dg * dg * 4 + db * db + da * da * 4;
        if (dist < best) { best = dist; hit = i; }
      }
      return (cache[key] = hit);
    };
    const clamp = (v) => v < 0 ? 0 : v > 255 ? 255 : v | 0;
    let cur = new Float32Array((w + 2) * 4), nxt = new Float32Array((w + 2) * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const o = (y * w + x) << 2, e = (x + 1) << 2;
        if (data[o + 3] === 0) { out[y * w + x] = nearest(0, 0, 0, 0); continue; }
        const r = clamp(data[o] + cur[e]), g = clamp(data[o + 1] + cur[e + 1]), b = clamp(data[o + 2] + cur[e + 2]), a = clamp(data[o + 3] + cur[e + 3]);
        const i = nearest(r, g, b, a), p = i << 2; out[y * w + x] = i;
        const er = (r - pal[p]) * .75, eg = (g - pal[p + 1]) * .75, eb = (b - pal[p + 2]) * .75, ea = (a - pal[p + 3]) * .75;
        cur[e + 4] += er * .4375; cur[e + 5] += eg * .4375; cur[e + 6] += eb * .4375; cur[e + 7] += ea * .4375;
        nxt[e - 4] += er * .1875; nxt[e - 3] += eg * .1875; nxt[e - 2] += eb * .1875; nxt[e - 1] += ea * .1875;
        nxt[e] += er * .3125; nxt[e + 1] += eg * .3125; nxt[e + 2] += eb * .3125; nxt[e + 3] += ea * .3125;
        nxt[e + 4] += er * .0625; nxt[e + 5] += eg * .0625; nxt[e + 6] += eb * .0625; nxt[e + 7] += ea * .0625;
      }
      const t = cur; cur = nxt; nxt = t; nxt.fill(0);
    }
    return out;
  }

  function chunk(type, data) {
    const u = new Uint8Array(12 + data.length), dv = new DataView(u.buffer);
    dv.setUint32(0, data.length); for (let i = 0; i < 4; i++) u[4 + i] = type.charCodeAt(i);
    u.set(data, 8); dv.setUint32(8 + data.length, crc32(u.subarray(4, 8 + data.length)));
    return u;
  }

  async function quantPng(canvas, colors) {
    const w = canvas.width, h = canvas.height;
    const data = canvas.getContext("2d").getImageData(0, 0, w, h).data;
    const pal = buildPalette(data, colors), idx = mapPixels(data, w, h, pal), n = pal.length >> 2;
    const raw = new Uint8Array((w + 1) * h);
    for (let y = 0; y < h; y++) raw.set(idx.subarray(y * w, y * w + w), y * (w + 1) + 1);
    const z = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
    const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer); dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 8; ihdr[9] = 3;
    const plte = new Uint8Array(n * 3), trns = new Uint8Array(n); let alpha = false;
    for (let i = 0; i < n; i++) { plte.set(pal.subarray(i * 4, i * 4 + 3), i * 3); trns[i] = pal[i * 4 + 3]; if (trns[i] < 255) alpha = true; }
    const parts = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("PLTE", plte)];
    if (alpha) parts.push(chunk("tRNS", trns));
    parts.push(chunk("IDAT", z), chunk("IEND", new Uint8Array(0)));
    return new Blob(parts, { type: PNG });
  }
  const pngColors = (q) => q >= .95 ? 0 : q >= .75 ? 256 : q >= .55 ? 128 : q >= .4 ? 64 : q >= .25 ? 32 : 16;

  async function encode(canvas, type, q) {
    let blob;
    if (type === PNG) {
      const colors = pngColors(q);
      if (colors && HAS_CS && canvas.width * canvas.height <= QUANT_MAX_PX) {
        blob = await quantPng(canvas, colors);
        // tiny or flat images: the palette can cost more than it saves, so keep whichever is smaller
        if (canvas.width * canvas.height <= 16e6) { const full = await rawBlob(canvas, PNG); if (full && full.size <= blob.size) blob = full; }
      } else blob = await rawBlob(canvas, PNG);
    } else blob = await rawBlob(canvas, type, q);
    if (!blob || !blob.size) throw fail("canvas", "encode failed");
    return blob;
  }

  /* ---------- EXIF: copy the original block into a re-encoded JPEG (orientation reset: pixels are already upright) ---------- */
  async function readExif(file) {
    const buf = new Uint8Array(await file.slice(0, 262144).arrayBuffer());
    if (buf[0] !== 0xFF || buf[1] !== 0xD8) return null;
    let p = 2;
    while (p + 10 <= buf.length) {
      if (buf[p] !== 0xFF) return null;
      const m = buf[p + 1]; if (m === 0xDA || m === 0xD9) return null;
      const len = (buf[p + 2] << 8) | buf[p + 3];
      if (m === 0xE1 && buf[p + 4] === 0x45 && buf[p + 5] === 0x78 && buf[p + 6] === 0x69 && buf[p + 7] === 0x66) {
        if (p + 2 + len > buf.length) return null;
        const seg = buf.slice(p, p + 2 + len), t = 10, le = seg[t] === 0x49;
        const u16 = (o) => le ? seg[o] | (seg[o + 1] << 8) : (seg[o] << 8) | seg[o + 1];
        const u32 = (o) => le ? (seg[o] | (seg[o + 1] << 8) | (seg[o + 2] << 16) | (seg[o + 3] << 24)) >>> 0 : ((seg[o] << 24) | (seg[o + 1] << 16) | (seg[o + 2] << 8) | seg[o + 3]) >>> 0;
        const ifd = t + u32(t + 4);
        if (ifd + 2 <= seg.length) for (let i = 0, cnt = u16(ifd); i < cnt; i++) {
          const e = ifd + 2 + i * 12; if (e + 12 > seg.length) break;
          if (u16(e) === 0x0112) { seg[e + 8] = le ? 1 : 0; seg[e + 9] = le ? 0 : 1; }
        }
        return seg;
      }
      p += 2 + len;
    }
    return null;
  }

  /* ---------- geometry ---------- */
  function plan(sw, sh, r) {
    r = r || { mode: "none" };
    if (r.mode === "max" && r.max > 0) {
      const k = Math.min(1, r.max / Math.max(sw, sh));
      return { w: Math.max(1, Math.round(sw * k)), h: Math.max(1, Math.round(sh * k)), sx: 0, sy: 0, sW: sw, sH: sh, full: true };
    }
    if (r.mode === "exact" && (r.w > 0 || r.h > 0)) {
      if (!(r.w > 0 && r.h > 0)) { // one side only: keep the ratio, never enlarge
        const k = Math.min(1, r.w > 0 ? r.w / sw : r.h / sh);
        return { w: Math.max(1, Math.round(sw * k)), h: Math.max(1, Math.round(sh * k)), sx: 0, sy: 0, sW: sw, sH: sh, full: true };
      }
      const W = r.w, H = r.h;
      if (r.fit === "contain") {
        const k = Math.min(W / sw, H / sh), dw = sw * k, dh = sh * k;
        return { w: W, h: H, sx: 0, sy: 0, sW: sw, sH: sh, dx: (W - dw) / 2 / W, dy: (H - dh) / 2 / H, dw: dw / W, dh: dh / H, pad: r.pad || "#ffffff" };
      }
      const k = Math.max(W / sw, H / sh), cw = W / k, ch = H / k;
      return { w: W, h: H, sx: (sw - cw) / 2, sy: (sh - ch) / 2, sW: cw, sH: ch, full: true };
    }
    return { w: sw, h: sh, sx: 0, sy: 0, sW: sw, sH: sh, full: true };
  }

  function drawBase(bmp, g, k, type, bg) {
    const c = mkCanvas(g.w * k, g.h * k), ctx = c.getContext("2d", { willReadFrequently: type === PNG });
    if (!ctx) throw fail("canvas", "no 2d context");
    const W = c.width, H = c.height;
    if (g.pad && g.pad !== "transparent") { ctx.fillStyle = g.pad; ctx.fillRect(0, 0, W, H); }
    else if (type === JPEG) { ctx.fillStyle = bg || "#ffffff"; ctx.fillRect(0, 0, W, H); }
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
    if (g.full) ctx.drawImage(bmp, g.sx, g.sy, g.sW, g.sH, 0, 0, W, H);
    else ctx.drawImage(bmp, 0, 0, g.sW, g.sH, g.dx * W, g.dy * H, g.dw * W, g.dh * H);
    return c;
  }

  function drawStamp(c, stamp, wm) {
    if (!stamp || !wm || !wm.on) return;
    const ctx = c.getContext("2d"), W = c.width, H = c.height;
    const sw = Math.max(4, Math.round(W * wm.size)), sh = Math.max(2, Math.round(sw * stamp.height / stamp.width));
    const st = mkCanvas(sw, sh), sx = st.getContext("2d");
    sx.imageSmoothingQuality = "high"; sx.drawImage(stamp, 0, 0, sw, sh);
    const ang = (wm.angle || 0) * Math.PI / 180;
    ctx.save(); ctx.globalAlpha = wm.opacity;
    if (wm.tile) {
      let stepX = sw * (1 + wm.gap), stepY = Math.max(sh * 1.4, sh + sw * wm.gap * .55);
      const R = Math.hypot(W, H) / 2, count = (2 * R / stepX) * (2 * R / stepY);
      if (count > 3000) { const f = Math.sqrt(count / 3000); stepX *= f; stepY *= f; }
      ctx.translate(W / 2, H / 2); ctx.rotate(ang);
      for (let row = 0, y = -R; y <= R + stepY; y += stepY, row++)
        for (let x = -R - (row % 2 ? stepX / 2 : 0); x <= R + stepX; x += stepX) ctx.drawImage(st, Math.round(x - sw / 2), Math.round(y - sh / 2));
    } else {
      const m = Math.min(W, H) * wm.margin, bw = Math.abs(sw * Math.cos(ang)) + Math.abs(sh * Math.sin(ang)), bh = Math.abs(sw * Math.sin(ang)) + Math.abs(sh * Math.cos(ang));
      const px = wm.pos[1], py = wm.pos[0];
      const cx = px === "l" ? m + bw / 2 : px === "r" ? W - m - bw / 2 : W / 2, cy = py === "t" ? m + bh / 2 : py === "b" ? H - m - bh / 2 : H / 2;
      ctx.translate(cx, cy); ctx.rotate(ang); ctx.drawImage(st, -sw / 2, -sh / 2);
    }
    ctx.restore();
  }

  /* ---------- state: decoded bitmaps (small LRU), watermark stamps, cancelled jobs ---------- */
  const bitmaps = new Map(), stamps = new Map(), cancelled = new Set();
  const CACHE = 2;
  async function decode(id, file) {
    let b = bitmaps.get(id);
    if (b) { bitmaps.delete(id); bitmaps.set(id, b); return b; }
    try { b = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch { try { b = await createImageBitmap(file); } catch { throw fail("decode", "cannot decode"); } }
    bitmaps.set(id, b);
    while (bitmaps.size > CACHE) { const k = bitmaps.keys().next().value; bitmaps.get(k).close?.(); bitmaps.delete(k); }
    return b;
  }

  async function job(d) {
    const o = d.opts, check = () => { if (cancelled.has(d.jobId)) throw fail("cancel"); };
    const bmp = await decode(d.id, d.file); check();
    const srcType = d.file.type;
    let type = o.fmt === "keep" ? ([JPEG, PNG, WEBP].includes(srcType) ? srcType : JPEG) : o.fmt;
    const notes = [];
    if (!(await supports(type))) { notes.push("fmt"); type = JPEG; }
    const g = plan(bmp.width, bmp.height, o.resize), stamp = o.wm && o.wm.on ? stamps.get(d.stampId) : null;
    const render = (k) => { const c = drawBase(bmp, g, k, type, o.bg); drawStamp(c, stamp, o.wm); return c; };

    let k = 1, canvas, blob, q = o.quality, hit = true;
    // some devices cap the canvas area (16.7 MP on iPhone): retry smaller instead of failing
    const safe = async (fn) => {
      for (let i = 0; ; i++) {
        try { canvas = render(k); return await fn(canvas); }
        catch (e) { if (e.code === "cancel" || i >= 5) throw e.code ? e : fail("canvas", String(e.message || e)); k *= .7; if (!notes.includes("limit")) notes.push("limit"); }
      }
    };

    if (o.target > 0) {
      hit = false;
      for (let round = 0; round < 9 && !hit; round++) {
        check();
        if (type === PNG) {
          for (const qq of [1, .8, .6, .45, .3, .1]) { blob = await safe((c) => encode(c, PNG, qq)); q = qq; check(); if (blob.size <= o.target) { hit = true; break; } }
        } else {
          let lo = .4, hi = .92;
          blob = await safe((c) => encode(c, type, hi)); q = hi;
          if (blob.size <= o.target) hit = true;
          else {
            const low = await encode(canvas, type, lo); check();
            if (low.size <= o.target) {
              blob = low; q = lo; hit = true;
              for (let i = 0; i < 6; i++) { const mid = (lo + hi) / 2, b = await encode(canvas, type, mid); check(); if (b.size <= o.target) { blob = b; q = mid; lo = mid; } else hi = mid; }
            } else blob = low, q = lo;
          }
        }
        if (!hit) { if (canvas.width * canvas.height <= 256) break; k *= Math.min(.9, Math.max(.35, Math.sqrt(o.target / blob.size) * .95)); if (!notes.includes("shrunk")) notes.push("shrunk"); }
      }
      if (!hit) notes.push("miss");
    } else blob = await safe((c) => encode(c, type, o.quality));
    check();

    if (o.exif && type === JPEG && srcType === JPEG) {
      const seg = await readExif(d.file);
      if (seg) { blob = new Blob([blob.slice(0, 2), seg, blob.slice(2)], { type: JPEG }); notes.push("exif"); }
    }
    if (type === PNG && pngColors(q) && !(HAS_CS && canvas.width * canvas.height <= QUANT_MAX_PX)) notes.push("lossless");

    const alpha = type !== JPEG, small = (c, max, t, qq) => { const s = Math.min(1, max / Math.max(c.width, c.height)), m = mkCanvas(c.width * s, c.height * s), x = m.getContext("2d"); x.imageSmoothingQuality = "high"; x.drawImage(c, 0, 0, m.width, m.height); return rawBlob(m, t, qq); };
    const res = { blob, w: canvas.width, h: canvas.height, sw: bmp.width, sh: bmp.height, q, type, notes, hit };
    res.thumb = await small(canvas, 128, alpha ? PNG : JPEG, .75);
    if (d.before) { const base = drawBase(bmp, g, Math.min(1, 1600 / Math.max(g.w, g.h)), alpha ? PNG : JPEG, o.bg); res.before = await rawBlob(base, alpha ? PNG : JPEG, .92); }
    check();
    return res;
  }

  function handle(d) {
    switch (d.t) {
      case "job": return job(d).finally(() => cancelled.delete(d.jobId));
      case "cancel": cancelled.add(d.jobId); break;
      case "stamp": stamps.forEach((b) => b.close?.()); stamps.clear(); if (d.bmp) stamps.set(d.stampId, d.bmp); break;
      case "drop": bitmaps.get(d.id)?.close?.(); bitmaps.delete(d.id); break;
      case "clear": bitmaps.forEach((b) => b.close?.()); bitmaps.clear(); break;
    }
  }

  root.ImageEngine = { handle, supports, zip, crc32, HAS_OFF };
})(typeof self !== "undefined" ? self : this);
