// 基础界面小件：文字（含自动换行）、纯数字（严禁万/亿缩写）、面板。
// 所有绘制只调用传入的 renderer（modules/render 接口）。

import { UI_THEME } from './theme.js';

/**
 * 纯数字格式化（设计稿第 1 节硬约束：纯数字显示，绝不写「万」「亿」，不输出科学计数法）。
 * @param {number} value 数值
 * @param {object} [options]
 * @param {number} [options.decimals=0] 小数位，默认取整；传 'auto' 保留最多 1 位非零小数（适合 2.5 颗心）
 * @param {string} [options.prefix=''] 前缀（如 '+'、'×'）
 * @param {string} [options.suffix=''] 后缀（如 '%'、' 发'）
 * @returns {string}
 */
export function formatNumber(value, { decimals = 0, prefix = '', suffix = '' } = {}) {
  const num = Number(value);
  if (!Number.isFinite(num)) return `${prefix}0${suffix}`;

  let text;
  if (decimals === 'auto') {
    const rounded = Math.round(num * 10) / 10;
    text = Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
  } else {
    const d = Math.max(0, Math.min(6, Number(decimals) || 0));
    const fixed = num.toFixed(d);
    // 消除 -0
    text = fixed === '-0' || fixed === '-0.0' ? (d === 0 ? '0' : (0).toFixed(d)) : fixed;
  }
  return `${prefix}${text}${suffix}`;
}

const NO_LINE_START_PUNCT = new Set(['，', '。', '；', '：', '、', '！', '？', '）', '》', '」', '』', ',', '.', ';', ':', '!', '?', ')']);

/**
 * 按最大像素宽度把字符串拆成多行（兼容中文无空格断行、显式换行符与基础避头标点）。
 * @param {object} renderer
 * @param {string} content
 * @param {number} maxWidth
 * @param {object} [style]
 * @returns {string[]}
 */
export function wrapText(renderer, content, maxWidth, style = {}) {
  const str = String(content ?? '');
  if (!str) return [''];
  if (!maxWidth || maxWidth <= 0) return str.split('\n');

  const lines = [];
  const paragraphs = str.split('\n');
  for (const para of paragraphs) {
    if (para === '') {
      lines.push('');
      continue;
    }
    let current = '';
    for (const ch of para) {
      const candidate = current + ch;
      if (current.length > 0 && renderer.measureText(candidate, style).width > maxWidth) {
        // 避免常见中文标点落在行首
        if (NO_LINE_START_PUNCT.has(ch) && current.length > 1) {
          const chars = Array.from(current);
          const tail = chars.pop();
          lines.push(chars.join(''));
          current = tail + ch;
        } else {
          lines.push(current);
          current = ch;
        }
      } else {
        current = candidate;
      }
    }
    if (current.length > 0) lines.push(current);
  }
  return lines;
}

/**
 * 绘制单行或多行文字，返回总绘制高度。
 */
export function drawText(renderer, {
  text,
  x,
  y,
  color = UI_THEME.textPrimary,
  size = 15,
  weight = 'normal',
  align = 'left',
  baseline = 'top',
  maxWidth = null,
  lineHeight = null,
  alpha = 1,
}) {
  const fontStyle = { size, weight, font: UI_THEME.font };
  const step = lineHeight ?? Math.round(size * 1.45);
  const lines = maxWidth ? wrapText(renderer, text, maxWidth, fontStyle) : String(text ?? '').split('\n');

  lines.forEach((line, index) => {
    renderer.text({
      text: line,
      x,
      y: y + index * step,
      color,
      size,
      weight,
      align,
      baseline,
      font: UI_THEME.font,
      alpha,
    });
  });

  return { lines, height: lines.length * step };
}

/**
 * 绘制纯数字（支持普通 / 强调 / 暴击三种风格）。
 */
export function drawNumber(renderer, {
  value,
  x,
  y,
  decimals = 0,
  prefix = '',
  suffix = '',
  tone = 'normal',
  size = 20,
  weight = 'bold',
  align = 'left',
  baseline = 'top',
  color = null,
  alpha = 1,
}) {
  const formatted = formatNumber(value, { decimals, prefix, suffix });
  const resolvedColor = color
    || (tone === 'crit'
      ? UI_THEME.numberCrit
      : tone === 'accent'
        ? UI_THEME.numberAccent
        : UI_THEME.numberNormal);

  renderer.text({
    text: formatted,
    x,
    y,
    color: resolvedColor,
    size: tone === 'crit' ? Math.round(size * 1.15) : size,
    weight,
    align,
    baseline,
    font: UI_THEME.font,
    alpha,
  });
  return formatted;
}

/**
 * 绘制面板，返回可供内部排版的 contentRect。
 */
export function drawPanel(renderer, {
  x,
  y,
  w,
  h,
  title = '',
  subtitle = '',
  fill = UI_THEME.panelBg,
  border = UI_THEME.panelBorder,
  headerFill = UI_THEME.panelHeaderBg,
  radius = 10,
  padding = 16,
  lineWidth = 1.5,
}) {
  renderer.rect({ x, y, w, h, fill, stroke: border, lineWidth, radius });

  let contentTop = y + padding;
  if (title) {
    const headerH = 38;
    renderer.rect({ x: x + 1, y: y + 1, w: w - 2, h: headerH, fill: headerFill, radius: Math.max(0, radius - 1) });
    renderer.line({ x1: x + 1, y1: y + headerH, x2: x + w - 1, y2: y + headerH, color: border, lineWidth: 1 });
    renderer.text({
      text: title,
      x: x + padding,
      y: y + headerH / 2,
      color: UI_THEME.textPrimary,
      size: 15,
      weight: 'bold',
      align: 'left',
      baseline: 'middle',
      font: UI_THEME.font,
    });
    if (subtitle) {
      renderer.text({
        text: subtitle,
        x: x + w - padding,
        y: y + headerH / 2,
        color: UI_THEME.textSecondary,
        size: 12,
        align: 'right',
        baseline: 'middle',
        font: UI_THEME.font,
      });
    }
    contentTop = y + headerH + padding;
  }

  return {
    x: x + padding,
    y: contentTop,
    w: Math.max(0, w - padding * 2),
    h: Math.max(0, y + h - contentTop - padding),
  };
}
