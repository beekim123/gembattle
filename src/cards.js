'use strict';
// 像素牌面：22×31 的小图按整数倍放大；牌名用普通字体写在牌上。
// 颜色序号跟 rules.js 一样：0 红 1 黄 2 绿 3 青 4 蓝 5 紫 6 白；-1 无色。
const CARD_COL = [[232, 86, 72], [234, 198, 86], [98, 208, 122], [92, 208, 208], [98, 142, 242], [192, 114, 226], [238, 238, 238], [150, 150, 160]];
const LAMP_COL = [[237, 134, 106], [228, 186, 102], [132, 201, 157], [123, 209, 208], [131, 169, 237], [201, 158, 215]];
const cardCol = c => c.col >= 0 ? CARD_COL[c.col] : CARD_COL[7];
const cardArtCache = new Map();
const GEM_PAT = ['00100', '01220', '12223', '02230', '00300'];
const GEM_COLORS_PIX = [[236, 84, 72], [88, 220, 120], [86, 140, 250]];

function pix(g, x, y, c) { g.fillStyle = rgba(c); g.fillRect(x, y, 1, 1); }
function pixGem(g, cx, cy, c) {
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const k = GEM_PAT[y][x]; if (k === '0') continue;
    pix(g, cx - 2 + x, cy - 2 + y, k === '1' ? mix(c, [255, 255, 255], .6) : k === '2' ? c : mix(c, [0, 0, 0], .45));
  }
}
const ring = (g, cx, cy, r, c, n = 24) => { for (let a = 0; a < n; a++) pix(g, Math.round(cx + Math.cos(a / n * TAU) * r), Math.round(cy + Math.sin(a / n * TAU) * r), c); };
// 无色牌的小图标，画在拱形窗里（中心大约 11,12）
const SPELL_ICON = {
  block(g) {   // 一面圆盾
    for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) { const d = Math.hypot(x, y); if (d < 5.4) pix(g, 11 + x, 12 + y, d > 4.2 ? [214, 170, 110] : d < 1.5 ? [240, 214, 160] : [120, 92, 70]); }
  },
  lens(g) { ring(g, 10, 11, 4, [210, 220, 236]); for (let i = 0; i < 4; i++) pix(g, 13 + i, 14 + i, [150, 120, 90]); pix(g, 9, 10, [255, 255, 255]); },
  parrot(g) {   // 两张叠着的牌
    for (let y = 0; y < 9; y++) for (let x = 0; x < 6; x++) { pix(g, 6 + x, 7 + y, x === 0 || y === 0 || x === 5 || y === 8 ? [170, 170, 190] : [40, 40, 54]); pix(g, 11 + x, 10 + y, x === 0 || y === 0 || x === 5 || y === 8 ? [230, 230, 240] : [60, 60, 76]); }
  },
  contra(g) { for (let y = -5; y <= 5; y++) for (let x = -5; x <= 5; x++) if (Math.hypot(x, y) < 5.4) pix(g, 11 + x, 12 + y, x < 0 ? [236, 236, 240] : [34, 34, 44]); ring(g, 11, 12, 5, [150, 150, 164]); },
  beans(g) { for (const [x, y] of [[6, 8], [11, 7], [15, 10], [8, 12], [13, 14], [6, 16], [16, 16], [10, 17]]) { pix(g, x, y, [226, 196, 130]); pix(g, x + 1, y, [176, 140, 86]); } },
  draw(g) {   // 一张牌 + 往上的箭头
    for (let y = 0; y < 9; y++) for (let x = 0; x < 6; x++) pix(g, 8 + x, 10 + y, x === 0 || y === 0 || x === 5 || y === 8 ? [214, 186, 130] : [44, 40, 40]);
    for (let i = 0; i < 4; i++) pix(g, 15, 6 + i, [240, 220, 170]); pix(g, 14, 7, [240, 220, 170]); pix(g, 16, 7, [240, 220, 170]);
  },
  stall(g) {   // 沙漏
    for (let y = 0; y < 11; y++) { const w = Math.abs(y - 5); for (let x = -w; x <= w; x++) pix(g, 11 + x, 7 + y, y === 0 || y === 10 ? [176, 140, 96] : (y > 5 && Math.abs(x) < w) ? [226, 200, 140] : Math.abs(x) === w ? [190, 196, 210] : [36, 36, 46]); }
  },
  family(g) { for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + i / 6 * TAU, x = Math.round(11 + Math.cos(a) * 4.5), y = Math.round(12 + Math.sin(a) * 4.5); pix(g, x, y, LAMP_COL[i]); pix(g, x + 1, y, LAMP_COL[i]); pix(g, x, y + 1, LAMP_COL[i]); pix(g, x + 1, y + 1, mix(LAMP_COL[i], [255, 255, 255], .4)); } },
  spore(g) { for (const [x, y, s] of [[7, 9, 2], [13, 8, 3], [9, 14, 3], [15, 15, 2], [11, 12, 1]]) for (let i = 0; i < s; i++) for (let j = 0; j < s; j++) pix(g, x + i, y + j, (i + j) % 2 ? [96, 104, 84] : [130, 138, 110]); },
};
// 宝石牌的词：左上角一个小记号
const TAG_MARK = {
  双响(g, c) { pix(g, 3, 3, c); pix(g, 5, 3, c); },
  垫脚(g, c) { pix(g, 3, 4, c); pix(g, 4, 3, c); pix(g, 5, 4, c); },
  开花(g, c) { pix(g, 4, 2, c); pix(g, 3, 3, c); pix(g, 5, 3, c); pix(g, 4, 4, c); pix(g, 4, 3, [255, 255, 255]); },
  稳(g, c) { pix(g, 3, 4, c); pix(g, 4, 4, c); pix(g, 5, 4, c); pix(g, 4, 3, c); },
};
function cardArt(card) {
  const key = card.id;
  if (cardArtCache.has(key)) return cardArtCache.get(key);
  const c = document.createElement('canvas'); c.width = 22; c.height = 31;
  const g = c.getContext('2d');
  const col = cardCol(card);
  let edge = card.instant ? [196, 150, 92] : card.junk ? [92, 98, 84] : card.kind === 'gem' ? mix(col, [40, 40, 48], .25) : [128, 132, 150];
  if (card.up) edge = mix(edge, [255, 244, 210], .35);
  g.fillStyle = rgba(edge); g.fillRect(0, 0, 22, 31);
  g.fillStyle = 'rgb(18,18,24)'; g.fillRect(1, 1, 20, 29);
  // 拱形窗
  g.fillStyle = rgba(mix([30, 32, 42], col, card.kind === 'gem' ? .14 : .05)); g.fillRect(3, 5, 16, 15); g.fillRect(4, 4, 14, 1); g.fillRect(6, 3, 10, 1);
  g.fillStyle = 'rgb(12,12,16)'; g.fillRect(1, 22, 20, 8);
  for (const [x, y] of [[1, 1], [20, 1], [1, 29], [20, 29]]) pix(g, x, y, edge);
  if (card.kind === 'gem') {
    const gems = [0, 1, 2].filter(j => card.mask >> j & 1).map(j => GEM_COLORS_PIX[j]);
    const spots = gems.length === 1 ? [[11, 12]] : gems.length === 2 ? [[8, 10], [14, 14]] : [[11, 8], [7, 15], [15, 15]];
    gems.forEach((gc, i) => pixGem(g, spots[i][0], spots[i][1], gc));
    if (card.tag && TAG_MARK[card.tag]) TAG_MARK[card.tag](g, [255, 236, 190]);
  } else if (SPELL_ICON[card.key]) SPELL_ICON[card.key](g);
  if (card.up) { pix(g, 17, 3, [255, 240, 190]); pix(g, 16, 3, [255, 240, 190]); pix(g, 18, 3, [255, 240, 190]); pix(g, 17, 2, [255, 240, 190]); pix(g, 17, 4, [255, 240, 190]); }
  cardArtCache.set(key, c);
  return c;
}

