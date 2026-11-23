import test from 'node:test';
import assert from 'node:assert/strict';

import { createRenderer } from '../../render/index.js';
import { createExploreView } from '../index.js';
import { FAKE_CATALOG, fakeExits, fakeRunState } from './fake.js';

function fakeRenderer() {
  const texts = [];
  const ctx = {
    globalAlpha: 1, setTransform() {}, translate() {}, rotate() {}, scale() {}, clip() {}, setLineDash() {}, clearRect() {}, save() {}, restore() {},
    fillRect() {}, beginPath() {}, closePath() {}, rect() {}, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {}, fill() {}, stroke() {},
    fillText(s) { texts.push(s); }, measureText: (s) => ({ width: String(s).length * 9 }),
  };
  return { r: createRenderer(ctx, { width: 960, height: 540 }), texts };
}

function walkTo(view, x, y, secs = 4) {
  view.onPointer({ type: 'down', x, y });
  view.onPointer({ type: 'up', x, y });
  for (let i = 0; i < secs * 30; i++) view.update(1 / 30);
}

test('点地走过去碰到鬼火：闪一下再开打', () => {
  const calls = [];
  const view = createExploreView({ catalog: FAKE_CATALOG, callbacks: { onFight: () => calls.push('fight') } });
  view.setState(fakeRunState());
  const w = view.getLayout().wisps[0];
  walkTo(view, w.x, w.y);
  assert.deepEqual(calls, ['fight']);
  const { r, texts } = fakeRenderer();
  view.render(r);
  assert.ok(texts.some((t) => t.includes('第 1 层')));
});

test('打完出口亮起来：牌子写奖励、精英、任务记号；走进去就挑这个出口', () => {
  const calls = [];
  const view = createExploreView({ catalog: FAKE_CATALOG, callbacks: { onExit: (id) => calls.push(id) } });
  const s = fakeRunState();
  view.setState(s);
  view.setState({ ...s, clearing: { ...s.clearing, needsFight: false, exits: fakeExits } });
  for (let i = 0; i < 30; i++) view.update(1 / 30);
  const { r, texts } = fakeRenderer();
  view.render(r);
  assert.ok(texts.includes('加成') && texts.includes('歇脚'));
  assert.ok(texts.includes('任'));
  const ex = view.getLayout().exits[1];
  walkTo(view, ex.cx, ex.cy);
  assert.equal(calls[0], 'x-1');
});

test('等着挑的板：加成三选一点一下就挑，点「都不要」交回 null', () => {
  const picks = [];
  const view = createExploreView({ catalog: FAKE_CATALOG, callbacks: { onChoose: (c) => picks.push(c) } });
  view.setState(fakeRunState({ pending: { type: 'pick_buff', options: ['b1', 'b2', 'b3'], source: '出口' } }));
  for (let i = 0; i < 20; i++) view.update(1 / 30);
  const pl = view.getLayout().pending;
  const it = pl.items[1];
  view.onPointer({ type: 'up', x: it.x + 10, y: it.y + 10 });
  const sk = pl.buttons[0];
  view.onPointer({ type: 'up', x: sk.x + 5, y: sk.y + 5 });
  assert.deepEqual(picks, ['b2', null]);
  const { r, texts } = fakeRenderer();
  view.render(r);
  assert.ok(texts.some((t) => t.includes('挑一个加成')));
});

test('藏着的东西：走到跟前就拿', () => {
  let took = 0;
  const view = createExploreView({ catalog: FAKE_CATALOG, callbacks: { onTakeHidden: () => { took++; } } });
  const s = fakeRunState();
  view.setState({ ...s, clearing: { ...s.clearing, needsFight: false, exits: fakeExits } });
  const h = view.getLayout().hidden;
  view.debugPlaceHero(h.x, h.y + 10);
  view.update(1 / 30);
  assert.equal(took, 1);
});
