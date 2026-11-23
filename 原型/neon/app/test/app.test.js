import test from 'node:test';
import assert from 'node:assert/strict';

import { createRenderer } from '../../modules/render/index.js';
import { createGameLoop } from '../loop.js';
import { createSceneManager } from '../scene-manager.js';
import { createEmptyStageScene } from '../scenes/stage-placeholder.js';

function makeFakeRenderer() {
  const texts = [];
  const ctx = {
    globalAlpha: 1,
    setTransform() {},
    save() {},
    restore() {},
    fillRect() {},
    beginPath() {},
    closePath() {},
    rect() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arc() {},
    fill() {},
    stroke() {},
    fillText(str) { texts.push(str); },
    measureText: (s) => ({ width: String(s).length * 10 }),
  };
  return { renderer: createRenderer(ctx, { width: 960, height: 540 }), texts };
}

test('createGameLoop 支持手动 step、dt 限幅与启停控制', () => {
  const updates = [];
  let renders = 0;
  let scheduledCb = null;

  const loop = createGameLoop({
    maxDt: 0.05,
    onUpdate: (dt) => updates.push(dt),
    onRender: () => { renders++; },
    scheduler: {
      request: (cb) => { scheduledCb = cb; return 1; },
      cancel: () => { scheduledCb = null; },
      now: () => 1000,
    },
  });

  loop.step(0.016);
  loop.step(2.0); // 应被限制到 maxDt = 0.05
  assert.deepEqual(updates, [0.016, 0.05]);
  assert.equal(renders, 2);

  loop.start();
  assert.equal(loop.isRunning(), true);
  assert.equal(typeof scheduledCb, 'function');
  scheduledCb(1020);
  assert.equal(renders, 3);

  loop.stop();
  assert.equal(loop.isRunning(), false);
  assert.equal(scheduledCb, null);
});

test('createSceneManager 正确触发 onExit/onEnter 并拦住未注册场景', () => {
  const log = [];
  const sm = createSceneManager({ tag: 'test' });

  sm.register('a', () => ({
    onEnter: (p) => log.push(`enter-a:${p}`),
    onExit: () => log.push('exit-a'),
    onUpdate: (dt) => log.push(`upd-a:${dt}`),
  }));
  sm.register('b', () => ({
    onEnter: () => log.push('enter-b'),
    onExit: () => log.push('exit-b'),
  }));

  sm.switchTo('a', 'init');
  sm.update(0.1);
  sm.switchTo('b');

  assert.equal(sm.getCurrentName(), 'b');
  assert.deepEqual(log, ['enter-a:init', 'upd-a:0.1', 'exit-a', 'enter-b']);
  assert.throws(() => sm.switchTo('not_exist'), /未注册的场景/);
});

test('阶段 0 空游戏画面包含「试打」按钮，点击后给出占位提示且不报错', () => {
  const { renderer, texts } = makeFakeRenderer();
  const sm = createSceneManager();
  sm.register('home', createEmptyStageScene);
  const scene = sm.switchTo('home');

  sm.render(renderer);
  assert.ok(texts.includes('试打'));

  const rect = scene.getTryButtonRect();
  const cx = rect.x + rect.w / 2;
  const cy = rect.y + rect.h / 2;

  const hoverRes = sm.dispatchPointer({ type: 'move', x: cx, y: cy });
  assert.equal(hoverRes.cursor, 'pointer');

  sm.dispatchPointer({ type: 'down', x: cx, y: cy });
  sm.dispatchPointer({ type: 'up', x: cx, y: cy });
  assert.equal(scene.getState().tryClicks, 1);

  texts.length = 0;
  sm.render(renderer);
  assert.ok(texts.some((t) => t.includes('战斗模块尚未接入')));
});
