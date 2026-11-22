'use strict';
// 主循环：探索 ↔ 进战斗 ↔ 一仗 ↔ 回林子。
const stage = document.getElementById('stage');
const wc = document.getElementById('world'), wctx = wc.getContext('2d');
const uc = document.getElementById('ui'), uctx = uc.getContext('2d');
const RES = { explore: 120, battle: 135, lobby: 135 };   // 目标画面高度（世界像素）；实际按窗口取整数倍
let resKind = 'lobby';
let mode = 'lobby', fade = 0, trans = null, run, player, exploreConfirm = null;
const mouse = { x: 0, y: 0, down: false };
const keys = {};
let viewT = 0;

function setRes(kind) {
  resKind = kind;
  const sw = VIEW.sw, sh = VIEW.sh, scale = Math.max(1, Math.round(sh / RES[kind]));
  const w = Math.ceil(sw / scale), h = Math.ceil(sh / scale);
  CAM.W = w; CAM.H = h; wc.width = w; wc.height = h; wctx.imageSmoothingEnabled = false;
  VIEW.scale = scale; VIEW.ox = Math.floor((sw - w * scale) / 2); VIEW.oy = Math.floor((sh - h * scale) / 2);
  Object.assign(wc.style, { width: w * scale + 'px', height: h * scale + 'px', left: VIEW.ox + 'px', top: VIEW.oy + 'px' });
}
function shake(px) {
  const t = px > 0 ? `translate(${Math.round((Math.random() - .5) * px)}px,${Math.round((Math.random() - .5) * px)}px)` : '';
  for (const c of [wc, shadeC, glowC]) c.style.transform = t;
}
function fit() {
  const s = Math.min(innerWidth / 1280, innerHeight / 720), w = Math.floor(1280 * s), h = Math.floor(720 * s);
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  const dpr = devicePixelRatio || 1;
  for (const c of [uc, shadeC, glowC]) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  VIEW.sw = w; VIEW.sh = h; VIEW.dpr = dpr;
  setRes(resKind);
}
addEventListener('resize', fit);

// 大厅 → 进林子：新的一趟（心回满、宝石等级清零），牌组用存档里的
function startRunFromLobby() {
  trans = { kind: 'out', t: 0, then: () => { profile.runs++; saveProfile(); restartRun(); } };
}
// 回大厅：这一趟结束，牌留着
function goLobby() {
  if (run) saveRunRecords(run);
  trans = { kind: 'out', t: 0, then: () => { mode = 'lobby'; shake(0); exploreConfirm = null; enterLobby(); } };
}
function restartRun() {
  run = newRun((Math.random() * 1e9) | 0);
  CAM.ox = 0;
  player = { x: 0, y: 6, h: -Math.PI / 2, walk: 0, moving: false, grace: 0 };
  CAM.x = player.x; CAM.y = player.y; CAM.view = viewT = 0; CAM.oy = 14; setTilt(.6);
  wisps.length = 0; wispRng = rngFrom((Math.random() * 1e9) | 0);
  mode = 'explore'; setRes('explore');
}
function leaveBattle(how) {
  trans = { kind: 'out', t: 0, then: () => {
    const w = BT.wisp;
    const bk = BT.back;   // 从空地送回林子里原来的位置
    player.x = bk.x; player.y = bk.y; player.h = bk.h;
    for (const c of BT.arena) chunks.delete(c.cx + ',' + c.cy);
    if (how === 'win') { const i = wisps.indexOf(w); if (i >= 0) wisps.splice(i, 1); profile.wins++; saveRunRecords(run); }
    else { player.x -= bk.ux * 22; player.y -= bk.uy * 22; player.grace = 3; }
    mode = 'explore'; setRes('explore'); CAM.oy = 14; setTilt(.6); CAM.view = viewT = bk.view; CAM.x = player.x; CAM.y = player.y; shake(0);
  } };
}

// ---------- 输入 ----------
const SNAP = Math.PI / 2;
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (!e.repeat && mode === 'explore' && !exploreConfirm) { if (k === 'q') viewT -= SNAP; if (k === 'e') viewT += SNAP; }   // 一次转 90 度
  keys[k] = true; if (e.key === 'Escape' && mode === 'explore' && !trans) exploreConfirm = exploreConfirm ? null : CONFIRM;
  if (mode === 'battle' && !trans) { if (e.key === ' ') e.preventDefault(); battleKey(e.key); } });
