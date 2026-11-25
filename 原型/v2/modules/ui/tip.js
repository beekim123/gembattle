import { text, wrap } from './draw.js';
import { drawPanel } from './skin.js';
import { GOLD } from './theme.js';

// 悬停说明框：第一行是标题（金色），后面逐行折行显示。x、y 是左上角；给了 bottomY 就把框的下沿放在那里。返回框高。
// 战斗、路线图、行商、牌组共用这一份。
export function drawTip(ctx, lines, x, y, w, bottomY = null) {
  const wrapped = lines.map((ln, k) => wrap(ctx, ln, w - 16, k === 0 ? 14 : 12));
  const h = 14 + wrapped.reduce((a, l) => a + l.length, 0) * 17;
  if (bottomY !== null) y = bottomY - h;
  drawPanel(ctx, x, y, w, h, 'tooltip');
  let yy = y + 15;
  wrapped.forEach((ls, k) => ls.forEach(l => { text(ctx, l, x + 8, yy, { size: k === 0 ? 14 : 12, align: 'left', weight: k === 0 ? 800 : 500, color: k === 0 ? GOLD : '#fff', outline: null }); yy += 17; }));
  return h;
}
