// app/main.js —— 唯一组装处。
// 只从各模块对外入口 index.js 导入，不伸手进模块内部。

import { SCHEMA_VERSION, SCREEN } from '../modules/shared/index.js';
import { RENDER_BACKEND, createRenderer } from '../modules/render/index.js';
import { createGameLoop } from './loop.js';
import { createSceneManager } from './scene-manager.js';
import { createBattleScene } from './scenes/battle-scene.js';
import { createCoreScene } from './scenes/core-scene.js';
import { formatPlayLog, session } from './session.js';
// 外圈（大厅、试打台、走一趟、存档）不在这里静态导入：OUTER_ON 关着就一行都不加载，见下面的 loadOuter()

// 画面按 1920×1080 设计（用户 2026-11-23 定的，设计稿 10 节）。
// 代码里的坐标用「布局单位」：960×540，一个单位 = 1920×1080 上的 2 个像素。
// 画的时候至少按 1920×1080 的清晰度画；窗口在屏幕上更大（2K、4K），就照屏幕上的真像素画。
const LOGICAL_WIDTH = SCREEN.w;
const LOGICAL_HEIGHT = SCREEN.h;
const MIN_SCALE = SCREEN.designW / SCREEN.w; // 2
const MAX_SCALE = 4; // 4K

const canvas = document.getElementById('game-canvas');
function surfaceScale() {
  const rect = canvas.getBoundingClientRect();
  const onScreen = ((rect.width || LOGICAL_WIDTH) * (window.devicePixelRatio || 1)) / LOGICAL_WIDTH;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.ceil(onScreen * 4) / 4));
}
const renderer = createRenderer(canvas, {
  width: LOGICAL_WIDTH,
  height: LOGICAL_HEIGHT,
  dpr: surfaceScale(),
});
window.addEventListener('resize', () => {
  const s = surfaceScale();
  if (s !== renderer.getSurfaceScale?.()) renderer.resize(LOGICAL_WIDTH, LOGICAL_HEIGHT, s);
});

const sceneManager = createSceneManager({
  schemaVersion: SCHEMA_VERSION,
  renderBackend: RENDER_BACKEND,
});

// 外圈冻住（用户 2026-11-24 定的，设计稿 10.4、设计/做原型的方法.md）：
// 先把「只用宝石牌打怪」做到好玩，大厅、工会、招募、出发、卡册、走一趟、试打台的入口都关掉。
// 代码都留着，核心过关以后一层层接回来：把 OUTER_ON 改成 true 就是原来的整圈。
// 关着的时候外圈的文件一个都不加载（设计稿 10.7，第 8 版）。
const OUTER_ON = false;

sceneManager.register('core', createCoreScene); // 核心试玩：只有宝石牌连打 10 只
sceneManager.register('battle', createBattleScene);

const params = new URLSearchParams(window.location.search);
const directEncounter = params.get('encounter');
if (OUTER_ON) await enterOuter();
else if (directEncounter) {
  // 截图、调试用：?encounter=dual_shield 直接打一仗（只有宝石牌）
  sceneManager.switchTo('battle', {
    encounterId: directEncounter,
    seed: params.get('seed') || `direct-${directEncounter}`,
    extraCards: [],
    rulesConfig: { allowAutoArrange: false },
    backTo: 'core', // 外圈冻住时没有试打台，「回大厅」「Esc」回核心试玩
  });
} else sceneManager.switchTo('core');

/** 外圈开着才加载：大厅、试打台、走一趟三个场景，加上存档 */
async function loadOuter() {
  const [hub, trial, run, save, content] = await Promise.all([
    import('./scenes/hub-scene.js'),
    import('./scenes/trial-scene.js'),
    import('./scenes/run-scene.js'),
    import('../modules/save/index.js'),
    import('../modules/content/index.js'),
  ]);
  sceneManager.register('home', hub.createHubScene);
  sceneManager.register('trial', trial.createTrialScene); // 试打台：只打一仗、测手感
  sceneManager.register('run', run.createRunScene);
  // 存档存在浏览器里（以后 Electron 换成存文件，只改这一句传进去的 storage）
  session.saveStore = save.createSaveStore(window.localStorage);
  session.saveStore.load();
  return content;
}