const CONFIRM = { yes: { x: 520, y: 380, w: 110, h: 40 }, no: { x: 650, y: 380, w: 110, h: 40 } };
const EXPLORE_LOBBY = { x: 1136, y: 184, w: 88, h: 30 };
addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
function toUI(e) { const r = stage.getBoundingClientRect(); mouse.x = (e.clientX - r.left) / r.width * 1280; mouse.y = (e.clientY - r.top) / r.height * 720; }
let dragView = null;
stage.addEventListener('mousedown', e => {
  toUI(e); mouse.down = true; if (trans) return;
  if (mode === 'battle') return battleDown(mouse);
  if (mode === 'lobby') return lobbyDown(mouse);
  if (exploreConfirm) { if (inRect(mouse, CONFIRM.yes)) goLobby(); else if (inRect(mouse, CONFIRM.no)) exploreConfirm = null; return; }
  if (inRect(mouse, EXPLORE_LOBBY)) { exploreConfirm = CONFIRM; return; }
  dragView = mouse.x;
});
addEventListener('mousemove', e => { toUI(e); if (mode === 'battle') battleMove(mouse); else if (dragView != null) { viewT += (mouse.x - dragView) * .006; dragView = mouse.x; } });
addEventListener('mouseup', e => { toUI(e); mouse.down = false; if (dragView != null) viewT = Math.round(viewT / SNAP) * SNAP; dragView = null; if (mode === 'battle' && !trans) battleUp(mouse); });

