'use strict';
// 卡册：大厅里翻的怪物图鉴。左边一格一格的怪（会动），右边是点中的那只：大图、特性、血量、一句话。
// 碰到过 / 打倒过几只记在存档的 profile.dex 里。现在还在测试，ALBUM_ALL = true：没碰到过的也全摊开。
const ALBUM_ALL = true;
let albumOpen = false, albumSel = 0, albumElite = false;
const FLOOR_METAL = { 砍柴坡: [176, 132, 82], 老林子: [92, 150, 124], 蛤蟆塘: [96, 120, 150], 空场子: [196, 186, 160] };

// 卡册里的条目：做出来的怪按段排，后面几段还没做的占个位
function albumEntries() {
  const out = [];
  FLOORS.forEach(F => {
    for (const k of F.kinds) if (MONSTERS[k] && !out.some(e => e.kind === k)) out.push({ kind: k, where: F.name, guard: false });
    if (MONSTERS[F.guard.kind] && F.guard.kind !== 'tiko' && !out.some(e => e.kind === F.guard.kind)) out.push({ kind: F.guard.kind, where: F.name, guard: true, hp: F.guard.hp });
  });
  for (const m of MONSTERS_LATER) if (!out.some(e => e.name === m.name)) out.push({ kind: null, name: m.name, where: m.where, guard: !!m.guard, lore: m.lore });
  return out;
}
const dexOf = kind => (profile.dex && profile.dex[kind]) || { seen: 0, beaten: 0 };
function dexNote(kind, what) {   // battle.js 开打 / 打赢时调
  profile.dex = profile.dex || {};
  const d = profile.dex[kind] || (profile.dex[kind] = { seen: 0, beaten: 0 });
  d[what]++; saveProfile();
}

// 把一只怪画成一张小图（世界像素，战斗镜头的角度），发光的部分另画一层
const PORTRAIT = { W: 96, H: 92 }, portC = document.createElement('canvas'), portG = document.createElement('canvas');
portC.width = portG.width = PORTRAIT.W; portC.height = portG.height = PORTRAIT.H;
const portX = portC.getContext('2d'), portGX = portG.getContext('2d');
function renderPortrait(kind, elite, t) {
  const look = lookOf(kind), keep = { view: CAM.view, tilt: CAM.tilt, emit: EMIT };
  CAM.view = 0; setTilt(.72); EMIT = portGX;
  for (const c of [portX, portGX]) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, PORTRAIT.W, PORTRAIT.H); c.imageSmoothingEnabled = false; }
  const lift = look.lift + (look.bob ? Math.sin(t * 2.4) * look.bob : 0), p = { x: PORTRAIT.W / 2, y: PORTRAIT.H - 14 };
  drawStack(portX, look.model({ t, cd: 3, elite, shake: 0 }), p, 0, 1, lift);
  if (kind === 'yanzhu' && t % 5.3 < 5.1) drawStack(portX, yanzhuIris(Math.floor(t / 2) % 3), p, 0, 1, lift);   // 大眼珠的眼仁三种颜色轮着换
  CAM.view = keep.view; setTilt(keep.tilt); EMIT = keep.emit;
}
// 小图贴到界面上：s 倍；先垫一层模糊的发光
function blitPortrait(ctx, x, y, s, crop) {
  const [cx, cy, cw, ch] = crop || [0, 0, PORTRAIT.W, PORTRAIT.H];
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.globalCompositeOperation = 'lighter'; ctx.filter = `blur(${Math.round(s * 1.6)}px)`; ctx.globalAlpha = .8;
  ctx.drawImage(portG, cx, cy, cw, ch, x, y, cw * s, ch * s);
  ctx.restore();
  ctx.save(); ctx.imageSmoothingEnabled = false; ctx.drawImage(portC, cx, cy, cw, ch, x, y, cw * s, ch * s); ctx.restore();
}

