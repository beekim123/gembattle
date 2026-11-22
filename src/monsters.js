'use strict';
// 怪在战斗里的样子（见 设计.md「怪」）。提可用画师的（art/neo-1）；打伞的、老墩按 neo-1 的颜色表和同一种打光
// （底色暗，轮廓左上一道冷光边、右下一道暖光边）用代码逐体素生成。模型前方是 +y（战斗里正对主角和镜头）。
// 精英「凶·××」：同一个模型，眼睛换成红的，身上一圈红光；不放大（非整数倍放大，像素会不齐）。

const NEO = {   // 用到的 neo-1 颜色（读不到美术时的后备值跟颜色表一样）
  body: [23, 29, 38], inner: [46, 57, 68], rimTop: [207, 224, 232], rimTopBack: [127, 160, 168], rimLow: [226, 162, 79],
  skinDark: [38, 13, 16], skinMid: [82, 24, 26], skin: [142, 44, 36], skinEdge: [201, 86, 60],
  barkDark: [36, 30, 26], barkMid: [56, 47, 41], barkLight: [80, 68, 59], woodRing: [106, 90, 75],
  leafDark: [28, 50, 41], leafMid: [42, 72, 59], eye: [244, 255, 253], spark: [247, 201, 120],
};
const neo = k => artCol(k, NEO[k]);
const RED_EYE = [255, 84, 66];

// 怪自己打光：fn 返回 [r,g,b]、[r,g,b,1]（自发光）、[r,g,b,0,1]（不加光边，比如洞里头）或空。
// 按周围空不空估一个朝向：快要背过去的面（轮廓）朝左上的加冷光边、朝右下的加暖光边，其余按一盏左上前方的灯微微明暗。
// 镜头从南边斜 46° 往下看（battle 里 tilt .72），视线 = (0, -.69, -.72)。
function buildLit(sx, sy, sz, fn, rim = true) {
  const vox = new Array(sx * sy * sz);
  for (let z = 0; z < sz; z++) for (let y = 0; y < sy; y++) for (let x = 0; x < sx; x++) vox[(z * sy + y) * sx + x] = fn(x, y, z) || null;
  const solid = (x, y, z) => z < 0 || (x >= 0 && y >= 0 && x < sx && y < sy && z < sz && !!vox[(z * sy + y) * sx + x]);   // 地面以下当实心
  const cold = neo('rimTop'), back = neo('rimTopBack'), warm = neo('rimLow');
  return build(sx, sy, sz, (x, y, z) => {
    const v = vox[(z * sy + y) * sx + x]; if (!v) return null;
    if (v[3] === 1) return v;
    let c = [v[0], v[1], v[2]].map(k => k * (.8 + .2 * z / Math.max(1, sz - 1)));
    if (v[4]) return c;
    if (solid(x - 1, y, z) && solid(x + 1, y, z) && solid(x, y - 1, z) && solid(x, y + 1, z) && solid(x, y, z + 1)) return c;
    let nx = 0, ny = 0, nz = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (!solid(x + dx, y + dy, z + dz)) { nx += dx; ny += dy; nz += dz; }
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const face = ny * .69 + nz * .72, up = -.72 * ny + .69 * nz;   // face：朝镜头多少；up：在屏幕上朝上多少
    const ul = (-nx + up) * .707, dr = (nx - up) * .707;
    c = c.map(k => k * (.84 + .3 * Math.max(0, -.45 * nx + .35 * ny + .82 * nz)));
    if (!rim) return c;
    if (face < .42 && ul > .5) return mix(c, cold, .78);
    if (face < .58 && ul > .3) return mix(c, back, .42);
    if (face < .5 && dr > .45) return mix(c, warm, .58);
    return c;
  }, true);
}

