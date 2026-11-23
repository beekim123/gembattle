import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIONS,
  ACTION_DURATIONS,
  BASE_GEM_DECK_TOTAL,
  BATTLE_EVENT_TYPES,
  CARD_COLORS,
  CHAIN_RELATIONS,
  COLOR_META,
  COLOR_RING,
  DEFAULT_ACTION_TABLE,
  PRIMARY_GEMS,
  RETRIGGER_POLICIES,
  SCHEMA_VERSION,
  SEVEN_COLORS,
  TIMINGS,
  createEmptyDrawPileByColor,
  createRng,
  getColorMeta,
  isCardColor,
  isPrimaryGem,
  isRingColor,
  isSevenColor,
  validateActionTable,
  validateBattleEvent,
  validateBattleEvents,
  validateBattlePreview,
  validateBattleResult,
  validateBattleSnapshot,
  validateBattleStartPacket,
  validateEffect,
} from '../index.js';

function makeValidStartPacket() {
  return {
    schemaVersion: SCHEMA_VERSION,
    seed: 'stage0-seed-42',
    rulesConfig: {
      drawMode: 'refill',
      freeKeepCount: 0,
      shieldActiveMultiplier: 0.75,
      shieldBrokenMultiplier: 1.5,
      shieldBreakPush: 1,
      initialCountdown: 4,
      maxHandSize: 12,
    },
    player: {
      deck: [
        {
          uid: 'c-red-1',
          defId: 'gem_red',
          kind: 'gem',
          usage: 'chain',
          color: 'red',
          gems: ['red'],
          enhanced: false,
          label: '红宝石',
        },
        {
          uid: 'c-block-1',
          defId: 'fn_block',
          kind: 'function',
          usage: 'instant',
          color: 'colorless',
          gems: [],
          enhanced: false,
          drawAfterPlay: 1,
          label: '挡掉怪的下一次攻击，用完补摸 1 张',
          effects: [
            {
              timing: TIMINGS.ON_CARD_PLAY,
              action: ACTIONS.ADD_BLOCK,
              duration: ACTION_DURATIONS.UNTIL_CONSUMED,
              params: { count: 1 },
            },
          ],
        },
      ],
      stats: {
        attack: 60,
        damageBonus: 0,
        critRate: 0.1,
        critDamage: 1.5,
      },
      drawTarget: 4,
      hearts: 2.5,
      maxHearts: 3,
      buffs: [
        {
          id: 'buff-break-push',
          label: '破盾时多推 1 格倒计时',
          effects: [
            {
              timing: TIMINGS.ON_SHIELD_BREAK,
              action: ACTIONS.SHIFT_COUNTDOWN,
              params: { delta: 1, target: 'selected' },
            },
          ],
        },
      ],
      allies: [
        {
          id: 'ally-assassin-1',
          role: 'assassin',
          mode: 'trigger',
          label: '破盾时补一刀单独伤害',
          usesPerBattle: null,
          effects: [
            {
              timing: TIMINGS.ON_SHIELD_BREAK,
              action: ACTIONS.DEAL_BONUS_DAMAGE,
              params: { amount: 3, scale: 'attackRatio', target: 'selected' },
            },
          ],
        },
      ],
      gearTraits: [
        {
          gearId: 'gear-armor-1',
          slot: 'armor',
          label: '每仗开打先挡一次',
          effects: [
            {
              timing: TIMINGS.BATTLE_START,
              action: ACTIONS.ADD_BLOCK,
              duration: ACTION_DURATIONS.UNTIL_CONSUMED,
              params: { count: 1 },
            },
          ],
        },
      ],
      gemLevels: {
        red: { level: 1, exp: 0 },
        green: { level: 1, exp: 0 },
        blue: { level: 1, exp: 0 },
      },
    },
    monsters: [
      {
        uid: 'm-1',
        defId: 'monster_dual_shield',
        tier: 'normal',
        label: '双色盾普通怪',
        attackDamage: 0.5,
        initialCountdown: 4,
        bars: [
          {
            maxHp: 10000,
            shields: [
              { color: 'red', max: 3 },
              { color: 'blue', max: 3 },
            ],
            traits: [
              {
                id: 'trait-hide-card',
                label: '每回合遮住一张手牌',
                effects: [
                  {
                    timing: TIMINGS.TURN_START,
                    action: ACTIONS.HIDE_HAND_CARD,
                    params: { count: 1 },
                  },
                ],
              },
            ],
          },
        ],
      },
    ],
  };
}

