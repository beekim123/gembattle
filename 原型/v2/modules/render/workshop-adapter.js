// 工坊像素堆叠接入层（第 3 步）。
// 只借工坊的「角色和摆件」，一概不画工坊的圆形展示台：地面和微粒由 scene-env.js 画（全屏 2D），
// 这里把像素堆叠模型画到同一块游戏画布上，用 StackRenderer 的 cached 模式（prepareActor + drawPreparedActor）。
//
// 几条规矩（方案 4.3）：
//   1. 像素清晰：1 个美术像素 = 整数个设备像素（pickK），像素层关闭平滑，绝不做小数拉伸。
//   2. 同种多只共用体素和图集（PW.Assets.spawn 的第三个参数），图集上限 28MB。
//   3. 角色一律画在工坊世界的原点，画完把整只的部件平移到目标位置：
//      抖动、前冲只是画面上的平移，不会被步态求解当成「走路」。
//   4. 受击闪白、死亡淡出用 ctx.filter 做；不支持 filter 的浏览器只是少这两个效果。
//   5. 工坊没加载成功（或网址带 ?art=blocks）时 workshopReady() 为 false，render/index.js 退回色块。
//
// 朝向：yaw = 0 面朝画面下方（怪面向主角），yaw = π 背朝画面（主角面向怪）。
import { applyPose } from './battle-pose.js';
const PW = typeof window !== 'undefined' ? window.PixelWorkshop : null;

const TILT = 0.6;               // 工坊俯视压扁
const HS = 0.8;                 // 每升高 1 格，屏幕上抬 0.8 格
const SIM_STEP = 1 / 120;       // 逻辑最长一步，跟工坊一致
const ATLAS_MB = 28;            // 图集上限（超过 32MB 显卡会掉到慢路径）
const SOFT_PARAMS = { gaitFreq: 1, tailFlex: 1, springiness: 1, speed: 1, scaleMul: 1 };

// 整数缩放：1 个美术像素取几个设备像素。unit 是「设备像素 / 布局单位」，scale 是「每个美术像素占几个布局单位」。
// 1920×1080 的画布 unit = 2，scale = 1 时 k = 2：美术像素和布局单位一比一。
export function pickK(unit, scale = 1) {
  const k = Math.round(unit * scale);
  return Math.max(1, Math.min(16, Number.isFinite(k) ? k : 1));
}

// 一个模型在 k = 1 时的包围盒 → 战斗里算血条、点选范围用的尺寸（布局单位，scale = 1 时）
export function sizeFromBox(box) {
  return { w: Math.max(1, Math.round(box.r - box.l)), h: Math.max(1, Math.round(-box.t)) };
}

export function workshopReady() {
  return !!(PW && PW.Renderer && PW.Renderer.StackRenderer && PW.Assets && PW.Habitats && PW.Habitats.HABITAT_MAP);
}
export const hasAsset = id => !!(PW && PW.Assets && PW.Assets.byId[id]);

let stage = null;
export const getStage = () => stage;

const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