// ---------- 提可（画师的；没读到美术就用 models.js 里代码版的） ----------
const TIKO = {};
const SPREADS = [1, .55, .12], FLAPS = [-1, 0, 1];
function tikoModel(si, fi) { const k = si * 3 + fi; if (ART.on && ART.tiko) return ART.tiko[k % ART.tiko.length]; return TIKO[k] || (TIKO[k] = makeTiko(SPREADS[si], FLAPS[fi])); }
// 精英：把眼睛的颜色换成红的（切片和发光切片都换）
const RED_COPY = new Map();
function redEyes(m) {
  if (RED_COPY.has(m)) return RED_COPY.get(m);
  const from = [neo('eye'), [226, 232, 240]];
  const rec = c => {
    if (!c) return null;
    const k = document.createElement('canvas'); k.width = c.width; k.height = c.height;
    const g = k.getContext('2d'); g.drawImage(c, 0, 0);
    const im = g.getImageData(0, 0, k.width, k.height), d = im.data;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] && from.some(f => Math.abs(d[i] - f[0]) + Math.abs(d[i + 1] - f[1]) + Math.abs(d[i + 2] - f[2]) < 12)) { d[i] = RED_EYE[0]; d[i + 1] = RED_EYE[1]; d[i + 2] = RED_EYE[2]; }
    g.putImageData(im, 0, 0); return k;
  };
  const out = { ...m, slices: m.slices.map(rec), em: m.em ? m.em.map(rec) : null };
  RED_COPY.set(m, out); return out;
}

// ---------- 打伞的：远看像个打伞的人；近看是驼背的菌子，伞沿上一排白眼 ----------
// 身子像一件长到地的浅色褂子，驼着背；伞盖扛在肩上往后仰，伞沿正面那排眼睛正对着你。
// tilt：伞往后仰多少（几帧轮着换，像在喘气；抖伞时换得快）
function makeDasan(tilt, elite) {
  const S = 44, SY = 44, Z = 70, cx = 22, cy = 19;
  const Cy = 2.5, Cz = 57, ct = Math.cos(tilt), st = Math.sin(tilt), Rc = 14.5;
  const eyeC = elite ? RED_EYE : neo('eye');
  const eyes = []; for (let k = -4; k <= 4; k++) eyes.push({ phi: Math.PI / 2 + k * .3, dx: hash(k, 1, 0, 9) < .5 ? -1 : 1, dz: hash(k, 2, 0, 9) < .5 ? 0 : 1 });
  const spine = [[0, -2, 0], [0, -3, 14], [0, -2.4, 28], [0, .5, 38], [0, 3.2, 46], [0, 3.4, 58]];
  const coat = [138, 130, 114], coat2 = [96, 90, 80], hem = [168, 158, 136];
  const cap1 = neo('skinDark'), cap2 = neo('skinMid'), rib = neo('skin'), spot = [150, 138, 120], gill = [26, 17, 19];
  return buildLit(S, SY, Z, (x, y, z) => {
    const X = x + .5 - cx, Y = y + .5 - cy, Zz = z + .5;
    // 伞盖：w 沿伞轴往上，b 在伞面里朝前
    const py = Y - Cy, pz = Zz - Cz, w = py * st + pz * ct, b = py * ct - pz * st;
    const phi = Math.atan2(b, X), rr = Math.hypot(X, b * 1.05), edge = Rc + .5 * Math.cos(phi * 8);
    if (rr < edge) {
      const t = rr / edge, ribOn = Math.abs(Math.cos(phi * 4)) > .96;
      const wTop = 8.5 * Math.sqrt(Math.max(0, 1 - t * t)) + (ribOn ? .8 : 0), wBot = 3.5 * (1 - t * t) - 3;
      if (w <= wTop && w >= wBot) {
        if (rr > edge - 1.6 && w < wBot + 2.6) {   // 伞沿正面一排眼睛，每只瞳孔朝的地方不一样
          for (const e of eyes) {
            let dp = phi - e.phi; dp = Math.atan2(Math.sin(dp), Math.cos(dp));
            const u = dp * rr, vv = w - (wBot + 1.3);
            if (Math.abs(u) < 1.2 && Math.abs(vv) < 1.1) return (Math.sign(u) === e.dx && Math.sign(vv) === (e.dz ? 1 : -1)) ? [8, 8, 12] : [...eyeC, 1];
          }
        }
        if (w < wBot + 1 && rr < edge - 1.6) return [...gill, 0, 1];   // 底下的菌褶
        if (ribOn && w > wTop - 1.6) return rib;
        if (w > wTop - 1.4 && hash(Math.round(X / 2), Math.round(b / 2), 0, 31) < .06) return spot;
        return mix(cap1, cap2, clamp(vnoise(X * .24, b * .24, 33) * 1.2 - .1 + t * .2, 0, 1));
      }
    }
    // 身子：像一件长褂子，下摆宽、往上收，驼着背；肩上一圈菌环像披肩
    const rad = (Zz < 38 ? 6.4 - 3 * Zz / 38 : 3.4 - .6 * clamp((Zz - 38) / 12, 0, 1)) + 1.2 * Math.max(0, 1 - Zz / 3);
    const d = polyDist(X, Y, Zz, spine);
    if (Zz > 32.5 && Zz < 38.5 && d < rad + 1 + (38.5 - Zz) * .7 && d > rad - .5) return hem;
    if (d < rad) return mix(coat, coat2, clamp(vnoise(Math.atan2(Y + 2.5, X) * 3.2, Zz * .1, 35) * 1.3 - .2, 0, 1));
  });
}
const DASAN = {};
const dasanModel = (f, elite) => { const k = f + (elite ? 'e' : ''); return DASAN[k] || (DASAN[k] = makeDasan([-.16, -.22, -.28][f], elite)); };

