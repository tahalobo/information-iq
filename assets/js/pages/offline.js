/* صفحة «بلا إنترنت»: تعرض المحفوظات المتاحة (كان سكربتاً مضمّناً في offline.html؛ نُقل إلى ملف لتعمل سياسة أمن المحتوى) */
(function () {
  var box = document.getElementById("saved");
  if (!window.App) { box.innerHTML = '<p class="muted">افتح هذه الصفحة بعد عودة الإنترنت.</p>'; return; }
  var ids = App.saved.all();
  var items = ids.map(function (id) { return window.FACTS.find(function (f) { return f.id === id; }) || (window.TG_ITEMS || []).find(function (f) { return f.id === id; }); }).filter(Boolean);
  box.innerHTML = items.length ? items.map(App.factCard).join("") : '<div class="empty" style="grid-column:1/-1"><span class="ico"><i data-lucide="bookmark"></i></span><p>لم تحفظ أي معلومة بعد. اضغط زر الحفظ على أي معلومة لتقرأها لاحقاً بدون إنترنت.</p></div>';
  App.icons();
})();
document.addEventListener("click", function (e) { if (e.target.closest("[data-reload]")) location.reload(); });
