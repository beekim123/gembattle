// 三个战斗布局候选。每个布局先写一张「区域表」（以后就是 layout.js），画的代码只照表摆，不另写死坐标。

import {
  F, T,
  allyTile, allyUnit, bigTotal, breakStamp, buffIcon, castButton, chainRow, colorRing,
  countdown, deckCounts, floater, fnCard, formula, gemCard, gemLevels, ground, heroUnit, hpBar,
  shieldRow, smallButton, speech, stackSprite, statusBar, targetRing, tierTag, traitChip, txt,
} from './kit.js';

const MONSTER_LOOK = {
  normal: { hue: '#5b4f7e', top: '#9d8ad6', eyes: '#ffe27a' },
  elite: { hue: '#7e3a46', top: '#e0707e', eyes: '#ffffff' },
  gatekeeper: { hue: '#463a7e', top: '#8f7ae8', eyes: '#ff6b6b' },
};

/** 把一群怪摆进一块区域：大的那只占 1.5 份，没死的照常，死了的变淡 */
function placeMonsters(monsters, zone) {
  const weights = monsters.map((m) => (m.big || monsters.length === 1 ? 1.5 : 1));
  const sum = weights.reduce((a, b) => a + b, 0);
  let x = zone.x;
  return monsters.map((m, i) => {
    const w = (zone.w * weights[i]) / sum;
    const size = Math.min(w * 0.82, zone.maxSize * (weights[i] > 1 || monsters.length === 1 ? 1 : 0.68));
    const arc = zone.arc ? Math.abs(i - (monsters.length - 1) / 2) * zone.arc : 0;
    const slot = { m, cx: x + w / 2, base: zone.base + arc, size, w };
    x += w;
    return slot;
  });
}

function drawMonster(r, slot, plate) {
  const { m, cx, base, size, w } = slot;
  const look = MONSTER_LOOK[m.tier];
  if (m.selected && !m.dead) targetRing(r, cx, base, size * 0.9);
  stackSprite(r, cx, base, size, { ...look, flash: false, alpha: m.dead ? 0.25 : 1 });
  if (m.flash && !m.dead) r.rect({ x: cx - size * 0.38, y: base - size * 0.85, w: size * 0.76, h: size * 0.78, radius: 10, fill: '#ffffff', alpha: 0.12 });
  if (m.dead) {
    txt(r, '打倒了', cx, base - size * 0.45, { size: F.s, align: 'center', color: T.text3 });
    return;
  }
  // 头上：倒计时 + 下一手
  const cdSize = size > 120 ? 17 : 14;
  countdown(r, cx - Math.min(w, size) * 0.42 + cdSize, base - size - cdSize - 4, m.countdown, m.intent, { size: cdSize });
  // 脚下：血、盾、特性
  const pw = Math.min(w - 14, plate.maxW);
  const px = cx - pw / 2;
  let py = base + plate.gap;
  if (m.tier !== 'normal') {
    tierTag(r, cx, py, m.tier);
    py += 18;
  }
  hpBar(r, px, py, pw, m, size > 120 ? 16 : 12);
  py += size > 120 ? 24 : 19;
  shieldRow(r, px, py, m, { cell: size > 120 ? 13 : 10, align: 'center', w: pw });
  py += m.broken ? 28 : 22;
  m.traits.forEach((t) => { traitChip(r, cx, py, t, 'center'); py += 22; });
}

function drawFloaters(r, slots, s) {
  for (const f of s.floaters || []) {
    const slot = slots[f.m];
    if (!slot) continue;
    // 飘字只在怪身上那一块里飘：不上头顶的倒计时，不出画面
    const k = slot.size / 170;
    const y = Math.max(slot.base - slot.size + 24, slot.base - slot.size * 0.5 + f.dy * k);
    floater(r, slot.cx + f.dx * Math.max(0.7, k), y, f);
  }
}

function drawHand(r, cards, area, cw = 78, ch = 108) {
  const gap = 10;
  const total = cards.length * cw + (cards.length - 1) * gap;
  let x = area.cx - total / 2;
  cards.forEach((c, i) => {
    const lift = i === 0 ? 0 : 0;
    if (c.fn) fnCard(r, { x, y: area.y - lift, w: cw, h: ch, text: c.text, color: c.color, draw: c.draw ?? 1, instant: !c.color });
    else gemCard(r, { x, y: area.y - lift, w: cw, h: ch, color: c.color, gems: c.gems, glow: c.glow, dim: c.dim });
    x += cw + gap;
  });
}

