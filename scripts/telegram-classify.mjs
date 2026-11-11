/* ==========================================================
   مصنّف منشورات تليغرام: يحدد نوع المنشور وقسمه وعنوانه
   قواعد لغوية عربية موزونة، مجانية بالكامل، ولا تحتاج أي API.
   ========================================================== */

export const TYPES = {
  fact: "معلومة",
  news: "خبر",
  event: "فعالية",
  discussion: "سؤال للنقاش",
  literature: "شعر وأدب",
  promo: "ترويج",
  other: "أخرى"
};

/* Arabic normalisation: strip diacritics/tatweel, unify letter forms */
export function norm(s) {
  return String(s || "").toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s%]/gu, " ").replace(/\s+/g, " ").trim();
}

const words = (list) => list.split(/\s*\|\s*/).map(norm).filter(Boolean);
function countHits(t, list) {
  // t is normalised and padded with spaces; match whole words or phrases (allowing ال prefix / attached letters)
  let n = 0; const hits = [];
  for (const w of list) {
    const re = new RegExp(`(^|\\s)(و|ف|ب|ل|ال|وال|بال|لل|كال)?${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(ها|هم|ه|ات|ين|ون|يه|يه)?(?=\\s|$)`, "g");
    const m = t.match(re); if (m) { n += m.length; hits.push(w); }
  }
  return { n, hits };
}

/* ---------- Cue lexicons ---------- */
const CUES = {
  info: words("يعد|تعد|يعتبر|تعتبر|عرف|عرفت|اشتهر|اشتهرت|دراسه|العلماء|اكتشف|اكتشاف|يبلغ|تبلغ|تقع|يقع|بحسب|وفقا|نشرت|مجله|القرن|ميلادي|قبل الميلاد|نسبه|حيث|اذ|كما|بينما|الذي|التي|لذلك|ولهذا|اسهم|اسهمت|تاسس|تاسست|يمتد|ويعود|يعود|اصل|تاريخ|اقدم|اكبر|اول|ظاهره|يحتوي|تتكون|يتكون"),
  news: words("عاجل|يسعدنا|نعلن|اعلن|اعلنت|اعلان|اليوم العالمي|اليوم|امس|فاز|فازت|فوز|تقديرا|وزاره|الحكومه|رسميا|قرر|قررت|بيان|مؤتمر صحفي|نوبل|الاثنين|الثلاثاء|الاربعاء|الخميس|الجمعه|السبت|الاحد|هذا الاسبوع|حديثا|مؤخرا|اطلقت|كشفت"),
  event: words("مهرجان|فعاليه|فعاليات|معرض|مسابقه|مسابقات|ندوه|ورشه|احتفال|احتفاليه|بطوله|حفل|ماراثون|افتتاح|انطلاق|انطلقت|موعد|سجلوا|التسجيل|شاركونا|شاركوا|من انا|خمن|خمنوا|جاوب|جاوبوا|اكتبوا|التعليقات|تحدي|سحب|جوائز|الفائز|الفائزين|بث مباشر|لايف|فقره|الفقره|استفتاء|تصويت|صوتوا|المشاركه|بمشاركه"),
  promo: words("قناتنا|قناه|كروب|بوت|البوت|مجموعه|اشترك|اشتركوا|انضم|انضموا|تابعوا|تابعونا|تطبيق|حمل|متجر|خصم|كود|للاعلان|ممول|برعايه|رابط|تقدم لكم|زوروا|الرابط"),
  poetAttribution: words("الشاعر|الشاعره|المتنبي|نزار قباني|محمود درويش|الجواهري|السياب|عنتره|ابو العلاء|احمد شوقي|الدكتور|ديوان|قصيده")
};

