'use strict';
// 无限林子：按 64×64 的区块随机生成（同一个种子同样的林子），走到哪生成到哪，远的扔掉。
const CH = 64;
const WORLD_SEED = 20261121;
const MODELS = {};
function initModels() {
  rimLight = false;
  MODELS.dead = [0, 1, 2, 3].map(i => makeDeadTree(i + 1));
  MODELS.rocks = [0, 1, 2, 3, 4].map(i => makeRock(i + 11));
  MODELS.stumps = [0, 1].map(i => makeStump(i));
  MODELS.live = [0, 1, 2, 3, 4, 5].map(i => makeLiveTree(i + 1));
  MODELS.bush = [0, 1, 2, 3].map(i => makeBush(i));
  MODELS.grass = [0, 1, 2, 3].map(i => makeGrass(i));
  MODELS.fungus = [makeFungus(1, false), makeFungus(3, true)];
  MODELS.reeds = [0, 1, 2].map(i => makeReeds(i));
  MODELS.player = [makePlayer(0), makePlayer(1), makePlayer(2)];
  MODELS.stone = makeStone();
}
const chunks = new Map();
const START_CLEAR = 30;
const quarter = r => ((r() * 4) | 0) * Math.PI / 2;   // 物件只转直角：镜头停下时切片正好对齐像素

