'use strict';
// 一仗：俯视角。怪在上、主角在下；点牌（或拖）排进链，按施法一张张打出去，然后轮到怪。
// 怪长什么样、怎么动在 monsters.js（LOOKS）；规则在 rules.js。

const L = {   // 界面布局（按 1280×720 排）
  cw: 88, ch: 124, handY: 620, stripY: 474, sw: 60, sh: 85,
  cast: { x: 1088, y: 548, w: 164, h: 58 }, drawPile: { x: 1214, y: 668 }, discard: { x: 1136, y: 668 },
  wheel: { x: 86, y: 636, r: 48 }, escape: { x: 1196, y: 46, w: 68, h: 28 }, lobby: { x: 1112, y: 46, w: 76, h: 28 },
};
const HIT_COL = [[255, 120, 100], [130, 240, 150], [130, 176, 255]];
const hitCol = h => h.white ? [255, 255, 255] : h.gem >= 0 ? HIT_COL[h.gem] : [236, 206, 140];
const BT = {};

// ---------- 战斗用的空地：中间干干净净，树只长在边上沉进黑里 ----------
const ARENA_C = 3000, AX = ARENA_C * CH, AY = ARENA_C * CH;   // 4×4 块，空地在正中
function buildArena(seed) {
  const r = rngFrom(seed), list = [];
  for (let cy = ARENA_C - 2; cy < ARENA_C + 2; cy++) for (let cx = ARENA_C - 2; cx < ARENA_C + 2; cx++) {
    const g = document.createElement('canvas'); g.width = g.height = CH;
    const gc = g.getContext('2d'), im = gc.createImageData(CH, CH);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
      const gx = cx * CH + x, gy = cy * CH + y, rr = Math.hypot(gx - AX, (gy - AY) * 1.15);
      let col;
      if (ART.on) {   // 画师的底图；中间踩秃的土用小路的颜色，边缘带一点起伏，不是正圆
        col = artBaseCol(gx, gy);
        if (rr < 22 + 7 * fbm(gx * .08, gy * .08, 4)) col = artCol('trail', col);
      } else {
        col = mix([48, 62, 50], [58, 74, 56], fbm(gx * .03 + seed % 97, gy * .03, 1));
        col = mix(col, [64, 62, 52], (1 - smooth(clamp((rr - 14) / 26, 0, 1))) * .55);
        col = mix(col, [34, 46, 40], smooth(clamp((rr - 52) / 22, 0, 1)) * .8);
      }
      col = col.map(v => v * (1 - smooth(clamp((rr - 96) / 30, 0, 1)) * .9));   // 再往外沉进黑里
      const k = (y * CH + x) * 4; im.data[k] = col[0]; im.data[k + 1] = col[1]; im.data[k + 2] = col[2]; im.data[k + 3] = 255;
    }
    gc.putImageData(im, 0, 0);
    const decals = [];
    if (ART.on) artDecorate(gc, cx * CH, cy * CH, r, 3, 14, (x, y) => { const d = Math.hypot(x - AX, (y - AY) * 1.15); return d < 34 || d > 84; });
    else for (let i = 0; i < 26; i++) decals.push({ x: cx * CH + r() * CH, y: cy * CH + r() * CH, c: r() < .6 ? '#5e4a3a' : '#4f6a4c' });
    list.push({ cx, cy, ground: g, water: new Uint8Array(CH * CH), objs: [], decals });
  }
  const objs = [];
  const free = (x, y, rad) => objs.every(o => Math.hypot(o.x - x, o.y - y) > (o.r || 1.5) + rad);
  const put = o => { objs.push(o); const c = list.find(c => c.cx === Math.floor(o.x / CH) && c.cy === Math.floor(o.y / CH)); if (c) c.objs.push(o); };
  const ring = (n, r0, r1, sp, make) => { for (let k = 0, c = 0; k < n * 30 && c < n; k++) {
    const a = r() * TAU, rr = r0 + r() * (r1 - r0), x = AX + Math.cos(a) * rr, y = AY + Math.sin(a) * rr / 1.15;
    if (Math.abs(x - AX) > 2 * CH - 4 || Math.abs(y - AY) > 2 * CH - 4 || !free(x, y, sp)) continue; put(make(x, y)); c++; } };
  ring(ART.on ? 16 : 26, 72, 124, 15, (x, y) => { const dead = r() < .3; return { m: dead ? MODELS.dead[(r() * 4) | 0] : MODELS.live[(r() * 6) | 0], x, y, ro: quarter(r), r: 3.6, tall: true, dead }; });
  ring(10, 60, 74, 5, (x, y) => ({ m: MODELS.bush[(r() * 4) | 0], x, y, ro: quarter(r), r: 0 }));
  ring(6, 42, 62, 8, (x, y) => ({ m: MODELS.grass[(r() * 4) | 0], x, y, ro: quarter(r), r: 0 }));
  return list;
}

function enterBattle(w) {
  const b = startFight(run, w.spec);   // 血量、攻击、是不是看门的，都在鬼火身上（world.js placeWisps）
  const dx = w.x - player.x, dy = w.y - player.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  for (const k of Object.keys(BT)) delete BT[k];
  const back = { x: player.x, y: player.y, h: player.h, view: CAM.view, ux, uy };   // 记下在林子里的位置，打完送回来
  const arena = buildArena((Math.floor(w.hx * 7 + w.hy * 13) >>> 0) || 1);
  for (const c of arena) chunks.set(c.cx + ',' + c.cy, c);
  player.x = AX; player.y = AY + 20;
  Object.assign(BT, {
    b, wisp: w, phase: 'plan', plan: null, press: null, drag: null, hover: -1, pos: new Map(), nums: [], shots: [], beams: [], parts: [],
    flying: [], incoming: [], flash: 0, shake: 0, cold: 0, castTotal: 0, castShown: 0, multPop: 0, hpShown: b.mon.hp, banner: null, toast: null,
    t: 0, confirm: null, loot: null, relicPick: null, over: null, circle: 0, back, arena, rootGrowT: 9,
    mon: { x: 0, y: 0, ro: 0, lift: 0, alpha: 0, look: lookOf(b.kind), model: null, hit: 0, lunge: 0, ux, uy, dart: 0, shake: 0 },
  });
  BT.mon.model = BT.mon.look.model({ t: 0, cd: b.mon.countdown, elite: b.mon.elite, shake: 0 });
  // 镜头转到正北，怪放在主角正上方：切片不斜着采样，画面清楚
  BT.view = 0; CAM.view = 0;
  const vx = -Math.sin(BT.view), vy = -Math.cos(BT.view);
  const dist = BT.mon.look.dist || 38;
  Object.assign(BT.mon, { ux: vx, uy: vy, ro: Math.atan2(-vy, -vx) - Math.PI / 2, x: player.x + vx * dist, y: player.y + vy * dist });
  BT.center = { x: player.x + vx * 4, y: player.y + vy * 4 }; player.h = Math.atan2(vy, vx); player.moving = false;
  CAM.x = BT.center.x; CAM.y = BT.center.y;
  dealIn(b.hand, .3);
  toast(`第 1 回合 · 摸 ${b.hand.length} 张`);
}
function dealIn(cards, delay0) {
  cards.forEach((c, i) => BT.pos.set(c, { x: L.drawPile.x, y: L.drawPile.y, r: 0, s: .4, a: 0, delay: delay0 + i * .08 }));
}
function banner(text, col = [240, 232, 210]) { BT.banner = { text, col, t: 0 }; }
function toast(text) { BT.toast = { text, t: 0 }; }

