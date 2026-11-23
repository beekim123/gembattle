// app/main.js —— 唯一组装处。
// 只从各模块对外入口 index.js 导入，不伸手进模块内部。

import { SCHEMA_VERSION } from '../modules/shared/index.js';
import { RENDER_BACKEND, createRenderer } from '../modules/render/index.js';
import { createGameLoop } from './loop.js';
import { createSceneManager } from './scene-manager.js';
import { createEmptyStageScene } from './scenes/stage-placeholder.js';

const LOGICAL_WIDTH = 960;
const LOGICAL_HEIGHT = 540;

const canvas = document.getElementById('game-canvas');
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const renderer = createRenderer(canvas, {
  width: LOGICAL_WIDTH,
  height: LOGICAL_HEIGHT,
  dpr,
});

const sceneManager = createSceneManager({
  schemaVersion: SCHEMA_VERSION,
  renderBackend: RENDER_BACKEND,
});

sceneManager.register('home', createEmptyStageScene);
sceneManager.switchTo('home');

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

// 立即渲染首帧并启动主循环
sceneManager.render(renderer);
loop.start();

// 只读状态句柄，方便自动截图与调试工具检查就绪状态
window.__CODE00_APP__ = Object.freeze({
  getCurrentScene: () => sceneManager.getCurrentName(),
  getScenes: () => sceneManager.list(),
  getLogicalSize: () => renderer.getSize(),
  getBackend: () => RENDER_BACKEND,
  getLoopStats: () => loop.getStats(),
});
