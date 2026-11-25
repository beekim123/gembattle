// 地面合成器：「无缝大 Tilemap 底纹」加「唯一场景地标」。纯数学加像素缓冲，不碰画布，node 里能直接测。
//
// 为什么不用 UI-04 的 384 小砖直接平铺：那张砖里带断头路、重复炭坑、双石路，平铺开来一屏里冒出好几个一模一样的地标。
// 这里拆成两层：
//   1. 底层：每个生态 6 种纯底纹小砖（16×16 美术像素，只有草、碎叶、苔、泥、树皮、石面这类细节，绝不含路和任何地标），
//      按世界网格确定性地拼成一个 36×36 块、576×576 像素的区块（1.27 MB）。拼法：多层周期噪声决定每处用哪一种，
//      所以成片成丛、自然过渡；相邻的底纹是弯曲的抖点渐变，没有笔直的砖缝。区块首尾相接无缝，随镜头角旋转压扁铺满画布。
//   2. 地标层：世界坐标里只画 1 份、不循环、不平铺。战区中央一片林间空地 / 泥滩 / 苔石广场 / 枝干交汇平台，
//      营地一个火塘，界门一条穿门的青石古道，行商一条林间土路。同样随镜头角旋转。
// 同一个生态每次拼出来一模一样（种子来自生态 id），没有任何 Math.random。
import { rng } from './env-ground.js';

export const TILE = 16;                    // 一块小砖：16×16 美术像素
export const GRID = 36;                    // 区块边长（块数）；36 = 12 × 3 = 6 × 6，噪声格距都能整除，首尾才能无缝
export const BLOCK = TILE * GRID;          // 576 像素
export const BLOCK_MB = BLOCK * BLOCK * 4 / 1048576;
export const VARIANT_KINDS = 6;            // 每个生态 6 种：5 种底纹 + 1 种稀有点缀
export const FLAVORS = 4;                  // 每种底纹再有 4 份撒点不同的小砖，免得同一种看着一模一样

