// 落果密林第 1~8 步纵深路线图生成（纯逻辑，可重放）。
// 结构：林缘 1~4 步 → 第 4 步末青苔界门 → 腹地 5~7 步（第 7 步必经营火）→ 第 8 步林地首领。
// 节点 type：battle 遭遇 / elite 强敌 / event 林中偶遇 / shop 行商营帐 / camp 营火整备 / boss 林地首领。
import { nextRand, shuffle } from '../shared/index.js';
import { EVENT_IDS } from '../content/index.js';

export const STEPS = 8;
export const GATE_AFTER = 4;
export const SEGMENTS = [
  { name: '林缘', from: 1, to: 4 },
  { name: '腹地', from: 5, to: 7 },
  { name: '巨木树冠', from: 8, to: 8 },
];
export const segmentOf = step => SEGMENTS.find(s => step >= s.from && step <= s.to);

// 每一步可能的节点组合（排好后会打乱顺序）
const TEMPLATES = {
  2: [['battle', 'battle', 'event'], ['battle', 'shop', 'event'], ['battle', 'battle', 'shop'], ['battle', 'event']],
  3: [['battle', 'camp', 'shop'], ['battle', 'camp', 'event'], ['battle', 'camp'], ['battle', 'battle', 'camp']],
  4: [['elite', 'battle'], ['elite', 'battle', 'event'], ['elite', 'battle', 'shop']],
  5: [['battle', 'battle', 'event'], ['battle', 'shop', 'event'], ['battle', 'battle', 'shop']],
  6: [['elite', 'battle', 'event'], ['elite', 'battle', 'shop'], ['elite', 'battle', 'battle']],
};
const ENC_POOL = {
  2: ['e_sheep', 'e_goblin', 'e_slime'],
  3: ['e_goblin', 'e_fairy', 'e_sheep'],
  4: ['e_fairy', 'e_goblin'],      // 第 4 步的稳妥路线
  5: ['e_gibbon', 'e_goblin', 'e_fairy'],
  6: ['e_gibbon', 'e_fairy', 'e_goblin'],
};
const LOOT_POOL = ['carve', 'carve', 'arcana', 'arcana', 'attr', 'heal', 'seal', 'seal'];

const pick = (r, arr) => arr[Math.floor(nextRand(r) * arr.length)];

// 相邻两步中间连线：不交叉，每个节点上下都有路。
function connect(a, b, r) {
  const E = [];
  const has = (i, j) => E.some(e => e[0] === i && e[1] === j);
  const crosses = (i, j) => E.some(e => (e[0] < i && e[1] > j) || (e[0] > i && e[1] < j));
  const add = (i, j) => { if (!has(i, j)) E.push([i, j]); };
  for (let i = 0; i < a; i++) add(i, a === 1 ? 0 : Math.round(i * (b - 1) / (a - 1)));
  for (let j = 0; j < b; j++) add(b === 1 ? 0 : Math.round(j * (a - 1) / (b - 1)), j);
  // 再随机加几条斜线（不跟已有的交叉）
  const n = Math.min(a, b);
  for (let i = 0; i < n - 1; i++) {
    if (nextRand(r) < 0.55) {
      const [x, y] = nextRand(r) < 0.5 ? [i, i + 1] : [i + 1, i];
      if (x < a && y < b && !crosses(x, y)) add(x, y);
    }
  }
  return E;
}

