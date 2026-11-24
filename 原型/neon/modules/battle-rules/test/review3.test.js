// 第 3 轮审核以后改的（审核/汇总-2026-11-24.md）：
// 摸牌上限 N + 1；「合白 2 次，下回合多 1 张」；白牌不削下一条的新盾；预览照打出去的算法空跑，跟打出去算的一样。
import test from 'node:test';
import assert from 'node:assert/strict';

import { ACTIONS, ACTION_DURATIONS, BATTLE_EVENT_TYPES, SCHEMA_VERSION, TIMINGS, RULE_KEYS, validateBattlePreview } from '../../shared/index.js';
import { createBattle } from '../index.js';

const gem = (uid, color, gems) => ({ uid, defId: `gem_${color}`, kind: 'gem', usage: 'chain', color, gems, enhanced: false, drawAfterPlay: 0, label: color, effects: [] });
const GEMS = { red: ['red'], yellow: ['red', 'green'], green: ['green'], cyan: ['green', 'blue'], blue: ['blue'], purple: ['red', 'blue'], white: ['red', 'green', 'blue'] };
const g = (uid, color) => gem(uid, color, GEMS[color]);
const rule = (ruleKey, value = true) => ({ id: ruleKey, label: ruleKey, lane: 'chain', description: '', effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey, value } }] });
const BREAK_WHITE = { id: 'buff_break_white', label: '破过盾，链尾全体补一轮白', lane: 'break', effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: RULE_KEYS.breakWhiteAtChainEnd, value: true } }] };
const ASSASSIN = {
  id: 'ally_assassin_break', role: 'assassin', mode: 'trigger', label: '补刀', usesPerBattle: null,
  effects: [{ timing: TIMINGS.ON_SHIELD_BREAK, action: ACTIONS.DEAL_BONUS_DAMAGE, params: { target: 'event_monster', amount: 15, scale: 'attackRatio', canCrit: true } }],
};
const mon = (uid, bars) => ({ uid, defId: 'tm', tier: 'normal', label: '怪', attackDamage: 0.5, initialCountdown: 4, bars });
const bar = (maxHp, shields = [], traits = []) => ({ maxHp, shields, traits });

function battle({ deck, monsters, buffs = [], allies = [], drawTarget = 4, rulesConfig = {}, stats = {}, seed = 'r3' }) {
  return createBattle({
    schemaVersion: SCHEMA_VERSION,
    seed,
    rulesConfig: { drawMode: 'draw_floor', drawPerTurn: 2, freeKeepCount: 0, shieldActiveMultiplier: 0.75, shieldBrokenMultiplier: 1.5, shieldBreakPush: 1, initialCountdown: 4, maxHandSize: 12, ...rulesConfig },
    player: {
      deck,
      stats: { attack: 100, damageBonus: 0, critRate: 0, critDamage: 1.5, ...stats },
      drawTarget, hearts: 3, maxHearts: 3, buffs, allies, gearTraits: [],
      gemLevels: { red: { level: 1, exp: 0 }, green: { level: 1, exp: 0 }, blue: { level: 1, exp: 0 } },
    },
    monsters,
  });
}
const summary = (res) => res.events.find((e) => e.type === BATTLE_EVENT_TYPES.CHAIN_SUMMARY).payload;
const queueColors = (b, colors) => {
  for (const c of colors) {
    const card = b.getSnapshot().hand.find((h) => h.color === c);
    assert.ok(card, `手里要有一张 ${c}`);
    b.queueCard(card.uid);
  }
};

