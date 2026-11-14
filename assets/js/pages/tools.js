/* صفحة كل الأدوات (كان سكربتاً مضمّناً في tools.html؛ نُقل إلى ملف لتعمل سياسة أمن المحتوى) */
(function () {
  const { $, esc, ic, icons } = App;
  const G = [
    { id: "verify", t: "أدوات التحقق وكشف التضليل", d: "اعرف حقيقة الصور والروابط والأخبار قبل أن تشاركها.", i: "shield-check" },
    { id: "secure", t: "الأمان والخصوصية", d: "احمِ حساباتك وبياناتك.", i: "lock" },
    { id: "create", t: "صناعة المحتوى", d: "أدوات يومية لصنّاع المحتوى ومديري الصفحات.", i: "palette" }
  ];
  $("#groups").innerHTML = G.map((g) => `<div class="mb-3" style="margin-bottom:48px">
    <div class="section-head mb-2"><div class="flex gap-1 items-center"><span class="ico">${ic(g.i)}</span><div><h2 style="font-size:1.4rem">${g.t}</h2><p class="mt-0">${g.d}</p></div></div></div>
    <div class="grid grid-3">${window.TOOLS.filter((t) => t.group === g.id).map((t) => `<a href="${t.href}" class="card card-hover tool-card${t.featured ? " featured" : ""}">
      ${t.featured ? `<span class="badge">${ic("star")}مميزة</span>` : ""}
      <span class="ico">${ic(t.icon)}</span><div><h3>${esc(t.title)}</h3><p class="mb-0">${esc(t.desc)}</p></div>
      <span class="arrow">افتح الأداة${ic("arrow-left")}</span></a>`).join("")}</div></div>`).join("");
  icons();
})();
