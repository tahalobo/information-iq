/* أبعاد الصورة (JPEG / PNG / WebP / GIF) بقراءة ترويسة الملف فقط، بلا مكتبات */
import { openSync, readSync, closeSync, existsSync } from "node:fs";

const cache = new Map();
export function imageSize(file) {
  if (cache.has(file)) return cache.get(file);
  let out = null;
  try { if (existsSync(file)) out = read(file); } catch { out = null; }
  cache.set(file, out);
  return out;
}

function read(file) {
  const fd = openSync(file, "r");
  try {
    const head = Buffer.alloc(32);
    readSync(fd, head, 0, 32, 0);
    if (head.readUInt32BE(0) === 0x89504e47) return { width: head.readUInt32BE(16), height: head.readUInt32BE(20), type: "image/png" };
    if (head.toString("ascii", 0, 3) === "GIF") return { width: head.readUInt16LE(6), height: head.readUInt16LE(8), type: "image/gif" };
    if (head.toString("ascii", 0, 4) === "RIFF" && head.toString("ascii", 8, 12) === "WEBP") {
      const kind = head.toString("ascii", 12, 16);
      if (kind === "VP8 ") return { width: head.readUInt16LE(26) & 0x3fff, height: head.readUInt16LE(28) & 0x3fff, type: "image/webp" };
      if (kind === "VP8L") { const b = head.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1, type: "image/webp" }; }
      if (kind === "VP8X") return { width: head.readUIntLE(24, 3) + 1, height: head.readUIntLE(27, 3) + 1, type: "image/webp" };
      return null;
    }
    if (head[0] === 0xff && head[1] === 0xd8) {
      let pos = 2; const b = Buffer.alloc(9);
      for (let guard = 0; guard < 500; guard++) {
        if (readSync(fd, b, 0, 9, pos) < 9) return null;
        if (b[0] !== 0xff) { pos++; continue; }
        const m = b[1];
        if (m === 0xff) { pos++; continue; }
        if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { width: b.readUInt16BE(7), height: b.readUInt16BE(5), type: "image/jpeg" };
        if (m === 0xd8 || (m >= 0xd0 && m <= 0xd7) || m === 0x01) { pos += 2; continue; }
        pos += 2 + b.readUInt16BE(2);
      }
    }
    return null;
  } finally { closeSync(fd); }
}
