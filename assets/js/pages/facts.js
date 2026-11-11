/* ==========================================================
   مكتبة المعلومات: بحث في الهيرو، شريط فلاتر لاصق، عرض مجلة/قائمة،
   تحميل تلقائي مع التمرير، والمنحوتة تتحوّل مع كل قسم
   ========================================================== */
(function () {
  const { $, $$, esc, ic, icons, cat, factCard, matches, readTime, saved, param, debounce, store, fmtNum, fmtCompact } = App;
  const SHAPE = { all: "helix", saved: "crown", iraq: "ziggurat", science: "helix", space: "galaxy", body: "atom", tech: "lens", nature: "wave", culture: "gate", history: "tablet", mind: "globe" };
  const PAGE = 18;
  const state = {
    q: param("q") || param("tag") || "",
    cat: param("saved") ? "saved" : (param("cat") || "all"),
    shown: PAGE,
    view: store.get("lib-view", "grid")
  };
  $("#q").value = state.q;
  const bodyText = (f) => (f._t || (f._t = `${f.title} ${f.excerpt} ${f.tags.join(" ")} ${String(f.body || "").replace(/<[^>]+>/g, " ")}`));
  const countIn = (id) => id === "all" ? window.FACTS.length : id === "saved" ? saved.all().length : window.FACTS.filter((f) => f.cat === id).length;

  /* ---------- Hero: stats + suggested searches ---------- */
  const views = window.FACTS.reduce((s, f) => s + (f.views || 0), 0);
  $("#lib-stats").innerHTML = [
    [window.FACTS.length, "معلومة في الأرشيف", "library"],
    [window.CATEGORIES.length, "أقسام", "layout-grid"],
    views ? [views, "مشاهدة على القناة", "eye", true] : null
  ].filter(Boolean).map(([n, l, i, c]) => `<span>${ic(i)}<b>${c ? fmtCompact(n) : fmtNum(n)}</b>${l}</span>`).join("");
  const tagCount = {};
  window.FACTS.forEach((f) => f.tags.forEach((t) => (tagCount[t] = (tagCount[t] || 0) + 1)));
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([t]) => t);
  $("#suggest").innerHTML = topTags.length ? `<span>جرّب:</span>${topTags.map((t) => `<button type="button" data-q="${esc(t)}">#${esc(t)}</button>`).join("")}` : "";

  /* ---------- Category chips ---------- */
  function chips() {
    const all = [{ id: "all", name: "الكل", icon: "sparkles", c1: "#b07d14", c2: "#f2c25b" }, ...window.CATEGORIES, { id: "saved", name: "محفوظاتي", icon: "bookmark", c1: "#7a5204", c2: "#ffdf94" }];
    $("#chips").innerHTML = all.map((c) => `<button class="chip lib-chip${state.cat === c.id ? " active" : ""}" data-cat="${c.id}" role="tab" aria-selected="${state.cat === c.id}" style="--c1:${c.c1};--c2:${c.c2}">
      <span class="dot"></span>${esc(c.name)}<span class="count">${countIn(c.id)}</span></button>`).join("");
    const act = $("#chips .active"); if (act) act.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }

  /* ---------- Hero follows the selected category ---------- */
  let lastCat = null;
  function hero() {
    if (lastCat === state.cat) return; const first = lastCat === null; lastCat = state.cat;
    const idx = window.CATEGORIES.findIndex((c) => c.id === state.cat);
    const c = state.cat === "all" ? null : state.cat === "saved" ? { name: "محفوظاتي", c1: "#7a5204", c2: "#ffdf94" } : cat(state.cat);
    const name = c ? c.name : "مكتبة المعلومات", n = countIn(state.cat);
    const h = $("#lib-hero");
    h.style.setProperty("--c1", c ? c.c1 : "#1b2a6b"); h.style.setProperty("--c2", c ? c.c2 : "#4b74ff");
    $("#lib-num").textContent = state.cat === "all" ? "∞" : state.cat === "saved" ? "★" : String(idx + 1).padStart(2, "0");
    $("#lib-kick").textContent = c ? "قسم من المكتبة" : "المكتبة";
    $("#crumb").textContent = c ? c.name : "المكتبة";
    $("#lib-giant").textContent = c ? c.name : "المعرفة";
    $("#lib-desc").textContent = state.cat === "saved" ? (n ? `${n} ${n > 10 ? "معلومة" : n > 2 ? "معلومات" : "معلومة"} حفظتها لتعود إليها. متاحة لك حتى بدون إنترنت.` : "احفظ أي معلومة بضغطة على أيقونة الحفظ، وستجدها هنا حتى بدون إنترنت.")
      : c ? `${fmtNum(n)} معلومة موثّقة في قسم «${c.name}»، من أرشيف الإمبراطورية وقناتها.` : "كل ما نشرناه في مكان واحد، موثّقاً بالمصادر. ابحث وصنّف واحفظ ما يعجبك لتعود إليه لاحقاً.";
    const t = $("#title");
    if (first) t.textContent = name;
    else { t.classList.add("swap-out"); setTimeout(() => { t.textContent = name; t.classList.remove("swap-out"); t.classList.add("swap-in"); setTimeout(() => t.classList.remove("swap-in"), 700); }, 260); }
    document.title = `${name} | إمبراطورية المعلومات العراقية`;
    const slot = $("#lib-slot"); slot.dataset.gl = SHAPE[state.cat] || "helix";
    if (window.GL3D) window.GL3D.refresh();
  }

  /* ---------- Results ---------- */
  function list() {
    let L = [...window.FACTS];
    if (state.cat === "saved") { const s = saved.all(); L = L.filter((f) => s.includes(f.id)); }
    else if (state.cat !== "all") L = L.filter((f) => f.cat === state.cat);
    const q = $("#q").value.trim();
    if (q) L = L.filter((f) => matches(bodyText(f), q));
    const s = $("#sort").value;
    const mins = (f) => f.minutes || readTime(f.body);
    L.sort((a, b) => s === "old" ? a.date.localeCompare(b.date) : s === "short" ? mins(a) - mins(b) : s === "az" ? a.title.localeCompare(b.title, "ar")
      : s === "views" ? (b.views || 0) - (a.views || 0) : b.date.localeCompare(a.date) || (b.tg || 0) - (a.tg || 0));
    return { L, q, s };
  }

  function render(keepScroll) {
    const { L, q, s } = list();
    const grid = $("#grid");
    grid.className = `lib-grid ${state.view}${state.view === "grid" && !q && s === "new" && state.cat !== "saved" && L.length > 4 ? " mosaic" : ""}`;
    $("#count").innerHTML = `<b>${fmtNum(L.length)}</b> ${L.length === 1 ? "معلومة" : L.length === 2 ? "معلومتان" : L.length <= 10 ? "معلومات" : "معلومة"}${q ? ` عن «${esc(q)}»` : ""}`;
    $("#q-count").textContent = q ? fmtNum(L.length) : "/";
    $("#reset").hidden = !q && state.cat === "all" && s === "new";
    grid.innerHTML = L.length ? L.slice(0, state.shown).map(factCard).join("") :
      `<div class="empty lib-empty"><span class="ico">${ic(state.cat === "saved" ? "bookmark" : "search-x")}</span>
       <h3>${state.cat === "saved" ? "لا توجد محفوظات بعد" : "لا توجد نتائج"}</h3>
       <p>${state.cat === "saved" ? "اضغط على أيقونة الحفظ في أي معلومة لتظهر هنا. تُحفظ في متصفحك وتبقى متاحة بدون إنترنت." : "جرّب كلمة بحث أخرى أو قسماً مختلفاً."}</p>
       ${state.cat === "saved" ? "" : '<a href="contact.html?type=suggest" class="btn btn-ghost btn-sm">اقترح علينا هذه المعلومة</a>'}</div>`;
    $("#more").hidden = L.length <= state.shown;
    icons();
    $$("#view button").forEach((b) => b.classList.toggle("active", b.dataset.v === state.view));

    const u = new URL(location.href); u.search = "";
    if (state.cat === "saved") u.searchParams.set("saved", "1"); else if (state.cat !== "all") u.searchParams.set("cat", state.cat);
    if (q) u.searchParams.set("q", q);
    history.replaceState(null, "", u);
    if (!keepScroll) toResults();
  }
  // after a filter change, bring the results into view (only if the reader is already below the hero)
  let booted = false;
  function toResults() {
    if (!booted) return;
    const bar = $(".lib-bar-wrap"), y = bar.getBoundingClientRect().top + scrollY - 10;
    if (scrollY > y) window.FX ? FX.scrollTo(y) : scrollTo({ top: y, behavior: "smooth" });
  }

  /* ---------- Events ---------- */
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]"); if (!b) return;
    state.cat = b.dataset.cat; state.shown = PAGE; chips(); hero(); render();
  });
  $("#q").addEventListener("input", debounce(() => { state.shown = PAGE; render(true); }, 140));
  $("#q").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); const y = $(".lib-results").getBoundingClientRect().top + scrollY - 140; window.FX ? FX.scrollTo(y) : scrollTo({ top: y, behavior: "smooth" }); } });
  $("#suggest").addEventListener("click", (e) => { const b = e.target.closest("[data-q]"); if (!b) return; $("#q").value = b.dataset.q; state.shown = PAGE; render(true); });
  $("#sort").addEventListener("change", () => { state.shown = PAGE; render(); });
  $("#view").addEventListener("click", (e) => { const b = e.target.closest("[data-v]"); if (!b) return; state.view = b.dataset.v; store.set("lib-view", state.view); render(true); });
  $("#reset").addEventListener("click", () => { $("#q").value = ""; $("#sort").value = "new"; state.cat = "all"; state.shown = PAGE; chips(); hero(); render(); });
  $("#more").addEventListener("click", () => { state.shown += PAGE; render(true); });
  // infinite scroll: load the next batch as the button approaches
  if ("IntersectionObserver" in window) new IntersectionObserver((en) => { if (en[0].isIntersecting && !$("#more").hidden) $("#more").click(); }, { rootMargin: "600px 0px" }).observe($("#more"));
  document.addEventListener("saved-change", () => { chips(); if (state.cat === "saved") { lastCat = null; hero(); render(true); } });

  chips(); hero(); render(true); booted = true;
})();
