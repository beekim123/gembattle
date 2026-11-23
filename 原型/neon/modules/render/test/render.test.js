import test from 'node:test';
import assert from 'node:assert/strict';

import { RENDER_BACKEND, createBlockRenderer, createRenderer } from '../index.js';

function makeMinimalCtx() {
  let fillCount = 0;
  return {
    globalAlpha: 1,
    setTransform() {},
    save() {},
    restore() {},
    fillRect() { fillCount++; },
    beginPath() {},
    closePath() {},
    rect() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arc() {},
    fill() { fillCount++; },
    stroke() {},
    fillText() {},
    measureText: (s) => ({ width: String(s).length * 8 }),
    get fillCount() { return fillCount; },
  };
}

test('modules/render 顶层入口导出统一 createRenderer 并默认指向 blocks 后端', () => {
  assert.equal(RENDER_BACKEND, 'blocks');
  assert.equal(createRenderer, createBlockRenderer);

  const ctx = makeMinimalCtx();
  const r = createRenderer(ctx, { width: 960, height: 540 });
  assert.equal(r.backend, 'blocks');
  assert.deepEqual(r.getSize(), { width: 960, height: 540 });

  r.clear('#000000');
  r.rect({ x: 10, y: 10, w: 50, h: 30, fill: '#ffffff' });
  assert.ok(ctx.fillCount >= 2);
});
