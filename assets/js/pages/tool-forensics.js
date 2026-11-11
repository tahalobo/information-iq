(function () {
  const { $, $$, esc, ic, icons, toast, fmtBytes, dropzone, download, modal } = App;
  const T = window.Tamper;
  let R = null, mode = "regions", gainEla = 1, gainNoise = 1, cloneSens = 1;

  const STEPS = ["decode", "ela", "noise", "clone", "meta"];
  const EXPLAIN = {
    regions: "رتّبنا هنا ما وجدته كل الاختبارات. المربعات الملوّنة هي المناطق التي تستحق أن تدقق فيها بعينك. اسحب الشريط لتقارن مع الأصل.",
    ela: "المناطق المتشابهة يجب أن تلمع بالقدر نفسه. إذا لمع جسم أو نص أكثر بكثير من محيطه المشابه له، فربما أُضيف لاحقاً. الحواف والنصوص تلمع طبيعياً.",
    noise: "الألوان الدافئة = ضوضاء أعلى. ابحث عن «بقعة» تختلف عن جاراتها في منطقة هادئة (سماء، جدار، بشرة): أنعم بكثير أو أخشن بكثير.",
    clone: "الخطوط تربط كل جزء بنسخته. إذا ربطت الخطوط بين جزأين من شخص أو دخان أو حشد، فقد نُسخ الجزء ولُصق. البلاط والنقوش المتكررة طبيعياً ليست دليلاً.",
    orig: "الصورة كما هي، بدون أي تحليل."
  };
  const COLORS = { ela: "#f2c25b", noise: "#3fe0c8", clone: "#ff7a6b" };

  /* ---------- Upload ---------- */
  dropzone($("#dz"), $("#file"), (files) => { const f = files.find((x) => x.type.startsWith("image/")) || files[0]; if (f) run(f); });
  $("#again").addEventListener("click", () => { $("#workspace").hidden = true; $("#upload").hidden = false; R = null; scrollTo({ top: $("#upload").getBoundingClientRect().top + scrollY - 120, behavior: "smooth" }); });

  async function run(file) {
    if (!file.type.startsWith("image/") && !/\.(jpe?g|png|webp)$/i.test(file.name)) { toast("اختر ملف صورة", "image-off"); return; }
    $("#upload").hidden = true; $("#workspace").hidden = true; $("#progress").hidden = false;
    $$("#steps li").forEach((li) => li.className = "");
    try {
      const pv = await createImageBitmap(file), c = $("#pg-thumb"), s = Math.min(1, 220 / Math.max(pv.width, pv.height));
      c.width = pv.width * s; c.height = pv.height * s; c.getContext("2d").drawImage(pv, 0, 0, c.width, c.height);
    } catch { /* preview optional */ }
    try {
      R = await T.analyze(file, (k) => {
        const i = STEPS.indexOf(k);
        $$("#steps li").forEach((li, j) => li.className = j < i || k === "done" ? "done" : j === i ? "on" : "");
      });
    } catch (e) {
      $("#progress").hidden = true; $("#upload").hidden = false;
      toast("تعذّر قراءة هذه الصورة. جرّب صيغة JPG أو PNG", "alert-triangle"); return;
    }
    await new Promise((r) => setTimeout(r, 350));
    $("#progress").hidden = true; $("#workspace").hidden = false;
    autoGains(); paintOrig(); setMode("regions"); renderVerdict(); renderInfo(); renderThumb();
    icons(); if (window.FX) FX.refresh($("#workspace"));
    const y = $("#workspace").getBoundingClientRect().top + scrollY - 100; window.FX ? FX.scrollTo(y) : scrollTo({ top: y, behavior: "smooth" });
  }

  /* ---------- Viewer ---------- */
  const pct = (arr, p) => { const s = Float32Array.from(arr).sort(); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 1; };
  function autoGains() {
    const sample = R.elaDiff.length > 400000 ? R.elaDiff.filter((_, i) => i % 7 === 0) : R.elaDiff;
    gainEla = 235 / Math.max(4, pct(sample, .995));
    gainNoise = 220 / Math.max(1, pct(R.noise.blocks, .97));
  }
  function paintOrig() {
    const { base } = R, o = $("#cv-orig"), m = $("#cv-map");
    o.width = m.width = base.w; o.height = m.height = base.h;
    o.getContext("2d").drawImage(base.c, 0, 0);
    $("#stage").style.aspectRatio = `${base.w} / ${base.h}`;
  }
  function drawMap() {
    const { base } = R, m = $("#cv-map"), x = m.getContext("2d");
    x.clearRect(0, 0, m.width, m.height);
    if (mode === "ela") x.drawImage(T.heatCanvas(R.elaDiff, base.w, base.h, gainEla), 0, 0);
    else if (mode === "noise") x.drawImage(T.blockHeat(R.noise.blocks, R.noise.bw, R.noise.bh, gainNoise, base.w, base.h), 0, 0);
    else if (mode === "clone") x.drawImage(T.cloneCanvas(R.src, R.clone), 0, 0, base.w, base.h);
    else if (mode === "regions") drawRegions(x);
  }
  function allRegions() {
    const k = R.base.s, out = [];
    R.ela.regions.forEach((r, i) => out.push({ ...r, kind: "ela", label: `مستوى خطأ ${i + 1}` }));
    R.noise.regions.forEach((r, i) => out.push({ ...r, kind: "noise", label: `ضوضاء ${i + 1}` }));
    R.clone.found.forEach((f, i) => { out.push({ ...f.src, x: f.src.x * k, y: f.src.y * k, w: f.src.w * k, h: f.src.h * k, kind: "clone", label: `أصل ${i + 1}` }); out.push({ x: f.dst.x * k, y: f.dst.y * k, w: f.dst.w * k, h: f.dst.h * k, kind: "clone", label: `نسخة ${i + 1}` }); });
    return out;
  }
  function drawRegions(x) {
    const { base } = R, W = base.w, H = base.h, regs = allRegions(), lw = Math.max(2, W / 320);
    x.drawImage(base.c, 0, 0); x.fillStyle = "rgba(3,5,12,.62)"; x.fillRect(0, 0, W, H);
    regs.forEach((r) => {
      const pad = lw * 3, rx = Math.max(0, r.x - pad), ry = Math.max(0, r.y - pad), rw = Math.min(W - rx, r.w + pad * 2), rh = Math.min(H - ry, r.h + pad * 2);
      x.drawImage(base.c, rx, ry, rw, rh, rx, ry, rw, rh);
      x.save(); x.shadowColor = COLORS[r.kind]; x.shadowBlur = lw * 8; x.strokeStyle = COLORS[r.kind]; x.lineWidth = lw; x.strokeRect(rx, ry, rw, rh); x.restore();
      const fs = Math.max(13, W / 55); x.font = `700 ${fs}px "IBM Plex Sans Arabic", sans-serif`; x.direction = "rtl";
      const tw = x.measureText(r.label).width + fs; const ly = ry > fs * 1.8 ? ry - fs * 1.6 : ry + rh + 4;
      x.fillStyle = COLORS[r.kind]; x.beginPath(); x.roundRect ? x.roundRect(rx + rw - tw, ly, tw, fs * 1.45, fs * .4) : x.rect(rx + rw - tw, ly, tw, fs * 1.45); x.fill();
      x.fillStyle = "#160f02"; x.textAlign = "right"; x.fillText(r.label, rx + rw - fs / 2, ly + fs * 1.08);
    });
    if (!regs.length) {
      const fs = Math.max(16, W / 34); x.font = `700 ${fs}px "IBM Plex Sans Arabic", sans-serif`; x.textAlign = "center"; x.direction = "rtl";
      x.fillStyle = "rgba(69,214,154,.95)"; x.fillText("✓ لم تظهر مناطق مشبوهة", W / 2, H / 2);
    }
  }

  function controls() {
    const box = $("#controls");
    if (mode === "ela") box.innerHTML = `<label class="fz-ctl">${ic("sun-medium")}<span>التضخيم</span><input type="range" id="c-gain" min="0.3" max="3" step="0.05" value="1"></label>
      <label class="fz-ctl">${ic("gauge")}<span>جودة إعادة الحفظ</span><select class="select" id="c-q">${[75, 85, 90, 95].map((q) => `<option value="${q}"${Math.round(R.elaQuality * 100) === q ? " selected" : ""}>${q}%</option>`).join("")}${[75, 85, 90, 95].includes(Math.round(R.elaQuality * 100)) ? "" : `<option selected value="${Math.round(R.elaQuality * 100)}">${Math.round(R.elaQuality * 100)}% (تلقائي)</option>`}</select></label>`;
    else if (mode === "noise") box.innerHTML = `<label class="fz-ctl">${ic("sun-medium")}<span>التضخيم</span><input type="range" id="c-gain" min="0.3" max="3" step="0.05" value="1"></label>`;
    else if (mode === "clone") box.innerHTML = `<div class="fz-ctl">${ic("crosshair")}<span>الحساسية</span><div class="seg" id="c-sens"><button data-s="1" class="${cloneSens === 1 ? "active" : ""}">عادية</button><button data-s="1.7" class="${cloneSens > 1 ? "active" : ""}">عالية</button></div></div><span class="small muted">${R.clone.found.length ? `${R.clone.found.length} ${R.clone.found.length === 1 ? "تطابق" : "تطابقات"}` : "لا تطابقات"}</span>`;
    else if (mode === "regions") box.innerHTML = `<div class="fz-legend"><span style="--c:${COLORS.ela}">مستوى الخطأ</span><span style="--c:${COLORS.noise}">الضوضاء</span><span style="--c:${COLORS.clone}">منسوخ</span></div>`;
    else box.innerHTML = "";
    icons();
    const base = { ela: gainEla, noise: gainNoise };
    const g = $("#c-gain"); if (g) g.addEventListener("input", () => { if (mode === "ela") gainEla = base.ela * g.value; else gainNoise = base.noise * g.value; drawMap(); });
    const q = $("#c-q"); if (q) q.addEventListener("change", async () => {
      R.elaQuality = q.value / 100; toast("نعيد تحليل مستوى الخطأ…", "loader");
      R.elaDiff = await T.ela(R.base, R.elaQuality); R.ela = T.elaRegions(R.elaDiff, T.luma(R.base.data, R.base.w * R.base.h), R.base.w, R.base.h);
      autoGains(); drawMap(); renderVerdict();
    });
    const s = $("#c-sens"); if (s) s.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-s]"); if (!b) return; cloneSens = +b.dataset.s; toast("نعيد البحث عن الأجزاء المنسوخة…", "loader");
      R.clone = await T.clones(R.src, cloneSens); drawMap(); controls(); renderVerdict();
    });
  }
  function setMode(m) {
    mode = m;
    $$("#modes button").forEach((b) => b.classList.toggle("active", b.dataset.m === m));
    $("#stage").classList.toggle("only-orig", m === "orig");
    $("#explain").textContent = EXPLAIN[m];
    drawMap(); controls();
  }
  $("#modes").addEventListener("click", (e) => { const b = e.target.closest("[data-m]"); if (b) setMode(b.dataset.m); });

  /* compare slider */
  const stage = $("#stage"); let drag = false;
  const setSplit = (clientX) => {
    const r = stage.getBoundingClientRect(), p = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
    stage.style.setProperty("--split", `${p}%`); $("#handle").setAttribute("aria-valuenow", Math.round(p));
  };
  stage.addEventListener("pointerdown", (e) => { drag = true; stage.setPointerCapture(e.pointerId); setSplit(e.clientX); });
  stage.addEventListener("pointermove", (e) => { if (drag) setSplit(e.clientX); });
  stage.addEventListener("pointerup", () => { drag = false; });
  $("#handle").addEventListener("keydown", (e) => {
    const cur = parseFloat(getComputedStyle(stage).getPropertyValue("--split")) || 50, d = e.key === "ArrowLeft" ? -5 : e.key === "ArrowRight" ? 5 : 0;
    if (d) { e.preventDefault(); stage.style.setProperty("--split", `${Math.max(0, Math.min(100, cur + d))}%`); }
  });

  $("#dl-view").addEventListener("click", () => {
    const c = mode === "orig" ? $("#cv-orig") : $("#cv-map");
    c.toBlob((b) => b && download(b, `forensics-${mode}.png`), "image/png");
  });
  $("#full-view").addEventListener("click", () => {
    const c = mode === "orig" ? $("#cv-orig") : $("#cv-map");
    modal(`<img src="${c.toDataURL("image/jpeg", .92)}" alt="" style="width:100%;border-radius:16px"><p class="small muted mt-2 mb-0">${esc(EXPLAIN[mode])}</p>`);
  });

  /* ---------- Verdict & tests ---------- */
  const STATUS = { ok: ["check-circle-2", "text-success", "سليم"], warn: ["alert-triangle", "text-warn", "يستحق التدقيق"], bad: ["octagon-alert", "text-danger", "مؤشر قوي"], na: ["minus-circle", "muted", "غير حاسم"] };
  const JUMP = { ela: "ela", noise: "noise", clone: "clone", thumb: "thumb" };
  function renderVerdict() {
    R.verdict = T.verdict(R);
    const v = R.verdict, L = {
      low: ["لا مؤشرات واضحة على التعديل", "لم تُظهر الاختبارات علامات تزوير واضحة. هذا لا يضمن أن الصورة أصلية، فتحقق أيضاً من سياقها ومصدرها.", "var(--success)"],
      mid: ["مؤشرات تستحق التدقيق", "ظهرت علامات قد تعني تعديلاً، أو قد تكون بسبب الضغط والفلاتر. افحص المناطق المميّزة بعينك.", "var(--warn)"],
      high: ["مؤشرات قوية على التعديل", "عدة اختبارات تشير إلى أن الصورة عُدّلت بعد التقاطها. لا تنشرها قبل التأكد من مصدرها الأصلي.", "var(--danger)"]
    }[v.level];
    const C = 2 * Math.PI * 52;
    $("#verdict").innerHTML = `<div class="fz-ring" style="--col:${L[2]}"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52"/><circle cx="60" cy="60" r="52" class="p" style="stroke-dasharray:${C};stroke-dashoffset:${C * (1 - v.score / 100)}"/></svg><b>${v.score}</b><small>من 100</small></div>
      <div><span class="kicker">مؤشر التعديل</span><h2 style="color:${L[2]}">${L[0]}</h2><p class="mb-0">${L[1]}</p></div>`;
    $("#tests").innerHTML = `<div class="card-title"><span class="ico ico-sm">${ic("list-checks")}</span><h3>نتائج الاختبارات</h3></div>
      <ul class="fz-tests">${v.tests.map((t) => { const s = STATUS[t.status]; return `<li class="${t.status}"${JUMP[t.id] ? ` data-jump="${JUMP[t.id]}" tabindex="0"` : ""}>
        <span class="${s[1]}">${ic(s[0])}</span><div><strong>${esc(t.title)}</strong><small class="${s[1]}">${s[2]}</small><p>${esc(t.detail)}</p></div></li>`; }).join("")}</ul>`;
    icons();
  }
  $("#tests").addEventListener("click", (e) => {
    const li = e.target.closest("[data-jump]"); if (!li) return;
    if (li.dataset.jump === "thumb") { const c = $("#thumb-card"); if (!c.hidden) c.scrollIntoView({ behavior: "smooth", block: "center" }); return; }
    setMode(li.dataset.jump); $(".fz-viewer-card").scrollIntoView({ behavior: "smooth", block: "start" });
  });

  function renderInfo() {
    const m = R.meta, j = R.jpeg, f = R.file;
    const d = (x) => x ? new Intl.DateTimeFormat("ar-IQ-u-nu-latn", { dateStyle: "medium", timeStyle: "short" }).format(x) : "";
    const rows = [
      ["الاسم", `<span class="ltr">${esc(f.name)}</span>`], ["الأبعاد", `<span class="ltr">${R.src.width} × ${R.src.height}</span>`], ["الحجم", fmtBytes(f.size)],
      ["الصيغة", j.fmt], j.quality ? ["جودة JPEG (تقديرية)", `${j.quality}%${j.quality < 80 ? " · مضغوطة مسبقاً" : ""}`] : null,
      m.make ? ["الجهاز", esc(m.make)] : null, m.software ? ["البرنامج", `${esc(m.software)}${m.editor ? ` <span class="badge badge-warn">تعديل</span>` : ""}`] : null,
      m.taken ? ["تاريخ التصوير", d(m.taken)] : null, m.modified ? ["آخر حفظ", d(m.modified)] : null,
      ["تحليلنا تم على", R.base.s < 1 ? `نسخة مصغّرة ${R.base.w}×${R.base.h}` : "الدقة الكاملة"]
    ].filter(Boolean);
    $("#info").innerHTML = rows.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join("");
  }
  function renderThumb() {
    const t = R.thumb, card = $("#thumb-card");
    card.hidden = !t; if (!t) return;
    $("#th-old").src = t.url;
    const c = $("#th-now"); c.width = t.w; c.height = t.h; c.getContext("2d").drawImage(R.src, 0, 0, t.w, t.h);
    card.classList.toggle("mismatch", t.diff > 22 || t.aspectDiff > .06);
  }
})();
