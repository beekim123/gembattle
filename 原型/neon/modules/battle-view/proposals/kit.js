// 布局候选用的画图小件（只给 proposals/ 的假数据页用，用户挑定以后，留下的做法搬进主题和画面模块）。
// 全是色块：怪、主角、队友画成一摞往上叠的色块，大小就是以后像素堆叠立绘要占的位子。

import { COLOR_META, COLOR_RING } from '../../shared/index.js';
import { wrapText } from '../../ui/index.js';

const FONT = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

/** 配色：深色底，七种宝石色和数字都要在上面看得清 */
export const T = Object.freeze({
  bg: '#0f1117',
  bar: '#0a0c11',
  ground: '#171b24',
  groundLine: '#1f2430',
  panel: '#161a24',
  panelHi: '#20263a',
  line: '#2e3548',
  text: '#eef2f9',
  text2: '#a6b2c7',
  text3: '#6f7b92',
  heart: '#ff5466',
  heartEmpty: '#2b2f3c',
  gold: '#f2c14e',
  crit: '#ffb020',
  breakCol: '#7ff0ff',
  danger: '#ff4d5e',
  connect: '#7dffb0',
  complement: '#ffd54a',
  hp: '#e0444f',
  hpBack: '#2a1a1f',
  select: '#ffe066',
});

/** 字号五档（逻辑像素，画面按窗口等比缩放）：最小 12，800×600 的窗口里也有 10 像素 */
export const F = Object.freeze({ xs: 12, s: 14, m: 16, l: 20, xl: 28, xxl: 44 });

/** 六条打法路子各一个记号色（加成图标用） */
export const LANE = Object.freeze({
  break: { glyph: '破', color: '#58d6e8' },
  white: { glyph: '白', color: '#e9edf5' },
  rainbow: { glyph: '虹', color: '#f2c14e' },
  chain: { glyph: '链', color: '#ff9f43' },
  keep: { glyph: '留', color: '#b48cff' },
  multi: { glyph: '多', color: '#ff7a90' },
});

export function swatch(color) {
  return COLOR_META[color]?.swatch || '#8892a8';
}

export function txt(r, s, x, y, o = {}) {
  r.text({
    text: s,
    x,
    y,
    size: o.size ?? F.s,
    weight: o.weight ?? 'normal',
    color: o.color ?? T.text,
    align: o.align ?? 'left',
    baseline: o.baseline ?? 'middle',
    alpha: o.alpha ?? 1,
    font: FONT,
  });
}

/** 带描边的字：飘字、总伤害、怪头上的数，压在任何底色上都看得清 */
export function bold(r, s, x, y, o = {}) {
  const size = o.size ?? F.l;
  const w = Math.max(2, Math.round(size / 9));
  const outline = o.outline ?? '#07080c';
  for (const [dx, dy] of [[-w, 0], [w, 0], [0, -w], [0, w], [-w, -w], [w, w], [-w, w], [w, -w]]) {
    txt(r, s, x + dx, y + dy, { ...o, size, color: outline, weight: 'bold' });
  }
  txt(r, s, x, y, { ...o, size, weight: 'bold' });
}

/** 彩虹那一份的数字：一个字一个色 */
export function rainbowText(r, s, x, y, size) {
  const chars = Array.from(String(s));
  const widths = chars.map((c) => r.measureText(c, { size, weight: 'bold', font: FONT }).width);
  let cx = x - widths.reduce((a, b) => a + b, 0) / 2;
  chars.forEach((c, i) => {
    bold(r, c, cx + widths[i] / 2, y, { size, color: swatch(COLOR_RING[i % 6]), align: 'center' });
    cx += widths[i];
  });
}

function heartPoints(cx, cy, s, half) {
  const pts = [];
  const N = 30;
  const t0 = half ? Math.PI : 0;
  for (let i = 0; i <= N; i++) {
    const t = t0 + ((2 * Math.PI - t0) * i) / N;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    pts.push({ x: cx + (x * s) / 34, y: cy + (y * s) / 34 });
  }
  return pts;
}

