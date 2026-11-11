(function () {
  const { $, $$, esc, ic, icons, param, modal, copy, toast } = App;
  const S = window.SITE, L = S.links;

  const TYPES = [
    { id: "general", t: "استفسار عام", i: "message-square", msg: "اكتب رسالتك…" },
    { id: "suggest", t: "اقتراح معلومة", i: "lightbulb", msg: "ما المعلومة أو الموضوع الذي تقترحه؟ أضف مصدراً إن وُجد.", extra: "المصدر (رابط أو اسم كتاب) - اختياري" },
    { id: "correction", t: "تصحيح خطأ", i: "pencil-line", msg: "ما الخطأ وما التصحيح؟ يُفضّل إرفاق مصدر يثبت ذلك.", extra: "المعلومة المقصودة (العنوان أو الرابط)" },
    { id: "rumor", t: "تحقق من خبر", i: "shield-question", msg: "انسخ الخبر أو الإشاعة كما وصلتك، واذكر أين رأيتها.", extra: "رابط الخبر أو المنشور (إن وجد)" },
    { id: "ads", t: "إعلان وتعاون", i: "megaphone", msg: "عرّفنا بنشاطك التجاري ونوع الإعلان الذي تريده والميزانية التقريبية.", extra: "اسم الشركة أو النشاط" },
    { id: "join", t: "الانضمام للفريق", i: "user-plus", msg: "عرّفنا بنفسك ومهاراتك (بحث، تصميم، مونتاج، كتابة)، ولماذا تريد الانضمام.", extra: "رابط نماذج أعمالك (اختياري)" }
  ];
  let type = TYPES.find((x) => x.id === param("type")) ? param("type") : "general";
  const openedAt = Date.now();

  $("#types").innerHTML = TYPES.map((x) => `<button type="button" class="type-opt" data-type="${x.id}" role="radio" aria-checked="false">${ic(x.i)}<span>${x.t}</span></button>`).join("");
  function setType(id) {
    type = id; const T = TYPES.find((x) => x.id === id);
    $$("#types [data-type]").forEach((b) => { const on = b.dataset.type === id; b.classList.toggle("active", on); b.setAttribute("aria-checked", on); });
    $("#msg").placeholder = T.msg;
    $("#extra-wrap").hidden = !T.extra; $("#extra-label").textContent = T.extra || "";
    $("#msg-hint").textContent = id === "rumor" ? "يمكنك أيضاً إرسال الصورة أو لقطة الشاشة لنا عبر الدايركت بعد الإرسال." : "";
  }
  $("#types").addEventListener("click", (e) => { const b = e.target.closest("[data-type]"); if (b) setType(b.dataset.type); });
  setType(type);

  // Prefill from links (e.g. "report an error" on a fact)
  const ref = param("ref"), pkg = param("package");
  if (ref) { const f = window.FACTS.find((x) => x.id === ref); $("#extra").value = f ? `${f.title} (${new URL(App.factUrl(f.id), document.baseURI).href})` : ref; }
  if (pkg) $("#msg").value = `أرغب بمعرفة أسعار باقة «${pkg}».\n\n`;

  // Channels
  const ch = [];
  if (L.instagramDM) ch.push(["instagram", "رسالة على إنستغرام", "@" + S.handle, L.instagramDM]);
  if (L.telegram) ch.push(["send", "قناة تليغرام", L.telegram.replace(/^https?:\/\//, ""), L.telegram]);
  if (L.whatsapp) ch.push(["message-circle", "واتساب", "+" + L.whatsapp, `https://wa.me/${L.whatsapp}`]);
  if (L.email) ch.push(["mail", "البريد الإلكتروني", L.email, `mailto:${L.email}`]);
  $("#channels").innerHTML = ch.map(([i, t, s, h]) => `<a href="${h}" target="_blank" rel="noopener" class="flex gap-1 items-center" style="padding:10px;border-radius:12px;border:1px solid var(--border)">
    <span class="ico ico-sm">${ic(i)}</span><span style="flex:1;min-width:0"><strong class="small">${t}</strong><br><span class="small muted ltr">${esc(s)}</span></span>${ic("arrow-up-left")}</a>`).join("");
  icons();

  function compose(d) {
    const T = TYPES.find((x) => x.id === type);
    return `[${T.t}] - من موقع ${S.name}\n\nالاسم: ${d.name}\nللرد: ${d.reply}${d.extra ? `\n${T.extra?.replace(/ - اختياري| \(.*\)$/g, "")}: ${d.extra}` : ""}\n\n${d.message}`;
  }

  $("#form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    if (fd.get("_gotcha")) return; // bot
    const d = { name: fd.get("name").trim(), reply: fd.get("reply").trim(), extra: (fd.get("extra") || "").trim(), message: fd.get("message").trim() };
    const errs = [];
    if (!d.name) errs.push("الاسم"); if (!d.reply) errs.push("وسيلة الرد"); if (d.message.length < 10) errs.push("الرسالة (10 أحرف على الأقل)");
    if (errs.length) { $("#form-msg").innerHTML = `<div class="alert alert-danger">${ic("alert-circle")}<span>يرجى إكمال: ${errs.join("، ")}</span></div>`; icons(); return; }
    $("#form-msg").innerHTML = "";
    const text = compose(d);

    if (S.formEndpoint) {
      const btn = $("#submit"); btn.disabled = true; btn.innerHTML = `${ic("loader")}جارِ الإرسال…`; icons();
      try {
        // Formspree يريد JSON، أما سكربت Google فيريد طلباً بسيطاً (text/plain) لأنه لا يجيب على فحص CORS المسبق
        const headers = /formspree\.io/i.test(S.formEndpoint) ? { "Content-Type": "application/json", Accept: "application/json" } : { "Content-Type": "text/plain;charset=utf-8" };
        const r = await fetch(S.formEndpoint, { method: "POST", headers, body: JSON.stringify({ type, ...d, _subject: text.split("\n")[0], page: location.href.split("#")[0], t: Date.now() - openedAt }) });
        const res = await r.json().catch(() => ({}));
        if (!r.ok || res.ok === false) throw new Error(res.error === "rate" ? "rate" : "");
        e.target.reset(); setType(type);
        $("#form-msg").innerHTML = `<div class="alert alert-success">${ic("badge-check")}<div><strong>وصلت رسالتك!</strong><p>شكراً لك. سنرد عليك قريباً.</p></div></div>`;
      } catch (err) {
        $("#form-msg").innerHTML = err && err.message === "rate"
          ? `<div class="alert alert-warn">${ic("clock")}<span>أرسلت عدة رسائل خلال وقت قصير. انتظر بضع دقائق ثم جرّب مرة أخرى.</span></div>`
          : `<div class="alert alert-danger">${ic("wifi-off")}<span>تعذّر الإرسال. جرّب مرة أخرى أو راسلنا مباشرة عبر إنستغرام.</span></div>`;
      } finally { btn.disabled = false; btn.innerHTML = `${ic("send")}إرسال`; icons(); }
      return;
    }

    // No backend configured: hand the message to the user's own app
    const m = modal(`<span class="ico mb-2">${ic("send")}</span><h2 style="font-family:var(--font);font-size:1.35rem">رسالتك جاهزة</h2>
      <p class="muted">اختر طريقة الإرسال. سننسخ الرسالة لك تلقائياً لتلصقها.</p>
      <textarea class="textarea" readonly style="min-height:160px;font-size:.88rem">${esc(text)}</textarea>
      <div class="btn-row mt-2">
        ${L.instagramDM ? `<a class="btn btn-primary" data-send href="${L.instagramDM}" target="_blank" rel="noopener">${ic("instagram")}إنستغرام</a>` : ""}
        ${L.whatsapp ? `<a class="btn btn-ghost" href="https://wa.me/${L.whatsapp}?text=${encodeURIComponent(text)}" target="_blank" rel="noopener">${ic("message-circle")}واتساب</a>` : ""}
        ${L.email ? `<a class="btn btn-ghost" href="mailto:${L.email}?subject=${encodeURIComponent(text.split("\n")[0])}&body=${encodeURIComponent(text)}">${ic("mail")}البريد</a>` : ""}
        ${L.telegram ? `<a class="btn btn-ghost" data-send href="${L.telegram}" target="_blank" rel="noopener">${ic("send")}تليغرام</a>` : ""}
        <button class="btn btn-ghost" data-copy="${esc(text)}">${ic("copy")}نسخ فقط</button>
      </div>`);
    m.el.addEventListener("click", (ev) => { if (ev.target.closest("[data-send]")) { copy(text, "نُسخت الرسالة. الصقها في المحادثة"); } });
  });
})();