// ---------- 老墩：活过来的老树墩，正面一个树洞，洞里两点光；两截断枝像胳膊 ----------
function makeLaodun(eyesOn) {
  const S = 56, Z = 44, c = 28, R0 = 13.5, r = rngFrom(4242), segs = [];
  for (let i = 0; i < 7; i++) {   // 根：两段，越往外越细
    const a = i / 7 * TAU + r() * .5 + .3, l = 21 + r() * 3, bend = (r() - .5) * .6;
    const p0 = [Math.cos(a) * (R0 - 3), Math.sin(a) * (R0 - 3), 6], p1 = [Math.cos(a + bend * .5) * (R0 + 6), Math.sin(a + bend * .5) * (R0 + 6), 2.6], p2 = [Math.cos(a + bend) * l, Math.sin(a + bend) * l, .5];
    segs.push([...p0, ...p1, 3.3, 2.4], [...p1, ...p2, 2.4, 1]);
  }
  for (const k of [-1, 1]) {   // 两截断枝
    const p0 = [k * (R0 - 2), 1, 21], p1 = [k * (R0 + 6), 3, 27], p2 = [k * (R0 + 9), 1.5, 33];
    segs.push([...p0, ...p1, 2.9, 2.1], [...p1, ...p2, 2.1, 1.2], [...p1, k * (R0 + 10.5), 6, 28, 1.1, .7]);
  }
  const eye = neo('spark'), ring = neo('woodRing');
  return buildLit(S, S, Z, (x, y, z) => {
    const X = x + .5 - c, Y = y + .5 - c, Zz = z + .5, a = Math.atan2(Y, X), d = Math.hypot(X, Y);
    const rad = R0 + 1.6 * vnoise(a * 2.4 + 5, Zz * .07, 17) + 6.5 * Math.max(0, 1 - Zz / 9) ** 2;
    const jag = d > R0 - 4 ? hash(Math.floor((a + 4) * 3.2), 0, 0, 29) * 5 : 0;
    const top = 27 + 6 * vnoise(a * 1.5 + 2, 1, 23) + jag;
    if (d < rad && Zz < top) {
      // 树洞：正面一个竖着的椭圆，洞口一圈浅色的木头边，洞底两点光
      const hx = X / 4.8, hz = (Zz - 13) / 6.4, e = hx * hx + hz * hz;
      if (e < 1 && Y > rad - 5) return null;
      if (e < 1.5 && Y > rad - 6.5) {
        if (eyesOn && Math.abs(Math.abs(X) - 2.3) < 1.2 && Math.abs(Zz - 10.5) < 1.3) return [...eye, 1];
        return [12, 11, 12, 0, 1];
      }
      if (e < 2.3 && Y > rad - 2.5) return [...mix(ring, neo('barkLight'), .3), 0, 1];
      if (Zz > top - 1.4 && d < rad - 1.4) {   // 断口：年轮，正中烂了一个坑（不加光边）
        if (d < 4) return [24, 19, 17, 0, 1];
        return [...mix(ring, neo('barkLight'), (Math.sin(d * 1.7) + 1) * .3), 0, 1];
      }
      if (Zz > top - 2.4 && vnoise(X * .3, Y * .3, 41) > .55) return mix(neo('leafMid'), neo('leafDark'), hash(x, y, z, 3));   // 顶上的苔
      if (X < -rad + 1.5 && [[8, 2], [11.5, -1.5]].some(([zz, yy]) => Math.abs(Zz - zz) < .8 && Math.abs(Y - yy) < 3)) return [168, 156, 136];   // 左边两片木耳
      const groove = Math.sin(a * 23 + vnoise(Zz * .08, a, 31) * 4) > .55;
      return groove ? mix(neo('barkDark'), [18, 15, 13], .35) : mix(neo('barkMid'), neo('barkLight'), vnoise(a * 6, Zz * .2, 33) * .8);
    }
    if (X < -rad - .5 && X > -rad - 4 && [[8, 2], [11.5, -1.5]].some(([zz, yy]) => Math.abs(Zz - zz) < .7 && Math.hypot(Y - yy, (X + rad) * 1.2) < 3.4)) return [168, 156, 136];
    for (const s of segs) {
      const dd = segDist(X, Y, Zz, s);
      if (dd < s[6] + (s[7] - s[6]) * segT) return Zz > 2.2 && vnoise(X * .4, Y * .4, 43) > .62 ? neo('leafDark') : mix(neo('barkMid'), neo('barkDark'), hash(x, y, z, 7) * .6);
    }
  });
}
const LAODUN = {};
const laodunModel = on => LAODUN[on ? 1 : 0] || (LAODUN[on ? 1 : 0] = makeLaodun(on));

