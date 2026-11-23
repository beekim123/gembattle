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

test('battle-view 只凭假快照渲染完整画面，并将点击正确转成 callbacks 而不算规则', () => {
  const actions = [];
  const view = createBattleView({
    allowAutoArrange: true,
    callbacks: {
      onQueueCard: (uid) => actions.push(['queue', uid]),
      onPlayInstant: (uid) => actions.push(['instant', uid]),
      onUnqueueCard: (uid) => actions.push(['unqueue', uid]),
      onCommitChain: () => actions.push(['commit']),
    },
  });

  const snap = makeFakeSnapshot();
  view.setState({
    snapshot: snap,
    preview: {
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
    },
    events: [
      { seq: 1, type: BATTLE_EVENT_TYPES.DAMAGE_PACKET, payload: { targetUid: 'm1', damage: 52381, perHitDamage: 52381, hitsInPacket: 1, isCrit: true } },
    ],
  });

  const { renderer, texts } = makeRecordingRenderer();
  view.update(0.05);
  view.render(renderer);

  assert.ok(texts.some((t) => t.includes('8420 / 10000')));
  assert.ok(texts.some((t) => t.includes('52381')));
  assert.ok(texts.includes('打出'));

  // 点击手牌排链牌与马上用功能牌
  const boxes = view.getLayoutBoxes();
  const cyanBox = boxes.hand.find((h) => h.uid === 'h-cyan');
  const blockBox = boxes.hand.find((h) => h.uid === 'h-block');
  const chainBox = boxes.chain[0];

  view.onPointer({ type: 'down', x: cyanBox.x + 10, y: cyanBox.y + 10 });
  view.onPointer({ type: 'up', x: cyanBox.x + 10, y: cyanBox.y + 10 });

  view.onPointer({ type: 'down', x: blockBox.x + 10, y: blockBox.y + 10 });
  view.onPointer({ type: 'up', x: blockBox.x + 10, y: blockBox.y + 10 });

  view.onPointer({ type: 'down', x: chainBox.x + 10, y: chainBox.y + 10 });
  view.onPointer({ type: 'up', x: chainBox.x + 10, y: chainBox.y + 10 });

  assert.deepEqual(actions, [
    ['queue', 'h-cyan'],
    ['instant', 'h-block'],
    ['unqueue', 'c-yellow'],
  ]);
});