export function hearts(r, x, y, value, max, size = 18) {
  for (let i = 0; i < Math.ceil(max); i++) {
    const cx = x + size / 2 + i * (size + 4);
    r.polygon({ points: heartPoints(cx, y, size, false), fill: T.heartEmpty, stroke: '#4a5064', lineWidth: 1 });
    const left = value - i;
    if (left >= 1) r.polygon({ points: heartPoints(cx, y, size, false), fill: T.heart });
    else if (left >= 0.5) r.polygon({ points: heartPoints(cx, y, size, true), fill: T.heart });
  }
  return x + Math.ceil(max) * (size + 4);
}

export function gemDot(r, x, y, color, rad = 5) {
  r.circle({ x, y, r: rad + 2, fill: '#0b0d12' });
  r.circle({ x, y, r: rad, fill: swatch(color), stroke: '#ffffff', lineWidth: 1 });
}

/**
 * 宝石牌：上面是整块颜色（一眼数得出手里几张绿），下面一条深色带放宝石点（任何颜色的牌上都看得清）。
 * 宝石牌不写字：颜色就是它的名字。
 */
export function gemCard(r, { x, y, w, h, color, gems, glow = null, dim = false, mult = null, fired = false, label = null, multSize = F.xs }) {
  const a = dim ? 0.45 : 1;
  if (glow) {
    r.rect({ x: x - 3, y: y - 3, w: w + 6, h: h + 6, radius: 10, stroke: glow === 'connect' ? T.connect : T.complement, lineWidth: 3 });
  }
  r.rect({ x, y, w, h, radius: 8, fill: '#0b0d12', alpha: a });
  r.rect({ x: x + 3, y: y + 3, w: w - 6, h: h - 6, radius: 6, fill: swatch(color), alpha: a });
  r.rect({ x: x + 3, y: y + 3, w: w - 6, h: (h - 6) * 0.32, radius: 6, fill: '#ffffff', alpha: 0.16 * a });
  // 中间一颗菱形宝石的轮廓
  const cx = x + w / 2;
  const cy = y + h * 0.4;
  const d = Math.min(w, h) * 0.2;
  if (label) bold(r, label, cx, cy, { size: Math.max(F.xs, Math.min(F.l, w * 0.36)), align: 'center', alpha: a });
  else r.polygon({ points: [{ x: cx, y: cy - d }, { x: cx + d * 0.8, y: cy }, { x: cx, y: cy + d }, { x: cx - d * 0.8, y: cy }], stroke: '#0b0d12', lineWidth: 2, alpha: 0.45 * a });
  const bandH = Math.max(14, h * 0.26);
  r.rect({ x: x + 3, y: y + h - 3 - bandH, w: w - 6, h: bandH, radius: 5, fill: '#0b0d12', alpha: 0.88 * a });
  const rad = Math.max(3, Math.min(6, w / 13));
  const gap = rad * 2.6;
  const sx = cx - ((gems.length - 1) * gap) / 2;
  gems.forEach((g, i) => gemDot(r, sx + i * gap, y + h - 3 - bandH / 2, g, rad));
  if (mult) {
    const mw = Math.max(multSize * 2.2, r.measureText(mult, { size: multSize, weight: 'bold', font: FONT }).width + 8);
    const mh = multSize + 6;
    r.rect({ x: cx - mw / 2, y: y - mh / 2, w: mw, h: mh, radius: mh / 2, fill: fired ? T.gold : '#0b0d12', stroke: fired ? '#fff2b3' : '#4a5470', lineWidth: 1 });
    txt(r, mult, cx, y, { size: multSize, weight: 'bold', align: 'center', color: fired ? '#1a1406' : T.text });
  }
}