// 扎根：一圈拱出地面的根须。stage 0/1/2 = 刚冒头 / 一半 / 长满；half -1 = 后半圈（画在老墩后面），1 = 前半圈
function makeRootRing(stage, half) {
  const S = 64, Z = 11, c = 32, r = rngFrom(777), arcs = [];
  for (let i = 0; i < 14; i++) arcs.push({ a0: i / 14 * TAU + r() * .25, span: .4 + r() * .3, R: 22 + r() * 5, h: (4 + r() * 4.5) * [.4, .7, 1][stage], th: 1.15 + r() * .6 });
  return buildLit(S, S, Z, (x, y, z) => {
    const X = x + .5 - c, Y = y + .5 - c, Zz = z + .5;
    if (half < 0 ? Y >= 0 : Y < 0) return null;
    const d = Math.hypot(X, Y), a = Math.atan2(Y, X);
    for (const o of arcs) {
      let da = a - o.a0; da = Math.atan2(Math.sin(da), Math.cos(da));
      if (da < 0 || da > o.span) continue;
      const t = da / o.span, hh = Math.sin(t * Math.PI) * o.h;
      if (Math.hypot(d - o.R, Zz - hh) < o.th * (1 - .45 * Math.abs(t - .5))) return mix(neo('barkMid'), neo('woodRing'), hash(x, y, z, 5) * .5);
    }
  }, false);
}
const ROOTS = {};
const rootModel = (stage, half) => { const k = stage + ':' + half; return ROOTS[k] || (ROOTS[k] = makeRootRing(stage, half)); };

