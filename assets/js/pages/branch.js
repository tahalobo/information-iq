/* ==========================================================
   فروع الإمبراطورية: الأخبار، الألعاب، الموسيقى، الأنمي، الرياضة
   بيانات assets/js/branches-data.js (scripts/branches-sync.mjs)، تتحدث تلقائياً من تليغرام
   ========================================================== */
(function () {
  const { $, esc, ic, icons, cat, factCard, matches, param, debounce, fmtNum, fmtCompact } = App;
  const PAGE = 24;
  const BR = window.BR || { branches: [], posts: [] };
  const items = window.BR_ITEMS || [];
  const list = (window.BRANCHES || []).filter((b) => b.id !== "info");
  const state = { b: list.some((b) => b.id === param("b")) ? param("b") : "all", q: param("q") || "", sort: "new", shown: PAGE };
  $("#q").value = state.q;
  const countIn = (id) => (id === "all" ? items.length : items.filter((x) => x.branch === id).length);

  function chips() {
    const all = [{ id: "all", short: "كل الفروع", c1: "#b07d14", c2: "#f2c25b" }, ...list];
    $("#chips").innerHTML = all.map((b) => `<button class="chip lib-chip${state.b === b.id ? " active" : ""}" data-b="${b.id}" role="tab" aria-selected="${state.b === b.id}" style="--c1:${b.c1};--c2:${b.c2}">
      <span class="dot"></span>${esc(b.short)}<span class="count">${countIn(b.id)}</span></button>`).join("")
      + `<a class="chip lib-chip" href="facts.html" style="--c1:#8a5a14;--c2:#d4a537"><span class="dot"></span>المعلومات${ic("arrow-up-left")}</a>`;
    const act = $("#chips .active"); if (act) act.scrollIntoView({ block: "nearest", inline: "center" });
  }

  function hero() {
    const b = list.find((x) => x.id === state.b);
    const h = $("#lib-hero");
    h.style.setProperty("--c1", b ? b.c1 : "#1b2a6b"); h.style.setProperty("--c2", b ? b.c2 : "#4b74ff");
    $("#title").textContent = b ? b.name : "فروع الإمبراطورية";
    $("#crumb").textContent = b ? b.short : "كل الفروع";
    $("#lib-giant").textContent = b ? b.short : "الإمبراطورية";
    $("#lib-kick").textContent = b ? "فرع من الإمبراطورية" : "فروع الإمبراطورية";
    $("#lib-num").textContent = b ? String(list.indexOf(b) + 2).padStart(2, "0") : String(list.length + 1).padStart(2, "0");
    $("#lib-desc").textContent = b ? b.desc : "أخبار قنوات الإمبراطورية العراقية في مكان واحد: الأخبار والألعاب والموسيقى والأنمي والرياضة. نأخذ من كل قناة الخبر الكامل فقط، بعنوانه ووصفه، ونترك الإعلانات والفعاليات.";
    $("#br-actions").innerHTML = b
      ? `<a class="btn btn-primary" href="${esc(b.url)}" target="_blank" rel="noopener">${ic("send")}انضم إلى ${esc(b.name)}</a>`
      : list.map((x) => `<a class="btn btn-ghost btn-sm" href="${esc(x.url)}" target="_blank" rel="noopener">${ic(x.icon)}${esc(x.short)}</a>`).join("");
    const pool = b ? items.filter((x) => x.branch === b.id) : items;
    const views = pool.reduce((s, x) => s + (x.views || 0), 0);
    const upd = BR.updated ? new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(new Date(BR.updated)) : "";
    $("#lib-stats").innerHTML = [
      [fmtNum(pool.length), "خبر", "newspaper"],
      views ? [fmtCompact(views), "مشاهدة على تليغرام", "eye"] : null,
      upd ? [upd, "آخر تحديث", "refresh-cw"] : null
    ].filter(Boolean).map(([n, l, i]) => `<span>${ic(i)}<b>${n}</b>${l}</span>`).join("");
    document.title = `${b ? b.name : "فروع الإمبراطورية"} | ${window.SITE.name}`;
  }

  function render() {
    let L = state.b === "all" ? items : items.filter((x) => x.branch === state.b);
    if (state.q) L = L.filter((x) => matches(`${x.title} ${x.excerpt} ${x.tags.join(" ")} ${cat(x.cat).name}`, state.q));
    L = [...L].sort((a, b) => state.sort === "views" ? (b.views || 0) - (a.views || 0) : b.date.localeCompare(a.date) || b.tg.localeCompare(a.tg));
    $("#count").textContent = L.length ? `${fmtNum(L.length)} خبر${state.q ? ` لـ«${state.q}»` : ""}` : "";
    $("#q-count").textContent = state.q ? L.length : "";
    $("#grid").innerHTML = L.length ? L.slice(0, state.shown).map(factCard).join("")
      : `<div class="empty" style="grid-column:1/-1">${ic(items.length ? "search-x" : "loader")}<p class="mt-1">${items.length ? `لا أخبار تطابق «${esc(state.q)}».` : "لم تُسحب أخبار الفروع بعد. ستظهر هنا مع أول مزامنة."}</p></div>`;
    $("#more").hidden = L.length <= state.shown;
    $("#br-note").innerHTML = items.length ? `${ic("filter")} نعرض من كل قناة الخبر الذي يصلح عنواناً ووصفاً فقط. الإعلانات والفعاليات والمسابقات والأخبار ذات السطر الواحد والمكرر لا تظهر هنا، تجدها كلها في القناة نفسها.` : "";
    icons(); if (window.FX) FX.refresh($("#grid"));
  }

  const sync = () => {
    const u = new URL(location.href);
    state.b === "all" ? u.searchParams.delete("b") : u.searchParams.set("b", state.b);
    state.q ? u.searchParams.set("q", state.q) : u.searchParams.delete("q");
    history.replaceState(null, "", u);
  };
  $("#chips").addEventListener("click", (e) => {
    const c = e.target.closest("[data-b]"); if (!c) return;
    state.b = c.dataset.b; state.shown = PAGE; sync(); chips(); hero(); render(); icons();
  });
  $("#q").addEventListener("input", debounce((e) => { state.q = e.target.value.trim(); state.shown = PAGE; sync(); render(); }, 150));
  $("#sort").addEventListener("change", (e) => { state.sort = e.target.value; render(); });
  $("#more").addEventListener("click", () => { state.shown += PAGE; render(); });

  chips(); hero(); render(); icons();
})();
