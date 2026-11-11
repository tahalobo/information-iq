/* ==========================================================
   فحص بيانات المنشأ: ماذا يقول الملف نفسه عن مصدره؟
   C2PA / Content Credentials، وسم IPTC DigitalSourceType، بصمات المولّدات،
   بارامترات Stable Diffusion وComfyUI، وبصمات منصات التواصل.

   قاعدة أساسية: اسم المولّد لا يُعتمد إلا إذا ورد في حقل «أداة» (Software،
   CreatorTool، مولّد C2PA…)، ولا يُبحث عنه في التعليقات والأوصاف الحرة،
   حتى لا تُتَّهم صورة صحفية حقيقية وصفُها «رئيس OpenAI…» بأنها مولّدة.
   ========================================================== */
(function () {
  "use strict";

  /* أدوات التوليد: تُطابَق مع حقول الأدوات فقط */
  const GENERATORS = [
    ["Midjourney", /midjourney/i],
    ["OpenAI (ChatGPT / DALL·E / GPT-image / Sora)", /dall[\s·.\-_]?e\b|openai|chatgpt|gpt-4o|gpt[\s-]?image|\bsora\b/i],
    ["Adobe Firefly", /firefly/i],
    ["Google (Gemini / Imagen)", /google ai|google generative|\bimagen\b|gemini|nano[\s-]?banana|\bveo\b/i],
    ["Microsoft (Bing / Designer / Copilot)", /bing image creator|microsoft designer|copilot|azure openai|responsible ai image provenance/i],
    ["Meta AI", /meta ai|imagined with ai/i],
    ["Stable Diffusion", /stable[\s_-]?diffusion|sdxl|stability[\s.]?ai|dreamstudio|automatic1111|a1111|sd[\s-]?forge|sd[\s-]?next|swarmui|draw things/i],
    ["ComfyUI", /comfyui/i],
    ["FLUX (Black Forest Labs)", /black[\s_-]?forest[\s_-]?labs|flux[\s._-]?(1|2|dev|pro|schnell|kontext)/i],
    ["Leonardo.ai", /leonardo[\s.]?ai/i],
    ["Ideogram", /ideogram/i],
    ["NovelAI", /novelai/i],
    ["InvokeAI", /invoke\s?ai/i],
    ["Fooocus", /fooocus/i],
    ["Grok (xAI)", /\bgrok\b|\bx\.?ai\b/i],
    ["Runway", /runwayml|runway gen/i],
    ["Kling", /kling ?ai/i],
    ["ByteDance (Seedream / Doubao)", /seedream|bytedance|doubao|jimeng|dreamina/i],
    ["Krea", /\bkrea\b/i],
    ["Playground AI", /playground ?ai|playground v\d/i],
    ["NightCafe", /nightcafe/i],
    ["Canva (Magic Media)", /magic media|dream lab/i],
    ["Qwen / Tongyi", /qwen|tongyi|wanx/i],
    ["Hunyuan", /hunyuan/i],
    ["Recraft", /recraft/i],
    ["Freepik AI", /pikaso|freepik (ai|mystic)/i],
    ["Apple Image Playground", /image playground/i],
    ["Samsung Galaxy AI", /galaxy ai/i]
  ];
  /* عبارات صريحة فقط في حقل «الاعتماد» (Credit) */
  const CREDIT_AI = /made with (google )?ai|imagined with ai|edited with (google )?ai|generated (with|by) ai|ai[\s-]generated|image playground|made with ai/i;
  /* برامج تعديل: معلومة محايدة */
  const EDITORS = [
    ["Adobe Photoshop", /photoshop/i], ["Adobe Lightroom", /lightroom/i], ["GIMP", /\bgimp\b/i], ["Canva", /canva/i], ["Snapseed", /snapseed/i],
    ["PicsArt", /picsart/i], ["Pixelmator", /pixelmator/i], ["Affinity Photo", /affinity/i], ["Capture One", /capture one/i], ["Paint.NET", /paint\.net/i],
    ["Meitu", /meitu/i], ["VSCO", /vsco/i], ["Darktable", /darktable/i], ["Luminar", /luminar/i], ["Photoscape", /photoscape/i], ["Krita", /krita/i]
  ];
  /* تطبيقات تحسين وتعديل بالذكاء الاصطناعي: الصورة قد تكون حقيقية لكنها عولجت بنموذج توليدي */
  const AI_EDITORS = [["Remini", /remini/i], ["Topaz", /topaz/i], ["FaceApp", /faceapp/i], ["Lensa", /lensa/i], ["Facetune", /facetune/i], ["Magnific", /magnific/i], ["Upscayl", /upscayl/i], ["Real-ESRGAN", /esrgan/i]];

  const latin1 = (u8) => { let s = ""; for (let i = 0; i < u8.length; i += 8192) s += String.fromCharCode.apply(null, u8.subarray(i, i + 8192)); return s; };
  const utf8 = (u8) => new TextDecoder("utf-8").decode(u8);
  const ascii = (d, i, n) => latin1(d.subarray(i, i + n));
  const clean = (s) => String(s == null ? "" : s).replace(/\0+/g, " ").replace(/\s+/g, " ").trim();

  async function inflate(u8) {
    try {
      const ds = new DecompressionStream("deflate");
      return new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(ds)).arrayBuffer());
    } catch { return new Uint8Array(0); }
  }

  /* ---------- قارئ TIFF/EXIF مصغّر: حقول الأدوات والوصف فقط ---------- */
  function tiffTags(t) {
    const out = {}; if (!t || t.length < 12) return out;
    if (ascii(t, 0, 4) === "Exif") t = t.subarray(6);
    const le = t[0] === 0x49 && t[1] === 0x49; if (!le && !(t[0] === 0x4D && t[1] === 0x4D)) return out;
    const u16 = (o) => (le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]);
    const u32 = (o) => (le ? t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24) : (t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]) >>> 0;
    if (u16(2) !== 42) return out;
    const NAMES = { 0x10E: "ImageDescription", 0x10F: "Make", 0x110: "Model", 0x131: "Software", 0x13B: "Artist", 0x13C: "HostComputer", 0x8298: "Copyright", 0x9286: "UserComment", 0x9C9C: "XPComment", 0x927C: "MakerNote" };
    const utf16 = (b, little) => { let s = ""; for (let i = 0; i + 1 < b.length; i += 2) s += String.fromCharCode(little ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]); return s; };
    const readable = (s) => (s.match(/[\x20-\x7E؀-ۿ]/g) || []).length;
    const ifd = (off, depth) => {
      if (!off || off + 2 > t.length) return; const n = u16(off);
      for (let k = 0; k < n; k++) {
        const e = off + 2 + k * 12; if (e + 12 > t.length) break;
        const tag = u16(e), type = u16(e + 2), cnt = u32(e + 4);
        if (tag === 0x8769) { if (depth < 2) ifd(u32(e + 8), depth + 1); continue; }
        const name = NAMES[tag]; if (!name) continue;
        if (name === "MakerNote") { out.MakerNote = cnt; continue; }
        const size = cnt * (type === 3 ? 2 : type === 4 ? 4 : 1); const p = size <= 4 ? e + 8 : u32(e + 8);
        if (p + size > t.length || size > 60000) continue;
        let b = t.subarray(p, p + size), s;
        if (tag === 0x9286) {
          const head = ascii(b, 0, 8); b = b.subarray(8);
          if (/^UNICODE/.test(head)) { const a = utf16(b, true), c = utf16(b, false); s = readable(a) >= readable(c) ? a : c; } else s = utf8(b);
        } else if (tag === 0x9C9C) s = utf16(b, true);
        else s = utf8(b);
        s = clean(s); if (s) out[name] = s;
      }
    };
    try { ifd(u32(4), 0); } catch { /* malformed EXIF */ }
    return out;
  }

  /* ---------- IPTC-IIM (داخل APP13) ---------- */
  function iptcTags(b) {
    const out = {}; const NAMES = { 5: "Title", 40: "SpecialInstructions", 65: "Program", 80: "Byline", 110: "Credit", 115: "Source", 116: "Copyright", 120: "Caption" };
    for (let i = 0; i + 5 < b.length; i++) {
      if (b[i] !== 0x1C || b[i + 1] !== 2) continue;
      const id = b[i + 2], len = (b[i + 3] << 8) | b[i + 4]; if (len > 32000 || i + 5 + len > b.length) continue;
      if (NAMES[id] && !out[NAMES[id]]) out[NAMES[id]] = clean(utf8(b.subarray(i + 5, i + 5 + len)));
      i += 4 + len;
    }
    return out;
  }

  /* ---------- XMP: قيمة خاصية بالاسم (سمة أو عنصر) ---------- */
  const unxml = (s) => clean(s.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, "&"));
  function xmpVals(x, name) {
    const out = []; if (!x) return out; let m;
    const a = new RegExp(`[\\w-]+:${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`, "gi");
    while ((m = a.exec(x))) out.push(unxml(m[1] != null ? m[1] : m[2]));
    const e = new RegExp(`<([\\w-]+:${name})(?:\\s[^>]*)?>([\\s\\S]{0,4000}?)</\\1>`, "gi");
    while ((m = e.exec(x))) out.push(unxml(m[2]));
    return [...new Set(out.filter(Boolean))];
  }

  /* ---------- تقسيم الملف إلى مناطق ميتاداتا (بلا بيانات البكسلات) ---------- */
  async function segments(d) {
    const M = { kind: "other", tiff: null, xmp: "", iptc: {}, png: {}, c2pa: "", comments: [] };
    const pngText = (k, v) => { k = clean(k); if (k && M.png[k] == null) M.png[k] = v; if (/^XML:com\.adobe\.xmp$/i.test(k)) M.xmp += v; };
    if (d[0] === 0xFF && d[1] === 0xD8) {
      M.kind = "jpeg"; let i = 2;
      while (i + 4 < d.length) {
        if (d[i] !== 0xFF) break;
        const m = d[i + 1];
        if (m === 0xDA || m === 0xD9) break;
        if (m === 0x01 || (m >= 0xD0 && m <= 0xD7)) { i += 2; continue; }
        const len = (d[i + 2] << 8) | d[i + 3]; const b = d.subarray(i + 4, i + 2 + len);
        if (m === 0xE1) {
          const head = ascii(b, 0, 36);
          if (head.startsWith("Exif")) { if (!M.tiff) M.tiff = b; }
          else if (head.startsWith("http://ns.adobe.com/xap/1.0/")) M.xmp += utf8(b.subarray(29));
          else if (head.startsWith("http://ns.adobe.com/xmp/extension/")) M.xmp += utf8(b.subarray(75));
        } else if (m === 0xED) Object.assign(M.iptc, iptcTags(b));
        else if (m === 0xEB) M.c2pa += latin1(b.subarray(8));
        else if (m === 0xFE) M.comments.push(clean(utf8(b)));
        i += 2 + len;
      }
    } else if (d[0] === 0x89 && ascii(d, 1, 3) === "PNG") {
      M.kind = "png"; let i = 8;
      while (i + 12 <= d.length) {
        const len = ((d[i] << 24) >>> 0) + (d[i + 1] << 16) + (d[i + 2] << 8) + d[i + 3];
        const type = ascii(d, i + 4, 4); const b = d.subarray(i + 8, i + 8 + len);
        if (type === "tEXt") { const z = b.indexOf(0); if (z > 0) pngText(latin1(b.subarray(0, z)), utf8(b.subarray(z + 1))); }
        else if (type === "zTXt") { const z = b.indexOf(0); if (z > 0) pngText(latin1(b.subarray(0, z)), utf8(await inflate(b.subarray(z + 2)))); }
        else if (type === "iTXt") {
          const z = b.indexOf(0); if (z > 0) { const flag = b[z + 1]; let p = z + 3; for (let k = 0; k < 2; k++) p = b.indexOf(0, p) + 1; pngText(latin1(b.subarray(0, z)), utf8(flag === 1 ? await inflate(b.subarray(p)) : b.subarray(p))); }
        } else if (type === "eXIf") M.tiff = b;
        else if (type === "caBX") M.c2pa += latin1(b);
        i += 12 + len;
        if (type === "IEND") break;
      }
    } else if (ascii(d, 0, 4) === "RIFF" && ascii(d, 8, 4) === "WEBP") {
      M.kind = "webp"; let i = 12;
      while (i + 8 <= d.length) {
        const type = ascii(d, i, 4); const size = (d[i + 4] | (d[i + 5] << 8) | (d[i + 6] << 16) | (d[i + 7] << 24)) >>> 0; const b = d.subarray(i + 8, i + 8 + size);
        if (type === "EXIF") M.tiff = b; else if (type === "XMP ") M.xmp += utf8(b); else if (type === "C2PA") M.c2pa += latin1(b);
        i += 8 + size + (size & 1);
      }
    } else {
      // HEIC / AVIF / TIFF / GIF…: الميتاداتا قرب بداية الملف أو نهايته
      M.kind = ascii(d, 4, 4) === "ftyp" ? (/avif/.test(ascii(d, 8, 12)) ? "avif" : "heif") : ascii(d, 0, 3) === "GIF" ? "gif" : (d[0] === 0x49 && d[1] === 0x49) || (d[0] === 0x4D && d[1] === 0x4D) ? "tiff" : "other";
      const raw = latin1(d.subarray(0, Math.min(d.length, 800000))) + (d.length > 800000 ? latin1(d.subarray(Math.max(800000, d.length - 400000))) : "");
      const x = raw.match(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/g); if (x) M.xmp = x.join("\n");
      if (/jumd[\s\S]{0,64}c2pa/.test(raw)) M.c2pa = raw;
      if (M.kind === "tiff") M.tiff = d.subarray(0, Math.min(d.length, 800000));
      else { const e = raw.search(/Exif\0\0(II\*\0|MM\0\*)/); if (e >= 0) M.tiff = d.subarray(e, Math.min(d.length, e + 200000)); }
    }
    return M;
  }

  /* ---------- C2PA: قراءة نصوص CBOR بعد مفتاح معيّن ---------- */
  function cborStrings(s, key, from = 0, limit = 8) {
    const i = s.indexOf(key, from); if (i < 0) return [];
    let p = i + key.length; const out = []; const end = Math.min(s.length, p + 600);
    while (p < end && out.length < limit) {
      const b = s.charCodeAt(p);
      if (b >= 0x60 && b <= 0x77) { const n = b - 0x60; out.push(s.substr(p + 1, n)); p += 1 + n; }
      else if (b === 0x78) { const n = s.charCodeAt(p + 1); out.push(s.substr(p + 2, n)); p += 2 + n; }
      else if ((b >= 0x80 && b <= 0xBF) || (b >= 0x00 && b <= 0x17)) p++;
      else break;
    }
    return out.filter((x) => /^[\x20-\x7E]+$/.test(x));
  }
  const C2PA_ACTIONS = {
    created: "إنشاء", opened: "فتح ملف سابق", placed: "إدراج عنصر", edited: "تعديل", cropped: "قص", resized: "تغيير الحجم", color_adjustments: "تعديل ألوان", filtered: "فلتر",
    drawing: "رسم", converted: "تحويل صيغة", transcoded: "إعادة ترميز", published: "نشر", repackaged: "إعادة تحزيم", removed: "حذف عنصر", watermarked: "علامة مائية", redacted: "حجب", orientation: "تدوير"
  };
  function c2paInfo(s) {
    if (!s || !/jumd[\s\S]{0,64}c2pa/.test(s)) return null;
    const out = { generator: "", agents: [], sourceTypes: [], actions: [], signers: [] };
    const info = cborStrings(s, "claim_generator_info", 0, 12); const parts = [];
    for (let k = 0; k < info.length - 1; k++) if (info[k] === "name" || info[k] === "version") parts.push(info[k + 1]);
    out.generator = (parts.length ? parts.join(" ") : (cborStrings(s, "claim_generator", 0, 1)[0] || "")).replace(/_/g, " ");
    for (let at = s.indexOf("softwareAgent"); at >= 0 && out.agents.length < 6; at = s.indexOf("softwareAgent", at + 13)) {
      const v = cborStrings(s, "softwareAgent", at, 4).filter((x) => !/^(name|version)$/.test(x))[0];
      if (v && !out.agents.includes(v)) out.agents.push(v);
    }
    let m; const st = /digitalsourcetype\/([a-z]+)/gi; while ((m = st.exec(s))) if (!out.sourceTypes.includes(m[1])) out.sourceTypes.push(m[1]);
    const ac = /c2pa\.(created|opened|placed|edited|cropped|resized|color_adjustments|filtered|drawing|converted|transcoded|published|repackaged|removed|watermarked|redacted|orientation)\b/g;
    while ((m = ac.exec(s))) if (!out.actions.includes(m[1])) out.actions.push(m[1]);
    // جهة التوقيع: حقل Organization (OID 2.5.4.10) في شهادة X.509
    const org = /\x06\x03\x55\x04\x0A[\x0C\x13\x16]([\s\S])/g;
    while ((m = org.exec(s)) && out.signers.length < 4) {
      const n = m[1].charCodeAt(0); const v = s.substr(m.index + 7, n);
      if (n < 80 && /^[\x20-\x7E]+$/.test(v) && !out.signers.includes(v)) out.signers.push(v);
    }
    return out;
  }

  /* ---------- بارامترات التوليد ---------- */
  function parseA1111(t) {
    if (!t) return null; const at = t.search(/Steps:\s*\d+/); if (at < 0) return null;
    const get = (k) => (t.slice(at).match(new RegExp("(?:^|,\\s*)" + k + ":\\s*([^,\\n]+)")) || [])[1];
    const d = { steps: get("Steps"), sampler: get("Sampler"), cfg: get("CFG scale"), seed: get("Seed"), model: get("Model"), size: get("Size") };
    if (!(d.sampler || d.cfg || d.seed)) return null;
    const head = t.slice(0, at); const neg = head.indexOf("Negative prompt:");
    d.prompt = clean(neg >= 0 ? head.slice(0, neg) : head).slice(0, 700);
    d.negative = neg >= 0 ? clean(head.slice(neg + 16)).slice(0, 300) : "";
    return d;
  }
  function parseComfy(t) {
    if (!t || !/"class_type"/.test(t)) return null;
    const texts = []; const re = /"text"\s*:\s*"((?:[^"\\]|\\.){3,900})"/g; let m;
    while ((m = re.exec(t)) && texts.length < 6) texts.push(m[1].replace(/\\n/g, " ").replace(/\\"/g, '"'));
    const pick = (k) => (t.match(new RegExp(`"${k}"\\s*:\\s*("?)([^",\\]}]+)\\1`)) || [])[2];
    const longest = texts.sort((a, b) => b.length - a.length)[0] || "";
    return { prompt: clean(longest).slice(0, 700), steps: pick("steps"), sampler: pick("sampler_name"), cfg: pick("cfg"), seed: pick("seed") || pick("noise_seed"), model: pick("ckpt_name") || pick("unet_name") };
  }

  const ST_RANK = ["trainedalgorithmicmedia", "compositewithtrainedalgorithmicmedia", "compositesynthetic", "algorithmicmedia", "digitalcapture", "computationalcapture", "negativefilm", "positivefilm", "print", "minorhumanedits", "humanedits", "compositecapture", "digitalart", "digitalcreation", "virtualrecording", "datadrivenmedia", "screencapture"];
  const ST_KIND = { trainedalgorithmicmedia: "ai", compositewithtrainedalgorithmicmedia: "composite-ai", compositesynthetic: "composite", algorithmicmedia: "algorithmic", digitalcapture: "capture", computationalcapture: "capture", negativefilm: "capture", positivefilm: "capture", screencapture: "screen", digitalart: "art", digitalcreation: "art", minorhumanedits: "edited", humanedits: "edited", compositecapture: "composite" };

  /* من أين جاء الملف؟ منصات التواصل تحذف الميتاداتا وتعيد الضغط */
  function platformOf(name, M) {
    const n = name || "";
    if (/^FBMD/i.test(M.iptc.SpecialInstructions || "")) return { name: "فيسبوك أو إنستغرام", why: "وسم FBMD الذي تضيفه خوادم ميتا عند الرفع" };
    if (/WhatsApp Image|^IMG-\d{8}-WA\d+/i.test(n)) return { name: "واتساب", why: "اسم الملف" };
    if (/^photo_\d{4}-\d\d-\d\d[_ ]\d\d-\d\d-\d\d|^photo_\d+@\d\d-\d\d-\d{4}/i.test(n)) return { name: "تيليغرام", why: "اسم الملف" };
    if (/^FB_IMG_\d+/i.test(n)) return { name: "فيسبوك", why: "اسم الملف" };
    if (/^signal-\d{4}-\d\d-\d\d/i.test(n)) return { name: "سيغنال", why: "اسم الملف" };
    if (/^(screenshot|screen shot|screen_shot|لقطة)/i.test(n) || /^Screenshot/i.test(M.exif.UserComment || "") || /screenshot/i.test(M.png.Software || "")) return { name: "لقطة شاشة", why: "اسم الملف أو وسم داخله", screenshot: true };
    return null;
  }

  /**
   * @param {Uint8Array} d bytes of the file
   * @param {{name?: string}} [opt]
   */
  async function provenance(d, opt = {}) {
    const M = await segments(d);
    M.exif = tiffTags(M.tiff);
    const out = { kind: M.kind, c2pa: c2paInfo(M.c2pa), sourceType: null, sourceTypeRaw: "", sourceTypeFrom: "", generators: [], aiEditors: [], editors: [], prompt: "", details: null, software: "", credit: "", platform: null, exif: M.exif, fields: [] };
    const X = (n) => xmpVals(M.xmp, n);

    // 1) حقول «الأداة»: هنا فقط يُبحث عن أسماء المولّدات
    const tools = [];
    const tool = (label, v) => { v = clean(v); if (v && v.length <= 300) tools.push({ label, v }); };
    tool("EXIF Software", M.exif.Software); tool("EXIF HostComputer", M.exif.HostComputer);
    X("CreatorTool").forEach((v) => tool("XMP CreatorTool", v)); X("softwareAgent").forEach((v) => tool("XMP softwareAgent", v));
    X("AISystemUsed").forEach((v) => tool("IPTC AISystemUsed", v)); X("AISystemVersionUsed").forEach((v) => tool("IPTC AISystemVersionUsed", v));
    X("Software").forEach((v) => tool("XMP Software", v));
    tool("IPTC Originating Program", M.iptc.Program);
    ["Software", "software", "Source", "generator", "Generator"].forEach((k) => tool("PNG " + k, M.png[k]));
    if (out.c2pa) { tool("C2PA claim generator", out.c2pa.generator); out.c2pa.agents.forEach((v) => tool("C2PA softwareAgent", v)); }
    const addGen = (name, where, value) => { if (!out.generators.some((g) => g.name === name)) out.generators.push({ name, where, value: clean(value).slice(0, 120) }); };
    for (const t of tools) {
      for (const [name, re] of GENERATORS) if (re.test(t.v)) addGen(name, t.label, t.v);
      for (const [name, re] of AI_EDITORS) if (re.test(t.v) && !out.aiEditors.some((e) => e.name === name)) out.aiEditors.push({ name, where: t.label });
      for (const [name, re] of EDITORS) if (re.test(t.v) && !out.editors.some((e) => e.name === name)) out.editors.push({ name, where: t.label, value: t.v });
    }
    out.software = (tools.find((t) => /Software|CreatorTool|Program/.test(t.label)) || {}).v || "";

    // 2) حقل الاعتماد: عبارات صريحة فقط
    const credits = [M.iptc.Credit, ...X("Credit")].map(clean).filter(Boolean);
    out.credit = credits[0] || "";
    for (const c of credits) if (CREDIT_AI.test(c)) {
      const g = GENERATORS.find(([, re]) => re.test(c));
      addGen(g ? g[0] : "أداة ذكاء اصطناعي (غير محددة)", "حقل الاعتماد Credit", c);
    }

    // 3) نوع المصدر الرقمي (IPTC DigitalSourceType)
    const stVals = [...X("DigitalSourceType").map((v) => ["XMP / IPTC", v]), ...(out.c2pa ? out.c2pa.sourceTypes.map((v) => ["C2PA", v]) : [])]
      .map(([from, v]) => [from, v.toLowerCase().replace(/^.*\//, "")]).filter(([, v]) => ST_KIND[v]);
    stVals.sort((a, b) => ST_RANK.indexOf(a[1]) - ST_RANK.indexOf(b[1]));
    if (stVals.length) { out.sourceTypeRaw = stVals[0][1]; out.sourceType = ST_KIND[stVals[0][1]]; out.sourceTypeFrom = stVals[0][0]; }

    // 4) بارامترات التوليد داخل الملف
    const paramTexts = [["PNG parameters", M.png.parameters], ["EXIF UserComment", M.exif.UserComment], ["PNG Comment", M.png.Comment], ["EXIF ImageDescription", M.exif.ImageDescription], ...M.comments.map((c) => ["JPEG comment", c])];
    for (const [where, t] of paramTexts) { const a = parseA1111(t); if (a) { out.details = { ...a, where }; out.prompt = a.prompt; addGen("Stable Diffusion", where, "بارامترات توليد (Steps / Sampler / Seed)"); break; } }
    const comfyText = [M.png.prompt, M.png.workflow, /"class_type"/.test(M.exif.UserComment || "") ? M.exif.UserComment : ""].filter(Boolean).join("\n");
    if (/"class_type"|"nodes"\s*:\s*\[/.test(comfyText)) {
      addGen("ComfyUI", "PNG prompt / workflow", "مخطط عمل ComfyUI");
      const c = parseComfy(comfyText); if (c && !out.details) { out.details = { ...c, where: "ComfyUI workflow" }; out.prompt = c.prompt; }
    }
    if (M.png.invokeai_metadata || M.png.invokeai_graph || M.png["sd-metadata"] || M.png.Dream) addGen("InvokeAI", "PNG invokeai_metadata", "بيانات توليد InvokeAI");
    if (M.png.fooocus_scheme || /"fooocus/i.test(M.png.parameters || "")) addGen("Fooocus", "PNG fooocus_scheme", "بيانات توليد Fooocus");
    if (M.png.sui_image_params || /sui_image_params/.test(M.png.parameters || "")) addGen("Stable Diffusion", "PNG parameters", "بيانات توليد SwarmUI");
    if (/novelai/i.test(M.png.Software || "") && M.png.Comment) { const m = M.png.Comment.match(/"prompt"\s*:\s*"((?:[^"\\]|\\.){3,700})"/); if (m && !out.prompt) out.prompt = m[1]; }
    // Midjourney يكتب الأمر النصي ثم «Job ID: <uuid>» في حقل الوصف
    for (const [where, t] of [["PNG Description", M.png.Description], ["XMP description", X("description")[0]], ["EXIF ImageDescription", M.exif.ImageDescription], ["IPTC Caption", M.iptc.Caption]]) {
      const m = t && t.match(/^([\s\S]*?)\s*Job ID:\s*[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
      if (m) { addGen("Midjourney", where, "Job ID"); if (!out.prompt) out.prompt = clean(m[1]).slice(0, 700); break; }
    }
    const aiPrompt = X("AIPromptInformation")[0]; if (aiPrompt && !out.prompt) out.prompt = aiPrompt.slice(0, 700);

    out.platform = platformOf(opt.name, M);

    // 5) جدول «كل ما وجدناه» للتقرير
    const F = (k, v) => { v = clean(v); if (v) out.fields.push([k, v.length > 400 ? v.slice(0, 400) + "…" : v]); };
    tools.forEach((t) => F(t.label, t.v));
    F("EXIF Make", M.exif.Make); F("EXIF Model", M.exif.Model); F("EXIF Artist", M.exif.Artist); F("EXIF Copyright", M.exif.Copyright);
    F("EXIF ImageDescription", M.exif.ImageDescription); F("EXIF UserComment", M.exif.UserComment);
    F("IPTC Credit", M.iptc.Credit); F("IPTC Source", M.iptc.Source); F("IPTC Byline", M.iptc.Byline); F("IPTC Caption", M.iptc.Caption);
    X("Credit").forEach((v) => F("XMP Credit", v)); X("DigitalSourceType").forEach((v) => F("XMP DigitalSourceType", v));
    Object.keys(M.png).filter((k) => !/^XML:com\.adobe\.xmp$|^Raw profile/i.test(k)).slice(0, 12).forEach((k) => F("PNG " + k, M.png[k]));
    M.comments.forEach((c) => F("JPEG comment", c));
    out.hasMakerNote = !!M.exif.MakerNote; out.hasXmp = !!M.xmp; out.hasIptc = Object.keys(M.iptc).length > 0;
    return out;
  }

  window.Provenance = { provenance, C2PA_ACTIONS, GENERATORS };
})();
