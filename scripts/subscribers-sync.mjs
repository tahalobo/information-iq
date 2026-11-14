#!/usr/bin/env node
/* ==========================================================
   عدد مشتركي قنوات الإمبراطورية على تليغرام (قناة المعلومات + كل الفروع)
   ----------------------------------------------------------
   يقرأ العدد الدقيق من الصفحة العامة t.me/<channel> (بلا API ولا توكن)، ويكتب:
     - scripts/subscribers.json        عدد كل قناة وآخر تحديث
     - assets/js/config.js             السطر  followers: N  (المجموع الذي يعرضه الموقع)
   قائمة القنوات من scripts/telegram.config.json، فأي فرع جديد يدخل في المجموع تلقائياً.
   إذا تعذّرت قراءة قناة يُستعمل آخر عدد معروف لها، وإذا لم يُعرف أي عدد لا يتغيّر شيء.

   الاستخدام:  node scripts/subscribers-sync.mjs
   ========================================================== */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const P = {
  config: path.join(ROOT, "scripts/telegram.config.json"),
  store: path.join(ROOT, "scripts/subscribers.json"),
  site: path.join(ROOT, "assets/js/config.js")
};
const UA = "Mozilla/5.0 (compatible; IQInfoEmpireSync/1.0; +https://www.instagram.com/information_1q/)";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function subscribers(channel) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(`https://t.me/${channel}`, { headers: { "User-Agent": UA, "Accept-Language": "en" } });
      if (r.ok) {
        const m = (await r.text()).match(/tgme_page_extra">\s*([\d\s .,]+)\s*(?:subscribers|members)/i);
        const n = m ? +m[1].replace(/\D/g, "") : 0;
        if (n > 0) return n;
      }
    } catch { /* retry */ }
    await sleep(1200 * attempt);
  }
  return 0;
}

const cfg = JSON.parse(await fs.readFile(P.config, "utf8"));
const channels = [{ key: "info", channel: cfg.channel }, ...((cfg.branches && cfg.branches.list) || []).map((b) => ({ key: b.key, channel: b.channel }))];
const store = existsSync(P.store) ? JSON.parse(await fs.readFile(P.store, "utf8")) : { channels: {} };

let fresh = 0;
for (const c of channels) {
  const n = await subscribers(c.channel);
  if (n) { store.channels[c.key] = { channel: c.channel, subscribers: n, at: new Date().toISOString() }; fresh++; }
  else console.log(`  ⚠ ${c.channel}: تعذّرت قراءة العدد${store.channels[c.key] ? `، نبقي آخر عدد (${store.channels[c.key].subscribers})` : ""}`);
  await sleep(400);
}
// قناة أُزيلت من الإعدادات تخرج من المجموع
for (const k of Object.keys(store.channels)) if (!channels.some((c) => c.key === k)) delete store.channels[k];

const total = Object.values(store.channels).reduce((a, c) => a + c.subscribers, 0);
if (!total || !fresh) { console.log("✖ لم يُقرأ أي عدد: لا تغيير."); process.exit(0); }

store.total = total; store.updated = new Date().toISOString();
await fs.writeFile(P.store, JSON.stringify(store, null, 2) + "\n");

const src = await fs.readFile(P.site, "utf8");
const out = src.replace(/(\bfollowers:\s*)\d+/, `$1${total}`);
if (out === src && !new RegExp(`\\bfollowers:\\s*${total}\\b`).test(src)) { console.error("✖ لم أجد السطر followers في assets/js/config.js"); process.exit(1); }
if (out !== src) await fs.writeFile(P.site, out);
console.log(`✔ مشتركو تليغرام: ${total.toLocaleString("en")} في ${Object.keys(store.channels).length} قنوات (قُرئ الآن ${fresh}) · ${Object.entries(store.channels).map(([k, c]) => `${k} ${c.subscribers}`).join(" · ")}`);