test('摸牌默认上限 N + 1：一张不打下回合 5 张，再不打还是 5 张', () => {
  const deck = Array.from({ length: 40 }, (_, i) => g(`r${i}`, 'red'));
  const b = battle({ deck, drawTarget: 4, monsters: [mon('m1', [bar(9999999)])] });
  const play = (n) => { b.getSnapshot().hand.slice(0, n).forEach((c) => b.queueCard(c.uid)); return b.commitChain().snapshot.hand.length; };
  assert.equal(b.getSnapshot().hand.length, 4);
  assert.equal(play(0), 5, '留 4 张：摸 1 张就到上限 N + 1');
  assert.equal(play(0), 5, '再不打：到上限了');
  assert.equal(play(2), 5, '打 2 留 3：摸 2');
  assert.equal(play(4), 4, '打 4 留 1：摸 2 只有 3，补到 N');
});

test('加成「合白 2 次，下回合多 1 张」：一条链合白 1 次不给，2 次给（下回合到 N + 1）', () => {
  const deck = Array.from({ length: 30 }, (_, i) => g(`c${i}`, i % 2 ? 'cyan' : 'red'));
  const run = (buffs, colors) => {
    const b = battle({ deck: deck.map((c) => ({ ...c })), drawTarget: 6, buffs, monsters: [mon('m1', [bar(9999999)])] });
    queueColors(b, colors);
    return b.commitChain().snapshot.hand.length;
  };
  const buff = [rule(RULE_KEYS.complementBonusDraw)];
  // 红 → 青 → 红：合白 2 次，留 3 张
  assert.equal(run([], ['red', 'cyan', 'red']), 6, '不带：留 3 摸 2 到 5，补到 N = 6');
  assert.equal(run(buff, ['red', 'cyan', 'red']), 7, '带上、合白 2 次：补到 N + 1 = 7');
  // 红 → 青：合白 1 次，留 4 张
  assert.equal(run(buff, ['red', 'cyan']), 6, '合白 1 次不给');
});

test('白牌把一条血打空，不顺手削下一条的新盾（5.5）', () => {
  const b = battle({
    deck: [g('w', 'white')],
    drawTarget: 1,
    monsters: [mon('m1', [bar(50, [{ color: 'red', max: 3 }]), bar(9999999, [{ color: 'red', max: 3 }])])],
  });
  b.queueCard('w');
  const res = b.commitChain();
  const m = res.snapshot.monsters[0];
  assert.equal(m.barIndex, 1, '第 1 条打空了');
  assert.deepEqual(m.shields.map((s) => s.current), [3], '第 2 条的新盾一格没少');
});

/** 同一手牌：预览说的总伤害 = 打出去以后链的总伤害（暴击率 0，没有随机） */
function assertPreviewMatches(b, label) {
  const p = b.getPreview();
  assert.ok(validateBattlePreview(p).ok, `${label}：预览要合约定`);
  const res = b.commitChain();
  const s = summary(res);
  // 链打完那一刻以前，怪真正掉的血（牌打的、合白、彩虹、破盾时补的都算）
  const upTo = res.events.findIndex((e) => e.type === BATTLE_EVENT_TYPES.CHAIN_SUMMARY);
  const dealt = res.events.slice(0, upTo).filter((e) => e.type === BATTLE_EVENT_TYPES.DAMAGE_PACKET).reduce((t, e) => t + e.payload.damage, 0);
  assert.equal(s.totalDamage, dealt, `${label}：链打完那行字 = 怪真正掉的血`);
  assert.equal(p.estimatedDamage, s.totalDamage, `${label}：预览 ${p.estimatedDamage}，打出去 ${s.totalDamage}`);
  assert.equal(p.estimatedHits, s.totalHits, `${label}：发数`);
  assert.equal(p.finalMultiplier, s.finalMultiplier, `${label}：链尾倍率`);
  return { p, res };
}

