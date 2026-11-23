// modules/battle-view/ 唯一对外入口。
// 画面模块只导入 shared / render / ui，不导入 battle-rules 或 content。

export { createBattleView } from './view.js';
export { buildPlayback } from './playback.js';
export { REGIONS, fanSlots, chainSlots, monsterSlots } from './layout.js';