// ---------- 扑棱：大蛾子，翅膀上长满眼纹 ----------
// flap：翅膀抬起的角度（几帧轮着换就是扑腾）
function makePulang(flap, elite) {
  const S = 74, SY = 48, Z = 40, cx = 37, cy = 22, zr = 17, ta = Math.tan(flap);
  const iris = elite ? RED_EYE : [214, 168, 92];
  const spots = [[20, 3.5, 4.4], [29, 7, 2.3], [12.5, -9, 3.6], [6, -4.5, 1.9], [22, -12, 2]];   // 翅膀上的眼纹：[离身子多远, 前后, 大小]
  const wing = (u, v) => {   // 前翅 + 后翅，两个斜着的椭圆
    const a = .18, fu = (u - 17) * Math.cos(a) + (v - 2.5) * Math.sin(a), fv = -(u - 17) * Math.sin(a) + (v - 2.5) * Math.cos(a);
    if ((fu / 16.5) ** 2 + (fv / 7.6) ** 2 < 1) return 1;
    const b = -.36, hu = (u - 13) * Math.cos(b) + (v + 8) * Math.sin(b), hv = -(u - 13) * Math.sin(b) + (v + 8) * Math.cos(b);
    return (hu / 12.5) ** 2 + (hv / 8) ** 2 < 1 ? 2 : 0;
  };
  const ant = [-1, 1].map(k => [[k * 1.2, 11.5, zr + 2], [k * 5.5, 18.5, zr + 7], [k * 9, 21, zr + 4.5]]);
  return buildLit(S, SY, Z, (x, y, z) => {
    const X = x + .5 - cx, Y = y + .5 - cy, Zz = z + .5;
    // 身子：毛茸茸的胸、一节节的肚子、小脑袋、两只黑亮的复眼
    const fuzz = .5 * hash(x, y, z, 71);
    if ((X / 4.3) ** 2 + ((Y - 4) / 4.6) ** 2 + ((Zz - zr) / 4.3) ** 2 < 1 + fuzz * .4) return mix([150, 136, 112], [104, 94, 80], fuzz * 2);
    if ((X / 3.4) ** 2 + ((Y + 6) / 9) ** 2 + ((Zz - zr + .5) / 3.6) ** 2 < 1) return Math.floor((Y + 20) / 2.2) % 2 ? [122, 108, 88] : [78, 68, 58];
    if ((X / 2.9) ** 2 + ((Y - 9.6) / 2.6) ** 2 + ((Zz - zr) / 2.7) ** 2 < 1) return Math.abs(Math.abs(X) - 1.8) < .9 && Y > 9.6 ? (Zz > zr + .8 ? [120, 130, 140] : [14, 14, 18]) : [140, 126, 104];
    for (const p of ant) if (polyDist(X, Y, Zz, p) < .75) return [168, 152, 122];
    // 翅膀：两层厚的薄板，从身子往外，扑腾时绕着身子翻
    const u = Math.abs(X) - 2.6; if (u < 0) return null;
    if (Math.abs(Zz - (zr + .5 + u * ta)) > 1.05) return null;
    const wv = wing(u, Y); if (!wv) return null;
    for (const [su, sv, sr] of spots) {
      const d = Math.hypot(u - su, Y - sv) / sr;
      if (d < 1) return d < .3 ? [14, 12, 12] : d < .56 ? [...iris, d < .45 && elite ? 1 : 0] : d < .74 ? [30, 26, 24] : [206, 194, 160];
    }
    const vein = Math.abs(Math.sin(Math.atan2(Y - 1, u + 3) * 7)) < .12;
    const edge = wv === 1 ? Math.hypot((u - 17) / 16.5, (Y - 2.5) / 7.6) > .86 : false;
    if (edge) return [62, 54, 48];
    return vein ? [64, 56, 50] : mix([112, 100, 84], [74, 66, 58], clamp(vnoise(u * .25, Y * .25, 73) * 1.3 - .15, 0, 1));
  });
}
const PULANG = {};
const pulangModel = (f, elite) => { const k = f + (elite ? 'e' : ''); return PULANG[k] || (PULANG[k] = makePulang([-.12, .22, .55][f], elite)); };

