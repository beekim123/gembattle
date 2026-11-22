'use strict';
// 像素字：伤害数字、施法总数、倍率、倒计时这些「数」用的点阵字。
// 数字和符号是手画的 6×8 粗笔画，万 / 亿也手画；别的字（兆、京、躲开……）用系统字体小号画一遍再描成点阵。
// pixText(ctx, 文字, x, y, ps, 颜色, { align, outline, flat }) —— ps = 一个字点占几个界面像素。
// 画的时候先画在一张草稿图上（真像素对齐），再整张贴上去：任何缩放下都方正，半透明也不会一块深一块浅。
const PF_SRC = {
  '0': ['.####.', '##..##', '##..##', '##..##', '##..##', '##..##', '##..##', '.####.'],
  '1': ['..##..', '.###..', '####..', '..##..', '..##..', '..##..', '..##..', '######'],
  '2': ['.####.', '##..##', '....##', '...##.', '..##..', '.##...', '##....', '######'],
  '3': ['.####.', '##..##', '....##', '..###.', '....##', '....##', '##..##', '.####.'],
  '4': ['...###', '..####', '.##.##', '##..##', '######', '....##', '....##', '....##'],
  '5': ['######', '##....', '#####.', '....##', '....##', '....##', '##..##', '.####.'],
  '6': ['..###.', '.##...', '##....', '#####.', '##..##', '##..##', '##..##', '.####.'],
  '7': ['######', '##..##', '....##', '...##.', '..##..', '..##..', '..##..', '..##..'],
  '8': ['.####.', '##..##', '##..##', '.####.', '##..##', '##..##', '##..##', '.####.'],
  '9': ['.####.', '##..##', '##..##', '##..##', '.#####', '....##', '...##.', '.###..'],
  '.': ['..', '..', '..', '..', '..', '..', '##', '##'],
  '×': ['......', '......', '##..##', '.####.', '..##..', '.####.', '##..##', '......'],
  '+': ['......', '..##..', '..##..', '######', '######', '..##..', '..##..', '......'],
  '-': ['.....', '.....', '.....', '#####', '#####', '.....', '.....', '.....'],
  '/': ['....##', '....##', '...##.', '..##..', '..##..', '.##...', '##....', '##....'],
  '?': ['.####.', '##..##', '....##', '...##.', '..##..', '..##..', '......', '..##..'],
  ' ': ['...', '...', '...', '...', '...', '...', '...', '...'],
  '万': ['########', '..##....', '..######', '..##..##', '.##...##', '.##...##', '##....##', '##..###.'],
  '亿': ['..##.....', '.##.#####', '##.....##', '##....##.', '.##..##..', '.##.##...', '.##.##..#', '.##.#####'],
};
PF_SRC.x = PF_SRC['×']; PF_SRC['？'] = PF_SRC['?'];
const PF = new Map();
function pfParse(rows) { const px = []; rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') px.push([x, y]); })); return { w: rows[0].length, h: rows.length, px }; }
for (const [ch, rows] of Object.entries(PF_SRC)) PF.set(ch, pfParse(rows));
// 没手画的字：系统字体 10px 画一遍，按透明度描成点阵（汉字 10 行高，比数字高一点，竖着居中对齐）
const PF_RC = document.createElement('canvas'); PF_RC.width = PF_RC.height = 16;
function pfGlyph(ch) {
  const known = PF.get(ch); if (known) return known;
  const c = PF_RC.getContext('2d', { willReadFrequently: true });
  c.clearRect(0, 0, 16, 16); c.fillStyle = '#fff'; c.font = '700 11px "PingFang SC",sans-serif'; c.textBaseline = 'alphabetic'; c.textAlign = 'left';
  c.fillText(ch, 1, 11);
  const d = c.getImageData(0, 0, 16, 16).data, pts = [];
  let x0 = 16, x1 = -1, y0 = 16, y1 = -1;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if (d[(y * 16 + x) * 4 + 3] > 120) { pts.push([x, y]); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const g = pts.length ? { w: x1 - x0 + 1, h: y1 - y0 + 1, px: pts.map(([x, y]) => [x - x0, y - y0]) } : { w: 4, h: 8, px: [] };
  PF.set(ch, g);
  return g;
}
const PF_SCR = document.createElement('canvas'), pfx = PF_SCR.getContext('2d');
// 量一下多宽（界面像素）
function pixWidth(str, ps) { const gs = [...String(str)].map(pfGlyph); return (gs.reduce((s, g) => s + g.w, 0) + Math.max(0, gs.length - 1) + 2) * ps; }
// fill：[r,g,b] 或者 (u, 行, 总行数) => [r,g,b]（u = 从左到右 0~1，彩虹字用）
function pixText(ctx, str, x, y, ps, fill, o = {}) {
  const T = ctx.getTransform(), dp = Math.max(1, Math.round(ps * T.a));
  const gs = [...String(str)].map(pfGlyph), gap = 1, ol = o.outline === false ? 0 : 1;
  const wpx = gs.reduce((s, g) => s + g.w, 0) + gap * Math.max(0, gs.length - 1), hpx = Math.max(8, ...gs.map(g => g.h));
  const cw = (wpx + ol * 2) * dp, ch = (hpx + ol * 2 + (o.shadow ? 1 : 0)) * dp;
  if (PF_SCR.width < cw || PF_SCR.height < ch) { PF_SCR.width = Math.max(cw, PF_SCR.width); PF_SCR.height = Math.max(ch, PF_SCR.height); }
  pfx.setTransform(1, 0, 0, 1, 0, 0); pfx.clearRect(0, 0, cw, ch);
  const each = fn => { let gx = ol; for (const g of gs) { const oy = ol + Math.floor((hpx - g.h) / 2); for (const [px, py] of g.px) fn(gx + px, oy + py); gx += g.w + gap; } };
  if (ol) {   // 一圈深色描边（一个字点粗）；shadow 再往下多垫一行
    pfx.fillStyle = o.outlineCol || '#0b090d';
    each((X, Y) => pfx.fillRect((X - 1) * dp, (Y - 1) * dp, dp * 3, dp * (o.shadow ? 4 : 3)));
  }
  const flat = o.flat || typeof fill === 'function';
  each((X, Y) => {
    const row = Y - ol;
    let c = typeof fill === 'function' ? fill((X - ol) / Math.max(1, wpx - 1), row, hpx) : fill;
    if (!flat) c = row <= 1 ? mix(c, [255, 255, 255], .38) : row >= hpx - 2 ? mix(c, [0, 0, 0], .2) : c;   // 顶上两行亮一点、底下暗一点，像素游戏的数字味儿
    pfx.fillStyle = rgba(c); pfx.fillRect(X * dp, Y * dp, dp, dp);
  });
  const ax = o.align === 'left' ? 0 : o.align === 'right' ? 1 : .5;
  const devX = Math.round(T.a * x + T.e - cw * ax), devY = Math.round(T.d * y + T.f - (hpx + ol * 2) * dp / 2);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(PF_SCR, 0, 0, cw, ch, devX, devY, cw, ch);
  ctx.restore();
  return cw / T.a;
}
// 彩虹字的颜色：从左到右走一遍六色
const pixRainbow = u => { const f = clamp(u, 0, 1) * 5, i = Math.min(4, Math.floor(f)); return mix(mix(LAMP_COL[i], LAMP_COL[i + 1], f - i), [255, 255, 255], .2); };
