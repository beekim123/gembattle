'use strict';
// 像素牌面：44×62 的点阵（手牌正好 2 倍）；框、画框、宝石、小图都按点画，牌名用普通字体写在名牌上。
// 颜色序号跟 rules.js 一样：0 红 1 黄 2 绿 3 青 4 蓝 5 紫 6 白；-1 无色。
const CARD_COL = [[232, 86, 72], [234, 198, 86], [98, 208, 122], [92, 208, 208], [98, 142, 242], [192, 114, 226], [238, 238, 238], [150, 150, 160]];
const LAMP_COL = [[237, 134, 106], [228, 186, 102], [132, 201, 157], [123, 209, 208], [131, 169, 237], [201, 158, 215]];
const cardCol = c => c.col >= 0 ? CARD_COL[c.col] : CARD_COL[7];
const cardArtCache = new Map();
const WHITE = [255, 255, 255], BLACK = [0, 0, 0];
const CA_W = 44, CA_H = 62;   // 牌面点阵：手牌 88×124 正好 2 倍，奖励的大牌 132×186 正好 3 倍
const GEM_COLORS_PIX = [[236, 84, 72], [88, 220, 120], [86, 140, 250]];

function pix(g, x, y, c) { g.fillStyle = rgba(c); g.fillRect(x, y, 1, 1); }
const box = (g, x, y, w, h, c) => { g.fillStyle = rgba(c); g.fillRect(x, y, w, h); };
function disc(g, cx, cy, r, fn) { for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) { const d = Math.hypot(x - cx, y - cy); if (d <= r) { const c = fn(x - cx, y - cy, d); if (c) pix(g, x, y, c); } } }
function line(g, x0, y0, x1, y1, c, w = 1) { const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2); for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t - (w - 1) / 2, y = y0 + (y1 - y0) * t - (w - 1) / 2; for (let a = 0; a < w; a++) for (let b = 0; b < w; b++) pix(g, Math.round(x + a), Math.round(y + b), c); } }
// 3×5 的小数字：牌左上角的点数
const TINY = { '0': ['###', '#.#', '#.#', '#.#', '###'], '1': ['.#.', '##.', '.#.', '.#.', '###'], '2': ['###', '..#', '###', '#..', '###'], '3': ['###', '..#', '.##', '..#', '###'], '4': ['#.#', '#.#', '###', '..#', '..#'], '5': ['###', '#..', '###', '..#', '###'], '6': ['###', '#..', '###', '#.#', '###'], '7': ['###', '..#', '.#.', '.#.', '.#.'], '8': ['###', '#.#', '###', '#.#', '###'], '9': ['###', '#.#', '###', '..#', '###'] };
function tinyText(g, s, x, y, c) { for (const ch of s) { const t = TINY[ch]; if (t) t.forEach((r, j) => [...r].forEach((k, i) => { if (k === '#') pix(g, x + i, y + j, c); })); x += 4; } }