// ---------- 探索 ----------
function updateExplore(dt) {
  CAM.view += (viewT - CAM.view) * Math.min(1, dt * 7);
  if (Math.abs(viewT - CAM.view) < .002) CAM.view = viewT;   // 停下来时正好落在直角上
  let ix = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  let iy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  player.moving = !!(ix || iy) && !trans && !exploreConfirm;
  if (player.moving) {
    const l = Math.hypot(ix, iy); ix /= l; iy /= l;
    const [dx, dy] = screenDirToWorld(ix, iy);
    let d = Math.atan2(dy, dx) - player.h; d = Math.atan2(Math.sin(d), Math.cos(d)); player.h += d * Math.min(1, dt * 14);
    const sp = (keys.shift ? 48 : 30) * dt;
    for (const [mx, my] of [[dx * sp, dy * sp], [dx * sp, 0], [0, dy * sp]]) {
      const nx = player.x + mx, ny = player.y + my;
      if (blocked(nx, ny, 2.6)) continue;
      player.x = nx; player.y = ny; break;
    }
    player.walk += dt * (keys.shift ? 13 : 9);
  } else player.walk = 0;
  player.grace = Math.max(0, player.grace - dt);
  CAM.x += (player.x - CAM.x) * Math.min(1, dt * 5); CAM.y += (player.y - CAM.y) * Math.min(1, dt * 5);
  updateChunks(player.x, player.y);
  updateWisps(player.x, player.y, dt);
  if (!trans && !exploreConfirm && player.grace <= 0) for (const w of wisps) if (Math.hypot(w.x - player.x, w.y - player.y) < WISP.guard) {
    w.flare = 0;
    trans = { kind: 'enter', t: 0, wisp: w };
    break;
  }
}
function drawWisps(ctx, t) {
  for (const w of wisps) {
    const d = Math.hypot(w.x - player.x, w.y - player.y);
    if (d > 260) continue;
    const p = proj(w.x, w.y, 12 + Math.sin(t * 2 + w.phase) * 2);
    if (p.x < -20 || p.x > CAM.W + 20 || p.y < -20 || p.y > CAM.H + 20) continue;
    const flare = trans && trans.wisp === w ? 1 + trans.t * 3 : 1;
    drawWisp(ctx, p, t + w.phase, w.color, flare);
  }
}
function drawMinimap(ctx, t) {
  const cx = 1180, cy = 100, R0 = 72, range = 360;
  ctx.save();
  ctx.fillStyle = 'rgba(8,10,16,.7)'; ctx.beginPath(); ctx.arc(cx, cy, R0, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(160,150,130,.5)'; ctx.lineWidth = 1.5; ctx.stroke();
  ctx.beginPath(); ctx.arc(cx, cy, R0, 0, TAU); ctx.clip();
  const c = Math.cos(CAM.view), s = Math.sin(CAM.view);
  for (const w of wisps) {
    const dx = w.x - player.x, dy = w.y - player.y, rx = c * dx - s * dy, ry = s * dx + c * dy;
    const x = cx + rx / range * R0, y = cy + ry / range * R0, pulse = 3.5 + Math.sin(t * 5 + w.phase) * .8;
    ctx.fillStyle = rgba(w.color, .35); ctx.beginPath(); ctx.arc(x, y, pulse + 3, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(w.color); ctx.beginPath(); ctx.arc(x, y, pulse, 0, TAU); ctx.fill();
  }
  ctx.restore();
  // 主角：白色箭头，永远在正中，指向他面朝的方向
  const [fx, fy] = [Math.cos(player.h), Math.sin(player.h)];
  const ang = Math.atan2(s * fx + c * fy, c * fx - s * fy);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang + Math.PI / 2);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.fill();
  ctx.restore();
}

// ---------- 主循环 ----------
let last = performance.now(), T = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now; T += dt;
  if (trans) {
    trans.t += dt;
    if (trans.kind === 'enter') {
      if (trans.t < .5) { /* 鬼火猛地烧起来 */ }
      else { fade = Math.min(1, (trans.t - .5) / .3); if (trans.t >= .8) { enterBattle(trans.wisp); mode = 'battle'; setRes('battle'); CAM.oy = 30; setTilt(.72); trans = { kind: 'in', t: 0 }; } }
    } else if (trans.kind === 'out') {
      fade = Math.min(1, trans.t / .3); if (trans.t >= .3) { const f = trans.then; trans = { kind: 'in', t: 0 }; f(); }
    } else if (trans.kind === 'in') { fade = Math.max(0, 1 - trans.t / .35); if (trans.t >= .35) { trans = null; fade = 0; } }
  }
  if (mode === 'lobby') {
    updateLobby(dt); renderLobby(wctx, T, dt);
  } else if (mode === 'explore') {
    updateExplore(dt);
    renderWorld(wctx, { player, t: T, dt, overFx: ctx => drawWisps(ctx, T) });
  } else {
    updateBattle(dt);
    const sh = BT.shake;
    renderWorld(wctx, { player, t: T, dt, battle: true, lightR: 80, dark: .7, monster: BT.mon, fx: battleFx, chunks: BT.arena });
    shake(sh * 10);
  }
  // UI 层
  const s = uc.width / 1280;
  uctx.setTransform(1, 0, 0, 1, 0, 0); uctx.clearRect(0, 0, uc.width, uc.height);
  uctx.setTransform(s, 0, 0, s, 0, 0);
  if (mode === 'lobby') drawLobbyUI(uctx, T);
  else if (mode === 'explore') {
    drawMinimap(uctx, T);
    btn(uctx, EXPLORE_LOBBY, '回大厅', true, inRect(mouse, EXPLORE_LOBBY));
    if (exploreConfirm) {
      uctx.fillStyle = 'rgba(0,0,0,.6)'; uctx.fillRect(0, 0, 1280, 720);
      txt(uctx, '回大厅吗？', 640, 300, 26, '#efe4cc', 'center', 800);
      txt(uctx, '这一趟结束，路上拿到的牌留着', 640, 338, 15, '#a49c8c');
      btn(uctx, CONFIRM.yes, '回大厅', true, inRect(mouse, CONFIRM.yes)); btn(uctx, CONFIRM.no, '接着走', true, inRect(mouse, CONFIRM.no));
    }
    txt(uctx, 'WASD 走（Shift 跑）· Q E 或拖鼠标 转镜头 · 碰到鬼火就开打 · Esc 回大厅', 24, 700, 13, 'rgba(200,190,170,.6)', 'left', 500);
    heartRow(uctx, 24, 20, 4, run.hearts, run.maxHearts);
    txt(uctx, `牌 ${run.deck.length} 张　打倒 ${run.wins} 只`, 24, 56, 14, 'rgba(220,210,190,.75)', 'left', 500);
  } else drawBattleUI(uctx);
  if (fade > 0) { uctx.fillStyle = `rgba(0,0,0,${fade})`; uctx.fillRect(0, 0, 1280, 720); }
  requestAnimationFrame(frame);
}

fit();
initModels();
loadArt().catch(e => console.error('美术没读进来，用代码生成的', e)).finally(() => {   // 画师的美术换掉代码生成的
  enterLobby();
  fade = 1; trans = { kind: 'in', t: 0 };
  requestAnimationFrame(frame);
});
