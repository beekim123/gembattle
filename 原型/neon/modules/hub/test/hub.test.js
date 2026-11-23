import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../../render/index.js';
import { createHubView } from '../index.js';

test('大厅：画出入口和记号，点入口交回 id，点 × 交回 null', () => {
  const picks = [];
  const v = createHubView({ entries: [{ id: 'depart', label: '出发' }, { id: 'guild', label: '工会' }], callbacks: { onSelect: (id) => picks.push(id) } });
  v.setState({ gold: 50, rank: 'C', badges: { guild: 2 } });
  const texts = [];
  const ctx = { globalAlpha: 1, setTransform() {}, translate() {}, rotate() {}, scale() {}, clip() {}, setLineDash() {}, clearRect() {}, save() {}, restore() {}, fillRect() {}, beginPath() {}, closePath() {}, rect() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {}, fill() {}, stroke() {}, fillText(s) { texts.push(s); }, measureText: (s) => ({ width: String(s).length * 9 }) };
  v.render(createRenderer(ctx, { width: 960, height: 540 }));
  assert.ok(texts.includes('工会') && texts.includes('2'));
  const g = v.getBoxes().find((b) => b.id === 'guild');
  v.onPointer({ type: 'up', x: g.x + 4, y: g.y + 4 });
  v.setState({ active: 'guild' });
  v.onPointer({ type: 'up', x: 392 + 544 - 25, y: 26 + 25 });
  assert.deepEqual(picks, ['guild', null]);
});
