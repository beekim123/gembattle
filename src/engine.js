'use strict';
// 基础：噪声、随机数、体素建模、像素堆叠绘制、镜头投影。
const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => t * t * (3 - 2 * t);
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const rgba = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;

function hash(x, y, z = 0, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1440662683) + Math.imul(s | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi, 0, s), b = hash(xi + 1, yi, 0, s), c = hash(xi, yi + 1, 0, s), d = hash(xi + 1, yi + 1, 0, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y, s) => vnoise(x, y, s) * .6 + vnoise(x * 2.1, y * 2.1, s + 7) * .3 + vnoise(x * 4.3, y * 4.3, s + 13) * .1;
function rngFrom(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}
function shuffle(a, rng) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---------- 体素 → 切片 ----------
// fn(x,y,z) 返回 [r,g,b]（吃明暗）或 [r,g,b,1]（自发光）或空。
let rimLight = false;   // 只给枯树、石头开：朝上的面带一点冷光边
function build(sx, sy, sz, fn) {
  const vox = new Array(sx * sy * sz);
  for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) vox[(z * sy + y) * sx + x] = fn(x, y, z) || null;
  const at = (x, y, z) => x < 0 || y < 0 || z < 0 || x >= sx || y >= sy || z >= sz ? null : vox[(z * sy + y) * sx + x];
  const slices = [], em = [];   // em：只有自发光体素的切片，画的时候同时画进发光层
  let anyEm = false;
  for (let z = 0; z < sz; z++) {
    const c = document.createElement('canvas'); c.width = sx; c.height = sy;
    const g = c.getContext('2d'), im = g.createImageData(sx, sy); let any = false, eim = null;
    for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) {
      const v = at(x, y, z); if (!v) continue; any = true;
      let [r, gg, b, e] = v;
      const i = (y * sx + x) * 4;
      if (!e) {
        let k = .6 + .4 * z / Math.max(1, sz - 1);
        const top = !at(x, y, z + 1);
        if (top) k *= 1.15;
        else if (!at(x - 1, y, z) || !at(x + 1, y, z) || !at(x, y - 1, z) || !at(x, y + 1, z)) k *= .82;
        r *= k; gg *= k; b *= k;
        if (top && rimLight && z > sz * .3) { r = r * .82 + 20; gg = gg * .82 + 26; b = b * .82 + 40; }   // 朝上的面：冷光边（逆光）
      } else {
        if (!eim) eim = new ImageData(sx, sy);
        eim.data[i] = r; eim.data[i + 1] = gg; eim.data[i + 2] = b; eim.data[i + 3] = 255;
      }
      im.data[i] = r; im.data[i + 1] = gg; im.data[i + 2] = b; im.data[i + 3] = 255;
    }
    g.putImageData(im, 0, 0); slices.push(any ? c : null);
    if (eim) { const ec = document.createElement('canvas'); ec.width = sx; ec.height = sy; ec.getContext('2d').putImageData(eim, 0, 0); em.push(ec); anyEm = true; }
    else em.push(null);
  }
  return { sx, sy, sz, slices, em: anyEm ? em : null };
}
let segT = 0;
function segDist(x, y, z, s) {
  const vx = s[3] - s[0], vy = s[4] - s[1], vz = s[5] - s[2], wx = x - s[0], wy = y - s[1], wz = z - s[2];
  const t = clamp((wx * vx + wy * vy + wz * vz) / (vx * vx + vy * vy + vz * vz || 1), 0, 1); segT = t;
  const dx = wx - vx * t, dy = wy - vy * t, dz = wz - vz * t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}
// 折线（点列）上距离最近的段
function polyDist(x, y, z, pts) {
  let best = 1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    const d = segDist(x, y, z, [a[0], a[1], a[2], b[0], b[1], b[2]]);
    if (d < best) best = d;
  }
  return best;
}

// ---------- 镜头 ----------
// 世界单位 = 体素。view = 镜头转角；tilt = 地面压扁比例；hs = 每层体素在屏幕上抬多高。
const CAM = { x: 0, y: 0, view: 0, tilt: .6, hs: .8, W: 320, H: 180, oy: 14, ox: 0 };
// 世界像素 → 舞台 CSS 像素：x * scale + ox（scale 是整数，像素才方正）
const VIEW = { scale: 6, ox: 0, oy: 0, sw: 1280, sh: 720, dpr: 1 };
function w2ui(p) { return { x: (VIEW.ox + p.x * VIEW.scale) / VIEW.sw * 1280, y: (VIEW.oy + p.y * VIEW.scale) / VIEW.sh * 720 }; }
function setTilt(t) { CAM.tilt = t; CAM.hs = Math.sqrt(1 - t * t); }
function proj(wx, wy, wz = 0) {
  const dx = wx - CAM.x, dy = wy - CAM.y, c = Math.cos(CAM.view), s = Math.sin(CAM.view);
  const rx = c * dx - s * dy, ry = s * dx + c * dy;
  return { x: CAM.W / 2 + CAM.ox + rx, y: CAM.H / 2 + CAM.oy + ry * CAM.tilt - wz * CAM.hs, ry };
}
function screenDirToWorld(ix, iy) {
  const c = Math.cos(CAM.view), s = Math.sin(CAM.view);
  return [c * ix + s * iy, -s * ix + c * iy];
}
function groundTransform(ctx, wx, wy, wz = 0) {
  const p = proj(wx, wy, wz), c = Math.cos(CAM.view), s = Math.sin(CAM.view);
  ctx.setTransform(c, CAM.tilt * s, -s, CAM.tilt * c, p.x, p.y);
}
// 画一叠切片。lift = 整体离地多少体素（飞的怪）。
const FADE_C = document.createElement('canvas'), fadeCtx = FADE_C.getContext('2d');
function drawStack(ctx, m, p, ro, alpha = 1, lift = 0, sway = 0) {
  // 半透明：先把整叠画在一张图上再整体淡，不然几十层半透明叠起来又不透明了
  if (alpha < 1 && ctx !== fadeCtx) {
    const cw = ctx.canvas.width, ch = ctx.canvas.height;
    if (FADE_C.width !== cw || FADE_C.height !== ch) { FADE_C.width = cw; FADE_C.height = ch; }
    fadeCtx.setTransform(1, 0, 0, 1, 0, 0); fadeCtx.clearRect(0, 0, cw, ch); fadeCtx.imageSmoothingEnabled = false;
    drawStack(fadeCtx, m, p, ro, 1, lift, sway);
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.drawImage(FADE_C, 0, 0); ctx.globalAlpha = 1;
    return;
  }
  const th = ro + CAM.view, c = Math.cos(th), s = Math.sin(th), t = CAM.tilt, hs = CAM.hs;
  ctx.globalAlpha = alpha;
  const px = Math.round(p.x);
  for (let z = 0; z < m.sz; z++) {
    const sl = m.slices[z]; if (!sl) continue;
    const sx = sway ? Math.round(sway * (z / m.sz) * (z / m.sz)) : 0;
    ctx.setTransform(c, t * s, -s, t * c, px + sx, Math.round(p.y - (z + lift) * hs));
    ctx.drawImage(sl, -m.sx / 2, -m.sy / 2);
    const e = m.em && EMIT && m.em[z];
    if (e) { EMIT.globalAlpha = ctx === fadeCtx ? .35 : alpha; EMIT.setTransform(c, t * s, -s, t * c, px + sx, Math.round(p.y - (z + lift) * hs)); EMIT.drawImage(e, -m.sx / 2, -m.sy / 2); }
  }
  ctx.globalAlpha = 1;
  if (EMIT) EMIT.globalAlpha = 1;
}
