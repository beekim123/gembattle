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

// 大厅 → 进林子：新的一趟（心回满、宝石等级清零、起手牌组），从第一段砍柴坡开始
function startRunFromLobby() {
  trans = { kind: 'out', t: 0, then: () => { profile.runs++; saveProfile(); restartRun(); } };
}
// 回大厅：这一趟结束（reason：quit 自己回来 / dead 心打光 / clear 走穿了），大厅里出一张结算
function goLobby(reason = 'quit') {
  if (run) {
    saveRunRecords(run);
    const floor = FLOOR ? FLOOR.i : 0;
    profile.bestFloor = Math.max(profile.bestFloor, floor); if (reason === 'clear') profile.clears++;
    saveProfile();
    lobbySummary = { reason, floor, kills: run.wins, bestHit: run.bestHit, bestCast: run.bestCast, deck: run.deck.length, relics: run.relics.length, gems: run.gems.map(g => g.level) };
  }
  trans = { kind: 'out', t: 0, then: () => { mode = 'lobby'; shake(0); exploreConfirm = null; spotMenu = null; enterLobby(); } };
}
function restartRun() {
  run = newRun((Math.random() * 1e9) | 0);
  enterFloor(0);
}
// 进第 i 段：重新生成这一段的林子，人站在南边入口
function enterFloor(i) {
  chunks.clear();
  FLOOR = makeFloor(i, (run.seed + i * 7919 + 1) >>> 0);
  run.floor = i;
  placeWisps(FLOOR);
  player = { x: FLOOR.entry.x, y: FLOOR.entry.y, h: -Math.PI / 2, walk: 0, moving: false, grace: 1 };
  CAM.ox = 0; CAM.x = player.x; CAM.y = player.y; CAM.view = viewT = 0; CAM.oy = 14; setTilt(.6);
  mode = 'explore'; setRes('explore'); exploreConfirm = null; spotMenu = null;
  titleCard = { name: FLOOR.def.name, sub: `第${NUM_CN[i]}段`, t: 0 };
  exploreToast = null;
}
// 主角附近的主路：每 6 格取一个点（离主角 80 格以内），画林子时挡住这些点的树冠会变淡
function pathNearPlayer() {
  const out = [], pts = FLOOR.path;
  for (let k = 0; k < pts.length - 1; k++) {
    const [ax, ay] = pts[k], [bx, by] = pts[k + 1], len = Math.hypot(bx - ax, by - ay);
    for (let d = 0; d < len; d += 6) { const x = ax + (bx - ax) * d / len, y = ay + (by - ay) * d / len; if (Math.hypot(x - player.x, y - player.y) < 80) out.push([x, y]); }
  }
  return out;
}
// 走进开着的石门
function nextFloor() {
  const i = FLOOR.i + 1;
  if (i >= FLOORS.length) { goLobby('clear'); return; }   // 第 6 步：这里接空场子和高个儿
  trans = { kind: 'out', t: 0, then: () => enterFloor(i) };
}
function leaveBattle(how) {
  trans = { kind: 'out', t: 0, then: () => {
    const w = BT.wisp, bk = BT.back;   // 从空地送回林子里原来的位置
    player.x = bk.x; player.y = bk.y; player.h = bk.h;
    for (const c of BT.arena) chunks.delete(c.cx + ',' + c.cy);
    if (how === 'win') {
      const i = wisps.indexOf(w); if (i >= 0) wisps.splice(i, 1);
      profile.wins++; saveRunRecords(run);
      if (w.guard) { openGate(); exploreToast = { text: '石门开了，往北走', t: 0 }; }
    } else {   // 逃跑：往回退一段，鬼火回原处，几秒内不会再撞上
      for (const d of [22, 16, 10, 5]) { const nx = bk.x - bk.ux * d, ny = bk.y - bk.uy * d; if (!blocked(nx, ny, 2.6)) { player.x = nx; player.y = ny; break; } }
      w.x = w.hx; w.y = w.hy; player.grace = 3;
    }
    mode = 'explore'; setRes('explore'); CAM.oy = 14; setTilt(.6); CAM.view = viewT = bk.view; CAM.x = player.x; CAM.y = player.y; shake(0);
  } };
}

