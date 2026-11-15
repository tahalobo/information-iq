(function () {
  const { $, $$, esc, icons, newsRow } = App;
  const items = window.BR_ITEMS || [];
  const branches = (window.BRANCHES || []).filter((b) => b.id !== "info" && items.some((x) => x.branch === b.id));
  let range = 7, branch = "all";

  $("#tr-chips").innerHTML = `<button class="chip active" data-b="all" role="tab">كل الفروع</button>` +
    branches.map((b) => `<button class="chip" data-b="${esc(b.id)}" role="tab">${esc(b.short)}</button>`).join("");

  function render() {
    const mine = (x) => branch === "all" || x.branch === branch;
    const since = range ? Date.now() - range * 86400e3 : 0;
    let pool = items.filter((x) => mine(x) && new Date(x.ts).getTime() >= since);
    let note = "";
    if (!pool.length && range === 1) { // لا أخبار منذ 24 ساعة: نعرض الأسبوع بدل صفحة فارغة
      pool = items.filter((x) => mine(x) && new Date(x.ts).getTime() >= Date.now() - 7 * 86400e3);
      note = "لا أخبار في آخر 24 ساعة، فهذه أكثر أخبار الأسبوع قراءة. ";
    }
    const top = pool.sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 30);
    $("#tr-count").textContent = top.length ? `${note}أكثر ${top.length} ${top.length > 10 ? "خبراً" : "أخبار"} قراءةً من أصل ${pool.length}` : "لا أخبار في هذه المدة لهذا الفرع.";
    $("#tr-list").innerHTML = top.map((x, i) => newsRow(x, i + 1)).join("");
    icons();
  }
  $("#tr-range").addEventListener("click", (e) => { const b = e.target.closest("[data-range]"); if (!b) return; range = +b.dataset.range; $$("#tr-range button").forEach((x) => x.classList.toggle("active", x === b)); render(); });
  $("#tr-chips").addEventListener("click", (e) => { const b = e.target.closest("[data-b]"); if (!b) return; branch = b.dataset.b; $$("#tr-chips .chip").forEach((x) => x.classList.toggle("active", x === b)); render(); });
  render();
})();