/** 功能牌：深色牌面写功能；带颜色的牌用颜色描边，马上用的牌上边一条青色 */
export function fnCard(r, { x, y, w, h, text, color = null, draw = 0, instant = true }) {
  r.rect({ x, y, w, h, radius: 8, fill: '#0b0d12' });
  r.rect({ x: x + 3, y: y + 3, w: w - 6, h: h - 6, radius: 6, fill: '#252b3d', stroke: color ? swatch(color) : '#59657f', lineWidth: color ? 3 : 1.5 });
  if (instant) {
    r.rect({ x: x + 3, y: y + 3, w: w - 6, h: 18, radius: 6, fill: '#1f5f68' });
    txt(r, '马上用', x + w / 2, y + 12, { size: F.xs, align: 'center', weight: 'bold', color: '#c8fbff' });
  }
  const lines = wrapText(r, text, w - 14, { size: F.s, weight: 'bold', font: FONT });
  const top = y + h * 0.48 - ((lines.length - 1) * 18) / 2;
  lines.forEach((ln, i) => txt(r, ln, x + w / 2, top + i * 18, { size: F.s, weight: 'bold', align: 'center' }));
  if (draw > 0) txt(r, `用完补摸 ${draw}`, x + w / 2, y + h - 14, { size: F.xs, align: 'center', color: '#93e5eb' });
}

/** 两张链牌之间的小记号：接上 / 合白 / 断 */
export function chainJoint(r, x, y, rel) {
  if (rel === 'connect') {
    r.circle({ x, y, r: 7, fill: '#123824', stroke: T.connect, lineWidth: 1.5 });
    txt(r, '›', x, y - 1, { size: F.s, weight: 'bold', align: 'center', color: T.connect });
  } else if (rel === 'complement') {
    r.circle({ x, y, r: 8, fill: '#3a2f0c', stroke: T.complement, lineWidth: 1.5 });
    txt(r, '白', x, y, { size: 10, weight: 'bold', align: 'center', color: T.complement });
  } else if (rel === 'break') {
    r.circle({ x, y, r: 7, fill: '#3a1218', stroke: T.danger, lineWidth: 1.5 });
    txt(r, '×', x, y - 1, { size: F.s, weight: 'bold', align: 'center', color: T.danger });
  }
}

/** 一条链：卡片宽度跟着张数缩，12 张也放得下 */
export function chainRow(r, { x, y, w, h, chain, maxCard = 54, fired = -1 }) {
  if (chain.length === 0) return;
  const gap = 12;
  const cw = Math.min(maxCard, (w - gap * (chain.length - 1)) / chain.length);
  const ch = Math.min(h, cw * 1.3);
  const total = cw * chain.length + gap * (chain.length - 1);
  const sx = x + (w - total) / 2;
  chain.forEach((c, i) => {
    const cx = sx + i * (cw + gap);
    gemCard(r, { x: cx, y: y + (h - ch), w: cw, h: ch, color: c.color, gems: c.gems || [c.color], mult: c.mult, fired: i <= fired, label: c.short || null });
    if (i > 0) chainJoint(r, cx - gap / 2, y + (h - ch) + ch / 2, c.rel);
  });
  return { x: sx, w: total };
}

/** 一摞色块：怪、主角、队友的占位（以后换成像素堆叠立绘，就画在这个框里） */
export function stackSprite(r, cx, baseY, size, { hue = '#6b5b9a', top = '#a08fd8', eyes = '#ffe27a', flash = false, alpha = 1, slot = true } = {}) {
  if (slot) r.rect({ x: cx - size / 2, y: baseY - size, w: size, h: size, radius: 6, stroke: '#ffffff', lineWidth: 1, alpha: 0.07 });
  r.rect({ x: cx - size * 0.42, y: baseY - size * 0.07, w: size * 0.84, h: size * 0.14, radius: size * 0.07, fill: '#000000', alpha: 0.4 * alpha });
  const n = 6;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const lw = size * (0.74 - t * 0.2);
    const lh = size * 0.2;
    const ly = baseY - size * 0.1 - i * size * 0.135 - lh / 2;
    r.rect({ x: cx - lw / 2, y: ly, w: lw, h: lh, radius: lh * 0.35, fill: flash ? '#ffffff' : (i === n - 1 ? top : hue), alpha: alpha * (flash ? 0.9 : 0.55 + t * 0.45) });
  }
  if (eyes) {
    const ey = baseY - size * 0.1 - (n - 1) * size * 0.135;
    r.circle({ x: cx - size * 0.1, y: ey, r: Math.max(2, size * 0.035), fill: eyes, alpha });
    r.circle({ x: cx + size * 0.1, y: ey, r: Math.max(2, size * 0.035), fill: eyes, alpha });
  }
}

