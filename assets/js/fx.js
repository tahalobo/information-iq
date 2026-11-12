/* ==========================================================
   محرك الحركة: تمرير ناعم، ظهور ثلاثي الأبعاد، تأثيرات مرتبطة بالتمرير،
   إمالة البطاقات، أزرار مغناطيسية، مؤشر ذهبي، معرض أفقي، انتقال الصفحات
   ========================================================== */
(function () {
  "use strict";
  const doc = document.documentElement, body = document.body;
  const OS_RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = matchMedia("(pointer: fine)").matches;
  // «الوضع الخفيف»: يحدّده السكربت المضمَّن في <head> (صنف lite على <html>) أو زر الترويسة.
  // RM = وضع هادئ: إما أن النظام يطلب تقليل الحركة، أو أن الوضع الخفيف مفعّل. كل المؤثرات الثقيلة تُفحص عليه وقت التنفيذ.
  let LITE = doc.classList.contains("lite");
  let RM = OS_RM || LITE;
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  doc.classList.add("fx-on"); if (RM) doc.classList.add("rm");
  const loadScript = (src) => new Promise((res) => { const s = document.createElement("script"); s.src = src; s.onload = () => res(true); s.onerror = () => res(false); document.head.appendChild(s); });
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 200));
  try { sessionStorage.setItem("fx-seen", "1"); } catch { /* ignore */ }

  /* ---------- Grain + aurora layers ---------- */
  let deco = null, grain = null;
  function decoOn() {
    if (deco) return;
    deco = document.createElement("div"); deco.className = "fx-deco"; deco.setAttribute("aria-hidden", "true");
    deco.innerHTML = `<i class="aur a1"></i><i class="aur a2"></i><i class="aur a3"></i>`;
    grain = document.createElement("div"); grain.className = "fx-grain"; grain.setAttribute("aria-hidden", "true");
    body.prepend(deco); body.append(grain);
  }
  function decoOff() { if (deco) { deco.remove(); grain.remove(); deco = grain = null; } }
  if (!LITE) decoOn();

  /* ---------- Smooth scroll (Lenis) ---------- */
  let lenis = null, lenisMO = null;
  const LENIS_SRC = "assets/js/vendor/lenis-1.1.13.min.js";
  async function lenisOn() {
    if (RM || !FINE || lenis) return;
    if (!window.Lenis) await loadScript(LENIS_SRC);
    if (RM || lenis || !window.Lenis) return;
    lenis = new window.Lenis({
      lerp: 0.1, smoothWheel: true, wheelMultiplier: 1,
      prevent: (n) => !!(n.closest && n.closest(".modal-backdrop, .search-overlay, .drawer, .nav-menu, .search-results, .table-wrap, textarea, [data-lenis-prevent]"))
    });
    const raf = (t) => { if (!lenis) return; lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    // stop when overlays open
    const sync = () => {
      const lock = body.classList.contains("drawer-open") || !!document.querySelector(".modal-backdrop, .search-overlay");
      if (lenis) lock ? lenis.stop() : lenis.start();
    };
    lenisMO = new MutationObserver(sync); lenisMO.observe(body, { childList: true, attributes: true, attributeFilter: ["class"] });
  }
  function lenisOff() { if (lenisMO) { lenisMO.disconnect(); lenisMO = null; } if (lenis) { lenis.destroy(); lenis = null; } }
  lenisOn();
  const scrollToY = (y) => { if (lenis) lenis.scrollTo(y, { duration: 1.4 }); else window.scrollTo({ top: y, behavior: RM ? "auto" : "smooth" }); };
  // hash anchors + to-top go through the smooth scroller
  document.addEventListener("click", (e) => {
    const top = e.target.closest("#to-top"); if (top) { e.stopPropagation(); scrollToY(0); return; }
    const a = e.target.closest('a[href^="#"]'); if (!a || a.getAttribute("href").length < 2) return;
    const t = document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1))); if (!t) return;
    e.preventDefault(); scrollToY(t.getBoundingClientRect().top + scrollY - 90); history.replaceState(null, "", location.pathname + location.search + a.getAttribute("href")); // absolute: pages with <base href="../"> would otherwise jump to the root
  }, true);

  /* ---------- Page transitions ---------- */
  {
    document.addEventListener("click", (e) => {
      if (RM || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest("a[href]"); if (!a) return;
      if (a.target && a.target !== "_self") return; if (a.hasAttribute("download")) return;
      const href = a.getAttribute("href"); if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      e.preventDefault();
      try { sessionStorage.setItem("fx-nav", "1"); } catch { /* ignore */ }
      doc.classList.add("leaving");
      setTimeout(() => { location.href = url.href; }, 520);
    });
    addEventListener("pageshow", (e) => { if (e.persisted) doc.classList.remove("leaving", "entering"); });
  }

  /* ---------- Header: hide on scroll down, show on scroll up ---------- */
  let lastY = 0, hdr = null; // set by the first pass: asking for scrollY here would force a full layout in the middle of start-up
  function headerTick(y) {
    const h = hdr || (hdr = document.querySelector(".site-header")); if (!h) return;
    h.classList.toggle("scrolled", y > 24);
    if (!body.classList.contains("drawer-open")) {
      if (y > 220 && y > lastY + 6) h.classList.add("hdr-hide");
      else if (y < lastY - 6 || y < 220) h.classList.remove("hdr-hide");
    }
    doc.classList.toggle("hdr-hidden", h.classList.contains("hdr-hide"));
    lastY = y;
  }

  /* ---------- Split headings into words (Arabic-safe: never split letters) ---------- */
  function split(el) {
    if (el.dataset.splitDone) return; el.dataset.splitDone = "1";
    let i = 0;
    const walk = (node) => {
      Array.from(node.childNodes).forEach((n) => {
        if (n.nodeType === 3) {
          const parts = n.textContent.split(/(\s+)/); const frag = document.createDocumentFragment();
          parts.forEach((p) => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
            const w = document.createElement("span"); w.className = "w";
            const wi = document.createElement("span"); wi.className = "wi"; wi.style.setProperty("--i", i++); wi.textContent = p;
            w.appendChild(wi); frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== "BR" && n.tagName !== "svg" && !n.classList.contains("w")) walk(n);
      });
    };
    walk(el); el.classList.add("split");
  }

  /* ---------- Reveal on scroll ---------- */
  const REVEAL = [
    "main .section-head", "main .card", "main .acc", "main .tl-item", "main .alert", "main .dropzone", "main .cta-band",
    "main .grid > *", "main .xr", "main .chips", "main .privacy-note", ".footer-grid > div", ".footer-hero", "main .prose > *"
  ].join(",");
  const io = "IntersectionObserver" in window ? new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
  }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }) : null;

  function arm(root) {
    // light mode: nothing is hidden-then-revealed, so there is nothing to prepare (and no style writes on hundreds of elements)
    if (LITE) return;
    $$("[data-split]", root).forEach((el) => { if (LITE) return; split(el); if (io && !RM) io.observe(el); else el.classList.add("in"); });
    const els = root.matches && root.matches(REVEAL) ? [root, ...$$(REVEAL, root)] : $$(REVEAL, root);
    els.forEach((el) => {
      if (el.classList.contains("rv") || el.closest(".modal-backdrop, .search-overlay, .drawer, [data-norv], .hgallery, .no-rv")) return;
      // don't double-animate nested reveals (card inside a revealed grid item)
      if (el.parentElement && el.parentElement.closest(".rv:not(.in)")) return;
      el.classList.add("rv");
      const sibs = el.parentElement ? Array.from(el.parentElement.children).filter((c) => c.classList.contains("rv")) : [];
      el.style.setProperty("--d", `${(sibs.indexOf(el) % 6) * 75}ms`);
      if (RM || !io) el.classList.add("in"); else io.observe(el);
    });
  }
  arm(document);
  // dynamic grids (filters, load more…) opt in with data-rv-watch
  $$("[data-rv-watch]").forEach((box) => new MutationObserver((muts) => {
    muts.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) arm(n); }));
  }).observe(box, { childList: true }));

  /* ---------- Scroll-linked CSS variables: --e (enter) --p (through) --x (exit) ---------- */
  let scEls = $$("[data-sc]");
  function scTick() {
    if (LITE) return;
    const vh = innerHeight;
    for (const el of scEls) {
      const r = el.getBoundingClientRect();
      if (r.bottom < -vh * 0.5 || r.top > vh * 1.5) continue;
      el.style.setProperty("--e", clamp((vh - r.top) / (vh * 0.75), 0, 1).toFixed(4));
      el.style.setProperty("--p", clamp((vh - r.top) / (vh + r.height), 0, 1).toFixed(4));
      el.style.setProperty("--x", clamp(-r.top / Math.max(1, r.height), 0, 1).toFixed(4));
    }
  }

  /* ---------- Manifesto: words light up as you read ---------- */
  const mani = $$("[data-words]").map((el) => {
    const words = []; let i = 0;
    const walk = (node) => Array.from(node.childNodes).forEach((n) => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach((p) => {
          if (!p) return; if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
          const s = document.createElement("span"); s.className = "mw"; s.textContent = p; s.dataset.i = i++; words.push(s); frag.appendChild(s);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1) walk(n);
    });
    walk(el);
    return { el, words, n: -1 };
  });
  function maniTick() {
    const vh = innerHeight;
    for (const m of mani) {
      const r = m.el.getBoundingClientRect();
      const p = RM ? 1 : clamp((vh * 0.82 - r.top) / (r.height + vh * 0.2), 0, 1);
      const n = Math.round(p * m.words.length);
      if (n === m.n) continue; m.n = n;
      m.words.forEach((w, i) => w.classList.toggle("on", i < n));
    }
  }

  /* ---------- Horizontal pinned gallery ---------- */
  const hs = $$("[data-hscroll]").map((sec) => ({ sec, track: sec.querySelector(".hg-track"), dist: 0 }));
  function hsLayout() {
    hs.forEach((h) => {
      if (!h.track) return;
      if (RM) { h.sec.style.height = ""; h.track.style.transform = ""; return; }
      h.dist = Math.max(0, h.track.scrollWidth - h.track.clientWidth);
      h.sec.style.height = `${innerHeight + h.dist}px`;
    });
  }
  function hsTick() {
    if (RM) return;
    const vw = innerWidth;
    hs.forEach((h) => {
      if (!h.track) return;
      const r = h.sec.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return;
      const p = clamp(-r.top / Math.max(1, r.height - innerHeight), 0, 1);
      h.sec.style.setProperty("--hp", p.toFixed(4));
      h.track.style.transform = `translate3d(${(p * h.dist).toFixed(1)}px,0,0)`;
      Array.from(h.track.children).forEach((c) => {
        const cr = c.getBoundingClientRect();
        const d = clamp(((cr.left + cr.right) / 2 - vw / 2) / vw, -1.2, 1.2);
        c.style.setProperty("--cf", d.toFixed(3)); c.style.setProperty("--cfa", Math.abs(d).toFixed(3));
      });
    });
  }

  /* ---------- Main loop ---------- */
  // one rAF per scroll burst: nothing runs while the page is still
  let ly = -1, ticking = false;
  function loop() {
    ticking = false;
    const y = scrollY;
    if (y !== ly) { headerTick(y); scTick(); maniTick(); hsTick(); ly = y; }
  }
  const kick = () => { if (!ticking) { ticking = true; requestAnimationFrame(loop); } };
  addEventListener("scroll", kick, { passive: true });
  let rsT = 0;
  addEventListener("resize", () => { clearTimeout(rsT); rsT = setTimeout(() => { hsLayout(); scTick(); hsTick(); }, 120); }, { passive: true });
  addEventListener("load", () => { hsLayout(); scTick(); hsTick(); });
  // first pass. Light mode: wait for the frame, so every layout read at start-up shares the browser's own layout
  // instead of forcing an extra one. Full mode: run now, so scroll-linked elements never paint in their un-set state.
  const first = () => { hsLayout(); scTick(); maniTick(); hsTick(); const y = scrollY; lastY = y; headerTick(y); };
  if (LITE) requestAnimationFrame(first); else first();

  /* ---------- Tilt + spotlight (delegated) ---------- */
  const TILT = ".card-hover, .tool-card, .cat-tile, [data-tilt], .stat-card, .world, .bento > *";
  if (FINE) {
    let cur = null;
    const reset = (el) => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); el.classList.remove("hot"); };
    document.addEventListener("pointermove", (e) => {
      if (RM) return;
      const card = e.target.closest(".card, .world, [data-tilt], .bento > *");
      if (card) {
        const r = card.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`); card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
        if (card.matches(TILT)) {
          const amt = card.dataset.tilt ? +card.dataset.tilt || 10 : 9;
          card.style.setProperty("--rx", `${((0.5 - y) * amt).toFixed(2)}deg`); card.style.setProperty("--ry", `${((x - 0.5) * amt * 1.2).toFixed(2)}deg`);
          card.classList.add("hot");
        }
      }
      if (cur && cur !== card) reset(cur);
      cur = card && card.matches(TILT) ? card : null;
    }, { passive: true });
    document.addEventListener("pointerleave", () => { if (cur) reset(cur); cur = null; });
  }

  /* ---------- Magnetic buttons ---------- */
  if (FINE) {
    document.addEventListener("pointermove", (e) => {
      if (RM) return;
      $$(".mag-on").forEach((b) => { if (!b.contains(e.target)) { b.style.translate = ""; b.classList.remove("mag-on"); } });
      const b = e.target.closest(".btn-lg, [data-magnetic], .header-actions .icon-btn"); if (!b) return;
      const r = b.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      b.classList.add("mag-on"); b.style.translate = `${(x * 0.22).toFixed(1)}px ${(y * 0.3).toFixed(1)}px`;
    }, { passive: true });
  }

  /* ---------- Cursor follower ---------- */
  if (FINE) {
    const ring = document.createElement("div"); ring.className = "cur-ring"; ring.setAttribute("aria-hidden", "true");
    const dot = document.createElement("div"); dot.className = "cur-dot"; dot.setAttribute("aria-hidden", "true");
    body.append(ring, dot);
    let mx = -100, my = -100, rx = -100, ry = -100, shown = false, curRaf = 0;
    // the follower only animates while it still has distance to cover
    const tick = () => {
      curRaf = 0; if (RM || !shown) return;
      rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18;
      ring.style.transform = `translate3d(${rx}px,${ry}px,0)`; dot.style.transform = `translate3d(${mx}px,${my}px,0)`;
      if (Math.abs(mx - rx) > 0.1 || Math.abs(my - ry) > 0.1) curRaf = requestAnimationFrame(tick);
    };
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      if (RM) { if (shown) { shown = false; doc.classList.remove("cur-show", "cur-text"); } return; }
      mx = e.clientX; my = e.clientY; if (!shown) { shown = true; rx = mx; ry = my; doc.classList.add("cur-show"); }
      if (!curRaf) curRaf = requestAnimationFrame(tick);
      const t = e.target;
      const hov = t.closest && t.closest("a, button, [role=button], label, select, summary, .chip, [data-tilt], .card-hover, .world");
      const txt = t.closest && t.closest("input, textarea, [contenteditable], .crop-wrap");
      ring.classList.toggle("hov", !!hov && !txt); doc.classList.toggle("cur-text", !!txt);
    }, { passive: true });
    document.addEventListener("pointerleave", () => { doc.classList.remove("cur-show"); shown = false; });
    addEventListener("pointerdown", () => ring.classList.add("down")); addEventListener("pointerup", () => ring.classList.remove("down"));
  }

  /* ---------- Marquee: duplicate content for a seamless loop ---------- */
  $$("[data-marquee]").forEach((m) => { const t = m.querySelector(".mq-track"); if (t && !t.dataset.dup) { t.dataset.dup = "1"; t.innerHTML += t.innerHTML; } });

  /* ---------- WebGL sculpture: loaded only when the heavy mode is on, after the page is usable ---------- */
  let glAsked = false;
  function glOn() {
    if (RM) return;
    if (window.GL3D) { window.GL3D.start(); return; }
    if (glAsked) return; glAsked = true;
    const go = () => idle(() => { if (RM) { glAsked = false; return; } loadScript("assets/js/gl.js").then(() => { if (RM && window.GL3D) window.GL3D.stop(); }); });
    if (document.readyState === "complete") go(); else addEventListener("load", go, { once: true });
  }
  function glOff() { if (window.GL3D) window.GL3D.stop(); doc.classList.add("no-gl"); }
  glOn();

  /* ---------- Switching the light mode on/off without a reload (header button, watchdog) ---------- */
  function applyLite(on) {
    LITE = !!on; RM = OS_RM || LITE;
    doc.classList.toggle("rm", RM);
    if (RM) {
      lenisOff(); glOff(); if (LITE) decoOff();
      doc.classList.remove("is-loading", "entering", "leaving", "cur-show", "cur-text");
      $$(".rv:not(.in), .split:not(.in)").forEach((el) => el.classList.add("in"));
      $$(".hot").forEach((el) => { el.classList.remove("hot"); el.style.removeProperty("--rx"); el.style.removeProperty("--ry"); });
      mani.forEach((m) => { m.n = -1; });
    } else { decoOn(); lenisOn(); glOn(); arm(document); }  // elements armed now reveal as they scroll into view
    hsLayout(); ly = -1; kick();
  }
  document.addEventListener("lite-change", (e) => applyLite(e.detail && e.detail.on));

  /* ---------- Watchdog: if the device cannot keep up with the effects, fall back to the light mode by itself ---------- */
  if (!RM && window.App && App.liteMode && App.liteMode() === "auto") {
    const start = () => {
      let n = 0, slow = 0, bad = 0, wins = 0, last = 0;
      const tick = (t) => {
        if (RM) return;
        const d = t - last; last = t;
        if (d > 0 && d < 400 && !document.hidden) { n++; if (d > 33) slow++; }
        if (n >= 45) {
          bad = slow / n > 0.4 ? bad + 1 : 0; n = slow = 0; wins++;
          if (bad >= 2) { App.setLite(true, true); return; }
        }
        if (wins < 16) requestAnimationFrame(tick);
      };
      requestAnimationFrame((t) => { last = t; requestAnimationFrame(tick); });
    };
    const armDog = () => setTimeout(start, doc.classList.contains("is-loading") ? 3200 : 1200);
    if (document.readyState === "complete") armDog(); else addEventListener("load", armDog, { once: true });
  }

  window.FX = {
    refresh(root = document) { arm(root); scEls = $$("[data-sc]"); hsLayout(); scTick(); hsTick(); if (window.GL3D) window.GL3D.refresh(); },
    scrollTo: scrollToY, split
  };
})();
