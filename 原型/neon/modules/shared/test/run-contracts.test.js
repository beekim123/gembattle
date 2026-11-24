// 出发包、回来包、存档的约定（第 3 轮审核 S5：原来只有战斗的四样进了 shared）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_VERSION, validateDepartPacket, validateReturnPacket, validateSaveData } from '../index.js';

const depart = () => ({
  schemaVersion: SCHEMA_VERSION, seed: 's', zoneId: 'forest',
  player: { stats: { attack: 80, damageBonus: 0, critRate: 0.1, critDamage: 1.5 }, drawTarget: 4, hearts: 3, maxHearts: 3, gearTraits: [], extraCards: [], buffs: [], allies: ['ally_tank'] },
  quests: [{ id: 'q1', kind: 'gather', count: 3, savedProgress: 1 }],
  rulesConfig: {},
});
const ret = () => ({
  schemaVersion: SCHEMA_VERSION, outcome: 'returned', gold: 40, goldDetail: { safe: 10, risky: 30 },
  quests: [{ id: 'q1', hidden: false, progress: 3, done: true, failed: false }],
  encountered: ['monster_dual_shield'], loot: [], stats: { fights: 2 },
});
const save = () => ({
  saveVersion: 1, gold: 120, rank: 'C', rankDone: 0,
  quests: { board: ['q1'], taken: [{ id: 'q2', progress: 1, done: false }], failed: [] },
  gear: { owned: [{ id: 'gear_c_weapon_1', wear: 7 }], equipped: { weapon: 'gear_c_weapon_1', armor: null, trinket: null } },
  unlocks: { buffs: [] }, hired: [], album: { monsters: [], loot: [] }, runs: 0, lastRun: null, run: null,
});

test('出发包：合约定的过；心比上限多、任务没有 count、队友不是 id 的都报', () => {
  assert.deepEqual(validateDepartPacket(depart()), { ok: true, errors: [] });
  const bad = depart();
  bad.player.hearts = 4;
  bad.quests[0].count = 0;
  bad.player.allies = [{ id: 'x' }];
  const r = validateDepartPacket(bad);
  assert.equal(r.ok, false);
  assert.equal(r.errors.length, 3, r.errors.join('\n'));
});

test('回来包：合约定的过；outcome 拼错、金币是小数都报', () => {
  assert.equal(validateReturnPacket(ret()).ok, true);
  const bad = { ...ret(), outcome: 'died', gold: 1.5 };
  assert.equal(validateReturnPacket(bad).errors.length, 2);
});

test('存档：合约定的过；等级拼错、装备格子写错都报', () => {
  assert.equal(validateSaveData(save()).ok, true);
  const bad = save();
  bad.rank = 'D';
  bad.gear.equipped.weapon = 3;
  assert.equal(validateSaveData(bad).errors.length, 2);
});
