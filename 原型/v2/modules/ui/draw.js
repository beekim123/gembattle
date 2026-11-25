import { font, INK } from './theme.js';

export function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

// 带描边的字，压在花哨的背景上也看得清。
export function text(ctx, str, x, y, { size = 14, color = INK, align = 'left', weight = 600, outline = 'rgba(0,0,0,0.65)', baseline = 'middle' } = {}) {
  ctx.font = font(size, weight);
  ctx.textAlign = align; ctx.textBaseline = baseline;
  if (outline) { ctx.lineWidth = 3; ctx.strokeStyle = outline; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = color;
  ctx.fillText(str, x, y);
}

export function panel(ctx, x, y, w, h, fill = 'rgba(14,22,16,0.62)', stroke = 'rgba(255,255,255,0.14)') {
  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.lineWidth = 1; ctx.strokeStyle = stroke; ctx.stroke(); }
}

// 按宽度折行（中文逐字量）
export function wrap(ctx, str, maxW, size = 12, weight = 500) {
  ctx.font = font(size, weight);
  const lines = []; let cur = '';
  for (const ch of str) {
    if (ctx.measureText(cur + ch).width > maxW) { lines.push(cur); cur = ch; } else cur += ch;
  }
  if (cur) lines.push(cur);
  return lines;
}

export function heartPath(ctx, cx, cy, s) {
  ctx.beginPath();
  ctx.moveTo(cx, cy + s * 0.9);
  ctx.bezierCurveTo(cx - s * 1.5, cy - s * 0.1, cx - s * 0.9, cy - s * 1.1, cx, cy - s * 0.35);
  ctx.bezierCurveTo(cx + s * 0.9, cy - s * 1.1, cx + s * 1.5, cy - s * 0.1, cx, cy + s * 0.9);
  ctx.closePath();
}
export const hexMix = (a, b, k) => {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const m = (s) => Math.round(((pa >> s) & 255) * (1 - k) + ((pb >> s) & 255) * k);
  return '#' + [16, 8, 0].map(s => m(s).toString(16).padStart(2, '0')).join('');
};