// ---------- 输入 ----------
const SNAP = Math.PI / 2;
addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  if (!e.repeat && mode === 'explore' && !exploreConfirm && !spotMenu) { if (k === 'q') viewT -= SNAP; if (k === 'e') viewT += SNAP; }   // 一次转 90 度
  keys[k] = true;
  if (e.key === 'Escape' && mode === 'lobby' && albumOpen) albumKey('Escape');
  if (e.key === 'Escape' && mode === 'explore' && !trans) { if (spotMenu) spotKey('Escape'); else exploreConfirm = exploreConfirm ? null : CONFIRM; }
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
  if (spotMenu) return spotDown(mouse);
  if (exploreConfirm) { if (inRect(mouse, CONFIRM.yes)) goLobby(); else if (inRect(mouse, CONFIRM.no)) exploreConfirm = null; return; }
  if (inRect(mouse, EXPLORE_LOBBY)) { exploreConfirm = CONFIRM; return; }
  dragView = mouse.x;
});
addEventListener('mousemove', e => { toUI(e); if (mode === 'battle') battleMove(mouse); else if (dragView != null) { viewT += (mouse.x - dragView) * .006; dragView = mouse.x; } });
addEventListener('mouseup', e => { toUI(e); mouse.down = false; if (dragView != null) viewT = Math.round(viewT / SNAP) * SNAP; dragView = null; if (mode === 'battle' && !trans) battleUp(mouse); });

