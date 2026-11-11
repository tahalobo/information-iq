"""
بصمات صور الأرشيف (dHash 64-bit) لكي تتعرّف أداة البحث العكسي فوراً على أي صورة نشرناها سابقاً،
داخل المتصفح وبلا رفع.

    python scripts/build-image-index.py

الناتج: assets/js/image-index.js  →  window.IMG_INDEX = { v, items: [[postId, hash, imagePath], ...] }
الخوارزمية نفسها مطبّقة في assets/js/pages/tool-reverse.js (dhash)، فلا تغيّر واحدة دون الأخرى.
"""
import json, os, re, sys
from PIL import Image, ImageOps

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))

def dhash(path):
    im = Image.open(path)
    im = ImageOps.exif_transpose(im).convert("RGB")
    # 1) shrink so the long side is 256 px  2) grey  3) exact area average down to 9x8
    k = 256 / max(im.width, im.height)
    if k < 1:
        im = im.resize((max(1, round(im.width * k)), max(1, round(im.height * k))), Image.Resampling.BOX)
    g = im.convert("L").resize((9, 8), Image.Resampling.BOX)
    px = list(g.get_flattened_data() if hasattr(g, "get_flattened_data") else g.getdata())
    bits = 0
    for y in range(8):
        for x in range(8):
            bits = (bits << 1) | (1 if px[y * 9 + x] > px[y * 9 + x + 1] else 0)
    return f"{bits:016x}"

items = []
tg = os.path.join(ROOT, "assets", "tg", "img")
for name in sorted(os.listdir(tg)) if os.path.isdir(tg) else []:
    m = re.match(r"^(\d+)-(\d+)\.(jpe?g|png|webp)$", name, re.I)
    if not m:
        continue
    try:
        items.append([f"tg-{m.group(1)}", dhash(os.path.join(tg, name)), f"assets/tg/img/{name}"])
    except Exception as e:
        print("skip", name, e, file=sys.stderr)

og = os.path.join(ROOT, "assets", "img", "og")
for name in sorted(os.listdir(og)) if os.path.isdir(og) else []:
    stem, ext = os.path.splitext(name)
    if stem == "default" or ext.lower() not in (".jpg", ".jpeg", ".png", ".webp"):
        continue
    try:
        items.append([stem, dhash(os.path.join(og, name)), f"assets/img/og/{name}"])
    except Exception as e:
        print("skip", name, e, file=sys.stderr)

out = os.path.join(ROOT, "assets", "js", "image-index.js")
with open(out, "w", encoding="utf-8") as f:
    f.write("/* مولّد تلقائياً بواسطة scripts/build-image-index.py: بصمات صور الأرشيف للبحث العكسي */\n")
    f.write("window.IMG_INDEX=" + json.dumps({"v": 1, "items": items}, ensure_ascii=False, separators=(",", ":")) + ";\n")
print(f"OK: {len(items)} image fingerprints -> assets/js/image-index.js")
