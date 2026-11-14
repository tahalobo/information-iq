/* صفحة «من نحن» (كان سكربتاً مضمّناً في about.html؛ نُقل إلى ملف لتعمل سياسة أمن المحتوى) */
(function () {
  const { $, $$, esc, ic, icons, countUp, fmtCompact } = App;
  const S = window.SITE, B = window.BRANCHES || [];

  /* Hero ticker */
  const tk = (n, l, compact) => `<div><strong data-count="${n}"${compact ? ' data-compact="k"' : ""}>0</strong><span>${l}</span></div>`;
  $("#ticker").innerHTML = tk(S.stats.followers, "مشترك على تليغرام", true) + tk(B.length, "فروع وقنوات") + tk(window.FACTS.length, "معلومة موثّقة") + tk(window.TOOLS.length, "أداة تحقق مجانية");

  /* 02 Branch solar system */
  const ring = $("#ring"), panel = $("#br-panel");
  const pos = B.map((b, i) => { const a = -Math.PI / 2 + i * 2 * Math.PI / B.length; return [Math.cos(a), Math.sin(a)]; });
  ring.innerHTML = `<svg viewBox="0 0 100 100" aria-hidden="true">${pos.map(([x, y], i) => `<line data-i="${i}" x1="50" y1="50" x2="${50 + 41 * x}" y2="${50 + 41 * y}"/>`).join("")}</svg>`
    + B.map((b, i) => `<button class="ab-node" data-i="${i}" style="--cx:${pos[i][0].toFixed(4)};--cy:${pos[i][1].toFixed(4)};--c1:${b.c1};--c2:${b.c2}" aria-label="${esc(b.name)}">
      <span><span class="ab-planet${b.logo ? " has-logo" : ""}">${App.bIcon(b)}</span><b>${esc(b.short)}</b></span></button>`).join("");
  let cur = 0, auto = true;
  function show(i, user) {
    cur = i; if (user) auto = false;
    const b = B[i];
    $$(".ab-node", ring).forEach((n, k) => n.classList.toggle("on", k === i));
    $$("line", ring).forEach((l, k) => l.classList.toggle("on", k === i));
    panel.style.setProperty("--c1", b.c1); panel.style.setProperty("--c2", b.c2);
    panel.innerHTML = `${ic(b.icon, "big")}<span class="tag">${ic(b.icon)}الفرع ${String(i + 1).padStart(2, "0")} من ${String(B.length).padStart(2, "0")}</span>
      <h3>${esc(b.name)}</h3><p>${esc(b.desc)}</p>
      <div class="meta"><span>${ic("send")}<span class="ltr">@${esc(b.channel)}</span></span></div>
      <div class="btn-row"><a class="btn btn-primary" href="${b.href}">${ic("layout-grid")}تصفّح الفرع</a><a class="btn btn-ghost" href="${b.url}" target="_blank" rel="noopener">${ic("send")}القناة على تليغرام</a></div>
      <div class="ab-dots" aria-hidden="true">${B.map((_, k) => `<i class="${k === i ? "on" : ""}"></i>`).join("")}</div>`;
    panel.classList.remove("swap"); void panel.offsetWidth; panel.classList.add("swap");
    icons();
  }
  ring.addEventListener("click", (e) => { const n = e.target.closest(".ab-node"); if (n) show(+n.dataset.i, true); });
  show(0);
  setInterval(() => { if (auto && !document.hidden && !$("#orbit").matches(":hover")) show((cur + 1) % B.length); }, 5000);

  /* 03 Values (flip cards) */
  const VALUES = [
    ["crosshair", "الدقة قبل السرعة", "أن نتأخر ساعة ونكون على حق، أفضل من أن نسبق الجميع بخبر خاطئ. لا ننشر قبل أن نتأكد."],
    ["scale", "الاستقلالية والحياد", "لا نتبع أي جهة سياسية أو حزبية، ولا يملي علينا معلن ما نكتب. نعرض الحقائق والأرقام كما هي."],
    ["brain", "احترام عقل المتابع", "لا عناوين مضللة ولا تهويل. نشرح ببساطة دون أن نستخف بالقارئ، ونترك له أن يحكم بنفسه."],
    ["rotate-ccw", "شجاعة التصحيح", "نخطئ أحياناً لأننا بشر. وحين نخطئ نصحّح علناً ونذكر ذلك بوضوح، ولا نحذف بصمت."]
  ];
  $("#vals").innerHTML = VALUES.map(([i, t, d], k) => `<button class="ab-flip xr" aria-label="${t}">
    <span class="ab-flip-in">
      <span class="ab-face ab-front"><span class="n">0${k + 1}</span>${ic(i)}<span><h3>${t}</h3><small>${ic("rotate-3d")}اقلب البطاقة</small></span></span>
      <span class="ab-face ab-back"><h3>${t}</h3><p>${d}</p></span>
    </span></button>`).join("");
  $("#vals").addEventListener("click", (e) => { const f = e.target.closest(".ab-flip"); if (f) f.classList.toggle("flipped"); });

  /* 04 Journey of a fact */
  const STEPS = [
    ["lightbulb", "الاختيار", "نختار موضوعاً مفيداً أو مثيراً للفضول، أو خبراً يتداوله الناس ويحتاج توضيحاً."],
    ["library", "البحث", "نرجع إلى المصادر الأصلية: دراسات، ومنظمات دولية، وموسوعات، ووكالات أنباء."],
    ["shield-check", "التحقق", "نقارن المصادر ببعضها، ونفحص الصور والأرقام والتواريخ.", "مصدران موثوقان على الأقل"],
    ["pen-tool", "التبسيط والتصميم", "نكتبها بلغة سهلة ونصمّمها بصرياً لتصل إلى الجميع."],
    ["send", "النشر والتصحيح", "ننشر مع المصادر، ونتابع تعليقاتكم، ونصحّح علناً أي خطأ يكتشفه المتابعون."]
  ];
  const flow = $("#flow");
  flow.insertAdjacentHTML("beforeend", STEPS.map(([i, t, d, r], k) => `<div class="ab-step"><span class="dot">${ic(i)}</span><h3><small>0${k + 1}</small>${t}</h3><p>${d}</p>${r ? `<span class="rule">${ic("badge-check")}${r}</span>` : ""}</div>`).join(""));
  const steps = $$(".ab-step", flow);
  function flowTick() {
    const vh = innerHeight, r = flow.getBoundingClientRect(), line = vh * .62;
    flow.style.setProperty("--fill", Math.max(0, Math.min(1, (line - r.top) / r.height)).toFixed(3));
    steps.forEach((s) => s.classList.toggle("on", s.getBoundingClientRect().top + 30 < line));
  }
  addEventListener("scroll", flowTick, { passive: true }); addEventListener("resize", flowTick); flowTick();

  /* 05 Charter */
  const ART = [
    ["الاستقلالية", "الصفحة مستقلة ولا تتبع أي جهة سياسية أو حزبية. المحتوى الممول يُعلَّم دائماً بوضوح بعبارة «إعلان» أو «برعاية»، ولا يؤثر المعلن على محتوانا التحريري."],
    ["المصادر", "نعتمد على المصادر الأولية والموثوقة: المنظمات الدولية مثل اليونسكو وناسا، والموسوعات العلمية، والدراسات المحكّمة، والجهات الرسمية. وكل معلومة في هذا الموقع مرفقة بمصادرها."],
    ["التصحيح", `إذا وجدت خطأً في أي معلومة، استخدم زر «أبلغ عن خطأ» أسفلها أو <a class="link" href="contact.html?type=correction">راسلنا</a>. نراجع كل بلاغ، وإن ثبت الخطأ نصحّحه ونذكر ذلك بوضوح.`],
    ["المواضيع الحساسة", "في الأخبار السياسية والانتخابات نلتزم بالحياد ونعرض الأرقام والحقائق دون تحيّز. ولا ننشر محتوى يحرّض على الكراهية أو العنف أو الطائفية."],
    ["الخصوصية", `أدوات الموقع تعمل داخل متصفحك، فلا نرفع صورك ولا نحفظ كلمات مرورك. المحفوظات والإعدادات تُخزّن في متصفحك فقط، ولا نستخدم أدوات تتبّع إعلانية. التفاصيل في <a class="link" href="privacy.html">سياسة الخصوصية</a>.`]
  ];
  const ORD = ["الأولى", "الثانية", "الثالثة", "الرابعة", "الخامسة"];
  $("#articles").innerHTML = ART.map(([t, d], k) => `<section class="ab-art"><span class="no">${k + 1}</span><h3>${t}<small>المادة ${ORD[k]}</small></h3><p>${d}</p></section>`).join("");

  /* 06 Timeline */
  $("#tl").innerHTML = (window.MILESTONES || []).map((m) => `<div class="ab-tl-item xr"><span class="gem">${ic(m.icon)}</span>
    <div class="ab-tl-card"><time>${esc(m.date)}</time><h3>${esc(m.title)}</h3><p>${esc(m.desc)}</p></div></div>`).join("");

  /* 07 Advertise */
  const rc = (n, l, raw) => `<div class="xr"><strong>${raw || n}</strong><span>${l}</span></div>`;
  $("#reach").innerHTML = rc(0, "مشترك على تليغرام", App.fmtK(S.stats.followers)) + rc(B.length, "قنوات على تليغرام") + rc(window.FACTS.length, "معلومة في الأرشيف") + rc(0, "تغطية", "العراق والعالم العربي");
  const PK = [
    { t: "منشور ممول", i: "image", d: "تصميم احترافي بهوية الصفحة يبقى في الحساب، مع ذكر علامتك التجارية.", f: ["تصميم بهويتنا البصرية", "يبقى منشوراً في الحساب", "علامة «إعلان» واضحة"] },
    { t: "ستوري ورابط", i: "smartphone", d: "ستوري مع رابط مباشر لمتجرك أو حسابك، ويمكن تثبيته في الهايلايت.", f: ["رابط مباشر", "إمكانية التثبيت في الهايلايت"] },
    { t: "رعاية سلسلة", i: "layers", d: "اسمك على سلسلة محتوى كاملة مثل «جوائز نوبل» أو «إحصائيات».", f: ["ظهور متكرر عبر السلسلة", "ارتباط اسمك بالمحتوى الموثوق"], hot: true },
    { t: "حملة متكاملة", i: "rocket", d: "منشورات وستوريات ومحتوى على تليغرام والموقع ضمن خطة واحدة.", f: ["عدة فروع وقنوات", "إنستغرام وتليغرام والموقع"] }
  ];
  $("#packs").innerHTML = PK.map((p) => `<div class="ab-pack xr${p.hot ? " hot" : ""}">${p.hot ? `<span class="ribbon">الأكثر تأثيراً</span>` : ""}
    <span class="ico">${ic(p.i)}</span><h3>${p.t}</h3><p>${p.d}</p><ul>${p.f.map((x) => `<li>${ic("check")}${x}</li>`).join("")}</ul>
    <a class="btn ${p.hot ? "btn-primary" : "btn-ghost"}" href="contact.html?type=ads&package=${encodeURIComponent(p.t)}">${ic("message-square")}اطلب الأسعار</a></div>`).join("");

  /* 08 Roles */
  const ROLES = [["search", "باحث ومحرر معلومات", "تحب البحث والتحقق والكتابة المبسّطة"], ["palette", "مصمم", "تصاميم المنشورات والستوريات بهوية الإمبراطورية"], ["clapperboard", "محرر فيديو", "مقاطع قصيرة تشرح المعلومة بصرياً"]];
  $("#roles").innerHTML = ROLES.map(([i, t, d]) => `<a class="ab-role xr" href="contact.html?type=join"><span class="ico ico-sm">${ic(i)}</span><span><strong>${t}</strong><small>${d}</small></span>${ic("arrow-left")}</a>`).join("");

  icons(); countUp();
})();
