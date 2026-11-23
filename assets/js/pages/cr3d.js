/* ==========================================================
   «مبدعون عراقيون»: الحركة ثلاثية الأبعاد
   - حلقة البورتريهات في الفهرس: تدور ببطء، وتُسحب بالإصبع أو الفأرة مع زخم، وتتوقف خارج الشاشة
   - ممرّ الأعمال في صفحة المبدع: معرض مثبّت يتحرّك بالتمرير العمودي (fx.js)، وكل عمل يميل نحو المنتصف حسب بعده عنه
   - الشهادة ثلاثية الأبعاد: تنقلب بالضغط أو Enter/Space
   الوضع الهادئ (تقليل الحركة أو الوضع الخفيف): الحلقة ثابتة بزاوية، والممر بلا إمالة.
   ========================================================== */
(function () {
  "use strict";
  const doc = document.documentElement;
  const calm = () => doc.classList.contains("lite") || matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- ring of portraits ---------- */
  const ring = document.querySelector("[data-ring]");
  if (ring) {
    const wrap = ring.parentElement, items = Array.from(ring.children), n = items.length, step = 360 / n;
    let ang = -12, vel = 0, drag = null, moved = 0, visible = true, last = performance.now(), raf = 0;
    const SPIN = -7; // درجة في الثانية (اتجاه القراءة العربية: من اليمين إلى اليسار)
    const paint = () => {
      ring.style.transform = `rotateX(-7deg) rotateY(${ang.toFixed(2)}deg)`;
      for (let i = 0; i < n; i++) {
        const a = ((i * step + ang) % 360 + 360) % 360, f = (Math.cos(a * Math.PI / 180) + 1) / 2;
        items[i].style.setProperty("--f", f.toFixed(3));
      }
    };
    const tick = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      if (!drag) { vel *= Math.pow(0.04, dt); ang += (SPIN + vel) * dt; }
      paint();
      raf = visible && !document.hidden && !calm() ? requestAnimationFrame(tick) : 0;
    };
    const run = () => { if (!raf && visible && !document.hidden && !calm()) { last = performance.now(); raf = requestAnimationFrame(tick); } };
    paint();
    if (!calm()) {
      new IntersectionObserver((es) => { visible = es[0].isIntersecting; run(); }, { rootMargin: "80px" }).observe(wrap);
      document.addEventListener("visibilitychange", run);
      wrap.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        drag = { x: e.clientX, a: ang, t: performance.now(), lx: e.clientX }; moved = 0; vel = 0;
        wrap.classList.add("dragging");
      });
      addEventListener("pointermove", (e) => {
        if (!drag) return;
        const dx = e.clientX - drag.x; moved = Math.max(moved, Math.abs(dx));
        if (moved > 4 && !wrap.hasPointerCapture?.(e.pointerId)) { try { wrap.setPointerCapture(e.pointerId); } catch { /* ignore */ } }
        const now = performance.now(), ddt = Math.max(0.008, (now - drag.t) / 1000);
        vel = ((e.clientX - drag.lx) * 0.35) / ddt * 0.6; drag.t = now; drag.lx = e.clientX;
        ang = drag.a + dx * 0.35; paint();
      });
      const end = () => { if (!drag) return; drag = null; wrap.classList.remove("dragging"); vel = Math.max(-400, Math.min(400, vel)); run(); };
      addEventListener("pointerup", end); addEventListener("pointercancel", end);
      // a drag must not open the portrait under the finger
      wrap.addEventListener("click", (e) => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
      run();
    }
  }

  /* ---------- works corridor ----------
     المعرض مثبّت (data-hscroll في fx.js): التمرير العمودي العادي يحرّك الصف، فلا تمرير داخلي يتنازع مع الصفحة.
     الأزرار والأسهم تنقل الصفحة إلى الموضع الذي يتوسّط فيه العمل المطلوب. */
  document.querySelectorAll("[data-coverflow]").forEach((track) => {
    const sec = track.closest("[data-hscroll]"), cards = Array.from(track.querySelectorAll(".crd-work"));
    if (!sec || cards.length < 2) return;
    const pinned = () => sec.offsetHeight > innerHeight + 4 && getComputedStyle(sec.querySelector(".hg-sticky")).position === "sticky";
    const current = () => {
      let best = 0, bd = 1e9; const mid = innerWidth / 2;
      cards.forEach((c, i) => { const b = c.getBoundingClientRect(), d = Math.abs(b.left + b.width / 2 - mid); if (d < bd) { bd = d; best = i; } });
      return best;
    };
    const go = (i) => {
      i = Math.max(0, Math.min(cards.length - 1, i));
      if (pinned()) {
        const top = sec.getBoundingClientRect().top + scrollY, y = top + (i / (cards.length - 1)) * (sec.offsetHeight - innerHeight);
        if (window.FX && FX.scrollTo) FX.scrollTo(y); else scrollTo({ top: y, behavior: calm() ? "auto" : "smooth" });
      } else cards[i].scrollIntoView({ inline: "center", block: "nearest", behavior: calm() ? "auto" : "smooth" });   // الوضع الهادئ: صف عادي يُسحب أفقياً
    };
    sec.addEventListener("click", (e) => { const b = e.target.closest("[data-cf]"); if (b) go(current() + (b.dataset.cf === "next" ? 1 : -1)); });
    // اتجاه القراءة العربية: السهم الأيسر = العمل التالي
    track.addEventListener("keydown", (e) => { if (e.key === "ArrowLeft") { e.preventDefault(); go(current() + 1); } if (e.key === "ArrowRight") { e.preventDefault(); go(current() - 1); } });
  });

  /* ---------- certificate flip ---------- */
  document.querySelectorAll("[data-flip]").forEach((el) => {
    const flip = () => { const on = el.classList.toggle("flipped"); el.setAttribute("aria-pressed", String(on));
      el.querySelector(".crd-front")?.setAttribute("aria-hidden", String(on)); el.querySelector(".crd-back")?.setAttribute("aria-hidden", String(!on)); };
    el.querySelector(".crd-back")?.setAttribute("aria-hidden", "true");
    el.addEventListener("click", flip);
    el.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); flip(); } });
  });
})();
