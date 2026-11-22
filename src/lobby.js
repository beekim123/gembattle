'use strict';
// 大厅：林子边上一块空地，中间一块刻着暖光符的石碑（第一版试验里那块），主角站在碑前。
// 镜头绕着石碑慢慢转。左边是菜单：进入迷雾森林 / 牌组 / 退出游戏。

// ---------- 存档：每局从起手牌组重新开始，这里只记跨局的东西（以后加铜板、石碑的好处） ----------
const PROFILE_KEY = 'card-stack-profile-v2';   // 原型的旧存档（card-stack-profile，里面是跨局牌组）不再用
const profile = (() => {
  const blank = { wins: 0, runs: 0, bestHit: 0, bestCast: 0, bestFloor: 0, clears: 0 };
  try { const p = JSON.parse(localStorage.getItem(PROFILE_KEY)); if (p && typeof p === 'object') return { ...blank, ...p }; } catch (e) { }
  return blank;
})();
function saveProfile() { try { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); } catch (e) { } }
// 一局里的最高记录写回存档
let lobbySummary = null;   // 刚结束的这一趟：回到大厅时弹一张结算（main.js goLobby 填）
function saveRunRecords(r) { profile.bestHit = Math.max(profile.bestHit, r.bestHit); profile.bestCast = Math.max(profile.bestCast, r.bestCast); saveProfile(); }

