'use strict';
// 林子里的石碑和树洞（见 设计.md「整局流程」「核心循环」）。
// 石碑 = 歇脚：回心 / 强化一张牌 / 删一张牌，三选一，用过就暗；树洞 = 以前走丢的人落下的东西，摸出一件零碎。
// 走过去碰一下就打开；没用就走开再回来，还能再打开。
let spotMenu = null;   // { kind: 'rest' | 'deck' | 'hollow', spot, mode: 'up' | 'del', relic, hover }

// 探索时每帧看一眼：碰到没用过的石碑 / 树洞就打开菜单。返回 true = 打开了
function touchSpots() {
  for (const s of FLOOR.spots) {
    const d = Math.hypot(s.x - player.x, s.y - player.y);
    if (d > 22) s.armed = true;
    if (s.used || s.armed === false || d > 11) continue;
    s.armed = false; exploreToast = null;
    if (s.kind === 'rest') spotMenu = { kind: 'rest', spot: s };
    else spotMenu = { kind: 'hollow', spot: s, relic: relicChoices(run, 1)[0] || null };
    return true;
  }
  return false;
}

const REST_BTNS = [
  { key: 'heal', label: `回心（+${REST_HEAL} 颗）`, sub: '靠着石碑睡一会儿', y: 280 },
  { key: 'up', label: '强化一张牌', sub: '点数 ×2.5，或者效果加强', y: 350 },
  { key: 'del', label: '删一张牌', sub: '牌越少，好牌越常摸到', y: 420 },
];
const restRect = b => ({ x: 500, y: b.y, w: 280, h: 56 });
const REST_LEAVE = { x: 580, y: 500, w: 120, h: 36 };
const DECK_BACK = { x: 580, y: 668, w: 120, h: 36 };
const HOLLOW_OK = { x: 580, y: 498, w: 120, h: 40 };
// 还没摸过的树洞：洞口往上飘几颗金色的光点，远远就看得见（画在发光层）
function drawSpotFx(ctx, t) {
  for (const s of FLOOR.spots) {
    if (s.used || s.kind !== 'hollow' || Math.hypot(s.x - player.x, s.y - player.y) > 200) continue;
    for (let i = 0; i < 7; i++) {
      const life = (t * .45 + i / 7) % 1, a = Math.sin(life * Math.PI) * .9;
      const p = proj(s.x + Math.sin(i * 2.7 + t * .8) * 3.5, s.y + 6 + Math.cos(i * 1.9) * 2, 4 + life * 20);
      ctx.fillStyle = `rgba(255,214,140,${a})`; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
    }
  }
}
const restOn = k => k === 'heal' ? run.hearts < run.maxHearts : k === 'up' ? run.deck.some(canUpgrade) : run.deck.length > MIN_DECK;

// 挑牌的格子：牌多了就排密一点
function deckGrid() {
  const n = run.deck.length, per = n > 24 ? 10 : 8, w = n > 24 ? 64 : 76, h = Math.round(w * 1.4), gx = w + 14, gy = h + 22;
  const rows = Math.ceil(n / per), y0 = 360 - (rows - 1) * gy / 2 + 10;
  return run.deck.map((c, i) => { const row = Math.floor(i / per), inRow = Math.min(per, n - row * per); return { x: 640 + (i % per - (inRow - 1) / 2) * gx, y: y0 + row * gy, w, h }; });
}
const cardHit = (m, p) => Math.abs(m.x - p.x) < p.w / 2 && Math.abs(m.y - p.y) < p.h / 2;

