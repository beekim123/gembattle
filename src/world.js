'use strict';
// 林子：一段一段的（见 设计.md「整局流程」）。每段 7×7 块（一块 64×64 体素），按这一段的种子生成；
// 南边进，北边是石门，门前站着看门的；四周是走不过去的密林，越往外越黑。
const CH = 64;
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
  MODELS.gate = [makeGate(false), makeGate(true)];
  MODELS.hollow = [makeHollow(true), makeHollow(false)];
  MODELS.logs = [1, 2, 3].map(makeLog);
}
// 用过的石碑：同一个模型，刻痕不再发光
const DIM = new Map();
const dimOf = m => DIM.get(m) || (DIM.set(m, { ...m, em: null }), DIM.get(m));
const chunks = new Map();
const quarter = r => ((r() * 4) | 0) * Math.PI / 2;   // 物件只转直角：镜头停下时切片正好对齐像素

// ---------- 这一段的设定 ----------
const FLOOR_N = 7, FLOOR_W = FLOOR_N * CH, EDGE = 12;   // 离边 12 体素以内走不过去
// normal：普通怪的血（越靠北越多，最深 ×4，再乘各种怪的 hpMul）；elites：红鬼火几团（血 ×3）；hollows：树洞几个（最少~最多）；
// guard：看门的（蛤蟆塘的先用提可顶着，第 5 步换）
// look：地貌。shade 黑暗的颜色；fog 雾多浓（0~.3）；trees 林子里头的树多几倍；dead 枯树多出来多少；pond 水塘门槛（越小水越多）；
//       stumps / logs 每块地出树桩 / 倒木的机会；tint 地面往哪个颜色偏多少
const FLOORS = [
  { name: '砍柴坡', dark: .74, kinds: ['tiko', 'dasan'], wisps: 4, elites: 1, hollows: [1, 2], normal: 1500, guard: { kind: 'laodun', hp: 15e4 },
    look: { shade: [6, 10, 22], fog: .05, trees: 1, dead: 0, pond: .655, stumps: .7, logs: .08, tint: null } },
  { name: '老林子', dark: .8, kinds: ['pulang', 'mumu'], wisps: 5, elites: 1, hollows: [1, 2], normal: 5e4, guard: { kind: 'maotou', hp: 5e6 },
    look: { shade: [4, 12, 11], fog: .2, trees: 1.7, dead: .08, pond: .7, stumps: .12, logs: .6, tint: [[20, 38, 30], .32] } },
  { name: '蛤蟆塘', dark: .84, kinds: ['tiko'], wisps: 5, elites: 1, hollows: [1, 2], normal: 1.6e6, guard: { kind: 'tiko', hp: 1.6e8, atk: 1.5 },
    look: { shade: [8, 12, 16], fog: .24, trees: .7, dead: .35, pond: .6, stumps: .1, logs: .2, tint: [[44, 46, 34], .22] } },
];
const NUM_CN = ['一', '二', '三', '四'];
let FLOOR = null;
const MM_CELL = 4, MM_N = FLOOR_W / MM_CELL;   // 小地图：4×4 体素一格

