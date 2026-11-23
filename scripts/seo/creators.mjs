/* ==========================================================
   قسم «مبدعون عراقيون»: قراءة scripts/creators.json والتحقق منه
   المصدر يكتبه الأدمن بيده، فنتعامل معه كمدخل غير موثوق:
   - slug لاتيني فقط (يصير اسم ملف ورابطاً)
   - الروابط http/https فقط
   - الصور من assets/img/creators/ فقط ويجب أن تكون موجودة
   - لا يُنشر مبدع بلا published: true وبلا consent.given: true (موافقة صريحة على النشر)
   المبدع الذي فيه خطأ يُتخطّى مع تنبيه، ولا يوقف بناء الموقع.
   ========================================================== */
import { existsSync, readFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IMG = /^assets\/img\/creators\/[A-Za-z0-9._-]+\.(?:jpe?g|png|webp|svg)$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v, max) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F‪-‮⁦-⁩]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "");
const httpUrl = (u) => { try { const x = new URL(String(u)); return /^https?:$/.test(x.protocol) ? x.href : ""; } catch { return ""; } };
const validDate = (d) => DATE.test(d || "") && !isNaN(Date.parse(d + "T12:00:00Z"));
export const serialCode = (n) => `IQC-${String(n).padStart(4, "0")}`;

/* يعيد { list, warnings, broken }. broken = الملف نفسه غير مقروء (JSON معطوب): عندها تُترك الصفحات الموجودة كما هي */
export function loadCreators(root, file = "scripts/creators.json") {
  const warnings = [], full = path.join(root, file);
  if (!existsSync(full)) return { list: [], warnings, broken: false };
  let data;
  try { data = JSON.parse(readFileSync(full, "utf8")); }
  catch (e) { return { list: [], warnings: [`${file}: ليس JSON صالحاً (${e.message}). لم تُحدَّث صفحات المبدعين.`], broken: true }; }
  const raw = Array.isArray(data) ? data : Array.isArray(data && data.creators) ? data.creators : null;
  if (!raw) return { list: [], warnings: [`${file}: لا يحوي قائمة "creators". لم تُحدَّث صفحات المبدعين.`], broken: true };

  const img = (p, who) => {
    if (!p) return null;
    if (typeof p !== "string" || !IMG.test(p)) { warnings.push(`${who}: مسار صورة غير مقبول «${p}» (المقبول: assets/img/creators/اسم-لاتيني.jpg)`); return null; }
    if (!existsSync(path.join(root, p))) { warnings.push(`${who}: الصورة غير موجودة ${p}`); return null; }
    return p;
  };
  const list = [], slugs = new Set(), serials = new Set();
  raw.forEach((c, i) => {
    const who = `مبدع #${i + 1}${c && c.slug ? ` (${c.slug})` : ""}`;
    const skip = (why) => warnings.push(`${who}: لم يُنشر، ${why}`);
    if (!c || typeof c !== "object") return skip("السجل ليس كائناً");
    if (c.published !== true) return; // مسودة: بلا تنبيه
    if (typeof c.slug !== "string" || !SLUG.test(c.slug) || c.slug === "index" || c.slug.length > 60) return skip("slug يجب أن يكون حروفاً لاتينية صغيرة وأرقاماً وشرطات فقط (مثل ali-hassan)");
    if (slugs.has(c.slug)) return skip("slug مكرر");
    const name = str(c.name, 80), field = str(c.field, 40);
    if (!name || !field) return skip("الاسم (name) والمجال (field) مطلوبان");
    if (!c.consent || c.consent.given !== true) return skip("لا توجد موافقة صريحة على النشر (consent.given يجب أن يكون true بعد أخذ موافقة المبدع نفسه)");
    if (!validDate(c.added)) return skip("تاريخ الإضافة added يجب أن يكون بصيغة 2026-01-31");
    if (!Number.isInteger(c.serial) || c.serial < 1 || c.serial > 999999) return skip("الرقم التسلسلي serial يجب أن يكون عدداً صحيحاً موجباً");
    if (serials.has(c.serial)) return skip(`الرقم التسلسلي ${c.serial} مكرر`);
    slugs.add(c.slug); serials.add(c.serial);

    const links = (Array.isArray(c.links) ? c.links : []).map((l) => {
      const url = httpUrl(l && l.url);
      if (!url) { if (l && l.url) warnings.push(`${who}: رابط مرفوض (http/https فقط) «${String(l.url).slice(0, 60)}»`); return null; }
      return { label: str(l.label, 40) || new URL(url).hostname.replace(/^www\./, ""), url };
    }).filter(Boolean).slice(0, 12);
    const works = (Array.isArray(c.works) ? c.works : []).map((w, k) => {
      const title = str(w && w.title, 120);
      if (!title) { warnings.push(`${who}: العمل #${k + 1} بلا عنوان فتُرك`); return null; }
      const url = w.url ? httpUrl(w.url) : "";
      if (w.url && !url) warnings.push(`${who}: رابط العمل «${title}» مرفوض (http/https فقط)`);
      const year = Number.isInteger(w.year) && w.year > 1900 && w.year < 2200 ? w.year : null;
      return { title, desc: str(w.desc, 400), image: img(w.image, `${who} / ${title}`), url, year };
    }).filter(Boolean).slice(0, 60);
    const photo = img(c.photo, who);
    const about = (Array.isArray(c.about) ? c.about : typeof c.about === "string" ? c.about.split(/\n{2,}/) : []).map((p) => str(p, 1500)).filter(Boolean).slice(0, 20);
    const item = {
      slug: c.slug, serial: c.serial, code: serialCode(c.serial), demo: c.demo === true, name, field,
      province: str(c.province, 40), city: str(c.city, 40), bio: str(c.bio, 400), about, photo, works, links, added: c.added,
      consentDate: validDate(c.consent.date) ? c.consent.date : ""
    };
    // بصمة الصورة: استبدال الملف بالاسم نفسه يعيد رسم بطاقة المعاينة
    item.photoHash = photo ? crypto.createHash("md5").update(readFileSync(path.join(root, photo))).digest("hex").slice(0, 10) : "";
    list.push(item);
  });
  list.sort((a, b) => b.added.localeCompare(a.added) || b.serial - a.serial);
  return { list, warnings, broken: false };
}
