/* ==========================================================
   تحليل النص العربي لأغراض SEO: تطبيع، تجذير خفيف، كلمات مفتاحية، تشابه TF-IDF
   بلا أي مكتبة خارجية.
   ========================================================== */

export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const strip = (h) => String(h || "").replace(/<(br|\/p|\/li|\/h\d|\/div)\b[^>]*>/gi, " \n").replace(/<[^>]+>/g, " ")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
export const oneLine = (s) => String(s || "").replace(/\s+/g, " ").trim();

/* تطبيع عربي: حذف التشكيل والتطويل وتوحيد الألف والياء والتاء المربوطة */
export const norm = (s) => String(s || "").toLowerCase()
  .replace(/[ً-ٰٟـ]/g, "")
  .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
  .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

/* تجذير خفيف: حروف العطف والجر الملتصقة ثم «ال» */
export function stem(w) {
  if (!/[؀-ۿ]/.test(w)) return w;
  let x = w;
  if (x.length > 4 && /^[وف]/.test(x) && /^(?:.ال|.[بلك]ال|.لل)/.test(x)) x = x.slice(1);
  if (x.length > 5 && /^[بكف]ال/.test(x)) x = x.slice(3);
  else if (x.length > 4 && /^لل/.test(x)) x = x.slice(2);
  else if (x.length > 4 && /^ال/.test(x)) x = x.slice(2);
  return x;
}

const STOP = new Set(`في من علي الي حتي على الى عن مع هذا هذه ذلك تلك التي الذي الذين اللذين هو هي هم هن كان كانت يكون تكون ليس لم لن لا ما ان ان او ثم بل قد كل بعض غير بين عند بعد قبل حتى اذا اذ حيث كما لكن لان انه انها فان وان الا اي ايضا فقط جدا اكثر اقل منذ خلال حول نحو ضد دون عبر لدى له لها لهم به بها فيه فيها عليه عليها منه منها اليه اليها هناك هنا نحن انا انت انتم كانوا يكن تم يتم وقد وهو وهي وفي ومن وعلى وما ولا ولم وكان ذات ذو مثل عام سنه يوم مره اول ثاني واحد واحده اثنين ثلاثه عده كثير جديد جديده قديم كبير كبيره صغير اخر اخري اليوم امس غدا هل لماذا كيف متي اين ماذا تعرف تعلم يمكن يجب حين عندما بينما لذلك ولذلك بسبب نتيجه رغم الان حاليا تقريبا جميع بدون ضمن وفق حسب اثناء امام خلف فوق تحت داخل خارج عليهم لديه لديها يعد تعد يعتبر تعتبر اصبح اصبحت ظل مازال مما فيما كانه لقد اننا انهم بان بانه التى وذلك وهذا وهذه فهو فهي الجزء جزء the of and in to for on with from is are was at by an it its this that as be or new will has have not you your after more most all one two`.split(/\s+/));
export const isStop = (w) => w.length < 2 || STOP.has(w) || STOP.has(stem(w)) || /^\d+$/.test(w);

export const tokens = (s) => norm(s).split(" ").filter(Boolean);
export const terms = (s) => tokens(s).filter((w) => !isStop(w)).map(stem).filter((w) => w.length > 1);

/* اقتطاع عند حدود الجملة ثم الكلمة */
export function clip(s, max, min = Math.floor(max * 0.6)) {
  s = oneLine(s);
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const sent = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("؟ "), cut.lastIndexOf("! "), cut.lastIndexOf("، "), cut.lastIndexOf("؛ "));
  if (sent >= min) return cut.slice(0, sent + 1).replace(/[،؛]$/, "").trim() + (/[.؟!]$/.test(cut.slice(0, sent + 1)) ? "" : "…");
  return cut.slice(0, max - 1).replace(/\s+\S*$/, "").replace(/[،؛:,\-–—\s]+$/, "") + "…";
}

/* ---------- TF-IDF ---------- */
export function buildIndex(docs) {
  // docs: [{ id, title, text }]
  const df = new Map();
  const vecs = docs.map((d) => {
    const tf = new Map();
    for (const t of terms(d.title)) tf.set(t, (tf.get(t) || 0) + 3);
    for (const t of terms(d.text)) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of tf.keys()) df.set(t, (df.get(t) || 0) + 1);
    return tf;
  });
  const N = docs.length;
  const idf = (t) => Math.log(1 + N / (df.get(t) || 1));
  const weighted = vecs.map((tf) => {
    const v = new Map(); let n = 0;
    for (const [t, f] of tf) { if ((df.get(t) || 0) < 2) continue; const w = (1 + Math.log(f)) * idf(t); v.set(t, w); n += w * w; }
    n = Math.sqrt(n) || 1;
    for (const [t, w] of v) v.set(t, w / n);
    return v;
  });
  // inverted index for fast neighbours
  const inv = new Map();
  weighted.forEach((v, i) => { for (const [t, w] of v) { if (!inv.has(t)) inv.set(t, []); inv.get(t).push([i, w]); } });
  return { docs, weighted, inv, df, N };
}

export function neighbours(index, i, k = 6, boost = () => 0) {
  const score = new Map();
  for (const [t, w] of index.weighted[i]) {
    const post = index.inv.get(t); if (post.length > index.N * 0.4) continue;
    for (const [j, wj] of post) if (j !== i) score.set(j, (score.get(j) || 0) + w * wj);
  }
  return [...score].map(([j, s]) => [j, s + boost(j)]).sort((a, b) => b[1] - a[1]).slice(0, k);
}

export function topTerms(index, i, k = 8) {
  return [...index.weighted[i]].sort((a, b) => b[1] - a[1]).slice(0, k).map(([t]) => t);
}

/* مطابقة عبارة (بعد التطبيع والتجذير) كسلسلة كلمات متتالية */
export function phraseMatcher(phrases) {
  const pats = phrases.map((p) => tokens(p).map(stem)).filter((p) => p.length);
  return (stemmed) => {
    let hits = 0;
    for (const p of pats) {
      for (let i = 0; i <= stemmed.length - p.length; i++) {
        let ok = true;
        for (let j = 0; j < p.length; j++) if (stemmed[i + j] !== p[j]) { ok = false; break; }
        if (ok) { hits++; i += p.length - 1; }
      }
    }
    return hits;
  };
}

export const slugify = (s) => oneLine(s).replace(/[ً-ٰٟـ]/g, "").replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "").toLowerCase();

export function hash(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(36) + (h1 >>> 0).toString(36);
}
