// 内置兜底地砖：没加载 UI-04 地面包（或包里出错）时，用生态色板画一张 384×384 的硬像素地砖。
// 画法跟包里的地砖一样当「无缝可平铺的纹理」用：只撒硬边小方块，不画渐变，不画任何摆件。
import { rng } from './env-ground.js';

const mix = (a, b, k) => {
  const p = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
  const A = p(a), B = p(b);
  return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * k).toString(16).padStart(2, '0')).join('');
};

// make(w, h) 返回带 getContext('2d') 的画布；biome 是 content/biomes.js 里的一项
export function buildFallbackTile(biome, make, size = 384) {
  const cv = make(size, size), c = cv.getContext('2d');
  const r = rng(biome.id.length * 977 + biome.id.charCodeAt(0));
  const base = mix(biome.groundTop, biome.groundBottom, 0.5);
  c.fillStyle = base; c.fillRect(0, 0, size, size);
  const px = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h); };
  const stone = !!biome.moss;                                  // 苔石古径、青石岔口：石板地
  if (stone) {
    const cw = 64, ch = 40;
    for (let y = 0, row = 0; y < size; y += ch, row++) {
      for (let x = -(row % 2) * (cw / 2); x < size; x += cw) {
        const k = r();
        px(x, y, cw, ch, k < 0.33 ? mix(base, '#000000', 0.12) : k < 0.66 ? base : mix(base, '#ffffff', 0.08));
        px(x, y, cw, 2, mix(base, '#000000', 0.35)); px(x, y, 2, ch, mix(base, '#000000', 0.35));   // 缝
      }
    }
    for (let i = 0; i < 160; i++) px(r() * size, r() * size, 3 + ((r() * 5) | 0), 2, biome.moss);
  } else {
    for (let i = 0; i < 520; i++) px(r() * size, r() * size, 2 + ((r() * 3) | 0) * 2, 2, biome.patch);                 // 深浅斑块
    for (let i = 0; i < 260; i++) px(r() * size, r() * size, 2, 2, mix(base, '#000000', 0.3));                          // 暗点
    for (let i = 0; i < 220; i++) px(r() * size, r() * size, 2, 2, biome.leaf[(r() * 3) | 0]);                          // 叶片
    for (let i = 0; i < 14; i++) { const x = r() * size, y = r() * size; px(x, y, 4, 4, biome.fruit); px(x + 2, y + 2, 2, 2, mix(biome.fruit, '#000000', 0.4)); }
  }
  return cv;
}

// 暗角：一张很小的画布，画一次，拉伸铺满；中间透明、四周压暗。已含整体压暗 15%。
export function buildVignette(biome, make, w = 192, h = 108) {
  const cv = make(w, h), c = cv.getContext('2d');
  c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(0, 0, w, h);
  const g = c.createRadialGradient(w / 2, h * 0.52, h * 0.35, w / 2, h * 0.52, w * 0.66);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, biome.vignette || 'rgba(0,0,0,0.5)');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  return cv;
}
