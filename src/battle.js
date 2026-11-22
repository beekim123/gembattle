'use strict';
// 一仗：俯视角。怪在上、主角在下；牌从手里拖进序列，按施法一张张结算。
const TIKO = {};
const SPREADS = [1, .55, .12], FLAPS = [-1, 0, 1];
function tikoModel(si, fi) { const k = si * 3 + fi; if (ART.on && ART.tiko) return ART.tiko[k % ART.tiko.length]; return TIKO[k] || (TIKO[k] = makeTiko(SPREADS[si], FLAPS[fi])); }

const L = {   // UI 布局（按 1280×720 排）
  cw: 88, ch: 124, handY: 612, stripY: 470, sw: 58, sh: 82,
  cast: { x: 1086, y: 556, w: 160, h: 50 }, drawPile: { x: 1214, y: 662 }, discard: { x: 292, y: 662 },
  wheel: { x: 84, y: 636, r: 50 }, escape: { x: 1196, y: 46, w: 68, h: 28 }, lobby: { x: 1112, y: 46, w: 76, h: 28 },
};
const ART_COL = { red: [255, 112, 92], green: [124, 240, 144], blue: [124, 172, 255], white: [255, 255, 255], extra: [255, 164, 84], pure: [176, 228, 255] };
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
        col = mix(col, [64, 62, 52], (1 - smooth(clamp((rr - 14) / 26, 0, 1))) * .55);          // 中间一片踩秃的土
        col = mix(col, [34, 46, 40], smooth(clamp((rr - 52) / 22, 0, 1)) * .8);                  // 边上林下暗
      }
      col = col.map(v => v * (1 - smooth(clamp((rr - 96) / 30, 0, 1)) * .9));                 // 再往外沉进黑里
      const k = (y * CH + x) * 4; im.data[k] = col[0]; im.data[k + 1] = col[1]; im.data[k + 2] = col[2]; im.data[k + 3] = 255;
    }
    gc.putImageData(im, 0, 0);
    const decals = [];
    if (ART.on) {
      artDecorate(gc, cx * CH, cy * CH, r, 3, 14, (x, y) => { const d = Math.hypot(x - AX, (y - AY) * 1.15); return d < 34 || d > 84; });   // 外圈沉进黑里的地方不撒
    }
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
  const b = startFight(run, w.kind);
  const dx = w.x - player.x, dy = w.y - player.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  for (const k of Object.keys(BT)) delete BT[k];
  // 记下在林子里的位置，打完送回来；人挪到空地上
  const back = { x: player.x, y: player.y, h: player.h, view: CAM.view, ux, uy };
  const arena = buildArena((Math.floor(w.hx * 7 + w.hy * 13) >>> 0) || 1);
  for (const c of arena) chunks.set(c.cx + ',' + c.cy, c);
  player.x = AX; player.y = AY + 20;
  Object.assign(BT, {
    b, wisp: w, phase: 'plan', plan: null, drag: null, hover: -1, pos: new Map(), nums: [], shots: [], beams: [], slashes: [], parts: [],
    flying: [], flash: 0, shake: 0, turnDamage: 0, banner: null, t: 0, confirm: false, loot: null, over: null, circle: 0,
    mon: { x: player.x + ux * 38, y: player.y + uy * 38, ro: Math.atan2(-uy, -ux) - Math.PI / 2, lift: 22, alpha: 0, model: tikoModel(0, 1), hit: 0, lunge: 0, ux, uy, dart: 0 },
    center: { x: player.x + ux * 4, y: player.y + uy * 4 }, back, arena,
  });
  player.h = Math.atan2(uy, ux); player.moving = false;
  // 镜头转到最近的直角，怪放在主角正上方：切片不斜着采样，画面清楚
  BT.view = 0; CAM.view = 0;
  { const vx = -Math.sin(BT.view), vy = -Math.cos(BT.view);
    BT.mon.ux = vx; BT.mon.uy = vy; BT.mon.ro = Math.atan2(-vy, -vx) - Math.PI / 2;
    BT.mon.x = player.x + vx * 38; BT.mon.y = player.y + vy * 38;
    BT.center = { x: player.x + vx * 4, y: player.y + vy * 4 }; player.h = Math.atan2(vy, vx);
    CAM.x = BT.center.x; CAM.y = BT.center.y; }
  dealIn(b.hand, 0);
  b.drawn.length = 0;
}
function dealIn(cards, delay0) {
  cards.forEach((c, i) => BT.pos.set(c, { x: L.drawPile.x, y: L.drawPile.y, r: 0, s: .4, a: 0, delay: delay0 + i * .07 }));
}
function banner(text, col = [240, 232, 210]) { BT.banner = { text, col, t: 0 }; }

