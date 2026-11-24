// 统一的「时机」和「动作表」定义（设计稿 5.9、10.3）。
// 动作表只声明名字、参数、谁能用、持续多久、会不会再触发别的；不写动作的执行逻辑。

/** 效果可以挂在哪些来源上 */
export const EFFECT_SOURCES = Object.freeze({
  CARD: 'card',
  BUFF: 'buff',
  ALLY: 'ally',
  GEAR: 'gear',
  MONSTER_TRAIT: 'monster_trait',
});

export const EFFECT_SOURCE_LIST = Object.freeze(Object.values(EFFECT_SOURCES));

export const EFFECT_SOURCE_LABELS = Object.freeze({
  [EFFECT_SOURCES.CARD]: '功能牌',
  [EFFECT_SOURCES.BUFF]: '加成',
  [EFFECT_SOURCES.ALLY]: '队友',
  [EFFECT_SOURCES.GEAR]: '装备小特性',
  [EFFECT_SOURCES.MONSTER_TRAIT]: '怪的特性',
});

/**
 * 统一时机常量（设计稿 5.9 的 13 个核心时机，外加 2 个便于表达怪出手和回合末留牌的时机）。
 */
export const TIMINGS = Object.freeze({
  BATTLE_START: 'battle_start',
  TURN_START: 'turn_start',
  BEFORE_PLAY: 'before_play',
  ON_CARD_PLAY: 'on_card_play',
  ON_GEM_PLAY: 'on_gem_play',
  ON_CHAIN_CONNECT: 'on_chain_connect',
  ON_COMPLEMENT_WHITE: 'on_complement_white',
  ON_RAINBOW: 'on_rainbow',
  ON_SHIELD_BREAK: 'on_shield_break',
  ON_HIT: 'on_hit',
  AFTER_PLAY: 'after_play',
  ON_MONSTER_ATTACK: 'on_monster_attack',
  ON_PLAYER_HIT: 'on_player_hit',
  TURN_END: 'turn_end',
  PASSIVE: 'passive',
});

export const TIMING_LIST = Object.freeze(Object.values(TIMINGS));

export const TIMING_LABELS = Object.freeze({
  [TIMINGS.BATTLE_START]: '开战时',
  [TIMINGS.TURN_START]: '每回合开始',
  [TIMINGS.BEFORE_PLAY]: '出牌前',
  [TIMINGS.ON_CARD_PLAY]: '出一张牌时',
  [TIMINGS.ON_GEM_PLAY]: '打出某色宝石时',
  [TIMINGS.ON_CHAIN_CONNECT]: '接上时',
  [TIMINGS.ON_COMPLEMENT_WHITE]: '合白时',
  [TIMINGS.ON_RAINBOW]: '彩虹时',
  [TIMINGS.ON_SHIELD_BREAK]: '破盾时',
  [TIMINGS.ON_HIT]: '打中一发时',
  [TIMINGS.AFTER_PLAY]: '出牌后',
  [TIMINGS.ON_MONSTER_ATTACK]: '怪出手时',
  [TIMINGS.ON_PLAYER_HIT]: '挨打时',
  [TIMINGS.TURN_END]: '回合结束',
  [TIMINGS.PASSIVE]: '一直生效',
});

/** 动作的持续时间类型（设计稿第 3 版补：持续多久） */
export const ACTION_DURATIONS = Object.freeze({
  INSTANT: 'instant',
  THIS_CARD: 'this_card',
  THIS_CHAIN: 'this_chain',
  THIS_TURN: 'this_turn',
  UNTIL_CONSUMED: 'until_consumed',
  THIS_BATTLE: 'this_battle',
});

export const ACTION_DURATION_LIST = Object.freeze(Object.values(ACTION_DURATIONS));

export const ACTION_DURATION_LABELS = Object.freeze({
  [ACTION_DURATIONS.INSTANT]: '立刻结算',
  [ACTION_DURATIONS.THIS_CARD]: '仅当前这张牌',
  [ACTION_DURATIONS.THIS_CHAIN]: '本条链内',
  [ACTION_DURATIONS.THIS_TURN]: '本回合',
  [ACTION_DURATIONS.UNTIL_CONSUMED]: '挡掉或消耗为止',
  [ACTION_DURATIONS.THIS_BATTLE]: '本仗一直生效',
});

