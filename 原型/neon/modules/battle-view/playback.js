// 把「打出」以后规则吐出来的一串事件排成时间线，一边播一边改画面上看到的怪（血、盾、倒计时、死没死）。
// 只读事件和打出前的快照，不算规则。纯函数 + 小状态，能在 node 里单测。
//
// 节奏：链里一张张亮起来 → 宝石飞到目标 → 这张牌的几发连着冒数（一发一个数，设计稿 5.3）
// → 合白一圈白浪 → 彩虹再打两遍 → 总数 → 怪的回合（倒计时、出手）。

import { BATTLE_EVENT_TYPES as E } from '../shared/index.js';

const FLIGHT = 0.28; // 宝石从链飞到怪
const SPREAD = 0.22; // 一张牌的几发在多长时间里冒完

/** 一张牌最多冒几个数：链越长越少，同屏不糊 */
function floaterBudget(steps) {
  if (steps <= 6) return 8;
  if (steps <= 10) return 5;
  return 4;
}

/** 从一堆包里挑 n 个显示：暴击的优先，其余均匀挑 */
function pickPackets(list, n) {
  if (list.length <= n) return list;
  const crits = list.filter((p) => p.isCrit).slice(0, Math.ceil(n / 3));
  const rest = list.filter((p) => !crits.includes(p));
  const need = n - crits.length;
  const picked = Array.from({ length: need }, (_, i) => rest[Math.floor((i * rest.length) / need)]);
  return [...crits, ...picked].sort((a, b) => a.idx - b.idx);
}

function cloneMonsters(snap) {
  return (snap?.monsters || []).map((m) => ({
    uid: m.uid,
    label: m.label,
    tier: m.tier,
    hp: m.hp,
    maxHp: m.maxHp,
    barIndex: m.barIndex,
    totalBars: m.totalBars,
    shields: (m.shields || []).map((s) => ({ ...s })),
    shieldBroken: m.shieldBroken,
    alive: m.alive,
    countdown: m.countdown,
    attackDamage: m.attackDamage,
    intentLabel: m.intentLabel,
    activeTraits: m.activeTraits || [],
    // 演出用的时间点
    flashAt: -10,
    deadAt: m.alive ? null : -10,
    brokeAt: -10,
    cdPlusAt: -10,
    cdTickAt: -10,
    barSwitchAt: -10,
    hpLagFrom: m.hp,
    hpLagAt: -10,
  }));
}

/**
 * @param {object[]} events 规则吐出来的事件（一次打出的全部）
 * @param {object} prevSnap 打出前的快照（链里那几张、怪打之前的样子）
 * @param {object} nextSnap 打出后的快照（下一回合开始）
 * @param {object} [opts] { allyLabels: string[] }
 */
