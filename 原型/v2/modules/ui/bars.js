import { text, roundRect, heartPath } from './draw.js';
import { GEM_HEX } from './theme.js';

// 血条：上方小字 = 当前血量；多重血条在条后面叠几道细线。
export function drawHpBar(ctx, cx, y, w, hp, max, bar, barsTotal) {
  const h = 9, x = cx - w / 2;
  for (let k = barsTotal - 1; k > bar; k--) {
    roundRect(ctx, x + 3 * (k - bar), y - 3 * (k - bar), w, h, 3);
    ctx.fillStyle = '#5a2020'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke();
  }
  roundRect(ctx, x, y, w, h, 3); ctx.fillStyle = '#1a1010'; ctx.fill();
  const ratio = Math.max(0, hp / max);
  if (ratio > 0) { roundRect(ctx, x, y, Math.max(4, w * ratio), h, 3); ctx.fillStyle = '#e04a3e'; ctx.fill(); }
  roundRect(ctx, x, y, w, h, 3); ctx.strokeStyle = 'rgba(0,0,0,0.9)'; ctx.lineWidth = 1.5; ctx.stroke();
  text(ctx, String(Math.ceil(hp)), cx, y - 8, { size: 12, align: 'center' });
  if (barsTotal > 1) text(ctx, `第 ${bar + 1}/${barsTotal} 条`, cx + w / 2 + 3, y + 5, { size: 12, align: 'left', color: '#ffb0a0' });
}

// 颜色盾格：每格一个小方块，剩下的实心，已削掉的空心；破盾后显示「已破」。
export function drawShield(ctx, cx, y, shield, shieldMax, broken) {
  const cells = [];
  for (let ch = 0; ch < 3; ch++) for (let k = 0; k < shieldMax[ch]; k++) cells.push({ ch, on: k < shield[ch] });
  if (!cells.length) return;
  const s = 11, gap = 3, total = cells.length * (s + gap) - gap;
  let x = cx - total / 2;
  for (const c of cells) {
    ctx.beginPath(); roundRect(ctx, x, y, s, s, 2);
    if (c.on) { ctx.fillStyle = GEM_HEX[c.ch]; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#fff'; ctx.stroke(); }
    else { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = GEM_HEX[c.ch]; ctx.stroke(); }
    x += s + gap;
  }
  if (broken) text(ctx, '已破盾', cx + total / 2 + 4, y + 6, { size: 12, align: 'left', color: '#8ff0ff' });
}

// 倒计时圆章；剩 1 时变红并跳动
export function drawCountdown(ctx, x, y, n, t) {
  const danger = n <= 1;
  const pulse = danger ? 1 + Math.sin(t * 9) * 0.1 : 1;
  ctx.save(); ctx.translate(x, y); ctx.scale(pulse, pulse);
  ctx.beginPath(); ctx.arc(0, 0, 13, 0, Math.PI * 2);
  ctx.fillStyle = danger ? '#d8322a' : '#2d3a52'; ctx.fill();
  ctx.lineWidth = 2.5; ctx.strokeStyle = danger ? '#ffd0c8' : '#a9b8d8'; ctx.stroke();
  ctx.restore();
  text(ctx, String(n), x, y + 1, { size: 16, align: 'center', outline: null, weight: 800 });
}

// 心：支持半颗
export function drawHearts(ctx, x, y, hearts, max, size = 9) {
  for (let i = 0; i < max; i++) {
    const cx = x + i * (size * 2.8), full = hearts >= i + 1, half = !full && hearts >= i + 0.5;
    heartPath(ctx, cx, y, size);
    ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill();
    if (full || half) {
      ctx.save(); heartPath(ctx, cx, y, size); ctx.clip();
      ctx.fillStyle = '#ff4d5e'; ctx.fillRect(cx - size * 1.6, y - size * 1.4, full ? size * 3.2 : size * 1.6, size * 3);
      ctx.restore();
    }
    heartPath(ctx, cx, y, size); ctx.lineWidth = 2; ctx.strokeStyle = '#fff0f0'; ctx.stroke();
  }
}
