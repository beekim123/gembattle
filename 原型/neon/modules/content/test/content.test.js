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
  STAGE1_CORE_ENCOUNTERS,
  buildDeck,
  createBattlePacket,
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
  assert.equal(STAGE1_CORE_ENCOUNTERS.length, 5);
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

test('4 个加成、2 个队友带进开战包：契约校验通过，辅助塞的 3 张牌进了牌组', () => {
  assert.equal(BUFF_LIST.length, 4);
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
  assert.equal(packet.player.buffs.length, 4);
  assert.equal(packet.player.allies.length, 4);
  assert.equal(packet.player.deck.length, plain.player.deck.length + 3);
  // 改开战包里的不会改到原始数据
  packet.player.buffs[0].effects[0].params.target = 'x';
  assert.notEqual(BUFF_LIST[0].effects[0].params.target, 'x');
  assert.throws(() => createBattlePacket({ encounterId: 'dual_shield', buffs: ['nope'] }), /未知的加成/);
});
