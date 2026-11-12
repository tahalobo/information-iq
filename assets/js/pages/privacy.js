/* سياسة الخصوصية: فهرس المحتويات + عرض ما يحفظه الموقع في هذا المتصفح ومسحه */
(function () {
  const { $, $$, esc, ic, icons, toast, modal, fmtBytes } = App;
  const S = window.SITE, L = S.links;

  /* ---------- فهرس المحتويات ---------- */
  const heads = $$("#pv-body h2[id]");
  $("#pv-toc").innerHTML = heads.map((h) => `<li><a href="#${h.id}">${esc(h.textContent.replace(/^\d+\.\s*/, ""))}</a></li>`).join("");
  const links = new Map($$("#pv-toc a").map((a) => [a.getAttribute("href").slice(1), a]));
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => { if (e.isIntersecting) { links.forEach((a) => a.classList.remove("on")); const a = links.get(e.target.id); if (a) a.classList.add("on"); } });
    }, { rootMargin: "-20% 0px -70% 0px" });
    heads.forEach((h) => io.observe(h));
  }

  /* ---------- وسائل التواصل الإضافية ---------- */
  const extra = [];
  if (L.instagramDM) extra.push(`<a class="btn btn-ghost" href="${L.instagramDM}" target="_blank" rel="noopener">${ic("instagram")}إنستغرام</a>`);
  if (L.email) extra.push(`<a class="btn btn-ghost" href="mailto:${esc(L.email)}?subject=${encodeURIComponent("طلب خصوصية")}">${ic("at-sign")}${esc(L.email)}</a>`);
  $("#pv-contact").insertAdjacentHTML("beforeend", extra.join(""));

  /* ---------- بياناتك على هذا الجهاز ---------- */
  const LABELS = [
    [/^theme$/, "الوضع الليلي/النهاري"],
    [/^saved-facts$/, "المعلومات المحفوظة"],
    [/^fact-feedback$/, "تقييماتك للمعلومات"],
    [/^prose-size$/, "حجم خط القراءة"],
    [/^lib-view$/, "طريقة عرض المكتبة"],
    [/^quiz-/, "اختبر معلوماتك (الاسم والنتائج والإعدادات)"],
    [/^text-/, "أدوات النص (المسوّدة والتوقيع والقوالب)"],
    [/^meta-opts$/, "خيارات مزيل الميتاداتا"],
    [/^imgtool:logo$/, "شعار العلامة المائية"],
    [/^imgtool:/, "إعدادات ضغط الصور"],
    [/^ai-mode$/, "وضع كاشف الذكاء الاصطناعي"],
    [/^tg-admin$/, "خيار عرض في صفحة القناة"]
  ];
  const label = (k) => (LABELS.find(([re]) => re.test(k)) || [, "إعداد آخر"])[1];

  async function read() {
    const groups = new Map();
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i), v = localStorage.getItem(k) || "";
        const name = label(k), g = groups.get(name) || { n: 0, bytes: 0 };
        g.n++; g.bytes += (k.length + v.length) * 2; groups.set(name, g);
      }
    } catch { /* storage blocked */ }
    let cache = null;
    try {
      if (window.caches) {
        const names = await caches.keys(); let files = 0;
        for (const n of names) files += (await (await caches.open(n)).keys()).length;
        if (files) cache = files;
      }
    } catch { /* not available */ }
    let usage = null;
    try { if (navigator.storage && navigator.storage.estimate) usage = (await navigator.storage.estimate()).usage; } catch { /* ignore */ }
    return { groups, cache, usage };
  }

  async function render() {
    const { groups, cache, usage } = await read();
    const rows = [...groups].map(([name, g]) => `<li>${ic("check")}<span>${esc(name)}</span><small class="muted ltr">${fmtBytes ? fmtBytes(g.bytes) : g.bytes + " B"}</small></li>`);
    if (cache) rows.push(`<li>${ic("wifi-off")}<span>نسخ للتصفح دون إنترنت</span><small class="muted">${cache.toLocaleString("en")} ملف</small></li>`);
    $("#pv-device-list").innerHTML = rows.length
      ? `<ul>${rows.join("")}</ul>${usage ? `<p class="small muted mb-0 mt-1">المساحة الكلية المستعملة: <span class="ltr">${fmtBytes ? fmtBytes(usage) : usage}</span></p>` : ""}`
      : `<div class="alert alert-success">${ic("badge-check")}<span>لا يحفظ موقعنا أي شيء في هذا المتصفح حالياً.</span></div>`;
    $("#pv-wipe").disabled = !rows.length;
    icons();
  }

  async function wipe() {
    try { localStorage.clear(); } catch { /* ignore */ }
    try { sessionStorage.clear(); } catch { /* ignore */ }
    try { if (window.caches) for (const n of await caches.keys()) await caches.delete(n); } catch { /* ignore */ }
    try { if (navigator.serviceWorker) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister(); } catch { /* ignore */ }
    toast("مُسحت كل بيانات الموقع من هذا المتصفح", "trash-2");
    render();
  }

  $("#pv-wipe").addEventListener("click", () => {
    const m = modal(`<span class="ico mb-2">${ic("trash-2")}</span><h2 style="font-family:var(--font);font-size:1.3rem">مسح بيانات الموقع من هذا المتصفح؟</h2>
      <p class="muted">ستُحذف محفوظاتك وتقييماتك ونتائج الاختبار وإعدادات الأدوات ومسوّدات النص، والنسخ المحفوظة للتصفح دون إنترنت. لا يمكن التراجع عن ذلك. بياناتك لدينا (إن وُجدت) لا تتأثر؛ لحذفها راسلنا.</p>
      <div class="btn-row mt-2"><button class="btn btn-primary" data-yes>${ic("trash-2")}نعم، امسح</button><button class="btn btn-ghost" data-no>إلغاء</button></div>`);
    m.el.addEventListener("click", (e) => {
      if (e.target.closest("[data-yes]")) { m.close(); wipe(); }
      else if (e.target.closest("[data-no]")) m.close();
    });
  });

  icons();
  render();
})();
