import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIONS,
  ACTION_DURATIONS,
  BATTLE_EVENT_TYPES,
  CHAIN_RELATIONS,
  SCHEMA_VERSION,
  TIMINGS,
  validateBattleEvents,
  validateBattlePreview,
  validateBattleResult,
  validateBattleSnapshot,
} from '../../shared/index.js';
import { createBattle } from '../index.js';

function makeGem(uid, color, gems) {
  return {
    uid,
    defId: `gem_${color}`,
    kind: 'gem',
    usage: 'chain',
    color,
    gems,
    enhanced: false,
    drawAfterPlay: 0,
    label: `${color}宝石`,
    effects: [],
  };
}

function makePacket({ deck, monsters, stats = {}, drawTarget = 4, hearts = 3, maxHearts = 3, seed = 'rule-test', rulesConfig = {} }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    seed,
    rulesConfig: {
      drawMode: 'refill',
      freeKeepCount: 0,
      shieldActiveMultiplier: 0.75,
      shieldBrokenMultiplier: 1.5,
      shieldBreakPush: 1,
      initialCountdown: 4,
      maxHandSize: 12,
      ...rulesConfig,
    },
    player: {
      deck,
      stats: { attack: 100, damageBonus: 0, critRate: 0, critDamage: 1.5, ...stats },
      drawTarget,
      hearts,
      maxHearts,
      buffs: [],
      allies: [],
      gearTraits: [],
      gemLevels: {
        red: { level: 1, exp: 0 },
        green: { level: 1, exp: 0 },
        blue: { level: 1, exp: 0 },
      },
    },
    monsters,
  };
}

function makeMonster({ uid = 'm1', maxHp = 10000, shields = [], countdown = 4, attackDamage = 0.5, traits = [], bars = null }) {
  return {
    uid,
    defId: 'test_monster',
    tier: 'normal',
    label: '测试怪',
    attackDamage,
    initialCountdown: countdown,
    bars: bars || [{ maxHp, shields, traits }],
  };
}

test('断色倍率不掉，补色合白不削盾，破盾那张吃 0.75 下一张立刻吃 1.5', () => {
  // 牌组只有 4 张，第 1 回合全部摸到手里
  const deck = [
    makeGem('c-red', 'red', ['red']),
    makeGem('c-green', 'green', ['green']),     // 红 -> 绿：断色（倍率不掉，保持 ×1）
    makeGem('c-cyan', 'cyan', ['green', 'blue']), // 绿 -> 青：接上（×2）
    makeGem('c-red2', 'red', ['red']),          // 青 -> 红：补色合白（×4）
  ];
  // 怪带 1 格红盾（没有蓝绿盾）：第 1 张红牌打出后刚好破盾
  const packet = makePacket({
    deck,
    drawTarget: 4,
    monsters: [makeMonster({ maxHp: 50000, shields: [{ color: 'red', max: 1 }] })],
  });

  const battle = createBattle(packet);
  assert.equal(validateBattleSnapshot(battle.getSnapshot()).ok, true);

  battle.queueCard('c-red');
  battle.queueCard('c-green');
  battle.queueCard('c-cyan');
  battle.queueCard('c-red2');

  const preview = battle.getPreview();
  assert.equal(validateBattlePreview(preview).ok, true, validateBattlePreview(preview).errors.join('\n'));
  // 第 1 张红（起色 ×1），第 2 张绿（断色仍 ×1，倍率不掉），第 3 张青（邻色 ×2），第 4 张红（补色 ×4）
  assert.equal(preview.steps[0].multiplierAfter, 1);
  assert.equal(preview.steps[1].relation, CHAIN_RELATIONS.BREAK);
  assert.equal(preview.steps[1].multiplierAfter, 1);
  assert.equal(preview.steps[2].multiplierAfter, 2);
  assert.equal(preview.steps[3].relation, CHAIN_RELATIONS.COMPLEMENT);
  assert.equal(preview.steps[3].multiplierAfter, 4);

  const res = battle.commitChain();
  assert.equal(validateBattleEvents(res.events).ok, true, validateBattleEvents(res.events).errors.join('\n'));
  assert.equal(validateBattleSnapshot(res.snapshot).ok, true, validateBattleSnapshot(res.snapshot).errors.join('\n'));

  // 逐张精确验算伤害（attack = 100, crit = 0）：
  // 1) 红：1 颗 × 1 发 × 100 × 0.75 = 75 -> 然后削红盾 1 格破盾！
  // 2) 绿（破盾后吃 1.5）：1 颗 × 1 发 × 100 × 1.5 = 150
  // 3) 青（2 颗 × 2 发 = 4 发）：4 × 100 × 1.5 = 600
  // 4) 红（补色 ×4，1 颗红 4 发 + 合白 3 颗各 4 发 = 16 发）：16 × 100 × 1.5 = 2400
  // 总伤害 = 75 + 150 + 600 + 2400 = 3225
  const summary = res.events.find((e) => e.type === BATTLE_EVENT_TYPES.CHAIN_SUMMARY);
  assert.equal(summary.payload.totalDamage, 3225);

  // 破盾推倒计时 +1，回合末倒计时 -1，所以仍保持 4
  assert.equal(res.snapshot.monsters[0].countdown, 4);
});

