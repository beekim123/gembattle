// 原型的 12 个加成（设计稿 6.1、9.1：5 条路子各 2 个，再加 2 个横跨的），外加 1 个隐藏任务解锁的。
// 12 个加成 + 1 个要解锁的，定在设计稿 9.3（第 4 版）。当初的候选：前 4 个在 记录/给用户挑-画面和加成队友.md C 段，后 8 个在 记录/给用户挑-阶段2到4.md E1。
// 都先照 claude 的倾向做，用户还没拍板。lanes：横跨两条的写两条。locked：要解锁才进奖励池。
// 写法照设计稿 5.9：时机 + 条件 + 动作 + 数。只写功能，不取名。
// lane 是喂哪条打法路子（画面上的小图标用）。

import { ACTIONS, ACTION_DURATIONS, TIMINGS, RULE_KEYS } from '../../shared/index.js';

export const BUFF_DEFS = Object.freeze({
  buff_break_white: Object.freeze({
    id: 'buff_break_white',
    slot: 1,
    lane: 'break',
    lanes: ['break', 'white'],
    label: '破盾时全体吃一轮白',
    description: '破盾时，对所有怪打一轮白色伤害：红、绿、蓝各打「当时的倍率」那么多发。不削盾',
    effects: [{ timing: TIMINGS.ON_SHIELD_BREAK, action: ACTIONS.WHITE_ROUND, params: { target: 'all' } }],
  }),
  buff_complement_keep: Object.freeze({
    id: 'buff_complement_keep',
    slot: 2,
    lane: 'white',
    lanes: ['white', 'rainbow'],
    label: '合白不清空集色',
    description: '接到补色合白时，集到的颜色不清空',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: RULE_KEYS.complementKeepsRecorded, value: true } }],
  }),
  buff_rainbow_keep3: Object.freeze({
    id: 'buff_rainbow_keep3',
    slot: 3,
    lane: 'rainbow',
    label: '彩虹以后留 3 色',
    description: '触发彩虹以后，不从一色重新集：留下这一色和它两边，一共 3 色',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: RULE_KEYS.rainbowKeepsNeighbors, value: true } }],
  }),
  buff_first_break_doubles: Object.freeze({
    id: 'buff_first_break_doubles',
    slot: 4,
    lane: 'chain',
    label: '第一次断色照样 ×2',
    description: '每条链里第一次断色，倍率照样 ×2',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: RULE_KEYS.firstBreakStillDoubles, value: true } }],
  }),
  buff_first_match_shred: Object.freeze({
    id: 'buff_first_match_shred',
    slot: 5,
    lane: 'break',
    label: '第一张对色多削盾',
    description: '每条链里第一张对得上盾色的牌，每颗宝石多削 1 格',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: RULE_KEYS.firstMatchExtraShred, value: true } }],
  }),
  buff_break_greedy: Object.freeze({
    id: 'buff_break_greedy',
    slot: 6,
    lane: 'break',
    label: '破盾更疼，不推倒计时',
    description: '破盾以后受到的伤害从 ×1.5 变成 ×2.25，但破盾不再把倒计时往后推',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: RULE_KEYS.brokenMultiplier, value: 2.25 } }, { timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: RULE_KEYS.noBreakPush, value: true } }],
  }),
  buff_white_twice: Object.freeze({
    id: 'buff_white_twice',
    slot: 7,
    lane: 'white',
    label: '合白再多打一轮',
    description: '合白多打的那一轮白色伤害，再多打一轮',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: RULE_KEYS.complementExtraRound, value: true } }],
  }),
  buff_white_draw: Object.freeze({
    id: 'buff_white_draw',
    slot: 8,
    lane: 'white',
    label: '合白 2 次，下回合多 1 张',
    description: '一条链里合白 2 次，下回合多摸 1 张，不到 N + 1 张就补到 N + 1 张（每回合最多一次）',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: RULE_KEYS.complementBonusDraw, value: true } }],
  }),
  buff_rainbow_seed: Object.freeze({
    id: 'buff_rainbow_seed',
    slot: 9,
    lane: 'rainbow',
    label: '每回合多记一色',
    description: '每回合开始，顺着当前色多记上一种还没集到的颜色',
    effects: [{ timing: TIMINGS.TURN_START, action: ACTIONS.RECORD_COLORS, params: { mode: 'neighbors', count: 1 } }],
  }),
  buff_break_keeps_recorded: Object.freeze({
    id: 'buff_break_keeps_recorded',
    slot: 10,
    lane: 'chain',
    label: '断色不清空集色',
    description: '链断了色，集到的颜色照样留着',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: RULE_KEYS.breakKeepsRecorded, value: true } }],
  }),
  buff_keep_free: Object.freeze({
    id: 'buff_keep_free',
    slot: 11,
    lane: 'keep',
    label: '回合开始上限多 1 张',
    description: '回合开始手里最多 N + 2 张（平时 N + 1）：多留的牌也摸得满',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: RULE_KEYS.extraFreeKeep, value: 1 } }],
  }),
  buff_keep_double: Object.freeze({
    id: 'buff_keep_double',
    slot: 12,
    lane: 'keep',
    label: '留着牌，链从 ×2 起',
    description: '回合结束手里留着牌，下回合的链从 ×2 起',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: RULE_KEYS.keptStartsDouble, value: true } }],
  }),
  // 隐藏任务「一仗里打出一次彩虹」交了才解锁（任务 q_hidden_rainbow）
  buff_rainbow_extra: Object.freeze({
    id: 'buff_rainbow_extra',
    slot: 13,
    lane: 'rainbow',
    locked: true,
    label: '彩虹再多打一遍',
    description: '彩虹再打的两遍变成三遍',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: RULE_KEYS.rainbowExtraRepeat, value: true } }],
  }),
});

export const BUFF_LIST = Object.freeze(Object.values(BUFF_DEFS));
/** 一开始就在奖励池里的（没锁的） */
export const BUFF_POOL = Object.freeze(BUFF_LIST.filter((b) => !b.locked));
/** 阶段 1 试打默认带的 4 个 */
export const TRIAL_BUFF_IDS = Object.freeze(['buff_break_white', 'buff_complement_keep', 'buff_rainbow_keep3', 'buff_first_break_doubles']);
