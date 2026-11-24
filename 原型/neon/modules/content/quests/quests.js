// 任务（设计稿 8.2、9.1：C、B 级，采集、收集怪身上的、讨伐、找东西各一两个，再加 1 个隐藏任务）。
// 定在设计稿 9.3（第 4 版）；当初的候选在 记录/给用户挑-阶段2到4.md F3。
// kind 由 run-rules 认：gather（某层采 N 个）/ drop（打某种怪，打一只掉一样）/ hunt（某层打 N 仗）/
// find（某层某片角落藏着 1 样）/ gatekeeper（打看门的）/ challenge_rainbow（一仗里打出一次彩虹）。

export const QUEST_DEFS = Object.freeze({
  q_c_gather: Object.freeze({ id: 'q_c_gather', grade: 'C', kind: 'gather', layer: 1, count: 3, reward: 90, label: '第 1 层采 3 个' }),
  q_c_drop: Object.freeze({ id: 'q_c_drop', grade: 'C', kind: 'drop', target: 'monster_dual_shield', count: 2, reward: 100, label: '打双色盾的怪，凑 2 样它身上的东西' }),
  q_c_hunt: Object.freeze({ id: 'q_c_hunt', grade: 'C', kind: 'hunt', layer: 1, count: 3, reward: 80, label: '第 1 层打 3 仗' }),
  q_c_find: Object.freeze({ id: 'q_c_find', grade: 'C', kind: 'find', layer: 1, count: 1, reward: 110, label: '第 1 层某片角落找 1 样东西' }),
  q_b_gate: Object.freeze({ id: 'q_b_gate', grade: 'B', kind: 'gatekeeper', count: 1, reward: 350, label: '打外头区的看门的' }),
  q_b_gather: Object.freeze({ id: 'q_b_gather', grade: 'B', kind: 'gather', layer: 2, count: 4, reward: 300, label: '第 2 层采 4 个' }),
  // 升级任务：做完 3 个 C 级才出（8.4）
  q_rank_b: Object.freeze({ id: 'q_rank_b', grade: 'C', kind: 'gatekeeper', count: 1, reward: 150, rankUp: 'B', label: '升级任务：打外头区的看门的' }),
});

export const HIDDEN_QUEST = Object.freeze({ id: 'q_hidden_rainbow', grade: 'C', kind: 'challenge_rainbow', count: 1, reward: 150, unlockBuff: 'buff_rainbow_extra', label: '隐藏任务：一仗里打出一次彩虹' });

export const QUEST_BOARD = Object.freeze({
  C: ['q_c_gather', 'q_c_drop', 'q_c_hunt', 'q_c_find'],
  B: ['q_b_gate', 'q_b_gather'],
});