/** 选中目标：脚下一圈 */
export function targetRing(r, cx, baseY, size) {
  r.rect({ x: cx - size * 0.5, y: baseY - size * 0.1, w: size, h: size * 0.2, radius: size * 0.1, stroke: T.select, lineWidth: 2.5 });
}

/** 倒计时 + 下一手：圆章里是还剩几回合，旁边是到 0 时要干什么 */
export function countdown(r, x, y, n, intentHearts, { size = 17, side = 'right' } = {}) {
  const urgent = n <= 1;
  r.circle({ x, y, r: size, fill: urgent ? '#7a1622' : '#141824', stroke: urgent ? T.danger : '#8a96b4', lineWidth: 2 });
  txt(r, String(n), x, y + 1, { size: Math.round(size * 1.15), weight: 'bold', align: 'center', color: urgent ? '#ffffff' : T.text });
  const ix = side === 'right' ? x + size + 6 : x - size - 6;
  const label = `打 ${intentHearts === 0.5 ? '½' : intentHearts}`;
  const lw = r.measureText(label, { size: F.s, weight: 'bold', font: FONT }).width;
  const bx = side === 'right' ? ix : ix - lw - 22;
  r.rect({ x: bx - 4, y: y - 12, w: lw + 28, h: 24, radius: 12, fill: '#0b0d12', alpha: 0.85 });
  txt(r, label, bx + 2, y + 1, { size: F.s, weight: 'bold', color: urgent ? '#ffb3ba' : T.text2 });
  r.polygon({ points: heartPoints(bx + lw + 13, y + 1, 14, false), fill: T.heart });
}

/** 血条：几条血用左边的小方块数，数字压在条上 */
export function hpBar(r, x, y, w, m, h = 14) {
  const left = m.bars - m.barIndex;
  let bx = x;
  if (m.bars > 1) {
    for (let i = 0; i < m.bars; i++) {
      r.rect({ x: bx, y: y + 2, w: 6, h: h - 4, radius: 2, fill: i < left ? T.hp : '#3a3f4e' });
      bx += 9;
    }
    bx += 2;
  }
  const bw = w - (bx - x);
  r.rect({ x: bx, y, w: bw, h, radius: h / 2, fill: T.hpBack, stroke: '#4a2a32', lineWidth: 1 });
  const ratio = Math.max(0, Math.min(1, m.hp / m.maxHp));
  if (ratio > 0) r.rect({ x: bx + 1, y: y + 1, w: Math.max(h - 2, (bw - 2) * ratio), h: h - 2, radius: (h - 2) / 2, fill: m.dead ? '#3a3f4e' : T.hp });
  bold(r, `${m.hp}`, bx + bw / 2, y + h / 2 + 1, { size: h >= 14 ? F.s : F.xs, align: 'center' });
}

/** 盾：一格一块；破了就换成「破盾 ×1.5」 */
export function shieldRow(r, x, y, m, { cell = 12, align = 'left', w = 0 } = {}) {
  if (m.broken) {
    const label = '破盾 ×1.5';
    const lw = r.measureText(label, { size: F.xs, weight: 'bold', font: FONT }).width + 14;
    const bx = align === 'center' ? x + w / 2 - lw / 2 : x;
    r.rect({ x: bx, y: y - 1, w: lw, h: 18, radius: 9, fill: '#0f3940', stroke: T.breakCol, lineWidth: 1.5 });
    txt(r, label, bx + lw / 2, y + 8, { size: F.xs, weight: 'bold', align: 'center', color: T.breakCol });
    return;
  }
  if (!m.shields || m.shields.length === 0) return;
  const segs = m.shields.map((s) => s.max * (cell + 2) - 2);
  const totalW = segs.reduce((a, b) => a + b, 0) + (m.shields.length - 1) * 8;
  let sx = align === 'center' ? x + w / 2 - totalW / 2 : x;
  m.shields.forEach((s, si) => {
    for (let k = 0; k < s.max; k++) {
      const on = k < s.cur;
      r.rect({ x: sx + k * (cell + 2), y, w: cell, h: cell * 0.75, radius: 2, fill: on ? swatch(s.color) : '#151821', stroke: swatch(s.color), lineWidth: 1, alpha: on ? 1 : 0.7 });
    }
    sx += segs[si] + 8;
  });
}

