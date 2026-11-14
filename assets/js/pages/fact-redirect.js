/* الروابط القديمة fact.html?id=… تُحوَّل إلى الصفحة الثابتة post/<id>.html إن وُجدت (المعرّف يُقبل فقط إذا كان في فهرس الصفحات الثابتة) */
(function () {
  try {
    var id = new URLSearchParams(location.search).get("id");
    if (id && window.STATIC_POSTS && Object.prototype.hasOwnProperty.call(window.STATIC_POSTS, id)) location.replace("post/" + encodeURIComponent(id) + ".html" + location.hash);
  } catch (e) { /* ignore */ }
})();