// ─────────────────────────────────────────────
// 布局一：左右对阵。主角和队友在左，怪在右，中间一栏放算式和总数；链在场地和手牌之间。
// ─────────────────────────────────────────────
export const LAYOUT_1 = {
  id: 1,
  name: '左右对阵',
  regions: {
    bar: { x: 0, y: 0, w: 960, h: 32 },
    arena: { x: 0, y: 32, w: 960, h: 320 },
    buffs: { x: 14, y: 42, size: 26 },
    hero: { cx: 196, base: 262, size: 104 },
    allies: [{ cx: 84, base: 214, size: 62 }, { cx: 90, base: 318, size: 62 }, { cx: 300, base: 330, size: 58 }],
    middle: { x: 290, y: 78, w: 168, cx: 374 },
    monsters: { x: 476, w: 470, base: 244, maxSize: 160 },
    plate: { gap: 14, maxW: 220 },
    chain: { x: 200, y: 356, w: 560, h: 50, maxCard: 40 },
    hand: { cx: 480, y: 420, cw: 78, ch: 108 },
    left: { x: 12, y: 418, w: 180, h: 116 },
    right: { x: 806, y: 418, w: 142, h: 116 },
  },
  draw(r, s) {
    const L = this.regions;
    r.clear(T.bg);
    ground(r, 0, 32, 960, 320);
    r.rect({ x: 0, y: 290, w: 960, h: 62, fill: '#000000', alpha: 0.12 });
    statusBar(r, s.status);
    s.status.buffs.forEach((b, i) => buffIcon(r, L.buffs.x + i * (L.buffs.size + 6), L.buffs.y, b, L.buffs.size));

    heroUnit(r, L.hero.cx, L.hero.base, L.hero.size);
    s.allies.forEach((a, i) => allyUnit(r, L.allies[i].cx, L.allies[i].base, L.allies[i].size, a));

    const slots = placeMonsters(s.monsters, L.monsters);
    slots.forEach((sl) => drawMonster(r, sl, L.plate));
    if (s.breakStamp) breakStamp(r, slots[0].cx - slots[0].size * 1.0, slots[0].base - slots[0].size * 0.35);

    // 中间一栏：排链时是算式，打出去以后是总数
    if (s.summary) bigTotal(r, L.middle.cx, L.middle.y + 70, { ...s.summary, why: '' });
    else formula(r, L.middle.x, L.middle.y, L.middle.w, s.preview, { compact: true });
    if (s.summary) {
      const lines = s.summary.why.split(' · ');
      lines.forEach((ln, i) => txt(r, ln, L.middle.cx, L.middle.y + 112 + i * 18, { size: F.xs, align: 'center', color: ln.startsWith('队友') ? '#ffd9a8' : T.text2 }));
    }
    if (s.banner) speech(r, 700, 60, s.banner, '#ffffff');
    drawFloaters(r, slots, s);

    r.rect({ x: 0, y: 352, w: 960, h: 188, fill: T.bg });
    r.line({ x1: 0, y1: 352, x2: 960, y2: 352, color: T.line, lineWidth: 1 });
    if (s.chain.length) chainRow(r, { ...L.chain, chain: s.chain, fired: s.fired ?? -1 });
    else if (!s.summary) txt(r, s.hint || '点手牌排进链', 480, L.chain.y + 26, { size: F.s, align: 'center', color: T.text3 });

    drawHand(r, s.hand, L.hand, L.hand.cw, L.hand.ch);

    colorRing(r, L.left.x + 38, L.left.y + 36, 20, s.recorded, s.current, 7);
    deckCounts(r, L.left.x + 84, L.left.y + 12, s.deck, 2, 46);
    txt(r, `牌堆 ${s.drawCount} · 弃 ${s.discardCount}`, L.left.x + 2, L.left.y + 92, { size: F.xs, color: T.text2 });
    gemLevels(r, L.left.x + 2, L.left.y + 110, s.gemLevels, 56);

    smallButton(r, L.right.x, L.right.y, 66, 24, '自动排');
    smallButton(r, L.right.x + 76, L.right.y, 66, 24, '撤回');
    castButton(r, L.right.x, L.right.y + 36, L.right.w, 70, s.chain.length ? '打出' : '结束回合', s.chain.length ? '空格' : '');
  },
};