/** 怪的特性：一个小签，只写干什么，细节放悬停 */
export function traitChip(r, x, y, label, align = 'left') {
  const lw = r.measureText(label, { size: F.xs, font: FONT }).width + 14;
  const bx = align === 'center' ? x - lw / 2 : x;
  r.rect({ x: bx, y: y - 9, w: lw, h: 18, radius: 4, fill: '#2a2236', stroke: '#6c5a8c', lineWidth: 1 });
  txt(r, label, bx + lw / 2, y, { size: F.xs, align: 'center', color: '#d9ccf2' });
}

export function tierTag(r, x, y, tier, align = 'center') {
  if (tier === 'normal') return;
  const label = tier === 'elite' ? '精英' : '看门的';
  const col = tier === 'elite' ? '#c43c4c' : '#7a52d1';
  const lw = r.measureText(label, { size: F.xs, weight: 'bold', font: FONT }).width + 12;
  const bx = align === 'center' ? x - lw / 2 : align === 'right' ? x - lw : x;
  r.rect({ x: bx, y: y - 9, w: lw, h: 18, radius: 4, fill: col });
  txt(r, label, bx + lw / 2, y, { size: F.xs, weight: 'bold', align: 'center' });
}

/** 加成图标：方块 + 路子记号，悬停才看全文 */
export function buffIcon(r, x, y, b, size = 26) {
  const lane = LANE[b.lane];
  r.rect({ x, y, w: size, h: size, radius: 6, fill: '#1b2030', stroke: lane.color, lineWidth: 1.5 });
  if (b.lane === 'rainbow') {
    COLOR_RING.forEach((c, i) => r.rect({ x: x + 3 + i * ((size - 6) / 6), y: y + size - 6, w: (size - 6) / 6, h: 3, fill: swatch(c) }));
  }
  txt(r, lane.glyph, x + size / 2, y + size / 2, { size: Math.round(size * 0.52), weight: 'bold', align: 'center', color: lane.color });
  if (b.flash) r.rect({ x: x - 3, y: y - 3, w: size + 6, h: size + 6, radius: 8, stroke: '#ffffff', lineWidth: 2 });
}

const ROLE = {
  坦: { hue: '#4f6f8f', top: '#86b4dc' },
  战: { hue: '#8f5a3a', top: '#e09a62' },
  刺: { hue: '#4a3a5a', top: '#9a78c2' },
  辅: { hue: '#3f7a5a', top: '#86d6a6' },
};
const MODE_MARK = { 自己动: '动', 塞牌: '塞', 后台加成: '常', 跟着触发: '跟' };

/** 队友：一摞色块 + 职业字 + 参与方式的记号 */
export function allyUnit(r, cx, baseY, size, a, sayDir = 'up') {
  const c = ROLE[a.role] || ROLE.战;
  stackSprite(r, cx, baseY, size, { hue: c.hue, top: c.top, eyes: '#f4f1e8' });
  r.circle({ x: cx - size * 0.38, y: baseY - size * 0.82, r: 10, fill: '#0b0d12', stroke: c.top, lineWidth: 1.5 });
  txt(r, a.role, cx - size * 0.38, baseY - size * 0.82, { size: F.xs, weight: 'bold', align: 'center', color: c.top });
  const mk = MODE_MARK[a.mode] || '动';
  r.rect({ x: cx + size * 0.22, y: baseY - size * 0.92, w: 18, h: 18, radius: 4, fill: '#0b0d12', stroke: '#8a96b4', lineWidth: 1 });
  txt(r, mk, cx + size * 0.22 + 9, baseY - size * 0.92 + 9, { size: F.xs, align: 'center', color: T.text2 });
  if (!a.say) return;
  if (sayDir === 'up') speech(r, cx, baseY - size - 12, a.say, c.top);
  else speech(r, cx + (sayDir === 'left' ? -size * 0.55 : size * 0.55), baseY - size * 0.45, a.say, c.top, sayDir);
}

