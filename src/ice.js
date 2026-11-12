/* Clear ice, drawn live (WebGL2).

   One block of ice stands in front of the page as if the page were the photographer's paper backdrop:
   - what is behind the block (paper, headline) is seen through it, bent by two refractions (air → ice → air);
   - a hard light throws its shadow on the paper, and the light that crosses the ice is redistributed inside that
     shadow (the bright ripples of a real clear-ice shadow). Those ripples are computed, not painted: a grid of light
     rays is pushed through the block and the brightness of each cell is the ratio of its area before and after;
   - the block turns slowly, and follows the pointer or a finger with inertia.

   The canvas is an overlay: transparent wherever the light is untouched, so the page's own text stays real text.
   Without WebGL2 nothing is drawn and the still image placed by the template stays. */

const BR = { cube: 1.8, stick: 1.62, ball: 1.12 };
const SHAPE = { cube: 0, stick: 1, ball: 2 };
const LIFT = 1.04;   // distance of the block's centre from the paper, in bounding radii (1 = touching)

const COMMON = `#version 300 es
precision highp float;
precision highp int;
uniform mat3 uRot;      // object → world
uniform vec3 uC;        // centre of the object: x, y in CSS px (y up), z = distance in front of the paper
uniform float uS;       // px per object unit
uniform int uShape;     // 0 cube, 1 stick, 2 ball
uniform vec3 uL;        // towards the light (world)
uniform float uBR;      // bounding radius (object units)
const float IOR = 1.31;
const float EPS = 0.0012;

float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }

/* the faces of a real block are never flat: slow swells plus a finer ripple, as on ice that has started to temper */
float swell(vec3 q) {
  float a = sin(2.3 * q.x + 1.3 * sin(1.7 * q.y + 0.6)) * sin(2.0 * q.y + 1.1 * sin(2.1 * q.z + 2.0)) * sin(2.6 * q.z + 0.9 * sin(1.5 * q.x + 4.1));
  float b = sin(5.9 * q.x + 1.7) * sin(6.7 * q.y + 0.4) + sin(6.3 * q.y + 2.9) * sin(5.5 * q.z + 5.1) + sin(7.1 * q.z + 0.8) * sin(6.1 * q.x + 3.3);
  return a + 0.3 * b;
}
float map(vec3 q) {
  float d;
  if (uShape == 0) d = sdRoundBox(q, vec3(1.0), 0.075) + 0.021 * swell(q);
  else if (uShape == 1) d = sdRoundBox(q, vec3(0.46, 1.42, 0.46), 0.06) + 0.016 * swell(q * vec3(1.6, 1.0, 1.6));
  else d = length(q) - 1.04 + 0.014 * swell(q * 1.25);
  return d;
}
vec3 nrm(vec3 p) {
  const vec2 k = vec2(1.0, -1.0); const float h = 0.0025;
  return normalize(k.xyy * map(p + k.xyy * h) + k.yyx * map(p + k.yyx * h) + k.yxy * map(p + k.yxy * h) + k.xxx * map(p + k.xxx * h));
}
/* from outside: distance along the ray to the surface, or -1. dmin = closest approach (for the soft silhouette) */
float marchIn(vec3 o, vec3 d, out float dmin, out vec3 pmin) {
  dmin = 1e3; pmin = o;
  float b = dot(o, d), c = dot(o, o) - uBR * uBR, h = b * b - c;
  if (h < 0.0) return -1.0;
  h = sqrt(h);
  float t = max(-b - h, 0.0), tEnd = -b + h;
  for (int i = 0; i < 56; i++) {
    vec3 p = o + d * t;
    float dist = map(p);
    if (dist < dmin) { dmin = dist; pmin = p; }
    if (dist < EPS) return t;
    t += dist * 0.92;
    if (t > tEnd) break;
  }
  return -1.0;
}
/* from inside: the point where the ray leaves the block */
vec3 marchOut(vec3 p, vec3 d) {
  float t = 0.0;
  for (int i = 0; i < 36; i++) {
    float dist = -map(p + d * t);
    if (dist < EPS) break;
    t += dist * 0.92;
    if (t > 2.0 * uBR) break;
  }
  return p + d * t;
}
float fresnel(float cosi, float n1, float n2) {
  float r0 = (n1 - n2) / (n1 + n2); r0 *= r0;
  float x = 1.0 - clamp(cosi, 0.0, 1.0);
  return r0 + (1.0 - r0) * x * x * x * x * x;
}
/* through the block: enters at p1 (normal n1) with direction d; returns the exit point and direction.
   lost = the ray is still inside after three inner reflections. */
void through(vec3 p1, vec3 n1, vec3 d, out vec3 pe, out vec3 de, out float len, out float keep, out bool lost) {
  vec3 dir = refract(d, n1, 1.0 / IOR);
  vec3 p = p1 - n1 * (4.0 * EPS);
  len = 0.0; keep = 1.0; lost = true; pe = p; de = dir;
  for (int k = 0; k < 3; k++) {
    pe = marchOut(p, dir);
    len += distance(p, pe);
    vec3 n2 = nrm(pe);
    vec3 r = refract(dir, -n2, IOR);
    if (dot(r, r) > 0.0) { keep *= 1.0 - fresnel(dot(dir, n2), IOR, 1.0); de = r; pe += n2 * (2.0 * EPS); lost = false; return; }
    dir = reflect(dir, -n2);
    p = pe - n2 * (4.0 * EPS);
    de = dir;
  }
}
`;