/** 动作造成伤害或效果时，会不会再触发别的时机（设计稿第 3 版补） */
export const RETRIGGER_POLICIES = Object.freeze({
  NONE: 'none',
  NORMAL: 'normal',
  HIT_ONLY: 'hit_only',
  NO_RETRIGGER: 'no_retrigger',
});

export const RETRIGGER_POLICY_LIST = Object.freeze(Object.values(RETRIGGER_POLICIES));

export const RETRIGGER_POLICY_LABELS = Object.freeze({
  [RETRIGGER_POLICIES.NONE]: '不产生二次触发',
  [RETRIGGER_POLICIES.NORMAL]: '按常规规则触发',
  [RETRIGGER_POLICIES.HIT_ONLY]: '只计入打中一发，不触发打出宝石、不削盾',
  [RETRIGGER_POLICIES.NO_RETRIGGER]: '补刀伤害，不再触发打中一发或打出宝石',
});

/** 动作名称常量 */
export const ACTIONS = Object.freeze({
  ADD_HITS: 'add_hits',
  MODIFY_MULTIPLIER: 'modify_multiplier',
  MODIFY_HIT_DAMAGE: 'modify_hit_damage',
  SHRED_SHIELD: 'shred_shield',
  SHIFT_COUNTDOWN: 'shift_countdown',
  DRAW_CARDS: 'draw_cards',
  RECORD_COLORS: 'record_colors',
  CLEAR_RECORDED_COLORS: 'clear_recorded_colors',
  CHANGE_CARD_COLOR: 'change_card_color',
  ADD_BLOCK: 'add_block',
  HEAL_HEARTS: 'heal_hearts',
  DEAL_BONUS_DAMAGE: 'deal_bonus_damage',
  MODIFY_RULE: 'modify_rule',
  HIDE_HAND_CARD: 'hide_hand_card',
  INJECT_CARD: 'inject_card',
  CHANGE_SHIELD_COLOR: 'change_shield_color',
  HEAL_MONSTER: 'heal_monster',
  ADD_GEM_EXP: 'add_gem_exp',
  WHITE_ROUND: 'white_round',
});

export const ACTION_LIST = Object.freeze(Object.values(ACTIONS));

const ALL_PLAYER_SOURCES = Object.freeze([
  EFFECT_SOURCES.CARD,
  EFFECT_SOURCES.BUFF,
  EFFECT_SOURCES.ALLY,
  EFFECT_SOURCES.GEAR,
]);

const ALL_SOURCES = Object.freeze([
  ...ALL_PLAYER_SOURCES,
  EFFECT_SOURCES.MONSTER_TRAIT,
]);

function makeRetrigger(policy, flags = {}) {
  return Object.freeze({
    policy,
    triggersOnGemPlay: Boolean(flags.triggersOnGemPlay),
    triggersOnHit: Boolean(flags.triggersOnHit),
    triggersOnShieldBreak: Boolean(flags.triggersOnShieldBreak),
    breaksShield: Boolean(flags.breaksShield),
  });
}

/**
 * 标准动作表（设计稿 10.3 第 1 样约定）。
 * 以后加新动作往这里补，并同步在 battle-rules 加对应执行小函数。
 */