// ---------- 场景 ----------
const LOBBY_C = 2000, LX = LOBBY_C * CH + CH, LY = LOBBY_C * CH + CH;   // 石碑在四块拼起来的正中
let lobbyChunks = null;
function makeStone() {
  return build(11, 9, 30, (x, y, z) => {
    const X = x + .5 - 5.5, Y = y + .5 - 4.5, Zz = z + .5, n = vnoise(x * .5 + z * .3, y * .5, 5);
    const w = 3.8 - Zz * .045 + n * .6, d = 2.8 - Zz * .03 + n * .4;
    if (Zz > 27 + n * 3 - Math.abs(X) * .6 || Math.abs(X) > w || Math.abs(Y) > d) return null;
    const rx = Math.round(X), rz = Math.round(Zz);
    const rune = (rx === 0 && rz >= 8 && rz <= 21) || (Math.abs(rx) <= 2 && (rz - 17 === Math.abs(rx) || rz - 11 === -Math.abs(rx) + 1));
    if (Y > d - 1.1 && rune) return [255, 178, 100, 1];
    return Zz < 4 + n * 3 ? mix([48, 70, 54], [64, 70, 76], Zz / 6) : mix([84, 88, 98], [56, 60, 70], n);
  });
}
const POND = [LX + 40, LY - 22];
function lobbyWater(gx, gy) { return Math.hypot(gx - POND[0], gy - POND[1]) - (13 + 6 * fbm(gx * .06, gy * .06, 3)) < 0; }
function buildLobby() {
  const r = rngFrom(4242), list = [];
  for (const [cx, cy] of [[LOBBY_C, LOBBY_C], [LOBBY_C + 1, LOBBY_C], [LOBBY_C, LOBBY_C + 1], [LOBBY_C + 1, LOBBY_C + 1]]) {
    const g = document.createElement('canvas'); g.width = g.height = CH;
    const gc = g.getContext('2d'), im = gc.createImageData(CH, CH), water = new Uint8Array(CH * CH);
    for (let y = 0; y < CH; y++) for (let x = 0; x < CH; x++) {
      const gx = cx * CH + x, gy = cy * CH + y, i = y * CH + x, h = hash(gx, gy, 0, 2);
      const rr = Math.hypot(gx - LX, gy - LY);
      let col = mix([42, 58, 50], [60, 80, 62], fbm(gx * .04, gy * .04, 1));
      if (ART.on) {   // 画师的底图；碑前踩秃的一圈和小路用路的颜色，水用水的颜色
        col = artBaseCol(gx, gy);
        const pathD = Math.abs(gx - LX - 4 * Math.sin((gy - LY) * .05)) - (3.5 + 2 * fbm(gx * .1, gy * .1, 4));
        if (rr < 13 + 4 * fbm(gx * .1, gy * .1, 8) || (gy > LY + 8 && pathD < 0)) col = artCol('trail', col);
        const pd = Math.hypot(gx - POND[0], gy - POND[1]) - (13 + 6 * fbm(gx * .06, gy * .06, 3));
        if (pd < 0) { water[i] = 1; col = pd > -2 ? artCol('waterHi', col) : artCol('water', col); }
        else if (pd < 2) col = artCol('soilDark', col);
        col = col.map(v => v * (1 - smooth(clamp((rr - 38) / 24, 0, 1))));
        const k = i * 4; im.data[k] = col[0]; im.data[k + 1] = col[1]; im.data[k + 2] = col[2]; im.data[k + 3] = 255;
        continue;
      }
      if (h < .012) col = mix([92, 72, 52], [70, 56, 46], hash(gx, gy, 1, 2)); else if (h > .993) col = [84, 104, 74];
      const worn = 1 - smooth(clamp((rr - 10) / 9, 0, 1));                                // 碑前踩秃的一圈
      const pathD = Math.abs(gx - LX - 4 * Math.sin((gy - LY) * .05)) - (3.5 + 2 * fbm(gx * .1, gy * .1, 4));
      const onPath = gy > LY + 8 && pathD < 0;                                              // 往南通进林子的小路
      if (worn > 0 || onPath) col = mix(col, mix([80, 70, 58], [60, 54, 46], fbm(gx * .1, gy * .1, 6)), onPath ? 1 : worn * .9);
      const pd = Math.hypot(gx - POND[0], gy - POND[1]) - (13 + 6 * fbm(gx * .06, gy * .06, 3));
      if (pd < 0) { water[i] = 1; col = mix([14, 26, 38], [26, 44, 58], fbm(gx * .07, gy * .22, 6)); if (pd > -2) col = mix(col, [44, 64, 70], .5); }
      else if (pd < 2.5) col = mix([52, 58, 52], col, pd / 2.5);
      col = col.map(v => v * (1 - smooth(clamp((rr - 38) / 24, 0, 1))));                    // 外面沉进黑里
      const k = i * 4; im.data[k] = col[0]; im.data[k + 1] = col[1]; im.data[k + 2] = col[2]; im.data[k + 3] = 255;
    }
    gc.putImageData(im, 0, 0);
    if (ART.on) artDecorate(gc, cx * CH, cy * CH, r, 2, 10, (x, y) => { const rr = Math.hypot(x - LX, y - LY); return rr < 16 || rr > 40 || Math.hypot(x - POND[0], y - POND[1]) < 24; });
    list.push({ cx, cy, ground: g, water, objs: [] });
  }
  const objs = [];
  const free = (x, y, rad) => objs.every(o => Math.hypot(o.x - x, o.y - y) > (o.r || 1) + rad);
  const put = (o) => { objs.push(o); const c = list.find(c => c.cx === Math.floor(o.x / CH) && c.cy === Math.floor(o.y / CH)); (c || list[0]).objs.push(o); };
  put({ m: MODELS.stone, x: LX, y: LY, ro: 0, r: 4.5, light: true });
  for (let k = 0, n = 0; k < 400 && n < 16; k++) {
    const a = r() * TAU, rr = 34 + r() * 22, x = LX + Math.cos(a) * rr, y = LY + Math.sin(a) * rr;
    if (lobbyWater(x, y) || Math.hypot(x - POND[0], y - POND[1]) < 24 || (y > LY + 20 && Math.abs(x - LX) < 12) || !free(x, y, 15)) continue;
    const dead = r() < .2;
    put({ dead, m: dead ? MODELS.dead[(r() * 4) | 0] : MODELS.live[(r() * 5) | 0], x, y, ro: quarter(r), r: 3.6, tall: true }); n++;
  }
  for (let k = 0, n = 0; k < 400 && n < 26; k++) {
    const a = r() * TAU, rr = 14 + r() * 34, x = LX + Math.cos(a) * rr, y = LY + Math.sin(a) * rr;
    if (lobbyWater(x, y) || (y > LY + 8 && Math.abs(x - LX) < 8) || !free(x, y, 3)) continue;
    put({ m: r() < .5 ? MODELS.bush[(r() * 4) | 0] : MODELS.grass[(r() * 4) | 0], x, y, ro: quarter(r), r: 0 }); n++;
  }
  for (let k = 0, n = 0; k < 200 && n < 7; k++) {
    const a = r() * TAU, x = POND[0] + Math.cos(a) * (19 + r() * 4), y = POND[1] + Math.sin(a) * (19 + r() * 4);
    if (lobbyWater(x, y) || !free(x, y, 3)) continue;
    put({ m: MODELS.reeds[(r() * 3) | 0], x, y, ro: quarter(r), r: 0 }); n++;
  }
  for (const [dx, dy] of [[-22, -14], [26, 18], [-30, 20]]) put({ m: MODELS.rocks[(r() * 5) | 0], x: LX + dx, y: LY + dy, ro: quarter(r), r: 4 });
  for (const [dx, dy] of [[-30, -22], [34, 22], [-38, 8], [10, -36]]) put({ m: MODELS.fungus[1], x: LX + dx, y: LY + dy, ro: quarter(r), r: 0, glow: true });
  return list;
}
let lobbyPlayer = null, lobbyView = 0, lobbyTurnT = 0, deckOpen = false;
function enterLobby() {
  if (!lobbyChunks) lobbyChunks = buildLobby();
  for (const c of lobbyChunks) chunks.set(c.cx + ',' + c.cy, c);
  lobbyPlayer = { x: LX + 13, y: LY + 11, h: Math.PI, walk: 0, moving: false };   // 站在碑的斜前方，镜头转到哪边都挡不住
  setRes('lobby'); setTilt(.6); CAM.oy = 6; CAM.ox = 46; CAM.x = LX; CAM.y = LY + 6; CAM.view = lobbyView = 0; lobbyTurnT = 0;
  deckOpen = false;
}
// 镜头每隔一会儿绕石碑转 90 度，停着的时候切片正好对齐像素
function updateLobby(dt) {
  lobbyTurnT += dt; if (lobbyTurnT > 9) { lobbyTurnT = 0; lobbyView += Math.PI / 2; }
  CAM.view += (lobbyView - CAM.view) * Math.min(1, dt * 1.8); if (Math.abs(lobbyView - CAM.view) < .002) CAM.view = lobbyView;
  CAM.x = LX; CAM.y = LY + 6;
}
function renderLobby(ctx, t, dt) {
  renderWorld(ctx, { player: lobbyPlayer, t, dt, lightR: 60, dark: .72, chunks: lobbyChunks, calm: true });
}

