/* ==========================================================
   مكتبة الصور: قراءة الميتاداتا وإزالتها بلا فقدان للجودة
   تعمل بالكامل داخل المتصفح.
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

  /* ---------- Lossless stripping ---------- */
  function concat(parts) {
    const len = parts.reduce((a, p) => a + p.length, 0); const out = new Uint8Array(len); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; } return out;
  }
  const ascii = (d, i, n) => String.fromCharCode(...d.subarray(i, i + n));

  function minimalOrientationExif(o) {
    // APP1 "Exif\0\0" + little-endian TIFF with a single IFD0 entry: Orientation
    const tiff = [0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00,
      0x12, 0x01, 0x03, 0x00, 0x01, 0x00, 0x00, 0x00, o & 0xFF, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00];
    const payload = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff];
    const len = payload.length + 2;
    return new Uint8Array([0xFF, 0xE1, (len >> 8) & 0xFF, len & 0xFF, ...payload]);
  }

  const APP_NAMES = { 0xE1: "EXIF / XMP", 0xE2: "ICC / FlashPix", 0xE3: "APP3", 0xEC: "Ducky", 0xED: "IPTC / Photoshop", 0xEE: "Adobe", 0xFE: "تعليق (COM)" };

  function stripJpeg(d, opts) {
    if (d[0] !== 0xFF || d[1] !== 0xD8) throw new Error("ليست JPEG صالحة");
    const parts = [d.subarray(0, 2)], removed = [];
    let i = 2, insertedOrient = false;
    const maybeInsertOrientation = () => {
      if (!insertedOrient && opts.orientation > 1 && opts.keepOrientation) { parts.push(minimalOrientationExif(opts.orientation)); insertedOrient = true; }
    };
    while (i < d.length) {
      if (d[i] !== 0xFF) throw new Error("بنية JPEG غير متوقعة");
      let m = d[i + 1];
      while (m === 0xFF) { i++; m = d[i + 1]; }
      if (m === 0xD8 || m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { parts.push(d.subarray(i, i + 2)); i += 2; continue; }
      if (m === 0xD9) { parts.push(d.subarray(i, i + 2)); break; }
      if (m === 0xDA) { maybeInsertOrientation(); parts.push(d.subarray(i)); break; }
      const len = (d[i + 2] << 8) | d[i + 3];
      const seg = d.subarray(i, i + 2 + len);
      let keep = true;
      if ((m >= 0xE1 && m <= 0xEF) || m === 0xFE) {
        keep = false;
        if (m === 0xE2 && opts.keepICC && ascii(d, i + 4, 11) === "ICC_PROFILE") keep = true;
        if (m === 0xEE && ascii(d, i + 4, 5) === "Adobe") keep = true; // affects colour decoding (CMYK/YCC)
      }
      if (m === 0xE0) keep = true; // JFIF header
      if (keep) {
        // place orientation right after APP0/JFIF (or before first non-APP segment)
        if (!(m >= 0xE0 && m <= 0xEF)) maybeInsertOrientation();
        parts.push(seg);
      } else removed.push(APP_NAMES[m] || `APP${m - 0xE0}`);
      i += 2 + len;
    }
    return { bytes: concat(parts), removed };
  }

  function stripPng(d, opts) {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!sig.every((b, k) => d[k] === b)) throw new Error("ليست PNG صالحة");
    const parts = [d.subarray(0, 8)], removed = [];
    const drop = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "tIME", "dSIG"]);
    if (!opts.keepICC) drop.add("iCCP");
    let i = 8;
    while (i + 8 <= d.length) {
      const len = ((d[i] << 24) >>> 0) + (d[i + 1] << 16) + (d[i + 2] << 8) + d[i + 3];
      const type = ascii(d, i + 4, 4);
      const end = i + 12 + len;
      if (drop.has(type)) removed.push(type); else parts.push(d.subarray(i, end));
      i = end;
      if (type === "IEND") break;
    }
    return { bytes: concat(parts), removed };
  }

  function stripWebp(d, opts) {
    if (ascii(d, 0, 4) !== "RIFF" || ascii(d, 8, 4) !== "WEBP") throw new Error("ليست WebP صالحة");
    const parts = [], removed = []; let i = 12, vp8x = null;
    while (i + 8 <= d.length) {
      const type = ascii(d, i, 4);
      const size = d[i + 4] | (d[i + 5] << 8) | (d[i + 6] << 16) | (d[i + 7] << 24);
      const end = i + 8 + size + (size & 1);
      const chunk = d.slice(i, Math.min(end, d.length));
      if (type === "EXIF" || type === "XMP " || (type === "ICCP" && !opts.keepICC)) removed.push(type.trim());
      else { if (type === "VP8X") vp8x = chunk; parts.push(chunk); }
      i = end;
    }
    if (vp8x) {
      vp8x[8] &= ~(0x08 | 0x04); // clear EXIF & XMP flags
      if (!opts.keepICC) vp8x[8] &= ~0x20;
    }
    const body = concat(parts);
    const header = new Uint8Array(12); header.set(d.subarray(0, 12));
    const total = body.length + 4;
    header[4] = total & 0xFF; header[5] = (total >> 8) & 0xFF; header[6] = (total >> 16) & 0xFF; header[7] = (total >> 24) & 0xFF;
    return { bytes: concat([header, body]), removed };
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
    try {
      if (kind === "jpeg") { const r = stripJpeg(d, o); return { blob: new Blob([r.bytes], { type: "image/jpeg" }), removed: r.removed, method: "lossless", ext: "jpg" }; }
      if (kind === "png") { const r = stripPng(d, o); return { blob: new Blob([r.bytes], { type: "image/png" }), removed: r.removed, method: "lossless", ext: "png" }; }
      if (kind === "webp") { const r = stripWebp(d, o); return { blob: new Blob([r.bytes], { type: "image/webp" }), removed: r.removed, method: "lossless", ext: "webp" }; }
    } catch (e) { /* fall back to re-encoding */ }
    const isPngish = kind === "gif" || kind === "png" || file.type === "image/bmp";
    const type = isPngish ? "image/png" : "image/jpeg";
    try {
      const blob = await reencode(file, type);
      return { blob, removed: ["كل البيانات (إعادة ترميز)"], method: "reencode", ext: isPngish ? "png" : "jpg" };
    } catch (e) {
      const err = new Error(kind === "heic" ? "صيغة HEIC لا يدعمها هذا المتصفح للتعديل. حوّل الصورة إلى JPG أولاً، أو التقط صورك بصيغة «الأكثر توافقاً» من إعدادات الكاميرا." : "تعذّر معالجة هذا الملف في المتصفح.");
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

  window.ImgMeta = { read, group, risk, strip, sha256, dims, sniff, sourceHints, fmtValue, LABELS };
})();
