'use strict';
// 一仗的规则：照搬 card-web/src/rules.js 和 config.js（已定 3.x），只留一只怪（提可）用得上的部分。
// 色环索引：红、黄、绿、青、蓝、紫；6 白（圆心），7 变色，8 无色。
const R = {
  hearts: 3, handSize: 8, maxHandSize: 12, turnLimit: 10,
  baseDamage: 5, gemLevelStep: 10, gemLevelGrowth: 1.2,
  multiplier: 2, critChance: 0.1, critFactor: 1.5, rainbowFactor: 3,
  hpNormal: 3000, countdown: 4, dimPerLamp: 0.1, attacksBeforeRage: 2,
  lootCount: 3, colors: ['红', '黄', '绿', '青', '蓝', '紫', '白', '变色', '无色'],
  masks: [1, 3, 2, 6, 4, 5, 7],
  deckCounts: [5, 4, 5, 4, 5, 4, 2],
  loot: ['lens', 'rain', 'light', 'mirror', 'ice', 'shield'],
  extras: {
    lens: { name: '增幅法阵', col: 4, vals: [0, 0, 1], text: '倍率 ×2' },
    rain: { name: '烈焰弹幕', col: 0, vals: [1, 0, 0], text: '再打 4 × 倍率 发，每发 3' },
    light: { name: '引灯咒', col: 8, vals: [0, 0, 0], text: '点亮当前色两边没亮的灯（最多 2 盏）' },
    mirror: { name: '逆色术', col: 7, vals: [0, 0, 0], text: '变成当前色的补色' },
    ice: { name: '破甲冰矛', col: 8, vals: [0, 0, 0], text: '固定伤害 60（不吃倍率，不怕特性）' },
    shield: { name: '坚盾术', col: 8, vals: [0, 0, 0], instant: true, text: '挡掉怪的下一次攻击' },
  },
  rainHits: 4, rainPoints: 3, iceDamage: 60, relight: 2,
};
const MONSTERS = {
  tiko: { name: '提可', trait: 'hide', traitName: '躲光', attackDamage: .5, color: [110, 150, 255],
    rule: '回合开始时你每亮着一盏色灯，它这回合少受一成伤害' },
};
const GEM_ARTS = ['red', 'green', 'blue'];
const CN_UNITS = ['', '万', '亿', '兆', '京', '垓', '秭', '穰', '沟', '涧', '正', '载'];
function formatCN(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  if (n < 100000) return String(n);
  let v = n, unit = 0;
  while (v >= 100000 && unit < CN_UNITS.length - 1) { v /= 10000; unit++; }
  return Math.floor(v) + ' ' + CN_UNITS[unit];
}
const maskVals = col => { const m = R.masks[col] || 0; return [m & 1 ? 1 : 0, m & 2 ? 1 : 0, m & 4 ? 1 : 0]; };
const gemCard = col => ({ id: 'gem', name: R.colors[col] + '宝石', col, vals: maskVals(col), text: '每颗宝石打倍率发' });
const extraCard = id => ({ id, ...R.extras[id] });
function startDeck() {
  const d = [];
  R.deckCounts.forEach((n, col) => { for (let i = 0; i < n; i++) d.push(gemCard(col)); });
  return d;
}
const gemThreshold = level => Math.max(1, level) * R.gemLevelStep;
const gemPower = (gems, j) => R.gemLevelGrowth ** Math.max(0, (gems?.[j]?.level ?? 1) - 1);

function newRun(seed, deck) {
  return { seed, rng: rngFrom(seed), deck: deck || startDeck(), hearts: R.hearts,
    gems: [{ level: 1, exp: 0 }, { level: 1, exp: 0 }, { level: 1, exp: 0 }], wins: 0, maxTurn: 0 };
}
function addCardToHand(b, card) {
  if (b.hand.length >= R.maxHandSize) { b.discard.push(card); return false; }
  b.hand.push(card); b.drawn.push(card); return true;
}
function refill(b, target) {
  while (b.hand.length < target) {
    if (!b.draw.length) { if (!b.discard.length) break; b.draw = shuffle(b.discard.splice(0), b.rng); }
    if (!addCardToHand(b, b.draw.pop())) break;
  }
}
function startFight(run, kind) {
  const base = MONSTERS[kind];
  const b = {
    monster: { ...base, kind, maxHp: R.hpNormal, hp: R.hpNormal, countdown: R.countdown, attacks: 0 },
    turn: 1, hand: [], line: [], draw: shuffle([...run.deck], run.rng), discard: [], drawn: [],
    lamps: 0, cursor: -1, multiplier: 1, rng: run.rng, shield: 0, gems: run.gems, pendingGemExp: [0, 0, 0],
  };
  refill(b, R.handSize);
  return b;
}
function playInstant(b, i) {
  const card = b.hand[i]; if (!card || !card.instant) return null;
  b.hand.splice(i, 1); b.discard.push(card);
  if (card.id === 'shield') b.shield++;
  return card;
}
function queueCard(b, i) { const c = b.hand[i]; if (!c || c.instant) return false; b.line.push(b.hand.splice(i, 1)[0]); return true; }
function undoLast(b) { if (!b.line.length) return false; b.hand.push(b.line.pop()); return true; }
function undoAll(b) { if (!b.line.length) return false; b.hand.push(...b.line.splice(0)); return true; }

