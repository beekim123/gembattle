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

// ---------- 战斗里每种怪怎么画 ----------
// lift：离地多高；bob：上下浮多少；dart：偶尔左右闪一下（提可）；tail：尾巴上吊一颗光点（提可）；
// heavy：出手只往前挪一点；dist：离主角多远（默认 38，大个子站远一点，免得压住下面的字）
// model(s)：s = { t 战斗里的时间, cd 倒计时, elite, shake 抖伞还剩几秒 }
const LOOKS = {
  tiko: { lift: 14, bob: 2, dart: true, tail: true,
    model: s => { const si = s.cd >= 3 ? 0 : s.cd === 2 ? 1 : 2, m = tikoModel(si, [0, 1, 2, 1][Math.floor(s.t * 9) % 4]); return s.elite ? redEyes(m) : m; } },
  dasan: { lift: 0, bob: 0, sway: 1.2,
    model: s => dasanModel(s.shake > 0 ? Math.floor(s.t * 16) % 3 : [0, 1, 2, 1][Math.floor(s.t * 1.7) % 4], s.elite) },
  laodun: { lift: 0, bob: 0, heavy: true, dist: 48,
    model: s => laodunModel(s.t % 4.6 < 4.42) },
};
const lookOf = kind => LOOKS[kind] || LOOKS.tiko;