/* ---------- Category lexicons (match window.CATEGORIES ids) ---------- */
export const CAT_WORDS = {
  iraq: words("العراق|عراقي|عراقيه|العراقيين|بغداد|البصره|الموصل|نينوي|كربلاء|النجف|بابل|الحله|سامراء|الانبار|الفلوجه|الرمادي|كركوك|اربيل|السليمانيه|دهوك|ميسان|العماره|الناصريه|ذي قار|الديوانيه|الكوت|واسط|ديالي|بعقوبه|صلاح الدين|تكريت|المثني|السماوه|سنجار|لالش|الاهوار|دجله|الفرات|الرافدين|سومر|سومري|السومريين|اكد|اكدي|اشور|اشوري|الاشوريين|بابلي|البابليين|الوركاء|الحضر|نمرود|الايزيديون|الايزيديه|المندائيه|الصابئه|الكرد|الكورد|التركمان"),
  history: words("القرن|الميلادي|قبل الميلاد|الامبراطوريه|امبراطوريه|مملكه|المملكه|حكم|الحكم|الملك|الملكه|الخليفه|سلاله|حضاره|الحضاره|الحرب|معركه|تاريخ|التاريخ|التاريخيه|اثري|الاثار|اثار|الفراعنه|الرومان|الرومانيه|الاغريق|اليونان القديمه|العثمانيه|العثماني|الاندلس|العباسي|الاموي|الفاطمي|المغول|الحاكم|حاكمه|قائد|غزو|ثوره|مدينه قديمه|القديم|القديمه"),
  science: words("دراسه|العلماء|علماء|العالم|علمي|علميه|بحث|الباحثون|الباحثين|فيزياء|الفيزياء|كيمياء|الكيمياء|رياضيات|الرياضيات|نظريه|تجربه|مختبر|جزيء|ذره|الذرات|الطاقه|نوبل|الفيزيائي|الكيميائي|اختراع|مخترع|المعادله|المجهر|الجراحه|الطب"),
  space: words("الفضاء|كوكب|كواكب|المجره|مجره|النجوم|نجم|الشمس|القمر|المريخ|المشتري|زحل|ناسا|ثقب اسود|الثقوب السوداء|مدار|تلسكوب|الكون|فلكي|الفلك|رائد فضاء|مسبار|صاروخ|الارض تدور|الضوء"),
  body: words("اسنان|الاسنان|الفم|العين|العيون|الاذن|الصيام|الجوع|الوزن|السمنه|الغذاء|الدهون|التوائم|الجنين|الاجنه|مستشفي|طبي|طبيه|الجسد|الدماغ البشري|الدماغ|القلب|الدم|المخ|الخلايا|الجينات|صحه|طبيب|الاطباء|مرض|امراض|علاج|دواء|فيتامين|النوم|العظام|الجلد|المعده|الكبد|الرئه|المناعه|الهرمونات|السكر|الحمل|الولاده"),
  tech: words("تقنيه|التقنيه|التكنولوجيا|الانترنت|الحاسوب|الكمبيوتر|الذكاء الاصطناعي|تطبيق|هاتف|الهاتف|برمجه|روبوت|رقمي|الرقميه|البيانات|ابل|غوغل|جوجل|مايكروسوفت|سامسونج|شريحه|معالج|خوارزميه|الكتروني|الالكترونيه|شبكه"),
  nature: words("الحيوان|حيوان|الحيوانات|الطيور|طائر|النبات|النباتات|الاشجار|شجره|المحيط|المحيطات|البحر|البحار|الغابات|الطبيعه|البراكين|بركان|الزلازل|زلزال|المناخ|الطقس|الاسماك|الحشرات|الصحراء|الانهار|الجبال|الكائنات|الحيه|المفترسه"),
  culture: words("الدين|ديانه|الديانه|الثقافه|ثقافي|الادب|الشعر|الشاعر|روايه|الروايه|الكاتب|الكاتبه|الفن|الفنان|الموسيقي|السينما|فيلم|الفيلم|اللغه|المسرح|التراث|العادات|التقاليد|الطقوس|عقيده|كتاب|كتابه|الموسوعه|المطبخ|الطعام|اكله|مهرجان|المتحف|اللوحه|الرسام|الايس كريم"),
  mind: words("النفس|علم النفس|النفسي|النفسيه|الفلسفه|الفيلسوف|فلاسفه|المشاعر|مشاعر|السلوك|العقل|الوعي|التفكير|السعاده|القلق|الذاكره|الشخصيه|المنطق|مفارقه|لغز|الاخلاق|الوجود|الحقيقه|الاكتئاب|العواطف|الدماغ البشري")
};
const CAT_PRIORITY = ["iraq", "space", "body", "tech", "nature", "mind", "science", "history", "culture"];

/* ---------- Text helpers ---------- */
const URL_RE = /https?:\/\/\S+|t\.me\/\S+|www\.\S+/gi;
const EMOJI_RE = /[\p{Extended_Pictographic}‍️⁠]|[\u{1F3FB}-\u{1F3FF}]/gu;
export const cleanText = (t) => String(t || "").replace(/[​-‏‪-‮⁠﻿]/g, "").replace(URL_RE, " ").replace(EMOJI_RE, " ").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

