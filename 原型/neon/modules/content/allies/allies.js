// 原型的 4 个队友（设计稿 5.7、7.4；候选在 原型/neon/给用户挑-画面和加成队友.md C 段、给用户挑-阶段2到4.md F1）。
// 先照 claude 的倾向做（刺客、辅助是阶段 1 的；坦克、战士是阶段 3 加的），用户还没拍板。
// explore 是探索的小本事（run-rules 认 kind）：reveal_hidden / rest_extra / event_half_damage / elite_gold。
// role / mode 照 shared 约定；roleTag 是画面上写的一个字（刺、辅），只是职业，不是名字。

import { ACTIONS, TIMINGS } from '../../shared/index.js';

export const ALLY_DEFS = Object.freeze({
  ally_assassin_break: Object.freeze({
    id: 'ally_assassin_break',
    role: 'assassin',
    roleTag: '刺',
    mode: 'trigger',
    label: '补刀',
    description: '刺客：破盾那一下，补一刀单独的大伤害（攻击 × 15，单独判暴击，吃破盾以后的 ×1.5）',
    remainingUses: null,
    hireCost: 30,
    explore: Object.freeze({ kind: 'reveal_hidden', label: '一进片就标出藏着的东西' }),
    effects: [{ timing: TIMINGS.ON_SHIELD_BREAK, action: ACTIONS.DEAL_BONUS_DAMAGE, params: { target: 'event_monster', amount: 15, scale: 'attackRatio', canCrit: true } }],
  }),
  ally_support_cards: Object.freeze({
    id: 'ally_support_cards',
    role: 'support',
    roleTag: '辅',
    mode: 'inject',
    label: '塞牌',
    description: '辅助：这一仗牌组里多 3 张他的牌：2 张「记两边的颜色」、1 张「倍率 ×2」',
    remainingUses: null,
    deckCards: ['fn_record_neighbors', 'fn_record_neighbors', 'fn_mult_x2_blue'],
    hireCost: 25,
    explore: Object.freeze({ kind: 'rest_extra', label: '歇脚多一个选项' }),
    effects: [],
  }),
  ally_tank_push: Object.freeze({
    id: 'ally_tank_push',
    role: 'tank',
    roleTag: '坦',
    mode: 'trigger',
    label: '推后',
    description: '坦克：每破一次盾，那只怪的倒计时多推 1 格',
    remainingUses: null,
    hireCost: 30,
    explore: Object.freeze({ kind: 'event_half_damage', label: '事件扣的心少一半' }),
    effects: [{ timing: TIMINGS.ON_SHIELD_BREAK, action: ACTIONS.SHIFT_COUNTDOWN, params: { delta: 1, target: 'event_monster' } }],
  }),
  ally_warrior_shred: Object.freeze({
    id: 'ally_warrior_shred',
    role: 'warrior',
    roleTag: '战',
    mode: 'auto_before',
    label: '削盾',
    description: '战士：每回合出牌前砍一刀，削选中那只怪的盾 1 格',
    remainingUses: null,
    hireCost: 35,
    explore: Object.freeze({ kind: 'elite_gold', label: '打完精英多拿 20 金币' }),
    effects: [{ timing: TIMINGS.BEFORE_PLAY, action: ACTIONS.SHRED_SHIELD, params: { amount: 1, color: 'current', target: 'selected' } }],
  }),
});

/** 阶段 1 试打默认带的 2 个（跟以前一样） */
export const STAGE1_ALLY_IDS = Object.freeze(['ally_assassin_break', 'ally_support_cards']);

export const ALLY_LIST = Object.freeze(Object.values(ALLY_DEFS));
