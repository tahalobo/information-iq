/* ==========================================================
   إعدادات الموقع: عدّل هذا الملف فقط لتغيير الروابط والأرقام
   ========================================================== */
window.SITE = {
  name: "الإمبراطورية العراقية",
  shortName: "الإمبراطورية",
  tagline: "نسعى لانتقاء كل ما هو حقيقي ومفيد",
  description: "شبكة قنوات عراقية مستقلة للمعلومات والأخبار والألعاب والموسيقى والأنمي والرياضة.",
  handle: "information_1q",

  // روابط التواصل (اترك الحقل فارغاً "" لإخفائه من الموقع)
  links: {
    instagram: "https://www.instagram.com/information_1q/",
    instagramDM: "https://ig.me/m/information_1q",
    telegram: "https://t.me/informationss_iq",
    email: "",        // مثال: "contact@example.com"
    whatsapp: "",     // رقم دولي بدون + أو أصفار، مثال: "9647700000000"
    facebook: "",
    x: "",
    tiktok: "",
    youtube: ""
  },

  // نموذج التواصل: رابط سكربت Google بعد نشره (الخطوات أعلى الملف scripts/contact-form.gs)
  // مثال: "https://script.google.com/macros/s/XXXX/exec" ← الرسائل تصل لكروب الفريق، والتوكن لا يظهر في الموقع أبداً.
  // يقبل أيضاً رابط Formspree. إذا تُرك فارغاً، يجهّز الموقع الرسالة ويرسلها الزائر عبر الدايركت.
  formEndpoint: "",

  // البحث العكسي داخل الموقع: رابط عامل Cloudflare بعد نشره (راجع worker/README.md)
  // مثال: "https://empire-reverse.yourname.workers.dev"
  // العامل مجاني وبلا مفتاح API. إذا تُرك فارغاً، تعمل الأداة بالبحث في أرشيفنا فقط مع أزرار المحركات الخارجية.
  reverseSearchEndpoint: "",

  // محقّق الأخبار (verify.html): يعمل بلا إعداد على أرشيفنا وويكيبيديا. ولتوسيعه:
  // 1) بحث الويب والأخبار: رابط عامل Cloudflare (المسار /verify). إذا تُرك فارغاً يُستعمل reverseSearchEndpoint.
  verifyEndpoint: "",
  // 2) مواقع تدقيق الحقائق: مفتاح Google Fact Check Tools API (مجاني). قيّده برابط موقعك من لوحة Google Cloud لأنه يظهر في المتصفح.
  factCheckApiKey: "",

  // أرقام الصفحة (تظهر في الرئيسية وصفحة الإنجازات)
  stats: {
    followers: 65900,     // متابعو إنستغرام (تشرين الثاني 2026)
    followersLabel: "متابع على إنستغرام",
    factsLabel: "معلومة موثّقة في الأرشيف",
    toolsLabel: "أداة رقمية مجانية"
  },

  founded: "",              // سنة تأسيس الصفحة، مثال: "2019"
  year: new Date().getFullYear()
};
