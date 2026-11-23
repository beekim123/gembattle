// 提示框小件：自动防出画布边界的布局计算 + 绘制。

import { UI_THEME } from './theme.js';
import { wrapText } from './primitives.js';

/**
 * 计算提示框的位置与尺寸，保证不超出视口四边。
 * 纯计算函数，方便在 Node 中做边界单测。
 */
export function layoutTooltip(renderer, tip, viewport) {
  const padding = 12;
  const maxWidth = tip.maxWidth ?? 260;
  const innerMaxW = maxWidth - padding * 2;
  const titleSize = 14;
  const bodySize = 12;
  const bodyLineHeight = 18;
  const margin = 10;
  const offsetX = 14;
  const offsetY = 14;

  const titleText = tip.title ? String(tip.title) : '';
  const rawLines = Array.isArray(tip.lines) ? tip.lines : (tip.text ? [tip.text] : []);
  const wrappedLines = [];
  for (const line of rawLines) {
    wrappedLines.push(...wrapText(renderer, line, innerMaxW, { size: bodySize, font: UI_THEME.font }));
  }

  let contentW = 0;
  if (titleText) {
    contentW = Math.max(contentW, renderer.measureText(titleText, { size: titleSize, weight: 'bold', font: UI_THEME.font }).width);
  }
  for (const line of wrappedLines) {
    contentW = Math.max(contentW, renderer.measureText(line, { size: bodySize, font: UI_THEME.font }).width);
  }
  if (tip.tag) {
    contentW = Math.max(contentW, renderer.measureText(String(tip.tag), { size: 11, weight: 'bold', font: UI_THEME.font }).width + 16);
  }

  const w = Math.min(maxWidth, Math.max(120, Math.ceil(contentW) + padding * 2));
  let h = padding * 2;
  if (titleText) h += 20;
  if (titleText && wrappedLines.length > 0) h += 6;
  h += wrappedLines.length * bodyLineHeight;
  if (tip.tag) h += 22;

  const vw = viewport?.width ?? 960;
  const vh = viewport?.height ?? 540;

  let x = (tip.x ?? 0) + offsetX;
  let y = (tip.y ?? 0) + offsetY;

  // 超出右边界时翻转到锚点左侧，再钳位在视口内
  if (x + w + margin > vw) {
    x = (tip.x ?? 0) - w - offsetX;
  }
  x = Math.max(margin, Math.min(x, vw - w - margin));

  // 超出下边界时翻转到锚点上方，再钳位在视口内
  if (y + h + margin > vh) {
    y = (tip.y ?? 0) - h - offsetY;
  }
  y = Math.max(margin, Math.min(y, vh - h - margin));

  return {
    x,
    y,
    w,
    h,
    padding,
    titleText,
    titleSize,
    bodySize,
    bodyLineHeight,
    wrappedLines,
    tag: tip.tag ? String(tip.tag) : '',
    accentColor: tip.accentColor || UI_THEME.tooltipBorder,
  };
}

/**
 * 绘制提示框。
 */
export function drawTooltip(renderer, tip, viewport) {
  if (!tip) return null;
  const box = layoutTooltip(renderer, tip, viewport || renderer.getSize());

  renderer.rect({
    x: box.x,
    y: box.y,
    w: box.w,
    h: box.h,
    fill: UI_THEME.tooltipBg,
    stroke: box.accentColor,
    lineWidth: 1.5,
    radius: 7,
  });

  // 左侧色条强调
  renderer.rect({
    x: box.x + 1,
    y: box.y + 6,
    w: 3,
    h: Math.max(8, box.h - 12),
    fill: box.accentColor,
    radius: 2,
  });

  let cursorY = box.y + box.padding;
  const textX = box.x + box.padding + 4;

  if (box.titleText) {
    renderer.text({
      text: box.titleText,
      x: textX,
      y: cursorY,
      color: UI_THEME.textPrimary,
      size: box.titleSize,
      weight: 'bold',
      font: UI_THEME.font,
    });
    cursorY += 20 + (box.wrappedLines.length > 0 ? 6 : 0);
  }

  for (const line of box.wrappedLines) {
    renderer.text({
      text: line,
      x: textX,
      y: cursorY,
      color: UI_THEME.textSecondary,
      size: box.bodySize,
      font: UI_THEME.font,
    });
    cursorY += box.bodyLineHeight;
  }

  if (box.tag) {
    const tagY = cursorY + 4;
    const tagW = renderer.measureText(box.tag, { size: 11, weight: 'bold', font: UI_THEME.font }).width + 12;
    renderer.rect({
      x: textX,
      y: tagY,
      w: tagW,
      h: 18,
      fill: '#232938',
      stroke: box.accentColor,
      lineWidth: 1,
      radius: 4,
    });
    renderer.text({
      text: box.tag,
      x: textX + 6,
      y: tagY + 9,
      color: UI_THEME.textPrimary,
      size: 11,
      weight: 'bold',
      baseline: 'middle',
      font: UI_THEME.font,
    });
  }

  return box;
}