const ALBUM_CLOSE = { x: 380, y: 650, w: 120, h: 38 };
const albumTile = i => ({ x: 52 + (i % 5) * 162, y: 128 + Math.floor(i / 5) * 214, w: 150, h: 200 });
const ELITE_BTNS = [{ x: 942, y: 372, w: 96, h: 30, elite: false }, { x: 1052, y: 372, w: 96, h: 30, elite: true }];
function albumDown(m) {
  if (inRect(m, ALBUM_CLOSE)) { albumOpen = false; return; }
  const es = albumEntries();
  for (let i = 0; i < es.length; i++) if (inRect(m, albumTile(i))) { albumSel = i; albumElite = false; return; }
  const e = es[albumSel];
  if (e && e.kind && !e.guard) for (const b of ELITE_BTNS) if (inRect(m, b)) albumElite = b.elite;
}
function albumKey(k) { if (k === 'Escape') albumOpen = false; }

// 血量写成一句话：普通怪按这一段的底数 ×（1~4）× 血厚系数；看门的写死
function albumHp(e) {
  const M = MONSTERS[e.kind];
  if (e.guard) return `血 ${fmt(e.hp)}`;
  const F = FLOORS.find(f => f.name === e.where), lo = F.normal * M.hpMul, hi = lo * 4;
  return `血 ${fmt(niceHp(lo))} ~ ${fmt(niceHp(hi))}（凶的 ×${ELITE.hp}）`;
}