// ─────────────────────────────────────────────
// 布局二：算式栏。左边一整栏是「这一下怎么来的」（算式、集色、牌堆），右边是怪、链、手牌；
// 不画主角，加成和队友排成一排小方块挂在顶上。
// ─────────────────────────────────────────────
export const LAYOUT_2 = {
  id: 2,
  name: '算式栏',
  regions: {
    bar: { x: 0, y: 0, w: 960, h: 32 },
    side: { x: 0, y: 32, w: 236, h: 508 },
    formula: { x: 18, y: 72, w: 200 },
    buffs: { x: 18, y: 250, size: 34, perRow: 5 },
    ring: { cx: 118, cy: 354, rad: 26, dot: 10 },
    sideInfo: { x: 22, y: 410 },
    allies: { x: 890, y: 44, size: 56 },
    monsters: { x: 248, w: 628, base: 256, maxSize: 160 },
    plate: { gap: 12, maxW: 230 },
    chain: { x: 256, y: 358, w: 690, h: 50, maxCard: 44 },
    hand: { cx: 540, y: 420, cw: 80, ch: 110 },
    right: { x: 830, y: 418, w: 116, h: 116 },
  },
  draw(r, s) {
    const L = this.regions;
    r.clear(T.bg);
    ground(r, 236, 32, 724, 320);
    statusBar(r, s.status);
    r.rect({ ...L.side, fill: T.panel });
    r.line({ x1: 236, y1: 32, x2: 236, y2: 540, color: T.line, lineWidth: 1 });

    txt(r, s.summary ? '这一下' : '排到这里', L.formula.x, L.formula.y - 20, { size: F.s, weight: 'bold', color: T.text2 });
    const fEnd = formula(r, L.formula.x, L.formula.y, L.formula.w, s.preview);
    if (s.summary) r.rect({ x: 8, y: L.formula.y - 36, w: 220, h: fEnd - L.formula.y + 36, radius: 10, stroke: s.summary.rainbow ? T.gold : '#5c8ef0', lineWidth: 2 });

    txt(r, '加成', L.buffs.x, L.buffs.y - 14, { size: F.xs, weight: 'bold', color: T.text3 });
    s.status.buffs.forEach((b, i) => buffIcon(r, L.buffs.x + (i % L.buffs.perRow) * (L.buffs.size + 6), L.buffs.y + Math.floor(i / L.buffs.perRow) * (L.buffs.size + 6), b, L.buffs.size));
    colorRing(r, L.ring.cx, L.ring.cy, L.ring.rad, s.recorded, s.current, L.ring.dot);
    gemLevels(r, L.sideInfo.x, L.sideInfo.y + 14, s.gemLevels, 64);
    txt(r, `牌堆 ${s.drawCount} · 弃 ${s.discardCount}`, L.sideInfo.x, L.sideInfo.y + 44, { size: F.s, weight: 'bold', color: T.text2 });
    deckCounts(r, L.sideInfo.x, L.sideInfo.y + 72, s.deck, 4, 50);

    const slots = placeMonsters(s.monsters, L.monsters);
    slots.forEach((sl) => drawMonster(r, sl, L.plate));
    if (s.breakStamp) breakStamp(r, slots[0].cx - slots[0].size * 0.95, slots[0].base - slots[0].size * 0.8);
    if (s.banner) speech(r, 560, 52, s.banner, '#ffffff');
    drawFloaters(r, slots, s);
    s.allies.forEach((a, i) => allyTile(r, L.allies.x, L.allies.y + i * (L.allies.size + 10), L.allies.size, a, 'left'));

    r.rect({ x: 236, y: 352, w: 724, h: 188, fill: T.bg });
    r.line({ x1: 236, y1: 352, x2: 960, y2: 352, color: T.line, lineWidth: 1 });
    if (s.chain.length) chainRow(r, { ...L.chain, chain: s.chain, fired: s.fired ?? -1 });
    else if (!s.summary) txt(r, s.hint || '点手牌排进链', 600, L.chain.y + 26, { size: F.s, align: 'center', color: T.text3 });
    drawHand(r, s.hand, L.hand, L.hand.cw, L.hand.ch);
    smallButton(r, L.right.x, L.right.y, 54, 24, '自动排');
    smallButton(r, L.right.x + 62, L.right.y, 54, 24, '撤回');
    castButton(r, L.right.x, L.right.y + 36, L.right.w, 70, s.chain.length ? '打出' : '结束回合', s.chain.length ? '空格' : '');
  },
};

