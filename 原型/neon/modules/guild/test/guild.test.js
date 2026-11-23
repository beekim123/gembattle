import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../../render/index.js';
import { buyGear, createGuildView, refreshBoard, submitAll, submitQuest, takeQuest } from '../index.js';
import { FAKE_GUILD_CONTENT as C, fakeSave } from './fake.js';

test('任务板：能接到高一级的；最多接 3 个；接了就从板上拿掉', () => {
  let s = refreshBoard(fakeSave(), C);
  assert.deepEqual(s.quests.board, ['q1', 'q2', 'q3', 'qb']);
  for (const id of ['q1', 'q2', 'q3']) s = takeQuest(s, id, C).save;
  const out = takeQuest(s, 'qb', C);
  assert.equal(out.ok, false);
  assert.equal(refreshBoard(s, C).quests.board.includes('q1'), false);
});

test('提交拿金币、算进升级；做够 3 个出升级任务，交了升 B 级', () => {
  let s = fakeSave({ quests: { board: [], taken: [{ id: 'q1', progress: 3, done: true }, { id: 'q2', progress: 3, done: true }, { id: 'q3', progress: 2, done: true }], failed: [] } });
  s = submitAll(s, C).save;
  assert.equal(s.gold, 120 + 90 + 80 + 100);
  assert.equal(s.rankDone, 3);
  s = refreshBoard(s, C);
  assert.equal(s.quests.board[0], 'qr');
  s = takeQuest(s, 'qr', C).save;
  s.quests.taken[0].done = true;
  s = submitQuest(s, 'qr', C).save;
  assert.equal(s.rank, 'B');
});

test('隐藏任务交了解锁加成；买装备扣钱、空着就穿上、钱不够买不了', () => {
  let s = fakeSave({ quests: { board: [], taken: [{ id: 'qh', progress: 1, done: true, hidden: true }], failed: [] } });
  s = submitQuest(s, 'qh', C).save;
  assert.deepEqual(s.unlocks.buffs, ['buff_x']);
  s = buyGear(s, 'w1', C).save;
  assert.equal(s.gold, 120 + 150 - 85);
  assert.equal(s.gear.equipped.weapon, 'w1');
  assert.equal(buyGear(s, 'wb', C).ok, false, 'C 级买不了 B 级');
});

test('工会的板画得出来，点「接」交回任务 id', () => {
  const taken = [];
  const v = createGuildView({ callbacks: { onTake: (id) => taken.push(id) } });
  v.setState({ save: refreshBoard(fakeSave(), C), content: C });
  const texts = [];
  const ctx = { globalAlpha: 1, setTransform() {}, translate() {}, rotate() {}, scale() {}, clip() {}, setLineDash() {}, clearRect() {}, save() {}, restore() {}, fillRect() {}, beginPath() {}, closePath() {}, rect() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {}, fill() {}, stroke() {}, fillText(s) { texts.push(s); }, measureText: (s) => ({ width: String(s).length * 9 }) };
  const r = createRenderer(ctx, { width: 960, height: 540 });
  v.render(r, { x: 392, y: 26, w: 544, h: 488 });
  assert.ok(texts.includes('工会') && texts.includes('第 1 层采 3 个'));
  const b = v.getBoxes().find((x) => x.id === 'take-q1');
  v.onPointer({ type: 'up', x: b.x + 2, y: b.y + 2 });
  assert.deepEqual(taken, ['q1']);
});
