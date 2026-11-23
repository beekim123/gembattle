// modules/battle-view/ 唯一对外入口。
// 画面模块只导入 shared / render / ui，不导入 battle-rules 或 content。

export { createBattleView } from './view.js';
export { buildPlayback } from './playback.js';
export { REGIONS, fanSlots, chainSlots, monsterSlots } from './layout.js';
// 色块小画法：大厅这些画面也用，跟战斗一个样子
export { F, LANE, T, bold, buffIcon, ellipse, fnCard, forest, gemCard, gemDot, stackSprite, swatch, txt } from './draw.js';