function makeFloor(i, seed) {
  const r = rngFrom(seed), def = FLOORS[i];
  const F = { i, def, seed, nx: (seed % 997) * 3.1, ny: (seed % 991) * 2.7, wisps: [], gateOpen: false,
    explored: new Uint8Array(MM_N * MM_N), mm: document.createElement('canvas') };
  F.mm.width = F.mm.height = MM_N;
  F.entry = { x: FLOOR_W / 2 + (r() - .5) * 120, y: FLOOR_W - 34 };
  F.gate = { x: FLOOR_W / 2 + (r() - .5) * 160, y: 30 };
  F.guardPos = { x: F.gate.x, y: F.gate.y + 46 };
  // 一条弯弯的主路从入口通到石门：路上不长树、不积水，保证走得到
  const pts = [[F.entry.x, FLOOR_W]];
  for (let k = 1; k <= 3; k++) pts.push([70 + r() * (FLOOR_W - 140), F.entry.y - k * (F.entry.y - F.gate.y) / 4]);
  pts.push([F.gate.x, F.gate.y]);
  F.path = pts;
  // 石碑（歇脚）：半路上、离主路不远；树洞：躲在离路远的地方，走岔路才碰得到
  F.spots = [];
  const okSpot = (x, y, near) => inFloor(x, y, 34) && Math.hypot(x - F.entry.x, y - F.entry.y) > 90 && Math.hypot(x - F.guardPos.x, y - F.guardPos.y) > 90 && F.spots.every(s => Math.hypot(s.x - x, s.y - y) > 110) && (near ? pathDist(x, y, pts) < 40 : pathDist(x, y, pts) > 46);
  for (let k = 0; k < 200; k++) {
    const t = .38 + r() * .26, y = F.entry.y - t * (F.entry.y - F.gate.y), side = r() < .5 ? -1 : 1, x = pathX(pts, y) + side * (22 + r() * 10);
    if (okSpot(x, y, true)) { F.spots.push({ kind: 'rest', x, y, used: false }); break; }
  }
  const nh = def.hollows[0] + Math.floor(r() * (def.hollows[1] - def.hollows[0] + 1));
  for (let k = 0; k < 400 && F.spots.length < 1 + nh; k++) {
    const x = 40 + r() * (FLOOR_W - 80), y = 60 + r() * (FLOOR_W - 140);
    if (okSpot(x, y, false)) F.spots.push({ kind: 'hollow', x, y, used: false });
  }
  return F;
}
// 主路在高度 y 处的 x（主路从南往北，y 一路变小）
function pathX(pts, y) {
  for (let k = 0; k < pts.length - 1; k++) { const [ax, ay] = pts[k], [bx, by] = pts[k + 1]; if (y <= ay && y >= by) return ax + (bx - ax) * (ay - y) / (ay - by || 1); }
  return pts.at(-1)[0];
}
function pathDist(x, y, pts = FLOOR.path) {
  let best = 1e9;
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1], vx = bx - ax, vy = by - ay;
    const t = clamp(((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy || 1), 0, 1);
    best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t));
  }
  return best;
}
// 离可走区域的边还有多远（负数 = 在外面）
const edgeDist = (x, y) => Math.min(x - EDGE, FLOOR_W - EDGE - x, y - EDGE, FLOOR_W - EDGE - y);
const inFloor = (x, y, m = 0) => edgeDist(x, y) >= m;