export function allyTile(r, x, y, size, a, sayDir = 'down') {
  const c = ROLE[a.role] || ROLE.战;
  r.rect({ x, y, w: size, h: size, radius: 8, fill: '#1b2030', stroke: a.say ? '#ffffff' : c.top, lineWidth: a.say ? 2.5 : 1.5 });
  stackSprite(r, x + size / 2, y + size - 4, size * 0.7, { hue: c.hue, top: c.top, eyes: '#f4f1e8', slot: false });
  txt(r, a.role, x + 10, y + 11, { size: F.xs, weight: 'bold', align: 'center', color: c.top });
  const mk = MODE_MARK[a.mode] || '动';
  txt(r, mk, x + size - 9, y + 11, { size: F.xs, align: 'center', color: T.text2 });
  if (a.say && sayDir === 'down') speech(r, x + size / 2, y + size + 18, a.say, c.top, 'down');
  else if (a.say) speech(r, x - 6, y + size / 2, a.say, c.top, 'left');
}

export function heroUnit(r, cx, baseY, size) {
  stackSprite(r, cx, baseY, size, { hue: '#7a6a4e', top: '#e8cfa0', eyes: '#1a1406' });
}

export function speech(r, x, y, s, col = '#ffffff', dir = 'up') {
  if (dir === 'left' || dir === 'right') {
    const w0 = r.measureText(s, { size: F.s, weight: 'bold', font: FONT }).width + 18;
    x += dir === 'left' ? -w0 / 2 : w0 / 2;
  }
  const lw = r.measureText(s, { size: F.s, weight: 'bold', font: FONT }).width + 18;
  r.rect({ x: x - lw / 2, y: y - 13, w: lw, h: 26, radius: 8, fill: '#0b0d12', stroke: col, lineWidth: 1.5 });
  if (dir === 'up' || dir === 'down') {
    const ty = dir === 'up' ? y + 13 : y - 13;
    const tip = dir === 'up' ? 7 : -7;
    r.polygon({ points: [{ x: x - 6, y: ty }, { x: x + 6, y: ty }, { x, y: ty + tip }], fill: col });
  }
  txt(r, s, x, y + 1, { size: F.s, weight: 'bold', align: 'center' });
}

/** 飘字：普通白、暴击金橙加大、白色伤害白字蓝边、彩虹一字一色 */
export function floater(r, x, y, f) {
  if (f.kind === 'rainbow') return rainbowText(r, f.text, x, y, f.size ?? 26);
  if (f.kind === 'crit') return bold(r, f.text, x, y, { size: f.size ?? 32, color: T.crit, align: 'center' });
  if (f.kind === 'white') return bold(r, f.text, x, y, { size: f.size ?? 24, color: '#ffffff', outline: '#1d4a8a', align: 'center' });
  if (f.kind === 'ally') return bold(r, f.text, x, y, { size: f.size ?? 26, color: '#ffd9a8', outline: '#5a2a0a', align: 'center' });
  return bold(r, f.text, x, y, { size: f.size ?? 22, color: '#ffffff', align: 'center' });
}

/** 破盾的字章 */
export function breakStamp(r, x, y) {
  r.rect({ x: x - 62, y: y - 20, w: 124, h: 40, radius: 6, fill: '#0b2c33', stroke: T.breakCol, lineWidth: 3 });
  bold(r, '破盾！', x, y + 1, { size: F.xl, color: T.breakCol, align: 'center', outline: '#04161a' });
}