// 一颗切面宝石（上面平顶的冠、下面尖的亭，左上亮右下暗，一圈深色描边）。R = 半宽
const GEM_SPR = new Map();
function gemSprite(R, c) {
  const key = R + ':' + c.join(','); if (GEM_SPR.has(key)) return GEM_SPR.get(key);
  const crownH = Math.max(2, Math.round(R * .55)), pavH = Math.round(R * 1.15), top = Math.max(1, Math.round(R * .5));
  const cells = new Map();
  for (let y = -crownH; y <= pavH; y++) {
    const hw = y <= 0 ? top + (R - top) * (y + crownH) / crownH : R * (1 - y / (pavH + 1));
    for (let x = -R; x <= R; x++) {
      if (Math.abs(x) > hw + .3) continue;
      let k;
      if (y < 0) k = Math.abs(x) <= Math.max(1, top - 1) && y < -1 ? mix(c, WHITE, .55) : x < 0 ? mix(c, WHITE, .28) : mix(c, WHITE, .05);
      else if (y === 0) k = mix(c, WHITE, .22);
      else { const b = (1 - y / pavH) * R * .5; k = x < -b ? mix(c, BLACK, .06) : x < 0 ? mix(c, WHITE, .16) : x < b ? mix(c, BLACK, .26) : mix(c, BLACK, .46); }
      cells.set(x + ',' + y, k);
    }
  }
  const W = R * 2 + 3, H = crownH + pavH + 3, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d'), ox = R + 1, oy = crownH + 1, edge = mix(c, BLACK, .72);
  for (let y = -crownH - 1; y <= pavH + 1; y++) for (let x = -R - 1; x <= R + 1; x++) {
    const k = cells.get(x + ',' + y);
    if (k) pix(g, ox + x, oy + y, k);
    else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => cells.has((x + a) + ',' + (y + b)))) pix(g, ox + x, oy + y, edge);
  }
  pix(g, ox - top, oy - crownH + 1, WHITE);   // 一点高光
  const out = { cv, ox, oy }; GEM_SPR.set(key, out); return out;
}
function putGem(g, cx, cy, R, c) { const s = gemSprite(R, c); g.drawImage(s.cv, Math.round(cx - s.ox), Math.round(cy - s.oy)); }

