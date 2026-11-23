// 布局五：上下布局（用户 2026-11-23 定的方向）。
// 就在森林那片空地上打：怪在上面，主角和队友在下面背对着我们，手牌在最下面排成一道弧。
// 怪头顶只有一根血条 + 一条盾（韧性）+ 几个小图标；细节鼠标放上去才出来。
// 这一页会动：排链 → 打出 → 一张张飞出去 → 数字炸开 → 合白 / 破盾 / 队友补刀 / 彩虹 → 总数 → 怪的回合。
// draw(r, scene, t)：t < 0 是还在排链；t ≥ 0 是点了打出以后第 t 秒。

import { COLOR_META, COLOR_RING } from '../../shared/index.js';
import {
  F, LANE, T, bold, buffIcon, chainJoint, colorRing, fnCard, gemCard, gemDot, hearts, rainbowText,
  smallButton, stackSprite, swatch, txt,
} from './kit.js';

// ─────────────── 区域表（以后就是 battle-view/layout.js） ───────────────
export const REGIONS = Object.freeze({
  bar: { h: 30 },
  monsters: {
    1: [{ x: 480, y: 232, s: 150 }],
    2: [{ x: 400, y: 232, s: 130 }, { x: 592, y: 220, s: 104 }],
    3: [{ x: 480, y: 236, s: 130 }, { x: 300, y: 212, s: 92 }, { x: 660, y: 212, s: 92 }],
    4: [{ x: 420, y: 238, s: 124 }, { x: 250, y: 210, s: 84 }, { x: 592, y: 214, s: 84 }, { x: 744, y: 202, s: 84 }],
  },
  overhead: { gap: 12, barH: 6, toughH: 4, minW: 64, maxW: 112 },
  chain: { cx: 480, y: 270, h: 44, maxCard: 34, gap: 12, maxW: 560 },
  ring: { cx: 118, cy: 292, rad: 17, dot: 6 },
  preview: { x: 772, y: 258, w: 176, h: 70 },
  total: { cx: 480, cy: 292 },
  hero: { cx: 480, base: 398, size: 60 },
  allies: [{ cx: 392, base: 392, size: 48 }, { cx: 568, base: 392, size: 48 }, { cx: 316, base: 386, size: 46 }],
  hand: { cx: 480, pivotY: 1105, radius: 650, cw: 78, ch: 108, stepDeg: 7, maxSpreadDeg: 36, crowd: 8, crowdScale: 0.86 },
  pile: { x: 16, y: 436 },
  cast: { cx: 884, cy: 478, r: 42 },
});

const LANE_COLOR = Object.fromEntries(Object.entries(LANE).map(([k, v]) => [k, v.color]));

// ─────────────── 小工具 ───────────────
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - clamp(k, 0, 1)) ** 3;
const pop = (k) => { // 弹一下：0→1.25→1
  const x = clamp(k, 0, 1);
  return x < 0.4 ? lerp(0.6, 1.25, x / 0.4) : lerp(1.25, 1, (x - 0.4) / 0.6);
};
const life = (t, t0, dur) => (t - t0) / dur; // 0..1 在播，<0 没开始，>1 播完
const multOf = (m) => Number(String(m).replace('×', ''));

function ellipse(r, cx, cy, rx, ry, o) {
  const pts = [];
  for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }); }
  r.polygon({ points: pts, ...o });
}

function heartIcon(r, x, y, s, fill = T.heart) {
  const pts = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * Math.PI * 2;
    pts.push({ x: x + (16 * Math.sin(t) ** 3 * s) / 34, y: y - ((13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s) / 34 });
  }
  r.polygon({ points: pts, fill });
}

// ─────────────── 背景：森林里那片空地 ───────────────
function forest(r) {
  r.clear('#141b14');
  r.rect({ x: 0, y: 0, w: 960, h: 540, fill: '#1a2419' });
  const patches = [[200, 300, 260, 90, '#1f2b1d'], [700, 330, 300, 100, '#1f2b1d'], [480, 200, 380, 120, '#202d1e'], [480, 420, 420, 110, '#1d281b'], [120, 180, 150, 60, '#1d281b'], [850, 170, 140, 50, '#1d281b']];
  patches.forEach(([x, y, rx, ry, c]) => ellipse(r, x, y, rx, ry, { fill: c }));
  // 草丛的小块
  for (let i = 0; i < 70; i++) {
    const x = (i * 137) % 960;
    const y = 60 + ((i * 89) % 440);
    r.rect({ x, y, w: 3, h: 6, fill: i % 3 ? '#2b3a27' : '#33452d' });
    r.rect({ x: x + 4, y: y + 2, w: 3, h: 4, fill: '#2b3a27' });
  }
  // 四周的树：上边一排，两边各几棵（只占边，不挡中间）
  const trees = [[40, 40, 70], [150, 10, 80], [290, 0, 70], [420, -20, 70], [560, -18, 72], [690, 2, 76], [820, 14, 80], [930, 46, 72], [-10, 170, 70], [970, 190, 70], [-20, 330, 80], [980, 350, 80]];
  trees.forEach(([x, y, rr]) => {
    ellipse(r, x + 10, y + rr * 0.7, rr * 0.9, rr * 0.35, { fill: '#000000', alpha: 0.25 });
    r.circle({ x, y, r: rr, fill: '#132414' });
    r.circle({ x: x - rr * 0.25, y: y - rr * 0.2, r: rr * 0.6, fill: '#183019' });
  });
  // 四角压暗，把眼睛往中间引
  r.rect({ x: 0, y: 0, w: 960, h: 70, fill: '#000000', alpha: 0.18 });
}

