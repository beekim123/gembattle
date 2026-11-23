// modules/ui/ 唯一对外入口。
// 其他模块和 app/ 只能导入这个文件。

export { UI_THEME } from './theme.js';
export { formatNumber, wrapText, drawText, drawNumber, drawPanel } from './primitives.js';
export { hitTestRect, createButton, drawButton } from './button.js';
export { layoutTooltip, drawTooltip } from './tooltip.js';
export { createUiLayer } from './manager.js';
