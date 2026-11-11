(function () {
  const { $, $$, esc, ic, icons, copy, store, fmtNum, toast } = App;
  const t = $("#t"); const history = [];
  t.value = store.get("text-draft", "");

  const EMOJI = /(\p{Extended_Pictographic}|\p{Emoji_Presentation}|️|‍|[\u{1F3FB}-\u{1F3FF}])/gu;
  const URLRE = /(https?:\/\/|www\.)[^\s]*[^\s.,;:!?،؛؟)\]»"']/gi;
  const OPS = {
    tashkeel: (s) => s.replace(/[ً-ٰٟۖ-ۭ]/g, ""),
    tatweel: (s) => s.replace(/ـ/g, ""),
    normalize: (s) => s.replace(/[أإآٱ]/g, "ا").replace(/ى(?=\s|$)/g, "ي"),
    toLatn: (s) => s.replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)).replace(/[۰-۹]/g, (d) => "۰۱۲۳۴۵۶۷۸۹".indexOf(d)),
    toArab: (s) => s.replace(URLRE, (m) => m.replace(/\d/g, "\u0000$&")).replace(/(?<!\u0000)\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]).replace(/\u0000/g, ""),
    spaces: (s) => s.replace(/[ \t ]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim(),
    emoji: (s) => s.replace(EMOJI, "").replace(/[ \t]{2,}/g, " "),
    links: (s) => s.replace(URLRE, "").replace(/[ \t]{2,}/g, " "),
    punct: (s) => s.replace(/(?<=[؀-ۿ]\s?),/g, "،").replace(/(?<=[؀-ۿ]\s?);/g, "؛").replace(/(?<=[؀-ۿ]\s?)\?/g, "؟"),
    hashtag: (s) => s.split("\n").map((l) => l.trim() ? "#" + l.trim().replace(/[#]/g, "").replace(/[^\p{L}\p{N}\s_]/gu, "").trim().replace(/\s+/g, "_") : l).join("\n"),
    dots: (s) => s.replace(/\n{2,}/g, "\n.\n")
  };

  function stats() {
    const s = t.value;
    const words = (s.match(/[\p{L}\p{N}_'-]+/gu) || []).length;
    const tags = s.match(/#[\p{L}\p{N}_]+/gu) || [];
    const mentions = s.match(/@[\w.]+/g) || [];
    const links = s.match(URLRE) || [];
    const sentences = s.split(/[.!?؟。\n]+/).filter((x) => x.trim()).length;
    const chars = [...s].length;
    const box = (v, l) => `<div style="background:var(--surface-2);border-radius:12px;padding:12px;text-align:center"><strong style="display:block;font-size:1.3rem;color:var(--gold)">${fmtNum(v)}</strong><span class="small muted">${l}</span></div>`;
    $("#stats").innerHTML = box(chars, "حرف") + box(words, "كلمة") + box(sentences, "جملة") + box(Math.max(words ? 1 : 0, Math.ceil(words / 180)), "دقيقة قراءة");
    const lim = (v, max, l) => { const p = Math.min(100, (v / max) * 100); const c = v > max ? "var(--danger)" : p > 85 ? "var(--warn)" : "var(--success)";
      return `<div class="mb-2"><div class="flex between small"><span>${l}</span><span style="color:${c}">${fmtNum(v)} / ${fmtNum(max)}</span></div><div class="meter mt-1"><i style="width:${p}%;background:${c}"></i></div></div>`; };
    $("#limits").innerHTML = lim(chars, 2200, "كابشن إنستغرام") + lim(tags.length, 30, "هاشتاغات إنستغرام") + lim(chars, 280, "تغريدة إكس") + lim(chars, 150, "البايو");
    const uniq = (a) => [...new Set(a)];
    $("#extract").innerHTML = !s.trim() ? "اكتب نصاً لاستخراج الهاشتاغات والإشارات والروابط." :
      [["الهاشتاغات", uniq(tags)], ["الإشارات", uniq(mentions)], ["الروابط", uniq(links)]].map(([l, arr]) => `<div class="mb-2"><div class="flex between items-center"><strong style="color:var(--text)">${l} (${arr.length})</strong>${arr.length ? `<button class="btn btn-ghost btn-sm" data-copy="${esc(arr.join(" "))}">${ic("copy")}نسخ</button>` : ""}</div>
        ${arr.length ? `<div class="tags mt-1">${arr.map((x) => `<span class="tag-link ltr">${esc(x)}</span>`).join("")}</div>` : '<span class="small">لا يوجد</span>'}</div>`).join("");
    icons();
    store.set("text-draft", s);
  }

  $("#ops").addEventListener("click", (e) => {
    const b = e.target.closest("[data-op]"); if (!b) return;
    const before = t.value; const after = OPS[b.dataset.op](before);
    if (after === before) { toast("لا يوجد ما يُغيَّر", "info"); return; }
    history.push(before); $("#undo").disabled = false; t.value = after; stats();
  });
  $("#undo").addEventListener("click", () => { if (history.length) t.value = history.pop(); $("#undo").disabled = !history.length; stats(); });
  $("#copy").addEventListener("click", () => copy(t.value));
  $("#clear").addEventListener("click", () => { if (t.value) history.push(t.value); $("#undo").disabled = !history.length; t.value = ""; stats(); });
  t.addEventListener("input", stats);
  stats();

  /* ---------- Hijri converter ---------- */
  const HM = ["محرّم", "صفر", "ربيع الأول", "ربيع الآخر", "جمادى الأولى", "جمادى الآخرة", "رجب", "شعبان", "رمضان", "شوال", "ذو القعدة", "ذو الحجة"];
  $("#hm").innerHTML = HM.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("");
  const hParts = (d) => {
    const p = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", { day: "numeric", month: "numeric", year: "numeric", timeZone: "UTC" }).formatToParts(d);
    const g = (t) => +p.find((x) => x.type === t).value; return { d: g("day"), m: g("month"), y: g("year") };
  };
  const gFmt = (d) => new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  const hFmt = (d) => new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura-nu-latn", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
  const setRes = (html) => { $("#dres span").innerHTML = html; };

  function g2h() {
    const v = $("#gdate").value; if (!v) return setRes("—");
    const d = new Date(v + "T00:00:00Z"); setRes(`<strong>${hFmt(d)}</strong>`);
  }
  function h2g() {
    const D = +$("#hd").value, Mo = +$("#hm").value, Y = +$("#hy").value;
    if (!D || !Y) return setRes("أدخل اليوم والسنة الهجرية");
    // estimate then search ±60 days
    const est = Date.UTC(622, 6, 16) + ((Y - 1) * 354.367 + (Mo - 1) * 29.53 + (D - 1)) * 864e5;
    for (let k = -60; k <= 60; k++) {
      const d = new Date(est + k * 864e5); const p = hParts(d);
      if (p.y === Y && p.m === Mo && p.d === D) return setRes(`<strong>${gFmt(d)}</strong>`);
    }
    setRes("تاريخ غير صالح (هذا الشهر قد يكون 29 يوماً فقط)");
  }
  $$("#dmode [data-d]").forEach((b) => b.addEventListener("click", () => {
    $$("#dmode [data-d]").forEach((x) => x.classList.toggle("active", x === b));
    $("#g2h").hidden = b.dataset.d !== "g2h"; $("#h2g").hidden = b.dataset.d !== "h2g";
    b.dataset.d === "g2h" ? g2h() : h2g();
  }));
  const today = new Date();
  $("#gdate").value = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const th = hParts(new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())));
  $("#hd").value = th.d; $("#hm").value = th.m; $("#hy").value = th.y;
  $("#gdate").addEventListener("input", g2h);
  ["#hd", "#hm", "#hy"].forEach((s) => $(s).addEventListener("input", h2g));
  g2h();
})();
