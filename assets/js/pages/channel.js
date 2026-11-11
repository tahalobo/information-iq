(function () {
  const { $, $$, esc, ic, icons, factCard, matches, param, debounce, store, fmtNum } = App;
  const TG = window.TG, items = window.TG_ITEMS || [];
  const TYPES = [["all", "الكل", "layout-grid"], ["fact", "معلومات", "book-open"], ["news", "أخبار", "newspaper"], ["event", "فعاليات", "party-popper"], ["discussion", "أسئلة للنقاش", "message-circle-question"], ["literature", "شعر وأدب", "feather"]];
  const PAGE = 24;
  const state = { type: TYPES.some((t) => t[0] === param("type")) ? param("type") : "all", media: "all", shown: PAGE, admin: param("admin") === "1" || store.get("tg-admin", false) };

  $("#join").href = window.SITE.links.telegram || `https://t.me/${TG ? TG.channel : "informationss_iq"}`;
  $("#admin").checked = state.admin;

  if (!TG || !items.length) {
    $("#grid").innerHTML = `<div class="empty" style="grid-column:1/-1"><span class="ico">${ic("refresh-cw")}</span><h3>لم تتم المزامنة بعد</h3>
      <p>شغّل الأمر <span class="ltr mono">node scripts/telegram-sync.mjs</span> أو فعّل المزامنة التلقائية في GitHub كما في ملف README.</p></div>`;
    icons(); return;
  }
  $("#updated").textContent = `آخر مزامنة: ${new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(new Date(TG.updated))} · ${fmtNum(items.length)} منشور`;
  $("#minlen").textContent = TG.minFactLength;

  function chips() {
    $("#types").innerHTML = TYPES.map(([id, name, i]) => {
      const n = id === "all" ? items.length : items.filter((x) => x.type === id).length;
      return n || id === "all" ? `<button class="chip${state.type === id ? " active" : ""}" data-t="${id}">${ic(i)}${name} <span class="count">${n}</span></button>` : "";
    }).join("");
  }

  function render() {
    const q = $("#q").value.trim();
    let list = items.filter((x) => (state.type === "all" || x.type === state.type)
      && (state.media === "all" || (state.media === "photo" ? (x.media === "photo" || x.media === "album") : x.media === state.media))
      && (!q || matches(`${x.title} ${x.excerpt} ${x.tags.join(" ")}`, q)));
    const s = $("#sort").value;
    list.sort((a, b) => s === "views" ? b.views - a.views : s === "long" ? b.len - a.len : b.tg - a.tg);
    $("#count").textContent = `${fmtNum(list.length)} منشور`;
    $("#grid").innerHTML = list.length ? list.slice(0, state.shown).map((x) => {
      const card = factCard(x);
      if (!state.admin) return card;
      const conf = Math.round((x.conf || 0) * 100);
      return card.replace(/<\/article>$/, `<div class="small" style="padding:0 20px 16px;border-top:1px dashed var(--border);margin-top:-4px;padding-top:10px">
        <div class="flex between"><strong>#${x.tg}</strong><span class="${conf >= 40 ? "text-success" : "text-warn"}">ثقة ${conf}%</span></div>
        <ul class="muted" style="margin:6px 0 0;padding-inline-start:1.1em">${(x.why || []).map((w) => `<li>${esc(w)}</li>`).join("")}</ul>
        <a class="link" href="https://t.me/${TG.channel}/${x.tg}" target="_blank" rel="noopener">فتح في تليغرام</a></div></article>`);
    }).join("") : `<div class="empty" style="grid-column:1/-1"><span class="ico">${ic("search-x")}</span><h3>لا توجد منشورات</h3><p>جرّب نوعاً أو كلمة بحث أخرى.</p></div>`;
    $("#more").hidden = list.length <= state.shown;
    icons();
    const u = new URL(location.href); state.type === "all" ? u.searchParams.delete("type") : u.searchParams.set("type", state.type); history.replaceState(null, "", u);
  }

  $("#types").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (!b) return; state.type = b.dataset.t; state.shown = PAGE; chips(); render(); });
  $$("#media [data-m]").forEach((b) => b.addEventListener("click", () => { state.media = b.dataset.m; state.shown = PAGE; $$("#media [data-m]").forEach((x) => x.classList.toggle("active", x === b)); render(); }));
  $("#q").addEventListener("input", debounce(() => { state.shown = PAGE; render(); }, 150));
  $("#sort").addEventListener("change", render);
  $("#more").addEventListener("click", () => { state.shown += PAGE; render(); });
  $("#admin").addEventListener("change", (e) => { state.admin = e.target.checked; store.set("tg-admin", state.admin); render(); });
  chips(); render();
})();
