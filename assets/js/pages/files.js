(function () {
  const { $, esc, ic, icons, fmtDate, fmtCompact, ago } = App;
  const FILES = window.FILES || [];
  const byId = new Map((window.BR_ITEMS || []).map((x) => [x.id, x]));
  const br = (id) => (window.BRANCHES || []).find((b) => b.id === id) || {};
  const span = (f) => (f.from === f.to ? fmtDate(f.to) : `${fmtDate(f.from)} ← ${fmtDate(f.to)}`);
  const id = App.param("f");
  const file = id && FILES.find((f) => f.id === id);

  if (file) {
    const b = br(file.branch), list = file.ids.map((i) => byId.get(i)).filter(Boolean);
    document.title = `ملف: ${file.title} | ${window.SITE.name}`;
    $("#fl-title").textContent = file.title; $("#fl-kick").textContent = `ملف من ${b.name || "الفروع"}`;
    $("#fl-desc").textContent = `${list.length} أخبار عن هذا الموضوع بترتيبها الزمني، من ${fmtDate(file.from)} إلى ${fmtDate(file.to)}.`;
    $("#fl-crumb").hidden = false; $("#fl-crumb-t").textContent = file.title.length > 40 ? file.title.slice(0, 40) + "…" : file.title;
    $("#fl-list").hidden = true; $("#fl-detail").hidden = false;
    $("#fl-meta").innerHTML = `<span class="badge">${ic("newspaper")}${list.length} أخبار</span><span class="badge">${ic("calendar")}${esc(span(file))}</span><span class="badge">${ic("eye")}${fmtCompact(file.views)} مشاهدة</span>`;
    $("#fl-timeline").innerHTML = list.map((x, i) => `<li class="rs-page${i === list.length - 1 ? " first" : ""}">
      <span class="rs-dot"></span>
      <div class="rs-when"><b>${esc(fmtDate(String(x.ts).slice(0, 10)))}</b><small>${esc(ago(x.ts))}</small></div>
      <a class="rs-card" href="${App.factUrl(x.id)}">
        ${x.image ? `<span class="rs-thumb"><img src="${esc(x.image)}" alt="" loading="lazy" decoding="async" data-err="remove"></span>` : ""}
        <span class="rs-meta">${i === 0 ? `<span class="rs-site"><span class="badge">${ic("flag")}بداية الملف</span></span>` : i === list.length - 1 ? `<span class="rs-site"><span class="badge badge-warn">${ic("zap")}آخر تطوّر</span></span>` : ""}
          <strong>${esc(x.title)}</strong><small>${esc(x.excerpt || "")}</small></span>${ic("arrow-up-left")}</a></li>`).join("");
  } else {
    $("#fl-list").innerHTML = FILES.length ? FILES.map((f) => {
      const b = br(f.branch);
      return `<a class="fl-card" href="files.html?f=${encodeURIComponent(f.id)}" style="--c1:${esc(b.c1 || "#13204f")};--c2:${esc(b.c2 || "#d4a537")}">
        ${f.image ? `<img src="${esc(f.image)}" alt="" loading="lazy" decoding="async" data-err="remove">` : ""}
        <span class="fl-body"><span class="fl-tag">${ic("layers")}ملف · ${esc(b.short || "")}</span>
          <strong>${esc(f.title)}</strong>
          <small>${ic("newspaper")}${f.n} أخبار · ${ic("calendar")}${esc(span(f))} · ${ic("eye")}${fmtCompact(f.views)}</small></span></a>`;
    }).join("") : `<p class="muted">لا ملفات الآن. يظهر الملف حين تتوالى ثلاثة أخبار على الأقل عن الموضوع نفسه.</p>`;
  }
  icons();
})();