// ---------- 布局 ----------
function handLayout(n) {
  const out = [], gap = Math.min(80, 720 / Math.max(1, n)), mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    const k = i - mid;
    out.push({ x: 640 + k * gap, y: L.handY + k * k * 1.4, r: k * .04, s: 1 });
  }
  return out;
}
function stripLayout(n) {
  const out = [], gap = Math.min(66, 760 / Math.max(1, n)), x0 = 640 - (n - 1) * gap / 2;
  for (let i = 0; i < n; i++) out.push({ x: x0 + i * gap, y: L.stripY });
  return out;
}
const inRect = (m, r) => m.x >= r.x && m.x <= r.x + r.w && m.y >= r.y && m.y <= r.y + r.h;
function undoRects(n) {
  const sl = stripLayout(Math.max(1, n)), right = (n ? sl[n - 1].x : 640) + L.sw / 2 + 18;
  return { last: { x: right, y: L.stripY - 34, w: 104, h: 30 }, all: { x: right, y: L.stripY + 4, w: 104, h: 30 } };
}
function handHit(m) {
  const b = BT.b, lay = handLayout(b.hand.length);
  for (let i = b.hand.length - 1; i >= 0; i--) {
    const p = lay[i], lift = i === BT.hover ? 30 : 0;
    if (Math.abs(m.x - p.x) < L.cw / 2 && m.y > p.y - L.ch / 2 - lift && m.y < p.y + L.ch / 2) return i;
  }
  return -1;
}
function stripVisible() { return BT.drag || BT.b.line.length > 0 || BT.phase === 'cast'; }

// ---------- 输入 ----------
function battleDown(m) {
  if (BT.over) { if (inRect(m, BT.over.btn)) { BT.over = null; goLobby(); } return; }
  if (BT.loot) {
    const i = BT.loot.rects.findIndex(r => inRect(m, r));
    if (i >= 0) { run.deck.push(BT.loot.cards[i]); profileAddCard(BT.loot.cards[i]); BT.loot = null; leaveBattle('win'); }
    else if (inRect(m, BT.loot.skip)) { BT.loot = null; leaveBattle('win'); }
    return;
  }
  if (BT.confirm) {
    if (inRect(m, BT.confirm.yes)) { const k = BT.confirm.kind; BT.confirm = false; if (k === 'lobby') goLobby(); else leaveBattle('flee'); }
    else if (inRect(m, BT.confirm.no)) BT.confirm = false;
    return;
  }
  if (BT.phase !== 'plan') return;
  if (inRect(m, L.escape)) { BT.confirm = { kind: 'flee', yes: { x: 520, y: 380, w: 110, h: 40 }, no: { x: 650, y: 380, w: 110, h: 40 } }; return; }
  if (inRect(m, L.lobby)) { BT.confirm = { kind: 'lobby', yes: { x: 520, y: 380, w: 110, h: 40 }, no: { x: 650, y: 380, w: 110, h: 40 } }; return; }
  if (inRect(m, L.cast)) { castStart(); return; }
  const u = undoRects(BT.b.line.length);
  if (BT.b.line.length && inRect(m, u.last)) { const c = BT.b.line.at(-1); undoLast(BT.b); bumpFromStrip(c); return; }
  if (BT.b.line.length && inRect(m, u.all)) { const cs = [...BT.b.line]; undoAll(BT.b); cs.forEach(bumpFromStrip); return; }
  const i = handHit(m);
  if (i >= 0) BT.drag = { card: BT.b.hand[i], dx: 0, dy: 0 };
}
function bumpFromStrip(c) { const p = BT.pos.get(c); if (p) p.s = .66; }
function battleMove(m) {
  if (BT.phase === 'plan' && !BT.drag && !BT.loot && !BT.confirm) BT.hover = handHit(m);
}
function battleUp(m) {
  const d = BT.drag; BT.drag = null;
  if (!d || BT.phase !== 'plan') return;
  if (m.y > 560) return;   // 没拖出手牌区，放回去
  const b = BT.b, i = b.hand.indexOf(d.card); if (i < 0) return;
  const p = BT.pos.get(d.card); if (p) { p.x = m.x; p.y = m.y; }
  if (d.card.instant) { playInstant(b, i); flyToDiscard(d.card, m.x, m.y); banner(d.card.name + '：' + d.card.text, [214, 170, 110]); }
  else { queueCard(b, i); if (p) p.s = 1; }
  BT.hover = -1;
}

