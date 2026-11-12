/* ==========================================================
   النواة: الهيدر والفوتر والثيم والبحث والأدوات المشتركة
   ========================================================== */
(function () {
  "use strict";
  const S = window.SITE;
  const page = document.body.dataset.page || "";

  /* ---------- Utils ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } }
  };
  /* Icons: draw only the <i data-lucide> placeholders that are still waiting.
     (lucide.createIcons() re-creates every icon already on the page on each call, which is slow on long lists.) */
  const pascal = (n) => n.replace(/(^|-)([a-z0-9])/g, (m, a, c) => c.toUpperCase());
  // pages ship a small subset (scripts/build-icons.mjs); an icon outside it pulls the full library once
  let fullAsked = false;
  function fullIcons() {
    if (fullAsked) return; fullAsked = true;
    const s = document.createElement("script"); s.src = "assets/js/vendor/lucide-0.460.0.min.js"; s.onload = () => icons(); document.head.appendChild(s);
  }
  function icons(root) {
    const L = window.lucide; if (!L) return;
    const list = (root && root.querySelectorAll ? root : document).querySelectorAll("i[data-lucide]");
    if (!list.length) return;
    if (!L.icons || !L.createElement) { L.createIcons({ attrs: { "stroke-width": 1.8 } }); return; }
    for (const el of list) {
      const name = el.getAttribute("data-lucide"), node = L.icons[pascal(name)];
      if (!node) { if (L.subset) fullIcons(); continue; }
      const svg = L.createElement(node);
      for (const a of el.attributes) if (a.name !== "class") svg.setAttribute(a.name, a.value);
      svg.setAttribute("stroke-width", "1.8");
      svg.setAttribute("class", `lucide lucide-${name}${el.className ? " " + el.className : ""}`);
      el.replaceWith(svg);
    }
  }
  const ic = (name, cls = "") => `<i data-lucide="${name}"${cls ? ` class="${cls}"` : ""}></i>`;
  const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const param = (k) => new URLSearchParams(location.search).get(k);

  const nf = new Intl.NumberFormat("ar-IQ-u-nu-latn");
  const fmtNum = (n) => nf.format(n);
  const fmtCompact = (n) => new Intl.NumberFormat("ar-u-nu-latn", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  const fmtDate = (iso) => {
    try { return new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { year: "numeric", month: "long", day: "numeric" }).format(new Date(iso + "T12:00:00")); }
    catch { return iso; }
  };
  const fmtBytes = (b) => {
    if (!isFinite(b)) return "—";
    const u = ["بايت", "ك.ب", "م.ب", "غ.ب"]; let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return `${b.toFixed(i ? 1 : 0)} ${u[i]}`;
  };
  const readTime = (html) => Math.max(1, Math.round(String(html).replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length / 180));

  /* Arabic-aware normalization for search */
  const norm = (s) => String(s || "").toLowerCase()
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
  const matches = (text, q) => { const t = norm(text); return norm(q).split(" ").filter(Boolean).every((w) => t.includes(w)); };

  /* ---------- Toast / copy / download ---------- */
  let toastWrap;
  function toast(msg, icon = "check-circle-2") {
    if (!toastWrap) { toastWrap = document.createElement("div"); toastWrap.className = "toast-wrap"; toastWrap.setAttribute("role", "status"); document.body.appendChild(toastWrap); }
    const el = document.createElement("div"); el.className = "toast"; el.innerHTML = `${ic(icon)}<span>${esc(msg)}</span>`;
    toastWrap.appendChild(el); icons();
    setTimeout(() => { el.style.opacity = "0"; el.style.transition = ".3s"; setTimeout(() => el.remove(), 300); }, 2600);
  }
  async function copy(text, msg = "تم النسخ") {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0";
      document.body.appendChild(ta); ta.select(); document.execCommand("copy"); ta.remove();
    }
    toast(msg, "copy");
  }
  function download(blob, name) {
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  /* ---------- Modal ---------- */
  function modal(html, { onClose } = {}) {
    const bd = document.createElement("div"); bd.className = "modal-backdrop";
    bd.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><button class="icon-btn close" aria-label="إغلاق">${ic("x")}</button>${html}</div>`;
    const close = () => { bd.remove(); document.removeEventListener("keydown", onKey); onClose && onClose(); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    bd.addEventListener("click", (e) => { if (e.target === bd || e.target.closest(".close")) close(); });
    document.addEventListener("keydown", onKey);
    document.body.appendChild(bd); icons();
    return { el: bd, close };
  }

  /* ---------- Saved facts ---------- */
  const saved = {
    all: () => store.get("saved-facts", []),
    has: (id) => saved.all().includes(id),
    toggle(id) {
      const list = saved.all(); const i = list.indexOf(id);
      if (i >= 0) list.splice(i, 1); else list.unshift(id);
      store.set("saved-facts", list);
      if (i < 0) offlineSave(id);
      toast(i >= 0 ? "أُزيلت من المحفوظات" : "حُفظت في المحفوظات", i >= 0 ? "bookmark-minus" : "bookmark-check");
      return i < 0;
    }
  };

  /* ---------- Data helpers ---------- */
  const branchOf = (id) => (window.BRANCHES || []).find((b) => b.id === id);
  const cat = (id) => window.CATEGORIES.find((c) => c.id === id) || (branchOf(id) && { ...branchOf(id), name: branchOf(id).short }) || { name: id, icon: "info", c1: "#333", c2: "#666" };
  /* ---------- Telegram channel posts (generated by scripts/telegram-sync.mjs) ---------- */
  const TG_TYPES = { fact: "معلومة", news: "خبر", event: "فعالية", discussion: "سؤال للنقاش", literature: "شعر وأدب" };
  const tgUrl = (id) => `https://t.me/${(window.TG && TG.channel) || "informationss_iq"}/${id}`;
  function tgToItem(p) {
    return {
      id: "tg-" + p.id, tg: p.id, type: p.type, title: p.title, cat: window.CATEGORIES.some((c) => c.id === p.cat) ? p.cat : "culture",
      date: p.date, excerpt: p.excerpt, body: "", minutes: Math.max(1, Math.round(p.len / 5 / 180)), image: p.image, images: p.images,
      media: p.media, video: p.video, views: p.views, tags: p.tags || [], conf: p.conf, why: p.why, len: p.len,
      sources: [{ name: "قناة إمبراطورية المعلومات على تليغرام", url: tgUrl(p.id), kind: "telegram" }], srcCount: 1 + (p.src || 0), source: "telegram"
    };
  }
  // a static post page carries only the few records it needs (window.STATIC_CTX, written by scripts/build-pages.mjs);
  // the full files then load on demand (search) and replace them
  const CTX = window.STATIC_CTX || null;
  function mergeTG() {
    window.TG_ITEMS = (window.TG && Array.isArray(TG.posts) ? TG.posts : (CTX && CTX.tg) || []).map(tgToItem);
    const own = window.FACTS.filter((f) => f.source !== "telegram");
    window.FACTS.length = 0; window.FACTS.push(...own, ...window.TG_ITEMS.filter((p) => p.type === "fact"));
  }
  mergeTG();
  /* ---------- Branch channels: news, games, music, anime, sport (generated by scripts/branches-sync.mjs) ---------- */
  function brToItem(p) {
    const b = branchOf(p.b) || { short: p.b, name: p.b, channel: "" };
    return {
      id: p.id, tg: p.id, branch: p.b, type: "news", title: p.title, cat: p.b, date: p.date, excerpt: p.excerpt, body: "",
      minutes: Math.max(1, Math.round(p.len / 5 / 180)), image: p.image, images: p.images, media: p.media, video: p.video, views: p.views, tags: p.tags || [], len: p.len,
      sources: [{ name: `قناة ${b.name} على تليغرام`, url: `https://t.me/${b.channel}/${p.msg}`, kind: "telegram" }], srcCount: 1, source: "telegram"
    };
  }
  function mergeBR() { window.BR_ITEMS = (window.BR && Array.isArray(BR.posts) ? BR.posts : (CTX && CTX.br) || []).map(brToItem); }
  mergeBR();
  let brLoading = null;
  function ensureBR() {
    if (window.BR) return Promise.resolve();
    return brLoading || (brLoading = new Promise((res) => {
      const s = document.createElement("script"); s.src = "assets/js/branches-data.js";
      s.onload = s.onerror = () => { mergeBR(); res(); };
      document.head.appendChild(s);
    }));
  }

  // Light pages (tools) skip the big channel file; it loads on demand (e.g. when the search opens)
  let tgLoading = null;
  function ensureTG() {
    if (window.TG) return Promise.resolve();
    return tgLoading || (tgLoading = new Promise((res) => {
      const s = document.createElement("script"); s.src = "assets/js/telegram-data.js";
      s.onload = s.onerror = () => { mergeTG(); res(); };
      document.head.appendChild(s);
    }));
  }

  // static page if one was generated (scripts/build-pages.mjs), otherwise the dynamic page
  const factUrl = (id) => (window.STATIC_POSTS && window.STATIC_POSTS[id] ? `post/${encodeURIComponent(id)}.html` : `fact.html?id=${encodeURIComponent(id)}`);
  const factsSorted = () => [...window.FACTS].sort((a, b) => b.date.localeCompare(a.date) || (b.tg || 0) - (a.tg || 0));
  const coverStyle = (c) => `--c1:${c.c1};background:linear-gradient(135deg, ${c.c1}, ${c.c2})`;
  const minutesOf = (f) => f.minutes || readTime(f.body);
  const mediaBadge = (f) => f.media === "video" ? `<span class="badge badge-glass media-badge">${ic("play")}فيديو${f.video && f.video.duration ? " · " + esc(f.video.duration) : ""}</span>`
    : f.images > 1 ? `<span class="badge badge-glass media-badge">${ic("images")}${f.images} صور</span>` : "";

  /* Poster card: the image fills the card, text floats on a dark veil.
     No image → a generated cover in the category's colours. Must end with </article> (channel admin mode appends to it). */
  function factCard(f) {
    const c = cat(f.cat);
    const href = factUrl(f.id);
    const type = f.type && f.type !== "fact" && !f.branch ? `<span class="fc-tag">${esc(TG_TYPES[f.type] || f.type)}</span>` : "";
    const media = f.media === "video" ? `<span class="fc-tag">${ic("play")}${f.video && f.video.duration ? esc(f.video.duration) : "فيديو"}</span>`
      : f.images > 1 ? `<span class="fc-tag">${ic("images")}${f.images}</span>` : "";
    const verified = f.srcCount > 1 ? `<span class="fc-tag fc-src" title="موثّقة بمصادر إضافية من الويب">${ic("badge-check")}${f.srcCount} مصادر</span>` : "";
    return `<article class="fc fact-card${f.image ? " has-img" : ""}${f.media === "video" ? " is-video" : ""}" data-tilt="6" style="--c1:${c.c1};--c2:${c.c2}">
      <div class="fc-media" aria-hidden="true">
        <div class="fc-gen"><span class="fc-ring"></span><span class="fc-ring r2"></span>${ic(f.icon || c.icon)}</div>
        ${f.image ? `<img src="${esc(f.image)}" alt="" loading="lazy" decoding="async" onerror="this.closest('.fc').classList.remove('has-img');this.remove()">` : ""}
      </div>
      <div class="fc-veil"></div>
      <div class="fc-top"><span class="fc-cat">${ic(c.icon)}${esc(c.name)}</span>${type}${media}${verified}</div>
      ${f.branch ? "" : `<button class="save-btn${saved.has(f.id) ? " saved" : ""}" data-save="${esc(f.id)}" aria-label="حفظ المعلومة">${ic("bookmark")}</button>`}
      ${f.media === "video" ? `<span class="play-dot" aria-hidden="true">${ic("play")}</span>` : ""}
      <div class="fc-body">
        <h3><a href="${href}" class="fc-link">${esc(f.title)}</a></h3>
        <p class="fc-ex">${esc(f.excerpt)}</p>
        <div class="fc-meta">
          <span>${ic("calendar")}${fmtDate(f.date)}</span><span>${ic("clock")}${minutesOf(f)} د</span>${f.views ? `<span>${ic("eye")}${fmtCompact(f.views)}</span>` : ""}
          <span class="fc-go" aria-hidden="true">${ic("arrow-up-left")}</span>
        </div>
      </div>
    </article>`;
  }

  document.addEventListener("click", (e) => {
    const b = e.target.closest("[data-save]"); if (!b) return;
    e.preventDefault();
    const on = saved.toggle(b.dataset.save);
    $$(`[data-save="${CSS.escape(b.dataset.save)}"]`).forEach((x) => x.classList.toggle("saved", on));
    document.dispatchEvent(new CustomEvent("saved-change"));
  });

  /* ---------- Logo ---------- */
  const logo = (size = 40) => `<img class="brand-logo" src="assets/img/logo-128.webp" srcset="assets/img/logo-128.webp 1x, assets/img/logo-256.webp 2x" width="${size}" height="${size}" alt="" decoding="async">`;

  /* ---------- Navigation ---------- */
  const NAV = [
    { href: "index.html", label: "الرئيسية", icon: "home", id: "home" },
    { href: "branch.html", label: "الفروع", icon: "layout-grid", id: "branch", drop: "branches" },
    { href: "facts.html", label: "المعلومات", icon: "book-open", id: "facts" },
    { href: "branch.html?b=news", label: "الأخبار", icon: "newspaper", id: "news-branch" },
    { label: "الأدوات", icon: "wrench", id: "tools", drop: "tools" },
    { href: "quiz.html", label: "اختبر نفسك", icon: "brain", id: "quiz" },
    { href: "verify.html", label: "تحقق معنا", icon: "shield-check", id: "verify" },
    { href: "about.html", label: "من نحن", icon: "crown", id: "about" },
    { href: "contact.html", label: "تواصل", icon: "mail", id: "contact" }
  ];
  // an article from a branch ("news-123", "games-456"…) belongs to that branch, not to the facts library
  const postId = page === "fact" ? String(window.STATIC_ID || new URLSearchParams(location.search).get("id") || "") : "";
  const postBranch = (window.BRANCHES || []).find((b) => b.id !== "info" && postId.startsWith(b.id + "-"));
  const curBranch = new URLSearchParams(location.search).get("b") || (postBranch && postBranch.id);
  const inBranch = page === "branch" || !!postBranch;
  const isActive = (n) => n.id === "news-branch" ? inBranch && curBranch === "news"
    : n.id === "branch" ? inBranch && curBranch !== "news"
    : n.id === page || (n.id === "tools" && page.startsWith("tool")) || (n.id === "facts" && page === "fact" && !postBranch);

  function socialLinks() {
    const L = S.links; const out = [];
    if (L.instagram) out.push(["instagram", L.instagram, "إنستغرام"]);
    if (L.telegram) out.push(["send", L.telegram, "تليغرام"]);
    if (L.whatsapp) out.push(["message-circle", `https://wa.me/${L.whatsapp}`, "واتساب"]);
    if (L.facebook) out.push(["facebook", L.facebook, "فيسبوك"]);
    if (L.x) out.push(["twitter", L.x, "إكس"]);
    if (L.youtube) out.push(["youtube", L.youtube, "يوتيوب"]);
    if (L.tiktok) out.push(["music-2", L.tiktok, "تيك توك"]);
    if (L.email) out.push(["mail", `mailto:${L.email}`, "البريد"]);
    return out;
  }

  function renderHeader() {
    const host = $("#site-header"); if (!host) return;
    const toolsMenu = window.TOOLS.map((t) => `<a href="${t.href}"><span class="ico ico-sm">${ic(t.icon)}</span><span>${esc(t.title)}<small>${esc(t.desc.split("،")[0])}</small></span></a>`).join("");
    const branchMenu = (window.BRANCHES || []).map((b) => `<a href="${b.href}"><span class="ico ico-sm" style="background:linear-gradient(135deg,${b.c1},${b.c2});color:#fff">${ic(b.icon)}</span><span>${esc(b.name)}<small>${esc(b.desc.split(/[:،]/)[0])}</small></span></a>`).join("");
    const navHtml = NAV.map((n) => n.drop
      ? `<div class="nav-drop${isActive(n) ? " active" : ""}"><button type="button" aria-haspopup="true">${n.label}${ic("chevron-down")}</button><div class="nav-menu">${n.drop === "branches"
          ? `${branchMenu}<a href="branch.html" style="justify-content:center;color:var(--gold);font-weight:600">كل الفروع ${ic("arrow-left")}</a>`
          : `${toolsMenu}<a href="tools.html" style="justify-content:center;color:var(--gold);font-weight:600">كل الأدوات ${ic("arrow-left")}</a>`}</div></div>`
      : `<a href="${n.href}"${isActive(n) ? ' class="active" aria-current="page"' : ""}>${n.label}</a>`).join("");
    const mainLinks = NAV.map((n, i) => n.drop === "tools" ? { ...n, href: "tools.html" } : n)
      .map((n, i) => `<a href="${n.href}" style="--i:${i}"${isActive(n) ? ' class="active"' : ""}><small>${String(i + 1).padStart(2, "0")}</small>${n.label}</a>`).join("");

    host.outerHTML = `<header class="site-header">
      <div class="container">
        <a href="index.html" class="brand" aria-label="${esc(S.name)} - الرئيسية">${logo()}<span class="brand-text"><span class="brand-name">${esc(S.shortName)}</span><span class="brand-sub">العراقية · سبعة فروع</span></span></a>
        <nav class="nav" aria-label="القائمة الرئيسية">${navHtml}</nav>
        <div class="header-actions">
          <button class="icon-btn" id="search-btn" aria-label="بحث (اضغط /)">${ic("search")}</button>
          <button class="icon-btn theme-btn" id="theme-btn" aria-label="تبديل الوضع الليلي والنهاري">${ic("moon", "i-moon")}${ic("sun", "i-sun")}</button>
          <button class="icon-btn lite-btn" id="lite-btn" aria-pressed="${isLite()}" aria-label="الوضع الخفيف: يوقف المؤثرات الثقيلة ليصير الموقع أسرع" title="الوضع الخفيف">${ic("feather")}</button>
          <button class="icon-btn menu-btn" id="menu-btn" aria-label="القائمة" aria-controls="drawer" aria-expanded="false">${ic("menu")}</button>
        </div>
      </div>
    </header>
    <div class="reading-progress" id="reading-progress"></div>
    <div class="drawer-backdrop" id="drawer-bd"></div>
    <aside class="drawer" id="drawer" aria-label="القائمة الجانبية">
      <div class="drawer-head"><a href="index.html" class="brand">${logo(40)}<span class="brand-name">${esc(S.shortName)}</span></a><button class="icon-btn" id="drawer-close" aria-label="إغلاق">${ic("x")}</button></div>
      <div class="drawer-grid">
        <nav class="drawer-main" aria-label="الصفحات">${mainLinks}</nav>
        <div class="drawer-side">
          <div class="drawer-label">فروع الإمبراطورية</div>
          ${(window.BRANCHES || []).map((b) => `<a href="${b.href}"${page === "branch" && curBranch === b.id ? ' class="active"' : ""}>${ic(b.icon)}${esc(b.name)}</a>`).join("")}
          <div class="drawer-label">الأدوات الرقمية</div>
          ${window.TOOLS.map((t) => `<a href="${t.href}"${page === "tool-" + t.id ? ' class="active"' : ""}>${ic(t.icon)}${esc(t.title)}</a>`).join("")}
          <a href="tools.html">${ic("layout-grid")}كل الأدوات</a>
          <button class="btn btn-primary mt-2 pwa-install" hidden>${ic("download")}ثبّت الموقع كتطبيق</button>
          <div class="drawer-label">الأداء</div>
          <button type="button" class="lite-row" data-lite-toggle aria-pressed="${isLite()}">${ic("feather")}<span>الوضع الخفيف<small>أسرع على الهواتف والأجهزة الضعيفة</small></span><i class="sw" aria-hidden="true"></i></button>
          <div class="drawer-label">تابعنا</div>
          <div class="socials" style="padding:4px 12px">${socialLinks().map(([i, h, l]) => `<a class="icon-btn" href="${h}" target="_blank" rel="noopener" aria-label="${l}" style="padding:0">${ic(i)}</a>`).join("")}</div>
        </div>
      </div>
    </aside>`;

    const openD = () => { document.body.classList.add("drawer-open"); $("#menu-btn").setAttribute("aria-expanded", "true"); };
    const closeD = () => { document.body.classList.remove("drawer-open"); $("#menu-btn").setAttribute("aria-expanded", "false"); };
    $("#menu-btn").addEventListener("click", openD);
    $("#drawer-close").addEventListener("click", closeD);
    $("#drawer-bd").addEventListener("click", closeD);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && document.body.classList.contains("drawer-open")) closeD(); });
    $("#theme-btn").addEventListener("click", toggleTheme);
    $("#lite-btn").addEventListener("click", () => setLite(!isLite()));
    $("[data-lite-toggle]").addEventListener("click", () => setLite(!isLite()));
    $("#search-btn").addEventListener("click", openSearch);
  }

  function renderFooter() {
    const host = $("#site-footer"); if (!host) return;
    const big = socialLinks().filter(([i]) => i === "instagram" || i === "send");
    host.outerHTML = `<footer class="site-footer" data-sc>
      <div class="container">
        <div class="footer-hero">
          <div>
            <span class="kicker">كل ما هو حقيقي ومفيد</span>
            <h2 data-split>انضم إلى <span class="gold-text">الإمبراطورية</span></h2>
            <p>تابعنا لتصلك المعلومة الموثّقة أولاً بأول، وشاركنا اقتراحاتك وتصحيحاتك. أكثر من ${fmtCompact(S.stats.followers)} شخص سبقوك.</p>
            <div class="btn-row">${big.map(([i, h, l], k) => `<a class="btn ${k === 0 ? "btn-primary" : "btn-ghost"} btn-lg" href="${h}" target="_blank" rel="noopener">${ic(i)}${l}</a>`).join("")}</div>
          </div>
          <div class="f-slot" data-gl="crown" aria-hidden="true"></div>
        </div>
        <div class="footer-grid">
          <div>
            <a href="index.html" class="brand">${logo(46)}<span class="brand-text"><span class="brand-name">${esc(S.name)}</span><span class="brand-sub">@${esc(S.handle)}</span></span></a>
            <p class="footer-about">${esc(S.description)} ${esc(S.tagline)}.</p>
            <div class="socials">${socialLinks().map(([i, h, l]) => `<a class="icon-btn" href="${h}" target="_blank" rel="noopener" aria-label="${l}" title="${l}">${ic(i)}</a>`).join("")}</div>
          </div>
          <div><h4>فروع الإمبراطورية</h4><ul>
            ${(window.BRANCHES || []).map((b) => `<li><a href="${b.href}">${esc(b.name)}</a></li>`).join("")}
            <li><a href="branch.html">كل الفروع</a></li></ul></div>
          <div><h4>الموقع</h4><ul>
            <li><a href="facts.html">مكتبة المعلومات</a></li><li><a href="facts.html?saved=1">محفوظاتي</a></li>
            <li><a href="quiz.html">اختبر معلوماتك</a></li><li><a href="news.html">الأخبار والإنجازات</a></li>
            <li><a href="channel.html">من قناة تليغرام</a></li><li><a href="channel.html?type=event">فعاليات القناة</a></li>
            <li><a href="topic/index.html">فهرس المواضيع</a></li><li><a href="archive/index.html">أرشيف المنشورات</a></li>
            <li><a href="about.html">من نحن</a></li><li><a href="about.html#ads">أعلن معنا</a></li><li><a href="privacy.html">سياسة الخصوصية</a></li></ul></div>
          <div><h4>أدوات التحقق</h4><ul>
            ${window.TOOLS.filter((t) => t.group === "verify").map((t) => `<li><a href="${t.href}">${esc(t.title)}</a></li>`).join("")}</ul></div>
          <div><h4>أدوات رقمية</h4><ul>
            ${window.TOOLS.filter((t) => t.group !== "verify").map((t) => `<li><a href="${t.href}">${esc(t.title)}</a></li>`).join("")}
            <li><a href="contact.html">تواصل معنا</a></li></ul></div>
        </div>
        <div class="footer-giant" aria-hidden="true">الإمبراطورية العراقية</div>
        <div class="pwa-band" hidden><span class="ico">${ic("smartphone")}</span><div><strong>خلّي الإمبراطورية على شاشة هاتفك</strong><small>ثبّت الموقع كتطبيق، وافتح معلوماتك المحفوظة حتى بدون إنترنت.</small></div><button class="btn btn-primary pwa-install">${ic("download")}ثبّت التطبيق</button></div>
        <div class="footer-bottom">
          <span>© ${S.year} ${esc(S.name)}. جميع الحقوق محفوظة. · <a href="privacy.html">سياسة الخصوصية</a></span>
          <span>${ic("shield-check", "")} أدواتنا تعمل داخل جهازك، ولا نحفظ صورك أو بياناتك.</span>
        </div>
      </div>
    </footer>
    <button class="icon-btn to-top" id="to-top" aria-label="للأعلى">${ic("arrow-up")}</button>`;
    const tt = $("#to-top");
    tt.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
  }

  /* ---------- Theme ---------- */
  function currentTheme() {
    const t = document.documentElement.dataset.theme;
    return t || "dark";
  }
  function toggleTheme() {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    store.set("theme", next);
  }

  /* ---------- Light mode (الوضع الخفيف) ----------
     The inline script in <head> decides it before first paint (class "lite" on <html>).
     Stored choice: "lite" = "on" | "off" (the visitor's own choice, wins over detection);
     "lite-auto" = expiry timestamp written by the frame-rate watchdog in fx.js. */
  function isLite() { return document.documentElement.classList.contains("lite"); }
  function liteMode() { const v = store.get("lite", null); return v === "on" || v === "off" ? v : "auto"; }
  function setLite(on, auto) {
    const d = document.documentElement; on = !!on;
    if (auto) { try { localStorage.setItem("lite-auto", String(Date.now() + 7 * 864e5)); } catch { /* ignore */ } }
    else { store.set("lite", on ? "on" : "off"); try { localStorage.removeItem("lite-auto"); } catch { /* ignore */ } }
    d.classList.toggle("lite", on);
    if (on) d.classList.add("rm", "no-gl");
    $$("#lite-btn, [data-lite-toggle]").forEach((b) => b.setAttribute("aria-pressed", String(on)));
    document.dispatchEvent(new CustomEvent("lite-change", { detail: { on, auto: !!auto } }));
    toast(auto ? "فعّلنا الوضع الخفيف لأن جهازك يتعثّر مع المؤثرات. تقدر توقفه من زر الريشة في الأعلى."
      : on ? "الوضع الخفيف يعمل: بلا مؤثرات ثقيلة، والموقع أسرع." : "أُوقف الوضع الخفيف: عادت المؤثرات الكاملة.", "feather");
  }

  /* ---------- Global search ---------- */
  const PAGES = [
    { t: "الرئيسية", s: "الصفحة الرئيسية", h: "index.html", i: "home" },
    { t: "مكتبة المعلومات", s: "كل المعلومات الموثّقة", h: "facts.html", i: "book-open" },
    { t: "فروع الإمبراطورية", s: "الأخبار والألعاب والموسيقى والأنمي والرياضة", h: "branch.html", i: "layout-grid" },
    ...(window.BRANCHES || []).filter((b) => b.id !== "info").map((b) => ({ t: b.name, s: b.desc, h: b.href, i: b.icon })),
    { t: "محفوظاتي", s: "المعلومات التي حفظتها", h: "facts.html?saved=1", i: "bookmark" },
    { t: "اختبر معلوماتك", s: "كويز تفاعلي", h: "quiz.html", i: "brain" },
    { t: "الأخبار والإنجازات", s: "أخبار الصفحة وإنجازاتها", h: "news.html", i: "newspaper" },
    { t: "من قناة تليغرام", s: "منشورات القناة مصنّفة تلقائياً", h: "channel.html", i: "send" },
    { t: "فعاليات القناة", s: "المسابقات والفعاليات", h: "channel.html?type=event", i: "party-popper" },
    { t: "تحقق معنا", s: "كشف الإشاعات والأخبار الكاذبة", h: "verify.html", i: "shield-check" },
    { t: "من نحن", s: "رؤيتنا وسياسة التحرير والإعلان", h: "about.html", i: "crown" },
    { t: "أعلن معنا", s: "باقات الإعلان والتعاون", h: "about.html#ads", i: "megaphone" },
    { t: "تواصل معنا", s: "أرسل اقتراحاً أو تصحيحاً أو طلب إعلان", h: "contact.html", i: "mail" },
    { t: "سياسة الخصوصية", s: "ما البيانات التي نعالجها وحقوقك", h: "privacy.html", i: "shield-check" }
  ];
  function openSearch() {
    if ($(".search-overlay")) return;
    const ov = document.createElement("div"); ov.className = "search-overlay";
    ov.innerHTML = `<div class="search-panel" role="dialog" aria-label="بحث في الموقع">
      <div class="search-box">${ic("search")}<input class="input" id="gs-input" type="search" placeholder="ابحث في المعلومات والأخبار والأدوات… مثل: بابل، GTA، ريال مدريد" autocomplete="off"></div>
      <div class="search-results" id="gs-results"></div>
      <div class="flex between items-center small muted" style="padding:10px 16px;border-top:1px solid var(--border)"><span><span class="kbd">Esc</span> للإغلاق</span><span><span class="kbd">Enter</span> لفتح أول نتيجة</span></div>
    </div>`;
    document.body.appendChild(ov); icons();
    const input = $("#gs-input", ov), res = $("#gs-results", ov);
    const close = () => { ov.remove(); document.removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", onKey);
    ov.addEventListener("click", (e) => { if (e.target === ov) close(); });
    const row = (h, i, t, s) => `<a href="${h}"><span class="ico ico-sm">${ic(i)}</span><span style="min-width:0"><span class="t">${esc(t)}</span><span class="s">${esc(s)}</span></span></a>`;
    const run = () => {
      const q = input.value.trim();
      let facts, tools, pages, news = [];
      if (!q) { facts = factsSorted().slice(0, 4); tools = window.TOOLS.slice(0, 3); pages = []; news = (window.BR_ITEMS || []).slice(0, 3); }
      else {
        facts = window.FACTS.filter((f) => matches(`${f.title} ${f.excerpt} ${f.tags.join(" ")} ${cat(f.cat).name}`, q)).slice(0, 8);
        news = (window.BR_ITEMS || []).filter((f) => matches(`${f.title} ${f.excerpt} ${cat(f.cat).name}`, q)).slice(0, 6);
        tools = window.TOOLS.filter((t) => matches(`${t.title} ${t.desc}`, q));
        pages = PAGES.filter((p) => matches(`${p.t} ${p.s}`, q));
      }
      let html = "";
      if (facts.length) html += `<div class="grp">${q ? "معلومات" : "أحدث المعلومات"}</div>` + facts.map((f) => row(factUrl(f.id), f.icon || cat(f.cat).icon, f.title, f.excerpt)).join("");
      if (news.length) html += `<div class="grp">${q ? "من فروع الإمبراطورية" : "أحدث الأخبار"}</div>` + news.map((f) => row(factUrl(f.id), cat(f.cat).icon, f.title, `${cat(f.cat).name} · ${f.excerpt}`)).join("");
      if (tools.length) html += `<div class="grp">أدوات</div>` + tools.map((t) => row(t.href, t.icon, t.title, t.desc)).join("");
      if (pages.length) html += `<div class="grp">صفحات</div>` + pages.map((p) => row(p.h, p.i, p.t, p.s)).join("");
      res.innerHTML = html || `<div class="empty">${ic("search-x")}<p class="mt-1">لا نتائج لـ«${esc(q)}». جرّب كلمة أخرى.</p></div>`;
      icons();
    };
    input.addEventListener("input", debounce(run, 120));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { const a = $("a", res); if (a) location.href = a.href; } });
    run(); input.focus();
    if (!window.TG) ensureTG().then(() => { if (document.body.contains(input)) run(); });
    if (!window.BR) ensureBR().then(() => { if (document.body.contains(input)) run(); });
  }
  document.addEventListener("keydown", (e) => {
    const tag = (e.target.tagName || "").toLowerCase();
    if ((e.key === "/" || (e.key === "k" && (e.ctrlKey || e.metaKey))) && !["input", "textarea", "select"].includes(tag) && !e.target.isContentEditable) {
      e.preventDefault(); openSearch();
    }
  });

  /* ---------- Scroll effects ---------- */
  function onScroll() {
    const y = window.scrollY;
    const tt = $("#to-top"); if (tt) tt.classList.toggle("show", y > 600);
    if (document.body.dataset.progress !== undefined) {
      const bar = $("#reading-progress"); const h = document.documentElement.scrollHeight - innerHeight;
      if (bar) bar.style.width = `${h > 0 ? Math.min(100, (y / h) * 100) : 0}%`;
    }
  }

  /* Count-up animation for [data-count] */
  function countUp(root = document) {
    const els = $$("[data-count]", root); if (!els.length) return;
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return; io.unobserve(en.target);
      const el = en.target, end = +el.dataset.count, compact = el.dataset.compact !== undefined, dur = 1200, t0 = performance.now();
      const step = (t) => { const p = Math.min(1, (t - t0) / dur), v = Math.round(end * (1 - Math.pow(1 - p, 3)));
        el.textContent = compact ? fmtCompact(v) : fmtNum(v); if (p < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }), { threshold: .4 });
    els.forEach((e) => io.observe(e));
  }

  /* Shared: drop zone wiring (click, drag, paste) */
  function dropzone(zone, input, onFiles) {
    zone.addEventListener("click", () => input.click());
    zone.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.click(); } });
    input.addEventListener("change", () => { if (input.files.length) onFiles([...input.files]); input.value = ""; });
    ["dragenter", "dragover"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add("drag"); }));
    ["dragleave", "drop"].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove("drag"); }));
    zone.addEventListener("drop", (e) => { const f = [...(e.dataTransfer?.files || [])]; if (f.length) onFiles(f); });
    document.addEventListener("paste", (e) => {
      const f = [...(e.clipboardData?.files || [])].filter((x) => x.type.startsWith("image/"));
      if (f.length) { e.preventDefault(); onFiles(f); toast("تم لصق الصورة", "clipboard-check"); }
    });
  }

  function shareButtons(url, text) {
    const u = encodeURIComponent(url), t = encodeURIComponent(text);
    return `<div class="share-row">
      <button class="btn btn-ghost btn-sm" data-copy="${esc(url)}">${ic("link")}نسخ الرابط</button>
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${t}%20${u}">${ic("message-circle")}واتساب</a>
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://t.me/share/url?url=${u}&text=${t}">${ic("send")}تليغرام</a>
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://x.com/intent/post?text=${t}&url=${u}">${ic("twitter")}إكس</a>
      <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${u}">${ic("facebook")}فيسبوك</a>
      ${navigator.share ? `<button class="btn btn-ghost btn-sm" data-native-share>${ic("share-2")}مشاركة</button>` : ""}
    </div>`;
  }
  document.addEventListener("click", (e) => {
    const c = e.target.closest("[data-copy]"); if (c) { copy(c.dataset.copy); return; }
    const n = e.target.closest("[data-native-share]"); if (n) navigator.share({ title: document.title, url: location.href }).catch(() => {});
  });

  /* ---------- Init ---------- */
  renderHeader();
  renderFooter();
  icons();
  countUp();
  window.addEventListener("scroll", onScroll, { passive: true });
  requestAnimationFrame(onScroll); // not synchronously: reading the scroll position here forces a full layout before the page scripts have filled the page

  /* ---------- PWA: offline worker + install button ---------- */
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let installEvt = null;
  const showInstall = (on) => { $$(".pwa-install").forEach((b) => (b.hidden = !on)); $$(".pwa-band").forEach((b) => (b.hidden = !on)); };
  addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; showInstall(true); });
  addEventListener("appinstalled", () => { showInstall(false); toast("تم التثبيت! تجد الإمبراطورية على شاشة هاتفك", "smartphone"); });
  if (isIOS && !standalone) showInstall(true);
  document.addEventListener("click", async (e) => {
    if (!e.target.closest(".pwa-install")) return;
    if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice; if (r.outcome === "accepted") showInstall(false); installEvt = null; return; }
    modal(`<span class="ico mb-2">${ic("smartphone")}</span><h2 style="font-size:1.5rem">ثبّت الإمبراطورية على الآيفون</h2>
      <ol class="mt-2" style="line-height:2.2;padding-inline-start:1.3em"><li>افتح الموقع في <strong>سفاري</strong>.</li><li>اضغط زر المشاركة ${ic("share")} أسفل الشاشة.</li><li>اختر <strong>«إضافة إلى الشاشة الرئيسية»</strong>.</li></ol>`);
  });
  // cache a fact (page + full text + images) for offline reading when it is saved
  function cacheForOffline(urls) {
    if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return;
    navigator.serviceWorker.controller.postMessage({ type: "cache", urls: urls.map((u) => new URL(u, document.baseURI).href) });
  }
  function offlineSave(id) {
    const f = window.FACTS.find((x) => x.id === id) || (window.TG_ITEMS || []).find((x) => x.id === id);
    const urls = [factUrl(id)];
    if (f && f.tg) urls.push(`assets/tg/posts/${f.tg}.js`);
    if (f && f.image) urls.push(f.image);
    cacheForOffline(urls);
  }

  window.App = { $, $$, esc, ic, icons, store, toast, copy, download, modal, debounce, param, fmtNum, fmtCompact, fmtDate, fmtBytes,
    readTime, norm, matches, saved, isLite, liteMode, setLite, factUrl, cat, branchOf, factsSorted, factCard, ensureBR, coverStyle, logo, countUp, dropzone, shareButtons, socialLinks, ensureTG, cacheForOffline };
})();