// ---------- 菜单 ----------
const MENU = [
  { key: 'go', label: '进入迷雾森林', y: 330 },
  { key: 'deck', label: '牌组', y: 392 },
  { key: 'quit', label: '退出游戏', y: 454 },
];
const menuRect = it => ({ x: 84, y: it.y - 24, w: 300, h: 48 });
function drawLobbyUI(ctx, t) {
  const g = ctx.createLinearGradient(0, 0, 640, 0);
  g.addColorStop(0, 'rgba(3,6,10,.82)'); g.addColorStop(.6, 'rgba(3,6,10,.35)'); g.addColorStop(1, 'rgba(3,6,10,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 640, 720);
  txt(ctx, '异能卡牌', 84, 190, 64, '#efe2c4', 'left', 800);
  txt(ctx, '迷  雾  森  林', 88, 248, 18, '#a9b7b2', 'left', 500);
  ctx.fillStyle = 'rgba(216,187,136,.5)'; ctx.fillRect(88, 276, 220, 1);
  for (const it of MENU) {
    const r = menuRect(it), hot = !deckOpen && !lobbySummary && inRect(mouse, r);
    if (hot) {
      const gg = ctx.createRadialGradient(r.x + 90, it.y, 0, r.x + 90, it.y, 160);
      gg.addColorStop(0, 'rgba(242,182,96,.22)'); gg.addColorStop(1, 'rgba(242,182,96,0)');
      ctx.fillStyle = gg; ctx.fillRect(r.x - 70, it.y - 60, 330, 120);
      ctx.fillStyle = '#f2b660'; ctx.beginPath(); ctx.moveTo(r.x - 18, it.y); ctx.lineTo(r.x - 12, it.y - 6); ctx.lineTo(r.x - 6, it.y); ctx.lineTo(r.x - 12, it.y + 6); ctx.fill();
    }
    txt(ctx, it.label, r.x, it.y, it.key === 'go' ? 30 : 24, hot ? '#ffd79a' : '#e0dccc', 'left', it.key === 'go' ? 700 : 500);
  }
  const rec = [`进过林子 ${profile.runs} 次`, `一共打倒 ${profile.wins} 只`];
  if (profile.runs) rec.push(profile.clears ? `走穿过 ${profile.clears} 次` : `最远到 ${FLOORS[profile.bestFloor].name}`);
  if (profile.bestHit) rec.push(`最高一击 ${fmt(profile.bestHit)}`, `最高一次施法 ${fmt(profile.bestCast)}`);
  txt(ctx, rec.join('　·　'), 88, 660, 14, 'rgba(200,190,170,.7)', 'left', 500);
  if (deckOpen) drawDeck(ctx);
  if (lobbySummary) drawSummary(ctx);
}
function drawSummary(ctx) {
  const s = lobbySummary, f = FLOORS[s.floor];
  ctx.fillStyle = 'rgba(0,0,0,.72)'; ctx.fillRect(0, 0, 1280, 720);
  ctx.fillStyle = 'rgba(16,16,20,.96)'; ctx.fillRect(440, 170, 400, 360);
  ctx.strokeStyle = 'rgba(214,180,120,.7)'; ctx.lineWidth = 2; ctx.strokeRect(441, 171, 398, 358);
  const head = s.reason === 'dead' ? '心打光了' : s.reason === 'clear' ? '走穿了三段林子' : '先回来歇歇';
  txt(ctx, head, 640, 220, 28, s.reason === 'dead' ? '#ff9a8a' : '#efe2c4', 'center', 800);
  txt(ctx, s.reason === 'clear' ? '最里头的空场子还没做好（以后的事）' : `走到 ${f.name}（第${NUM_CN[s.floor]}段）`, 640, 262, 15, '#a49c8c', 'center', 500);
  const rows = [['打倒', `${s.kills} 只`], ['最高一击', fmt(s.bestHit)], ['最高一次施法', fmt(s.bestCast)], ['牌组', `${s.deck} 张`]];
  rows.forEach(([k, v], i) => { txt(ctx, k, 500, 316 + i * 40, 16, '#a49c8c', 'left', 500); txt(ctx, v, 780, 316 + i * 40, 20, '#efe4cc', 'right', 700); });
  btn(ctx, SUMMARY_OK, '知道了', true, inRect(mouse, SUMMARY_OK));
}
const SUMMARY_OK = { x: 580, y: 470, w: 120, h: 40 };
function drawDeck(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,.78)'; ctx.fillRect(0, 0, 1280, 720);
  txt(ctx, `起手牌组（${START_DECK.length} 张）`, 640, 70, 26, '#efe2c4', 'center', 800);
  txt(ctx, '每次进林子都从这副牌开始，路上再一张张拿', 640, 104, 14, '#a49c8c', 'center', 500);
  const counts = new Map();
  for (const id of START_DECK) counts.set(id, (counts.get(id) || 0) + 1);
  const ids = [...counts.keys()], per = 7, w = 110, h = 155, gx = 140, gy = 210;
  ids.forEach((id, i) => {
    const c = makeCard(id), x = 640 + ((i % per) - (Math.min(per, ids.length) - 1) / 2) * gx, y = 230 + Math.floor(i / per) * gy;
    drawCard(ctx, c, x, y, w, h, {});
    txt(ctx, '× ' + counts.get(id), x, y + h / 2 + 18, 15, '#d8d0c0', 'center', 700);
  });
  wrap(ctx, '规则：点牌排进链，按施法。跟上一张有同一种宝石就接上，倍率 ×2；红绿蓝凑齐叫合白；都不沾就断。牌攒得越多，一口气打得越狠。', 640, 600, 760, 14);
  btn(ctx, DECK_CLOSE, '关闭', true, inRect(mouse, DECK_CLOSE));
}
const DECK_CLOSE = { x: 580, y: 640, w: 120, h: 40 };
function lobbyDown(m) {
  if (lobbySummary) { lobbySummary = null; return; }
  if (deckOpen) { if (inRect(m, DECK_CLOSE) || true) deckOpen = false; return; }
  for (const it of MENU) if (inRect(m, menuRect(it))) {
    if (it.key === 'go') startRunFromLobby();
    if (it.key === 'deck') deckOpen = true;
    if (it.key === 'quit') window.close();
  }
}
