/* روابط قديمة: post/<id> بلا لاحقة ← post/<id>.html (داخل الموقع نفسه فقط: المسار يُبنى على <base>) */
(function () {
  var m = location.pathname.match(/\/post\/([A-Za-z0-9_-]+)\/?$/);
  if (m) location.replace(new URL("post/" + m[1] + ".html", document.baseURI).href);
})();
