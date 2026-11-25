import { WHEEL_HEX, WHEEL_DARK, GEM_HEX, REL_HEX, font } from './theme.js';
import { roundRect, text } from './draw.js';
import { CARD_MASKS, COLOR_NAMES } from '../shared/index.js';
import { ARCANA, CARVES } from '../content/index.js';

export const CARD_W = 62, CARD_H = 88;
const CARVE_CHAR = { sharp: '锐', twin: '双', pierce: '碎', overflow: '溢' };
const CARVE_HEX = { sharp: '#ffb04a', twin: '#7ad8ff', pierce: '#ff7a7a', overflow: '#d49aff' };

// 画一张牌，中心点在 (0,0)，调用方先 translate / rotate / scale。
// 牌的种类：宝石牌（颜色 + 红绿蓝圆点）、秘术牌（入链带色 / 瞬发无色）、缠藤废牌。
// o.frame: 'near' | 'comp' | 'wild' | 'break' | null；o.lit：施法时亮起；o.tag：框上方的小字；o.masked：被遮住颜色
export function drawCard(ctx, card, o = {}) {
  const w = CARD_W, h = CARD_H, x = -w / 2, y = -h / 2;
  const col = card.color;
  ctx.save();
  if (o.lit) {                                            // 施法时亮起：外面垫两圈淡色，不用实时模糊
    roundRect(ctx, x - 6, y - 6, w + 12, h + 12, 12); ctx.fillStyle = 'rgba(255,246,192,0.22)'; ctx.fill();
    roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 10); ctx.fillStyle = 'rgba(255,246,192,0.32)'; ctx.fill();
  }
  roundRect(ctx, x, y, w, h, 7);
  if (o.masked) {
    const g = ctx.createLinearGradient(0, y, 0, y + h); g.addColorStop(0, '#4a4f60'); g.addColorStop(1, '#2a2e3a');
    ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(10,14,10,0.75)'; ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.font = font(34, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.fillText('?', 0, -6);
    ctx.restore();
    text(ctx, '已遮蔽', 0, 26, { size: 12, align: 'center', color: '#d8dcec', outline: null });
    return;
  }
  const junk = !!card.junk, arc = card.arcana ? ARCANA[card.arcana] : null, instant = junk || (arc && arc.kind === 'instant');
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  if (junk) { g.addColorStop(0, '#5c6a48'); g.addColorStop(1, '#3a4430'); }
  else if (instant) { g.addColorStop(0, '#6a5ab8'); g.addColorStop(1, '#3a2f78'); }
  else { g.addColorStop(0, WHEEL_HEX[col]); g.addColorStop(1, col === 6 ? '#d8d2c0' : WHEEL_DARK[col]); }
  ctx.fillStyle = g; ctx.fill();
  ctx.lineWidth = 2; ctx.strokeStyle = arc ? '#ffd24a' : 'rgba(10,14,10,0.75)'; ctx.stroke();

  if (junk) {
    ctx.strokeStyle = '#8aa060'; ctx.lineWidth = 2.5;
    for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(x + 6, y + 16 + k * 18); ctx.bezierCurveTo(x + 22, y + 6 + k * 18, x + 40, y + 28 + k * 18, x + w - 6, y + 14 + k * 18); ctx.stroke(); }
  } else if (instant) {
    // 瞬发秘术：无色，画一个菱形的符印
    ctx.beginPath(); ctx.moveTo(0, y + 8); ctx.lineTo(10, y + 20); ctx.lineTo(0, y + 32); ctx.lineTo(-10, y + 20); ctx.closePath();
    ctx.fillStyle = '#ffe9a0'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke();
  } else {
    const mask = CARD_MASKS[col], r = 7, gap = 19;
    for (let j = 0; j < 3; j++) {
      const cx = (j - 1) * gap, cy = y + 18;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = mask[j] ? GEM_HEX[j] : 'rgba(0,0,0,0.22)'; ctx.fill();
      ctx.lineWidth = 1.5; ctx.strokeStyle = mask[j] ? '#fff' : 'rgba(0,0,0,0.3)'; ctx.stroke();
    }
  }
  // 牌面的字
  const ink = instant ? '#fff' : (col === 6 || col === 1 ? '#3a3320' : '#fff');
  const halo = instant ? 'rgba(0,0,0,0.5)' : (col === 6 || col === 1 ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.45)');
  ctx.font = font(junk || arc ? 18 : 34, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = ink; ctx.strokeStyle = halo; ctx.lineWidth = 3;
  const label = junk ? '废牌' : arc ? arc.name : COLOR_NAMES[col];
  if (junk || arc) {
    const a = label.slice(0, 2), b = label.slice(2);
    ctx.strokeText(a, 0, y + (instant ? 46 : 48)); ctx.fillText(a, 0, y + (instant ? 46 : 48));
    if (b) { ctx.strokeText(b, 0, y + (instant ? 66 : 68)); ctx.fillText(b, 0, y + (instant ? 66 : 68)); }
  } else { ctx.strokeText(label, 0, y + 56); ctx.fillText(label, 0, y + 56); }
  if (o.dim) { roundRect(ctx, x, y, w, h, 7); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill(); }
  // 宝石雕琢的小标记
  const cv = card.carve || [];
  if (cv.length) {
    cv.forEach((k, i) => {
      const bx = x + 4 + i * 15, by = y + h - 17;
      roundRect(ctx, bx, by, 14, 14, 3); ctx.fillStyle = CARVE_HEX[k]; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
      ctx.font = font(12, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#1a1208'; ctx.fillText(CARVE_CHAR[k], bx + 7, by + 7.5);
    });
  }
  if (o.frame) {
    roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 9);
    ctx.lineWidth = 4; ctx.strokeStyle = REL_HEX[o.frame];
    if (o.frame === 'break') ctx.setLineDash([6, 4]);
    else { ctx.save(); ctx.globalAlpha = 0.3; ctx.lineWidth = 9; ctx.stroke(); ctx.restore(); }          // 外圈淡淡加宽一层，当作亮边
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

export const carveHex = k => CARVE_HEX[k];
export const carveChar = k => CARVE_CHAR[k];
