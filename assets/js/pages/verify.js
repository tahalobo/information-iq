/* ==========================================================
   محقّق الأخبار — «نحن نبحث، وأنت تستلم التقرير»
   يلصق الزائر نص الخبر، فيبحث الموقع عنه في:
     1) أرشيف الإمبراطورية (معلومات الموقع ومنشورات القناة ومصادرها)
     2) ويكيبيديا العربية ومقابلها الإنجليزي (يحدد مواضيع الخبر من عناوين المقالات)
     3) مواقع تدقيق الحقائق عبر Google Fact Check (يحتاج SITE.factCheckApiKey)
     4) صفحات الويب والأخبار عبر عامل Cloudflare (يحتاج SITE.verifyEndpoint)
   ثم يقرأ كل صفحة، ويقارن كلمات الخبر المميزة وأرقامه بنصها، ويكتب تقريراً كاملاً.
   كل شيء يجري في متصفح الزائر؛ لا يُرسل النص إلا كعبارات بحث إلى المصادر أعلاه.
   ========================================================== */
(function () {
  const { $, esc, ic, icons, toast, copy, download, ensureTG, factUrl, fmtDate } = App;
  const SITE = window.SITE || {};
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------- Arabic text features (same method as scripts/enrich-sources.mjs) ---------- */
  const norm = (s) => String(s || "").toLowerCase().replace(/[ً-ٰٟـ]/g, "").replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s%]/gu, " ").replace(/\s+/g, " ").trim();
  const digits = (s) => String(s).replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d));
  const stem = (w) => w.replace(/^(وال|بال|كال|فال|ولل|لل|ال)(?=.{3,})/, "").replace(/^[وفبلك](?=.{4,})/, "");
  const STOP = new Set(("هذا هذه ذلك تلك الذي التي الذين حيث كان كانت يكون تكون كانوا ليس ليست قد لقد عند عندما بعد قبل بين خلال منذ حتى على الى إلى عن من في مع او أو ثم لكن بل اذ إذ اذا إذا ان أن إن كما مما ما لا لم لن هو هي هم هن نحن انه أنه انها أنها كل بعض غير اي أي ايضا أيضا جدا فقط اكثر أكثر اقل أقل مثل نحو حول ضد دون عبر لدى لها له لهم فيه فيها عليه عليها منه منها به بها الان اليوم يمكن يعد تعد يعتبر تعتبر تم وقد وكان وهو وهي ولا وما ولم هناك هنا ذات نفس عام سنة سنه عاما وفي ومن وعلى كشف كشفت نشر نشرت عرف عرفت برز برزت عاش عاشت ظهر ظهرت بدأ بدأت اصبح أصبح اصبحت أصبحت جعل جعلت وجد وجدت قام قامت قال قالت ذكر ذكرت اشار أشار اكد أكد اكدت أكدت يعود تعود يعرف تعرف يسمى تسمى يقع تقع يبلغ تبلغ استخدم استخدمت تمكن تمكنت حسب بحسب وفقا وفق نتيجة بسبب بفضل رغم بينما لذلك لهذا واحد واحدة اول أول اولى أولى اخر آخر اخرى أخرى عدة عديد العديد كثير الكثير معظم جميع مختلف مختلفة كبير كبيرة صغير صغيرة جديد جديدة تقريبا حوالي قرابة يزال تزال عاجل خبر اخبار أخبار انشر انشروا شارك شاركوا الحذف منقول")
    .split(/\s+/).map((w) => stem(norm(w))));
  const tokens = (t) => norm(digits(t)).split(" ").map(stem).filter((w) => w.length >= 4 && !/^\d+$/.test(w) && !/^[a-z]+$/.test(w) && !STOP.has(w));
  const numbersOf = (t) => [...new Set((digits(t).replace(/(\d)[,٬](?=\d{3})/g, "$1").match(/\d+(?:\.\d+)?/g) || []).filter((n) => n.replace(".", "").length >= 2))].slice(0, 10);
  const latinOf = (t) => [...new Set((t.match(/[A-Za-z][A-Za-z'’-]{3,}(?: [A-Z][A-Za-z'’-]{2,}){0,3}/g) || []).filter((w) => !/^https?$|^www$/i.test(w)))].slice(0, 5);
  const clean = (t) => String(t || "").replace(/https?:\/\/\S+|t\.me\/\S+|www\.\S+/gi, " ").replace(/[\p{Extended_Pictographic}‍️]/gu, " ").replace(/[ \t]+/g, " ").trim();
  const clip = (s, n) => (s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^(www|m)\./, ""); } catch { return ""; } };

  /* Word rarity: learned from the channel archive (titles + excerpts) when it is available */
  let DF = new Map(), DOCS = 0;
  function learn() {
    const posts = (window.TG && TG.posts) || []; DF = new Map(); DOCS = posts.length + (window.FACTS || []).length;
    for (const p of posts) for (const w of new Set(tokens(`${p.title} ${p.excerpt}`))) DF.set(w, (DF.get(w) || 0) + 1);
  }
  const idf = (w) => Math.log((DOCS + 1) / ((DF.get(w) || 0) + 1)) || 1;

  function features(text, boost = new Set()) {
    const tf = new Map(); tokens(text).forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
    const ranked = [...tf.keys()].map((w) => ({ w, s: (idf(w) + 0.5) * (1 + Math.log(tf.get(w))) * (boost.has(w) ? 1.7 : 1) })).sort((a, b) => b.s - a.s);
    const keys = ranked.slice(0, 20);
    const top = new Set(ranked.slice(0, 7).map((k) => k.w)); const surface = []; const seen = new Set();
    for (const raw of clean(text).replace(/[ً-ْٰـ]/g, "").split(/[^\p{L}\p{N}]+/u)) { const s = stem(norm(raw)); if (top.has(s) && !seen.has(s)) { seen.add(s); surface.push(raw); } }
    return { keys, total: keys.reduce((a, k) => a + k.s, 0), numbers: numbersOf(text), latin: latinOf(text), surface, len: text.length };
  }

  /* Does this page tell the same thing?  A real source has one passage that covers the claim. */
  function evidence(feat, pageText, pageTitle = "") {
    const n = " " + norm(digits(pageText)) + " ";
    const raw = digits(pageText).replace(/(\d)[,٬.](?=\d{3}\b)/g, "$1").toLowerCase();
    const cover = (hay) => feat.keys.reduce((a, k) => a + (hay.includes(k.w) ? k.s : 0), 0) / (feat.total || 1);
    const size = Math.max(700, Math.min(2600, feat.len * 3));
    let win = 0, at = 0;
    for (let i = 0; i < n.length; i += Math.round(size / 3)) { const c = cover(n.slice(i, i + size)); if (c > win) { win = c; at = i; } if (i + size >= n.length) break; }
    const all = cover(n);
    const core = feat.keys.slice(0, 5); const coreHit = core.filter((k) => n.includes(k.w)).length / (core.length || 1);
    const tn = " " + norm(digits(pageTitle)) + " "; const inTitle = Math.min(3, feat.keys.slice(0, 8).filter((k) => tn.includes(k.w)).length);
    const nums = feat.numbers.map((x) => ({ n: x, ok: new RegExp(`(^|[^\\d.])${x.replace(".", "\\.")}([^\\d]|$)`).test(raw) }));
    const numShare = nums.length ? nums.filter((x) => x.ok).length / nums.length : null;
    let score = win * 0.64 + all * 0.18 + inTitle * 0.04 + (numShare === null ? win * 0.1 : numShare * 0.1);
    if (coreHit < 0.6) score *= 0.6;
    if (win < 0.45) score = Math.min(score, 0.42);
    const found = feat.keys.filter((k) => n.includes(k.w)).map((k) => k.w);
    return { score: Math.min(1, score), win, all, nums, numShare, found };
  }
  function bestQuote(feat, pageText) {
    let best = null;
    for (const s of pageText.split(/(?<=[.!؟?])\s+|\n+/)) {
      const t = s.replace(/\s+/g, " ").trim(); if (t.length < 40 || t.length > 420) continue;
      const n = norm(digits(t));
      const sc = feat.keys.reduce((a, k) => a + (n.includes(k.w) ? k.s : 0), 0) / Math.sqrt(t.length / 80 + 1);
      if (!best || sc > best.sc) best = { sc, t };
    }
    return best && best.sc > 0 ? clip(best.t, 230) : "";
  }

  /* ---------- Warning signs in the wording itself ---------- */
  const FLAGS = [
    { id: "share", bad: 3, label: "يطلب منك النشر بسرعة", why: "الأخبار الحقيقية لا ترجوك أن تنشرها. هذه أوضح علامات الرسائل المتسلسلة.", re: /انشر(وا|ها|وها|ه)?\s|شارك(وا|ها|وها)?\s.{0,25}(الجميع|قبل|الكل)|قبل\s*(ال)?حذف|قبل ما ي?نحذف|لا تدعها تقف|لا تجعلها تقف|ارسل(ها|وها)? (ل|إلى)|عمم(وا|ها)?\s|أمانة في رقبتك|امانه برقبتك/ },
    { id: "urgent", bad: 2, label: "لغة استعجال وتهويل", why: "«عاجل وخطير» بلا جهة ناشرة أسلوب يسبق التفكير بالخوف.", re: /عاجل\s*(جدا|جداً|وخطير|ومهم)|خطير\s*جد|تحذير\s*(هام|مهم|خطير|عاجل)|انتبهوا|احذروا|كارثة|فضيحة|صادم|لن تصدق|لا يصدق|مصيبة|زلزال سياسي/ },
    { id: "scam", bad: 3, label: "صيغة احتيال (منحة، جائزة، رابط تسجيل)", why: "المنح والجوائز عبر روابط متداولة هي في الغالب صفحات تصيّد تسرق الحسابات.", re: /منحة\s.{0,40}(دينار|دولار|لكل|مجان|سجل|رابط)|اربح|ربحت|جائزة\s.{0,30}(رابط|سجل|اضغط)|رصيد مجان|سجل(وا)? (الآن|الان|من هنا|عبر الرابط)|رابط التسجيل|اضغط (هنا|على الرابط)|ادخل (الرابط|رقمك|الرمز)|رمز التحقق/ },
    { id: "anon", bad: 2, label: "مصدر مجهول", why: "«مصدر مطلع» و«يُقال» لا يمكن الرجوع إليها للتأكد.", re: /مصدر\s*(مطلع|خاص|موثوق|مسؤول)\b|مصادر\s*(خاصة|مطلعة|موثوقة)|تسريب(ات)?\s|يقال\s|يُقال|وردنا|وصلنا الآن|وصلني|منقول|كما وصل/ },
    { id: "secret", bad: 2, label: "ادعاء «حقيقة يخفونها»", why: "الادعاء بأن الجميع يخفي الحقيقة يُستعمل لتبرير غياب أي مصدر.", re: /يخف(ون|ي)(ها|ه)? عن|لا يريدون(ك)? أن تعرف|الحقيقة (التي|المخفية)|الإعلام (لا|لن|يتستر|يخفي)|سر خطير|ما لا يقال/ },
    { id: "shout", bad: 1, label: "علامات تعجب ورموز تنبيه كثيرة", why: "الإكثار من «!!!» و🚨 يعوّض ضعف المضمون بالضجيج.", test: (t) => (t.match(/[!؟]{2,}/g) || []).length >= 2 || (t.match(/[🚨🔴⛔❗‼️⚠️🛑📢]/gu) || []).length >= 3 },
    { id: "nosource", bad: 1, label: "لا يذكر أي جهة أو مصدر", why: "لا وكالة ولا وزارة ولا رابط: لا شيء يمكن الرجوع إليه.", test: (t, o) => !o.named && !/https?:\/\//.test(t) && t.length > 80 },
    { id: "named", bad: -2, label: "يذكر جهة يمكن الرجوع إليها", why: "ذِكر وكالة أو وزارة أو مجلة علمية بالاسم يجعل التأكد ممكناً. تأكد أن الجهة قالت ذلك فعلاً.", test: (t, o) => o.named },
    { id: "link", bad: -1, label: "يتضمن رابطاً", why: "وجود رابط يسمح بفحص المصدر. افحص الرابط نفسه قبل فتحه.", test: (t) => /https?:\/\/\S+/.test(t) }
  ];
  const NAMED = /رويترز|فرانس برس|أسوشيتد|وكالة الأنباء|واع\b|بي بي سي|BBC|الجزيرة|سكاي نيوز|العربية نت|وزارة ال|مجلس الوزراء|رئاسة الوزراء|البنك المركزي|هيئة ال|المفوضية|منظمة الصحة|اليونسكو|الأمم المتحدة|ناسا|NASA|مجلة (Science|Nature|نيتشر|ساينس|لانسيت)|جامعة |بيان رسمي|المتحدث باسم|في مؤتمر صحفي|دراسة نُ?شرت في/;
  function wording(text) {
    const o = { named: NAMED.test(text) };
    return FLAGS.map((f) => {
      const m = f.re ? text.match(f.re) : null;
      const hit = f.re ? !!m : f.test(text, o);
      return hit ? { id: f.id, bad: f.bad, label: f.label, why: f.why, quote: m ? clip(m[0].trim(), 60) : "" } : null;
    }).filter(Boolean);
  }

  /* ---------- Source 1: our own archive ---------- */
  async function searchArchive(feat, log) {
    const pool = [];
    for (const f of window.FACTS || []) {
      if (f.source === "telegram") continue;
      const body = String(f.body || "").replace(/<[^>]+>/g, " ");
      pool.push({ kind: "site", id: f.id, title: f.title, date: f.date, text: `${f.title}. ${f.excerpt}. ${body}`, sources: f.sources || [] });
    }
    const tg = ((window.TG && TG.posts) || []).filter((p) => ["fact", "news"].includes(p.type));
    // shortlist channel posts by title + excerpt, then read the full text of the best ones
    const short = tg.map((p) => { const n = " " + norm(digits(`${p.title} ${p.excerpt}`)) + " "; return { p, s: feat.keys.reduce((a, k) => a + (n.includes(k.w) ? k.s : 0), 0) / (feat.total || 1) }; })
      .filter((x) => x.s >= 0.25).sort((a, b) => b.s - a.s).slice(0, 5);
    log(`أرشيفنا: ${pool.length} معلومة مكتوبة و${tg.length} منشوراً من القناة، ${short.length} منها قريبة من الخبر`);
    for (const { p } of short) {
      try {
        const js = await (await fetch(`assets/tg/posts/${p.id}.js`)).text();
        const d = JSON.parse(js.slice(js.indexOf("{"), js.lastIndexOf("}") + 1));
        pool.push({ kind: "channel", id: "tg-" + p.id, title: p.title, date: p.date, text: `${p.title}. ${String(d.html || "").replace(/<[^>]+>/g, " ")}`, sources: d.sources || [], url: d.url });
      } catch { /* post file missing: skip */ }
    }
    return pool.map((x) => {
      const ev = evidence(feat, x.text, x.title);
      return { group: "archive", kind: x.kind === "site" ? "empire" : "channel", name: x.title, site: x.kind === "site" ? "موقع إمبراطورية المعلومات" : "قناة إمبراطورية المعلومات", url: factUrl(x.id), internal: true,
        date: x.date, lang: "ar", ev, quote: bestQuote(feat, x.text), cites: x.sources.filter((s) => s.url && !/\/\/t\.me\//.test(s.url)).slice(0, 4) };
    }).filter((x) => x.ev.score >= 0.4);
  }

  /* ---------- Source 2: Wikipedia (free API, allows browser requests) ---------- */
  const wiki = async (lang, params) => {
    const r = await fetch(`https://${lang}.wikipedia.org/w/api.php?format=json&formatversion=2&origin=*&${new URLSearchParams(params)}`);
    if (!r.ok) throw new Error("wiki " + r.status); return r.json();
  };
  const EDGE = new Set("في من على الى إلى عن مع او أو ثم بل لكن ان أن إن ما لا لم لن قد هو هي هم كان كانت حتى منذ بين عند بعد قبل كل اي أي ذلك هذا هذه التي الذي الذين حيث اذ إذ كما و ف".split(" ").map(norm));
  async function subjects(text) {
    const segs = clean(text).replace(/[ً-ْٰـ]/g, "").split(/[.،؛:!؟?()«»"\[\]\n\-–—\/]+/).map((x) => x.trim().split(/\s+/).filter(Boolean)).filter((x) => x.length);
    const cand = new Map(); let pos = 0;
    const add = (p, n, at) => { if (!cand.has(p)) cand.set(p, { n, at }); };
    for (const seg of segs) {
      for (let i = 0; i < seg.length && pos + i < 90; i++) for (let n = 4; n >= 1; n--) {
        const g = seg.slice(i, i + n); if (g.length < n) continue;
        if (EDGE.has(norm(g[0])) || EDGE.has(norm(g[n - 1])) || g.some((w) => /^\d+$/.test(digits(w)))) continue;
        if (n === 1) { const st = stem(norm(g[0])); if (st.length < 4 || STOP.has(st) || (DOCS && (DF.get(st) || 0) / DOCS > 0.03)) continue; }
        const p = g.join(" "); add(p, n, pos + i);
        const bare = p.replace(/^و(?=\S{3,})/, ""); if (bare !== p) add(bare, n, pos + i);
        if (/^لل/.test(p)) add("ال" + p.slice(2), n, pos + i);
      }
      pos += seg.length;
    }
    const phrases = [...cand.keys()].slice(0, 300); const hits = new Map();
    for (let i = 0; i < phrases.length; i += 50) {
      const batch = phrases.slice(i, i + 50);
      const j = await wiki("ar", { action: "query", titles: batch.join("|"), redirects: 1, prop: "pageprops|info", ppprop: "disambiguation" }).catch(() => null);
      if (!j || !j.query) continue;
      const fwd = new Map(); for (const m of [...(j.query.normalized || []), ...(j.query.redirects || [])]) fwd.set(m.from, m.to);
      const pages = new Map((j.query.pages || []).map((p) => [p.title, p]));
      for (const ph of batch) {
        let t = ph; for (let k = 0; k < 3 && fwd.has(t); k++) t = fwd.get(t);
        const pg = pages.get(t); if (!pg || pg.missing || pg.invalid || (pg.pageprops && "disambiguation" in pg.pageprops) || (pg.length || 0) < 1500) continue;
        const c = cand.get(ph), prev = hits.get(t);
        if (!prev || c.n > prev.n) hits.set(t, { title: t, phrase: ph, n: c.n, at: c.at });
      }
    }
    const rare = (e) => DOCS ? Math.min(...tokens(e.phrase).map((w) => DF.get(w) || 0), DOCS) / DOCS : 0;
    const weight = (e) => (e.n > 1 ? 1.5 : 0) + (e.at < 12 ? 2 : e.at < 30 ? 1 : 0) + (rare(e) < 0.004 ? 1.5 : rare(e) < 0.015 ? 0.7 : 0);
    return [...hits.values()].map((e) => ({ ...e, w: weight(e) })).sort((a, b) => b.w - a.w || a.at - b.at);
  }
  async function wikiPage(lang, title) {
    const j = await wiki(lang, { action: "query", prop: "extracts|langlinks|info", explaintext: 1, exlimit: 1, lllang: lang === "ar" ? "en" : "ar", lllimit: 1, inprop: "url", redirects: 1, titles: title }).catch(() => null);
    const p = j && j.query && j.query.pages && j.query.pages[0];
    return !p || p.missing || !p.extract ? null : { title: p.title, url: p.fullurl, text: p.extract, other: p.langlinks && p.langlinks[0] ? p.langlinks[0].title : null };
  }
  async function searchWikipedia(feat, ents, text, log) {
    const out = []; const tried = new Set();
    const consider = async (t, lead) => {
      if (tried.has(t)) return; tried.add(t);
      const pg = await wikiPage("ar", t); if (!pg) return;
      const ev = evidence(feat, pg.text, pg.title); if (lead && ev.win >= 0.4) ev.score = Math.min(1, ev.score + 0.08);
      out.push({ group: "wiki", kind: "encyclopedia", name: pg.title, site: "ويكيبيديا العربية", url: pg.url, lang: "ar", ev, quote: bestQuote(feat, pg.text), other: pg.other });
    };
    await Promise.all(ents.slice(0, 8).map((e) => consider(e.title, e.at < 10 && e.w >= 3.5)));
    // free-text search too: catches subjects whose spelling differs from the article title
    const queries = [...new Set([feat.surface.slice(0, 3).join(" "), feat.surface.slice(0, 5).join(" ")])].filter(Boolean);
    for (const q of queries) {
      const j = await wiki("ar", { action: "query", list: "search", srsearch: q, srlimit: 3, srnamespace: 0 }).catch(() => null);
      await Promise.all(((j && j.query && j.query.search) || []).map((s) => consider(s.title, false)));
    }
    log(`ويكيبيديا العربية: قرأنا ${out.length} مقالة (${[...tried].slice(0, 6).join("، ")}${tried.size > 6 ? "…" : ""})`);
    out.sort((a, b) => b.ev.score - a.ev.score);
    const best = out[0] && out[0].ev.score >= 0.45 ? out[0] : null;
    if (best && best.other) {
      const pg = await wikiPage("en", best.other);
      if (pg) { out.push({ group: "wiki", kind: "encyclopedia", name: pg.title, site: "Wikipedia", url: pg.url, lang: "en", twinOf: best.name, ev: { ...best.ev, score: best.ev.score * 0.94, nums: [], numShare: null }, quote: clip(pg.text.split(/\n/)[0], 230) }); log(`ويكيبيديا الإنجليزية: المقالة المقابلة «${pg.title}»`); }
    }
    return out.filter((x) => x.ev.score >= 0.4);
  }

  /* ---------- Source 3: published fact-checks (Google Fact Check Tools API, optional key) ---------- */
  const FALSE_RE = /خاط|خطأ|زائف|مزيف|مفبرك|مضلل|كاذب|غير صحيح|لا صحة|إشاعة|شائعة|ملفق|false|fake|mislead|incorrect|hoax|pants on fire|no evidence|satire|altered|fabricat/i;
  const TRUE_RE = /^(صحيح|حقيقي|مؤكد|true|correct|accurate)|صحيح جزئي|mostly true/i;
  async function searchFactChecks(feat, log) {
    if (!SITE.factCheckApiKey) { log("مواقع تدقيق الحقائق: غير مفعّلة في هذا الموقع"); return { on: false, items: [] }; }
    const items = []; const seen = new Set();
    for (const q of [...new Set([feat.surface.slice(0, 5).join(" "), feat.surface.slice(0, 3).join(" ")])].filter(Boolean)) {
      try {
        const r = await fetch(`https://factchecktools.googleapis.com/v1alpha1/claims:search?pageSize=8&query=${encodeURIComponent(q)}&key=${encodeURIComponent(SITE.factCheckApiKey)}`);
        if (!r.ok) continue;
        for (const c of (await r.json()).claims || []) for (const rv of c.claimReview || []) {
          if (!rv.url || seen.has(rv.url)) continue; seen.add(rv.url);
          const ev = evidence(feat, `${c.text || ""}. ${rv.title || ""}`, rv.title || "");
          if (ev.all < 0.35) continue;
          const rating = rv.textualRating || "";
          items.push({ group: "factcheck", kind: "factcheck", name: rv.title || c.text, site: (rv.publisher && (rv.publisher.name || rv.publisher.site)) || hostOf(rv.url), url: rv.url, lang: rv.languageCode || "ar",
            date: (rv.reviewDate || c.claimDate || "").slice(0, 10), rating, verdict: FALSE_RE.test(rating) ? "false" : TRUE_RE.test(rating) ? "true" : "mixed", claim: c.text || "", ev: { ...ev, score: Math.max(ev.score, ev.all) } });
        }
      } catch { /* network: skip */ }
    }
    log(`مواقع تدقيق الحقائق: ${items.length} تدقيقاً منشوراً يخص هذا الخبر`);
    return { on: true, items };
  }

  /* ---------- Source 4: the open web, through our Cloudflare worker (optional) ---------- */
  const KINDS = [["encyclopedia", /(^|\.)(wikipedia\.org|britannica\.com|marefa\.org|worldhistory\.org)$/], ["science", /(^|\.)(nature\.com|science\.org|nih\.gov|nasa\.gov|esa\.int|sciencedaily\.com|nationalgeographic\.com|livescience\.com|mayoclinic\.org)$|\.edu(\.[a-z]{2})?$|\.ac\.[a-z]{2}$/],
    ["official", /(^|\.)(unesco\.org|who\.int|un\.org)$|\.gov(\.[a-z]{2})?$/], ["factcheck", /(^|\.)(misbar\.com|fatabyyano\.net|factcheck\.afp\.com|snopes\.com|politifact\.com|factcheck\.org|fullfact\.org|tech4peace\.org)$/],
    ["news", /(^|\.)(bbc\.com|bbc\.co\.uk|aljazeera\.net|reuters\.com|apnews\.com|dw\.com|france24\.com|skynewsarabia\.com|cnn\.com|alarabiya\.net|independentarabia\.com|aawsat\.com|ina\.iq|shafaq\.com|rudaw\.net|alsumaria\.tv|almadapaper\.net|alhurra\.com|rt\.com)$/]];
  const kindOf = (h) => { for (const [k, re] of KINDS) if (re.test(h)) return k; return "web"; };
  async function searchWeb(feat, title, log) {
    const base = (SITE.verifyEndpoint || SITE.reverseSearchEndpoint || "").replace(/\/+$/, "");
    if (!base) { log("بحث الويب والأخبار: غير مفعّل في هذا الموقع"); return { on: false, items: [] }; }
    const queries = [...new Set([clip(title, 90).replace(/…$/, ""), [...feat.surface.slice(0, 5), feat.numbers.find((n) => /^(1[0-9]|20)\d\d$/.test(n)) || ""].join(" ").trim()])].filter(Boolean);
    try {
      const r = await fetch(`${base}/verify`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries }) });
      const j = await r.json(); if (!r.ok || j.error) throw new Error(j.error || r.status);
      const items = (j.results || []).map((p) => {
        const host = hostOf(p.url); const ev = evidence(feat, p.text || "", p.title || ""); const kind = kindOf(host);
        const rating = kind === "factcheck" && FALSE_RE.test(`${p.title} ${(p.text || "").slice(0, 600)}`) ? "false" : null;
        return { group: "web", kind, name: clip(p.title || host, 110), site: p.site || host, url: p.url, lang: /[ء-ي]/.test((p.text || "").slice(0, 400)) ? "ar" : "en", date: (p.date || "").slice(0, 10), ev, quote: bestQuote(feat, p.text || ""), verdict: rating };
      }).filter((x) => x.ev.score >= 0.4);
      log(`بحث الويب (${j.engine || "محرك البحث"}): فتحنا ${(j.results || []).length} صفحة، ${items.length} منها تطابق الخبر`);
      return { on: true, items, opened: (j.results || []).length, engine: j.engine };
    } catch (e) { log(`بحث الويب: تعذّر (${String(e.message || e).slice(0, 40)})`); return { on: true, failed: true, items: [] }; }
  }

  /* ---------- Verdict ---------- */
  const numbersOk = (s) => s.ev.numShare === null || s.ev.numShare >= 0.5;
  const strength = (s) => (s.ev.score >= 0.58 && numbersOk(s) ? "confirm" : "related");
  function judge(sources, flags, feat) {
    const fc = sources.filter((s) => s.verdict);
    const debunk = fc.filter((s) => s.verdict === "false"), confirmFc = fc.filter((s) => s.verdict === "true");
    const conf = sources.filter((s) => !s.verdict && strength(s) === "confirm"), rel = sources.filter((s) => !s.verdict && strength(s) === "related");
    const sites = new Set(conf.map((s) => (s.internal ? "empire" : hostOf(s.url).split(".").slice(-2).join("."))));
    const best = Math.max(0, ...conf.map((s) => s.ev.score), ...rel.map((s) => s.ev.score));
    const bad = flags.filter((f) => f.bad > 0).reduce((a, f) => a + f.bad, 0);
    const numMiss = feat.numbers.filter((n) => !sources.some((s) => (s.ev.nums || []).some((x) => x.n === n && x.ok)));
    let v;
    if (debunk.length) v = { id: "false", tone: "danger", icon: "shield-x", title: "مفنَّد: مدققو الحقائق كذّبوه", score: 8,
      text: `${debunk.length === 1 ? "جهة تدقيق مستقلة نشرت" : `${debunk.length} جهات تدقيق نشرت`} تفنيداً لهذا الادعاء. لا تنشره.` };
    else if (confirmFc.length || sites.size >= 2 || (sites.size === 1 && best >= 0.72)) v = { id: "supported", tone: "success", icon: "shield-check", title: "تدعمه المصادر", score: Math.round(72 + best * 26 - Math.min(10, bad * 2)),
      text: `وجدنا ${confirmFc.length && !sites.size ? "تدقيقاً منشوراً يؤكد" : sites.size > 2 ? `${sites.size} مصادر مستقلة تروي` : sites.size === 2 ? "مصدرين مستقلين يرويان" : "مصدراً يروي"} مضمون الخبر نفسه.${numMiss.length ? ` لكن ${numMiss.length === 1 ? "رقماً واحداً" : "بعض الأرقام"} في الخبر لم ${numMiss.length === 1 ? "يرد" : "ترد"} في أي مصدر، فراجعها.` : ""}` };
    else if (sites.size === 1) v = { id: "partly", tone: "warn", icon: "shield-half", title: "مدعوم بمصدر واحد", score: Math.round(52 + best * 20 - bad * 2),
      text: "مصدر واحد فقط يروي مضمون الخبر. يكفي للاطمئنان المبدئي، ولا يكفي للجزم." };
    else if (rel.length) v = { id: "related", tone: "warn", icon: "shield-alert", title: "الموضوع حقيقي، والخبر غير مؤكد", score: Math.max(15, Math.round(30 + best * 25 - bad * 3)),
      text: "وجدنا مصادر تتناول موضوع الخبر، لكن لم نجد فيها ما يؤكد تفاصيله. قد يكون الخبر مبنياً على حقيقة أضيفت إليها تفاصيل." };
    else if (bad >= 4) v = { id: "suspicious", tone: "danger", icon: "shield-x", title: "على الأرجح مضلِّل", score: Math.max(5, 22 - bad * 2),
      text: "لم نجد أي مصدر يؤكده، وصياغته تحمل علامات التضليل المعروفة. لا تنشره." };
    else v = { id: "unverified", tone: "warn", icon: "shield-question", title: "لم نجد ما يؤكده", score: Math.max(12, 34 - bad * 4),
      text: "بحثنا ولم نجد مصدراً يروي هذا الخبر. هذا لا يعني أنه كاذب، لكن لا تنشره قبل أن تجد من يؤكده." };
    v.score = Math.max(3, Math.min(98, v.score));
    return { ...v, conf, rel, fc, numMiss, sites: sites.size };
  }

  /* ---------- Page ---------- */
  const root = $("#verify-app");
  const SAMPLES = [
    "كشفت الحفريات في مدينة بومبي الإيطالية عن مطاعم وجبات سريعة عمرها 2000 عام كانت تقدم الطعام الساخن للرومان في الشوارع",
    "عاجل وخطير!! منحة 500 ألف دينار لكل عائلة عراقية، سجلوا الآن عبر الرابط وانشروها قبل الحذف",
    "برزت زنوبيا حاكمة لمملكة تدمر في القرن الثالث الميلادي وسيطرت على مصر قبل أن يهزمها الإمبراطور أورليان عام 272"
  ];
  root.innerHTML = `
    <div class="card vf-ask">
      <div class="card-title"><span class="ico ico-sm">${ic("search-check")}</span><h2>الصق الخبر، ونحن نبحث عنه</h2></div>
      <p class="small muted">اكتب الخبر أو المعلومة كما وصلتك. نبحث عنها في المصادر، نقرأ الصفحات، ونعطيك النتيجة مع تقرير بكل ما وجدناه.</p>
      <textarea class="textarea" id="vf-text" maxlength="3000" placeholder="مثال: أعلنت وزارة … أن … / اكتشف علماء … عام …" aria-label="نص الخبر"></textarea>
      <div class="vf-row"><span class="small muted" id="vf-count">0 / 3000</span>
        <div class="btn-row"><button class="btn btn-ghost" id="vf-paste">${ic("clipboard-paste")}الصق</button><button class="btn btn-primary btn-lg" id="vf-go">${ic("search-check")}تحقّق الآن</button></div></div>
      <div class="vf-samples"><span class="small muted">جرّب:</span>${SAMPLES.map((s, i) => `<button class="tag-link" data-sample="${i}">${esc(clip(s, 46))}</button>`).join("")}</div>
      <p class="privacy-note">${ic("lock")}<span>النص يبقى في متصفحك. لا نرسل إلا عبارات بحث قصيرة منه إلى ويكيبيديا ومحركات البحث.</span></p>
    </div>
    <div id="vf-out"></div>`;
  const ta = $("#vf-text"), out = $("#vf-out");
  const count = () => ($("#vf-count").textContent = `${ta.value.length} / 3000`);
  ta.addEventListener("input", count);
  $("#vf-paste").addEventListener("click", async () => { try { ta.value = (await navigator.clipboard.readText()).slice(0, 3000); count(); ta.focus(); } catch { toast("اسمح للمتصفح بالوصول إلى الحافظة، أو الصق يدوياً", "clipboard-x"); } });
  root.addEventListener("click", (e) => { const b = e.target.closest("[data-sample]"); if (b) { ta.value = SAMPLES[+b.dataset.sample]; count(); run(); } });
  $("#vf-go").addEventListener("click", run);
  ta.addEventListener("keydown", (e) => { if ((e.ctrlKey || e.metaKey) && e.key === "Enter") run(); });
  const pre = App.param && App.param("q"); if (pre) { ta.value = pre.slice(0, 3000); count(); }

  const STEPS = [["read", "نقرأ الخبر ونحدد مواضيعه وأرقامه"], ["archive", "نبحث في أرشيف الإمبراطورية"], ["wiki", "نبحث في ويكيبيديا العربية والإنجليزية"], ["fc", "نسأل مواقع تدقيق الحقائق"], ["web", "نبحث في الويب والأخبار ونقرأ الصفحات"], ["judge", "نقارن ونكتب التقرير"]];
  let busy = false;
  async function run() {
    if (busy) return;
    const text = clean(ta.value);
    if (tokens(text).length < 3) { toast("اكتب الخبر بتفصيل أكثر: جملة كاملة على الأقل", "pencil"); ta.focus(); return; }
    busy = true; $("#vf-go").disabled = true;
    out.innerHTML = `<div class="card vf-progress"><div class="card-title"><span class="ico ico-sm">${ic("loader")}</span><h3>نبحث الآن…</h3></div><ol class="vf-steps">${STEPS.map(([id, t]) => `<li data-step="${id}"><i></i><span>${t}</span><small></small></li>`).join("")}</ol></div>`;
    icons(); out.scrollIntoView({ behavior: "smooth", block: "start" });
    const journal = []; const started = Date.now();
    const step = (id, state, note) => { const li = out.querySelector(`[data-step="${id}"]`); if (!li) return; li.className = state; if (note) li.querySelector("small").textContent = note; };
    const log = (line) => journal.push(line);
    try {
      step("read", "on"); await ensureTG(); learn();
      const flags = wording(ta.value);
      const ents = await subjects(text).catch(() => []);
      const feat = features(text, new Set(ents.filter((e) => e.n > 1 || e.at < 25).flatMap((e) => tokens(e.phrase))));
      const title = clip(text.split(/(?<=[.!؟?])\s|\n/)[0], 110);
      log(`الكلمات المميزة: ${feat.surface.join("، ") || "—"}`); if (ents.length) log(`مواضيع لها مقالات موسوعية: ${ents.slice(0, 8).map((e) => e.title).join("، ")}`);
      step("read", "done", `${ents.length ? ents.slice(0, 3).map((e) => e.title).join("، ") : feat.surface.slice(0, 3).join("، ")}`);

      step("archive", "on"); const arch = await searchArchive(feat, log).catch(() => []); step("archive", "done", arch.length ? `${arch.length} نتيجة` : "لا شيء");
      step("wiki", "on"); const wk = await searchWikipedia(feat, ents, text, log).catch(() => { log("ويكيبيديا: تعذّر الاتصال"); return []; }); step("wiki", "done", wk.length ? `${wk.length} مقالة مطابقة` : "لا مقالة مطابقة");
      step("fc", "on"); const fc = await searchFactChecks(feat, log); step("fc", fc.on ? "done" : "skip", fc.on ? `${fc.items.length} تدقيقاً` : "غير مفعّل");
      step("web", "on"); const web = await searchWeb(feat, title, log); step("web", web.on && !web.failed ? "done" : "skip", !web.on ? "غير مفعّل" : web.failed ? "تعذّر" : `${web.items.length} صفحة مطابقة`);
      step("judge", "on"); await sleep(250);

      // one entry per page, strongest first; fact-checks lead
      const seen = new Set();
      const ranked = [...fc.items, ...arch, ...wk, ...web.items].filter((s) => !seen.has(s.url) && seen.add(s.url))
        .sort((a, b) => (b.verdict ? 1 : 0) - (a.verdict ? 1 : 0) || b.ev.score - a.ev.score);
      // every page that tells the story, plus the few best that only cover its subject
      let weak = 0;
      const sources = ranked.filter((s) => s.verdict || strength(s) === "confirm" || (s.ev.score >= 0.45 && ++weak <= 4)).slice(0, 12);
      const verdict = judge(sources, flags, feat);
      step("judge", "done");
      report({ text, title, feat, ents, flags, sources, verdict, journal, layers: { fc: fc.on, web: web.on && !web.failed }, secs: Math.max(1, Math.round((Date.now() - started) / 1000)) });
    } catch (e) {
      out.innerHTML = `<div class="alert alert-danger">${ic("wifi-off")}<div><strong>تعذّر إكمال البحث</strong><p>تحقق من اتصالك بالإنترنت ثم حاول مجدداً.</p></div></div>`; icons();
    }
    busy = false; $("#vf-go").disabled = false;
  }

  const KIND = { empire: ["crown", "أرشيف الإمبراطورية"], channel: ["send", "قناة الإمبراطورية"], encyclopedia: ["library", "موسوعة"], science: ["flask-conical", "مصدر علمي"], official: ["landmark", "جهة رسمية"], news: ["newspaper", "صحافة"], factcheck: ["shield-check", "تدقيق حقائق"], web: ["globe", "موقع"] };
  const RATE = { false: ["danger", "يفنّد الخبر"], true: ["success", "يؤكد الخبر"], mixed: ["warn", "تقييم مختلط"] };
  function sourceCard(s, i) {
    const k = KIND[s.kind] || KIND.web; const st = s.verdict ? RATE[s.verdict] : strength(s) === "confirm" ? ["success", "يروي الخبر نفسه"] : ["warn", "يتناول الموضوع فقط"];
    const nums = (s.ev.nums || []).length ? `<span class="vf-nums">${s.ev.nums.map((x) => `<em class="${x.ok ? "ok" : "no"}" title="${x.ok ? "الرقم مذكور في المصدر" : "الرقم غير مذكور في المصدر"}">${ic(x.ok ? "check" : "x")}${esc(x.n)}</em>`).join("")}</span>` : "";
    return `<li class="vf-src t-${st[0]}">
      <div class="vf-src-head"><b>${String(i + 1).padStart(2, "0")}</b><div><a href="${esc(s.internal ? s.url : App.safeUrl(s.url) || "#")}" ${s.internal ? "" : 'target="_blank" rel="noopener noreferrer"'}><strong dir="auto">${esc(s.name)}</strong></a>
        <small>${esc(s.site || "")}${s.internal ? "" : ` · <i class="ltr">${esc(hostOf(s.url))}</i>`}${s.date ? ` · ${esc(fmtDate ? fmtDate(s.date) : s.date)}` : ""}</small></div></div>
      <div class="vf-chips"><em class="vf-chip">${ic(k[0])}${k[1]}</em><em class="vf-chip c-${st[0]}">${st[1]}</em>${s.rating ? `<em class="vf-chip c-${st[0]}">التقييم: ${esc(clip(s.rating, 40))}</em>` : `<em class="vf-chip">تطابق ${Math.round(s.ev.score * 100)}%</em>`}${s.lang && s.lang !== "ar" ? `<em class="vf-chip">${s.lang === "en" ? "بالإنجليزية" : esc(s.lang)}</em>` : ""}${s.twinOf ? `<em class="vf-chip">المقابل لمقالة «${esc(s.twinOf)}»</em>` : ""}</div>
      ${s.claim ? `<p class="vf-claim"><span>الادعاء المدقَّق:</span> ${esc(clip(s.claim, 200))}</p>` : ""}
      ${s.quote ? `<q dir="auto">${esc(s.quote)}</q>` : ""}
      ${nums ? `<div class="vf-numrow"><span class="small muted">أرقام الخبر في هذا المصدر:</span>${nums}</div>` : ""}
      ${s.cites && s.cites.length ? `<div class="vf-cites"><span class="small muted">مصادره:</span>${s.cites.map((c) => `<a class="link small" href="${esc(c.url)}" target="_blank" rel="noopener">${esc(clip(c.name, 40))}</a>`).join(" · ")}</div>` : ""}
    </li>`;
  }

  function report(R) {
    const { verdict: v, sources, flags, feat, ents, journal, text } = R;
    const q = encodeURIComponent(clip(R.title, 120)); const qk = encodeURIComponent(feat.surface.slice(0, 5).join(" "));
    const C = 2 * Math.PI * 52; const bad = flags.filter((f) => f.bad > 0), good = flags.filter((f) => f.bad < 0);
    const manual = [["Google", `https://www.google.com/search?q=${q}`, "search"], ["أخبار Google", `https://news.google.com/search?q=${qk}&hl=ar`, "newspaper"], ["Fact Check Explorer", `https://toolbox.google.com/factcheck/explorer/search/${qk}`, "shield-check"], ["مسبار", `https://www.google.com/search?q=${qk}+site:misbar.com`, "radar"], ["فتبينوا", `https://www.google.com/search?q=${qk}+site:fatabyyano.net`, "scan-search"], ["ويكيبيديا", `https://ar.wikipedia.org/w/index.php?search=${qk}`, "library"]];
    const advice = { false: "لا تنشره، وإن وصلك من شخص تعرفه فأرسل له رابط التفنيد.", supported: "يمكنك مشاركته. والأفضل أن ترفق معه أحد المصادر أدناه.", partly: "إن أردت نشره فاذكر المصدر، ولا تقدّمه على أنه مؤكد.", related: "لا تنشر التفاصيل غير المؤكدة. انشر ما تؤكده المصادر فقط.", suspicious: "لا تنشره، ولا تفتح أي رابط مرفق به.", unverified: "انتظر. إن كان صحيحاً فسيظهر في مصدر معروف خلال ساعات." }[v.id];
    const missing = [!R.layers.web ? "صفحات الويب ووكالات الأنباء" : "", !R.layers.fc ? "قواعد بيانات مدققي الحقائق" : ""].filter(Boolean);
    out.innerHTML = `
    <article class="vf-report" id="vf-report">
      <header class="card vf-verdict t-${v.tone}">
        <div class="score-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--surface-2)" stroke-width="12"/><circle cx="60" cy="60" r="52" fill="none" stroke="var(--${v.tone})" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - v.score / 100)}"/></svg><span class="val" style="color:var(--${v.tone})">${v.score}%</span></div>
        <div><span class="kicker">نتيجة التحقق · مؤشر الثقة</span><h2 style="color:var(--${v.tone})">${ic(v.icon)}${v.title}</h2><p>${esc(v.text)}</p><p class="vf-advice">${ic("corner-down-left")}<strong>نصيحتنا:</strong> ${advice}</p></div>
      </header>

      <section class="card"><div class="card-title"><span class="ico ico-sm">${ic("quote")}</span><h3>الخبر الذي فحصناه</h3></div>
        <blockquote class="vf-quote">${esc(clip(text, 700))}</blockquote>
        <div class="vf-facts">
          <div><span>بحثنا عن</span><p>${feat.surface.map((w) => `<em>${esc(w)}</em>`).join("") || "—"}</p></div>
          ${ents.length ? `<div><span>مواضيع تعرّفنا عليها</span><p>${ents.slice(0, 6).map((e) => `<em>${esc(e.title)}</em>`).join("")}</p></div>` : ""}
          ${feat.numbers.length ? `<div><span>أرقام وتواريخ في الخبر</span><p>${feat.numbers.map((n) => `<em class="${v.numMiss.includes(n) ? "no" : "ok"}">${ic(v.numMiss.includes(n) ? "x" : "check")}${esc(n)}</em>`).join("")}</p><small class="muted">${v.numMiss.length ? "المعلَّم بـ✗ لم يرد في أي مصدر وجدناه." : "كل الأرقام وردت في المصادر."}</small></div>` : ""}
        </div></section>

      <section class="card"><div class="card-title"><span class="ico ico-sm">${ic("library")}</span><h3>ما وجدناه في المصادر <span class="badge">${sources.length}</span></h3></div>
        ${sources.length ? `<p class="small muted">${v.conf.length + v.fc.length ? `${v.conf.length + v.fc.length} ${v.conf.length + v.fc.length === 1 ? "مصدر يروي" : "مصادر تروي"} الخبر نفسه` : "لا مصدر يروي الخبر نفسه"}${v.rel.length ? `، و${v.rel.length} ${v.rel.length === 1 ? "يتناول" : "تتناول"} موضوعه فقط` : ""}. فتحنا كل صفحة وقارنّا نصها بالخبر.</p><ol class="vf-sources">${sources.map(sourceCard).join("")}</ol>`
          : `<div class="alert alert-warn">${ic("search-x")}<div><strong>لم نجد أي صفحة تطابق هذا الخبر</strong><p>بحثنا في أرشيفنا وفي ويكيبيديا العربية${R.layers.web ? " وفي الويب" : ""}. الأخبار اليومية الحديثة لا تصل إلى الموسوعات، فأكمل البحث بالأزرار أدناه.</p></div></div>`}
      </section>

      <section class="card"><div class="card-title"><span class="ico ico-sm">${ic("scan-text")}</span><h3>تحليل الصياغة</h3></div>
        ${bad.length || good.length ? `<ul class="vf-flags">${[...bad, ...good].map((f) => `<li class="${f.bad > 0 ? "bad" : "good"}">${ic(f.bad > 0 ? "triangle-alert" : "circle-check")}<div><strong>${esc(f.label)}${f.quote ? ` <span class="vf-hit">«${esc(f.quote)}»</span>` : ""}</strong><p>${esc(f.why)}</p></div></li>`).join("")}</ul>`
          : `<p class="muted mb-0">الصياغة هادئة: لا استعجال ولا تهويل ولا طلب نشر. هذا لا يثبت صحة الخبر، لكنه يخلو من علامات الرسائل المضللة.</p>`}
      </section>

      <section class="card"><div class="card-title"><span class="ico ico-sm">${ic("compass")}</span><h3>أكمل البحث بنفسك</h3></div>
        ${missing.length ? `<p class="small muted">هذا الفحص لم يشمل: ${missing.join("، و")}. الأزرار الآتية تفتح البحث عن خبرك فيها مباشرة.</p>` : ""}
        <div class="vf-manual">${manual.map(([n, u, i]) => `<a class="btn btn-ghost btn-sm" href="${esc(u)}" target="_blank" rel="noopener">${ic(i)}${n}</a>`).join("")}</div>
        <details class="vf-log"><summary>${ic("list-checks")}سجل البحث: ماذا فعلنا خلال ${R.secs} ثانية</summary><ol>${journal.map((l) => `<li>${esc(l)}</li>`).join("")}</ol></details>
      </section>

      <div class="vf-actions">
        <button class="btn btn-primary" id="vf-copy">${ic("clipboard-copy")}انسخ التقرير</button>
        <button class="btn btn-ghost" id="vf-save">${ic("download")}حمّله ملفاً</button>
        <button class="btn btn-ghost" id="vf-print">${ic("printer")}اطبعه / PDF</button>
        <a class="btn btn-ghost" href="contact.html?type=rumor">${ic("flag")}أرسله لفريقنا</a>
        <button class="btn btn-ghost" id="vf-new">${ic("rotate-ccw")}خبر جديد</button>
      </div>
      <p class="small muted vf-disclaimer">${ic("info")}<span>هذا تحقق آلي: يقيس هل تروي المصادر مضمون الخبر، ولا يحكم على صدق المصادر نفسها. النتيجة تساعدك على القرار ولا تغني عن قراءة المصادر.</span></p>
    </article>`;
    icons();
    const plain = () => [`تقرير التحقق — ${SITE.name || "الإمبراطورية العراقية"}`, new Date().toLocaleString("ar-IQ-u-nu-latn"), "", `الخبر: ${clip(text, 700)}`, "", `النتيجة: ${v.title} (مؤشر الثقة ${v.score}%)`, v.text, `النصيحة: ${advice}`, "",
      `المصادر (${sources.length}):`, ...sources.map((s, i) => `${i + 1}. ${s.name} — ${s.site || hostOf(s.url)} [${s.verdict ? RATE[s.verdict][1] : strength(s) === "confirm" ? "يروي الخبر نفسه" : "يتناول الموضوع فقط"}${s.rating ? `، التقييم: ${s.rating}` : `، تطابق ${Math.round(s.ev.score * 100)}%`}]\n   ${s.internal ? new URL(s.url, document.baseURI).href : s.url}${s.quote ? `\n   «${s.quote}»` : ""}`),
      ...(sources.length ? [] : ["لم نجد أي صفحة تطابق هذا الخبر."]), "",
      ...(feat.numbers.length ? [`أرقام الخبر: ${feat.numbers.map((n) => `${n} ${v.numMiss.includes(n) ? "✗" : "✓"}`).join("، ")}`, ""] : []),
      "تحليل الصياغة:", ...(flags.length ? flags.map((f) => `${f.bad > 0 ? "⚠" : "✓"} ${f.label}${f.quote ? ` «${f.quote}»` : ""}`) : ["لا علامات تضليل في الصياغة."]), "",
      "سجل البحث:", ...journal.map((l) => `- ${l}`), "", "تحقق آلي يقيس تطابق المصادر مع الخبر، ولا يغني عن قراءتها.", new URL("verify.html", document.baseURI).href].join("\n");
    $("#vf-copy").addEventListener("click", () => copy(plain(), "نُسخ التقرير"));
    $("#vf-save").addEventListener("click", () => download(new Blob(["﻿" + plain()], { type: "text/plain;charset=utf-8" }), "تقرير-التحقق.txt"));
    $("#vf-print").addEventListener("click", () => { document.body.classList.add("vf-printing"); const done = () => { document.body.classList.remove("vf-printing"); removeEventListener("afterprint", done); }; addEventListener("afterprint", done); print(); });
    $("#vf-new").addEventListener("click", () => { out.innerHTML = ""; ta.value = ""; count(); ta.focus(); root.scrollIntoView({ behavior: "smooth", block: "start" }); });
    $("#vf-report").scrollIntoView({ behavior: "smooth", block: "start" });
  }
  icons();
  if (pre && App.fromOwnSite()) run();
})();