// ─────────────── 怪头顶：一根血条 + 一条盾 + 几个小图标 ───────────────
function overhead(r, m, sl, st, now) {
  const O = REGIONS.overhead;
  const w = clamp(sl.s * 0.75, O.minW, O.maxW);
  const x = sl.x - w / 2;
  const y = sl.y - sl.s - O.gap + (st.lift || 0);
  const edge = m.tier === 'gatekeeper' ? '#a98bff' : m.tier === 'elite' ? T.gold : '#000000';
  // 几条血：左边小竖块
  let bx = x;
  if (m.bars > 1) {
    for (let i = 0; i < m.bars; i++) {
      r.rect({ x: bx, y: y - 1, w: 3, h: O.barH + O.toughH + 3, radius: 1, fill: i < m.bars - st.barIndex ? T.hp : '#3a3f4e' });
      bx += 5;
    }
    bx += 2;
  }
  const bw = w - (bx - x);
  r.rect({ x: bx - 1, y: y - 1, w: bw + 2, h: O.barH + 2, radius: 3, fill: '#0b0d12', stroke: edge, lineWidth: m.tier === 'normal' ? 0 : 1.2 });
  const ratio = clamp(st.hp / st.maxHp, 0, 1);
  const lagRatio = clamp(st.hpLag / st.maxHp, 0, 1);
  if (lagRatio > ratio) r.rect({ x: bx, y, w: bw * lagRatio, h: O.barH, radius: 2, fill: '#ffd0d0' }); // 刚掉的那截先变浅再缩
  if (ratio > 0) r.rect({ x: bx, y, w: Math.max(2, bw * ratio), h: O.barH, radius: 2, fill: st.barFlash ? '#ffffff' : T.hp });
  if (st.ghost > 0 && ratio > 0) { // 排链时：这条链大概能打掉多少，浅色一截
    const gx = bx + bw * clamp((st.hp - st.ghost) / st.maxHp, 0, 1);
    r.rect({ x: gx, y, w: bx + bw * ratio - gx, h: O.barH, fill: '#ffffff', alpha: 0.35 + 0.25 * Math.sin(now * 6) });
  }
  // 盾（韧性）：血条下面一条，一格一段
  const ty = y + O.barH + 2;
  if (st.broken) {
    r.rect({ x: bx, y: ty, w: bw, h: O.toughH, radius: 2, fill: T.breakCol, alpha: 0.5 + 0.3 * Math.sin(now * 8) });
  } else if (st.shields.length) {
    const cells = st.shields.flatMap((s) => Array.from({ length: s.max }, (_, k) => ({ c: s.color, on: k < s.cur, blink: k < s.cur && k >= s.cur - (st.willShred?.[s.color] || 0) })));
    const cw = (bw - (cells.length - 1)) / cells.length;
    cells.forEach((c, i) => {
      const blinkA = c.blink ? 0.35 + 0.65 * Math.abs(Math.sin(now * 5)) : 1;
      r.rect({ x: bx + i * (cw + 1), y: ty, w: cw, h: O.toughH, fill: c.on ? swatch(c.c) : '#20242f', alpha: c.on ? blinkA : 1 });
    });
  }
  // 上面一行小图标：倒计时（+ 打几颗心）、特性、破盾
  const iy = y - 11;
  const urgent = st.countdown <= 1;
  const pulse = urgent ? 1 + 0.12 * Math.sin(now * 7) : 1;
  r.transform({ x: x + 8, y: iy, scale: pulse * (st.cdPop || 1) }, () => {
    r.circle({ x: 0, y: 0, r: 8, fill: urgent ? '#9a1c2a' : '#0b0d12', stroke: urgent ? T.danger : '#8a96b4', lineWidth: 1.5 });
    txt(r, String(st.countdown), 0, 1, { size: F.xs, weight: 'bold', align: 'center' });
  });
  if (st.cdPlusAt != null && st.tnow - st.cdPlusAt >= 0 && st.tnow - st.cdPlusAt < 0.9) { // 破盾把倒计时往后推了 1 格
    const k = (st.tnow - st.cdPlusAt) / 0.9;
    bold(r, '+1', x + 8, iy - 14 - k * 10, { size: F.s, color: T.breakCol, align: 'center', alpha: 1 - k });
  }
  heartIcon(r, x + 23, iy + 1, 11, urgent ? T.heart : '#b0566a');
  txt(r, m.intent === 0.5 ? '½' : String(m.intent), x + 31, iy + 1, { size: F.xs, weight: 'bold', color: urgent ? '#ffb3ba' : T.text2 });
  let ix = x + w;
  const icons = [...(st.broken ? [{ g: '破', c: T.breakCol }] : []), ...(st.traits || []).map((tr) => ({ g: tr.glyph, c: '#c9b6f2' }))];
  icons.reverse().forEach((ic) => {
    ix -= 15;
    r.rect({ x: ix, y: iy - 7, w: 14, h: 14, radius: 3, fill: '#0b0d12', stroke: ic.c, lineWidth: 1 });
    txt(r, ic.g, ix + 7, iy, { size: 10, weight: 'bold', align: 'center', color: ic.c });
  });
  if (m.selected && st.alive) {
    r.polygon({ points: [{ x: sl.x - 6, y: iy - 20 }, { x: sl.x + 6, y: iy - 20 }, { x: sl.x, y: iy - 12 }], fill: T.select });
  }
}

/** 鼠标放到怪身上才出来的细节 */
function monsterTooltip(r, m, sl, st) {
  const lines = [
    [`${m.tier === 'gatekeeper' ? '看门的' : m.tier === 'elite' ? '精英' : '普通'} · 第 ${st.barIndex + 1} / ${m.bars} 条血`, T.text2],
    [`血 ${Math.round(st.hp)} / ${st.maxHp}`, T.text],
    [st.broken ? '盾破了：受到的伤害 ×1.5，出完手回满' : `盾 ${st.shields.map((s) => `${COLOR_META[s.color].label} ${s.cur}/${s.max}`).join(' · ')}；削完了就破`, st.broken ? T.breakCol : T.text],
    [`${st.countdown} 回合后出手：打 ${m.intent === 0.5 ? '半' : m.intent} 颗心`, st.countdown <= 1 ? '#ffb3ba' : T.text],
    ...(st.traits || []).map((tr) => [`特性：${tr.text}`, '#d9ccf2']),
    ['点一下：选它当目标', T.text3],
  ];
  const w = 250;
  const h = 16 + lines.length * 20;
  const x = clamp(sl.x + sl.s * 0.45 + 14, 8, 952 - w);
  const y = clamp(sl.y - sl.s - 20, 36, 400 - h);
  r.rect({ x, y, w, h, radius: 8, fill: '#0b0d12', stroke: '#576685', lineWidth: 1.2, alpha: 0.96 });
  lines.forEach(([s, c], i) => txt(r, s, x + 12, y + 18 + i * 20, { size: i === 1 ? F.m : F.s, weight: i === 1 ? 'bold' : 'normal', color: c }));
}