/** 集色：六个点排成一圈，白在中间；集到的亮，当前色加一个圈 */
export function colorRing(r, cx, cy, rad, recorded, current = null, dot = 9) {
  r.circle({ x: cx, y: cy, r: rad + dot + 4, fill: '#0b0d12', stroke: T.line, lineWidth: 1 });
  COLOR_RING.forEach((c, i) => {
    const ang = -Math.PI / 2 + (i * Math.PI) / 3;
    const x = cx + Math.cos(ang) * rad;
    const y = cy + Math.sin(ang) * rad;
    const on = recorded.includes(c);
    r.circle({ x, y, r: dot, fill: on ? swatch(c) : '#151821', stroke: swatch(c), lineWidth: 1.5, alpha: on ? 1 : 0.6 });
    if (c === current) r.circle({ x, y, r: dot + 4, stroke: '#ffffff', lineWidth: 2 });
  });
  r.circle({ x: cx, y: cy, r: dot * 0.8, fill: '#f2f4f8', alpha: 0.9 });
  txt(r, `${recorded.length}/6`, cx, cy + rad + dot + 16, { size: F.xs, align: 'center', color: recorded.length >= 5 ? T.gold : T.text2 });
}

/** 牌堆里每种颜色还剩几张 */
export function deckCounts(r, x, y, byColor, cols = 4, cellW = 44) {
  const list = [...COLOR_RING, 'white'];
  list.forEach((c, i) => {
    const cx = x + (i % cols) * cellW;
    const cy = y + Math.floor(i / cols) * 22;
    const n = byColor[c] ?? 0;
    r.rect({ x: cx, y: cy - 7, w: 10, h: 14, radius: 2, fill: swatch(c), alpha: n > 0 ? 1 : 0.25 });
    txt(r, String(n), cx + 15, cy, { size: F.s, weight: 'bold', color: n > 0 ? T.text : T.text3 });
  });
}

export function gemLevels(r, x, y, levels, gap = 52) {
  ['red', 'green', 'blue'].forEach((c, i) => {
    gemDot(r, x + i * gap + 6, y, c, 5);
    txt(r, `${levels[c]}级`, x + i * gap + 16, y, { size: F.xs, color: T.text2 });
  });
}

/** 打出键 */
export function castButton(r, x, y, w, h, label = '打出', sub = '') {
  r.rect({ x, y: y + 4, w, h, radius: 12, fill: '#0b2a6e' });
  r.rect({ x, y, w, h, radius: 12, fill: '#3a74e0', stroke: '#a9c8ff', lineWidth: 2 });
  txt(r, label, x + w / 2, y + h / 2 - (sub ? 8 : 0), { size: F.l, weight: 'bold', align: 'center' });
  if (sub) txt(r, sub, x + w / 2, y + h / 2 + 14, { size: F.xs, align: 'center', color: '#d6e4ff' });
}

export function smallButton(r, x, y, w, h, label) {
  r.rect({ x, y, w, h, radius: 8, fill: '#1b2030', stroke: '#3e4862', lineWidth: 1 });
  txt(r, label, x + w / 2, y + h / 2, { size: F.xs, align: 'center', color: T.text2 });
}