/* ---- pass 1: the light that crosses the ice, as a warped grid (drawn into the caustic map) ---------------------- */
const CAUSTIC_VERT = COMMON + `
in vec2 aUV;
uniform vec4 uRect;     // world rectangle covered by the caustic map: x0, y0, width, height
out vec2 vOrig; out float vT; out float vHit;
void main() {
  mat3 Rt = transpose(uRot);
  vec3 Lu = Rt * uL;
  vec3 e1 = normalize(cross(Lu, abs(Lu.y) < 0.9 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 e2 = cross(Lu, e1);
  vec3 o = (aUV.x * e1 + aUV.y * e2) * uBR + Lu * (2.0 * uBR);
  vec3 d = -Lu;
  vec3 nw = Rt * vec3(0.0, 0.0, 1.0);          // paper normal in object space
  float hgt0 = uC.z / uS;                       // height of the object's centre above the paper, in units
  float dmin; vec3 pmin;
  float t = marchIn(o, d, dmin, pmin);
  vec3 land; vT = 0.0; vHit = 0.0;
  if (t < 0.0) {
    float tt = (dot(nw, o) + hgt0) / max(-dot(d, nw), 1e-3);
    land = o + d * tt;
  } else {
    vec3 p1 = o + d * t; vec3 n1 = nrm(p1);
    vec3 pe, de; float len, keep; bool lost;
    through(p1, n1, d, pe, de, len, keep, lost);
    float down = -dot(de, nw);
    if (!lost && down > 0.04) {
      float tt = (dot(nw, pe) + hgt0) / down;
      land = pe + de * tt;
      vT = (1.0 - fresnel(dot(-d, n1), 1.0, IOR)) * keep * exp(-0.035 * len);
      vHit = 1.0;
    } else {
      float tt = (dot(nw, o) + hgt0) / max(-dot(d, nw), 1e-3);
      land = o + d * tt;
    }
  }
  vec2 W = (uRot * land * uS + uC).xy;
  vOrig = aUV * uBR * uS;
  gl_Position = vec4((W - uRect.xy) / uRect.zw * 2.0 - 1.0, 0.0, 1.0);
}`;
const CAUSTIC_FRAG = `#version 300 es
precision highp float;
in vec2 vOrig; in float vT; in float vHit;
uniform float uTexel;   // world px per texel of the caustic map
uniform float uLz;
out vec4 o;
void main() {
  if (vHit < 0.999) discard;
  float area = abs(dFdx(vOrig.x) * dFdy(vOrig.y) - dFdx(vOrig.y) * dFdy(vOrig.x));
  float c = area / (uTexel * uTexel) * vT / uLz;
  c = max(c - 0.07, 0.0);                 // light spread too thin to be seen: left out, so no haze far from the block
  if (c <= 0.0) discard;
  o = vec4(vec3(min(c, 24.0)), 1.0);
}`;