// 无色牌的图：画在画框里（画框 x 5~38、y 12~39，中心大约 21.5, 25.5）
const WC = [21.5, 25.5];
const SPELL_ICON = {
  block(g) {   // 圆木盾：铁箍、木板、中间一颗铜钉
    disc(g, 21.5, 25.5, 10.6, (x, y, d) => d > 8.7 ? (x + y < 0 ? [222, 190, 132] : [138, 104, 66]) : d < 2.7 ? (x + y < -1 ? [252, 230, 176] : [190, 152, 98]) : (Math.floor((x + 21) / 3) % 2 ? [122, 88, 60] : [102, 72, 50]));
    for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + TAU / 8; pix(g, Math.round(21.5 + Math.cos(a) * 7), Math.round(25.5 + Math.sin(a) * 7), [236, 214, 160]); }
  },
  lens(g) {   // 放大镜：铁圈、发青的镜片、木头把
    line(g, 25, 30, 32, 37, [74, 50, 32], 4); line(g, 25, 30, 31, 36, [156, 112, 70], 2);
    disc(g, 19.5, 23.5, 8, (x, y, d) => d > 6.2 ? (x + y < 0 ? [222, 228, 240] : [120, 126, 146]) : (Math.abs(d - 4.2) < .7 && x < 0 && y < 0 ? [210, 240, 250] : [60, 104, 126]));
  },
  parrot(g) {   // 学舌：后面一张暗的，前面一张亮的，一道回头的箭头
    const card = (x, y, f, k, gem) => { box(g, x, y, 11, 15, f); box(g, x + 1, y + 1, 9, 13, k); putGem(g, x + 5.5, y + 6.5, 2, gem); };
    card(12, 15, [110, 110, 130], [34, 34, 46], mix(GEM_COLORS_PIX[0], [40, 40, 50], .5));
    card(20, 20, [226, 226, 240], [52, 52, 70], GEM_COLORS_PIX[0]);
    for (let i = 0; i <= 8; i++) { const a = Math.PI * (1.05 + i / 8 * .9); pix(g, Math.round(24 + Math.cos(a) * 6), Math.round(17 + Math.sin(a) * 4), [255, 226, 150]); }
    pix(g, 29, 16, [255, 226, 150]); pix(g, 29, 18, [255, 226, 150]); pix(g, 28, 17, [255, 226, 150]);
  },
  contra(g) {   // 唱反调：一半白一半黑，白里一点红、黑里一点青
    disc(g, 21.5, 25.5, 9.6, (x, y, d) => d > 8.6 ? [150, 150, 166] : x < 2.6 * Math.sin(y / 9.6 * Math.PI) ? [236, 236, 242] : [30, 30, 40]);
    disc(g, 18.5, 21.5, 1.6, () => GEM_COLORS_PIX[0]); disc(g, 24.5, 29.5, 1.6, () => [92, 208, 208]);
  },
  beans(g) {   // 撒豆：一把豆子撒成一道弧
    for (const [x, y] of [[11, 31], [14, 26], [18, 22], [23, 20], [28, 22], [31, 27], [33, 32], [20, 30], [26, 33]]) {
      disc(g, x, y, 1.9, (dx, dy) => dx + dy < -1 ? [252, 232, 182] : dx + dy > 1 ? [156, 120, 72] : [226, 196, 130]);
      pix(g, x + 1, y, [96, 70, 44]);
    }
  },
  draw(g) {   // 摸牌：一张牌，旁边一个往上的箭头
    box(g, 11, 18, 13, 18, [214, 186, 130]); box(g, 12, 19, 11, 16, [44, 40, 42]); putGem(g, 17.5, 26, 3, GEM_COLORS_PIX[2]);
    box(g, 29, 18, 2, 14, [240, 220, 170]); for (let i = 0; i < 4; i++) box(g, 30 - i, 15 + i, 2 + i * 2 - 1, 1, [240, 220, 170]);
  },
  stall(g) {   // 打岔：沙漏
    box(g, 13, 13, 18, 2, [150, 108, 66]); box(g, 13, 37, 18, 2, [150, 108, 66]);
    for (let y = 15; y < 37; y++) { const w = 1.2 + Math.abs(y - 25.8) * .62; for (let x = Math.round(21.5 - w); x <= Math.round(21.5 + w); x++) { const edge = Math.abs(x - 21.5) > w - 1; pix(g, x, y, edge ? [190, 198, 214] : (y > 30 || (y > 18 && y < 22)) ? [228, 200, 140] : [34, 34, 46]); } }
    pix(g, 21, 26, [228, 200, 140]); pix(g, 22, 28, [228, 200, 140]);
  },
  family(g) {   // 全家福：一个相框，里面六个人头（六种颜色）
    box(g, 9, 15, 26, 21, [196, 156, 96]); box(g, 9, 15, 26, 1, [236, 206, 150]); box(g, 11, 17, 22, 17, [36, 32, 42]);
    for (let i = 0; i < 6; i++) { const x = 15 + (i % 3) * 7, y = 22 + Math.floor(i / 3) * 7, c = LAMP_COL[i]; disc(g, x, y, 1.8, () => c); box(g, x - 2, y + 2, 5, 2, mix(c, BLACK, .4)); }
  },
  follow(g) {   // 跟屁虫：大的在前头走，小的在后头跟，地上一串脚印
    const man = (x, y, k, c) => { disc(g, x, y, 1.8 * k, () => c); line(g, x, y + 2 * k, x, y + 7 * k, c, 2); line(g, x, y + 7 * k, x - 2 * k, y + 11 * k, c, 2); line(g, x, y + 7 * k, x + 2 * k, y + 11 * k, c, 2); line(g, x - 3 * k, y + 4 * k, x + 3 * k, y + 4 * k, c); };
    man(27, 16, 1.25, [236, 218, 172]); man(15, 23, .85, [172, 152, 118]);
    for (const [x, y] of [[19, 36], [22, 34], [11, 37]]) pix(g, x, y, [110, 96, 76]);
  },
  stack(g) {   // 叠罗汉：三二一摞起来
    const man = (x, y, c) => { disc(g, x, y, 1.5, () => c); box(g, x - 1, y + 2, 3, 4, c); pix(g, x - 2, y + 3, c); pix(g, x + 2, y + 3, c); };
    for (let i = 0; i < 3; i++) man(14 + i * 7, 31, [166, 146, 114]);
    for (let i = 0; i < 2; i++) man(17.5 + i * 7, 24, [208, 188, 146]);
    man(21, 17, [255, 236, 190]);
  },
  spore(g) {   // 孢子：一朵灰绿的菌子，周围飘着孢子
    disc(g, 21.5, 26, 8, (x, y) => y > 0 ? null : (Math.hypot(x + 3, y + 4) < 1.5 || Math.hypot(x - 3, y + 2) < 1.2 ? [200, 206, 170] : y < -5 ? [140, 148, 110] : [112, 120, 90]));
    box(g, 20, 26, 3, 8, [196, 190, 168]);
    for (const [x, y] of [[10, 18], [33, 17], [13, 31], [31, 30], [27, 14], [16, 14]]) pix(g, x, y, [170, 190, 140]);
  },
};
// 宝石牌的词：牌底下正中一个小记号
const TAG_MARK = {
  双响(g, c) { box(g, 18, 52, 2, 4, c); box(g, 24, 52, 2, 4, c); pix(g, 20, 52, c); pix(g, 26, 52, c); },
  垫脚(g, c) { box(g, 18, 55, 3, 1, c); box(g, 20, 53, 3, 1, c); box(g, 22, 51, 3, 1, c); box(g, 20, 54, 1, 1, c); box(g, 22, 52, 1, 1, c); },
  开花(g, c) { pix(g, 21, 51, c); pix(g, 22, 51, c); pix(g, 19, 53, c); pix(g, 24, 53, c); pix(g, 21, 55, c); pix(g, 22, 55, c); box(g, 21, 53, 2, 1, WHITE); },
  稳(g, c) { box(g, 18, 55, 8, 1, c); box(g, 19, 53, 6, 2, c); box(g, 21, 51, 2, 2, c); },
};
// 牌框：外面一圈黑，框带上亮下暗（倒角），里面一圈深色细线，四角各钉一颗钉
function cardFrame(g, metal, panel, studs) {
  const W = CA_W, H = CA_H, hi = mix(metal, WHITE, .5), lo = mix(metal, BLACK, .42), dk = mix(metal, BLACK, .74);
  box(g, 0, 0, W, H, [10, 9, 12]); box(g, 1, 1, W - 2, H - 2, metal);
  box(g, 1, 1, W - 2, 1, hi); box(g, 1, 1, 1, H - 2, hi); box(g, 1, H - 2, W - 2, 1, lo); box(g, W - 2, 1, 1, H - 2, lo);
  box(g, 3, 3, W - 6, H - 6, dk); box(g, 4, 4, W - 8, H - 8, panel);
  for (const [x, y] of [[0, 0], [W - 1, 0], [0, H - 1], [W - 1, H - 1]]) g.clearRect(x, y, 1, 1);
  for (const [x, y] of [[2, 2], [W - 3, 2], [2, H - 3], [W - 3, H - 3]]) { pix(g, x, y, studs); }
}
// 画框：拱顶，里面从中间往外暗下去，再画一圈淡淡的法阵和几颗星点
function cardWindow(g, glow, dark, ringCol) {
  const x0 = 5, y0 = 12, w = 34, h = 28, cx = WC[0], cy = WC[1];
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
    const corner = (y - y0 < 3) && (Math.min(x - x0, x0 + w - 1 - x) < 3 - (y - y0));
    if (corner) continue;
    const r = Math.hypot((x + .5 - cx) / 17, (y + .5 - cy) / 14);
    let c = mix(glow, dark, smooth(clamp(r, 0, 1)));
    const rr = Math.hypot(x + .5 - cx, (y + .5 - cy) * 1.15);
    if (Math.abs(rr - 11.5) < .55) c = mix(c, ringCol, .55);                                         // 法阵的圈
    if (Math.abs(rr - 9) < .5 && Math.floor(Math.atan2(y - cy, x - cx) / TAU * 16 + 16) % 2) c = mix(c, ringCol, .3);   // 里面一圈虚线
    if (hash(x, y, 3, 91) < .025) c = mix(c, WHITE, .35);                                            // 星点
    pix(g, x, y, c);
  }
  // 画框的边：上亮下暗
  for (let x = x0; x < x0 + w; x++) { pix(g, x, y0 + h, mix(ringCol, BLACK, .5)); }
}
function cardArt(card) {
  const key = card.id;
  if (cardArtCache.has(key)) return cardArtCache.get(key);
  const c = document.createElement('canvas'); c.width = CA_W; c.height = CA_H;
  const g = c.getContext('2d'), col = cardCol(card), gem = card.kind === 'gem';
  let metal = gem ? mix(col, [70, 64, 60], .28) : card.junk ? [100, 110, 88] : card.rare ? [214, 172, 86] : card.instant ? [190, 140, 86] : [130, 142, 176];
  if (card.up) metal = mix(metal, [255, 222, 140], .42);
  const studs = card.up || card.rare ? [255, 236, 170] : mix(metal, WHITE, .65);
  const panel = gem ? mix([16, 15, 21], col, .1) : card.junk ? [18, 22, 16] : [17, 17, 24];
  cardFrame(g, metal, panel, studs);
  const glow = gem ? mix(col, [18, 18, 26], .5) : card.junk ? [52, 62, 44] : card.rare ? [96, 78, 44] : card.instant ? [86, 62, 40] : [58, 66, 96];
  cardWindow(g, glow, [12, 12, 18], gem ? mix(col, WHITE, .25) : mix(metal, WHITE, .2));
  // 顶上一条：宝石牌左边点数、右边几颗宝石；法术牌左边一个小符号
  if (gem) {
    const pts = String(card.pts), pw = pts.length * 4 + 3;
    box(g, 5, 5, pw + 1, 7, [8, 8, 12]); box(g, 5, 5, pw + 1, 1, mix(metal, WHITE, .3));
    tinyText(g, pts, 7, 6, card.up ? [255, 230, 150] : [246, 236, 210]);
    const gs = [0, 1, 2].filter(j => card.mask >> j & 1);
    gs.forEach((j, i) => putGem(g, 36 - (gs.length - 1 - i) * 6, 8, 2, GEM_COLORS_PIX[j]));
  } else {
    const k = mix(metal, WHITE, .4);
    if (card.instant) { line(g, 9, 5, 7, 8, k); line(g, 7, 8, 10, 8, k); line(g, 10, 8, 8, 11, k); }   // 马上用：一道闪电
    else { disc(g, 8.5, 8, 2.5, (x, y, d) => d > 1.6 ? k : null); pix(g, 8, 7, k); }                    // 法术：一个小圈
    if (card.rare) { pix(g, 36, 6, [255, 240, 190]); pix(g, 35, 7, [255, 240, 190]); pix(g, 37, 7, [255, 240, 190]); pix(g, 36, 8, [255, 240, 190]); pix(g, 36, 7, WHITE); }
  }
  // 画框里：宝石牌画宝石，法术牌画小图
  if (gem) {
    const gs = [0, 1, 2].filter(j => card.mask >> j & 1).map(j => GEM_COLORS_PIX[j]);
    if (gs.length === 3) disc(g, WC[0], WC[1], 9, (x, y, d) => d > 8.2 ? [214, 214, 226] : null);
    if (gs.length === 1) putGem(g, WC[0], WC[1] - 2, 8, gs[0]);
    else if (gs.length === 2) { putGem(g, WC[0] - 6, WC[1] - 3, 6, gs[0]); putGem(g, WC[0] + 6, WC[1], 6, gs[1]); }
    else { putGem(g, WC[0], WC[1] - 6, 5, gs[0]); putGem(g, WC[0] - 7, WC[1] + 3, 5, gs[1]); putGem(g, WC[0] + 7, WC[1] + 3, 5, gs[2]); }
  } else if (SPELL_ICON[card.key]) SPELL_ICON[card.key](g);
  // 名牌：一块深色的匾，两头卷起来
  const plate = mix(metal, BLACK, .55);
  box(g, 5, 42, 34, 9, [12, 11, 15]); box(g, 5, 42, 34, 1, plate); box(g, 5, 50, 34, 1, mix(plate, BLACK, .4));
  box(g, 3, 43, 2, 7, plate); box(g, 39, 43, 2, 7, plate); pix(g, 3, 43, mix(metal, WHITE, .3)); pix(g, 39, 43, mix(metal, WHITE, .3));
  // 底下：有词画词的记号，没有就钉一颗小宝石
  if (gem && card.tag && TAG_MARK[card.tag]) TAG_MARK[card.tag](g, [255, 232, 180]);
  else { const k = gem ? col : mix(metal, WHITE, .3); pix(g, 21, 52, k); pix(g, 22, 52, k); box(g, 20, 53, 4, 1, k); pix(g, 21, 54, mix(k, BLACK, .3)); pix(g, 22, 54, mix(k, BLACK, .3)); }
  if (card.up) { const s = [255, 244, 200]; box(g, 38, 4, 1, 5, s); box(g, 36, 6, 5, 1, s); pix(g, 38, 6, WHITE); }   // 强化过：右上角一颗十字星
  cardArtCache.set(key, c);
  return c;
}

