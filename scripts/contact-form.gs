/* ==========================================================
   نموذج التواصل ← كروب تليغرام — Google Apps Script (مجاني، بلا دومين ولا سيرفر)

   يستقبل رسالة صفحة «تواصل معنا» ويوصلها إلى كروب الفريق عبر بوت تليغرام.
   توكن البوت ورقم الكروب محفوظان في «خصائص السكربت» داخل حسابك على Google فقط،
   فلا يظهران في الموقع ولا في المستودع ولا في Inspect عند الزائر.
   الزائر يرى فقط أن رسالته ذهبت إلى رابط script.google.com، والرد {"ok":true}.

   ─────────────── الإعداد (مرة واحدة، 5 دقائق) ───────────────

   1) البوت والكروب:
      - في تليغرام افتح @BotFather ← /newbot ← انسخ التوكن.
      - أضف البوت إلى كروب الفريق، واكتب في الكروب:  /start@اسم_البوت

   2) السكربت:
      - افتح https://script.google.com ← New project ← سمّه مثلاً «empire-mail».
      - احذف المثال والصق هذا الملف كاملاً ← احفظ (Ctrl+S).
      - ⚙️ Project Settings ← Script Properties ← Add script property:
            TELEGRAM_BOT_TOKEN   = توكن البوت
            TELEGRAM_CHAT_ID     = (اتركه الآن، نعرفه في الخطوة التالية)
            TELEGRAM_THREAD_ID   = اختياري: رقم الموضوع إن كان الكروب مقسّماً لمواضيع

   3) رقم الكروب:
      - من القائمة أعلى المحرر اختر الدالة findChatId ← Run ← وافق على الصلاحيات.
      - افتح Execution log: سترى اسم الكروب ورقمه (يبدأ بـ ‎-100). ضعه في TELEGRAM_CHAT_ID.
      - شغّل الدالة testTelegram: يجب أن تصل رسالة تجربة إلى الكروب.

   4) النشر:
      - Deploy ← New deployment ← ⚙️ Select type: Web app
            Execute as:        Me
            Who has access:    Anyone
      - Deploy ← انسخ رابط Web app (ينتهي بـ ‎/exec).
      - ضعه في assets/js/config.js:   formEndpoint: "https://script.google.com/macros/s/…/exec"

   ملاحظة: عند تعديل هذا الكود لاحقاً: Deploy ← Manage deployments ← ✏️ ← Version: New version ← Deploy
   (هكذا يبقى الرابط نفسه). تغيير التوكن أو رقم الكروب لا يحتاج إعادة نشر.

   إذا تسرّب التوكن: @BotFather ← /revoke ← ضع التوكن الجديد في TELEGRAM_BOT_TOKEN. لا تعديل في الموقع.
   ========================================================== */

var TYPES = {
  general: ["استفسار عام", ""],
  suggest: ["اقتراح معلومة", "المصدر"],
  correction: ["تصحيح خطأ", "المعلومة المقصودة"],
  rumor: ["تحقق من خبر", "رابط الخبر أو المنشور"],
  ads: ["إعلان وتعاون", "اسم الشركة أو النشاط"],
  join: ["الانضمام للفريق", "نماذج الأعمال"]
};
var LIMITS = { name: 80, reply: 120, extra: 400, message: 3500, page: 300 };
var MIN_FILL_MS = 2500;        // البوتات تملأ النموذج فوراً
var WINDOW_SEC = 600;          // نافذة العدّ: 10 دقائق
var MAX_PER_SENDER = 3;        // رسائل لكل وسيلة رد خلال النافذة
var MAX_TOTAL = 40;            // كل الرسائل خلال النافذة (حماية من الإغراق)

function doPost(e) {
  var out;
  try { out = handle_(e); } catch (err) { console.error(err); out = { ok: false, error: "send" }; }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput("");
}

function handle_(e) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("TELEGRAM_BOT_TOKEN"), chat = props.getProperty("TELEGRAM_CHAT_ID");
  if (!token || !chat) return { ok: false, error: "unavailable" };

  var b;
  try { b = JSON.parse((e && e.postData && e.postData.contents) || ""); } catch (err) { return { ok: false, error: "bad-request" }; }
  if (!b || typeof b !== "object") return { ok: false, error: "bad-request" };

  // فخ البوتات: الحقل المخفي ممتلئ، أو النموذج أُرسل أسرع من أي إنسان ← نتظاهر بالنجاح ولا نرسل
  if (b._gotcha || (typeof b.t === "number" && b.t < MIN_FILL_MS)) return { ok: true };

  var d = {
    type: TYPES.hasOwnProperty(b.type) ? b.type : "general",
    name: field_(b.name, LIMITS.name),
    reply: field_(b.reply, LIMITS.reply),
    extra: field_(b.extra, LIMITS.extra),
    message: field_(b.message, LIMITS.message, true),
    page: field_(b.page, LIMITS.page)
  };
  if (!d.name || !d.reply || d.message.length < 10) return { ok: false, error: "missing" };
  if (limited_(d.reply)) return { ok: false, error: "rate" };

  var payload = { chat_id: chat, text: format_(d), parse_mode: "HTML", link_preview_options: { is_disabled: true } };
  var thread = props.getProperty("TELEGRAM_THREAD_ID");
  if (thread) payload.message_thread_id = Number(thread);

  var r = UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/sendMessage", {
    method: "post", contentType: "application/json", payload: JSON.stringify(payload), muteHttpExceptions: true
  });
  // لا نعيد للزائر أي شيء من رد تليغرام
  if (r.getResponseCode() !== 200) { console.error(r.getContentText()); return { ok: false, error: "send" }; }
  return { ok: true };
}