// ---------- 木木：像鹿，侧着身子，一张没有五官的白脸转过来对着你；角像枯枝 ----------
function makeMumu(tilt, elite) {
  const S = 64, SY = 48, Z = 72, cx = 32, cy = 22, r = rngFrom(919), segs = [];
  const A = .45, ca = Math.cos(A), sa = Math.sin(A);
  const W = (u, v) => [u * ca + v * sa, -u * sa + v * ca];   // 身子坐标（u 顺着身子，头在 u<0）→ 世界坐标：头那头往镜头这边转一点
  const hu = -16 + tilt * .8, [hx, hy0] = W(hu, 0), hy = hy0 + 1, hz = 47 + tilt * .7;   // 脸
  // 角：两根主枝往上往外分叉，再长几根小杈
  function br(p, a, up, len, rad, d) {
    const q = [p[0] + Math.cos(a) * Math.cos(up) * len, p[1] + Math.sin(a) * Math.cos(up) * len * .5, p[2] + Math.sin(up) * len];
    segs.push([...p, ...q, rad, rad * .62]);
    if (d > 0) { br(q, a + (r() - .5) * .5, up + .15 + r() * .25, len * .72, rad * .62, d - 1); if (r() < .75) br(q, a + (r() < .5 ? -.7 : .7), up + .5, len * .5, rad * .5, d - 1); }
  }
  for (const k of [-1, 1]) br([hx + k * 1.8, hy - 1.5, hz + 3], k < 0 ? Math.PI - .3 : .3, .8, 9.5, 1.5, 3);
  // 腿：大腿粗、小腿细，后腿往后弯
  const legs = [[-9, 3.2], [-9, -3.2], [10, 3.2], [10, -3.2]].map(([lu, lv], i) => [[lu, lv, 27], [lu + (i < 2 ? -1 : 2.2), lv, 12], [lu + (i < 2 ? 0 : 1), lv, 0]]);
  const neck = [[-10, 0, 31], [-14, 0, 39], [hu, 0, hz - 3]];
  const fur = [100, 88, 76], fur2 = [62, 54, 48], belly = [140, 128, 110], face = elite ? [224, 180, 170] : [210, 202, 186];
  return buildLit(S, SY, Z, (x, y, z) => {
    const X = x + .5 - cx, Y = y + .5 - cy, Zz = z + .5, u = X * ca - Y * sa, v = X * sa + Y * ca;
    // 脸：一个朝着镜头的浅色蛋，什么都没有（凶的那只多两个红点）
    if (((X - hx) / 3.8) ** 2 + ((Y - hy) / 5.6) ** 2 + ((Zz - hz) / 4.4) ** 2 < 1) {
      if (elite && Y > hy + 3.4 && Math.abs(Zz - hz - .8) < 1 && Math.abs(Math.abs(X - hx) - 1.6) < .8) return [...RED_EYE, 1];
      return Y > hy ? face : mix(face, fur, .45);
    }
    for (const k of [-1, 1]) if (((X - hx - k * 4.6) / 2.6) ** 2 + ((Y - hy + 1.5) / 1.2) ** 2 + ((Zz - hz - 2.2) / 1.3) ** 2 < 1) return mix(fur, face, .3);   // 耳朵
    for (const sg of segs) { const d = segDist(X, Y, Zz, sg); if (d < sg[6] + (sg[7] - sg[6]) * segT) return segT > .7 && sg[6] < .9 ? [200, 188, 164] : [150, 138, 118]; }   // 角：发白的枯枝
    if (polyDist(u, v, Zz, neck) < 3.4 - .8 * clamp((Zz - 31) / 14, 0, 1)) return mix(fur, fur2, hash(x, y, z, 75) * .5);
    // 身子：一截圆桶，前面肩膀拱起来，后面是屁股
    if (((u - 1) / 13) ** 2 + (v / 6.2) ** 2 + ((Zz - 28) / 7) ** 2 < 1 || ((u + 8) / 6) ** 2 + (v / 5.6) ** 2 + ((Zz - 31) / 6) ** 2 < 1 || ((u - 9) / 6.5) ** 2 + (v / 6) ** 2 + ((Zz - 29) / 6.5) ** 2 < 1) {
      if (Zz < 24.5) return mix(belly, fur, .3);
      if (Math.abs(v) < 1.3 && Zz > 32) return fur2;   // 脊背一道深色
      return mix(fur, fur2, clamp(vnoise(u * .25, Zz * .3, 77) * .9, 0, 1));
    }
    // 腿不描光边：细细的深色剪影
    for (const l of legs) if (polyDist(u, v, Zz, l) < (Zz > 14 ? 1.2 + (Zz - 14) * .09 : 1.1)) return Zz < 2.2 ? [28, 24, 24, 0, 1] : [...fur2, 0, 1];
    if (Math.hypot(u - 14.5, v, Zz - 31) < 2) return [178, 168, 150];   // 白尾巴尖
  });
}
const MUMU = {};
const mumuModel = (f, elite) => { const k = f + (elite ? 'e' : ''); return MUMU[k] || (MUMU[k] = makeMumu([0, 1, 2][f], elite)); };