/** 顶上一条状态栏：探索、大厅、战斗都用这一条（战斗里中间多一个回合数） */
export function statusBar(r, s, { buffsRight = false } = {}) {
  r.rect({ x: 0, y: 0, w: 960, h: 32, fill: T.bar });
  r.line({ x1: 0, y1: 32, x2: 960, y2: 32, color: '#232838', lineWidth: 1 });
  let x = hearts(r, 14, 16, s.hearts, s.maxHearts, 18) + 10;
  r.circle({ x: x + 8, y: 16, r: 7, fill: T.gold, stroke: '#7a5a10', lineWidth: 1.5 });
  txt(r, String(s.gold), x + 20, 16, { size: F.s, weight: 'bold', color: T.gold });
  x += 64;
  s.quests.forEach((q) => {
    const label = `任务 ${q.cur}/${q.total}`;
    const lw = r.measureText(label, { size: F.xs, font: FONT }).width + 22;
    r.rect({ x, y: 7, w: lw, h: 18, radius: 4, fill: '#1b2030', stroke: q.cur >= q.total ? T.connect : '#4a5470', lineWidth: 1 });
    r.rect({ x: x + 5, y: 12, w: 8, h: 8, fill: q.cur >= q.total ? T.connect : '#8a96b4' });
    txt(r, label, x + 17, 16, { size: F.xs, color: T.text2 });
    x += lw + 6;
  });
  txt(r, `${s.where}${s.turn ? ` · 第 ${s.turn} 回合` : ''}`, 480, 16, { size: F.s, weight: 'bold', align: 'center' });
  if (buffsRight && s.buffs) {
    let bx = 960 - 12 - s.buffs.length * 26;
    s.buffs.forEach((b) => { buffIcon(r, bx, 5, b, 22); bx += 26; });
  } else {
    smallButton(r, 960 - 40, 5, 28, 22, '≡');
  }
}

/** 地面：探索用的同一片空地，淡淡的格子 */
export function ground(r, x, y, w, h, grid = 48) {
  r.rect({ x, y, w, h, fill: T.ground });
  for (let gx = x; gx <= x + w; gx += grid) r.line({ x1: gx, y1: y, x2: gx, y2: y + h, color: T.groundLine, lineWidth: 1 });
  for (let gy = y; gy <= y + h; gy += grid) r.line({ x1: x, y1: gy, x2: x + w, y2: gy, color: T.groundLine, lineWidth: 1 });
}

/** 这一下的总伤害 + 一句「大在哪」 */
export function bigTotal(r, cx, cy, sum) {
  bold(r, String(sum.total), cx, cy, { size: F.xxl, color: sum.rainbow ? T.gold : '#ffffff', align: 'center' });
  if (sum.why) {
    const lw = r.measureText(sum.why, { size: F.s, font: FONT }).width + 24;
    r.rect({ x: cx - lw / 2, y: cy + 26, w: lw, h: 26, radius: 13, fill: '#0b0d12', alpha: 0.85 });
    txt(r, sum.why, cx, cy + 39, { size: F.s, align: 'center', color: T.text2 });
  }
}

/** 算式：发数 × 每发 = 总数（发数蓝框、每发红框，队友那一份单独一格） */
export function formula(r, x, y, w, p, { compact = false } = {}) {
  const boxH = compact ? 42 : 50;
  const vs = compact ? F.l : F.xl;
  const partW = (w - 30) / 2;
  const box = (bx, label, val, fill, stroke) => {
    r.rect({ x: bx, y, w: partW, h: boxH, radius: 8, fill, stroke, lineWidth: 1.5 });
    txt(r, label, bx + 7, y + 10, { size: F.xs, color: '#dfe7f7', alpha: 0.85 });
    const fit = Math.min(vs, Math.floor((partW - 10) / (String(val).length * 0.62)));
    txt(r, String(val), bx + partW - 7, y + boxH - fit * 0.55 - 3, { size: fit, weight: 'bold', align: 'right' });
  };
  box(x, '发数', p.hits, '#1d3f8a', '#5c8ef0');
  txt(r, '×', x + partW + 15, y + boxH / 2, { size: F.l, weight: 'bold', align: 'center', color: T.text2 });
  box(x + partW + 30, '每发约', p.perHit, '#7a1f2a', '#e0606e');
  const ty = y + boxH + (compact ? 16 : 22);
  txt(r, '=', x, ty, { size: F.l, weight: 'bold', color: T.text2 });
  txt(r, String(p.total), x + w, ty, { size: compact ? F.l : F.xl, weight: 'bold', align: 'right', color: T.gold });
  let ly = ty + (compact ? 20 : 26);
  for (const ln of p.lines || []) {
    txt(r, ln, x, ly, { size: F.xs, color: ln.startsWith('队友') ? '#ffd9a8' : T.text2 });
    ly += 17;
  }
  return ly;
}
