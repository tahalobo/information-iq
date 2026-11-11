(function () {
  const { $, $$, esc, ic, icons, copy, fmtNum } = App;

  const COMMON = ["123456", "123456789", "12345678", "password", "qwerty", "111111", "123123", "12345", "1234567", "000000", "1234567890", "abc123", "iloveyou", "admin", "welcome", "qwerty123", "1q2w3e4r", "aa123456", "password1", "102030", "112233", "999999", "147258369", "baghdad", "iraq", "iraq123", "basra", "mosul", "erbil", "ali123", "mohammed", "hussein", "zahraa", "fatima", "love", "instagram", "facebook", "whatsapp", "google", "football", "realmadrid", "barcelona", "messi", "ronaldo", "cr7", "princess", "sunshine", "dragon", "master", "superman", "letmein", "monkey", "shadow"];
  const SEQS = ["0123456789", "abcdefghijklmnopqrstuvwxyz", "qwertyuiop", "asdfghjkl", "zxcvbnm", "1qaz2wsx", "!@#$%^&*()"];

  function analyze(pw) {
    const checks = []; if (!pw) return null;
    let pool = 0;
    const lower = /[a-z]/.test(pw), upper = /[A-Z]/.test(pw), digit = /\d/.test(pw), sym = /[^A-Za-z0-9؀-ۿ]/.test(pw), arabic = /[؀-ۿ]/.test(pw);
    if (lower) pool += 26; if (upper) pool += 26; if (digit) pool += 10; if (sym) pool += 33; if (arabic) pool += 36;
    let bits = pw.length * Math.log2(Math.max(pool, 2));
    const low = pw.toLowerCase();

    checks.push({ ok: pw.length >= 12, t: pw.length >= 12 ? `طول ممتاز (${pw.length} حرفاً)` : `قصيرة (${pw.length} أحرف). 12 حرفاً على الأقل` });
    checks.push({ ok: [lower, upper, digit, sym || arabic].filter(Boolean).length >= 3, t: "تنوّع: أحرف كبيرة وصغيرة وأرقام ورموز" });

    const common = COMMON.find((w) => low.includes(w) && w.length >= 4);
    if (COMMON.includes(low)) { bits = Math.min(bits, 4); checks.push({ ok: false, t: "من أشهر كلمات المرور في العالم! تُكسر فوراً" }); }
    else if (common) { bits -= common.length * 2.5; checks.push({ ok: false, t: `تحتوي على كلمة شائعة («${common}»)` }); }

    let seq = 0; for (const s of SEQS) for (let n = 4; n <= s.length; n++) for (let i = 0; i + n <= s.length; i++) { const sub = s.substr(i, n); if (low.includes(sub) || low.includes([...sub].reverse().join(""))) seq = Math.max(seq, n); }
    if (seq) { bits -= seq * 2.5; checks.push({ ok: false, t: "تسلسل متتابع (مثل 1234 أو qwerty)" }); }

    if (/(.)\1{2,}/.test(pw)) { bits -= 8; checks.push({ ok: false, t: "أحرف مكررة (مثل aaa أو 111)" }); }
    if (/(19[5-9]\d|20[0-3]\d)/.test(pw)) { bits -= 6; checks.push({ ok: false, t: "تحتوي على سنة، وغالباً سنة الميلاد يسهل تخمينها" }); }
    if (/07[3-9]\d{8}/.test(pw)) { bits -= 20; checks.push({ ok: false, t: "تحتوي على رقم هاتف عراقي، وهو أول ما يجرّبه المخترق" }); }
    if (/^[A-Za-z]+\d+$/.test(pw)) { bits -= 6; checks.push({ ok: false, t: "نمط «كلمة + أرقام» متوقع جداً" }); }

    bits = Math.max(0, bits);
    const secs = Math.pow(2, bits) / 1e10 / 2; // 10 billion guesses/sec (offline GPU attack), average case
    const lvl = bits < 28 ? 0 : bits < 40 ? 1 : bits < 60 ? 2 : bits < 80 ? 3 : 4;
    return { bits, secs, lvl, checks };
  }

  function human(s) {
    if (s < 1) return "أقل من ثانية";
    const U = [["سنة", "سنوات", 31557600], ["شهر", "أشهر", 2629800], ["يوم", "أيام", 86400], ["ساعة", "ساعات", 3600], ["دقيقة", "دقائق", 60], ["ثانية", "ثوانٍ", 1]];
    if (s > 31557600 * 1e9) return "مليارات السنين";
    if (s > 31557600 * 1e6) return `${fmtNum(Math.round(s / 31557600 / 1e6))} مليون سنة`;
    for (const [one, few, v] of U) if (s >= v) { const n = Math.round(s / v); return `${fmtNum(n)} ${n >= 3 && n <= 10 ? few : one}`; }
  }

  const LV = [["ضعيفة جداً", "var(--danger)"], ["ضعيفة", "var(--danger)"], ["متوسطة", "var(--warn)"], ["قوية", "var(--success)"], ["قوية جداً", "var(--success)"]];
  function render() {
    const r = analyze($("#pw").value);
    $("#pwned-out").innerHTML = "";
    if (!r) { $("#bar").style.width = "0"; $("#label").textContent = "—"; $("#crack").textContent = ""; $("#checks").innerHTML = ""; return; }
    const [t, c] = LV[r.lvl];
    Object.assign($("#bar").style, { width: `${Math.max(6, (r.lvl + 1) * 20)}%`, background: c });
    $("#label").textContent = t; $("#label").style.color = c;
    $("#crack").textContent = `وقت الكسر التقريبي: ${human(r.secs)}`;
    $("#checks").innerHTML = r.checks.map((x) => `<div class="flex gap-1 items-center small"><span class="${x.ok ? "text-success" : "text-danger"}">${ic(x.ok ? "check-circle-2" : "x-circle")}</span>${esc(x.t)}</div>`).join("");
    icons();
  }

  async function pwned() {
    const pw = $("#pw").value; const out = $("#pwned-out");
    if (!pw) return;
    out.innerHTML = `<div class="alert alert-info">${ic("loader")}<span>جارِ الفحص…</span></div>`; icons();
    try {
      const h = [...new Uint8Array(await crypto.subtle.digest("SHA-1", new TextEncoder().encode(pw)))].map((b) => b.toString(16).padStart(2, "0")).join("").toUpperCase();
      const res = await fetch(`https://api.pwnedpasswords.com/range/${h.slice(0, 5)}`, { headers: { "Add-Padding": "true" } });
      if (!res.ok) throw new Error();
      const line = (await res.text()).split("\n").find((l) => l.startsWith(h.slice(5)));
      const n = line ? parseInt(line.split(":")[1], 10) : 0;
      out.innerHTML = n > 0
        ? `<div class="alert alert-danger">${ic("siren")}<div><strong>ظهرت ${fmtNum(n)} مرة في تسريبات!</strong><p>غيّرها فوراً في كل حساب تستخدمها فيه، فهي موجودة في قوائم المخترقين.</p></div></div>`
        : `<div class="alert alert-success">${ic("badge-check")}<div><strong>لم تظهر في أي تسريب معروف</strong><p>هذا جيد، لكن تأكد أيضاً أنها قوية وغير مستخدمة في حسابات أخرى.</p></div></div>`;
    } catch {
      out.innerHTML = `<div class="alert alert-warn">${ic("wifi-off")}<span>تعذّر الاتصال بخدمة الفحص. تحقق من الإنترنت وحاول لاحقاً.</span></div>`;
    }
    icons();
  }

  /* Generator */
  const WORDS = ["Tiger", "Moon", "River", "Paper", "Palm", "Date", "Falcon", "Desert", "Cedar", "Amber", "Silver", "Castle", "Bridge", "Lantern", "Garden", "Thunder", "Ocean", "Comet", "Honey", "Marble", "Copper", "Zebra", "Violet", "Rocket", "Planet", "Pepper", "Mango", "Orbit", "Crystal", "Harbor", "Meadow", "Canyon", "Pixel", "Shadow", "Breeze", "Saffron", "Lemon", "Cobalt", "Ivory", "Phoenix", "Nomad", "Oasis", "Summit", "Willow", "Coral", "Galaxy", "Basil", "Cactus", "Delta", "Ember", "Fable", "Glacier", "Harvest", "Island", "Jasmine", "Kettle", "Lotus", "Magnet", "Nectar", "Olive", "Parrot", "Quartz", "Raven", "Sphinx", "Tulip", "Umbrella", "Velvet", "Walnut", "Yogurt", "Zenith", "Anchor", "Banner", "Candle", "Dolphin", "Engine", "Forest", "Guitar", "Helmet", "Igloo", "Jungle", "Koala", "Ladder", "Mirror", "Needle", "Orange", "Pillow", "Quiver", "Ribbon", "Saddle", "Tunnel", "Unicorn", "Vessel", "Window", "Yacht", "Zipper", "Babylon", "Tigris", "Sumer", "Ziggurat", "Lion", "Eagle", "Wolf", "Storm"];
  const rand = (n) => { const a = new Uint32Array(1); const lim = Math.floor(0xFFFFFFFF / n) * n; do crypto.getRandomValues(a); while (a[0] >= lim); return a[0] % n; };
  let gmode = "random";
  function generate() {
    let pw = "", bits = 0;
    if (gmode === "phrase") {
      const n = +$("#words").value; const w = Array.from({ length: n }, () => WORDS[rand(WORDS.length)]);
      pw = w.join("-") + "-" + rand(100); bits = n * Math.log2(WORDS.length) + Math.log2(100);
    } else {
      const amb = $("#g-amb").checked;
      let sets = [];
      if ($("#g-up").checked) sets.push(amb ? "ABCDEFGHJKLMNPQRSTUVWXYZ" : "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
      if ($("#g-low").checked) sets.push(amb ? "abcdefghijkmnopqrstuvwxyz" : "abcdefghijklmnopqrstuvwxyz");
      if ($("#g-num").checked) sets.push(amb ? "23456789" : "0123456789");
      if ($("#g-sym").checked) sets.push("!@#$%^&*()-_=+[]{};:,.?/");
      if (!sets.length) { sets = ["abcdefghijkmnopqrstuvwxyz"]; $("#g-low").checked = true; }
      const all = sets.join(""), len = +$("#len").value;
      const chars = sets.map((s) => s[rand(s.length)]); // at least one of each
      while (chars.length < len) chars.push(all[rand(all.length)]);
      for (let i = chars.length - 1; i > 0; i--) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
      pw = chars.join(""); bits = len * Math.log2(all.length);
    }
    $("#gen").value = pw;
    $("#gen-strength").textContent = `قوة تقريبية: ${Math.round(bits)} بت، ووقت الكسر ${human(Math.pow(2, bits) / 2e10)}`;
  }

  $("#pw").addEventListener("input", render);
  $("#eye").addEventListener("click", () => { const p = $("#pw"); p.type = p.type === "password" ? "text" : "password"; });
  $("#pwned").addEventListener("click", pwned);
  $$("#gmode [data-g]").forEach((b) => b.addEventListener("click", () => {
    gmode = b.dataset.g; $$("#gmode [data-g]").forEach((x) => x.classList.toggle("active", x === b));
    $("#g-random").hidden = gmode !== "random"; $("#g-phrase").hidden = gmode !== "phrase"; generate();
  }));
  ["#len", "#words"].forEach((s) => $(s).addEventListener("input", (e) => { $(s + "-v").textContent = e.target.value; generate(); }));
  $$("#g-random input[type=checkbox]").forEach((c) => c.addEventListener("change", generate));
  $("#regen").addEventListener("click", generate);
  $("#copy-gen").addEventListener("click", () => copy($("#gen").value, "نُسخت كلمة المرور"));
  generate();
})();