// ---------- 老猫头：站在断树桩上的大猫头鹰，胸口羽毛里一圈圈小眼睛 ----------
// 两只大眼睛单独做成一层（owlEyes），颜色就是它正盯着的那种宝石色，换颜色不用重做整只
function makeMaotou() {
  const S = 58, SY = 46, Z = 64, cx = 29, cy = 21;
  const eyes = [];   // 胸口的小眼睛：两圈，隔开一点，一只只看得清
  for (let ring = 0; ring < 2; ring++) { const n = 4 + ring * 3, rr = 3.8 + ring * 4.6; for (let i = 0; i < n; i++) { const a = i / n * TAU + ring * .45 + .4; eyes.push([Math.cos(a) * rr * 1.15, 27 + Math.sin(a) * rr]); } }
  const feather = [118, 106, 92], feather2 = [72, 64, 58], chest = [150, 138, 118];
  return buildLit(S, SY, Z, (x, y, z) => {
    const X = x + .5 - cx, Y = y + .5 - cy, Zz = z + .5;
    // 树桩
    if (Zz < 8 && Math.hypot(X, Y + 1) < 10 + 2 * Math.max(0, 1 - Zz / 3) + .8 * vnoise(Math.atan2(Y, X) * 3, 1, 79)) return Zz > 7 ? [120, 102, 82] : mix([86, 74, 64], [56, 48, 42], vnoise(Math.atan2(Y, X) * 6, Zz * .3, 81));
    // 爪子
    for (const k of [-1, 1]) if (Math.hypot(X - k * 4, Y - 6.5, Zz - 8.6) < 1.4 || Math.hypot(X - k * 5.4, Y - 7.5, Zz - 8) < 1) return [52, 44, 34];
    // 头：大圆脑袋，正面一张平平的脸盘，两撮耳毛
    const hd = Math.hypot(X / 11.5, (Y - 1.5) / 10, (Zz - 47) / 9.5);
    for (const k of [-1, 1]) { const t = (Zz - 53) / 8; if (t > 0 && t < 1 && Math.hypot(X - k * (6 + t * 3), Y + 1) < 2.6 * (1 - t)) return feather2; }
    if (hd < 1) {
      if (Y > 6.5) {   // 脸盘
        const ex = Math.abs(Math.abs(X) - 4.7), ed = Math.hypot(ex, Zz - 48);
        if (ed < 3.6 && Y > 8) return [10, 10, 12, 0, 1];   // 眼窝（大眼睛另画）
        if (Math.abs(X) < 1.3 && Zz > 42.5 && Zz < 45.5) return [196, 160, 76];   // 喙
        const disc = Math.hypot(X / 10, (Zz - 47) / 8);
        return disc > .86 ? [74, 62, 52] : mix([186, 176, 156], chest, disc);
      }
      return Math.floor(Zz / 2.2 + Math.abs(X) * .3) % 2 ? feather : mix(feather, feather2, .5);
    }
    // 两边收着的翅膀
    for (const k of [-1, 1]) if (((X - k * 12.5) / 3.4) ** 2 + ((Y + 1.5) / 9) ** 2 + ((Zz - 26) / 12) ** 2 < 1) return Math.floor((Zz + Y) / 2.5) % 2 ? feather2 : [94, 84, 74];
    // 身子：蛋形；胸口浅色，羽毛一排排，里面长着两圈小眼睛（不发光，睁着）
    const bd = Math.hypot(X / 13, Y / 10.5, (Zz - 26) / 16);
    if (bd < 1) {
      if (Y > 5) {
        for (const [ex, ez] of eyes) { const d = Math.hypot(X - ex, Zz - ez); if (d < 1.6) return d < .7 ? [14, 10, 10, 0, 1] : d < 1.1 ? [196, 168, 92] : [222, 214, 186]; }
        return Math.floor(Zz / 2) % 2 && Math.abs(Math.sin(X * .9)) < .3 ? feather2 : chest;
      }
      return Math.floor(Zz / 2.4 + Math.abs(X) * .25) % 2 ? feather : mix(feather, feather2, .55);
    }
  });
}
// 大眼睛那一层：只有两只眼睛的虹膜和瞳孔
function makeOwlEyes(col) {
  const S = 58, SY = 46, Z = 64, cx = 29, cy = 21;
  return build(S, SY, Z, (x, y, z) => {
    const X = x + .5 - cx, Y = y + .5 - cy, Zz = z + .5;
    if (Y < 8.2 || Y > 10.6) return null;
    const ed = Math.hypot(Math.abs(Math.abs(X) - 4.7), Zz - 48);
    if (ed < 1.3) return [6, 6, 8];
    if (ed < 3.3) return [...mix(col, [255, 255, 255], ed < 2 ? .35 : 0), 1];
  }, true);
}
let MAOTOU = null; const OWL_EYES = {};
const maotouModel = () => MAOTOU || (MAOTOU = makeMaotou());
const owlEyes = j => OWL_EYES[j] || (OWL_EYES[j] = makeOwlEyes(GEM_COLORS[j]));

