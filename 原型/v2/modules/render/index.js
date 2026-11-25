// 渲染层出口：玩法和界面代码只从这里取图。
// 默认把角色画成工坊的 3D 像素堆叠模型，放进同一个可旋转的世界舞台（world-stage.js）；
// 工坊没加载成功、或网址带 ?art=blocks，就退回色块（blocks.js）。色块模式镜头不转，界面挂点照样能算。
//
// 场景每帧的用法：
//   env.draw(ctx)                       把生态地面、摆件排进队（接了像素美术时）
//   drawActor(ctx, look, x, y, o)       把角色排进队（x, y 是 th = 0 时落脚点的布局位置）
//   flushWorld(ctx)                     世界一次画完（地面、角色按深度、微粒、特效）
//   然后再画 2D 界面；血条、飘字、点选框用 anchorAt(x, y, 高) 取当前镜头下的屏幕位置
import { drawActor as drawBlocks, ACTOR_SIZE as BLOCK_SIZE, ENEMY_SCALE as BLOCK_ENEMY_SCALE } from './blocks.js';
import { createStage, getStage } from './workshop-adapter.js';
import { camera, ViewInput, BATTLE_TH0, BATTLE_SPAN, project, anchor, layoutToWorld, heightToWorld, heightToLayout } from './camera.js';
export { createEnv } from './scene-env.js';
export { poseOf, DURATIONS as POSE_DURATIONS, PROFILES as POSE_PROFILES, ATTACK_T } from './battle-pose.js';
export { camera, ViewInput, BATTLE_TH0, BATTLE_SPAN, TILT, HS, BAKE_SCALE } from './camera.js';
export { isBattleAct } from './world-stage.js';

// 点选范围、血条位置都读这两张表。接了像素模型以后，尺寸改成模型的实际大小，怪的放大倍数统一成 1。
export const ACTOR_SIZE = { ...BLOCK_SIZE };
export const ENEMY_SCALE = { ...BLOCK_ENEMY_SCALE };

const LOOKS = Object.keys(BLOCK_SIZE);
// 像素模型里怪的放大倍数（每个美术像素占几个布局单位，取整数档）：小个子的放大到 1.5，别的原大小。
// 花甸灵精是飘在半空的，放大了血条会顶到上栏，所以只给原大小。
// 林地首领千丈古树精放大到 1.5 档：取整以后约是主角的 1.7~1.9 倍高。
const WORKSHOP_ENEMY_SCALE = { slime_jelly: 1.5, goblin_scout: 1.5, tree3_leshy: 1.5 };
let mode = 'blocks';

// 在 app/main.js 组装时调一次（要在建任何场景以前）。返回当前画法：'workshop' | 'blocks'
export function initArt(canvas, params = new URLSearchParams()) {
  if (params.get('art') === 'blocks') return mode;
  const stage = createStage(canvas, { sizes: ACTOR_SIZE, lookIds: LOOKS, camera });
  if (stage) {
    mode = 'workshop';
    for (const k of Object.keys(ENEMY_SCALE)) ENEMY_SCALE[k] = WORKSHOP_ENEMY_SCALE[k] || 1;
  }
  return mode;
}
export const artMode = () => mode;
// 每帧开头调一次，给像素模型一个共同的时间（秒），镜头也在这里往前走一步
export function beginArtFrame(tSec) { const st = getStage(); if (st) st.beginFrame(tSec); }
// 图集用了多少（调试和验收用）
export function artInfo() { const st = getStage(); return st ? st.cacheInfo() : null; }
// 性能浮层要看的：图集、已挂载美术包、地砖构建、镜头角
export function artStats() { const st = getStage(); return st ? st.info() : null; }

// ---------- 镜头 ----------
// 场景进来时配一次。cfg: { mode 'free'|'battle'|'fixed', th0, origin [x, y] 世界原点落在布局哪里（也是转镜头的中心）, autoSpin, parallax }
// 色块模式下镜头一律不转（fixed、th0 = 0），挂点还是能算。
export function setView(cfg = {}) {
  if (mode === 'workshop') camera.setup(cfg);
  else camera.setup({ mode: 'fixed', origin: cfg.origin || [480, 258] });
}
export const viewTh = () => camera.th;
// 站在布局点 (lx, ly)（th = 0 时的位置）、头顶高 h 个布局单位的东西，在当前镜头下的屏幕布局位置 [x, y, 深度]
export const anchorAt = (lx, ly, h = 0) => anchor(camera.origin, camera.th, lx, ly, h);
// 布局点 → 世界地面点；世界点 → 当前屏幕布局点
export const worldOf = (lx, ly) => layoutToWorld(camera.origin, lx, ly);
export const screenOf = (wx, wy, wz = 0) => project(camera.origin, camera.th, wx, wy, wz);
export { heightToWorld, heightToLayout };

// ---------- 画角色 ----------
// o: { t 秒, scale, flash 0..1 闪白, alpha, dx, dy 位移, seed }
//    像素模型另外认：slot 位置名（同一个模型同时出现几只时各取一个）、yaw 朝向、act / actT 动作与时长、
//    pose 战斗姿态、target 怪出手要打的世界点、wz 离地高度
//    scale 在像素模型里的意思是「每个美术像素占几个布局单位」，1 就是原大小；色块里是放大倍数
// 像素模型：只排队，flushWorld 时才画。色块：当场画（先于界面，顺序一样）。
export function drawActor(ctx, look, x, y, o = {}) {
  const st = getStage();
  if (st && mode === 'workshop' && st.has(look)) return st.actor(look, x, y, o);
  return drawBlocks(ctx, look, x, y, o);
}
// 立即画一只，不进世界（路线图上的小头像）：位置按当前 ctx 的变换算
export function drawActorNow(ctx, look, x, y, o = {}) {
  const st = getStage();
  if (st && mode === 'workshop' && st.has(look)) return st.drawIcon(ctx, look, x, y, o);
  return drawBlocks(ctx, look, x, y, o);
}
// 地面上的选中环（世界里的一个圆，随镜头转）。色块模式由场景自己画 2D 的。
export function drawRing(x, y, rLayout, o = {}) {
  const st = getStage();
  if (st && mode === 'workshop') { st.ring(x, y, rLayout, o); return true; }
  return false;
}
// 某个模型的某个动作有多长（秒）；没有这个动作、或在色块模式里返回 null
export function actDuration(look, act) { const st = getStage(); return st && mode === 'workshop' ? st.actDuration(look, act) : null; }
// 世界一次画完。色块模式什么也不做（角色已经当场画过了）。
export function flushWorld(ctx) { const st = getStage(); if (st && mode === 'workshop') st.render(ctx); }

// 3D 技能特效（UI-04）：没有包或色块模式时 available() 是 false，场景走自己的 2D 兜底
export const vfx3d = {
  available() { const st = getStage(); return !!(st && mode === 'workshop' && st.vfx.available()); },
  bolt(b) { getStage()?.vfx.bolt(b); },
  wave(kind, centerW, k) { getStage()?.vfx.wave(kind, centerW, k); },
  attack(kind, k, fromW, toW) { getStage()?.vfx.attack(kind, k, fromW, toW); },
};