// ---------- 施法 ----------
function castStart() {
  const b = BT.b;
  BT.plan = startCast(b); BT.phase = 'cast'; BT.ci = -1; BT.castWait = false; BT.turnDamage = 0;
  BT.castCards = [...b.line];
  BT.groups = BT.plan.states.map(() => []);
  for (const s of BT.plan.segments) BT.groups[s.cardIndex].push(s);
  BT.circle = 0.001;
  nextCard();
}
function nextCard() {
  BT.ci++;
  if (BT.ci >= BT.plan.states.length) { BT.castWait = true; BT.waitT = 0; return; }
  const segs = BT.groups[BT.ci];
  Object.assign(BT, { fire: segs, fi: 0, fdur: clamp(segs.length * .028, .18, .6), ft: 0 });
  const st = BT.plan.states[BT.ci];
  if (st.rainbow) { BT.flash = 1; banner('彩虹 ×3', [255, 236, 170]); }
  else if (st.relation === '补色') banner('合白', [255, 255, 255]);
}
function gemPos(i, t) { return gemOrbit(player, t)[i]; }
function fire(seg) {
  const m = BT.mon, white = seg.white;
  const from = white ? { x: m.x, y: m.y, z: m.lift + 52 } : seg.gemColor >= 0 ? gemPos(seg.gemColor, BT.t) : { x: player.x, y: player.y, z: 12 };
  const to = { x: m.x + (Math.random() - .5) * 6, y: m.y + (Math.random() - .5) * 4, z: m.lift + 18 + (Math.random() - .5) * 8 };
  BT.shots.push({ seg, from, to, t: 0, dur: white ? .1 : .17 });
  if (white) BT.beams.push({ t: 0 });
}
function hitArrive(s) {
  const r = applyHit(run, BT.b, BT.plan, s.seg);
  BT.turnDamage = BT.plan.damage;
  BT.mon.hit = 1;
  const p = proj(s.to.x, s.to.y, s.to.z);
  const { x: ux, y: uy } = w2ui(p);
  BT.nums.push({ v: r.damage, n: s.seg.count, crit: s.seg.crit, col: ART_COL[s.seg.art] || [255, 255, 255], x: ux + (Math.random() - .5) * 120, y: uy + (Math.random() - .5) * 50, t: 0 });
  if (BT.nums.length > 90) BT.nums.shift();
  for (let i = 0; i < 3; i++) BT.parts.push({ x: s.to.x, y: s.to.y, z: s.to.z, vx: (Math.random() - .5) * 30, vy: (Math.random() - .5) * 30, vz: Math.random() * 30, t: 0, c: ART_COL[s.seg.art] || [255, 255, 255] });
}
function flyToDiscard(card, x, y) {
  const p = BT.pos.get(card) || { x, y };
  BT.flying.push({ card, x: x ?? p.x, y: y ?? p.y, t: 0 });
  BT.pos.delete(card);
}
function finishTurnUI() {
  const b = BT.b, res = finishTurn(run, b);
  BT.circle = 0;
  if (b.levelUps.length) banner(b.levelUps.map(u => ['红', '绿', '蓝'][u.color] + '宝石升到 Lv ' + u.to).join('　'), [255, 230, 160]);
  if (res === 'next') { BT.phase = 'plan'; dealIn(b.drawn, .1); b.drawn.length = 0; }
  else if (res === 'win') { BT.phase = 'dying'; BT.dieT = 0; }
  else if (res === 'dead') { BT.phase = 'done'; BT.over = { btn: { x: 560, y: 400, w: 160, h: 44 } }; }
  else { BT.phase = 'done'; banner('提可飞走了'); setTimeout(() => leaveBattle('flee'), 1200); }
}

