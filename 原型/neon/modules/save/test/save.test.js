import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSave, createSaveStore, migrateSave } from '../index.js';

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };

test('新档、写进去再读出来一样', () => {
  const st = memory();
  const a = createSaveStore(st);
  assert.equal(a.load().gold, 120);
  a.apply((s) => ({ ...s, gold: s.gold + 30 }));
  const b = createSaveStore(st);
  assert.equal(b.load().gold, 150);
});

test('旧存档缺字段会补上；坏掉的存档当新档', () => {
  const s = migrateSave({ gold: 5, gear: { owned: [{ id: 'x', wear: 2 }] } });
  assert.equal(s.gold, 5);
  assert.deepEqual(s.gear.equipped, createDefaultSave().gear.equipped);
  const st = memory();
  st.setItem('code00.save', '{坏了');
  assert.equal(createSaveStore(st).load().gold, 120);
});

test('get 给的是拷贝，改了不会改到存档', () => {
  const a = createSaveStore(memory());
  a.load();
  const s = a.get();
  s.gold = 999;
  assert.equal(a.get().gold, 120);
});
