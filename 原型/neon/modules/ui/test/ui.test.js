import test from 'node:test';
import assert from 'node:assert/strict';

import { createRenderer } from '../../render/index.js';
import {
  createButton,
  createUiLayer,
  drawNumber,
  drawPanel,
  drawText,
  drawTooltip,
  formatNumber,
  hitTestRect,
  layoutTooltip,
  wrapText,
} from '../index.js';

function makeRecordingRenderer(width = 960, height = 540) {
  const texts = [];
  const rects = [];
  const ctx = {
    globalAlpha: 1,
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    setTransform() {},
    save() {},
    restore() {},
    fillRect() {},
    beginPath() {},
    closePath() {},
    rect(x, y, w, h) { rects.push({ x, y, w, h }); },
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    arc() {},
    fill() {},
    stroke() {},
    fillText(str, x, y) { texts.push({ str, x, y }); },
    measureText: (s) => ({ width: String(s).length * 10 }),
  };
  const renderer = createRenderer(ctx, { width, height });
  return { renderer, texts, rects };
}

test('formatNumber 强制纯数字显示，不出现万/亿或科学计数法', () => {
  assert.equal(formatNumber(52381), '52381');
  assert.equal(formatNumber(156000), '156000');
  assert.equal(formatNumber(35000000), '35000000');
  assert.equal(formatNumber(2.5, { decimals: 'auto' }), '2.5');
  assert.equal(formatNumber(3.0, { decimals: 'auto' }), '3');
  assert.equal(formatNumber(50, { prefix: '+', suffix: '%' }), '+50%');
  assert.equal(formatNumber(-0), '0');
  assert.doesNotMatch(formatNumber(987654321), /[万亿eE]/);
});

test('wrapText、drawText、drawNumber 与 drawPanel 正常计算并返回布局', () => {
  const { renderer, texts } = makeRecordingRenderer();

  const lines = wrapText(renderer, '一二三四五六七八九十', 45, { size: 14 });
  assert.ok(lines.length >= 2);

  const info = drawText(renderer, { text: '第一行\n第二行', x: 20, y: 20, size: 14 });
  assert.equal(info.lines.length, 2);
  assert.ok(info.height > 0);

  const formatted = drawNumber(renderer, { value: 52381, x: 100, y: 100, tone: 'crit' });
  assert.equal(formatted, '52381');
  assert.ok(texts.some((t) => t.str === '52381'));

  const content = drawPanel(renderer, { x: 40, y: 40, w: 300, h: 200, title: '测试面板', subtitle: '副标题' });
  assert.equal(content.x, 56);
  assert.ok(content.y > 70);
  assert.equal(content.w, 268);
});

test('layoutTooltip 在靠近右下角边界时自动翻转，不溢出画布', () => {
  const { renderer } = makeRecordingRenderer(400, 300);

  const box = layoutTooltip(
    renderer,
    { x: 390, y: 290, title: '提示标题', lines: ['这是一条较长的说明文字用来测试自动折行与防裁切'], tag: '持续：本回合' },
    { width: 400, height: 300 },
  );

  assert.ok(box.x >= 10);
  assert.ok(box.y >= 10);
  assert.ok(box.x + box.w <= 390);
  assert.ok(box.y + box.h <= 290);

  const drawn = drawTooltip(renderer, { x: 390, y: 290, title: '测试', lines: ['内容'] }, { width: 400, height: 300 });
  assert.ok(drawn.w >= 120);
});

test('createUiLayer 正确处理按钮命中、悬停、按下、点击与禁用拦截', () => {
  const { renderer, texts } = makeRecordingRenderer();
  const layer = createUiLayer();
  let clicked = 0;
  let disabledClicked = 0;

  const btnOk = createButton({
    id: 'play',
    label: '试打',
    x: 100,
    y: 100,
    w: 140,
    h: 44,
    variant: 'primary',
    tooltip: { title: '试打入口', lines: ['阶段 1 会接上战斗'] },
    onClick: () => { clicked++; },
  });
  const btnOff = createButton({
    id: 'locked',
    label: '未开放',
    x: 260,
    y: 100,
    w: 140,
    h: 44,
    disabled: true,
    onClick: () => { disabledClicked++; },
  });

  layer.setButtons([btnOk, btnOff]);
  assert.equal(hitTestRect(btnOk, 150, 120), true);
  assert.equal(hitTestRect(btnOk, 50, 120), false);

  // 悬停主按钮 -> 指针变 pointer，并渲染出按钮文字与提示框
  const moveRes = layer.onPointerMove(150, 120);
  assert.equal(moveRes.hoveredId, 'play');
  assert.equal(moveRes.cursor, 'pointer');

  layer.render(renderer);
  assert.ok(texts.some((t) => t.str === '试打'));
  assert.ok(texts.some((t) => t.str === '试打入口'));

  // 按下并移出再抬起，不应触发点击
  layer.onPointerDown(150, 120);
  const cancelRes = layer.onPointerUp(10, 10);
  assert.equal(cancelRes.clickedId, null);
  assert.equal(clicked, 0);

  // 正常按下并抬起，触发点击
  layer.onPointerDown(150, 120);
  const okRes = layer.onPointerUp(150, 120);
  assert.equal(okRes.clickedId, 'play');
  assert.equal(clicked, 1);

  // 点击禁用按钮不触发回调
  layer.onPointerDown(300, 120);
  const offRes = layer.onPointerUp(300, 120);
  assert.equal(offRes.clickedId, null);
  assert.equal(disabledClicked, 0);
});

test('wrapText 不把「+50%」这类数字记号从中间断开', () => {
  const { renderer } = makeRecordingRenderer();
  const lines = wrapText(renderer, '本回合每发 +50%', 60, { size: 14 });
  assert.ok(lines.length >= 2);
  assert.ok(lines.some((l) => l.includes('+50%')), `断行结果：${JSON.stringify(lines)}`);
});
