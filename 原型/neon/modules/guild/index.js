// modules/guild/ 唯一对外入口：工会（任务板、提交、商店、冒险家等级）。rules/ 不碰画面，view/ 只画。
export {
  refreshBoard, canTake, takeQuest, abandonQuest, submitQuest, submitAll, shopList, buyGear, submittableCount, rankInfo, rankIndex, nextRank,
} from './rules/guild-rules.js';
export { createGuildView } from './view/guild-view.js';
