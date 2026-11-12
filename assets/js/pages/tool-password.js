/* ==========================================================
   فاحص ومولّد كلمات المرور
   قواعد هذا الملف: كلمة المرور لا تُرسَل ولا تُخزَّن ولا تُسجَّل.
   لا localStorage، لا رابط، لا console. الاتصال الوحيد بالشبكة هو
   أول 5 أحرف من بصمة SHA-1 عند ضغط زر التسريبات.
   ========================================================== */
(function () {
  const { $, $$, esc, ic, icons, copy, fmtNum } = App;

  /* ---------------- العشوائية: crypto.getRandomValues بلا انحياز modulo ---------------- */
  const rbuf = new Uint32Array(64); let ri = rbuf.length;
  function next32() {
    if (ri >= rbuf.length) { crypto.getRandomValues(rbuf); ri = 0; }
    const v = rbuf[ri]; rbuf[ri++] = 0; // لا نُبقي القيم المستهلكة في الذاكرة
    return v;
  }
  // عدد صحيح منتظم في [0, n): نرفض القيم التي تقع في الذيل غير المكتمل من 2^32
  function randInt(n) {
    const lim = 4294967296 - (4294967296 % n); let x;
    do x = next32(); while (x >= lim);
    return x % n;
  }

  /* ---------------- مستويات القوة وزمن الكسر ---------------- */
  // المستوى من لوغاريتم عدد التخمينات (أساس 10)
  const LV = [["ضعيفة جداً", "var(--danger)"], ["ضعيفة", "var(--danger)"], ["متوسطة", "var(--warn)"], ["جيدة", "var(--success)"], ["قوية", "var(--success)"]];
  const level = (g10) => g10 < 6 ? 0 : g10 < 10 ? 1 : g10 < 14 ? 2 : g10 < 19 ? 3 : 4;
  function setMeter(el, lvl, color) {
    [...el.children].forEach((b, i) => { b.style.background = lvl !== null && i <= lvl ? color : ""; });
  }

  const SCEN = [
    ["تخمين على موقع يقيّد المحاولات", "100 محاولة في الساعة", 100 / 3600],
    ["تخمين على موقع لا يقيّدها", "10 محاولات في الثانية", 10],
    ["قاعدة بيانات مسرّبة بحماية جيدة (bcrypt)", "10 آلاف تخمين في الثانية", 1e4],
    ["قاعدة بيانات مسرّبة بحماية ضعيفة (MD5)", "10 مليارات تخمين في الثانية", 1e10],
    ["جهة بإمكانات كبيرة (مزرعة كروت شاشة)", "ترليون تخمين في الثانية", 1e12]
  ];
  const UNITS = [
    [31557600, "سنة واحدة", "سنتان", "سنوات", "سنة"], [2629800, "شهر واحد", "شهران", "أشهر", "شهراً"],
    [86400, "يوم واحد", "يومان", "أيام", "يوماً"], [3600, "ساعة واحدة", "ساعتان", "ساعات", "ساعة"],
    [60, "دقيقة واحدة", "دقيقتان", "دقائق", "دقيقة"], [1, "ثانية واحدة", "ثانيتان", "ثوانٍ", "ثانية"]
  ];
  function human(s) {
    if (!(s >= 1)) return "أقل من ثانية";
    const y = s / 31557600;
    const big = (v, w) => { const n = v >= 10 ? Math.round(v) : Math.round(v * 10) / 10; return n === 1 ? `${w} سنة` : `${fmtNum(n)} ${w} سنة`; };
    if (y >= 1e12) return "أكثر من ترليون سنة";
    if (y >= 1e9) return big(y / 1e9, "مليار");
    if (y >= 1e6) return big(y / 1e6, "مليون");
    if (y >= 1e3) return big(y / 1e3, "ألف");
    for (const [v, one, two, few, many] of UNITS) if (s >= v) {
      const n = Math.round(s / v);
      return n === 1 ? one : n === 2 ? two : n <= 10 ? `${fmtNum(n)} ${few}` : `${fmtNum(n)} ${many}`;
    }
  }
  const timeFor = (g10, rate) => human(Math.pow(10, g10 - Math.log10(rate)));
  const timesTable = (g10) => `<table class="kv pw-times"><tbody>${SCEN.map(([t, r, rate]) => `<tr><th>${t}<small>${r}</small></th><td>${timeFor(g10, rate)}</td></tr>`).join("")}</tbody></table>`;
  const pow10 = (g10) => g10 < 6 ? `${fmtNum(Math.max(1, Math.round(Math.pow(10, g10))))} تخمين تقريباً` : `نحو 10<sup>${Math.round(g10)}</sup> تخميناً`;

  /* ==========================================================
     المولّد
     ========================================================== */
  const SYM = { safe: "!@#$%*-_+=?", all: "!@#$%^&*()-_=+[]{};:,.?/<>~" };
  const AMB = /[Il1O0o|]/g;
  const cleanSyms = (v) => [...new Set([...v].filter((c) => /[!-/:-@[-`{-~]/.test(c)))].join("");

  function charSets() {
    const strip = (s) => $("#g-amb").checked ? s.replace(AMB, "") : s;
    const sets = [];
    if ($("#g-up").checked) sets.push(strip("ABCDEFGHIJKLMNOPQRSTUVWXYZ"));
    if ($("#g-low").checked) sets.push(strip("abcdefghijklmnopqrstuvwxyz"));
    if ($("#g-num").checked) sets.push(strip("0123456789"));
    if ($("#g-sym").checked) {
      const m = $("#g-symset").value, s = strip(m === "custom" ? cleanSyms($("#g-symcustom").value) : SYM[m]);
      if (s) sets.push(s);
    }
    if (!sets.length) { $("#g-low").checked = true; sets.push(strip("abcdefghijklmnopqrstuvwxyz")); }
    return sets;
  }

  // الإنتروبيا الفعلية: log2 لعدد الكلمات الممكنة. مع شرط «حرف من كل نوع» نحسبها بالتضمين والإقصاء
  function randomBits(sizes, len, req) {
    const N = sizes.reduce((a, b) => a + b, 0);
    if (!req) return len * Math.log2(N);
    let total = 0;
    for (let mask = 0; mask < 1 << sizes.length; mask++) {
      let ex = 0, k = 0;
      sizes.forEach((s, i) => { if (mask >> i & 1) { ex += s; k++; } });
      total += (k % 2 ? -1 : 1) * Math.pow(N - ex, len);
    }
    return total > 0 ? Math.log2(total) : len * Math.log2(N);
  }

  function genRandom() {
    const sets = charSets(), all = sets.join(""), len = +$("#len").value, req = $("#g-req").checked;
    // نولّد الكلمة كلها بانتظام، ونرفضها كاملة إن نقصها نوع: هكذا تبقى كل كلمة صالحة متساوية الاحتمال
    for (;;) {
      const ch = Array.from({ length: len }, () => all[randInt(all.length)]);
      if (!req || sets.every((s) => ch.some((c) => s.includes(c)))) return { v: ch.join(""), bits: randomBits(sets.map((s) => s.length), len, req), kind: "random", pool: all.length };
    }
  }

  const TAIL_SYM = "!@#$%*?";
  function genPhrase() {
    const list = $("#p-list").value === "ar" ? window.PW_AR_WORDS : window.EFF_WORDLIST;
    const n = +$("#words").value, sep = $("#p-sep").value, cap = $("#p-cap").checked;
    const words = Array.from({ length: n }, () => { const w = list[randInt(list.length)]; return cap ? w[0].toUpperCase() + w.slice(1) : w; });
    let v = words.join(sep), bits = n * Math.log2(list.length);
    if ($("#p-extra").checked) { v += randInt(10) + TAIL_SYM[randInt(TAIL_SYM.length)]; bits += Math.log2(10 * TAIL_SYM.length); }
    return { v, bits, kind: "phrase", pool: list.length };
  }

  function weakPin(p) {
    if (/^(\d)\1+$/.test(p)) return true;
    let up = true, down = true;
    for (let i = 1; i < p.length; i++) { const d = p.charCodeAt(i) - p.charCodeAt(i - 1); if (d !== 1) up = false; if (d !== -1) down = false; }
    return up || down || (p.length === 4 && /^(19|20)/.test(p));
  }
  function genPin() {
    const n = +$("#pinlen").value, safe = $("#pin-safe").checked;
    let v; do v = Array.from({ length: n }, () => randInt(10)).join(""); while (safe && weakPin(v));
    const excluded = safe ? 10 + (n <= 10 ? 2 * (11 - n) : 0) + (n === 4 ? 200 : 0) : 0;
    return { v, bits: Math.log2(Math.pow(10, n) - excluded), kind: "pin" };
  }

  let gmode = "random", cur = { v: "", bits: 0, kind: "random" };
  const hist = []; // في الذاكرة فقط

  function paint(v, kind) {
    if (kind !== "random") return esc(v).replace(/[-._ ]/g, (c) => `<span class="s">${c === " " ? "&nbsp;" : c}</span>`);
    return [...v].map((c) => /\d/.test(c) ? `<span class="d">${c}</span>` : /[A-Za-z]/.test(c) ? c : `<span class="s">${esc(c)}</span>`).join("");
  }

  function showGen() {
    $("#gen").innerHTML = paint(cur.v, cur.kind);
    const g10 = cur.bits * Math.log10(2), lvl = level(g10), [t, c] = LV[lvl];
    setMeter($("#gen-meter"), lvl, c);
    $("#gen-label").textContent = t; $("#gen-label").style.color = c;
    const L = cur.v.length, unit = cur.kind === "pin" ? (L <= 10 ? "خانات" : "خانة") : (L <= 10 ? "أحرف" : "حرفاً");
    $("#gen-bits").textContent = `${cur.bits.toFixed(1)} بت من العشوائية، ${L} ${unit}`;
    // متوسط الكسر = نصف الاحتمالات
    const avg = g10 - Math.log10(2);
    $("#gen-time").innerHTML = cur.kind === "pin"
      ? `عدد الاحتمالات ${fmtNum(Math.round(Math.pow(2, cur.bits)))} فقط. يحميه قفل المحاولات لا طوله.`
      : timeFor(avg, 1e10) === timeFor(avg, 1e12)
        ? `متوسط زمن الكسر تقديراً: <b>${timeFor(avg, 1e12)}</b> حتى أمام مزرعة كروت شاشة تجرّب ترليون كلمة في الثانية.`
        : `متوسط زمن الكسر تقديراً: <b>${timeFor(avg, 1e10)}</b> على قاعدة بيانات مسرّبة ضعيفة الحماية، و<b>${timeFor(avg, 1e12)}</b> أمام مزرعة كروت شاشة.`;
  }

  function generate() {
    cur = gmode === "phrase" ? genPhrase() : gmode === "pin" ? genPin() : genRandom();
    showGen();
  }

  function remember(item) {
    if (!item.v) return;
    const i = hist.findIndex((h) => h.v === item.v); if (i >= 0) hist.splice(i, 1);
    hist.unshift({ v: item.v, kind: item.kind, show: false }); if (hist.length > 15) hist.pop();
    drawHist();
  }
  const KIND = { random: "عشوائية", phrase: "عبارة", pin: "PIN" };
  function drawHist() {
    $("#hist-n").textContent = hist.length;
    $("#hist").innerHTML = hist.length ? hist.map((h, i) => `<li>
      <span class="badge">${KIND[h.kind]}</span>
      <code class="ltr" dir="ltr" translate="no">${h.show ? paint(h.v, h.kind) : "•".repeat(Math.min(h.v.length, 14))}</code>
      <button type="button" class="icon-btn" data-h="show" data-i="${i}" aria-label="${h.show ? "إخفاء" : "إظهار"}">${ic(h.show ? "eye-off" : "eye")}</button>
      <button type="button" class="icon-btn" data-h="copy" data-i="${i}" aria-label="نسخ">${ic("copy")}</button></li>`).join("")
      : `<li class="muted small">لا شيء بعد. يُضاف هنا ما تنسخه وما تستبدله بزر «توليد جديد».</li>`;
    $("#hist-clear").hidden = !hist.length;
    icons();
  }

  /* ---------------- الحافظة: نسخ ثم مسح بعد مدة ---------------- */
  let clipTimer = null, clipLeft = 0, clipPending = false;
  const clipBox = () => $("#clip");
  function clipMsg(html) { const b = clipBox(); b.hidden = !html; b.innerHTML = html || ""; icons(); }
  async function wipeClip() {
    clearInterval(clipTimer); clipTimer = null;
    try {
      await navigator.clipboard.writeText("");
      clipPending = false;
      clipMsg(`${ic("check-circle-2")}<span>مُسحت الحافظة. إن كان «سجلّ الحافظة» مفعّلاً في جهازك (Win+V في ويندوز، أو لوحة مفاتيح الهاتف) فقد يحتفظ بنسخة، فامسحه من هناك.</span>`);
    } catch {
      clipPending = true; // المتصفح يمنع الكتابة والصفحة ليست في الواجهة: نعيد المحاولة عند العودة
      clipMsg(`${ic("alert-triangle")}<span>لم يسمح المتصفح بمسح الحافظة الآن. سنحاول عند عودتك إلى هذه الصفحة، أو انسخ أي نص آخر لتستبدلها.</span>`);
    }
  }
  function armClip() {
    clearInterval(clipTimer); clipPending = false; clipLeft = 30;
    clipMsg(`${ic("timer")}<span>ستُمسح الحافظة بعد <b id="clip-s">30</b> ثانية.</span><button type="button" class="pw-link" data-clip="now">امسح الآن</button><button type="button" class="pw-link" data-clip="keep">أبقِها</button>`);
    clipTimer = setInterval(() => { if (--clipLeft <= 0) wipeClip(); else { const s = $("#clip-s"); if (s) s.textContent = clipLeft; } }, 1000);
  }
  async function copySecret(v, msg) {
    if (!v) return;
    await copy(v, msg);
    if ($("#clip-auto").checked) armClip(); else { clearInterval(clipTimer); clipTimer = null; clipMsg(""); }
  }
  clipBox().addEventListener("click", (e) => {
    const b = e.target.closest("[data-clip]"); if (!b) return;
    if (b.dataset.clip === "now") wipeClip(); else { clearInterval(clipTimer); clipTimer = null; clipMsg(""); }
  });
  addEventListener("focus", () => { if (clipPending) wipeClip(); });

  /* ==========================================================
     الفاحص (zxcvbn-ts محلياً + قواميس عربية/عراقية)
     ========================================================== */
  const VENDOR = ["assets/js/vendor/zxcvbn-ts-core-3.0.4.min.js", "assets/js/vendor/zxcvbn-ts-language-common-3.0.4.min.js", "assets/js/vendor/zxcvbn-ts-language-en-3.0.2.min.js"];
  let engine = null, engineState = "idle";
  const loadScript = (src) => new Promise((res, rej) => { const s = document.createElement("script"); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });

  // أرقام الهواتف العراقية: 07xx xxx xxxx بصيغها المحلية والدولية
  class IraqPhone {
    match({ password }) {
      const out = [], re = /(?:\+964|00964|964|0)7[3-9]\d{8}/g; let m;
      while ((m = re.exec(password))) out.push({ pattern: "iraqPhone", token: m[0], i: m.index, j: m.index + m[0].length - 1 });
      return out;
    }
  }

  async function loadEngine() {
    if (engineState !== "idle") return;
    engineState = "loading";
    try {
      await Promise.all(VENDOR.map(loadScript));
      const z = window.zxcvbnts, common = z["language-common"], en = z["language-en"];
      z.core.zxcvbnOptions.setOptions({
        dictionary: { ...common.dictionary, ...en.dictionary, iraqi: window.PW_IQ_DICT, arWords: window.PW_AR_WORDS },
        graphs: common.adjacencyGraphs
      });
      // رقم الهاتف معلومة شبه علنية: من يعرفك يجرّبه أولاً، ومن لا يعرفك يمرّ على أرقام الشبكات الثلاث
      z.core.zxcvbnOptions.addMatcher("iraqPhone", { Matching: IraqPhone, feedback: () => ({ warning: "iraqPhone", suggestions: [] }), scoring: () => 1e6 });
      engine = z.core.zxcvbn; engineState = "ready";
    } catch { engineState = "failed"; }
    analyze();
  }

  const WARN = {
    straightRow: "صفّ مستقيم من أزرار لوحة المفاتيح، وهو من أول ما يُجرَّب.",
    keyPattern: "نمط قصير على لوحة المفاتيح سهل التخمين.",
    simpleRepeat: "تكرار الحرف نفسه (مثل aaa) لا يضيف قوة.",
    extendedRepeat: "تكرار المقطع نفسه (مثل abcabc) لا يضيف قوة.",
    sequences: "تسلسل معروف مثل abc أو 1234.",
    recentYears: "السنوات القريبة سهلة التخمين، وغالباً هي سنة ميلاد.",
    dates: "التواريخ سهلة التخمين.",
    topTen: "هذه من أكثر عشر كلمات مرور استعمالاً في العالم.",
    topHundred: "هذه من أكثر مئة كلمة مرور استعمالاً في العالم.",
    common: "هذه كلمة مرور شائعة موجودة في قوائم المخترقين.",
    similarToCommon: "شبيهة جداً بكلمة مرور شائعة.",
    wordByItself: "كلمة واحدة من القاموس تُخمَّن بسهولة.",
    namesByThemselves: "اسم وحده يُخمَّن بسهولة.",
    commonNames: "الأسماء والألقاب الشائعة من أول ما يُجرَّب.",
    userInputs: "تحتوي معلومة مرتبطة بك أو بالصفحة.",
    pwned: "ظهرت في تسريب سابق.",
    iraqPhone: "رقم هاتف عراقي: معلومة يعرفها كل من يعرفك، وعدد أرقام الشبكات محدود."
  };
  const SUG = {
    l33t: "تبديل الأحرف المتوقع (@ بدل a، 0 بدل o، 3 بدل e) يعرفه كل برنامج كسر ولا يضيف شيئاً يُذكر.",
    reverseWords: "كتابة الكلمة بالمقلوب لا تخدع برامج الكسر.",
    allUppercase: "الأحرف الكبيرة كلها تُجرَّب تلقائياً مثل الصغيرة.",
    capitalization: "حرف كبير في أول الكلمة فقط متوقّع ولا يضيف قوة.",
    dates: "تجنّب التواريخ المرتبطة بك (ميلاد، زواج، تخرّج).",
    recentYears: "تجنّب السنوات القريبة.",
    associatedYears: "تجنّب السنوات المرتبطة بك.",
    sequences: "تجنّب التسلسلات المعروفة.",
    repeated: "تجنّب تكرار الأحرف والكلمات.",
    longerKeyboardPattern: "أنماط لوحة المفاتيح معروفة كلها. لا تعتمد عليها.",
    anotherWord: "أضف كلمات أخرى غير متوقعة ولا علاقة بينها.",
    useWords: "استعمل عدة كلمات عشوائية لا رابط بينها بدل كلمة واحدة مزخرفة.",
    noNeed: "الطول والعشوائية أهم من الرموز والأحرف الكبيرة.",
    pwned: "إن كنت تستعملها في أي حساب فغيّرها."
  };
  const DICT = {
    passwords: "كلمة مرور شائعة", commonWords: "كلمة إنجليزية شائعة", wikipedia: "كلمة معروفة", diceware: "كلمة قاموس",
    firstnames: "اسم شائع", lastnames: "لقب شائع", iraqi: "اسم أو كلمة شائعة عند العراقيين", arWords: "كلمة عربية بأحرف لاتينية", userInputs: "معلومة شخصية"
  };
  function describe(m) {
    switch (m.pattern) {
      case "dictionary": {
        let t = DICT[m.dictionaryName] || "كلمة قاموس";
        if (m.dictionaryName === "passwords") t += `، ترتيبها ${fmtNum(m.rank)}`;
        if (m.l33t) t += "، مع تبديل أحرف متوقع";
        if (m.reversed) t += "، مكتوبة بالمقلوب";
        return [t, "bad"];
      }
      case "spatial": return ["نمط على لوحة المفاتيح", "bad"];
      case "repeat": return ["تكرار", "bad"];
      case "sequence": return ["تسلسل متتابع", "bad"];
      case "regex": return ["سنة", "bad"];
      case "date": return ["تاريخ", "bad"];
      case "iraqPhone": return ["رقم هاتف عراقي", "bad"];
      case "separator": return ["فاصل", "mid"];
      default:
        // جزء لم يطابق قاموساً ولا نمطاً، لكن بعضه متوقع بطبيعته
        if (/(19[5-9]|20[0-3])\d/.test(m.token)) return ["يحتوي سنة", "bad"];
        if (/^\d+$/.test(m.token)) return ["أرقام", "mid"];
        if (m.token.length <= 2) return ["إضافة قصيرة", "mid"];
        return ["لا نمط معروف", "ok"];
    }
  }

  function classes(pw) {
    const c = { lower: /[a-z]/.test(pw), upper: /[A-Z]/.test(pw), digit: /\d/.test(pw), sym: /[!-/:-@[-`{-~ ]/.test(pw), other: /[^\x20-\x7e]/.test(pw) };
    return { ...c, count: [c.lower, c.upper, c.digit, c.sym, c.other].filter(Boolean).length, pool: (c.lower ? 26 : 0) + (c.upper ? 26 : 0) + (c.digit ? 10 : 0) + (c.sym ? 33 : 0) + (c.other ? 30 : 0) };
  }

  let effSet = null, arSet = null;
  function phraseCap(pw) {
    let body = pw, extra = 0;
    if (/\d[!@#$%*?]$/.test(body)) { body = body.slice(0, -2); extra = Math.log10(70); }
    const parts = body.toLowerCase().split(/[-._ ]/);
    if (parts.length < 3) return null;
    effSet = effSet || new Set(window.EFF_WORDLIST); arSet = arSet || new Set(window.PW_AR_WORDS);
    let g = extra;
    for (const p of parts) {
      if (arSet.has(p)) g += Math.log10(arSet.size); else if (effSet.has(p)) g += Math.log10(effSet.size); else return null;
    }
    return g;
  }

  let leak = null; // { v, n } نتيجة آخر فحص تسريبات للكلمة الحالية
  let pwnedCtl = null;
  const shown = () => $("#pw").type === "text";

  function clearResult(label = "—") {
    setMeter($("#meter"), null); $("#label").textContent = label; $("#label").style.color = "";
    $("#guesses").innerHTML = ""; $("#result").innerHTML = "";
  }

  function analyze() {
    const pw = $("#pw").value;
    if (!pw) { clearResult(); return; }
    if (engineState !== "ready") {
      clearResult(engineState === "failed" ? "تعذّر تحميل محرك الفحص" : "جارِ تحميل محرك الفحص…");
      if (engineState === "failed") $("#result").innerHTML = `<div class="alert alert-warn">${ic("wifi-off")}<span>لم تُحمَّل ملفات المحرك. حدّث الصفحة وحاول ثانية. لن نعرض تقديراً بدائياً قد يخدعك.</span></div>`;
      else loadEngine();
      icons(); return;
    }
    const r = engine(pw), cl = classes(pw);
    let g10 = r.guessesLog10, note = "";
    // المحرك يحسب كل جزء بلا نمط كأنه أرقام (10 احتمالات للحرف) تحفظاً. إن كانت الكلمة طويلة
    // ومتنوعة وأغلبها بلا أي نمط فهي على الأرجح مولّدة عشوائياً، فنحسب تلك الأجزاء بعدد أحرفها الحقيقي
    const brute = r.sequence.filter((m) => m.pattern === "bruteforce").reduce((n, m) => n + m.token.length, 0);
    if (pw.length >= 12 && cl.count >= 3 && brute / pw.length >= 0.7) {
      const adj = g10 + brute * (Math.log10(cl.pool) - 1);
      note = `لم يجد المحرك نمطاً في أغلب الكلمة، فافترضنا أنها عشوائية وحسبنا كل حرف من ${cl.pool} احتمالاً. إن كنت ألّفتها بنفسك فالتقدير المتحفظ هو ${pow10(g10)}.`;
      g10 = adj;
    }
    // المحرك يبالغ في تقدير عبارات المرور متعددة الكلمات. إن كانت كل كلماتها من قائمة معروفة فسقفها عدد التراكيب الفعلي
    const cap = phraseCap(pw);
    if (cap !== null && cap < g10) { g10 = cap; note = "كل كلماتها من قائمة عبارات مرور معروفة، فحسبنا قوتها بعدد التراكيب الممكنة من تلك القائمة: هذا أقصى ما تبلغه لو اختيرت كلماتها عشوائياً فعلاً."; }
    const hit = leak && leak.v === pw && leak.n > 0;
    const lvl = hit ? 0 : level(g10), [t, c] = hit ? ["مسرّبة: لا تستعملها", "var(--danger)"] : LV[lvl];
    setMeter($("#meter"), lvl, c);
    $("#label").textContent = t; $("#label").style.color = c;
    $("#guesses").innerHTML = pow10(g10);

    const parts = [];
    const w = r.feedback.warning;
    if (w) parts.push(`<div class="alert alert-${lvl <= 1 ? "danger" : "warn"}">${ic("alert-triangle")}<span>${WARN[w] || esc(w)}</span></div>`);
    else if (lvl === 4) parts.push(`<div class="alert alert-success">${ic("badge-check")}<span>لم يجد المحرك نمطاً سهلاً فيها. تبقى قوتها مشروطة بألا تستعملها في أكثر من حساب.</span></div>`);

    // كيف يقسّمها المخترق
    const mask = (s) => shown() ? esc(s).replace(/ /g, "&nbsp;") : "•".repeat(Math.min(s.length, 12));
    parts.push(`<div><div class="label mb-1">كيف يراها برنامج الكسر</div><div class="pw-seq" dir="ltr">${r.sequence.map((m) => { const [d, sev] = describe(m); return `<span class="pw-tok is-${sev}"><code translate="no">${mask(m.token)}</code><small dir="rtl">${d}</small></span>`; }).join("")}</div>${shown() ? "" : `<p class="small muted mt-1 mb-0">الأجزاء مخفية. اضغط زر العين لتراها.</p>`}</div>`);

    const tips = [...new Set(r.feedback.suggestions)].map((s) => SUG[s] || esc(s));
    if (pw.length < 12) tips.unshift(`طولها ${pw.length} فقط. اجعلها 12 حرفاً على الأقل، و16 فأكثر أفضل.`);
    if (/^\d+$/.test(pw)) tips.unshift("أرقام فقط: عدد الاحتمالات صغير مهما طالت.");
    if (cl.other) tips.push("تحتوي أحرفاً غير لاتينية. قواميس المحرك للعربية المكتوبة بحروفها محدودة، فقد يكون التقدير متفائلاً إن كانت كلمة أو اسماً معروفاً.");
    if (lvl <= 2 && !hit) tips.push("الأسهل والأضمن: خذ كلمة من المولّد واحفظها في مدير كلمات مرور.");
    if (tips.length) parts.push(`<div class="lk-advice"><strong>${ic("lightbulb")}كيف تقوّيها</strong><ul>${tips.map((x) => `<li>${x}</li>`).join("")}</ul></div>`);

    parts.push(`<div><div class="label mb-1">زمن الكسر التقديري بحسب نوع الهجوم</div>${timesTable(g10)}${note ? `<p class="small muted mt-1 mb-0">${note}</p>` : ""}</div>`);
    $("#result").innerHTML = parts.join("");
    icons();
  }

  function resetPwned() { if (pwnedCtl) pwnedCtl.abort(); pwnedCtl = null; leak = null; $("#pwned-out").innerHTML = ""; }

  async function pwned() {
    const pw = $("#pw").value, out = $("#pwned-out");
    if (!pw) { out.innerHTML = `<div class="alert alert-info">${ic("info")}<span>اكتب كلمة المرور في الحقل أولاً.</span></div>`; icons(); return; }
    if (pwnedCtl) pwnedCtl.abort();
    const ctl = pwnedCtl = new AbortController(); let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; ctl.abort(); }, 12000);
    out.innerHTML = `<div class="alert alert-info">${ic("loader")}<span>جارِ الفحص…</span></div>`; icons();
    try {
      const h = [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(pw)))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
      const suffix = h.slice(5);
      // Add-Padding يجعل حجم الرد ثابتاً تقريباً فلا يُستدل منه على البادئة
      const res = await fetch(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`, { headers: { "Add-Padding": "true" }, cache: "no-store", credentials: "omit", referrerPolicy: "no-referrer", signal: ctl.signal });
      if (!res.ok) throw new Error(res.status === 429 ? "busy" : "http");
      const line = (await res.text()).split("\n").find((l) => l.split(":")[0] === suffix);
      const n = line ? parseInt(line.split(":")[1], 10) || 0 : 0;
      if ($("#pw").value !== pw) return; // تغيّرت الكلمة أثناء الفحص
      leak = { v: pw, n };
      out.innerHTML = n > 0
        ? `<div class="alert alert-danger">${ic("siren")}<div><strong>ظهرت ${fmtNum(n)} مرة في تسريبات معروفة</strong><p>هي في قوائم المخترقين وتُجرَّب أولاً مهما بدت معقّدة. غيّرها في كل حساب تستعملها فيه.</p></div></div>`
        : `<div class="alert alert-success">${ic("badge-check")}<div><strong>لم تظهر في التسريبات المعروفة</strong><p>هذا لا يعني أنها قوية: يعني فقط أنها ليست في قاعدة Have I Been Pwned. انظر تقييم القوة أعلاه.</p></div></div>`;
      analyze();
    } catch (e) {
      if (ctl.signal.aborted && !timedOut) return;
      out.innerHTML = `<div class="alert alert-warn">${ic("wifi-off")}<span>${e.message === "busy" ? "خدمة الفحص مشغولة الآن. حاول بعد دقيقة." : "تعذّر الاتصال بخدمة الفحص. تحقق من الإنترنت وحاول لاحقاً."}</span></div>`;
    } finally { clearTimeout(timer); if (pwnedCtl === ctl) pwnedCtl = null; }
    icons();
  }

  /* ==========================================================
     ربط الواجهة
     ========================================================== */
  function setEye(on) {
    const p = $("#pw"), b = $("#eye");
    p.type = on ? "text" : "password";
    b.setAttribute("aria-pressed", String(on)); b.setAttribute("aria-label", on ? "إخفاء كلمة المرور" : "إظهار كلمة المرور");
    b.innerHTML = ic(on ? "eye-off" : "eye"); icons();
  }

  let deb = null;
  $("#pw").addEventListener("input", () => { resetPwned(); clearTimeout(deb); deb = setTimeout(analyze, 90); });
  $("#pw").addEventListener("focus", loadEngine, { once: true });
  $("#eye").addEventListener("click", () => { setEye(!shown()); analyze(); });
  $("#pw-clear").addEventListener("click", () => { $("#pw").value = ""; resetPwned(); setEye(false); analyze(); $("#pw").focus(); });
  $("#pwned").addEventListener("click", pwned);

  $$("#gmode [data-g]").forEach((b) => b.addEventListener("click", () => {
    gmode = b.dataset.g;
    $$("#gmode [data-g]").forEach((x) => { x.classList.toggle("active", x === b); x.setAttribute("aria-pressed", String(x === b)); });
    ["random", "phrase", "pin"].forEach((m) => { $("#g-" + m).hidden = gmode !== m; });
    generate();
  }));

  // شريط + حقل رقمي متزامنان
  [["#len", "#len-n"], ["#words", "#words-n"], ["#pinlen", "#pinlen-n"]].forEach(([r, n]) => {
    const R = $(r), N = $(n);
    R.addEventListener("input", () => { N.value = R.value; generate(); });
    N.addEventListener("change", () => { const v = Math.min(+R.max, Math.max(+R.min, Math.round(+N.value) || +R.min)); N.value = R.value = v; generate(); });
  });
  $$("#g-random input[type=checkbox], #g-phrase input[type=checkbox], #g-pin input[type=checkbox]").forEach((c) => c.addEventListener("change", generate));
  $("#p-sep").addEventListener("change", generate);
  // القائمة العربية أصغر (9.3 بت للكلمة مقابل 12.9)، فنرفع الحد الأدنى لعدد الكلمات معها
  $("#p-list").addEventListener("change", () => {
    if ($("#p-list").value === "ar" && +$("#words").value < 7) $("#words").value = $("#words-n").value = 7;
    generate();
  });
  const symUi = () => { $("#sym-field").hidden = !$("#g-sym").checked; $("#g-symcustom").hidden = $("#g-symset").value !== "custom"; };
  $("#g-sym").addEventListener("change", symUi);
  $("#g-symset").addEventListener("change", () => { symUi(); generate(); });
  $("#g-symcustom").addEventListener("input", () => { const el = $("#g-symcustom"), c = cleanSyms(el.value); if (c !== el.value) el.value = c; generate(); });

  $("#regen").addEventListener("click", () => { remember(cur); generate(); });
  $("#copy-gen").addEventListener("click", () => { remember(cur); copySecret(cur.v, "نُسخت"); });
  $("#gen").addEventListener("click", () => { const s = getSelection(); s.removeAllRanges(); const rg = document.createRange(); rg.selectNodeContents($("#gen")); s.addRange(rg); });
  $("#to-check").addEventListener("click", () => {
    $("#pw").value = cur.v; resetPwned(); analyze();
    $("#check-card").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  $("#hist").addEventListener("click", (e) => {
    const b = e.target.closest("[data-h]"); if (!b) return; const h = hist[+b.dataset.i]; if (!h) return;
    if (b.dataset.h === "copy") copySecret(h.v, "نُسخت"); else { h.show = !h.show; drawHist(); }
  });
  $("#hist-clear").addEventListener("click", () => { hist.length = 0; drawHist(); });

  // عند مغادرة الصفحة: لا نترك شيئاً يُستعاد بزر الرجوع
  addEventListener("pagehide", () => {
    $("#pw").value = ""; setEye(false); resetPwned(); clearResult();
    hist.length = 0; drawHist(); cur = { v: "", bits: 0, kind: gmode }; $("#gen").textContent = "";
  });
  addEventListener("pageshow", (e) => { if (e.persisted) generate(); });

  symUi(); drawHist(); generate();
  // نحمّل المحرك (1.7 ميغابايت، محلي) بعد استقرار الصفحة كي لا يؤخّر ظهورها
  (window.requestIdleCallback || ((f) => setTimeout(f, 900)))(() => loadEngine(), { timeout: 2500 });
})();