export function generateMap(seed) {
  const r = { rngState: ((seed >>> 0) * 2654435761 + 12345) >>> 0 };
  const layers = [];
  const nodes = {};
  const mk = (step, k, n, spec) => {
    const base = n === 1 ? [0.5] : n === 2 ? [0.32, 0.68] : [0.16, 0.5, 0.84];
    const id = `s${step}n${k}`;
    const node = { id, step, col: k, x: Math.max(0.1, Math.min(0.9, base[k] + (nextRand(r) - 0.5) * 0.06)), ...spec };
    nodes[id] = node;
    return node;
  };

  // 第 1 步：固定 2 个浅林入口
  layers.push([
    mk(1, 0, 2, { type: 'battle', enc: 'e_slime', loot: pick(r, ['carve', 'arcana']) }),
    mk(1, 1, 2, { type: 'battle', enc: 'e_sheep', loot: pick(r, ['arcana', 'attr']) }),
  ]);
  for (let step = 2; step <= 6; step++) {
    const types = shuffle([...pick(r, TEMPLATES[step])], r);
    const encs = shuffle([...ENC_POOL[step]], r);
    let firstBattle = true;
    const layer = types.map((type, k) => {
      const spec = { type };
      if (type === 'elite') { spec.enc = step === 4 ? 'e_leopard' : 'e_sloth'; spec.loot = 'hand'; }
      else if (type === 'battle') {
        spec.enc = encs.shift();
        if (step === 5 && firstBattle) { spec.enc = 'e_gibbon'; spec.must = true; }   // 5~6 步里一定碰到长臂猿
        spec.loot = pick(r, LOOT_POOL);
        firstBattle = false;
      }
      return mk(step, k, types.length, spec);
    });
    layers.push(layer);
  }
  // 补一遍：第 2~6 步至少有 1 个行商营帐、1 个林中偶遇；腹地至少 2 个秘宝印记战利品
  const all = layers.slice(1, 6).flat();
  const swap = (type) => {
    // 只换掉那些同一步里还有别的战斗可走的普通战斗节点
    const fights = step => layers[step - 1].filter(n => n.type === 'battle' || n.type === 'elite').length;
    const cand = all.filter(n => n.type === 'battle' && (n.step === 2 || n.step === 3 || n.step === 5) && fights(n.step) >= 2 && !n.must);
    if (!cand.length) return;
    const n = pick(r, cand);
    n.type = type; delete n.enc; delete n.loot;
  };
  if (!all.some(n => n.type === 'shop')) swap('shop');
  if (!all.some(n => n.type === 'event')) swap('event');
  const seals = all.filter(n => n.type === 'battle' && n.loot === 'seal');
  const rest = all.filter(n => n.type === 'battle' && n.step >= 3 && n.loot !== 'seal');
  while (seals.length < 2 && rest.length) { const n = rest.splice(Math.floor(nextRand(r) * rest.length), 1)[0]; n.loot = 'seal'; seals.push(n); }
  // 林中偶遇：每个节点一个互不相同的偶遇（地图上只显示问号）
  for (const n of Object.values(nodes)) delete n.must;
  const evs = shuffle([...EVENT_IDS], r);
  all.filter(n => n.type === 'event').forEach((n, i) => { n.eventId = evs[i % evs.length]; });

  // 第 7 步：必经营火整备；第 8 步：林地首领
  layers.push([mk(7, 0, 1, { type: 'camp' })]);
  layers.push([mk(8, 0, 1, { type: 'boss', enc: 'e_boss' })]);

  const edges = [];
  for (let s = 0; s < layers.length - 1; s++) {
    for (const [i, j] of connect(layers[s].length, layers[s + 1].length, r)) {
      edges.push({ from: layers[s][i].id, to: layers[s + 1][j].id });
    }
  }
  return { seed, layers: layers.map(l => l.map(n => n.id)), nodes, edges };
}

export const childrenOf = (map, id) => map.edges.filter(e => e.from === id).map(e => e.to);
export const parentsOf = (map, id) => map.edges.filter(e => e.to === id).map(e => e.from);

// 从某个节点往后能走到的所有节点（含自己）
export function reachableFrom(map, id) {
  const seen = new Set([id]); const q = [id];
  while (q.length) for (const c of childrenOf(map, q.shift())) if (!seen.has(c)) { seen.add(c); q.push(c); }
  return seen;
}
// 能走到某个节点的所有节点（含自己）
export function ancestorsOf(map, id) {
  const seen = new Set([id]); const q = [id];
  while (q.length) for (const p of parentsOf(map, q.shift())) if (!seen.has(p)) { seen.add(p); q.push(p); }
  return seen;
}