export const DEFAULT_ACTION_TABLE = Object.freeze({
  [ACTIONS.ADD_HITS]: Object.freeze({
    id: ACTIONS.ADD_HITS,
    label: '加发数',
    description: '增加本次或本张牌打出的发数（固定发数或按倍率乘算）',
    params: Object.freeze({
      count: Object.freeze({ type: 'number', required: true, description: '基础增加发数' }),
      scaleByMultiplier: Object.freeze({ type: 'boolean', required: false, description: '是否乘以当前倍率' }),
      gemColor: Object.freeze({ type: 'string', required: false, description: '附加发数的宝石颜色' }),
    }),
    allowedSources: ALL_PLAYER_SOURCES,
    defaultDuration: ACTION_DURATIONS.THIS_CARD,
    allowedDurations: Object.freeze([ACTION_DURATIONS.THIS_CARD, ACTION_DURATIONS.THIS_CHAIN, ACTION_DURATIONS.THIS_TURN]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.HIT_ONLY, { triggersOnHit: true }),
  }),

  [ACTIONS.MODIFY_MULTIPLIER]: Object.freeze({
    id: ACTIONS.MODIFY_MULTIPLIER,
    label: '改倍率',
    description: '乘算或加算当前链倍率（例如倍率 ×2）',
    params: Object.freeze({
      mode: Object.freeze({ type: 'string', required: true, description: 'multiply 或 add' }),
      value: Object.freeze({ type: 'number', required: true, description: '倍率系数或增量' }),
    }),
    allowedSources: ALL_PLAYER_SOURCES,
    defaultDuration: ACTION_DURATIONS.THIS_CHAIN,
    allowedDurations: Object.freeze([ACTION_DURATIONS.THIS_CARD, ACTION_DURATIONS.THIS_CHAIN]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.MODIFY_HIT_DAMAGE]: Object.freeze({
    id: ACTIONS.MODIFY_HIT_DAMAGE,
    label: '加每发伤害',
    description: '修改每发伤害相关数值（百分比增伤、攻击、暴击率或暴伤）',
    params: Object.freeze({
      stat: Object.freeze({ type: 'string', required: true, description: 'damageBonus / attack / critRate / critDamage / hitPercent' }),
      value: Object.freeze({ type: 'number', required: true, description: '增减数值（小数百分比或固定值）' }),
    }),
    allowedSources: ALL_SOURCES,
    defaultDuration: ACTION_DURATIONS.THIS_TURN,
    allowedDurations: Object.freeze([
      ACTION_DURATIONS.THIS_CARD,
      ACTION_DURATIONS.THIS_CHAIN,
      ACTION_DURATIONS.THIS_TURN,
      ACTION_DURATIONS.THIS_BATTLE,
    ]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.SHRED_SHIELD]: Object.freeze({
    id: ACTIONS.SHRED_SHIELD,
    label: '削盾',
    description: '削减选中怪或全体怪的指定颜色盾格数',
    params: Object.freeze({
      amount: Object.freeze({ type: 'number', required: true, description: '削减格数' }),
      color: Object.freeze({ type: 'string', required: false, description: 'red / green / blue / all / current' }),
      target: Object.freeze({ type: 'string', required: false, description: 'selected 或 all' }),
    }),
    allowedSources: ALL_PLAYER_SOURCES,
    defaultDuration: ACTION_DURATIONS.INSTANT,
    allowedDurations: Object.freeze([ACTION_DURATIONS.INSTANT]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NORMAL, { triggersOnShieldBreak: true, breaksShield: true }),
  }),

  [ACTIONS.SHIFT_COUNTDOWN]: Object.freeze({
    id: ACTIONS.SHIFT_COUNTDOWN,
    label: '拨倒计时',
    description: '将怪的倒计时往后推（正数）或往前拨（负数）',
    params: Object.freeze({
      delta: Object.freeze({ type: 'number', required: true, description: '倒计时变化量，正数延后、负数提前' }),
      target: Object.freeze({ type: 'string', required: false, description: 'selected / self / all' }),
    }),
    allowedSources: ALL_SOURCES,
    defaultDuration: ACTION_DURATIONS.INSTANT,
    allowedDurations: Object.freeze([ACTION_DURATIONS.INSTANT]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.DRAW_CARDS]: Object.freeze({
    id: ACTIONS.DRAW_CARDS,
    label: '摸牌',
    description: '立刻摸 N 张牌（超 12 张进弃牌堆），或调整补牌名额',
    params: Object.freeze({
      count: Object.freeze({ type: 'number', required: true, description: '摸牌张数' }),
      colorFilter: Object.freeze({ type: 'string', required: false, description: '可选：限定某种颜色' }),
    }),
    allowedSources: ALL_PLAYER_SOURCES,
    defaultDuration: ACTION_DURATIONS.INSTANT,
    allowedDurations: Object.freeze([ACTION_DURATIONS.INSTANT, ACTION_DURATIONS.THIS_TURN]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.RECORD_COLORS]: Object.freeze({
    id: ACTIONS.RECORD_COLORS,
    label: '记颜色',
    description: '把当前色两边的颜色（或顺着未集色）记入集色栏',
    params: Object.freeze({
      mode: Object.freeze({ type: 'string', required: true, description: 'neighbors / specific / sequential / random（随机挑没集到的）' }),
      count: Object.freeze({ type: 'number', required: false, description: '最多记几种颜色' }),
      color: Object.freeze({ type: 'string', required: false, description: '指定颜色（mode 为 specific 时）' }),
    }),
    allowedSources: ALL_PLAYER_SOURCES,
    defaultDuration: ACTION_DURATIONS.INSTANT,
    allowedDurations: Object.freeze([ACTION_DURATIONS.INSTANT]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.CLEAR_RECORDED_COLORS]: Object.freeze({
    id: ACTIONS.CLEAR_RECORDED_COLORS,
    label: '清空集色',
    description: '清空当前已经集到的颜色（如怪每次出手清空集色）',
    params: Object.freeze({}),
    allowedSources: Object.freeze([EFFECT_SOURCES.MONSTER_TRAIT, EFFECT_SOURCES.CARD]),
    defaultDuration: ACTION_DURATIONS.INSTANT,
    allowedDurations: Object.freeze([ACTION_DURATIONS.INSTANT]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.CHANGE_CARD_COLOR]: Object.freeze({
    id: ACTIONS.CHANGE_CARD_COLOR,
    label: '改一张牌的颜色',
    description: '改变这张牌打出去时的颜色（例如变成当前色的补色，或当任意色）',
    params: Object.freeze({
      mode: Object.freeze({ type: 'string', required: true, description: 'complement / wild / fixed' }),
      color: Object.freeze({ type: 'string', required: false, description: '固定目标色（mode 为 fixed 时）' }),
    }),
    allowedSources: Object.freeze([EFFECT_SOURCES.CARD, EFFECT_SOURCES.BUFF]),
    defaultDuration: ACTION_DURATIONS.THIS_CARD,
    allowedDurations: Object.freeze([ACTION_DURATIONS.THIS_CARD, ACTION_DURATIONS.THIS_CHAIN]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.ADD_BLOCK]: Object.freeze({
    id: ACTIONS.ADD_BLOCK,
    label: '挡一下',
    description: '获得抵挡怪攻击的次数，可为本回合有效或留到挡掉为止',
    params: Object.freeze({
      count: Object.freeze({ type: 'number', required: true, description: '可抵挡次数' }),
    }),
    allowedSources: ALL_PLAYER_SOURCES,
    defaultDuration: ACTION_DURATIONS.UNTIL_CONSUMED,
    allowedDurations: Object.freeze([ACTION_DURATIONS.THIS_TURN, ACTION_DURATIONS.UNTIL_CONSUMED]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.HEAL_HEARTS]: Object.freeze({
    id: ACTIONS.HEAL_HEARTS,
    label: '回心',
    description: '回复主角的心（支持 0.5 步进，不超过心的上限）',
    params: Object.freeze({
      amount: Object.freeze({ type: 'number', required: true, description: '回复心数，如 0.5 或 1' }),
    }),
    allowedSources: ALL_PLAYER_SOURCES,
    defaultDuration: ACTION_DURATIONS.INSTANT,
    allowedDurations: Object.freeze([ACTION_DURATIONS.INSTANT]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.DEAL_BONUS_DAMAGE]: Object.freeze({
    id: ACTIONS.DEAL_BONUS_DAMAGE,
    label: '补刀伤害',
    description: '队友、加成、装备或固定伤害牌打出的额外伤害，不再触发打中一发时',
    params: Object.freeze({
      amount: Object.freeze({ type: 'number', required: true, description: '基础伤害或倍率系数' }),
      scale: Object.freeze({ type: 'string', required: false, description: 'fixed / attackRatio / brokenShieldStacks' }),
      target: Object.freeze({ type: 'string', required: false, description: 'selected 或 all' }),
      ignoreTraits: Object.freeze({ type: 'boolean', required: false, description: '是否无视怪的减伤特性' }),
    }),
    allowedSources: ALL_PLAYER_SOURCES,
    defaultDuration: ACTION_DURATIONS.INSTANT,
    allowedDurations: Object.freeze([ACTION_DURATIONS.INSTANT]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NO_RETRIGGER),
  }),

  [ACTIONS.WHITE_ROUND]: Object.freeze({
    id: ACTIONS.WHITE_ROUND,
    label: '打一轮白',
    description: '对目标打一轮白色伤害：红、绿、蓝各打「当时的倍率」那么多发，不削盾（加成「破过盾，链尾全体补一轮白」用，链打完时按链尾的倍率）',
    params: Object.freeze({
      target: Object.freeze({ type: 'string', required: false, description: 'all（默认）或 selected' }),
    }),
    allowedSources: ALL_PLAYER_SOURCES,
    defaultDuration: ACTION_DURATIONS.INSTANT,
    allowedDurations: Object.freeze([ACTION_DURATIONS.INSTANT]),
    // 5.9：加成多打的发不再触发「打中一发时」「破盾时」，也不削盾
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NO_RETRIGGER),
  }),

  [ACTIONS.MODIFY_RULE]: Object.freeze({
    id: ACTIONS.MODIFY_RULE,
    label: '改规则',
    description: '修改战斗规则开关或参数（如断色照样翻倍、留牌不占名额、前 N 发不掉血等）',
    params: Object.freeze({
      ruleKey: Object.freeze({ type: 'string', required: true, description: '具名规则键' }),
      value: Object.freeze({ type: 'any', required: true, description: '规则值（布尔、数字或颜色）' }),
    }),
    allowedSources: ALL_SOURCES,
    defaultDuration: ACTION_DURATIONS.THIS_BATTLE,
    allowedDurations: Object.freeze([
      ACTION_DURATIONS.THIS_CHAIN,
      ACTION_DURATIONS.THIS_TURN,
      ACTION_DURATIONS.THIS_BATTLE,
    ]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.HIDE_HAND_CARD]: Object.freeze({
    id: ACTIONS.HIDE_HAND_CARD,
    label: '遮住手牌',
    description: '遮住玩家若干张手牌，使快照不暴露其真实颜色',
    params: Object.freeze({
      count: Object.freeze({ type: 'number', required: true, description: '遮住张数' }),
    }),
    allowedSources: Object.freeze([EFFECT_SOURCES.MONSTER_TRAIT]),
    defaultDuration: ACTION_DURATIONS.THIS_TURN,
    allowedDurations: Object.freeze([ACTION_DURATIONS.THIS_TURN]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.INJECT_CARD]: Object.freeze({
    id: ACTIONS.INJECT_CARD,
    label: '塞牌',
    description: '向抽牌堆、弃牌堆或手牌塞入指定牌（怪塞没用的牌或队友塞牌）',
    params: Object.freeze({
      cardDefId: Object.freeze({ type: 'string', required: true, description: '塞入的牌定义标识' }),
      count: Object.freeze({ type: 'number', required: true, description: '塞入张数' }),
      destination: Object.freeze({ type: 'string', required: false, description: 'draw / discard / hand' }),
    }),
    allowedSources: Object.freeze([EFFECT_SOURCES.MONSTER_TRAIT, EFFECT_SOURCES.ALLY, EFFECT_SOURCES.BUFF]),
    defaultDuration: ACTION_DURATIONS.THIS_BATTLE,
    allowedDurations: Object.freeze([ACTION_DURATIONS.INSTANT, ACTION_DURATIONS.THIS_BATTLE]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.CHANGE_SHIELD_COLOR]: Object.freeze({
    id: ACTIONS.CHANGE_SHIELD_COLOR,
    label: '更换盾的颜色',
    description: '将怪当前未破盾的颜色按规则更换为另一种三原色',
    params: Object.freeze({
      mode: Object.freeze({ type: 'string', required: false, description: 'random / rotate' }),
    }),
    allowedSources: Object.freeze([EFFECT_SOURCES.MONSTER_TRAIT]),
    defaultDuration: ACTION_DURATIONS.THIS_TURN,
    allowedDurations: Object.freeze([ACTION_DURATIONS.INSTANT, ACTION_DURATIONS.THIS_TURN]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.HEAL_MONSTER]: Object.freeze({
    id: ACTIONS.HEAL_MONSTER,
    label: '怪回血',
    description: '怪按固定值或当前血条最大血量比例回复血量',
    params: Object.freeze({
      amount: Object.freeze({ type: 'number', required: true, description: '回复量或比例' }),
      isRatio: Object.freeze({ type: 'boolean', required: false, description: 'true 表示按最大血量比例' }),
    }),
    allowedSources: Object.freeze([EFFECT_SOURCES.MONSTER_TRAIT]),
    defaultDuration: ACTION_DURATIONS.INSTANT,
    allowedDurations: Object.freeze([ACTION_DURATIONS.INSTANT]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),

  [ACTIONS.ADD_GEM_EXP]: Object.freeze({
    id: ACTIONS.ADD_GEM_EXP,
    label: '加宝石经验',
    description: '增加指定原色宝石的经验值',
    params: Object.freeze({
      color: Object.freeze({ type: 'string', required: true, description: 'red / green / blue / all' }),
      amount: Object.freeze({ type: 'number', required: true, description: '增加经验值' }),
    }),
    allowedSources: ALL_PLAYER_SOURCES,
    defaultDuration: ACTION_DURATIONS.INSTANT,
    allowedDurations: Object.freeze([ACTION_DURATIONS.INSTANT]),
    retrigger: makeRetrigger(RETRIGGER_POLICIES.NONE),
  }),
});
