// 无缝大 Tilemap 地面：每个生态 6 种底纹、一块 ≤ 1.5 MB、首尾无缝、每个生态只有 1 个唯一地标。
import { BIOMES, BIOME_IDS } from '../../content/index.js';
import {
  TILE, GRID, BLOCK, BLOCK_MB, VARIANT_KINDS, FLAVORS, LANDMARKS, LANDMARK_KINDS,
  buildBlockPixels, buildLandmarkPixels, buildGround, familyOf, landmarkOf,
} from '../tilemap-ground.js';

// 一个像素的亮度（Uint32 小端：A B G R）
const lum = v => ((v & 255) * 0.3 + ((v >>> 8) & 255) * 0.59 + ((v >>> 16) & 255) * 0.11);
const alpha = v => v >>> 24;

// 假画布：只够 buildGround 走通（node 里没有 ImageData）
const makeFake = (w, h) => ({ width: w, height: h, getContext: () => ({ createImageData: (a, b) => ({ data: new Uint8ClampedArray(a * b * 4) }), putImageData() {} }) });

// 取一个方向上相邻像素的平均亮度差：x 方向时 seam = 最后一列和第一列接缝
function meanDiff(data, size, axis, from, to, step = 3) {
  let sum = 0, n = 0;
  for (let a = 0; a < size; a += step) {
    const i = axis === 'x' ? a * size + from : from * size + a;
    const j = axis === 'x' ? a * size + to : to * size + a;
    sum += Math.abs(lum(data[i]) - lum(data[j])); n++;
  }
  return sum / n;
}