// ---------- 探索 ----------
let titleCard = null, exploreToast = null;
function updateExplore(dt) {
  CAM.view += (viewT - CAM.view) * Math.min(1, dt * 7);
  if (Math.abs(viewT - CAM.view) < .002) CAM.view = viewT;   // 停下来时正好落在直角上
  let ix = (keys.d || keys.arrowright ? 1 : 0) - (keys.a || keys.arrowleft ? 1 : 0);
  let iy = (keys.s || keys.arrowdown ? 1 : 0) - (keys.w || keys.arrowup ? 1 : 0);
  const busy = !!(trans || exploreConfirm || spotMenu);   // 菜单开着：人和鬼火都停下
  player.moving = !!(ix || iy) && !busy;
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
  if (!busy) updateWisps(player.x, player.y, dt);
  exploreAround(FLOOR, player.x, player.y, 58);
  if (titleCard) { titleCard.t += dt; if (titleCard.t > 3.2) titleCard = null; }
  if (exploreToast) { exploreToast.t += dt; if (exploreToast.t > 3) exploreToast = null; }
  if (busy) return;
  if (touchSpots()) return;   // 石碑 / 树洞
  const G = FLOOR.gate;   // 走进开着的石门 → 下一段
  if (FLOOR.gateOpen && Math.abs(player.x - G.x) < 5.5 && player.y < G.y + 6) { nextFloor(); return; }
  if (player.grace <= 0) for (const w of wisps) if (Math.hypot(w.x - player.x, w.y - player.y) < WISP.guard * (w.guard ? 1.25 : 1)) {
    trans = { kind: 'enter', t: 0, wisp: w };
    break;
  }
}
function drawWisps(ctx, t) {
  for (const w of wisps) {
    const d = Math.hypot(w.x - player.x, w.y - player.y);
    if (d > 260) continue;
    const ba = bodyAlpha(w), core = lookOf(w.kind).core || 16;   // 露出真身以后，鬼火缩进它身上（胸口、眼睛里）
    const p = proj(w.x, w.y, lerp(w.guard ? 18 : 12, core, ba) + Math.sin(t * 2 + w.phase) * 2 * (1 - ba));
    if (p.x < -30 || p.x > CAM.W + 30 || p.y < -30 || p.y > CAM.H + 30) continue;
    const flare = trans && trans.wisp === w ? 1 + trans.t * 3 : 1;
    drawWisp(ctx, p, t + w.phase, w.color, (w.guard ? 2 : w.elite ? 1.4 : 1) * flare * (1 - ba * .55));
  }
}
// 走近了，鬼火底下慢慢显出它的真身（一直朝着镜头）；远处只看得见一团鬼火。看门的离得远一点就看得见
const bodyAlpha = w => clamp(((w.guard ? 150 : 104) - Math.hypot(w.x - player.x, w.y - player.y)) / 40, 0, 1);
function wispBodies() {
  const out = [];
  for (const w of wisps) {
    const a = bodyAlpha(w); if (a <= 0) continue;
    const look = lookOf(w.kind), t = T + w.phase, lift = look.lift + (look.bob ? Math.sin(t * 2.4) * look.bob : 0);
    out.push({ m: look.model({ t, cd: 3, elite: w.elite, shake: 0 }), x: w.x, y: w.y, ro: -CAM.view, alpha: a * .92, lift, shadow: look.heavy ? 11 : 7 });
    if (w.kind === 'yanzhu' && t % 5.3 < 5.1) out.push({ m: yanzhuIris(Math.floor(t / 2) % 3), x: w.x, y: w.y, ro: -CAM.view, alpha: a, lift, bias: .5 });
  }
  return out;
}
// 鬼火和看门的也照亮一点脚下：看门的那团从老远就能看见
function wispLights() {
  const out = [];
  for (const w of wisps) {
    if (Math.hypot(w.x - player.x, w.y - player.y) > 300) continue;
    const L = w.guard ? { x: w.x, y: w.y, z: 18, r: 46, a: .7, c: w.color } : { x: w.x, y: w.y, z: 12, r: w.elite ? 24 : 16, a: w.elite ? .6 : .45, c: w.color };
    const ba = bodyAlpha(w);   // 露出真身时，这团光挪到它身上、照亮一圈，看得清它长什么样
    if (ba > 0) { L.z = lerp(L.z, lookOf(w.kind).core || 16, ba); L.r = lerp(L.r, Math.max(L.r, 40), ba); L.a = lerp(L.a, .8, ba); }
    out.push(L);
  }
  return out;
}
// 小地图：跟着镜头转；只画走过的地方；看门的和石门一开始就标着，出了圈就在边上指方向
function drawMinimap(ctx, t) {
  const cx = 1180, cy = 100, R0 = 72, range = 170, k = R0 / range, F = FLOOR;
  const c = Math.cos(CAM.view), s = Math.sin(CAM.view);
  const at = (x, y) => { const dx = x - player.x, dy = y - player.y; return [cx + (c * dx - s * dy) * k, cy + (s * dx + c * dy) * k]; };
  ctx.save();
  ctx.fillStyle = 'rgba(6,8,12,.86)'; ctx.beginPath(); ctx.arc(cx, cy, R0, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(cx, cy, R0, 0, TAU); ctx.clip();
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(CAM.view); ctx.scale(k, k); ctx.translate(-player.x, -player.y);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(F.mm, 0, 0, FLOOR_W, FLOOR_W); ctx.restore();
  for (const sp of F.spots) {   // 石碑、树洞：那一格亮过才画；用过的变灰
    if (!F.explored[Math.floor(sp.y / MM_CELL) * MM_N + Math.floor(sp.x / MM_CELL)]) continue;
    const [x, y] = at(sp.x, sp.y);
    ctx.fillStyle = sp.used ? '#5a5a5a' : sp.kind === 'rest' ? '#7cc8ff' : '#ffd08a';
    if (sp.kind === 'rest') ctx.fillRect(x - 2.5, y - 4, 5, 8); else { ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x + 4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 4, y); ctx.fill(); }
  }
  for (const w of wisps) {
    if (w.guard || !w.seen) continue;
    const [x, y] = at(w.x, w.y), pulse = (w.elite ? 4 : 3) + Math.sin(t * 5 + w.phase) * .7;
    ctx.fillStyle = rgba(w.color, .35); ctx.beginPath(); ctx.arc(x, y, pulse + 3, 0, TAU); ctx.fill();
    ctx.fillStyle = rgba(w.color); ctx.beginPath(); ctx.arc(x, y, pulse, 0, TAU); ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(160,150,130,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(cx, cy, R0, 0, TAU); ctx.stroke();
  // 看门的 / 石门：圈里就画在原处，圈外就贴着边指过去
  const mark = (x, y, col, open) => {
    let [mx, my] = at(x, y); const dx = mx - cx, dy = my - cy, d = Math.hypot(dx, dy);
    if (d > R0 - 7) {
      const ux = dx / d, uy = dy / d; mx = cx + ux * (R0 - 7); my = cy + uy * (R0 - 7);
      ctx.save(); ctx.translate(mx, my); ctx.rotate(Math.atan2(uy, ux));
      ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(7, 0); ctx.lineTo(-3, -5); ctx.lineTo(-3, 5); ctx.fill(); ctx.restore();
    } else if (open) { ctx.fillStyle = col; ctx.fillRect(mx - 5, my - 6, 3, 10); ctx.fillRect(mx + 2, my - 6, 3, 10); ctx.fillRect(mx - 5, my - 7, 10, 3); }
    else { const p = 4.5 + Math.sin(t * 4) * 1; ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mx, my, p, 0, TAU); ctx.fill(); }
  };
  const guard = wisps.find(w => w.guard);
  if (guard) mark(guard.x, guard.y, '#ff7a54', false);
  else mark(F.gate.x, F.gate.y, '#7cc8ff', true);
  // 主角：白色箭头，永远在正中，指向他面朝的方向
  const fx = Math.cos(player.h), fy = Math.sin(player.h), ang = Math.atan2(s * fx + c * fy, c * fx - s * fy);
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(ang + Math.PI / 2);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(0, -7); ctx.lineTo(5, 5); ctx.lineTo(0, 2); ctx.lineTo(-5, 5); ctx.fill();
  ctx.restore();
}
// 三颗宝石的等级（探索时在心的右边）
function gemRow(ctx, x, y) {
  for (let j = 0; j < 3; j++) {
    const gx = x + j * 50;
    ctx.fillStyle = rgba(GEM_COLORS[j]); ctx.beginPath(); ctx.moveTo(gx, y - 6); ctx.lineTo(gx + 5, y); ctx.lineTo(gx, y + 6); ctx.lineTo(gx - 5, y); ctx.fill();
    txt(ctx, 'Lv' + run.gems[j].level, gx + 9, y + 1, 13, 'rgba(220,210,190,.85)', 'left', 600);
  }
}
function drawExploreUI(ctx, t) {
  drawMinimap(ctx, t);
  btn(ctx, EXPLORE_LOBBY, '回大厅', true, inRect(mouse, EXPLORE_LOBBY));
  heartRow(ctx, 24, 20, 4, run.hearts, run.maxHearts);
  gemRow(ctx, 24 + Math.ceil(run.maxHearts) * 30 + 14, 30);
  txt(ctx, `${FLOOR.def.name}　打倒 ${run.wins} 只　牌 ${run.deck.length} 张`, 24, 56, 14, 'rgba(220,210,190,.75)', 'left', 500);
  relicRow(ctx, 24, 72, run.relics);
  txt(ctx, 'WASD 走（Shift 跑）· Q E 或拖鼠标 转镜头 · 碰到鬼火就开打 · Esc 回大厅', 24, 700, 13, 'rgba(200,190,170,.6)', 'left', 500);
  const G = FLOOR.gate, nearGate = Math.hypot(player.x - G.x, player.y - G.y) < 70;
  if (nearGate && !FLOOR.gateOpen && !wisps.some(w => w.guard && Math.hypot(w.x - player.x, w.y - player.y) < 60)) txt(ctx, '石门关着。打倒看门的才开。', 640, 560, 16, 'rgba(220,210,190,.8)', 'center', 600);
  if (exploreToast) { const a = Math.min(1, exploreToast.t * 4, (3 - exploreToast.t) * 2); ctx.globalAlpha = a; txt(ctx, exploreToast.text, 640, 560, 20, '#cfe6ff', 'center', 700); ctx.globalAlpha = 1; }
  if (titleCard) {   // 进一段时正中出它的名字
    const a = Math.min(1, titleCard.t * 1.6, (3.2 - titleCard.t) * 1.4);
    ctx.globalAlpha = Math.max(0, a);
    txt(ctx, titleCard.sub, 640, 250, 16, '#a9b7b2', 'center', 500);
    txt(ctx, titleCard.name, 640, 296, 46, '#efe2c4', 'center', 800);
    ctx.fillStyle = 'rgba(216,187,136,.45)'; ctx.fillRect(560, 330, 160, 1);
    ctx.globalAlpha = 1;
  }
  if (spotMenu) drawSpotMenu(ctx);
  else if (!exploreConfirm) {   // 鼠标停在零碎 / 宝石上：说明
    const rk = relicAt(mouse, 24, 72, run.relics), gx = 24 + Math.ceil(run.maxHearts) * 30 + 14;
    if (rk) tip(ctx, relicTip(rk));
    else if (mouse.y > 18 && mouse.y < 42 && mouse.x > gx - 8 && mouse.x < gx + 150) tip(ctx, run.gems.map((g, j) => `${GEM_NAMES[j]}宝石 Lv${g.level}：${GEM_NAMES[j]}色每发 ×${+gemPow(run, j).toFixed(2)}（再打 ${gemNeed(g.level) - g.exp} 发升级）`));
  }
  if (exploreConfirm) {
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, 1280, 720);
    txt(ctx, '回大厅吗？', 640, 300, 26, '#efe4cc', 'center', 800);
    txt(ctx, '这一趟就到这儿', 640, 338, 15, '#a49c8c');
    btn(ctx, CONFIRM.yes, '回大厅', true, inRect(mouse, CONFIRM.yes)); btn(ctx, CONFIRM.no, '接着走', true, inRect(mouse, CONFIRM.no));
  }
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
    renderWorld(wctx, { player, t: T, dt, dark: FLOOR.def.dark, shade: FLOOR.def.look.shade, fog: FLOOR.def.look.fog, lights: wispLights(), pathPts: pathNearPlayer(), props: wispBodies(), overFx: ctx => { drawSpotFx(ctx, T); drawWisps(ctx, T); } });
  } else {
    updateBattle(dt);
    const sh = BT.shake;
    renderWorld(wctx, { player, t: T, dt, battle: true, lightR: 80, dark: .7, monster: BT.mon, props: battleProps(), fx: battleFx, chunks: BT.arena });
    shake(sh * 10);
  }
  // UI 层
  const s = uc.width / 1280;
  uctx.setTransform(1, 0, 0, 1, 0, 0); uctx.clearRect(0, 0, uc.width, uc.height);
  uctx.setTransform(s, 0, 0, s, 0, 0);
  if (mode === 'lobby') drawLobbyUI(uctx, T);
  else if (mode === 'explore') drawExploreUI(uctx, T);
  else drawBattleUI(uctx);
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