const pondField = (gx, gy) => fbm((gx + FLOOR.nx) * .014, (gy + FLOOR.ny) * .014, 9);
const groveField = (gx, gy) => fbm((gx + FLOOR.nx) * .011 + 50, (gy + FLOOR.ny) * .011, 14);   // 高的地方成片林子，低的地方是林间空地
const trailAt = (gx, gy) => { const x = gx + FLOOR.nx, y = gy + FLOOR.ny; return Math.abs(vnoise(x * .0065 + 2 * vnoise(x * .02, y * .02, 7) * .3, y * .0065, 21) - .5) < .03 + .014 * vnoise(x * .05, y * .05, 3); };   // 弯弯的林间小路
const mainPath = (gx, gy) => pathDist(gx, gy) < 3.2 + 1.4 * vnoise(gx * .08, gy * .08, 5);
function keepClear(gx, gy, m) {   // 入口、石门前、主路边上、石碑和树洞旁边不放东西
  const F = FLOOR;
  return Math.hypot(gx - F.entry.x, gy - F.entry.y) < 30 + m || Math.hypot(gx - F.gate.x, gy - F.gate.y - 26) < 48 + m || pathDist(gx, gy) < 7 + m ||
    F.spots.some(s => Math.hypot(gx - s.x, gy - s.y) < 26 + m);   // 石碑、树洞周围留一小块空地，不让树冠盖住
}
function waterAt(gx, gy) {
  if (!FLOOR || !inFloor(gx, gy, 10) || keepClear(gx, gy, 8)) return false;
  return pondField(gx, gy) > FLOOR.def.look.pond;
}
function genChunk(cx, cy) {
  const F = FLOOR, look = F.def.look, pond = look.pond, r = rngFrom(Math.floor(hash(cx, cy, F.i + 1, F.seed) * 4294967296));
  const ox = cx * CH, oy = cy * CH;
  const g = document.createElement('canvas'); g.width = g.height = CH;
  const gc = g.getContext('2d'), im = gc.createImageData(CH, CH);
  const water = new Uint8Array(CH * CH);
  // 地面只放大块的颜色变化（林下暗、空地亮、小路、水），细碎的东西另外按像素点上去
  for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
    const gx = ox + x, gy = oy + y, i = y * CH + x, ed = edgeDist(gx, gy);
    const n = fbm(gx * .03, gy * .03, 1), grove = groveField(gx, gy), w = waterAt(gx, gy) ? 1 : 0;
    const shore = !w && ed > 10 && !keepClear(gx, gy, 6) && pondField(gx, gy) > pond - .01;
    const trail = ed > 4 && (mainPath(gx, gy) || trailAt(gx, gy));
    let col;
    if (ART.on) {   // 画师的底图 + 颜色表里的路和水，不混色
      col = artBaseCol(gx, gy);
      if (trail) col = artCol('trail', col);
      if (w) { water[i] = 1; col = pondField(gx, gy) < pond + .009 ? artCol('waterHi', col) : artCol('water', col); }
      else if (shore) col = artCol('soilDark', col);
    } else {
      col = mix([46, 62, 48], [58, 76, 56], n);
      col = mix(col, [34, 46, 40], smooth(clamp((grove - .45) / .2, 0, 1)) * .8);
      if (trail) col = mix([78, 70, 58], [66, 60, 50], fbm(gx * .1, gy * .1, 6));
      if (w) { water[i] = 1; col = mix([16, 28, 40], [26, 44, 58], fbm(gx * .06, gy * .2, 6)); }
    }
    if (look.tint && !w) col = mix(col, look.tint[0], look.tint[1]);   // 这一段的地面往哪个颜色偏
    if (ed < 6) col = col.map(v => v * clamp(.25 + (ed + 18) / 32, .14, 1));   // 边上沉进黑里
    const k = i * 4; im.data[k] = col[0]; im.data[k + 1] = col[1]; im.data[k + 2] = col[2]; im.data[k + 3] = 255;
  }
  gc.putImageData(im, 0, 0);
  const decals = [];
  const badDecal = (x, y) => edgeDist(x, y) < 4 || waterAt(x, y) || pondField(x, y) > pond - .015 || mainPath(x, y) || trailAt(x, y);
  if (ART.on) artDecorate(gc, ox, oy, r, 3, 16, badDecal);
  else for (let i = 0; i < 46; i++) {
    const x = ox + r() * CH, y = oy + r() * CH; if (badDecal(x, y)) continue;
    const k = r(); decals.push({ x, y, c: k < .55 ? (r() < .5 ? '#5e4a3a' : '#6e5844') : k < .85 ? '#4f6a4c' : '#6a6c66' });
  }
  const objs = [];
  const free = (x, y, rad) => objs.every(o => Math.hypot(o.x - x, o.y - y) > (o.r || 1.5) + rad);
  const dry = (x, y, m) => { for (let a = 0; a < 8; a++) if (waterAt(x + Math.cos(a * TAU / 8) * m, y + Math.sin(a * TAU / 8) * m)) return false; return !waterAt(x, y); };
  const clear = (x, y, m) => !keepClear(x, y, m) && !trailAt(x, y) && !trailAt(x + m, y) && !trailAt(x - m, y);
  const place = (n, tries, fn) => { for (let k = 0, c = 0; k < tries && c < n; k++) if (fn()) c++; };
  const deadness = clamp(fbm(ox * .004 - 9, oy * .004, 12) + look.dead, 0, 1);   // 越往里枯树越多
  const tree = (x, y, rad) => { const dead = r() < deadness * .7; const o = { m: dead ? MODELS.dead[(r() * 4) | 0] : MODELS.live[(r() * 6) | 0], x, y, ro: quarter(r), r: dead ? 4 : 3.4, tall: true, dead }; objs.push(o); return o; };
  const trees = [];
  // 外面和贴边的一圈：密密的树，挡住视线
  place(14, 140, () => {
    const x = ox + 2 + r() * (CH - 4), y = oy + 2 + r() * (CH - 4), ed = edgeDist(x, y);
    if (ed > 14 || ed < -60 || !free(x, y, ART.on ? 15 : 11) || keepClear(x, y, 0)) return false;
    tree(x, y); return true;
  });
  // 里面的树：按林子的疏密接受，成片长
  place(Math.round(6 * look.trees), Math.round(90 * look.trees), () => {
    const x = ox + 4 + r() * (CH - 8), y = oy + 4 + r() * (CH - 8);
    if (edgeDist(x, y) < 14) return false;
    if (r() > smooth(clamp((groveField(x, y) - .36 + (look.trees - 1) * .12) / .26, 0, 1))) return false;
    if (!dry(x, y, 6) || !clear(x, y, 6) || !free(x, y, (ART.on ? 27 : 17) / Math.sqrt(look.trees))) return false;   // 画师的树冠大而实，隔开一点免得连成一片；老林子挤一些
    trees.push(tree(x, y)); return true;
  });
  // 树脚下：灌木、草、偶尔一簇菌子
  for (const t of trees) {
    const n = 1 + (r() * 2 | 0);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = 6 + r() * 5, x = t.x + Math.cos(a) * d, y = t.y + Math.sin(a) * d;
      if (!dry(x, y, 2) || !free(x, y, 3) || keepClear(x, y, 0)) continue;
      objs.push({ m: r() < .6 ? MODELS.bush[(r() * 4) | 0] : MODELS.grass[(r() * 4) | 0], x, y, ro: quarter(r), r: 0 });
    }
    if (r() < .18) { const a = r() * TAU, x = t.x + Math.cos(a) * 5, y = t.y + Math.sin(a) * 5; if (dry(x, y, 1) && free(x, y, 2)) { const glow = r() < .5; objs.push({ m: MODELS.fungus[glow ? 1 : 0], x, y, ro: quarter(r), r: 0, glow }); } }
  }
  if (r() < look.stumps) place(1, 20, () => {
    const x = ox + r() * CH, y = oy + r() * CH;
    if (edgeDist(x, y) < 16 || !dry(x, y, 4) || !clear(x, y, 4) || !free(x, y, 8)) return false;
    objs.push({ m: MODELS.stumps[(r() * 2) | 0], x, y, ro: quarter(r), r: 4 }); return true;
  });
  // 倒木：一截老树干横在地上，挡路；沿着树干摆一串看不见的挡块
  if (r() < look.logs) place(1, 30, () => {
    const x = ox + 8 + r() * (CH - 16), y = oy + 8 + r() * (CH - 16), ro = quarter(r), m = MODELS.logs[(r() * MODELS.logs.length) | 0];
    const ux = Math.cos(ro), uy = Math.sin(ro), half = m.len / 2 * .9;
    const pts = [-1, -.5, 0, .5, 1].map(t => [x + ux * half * t, y + uy * half * t]);
    if (edgeDist(x, y) < 24 || pts.some(([px, py]) => !dry(px, py, 3) || !clear(px, py, 5) || !free(px, py, 7))) return false;
    objs.push({ m, x, y, ro, r: 0, log: true });
    for (const [px, py] of pts) objs.push({ m: null, x: px, y: py, r: 3.2 });
    return true;
  });
  // 水边：石头、枯苇、灌木
  place(8, 80, () => {
    const x = ox + r() * CH, y = oy + r() * CH;
    if (edgeDist(x, y) < 12 || waterAt(x, y) || dry(x, y, 5)) return false;
    const k = r(), m = k < .55 ? MODELS.reeds[(r() * 3) | 0] : k < .8 ? MODELS.bush[(r() * 4) | 0] : MODELS.rocks[(r() * 5) | 0];
    const rad = m.r || 0;
    if (!free(x, y, (rad || 2) + 1) || keepClear(x, y, 0)) return false;
    objs.push({ m, x, y, ro: quarter(r), r: rad }); return true;
  });
  // 空地上稀稀的几丛草
  place(2, 20, () => {
    const x = ox + r() * CH, y = oy + r() * CH;
    if (edgeDist(x, y) < 12 || !dry(x, y, 2) || !free(x, y, 6)) return false;
    objs.push({ m: MODELS.grass[(r() * 4) | 0], x, y, ro: quarter(r), r: 0 }); return true;
  });
  // 石碑和树洞
  for (const s of F.spots) if (Math.floor(s.x / CH) === cx && Math.floor(s.y / CH) === cy) {
    if (s.kind === 'rest') objs.push({ spot: s, m: s.used ? dimOf(MODELS.stone) : MODELS.stone, x: s.x, y: s.y, ro: 0, r: 4.5, light: !s.used });
    else objs.push({ spot: s, m: MODELS.hollow[s.used ? 1 : 0], x: s.x, y: s.y, ro: 0, r: 5.5, glint: !s.used });
  }
  // 石门（两根柱子各放一个看不见的挡块）
  const G = F.gate;
  if (Math.floor(G.x / CH) === cx && Math.floor(G.y / CH) === cy) {
    objs.push({ gate: true, m: MODELS.gate[F.gateOpen ? 1 : 0], x: G.x, y: G.y, ro: 0, r: 0 });
    for (const dx of [-9.5, 9.5]) objs.push({ m: null, x: G.x + dx, y: G.y, r: 3.4 });
    objs.push({ m: null, gateBar: true, x: G.x, y: G.y, r: F.gateOpen ? 0 : 5.5 });   // 关着的门洞也挡住
  }
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
}
function isWater(x, y) {
  const cx = Math.floor(x / CH), cy = Math.floor(y / CH), c = chunks.get(cx + ',' + cy);
  if (!c) return waterAt(x, y);
  return c.water[(Math.floor(y) - cy * CH) * CH + (Math.floor(x) - cx * CH)] === 1;
}
function blocked(x, y, rad) {
  if (mode === 'explore' && FLOOR && (!inFloor(x, y) || y < FLOOR.gate.y - 3)) return true;   // 石门那一排就是北边的头
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
// 看门的打倒了：石门换成开着的样子
function openGate() {
  FLOOR.gateOpen = true;
  for (const c of chunks.values()) for (const o of c.objs) { if (o.gate) o.m = MODELS.gate[1]; if (o.gateBar) o.r = 0; }
}
// 石碑用过 / 树洞摸过：换成暗的样子
function useSpot(s) {
  s.used = true;
  for (const c of chunks.values()) for (const o of c.objs) if (o.spot === s) {
    if (s.kind === 'rest') { o.m = dimOf(MODELS.stone); o.light = false; } else { o.m = MODELS.hollow[1]; o.glint = false; }
  }
}

// ---------- 鬼火（一团 = 一只怪），一开始就摆好，不再刷新 ----------
const WISP = { guard: 34, aggro: 64, chase: 9 };
const ELITE_COL = [255, 76, 60], GUARD_COL = [255, 120, 84];
let wisps = [];
function placeWisps(F) {
  const r = rngFrom(F.seed ^ 0x5bd1e995), out = [];
  const ok = (x, y, minDepth) => {
    if (!inFloor(x, y, 24) || Math.hypot(x - F.entry.x, y - F.entry.y) < 110 || Math.hypot(x - F.guardPos.x, y - F.guardPos.y) < 90) return false;
    if ((F.entry.y - y) / (F.entry.y - F.gate.y) < minDepth) return false;
    if (out.some(w => Math.hypot(w.x - x, w.y - y) < 95) || F.spots.some(s => Math.hypot(s.x - x, s.y - y) < 50)) return false;
    getChunk(Math.floor(x / CH), Math.floor(y / CH));
    return !waterAt(x, y) && !blocked(x, y, 6);
  };
  // 普通的先摆；精英（红鬼火）摆在后半段
  const total = F.def.wisps + F.def.elites, k0 = (r() * F.def.kinds.length) | 0;   // 几种怪轮着摆，一段里每种都碰得到
  for (let k = 0; k < 900 && out.length < total; k++) {
    const elite = out.length >= F.def.wisps, x = 30 + r() * (FLOOR_W - 60), y = 50 + r() * (FLOOR_W - 140);
    if (!ok(x, y, elite ? .45 : 0)) continue;
    const kind = F.def.kinds[(k0 + out.length) % F.def.kinds.length], depth = clamp((F.entry.y - y) / (F.entry.y - F.gate.y), 0, 1);
    const hp = F.def.normal * (1 + 3 * depth) * MONSTERS[kind].hpMul * (elite ? ELITE.hp : 1);
    out.push({ x, y, hx: x, hy: y, kind, elite, color: elite ? ELITE_COL : MONSTERS[kind].wisp, phase: r() * TAU, seen: false,
      spec: { kind, hp, elite } });
  }
  const g = F.guardPos, gs = F.def.guard;
  out.push({ x: g.x, y: g.y, hx: g.x, hy: g.y, kind: gs.kind, color: GUARD_COL, phase: 0, seen: true, guard: true,
    spec: { ...gs, guard: true } });
  wisps = out;
  return out;
}
function updateWisps(px, py, dt) {
  for (const w of wisps) {
    w.phase += dt;
    const d = Math.hypot(w.x - px, w.y - py);
    if (d < 92) w.seen = true;
    if (w.guard) { w.x = w.hx; w.y = w.hy + Math.sin(w.phase * .8) * 1.5; continue; }
    // 平时在原地附近飘；人走近了就慢慢凑过来
    let tx = w.hx + Math.sin(w.phase * .4) * 6, ty = w.hy + Math.cos(w.phase * .31) * 6, sp = 6;
    if (d < WISP.aggro && player.grace <= 0) { tx = px; ty = py; sp = WISP.chase; }
    const dx = tx - w.x, dy = ty - w.y, l = Math.hypot(dx, dy);
    if (l > .01) { const m = Math.min(l, sp * dt); w.x += dx / l * m; w.y += dy / l * m; }
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

// ---------- 小地图的迷雾：走过（照亮过）的地方才画出来 ----------
function exploreAround(F, x, y, rad) {
  const g = F.mm.getContext('2d'), c0 = Math.floor((x - rad) / MM_CELL), c1 = Math.floor((x + rad) / MM_CELL), r0 = Math.floor((y - rad) / MM_CELL), r1 = Math.floor((y + rad) / MM_CELL);
  for (let cy = Math.max(0, r0); cy <= Math.min(MM_N - 1, r1); cy++) for (let cx = Math.max(0, c0); cx <= Math.min(MM_N - 1, c1); cx++) {
    const i = cy * MM_N + cx; if (F.explored[i]) continue;
    const wx = (cx + .5) * MM_CELL, wy = (cy + .5) * MM_CELL;
    if (Math.hypot(wx - x, wy - y) > rad) continue;
    F.explored[i] = 1;
    const ed = edgeDist(wx, wy);
    g.fillStyle = ed < 0 ? '#0b0e10' : isWater(wx, wy) ? '#29465a' : (mainPath(wx, wy) || trailAt(wx, wy)) ? '#6a5c4a' : '#34443a';
    g.fillRect(cx, cy, 1, 1);
  }
}
