import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BASE_GEM_DECK_TOTAL,
  validateBattleStartPacket,
} from '../../shared/index.js';
import {
  ALLY_LIST,
  ALL_CARD_DEFS,
  ALL_ENCOUNTERS,
  BUFF_LIST,
  DECK_LOADOUTS,
  FUNCTION_CARD_LIST,
  CORE_ENCOUNTERS,
  buildDeck,
  createBattlePacket,
  CORE_TRIAL,
  createCoreTrialPacket,
} from '../index.js';

test('固定宝石牌组严格为 29 张，原型功能牌共 8 种且遵守第 3 版无色马上用规则', () => {
  const pureDeck = buildDeck();
  assert.equal(pureDeck.length, BASE_GEM_DECK_TOTAL);
  assert.equal(FUNCTION_CARD_LIST.length, 8);

  for (const card of FUNCTION_CARD_LIST) {
    if (card.color === 'colorless') {
      assert.equal(card.usage, 'instant', `${card.defId} 无色功能牌必须是马上用`);
    } else {
      assert.equal(card.usage, 'chain', `${card.defId} 带色/变色功能牌应排进链`);
    }
  }
});

test('阶段 1 核心 5 种仗与全部 7 种仗拼出的开战包全部通过 shared 契约校验', () => {
  assert.equal(CORE_ENCOUNTERS.length, 5);
  assert.equal(ALL_ENCOUNTERS.length, 7);

  for (const encounter of ALL_ENCOUNTERS) {
    const packet = createBattlePacket({
      encounterId: encounter.id,
      extraCards: DECK_LOADOUTS.all_8_functions.extraCards,
      seed: `test-${encounter.id}`,
    });
    const res = validateBattleStartPacket(packet);
    assert.equal(res.ok, true, `${encounter.id} 开战包校验失败：\n${res.errors.join('\n')}`);
  }
});

test('牌的名字里不写换行符：排版交给画面按宽度换行', () => {
  for (const def of Object.values(ALL_CARD_DEFS)) {
    assert.doesNotMatch(def.label, /\n/, `${def.defId} 的名字里有换行符`);
  }
});

test('13 个加成（12 个 + 1 个要解锁）、4 个队友带进开战包：契约校验通过，辅助塞的 3 张牌进了牌组', () => {
  assert.equal(BUFF_LIST.length, 13);
  assert.equal(BUFF_LIST.filter((b) => !b.locked).length, 12);
  assert.equal(ALLY_LIST.length, 4);
  const plain = createBattlePacket({ encounterId: 'dual_shield', seed: 't' });
  const packet = createBattlePacket({
    encounterId: 'dual_shield',
    seed: 't',
    buffs: BUFF_LIST.map((b) => b.id),
    allies: ALLY_LIST.map((a) => a.id),
  });
  const res = validateBattleStartPacket(packet);
  assert.equal(res.ok, true, res.errors.join('\n'));
  assert.equal(packet.player.buffs.length, 13);
  assert.equal(packet.player.allies.length, 4);
  assert.equal(packet.player.deck.length, plain.player.deck.length + 3);
  // 改开战包里的不会改到原始数据
  packet.player.buffs[0].effects[0].params.target = 'x';
  assert.notEqual(BUFF_LIST[0].effects[0].params.target, 'x');
  assert.throws(() => createBattlePacket({ encounterId: 'dual_shield', buffs: ['nope'] }), /未知的加成/);
});

test('「改规则」用到的名字都在 shared 的 RULE_KEYS 里（写错名字会悄悄不生效）', async () => {
  const C = await import('../index.js');
  const { ACTIONS, RULE_KEY_LIST } = await import('../../shared/index.js');
  const effects = [
    ...C.BUFF_LIST.flatMap((b) => b.effects || []),
    ...Object.values(C.GEAR_DEFS).flatMap((g) => g.traits?.flatMap((t) => t.effects || []) || g.effects || []),
    ...Object.values(C.ENCOUNTERS).flatMap((e) => e.monsters.flatMap((m) => m.bars.flatMap((b) => b.traits.flatMap((t) => t.effects || [])))),
  ].filter((ef) => ef.action === ACTIONS.MODIFY_RULE);
  assert.ok(effects.length >= 12);
  for (const ef of effects) assert.ok(RULE_KEY_LIST.includes(ef.params.ruleKey), `没登记的规则名：${ef.params.ruleKey}`);
});

test('核心试玩 10 只：只有 29 张宝石牌、不带加成队友，心接上一只剩的，血照倍数改，开战包都过契约', () => {
  assert.equal(CORE_TRIAL.fights.length, 10);
  CORE_TRIAL.fights.forEach((f, i) => {
    const packet = createCoreTrialPacket({ index: i, hearts: 1.5, seed: 'test-core' });
    const res = validateBattleStartPacket(packet);
    assert.equal(res.ok, true, `第 ${i + 1} 只开战包校验失败：\n${res.errors.join('\n')}`);
    assert.equal(packet.player.deck.length, BASE_GEM_DECK_TOTAL);
    assert.ok(packet.player.deck.every((c) => c.kind === 'gem'));
    assert.equal(packet.player.buffs.length, 0);
    assert.equal(packet.player.allies.length, 0);
    assert.equal(packet.player.hearts, 1.5);
    const base = createBattlePacket({ encounterId: f.encounterId, presetId: CORE_TRIAL.presetId, seed: 'x' });
    assert.equal(packet.monsters[0].bars[0].maxHp, Math.round((base.monsters[0].bars[0].maxHp * f.hpScale) / 100) * 100);
  });
  assert.throws(() => createCoreTrialPacket({ index: 10 }));
});

test('核心试玩：宝石等级接上一只打完的（一趟里一直带着），不给就是三色 1 级', () => {
  const fresh = createCoreTrialPacket({ index: 0, seed: 'lv' });
  for (const c of ['red', 'green', 'blue']) assert.deepEqual(fresh.player.gemLevels[c], { level: 1, exp: 0 });
  const carried = { red: { level: 3, exp: 7 }, green: { level: 1, exp: 4 }, blue: { level: 2, exp: 0 } };
  const next = createCoreTrialPacket({ index: 3, gemLevels: carried, seed: 'lv' });
  assert.deepEqual(next.player.gemLevels, carried);
  assert.notEqual(next.player.gemLevels.red, carried.red, '要复制一份，不能跟上一只共用');
  assert.equal(validateBattleStartPacket(next).ok, true);
});