/* ---- pass 2: what the eye sees -------------------------------------------------------------------------------- */
const VIEW_VERT = `#version 300 es
in vec2 p; void main() { gl_Position = vec4(p, 0.0, 1.0); }`;
const VIEW_FRAG = COMMON + `
uniform float uDpr;         // canvas px per CSS px
uniform vec2 uSize;         // canvas size in CSS px
uniform sampler2D uPage;    // the page behind (paper + text), same size as the canvas
uniform vec2 uShift;        // page texture offset (px) when the block drifts over the page
uniform sampler2D uCaus;
uniform vec4 uRect;
uniform vec3 uAmb;          // light left in a shadow (linear)
uniform vec3 uPaper;        // lit paper colour (linear), for grazing reflections
uniform vec3 uSky;          // what the block mirrors above it (linear)
uniform vec3 uDeep;         // and below it: the blue of its own shadow
uniform float uGain;        // strength of the bright ripples
uniform float uIn;          // 0 → 1 entrance
out vec4 frag;

vec3 toLin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 toSrgb(vec3 c) { return pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2)); }
vec3 shoulder(vec3 c) { vec3 k = max(c - 0.82, 0.0); return min(c, 0.82) + 0.18 * (1.0 - exp(-k / 0.18)); }

vec3 page(vec2 P) { return toLin(texture(uPage, (P + uShift) / uSize).rgb); }

/* how much of the sun reaches a point of the paper: straight (soft-edged shadow) + through the ice (caustic map) */
vec3 lightAt(vec2 P) {
  mat3 Rt = transpose(uRot);
  vec3 o = Rt * (vec3(P, 0.0) - uC) / uS; vec3 d = Rt * uL;
  float direct = 1.0;
  float b = dot(o, d), c = dot(o, o) - uBR * uBR, h = b * b - c;
  if (h > 0.0) {
    h = sqrt(h);
    float t = max(-b - h, 0.0), tEnd = -b + h;
    for (int i = 0; i < 30; i++) {
      float dist = map(o + d * t);
      direct = min(direct, 26.0 * dist / max(t, 0.05));
      if (dist < EPS) { direct = 0.0; break; }
      t += max(dist * 0.9, 0.012);
      if (t > tEnd) break;
    }
    direct = clamp(direct, 0.0, 1.0);
    direct = direct * direct * (3.0 - 2.0 * direct);
  }
  vec2 uv = (P - uRect.xy) / uRect.zw;
  float ca = 0.0;
  if (uv.x > 0.0 && uv.x < 1.0 && uv.y > 0.0 && uv.y < 1.0) {
    vec2 tx = 1.0 / vec2(textureSize(uCaus, 0));
    ca = 0.36 * texture(uCaus, uv).r
       + 0.16 * (texture(uCaus, uv + tx * vec2(1.3, 0.4)).r + texture(uCaus, uv + tx * vec2(-0.4, 1.3)).r + texture(uCaus, uv + tx * vec2(-1.3, -0.4)).r + texture(uCaus, uv + tx * vec2(0.4, -1.3)).r);
  }
  vec3 sun = vec3(1.0) - uAmb;
  return uAmb + sun * (direct + ca * uGain);
}

/* the studio around the set, for reflections: lit paper at grazing angles, a dark room behind the camera,
   one large light where the sun is and a thin cool strip on the other side */
vec3 env(vec3 w) {
  float room = smoothstep(-0.12, 0.28, w.z);
  float up = w.y * 0.5 + 0.5;
  vec3 sky = mix(uDeep, uSky, smoothstep(0.18, 0.86, up));
  float key = smoothstep(0.84, 0.985, dot(w, uL));
  float strip = smoothstep(0.90, 0.995, dot(w, normalize(vec3(0.82, 0.25, 0.5))));
  sky += vec3(1.0, 0.99, 0.96) * key * 5.0 + vec3(0.7, 0.9, 1.0) * strip * 0.9;
  return mix(uPaper * 0.96, sky, room);
}
/* colour carried by a ray that has left the ice (object space) */
vec3 leave(vec3 pe, vec3 de) {
  mat3 Rt = transpose(uRot);
  vec3 nw = Rt * vec3(0.0, 0.0, 1.0);
  float down = -dot(de, nw);
  vec3 wdir = uRot * de;
  if (down > 0.03) {
    float tt = (dot(nw, pe) + uC.z / uS) / down;
    vec3 exitW = uRot * pe * uS + uC;
    vec2 P = (uRot * (pe + de * tt) * uS + uC).xy;
    vec2 spread = (P - exitW.xy) * 0.006; spread *= min(1.0, 3.0 / max(length(spread), 1e-3));                 // the ice bends blue a little more than red
    vec3 col = vec3(page(P - spread).r, page(P).g, page(P + spread).b);
    vec3 seen = col * lightAt(P);
    return mix(env(wdir), seen, smoothstep(0.03, 0.16, down));
  }
  return env(wdir);
}

void main() {
  vec2 px = gl_FragCoord.xy / uDpr;
  mat3 Rt = transpose(uRot);
  vec3 o = Rt * (vec3(px, 6.0 * uBR * uS) - uC) / uS;
  vec3 d = Rt * vec3(0.0, 0.0, -1.0);
  float dmin; vec3 pmin;
  float t = marchIn(o, d, dmin, pmin);
  float pxu = 1.0 / (uS * uDpr);

  /* the paper around the block: untouched (transparent), in shadow, or lit by the ripples */
  vec3 light = lightAt(px);
  vec3 delta = abs(light - 1.0);
  float touched = smoothstep(0.012, 0.07, max(delta.r, max(delta.g, delta.b)));
  vec3 wall = toSrgb(shoulder(page(px) * light));
  vec4 under = vec4(wall, 1.0) * touched;

  vec4 col = under;
  if (t > 0.0) {
    vec3 p1 = o + d * t; vec3 n1 = nrm(p1);
    float cosi = clamp(dot(-d, n1), 0.0, 1.0);
    float F = fresnel(cosi, 1.0, IOR);
    vec3 pe, de; float len, keep; bool lost;
    through(p1, n1, d, pe, de, len, keep, lost);
    vec3 trans = leave(pe, de) * exp(-vec3(0.085, 0.03, 0.012) * len);
    vec3 rdir = reflect(d, n1);
    vec3 refl = env(uRot * rdir);
    /* a tight highlight where a facet mirrors the sun */
    float spec = pow(max(dot(uRot * rdir, uL), 0.0), 900.0) * 14.0 + pow(max(dot(uRot * rdir, uL), 0.0), 60.0) * 0.22;
    vec3 rgb = mix(trans, refl, F) + vec3(1.0, 0.99, 0.96) * spec;
    col = vec4(toSrgb(shoulder(rgb)), 1.0);
  } else if (dmin < 2.0 * pxu) {
    /* soft silhouette: the last pixel of the edge catches the light */
    float cov = 1.0 - smoothstep(0.0, 2.0 * pxu, dmin);
    vec3 rim = toSrgb(mix(uPaper, vec3(1.0), 0.55));
    col = vec4(rim, 1.0) * cov + under * (1.0 - cov);
  }
  frag = col * uIn;
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
  return s;
}
function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
  const U = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const name = gl.getActiveUniform(p, i).name; U[name] = gl.getUniformLocation(p, name); }
  return { p, U };
}

/* ---- small 3×3 matrix helpers (row-major arrays; sent to GL transposed) ------------------------------------------ */
const mul = (a, b) => { const r = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j]; return r; };
const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
function ortho(m) {
  // Gram-Schmidt on the columns, so a long drag never skews the block
  const col = (i) => [m[i], m[3 + i], m[6 + i]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const norm = (a) => { const l = Math.hypot(...a) || 1; return a.map((v) => v / l); };
  let x = norm(col(0));
  let y = col(1); const k = dot(x, y); y = norm(y.map((v, i) => v - k * x[i]));
  const z = [x[1] * y[2] - x[2] * y[1], x[2] * y[0] - x[0] * y[2], x[0] * y[1] - x[1] * y[0]];
  return [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]];
}
const glMat = (m) => new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);

const lin = (v) => Math.pow(v / 255, 2.2);
function cssColor(str, fallback) {
  const m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/.exec(str || '');
  return m ? [+m[1], +m[2], +m[3]] : fallback;
}

/* ---- the page behind the ice, redrawn on a 2D canvas: the paper's gradient and every visible piece of text --------
   Only what shows through the block needs to be right, so this stays small: text nodes are drawn glyph by glyph at
   the place the browser put them (word by word in Arabic, where letters join). */
function paintPage(host, canvas, scale) {
  const rect = host.getBoundingClientRect();
  const w = Math.max(1, Math.round(rect.width)), h = Math.max(1, Math.round(rect.height));
  canvas.width = Math.round(w * scale); canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  const cs = getComputedStyle(host);
  const stops = ['--set-a', '--set-b', '--set-c'].map((n) => cs.getPropertyValue(n).trim()).filter(Boolean);
  if (stops.length === 3) {
    const cx = w * (parseFloat(cs.getPropertyValue('--set-x')) || 22) / 100, cy = h * (parseFloat(cs.getPropertyValue('--set-y')) || 8) / 100;
    const r = Math.max(Math.hypot(cx, cy), Math.hypot(w - cx, cy), Math.hypot(cx, h - cy), Math.hypot(w - cx, h - cy));
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, stops[0]); g.addColorStop(0.46, stops[1]); g.addColorStop(1, stops[2]);
    ctx.fillStyle = g;
  } else {
    ctx.fillStyle = cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' ? cs.backgroundColor : '#7cc4ea';
  }
  ctx.fillRect(0, 0, w, h);

  host.querySelectorAll('[data-ice-box]').forEach((el) => {
    const r = el.getBoundingClientRect(); const s = getComputedStyle(el);
    if (!r.width || s.visibility === 'hidden') return;
    ctx.fillStyle = s.backgroundColor;
    ctx.beginPath();
    ctx.roundRect(r.left - rect.left, r.top - rect.top, r.width, r.height, parseFloat(s.borderTopLeftRadius) || 0);
    ctx.fill();
  });

  const rtl = getComputedStyle(host).direction === 'rtl';
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent;
    if (!text.trim()) continue;
    const el = node.parentElement;
    if (!el || el.closest('[aria-hidden="true"], .ip-sr, canvas, script, style')) continue;
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none') continue;
    ctx.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`;
    ctx.fillStyle = s.color;
    ctx.textBaseline = 'alphabetic';
    const ascent = ctx.measureText('Hg').fontBoundingBoxAscent;
    const draw = (from, to) => {
      range.setStart(node, from); range.setEnd(node, to);
      const r = range.getClientRects()[0];
      if (!r || !r.width) return;
      const str = text.slice(from, to);
      if (rtl) { ctx.direction = 'rtl'; ctx.textAlign = 'right'; ctx.fillText(str, r.right - rect.left, r.top - rect.top + ascent); } else { ctx.direction = 'ltr'; ctx.textAlign = 'left'; ctx.fillText(str, r.left - rect.left, r.top - rect.top + ascent); }
    };
    if (rtl) {
      const re = /\S+/g; let m;
      while ((m = re.exec(text))) draw(m.index, m.index + m[0].length);
    } else {
      for (let i = 0; i < text.length; i++) if (text[i].trim()) draw(i, i + 1);
    }
  }
  return { w, h };
}

