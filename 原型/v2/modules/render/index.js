// 渲染层出口：玩法和界面代码只从这里取图。
// 第 3 步：默认把角色画成工坊的 3D 像素堆叠模型（workshop-adapter.js）；
// 工坊没加载成功、或网址带 ?art=blocks，就退回色块（blocks.js），方便单测截图和对照排错。
import { drawActor as drawBlocks, ACTOR_SIZE as BLOCK_SIZE, ENEMY_SCALE as BLOCK_ENEMY_SCALE } from './blocks.js';
import { createStage, getStage } from './workshop-adapter.js';
export { createEnv } from './scene-env.js';
export { poseOf, DURATIONS as POSE_DURATIONS, PROFILES as POSE_PROFILES } from './battle-pose.js';

// 点选范围、血条位置都读这两张表。接了像素模型以后，尺寸改成模型的实际大小，怪的放大倍数统一成 1。
export const ACTOR_SIZE = { ...BLOCK_SIZE };
export const ENEMY_SCALE = { ...BLOCK_ENEMY_SCALE };

const LOOKS = Object.keys(BLOCK_SIZE);
// 像素模型里怪的放大倍数（每个美术像素占几个布局单位，取整数档）：小个子的放大到 1.5，别的原大小。
// 花甸灵精是飘在半空的，放大了血条会顶到上栏，所以只给原大小。
const WORKSHOP_ENEMY_SCALE = { slime_jelly: 1.5, goblin_scout: 1.5 };
let mode = 'blocks';

// 在 app/main.js 组装时调一次（要在建任何场景以前）。返回当前画法：'workshop' | 'blocks'
export function initArt(canvas, params = new URLSearchParams()) {
  if (params.get('art') === 'blocks') return mode;
  const stage = createStage(canvas, { sizes: ACTOR_SIZE, lookIds: LOOKS });
  if (stage) {
    mode = 'workshop';
    for (const k of Object.keys(ENEMY_SCALE)) ENEMY_SCALE[k] = WORKSHOP_ENEMY_SCALE[k] || 1;
  }
  return mode;
}
export const artMode = () => mode;
// 每帧开头调一次，给像素模型一个共同的时间（秒）
export function beginArtFrame(tSec) { const st = getStage(); if (st) st.beginFrame(tSec); }
// 图集用了多少（调试和验收用）
export function artInfo() { const st = getStage(); return st ? st.cacheInfo() : null; }

// o: { t 秒, scale, flash 0..1 闪白, alpha, dx, dy 位移, seed }
//    像素模型另外认：slot 位置名（同一个模型同时出现几只时各取一个）、yaw 朝向、act / actT 动作与时长
//    scale 在像素模型里的意思是「每个美术像素占几个布局单位」，1 就是原大小；色块里是放大倍数
export function drawActor(ctx, look, x, y, o = {}) {
  const st = getStage();
  if (st && mode === 'workshop' && st.has(look)) return st.draw(ctx, look, x, y, o);
  return drawBlocks(ctx, look, x, y, o);
}
