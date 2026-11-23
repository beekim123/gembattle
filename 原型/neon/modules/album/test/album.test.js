import test from 'node:test';
import assert from 'node:assert/strict';
import { albumEntries } from '../index.js';

const DATA = {
  cards: [{ id: 'g', label: '红宝石', kind: 'gem', color: 'red', gems: ['red'] }],
  buffs: [{ id: 'b1', label: '一', lane: 'break' }, { id: 'b2', label: '二', lane: 'rainbow', locked: true }],
  allies: [{ id: 'a', label: '补刀', roleTag: '刺', unlockRank: 'C' }, { id: 'w', label: '削盾', roleTag: '战', unlockRank: 'B' }],
  monsters: [{ defId: 'm1', label: '双色盾', info: '1 条血' }, { defId: 'm2', label: '看门的', info: '3 条血' }],
  gear: [{ id: 'f', label: '基础', grade: 'free' }, { id: 'wb', label: 'B 武器', grade: 'B', price: 300, uses: 7 }],
};

test('卡册：要解锁的加成、B 级队友、没碰到的怪是暗的；碰到了就亮', () => {
  const save = { rank: 'C', unlocks: { buffs: [] }, album: { monsters: ['m1'], loot: [] } };
  const e = albumEntries(save, DATA);
  assert.deepEqual(e.buffs.map((x) => x.open), [true, false]);
  assert.deepEqual(e.allies.map((x) => x.open), [true, false]);
  assert.deepEqual(e.monsters.map((x) => x.open), [true, false]);
  assert.equal(e.monsters[1].label, '？');
  assert.deepEqual(e.gear.map((x) => x.open), [true, false]);
  const e2 = albumEntries({ ...save, rank: 'B', unlocks: { buffs: ['b2'] } }, DATA);
  assert.equal(e2.buffs[1].open, true);
  assert.equal(e2.allies[1].open, true);
});
