import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BATTLE_EVENT_TYPES,
  CHAIN_RELATIONS,
  SCHEMA_VERSION,
  createEmptyDrawPileByColor,
} from '../../shared/index.js';
import { createRenderer } from '../../render/index.js';
import { createBattleView } from '../index.js';

function makeRecordingRenderer() {
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

function makeFakeSnapshot() {
  const byColor = createEmptyDrawPileByColor();
  byColor.red = 4;
  byColor.yellow = 3;
  byColor.green = 5;
  byColor.cyan = 4;
  byColor.blue = 5;
  byColor.purple = 4;
  byColor.white = 2;

  return {
    schemaVersion: SCHEMA_VERSION,
    turn: 2,
    phase: 'player_input',
    outcome: null,
    currentColor: 'red',
    recordedColors: ['red', 'yellow', 'green'],
    selectedTargetUid: 'm1',
    player: {
      hearts: 2.5,
      maxHearts: 3,
      drawTarget: 4,
      maxHandSize: 12,
      stats: { attack: 80, damageBonus: 0, critRate: 0.1, critDamage: 1.5 },
      blocks: { thisTurn: 0, untilConsumed: 1, allyCharges: 0 },
      gemLevels: {
        red: { level: 2, exp: 3, nextExp: 20 },
        green: { level: 1, exp: 4, nextExp: 10 },
        blue: { level: 1, exp: 2, nextExp: 10 },
      },
      buffs: [],
      allies: [],
      gearTraits: [],
    },
    hand: [
      {
        uid: 'h-cyan',
        hidden: false,
        defId: 'gem_cyan',
        kind: 'gem',
        usage: 'chain',
        color: 'cyan',
        gems: ['green', 'blue'],
        relationToCurrent: CHAIN_RELATIONS.COMPLEMENT,
        label: '青宝石',
        enhanced: false,
      },
      {
        uid: 'h-block',
        hidden: false,
        defId: 'fn_block_next',
        kind: 'function',
        usage: 'instant',
        color: 'colorless',
        gems: [],
        relationToCurrent: CHAIN_RELATIONS.INSTANT,
        label: '挡下一次攻击',
        enhanced: false,
        drawAfterPlay: 1,
      },
    ],
    chain: [
      {
        uid: 'c-yellow',
        hidden: false,
        defId: 'gem_yellow',
        kind: 'gem',
        usage: 'chain',
        color: 'yellow',
        gems: ['red', 'green'],
        label: '黄宝石',
        enhanced: false,
      },
    ],
    drawPileCount: 27,
    drawPileByColor: byColor,
    discardPileCount: 2,
    monsters: [
      {
        uid: 'm1',
        defId: 'dual_shield',
        tier: 'normal',
        label: '双色盾普通怪',
        alive: true,
        barIndex: 0,
        totalBars: 1,
        hp: 8420,
        maxHp: 10000,
        shields: [
          { color: 'red', current: 2, max: 3 },
          { color: 'blue', current: 3, max: 3 },
        ],
        shieldBroken: false,
        countdown: 3,
        attacksDone: 0,
        attackDamage: 0.5,
        intentLabel: '3 回合后打 0.5 心',
        activeTraits: [],
      },
    ],
  };
}

function makePreview() {
  return {
    schemaVersion: SCHEMA_VERSION,
    chainLength: 1,
    steps: [{ cardUid: 'c-yellow', resolvedColor: 'yellow', relation: CHAIN_RELATIONS.CONNECT, multiplierAfter: 2, hits: 4, triggersComplementWhite: false, triggersRainbow: false }],
    finalMultiplier: 2,
    hasComplementWhite: false,
    willTriggerRainbow: false,
    colorsNeededForRainbow: 3,
    shieldShred: { red: 1, green: 1, blue: 0 },
    expectedBreakUids: [],
    estimatedHits: 4,
    estimatedDamage: 240,
    formulaLines: ['发数：1 张排链 = 预计 4 发', '每发：约 60'],
  };
}

function makeView(actions) {
  return createBattleView({
    allowAutoArrange: true,
    callbacks: {
      onQueueCard: (uid, index) => actions.push(['queue', uid, index]),
      onMoveChainCard: (uid, index) => actions.push(['move', uid, index]),
      onPlayInstant: (uid) => actions.push(['instant', uid]),
      onUnqueueCard: (uid) => actions.push(['unqueue', uid]),
      onSelectTarget: (uid) => actions.push(['target', uid]),
      onCommitChain: () => actions.push(['commit']),
    },
  });
}

/** 按下 → 拖几步 → 松手 */
function dragTo(view, from, to) {
  view.onPointer({ type: 'down', x: from.x, y: from.y });
  for (let k = 1; k <= 4; k++) {
    view.onPointer({ type: 'move', x: from.x + ((to.x - from.x) * k) / 4, y: from.y + ((to.y - from.y) * k) / 4 });
  }
  view.onPointer({ type: 'up', x: to.x, y: to.y });
}

test('battle-view 只凭假快照画出整个画面，鼠标放怪身上才显示细节', () => {
  const view = makeView([]);
  view.setState({ snapshot: makeFakeSnapshot(), preview: makePreview(), events: [] });
  const { renderer, texts } = makeRecordingRenderer();
  view.update(0.05);
  view.render(renderer);
  assert.ok(texts.includes('打出'));
  assert.ok(texts.some((t) => t.includes('第 2 回合')));
  // 头顶不写血量数字
  assert.ok(!texts.some((t) => t.includes('8420 / 10000')));

  const m = view.getLayoutBoxes().monsters[0];
  view.onPointer({ type: 'move', x: m.x + m.w / 2, y: m.y + m.h / 2 });
  texts.length = 0;
  view.render(renderer);
  assert.ok(texts.some((t) => t.includes('8420 / 10000')));
});

test('出牌只认拖拽：点一下手牌什么都不做', () => {
  const actions = [];
  const view = makeView(actions);
  view.setState({ snapshot: makeFakeSnapshot(), preview: makePreview(), events: [] });
  const cyan = view.getLayoutBoxes().hand.find((h) => h.uid === 'h-cyan');
  view.onPointer({ type: 'down', x: cyan.cx, y: cyan.cy });
  view.onPointer({ type: 'up', x: cyan.cx, y: cyan.cy });
  assert.deepEqual(actions, []);
});

test('拖进链、拖到马上用、拖回手里、链里换位子，都转成 callbacks', () => {
  const actions = [];
  const view = makeView(actions);
  view.setState({ snapshot: makeFakeSnapshot(), preview: makePreview(), events: [] });
  const b = view.getLayoutBoxes();
  const cyan = b.hand.find((h) => h.uid === 'h-cyan');
  const block = b.hand.find((h) => h.uid === 'h-block');
  const chain0 = b.chain[0];

  // 拖到链的右边 → 插在最后
  dragTo(view, { x: cyan.cx, y: cyan.cy }, { x: chain0.cx + 80, y: chain0.cy });
  // 拖到链的左边 → 插在最前
  dragTo(view, { x: cyan.cx, y: cyan.cy }, { x: chain0.cx - 80, y: chain0.cy });
  // 马上用的牌拖上去 → 直接用
  dragTo(view, { x: block.cx, y: block.cy }, { x: 480, y: 300 });
  // 链里的牌拖回手里 → 撤回
  dragTo(view, { x: chain0.cx, y: chain0.cy }, { x: 480, y: 500 });
  // 拖了又放回手里 → 什么都不做
  dragTo(view, { x: cyan.cx, y: cyan.cy }, { x: cyan.cx + 20, y: cyan.cy - 10 });

  assert.deepEqual(actions, [
    ['queue', 'h-cyan', 1],
    ['queue', 'h-cyan', 0],
    ['instant', 'h-block'],
    ['unqueue', 'c-yellow'],
  ]);
});

test('打出去以后按事件播一段，播完才能再动', () => {
  const actions = [];
  const view = makeView(actions);
  const before = makeFakeSnapshot();
  view.setState({ snapshot: before, preview: makePreview(), events: [] });

  const after = makeFakeSnapshot();
  after.turn = 3;
  after.chain = [];
  after.monsters[0].hp = 8180;
  view.setState({
    snapshot: after,
    preview: { ...makePreview(), chainLength: 0, steps: [] },
    events: [
      { seq: 1, type: BATTLE_EVENT_TYPES.CHAIN_STEP, payload: { cardUid: 'c-yellow', color: 'yellow', relation: CHAIN_RELATIONS.CONNECT, multiplier: 2 } },
      { seq: 2, type: BATTLE_EVENT_TYPES.DAMAGE_PACKET, payload: { targetUid: 'm1', damage: 52381, perHitDamage: 52381, hitsInPacket: 1, isCrit: true, color: 'red' } },
      { seq: 3, type: BATTLE_EVENT_TYPES.CHAIN_SUMMARY, payload: { playedCount: 1, finalMultiplier: 2, totalHits: 1, totalDamage: 52381, rainbowTriggered: false, formulaLines: [] } },
    ],
  });
  assert.equal(view.isBusy(), true);

  // 播的时候拖牌没用
  const cyan = view.getLayoutBoxes().hand.find((h) => h.uid === 'h-cyan');
  dragTo(view, { x: cyan.cx, y: cyan.cy }, { x: 480, y: 280 });
  assert.deepEqual(actions, []);

  const { renderer, texts } = makeRecordingRenderer();
  let sawNumber = false;
  for (let i = 0; i < 200 && view.isBusy(); i++) {
    view.update(0.05);
    texts.length = 0;
    view.render(renderer);
    if (texts.some((t) => t.includes('52381'))) sawNumber = true;
  }
  assert.equal(view.isBusy(), false);
  assert.ok(sawNumber, '飘字里要有这一发的数');
  texts.length = 0;
  view.render(renderer);
  assert.ok(texts.some((t) => t.includes('第 3 回合')));
});