// 在界面层画一张牌。x, y 是中心。
function drawCard(ctx, card, x, y, w, h, o = {}) {
  ctx.save();
  ctx.translate(x, y); ctx.rotate(o.rot || 0);
  ctx.globalAlpha = o.alpha ?? 1;
  if (o.glow) {
    ctx.shadowColor = rgba(o.glow, .9); ctx.shadowBlur = o.strong ? 22 : 14;
    ctx.fillStyle = rgba(o.glow, .9); ctx.fillRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
    ctx.shadowBlur = 0;
  }
  if (o.rainbow) {
    const gr = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
    LAMP_COL.forEach((c, i) => gr.addColorStop(i / 5, rgba(c)));
    ctx.fillStyle = gr; ctx.fillRect(-w / 2 - 3, -h / 2 - 3, w + 6, h + 6);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(cardArt(card), -w / 2, -h / 2, w, h);
  ctx.fillStyle = card.up ? '#fff0c8' : '#e8e2d4';
  let fs = Math.round(h * .1);
  ctx.font = `600 ${fs}px "PingFang SC",sans-serif`;
  const tw = ctx.measureText(card.name).width;
  if (tw > w * .84) { fs = Math.max(8, Math.floor(fs * w * .84 / tw)); ctx.font = `600 ${fs}px "PingFang SC",sans-serif`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(card.name, 0, h * .37);
  if (o.dim) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-w / 2, -h / 2, w, h); }
  if (o.hi) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2, -h / 2, w, h); }
  ctx.restore();
}
