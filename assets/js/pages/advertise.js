(function () {
  const { $, esc, ic, icons, fmtNum, fmtCompact, fmtDate, bIcon } = App;
  const SUBS = window.SUBS || { channels: {} };
  const since = Date.now() - 30 * 86400e3;
  const recent = (list) => list.filter((x) => new Date(x.ts || x.date).getTime() >= since);
  const rows = (window.BRANCHES || []).map((b) => {
    const all = b.id === "info" ? (window.TG_ITEMS || []) : (window.BR_ITEMS || []).filter((x) => x.branch === b.id);
    const last = recent(all), views = last.reduce((v, x) => v + (x.views || 0), 0);
    return { b, subs: (SUBS.channels[b.id] || {}).subscribers || 0, posts: last.length, views, avg: last.length ? Math.round(views / last.length) : 0 };
  }).sort((x, y) => y.subs - x.subs);
  const sum = (k) => rows.reduce((v, r) => v + r[k], 0);
  const tot = (n, l, i) => `<div class="ad-total"><span>${ic(i)}</span><b>${n}</b><small>${l}</small></div>`;

  $("#ad-totals").innerHTML = tot(fmtNum(SUBS.total || sum("subs")), "مشترك في قنواتنا على تليغرام", "users")
    + tot(fmtCompact(sum("views")), "مشاهدة لمنشورات آخر 30 يوماً", "eye")
    + tot(fmtNum(sum("posts")), "منشوراً في آخر 30 يوماً", "newspaper")
    + tot(rows.length, "قنوات متخصصة", "radio-tower");

  $("#ad-grid").innerHTML = rows.map((r) => `<div class="ad-card" style="--c1:${esc(r.b.c1)};--c2:${esc(r.b.c2)}">
    <div class="ad-card-head"><span class="ad-logo${r.b.logo ? " has-logo" : ""}">${bIcon(r.b)}</span><div><h3>${esc(r.b.name)}</h3><a class="ltr small" href="${esc(r.b.url)}" target="_blank" rel="noopener noreferrer">@${esc(r.b.channel)}</a></div></div>
    <div class="ad-subs"><b>${r.subs ? fmtNum(r.subs) : "—"}</b><small>مشترك</small></div>
    <dl><div><dt>منشورات آخر 30 يوماً</dt><dd>${fmtNum(r.posts)}</dd></div><div><dt>مجموع مشاهداتها</dt><dd>${fmtCompact(r.views)}</dd></div><div><dt>متوسط المشاهدة للمنشور</dt><dd>${fmtCompact(r.avg)}</dd></div></dl>
    <p class="small">${esc(r.b.desc)}</p></div>`).join("");

  $("#ad-note").innerHTML = `${ic("info")} عدد المشتركين يُقرأ من صفحة كل قناة على تليغرام${SUBS.updated ? `، وآخر قراءة في ${esc(fmtDate(String(SUBS.updated).slice(0, 10)))}` : ""}. المشاهدات محسوبة على المنشورات المعروضة في هذا الموقع فقط (الأخبار والمعلومات الكاملة)، فالمشاهدات الفعلية لكل قناة أعلى. المشترك في أكثر من قناة يُحسب في كل واحدة.`;
  icons();
})();
