(function () {
  const { $, $$, esc, ic, icons, store, copy, param, toast, download } = App;
  const S = window.SITE;
  const box = $("#quiz");
  const LETTERS = ["أ", "ب", "ج", "د"];
  const TIME = 20;
  const RANKS = [
    [10, "إمبراطور المعلومات", "crown", "مستوى أسطوري! أنت المرجع الذي يسأله الجميع."],
    [8, "وزير المعرفة", "medal", "ممتاز! معلوماتك واسعة ودقيقة."],
    [6, "حكيم بابل", "scroll-text", "جيد جداً. قليل من القراءة وتصل إلى القمة."],
    [4, "طالب في بيت الحكمة", "book-open", "بداية جيدة. تصفّح مكتبتنا وعُد بقوة."],
    [0, "مستكشف جديد", "compass", "لا بأس، كل إمبراطور بدأ من هنا. جرّب مرة أخرى."]
  ];
  const rankFor = (s10) => RANKS.find(([min]) => s10 >= min);
  const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // question banks: curated + generated from the Telegram channel (scripts/build-quiz.mjs)
  const BANKS = {
    mix: { name: "مزيج الإمبراطورية", desc: "من كل الساحات معاً", icon: "shuffle", list: [...window.QUIZ, ...(window.QUIZ_CHANNEL || []), ...(window.QUIZ_AUTO || [])] },
    curated: { name: "أسئلة مختارة", desc: "تاريخ العراق والعلوم والفضاء", icon: "star", list: window.QUIZ },
    channel: { name: "فعاليات القناة", desc: "من مسابقاتنا على تليغرام", icon: "party-popper", list: window.QUIZ_CHANNEL || [] },
    auto: { name: "من منشورات القناة", desc: "أكمل الفراغ وصح أم خطأ", icon: "send", list: window.QUIZ_AUTO || [] }
  };
  const factOnly = param("fact");
  let bank = BANKS[store.get("quiz-bank", "mix")] && BANKS[store.get("quiz-bank", "mix")].list.length ? store.get("quiz-bank", "mix") : "mix";
  let timed = store.get("quiz-timed", true);
  let qs = [], i = 0, score = 0, answers = [], timer = null, left = 0, streak = 0, bestStreak = 0, tStart = 0, locked = false;
  let story = null; // { blob, url }

  const findFact = (id) => id && (window.FACTS.find((x) => x.id === id) || (window.TG_ITEMS || []).find((x) => x.id === id));
  const scrollIntoQuiz = () => { const y = box.getBoundingClientRect().top + scrollY - 110; window.scrollTo({ top: Math.max(0, y), behavior: reduce ? "auto" : "smooth" }); };

  /* =========================== LOBBY =========================== */
  function lobby() {
    const best = store.get("quiz-best", null), plays = store.get("quiz-plays", 0);
    const f = findFact(factOnly);
    const factCount = f ? BANKS.mix.list.filter((q) => q.fact === factOnly).length : 0;
    box.innerHTML = `<div class="qz-lobby qz-enter">
      <div class="qz-panel">
        ${f ? `<div class="qz-fact"><span class="ico">${ic("book-open")}</span><div><small class="muted">تحدّي المعلومة · ${factCount} ${factCount > 2 && factCount < 11 ? "أسئلة" : "سؤالاً"}</small><br><strong>${esc(f.title)}</strong></div></div>`
          : `<h2 class="qz-h">اختر ساحة التحدّي</h2><p class="qz-sub">كل محاولة 10 أسئلة عشوائية مختلفة. أجب بسرعة لتبني سلسلة، واحصل على لقبك.</p>
        <div class="qz-modes" role="radiogroup" aria-label="نوع الأسئلة">${Object.entries(BANKS).filter(([, b]) => b.list.length).map(([id, b]) => `
          <button class="qz-mode${id === bank ? " active" : ""}" data-bank="${id}" role="radio" aria-checked="${id === bank}">
            <span class="ico">${ic(b.icon)}</span><b>${b.name}</b><small>${b.desc}</small><span class="n">${b.list.length}</span></button>`).join("")}</div>`}
        <div class="qz-settings">
          <label class="qz-switch"><input type="checkbox" id="timed" ${timed ? "checked" : ""}><span class="track"></span>${ic("timer")}مؤقت ${TIME} ثانية</label>
          <label class="qz-name">${ic("user-round")}<input id="pname" maxlength="28" placeholder="اسمك على بطاقة الستوري (اختياري)" value="${esc(store.get("quiz-name", ""))}"></label>
        </div>
        <button class="btn btn-primary btn-lg qz-start" id="go">${ic("swords")}ابدأ التحدّي</button>
        ${f ? `<p class="center mt-2 mb-0"><a class="link" href="quiz.html">أو ادخل التحدّي الشامل</a></p>` : ""}
      </div>
      <aside class="qz-panel qz-ladder">
        <h3>ألقاب الإمبراطورية</h3>
        <ol class="qz-rungs">${RANKS.map(([min, name, icon]) => `<li class="qz-rung${best !== null && best >= min ? " reached" : ""}${best !== null && rankFor(best)[1] === name ? " me" : ""}">
          <span class="ico">${ic(icon)}</span><b>${name}</b><span>${min === 10 ? "10" : min + "+"}</span></li>`).join("")}</ol>
        <div class="qz-stats-mini"><div><strong>${best !== null ? best + "/10" : "—"}</strong><small>أفضل نتيجة</small></div><div><strong>${plays}</strong><small>محاولة</small></div></div>
      </aside>
    </div>`;
    icons();
    $("#timed").addEventListener("change", (e) => { timed = e.target.checked; store.set("quiz-timed", timed); });
    $("#pname").addEventListener("input", (e) => store.set("quiz-name", e.target.value.trim()));
    $("#go").addEventListener("click", start);
    $$(".qz-mode").forEach((b) => b.addEventListener("click", () => {
      bank = b.dataset.bank; store.set("quiz-bank", bank);
      $$(".qz-mode").forEach((x) => { x.classList.toggle("active", x === b); x.setAttribute("aria-checked", String(x === b)); });
    }));
  }

  function start() {
    const pool = factOnly ? BANKS.mix.list.filter((q) => q.fact === factOnly) : BANKS[bank].list;
    if (!pool.length) { toast("لا توجد أسئلة في هذه الساحة بعد", "info"); return; }
    qs = shuffle(pool).slice(0, 10).map((q) => {
      const order = q.a.length === 2 ? [0, 1] : shuffle(q.a.map((_, k) => k)); // keep صح/خطأ order
      return { ...q, opts: order.map((k) => q.a[k]), correct: order.indexOf(q.c) };
    });
    i = 0; score = 0; answers = []; streak = 0; bestStreak = 0; story = null;
    show(); scrollIntoQuiz();
  }

  /* =========================== PLAY =========================== */
  const orbs = () => qs.map((_, k) => {
    const a = answers[k]; const cls = a ? (a.ok ? "ok" : "bad") : k === i ? "now" : "";
    return `<span class="qz-orb ${cls}" aria-label="السؤال ${k + 1}">${a ? ic(a.ok ? "check" : "x") : k + 1}</span>`;
  }).join("");

  function show() {
    const q = qs[i]; locked = false;
    const tgTitle = q.fact && q.fact.startsWith("tg-") ? (findFact(q.fact) || {}).title : "";
    const tf = q.opts.length === 2;
    const C = 2 * Math.PI * 27;
    box.innerHTML = `<div class="qz-play">
      <div class="qz-hud"><div class="qz-orbs">${orbs()}</div>
        <div class="qz-hud-r"><span class="qz-chip${streak >= 2 ? " hot" : ""}">${ic("flame")}سلسلة ${streak}</span><span class="qz-chip">${ic("star")}${score} نقاط</span></div></div>
      <div class="qz-tablet qz-enter">
        <div class="qz-top">
          ${timed ? `<div class="qz-timer" id="tmr"><svg viewBox="0 0 64 64"><circle class="bg" cx="32" cy="32" r="27"/><circle class="fg" id="tfg" cx="32" cy="32" r="27" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg><span id="tleft">${TIME}</span></div>` : ""}
          <div><span class="qz-qno">السؤال ${i + 1} / ${qs.length}</span>
            ${q.src === "channel" ? `<p class="qz-src">${ic("party-popper")}من فعاليات القناة</p>` : tgTitle ? `<p class="qz-src">${ic("send")}من منشور: ${esc(tgTitle)}</p>` : `<p class="qz-src">${ic("scroll-text")}من أرشيف الإمبراطورية</p>`}</div>
        </div>
        <h2 class="qz-q">${esc(q.q)}</h2>
        <div class="qz-opts${tf ? "" : " four"}">${q.opts.map((o, k) => `<button class="qz-opt${tf ? " tf" : ""}" data-k="${k}" style="--k:${k}">${tf ? "" : `<span class="lt">${LETTERS[k]}</span>`}<span>${esc(o)}</span>${tf ? "" : `<span class="kb">${k + 1}</span>`}</button>`).join("")}</div>
      </div>
      <div id="after" aria-live="polite"></div>
    </div>`;
    icons();
    $$(".qz-opt").forEach((b) => b.addEventListener("click", () => answer(+b.dataset.k)));
    tStart = performance.now();
    clearInterval(timer);
    if (timed) {
      left = TIME;
      const fg = $("#tfg"), tl = $("#tleft"), tm = $("#tmr");
      timer = setInterval(() => {
        left--; tl.textContent = left; fg.style.strokeDashoffset = String(C * (1 - left / TIME));
        tm.classList.toggle("low", left <= 5);
        if (left <= 0) answer(-1);
      }, 1000);
    }
  }

  function answer(k) {
    if (locked) return; locked = true;
    clearInterval(timer);
    const q = qs[i], ok = k === q.correct, secs = (performance.now() - tStart) / 1000;
    if (ok) { score++; streak++; bestStreak = Math.max(bestStreak, streak); } else streak = 0;
    answers.push({ q, k, ok, secs });
    $$(".qz-opt").forEach((b, idx) => {
      b.disabled = true;
      if (idx === q.correct) b.classList.add("correct"); else if (idx === k) b.classList.add("wrong"); else b.classList.add("dim");
    });
    $(".qz-orbs").innerHTML = orbs(); icons();
    const f = findFact(q.fact);
    const kind = ok ? "ok" : k === -1 ? "late" : "bad";
    const title = ok ? (streak >= 3 ? `رائع! سلسلة ${streak} إجابات صحيحة` : "إجابة صحيحة!") : k === -1 ? "انتهى الوقت!" : "إجابة خاطئة";
    $("#after").innerHTML = `<div class="qz-fb ${kind}">
      <div class="row"><span class="ic">${ic(ok ? (streak >= 3 ? "flame" : "check") : k === -1 ? "alarm-clock-off" : "x")}</span>
        <div><strong>${title}</strong><p>الإجابة الصحيحة: <b>${esc(q.opts[q.correct])}</b>${q.explain ? ` (${esc(q.explain)})` : ""}</p></div></div>
      <div class="acts"><button class="btn btn-primary" id="next">${i + 1 < qs.length ? "السؤال التالي" : "اكشف لقبي"}${ic("arrow-left")}</button>
        ${f ? `<a class="btn btn-ghost" href="${App.factUrl(f.id)}" target="_blank" rel="noopener">${ic("book-open")}اقرأ المعلومة</a>` : q.link ? `<a class="btn btn-ghost" href="${esc(q.link)}" target="_blank" rel="noopener">${ic("send")}المنشور في تليغرام</a>` : ""}</div>
    </div>`;
    icons();
    const nx = $("#next");
    nx.addEventListener("click", () => { i++; i < qs.length ? (show(), scrollIntoQuiz()) : result(); });
    nx.focus({ preventScroll: true });
    $("#after").scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "nearest" });
  }

  // keyboard: 1-4 or أ ب ج د to answer, Enter for next
  document.addEventListener("keydown", (e) => {
    if (!$(".qz-play") || (e.target.closest && e.target.closest("input, textarea, select")) || e.ctrlKey || e.metaKey || e.altKey) return;
    if (!locked) {
      const n = "1234".indexOf(e.key) >= 0 ? +e.key - 1 : LETTERS.indexOf(e.key);
      if (n >= 0 && n < qs[i].opts.length) { e.preventDefault(); answer(n); }
    }
  });

  /* =========================== RESULT =========================== */
  function siteQuizUrl() {
    const base = (window.SITE_URL || "").replace(/\/+$/, "");
    if (base) return base + "/quiz.html";
    const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(location.hostname) || !/^https?:$/.test(location.protocol);
    return local ? (S.links.instagram || "https://www.instagram.com/" + S.handle) : new URL("quiz.html", location.href).href;
  }

  function result() {
    const total = qs.length, s10 = Math.round((score / total) * 10);
    const [, rank, icon, msg] = rankFor(s10);
    const best = store.get("quiz-best", null);
    const isBest = !factOnly && (best === null || s10 > best);
    if (!factOnly && isBest) store.set("quiz-best", s10);
    store.set("quiz-plays", store.get("quiz-plays", 0) + 1);
    const avg = answers.length ? answers.reduce((a, x) => a + x.secs, 0) / answers.length : 0;
    const wrong = answers.filter((a) => !a.ok).length;

    box.innerHTML = `<div class="qz-result">
      <div class="qz-panel qz-crown qz-enter">
        <div class="qz-medal-stage"><div class="qz-medal"><div class="face">${ic(icon)}</div><div class="face back">${score}/${total}</div></div></div>
        <span class="kicker">لقبك في الإمبراطورية</span>
        <h2 class="qz-rank gold-text">${rank}</h2>
        <p class="qz-msg">${msg}</p>
        ${isBest && best !== null ? `<span class="qz-record">${ic("trophy")}رقم قياسي جديد!</span>` : ""}
        <div class="qz-kpis">
          <div class="qz-kpi g"><strong>${score}</strong><small>إجابة صحيحة</small></div>
          <div class="qz-kpi r"><strong>${wrong}</strong><small>إجابة خاطئة</small></div>
          <div class="qz-kpi y"><strong>${bestStreak}</strong><small>أطول سلسلة</small></div>
          <div class="qz-kpi b"><strong>${avg.toFixed(1)}</strong><small>ثانية لكل سؤال</small></div>
        </div>
      </div>

      <div class="qz-panel qz-story qz-enter" style="animation-delay:.15s">
        <div class="qz-phone" id="phone"><div class="ph">${ic("loader")}</div></div>
        <div>
          <span class="kicker">لنشرها في الستوري</span>
          <h3>بطاقتك جاهزة للنشر</h3>
          <p class="muted mb-0">بطاقة بتصميم بابلي فيها لقبك ونتيجتك، وفي زاويتها رمز يفتح الاختبار لمن يشاهد الستوري.</p>
          <ul class="steps-mini"><li><b>1</b>احفظ الصورة أو شاركها مباشرة</li><li><b>2</b>انشرها في ستوري إنستغرام أو واتساب</li><li><b>3</b>أشِر إلى <span class="ltr">@${esc(S.handle)}</span> وتحدَّ أصدقاءك</li></ul>
          <label class="qz-name mb-2">${ic("user-round")}<input id="sname" maxlength="28" placeholder="اكتب اسمك ليظهر على البطاقة" value="${esc(store.get("quiz-name", ""))}"></label>
          <div class="btns">
            <button class="btn btn-primary" id="s-share">${ic("share-2")}شارك في الستوري</button>
            <button class="btn btn-ghost" id="s-save">${ic("download")}حفظ الصورة</button>
            <button class="btn btn-ghost" id="s-link">${ic("link")}نسخ رابط التحدّي</button>
            <button class="btn btn-ghost" id="again">${ic("rotate-ccw")}تحدٍّ جديد</button>
          </div>
        </div>
      </div>

      <div class="qz-panel qz-enter" style="animation-delay:.3s">
        <h3 class="qz-h" style="font-size:1.4rem">مراجعة إجاباتك</h3>
        <div class="qz-review">${answers.map((a, n) => `<details class="qz-rv ${a.ok ? "ok" : "bad"}">
          <summary><span class="st">${ic(a.ok ? "check" : "x")}</span><span class="t">${n + 1}. ${esc(a.q.q)}</span>${ic("chevron-down")}</summary>
          <div class="body">الصحيح: <b style="color:var(--text)">${esc(a.q.opts[a.q.correct])}</b>${!a.ok && a.k >= 0 ? ` · إجابتك: ${esc(a.q.opts[a.k])}` : a.k === -1 ? " · انتهى الوقت" : ""}
            ${a.q.fact ? `<br><a class="btn btn-ghost btn-sm" href="${App.factUrl(a.q.fact)}">${ic("book-open")}اقرأ المعلومة</a>` : ""}</div></details>`).join("")}</div>
      </div>
    </div>`;
    icons();
    scrollIntoQuiz();
    if (s10 >= 6) confetti(s10 === 10 ? 140 : 80);

    const shareText = `حصلت على ${score}/${total} في تحدّي «${S.name}» ولقبي: ${rank} 👑\nهل تستطيع أن تتفوق عليّ؟\n${siteQuizUrl()}`;
    const build = async () => {
      if (!window.QuizStory) return null;
      const name = ($("#sname").value || "").trim();
      const c = await QuizStory.render({
        score, total, rank, icon, message: msg, name, url: siteQuizUrl(), handle: S.handle,
        marks: answers.map((a) => a.ok), seed: Date.now() % 100000,
        stats: [`${score} صحيحة`, `سلسلة ${bestStreak}`, `${Math.round(avg)} ث لكل سؤال`],
        date: new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { day: "numeric", month: "long", year: "numeric" }).format(new Date())
      });
      const blob = await new Promise((r) => c.toBlob(r, "image/jpeg", .93));
      if (story && story.url) URL.revokeObjectURL(story.url);
      story = { blob, url: URL.createObjectURL(blob), name: `empire-quiz-${score}of${total}.jpg` };
      $("#phone").innerHTML = `<img src="${story.url}" alt="بطاقة نتيجتك للستوري: ${esc(rank)}">`;
      return story;
    };
    build();
    let t; $("#sname").addEventListener("input", (e) => { store.set("quiz-name", e.target.value.trim()); clearTimeout(t); t = setTimeout(build, 450); });

    $("#s-save").addEventListener("click", async () => { const s = story || await build(); if (s) { download(s.blob, s.name); toast("حُفظت الصورة، انشرها في الستوري", "download"); } });
    $("#s-share").addEventListener("click", async () => {
      const s = story || await build(); if (!s) return;
      const file = new File([s.blob], s.name, { type: "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: S.name, text: shareText }); return; } catch (e) { if (e && e.name === "AbortError") return; }
      }
      download(s.blob, s.name);
      toast("جهازك لا يدعم المشاركة المباشرة، فحفظنا الصورة لتنشرها", "download");
    });
    $("#s-link").addEventListener("click", () => copy(shareText, "نُسخ رابط التحدّي"));
    $("#again").addEventListener("click", () => { lobby(); scrollIntoQuiz(); });
  }

  function confetti(n) {
    if (reduce) return;
    const wrap = document.createElement("div"); wrap.className = "qz-confetti"; wrap.setAttribute("aria-hidden", "true");
    const cols = ["#f2c25b", "#ffdf94", "#4b74ff", "#3fe0c8", "#ffffff", "#c98a1a"];
    wrap.innerHTML = Array.from({ length: n }, () => `<i style="left:${Math.random() * 100}%;background:${cols[Math.floor(Math.random() * cols.length)]};--t:${2.2 + Math.random() * 2}s;--dl:${Math.random() * .6}s;--dx:${(Math.random() - .5) * 300}px;--rot:${Math.random() * 900}deg;${Math.random() < .3 ? "border-radius:50%;width:9px;height:9px;" : ""}"></i>`).join("");
    document.body.appendChild(wrap);
    setTimeout(() => wrap.remove(), 5200);
  }

  lobby();
})();