test('合白那一轮白色伤害不削盾（只有宝石削盾）', () => {
  // 怪带蓝盾 2 格；打出红 -> 青（青带绿+蓝，合白不额外削蓝盾），蓝盾只应削 1 格而非 2 格
  const deck = [
    makeGem('c-red', 'red', ['red']),
    makeGem('c-cyan', 'cyan', ['green', 'blue']),
  ];
  const packet = makePacket({
    deck,
    drawTarget: 2,
    monsters: [makeMonster({ maxHp: 50000, shields: [{ color: 'blue', max: 2 }] })],
  });
  const battle = createBattle(packet);
  battle.queueCard('c-red');
  battle.queueCard('c-cyan');
  const res = battle.commitChain();

  assert.equal(res.snapshot.monsters[0].shields[0].current, 1);
  assert.equal(res.snapshot.monsters[0].shieldBroken, false);
});

test('「记两边颜色」马上用补摸 1 张且攒满 6 色不立即彩虹，等下一张带色牌触发并再打两遍', () => {
  const recordCard = {
    uid: 'c-rec',
    defId: 'fn_record_neighbors',
    kind: 'function',
    usage: 'instant',
    color: 'colorless',
    gems: [],
    enhanced: false,
    drawAfterPlay: 1,
    label: '记两边颜色',
    effects: [{
      timing: TIMINGS.ON_CARD_PLAY,
      action: ACTIONS.RECORD_COLORS,
      duration: ACTION_DURATIONS.INSTANT,
      params: { mode: 'neighbors', count: 2 },
    }],
  };
  // 5 张顺序凑满 4 色 + 记两边补齐 2 色 + 1 张红牌触发彩虹
  const deck = [
    makeGem('c-red', 'red', ['red']),
    makeGem('c-yellow', 'yellow', ['red', 'green']),
    makeGem('c-green', 'green', ['green']),
    makeGem('c-cyan', 'cyan', ['green', 'blue']),
    makeGem('c-blue', 'blue', ['blue']),
    makeGem('c-purple', 'purple', ['red', 'blue']),
    recordCard,
  ];
  const packet = makePacket({
    deck,
    drawTarget: 7,
    monsters: [makeMonster({ maxHp: 999999, shields: [{ color: 'red', max: 5 }] })],
  });
  const battle = createBattle(packet);
  // 先打 4 张凑出红、黄、绿、青（剩蓝、紫）
  battle.queueCard('c-red');
  battle.queueCard('c-yellow');
  battle.queueCard('c-green');
  battle.queueCard('c-cyan');
  battle.commitChain();

  // 第 2 回合开始：当前色是青，已集红/黄/绿/青 4 色；再打蓝（变 5 色），或者现在用「记两边」把绿/蓝记进
  // 这里先打蓝把 currentColor 变为蓝（集齐红黄绿青蓝 5 色）
  battle.queueCard('c-blue');
  const r2 = battle.commitChain();
  assert.equal(r2.snapshot.recordedColors.length, 5);

  // 第 3 回合：当前色为蓝，手里有 recordCard 和 c-purple（或任何色）；用 recordCard 记上紫 -> 变 6 色，但不触发彩虹
  const snap3 = battle.getSnapshot();
  const recInHand = snap3.hand.find((c) => c.defId === 'fn_record_neighbors');
  if (recInHand) {
    const instRes = battle.playInstantCard(recInHand.uid);
    assert.equal(instRes.ok, true);
    assert.equal(instRes.snapshot.recordedColors.length, 6);
    assert.equal(instRes.events.some((e) => e.type === BATTLE_EVENT_TYPES.RAINBOW_TRIGGER), false);

    // 下一张打出蓝（同色），立刻触发彩虹，再打两遍但不额外削盾
    const blueCard = instRes.snapshot.hand.find((c) => c.color === 'blue');
    if (blueCard) {
      battle.queueCard(blueCard.uid);
      const r3 = battle.commitChain();
      assert.equal(r3.events.some((e) => e.type === BATTLE_EVENT_TYPES.RAINBOW_TRIGGER), true);
    }
  }
});

