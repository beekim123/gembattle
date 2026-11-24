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
  ellipse, forest, inRect, smallButton, swatch, txt,
} from '../ui/index.js';
import { REGIONS, W, H, castListSlots, chainInsertIndex, chainSlots, fanSlots, hitRotated, monsterSlots } from './layout.js';
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
const TIER = { normal: '普通', elite: '精英', gatekeeper: '看门的' };

function heartIcon(r, x, y, s, fill) {
  const pts = [];
  for (let i = 0; i <= 20; i++) {
    const t = (i / 20) * Math.PI * 2;
    pts.push({ x: x + (16 * Math.sin(t) ** 3 * s) / 34, y: y - ((13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s) / 34 });
  }
  r.polygon({ points: pts, fill });
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

  // ── 牌的位置补间（照用户旧原型的交互：牌都是滑过去的，不跳）──
  const anim = new Map(); // uid → { x, y, w, h, rot }（中心点）
  let frameDt = 1 / 60;
  let newThisFrame = 0;
  let speed = 1; // 打的时候点一下画面 ×3，再点一下跳过
  let rollTotal = 0; // 顶上总伤害一路往上滚
  function tween(uid, target, from = null) {
    let a = anim.get(uid);
    if (!a) {
      a = { ...(from || target), wait: from ? newThisFrame++ * 0.08 : 0 };
      anim.set(uid, a);
    }
    a.seen = clock;
    if (a.wait > 0) { a.wait -= frameDt; return a; }
    const k = 1 - Math.exp(-frameDt * 14);
    for (const key of ['x', 'y', 'w', 'h', 'rot']) a[key] += (target[key] - a[key]) * k;
    return a;
  }
  const pileFrom = () => ({ x: R.pile.x + 28, y: R.pile.y + 32, w: 50, h: 70, rot: 0 });

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
      speed = 1;
      rollTotal = 0;
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
    frameDt = Math.min(0.1, Math.max(0.001, dt));
    for (const [uid, a] of anim) if (clock - a.seen > 1.5) anim.delete(uid);
    if (playback) {
      playT += dt * speed;
      playback.advance(playT);
      const goal = playback.state.total;
      if (rollTotal < goal) rollTotal = Math.min(goal, rollTotal + Math.max(1, Math.ceil((goal - rollTotal) * 0.18)));
      if (playback.done) { playback = null; shown = snapshot; speed = 1; }
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
      ...(options.outcomeMode === 'run' ? [] : [{ id: 'back', ...R.buttons.back }]), // 走一趟里的仗不能半路走
    ];
    lastBoxes = { hand, chain, monsters, buttons };
    return lastBoxes;
  }

  /** 拖着马上用的牌，现在松手算不算用：拖过 instantTop，而且比按下时高 20 以上 */
  function instantReady(d, y) {
    return y < R.hand.instantTop && y < d.startY - 20;
  }

  /** 拖马上用的牌时，战场中间画一圈虚线框「松手就用」；够了就亮 */
  function drawInstantZone(r, ready) {
    const Z = R.instantZone;
    const col = ready ? '#8fe3ff' : '#4f6a7a';
    const dash = [8, 6];
    const lw = ready ? 2 : 1.5;
    r.rect({ x: Z.x, y: Z.y, w: Z.w, h: Z.h, radius: 14, fill: '#8fe3ff', alpha: ready ? 0.08 : 0.03 });
    r.line({ x1: Z.x, y1: Z.y, x2: Z.x + Z.w, y2: Z.y, color: col, lineWidth: lw, dash });
    r.line({ x1: Z.x, y1: Z.y + Z.h, x2: Z.x + Z.w, y2: Z.y + Z.h, color: col, lineWidth: lw, dash });
    r.line({ x1: Z.x, y1: Z.y, x2: Z.x, y2: Z.y + Z.h, color: col, lineWidth: lw, dash });
    r.line({ x1: Z.x + Z.w, y1: Z.y, x2: Z.x + Z.w, y2: Z.y + Z.h, color: col, lineWidth: lw, dash });
    bold(r, ready ? '松手就用' : '往上拖到框里，松手就用', Z.x + Z.w / 2, Z.y + 18, { size: F.s, color: col, align: 'center' });
  }

  let lateTip = null; // 画在最上面的说明框（集色环、预览算式）：{ x, y, lines, alignRight }

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
    if (type === 'down' && busy()) {
      // 打的时候：点一下加速，再点一下跳过（照旧原型）
      if (speed === 1) { speed = 3; notes.push({ t: clock, text: '加速' }); } else { playT = playback.duration; }
      return { cursor: 'default' };
    }
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
        if (d.moved) anim.set(d.uid, { x: pointer.x, y: pointer.y - 20, w: R.hand.cw * 1.05, h: R.hand.ch * 1.05, rot: 0, seen: clock, wait: 0 });
        if (!d.moved || !canAct) return { cursor: 'default' };
        const card = [...snapshot.hand, ...snapshot.chain].find((c) => c.uid === d.uid);
        const overMonster = bx.monsters.find((m) => inRect(m, x, y) && shownMonster(m.uid)?.alive);
        const inHandZone = y >= R.hand.zoneTop;
        if (d.from === 'hand') {
          if (card?.usage === 'instant') {
            // 马上用的牌：明显往上拖离手牌就用（第 3 轮审核 S4：原来要拖过 404 线，常常拖了一点又退回手里）
            if (instantReady(d, y)) callbacks.onPlayInstant?.(d.uid);
            return { cursor: 'default' };
          }
          if (inHandZone || !card) return { cursor: 'default' }; // 放回手里：什么都不做
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
    // 走一趟里打的仗：只有一个「接着走」（死了是「看看这一趟」），不能再打一次
    if (options.outcomeMode === 'run') {
      return [{ id: 'back', x: 410, y: 300, w: 140, h: 36, label: snapshot?.outcome === 'win' ? '接着走' : '看看这一趟' }];
    }
    return [
      { id: 'retry', x: 360, y: 300, w: 110, h: 36, label: '再打一次' },
      { id: 'back', x: 490, y: 300, w: 110, h: 36, label: '回大厅' },
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
      // 样子只给 look 编号，长什么样由 render 后端定（以后换成堆叠美术，这里不改）
      const lookId = m.look || (m.tier === 'gatekeeper' ? 'mon_gatekeeper' : m.tier === 'elite' ? 'mon_elite' : 'mon_dual_shield');
      let a = 1;
      if (!m.alive) a = m.deadAt != null && m.deadAt >= 0 ? Math.max(0, 1 - (now - m.deadAt) / 0.5) : 0;
      if (a <= 0) return;
      const recoil = pb ? Math.max(0, 1 - (now - m.flashAt) / 0.15) * 4 : 0;
      const dy = lungeOf(m.uid) - recoil;
      const flashing = pb && now - m.flashAt < 0.1;
      r.drawActor({ look: lookId, x: sl.x, y: sl.y + dy, size: sl.s, t: clock, alpha: a, state: m.alive ? 'idle' : 'dead' });
      if (flashing) r.drawActor({ look: lookId, x: sl.x, y: sl.y + dy, size: sl.s, t: clock, alpha: 0.3, flash: true, shadow: false });
      if (!m.alive) {
        const p = (now - m.deadAt) / 0.5;
        for (let k = 0; k < 10; k++) {
          const ang = (k / 10) * Math.PI * 2;
          r.rect({ x: sl.x + Math.cos(ang) * p * 40, y: sl.y - sl.s * 0.5 + Math.sin(ang) * p * 30 - p * 20, w: 5, h: 5, fill: '#cfc4f0', alpha: a });
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
      const allyLook = `ally_${al.role || 'support'}`;
      if (act) for (let g = 1; g <= 3; g++) r.drawActor({ look: allyLook, x: P.cx + ox * (1 - g * 0.25), y: P.base + oy * (1 - g * 0.25), size: P.size / 0.85, t: clock, alpha: 0.18, shadow: false });
      r.drawActor({ look: allyLook, x: P.cx + ox, y: P.base + oy, size: P.size / 0.85, t: clock, state: act ? 'attack' : 'idle' });
      r.circle({ x: P.cx, y: P.base + 10, r: 10, fill: '#0b0d12', stroke: col, lineWidth: 1.5 });
      txt(r, (al.roleTag || al.label || '友').slice(0, 1), P.cx, P.base + 10, { size: F.xs, weight: 'bold', align: 'center', color: col });
      if (act) {
        const k = clamp((now - act.t) / 0.6, 0, 1);
        bold(r, act.label, P.cx + ox, P.base + oy - P.size - 10, { size: F.s, color: col, align: 'center', alpha: k < 0.7 ? 1 : (1 - k) / 0.3 });
      }
    };
    allies.forEach((al, i) => { if (!actOf(al)) drawAlly(al, i); });
    const heroHit = pb?.attacks.find((a) => !a.blocked && now - a.t - 0.15 >= 0 && now - a.t - 0.15 < 0.3);
    const heroBlock = pb?.attacks.find((a) => a.blocked && now - a.t - 0.15 >= 0 && now - a.t - 0.15 < 0.5);
    // 主角施法：每张牌亮起来，他往上一顶，手上一圈那张牌的颜色
    const castFire = pb?.fires.slice().reverse().find((f) => now - f.t >= 0 && now - f.t < 0.3);
    const heroLift = castFire ? Math.sin(clamp((now - castFire.t) / 0.3, 0, 1) * Math.PI) * 7 : 0;
    r.drawActor({ look: 'hero', x: R.hero.cx, y: R.hero.base - heroLift, size: R.hero.size, t: clock, state: castFire ? 'attack' : 'idle' });
    if (castFire) {
      const kk = (now - castFire.t) / 0.3;
      const hy = R.hero.base - R.hero.size - 8 - heroLift;
      r.circle({ x: R.hero.cx, y: hy, r: 5 + kk * 20, stroke: swatch(castFire.color), lineWidth: 4 * (1 - kk) + 1, alpha: 1 - kk });
      r.circle({ x: R.hero.cx, y: hy, r: 6 * (1 - kk) + 2, fill: swatch(castFire.color), alpha: 1 - kk * 0.5 });
    }
    if (heroHit) r.drawActor({ look: 'hero', x: R.hero.cx, y: R.hero.base, size: R.hero.size, flash: true, alpha: 0.45, shadow: false });
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
    if (options.outcomeMode !== 'run') smallButton(r, R.buttons.back.x, R.buttons.back.y, R.buttons.back.w, R.buttons.back.h, '≡');

    // 集色
    // 链尾现在是哪色：链里最后一张变成的颜色，没排就是上回合最后打的那色。白圈是它，绿圈接得上，金圈是补色
    const tailColor = (!pb && snap.chain.length && preview?.steps?.length ? preview.steps[preview.steps.length - 1].resolvedColor : null) || snap.currentColor;
    colorRing(r, R.ring.cx, R.ring.cy, R.ring.rad, pb && pb.totalAt > 0 ? (snapshot.recordedColors || []) : (snap.recordedColors || []), tailColor, R.ring.dot, pb ? null : tailColor);
    // 鼠标放在集色环上：说明（画在最上面，不让手牌盖住）
    const ringTip = !pb && Math.hypot(pointer.x - R.ring.cx, pointer.y - R.ring.cy) < R.ring.rad + R.ring.dot + 6;
    if (ringTip) {
      lateTip = { x: R.ring.cx - 20, y: R.ring.cy - 150, lines: [
        `集色：集到 ${(snap.recordedColors || []).length}/6，集齐 6 色打彩虹`,
        '白圈：链尾现在的颜色',
        '绿圈：挨着的，接上倍率 ×2',
        '金圈：补色，接上 ×2 还多打一轮白（合白）',
        '别的颜色：色环上隔开了，接上去是断色',
      ] };
    } else lateTip = null;

    // 预览；鼠标放上去看算式（5.3：「几颗宝石 × 倍率 = 几发」「每发 = 攻击 × ……」）
    if (!casting && snap.chain.length && preview) {
      drawPreview(r, snap);
      if (inRect(R.preview, pointer.x, pointer.y) && preview.formulaLines?.length) lateTip = { x: R.preview.x + R.preview.w - 8, y: R.preview.y + R.preview.h + 6, lines: ['这条链怎么算', ...preview.formulaLines], alignRight: true };
    }

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
    txt(r, casting ? (speed > 1 ? '再点跳过' : '点画面加速') : '空格', C.cx, C.cy + 16, { size: F.xs, align: 'center', color: '#d6e4ff' });
    txt(r, `弃 ${snap.discardPileCount}`, C.cx + 30, C.cy + 54, { size: F.xs, color: T.text3 });
    // 留几张、下回合手里几张（5.1 第 4 版：留牌也能摸，但回合开始最多 N + 2）
    if (!casting && snapshot.phase === 'player_input' && Number.isFinite(snap.player?.nextTurnHand)) {
      const kept = snap.hand.length;
      const line = kept ? `留 ${kept} 张 → 下回合 ${snap.player.nextTurnHand} 张` : `下回合 ${snap.player.nextTurnHand} 张`;
      txt(r, line, C.cx, C.cy - C.r - 12, { size: F.xs, align: 'center', color: kept ? '#d6e4ff' : T.text3 });
    }

    // 不在播放里的小字（马上用的功能牌等）
    for (let i = notes.length - 1; i >= 0; i--) {
      const k = (clock - notes[i].t) / 1.4;
      if (k > 1) { notes.splice(i, 1); continue; }
      bold(r, notes[i].text, R.hero.cx, R.hero.base - 76 - k * 18 - (notes.length - 1 - i) * 24, { size: F.m, color: '#c8fbff', align: 'center', alpha: k < 0.7 ? 1 : (1 - k) / 0.3 });
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

    if (lateTip && !drag) {
      const w = Math.max(...lateTip.lines.map((s) => r.measureText(s, { size: F.s }).width)) + 24;
      hoverTip(r, lateTip.alignRight ? lateTip.x - w : lateTip.x, lateTip.y, lateTip.lines);
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
        if (card.usage === 'instant' && drag.from === 'hand') drawInstantZone(r, instantReady(drag, pointer.y));
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
    // 排链时：这条链大概能打掉多少（预览按每只怪各算；老数据没有 byMonster 就只画选中的那只）
    const pm = preview && snapshot.chain.length ? (preview.byMonster ? preview.byMonster[m.uid] : (selected ? { damage: preview.estimatedDamage, shieldShred: preview.shieldShred } : null)) : null;
    if (pm && pm.damage > 0 && ratio > 0) {
      const ghost = Math.min(m.hp, pm.damage);
      const gx = bx + bw * clamp((m.hp - ghost) / m.maxHp, 0, 1);
      r.rect({ x: gx, y, w: bx + bw * ratio - gx, h: O.barH, fill: '#ffffff', alpha: 0.35 + 0.25 * Math.sin(clock * 6) });
    }
    const ty = y + O.barH + 2;
    if (m.shieldBroken) {
      r.rect({ x: bx, y: ty, w: bw, h: O.toughH, radius: 2, fill: T.breakCol, alpha: 0.5 + 0.3 * Math.sin(clock * 8) });
    } else if (m.shields?.length) {
      const will = pm?.shieldShred || {};
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
      ix -= 17;
      r.rect({ x: ix, y: iy - 8, w: 16, h: 16, radius: 3, fill: '#0b0d12', stroke: ic.c, lineWidth: 1 });
      txt(r, ic.g, ix + 8, iy, { size: F.xs, weight: 'bold', align: 'center', color: ic.c });
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
      // 强化过的牌：右上角一个金色「+」（6.3；第 3 轮审核 S6：原来进了战斗就看不出哪张强化过）
      if (c.enhanced) enhanceBadge(r, x + w - 21, y + 5);
    });
  }

  function enhanceBadge(r, x, y, s = 16) {
    r.rect({ x, y, w: s, h: s, radius: 4, fill: T.gold, stroke: '#0b0d12', lineWidth: 1.5 });
    bold(r, '+', x + s / 2, y + s / 2, { size: s >= 16 ? F.s : F.xs, align: 'center', color: '#2a1e08' });
  }

  const ENHANCE_WORD = { pain: '疼：这张每发 +50%', more: '多：多算 1 颗宝石', shred: '破盾：每颗多削 1 格', record: '集色：顺带记旁边一色', number: '数 +1' };

  // 手牌头上：打下一张会怎样（照旧原型）
  const HAND_HINT = {
    connect: ['×2 接上', T.connect],
    complement: ['×2 合白', T.complement],
    break: ['断色', T.danger],
    start: ['起手', '#c8d0e0'],
    instant: ['马上用', '#8fe3ff'],
  };

  function handPos(b, lowered = 0) {
    const sl = b.slot;
    return tween(b.uid, { x: sl.x, y: sl.y + lowered, w: R.hand.cw * sl.scale, h: R.hand.ch * sl.scale, rot: sl.rot }, pileFrom());
  }

  function drawHand(r, snap, bx, pb) {
    newThisFrame = 0;
    if (pb) {
      // 打出去的时候手里剩下的牌压低一点，让出画面
      bx.hand.forEach((b) => { const a = handPos(b, 30); drawCard(r, b.card, { x: a.x, y: a.y, rot: a.rot, scale: a.w / R.hand.cw }); });
      return;
    }
    const order = bx.hand.map((_, i) => i).filter((i) => !bx.hand[i].slot.hovered);
    const hov = bx.hand.findIndex((b) => b.slot.hovered);
    if (hov >= 0) order.push(hov);
    order.forEach((i) => {
      const b = bx.hand[i];
      const a = handPos(b);
      drawCard(r, b.card, { x: a.x, y: a.y, rot: a.rot, scale: a.w / R.hand.cw, hovered: b.slot.hovered });
      // 手牌多了（8 张起）头顶的字会挤在一起：只给鼠标放着的那张写，别的看牌框的颜色
      const crowded = bx.hand.length > 7 && !b.slot.hovered;
      let hint = !crowded && !b.card.hidden && !drag && snapshot.phase === 'player_input' ? HAND_HINT[b.card.usage === 'instant' ? 'instant' : b.card.relationToCurrent] : null;
      // 鼠标放在断色的牌上，多说一句为什么（看左下集色环）
      if (hint && b.slot.hovered && b.card.relationToCurrent === 'break') hint = ['断色：色环上没挨着', hint[1]];
      // 鼠标放在强化过的牌上，写它强化的是哪样
      if (hint && b.slot.hovered && b.card.enhanced && ENHANCE_WORD[b.card.enhanceDir]) hint = [`${hint[0]} · 强化过（${ENHANCE_WORD[b.card.enhanceDir]}）`, hint[1]];
      if (hint && a.wait <= 0) {
        const d = a.h / 2 + 10;
        bold(r, hint[0], a.x + Math.sin(a.rot) * d, a.y - Math.cos(a.rot) * d, { size: F.xs, color: hint[1], align: 'center', alpha: b.card.relationToCurrent === 'break' ? 0.75 : 1 });
      }
    });
    if (hov >= 0 && !drag) {
      const c = bx.hand[hov].card;
      if (!c.hidden && c.description) hoverTip(r, bx.hand[hov].slot.x - 120, 320, [c.label, c.description]);
    }
    if (!snap.hand.length && !snap.chain.length) txt(r, '手里没牌了，点「结束」', 480, 500, { size: F.s, align: 'center', color: T.text3 });
    else if (!snap.chain.length && snapshot.phase === 'player_input') txt(r, '把牌拖到上面排成链', 480, 284, { size: F.s, align: 'center', color: T.text3, alpha: 0.8 });
  }

  const REL_WORD = { start: ['起手', '#c8d0e0'], connect: ['接上 ×2', T.connect], complement: ['补色 · 合白', T.complement], break: ['断色', T.danger] };

  function drawChain(r, snap, pb, now) {
    const chain = snap.chain;
    if (!chain.length) return;
    if (pb) { drawCastList(r, snap, pb, now); return; }
    lastBoxes.chain.forEach((sl, i) => {
      const step = preview?.steps?.find((s) => s.cardUid === sl.uid);
      const mult = step ? `×${step.multiplierAfter}` : null;
      const a = tween(sl.uid, { x: sl.cx, y: sl.cy, w: sl.w, h: sl.h, rot: 0 });
      const settled = Math.abs(a.x - sl.cx) < 3 && Math.abs(a.y - sl.cy) < 3;
      r.transform({ x: a.x, y: a.y, rotate: a.rot }, () => {
        gemCard(r, { x: -a.w / 2, y: -a.h / 2, w: a.w, h: a.h, color: step?.resolvedColor || sl.card.color, gems: sl.card.gems || [sl.card.color], mult: settled ? mult : null, multSize: F.xs });
        if (sl.card.enhanced) enhanceBadge(r, a.w / 2 - 13, -a.h / 2 + 1, 12);
      });
      if (!settled) return;
      if (i > 0 && step) chainJoint(r, sl.x - R.chain.gap / 2, sl.cy, step.relation === 'break' ? 'break' : step.relation);
      // 底下写这张打几发（照旧原型）
      if (step?.hits) txt(r, `${step.hits} 发`, sl.cx, sl.y + sl.h + 9, { size: F.xs, align: 'center', color: T.text2 });
    });
  }

  /** 打出去以后：链收到最左边竖成一列，当前这张亮，打完的变暗（D1） */
  function drawCastList(r, snap, pb, now) {
    const chain = snap.chain;
    const n = chain.length;
    const from = chainSlots(n);
    const to = castListSlots(n);
    // 最后一小段：顺序表上的牌一张张飞进弃牌堆（照旧原型）
    const flyStart = playback.duration - 0.55;
    const endFade = clamp((playback.duration - now) / 0.3, 0, 1);
    const dis = { x: R.cast.cx + 34, y: R.cast.cy + 54 };
    r.withAlpha(1, () => {
      // 底：一条竖着的淡板，上面写「施法顺序」
      const last = to[n - 1];
      const k0 = easeOut(now / Math.max(0.01, pb.lead));
      r.rect({ x: R.castList.x - 6, y: R.castList.top - 22, w: 132, h: last.y + last.h - R.castList.top + 30, radius: 10, fill: '#05070a', alpha: 0.55 * k0 * endFade });
      txt(r, '施法顺序', R.castList.x, R.castList.top - 11, { size: F.xs, color: T.text3, alpha: k0 * endFade });
      chain.forEach((c, i) => {
        const step = castPreview?.steps?.find((s) => s.cardUid === c.uid);
        const fire = pb.fires.find((f) => f.step === i);
        const k = easeOut((now - i * 0.025) / Math.max(0.01, pb.lead));
        const A = from[i];
        const B = to[i];
        const cur = fire && pb.fired === i;
        const done = fire && pb.fired > i;
        const pulse = cur ? pop(clamp((now - fire.t) / 0.25, 0, 1)) : 1;
        const fk = easeOut((now - flyStart - i * 0.025) / 0.3);
        const x = lerp(lerp(A.x, B.x, k) + (cur ? 10 : 0), dis.x, fk);
        const y = lerp(lerp(A.y, B.y, k), dis.y, fk);
        const w = lerp(A.w, B.w, k) * (1 - fk * 0.6);
        const h = lerp(A.h, B.h, k) * (1 - fk * 0.6);
        const alpha = (done ? 0.35 : 1) * (fk > 0 ? 1 - fk * 0.3 : 1);
        if (fk >= 1) return;
        r.withAlpha(alpha, () => r.transform({ x: x + w / 2, y: y + h / 2, scale: cur ? 1.12 * pulse : 1 }, () => {
          gemCard(r, { x: -w / 2, y: -h / 2, w, h, color: step?.resolvedColor || c.color, gems: c.gems || [c.color], fired: Boolean(fire) });
          if (cur) r.rect({ x: -w / 2 - 3, y: -h / 2 - 3, w: w + 6, h: h + 6, radius: 7, stroke: T.gold, lineWidth: 2 });
        }));
        if (k < 1 || fk > 0) return;
        // 右边：倍率；当前这张再写一句是怎么接的
        const mult = fire?.multiplier ?? step?.multiplierAfter;
        if (mult != null) txt(r, `×${mult}`, B.x + B.w + (cur ? 18 : 8), B.cy, { size: cur ? F.m : F.xs, weight: 'bold', color: cur ? T.gold : T.text2, alpha });
        if (cur) {
          const rel = REL_WORD[fire.relation] || null;
          const kk = clamp((now - fire.t) / 0.6, 0, 1);
          if (rel && kk < 1) txt(r, rel[0], B.x + B.w + 18, B.cy + 16, { size: F.xs, weight: 'bold', color: rel[1], alpha: kk < 0.7 ? 1 : (1 - kk) / 0.3 });
        }
      });
    });
  }

  /** 顺序表上某一张的右边（合白、彩虹这些字冒在这里） */
  function castRowAnchor(snap, step) {
    const to = castListSlots(snap.chain.length);
    const s = to[clamp(step, 0, to.length - 1)];
    return s ? { x: s.x + s.w + 100, y: s.cy } : { x: 120, y: 240 };
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
    // 飞出去的宝石：从主角手上打出去（施法的是主角，牌只是顺序，D1）
    pb.shots.forEach((sh) => {
      const k = (now - sh.t) / (sh.land - sh.t);
      if (k < 0 || k > 1) return;
      const from = { x: R.hero.cx, y: R.hero.base - R.hero.size - 8 };
      const tg = slotOf(sh.uid);
      const to = { x: tg.x, y: tg.y - tg.s * 0.5 };
      const ctl = { x: (from.x + to.x) / 2 + (sh.step % 2 ? 70 : -70), y: (from.y + to.y) / 2 - 30 };
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
      // 白浪打在怪脚下；「合白」两个字跟着顺序表上当前那张
      const k = life(now, t0, 0.45);
      if (k < 0 || k > 1) return;
      mons.forEach((m, i) => { if (m.alive || m.deadAt >= t0) ellipse(r, ms[i].x, ms[i].y - 4, ms[i].s * (0.3 + k * 0.5), ms[i].s * (0.08 + k * 0.14), { stroke: '#ffffff', lineWidth: 4 * (1 - k), alpha: 1 - k }); });
      r.rect({ x: 0, y: 0, w: W, h: H, fill: '#ffffff', alpha: 0.1 * (1 - k) });
      if (k < 0.9) {
        const an = castRowAnchor(snap, pb.fired);
        bold(r, '合白', an.x, an.y - 2 - k * 8, { size: F.l, color: '#ffffff', outline: '#1d4a8a', align: 'center', alpha: 1 - k });
      }
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
        const an = castRowAnchor(snap, snap.chain.length - 1);
        r.transform({ x: an.x + 10, y: an.y - 30, scale: pop(k * 2) }, () => rainbowText(r, '彩虹 ×3', 0, 0, F.xl));
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
          else bold(r, f.text, 0, 0, { size: SIZE[f.kind] || 17, align: 'center', color: f.kind === 'normal' && f.color ? swatch(f.color) : (COLOR[f.kind] || '#fff'), outline: EDGE[f.kind] || '#07080c' });
        }));
      });
    }
    // 效果的小字（加成、怪的特性……）：主角头上冒
    const buffLabels = new Set((snap.player.buffs || []).map((b) => b.label));
    pb.texts.forEach((tx, i) => {
      const k = life(now, tx.t, 1.2);
      if (k < 0 || k > 1) return;
      if (buffLabels.has(tx.source)) return; // 加成的字在右上角它的图标下面冒
      bold(r, tx.text, R.hero.cx, R.hero.base - 84 - k * 16 - (i % 3) * 24, { size: F.s, color: '#c8fbff', align: 'center', alpha: k < 0.7 ? 1 : (1 - k) / 0.3 });
    });
    // 顶上：这一下打了多少，一路往上滚（照旧原型）
    if (now > pb.lead && pb.chainCount > 0 && !(pb.monAt > 0 && now >= pb.monAt)) {
      const a = clamp((playback.duration - now) / 0.3, 0, 1);
      r.withAlpha(a, () => {
        r.rect({ x: 400, y: 34, w: 160, h: 40, radius: 10, fill: '#3a2608', alpha: 0.88, stroke: '#8a6420', lineWidth: 1 });
        txt(r, '这一下', 480, 44, { size: F.xs, align: 'center', color: '#e8c27a' });
        bold(r, String(Math.round(rollTotal)), 480, 61, { size: F.l, color: '#ffd98a', align: 'center' });
      });
    }
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
