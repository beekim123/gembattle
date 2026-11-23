// 阶段 1 后半段的 2 个队友（设计稿 5.7，候选在 原型/neon/给用户挑-画面和加成队友.md 的 C 段）。
// 先照 claude 的倾向做（刺客 B + 辅助 B），用户还没拍板；试打台上能换。
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
    effects: [],
  }),
});

export const ALLY_LIST = Object.freeze(Object.values(ALLY_DEFS));