// 盖住的牌（扑棱撕下来糊上去的一页书）：发黄的纸，一行行墨字，正中一个红圈里画着问号
let cardBackArt = null;
const CARD_Q = ['.###.', '##.##', '...##', '..##.', '..##.', '.....', '..##.'];
function drawCardBack(ctx, x, y, w, h, o = {}) {
  if (!cardBackArt) {
    const c = document.createElement('canvas'); c.width = CA_W; c.height = CA_H; const g = c.getContext('2d');
    cardFrame(g, [112, 100, 82], [20, 18, 16], [196, 180, 150]);
    for (let yy = 7; yy < 56; yy++) for (let xx = 6; xx < 38; xx++) {
      const torn = (yy < 9 + hash(xx, 1, 0, 61) * 3) || (yy > 52 + hash(xx, 2, 0, 61) * 3) || (xx > 35 + hash(1, yy, 0, 62) * 2);
      if (torn) continue;
      let k = mix([222, 210, 172], [186, 170, 128], clamp(Math.hypot(xx - 22, yy - 31) / 30 + hash(xx, yy, 0, 63) * .15, 0, 1));
      if (yy % 4 === 0 && yy > 12 && yy < 51 && hash(Math.floor(xx / 3), yy, 0, 64) < .7 && Math.hypot(xx - 21.5, (yy - 30) * 1.1) > 10) k = [96, 84, 66];   // 墨字
      pix(g, xx, yy, k);
    }
    disc(g, 21.5, 30, 9, (dx, dy, d) => d > 7.6 ? [168, 58, 46] : null);   // 红圈
    CARD_Q.forEach((row, j) => [...row].forEach((ch, i) => { if (ch === '#') { box(g, 17 + i * 2, 23 + j * 2, 2, 2, [44, 34, 28]); } }));
    cardBackArt = c;
  }
  ctx.save(); ctx.translate(x, y); ctx.rotate(o.rot || 0); ctx.globalAlpha = o.alpha ?? 1;
  ctx.imageSmoothingEnabled = false; ctx.drawImage(cardBackArt, -w / 2, -h / 2, w, h);
  ctx.restore();
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
  // 名字写在名牌上（46.5 / 62 处）
  let fs = Math.round(h * .1);
  ctx.font = `700 ${fs}px "PingFang SC",sans-serif`;
  const tw = ctx.measureText(card.name).width;
  if (tw > w * .74) { fs = Math.max(8, Math.floor(fs * w * .74 / tw)); ctx.font = `700 ${fs}px "PingFang SC",sans-serif`; }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const ny = h * (46.5 / 62 - .5);
  ctx.fillStyle = 'rgba(0,0,0,.85)'; ctx.fillText(card.name, 0, ny + Math.max(1, h / 124));
  ctx.fillStyle = card.up ? '#ffe9b0' : card.rare ? '#ffe2a0' : '#efe6d2'; ctx.fillText(card.name, 0, ny);
  if (o.dim) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.fillRect(-w / 2, -h / 2, w, h); }
  if (o.hi) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 2; ctx.strokeRect(-w / 2, -h / 2, w, h); }
  ctx.restore();
}