function diacriticRatio(t) {
  const letters = (t.match(/[ء-ي]/g) || []).length; if (!letters) return 0;
  return (t.match(/[ً-ْ]/g) || []).length / letters;
}

/* A readable title from posts that have none */
export function makeTitle(text) {
  const t = cleanText(text).replace(/[◥◤◢◣■□▪▫◆◇]/g, " ").replace(/^[\s\-–—●•▪️◾🔻🛑#|:]+/u, "").replace(/[ \t]{2,}/g, " ");
  const lines = t.split("\n").map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return "";
  const first = lines[0].replace(/^[\s\-–—]+|[\s\-–—]+$/g, "").replace(/[.…،:]+$/, "");
  const connective = /^(و|ف|ثم|لكن|ومع|وفي|كما)\s|^و\S/;
  if (lines.length > 1 && first.length >= 6 && first.length <= 90 && first.split(/\s+/).length >= 2 && !/[،,]/.test(first) && !connective.test(first)) return first;
  // otherwise: first sentence; skip a short leading time/place phrase ("في القرن الحادي عشر،")
  const sentence = t.split(/(?<=[.!؟?])\s|\n/)[0];
  const clauses = sentence.split(/\s*[،,؛]\s*/).map((c) => c.trim()).filter(Boolean);
  const lead = /^(في|خلال|منذ|عام|بين|قبل|بعد|عندما|حين|مع|على مدى|طوال|ب?حلول|وفي|ومنذ)\s/;
  const timeOnly = /القرن|عام \d|عام [٠-٩]|الميلادي|قبل الميلاد|العصر|الفتره|السنوات|سنه \d/;
  const skip = (c) => lead.test(c) && (c.split(/\s+/).length <= 6 || timeOnly.test(norm(c)));
  let pick = clauses.find((c, i) => !(skip(c) && i < clauses.length - 1) && c.split(/\s+/).length >= 3) || clauses[0] || sentence;
  if (pick.length > 80) { pick = pick.slice(0, 80); pick = pick.slice(0, pick.lastIndexOf(" ")) + "…"; }
  return pick.trim();
}

export function makeExcerpt(text, title, n = 190) {
  let t = cleanText(text).replace(/\s*\n+\s*/g, " ");
  if (title && t.startsWith(title.replace(/…$/, ""))) t = t.slice(title.replace(/…$/, "").length).replace(/^[\s.:،-]+/, "");
  if (t.length <= n) return t;
  t = t.slice(0, n); return t.slice(0, t.lastIndexOf(" ")) + "…";
}

/* ---------- Main classifier ---------- */
export function classify(post, cfg) {
  const raw = post.text || "";
  const clean = cleanText(raw);
  const len = clean.length;
  const t = " " + norm(clean) + " ";
  const reasons = [];
  const score = { fact: 0, news: 0, event: 0, discussion: 0, literature: 0, promo: 0 };

  const info = countHits(t, CUES.info), news = countHits(t, CUES.news), ev = countHits(t, CUES.event), pr = countHits(t, CUES.promo), poet = countHits(t, CUES.poetAttribution);
  const years = (clean.match(/\b(1[0-9]{3}|20[0-9]{2})\b/g) || []).length + (clean.match(/[٠-٩]{4}/g) || []).length;
  const numbers = (clean.match(/\d+/g) || []).length;
  const dia = diacriticRatio(clean);
  const lines = clean.split("\n").filter((l) => l.trim());
  const avgLine = lines.length ? len / lines.length : len;
  const sentences = clean.split(/[.!؟?]+|\.\./).filter((s) => s.trim().length > 15).length;
  const linkShare = (raw.match(URL_RE) || []).join("").length / Math.max(1, raw.length);
  const isQuestion = /[؟?]\s*$/.test(clean.split("\n")[0]) || /[؟?]\s*$/.test(clean);

  // Promotion / channel ads
  if (post.forwardedFrom) { score.promo += 2; reasons.push(`محوّل من «${post.forwardedFrom}»`); }
  if (post.linkPreview) score.promo += 1.5;
  if (linkShare > .35) { score.promo += 2.5; reasons.push("أغلب المنشور روابط"); }
  score.promo += Math.min(4, pr.n * 1.2);
  if (!len && !post.photos?.length && !post.video) { score.promo += 1; }

  // Clear-cut ads: these win over any amount of informative wording
  const adHits = [];
  const money = (t.match(/ (ارباح|ربح|الربح|استثمار|مستثمر|المستثمر|تداول|التداول|فوركس|اشارات|عملات رقميه|بيتكوين|كريبتو|محفظه|راس مال|دخل يومي|ربح يومي|عوائد|مضمونه|مقدما|سحب ارباحك) /g) || []).length;
  const cta = / (للتواصل|تواصل معي|راسلني|راسلوني|اضغط|سجل الان|انضم الان|اشترك الان|ادخل الرابط|واتساب|واتس) /.test(t) || /wa\.me|@[A-Za-z0-9_]{5,}/.test(raw.replace(/@(informationiq|informationss_iq)\b/gi, ""));
  if (money >= 2 && (cta || money >= 3)) adHits.push("إعلان استثمار أو أرباح");
  if (/ (بوت|البوت|للبوت) /.test(t) && / (مستخدم|مستخدمين|المستخدمين|مجموعه|مجموعات|المجموعات|اوامر|الاوامر|اضف|اضافه|ضيف) /.test(t)) adHits.push("ترويج لبوت");
  if (/@[A-Za-z0-9_]{3,}bot\b/i.test(raw)) adHits.push("رابط بوت");
  if (/ (تجاوز|تجاوزت|وصلنا|وصل|حاجز) .{0,40}(الف|مليون|\d{3,}) .{0,30}(مستخدم|مشترك|متابع|عضو)/.test(t) || /(تجاوز|حاجز)\s*[\d,٬.]{4,}\s*(مستخدم|مشترك|متابع)/.test(clean)) adHits.push("إعلان عدد مشتركين أو مستخدمين");
  const foreign = (raw.match(/t\.me\/(?!informationss_iq|informationiq|s\/)(addlist\/)?[A-Za-z0-9_+]{4,}/gi) || []).length;
  // a link to another channel is an ad when it is the point of the post, not a signature under real information
  const informative = info.n >= 2 || years >= 1;
  if (foreign && (len < 200 || foreign >= 2 || (len < 400 && !informative))) adHits.push("رابط قناة أخرى");
  if (/ (تقدم لكم قناتنا|قناه متخصصه|قناة متخصصة|رابط القناه|رابط واحد فقط يضم|مجلد الامبراطوريه|برعايه|اعلان ممول|للاعلان والتواصل) /.test(t)) adHits.push("تعريف بقناة أو إعلان ممول");
  if (adHits.length) { score.promo += 8; reasons.push(...adHits); }

  // Literature / poetry
  if (dia > .22) { score.literature += 3; reasons.push(`تشكيل كثيف ${(dia * 100).toFixed(0)}%`); }
  else if (dia > .12) score.literature += 1.5;
  if (len < 380 && info.n <= 2 && years === 0) score.literature += 1.5;
  if (poet.n) score.literature += 1;
  if (lines.length >= 3 && avgLine < 55 && years === 0) score.literature += 1.5;

  // Poetry often opens with a fully vowelled verse even when followed by commentary
  if (diacriticRatio(clean.slice(0, 140)) > .28) { score.literature += 2.5; reasons.push("مطلع مشكول كالشعر"); }

  // Quiz question (part of a competition) vs. open discussion question
  const quizQ = isQuestion && len < 260 && /^(ما اسم|ما هو|ما هي|من هو|من هي|في اي|في أي|ما المدينه|ما المدينة|ما الماده|ما المادة|كم عدد|كم|متى|اين|أين|الاسم الذي|اي |أي )/.test(clean.replace(/^[\s\d.)\-–]+/, ""));
  if (quizQ) { score.event += 4.5; reasons.push("سؤال مسابقة"); }
  else if (isQuestion && len < 220) { score.discussion += 3.5; reasons.push("سؤال قصير للنقاش"); }
  if (/^هل\s|^لماذا\s|^كيف\s|^اذا\s|^إذا\s/.test(clean) && len < 220) score.discussion += 1;

  // Event / activity: explicit announcements, winners, competitions
  score.event += Math.min(6, ev.n * 1.6);
  const head = " " + norm(clean.slice(0, 160)) + " ";
  if (/ (يسعدنا|يسرنا|نود ان نعلن) /.test(head) && score.event < 3) { score.news += 4; reasons.push("إعلان من الصفحة"); }
  if (/ (تعلن|نعلن|يعلن) .*(فعاليه|مسابقه|سحب|مهرجان|معرض)| اقامه (فعاليه|مسابقه)| المركز (الاول|الثاني|الثالث)| الفائز| الفائزين| صح ام خطا| صح او خطا| هذه الفقره| شكر لكل من شارك/.test(head)) { score.event += 5; reasons.push("إعلان فعالية أو نتائجها"); }
  if (post.poll) { score.event += 5; reasons.push("استفتاء"); }
  if (/من ان[اى]\s*[؟?]/.test(norm(clean)) || /مَنْ أَنَا/.test(raw)) { score.event += 3; reasons.push("فقرة تفاعلية «من أنا؟»"); }
  if (/ (فعاليه سريعه|سؤال الفعاليه|سؤال اليوم|الاجابه تكون|اجيبوا|الجواب في التعليقات) /.test(head) || (/ فعاليه /.test(head) && /[؟?]/.test(clean))) { score.event += 4.5; reasons.push("سؤال فعالية أو اختبار"); }
  if (/ (ختام فعاليه|ختاما|نتقدم بجزيل الشكر|شكرا لكل من شارك|وهكذا نكون قد وصلنا) /.test(head)) { score.event += 5; reasons.push("ختام فعالية"); }
  if (ev.hits.length) reasons.push(`مؤشرات فعالية: ${ev.hits.slice(0, 4).join("، ")}`);

  // News
  score.news += Math.min(6, news.n * 1.1);
  if (/(20[2-9]\d)/.test(clean.slice(0, 120)) && news.n >= 2) score.news += 1.5;
  if (news.hits.length) reasons.push(`مؤشرات خبر: ${news.hits.slice(0, 4).join("، ")}`);

  // Information / fact
  score.fact += Math.min(6, info.n * .7) + Math.min(2, years * .6) + Math.min(1.5, numbers * .15) + Math.min(2, sentences * .4);
  if (len >= cfg.minFactLength) score.fact += 2;
  if (len >= 600) score.fact += 1;
  reasons.push(`الطول ${len} حرفاً`);

  // Decide
  let type = Object.entries(score).sort((a, b) => b[1] - a[1])[0][0];
  // News that is really about an event (festival opened…) stays an event only if event cues dominate
  if (type === "news" && score.event >= score.news) type = "event";
  if (type === "fact" && score.news > score.fact * .8 && news.n >= 3) type = "news";
  if (type === "promo" && score.promo < 2.5) type = len >= cfg.minFactLength ? "fact" : "other";
  if (cfg.skipForwarded && post.forwardedFrom) type = "promo";
  if (adHits.length) type = "promo";
  // "On this day" posts are facts about the past, not news
  if (type === "news" && /^(في مثل هذا اليوم|فى مثل هذا اليوم)/.test(clean) && years) { type = "fact"; reasons.push("«في مثل هذا اليوم»"); }

  // Minimum-length gates. A short post still counts as a fact when it carries real information
  // (a date, figures or informative wording) and is not poetry or a question.
  const denseFact = !isQuestion && dia < .08 && sentences >= 1 && (years >= 1 || info.n >= 3 || (info.n >= 2 && numbers >= 1));
  const shortMin = cfg.minShortFactLength ?? 130;
  if (type !== "fact" && type !== "promo" && denseFact && len >= shortMin && len < cfg.minFactLength && score.event < 4 && score.literature < 3 && !(type === "news" && len >= cfg.minNewsLength)) { type = "fact"; }
  const minFor = { fact: denseFact ? Math.min(shortMin, cfg.minFactLength) : cfg.minFactLength, news: cfg.minNewsLength, event: cfg.minEventLength };
  if (type === "fact" && denseFact && len < cfg.minFactLength && len >= shortMin) reasons.push("معلومة قصيرة كثيفة (تاريخ أو أرقام)");
  if (minFor[type] && len < minFor[type] && !post.poll) {
    reasons.push(`أقصر من الحد الأدنى (${minFor[type]})`);
    type = score.literature >= 2.5 ? "literature" : isQuestion ? "discussion" : "other";
  }

  // Category
  const catScores = {};
  for (const [c, list] of Object.entries(CAT_WORDS)) catScores[c] = countHits(t, list).n;
  catScores.iraq *= 1.4; // Iraq-related content is the page's focus
  let cat = CAT_PRIORITY.reduce((best, c) => (catScores[c] > (catScores[best] ?? -1) ? c : best), "culture");
  if (!catScores[cat]) cat = type === "literature" ? "culture" : "culture";
  if (catScores.iraq >= 2.8) cat = "iraq";
  if (type === "literature") cat = "culture";

  // Media
  const media = post.video ? "video" : (post.photos?.length > 1 ? "album" : post.photos?.length ? "photo" : "text");

  const confidence = (() => { const sorted = Object.values(score).sort((a, b) => b - a); return sorted[0] ? Math.min(1, (sorted[0] - sorted[1]) / Math.max(1, sorted[0])) : 0; })();
  return { type, cat, media, len, dia: +dia.toFixed(2), score, catScores, confidence: +confidence.toFixed(2), reasons };
}

/* Third pass: merge bursts of event posts (announcement, questions, polls, winners) into one event */
export function groupEvents(items) {
  const ev = items.filter((x) => x.c.type === "event" && x.date).sort((a, b) => a.id - b.id);
  const groups = []; let cur = null;
  for (const x of ev) {
    const t = Date.parse(x.date);
    if (cur && x.id - cur.last.id <= 12 && t - Date.parse(cur.last.date) <= 8 * 3600e3) { cur.members.push(x); cur.last = x; }
    else { cur = { members: [x], last: x }; groups.push(cur); }
  }
  return groups.filter((g) => g.members.length > 1).map((g) => {
    const m = g.members;
    const announce = m.find((x) => /تعلن|نعلن|تتضمن هذه الفقرة|عن اقامة|عن إقامة|سنقدم لكم|فعالية مكونة/.test(x.text));
    const leader = announce || m.reduce((a, b) => (b.c.len > a.c.len ? b : a), m[0]);
    const all = m.map((x) => x.text).join("\n");
    const named = all.match(/فعالي[ةه]\s+(?:بعنوان\s+)?[«"“]?([^\n.،:»"”!؟]{4,45})/);
    const winners = m.find((x) => /المركز\s*الأول|المركز الاول|الفائز/.test(x.text));
    const kind = /من أنا|مَنْ أَنَا/.test(all) ? "فقرة «من أنا؟»" : /صواب|خطأ|السؤال|سؤال|الإجابة|الاجابة/.test(all) ? "مسابقة" : "فعالية";
    // event topic, e.g. "حول تاريخ الإمبراطورية الرومانية وأبرز…" / "من تاريخ العراق القديم:" / "لاختبار ذكائكم…"
    const topic = (all.match(/حول\s+((?:ال)?تاريخ[^،,.:\n•]{2,45}?)(?=\s+وأبرز|\s+و?التي|[،,.:\n•])/) || all.match(/من\s+(تاريخ\s[^،,.:\n•]{2,30}?)(?=\s*[:،,.\n•])/) || [])[1];
    const quizTopic = (all.match(/لاختبار\s+([^،,.:\n•]{3,40})/) || [])[1];
    let title = topic ? `${kind === "فعالية" ? "فعالية" : "مسابقة"}: ${topic.trim()}`
      : quizTopic ? `مسابقة لاختبار ${quizTopic.trim()}`
      : named && !/^(اليوم|الليله|الليلة|مكونة|من|في|ستتألف|ستكون)(\s|$)/.test(named[1].trim()) ? `فعالية ${named[1].trim().split(/\s(?:على|عن|التي|الذي|وذلك|حيث|في|مع)\s/)[0]}` : null;
    if (!title) {
      const d = new Date(leader.date); const day = new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(d);
      title = `${kind} ${day}`;
    }
    return { leader, members: m, winners, kind, title, questions: m.filter((x) => x !== leader && x !== winners).length };
  });
}

/* Second pass: short posts published in a burst around an event belong to that event
   (e.g. the true/false statements and questions of a live quiz). */
export function contextPass(items) {
  const byTime = items.filter((x) => x.date).sort((a, b) => a.id - b.id);
  const events = byTime.filter((x) => x.c.type === "event");
  for (const x of byTime) {
    if (!["literature", "other", "discussion"].includes(x.c.type) || x.c.len > 300 || x.c.dia > (x.c.type === "literature" ? .06 : .15)) continue;
    const t = Date.parse(x.date);
    const near = events.filter((e) => Math.abs(e.id - x.id) <= 10 && Math.abs(Date.parse(e.date) - t) <= 6 * 3600e3);
    if (near.length >= 2 || (near.length === 1 && x.c.type === "discussion")) {
      x.c.type = "event"; x.c.reasons.push(`ضمن سلسلة فعالية (${near.length} منشورات قريبة)`);
    }
  }
}