const pondField = (gx, gy) => fbm(gx * .014, gy * .014, 9);
const groveField = (gx, gy) => fbm(gx * .011 + 50, gy * .011, 14);           // 高的地方成片林子，低的地方是林间空地
const trailAt = (gx, gy) => Math.abs(vnoise(gx * .0065 + 2 * vnoise(gx * .02, gy * .02, 7) * .3, gy * .0065, 21) - .5) < .03 + .014 * vnoise(gx * .05, gy * .05, 3);   // 弯弯的林间小路
function waterAt(gx, gy) {
  if (Math.hypot(gx, gy) < START_CLEAR + 14) return false;
  return pondField(gx, gy) > .655;
}
function genChunk(cx, cy) {
  const r = rngFrom(Math.floor(hash(cx, cy, 0, WORLD_SEED) * 4294967296));
  const ox = cx * CH, oy = cy * CH;
  const g = document.createElement('canvas'); g.width = g.height = CH;
  const gc = g.getContext('2d'), im = gc.createImageData(CH, CH);
  const water = new Uint8Array(CH * CH);
  // 地面只放大块的颜色变化（林下暗、空地亮、小路、水），细碎的东西另外按像素点上去
  for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const gx = ox + x, gy = oy + y, i = y * CH + x;
    const n = fbm(gx * .03, gy * .03, 1), grove = groveField(gx, gy);
    const far = Math.hypot(gx, gy) > START_CLEAR + 14, w = pondField(gx, gy);
    let col;
    if (ART.on) {   // 画师的底图 + 颜色表里的路和水，不混色
      col = artBaseCol(gx, gy);
      if (far && trailAt(gx, gy)) col = artCol('trail', col);
      if (far && w > .655) { water[i] = 1; col = w < .664 ? artCol('waterHi', col) : artCol('water', col); }
      else if (far && w > .645) col = artCol('soilDark', col);
    } else {
      col = mix([46, 62, 48], [58, 76, 56], n);
      col = mix(col, [34, 46, 40], smooth(clamp((grove - .45) / .2, 0, 1)) * .8);          // 林子底下暗一些
      const mud = fbm(gx * .02 + 40, gy * .02, 5); if (mud > .64) col = mix(col, [58, 54, 46], Math.min(1, (mud - .64) * 5) * .7);
      if (far && trailAt(gx, gy)) col = mix([78, 70, 58], [66, 60, 50], fbm(gx * .1, gy * .1, 6));
      if (far && w > .655) {
        water[i] = 1;
        col = mix([16, 28, 40], [26, 44, 58], fbm(gx * .06, gy * .2, 6));
        if (w < .668) col = mix(col, [46, 66, 72], .55);
      } else if (far && w > .635) col = mix(col, [54, 60, 52], (w - .635) / .02 * .8);
    }
    const k = i * 4; im.data[k] = col[0]; im.data[k + 1] = col[1]; im.data[k + 2] = col[2]; im.data[k + 3] = 255;
  }
  gc.putImageData(im, 0, 0);
  const decals = [];
  if (ART.on) artDecorate(gc, ox, oy, r, 3, 16, (x, y) => { const f = Math.hypot(x, y) > START_CLEAR + 14; return f && (pondField(x, y) > .64 || trailAt(x, y)); });
  else for (let i = 0; i < 46; i++) {
    const x = ox + r() * CH, y = oy + r() * CH; if (waterAt(x, y)) continue;
    const k = r();
    decals.push({ x, y, c: k < .55 ? (r() < .5 ? '#5e4a3a' : '#6e5844') : k < .85 ? '#4f6a4c' : '#6a6c66' });
  }
  const objs = [];
  const free = (x, y, rad) => objs.every(o => Math.hypot(o.x - x, o.y - y) > (o.r || 1.5) + rad);
  const dry = (x, y, m) => { for (let a = 0; a < 8; a++) if (waterAt(x + Math.cos(a * TAU / 8) * m, y + Math.sin(a * TAU / 8) * m)) return false; return !waterAt(x, y); };
  const clear = (x, y, m) => Math.hypot(x, y) > START_CLEAR + m && !trailAt(x, y) && !trailAt(x + m, y) && !trailAt(x - m, y);
  const place = (n, tries, fn) => { for (let k = 0, c = 0; k < tries && c < n; k++) if (fn()) c++; };
  const deadness = fbm(ox * .004 - 9, oy * .004, 12);
  const trees = [];
  // 树：按林子的疏密接受，成片长
  place(6, 90, () => {
    const x = ox + 4 + r() * (CH - 8), y = oy + 4 + r() * (CH - 8);
    if (r() > smooth(clamp((groveField(x, y) - .36) / .26, 0, 1))) return false;
    if (!dry(x, y, 6) || !clear(x, y, 6) || !free(x, y, ART.on ? 27 : 17)) return false;   // 画师的树冠大而实，隔开一点免得连成一片
    const dead = r() < deadness * .7;
    const o = { m: dead ? MODELS.dead[(r() * 4) | 0] : MODELS.live[(r() * 6) | 0], x, y, ro: quarter(r), r: dead ? 4 : 3.4, tall: true, dead };
    objs.push(o); trees.push(o); return true;
  });
  // 树脚下：灌木、草、偶尔一簇菌子
  for (const t of trees) {
    const n = 1 + (r() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = 6 + r() * 5, x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d;
      if (!dry(x, y, 2) || !free(x, y, 3)) continue;
      objs.push({ m: r() < .6 ? MODELS.bush[(r() * 4) | 0] : MODELS.grass[(r() * 4) | 0], x, y, ro: quarter(r), r: 0 });
    }
    if (r() < .18) { const a = r() * TAU, x = t.x + Math.cos(a) * 5, y = t.y + Math.sin(a) * 5; if (dry(x, y, 1) && free(x, y, 2)) { const glow = r() < .5; objs.push({ m: MODELS.fungus[glow ? 1 : 0], x, y, ro: quarter(r), r: 0, glow }); } }
  }
  if (r() < .25) place(1, 20, () => {
    const x = ox + r() * CH, y = oy + r() * CH;
    if (!dry(x, y, 4) || !clear(x, y, 4) || !free(x, y, 8)) return false;
    objs.push({ m: MODELS.stumps[(r() * 2) | 0], x, y, ro: quarter(r), r: 4 }); return true;
  });
  // 水边：石头、枯苇、灌木
  place(8, 80, () => {
    const x = ox + r() * CH, y = oy + r() * CH;
    if (waterAt(x, y) || dry(x, y, 5)) return false;
    const k = r(), m = k < .55 ? MODELS.reeds[(r() * 3) | 0] : k < .8 ? MODELS.bush[(r() * 4) | 0] : MODELS.rocks[(r() * 5) | 0];
    const rad = m.r || 0;
    if (!free(x, y, (rad || 2) + 1)) return false;
    objs.push({ m, x, y, ro: quarter(r), r: rad }); return true;
  });
  // 空地上稀稀的几丛草
  place(2, 20, () => {
    const x = ox + r() * CH, y = oy + r() * CH;
    if (!dry(x, y, 2) || !free(x, y, 6)) return false;
    objs.push({ m: MODELS.grass[(r() * 4) | 0], x, y, ro: quarter(r), r: 0 }); return true;
  });
  return { cx, cy, ground: g, water, objs, decals };
}
function getChunk(cx, cy) {
  const k = cx + ',' + cy;
  let c = chunks.get(k);
  if (!c) { c = genChunk(cx, cy); chunks.set(k, c); }
  return c;
}
function updateChunks(x, y) {
  const pcx = Math.floor(x / CH), pcy = Math.floor(y / CH);
  for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) getChunk(pcx + dx, pcy + dy);
  for (const [k, c] of chunks) if (Math.abs(c.cx - pcx) > 5 || Math.abs(c.cy - pcy) > 5) chunks.delete(k);
}
function isWater(x, y) {
  const cx = Math.floor(x / CH), cy = Math.floor(y / CH), c = chunks.get(cx + ',' + cy);
  if (!c) return waterAt(x, y);
  return c.water[(Math.floor(y) - cy * CH) * CH + (Math.floor(x) - cx * CH)] === 1;
}
function blocked(x, y, rad) {
  if (isWater(x, y)) return true;
  const pcx = Math.floor(x / CH), pcy = Math.floor(y / CH);
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const c = chunks.get((pcx + dx) + ',' + (pcy + dy)); if (!c) continue;
    for (const o of c.objs) if (o.r && Math.hypot(o.x - x, o.y - y) < o.r + rad) return true;
  }
  return false;
}
function nearChunks(x, y, rad) {
  const out = [], pcx = Math.floor(x / CH), pcy = Math.floor(y / CH), n = Math.ceil(rad / CH);
  for (let dy = -n; dy <= n; dy++) for (let dx = -n; dx <= n; dx++) { const c = chunks.get((pcx + dx) + ',' + (pcy + dy)); if (c) out.push(c); }
  return out;
}

