// 一片空地的画面和操作（设计稿 7.1、7.4）。只看 run-rules 的 getState()，自己不算规则；
// 玩家做了什么，就调 callbacks 交给 app/，app/ 再交给 run-rules。
//
// 操作：点地走（主），WASD 也行；碰到鬼火开打；走到藏着的东西 / 采集点 / 任务物品跟前就拿；
// 打完出口亮起来，走进出口去下一片。等着挑的东西（奖励三选一、强化、事件、歇脚）弹一块板。
// 样子全走 render.drawActor(look)，以后换成堆叠美术不改这里。

import { SCREEN } from '../shared/index.js';
import { F, LANE, T, bold, buffIcon, ellipse, fnCard, gemCard, hearts, inRect, smallButton, swatch, txt, wrapText } from '../ui/index.js';

const { w: W, h: H } = SCREEN;
const FIELD = { cx: 480, cy: 318, rx: 410, ry: 188 };
const SPEED = 240;
const TOUCH = 34;
// 藏着的东西、任务物品放的位子：都在场地里头走得到的地方，离上边的出口牌子远远的（用户试玩：放在最上边碰不到，还跟出口叠在一起）
const CORNERS = [
  { x: 170, y: 300 }, { x: 790, y: 300 }, { x: 205, y: 420 }, { x: 755, y: 420 }, { x: 250, y: 228 }, { x: 710, y: 228 },
];
const KIND_COLOR = { normal: '#9fb6d8', elite: '#ff6b6b', rest: '#86d6a6', event: '#d6b3ff', gatekeeper: '#ff9f43', return: '#ffd79a' };
const REWARD_GLYPH = { function_card: '牌', buff: '加', enhance: '强', remove: '删', stat: '属', draw_plus: '+1', heal: '心', gold: '金' };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/** 种子 → 0~1 的固定小随机（同一片每次画出来一样） */
function hashUnit(str, salt = 0) {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}

function insideField(p, margin = 0) {
  const dx = (p.x - FIELD.cx) / (FIELD.rx - margin);
  const dy = (p.y - FIELD.cy) / (FIELD.ry - margin);
  return dx * dx + dy * dy <= 1;
}

function clampToField(p, margin = 16) {
  if (insideField(p, margin)) return p;
  const ang = Math.atan2((p.y - FIELD.cy) / (FIELD.ry - margin), (p.x - FIELD.cx) / (FIELD.rx - margin));
  return { x: FIELD.cx + Math.cos(ang) * (FIELD.rx - margin), y: FIELD.cy + Math.sin(ang) * (FIELD.ry - margin) };
}

/**
 * @param {object} options
 * @param {object} options.catalog { cards: {defId: {label, description, color, gems, usage, kind, drawAfterPlay}}, buffs: {id: {label, description, lane}}, allies: {id: {role, roleTag, label}} }
 * @param {object} options.callbacks onFight() / onExit(id) / onTakeHidden() / onGather(id) / onFindItem() / onChoose(choice) / onMenu()
 */
