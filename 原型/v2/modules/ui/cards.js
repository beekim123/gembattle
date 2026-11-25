import { WHEEL_HEX, WHEEL_DARK, GEM_HEX, REL_HEX, font } from './theme.js';
import { roundRect, text } from './draw.js';
import { CARD_MASKS, COLOR_NAMES } from '../shared/index.js';

export const CARD_W = 62, CARD_H = 88;

// 画一张宝石牌，中心点在 (0,0)，调用方先 translate / rotate / scale。
// o.frame: 'near' | 'comp' | 'wild' | 'break' | null；o.lit：施法时亮起；o.tag：框上方的小字
export function drawCard(ctx, card, o = {}) {
  const w = CARD_W, h = CARD_H, x = -w / 2, y = -h / 2;
  const col = card.color, mask = CARD_MASKS[col];
  ctx.save();
  if (o.lit) { ctx.shadowColor = '#fff6c0'; ctx.shadowBlur = 18; }
  roundRect(ctx, x, y, w, h, 7);
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, WHEEL_HEX[col]); g.addColorStop(1, col === 6 ? '#d8d2c0' : WHEEL_DARK[col]);
  ctx.fillStyle = g; ctx.fill();
  ctx.shadowBlur = 0;
  ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(10,14,10,0.75)'; ctx.stroke();
  // 宝石圆点：红绿蓝各一，有就亮，没有就是暗槽
  const r = 7, gap = 19;
  for (let j = 0; j < 3; j++) {
    const cx = (j - 1) * gap, cy = y + 18;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = mask[j] ? GEM_HEX[j] : 'rgba(0,0,0,0.22)'; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = mask[j] ? '#fff' : 'rgba(0,0,0,0.3)'; ctx.stroke();
  }
  ctx.font = font(34, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = col === 6 || col === 1 ? '#3a3320' : '#fff';
  ctx.strokeStyle = col === 6 || col === 1 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3;
  ctx.strokeText(COLOR_NAMES[col], 0, y + 56); ctx.fillText(COLOR_NAMES[col], 0, y + 56);
  if (o.dim) { roundRect(ctx, x, y, w, h, 7); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); }
  if (o.frame) {
    roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 9);
    ctx.lineWidth = o.frame === 'wild' ? 4 : 4; ctx.strokeStyle = REL_HEX[o.frame];
    if (o.frame === 'break') ctx.setLineDash([6, 4]);
    ctx.shadowColor = REL_HEX[o.frame]; ctx.shadowBlur = o.frame === 'break' ? 0 : 12;
    ctx.stroke();
  }
  ctx.restore();
  if (o.tag) text(ctx, o.tag, 0, y - 10, { size: 12, color: o.tagColor || '#fff', align: 'center' });
}

// 牌背面的小方块（抽牌堆用）
export function drawCardBack(ctx, x, y, s = 1) {
  ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  roundRect(ctx, -CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, 7);
  ctx.fillStyle = '#3b4a6a'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#b9c4e0'; ctx.stroke();
  ctx.restore();
}