function format_(d) {
  var t = TYPES[d.type], label = t[0], extraLabel = t[1];
  var email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.reply);
  var time = Utilities.formatDate(new Date(), "Asia/Baghdad", "yyyy/MM/dd - HH:mm");
  var lines = [
    "📩 <b>رسالة جديدة من الموقع</b> — #" + d.type,
    "🏷 <b>النوع:</b> " + esc_(label),
    "",
    "👤 <b>الاسم:</b> " + esc_(d.name),
    (email ? "✉️ <b>البريد للرد:</b> " : "💬 <b>للرد:</b> ") + "<code>" + esc_(d.reply) + "</code>"
  ];
  if (d.extra) lines.push("📎 <b>" + esc_(extraLabel || "إضافة") + ":</b> " + esc_(d.extra));
  lines.push("", "<b>الرسالة:</b>", esc_(d.message), "", "🕒 " + time + " (بغداد)");
  if (d.page) lines.push("🔗 " + esc_(d.page));
  return lines.join("\n").slice(0, 4096);
}

function field_(v, max, multiline) {
  var s = typeof v === "string" ? v : "";
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  s = multiline ? s.replace(/\r\n?/g, "\n").replace(/\n{4,}/g, "\n\n\n") : s.replace(/\s+/g, " ");
  return s.trim().slice(0, max);
}

function esc_(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }

// Apps Script لا يعرف عنوان IP الزائر، فنعدّ حسب وسيلة الرد + عدّاداً عاماً
function limited_(reply) {
  var cache = CacheService.getScriptCache();
  var bucket = Math.floor(Date.now() / (WINDOW_SEC * 1000));
  var keys = ["all:" + bucket, "r:" + bucket + ":" + reply.toLowerCase().slice(0, 120)];
  var got = cache.getAll(keys);
  var total = Number(got[keys[0]] || 0), mine = Number(got[keys[1]] || 0);
  if (total >= MAX_TOTAL || mine >= MAX_PER_SENDER) return true;
  var put = {}; put[keys[0]] = String(total + 1); put[keys[1]] = String(mine + 1);
  cache.putAll(put, WINDOW_SEC + 60);
  return false;
}

/* ---------- أدوات الإعداد: تُشغَّل يدوياً من المحرر ---------- */

// يعرض أرقام الكروبات التي وصلت منها رسائل للبوت (اكتب /start@اسم_البوت في الكروب أولاً)
function findChatId() {
  var token = PropertiesService.getScriptProperties().getProperty("TELEGRAM_BOT_TOKEN");
  if (!token) throw new Error("ضع TELEGRAM_BOT_TOKEN في Script Properties أولاً");
  var res = JSON.parse(UrlFetchApp.fetch("https://api.telegram.org/bot" + token + "/getUpdates", { muteHttpExceptions: true }).getContentText());
  var seen = {};
  (res.result || []).forEach(function (u) {
    var m = u.message || u.my_chat_member || u.channel_post || u.edited_message;
    if (m && m.chat && !seen[m.chat.id]) { seen[m.chat.id] = 1; console.log((m.chat.title || m.chat.username || m.chat.first_name) + "  ←  " + m.chat.id); }
  });
  if (!Object.keys(seen).length) console.log("لا شيء بعد. اكتب /start@اسم_البوت في الكروب ثم شغّل الدالة مرة أخرى. (إن بقيت فارغة: احذف البوت من الكروب وأضفه من جديد)");
}

// يرسل رسالة تجربة إلى الكروب بالشكل نفسه الذي تصل به رسائل الموقع
function testTelegram() {
  var out = handle_({ postData: { contents: JSON.stringify({ type: "general", name: "تجربة", reply: "test@example.com", message: "هذه رسالة تجربة من سكربت نموذج التواصل.", t: 9999 }) } });
  console.log(JSON.stringify(out));
}
