// 战斗画面模块（设计稿 10.1、10.2）：上下布局（用户 2026-11-23 定的）。
// 只读 BattleSnapshot / BattlePreview / BattleEvent，自己不算规则；所有操作经 callbacks 回给外面。
// 只导入 shared / render / ui 三个模块的对外入口。
//
// 摆法：森林空地，怪在上；链浮在中间；主角和队友在下背对着我们；手牌在最下面排成一道弧。
// 出牌用拖拽（用户说过很多遍）：把手里的牌拖进链，拖回手里就是撤回；功能牌拖出手牌区就用掉。
// 怪头顶只放血条、盾条、几个小图标；细节鼠标放上去才出来。

import { COLOR_META, COLOR_RING, BATTLE_EVENT_TYPES as E } from '../shared/index.js';
import {
  F, LANE, T, bold, buffIcon, chainJoint, colorRing, fnCard, gemCard, gemDot, hearts, rainbowText,
  smallButton, stackSprite, swatch, txt,
} from './draw.js';
import { REGIONS, W, H, chainInsertIndex, chainSlots, fanSlots, hitRotated, monsterSlots } from './layout.js';
import { buildPlayback } from './playback.js';

const R = REGIONS;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeOut = (k) => 1 - (1 - clamp(k, 0, 1)) ** 3;
const pop = (k) => {
  const x = clamp(k, 0, 1);
  return x < 0.4 ? lerp(0.6, 1.25, x / 0.4) : lerp(1.25, 1, (x - 0.4) / 0.6);
};
const life = (t, t0, dur) => (t - t0) / dur;
const inRect = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
const TIER = { normal: '普通', elite: '精英', gatekeeper: '看门的' };

function ellipse(r, cx, cy, rx, ry, o) {
  const pts = [];
  for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; pts.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry }); }
  r.polygon({ points: pts, ...o });
}

function heartIcon(r, x, y, s, fill) {
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = (i / 20) * Math.PI * 2;
    pts.push({ x: x + (16 * Math.sin(t) ** 3 * s) / 34, y: y - ((13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s) / 34 });
  }
  r.polygon({ points: pts, fill });
}

function forest(r) {
  r.clear('#141b14');
  r.rect({ x: 0, y: 0, w: W, h: H, fill: '#1a2419' });
  [[200, 300, 260, 90, '#1f2b1d'], [700, 330, 300, 100, '#1f2b1d'], [480, 200, 380, 120, '#202d1e'], [480, 420, 420, 110, '#1d281b'], [120, 180, 150, 60, '#1d281b'], [850, 170, 140, 50, '#1d281b']]
    .forEach(([x, y, rx, ry, c]) => ellipse(r, x, y, rx, ry, { fill: c }));
  for (let i = 0; i < 70; i++) {
    const x = (i * 137) % W;
    const y = 60 + ((i * 89) % 440);
    r.rect({ x, y, w: 3, h: 6, fill: i % 3 ? '#2b3a27' : '#33452d' });
  }
  [[40, 40, 70], [150, 10, 80], [290, 0, 70], [420, -20, 70], [560, -18, 72], [690, 2, 76], [820, 14, 80], [930, 46, 72], [-10, 170, 70], [970, 190, 70], [-20, 330, 80], [980, 350, 80]]
    .forEach(([x, y, rr]) => {
      r.circle({ x, y, r: rr, fill: '#132414' });
      r.circle({ x: x - rr * 0.25, y: y - rr * 0.2, r: rr * 0.6, fill: '#183019' });
    });
}

const ALLY_COLORS = ['#9a78c2', '#86d6a6', '#86b4dc', '#e09a62'];

/**
 * @param {object} [options]
 * @param {boolean} [options.allowAutoArrange=true]
 * @param {object} [options.callbacks] onQueueCard(uid, index) / onUnqueueCard(uid) / onMoveChainCard(uid, index) / onPlayInstant(uid)
 *   / onSelectTarget(uid) / onCommitChain() / onAutoArrange(mode) / onClearChain() / onRetry() / onBack()
 */
