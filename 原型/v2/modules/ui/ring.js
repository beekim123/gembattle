import { WHEEL_HEX, WHEEL_DARK } from './theme.js';
import { text } from './draw.js';

// 集色环：六色按色环顺序从正上方顺时针排，白在圆心。lit = 已集，cursor = 链尾色。
export function drawColorRing(ctx, cx, cy, R, collected, cursor, t) {
  const pos = i => { const a = -Math.PI / 2 + i * Math.PI / 3; return [cx + Math.cos(a) * R, cy + Math.sin(a) * R]; };
  ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2; ctx.stroke();
  for (let i = 0; i < 6; i++) {
    const [x, y] = pos(i), on = (collected >> i) & 1;
    if (on) { ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.globalAlpha = 0.28; ctx.fillStyle = WHEEL_HEX[i]; ctx.fill(); ctx.globalAlpha = 1; }   // 已集的色：外面垫一圈淡色
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = on ? WHEEL_HEX[i] : 'rgba(0,0,0,0.4)';
    ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = on ? '#fff' : WHEEL_DARK[i]; ctx.stroke();
  }
  ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2);
  ctx.fillStyle = cursor === 6 ? '#fffbe0' : 'rgba(255,255,255,0.28)'; ctx.fill();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  if (cursor >= 0 && cursor < 6) {
    const [x, y] = pos(cursor);
    ctx.beginPath(); ctx.arc(x, y, 13 + Math.sin(t * 5) * 1.2, 0, Math.PI * 2);
    ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 2.5; ctx.stroke();
  }
  const n = [0, 1, 2, 3, 4, 5].filter(i => (collected >> i) & 1).length;
  text(ctx, `集色 ${n}/6`, cx, cy + R + 22, { size: 13, align: 'center' });
}