// ---------- 小工具 ----------
const hexRGB = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mixRGB = (a, b, k) => a.map((v, i) => Math.round(v + (b[i] - v) * k));
const BLACK = [0, 0, 0], WHITE = [255, 255, 255];
// 打包成画布像素格式（小端字节序：红在最低位，透明度在最高位）
const pack = (rgb, a = 255) => ((a << 24) | (rgb[2] << 16) | (rgb[1] << 8) | rgb[0]) >>> 0;
const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
// 整数坐标哈希 → [0, 1)
function hash2(x, y, seed) {
  let n = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
const smooth = t => t * t * (3 - 2 * t);
// 周期值噪声：格距 s（以格为单位），整个区块 GRID 格正好绕一圈，所以首尾相接。返回 [0, 1)
function wrapNoise(cx, cy, s, seed) {
  const n = GRID / s, gx = cx / s, gy = cy / s;
  const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = smooth(gx - x0), fy = smooth(gy - y0);
  const at = (i, j) => hash2(((i % n) + n) % n, ((j % n) + n) % n, seed);
  const a = at(x0, y0), b = at(x0 + 1, y0), c = at(x0, y0 + 1), d = at(x0 + 1, y0 + 1);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
// 不循环的值噪声（地标用）：格距 s（像素）
function vnoise(x, y, s, seed) {
  const gx = x / s, gy = y / s, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = smooth(gx - x0), fy = smooth(gy - y0);
  const a = hash2(x0, y0, seed), b = hash2(x0 + 1, y0, seed), c = hash2(x0, y0 + 1, seed), d = hash2(x0 + 1, y0 + 1, seed);
  return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fy;
}
// 4×4 有序抖点矩阵，值域 [0, 1)
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
const bayer = (x, y) => BAYER[((y >> 1) & 3) * 4 + ((x >> 1) & 3)];     // 按 2×2 一组抖，点更粗，像素味更足

// ---------- 色板：从生态色板里取 ----------
export function paletteOf(b) {
  const top = hexRGB(b.groundTop), bot = hexRGB(b.groundBottom), base = mixRGB(top, bot, 0.5);
  return {
    base, dark: mixRGB(base, BLACK, 0.26), deep: mixRGB(base, BLACK, 0.44), light: mixRGB(base, WHITE, 0.13), hi: mixRGB(base, WHITE, 0.26),
    patch: hexRGB(b.patch), leaf: b.leaf.map(hexRGB), fruit: hexRGB(b.fruit), bottom: bot,
    moss: b.moss ? hexRGB(b.moss) : mixRGB(base, [84, 150, 70], 0.55), water: b.water ? hexRGB(b.water) : mixRGB(base, [60, 110, 120], 0.6),
    earth: mixRGB(bot, [118, 88, 54], 0.62), stone: mixRGB(base, [112, 122, 120], 0.4),
  };
}

// ---------- 小砖：16×16，一格一个 Uint32 ----------
const newTile = c => new Uint32Array(TILE * TILE).fill(pack(c));
const put = (t, x, y, c) => { if (x >= 0 && x < TILE && y >= 0 && y < TILE) t[y * TILE + x] = pack(c); };
// 往小砖上撒 n 个单点
function sprinkle(t, r, c, n) { for (let i = 0; i < n; i++) put(t, (r() * TILE) | 0, (r() * TILE) | 0, c); }
// 一小簇草叶：竖着 2 格
function blade(t, x, y, c) { put(t, x, y, c); put(t, x, y + 1, c); }
// 一片小叶：横 2 格加下面 1 格的暗边
function leafPx(t, x, y, c) { put(t, x, y, c); put(t, x + 1, y, c); put(t, x + 1, y + 1, mixRGB(c, BLACK, 0.32)); }
// 随机游走的细裂纹
function crack(t, r, c, hi) {
  let x = (r() * 12 | 0) + 2, y = (r() * 12 | 0) + 2;
  for (let i = 0, n = 6 + (r() * 5 | 0); i < n; i++) {
    put(t, x, y, c); if (hi) put(t, x, y + 1, hi);
    const d = r(); x += d < 0.4 ? 1 : d < 0.7 ? -1 : 0; y += d > 0.5 ? 1 : 0;
  }
}

// 6 种底纹的配方。每个函数 (色板, 随机源) → 一块小砖。顺序有意义：0 最暗、1 平常、…… 由 pick 按噪声值选。
const K = {
  plain: (p, r) => { const t = newTile(p.base); sprinkle(t, r, p.light, 9); sprinkle(t, r, p.dark, 8); return t; },
  tufts: (p, r) => {
    const t = newTile(p.base);
    for (let i = 0; i < 4; i++) { const x = (r() * 13 | 0) + 1, y = (r() * 11 | 0) + 2; blade(t, x, y, p.hi); blade(t, x + 2, y + 1, p.light); blade(t, x - 1, y + 2, p.dark); }
    sprinkle(t, r, p.dark, 5); return t;
  },
  dark: (p, r) => { const t = newTile(mixRGB(p.base, p.deep, 0.36)); sprinkle(t, r, p.deep, 11); sprinkle(t, r, p.dark, 9); sprinkle(t, r, p.base, 6); return t; },
  litter: (p, r) => {
    const t = newTile(p.base);
    for (let i = 0; i < 3; i++) leafPx(t, (r() * 14 | 0), (r() * 14 | 0), p.leaf[(r() * p.leaf.length) | 0]);
    sprinkle(t, r, p.dark, 6); return t;
  },
  lush: (p, r) => {
    const t = newTile(mixRGB(p.base, p.patch, 0.6)); sprinkle(t, r, p.light, 12);
    for (let i = 0; i < 2; i++) blade(t, (r() * 15 | 0), (r() * 13 | 0) + 1, p.hi);
    return t;
  },
  // 稀有那一种：每个生态各有各的小点缀，只在噪声最高处才偶尔出现一块
  stone: (p, r) => { const t = newTile(p.stone); sprinkle(t, r, mixRGB(p.stone, WHITE, 0.14), 10); sprinkle(t, r, mixRGB(p.stone, BLACK, 0.22), 10); return t; },
  cracked: (p, r) => { const t = newTile(p.stone); sprinkle(t, r, mixRGB(p.stone, BLACK, 0.18), 8); crack(t, r, mixRGB(p.stone, BLACK, 0.5), mixRGB(p.stone, WHITE, 0.12)); return t; },
  mossy: (p, r) => {
    const t = newTile(mixRGB(p.stone, p.moss, 0.25));
    for (let i = 0; i < 3; i++) { const x = (r() * 12 | 0) + 1, y = (r() * 13 | 0) + 1, c = mixRGB(p.moss, WHITE, r() * 0.16); put(t, x, y, c); put(t, x + 1, y, c); put(t, x + 2, y, c); put(t, x + 1, y + 1, mixRGB(c, BLACK, 0.2)); put(t, x, y - 1, c); }
    sprinkle(t, r, mixRGB(p.stone, BLACK, 0.2), 6); return t;
  },
  grassy: (p, r) => {
    const t = newTile(mixRGB(p.stone, p.moss, 0.12));
    for (let i = 0; i < 3; i++) { const x = (r() * 14 | 0) + 1, y = (r() * 12 | 0) + 2; blade(t, x, y, p.moss); blade(t, x + 1, y + 1, mixRGB(p.moss, WHITE, 0.2)); }
    sprinkle(t, r, mixRGB(p.stone, BLACK, 0.2), 6); return t;
  },
  rubble: (p, r) => {
    const t = newTile(mixRGB(p.stone, BLACK, 0.06));
    for (let i = 0; i < 3; i++) { const x = (r() * 13 | 0) + 1, y = (r() * 12 | 0) + 1, c = mixRGB(p.stone, WHITE, 0.18 + r() * 0.1); put(t, x, y, c); put(t, x + 1, y, c); put(t, x, y + 1, mixRGB(c, BLACK, 0.3)); put(t, x + 1, y + 1, mixRGB(c, BLACK, 0.4)); }
    sprinkle(t, r, mixRGB(p.stone, BLACK, 0.25), 8); return t;
  },
  barkMoss: (p, r) => {
    const t = newTile(mixRGB(p.base, p.moss, 0.22));
    for (let y = 2; y < TILE; y += 4) { const x0 = (r() * 5 | 0), len = 5 + (r() * 8 | 0); for (let x = x0; x < Math.min(TILE, x0 + len); x++) put(t, x, y, p.dark); }
    for (let i = 0; i < 3; i++) { const x = (r() * 12 | 0) + 1, y = (r() * 13 | 0) + 1, c = mixRGB(p.moss, WHITE, r() * 0.15); put(t, x, y, c); put(t, x + 1, y, c); put(t, x + 2, y, c); put(t, x + 1, y + 1, mixRGB(c, BLACK, 0.2)); }
    return t;
  },
  mud: (p, r) => { const m = mixRGB(p.base, [64, 52, 34], 0.45); const t = newTile(m); sprinkle(t, r, mixRGB(m, BLACK, 0.3), 12); sprinkle(t, r, mixRGB(m, WHITE, 0.1), 7); return t; },
  wetmoss: (p, r) => {
    const t = newTile(mixRGB(p.base, p.moss, 0.4)); sprinkle(t, r, mixRGB(p.moss, WHITE, 0.18), 10); sprinkle(t, r, p.deep, 8);
    put(t, (r() * 14 | 0) + 1, (r() * 14 | 0) + 1, mixRGB(p.water, WHITE, 0.3)); return t;
  },
  reeds: (p, r) => {
    const t = newTile(mixRGB(p.base, BLACK, 0.1));
    for (let i = 0; i < 4; i++) { const x = (r() * 14 | 0) + 1, y = (r() * 8 | 0) + 4, c = p.leaf[(r() * p.leaf.length) | 0]; for (let j = 0; j < 4; j++) put(t, x + (j > 2 ? 1 : 0), y + j - 2, mixRGB(c, BLACK, j * 0.1)); }
    sprinkle(t, r, p.deep, 6); return t;
  },
  bark: (p, r) => {
    const t = newTile(p.base);
    for (let y = 1; y < TILE; y += 3 + (r() * 2 | 0)) { const x0 = (r() * 6 | 0), len = 6 + (r() * 9 | 0); for (let x = x0; x < Math.min(TILE, x0 + len); x++) put(t, x, y, p.dark); }
    sprinkle(t, r, p.light, 7); return t;
  },
  bark2: (p, r) => {
    const t = newTile(mixRGB(p.base, p.dark, 0.35));
    for (let x = 1; x < TILE; x += 3 + (r() * 2 | 0)) { const y0 = (r() * 6 | 0), len = 5 + (r() * 9 | 0); for (let y = y0; y < Math.min(TILE, y0 + len); y++) put(t, x, y, p.deep); }
    sprinkle(t, r, p.light, 6); return t;
  },
  lichen: (p, r) => {
    const t = newTile(p.base), c = mixRGB(p.moss, [210, 220, 170], 0.35);
    for (let i = 0; i < 5; i++) { const x = (r() * 14 | 0) + 1, y = (r() * 14 | 0) + 1; put(t, x, y, c); put(t, x + 1, y, mixRGB(c, BLACK, 0.2)); }
    sprinkle(t, r, p.dark, 6); return t;
  },
  earth: (p, r) => {
    const t = newTile(p.earth); sprinkle(t, r, mixRGB(p.earth, BLACK, 0.2), 10); sprinkle(t, r, mixRGB(p.earth, WHITE, 0.12), 8);
    for (let i = 0; i < 2; i++) { const x = (r() * 13 | 0) + 1, y = (r() * 13 | 0) + 1, c = mixRGB(p.stone, WHITE, 0.1); put(t, x, y, c); put(t, x + 1, y, mixRGB(c, BLACK, 0.25)); }
    return t;
  },
};

// 稀有点缀：透明小砖，只画几个点或一小团，叠在它下面那一档底纹上（所以不会冒出一块块方框）
const D = {
  fruit: (p, r) => { const t = new Uint32Array(TILE * TILE); const x = (r() * 12 | 0) + 2, y = (r() * 12 | 0) + 3; put(t, x, y, p.fruit); put(t, x + 1, y, p.fruit); put(t, x, y + 1, mixRGB(p.fruit, BLACK, 0.35)); put(t, x + 1, y + 1, mixRGB(p.fruit, BLACK, 0.35)); put(t, x, y - 1, mixRGB(p.fruit, WHITE, 0.4)); return t; },
  flower: (p, r) => {
    const t = new Uint32Array(TILE * TILE);
    for (let i = 0; i < 2; i++) { const c = p.leaf[(r() * p.leaf.length) | 0], x = (r() * 11 | 0) + 2, y = (r() * 11 | 0) + 2, d = mixRGB(c, BLACK, 0.2); put(t, x, y - 1, c); put(t, x - 1, y, d); put(t, x + 1, y, d); put(t, x, y + 1, d); put(t, x, y, [255, 236, 150]); }
    return t;
  },
  puddle: (p, r) => {
    const t = new Uint32Array(TILE * TILE), w = mixRGB(p.water, BLACK, 0.12);
    for (let y = 3; y < 13; y++) for (let x = 2; x < 14; x++) if (((x - 8) * (x - 8)) / 36 + ((y - 8) * (y - 8)) / 25 < 1) put(t, x, y, w);
    put(t, 5 + (r() * 3 | 0), 6, mixRGB(p.water, WHITE, 0.45)); put(t, 6 + (r() * 3 | 0), 7, mixRGB(p.water, WHITE, 0.3)); return t;
  },
  sprout: (p, r) => {
    const t = new Uint32Array(TILE * TILE), x = (r() * 11 | 0) + 2, y = (r() * 9 | 0) + 4, c = p.leaf[(r() * p.leaf.length) | 0];
    blade(t, x, y + 1, p.moss); blade(t, x + 1, y + 2, mixRGB(p.moss, WHITE, 0.2)); put(t, x, y, c); put(t, x + 1, y, c); put(t, x, y - 1, [255, 236, 150]); return t;
  },
  knot: (p, r) => {
    const t = new Uint32Array(TILE * TILE), cx = 5 + (r() * 6 | 0), cy = 5 + (r() * 6 | 0);
    for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) { const d = Math.hypot(x - cx, (y - cy) * 1.3); if (Math.abs(d - 4) < 0.6 || Math.abs(d - 2) < 0.5) put(t, x, y, p.deep); else if (d < 1.2) put(t, x, y, p.dark); }
    return t;
  },
  pebbles: (p, r) => {
    const t = new Uint32Array(TILE * TILE);
    for (let i = 0; i < 3; i++) { const x = (r() * 13 | 0) + 1, y = (r() * 13 | 0) + 1, c = mixRGB(p.stone, WHITE, 0.08 + r() * 0.14); put(t, x, y, c); put(t, x + 1, y, c); put(t, x, y + 1, mixRGB(c, BLACK, 0.35)); }
    return t;
  },
};

// 每个生态：5 种底纹加 1 种稀有点缀，共 6 种。底纹按「噪声从低到高」排：最低那档是低洼处的大片（暗草、泥、泥土、石面），
// 中间几档是渐变的带，最高一档是高处的大片。cuts 是 4 个累积面积占比（5 档），比如 [0.2, 0.44, …] 表示最低档占 20%、第二档占 24%。decal 只在 rare 比例的格子上叠。
// 顺序有讲究：颜色反差大的底纹（泥土、石面）放最低档，才会长成一滩一滩，不会拉成弯弯绕绕的细带（像断头路）。
const FAMILIES = {
  forest: { kinds: ['dark', 'plain', 'tufts', 'litter', 'lush'], cuts: [0.2, 0.44, 0.64, 0.82], decal: 'fruit', rare: 0.02 },
  meadow: { kinds: ['dark', 'plain', 'tufts', 'lush', 'litter'], cuts: [0.18, 0.4, 0.62, 0.8], decal: 'flower', rare: 0.08 },
  swamp: { kinds: ['mud', 'dark', 'wetmoss', 'reeds', 'plain'], cuts: [0.2, 0.42, 0.62, 0.8], decal: 'puddle', rare: 0.012 },
  ruins: { kinds: ['stone', 'cracked', 'mossy', 'grassy', 'rubble'], cuts: [0.2, 0.44, 0.64, 0.82], decal: 'sprout', rare: 0.03 },
  canopy: { kinds: ['bark', 'bark2', 'lichen', 'litter', 'barkMoss'], cuts: [0.22, 0.44, 0.64, 0.82], decal: 'knot', rare: 0.025 },
  camp: { kinds: ['earth', 'dark', 'plain', 'tufts', 'litter'], cuts: [0.15, 0.32, 0.56, 0.8], decal: 'pebbles', rare: 0.025 },
  trade: { kinds: ['earth', 'dark', 'plain', 'tufts', 'litter'], cuts: [0.14, 0.3, 0.56, 0.8], decal: 'pebbles', rare: 0.03 },
  gate: { kinds: ['stone', 'cracked', 'mossy', 'grassy', 'rubble'], cuts: [0.2, 0.44, 0.64, 0.82], decal: 'sprout', rare: 0.03 },
};
export const familyOf = id => FAMILIES[id] || FAMILIES.forest;

// ---------- 底层：一个区块的像素 ----------
// 选底纹分两步：先在每 4 个像素一个样本的细网格上算出「哪一档」的噪声场（三层周期噪声：格距 12、6、3 块），
// 再按像素双线性放大、叠一点抖点，所以不同底纹相邻的分界是弯弯曲曲、点状渐变的，不是贴着砖格的方块。
// 每个像素的颜色取自「它所属那一格」的那份小砖，所以小砖的撒点图案还是 16 像素一个循环的真 Tilemap 纹理。
const FS = 4, FN = BLOCK / FS;
// 返回 { data: Uint32Array(BLOCK × BLOCK), tileCount, size, kindShare: 每种底纹占的比例 }
export function buildBlockPixels(biome) {
  const fam = familyOf(biome.id), pal = paletteOf(biome), seed = hashStr(biome.id);
  // 6 种 × 4 份小砖：同一种底纹的 4 份撒点不一样
  const tiles = fam.kinds.map((name, k) => Array.from({ length: FLAVORS }, (_, f) => K[name](pal, rng(seed + k * 131 + f * 17))));
  const decals = Array.from({ length: FLAVORS }, (_, f) => D[fam.decal](pal, rng(seed + 977 + f * 29)));
  // 噪声场
  const field = new Float32Array(FN * FN);
  for (let j = 0; j < FN; j++) {
    for (let i = 0; i < FN; i++) {
      const cx = (i * FS) / TILE, cy = (j * FS) / TILE;
      const n = 0.5 * wrapNoise(cx, cy, 12, seed) + 0.3 * wrapNoise(cx, cy, 6, seed + 1) + 0.2 * wrapNoise(cx, cy, 3, seed + 2);
      field[j * FN + i] = Math.max(0, Math.min(1, (n - 0.5) * 2.4 + 0.5));       // 拉伸到 [0, 1]
    }
  }
  // 切点按面积占比（累积）折成噪声值：每个生态每一档占的地方大小是定下来的，不看噪声种子的运气
  const sorted = Float32Array.from(field).sort();
  const thr = fam.cuts.map(c => sorted[Math.min(sorted.length - 1, Math.floor(c * sorted.length))]);
  // 每格：用哪份小砖、是不是稀有点缀（独立撒，不看噪声）
  const flav = new Uint8Array(GRID * GRID), rare = new Uint8Array(GRID * GRID);
  for (let cy = 0; cy < GRID; cy++) for (let cx = 0; cx < GRID; cx++) {
    flav[cy * GRID + cx] = (hash2(cx, cy, seed + 5) * FLAVORS) | 0;
    rare[cy * GRID + cx] = hash2(cx, cy, seed + 4) < fam.rare ? 1 : 0;
  }
  const data = new Uint32Array(BLOCK * BLOCK), share = new Array(fam.kinds.length).fill(0);
  const cuts = thr, nc = cuts.length;
  for (let y = 0; y < BLOCK; y++) {
    const cy = y >> 4, ly = y & 15, fy = y / FS, j0 = fy | 0, j1 = (j0 + 1) % FN, ty = fy - j0;
    for (let x = 0; x < BLOCK; x++) {
      const cx = x >> 4, lx = x & 15, ci = cy * GRID + cx;
      const fx = x / FS, i0 = fx | 0, i1 = (i0 + 1) % FN, tx = fx - i0;
      const top = field[j0 * FN + i0] + (field[j0 * FN + i1] - field[j0 * FN + i0]) * tx;
      const bot = field[j1 * FN + i0] + (field[j1 * FN + i1] - field[j1 * FN + i0]) * tx;
      const n = top + (bot - top) * ty + (bayer(x, y) - 0.5) * 0.075;
      let k = 0; while (k < nc && n >= cuts[k]) k++;
      share[k]++;
      let c = tiles[k][flav[ci]][ly * TILE + lx];
      if (rare[ci]) { const d = decals[flav[ci]][ly * TILE + lx]; if (d) c = d; }
      data[y * BLOCK + x] = c;
    }
  }
  return { data, tileCount: (fam.kinds.length + 1) * FLAVORS, size: BLOCK, kindShare: share.map(v => v / (BLOCK * BLOCK)) };
}

// ---------- 地标：世界里只画 1 份 ----------
// at：地标中心在世界地面的位置 [wx, wy]（世界原点就是各画面的「兴趣中心」：战斗在怪和主角中间，营地在火堆脚下，标题和偶遇在主角脚下）
// w、h：地标画布的像素大小；kind：画法
export const LANDMARKS = {
  forest: { kind: 'clearing', at: [0, 0], w: 400, h: 300, name: '林间空地' },
  meadow: { kind: 'meadowClearing', at: [0, 0], w: 400, h: 300, name: '踩倒的草地' },
  swamp: { kind: 'mudflat', at: [0, 0], w: 400, h: 290, name: '泥滩' },
  ruins: { kind: 'plaza', at: [0, 0], w: 400, h: 290, name: '苔石广场' },
  canopy: { kind: 'junction', at: [0, 0], w: 420, h: 300, name: '枝干交汇平台' },
  camp: { kind: 'firepit', at: [0, 0], w: 300, h: 290, name: '火塘' },
  gate: { kind: 'stoneRoad', at: [0, 0], w: 150, h: 520, name: '青石古道' },
  trade: { kind: 'dirtRoad', at: [0, 3], w: 800, h: 100, name: '林间土路' },
};
export const landmarkOf = id => LANDMARKS[id] || LANDMARKS.forest;

// 不规则外形：角度上叠 3 道正弦扰动，再按 rx、ry 拉成椭圆。返回「里面多深」f：0 在边上，1 在正中，负数在外面
function blobDepth(dx, dy, rx, ry, ph) {
  const ux = dx / rx, uy = dy / ry, d = Math.sqrt(ux * ux + uy * uy);
  if (d >= 1.33) return -1;                                   // 外形半径最大 1 + 0.15 + 0.1 + 0.07 = 1.32，再远的一定在外面，省掉三角函数
  const a = Math.atan2(uy, ux);
  const rr = 1 + 0.15 * Math.sin(2 * a + ph[0]) + 0.1 * Math.sin(3 * a + ph[1]) + 0.07 * Math.sin(5 * a + ph[2]);
  return 1 - d / rr;
}
// 把一个「里面多深」的场按抖点写进像素：边上破碎地渐隐，最外一圈压暗成踩实的边
function stamp(buf, w, h, depthAt, colorAt, soft = 0.16) {
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const f = depthAt(x, y);
      if (f <= 0) continue;
      const cov = Math.min(1, f / soft);
      if (cov < 1 && bayer(x, y) >= cov) continue;
      let c = colorAt(x, y, f);
      if (f < soft * 0.5) c = mixRGB(c, BLACK, 0.22);
      buf[y * w + x] = pack(c);
    }
  }
}