function drawAlbum(ctx, t) {
  ctx.fillStyle = '#040508'; ctx.fillRect(0, 0, 1280, 720);   // 整页盖住大厅（半透明会透出底下菜单的字）
  txt(ctx, '卡册', 52, 60, 30, '#efe2c4', 'left', 800);
  txt(ctx, '林子里碰到过的东西，都记在这儿' + (ALBUM_ALL ? '（还在测试：先全部摊开）' : ''), 132, 64, 14, '#a49c8c', 'left', 500);
  const es = albumEntries();
  let hot = -1;
  es.forEach((e, i) => {
    const r = albumTile(i), sel = i === albumSel, h = inRect(mouse, r); if (h) hot = i;
    const known = e.kind && (ALBUM_ALL || dexOf(e.kind).seen > 0), metal = FLOOR_METAL[e.where] || [150, 150, 150];
    ctx.fillStyle = sel ? 'rgba(40,36,30,.95)' : 'rgba(18,18,22,.95)'; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = rgba(sel ? mix(metal, [255, 255, 255], .4) : h ? metal : mix(metal, [0, 0, 0], .45)); ctx.lineWidth = sel ? 3 : 2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    // 画框：从中间往外暗下去，底下一圈淡淡的法阵
    const g = ctx.createRadialGradient(r.x + r.w / 2, r.y + 78, 4, r.x + r.w / 2, r.y + 78, 80);
    g.addColorStop(0, rgba(mix(metal, [10, 10, 14], .62))); g.addColorStop(1, 'rgba(10,10,14,0)');
    ctx.fillStyle = g; ctx.fillRect(r.x + 7, r.y + 7, r.w - 14, 140);
    if (known) {
      renderPortrait(e.kind, false, t + i * .7);
      ctx.save(); ctx.beginPath(); ctx.rect(r.x + 7, r.y + 7, r.w - 14, 140); ctx.clip();
      blitPortrait(ctx, r.x + r.w / 2 - 68, r.y + 10, 2, [14, 22, 68, 66]);
      ctx.restore();
    } else {
      txt(ctx, '？', r.x + r.w / 2, r.y + 76, 48, 'rgba(160,150,130,.35)', 'center', 800);
    }
    txt(ctx, known || !e.kind ? (e.kind ? MONSTERS[e.kind].name : e.name) : '？？？', r.x + r.w / 2, r.y + 164, 17, known ? '#efe4cc' : '#8a8478', 'center', 800);
    txt(ctx, e.where + (e.guard ? ' · 看门的' : ''), r.x + r.w / 2, r.y + 186, 12, e.guard ? '#e8b878' : '#9a9284', 'center', 600);
  });
  // 右边：点中的那只
  const e = es[albumSel] || es[0], px = 880, pw = 360;
  ctx.fillStyle = 'rgba(16,15,19,.96)'; ctx.fillRect(px, 100, pw, 560);
  ctx.strokeStyle = rgba(FLOOR_METAL[e.where] || [150, 150, 150]); ctx.lineWidth = 2; ctx.strokeRect(px + 1, 101, pw - 2, 558);
  const metal = FLOOR_METAL[e.where] || [150, 150, 150];
  const g2 = ctx.createRadialGradient(px + pw / 2, 230, 6, px + pw / 2, 230, 170);
  g2.addColorStop(0, rgba(mix(metal, [8, 8, 12], .55))); g2.addColorStop(1, 'rgba(8,8,12,0)');
  ctx.fillStyle = g2; ctx.fillRect(px + 8, 108, pw - 16, 256);
  ctx.strokeStyle = rgba(mix(metal, [255, 255, 255], .2), .25); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.ellipse(px + pw / 2, 330, 120, 26, 0, 0, TAU); ctx.stroke();   // 脚下一圈法阵
  if (e.kind) {
    const M = MONSTERS[e.kind];
    renderPortrait(e.kind, albumElite, t);
    ctx.save(); ctx.beginPath(); ctx.rect(px + 8, 108, pw - 16, 256); ctx.clip();
    blitPortrait(ctx, px + pw / 2 - 48 * 3, 108 + 6, 3, [0, 4, 96, 84]);
    ctx.restore();
    if (!e.guard) for (const b of ELITE_BTNS) btn(ctx, b, b.elite ? '凶的' : '平常', true, albumElite === b.elite || inRect(mouse, b));
    const name = (albumElite && !e.guard ? '凶·' : '') + M.name;
    txt(ctx, name, px + 24, 430, 26, albumElite ? '#ff9c84' : '#efe2c4', 'left', 800);
    txt(ctx, e.where + (e.guard ? ' · 看门的（不能逃）' : ' · 鬼火'), px + 24, 462, 13, e.guard ? '#e8b878' : '#a49c8c', 'left', 600);
    txt(ctx, M.traitName, px + 24, 494, 16, '#9fb8e8', 'left', 800);
    let yy = albumWrap(ctx, M.traitText, px + 24, 520, pw - 48, 13, '#c8c0b0');
    const atk = M.atk + (albumElite && !e.guard ? ELITE.atk : 0);
    txt(ctx, `${albumHp(e)}　倒计时 ${M.cd}　打掉 ${heartWord(atk)}心`, px + 24, yy + 28, 13, '#d8d0c0', 'left', 600);
    albumWrap(ctx, M.lore, px + 24, yy + 58, pw - 48, 13, '#a49c8c');
    const d = dexOf(e.kind);
    txt(ctx, `碰到 ${d.seen} 次　打倒 ${d.beaten} 只`, px + pw - 20, 640, 12, 'rgba(200,190,170,.7)', 'right', 500);
  } else {
    txt(ctx, '？', px + pw / 2, 236, 96, 'rgba(160,150,130,.25)', 'center', 800);
    txt(ctx, e.name, px + 24, 430, 26, '#bdb4a2', 'left', 800);
    txt(ctx, e.where + (e.guard ? ' · 看门的' : '') + '　还没碰到过', px + 24, 462, 13, '#8a8478', 'left', 600);
    albumWrap(ctx, e.lore, px + 24, 500, pw - 48, 13, '#8a8478');
  }
  btn(ctx, ALBUM_CLOSE, '合上', true, inRect(mouse, ALBUM_CLOSE));
  txt(ctx, '点一格看详细 · Esc 合上', 52, 669, 12, 'rgba(200,190,170,.5)', 'left', 500);
}
// 左对齐的自动换行
function albumWrap(ctx, s, x, y, w, size, col) {
  ctx.font = `500 ${size}px "PingFang SC",sans-serif`;
  let line = '', yy = y;
  for (const ch of s) { if (ctx.measureText(line + ch).width > w) { txt(ctx, line, x, yy, size, col, 'left', 500); line = ''; yy += size + 7; } line += ch; }
  if (line) txt(ctx, line, x, yy, size, col, 'left', 500);
  return yy;
}
