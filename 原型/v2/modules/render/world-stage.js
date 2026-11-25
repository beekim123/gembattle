// 统一伪 3D 世界舞台：地面、摆件、怪、主角、脚底暗斑、选中环、3D 粒子和技能特效，都活在同一个世界坐标 (wx, wy, wz) 里，
// 共用一台 StackRenderer 和一个镜头角 th（camera.js）。前身是 workshop-adapter.js，那边现在只剩一层兼容出口。
//
// 一帧的流程（跟工坊 renderScene 同一套两阶段批处理）：
//   场景代码：stage.beginFrame → env.draw / stage.actor(...) 把这一帧要画的东西排进队 → stage.render(ctx) → 再画 2D 界面
//   render：  地面（无缝大 Tilemap 底纹 + 唯一场景地标，随 th 旋转压扁铺满）→ 暗角 → 先把全部角色的贴图解析好（烘焙都在这一步）
//             → 按深度从远到近画（脚底暗斑 / 选中环 / 角色 / 角色身上的 3D 粒子）→ 地面微粒 → 技能特效 → 整帧只做 1 次自亮柔化
//
// 几条规矩：
//   1. 像素清晰：1 个美术像素 = 整数个设备像素（pickK），像素层关闭平滑；
//   2. 主画布上一律不用画布滤镜，也不用画布自带的实时模糊效果：闪白用图集贴图叠白，淡出用 globalAlpha，摆件压暗在实例化时改调色板，
//      自亮柔化用「缩小一半再放大」的双线性取平均；
//   3. 同种多只共用体素和图集（PW.Assets.spawn 的第三个参数），图集上限 28MB；
//   4. 角色直接在世界坐标里模拟（怪的回合制动作要往目标位置冲、喷东西，都按世界坐标算），
//      交给渲染器画的时候再把部件减去「家」的位置，最后整体平移到屏幕上的落脚点；
//   5. 工坊没加载成功（或网址带 ?art=blocks）时 workshopReady() 为 false，render/index.js 退回色块。
//
// 朝向：yaw = 0 面朝画面下方（怪面向主角），yaw = π 背朝画面（主角面向怪）。
import { applyPose } from './battle-pose.js';
import { buildFallbackTile, buildVignette } from './ground-fallback.js';
import { buildGround } from './tilemap-ground.js';
import { BIOMES } from '../content/biomes.js';
import { TILT, HS, BAKE_SCALE, camera as sharedCamera, layoutToWorld, anchor as anchorOf, project, depthOf, heightToWorld } from './camera.js';
const PW = typeof window !== 'undefined' ? window.PixelWorkshop : null;

const SIM_STEP = 1 / 120;       // 逻辑最长一步，跟工坊一致
const ATLAS_MB = 28;            // 图集上限（超过 32MB 显卡会掉到慢路径）
const GROUND_CACHE = 4;         // 同时留着几个生态的地面（每个约 1.3~1.8 MB），多了按最久没用的换掉；重建一个只要十几毫秒
const PROP_DIM = 0.85;          // 摆件压暗 15%：实例化时改调色板
const PROP_SHADOW = [[1.75, 0.1], [1.3, 0.13], [0.9, 0.17]];   // 摆件接地暗斑：[半径倍数（乘脚底半径）, 透明度]，由大到小叠三层
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

// UI-04 地面与特效包（window.Code00ArtPacks.groundVfx）。没加载上返回 null，调用方走内置兜底。
export function groundPack() {
  const g = typeof window !== 'undefined' && window.Code00ArtPacks && window.Code00ArtPacks.groundVfx;
  return g && typeof g.buildGroundTile === 'function' ? g : null;
}
// 已挂载的美术包清单：[{ key, name, version }]，性能浮层用
export function mountedPacks() {
  const P = (typeof window !== 'undefined' && window.Code00ArtPacks) || {};
  return Object.keys(P).map(key => ({ key, name: P[key] && P[key].name ? P[key].name : key, version: P[key] && P[key].version }));
}

let stage = null;
export const getStage = () => stage;

const hashStr = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const BATTLE_ACTS = new Set(['battle_attack', 'battle_special', 'battle_stagger', 'battle_hurt']);
export const isBattleAct = a => BATTLE_ACTS.has(a);