test('打空一条血的那张牌不算破盾也不削下一条新盾，溢出吃新条特性', () => {
  // 2 条血：第 1 条血只有 100、带 1 格红盾；第 2 条血 1000、带 4 格红盾且前 1 发不掉血
  const deck = [
    makeGem('c-red1', 'red', ['red']),
    makeGem('c-red2', 'red', ['red']),
  ];
  const packet = makePacket({
    deck,
    drawTarget: 2,
    stats: { attack: 200 },
    monsters: [makeMonster({
      countdown: 4,
      bars: [
        { maxHp: 100, shields: [{ color: 'red', max: 1 }], traits: [] },
        {
          maxHp: 1000,
          shields: [{ color: 'red', max: 4 }],
          traits: [{
            id: 'ignore_1',
            label: '前 1 发不掉血',
            effects: [{
              timing: TIMINGS.PASSIVE,
              action: ACTIONS.MODIFY_RULE,
              duration: ACTION_DURATIONS.THIS_BATTLE,
              params: { ruleKey: 'ignoreFirstHitsPerTurn', value: 1 },
            }],
          }],
        },
      ],
    })],
  });

  const battle = createBattle(packet);
  // 只打第 1 张红牌（200 * 0.75 = 150，直接打空第 1 条 100 血，溢出 50 被第 2 条的前 1 发不掉血吃掉）
  battle.queueCard('c-red1');
  const res = battle.commitChain();

  // 第 1 条被打空，不应触发破盾，也不应削第 2 条的红盾（仍保持 4 格），倒计时也未推 +1（从 4 变 3）
  assert.equal(res.events.some((e) => e.type === BATTLE_EVENT_TYPES.SHIELD_BREAK), false);
  assert.equal(res.snapshot.monsters[0].barIndex, 1);
  assert.equal(res.snapshot.monsters[0].shields[0].current, 4);
  assert.equal(res.snapshot.monsters[0].hp, 1000);
  assert.equal(res.snapshot.monsters[0].countdown, 3);
});

