import { CARD_W, CARD_H } from './cards.js';

// 手牌排成一道弧：中间高、两边低并外倾。
export function handPos(i, n) {
  const mid = (n - 1) / 2, d = i - mid;
  const spacing = Math.min(74, 380 / Math.max(1, n));
  return { x: 480 + d * spacing, y: 496 + d * d * 4.5, rot: d * 0.085, s: 1 };
}
// 点 (px,py) 是否落在一张摆在 pos 上的牌里
export function cardHitTest(pos, px, py) {
  const dx = px - pos.x, dy = py - pos.y;
  const c = Math.cos(-pos.rot), s = Math.sin(-pos.rot);
  const lx = (dx * c - dy * s) / pos.s, ly = (dx * s + dy * c) / pos.s;
  return Math.abs(lx) <= CARD_W / 2 && Math.abs(ly) <= CARD_H / 2;
}