// ---------- 零碎的小图：12×12，按整数倍放大 ----------
const RELIC_BMP = {
  mitten: [{ a: [186, 74, 66], b: [228, 140, 112], c: [74, 30, 30], d: [214, 204, 182], e: [168, 156, 136] }, [
    '............', '...cccc.....', '..caaaac....', '..cbbbbc.cc.', '..caaaaccac.', '..caaaaaaac.',
    '..cbbbbbbc..', '..caaaaaac..', '..cddddddc..', '..ceeeeeec..', '...cccccc...', '............']],
  watch: [{ k: [196, 164, 96], r: [168, 132, 66], f: [222, 216, 198], h: [40, 36, 40] }, [
    '.....kk.....', '....rrrr....', '..rrffffrr..', '.rffffffffr.', '.rfffhffffr.', '.rfffhffffr.',
    '.rfffhhhffr.', '.rffffffffr.', '..rrffffrr..', '....rrrr....', '............', '............']],
  shard: [{ w: [232, 232, 224], s: [180, 182, 178], b: [70, 110, 196], c: [110, 112, 120] }, [
    '............', '.....cc.....', '....cwwc....', '...cwwwwc...', '..cwwwwwwc..', '..cbbbbbbbc.',
    '.cwwwwwwwc..', '.cswwwwwc...', '..csswwc....', '...cccc.....', '............', '............']],
  redstring: [{ a: [214, 62, 58], d: [150, 36, 40] }, [
    '............', '...aaaaaa...', '..aaddddaa..', '.aad....daa.', '.ad......da.', '.ad......da.',
    '.aad....daa.', '..aadaadaa..', '....aaaa....', '....a..a....', '...a....a...', '..a......a..']],
  greenglass: [{ g: [96, 186, 112], h: [200, 248, 206], d: [56, 128, 76], c: [34, 80, 50] }, [
    '............', '...cccccc...', '..chhggggc..', '.chggggggdc.', '.cggggggggc.', '.cggggggggc.',
    '.cgggggggdc.', '.cdggggggdc.', '..cddggddc..', '...cccccc...', '............', '............']],
  blueink: [{ k: [36, 34, 40], K: [80, 78, 90], g: [150, 170, 196], b: [46, 74, 180], B: [110, 150, 236], c: [36, 44, 70] }, [
    '....kkkk....', '....kKKk....', '.....cc.....', '...cccccc...', '..cggggggc..', '..cgbbbbgc..',
    '..cbBbbbbc..', '..cbBbbbbc..', '..cbbbbbbc..', '..cbbbbbbc..', '..cccccccc..', '............']],
  tape: [{ t: [206, 190, 150], e: [138, 124, 94], i: [170, 154, 118] }, [
    '....eeee....', '..eettttee..', '.etttttttte.', '.etttiittte.', 'ettti..ittte', 'ettti..ittte',
    '.etttiittte.', '.etttttttte.', '..eettttee..', '....eeeett..', '........tt..', '........tt..']],
  dice: [{ w: [228, 224, 212], s: [180, 174, 160], p: [30, 28, 34], c: [96, 92, 86] }, [
    '............', '.cccccccccc.', '.cwwwwwwwwc.', '.cwpwwwwpwc.', '.cwwwwwwwwc.', '.cwpwwwwpwc.',
    '.cwwwwwwwwc.', '.cwpwwwwpwc.', '.cwwwwwwwwc.', '.cssssssssc.', '.cccccccccc.', '............']],
  candy: [{ a: [232, 128, 64], h: [255, 214, 150], d: [190, 84, 52], t: [214, 104, 60] }, [
    '............', '............', '............', 't..........t', 'tt..aaaa..tt', 'ttdaahhaadtt',
    'ttdaahaaadtt', 'tt..aaaa..tt', 't..........t', '............', '............', '............']],
  coat: [{ a: [72, 86, 128], d: [50, 60, 96], b: [222, 206, 170], c: [30, 34, 52], l: [104, 120, 164] }, [
    '............', '..ccc..ccc..', '.caaallaaac.', 'caaaallaaaac', 'cadaabbaadac', 'caaaallaaaac',
    'cddddllddddc', 'cacaabbaacac', 'cacaallaacac', 'cacddllddcac', '.c.cccccc.c.', '............']],
};
Object.assign(RELIC_BMP, {
  whistle: [{ a: [196, 176, 104], h: [236, 222, 160], d: [150, 128, 70], c: [70, 56, 30], o: [30, 22, 14], s: [200, 70, 60] }, [
    '..........s.', '.........s.s', '..........s.', '.....cccccs.', '.cccchhhhhc.', 'chhhooaaaahc',
    'caaaaaaaaaac', 'cdddaaaaaaac', '.cccdaaaaadc', '....cddaadc.', '.....ccddc..', '.......cc...']],
  kaleido: [{ b: [168, 96, 140], h: [214, 150, 186], c: [70, 40, 60], R: [236, 84, 72], Y: [234, 198, 86], G: [98, 208, 122], B: [98, 142, 242] }, [
    '............', '.........cc.', '........cRYc', '.......chGBc', '......chbcc.', '.....chbc...',
    '....chbc....', '...chbc.....', '..chbc......', '.cbbc.......', '.ccc........', '............']],
  pocket: [{ a: [96, 104, 140], d: [70, 76, 108], s: [206, 196, 166], c: [40, 44, 60] }, [
    '............', '.cccccccccc.', '.cs.s.s.s.c.', '.caaaaaaaac.', '.caaaaaaaac.', '.caaaaaaaac.',
    '.caaaaaaaac.', '.cdaaaaaadc.', '..cdaaaadc..', '...cccccc...', '............', '............']],
});
const relicArtCache = new Map();
function relicArt(k) {
  if (relicArtCache.has(k)) return relicArtCache.get(k);
  const c = document.createElement('canvas'); c.width = c.height = 12;
  const g = c.getContext('2d'), [pal, rows] = RELIC_BMP[k] || [{}, []];
  rows.forEach((row, y) => [...row].forEach((ch, x) => { if (pal[ch]) pix(g, x, y, pal[ch]); }));
  relicArtCache.set(k, c); return c;
}
function drawRelic(ctx, k, x, y, s) { ctx.imageSmoothingEnabled = false; ctx.drawImage(relicArt(k), Math.round(x), Math.round(y), 12 * s, 12 * s); }
// 一排零碎（左上角，心底下）；relicAt 找鼠标底下是哪件
const RELIC_GAP = 30;
function relicRow(ctx, x, y, keys) {
  keys.forEach((k, i) => {
    const rx = x + i * RELIC_GAP;
    ctx.fillStyle = 'rgba(10,10,14,.7)'; ctx.fillRect(rx - 1, y - 1, 26, 26);
    ctx.strokeStyle = 'rgba(190,160,110,.45)'; ctx.lineWidth = 1; ctx.strokeRect(rx - .5, y - .5, 25, 25);
    drawRelic(ctx, k, rx + 1, y + 1, 2);
  });
}
function relicAt(m, x, y, keys) { const i = Math.floor((m.x - x) / RELIC_GAP); return m.y >= y && m.y <= y + 24 && i >= 0 && i < keys.length && m.x - x - i * RELIC_GAP <= 24 ? keys[i] : null; }
const relicTip = k => [`${RELICS[k].name}：${RELICS[k].text}`, `“${RELICS[k].note}”`];
// 一件零碎的大卡：图、名字、效果、一句话
function relicPanel(ctx, k, r, hot) {
  const it = RELICS[k];
  ctx.fillStyle = hot ? 'rgba(52,46,38,.97)' : 'rgba(22,21,24,.96)'; ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = hot ? 'rgba(255,224,160,.95)' : 'rgba(190,160,110,.7)'; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  drawRelic(ctx, k, r.x + r.w / 2 - 30, r.y + 22, 5);
  txt(ctx, it.name, r.x + r.w / 2, r.y + 108, 20, '#ffe6b0', 'center', 800);
  wrap(ctx, it.text, r.x + r.w / 2, r.y + 142, r.w - 24, 14, '#e8e2d4');
  wrap(ctx, `“${it.note}”`, r.x + r.w / 2, r.y + r.h - 50, r.w - 20, 12, '#8e877a');
}
