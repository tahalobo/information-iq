/* ==========================================================
   منحوتة الجسيمات ثلاثية الأبعاد (WebGL خام، بلا مكتبات)
   - المنحوتة تعيش داخل "خانات" في الصفحة: أي عنصر فيه data-gl="shape"
   - تنتقل بين الخانات أثناء التمرير وتتحوّل من شكل إلى آخر
   - الأشكال: ziggurat, globe, helix, galaxy, lens, crown, atom, shield, tablet, wave, gate, qr
   ========================================================== */
(function () {
  "use strict";
  const doc = document.documentElement;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) { doc.classList.add("no-gl"); return; }

  const canvas = document.createElement("canvas");
  canvas.className = "gl-stage"; canvas.setAttribute("aria-hidden", "true");
  const gl = canvas.getContext("webgl", { antialias: false, alpha: true, premultipliedAlpha: true, powerPreference: "high-performance" });
  if (!gl) { doc.classList.add("no-gl"); return; }
  document.body.prepend(canvas);
  doc.classList.add("has-gl");

  const small = innerWidth < 760 || (navigator.hardwareConcurrency || 8) <= 4;
  const N = small ? 6500 : 13000;
  const NS = small ? 900 : 1800;
  const TAU = Math.PI * 2, R = Math.random;

  /* ---------- Palette ---------- */
  const GOLD = [1.0, 0.78, 0.36], GOLD2 = [1.0, 0.9, 0.62], LAPIS = [0.27, 0.45, 1.0], TEAL = [0.25, 0.9, 0.8], WHITE = [0.92, 0.94, 1.0], AMBER = [1.0, 0.55, 0.22];
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ---------- Shapes ---------- */
  function build(fn) {
    const P = new Float32Array(N * 3), C = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const o = fn(i);
      P[i * 3] = o[0]; P[i * 3 + 1] = o[1]; P[i * 3 + 2] = o[2];
      const c = o[3] || GOLD; C[i * 3] = c[0]; C[i * 3 + 1] = c[1]; C[i * 3 + 2] = c[2];
    }
    return { P, C };
  }
  const jit = (s) => (R() - 0.5) * s;
  const sprinkle = (c) => (R() < 0.05 ? TEAL : R() < 0.06 ? WHITE : c);

  const SHAPES = {
    ziggurat() {
      const T = [[1.62, -1.3, -0.86], [1.24, -0.86, -0.44], [0.88, -0.44, -0.04], [0.56, -0.04, 0.36], [0.3, 0.36, 0.74]];
      const items = []; let tot = 0;
      T.forEach(([w, y0, y1], i) => {
        const wt = w * 0.93, wn = i < T.length - 1 ? T[i + 1][0] : 0;
        items.push({ k: 0, w, wt, y0, y1, a: 8 * w * (y1 - y0) * 1.2 });
        items.push({ k: 1, wt, wn, y: y1, a: (2 * wt) ** 2 - (2 * wn) ** 2 });
      });
      items.push({ k: 2, a: 0.9 });
      items.forEach((it) => { tot += it.a; it.c = tot; });
      return build(() => {
        const r = R() * tot, it = items.find((x) => r <= x.c);
        let x, y, z;
        if (it.k === 0) {
          let u = R() * 2 - 1, v = R();
          if (R() < 0.38) { if (R() < 0.5) u = R() < 0.5 ? -1 : 1; else v = R() < 0.5 ? 0 : 1; }
          const ww = it.w + (it.wt - it.w) * v, f = Math.floor(R() * 4);
          const lx = u * ww, lz = ww; y = it.y0 + v * (it.y1 - it.y0);
          const a = f * Math.PI / 2; x = lx * Math.cos(a) - lz * Math.sin(a); z = lx * Math.sin(a) + lz * Math.cos(a);
          // brick rows
          if (R() < 0.25) y = it.y0 + Math.round(v * 4) / 4 * (it.y1 - it.y0);
        } else if (it.k === 1) {
          do { x = (R() * 2 - 1) * it.wt; z = (R() * 2 - 1) * it.wt; } while (Math.max(Math.abs(x), Math.abs(z)) < it.wn);
          y = it.y;
        } else {
          const t = R(), s = Math.floor(t * 16) / 16, rise = R() < 0.4;
          y = -1.3 + (rise ? s + R() / 16 : s) * 1.66; z = 1.62 - s * (1.62 - 0.56) + 0.02; x = jit(0.42);
        }
        const g = clamp((y + 1.3) / 2.1, 0, 1);
        return [x, y + 0.2, z, sprinkle(mixc(LAPIS, GOLD, Math.pow(g, 0.6)))];
      });
    },
    globe() {
      return build(() => {
        const q = R(); let x, y, z, c;
        if (q < 0.14) {
          const a = R() * TAU, r = 1.9 + jit(0.06);
          x = Math.cos(a) * r; z = Math.sin(a) * r; y = jit(0.03);
          const t = 0.42; const yy = y * Math.cos(t) - z * Math.sin(t); z = y * Math.sin(t) + z * Math.cos(t); y = yy;
          c = R() < 0.7 ? GOLD : GOLD2;
        } else {
          let lat, lon;
          if (q < 0.6) {
            if (R() < 0.5) { lon = Math.floor(R() * 12) * TAU / 12; lat = (R() - 0.5) * Math.PI; }
            else { lat = (Math.floor(R() * 7) - 3) * Math.PI / 8; lon = R() * TAU; }
            c = R() < 0.2 ? GOLD : TEAL;
          } else { lat = Math.asin(R() * 2 - 1); lon = R() * TAU; c = LAPIS; }
          const r = 1.32;
          x = Math.cos(lat) * Math.cos(lon) * r; y = Math.sin(lat) * r; z = Math.cos(lat) * Math.sin(lon) * r;
        }
        return [x, y, z, sprinkle(c)];
      });
    },
    helix() {
      const H = 3.5, turns = 2.4, Rr = 0.78;
      return build(() => {
        const q = R(); let x, y, z, c;
        if (q < 0.74) {
          const s = q < 0.37 ? 0 : Math.PI; y = (R() - 0.5) * H; const a = (y / H) * turns * TAU + s;
          const rr = Rr + jit(0.1); x = Math.cos(a) * rr + jit(0.05); z = Math.sin(a) * rr + jit(0.05);
          c = s ? GOLD : TEAL;
        } else {
          const k = Math.floor(R() * 30); y = -H / 2 + (k + 0.5) / 30 * H; const a = (y / H) * turns * TAU;
          const t = R() * 2 - 1; x = Math.cos(a) * Rr * t; z = Math.sin(a) * Rr * t; y += jit(0.02);
          c = mixc(LAPIS, WHITE, Math.abs(t) * 0.5);
        }
        return [x, y, z, sprinkle(c)];
      });
    },
    galaxy() {
      return build((i) => {
        let x, y, z, c;
        if (R() < 0.17) {
          const r = Math.pow(R(), 1.8) * 0.5, a = R() * TAU, b = Math.acos(R() * 2 - 1);
          x = r * Math.sin(b) * Math.cos(a); z = r * Math.sin(b) * Math.sin(a); y = r * Math.cos(b) * 0.55;
          c = mixc(GOLD2, WHITE, R());
        } else {
          const arm = i % 3, r = 0.22 + Math.pow(R(), 0.85) * 2.0;
          const a = arm * TAU / 3 + r * 2.5 + jit(0.55 / (r + 0.35));
          x = Math.cos(a) * r; z = Math.sin(a) * r; y = jit(0.16 * (2.3 - r));
          c = mixc(LAPIS, TEAL, clamp(r / 2.2, 0, 1)); if (R() < 0.08) c = GOLD;
        }
        return [x, y, z, sprinkle(c)];
      });
    },
    lens() {
      return build(() => {
        const q = R(); let x, y, z = 0, c, a = R() * TAU, r;
        if (q < 0.24) { r = 1.5 + jit(0.06); c = GOLD; }
        else if (q < 0.33) { r = 1.18 + jit(0.03); c = GOLD2; }
        else if (q < 0.7) { a = Math.floor(R() * 56) / 56 * TAU + jit(0.03); r = 0.36 + Math.pow(R(), 0.8) * 0.72; c = mixc(TEAL, LAPIS, (r - 0.36) / 0.72); z = 0.28 * (1 - r * r / 1.4); }
        else if (q < 0.78) { r = 0.33 + jit(0.03); c = WHITE; z = 0.2; }
        else if (q < 0.9) { const seg = Math.floor(R() * 18); a = (seg + R() * 0.62) / 18 * TAU; r = 1.82; c = LAPIS; }
        else { const ax = R() < 0.5; const t = (R() < 0.5 ? -1 : 1) * (1.58 + R() * 0.42); x = ax ? t : jit(0.02); y = ax ? jit(0.02) : t; return [x, y, 0, GOLD]; }
        x = Math.cos(a) * r; y = Math.sin(a) * r;
        return [x, y, z + jit(0.04), sprinkle(c)];
      });
    },
    crown() {
      const sp = 5, Rr = 1.15;
      return build(() => {
        const q = R(); let a, y, r = Rr, c = GOLD;
        if (q < 0.32) { a = R() * TAU; y = -0.75 + R() * 0.5; if (R() < 0.35) y = R() < 0.5 ? -0.75 : -0.25; }
        else if (q < 0.76) {
          const k = Math.floor(R() * sp); let u = R(), v = R(); if (u + v > 1) { u = 1 - u; v = 1 - v; }
          if (R() < 0.3) v = 0;
          const w = 0.56; a = k * TAU / sp + (u - v) * w * 0.5 + (R() < 0.5 ? 0 : 0); y = -0.25 + (1 - u - v) * 0 + (u * 0 + v * 0);
          // triangle: base at y=-0.25 spanning angle ±w/2, tip at y=0.95
          const t = R(); const s = R() * (1 - t);
          a = k * TAU / sp + (s - (1 - t) / 2) * w; y = -0.25 + t * 1.2; c = mixc(GOLD, GOLD2, t);
        } else if (q < 0.87) {
          const k = Math.floor(R() * sp), b = R() * TAU, e = Math.acos(R() * 2 - 1), rr = 0.11;
          const ta = k * TAU / sp; return [Math.cos(ta) * Rr + rr * Math.sin(e) * Math.cos(b), 1.05 + rr * Math.cos(e), Math.sin(ta) * Rr + rr * Math.sin(e) * Math.sin(b), GOLD2];
        } else if (q < 0.95) {
          const k = Math.floor(R() * 10), b = R() * TAU, rr = Math.sqrt(R()) * 0.09; a = (k + 0.5) * TAU / 10 + rr * Math.cos(b) / Rr; y = -0.5 + rr * Math.sin(b); c = k % 2 ? LAPIS : TEAL; r = Rr + 0.02;
        } else { a = R() * TAU; r = Math.sqrt(R()) * Rr * 0.9; y = -0.7 + R() * 0.3; c = AMBER; }
        return [Math.cos(a) * r, y + 0.1, Math.sin(a) * r, c];
      });
    },
    atom() {
      return build(() => {
        const q = R();
        if (q < 0.22) {
          const k = Math.floor(R() * 9), ca = [Math.cos(k * 2.4) * 0.22 * (k > 0), Math.sin(k * 1.7) * 0.22 * (k > 0), Math.sin(k * 3.1) * 0.22 * (k > 0)];
          const b = R() * TAU, e = Math.acos(R() * 2 - 1), rr = 0.15 * Math.cbrt(R());
          return [ca[0] + rr * Math.sin(e) * Math.cos(b), ca[1] + rr * Math.cos(e), ca[2] + rr * Math.sin(e) * Math.sin(b), k % 2 ? GOLD : TEAL];
        }
        const o = Math.floor(R() * 3), rot = o * Math.PI / 3;
        let a = R() * TAU, rr = 0, col = mixc(LAPIS, TEAL, R() * 0.5);
        if (q > 0.86) { a = o * 2.1 + 0.6; rr = 0.1; col = GOLD2; }
        const b = R() * TAU, e = Math.acos(R() * 2 - 1);
        let x = Math.cos(a) * 1.75 + rr * Math.sin(e) * Math.cos(b), y = Math.sin(a) * 0.62 + rr * Math.cos(e), z = jit(0.03) + rr * Math.sin(e) * Math.sin(b);
        const xx = x * Math.cos(rot) - y * Math.sin(rot); y = x * Math.sin(rot) + y * Math.cos(rot); x = xx;
        return [x, y, z, col];
      });
    },
    shield() {
      const hw = (y) => (y > 0.35 ? 1.15 - Math.max(0, y - 1.15) * 0 : 1.15 * Math.sqrt(clamp((y + 1.55) / 1.9, 0, 1)));
      return build(() => {
        const q = R(); let x, y, z, c;
        if (q < 0.42) { y = -1.55 + R() * 2.85; const w = hw(y); x = (R() * 2 - 1) * w; c = LAPIS; z = 0.3 * (1 - (x / (w + 0.01)) ** 2) - 0.08; }
        else if (q < 0.72) { y = -1.55 + R() * 2.85; const w = hw(y); x = (R() < 0.5 ? -1 : 1) * w; if (R() < 0.2) { x = (R() * 2 - 1) * 1.15; y = 1.3; } z = -0.08; c = GOLD; }
        else if (q < 0.82) { y = -1.55 + R() * 2.85; const w = hw(y) * 0.8; x = (R() < 0.5 ? -1 : 1) * w; y = y * 0.82 + 0.05; z = 0.1; c = GOLD2; }
        else { const t = R(); if (t < 0.35) { const u = t / 0.35; x = -0.5 + u * 0.4; y = 0.0 - u * 0.4; } else { const u = (t - 0.35) / 0.65; x = -0.1 + u * 0.75; y = -0.4 + u * 0.95; } x += jit(0.06); y += jit(0.06); z = 0.3; c = TEAL; }
        return [x, y + 0.1, z + jit(0.03), sprinkle(c)];
      });
    },
    tablet() {
      const W = 1.25, H = 1.7, D = 0.16;
      return build(() => {
        const q = R(); let x, y, z, c = AMBER;
        if (q < 0.5) {
          const row = Math.floor(R() * 10), col = Math.floor(R() * 7);
          const cx = -W + 0.28 + col * (2 * W - 0.56) / 6 + ((row * 37) % 7) * 0.02, cy = H - 0.3 - row * (2 * H - 0.6) / 9;
          const t = R();
          if (t < 0.45) { const u = R(), v = R() * (1 - u); x = cx - 0.07 + u * 0.14 * (v > 0 ? 1 : 1) - v * 0.07; y = cy + (v - 0.5 * (1 - u)) * 0.14; }
          else { x = cx + jit(0.02); y = cy - R() * 0.12; if (((row + col) % 3) === 0) { x = cx + (R() - 0.5) * 0.18; y = cy; } }
          z = D + 0.01; c = mixc(GOLD, GOLD2, R());
        } else if (q < 0.68) { x = (R() * 2 - 1) * W; y = (R() * 2 - 1) * H; z = D; c = mixc(AMBER, GOLD, R() * 0.4); }
        else if (q < 0.9) {
          const e = Math.floor(R() * 4), t = R() * 2 - 1;
          x = e < 2 ? t * W : (e === 2 ? -W : W); y = e < 2 ? (e ? H : -H) : t * H; z = (R() * 2 - 1) * D; c = LAPIS;
        } else { x = (R() * 2 - 1) * W; y = (R() * 2 - 1) * H; z = -D; c = mixc(LAPIS, AMBER, 0.3); }
        return [x, y, z, sprinkle(c)];
      });
    },
    wave() {
      const f = (x, z) => 0.32 * Math.sin(x * 2.1) * Math.cos(z * 1.6) + 0.16 * Math.sin((x + z) * 3.2);
      return build(() => {
        let x = (R() * 2 - 1) * 2.1, z = (R() * 2 - 1) * 1.5;
        if (R() < 0.62) { if (R() < 0.5) x = Math.round(x * 5) / 5; else z = Math.round(z * 5) / 5; }
        const y = f(x, z); const t = clamp((y + 0.48) / 0.96, 0, 1);
        return [x, y, z, sprinkle(t > 0.86 ? GOLD : mixc(LAPIS, TEAL, t))];
      });
    },
    gate() {
      const inside = (x, y) => {
        const ax = Math.abs(x);
        if (y < -1.4 || ax > 1.65) return false;
        if (ax > 0.78) { const top = 1.15 + ((Math.floor((ax - 0.78) / 0.174) % 2) ? 0 : 0.16); return y < top; }
        const top = 0.72 + ((Math.floor((ax + 0.07) / 0.17) % 2) ? 0 : 0.13);
        if (y > top) return false;
        if (ax < 0.46 && (y < 0.05 || (y - 0.05) ** 2 + x * x < 0.46 ** 2)) return false;
        return true;
      };
      return build(() => {
        let x, y; do { x = (R() * 2 - 1) * 1.65; y = -1.4 + R() * 2.75; } while (!inside(x, y));
        const e = 0.05, edge = !inside(x + e, y) || !inside(x - e, y) || !inside(x, y + e) || !inside(x, y - e);
        const q = R(); let z = 0.12, c = LAPIS;
        if (edge) c = GOLD;
        else if (q < 0.3) { y = Math.round(y * 9) / 9; c = mixc(LAPIS, TEAL, 0.35); }
        else if (q < 0.36) { y = Math.abs(x) > 0.78 ? 0.35 : -0.6; y += jit(0.05); c = GOLD2; }
        if (R() < 0.18) z = -0.12;
        return [x, y, z, sprinkle(c)];
      });
    },
    qr() {
      const n = 25, cs = 0.13, h = n * cs / 2, cells = [];
      const finder = (cx, cy, x, y) => { const dx = Math.abs(x - cx), dy = Math.abs(y - cy), m = Math.max(dx, dy); return m === 3 || m <= 1 ? 1 : m === 2 ? 0 : -1; };
      for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
        let v = -1;
        for (const [cx, cy] of [[3, 3], [n - 4, 3], [3, n - 4]]) { const f = finder(cx, cy, x, y); if (f !== -1 && Math.max(Math.abs(x - cx), Math.abs(y - cy)) <= 3) v = f; }
        if (v === -1) v = ((x * 7 + y * 13 + x * y) % 5) < 2 ? 1 : 0;
        if (v) cells.push([x, y, R() < 0.12]);
      }
      return build(() => {
        const [cx, cy, up] = cells[Math.floor(R() * cells.length)];
        const x = -h + (cx + 0.1 + R() * 0.8) * cs, y = h - (cy + 0.1 + R() * 0.8) * cs;
        const z = up ? R() * 0.35 : jit(0.03);
        return [x, y, z, up ? GOLD2 : ((cx + cy) % 4 ? GOLD : LAPIS)];
      });
    }
  };
  const TILT = { ziggurat: [0.18, 0], globe: [0.2, 0.2], helix: [0, 0.38], galaxy: [1.0, 0.1], lens: [0, 0], crown: [0.32, 0], atom: [0.3, 0.2], shield: [0, 0], tablet: [0.05, -0.08], wave: [0.55, 0], gate: [0.05, 0], qr: [0.12, 0] };
  const SPIN = { lens: 0.35, shield: 0.45, tablet: 0.5, gate: 0.45, qr: 0.5 }; // shapes that sway rather than spin
  const cache = {};
  const shape = (k) => cache[k] || (cache[k] = (SHAPES[k] || SHAPES.ziggurat)());

  /* ---------- GL program ---------- */
  const VS = `
attribute vec3 aA; attribute vec3 aB; attribute vec3 cA; attribute vec3 cB; attribute vec4 aR;
uniform mat4 uP; uniform mat4 uMV; uniform float uMix, uTime, uSize, uPR, uLight, uTurb, uAlpha; uniform vec2 uMouse;
varying vec3 vC; varying float vA;
void main(){
  float m = clamp(uMix * 1.6 - aR.w * 0.6, 0.0, 1.0); m = m * m * (3.0 - 2.0 * m);
  vec3 p = mix(aA, aB, m);
  float b = sin(m * 3.14159);
  vec3 dir = normalize(p + vec3(0.0001, 0.0002, 0.0003));
  p += dir * b * uTurb * (0.35 + aR.y * 1.4);
  p += vec3(sin(uTime * 0.8 + aR.x * 6.283), cos(uTime * 0.7 + aR.y * 6.283), sin(uTime * 0.6 + aR.z * 6.283)) * 0.02;
  vec4 mv = uMV * vec4(p, 1.0);
  vec4 cp = uP * mv;
  vec2 ndc = cp.xy / cp.w; vec2 d = ndc - uMouse;
  float f = exp(-dot(d, d) * 26.0) * 0.07;
  cp.xy += normalize(d + 0.0001) * f * cp.w;
  gl_Position = cp;
  float tw = 0.62 + 0.38 * sin(uTime * 2.2 + aR.z * 40.0);
  gl_PointSize = uSize * (0.45 + aR.x) * uPR * (6.5 / -mv.z);
  vec3 c = mix(cA, cB, m);
  vC = mix(c, c * vec3(0.5, 0.42, 0.42), uLight);
  vA = uAlpha * tw;
}`;
  const FS = `
precision mediump float; varying vec3 vC; varying float vA;
void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c); if (d > 0.5) discard; float a = pow(smoothstep(0.5, 0.0, d), 1.7) * vA; gl_FragColor = vec4(vC * a, a); }`;
  function sh(type, src) { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; }
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); doc.classList.replace("has-gl", "no-gl"); return; }
  gl.useProgram(prog);
  const loc = {}; ["aA", "aB", "cA", "cB", "aR"].forEach((k) => (loc[k] = gl.getAttribLocation(prog, k)));
  const U = {}; ["uP", "uMV", "uMix", "uTime", "uSize", "uPR", "uLight", "uTurb", "uAlpha", "uMouse"].forEach((k) => (U[k] = gl.getUniformLocation(prog, k)));

  function mkBuf(data, usage) { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW); return b; }
  function bindAttr(buf, l, size) { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); }

  // sculpture buffers
  const rnd = new Float32Array(N * 4); for (let i = 0; i < N * 4; i++) rnd[i] = R();
  const S = { a: mkBuf(new Float32Array(N * 3), gl.DYNAMIC_DRAW), b: mkBuf(new Float32Array(N * 3), gl.DYNAMIC_DRAW), ca: mkBuf(new Float32Array(N * 3), gl.DYNAMIC_DRAW), cb: mkBuf(new Float32Array(N * 3), gl.DYNAMIC_DRAW), r: mkBuf(rnd) };
  // stars
  const sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), sr = new Float32Array(NS * 4);
  for (let i = 0; i < NS; i++) {
    const a = R() * TAU, e = Math.acos(R() * 2 - 1), r = 7 + R() * 14;
    sp[i * 3] = r * Math.sin(e) * Math.cos(a); sp[i * 3 + 1] = r * Math.cos(e); sp[i * 3 + 2] = r * Math.sin(e) * Math.sin(a) - 4;
    const c = R() < 0.15 ? GOLD2 : R() < 0.3 ? TEAL : WHITE; sc.set(c, i * 3);
    sr[i * 4] = R() * 0.7; sr[i * 4 + 1] = R(); sr[i * 4 + 2] = R(); sr[i * 4 + 3] = 0;
  }
  const ST = { a: mkBuf(sp), c: mkBuf(sc), r: mkBuf(sr) };

  /* ---------- Matrices (column-major) ---------- */
  const persp = (fov, asp, n, f) => { const t = 1 / Math.tan(fov / 2), nf = 1 / (n - f); return new Float32Array([t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (f + n) * nf, -1, 0, 0, 2 * f * n * nf, 0]); };
  const mul = (a, b) => { const o = new Float32Array(16); for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k]; o[c * 4 + r] = s; } return o; };
  const rx = (t) => { const c = Math.cos(t), s = Math.sin(t); return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]); };
  const ry = (t) => { const c = Math.cos(t), s = Math.sin(t); return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]); };
  const rz = (t) => { const c = Math.cos(t), s = Math.sin(t); return new Float32Array([c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); };
  const tr = (x, y, z, s) => new Float32Array([s, 0, 0, 0, 0, s, 0, 0, 0, 0, s, 0, x, y, z, 1]);

  const CAM = 6.5, FOV = 40 * Math.PI / 180, HALF = Math.tan(FOV / 2) * CAM;
  let W = 0, H = 0, PR = 1, P = null;
  function resize() {
    PR = Math.min(devicePixelRatio || 1, small ? 1.5 : 1.75);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.round(W * PR); canvas.height = Math.round(H * PR);
    gl.viewport(0, 0, canvas.width, canvas.height);
    P = persp(FOV, W / H, 0.1, 60);
    slotsDirty = true;
  }

  /* ---------- Morph state ---------- */
  let curKey = null, mixT = 1, mixStart = 0, MORPH = 1700;
  let A = null, B = null; // {P,C}
  const cur = new Float32Array(N * 3), curC = new Float32Array(N * 3);
  function snapshot() {
    if (!A) return;
    const m0 = mixT;
    for (let i = 0; i < N; i++) {
      let m = clamp(m0 * 1.6 - rnd[i * 4 + 3] * 0.6, 0, 1); m = m * m * (3 - 2 * m);
      for (let k = 0; k < 3; k++) { const j = i * 3 + k; cur[j] = A.P[j] + (B.P[j] - A.P[j]) * m; curC[j] = A.C[j] + (B.C[j] - A.C[j]) * m; }
    }
  }
  function upload(buf, data) { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data); }
  function morphTo(key, instant) {
    if (key === curKey) return;
    const next = shape(key);
    if (!B || instant) {
      // birth: explode in from a scattered cloud
      const cloud = new Float32Array(N * 3); for (let i = 0; i < N * 3; i++) cloud[i] = (R() - 0.5) * 9;
      A = { P: cloud, C: next.C }; B = next;
    } else { snapshot(); A = { P: cur.slice(), C: curC.slice() }; B = next; }
    upload(S.a, A.P); upload(S.ca, A.C); upload(S.b, B.P); upload(S.cb, B.C);
    curKey = key; mixT = 0; mixStart = performance.now();
  }

  /* ---------- Slots ---------- */
  let slots = [], slotsDirty = true;
  function collect() {
    slots = Array.from(document.querySelectorAll("[data-gl]")).map((el) => ({ el, key: el.dataset.gl, o: 1 }));
    readSlotStyle();
  }
  function readSlotStyle() {
    slots.forEach((s) => { const v = parseFloat(getComputedStyle(s.el).getPropertyValue("--gl-o")); s.o = isNaN(v) ? 1 : v; });
    slotsDirty = false;
  }
  new MutationObserver(() => { collect(); }).observe(document.body, { childList: true, subtree: false });

  const pos = { x: 0, y: 0, s: 1, o: 0 }, tgt = { x: 0, y: 0, s: 1, o: 1 };
  let active = null;
  function pickSlot() {
    let best = null, bestScore = -Infinity, nearest = null, nd = Infinity;
    for (const s of slots) {
      const r = s.el.getBoundingClientRect(); s.r = r;
      if (!r.width || !r.height) continue;
      const vis = Math.min(r.bottom, H) - Math.max(r.top, 0);
      const cy = (r.top + r.bottom) / 2, dist = Math.abs(cy - H / 2);
      if (vis > 0) { const score = vis / Math.min(r.height, H) - dist / H * 0.6; if (score > bestScore) { bestScore = score; best = s; } }
      if (dist < nd) { nd = dist; nearest = s; }
    }
    return best || nearest;
  }

  /* ---------- Input ---------- */
  const mouse = { x: 9, y: 9, tx: 9, ty: 9, rx: 0, ry: 0 };
  addEventListener("pointermove", (e) => { if (e.pointerType === "touch") return; mouse.tx = e.clientX / W * 2 - 1; mouse.ty = -(e.clientY / H * 2 - 1); }, { passive: true });
  document.addEventListener("pointerleave", () => { mouse.tx = 9; mouse.ty = 9; });
  let lastY = scrollY, vel = 0;

  const isLight = () => doc.dataset.theme === "light";
  let light = isLight();
  const setBlend = () => { if (light) gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); else gl.blendFunc(gl.ONE, gl.ONE); };
  new MutationObserver(() => { light = isLight(); setBlend(); }).observe(doc, { attributes: true, attributeFilter: ["data-theme"] });

  gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); setBlend();
  gl.clearColor(0, 0, 0, 0);

  addEventListener("resize", resize);
  resize(); collect();
  let resizeTimer; addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(readSlotStyle, 150); });

  /* ---------- Loop ---------- */
  let t0 = performance.now(), spin = 0, running = true;
  document.addEventListener("visibilitychange", () => { running = !document.hidden; if (running) requestAnimationFrame(frame); });

  function frame(now) {
    if (!running) return;
    const t = (now - t0) / 1000;
    if (slotsDirty) readSlotStyle();

    // scroll velocity
    const y = scrollY; vel += ((y - lastY) - vel) * 0.15; lastY = y;

    // slot targeting
    const s = pickSlot();
    if (s) {
      if (s !== active) { active = s; morphTo(s.key, !curKey); }
      const r = s.r;
      const cx = (r.left + r.right) / 2, cy = (r.top + r.bottom) / 2;
      const hw = HALF * (W / H);
      tgt.x = (cx / W * 2 - 1) * hw; tgt.y = -(cy / H * 2 - 1) * HALF;
      tgt.s = clamp((Math.min(r.height, r.width * 1.1) / H) * 2 * HALF / 3.5, 0.25, 2.2);
      tgt.o = s.o;
    } else tgt.o = 0;
    const k = 0.09;
    pos.x += (tgt.x - pos.x) * k; pos.y += (tgt.y - pos.y) * k; pos.s += (tgt.s - pos.s) * k; pos.o += (tgt.o - pos.o) * 0.06;
    if (pos.s < 0.01) pos.s = tgt.s;

    // morph progress
    if (mixT < 1) mixT = clamp((now - mixStart) / MORPH, 0, 1);
    const turb = Math.sin(mixT * Math.PI) * 0.9;

    // mouse smoothing
    if (mouse.tx > 5) { mouse.x += (9 - mouse.x) * 0.5; mouse.y += (9 - mouse.y) * 0.5; }
    else { mouse.x += (mouse.tx - mouse.x) * 0.12; mouse.y += (mouse.ty - mouse.y) * 0.12; }
    const mx = mouse.tx > 5 ? 0 : mouse.tx, my = mouse.ty > 5 ? 0 : mouse.ty;
    mouse.rx += (my * 0.25 - mouse.rx) * 0.05; mouse.ry += (mx * 0.45 - mouse.ry) * 0.05;

    const key = curKey || "ziggurat", tl = TILT[key] || [0, 0];
    spin += 0.0035 + Math.min(Math.abs(vel), 60) * 0.0009;
    const yaw = SPIN[key] ? Math.sin(spin * 1.4) * SPIN[key] : spin;
    const model = mul(tr(pos.x, pos.y, 0, pos.s), mul(rz(tl[1]), mul(rx(tl[0] + mouse.rx + vel * 0.002), ry(yaw + mouse.ry))));

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniformMatrix4fv(U.uP, false, P);
    gl.uniform1f(U.uTime, t); gl.uniform1f(U.uPR, PR); gl.uniform1f(U.uLight, light ? 1 : 0);
    gl.uniform2f(U.uMouse, mouse.x, mouse.y);

    // stars
    const view = tr(0, 0, -CAM, 1);
    const smv = mul(view, mul(rx(y * 0.00012 + 0.2), ry(t * 0.01 + y * 0.00025)));
    gl.uniformMatrix4fv(U.uMV, false, smv);
    gl.uniform1f(U.uMix, 1); gl.uniform1f(U.uTurb, 0); gl.uniform1f(U.uSize, 2.1); gl.uniform1f(U.uAlpha, light ? 0.35 : 0.75);
    bindAttr(ST.a, loc.aA, 3); bindAttr(ST.a, loc.aB, 3); bindAttr(ST.c, loc.cA, 3); bindAttr(ST.c, loc.cB, 3); bindAttr(ST.r, loc.aR, 4);
    gl.drawArrays(gl.POINTS, 0, NS);

    // sculpture
    if (curKey && pos.o > 0.01) {
      gl.uniformMatrix4fv(U.uMV, false, mul(view, model));
      gl.uniform1f(U.uMix, mixT); gl.uniform1f(U.uTurb, turb); gl.uniform1f(U.uSize, (small ? 2.6 : 2.3) * Math.sqrt(pos.s)); gl.uniform1f(U.uAlpha, pos.o * (light ? 0.95 : 0.9));
      bindAttr(S.a, loc.aA, 3); bindAttr(S.b, loc.aB, 3); bindAttr(S.ca, loc.cA, 3); bindAttr(S.cb, loc.cB, 3); bindAttr(S.r, loc.aR, 4);
      gl.drawArrays(gl.POINTS, 0, N);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  window.GL3D = { refresh: collect, morphTo };
})();
