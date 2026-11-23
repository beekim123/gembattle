// 阶段 1 后半段：4 个加成、2 个队友在规则里的效果，外加拖拽要用的「插到第几个」「链里换位子」。
// 加成、队友的写法直接写在这里（跟 content/ 里的一样），battle-rules 不依赖 content。
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ACTIONS,
  ACTION_DURATIONS,
  BATTLE_EVENT_TYPES,
  CHAIN_RELATIONS,
  COLOR_RING,
  SCHEMA_VERSION,
  TIMINGS,
  validateBattleEvents,
} from '../../shared/index.js';
import { createBattle } from '../index.js';
import { advanceRecordedColors } from '../chain-math.js';

function makeGem(uid, color, gems) {
  return { uid, defId: `gem_${color}`, kind: 'gem', usage: 'chain', color, gems, enhanced: false, drawAfterPlay: 0, label: `${color}宝石`, effects: [] };
}

const ruleBuff = (id, ruleKey) => ({
  id, label: id, lane: 'chain', description: '',
  effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey, value: true } }],
});
const BREAK_WHITE = { id: 'buff_break_white', label: '破盾时全体吃一轮白', lane: 'break', effects: [{ timing: TIMINGS.ON_SHIELD_BREAK, action: ACTIONS.WHITE_ROUND, params: { target: 'all' } }] };
const ASSASSIN = {
  id: 'ally_assassin_break', role: 'assassin', mode: 'trigger', label: '补刀', usesPerBattle: null,
  effects: [{ timing: TIMINGS.ON_SHIELD_BREAK, action: ACTIONS.DEAL_BONUS_DAMAGE, params: { target: 'event_monster', amount: 15, scale: 'attackRatio', canCrit: true } }],
};

function makePacket({ deck, monsters, buffs = [], allies = [], drawTarget = 4 }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    seed: 'buff-test',
    rulesConfig: { drawMode: 'refill', freeKeepCount: 0, shieldActiveMultiplier: 0.75, shieldBrokenMultiplier: 1.5, shieldBreakPush: 1, initialCountdown: 4, maxHandSize: 12 },
    player: {
      deck,
      stats: { attack: 100, damageBonus: 0, critRate: 0, critDamage: 1.5 },
      drawTarget, hearts: 3, maxHearts: 3,
      buffs, allies, gearTraits: [],
      gemLevels: { red: { level: 1, exp: 0 }, green: { level: 1, exp: 0 }, blue: { level: 1, exp: 0 } },
    },
    monsters,
  };
}

function mon(uid, shields = [], maxHp = 500000) {
  return { uid, defId: 'test_monster', tier: 'normal', label: '测试怪', attackDamage: 0.5, initialCountdown: 4, bars: [{ maxHp, shields, traits: [] }] };
}

test('第一次断色照样 ×2：一条链只算第一次', () => {
  const deck = () => [makeGem('a', 'red', ['red']), makeGem('b', 'green', ['green']), makeGem('c', 'blue', ['blue'])];
  const run = (buffs) => {
    const b = createBattle(makePacket({ deck: deck(), drawTarget: 3, monsters: [mon('m1')], buffs }));
    ['a', 'b', 'c'].forEach((u) => b.queueCard(u));
    const p = b.getPreview();
    const res = b.commitChain();
    const sum = res.events.find((e) => e.type === BATTLE_EVENT_TYPES.CHAIN_SUMMARY).payload;
    return { steps: p.steps.map((s) => [s.relation, s.multiplierAfter]), final: sum.finalMultiplier, events: res.events };
  };
  const off = run([]);
  assert.deepEqual(off.steps, [[CHAIN_RELATIONS.START, 1], [CHAIN_RELATIONS.BREAK, 1], [CHAIN_RELATIONS.BREAK, 1]]);
  const on = run([ruleBuff('第一次断色照样 ×2', 'firstBreakStillDoubles')]);
  assert.deepEqual(on.steps, [[CHAIN_RELATIONS.START, 1], [CHAIN_RELATIONS.BREAK, 2], [CHAIN_RELATIONS.BREAK, 2]]);
  assert.equal(on.final, 2);
  assert.ok(on.events.some((e) => e.type === BATTLE_EVENT_TYPES.EFFECT_TRIGGERED && e.payload.source === '第一次断色照样 ×2'));
});

test('合白不清空集色：补色以后集到的颜色还在', () => {
  // 红 → 黄（接上）→ 蓝（黄的补色，合白）
  const deck = () => [makeGem('a', 'red', ['red']), makeGem('b', 'yellow', ['red', 'green']), makeGem('c', 'blue', ['blue'])];
  const need = (buffs) => {
    const b = createBattle(makePacket({ deck: deck(), drawTarget: 3, monsters: [mon('m1')], buffs }));
    ['a', 'b', 'c'].forEach((u) => b.queueCard(u));
    const p = b.getPreview();
    b.commitChain();
    return { preview: p.colorsNeededForRainbow, after: b.getSnapshot().recordedColors.slice().sort() };
  };
  const off = need([]);
  const on = need([ruleBuff('合白不清空集色', 'complementKeepsRecorded')]);
  assert.deepEqual(on.after, ['blue', 'red', 'yellow']);
  assert.ok(off.after.length < on.after.length);
  assert.ok(on.preview < off.preview);
});