/**
 * @param {HTMLElement} host   the section the ice stands in (position: relative); its text is what shows through
 * @param {object} o
 * @param {HTMLElement} o.slot  an empty element placed by CSS where the block should stand (its box gives centre and size)
 * @param {'cube'|'stick'|'ball'} [o.shape]
 */
export function createIce(host, { slot, shape = 'cube', mirror = false, onReady } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = 'ip-ice';
  canvas.setAttribute('aria-hidden', 'true');
  const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, powerPreference: 'high-performance' });
  if (!gl) return null;
  const half = gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('EXT_float_blend');

  let view, caus;
  try { view = program(gl, VIEW_VERT, VIEW_FRAG); caus = program(gl, CAUSTIC_VERT, CAUSTIC_FRAG); } catch (e) { console.warn('ice:', e.message); return null; }

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

  // grid of light rays
  const N = 150;
  const verts = new Float32Array((N + 1) * (N + 1) * 2);
  for (let j = 0, k = 0; j <= N; j++) for (let i = 0; i <= N; i++) { verts[k++] = (i / N) * 2 - 1; verts[k++] = (j / N) * 2 - 1; }
  const idx = new Uint16Array(N * N * 6);
  for (let j = 0, k = 0; j < N; j++) for (let i = 0; i < N; i++) { const a = j * (N + 1) + i, b = a + 1, c = a + N + 1, d = c + 1; idx[k++] = a; idx[k++] = b; idx[k++] = c; idx[k++] = b; idx[k++] = d; idx[k++] = c; }
  const grid = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, grid); gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
  const gridIdx = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gridIdx); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);

  // caustic map
  const CT = 768;
  const causTex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, causTex);
  if (half) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, CT, CT, 0, gl.RGBA, gl.HALF_FLOAT, null);
  else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, CT, CT, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const causFbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, causFbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, causTex, 0);
  const causOk = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);

  const pageTex = gl.createTexture();
  const pageCanvas = document.createElement('canvas');
  let size = { w: 1, h: 1 }, dpr = 1, quality = 1;

  const state = {
    shape,
    rot: mul(rotX(-0.32), rotY(0.44)),
    vel: [0, 0],                 // angular velocity (rad/s): around world Y, around world X
    idle: reduced ? 0 : 0.11,    // slow turn when nobody touches it
    drag: null,
    visible: true,
    appear: 0,
    t0: performance.now(),
    last: performance.now(),
    frame: 0,
    alive: true,
    slow: 0,
    dirty: true,
  };
  const L = (() => { const v = [mirror ? 0.58 : -0.58, 0.52, 0.56]; const l = Math.hypot(...v); return v.map((x) => x / l); })();

  function measure() {
    const hr = host.getBoundingClientRect(); const sr = slot.getBoundingClientRect();
    const s = Math.min(sr.width, sr.height) / (shape === 'stick' ? 3.5 : shape === 'ball' ? 2.3 : 3.25);
    return { cx: sr.left - hr.left + sr.width / 2, cy: hr.height - (sr.top - hr.top + sr.height / 2), s };
  }
  let place = { cx: 0, cy: 0, s: 100 };

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2) * quality;
    const texScale = Math.min(window.devicePixelRatio || 1, 2);
    size = paintPage(host, pageCanvas, texScale);
    canvas.width = Math.max(1, Math.round(size.w * dpr)); canvas.height = Math.max(1, Math.round(size.h * dpr));
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, pageTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, pageCanvas);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    place = measure();
    state.dirty = true;
  }

  const cs = getComputedStyle(host);
  const paper = cssColor(cs.getPropertyValue('--set-b') && (() => { const d = document.createElement('i'); d.style.color = cs.getPropertyValue('--set-b'); host.append(d); const c = getComputedStyle(d).color; d.remove(); return c; })(), [124, 196, 234]);
  const shade = cssColor((() => { const v = cs.getPropertyValue('--set-shade'); if (!v) return ''; const d = document.createElement('i'); d.style.color = v; host.append(d); const c = getComputedStyle(d).color; d.remove(); return c; })(), [5, 61, 94]);
  const varColor = (name, fallback) => { const v = cs.getPropertyValue(name).trim(); if (!v) return fallback; const d = document.createElement('i'); d.style.color = v; host.append(d); const c = cssColor(getComputedStyle(d).color, fallback); d.remove(); return c; };
  const sky = varColor('--ice-sky', [206, 234, 250]).map(lin);
  const deepC = varColor('--ice-deep', null);
  const paperLin = paper.map(lin);
  const amb = shade.map((v, i) => Math.min(0.6, lin(v) / Math.max(paperLin[i], 1e-3)));

  function common(pr, s) {
    gl.uniformMatrix3fv(pr.U.uRot, false, glMat(state.rot));
    gl.uniform3f(pr.U.uC, place.cx, place.cy, place.s * BR[state.shape] * LIFT);
    gl.uniform1f(pr.U.uS, s);
    gl.uniform1i(pr.U.uShape, SHAPE[state.shape]);
    gl.uniform3f(pr.U.uL, L[0], L[1], L[2]);
    gl.uniform1f(pr.U.uBR, BR[state.shape]);
  }

  function draw() {
    const s = place.s;
    const cz = s * BR[state.shape] * LIFT;
    const off = [-L[0] / L[2] * cz, -L[1] / L[2] * cz];
    const halfSpan = (BR[state.shape] * s) / L[2] * 1.12 + 0.5 * Math.hypot(off[0], off[1]);
    const rect = [place.cx + off[0] * 0.5 - halfSpan, place.cy + off[1] * 0.5 - halfSpan, 2 * halfSpan, 2 * halfSpan];

    if (causOk) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, causFbo);
      gl.viewport(0, 0, CT, CT);
      gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
      gl.useProgram(caus.p);
      common(caus, s);
      gl.uniform4f(caus.U.uRect, rect[0], rect[1], rect[2], rect[3]);
      gl.uniform1f(caus.U.uTexel, rect[2] / CT);
      gl.uniform1f(caus.U.uLz, L[2]);
      gl.bindBuffer(gl.ARRAY_BUFFER, grid);
      const a = gl.getAttribLocation(caus.p, 'aUV');
      gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gridIdx);
      gl.drawElements(gl.TRIANGLES, idx.length, gl.UNSIGNED_SHORT, 0);
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(view.p);
    common(view, s);
    gl.uniform1f(view.U.uDpr, dpr);
    gl.uniform2f(view.U.uSize, size.w, size.h);
    gl.uniform2f(view.U.uShift, 0, 0);
    gl.uniform4f(view.U.uRect, rect[0], rect[1], rect[2], rect[3]);
    gl.uniform3f(view.U.uAmb, amb[0], amb[1], amb[2]);
    gl.uniform3f(view.U.uPaper, paperLin[0], paperLin[1], paperLin[2]);
    gl.uniform3f(view.U.uSky, sky[0], sky[1], sky[2]);
    if (deepC) gl.uniform3f(view.U.uDeep, lin(deepC[0]), lin(deepC[1]), lin(deepC[2]));
    else gl.uniform3f(view.U.uDeep, lin(shade[0]) * 1.6 + 0.004, lin(shade[1]) * 1.6 + 0.01, lin(shade[2]) * 1.6 + 0.02);
    gl.uniform1f(view.U.uGain, causOk ? 1.0 : 0.0);
    gl.uniform1f(view.U.uIn, state.appear);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pageTex); gl.uniform1i(view.U.uPage, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, causTex); gl.uniform1i(view.U.uCaus, 1);
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    const p = gl.getAttribLocation(view.p, 'p');
    gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p, 2, gl.FLOAT, false, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  function tick(now) {
    state.frame = 0;
    if (!state.alive) return;
    const dt = Math.min(0.05, (now - state.last) / 1000); state.last = now;
    // inertia: the spin decays towards the idle turn
    if (!state.drag) {
      const k = Math.exp(-dt * 1.9);
      state.vel[0] = state.idle + (state.vel[0] - state.idle) * k;
      state.vel[1] *= k;
    }
    const moving = Math.abs(state.vel[0]) > 1e-4 || Math.abs(state.vel[1]) > 1e-4;
    if (moving) { state.rot = ortho(mul(mul(rotY(state.vel[0] * dt), rotX(state.vel[1] * dt)), state.rot)); state.dirty = true; }
    if (state.appear < 1) { state.appear = Math.min(1, state.appear + dt / 0.9); state.dirty = true; }
    if (state.dirty && state.visible) {
      draw();
      state.dirty = false;
      // if the device struggles (frames arriving late for a while), draw fewer pixels
      if (state.appear >= 1 && dt > 0) {
        state.slow = dt > 0.03 ? state.slow + 1 : Math.max(0, state.slow - 0.5);
        if (state.slow > 24 && quality > 0.5) { quality *= 0.78; state.slow = 0; resize(); }
      }
    }
    if (state.visible && (moving || state.appear < 1 || state.drag)) state.frame = requestAnimationFrame(tick);
  }
  const kick = () => { if (!state.frame && state.alive) { state.last = performance.now(); state.frame = requestAnimationFrame(tick); } };

  // pointer: grab the block and turn it; it keeps the speed of the hand when released
  const over = (e) => { const r = host.getBoundingClientRect(); const x = e.clientX - r.left, y = r.height - (e.clientY - r.top); return Math.hypot(x - place.cx, y - place.cy) < place.s * BR[state.shape] * 1.02; };
  const onDown = (e) => {
    if (e.button || !over(e)) return;
    state.drag = { x: e.clientX, y: e.clientY, t: performance.now(), id: e.pointerId, moved: false, touch: e.pointerType === 'touch' };
    if (!state.drag.touch) { host.setPointerCapture?.(e.pointerId); e.preventDefault(); }
    host.classList.add('is-grabbing', 'has-turned');
    kick();
  };
  const onMove = (e) => {
    if (!state.drag) { host.classList.toggle('is-over-ice', over(e)); return; }
    if (e.pointerId !== state.drag.id) return;
    const now = performance.now();
    const dx = e.clientX - state.drag.x, dy = e.clientY - state.drag.y, dt = Math.max(0.008, (now - state.drag.t) / 1000);
    state.drag.x = e.clientX; state.drag.y = e.clientY; state.drag.t = now;
    const k = 1 / (place.s * 1.25);
    const ax = dx * k, ay = state.drag.touch ? 0 : dy * k;
    state.rot = ortho(mul(mul(rotY(ax), rotX(ay)), state.rot));
    state.vel[0] = state.vel[0] * 0.5 + (ax / dt) * 0.5; state.vel[1] = state.vel[1] * 0.5 + (ay / dt) * 0.5;
    state.dirty = true;
    kick();
  };
  const onUp = (e) => {
    if (!state.drag || e.pointerId !== state.drag.id) return;
    state.drag = null;
    host.classList.remove('is-grabbing');
    const cap = 9;
    state.vel[0] = Math.max(-cap, Math.min(cap, state.vel[0])); state.vel[1] = Math.max(-cap, Math.min(cap, state.vel[1]));
    kick();
  };
  host.addEventListener('pointerdown', onDown);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp);
  window.addEventListener('pointercancel', onUp);

  const io = new IntersectionObserver(([en]) => { state.visible = en.isIntersecting; if (state.visible) { state.dirty = true; kick(); } }, { rootMargin: '10% 0px' });
  io.observe(host);
  let rz = 0;
  const onResize = () => { clearTimeout(rz); rz = setTimeout(() => { resize(); kick(); }, 120); };
  window.addEventListener('resize', onResize);
  const ro = 'ResizeObserver' in window ? new ResizeObserver(onResize) : null;
  ro?.observe(host);
  const onVis = () => { if (!document.hidden) kick(); };
  document.addEventListener('visibilitychange', onVis);

  host.append(canvas);
  const settled = () => Promise.race([
    Promise.allSettled((host.getAnimations?.({ subtree: true }) ?? []).filter((a) => a.effect?.getTiming?.().iterations !== Infinity).map((a) => a.finished)),
    new Promise((r) => setTimeout(r, 2600)),
  ]);
  (document.fonts?.ready ?? Promise.resolve()).then(settled).then(() => {
    if (!state.alive) return;
    resize();
    host.classList.add('has-ice');
    onReady?.();
    kick();
  });

  return {
    canvas,
    refresh() { resize(); kick(); },
    /** freeze at a given orientation (used to draw stills) */
    pose(rx, ry, rz2 = 0) { state.rot = mul(mul(rotX(rx), rotY(ry)), rotZ(rz2)); state.vel = [0, 0]; state.idle = 0; state.appear = 1; state.dirty = true; kick(); },
    destroy() {
      state.alive = false;
      cancelAnimationFrame(state.frame);
      io.disconnect(); ro?.disconnect();
      host.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('resize', onResize); document.removeEventListener('visibilitychange', onVis);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
      host.classList.remove('has-ice', 'is-over-ice', 'is-grabbing', 'has-turned');
    },
  };
}
