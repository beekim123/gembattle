'use strict';
// 像素牌面：22×31 的小图放大 4 倍；牌名用普通字体写在牌上。
const CARD_COL = [[232, 86, 72], [234, 198, 86], [98, 208, 122], [92, 208, 208], [98, 142, 242], [192, 114, 226], [238, 238, 238], [206, 168, 255], [136, 136, 148]];
const LAMP_COL = [[237, 134, 106], [228, 186, 102], [132, 201, 157], [123, 209, 208], [131, 169, 237], [201, 158, 215]];
const cardArtCache = new Map();
const GEM_PAT = ['00100', '01220', '12223', '02230', '00300'];

function pix(g, x, y, c) { g.fillStyle = rgba(c); g.fillRect(x, y, 1, 1); }
function pixGem(g, cx, cy, c) {
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    const k = GEM_PAT[y][x]; if (k === '0') continue;
    pix(g, cx - 2 + x, cy - 2 + y, k === '1' ? mix(c, [255, 255, 255], .6) : k === '2' ? c : mix(c, [0, 0, 0], .45));
  }
}
function cardArt(card) {
  const key = card.id + ':' + card.col;
  if (cardArtCache.has(key)) return cardArtCache.get(key);
  const c = document.createElement('canvas'); c.width = 22; c.height = 31;
  const g = c.getContext('2d');
  const col = CARD_COL[card.col] || CARD_COL[8];
  const edge = card.instant ? [196, 132, 72] : mix(col, [40, 40, 48], .25);
  g.fillStyle = rgba(edge); g.fillRect(0, 0, 22, 31);
  g.fillStyle = 'rgb(18,18,24)'; g.fillRect(1, 1, 20, 29);
  // 拱形窗
  g.fillStyle = rgba(mix([30, 32, 42], col, .12)); g.fillRect(3, 5, 16, 15); g.fillRect(4, 4, 14, 1); g.fillRect(6, 3, 10, 1);
  g.fillStyle = 'rgb(12,12,16)'; g.fillRect(1, 22, 20, 8);
  // 四角
  for (const [x, y] of [[1, 1], [20, 1], [1, 29], [20, 29]]) pix(g, x, y, edge);
  if (card.id === 'gem') {
    const gems = [0, 1, 2].filter(j => card.vals[j]).map(j => GEM_COLORS_PIX[j]);
    const spots = gems.length === 1 ? [[11, 12]] : gems.length === 2 ? [[8, 10], [14, 14]] : [[11, 8], [7, 15], [15, 15]];
    gems.forEach((gc, i) => pixGem(g, spots[i][0], spots[i][1], gc));
  } else {
    const ic = col;
    if (card.id === 'lens') { for (let a = 0; a < 24; a++) pix(g, Math.round(11 + Math.cos(a / 24 * TAU) * 5), Math.round(12 + Math.sin(a / 24 * TAU) * 5), ic); pixGem(g, 11, 12, GEM_COLORS_PIX[2]); }
    if (card.id === 'rain') for (const [x, y] of [[7, 9], [12, 7], [15, 12], [9, 14]]) { pix(g, x, y, [255, 220, 140]); pix(g, x, y + 1, ic); pix(g, x - 1, y + 2, ic); pix(g, x, y + 2, ic); pix(g, x, y + 3, mix(ic, [0, 0, 0], .4)); }
    if (card.id === 'light') { for (let i = -4; i <= 4; i++) { pix(g, 11 + i, 12, [250, 214, 120]); pix(g, 11, 12 + i, [250, 214, 120]); } for (const d of [-2, 2]) { pix(g, 11 + d, 12 + d, [255, 240, 190]); pix(g, 11 + d, 12 - d, [255, 240, 190]); } pix(g, 11, 12, [255, 255, 255]); }
    if (card.id === 'mirror') { for (let y = 6; y < 19; y++) for (let x = 6; x < 17; x++) pix(g, x, y, x < 11 + (y % 2) ? [220, 220, 230] : [40, 40, 54]); }
    if (card.id === 'ice') for (let i = 0; i < 11; i++) { pix(g, 6 + i, 17 - i, [170, 230, 255]); if (i > 7) pix(g, 7 + i, 17 - i, [230, 250, 255]); }
    if (card.id === 'shield') for (let y = 6; y < 19; y++) { const w = y < 14 ? 5 : 5 - (y - 13); for (let x = -w; x <= w; x++) pix(g, 11 + x, y, Math.abs(x) === w || y === 6 ? [214, 160, 96] : [120, 96, 76]); }
  }
  cardArtCache.set(key, c);
  return c;
}
const GEM_COLORS_PIX = [[236, 84, 72], [88, 220, 120], [86, 140, 250]];

// 在 UI 层画一张牌。x,y 是中心。
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
  ctx.fillStyle = '#e8e2d4';
  ctx.font = `600 ${Math.round(h * .095)}px "PingFang SC",sans-serif`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(card.name, 0, h * .37);
  if (o.dim) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-w / 2, -h / 2, w, h); }
  if (o.hi) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2, -h / 2, w, h); }
  ctx.restore();
}
