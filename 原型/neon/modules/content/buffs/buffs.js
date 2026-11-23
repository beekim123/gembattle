// 阶段 1 后半段的 4 个加成（设计稿 6.1，候选在 原型/neon/给用户挑-画面和加成队友.md 的 C 段）。
// 先照 claude 的倾向做（1A、2B、3C、4A），用户还没拍板；试打台上能换。
// 写法照设计稿 5.9：时机 + 条件 + 动作 + 数。只写功能，不取名。
// lane 是喂哪条打法路子（画面上的小图标用）。

import { ACTIONS, ACTION_DURATIONS, TIMINGS } from '../../shared/index.js';

export const BUFF_DEFS = Object.freeze({
  buff_break_white: Object.freeze({
    id: 'buff_break_white',
    slot: 1,
    lane: 'break',
    label: '破盾时全体吃一轮白',
    description: '破盾时，对所有怪打一轮白色伤害：红、绿、蓝各打「当时的倍率」那么多发。不削盾',
    effects: [{ timing: TIMINGS.ON_SHIELD_BREAK, action: ACTIONS.WHITE_ROUND, params: { target: 'all' } }],
  }),
  buff_complement_keep: Object.freeze({
    id: 'buff_complement_keep',
    slot: 2,
    lane: 'white',
    label: '合白不清空集色',
    description: '接到补色合白时，集到的颜色不清空',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: 'complementKeepsRecorded', value: true } }],
  }),
  buff_rainbow_keep3: Object.freeze({
    id: 'buff_rainbow_keep3',
    slot: 3,
    lane: 'rainbow',
    label: '彩虹以后留 3 色',
    description: '触发彩虹以后，不从一色重新集：留下这一色和它两边，一共 3 色',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: 'rainbowKeepsNeighbors', value: true } }],
  }),
  buff_first_break_doubles: Object.freeze({
    id: 'buff_first_break_doubles',
    slot: 4,
    lane: 'chain',
    label: '第一次断色照样 ×2',
    description: '每条链里第一次断色，倍率照样 ×2',
    effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: ACTION_DURATIONS.THIS_BATTLE, params: { ruleKey: 'firstBreakStillDoubles', value: true } }],
  }),
});

export const BUFF_LIST = Object.freeze(Object.values(BUFF_DEFS));