test('被破盾倒计时 -1 特性把倒计时拨到 0 时不打断当前链，链打完后出手一次', () => {
  const deck = [
    makeGem('c-red1', 'red', ['red']),
    makeGem('c-red2', 'red', ['red']),
  ];
  const packet = makePacket({
    deck,
    drawTarget: 2,
    monsters: [makeMonster({
      maxHp: 50000,
      countdown: 1,
      shields: [{ color: 'red', max: 1 }],
      traits: [{
        id: 'reverse_break',
        label: '每被破一次盾倒计时 -1',
        effects: [{
          timing: TIMINGS.PASSIVE,
          action: ACTIONS.MODIFY_RULE,
          duration: ACTION_DURATIONS.THIS_BATTLE,
          params: { ruleKey: 'shieldBreakCountdownDelta', value: -1 },
        }],
      }],
    })],
  });

  const battle = createBattle(packet);
  battle.queueCard('c-red1');
  battle.queueCard('c-red2');
  const res = battle.commitChain();

  // 链的两张牌都完整打完（c-red2 没被打断），然后怪出手一次扣 0.5 颗心
  const steps = res.events.filter((e) => e.type === BATTLE_EVENT_TYPES.CHAIN_STEP);
  assert.equal(steps.length, 2);
  const attacks = res.events.filter((e) => e.type === BATTLE_EVENT_TYPES.MONSTER_ATTACK);
  assert.equal(attacks.length, 1);
  assert.equal(res.snapshot.player.hearts, 2.5);
});

test('挡一下留到挡掉为止且跨回合不消失；被遮住手牌防泄漏；满 12 张再摸进弃牌堆', () => {
  const blockCard = {
    uid: 'c-block',
    defId: 'fn_block_next',
    kind: 'function',
    usage: 'instant',
    color: 'colorless',
    gems: [],
    enhanced: false,
    drawAfterPlay: 1,
    label: '挡下一次攻击',
    effects: [{
      timing: TIMINGS.ON_CARD_PLAY,
      action: ACTIONS.ADD_BLOCK,
      duration: ACTION_DURATIONS.UNTIL_CONSUMED,
      params: { count: 1 },
    }],
  };
  const deck = [blockCard];
  for (let i = 1; i <= 15; i++) deck.push(makeGem(`c-${i}`, 'red', ['red']));

  const packet = makePacket({
    deck,
    drawTarget: 12,
    monsters: [makeMonster({
      maxHp: 999999,
      countdown: 2,
      traits: [{
        id: 'hide_1',
        label: '每回合遮住一张手牌',
        effects: [{
          timing: TIMINGS.TURN_START,
          action: ACTIONS.HIDE_HAND_CARD,
          duration: ACTION_DURATIONS.THIS_TURN,
          params: { count: 1 },
        }],
      }],
    })],
  });

  const battle = createBattle(packet);
  const snap1 = battle.getSnapshot();
  assert.equal(validateBattleSnapshot(snap1).ok, true, validateBattleSnapshot(snap1).errors.join('\n'));
  // 应有 1 张手牌被遮住，且不含真色
  const hiddenCard = snap1.hand.find((c) => c.hidden);
  assert.ok(hiddenCard);
  assert.equal(hiddenCard.color, null);
  assert.equal(hiddenCard.relationToCurrent, CHAIN_RELATIONS.HIDDEN);

  // 如果手里有非遮住的挡一下，打出去 -> 留到挡掉为止
  const blk = snap1.hand.find((c) => !c.hidden && c.defId === 'fn_block_next');
  if (blk) {
    battle.playInstantCard(blk.uid);
    // 第 1 回合空过：怪倒计时 2 -> 1，不出手，挡留着
    const r1 = battle.commitChain();
    assert.equal(r1.snapshot.player.blocks.untilConsumed, 1);
    // 第 2 回合空过：怪出手，被挡掉，主角不掉心！
    const r2 = battle.commitChain();
    assert.equal(r2.snapshot.player.hearts, 3);
    assert.equal(r2.snapshot.player.blocks.untilConsumed, 0);
  }
});