function makeValidSnapshot() {
  const byColor = createEmptyDrawPileByColor();
  byColor.red = 4;
  byColor.yellow = 4;
  byColor.green = 5;
  byColor.cyan = 4;
  byColor.blue = 5;
  byColor.purple = 4;
  byColor.white = 2;

  return {
    schemaVersion: SCHEMA_VERSION,
    turn: 1,
    phase: 'player_input',
    outcome: null,
    currentColor: 'red',
    recordedColors: ['red'],
    selectedTargetUid: 'm-1',
    player: {
      hearts: 2.5,
      maxHearts: 3,
      drawTarget: 4,
      maxHandSize: 12,
      stats: { attack: 60, damageBonus: 0, critRate: 0.1, critDamage: 1.5 },
      blocks: { thisTurn: 0, untilConsumed: 1, allyCharges: 0 },
      gemLevels: {
        red: { level: 1, exp: 2, nextExp: 10 },
        green: { level: 1, exp: 0, nextExp: 10 },
        blue: { level: 1, exp: 0, nextExp: 10 },
      },
      buffs: [],
      allies: [],
      gearTraits: [],
    },
    hand: [
      {
        uid: 'c-cyan-1',
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
        uid: 'c-hidden-2',
        hidden: true,
        color: null,
        gems: null,
        relationToCurrent: CHAIN_RELATIONS.HIDDEN,
        label: '已遮住',
      },
    ],
    chain: [],
    drawPileCount: 28,
    drawPileByColor: byColor,
    discardPileCount: 0,
    monsters: [
      {
        uid: 'm-1',
        defId: 'monster_dual_shield',
        tier: 'normal',
        label: '双色盾普通怪',
        alive: true,
        barIndex: 0,
        totalBars: 1,
        hp: 10000,
        maxHp: 10000,
        shields: [
          { color: 'red', current: 3, max: 3 },
          { color: 'blue', current: 3, max: 3 },
        ],
        shieldBroken: false,
        countdown: 4,
        attacksDone: 0,
        attackDamage: 0.5,
        intentLabel: '打主角 0.5 颗心',
        activeTraits: [{ id: 'trait-hide-card', label: '每回合遮住一张手牌' }],
      },
    ],
  };
}

function makeValidPreview() {
  return {
    schemaVersion: SCHEMA_VERSION,
    chainLength: 2,
    steps: [
      {
        cardUid: 'c-yellow-1',
        resolvedColor: 'yellow',
        relation: CHAIN_RELATIONS.CONNECT,
        multiplierAfter: 2,
        hits: 4,
        triggersComplementWhite: false,
        triggersRainbow: false,
      },
      {
        cardUid: 'c-blue-1',
        resolvedColor: 'blue',
        relation: CHAIN_RELATIONS.COMPLEMENT,
        multiplierAfter: 4,
        hits: 16,
        triggersComplementWhite: true,
        triggersRainbow: false,
      },
    ],
    finalMultiplier: 4,
    hasComplementWhite: true,
    willTriggerRainbow: false,
    colorsNeededForRainbow: 5,
    shieldShred: { red: 1, green: 1, blue: 1 },
    expectedBreakUids: [],
    estimatedHits: 20,
    estimatedDamage: 1200,
    formulaLines: ['发数：4 + 16 = 20 发', '每发：60 × 1.0 × 0.75 = 45'],
  };
}

function makeValidEvents() {
  return [
    { seq: 1, type: BATTLE_EVENT_TYPES.TURN_START, payload: { turn: 1 } },
    { seq: 2, type: BATTLE_EVENT_TYPES.CHAIN_STEP, payload: { cardUid: 'c-yellow-1', color: 'yellow', multiplier: 2 } },
    {
      seq: 3,
      type: BATTLE_EVENT_TYPES.DAMAGE_PACKET,
      payload: { targetUid: 'm-1', damage: 180, hitsInPacket: 4, isCrit: false },
    },
    {
      seq: 4,
      type: BATTLE_EVENT_TYPES.SHIELD_BREAK,
      payload: { targetUid: 'm-1', countdownDelta: 1 },
    },
    {
      seq: 5,
      type: BATTLE_EVENT_TYPES.MONSTER_ATTACK,
      payload: { monsterUid: 'm-1', blocked: true, heartsLost: 0 },
    },
    {
      seq: 6,
      type: BATTLE_EVENT_TYPES.BATTLE_END,
      payload: { outcome: 'win' },
    },
  ];
}

function makeValidResult() {
  return {
    schemaVersion: SCHEMA_VERSION,
    outcome: 'win',
    remainingHearts: 2.5,
    maxHearts: 3,
    gemLevels: {
      red: { level: 2, exp: 3 },
      green: { level: 1, exp: 8 },
      blue: { level: 1, exp: 5 },
    },
    defeatedMonsters: [
      { uid: 'm-1', defId: 'monster_dual_shield', tier: 'normal' },
    ],
    encounteredMonsters: ['monster_dual_shield'],
    deckChanges: {
      addedCards: [],
      removedCardUids: [],
    },
    stats: {
      turns: 3,
      rainbowCount: 1,
      maxChainLength: 5,
      heartsLost: 0.5,
      shieldBreaks: 1,
      totalDamage: 14820,
      maxSingleHit: 360,
    },
  };
}

