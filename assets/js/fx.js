/* ==========================================================
   محرك الحركة: تمرير ناعم، ظهور ثلاثي الأبعاد، تأثيرات مرتبطة بالتمرير،
   إمالة البطاقات، أزرار مغناطيسية، مؤشر ذهبي، معرض أفقي، انتقال الصفحات
   ========================================================== */
(function () {
  "use strict";
  const doc = document.documentElement, body = document.body;
  const RM = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const FINE = matchMedia("(pointer: fine)").matches;
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  doc.classList.add("fx-on"); if (RM) doc.classList.add("rm");
  try { sessionStorage.setItem("fx-seen", "1"); } catch { /* ignore */ }

  /* ---------- Grain + aurora layers ---------- */
  const deco = document.createElement("div"); deco.className = "fx-deco"; deco.setAttribute("aria-hidden", "true");
  deco.innerHTML = `<i class="aur a1"></i><i class="aur a2"></i><i class="aur a3"></i>`;
  const grain = document.createElement("div"); grain.className = "fx-grain"; grain.setAttribute("aria-hidden", "true");
  body.prepend(deco); body.append(grain);

  /* ---------- Smooth scroll (Lenis) ---------- */
  let lenis = null;
  if (!RM && window.Lenis && FINE) {
    lenis = new window.Lenis({
      lerp: 0.1, smoothWheel: true, wheelMultiplier: 1,
      prevent: (n) => !!(n.closest && n.closest(".modal-backdrop, .search-overlay, .drawer, .nav-menu, .search-results, .table-wrap, textarea, [data-lenis-prevent]"))
    });
    const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
    // stop when overlays open
    const sync = () => {
      const lock = body.classList.contains("drawer-open") || !!document.querySelector(".modal-backdrop, .search-overlay");
      lock ? lenis.stop() : lenis.start();
    };
    new MutationObserver(sync).observe(body, { childList: true, attributes: true, attributeFilter: ["class"] });
  }
  const scrollToY = (y) => { if (lenis) lenis.scrollTo(y, { duration: 1.4 }); else window.scrollTo({ top: y, behavior: RM ? "auto" : "smooth" }); };
  // hash anchors + to-top go through the smooth scroller
  document.addEventListener("click", (e) => {
    const top = e.target.closest("#to-top"); if (top) { e.stopPropagation(); scrollToY(0); return; }
    const a = e.target.closest('a[href^="#"]'); if (!a || a.getAttribute("href").length < 2) return;
    const t = document.getElementById(decodeURIComponent(a.getAttribute("href").slice(1))); if (!t) return;
    e.preventDefault(); scrollToY(t.getBoundingClientRect().top + scrollY - 90); history.replaceState(null, "", location.pathname + location.search + a.getAttribute("href")); // absolute: pages with <base href="../"> would otherwise jump to the root
  }, true);

  /* ---------- Page transitions ---------- */
  if (!RM) {
    document.addEventListener("click", (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
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
  let lastY = scrollY;
  function headerTick(y) {
    const h = document.querySelector(".site-header"); if (!h) return;
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
    $$("[data-split]", root).forEach((el) => { split(el); if (io) io.observe(el); else el.classList.add("in"); });
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
      if (RM) { h.sec.style.height = ""; return; }
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
  let ly = -1, lw = innerWidth;
  function loop() {
    const y = scrollY;
    if (y !== ly) { headerTick(y); scTick(); maniTick(); hsTick(); ly = y; }
    requestAnimationFrame(loop);
  }
  addEventListener("resize", () => { hsLayout(); scTick(); hsTick(); if (innerWidth !== lw) { lw = innerWidth; } });
  addEventListener("load", () => { hsLayout(); scTick(); hsTick(); });
  hsLayout(); scTick(); maniTick(); hsTick(); headerTick(scrollY);
  requestAnimationFrame(loop);

  /* ---------- Tilt + spotlight (delegated) ---------- */
  const TILT = ".card-hover, .tool-card, .cat-tile, [data-tilt], .stat-card, .world, .bento > *";
  if (FINE && !RM) {
    let cur = null;
    const reset = (el) => { el.style.setProperty("--rx", "0deg"); el.style.setProperty("--ry", "0deg"); el.classList.remove("hot"); };
    document.addEventListener("pointermove", (e) => {
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
  if (FINE && !RM) {
    document.addEventListener("pointermove", (e) => {
      $$(".mag-on").forEach((b) => { if (!b.contains(e.target)) { b.style.translate = ""; b.classList.remove("mag-on"); } });
      const b = e.target.closest(".btn-lg, [data-magnetic], .header-actions .icon-btn"); if (!b) return;
      const r = b.getBoundingClientRect(), x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
      b.classList.add("mag-on"); b.style.translate = `${(x * 0.22).toFixed(1)}px ${(y * 0.3).toFixed(1)}px`;
    }, { passive: true });
  }

  /* ---------- Cursor follower ---------- */
  if (FINE && !RM) {
    const ring = document.createElement("div"); ring.className = "cur-ring"; ring.setAttribute("aria-hidden", "true");
    const dot = document.createElement("div"); dot.className = "cur-dot"; dot.setAttribute("aria-hidden", "true");
    body.append(ring, dot);
    let mx = -100, my = -100, rx = -100, ry = -100, shown = false;
    addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      mx = e.clientX; my = e.clientY; if (!shown) { shown = true; rx = mx; ry = my; doc.classList.add("cur-show"); }
      const t = e.target;
      const hov = t.closest && t.closest("a, button, [role=button], label, select, summary, .chip, [data-tilt], .card-hover, .world");
      const txt = t.closest && t.closest("input, textarea, [contenteditable], .crop-wrap");
      ring.classList.toggle("hov", !!hov && !txt); doc.classList.toggle("cur-text", !!txt);
    }, { passive: true });
    document.addEventListener("pointerleave", () => { doc.classList.remove("cur-show"); shown = false; });
    addEventListener("pointerdown", () => ring.classList.add("down")); addEventListener("pointerup", () => ring.classList.remove("down"));
    (function tick() { rx += (mx - rx) * 0.18; ry += (my - ry) * 0.18; ring.style.transform = `translate3d(${rx}px,${ry}px,0)`; dot.style.transform = `translate3d(${mx}px,${my}px,0)`; requestAnimationFrame(tick); })();
  }

  /* ---------- Marquee: duplicate content for a seamless loop ---------- */
  $$("[data-marquee]").forEach((m) => { const t = m.querySelector(".mq-track"); if (t && !t.dataset.dup) { t.dataset.dup = "1"; t.innerHTML += t.innerHTML; } });

  window.FX = {
    refresh(root = document) { arm(root); scEls = $$("[data-sc]"); hsLayout(); scTick(); hsTick(); if (window.GL3D) window.GL3D.refresh(); },
    scrollTo: scrollToY, split
  };
})();
