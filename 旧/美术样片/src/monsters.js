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

// ---------- 扑棱：一本自己会飞的旧书。两片书皮当翅膀扑腾，书页上一圈符文发青光，书缝里鼓出一只竖瞳的眼；底下吊着一根红书签 ----------
function makePulang(flap, elite) {
  const S = 58, SY = 32, Z = 36, cx = 29, cy = 16, zs = 13, ca = Math.cos(flap), sa = Math.sin(flap);
  const iris = elite ? RED_EYE : [255, 196, 92];
  const leather = elite ? [70, 30, 40] : [104, 40, 52], leather2 = [62, 22, 32], gold = [206, 168, 88];
  const paper = [218, 204, 166], paper2 = [172, 154, 116], ink = [74, 60, 50], rune = [120, 232, 214];
  return buildLit(S, SY, Z, (x, y, z) => {
    const X = x + .5 - cx, Y = y + .5 - cy, Zz = z + .5;
    // 书脊：一根圆滚滚的皮筒，前后两道金箍
    if (Math.abs(Y) < 11.5 && Math.hypot(X, Zz - zs) < 2.4) return Math.abs(Math.abs(Y) - 7) < .8 ? gold : leather2;
    // 眼睛：从书缝里鼓出来，正对着镜头（视线 (0, .69, .72)）
    const ex = X / 6, ey = (Y - 1) / 5, ez = (Zz - zs - 3) / 4, ed = ex * ex + ey * ey + ez * ez;
    if (ed < 1) {
      const f = (ey * .69 + ez * .72) / (Math.sqrt(ed) || 1);
      if (f > .78) return Math.abs(X) < .8 && f > .85 ? [16, 10, 12, 0, 1] : [...iris, 1];
      return f > .55 ? [236, 226, 204] : [190, 166, 148];
    }
    // 两半：书皮 + 书页，绕书脊转 flap 角（往上翘成 V 字）
    const side = X < 0 ? -1 : 1, dx = Math.abs(X), dz = Zz - zs, u = dx * ca + dz * sa, w = -dx * sa + dz * ca;   // u 离书脊多远；w 厚度方向（正 = 书页那面）
    if (u < 1.6 || u > 25 || Math.abs(Y) > 12) {
      // 红书签：从书脊底下垂下来，一路飘
      if (Zz < zs - 1.5 && Math.abs(Y + 11 - Math.sin(Zz * .45) * 1.2) < .8 && Math.abs(X - .6 - Math.sin(Zz * .3) * 1.5) < 1.1) return Zz < 1.5 ? [226, 86, 84] : [176, 38, 48];
      return null;
    }
    if (w >= -1.6 && w < 0) return u > 21.5 && Math.abs(Y) > 8.5 ? gold : Math.abs(Y) > 11 || u > 24 ? leather2 : leather;   // 书皮，四角包铜
    const rough = hash(Math.round(u), Math.round(Y), side, 77) * 1.2;   // 书页的边毛毛糙糙
    if (w >= 0 && w < 2.6 && u < 23.4 - rough && Math.abs(Y) < 10.6 - rough * .5) {
      if (w < 1.6) return mix(paper2, [140, 122, 90], .3);   // 页边：一层层的
      const ru = u - 13, rv = Y - side * 2.5, rd = Math.hypot(ru, rv);
      if (Math.abs(rd - 3.6) < .55 || (rd < 3 && (Math.abs(ru) < .5 || Math.abs(rv) < .5))) return [...rune, 1];   // 符文圈
      if (Math.round(Y + 20) % 3 === 0 && u > 4 && u < 21 && hash(Math.floor(u / 2), Math.round(Y), side, 78) < .75) return ink;   // 一行行墨字
      return mix(paper, paper2, clamp(u / 26 + hash(x, y, z, 79) * .2, 0, 1));
    }
    return null;
  });
}
const PULANG = {};
const pulangModel = (f, elite) => { const k = f + (elite ? 'e' : ''); return PULANG[k] || (PULANG[k] = makePulang([-.1, .4, .85][f], elite)); };