export default function (t) {
  t.test('Tilemap：区块 576×576 = 1.27 MB（≤ 1.5 MB），格数 36 能被噪声格距整除', () => {
    t.assert.equal(TILE, 16); t.assert.equal(BLOCK, 576);
    t.assert.ok(BLOCK_MB > 1.2 && BLOCK_MB <= 1.5, '区块 MB：' + BLOCK_MB);
    for (const p of [12, 6, 3]) t.assert.equal(GRID % p, 0, `GRID ${GRID} 要能被噪声格距 ${p} 整除（首尾无缝）`);
  });

  t.test('Tilemap：8 个生态每个都有 6 种（5 种底纹 + 1 种稀有点缀）× 4 份小砖，且每种底纹都真的占到了地方', () => {
    t.assert.equal(VARIANT_KINDS, 6); t.assert.equal(FLAVORS, 4);
    for (const id of BIOME_IDS) {
      const fam = familyOf(id);
      t.assert.equal(fam.kinds.length, 5, id + '：5 种底纹');
      t.assert.ok(fam.decal, id + '：1 种稀有点缀');
      const b = buildBlockPixels(BIOMES[id]);
      t.assert.equal(b.size, BLOCK); t.assert.equal(b.data.length, BLOCK * BLOCK);
      t.assert.equal(b.tileCount, VARIANT_KINDS * FLAVORS);
      t.assert.equal(b.kindShare.length, 5);
      for (const [k, s] of b.kindShare.entries()) t.assert.ok(s > 0.04, `${id} 第 ${k} 种底纹只占 ${(s * 100).toFixed(1)}%，太少`);
      t.assert.ok(Math.max(...b.kindShare) < 0.45, id + '：没有哪一种大到铺满整片');
      let opaque = 0; for (let i = 0; i < b.data.length; i += 7) if (alpha(b.data[i]) === 255) opaque++;
      t.assert.equal(opaque, Math.ceil(b.data.length / 7), id + '：区块全不透明');
    }
  });

  t.test('Tilemap：同一个生态每次生成一模一样；不同生态不一样', () => {
    const a = buildBlockPixels(BIOMES.forest), b = buildBlockPixels(BIOMES.forest), c = buildBlockPixels(BIOMES.swamp);
    t.assert.ok(a.data.every((v, i) => v === b.data[i]), '森林两次相同');
    let diff = 0; for (let i = 0; i < a.data.length; i += 11) if (a.data[i] !== c.data[i]) diff++;
    t.assert.ok(diff > a.data.length / 11 * 0.5, '森林和泥泽大部分像素不同');
    const l1 = buildLandmarkPixels(BIOMES.camp), l2 = buildLandmarkPixels(BIOMES.camp);
    t.assert.ok(l1.data.every((v, i) => v === l2.data[i]), '地标也是确定的');
  });

  t.test('Tilemap：首尾无缝——区块左右、上下接缝处的亮度差不比内部相邻像素大（循环铺开看不出线）', () => {
    for (const id of BIOME_IDS) {
      const { data, size } = buildBlockPixels(BIOMES[id]);
      let inner = 0, n = 0;
      for (const c of [100, 200, 300, 400, 500]) { inner += meanDiff(data, size, 'x', c, c + 1); inner += meanDiff(data, size, 'y', c, c + 1); n += 2; }
      inner /= n;
      const seamX = meanDiff(data, size, 'x', size - 1, 0), seamY = meanDiff(data, size, 'y', size - 1, 0);
      t.assert.ok(seamX <= inner * 1.6 + 2, `${id} 左右接缝 ${seamX.toFixed(1)} vs 内部 ${inner.toFixed(1)}`);
      t.assert.ok(seamY <= inner * 1.6 + 2, `${id} 上下接缝 ${seamY.toFixed(1)} vs 内部 ${inner.toFixed(1)}`);
    }
  });

  t.test('Tilemap：每个生态恰好 1 个唯一地标，大小、位置照表，边缘透明（能融进底纹），中间有画', () => {
    t.assert.deepEqual(Object.keys(LANDMARKS).sort(), [...BIOME_IDS].sort(), '8 个生态各 1 个');
    t.assert.equal(new Set(Object.values(LANDMARKS).map(l => l.kind)).size, 8, '8 个地标画法互不相同（全图只有 1 个火塘、1 条古道、1 条土路）');
    t.assert.deepEqual(LANDMARK_KINDS.sort(), Object.values(LANDMARKS).map(l => l.kind).sort());
    t.assert.equal(LANDMARKS.camp.kind, 'firepit'); t.assert.equal(LANDMARKS.gate.kind, 'stoneRoad'); t.assert.equal(LANDMARKS.trade.kind, 'dirtRoad');
    for (const id of BIOME_IDS) {
      const lm = buildLandmarkPixels(BIOMES[id]), def = landmarkOf(id);
      t.assert.equal(lm.w, def.w); t.assert.equal(lm.h, def.h); t.assert.equal(lm.data.length, lm.w * lm.h);
      t.assert.ok(lm.w * lm.h * 4 / 1048576 < 0.9, id + ' 地标 MB 合理');
      let solid = 0, clear = 0;
      for (let i = 0; i < lm.data.length; i++) { const a = alpha(lm.data[i]); if (a > 0) solid++; else clear++; }
      t.assert.ok(solid > lm.data.length * 0.12, `${id} 地标有内容：${solid}`);
      t.assert.ok(clear > lm.data.length * 0.05, `${id} 地标有透明的边：${clear}`);
      // 四个角必须是透明的（不然接到底纹上有方块边）
      for (const [x, y] of [[0, 0], [lm.w - 1, 0], [0, lm.h - 1], [lm.w - 1, lm.h - 1]]) t.assert.equal(alpha(lm.data[y * lm.w + x]), 0, `${id} 角 (${x},${y}) 要透明`);
    }
    // 路：古道竖着、土路横着，两头都伸到边上
    const gate = buildLandmarkPixels(BIOMES.gate), trade = buildLandmarkPixels(BIOMES.trade);
    t.assert.ok(gate.h > gate.w * 2, '古道是竖长条'); t.assert.ok(trade.w > trade.h * 5, '土路是横长条');
  });

  t.test('Tilemap：buildGround 一次造好区块 + 地标，MB 和耗时都记下来；<15 ms 的目标在 node 里放宽到 400 ms 内', () => {
    for (const id of BIOME_IDS) {
      const g = buildGround(BIOMES[id], makeFake);
      t.assert.equal(g.block.size, BLOCK); t.assert.equal(g.block.canvas.width, BLOCK);
      t.assert.equal(g.landmark.w, landmarkOf(id).w);
      t.assert.ok(g.mb > 1.27 && g.mb < 2.2, id + ' 总 MB：' + g.mb);
      t.assert.ok(g.ms >= 0 && g.ms < 400, id + ' 生成耗时 ' + g.ms.toFixed(1) + ' ms');
    }
  });
}
