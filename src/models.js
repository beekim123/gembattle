'use strict';
// 所有模型都在这里用代码逐体素生成。

// 枯树：歪干、下垂的尖枝、挂着的枯苔，没有叶子。
function makeDeadTree(sd) {
  const r = rngFrom(sd * 7919 + 13);
  const S = 44, Z = 72, c = S / 2, segs = [], moss = [];
  const lean = r() * TAU, lx = Math.cos(lean) * 5, ly = Math.sin(lean) * 5, th = 36 + r() * 18;
  let px = c, py = c, pz = 0; const parts = 5;
  for (let i = 1; i <= parts; i++) {
    const t = i / parts, nx = c + lx * t * t + (r() - .5) * 4, ny = c + ly * t * t + (r() - .5) * 4, nz = th * t;
    segs.push([px, py, pz, nx, ny, nz, 4.8 - 2.6 * (i - 1) / parts, 4.8 - 2.6 * i / parts]); px = nx; py = ny; pz = nz;
  }
  // 地上的根
  const nr = 3 + (r() * 3 | 0);
  for (let i = 0; i < nr; i++) {
    const a = i / nr * TAU + r() * .7, l = 7 + r() * 7;
    segs.push([c, c, 1.6, clamp(c + Math.cos(a) * l, 1, S - 2), clamp(c + Math.sin(a) * l, 1, S - 2), .2, 2.3, .6]);
  }
  function br(x, y, z, a, p, len, rad, d) {
    const x2 = clamp(x + Math.cos(a) * Math.cos(p) * len, 2, S - 3), y2 = clamp(y + Math.sin(a) * Math.cos(p) * len, 2, S - 3);
    const z2 = clamp(z + Math.sin(p) * len, 6, Z - 2);
    segs.push([x, y, z, x2, y2, z2, rad, rad * .5]);
    if (d > 0) {
      const n = 1 + (r() < .65 ? 1 : 0);
      for (let k = 0; k < n; k++) br(x2, y2, z2, a + (r() - .5) * 1.7, p - .15 + (r() - .5) * .7, len * (.55 + r() * .2), rad * .58, d - 1);
    } else if (r() < .55) moss.push([x2, y2, z2, 5 + r() * 8]);
  }
  const nb = 3 + (r() * 3 | 0);
  for (let i = 0; i < nb; i++) {
    const s = segs[2 + (r() * 3 | 0)], f = r();
    br(s[0] + (s[3] - s[0]) * f, s[1] + (s[4] - s[1]) * f, s[2] + (s[5] - s[2]) * f, i / nb * TAU + r() * .8, -.15 + r() * .75, 12 + r() * 7, 2.1, 2);
  }
  const bark1 = [74, 68, 64], bark2 = [44, 40, 42];
  return build(S, S, Z, (x, y, z) => {
    const X = x + .5, Y = y + .5, Zz = z + .5;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], d = segDist(X, Y, Zz, s);
      let rad = s[6] + (s[7] - s[6]) * segT; if (i === 0) rad += 3.5 * Math.max(0, 1 - Zz / 6);
      if (d < rad) return mix(bark1, bark2, vnoise(X * .8 + Zz * .12, Y * .8 + Zz * .9, sd));
    }
    for (const m of moss) {
      if (Zz > m[2] || Zz < m[2] - m[3]) continue;
      const dx = X - m[0], dy = Y - m[1];
      if (dx * dx + dy * dy < 2.2 && hash(x, y, 0, sd) < .45 && Zz > m[2] - m[3] * (.35 + .65 * hash(x, y, 1, sd)))
        return mix([74, 80, 70], [44, 48, 46], (m[2] - Zz) / m[3]);
    }
  });
}
// 活树：歪干 + 几团暗青的树冠（第一版试验里那种）
function makeLiveTree(sd) {
  const r = rngFrom(sd * 9301 + 17);
  const S = 34, Z = 54, c = S / 2, segs = [], blobs = [];
  const lean = r() * TAU, lx = Math.cos(lean) * 4, ly = Math.sin(lean) * 4, th = 24 + r() * 7;
  let px = c, py = c, pz = 0; const parts = 4;
  for (let i = 1; i <= parts; i++) {
    const t = i / parts, nx = c + lx * t + (r() - .5) * 3, ny = c + ly * t + (r() - .5) * 3, nz = th * t;
    segs.push([px, py, pz, nx, ny, nz, 3 - 1.3 * (i - 1) / parts, 3 - 1.3 * i / parts]); px = nx; py = ny; pz = nz;
  }
  function br(x, y, z, a, p, len, rad, d) {
    const x2 = clamp(x + Math.cos(a) * Math.cos(p) * len, 4, S - 5), y2 = clamp(y + Math.sin(a) * Math.cos(p) * len, 4, S - 5), z2 = Math.min(Z - 7, z + Math.sin(p) * len);
    segs.push([x, y, z, x2, y2, z2, rad, rad * .62]);
    if (d > 0) for (let k = 0; k < 2; k++) br(x2, y2, z2, a + (k ? 1 : -1) * (.35 + r() * .6), p + (r() - .35) * .5, len * .68, rad * .62, d - 1);
    else blobs.push([x2, y2, z2 + 1, 4.5 + r() * 2.5]);
  }
  const nb = 3 + (r() * 2 | 0);
  for (let i = 0; i < nb; i++) {
    const s = segs[2 + (r() * 2 | 0)], f = r();
    br(s[0] + (s[3] - s[0]) * f, s[1] + (s[4] - s[1]) * f, s[2] + (s[5] - s[2]) * f, i / nb * TAU + r(), .3 + r() * .5, 9, 1.4, 1);
  }
  blobs.push([px, py, pz + 3, 7]);
  const bark1 = [62, 52, 50], bark2 = [38, 35, 40], leaf = [[22, 42, 44], [32, 58, 54], [46, 78, 64]];
  return build(S, S, Z, (x, y, z) => {
    const X = x + .5, Y = y + .5, Zz = z + .5;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i], d = segDist(X, Y, Zz, s);
      let rad = s[6] + (s[7] - s[6]) * segT; if (i === 0) rad += 2.4 * Math.max(0, 1 - Zz / 4.5);
      if (d < rad) return mix(bark1, bark2, vnoise(X * .7 + Zz * .15, Y * .7 + Zz * .95, sd));
    }
    for (const b of blobs) {
      const dx = X - b[0], dy = Y - b[1], dz = (Zz - b[2]) * 1.3, n = vnoise(X * .38 + Zz * .23, Y * .38 - Zz * .19, sd + 3);
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < b[3] * (.68 + .55 * n)) {
        const sh = clamp((Zz - b[2]) / b[3] * .5 + .5, 0, 1);
        return leaf[Math.min(2, Math.floor(sh * 2.1 + hash(x, y, z, sd) * .9))];
      }
    }
  });
}
function makeGrass(sd) {
  const r = rngFrom(sd * 7 + 101);
  const bl = []; for (let i = 0; i < 9; i++) bl.push([2 + r() * 5, 2 + r() * 5, (r() - .5) * .4, (r() - .5) * .4, 2 + r() * 3.5]);
  return build(9, 9, 6, (x, y, z) => {
    for (const b of bl) { if (z > b[4]) continue; if (Math.abs(x + .5 - b[0] - b[2] * z) < .6 && Math.abs(y + .5 - b[1] - b[3] * z) < .6) return mix([36, 54, 44], [78, 98, 68], z / b[4]); }
  });
}
// 低矮灌木：长在树脚下和水边，把树和地面接起来
function makeBush(sd) {
  const r = rngFrom(sd * 613 + 5), blobs = [];
  for (let i = 0; i < 4; i++) blobs.push([6 + (r() - .5) * 5, 6 + (r() - .5) * 5, 2 + r() * 2.5, 2.4 + r() * 1.8]);
  const leaf = [[24, 44, 40], [34, 60, 50], [50, 80, 62]];
  return build(12, 12, 7, (x, y, z) => {
    for (const b of blobs) {
      const dx = x + .5 - b[0], dy = y + .5 - b[1], dz = (z + .5 - b[2]) * 1.2, n = vnoise(x * .6 + z * .4, y * .6, sd);
      if (Math.sqrt(dx * dx + dy * dy + dz * dz) < b[3] * (.8 + .4 * n)) return leaf[Math.min(2, Math.floor((z / 6) * 2 + hash(x, y, z, sd) * .9))];
    }
  });
}
// 断掉的树桩
function makeStump(sd) {
  const r = rngFrom(sd * 131 + 7);
  const h = 6 + r() * 6;
  return build(14, 14, 13, (x, y, z) => {
    const X = x + .5 - 7, Y = y + .5 - 7, Zz = z + .5, a = Math.atan2(Y, X);
    const rad = 3.6 + 2.2 * Math.max(0, 1 - Zz / 3) + .5 * Math.sin(a * 5 + sd);
    const top = h + 3 * vnoise(a * 2 + 9, sd, 3) - 1.5;
    if (X * X + Y * Y < rad * rad && Zz < top) return Zz > top - 1 ? [86, 72, 60] : mix([48, 44, 48], [30, 28, 32], vnoise(a * 3, Zz * .5, sd));
  });
}
// 荆棘丛：一团细枝和尖刺
function makeThorn(sd) {
  const r = rngFrom(sd * 977 + 3);
  const segs = [];
  for (let i = 0; i < 11; i++) {
    const x1 = 9 + (r() - .5) * 6, y1 = 9 + (r() - .5) * 6, a = r() * TAU, l = 4 + r() * 6;
    segs.push([x1, y1, 0, clamp(x1 + Math.cos(a) * l, 1, 16), clamp(y1 + Math.sin(a) * l, 1, 16), 2 + r() * 8, .8, .45]);
  }
  return build(18, 18, 11, (x, y, z) => {
    for (const s of segs) {
      const d = segDist(x + .5, y + .5, z + .5, s);
      if (d < s[6] + (s[7] - s[6]) * segT) return hash(x, y, z, sd) < .12 ? [96, 70, 74] : mix([58, 40, 48], [34, 26, 32], hash(x, y, z, sd + 1));
    }
  });
}
function makeRock(sd) {
  const r = rngFrom(sd * 48271 + 3);
  const a = 3.5 + r() * 4, b = 3 + r() * 3, h = 2.5 + r() * 4, S = Math.ceil(Math.max(a, b) * 2 + 4), Z = Math.ceil(h + 2), c = S / 2;
  const m = build(S, S, Z, (x, y, z) => {
    const X = x + .5 - c, Y = y + .5 - c, Zz = z + .5, n = vnoise(x * .45 + z * .3, y * .45, sd);
    if (X * X / (a * a) + Y * Y / (b * b) + Zz * Zz / (h * h) < .75 + .5 * n)
      return Zz > h * (.55 + .3 * n) ? mix([46, 58, 50], [34, 42, 40], hash(x, y, z, sd)) : mix([62, 64, 72], [38, 40, 48], n);
  });
  m.r = Math.max(a, b) * .85; return m;
}
// 惨白的菌子；glow 的那种发一点冷光
function makeFungus(sd, glow) {
  const r = rngFrom(sd * 31 + 9);
  const ms = []; for (let i = 0; i < 4; i++) ms.push([1.5 + r() * 5, 1.5 + r() * 5, 1 + (r() * 3 | 0)]);
  return build(8, 8, 5, (x, y, z) => {
    for (const m of ms) {
      const dx = x + .5 - m[0], dy = y + .5 - m[1], r2 = dx * dx + dy * dy;
      if (z < m[2] && r2 < .4) return [150, 146, 136];
      if (z === m[2] && r2 < 1.6) return glow ? [128, 196, 186, 1] : [196, 188, 170];
    }
  });
}
// 水边的枯苇
function makeReeds(sd) {
  const r = rngFrom(sd * 7 + 101);
  const bl = []; for (let i = 0; i < 8; i++) bl.push([3 + r() * 5, 3 + r() * 5, (r() - .5) * .3, (r() - .5) * .3, 4 + r() * 5]);
  return build(11, 11, 10, (x, y, z) => {
    for (const b of bl) {
      if (z > b[4]) continue;
      if (Math.abs(x + .5 - b[0] - b[2] * z) < .6 && Math.abs(y + .5 - b[1] - b[3] * z) < .6) return mix([60, 58, 50], [128, 120, 96], z / b[4]);
    }
  });
}