// ---------- 木木：一个提线木偶。没有脸的木头蛋脑袋，褪了色的红褂子，胸口烙着一个发光的符，手里攥一把锈镰刀；
// 几根发白的线从头顶、手腕、膝盖一直通到上头的雾里（看不见另一头攥着线的是谁） ----------
function makeMumu(pose, elite) {
  const S = 44, SY = 32, Z = 74, cx = 22, cy = 15;
  const [tilt, ra, la, rl, ll] = [[0, .12, .08, .1, 0], [.35, 1, .2, .5, .05], [-.3, .25, .9, 0, .45]][pose];   // 头歪、右手抬、左手抬、右腿抬、左腿抬
  const wood = [176, 140, 96], wood2 = [128, 98, 66], joint = [92, 70, 50], cloth = [140, 52, 46], cloth2 = [96, 34, 34];
  const head = [Math.sin(tilt) * 2, 0, 46], shoulder = [[-5.4, 0, 36], [5.4, 0, 36]], hip = [[-2.4, 0, 23], [2.4, 0, 23]];
  const arm = (sh, k, a) => { const el = [sh[0] + k * (1.5 + a * 3.5), sh[1] + a * 2.5, sh[2] - 6.5 + a * 3.5]; return [sh, el, [el[0] + k * (.8 + a * 2), el[1] + a * 3.5, el[2] - 6 + a * 5.5]]; };
  const leg = (hp, k, a) => { const kn = [hp[0] + k * .6, hp[1] + a * 4, hp[2] - 8 + a * 3]; return [hp, kn, [kn[0], kn[1] + 1.2 - a, kn[2] - 8.5 + a * 1.5]]; };
  const armR = arm(shoulder[1], 1, ra), armL = arm(shoulder[0], -1, la), legR = leg(hip[1], 1, rl), legL = leg(hip[0], -1, ll);
  const strings = [[head[0], 0, head[2] + 5.2], armR[2], armL[2], legR[1], legL[1]].map(p => [p, [p[0] * .35, -3, Z - 1]]);
  // 镰刀：顺着右小臂往外伸一截把，把头一弯刀刃往前勾
  const [el, wr] = [armR[1], armR[2]], dl = Math.hypot(wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]), dir = [0, 1, 2].map(i => (wr[i] - el[i]) / dl);
  const h1 = wr.map((v, i) => v + dir[i] * 7), blade = [h1, [h1[0] + dir[0] * 2, h1[1] + 2.6 + dir[1] * 2, h1[2] + dir[2] * 2], [h1[0] + 1, h1[1] + 5, h1[2] - dir[2] * .5], [h1[0] + 1.5, h1[1] + 4.6, h1[2] - dir[2] * 4]];
  const joints = [...shoulder, armR[1], armL[1], armR[2], armL[2], ...hip, legR[1], legL[1], legR[2], legL[2]];
  return buildLit(S, SY, Z, (x, y, z) => {
    const X = x + .5 - cx, Y = y + .5 - cy, Zz = z + .5;
    const hx = (X - head[0]) / 4.3, hy = Y / 4, hz = (Zz - head[2]) / 5.3;
    if (hx * hx + hy * hy + hz * hz < 1) {   // 头：光溜溜的木头蛋，一道裂纹；凶的那只，裂纹边上透出两点红光
      if (Y > 2.6) {
        if (elite && Math.abs(Zz - head[2] - .4) < .9 && Math.abs(Math.abs(X - head[0]) - 1.7) < .8) return [...RED_EYE, 1];
        if (Math.abs((X - head[0]) * .7 - (Zz - head[2]) + 1) < .45 && Math.abs(X - head[0]) < 3) return [70, 50, 36];
      }
      return Math.floor(Zz * .9 + X * .3) % 3 === 0 ? mix(wood, wood2, .35) : mix(wood, [226, 200, 160], .25);
    }
    if (segDist(X, Y, Zz, [0, 0, 38.5, head[0] * .5, 0, head[2] - 4.6]) < 1.2) return joint;
    if (Math.abs(X) < 4.6 && Math.abs(Y) < 2.9 && Zz > 26 && Zz < 38 && !(Math.abs(X) > 3.8 && Math.abs(Y) > 2.2)) {   // 身子：褂子 + 木头腰，胸口一个发光的符
      const cd = Math.hypot(X, Zz - 32.5);
      if (Y > 2.2 && cd < 2.2 && (Math.abs(cd - 1.7) < .5 || Math.abs(X) < .45)) return [255, 170, 90, 1];
      return Zz > 29 ? (Math.abs(X) < .6 ? cloth2 : cloth) : wood2;
    }
    if (Math.abs(X) < 3.6 && Math.abs(Y) < 2.5 && Zz > 21.5 && Zz <= 26) return wood2;
    for (const p of joints) if (Math.hypot(X - p[0], Y - p[1], Zz - p[2]) < 1.45) return joint;   // 关节：小木球
    if (polyDist(X, Y, Zz, armR) < 1.05 || polyDist(X, Y, Zz, armL) < 1.05) return wood;
    if (polyDist(X, Y, Zz, legR) < 1.25 || polyDist(X, Y, Zz, legL) < 1.25) return wood;
    for (const an of [legR[2], legL[2]]) if (Math.abs(X - an[0]) < 1.2 && Y > an[1] - 1 && Y < an[1] + 2.4 && Zz > an[2] - 2.2 && Zz < an[2] - .4) return wood2;   // 脚尖往下耷拉
    if (segDist(X, Y, Zz, [...wr, ...h1]) < .75) return [110, 82, 56];
    if (polyDist(X, Y, Zz, blade) < 1.05) return hash(x, y, z, 87) < .3 ? [146, 94, 62] : [186, 188, 194];
    for (const [a, b] of strings) if (Zz > a[2] && segDist(X, Y, Zz, [...a, ...b]) < .5) return [132, 164, 192, 1];   // 线：发白，微微发光
  });
}
const MUMU = {};
const mumuModel = (f, elite) => { const k = f + (elite ? 'e' : ''); return MUMU[k] || (MUMU[k] = makeMumu(f, elite)); };

