'use strict';
// 画面分四层：
//   world  低分辨率像素层（整数倍放大，像素方方正正）：地面、影子、物件
//   shade  高分辨率：黑暗（挖出亮圈）、薄雾、暗角——渐变是平滑的，不会一格一格
//   glow   高分辨率，滤色叠加：会发光的东西（宝石、萤火、鬼火、法术）+ 一层柔光
//   ui     文字和界面
const GEM_COLORS = [[255, 96, 80], [96, 240, 130], [96, 150, 255]];
const shadeC = document.getElementById('shade'), sctx = shadeC.getContext('2d');
const glowC = document.getElementById('glow'), gctx = glowC.getContext('2d');
const EC = document.createElement('canvas'), ectx = EC.getContext('2d');   // 发光的东西先画在这张低分辨率图上
const eyes = [], flies = [], ripples = [];
let rippleT = 0;

// 世界像素坐标 → shade / glow 画布坐标
const SX = x => (VIEW.ox + x * VIEW.scale) * VIEW.dpr;
const SY = y => (VIEW.oy + y * VIEW.scale) * VIEW.dpr;
const SK = () => VIEW.scale * VIEW.dpr;

function updateFlies(dt) {
  while (flies.length < 22) flies.push({ x: CAM.x + (Math.random() - .5) * 220, y: CAM.y + (Math.random() - .5) * 160, z: 4 + Math.random() * 18, p: Math.random() * TAU, s: .5 + Math.random() * .8 });
  for (const f of flies) {
    f.p += dt * f.s;
    f.x += Math.cos(f.p * 1.3) * dt * 4; f.y += Math.sin(f.p) * dt * 4; f.z = clamp(f.z + Math.sin(f.p * 2.1) * dt * 3, 3, 24);
    if (f.x - CAM.x > 120) f.x -= 240; if (f.x - CAM.x < -120) f.x += 240;
    if (f.y - CAM.y > 90) f.y -= 180; if (f.y - CAM.y < -90) f.y += 180;
  }
}
function updateRipples(dt) {
  rippleT -= dt;
  if (rippleT < 0) {
    rippleT = .3 + Math.random() * .4;
    for (let k = 0; k < 12; k++) {
      const x = CAM.x + (Math.random() - .5) * 200, y = CAM.y + (Math.random() - .5) * 140;
      if (isWater(x, y) && isWater(x + 4, y) && isWater(x - 4, y) && isWater(x, y + 3) && isWater(x, y - 3)) { ripples.push({ x, y, a: 0 }); break; }
    }
  }
  for (let i = ripples.length - 1; i >= 0; i--) { ripples[i].a += dt; if (ripples[i].a > 2.4) ripples.splice(i, 1); }
}
function gemOrbit(pl, t) {
  return [0, 1, 2].map(i => {
    const a = t * 1.3 + i * TAU / 3;
    return { x: pl.x + Math.cos(a) * 7, y: pl.y + Math.sin(a) * 7, z: 12 + Math.sin(t * 2.2 + i * 2) * 1.5, c: GEM_COLORS[i] };
  });
}
// 影子：每样东西脚下一块压扁的暗斑，东西才“站”在地上
function shadowOf(o) {
  const m = o.m;
  if (o.tall) return o.dead ? [m.sx * .2, .3] : [m.sx * .36, .26];
  if (o.r) return [Math.max(3, o.r * 1.05), .3];
  return [m.sx * .32, .22];
}
function drawShadow(ctx, x, y, r, a) {
  groundTransform(ctx, x, y);
  ctx.fillStyle = `rgba(6,10,12,${a})`;
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * .85, 0, 0, TAU); ctx.fill();
}

const GM = document.createElement('canvas'), gmx = GM.getContext('2d');
let gmKey = '', chunkSerial = 0;
function groundMosaic(near) {
  if (!near.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const c of near) { if (!c.id) c.id = ++chunkSerial; x0 = Math.min(x0, c.cx); y0 = Math.min(y0, c.cy); x1 = Math.max(x1, c.cx); y1 = Math.max(y1, c.cy); }
  const key = x0 + ',' + y0 + ':' + near.map(c => c.id).join(',');
  if (key !== gmKey) {
    gmKey = key;
    GM.width = (x1 - x0 + 1) * CH; GM.height = (y1 - y0 + 1) * CH;
    gmx.fillStyle = '#05080a'; gmx.fillRect(0, 0, GM.width, GM.height);
    for (const c of near) gmx.drawImage(c.ground, (c.cx - x0) * CH, (c.cy - y0) * CH);
  }
  return { x0, y0 };
}

