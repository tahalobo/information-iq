(function () {
  const { $, $$, esc, ic, icons, saved, factCard, fmtDate } = App;
  let kind = "all";
  const isNews = (id, x) => !!(x && x.branch) || /^(news|games|music|anime|sport|movies)-/.test(id);

  function render() {
    const ids = saved.all();
    const rows = ids.map((id) => ({ id, x: saved.find(id), m: saved.meta(id) })).filter((r) => r.x || r.m)
      .filter((r) => kind === "all" || (kind === "news") === isNews(r.id, r.x || r.m));
    $("#sv-empty").hidden = ids.length > 0; $("#sv-tabs").hidden = !ids.length;
    $("#sv-count").textContent = ids.length ? (rows.length ? `${rows.length} من ${ids.length} محفوظاً` : "لا شيء من هذا النوع في محفوظاتك.") : "";
    // المحفوظ الذي ما زال في بيانات الموقع يُعرض ببطاقته الكاملة، وما خرج منها يُعرض من لقطته المحفوظة
    $("#sv-grid").innerHTML = rows.map((r) => r.x ? factCard(r.x) : `<article class="sv-old">
        ${r.m.image ? `<img src="${esc(r.m.image)}" alt="" loading="lazy" decoding="async" data-err="remove">` : ""}
        <div><small>${esc(r.m.date ? fmtDate(r.m.date) : "")}</small><h3><a href="${App.factUrl(r.id)}">${esc(r.m.title)}</a></h3>
        <button class="btn btn-ghost btn-sm" data-save="${esc(r.id)}">${ic("bookmark-minus")}أزل من المحفوظات</button></div></article>`).join("");
    icons(); if (window.FX) FX.refresh($("#sv-grid"));
  }
  $("#sv-tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-k]"); if (!b) return; kind = b.dataset.k; $$("#sv-tabs button").forEach((x) => x.classList.toggle("active", x === b)); render(); });
  document.addEventListener("saved-change", render);
  render();
})();
