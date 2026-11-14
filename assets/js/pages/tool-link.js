/* فاحص الروابط: التحليل البنيوي من LinkEngine + فحوص حيّة مجانية بلا مفاتيح
   (Google Safe Browsing، فلاتر DNS الأمنية، قوائم التصيد المفتوحة، RDAP، Tranco، شفافية الشهادات، فكّ الروابط المختصرة) */
(function () {
  const { $, $$, esc, ic, icons, copy, param, toast } = App;
  const E = window.LinkEngine;
  const WORKER = String((window.SITE && (SITE.linkCheckEndpoint || SITE.reverseSearchEndpoint)) || "").replace(/\/+$/, "");
  const out = $("#out");
  let runId = 0, S = null;

  /* ---------- أدوات الشبكة ---------- */
  const get = (url, opt = {}, ms = 9000) => fetch(url, { ...opt, signal: AbortSignal.timeout(ms) });
  const getJSON = async (url, opt, ms) => { const r = await get(url, opt, ms); if (!r.ok) throw Object.assign(new Error("http " + r.status), { status: r.status }); return r.json(); };
  const DJ = { headers: { accept: "application/dns-json" } };

  // استعلام DNS بصيغته الثنائية (لفلاتر لا تدعم JSON)
  function dnsWire(name) {
    const b = [0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0];
    for (const l of name.split(".")) { b.push(l.length); for (const c of l) b.push(c.charCodeAt(0) & 255); }
    b.push(0, 0, 1, 0, 1);
    return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  async function dnsWireQuery(base, name) {
    const r = await get(`${base}?dns=${dnsWire(name)}`, { headers: { accept: "application/dns-message" } }, 7000);
    const a = new Uint8Array(await r.arrayBuffer()); if (a.length < 12) throw new Error("short");
    const rcode = a[3] & 15, an = (a[6] << 8) | a[7]; const ips = [];
    let p = 12; while (a[p]) p += a[p] + 1; p += 5;
    for (let i = 0; i < an && p < a.length; i++) {
      if ((a[p] & 192) === 192) p += 2; else { while (a[p]) p += a[p] + 1; p++; }
      const type = (a[p] << 8) | a[p + 1], len = (a[p + 8] << 8) | a[p + 9]; p += 10;
      if (type === 1 && len === 4) ips.push([...a.slice(p, p + 4)].join(".")); p += len;
    }
    return { rcode, ips };
  }

  /* ---------- قوائم الحجب المفتوحة (تُحمَّل مرة واحدة، والمطابقة داخل متصفحك) ---------- */
  const LISTS = [
    { id: "openphish", name: "OpenPhish", kind: "url", url: "https://raw.githubusercontent.com/openphish/public_feed/refs/heads/main/feed.txt" },
    { id: "phishing-filter", name: "PhishTank + OpenPhish + phishunt", kind: "domain", url: "https://malware-filter.gitlab.io/malware-filter/phishing-filter-domains.txt" },
    { id: "urlhaus", name: "URLhaus (برمجيات خبيثة)", kind: "domain", url: "https://malware-filter.gitlab.io/malware-filter/urlhaus-filter-domains-online.txt" },
    { id: "phishdb", name: "Phishing.Database (اليوم)", kind: "domain", url: "https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-domains-NEW-today.txt" }
  ];
  let listsP = null;
  const loadLists = () => listsP || (listsP = Promise.all(LISTS.map(async (l) => {
    try {
      const txt = await (await get(l.url, {}, 20000)).text(); const hosts = new Set(), urls = new Set();
      for (let line of txt.split("\n")) {
        line = line.trim(); if (!line || line[0] === "#" || line[0] === "!") continue;
        if (l.kind === "url") { try { const u = new URL(line); hosts.add(u.hostname.toLowerCase()); urls.add(normUrl(u.href)); } catch { /* skip */ } }
        else hosts.add(line.replace(/^(\|\||0\.0\.0\.0\s+|127\.0\.0\.1\s+)/, "").replace(/\^.*$/, "").toLowerCase());
      }
      return { ...l, ok: hosts.size > 0, hosts, urls };
    } catch { return { ...l, ok: false }; }
  })));
  const normUrl = (h) => h.replace(/^https?:\/\//i, "").replace(/[?#].*$/, "").replace(/\/+$/, "").toLowerCase();

  /* ---------- الفحوص الحيّة: كل فحص يعيد {state, text, flag?} ---------- */
  const CHECKS = {
    gsb: { label: "Google Safe Browsing", icon: "shield" },
    filters: { label: "فلاتر DNS الأمنية (Cloudflare · ControlD · CleanBrowsing)", icon: "shield-ban" },
    lists: { label: "قوائم التصيد والبرمجيات الخبيثة المفتوحة", icon: "database" },
    dns: { label: "هل النطاق موجود؟ (DNS)", icon: "network" },
    age: { label: "عمر النطاق (RDAP)", icon: "calendar-clock" },
    rank: { label: "شهرة الموقع (Tranco)", icon: "trending-up" },
    ct: { label: "شفافية الشهادات", icon: "file-badge" }
  };
  const flag = (id, lvl, icon, t, d, pts, extra) => ({ id, lvl, icon, t, d, pts, live: true, ...extra });

  async function checkGSB(r) {
    const site = r.isIP || r.url.pathname === "/" ? r.host : r.host + r.url.pathname;
    const read = async (s) => { const t = await (await get("https://transparencyreport.google.com/transparencyreport/api/v3/safebrowsing/status?site=" + encodeURIComponent(s), {}, 9000)).text(); return JSON.parse(t.replace(/^\)\]\}'\s*/, ""))[0]; };
    let a = await read(site); if (a[1] !== 2 && site !== r.host) { const b = await read(r.host); if (b[1] === 2 || b[1] === 3) a = b; }
    const st = a[1], why = [a[2] && "يحوّل إلى مواقع ضارة", a[3] && "يثبّت برمجيات خبيثة", a[4] && "يخدع الزوار لسرقة بياناتهم (تصيد)", a[5] && "يحتوي برامج ضارة", a[6] && "تنزيلات غير مألوفة"].filter(Boolean).join("، ");
    if (st === 2) return { state: "bad", text: "مُدرج كموقع غير آمن" + (why ? `: ${why}` : ""), flag: flag("gsb", "danger", "shield-x", "غوغل يصنّفه موقعاً غير آمن", (why || "مدرج في قائمة التصفح الآمن") + ". هذه القائمة نفسها التي تجعل كروم يعرض الصفحة الحمراء.", 60, { floor: 92 }) };
    if (st === 3) return { state: "warn", text: "بعض صفحات هذا الموقع غير آمنة", flag: flag("gsb", "warn", "shield-alert", "غوغل: بعض صفحات هذا الموقع غير آمنة", (why || "الموقع يستضيف صفحات ضارة") + ". قد لا تكون صفحتك منها، لكن الحذر واجب.", 30, { floor: 45 }) };
    if (st === 5) return { state: "warn", text: "يستضيف تنزيلات غير مألوفة", flag: flag("gsb", "warn", "shield-alert", "غوغل: تنزيلات غير مألوفة", "ملفات قليلة الانتشار لم تُفحص بما يكفي.", 20) };
    if (st === 1) return { state: "ok", text: "لا تحذير حالياً (لا يعني أنه آمن، فالصفحات الجديدة تتأخر في الإدراج)" };
    return { state: "na", text: "لا بيانات كافية عند غوغل عن هذا الموقع" };
  }

  async function checkDNS(r) {
    const d = await getJSON(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(r.host)}&type=A`, DJ, 7000);
    const ips = (d.Answer || []).filter((a) => a.type === 1).map((a) => a.data);
    r._dns = { status: d.Status, ips };
    if (d.Status === 3) return { state: "warn", text: "النطاق غير موجود (NXDOMAIN)", flag: flag("nxdomain", "info", "unplug", "هذا النطاق غير موجود حالياً", "إما أن الرابط مكتوب خطأ، أو أن الموقع أُغلق (مواقع التصيد تُحذف خلال أيام). لن يفتح شيئاً الآن.", 0, { dead: true }) };
    if (!ips.length) return { state: "na", text: "لا عنوان IPv4 لهذا الاسم" };
    return { state: "ok", text: `موجود ويشير إلى ${ips.slice(0, 2).join("، ")}${ips.length > 2 ? "…" : ""}` };
  }

  async function checkFilters(r) {
    if (r._dns && r._dns.status === 3) return { state: "na", text: "النطاق غير موجود أصلاً" };
    const res = await Promise.allSettled([
      getJSON(`https://security.cloudflare-dns.com/dns-query?name=${encodeURIComponent(r.host)}&type=A`, DJ, 7000).then((d) => /censored|blocked/i.test(JSON.stringify(d.Comment || "")) || (d.Answer || []).some((a) => a.data === "0.0.0.0")),
      dnsWireQuery("https://freedns.controld.com/p1", r.host).then((d) => d.ips.includes("0.0.0.0")),
      dnsWireQuery("https://doh.cleanbrowsing.org/doh/security-filter/", r.host).then((d) => d.rcode === 3 && r._dns && r._dns.status === 0 && r._dns.ips.length > 0)
    ]);
    const names = ["Cloudflare", "ControlD", "CleanBrowsing"]; const hit = names.filter((_, i) => res[i].status === "fulfilled" && res[i].value); const okN = res.filter((x) => x.status === "fulfilled").length;
    if (!okN) throw new Error("no filter reachable");
    if (hit.length) return { state: "bad", text: `محجوب في: ${hit.join("، ")} (${hit.length} من ${okN})`, flag: flag("dnsfilter", "danger", "shield-ban", `محجوب كموقع ضار في ${hit.length > 1 ? hit.length + " فلاتر أمنية" : "فلتر " + hit[0]}`, `${hit.join(" و ")} ${hit.length > 1 ? "تحجب" : "يحجب"} هذا النطاق ضمن قوائم التصيد والبرمجيات الخبيثة. هذه فلاتر تحمي ملايين الأجهزة.`, 50, { floor: hit.length > 1 ? 88 : 72 }) };
    return { state: "ok", text: `غير محجوب في ${okN} فلاتر` };
  }

  async function checkLists(r) {
    const lists = await loadLists(); const ok = lists.filter((l) => l.ok); if (!ok.length) throw new Error("lists unavailable");
    const self = normUrl(r.href); const hostOnly = !(r.trusted || (r.platform && r.reg === r.platform.s));
    const cands = new Set([r.host, r.host.replace(/^www\./, "")]);
    if (hostOnly && !r.isIP) { const p = r.host.split("."); const n = r.reg.split(".").length; for (let i = 1; i <= p.length - n; i++) cands.add(p.slice(i).join(".")); }
    const hits = ok.filter((l) => (l.urls && [...l.urls].some((u) => u === self || (self.length > 12 && u.startsWith(self + "/")))) || (hostOnly && [...cands].some((c) => l.hosts.has(c))));
    const total = ok.reduce((a, l) => a + l.hosts.size, 0);
    if (hits.length) return { state: "bad", text: `موجود في: ${hits.map((l) => l.name).join("، ")}`, flag: flag("blocklist", "danger", "siren", "مُبلَّغ عنه في قوائم التصيد", `هذا الرابط أو نطاقه مدرج في ${hits.map((l) => l.name).join(" و ")}. أي أن أشخاصاً قبلك بلّغوا عنه وتأكد منه الباحثون.`, 70, { floor: 95 }) };
    return { state: "ok", text: `غير مدرج (فُحص مقابل ${total.toLocaleString("en")} نطاق في ${ok.length} قوائم)` };
  }

  const agoAr = (days) => (days < 2 ? "يوم واحد" : days < 60 ? `${Math.round(days)} يوماً` : days < 730 ? `${Math.round(days / 30)} شهراً` : `${Math.floor(days / 365)} سنة`);
  // فهرس IANA يدلّنا على خادم RDAP لكل امتداد (ونعرف منه الامتدادات التي لا توفّره مثل .iq)
  let bootP = null;
  const rdapBase = async (tld) => {
    bootP = bootP || getJSON("https://data.iana.org/rdap/dns.json", {}, 10000).catch(() => null);
    const b = await bootP; if (!b || !b.services) return undefined;
    const hit = b.services.find((x) => x[0].includes(tld)); return hit ? hit[1][0] : null;
  };
  async function checkAge(r) {
    if (r._dns && r._dns.status === 3) return { state: "na", text: "النطاق غير موجود" };
    const base = await rdapBase(r.tld);
    if (base === null) { r._noRdap = true; return { state: "na", text: `سجلّ .${r.tld} لا ينشر تاريخ التسجيل` }; }
    let d; const q = "domain/" + encodeURIComponent(r.reg);
    try { try { if (!base) throw new Error("no bootstrap"); d = await getJSON(base.replace(/\/?$/, "/") + q, {}, 9000); } catch (e) { if (e.status === 404) throw e; d = await getJSON("https://rdap.org/" + q, {}, 10000); } }
    catch (e) { if (e.status === 404) { r._noRdap = true; return { state: "na", text: `سجلّ .${r.tld} لا يوفّر هذه المعلومة أو النطاق غير مسجّل` }; } throw e; }
    const ev = (d.events || []).find((x) => /registration/i.test(x.eventAction)); if (!ev) { r._noRdap = true; return { state: "na", text: "السجلّ لم يذكر تاريخ التسجيل" }; }
    const when = new Date(ev.eventDate), days = (Date.now() - when) / 864e5; const date = when.toISOString().slice(0, 10);
    const reg = ((d.entities || []).find((x) => (x.roles || []).includes("registrar")) || {}).vcardArray; const registrar = reg ? ((reg[1] || []).find((v) => v[0] === "fn") || [])[3] : "";
    const text = `سُجّل قبل ${agoAr(days)} (${date})${registrar ? ` عبر ${registrar}` : ""}`;
    if (days < 14) return { state: "bad", text, flag: flag("age", "danger", "baby", "نطاق عمره أيام فقط", `سُجّل في ${date}. الغالبية الساحقة من مواقع التصيد تُستعمل في أسابيعها الأولى ثم تُرمى.`, 40) };
    if (days < 60) return { state: "bad", text, flag: flag("age", "danger", "calendar-clock", "نطاق جديد جداً", `سُجّل قبل ${agoAr(days)} فقط. لا مصرف ولا شركة معروفة موقعها بهذا العمر.`, 28) };
    if (days < 180) return { state: "warn", text, flag: flag("age", "warn", "calendar-clock", "نطاق حديث التسجيل", `سُجّل قبل ${agoAr(days)}. ليس دليلاً وحده، لكنه يضعف الثقة.`, 14) };
    if (days < 365) return { state: "warn", text, flag: flag("age", "info", "calendar-clock", "نطاق عمره أقل من سنة", `سُجّل قبل ${agoAr(days)}.`, 5) };
    return { state: "ok", text, flag: days > 1095 ? flag("age", "ok", "calendar-check", `نطاق قديم (${agoAr(days)})`, "مواقع التصيد قصيرة العمر. القِدَم قرينة جيدة، لكنه لا يحمي من موقع قديم اختُرق.", -5) : null };
  }

  async function checkRank(r) {
    const d = await getJSON("https://tranco-list.eu/api/ranks/domain/" + encodeURIComponent(r.reg), {}, 9000);
    const rank = d.ranks && d.ranks[0] && d.ranks[0].rank;
    if (!rank) return { state: "na", text: "ليس ضمن أشهر مليون موقع (طبيعي للمواقع الصغيرة، ومعتاد في مواقع الاحتيال)" };
    const n = rank.toLocaleString("en");
    if (rank <= 100000) return { state: "ok", text: `الترتيب ${n} عالمياً`, flag: flag("rank", "ok", "trending-up", `موقع واسع الانتشار (الترتيب ${n} عالمياً)`, "مواقع بهذه الشهرة لا تكون نطاقات تصيد. الخطر الممكن هو محتوى ينشره مستخدموها أو تحويل يمرّ عبرها.", -20, { reputable: true }) };
    return { state: "ok", text: `الترتيب ${n} عالمياً`, flag: flag("rank", "ok", "trending-up", `موقع معروف (الترتيب ${n})`, "له زوار كثر منذ مدة، وهذا لا يتوفر لمواقع الاحتيال العابرة.", -8) };
  }

  async function checkCT(r) {
    const d = await getJSON(`https://api.certspotter.com/v1/issuances?domain=${encodeURIComponent(r.reg)}&include_subdomains=true&expand=dns_names`, {}, 10000);
    if (!d.length) return { state: "warn", text: "لا شهادة سارية معروفة لهذا النطاق", flag: r.scheme === "https" ? flag("ct", "info", "file-badge", "لا شهادة أمان معروفة", "لم نجد شهادة https سارية مسجّلة لهذا النطاق في سجلات الشفافية.", 5) : null };
    const first = d.map((c) => new Date(c.not_before)).sort((a, b) => a - b)[0]; const days = (Date.now() - first) / 864e5;
    const names = new Set(d.flatMap((c) => c.dns_names || [])); const text = `${d.length}${d.length >= 100 ? "+" : ""} شهادة سارية، أقدمها قبل ${agoAr(days)}، تغطي ${names.size} اسماً`;
    if (days < 10 && r._noRdap) return { state: "warn", text, flag: flag("ct", "warn", "file-badge", "أول شهادة أمان صدرت قبل أيام", "حين لا يتوفر تاريخ تسجيل النطاق، حداثة أول شهادة قرينة على أن الموقع جديد.", 12) };
    return { state: "ok", text };
  }

  /* ---------- فكّ الرابط المختصر وتتبّع التحويلات ---------- */
  async function expand(url, host) {
    if (WORKER) {
      try {
        const d = await getJSON(WORKER + "/link", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) }, 20000);
        if (d && d.final) return { source: "خادم الموقع", final: d.final, chain: d.chain || [], title: d.title || "", signals: d.signals || {}, status: d.status };
      } catch { /* fall through */ }
    }
    if (/^(is|v)\.gd$/.test(host)) {
      try { const d = await getJSON(`https://${host}/forward.php?format=json&shorturl=${encodeURIComponent(url)}`, {}, 8000); if (d.url) return { source: host, final: d.url, chain: [{ url }, { url: d.url }], title: "", signals: {} }; } catch { /* next */ }
    }
    const d = await getJSON("https://api.microlink.io/?url=" + encodeURIComponent(url), {}, 20000);
    if (d.status !== "success" || !d.data || !d.data.url) throw new Error("expand failed");
    return { source: "Microlink", final: d.data.url, chain: [{ url }, { url: d.data.url }], title: d.data.title || "", publisher: d.data.publisher || "", signals: {} };
  }

  // إشارات من محتوى الصفحة النهائية (عنوانها، نموذج كلمة مرور…)
  function contentFlags(x, r) {
    const fl = []; const sig = x.signals || {}; const text = `${x.title || ""} ${x.publisher || ""}`.toLowerCase();
    if (!r.trusted) {
      const b = E.BRANDS.find((b) => b.id !== (r.official && r.official.id) && (b.names.some((n) => n.length >= 5 && new RegExp(`(^|[^a-z])${n}([^a-z]|$)`).test(text)) || text.includes(b.ar)));
      const loginish = sig.password || /log ?in|sign ?in|verify|تسجيل الدخول|تأكيد|password|كلمة المرور/.test(text);
      if (b && (loginish || (x.publisher || "").toLowerCase() === b.names[0])) fl.push(flag("page-brand", "danger", "venetian-mask", `الصفحة تقدّم نفسها باسم «${b.ar}»`, `عنوان الصفحة «${(x.title || "").slice(0, 70)}» يحمل اسم ${b.ar}، لكنها على ${r.reg} لا على ${b.domains[0]}.`, 45, { floor: sig.password ? 80 : 0 }));
      if (sig.password) fl.push(flag("page-password", "warn", "key-round", "الصفحة تطلب كلمة مرور", "فيها حقل كلمة مرور. لا تكتب كلمة مرورك إلا في موقع كتبت عنوانه بنفسك.", 15));
      if (sig.card) fl.push(flag("page-card", "warn", "credit-card", "الصفحة تطلب بيانات بطاقة مصرفية", "فيها حقول رقم البطاقة أو رمز CVV.", 20));
      if (sig.formHosts && sig.formHosts.length) fl.push(flag("page-form", "danger", "send", "النموذج يرسل بياناتك إلى موقع ثالث", `ما تكتبه في الصفحة يُرسل إلى: ${sig.formHosts.slice(0, 3).join("، ")}`, 30));
    }
    if (sig.download) fl.push(flag("page-download", "danger", "file-down", "الرابط يبدأ تحميل ملف مباشرة", `اسم الملف: ${sig.download}`, 30));
    return fl;
  }

  /* ---------- تشغيل الفحص ---------- */
  function newTarget(r, role) {
    const t = { r, role, rows: {}, flags: [] };
    if (!r || r.error || r.special) return t;
    const priv = r.isIP && /^(10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(r.host);
    if (priv) return t;
    const ids = r.isIP ? ["gsb", "lists"] : ["gsb", "filters", "lists", "dns"];
    if (!r.isIP && !r.trusted && !r.shortener && !r.logger && !r.platform) ids.push("age", "rank", "ct");
    ids.forEach((id) => (t.rows[id] = { state: "run", text: "جارٍ الفحص…" }));
    return t;
  }
  async function runTarget(t, id, paint) {
    const r = t.r; const fns = { gsb: checkGSB, filters: checkFilters, lists: checkLists, dns: checkDNS, age: checkAge, rank: checkRank, ct: checkCT };
    const one = async (k) => {
      if (!t.rows[k]) return;
      try { const res = await fns[k](r); if (id !== runId) return; t.rows[k] = res; if (res.flag) t.flags.push(res.flag); }
      catch { if (id !== runId) return; t.rows[k] = { state: "na", text: "تعذّر الوصول إلى المصدر الآن" }; }
      paint();
    };
    await Promise.all([one("gsb"), one("lists"), one("rank"), one("dns").then(() => Promise.all([one("filters"), one("age").then(() => one("ct"))]))]);
  }

  async function run(raw) {
    const id = ++runId; const list = E.extract(raw);
    const r = E.analyze(list[0] || raw);
    S = { r, others: list.slice(1, 6), main: null, dest: null, expand: null, done: false };
    if (!r || r.error) { render(); return; }
    const live = $("#live") ? $("#live").checked : true;
    const paint = () => { if (id === runId) render(); };
    if (!live || r.special) { S.done = true; S.offline = !live; render(); return; }
    S.main = newTarget(r, "main");
    const nested = (r.nested || []).find((n) => n.redirectLike && n.r && !n.r.error && !n.r.special);
    if (nested) S.dest = Object.assign(newTarget(nested.r, "dest"), { via: nested.via });
    const wantExpand = !nested && !r.isIP && /^https?$/.test(r.scheme) && (r.shortener || (WORKER && !r.logger));
    if (wantExpand) S.expand = { state: "run" };
    render();
    const jobs = [runTarget(S.main, id, paint)];
    if (S.dest) jobs.push(runTarget(S.dest, id, paint));
    if (wantExpand) jobs.push(doExpand(id, paint));
    await Promise.all(jobs);
    if (id !== runId) return;
    S.done = true; render();
  }

  async function doExpand(id, paint) {
    const r = S.r;
    try {
      const x = await expand(r.href, r.host); if (id !== runId) return;
      const fr = E.analyze(x.final);
      const same = fr && !fr.error && !fr.special && fr.host === r.host;
      S.expand = { state: "ok", ...x, same };
      if (same) { S.main.flags.push(...contentFlags(x, r)); paint(); return; }
      if (!fr || fr.error) { S.expand = { state: "fail" }; paint(); return; }
      S.dest = Object.assign(newTarget(fr, "dest"), { via: r.shortener ? "الرابط المختصر" : "تحويل تلقائي", expanded: true });
      S.dest.flags.push(...contentFlags(x, fr));
      paint(); await runTarget(S.dest, id, paint);
    } catch { if (id === runId) { S.expand = { state: "fail" }; paint(); } }
  }

  /* ---------- الحكم النهائي ---------- */
  function verdict() {
    const r = S.r; const mainFlags = S.main ? S.main.flags : [];
    // إذا كُشفت الوجهة فالحكم عليها هي، لا على كون الرابط مختصراً
    const resolved = S.dest && S.dest.expanded;
    const base = resolved ? { ...r, flags: r.flags.map((f) => (f.id === "shortener" ? { ...f, pts: 0 } : f)) } : r;
    let s = E.score(base, mainFlags), from = "main";
    if (S.dest && S.dest.r) { const d = E.score(S.dest.r, S.dest.flags); const dd = d >= 20 ? Math.min(100, d + 10) : d; if (dd > s) { s = dd; from = "dest"; } }
    const dead = [...mainFlags, ...(S.dest ? S.dest.flags : [])].some((f) => f.dead) && s < 45;
    return { score: s, from, dead, lvl: E.level(s) };
  }

  function advice(v) {
    const r = S.r; const all = [...r.flags, ...(S.main ? S.main.flags : []), ...(S.dest ? [...S.dest.r.flags, ...S.dest.flags] : [])]; const has = (id) => all.some((f) => f.id === id && (f.pts || 0) >= 0 && f.lvl !== "ok");
    const a = []; const brand = all.find((f) => f.brand); const b = brand && E.BRANDS.find((x) => x.id === brand.brand);
    if (v.lvl.k === "danger") {
      a.push("لا تفتح الرابط، ولا تكتب فيه كلمة مرور أو رمز تحقق (OTP) أو رقم بطاقة.");
      if (b) a.push(`إن أردت ${b.ar} فاكتب عنوانه بنفسك في المتصفح: ${b.domains[0]} أو افتح تطبيقه الرسمي.`);
      a.push("إن كنت فتحته وأدخلت بياناتك: غيّر كلمة المرور فوراً من الموقع الرسمي، فعّل التحقق بخطوتين، وسجّل الخروج من كل الأجهزة. وإن أدخلت رقم بطاقة فاتصل بمصرفك لإيقافها.");
      a.push("احظر المرسل وبلّغ عن الرسالة داخل التطبيق، وحذّر من وصله الرابط نفسه. إن وصلك من صديق فحسابه مخترق على الأرجح، فأخبره باتصال هاتفي.");
    } else if (v.lvl.k === "warn") {
      a.push("لا تفتحه قبل أن تتأكد من المرسل بوسيلة أخرى (اتصال هاتفي مثلاً)، خصوصاً إن جاء مع استعجال أو جائزة أو تهديد بإغلاق حساب.");
      if (b) a.push(`للوصول إلى ${b.ar} اكتب ${b.domains[0]} بنفسك بدل الضغط على الرابط.`);
      a.push("إن فتحته فلا تُدخل أي بيانات ولا تحمّل أي ملف، وأغلق الصفحة إن طلبت تسجيل دخول.");
    } else {
      a.push(v.dead ? "النطاق غير موجود حالياً فلن يفتح شيئاً. تأكد من كتابة الرابط." : "لم نجد ما يدعو للقلق، لكن غياب العلامات ليس شهادة أمان.");
      a.push("القاعدة الثابتة: لا تكتب كلمة مرورك أو رمز التحقق في صفحة وصلت إليها من رابط. افتح الموقع بنفسك.");
    }
    if (has("file") || has("page-download")) a.push("لا تثبّت أي ملف APK أو EXE من رابط. التطبيقات من Google Play أو App Store فقط.");
    if (has("shortener") && !(S.dest && S.dest.expanded)) a.push("الرابط مختصر ولم نتمكن من كشف وجهته: اطلب من المرسل الرابط الأصلي.");
    if (has("iplogger")) a.push("مجرد فتح هذا الرابط يكشف عنوان IP ومدينتك التقريبية ونوع جهازك لمن أرسله.");
    return a;
  }

  /* ---------- العرض ---------- */
  const STATE = { run: ["loader-circle", "muted", "spin"], ok: ["circle-check", "success", ""], bad: ["circle-x", "danger", ""], warn: ["circle-alert", "warn", ""], na: ["circle-minus", "muted", ""] };
  const rowsHTML = (t) => Object.entries(t.rows).map(([k, v]) => { const st = STATE[v.state] || STATE.na; return `<li class="lk-row is-${v.state}"><span class="lk-row-ico" style="color:var(--${st[1] === "muted" ? "muted" : st[1]})">${ic(st[0], st[2])}</span><div><b>${esc(CHECKS[k].label)}</b><span>${esc(v.text)}</span></div></li>`; }).join("");
  const order = { danger: 0, warn: 1, info: 2, ok: 3 };
  const flagsHTML = (flags) => [...flags].sort((a, b) => order[a.lvl] - order[b.lvl] || (b.pts || 0) - (a.pts || 0)).map((c) => `<div class="alert alert-${c.lvl === "ok" ? "success" : c.lvl}">${ic(c.icon)}<div><strong>${esc(c.t)}${c.live ? ` <span class="badge badge-${c.lvl === "ok" ? "success" : c.lvl} lk-live">فحص حي</span>` : ""}</strong><p>${esc(c.d)}</p></div></div>`).join("");

  function anatomy(r) {
    if (r.special) return `<div class="lk-url ltr" dir="ltr"><b class="lk-bad">${esc(r.label)}</b><span>${esc(r.input.slice(r.label.length, 200))}</span></div>`;
    const u = r.url; const sub = r.host.endsWith(r.reg) ? r.host.slice(0, r.host.length - r.reg.length) : "";
    const cut = (s, n) => (s.length > n ? s.slice(0, n) + "…" : s);
    return `<div class="lk-url ltr" dir="ltr"><span>${esc(u.protocol)}//</span>${u.username ? `<s title="يُتجاهل">${esc(cut((() => { try { return decodeURIComponent(u.username); } catch { return u.username; } })(), 40))}${u.password ? ":…" : ""}@</s>` : ""}<span>${esc(sub)}</span><b>${esc(r.reg)}</b>${u.port ? `<span>:${esc(u.port)}</span>` : ""}<span class="lk-path">${esc(cut(u.pathname === "/" ? "" : u.pathname, 90))}${esc(cut(u.search, 90))}${esc(cut(u.hash, 40))}</span></div>`;
  }
  function tableHTML(r) {
    if (r.special) return "";
    const row = (k, v, strong) => (v ? `<tr><th>${k}</th><td class="ltr mono" dir="ltr" style="text-align:right">${strong ? `<strong>${esc(v)}</strong>` : esc(v)}</td></tr>` : "");
    let path = r.url.pathname; try { path = decodeURI(path); } catch { /* keep */ }
    return `<table class="kv mt-2"><tbody>
      ${row("النطاق الحقيقي (الأهم)", r.reg, true)}
      ${row("الاسم بحروفه الفعلية", r.hostU !== r.host ? r.hostU : "")}
      ${row("اسم الموقع الكامل", r.host !== r.reg ? r.host : "")}
      ${row("البروتوكول", r.url.protocol)}
      ${row("المسار", path !== "/" ? path.slice(0, 300) : "")}
      ${row("المعاملات", r.url.search.slice(0, 400))}
    </tbody></table>`;
  }

  function reportText(v) {
    const r = S.r; const L = [];
    L.push("تقرير فحص رابط | الإمبراطورية العراقية", "");
    L.push(`الرابط (معطَّل كي لا يُفتح بالخطأ): ${E.defang(r.href || r.input)}`);
    L.push(`النتيجة: ${v.dead ? "النطاق غير موجود حالياً" : v.lvl.label} (${v.score}/100)`);
    if (r.reg) L.push(`النطاق الحقيقي: ${E.defang(r.reg)}`);
    if (S.dest && S.dest.r) L.push(`الوجهة الفعلية${S.dest.via ? ` (عبر ${S.dest.via})` : ""}: ${E.defang(S.dest.r.href)}`);
    const sec = (title, flags) => { const f = flags.filter((x) => x.lvl !== "ok" && x.id !== "https"); if (f.length) { L.push("", title); f.forEach((x) => L.push(`- ${x.t}: ${x.d}`)); } };
    sec("الأسباب:", [...r.flags, ...(S.main ? S.main.flags : [])]);
    if (S.dest && S.dest.r) sec("عن الوجهة الفعلية:", [...S.dest.r.flags, ...S.dest.flags]);
    const rows = (t, title) => { if (t && Object.keys(t.rows).length) { L.push("", title); Object.entries(t.rows).forEach(([k, x]) => L.push(`- ${CHECKS[k].label}: ${x.text}`)); } };
    rows(S.main, "الفحوص الحية:"); rows(S.dest, "الفحوص الحية للوجهة:");
    L.push("", "ماذا تفعل:"); advice(v).forEach((x) => L.push(`- ${x}`));
    L.push("", "تنبيه: لا توجد أداة تضمن أمان رابط 100%. غياب العلامات ليس شهادة أمان.", location.origin + location.pathname);
    return L.join("\n");
  }

  function render() {
    if (!S || !S.r) { out.innerHTML = ""; return; }
    const r = S.r;
    if (r.error) { out.innerHTML = `<div class="alert alert-danger">${ic("x-circle")}<span>${esc(r.error)}</span></div>`; icons(); return; }
    const v = verdict(); const color = v.dead ? "var(--info)" : `var(--${v.lvl.k})`; const soft = v.dead ? "var(--info-soft)" : `var(--${v.lvl.k}-soft)`;
    const title = v.dead ? "النطاق غير موجود حالياً" : v.lvl.label;
    const enc = encodeURIComponent(r.href || r.input); const dest = S.dest; const dr = dest && dest.r;
    const x = S.expand;
    const pending = !S.done;
    const mainFlags = [...r.flags, ...(S.main ? S.main.flags : [])];
    const chain = x && x.state === "ok" && x.chain && x.chain.length > 1 ? `<ol class="lk-chain ltr" dir="ltr">${x.chain.map((c, i) => `<li><span class="mono">${esc(String(c.url).slice(0, 110))}${String(c.url).length > 110 ? "…" : ""}</span>${c.status ? `<i>${esc(String(c.status))}${c.via ? " · " + esc(c.via) : ""}</i>` : ""}</li>`).join("")}</ol>` : "";

    out.innerHTML = `
      ${S.others && S.others.length ? `<div class="alert alert-info">${ic("list")}<div><strong>وجدنا ${S.others.length + 1} روابط في النص، وفحصنا الأول</strong><p class="flex wrap gap-1 mt-1">${S.others.map((o) => `<button class="tag-link ltr" data-other="${esc(o)}">${esc(o.slice(0, 48))}</button>`).join("")}</p></div></div>` : ""}
      <div class="card lk-verdict" style="border-color:${color}">
        <div class="flex gap-2 items-center wrap">
          <span class="ico" style="width:64px;height:64px;background:${soft};color:${color}">${ic(v.dead ? "unplug" : v.lvl.icon)}</span>
          <div style="flex:1;min-width:200px"><h2 class="mb-0" style="font-size:1.4rem;font-family:var(--font);color:${color}">${title}</h2>
          <p class="mb-0 muted">درجة الخطورة <b style="color:${color}">${v.score}</b>/100${pending ? ` · <span class="lk-pending">${ic("loader-circle", "spin")}الفحوص الحية مستمرة…</span>` : S.offline ? " · تحليل بنيوي فقط" : ""}</p></div>
        </div>
        <div class="meter mt-2"><i style="width:${Math.max(4, v.score)}%;background:${color}"></i></div>
        ${anatomy(r)}
        ${dr && dest.expanded ? `<p class="small mb-0 mt-1">${ic("corner-left-down")} <strong>لكنه ينتهي فعلياً في:</strong></p>${anatomy(dr)}` : ""}
        ${r.reg ? `<p class="small muted mb-0 mt-1">${ic("corner-down-left")} الجزء المظلّل هو الموقع الذي ستدخله فعلاً. كل ما عداه يكتبه صاحب الرابط كما يشاء.</p>` : ""}
        <div class="lk-advice mt-2"><strong>${ic("list-checks")}ماذا تفعل؟</strong><ul>${advice(v).map((a) => `<li>${esc(a)}</li>`).join("")}</ul></div>
        <div class="btn-row mt-2"><button class="btn btn-primary btn-sm" id="lk-copy">${ic("clipboard-copy")}نسخ التقرير</button>${navigator.share ? `<button class="btn btn-ghost btn-sm" id="lk-share">${ic("share-2")}مشاركة التقرير</button>` : ""}</div>
      </div>

      ${x ? `<div class="card" style="${dr && dest.expanded ? "border-color:var(--gold)" : ""}">
        <div class="card-title"><span class="ico ico-sm">${ic("route")}</span><h3>${r.shortener ? "الوجهة الحقيقية للرابط المختصر" : "تتبّع التحويلات"}</h3></div>
        ${x.state === "run" ? `<p class="mb-0 muted">${ic("loader-circle", "spin")} نتتبّع الرابط من خادم وسيط لنعرف أين ينتهي، دون أن يُفتح في جهازك…</p>`
          : x.state === "fail" ? `<p class="mb-0">${ic("circle-alert")} لم نتمكن من كشف الوجهة الآن${r.shortener ? " (الخدمة المجانية لها حد يومي، أو أن الرابط محذوف)" : ""}. جرّب: <a target="_blank" rel="noopener" href="https://unshorten.it/?url=${enc}">unshorten.it</a> أو <a target="_blank" rel="noopener" href="https://urlscan.io/">urlscan.io</a>، ولا تفتحه مباشرة.</p>`
          : x.same ? `<p class="mb-0">${ic("circle-check")} الرابط لا يحوّل إلى موقع آخر.${x.title ? ` عنوان الصفحة: «${esc(x.title.slice(0, 90))}»` : ""}</p>`
          : `<p class="small muted">هذا الرابط لا يأخذك إلى ${esc(r.reg)}، بل ينتهي هنا (كُشف عبر ${esc(x.source)}):</p>${anatomy(dr)}${x.title ? `<p class="small mt-1 mb-0">عنوان الصفحة: «${esc(x.title.slice(0, 120))}»</p>` : ""}${chain}
             <div class="input-group mt-2"><input class="input ltr mono" readonly value="${esc(dr.href)}" dir="ltr"><button class="btn btn-ghost" data-copy="${esc(dr.href)}">${ic("copy")}نسخ</button></div>`}
      </div>` : ""}

      ${dr ? `<div class="card">
        <div class="card-title"><span class="ico ico-sm">${ic("flag")}</span><h3>فحص الوجهة: <span class="ltr mono">${esc(dr.reg)}</span></h3></div>
        ${dest.expanded ? "" : `<p class="small muted">الرابط يحمل هذه الوجهة داخله (${esc(dest.via || "")}):</p>${anatomy(dr)}`}
        ${Object.keys(dest.rows).length ? `<ul class="lk-rows mt-2">${rowsHTML(dest)}</ul>` : ""}
        <div class="stack mt-2" style="gap:10px">${flagsHTML([...dr.flags, ...dest.flags]) || `<p class="muted mb-0">لا علامات خطر في بنية الوجهة.</p>`}</div>
      </div>` : ""}

      ${S.main && Object.keys(S.main.rows).length ? `<div class="card">
        <div class="card-title"><span class="ico ico-sm">${ic("radar")}</span><h3>الفحوص الحية${dr ? ` للرابط نفسه (${esc(r.reg)})` : ""}</h3></div>
        <ul class="lk-rows">${rowsHTML(S.main)}</ul>
        <p class="small muted mt-2 mb-0">${ic("info")} يُرسل اسم النطاق فقط إلى هذه المصادر (ومعه مسار الصفحة إلى فحص «التصفح الآمن» من غوغل)${x ? " (والرابط كاملاً إلى خدمة كشف الوجهة)" : ""}. قوائم التصيد تُحمَّل إلى متصفحك وتُطابق فيه.</p>
      </div>` : ""}

      <div class="card">
        <div class="card-title"><span class="ico ico-sm">${ic("split")}</span><h3>تشريح الرابط والأسباب</h3></div>
        ${tableHTML(r)}
        <div class="stack mt-2" style="gap:10px">${flagsHTML(mainFlags) || `<p class="muted mb-0">لا علامات خطر في بنية الرابط.</p>`}</div>
      </div>

      ${r.trackers && r.trackers.length ? `<div class="card"><div class="card-title"><span class="ico ico-sm">${ic("sparkles")}</span><h3>الرابط النظيف (بدون تتبع)</h3></div>
        <div class="input-group"><input class="input ltr mono" readonly value="${esc(r.clean)}" dir="ltr"><button class="btn btn-ghost" data-copy="${esc(r.clean)}">${ic("copy")}نسخ</button></div></div>` : ""}

      ${r.special ? "" : `<div class="card">
        <div class="card-title"><span class="ico ico-sm">${ic("scan-search")}</span><h3>رأي ثانٍ من خدمات متخصصة</h3></div>
        <p class="small">هذه الخدمات تفتح الصفحة نفسها في حاسوب معزول وتصوّرها لك، وهو ما لا تستطيعه أداة تعمل داخل المتصفح:</p>
        <div class="btn-row">
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.virustotal.com/gui/search/${encodeURIComponent(enc)}">${ic("bug")}VirusTotal</a>
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://urlscan.io/search/#${encodeURIComponent("page.domain:" + r.host)}">${ic("scan")}urlscan.io</a>
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://transparencyreport.google.com/safe-browsing/search?url=${enc}">${ic("shield")}Google Safe Browsing</a>
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://www.whois.com/whois/${encodeURIComponent(r.reg || "")}">${ic("file-search")}Whois</a>
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://crt.sh/?q=${encodeURIComponent(r.reg || "")}">${ic("file-badge")}crt.sh</a>
        </div>
      </div>`}`;
    icons();
    const c = $("#lk-copy"); if (c) c.addEventListener("click", () => copy(reportText(verdict())));
    const sh = $("#lk-share"); if (sh) sh.addEventListener("click", () => navigator.share({ title: "تقرير فحص رابط", text: reportText(verdict()) }).catch(() => {}));
    $$("[data-other]", out).forEach((b) => b.addEventListener("click", () => { $("#u").value = b.dataset.other; go(); }));
  }

  function go() {
    const v = $("#u").value.trim(); const u = new URL(location.href);
    if (v) u.searchParams.set("u", v.slice(0, 1500)); else u.searchParams.delete("u");
    history.replaceState(null, "", u);
    if (!v) { runId++; S = null; out.innerHTML = ""; return; }
    run(v).catch(() => { toast && toast("حدث خطأ أثناء الفحص", "circle-alert"); });
  }
  $("#go").addEventListener("click", go);
  $("#u").addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); go(); } });
  $("#u").addEventListener("paste", () => setTimeout(go, 30));
  $$("[data-ex]").forEach((b) => b.addEventListener("click", () => { $("#u").value = b.dataset.ex; go(); }));
  const pasteBtn = $("#paste"); if (pasteBtn) pasteBtn.addEventListener("click", async () => { try { const t = await navigator.clipboard.readText(); if (t) { $("#u").value = t.trim(); go(); } } catch { toast && toast("اسمح للموقع بقراءة الحافظة أو الصق يدوياً", "circle-alert"); } });
  const init = param("u"); if (init) { $("#u").value = init.slice(0, 2000); if (App.fromOwnSite()) go(); }
})();