// 摆件压暗：只在实例化时改一次调色板（跳过自亮色，营火的火不暗）。每帧零开销。
function dimAssets(inst, def, f) {
  const V = PW.Voxel, spec = def && def.spec;
  if (!V || !V.recolorAsset || !spec || !spec.idToRgba || !spec.glowIdSet || !inst.partListAssets) return false;
  const tbl = spec.idToRgba.map((c, id) => (c && !spec.glowIdSet.has(id) ? [Math.round(c[0] * f), Math.round(c[1] * f), Math.round(c[2] * f), c[3]] : c));
  for (const a of inst.partListAssets) V.recolorAsset(a, tbl, spec.glowIdSet);
  return true;
}

// canvas：游戏画布；sizes：ACTOR_SIZE 对象（模型量好以后原地改，血条和点选范围跟着变）
export function createStage(canvas, { sizes = {}, lookIds = [], camera = sharedCamera } = {}) {
  if (!workshopReady()) return null;
  const R = new PW.Renderer.StackRenderer(canvas);
  R.th = 0;
  R.atlas.setBudgetMB(ATLAS_MB);
  const hab = { ...PW.Habitats.HABITAT_MAP.forest, isWater: false };   // 一律按旱地画，不染水色
  const make = PW.Renderer.makeCanvas;
  const recs = new Map();
  const templates = new Map();
  const dimmed = new Set();
  const natives = new Map();                         // id → 包围盒（k = 1）
  const BAKE = PW.Renderer.BAKE_SCALE;
  let frame = 0, now = 0, dt = 0, unit = 2, k = 2;
  let canvasW = 0, canvasH = 0;
  const items = [];                                  // 这一帧要画的：角色、选中环、亮晕
  const effects = [];                                // 这一帧的 3D 技能特效 { fn(pack, proj) }
  const overlays = [];                               // 这一帧最后画的 2D 兜底（布局单位）
  const scene = { biome: 'forest', wind: 1 };
  const grounds = new Map();                         // 生态 id → { block, landmark, src, ms, mb }，按最近用过的顺序排，最多 GROUND_CACHE 个
  const vignettes = new Map();
  const spots = new Map();
  const stats = { drawMs: 0, items: 0, parts: 0, groundBuilds: 0, lastGroundMs: 0 };
  let flashCv = null, halfCv = null, halfW = 0, halfH = 0;

  function syncSize() {
    if (canvas.width === canvasW && canvas.height === canvasH) return;
    canvasW = canvas.width; canvasH = canvas.height;
    R.cv = canvas; R.dctx = canvas.getContext('2d');
    R.CW = canvasW; R.CH = canvasH;
    R.EW = Math.max(1, Math.ceil(canvasW / 4)); R.EH = Math.max(1, Math.ceil(canvasH / 4));
    R.ec.width = R.eb.width = R.EW; R.ec.height = R.eb.height = R.EH;
    R._ecDirty = false; R._glowOn = false;
    unit = canvasW / 960; k = pickK(unit, 1);
    halfW = Math.ceil(R.EW / 2); halfH = Math.ceil(R.EH / 2);
    if (!halfCv) halfCv = make(halfW, halfH); halfCv.width = halfW; halfCv.height = halfH;
    for (const id of natives.keys()) publishSize(id);
  }
  function setK(kk) { R.artPx = kk; R.SCALE = kk * BAKE; }

  // ---------- 记录：一个（模型, 位置名）一只实例 ----------
  function rec(id, slot = 'main', dark = 0) {
    const key = id + '|' + slot;
    let r = recs.get(key);
    if (r) return r;
    const def = PW.Assets.byId[id];
    if (!def) return null;
    const tpl = templates.get(id);
    const seed = hashStr(key);
    const inst = PW.Assets.spawn(def, { seed: seed % 997 + 1 }, tpl);
    if (!tpl) templates.set(id, inst);
    if (dark && !dimmed.has(id)) { dimmed.add(id); dimAssets(inst, def, dark); }
    r = { id, def, inst, slot, vfx: new PW.Renderer.VFXPool(), time: (seed % 100) * 0.07, act: 'idle', actT: 0, frame: -1, yaw: null, seed: 19 + (seed % 200), pose: null, home: [NaN, NaN], npc: /^npc_/.test(id) };
    // 每帧拿到部件表以后：先按战斗姿态挪一挪（battle-pose.js），再整体减去「家」的位置，
    // 这样渲染器算出来的屏幕位置是相对落脚点的，然后统一平移到屏幕上的落脚点。模型文件本身不动。
    const build = inst.buildPartList.bind(inst);
    inst.buildPartList = h => {
      const list = applyPose(build(h), inst.state, r.pose);
      const hx = r.home[0], hy = r.home[1];
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
        if (p.kind === 'line') { p.x0 -= hx; p.x1 -= hx; p.y0 -= hy; p.y1 -= hy; } else { p.x -= hx; p.y -= hy; }
      }
      return list;
    };
    recs.set(key, r);
    return r;
  }

  const actInfo = (r, id) => (r.def.actions || []).find(a => a.id === id);
  function setAct(r, act, actT) {
    const a = act || 'idle';
    if (a !== r.act) { r.act = a; r.actT = 0; }
    if (actT !== undefined) r.actT = actT;
  }

  // 推进一只的模拟。(wx, wy) 是它的家（世界坐标）；target 是怪出手要打的世界点 [x, y, z]
  function stepRec(r, dtSec, yaw, wx, wy, target) {
    const moved = r.home[0] !== wx || r.home[1] !== wy;
    if (moved || r.yaw === null) {
      r.home[0] = wx; r.home[1] = wy; r.yaw = yaw;
      if (r.inst.reset) r.inst.reset(wx, wy, yaw); else { r.inst.state.x = wx; r.inst.state.y = wy; r.inst.state.yaw = yaw; }
    } else if (r.npc && !isBattleAct(r.act) && Math.abs(r.inst.state.yaw - yaw) > 1e-4) {
      r.inst.state.yaw = yaw;                                  // 主角没有「家朝向」，直接转
    }
    r.yaw = yaw;
    let rem = dtSec;
    while (rem > 1e-6) {
      const h = Math.min(SIM_STEP, rem);
      r.time += h; r.actT += h;
      const ai = actInfo(r, r.act);
      if (ai && !ai.loop && ai.duration && r.actT > ai.duration) { r.act = 'idle'; r.actT = 0; }
      r.inst.update(h, r.time, SOFT_PARAMS, hab, r.vfx, {
        patrol: r.act === 'patrol', action: r.act, actionTime: r.actT,
        homeX: wx, homeY: wy, homeYaw: yaw, maxRadius: 0, seed: r.seed, self: r.inst, allActors: [], targetPos: target || null,
      });
      rem -= h;
    }
    r.vfx.update(dtSec);
  }

  // 量一只的包围盒（k = 1）。画出来以前先量，血条和点选范围才对得上。
  function measure(id, yaw = 0) {
    const r = rec(id, 'measure');
    if (!r) return null;
    stepRec(r, 0.5, yaw, 0, 0, null);
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
    const kk = pickK(unit, 1);
    const f = kk / Math.max(1e-6, unit);               // 实际画出来的大小 / 布局里的 1:1
    sizes[id] = { w: Math.round(s.w * f), h: Math.round(s.h * f) };
  }

  // ---------- 世界到屏幕（设备像素）----------
  // 世界原点落在画布的 origin × unit 处；转镜头就是绕它转。深度是 ry，越大越靠近镜头。
  let cosT = 1, sinT = 0, oX = 0, oY = 0, S = 5;
  function setCamera() {
    const th = camera.th; cosT = Math.cos(th); sinT = Math.sin(th);
    oX = camera.origin[0] * unit; oY = camera.origin[1] * unit; S = BAKE_SCALE * unit;
  }
  function proj(wx, wy, wz) {
    const rx = cosT * wx - sinT * wy, ry = sinT * wx + cosT * wy;
    return [oX + rx * S, oY + ry * TILT * S - wz * HS * S, ry];
  }

  // ---------- 地面 ----------
  // 无缝大 Tilemap 底纹（一个 576×576 的区块首尾相接）加一个唯一地标，见 tilemap-ground.js。按生态懒构建，跨场景缓存复用。
  function groundOf(biomeId) {
    let g = grounds.get(biomeId);
    if (g) { grounds.delete(biomeId); grounds.set(biomeId, g); return g; }          // 刷新「最近用过」
    const biome = BIOMES[biomeId] || BIOMES.forest;
    try { g = { ...buildGround(biome, make), src: 'tilemap' }; }
    catch {                                                                          // 万一画布不支持 putImageData：退回内置兜底砖，不拖垮整帧
      const t0 = performance.now(), cv = buildFallbackTile(biome, make, 384);
      g = { block: { canvas: cv, size: cv.width }, landmark: null, src: 'fallback', ms: performance.now() - t0, mb: 384 * 384 * 4 / 1048576 };
    }
    grounds.set(biomeId, g);
    while (grounds.size > GROUND_CACHE) grounds.delete(grounds.keys().next().value);
    stats.groundBuilds++; stats.lastGroundMs = g.ms;
    return g;
  }
  function vignetteOf(biomeId) {
    let v = vignettes.get(biomeId);
    if (!v) { v = buildVignette(BIOMES[biomeId] || BIOMES.forest, make); vignettes.set(biomeId, v); }
    return v;
  }
  // 底层区块随镜头角旋转压扁铺满画布：区块像素 (u, v) → 屏幕 = 原点 + k·[cos·u − sin·v, TILT·(sin·u + cos·v)]。
  // 一块一块 drawImage 贴（4K 下十来块，约 1.5 毫秒）。不用 createPattern：整屏 pattern 填充在 4K 下要 17~27 毫秒。
  // 每块多画 1 个美术像素，盖住旋转时相邻两块边缘的抗锯齿缝。接着把唯一的地标贴在世界里它该在的位置上（同一个旋转压扁变换）。
  function drawGround(d) {
    const g = groundOf(scene.biome), sz = g.block.size;
    const a = k * cosT, b = k * TILT * sinT, c = -k * sinT, e = k * TILT * cosT;
    const det = a * e - b * c;
    let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
    for (let i = 0; i < 4; i++) {                                  // 屏幕四角反算回区块像素坐标，得到要贴的格子范围
      const X = (i & 1 ? canvasW : 0) - oX, Y = (i & 2 ? canvasH : 0) - oY;
      const u = (e * X - c * Y) / det, v = (-b * X + a * Y) / det;
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
    }
    const iu0 = Math.floor(u0 / sz), iu1 = Math.floor(u1 / sz), iv0 = Math.floor(v0 / sz), iv1 = Math.floor(v1 / sz);
    if ((iu1 - iu0 + 1) * (iv1 - iv0 + 1) > 400) return;           // 镜头参数出了问题时不要卡死
    d.imageSmoothingEnabled = false;
    d.setTransform(a, b, c, e, oX, oY);
    for (let iv = iv0; iv <= iv1; iv++) for (let iu = iu0; iu <= iu1; iu++) d.drawImage(g.block.canvas, 0, 0, sz, sz, iu * sz - 0.5, iv * sz - 0.5, sz + 1, sz + 1);
    const lm = g.landmark;
    if (lm) {
      const p = proj(lm.at[0], lm.at[1], 0);
      d.setTransform(a, b, c, e, Math.round(p[0]), Math.round(p[1]));
      d.drawImage(lm.canvas, Math.round(-lm.w / 2), Math.round(-lm.h / 2));
    }
    d.setTransform(1, 0, 0, 1, 0, 0);
  }
  function drawVignette(d) {
    d.imageSmoothingEnabled = true;
    d.drawImage(vignetteOf(scene.biome), 0, 0, canvasW, canvasH);
    d.imageSmoothingEnabled = false;
  }
  // 一团暖亮晕（营火脚下）：预画一张小画布，缩放到椭圆大小贴上去
  function spotCanvas(rgb) {
    let s = spots.get(rgb);
    if (!s) {
      s = make(96, 96); const c = s.getContext('2d');
      const g = c.createRadialGradient(48, 48, 2, 48, 48, 48);
      g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(1, `rgba(${rgb},0)`);
      c.fillStyle = g; c.fillRect(0, 0, 96, 96); spots.set(rgb, s);
    }
    return s;
  }

  // ---------- 自亮：整帧只做一次。缩小一半再放大代替模糊，不用滤镜 ----------
  function flushGlow(d) {
    if (!R._glowOn) return;
    const { EW, EH, cv, ectx } = R;
    const pad = Math.max(2, Math.round(R.SCALE * 0.5)) + 4, g = R._g;
    const cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const x0 = cl(Math.floor((g[0] - pad) / 2) * 2, 0, EW), y0 = cl(Math.floor((g[1] - pad) / 2) * 2, 0, EH);
    const x1 = cl(Math.ceil((g[2] + pad) / 2) * 2, 0, EW), y1 = cl(Math.ceil((g[3] + pad) / 2) * 2, 0, EH);
    const w = x1 - x0, h = y1 - y0;
    if (w > 0 && h > 0) {
      const inv = cv.width / EW, hc = halfCv.getContext('2d');
      hc.setTransform(1, 0, 0, 1, 0, 0);
      hc.clearRect(x0 / 2, y0 / 2, w / 2, h / 2);
      hc.imageSmoothingEnabled = true;
      hc.drawImage(R.ec, x0, y0, w, h, x0 / 2, y0 / 2, w / 2, h / 2);           // 2×2 取平均
      d.setTransform(1, 0, 0, 1, 0, 0);
      d.globalCompositeOperation = 'screen';
      d.imageSmoothingEnabled = true;
      d.globalAlpha = 0.68;
      d.drawImage(halfCv, x0 / 2, y0 / 2, w / 2, h / 2, x0 * inv, y0 * inv, w * inv, h * inv);   // 双线性放大回来
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

  // ---------- 受击闪白：把这一只的部件再贴一遍到小画布，打成纯白，叠回去 ----------
  function drawFlash(d, parts, amt) {
    let l = 1e9, t = 1e9, r = -1e9, b = -1e9;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.kind === 'line' || !p._e) continue;
      if (p._dx < l) l = p._dx; if (p._dy < t) t = p._dy;
      if (p._dx + p._dw > r) r = p._dx + p._dw; if (p._dy + p._dh > b) b = p._dy + p._dh;
    }
    l = Math.max(0, Math.floor(l) - 1); t = Math.max(0, Math.floor(t) - 1);
    r = Math.min(canvasW, Math.ceil(r) + 1); b = Math.min(canvasH, Math.ceil(b) + 1);
    const w = r - l, h = b - t;
    if (!(w > 0 && h > 0) || w * h > 4e6) return;
    if (!flashCv) flashCv = make(w, h);
    if (flashCv.width < w) flashCv.width = w;
    if (flashCv.height < h) flashCv.height = h;
    const f = flashCv.getContext('2d');
    f.setTransform(1, 0, 0, 1, 0, 0); f.globalCompositeOperation = 'source-over'; f.globalAlpha = 1; f.imageSmoothingEnabled = false;
    f.clearRect(0, 0, flashCv.width, flashCv.height);
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i], e = p._e;
      if (p.kind === 'line' || !e || e.gen !== e.page.gen) continue;
      f.globalAlpha = p._op;
      if (p._m) { f.setTransform(-1, 0, 0, 1, 2 * (p._dx - l) + p._dw, 0); f.drawImage(e.page.canvas, e.x, e.y, e.bw, e.bh, p._dx - l, p._dy - t, p._dw, p._dh); f.setTransform(1, 0, 0, 1, 0, 0); }
      else f.drawImage(e.page.canvas, e.x, e.y, e.bw, e.bh, p._dx - l, p._dy - t, p._dw, p._dh);
    }
    f.globalAlpha = 1; f.globalCompositeOperation = 'source-in'; f.fillStyle = '#fff'; f.fillRect(0, 0, w, h);
    f.globalCompositeOperation = 'source-over';
    d.globalAlpha = Math.min(1, amt) * 0.85;
    d.drawImage(flashCv, 0, 0, w, h, l, t, w, h);
    d.globalAlpha = 1;
  }

  // ---------- 排队 ----------
  // 把一个布局点（th = 0 时的位置）换成世界地面点
  const toWorld = (lx, ly) => layoutToWorld(camera.origin, lx, ly);

  // o: { slot 位置名, scale 每个美术像素占几个布局单位（默认 1）, yaw, act / actT 动作与时长, flash 0..1 闪白, alpha 淡出,
  //      dark 摆件压暗倍数（只在第一次实例化时生效）, shadow 脚下暗斑（默认开）, wz 离地高度（世界格）,
  //      prop 是环境摆件（接地暗斑用三层柔边）, still 落稳以后冻结在静止姿势（树、石碑这类不该自己动的）,
  //      pose 战斗姿态参数（battle-pose.js 的 poseOf）, target 怪出手要打的世界点 [x, y, z] }
  function actor(id, lx, ly, o = {}) {
    const r = rec(id, o.slot, o.dark);
    if (!r) return false;
    const [wx, wy] = toWorld(lx, ly);
    items.push({ kind: 'actor', r, wx, wy, wz: o.wz || 0, o, depth: 0, parts: null, kk: 1 });
    return true;
  }
  function ring(lx, ly, rLayout, o = {}) {
    const [wx, wy] = toWorld(lx, ly);
    items.push({ kind: 'ring', wx, wy, rw: rLayout / BAKE_SCALE, o, depth: 0 });
  }
  function glowSpot(lx, ly, rLayout, rgb, alpha) {
    const [wx, wy] = toWorld(lx, ly);
    items.push({ kind: 'spot', wx, wy, rw: rLayout / BAKE_SCALE, rgb, alpha, depth: 0 });
  }

  // ---------- 一帧 ----------
  function prepare(it) {
    const { r, wx, wy, o } = it;
    const kk = pickK(unit, o.scale ?? 1);
    it.kk = kk; setK(kk);
    const yaw = o.yaw ?? 0;
    if (r.frame !== frame) {
      r.frame = frame;
      if (o.act !== undefined || o.actT !== undefined) setAct(r, o.act, o.actT);
      else if (r.act !== 'idle' && !actInfo(r, r.act)?.duration) setAct(r, 'idle');
      if (r.yaw === null) stepRec(r, 0.3, yaw, wx, wy, o.target);          // 第一次出场：先走几步，让弹簧和步态落稳
      // 静止的摆件（树、倒木、石碑、帐篷、石门……）落稳以后不再往前模拟：回合制的画面里不该有它们自己晃来晃去。
      // 位置变了（换了镜头原点）才重新落一次脚。图集也不会再变脏，省烘焙。
      const moved = r.home[0] !== wx || r.home[1] !== wy;
      if (!(o.still && r.settled) || moved) stepRec(r, Math.min(0.05, Math.max(0, now - (r.lastNow ?? now))), yaw, wx, wy, o.target);
      if (o.still) r.settled = true;
    }
    r.lastNow = now;
    r.pose = o.pose || null;
    const parts = R.prepareActor(r.inst, hab, cosT, sinT);
    const foot = proj(wx, wy, it.wz);
    foot[0] += (o.dx || 0) * unit; foot[1] += (o.dy || 0) * unit;               // 抖动、前冲：画面上的平移（布局单位）
    it.fx = foot[0]; it.fy = foot[1]; it.depth = foot[2];
    const W2 = canvasW / 2, H2 = canvasH / 2 + 16 * R.SCALE;
    const sx = Math.round(foot[0] - W2), sy = Math.round(foot[1] - H2);
    const alpha = o.alpha ?? 1;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.kind === 'line') {
        const pts = p._pts, gx = Math.round(sx / p._grid), gy = Math.round(sy / p._grid);
        for (let j = 0; j < pts.length; j += 2) { pts[j] += gx; pts[j + 1] += gy; }
      } else { p._dx += sx; p._dy += sy; }
      if (alpha < 0.99) p._op *= Math.max(0, alpha);
    }
    it.parts = parts;
    stats.parts += parts.length;
  }

  // 角色身上的 3D 像素粒子（施法迸出的宝石弹丸、怪出手喷出的水弹花瓣、营火火屑等）：粒子坐标是世界坐标
  function drawParticles(d, it) {
    const ps = it.r.vfx.particles;
    if (!ps.length) return;
    const alpha = it.o.alpha ?? 1, SCk = it.kk * BAKE;
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i], uu = p.t / p.life;
      const [px, py] = proj(p.x, p.y, p.z);
      const s = Math.max(2, Math.round(p.sz * (1 - uu * 0.5) * SCk));
      d.globalAlpha = alpha * (1 - uu * 0.4);
      if (p.glow) { d.globalAlpha *= 0.35; d.fillStyle = p.color; d.fillRect(Math.round(px) - s, Math.round(py) - s, s * 2, s * 2); d.globalAlpha = alpha * (1 - uu * 0.4); }
      d.fillStyle = p.color; d.fillRect(Math.round(px) - (s >> 1), Math.round(py) - (s >> 1), s, s);
    }
    d.globalAlpha = 1;
  }

  function drawItem(d, it) {
    if (it.kind === 'ring') {
      const [x, y] = proj(it.wx, it.wy, 0), rr = it.rw * S;
      d.save(); d.globalAlpha = it.o.alpha ?? 1; d.strokeStyle = it.o.color || '#ffd24a'; d.lineWidth = Math.max(2, (it.o.width || 2) * unit);
      d.beginPath(); d.ellipse(x, y, rr, rr * TILT, 0, 0, Math.PI * 2); d.stroke(); d.restore();
      return;
    }
    if (it.kind === 'spot') {
      const [x, y] = proj(it.wx, it.wy, 0), rr = it.rw * S;
      d.save(); d.globalAlpha = it.alpha; d.drawImage(spotCanvas(it.rgb), x - rr, y - rr * TILT, rr * 2, rr * 2 * TILT); d.restore();
      return;
    }
    const { r, o } = it;
    const alpha = o.alpha ?? 1;
    if (o.shadow !== false && alpha > 0.02) {                       // 脚下暗斑：压扁的暗椭圆，不是展示台
      const fr = (r.def.footRadius || 10) * it.kk * BAKE;
      d.fillStyle = '#000';
      if (o.prop) {
        // 摆件的接地暗斑：三层由大到小、由淡到浓的椭圆叠出柔和的边（不用实时模糊），整体往右下偏一点当树下的暗斑，把模型「种」进地面
        const ox = fr * 0.3, oy = fr * 0.1 * TILT;
        for (const [m, aa] of PROP_SHADOW) {
          d.globalAlpha = aa * alpha;
          d.beginPath(); d.ellipse(it.fx + ox, it.fy + 1 + oy, fr * m, fr * m * 0.85 * TILT, 0, 0, Math.PI * 2); d.fill();
        }
      } else {
        d.globalAlpha = 0.34 * alpha;
        d.beginPath(); d.ellipse(it.fx, it.fy + 1, fr, fr * 0.85 * TILT, 0, 0, Math.PI * 2); d.fill();
      }
      d.globalAlpha = 1;
    }
    R.drawPreparedActor(it.parts);
    if ((o.flash || 0) > 0.02) drawFlash(d, it.parts, o.flash);
    drawParticles(d, it);
  }

  // 本帧的世界一次画完
  function render(ctx) {
    syncSize(); setCamera();
    const t0 = performance.now();
    const d = R.dctx;
    d.save();
    d.setTransform(1, 0, 0, 1, 0, 0); d.globalAlpha = 1; d.globalCompositeOperation = 'source-over'; d.imageSmoothingEnabled = false;
    if (R._ecDirty) R.ectx.clearRect(0, 0, R.EW, R.EH);
    R._glowOn = false;

    drawGround(d);
    drawVignette(d);

    // 1. 先把全部角色的贴图解析好（烘焙都在这一步），再统一画
    let n = 0;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'actor') { prepare(it); n++; }
      else if (it.kind === 'spot') it.depth = -1e6;                       // 地面上的亮晕：比谁都先画
      else it.depth = depthOf(camera.th, it.wx, it.wy) - 0.001;           // 选中环：紧贴在它那只后面
    }
    items.sort((a, b) => a.depth - b.depth);

    // 2. 从远到近
    for (let i = 0; i < items.length; i++) drawItem(d, items[i]);

    // 3. 地面微粒与技能特效
    const pack = groundPack();
    if (pack && pack.drawGroundAmbient3D) { try { pack.drawGroundAmbient3D(d, scene.biome, proj, now, scene.wind); } catch { /* 包出错就少画一层，不拖垮整帧 */ } }
    if (pack) for (let i = 0; i < effects.length; i++) { try { effects[i](pack, d); } catch { /* 同上 */ } }

    // 4. 整帧只做 1 次自亮柔化
    flushGlow(d);
    d.restore();
    R.drawCallsFrame = n;

    // 5. 2D 兜底（没有 UI-04 包时的微粒和暖晕）：布局单位，不随镜头转
    if (overlays.length) {
      d.save(); d.setTransform(unit, 0, 0, unit, 0, 0);
      for (let i = 0; i < overlays.length; i++) overlays[i](d);
      d.restore();
    }
    stats.drawMs = performance.now() - t0; stats.items = items.length;
    items.length = 0; effects.length = 0; overlays.length = 0;
  }

  // 立即画一只（路线图上的小头像）：不进批，自己解析、自己画、自己做自亮。位置按当前 ctx 的变换换算。
  function drawIcon(ctx, id, x, y, o = {}) {
    syncSize();
    const r = rec(id, o.slot || 'icon');
    if (!r) return false;
    const m = ctx.getTransform();
    const kk = pickK(m.a, o.scale ?? 1);
    setK(kk);
    const yaw = o.yaw ?? 0;
    if (r.frame !== frame) {
      r.frame = frame;
      if (r.yaw === null) stepRec(r, 0.3, yaw, 0, 0, null);
      stepRec(r, Math.min(0.05, Math.max(0, now - (r.lastNow ?? now))), yaw, 0, 0, null);
    }
    r.lastNow = now; r.pose = o.pose || null;
    const parts = R.prepareActor(r.inst, hab, 1, 0);
    const X = m.e + m.a * (x + (o.dx || 0)), Y = m.f + m.d * (y + (o.dy || 0));
    const W2 = canvasW / 2, H2 = canvasH / 2 + 16 * R.SCALE;
    const sx = Math.round((X - W2) / kk) * kk, sy = Math.round((Y - H2) / kk) * kk;
    for (let i = 0; i < parts.length; i++) {
      const p = parts[i];
      if (p.kind === 'line') { const pts = p._pts, gx = Math.round(sx / p._grid), gy = Math.round(sy / p._grid); for (let j = 0; j < pts.length; j += 2) { pts[j] += gx; pts[j + 1] += gy; } }
      else { p._dx += sx; p._dy += sy; }
    }
    const d = R.dctx;
    d.save();
    R.drawPreparedActor(parts);
    if ((o.flash || 0) > 0.02) drawFlash(d, parts, o.flash);
    flushGlow(d);
    d.restore();
    return true;
  }

  stage = {
    R, hab, camera,
    measure, rec,
    // 每帧开头调一次：给全部实例一个共同的时间，推进镜头
    beginFrame(tSec) {
      frame++; dt = Math.min(0.05, Math.max(0, tSec - now)); now = tSec; syncSize();
      camera.update(dt);
      R.frame++; R.atlas.frame = R.frame; R.scratchIdx = 0; R.updateTint(hab);
      const st = R.stats; st.frameBakes = 0; st.frameBakeMs = 0; st.frameDraws = 0; st.frameParts = 0;
      stats.parts = 0;
      items.length = 0; effects.length = 0; overlays.length = 0;
    },
    setScene(o) { if (o.biome) scene.biome = o.biome; if (o.wind !== undefined) scene.wind = o.wind; },
    actor, ring, glowSpot, drawIcon, render,
    overlay: fn => overlays.push(fn),
    // 3D 技能特效：UI-04 包的四个函数。包没加载时 available() 为 false，场景走自己的 2D 兜底
    vfx: {
      available: () => !!(groundPack() && groundPack().drawSpellBolt3D),
      bolt: bolt => effects.push(pack => pack.drawSpellBolt3D(R.dctx, bolt, proj)),
      wave: (kind, centerW, kk) => effects.push(pack => pack.drawImpactWave3D(R.dctx, kind, centerW, kk, proj)),
      attack: (kind, kk, fromW, toW) => effects.push(pack => pack.drawAttackFx3D(R.dctx, kind, kk, fromW, toW, proj)),
    },
    // 设备像素的世界到屏幕换算（给 UI-04 包用）和布局单位的换算（给界面挂血条、飘字用）
    proj: (wx, wy, wz = 0) => { setCamera(); return proj(wx, wy, wz); },
    toWorld,
    toLayout: (wx, wy, wz = 0) => project(camera.origin, camera.th, wx, wy, wz),
    anchor: (lx, ly, h = 0) => anchorOf(camera.origin, camera.th, lx, ly, h),
    heightToWorld,
    cacheInfo: () => R.cacheInfo(),
    // 性能浮层：图集 MB、已挂载包、地砖构建次数
    info: () => ({ atlas: R.cacheInfo(), packs: mountedPacks(), grounds: [...grounds.entries()].map(([id, g]) => ({ id, src: g.src, ms: Math.round(g.ms * 10) / 10, mb: Math.round(g.mb * 100) / 100 })), stats: { ...stats }, unit, k, th: camera.th }),
    has: id => hasAsset(id),
    actDuration: (id, act) => { const a = ((PW.Assets.byId[id] || {}).actions || []).find(x => x.id === act); return a && a.duration ? a.duration : null; },
    unit: () => unit,
    k: () => k,
    ground: groundOf,
  };
  syncSize();
  for (const id of lookIds) measure(id, id === 'npc_mage' ? Math.PI : 0);
  return stage;
}
