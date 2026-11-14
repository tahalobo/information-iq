(function () {
  const { $, $$, esc, ic, icons, toast, fmtBytes, fmtDate, dropzone, copy } = App;
  const M = window.ImgMeta;
  // على localhost نستخدم العامل المحلي (node worker/dev-server.mjs) إن لم يُحدَّد رابط
  const ENDPOINT = (window.SITE && SITE.reverseSearchEndpoint) || (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? "http://localhost:8787" : "");

  const ENGINES = [
    { id: "google", name: "Google Lens", ar: "غوغل لنز", color: "#4285f4", icon: "scan-search",
      best: "الأشمل: الأماكن والمنتجات والنصوص والمواقع الإخبارية.",
      url: (u) => `https://lens.google.com/uploadbyurl?url=${encodeURIComponent(u)}`, home: "https://lens.google.com/" },
    { id: "yandex", name: "Yandex", ar: "ياندكس", color: "#fc3f1d", icon: "user-search",
      best: "الأقوى في مطابقة الوجوه والأشخاص والصور المعدّلة.",
      url: (u) => `https://yandex.com/images/search?rpt=imageview&url=${encodeURIComponent(u)}`, home: "https://yandex.com/images/" },
    { id: "bing", name: "Bing Visual Search", ar: "بنغ", color: "#008373", icon: "search",
      best: "نتائج جيدة للمنتجات والمشاهير والصور المتشابهة.",
      url: (u) => `https://www.bing.com/images/search?view=detailv2&iss=sbi&q=imgurl:${encodeURIComponent(u)}`, home: "https://www.bing.com/visualsearch" },
    { id: "tineye", name: "TinEye", ar: "تين آي", color: "#a855f7", icon: "history",
      best: "مثالي لمعرفة أقدم ظهور للصورة: رتّب النتائج بـ Oldest.",
      url: (u) => `https://tineye.com/search?url=${encodeURIComponent(u)}&sort=crawl_date&order=asc`, home: "https://tineye.com/" }
  ];

  let mode = "file", file = null, imgUrl = null, sel = null, remoteUrl = "", runId = 0;

  /* ---------- Mode switch ---------- */
  $$("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    $$("[data-mode]").forEach((x) => x.classList.toggle("active", x === b));
    $("#mode-file").hidden = mode !== "file"; $("#mode-url").hidden = mode !== "url";
    refresh();
  }));

  /* ---------- File mode ---------- */
  async function setFile(files) {
    const f = files.find((x) => x.type.startsWith("image/"));
    if (!f) { toast("اختر ملف صورة", "alert-triangle"); return; }
    if (mode !== "file") $('[data-mode="file"]').click();
    file = f; sel = null;
    if (imgUrl) URL.revokeObjectURL(imgUrl);
    imgUrl = URL.createObjectURL(f);
    $("#img").src = imgUrl; $("#sel").hidden = true; $("#clear-sel").disabled = true;
    $("#file-empty").hidden = true; $("#file-work").hidden = false;
    $("#results").hidden = true;
    refresh(); analyze(f);
    searchArchive(await createImageBitmap(f, { imageOrientation: "from-image" }).catch(() => null));
  }

  async function analyze(f) {
    const box = $("#analysis");
    box.innerHTML = `<div class="card-title"><span class="ico ico-sm">${ic("loader")}</span><h3>تحليل سريع…</h3></div>`; icons();
    const [d, meta] = await Promise.all([M.dims(f), M.read(f)]);
    if (d.url) URL.revokeObjectURL(d.url);
    const groups = M.group(meta).filter((g) => g.id !== "icc" && g.id !== "image");
    const fields = groups.reduce((a, g) => a + g.items.length, 0);
    const camera = groups.flatMap((g) => g.items).find((x) => x.key === "Model");
    const taken = groups.flatMap((g) => g.items).find((x) => x.key === "DateTimeOriginal");
    const hints = M.sourceHints(f, d);
    if (!fields) hints.push("لا تحتوي الصورة على ميتاداتا، وهذا شائع في الصور المنقولة من مواقع التواصل. لا يعني ذلك أنها مزيفة.");
    if (/Photoshop|GIMP|Snapseed|Lightroom|Picsart|Canva/i.test(JSON.stringify(meta.segments || {}))) hints.unshift("<strong>تنبيه:</strong> الميتاداتا تشير إلى أن الصورة مرّت على برنامج تعديل.");
    box.innerHTML = `
      <div class="card-title"><span class="ico ico-sm">${ic("microscope")}</span><h3>تحليل سريع للصورة</h3></div>
      <table class="kv"><tbody>
        <tr><th>الأبعاد</th><td><span class="ltr">${d.w} × ${d.h}</span></td></tr>
        <tr><th>الحجم</th><td>${fmtBytes(f.size)}</td></tr>
        <tr><th>الميتاداتا</th><td>${fields ? `<span class="text-warn">${fields} حقلاً</span>` : "لا توجد"}</td></tr>
        ${camera ? `<tr><th>الجهاز</th><td>${esc(camera.value)}</td></tr>` : ""}
        ${taken ? `<tr class="sensitive"><th>تاريخ الالتقاط</th><td>${esc(taken.value)}</td></tr>` : ""}
        ${meta.gps ? `<tr class="sensitive"><th>الموقع</th><td>موجود (GPS)</td></tr>` : ""}
      </tbody></table>
      ${hints.length ? `<ul class="small muted mt-2 mb-0" style="padding-inline-start:1.2em">${hints.map((h) => `<li>${h}</li>`).join("")}</ul>` : ""}
      <div class="btn-row mt-2"><a class="btn btn-ghost btn-sm" href="tool-metadata.html">${ic("scan-search")}الميتاداتا بالتفصيل</a><a class="btn btn-ghost btn-sm" href="tool-forensics.html">${ic("scan-eye")}هل عُدّلت؟</a><a class="btn btn-ghost btn-sm" href="tool-ai.html">${ic("scan-face")}هل هي ذكاء اصطناعي؟</a></div>`;
    icons();
  }

  /* Crop selection */
  (function crop() {
    const wrap = $("#crop"), img = $("#img"), box = $("#sel");
    let start = null;
    const pos = (e) => { const r = img.getBoundingClientRect(); return { x: Math.max(0, Math.min(r.width, e.clientX - r.left)), y: Math.max(0, Math.min(r.height, e.clientY - r.top)) }; };
    wrap.addEventListener("pointerdown", (e) => { if (!file) return; e.preventDefault(); wrap.setPointerCapture(e.pointerId); start = pos(e); box.hidden = false; draw(start, start); });
    wrap.addEventListener("pointermove", (e) => { if (start) draw(start, pos(e)); });
    const end = (e) => {
      if (!start) return; const p = pos(e); const s = start; start = null;
      const w = Math.abs(p.x - s.x), h = Math.abs(p.y - s.y);
      if (w < 16 || h < 16) { box.hidden = true; sel = null; $("#clear-sel").disabled = true; info(); return; }
      const k = img.naturalWidth / img.getBoundingClientRect().width;
      sel = { x: Math.round(Math.min(s.x, p.x) * k), y: Math.round(Math.min(s.y, p.y) * k), w: Math.round(w * k), h: Math.round(h * k) };
      $("#clear-sel").disabled = false; info();
    };
    wrap.addEventListener("pointerup", end); wrap.addEventListener("pointercancel", end);
    function draw(a, b) { Object.assign(box.style, { left: Math.min(a.x, b.x) + "px", top: Math.min(a.y, b.y) + "px", width: Math.abs(b.x - a.x) + "px", height: Math.abs(b.y - a.y) + "px" }); }
    function info() {
      $("#sel-info").innerHTML = sel ? `${ic("crop")} سيتم البحث عن الجزء المحدد فقط (<span class="ltr">${sel.w} × ${sel.h}</span>). اضغط «الصورة كاملة» لإلغاء التحديد.`
        : `${ic("mouse-pointer-2")} اسحب فوق الصورة لتحديد وجه أو شعار أو مبنى، فهذا يحسّن النتائج كثيراً.`;
      $$("#sel-info svg").forEach((s) => { s.style.width = "14px"; s.style.height = "14px"; s.style.display = "inline"; });
      icons(); refresh();
    }
    $("#clear-sel").addEventListener("click", () => { sel = null; box.hidden = true; $("#clear-sel").disabled = true; info(); });
  })();

  /* The image we send: crop + downscale (keeps upload small and fast) */
  async function searchCanvas(maxSide = 1280) {
    const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
    const r = sel || { x: 0, y: 0, w: bmp.width, h: bmp.height };
    const scale = Math.min(1, maxSide / Math.max(r.w, r.h));
    const c = document.createElement("canvas"); c.width = Math.max(1, Math.round(r.w * scale)); c.height = Math.max(1, Math.round(r.h * scale));
    const x = c.getContext("2d"); x.fillStyle = "#fff"; x.fillRect(0, 0, c.width, c.height);
    x.imageSmoothingQuality = "high"; x.drawImage(bmp, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height);
    return c;
  }

  /* ==========================================================
     1) أرشيف الإمبراطورية: بصمة dHash داخل المتصفح (نفس خوارزمية scripts/build-image-index.py)
     ========================================================== */
  function dhash(src, flip) {
    // 1) shrink so the long side is 256 px  2) grey  3) exact area average down to 9x8 (matches PIL's BOX filter)
    const k = Math.min(1, 256 / Math.max(src.width, src.height));
    const W = Math.max(1, Math.round(src.width * k)), H = Math.max(1, Math.round(src.height * k));
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d", { willReadFrequently: true }); x.imageSmoothingQuality = "high";
    if (flip) { x.translate(W, 0); x.scale(-1, 1); }
    x.drawImage(src, 0, 0, W, H);
    const d = x.getImageData(0, 0, W, H).data, L = new Float32Array(W * H);
    for (let i = 0; i < W * H; i++) L[i] = (d[i * 4] * 299 + d[i * 4 + 1] * 587 + d[i * 4 + 2] * 114) / 1000;
    const cell = (x0, x1, y0, y1) => {
      let s = 0, a = 0;
      for (let yy = Math.floor(y0); yy < Math.ceil(y1); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0); if (wy <= 0) continue;
        for (let xx = Math.floor(x0); xx < Math.ceil(x1); xx++) {
          const wx = Math.min(xx + 1, x1) - Math.max(xx, x0); if (wx <= 0) continue;
          s += L[yy * W + xx] * wx * wy; a += wx * wy;
        }
      }
      return s / a;
    };
    const g = [];
    for (let y = 0; y < 8; y++) for (let k2 = 0; k2 < 9; k2++) g.push(cell(k2 * W / 9, (k2 + 1) * W / 9, y * H / 8, (y + 1) * H / 8));
    let bits = 0n;
    for (let y = 0; y < 8; y++) for (let k2 = 0; k2 < 8; k2++) bits = (bits << 1n) | (g[y * 9 + k2] > g[y * 9 + k2 + 1] ? 1n : 0n);
    return bits;
  }
  const hamming = (a, b) => { let v = a ^ b, n = 0; while (v) { n += Number(v & 1n); v >>= 1n; } return n; };

  async function searchArchive(src) {
    const box = $("#archive");
    const idx = (window.IMG_INDEX && IMG_INDEX.items) || [];
    if (!src || !idx.length) { box.hidden = true; return; }
    let q, qf; try { q = dhash(src, false); qf = dhash(src, true); } catch { box.hidden = true; return; } // tainted cross-origin image
    const hits = idx.map(([id, hx, path]) => { const h = BigInt("0x" + hx); return { id, path, d: Math.min(hamming(q, h), hamming(qf, h) + 1) }; })
      .filter((x) => x.d <= 10).sort((a, b) => a.d - b.d);
    const seen = new Set(), uniq = hits.filter((x) => !seen.has(x.id) && seen.add(x.id)).slice(0, 4);
    if (!uniq.length) { box.hidden = true; return; }
    await App.ensureTG();
    const find = (id) => window.FACTS.find((f) => f.id === id) || (window.TG_ITEMS || []).find((f) => f.id === id);
    box.hidden = false;
    box.innerHTML = `<div class="rs-archive">
      <div class="rs-archive-head"><span class="ico">${ic("library")}</span><div><span class="kicker">من أرشيف الإمبراطورية</span>
        <h3>${uniq[0].d <= 6 ? "نشرنا هذه الصورة سابقاً!" : "صورة مشابهة جداً في أرشيفنا"}</h3>
        <p>عرفناها فوراً من بصمتها، دون رفعها إلى أي مكان. اقرأ ما كتبناه عنها:</p></div></div>
      <div class="rs-archive-list">${uniq.map((h) => { const f = find(h.id); return `<a class="rs-arch" href="${f ? App.factUrl(f.id) : "#"}">
        <img src="${esc(h.path)}" alt="" loading="lazy"><span><strong>${esc(f ? f.title : h.id)}</strong><small>${f ? fmtDate(f.date) + " · " : ""}${h.d <= 6 ? "تطابق شبه تام" : "تشابه كبير"}</small></span>${ic("arrow-left")}</a>`; }).join("")}</div></div>`;
    icons();
  }

  /* ==========================================================
     2) البحث في الإنترنت داخل الموقع (عبر عامل Cloudflare)
     ========================================================== */
  const DOMAINS = {
    factcheck: /(^|\.)(misbar\.com|fatabyyano\.net|factcheck\.afp\.com|snopes\.com|politifact\.com|fullfact\.org|checkyourfact\.com|leadstories\.com|factcheck\.org|tech4peace\.org|verify-sy\.com|akeed\.jo|matsda2sh\.com|annir\.net|logicallyfacts\.com|aaj\.tv\/factcheck|boomlive\.in|altnews\.in)$/,
    agency: /(^|\.)(reuters\.com|apnews\.com|ap\.org|apimages\.com|afp\.com|gettyimages\.[a-z.]+|upi\.com|epa\.eu|aa\.com\.tr|xinhuanet\.com|efe\.com|dpa\.com|pressassociation\.com|ina\.iq|wam\.ae|spa\.gov\.sa)$/,
    official: /(^|\.)([a-z0-9-]+\.gov|gov\.[a-z]{2}|[a-z0-9-]+\.gov\.[a-z]{2}|whitehouse\.gov|un\.org|who\.int|nato\.int|europa\.eu|pmo\.iq|presidency\.iq|mofa\.gov\.iq)$/,
    news: /(^|\.)(bbc\.(com|co\.uk)|cnn\.com|aljazeera\.(net|com)|alarabiya\.net|skynewsarabia\.com|nytimes\.com|theguardian\.com|washingtonpost\.com|france24\.com|dw\.com|euronews\.com|independentarabia\.com|alhurra\.com|rudaw\.net|shafaq\.com|alsumaria\.tv|kurdistan24\.net|youm7\.com|ahram\.org\.eg|aawsat\.com|alquds\.co\.uk|annahar\.com|rt\.com|bloomberg\.com|wsj\.com|ft\.com|apnews\.com|nbcnews\.com|cbsnews\.com|abcnews\.go\.com|foxnews\.com|politico\.com|axios\.com|time\.com|npr\.org|yahoo\.com|msn\.com|elaph\.com|964\.media|baghdadtoday\.news|almadapaper\.net|alsabaah\.iq|nasnews\.com|thenationalnews\.com|middleeasteye\.net|arabnews\.com|asharq\.com)$/,
    social: /(^|\.)(facebook\.com|fb\.com|instagram\.com|x\.com|twitter\.com|tiktok\.com|t\.me|telegram\.(me|org)|youtube\.com|reddit\.com|pinterest\.[a-z.]+|threads\.(net|com)|vk\.com|linkedin\.com|snapchat\.com|tumblr\.com)$/,
    stock: /(^|\.)(shutterstock\.com|alamy\.com|istockphoto\.com|dreamstime\.com|depositphotos\.com|123rf\.com|stock\.adobe\.com|pexels\.com|unsplash\.com|pixabay\.com|freepik\.com)$/,
    wiki: /(^|\.)(wikipedia\.org|wikimedia\.org|wikidata\.org)$/
  };
  const KIND = { factcheck: ["تدقيق حقائق", "badge-success", "badge-check"], agency: ["وكالة أنباء", "badge-info", "radio-tower"], official: ["جهة رسمية", "badge-info", "landmark"], news: ["موقع إخباري", "badge-info", "newspaper"], social: ["تواصل اجتماعي", "badge-warn", "users"], stock: ["صور مخزّنة", "", "images"], wiki: ["ويكيبيديا", "", "book-open"], other: ["موقع", "", "globe"] };
  const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
  const kindOf = (u) => { const h = hostOf(u); if (/\/fact-?check/i.test(u)) return "factcheck"; for (const k of Object.keys(DOMAINS)) if (DOMAINS[k].test(h)) return k; return "other"; };
  const ago = (iso) => {
    const d = (Date.now() - new Date(iso)) / 864e5;
    if (d < 1) return "اليوم"; if (d < 2) return "أمس"; if (d < 30) return `قبل ${Math.round(d)} يوماً`;
    if (d < 365) { const m = Math.round(d / 30); return m === 1 ? "قبل شهر" : m === 2 ? "قبل شهرين" : `قبل ${m} أشهر`; }
    const y = Math.round(d / 365 * 10) / 10; return y < 2 ? "قبل سنة" : `قبل ${y.toString().replace(".0", "")} سنوات`;
  };
  const fav = (u) => `https://icons.duckduckgo.com/ip3/${encodeURIComponent(hostOf(u))}.ico`;
  // نتائج البحث تأتي من خادم خارجي: لا نضع في href إلا روابط http/https
  const href = (u) => esc(App.safeUrl(u) || "#");
  const im = (src, cls = "") => `<img class="${cls}" src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-err="wrap">`;

  const DATE_PAGES = 48, DATE_CHUNK = 8;
  const api = (path, body) => fetch(ENDPOINT.replace(/\/+$/, "") + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const preview = () => (mode === "file" ? `<img src="${imgUrl}" alt="">` : `<img src="${esc(remoteUrl)}" alt="" referrerpolicy="no-referrer">`);
  let S = null; // حالة آخر بحث: الصفحات + تقدّم قراءة التواريخ

  async function webSearch() {
    if (!ENDPOINT) return;
    const my = ++runId, res = $("#results");
    res.hidden = false;
    res.innerHTML = `<div class="rs-scan card">
      <div class="rs-scan-vis"><span class="rs-radar big"><i></i><i></i><i></i></span>${preview()}</div>
      <div><span class="kicker">التحقيق جارٍ</span><h2>نبحث عن الصورة في الإنترنت…</h2>
      <ol class="fz-steps" id="rs-steps"><li class="on">نجهّز الصورة</li><li>نبحث في فهرس صور الإنترنت</li><li>نجمع الصفحات والنسخ</li></ol></div></div>`;
    icons(); res.scrollIntoView({ behavior: "smooth", block: "start" });
    const steps = $$("#rs-steps li"), at = (i) => steps.forEach((li, j) => (li.className = j < i ? "done" : j === i ? "on" : ""));
    const timer = setTimeout(() => at(2), 2500);
    let data;
    try {
      let body;
      if (mode === "file") { const c = await searchCanvas(1280); body = { image: c.toDataURL("image/jpeg", .86) }; }
      else body = { url: remoteUrl };
      at(1);
      const r = await api("", body);
      data = await r.json().catch(() => ({ error: "bad" }));
      if (!r.ok || data.error) throw Object.assign(new Error(data.error || "http"), { data });
    } catch (e) {
      clearTimeout(timer); if (my !== runId) return;
      const err = e.data?.error;
      const msg = err === "too-large" ? "الصورة كبيرة جداً. حدّد جزءاً منها وأعد المحاولة."
        : err === "blocked" ? "محرك البحث مشغول الآن ورفض الطلب مؤقتاً. أعد المحاولة بعد دقيقة، أو استخدم المحركات الخارجية بالأسفل."
        : err === "parse" ? "تغيّر شكل نتائج محرك البحث ولم نستطع قراءتها. استخدم المحركات الخارجية بالأسفل حتى نحدّث الأداة."
        : "تعذّر الاتصال بخدمة البحث الآن. تحقق من اتصالك، أو استخدم المحركات الخارجية بالأسفل.";
      res.innerHTML = `<div class="alert alert-warn">${ic("alert-triangle")}<div><strong>لم يكتمل البحث</strong><p>${msg}</p><button class="btn btn-ghost btn-sm mt-1" id="rs-retry">${ic("rotate-ccw")}أعد المحاولة</button></div></div>`;
      $("#rs-retry").addEventListener("click", webSearch);
      $("#engines-wrap").open = true; icons(); return;
    }
    clearTimeout(timer); if (my !== runId) return;
    render(data); loadDates(my);
  }
  $("#web-go").addEventListener("click", webSearch);

  /* ---------- Results ---------- */
  function render(d) {
    const pages = d.pages.map((p, i) => ({ ...p, i, host: p.host || hostOf(p.url), kind: kindOf(p.url), date: "", site: "", checked: false }));
    S = { d, pages, loading: pages.length > 0 };

    // نسخ الصورة: من الصفحات ومن «أحجام أخرى»، الأعلى دقة أولاً
    const seen = new Set();
    const copies = [...pages.filter((p) => p.img).map((p) => ({ src: p.thumb || p.img, url: p.img, w: p.w, h: p.h })), ...d.sizes.map((s) => ({ src: s.url, url: s.url, w: s.w, h: s.h }))]
      .filter((c) => !seen.has(c.url) && seen.add(c.url)).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 36);
    S.copies = copies.length;

    const R = $("#results");
    R.innerHTML = `
      <div id="rs-v"></div>
      <div id="rs-fc"></div>
      ${d.tags.length || d.text ? `<div class="rs-block"><div class="rs-h"><span class="ico ico-sm">${ic("sparkles")}</span><h3>ماذا في الصورة؟</h3></div>
        ${d.tags.length ? `<div class="rs-entities">${d.tags.map((t) => `<span style="--w:1">${esc(t)}</span>`).join("")}</div>` : ""}
        ${d.text ? `<p class="rs-guess mt-1">نص مقروء في الصورة: <strong>${esc(d.text)}</strong></p>` : ""}</div>` : ""}
      <div id="rs-t"></div>
      ${copies.length ? `<div class="rs-block"><div class="rs-h"><span class="ico ico-sm">${ic("copy")}</span><h3>نسخ الصورة في الإنترنت</h3></div>
        <p class="small muted">النسخة الأعلى دقة أقرب غالباً إلى الأصل. قارنها بصورتك: هل قُصّت أو عُدّلت؟</p>
        <div class="rs-grid">${copies.map((c, i) => `<a class="${i === 0 && c.w ? "best" : ""}" href="${href(c.url)}" target="_blank" rel="noopener noreferrer" data-img>${im(c.src)}<span class="rs-res">${+c.w ? `${+c.w}×${+c.h}` : ""}</span></a>`).join("")}</div></div>` : ""}
      ${d.similar.length ? `<div class="rs-block"><div class="rs-h"><span class="ico ico-sm">${ic("layout-grid")}</span><h3>صور مشابهة <small class="muted">ليست الصورة نفسها</small></h3></div>
        <div class="rs-grid similar">${d.similar.map((s) => `<a href="${href(s.url || s.thumb)}" target="_blank" rel="noopener noreferrer" title="${esc(s.title)}" data-img>${im(s.thumb)}</a>`).join("")}</div></div>` : ""}`;
    paint();
    if (window.FX) FX.refresh(R);
  }

  /* ما يتغيّر مع وصول التواريخ: الخلاصة + مدققو الحقائق + الخط الزمني */
  function summary() {
    const { pages } = S;
    const dated = pages.filter((p) => p.date).sort((a, b) => a.date.localeCompare(b.date));
    const undated = pages.filter((p) => !p.date);
    const oldest = dated[0];
    const count = (k) => pages.filter((p) => p.kind === k).length;
    const trusted = count("agency") + count("news") + count("official");
    const fc = pages.filter((p) => p.kind === "factcheck");
    const ageDays = oldest ? (Date.now() - new Date(oldest.date)) / 864e5 : 0;
    let tone = "info", head, text;
    if (fc.length) { tone = "fact"; head = "مدققو الحقائق تناولوا هذه الصورة"; text = "اقرأ ما توصلوا إليه بالأسفل قبل أي شيء آخر."; }
    else if (!pages.length) { tone = "warn"; head = "لم نعثر على الصورة في الإنترنت"; text = "قد تكون جديدة جداً أو حصرية، وقد تكون مولّدة أو معدّلة بحيث لا تطابق أي صورة منشورة. جرّب تحديد جزء منها (وجه أو لافتة)، وافحصها بأداتي كشف التعديل والذكاء الاصطناعي."; }
    else if (oldest && ageDays > 365) { tone = "warn"; head = `الصورة قديمة: أقدم ظهور وجدناه ${ago(oldest.date)}`; text = `ظهرت في ${oldest.site || oldest.host} بتاريخ ${fmtDate(oldest.date.slice(0, 10))}. إذا كانت تُتداول الآن على أنها حدث جديد، فهي على الأرجح مضللة.`; }
    else if (trusted) { tone = "ok"; head = `منشورة في ${trusted} ${trusted > 2 && trusted <= 10 ? "مصادر إخبارية موثوقة" : "مصدراً إخبارياً موثوقاً"}`; text = "ظهورها في وكالات الأنباء والمواقع الإخبارية مؤشر قوي على أنها حقيقية. تأكد فقط أن التاريخ والمكان يطابقان ما يُقال عنها."; }
    else { tone = "info"; head = `ظهرت في ${pages.length} ${pages.length > 2 && pages.length <= 10 ? "صفحات" : "صفحة"}، أغلبها غير إخباري`; text = "لم تنشرها مصادر إخبارية معروفة. ابحث عن أقدم ظهور لها بالأسفل، وتعامل معها بحذر."; }
    return { dated, undated, oldest, trusted, fc, social: count("social"), tone, head, text };
  }

  function paint() {
    if (!S) return;
    const { d, pages, loading } = S, s = summary();
    const stat = (n, l, i) => `<div class="rs-stat"><span>${ic(i)}</span><b>${n}</b><small>${l}</small></div>`;
    const done = pages.filter((p) => p.checked).length, total = Math.min(pages.length, DATE_PAGES);

    $("#rs-v").innerHTML = `<div class="rs-verdict ${s.tone}">
        <div class="rs-verdict-img">${preview()}</div>
        <div class="rs-verdict-body">
          <span class="kicker">النتيجة</span><h2>${esc(s.head)}</h2><p>${esc(s.text)}</p>
          <div class="rs-stats">${stat(pages.length, "صفحة تحتوي الصورة", "globe")}${stat(S.copies, "نسخة من الصورة", "copy")}${stat(s.trusted, "مصدر إخباري", "newspaper")}${stat(s.social, "تواصل اجتماعي", "users")}</div>
          <div class="btn-row mt-2"><button class="btn btn-ghost btn-sm" id="rs-copy">${ic("clipboard-copy")}نسخ ملخص التحقق</button><button class="btn btn-ghost btn-sm" id="rs-again">${ic("rotate-ccw")}بحث جديد</button>
            ${loading ? `<span class="small muted">${ic("loader")} نقرأ تواريخ النشر (${done}/${total})، وقد تتغيّر الخلاصة…</span>` : d.cached ? `<span class="small muted">${ic("zap")} نتيجة محفوظة</span>` : ""}</div>
        </div>
      </div>`;

    $("#rs-fc").innerHTML = s.fc.length ? `<div class="rs-block"><div class="rs-h"><span class="ico ico-sm">${ic("badge-check")}</span><h3>ماذا قال مدققو الحقائق؟</h3></div>
        <div class="rs-facts">${s.fc.map((f) => `<a class="rs-fact" href="${href(f.url)}" target="_blank" rel="noopener noreferrer">
          <span class="rs-rating">تدقيق حقائق</span><strong>${esc(f.title || f.host)}</strong>
          ${f.desc ? `<p>${esc(f.desc)}</p>` : ""}
          <small>${esc(f.site || f.host)}${f.date ? ` · ${esc(fmtDate(String(f.date).slice(0, 10)))}` : ""}</small></a>`).join("")}</div></div>` : "";

    const row = (p, i) => {
      const k = KIND[p.kind], first = i === 0 && p.date, wait = loading && !p.checked && p.i < DATE_PAGES;
      return `<li class="rs-page ${p.kind}${first ? " first" : ""}">
        <span class="rs-dot"></span>
        <div class="rs-when">${p.date ? `<b>${esc(fmtDate(String(p.date).slice(0, 10)))}</b><small>${esc(ago(p.date))}</small>` : wait ? `<b class="muted">…</b><small>نقرأ التاريخ</small>` : `<b>بلا تاريخ</b><small>لم يُعلن</small>`}</div>
        <a class="rs-card" href="${href(p.url)}" target="_blank" rel="noopener noreferrer">
          ${p.thumb ? `<span class="rs-thumb" data-img>${im(p.thumb)}</span>` : ""}
          <span class="rs-meta">
            <span class="rs-site"><img src="${fav(p.url)}" alt="" referrerpolicy="no-referrer" data-err="remove"> ${esc(p.site || p.host)} <span class="badge ${k[1]}">${ic(k[2])}${k[0]}</span>${first ? `<span class="badge badge-warn">${ic("flag")}أقدم ظهور</span>` : ""}</span>
            <strong>${esc(p.title || p.host)}</strong>
            <small class="ltr">${esc(p.host)}${+p.w ? ` · ${+p.w}×${+p.h}` : ""}</small>
          </span>${ic("arrow-up-left")}</a></li>`;
    };
    $("#rs-t").innerHTML = pages.length ? `<div class="rs-block"><div class="rs-h"><span class="ico ico-sm">${ic("history")}</span><h3>أين ومتى ظهرت؟ <small class="muted">مرتّبة من الأقدم</small></h3></div>
        <ol class="rs-timeline">${[...s.dated, ...s.undated].slice(0, S.showAll ? 1e4 : 30).map(row).join("")}</ol>
        ${!S.showAll && pages.length > 30 ? `<div class="center mt-2"><button class="btn btn-ghost btn-sm" id="rs-more">${ic("chevrons-down")}أظهر بقية الصفحات (${pages.length - 30})</button></div>` : ""}</div>` : "";
    icons();
    $("#rs-more")?.addEventListener("click", () => { S.showAll = true; paint(); });

    $("#rs-again").addEventListener("click", () => { runId++; S = null; $("#results").hidden = true; scrollTo({ top: 0, behavior: "smooth" }); });
    $("#rs-copy").addEventListener("click", () => copy([
      `🔎 تحقق من صورة — ${SITE.name}`, s.head, s.text,
      s.oldest ? `أقدم ظهور: ${fmtDate(s.oldest.date.slice(0, 10))} — ${s.oldest.site || s.oldest.host}\n${s.oldest.url}` : "",
      s.fc.length ? `مدققو الحقائق:\n${s.fc.map((f) => f.url).join("\n")}` : "",
      `ظهرت في ${pages.length} صفحة (${s.trusted} مصدر إخباري)`,
      `\nافحص صورك مجاناً: ${location.origin}${location.pathname}`
    ].filter(Boolean).join("\n"), "نُسخ ملخص التحقق"));
  }

  /* نزور الصفحات على دفعات لنعرف تاريخ نشر كل واحدة، ونعيد ترتيب الخط الزمني مع كل دفعة */
  async function loadDates(my) {
    const mine = S, list = mine.pages.slice(0, DATE_PAGES), chunks = [];
    for (let i = 0; i < list.length; i += DATE_CHUNK) chunks.push(list.slice(i, i + DATE_CHUNK));
    await Promise.all(chunks.map(async (chunk) => {
      let got = [];
      try { const r = await api("/dates", { urls: chunk.map((p) => p.url) }); got = (await r.json()).pages || []; } catch { /* تبقى بلا تاريخ */ }
      if (my !== runId || S !== mine) return;
      chunk.forEach((p) => { const g = got.find((x) => x.url === p.url) || {}; p.date = g.date || ""; p.site = g.site || ""; p.checked = true; });
      paint();
    }));
    if (my !== runId || S !== mine) return;
    mine.loading = false; paint();
  }

  /* ---------- URL mode ---------- */
  function validUrl(u) { try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } }
  $("#url-go").addEventListener("click", () => {
    const u = validUrl($("#url").value.trim());
    if (!u) { toast("أدخل رابطاً صحيحاً يبدأ بـ https://", "alert-triangle"); return; }
    remoteUrl = u; $("#url-img").src = u; $("#url-preview").hidden = false; $("#results").hidden = true; refresh();
    const probe = new Image(); probe.crossOrigin = "anonymous"; probe.onload = () => searchArchive(probe); probe.onerror = () => { $("#archive").hidden = true; }; probe.src = u;
  });
  $("#url").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#url-go").click(); });
  $("#url-img").addEventListener("error", () => { $("#url-preview").innerHTML = `<div class="alert alert-info">${ic("info")}<span>تعذّر عرض المعاينة (بعض المواقع تمنع ذلك)، لكن البحث قد يعمل. إن لم يعمل، حمّل الصورة واستخدم «رفع صورة».</span></div>`; icons(); });

  /* ---------- Panels ---------- */
  function refresh() {
    const ready = mode === "file" ? !!file : !!remoteUrl;
    $("#search-panel").hidden = !ready || !ENDPOINT;
    $("#web-go span").textContent = sel ? "ابحث عن الجزء المحدد" : "ابحث الآن";
    renderEngines(ready);
  }
  function renderEngines(ready) {
    const wrap = $("#engines-wrap");
    wrap.hidden = !ready; if (!ready) return;
    if (!ENDPOINT) wrap.open = true;
    $("#open-all").hidden = mode !== "url";
    $("#engines-note").textContent = ENDPOINT ? "إن أردت رأياً إضافياً: كل محرك قوي في نوع معيّن من الصور." : (mode === "file"
      ? "ننسخ الصورة لك ونفتح المحرك، وما عليك إلا لصقها (Ctrl+V)." : "ستُفتح نتائج كل محرك في تبويب جديد.");
    $("#engines").innerHTML = ENGINES.map((e) => {
      const action = mode === "url" ? "بحث بالرابط" : e.id === "google" ? (sel ? "ابحث عن الجزء المحدد" : "ابحث بالصورة") : "انسخ الصورة وافتح";
      return `<div class="card flex gap-2 items-center wrap">
        <span class="ico" style="background:${e.color}22;color:${e.color}">${ic(e.icon)}</span>
        <div style="flex:1;min-width:180px"><h3 class="mb-0">${e.ar} <span class="small muted ltr">${e.name}</span></h3><p class="small mb-0">${e.best}</p></div>
        <button class="btn btn-ghost btn-sm" data-engine="${e.id}">${ic(mode === "url" ? "external-link" : "clipboard-copy")}${action}</button>
      </div>`;
    }).join("");
    icons();
  }
  $("#engines").addEventListener("click", async (ev) => {
    const b = ev.target.closest("[data-engine]"); if (!b) return;
    const e = ENGINES.find((x) => x.id === b.dataset.engine);
    if (mode === "url") { window.open(e.url(remoteUrl), "_blank", "noopener"); return; }
    if (e.id === "google") { // Lens accepts a direct upload: no copy/paste needed
      b.disabled = true;
      try {
        const blob = await searchCanvas(2000).then((c) => new Promise((r) => c.toBlob(r, "image/jpeg", .92)));
        const dt = new DataTransfer(); dt.items.add(new File([blob], "image.jpg", { type: "image/jpeg" }));
        $("#lens-file").files = dt.files; $("#lens-form").submit();
      } catch { toast("تعذّر الإرسال، جرّب مرة أخرى", "alert-triangle"); }
      b.disabled = false; return;
    }
    const w = window.open(e.home, "_blank", "noopener");
    try {
      const png = searchCanvas(2000).then((c) => new Promise((r) => c.toBlob(r, "image/png")));
      await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
      toast(`نُسخت الصورة. الصقها في ${e.ar} بـ Ctrl+V`, "clipboard-check");
    } catch { toast("لم يسمح المتصفح بالنسخ. ارفع الصورة يدوياً في الصفحة التي فُتحت.", "info"); }
    return w;
  });
  $("#open-all").addEventListener("click", () => {
    ENGINES.forEach((e) => window.open(e.url(remoteUrl), "_blank", "noopener"));
    toast("إن فُتح تبويب واحد فقط، اسمح بالنوافذ المنبثقة لهذا الموقع", "info");
  });

  dropzone($("#dz"), $("#file"), setFile);
  $("#change").addEventListener("click", () => $("#file").click());
  const qUrl = App.param("url"); if (qUrl) { $('[data-mode="url"]').click(); $("#url").value = qUrl.slice(0, 2000); if (App.fromOwnSite()) $("#url-go").click(); }
})();