export function createBattleView(options = {}) {
  const callbacks = options.callbacks || {};
  let allowAutoArrange = options.allowAutoArrange ?? true;

  let snapshot = null; // 规则那边最新的
  let preview = null;
  let castPreview = null; // 打出那一刻的预览：播放时链上的倍数签还照它画
  let result = null;
  let shown = null; // 画面上正显示的快照：播放时还是打出前那份
  let playback = null;
  let playT = 0;
  let clock = 0;
  const notes = []; // 不在播放里的小字（马上用的功能牌、开场的效果）

  const pointer = { x: -1, y: -1 };
  let drag = null; // { uid, from: 'hand'|'chain', startX, startY, moved }
  let hoverHand = -1;
  let hoverMonster = null;
  let hoverButton = null;
  let lastBoxes = { hand: [], chain: [], monsters: [], buttons: [] };

  const busy = () => Boolean(playback && !playback.done);

  function setState({ snapshot: nextSnap, preview: nextPrev, result: nextRes = null, events = [], allowAutoArrange: allowAuto }) {
    if (allowAuto !== undefined) allowAutoArrange = Boolean(allowAuto);
    const prev = snapshot;
    const prevPreview = preview;
    snapshot = nextSnap;
    preview = nextPrev;
    result = nextRes;
    const isCast = events.some((e) => e.type === E.CHAIN_STEP || e.type === E.MONSTER_ATTACK);
    if (isCast && prev) {
      playback = buildPlayback(events, prev, nextSnap, { allyLabels: (prev.player?.allies || []).map((a) => a.label) });
      castPreview = prevPreview;
      playT = 0;
      shown = prev;
    } else {
      shown = nextSnap;
      events.forEach((e) => {
        if (e.type === E.INSTANT_CARD_USED) notes.push({ t: clock, text: e.payload.label });
        else if (e.type === E.EFFECT_TRIGGERED && e.payload.label) notes.push({ t: clock, text: e.payload.label });
        else if (e.type === E.SHIELD_SHRED) notes.push({ t: clock, text: `削掉 ${COLOR_META[e.payload.color]?.label || ''}盾 ${e.payload.amount} 格` });
      });
    }
  }

  function update(dt) {
    clock += dt;
    if (playback) {
      playT += dt;
      playback.advance(playT);
      if (playback.done) { playback = null; shown = snapshot; }
    }
  }

  // ───────── 命中区 ─────────
  function boxes() {
    const snap = shown;
    if (!snap) return lastBoxes;
    const ms = monsterSlots(snap.monsters.length);
    const monsters = snap.monsters.map((m, i) => ({ uid: m.uid, x: ms[i].x - ms[i].s * 0.45, y: ms[i].y - ms[i].s - 24, w: ms[i].s * 0.9, h: ms[i].s + 30, slot: ms[i] }));
    const draggingHand = drag && drag.moved && drag.from === 'hand';
    const handCards = snap.hand.filter((c) => !(draggingHand && c.uid === drag.uid));
    const fan = fanSlots(handCards.length, busy() || drag ? -1 : hoverHand);
    const hand = handCards.map((c, i) => ({ uid: c.uid, card: c, slot: fan[i], x: fan[i].x - fan[i].w / 2, y: fan[i].y - fan[i].h / 2, w: fan[i].w, h: fan[i].h }));
    const draggingChain = drag && drag.moved && drag.from === 'chain';
    const chainCards = snap.chain.filter((c) => !(draggingChain && c.uid === drag.uid));
    const cs = chainSlots(chainCards.length);
    const chain = chainCards.map((c, i) => ({ uid: c.uid, card: c, ...cs[i] }));
    const C = R.cast;
    const buttons = [
      { id: 'cast', x: C.cx - C.r, y: C.cy - C.r, w: C.r * 2, h: C.r * 2 },
      ...(allowAutoArrange ? [{ id: 'auto', ...R.buttons.auto }] : []),
      { id: 'clear', ...R.buttons.clear },
      { id: 'back', ...R.buttons.back },
    ];
    lastBoxes = { hand, chain, monsters, buttons };
    return lastBoxes;
  }

  function handAt(x, y) {
    const b = lastBoxes.hand;
    for (let i = b.length - 1; i >= 0; i--) if (hitRotated(b[i].slot, x, y)) return i; // 后画的在上面
    return -1;
  }

  function onPointer(event) {
    if (!event) return { cursor: 'default' };
    const { type, x, y } = event;
    if (type === 'leave') {
      pointer.x = -1; pointer.y = -1; hoverHand = -1; hoverMonster = null; hoverButton = null;
      drag = null;
      return { cursor: 'default' };
    }
    pointer.x = x; pointer.y = y;
    const bx = boxes();

    // 打完了：只认结算框里的两个键
    if (snapshot && snapshot.outcome && !busy()) {
      const btn = outcomeButtons().find((b) => inRect(b, x, y));
      hoverButton = btn?.id || null;
      if (type === 'up' && btn) (btn.id === 'retry' ? callbacks.onRetry : callbacks.onBack)?.();
      return { cursor: btn ? 'pointer' : 'default' };
    }

    const btn = bx.buttons.find((b) => (b.id === 'cast' ? Math.hypot(x - R.cast.cx, y - R.cast.cy) <= R.cast.r : inRect(b, x, y)));
    hoverButton = btn?.id || null;

    if (type === 'move') {
      if (drag) {
        if (!drag.moved && Math.hypot(x - drag.startX, y - drag.startY) > 6) drag.moved = true;
        return { cursor: 'grabbing' };
      }
      hoverHand = busy() ? -1 : handAt(x, y);
      hoverMonster = bx.monsters.find((m) => inRect(m, x, y) && shownMonster(m.uid)?.alive)?.uid || null;
      return { cursor: hoverHand >= 0 ? 'grab' : (btn || hoverMonster ? 'pointer' : 'default') };
    }

    const canAct = snapshot?.phase === 'player_input' && !busy();
    if (type === 'down') {
      if (!canAct) return { cursor: 'default' };
      const hi = handAt(x, y);
      if (hi >= 0) { drag = { uid: bx.hand[hi].uid, from: 'hand', startX: x, startY: y, moved: false }; return { cursor: 'grabbing' }; }
      const ci = bx.chain.findIndex((c) => inRect(c, x, y));
      if (ci >= 0) { drag = { uid: bx.chain[ci].uid, from: 'chain', startX: x, startY: y, moved: false }; return { cursor: 'grabbing' }; }
      return { cursor: btn ? 'pointer' : 'default' };
    }

    if (type === 'up') {
      if (drag) {
        const d = drag;
        drag = null;
        if (!d.moved || !canAct) return { cursor: 'default' };
        const card = [...snapshot.hand, ...snapshot.chain].find((c) => c.uid === d.uid);
        const overMonster = bx.monsters.find((m) => inRect(m, x, y) && shownMonster(m.uid)?.alive);
        const inHandZone = y >= R.hand.zoneTop;
        if (d.from === 'hand') {
          if (inHandZone || !card) return { cursor: 'default' }; // 放回手里：什么都不做
          if (card.usage === 'instant') { callbacks.onPlayInstant?.(d.uid); return { cursor: 'default' }; }
          if (overMonster && overMonster.uid !== snapshot.selectedTargetUid) callbacks.onSelectTarget?.(overMonster.uid);
          const idx = overMonster ? snapshot.chain.length : chainInsertIndex(snapshot.chain.length, x);
          callbacks.onQueueCard?.(d.uid, idx);
          return { cursor: 'default' };
        }
        // 从链里拖出来
        if (inHandZone) { callbacks.onUnqueueCard?.(d.uid); return { cursor: 'default' }; }
        const idx = chainInsertIndex(snapshot.chain.length - 1, x);
        if (callbacks.onMoveChainCard) callbacks.onMoveChainCard(d.uid, idx);
        return { cursor: 'default' };
      }
      if (!canAct) return { cursor: 'default' };
      if (btn) {
        if (btn.id === 'cast') callbacks.onCommitChain?.();
        else if (btn.id === 'auto') callbacks.onAutoArrange?.('longest');
        else if (btn.id === 'clear') callbacks.onClearChain?.();
        else if (btn.id === 'back') callbacks.onBack?.();
        return { cursor: 'pointer' };
      }
      const m = bx.monsters.find((mb) => inRect(mb, x, y) && shownMonster(mb.uid)?.alive);
      if (m) callbacks.onSelectTarget?.(m.uid); // 选目标是点怪，不是出牌
      return { cursor: m ? 'pointer' : 'default' };
    }
    return { cursor: 'default' };
  }

  function shownMonster(uid) {
    const pm = playback?.state.monsters.find((m) => m.uid === uid);
    return pm || shown?.monsters.find((m) => m.uid === uid);
  }

  function outcomeButtons() {
    return [
      { id: 'retry', x: 360, y: 300, w: 110, h: 36, label: '再打一次' },
      { id: 'back', x: 490, y: 300, w: 110, h: 36, label: '回选仗台' },
    ];
  }

  // ───────── 画 ─────────
  function render(r) {
    if (!shown) { r.clear('#0f1117'); return; }
    const snap = shown;
    const pb = playback?.state || null;
    const now = pb ? pb.now : 0;
    const bx = boxes();
    const ms = bx.monsters.map((b) => b.slot);
    const mons = snap.monsters.map((m) => (pb ? pb.monsters.find((x) => x.uid === m.uid) : m));
    const casting = Boolean(pb);
    forest(r);

    // 怪的回合：要出手的那只往下扑
    const lungeOf = (uid) => {
      const a = pb?.attacks.find((x) => x.uid === uid && now - x.t >= 0 && now - x.t < 0.45);
      if (!a) return 0;
      const k = (now - a.t) / 0.45;
      return (k < 0.35 ? k / 0.35 : 1 - (k - 0.35) / 0.65) * 46;
    };

    // 脚下：剩 1 回合的一圈红在呼吸；选中的一圈黄
    mons.forEach((m, i) => {
      if (!m.alive) return;
      const sl = ms[i];
      if (m.countdown <= 1 && !(pb && pb.monAt > 0)) ellipse(r, sl.x, sl.y, sl.s * 0.48, sl.s * 0.13, { fill: T.danger, alpha: 0.16 + 0.1 * Math.sin(clock * 6) });
      if (snap.selectedTargetUid === m.uid || (drag?.moved && hoverMonster === m.uid)) ellipse(r, sl.x, sl.y, sl.s * 0.42, sl.s * 0.11, { stroke: T.select, lineWidth: 2.5, alpha: 0.9 });
    });

    // 怪
    [...mons.keys()].sort((a, b) => ms[a].y - ms[b].y).forEach((i) => {
      const m = mons[i];
      const sl = ms[i];
      const look = m.tier === 'gatekeeper' ? { hue: '#463a7e', top: '#8f7ae8', eyes: '#ff6b6b' } : m.tier === 'elite' ? { hue: '#6a4a2e', top: '#d8a25a', eyes: '#ffe27a' } : { hue: '#5b4f7e', top: '#9d8ad6', eyes: '#ffe27a' };
      let a = 1;
      if (!m.alive) a = m.deadAt != null && m.deadAt >= 0 ? Math.max(0, 1 - (now - m.deadAt) / 0.5) : 0;
      if (a <= 0) return;
      const recoil = pb ? Math.max(0, 1 - (now - m.flashAt) / 0.15) * 4 : 0;
      const dy = lungeOf(m.uid) - recoil;
      stackSprite(r, sl.x, sl.y + dy, sl.s, { ...look, alpha: a, slot: false });
      if (pb && now - m.flashAt < 0.1) stackSprite(r, sl.x, sl.y + dy, sl.s, { ...look, eyes: null, alpha: 0.3, slot: false, flash: true });
      if (!m.alive) {
        const p = (now - m.deadAt) / 0.5;
        for (let k = 0; k < 10; k++) {
          const ang = (k / 10) * Math.PI * 2;
          r.rect({ x: sl.x + Math.cos(ang) * p * 40, y: sl.y - sl.s * 0.5 + Math.sin(ang) * p * 30 - p * 20, w: 5, h: 5, fill: look.top, alpha: a });
        }
      }
    });

    // 主角、队友：正在出手的队友最后画
    const allies = snap.player.allies || [];
    const actOf = (al) => pb?.allyActs.find((x) => (x.allyId === al.id || x.label === al.label) && now - x.t >= 0 && now - x.t < 0.6);
    const drawAlly = (al, i) => {
      const P = R.allies[i];
      if (!P) return;
      const col = ALLY_COLORS[i % ALLY_COLORS.length];
      const act = actOf(al);
      const tgt = ms[Math.max(0, snap.monsters.findIndex((m) => m.uid === snap.selectedTargetUid))] || ms[0];
      const dash = act ? Math.sin(clamp((now - act.t) / 0.6, 0, 1) * Math.PI) * 0.55 : 0;
      const ox = dash * (tgt.x - P.cx);
      const oy = dash * (tgt.y + 10 - P.base);
      if (act) for (let g = 1; g <= 3; g++) stackSprite(r, P.cx + ox * (1 - g * 0.25), P.base + oy * (1 - g * 0.25), P.size, { hue: '#3a3550', top: col, eyes: null, slot: false, alpha: 0.18 });
      stackSprite(r, P.cx + ox, P.base + oy, P.size, { hue: '#3a3550', top: col, eyes: null, slot: false });
      r.circle({ x: P.cx, y: P.base + 10, r: 9, fill: '#0b0d12', stroke: col, lineWidth: 1.5 });
      txt(r, (al.roleTag || al.label || '友').slice(0, 1), P.cx, P.base + 10, { size: 10, weight: 'bold', align: 'center', color: col });
      if (act) {
        const k = clamp((now - act.t) / 0.6, 0, 1);
        bold(r, act.label, P.cx + ox, P.base + oy - P.size - 10, { size: F.s, color: col, align: 'center', alpha: k < 0.7 ? 1 : (1 - k) / 0.3 });
      }
    };
    allies.forEach((al, i) => { if (!actOf(al)) drawAlly(al, i); });
    const heroHit = pb?.attacks.find((a) => !a.blocked && now - a.t - 0.15 >= 0 && now - a.t - 0.15 < 0.3);
    const heroBlock = pb?.attacks.find((a) => a.blocked && now - a.t - 0.15 >= 0 && now - a.t - 0.15 < 0.5);
    stackSprite(r, R.hero.cx, R.hero.base, R.hero.size, { hue: '#7a6a4e', top: '#e8cfa0', eyes: null, slot: false });
    if (heroHit) stackSprite(r, R.hero.cx, R.hero.base, R.hero.size, { eyes: null, slot: false, flash: true, alpha: 0.45 });
    if (heroBlock) ellipse(r, R.hero.cx, R.hero.base - 30, 46, 44, { stroke: '#6dc9ff', lineWidth: 3, alpha: 1 - (now - heroBlock.t - 0.15) / 0.5 });

    // 怪头顶
    mons.forEach((m, i) => { if (m.alive) overhead(r, m, ms[i], snap.selectedTargetUid === m.uid && !casting, pb, now); });

    // ── 链 ──
    drawChain(r, snap, pb, now);
    allies.forEach((al, i) => { if (actOf(al)) drawAlly(al, i); });

    if (pb) drawCastFx(r, snap, pb, now, ms, mons);

    // ── 状态栏 ──
    r.rect({ x: 0, y: 0, w: W, h: R.bar.h, fill: '#05070a', alpha: 0.72 });
    const heartsNow = pb ? pb.hearts : snap.player.hearts;
    let x = hearts(r, 14, 15, heartsNow, snap.player.maxHearts, 17) + 10;
    const blk = snap.player.blocks.thisTurn + snap.player.blocks.untilConsumed + snap.player.blocks.allyCharges;
    if (blk > 0) {
      r.rect({ x, y: 5, w: 52, h: 20, radius: 10, fill: '#123048', stroke: '#6dc9ff', lineWidth: 1 });
      txt(r, `挡 ×${blk}`, x + 26, 15, { size: F.xs, weight: 'bold', align: 'center', color: '#bfe6ff' });
      x += 60;
    }
    txt(r, `第 ${snap.turn} 回合`, 480, 15, { size: F.s, weight: 'bold', align: 'center' });
    const buffs = snap.player.buffs || [];
    let bxp = R.buttons.back.x - 8 - buffs.length * 26;
    buffs.forEach((b) => {
      const flashT = pb?.texts.find((tx) => tx.source === b.label && now - tx.t >= 0 && now - tx.t < 0.7);
      buffIcon(r, bxp, 4, { lane: LANE[b.lane] ? b.lane : 'chain', flash: Boolean(flashT) }, 22);
      if (flashT) {
        const k = (now - flashT.t) / 0.7;
        bold(r, flashT.text, Math.min(bxp + 11, 880), 44 + k * 8, { size: F.xs, color: LANE[b.lane]?.color || T.text, align: 'center', alpha: 1 - k });
      }
      if (!busy() && pointer.y >= 4 && pointer.y <= 26 && pointer.x >= bxp && pointer.x <= bxp + 22) hoverTip(r, bxp - 200, 34, [b.label, ...(b.description ? [b.description] : [])]);
      bxp += 26;
    });
    smallButton(r, R.buttons.back.x, R.buttons.back.y, R.buttons.back.w, R.buttons.back.h, '≡');

    // 集色
    colorRing(r, R.ring.cx, R.ring.cy, R.ring.rad, pb && pb.totalAt > 0 ? (snapshot.recordedColors || []) : (snap.recordedColors || []), snap.currentColor, R.ring.dot);

    // 预览
    if (!casting && snap.chain.length && preview) drawPreview(r, snap);

    // 左下：牌堆
    const PL = R.pile;
    for (let k = 2; k >= 0; k--) r.rect({ x: PL.x + k * 3, y: PL.y - k * 3, w: 50, h: 70, radius: 6, fill: '#3a2f22', stroke: '#8a7350', lineWidth: 1.5 });
    bold(r, String(snap.drawPileCount), PL.x + 31, PL.y + 32, { size: F.l, align: 'center' });
    [...COLOR_RING, 'white'].forEach((c, i) => {
      const cx = PL.x + 74 + (i % 2) * 44;
      const cy = PL.y + 2 + Math.floor(i / 2) * 19;
      const n = snap.drawPileByColor?.[c] ?? 0;
      r.rect({ x: cx, y: cy - 6, w: 9, h: 12, radius: 2, fill: swatch(c), alpha: n > 0 ? 1 : 0.25 });
      txt(r, String(n), cx + 14, cy, { size: F.xs, weight: 'bold', color: n > 0 ? T.text : T.text3 });
    });
    ['red', 'green', 'blue'].forEach((c, i) => {
      gemDot(r, PL.x + 6 + i * 44, PL.y + 88, c, 4);
      txt(r, `${snap.player.gemLevels?.[c]?.level ?? 1}级`, PL.x + 14 + i * 44, PL.y + 88, { size: F.xs, color: T.text2 });
    });

    // 手牌
    drawHand(r, snap, bx, pb);

    // 右下：键
    if (allowAutoArrange) smallButton(r, R.buttons.auto.x, R.buttons.auto.y, R.buttons.auto.w, R.buttons.auto.h, '自动排');
    smallButton(r, R.buttons.clear.x, R.buttons.clear.y, R.buttons.clear.w, R.buttons.clear.h, '全撤回');
    const C = R.cast;
    const press = pb && now < 0.15 ? 3 : 0;
    r.circle({ x: C.cx, y: C.cy + 4, r: C.r, fill: '#0b2a6e' });
    r.circle({ x: C.cx, y: C.cy + press, r: C.r, fill: casting && !press ? '#2a3a5e' : (hoverButton === 'cast' ? '#4a84f0' : '#3a74e0'), stroke: '#a9c8ff', lineWidth: 2 });
    if (press) r.circle({ x: C.cx, y: C.cy, r: C.r + now * 120, stroke: '#a9c8ff', lineWidth: 2, alpha: 1 - now / 0.15 });
    txt(r, casting ? '…' : (snap.chain.length ? '打出' : '结束'), C.cx, C.cy - 6, { size: F.l, weight: 'bold', align: 'center' });
    txt(r, '空格', C.cx, C.cy + 16, { size: F.xs, align: 'center', color: '#d6e4ff' });
    txt(r, `弃 ${snap.discardPileCount}`, C.cx + 30, C.cy + 54, { size: F.xs, color: T.text3 });

    // 不在播放里的小字（马上用的功能牌等）
    for (let i = notes.length - 1; i >= 0; i--) {
      const k = (clock - notes[i].t) / 1.4;
      if (k > 1) { notes.splice(i, 1); continue; }
      bold(r, notes[i].text, R.hero.cx, R.hero.base - 76 - k * 18 - i * 0, { size: F.m, color: '#c8fbff', align: 'center', alpha: k < 0.7 ? 1 : (1 - k) / 0.3 });
    }

    // 鼠标在怪身上：细节
    if (hoverMonster && !drag) {
      const i = snap.monsters.findIndex((m) => m.uid === hoverMonster);
      if (i >= 0 && mons[i].alive) monsterTooltip(r, mons[i], ms[i]);
    }
    // 鼠标在队友身上：他干什么
    if (!drag && !busy()) {
      allies.forEach((al, i) => {
        const P = R.allies[i];
        if (P && Math.abs(pointer.x - P.cx) < P.size * 0.5 && pointer.y > P.base - P.size && pointer.y < P.base + 20) {
          hoverTip(r, P.cx - 140, P.base - P.size - 70, [`队友（${al.roleTag || '友'}）：${al.label}`, ...(al.description ? [al.description] : [])]);
        }
      });
    }

    // 拖着的牌画在最上面
    if (drag?.moved) {
      const card = [...snap.hand, ...snap.chain].find((c) => c.uid === drag.uid);
      if (card) {
        const inZone = pointer.y < R.hand.zoneTop;
        if (inZone && card.usage === 'chain') {
          // 链里要插进去的位置：一条亮线
          const n = snap.chain.length - (drag.from === 'chain' ? 1 : 0);
          const idx = chainInsertIndex(n, pointer.x);
          const cs = chainSlots(n + 1);
          const s = cs[idx];
          if (s) r.rect({ x: s.cx - 2, y: s.y - 6, w: 4, h: s.h + 12, radius: 2, fill: T.connect, alpha: 0.5 + 0.4 * Math.sin(clock * 10) });
        }
        if (inZone && card.usage === 'instant') bold(r, '松手就用', pointer.x, pointer.y - 72, { size: F.s, color: '#c8fbff', align: 'center' });
        drawCard(r, card, { x: pointer.x, y: pointer.y - 20, rot: 0, scale: 1.05 });
      }
    }

    if (snapshot.outcome && !busy()) drawOutcome(r);
  }

  function overhead(r, m, sl, selected, pb, now) {
    const O = R.overhead;
    const w = clamp(sl.s * 0.75, O.minW, O.maxW);
    const x = sl.x - w / 2;
    const y = sl.y - sl.s - O.gap;
    const edge = m.tier === 'gatekeeper' ? '#a98bff' : m.tier === 'elite' ? T.gold : '#000000';
    let bx = x;
    if (m.totalBars > 1) {
      for (let i = 0; i < m.totalBars; i++) {
        r.rect({ x: bx, y: y - 1, w: 3, h: O.barH + O.toughH + 3, radius: 1, fill: i < m.totalBars - m.barIndex ? T.hp : '#3a3f4e' });
        bx += 5;
      }
      bx += 2;
    }
    const bw = w - (bx - x);
    r.rect({ x: bx - 1, y: y - 1, w: bw + 2, h: O.barH + 2, radius: 3, fill: '#0b0d12', stroke: edge, lineWidth: m.tier === 'normal' ? 0 : 1.2 });
    const ratio = clamp(m.hp / m.maxHp, 0, 1);
    if (pb && now - m.hpLagAt < 0.5) {
      const lag = clamp(lerp(m.hpLagFrom, m.hp, clamp((now - m.hpLagAt) / 0.5, 0, 1)) / m.maxHp, 0, 1);
      if (lag > ratio) r.rect({ x: bx, y, w: bw * lag, h: O.barH, radius: 2, fill: '#ffd0d0' });
    }
    if (ratio > 0) r.rect({ x: bx, y, w: Math.max(2, bw * ratio), h: O.barH, radius: 2, fill: pb && now - m.barSwitchAt < 0.15 ? '#ffffff' : T.hp });
    // 排链时：这条链大概能打掉多少（只算选中的那只）
    if (selected && preview && snapshot.chain.length && ratio > 0) {
      const ghost = Math.min(m.hp, preview.estimatedDamage || 0);
      const gx = bx + bw * clamp((m.hp - ghost) / m.maxHp, 0, 1);
      r.rect({ x: gx, y, w: bx + bw * ratio - gx, h: O.barH, fill: '#ffffff', alpha: 0.35 + 0.25 * Math.sin(clock * 6) });
    }
    const ty = y + O.barH + 2;
    if (m.shieldBroken) {
      r.rect({ x: bx, y: ty, w: bw, h: O.toughH, radius: 2, fill: T.breakCol, alpha: 0.5 + 0.3 * Math.sin(clock * 8) });
    } else if (m.shields?.length) {
      const will = selected && preview && snapshot.chain.length ? preview.shieldShred || {} : {};
      const cells = m.shields.flatMap((s) => Array.from({ length: s.max }, (_, k) => ({ c: s.color, on: k < s.current, blink: k < s.current && k >= s.current - (will[s.color] || 0) })));
      const cw = (bw - (cells.length - 1)) / cells.length;
      cells.forEach((c, i) => {
        const a = c.blink ? 0.35 + 0.65 * Math.abs(Math.sin(clock * 5)) : 1;
        r.rect({ x: bx + i * (cw + 1), y: ty, w: cw, h: O.toughH, fill: c.on ? swatch(c.c) : '#20242f', alpha: c.on ? a : 1 });
      });
    }
    const iy = y - 11;
    const urgent = m.countdown <= 1;
    const tick = pb && now - m.cdTickAt >= 0 && now - m.cdTickAt < 0.3 ? pop((now - m.cdTickAt) / 0.3) : 1;
    r.transform({ x: x + 8, y: iy, scale: (urgent ? 1 + 0.12 * Math.sin(clock * 7) : 1) * tick }, () => {
      r.circle({ x: 0, y: 0, r: 8, fill: urgent ? '#9a1c2a' : '#0b0d12', stroke: urgent ? T.danger : '#8a96b4', lineWidth: 1.5 });
      txt(r, String(m.countdown), 0, 1, { size: F.xs, weight: 'bold', align: 'center' });
    });
    if (pb && now - m.cdPlusAt >= 0 && now - m.cdPlusAt < 0.9) {
      const k = (now - m.cdPlusAt) / 0.9;
      bold(r, `${m.cdPlus > 0 ? '+' : ''}${m.cdPlus ?? 1}`, x + 8, iy - 14 - k * 10, { size: F.s, color: T.breakCol, align: 'center', alpha: 1 - k });
    }
    heartIcon(r, x + 23, iy + 1, 11, urgent ? T.heart : '#b0566a');
    txt(r, m.attackDamage === 0.5 ? '½' : String(m.attackDamage), x + 31, iy + 1, { size: F.xs, weight: 'bold', color: urgent ? '#ffb3ba' : T.text2 });
    let ix = x + w;
    const icons = [...(m.shieldBroken ? [{ g: '破', c: T.breakCol }] : []), ...(m.activeTraits || []).map(() => ({ g: '特', c: '#c9b6f2' }))];
    icons.reverse().forEach((ic) => {
      ix -= 15;
      r.rect({ x: ix, y: iy - 7, w: 14, h: 14, radius: 3, fill: '#0b0d12', stroke: ic.c, lineWidth: 1 });
      txt(r, ic.g, ix + 7, iy, { size: 10, weight: 'bold', align: 'center', color: ic.c });
    });
    if (selected) r.polygon({ points: [{ x: sl.x - 6, y: iy - 20 }, { x: sl.x + 6, y: iy - 20 }, { x: sl.x, y: iy - 12 }], fill: T.select });
  }

  function hoverTip(r, x, y, lines) {
    const w = Math.max(...lines.map((s) => r.measureText(s, { size: F.s }).width)) + 24;
    const h = 14 + lines.length * 20;
    const px = clamp(x, 8, W - w - 8);
    r.rect({ x: px, y, w, h, radius: 8, fill: '#0b0d12', stroke: '#576685', lineWidth: 1.2, alpha: 0.96 });
    lines.forEach((s, i) => txt(r, s, px + 12, y + 17 + i * 20, { size: F.s, color: i === 0 ? T.text : T.text2, weight: i === 0 ? 'bold' : 'normal' }));
  }

  function monsterTooltip(r, m, sl) {
    const lines = [
      [`${m.label} · ${TIER[m.tier] || ''}`, T.text2],
      [`第 ${m.barIndex + 1} / ${m.totalBars} 条血 · ${Math.round(m.hp)} / ${m.maxHp}`, T.text],
      [m.shieldBroken ? '盾破了：受到的伤害 ×1.5，出完手回满' : (m.shields?.length ? `盾 ${m.shields.map((s) => `${COLOR_META[s.color]?.label || s.color} ${s.current}/${s.max}`).join(' · ')}；削完了就破` : '没有盾'), m.shieldBroken ? T.breakCol : T.text],
      [`${m.countdown} 回合后出手：打 ${m.attackDamage === 0.5 ? '半' : m.attackDamage} 颗心`, m.countdown <= 1 ? '#ffb3ba' : T.text],
      ...(m.activeTraits || []).map((tr) => [`特性：${tr.label}`, '#d9ccf2']),
      ['点它：选它当目标；把牌拖到它身上也行', T.text3],
    ];
    const w = Math.max(...lines.map(([s]) => r.measureText(s, { size: F.s }).width)) + 26;
    const h = 16 + lines.length * 20;
    const x = clamp(sl.x + sl.s * 0.45 + 14, 8, W - w - 8);
    const y = clamp(sl.y - sl.s - 20, 36, 400 - h);
    r.rect({ x, y, w, h, radius: 8, fill: '#0b0d12', stroke: '#576685', lineWidth: 1.2, alpha: 0.96 });
    lines.forEach(([s, c], i) => txt(r, s, x + 12, y + 18 + i * 20, { size: i === 1 ? F.m : F.s, weight: i === 1 ? 'bold' : 'normal', color: c }));
  }

  function drawCard(r, c, slot) {
    r.transform({ x: slot.x, y: slot.y, rotate: slot.rot, scale: slot.scale }, () => {
      const x = -R.hand.cw / 2;
      const y = -R.hand.ch / 2;
      const w = R.hand.cw;
      const h = R.hand.ch;
      if (c.hidden) {
        r.rect({ x, y, w, h, radius: 8, fill: '#3a2f22', stroke: '#8a7350', lineWidth: 2 });
        bold(r, '？', 0, 0, { size: F.xl, align: 'center', color: '#c9a76a' });
        return;
      }
      if (c.usage === 'instant' || c.kind === 'function') {
        fnCard(r, { x, y, w, h, text: c.label, color: c.color && c.color !== 'colorless' ? c.color : null, draw: c.drawAfterPlay || 0, instant: c.usage === 'instant' });
      } else {
        const rel = c.relationToCurrent;
        gemCard(r, { x, y, w, h, color: c.color, gems: c.gems || [c.color], glow: rel === 'connect' ? 'connect' : rel === 'complement' ? 'complement' : null, dim: rel === 'break' && !slot.hovered });
      }
    });
  }

  function drawHand(r, snap, bx, pb) {
    if (pb) {
      // 打出去的时候手里剩下的牌压低一点，让出画面
      bx.hand.forEach((b) => drawCard(r, b.card, { ...b.slot, y: b.slot.y + 30 }));
      return;
    }
    const order = bx.hand.map((_, i) => i).filter((i) => !bx.hand[i].slot.hovered);
    const hov = bx.hand.findIndex((b) => b.slot.hovered);
    if (hov >= 0) order.push(hov);
    order.forEach((i) => drawCard(r, bx.hand[i].card, bx.hand[i].slot));
    if (hov >= 0 && !drag) {
      const c = bx.hand[hov].card;
      if (!c.hidden && c.description) hoverTip(r, bx.hand[hov].slot.x - 120, 330, [c.label, c.description]);
    }
    if (!snap.hand.length && !snap.chain.length) txt(r, '手里没牌了，点「结束」', 480, 500, { size: F.s, align: 'center', color: T.text3 });
    else if (!snap.chain.length && snapshot.phase === 'player_input') txt(r, '把牌拖到上面排成链', 480, 330, { size: F.s, align: 'center', color: T.text3, alpha: 0.8 });
  }

  function drawChain(r, snap, pb, now) {
    const chain = snap.chain;
    if (!chain.length) return;
    const bxChain = lastBoxes.chain;
    const fade = pb && pb.totalAt > 0 ? clamp(1 - (now - pb.totalAt) / 0.3, 0, 1) : 1;
    if (fade <= 0) return;
    r.withAlpha(fade, () => bxChain.forEach((sl, i) => {
      const step = (pb ? castPreview : preview)?.steps?.find((s) => s.cardUid === sl.uid);
      const fired = pb && i <= pb.fired;
      const kick = pb && pb.fired === i ? 1 - clamp((now - i * pb.interval) / 0.15, 0, 1) : 0;
      const mult = step ? `×${step.multiplierAfter}` : null;
      gemCard(r, { x: sl.x, y: sl.y - kick * 6, w: sl.w, h: sl.h, color: step?.resolvedColor || sl.card.color, gems: sl.card.gems || [sl.card.color], mult, fired, multSize: sl.w + R.chain.gap < 50 ? 10 : F.xs });
      if (i > 0 && step) chainJoint(r, sl.x - R.chain.gap / 2, sl.cy, step.relation === 'break' ? 'break' : step.relation);
    }));
  }

  function drawPreview(r, snap) {
    const P = R.preview;
    r.rect({ x: P.x, y: P.y, w: P.w, h: P.h, radius: 10, fill: '#07080c', alpha: 0.78, stroke: '#3e4862', lineWidth: 1 });
    txt(r, `≈ ${preview.estimatedDamage}`, P.x + 10, P.y + 16, { size: F.l, weight: 'bold', color: T.gold });
    txt(r, `${preview.estimatedHits} 发 · ×${preview.finalMultiplier}`, P.x + 10, P.y + 37, { size: F.xs, color: T.text2 });
    let hint = null;
    if (preview.willTriggerRainbow) hint = ['会触发彩虹 ×3', T.gold];
    else if (preview.expectedBreakUids?.length) hint = ['这条链能破盾', T.breakCol];
    else if (preview.hasComplementWhite) hint = ['合白：每只都吃一轮', '#ffffff'];
    else if (preview.colorsNeededForRainbow > 0) hint = [`再集 ${preview.colorsNeededForRainbow} 色就彩虹`, T.text2];
    if (hint) {
      r.rect({ x: P.x + 6, y: P.y + 49, w: P.w - 12, h: 18, radius: 9, fill: '#0f3940' });
      txt(r, hint[0], P.x + P.w / 2, P.y + 58, { size: F.xs, weight: 'bold', align: 'center', color: hint[1] });
    }
  }

  function drawCastFx(r, snap, pb, now, ms, mons) {
    const slotOf = (uid) => ms[snap.monsters.findIndex((m) => m.uid === uid)] || ms[0];
    const chainB = chainSlots(snap.chain.length);
    // 飞出去的宝石
    pb.shots.forEach((sh) => {
      const k = (now - sh.t) / (sh.land - sh.t);
      if (k < 0 || k > 1) return;
      const from = chainB[sh.step] ? { x: chainB[sh.step].cx, y: chainB[sh.step].y } : { x: 480, y: 270 };
      const tg = slotOf(sh.uid);
      const to = { x: tg.x, y: tg.y - tg.s * 0.5 };
      const ctl = { x: (from.x + to.x) / 2 + (sh.step % 2 ? 50 : -50), y: Math.min(from.y, to.y) - 40 };
      for (let tr = 3; tr >= 0; tr--) {
        const u = clamp(easeOut(k) - tr * 0.06, 0, 1);
        const p = { x: (1 - u) ** 2 * from.x + 2 * (1 - u) * u * ctl.x + u * u * to.x, y: (1 - u) ** 2 * from.y + 2 * (1 - u) * u * ctl.y + u * u * to.y };
        const sz = 7 - tr * 1.4;
        r.polygon({ points: [{ x: p.x, y: p.y - sz }, { x: p.x + sz * 0.8, y: p.y }, { x: p.x, y: p.y + sz }, { x: p.x - sz * 0.8, y: p.y }], fill: swatch(sh.color), stroke: tr ? null : '#ffffff', lineWidth: 1, alpha: tr ? 0.5 : 1 });
      }
      if (now - sh.land > -0.02 && now - sh.land < 0.3) {
        const kk = (now - sh.land) / 0.3;
        r.circle({ x: to.x, y: to.y, r: 6 + kk * 26, stroke: swatch(sh.color), lineWidth: 3 * (1 - kk), alpha: 1 - kk });
      }
    });
    pb.shots.forEach((sh) => { // 打中：一圈散开
      const kk = (now - sh.land) / 0.3;
      if (kk < 0 || kk > 1) return;
      const tg = slotOf(sh.uid);
      r.circle({ x: tg.x, y: tg.y - tg.s * 0.5, r: 6 + kk * 26, stroke: swatch(sh.color), lineWidth: 3 * (1 - kk), alpha: 1 - kk });
    });
    // 合白：每只怪脚下一圈白浪
    pb.whites.forEach((t0) => {
      const k = life(now, t0, 0.45);
      if (k < 0 || k > 1) return;
      mons.forEach((m, i) => { if (m.alive || m.deadAt >= t0) ellipse(r, ms[i].x, ms[i].y - 4, ms[i].s * (0.3 + k * 0.5), ms[i].s * (0.08 + k * 0.14), { stroke: '#ffffff', lineWidth: 4 * (1 - k), alpha: 1 - k }); });
      r.rect({ x: 0, y: 0, w: W, h: H, fill: '#ffffff', alpha: 0.1 * (1 - k) });
      if (k < 0.9) bold(r, '合白', 480, 244, { size: F.l, color: '#ffffff', outline: '#1d4a8a', align: 'center', alpha: 1 - k });
    });
    // 破盾：盾条碎开 + 血条右边弹「破盾！」
    pb.breaks.forEach((b) => {
      const k = life(now, b.t, 0.6);
      if (k < 0 || k > 1) return;
      const sl = slotOf(b.uid);
      const m = mons[snap.monsters.findIndex((x) => x.uid === b.uid)];
      const y0 = sl.y - sl.s - R.overhead.gap + R.overhead.barH + 3;
      const cols = (snap.monsters.find((x) => x.uid === b.uid)?.shields || []).map((s) => s.color);
      for (let f = 0; f < 12; f++) {
        const ang = -Math.PI * (0.1 + 0.8 * (f / 11));
        const sp = 60 + (f % 3) * 25;
        r.rect({ x: sl.x + Math.cos(ang) * sp * k - 3, y: y0 + Math.sin(ang) * sp * k + 120 * k * k, w: 6, h: 4, fill: swatch(cols[f % Math.max(1, cols.length)] || 'white'), alpha: 1 - k });
      }
      const bw = clamp(sl.s * 0.75, R.overhead.minW, R.overhead.maxW);
      r.transform({ x: sl.x + bw / 2 + 44, y: y0 - 4, scale: pop(k * 2.5) }, () => bold(r, '破盾！', 0, 0, { size: F.l, color: T.breakCol, align: 'center', alpha: k < 0.7 ? 1 : (1 - k) / 0.3 }));
      if (m && !m.alive) return;
    });
    // 换一条血
    mons.forEach((m, i) => {
      const k = life(now, m.barSwitchAt, 0.8);
      if (k < 0 || k > 1) return;
      const sl = ms[i];
      const bw = clamp(sl.s * 0.75, R.overhead.minW, R.overhead.maxW);
      r.transform({ x: sl.x + bw / 2 + 50, y: sl.y - sl.s - R.overhead.gap + 3, scale: pop(k * 3) }, () => bold(r, '下一条血', 0, 0, { size: F.m, color: '#c69cff', align: 'center', alpha: k < 0.7 ? 1 : (1 - k) / 0.3 }));
    });
    // 队友出手：一道斜着的刀痕
    pb.allyActs.forEach((a) => {
      const k = life(now, a.t + 0.25, 0.3);
      if (k < 0 || k > 1) return;
      const tg = ms[Math.max(0, snap.monsters.findIndex((m) => m.uid === snap.selectedTargetUid))] || ms[0];
      const cx = tg.x;
      const cy = tg.y - tg.s * 0.5;
      let prev = null;
      for (let q = 0; q <= 10; q++) {
        const u = q / 10;
        const p = { x: cx - 50 + u * 100, y: cy - 40 + u * 80 - Math.sin(u * Math.PI) * 20 };
        if (prev && u <= k * 1.6) r.line({ x1: prev.x, y1: prev.y, x2: p.x, y2: p.y, color: '#e6d4ff', lineWidth: 6 * (1 - k) + 1, alpha: 1 - k * 0.6 });
        prev = p;
      }
    });
    // 彩虹：目标脚下一圈六色往外扩
    {
      const k = life(now, pb.rainbowAt, 0.7);
      if (k >= 0 && k <= 1) {
        const tg = ms[Math.max(0, snap.monsters.findIndex((m) => m.uid === snap.selectedTargetUid))] || ms[0];
        COLOR_RING.forEach((c, j) => ellipse(r, tg.x, tg.y - 4, 30 + k * 150 + j * 6, 8 + k * 40 + j * 2, { stroke: swatch(c), lineWidth: 3, alpha: (1 - k) * 0.9 }));
        r.transform({ x: Math.min(tg.x + tg.s * 0.5 + 72, 880), y: tg.y - tg.s * 0.45, scale: pop(k * 2) }, () => rainbowText(r, '彩虹 ×3', 0, 0, F.xl));
      }
    }
    // 飘字：一发一个数（设计稿 5.3）
    {
      const rnd = (n, k) => { const v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); };
      const SIZE = { normal: 17, white: 17, rainbow: 19, crit: 23, ally: 26 };
      const COLOR = { normal: '#ffffff', white: '#ffffff', crit: T.crit, ally: '#ffd9a8' };
      const EDGE = { normal: '#07080c', white: '#1d4a8a', crit: '#3a1a00', ally: '#5a2a0a' };
      const lifeT = pb.chainCount > 8 ? 0.5 : 0.75;
      pb.floaters.forEach((f) => {
        const dur = f.kind === 'ally' ? 1.1 : lifeT;
        const k = life(now, f.t, dur);
        if (k < 0 || k > 1) return;
        const sl = slotOf(f.uid);
        const w = Math.max(sl.s, 100);
        const x = f.kind === 'ally' ? sl.x + w * 0.42 : sl.x + (rnd(f.n, 1) - 0.5) * w * 1.25;
        const y = (f.kind === 'ally' ? sl.y - sl.s * 0.75 : sl.y - sl.s * (0.15 + rnd(f.n, 2) * 0.7)) - k * 16;
        r.withAlpha(k < 0.7 ? 1 : (1 - k) / 0.3, () => r.transform({ x, y, scale: pop(k * 6) }, () => {
          if (f.kind === 'rainbow') rainbowText(r, f.text, 0, 0, SIZE.rainbow);
          else bold(r, f.text, 0, 0, { size: SIZE[f.kind] || 17, align: 'center', color: COLOR[f.kind] || '#fff', outline: EDGE[f.kind] || '#07080c' });
        }));
      });
    }
    // 效果的小字（加成、怪的特性……）：主角头上冒
    const buffLabels = new Set((snap.player.buffs || []).map((b) => b.label));
    pb.texts.forEach((tx, i) => {
      const k = life(now, tx.t, 1.2);
      if (k < 0 || k > 1) return;
      if (buffLabels.has(tx.source)) return; // 加成的字在右上角它的图标下面冒
      bold(r, tx.text, R.hero.cx, R.hero.base - 80 - k * 16 - (i % 3) * 18, { size: F.s, color: '#c8fbff', align: 'center', alpha: k < 0.7 ? 1 : (1 - k) / 0.3 });
    });
    // 总数
    {
      const k = life(now, pb.totalAt, 1.8);
      if (k >= 0 && k <= 1 && pb.summary) {
        const a = k < 0.8 ? 1 : (1 - k) / 0.2;
        r.withAlpha(a, () => {
          r.transform({ x: R.total.cx, y: R.total.cy, scale: pop(k * 4) }, () => bold(r, String(Math.round(Math.max(pb.total, pb.summary.totalDamage))), 0, 0, { size: F.xxl, color: pb.summary.rainbowTriggered ? T.gold : '#ffffff', align: 'center' }));
          const why = `${pb.summary.playedCount} 张 · ×${pb.summary.finalMultiplier} · ${pb.summary.totalHits} 发${pb.summary.rainbowTriggered ? ' · 彩虹' : ''}`;
          const lw = r.measureText(why, { size: F.s }).width + 24;
          r.rect({ x: R.total.cx - lw / 2, y: R.total.cy + 26, w: lw, h: 24, radius: 12, fill: '#07080c', alpha: 0.8 });
          txt(r, why, R.total.cx, R.total.cy + 38, { size: F.s, align: 'center', color: T.text2 });
        });
      }
    }
    // 怪的回合
    {
      const k = life(now, pb.monAt, 0.9);
      if (k >= 0 && k <= 1) {
        const a = k < 0.75 ? 1 : (1 - k) / 0.25;
        r.rect({ x: 400, y: 40, w: 160, h: 26, radius: 13, fill: '#3a0d14', stroke: T.danger, lineWidth: 1.5, alpha: a * 0.92 });
        txt(r, '怪的回合', 480, 53, { size: F.s, weight: 'bold', align: 'center', color: '#ffd0d5', alpha: a });
      }
    }
    // 怪出手：红线扑向主角，屏幕四边一圈红
    pb.attacks.forEach((at) => {
      const k = life(now, at.t + 0.15, 0.35);
      if (k < 0 || k > 1) return;
      const sl = slotOf(at.uid);
      r.line({ x1: sl.x, y1: sl.y - 10, x2: R.hero.cx, y2: R.hero.base - 30, color: at.blocked ? '#6dc9ff' : T.danger, lineWidth: 8 * (1 - k) + 1, alpha: 1 - k });
      if (!at.blocked) {
        r.rect({ x: 0, y: 0, w: W, h: H, stroke: T.danger, lineWidth: 14, alpha: (1 - k) * 0.8 });
        bold(r, `-${at.heartsLost === 0.5 ? '½' : at.heartsLost}`, R.hero.cx + 34, R.hero.base - 60 - k * 20, { size: F.l, color: T.heart, align: 'center', alpha: 1 - k });
      } else {
        bold(r, '挡下了', R.hero.cx + 40, R.hero.base - 60 - k * 20, { size: F.m, color: '#bfe6ff', align: 'center', alpha: 1 - k });
      }
    });
  }

  function drawOutcome(r) {
    const win = snapshot.outcome === 'win';
    r.rect({ x: 0, y: 0, w: W, h: H, fill: '#000000', alpha: 0.55 });
    r.rect({ x: 320, y: 190, w: 320, h: 170, radius: 14, fill: '#10141d', stroke: win ? T.gold : T.danger, lineWidth: 2 });
    bold(r, win ? '打赢了' : '倒下了', 480, 232, { size: F.xl, color: win ? T.gold : T.danger, align: 'center' });
    const st = result?.stats;
    if (st) txt(r, `${st.turns} 回合 · 总伤害 ${st.totalDamage} · 掉了 ${st.heartsLost} 颗心`, 480, 268, { size: F.s, align: 'center', color: T.text2 });
    outcomeButtons().forEach((b) => {
      r.rect({ x: b.x, y: b.y, w: b.w, h: b.h, radius: 8, fill: hoverButton === b.id ? '#2a3550' : '#1b2030', stroke: '#576685', lineWidth: 1 });
      txt(r, b.label, b.x + b.w / 2, b.y + b.h / 2, { size: F.s, weight: 'bold', align: 'center' });
    });
  }

  return {
    setState,
    update,
    onPointer,
    render,
    isBusy: busy,
    /** 测试、截图用：现在手牌、链、怪、键的位置 */
    getLayoutBoxes() {
      const b = boxes();
      return {
        hand: b.hand.map((h) => ({ uid: h.uid, x: h.x, y: h.y, w: h.w, h: h.h, cx: h.slot.x, cy: h.slot.y })),
        chain: b.chain.map((c) => ({ uid: c.uid, x: c.x, y: c.y, w: c.w, h: c.h, cx: c.cx, cy: c.cy })),
        monsters: b.monsters.map((m) => ({ uid: m.uid, x: m.x, y: m.y, w: m.w, h: m.h })),
        buttons: b.buttons.map((x) => ({ ...x })),
      };
    },
  };
}