// ---------- 布局 ----------
function handLayout(n) {
  const out = [], gap = Math.min(82, 720 / Math.max(1, n)), mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) { const k = i - mid; out.push({ x: 640 + k * gap, y: L.handY + k * k * 1.3, r: k * .035, s: 1 }); }
  return out;
}
function stripLayout(n) {
  const out = [], gap = Math.min(68, 700 / Math.max(1, n)), x0 = 640 - (n - 1) * gap / 2;
  for (let i = 0; i < n; i++) out.push({ x: x0 + i * gap, y: L.stripY });
  return out;
}
const inRect = (m, r) => m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
function undoRect(n) { const sl = stripLayout(Math.max(1, n)); return { x: (n ? sl[n - 1].x : 640) + L.sw / 2 + 20, y: L.stripY - 15, w: 96, h: 30 }; }
function handHit(m) {
  const b = BT.b, lay = handLayout(b.hand.length);
  for (let i = b.hand.length - 1; i >= 0; i--) {
    const p = lay[i], lift = i === BT.hover ? 30 : 0;
    if (Math.abs(m.x - p.x) < L.cw / 2 && m.y > p.y - L.ch / 2 - lift && m.y < p.y + L.ch / 2) return i;
  }
  return -1;
}
function stripHit(m) {
  const n = BT.b.line.length, sl = stripLayout(n);
  for (let i = n - 1; i >= 0; i--) if (Math.abs(m.x - sl[i].x) < L.sw / 2 && Math.abs(m.y - sl[i].y) < L.sh / 2) return i;
  return -1;
}
const stripVisible = () => BT.drag || BT.b.line.length > 0 || BT.phase === 'cast';
const canFlee = () => !BT.b.mon.guard && run.hearts > .5;
const overlayOpen = () => BT.over || BT.loot || BT.relicPick || BT.confirm;

// ---------- 输入 ----------
const CONFIRM_BTNS = () => ({ yes: { x: 520, y: 380, w: 110, h: 40 }, no: { x: 650, y: 380, w: 110, h: 40 } });
function battleDown(m) {
  if (BT.over) { if (inRect(m, BT.over.btn)) { BT.over = null; goLobby('dead'); } return; }
  if (BT.relicPick) {
    const i = BT.relicPick.rects.findIndex(r => inRect(m, r));
    if (i >= 0) { gainRelic(run, BT.relicPick.keys[i]); BT.relicPick = null; openLoot(); }
    return;
  }
  if (BT.loot) {
    const i = BT.loot.rects.findIndex(r => inRect(m, r));
    if (i >= 0) { run.deck.push(BT.loot.cards[i]); BT.loot = null; leaveBattle('win'); }
    else if (inRect(m, BT.loot.skip)) { BT.loot = null; leaveBattle('win'); }
    return;
  }
  if (BT.confirm) {
    if (inRect(m, BT.confirm.yes)) { const k = BT.confirm.kind; BT.confirm = null; if (k === 'lobby') goLobby(); else { run.hearts -= .5; leaveBattle('flee'); } }
    else if (inRect(m, BT.confirm.no)) BT.confirm = null;
    return;
  }
  if (BT.phase !== 'plan') return;
  const b = BT.b;
  if (inRect(m, L.escape)) { if (canFlee()) BT.confirm = { kind: 'flee', ...CONFIRM_BTNS() }; return; }
  if (inRect(m, L.lobby)) { BT.confirm = { kind: 'lobby', ...CONFIRM_BTNS() }; return; }
  if (inRect(m, L.cast)) { castStart(); return; }
  if (b.line.length && inRect(m, undoRect(b.line.length))) { const cs = [...b.line]; unqueueAll(b); cs.forEach(bump); return; }
  const si = stripHit(m);
  if (si >= 0) { const c = b.line[si]; unqueueCard(b, si); bump(c); return; }
  const i = handHit(m);
  if (i >= 0) BT.press = { card: b.hand[i], x: m.x, y: m.y, drag: false };
}
function bump(c) { const p = BT.pos.get(c); if (p) p.s = .7; }
function battleMove(m) {
  const p = BT.press;
  if (p && !p.drag && Math.hypot(m.x - p.x, m.y - p.y) > 10) { p.drag = true; BT.drag = p; }
  if (BT.phase === 'plan' && !p && !overlayOpen()) BT.hover = handHit(m);
}
function battleUp(m) {
  const p = BT.press; BT.press = null; BT.drag = null;
  if (!p || BT.phase !== 'plan') return;
  if (p.drag && m.y > 560) return;   // 拖回手牌区 = 放回去
  useCard(p.card, p.drag ? m : null);
}
function battleKey(k) {
  if (k === ' ' && BT.phase === 'plan' && !overlayOpen()) castStart();
  if (k === 'Escape' && BT.confirm) BT.confirm = null;
}
function useCard(card, at) {
  const b = BT.b, i = b.hand.indexOf(card); if (i < 0) return;
  const p = BT.pos.get(card);
  if (card.instant) {
    const r = playInstant(run, b, i);
    flyToDiscard(card, at ? at.x : p?.x, at ? at.y : p?.y);
    banner(card.name + '：' + card.text, [214, 186, 130]);
    dealIn(r.drawn, .05);
  } else {
    queueCard(b, i);
    if (p) { if (at) { p.x = at.x; p.y = at.y; } p.s = .9; }
  }
  BT.hover = -1;
}