// 主角：卡牌系异能者。长外套、短发，不提灯——三颗宝石绕着身子转，靠宝石的光照亮。
// 前方是模型的 +y；f = 0 站、1 / 2 迈步。
function makePlayer(f) {
  const off = f === 0 ? 0 : f === 1 ? 1 : -1;
  const coat = [96, 110, 140], coat2 = [70, 80, 106], trim = [206, 176, 118], skin = [236, 216, 192], hair = [176, 156, 136], boot = [34, 30, 36];
  return build(10, 10, 17, (x, y, z) => {
    const dx = x + .5 - 5, dy = y + .5 - 5;
    if (z < 3) {
      const sw = off * (z < 1 ? 1.2 : .6);
      if (Math.abs(dx + 1.1) < .9 && Math.abs(dy - sw) < 1) return boot;
      if (Math.abs(dx - 1.1) < .9 && Math.abs(dy + sw) < 1) return boot;
      return null;
    }
    if (z < 11) {
      const t = (z - 3) / 8, rad = 3.3 - 1.1 * t;
      if (dx * dx + dy * dy < rad * rad) {
        if (z === 7) return (dx > 1.5 && dy > -.5) ? [124, 96, 68] : [72, 58, 46];   // 腰带、卡包
        if (z === 3) return trim;                                                   // 下摆
        if (dy > rad - 1.3 && Math.abs(dx) < .7) return trim;                      // 前襟
        return dy < -1 ? coat2 : coat;
      }
      if (z >= 6 && z <= 9 && Math.abs(Math.abs(dx) - 3.1) < .8 && Math.abs(dy) < .9) return z === 6 ? skin : coat2; // 手臂
      return null;
    }
    if (z === 11) return dx * dx + dy * dy < 2.2 * 2.2 ? trim : null;               // 领子
    const hz = z + .5 - 13.6, d2 = dx * dx + (dy + .2) * (dy + .2) + hz * hz;
    if (d2 < 2.5 * 2.5) {
      if (dy > 1 && z <= 13) return (z === 13 && Math.abs(Math.abs(dx) - .8) < .4) ? [30, 30, 40] : skin;
      return hair;
    }
    if (z === 16 && hash(x, y, 0, 3) < .5 && dx * dx + dy * dy < 3) return hair;
  });
}