// view: {player, t, dt, monster?, battle?, chunks?, lightR?, dark?, calm?, groundFx?, fx?(ectx), overFx?(ectx)}
function renderWorld(ctx, view) {
  const { player: pl, t } = view, W = CAM.W, H = CAM.H, dt = view.dt || 0;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#05080a'; ctx.fillRect(0, 0, W, H);
  const near = view.chunks || nearChunks(CAM.x, CAM.y, Math.hypot(W, H) * .75);
  // 地面：看得到的几块先拼成一整张，再一次斜着贴上去（一块块贴，接口会漏缝）
  const gm = groundMosaic(near);
  if (gm) { groundTransform(ctx, gm.x0 * CH, gm.y0 * CH); ctx.drawImage(GM, 0, 0); }
  // 地上的落叶、碎石：一颗一个屏幕像素，不跟着地面图压扁变糊
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  for (const c of near) if (c.decals) for (const d of c.decals) {
    const p = proj(d.x, d.y); if (p.x < 0 || p.x >= W || p.y < 0 || p.y >= H) continue;
    ctx.fillStyle = d.c; ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  }
  updateRipples(dt);
  ctx.lineWidth = 1;
  for (const r of ripples) {
    groundTransform(ctx, r.x, r.y);
    ctx.strokeStyle = `rgba(150,182,204,${.32 * (1 - r.a / 2.4)})`;
    ctx.beginPath(); ctx.arc(0, 0, 1 + r.a * 4.5, 0, TAU); ctx.stroke();
  }
  if (view.groundFx) view.groundFx(ctx);

  // 物件
  const pp = proj(pl.x, pl.y), list = [];
  for (const c of near) for (const o of c.objs) {
    const p = proj(o.x, o.y);
    if (p.x < -40 || p.x > W + 40 || p.y < -8 || p.y - o.m.sz * CAM.hs > H + 8) continue;
    list.push({ o, p, ry: p.ry });
  }
  for (const it of list) { const [r, a] = shadowOf(it.o); drawShadow(ctx, it.o.x, it.o.y, r, a); }
  drawShadow(ctx, pl.x, pl.y, 3.6, .38);
  const mon = view.monster;
  if (mon && mon.alpha > 0) drawShadow(ctx, mon.x, mon.y, 8, .32 * mon.alpha);
  list.push({ player: true, p: pp, ry: pp.ry });
  if (mon) { const p = proj(mon.x, mon.y); list.push({ mon, p, ry: p.ry }); }
  list.sort((a, b) => a.ry - b.ry);
  const face = Math.round((pl.h - Math.PI / 2) / (Math.PI / 4)) * (Math.PI / 4);   // 主角朝向按 8 个方向，转起来不糊
  if (EC.width !== W || EC.height !== H) { EC.width = W; EC.height = H; }
  ectx.setTransform(1, 0, 0, 1, 0, 0); ectx.globalCompositeOperation = 'source-over'; ectx.globalAlpha = 1;
  ectx.clearRect(0, 0, W, H);
  EMIT = ART.on ? ectx : null;   // 画师画的发光像素跟着物件一起画进发光层
  for (const it of list) {
    if (it.player) { drawStack(ctx, heroModel(pl.moving, pl.walk), it.p, face); continue; }
    if (it.mon) { if (mon.alpha > 0) drawStack(ctx, mon.model, it.p, mon.ro, mon.alpha, mon.lift); continue; }
    const o = it.o;
    let a = 1;
    if (o.tall && it.ry > pp.ry && Math.abs(it.p.x - pp.x) < o.m.sx * .5 && it.p.y - o.m.sz * CAM.hs < pp.y - 6 && it.p.y > pp.y - 4) a = .35;
    if (view.battle && o.r && mon && it.ry > proj(mon.x, mon.y).ry - 6 && Math.abs(it.p.x - CAM.W / 2) < 70) a = Math.min(a, .22);
    const sway = o.tall ? Math.sin(t * .7 + o.x * .13) * 1.2 : 0;   // 只把上面几层整像素地挪一点，不重新采样
    drawStack(ctx, o.m, it.p, o.ro, a, 0, sway);
  }

  EMIT = null;
  // ---------- 发光层（低分辨率先画，之后放大 + 柔光） ----------
  ectx.setTransform(1, 0, 0, 1, 0, 0);
  const gems = gemOrbit(pl, t);
  for (const g of gems) {
    const p = proj(g.x, g.y, g.z), x = Math.round(p.x), y = Math.round(p.y);
    ectx.fillStyle = rgba(mix(g.c, [255, 255, 255], .55)); ectx.fillRect(x, y, 1, 1);
    ectx.fillStyle = rgba(g.c); ectx.fillRect(x - 1, y, 1, 1); ectx.fillRect(x + 1, y, 1, 1); ectx.fillRect(x, y - 1, 1, 1); ectx.fillRect(x, y + 1, 1, 1);
  }
  updateFlies(dt);
  for (const f of flies) {
    const b = Math.max(0, Math.sin(f.p * 3.1)); if (b < .05) continue;
    const p = proj(f.x, f.y, f.z);
    ectx.fillStyle = `rgba(226,255,150,${b})`; ectx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
  }
  if (!view.battle && !view.calm) {   // 黑暗里一闪一闪的眼睛
    if (eyes.length < 2 && Math.random() < .004) {
      const a = Math.random() * TAU, d = 72 + Math.random() * 40;
      eyes.push({ x: pl.x + Math.cos(a) * d, y: pl.y + Math.sin(a) * d, z: 4 + Math.random() * 14, age: 0, life: 2 + Math.random() * 3, w: Math.random() < .5 ? 2 : 3, red: Math.random() < .3 });
    }
    for (let i = eyes.length - 1; i >= 0; i--) {
      const e = eyes[i]; e.age += dt;
      if (e.age > e.life || Math.hypot(e.x - pl.x, e.y - pl.y) < 60) { eyes.splice(i, 1); continue; }
      if (Math.abs(((e.age * .7) % 1) - .5) < .04) continue;
      const p = proj(e.x, e.y, e.z), a = Math.min(1, e.age * 2, (e.life - e.age) * 2) * .75;
      ectx.fillStyle = e.red ? `rgba(220,80,60,${a})` : `rgba(220,214,160,${a})`;
      ectx.fillRect(Math.round(p.x - e.w / 2) - 1, Math.round(p.y), 1, 1); ectx.fillRect(Math.round(p.x + e.w / 2), Math.round(p.y), 1, 1);
    }
  }
  if (view.fx) view.fx(ectx);
  if (view.overFx) view.overFx(ectx);
  ectx.setTransform(1, 0, 0, 1, 0, 0);

  // ---------- 黑暗层 ----------
  const k = SK();
  sctx.setTransform(1, 0, 0, 1, 0, 0); sctx.globalCompositeOperation = 'source-over';
  sctx.clearRect(0, 0, shadeC.width, shadeC.height);
  const lights = [{ x: pl.x, y: pl.y, z: 8, r: view.lightR || 66, a: 1 }];
  if (mon && mon.alpha > 0) { lights.push({ x: mon.x, y: mon.y, z: mon.lift + 30, r: 48, a: .85 * mon.alpha }); }
  for (const c of near) for (const o of c.objs) {
    if (o.glow) lights.push({ x: o.x, y: o.y, z: 2, r: 13, a: .45, c: [110, 200, 186] });
    if (o.light) lights.push({ x: o.x, y: o.y + 3, z: 14, r: 62 + 3 * Math.sin(t * 2.1), a: .95, c: ART.on ? artCol('runeGlow', [110, 200, 255]) : [255, 150, 70] });
  }
  if (!window.NOLIGHT) {
    sctx.fillStyle = `rgba(6,10,22,${view.dark ?? .76})`; sctx.fillRect(0, 0, shadeC.width, shadeC.height);
    sctx.globalCompositeOperation = 'destination-out';
    const flick = .97 + .03 * Math.sin(t * 7.1) * Math.sin(t * 3.3);
    for (const L of lights) {
      const p = proj(L.x, L.y, L.z * .5), r = L.r * flick * k;
      sctx.setTransform(1, 0, 0, .8, SX(p.x), SY(p.y));
      const g = sctx.createRadialGradient(0, 0, 0, 0, 0, r);
      g.addColorStop(0, `rgba(0,0,0,${L.a})`); g.addColorStop(.55, `rgba(0,0,0,${L.a * .72})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      sctx.fillStyle = g; sctx.fillRect(-r, -r, r * 2, r * 2);
    }
    sctx.globalCompositeOperation = 'source-over';
    // 暗角
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    const w = shadeC.width, h = shadeC.height, vg = sctx.createRadialGradient(w / 2, h / 2, h * .35, w / 2, h / 2, h * .95);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,6,.55)');
    sctx.fillStyle = vg; sctx.fillRect(0, 0, w, h);
  }

  // ---------- 发光层合成 ----------
  gctx.setTransform(1, 0, 0, 1, 0, 0); gctx.globalCompositeOperation = 'source-over'; gctx.filter = 'none';
  gctx.clearRect(0, 0, glowC.width, glowC.height);
  // 有色光：宝石带一点三色，石碑暖，菌子冷
  for (const g of gems) lights.push({ x: g.x, y: g.y, z: g.z, r: 24, a: .5, c: g.c, tint: .13 });
  for (const L of lights) {
    if (!L.c) continue;
    const p = proj(L.x, L.y, L.z * .6), r = L.r * .6 * k;
    gctx.setTransform(1, 0, 0, .8, SX(p.x), SY(p.y));
    const g = gctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, rgba(L.c, L.tint || .2)); g.addColorStop(1, rgba(L.c, 0));
    gctx.fillStyle = g; gctx.fillRect(-r, -r, r * 2, r * 2);
  }
  gctx.setTransform(1, 0, 0, 1, 0, 0);
  const ew = W * VIEW.scale * VIEW.dpr, eh = H * VIEW.scale * VIEW.dpr, ex = VIEW.ox * VIEW.dpr, ey = VIEW.oy * VIEW.dpr;
  gctx.imageSmoothingEnabled = true; gctx.filter = `blur(${Math.round(2.2 * k)}px)`; gctx.globalAlpha = .9;
  gctx.drawImage(EC, ex, ey, ew, eh);                       // 柔光
  gctx.filter = 'none'; gctx.globalAlpha = 1; gctx.imageSmoothingEnabled = false;
  gctx.drawImage(EC, ex, ey, ew, eh);                       // 本体，像素清楚
}
