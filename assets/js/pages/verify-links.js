/* روابط أدوات التحقق في صفحة «تحقق معنا» (كان سكربتاً مضمّناً في verify.html؛ نُقل إلى ملف لتعمل سياسة أمن المحتوى) */
(function () {
  const { $, esc, ic, icons } = App;
  $("#tools").innerHTML = window.TOOLS.filter((t) => t.group === "verify" && t.id !== "verify").concat(window.TOOLS.filter((t) => t.id === "password"))
    .map((t) => `<a href="${t.href}" class="card card-hover tool-card"><span class="ico">${ic(t.icon)}</span><div><h3>${esc(t.title)}</h3><p class="mb-0">${esc(t.desc)}</p></div><span class="arrow">افتح الأداة${ic("arrow-left")}</span></a>`).join("");
  icons();
})();