function resolved(card, cursor) {
  if (card.id !== 'mirror') return card;
  const col = cursor >= 0 && cursor < 6 ? (cursor + 3) % 6 : 6;
  return { ...card, col, vals: maskVals(col) };
}
function relation(col, cursor) {
  if (col === 8) return '无色';
  if (cursor < 0) return '起色';
  if (cursor === 6 || col === 6) return '百搭';
  const d = Math.abs(cursor - col);
  return ['同色', '邻色', '断色', '补色'][Math.min(d, 6 - d)];
}
function lampCount(l) { let n = 0; for (let i = 0; i < 6; i++) n += (l >> i) & 1; return n; }
function lightNeighbors(lamps, cursor) {
  const pos = cursor >= 0 && cursor < 6 ? [(cursor + 1) % 6, (cursor + 5) % 6] : [0, 1, 2, 3, 4, 5];
  let n = 0;
  for (const p of pos) { if (lamps & (1 << p)) continue; lamps |= 1 << p; if (++n === R.relight) break; }
  return lamps;
}
function hintText(rel, before, lamps, rainbow, card) {
  if (card.instant) return '立即释放';
  if (rainbow) return '彩虹 ×' + R.rainbowFactor;
  if (rel === '补色') return '合白·灭灯';
  if (rel === '断色') return '断色·灭灯';
  if (lampCount(lamps) === 5) return '差一盏彩虹';
  if (lamps !== before) return rel === '无色' ? '点灯' : rel + '·亮灯';
  return rel === '无色' ? card.name : rel;
}
function segmentDamage(seg, mon, lamps) {
  const reduction = !seg.pure && mon?.trait === 'hide' ? R.dimPerLamp * 10 * lampCount(lamps) : 0;
  return Math.max(1, Math.round(seg.value * (10 - reduction) / 10));
}
function preview(b, cards = b.line) {
  let cursor = b.cursor, lamps = b.lamps, multiplier = 1, rainbow = false;
  const batches = [], states = [];
  const add = (i, count, base, power, art, o = {}) => { if (count > 0) batches.push({ cardIndex: i, count, base, power, art, white: !!o.white, pure: !!o.pure, gemColor: o.gemColor ?? -1 }); };
  for (let i = 0; i < cards.length; i++) {
    const raw = cards[i];
    if (raw.instant) { states.push({ card: raw, relation: '无色', hint: '立即释放', lamps, cursor, multiplier, rainbow: false, total: 0, max: 0, shots: 0 }); continue; }
    const card = resolved(raw, cursor), { col, vals, id } = card, rel = relation(col, cursor), before = lamps;
    let triggered = false;
    if (col !== 8) {
      if (rel !== '起色' && rel !== '断色') multiplier *= R.multiplier;
      const bit = col < 6 ? 1 << col : 0;
      lamps = rel === '补色' || rel === '断色' ? bit : lamps | bit;
      for (let j = 0; j < 3; j++) if (vals[j]) add(i, multiplier, R.baseDamage, gemPower(b.gems, j), GEM_ARTS[j], { gemColor: j });
      if (rel === '补色') for (let j = 0; j < 3; j++) add(i, multiplier, R.baseDamage, gemPower(b.gems, j), 'white', { white: true, gemColor: j });
      cursor = col;
    }
    if (id === 'lens') multiplier *= R.multiplier;
    if (id === 'rain') add(i, R.rainHits * multiplier, R.rainPoints, 1, 'extra');
    if (id === 'light') lamps = lightNeighbors(lamps, cursor);
    if (id === 'ice') add(i, 1, R.iceDamage, 1, 'pure', { pure: true });
    if (col !== 8 && !rainbow && lamps === 0b111111) { triggered = rainbow = true; lamps = col < 6 ? 1 << col : 0; }
    states.push({ card, relation: rel, hint: hintText(rel, before, lamps, triggered, card), lamps, cursor, multiplier, rainbow: triggered, total: 0, max: 0, shots: 0 });
  }
  const rm = rainbow ? R.rainbowFactor : 1;
  let total = 0, max = 0;
  for (const bt of batches) {
    bt.cardCol = states[bt.cardIndex].card.col;
    bt.raw = bt.base * bt.power * rm;
    bt.perShot = segmentDamage({ ...bt, value: bt.raw }, b.monster, b.lamps);
    const crit = segmentDamage({ ...bt, value: bt.raw * R.critFactor }, b.monster, b.lamps);
    const st = states[bt.cardIndex];
    st.total += bt.perShot * bt.count; st.max += crit * bt.count; st.shots += bt.count;
    total += bt.perShot * bt.count; max += crit * bt.count;
  }
  return { states, batches, cursor, lamps, multiplier, rainbow, total, max };
}
// 展开成一发一发；同一张牌的发打乱顺序。发数太多时按包合并（每包显示单发伤害）。
function startCast(b) {
  const plan = preview(b);
  plan.damage = 0; plan.startLamps = b.lamps; plan.segments = [];
  const byCard = plan.states.map(() => []);
  for (const bt of plan.batches) {
    const list = byCard[bt.cardIndex];
    const pushSeg = (crit, count) => list.push({ cardIndex: bt.cardIndex, value: bt.raw * (crit ? R.critFactor : 1), art: bt.art, white: bt.white, pure: bt.pure, gemColor: bt.gemColor, crit, count });
    if (bt.count <= 400) { for (let i = 0; i < bt.count; i++) pushSeg(b.rng() < R.critChance, 1); }
    else {
      const crits = Math.round(bt.count * R.critChance), normals = bt.count - crits;
      for (const [n, crit] of [[normals, false], [crits, true]]) {
        const parts = Math.min(n, crit ? 12 : 60), each = Math.floor(n / parts); let rem = n - each * parts;
        for (let i = 0; i < parts; i++) pushSeg(crit, each + (rem-- > 0 ? 1 : 0));
      }
    }
  }
  for (const list of byCard) { shuffle(list, b.rng); plan.segments.push(...list); }
  return plan;
}
function applyHit(run, b, plan, seg) {
  const mon = b.monster, per = segmentDamage(seg, mon, plan.startLamps), dealt = per * seg.count;
  const before = mon.hp;
  mon.hp = Math.max(0, mon.hp - dealt);
  plan.damage += dealt;
  return { damage: per, total: dealt, killed: before > 0 && mon.hp === 0 };
}
function endCast(run, b, plan) {
  b.lamps = plan.lamps; b.cursor = plan.cursor; b.multiplier = plan.multiplier;
  run.maxTurn = Math.max(run.maxTurn, plan.damage);
  for (const st of plan.states) { const v = st.card?.vals; if (v) for (let j = 0; j < 3; j++) if (v[j]) b.pendingGemExp[j]++; }
  b.discard.push(...b.line.splice(0));
  const mon = b.monster;
  if (mon.hp > 0) { mon.countdown--; if (mon.countdown <= 0) { mon.countdown = 0; return true; } }
  return false;
}
function attack(run, b) {
  const mon = b.monster, blocked = b.shield > 0;
  if (blocked) b.shield--;
  else run.hearts = Math.max(0, Math.round((run.hearts - mon.attackDamage) * 2) / 2);
  mon.attacks++;
  mon.countdown = mon.attacks >= R.attacksBeforeRage ? 1 : Math.max(1, R.countdown - mon.attacks);
  return { blocked, damage: blocked ? 0 : mon.attackDamage };
}
function settleGems(run, b) {
  const ups = [];
  for (let j = 0; j < 3; j++) {
    const got = b.pendingGemExp[j]; b.pendingGemExp[j] = 0; if (!got) continue;
    const g = run.gems[j], from = g.level; g.exp += got;
    while (g.exp >= gemThreshold(g.level)) { g.exp -= gemThreshold(g.level); g.level++; }
    if (g.level > from) ups.push({ color: j, to: g.level });
  }
  return ups;
}
function finishTurn(run, b) {
  b.levelUps = settleGems(run, b);
  if (b.monster.hp <= 0) { run.wins++; return 'win'; }
  if (run.hearts <= 0) return 'dead';
  if (b.turn >= R.turnLimit) return 'limit';
  b.turn++; b.shield = 0; b.multiplier = 1;
  refill(b, R.handSize);
  return 'next';
}
function lootChoices(run) { return shuffle([...R.loot], run.rng).slice(0, R.lootCount).map(extraCard); }
