// 色块渲染后端（Canvas 2D）。
// 不直接引用全局 document / window，既可在浏览器跑，也可在 Node 单测中注入假 2D 上下文验证。

export const RENDER_BACKEND = 'blocks';
export const DEFAULT_FONT_FAMILY = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';

function buildFontString({ size = 16, weight = 'normal', font = DEFAULT_FONT_FAMILY } = {}) {
  return `${weight} ${size}px ${font}`;
}

function traceRoundedRect(ctx, x, y, w, h, radius) {
  const r = Math.max(0, Math.min(radius, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  if (r === 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function resolveTarget(target, options) {
  if (!target || typeof target !== 'object') {
    throw new TypeError('createBlockRenderer 需要传入 Canvas 元素或 2D 上下文对象');
  }
  // 传入 <canvas> 或带 getContext 的对象
  if (typeof target.getContext === 'function') {
    const ctx = target.getContext('2d');
    if (!ctx) throw new Error('无法从画布获取 2D 上下文');
    return {
      canvas: target,
      ctx,
      width: options.width ?? target.width ?? 960,
      height: options.height ?? target.height ?? 540,
    };
  }
  // 直接传入 2D 上下文（单测场景）
  return {
    canvas: null,
    ctx: target,
    width: options.width ?? 960,
    height: options.height ?? 540,
  };
}

/**
 * 创建色块渲染器实例。
 * @param {HTMLCanvasElement | object} target 画布元素或 2D 上下文
 * @param {object} [options]
 * @param {number} [options.width=960] 逻辑宽度
 * @param {number} [options.height=540] 逻辑高度
 * @param {number} [options.dpr=1] 像素缩放比
 */
export function createBlockRenderer(target, options = {}) {
  const resolved = resolveTarget(target, options);
  const { canvas, ctx } = resolved;

  let logicalWidth = resolved.width;
  let logicalHeight = resolved.height;
  let currentDpr = options.dpr ?? 1;

  function applySurfaceSize() {
    if (canvas) {
      const pixelW = Math.max(1, Math.round(logicalWidth * currentDpr));
      const pixelH = Math.max(1, Math.round(logicalHeight * currentDpr));
      if (canvas.width !== pixelW) canvas.width = pixelW;
      if (canvas.height !== pixelH) canvas.height = pixelH;
    }
    if (typeof ctx.setTransform === 'function') {
      ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
    }
  }

  applySurfaceSize();

  function getSize() {
    return { width: logicalWidth, height: logicalHeight };
  }

  function resize(width, height, dpr = currentDpr) {
    if (typeof width !== 'number' || width <= 0 || typeof height !== 'number' || height <= 0) {
      throw new RangeError('resize 的宽高必须是正数');
    }
    if (typeof dpr !== 'number' || dpr <= 0) {
      throw new RangeError('resize 的 dpr 必须是正数');
    }
    logicalWidth = width;
    logicalHeight = height;
    currentDpr = dpr;
    applySurfaceSize();
  }

  function clear(color = '#17191f') {
    ctx.save();
    ctx.globalAlpha = 1;
    if (color) {
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, logicalWidth, logicalHeight);
    } else if (typeof ctx.clearRect === 'function') {
      ctx.clearRect(0, 0, logicalWidth, logicalHeight);
    }
    ctx.restore();
  }

  function rect({
    x,
    y,
    w,
    h,
    fill = null,
    stroke = null,
    lineWidth = 1,
    radius = 0,
    alpha = 1,
  }) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    traceRoundedRect(ctx, x, y, w, h, radius);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke && lineWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }

  function circle({
    x,
    y,
    r,
    fill = null,
    stroke = null,
    lineWidth = 1,
    alpha = 1,
  }) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, r), 0, Math.PI * 2);
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke && lineWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }

  function line({
    x1,
    y1,
    x2,
    y2,
    color = '#ffffff',
    lineWidth = 1,
    dash = null,
    alpha = 1,
  }) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    if (Array.isArray(dash) && typeof ctx.setLineDash === 'function') {
      ctx.setLineDash(dash);
    }
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
  }

  function polygon({
    points,
    fill = null,
    stroke = null,
    lineWidth = 1,
    closed = true,
    alpha = 1,
  }) {
    if (!Array.isArray(points) || points.length < 2) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    if (closed) ctx.closePath();
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill();
    }
    if (stroke && lineWidth > 0) {
      ctx.strokeStyle = stroke;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }
    ctx.restore();
  }

  function text({
    text: content,
    x,
    y,
    color = '#e8ecf4',
    size = 16,
    weight = 'normal',
    align = 'left',
    baseline = 'top',
    maxWidth,
    font = DEFAULT_FONT_FAMILY,
    alpha = 1,
  }) {
    const str = String(content ?? '');
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.font = buildFontString({ size, weight, font });
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = baseline;
    if (typeof maxWidth === 'number') {
      ctx.fillText(str, x, y, maxWidth);
    } else {
      ctx.fillText(str, x, y);
    }
    ctx.restore();
  }

  function measureText(content, { size = 16, weight = 'normal', font = DEFAULT_FONT_FAMILY } = {}) {
    const str = String(content ?? '');
    ctx.save();
    ctx.font = buildFontString({ size, weight, font });
    const metrics = typeof ctx.measureText === 'function'
      ? ctx.measureText(str)
      : { width: str.length * size * 0.65 };
    ctx.restore();
    return { width: metrics.width };
  }

  function clipRect({ x, y, w, h }, drawFn) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    try {
      drawFn();
    } finally {
      ctx.restore();
    }
  }

  function withAlpha(alpha, drawFn) {
    ctx.save();
    ctx.globalAlpha *= alpha;
    try {
      drawFn();
    } finally {
      ctx.restore();
    }
  }

  function group(offsetX, offsetY, drawFn) {
    ctx.save();
    ctx.translate(offsetX, offsetY);
    try {
      drawFn();
    } finally {
      ctx.restore();
    }
  }

  /**
   * 平移 + 旋转 + 缩放（弧形手牌、飘字弹一下、特效转圈都要用）。
   * @param {{x?: number, y?: number, rotate?: number, scale?: number}} t rotate 用弧度
   */
  function transform({ x = 0, y = 0, rotate = 0, scale = 1 } = {}, drawFn) {
    ctx.save();
    ctx.translate(x, y);
    if (rotate) ctx.rotate(rotate);
    if (scale !== 1) ctx.scale(scale, scale);
    try {
      drawFn();
    } finally {
      ctx.restore();
    }
  }

  /**
   * 实体色块占位接口：原型阶段用色块和标签表示角色、怪、道具；
   * 阶段 5 换像素堆叠渲染器时，保持同样参数签名替换内部实现即可。
   */
  function spriteSlot({
    x,
    y,
    w,
    h,
    color = '#4a88e8',
    borderColor = '#e8ecf4',
    label = '',
    sublabel = '',
    badge = '',
    radius = 8,
  }) {
    rect({ x, y, w, h, fill: color, stroke: borderColor, lineWidth: 2, radius });
    if (label) {
      text({
        text: label,
        x: x + w / 2,
        y: sublabel ? y + h / 2 - 10 : y + h / 2,
        color: '#ffffff',
        size: 15,
        weight: 'bold',
        align: 'center',
        baseline: 'middle',
        maxWidth: Math.max(20, w - 12),
      });
    }
    if (sublabel) {
      text({
        text: sublabel,
        x: x + w / 2,
        y: y + h / 2 + 12,
        color: '#e8ecf4',
        size: 12,
        align: 'center',
        baseline: 'middle',
        maxWidth: Math.max(20, w - 12),
      });
    }
    if (badge) {
      const badgeW = Math.max(32, measureText(badge, { size: 11, weight: 'bold' }).width + 12);
      rect({ x: x + w - badgeW - 6, y: y + 6, w: badgeW, h: 20, fill: '#17191f', stroke: borderColor, lineWidth: 1, radius: 4 });
      text({
        text: badge,
        x: x + w - badgeW / 2 - 6,
        y: y + 16,
        color: '#f2f5fb',
        size: 11,
        weight: 'bold',
        align: 'center',
        baseline: 'middle',
      });
    }
  }

  return {
    backend: RENDER_BACKEND,
    getSize,
    resize,
    clear,
    rect,
    circle,
    line,
    polygon,
    text,
    measureText,
    clipRect,
    withAlpha,
    group,
    transform,
    spriteSlot,
  };
}