test('预览 = 打出去：破盾时加成补的一轮白、刺客补刀都算进去', () => {
  const b = battle({
    deck: [g('a', 'red'), g('b', 'red'), g('c', 'yellow'), g('d', 'red')],
    buffs: [BREAK_WHITE],
    allies: [ASSASSIN],
    monsters: [mon('m1', [bar(9999999, [{ color: 'red', max: 2 }])]), mon('m2', [bar(9999999)])],
  });
  queueColors(b, ['red', 'red', 'yellow', 'red']);
  const { p, res } = assertPreviewMatches(b, '破盾触发');
  assert.deepEqual(p.expectedBreakUids, ['m1']);
  assert.ok(res.events.some((e) => e.type === BATTLE_EVENT_TYPES.ALLY_ACTION));
});

test('预览 = 打出去：彩虹那两遍每发加成也算', () => {
  const colors = ['red', 'yellow', 'green', 'cyan', 'blue', 'purple', 'red'];
  const b = battle({
    deck: colors.map((c, i) => g(`k${i}`, c)),
    drawTarget: 7,
    buffs: [rule(RULE_KEYS.rainbowHitBonus, 0.2)],
    monsters: [mon('m1', [bar(9999999)])],
  });
  queueColors(b, colors);
  const { p } = assertPreviewMatches(b, '彩虹');
  assert.equal(p.willTriggerRainbow, true);
});

test('预览 = 打出去：「每回合前 12 发不掉血」扣掉了', () => {
  const ignore12 = { id: 'ign', label: '每回合前 12 发不掉血', effects: [{ timing: TIMINGS.PASSIVE, action: ACTIONS.MODIFY_RULE, params: { ruleKey: RULE_KEYS.ignoreFirstHitsPerTurn, value: 12 } }] };
  const b = battle({
    deck: ['red', 'yellow', 'green', 'cyan'].map((c, i) => g(`k${i}`, c)),
    monsters: [mon('m1', [bar(9999999, [], [ignore12])])],
  });
  queueColors(b, ['red', 'yellow', 'green', 'cyan']);
  assertPreviewMatches(b, '前 12 发不掉血');
});

test('预览 = 打出去：链中间打空一条血、换出满盾的新血条', () => {
  const b = battle({
    deck: ['red', 'red', 'red', 'red'].map((c, i) => g(`k${i}`, c)),
    monsters: [mon('m1', [bar(300, [{ color: 'red', max: 1 }]), bar(9999999, [{ color: 'red', max: 4 }])])],
  });
  queueColors(b, ['red', 'red', 'red', 'red']);
  const { p, res } = assertPreviewMatches(b, '换血条');
  const shred = res.events.filter((e) => e.type === BATTLE_EVENT_TYPES.SHIELD_SHRED && e.payload.targetUid === 'm1').reduce((s, e) => s + e.payload.amount, 0);
  assert.equal(p.shieldShred.red, shred, '预览削几格 = 打出去削几格');
});

test('预览不动状态：看多少次预览，打出去的结果都一样', () => {
  const make = () => battle({
    deck: Array.from({ length: 20 }, (_, i) => g(`k${i}`, ['red', 'yellow', 'cyan', 'white'][i % 4])),
    stats: { critRate: 0.4, critDamage: 2 },
    buffs: [BREAK_WHITE],
    allies: [ASSASSIN],
    monsters: [mon('m1', [bar(2000, [{ color: 'red', max: 1 }]), bar(9999999, [{ color: 'green', max: 2 }])]), mon('m2', [bar(800)])],
  });
  const a = make();
  const b = make();
  for (let turn = 0; turn < 3; turn++) {
    for (const x of [a, b]) x.getSnapshot().hand.forEach((c) => x.queueCard(c.uid));
    for (let i = 0; i < 5; i++) b.getPreview();
    const before = JSON.stringify(b.getSnapshot());
    b.getPreview();
    assert.equal(JSON.stringify(b.getSnapshot()), before, '看一次预览，快照不变');
    const ra = a.commitChain();
    const rb = b.commitChain();
    assert.equal(JSON.stringify(rb.events), JSON.stringify(ra.events), `第 ${turn + 1} 回合事件一样`);
    if (ra.result) break;
  }
});
