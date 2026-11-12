/* ==========================================================
   أدوات النص العربي والكابشن
   كل المعالجة داخل المتصفح. المحرّك (TextKit) دوال صِرفة بلا واجهة،
   ومتاح على window.TextKit للاختبار من الكونسول.
   ملاحظة: لا نستعمل lookbehind في التعابير النمطية حتى تعمل الصفحة على سفاري القديم.
   ========================================================== */
(function () {
  "use strict";
  const { $, $$, esc, ic, icons, copy, store, fmtNum, toast, debounce } = App;
  const S = window.SITE || {};
  const t = $("#t");

  /* ==========================================================
     1) المحرّك
     ========================================================== */
  const segmenter = typeof Intl !== "undefined" && Intl.Segmenter ? new Intl.Segmenter("ar", { granularity: "grapheme" }) : null;
  // المحرف المرئي (grapheme): الحرف مع حركاته، أو الإيموجي المركّب كاملاً
  const graphemes = (s) => segmenter ? Array.from(segmenter.segment(s), (x) => x.segment)
    : (s.match(/[\s\S][\p{M}️\u{1F3FB}-\u{1F3FF}]*(?:‍[\s\S][\p{M}️]*)*/gu) || []);

  const AR = "\\u0621-\\u064A\\u066E-\\u06D3\\u06D5\\u06FA-\\u06FF\\u0750-\\u077F";
  // حركات وعلامات ضبط؛ تُستثنى رموز المصحف المستقلة ۝ ۞ ۩ والحرفان الصغيران ۥ ۦ
  const MARKS = "\\u0610-\\u061A\\u064B-\\u065F\\u0670\\u06D6-\\u06DC\\u06DF-\\u06E4\\u06E7\\u06E8\\u06EA-\\u06ED\\u08D3-\\u08E1\\u08E3-\\u08FF";
  const HARAKAT = new RegExp("[" + MARKS + "]", "g");
  const HARAKAT_NO_SHADDA = new RegExp("[" + MARKS.replace("\\u064B-\\u065F", "\\u064B-\\u0650\\u0652-\\u065F") + "]", "g");
  const AR_LETTER = new RegExp("[" + AR + "\\uFB50-\\uFDFF\\uFE70-\\uFEFC]");
  const LAT_LETTER = /[A-Za-zÀ-ɏͰ-ϿЀ-ӿ]/;
  const WORDISH = /[\p{L}\p{N}]/u;

  const EMOJI_ANY = /\p{Extended_Pictographic}|[\u{1F1E6}-\u{1F1FF}]|[0-9#*]️?⃣/u;
  // إيموجي «حقيقي»: يستثني رموزاً نصية مثل © ® ™ ما لم تُتبَع بمحدِّد الإيموجي
  const isEmoji = (g) => /[\u{1F1E6}-\u{1F1FF}]|[0-9#*]️?⃣|\p{Emoji_Presentation}|\p{Extended_Pictographic}️/u.test(g)
    || (/\p{Extended_Pictographic}/u.test(g) && g.codePointAt(0) >= 0x231A);

  /* ---------- الروابط والمقاطع المحمية ---------- */
  const TLD = "com|net|org|iq|me|io|co|app|dev|info|tv|ly|gov|edu|news|xyz|ai|gg|link|page|site|online|store|shop|live|be|uk|de|fr|tr|ir|sa|ae|eg|jo|kw|qa|sy|lb|ru|us";
  const URL_RE = new RegExp("(?:https?:\\/\\/|www\\.)[^\\s<>\"«»]+|(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:" + TLD + ")(?![a-z0-9-])(?:[/?#][^\\s<>\"«»]*)?", "gi");
  function findUrls(s) {
    const out = []; URL_RE.lastIndex = 0; let m;
    while ((m = URL_RE.exec(s))) {
      let u = m[0]; const prev = s[m.index - 1] || "";
      if (!/^(?:https?:|www\.)/i.test(u) && /[@\w.\-]/.test(prev)) continue; // بريد إلكتروني أو جزء من كلمة
      u = u.replace(/[.,;:!?،؛؟)\]}»"'…]+$/, "");
      if (u.length < 4) continue;
      out.push({ i: m.index, text: u }); URL_RE.lastIndex = m.index + u.length;
    }
    return out;
  }
  const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
  const TAG_RE = /#[\p{L}\p{M}\p{N}_]+/gu;
  const AT_RE = /@[A-Za-z0-9_.]*[A-Za-z0-9_]/g;
  const LATNUM_RE = /[A-Za-z][A-Za-z0-9_]*[-_]?\d[\w.-]*|\d+[A-Za-z][\w.-]*/g;
  // مقاطع لا يجوز العبث بها: الروابط + ما يطابق التعابير المعطاة، مرتّبة وغير متداخلة
  function spans(s, res) {
    const all = findUrls(s);
    for (const re of res || []) { re.lastIndex = 0; let m; while ((m = re.exec(s))) { if (!m[0]) { re.lastIndex++; continue; } all.push({ i: m.index, text: m[0] }); } }
    all.sort((a, b) => a.i - b.i || b.text.length - a.text.length);
    const out = []; let end = 0;
    for (const x of all) if (x.i >= end) { out.push(x); end = x.i + x.text.length; }
    return out;
  }
  function mapText(s, sp, fn, sfn) {
    let out = "", p = 0;
    for (const u of sp) { out += fn(s.slice(p, u.i)) + (sfn ? sfn(u.text) : u.text); p = u.i + u.text.length; }
    return out + fn(s.slice(p));
  }
  const outsideUrls = (s, fn) => mapText(s, findUrls(s), fn);
  const tidy = (s) => s.replace(/[ \t]{2,}/g, " ").replace(/[ \t]+$/gm, "");

  /* ---------- العدّ ---------- */
  // طول منشور X بحسب twitter-text v3: أغلب الأحرف = 1، الإيموجي = 2، الرابط = 23، وما عداها (CJK وغيره) = 2
  function xWeighted(s) {
    s = s.normalize("NFC");
    let w = 0, cut = -1, p = 0;
    const add = (n, idx) => { w += n; if (w > 280 && cut < 0) cut = idx; };
    const text = (chunk, base) => {
      let off = base;
      for (const g of graphemes(chunk)) {
        let n = 0;
        if (EMOJI_ANY.test(g)) n = 2;
        else for (const ch of g) { const c = ch.codePointAt(0); n += (c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247)) ? 1 : 2; }
        add(n, off); off += g.length;
      }
    };
    for (const u of findUrls(s)) { text(s.slice(p, u.i), p); add(23, u.i); p = u.i + u.text.length; }
    text(s.slice(p), p);
    return { len: w, cut, text: s };
  }
  // الهاشتاغ المكوَّن من أرقام فقط لا تعدّه المنصات هاشتاغاً
  const tagsOf = (s) => (mapText(s, findUrls(s), (c) => c, () => " ").match(TAG_RE) || []).filter((x) => !/^#[\d٠-٩۰-۹_]+$/.test(x));
  function mentionsOf(s) {
    const out = []; const re = /(^|[^\w@./])(@[A-Za-z0-9_](?:[A-Za-z0-9_.]{0,28}[A-Za-z0-9_])?)/g; let m;
    while ((m = re.exec(s))) out.push(m[2]);
    return out;
  }
  function analyze(s) {
    const g = graphemes(s), urls = findUrls(s);
    const flat = mapText(s, urls, (c) => c, () => "U");
    const words = s.split(/\s+/).filter((w) => WORDISH.test(w)).length;
    const sentences = flat.replace(/([.!?؟…]+["'»)\]]*)(\s|$)/g, "$1\n").split("\n")
      .filter((p) => WORDISH.test(p.replace(/[#@][\p{L}\p{M}\p{N}_.]+/gu, ""))).length;
    return {
      graphemes: g.length, noSpace: g.filter((x) => !/^\s+$/.test(x)).length, words, sentences,
      lines: s ? s.split("\n").length : 0, paragraphs: s.split(/\n\s*\n/).filter((p) => p.trim()).length,
      cps: Array.from(s).length, u16: s.length, bytes: new TextEncoder().encode(s).length,
      x: xWeighted(s).len, tags: tagsOf(s), urls: urls.map((u) => u.text), mentions: mentionsOf(s),
      readSec: Math.round(words / 200 * 60), speakSec: Math.round(words / 130 * 60)
    };
  }

  /* ---------- المحارف غير المرئية ---------- */
  const INVIS_NAMES = { 0xAD: "SHY", 0xA0: "NBSP", 0x61C: "ALM", 0x200B: "ZWSP", 0x200C: "ZWNJ", 0x200D: "ZWJ", 0x200E: "LRM", 0x200F: "RLM", 0x202A: "LRE", 0x202B: "RLE", 0x202C: "PDF", 0x202D: "LRO", 0x202E: "RLO", 0x202F: "NNBSP", 0x2060: "WJ", 0x2066: "LRI", 0x2067: "RLI", 0x2068: "FSI", 0x2069: "PDI", 0x2800: "BLANK", 0x3164: "FILLER", 0xFEFF: "BOM" };
  const INVIS_REMOVE = /[­͏؜ᅟᅠ឴឵᠋-᠎​‎‏‪-‮⁠-⁤⁦-⁯ㅤ﻿ﾠ]|[\u{E0001}\u{E0020}-\u{E007F}]/gu;
  const INVIS_ANY = /[ ­͏؜ᅟᅠ᠋-᠎ -‏‪-  -⁤⁦-⁯⠀　ㅤ﻿ﾠ]|[\u{E0001}\u{E0020}-\u{E007F}]/gu;
  function invisibles(s) {
    const counts = {}; let total = 0;
    for (const g of graphemes(s)) {
      if (isEmoji(g)) continue;
      for (const m of g.match(INVIS_ANY) || []) { const c = m.codePointAt(0); const n = INVIS_NAMES[c] || "U+" + c.toString(16).toUpperCase(); counts[n] = (counts[n] || 0) + 1; total++; }
    }
    return { total, counts };
  }
  function revealInvisibles(s) {
    return graphemes(s).map((g) => isEmoji(g) ? esc(g) : esc(g).replace(INVIS_ANY, (m) => { const c = m.codePointAt(0); return `<i class="tx-inv">${INVIS_NAMES[c] || "U+" + c.toString(16).toUpperCase()}</i>`; })).join("");
  }
  function stripInvisibles(s) {
    const gs = graphemes(s);
    return gs.map((g, i) => {
      if (isEmoji(g)) return g;
      g = g.replace(INVIS_REMOVE, "");
      // ZWNJ و ZWJ مشروعان بين حرفين عربيين (الكردية والفارسية) فيبقيان هناك فقط
      if (/[‌‍]/.test(g)) {
        const keep = AR_LETTER.test(g[0]) && AR_LETTER.test((gs[i + 1] || "")[0] || "");
        g = g.replace(/[‌‍]+/g, (m) => keep ? m[0] : "");
      }
      return g;
    }).join("");
  }

  /* ---------- التنظيف والتطبيع ---------- */
  const SMALLCAPS = "ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀsᴛᴜᴠᴡxʏᴢ";
  const FANCY = /[\u{1D400}-\u{1D7FF}①-⓿\u{1F110}-\u{1F16B}！-～ﭐ-﷿ﹰ-ﻼℊ-ℓℕℙ-ℝℤℨℬ-ℱℳℴ]/gu;
  const CLEAN = {
    unstyle: (s) => s.replace(FANCY, (c) => c.normalize("NFKC")).replace(/[ᴀʙᴄᴅᴇꜰɢʜɪᴊᴋʟᴍɴᴏᴘǫʀᴛᴜᴠᴡʏᴢ]/g, (c) => "abcdefghijklmnopqrstuvwxyz"[SMALLCAPS.indexOf(c)]),
    invisible: stripInvisibles,
    tashkeel: (s) => s.normalize("NFC").replace(HARAKAT, ""),
    tashkeelKeep: (s) => s.normalize("NFC").replace(HARAKAT_NO_SHADDA, ""),
    tatweel: (s) => s.replace(/[ \t]ـ+(?=[ \t])/g, "").replace(/ـ+/g, ""),
    persian: (s) => outsideUrls(s, (c) => c.replace(/ک/g, "ك").replace(/[یے]/g, "ي").replace(/ہ/g, "ه")),
    hamza: (s) => outsideUrls(s, (c) => c.replace(/[أإآٱ]/g, "ا")),
    yaa: (s) => outsideUrls(s, (c) => c.replace(new RegExp("ى([" + MARKS + "]*)(?![" + AR + "])", "g"), "ي$1")),
    taa: (s) => outsideUrls(s, (c) => c.replace(new RegExp("ة([" + MARKS + "]*)(?![" + AR + "])", "g"), "ه$1")),
    emoji: (s) => tidy(graphemes(s).filter((g) => !isEmoji(g)).join("")),
    links: (s) => tidy(mapText(s, findUrls(s), (c) => c, () => "").replace(/[ \t]+([.،؛؟!,;])/g, "$1")),
    punct: (s) => outsideUrls(s, (c) => c
      .replace(new RegExp("([" + AR + "][" + MARKS + "]*[ \\t]?)([,;?])", "g"), (m, a, p) => a + { ",": "،", ";": "؛", "?": "؟" }[p])
      .replace(/[ \t]+([،؛؟!])/g, "$1")
      .replace(new RegExp("([" + AR + "][" + MARKS + "]*)[ \\t]+\\.(?=\\s|$)", "g"), "$1.")
      .replace(/([،؛])(?=[\p{L}])/gu, "$1 ")
      .replace(new RegExp("([؟!.])(?=[" + AR + "])", "g"), "$1 ")),
    spaces: (s) => s.replace(/\r\n?/g, "\n").replace(/[\t   -   　]/g, " ").replace(/ {2,}/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").replace(/^\s+|\s+$/g, "")
  };
  // ترتيب التنفيذ مقصود: فكّ الزخرفة أولاً والمسافات آخراً
  const CLEAN_OPTS = [
    { id: "spaces", safe: 1, label: "المسافات الزائدة والأسطر الفارغة المتكررة", hint: "مسافة واحدة بين الكلمات، وسطر فارغ واحد بين الفقرات، وتحويل المسافة غير المنكسرة إلى عادية." },
    { id: "invisible", safe: 1, label: "المحارف غير المرئية", hint: "ZWSP و BOM وعلامات الاتجاه وأمثالها. تبقى الإيموجي المركّبة سليمة، ويبقى ZWNJ بين الحروف لأن الكردية والفارسية تحتاجه." },
    { id: "punct", safe: 1, label: "علامات الترقيم العربية ومسافاتها", hint: "تحويل , ; ? بعد الكلمة العربية إلى ، ؛ ؟ وحذف المسافة قبل العلامة وإضافتها بعدها. لا تُمَسّ الروابط ولا الأرقام." },
    { id: "tatweel", safe: 1, label: "إزالة التطويل (ـ)", hint: "الســـلام ← السلام." },
    { id: "tashkeel", label: "إزالة التشكيل كله", hint: "الفتحة والضمة والكسرة والسكون والتنوين والشدّة والألف الخنجرية. رموز المصحف مثل ۞ تبقى." },
    { id: "tashkeelKeep", label: "إزالة التشكيل مع إبقاء الشدّة", hint: "يحذف الحركات ويترك الشدّة لأنها تغيّر المعنى أحياناً." },
    { id: "unstyle", label: "إرجاع الأحرف المزخرفة إلى عادية", hint: "𝐇𝐞𝐥𝐥𝐨 و Ⓗⓔⓛⓛⓞ و Ｈｅｌｌｏ ← Hello، وأشكال العرض العربية القديمة (ﻻ ﷲ) إلى حروفها." },
    { id: "emoji", label: "إزالة الإيموجي", hint: "يحذف الإيموجي كاملاً مع مكوّناته (العائلة، العلم، لون البشرة، أرقام الأزرار) ويُبقي © و ™ النصيتين." },
    { id: "links", label: "إزالة الروابط", hint: "الروابط الكاملة والمختصرة مثل t.me/name." },
    { id: "persian", warn: 1, label: "حروف لوحة المفاتيح الفارسية ← عربية", hint: "ک ← ك، ی ← ي، ہ ← ه. لا تستعمله مع نص كردي أو فارسي أو أردي." },
    { id: "hamza", warn: 1, label: "توحيد الألف: أ إ آ ٱ ← ا", hint: "أحمد ← احمد." },
    { id: "yaa", warn: 1, label: "الألف المقصورة في آخر الكلمة: ى ← ي", hint: "على ← علي." },
    { id: "taa", warn: 1, label: "التاء المربوطة في آخر الكلمة: ة ← ه", hint: "مدرسة ← مدرسه." }
  ];
  const CLEAN_ORDER = ["unstyle", "invisible", "tashkeel", "tashkeelKeep", "tatweel", "persian", "hamza", "yaa", "taa", "emoji", "links", "punct", "spaces"];
  const runClean = (s, ids) => CLEAN_ORDER.filter((id) => ids.includes(id)).reduce((v, id) => CLEAN[id](v), s);

  /* ---------- الأرقام ---------- */
  const DIG = { arab: "٠١٢٣٤٥٦٧٨٩", pers: "۰۱۲۳۴۵۶۷۸۹" };
  const latinDigit = (d) => { const c = d.charCodeAt(0); return c >= 0x6F0 ? c - 0x6F0 : c >= 0x660 ? c - 0x660 : c - 48; };
  const NUM_PROTECT = [EMAIL_RE, /[@#][\p{L}\p{M}\p{N}_.]+/gu, LATNUM_RE];
  function convertDigits(s, to, seps) {
    if (to === "latn") {
      s = s.replace(/[٠-٩۰-۹]/g, (d) => latinDigit(d));
      if (seps) s = s.replace(/(\d)٫(?=\d)/g, "$1.").replace(/(\d)٬(?=\d)/g, "$1,").replace(/(\d ?)٪/g, "$1%");
      return s;
    }
    const set = DIG[to];
    return mapText(s, spans(s, NUM_PROTECT), (c) => {
      if (seps) {
        c = c.replace(/[٠-٩۰-۹]/g, (d) => latinDigit(d))
          .replace(/\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+/g, (m, off, str) => {
            // التواريخ والإصدارات (12.05.2024) ليست أعداداً عشرية
            if (/^\.\d/.test(str.slice(off + m.length, off + m.length + 2)) || str[off - 1] === ".") return m;
            return m.replace(/,/g, "٬").replace(".", "٫");
          })
          .replace(/(\d ?)%/g, "$1٪");
      }
      return c.replace(/[0-9٠-٩۰-۹]/g, (d) => set[latinDigit(d)]);
    });
  }

  /* ---------- الاتجاه ---------- */
  const RLM = "‏", LRM = "‎";
  const DIR_MARKS = /[‎‏‪-‮⁦-⁩؜]/g;
  function fixDirection(s, strong) {
    return s.split("\n").map((raw) => {
      let line = raw.replace(DIR_MARKS, "");
      if (!line.trim()) return line;
      let r = 0, l = 0, first = "";
      for (const ch of line) { const R = AR_LETTER.test(ch), L = !R && LAT_LETTER.test(ch); if (R) r++; else if (L) l++; if (!first && (R || L)) first = R ? "R" : "L"; }
      if (!first) return line;
      // سطر يبدأ بالعربية عربيٌّ ما لم تغلب عليه اللاتينية بوضوح؛ وسطر يبدأ باللاتينية عربيٌّ إن كانت العربية أكثره
      const rtl = r > 0 && (first === "R" ? l <= 3 * r : r >= l);
      if (rtl) {
        // C++ و C#: الرمز اللاحق للكلمة اللاتينية يقفز إلى الجهة الأخرى بلا علامة
        line = line.replace(/([A-Za-z0-9][+#]+)(?=$|[\s؀-ۿ.,!])/g, "$1" + LRM);
        // رقم هاتف بمجموعات تفصلها مسافات: بلا علامة تُعرَض المجموعات معكوسة الترتيب
        line = line.replace(/(^|[^\w+])((?:\+|00|0)\d[\d \-]{6,}\d)/g, (m, p, num) => (num.replace(/\D/g, "").length >= 9 && /^\+|[ -]/.test(num)) ? p + LRM + num : m);
      }
      if (strong) return (rtl && l) || (!rtl && r) ? (rtl ? "‫" : "‪") + line + "‬" : line;
      if (rtl && first === "L") return RLM + line;
      if (!rtl && first === "R") return LRM + line;
      return line;
    }).join("\n");
  }

  /* ---------- الأسطر ---------- */
  const LIST_PREFIX = /^\s*(?:[•·▪◦*\-–—]|[0-9٠-٩]+[.)\-])\s+/;
  const LINES = {
    breaks: (s, fill) => s.replace(/[ \t]+$/gm, "").replace(/\n{2,}/g, fill ? "\n" + fill + "\n" : "\n\n"),
    join: (s) => s.split(/\n{2,}/).map((p) => p.replace(/\s*\n\s*/g, " ").trim()).join("\n\n"),
    noblank: (s) => s.replace(/\n(?:[ \t]*\n)+/g, "\n"),
    bullets: (s) => s.split("\n").map((l) => l.trim() ? "• " + l.replace(LIST_PREFIX, "").trim() : l).join("\n"),
    numbers: (s) => { let n = 0; return s.split("\n").map((l) => l.trim() ? (++n) + ". " + l.replace(LIST_PREFIX, "").trim() : l).join("\n"); },
    unlist: (s) => s.split("\n").map((l) => l.replace(LIST_PREFIX, "")).join("\n")
  };

  /* ---------- الهاشتاغ ---------- */
  const tagKey = (x) => x.normalize("NFC").replace(HARAKAT, "").toLowerCase();
  function makeTag(phrase) {
    const body = phrase.normalize("NFC").replace(HARAKAT, "").replace(/ـ/g, "").replace(/[^\p{L}\p{N}\s_-]/gu, " ").trim().replace(/[\s-]+/g, "_").replace(/^_+|_+$/g, "");
    return !body || /^[\d٠-٩۰-۹_]+$/.test(body) ? null : "#" + body;
  }
  const uniqTags = (arr) => { const seen = new Set(); return arr.filter((x) => { const k = tagKey(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
  const replaceTags = (s, fn) => mapText(s, findUrls(s), (c) => c.replace(TAG_RE, fn));
  const TAGS = {
    dedupe: (s) => { const seen = new Set(); return tidy(replaceTags(s, (m) => { const k = tagKey(m); if (seen.has(k)) return ""; seen.add(k); return m; })); },
    toend: (s) => { const all = uniqTags(tagsOf(s)); if (!all.length) return s; return CLEAN.spaces(tidy(replaceTags(s, () => ""))) + "\n\n" + all.join(" "); },
    plain: (s) => replaceTags(s, (m) => m.slice(1).replace(/_/g, " ")),
    remove: (s) => tidy(replaceTags(s, () => ""))
  };
  // هاشتاغ يتبعه مباشرة حرف يقطعه (شرطة أو نقطة) ثم بقية الكلمة
  const brokenTags = (s) => mapText(s, findUrls(s), (c) => c, () => " ").match(/#[\p{L}\p{M}\p{N}_]*[-.'’][\p{L}\p{N}][\p{L}\p{M}\p{N}_\-.'’]*/gu) || [];

  /* ---------- التقسيم ---------- */
  function splitText(text, max, lenFn, style) {
    text = text.replace(/\r/g, "").trim(); if (!text) return [];
    const tokens = text.match(/\S+\s*/g) || [];
    const deco = (i, n) => style === "end" ? ["", `\n\n${i}/${n}`] : style === "start" ? [`${i}/${n}\n`, ""] : style === "paren" ? [`(${i}/${n}) `, ""] : style === "thread" ? [`🧵 ${i}/${n}\n`, ""] : ["", ""];
    const run = (reserve) => {
      const budget = Math.max(1, max - reserve), parts = []; let cur = [];
      const flush = (n) => { const p = cur.slice(0, n).join("").trim(); if (p) parts.push(p); cur = cur.slice(n); };
      const pick = (re, total) => { for (let j = cur.length - 1; j > 0; j--) if (re.test(cur[j - 1])) return lenFn(cur.slice(0, j).join("").trim()) >= total * 0.4 ? j : 0; return 0; };
      for (let tok of tokens) {
        while (lenFn(tok.trim()) > budget) { // كلمة أطول من الحد: تُقطَّع على حدود المحارف
          flush(cur.length); const gs = graphemes(tok); let piece = gs[0], k = 1;
          while (k < gs.length && lenFn(piece + gs[k]) <= budget) piece += gs[k++];
          parts.push(piece); tok = gs.slice(k).join("");
        }
        if (!tok) continue;
        while (cur.length && lenFn((cur.join("") + tok).trim()) > budget) {
          const total = lenFn(cur.join("").trim());
          flush(pick(/\n\s*\n\s*$/, total) || pick(/(?:[.!?؟…]["'»)\]]*\s+|\n\s*)$/, total) || cur.length);
        }
        cur.push(tok);
      }
      flush(cur.length);
      return parts;
    };
    let parts = run(0);
    if (parts.length < 2 || style === "none") return parts;
    for (let cap = 9; cap <= 99999; cap = cap * 10 + 9) { // الترقيم يأخذ من الحد، وعدد خاناته يتبع عدد الأجزاء
      const d = deco(cap, cap); parts = run(lenFn(d[0] + d[1]));
      if (parts.length <= cap) break;
    }
    return parts.map((p, i) => { const d = deco(i + 1, parts.length); return d[0] + p + d[1]; });
  }

  /* ---------- البحث ---------- */
  const escRe = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const LOOSE = { "ا": "[اأإآٱ]", "أ": "[اأإآٱ]", "إ": "[اأإآٱ]", "آ": "[اأإآٱ]", "ٱ": "[اأإآٱ]", "ي": "[يى]", "ى": "[يى]", "ه": "[هة]", "ة": "[هة]", "و": "[وؤ]", "ؤ": "[وؤ]" };
  function buildFind(q, o) {
    if (!q) return null;
    let src;
    if (o.regex) src = q;
    else if (o.loose) src = Array.from(q.normalize("NFC").replace(HARAKAT, "").replace(/ـ/g, "")).map((c) => /\s/.test(c) ? "\\s+" : (LOOSE[c] || escRe(c)) + (AR_LETTER.test(c) ? "[" + MARKS + "\\u0640]*" : "")).join("");
    else src = escRe(q);
    if (o.word) src = "(^|[^\\p{L}\\p{M}\\p{N}_])(?:" + src + ")(?![\\p{L}\\p{M}\\p{N}_])";
    try { return new RegExp(src, "gu" + (o.cs ? "" : "i")); } catch (e) { return { error: e.message }; }
  }
  function findAll(s, re, word) {
    const out = []; re.lastIndex = 0; let m;
    while ((m = re.exec(s))) { if (!m[0]) { re.lastIndex++; continue; } const pre = word ? (m[1] || "").length : 0; out.push({ a: m.index + pre, b: m.index + m[0].length }); if (out.length > 50000) break; }
    return out;
  }

  /* ---------- الزخرفة (لاتيني فقط) ---------- */
  const FONTS = [
    { name: "عريض", U: 0x1D400, L: 0x1D41A, D: 0x1D7CE },
    { name: "مائل", U: 0x1D434, L: 0x1D44E, ex: { h: 0x210E } },
    { name: "عريض مائل", U: 0x1D468, L: 0x1D482 },
    { name: "بلا زوائد", U: 0x1D5A0, L: 0x1D5BA, D: 0x1D7E2 },
    { name: "بلا زوائد عريض", U: 0x1D5D4, L: 0x1D5EE, D: 0x1D7EC },
    { name: "بلا زوائد مائل", U: 0x1D608, L: 0x1D622 },
    { name: "خط اليد", U: 0x1D49C, L: 0x1D4B6, ex: { B: 0x212C, E: 0x2130, F: 0x2131, H: 0x210B, I: 0x2110, L: 0x2112, M: 0x2133, R: 0x211B, e: 0x212F, g: 0x210A, o: 0x2134 } },
    { name: "خط اليد عريض", U: 0x1D4D0, L: 0x1D4EA },
    { name: "قوطي", U: 0x1D504, L: 0x1D51E, ex: { C: 0x212D, H: 0x210C, I: 0x2111, R: 0x211C, Z: 0x2128 } },
    { name: "قوطي عريض", U: 0x1D56C, L: 0x1D586 },
    { name: "مزدوج", U: 0x1D538, L: 0x1D552, D: 0x1D7D8, ex: { C: 0x2102, H: 0x210D, N: 0x2115, P: 0x2119, Q: 0x211A, R: 0x211D, Z: 0x2124 } },
    { name: "آلة كاتبة", U: 0x1D670, L: 0x1D68A, D: 0x1D7F6 },
    { name: "دوائر", U: 0x24B6, L: 0x24D0, ex: { 0: 0x24EA, 1: 0x2460, 2: 0x2461, 3: 0x2462, 4: 0x2463, 5: 0x2464, 6: 0x2465, 7: 0x2466, 8: 0x2467, 9: 0x2468 } },
    { name: "عريض العرض", U: 0xFF21, L: 0xFF41, D: 0xFF10 },
    { name: "كابيتال صغير", map: (ch) => { const c = ch.charCodeAt(0); return c >= 97 && c <= 122 ? SMALLCAPS[c - 97] : null; } }
  ];
  function stylize(s, f) {
    let out = "";
    for (const ch of s) {
      const c = ch.codePointAt(0); let r = null;
      if (f.map) r = f.map(ch);
      else if (f.ex && f.ex[ch] !== undefined) r = f.ex[ch];
      else if (c >= 65 && c <= 90) r = f.U + c - 65;
      else if (c >= 97 && c <= 122) r = f.L + c - 97;
      else if (c >= 48 && c <= 57 && f.D) r = f.D + c - 48;
      out += r ? (typeof r === "string" ? r : String.fromCodePoint(r)) : ch;
    }
    return out;
  }

  window.TextKit = { graphemes, analyze, xWeighted, findUrls, invisibles, stripInvisibles, CLEAN, runClean, convertDigits, fixDirection, LINES, TAGS, makeTag, tagsOf, mentionsOf, brokenTags, splitText, buildFind, findAll, stylize, FONTS, isEmoji };

  /* ==========================================================
     2) المحرر: مسودة، تراجع وإعادة، تطبيق على التحديد
     ========================================================== */
  t.value = store.get("text-draft", "") || "";
  const H = { stack: [t.value], i: 0 };
  const syncHist = () => { $("#undo").disabled = H.i <= 0; $("#redo").disabled = H.i >= H.stack.length - 1; };
  function snap() {
    const v = t.value; if (v === H.stack[H.i]) return;
    H.stack.length = H.i + 1; H.stack.push(v);
    if (H.stack.length > 120) H.stack.shift();
    H.i = H.stack.length - 1; syncHist();
  }
  const snapLater = debounce(snap, 500);
  function setText(v) { snap(); t.value = v; snap(); refresh(); }
  function step(d) {
    snap(); const n = H.i + d; if (n < 0 || n >= H.stack.length) return;
    H.i = n; t.value = H.stack[n]; syncHist(); refresh();
  }
  function apply(fn, what) {
    snap();
    const v = t.value, a = t.selectionStart, b = t.selectionEnd, part = b > a && b - a < v.length;
    const src = part ? v.slice(a, b) : v, out = fn(src);
    if (out === src) { toast("لا يوجد ما يتغيّر", "info"); return false; }
    setText(part ? v.slice(0, a) + out + v.slice(b) : out);
    if (part) t.setSelectionRange(a, a + out.length);
    toast((what || "تم") + (part ? " (على الجزء المحدَّد فقط)" : ""));
    return true;
  }
  function insertAtCursor(text) {
    const v = t.value, a = t.selectionStart, b = t.selectionEnd;
    setText(v.slice(0, a) + text + v.slice(b)); t.focus(); t.setSelectionRange(a + text.length, a + text.length);
  }
  const appendBlock = (text) => { const v = t.value.replace(/\s+$/, ""); setText(v ? v + "\n\n" + text : text); };
  const selection = () => t.value.slice(t.selectionStart, t.selectionEnd);

  $("#undo").addEventListener("click", () => step(-1));
  $("#redo").addEventListener("click", () => step(1));
  $("#copy").addEventListener("click", () => { if (!t.value) return toast("لا يوجد نص", "info"); copy(t.value); });
  $("#clear").addEventListener("click", () => { if (t.value) { setText(""); toast("مُسح النص. زر «تراجع» يعيده", "trash-2"); } });
  $("#paste").addEventListener("click", async () => {
    try { const x = await navigator.clipboard.readText(); if (x) insertAtCursor(x); else toast("الحافظة فارغة", "info"); }
    catch { toast("المتصفح منع قراءة الحافظة. الصق بالضغط المطوّل أو Ctrl+V", "info"); t.focus(); }
  });
  t.addEventListener("keydown", (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "z" && !e.shiftKey) { e.preventDefault(); step(-1); }
    else if (k === "y" || (k === "z" && e.shiftKey)) { e.preventDefault(); step(1); }
  });
  // النص الطويل جداً يُحدَّث على مهل حتى لا تتعثر الكتابة
  let refreshTimer;
  const refreshLater = () => { clearTimeout(refreshTimer); refreshTimer = setTimeout(refresh, t.value.length > 20000 ? 700 : 120); };
  t.addEventListener("input", () => { snapLater(); refreshLater(); });

  /* ==========================================================
     3) الإحصاءات وحدود المنصات
     ========================================================== */
  const PLAT = [
    { id: "ig", name: "كابشن إنستغرام", max: 2200, v: (a) => a.u16 },
    { id: "igtags", name: "هاشتاغات إنستغرام", max: 30, soft: 5, v: (a) => a.tags.length },
    { id: "x", name: "منشور X (عدّ موزون)", max: 280, v: (a) => a.x },
    { id: "threads", name: "ثريدز", max: 500, v: (a) => a.u16 },
    { id: "tgcap", name: "كابشن وسائط تيليغرام", max: 1024, v: (a) => a.u16 },
    { id: "tgmsg", name: "رسالة تيليغرام", max: 4096, v: (a) => a.u16 },
    { id: "tiktok", name: "وصف تيك توك", max: 4000, v: (a) => a.u16 },
    { id: "fb", name: "منشور فيسبوك", max: 63206, v: (a) => a.u16 },
    // حقول قصيرة: تُعرَض للمقارنة ولا تدخل في ملخّص «يتجاوز»
    { id: "igbio", name: "بايو إنستغرام", max: 150, minor: 1, v: (a) => a.u16 },
    { id: "yt", name: "عنوان يوتيوب", max: 100, minor: 1, v: (a) => a.u16 }
  ];
  const dur = (sec) => sec < 60 ? `${sec} ث` : `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")} د`;
  let A = analyze(t.value);

  function renderStats() {
    const box = (v, l) => `<div class="tx-stat"><strong>${v}</strong><span>${l}</span></div>`;
    $("#stats").innerHTML = box(fmtNum(A.graphemes), "محرف") + box(fmtNum(A.noSpace), "بلا مسافات") + box(fmtNum(A.words), "كلمة") + box(fmtNum(A.sentences), "جملة")
      + box(fmtNum(A.lines), "سطر") + box(fmtNum(A.paragraphs), "فقرة") + box(dur(A.readSec), "قراءة صامتة") + box(dur(A.speakSec), "إلقاء بصوت");
    $("#raw").textContent = A.u16 ? `المحرف المرئي قد يتكون من عدة رموز: ${fmtNum(A.cps)} رمز يونيكود · ${fmtNum(A.u16)} وحدة UTF-16 · ${fmtNum(A.bytes)} بايت` : "";
    let over = [];
    $("#limits").innerHTML = PLAT.map((p) => {
      const v = p.v(A), isOver = v > p.max, pct = Math.min(100, v / p.max * 100), soft = p.soft && v > p.soft && !isOver;
      if (isOver && !p.minor) over.push(p.name);
      const c = isOver ? "var(--danger)" : pct > 85 || soft ? "var(--warn)" : "var(--success)";
      const note = isOver ? `زائد ${fmtNum(v - p.max)}` : soft ? `أكثر من ${p.soft}: قد تُرفض أو تُهمَل في بعض الحسابات` : `باقٍ ${fmtNum(p.max - v)}`;
      return `<div class="tx-lim"><div class="tx-lim-h"><span>${p.name}</span><b style="color:${c}">${fmtNum(v)} / ${fmtNum(p.max)}</b></div><div class="meter"><i style="width:${pct}%;background:${c};color:${c}"></i></div><small>${note}</small></div>`;
    }).join("");
    $("#lim-sum").innerHTML = !A.u16 ? "" : over.length ? `<span style="color:var(--danger)">يتجاوز: ${over.join("، ")}</span>` : `<span style="color:var(--success)">ضمن كل الحدود</span>`;
  }

  let invOpen = false;
  function renderInvis() {
    const inv = invisibles(t.value), el = $("#invis");
    if (!inv.total) { el.innerHTML = ""; invOpen = false; return; }
    const list = Object.entries(inv.counts).map(([k, n]) => `${k}×${n}`).join("، ");
    el.innerHTML = `<div class="alert alert-info mt-2 tx-invis">${ic("eye-off")}<div><strong>في النص ${fmtNum(inv.total)} محرفاً غير مرئي</strong><p class="ltr">${esc(list)}</p>
      <div class="btn-row mt-1"><button class="btn btn-ghost btn-sm" data-inv="show">${invOpen ? "أخفِ المواضع" : "أظهر مواضعها"}</button><button class="btn btn-ghost btn-sm" data-inv="strip">أزِلها</button></div>
      ${invOpen ? `<pre class="tx-out mt-1" dir="auto" data-lenis-prevent>${revealInvisibles(t.value.slice(0, 6000))}</pre>` : ""}</div></div>`;
  }
  $("#invis").addEventListener("click", (e) => {
    const b = e.target.closest("[data-inv]"); if (!b) return;
    if (b.dataset.inv === "show") { invOpen = !invOpen; renderInvis(); icons(); }
    else apply(CLEAN.invisible, "أُزيلت المحارف غير المرئية");
  });

  /* ==========================================================
     4) المعاينة
     ========================================================== */
  const HL = [EMAIL_RE, TAG_RE, AT_RE];
  const rich = (s) => mapText(s, spans(s, HL), esc, (x) => `<span class="tx-lnk">${esc(x)}</span>`);
  // موضع القطع: بعد عدد من المحارف المرئية أو عدد من الأسطر، أيهما أسبق
  function cutAt(s, maxG, maxLines) {
    const gs = graphemes(s); let idx = 0, lines = 1;
    for (let i = 0; i < gs.length; i++) {
      if (i >= maxG) return idx;
      if (gs[i] === "\n" || gs[i] === "\r\n") { if (++lines > maxLines) return idx; }
      idx += gs[i].length;
    }
    return -1;
  }
  let pv = store.get("text-pv", "ig"), pvOpen = false;
  function renderPreview() {
    const s = t.value, h = esc(S.handle || "page"), nm = esc(S.name || "الصفحة");
    const empty = `<span class="muted">سيظهر نصّك هنا…</span>`;
    const av = `<span class="tx-av">${esc((S.name || "ص").trim()[0])}</span>`;
    const cut = (maxG, maxLines, more) => {
      const c = cutAt(s, maxG, maxLines);
      if (c < 0 || pvOpen) return rich(s) + (c >= 0 ? ` <button class="tx-more" data-more>عرض أقل</button>` : "");
      return rich(s.slice(0, c).replace(/\s+$/, "")) + `… <button class="tx-more" data-more>${more}</button>`;
    };
    let html;
    if (pv === "ig") {
      html = `<div class="tx-pv tx-pv-ig"><div class="tx-pv-h">${av}<bdi class="ltr"><b>${h}</b></bdi></div><div class="tx-pv-media">${ic("image")}</div>
        <div class="tx-pv-t"><bdi class="ltr"><b>${h}</b></bdi> ${s ? cut(125, 2, "المزيد") : empty}</div></div>
        <p class="small muted mt-1 mb-0">يظهر في الخلاصة نحو 125 محرفاً أو سطران ثم «المزيد». ضع أهم ما عندك في البداية.</p>`;
    } else if (pv === "fb") {
      html = `<div class="tx-pv tx-pv-fb"><div class="tx-pv-h">${av}<div><b>${nm}</b><small>الآن · 🌐</small></div></div><div class="tx-pv-t">${s ? cut(477, 5, "عرض المزيد") : empty}</div></div>
        <p class="small muted mt-1 mb-0">فيسبوك يقطع المنشور الطويل بعد نحو 477 محرفاً أو خمسة أسطر.</p>`;
    } else if (pv === "x") {
      const x = xWeighted(s), body = x.cut < 0 ? rich(x.text) : rich(x.text.slice(0, x.cut)) + `<mark class="tx-over">${rich(x.text.slice(x.cut))}</mark>`;
      html = `<div class="tx-pv tx-pv-x"><div class="tx-pv-h">${av}<div><b>${nm}</b><small class="ltr">@${h}</small></div></div><div class="tx-pv-t">${s ? body : empty}</div></div>
        <p class="small muted mt-1 mb-0">${x.len > 280 ? `المظلَّل بالأحمر زائد عن 280 بمقدار ${fmtNum(x.len - 280)}. جرّب تبويب «تقسيم».` : `الطول الموزون ${fmtNum(x.len)} من 280.`}</p>`;
    } else {
      html = `<div class="tx-pv tx-pv-tg"><div class="tx-pv-bubble"><b class="tx-pv-ch">${nm}</b><div class="tx-pv-t">${s ? rich(s) : empty}</div><small>${new Date().toLocaleTimeString("ar-IQ-u-nu-latn", { hour: "2-digit", minute: "2-digit" })}</small></div></div>
        <p class="small muted mt-1 mb-0">${A.u16 > 4096 ? "أطول من رسالة واحدة (4096): سيقسّمها تيليغرام." : A.u16 > 1024 ? "يصلح رسالة نصية، لكنه أطول من كابشن صورة أو فيديو (1024)." : "يصلح رسالة نصية وكابشن وسائط."}</p>`;
    }
    $("#pv").innerHTML = html;
  }
  $("#pv-pick").addEventListener("click", (e) => { const b = e.target.closest("[data-pv]"); if (!b) return; pv = b.dataset.pv; pvOpen = false; store.set("text-pv", pv); syncPv(); renderPreview(); icons(); });
  $("#pv").addEventListener("click", (e) => { if (e.target.closest("[data-more]")) { pvOpen = !pvOpen; renderPreview(); icons(); } });
  const syncPv = () => $$("#pv-pick [data-pv]").forEach((x) => x.classList.toggle("active", x.dataset.pv === pv));

  /* ==========================================================
     5) التبويبات
     ========================================================== */
  let tab = store.get("text-tab", "clean");
  function showTab(id) {
    if (!$(`[data-panel="${id}"]`)) id = "clean";
    tab = id; store.set("text-tab", id);
    $$("#tabs [data-tab]").forEach((b) => b.classList.toggle("active", b.dataset.tab === id));
    $$(".tx-panel").forEach((p) => (p.hidden = p.dataset.panel !== id));
    if (id === "font" && !$("#font-in").value && /[A-Za-z]/.test(selection())) $("#font-in").value = selection();
    renderTab(); icons();
  }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) showTab(b.dataset.tab); });
  function renderTab() {
    if (tab === "tags") renderTags();
    else if (tab === "split") renderSplit();
    else if (tab === "find") renderFindCount();
    else if (tab === "font") renderFonts();
    else if (tab === "tpl") renderTpl();
  }

  /* ---------- تنظيف ---------- */
  let cleanSel = store.get("text-clean", CLEAN_OPTS.filter((o) => o.safe).map((o) => o.id));
  function renderClean() {
    $("#clean-opts").innerHTML = CLEAN_OPTS.map((o) => `<label class="tx-opt"><input type="checkbox" value="${o.id}"${cleanSel.includes(o.id) ? " checked" : ""}><span><b>${o.label}</b>${o.warn ? ' <em class="tx-warn">تغيّر الإملاء</em>' : ""}<small>${o.hint}</small></span></label>`).join("");
  }
  const readClean = () => { cleanSel = $$("#clean-opts input:checked").map((x) => x.value); store.set("text-clean", cleanSel); };
  $("#clean-opts").addEventListener("change", readClean);
  $("#clean-safe").addEventListener("click", () => { cleanSel = CLEAN_OPTS.filter((o) => o.safe).map((o) => o.id); store.set("text-clean", cleanSel); renderClean(); });
  $("#clean-none").addEventListener("click", () => { cleanSel = []; store.set("text-clean", cleanSel); renderClean(); });
  $("#clean-run").addEventListener("click", () => {
    readClean(); if (!cleanSel.length) return toast("اختر خياراً واحداً على الأقل", "info");
    if (!t.value) return toast("لا يوجد نص", "info");
    apply((s) => runClean(s, cleanSel), "تم التنظيف");
  });

  /* ---------- أرقام واتجاه ---------- */
  $('[data-panel="num"]').addEventListener("click", (e) => {
    const n = e.target.closest("[data-num]"), d = e.target.closest("[data-dir]");
    if (n) apply((s) => convertDigits(s, n.dataset.num, $("#num-sep").checked), "حُوّلت الأرقام");
    if (d) {
      if (d.dataset.dir === "strip") apply((s) => s.replace(DIR_MARKS, ""), "أُزيلت علامات الاتجاه");
      else apply((s) => fixDirection(s, d.dataset.dir === "strong"), "أُضيفت علامات الاتجاه حيث يلزم");
    }
  });

  /* ---------- أسطر ---------- */
  $("#br-style").options[0].value = "⠀";
  $('[data-panel="lines"]').addEventListener("click", (e) => {
    const b = e.target.closest("[data-line]"); if (!b) return;
    const k = b.dataset.line;
    apply((s) => k === "breaks" ? LINES.breaks(s, $("#br-style").value) : LINES[k](s));
  });

  /* ---------- هاشتاغ ---------- */
  let sets = store.get("text-tagsets", null);
  if (!Array.isArray(sets)) sets = [{ name: "الصفحة", tags: [makeTag(S.name || ""), "#العراق", "#معلومات"].filter(Boolean).join(" ") }];
  const saveSets = () => { store.set("text-tagsets", sets); renderSets(); fillTplSets(); };
  let copyBank = [];
  const bank = (text) => copyBank.push(text) - 1;
  function renderTags() {
    copyBank = [];
    const all = A.tags, u = uniqTags(all), dup = all.length - u.length, broken = brokenTags(t.value);
    const group = (label, arr, cls) => `<div class="mb-2"><div class="flex between items-center gap-1"><strong>${label} (${fmtNum(arr.length)})</strong>${arr.length ? `<button class="btn btn-ghost btn-sm" data-cp="${bank(arr.join(" "))}">${ic("copy")}نسخ</button>` : ""}</div>
      ${arr.length ? `<div class="tags mt-1">${arr.map((x) => `<span class="tag-link ${cls}" dir="auto">${esc(x)}</span>`).join("")}</div>` : '<span class="small muted">لا يوجد</span>'}</div>`;
    $("#extract").innerHTML = !t.value.trim() ? '<p class="small muted">اكتب نصاً لاستخراج الهاشتاغات والمنشن والروابط منه.</p>'
      : group("الهاشتاغات", u, "") + (dup ? `<div class="alert alert-warn mb-2">${ic("copy-x")}<span>في النص ${fmtNum(dup)} هاشتاغ مكرر. المنصات تعدّ المكرر ضمن الحد.</span></div>` : "")
      + (broken.length ? `<div class="alert alert-warn mb-2">${ic("unlink")}<span>هاشتاغ سينقطع عند الشرطة أو النقطة: <bdi>${broken.map(esc).join(" ")}</bdi>. استعمل الشرطة السفلية _ بدلها.</span></div>` : "")
      + group("المنشن", [...new Set(A.mentions)], "ltr") + group("الروابط", [...new Set(A.urls)], "ltr");
    renderMade(); renderSets();
  }
  const madeTags = () => uniqTags($("#tag-in").value.split(/[\n,،]+/).map(makeTag).filter(Boolean));
  function renderMade() { const m = madeTags(); $("#tag-out").innerHTML = m.map((x) => `<span class="tag-link" dir="auto">${esc(x)}</span>`).join("") || ($("#tag-in").value.trim() ? '<span class="small muted">لا تصلح هاشتاغاً (أرقام فقط أو رموز فقط).</span>' : ""); }
  function renderSets() {
    $("#sets").innerHTML = sets.length ? sets.map((x, i) => `<div class="tx-set"><div><b>${esc(x.name)}</b> <small class="muted">(${fmtNum((x.tags.match(TAG_RE) || []).length)})</small><p dir="auto">${esc(x.tags)}</p></div>
      <div class="btn-row"><button class="btn btn-ghost btn-sm" data-set-add="${i}">${ic("plus")}ألحق</button><button class="btn btn-ghost btn-sm" data-set-cp="${i}">${ic("copy")}نسخ</button><button class="btn btn-ghost btn-sm" data-set-del="${i}" aria-label="حذف المجموعة">${ic("trash-2")}</button></div></div>`).join("")
      : '<p class="small muted">لا توجد مجموعات محفوظة بعد.</p>';
    icons();
  }
  $('[data-panel="tags"]').addEventListener("click", (e) => {
    const q = (a) => e.target.closest(`[${a}]`);
    let b;
    if ((b = q("data-cp"))) copy(copyBank[+b.dataset.cp]);
    else if ((b = q("data-tag"))) { snap(); const out = TAGS[b.dataset.tag](t.value); if (out === t.value) toast("لا يوجد ما يتغيّر", "info"); else { setText(out); toast("تم"); } }
    else if ((b = q("data-set-add"))) { appendBlock(sets[+b.dataset.setAdd].tags); toast("أُلحقت المجموعة بآخر النص"); }
    else if ((b = q("data-set-cp"))) copy(sets[+b.dataset.setCp].tags);
    else if ((b = q("data-set-del"))) { sets.splice(+b.dataset.setDel, 1); saveSets(); }
  });
  $("#tag-in").addEventListener("input", renderMade);
  $("#tag-sel").addEventListener("click", () => { const x = selection().trim(); if (!x) return toast("حدّد عبارة في المحرر أولاً", "info"); $("#tag-in").value = x; renderMade(); });
  $("#tag-add").addEventListener("click", () => { const m = madeTags(); if (!m.length) return toast("اكتب عبارة أولاً", "info"); appendBlock(m.join(" ")); toast("أُضيفت الهاشتاغات"); });
  $("#tag-copy").addEventListener("click", () => { const m = madeTags(); if (!m.length) return toast("اكتب عبارة أولاً", "info"); copy(m.join(" ")); });
  $("#set-save").addEventListener("click", () => {
    const u = uniqTags(A.tags), name = $("#set-name").value.trim();
    if (!u.length) return toast("لا توجد هاشتاغات في النص لحفظها", "info");
    if (!name) { $("#set-name").focus(); return toast("اكتب اسماً للمجموعة", "info"); }
    const i = sets.findIndex((x) => x.name === name); const item = { name, tags: u.join(" ") };
    if (i >= 0) sets[i] = item; else sets.push(item);
    $("#set-name").value = ""; saveSets(); toast("حُفظت المجموعة");
  });

  /* ---------- قوالب ---------- */
  const tgShort = ((S.links && S.links.telegram) || "").replace(/^https?:\/\//, "").replace(/\/$/, "");
  const SIGN0 = ["──────────", "📌 " + (S.name || ""), S.handle && "إنستغرام: @" + S.handle, tgShort && "تيليغرام: " + tgShort].filter(Boolean).join("\n");
  const today = new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date());
  const TPL = [
    { id: "news", name: "خبر", f: [["h", "العنوان", "الخبر في جملة واحدة"], ["b", "التفاصيل", "ماذا حدث؟ مَن؟ أين؟ متى؟ ولماذا يهمّ؟", 1], ["p", "المكان", "بغداد"], ["d", "التاريخ", today], ["s", "المصدر", "اسم الجهة أو الوكالة"]],
      build: (v) => [v.h && "🔴 " + v.h, v.b, [v.p && "📍 " + v.p, v.d && "🗓 " + v.d].filter(Boolean).join("  |  "), v.s && "المصدر: " + v.s] },
    { id: "fact", name: "معلومة", f: [["h", "المعلومة", "الجملة التي تشدّ القارئ"], ["b", "الشرح", "التفاصيل والأرقام", 1], ["s", "المصدر", "كتاب، دراسة، جهة رسمية"]],
      build: (v) => ["💡 هل تعلم؟", v.h, v.b, v.s && "المصدر: " + v.s] },
    { id: "debunk", name: "تصحيح شائعة", f: [["h", "الشائعة كما انتشرت", "", 1], ["b", "الحقيقة", "", 1], ["c", "كيف تحققنا", "رجعنا إلى…", 1], ["s", "المصدر", ""]],
      build: (v) => [v.h && "❌ الشائعة: " + v.h, v.b && "✅ الحقيقة: " + v.b, v.c && "🔎 كيف تحققنا: " + v.c, v.s && "المصدر: " + v.s, "⚠️ تحقّق قبل أن تشارك."] },
    { id: "quote", name: "اقتباس", f: [["h", "نص الاقتباس", "", 1], ["b", "القائل", ""], ["c", "المناسبة أو المصدر", "اختياري"]],
      build: (v) => [v.h && "«" + v.h + "»", (v.b || v.c) && "— " + [v.b, v.c].filter(Boolean).join("، ")] },
    { id: "ask", name: "سؤال للنقاش", f: [["h", "السؤال", "", 1], ["b", "تمهيد قصير", "اختياري", 1]],
      build: (v) => ["💬 سؤال للنقاش", v.b, v.h, "شاركنا رأيك في التعليقات 👇"] },
    { id: "alert", name: "تنبيه", f: [["h", "ممَّ نحذّر؟", "", 1], ["b", "ماذا تفعل؟", "خطوات واضحة", 1], ["s", "المصدر", ""]],
      build: (v) => [v.h && "⚠️ تنبيه: " + v.h, v.b && "ماذا تفعل؟\n" + v.b, v.s && "المصدر: " + v.s, "أرسلها لمن يهمّك أمره."] }
  ];
  let tplId = store.get("text-tpl", "news"), tplVals = {};
  const curTpl = () => TPL.find((x) => x.id === tplId) || TPL[0];
  function renderTplFields() {
    const T = curTpl();
    $("#tpl-pick").innerHTML = TPL.map((x) => `<button data-tpl="${x.id}"${x.id === T.id ? ' class="active"' : ""}>${x.name}</button>`).join("");
    $("#tpl-fields").innerHTML = T.f.map(([k, label, ph, multi]) => `<div class="field"><label for="tf-${k}">${label}</label>${multi
      ? `<textarea class="textarea tx-mini" id="tf-${k}" data-k="${k}" dir="auto" data-lenis-prevent placeholder="${esc(ph)}">${esc(tplVals[k] || "")}</textarea>`
      : `<input class="input" id="tf-${k}" data-k="${k}" dir="auto" placeholder="${esc(ph)}" value="${esc(tplVals[k] || "")}">`}</div>`).join("");
  }
  function tplText() {
    const v = {}; for (const [k] of curTpl().f) v[k] = (tplVals[k] || "").trim();
    const blocks = curTpl().build(v).filter(Boolean);
    const set = sets[+$("#tpl-set").value];
    if ($("#tpl-tags").checked && set) blocks.push(set.tags);
    if ($("#tpl-sign").checked && $("#sign").value.trim()) blocks.push($("#sign").value.trim());
    return blocks.join("\n\n");
  }
  function renderTpl() { $("#tpl-out").textContent = tplText(); }
  function fillTplSets() { const cur = $("#tpl-set").value; $("#tpl-set").innerHTML = sets.map((x, i) => `<option value="${i}">${esc(x.name)}</option>`).join(""); if (cur && sets[+cur]) $("#tpl-set").value = cur; }
  $("#sign").value = store.get("text-sign", SIGN0);
  $("#tpl-pick").addEventListener("click", (e) => { const b = e.target.closest("[data-tpl]"); if (!b) return; tplId = b.dataset.tpl; store.set("text-tpl", tplId); renderTplFields(); renderTpl(); });
  $("#tpl-fields").addEventListener("input", (e) => { const k = e.target.dataset.k; if (k) { tplVals[k] = e.target.value; renderTpl(); } });
  ["#tpl-sign", "#tpl-tags", "#tpl-set"].forEach((s) => $(s).addEventListener("change", renderTpl));
  $("#sign").addEventListener("input", () => { store.set("text-sign", $("#sign").value); renderTpl(); });
  $("#sign-reset").addEventListener("click", () => { $("#sign").value = SIGN0; store.set("text-sign", SIGN0); renderTpl(); });
  $("#sign-add").addEventListener("click", () => { const x = $("#sign").value.trim(); if (x) { appendBlock(x); toast("أُلحق التوقيع"); } });
  $("#tpl-use").addEventListener("click", () => { setText(tplText()); toast(H.i > 0 ? "وُضع القالب في المحرر. «تراجع» يعيد نصّك السابق" : "وُضع القالب في المحرر"); t.focus(); });
  $("#tpl-append").addEventListener("click", () => { appendBlock(tplText()); toast("أُلحق القالب بالنص"); });
  $("#tpl-copy").addEventListener("click", () => copy(tplText()));

  /* ---------- تقسيم ---------- */
  const SPLIT = { x: [280, (s) => xWeighted(s).len], threads: [500], tgcap: [1024], tgmsg: [4096], ig: [2200] };
  let parts = [];
  function renderSplit() {
    const k = $("#sp-target").value; $("#sp-max").hidden = k !== "custom";
    const max = k === "custom" ? Math.max(20, +$("#sp-max").value || 500) : SPLIT[k][0];
    const lenFn = (k !== "custom" && SPLIT[k][1]) || ((s) => s.length);
    parts = splitText(t.value, max, lenFn, $("#sp-num").value);
    const bad = parts.filter((p) => lenFn(p) > max).length;
    $("#sp-sum").textContent = !parts.length ? "اكتب نصاً ليُقسَّم." : parts.length === 1 ? "النص ضمن الحد، لا يحتاج تقسيماً." : `${fmtNum(parts.length)} أجزاء` + (bad ? ` · ${bad} منها تجاوز الحد` : "");
    $("#sp-copy").hidden = parts.length < 2;
    const SHOW = 200; // «نسخ الكل» ينسخ الأجزاء كلها حتى لو لم تُعرَض
    $("#sp-out").innerHTML = (parts.length > SHOW ? `<p class="small muted">تُعرَض أول ${SHOW} جزءاً فقط. «نسخ الكل» ينسخها جميعاً.</p>` : "") + parts.slice(0, SHOW).map((p, i) => { const n = lenFn(p); return `<div class="tx-part"><div class="tx-part-h"><b>${i + 1}</b><span style="color:${n > max ? "var(--danger)" : "var(--muted)"}">${fmtNum(n)} / ${fmtNum(max)}</span><button class="btn btn-ghost btn-sm" data-part="${i}">${ic("copy")}نسخ</button></div><pre dir="auto">${esc(p)}</pre></div>`; }).join("");
    icons();
  }
  ["#sp-target", "#sp-num"].forEach((s) => $(s).addEventListener("change", renderSplit));
  $("#sp-max").addEventListener("input", debounce(renderSplit, 250));
  $("#sp-out").addEventListener("click", (e) => { const b = e.target.closest("[data-part]"); if (b) copy(parts[+b.dataset.part], `نُسخ الجزء ${+b.dataset.part + 1}`); });
  $("#sp-copy").addEventListener("click", () => copy(parts.join("\n\n———\n\n"), "نُسخت كل الأجزاء"));

  /* ---------- بحث واستبدال ---------- */
  const findOpts = () => ({ loose: $("#f-loose").checked, word: $("#f-word").checked, cs: $("#f-case").checked, regex: $("#f-re").checked });
  function findState() {
    const o = findOpts(), re = buildFind($("#f-q").value, o);
    if (!re) return { hits: [] };
    if (re.error) return { hits: [], error: re.error };
    return { re, o, hits: findAll(t.value, re, o.word) };
  }
  function renderFindCount() {
    const st = findState(), el = $("#f-count");
    el.textContent = st.error ? "تعبير نمطي غير صالح" : !$("#f-q").value ? "" : st.hits.length ? `${fmtNum(st.hits.length)} مطابقة` : "لا توجد مطابقة";
    el.style.color = st.error ? "var(--danger)" : "";
    return st;
  }
  function selectHit(h) { t.focus(); t.setSelectionRange(h.a, h.b); t.blur(); t.focus(); }
  function findNext() {
    const st = renderFindCount(); if (!st.hits.length) return null;
    const from = t.selectionEnd, h = st.hits.find((x) => x.a >= from) || st.hits[0];
    selectHit(h); return h;
  }
  $("#f-next").addEventListener("click", findNext);
  $("#f-q").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); findNext(); } });
  ["#f-q", "#f-loose", "#f-word", "#f-case", "#f-re"].forEach((s) => $(s).addEventListener("input", renderFindCount));
  const replacement = (st) => (st.o.regex && !st.o.word ? $("#f-r").value : null);
  $("#f-one").addEventListener("click", () => {
    const st = renderFindCount(); if (!st.hits.length) return;
    const a = t.selectionStart, b = t.selectionEnd, h = st.hits.find((x) => x.a === a && x.b === b);
    if (!h) { findNext(); return; }
    const v = t.value, rx = replacement(st);
    const rep = rx === null ? $("#f-r").value : v.slice(a, b).replace(new RegExp(st.re.source, st.re.flags.replace("g", "")), rx);
    setText(v.slice(0, a) + rep + v.slice(b)); t.setSelectionRange(a + rep.length, a + rep.length); findNext();
  });
  $("#f-all").addEventListener("click", () => {
    const st = renderFindCount(); if (!st.hits.length) return toast("لا توجد مطابقة", "info");
    const rx = replacement(st), lit = $("#f-r").value, v = t.value;
    const out = rx !== null ? v.replace(st.re, rx) : st.o.word ? v.replace(st.re, (m, pre) => pre + lit) : v.replace(st.re, () => lit);
    setText(out); toast(`استُبدلت ${fmtNum(st.hits.length)} مطابقة`);
  });

  /* ---------- زخرفة ---------- */
  let fontOut = [];
  function renderFonts() {
    const src = $("#font-in").value || "Iraq Empire 2026";
    fontOut = FONTS.map((f) => stylize(src, f));
    $("#font-out").innerHTML = FONTS.map((f, i) => `<div class="tx-font"><small>${f.name}</small><bdi class="ltr">${esc(fontOut[i])}</bdi><div class="btn-row"><button class="btn btn-ghost btn-sm" data-fcp="${i}">${ic("copy")}نسخ</button><button class="btn btn-ghost btn-sm" data-fin="${i}">أدرِج</button></div></div>`).join("");
    icons();
  }
  $("#font-in").addEventListener("input", debounce(renderFonts, 120));
  $("#font-out").addEventListener("click", (e) => {
    const c = e.target.closest("[data-fcp]"), n = e.target.closest("[data-fin]");
    if (c) copy(fontOut[+c.dataset.fcp]);
    if (n) { if (!$("#font-in").value) return toast("اكتب نصاً لاتينياً أولاً", "info"); insertAtCursor(fontOut[+n.dataset.fin]); toast("أُدرج في موضع المؤشر"); }
  });
  $("#font-undo").addEventListener("click", () => apply(CLEAN.unstyle, "أُرجعت الأحرف إلى عادية"));

  /* ==========================================================
     6) التحديث العام
     ========================================================== */
  const saveDraft = debounce(() => store.set("text-draft", t.value), 400);
  function refresh() {
    A = analyze(t.value);
    renderStats(); renderInvis(); renderPreview(); renderTab(); syncHist(); icons(); saveDraft();
  }

  /* ==========================================================
     7) محوّل التاريخ الهجري
     ========================================================== */
  const HM = ["محرّم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
  $("#hm").innerHTML = HM.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
  const hParts = (d) => {
    const p = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }).formatToParts(d);
    const g = (k) => +p.find((x) => x.type === k).value; return { d: g("day"), m: g("month"), y: g("year") };
  };
  const gFmt = (d) => new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  const hFmt = (d) => new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  let dateText = "";
  const setRes = (text, ok) => { dateText = ok ? text : ""; $("#dres span").innerHTML = ok ? `<strong>${esc(text)}</strong>` : esc(text); };
  function g2h() {
    const v = $("#gdate").value; if (!v) return setRes("—");
    const d = new Date(v + "T00:00:00Z"); if (isNaN(d)) return setRes("تاريخ غير صالح");
    setRes(hFmt(d), true);
  }
  function h2g() {
    const D = +$("#hd").value, Mo = +$("#hm").value, Y = +$("#hy").value;
    if (!D || !Y) return setRes("أدخل اليوم والسنة الهجرية");
    const est = Date.UTC(622, 6, 16) + ((Y - 1) * 354.367 + (Mo - 1) * 29.53 + (D - 1)) * 864e5; // تقدير ثم بحث ±60 يوماً
    for (let k = -60; k <= 60; k++) {
      const d = new Date(est + k * 864e5), p = hParts(d);
      if (p.y === Y && p.m === Mo && p.d === D) return setRes(gFmt(d), true);
    }
    setRes(D === 30 ? "هذا الشهر 29 يوماً فقط في تلك السنة" : "تاريخ خارج النطاق المدعوم");
  }
  $$("#dmode [data-d]").forEach((b) => b.addEventListener("click", () => {
    $$("#dmode [data-d]").forEach((x) => x.classList.toggle("active", x === b));
    $("#g2h").hidden = b.dataset.d !== "g2h"; $("#h2g").hidden = b.dataset.d !== "h2g";
    b.dataset.d === "g2h" ? g2h() : h2g();
  }));
  const now = new Date();
  $("#gdate").value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const th = hParts(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
  $("#hd").value = th.d; $("#hm").value = th.m; $("#hy").value = th.y;
  $("#gdate").addEventListener("input", g2h);
  ["#hd", "#hm", "#hy"].forEach((s) => $(s).addEventListener("input", h2g));
  $("#dins").addEventListener("click", () => { if (!dateText) return toast("لا يوجد تاريخ صالح", "info"); insertAtCursor(dateText); toast("أُدرج التاريخ في موضع المؤشر"); });
  g2h();

  /* ==========================================================
     8) الإقلاع
     ========================================================== */
  renderClean(); renderTplFields(); fillTplSets(); syncPv();
  showTab(tab); refresh();
  window.addEventListener("beforeunload", () => store.set("text-draft", t.value));
})();