// ---------- 每帧 ----------
function updateBattle(dt) {
  const b = BT.b, m = BT.mon;
  BT.t += dt;
  CAM.x = lerp(CAM.x, BT.center.x, Math.min(1, dt * 4)); CAM.y = lerp(CAM.y, BT.center.y, Math.min(1, dt * 4));
  let dv = BT.view - CAM.view; dv = Math.atan2(Math.sin(dv), Math.cos(dv)); CAM.view += dv * Math.min(1, dt * 4);
  // 怪：悬着、扇翅；灯越多翅膀裹得越紧；偶尔忽左忽右闪一下
  const n = lampCount(b.lamps), si = n <= 1 ? 0 : n <= 3 ? 1 : 2, fi = [0, 1, 2, 1][Math.floor(BT.t * 9) % 4];
  if (BT.phase !== 'dying' && BT.phase !== 'done') m.alpha = Math.min(1, m.alpha + dt * 2.5);
  m.model = tikoModel(si, fi);
  m.dart = Math.max(0, m.dart - dt); if (Math.random() < dt * .25) { m.dart = .25; m.dartDir = Math.random() < .5 ? -1 : 1; }
  const side = Math.sin(m.dart / .25 * Math.PI) * 5 * (m.dartDir || 1);
  m.lift = 14 + Math.sin(BT.t * 2.4) * 2;
  const baseX = player.x + m.ux * 38, baseY = player.y + m.uy * 38;
  m.x = baseX - m.ux * 30 * m.lunge + (-m.uy) * side; m.y = baseY - m.uy * 30 * m.lunge + m.ux * side;
  m.hit = Math.max(0, m.hit - dt * 5);
  // 牌的位置
  const k = 1 - Math.exp(-dt * 14);
  const lay = handLayout(b.hand.length);
  b.hand.forEach((c, i) => {
    let p = BT.pos.get(c); if (!p) { p = { x: lay[i].x, y: lay[i].y, r: 0, s: 1, a: 1, delay: 0 }; BT.pos.set(c, p); }
    if (p.delay > 0) { p.delay -= dt; return; }
    const tg = lay[i], lift = i === BT.hover ? 30 : 0, sc = i === BT.hover ? 1.1 : 1;
    if (BT.drag && BT.drag.card === c) { p.x = mouse.x; p.y = mouse.y; p.r = 0; p.s = 1; p.a = 1; return; }
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
      const due = BT.fire.length ? Math.min(BT.fire.length, Math.ceil(BT.ft / BT.fdur * BT.fire.length)) : 0;
      while (BT.fi < due) fire(BT.fire[BT.fi++]);
      if (BT.fi >= BT.fire.length && BT.ft >= Math.max(BT.fdur, .22) + .12) {
        const c = BT.castCards[BT.ci]; flyToDiscard(c); BT.flownUpTo = BT.ci;
        nextCard();
      }
    } else if (!BT.shots.length) {
      BT.waitT += dt;
      if (BT.waitT > .35) {
        const atk = endCast(run, b, BT.plan);
        BT.flownUpTo = -1;
        if (atk) { BT.phase = 'attack'; BT.atkT = 0; BT.struck = false; }
        else finishTurnUI();
      }
    }
  }
  if (BT.phase === 'attack') {
    BT.atkT += dt; const a = BT.atkT;
    m.lunge = a < .32 ? smooth(a / .32) : a < .7 ? 1 - smooth((a - .32) / .38) : 0;
    if (!BT.struck && a >= .3) {
      BT.struck = true;
      const before = run.hearts, r = attack(run, b);
      if (r.blocked) banner('坚盾术挡住了提可的攻击', [214, 170, 110]);
      else {
        BT.shake = 1;
        for (let i = 0; i < 3; i++) BT.slashes.push({ x: 520 + i * 90 + Math.random() * 40, y: 200 + Math.random() * 80, t: 0 });
        BT.heartBreak = { i: Math.ceil(before) - 1, t: 0 };
      }
    }
    if (a > 1.1) { m.lunge = 0; finishTurnUI(); }
  }
  if (BT.phase === 'dying') {
    BT.dieT += dt; m.alpha = Math.max(0, 1 - BT.dieT / .9);
    if (Math.random() < .8) BT.parts.push({ x: m.x + (Math.random() - .5) * 30, y: m.y + (Math.random() - .5) * 10, z: m.lift + Math.random() * 30, vx: 0, vy: 0, vz: 12 + Math.random() * 20, t: 0, c: [120, 40, 50] });
    if (BT.dieT > 1.3) { BT.phase = 'done'; const cs = lootChoices(run); BT.loot = { cards: cs, rects: cs.map((c, i) => ({ x: 640 + (i - 1) * 190 - 66, y: 250, w: 132, h: 186 })), skip: { x: 580, y: 520, w: 120, h: 38 } }; }
  }
  // 弹道、粒子、数字
  for (let i = BT.shots.length - 1; i >= 0; i--) { const s = BT.shots[i]; s.t += dt / s.dur; if (s.t >= 1) { hitArrive(s); BT.shots.splice(i, 1); } }
  for (let i = BT.parts.length - 1; i >= 0; i--) { const p = BT.parts[i]; p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz -= 40 * dt; if (p.t > .6) BT.parts.splice(i, 1); }
  for (let i = BT.nums.length - 1; i >= 0; i--) { const q = BT.nums[i]; q.t += dt; q.y -= 40 * dt; if (q.t > .9) BT.nums.splice(i, 1); }
  for (let i = BT.beams.length - 1; i >= 0; i--) { BT.beams[i].t += dt * 4; if (BT.beams[i].t > 1) BT.beams.splice(i, 1); }
  for (let i = BT.slashes.length - 1; i >= 0; i--) { BT.slashes[i].t += dt * 1.6; if (BT.slashes[i].t > 1) BT.slashes.splice(i, 1); }
  if (BT.heartBreak) { BT.heartBreak.t += dt; if (BT.heartBreak.t > .8) BT.heartBreak = null; }
  BT.flash = Math.max(0, BT.flash - dt * 2); BT.shake = Math.max(0, BT.shake - dt * 3);
  if (BT.banner) { BT.banner.t += dt; if (BT.banner.t > 2) BT.banner = null; }
}

