// 阶段 2 新加的 8 个加成 + 宝石强化的 4 个方向（设计稿 6.1、6.3；候选见 给用户挑-阶段2到4.md E1、E4）。
import test from 'node:test';
import assert from 'node:assert/strict';

import { ACTIONS, ACTION_DURATIONS, BATTLE_EVENT_TYPES, SCHEMA_VERSION, TIMINGS } from '../../shared/index.js';
import { createBattle } from '../index.js';

const gem = (uid, color, gems, enhance = null) => ({ uid, defId: `gem_${color}`, kind: 'gem', usage: 'chain', color, gems, enhanced: Boolean(enhance), enhance, drawAfterPlay: 0, label: color, effects: [] });
const rule = (ruleKey, value = true) => ({ id: ruleKey, label: ruleKey, lane: 'chain', description: '', effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey, value } }] });
const mon = (uid, shields = [], hp = 5000000) => ({ uid, defId: 'tm', tier: 'normal', label: '怪', attackDamage: 0.5, initialCountdown: 4, bars: [{ maxHp: hp, shields, traits: [] }] });

function battle({ deck, buffs = [], shields = [], drawTarget = 3 }) {
  return createBattle({
    schemaVersion: SCHEMA_VERSION,
    seed: 's2',
    rulesConfig: { drawMode: 'refill', freeKeepCount: 0, shieldActiveMultiplier: 1, shieldBrokenMultiplier: 1.5, shieldBreakPush: 1, initialCountdown: 4, maxHandSize: 12 },
    player: { deck, stats: { attack: 100, damageBonus: 0, critRate: 0, critDamage: 1.5 }, drawTarget, hearts: 3, maxHearts: 3, buffs, allies: [], gearTraits: [], gemLevels: { red: { level: 1, exp: 0 }, green: { level: 1, exp: 0 }, blue: { level: 1, exp: 0 } } },
    monsters: [mon('m1', shields)],
  });
}
const summary = (res) => res.events.find((e) => e.type === BATTLE_EVENT_TYPES.CHAIN_SUMMARY).payload;
const shredTotal = (res) => res.events.filter((e) => e.type === BATTLE_EVENT_TYPES.SHIELD_SHRED).reduce((s, e) => s + e.payload.amount, 0);

test('强化「疼」这张每发 +50%，「多」多算 1 颗宝石打发', () => {
  const base = battle({ deck: [gem('a', 'red', ['red'])], drawTarget: 1 });
  base.queueCard('a');
  const d0 = summary(base.commitChain()).totalDamage;
  const pain = battle({ deck: [gem('a', 'red', ['red'], { dir: 'pain' })], drawTarget: 1 });
  pain.queueCard('a');
  assert.equal(summary(pain.commitChain()).totalDamage, d0 * 1.5);
  const more = battle({ deck: [gem('a', 'red', ['red'], { dir: 'more' })], drawTarget: 1 });
  more.queueCard('a');
  const s = summary(more.commitChain());
  assert.equal(s.totalHits, 2);
  assert.equal(s.totalDamage, d0 * 2);
});

test('强化「破盾」每颗多削 1 格；加成「第一张对色多削」只算一条链里第一张', () => {
  const sh = () => [{ color: 'red', max: 6 }];
  const a = battle({ deck: [gem('a', 'red', ['red'], { dir: 'shred' })], drawTarget: 1, shields: sh() });
  a.queueCard('a');
  assert.equal(shredTotal(a.commitChain()), 2);
  const b = battle({ deck: [gem('a', 'red', ['red']), gem('b', 'red', ['red'])], drawTarget: 2, shields: sh(), buffs: [rule('firstMatchExtraShred')] });
  b.queueCard('a'); b.queueCard('b');
  const p = b.getPreview();
  assert.equal(p.shieldShred.red, 3);
  assert.equal(shredTotal(b.commitChain()), 3);
});

test('破盾更疼不推倒计时：破了 ×2.25，倒计时不动', () => {
  const b = battle({ deck: [gem('a', 'red', ['red']), gem('b', 'red', ['red'])], drawTarget: 2, shields: [{ color: 'red', max: 1 }], buffs: [rule('brokenMultiplier', 2.25), rule('noBreakPush')] });
  b.queueCard('a'); b.queueCard('b');
  const res = b.commitChain();
  const brk = res.events.find((e) => e.type === BATTLE_EVENT_TYPES.SHIELD_BREAK);
  assert.equal(brk.payload.countdownDelta, 0);
  // 第二张接上 ×2、破盾后 ×2.25：100 × 2 × 2.25 = 450
  assert.ok(summary(res).totalDamage >= 100 + 450 - 1);
});

test('合白再多打一轮：补色那一下的白色伤害打两轮', () => {
  const deck = () => [gem('a', 'red', ['red']), gem('b', 'cyan', ['green', 'blue'])];
  const plain = battle({ deck: deck(), drawTarget: 2 });
  plain.queueCard('a'); plain.queueCard('b');
  const h0 = summary(plain.commitChain()).totalHits;
  const twice = battle({ deck: deck(), drawTarget: 2, buffs: [rule('complementExtraRound')] });
  twice.queueCard('a'); twice.queueCard('b');
  assert.equal(summary(twice.commitChain()).totalHits, h0 + 3 * 2);
});

test('断色不清空集色；留着牌下回合从 ×2 起；多留 1 张不占名额', () => {
  const b = battle({ deck: [gem('a', 'red', ['red']), gem('b', 'green', ['green'])], drawTarget: 2, buffs: [rule('breakKeepsRecorded')] });
  b.queueCard('a'); b.queueCard('b');
  b.commitChain();
  assert.ok(b.getSnapshot().recordedColors.includes('red'));

  const deck = Array.from({ length: 10 }, (_, i) => gem(`k${i}`, 'red', ['red']));
  const k = battle({ deck, drawTarget: 3, buffs: [rule('keptStartsDouble'), rule('extraFreeKeep', 1)] });
  const hand = k.getSnapshot().hand;
  k.queueCard(hand[0].uid); // 留 2 张
  k.commitChain();
  const snap = k.getSnapshot();
  assert.equal(snap.hand.length, 4, '留 2 张，1 张不占名额：补到 3 + 1');
  k.queueCard(snap.hand[0].uid);
  const s = summary(k.commitChain());
  assert.equal(s.finalMultiplier, 4, '从 ×2 起，接上上回合的红再 ×2');
});

test('每回合开始多记一色', () => {
  const seed = { id: 'seed', label: '每回合多记一色', lane: 'rainbow', effects: [{ timing: TIMINGS.TURN_START, action: ACTIONS.RECORD_COLORS, params: { mode: 'neighbors', count: 1 } }] };
  const b = battle({ deck: [gem('a', 'red', ['red']), gem('b', 'red', ['red']), gem('c', 'red', ['red'])], drawTarget: 1, buffs: [seed] });
  assert.equal(b.getSnapshot().recordedColors.length, 1);
});