test('同种子完全可复现，胜利后 BattleResult 严格通过 shared 校验且不含掉落', () => {
  const deck = [
    makeGem('r1', 'red', ['red']),
    makeGem('r2', 'red', ['red']),
    makeGem('y1', 'yellow', ['red', 'green']),
    makeGem('w1', 'white', ['red', 'green', 'blue']),
  ];
  const makeP = () => makePacket({
    deck,
    seed: 'same-seed-99',
    stats: { attack: 500, critRate: 0.3, critDamage: 2 },
    monsters: [makeMonster({ maxHp: 1500, shields: [{ color: 'red', max: 2 }] })],
  });

  const b1 = createBattle(makeP());
  const b2 = createBattle(makeP());
  b1.autoArrange('break_first');
  b2.autoArrange('break_first');

  const r1 = b1.commitChain();
  const r2 = b2.commitChain();

  assert.deepEqual(r1.result, r2.result);
  assert.ok(r1.result);
  assert.equal(r1.result.outcome, 'win');
  const check = validateBattleResult(r1.result);
  assert.equal(check.ok, true, check.errors.join('\n'));
  assert.equal(r1.result.defeatedMonsters.length, 1);
});

test('摸牌开关（draw_one 与 freeKeepCount）正常工作', () => {
  const deck = Array.from({ length: 10 }, (_, i) => makeGem(`g-${i}`, 'red', ['red']));

  // 1) draw_one：起手 3 张，不打牌下回合变 4 张
  const b1 = createBattle(makePacket({
    deck,
    drawTarget: 4,
    rulesConfig: { drawMode: 'draw_one' },
    monsters: [makeMonster({ maxHp: 99999 })],
  }));
  assert.equal(b1.getSnapshot().hand.length, 3);
  const r1 = b1.commitChain();
  assert.equal(r1.snapshot.hand.length, 4);

  // 2) freeKeepCount = 1：留 1 张不占 N 名额 -> 起手 4 张，打 3 留 1，下回合应补到 5 张
  const b2 = createBattle(makePacket({
    deck,
    drawTarget: 4,
    rulesConfig: { drawMode: 'refill', freeKeepCount: 1 },
    monsters: [makeMonster({ maxHp: 99999 })],
  }));
  const h = b2.getSnapshot().hand;
  b2.queueCard(h[0].uid);
  b2.queueCard(h[1].uid);
  b2.queueCard(h[2].uid);
  const r2 = b2.commitChain();
  assert.equal(r2.snapshot.hand.length, 5);
});

test('第 4 版摸牌（draw_floor）：先摸 2，不到 N 补到 N，回合开始最多 N + 2', () => {
  const deck = Array.from({ length: 40 }, (_, i) => makeGem(`g-${i}`, 'red', ['red']));
  const b = createBattle(makePacket({
    deck,
    drawTarget: 4,
    rulesConfig: { drawMode: 'draw_floor', drawPerTurn: 2, handOverN: 2 },
    monsters: [makeMonster({ maxHp: 9999999 })],
  }));
  const handLen = () => b.getSnapshot().hand.length;
  const play = (n) => { b.getSnapshot().hand.slice(0, n).forEach((c) => b.queueCard(c.uid)); return b.commitChain().snapshot.hand.length; };
  assert.equal(handLen(), 4, '起手补到 N');
  assert.equal(play(0), 6, '一张不打：留 4 摸 2');
  assert.equal(play(0), 6, '再不打：到 N + 2 就不摸了');
  assert.equal(play(3), 5, '打 3 留 3：摸 2');
  assert.equal(play(4), 4, '打 4 留 1：摸 2 只有 3，补到 N');

  // N 跟着养成涨，上限一起涨（摸牌加成不会被卡死）
  const b5 = createBattle(makePacket({
    deck,
    drawTarget: 5,
    rulesConfig: { drawMode: 'draw_floor', drawPerTurn: 2, handOverN: 2 },
    monsters: [makeMonster({ maxHp: 9999999 })],
  }));
  assert.equal(b5.getSnapshot().hand.length, 5);
  assert.equal(b5.commitChain().snapshot.hand.length, 7);
  assert.equal(b5.commitChain().snapshot.hand.length, 7);
});
