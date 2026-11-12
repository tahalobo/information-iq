/* ==========================================================
   صفحة تفاصيل المعلومة — تجربة قراءة سينمائية
   هيرو كامل ← فهرس فصول ← نص ← «هل تعلم؟» ← شهادة التوثيق ← تفاعل ← التالي/السابق ← مشابهة
   ========================================================== */
(function () {
  const { $, $$, esc, ic, icons, cat, factCard, factsSorted, fmtDate, fmtNum, fmtCompact, readTime, saved, param, store, shareButtons, toast } = App;
  const root = $("#root");
  root.className = "fact-root"; root.removeAttribute("style");
  const id = window.STATIC_ID || param("id");
  const found = window.FACTS.find((x) => x.id === id) || (window.TG_ITEMS || []).find((x) => x.id === id) || (window.BR_ITEMS || []).find((x) => x.id === id);

  const SHAPE = { iraq: "ziggurat", science: "helix", space: "galaxy", body: "atom", tech: "lens", nature: "wave", culture: "gate", history: "tablet", mind: "globe" };
  const TYPE_NAMES = { news: "خبر", event: "فعالية", discussion: "سؤال للنقاش", literature: "شعر وأدب" };
  const minutesText = (n) => n === 1 ? "دقيقة واحدة" : n === 2 ? "دقيقتان" : n <= 10 ? `${n} دقائق` : `${n} دقيقة`;
  // Arabic number agreement: 1 → singular, 2 → dual, 3–10 → plural, 11+ → accusative singular
  const countWord = (n, one, two, few, many) => n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`;
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

  const loading = () => {
    root.innerHTML = `<section class="fx-hero fx-loading"><div class="container"><div class="fx-skel"><i></i><i></i><i></i><i></i></div><p class="muted mt-2">جارِ تحميل المنشور…</p></div></section>`;
  };

  if (found && found.source === "telegram") {
    // full text lives in a small per-post file, loaded only on this page
    loading();
    const s = document.createElement("script"); s.src = `assets/tg/posts/${found.tg}.js`;
    s.onload = () => { const P = window.TG_POST; render(P && P.id === found.tg ? { ...found, body: P.html, post: P } : { ...found, body: `<p>${esc(found.excerpt)}</p>` }); };
    s.onerror = () => render({ ...found, body: `<p>${esc(found.excerpt)}</p>` });
    document.head.appendChild(s);
  } else render(found);

  function render(f) {
    if (!f) {
      root.innerHTML = `<section class="fx-hero fx-404"><div class="ph-slot" data-gl="tablet" aria-hidden="true"></div><div class="container">
        <span class="ph-kicker"><b>404</b>لوح مفقود</span>
        <h1 class="mega" data-split>لم نجد هذه <span class="gold-text">المعلومة</span></h1><p class="lead">ربما تغيّر رابطها أو حُذفت من الأرشيف.</p>
        <a href="facts.html" class="btn btn-primary btn-lg mt-2">${ic("book-open")}تصفّح كل المعلومات</a></div></section>`;
      icons(); window.FX && FX.refresh(root); return;
    }

    const P = f.post || null;
    // sources found on the web by the verification engine sit next to the channel post
    if (P && Array.isArray(P.sources) && P.sources.length) f = { ...f, sources: [...f.sources, ...P.sources.filter((s) => /^https?:\/\//.test(s.url))] };
    const extra = f.sources.filter((s) => s.kind !== "telegram" && f.source === "telegram");
    const KIND = { telegram: ["send", "المنشور الأصلي"], encyclopedia: ["library", "موسوعة"], science: ["flask-conical", "مصدر علمي"], official: ["landmark", "جهة رسمية"], news: ["newspaper", "صحافة"], web: ["globe", "موقع"] };
    const LANG = { en: "بالإنجليزية", fr: "بالفرنسية", de: "بالألمانية", es: "بالإسبانية", tr: "بالتركية", fa: "بالفارسية" };
    const sourceItem = (s, i) => {
      const k = KIND[s.kind] || (s.manual ? ["badge-check", "مصدر"] : null);
      const meta = [s.site && s.site !== s.name && s.site !== host(s.url) ? esc(s.site) : "", s.url ? `<i class="ltr">${esc(host(s.url))}</i>` : ""].filter(Boolean).join(" · ");
      const chips = `${k ? `<em class="src-kind k-${esc(s.kind || "web")}">${ic(k[0])}${k[1]}</em>` : ""}${LANG[s.lang] ? `<em class="src-kind">${LANG[s.lang]}</em>` : ""}${s.match ? `<em class="src-kind src-match" title="نسبة تطابق مضمون الصفحة مع المعلومة">تطابق ${s.match}%</em>` : ""}`;
      return `<li>${s.url ? `<a href="${esc(s.url)}" target="_blank" rel="noopener">` : "<div>"}
        <b>${String(i + 1).padStart(2, "0")}</b><span><strong${s.lang && s.lang !== "ar" ? ' dir="auto"' : ""}>${esc(s.name)}</strong>${meta ? `<small>${meta}</small>` : ""}${chips ? `<span class="src-chips">${chips}</span>` : ""}${s.quote ? `<q${s.lang && s.lang !== "ar" ? ' dir="auto"' : ""}>${esc(s.quote)}</q>` : ""}</span>${s.url ? ic("arrow-up-left") : ""}${s.url ? "</a>" : "</div>"}</li>`;
    };
    const c = cat(f.cat);
    const minutes = f.minutes || readTime(f.body);
    const images = P && P.images && P.images.length ? P.images : f.image ? [f.image] : [];
    const video = P && P.video ? P.video : null;
    // a branch post (news, games, music, anime, sport) navigates within its own branch
    const B = f.branch ? App.branchOf(f.branch) : null;
    const noun = B ? "الخبر" : "المعلومة";
    const branchPool = B ? (window.BR_ITEMS || []).filter((x) => x.branch === f.branch).sort((a, b) => b.date.localeCompare(a.date) || b.tg.localeCompare(a.tg)) : null;
    // static pages get newer/older/related precomputed at build time (same rules, see CTX in scripts/build-pages.mjs),
    // so they do not have to download the whole channel archive
    const SC = window.STATIC_CTX && window.STATIC_ID === f.id && !window.TG && !window.BR ? window.STATIC_CTX : null;
    const pick = (i) => (i && (window.FACTS.find((x) => x.id === i) || (window.TG_ITEMS || []).find((x) => x.id === i) || (window.BR_ITEMS || []).find((x) => x.id === i))) || null;
    const sorted = SC ? [] : branchPool || factsSorted();
    const idx = sorted.findIndex((x) => x.id === f.id);
    const newer = SC ? pick(SC.n) : idx > 0 ? sorted[idx - 1] : null, older = SC ? pick(SC.o) : idx >= 0 ? sorted[idx + 1] : null;
    const related = SC ? SC.r.map(pick).filter(Boolean) : (branchPool || window.FACTS).filter((x) => x.id !== f.id && x !== newer && x !== older)
      .map((x) => ({ x, score: (x.cat === f.cat ? 2 : 0) + x.tags.filter((t) => f.tags.includes(t)).length + (x.image ? .2 : 0) }))
      .sort((a, b) => b.score - a.score).slice(0, 3).map((r) => r.x);
    const quizCount = window.QUIZ.filter((q) => q.fact === f.id).length;
    const url = window.SITE_URL && window.STATIC_POSTS && window.STATIC_POSTS[f.id] ? `${window.SITE_URL}/post/${encodeURIComponent(f.id)}.html` : new URL(App.factUrl(f.id), document.baseURI).href;
    const fb = store.get("fact-feedback", {});
    const isSaved = saved.has(f.id);

    document.title = `${f.title} | ${window.SITE.name}`;
    const md = document.querySelector('meta[name="description"]'); if (md) md.content = f.excerpt;

    /* ---------- Hero media (right side of the stage) ---------- */
    let media;
    if (video) {
      media = `<a href="#cinema" class="fx-frame fx-video" aria-label="شاهد الفيديو">
        ${video.thumb ? `<img src="${esc(video.thumb)}" alt="">` : `<span class="fx-noimg" style="--c1:${c.c1};--c2:${c.c2}">${ic(c.icon)}</span>`}
        <span class="play-dot">${ic("play")}</span>${video.duration ? `<span class="badge badge-glass fx-dur">${ic("clock")}${esc(video.duration)}</span>` : ""}</a>`;
    } else if (images.length) {
      media = `<div class="fx-deck${images.length > 1 ? " multi" : ""}">${images.slice(0, 3).reverse().map((src, i, arr) =>
        `<img src="${esc(src)}" alt="${i === arr.length - 1 ? "صورة المنشور" : ""}" data-zoom onerror="this.remove()" style="--k:${arr.length - 1 - i}" loading="${i === arr.length - 1 ? "eager" : "lazy"}">`).join("")}
        ${images.length > 1 ? `<span class="badge badge-glass fx-count">${ic("images")}${images.length} صور</span>` : `<span class="fx-zoomhint">${ic("maximize-2")}</span>`}</div>`;
    } else {
      media = `<div class="fx-orb" data-gl="${SHAPE[f.cat] || "tablet"}" aria-hidden="true"><span class="fx-orb-ico">${ic(f.icon || c.icon)}</span></div>`;
    }

    /* ---------- Article body ---------- */
    const pollHtml = P && P.poll ? `<div class="fx-poll"><div class="card-title"><span class="ico ico-sm">${ic("vote")}</span><h3>${esc(P.poll.q)}</h3></div>
      <div class="fx-poll-opts">${P.poll.options.map((o, i) => `<span><b>${i + 1}</b>${esc(o)}</span>`).join("")}</div>
      <a class="btn btn-primary btn-sm mt-2" href="${esc(P.url)}" target="_blank" rel="noopener">${ic("send")}صوّت في تليغرام</a></div>` : "";
    const gallery = images.length > 1 ? `<div class="fx-strip" data-lenis-prevent>${images.map((src, i) => `<img src="${esc(src)}" alt="صورة ${i + 1} من المنشور" loading="lazy" data-zoom onerror="this.remove()">`).join("")}</div>` : "";
    const cinema = video ? `<div class="fx-cinema" id="cinema"><div id="tg-embed">${video.thumb ? `<a href="${esc(P.url)}" target="_blank" rel="noopener" class="fact-cover has-img" style="height:auto;aspect-ratio:16/9"><img src="${esc(video.thumb)}" alt=""><span class="play-dot">${ic("play")}</span></a>` : ""}</div></div>` : "";

    const prev = (x, dir) => {
      if (!x) return `<span></span>`;
      const xc = cat(x.cat);
      return `<a href="${App.factUrl(x.id)}" class="fx-next ${dir}" style="--c1:${xc.c1};--c2:${xc.c2}">
        ${x.image ? `<img src="${esc(x.image)}" alt="" loading="lazy" onerror="this.remove()">` : ""}
        <span class="fx-next-dir">${dir === "newer" ? `${ic("arrow-right")}${noun} الأحدث` : `${noun} الأقدم${ic("arrow-left")}`}</span>
        <strong>${esc(x.title)}</strong><small>${ic(xc.icon)}${esc(xc.name)} · ${fmtDate(x.date)}</small></a>`;
    };

    root.innerHTML = `
    <section class="fx-hero${images.length || video ? " has-media" : ""}" data-sc>
      ${images[0] || (video && video.thumb) ? `<div class="fx-amb" style="background-image:url('${esc(images[0] || video.thumb)}')" aria-hidden="true"></div>` : `<div class="fx-amb grad" style="--c1:${c.c1};--c2:${c.c2}" aria-hidden="true"></div>`}
      <div class="ph-giant" aria-hidden="true">${esc(c.name)}</div>
      <div class="container fx-hero-grid">
        <div class="fx-hero-text">
          <nav class="breadcrumbs" aria-label="مسار التنقل"><a href="index.html">الرئيسية</a>${ic("chevron-left")}${B ? `<a href="branch.html">الفروع</a>${ic("chevron-left")}<a href="branch.html?b=${B.id}">${esc(B.short)}</a>` : `<a href="facts.html">المعلومات</a>${ic("chevron-left")}<a href="facts.html?cat=${c.id}">${esc(c.name)}</a>`}</nav>
          <div class="fx-chips">
            <span class="fx-cat" style="--c1:${c.c1};--c2:${c.c2}">${ic(c.icon)}${esc(c.name)}</span>
            ${TYPE_NAMES[f.type] && !B ? `<span class="badge badge-info">${esc(TYPE_NAMES[f.type])}</span>` : ""}
            ${B ? `<a class="badge badge-info" href="${esc(B.url)}" target="_blank" rel="noopener">${ic("send")}من قناة ${esc(B.name)}</a>` : f.source === "telegram" ? `<span class="badge badge-info">${ic("send")}من قناة تليغرام</span>` : `<span class="badge">${ic("badge-check")}موثّقة</span>`}
            ${extra.length ? `<a href="#sources" class="badge">${ic("badge-check")}موثّقة بـ${countWord(f.sources.length, "مصدر واحد", "مصدرين", "مصادر", "مصدراً")}</a>` : ""}
          </div>
          <h1 class="fx-title" data-split>${esc(f.title)}</h1>
          ${f.source === "telegram" ? "" : `<p class="fx-excerpt">${esc(f.excerpt)}</p>`}
          <div class="fx-pills">
            <span>${ic("calendar")}<b>${fmtDate(f.date)}</b></span>
            <span>${ic("clock")}<b>${minutesText(minutes)}</b> قراءة</span>
            ${P && P.views ? `<span>${ic("eye")}<b>${fmtCompact(P.views)}</b> مشاهدة</span>` : `<span>${ic("library")}<b>${countWord(f.sources.length, "مصدر واحد", "مصدران", "مصادر", "مصدراً")}</b></span>`}
          </div>
          <div class="btn-row mt-3">
            <a href="#read" class="btn btn-primary btn-lg">${ic("book-open-text")}ابدأ القراءة</a>
            <button class="btn btn-ghost btn-lg" data-tts hidden>${ic("headphones")}<span>استمع إليها</span></button>
            ${B ? "" : `<button class="btn btn-ghost btn-lg fx-save${isSaved ? " saved" : ""}" data-fxsave>${ic("bookmark")}<span>${isSaved ? "محفوظة" : "احفظها"}</span></button>`}
          </div>
        </div>
        <div class="fx-hero-media">${media}</div>
      </div>
      <div class="scroll-cue" aria-hidden="true"><i></i>مرّر</div>
    </section>

    <div class="container fx-layout" id="read">
      <aside class="fx-toc" id="toc" hidden><span class="fx-toc-h">${ic("list")}فصول المعلومة</span><ol></ol></aside>
      <article class="fx-article" id="article">
        ${cinema}
        ${gallery}
        <div class="prose fx-prose" id="prose">${f.body}</div>
        ${pollHtml}
        ${P ? `<a class="fx-tglink" href="${esc(P.url)}" target="_blank" rel="noopener">${ic("send")}<span><strong>المنشور الأصلي في تليغرام</strong><small>${B ? `${esc(B.name)}${P.views ? " · " : ""}` : ""}${P.views ? `${fmtNum(P.views)} مشاهدة` : B ? "" : "قناة إمبراطورية المعلومات"}</small></span>${ic("arrow-up-left")}</a>` : ""}

        ${f.didYouKnow ? `<aside class="fx-dyk"><span class="fx-dyk-label">هل تعلم؟</span><span class="fx-dyk-ico">${ic("lightbulb")}</span><p>${esc(f.didYouKnow)}</p></aside>` : ""}

        <section class="fx-cert" id="sources">
          <div class="fx-seal" aria-hidden="true">
            <svg viewBox="0 0 200 200"><defs><path id="sealc" d="M100,100 m-78,0 a78,78 0 1,1 156,0 a78,78 0 1,1 -156,0"/></defs>
              <text direction="ltr"><textPath href="#sealc" textLength="486" lengthAdjust="spacing">موثّقة بالمصادر ✦ الإمبراطورية العراقية ✦ كل ما هو حقيقي ومفيد ✦</textPath></text></svg>
            <b>${f.sources.length}</b><small>${countWord(f.sources.length, "مصدر واحد", "مصدران", "مصادر", "مصدراً").replace(/^\d+ /, "")}</small>
          </div>
          <div class="fx-cert-body">
            <span class="kicker">شهادة التوثيق</span>
            <h2>${B ? "من أين جاء هذا الخبر؟" : "من أين جئنا بهذه المعلومة؟"}</h2>
            <ol class="fx-sources">${f.sources.map(sourceItem).join("")}</ol>
            ${extra.length ? `<p class="fx-src-note">${ic("search-check")}<span>المصادر الإضافية عثر عليها <strong>محرّك التوثيق</strong> في الموقع: يبحث في الويب عن مضمون المعلومة، ويفتح كل صفحة ويقارن نصّها وأرقامها بالمنشور، ولا يعرض إلا ما تطابق. إن رأيت مصدراً غير مناسب <a class="link" href="contact.html?type=correction&ref=${encodeURIComponent(f.id)}">أخبرنا</a>.</span></p>`
              : B ? `<p class="fx-src-note">${ic("search-check")}<span>نقلنا الخبر من قناة ${esc(B.name)}. تريد أن تتأكد منه بنفسك؟ <a class="link" href="verify.html?q=${encodeURIComponent(f.title)}">افحصه في محقّق الأخبار</a>، فنبحث عنه في المصادر ونعطيك تقريراً كاملاً.</span></p>`
              : f.source === "telegram" ? `<p class="fx-src-note">${ic("search")}<span>لم يعثر محرّك التوثيق بعد على صفحات مطابقة لهذه المعلومة. ابحث عنها بنفسك: <a class="link" href="https://www.google.com/search?q=${encodeURIComponent(f.title)}" target="_blank" rel="noopener">غوغل</a> · <a class="link" href="https://ar.wikipedia.org/w/index.php?search=${encodeURIComponent(f.title)}" target="_blank" rel="noopener">ويكيبيديا</a></span></p>` : ""}
          </div>
        </section>

        ${f.tags.length ? `<div class="tags fx-tags">${f.tags.map((t) => `<a class="tag-link" href="${B ? `branch.html?b=${B.id}&q=` : "facts.html?q="}${encodeURIComponent(t)}">#${esc(t)}</a>`).join("")}</div>` : ""}

        <section class="fx-react" id="feedback">
          <div><span class="kicker">رأيك يهمنا</span><h3>هل أفادك ${B ? "هذا الخبر" : "هذه المعلومة"}؟</h3></div>
          <div class="fx-react-btns">
            <button data-fb="up" aria-label="نعم، مفيدة">${ic("heart")}<span>نعم، أفادتني</span></button>
            <button data-fb="down" aria-label="لا">${ic("meh")}<span>ليس كثيراً</span></button>
            <a href="contact.html?type=correction&ref=${encodeURIComponent(f.id)}">${ic("flag")}<span>أبلغ عن خطأ</span></a>
          </div>
        </section>

        <section class="fx-share">
          <div><span class="kicker">المعرفة تكبر بالمشاركة</span><h3>شارك ${noun} مع من يهمك</h3></div>
          <button class="fx-story-cta" data-story>
            <span class="fx-story-thumb" aria-hidden="true"><i></i><i></i><i></i></span>
            <span><strong>صمّم ستوري لإنستغرام</strong><small>صورة جاهزة بمقاس الستوري وبهوية الإمبراطورية، بضغطة واحدة</small></span>${ic("sparkles")}
          </button>
          ${shareButtons(url, f.title)}
        </section>

        ${quizCount ? `<a href="quiz.html?fact=${f.id}" class="fx-quiz"><span class="ico">${ic("brain")}</span><span><strong>هل فهمتها جيداً؟ اختبر نفسك</strong><small>${countWord(quizCount, "سؤال واحد", "سؤالان", "أسئلة", "سؤالاً")} عن هذه المعلومة</small></span>${ic("arrow-left")}</a>` : ""}
      </article>
    </div>

    <nav class="container fx-nextnav" aria-label="معلومات أخرى">${prev(newer, "newer")}${prev(older, "older")}</nav>

    <section class="section" style="padding-top:60px" data-sc>
      <div class="container">
        <div class="section-head"><div><span class="kicker">تابع الرحلة</span><h2 data-split>قد يعجبك <span class="gold-text">أيضاً</span></h2></div><a href="${B ? `branch.html?b=${B.id}` : `facts.html?cat=${c.id}`}" class="btn btn-ghost">المزيد من ${esc(c.name)}${ic("arrow-left")}</a></div>
        <div class="plane" data-sc><div class="grid grid-3">${related.map(factCard).join("")}</div></div>
      </div>
    </section>

    <div class="fx-dock" id="dock" role="toolbar" aria-label="أدوات القراءة">
      <button class="fx-ring" id="dock-top" aria-label="للأعلى"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="19"/><circle cx="22" cy="22" r="19" id="ring"/></svg><span id="pct">0%</span></button>
      <button data-tts hidden aria-label="استمع إلى المعلومة" title="استمع">${ic("headphones")}</button>
      ${B ? "" : `<button class="fx-save${isSaved ? " saved" : ""}" data-fxsave aria-label="حفظ" title="احفظ">${ic("bookmark")}</button>`}
      <button id="fs-cycle" aria-label="حجم الخط" title="حجم الخط">${ic("type")}</button>
      <button id="copy-text" aria-label="نسخ النص مع المصادر" title="نسخ النص مع المصادر">${ic("clipboard-copy")}</button>
      <button data-story aria-label="صمّم ستوري لإنستغرام" title="ستوري إنستغرام">${ic("instagram")}</button>
      <button id="dock-share" aria-label="مشاركة" title="مشاركة">${ic("share-2")}</button>
    </div>`;

    /* ---------- Chapters (table of contents) ---------- */
    const heads = $$("#prose h2");
    if (heads.length >= 2) {
      const toc = $("#toc"); toc.hidden = false; $("#read").classList.add("has-toc");
      $("ol", toc).innerHTML = heads.map((h, i) => { h.id = h.id || `ch-${i + 1}`; return `<li><a href="#${h.id}"><b>${String(i + 1).padStart(2, "0")}</b>${esc(h.textContent)}</a></li>`; }).join("");
      const links = $$("a", toc);
      const tio = new IntersectionObserver((en) => en.forEach((e) => {
        if (!e.isIntersecting) return;
        links.forEach((a) => a.classList.toggle("on", a.getAttribute("href") === `#${e.target.id}`));
      }), { rootMargin: "-20% 0px -65% 0px" });
      heads.forEach((h) => tio.observe(h));
    }

    /* ---------- Save ---------- */
    root.addEventListener("click", (e) => {
      const b = e.target.closest("[data-fxsave]"); if (!b) return;
      const on = saved.toggle(f.id);
      $$("[data-fxsave]").forEach((x) => { x.classList.toggle("saved", on); const s = $("span", x); if (s) s.textContent = on ? "محفوظة" : "احفظها"; });
      $$(`[data-save="${CSS.escape(f.id)}"]`).forEach((x) => x.classList.toggle("saved", on));
    });

    /* ---------- Font size ---------- */
    let fs = store.get("prose-size", 1.12);
    const applyFs = () => document.documentElement.style.setProperty("--prose-size", fs + "rem");
    applyFs();
    const SIZES = [1, 1.12, 1.26, 1.42], SIZE_NAMES = ["صغير", "عادي", "كبير", "كبير جداً"];
    $("#fs-cycle").addEventListener("click", () => {
      const i = (SIZES.findIndex((v) => v >= fs - .01) + 1) % SIZES.length;
      fs = SIZES[i]; applyFs(); store.set("prose-size", fs); toast(`حجم الخط: ${SIZE_NAMES[i]}`, "type");
    });

    /* ---------- Share as Instagram story ---------- */
    root.addEventListener("click", (e) => { if (e.target.closest("[data-story]")) makeStory({ f, c, url, image: images[0] || (video && video.thumb) }); });

    /* ---------- Read aloud ---------- */
    setupTTS(f);

    /* ---------- Copy text with attribution ---------- */
    $("#copy-text").addEventListener("click", () => {
      const tmp = document.createElement("div"); tmp.innerHTML = f.body;
      const text = `${f.title}\n\n${tmp.innerText.replace(/\n{3,}/g, "\n\n").trim()}\n\nالمصادر:\n${f.sources.map((s, i) => `${i + 1}. ${s.name}${s.url ? " - " + s.url : ""}`).join("\n")}\n\nالمصدر: ${window.SITE.name}\n${url}`;
      App.copy(text, "نُسخ النص مع المصادر");
    });
    $("#dock-share").addEventListener("click", () => {
      if (navigator.share) navigator.share({ title: f.title, url }).catch(() => {});
      else App.copy(url, "نُسخ رابط المعلومة");
    });
    $("#dock-top").addEventListener("click", () => (window.FX ? FX.scrollTo(0) : window.scrollTo({ top: 0, behavior: "smooth" })));

    /* ---------- Reading dock: progress ring, appears after the hero ---------- */
    const dock = $("#dock"), ring = $("#ring"), pct = $("#pct"), art = $("#article"), hero = $(".fx-hero", root);
    const C = 2 * Math.PI * 19; ring.style.strokeDasharray = C;
    // measured once per scroll/resize burst (it used to re-measure the layout on every frame, forever)
    let lastP = -1, tickQueued = false;
    const tick = () => {
      tickQueued = false;
      const r = art.getBoundingClientRect(), vh = innerHeight;
      const p = Math.max(0, Math.min(1, (vh * 0.6 - r.top) / Math.max(1, r.height - vh * 0.4)));
      if (Math.abs(p - lastP) > 0.002) { lastP = p; ring.style.strokeDashoffset = C * (1 - p); pct.textContent = `${Math.round(p * 100)}%`; }
      dock.classList.toggle("show", hero.getBoundingClientRect().bottom < vh * 0.5 && r.bottom > vh * 0.3);
    };
    const queueTick = () => { if (!tickQueued) { tickQueued = true; requestAnimationFrame(tick); } };
    addEventListener("scroll", queueTick, { passive: true }); addEventListener("resize", queueTick, { passive: true }); addEventListener("load", queueTick);
    queueTick();

    /* ---------- Feedback ---------- */
    const fbBox = $("#feedback");
    const showThanks = (v) => {
      fbBox.classList.add("done");
      fbBox.innerHTML = `<div class="fx-thanks">${ic(v === "up" ? "heart" : "message-square")}<div><h3>${v === "up" ? "شكراً لك! يسعدنا أنها أفادتك." : "شكراً لملاحظتك، سنعمل على تحسينها."}</h3>${v === "down" ? `<a class="btn btn-ghost btn-sm mt-1" href="contact.html?type=suggest&ref=${f.id}">أخبرنا كيف نحسّنها</a>` : `<p class="muted mb-0">شاركها مع صديق ليستفيد مثلك.</p>`}</div></div>`;
      icons();
    };
    if (fb[f.id]) showThanks(fb[f.id]);
    fbBox.addEventListener("click", (e) => {
      const b = e.target.closest("[data-fb]"); if (!b) return;
      fb[f.id] = b.dataset.fb; store.set("fact-feedback", fb); showThanks(b.dataset.fb); toast("وصل تقييمك", "heart");
    });

    /* ---------- Video via Telegram's official embed ---------- */
    if (video) {
      const box = $("#tg-embed");
      const w = document.createElement("script");
      w.async = true; w.src = "https://telegram.org/js/telegram-widget.js?22";
      w.dataset.telegramPost = P.channel ? `${P.channel}/${P.msg}` : `${(window.TG && TG.channel) || "informationss_iq"}/${P.id}`; w.dataset.width = "100%"; w.dataset.userpic = "false";
      if (document.documentElement.dataset.theme !== "light") w.dataset.dark = "1";
      w.onload = () => setTimeout(() => { const fr = box.querySelector("iframe"); if (fr) { const a = box.querySelector("a.fact-cover"); if (a) a.remove(); } }, 1500);
      box.appendChild(w);
    }

    /* ---------- Zoom images ---------- */
    root.addEventListener("click", (e) => {
      const im = e.target.closest("[data-zoom]"); if (!im) return;
      App.modal(`<img src="${esc(im.src)}" alt="" style="width:100%;border-radius:18px">`);
    });

    icons();
    if (window.FX) FX.refresh(root);
  }

  /* ==========================================================
     ستوري إنستغرام: صورة 1080×1920 بهوية الإمبراطورية
     ========================================================== */
  const loadImg = (src) => new Promise((res, rej) => {
    const im = new Image(), abs = new URL(src, document.baseURI);
    if (abs.origin !== location.origin) im.crossOrigin = "anonymous";
    im.onload = () => res(im); im.onerror = rej; im.src = abs.href;
  });
  const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`; };
  function glow(x, cx, cy, r, color) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, color); g.addColorStop(1, "rgba(0,0,0,0)"); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); }
  function rr(x, X, Y, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); }
  function wrap(x, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean), lines = []; let line = "";
    words.forEach((w) => { const t = line ? `${line} ${w}` : w; if (x.measureText(t).width > maxW && line) { lines.push(line); line = w; } else line = t; });
    if (line) lines.push(line); return lines;
  }
  function crown(x, X, Y, s) {
    x.save(); x.translate(X, Y); x.scale(s / 64, s / 64);
    rr(x, 2, 2, 60, 60, 16); x.fillStyle = "#0b1530"; x.fill(); x.lineWidth = 1.5; x.strokeStyle = "rgba(242,194,91,.6)"; x.stroke();
    const g = x.createLinearGradient(0, 0, 64, 64); g.addColorStop(0, "#f3d27a"); g.addColorStop(1, "#b8860b"); x.fillStyle = g;
    x.fill(new Path2D("M15 40 L13 21 L23.5 30 L32 16 L40.5 30 L51 21 L49 40 Z")); rr(x, 15, 43, 34, 5, 2.5); x.fill();
    [[13, 20, 2.6], [32, 15, 2.8], [51, 20, 2.6]].forEach(([cx, cy, r]) => { x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill(); });
    x.fillStyle = "#0b1530"; x.fill(new Path2D("M32 27 L35 32 L32 37 L29 32 Z")); x.restore();
  }
  function orb(x, cx, cy, R, c) {
    const N = 1600, golden = Math.PI * (3 - Math.sqrt(5)), pts = [];
    for (let i = 0; i < N; i++) {
      const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), t = golden * i;
      let px = Math.cos(t) * r, pz = Math.sin(t) * r; const a = .5, qx = px * Math.cos(a) - pz * Math.sin(a); pz = px * Math.sin(a) + pz * Math.cos(a); px = qx;
      pts.push([px, y, pz]);
    }
    x.save(); x.strokeStyle = "rgba(242,194,91,.35)"; x.setLineDash([10, 14]); x.lineWidth = 2;
    x.beginPath(); x.ellipse(cx, cy, R * 1.45, R * .36, -.25, 0, Math.PI * 2); x.stroke(); x.restore();
    pts.sort((a, b) => a[2] - b[2]).forEach(([px, py, pz], i) => {
      const d = (pz + 1) / 2; x.globalAlpha = .25 + d * .75;
      x.fillStyle = i % 9 === 0 ? "#ffdf94" : i % 3 === 0 ? c.c2 : i % 2 ? "#3fe0c8" : "#4b74ff";
      x.beginPath(); x.arc(cx + px * R, cy + py * R, 1.6 + d * 3.4, 0, Math.PI * 2); x.fill();
    });
    x.globalAlpha = 1; glow(x, cx, cy, R * .7, "rgba(242,194,91,.18)");
  }

  // QR for the story: the public page of this fact (a localhost link would be useless to viewers)
  function storyLink(url) {
    try { const u = new URL(url); if (/^https?:$/.test(u.protocol) && !/^(localhost|127\.|0\.0\.0\.0|\[::1\])/.test(u.hostname)) return u.href; } catch { /* ignore */ }
    return window.SITE.links.instagram || `https://www.instagram.com/${window.SITE.handle}/`;
  }
  async function qrFor(text) {
    if (!window.qrcode) await new Promise((res) => { const s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js"; s.onload = res; s.onerror = res; document.head.appendChild(s); });
    if (!window.qrcode) return null;
    try {
      qrcode.stringToBytes = (s) => Array.from(new TextEncoder().encode(s));
      const q = qrcode(0, "M"); q.addData(text, "Byte"); q.make();
      return { n: q.getModuleCount(), dark: (r, k) => q.isDark(r, k) };
    } catch { return null; }
  }

  async function makeStory({ f, c, url, image }) {
    toast("نصمّم الستوري…", "sparkles");
    const W = 1080, H = 1920, M = 80, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    const x = cv.getContext("2d");
    try { await Promise.all(["400 90px Lalezar", '600 44px "IBM Plex Sans Arabic"', '500 40px "IBM Plex Sans Arabic"'].map((s) => document.fonts.load(s))); } catch { /* fallback fonts */ }
    const img = image ? await loadImg(image).catch(() => null) : null;
    const brandImg = await loadImg("assets/img/logo-256.png").catch(() => null);

    // background: lapis night, category glow, gold dust, Mesopotamian diamonds
    let g = x.createLinearGradient(0, 0, 0, H); g.addColorStop(0, "#0a1230"); g.addColorStop(.55, "#050816"); g.addColorStop(1, "#03050c");
    x.fillStyle = g; x.fillRect(0, 0, W, H);
    glow(x, 120, 240, 760, "rgba(60,100,255,.42)"); glow(x, 1000, 1350, 820, hexA(c.c2, .42)); glow(x, 540, 1980, 760, "rgba(242,190,80,.28)");
    x.save(); x.globalAlpha = .05; x.strokeStyle = "#f2c25b"; x.lineWidth = 2;
    for (let yy = 0; yy < H + 90; yy += 90) for (let xx = (yy / 90) % 2 ? 45 : 0; xx < W + 90; xx += 90) { x.beginPath(); x.moveTo(xx, yy - 40); x.lineTo(xx + 40, yy); x.lineTo(xx, yy + 40); x.lineTo(xx - 40, yy); x.closePath(); x.stroke(); }
    x.restore();
    for (let i = 0; i < 140; i++) { x.globalAlpha = Math.random() * .7; x.fillStyle = i % 4 ? "#fff" : "#ffdf94"; x.beginPath(); x.arc(Math.random() * W, Math.random() * H, Math.random() * 2.2, 0, Math.PI * 2); x.fill(); }
    x.globalAlpha = 1; x.direction = "rtl"; x.textAlign = "right"; x.textBaseline = "alphabetic";

    // brand row
    if (brandImg) x.drawImage(brandImg, W - M - 100, 84, 100, 100); else crown(x, W - M - 100, 84, 100);
    x.fillStyle = "#f2ecdd"; x.font = "400 52px Lalezar"; x.fillText("الإمبراطورية العراقية", W - M - 128, 140);
    x.fillStyle = "#9ba3bf"; x.font = '500 30px "IBM Plex Sans Arabic"'; x.fillText(`العراقية · @${window.SITE.handle}`, W - M - 128, 182);

    // media
    const top = 250, mh = img ? 640 : 520;
    if (img) {
      x.save(); x.shadowColor = "rgba(0,0,0,.7)"; x.shadowBlur = 80; x.shadowOffsetY = 40; rr(x, M, top, W - 2 * M, mh, 52); x.fillStyle = "#0b1128"; x.fill(); x.restore();
      x.save(); rr(x, M, top, W - 2 * M, mh, 52); x.clip();
      const s = Math.max((W - 2 * M) / img.width, mh / img.height), iw = img.width * s, ih = img.height * s;
      x.drawImage(img, M + (W - 2 * M - iw) / 2, top + (mh - ih) / 2, iw, ih);
      const fade = x.createLinearGradient(0, top + mh * .55, 0, top + mh); fade.addColorStop(0, "rgba(3,5,12,0)"); fade.addColorStop(1, "rgba(3,5,12,.55)"); x.fillStyle = fade; x.fillRect(M, top, W - 2 * M, mh);
      x.restore();
      rr(x, M, top, W - 2 * M, mh, 52); x.lineWidth = 3; x.strokeStyle = "rgba(242,194,91,.55)"; x.stroke();
    } else orb(x, W / 2, top + mh / 2, 250, c);

    // category pill
    let y = top + mh + 60;
    x.font = '700 34px "IBM Plex Sans Arabic"'; const pw = x.measureText(c.name).width + 64;
    const pg = x.createLinearGradient(W - M - pw, 0, W - M, 0); pg.addColorStop(0, c.c1); pg.addColorStop(1, c.c2);
    rr(x, W - M - pw, y, pw, 66, 33); x.fillStyle = pg; x.fill(); x.fillStyle = "#fff"; x.fillText(c.name, W - M - 32, y + 45);
    x.font = '600 30px "IBM Plex Sans Arabic"'; x.fillStyle = "#f2c25b"; x.fillText(`✓ موثّقة بالمصادر`, W - M - pw - 28, y + 44);
    y += 110;

    // title (auto-fit up to 4 lines)
    let size = 92, lines; do { x.font = `400 ${size}px Lalezar`; lines = wrap(x, f.title, W - 2 * M); size -= 6; } while (lines.length > 4 && size > 54);
    size += 6; const lh = size * 1.36;
    const tg = x.createLinearGradient(M, 0, W - M, 0); tg.addColorStop(0, "#f2c25b"); tg.addColorStop(1, "#ffe7a6");
    x.fillStyle = tg; lines.slice(0, 4).forEach((l, i) => x.fillText(l, W - M, y + size + i * lh));
    y += Math.min(lines.length, 4) * lh + 40;

    // excerpt, as many lines as fit above the call-to-action
    x.font = '500 40px "IBM Plex Sans Arabic"'; x.fillStyle = "#d9dcea";
    const el = 40 * 1.75, room = Math.max(0, Math.floor((H - 480 - y) / el));
    let ex = wrap(x, f.excerpt, W - 2 * M);
    if (ex.length > room) { ex = ex.slice(0, room); if (room) ex[room - 1] = ex[room - 1].replace(/\s*\S+$/, "") + "…"; }
    ex.forEach((l, i) => x.fillText(l, W - M, y + 42 + i * el));

    // call to action: a gold box with a QR code that opens this fact on the site
    const bh = 260, cy = H - 450, bg = x.createLinearGradient(M, 0, W - M, 0); bg.addColorStop(0, "#c98a1a"); bg.addColorStop(.55, "#f4bd4f"); bg.addColorStop(1, "#ffe7a6");
    x.save(); x.shadowColor = "rgba(242,180,60,.5)"; x.shadowBlur = 60; rr(x, M, cy, W - 2 * M, bh, 44); x.fillStyle = bg; x.fill(); x.restore();
    const qs = 196, qx = M + 32, qy = cy + (bh - qs) / 2;
    rr(x, qx - 14, qy - 14, qs + 28, qs + 28, 22); x.fillStyle = "#fff8e6"; x.fill();
    const qm = await qrFor(storyLink(url));
    if (qm) {
      const cell = qs / qm.n; x.fillStyle = "#0b1530";
      for (let r = 0; r < qm.n; r++) for (let k = 0; k < qm.n; k++) if (qm.dark(r, k)) x.fillRect(qx + k * cell, qy + r * cell, Math.ceil(cell), Math.ceil(cell));
    }
    const tx = W - M - 48;
    x.fillStyle = "#160f02"; x.font = "400 56px Lalezar"; x.fillText("اقرأها كاملة مع مصادرها", tx, cy + 108);
    x.font = '600 31px "IBM Plex Sans Arabic"'; x.fillStyle = "rgba(22,15,2,.78)"; x.fillText("امسح الرمز لتفتحها على", tx, cy + 164);
    x.fillText("موقع الإمبراطورية العراقية ←", tx, cy + 206);
    x.textAlign = "center"; x.fillStyle = "#9ba3bf"; x.font = '500 28px "IBM Plex Sans Arabic"'; x.fillText("كل ما هو حقيقي ومفيد ✦", W / 2, H - 70);

    const blob = await new Promise((r) => cv.toBlob(r, "image/png"));
    if (!blob) { toast("تعذّر تصميم الصورة", "alert-triangle"); return; }
    const file = new File([blob], `empire-story-${f.id}.png`, { type: "image/png" });
    const src = URL.createObjectURL(blob);
    const canShare = navigator.canShare && navigator.canShare({ files: [file] });
    const m = App.modal(`<div class="story-modal">
      <img src="${src}" alt="معاينة الستوري">
      <div><span class="kicker">ستوري جاهزة</span><h2>انشرها على إنستغرام</h2>
        <ol><li>${canShare ? "اضغط «شارك» واختر إنستغرام ← ستوري." : "حمّل الصورة، ثم ارفعها ستوري من إنستغرام."}</li><li>الباركود في الصورة يفتح المعلومة مباشرة، ويمكنك أيضاً إضافة ملصق <strong>«الرابط»</strong>.</li></ol>
        <div class="btn-row mt-2">
          ${canShare ? `<button class="btn btn-primary" data-act="share">${ic("share-2")}شارك</button>` : ""}
          <button class="btn ${canShare ? "btn-ghost" : "btn-primary"}" data-act="dl">${ic("download")}حمّل الصورة</button>
          <button class="btn btn-ghost" data-copy="${esc(url)}">${ic("link")}انسخ الرابط</button>
        </div></div></div>`, { onClose: () => URL.revokeObjectURL(src) });
    m.el.addEventListener("click", (e) => {
      const b = e.target.closest("[data-act]"); if (!b) return;
      if (b.dataset.act === "dl") App.download(blob, file.name);
      else navigator.share({ files: [file], title: f.title }).catch(() => {});
    });
  }

  /* ==========================================================
     الاستماع: قراءة المعلومة بصوت عربي من المتصفح نفسه
     ========================================================== */
  function setupTTS(f) {
    const btns = () => $$("[data-tts]");
    if (!("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis; synth.cancel();
    let voice = null, queue = null, idx = 0, playing = false, token = 0;
    const pick = () => {
      const all = synth.getVoices(), ar = all.filter((v) => /^ar([-_]|$)/i.test(v.lang));
      voice = ar.find((v) => /natural|online|neural/i.test(v.name)) || ar.find((v) => /google/i.test(v.name)) || ar[0] || null;
      btns().forEach((b) => (b.hidden = all.length > 0 && !voice)); // unknown voice list → let the user try
    };
    pick(); synth.addEventListener ? synth.addEventListener("voiceschanged", pick) : (synth.onvoiceschanged = pick);

    const build = () => {
      const els = [$(".fx-title"), ...$$("#prose > h2, #prose > h3, #prose > p, #prose > ul > li, #prose > ol > li, #prose > blockquote, #prose > div"), $(".fx-dyk p")].filter(Boolean);
      const q = [];
      els.forEach((el) => {
        const text = (el === $(".fx-title") ? f.title : el.innerText).replace(/\s+/g, " ").trim(); if (!text) return;
        let cur = "";
        (text.match(/[^.!؟?،؛\n]+[.!؟?،؛]*/g) || [text]).forEach((s) => {
          if ((cur + s).length > 190 && cur) { q.push({ el, text: cur.trim() }); cur = s; } else cur += s;
        });
        if (cur.trim()) q.push({ el, text: cur.trim() });
      });
      return q;
    };
    const ui = () => btns().forEach((b) => {
      b.classList.toggle("tts-playing", playing);
      const label = playing ? "إيقاف مؤقت" : idx > 0 ? "أكمل الاستماع" : "استمع إليها";
      b.innerHTML = b.classList.contains("btn") ? `${ic(playing ? "pause" : "headphones")}<span>${label}</span>` : ic(playing ? "pause" : "headphones");
      b.setAttribute("aria-label", label);
    }) || icons();
    const mark = (el) => { $$(".tts-on").forEach((x) => x.classList.remove("tts-on")); if (el) el.classList.add("tts-on"); };
    const next = () => {
      if (!playing) return;
      if (idx >= queue.length) { playing = false; idx = 0; mark(null); ui(); icons(); toast("انتهت القراءة", "check-circle-2"); return; }
      const item = queue[idx], my = ++token;
      if (!item.el.classList.contains("tts-on")) {
        mark(item.el);
        const r = item.el.getBoundingClientRect();
        if (r.top < 90 || r.bottom > innerHeight - 90) { const y = r.top + scrollY - innerHeight * .3; window.FX ? FX.scrollTo(y) : scrollTo({ top: y, behavior: "smooth" }); }
      }
      const u = new SpeechSynthesisUtterance(item.text);
      u.lang = voice ? voice.lang : "ar-SA"; if (voice) u.voice = voice; u.rate = 1;
      u.onend = () => { if (my !== token) return; idx++; next(); };
      u.onerror = (e) => { if (my !== token || e.error === "interrupted" || e.error === "canceled") return; playing = false; ui(); icons(); toast("تعذّرت القراءة الصوتية على هذا المتصفح", "volume-x"); };
      synth.speak(u);
    };
    document.addEventListener("click", (e) => {
      if (!e.target.closest("[data-tts]")) return;
      if (playing) { playing = false; token++; synth.cancel(); }
      else { queue = queue || build(); playing = true; synth.cancel(); next(); if (!voice && synth.getVoices().length) toast("لا يوجد صوت عربي في متصفحك، جرّب Chrome أو Edge", "volume-x"); }
      ui(); icons();
    });
    addEventListener("pagehide", () => synth.cancel());
  }
})();