// canvas：游戏画布；sizes：ACTOR_SIZE 对象（模型量好以后原地改，血条和点选范围跟着变）
export function createStage(canvas, { sizes = {}, lookIds = [] } = {}) {
  if (!workshopReady()) return null;
  const R = new PW.Renderer.StackRenderer(canvas);
  R.th = 0;                                          // 镜头不转；朝向全靠角色自己的 yaw
  R.atlas.setBudgetMB(ATLAS_MB);
  const hab = { ...PW.Habitats.HABITAT_MAP.forest, isWater: false };   // 一律按旱地画，不染水色
  const recs = new Map();
  const templates = new Map();
  const natives = new Map();                         // id → 包围盒（k = 1）
  const BAKE = PW.Renderer.BAKE_SCALE;
  let frame = 0, now = 0, unit = 2;
  let canvasW = 0, canvasH = 0;
  const supportsFilter = (() => { try { return typeof canvas.getContext('2d').filter === 'string'; } catch { return false; } })();

  function syncSize() {
    if (canvas.width === canvasW && canvas.height === canvasH) return;
    canvasW = canvas.width; canvasH = canvas.height;
    R.cv = canvas; R.dctx = canvas.getContext('2d');
    R.CW = canvasW; R.CH = canvasH;
    R.EW = Math.max(1, Math.ceil(canvasW / 4)); R.EH = Math.max(1, Math.ceil(canvasH / 4));
    R.ec.width = R.eb.width = R.EW; R.ec.height = R.eb.height = R.EH;
    R._ecDirty = false; R._glowOn = false;
    unit = canvasW / 960;
    for (const id of natives.keys()) publishSize(id);
  }
  function setK(k) { R.artPx = k; R.SCALE = k * BAKE; }

  // ---------- 记录：一个（模型, 位置名）一只实例 ----------
  function rec(id, slot = 'main') {
    const key = id + '|' + slot;
    let r = recs.get(key);
    if (r) return r;
    const def = PW.Assets.byId[id];
    if (!def) return null;
    const tpl = templates.get(id);
    const seed = hashStr(key);
    const inst = PW.Assets.spawn(def, { seed: seed % 997 + 1 }, tpl);
    if (!tpl) templates.set(id, inst);
    r = { id, def, inst, slot, vfx: new PW.Renderer.VFXPool(), time: (seed % 100) * 0.07, act: 'idle', actT: 0, frame: -1, yaw: null, seed: 19 + (seed % 200), pose: null };
    // 战斗姿态（battle-pose.js）：每帧拿到部件表以后，按当前姿态把部件整体挪一挪。模型文件本身不动。
    const build = inst.buildPartList.bind(inst);
    inst.buildPartList = h => applyPose(build(h), inst.state, r.pose);
    recs.set(key, r);
    return r;
  }

  const actInfo = (r, id) => (r.def.actions || []).find(a => a.id === id);
  function setAct(r, act, actT) {
    const a = act || 'idle';
    if (a !== r.act) { r.act = a; r.actT = 0; }
    if (actT !== undefined) r.actT = actT;
  }

  function stepRec(r, dt, yaw) {
    if (r.yaw !== yaw) { r.yaw = yaw; r.inst.reset ? r.inst.reset(0, 0, yaw) : (r.inst.state.yaw = yaw); }
    let rem = dt;
    while (rem > 1e-6) {
      const h = Math.min(SIM_STEP, rem);
      r.time += h; r.actT += h;
      const ai = actInfo(r, r.act);
      if (ai && !ai.loop && ai.duration && r.actT > ai.duration) { r.act = 'idle'; r.actT = 0; }
      r.inst.update(h, r.time, SOFT_PARAMS, hab, r.vfx, {
        patrol: r.act === 'patrol', action: r.act, actionTime: r.actT,
        homeX: 0, homeY: 0, homeYaw: yaw, maxRadius: 0, seed: r.seed, self: r.inst, allActors: [],
      });
      rem -= h;
    }
    r.vfx.update(dt);
  }

  // 量一只的包围盒（k = 1）。画出来以前先量，血条和点选范围才对得上。
  function measure(id, yaw = 0) {
    const r = rec(id, 'measure');
    if (!r) return null;
    stepRec(r, 0.5, yaw);
    setK(1);
    const parts = R.prepareActor(r.inst, hab, 1, 0);
    const W2 = canvas.width / 2, H2 = canvas.height / 2 + 16 * R.SCALE;
    let l = 1e9, t = 1e9, rr = -1e9, b = -1e9;
    for (const p of parts) {
      if (p.kind === 'line' || !p._e) continue;
      l = Math.min(l, p._dx); t = Math.min(t, p._dy); rr = Math.max(rr, p._dx + p._dw); b = Math.max(b, p._dy + p._dh);
    }
    const box = { l: l - W2, r: rr - W2, t: t - H2, b: b - H2 };
    natives.set(id, box);
    publishSize(id);
    return box;
  }
  function publishSize(id) {
    const box = natives.get(id);
    if (!box || !sizes) return;
    const s = sizeFromBox(box);
    const k = pickK(unit, 1);
    const f = k / Math.max(1e-6, unit);                // 实际画出来的大小 / 布局里的 1:1
    sizes[id] = { w: Math.round(s.w * f), h: Math.round(s.h * f) };
  }

  // ---------- 滤镜：闪白、淡出 ----------
  function filterFor(flash, alpha, dim) {
    const parts = [];
    if (flash > 0.02) parts.push(`brightness(${(1 + 2.6 * Math.min(1, flash)).toFixed(2)}) saturate(${(1 - 0.6 * Math.min(1, flash)).toFixed(2)})`);
    if (dim) parts.push(`brightness(${dim})`);
    if (alpha < 0.99) parts.push(`opacity(${Math.max(0, alpha).toFixed(2)})`);
    return parts.length ? parts.join(' ') : 'none';
  }

  // ---------- 自亮：把这一件的自亮层柔化叠到画面上 ----------
  function flushGlow(d) {
    if (!R._glowOn) return;
    const { EW, EH, cv, SCALE, ectx, ebctx } = R;
    const blur = Math.max(1, Math.round(SCALE * 0.16));
    const pad = blur * 3 + 2, g = R._g;
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const x0 = cl(Math.floor(g[0] - pad), 0, EW), y0 = cl(Math.floor(g[1] - pad), 0, EH);
    const x1 = cl(Math.ceil(g[2] + pad), 0, EW), y1 = cl(Math.ceil(g[3] + pad), 0, EH);
    const w = x1 - x0, h = y1 - y0;
    if (w > 0 && h > 0) {
      const inv = cv.width / EW;
      ebctx.setTransform(1, 0, 0, 1, 0, 0);
      ebctx.clearRect(x0, y0, w, h);
      ebctx.filter = `blur(${blur}px)`;
      ebctx.drawImage(R.ec, x0, y0, w, h, x0, y0, w, h);
      ebctx.filter = 'none';
      d.setTransform(1, 0, 0, 1, 0, 0);
      d.globalCompositeOperation = 'screen';
      d.imageSmoothingEnabled = true;
      d.globalAlpha = 0.68;
      d.drawImage(R.eb, x0, y0, w, h, x0 * inv, y0 * inv, w * inv, h * inv);
      d.globalAlpha = 0.48;
      d.imageSmoothingEnabled = false;
      d.drawImage(R.ec, x0, y0, w, h, x0 * inv, y0 * inv, w * inv, h * inv);
      d.globalAlpha = 1;
      d.globalCompositeOperation = 'source-over';
      ectx.setTransform(1, 0, 0, 1, 0, 0);
      ectx.clearRect(x0, y0, w, h);
    }
    R._glowOn = false; R._ecDirty = false;
  }

  // ---------- 画一件 ----------
  // o: { slot 位置名, scale 每个美术像素占几个布局单位（默认 1）, yaw, act / actT 动作与时长,
  //      flash 0..1 闪白, alpha 淡出, dx dy 布局单位的位移, dark 压暗倍数（摆件用）, shadow 脚下暗斑（默认开）,
//      pose 战斗姿态参数（battle-pose.js 的 poseOf 算出来的 lean dive hop shrink twist topple） }
  function draw(ctx, id, x, y, o = {}) {
    syncSize();
    const r = rec(id, o.slot);
    if (!r) return false;
    const m = ctx.getTransform();
    const u = m.a;                                       // 设备像素 / 布局单位
    const k = pickK(u, o.scale ?? 1);
    setK(k);
    const yaw = o.yaw ?? 0;
    if (r.frame !== frame) {
      r.frame = frame;
      if (o.act !== undefined || o.actT !== undefined) setAct(r, o.act, o.actT);
      else if (r.act !== 'idle' && !actInfo(r, r.act)?.duration) setAct(r, 'idle');
      if (r.yaw === null) stepRec(r, 0.3, yaw);          // 第一次出场：先走几步，让弹簧和步态落稳
      stepRec(r, Math.min(0.05, Math.max(0, now - (r.lastNow ?? now))), yaw);
    }
    r.lastNow = now;
    r.pose = o.pose || null;

    const X = m.e + m.a * (x + (o.dx || 0));
    const Y = m.f + m.d * (y + (o.dy || 0));
    const alpha = o.alpha ?? 1;
    const d = R.dctx;
    const SC = R.SCALE;

    // 脚下暗斑：一块压扁的暗椭圆，不是展示台
    if (o.shadow !== false && alpha > 0.02) {
      const fr = (r.def.footRadius || 10) * SC;
      d.save(); d.setTransform(1, 0, 0, 1, 0, 0);
      d.globalAlpha = 0.34 * alpha; d.fillStyle = '#000';
      d.beginPath(); d.ellipse(X, Y + 1, fr, fr * 0.85 * TILT, 0, 0, Math.PI * 2); d.fill();
      d.restore();
    }

    const parts = R.prepareActor(r.inst, hab, 1, 0);
    const W2 = canvas.width / 2, H2 = canvas.height / 2 + 16 * SC;
    const sx = Math.round((X - W2) / k) * k, sy = Math.round((Y - H2) / k) * k;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.kind === 'line') {
        const pts = p._pts, gx = Math.round(sx / p._grid), gy = Math.round(sy / p._grid);
        for (let j = 0; j < pts.length; j += 2) { pts[j] += gx; pts[j + 1] += gy; }
      } else { p._dx += sx; p._dy += sy; }
    }

    d.save();
    if (supportsFilter) d.filter = filterFor(o.flash || 0, alpha, o.dark);
    R.drawPreparedActor(parts);
    d.restore();                                         // 同时把 filter 和平滑设置还回去
    d.save();
    flushGlow(d);
    d.restore();

    // 这一只带出来的 3D 像素粒子（施法迸出的宝石弹丸、营火火屑等）
    const ps = r.vfx.particles;
    if (ps.length) {
      d.save(); d.setTransform(1, 0, 0, 1, 0, 0);
      if (supportsFilter && o.dark) d.filter = filterFor(0, 1, o.dark);
      for (const p of ps) {
        const uu = p.t / p.life;
        const px = W2 + p.x * SC + sx, py = H2 + p.y * TILT * SC - p.z * HS * SC + sy;
        const s = Math.max(2, Math.round(p.sz * (1 - uu * 0.5) * SC));
        d.globalAlpha = alpha * (1 - uu * 0.4);
        if (p.glow) { d.globalAlpha *= 0.35; d.fillStyle = p.color; d.fillRect(Math.round(px) - s, Math.round(py) - s, s * 2, s * 2); d.globalAlpha = alpha * (1 - uu * 0.4); }
        d.fillStyle = p.color; d.fillRect(Math.round(px) - (s >> 1), Math.round(py) - (s >> 1), s, s);
      }
      d.restore();
    }
    return true;
  }

  stage = {
    R, hab,
    draw, measure, rec,
    // 每帧开头调一次：给全部实例一个共同的时间
    beginFrame(tSec) {
      frame++; now = tSec; syncSize();
      R.frame++; R.atlas.frame = R.frame; R.scratchIdx = 0; R.updateTint(hab);
      const st = R.stats; st.frameBakes = 0; st.frameBakeMs = 0; st.frameDraws = 0; st.frameParts = 0;
    },
    cacheInfo: () => R.cacheInfo(),
    has: id => hasAsset(id),
    unit: () => unit,
  };
  syncSize();
  for (const id of lookIds) measure(id, id === 'npc_mage' ? Math.PI : 0);
  return stage;
}