// ---------- 鬼火（一团 = 一只怪；这版只有提可，蓝属性） ----------
const WISP = { keep: 3, near: 420, spacing: 150, spawnMin: 200, spawnMax: 380, guard: 34, seeRange: 110 };
const wisps = [];
let wispRng = rngFrom(77);
function updateWisps(px, py, dt) {
  for (let i = wisps.length - 1; i >= 0; i--) if (Math.hypot(wisps[i].x - px, wisps[i].y - py) > WISP.near * 1.6) wisps.splice(i, 1);
  let tries = 0;
  while (wisps.length < WISP.keep && tries++ < 40) {
    const a = wispRng() * TAU, d = WISP.spawnMin + wispRng() * (WISP.spawnMax - WISP.spawnMin);
    const x = px + Math.cos(a) * d, y = py + Math.sin(a) * d;
    if (waterAt(x, y) || Math.hypot(x, y) < START_CLEAR + 30) continue;
    if (wisps.some(w => Math.hypot(w.x - x, w.y - y) < WISP.spacing)) continue;
    getChunk(Math.floor(x / CH), Math.floor(y / CH));
    if (blocked(x, y, 6)) continue;
    wisps.push({ x, y, kind: 'tiko', color: MONSTERS.tiko.color, phase: wispRng() * TAU, hx: x, hy: y });
  }
  for (const w of wisps) {   // 在原地附近慢慢飘
    w.phase += dt;
    w.x = w.hx + Math.sin(w.phase * .4) * 6; w.y = w.hy + Math.cos(w.phase * .31) * 6;
  }
}
// 小鬼火：一小股火、闪得快
function drawWisp(ctx, p, t, col, scale = 1) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16 * scale);
  g.addColorStop(0, rgba(col, .45)); g.addColorStop(1, rgba(col, 0));
  ctx.fillStyle = g; ctx.fillRect(p.x - 16 * scale, p.y - 16 * scale, 32 * scale, 32 * scale);
  for (let i = 0; i < 16; i++) {
    const life = (t * 1.9 + i / 16) % 1, fl = hash(i, Math.floor(t * 14), 0, 5);
    const x = p.x + Math.sin(i * 2.3 + t * 5) * (3 - life * 2.4) * scale + (fl - .5);
    const y = p.y + 2 * scale - life * 11 * scale;
    const c = mix([230, 240, 255], col, life);
    ctx.fillStyle = rgba(c, (1 - life) * .95);
    const s = life < .3 ? 2 : 1;
    ctx.fillRect(Math.round(x), Math.round(y), s, s);
  }
  ctx.globalCompositeOperation = 'source-over';
}