// 世界层里的战斗特效：魔法阵（平放在怪头顶）、弹道、白光、粒子
function battleGroundFx(ctx) {
  const m = BT.mon;
  // 怪脚下一圈冷光影
}
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
    const c = ART_COL[s.seg.art] || [255, 255, 255];
    for (let k = 0; k < 3; k++) {
      const tt = Math.max(0, s.t - k * .12);
      const x = lerp(s.from.x, s.to.x, tt), y = lerp(s.from.y, s.to.y, tt), z = lerp(s.from.z, s.to.z, tt) + Math.sin(tt * Math.PI) * 6;
      const p = proj(x, y, z);
      ctx.fillStyle = rgba(k ? c : mix(c, [255, 255, 255], .6), k ? .5 / k : 1);
      ctx.fillRect(Math.round(p.x), Math.round(p.y), k ? 1 : 2, k ? 1 : 2);
    }
  }
  for (const p of BT.parts) { const q = proj(p.x, p.y, p.z); ctx.fillStyle = rgba(p.c, 1 - p.t / .6); ctx.fillRect(Math.round(q.x), Math.round(q.y), 1, 1); }
  // 尾巴上的光点
  if (m.alpha > 0) {
    const p = proj(m.x, m.y, m.lift + 2);
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 8);
    g.addColorStop(0, `rgba(255,200,110,${.5 * m.alpha})`); g.addColorStop(1, 'rgba(255,200,110,0)');
    ctx.fillStyle = g; ctx.fillRect(p.x - 8, p.y - 8, 16, 16);
  }
  ctx.globalCompositeOperation = 'source-over';
}

