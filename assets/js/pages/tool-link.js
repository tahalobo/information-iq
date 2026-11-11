(function () {
  const { $, $$, esc, ic, icons, copy, param } = App;

  const SHORTENERS = ["bit.ly", "tinyurl.com", "t.co", "goo.gl", "ow.ly", "is.gd", "buff.ly", "cutt.ly", "rb.gy", "shorturl.at", "tiny.cc", "s.id", "t.ly", "rebrand.ly", "bl.ink", "v.gd", "lnkd.in", "shorte.st", "adf.ly", "linktr.ee", "qrco.de", "short.gy", "urlz.fr", "tr.ee", "surl.li"];
  const RISKY_TLDS = ["zip", "mov", "xyz", "top", "click", "tk", "ml", "ga", "cf", "gq", "work", "rest", "cam", "icu", "monster", "buzz", "country", "kim", "loan", "men", "date", "racing", "win", "review", "stream", "download", "support", "live", "online", "site", "website", "space", "fun", "shop", "sbs", "cfd", "lol", "quest"];
  const BRANDS = {
    instagram: ["instagram.com", "cdninstagram.com", "ig.me"], facebook: ["facebook.com", "fb.com", "fb.me", "messenger.com", "fbcdn.net"],
    whatsapp: ["whatsapp.com", "wa.me", "whatsapp.net"], google: ["google.com", "google.iq", "goo.gl", "youtube.com", "youtu.be", "gmail.com", "googleusercontent.com", "gstatic.com", "googleapis.com"],
    apple: ["apple.com", "icloud.com"], microsoft: ["microsoft.com", "live.com", "outlook.com", "office.com"],
    paypal: ["paypal.com"], netflix: ["netflix.com"], amazon: ["amazon.com", "amazon.ae", "amazon.sa"], tiktok: ["tiktok.com"],
    telegram: ["telegram.org", "t.me", "telegram.me"], snapchat: ["snapchat.com"], binance: ["binance.com"], twitter: ["twitter.com", "x.com"],
    zaincash: ["zaincash.iq"], asiacell: ["asiacell.com"], korek: ["korektel.com"], qicard: ["qi.iq"], fastpay: ["fast-pay.iq", "fastpay.iq"], rafidain: ["rb.iq"]
  };
  const TRACKING = /^(utm_\w+|fbclid|gclid|dclid|gbraid|wbraid|igshid|igsh|mc_cid|mc_eid|_ga|_gl|yclid|msclkid|ttclid|twclid|li_fat_id|si|ref_src|ref_url|s_cid|mkt_tok|spm|share_id|__tn__|__cft__\[\d\]|rcm)$/i;
  const SUSP_WORDS = ["login", "signin", "verify", "verification", "account", "update", "secure", "security", "confirm", "password", "wallet", "bank", "free", "gift", "prize", "bonus", "winner", "reward", "claim", "unlock", "suspend", "recovery", "support", "billing", "airdrop", "copyright", "appeal", "blue-badge", "verified"];
  const DANGER_EXT = /\.(apk|exe|scr|bat|cmd|msi|vbs|js|jar|ps1|dmg|iso|zip|rar|7z)$/i;
  const HOMO = { "0": "o", "1": "l", "3": "e", "4": "a", "5": "s", "7": "t", "@": "a", "$": "s", "vv": "w", "rn": "m" };

  function registrable(host) {
    const p = host.split(".");
    const sld2 = ["com", "net", "org", "gov", "edu", "co", "ac"];
    if (p.length >= 3 && sld2.includes(p[p.length - 2]) && p[p.length - 1].length === 2) return p.slice(-3).join(".");
    return p.slice(-2).join(".");
  }
  const delook = (s) => { let x = s.toLowerCase(); for (const [k, v] of Object.entries(HOMO)) x = x.split(k).join(v); return x; };

  function analyze(raw) {
    let input = raw.trim();
    if (!input) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(input)) input = "http://" + input;
    let u; try { u = new URL(input); } catch { return { error: "هذا لا يبدو رابطاً صحيحاً." }; }
    if (!/^https?:$/.test(u.protocol)) return { url: u, checks: [{ lvl: "danger", icon: "alert-octagon", t: `بروتوكول غير معتاد (${u.protocol})`, d: "روابط javascript أو data قد تنفّذ أكواداً. لا تفتحه." }], score: 90, clean: input };

    const host = u.hostname.toLowerCase().replace(/\.$/, "");
    const reg = registrable(host);
    const tld = host.split(".").pop();
    const checks = []; let score = 0;
    const add = (lvl, icon, t, d, pts) => { checks.push({ lvl, icon, t, d }); score += pts; };

    // Protocol
    if (u.protocol === "http:" && !/^http:/i.test(raw.trim())) { /* user omitted scheme */ }
    else if (u.protocol === "http:") add("warn", "lock-open", "اتصال غير مشفّر (http)", "أي بيانات تدخلها يمكن اعتراضها. المواقع الرسمية تستخدم https.", 15);
    else add("ok", "lock", "اتصال مشفّر (https)", "جيد، لكن انتبه: مواقع التصيد أيضاً تستخدم https، فهو ليس دليلاً على الأمان.", 0);

    // IP host
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.startsWith("[")) add("danger", "server", "الرابط عنوان IP وليس اسم موقع", "المواقع الحقيقية نادراً ما تستخدم أرقاماً بدل الاسم.", 35);

    // Userinfo trick
    if (u.username || /@/.test(raw.split("?")[0].replace(/^https?:\/\//i, "").split("/")[0])) add("danger", "at-sign", "يحتوي على @ قبل اسم الموقع", "خدعة قديمة: كل ما قبل @ يُتجاهل، والموقع الحقيقي هو ما بعدها.", 40);

    // Punycode / unicode
    if (host.split(".").some((l) => l.startsWith("xn--"))) add("danger", "languages", "اسم الموقع يحتوي على حروف من لغات أخرى (Punycode)", "قد يبدو مثل apple.com لكنه مكتوب بحروف روسية أو يونانية متشابهة.", 40);

    // Shortener
    if (SHORTENERS.includes(reg) || SHORTENERS.includes(host)) add("warn", "shrink", "رابط مختصر", "لا يمكن معرفة وجهته الحقيقية دون فتحه. استخدم خدمة كشف الروابط المختصرة أدناه.", 20);

    // TLD
    if (RISKY_TLDS.includes(tld)) add("warn", "globe", `امتداد نطاق يكثر استخدامه في الاحتيال (.${tld})`, "ليس كل موقع بهذا الامتداد احتيالياً، لكنه رخيص ومفضّل لدى المحتالين.", 15);

    // Brand impersonation
    const tokens = [...new Set([...host.split(/[.-]/), ...delook(host).split(/[.-]/)])];
    const mentions = (b) => tokens.some((t) => t === b || (b.length >= 6 && t.includes(b)));
    for (const [brand, domains] of Object.entries(BRANDS)) {
      const official = domains.some((d) => host === d || host.endsWith("." + d));
      if (!official && mentions(brand)) {
        add("danger", "venetian-mask", `ينتحل اسم «${brand}»`, `الرابط يحتوي على اسم ${brand} لكنه ليس من نطاقه الرسمي (${domains[0]}). الموقع الحقيقي هنا هو ${reg}.`, 45);
        break;
      }
      if (official) { add("ok", "badge-check", `نطاق رسمي لـ ${brand}`, `${reg} من النطاقات الرسمية المعروفة.`, -10); break; }
    }

    // Subdomains depth
    const depth = host.split(".").length;
    if (depth >= 5) add("warn", "layers", "عدد كبير من النطاقات الفرعية", "مثل secure.login.account.example.xyz، وتُستخدم لإخفاء اسم الموقع الحقيقي.", 15);

    // Hyphens / digits
    if ((reg.match(/-/g) || []).length >= 2) add("warn", "minus", "شرطات كثيرة في اسم الموقع", "مثل account-verify-secure.com، وهو نمط شائع في التصيد.", 10);

    // Suspicious words
    const words = SUSP_WORDS.filter((w) => (host + u.pathname).toLowerCase().includes(w));
    if (words.length) add(words.length > 1 ? "warn" : "info", "text-search", "كلمات تُستخدم كثيراً في التصيد", `يحتوي على: ${words.slice(0, 5).join("، ")}`, Math.min(20, words.length * 7));

    // Dangerous file
    if (DANGER_EXT.test(u.pathname)) add("danger", "file-warning", "الرابط يحمّل ملفاً تنفيذياً أو مضغوطاً", "ملفات APK وEXE قد تحتوي على برامج تجسس. لا تثبّتها إلا من مصدر رسمي.", 35);

    // Port
    if (u.port && !["80", "443"].includes(u.port)) add("warn", "plug", `منفذ غير معتاد (${u.port})`, "المواقع العامة لا تستخدم منافذ مخصصة عادةً.", 10);

    // Length
    if (raw.length > 120) add("info", "ruler", "رابط طويل جداً", "الروابط الطويلة قد تخفي الوجهة الحقيقية أو تحمل بيانات تتبّع.", 5);

    // Tracking
    const params = [...u.searchParams.keys()];
    const trackers = params.filter((k) => TRACKING.test(k));
    const cleanU = new URL(u.href); trackers.forEach((k) => cleanU.searchParams.delete(k));
    if (trackers.length) add("info", "radar", `${trackers.length} من أكواد التتبع`, `مثل ${trackers.slice(0, 4).join("، ")}. تكشف من أين جئت ومن شارك الرابط. استخدم النسخة النظيفة.`, 0);

    score = Math.max(0, Math.min(100, score));
    return { url: u, host, reg, checks, score, clean: cleanU.href, trackers };
  }

  function render(r) {
    const out = $("#out");
    if (!r) { out.innerHTML = ""; return; }
    if (r.error) { out.innerHTML = `<div class="alert alert-danger">${ic("x-circle")}<span>${r.error}</span></div>`; icons(); return; }
    const lvl = r.score >= 45 ? ["danger", "خطير، لا تفتحه", "shield-x"] : r.score >= 20 ? ["warn", "مشبوه، كن حذراً", "shield-alert"] : ["success", "لا توجد علامات خطر واضحة", "shield-check"];
    const color = `var(--${lvl[0]})`;
    const enc = encodeURIComponent(r.url.href);
    out.innerHTML = `
      <div class="card" style="border-color:${color}">
        <div class="flex gap-2 items-center wrap">
          <span class="ico" style="width:64px;height:64px;background:var(--${lvl[0]}-soft);color:${color}">${ic(lvl[2])}</span>
          <div style="flex:1;min-width:200px"><h2 class="mb-0" style="font-size:1.4rem;font-family:var(--font);color:${color}">${lvl[1]}</h2>
          <p class="mb-0 muted">درجة الخطورة ${r.score}/100 · الموقع الحقيقي: <strong class="ltr mono">${esc(r.reg || "")}</strong></p></div>
        </div>
        <div class="meter mt-2"><i style="width:${Math.max(4, r.score)}%;background:${color}"></i></div>
      </div>
      <div class="card">
        <div class="card-title"><span class="ico ico-sm">${ic("split")}</span><h3>تشريح الرابط</h3></div>
        <table class="kv"><tbody>
          <tr><th>البروتوكول</th><td class="ltr mono" style="text-align:right">${esc(r.url.protocol)}</td></tr>
          <tr><th>اسم الموقع الكامل</th><td class="ltr mono" style="text-align:right">${esc(r.host || "")}</td></tr>
          <tr><th>النطاق الأساسي (المهم)</th><td class="ltr mono" style="text-align:right"><strong>${esc(r.reg || "")}</strong></td></tr>
          <tr><th>المسار</th><td class="ltr mono" style="text-align:right">${esc(decodeURI(r.url.pathname))}</td></tr>
          ${r.url.search ? `<tr><th>المعاملات</th><td class="ltr mono" style="text-align:right;font-size:.8rem">${esc(r.url.search)}</td></tr>` : ""}
        </tbody></table>
      </div>
      <div class="stack" style="gap:10px">${r.checks.map((c) => `<div class="alert alert-${c.lvl === "ok" ? "success" : c.lvl}">${ic(c.icon)}<div><strong>${esc(c.t)}</strong><p>${esc(c.d)}</p></div></div>`).join("")}</div>
      ${r.trackers && r.trackers.length ? `<div class="card"><div class="card-title"><span class="ico ico-sm">${ic("sparkles")}</span><h3>الرابط النظيف (بدون تتبع)</h3></div>
        <div class="input-group"><input class="input ltr mono" readonly value="${esc(r.clean)}" dir="ltr"><button class="btn btn-ghost" data-copy="${esc(r.clean)}">${ic("copy")}نسخ</button></div></div>` : ""}
      <div class="card">
        <div class="card-title"><span class="ico ico-sm">${ic("radar")}</span><h3>افحصه في قواعد بيانات التهديدات</h3></div>
        <p class="small">هذه الخدمات المتخصصة تفحص الرابط مقابل قوائم المواقع الخبيثة المعروفة:</p>
        <div class="btn-row">
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.virustotal.com/gui/search/${encodeURIComponent(enc)}">${ic("bug")}VirusTotal</a>
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://transparencyreport.google.com/safe-browsing/search?url=${enc}">${ic("shield")}Google Safe Browsing</a>
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://urlscan.io/domain/${encodeURIComponent(r.host || "")}">${ic("scan")}urlscan.io</a>
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://who.is/whois/${encodeURIComponent(r.reg || "")}">${ic("file-search")}Whois (عمر النطاق)</a>
          ${r.checks.some((c) => c.icon === "shrink") ? `<a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://unshorten.it/?url=${enc}">${ic("expand")}كشف الرابط المختصر</a>` : ""}
        </div>
        <p class="small muted mt-2 mb-0">${ic("info")} الفحص هنا تحليل لشكل الرابط فقط ولا يفتحه. النتيجة «آمن» لا تضمن الأمان 100%.</p>
      </div>`;
    icons();
  }

  const run = () => { const v = $("#u").value; render(analyze(v)); const u = new URL(location.href); if (v) u.searchParams.set("u", v); else u.searchParams.delete("u"); history.replaceState(null, "", u); };
  $("#go").addEventListener("click", run);
  $("#u").addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
  $$("[data-ex]").forEach((b) => b.addEventListener("click", () => { $("#u").value = b.dataset.ex; run(); }));
  const init = param("u"); if (init) { $("#u").value = init; run(); }
})();
