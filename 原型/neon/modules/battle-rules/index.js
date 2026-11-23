// modules/battle-rules/ 唯一对外入口。
// 不碰 document / canvas / window，可直接运行在 Node 单测与假玩家模拟器中。

export { createBattle } from './engine.js';
export {
  resolveCardForChain,
  computeChainRelation,
  advanceRecordedColors,
  pickColorsToRecord,
  gemLevelThreshold,
  gemLevelMultiplier,
} from './chain-math.js';
export { ACTION_HANDLERS, executeAction } from './actions.js';
export { findBestChainOrder } from './arrange.js';