// ─────────────────────────────────────────────
// 布局三：俯视战场。就在探索的那片空地上打：怪在上，主角和队友在下面站成一排，
// 排好的链悬在主角前面，手牌在底下一条半透明的托盘里。
// ─────────────────────────────────────────────
export const LAYOUT_3 = {
  id: 3,
  name: '俯视战场',
  regions: {
    bar: { x: 0, y: 0, w: 960, h: 32 },
    field: { x: 0, y: 32, w: 960, h: 508 },
    monsters: { x: 150, w: 660, base: 210, maxSize: 132, arc: 16 },
    plate: { gap: 10, maxW: 180 },
    chain: { x: 170, y: 304, w: 620, h: 46, maxCard: 36 },
    total: { cx: 480, cy: 328 },
    hero: { cx: 480, base: 406, size: 54 },
    allies: [{ cx: 340, base: 402, size: 46, say: 'left' }, { cx: 620, base: 402, size: 46, say: 'right' }, { cx: 404, base: 404, size: 44, say: 'up' }],
    formula: { x: 790, y: 300, w: 156 },
    tray: { x: 0, y: 412, w: 960, h: 128 },
    hand: { cx: 480, y: 422, cw: 76, ch: 106 },
    left: { x: 12, y: 420 },
    right: { x: 806, y: 420, w: 142 },
  },
  draw(r, s) {
    const L = this.regions;
    r.clear(T.bg);
    ground(r, 0, 32, 960, 508);
    statusBar(r, s.status, { buffsRight: true });

    const slots = placeMonsters(s.monsters, L.monsters);
    slots.forEach((sl) => drawMonster(r, sl, L.plate));
    if (s.breakStamp) breakStamp(r, slots[0].cx - slots[0].size * 1.25, slots[0].base - slots[0].size * 0.75);
    if (s.banner) speech(r, 480, 52, s.banner, '#ffffff');

    // 右边那块：算式
    r.rect({ x: L.formula.x - 10, y: L.formula.y - 30, w: L.formula.w + 20, h: 108, radius: 10, fill: '#0b0d12', alpha: 0.78 });
    txt(r, s.summary ? '这一下' : '排到这里', L.formula.x, L.formula.y - 16, { size: F.xs, weight: 'bold', color: T.text2 });
    formula(r, L.formula.x, L.formula.y, L.formula.w, { ...s.preview, lines: s.preview.lines.slice(0, 1) }, { compact: true });

    heroUnit(r, L.hero.cx, L.hero.base, L.hero.size);
    s.allies.forEach((a, i) => allyUnit(r, L.allies[i].cx, L.allies[i].base, L.allies[i].size, a, L.allies[i].say));

    if (s.chain.length) chainRow(r, { ...L.chain, chain: s.chain, fired: s.fired ?? -1 });
    else if (!s.summary) txt(r, s.hint || '点手牌排进链', 480, L.chain.y + 24, { size: F.s, align: 'center', color: T.text3 });
    if (s.summary) bigTotal(r, L.total.cx, L.total.cy, { ...s.summary, why: '' });
    drawFloaters(r, slots, s);

    r.rect({ ...L.tray, fill: '#07080c', alpha: 0.82 });
    r.line({ x1: 0, y1: L.tray.y, x2: 960, y2: L.tray.y, color: T.line, lineWidth: 1 });
    drawHand(r, s.hand, L.hand, L.hand.cw, L.hand.ch);
    colorRing(r, L.left.x + 36, L.left.y + 38, 20, s.recorded, s.current, 7);
    deckCounts(r, L.left.x + 82, L.left.y + 10, s.deck, 2, 46);
    txt(r, `牌堆 ${s.drawCount} · 弃 ${s.discardCount}`, L.left.x, L.left.y + 92, { size: F.xs, color: T.text2 });
    gemLevels(r, L.left.x, L.left.y + 110, s.gemLevels, 56);
    smallButton(r, L.right.x, L.right.y, 66, 24, '自动排');
    smallButton(r, L.right.x + 76, L.right.y, 66, 24, '撤回');
    castButton(r, L.right.x, L.right.y + 36, L.right.w, 70, s.chain.length ? '打出' : '结束回合', s.chain.length ? '空格' : '');
  },
};

