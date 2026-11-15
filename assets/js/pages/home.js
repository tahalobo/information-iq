(function () {
  const { $, esc, ic, icons, cat, factsSorted, factCard, fmtDate, store, countUp } = App;
  const S = window.SITE;

  // Stats
  const f = $("#st-followers");
  f.dataset.count = S.stats.followers; f.dataset.compact = "k";
  $("#st-facts").dataset.count = window.FACTS.length;
  $("#st-tools").dataset.count = window.TOOLS.length;

  // Orbit ring of category names around the ziggurat
  $("#orbit").innerHTML = window.CATEGORIES.slice(0, 9).map((k, i) => `<span style="--i:${i}">${esc(k.name)}</span>`).join("");

  // Nine worlds (horizontal 3D gallery)
  const worlds = window.CATEGORIES.map((k, i) => {
    const n = window.FACTS.filter((x) => x.cat === k.id).length;
    return `<a href="facts.html?cat=${k.id}" class="world" style="--c1:${k.c1};--c2:${k.c2}">
      <span class="num">${String(i + 1).padStart(2, "0")}</span>
      ${ic(k.icon, "big")}
      <h3>${esc(k.name)}</h3><small>${n} ${n === 1 ? "معلومة" : "معلومات"}</small>
      <span class="go">${ic("arrow-up-left")}</span></a>`;
  });
  worlds.push(`<a href="facts.html?saved=1" class="world" style="--c1:#2a1d05;--c2:#8a6414">
      <span class="num">★</span>${ic("bookmark", "big")}
      <h3>محفوظاتي</h3><small>${store.get("saved-facts", []).length} محفوظة</small><span class="go">${ic("arrow-up-left")}</span></a>`);
  $("#cats").innerHTML = worlds.join("");

  // Fact of the day (changes daily, same for everyone)
  const day = Math.floor(Date.now() / 86400000);
  const fd = window.FACTS[day % window.FACTS.length];
  const c = cat(fd.cat);
  $("#fotd").innerHTML = `
    <span class="seal" aria-hidden="true">${new Date().getDate()}</span>
    <span class="tag">${ic("sparkles")}معلومة اليوم · ${esc(c.name)}</span>
    <h3>${esc(fd.title)}</h3>
    <p>${esc(fd.excerpt)}</p>
    <div class="btn-row"><a class="btn btn-primary" href="${App.factUrl(fd.id)}">${ic("book-open")}اقرأ التفاصيل</a>
    <a class="btn btn-ghost" href="facts.html">${ic("shuffle")}المزيد</a></div>
    ${ic(fd.icon || c.icon, "big-ico")}`;

  // The empire's branches: one tile per channel with its newest headline
  const BRI = window.BR_ITEMS || [];
  $("#branches").innerHTML = (window.BRANCHES || []).map((b, i) => {
    const pool = b.id === "info" ? factsSorted() : BRI.filter((x) => x.branch === b.id);
    const top = pool[0];
    return `<a href="${b.href}" class="br-tile" style="--c1:${b.c1};--c2:${b.c2}" data-tilt="4">
      <span class="br-num">${String(i + 1).padStart(2, "0")}</span>
      <span class="br-ico${b.logo ? " has-logo" : ""}">${App.bIcon(b)}</span>
      <h3>${esc(b.name)}</h3>
      <p>${esc(b.desc)}</p>
      ${top ? `<span class="br-top">${ic(b.id === "info" ? "sparkles" : "radio")}<span>${esc(top.title)}</span></span>` : ""}
      <span class="br-foot"><b>${pool.length}</b>${b.id === "info" ? "معلومة" : "خبر"}${ic("arrow-up-left")}</span></a>`;
  }).join("");
  const latestNews = [...BRI].sort((a, b) => String(b.ts).localeCompare(String(a.ts)));
  // Newsroom: the newest story leads, the next ones follow as a list (no more than three in a row from one branch)
  const mix = []; const per = {};
  for (const x of latestNews) { if ((per[x.branch] || 0) < 3) { mix.push(x); per[x.branch] = (per[x.branch] || 0) + 1; } if (mix.length >= 7) break; }
  if (mix.length) {
    const lead = mix.slice(0, 4).find((x) => x.image) || mix[0];   // the lead story is the newest one that has a picture
    const br = (x) => (window.BRANCHES || []).find((b) => b.id === x.branch) || {};
    const lb = br(lead);
    $("#nr-lead").innerHTML = `<a class="nr-hero${lead.image ? "" : " noimg"}" href="${App.factUrl(lead.id)}" style="--c1:${esc(lb.c1 || "#13204f")};--c2:${esc(lb.c2 || "#d4a537")}">
      ${lead.image ? `<img src="${esc(lead.image)}" alt="" fetchpriority="high" decoding="async" data-err="remove">` : ""}
      <span class="nr-hero-body">
        <span class="nr-chip">${App.bIcon(lb, "sm")}${esc(lb.short || "")}${lead.video ? `<i>${ic("play")}</i>` : ""}</span>
        <strong>${esc(lead.title)}</strong>
        ${lead.excerpt ? `<span class="nr-hero-x">${esc(lead.excerpt)}</span>` : ""}
        <small>${ic("clock")}${esc(App.ago(lead.ts))}${lead.views ? `<span>${ic("eye")}${App.fmtCompact(lead.views)}</span>` : ""}</small>
      </span></a>`;
    $("#nr-list").innerHTML = mix.filter((x) => x !== lead).slice(0, 5).map((x) => { const b = br(x); return `<li><a href="${App.factUrl(x.id)}">
      <span class="nr-feed-t"><b style="color:${esc(b.c2 || "inherit")}">${esc(b.short || "")}</b><small>${esc(App.ago(x.ts))}</small></span>
      <strong>${esc(x.title)}</strong>
      ${x.image ? `<span class="nr-feed-img"><img src="${esc(x.image)}" alt="" loading="lazy" decoding="async" data-err="remove">${x.video ? `<i>${ic("play")}</i>` : ""}</span>` : ""}</a></li>`; }).join("");
    // the strip: "عاجل" only for a story from the news branch published in the last three hours
    const hot = latestNews.find((x) => x.branch === "news") || latestNews[0];
    const fresh = Date.now() - new Date(hot.ts).getTime() < 3 * 3600e3;
    const fl = $("#nr-flash"); fl.hidden = false; fl.href = App.factUrl(hot.id); fl.classList.toggle("hot", fresh);
    $("#nr-flash-tag").textContent = fresh ? "عاجل" : "آخر خبر"; $("#nr-flash-text").textContent = hot.title; $("#nr-flash-time").textContent = App.ago(hot.ts);
  } else $("#newsroom").hidden = true;

  // Latest facts
  $("#latest").innerHTML = factsSorted().slice(0, 6).map(factCard).join("");

  // Tools bento
  const tcard = (t, big) => `<a href="${t.href}" class="card card-hover tool-card${big ? " featured" : ""}">
    ${big ? `<span class="badge">${ic(t.isNew ? "sparkles" : "star")}${t.isNew ? "جديد" : "الأكثر استخداماً"}</span>` : ""}
    <span class="ico${big ? "" : " ico-sm"}">${ic(t.icon)}</span>
    <div><h3>${esc(t.title)}</h3><p class="mb-0">${esc(t.desc)}</p></div>
    <span class="arrow">${big ? "جرّب الأداة" : "افتح"}${ic("arrow-left")}</span></a>`;
  const feat = window.TOOLS.filter((t) => t.featured), rest = window.TOOLS.filter((t) => !t.featured && t.id !== "verify");
  $("#bento").innerHTML = feat.map((t) => tcard(t, true)).join("")
    + `<div class="b-slot featured" data-gl="lens" aria-hidden="true"><b>كل شيء يحدث داخل جهازك</b></div>`
    + rest.map((t) => tcard(t)).join("")
    + `<a href="tools.html" class="card card-hover tool-card bento-all" style="justify-content:center;align-items:center;text-align:center"><span class="ico">${ic("layout-grid")}</span><h3 class="mb-0">كل الأدوات</h3><span class="arrow" style="margin-top:0">تصفّحها${ic("arrow-left")}</span></a>`;

  // Best quiz score
  const best = store.get("quiz-best", null);
  if (best !== null) $("#best-score").textContent = `أفضل نتيجة لك: ${best}/10`;

  // News ticker + cards
  const news = [...window.NEWS].sort((a, b) => b.date.localeCompare(a.date));
  // the ticker carries live headlines from the branches when there are any
  $("#ticker").innerHTML = latestNews.length
    ? latestNews.slice(0, 14).map((n, i) => `<a href="${App.factUrl(n.id)}" class="${i % 2 ? "ol" : ""}">${esc(cat(n.cat).name)} · ${esc(n.title)}<span class="sep" aria-hidden="true">✦</span></a>`).join("")
    : news.map((n, i) => `<a href="news.html#${n.id}" class="${i % 2 ? "ol" : ""}">${esc(n.title)}<span class="sep" aria-hidden="true">✦</span></a>`).join("");
  $("#news").innerHTML = news.slice(0, 3).map((n) => `<a href="news.html#${n.id}" class="card card-hover news-card">
    <div class="top"><span class="badge">${ic(n.icon)}${esc(n.type)}</span><span class="small muted">${fmtDate(n.date)}</span></div>
    <h3>${esc(n.title)}</h3><p class="mb-0" style="display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden">${esc(n.body)}</p></a>`).join("");

  icons();
  countUp();
})();