export function createExploreView(options = {}) {
  const catalog = options.catalog || { cards: {}, buffs: {}, allies: {} };
  const callbacks = options.callbacks || {};

  let state = null;
  let clearingId = null;
  let layout = null; // 这一片里东西放在哪（画面自己定）
  const hero = { x: 480, y: 480, t: 0, moving: false, facing: 0 };
  let trail = [];
  let target = null; // { x, y, then? }
  const keys = new Set();
  let clock = 0;
  let exitsLitAt = -1;
  let fightAt = -1; // 碰到鬼火：闪一下再开打
  let fightSent = false; // 已经叫开打了，等 app 换场景（setState 来了新状态才再认）
  let floaters = [];
  let pointer = { x: -1, y: -1 };
  let hover = null;
  let deckOpen = false;
  let lastPendingKey = '';
  let toasts = []; // 提示不弹板，在头上冒一行字
  let autoDismiss = false;
  let pendingAt = 0;
  let enterAt = 0;

  // ───────── 状态 ─────────

  function setState(next) {
    const prev = state;
    state = next;
    fightSent = false;
    const c = state?.clearing;
    if (!c) return;
    if (c.id !== clearingId) {
      clearingId = c.id;
      layout = buildLayout(c);
      hero.x = 480; hero.y = 500; target = { x: 480, y: 440 };
      trail = [];
      exitsLitAt = c.exits ? clock : -1;
      fightAt = -1;
      enterAt = clock;
    } else if (c.exits && prev?.clearing && !prev.clearing.exits) {
      exitsLitAt = clock; // 出口亮起来
    }
    // 金币、任务进度涨了，头上冒字
    if (prev && prev.clearing?.id === c.id) {
      const g0 = prev.gold.safe + prev.gold.risky;
      const g1 = state.gold.safe + state.gold.risky;
      if (g1 > g0) floaters.push({ t: clock, x: hero.x, y: hero.y - 60, text: `+${g1 - g0} 金币`, color: T.gold });
      prev.quests.forEach((q0) => {
        const q1 = state.quests.find((q) => q.id === q0.id);
        if (q1 && q1.have > q0.have) floaters.push({ t: clock, x: hero.x, y: hero.y - 80, text: `任务 ${q1.have}/${q1.count}`, color: T.connect });
      });
    }
    if (state.pending?.type === 'notice') {
      toasts.push({ t: clock, text: state.pending.text, icon: state.pending.icon });
      autoDismiss = true;
    }
    const pk = state.pending ? JSON.stringify([state.pending.type, state.pending.step, state.pending.options?.length, state.pending.text]) : '';
    if (pk !== lastPendingKey) { lastPendingKey = pk; pendingAt = clock; }
  }

  function buildLayout(c) {
    const seed = c.id + c.seed;
    const n = Math.max(1, c.monsters.length);
    const baseX = 480 + (hashUnit(seed, 1) - 0.5) * 220;
    const baseY = 250 + (hashUnit(seed, 2) - 0.5) * 50;
    const wisps = c.monsters.map((m, i) => ({
      x: baseX + (i - (n - 1) / 2) * 58,
      y: baseY + (i % 2) * 22,
      look: m.look,
      tier: m.tier,
    }));
    const corners = CORNERS.slice().sort((a, b) => hashUnit(seed + a.x + a.y, 3) - hashUnit(seed + b.x + b.y, 3));
    const hidden = c.hidden ? clampToField({ ...corners[0] }, 44) : null;
    const find = c.findQuestId ? clampToField({ ...corners[1] }, 44) : null;
    const gathers = c.gathers.map((g, i) => {
      const ang = hashUnit(seed + g.id, 4) * Math.PI * 2;
      const p = clampToField({ x: 480 + Math.cos(ang) * (180 + i * 60), y: 320 + Math.sin(ang) * 120 }, 40);
      return { id: g.id, x: p.x, y: p.y };
    });
    // 石头、树墩：只是看的，挡着藏着的东西一点
    const props = [];
    for (let i = 0; i < 9; i++) {
      const ang = hashUnit(seed, 10 + i) * Math.PI * 2;
      const rr = 0.55 + hashUnit(seed, 30 + i) * 0.4;
      props.push({ x: FIELD.cx + Math.cos(ang) * FIELD.rx * rr, y: FIELD.cy + Math.sin(ang) * FIELD.ry * rr, s: 10 + hashUnit(seed, 50 + i) * 14, kind: i % 3 });
    }
    if (hidden) props.push({ x: hidden.x + 18, y: hidden.y + 8, s: 22, kind: 0 }); // 大石头后面
    return { wisps, hidden, find, gathers, props };
  }

  function exitBoxes() {
    const exits = state?.clearing?.exits || [];
    const n = exits.length;
    return exits.map((e, i) => {
      const cx = 480 + (i - (n - 1) / 2) * 230;
      return { exit: e, cx, cy: 122, x: cx - 86, y: 70, w: 172, h: 86 };
    });
  }

  function deckButton() { return { x: 960 - 120, y: 5, w: 70, h: 22 }; }
  function menuButton() { return { x: 960 - 40, y: 5, w: 28, h: 22 }; }

  // ───────── 等着挑的板 ─────────

  function pendingLayout() {
    const p = state?.pending;
    if (!p) return null;
    const box = { x: 150, y: 96, w: 660, h: 360 };
    const items = [];
    const buttons = [];
    if (p.type === 'pick_card' || p.type === 'pick_buff') {
      p.options.forEach((id, i) => {
        const w = 180;
        const x = 480 + (i - (p.options.length - 1) / 2) * 206 - w / 2;
        items.push({ id, x, y: 170, w, h: 210 });
      });
      buttons.push({ id: 'skip', label: '都不要', x: 430, y: 400, w: 100, h: 32 });
    } else if (p.type === 'enhance' && p.step === 'dir') {
      p.dirs.forEach((d, i) => items.push({ id: d, x: 220, y: 180 + i * 62, w: 520, h: 50 }));
      buttons.push({ id: 'skip', label: '算了', x: 430, y: 400, w: 100, h: 32 });
    } else if (p.type === 'enhance' || p.type === 'remove') {
      const cards = p.options.map((uid) => state.player.deck.find((c) => c.uid === uid)).filter(Boolean);
      const cols = 12;
      const cw = 42;
      const ch = 56;
      cards.forEach((c, i) => items.push({ id: c.uid, card: c, x: 480 - (cols * (cw + 8) - 8) / 2 + (i % cols) * (cw + 8), y: 160 + Math.floor(i / cols) * (ch + 10), w: cw, h: ch }));
      buttons.push({ id: 'skip', label: '算了', x: 430, y: 410, w: 100, h: 32 });
    } else if (p.type === 'event' || p.type === 'rest') {
      p.options.forEach((o, i) => items.push({ id: o.id, option: o, x: 240, y: 200 + i * 58, w: 480, h: 46 }));
    } else if (p.type === 'notice') {
      box.y = 190; box.h = 160;
      buttons.push({ id: 'ok', label: '好', x: 430, y: 296, w: 100, h: 34 });
    }
    return { box, items, buttons };
  }

  function choosePending(id) {
    const p = state.pending;
    if (id === 'skip' || id === 'ok') { callbacks.onChoose?.(null); return; }
    callbacks.onChoose?.(id);
    if (p.type === 'notice') return;
  }

  // ───────── 每帧 ─────────

  function blocked() {
    return !state || state.ended || state.pending || fightAt >= 0 || fightSent || deckOpen;
  }

  function update(dt) {
    clock += dt;
    floaters = floaters.filter((f) => clock - f.t < 1.4);
    toasts = toasts.filter((f) => clock - f.t < 2.6);
    if (autoDismiss) { autoDismiss = false; callbacks.onChoose?.(null); return; }
    if (!state?.clearing || !layout) return;

    if (fightAt >= 0 && clock - fightAt > 0.45) {
      fightAt = -1;
      fightSent = true;
      callbacks.onFight?.();
      return;
    }
    if (blocked()) { hero.moving = false; return; }

    // 走
    let vx = 0;
    let vy = 0;
    if (keys.has('w') || keys.has('arrowup')) vy -= 1;
    if (keys.has('s') || keys.has('arrowdown')) vy += 1;
    if (keys.has('a') || keys.has('arrowleft')) vx -= 1;
    if (keys.has('d') || keys.has('arrowright')) vx += 1;
    if (vx || vy) target = null;
    else if (target) {
      const dx = target.x - hero.x;
      const dy = target.y - hero.y;
      const d = Math.hypot(dx, dy);
      if (d < 4) target = null;
      else { vx = dx / d; vy = dy / d; }
    }
    const len = Math.hypot(vx, vy);
    hero.moving = len > 0;
    if (len > 0) {
      const step = Math.min(SPEED * dt, target ? Math.hypot(target.x - hero.x, target.y - hero.y) : SPEED * dt);
      const nx = hero.x + (vx / len) * step;
      const ny = hero.y + (vy / len) * step;
      // 出口在场地上边，允许走出椭圆往出口去；别的地方挡住
      const toExit = ny < FIELD.cy - FIELD.ry + 40 && state.clearing.exits;
      const p = toExit ? { x: clamp(nx, 60, 900), y: Math.max(100, ny) } : clampToField({ x: nx, y: ny });
      hero.x = p.x; hero.y = p.y;
      hero.t += dt;
      if (Math.abs(vx) > 0.2) hero.facing = vx > 0 ? 1 : -1;
      trail.push({ x: hero.x, y: hero.y });
      if (trail.length > 60) trail.shift();
    }

    checkTouches();
  }

  function checkTouches() {
    const c = state.clearing;
    // 鬼火
    if (c.needsFight && layout.wisps.some((w) => dist(w, hero) < TOUCH + 10)) {
      fightAt = clock;
      target = null;
      return;
    }
    // 藏着的东西 / 小事件
    if (layout.hidden && c.hidden && !c.hidden.taken && dist(layout.hidden, hero) < TOUCH) {
      target = null;
      callbacks.onTakeHidden?.();
      return;
    }
    // 采集
    for (const g of layout.gathers) {
      const rg = c.gathers.find((x) => x.id === g.id);
      if (rg && !rg.taken && dist(g, hero) < TOUCH) { callbacks.onGather?.(g.id); return; }
    }
    // 任务物品
    if (layout.find && c.findQuestId && dist(layout.find, hero) < TOUCH) { callbacks.onFindItem?.(); return; }
    // 出口
    if (c.exits) {
      const ex = exitBoxes().find((b) => Math.abs(hero.x - b.cx) < 60 && hero.y < b.cy + 16);
      if (ex) { target = null; callbacks.onExit?.(ex.exit.id); }
    }
  }

  // ───────── 操作 ─────────

  function onPointer(ev) {
    const { type, x, y } = ev;
    pointer = { x, y };
    if (type === 'leave') { hover = null; return { cursor: 'default' }; }
    if (!state) return { cursor: 'default' };

    // 牌组 / 菜单
    if (inRect(deckButton(), x, y)) {
      if (type === 'up') deckOpen = !deckOpen;
      return { cursor: 'pointer' };
    }
    if (inRect(menuButton(), x, y)) {
      if (type === 'up') callbacks.onMenu?.();
      return { cursor: 'pointer' };
    }
    if (deckOpen) {
      if (type === 'up') deckOpen = false;
      return { cursor: 'pointer' };
    }

    const pl = pendingLayout();
    if (pl) {
      if (clock - pendingAt < 0.25) return { cursor: 'default' }; // 板刚弹出来，别手快点穿
      const it = pl.items.find((b) => inRect(b, x, y) && !b.option?.disabled);
      const bt = pl.buttons.find((b) => inRect(b, x, y));
      hover = it?.id || bt?.id || null;
      if (type === 'up') {
        if (it) choosePending(it.id);
        else if (bt) choosePending(bt.id);
      }
      return { cursor: it || bt ? 'pointer' : 'default' };
    }
    if (state.ended || fightAt >= 0) return { cursor: 'default' };

    // 出口牌子：鼠标放上去看全文
    const ex = state.clearing.exits ? exitBoxes().find((b) => inRect(b, x, y)) : null;
    hover = ex ? `exit:${ex.exit.id}` : null;
    if (type === 'down') {
      if (ex) target = { x: ex.cx, y: ex.cy };
      else target = clampToField({ x, y }, 12);
    }
    return { cursor: ex ? 'pointer' : 'default' };
  }

  function onKey(key, down = true) {
    const k = String(key).toLowerCase();
    if (down) keys.add(k);
    else keys.delete(k);
    if (down && k === 'tab') deckOpen = !deckOpen;
  }

  // ───────── 画 ─────────

  function render(r) {
    drawGround(r);
    if (!state?.clearing || !layout) return;
    const c = state.clearing;
    drawExits(r, c);
    drawProps(r);
    drawPickups(r, c);
    drawWisps(r, c);
    drawParty(r);
    drawFloaters(r);
    drawStatus(r);
    drawQuests(r);
    if (fightAt >= 0) {
      const k = clamp((clock - fightAt) / 0.45, 0, 1);
      r.rect({ x: 0, y: 0, w: W, h: H, fill: '#ffffff', alpha: k * 0.85 });
    }
    if (clock - enterAt < 0.35) r.rect({ x: 0, y: 0, w: W, h: H, fill: '#000000', alpha: 1 - (clock - enterAt) / 0.35 });
    if (state.pending && state.pending.type !== 'notice') drawPending(r);
    drawToasts(r);
    if (deckOpen) drawDeck(r);
  }

  function drawGround(r) {
    r.clear('#101710');
    r.rect({ x: 0, y: 0, w: W, h: H, fill: '#142014' });
    ellipse(r, FIELD.cx, FIELD.cy + 6, FIELD.rx + 30, FIELD.ry + 26, { fill: '#18261a' });
    ellipse(r, FIELD.cx, FIELD.cy, FIELD.rx, FIELD.ry, { fill: '#223322' });
    ellipse(r, FIELD.cx, FIELD.cy + 20, FIELD.rx * 0.7, FIELD.ry * 0.62, { fill: '#26392a' });
    // 南边进来的路
    r.polygon({ points: [{ x: 440, y: 540 }, { x: 520, y: 540 }, { x: 505, y: 470 }, { x: 455, y: 470 }], fill: '#2c3d2a' });
    for (let i = 0; i < 60; i++) {
      const x = 80 + ((i * 151) % 800);
      const y = 120 + ((i * 97) % 360);
      if (!insideField({ x, y }, 10)) continue;
      r.rect({ x, y, w: 3, h: 6, fill: i % 3 ? '#2f4530' : '#36502f' });
    }
    // 四周的树
    for (let i = 0; i < 26; i++) {
      const ang = (i / 26) * Math.PI * 2;
      const x = FIELD.cx + Math.cos(ang) * (FIELD.rx + 70);
      const y = FIELD.cy + Math.sin(ang) * (FIELD.ry + 70);
      if (y < 110 && Math.abs(x - 480) < 380) continue; // 上边留给出口
      r.circle({ x, y, r: 62, fill: '#0f1d10' });
      r.circle({ x: x - 14, y: y - 12, r: 38, fill: '#15281a' });
    }
  }

  function drawProps(r) {
    layout.props.forEach((p) => {
      if (p.kind === 0) { // 石头
        ellipse(r, p.x, p.y + p.s * 0.3, p.s, p.s * 0.35, { fill: '#000000', alpha: 0.25 });
        ellipse(r, p.x, p.y, p.s, p.s * 0.7, { fill: '#4a5048' });
        ellipse(r, p.x - p.s * 0.2, p.y - p.s * 0.2, p.s * 0.55, p.s * 0.35, { fill: '#5d6559' });
      } else if (p.kind === 1) { // 树墩
        ellipse(r, p.x, p.y + 4, p.s * 0.7, p.s * 0.3, { fill: '#000000', alpha: 0.25 });
        r.rect({ x: p.x - p.s * 0.5, y: p.y - p.s * 0.6, w: p.s, h: p.s * 0.6, radius: 3, fill: '#5a4530' });
        ellipse(r, p.x, p.y - p.s * 0.6, p.s * 0.5, p.s * 0.2, { fill: '#8a6c48' });
      } else { // 草丛
        for (let k = 0; k < 4; k++) r.rect({ x: p.x - 8 + k * 5, y: p.y - 8 - (k % 2) * 4, w: 3, h: 10 + (k % 2) * 4, fill: '#3e6038' });
      }
    });
  }

  function drawExits(r, c) {
    const lit = Boolean(c.exits);
    if (!lit) {
      // 打完才开：上边一道暗暗的树墙
      r.rect({ x: 120, y: 84, w: 720, h: 46, radius: 20, fill: '#0f1d10', alpha: 0.9 });
      txt(r, c.needsFight ? '打完这一片才开出口' : '', 480, 107, { size: F.xs, align: 'center', color: T.text3 });
      return;
    }
    const k = clamp((clock - exitsLitAt) / 0.6, 0, 1);
    exitBoxes().forEach((b, i) => {
      const e = b.exit;
      const a = clamp(k * 1.6 - i * 0.25, 0, 1);
      const col = e.kind === 'return' ? KIND_COLOR.return : e.elite ? KIND_COLOR.elite : KIND_COLOR[e.kind] || KIND_COLOR.normal;
      const hov = hover === `exit:${e.id}` || (Math.abs(hero.x - b.cx) < 70 && hero.y < 160);
      // 门口的地面亮一圈
      ellipse(r, b.cx, b.cy + 20, 60, 16, { fill: col, alpha: (0.16 + 0.06 * Math.sin(clock * 3 + i)) * a });
      // 门柱
      r.rect({ x: b.cx - 52, y: b.cy - 40, w: 10, h: 62, radius: 3, fill: '#4a3a28', alpha: a });
      r.rect({ x: b.cx + 42, y: b.cy - 40, w: 10, h: 62, radius: 3, fill: '#4a3a28', alpha: a });
      // 牌子
      const py = b.cy - 46 - (hov ? 4 : 0);
      r.rect({ x: b.cx - 78, y: py, w: 156, h: 44, radius: 8, fill: '#0c0f16', stroke: col, lineWidth: e.elite ? 3 : hov ? 2 : 1.5, alpha: a });
      const glyph = e.kind === 'return' ? '回' : e.kind === 'rest' ? '歇' : e.kind === 'event' ? '？' : e.kind === 'gatekeeper' ? '门' : REWARD_GLYPH[e.reward?.kind] || '?';
      r.rect({ x: b.cx - 72, y: py + 6, w: 32, h: 32, radius: 6, fill: col, alpha: 0.9 * a });
      txt(r, glyph, b.cx - 56, py + 22, { size: glyph.length > 1 ? F.s : F.l, weight: 'bold', align: 'center', color: '#0c0f16', alpha: a });
      const title = e.kind === 'return' ? '回去' : e.kind === 'gatekeeper' ? '看门的' : e.label;
      txt(r, title, b.cx - 34, py + 15, { size: F.s, weight: 'bold', alpha: a });
      const sub = e.kind === 'return' ? '带着东西回大厅'
        : e.kind === 'rest' ? '没有怪' : e.kind === 'event' ? '一件事'
          : `${e.elite ? '精英 · ' : ''}${e.isPack ? '一群' : '一只'}${e.deeper ? ' · 往里一层' : ''}`;
      txt(r, sub, b.cx - 34, py + 32, { size: F.xs, color: T.text2, alpha: a });
      if (e.questMark) {
        r.rect({ x: b.cx + 56, y: py - 8, w: 22, h: 18, radius: 4, fill: T.connect, alpha: a });
        txt(r, '任', b.cx + 67, py + 1, { size: F.xs, weight: 'bold', align: 'center', color: '#0c0f16', alpha: a });
      }
      if (e.reward?.kind === 'stat') txt(r, `给${({ attack: '攻击', damageBonus: '增伤', critRate: '暴击率', critDamage: '暴伤' })[e.reward.stat]}`, b.cx + 70, py + 32, { size: F.xs, align: 'right', color: col, alpha: a });
    });
  }

  /** 走近了，东西下面写一行「怎么拿」（用户试玩：不知道紫色那个怎么拿） */
  function pickupHint(r, p, text) {
    const w = text.length * 12 + 16;
    r.rect({ x: p.x - w / 2, y: p.y + 8, w, h: 18, radius: 9, fill: '#0b0d12', alpha: 0.75 });
    txt(r, text, p.x, p.y + 17, { size: F.xs, align: 'center', color: '#efe2c4' });
  }

  function drawPickups(r, c) {
    const near = (p, d) => dist(p, hero) < d;
    const reveal = state.player.exploreSkills?.includes('reveal_hidden');
    // 藏着的东西：远远只看得见一闪一闪的小点，走近才知道是什么
    if (layout.hidden && c.hidden && !c.hidden.taken) {
      const p = layout.hidden;
      const tw = 0.5 + 0.5 * Math.sin(clock * 5 + p.x);
      if (near(p, 110) || reveal) {
        if (c.hidden.kind === 'stash') {
          r.rect({ x: p.x - 12, y: p.y - 14, w: 24, h: 16, radius: 3, fill: '#7a5a2a', stroke: T.gold, lineWidth: 1.5 });
          r.rect({ x: p.x - 12, y: p.y - 18, w: 24, h: 6, radius: 2, fill: '#9a7434' });
        } else {
          r.circle({ x: p.x, y: p.y - 10, r: 12, fill: '#2a2040', stroke: '#d6b3ff', lineWidth: 1.5 });
          txt(r, '？', p.x, p.y - 10, { size: F.s, weight: 'bold', align: 'center', color: '#d6b3ff' });
        }
        if (reveal && !near(p, 110)) txt(r, '队友标的', p.x, p.y - 34, { size: F.xs, align: 'center', color: '#9a78c2' });
        else pickupHint(r, p, c.hidden.kind === 'stash' ? '走过去就能翻开' : '有点事 · 走过去看看');
      }
      r.circle({ x: p.x + 6, y: p.y - 22, r: 2 + tw * 2, fill: '#fff6c8', alpha: 0.35 + tw * 0.5 });
    }
    // 采集点：地上一株，带任务记号的颜色
    layout.gathers.forEach((g) => {
      const rg = c.gathers.find((x) => x.id === g.id);
      if (!rg || rg.taken) return;
      const sw = Math.sin(clock * 2 + g.x) * 2;
      ellipse(r, g.x, g.y + 2, 10, 3, { fill: '#000000', alpha: 0.3 });
      for (let k = 0; k < 3; k++) r.rect({ x: g.x - 5 + k * 4 + sw * (k - 1) * 0.3, y: g.y - 14 + (k % 2) * 3, w: 3, h: 14, fill: '#6fcf7a' });
      r.circle({ x: g.x + sw * 0.4, y: g.y - 16, r: 4, fill: T.connect });
      if (near(g, 80)) pickupHint(r, g, '任务要采的 · 走过去采');
    });
    // 任务物品：角落里，走近或者队友标了才看得见
    if (layout.find && c.findQuestId) {
      const p = layout.find;
      if (near(p, 80) || reveal) {
        r.rect({ x: p.x - 9, y: p.y - 16, w: 18, h: 18, radius: 4, fill: T.connect, stroke: '#ffffff', lineWidth: 1 });
        txt(r, '任', p.x, p.y - 7, { size: F.xs, weight: 'bold', align: 'center', color: '#0c0f16' });
        if (near(p, 80)) pickupHint(r, p, '任务要的 · 走过去捡');
      } else {
        const tw = 0.5 + 0.5 * Math.sin(clock * 4 + 1.7);
        r.circle({ x: p.x, y: p.y - 10, r: 1.5 + tw * 1.5, fill: T.connect, alpha: 0.3 + tw * 0.4 });
      }
    }
  }

  function drawWisps(r, c) {
    if (!c.needsFight) return;
    layout.wisps.forEach((w, i) => {
      const bob = Math.sin(clock * 1.6 + i * 1.3) * 5;
      const d = dist(w, hero);
      const col = w.tier === 'elite' ? '#ff8a6b' : w.tier === 'gatekeeper' ? '#ffb347' : '#8fd6ff';
      ellipse(r, w.x, w.y + 18, 26, 8, { fill: col, alpha: 0.18 });
      for (let k = 3; k >= 1; k--) r.circle({ x: w.x, y: w.y - 20 + bob, r: 10 + k * 7 + Math.sin(clock * 3 + k) * 2, fill: col, alpha: 0.06 * k });
      r.circle({ x: w.x, y: w.y - 20 + bob, r: 11, fill: '#eaf8ff', alpha: 0.9 });
      // 走近鬼火露出怪的样子
      if (d < 170) {
        const a = clamp((170 - d) / 80, 0, 1);
        r.drawActor({ look: w.look, x: w.x, y: w.y + 18, size: 44 * (w.tier === 'gatekeeper' ? 1.2 : 1), t: clock + i, alpha: a * 0.9 });
      }
      if (i === 0 && d < 200) {
        const tag = w.tier === 'gatekeeper' ? '看门的 · 3 条血' : w.tier === 'elite' ? '精英 · 2 条血' : layout.wisps.length > 1 ? `一群 · ${layout.wisps.length} 只` : '一只';
        bold(r, tag, w.x + (layout.wisps.length - 1) * 29, w.y - 64 + bob, { size: F.xs, align: 'center', color: col });
      }
    });
  }

  function drawParty(r) {
    // 队友跟在后面
    (state.player.allies || []).forEach((id, i) => {
      const p = trail[Math.max(0, trail.length - 1 - (i + 1) * 14)] || { x: hero.x - (i + 1) * 30, y: hero.y + 16 };
      const role = catalog.allies[id]?.role || 'support';
      r.drawActor({ look: `ally_${role}`, x: p.x, y: p.y, size: 34, t: hero.t + i * 0.3, state: hero.moving ? 'walk' : 'idle' });
    });
    r.drawActor({ look: 'hero', x: hero.x, y: hero.y, size: 40, t: hero.moving ? hero.t : clock, state: hero.moving ? 'walk' : 'idle' });
    // 点地走：落点一圈
    if (target && !blocked()) {
      const k = (clock * 2) % 1;
      ellipse(r, target.x, target.y, 8 + k * 6, 3 + k * 2, { stroke: '#ffffff', lineWidth: 1, alpha: 0.5 * (1 - k) });
    }
  }

  function drawToasts(r) {
    toasts.forEach((f, i) => {
      const k = (clock - f.t) / 2.6;
      const a = k < 0.1 ? k / 0.1 : k > 0.8 ? (1 - k) / 0.2 : 1;
      const y = 150 + i * 34 - k * 10;
      const w = Math.min(640, r.measureText(f.text, { size: F.m, weight: 'bold' }).width + 40);
      r.rect({ x: 480 - w / 2, y: y - 15, w, h: 30, radius: 15, fill: '#0b0d12', stroke: f.icon === 'quest' ? T.connect : f.icon === 'gold' ? T.gold : '#3e4862', lineWidth: 1.5, alpha: 0.9 * a });
      txt(r, f.text, 480, y, { size: F.m, weight: 'bold', align: 'center', color: f.icon === 'quest' ? T.connect : f.icon === 'gold' ? T.gold : T.text, alpha: a });
    });
  }

  function drawFloaters(r) {
    floaters.forEach((f) => {
      const k = (clock - f.t) / 1.4;
      bold(r, f.text, f.x, f.y - k * 30, { size: F.m, align: 'center', color: f.color, alpha: 1 - k });
    });
  }

  function drawStatus(r) {
    r.rect({ x: 0, y: 0, w: W, h: 32, fill: T.bar, alpha: 0.92 });
    let x = hearts(r, 14, 16, state.player.hearts, state.player.maxHearts, 18) + 12;
    r.circle({ x: x + 8, y: 16, r: 7, fill: T.gold, stroke: '#7a5a10', lineWidth: 1.5 });
    const g = state.gold;
    txt(r, String(g.safe + g.risky), x + 20, 16, { size: F.s, weight: 'bold', color: T.gold });
    if (g.risky > 0) txt(r, `（死了只剩 ${g.safe}）`, x + 20 + r.measureText(String(g.safe + g.risky), { size: F.s, weight: 'bold' }).width + 4, 16, { size: F.xs, color: T.text3 });
    const c = state.clearing;
    txt(r, `${state.zone.label} · 第 ${c.layer} 层 · 这层第 ${Math.min(c.indexInLayer + 1, c.layerLength)} 片`, 480, 16, { size: F.s, weight: 'bold', align: 'center' });
    // 右边：加成图标、牌组、菜单
    const bs = state.player.buffs || [];
    let bx = 960 - 128 - bs.length * 24;
    bs.forEach((id) => {
      const b = catalog.buffs[id];
      if (!b) return;
      buffIcon(r, bx, 6, { lane: b.lane || 'chain' }, 20);
      bx += 24;
    });
    const db = deckButton();
    smallButton(r, db.x, db.y, db.w, db.h, `牌组 ${state.player.deck.length}`);
    const mb = menuButton();
    smallButton(r, mb.x, mb.y, mb.w, mb.h, '≡');
    // 鼠标放在加成上看全文
    if (pointer.y < 30 && pointer.x > 960 - 128 - bs.length * 24 && pointer.x < 960 - 128) {
      const i = Math.floor((pointer.x - (960 - 128 - bs.length * 24)) / 24);
      const b = catalog.buffs[bs[i]];
      if (b) tooltip(r, pointer.x, 40, b.label, b.description);
    }
  }

  function drawQuests(r) {
    const qs = state.quests || [];
    if (!qs.length) return;
    let y = 46;
    r.rect({ x: 10, y: 38, w: 250, h: 10 + qs.length * 20, radius: 8, fill: '#0b0d12', alpha: 0.7 });
    qs.forEach((q) => {
      r.rect({ x: 18, y: y - 5, w: 10, h: 10, radius: 2, fill: q.done ? T.connect : '#5a6480' });
      txt(r, `${q.hidden ? '隐 · ' : ''}${q.label}`, 34, y, { size: F.xs, color: q.done ? T.connect : T.text2 });
      txt(r, q.done ? '做完了' : `${q.have}/${q.count}`, 252, y, { size: F.xs, align: 'right', color: q.done ? T.connect : T.text });
      y += 20;
    });
  }

  function tooltip(r, x, y, title, body) {
    const lines = wrapText(r, body || '', 260, { size: F.xs });
    const w = 280;
    const h = 30 + lines.length * 16;
    const bx = clamp(x - w / 2, 6, W - w - 6);
    r.rect({ x: bx, y, w, h, radius: 8, fill: '#0b0d12', stroke: '#3e4862', lineWidth: 1, alpha: 0.96 });
    txt(r, title, bx + 10, y + 14, { size: F.s, weight: 'bold' });
    lines.forEach((ln, i) => txt(r, ln, bx + 10, y + 32 + i * 16, { size: F.xs, color: T.text2 }));
  }

  function drawPending(r) {
    const p = state.pending;
    const pl = pendingLayout();
    const k = clamp((clock - pendingAt) / 0.22, 0, 1);
    r.rect({ x: 0, y: 0, w: W, h: H, fill: '#05070a', alpha: 0.62 * k });
    const { box } = pl;
    const dy = (1 - k) * 16;
    r.rect({ x: box.x, y: box.y + dy, w: box.w, h: box.h, radius: 14, fill: '#121722', stroke: '#3a4560', lineWidth: 1.5, alpha: k });
    const title = {
      pick_card: '挑一张功能牌，放进牌组',
      pick_buff: '挑一个加成，这一趟一直有用',
      enhance: p.step === 'dir' ? '往哪个方向强化' : '挑一张牌强化',
      remove: '挑一张牌删掉',
      rest: '歇一歇：挑一样',
      event: p.label,
      notice: p.text,
    }[p.type];
    const src = p.source ? `（${p.source}）` : '';
    if (p.type === 'notice') {
      bold(r, title, 480, box.y + 60 + dy, { size: F.l, align: 'center', color: '#ffffff', alpha: k });
    } else {
      txt(r, title, 480, box.y + 30 + dy, { size: F.l, weight: 'bold', align: 'center', alpha: k });
      if (src) txt(r, src, 480, box.y + 54 + dy, { size: F.xs, align: 'center', color: T.text3, alpha: k });
    }

    pl.items.forEach((it, i) => {
      const hov = hover === it.id;
      const lift = hov ? -6 : 0;
      const ia = clamp(k * 1.5 - i * 0.12, 0, 1);
      if (p.type === 'pick_card') {
        const d = catalog.cards[it.id] || { label: it.id };
        fnCard(r, { x: it.x, y: it.y + lift + (1 - ia) * 20, w: it.w, h: 150, text: d.label, color: d.usage === 'chain' ? d.color : null, draw: d.drawAfterPlay || 0, instant: d.usage === 'instant' });
        wrapText(r, d.description || '', it.w - 8, { size: F.xs }).slice(0, 3).forEach((ln, j) => txt(r, ln, it.x + it.w / 2, it.y + 166 + j * 15 + lift, { size: F.xs, align: 'center', color: T.text2, alpha: ia }));
        if (hov) r.rect({ x: it.x - 3, y: it.y - 3 + lift, w: it.w + 6, h: 156, radius: 10, stroke: '#ffffff', lineWidth: 2 });
      } else if (p.type === 'pick_buff') {
        const b = catalog.buffs[it.id] || { label: it.id, lane: 'chain' };
        const lanes = b.lanes || [b.lane];
        const col = LANE[lanes[0]]?.color || '#ffffff';
        r.rect({ x: it.x, y: it.y + lift + (1 - ia) * 20, w: it.w, h: it.h, radius: 12, fill: '#1a2030', stroke: hov ? '#ffffff' : col, lineWidth: hov ? 2.5 : 1.5, alpha: ia });
        lanes.forEach((ln, j) => buffIcon(r, it.x + it.w / 2 - lanes.length * 22 + j * 44 + 4, it.y + 18 + lift, { lane: ln }, 36));
        wrapText(r, b.label, it.w - 20, { size: F.m, weight: 'bold' }).forEach((ln, j) => txt(r, ln, it.x + it.w / 2, it.y + 80 + j * 20 + lift, { size: F.m, weight: 'bold', align: 'center', alpha: ia }));
        wrapText(r, b.description || '', it.w - 20, { size: F.xs }).slice(0, 5).forEach((ln, j) => txt(r, ln, it.x + it.w / 2, it.y + 130 + j * 15 + lift, { size: F.xs, align: 'center', color: T.text2, alpha: ia }));
        txt(r, `喂「${lanes.map((l) => LANE[l]?.glyph || '').join('、')}」`, it.x + it.w / 2, it.y + it.h - 14 + lift, { size: F.xs, align: 'center', color: col, alpha: ia });
      } else if (p.type === 'enhance' && p.step === 'dir') {
        r.rect({ x: it.x, y: it.y, w: it.w, h: it.h, radius: 10, fill: hov ? '#26304a' : '#1a2030', stroke: hov ? '#ffffff' : '#3e4862', lineWidth: 1.5 });
        txt(r, ({ pain: '疼：这张每发 +50%', more: '多：多算 1 颗宝石来打发', shred: '破盾：每颗多削 1 格', record: '集色：打出时顺带记上旁边一色' })[it.id], it.x + 20, it.y + it.h / 2, { size: F.m, weight: 'bold' });
      } else if (p.type === 'enhance' || p.type === 'remove') {
        drawMiniCard(r, it.card, it.x, it.y + lift, it.w, it.h);
        if (hov) r.rect({ x: it.x - 2, y: it.y - 2 + lift, w: it.w + 4, h: it.h + 4, radius: 6, stroke: '#ffffff', lineWidth: 2 });
      } else if (p.type === 'event' || p.type === 'rest') {
        const dis = it.option.disabled;
        r.rect({ x: it.x, y: it.y, w: it.w, h: it.h, radius: 10, fill: hov && !dis ? '#26304a' : '#1a2030', stroke: hov && !dis ? '#ffffff' : '#3e4862', lineWidth: 1.5, alpha: dis ? 0.5 : 1 });
        txt(r, it.option.label + (dis ? '（不够）' : ''), 480, it.y + it.h / 2, { size: F.m, weight: 'bold', align: 'center', alpha: dis ? 0.5 : 1 });
      }
    });
    pl.buttons.forEach((b) => {
      const hov = hover === b.id;
      r.rect({ x: b.x, y: b.y, w: b.w, h: b.h, radius: 8, fill: hov ? '#2c3650' : '#1b2030', stroke: hov ? '#ffffff' : '#3e4862', lineWidth: 1 });
      txt(r, b.label, b.x + b.w / 2, b.y + b.h / 2, { size: F.s, align: 'center', color: T.text });
    });
    // 强化 / 删牌：鼠标放在牌上看它是什么
    if ((p.type === 'enhance' && p.step !== 'dir') || p.type === 'remove') {
      const it = pl.items.find((b) => b.id === hover);
      if (it) tooltip(r, it.x + it.w / 2, it.y + it.h + 8, it.card.label, it.card.description);
    }
  }

  function drawMiniCard(r, card, x, y, w, h) {
    if (card.kind === 'gem') {
      gemCard(r, { x, y, w, h, color: card.color, gems: card.gems });
      if (card.enhanced) txt(r, '+', x + w - 8, y + 10, { size: F.s, weight: 'bold', color: '#ffffff' });
    } else {
      r.rect({ x, y, w, h, radius: 6, fill: card.kind === 'junk' ? '#2a2222' : '#252b3d', stroke: card.color && card.color !== 'colorless' ? swatch(card.color) : '#59657f', lineWidth: 1.5 });
      wrapText(r, card.label, w - 6, { size: 10 }).slice(0, 3).forEach((ln, i) => txt(r, ln, x + w / 2, y + 14 + i * 13, { size: 10, align: 'center', color: card.kind === 'junk' ? '#c08a8a' : T.text }));
    }
  }

  function drawDeck(r) {
    r.rect({ x: 0, y: 0, w: W, h: H, fill: '#05070a', alpha: 0.75 });
    r.rect({ x: 60, y: 50, w: 840, h: 440, radius: 14, fill: '#121722', stroke: '#3a4560', lineWidth: 1.5 });
    const deck = state.player.deck;
    txt(r, `牌组 ${deck.length} 张 · 每回合补到 ${state.player.drawTarget} 张`, 480, 76, { size: F.l, weight: 'bold', align: 'center' });
    const s = state.player.stats;
    txt(r, `攻击 ${s.attack} · 增伤 +${Math.round(s.damageBonus * 100)}% · 暴击 ${Math.round(s.critRate * 100)}% · 暴伤 ×${s.critDamage}`, 480, 100, { size: F.s, align: 'center', color: T.text2 });
    const gl = state.player.gemLevels;
    txt(r, `宝石等级：红 ${gl.red.level} · 绿 ${gl.green.level} · 蓝 ${gl.blue.level}`, 480, 120, { size: F.s, align: 'center', color: T.text2 });
    const cols = 14;
    deck.forEach((c, i) => drawMiniCard(r, c, 92 + (i % cols) * 56, 140 + Math.floor(i / cols) * 70, 48, 62));
    txt(r, '点一下关掉（Tab 也行）', 480, 470, { size: F.xs, align: 'center', color: T.text3 });
  }

  return {
    setState,
    update,
    render,
    onPointer,
    onKey,
    isBusy: () => fightAt >= 0,
    /** 测试、截图用：这一片里东西放在哪 */
    getLayout: () => ({ ...layout, exits: exitBoxes(), hero: { ...hero }, pending: pendingLayout(), deckButton: deckButton() }),
    /** 换场景回来接着站在原地（场景会重建） */
    getHeroPos: () => ({ x: hero.x, y: hero.y, clearingId }),
    setHeroPos: (p) => { if (p && p.clearingId === clearingId) { hero.x = p.x; hero.y = p.y; target = null; enterAt = clock - 1; } },
    /** 测试用：直接把主角放到某处 */
    debugPlaceHero: (x, y) => { hero.x = x; hero.y = y; target = null; },
  };
}