// ─────────────────────────────────────────────
// 布局四：斜看圆台（照用户的像素堆叠样片改的）。
// 样片里每只怪都站在一块圆台中间，斜着往下看（压扁 0.6），左下角立着一个木桩当靶子。
// 这里就照这个摆：一块椭圆的地面，主角和队友站左下（近处），怪站右上（远处），斜对角对着打；
// 血、盾、倒计时挂在头顶（美术方案里的 headZ 挂点），飘字在身子中间（centerZ）。
// 中间那栏、链、手牌、左下、右下，跟布局一一样。
// ─────────────────────────────────────────────
function ellipsePts(cx, cy, rx, ry, n = 64) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return pts;
}

function stageGround(r, st) {
  r.polygon({ points: ellipsePts(st.cx, st.cy + 10, st.rx + 6, st.ry + 6), fill: '#000000', alpha: 0.35 });
  r.polygon({ points: ellipsePts(st.cx, st.cy, st.rx, st.ry), fill: st.fill, stroke: st.rim, lineWidth: 10 });
  // 地面上几块深浅的斑，代替以后每种地方各自的地面花纹
  const spots = [[-300, -60, 90, 30], [-120, 40, 120, 38], [80, -90, 100, 30], [260, 10, 110, 36], [-20, 120, 140, 34], [200, 130, 90, 26], [-260, 90, 80, 24], [330, -60, 70, 22]];
  spots.forEach(([dx, dy, rx, ry], i) => r.polygon({ points: ellipsePts(st.cx + dx, st.cy + dy, rx, ry, 24), fill: i % 2 ? st.dark : st.light, alpha: 0.55 }));
  r.polygon({ points: ellipsePts(st.cx, st.cy, st.rx - 8, st.ry - 6), stroke: st.rimHi, lineWidth: 2, alpha: 0.6 });
}

/** 头顶一块：倒计时和下一手 / 血 / 盾 / 特性，跟着怪的头顶走 */
function headPlate(r, slot) {
  const { m, cx, base, size } = slot;
  const pw = Math.max(92, Math.min(170, size * 1.05));
  const x0 = cx - pw / 2;
  const rows = 3 + (m.traits.length ? 1 : 0);
  let y = base - size - 4 - rows * 19;
  r.rect({ x: x0 - 6, y: y - 14, w: pw + 12, h: rows * 19 + 12, radius: 8, fill: '#07080c', alpha: 0.62 });
  countdown(r, x0 + 12, y, m.countdown, m.intent, { size: 12 });
  if (m.tier !== 'normal') tierTag(r, x0 + pw, y, m.tier, 'right');
  y += 16;
  hpBar(r, x0, y, pw, m, 12);
  y += 22;
  shieldRow(r, x0, y - 4, m, { cell: 10, align: 'center', w: pw });
  y += 20;
  m.traits.forEach((t) => traitChip(r, cx, y, t, 'center'));
}

const STAGE_SPOTS = {
  1: [{ x: 660, y: 262, s: 150 }],
  2: [{ x: 600, y: 258, s: 140 }, { x: 800, y: 236, s: 104 }],
  3: [{ x: 570, y: 262, s: 136 }, { x: 730, y: 222, s: 92 }, { x: 860, y: 258, s: 92 }],
  4: [{ x: 540, y: 266, s: 130 }, { x: 676, y: 222, s: 86 }, { x: 784, y: 252, s: 86 }, { x: 892, y: 222, s: 86 }],
};