// 提可：照设计单——黑圆头、两只冷白杏仁眼、两根触须、黑椭圆身子、一对镰刀爪交叉在身下、
// 四片暗红翅膀（上小下大、后缘台阶缺口）、细长尾巴吊一颗暖金光点；左上冷光边、右下暖光边。
// spread：1 张开、0 合拢裹住身子（躲光）；flap：-1..1 扇动。前方是 +y。
function makeTiko(spread, flap, k = 1.3) {
  const S = 48, SY = 36, Z = 44, cx = 24, cy = 16;
  const dark = [24, 22, 28], cold = [126, 146, 176], warm = [168, 98, 54];
  const ant = [-1, 1].map(k => [[k * 1.4, 0, 33.5], [k * 3.6, 1, 38], [k * 6.2, 2.2, 41.5]]);
  const claw = [-1, 1].map(k => [[k * 4, 1, 22], [k * 6, 2.6, 18], [k * 2.4, 3.4, 13.5], [-k * 1.2, 3.4, 12.6]]);
  const tail = [[0, -1, 16.5], [1.6, -2, 11.5], [-1.2, -2.2, 7.5], [.6, -1.6, 3.6]];
  const a = (1 - spread) * 1.95;
  const ca = Math.cos(a), sa = Math.sin(a);
  const rim = (X, Zz, base, outer) => !outer ? base : (X < -1 || Zz > 31) ? cold : X > 1.5 ? warm : base;
  return build(Math.round(S * k), Math.round(SY * k), Math.round(Z * k), (x0, y0, z0) => {
    const x = (x0 + .5) / k - .5, y = (y0 + .5) / k - .5, z = (z0 + .5) / k - .5;
    const X = x + .5 - cx, Y = y + .5 - cy, Zz = z + .5;
    // 头
    const hz = Zz - 30, hd = Math.sqrt(X * X + (Y - .4) * (Y - .4) + hz * hz * 1.1);
    if (hd < 4.6) {
      const ex = Math.abs(Math.abs(X) - 2);
      if (Y > 2.4 && hz > -1.6 && hz < 1.1 && ex < 1.3 - Math.abs(hz) * .25) return (ex < .55 && Math.abs(hz + .2) < .7) ? [8, 8, 12] : [226, 232, 240, 1];
      return rim(X, Zz, dark, hd > 3.7);
    }
    // 身子
    const bz = (Zz - 21.5) / 5.6, bd = X * X / 17.6 + Y * Y / 13 + bz * bz;
    if (bd < 1) return rim(X, Zz, dark, bd > .72);
    for (const p of ant) if (polyDist(X, Y, Zz, p) < .6) return dark;
    for (const p of claw) if (polyDist(X, Y, Zz, p) < .75) return [34, 30, 36];
    if (polyDist(X, Y, Zz, tail) < .6) return dark;
    { const dx = X - .6, dy = Y + 1.6, dz = Zz - 2.2; if (dx * dx + dy * dy + dz * dz < 2) return [255, 204, 112, 1]; }
    // 翅膀
    for (const k of [-1, 1]) {
      const ux = (X - k * 3.4) * k, uy = Y + 1.6;
      const lu = ux * ca + uy * sa, lv = -ux * sa + uy * ca;
      if (lu < 0 || Math.abs(lv) > .8) continue;
      const vz = Zz - flap * lu * .28;
      const step = ((lu | 0) % 3 === 2) ? 1 : 0;
      let v = vz - 25;
      const up = Math.min(.95 * lu + 1.2, 9.5), lo = .35 * lu - 1 + step;
      let hit = lu < 11.5 && v > lo && v < up;
      if (!hit) { v = vz - 20; hit = lu < 19 && v < -.2 * lu + 1.5 && v > -.62 * lu - 2.5 + step; }
      if (hit) {
        const t = clamp((vz - 6) / 26, 0, 1);
        return mix([74, 20, 32], [160, 64, 58], t);
      }
    }
  });
}
