/* ==========================================================
   مكتبة الصور: قراءة الميتاداتا وإزالتها بلا فقدان للجودة
   تعمل بالكامل داخل المتصفح.
   القراءة هنا (read/group) مبسّطة وتعتمد على exifr، وتستخدمها صفحات البحث العكسي
   وكاشف الذكاء الاصطناعي. القراءة الشاملة في metascan.js. أما التنظيف (strip)
   فمستقل عن أي مكتبة.
   ========================================================== */
(function () {
  "use strict";

  const LABELS = {
    Make: "الشركة المصنعة", Model: "طراز الجهاز", LensMake: "صانع العدسة", LensModel: "العدسة", Software: "البرنامج / إصدار النظام",
    HostComputer: "الجهاز المضيف", DateTimeOriginal: "تاريخ الالتقاط", CreateDate: "تاريخ الإنشاء", ModifyDate: "تاريخ التعديل",
    DateTime: "التاريخ", OffsetTime: "المنطقة الزمنية", OffsetTimeOriginal: "المنطقة الزمنية للالتقاط", SubSecTimeOriginal: "أجزاء الثانية",
    ExposureTime: "سرعة الغالق", FNumber: "فتحة العدسة", ISO: "حساسية ISO", FocalLength: "البعد البؤري", FocalLengthIn35mmFormat: "البعد البؤري (35 ملم)",
    Flash: "الفلاش", Orientation: "اتجاه الصورة", ExposureProgram: "برنامج التعريض", MeteringMode: "نمط القياس", WhiteBalance: "توازن الأبيض",
    ExposureMode: "نمط التعريض", ExposureCompensation: "تعويض التعريض", SceneCaptureType: "نوع المشهد", BrightnessValue: "السطوع",
    ColorSpace: "فضاء الألوان", ExifImageWidth: "العرض", ExifImageHeight: "الارتفاع", ImageWidth: "العرض", ImageHeight: "الارتفاع",
    XResolution: "الدقة الأفقية", YResolution: "الدقة العمودية", ResolutionUnit: "وحدة الدقة",
    Artist: "المؤلف / المصور", Copyright: "حقوق النشر", ImageDescription: "وصف الصورة", UserComment: "تعليق المستخدم",
    BodySerialNumber: "الرقم التسلسلي للجهاز", SerialNumber: "الرقم التسلسلي", LensSerialNumber: "الرقم التسلسلي للعدسة",
    CameraOwnerName: "اسم مالك الكاميرا", OwnerName: "اسم المالك", ImageUniqueID: "المعرّف الفريد للصورة",
    GPSLatitude: "خط العرض", GPSLongitude: "خط الطول", GPSAltitude: "الارتفاع عن سطح البحر", GPSLatitudeRef: "اتجاه خط العرض",
    GPSLongitudeRef: "اتجاه خط الطول", GPSAltitudeRef: "مرجع الارتفاع", GPSTimeStamp: "وقت GPS", GPSDateStamp: "تاريخ GPS",
    GPSSpeed: "السرعة", GPSImgDirection: "اتجاه الكاميرا", GPSHPositioningError: "دقة الموقع (متر)", GPSDestBearing: "الاتجاه",
    latitude: "خط العرض", longitude: "خط الطول",
    CreatorTool: "أداة الإنشاء", creator: "المنشئ", Creator: "المنشئ", rights: "الحقوق", title: "العنوان", description: "الوصف",
    City: "المدينة", Country: "الدولة", State: "المحافظة", Byline: "المصور", "By-line": "المصور", Keywords: "الكلمات المفتاحية",
    Headline: "العنوان", Caption: "التعليق", ObjectName: "اسم العنصر", CopyrightNotice: "حقوق النشر", Credit: "الجهة",
    ProfileDescription: "ملف الألوان", ProfileCreator: "منشئ ملف الألوان", ProfileCopyright: "حقوق ملف الألوان", DeviceManufacturer: "مصنّع الجهاز (ICC)",
    BitDepth: "عمق البت", ColorType: "نوع الألوان", Compression: "الضغط", Interlace: "التشابك"
  };

  const SENSITIVE = new Set(["GPSLatitude", "GPSLongitude", "GPSAltitude", "latitude", "longitude", "GPSTimeStamp", "GPSDateStamp", "GPSImgDirection", "GPSSpeed",
    "Make", "Model", "LensModel", "BodySerialNumber", "SerialNumber", "LensSerialNumber", "CameraOwnerName", "OwnerName", "Artist", "Copyright",
    "DateTimeOriginal", "CreateDate", "HostComputer", "Software", "ImageUniqueID", "creator", "Creator", "City", "Country", "State", "Byline", "By-line", "CreatorTool", "UserComment"]);

  const GROUPS = [
    { id: "gps", title: "الموقع الجغرافي", icon: "map-pin", keys: (k, seg) => seg === "gps" || /^GPS/.test(k) },
    { id: "device", title: "الجهاز والكاميرا", icon: "smartphone", keys: (k) => ["Make", "Model", "LensMake", "LensModel", "BodySerialNumber", "SerialNumber", "LensSerialNumber", "CameraOwnerName", "OwnerName", "HostComputer", "Software", "ImageUniqueID"].includes(k) },
    { id: "time", title: "التاريخ والوقت", icon: "calendar-clock", keys: (k, seg) => seg !== "icc" && seg !== "xmp" && /Date|Time$|OffsetTime|SubSec/.test(k) && !/^GPS/.test(k) && k !== "ExposureTime" },
    { id: "shoot", title: "إعدادات التصوير", icon: "aperture", keys: (k) => ["ExposureTime", "FNumber", "ISO", "FocalLength", "FocalLengthIn35mmFormat", "Flash", "ExposureProgram", "MeteringMode", "WhiteBalance", "ExposureMode", "ExposureCompensation", "SceneCaptureType", "BrightnessValue", "ShutterSpeedValue", "ApertureValue", "MaxApertureValue", "DigitalZoomRatio", "LightSource", "Contrast", "Saturation", "Sharpness", "SensingMethod"].includes(k) },
    { id: "author", title: "المؤلف والحقوق", icon: "user-round", keys: (k, seg) => seg === "iptc" || ["Artist", "Copyright", "ImageDescription", "UserComment", "creator", "Creator", "rights", "title", "description"].includes(k) },
    { id: "image", title: "خصائص الصورة", icon: "image", keys: (k, seg) => seg === "ihdr" || seg === "jfif" || ["Orientation", "ColorSpace", "ExifImageWidth", "ExifImageHeight", "ImageWidth", "ImageHeight", "XResolution", "YResolution", "ResolutionUnit", "YCbCrPositioning", "ComponentsConfiguration", "CompressedBitsPerPixel"].includes(k) },
    { id: "icc", title: "ملف الألوان (ICC)", icon: "palette", keys: (k, seg) => seg === "icc" },
    { id: "xmp", title: "بيانات XMP", icon: "file-code", keys: (k, seg) => seg === "xmp" },
    { id: "other", title: "بيانات أخرى", icon: "list", keys: () => true }
  ];

  const nfLatn = "ar-IQ-u-nu-latn";
  function fmtValue(k, v) {
    if (v == null) return "";
    if (v instanceof Date) { try { return new Intl.DateTimeFormat(nfLatn, { dateStyle: "full", timeStyle: "medium" }).format(v); } catch { return v.toISOString(); } }
    if (v instanceof Uint8Array || v instanceof ArrayBuffer || (v && v.buffer instanceof ArrayBuffer && typeof v.length === "number" && !Array.isArray(v))) return `[بيانات ثنائية ${v.byteLength || v.length} بايت]`;
    if (k === "ExposureTime" && typeof v === "number") return v < 1 ? `1/${Math.round(1 / v)} ثانية` : `${v} ثانية`;
    if (k === "FNumber" && typeof v === "number") return `f/${v}`;
    if (/FocalLength/.test(k) && typeof v === "number") return `${v} ملم`;
    if (k === "GPSAltitude" && typeof v === "number") return `${v.toFixed(1)} متر`;
    if ((k === "latitude" || k === "longitude") && typeof v === "number") return v.toFixed(6);
    if (Array.isArray(v)) return v.length > 12 ? `[${v.length} عنصر]` : v.map((x) => typeof x === "number" ? +x.toFixed(6) : fmtValue("", x)).join("، ");
    if (typeof v === "object") { try { const s = JSON.stringify(v); return s.length > 300 ? s.slice(0, 300) + "…" : s; } catch { return String(v); } }
    if (typeof v === "number") return String(+v.toFixed(6));
    const s = String(v); return s.length > 400 ? s.slice(0, 400) + "…" : s;
  }

  async function read(file) {
    const out = { segments: {}, gps: null, orientation: 1, error: null };
    if (!window.exifr) { out.error = "مكتبة القراءة لم تُحمَّل. تحقق من الاتصال بالإنترنت."; return out; }
    try {
      const data = await exifr.parse(file, {
        tiff: true, exif: true, gps: true, xmp: true, iptc: true, icc: true, jfif: true, ihdr: true,
        ifd1: false, interop: false, makerNote: false, userComment: true, mergeOutput: false,
        translateKeys: true, translateValues: true, reviveValues: true, sanitize: true
      });
      if (data) out.segments = data;
    } catch (e) { out.error = "تعذّرت قراءة بيانات هذا الملف."; }
    try { const g = await exifr.gps(file); if (g && isFinite(g.latitude) && isFinite(g.longitude)) out.gps = g; } catch { /* no gps */ }
    try { const o = await exifr.orientation(file); if (o) out.orientation = o; } catch { /* default */ }
    return out;
  }

  /* Flatten segments into grouped rows */
  function group(meta) {
    const rows = [];
    for (const [seg, obj] of Object.entries(meta.segments || {})) {
      if (!obj || typeof obj !== "object") continue;
      for (const [k, v] of Object.entries(obj)) {
        if (v == null || v === "" || k === "errors") continue;
        if (seg === "xmp" && typeof v === "object" && !Array.isArray(v) && !(v instanceof Date)) {
          for (const [k2, v2] of Object.entries(v)) rows.push({ seg, key: `${k}:${k2}`, raw: k2, value: v2 });
        } else rows.push({ seg, key: k, raw: k, value: v });
      }
    }
    if (meta.gps && !rows.some((r) => r.raw === "latitude")) {
      rows.push({ seg: "gps", key: "latitude", raw: "latitude", value: meta.gps.latitude });
      rows.push({ seg: "gps", key: "longitude", raw: "longitude", value: meta.gps.longitude });
    }
    const used = new Set(); const groups = [];
    for (const g of GROUPS) {
      const items = rows.filter((r) => !used.has(r) && g.keys(r.raw, r.seg));
      items.forEach((r) => used.add(r));
      if (items.length) groups.push({ ...g, items: items.map((r) => ({
        key: r.key, label: LABELS[r.raw] || r.key, value: fmtValue(r.raw, r.value), sensitive: SENSITIVE.has(r.raw)
      })).filter((x) => x.value !== "") });
    }
    return groups.filter((g) => g.items.length);
  }

  /* Privacy risk assessment */
  function risk(meta, groups) {
    const has = (pred) => groups.some((g) => g.id !== "icc" && g.items.some(pred));
    const findings = [];
    let score = 0;
    if (meta.gps) { score += 55; findings.push({ level: "danger", icon: "map-pin", text: "تحتوي على إحداثيات GPS تكشف مكان التصوير بدقة." }); }
    if (has((i) => /Serial|Owner|ImageUniqueID/.test(i.key))) { score += 15; findings.push({ level: "danger", icon: "fingerprint", text: "تحتوي على رقم تسلسلي أو اسم مالك يمكن ربطه بك." }); }
    if (has((i) => ["Make", "Model"].includes(i.key))) { score += 10; findings.push({ level: "warn", icon: "smartphone", text: "تكشف نوع جهازك وطرازه." }); }
    if (has((i) => /DateTimeOriginal|CreateDate/.test(i.key))) { score += 10; findings.push({ level: "warn", icon: "calendar-clock", text: "تكشف تاريخ التصوير ووقته بالثانية." }); }
    if (has((i) => /Artist|Copyright|creator|Creator|Byline/.test(i.key))) { score += 10; findings.push({ level: "warn", icon: "user-round", text: "تحتوي على اسم المؤلف أو صاحب الحقوق." }); }
    if (has((i) => /Software|CreatorTool|HostComputer/.test(i.key))) { score += 5; findings.push({ level: "info", icon: "app-window", text: "تكشف البرنامج أو النظام الذي عالج الصورة." }); }
    score = Math.min(100, score);
    const level = score === 0 ? "clean" : score < 25 ? "low" : score < 55 ? "medium" : "high";
    return { score, level, findings };
  }

  /* ---------- Lossless stripping ----------
     القاعدة: نُبقي فقط ما يلزم لعرض البكسلات كما هي، ونحذف كل ما عداه
     (قائمة سماح لا قائمة منع)، ونقطع أي بيانات ملحقة بعد نهاية الصورة. */
  function concat(parts) {
    const len = parts.reduce((a, p) => a + p.length, 0); const out = new Uint8Array(len); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; } return out;
  }
  const ascii = (d, i, n) => String.fromCharCode(...d.subarray(i, Math.min(d.length, i + n)));
  const hasData = (d, from) => { for (let k = from; k < d.length; k++) if (d[k]) return true; return false; };

  // little-endian TIFF with a single IFD0 entry: Orientation
  const orientTiff = (o) => [0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00,
    0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, o & 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
  function minimalOrientationExif(o) {
    const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...orientTiff(o)];
    const len = payload.length + 2;
    return new Uint8Array([0xFF, 0xE1, (len >> 8) & 0xFF, len & 0xFF, ...payload]);
  }
  let CRC = null;
  function crc32(d) {
    if (!CRC) { CRC = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; CRC[n] = c >>> 0; } }
    let c = 0xFFFFFFFF; for (let i = 0; i < d.length; i++) c = CRC[(c ^ d[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function jpegSegName(m, id) {
    if (m === 0xE0) return "صورة مصغّرة JFIF";
    if (m === 0xE1) return /^Exif/.test(id) ? "EXIF" : /xmp\/extension/.test(id) ? "XMP ممتد" : /ns\.adobe\.com\/xap/.test(id) ? "XMP" : "APP1";
    if (m === 0xE2) return /^ICC_PROFILE/.test(id) ? "ملف الألوان ICC" : /^MPF/.test(id) ? "فهرس الصور المتعددة MPF" : "APP2";
    if (m === 0xEB) return "C2PA / JUMBF";
    if (m === 0xEC) return /^Ducky/.test(id) ? "Ducky (فوتوشوب)" : "APP12";
    if (m === 0xED) return "IPTC / فوتوشوب";
    if (m === 0xEE) return "Adobe";
    if (m === 0xFE) return "تعليق (COM)";
    return `APP${m - 0xE0}`;
  }

  function stripJpeg(d, opts) {
    if (d[0] !== 0xFF || d[1] !== 0xD8) throw new Error("ليست JPEG صالحة");
    const parts = [d.subarray(0, 2)], removed = [];
    let i = 2, inserted = false, end = -1;
    const orient = () => { if (!inserted && opts.orientation > 1 && opts.keepOrientation) { parts.push(minimalOrientationExif(opts.orientation)); inserted = true; } };
    while (i + 2 <= d.length) {
      if (d[i] !== 0xFF) throw new Error("بنية JPEG غير متوقعة");
      const m = d[i + 1];
      if (m === 0xFF) { i++; continue; }
      if (m === 0xD9) { parts.push(d.subarray(i, i + 2)); end = i + 2; break; }
      if (m === 0x01 || (m >= 0xD0 && m <= 0xD8)) { parts.push(d.subarray(i, i + 2)); i += 2; continue; }
      if (i + 4 > d.length) throw new Error("ملف JPEG مبتور");
      const len = (d[i + 2] << 8) | d[i + 3];
      if (len < 2 || i + 2 + len > d.length) throw new Error("ملف JPEG مبتور");
      let segEnd = i + 2 + len, keep = true, seg = null;
      const id = ascii(d, i + 4, 36);
      if (m !== 0xE0) orient(); // اتجاه الصورة يأتي بعد ترويسة JFIF مباشرة
      if ((m >= 0xE0 && m <= 0xEF) || m === 0xFE) {
        keep = false;
        if (m === 0xE0 && /^JFIF\0/.test(id)) {
          keep = true;
          if (len > 16 && (d[i + 16] || d[i + 17])) { // JFIF يحمل صورة مصغّرة: نُبقي الترويسة فقط
            seg = new Uint8Array(18); seg.set(d.subarray(i, i + 18)); seg[2] = 0; seg[3] = 16; seg[16] = 0; seg[17] = 0; removed.push("صورة مصغّرة JFIF");
          }
        }
        if (m === 0xE2 && opts.keepICC && /^ICC_PROFILE\0/.test(id)) keep = true;
        if (m === 0xEE && /^Adobe/.test(id)) keep = true; // affects colour decoding (CMYK/YCC)
      }
      if (m === 0xDA) { // scan: header + entropy-coded data up to the next real marker
        let p = segEnd;
        for (;;) { p = d.indexOf(0xFF, p); if (p < 0 || p + 1 >= d.length) { p = -1; break; } const n = d[p + 1]; if (n === 0 || (n >= 0xD0 && n <= 0xD7)) { p += 2; continue; } if (n === 0xFF) { p++; continue; } break; }
        if (p < 0) throw new Error("ملف JPEG مبتور");
        segEnd = p;
      }
      if (keep) parts.push(seg || d.subarray(i, segEnd)); else removed.push(jpegSegName(m, id));
      i = segEnd;
    }
    if (end < 0) throw new Error("ملف JPEG مبتور");
    if (end < d.length && hasData(d, end)) removed.push("بيانات ملحقة بعد نهاية الصورة");
    return { bytes: concat(parts), removed };
  }

  const PNG_KEEP = new Set(["tRNS", "gAMA", "cHRM", "sRGB", "sBIT", "bKGD", "pHYs", "cICP", "mDCV", "cLLI", "acTL", "fcTL", "fdAT"]);
  function stripPng(d, opts) {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!sig.every((b, k) => d[k] === b)) throw new Error("ليست PNG صالحة");
    const parts = [d.subarray(0, 8)], removed = [];
    let i = 8, ended = false, inserted = false;
    while (i + 12 <= d.length) {
      const len = ((d[i] << 24) >>> 0) + (d[i + 1] << 16) + (d[i + 2] << 8) + d[i + 3];
      const type = ascii(d, i + 4, 4);
      const end = i + 12 + len;
      if (end > d.length) throw new Error("ملف PNG مبتور");
      const critical = type.charCodeAt(0) < 0x61; // حرف كبير = قطعة أساسية للعرض
      if (type === "IDAT" && !inserted && opts.keepOrientation && opts.orientation > 1) {
        const body = new Uint8Array([0x65, 0x58, 0x49, 0x66, ...orientTiff(opts.orientation)]); // "eXIf" + TIFF
        const c = crc32(body), n = body.length - 4;
        parts.push(new Uint8Array([n >>> 24, (n >> 16) & 255, (n >> 8) & 255, n & 255]), body, new Uint8Array([c >>> 24, (c >> 16) & 255, (c >> 8) & 255, c & 255]));
        inserted = true;
      }
      if (critical || PNG_KEEP.has(type) || (type === "iCCP" && opts.keepICC)) parts.push(d.subarray(i, end)); else removed.push(type);
      i = end;
      if (type === "IEND") { ended = true; break; }
    }
    if (!ended) throw new Error("ملف PNG مبتور");
    if (i < d.length && hasData(d, i)) removed.push("بيانات ملحقة بعد نهاية الصورة");
    return { bytes: concat(parts), removed };
  }

  const WEBP_KEEP = new Set(["VP8X", "VP8 ", "VP8L", "ALPH", "ANIM", "ANMF"]);
  function stripWebp(d, opts) {
    if (ascii(d, 0, 4) !== "RIFF" || ascii(d, 8, 4) !== "WEBP") throw new Error("ليست WebP صالحة");
    const parts = [], removed = []; let i = 12, vp8x = null, hadExif = false;
    const riffEnd = Math.min(d.length, 8 + ((d[4] | (d[5] << 8) | (d[6] << 16) | (d[7] << 24)) >>> 0));
    while (i + 8 <= riffEnd) {
      const type = ascii(d, i, 4);
      const size = (d[i + 4] | (d[i + 5] << 8) | (d[i + 6] << 16) | (d[i + 7] << 24)) >>> 0;
      const end = i + 8 + size + (size & 1);
      const chunk = d.slice(i, Math.min(end, d.length));
      if (type === "EXIF") hadExif = true;
      if (WEBP_KEEP.has(type) || (type === "ICCP" && opts.keepICC)) { if (type === "VP8X") vp8x = chunk; parts.push(chunk); }
      else removed.push(type.trim());
      i = end;
    }
    const keepOrient = !!vp8x && hadExif && opts.keepOrientation && opts.orientation > 1;
    if (keepOrient) { const t = orientTiff(opts.orientation); parts.push(new Uint8Array([0x45, 0x58, 0x49, 0x46, t.length, 0, 0, 0, ...t])); }
    if (vp8x) {
      vp8x[8] &= ~(0x08 | 0x04); // clear EXIF & XMP flags
      if (keepOrient) vp8x[8] |= 0x08;
      if (!opts.keepICC) vp8x[8] &= ~0x20;
    }
    if (riffEnd < d.length && hasData(d, riffEnd)) removed.push("بيانات ملحقة بعد نهاية الصورة");
    const body = concat(parts);
    const header = new Uint8Array(12); header.set(d.subarray(0, 12));
    const total = body.length + 4;
    header[4] = total & 0xFF; header[5] = (total >> 8) & 0xFF; header[6] = (total >> 16) & 0xFF; header[7] = (total >> 24) & 0xFF;
    return { bytes: concat([header, body]), removed };
  }

  /* GIF: نحذف التعليقات وامتدادات التطبيقات (عدا تكرار الحركة) ونُبقي الإطارات كما هي */
  function stripGif(d) {
    if (!/^GIF8[79]a/.test(ascii(d, 0, 6))) throw new Error("ليست GIF صالحة");
    let p = 13; if (d[10] & 0x80) p += 3 * (1 << ((d[10] & 7) + 1));
    const parts = [d.subarray(0, p)], removed = []; let ended = false;
    const skip = (q) => { while (q < d.length && d[q]) q += 1 + d[q]; return q + 1; };
    while (p < d.length) {
      const b = d[p], start = p;
      if (b === 0x3B) { parts.push(d.subarray(p, p + 1)); p++; ended = true; break; }
      if (b === 0x2C) { const packed = d[p + 9]; p += 10; if (packed & 0x80) p += 3 * (1 << ((packed & 7) + 1)); p = skip(p + 1); parts.push(d.subarray(start, p)); continue; }
      if (b === 0x21) {
        const label = d[p + 1];
        if (label === 0xFE) { p = skip(p + 2); removed.push("تعليق"); continue; }
        if (label === 0xFF) { const id = ascii(d, p + 3, 11); p = skip(p + 14); if (/^(NETSCAPE2\.0|ANIMEXTS1\.0)$/.test(id)) parts.push(d.subarray(start, p)); else removed.push(id.trim() === "XMP DataXMP" ? "XMP" : `امتداد ${id.replace(/[^\x20-\x7E]/g, "").trim()}`); continue; }
        p = skip(p + 2); parts.push(d.subarray(start, p)); continue;
      }
      throw new Error("بنية GIF غير متوقعة");
    }
    if (!ended || p > d.length) throw new Error("ملف GIF مبتور");
    if (p < d.length && hasData(d, p)) removed.push("بيانات ملحقة بعد نهاية الصورة");
    return { bytes: concat(parts), removed };
  }

  async function reencode(file, type, quality = 0.95) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const c = document.createElement("canvas"); c.width = bmp.width; c.height = bmp.height;
    const ctx = c.getContext("2d");
    if (type === "image/jpeg") { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height); }
    ctx.drawImage(bmp, 0, 0);
    return new Promise((res, rej) => c.toBlob((b) => b ? res(b) : rej(new Error("فشل التحويل")), type, quality));
  }

  function sniff(d) {
    if (d[0] === 0xFF && d[1] === 0xD8) return "jpeg";
    if (d[0] === 0x89 && d[1] === 0x50 && d[2] === 0x4E && d[3] === 0x47) return "png";
    if (ascii(d, 0, 4) === "RIFF" && ascii(d, 8, 4) === "WEBP") return "webp";
    if (ascii(d, 4, 4) === "ftyp") { const b = ascii(d, 8, 4); if (/hei|hev|mif|msf|avif/.test(b)) return /avif/.test(b) ? "avif" : "heic"; }
    if (ascii(d, 0, 3) === "GIF") return "gif";
    if (d[0] === 0x49 && d[1] === 0x49 || d[0] === 0x4D && d[1] === 0x4D) return "tiff";
    return "other";
  }

  /* Returns { blob, removed[], method, ext } */
  async function strip(file, opts = {}) {
    const o = { keepICC: true, keepOrientation: true, orientation: 1, ...opts };
    const d = new Uint8Array(await file.arrayBuffer());
    const kind = sniff(d);
    if (ascii(d, 0, 5) === "%PDF-" || (kind === "other" && /^(ftyp|moov|mdat|wide|free)$/.test(ascii(d, 4, 4)))) {
      const err = new Error("التنظيف يدعم الصور فقط. لم نضف تنظيف الفيديو والـ PDF لأن إعادة كتابتهما داخل المتصفح بلا مخاطرة على الملف غير مضمونة."); err.kind = "unsupported"; throw err;
    }
    try {
      if (kind === "jpeg") { const r = stripJpeg(d, o); return { blob: new Blob([r.bytes], { type: "image/jpeg" }), removed: r.removed, method: "lossless", ext: "jpg" }; }
      if (kind === "png") { const r = stripPng(d, o); return { blob: new Blob([r.bytes], { type: "image/png" }), removed: r.removed, method: "lossless", ext: "png" }; }
      if (kind === "webp") { const r = stripWebp(d, o); return { blob: new Blob([r.bytes], { type: "image/webp" }), removed: r.removed, method: "lossless", ext: "webp" }; }
      if (kind === "gif") { const r = stripGif(d); return { blob: new Blob([r.bytes], { type: "image/gif" }), removed: r.removed, method: "lossless", ext: "gif" }; }
    } catch (e) { /* fall back to re-encoding */ }
    const isPngish = kind === "gif" || kind === "png" || file.type === "image/bmp";
    const type = isPngish ? "image/png" : "image/jpeg";
    try {
      const blob = await reencode(file, type);
      return { blob, removed: ["كل البيانات (إعادة ترميز)"], method: "reencode", ext: isPngish ? "png" : "jpg" };
    } catch (e) {
      const err = new Error(kind === "heic" ? "هذا المتصفح لا يستطيع فتح صور HEIC لإعادة حفظها (سفاري يستطيع). افتح الصفحة في سفاري على آيفون أو ماك، أو حوّل الصورة إلى JPG أولاً، أو اختر «الأكثر توافقاً» من إعدادات كاميرا الآيفون."
        : kind === "tiff" ? "المتصفحات لا تفتح صور TIFF، فلا نستطيع إعادة حفظها. حوّلها إلى JPG أو PNG ببرنامج صور ثم نظّفها هنا." : "تعذّرت معالجة هذا الملف في المتصفح.");
      err.kind = kind; throw err;
    }
  }

  async function sha256(blob) {
    if (!crypto.subtle) return null;
    const h = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function dims(file) {
    return new Promise((res) => {
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => { res({ w: img.naturalWidth, h: img.naturalHeight, url }); };
      img.onerror = () => res({ w: 0, h: 0, url: null });
      img.src = url;
    });
  }

  /* Heuristics: guess where an image came from based on its file name & size */
  function sourceHints(file, d) {
    const n = file.name || ""; const hints = [];
    if (/^IMG-\d{8}-WA\d+/i.test(n) || /WhatsApp Image/i.test(n)) hints.push("اسم الملف يشير إلى أنها مُرسلة أو محفوظة من <strong>واتساب</strong>، أي أنها ليست الصورة الأصلية غالباً.");
    if (/^FB_IMG_/i.test(n)) hints.push("اسم الملف يشير إلى أنها محفوظة من <strong>فيسبوك</strong>.");
    if (/^photo_\d{4}-\d{2}-\d{2}/i.test(n)) hints.push("اسم الملف يشير إلى أنها محفوظة من <strong>تليغرام</strong>.");
    if (/^Screenshot|^لقطة|^Screen Shot|^screencap/i.test(n)) hints.push("الصورة <strong>لقطة شاشة</strong>، أي أنها منقولة من مكان آخر، فابحث عن المصدر الأصلي.");
    if (/^\d{8,}_\d+_\d+_n\./.test(n)) hints.push("نمط الاسم يشبه صور <strong>إنستغرام/فيسبوك</strong> المحمّلة من الخوادم.");
    if (/^IMG_\d{4}\./i.test(n) || /^DSC/i.test(n) || /^PXL_/i.test(n) || /^IMG_\d{8}_\d{6}/i.test(n)) hints.push("اسم الملف بنمط <strong>الكاميرا الأصلية</strong>، فقد تكون الصورة الأصلية.");
    if (d && d.w) {
      if (d.w === 1080 || d.h === 1080) hints.push("أحد أبعادها 1080 بكسل، وهو المقاس المعتاد لصور <strong>إنستغرام</strong>.");
      if (Math.max(d.w, d.h) === 1600 || Math.max(d.w, d.h) === 1280) hints.push("أكبر أبعادها 1600 أو 1280 بكسل، وهي مقاسات شائعة لصور <strong>واتساب وتليغرام</strong> المضغوطة.");
    }
    return hints;
  }

  window.ImgMeta = { read, group, risk, strip, sha256, dims, sniff, sourceHints, fmtValue, LABELS, crc32 };
})();