/** 外圈开着时原来的入口：大厅，或照 URL 参数直达 */
async function enterOuter() {
  const { TRIAL_ALLY_IDS, TRIAL_BUFF_IDS, QUEST_DEFS, buildHeroLoadout } = await loadOuter();
  if (params.get('fresh') === '1') session.saveStore.reset(); // 截图、测试用：新档
  if (directEncounter) {
    // 支持通过 URL 参数直达指定仗（方便调试与自动截图，例如 ?encounter=gatekeeper_layer2）
    sceneManager.switchTo('battle', {
      encounterId: directEncounter,
      seed: params.get('seed') || `direct-${directEncounter}`,
      extraCards: params.get('loadout') === 'pure'
        ? []
        : ['fn_draw_2', 'fn_hit_percent_50', 'fn_shred_shield_2', 'fn_block_next'],
      stressMode: params.get('stress') === '1',
      // 默认带上 4 个加成、2 个队友（跟试打台一样）；?bare=1 什么都不带
      buffs: params.get('bare') === '1' ? [] : [...TRIAL_BUFF_IDS],
      allies: params.get('bare') === '1' ? [] : [...TRIAL_ALLY_IDS],
    });
  } else if (params.get('run') === '1') {
    // 截图、调试用：穿 C 级武器、带两个 C 级任务直接进林子
    const save = session.saveStore.get();
    session.save = save;
    session.onSettled = (next) => session.saveStore.replace(next);
    const lo = buildHeroLoadout({ weapon: 'gear_c_weapon_1', armor: null, trinket: null });
    sceneManager.switchTo('run', {
      depart: {
        schemaVersion: SCHEMA_VERSION,
        seed: params.get('seed') || 'direct-run',
        zoneId: 'forest',
        player: { ...lo, extraCards: [], buffs: [], allies: ['ally_assassin_break'] },
        quests: [{ ...QUEST_DEFS.q_c_gather }, { ...QUEST_DEFS.q_c_hunt }],
      },
    });
  } else if (params.get('scene') === 'trial') {
    sceneManager.switchTo('trial');
  } else {
    sceneManager.switchTo('home', params.get('panel') ? { panel: params.get('panel') } : null);
  }
}

const loop = createGameLoop({
  onUpdate: (dt, elapsed) => sceneManager.update(dt, elapsed),
  onRender: () => sceneManager.render(renderer),
});

function toLogicalPoint(ev) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((ev.clientX - rect.left) / rect.width) * LOGICAL_WIDTH,
    y: ((ev.clientY - rect.top) / rect.height) * LOGICAL_HEIGHT,
  };
}

function forwardPointer(type, ev) {
  const pt = ev ? toLogicalPoint(ev) : { x: -1, y: -1 };
  const result = sceneManager.dispatchPointer({ type, x: pt.x, y: pt.y });
  canvas.style.cursor = result?.cursor || 'default';
}

canvas.addEventListener('pointermove', (ev) => forwardPointer('move', ev));
canvas.addEventListener('pointerdown', (ev) => forwardPointer('down', ev));
canvas.addEventListener('pointerup', (ev) => forwardPointer('up', ev));
canvas.addEventListener('pointerleave', () => forwardPointer('leave', null));

window.addEventListener('keydown', (ev) => {
  const scene = sceneManager.getCurrentScene();
  if (scene && typeof scene.onKeyDown === 'function') {
    if (ev.key === ' ') ev.preventDefault();
    if (ev.key === 'Tab') ev.preventDefault();
    scene.onKeyDown(ev.key);
  }
});

window.addEventListener('keyup', (ev) => {
  const scene = sceneManager.getCurrentScene();
  if (scene && typeof scene.onKeyUp === 'function') scene.onKeyUp(ev.key);
});

sceneManager.render(renderer);
loop.start();

// 只读状态与自动测试/截图辅助句柄
window.__CODE00_APP__ = Object.freeze({
  getCurrentScene: () => sceneManager.getCurrentName(),
  getScenes: () => sceneManager.list(),
  getLogicalSize: () => renderer.getSize(),
  getSurfaceSize: () => ({ width: canvas.width, height: canvas.height }),
  getBackend: () => RENDER_BACKEND,
  getLoopStats: () => loop.getStats(),
  // 试玩记录（设计稿 10.4）：每回合想了几秒、打了几张、撤回几次
  getPlayLog: () => formatPlayLog(session.playLog || []),
  // 截图用：停住主循环，让飘字定在画面上（再调 unfreeze 接着走）
  freeze: () => { loop.stop(); sceneManager.render(renderer); },
  unfreeze: () => loop.start(),
});