test('色环与七种颜色定义完整且符合 29 张固定宝石牌组', () => {
  assert.deepEqual(PRIMARY_GEMS, ['red', 'green', 'blue']);
  assert.deepEqual(COLOR_RING, ['red', 'yellow', 'green', 'cyan', 'blue', 'purple']);
  assert.equal(SEVEN_COLORS.length, 7);
  assert.equal(CARD_COLORS.length, 9);

  // 对称补色检查
  for (const color of COLOR_RING) {
    const meta = getColorMeta(color);
    assert.ok(meta.opposite, `${color} 应有补色`);
    assert.equal(getColorMeta(meta.opposite).opposite, color);
    assert.equal(meta.neighbors.length, 2);
  }

  // 固定 29 张宝石牌
  const sum = SEVEN_COLORS.reduce((acc, c) => acc + COLOR_META[c].baseDeckCount, 0);
  assert.equal(sum, BASE_GEM_DECK_TOTAL);
  assert.equal(BASE_GEM_DECK_TOTAL, 29);

  // 白牌带红绿蓝 3 颗宝石，在圆心
  assert.deepEqual(COLOR_META.white.gems, ['red', 'green', 'blue']);
  assert.equal(COLOR_META.white.isCenter, true);
  assert.equal(isPrimaryGem('red'), true);
  assert.equal(isPrimaryGem('yellow'), false);
  assert.equal(isRingColor('white'), false);
  assert.equal(isSevenColor('white'), true);
  assert.equal(isCardColor('colorless'), true);
});

test('默认动作表合乎第 3 版约定（含持续时间与再触发声明）', () => {
  const res = validateActionTable(DEFAULT_ACTION_TABLE);
  assert.equal(res.ok, true, res.errors.join('\n'));

  // 检查「挡一下」支持本回合和挡掉为止
  assert.ok(DEFAULT_ACTION_TABLE[ACTIONS.ADD_BLOCK].allowedDurations.includes(ACTION_DURATIONS.THIS_TURN));
  assert.ok(DEFAULT_ACTION_TABLE[ACTIONS.ADD_BLOCK].allowedDurations.includes(ACTION_DURATIONS.UNTIL_CONSUMED));

  // 检查「补刀伤害」明确不再触发
  assert.equal(DEFAULT_ACTION_TABLE[ACTIONS.DEAL_BONUS_DAMAGE].retrigger.policy, RETRIGGER_POLICIES.NO_RETRIGGER);
  assert.equal(DEFAULT_ACTION_TABLE[ACTIONS.DEAL_BONUS_DAMAGE].retrigger.triggersOnHit, false);

  // 故意破坏持续时间与再触发字段，校验应拦截
  const broken = {
    bad_action: {
      id: 'bad_action',
      label: '坏动作',
      params: {},
      allowedSources: ['card'],
      defaultDuration: 'forever_unknown',
      allowedDurations: ['forever_unknown'],
      retrigger: { policy: 'invalid' },
    },
  };
  const badRes = validateActionTable(broken);
  assert.equal(badRes.ok, false);
  assert.ok(badRes.errors.length >= 3);
});

test('validateEffect 能拦住非法来源、缺失参数与非法持续时间', () => {
  const okRes = validateEffect({
    timing: TIMINGS.ON_SHIELD_BREAK,
    action: ACTIONS.DEAL_BONUS_DAMAGE,
    source: 'ally',
    params: { amount: 2 },
  });
  assert.equal(okRes.ok, true, okRes.errors.join('\n'));

  // 玩家不能使用只允许怪使用的遮手牌动作
  const wrongSource = validateEffect({
    timing: TIMINGS.TURN_START,
    action: ACTIONS.HIDE_HAND_CARD,
    source: 'card',
    params: { count: 1 },
  });
  assert.equal(wrongSource.ok, false);

  // 缺少必填参数
  const missingParam = validateEffect({
    timing: TIMINGS.ON_CARD_PLAY,
    action: ACTIONS.DRAW_CARDS,
    source: 'card',
    params: {},
  });
  assert.equal(missingParam.ok, false);
});