export const LAYOUT_4 = {
  id: 4,
  name: '斜看圆台',
  regions: {
    bar: { x: 0, y: 0, w: 960, h: 32 },
    stage: { cx: 470, cy: 214, rx: 470, ry: 176, fill: '#283326', light: '#34432f', dark: '#1f281d', rim: '#3a404c', rimHi: '#6a7384' },
    buffs: { x: 14, y: 42, size: 26 },
    hero: { cx: 250, base: 338, size: 92 },
    allies: [{ cx: 132, base: 300, size: 62 }, { cx: 360, base: 344, size: 58 }, { cx: 116, base: 352, size: 58 }],
    middle: { x: 226, y: 92, w: 190, cx: 322 },
    monsters: STAGE_SPOTS,
    tray: { x: 0, y: 352, w: 960, h: 188 },
    chain: { x: 200, y: 356, w: 560, h: 48, maxCard: 40 },
    hand: { cx: 480, y: 422, cw: 78, ch: 108 },
    left: { x: 12, y: 418 },
    right: { x: 806, y: 418, w: 142 },
  },
  draw(r, s) {
    const L = this.regions;
    r.clear('#0d0f14');
    stageGround(r, L.stage);
    statusBar(r, s.status);
    s.status.buffs.forEach((b, i) => buffIcon(r, L.buffs.x + i * (L.buffs.size + 6), L.buffs.y, b, L.buffs.size));

    const spots = L.monsters[s.monsters.length];
    const slots = s.monsters.map((m, i) => ({ m, cx: spots[i].x, base: spots[i].y, size: spots[i].s, w: spots[i].s * 1.2 }));
    // 远的先画、近的后画
    s.allies.forEach((a, i) => allyUnit(r, L.allies[i].cx, L.allies[i].base, L.allies[i].size, a));
    heroUnit(r, L.hero.cx, L.hero.base, L.hero.size);
    [...slots].sort((a, b) => a.base - b.base).forEach((sl) => {
      const look = MONSTER_LOOK[sl.m.tier];
      if (sl.m.selected && !sl.m.dead) targetRing(r, sl.cx, sl.base, sl.size * 0.9);
      stackSprite(r, sl.cx, sl.base, sl.size, { ...look, alpha: sl.m.dead ? 0.25 : 1 });
      if (sl.m.flash && !sl.m.dead) r.rect({ x: sl.cx - sl.size * 0.38, y: sl.base - sl.size * 0.85, w: sl.size * 0.76, h: sl.size * 0.78, radius: 10, fill: '#ffffff', alpha: 0.12 });
      if (sl.m.dead) txt(r, '打倒了', sl.cx, sl.base - sl.size * 0.45, { size: F.s, align: 'center', color: T.text3 });
    });
    slots.forEach((sl) => { if (!sl.m.dead) headPlate(r, sl); });
    if (s.breakStamp) breakStamp(r, slots[0].cx - slots[0].size * 1.3, slots[0].base - slots[0].size * 0.15);

    if (s.banner) speech(r, L.middle.cx, 58, s.banner, '#ffffff');
    if (s.summary) {
      bigTotal(r, L.middle.cx, L.middle.y + 30, { ...s.summary, why: '' });
      s.summary.why.split(' · ').forEach((ln, i) => txt(r, ln, L.middle.cx, L.middle.y + 66 + i * 17, { size: F.xs, align: 'center', color: ln.startsWith('队友') ? '#ffd9a8' : T.text2 }));
    } else {
      r.rect({ x: L.middle.x - 10, y: L.middle.y - 12, w: L.middle.w + 20, h: 124, radius: 10, fill: '#07080c', alpha: 0.6 });
      formula(r, L.middle.x, L.middle.y, L.middle.w, s.preview, { compact: true });
    }
    drawFloaters(r, slots, s);

    r.rect({ ...L.tray, fill: '#07080c', alpha: 0.86 });
    r.line({ x1: 0, y1: L.tray.y, x2: 960, y2: L.tray.y, color: T.line, lineWidth: 1 });
    if (s.chain.length) chainRow(r, { ...L.chain, chain: s.chain, fired: s.fired ?? -1 });
    else if (!s.summary) txt(r, s.hint || '点手牌排进链', 480, L.chain.y + 24, { size: F.s, align: 'center', color: T.text3 });
    drawHand(r, s.hand, L.hand, L.hand.cw, L.hand.ch);
    colorRing(r, L.left.x + 38, L.left.y + 36, 20, s.recorded, s.current, 7);
    deckCounts(r, L.left.x + 84, L.left.y + 12, s.deck, 2, 46);
    txt(r, `牌堆 ${s.drawCount} · 弃 ${s.discardCount}`, L.left.x + 2, L.left.y + 92, { size: F.xs, color: T.text2 });
    gemLevels(r, L.left.x + 2, L.left.y + 110, s.gemLevels, 56);
    smallButton(r, L.right.x, L.right.y, 66, 24, '自动排');
    smallButton(r, L.right.x + 76, L.right.y, 66, 24, '撤回');
    castButton(r, L.right.x, L.right.y + 36, L.right.w, 70, s.chain.length ? '打出' : '结束回合', s.chain.length ? '空格' : '');
  },
};

export const LAYOUTS = { 1: LAYOUT_1, 2: LAYOUT_2, 3: LAYOUT_3, 4: LAYOUT_4 };
