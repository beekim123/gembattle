// 战斗画面的区域表（上下布局，用户 2026-11-23 定的）：所有位置都从这里取，画的地方不写死坐标。
// 坐标是 960×540 的布局单位（设计稿 10.6：画面按 1920×1080 设计，一个单位 = 2 像素）。怪在上，链浮在中间，主角和队友在下，手牌在最下面排成一道弧。

import { SCREEN } from '../shared/index.js';

export const { w: W, h: H } = SCREEN;

export const REGIONS = Object.freeze({
  bar: { h: 30 },
  // 怪站的位子：按只数挑一组。s 是这只占多大（以后像素堆叠立绘就画在这个框里）
  monsters: {
    1: [{ x: 480, y: 232, s: 150 }],
    2: [{ x: 390, y: 232, s: 128 }, { x: 590, y: 222, s: 118 }],
    3: [{ x: 480, y: 236, s: 128 }, { x: 290, y: 214, s: 96 }, { x: 670, y: 214, s: 96 }],
    4: [{ x: 420, y: 238, s: 120 }, { x: 240, y: 212, s: 88 }, { x: 600, y: 216, s: 88 }, { x: 760, y: 204, s: 88 }],
  },
  overhead: { gap: 12, barH: 6, toughH: 4, minW: 64, maxW: 112 },
  chain: { cx: 480, y: 254, h: 60, maxCard: 46, gap: 12, maxW: 576, dropTop: 150, dropBottom: 340 },
  // 打出去以后，链收到最左边竖成一列：施法的顺序表（用户 2026-11-23 定的，D1）
  castList: { x: 18, top: 72, bottom: 416, cardW: 40, cardH: 46, gap: 6 },
  // 集色环：左边让给顺序表，挪到左下牌堆旁边
  ring: { cx: 214, cy: 460, rad: 17, dot: 6 },
  preview: { x: 772, y: 254, w: 176, h: 74 },
  total: { cx: 480, cy: 288 },
  hero: { cx: 480, base: 388, size: 58 },
  allies: [{ cx: 392, base: 382, size: 46 }, { cx: 568, base: 382, size: 46 }, { cx: 316, base: 376, size: 44 }],
  // 手牌左右只到 260~700：左边是集色环（到 231），右边是「自动排 / 全撤回」（从 704 起）。所以整道弧最多张开 30 度，7 张起缩小一点
  hand: { cx: 480, pivotY: 1100, radius: 650, cw: 78, ch: 108, stepDeg: 7, maxSpreadDeg: 30, crowd: 6, crowdScale: 0.86, zoneTop: 404, instantTop: 426 },
  // 拖「马上用」的牌：往上拖离手牌那道弧（过 instantTop、比按下时高 20）松手就用；这一块画虚线框提示
  instantZone: { x: 236, y: 140, w: 488, h: 286 },
  pile: { x: 16, y: 436 },
  cast: { cx: 884, cy: 478, r: 42 },
  buttons: { auto: { x: 704, y: 434, w: 76, h: 26 }, clear: { x: 704, y: 466, w: 76, h: 26 }, back: { x: 884, y: 4, w: 40, h: 22 } },
});

export function monsterSlots(n) {
  const k = Math.max(1, Math.min(4, n));
  return REGIONS.monsters[k].map((s) => ({ ...s }));
}

/** 手牌那道弧上每张的位置；hoverIdx 那张抬起来、摆正、放大，两边的往外让 */
export function fanSlots(n, hoverIdx = -1) {
  const Hd = REGIONS.hand;
  if (n === 0) return [];
  const step = n > 1 ? Math.min(Hd.stepDeg, Hd.maxSpreadDeg / (n - 1)) : 0;
  const base = n > Hd.crowd ? Hd.crowdScale : 1;
  return Array.from({ length: n }, (_, i) => {
    const deg = (i - (n - 1) / 2) * step;
    const a = (deg * Math.PI) / 180;
    let x = Hd.cx + Hd.radius * Math.sin(a);
    let y = Hd.pivotY - Hd.radius * Math.cos(a);
    if (hoverIdx >= 0 && i !== hoverIdx) x += (i < hoverIdx ? -1 : 1) * 16;
    const hovered = i === hoverIdx;
    if (hovered) y -= 34;
    return { x, y, rot: hovered ? 0 : a, scale: hovered ? 1.16 : base, hovered, w: Hd.cw * base, h: Hd.ch * base };
  });
}

/** 链上每张的位置：张数多了自动缩，12 张也放得下 */
export function chainSlots(n) {
  const C = REGIONS.chain;
  if (n <= 0) return [];
  const cw = Math.min(C.maxCard, (C.maxW - C.gap * (n - 1)) / n);
  const ch = Math.min(C.h, cw * 1.3);
  const total = cw * n + C.gap * (n - 1);
  const sx = C.cx - total / 2;
  return Array.from({ length: n }, (_, i) => {
    const x = sx + i * (cw + C.gap);
    const y = C.y + (C.h - ch);
    return { x, y, w: cw, h: ch, cx: x + cw / 2, cy: y + ch / 2 };
  });
}

/** 施法顺序表上每张的位置：从上往下，张数多了自动缩 */
export function castListSlots(n) {
  const L = REGIONS.castList;
  if (n <= 0) return [];
  const rowH = Math.min(L.cardH + L.gap, (L.bottom - L.top) / n);
  const h = Math.min(L.cardH, rowH - 3);
  const w = Math.min(L.cardW, h * 0.87);
  return Array.from({ length: n }, (_, i) => {
    const y = L.top + i * rowH;
    return { x: L.x, y, w, h, cx: L.x + w / 2, cy: y + h / 2 };
  });
}

/** 拖着一张牌松手时，插进链的第几个位子 */
export function chainInsertIndex(n, x) {
  const slots = chainSlots(n);
  let idx = 0;
  for (const s of slots) if (x > s.cx) idx++;
  return idx;
}

/** 点是不是落在一张转过角度的手牌里 */
export function hitRotated(slot, px, py) {
  const dx = px - slot.x;
  const dy = py - slot.y;
  const c = Math.cos(-slot.rot);
  const s = Math.sin(-slot.rot);
  const lx = (dx * c - dy * s) / slot.scale;
  const ly = (dx * s + dy * c) / slot.scale;
  return Math.abs(lx) <= REGIONS.hand.cw / 2 && Math.abs(ly) <= REGIONS.hand.ch / 2;
}
