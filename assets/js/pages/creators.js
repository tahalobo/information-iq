/* فهرس «مبدعون عراقيون»: بحث بالاسم وتصفية بالمجال والمحافظة.
   البطاقات مكتوبة في الصفحة وقت البناء (scripts/build-pages.mjs)؛ هنا نخفي ونظهر فقط. */
(function () {
  const { $, $$, norm, debounce } = App;
  const tools = $("#cr-tools"); if (!tools) return;
  const cards = $$("#cr-grid .cr-card").map((el) => ({ el, q: norm(el.dataset.q), field: el.dataset.field || "", prov: el.dataset.prov || "" }));
  const input = $("#cr-q"), prov = $("#cr-prov"), none = $("#cr-none"), count = $("#cr-count");
  const label = (n) => (n === 0 ? "لا نتائج" : n === 1 ? "مبدع واحد" : n === 2 ? "مبدعان" : n <= 10 ? `${n} مبدعين` : `${n} مبدعاً`);
  let field = "";
  tools.hidden = false;

  function run() {
    const words = norm(input.value).split(" ").filter(Boolean);
    let n = 0;
    for (const c of cards) {
      const on = (!field || c.field === field) && (!prov.value || c.prov === prov.value) && words.every((w) => c.q.includes(w));
      c.el.hidden = !on; if (on) n++;
    }
    none.hidden = n > 0;
    count.textContent = n === cards.length ? label(n) : `${label(n)} من ${cards.length}`;
  }
  $("#cr-fields").addEventListener("click", (e) => {
    const b = e.target.closest("[data-field]"); if (!b) return;
    field = b.dataset.field;
    $$("#cr-fields [data-field]").forEach((x) => { const on = x === b; x.classList.toggle("active", on); x.setAttribute("aria-pressed", String(on)); });
    run();
  });
  input.addEventListener("input", debounce(run, 120));
  prov.addEventListener("change", run);
})();