// ---------- UI ----------
function txt(ctx, s, x, y, size, col = '#e8e2d4', align = 'center', weight = 600) {
  ctx.font = `${weight} ${size}px "PingFang SC",sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillStyle = col; ctx.fillText(s, x, y);
}
function btn(ctx, r, label, on = true, hot = false) {
  ctx.fillStyle = on ? (hot ? 'rgba(70,64,52,.95)' : 'rgba(34,32,30,.92)') : 'rgba(30,30,30,.5)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = on ? 'rgba(214,180,120,.9)' : 'rgba(120,120,120,.4)'; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
  txt(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 1, Math.min(20, r.h * .48), on ? '#efe4cc' : '#888');
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
function drawWheel(ctx, prev) {
  const { x, y, r } = L.wheel, lamps = prev.lamps, cur = prev.cursor;
  ctx.fillStyle = 'rgba(14,14,18,.85)'; ctx.beginPath(); ctx.arc(x, y, r + 8, 0, TAU); ctx.fill();
  for (let i = 0; i < 6; i++) {
    const a0 = -Math.PI / 2 + (i - .5) * TAU / 6 + .05, a1 = a0 + TAU / 6 - .1, on = lamps & (1 << i);
    ctx.beginPath(); ctx.arc(x, y, r, a0, a1); ctx.arc(x, y, r - 14, a1, a0, true); ctx.closePath();
    ctx.fillStyle = on ? rgba(LAMP_COL[i]) : rgba(mix(LAMP_COL[i], [10, 10, 14], .78)); ctx.fill();
    if (on) { ctx.shadowColor = rgba(LAMP_COL[i]); ctx.shadowBlur = 10; ctx.fill(); ctx.shadowBlur = 0; }
    if (cur === i) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); }
  }
  if (cur === 6) { ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(x, y, r - 16, 0, TAU); ctx.fill(); }
  txt(ctx, '×' + formatCN(prev.multiplier), x, y + 1, 22, '#fff4dc', 'center', 700);
  // 三颗宝石的环形经验
  for (let j = 0; j < 3; j++) {
    const gx = 168, gy = 596 + j * 40, g = run.gems[j], pend = BT.b.pendingGemExp[j];
    const f = clamp((g.exp + pend) / gemThreshold(g.level), 0, 1);
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.beginPath(); ctx.arc(gx, gy, 13, 0, TAU); ctx.stroke();
    ctx.strokeStyle = rgba(GEM_COLORS[j]); ctx.beginPath(); ctx.arc(gx, gy, 13, -Math.PI / 2, -Math.PI / 2 + f * TAU); ctx.stroke();
    ctx.fillStyle = rgba(GEM_COLORS[j]); ctx.beginPath(); ctx.moveTo(gx, gy - 6); ctx.lineTo(gx + 5, gy); ctx.lineTo(gx, gy + 6); ctx.lineTo(gx - 5, gy); ctx.fill();
    txt(ctx, 'Lv ' + g.level, gx + 22, gy + 1, 14, '#d8d0c0', 'left');
  }
}
function drawPileIcon(ctx, p, n, label) {
  for (let i = Math.min(3, n) - 1; i >= 0; i--) {
    ctx.fillStyle = 'rgb(28,26,34)'; ctx.fillRect(p.x - 22 + i * 2, p.y - 30 - i * 2, 44, 60);
    ctx.strokeStyle = 'rgba(190,160,110,.8)'; ctx.lineWidth = 2; ctx.strokeRect(p.x - 21 + i * 2, p.y - 29 - i * 2, 42, 58);
  }
  if (!n) { ctx.strokeStyle = 'rgba(190,160,110,.3)'; ctx.strokeRect(p.x - 21, p.y - 29, 42, 58); }
  txt(ctx, String(n), p.x, p.y, 18, '#efe4cc', 'center', 700);
  txt(ctx, label, p.x, p.y + 44, 12, '#a49c8c');
}
function drawBattleUI(ctx) {
  const b = BT.b, mon = b.monster, planning = BT.phase === 'plan';
  const prev = BT.phase === 'cast' && BT.plan ? BT.plan : preview(b);
  // 心
  for (let i = 0; i < R.hearts; i++) {
    let x = 24 + i * 44, y = 22;
    if (BT.heartBreak && BT.heartBreak.i === i) x += Math.sin(BT.heartBreak.t * 60) * 4 * (1 - BT.heartBreak.t);
    pixHeart(ctx, x, y, 6, clamp(run.hearts - i, 0, 1));
  }
  if (b.shield) { ctx.fillStyle = '#c69a62'; ctx.fillRect(24 + R.hearts * 44, 22, 22, 26); txt(ctx, '盾', 35 + R.hearts * 44, 36, 13, '#2a1e12'); }
  // 本回合总伤害
  txt(ctx, '本回合伤害', 640, 22, 13, '#a49c8c');
  const dmg = BT.turnDamage;
  txt(ctx, BT.phase === 'cast' ? String(Math.round(dmg)) : formatCN(dmg), 640, 52, 34, '#fff1d0', 'center', 800);
  // 回合、逃跑
  txt(ctx, `第 ${b.turn} 回合`, 1264, 24, 16, '#d8d0c0', 'right');
  btn(ctx, L.escape, '逃跑', planning, inRect(mouse, L.escape));
  btn(ctx, L.lobby, '回大厅', planning, inRect(mouse, L.lobby));
  // 怪头上：名字、血条、倒计时（不加大框）
  const m = BT.mon;
  if (m.alpha > .05) {
    const hp = w2ui(proj(m.x, m.y, m.lift + m.model.sz + 2)), ux = hp.x, uy = hp.y - 18;
    txt(ctx, mon.name, ux - 58, uy - 14, 15, '#efe4cc', 'left', 700);
    txt(ctx, mon.traitName, ux + 58, uy - 14, 12, '#9fb8e8', 'right');
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(ux - 60, uy - 3, 120, 8);
    ctx.fillStyle = '#c84a42'; ctx.fillRect(ux - 59, uy - 2, 118 * mon.hp / mon.maxHp, 6);
    const cd = mon.countdown, red = cd <= 1, pulse = red ? 1 + Math.sin(BT.t * 10) * .12 : 1;
    ctx.fillStyle = red ? '#b02a24' : 'rgba(30,30,36,.9)'; ctx.beginPath(); ctx.arc(ux + 76, uy + 1, 11 * pulse, 0, TAU); ctx.fill();
    ctx.strokeStyle = red ? '#ffb0a0' : '#8c8478'; ctx.lineWidth = 1.5; ctx.stroke();
    txt(ctx, String(cd), ux + 76, uy + 2, 13, '#fff', 'center', 700);
    BT.monRect = { x: ux - 70, y: uy - 20, w: 160, h: 130 };
  }
  drawWheel(ctx, prev);
  drawPileIcon(ctx, L.discard, b.discard.length, '弃牌堆');
  drawPileIcon(ctx, L.drawPile, b.draw.length, '牌堆');
  // 序列
  if (stripVisible()) {
    const base = BT.phase === 'cast' ? BT.plan : preview(b);
    let head = `保底 ${formatCN(base.total)}　暴击最高 ${formatCN(base.max)}`;
    if (planning && BT.hover >= 0 && b.hand[BT.hover] && !b.hand[BT.hover].instant) {
      const pv = preview(b, [...b.line, b.hand[BT.hover]]);
      head = `保底 ${formatCN(base.total)} → ${formatCN(pv.total)}　暴击最高 ${formatCN(pv.max)}`;
    }
    ctx.fillStyle = 'rgba(10,10,14,.55)'; ctx.fillRect(250, L.stripY - 74, 780, 140);
    txt(ctx, head, 640, L.stripY - 60, 15, '#efe4cc');
    if (!b.line.length) txt(ctx, '把牌拖到这里排进序列', 640, L.stripY, 15, 'rgba(230,220,200,.5)');
    b.line.forEach((c, i) => {
      if (BT.phase === 'cast' && i <= (BT.flownUpTo ?? -1)) return;
      const p = BT.pos.get(c); if (!p) return;
      const st = base.states[i], hi = BT.phase === 'cast' && i === BT.ci;
      drawCard(ctx, c, p.x, p.y - (hi ? 8 : 0), L.cw * p.s, L.ch * p.s, { hi, glow: hi ? [255, 240, 200] : null });
      if (st) txt(ctx, formatCN(st.total), p.x, p.y + L.sh / 2 + 12, 12, '#d8d0c0');
    });
    if (planning && b.line.length) {
      const u = undoRects(b.line.length);
      btn(ctx, u.last, '撤销上一步', true, inRect(mouse, u.last)); btn(ctx, u.all, '撤销全部', true, inRect(mouse, u.all));
    }
  }
  // 手牌 + 接链提示
  b.hand.forEach((c, i) => {
    if (BT.drag && BT.drag.card === c) return;
    const p = BT.pos.get(c); if (!p || p.delay > 0) return;
    let o = { rot: p.r, alpha: p.a };
    if (planning) {
      const pv = preview(b, [...b.line, c]), st = pv.states.at(-1);
      o = { ...o, ...hintStyle(c, st) };
      if (o.label) txt(ctx, o.label, p.x, p.y + L.ch / 2 * p.s + 12, 13, o.labelCol || '#efe4cc', 'center', 700);
    }
    drawCard(ctx, c, p.x, p.y, L.cw * p.s, L.ch * p.s, o);
  });
  btn(ctx, L.cast, BT.phase === 'cast' ? '施法中…' : '施法', planning, inRect(mouse, L.cast));
  for (const f of BT.flying) {
    const t = smooth(f.t);
    drawCard(ctx, f.card, lerp(f.x, L.discard.x, t), lerp(f.y, L.discard.y, t) - Math.sin(t * Math.PI) * 60, L.cw * lerp(.66, .45, t), L.ch * lerp(.66, .45, t), { alpha: 1 - t * .6, rot: t * 2 });
  }
  if (BT.drag) drawCard(ctx, BT.drag.card, mouse.x, mouse.y, L.cw * 1.08, L.ch * 1.08, { rot: 0 });
  // 伤害数字（一发一发写完整）
  for (const q of BT.nums) {
    const a = q.t < .7 ? 1 : 1 - (q.t - .7) / .2, sz = q.crit ? 30 : 21;
    ctx.globalAlpha = a;
    ctx.font = `900 ${sz}px "PingFang SC",sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.85)';
    const s = q.n > 1 ? `${q.v}×${q.n}` : String(q.v);
    ctx.strokeText(s, q.x, q.y); ctx.fillStyle = q.crit ? '#ffcc4a' : rgba(q.col); ctx.fillText(s, q.x, q.y);
    ctx.globalAlpha = 1;
  }
  for (const s of BT.slashes) {
    ctx.strokeStyle = `rgba(150,20,30,${(1 - s.t) * .8})`; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(s.x - 90, s.y - 70); ctx.lineTo(s.x + 90, s.y + 110); ctx.stroke();
  }
  if (BT.flash > 0) {
    const g = ctx.createLinearGradient(0, 0, 1280, 720);
    LAMP_COL.forEach((c, i) => g.addColorStop(i / 5, rgba(c, BT.flash * .35)));
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1280, 720);
  }
  if (BT.banner) {
    const a = Math.min(1, BT.banner.t * 5, (2 - BT.banner.t) * 2);
    ctx.globalAlpha = a; txt(ctx, BT.banner.text, 640, 150, 26, rgba(BT.banner.col), 'center', 800); ctx.globalAlpha = 1;
  }
  // 鼠标提示
  if (planning && !BT.drag && !BT.loot && !BT.confirm) {
    if (BT.monRect && inRect(mouse, BT.monRect)) tip(ctx, [`${mon.name}　血量 ${Math.round(mon.hp)} / ${mon.maxHp}`, `特性 躲光：${mon.rule}`, `这回合少受 ${lampCount(b.lamps)} 成伤害`, `倒计时 ${mon.countdown}：到 0 时攻击，打掉半颗心`]);
    else if (Math.hypot(mouse.x - L.drawPile.x, mouse.y - L.drawPile.y) < 34) tip(ctx, [`牌堆：还剩 ${b.draw.length} 张`]);
    else if (Math.hypot(mouse.x - L.discard.x, mouse.y - L.discard.y) < 34) tip(ctx, ['弃牌堆：打出去的牌放这里', '牌堆抽空了就洗回去接着抽']);
    else if (BT.hover >= 0 && b.hand[BT.hover]) tip(ctx, [b.hand[BT.hover].name + '：' + b.hand[BT.hover].text]);
  }
  if (BT.confirm) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, 1280, 720);
    const lob = BT.confirm.kind === 'lobby';
    txt(ctx, lob ? '回大厅吗？' : '要逃跑吗？', 640, 300, 26, '#efe4cc', 'center', 800);
    txt(ctx, lob ? '这一趟结束，路上拿到的牌留着' : '提可会留在原地，血回满', 640, 338, 15, '#a49c8c');
    btn(ctx, BT.confirm.yes, lob ? '回大厅' : '逃跑', true, inRect(mouse, BT.confirm.yes)); btn(ctx, BT.confirm.no, '接着打', true, inRect(mouse, BT.confirm.no));
  }
  if (BT.loot) {
    ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(0, 0, 1280, 720);
    txt(ctx, '打倒了提可　选一张牌带走', 640, 200, 26, '#ffe6b0', 'center', 800);
    BT.loot.cards.forEach((c, i) => {
      const r = BT.loot.rects[i], hot = inRect(mouse, r);
      drawCard(ctx, c, r.x + r.w / 2, r.y + r.h / 2 - (hot ? 8 : 0), r.w, r.h, { glow: hot ? [255, 230, 170] : null });
      wrap(ctx, c.text, r.x + r.w / 2, r.y + r.h + 22, 170, 13);
    });
    btn(ctx, BT.loot.skip, '都不要', true, inRect(mouse, BT.loot.skip));
  }
  if (BT.over) {
    ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(0, 0, 1280, 720);
    txt(ctx, '心打光了', 640, 320, 34, '#ff9a8a', 'center', 800);
    txt(ctx, '这一趟结束，路上拿到的牌留着', 640, 360, 15, '#a49c8c');
    btn(ctx, BT.over.btn, '回大厅', true, inRect(mouse, BT.over.btn));
  }
}
function hintStyle(card, st) {
  if (!st) return {};
  if (card.instant) return { glow: [214, 160, 96], label: '立即释放', labelCol: '#e0b47a' };
  const col = CARD_COL[card.col] || CARD_COL[8];
  const rel = st.relation, mul = '×' + formatCN(st.multiplier);
  if (st.rainbow || st.hint === '差一盏彩虹') return { rainbow: true, label: st.rainbow ? '彩虹 ×3' : mul + ' 差一盏彩虹', labelCol: '#ffe6a0' };
  if (rel === '补色') return { glow: [255, 255, 255], strong: true, label: mul + ' 补色', labelCol: '#ffffff' };
  if (rel === '同色') return { glow: col, label: mul + ' 同色', labelCol: rgba(col) };
  if (rel === '邻色') return { glow: col, label: mul + ' 邻色 ›', labelCol: rgba(col) };
  if (rel === '百搭') return { glow: [230, 230, 240], label: mul + ' 百搭' };
  if (rel === '断色') return { dim: true, label: '断色', labelCol: '#777' };
  if (rel === '起色') return { label: '起色' };
  return { label: st.hint };
}
function tip(ctx, lines) {
  ctx.font = '500 14px "PingFang SC",sans-serif';
  const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 24, h = lines.length * 22 + 14;
  const x = clamp(mouse.x + 16, 8, 1280 - w - 8), y = clamp(mouse.y - h - 10, 8, 720 - h - 8);
  ctx.fillStyle = 'rgba(16,16,20,.94)'; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(190,160,110,.6)'; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, h - 1);
  lines.forEach((l, i) => txt(ctx, l, x + 12, y + 18 + i * 22, 14, '#e8e2d4', 'left', 500));
}
function wrap(ctx, s, x, y, w, size) {
  ctx.font = `500 ${size}px "PingFang SC",sans-serif`;
  let line = '', yy = y;
  for (const ch of s) { if (ctx.measureText(line + ch).width > w) { txt(ctx, line, x, yy, size, '#d8d0c0', 'center', 500); line = ''; yy += size + 6; } line += ch; }
  if (line) txt(ctx, line, x, yy, size, '#d8d0c0', 'center', 500);
}