test('可指定种子的随机数完全可复现且支持状态恢复与派生', () => {
  const a = createRng('code00-test');
  const b = createRng('code00-test');
  const seqA = Array.from({ length: 10 }, () => a.next());
  const seqB = Array.from({ length: 10 }, () => b.next());
  assert.deepEqual(seqA, seqB);

  // 不同种子序列不同
  const c = createRng('code00-other');
  const seqC = Array.from({ length: 10 }, () => c.next());
  assert.notDeepEqual(seqA, seqC);

  // 状态导出与恢复
  const saved = a.getState();
  const nextFive = Array.from({ length: 5 }, () => a.int(1, 100));
  a.setState(saved);
  const replayed = Array.from({ length: 5 }, () => a.int(1, 100));
  assert.deepEqual(nextFive, replayed);

  // shuffle 不修改原数组
  const original = [1, 2, 3, 4, 5, 6];
  const shuffled = a.shuffle(original);
  assert.deepEqual(original, [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(shuffled.slice().sort((x, y) => x - y), original);

  // fork 派生可复现
  const f1 = createRng(123).fork('monster');
  const f2 = createRng(123).fork('monster');
  assert.equal(f1.next(), f2.next());
});

test('开战包校验：合法数据通过，缺少种子/心上限/心超上限/无色排链会被拦住', () => {
  const valid = makeValidStartPacket();
  const ok = validateBattleStartPacket(valid);
  assert.equal(ok.ok, true, ok.errors.join('\n'));

  const bad = structuredClone(valid);
  bad.seed = '';
  bad.player.hearts = 4; // 超过 maxHearts: 3
  bad.player.deck[1].usage = 'chain'; // 无色功能牌不能排进链
  const res = validateBattleStartPacket(bad);
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes('seed')));
  assert.ok(res.errors.some((e) => e.includes('maxHearts')));
  assert.ok(res.errors.some((e) => e.includes('无色功能牌')));
});

test('战斗快照校验：被遮住手牌防泄漏与牌堆各色计数总和检查', () => {
  const valid = makeValidSnapshot();
  const ok = validateBattleSnapshot(valid);
  assert.equal(ok.ok, true, ok.errors.join('\n'));

  // 被遮住的牌如果泄漏真实颜色或宝石，必须报错
  const leaked = structuredClone(valid);
  leaked.hand[1].color = 'red';
  leaked.hand[1].gems = ['red'];
  leaked.hand[1].relationToCurrent = CHAIN_RELATIONS.CONNECT;
  const leakRes = validateBattleSnapshot(leaked);
  assert.equal(leakRes.ok, false);
  assert.ok(leakRes.errors.some((e) => e.includes('不得泄漏真实颜色')));

  // 牌堆各色计数之和与 drawPileCount 不一致，必须报错
  const mismatch = structuredClone(valid);
  mismatch.drawPileByColor.red = 99;
  const mismatchRes = validateBattleSnapshot(mismatch);
  assert.equal(mismatchRes.ok, false);
  assert.ok(mismatchRes.errors.some((e) => e.includes('drawPileByColor 总和')));
});

test('战斗预览与演出事件校验：允许 estimatedDamage 为 null，检查事件序号递增', () => {
  const preview = makeValidPreview();
  assert.equal(validateBattlePreview(preview).ok, true);

  // 关闭精确总伤害开关时，estimatedDamage 允许为 null
  const noExact = structuredClone(preview);
  noExact.estimatedDamage = null;
  assert.equal(validateBattlePreview(noExact).ok, true);

  const events = makeValidEvents();
  assert.equal(validateBattleEvents(events).ok, true);

  // 单条事件与序号乱序校验
  assert.equal(validateBattleEvent({ seq: 0, type: 'unknown_event', payload: {} }).ok, false);
  const badOrder = structuredClone(events);
  badOrder[2].seq = 1;
  const orderRes = validateBattleEvents(badOrder);
  assert.equal(orderRes.ok, false);
  assert.ok(orderRes.errors.some((e) => e.includes('严格大于')));
});

test('战斗结果校验：包含打完后的宝石等级和打死的怪，且严禁携带掉落字段', () => {
  const result = makeValidResult();
  const ok = validateBattleResult(result);
  assert.equal(ok.ok, true, ok.errors.join('\n'));

  // 带掉落字段必须报错
  const withLoot = { ...structuredClone(result), loot: [{ id: 'gold', amount: 10 }] };
  const lootRes = validateBattleResult(withLoot);
  assert.equal(lootRes.ok, false);
  assert.ok(lootRes.errors.some((e) => e.includes('不管掉落')));

  // 输掉时剩的心不为 0 必须报错
  const badLose = { ...structuredClone(result), outcome: 'lose', remainingHearts: 0.5 };
  const loseRes = validateBattleResult(badLose);
  assert.equal(loseRes.ok, false);
  assert.ok(loseRes.errors.some((e) => e.includes('remainingHearts 必须为 0')));
});
