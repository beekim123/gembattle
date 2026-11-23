import test from 'node:test';
import assert from 'node:assert/strict';
import { hireAlly, refundAlly, availableAllies } from '../index.js';

const ALLIES = {
  a: { id: 'a', role: 'assassin', roleTag: '刺', label: '补刀', description: '刺客：…', hireCost: 30, unlockRank: 'C', explore: { label: '标出藏着的' } },
  b: { id: 'b', role: 'support', roleTag: '辅', label: '塞牌', description: '辅助：…', hireCost: 25, unlockRank: 'C' },
  w: { id: 'w', role: 'warrior', roleTag: '战', label: '削盾', description: '战士：…', hireCost: 35, unlockRank: 'B' },
};
const save = (over = {}) => ({ gold: 100, rank: 'C', hired: [], ...over });

test('C 级 1 个席位；雇了扣钱，退了全退', () => {
  let s = hireAlly(save(), 'a', ALLIES).save;
  assert.equal(s.gold, 70);
  assert.equal(hireAlly(s, 'b', ALLIES).ok, false);
  s = refundAlly(s, 'a', ALLIES).save;
  assert.equal(s.gold, 100);
  assert.deepEqual(s.hired, []);
});

test('战士要 B 级；B 级 2 个席位', () => {
  assert.equal(availableAllies(save(), ALLIES).some((x) => x.id === 'w'), false);
  let s = save({ rank: 'B' });
  s = hireAlly(s, 'w', ALLIES).save;
  s = hireAlly(s, 'a', ALLIES).save;
  assert.deepEqual(s.hired, ['w', 'a']);
});
