/* ==========================================================
   مؤقّت المزامنة: عامل Cloudflare مجاني يشغّل «Telegram sync» على GitHub في موعده
   لماذا؟ جدولة GitHub نفسها (schedule) تتأخر ساعات أو تسقط في الحسابات المجانية،
   أما التشغيل اليدوي (workflow_dispatch) فيبدأ فوراً. هذا العامل يضغط «Run workflow» بدلاً عنك كل ربع ساعة.

   الإعداد (مرة واحدة، من لوحة Cloudflare، بلا بطاقة):
     1) Workers & Pages ← Create ← Start with Hello World ← الاسم empire-cron ← Deploy
     2) Edit code ← الصق هذا الملف كله ← Deploy
     3) Settings ← Variables and Secrets ← Add:
          النوع Secret · الاسم GITHUB_TOKEN · القيمة: رمز GitHub (fine-grained) على هذا المستودع فقط،
          بصلاحية واحدة: Actions = Read and write
     4) Settings ← Trigger Events ← Add ← Cron Triggers ← كل 15 دقيقة (الصيغة مكتوبة في worker/README.md)
   الرمز يبقى سراً داخل Cloudflare: لا يظهر في الموقع ولا في المستودع، ولا يستطيع إلا تشغيل الـ Actions.

   إعدادات اختيارية (Variables، نوع Text):
     GITHUB_REPO   المستودع (الافتراضي tahalobo/information-iq)
     WORKFLOW      ملف سير العمل (الافتراضي telegram-sync.yml)
     BRANCH        الفرع (الافتراضي main)
   ========================================================== */

const DEFAULTS = { repo: "tahalobo/information-iq", workflow: "telegram-sync.yml", branch: "main" };
const NAME_RE = /^[\w.-]+$/;

async function dispatch(env) {
  const repo = String(env.GITHUB_REPO || DEFAULTS.repo), workflow = String(env.WORKFLOW || DEFAULTS.workflow), branch = String(env.BRANCH || DEFAULTS.branch);
  if (!env.GITHUB_TOKEN) return { ok: false, error: "no-token" };
  // الأسماء تدخل في رابط الطلب: لا نقبل إلا الصيغة المعروفة
  const [owner, name, extra] = repo.split("/");
  if (extra !== undefined || !NAME_RE.test(owner || "") || !NAME_RE.test(name || "") || !NAME_RE.test(workflow) || !NAME_RE.test(branch)) return { ok: false, error: "bad-config" };
  const headers = { Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "empire-cron-sync", "Content-Type": "application/json" };
  const api = `https://api.github.com/repos/${owner}/${name}/actions/workflows/${workflow}`;

  // إن كان تشغيل سابق ما زال يعمل أو ينتظر فلا نضيف آخر فوقه
  try {
    const r = await fetch(`${api}/runs?per_page=5&branch=${branch}`, { headers, signal: AbortSignal.timeout(10000) });
    if (r.ok) {
      const busy = ((await r.json()).workflow_runs || []).some((w) => w.status !== "completed");
      if (busy) return { ok: true, skipped: "busy" };
    } else { try { await r.body.cancel(); } catch { /* ignore */ } }
  } catch { /* تعذّر السؤال: نحاول التشغيل على أي حال */ }

  const r = await fetch(`${api}/dispatches`, { method: "POST", headers, body: JSON.stringify({ ref: branch }), signal: AbortSignal.timeout(10000) });
  try { await r.body.cancel(); } catch { /* ignore */ }
  // 204 = قُبل الطلب. 401/403 = الرمز خاطئ أو منتهٍ أو بلا صلاحية Actions. 404 = اسم المستودع أو الملف خطأ، أو الرمز لا يرى المستودع
  return r.status === 204 ? { ok: true, started: true } : { ok: false, error: "github", status: r.status };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(dispatch(env).then((res) => console.log("sync", JSON.stringify(res))).catch((e) => console.error("sync failed", e && e.message)));
  },
  // لا تشغيل من الويب: أي زائر يعرف الرابط لا يستطيع إطلاق المزامنة. الصفحة تقول فقط إن العامل موجود وهل وُضع الرمز.
  async fetch(req, env) {
    return new Response(JSON.stringify({ ok: true, service: "empire-cron-sync", token: !!env.GITHUB_TOKEN }), { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
};