// ---------- 大眼珠：老林子最里头。一颗磨盘大的眼珠子，嵌在一窝扭来扭去的老树根里，树根垂到地上；
// 眼仁是它正盯着的那种宝石色（单独一层 yanzhuIris，换颜色不用重做）；身边绕着三块刻符的小石头（battleProps 里转着画） ----------
const YZ = { S: 60, SY: 46, Z: 50, cx: 30, cy: 21, cz: 30, R: 12 };
function makeYanzhu(open) {
  const { S, SY, Z, cx, cy, cz, R } = YZ, r = rngFrom(733), roots = [];
  for (let i = 0; i < 7; i++) { const a = i / 7 * TAU + r() * .4, d = 15 + r() * 8; roots.push([[Math.cos(a) * 6, Math.sin(a) * 5 - 2, cz - 9], [Math.cos(a) * d * .6, Math.sin(a) * d * .5 - 2, cz - 16 - r() * 4], [Math.cos(a) * d, Math.sin(a) * d * .7 - 2, 0]]); }
  for (let i = 0; i < 4; i++) { const a = Math.PI * (1.15 + i * .23), d = 15 + r() * 3; roots.push([[Math.cos(a) * 9, -6, cz + 2], [Math.cos(a) * d, -9 - r() * 3, cz + 10 + r() * 6], [Math.cos(a) * (d + 3), -12, cz + 4 + r() * 6]]); }
  const bark = [72, 58, 48], bark2 = [44, 36, 30];
  return buildLit(S, SY, Z, (x, y, z) => {
    const X = x + .5 - cx, Y = y + .5 - cy, Zz = z + .5, dy = Y - 1, dz = Zz - cz, d = Math.hypot(X, dy, dz), f = d > 0 ? (dy * .69 + dz * .72) / d : 0;   // f：这一点朝镜头多少
    if (d < R) {
      if (!open && f > .3) return Math.abs(dz + dy * .3) < .6 ? [30, 24, 20] : mix(bark, [100, 84, 66], .5);   // 闭眼：两片树皮眼皮合上
      if (f > .84) return null;   // 眼仁那一块留给 yanzhuIris
      if (d < R - 1.5) return [180, 168, 150];
      return Math.abs(Math.sin(Math.atan2(dz, X) * 5 + f * 6)) < .1 && f < .55 ? [196, 110, 104] : mix([238, 232, 216], [196, 184, 164], clamp(1 - f, 0, 1) * .6);   // 眼白，几道淡红的血丝
    }
    if (d < R + 3 && f < (open ? .5 : 1.1)) return Math.abs(Math.sin(Math.atan2(dz, X) * 7 + d)) < .3 ? bark2 : mix(bark, [100, 84, 66], hash(x, y, z, 83) * .5);   // 树皮窝，前面敞着
    for (const p of roots) { const rd = polyDist(X, Y, Zz, p); if (rd < 1.9 - Zz * .016) return rd < .9 && hash(x, y, z, 84) < .04 ? [232, 220, 170, 1] : mix(bark, bark2, hash(x, y, z, 85) * .6); }   // 树根，偶尔睁着一粒小眼睛
  });
}
function makeYanzhuIris(col) {
  const { S, SY, Z, cx, cy, cz, R } = YZ;
  return build(S, SY, Z, (x, y, z) => {
    const X = x + .5 - cx, Y = y + .5 - cy, Zz = z + .5, dy = Y - 1, dz = Zz - cz, d = Math.hypot(X, dy, dz);
    if (d > R + .2 || d < R - 2.5) return null;
    const f = (dy * .69 + dz * .72) / d;
    if (f <= .84) return null;
    if (f > .975) return [6, 6, 8];   // 瞳孔
    const a = Math.atan2(X, -.72 * dy + .69 * dz);
    return [...mix(col, f > .94 ? [255, 255, 255] : [0, 0, 0], f > .94 ? .25 : Math.sin(a * 9) > .4 ? .3 : 0), 1];   // 眼仁一道道纹，发光
  }, true);
}
function makeRuneStone(col) {
  return buildLit(8, 8, 9, (x, y, z) => {
    const X = x + .5 - 4, Y = y + .5 - 4, Zz = z + .5, n = vnoise(x * .6, y * .6 + z * .4, 43);
    if (Math.abs(X) > 2.8 + n * .6 - Zz * .05 || Math.abs(Y) > 2.4 + n * .5 || Zz > 8 - Math.abs(X) * .4) return null;
    if (Y > 1.6 && ((Math.abs(X) < .5 && Zz > 2 && Zz < 7.2) || (Math.abs(Math.abs(X) - (Zz - 4)) < .5 && Zz > 4 && Zz < 6.5))) return [...col, 1];   // 正面刻一个符
    return mix([100, 106, 116], [66, 72, 82], n);
  });
}
const YANZHU = {}, YZ_IRIS = {}, RUNE_STONES = {};
const yanzhuModel = open => YANZHU[open] || (YANZHU[open] = makeYanzhu(open));
const yanzhuIris = j => YZ_IRIS[j] || (YZ_IRIS[j] = makeYanzhuIris(GEM_COLORS[j]));
const runeStone = j => RUNE_STONES[j] || (RUNE_STONES[j] = makeRuneStone(GEM_COLORS[j]));

