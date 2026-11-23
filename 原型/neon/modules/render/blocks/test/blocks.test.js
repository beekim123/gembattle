import test from 'node:test';
import assert from 'node:assert/strict';

import { RENDER_BACKEND, createBlockRenderer } from '../index.js';

function createFakeContext() {
  const ops = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    setTransform: (...args) => ops.push(['setTransform', ...args]),
    save: () => ops.push(['save']),
    restore: () => ops.push(['restore']),
    fillRect: (...args) => ops.push(['fillRect', ...args]),
    clearRect: (...args) => ops.push(['clearRect', ...args]),
    beginPath: () => ops.push(['beginPath']),
    closePath: () => ops.push(['closePath']),
    rect: (...args) => ops.push(['rect', ...args]),
    moveTo: (...args) => ops.push(['moveTo', ...args]),
    lineTo: (...args) => ops.push(['lineTo', ...args]),
    quadraticCurveTo: (...args) => ops.push(['quadraticCurveTo', ...args]),
    arc: (...args) => ops.push(['arc', ...args]),
    fill: () => ops.push(['fill', ctx.fillStyle]),
    stroke: () => ops.push(['stroke', ctx.strokeStyle, ctx.lineWidth]),
    setLineDash: (d) => ops.push(['setLineDash', d]),
    fillText: (...args) => ops.push(['fillText', ...args]),
    measureText: (s) => ({ width: String(s).length * 10 }),
    clip: () => ops.push(['clip']),
    translate: (...args) => ops.push(['translate', ...args]),
  };
  return { ctx, ops };
}

test('createBlockRenderer 支持基本图元、清屏、文字、裁剪、平移与实体色块占位', () => {
  const { ctx, ops } = createFakeContext();
  const fakeCanvas = { width: 0, height: 0, getContext: () => ctx };
  const renderer = createBlockRenderer(fakeCanvas, { width: 800, height: 450, dpr: 2 });

  assert.equal(renderer.backend, RENDER_BACKEND);
  assert.deepEqual(renderer.getSize(), { width: 800, height: 450 });
  assert.equal(fakeCanvas.width, 1600);
  assert.equal(fakeCanvas.height, 900);

  renderer.clear('#111218');
  renderer.rect({ x: 10, y: 20, w: 120, h: 60, fill: '#e05252', stroke: '#ffffff', lineWidth: 2, radius: 8 });
  renderer.circle({ x: 200, y: 100, r: 24, fill: '#46b868' });
  renderer.line({ x1: 0, y1: 0, x2: 100, y2: 50, color: '#4a88e8', lineWidth: 3, dash: [4, 2] });
  renderer.polygon({ points: [{ x: 0, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 30 }], fill: '#e6c347' });
  renderer.text({ text: '52381', x: 50, y: 50, size: 20, weight: 'bold' });
  renderer.spriteSlot({ x: 300, y: 100, w: 140, h: 90, label: '双色盾怪', sublabel: '示意色块', badge: '普通' });

  renderer.clipRect({ x: 0, y: 0, w: 100, h: 100 }, () => {
    renderer.withAlpha(0.5, () => {
      renderer.group(12, 18, () => {
        renderer.rect({ x: 0, y: 0, w: 20, h: 20, fill: '#ffffff' });
      });
    });
  });

  assert.equal(renderer.measureText('测试文本').width, 40);
  assert.ok(ops.some((o) => o[0] === 'fillRect' && o[3] === 800 && o[4] === 450));
  assert.ok(ops.some((o) => o[0] === 'quadraticCurveTo'));
  assert.ok(ops.some((o) => o[0] === 'arc' && o[3] === 24));
  assert.ok(ops.some((o) => o[0] === 'setLineDash'));
  assert.ok(ops.some((o) => o[0] === 'fillText' && o[1] === '52381'));
  assert.ok(ops.some((o) => o[0] === 'clip'));
  assert.ok(ops.some((o) => o[0] === 'translate' && o[1] === 12 && o[2] === 18));

  // save / restore 严格配对
  const saves = ops.filter((o) => o[0] === 'save').length;
  const restores = ops.filter((o) => o[0] === 'restore').length;
  assert.equal(saves, restores);
});

test('resize 更新逻辑尺寸与物理画布，非法入参抛出错误', () => {
  const { ctx } = createFakeContext();
  const fakeCanvas = { width: 0, height: 0, getContext: () => ctx };
  const renderer = createBlockRenderer(fakeCanvas, { width: 400, height: 300, dpr: 1 });

  renderer.resize(640, 360, 1.5);
  assert.deepEqual(renderer.getSize(), { width: 640, height: 360 });
  assert.equal(fakeCanvas.width, 960);
  assert.equal(fakeCanvas.height, 540);

  assert.throws(() => renderer.resize(0, 300), RangeError);
  assert.throws(() => renderer.resize(400, -10), RangeError);
  assert.throws(() => createBlockRenderer(null), TypeError);
});