test('彩虹以后留 3 色：留下这一色和它两边', () => {
  const six = new Set(COLOR_RING.filter((c) => c !== 'green'));
  const plain = advanceRecordedColors(six, 'green', CHAIN_RELATIONS.CONNECT, false, {});
  assert.equal(plain.triggeredRainbow, true);
  assert.deepEqual([...plain.nextRecorded], ['green']);
  const kept = advanceRecordedColors(six, 'green', CHAIN_RELATIONS.CONNECT, false, { rainbowKeepNeighbors: true });
  assert.equal(kept.triggeredRainbow, true);
  const i = COLOR_RING.indexOf('green');
  const expect = [COLOR_RING[i], COLOR_RING[(i + 1) % 6], COLOR_RING[(i + 5) % 6]].sort();
  assert.deepEqual([...kept.nextRecorded].sort(), expect);
  // 老写法（布尔）还能用
  const old = advanceRecordedColors(new Set(['red', 'yellow']), 'blue', CHAIN_RELATIONS.COMPLEMENT, false, true);
  assert.equal(old.nextRecorded.size, 3);
});

test('破盾时全体吃一轮白：两只怪都挨，按当时倍率打发数，不削盾', () => {
  const deck = [makeGem('a', 'red', ['red'])];
  const b = createBattle(makePacket({
    deck, drawTarget: 1,
    monsters: [mon('m1', [{ color: 'red', max: 1 }]), mon('m2', [{ color: 'blue', max: 2 }])],
    buffs: [BREAK_WHITE],
  }));
  b.queueCard('a');
  const res = b.commitChain();
  assert.equal(validateBattleEvents(res.events).ok, true, validateBattleEvents(res.events).errors.join('\n'));
  const white = res.events.filter((e) => e.type === BATTLE_EVENT_TYPES.DAMAGE_PACKET && e.payload.sourceLabel === '破盾时全体吃一轮白');
  const targets = new Set(white.map((e) => e.payload.targetUid));
  assert.deepEqual([...targets].sort(), ['m1', 'm2']);
  assert.ok(white.every((e) => e.payload.isWhite));
  // 第二只的蓝盾不被这一轮白削
  assert.equal(res.snapshot.monsters[1].shields[0].current, 2);
  // 红宝石 75（破盾前 ×0.75）+ 第一只吃 3 发白 ×1.5 = 450
  const m1 = res.events.filter((e) => e.type === BATTLE_EVENT_TYPES.DAMAGE_PACKET && e.payload.targetUid === 'm1').reduce((s, e) => s + e.payload.damage, 0);
  assert.equal(m1, 75 + 450);
});

test('刺客补刀：破盾那一下先报队友出手，再补一刀给破盾的那只', () => {
  const deck = [makeGem('a', 'red', ['red'])];
  const b = createBattle(makePacket({
    deck, drawTarget: 1,
    monsters: [mon('m1', [{ color: 'red', max: 1 }]), mon('m2')],
    allies: [ASSASSIN],
  }));
  b.queueCard('a');
  const res = b.commitChain();
  const actIdx = res.events.findIndex((e) => e.type === BATTLE_EVENT_TYPES.ALLY_ACTION);
  const hitIdx = res.events.findIndex((e) => e.type === BATTLE_EVENT_TYPES.DAMAGE_PACKET && e.payload.sourceLabel === '补刀');
  assert.ok(actIdx >= 0 && hitIdx > actIdx);
  const hit = res.events[hitIdx].payload;
  assert.equal(hit.targetUid, 'm1');
  assert.equal(hit.damage, 100 * 15 * 1.5);
});

test('拖拽用：插到链的第几个、链里换位子', () => {
  const deck = [makeGem('a', 'red', ['red']), makeGem('b', 'yellow', ['red', 'green']), makeGem('c', 'green', ['green'])];
  const b = createBattle(makePacket({ deck, drawTarget: 3, monsters: [mon('m1')] }));
  assert.ok(b.queueCard('a'));
  assert.ok(b.queueCard('c', 0));
  assert.ok(b.queueCard('b', 1));
  assert.deepEqual(b.getSnapshot().chain.map((c) => c.uid), ['c', 'b', 'a']);
  assert.ok(b.moveChainCard('a', 0));
  assert.deepEqual(b.getSnapshot().chain.map((c) => c.uid), ['a', 'c', 'b']);
  assert.ok(b.moveChainCard('c', 2));
  assert.deepEqual(b.getSnapshot().chain.map((c) => c.uid), ['a', 'b', 'c']);
});