// ---------- 战斗里每种怪怎么画 ----------
// lift：离地多高；bob：上下浮多少；dart：偶尔左右闪一下（提可）；tail：尾巴上吊一颗光点（提可）；
// heavy：出手只往前挪一点；dist：离主角多远（默认 38，大个子站远一点，免得压住下面的字）；head：血条再往上抬多少（翅膀往后伸的）
// core：林子里走近了露出真身时，那团鬼火缩到它身上哪个高度（胸口、眼睛里）
// model(s)：s = { t 战斗里的时间, cd 倒计时, elite, shake 抖伞还剩几秒 }
const LOOKS = {
  tiko: { lift: 14, bob: 2, dart: true, tail: true, core: 12,
    model: s => { const si = s.cd >= 3 ? 0 : s.cd === 2 ? 1 : 2, m = tikoModel(si, [0, 1, 2, 1][Math.floor(s.t * 9) % 4]); return s.elite ? redEyes(m) : m; } },
  dasan: { lift: 0, bob: 0, sway: 1.2, core: 34,
    model: s => dasanModel(s.shake > 0 ? Math.floor(s.t * 16) % 3 : [0, 1, 2, 1][Math.floor(s.t * 1.7) % 4], s.elite) },
  laodun: { lift: 0, bob: 0, heavy: true, dist: 48, core: 12,
    model: s => laodunModel(s.t % 4.6 < 4.42) },
  pulang: { lift: 12, bob: 2.5, head: 8, core: 28,
    model: s => pulangModel([0, 1, 2, 1][Math.floor(s.t * (s.shake > 0 ? 16 : 6)) % 4], s.elite) },
  mumu: { lift: 3, bob: 1.2, sway: .8, core: 36,   // 吊在线上晃；急性子：隔一会儿猛地抽一下胳膊腿
    model: s => { const k = s.t % 3.4; return mumuModel(k < 2.5 ? 0 : k < 2.75 ? 1 : k < 2.95 ? 0 : k < 3.2 ? 2 : 0, s.elite); } },
  yanzhu: { lift: 0, bob: 0, heavy: true, dist: 46, core: 30,
    model: s => yanzhuModel(s.t % 5.3 < 5.1) },
};
const lookOf = kind => LOOKS[kind] || LOOKS.tiko;