// ─────────────── 弧形手牌 ───────────────
export function fanSlots(n, hoverIdx = -1) {
  const H = REGIONS.hand;
  if (n === 0) return [];
  const step = n > 1 ? Math.min(H.stepDeg, H.maxSpreadDeg / (n - 1)) : 0;
  const base = n > H.crowd ? H.crowdScale : 1; // 手里多于 8 张：整体缩一点，两头的宝石点才不会掉出画面
  return Array.from({ length: n }, (_, i) => {
    const deg = (i - (n - 1) / 2) * step;
    const a = (deg * Math.PI) / 180;
    let x = H.cx + H.radius * Math.sin(a);
    let y = H.pivotY - H.radius * Math.cos(a);
    // 悬停的那张：抬起来、摆正、放大；两边的往外让一点
    if (hoverIdx >= 0 && i !== hoverIdx) x += (i < hoverIdx ? -1 : 1) * 16;
    const hovered = i === hoverIdx;
    if (hovered) y -= 34;
    return { x, y, rot: hovered ? 0 : a, scale: hovered ? 1.16 : base, hovered };
  });
}

function drawHandCard(r, c, slot, H, alpha = 1) {
  r.withAlpha(alpha, () => r.transform({ x: slot.x, y: slot.y, rotate: slot.rot, scale: slot.scale }, () => {
    const x = -H.cw / 2;
    const y = -H.ch / 2;
    if (c.fn) fnCard(r, { x, y, w: H.cw, h: H.ch, text: c.text, color: c.color, draw: c.draw ?? 1, instant: !c.color });
    else gemCard(r, { x, y, w: H.cw, h: H.ch, color: c.color, gems: c.gems, glow: c.glow, dim: c.dim && !slot.hovered });
  }));
}

// ─────────────── 链的位置 ───────────────
function chainSlots(n) {
  const C = REGIONS.chain;
  const cw = Math.min(C.maxCard, (C.maxW - C.gap * (n - 1)) / n);
  const ch = Math.min(C.h, cw * 1.3);
  const total = cw * n + C.gap * (n - 1);
  const sx = C.cx - total / 2;
  return Array.from({ length: n }, (_, i) => ({ x: sx + i * (cw + C.gap), y: C.y + (C.h - ch), w: cw, h: ch, cx: sx + i * (cw + C.gap) + cw / 2, cy: C.y + (C.h - ch) + ch / 2 }));
}

// ─────────────── 把一个场面 + 时间算成「现在每样东西什么样」 ───────────────
function buildTimeline(s) {
  const iv = s.interval ?? 0.16;
  const flight = 0.32;
  const ev = [];
  let t = 0;
  s.chain.forEach((c, i) => {
    const fire = i * iv;
    ev.push({ k: 'fire', i, t: fire });
    ev.push({ k: 'hit', i, t: fire + flight, target: s.target ?? 0, dmg: c.dmg, hits: c.hits, per: c.per, critShare: c.critShare, critPer: c.critPer, kind: 'normal', shred: c.shred });
    if (c.white) ev.push({ k: 'white', i, t: fire + flight + 0.08, hits: c.white.hits, per: c.white.per });
    if (c.ally) ev.push({ k: 'ally', t: fire + flight + 0.28, ally: c.ally });
    t = Math.max(t, fire + flight, c.ally ? fire + flight + 0.28 + 0.3 : 0); // 队友那一刀砍完才算打完
  });
  if (s.rainbow) {
    ev.push({ k: 'rainbowRing', t: t + 0.25 });
    s.rainbow.forEach((p, j) => ev.push({ k: 'hit', i: -1, t: t + 0.45 + j * 0.3, target: s.target ?? 0, dmg: p.hits * p.per, hits: p.hits, per: p.per, kind: 'rainbow' }));
    t += 0.45 + s.rainbow.length * 0.3;
  }
  ev.push({ k: 'total', t: t + 0.35 });
  ev.push({ k: 'monsterTurn', t: t + 1.6 });
  if (s.attack) ev.push({ k: 'attackReset', t: t + 2.5 });
  ev.sort((a, b) => a.t - b.t);
  return { ev, end: t + 3.4, totalT: t + 0.35, monT: t + 1.6 };
}

