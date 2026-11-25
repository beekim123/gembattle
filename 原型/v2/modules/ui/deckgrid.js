// 牌组网格：把整副牌按颜色排成 7 行宝石牌，加一行秘术牌 / 废牌。选牌（雕琢、清理行囊）和查看牌组共用。
import { drawCard, CARD_W, CARD_H } from './skin.js';
import { text } from './draw.js';
import { COLOR_NAMES } from '../shared/index.js';
import { WHEEL_HEX } from './theme.js';

const S = 0.5;
export const GRID_CARD_W = CARD_W * S, GRID_CARD_H = CARD_H * S;

// 返回每张牌的位置 [{ card, x, y }]，x、y 是牌的中心；原点 (x0, y0) 是网格左上角
export function layoutDeckGrid(cards, x0, y0, { gemsOnly = false, rowH = GRID_CARD_H + 6 } = {}) {
  const out = [];
  let row = 0;
  for (let c = 0; c < 7; c++) {
    const list = cards.filter(k => !k.arcana && !k.junk && k.color === c);
    list.forEach((card, i) => out.push({ card, x: x0 + 40 + i * (GRID_CARD_W + 5) + GRID_CARD_W / 2, y: y0 + row * rowH + GRID_CARD_H / 2, row: c }));
    row++;
  }
  if (!gemsOnly) {
    const extra = cards.filter(k => k.arcana || k.junk);
    extra.forEach((card, i) => out.push({ card, x: x0 + 40 + (i % 12) * (GRID_CARD_W + 5) + GRID_CARD_W / 2, y: y0 + (row + Math.floor(i / 12)) * rowH + GRID_CARD_H / 2, row: 7 }));
  }
  return out;
}

export function drawDeckGrid(ctx, items, x0, y0, { hover = null, pick = null, dimFn = null, rowH = GRID_CARD_H + 6 } = {}) {
  for (let c = 0; c < 7; c++) {
    text(ctx, COLOR_NAMES[c], x0 + 14, y0 + c * rowH + GRID_CARD_H / 2, { size: 14, align: 'center', color: WHEEL_HEX[c], weight: 800 });
  }
  if (items.some(i => i.row === 7)) text(ctx, '其他', x0 + 14, y0 + 7 * rowH + GRID_CARD_H / 2, { size: 13, align: 'center', color: '#ffe9a0' });
  for (const it of items) {
    ctx.save(); ctx.translate(it.x, it.y); ctx.scale(S, S);
    const hv = hover && hover.uid === it.card.uid;
    if (hv) ctx.scale(1.12, 1.12);
    drawCard(ctx, it.card, { dim: dimFn ? dimFn(it.card) : false, frame: hv ? 'comp' : null });
    ctx.restore();
  }
}
export function hitDeckGrid(items, px, py) {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (Math.abs(px - it.x) <= GRID_CARD_W / 2 && Math.abs(py - it.y) <= GRID_CARD_H / 2) return it.card;
  }
  return null;
}