function spotDown(m) {
  const M = spotMenu;
  if (M.kind === 'hollow') {
    if (!inRect(m, HOLLOW_OK)) return;
    if (M.relic) { gainRelic(run, M.relic); exploreToast = { text: `收下了：${RELICS[M.relic].name}`, t: 0 }; }
    else { run.hearts = Math.min(run.maxHearts, run.hearts + .5); exploreToast = { text: '回了半颗心', t: 0 }; }
    useSpot(M.spot); spotMenu = null; return;
  }
  if (M.kind === 'rest') {
    if (inRect(m, REST_LEAVE)) { spotMenu = null; return; }
    for (const b of REST_BTNS) if (inRect(m, restRect(b)) && restOn(b.key)) {
      if (b.key === 'heal') { const h = restHeal(run); useSpot(M.spot); spotMenu = null; exploreToast = { text: `睡了一会儿，回了 ${heartWord(h)}心`, t: 0 }; }
      else spotMenu = { kind: 'deck', spot: M.spot, mode: b.key };
      return;
    }
    return;
  }
  if (M.kind === 'deck') {
    if (inRect(m, DECK_BACK)) { spotMenu = { kind: 'rest', spot: M.spot }; return; }
    const i = deckGrid().findIndex(p => cardHit(m, p));
    if (i < 0) return;
    const c = run.deck[i];
    if (M.mode === 'up') { const u = upgradeCard(run, i); if (!u) return; exploreToast = { text: `强化了：${c.name} → ${u.name}`, t: 0 }; }
    else { if (!removeCard(run, i)) return; exploreToast = { text: `删掉了：${c.name}`, t: 0 }; }
    useSpot(M.spot); spotMenu = null;
  }
}
function spotKey(k) {
  if (k !== 'Escape' || !spotMenu) return;
  if (spotMenu.kind === 'deck') spotMenu = { kind: 'rest', spot: spotMenu.spot };
  else if (spotMenu.kind === 'rest') spotMenu = null;
}

function drawSpotMenu(ctx) {
  const M = spotMenu;
  ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 0, 1280, 720);
  if (M.kind === 'hollow') {
    txt(ctx, '树洞里摸出来一样东西', 640, 150, 24, '#ffe6b0', 'center', 800);
    txt(ctx, '以前走丢的人落下的', 640, 184, 14, '#a49c8c', 'center', 500);
    if (M.relic) relicPanel(ctx, M.relic, { x: 530, y: 214, w: 220, h: 262 }, false);
    else { txt(ctx, '半块饼干', 640, 320, 22, '#efe4cc', 'center', 800); txt(ctx, '还能吃。回半颗心', 640, 356, 15, '#a49c8c'); }
    btn(ctx, HOLLOW_OK, '收下', true, inRect(mouse, HOLLOW_OK));
    return;
  }
  if (M.kind === 'rest') {
    txt(ctx, '石碑', 640, 186, 28, '#efe2c4', 'center', 800);
    txt(ctx, '刻痕还亮着。歇歇脚，选一样（只能选一次）', 640, 224, 14, '#a49c8c', 'center', 500);
    for (const b of REST_BTNS) { const r = restRect(b), on = restOn(b.key); btn(ctx, r, b.label, on, on && inRect(mouse, r), on ? b.sub : b.key === 'heal' ? '心是满的' : b.key === 'del' ? `牌组最少留 ${MIN_DECK} 张` : '没有能强化的牌'); }
    btn(ctx, REST_LEAVE, '先不用', true, inRect(mouse, REST_LEAVE));
    heartRow(ctx, 640 - Math.ceil(run.maxHearts) * 15, 600, 4, run.hearts, run.maxHearts);
    return;
  }
  // 挑一张牌
  const up = M.mode === 'up', grid = deckGrid();
  txt(ctx, up ? '强化哪一张？' : '删掉哪一张？', 640, 56, 24, '#efe2c4', 'center', 800);
  txt(ctx, up ? '每张牌只能强化一次' : `删了就没了（牌组最少留 ${MIN_DECK} 张）`, 640, 88, 13, '#a49c8c', 'center', 500);
  let hot = -1;
  run.deck.forEach((c, i) => {
    const p = grid[i], h = cardHit(mouse, p), dead = up && !canUpgrade(c);
    if (h && !dead) hot = i;
    drawCard(ctx, c, p.x, p.y - (h && !dead ? 6 : 0), p.w, p.h, { dim: dead, glow: h && !dead ? (up ? [255, 230, 160] : [255, 120, 100]) : null });
  });
  btn(ctx, DECK_BACK, '返回', true, inRect(mouse, DECK_BACK));
  if (hot >= 0) {
    const c = run.deck[hot];
    if (up) { const u = makeCard(c.id + '+'); tip(ctx, [`${c.name}：${c.text}`, `→ ${u.name}：${u.text}`]); }
    else tip(ctx, [`${c.name}：${c.text}`]);
  }
}
