/* صفحة الأخبار والإنجازات (كان سكربتاً مضمّناً في news.html؛ نُقل إلى ملف لتعمل سياسة أمن المحتوى) */
(function () {
  const { $, esc, ic, icons, fmtDate, modal, shareButtons, countUp } = App;
  const S = window.SITE;
  const stat = (n, l, i, compact) => `<div class="card stat-card"><span class="ico">${ic(i)}</span><strong data-count="${n}"${compact ? ' data-compact="k"' : ""}>0</strong><span>${l}</span></div>`;
  $("#stats").innerHTML = stat(S.stats.followers, S.stats.followersLabel, "users", true) + stat(window.FACTS.length, S.stats.factsLabel, "book-open") +
    stat(window.TOOLS.length, S.stats.toolsLabel, "wrench") + stat(window.SERIES.length, "سلسلة محتوى متخصصة", "layers");

  const news = [...window.NEWS].sort((a, b) => b.date.localeCompare(a.date));
  const types = ["الكل", ...new Set(news.map((n) => n.type))];
  let type = "الكل";
  function render() {
    $("#types").innerHTML = types.map((t) => `<button class="chip${t === type ? " active" : ""}" data-t="${t}">${t}</button>`).join("");
    $("#news").innerHTML = news.filter((n) => type === "الكل" || n.type === type).map((n) => `<article class="card card-hover news-card" id="${n.id}" data-open="${n.id}" tabindex="0">
      <div class="top"><span class="badge">${ic(n.icon)}${esc(n.type)}</span><span class="small muted">${fmtDate(n.date)}</span></div>
      <h3>${esc(n.title)}</h3><p class="mb-0" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(n.body)}</p>
      <span class="small text-gold mt-1">اقرأ المزيد</span></article>`).join("");
    icons();
  }
  function open(id) {
    const n = news.find((x) => x.id === id); if (!n) return;
    const url = `${location.origin}${location.pathname}#${n.id}`;
    modal(`<span class="badge mb-2">${ic(n.icon)}${esc(n.type)}</span><h2 style="font-family:var(--font);font-size:1.4rem">${esc(n.title)}</h2>
      <p class="small muted">${fmtDate(n.date)}</p><p style="font-size:1.05rem">${esc(n.body)}</p><hr class="divider">${shareButtons(url, n.title)}`,
      { onClose: () => history.replaceState(null, "", location.pathname) });
    history.replaceState(null, "", "#" + n.id);
  }
  $("#types").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) { type = b.dataset.t; render(); } });
  $("#news").addEventListener("click", (e) => { const c = e.target.closest("[data-open]"); if (c) open(c.dataset.open); });
  $("#news").addEventListener("keydown", (e) => { const c = e.target.closest("[data-open]"); if (c && e.key === "Enter") open(c.dataset.open); });
  render();
  if (location.hash) setTimeout(() => open(location.hash.slice(1)), 200);

  $("#timeline").innerHTML = window.MILESTONES.map((m) => `<div class="tl-item"><span class="tl-dot">${ic(m.icon)}</span><span class="tl-date">${esc(m.date)}</span><h3>${esc(m.title)}</h3><p>${esc(m.desc)}</p></div>`).join("");
  $("#series").innerHTML = window.SERIES.map((s) => `<div class="card"><span class="ico ico-sm mb-2">${ic(s.icon)}</span><h3 style="font-size:1rem">${esc(s.title)}</h3><p class="small mb-0">${esc(s.desc)}</p></div>`).join("");
  icons(); countUp();
})();
