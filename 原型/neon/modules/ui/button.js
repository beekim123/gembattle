// 按钮小件：数据结构、命中判定与渲染（只调 renderer 接口）。

import { UI_THEME } from './theme.js';

/**
 * 判断点 (px, py) 是否落在矩形内。
 */
export function hitTestRect(rect, px, py) {
  if (!rect || typeof px !== 'number' || typeof py !== 'number') return false;
  return px >= rect.x && px <= rect.x + rect.w && py >= rect.y && py <= rect.y + rect.h;
}

/**
 * 创建标准按钮定义对象。
 */
export function createButton({
  id,
  label,
  x,
  y,
  w = 160,
  h = 44,
  variant = 'default',
  disabled = false,
  tooltip = null,
  onClick = null,
  radius = 8,
  fontSize = 16,
}) {
  if (!id || typeof id !== 'string') {
    throw new TypeError('按钮需要非空字符串 id');
  }
  return {
    id,
    label: String(label ?? ''),
    x,
    y,
    w,
    h,
    variant,
    disabled: Boolean(disabled),
    tooltip,
    onClick,
    radius,
    fontSize,
  };
}

/**
 * 绘制按钮。
 * @param {object} renderer
 * @param {object} button
 * @param {'normal'|'hover'|'pressed'|'disabled'} [state='normal']
 */
export function drawButton(renderer, button, state = 'normal') {
  const effectiveState = button.disabled ? 'disabled' : state;
  const palette = effectiveState === 'disabled'
    ? UI_THEME.buttons.disabled
    : (UI_THEME.buttons[button.variant] || UI_THEME.buttons.default);

  let fill = palette.fill;
  if (effectiveState === 'hover') fill = palette.hoverFill || palette.fill;
  if (effectiveState === 'pressed') fill = palette.pressedFill || palette.fill;

  const yOffset = effectiveState === 'pressed' ? 1 : 0;

  renderer.rect({
    x: button.x,
    y: button.y + yOffset,
    w: button.w,
    h: button.h,
    fill,
    stroke: palette.border,
    lineWidth: effectiveState === 'hover' ? 2 : 1.5,
    radius: button.radius ?? 8,
  });

  renderer.text({
    text: button.label,
    x: button.x + button.w / 2,
    y: button.y + yOffset + button.h / 2,
    color: palette.text,
    size: button.fontSize ?? 16,
    weight: 'bold',
    align: 'center',
    baseline: 'middle',
    maxWidth: Math.max(16, button.w - 16),
    font: UI_THEME.font,
  });
}
