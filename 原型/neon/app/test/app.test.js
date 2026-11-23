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
    translate() {},
    rotate() {},
    scale() {},
    clip() {},
    setLineDash() {},
    clearRect() {},
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

  // 带上了默认的 4 个加成、2 个队友
  assert.equal(battle.getSnapshot().player.buffs.length, 4);
  assert.equal(battle.getSnapshot().player.allies.length, 2);

  // 把第一张排链牌拖进链（出牌只认拖拽）
  sm.render(renderer);
  const view = battleScene.getView();
  const snap0 = battle.getSnapshot();
  const card = snap0.hand.find((c) => c.usage === 'chain' && !c.hidden);
  const box = view.getLayoutBoxes().hand.find((h) => h.uid === card.uid);
  sm.dispatchPointer({ type: 'down', x: box.cx, y: box.cy });
  sm.dispatchPointer({ type: 'move', x: box.cx, y: box.cy - 80 });
  sm.dispatchPointer({ type: 'move', x: 480, y: 280 });
  sm.dispatchPointer({ type: 'up', x: 480, y: 280 });
  assert.equal(battle.getSnapshot().chain.length, 1);

  // 点圆按钮打出，播完进第 2 回合
  const cast = view.getLayoutBoxes().buttons.find((b) => b.id === 'cast');
  sm.dispatchPointer({ type: 'down', x: cast.x + cast.w / 2, y: cast.y + cast.h / 2 });
  sm.dispatchPointer({ type: 'up', x: cast.x + cast.w / 2, y: cast.y + cast.h / 2 });
  for (let i = 0; i < 400 && view.isBusy(); i++) sm.update(0.05);
  assert.equal(view.isBusy(), false);

  texts.length = 0;
  sm.render(renderer);
  assert.ok(texts.some((t) => t.includes('第 2 回合') || t.includes('这一仗打赢了')));
});
