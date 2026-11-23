import test from 'node:test';
import assert from 'node:assert/strict';

import { createRenderer } from '../../modules/render/index.js';
import { createGameLoop } from '../loop.js';
import { createSceneManager } from '../scene-manager.js';
import { createTrySetupScene } from '../scenes/try-setup.js';
import { createBattleScene } from '../scenes/battle-scene.js';

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
    measureText: (s) => ({ width: String(s).length * 9 }),
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
  loop.step(2.0);
  assert.deepEqual(updates, [0.016, 0.05]);
  assert.equal(renders, 2);

  loop.start();
  assert.equal(loop.isRunning(), true);
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

test('试打大厅点「开始试打」能切进实战场景并打出一回合', () => {
  const { renderer, texts } = makeFakeRenderer();
  const sm = createSceneManager();
  sm.register('home', createTrySetupScene);
  sm.register('battle', createBattleScene);

  sm.switchTo('home');
  sm.render(renderer);
  assert.ok(texts.includes('开始试打'));

  // 点击「开始试打」按钮（x: 38..356, y: 462..510）
  sm.dispatchPointer({ type: 'down', x: 180, y: 486 });
  sm.dispatchPointer({ type: 'up', x: 180, y: 486 });
  assert.equal(sm.getCurrentName(), 'battle');

  const battleScene = sm.getCurrentScene();
  const battle = battleScene.getBattle();
  assert.ok(battle);

  // 点击「自动帮排」（x: 682..856, y: 290..324）再点「打出」（x: 682..938, y: 238..282）
  sm.dispatchPointer({ type: 'down', x: 750, y: 306 });
  sm.dispatchPointer({ type: 'up', x: 750, y: 306 });
  assert.ok(battle.getSnapshot().chain.length > 0);

  sm.dispatchPointer({ type: 'down', x: 780, y: 260 });
  sm.dispatchPointer({ type: 'up', x: 780, y: 260 });
  sm.update(0.05);

  texts.length = 0;
  sm.render(renderer);
  assert.ok(texts.some((t) => t.includes('第 2 回合') || t.includes('这一仗打赢了')));
});