function stateAt(s, t) {
  const tl = buildTimeline(s);
  const now = Math.max(0, t);
  const ms = s.monsters.map((m) => ({
    hp: m.hp, hpLag: m.hp, maxHp: m.maxHp, barIndex: m.barIndex, shields: m.shields.map((x) => ({ ...x })), broken: !!m.broken,
    countdown: m.countdown, alive: !m.dead, deadAt: m.dead ? -10 : null, flashUntil: -1, recoilAt: -10, brokeAt: -10, barSwitchAt: -10, lift: 0,
    traits: m.traits,
  }));
  const fx = { hits: [], floaters: [], whites: [], allyAt: [], slashes: [], frags: [], rainbowAt: -10, totalAt: -10, monAt: -10, fired: -1 };
  // 飘字（设计稿 5.3）：一发一个数，数是这一发打了多少。同一张牌的几发连着冒出来；
  // 一张牌最多冒 packBudget 个，发数再多就几发合成一包，包上还是写一发多少。
  const emit = (m, t0, hits, per, kind, critShare = 0, critPer = 0) => {
    const budget = (s.packBudget ?? 8) * (kind === 'rainbow' ? 3 : 1); // 彩虹是压轴，满屏多冒一些
    const n = Math.max(1, Math.min(hits, budget));
    for (let i = 0; i < n; i++) {
      const cnt = Math.round((hits * (i + 1)) / n) - Math.round((hits * i) / n);
      const crit = critShare > 0 && Math.floor((i + 1) * critShare) > Math.floor(i * critShare);
      fx.floaters.push({ t: t0 + (i / n) * (kind === 'rainbow' ? 0.3 : 0.24), m, text: String(crit ? critPer : per), count: cnt > 1 ? cnt : 0, kind: crit ? 'crit' : kind, n: fx.floaters.length });
    }
  };
  let total = 0; // 这一下一共打了多少（溢出的也算，玩家看的就是这个数）
  const applyDmg = (mi, dmg, at) => {
    const st = ms[mi];
    if (!st.alive) return 0;
    total += dmg;
    let left = dmg;
    while (left > 0 && st.alive) {
      const take = Math.min(left, st.hp);
      st.hp -= take; left -= take;
      if (st.hp <= 0) {
        if (st.barIndex < s.monsters[mi].bars - 1) { // 打空一条：换下一条，新的盾是满的，特性也换
          st.barIndex += 1; st.hp = st.maxHp; st.barSwitchAt = at; st.broken = false;
          st.shields = (s.monsters[mi].nextShields || []).map((x) => ({ ...x }));
          st.traits = s.monsters[mi].nextTraits || st.traits;
        } else { st.alive = false; st.deadAt = at; }
      }
    }
    st.flashUntil = at + 0.12; st.recoilAt = at;
    return dmg;
  };
  for (const e of tl.ev) {
    if (t < 0 || e.t > now) break;
    if (e.k === 'fire') fx.fired = e.i;
    if (e.k === 'hit') {
      applyDmg(e.target, e.dmg, e.t);
      fx.hits.push({ i: e.i, t: e.t, target: e.target, kind: e.kind });
      emit(e.target, e.t, e.hits, e.per, e.kind, e.critShare, e.critPer);
      const st = ms[e.target];
      if (e.shred && !st.broken && st.alive) {
        for (const [c, n] of Object.entries(e.shred)) { const sh = st.shields.find((x) => x.color === c); if (sh) sh.cur = Math.max(0, sh.cur - n); }
        if (st.shields.length && st.shields.every((x) => x.cur === 0)) { st.broken = true; st.brokeAt = e.t; st.countdown += 1; st.cdTick = e.t; st.cdPlusAt = e.t; }
      }
    }
    if (e.k === 'white') {
      fx.whites.push({ t: e.t });
      s.monsters.forEach((m, mi) => {
        if (!ms[mi].alive) return;
        applyDmg(mi, e.hits * e.per[mi], e.t);
        emit(mi, e.t, e.hits, e.per[mi], 'white');
      });
    }
    if (e.k === 'ally') {
      fx.allyAt.push({ t: e.t, idx: e.ally.idx, say: e.ally.say });
      fx.slashes.push({ t: e.t + 0.3, m: s.target ?? 0, color: e.ally.color });
      applyDmg(s.target ?? 0, e.ally.dmg, e.t + 0.3);
      fx.floaters.push({ t: e.t + 0.3, m: s.target ?? 0, text: String(e.ally.dmg), count: 0, kind: 'ally', n: fx.floaters.length });
    }
    if (e.k === 'rainbowRing') fx.rainbowAt = e.t;
    if (e.k === 'total') fx.totalAt = e.t;
    if (e.k === 'monsterTurn') {
      fx.monAt = e.t;
      ms.forEach((st) => { if (st.alive) { st.countdown = Math.max(0, st.countdown - 1); st.cdTick = e.t; } });
    }
    if (e.k === 'attackReset') { const st = ms[s.attack.m]; st.countdown = s.attack.reset ?? 3; st.cdTick = e.t; if (st.broken) { st.broken = false; } }
  }
  // 血条的浅色那截：慢 0.4 秒追上
  ms.forEach((st, mi) => {
    const lastHit = Math.max(st.flashUntil - 0.12, -10);
    st.hpLag = now - lastHit < 0.45 && lastHit > 0 ? Math.max(st.hp, st.hp + (s.monsters[mi].maxHp * 0.08) * (1 - (now - lastHit) / 0.45)) : st.hp;
    st.barFlash = now - st.barSwitchAt < 0.15;
    st.cdPop = st.cdTick && now - st.cdTick < 0.3 ? pop((now - st.cdTick) / 0.3) : 1;
  });
  return { tl, ms, fx, total, now };
}