export function buildPlayback(events, prevSnap, nextSnap, opts = {}) {
  const allyLabels = new Set(opts.allyLabels || []);
  const ops = []; // { t, kind, ... } 按时间排
  const steps = events.filter((e) => e.type === E.CHAIN_STEP);
  const n = steps.length;
  const iv = n <= 6 ? 0.18 : Math.max(0.09, 1.6 / n);
  const budget = floaterBudget(n);

  // 先按「属于哪一张牌 / 哪一段」把事件分组
  let stepIdx = -1;
  let phase = 'pre'; // pre | chain | white | rainbow | post | monster
  const groups = []; // { key, phase, step, events: [] }
  let cur = null;
  const open = (ph, st) => { cur = { phase: ph, step: st, events: [] }; groups.push(cur); };
  open('pre', -1);
  events.forEach((e, idx) => {
    const ev = { ...e, idx };
    if (e.type === E.CHAIN_STEP) { stepIdx++; phase = 'chain'; open('chain', stepIdx); cur.events.push(ev); return; }
    if (e.type === E.COMPLEMENT_WHITE) { open('white', stepIdx); cur.events.push(ev); return; }
    if (e.type === E.RAINBOW_TRIGGER) { phase = 'rainbow'; open('rainbow', stepIdx); cur.events.push(ev); return; }
    if (e.type === E.CHAIN_SUMMARY) { phase = 'post'; open('post', stepIdx); cur.events.push(ev); return; }
    if (e.type === E.HEARTS_CHANGED || e.type === E.MONSTER_ATTACK || e.type === E.BLOCK_CHANGED) {
      if (phase !== 'monster') { phase = 'monster'; open('monster', stepIdx); }
      cur.events.push(ev);
      return;
    }
    // 白色那一轮后面接着的包，如果不是白色的，就回到这张牌那一段
    if (cur.phase === 'white' && e.type === E.DAMAGE_PACKET && !e.payload.isWhite) { open('chain', stepIdx); }
    cur.events.push(ev);
  });

  let lastHitT = 0;
  let t = 0;
  const pushOps = (list, t0, span, kindOf) => {
    const packets = list.filter((e) => e.type === E.DAMAGE_PACKET);
    const shownSet = new Set(pickPackets(packets, kindOf === 'rainbow' ? budget * 3 : budget).map((p) => p.idx));
    const np = Math.max(1, packets.length);
    let pi = 0;
    let at = t0;
    for (const e of list) {
      if (e.type === E.DAMAGE_PACKET) {
        at = t0 + (pi / np) * span;
        pi++;
        const p = e.payload;
        const isAlly = allyLabels.has(p.sourceLabel);
        const kind = isAlly ? 'ally' : p.isCrit ? 'crit' : p.isRainbow ? 'rainbow' : p.isWhite ? 'white' : 'normal';
        ops.push({ t: at, kind: 'damage', uid: p.targetUid, damage: p.damage, show: shownSet.has(e.idx) || isAlly, text: String(p.perHitDamage), fk: kind, color: p.color });
        lastHitT = Math.max(lastHitT, at);
      } else {
        ops.push({ t: at, kind: 'event', ev: e });
      }
    }
    return at;
  };

  for (const g of groups) {
    if (g.phase === 'pre') { pushOps(g.events, 0, 0.1, 'normal'); continue; }
    if (g.phase === 'chain') {
      const fireT = Math.max(0, g.step) * iv;
      const hitT = fireT + FLIGHT;
      const head = g.events[0]?.type === E.CHAIN_STEP ? g.events[0] : null;
      if (head) {
        ops.push({ t: fireT, kind: 'fire', step: g.step, color: head.payload.color, multiplier: head.payload.multiplier });
        const target = g.events.find((e) => e.type === E.DAMAGE_PACKET)?.payload.targetUid;
        ops.push({ t: fireT, kind: 'shot', step: g.step, color: head.payload.color, uid: target, land: hitT });
      }
      const end = pushOps(g.events.filter((e) => e !== head), hitT, SPREAD, 'normal');
      t = Math.max(t, end, hitT);
      continue;
    }
    if (g.phase === 'white') {
      const startT = Math.max(0, g.step) * iv + FLIGHT + 0.1;
      ops.push({ t: startT, kind: 'white' });
      t = Math.max(t, pushOps(g.events.slice(1), startT, 0.2, 'white'));
      continue;
    }
    if (g.phase === 'rainbow') {
      const startT = Math.max(t, lastHitT) + 0.35;
      ops.push({ t: startT, kind: 'rainbow' });
      t = Math.max(t, pushOps(g.events.slice(1), startT + 0.25, 0.7, 'rainbow'));
      continue;
    }
    if (g.phase === 'post') {
      const totalT = Math.max(t, lastHitT) + 0.4;
      const sum = g.events.find((e) => e.type === E.CHAIN_SUMMARY);
      ops.push({ t: totalT, kind: 'total', summary: sum?.payload || null });
      g.events.filter((e) => e !== sum).forEach((e) => ops.push({ t: totalT, kind: 'event', ev: e }));
      t = totalT;
      continue;
    }
    if (g.phase === 'monster') {
      const monT = Math.max(t, lastHitT) + (steps.length ? 1.3 : 0.2);
      ops.push({ t: monT, kind: 'monsterTurn' });
      let k = 0;
      let heartsEv = null;
      for (const e of g.events) {
        if (e.type === E.HEARTS_CHANGED || e.type === E.BLOCK_CHANGED) { heartsEv = e; continue; }
        if (e.type === E.MONSTER_ATTACK) {
          const at = monT + 0.35 + k * 0.75;
          ops.push({ t: at, kind: 'attack', uid: e.payload.monsterUid, blocked: e.payload.blocked, heartsLost: e.payload.heartsLost, hearts: heartsEv?.type === E.HEARTS_CHANGED ? heartsEv.payload.after : null });
          heartsEv = null;
          k++;
        } else {
          ops.push({ t: monT + 0.35 + k * 0.75, kind: 'event', ev: e });
        }
      }
      t = monT + 0.35 + k * 0.75 + 0.3;
      continue;
    }
  }
  if (!groups.some((g) => g.phase === 'monster') && steps.length) {
    ops.push({ t: Math.max(t, lastHitT) + 1.3, kind: 'monsterTurn' });
    t = Math.max(t, lastHitT) + 1.6;
  }
  ops.sort((a, b) => a.t - b.t);
  const duration = Math.max(t, lastHitT) + 0.7;

  // ── 播放状态 ──
  const nextCd = new Map((nextSnap?.monsters || []).map((m) => [m.uid, m.countdown]));
  const state = {
    now: 0,
    monsters: cloneMonsters(prevSnap),
    hearts: prevSnap?.player?.hearts ?? 0,
    fired: -1,
    shots: [],
    floaters: [],
    whites: [],
    rainbowAt: -10,
    breaks: [],
    allyActs: [],
    texts: [],
    attacks: [],
    totalAt: -10,
    summary: null,
    total: 0,
    monAt: -10,
    chainCount: n,
    interval: iv,
  };
  let cursor = 0;
  const byUid = (uid) => state.monsters.find((m) => m.uid === uid);

  function apply(op) {
    switch (op.kind) {
      case 'fire': state.fired = op.step; break;
      case 'shot': state.shots.push(op); break;
      case 'damage': {
        const m = byUid(op.uid);
        state.total += op.damage;
        if (m) {
          if (op.t - m.hpLagAt > 0.5) m.hpLagFrom = m.hp;
          m.hpLagAt = op.t;
          m.hp = Math.max(0, m.hp - op.damage);
          m.flashAt = op.t;
        }
        if (op.show) state.floaters.push({ t: op.t, uid: op.uid, text: op.text, kind: op.fk, n: state.floaters.length });
        break;
      }
      case 'white': state.whites.push(op.t); break;
      case 'rainbow': state.rainbowAt = op.t; break;
      case 'total': state.totalAt = op.t; state.summary = op.summary; break;
      case 'monsterTurn':
        state.monAt = op.t;
        state.monsters.forEach((m) => {
          if (!m.alive) return;
          if (nextCd.has(m.uid)) m.countdown = nextCd.get(m.uid);
          m.cdTickAt = op.t;
        });
        break;
      case 'attack':
        state.attacks.push(op);
        if (op.hearts != null) state.hearts = op.hearts;
        break;
      case 'event': applyEvent(op.ev, op.t); break;
      default: break;
    }
  }

  function applyEvent(e, at) {
    const p = e.payload || {};
    switch (e.type) {
      case E.SHIELD_SHRED: {
        const m = byUid(p.targetUid);
        const sh = m?.shields.find((s) => s.color === p.color);
        if (sh) sh.current = p.remaining;
        break;
      }
      case E.SHIELD_BREAK: {
        const m = byUid(p.targetUid);
        if (m) {
          m.shieldBroken = true;
          m.brokeAt = at;
          if (p.countdownAfter != null) { m.countdown = p.countdownAfter; m.cdPlusAt = at; m.cdPlus = p.countdownDelta; }
        }
        state.breaks.push({ t: at, uid: p.targetUid });
        break;
      }
      case E.BAR_SWITCHED: {
        const m = byUid(p.targetUid);
        if (m) {
          m.barIndex = p.barIndex;
          m.maxHp = p.maxHp;
          m.hp = p.maxHp;
          m.hpLagFrom = p.maxHp;
          m.shields = (p.shields || []).map((s) => ({ ...s }));
          m.shieldBroken = false;
          m.barSwitchAt = at;
          const nm = (nextSnap?.monsters || []).find((x) => x.uid === m.uid);
          if (nm && nm.barIndex === p.barIndex) m.activeTraits = nm.activeTraits || [];
        }
        break;
      }
      case E.MONSTER_DEFEATED: {
        const m = byUid(p.targetUid);
        if (m) { m.alive = false; m.deadAt = at; }
        break;
      }
      case E.ALLY_ACTION:
        state.allyActs.push({ t: at, allyId: p.allyId, label: p.label });
        break;
      case E.EFFECT_TRIGGERED:
        if (p.label) state.texts.push({ t: at, text: p.label, source: p.source });
        break;
      case E.INSTANT_CARD_USED:
        state.texts.push({ t: at, text: p.label, source: 'card' });
        break;
      default: break;
    }
  }

  return {
    duration,
    ops,
    state,
    /** 往前播到 t 秒（只会往前） */
    advance(tNow) {
      state.now = tNow;
      while (cursor < ops.length && ops[cursor].t <= tNow) apply(ops[cursor++]);
      return state;
    },
    get done() { return state.now >= duration; },
  };
}