// ---------- 施法 ----------
function castStart() {
  const b = BT.b;
  if (BT.phase !== 'plan') return;
  BT.hover = -1;
  if (!b.line.length) { toast('攒着，这回合不出牌'); BT.phase = 'pass'; BT.passT = 0; return; }
  BT.plan = startCast(run, b); BT.phase = 'cast'; BT.castCards = [...b.line];
  BT.groups = BT.plan.states.map(() => []);
  for (const h of BT.plan.hits) BT.groups[h.ci].push(h);
  BT.ci = -1; BT.castTotal = 0; BT.castShown = 0; BT.circle = .001; BT.flownUpTo = -1; BT.toast = null;
  nextCard();
}
function nextCard() {
  BT.ci++;
  if (BT.ci >= BT.plan.states.length) { BT.castWait = true; BT.waitT = 0; return; }
  const hits = BT.groups[BT.ci], st = BT.plan.states[BT.ci], speed = Math.max(.45, 1 - BT.ci * .05);
  Object.assign(BT, { fire: hits, fi: 0, ft: 0, gap: (hits.length > 6 ? .022 : .05) * speed, hold: Math.max(.16, .3 * speed), castWait: false });
  BT.multPop = 1;
  if (st.rainbowNow) { BT.flash = 1; banner('彩虹！从此每接一张 ×3', [255, 236, 170]); }
  else if (st.rel === '合白') banner('合白', [255, 255, 255]);
  else if (st.rel === '断') banner('断了，倍率回到 ×1', [160, 160, 168]);
}
function gemPos(i) { return gemOrbit(player, T)[i]; }   // 跟 renderWorld 画宝石用同一个时间
function fire(h) {
  const m = BT.mon;
  const from = h.white ? { x: m.x, y: m.y, z: m.lift + 52 } : h.gem >= 0 ? gemPos(h.gem) : { x: player.x + (Math.random() - .5) * 6, y: player.y, z: 8 };
  const to = { x: m.x + (Math.random() - .5) * 8, y: m.y + (Math.random() - .5) * 5, z: m.lift + 16 + (Math.random() - .5) * 10 };
  BT.shots.push({ h, from, to, t: 0, dur: h.white ? .1 : h.bean ? .24 : .17 });
  if (h.white) BT.beams.push({ t: 0 });
}
function hitArrive(s) {
  const h = s.h, killed = applyHit(run, BT.b, BT.plan, h);
  BT.castTotal = BT.plan.dealt;
  const { x: ux, y: uy } = w2ui(proj(s.to.x, s.to.y, s.to.z));
  const spot = numberSpot(ux, uy);
  const rooted = !!h.rooted && h.rooted >= h.dmg;   // 整发都被根须挡了：数字是土色的
  BT.nums.push({ text: h.dodge ? '躲开' : fmt(h.dmg), v: h.dmg, crit: h.crit && !rooted, white: h.white, small: h.small || h.bean, dodge: h.dodge, rooted,
    rainbow: BT.plan.states[h.ci].rainbow && !rooted, col: rooted ? [176, 140, 96] : hitCol(h), x: spot.x, y: spot.y, t: 0 });
  if (h.rootBreak) {   // 根须打穿了：一圈木屑崩开
    banner('根须打穿了！', [236, 204, 150]); BT.shake = Math.max(BT.shake, .7);
    const m = BT.mon;
    for (let i = 0; i < 40; i++) { const a = Math.random() * TAU, rr = 26 + Math.random() * 10; BT.parts.push({ x: m.x + Math.cos(a) * rr, y: m.y + Math.sin(a) * rr, z: 2 + Math.random() * 6, vx: Math.cos(a) * 18, vy: Math.sin(a) * 18, vz: 20 + Math.random() * 20, t: 0, life: .8, g: 60, c: [150, 116, 82] }); }
  }
  if (BT.nums.length > 140) BT.nums.shift();
  if (!h.dodge) {
    BT.mon.hit = Math.min(1, BT.mon.hit + (h.crit ? .7 : .35));
    BT.shake = Math.max(BT.shake, Math.min(.5, .06 + Math.log10(Math.max(1, h.dmg)) * .04) * (h.crit ? 1.6 : 1));
    for (let i = 0; i < (h.crit ? 6 : 3); i++) BT.parts.push({ x: s.to.x, y: s.to.y, z: s.to.z, vx: (Math.random() - .5) * 34, vy: (Math.random() - .5) * 34, vz: Math.random() * 30, t: 0, life: .6, g: 40, c: hitCol(h) });
  }
  if (killed) { BT.shake = 1; BT.flash = Math.max(BT.flash, .25); }
}
// 数字落点：在怪周围试几个位置，挑离还没散的数字最远的（横向挤一点没关系，数字是扁的）
function numberSpot(ux, uy) {
  let best = null, bestD = -1;
  for (let k = 0; k < 10; k++) {
    const x = ux + (Math.random() - .5) * 250, y = uy + (Math.random() - .5) * 120 - 10;
    let d = 1e9;
    for (const q of BT.nums) if (q.t < .8) d = Math.min(d, Math.hypot((q.x - x) * .55, q.y - y));
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}
function flyToDiscard(card, x, y) {
  const p = BT.pos.get(card) || { x, y };
  BT.flying.push({ card, x: x ?? p.x, y: y ?? p.y, t: 0 });
  BT.pos.delete(card);
}
// 施法打完：宝石升级、怪死了就收尾，没死轮到怪
function afterCast() {
  const ups = endCast(run, BT.b, BT.plan);
  if (ups.length) banner(ups.map(u => GEM_NAMES[u.gem] + '宝石升到 Lv' + u.to).join('　'), [255, 230, 160]);
  BT.circle = 0;
  if (BT.b.mon.hp <= 0) { run.wins++; BT.candy = onWin(run); BT.phase = 'dying'; BT.dieT = 0; return; }
  monsterPhase();
}
// 轮到怪：先发特性（打伞的抖伞），再看倒计时
function monsterPhase() {
  const ev = monsterTrait(run, BT.b);
  if (ev && ev.spore) {
    const m = BT.mon, from = w2ui(proj(m.x, m.y, m.lift + 44));
    m.shake = .9;
    BT.incoming.push({ card: ev.spore, x: from.x, y: from.y, t: -.35 });
    banner(`${BT.b.mon.name}抖了抖伞：牌堆里多了一张孢子`, [196, 220, 164]);
    BT.phase = 'trait'; BT.traitT = 0; return;
  }
  monsterStrike();
}
function monsterStrike() {
  const res = monsterTurn(run, BT.b);
  if (res) { BT.phase = 'attack'; BT.atkT = 0; BT.atkRes = res; BT.struck = false; }
  else endOfRound();
}
// 打赢以后：精英和看门的先掉一件零碎（三选一），再选牌
function openRelicPick() {
  const ks = relicChoices(run, 3);
  if (!ks.length) return openLoot();
  BT.relicPick = { keys: ks, rects: ks.map((k, i) => ({ x: 640 + (i - (ks.length - 1) / 2) * 244 - 110, y: 214, w: 220, h: 262 })) };
}
function openLoot() {
  const cs = lootChoices(run);
  BT.loot = { cards: cs, rects: cs.map((c, i) => ({ x: 640 + (i - 1) * 200 - 66, y: 240, w: 132, h: 186 })), skip: { x: 580, y: 540, w: 120, h: 38 } };
}
function endOfRound() {
  if (run.hearts <= 0) { BT.phase = 'done'; BT.over = { btn: { x: 560, y: 400, w: 160, h: 44 } }; return; }
  const got = nextTurn(run, BT.b);
  BT.phase = 'plan'; dealIn(got, .15);
  toast(`第 ${BT.b.turn} 回合 · 摸 ${got.length} 张` + (BT.b.hand.length >= R.handMax ? '（手满了）' : ''));
  if (BT.b.rootsGrew) { BT.rootGrowT = 0; banner(`根须又长满了（${fmt(BT.b.mon.roots)}）`, [206, 170, 120]); }
}

// ---------- 每帧 ----------
function updateBattle(dt) {
  const b = BT.b, m = BT.mon;
  BT.t += dt;
  CAM.x = lerp(CAM.x, BT.center.x, Math.min(1, dt * 4)); CAM.y = lerp(CAM.y, BT.center.y, Math.min(1, dt * 4));
  let dv = BT.view - CAM.view; dv = Math.atan2(Math.sin(dv), Math.cos(dv)); CAM.view += dv * Math.min(1, dt * 4);
  // 怪：各有各的样子和动法（monsters.js 的 LOOKS）。提可越到要出手翅膀裹得越紧、偶尔忽左忽右闪一下；打伞的慢慢晃，抖伞时抖得厉害
  const look = m.look;
  if (BT.phase !== 'dying' && BT.phase !== 'done') m.alpha = Math.min(1, m.alpha + dt * 2.5);
  m.shake = Math.max(0, m.shake - dt);
  m.model = look.model({ t: BT.t, cd: b.mon.countdown, elite: b.mon.elite, shake: m.shake });
  let side = (Math.random() - .5) * m.hit * 2.4;
  if (look.dart) { m.dart = Math.max(0, m.dart - dt); if (Math.random() < dt * .25) { m.dart = .25; m.dartDir = Math.random() < .5 ? -1 : 1; } side += Math.sin(m.dart / .25 * Math.PI) * 5 * (m.dartDir || 1); }
  if (look.sway) side += Math.sin(BT.t * 1.3) * look.sway + (m.shake > 0 ? Math.sin(BT.t * 38) * 1.4 : 0);
  if (m.shake > 0 && Math.random() < dt * 30) BT.parts.push({ x: m.x + (Math.random() - .5) * 30, y: m.y + (Math.random() - .5) * 16, z: m.lift + 40 + Math.random() * 8, vx: (Math.random() - .5) * 8, vy: 6 + Math.random() * 8, vz: -4, t: 0, life: 1.2, g: 4, c: [196, 224, 168] });   // 孢子
  m.lift = look.lift + (look.bob ? Math.sin(BT.t * 2.4) * look.bob : 0);
  const dist = look.dist || 38, baseX = player.x + m.ux * dist, baseY = player.y + m.uy * dist, reach = look.heavy ? 12 : 30;
  m.x = baseX - m.ux * reach * m.lunge + (-m.uy) * side; m.y = baseY - m.uy * reach * m.lunge + m.ux * side;
  BT.rootGrowT += dt;
  m.hit = Math.max(0, m.hit - dt * 4);
  BT.hpShown = Math.max(b.mon.hp, BT.hpShown - Math.max(dt * b.mon.maxHp * .6, (BT.hpShown - b.mon.hp) * dt * 3));
  // 牌的位置
  const k = 1 - Math.exp(-dt * 14), lay = handLayout(b.hand.length);
  b.hand.forEach((c, i) => {
    let p = BT.pos.get(c); if (!p) { p = { x: lay[i].x, y: lay[i].y, r: 0, s: 1, a: 1, delay: 0 }; BT.pos.set(c, p); }
    if (p.delay > 0) { p.delay -= dt; return; }
    if (BT.drag && BT.drag.card === c) { p.x = mouse.x; p.y = mouse.y; p.r = 0; p.s = 1; p.a = 1; return; }
    const tg = lay[i], lift = i === BT.hover ? 30 : 0, sc = i === BT.hover ? 1.1 : 1;
    p.x = lerp(p.x, tg.x, k); p.y = lerp(p.y, tg.y - lift, k); p.r = lerp(p.r, tg.r, k); p.s = lerp(p.s, sc, k); p.a = Math.min(1, p.a + dt * 4);
  });
  const sl = stripLayout(b.line.length);
  b.line.forEach((c, i) => {
    let p = BT.pos.get(c); if (!p) { p = { x: sl[i].x, y: sl[i].y, r: 0, s: L.sw / L.cw, a: 1 }; BT.pos.set(c, p); }
    p.x = lerp(p.x, sl[i].x, k); p.y = lerp(p.y, sl[i].y, k); p.r = lerp(p.r, 0, k); p.s = lerp(p.s, L.sw / L.cw, k); p.a = 1; p.delay = 0;
  });
  for (let i = BT.flying.length - 1; i >= 0; i--) { const f = BT.flying[i]; f.t += dt * 2.6; if (f.t >= 1) BT.flying.splice(i, 1); }
  // 施法
  if (BT.phase === 'cast') {
    BT.circle = Math.min(1, BT.circle + dt * 3);
    if (!BT.castWait) {
      BT.ft += dt;
      while (BT.fi < BT.fire.length && BT.ft >= BT.fi * BT.gap) fire(BT.fire[BT.fi++]);
      if (BT.fi >= BT.fire.length && BT.ft >= BT.fire.length * BT.gap + BT.hold) { flyToDiscard(BT.castCards[BT.ci]); BT.flownUpTo = BT.ci; nextCard(); }
    } else if (!BT.shots.length) {
      BT.waitT += dt;
      if (BT.waitT > .5) afterCast();
    }
  }
  if (BT.phase === 'pass') { BT.passT += dt; if (BT.passT > .45) monsterPhase(); }
  if (BT.phase === 'trait') { BT.traitT += dt; if (BT.traitT > 1.05) monsterStrike(); }
  for (let i = BT.incoming.length - 1; i >= 0; i--) { const f = BT.incoming[i]; f.t += dt * 1.5; if (f.t >= 1) BT.incoming.splice(i, 1); }
  if (BT.phase === 'attack') {
    BT.atkT += dt; const a = BT.atkT;
    m.lunge = a < .32 ? smooth(a / .32) : a < .7 ? 1 - smooth((a - .32) / .38) : 0;
    if (!BT.struck && a >= .3) {
      BT.struck = true;
      if (BT.atkRes.blocked) banner('挡住了', [214, 186, 130]);
      else { BT.shake = 1; BT.cold = 1; BT.heartBreak = { i: Math.ceil(run.hearts + BT.atkRes.dmg) - 1, t: 0 }; }
    }
    if (a > 1.1) { m.lunge = 0; endOfRound(); }
  }
  if (BT.phase === 'dying') {   // 散成光点，往上飘
    BT.dieT += dt; m.alpha = Math.max(0, 1 - BT.dieT / .9);
    for (let i = 0; i < 2; i++) if (Math.random() < .9) BT.parts.push({ x: m.x + (Math.random() - .5) * 30, y: m.y + (Math.random() - .5) * 10, z: m.lift + Math.random() * 30, vx: (Math.random() - .5) * 6, vy: (Math.random() - .5) * 6, vz: 14 + Math.random() * 22, t: 0, life: 1.1, g: 0, c: [196, 228, 255] });
    if (BT.dieT > 1.4) { BT.phase = 'done'; if (b.mon.elite || b.mon.guard) openRelicPick(); else openLoot(); }
  }
  // 弹道、粒子、数字
  for (let i = BT.shots.length - 1; i >= 0; i--) { const s = BT.shots[i]; s.t += dt / s.dur; if (s.t >= 1) { hitArrive(s); BT.shots.splice(i, 1); } }
  for (let i = BT.parts.length - 1; i >= 0; i--) { const p = BT.parts[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= p.g * dt; if (p.t > p.life) BT.parts.splice(i, 1); }
  for (let i = BT.nums.length - 1; i >= 0; i--) { const q = BT.nums[i]; q.t += dt; q.y -= 34 * dt; if (q.t > 1.1) BT.nums.splice(i, 1); }
  for (let i = BT.beams.length - 1; i >= 0; i--) { BT.beams[i].t += dt * 4; if (BT.beams[i].t > 1) BT.beams.splice(i, 1); }
  if (BT.heartBreak) { BT.heartBreak.t += dt; if (BT.heartBreak.t > .8) BT.heartBreak = null; }
  const gap = BT.castTotal - BT.castShown;
  BT.castShown = gap > 0 ? (gap < 1 ? BT.castTotal : BT.castShown + gap * Math.min(1, dt * 9)) : BT.castTotal;
  BT.flash = Math.max(0, BT.flash - dt * 2); BT.shake = Math.max(0, BT.shake - dt * 3); BT.cold = Math.max(0, BT.cold - dt * 1.6);
  BT.multPop = Math.max(0, BT.multPop - dt * 4);
  if (BT.banner) { BT.banner.t += dt; if (BT.banner.t > 2) BT.banner = null; }
  if (BT.toast) { BT.toast.t += dt; if (BT.toast.t > 2.2) BT.toast = null; }
}

// 世界层里的战斗特效：魔法阵（平放在怪头顶）、白光、弹道、粒子
function battleFx(ctx) {
  const m = BT.mon;
  if (BT.circle > 0) {
    const r = 13 * smooth(BT.circle);
    groundTransform(ctx, m.x, m.y, m.lift + 48);
    ctx.strokeStyle = 'rgba(200,220,255,.75)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * .65, 0, TAU); ctx.stroke();
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + BT.t * .8; ctx.fillStyle = 'rgba(230,240,255,.9)'; ctx.fillRect(Math.cos(a) * r * .82 - .5, Math.sin(a) * r * .82 - .5, 1, 1); }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'lighter';
  for (const bm of BT.beams) {
    const top = proj(m.x, m.y, m.lift + 48), bot = proj(m.x, m.y, m.lift + 14);
    ctx.fillStyle = `rgba(255,255,255,${(1 - bm.t) * .8})`; ctx.fillRect(Math.round(top.x) - 1, top.y, 3, bot.y - top.y);
  }
  for (const s of BT.shots) {
    const c = hitCol(s.h);
    for (let k = 0; k < 3; k++) {
      const tt = Math.max(0, s.t - k * .12);
      const x = lerp(s.from.x, s.to.x, tt), y = lerp(s.from.y, s.to.y, tt), z = lerp(s.from.z, s.to.z, tt) + Math.sin(tt * Math.PI) * 6;
      const p = proj(x, y, z), big = !k && !s.h.small && !s.h.bean;
      ctx.fillStyle = rgba(k ? c : mix(c, [255, 255, 255], .6), k ? .5 / k : 1);
      ctx.fillRect(Math.round(p.x), Math.round(p.y), big ? 2 : 1, big ? 2 : 1);
    }
  }
  for (const p of BT.parts) { const q = proj(p.x, p.y, p.z); ctx.fillStyle = rgba(p.c, 1 - p.t / p.life); ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1); }
  if (m.alpha > 0 && BT.b.mon.elite) {   // 精英：身上一圈红光，一跳一跳的
    const p = proj(m.x, m.y, m.lift + m.model.sz * .45), rr = 26 + Math.sin(BT.t * 3) * 3;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
    g.addColorStop(0, `rgba(255,70,50,${.22 * m.alpha})`); g.addColorStop(1, 'rgba(255,70,50,0)');
    ctx.fillStyle = g; ctx.fillRect(p.x - rr, p.y - rr, rr * 2, rr * 2);
  }
  if (m.alpha > 0 && m.look.tail) {   // 提可尾巴上的光点
    const p = proj(m.x, m.y, m.lift + 2);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 8);
    g.addColorStop(0, `rgba(255,200,110,${.5 * m.alpha})`); g.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = g; ctx.fillRect(p.x - 8, p.y - 8, 16, 16);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// 战斗场景里另外画的东西：老墩的根须圈（前后两半，前半圈压在老墩前面）。刚长回来时一节节冒出来
function battleProps() {
  const mon = BT.b && BT.b.mon, m = BT.mon;
  if (!mon || !mon.rootMax || m.alpha <= 0 || mon.roots <= 0) return null;
  const f = mon.roots / mon.rootMax, grow = BT.rootGrowT < .5 ? Math.floor(BT.rootGrowT / .17) : 2;
  const dist = m.look.dist || 38, stage = Math.min(grow, f > .6 ? 2 : f > .25 ? 1 : 0), x = player.x + m.ux * dist, y = player.y + m.uy * dist;
  return [{ m: rootModel(stage, -1), x, y, bias: -1, alpha: m.alpha }, { m: rootModel(stage, 1), x, y, bias: 1, alpha: m.alpha }];
}
// 字底下的暗带：两头渐隐
function textBand(ctx, s, y, size) {
  ctx.font = `800 ${size}px "PingFang SC",sans-serif`;
  const w = ctx.measureText(s).width + size * 4, g = ctx.createLinearGradient(640 - w / 2, 0, 640 + w / 2, 0);
  g.addColorStop(0, 'rgba(4,6,10,0)'); g.addColorStop(.2, 'rgba(4,6,10,.6)'); g.addColorStop(.8, 'rgba(4,6,10,.6)'); g.addColorStop(1, 'rgba(4,6,10,0)');
  ctx.fillStyle = g; ctx.fillRect(640 - w / 2, y - size * .85, w, size * 1.7);
}
const heartWord = v => v === .5 ? '半颗' : v % 1 ? `${Math.floor(v)} 颗半` : `${v} 颗`;

// ---------- 界面小件 ----------
function txt(ctx, s, x, y, size, col = '#e8e2d4', align = 'center', weight = 600) {
  ctx.font = `${weight} ${size}px "PingFang SC",sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function btn(ctx, r, label, on = true, hot = false, sub = '') {
  ctx.fillStyle = on ? (hot ? 'rgba(70,64,52,.95)' : 'rgba(34,32,30,.92)') : 'rgba(30,30,30,.5)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = on ? 'rgba(214,180,120,.9)' : 'rgba(120,120,120,.4)'; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  if (sub) {
    txt(ctx, label, r.x + r.w / 2, r.y + r.h * .4, Math.min(22, r.h * .4), on ? '#efe4cc' : '#888');
    txt(ctx, sub, r.x + r.w / 2, r.y + r.h * .76, 11, on ? '#a49c8c' : '#666', 'center', 500);
  } else txt(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, Math.min(20, r.h * .48), on ? '#efe4cc' : '#888');
}
const HEART = ['011011', '111111', '111111', '011110', '001100'];
function pixHeart(ctx, x, y, s, fill) {   // fill: 0 空、.5 半颗、1 满
  for (let r = 0; r < 5; r++) for (let c = 0; c < 6; c++) {
    if (HEART[r][c] !== '1') continue;
    const on = fill >= 1 || (fill >= .5 && c < 3);
    ctx.fillStyle = on ? (r === 0 || (r === 1 && c === 1) ? '#ff9a8a' : '#d8443c') : '#3a2226';
    ctx.fillRect(x + c * s, y + r * s, s, s);
  }
}
function heartRow(ctx, x, y, s, hearts, max, breakAt) {
  for (let i = 0; i < Math.ceil(max); i++) {
    let hx = x + i * (s * 7 + 2);
    if (breakAt && breakAt.i === i) hx += Math.sin(breakAt.t * 60) * 4 * (1 - breakAt.t);
    pixHeart(ctx, Math.round(hx), y, s, clamp(hearts - i, 0, 1));
  }
}
function drawWheel(ctx, prev) {
  const { x, y, r } = L.wheel, lamps = prev.lamps;
  ctx.fillStyle = 'rgba(14,14,18,.85)'; ctx.beginPath(); ctx.arc(x, y, r + 8, 0, TAU); ctx.fill();
  if (prev.rainbow) {
    for (let i = 0; i < 24; i++) { ctx.strokeStyle = rgba(LAMP_COL[Math.floor(i / 4 + BT.t * 6) % 6], .8); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 6, i / 24 * TAU, (i + 1) / 24 * TAU); ctx.stroke(); }
  }
  for (let i = 0; i < 6; i++) {
    const a0 = -Math.PI / 2 + (i - .5) * TAU / 6 + .05, a1 = a0 + TAU / 6 - .1, on = lamps & (1 << i);
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.arc(x, y, r - 14, a1, a0, true); ctx.closePath();
    ctx.fillStyle = on ? rgba(LAMP_COL[i]) : rgba(mix(LAMP_COL[i], [10, 10, 14], .78)); ctx.fill();
    if (on) { ctx.shadowColor = rgba(LAMP_COL[i]); ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0; }
  }
  const pop = 1 + BT.multPop * .45;
  txt(ctx, '×' + fmt(prev.mult), x, y + 1, Math.round(22 * pop), prev.rainbow ? '#ffe9a8' : '#fff4dc', 'center', 800);
  // 三颗宝石：等级和经验
  for (let j = 0; j < 3; j++) {
    const gx = 168, gy = 596 + j * 40, g = run.gems[j], f = clamp(g.exp / gemNeed(g.level), 0, 1);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(gx, gy, 13, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(GEM_COLORS[j]); ctx.beginPath(); ctx.arc(gx, gy, 13, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
    ctx.fillStyle = rgba(GEM_COLORS[j]); ctx.beginPath(); ctx.moveTo(gx, gy - 6); ctx.lineTo(gx + 5, gy); ctx.lineTo(gx, gy + 6); ctx.lineTo(gx - 5, gy); ctx.fill();
    txt(ctx, 'Lv' + g.level, gx + 21, gy + 1, 14, '#d8d0c0', 'left');
  }
}
function drawPileIcon(ctx, p, n, label) {
  for (let i = Math.min(3, n) - 1; i >= 0; i--) {
    ctx.fillStyle = 'rgb(28,26,34)'; ctx.fillRect(p.x - 22 + i * 2, p.y - 30 - i * 2, 44, 60);
    ctx.strokeStyle = 'rgba(190,160,110,.8)'; ctx.lineWidth = 2; ctx.strokeRect(p.x - 21 + i * 2, p.y - 29 - i * 2, 42, 58);
  }
  if (!n) { ctx.strokeStyle = 'rgba(190,160,110,.3)'; ctx.strokeRect(p.x - 21, p.y - 29, 42, 58); }
  txt(ctx, String(n), p.x, p.y, 18, '#efe4cc', 'center', 700);
  txt(ctx, label, p.x, p.y + 42, 12, '#a49c8c');
}
// 伤害数字：越大字越大；暴击金色、合白白色、彩虹里七彩
function drawNumber(ctx, q) {
  const a = q.t < .85 ? 1 : Math.max(0, (1.1 - q.t) / .25);
  let sz = q.dodge ? 18 : clamp(13 + 4.6 * Math.log10(Math.max(1, q.v)), 15, 70);
  if (q.small) sz *= .72; if (q.crit) sz *= 1.25; if (q.white) sz *= 1.1;
  const pop = q.t < .12 ? 1 + (1 - q.t / .12) * .7 : 1, size = Math.round(sz * pop);
  ctx.globalAlpha = a;
  ctx.font = `900 ${size}px "PingFang SC",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(3, size * .16); ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.88)';
  ctx.strokeText(q.text, q.x, q.y);
  if (q.dodge) ctx.fillStyle = '#9aa4ac';
  else if (q.rainbow) {
    const w = ctx.measureText(q.text).width, g = ctx.createLinearGradient(q.x - w / 2, 0, q.x + w / 2, 0);
    LAMP_COL.forEach((c, i) => g.addColorStop(i / 5, rgba(mix(c, [255, 255, 255], .25))));
    ctx.fillStyle = g;
  } else ctx.fillStyle = q.crit ? '#ffcf4a' : rgba(q.col);
  ctx.fillText(q.text, q.x, q.y);
  if (q.crit && q.t < .7) txt(ctx, '暴击', q.x, q.y - size * .72, Math.round(size * .36), '#ffe9a0', 'center', 800);
  ctx.globalAlpha = 1;
}
// 怪头上：名字、特性、血条（带数字）、倒计时和这一下打多少
function drawMonsterHead(ctx, b) {
  const m = BT.mon, mon = b.mon;
  if (m.alpha < .05) return;
  const hp = w2ui(proj(m.x, m.y, m.lift + m.model.sz + 2)), cx = hp.x, y = Math.max(96, hp.y - 26);
  ctx.globalAlpha = Math.min(1, m.alpha * 1.5);
  if (mon.guard) txt(ctx, '看门的', cx - 100, y - 38, 12, '#e8b878', 'left', 700);
  txt(ctx, mon.name, cx - 100, y - 18, 17, mon.elite ? '#ff9c84' : '#efe4cc', 'left', 800);
  txt(ctx, mon.traitName, cx + 100, y - 18, 13, '#9fb8e8', 'right', 600);
  ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(cx - 102, y - 6, 204, 16);
  ctx.fillStyle = '#3a1418'; ctx.fillRect(cx - 100, y - 4, 200, 12);
  ctx.fillStyle = '#e8d8c0'; ctx.fillRect(cx - 100, y - 4, 200 * BT.hpShown / mon.maxHp, 12);
  ctx.fillStyle = '#c84a42'; ctx.fillRect(cx - 100, y - 4, 200 * mon.hp / mon.maxHp, 12);
  txt(ctx, `${fmt(mon.hp)} / ${fmt(mon.maxHp)}`, cx, y + 2, 11, '#fff', 'center', 700);
  if (mon.rootMax) {   // 老墩的根须：血条底下一条土色的
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(cx - 102, y + 11, 204, 13);
    ctx.fillStyle = '#2a2016'; ctx.fillRect(cx - 100, y + 13, 200, 9);
    ctx.fillStyle = '#a07a4e'; ctx.fillRect(cx - 100, y + 13, 200 * mon.roots / mon.rootMax, 9);
    txt(ctx, mon.roots > 0 ? `根须 ${fmt(mon.roots)}` : '根须打穿了', cx, y + 18, 10, '#f4e4c8', 'center', 700);
  }
  const cd = mon.countdown, red = cd <= 1 && BT.phase !== 'dying', pulse = red ? 1 + Math.sin(BT.t * 10) * .1 : 1, bx = cx + 126;
  ctx.fillStyle = red ? '#9a2a24' : 'rgba(30,30,36,.92)'; ctx.beginPath(); ctx.arc(bx, y + 2, 14 * pulse, 0, TAU); ctx.fill();
  ctx.strokeStyle = red ? '#ffb0a0' : '#8c8478'; ctx.lineWidth = 1.5; ctx.stroke();
  txt(ctx, String(cd), bx, y + 3, 15, '#fff', 'center', 800);
  for (let i = 0; i < Math.ceil(mon.atk); i++) pixHeart(ctx, bx + 21 + i * 24, y - 7, 3.4, clamp(mon.atk - i, 0, 1));
  BT.monRect = { x: cx - 110, y: y - 30, w: 270, h: 150 };
  ctx.globalAlpha = 1;
}
function hintStyle(card, st) {
  if (!st) return {};
  if (card.instant) return { glow: [214, 170, 110], label: '马上用', labelCol: '#e0b47a' };
  if (card.junk) return { dim: true, label: '没用', labelCol: '#777' };
  const col = CARD_COL[st.as.col] || CARD_COL[7], mul = '×' + fmt(st.mult);
  if (st.rainbowNow) return { rainbow: true, label: mul + ' 彩虹', labelCol: '#ffe6a0' };
  switch (st.rel) {
    case '合白': return { glow: [255, 255, 255], strong: true, label: mul + ' 合白', labelCol: '#ffffff' };
    case '接上': return { glow: col, label: mul + ' 接上', labelCol: rgba(col) };
    case '断': return { dim: true, label: '断 ×1', labelCol: '#777' };
    case '起手': return { label: '起手' };
    case '放大': return { glow: [230, 230, 240], label: mul };
    default: return { label: st.rel };
  }
}
function tip(ctx, lines) {
  ctx.font = '500 14px "PingFang SC",sans-serif';
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 24, h = lines.length * 22 + 14;
  const x = clamp(mouse.x + 16, 8, 1280 - w - 8), y = clamp(mouse.y - h - 10, 8, 720 - h - 8);
  ctx.fillStyle = 'rgba(16,16,20,.94)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(190,160,110,.6)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  lines.forEach((l, i) => txt(ctx, l, x + 12, y + 18 + i * 22, 14, '#e8e2d4', 'left', 500));
}
function wrap(ctx, s, x, y, w, size, col = '#d8d0c0') {
  ctx.font = `500 ${size}px "PingFang SC",sans-serif`;
  let line = '', yy = y;
  for (const ch of s) { if (ctx.measureText(line + ch).width > w) { txt(ctx, line, x, yy, size, col, 'center', 500); line = ''; yy += size + 6; } line += ch; }
  if (line) txt(ctx, line, x, yy, size, col, 'center', 500);
}

// ---------- 界面 ----------
function drawBattleUI(ctx) {
  const b = BT.b, mon = b.mon, planning = BT.phase === 'plan';
  const prev = BT.phase === 'cast' && BT.plan ? BT.plan : plan(run, b);
  // 心、挡一下
  heartRow(ctx, 24, 22, 6, run.hearts, run.maxHearts, BT.heartBreak);
  if (b.shield) {
    const sx = 24 + Math.ceil(run.maxHearts) * 44 + 4;
    ctx.fillStyle = '#c69a62'; ctx.fillRect(sx, 20, 34, 28); ctx.fillStyle = '#2a1e12'; ctx.fillRect(sx + 2, 22, 30, 24);
    txt(ctx, '挡' + (b.shield > 1 ? '×' + b.shield : ''), sx + 17, 35, 13, '#e8c890', 'center', 700);
  }
  // 这一次施法的总伤害
  if (BT.castTotal > 0 || BT.phase === 'cast') {
    const done = BT.phase !== 'cast';
    txt(ctx, '这次施法', 640, 20, 13, done ? 'rgba(164,156,140,.6)' : '#a49c8c');
    ctx.font = `900 ${done ? 40 : 48}px "PingFang SC",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(0,0,0,.8)'; ctx.strokeText(fmt(BT.castShown), 640, 54);
    ctx.fillStyle = done ? 'rgba(255,241,208,.7)' : '#fff1d0'; ctx.fillText(fmt(BT.castShown), 640, 54);
  }
  relicRow(ctx, 24, 62, run.relics);
  txt(ctx, `第 ${b.turn} 回合`, 1264, 24, 16, '#d8d0c0', 'right');
  btn(ctx, L.escape, '逃跑', planning && canFlee(), inRect(mouse, L.escape));
  btn(ctx, L.lobby, '回大厅', planning, inRect(mouse, L.lobby));
  drawMonsterHead(ctx, b);
  drawWheel(ctx, prev);
  drawPileIcon(ctx, L.discard, b.discard.length, '弃牌堆');
  drawPileIcon(ctx, L.drawPile, b.draw.length, `下回合摸 ${drawCount(run, b.turn + 1)}`);
  // 链
  if (stripVisible()) {
    const base = BT.phase === 'cast' ? BT.plan : prev;
    let head = `预计 ${fmt(base.total)}`;
    if (mon.rootMax && BT.phase !== 'cast' && mon.roots > 0) head += base.total <= mon.roots ? `　· 打不穿根须（${fmt(mon.roots)}）` : `　· 根须先挡掉 ${fmt(mon.roots)}`;
    if (planning && BT.hover >= 0 && b.hand[BT.hover] && !b.hand[BT.hover].instant) head += `  →  ${fmt(plan(run, b, [...b.line, b.hand[BT.hover]]).total)}`;
    ctx.fillStyle = 'rgba(10,10,14,.55)'; ctx.fillRect(250, L.stripY - 102, 780, 172);
    txt(ctx, head, 640, L.stripY - 86, 15, '#efe4cc', 'center', 700);
    if (planning) txt(ctx, '暴击另算 · 点链里的牌放回去', 1020, L.stripY - 86, 11, 'rgba(200,190,170,.5)', 'right', 500);
    if (!b.line.length) txt(ctx, '点手里的牌排进这里（也能拖）', 640, L.stripY, 15, 'rgba(230,220,200,.5)');
    b.line.forEach((c, i) => {
      if (BT.phase === 'cast' && i <= (BT.flownUpTo ?? -1)) return;
      const p = BT.pos.get(c); if (!p) return;
      const st = base.states[i], hi = BT.phase === 'cast' && i === BT.ci;
      drawCard(ctx, c, p.x, p.y - (hi ? 8 : 0), L.cw * p.s, L.ch * p.s, { hi, glow: hi ? [255, 240, 200] : null, dim: st && st.rel === '断' && !hi });
      if (st) {
        const mc = st.rel === '断' ? '#888' : st.rel === '合白' ? '#fff' : st.rainbow ? '#ffe6a0' : '#d8d0c0';
        txt(ctx, '×' + fmt(st.mult), p.x, p.y - L.sh / 2 - 12, 13, mc, 'center', 800);
        txt(ctx, fmt(st.total), p.x, p.y + L.sh / 2 + 12, 12, '#d8d0c0', 'center', 600);
      }
    });
    if (planning && b.line.length) { const u = undoRect(b.line.length); btn(ctx, u, '全放回去', true, inRect(mouse, u)); }
  }
  if (planning && !stripVisible()) txt(ctx, '点手里的牌排进链 · 牌攒得越多，一口气打得越狠 · 空格施法', 640, L.stripY + 6, 14, 'rgba(220,210,190,.42)', 'center', 500);
  // 手牌 + 接链提示
  b.hand.forEach((c, i) => {
    if (BT.drag && BT.drag.card === c) return;
    const p = BT.pos.get(c); if (!p || p.delay > 0) return;
    let o = { rot: p.r, alpha: p.a };
    if (planning) {
      const st = c.instant ? null : plan(run, b, [...b.line, c]).states.at(-1);
      o = { ...o, ...hintStyle(c, c.instant ? {} : st) };
      if (o.label && (b.line.length || c.instant || c.junk)) txt(ctx, o.label, p.x, p.y + L.ch / 2 * p.s + 12, 13, o.labelCol || '#efe4cc', 'center', 700);
    }
    drawCard(ctx, c, p.x, p.y, L.cw * p.s, L.ch * p.s, o);
  });
  const empty = !b.line.length;
  btn(ctx, L.cast, BT.phase === 'cast' ? '施法中…' : empty ? '攒着' : '施法', planning, inRect(mouse, L.cast), planning ? (empty ? '不出牌，结束回合' : '空格') : '');
  for (const f of BT.flying) {
    const t = smooth(f.t);
    drawCard(ctx, f.card, lerp(f.x, L.discard.x, t), lerp(f.y, L.discard.y, t) - Math.sin(t * Math.PI) * 60, L.cw * lerp(.66, .45, t), L.ch * lerp(.66, .45, t), { alpha: 1 - t * .6, rot: t * 2 });
  }
  for (const f of BT.incoming) {   // 怪塞过来的牌：从怪身上飞进牌堆
    if (f.t < 0) continue;
    const t = smooth(f.t);
    drawCard(ctx, f.card, lerp(f.x, L.drawPile.x, t), lerp(f.y, L.drawPile.y, t) - Math.sin(t * Math.PI) * 90, L.cw * lerp(.8, .45, t), L.ch * lerp(.8, .45, t), { alpha: 1 - t * .3, rot: t * -1.5 });
  }
  if (BT.drag) drawCard(ctx, BT.drag.card, mouse.x, mouse.y, L.cw * 1.08, L.ch * 1.08, { rot: 0 });
  for (const q of BT.nums) drawNumber(ctx, q);
  if (BT.cold > 0) {   // 挨打：四周冷色一闪
    const g = ctx.createRadialGradient(640, 360, 200, 640, 360, 760);
    g.addColorStop(0, 'rgba(150,190,255,0)'); g.addColorStop(1, `rgba(170,205,255,${BT.cold * .45})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
  }
  if (BT.flash > 0) {
    const g = ctx.createLinearGradient(0, 0, 1280, 720);
    LAMP_COL.forEach((c, i) => g.addColorStop(i / 5, rgba(c, BT.flash * .3)));
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
  }
  if (BT.banner) {   // 在怪和链中间；底下垫一条暗带，压着大个子的怪也看得清
    const a = Math.min(1, BT.banner.t * 5, (2 - BT.banner.t) * 2);
    ctx.globalAlpha = a; textBand(ctx, BT.banner.text, 352, 26); txt(ctx, BT.banner.text, 640, 352, 26, rgba(BT.banner.col), 'center', 800); ctx.globalAlpha = 1;
  }
  if (BT.toast && (planning || BT.phase === 'pass')) {
    const a = Math.min(1, BT.toast.t * 4, (2.2 - BT.toast.t) * 2);
    ctx.globalAlpha = a; textBand(ctx, BT.toast.text, 394, 18); txt(ctx, BT.toast.text, 640, 394, 18, '#d8d0c0', 'center', 600); ctx.globalAlpha = 1;
  }
  // 鼠标提示
  if (planning && !BT.drag && !overlayOpen()) {
    const rk = relicAt(mouse, 24, 62, run.relics);
    if (rk) tip(ctx, relicTip(rk));
    else if (BT.monRect && inRect(mouse, BT.monRect)) tip(ctx, [`${mon.name}　血 ${fmt(mon.hp)} / ${fmt(mon.maxHp)}`, `${mon.traitName}：${mon.traitText}`, `倒计时 ${mon.countdown}：每回合结束减一，到 0 出手，打掉${heartWord(mon.atk)}心`].concat(mon.elite ? ['凶：血是平常的三倍，多打半颗心'] : []));
    else if (Math.hypot(mouse.x - L.drawPile.x, mouse.y - L.drawPile.y) < 34) tip(ctx, [`牌堆：还剩 ${b.draw.length} 张`, `下回合摸 ${drawCount(run, b.turn + 1)} 张（手牌最多 ${R.handMax} 张）`]);
    else if (Math.hypot(mouse.x - L.discard.x, mouse.y - L.discard.y) < 34) tip(ctx, ['弃牌堆：打出去的牌放这里', '牌堆摸空了就洗回去接着摸']);
    else if (Math.hypot(mouse.x - L.wheel.x, mouse.y - L.wheel.y) < 58) tip(ctx, ['色环：链里打过的颜色会亮', '跟上一张有同一种宝石 → 接上 ×2', '合起来红绿蓝齐全 → 合白 ×2，再补一发白光', '都不沾 → 断，倍率回 ×1', '一条链凑齐六色 → 彩虹，之后每接一张 ×3']);
    else if (mouse.x > 150 && mouse.x < 220 && mouse.y > 580 && mouse.y < 700) {
      const j = clamp(Math.floor((mouse.y - 576) / 40), 0, 2), g = run.gems[j];
      tip(ctx, [`${GEM_NAMES[j]}宝石 Lv${g.level}：${GEM_NAMES[j]}色每发 ×${+gemPow(run, j).toFixed(2)}`, `再打出 ${gemNeed(g.level) - g.exp} 发${GEM_NAMES[j]}色升一级`]);
    } else if (BT.hover >= 0 && b.hand[BT.hover]) tip(ctx, [b.hand[BT.hover].name + '：' + b.hand[BT.hover].text]);
    else if (inRect(mouse, L.escape) && !canFlee()) tip(ctx, [BT.b.mon.guard ? '看门的跑不掉，只能打' : '只剩半颗心，逃不动了']);
  }
  if (BT.confirm) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, 1280, 720);
    const lob = BT.confirm.kind === 'lobby';
    txt(ctx, lob ? '回大厅吗？' : '要逃跑吗？', 640, 300, 26, '#efe4cc', 'center', 800);
    txt(ctx, lob ? '这一趟就到这儿' : `丢半颗心，${mon.name}留在原地`, 640, 338, 15, '#a49c8c');
    btn(ctx, BT.confirm.yes, lob ? '回大厅' : '逃跑', true, inRect(mouse, BT.confirm.yes)); btn(ctx, BT.confirm.no, '接着打', true, inRect(mouse, BT.confirm.no));
  }
  if (BT.relicPick) {
    ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, 0, 1280, 720);
    txt(ctx, `${mon.name}身上掉下来几样东西`, 640, 150, 26, '#ffe6b0', 'center', 800);
    txt(ctx, '挑一件带走（零碎这一趟一直有用）', 640, 184, 14, '#a49c8c', 'center', 500);
    BT.relicPick.keys.forEach((k, i) => relicPanel(ctx, k, BT.relicPick.rects[i], inRect(mouse, BT.relicPick.rects[i])));
  }
  if (BT.loot) {
    ctx.fillStyle = 'rgba(0,0,0,.68)'; ctx.fillRect(0, 0, 1280, 720);
    txt(ctx, `打倒了${mon.name}　选一张牌带走`, 640, 190, 26, '#ffe6b0', 'center', 800);
    if (BT.candy) txt(ctx, '水果糖：回了半颗心', 640, 150, 14, '#f0b8a0', 'center', 600);
    BT.loot.cards.forEach((c, i) => {
      const r = BT.loot.rects[i], hot = inRect(mouse, r);
      drawCard(ctx, c, r.x + r.w / 2, r.y + r.h / 2 - (hot ? 8 : 0), r.w, r.h, { glow: hot ? [255, 230, 170] : null });
      wrap(ctx, c.text, r.x + r.w / 2, r.y + r.h + 22, 192, 13);
    });
    btn(ctx, BT.loot.skip, '都不要', true, inRect(mouse, BT.loot.skip));
  }
  if (BT.over) {
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(0, 0, 1280, 720);
    txt(ctx, '心打光了', 640, 320, 34, '#ff9a8a', 'center', 800);
    txt(ctx, '这一趟就到这儿', 640, 360, 15, '#a49c8c');
    btn(ctx, BT.over.btn, '回大厅', true, inRect(mouse, BT.over.btn));
  }
}
