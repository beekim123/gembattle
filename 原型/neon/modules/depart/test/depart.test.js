import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDepartPacket, cycleGear, slotOptions } from '../index.js';

const GEAR = { w1: { id: 'w1', slot: 'weapon', label: '武器一' }, w2: { id: 'w2', slot: 'weapon', label: '武器二' }, a1: { id: 'a1', slot: 'armor', label: '护身' } };
const save = () => ({ gold: 0, rank: 'C', hired: ['ally_x'], quests: { taken: [{ id: 'q1', progress: 1, done: false }, { id: 'q2', progress: 2, done: true }] }, gear: { owned: [{ id: 'w1', wear: 3 }, { id: 'w2', wear: 7 }], equipped: { weapon: 'w1', armor: null, trinket: null } } });

test('◀ ▶ 在空着和自己有的装备之间换', () => {
  assert.deepEqual(slotOptions(save(), 'weapon', GEAR), [null, 'w1', 'w2']);
  let s = cycleGear(save(), 'weapon', 1, GEAR).save;
  assert.equal(s.gear.equipped.weapon, 'w2');
  s = cycleGear(s, 'weapon', 1, GEAR).save;
  assert.equal(s.gear.equipped.weapon, null);
  assert.equal(cycleGear(save(), 'armor', 1, GEAR).save.gear.equipped.armor, null, '没有护身，只能空着');
});

test('出发包：带上没做完的任务和以前的进度、雇的队友、算好的属性', () => {
  const pk = buildDepartPacket(save(), {
    loadout: { stats: { attack: 80, damageBonus: 0, critRate: 0.1, critDamage: 1.5 }, hearts: 3, maxHearts: 3, drawTarget: 4, gearTraits: [] },
    quests: { q1: { id: 'q1', kind: 'hunt', count: 3, label: 'x' }, q2: { id: 'q2', kind: 'hunt', count: 2, label: 'y' } },
    seed: 's',
  });
  assert.equal(pk.quests.length, 1);
  assert.equal(pk.quests[0].savedProgress, 1);
  assert.deepEqual(pk.player.allies, ['ally_x']);
  assert.equal(pk.player.stats.attack, 80);
});