// 每种地标的画法：返回像素缓冲 { data, w, h }
const PAINTERS = {
  clearing(p, w, h, seed) {
    const buf = new Uint32Array(w * h), ph = [seed % 7, seed % 5 + 1, seed % 3 + 2];
    const soil = p.earth, rx = w * 0.45, ry = h * 0.43;
    stamp(buf, w, h, (x, y) => blobDepth(x - w / 2, y - h / 2, rx, ry, ph), (x, y, f) => {
      const a = vnoise(x, y, 9, seed), q = hash2(x, y, seed + 7);
      let c = a > 0.66 ? mixRGB(soil, WHITE, 0.06) : a < 0.32 ? mixRGB(soil, BLACK, 0.08) : soil;
      if (q < 0.03) c = mixRGB(p.stone, WHITE, 0.1); else if (q < 0.075) c = mixRGB(soil, BLACK, 0.2);
      else if (q < 0.082) c = p.leaf[(hash2(x >> 1, y, seed + 9) * p.leaf.length) | 0];
      if (f < 0.3 && q > 0.9) c = q > 0.95 ? p.hi : p.light;              // 边缘冒出几簇草
      return c;
    });
    return buf;
  },
  meadowClearing(p, w, h, seed) {
    const buf = new Uint32Array(w * h), ph = [seed % 6, seed % 4 + 1, seed % 5 + 2];
    const straw = mixRGB(p.base, [224, 212, 138], 0.42), rx = w * 0.45, ry = h * 0.43;
    stamp(buf, w, h, (x, y) => blobDepth(x - w / 2, y - h / 2, rx, ry, ph), (x, y) => {
      const a = vnoise(x, y, 8, seed), q = hash2(x, y, seed + 7);
      let c = a > 0.62 ? mixRGB(straw, WHITE, 0.07) : a < 0.32 ? mixRGB(straw, BLACK, 0.07) : straw;
      if (((x >> 2) + (y >> 0) * 3) % 11 === 0 && q > 0.4) c = mixRGB(straw, WHITE, 0.24);   // 横倒的草茎
      if (q < 0.012) c = p.leaf[(hash2(x, y, seed + 9) * p.leaf.length) | 0];                  // 稀稀拉拉几片花瓣
      return c;
    });
    return buf;
  },
  mudflat(p, w, h, seed) {
    const buf = new Uint32Array(w * h), ph = [seed % 5, seed % 7 + 1, seed % 4 + 2];
    const mud = mixRGB(p.bottom, [60, 50, 34], 0.55), rx = w * 0.45, ry = h * 0.43;
    stamp(buf, w, h, (x, y) => blobDepth(x - w / 2, y - h / 2, rx, ry, ph), (x, y, f) => {
      const a = vnoise(x, y, 11, seed), q = hash2(x, y, seed + 7), pool = vnoise(x, y, 24, seed + 4);
      let c = a > 0.64 ? mixRGB(mud, WHITE, 0.06) : a < 0.3 ? mixRGB(mud, BLACK, 0.1) : mud;
      if (pool > 0.72 && f > 0.25) { c = mixRGB(p.water, BLACK, 0.1); if (q < 0.06) c = mixRGB(p.water, WHITE, 0.4); }     // 小水洼
      else if (q < 0.03) c = mixRGB(mud, WHITE, 0.16);
      else if (f < 0.3 && q > 0.93) c = mixRGB(p.leaf[0], BLACK, 0.35);                                                 // 边上的苇叶
      return c;
    });
    return buf;
  },
  plaza(p, w, h, seed) {
    const buf = new Uint32Array(w * h), ph = [seed % 6, seed % 5 + 1, seed % 3 + 2];
    const rx = w * 0.45, ry = h * 0.43, SH = 26, CW = 44;
    stamp(buf, w, h, (x, y) => blobDepth(x - w / 2, y - h / 2, rx, ry, ph), (x, y, f) => {
      const row = (y / SH) | 0, off = (row % 2) * 22 + ((hash2(row, 0, seed) * 14) | 0), col = Math.floor((x + off) / CW);
      const lx = (x + off) - col * CW, ly = y - row * SH, sh = hash2(col, row, seed + 2);
      const gap = lx === 0 || ly === 0;
      const tone = sh < 0.3 ? -0.06 : sh > 0.7 ? 0.07 : 0;
      const stone = tone === 0 ? p.stone : mixRGB(p.stone, tone > 0 ? WHITE : BLACK, Math.abs(tone));
      let c = gap ? mixRGB(p.stone, BLACK, 0.42) : (ly === 1 || lx === 1) ? mixRGB(stone, WHITE, 0.1) : stone;
      if (!gap && hash2(x, y, seed + 6) < 0.045) c = mixRGB(c, BLACK, 0.12);
      if (sh > 0.9 && !gap) c = mixRGB(p.earth, p.moss, 0.35);                                           // 缺了一块，露出带苔的土
      else if (sh > 0.78 && !gap && ly > 3 && ly < 22 && lx === 12 + (sh * 9 | 0) + ((ly >> 2) & 1) * 2) c = mixRGB(p.stone, BLACK, 0.5);   // 短折裂缝
      const m = vnoise(x, y, 12, seed + 3);
      if (m > 0.72 + f * 0.2 || (gap && m > 0.6)) c = mixRGB(c, p.moss, 0.5);                            // 苔只爬在边和缝上
      return c;
    });
    return buf;
  },
  // 枝干交汇：一根粗枝从左往右横过，一根分叉从中间往右上岔出，再有一截断枝朝左下。取三者里最深的，两头是钝的
  junction(p, w, h, seed) {
    const buf = new Uint32Array(w * h), ph = [seed % 4, seed % 6 + 1, seed % 5 + 2];
    const limbs = [[-0.08, w * 0.47, h * 0.2], [-0.62, w * 0.31, h * 0.12], [0.85, w * 0.2, h * 0.11]];
    const dx0 = [0, w * 0.12, -w * 0.18], dy0 = [0, -h * 0.02, h * 0.06];
    const L = limbs.length, cs = limbs.map(l => Math.cos(l[0])), sn = limbs.map(l => Math.sin(l[0])), rxs = limbs.map(l => l[1]), rys = limbs.map(l => l[2]);   // 三角函数只算一次
    const depth = (x, y) => {
      let best = -1;
      for (let i = 0; i < L; i++) {
        const c = cs[i], s = sn[i], dx = x - w / 2 - dx0[i], dy = y - h / 2 - dy0[i];
        const u = dx * c + dy * s, v = -dx * s + dy * c, au = Math.abs(u / rxs[i]), av = Math.abs(v / rys[i]);
        const d = Math.cbrt(au * au * au + av * av * av);                       // 钝头的超椭圆
        if (d >= 1.1) continue;                                                // 边缘起伏最多 ±10%，再远的深度一定 ≤ 0
        best = Math.max(best, 1 - d / (1 + 0.1 * Math.sin(3 * Math.atan2(v / rys[i], u / rxs[i]) + ph[0])));
      }
      return best;
    };
    const bark = mixRGB(p.bottom, [98, 68, 42], 0.5);
    stamp(buf, w, h, depth, (x, y) => {
      const q = hash2(x, y, seed + 7);
      const grain = ((x * 3 + ((hash2(0, (y / 9) | 0, seed) * 9) | 0)) % 7 === 0);
      let c = grain ? mixRGB(bark, BLACK, 0.16) : bark;
      if (hash2(x >> 1, (y / 5) | 0, seed + 1) > 0.86) c = mixRGB(c, WHITE, 0.06);
      if (q < 0.025) c = mixRGB(c, BLACK, 0.18); else if (q < 0.04) c = mixRGB(p.moss, BLACK, 0.25);
      for (const [kx, ky] of [[w * 0.4, h * 0.5], [w * 0.7, h * 0.4]]) {              // 两个树疖：同心环
        const d = Math.hypot(x - kx, (y - ky) * 1.3);
        if (Math.abs(d - 7) < 0.7 || Math.abs(d - 3.5) < 0.6) c = mixRGB(bark, BLACK, 0.38); else if (d < 1.5) c = mixRGB(bark, BLACK, 0.5);
      }
      return c;
    }, 0.14);
    return buf;
  },
  // 火塘：中间一圈炭黑，外面一圈垒石，再外面是踩实的土
  firepit(p, w, h, seed) {
    const buf = new Uint32Array(w * h), ph = [seed % 5, seed % 4 + 1, seed % 7 + 2];
    const dirt = mixRGB(p.bottom, [112, 82, 50], 0.55), cx = w / 2, cy = h / 2;
    stamp(buf, w, h, (x, y) => blobDepth(x - cx, y - cy, w * 0.46, h * 0.45, ph), (x, y) => {
      const a = vnoise(x, y, 10, seed), q = hash2(x, y, seed + 7);
      let c = a > 0.64 ? mixRGB(dirt, WHITE, 0.06) : a < 0.3 ? mixRGB(dirt, BLACK, 0.09) : dirt;
      if (q < 0.04) c = mixRGB(dirt, BLACK, 0.22); else if (q < 0.06) c = mixRGB(p.stone, WHITE, 0.08);
      const d = Math.hypot(x - cx, y - cy);
      if (d < 38 && d > 22 && q < 0.5) c = mixRGB(dirt, BLACK, 0.2 + (38 - d) * 0.01);          // 炭灰向外洇开
      if (d < 26) {                                                                              // 炭坑
        c = mixRGB([28, 22, 18], WHITE, hash2(x >> 1, y >> 1, seed + 8) * 0.12);
        if (q < 0.05) c = [214, 96, 34]; else if (q < 0.065) c = [255, 190, 90];                  // 几点余火
      }
      return c;
    }, 0.12);
    // 垒石：一圈 9 块
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + 0.3, sx = Math.round(cx + Math.cos(a) * 40), sy = Math.round(cy + Math.sin(a) * 38);
      for (let dy = -3; dy <= 3; dy++) for (let dx = -4; dx <= 4; dx++) {
        if ((dx * dx) / 17 + (dy * dy) / 10 > 1) continue;
        const k = dy < -1 ? 0.2 : dy > 1 ? -0.3 : 0, base = mixRGB(p.stone, k > 0 ? WHITE : BLACK, Math.abs(k));
        buf[(sy + dy) * w + sx + dx] = pack(Math.abs(dx) === 4 || dy === 3 ? mixRGB(base, BLACK, 0.4) : base);
      }
    }
    return buf;
  },
  // 青石古道：沿画布竖直方向走，两边破碎渐隐，里面是错缝的石板，缝里带苔
  stoneRoad(p, w, h, seed) {
    const buf = new Uint32Array(w * h), cx = w / 2, SH = 22, SW = 30;
    const road = mixRGB(p.stone, [74, 98, 104], 0.4);
    const mid = y => cx + Math.sin(y * 0.021 + seed % 6) * 9, half = y => 33 + 5 * Math.sin(y * 0.047 + 1);
    stamp(buf, w, h, (x, y) => 1 - Math.abs(x - mid(y)) / half(y), (x, y, f) => {
      const row = (y / SH) | 0, off = (row % 2) * 14 + ((hash2(row, 1, seed) * 8) | 0), col = Math.floor((x + off) / SW);
      const lx = (x + off) - col * SW, ly = y - row * SH, sh = hash2(col, row, seed + 2), gap = lx === 0 || ly === 0;
      const tone = sh < 0.3 ? -0.1 : sh > 0.7 ? 0.1 : 0;
      let c = gap ? mixRGB(road, BLACK, 0.5) : (ly === 1 || lx === 1) ? mixRGB(road, WHITE, 0.16 + tone) : mixRGB(road, tone < 0 ? BLACK : WHITE, Math.abs(tone));
      if (!gap && hash2(x, y, seed + 6) < 0.05) c = mixRGB(c, BLACK, 0.14);
      if (sh > 0.84 && !gap && Math.abs(lx - ly * 1.2 - 6) < 1) c = mixRGB(road, BLACK, 0.5);
      const m = vnoise(x, y, 9, seed + 3);
      if (m > 0.62 + f * 0.25 || (gap && m > 0.48)) c = mixRGB(c, p.moss, 0.6);
      return c;
    }, 0.18);
    return buf;
  },
  // 林间土路：沿画布横向走，踩实的土，两道浅浅的车辙，边上冒草
  dirtRoad(p, w, h, seed) {
    const buf = new Uint32Array(w * h), cy = h / 2;
    const dirt = mixRGB(p.bottom, [150, 118, 74], 0.5);
    const mid = x => cy + Math.sin(x * 0.012 + seed % 5) * 8, half = x => 30 + 4 * Math.sin(x * 0.031 + 2);
    stamp(buf, w, h, (x, y) => 1 - Math.abs(y - mid(x)) / half(x), (x, y, f) => {
      const a = vnoise(x, y, 8, seed), q = hash2(x, y, seed + 7), rut = Math.abs(y - mid(x));
      let c = a > 0.64 ? mixRGB(dirt, WHITE, 0.06) : a < 0.3 ? mixRGB(dirt, BLACK, 0.08) : dirt;
      if ((rut > 9 && rut < 12) && q > 0.25) c = mixRGB(dirt, BLACK, 0.15);                     // 两道车辙
      if (q < 0.03) c = mixRGB(p.stone, WHITE, 0.1); else if (q < 0.055) c = mixRGB(dirt, BLACK, 0.22);
      if (f < 0.3 && q > 0.92) c = q > 0.96 ? p.hi : p.light;
      return c;
    }, 0.2);
    return buf;
  },
};
export const LANDMARK_KINDS = Object.keys(PAINTERS);

