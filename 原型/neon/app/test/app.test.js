import test from 'node:test';
import assert from 'node:assert/strict';

import { createRenderer } from '../../modules/render/index.js';
import { createGameLoop } from '../loop.js';
import { createSceneManager } from '../scene-manager.js';
import { createLobbyScene } from '../scenes/lobby.js';
import { createBattleScene } from '../scenes/battle-scene.js';
import { createRunScene } from '../scenes/run-scene.js';
import { session } from '../session.js';

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

test('大厅点「试打一仗」→ 挑仗板点「出发」能进实战，拖一张牌打出一回合', () => {
  const { renderer, texts } = makeFakeRenderer();
  const sm = createSceneManager();
  sm.register('home', createLobbyScene);
  sm.register('battle', createBattleScene);

  sm.switchTo('home');
  sm.render(renderer);
  assert.ok(texts.includes('走一趟') && texts.includes('试打一仗'));
  assert.ok(texts.includes('code00'));

  const lobby = sm.getCurrentScene();
  const click = (id) => {
    const b = lobby.getHitBoxes().find((x) => x.id === id);
    assert.ok(b, `找不到 ${id}`);
    sm.dispatchPointer({ type: 'move', x: b.x + b.w / 2, y: b.y + b.h / 2 });
    sm.dispatchPointer({ type: 'down', x: b.x + b.w / 2, y: b.y + b.h / 2 });
    sm.dispatchPointer({ type: 'up', x: b.x + b.w / 2, y: b.y + b.h / 2 });
    sm.update(0.3);
    sm.render(renderer);
  };

  // 设置、卡册能打开
  click('settings');
  assert.equal(lobby.getPanel(), 'settings');
  assert.ok(texts.includes('试玩调整'));
  click('album');
  assert.equal(lobby.getPanel(), 'album');
  click('tab-allies');
  assert.ok(texts.includes('补刀'));

  // 开始游戏 → 挑一群怪 → 出发
  click('start');
  assert.equal(lobby.getPanel(), 'start');
  click('enc-pack_mixed');
  assert.equal(lobby.getSelectedEncounterId(), 'pack_mixed');
  click('go');
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

test('走一趟：大厅点「走一趟」进空地，碰鬼火进战斗，自动帮排打完回到空地，挑奖励、出口亮了', () => {
  const { renderer, texts } = makeFakeRenderer();
  const sm = createSceneManager();
  sm.register('home', createLobbyScene);
  sm.register('battle', createBattleScene);
  sm.register('run', createRunScene);
  sm.switchTo('home');
  sm.render(renderer);
  const lobby = sm.getCurrentScene();
  const b = lobby.getHitBoxes().find((x) => x.id === 'run');
  sm.dispatchPointer({ type: 'up', x: b.x + 5, y: b.y + 5 });
  assert.equal(sm.getCurrentName(), 'run');
  sm.render(renderer);
  assert.ok(texts.some((t) => String(t).includes('第 1 层')));

  // 走到鬼火跟前
  const runScene = sm.getCurrentScene();
  const w = runScene.getView().getLayout().wisps[0];
  runScene.getView().debugPlaceHero(w.x, w.y + 20);
  for (let i = 0; i < 30 && sm.getCurrentName() === 'run'; i++) sm.update(1 / 30);
  assert.equal(sm.getCurrentName(), 'battle');

  // 每回合自动帮排、打出，直到打完
  const bs = sm.getCurrentScene();
  for (let turn = 0; turn < 30 && !bs.getBattle().getResult(); turn++) {
    bs.getBattle().autoArrange('longest');
    const out = bs.getBattle().commitChain();
    bs.getView().setState({ snapshot: bs.getBattle().getSnapshot(), preview: bs.getBattle().getPreview(), result: out.result, events: out.events });
    for (let i = 0; i < 400 && bs.getView().isBusy(); i++) sm.update(0.05);
  }
  const result = bs.getBattle().getResult();
  assert.ok(result);
  sm.render(renderer);
  const back = bs.getView().getLayoutBoxes ? null : null;
  void back;
  // 点结算框里的「接着走」
  sm.dispatchPointer({ type: 'up', x: 480, y: 318 });
  assert.equal(sm.getCurrentName(), 'run');
  const st = session.run.getState();
  if (result.outcome === 'win') {
    assert.ok(st.pending, '打完第一片要挑一张功能牌');
    assert.equal(st.pending.type, 'pick_card');
    session.run.choose(st.pending.options[0]);
    while (session.run.getState().pending) session.run.choose(null);
    assert.ok(session.run.getState().clearing.exits.length >= 2);
  } else {
    assert.ok(session.run.isEnded());
  }
});