// ─────────────── 画 ───────────────
export function drawUpDown(r, s, t, opts = {}) {
  const R = REGIONS;
  const { tl, ms, fx, total, now } = stateAt(s, t);
  const casting = t >= 0;
  const clock = opts.clock ?? now; // 闪烁用的时间
  forest(r);

  const spots = R.monsters[s.monsters.length];
  const slots = s.monsters.map((m, i) => ({ ...spots[i] }));

  // 怪的回合：要出手的那只往下扑
  let lunge = { mi: -1, k: 0 };
  if (fx.monAt > 0 && s.attack) {
    const k = life(now, fx.monAt + 0.3, 0.45);
    if (k >= 0 && k <= 1) lunge = { mi: s.attack.m, k: k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65 };
  }

  // 倒计时到 1 的怪：脚下一圈红在呼吸（这回合末要出手）
  slots.forEach((sl, i) => {
    if (ms[i].alive && ms[i].countdown <= 1 && !(fx.monAt > 0)) ellipse(r, sl.x, sl.y, sl.s * 0.48, sl.s * 0.13, { fill: T.danger, alpha: 0.16 + 0.1 * Math.sin(clock * 6) });
  });
  // 脚下的圈（选中目标）
  slots.forEach((sl, i) => {
    if (s.monsters[i].selected && ms[i].alive) ellipse(r, sl.x, sl.y, sl.s * 0.42, sl.s * 0.11, { stroke: T.select, lineWidth: 2.5, alpha: 0.9 });
  });
  // 怪
  [...slots.keys()].sort((a, b) => slots[a].y - slots[b].y).forEach((i) => {
    const sl = slots[i];
    const st = ms[i];
    const m = s.monsters[i];
    const look = m.tier === 'gatekeeper' ? { hue: '#463a7e', top: '#8f7ae8', eyes: '#ff6b6b' } : { hue: '#5b4f7e', top: '#9d8ad6', eyes: '#ffe27a' };
    const recoil = Math.max(0, 1 - (now - st.recoilAt) / 0.15) * 4;
    const dy = (lunge.mi === i ? lunge.k * 46 : 0) - recoil;
    let a = 1;
    if (!st.alive) a = Math.max(0, 1 - (now - st.deadAt) / 0.5);
    if (a <= 0) return;
    stackSprite(r, sl.x, sl.y + dy, sl.s, { ...look, alpha: a, slot: false });
    if (now < st.flashUntil) stackSprite(r, sl.x, sl.y + dy, sl.s, { ...look, eyes: null, alpha: 0.3, slot: false, flash: true }); // 挨打：蒙一层白，一闪就过
    if (!st.alive) { // 散成小块
      for (let k = 0; k < 10; k++) {
        const p = (now - st.deadAt) / 0.5;
        const ang = (k / 10) * Math.PI * 2;
        r.rect({ x: sl.x + Math.cos(ang) * p * 40, y: sl.y - sl.s * 0.5 + Math.sin(ang) * p * 30 - p * 20, w: 5, h: 5, fill: look.top, alpha: a });
      }
    }
  });

  // 主角、队友（背对着我们）。正在出手的那个最后画，冲过去的时候压在链上面
  const drawAlly = (al, i) => {
    const P = R.allies[i];
    const act = fx.allyAt.find((x) => x.idx === i && now - x.t < 0.6);
    // 出手：往目标那边冲过去一段，砍完退回来
    const dash = act ? Math.sin(clamp((now - act.t) / 0.6, 0, 1) * Math.PI) * 0.55 : 0;
    const tgt = slots[s.target ?? 0];
    const ox = dash * (tgt.x - P.cx);
    const oy = dash * (tgt.y + 10 - P.base);
    const col = { 刺: ['#4a3a5a', '#9a78c2'], 战: ['#8f5a3a', '#e09a62'], 辅: ['#3f7a5a', '#86d6a6'], 坦: ['#4f6f8f', '#86b4dc'] }[al.role];
    if (act) for (let g = 1; g <= 3; g++) stackSprite(r, P.cx + ox * (1 - g * 0.25), P.base + oy * (1 - g * 0.25), P.size, { hue: col[0], top: col[1], eyes: null, slot: false, alpha: 0.18 }); // 拖尾
    stackSprite(r, P.cx + ox, P.base + oy, P.size, { hue: col[0], top: col[1], eyes: null, slot: false });
    r.circle({ x: P.cx, y: P.base + 10, r: 9, fill: '#0b0d12', stroke: col[1], lineWidth: 1.5 });
    txt(r, al.role, P.cx, P.base + 10, { size: 10, weight: 'bold', align: 'center', color: col[1] });
    if (act && act.say) {
      const k = clamp((now - act.t) / 0.6, 0, 1);
      bold(r, act.say, P.cx + ox, P.base + oy - P.size - 10, { size: F.m, color: col[1], align: 'center', alpha: k < 0.7 ? 1 : (1 - k) / 0.3 });
    }
  };
  const allyActing = (i) => fx.allyAt.some((x) => x.idx === i && now - x.t < 0.6);
  s.allies.forEach((al, i) => { if (!allyActing(i)) drawAlly(al, i); });
  const heroHit = fx.monAt > 0 && s.attack ? life(now, fx.monAt + 0.45, 0.4) : -1;
  stackSprite(r, R.hero.cx, R.hero.base, R.hero.size, { hue: '#7a6a4e', top: '#e8cfa0', eyes: null, slot: false });
  if (heroHit >= 0 && heroHit < 0.3 && !s.attack?.blocked) stackSprite(r, R.hero.cx, R.hero.base, R.hero.size, { eyes: null, slot: false, flash: true, alpha: 0.45 });
  if (s.attack?.blocked && heroHit >= 0 && heroHit <= 1) ellipse(r, R.hero.cx, R.hero.base - 30, 46, 44, { stroke: '#6dc9ff', lineWidth: 3, alpha: 1 - heroHit });

  // 怪头顶
  slots.forEach((sl, i) => { if (ms[i].alive) overhead(r, s.monsters[i], sl, { ...ms[i], tnow: now, ghost: casting ? 0 : s.ghost?.[i] || 0, willShred: casting ? null : s.willShred?.[i] }, clock); });

  // ── 链 ──
  // 排链的时候：最后一张从手里飞进链（-1.4 秒到 -1.05 秒之间）
  const FLY0 = -1.4;
  const FLY1 = -1.05;
  const flying = !casting && s.flyIn != null && t < FLY1;
  const flyK = flying ? clamp((t - FLY0) / (FLY1 - FLY0), 0, 1) : 1;
  const chain = casting ? s.chain : (flying ? s.queued.slice(0, -1) : s.queued);
  const cs = chainSlots(flying ? s.queued.length : chain.length); // 飞的时候先把链尾的位子让出来
  const chainFade = fx.totalAt > 0 ? clamp(1 - (now - fx.totalAt) / 0.3, 0, 1) : 1;
  if (chainFade > 0) {
    r.withAlpha(chainFade, () => chain.forEach((c, i) => {
      const sl = cs[i];
      const fired = casting && i <= fx.fired;
      const kick = casting && fx.fired === i ? 1 - clamp((now - i * (s.interval ?? 0.16)) / 0.15, 0, 1) : 0;
      gemCard(r, { x: sl.x, y: sl.y - kick * 6, w: sl.w, h: sl.h, color: c.color, gems: c.gems, mult: c.mult, fired, label: c.short || null, multSize: sl.w + REGIONS.chain.gap < 50 ? 10 : F.xs });
      if (i > 0) chainJoint(r, sl.x - REGIONS.chain.gap / 2, sl.cy, c.rel);
    }));
  }
  s.allies.forEach((al, i) => { if (allyActing(i)) drawAlly(al, i); });

  // ── 飞出去的宝石 ──
  if (casting) {
    s.chain.forEach((c, i) => {
      const t0 = i * (s.interval ?? 0.16);
      const k = life(now, t0, 0.32);
      if (k < 0 || k > 1) return;
      const from = { x: cs[i].cx, y: cs[i].y };
      const tgt = slots[s.target ?? 0];
      const to = { x: tgt.x, y: tgt.y - tgt.s * 0.5 };
      const ctl = { x: (from.x + to.x) / 2 + (i % 2 ? 50 : -50), y: Math.min(from.y, to.y) - 40 };
      for (let tr = 3; tr >= 0; tr--) {
        const u = clamp(easeOut(k) - tr * 0.06, 0, 1);
        const p = { x: (1 - u) ** 2 * from.x + 2 * (1 - u) * u * ctl.x + u * u * to.x, y: (1 - u) ** 2 * from.y + 2 * (1 - u) * u * ctl.y + u * u * to.y };
        const sz = 7 - tr * 1.4;
        r.polygon({ points: [{ x: p.x, y: p.y - sz }, { x: p.x + sz * 0.8, y: p.y }, { x: p.x, y: p.y + sz }, { x: p.x - sz * 0.8, y: p.y }], fill: swatch(c.color), stroke: tr ? null : '#ffffff', lineWidth: 1, alpha: tr ? 0.5 : 1 });
      }
    });
    // 打中：一圈散开
    fx.hits.forEach((h) => {
      const k = life(now, h.t, 0.3);
      if (k < 0 || k > 1) return;
      const sl = slots[h.target];
      const col = h.kind === 'rainbow' ? swatch(COLOR_RING[Math.floor(now * 20) % 6]) : h.i >= 0 ? swatch(s.chain[h.i].color) : '#ffffff';
      r.circle({ x: sl.x, y: sl.y - sl.s * 0.5, r: 6 + k * 26, stroke: col, lineWidth: 3 * (1 - k), alpha: 1 - k });
    });
    // 合白：每只怪脚下一圈白浪
    fx.whites.forEach((w) => {
      const k = life(now, w.t, 0.45);
      if (k < 0 || k > 1) return;
      slots.forEach((sl) => ellipse(r, sl.x, sl.y - 4, sl.s * (0.3 + k * 0.5), sl.s * (0.08 + k * 0.14), { stroke: '#ffffff', lineWidth: 4 * (1 - k), alpha: 1 - k }));
      r.rect({ x: 0, y: 0, w: 960, h: 540, fill: '#ffffff', alpha: 0.1 * (1 - k) });
    });
    // 破盾：盾条碎成小块飞开 + 字章
    ms.forEach((st, i) => {
      const k = life(now, st.brokeAt, 0.6);
      if (k < 0 || k > 1) return;
      const sl = slots[i];
      const y0 = sl.y - sl.s - REGIONS.overhead.gap + REGIONS.overhead.barH + 3;
      for (let f = 0; f < 12; f++) {
        const ang = -Math.PI * (0.1 + 0.8 * (f / 11));
        const sp = 60 + (f % 3) * 25;
        r.rect({ x: sl.x + Math.cos(ang) * sp * k - 3, y: y0 + Math.sin(ang) * sp * k + 120 * k * k, w: 6, h: 4, fill: swatch(s.monsters[i].shields[f % s.monsters[i].shields.length].color), alpha: 1 - k });
      }
      const bw = clamp(sl.s * 0.75, REGIONS.overhead.minW, REGIONS.overhead.maxW);
      r.transform({ x: sl.x + bw / 2 + 44, y: y0 - 4, scale: pop(k * 2.5) }, () => bold(r, '破盾！', 0, 0, { size: F.l, color: T.breakCol, align: 'center', alpha: k < 0.7 ? 1 : (1 - k) / 0.3 }));
    });
    // 换一条血
    ms.forEach((st, i) => {
      const k = life(now, st.barSwitchAt, 0.8);
      if (k < 0 || k > 1) return;
      const sl = slots[i];
      const bw = clamp(sl.s * 0.75, REGIONS.overhead.minW, REGIONS.overhead.maxW);
      r.transform({ x: sl.x + bw / 2 + 50, y: sl.y - sl.s - REGIONS.overhead.gap + 3, scale: pop(k * 3) }, () => bold(r, '下一条血', 0, 0, { size: F.m, color: '#c69cff', align: 'center', alpha: k < 0.7 ? 1 : (1 - k) / 0.3 }));
    });
    // 队友补刀：一道斜着的刀痕
    fx.slashes.forEach((sh) => {
      const k = life(now, sh.t, 0.3);
      if (k < 0 || k > 1) return;
      const sl = slots[sh.m];
      const cx = sl.x;
      const cy = sl.y - sl.s * 0.5;
      const pts = [];
      for (let q = 0; q <= 10; q++) { const u = q / 10; pts.push({ x: cx - 50 + u * 100, y: cy - 40 + u * 80 - Math.sin(u * Math.PI) * 20 }); }
      for (let q = 1; q < pts.length; q++) if (q / 10 <= k * 1.6) r.line({ x1: pts[q - 1].x, y1: pts[q - 1].y, x2: pts[q].x, y2: pts[q].y, color: sh.color, lineWidth: 6 * (1 - k) + 1, alpha: 1 - k * 0.6 });
    });
    // 彩虹：从链那里一圈彩色往外扩
    {
      const k = life(now, fx.rainbowAt, 0.7);
      if (k >= 0 && k <= 1) {
        const tg = slots[s.target ?? 0];
        COLOR_RING.forEach((c, j) => ellipse(r, tg.x, tg.y - 4, 30 + k * 150 + j * 6, 8 + k * 40 + j * 2, { stroke: swatch(c), lineWidth: 3, alpha: (1 - k) * 0.9 }));
        r.transform({ x: tg.x + tg.s * 0.5 + 72, y: tg.y - tg.s * 0.45, scale: pop(k * 2) }, () => rainbowText(r, '彩虹 ×3', 0, 0, F.xl));
      }
    }
    // 飘字：一发一个数，散在怪身上，冒出来弹一下、往上飘一点、0.75 秒淡掉
    {
      const rnd = (n, k) => { const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
      const SIZE = { normal: 17, white: 17, rainbow: 19, crit: 23, ally: 26 };
      const COLOR = { normal: '#ffffff', white: '#ffffff', crit: T.crit, ally: '#ffd9a8' };
      const EDGE = { normal: '#07080c', white: '#1d4a8a', crit: '#3a1a00', ally: '#5a2a0a' };
      fx.floaters.forEach((f) => {
        const dur = f.kind === 'ally' ? 1.1 : (s.floatLife ?? 0.75);
        const k = life(now, f.t, dur);
        if (k < 0 || k > 1) return;
        const sl = slots[f.m];
        const w = Math.max(sl.s, 100);
        const x = f.kind === 'ally' ? sl.x + w * 0.42 : sl.x + (rnd(f.n, 1) - 0.5) * w * 1.25;
        const y = (f.kind === 'ally' ? sl.y - sl.s * 0.75 : sl.y - sl.s * (0.15 + rnd(f.n, 2) * 0.7)) - k * 16;
        const size = SIZE[f.kind];
        r.withAlpha(k < 0.7 ? 1 : (1 - k) / 0.3, () => r.transform({ x, y, scale: pop(k * 6) }, () => {
          if (f.kind === 'rainbow') rainbowText(r, f.text, 0, 0, size);
          else bold(r, f.text, 0, 0, { size, align: 'center', color: COLOR[f.kind], outline: EDGE[f.kind] });
          if (f.count && s.showPackCount) { // 合成的一包：要不要小字写几发，先关着（太乱），见候选说明 B 第 3 问
            const tw = r.measureText(f.text, { size, weight: 'bold' }).width;
            bold(r, `×${f.count}`, tw / 2 + 3, 3, { size: 11, color: '#c9d3e6', align: 'left' });
          }
        }));
      });
    }
    // 总数：链飞走以后，在链那里弹出来
    {
      const k = life(now, fx.totalAt, 1.8);
      if (k >= 0 && k <= 1) {
        const a = k < 0.8 ? 1 : (1 - k) / 0.2;
        r.withAlpha(a, () => {
          r.transform({ x: REGIONS.total.cx, y: REGIONS.total.cy, scale: pop(k * 4) }, () => bold(r, String(Math.round(total)), 0, 0, { size: F.xxl, color: s.rainbow ? T.gold : '#ffffff', align: 'center' }));
          const lw = r.measureText(s.why, { size: F.s }).width + 24;
          r.rect({ x: REGIONS.total.cx - lw / 2, y: REGIONS.total.cy + 26, w: lw, h: 24, radius: 12, fill: '#07080c', alpha: 0.8 });
          txt(r, s.why, REGIONS.total.cx, REGIONS.total.cy + 38, { size: F.s, align: 'center', color: T.text2 });
        });
      }
    }
    // 怪的回合：中间上方一条小横幅
    {
      const k = life(now, fx.monAt, 0.9);
      if (k >= 0 && k <= 1) {
        const a = k < 0.75 ? 1 : (1 - k) / 0.25;
        r.rect({ x: 400, y: 40, w: 160, h: 26, radius: 13, fill: '#3a0d14', stroke: T.danger, lineWidth: 1.5, alpha: a * 0.92 });
        txt(r, '怪的回合', 480, 53, { size: F.s, weight: 'bold', align: 'center', color: '#ffd0d5', alpha: a });
      }
    }
    // 怪出手：一道红线扑向主角，画面边上一圈红
    if (s.attack && fx.monAt > 0) {
      const k = life(now, fx.monAt + 0.45, 0.35);
      if (k >= 0 && k <= 1) {
        const sl = slots[s.attack.m];
        r.line({ x1: sl.x, y1: sl.y - 10, x2: R.hero.cx, y2: R.hero.base - 30, color: s.attack.blocked ? '#6dc9ff' : T.danger, lineWidth: 8 * (1 - k) + 1, alpha: 1 - k });
        if (!s.attack.blocked) {
          r.rect({ x: 0, y: 0, w: 960, h: 540, stroke: T.danger, lineWidth: 14, alpha: (1 - k) * 0.8 });
          bold(r, '-½', R.hero.cx + 34, R.hero.base - 60 - k * 20, { size: F.l, color: T.heart, align: 'center', alpha: 1 - k });
        }
      }
    }
  }

  // ── 状态栏（盖在场地上，半透明） ──
  r.rect({ x: 0, y: 0, w: 960, h: R.bar.h, fill: '#05070a', alpha: 0.72 });
  const heartsNow = s.attack && !s.attack.blocked && fx.monAt > 0 && now > fx.monAt + 0.45 ? s.status.hearts - s.attack.hearts : s.status.hearts;
  let x = hearts(r, 14, 15, heartsNow, s.status.maxHearts, 17) + 10;
  r.circle({ x: x + 8, y: 15, r: 7, fill: T.gold, stroke: '#7a5a10', lineWidth: 1.5 });
  txt(r, String(s.status.gold), x + 20, 15, { size: F.s, weight: 'bold', color: T.gold });
  x += 62;
  s.status.quests.forEach((q) => {
    const label = `任务 ${q.cur}/${q.total}`;
    const lw = r.measureText(label, { size: F.xs }).width + 22;
    r.rect({ x, y: 6, w: lw, h: 18, radius: 4, fill: '#0b0d12', stroke: q.cur >= q.total ? T.connect : '#4a5470', lineWidth: 1 });
    r.rect({ x: x + 5, y: 11, w: 8, h: 8, fill: q.cur >= q.total ? T.connect : '#8a96b4' });
    txt(r, label, x + 17, 15, { size: F.xs, color: T.text2 });
    x += lw + 6;
  });
  txt(r, `${s.status.where} · 第 ${s.status.turn} 回合`, 480, 15, { size: F.s, weight: 'bold', align: 'center' });
  let bx = 960 - 46 - s.status.buffs.length * 26;
  const laneAt = { white: fx.whites.map((w) => w.t), rainbow: [fx.rainbowAt], break: ms.map((st) => st.brokeAt), chain: [0], multi: [0] };
  s.status.buffs.forEach((b) => {
    const at = (laneAt[b.lane] || []).filter((x) => casting && now - x >= 0 && now - x < 0.7);
    const flash = at.length > 0;
    if (flash && b.say) { // 加成生效：图标闪一下，下面冒一行小字
      const k = (now - at[0]) / 0.7;
      bold(r, b.say, bx + 11, 44 + k * 8, { size: F.xs, color: LANE_COLOR[b.lane], align: 'center', alpha: 1 - k });
    }
    buffIcon(r, bx, 4, { ...b, flash }, 22);
    bx += 26;
  });
  smallButton(r, 960 - 38, 4, 28, 22, '≡');

  // ── 集色（链的左边） ──
  colorRing(r, R.ring.cx, R.ring.cy, R.ring.rad, casting && fx.totalAt > 0 && s.recordedAfter ? s.recordedAfter : s.recorded, s.current, R.ring.dot);

  // ── 预览（链的右边）：排链时是算式，打出去以后不显示 ──
  if (!casting && s.queued.length) {
    const P = R.preview;
    r.rect({ x: P.x, y: P.y, w: P.w, h: P.h, radius: 10, fill: '#07080c', alpha: 0.78, stroke: '#3e4862', lineWidth: 1 });
    txt(r, `≈ ${s.pv.total}`, P.x + 10, P.y + 16, { size: F.l, weight: 'bold', color: T.gold });
    txt(r, `${s.pv.hits} 发 · 每发 ${s.pv.per}`, P.x + 10, P.y + 36, { size: F.xs, color: T.text2 });
    if (s.pv.hint) {
      r.rect({ x: P.x + 6, y: P.y + 47, w: P.w - 12, h: 18, radius: 9, fill: '#0f3940' });
      txt(r, s.pv.hint, P.x + P.w / 2, P.y + 56, { size: F.xs, weight: 'bold', align: 'center', color: T.breakCol });
    }
  }

  // ── 左下：牌堆 ──
  const PL = R.pile;
  for (let k = 2; k >= 0; k--) r.rect({ x: PL.x + k * 3, y: PL.y - k * 3, w: 50, h: 70, radius: 6, fill: '#3a2f22', stroke: '#8a7350', lineWidth: 1.5 });
  bold(r, String(s.drawCount), PL.x + 31, PL.y + 32, { size: F.l, align: 'center' });
  [...COLOR_RING, 'white'].forEach((c, i) => {
    const cx = PL.x + 74 + (i % 2) * 44;
    const cy = PL.y + 2 + Math.floor(i / 2) * 19;
    const n = s.deck[c] ?? 0;
    r.rect({ x: cx, y: cy - 6, w: 9, h: 12, radius: 2, fill: swatch(c), alpha: n > 0 ? 1 : 0.25 });
    txt(r, String(n), cx + 14, cy, { size: F.xs, weight: 'bold', color: n > 0 ? T.text : T.text3 });
  });
  ['red', 'green', 'blue'].forEach((c, i) => { gemDot(r, PL.x + 6 + i * 44, PL.y + 88, c, 4); txt(r, `${s.gemLevels[c]}级`, PL.x + 14 + i * 44, PL.y + 88, { size: F.xs, color: T.text2 }); });

  // ── 手牌：一道弧 ──
  const H = R.hand;
  const flyCard = s.flyIn != null ? s.queued[s.queued.length - 1] : null;
  const preFly = flying && t < FLY0;
  let handCards = casting ? s.handAfter : s.hand;
  let hov = casting ? -1 : (s.hoverCard ?? -1);
  if (preFly) { // 还没飞：牌在手里，鼠标在它上面
    handCards = [...handCards.slice(0, s.flyIn), { ...flyCard, glow: 'connect' }, ...handCards.slice(s.flyIn)];
    hov = s.flyIn;
  }
  const fan = fanSlots(handCards.length, hov);
  const order = [...fan.keys()].filter((i) => i !== hov);
  if (hov >= 0) order.push(hov);
  order.forEach((i) => drawHandCard(r, handCards[i], fan[i], H));
  if (flying && !preFly) { // 飞的那一下：从手里的位子到链尾的位子，边飞边缩小、摆正
    const from = fanSlots(s.hand.length + 1, s.flyIn)[s.flyIn];
    const full = chainSlots(s.queued.length);
    const to = full[full.length - 1];
    const k = easeOut(flyK);
    const sc = lerp(from.scale, to.w / H.cw, k);
    const x = lerp(from.x, to.cx, k);
    const y = lerp(from.y, to.cy, k) - Math.sin(k * Math.PI) * 40;
    drawHandCard(r, flyCard, { x, y, rot: lerp(from.rot, 0, k), scale: sc }, H);
  }
  if (casting && fx.totalAt < 0) txt(r, '打出中…', 480, 520, { size: F.xs, align: 'center', color: T.text3 });

  // ── 右下：打出键 ──
  const C = R.cast;
  smallButton(r, C.cx - 120, C.cy - 40, 64, 24, '自动排');
  smallButton(r, C.cx - 120, C.cy - 8, 64, 24, '撤回');
  const press = casting && now < 0.15 ? 3 : 0;
  r.circle({ x: C.cx, y: C.cy + 4, r: C.r, fill: '#0b2a6e' });
  r.circle({ x: C.cx, y: C.cy + press, r: C.r, fill: casting && !press ? '#2a3a5e' : '#3a74e0', stroke: '#a9c8ff', lineWidth: 2 });
  if (press) r.circle({ x: C.cx, y: C.cy, r: C.r + now * 120, stroke: '#a9c8ff', lineWidth: 2, alpha: 1 - now / 0.15 });
  txt(r, casting ? '…' : (s.queued.length ? '打出' : '结束'), C.cx, C.cy - 6, { size: F.l, weight: 'bold', align: 'center' });
  txt(r, '空格', C.cx, C.cy + 16, { size: F.xs, align: 'center', color: '#d6e4ff' });
  txt(r, `弃 ${s.discardCount}`, C.cx + 30, C.cy + 54, { size: F.xs, color: T.text3 });

  // ── 鼠标放在怪身上 ──
  if (opts.hoverMonster != null) {
    const i = opts.hoverMonster;
    monsterTooltip(r, s.monsters[i], slots[i], ms[i]);
    const sl = slots[i];
    r.polygon({ points: [{ x: sl.x + 10, y: sl.y - 60 }, { x: sl.x + 10, y: sl.y - 42 }, { x: sl.x + 15, y: sl.y - 47 }, { x: sl.x + 22, y: sl.y - 47 }], fill: '#ffffff', stroke: '#000000', lineWidth: 1 });
  }
  return tl;
}