// 一个生态的地标像素：{ data: Uint32Array, w, h, at, kind, name }
export function buildLandmarkPixels(biome) {
  const lm = landmarkOf(biome.id), p = paletteOf(biome), seed = hashStr(biome.id + ':' + lm.kind);
  return { data: PAINTERS[lm.kind](p, lm.w, lm.h, seed), w: lm.w, h: lm.h, at: lm.at, kind: lm.kind, name: lm.name };
}

// ---------- 上画布 ----------
// make(w, h) 返回带 getContext('2d') 的画布。优先 putImageData；浏览器里 ImageData 现成可用。
function toCanvas(make, data, w, h) {
  const cv = make(w, h), c = cv.getContext('2d');
  const bytes = new Uint8ClampedArray(data.buffer, data.byteOffset, data.byteLength);
  let img;
  if (typeof ImageData !== 'undefined') img = new ImageData(bytes, w, h);
  else { img = c.createImageData(w, h); img.data.set(bytes); }
  c.putImageData(img, 0, 0);
  return cv;
}
// 造一个生态的整套地面：{ block: { canvas, size }, landmark: { canvas, w, h, at, kind, name }, ms, mb }
export function buildGround(biome, make) {
  const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
  const b = buildBlockPixels(biome), l = buildLandmarkPixels(biome);
  const block = toCanvas(make, b.data, b.size, b.size), lmCv = toCanvas(make, l.data, l.w, l.h);
  const ms = (typeof performance !== 'undefined' ? performance.now() : 0) - t0;
  return {
    block: { canvas: block, size: b.size }, landmark: { canvas: lmCv, w: l.w, h: l.h, at: l.at, kind: l.kind, name: l.name },
    ms, mb: (b.size * b.size + l.w * l.h) * 4 / 1048576,
  };
}