// ---------- 战斗里每种怪怎么画 ----------
// lift：离地多高；bob：上下浮多少；dart：偶尔左右闪一下（提可）；tail：尾巴上吊一颗光点（提可）；
// heavy：出手只往前挪一点；dist：离主角多远（默认 38，大个子站远一点，免得压住下面的字）；head：血条再往上抬多少（翅膀往后伸的）
// model(s)：s = { t 战斗里的时间, cd 倒计时, elite, shake 抖伞还剩几秒 }
const LOOKS = {
  tiko: { lift: 14, bob: 2, dart: true, tail: true,
    model: s => { const si = s.cd >= 3 ? 0 : s.cd === 2 ? 1 : 2, m = tikoModel(si, [0, 1, 2, 1][Math.floor(s.t * 9) % 4]); return s.elite ? redEyes(m) : m; } },
  dasan: { lift: 0, bob: 0, sway: 1.2,
    model: s => dasanModel(s.shake > 0 ? Math.floor(s.t * 16) % 3 : [0, 1, 2, 1][Math.floor(s.t * 1.7) % 4], s.elite) },
  laodun: { lift: 0, bob: 0, heavy: true, dist: 48,
    model: s => laodunModel(s.t % 4.6 < 4.42) },
  pulang: { lift: 12, bob: 2.5, head: 14,
    model: s => pulangModel([0, 1, 2, 1][Math.floor(s.t * (s.shake > 0 ? 16 : 6)) % 4], s.elite) },
  mumu: { lift: 0, bob: 0, sway: .6,
    model: s => mumuModel(s.t % 5 < 3.6 ? 0 : s.t % 5 < 3.9 ? 1 : 2, s.elite) },
  maotou: { lift: 0, bob: 0, heavy: true, dist: 46,
    model: () => maotouModel() },
};
const lookOf = kind => LOOKS[kind] || LOOKS.tiko;
