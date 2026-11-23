// 29 张固定宝石牌组 + 原型 8 种功能牌定义（设计稿 5.2、5.6）。
// 原型阶段不取名，牌只写功能；效果全部按「时机 + 条件 + 动作 + 数」写。

import {
  ACTIONS,
  ACTION_DURATIONS,
  COLOR_META,
  SEVEN_COLORS,
  TIMINGS,
} from '../../shared/index.js';

/** 固定 29 张宝石牌定义（按七色查表） */
export const GEM_CARD_DEFS = Object.freeze(
  Object.fromEntries(
    SEVEN_COLORS.map((color) => {
      const meta = COLOR_META[color];
      return [
        `gem_${color}`,
        Object.freeze({
          defId: `gem_${color}`,
          kind: 'gem',
          usage: 'chain',
          color,
          gems: meta.gems,
          baseDeckCount: meta.baseDeckCount,
          drawAfterPlay: 0,
          label: `${meta.label}宝石`,
          description: `带 ${meta.gemCount} 颗宝石（${meta.gems.map((g) => COLOR_META[g].label).join('+')}），每颗打当前倍率发`,
          effects: Object.freeze([]),
        }),
      ];
    }),
  ),
);

/**
 * 原型 8 种功能牌（设计稿 5.6 第 3 版）：
 * - 排进链的 2 种都带颜色（或跟着变色）：倍率 ×2（蓝）、变成当前色的补色（变色）。
 * - 无色的 6 种都是马上用，用完补摸 1 张（其中「马上摸 2 张」自身就是摸牌）。
 */
export const FUNCTION_CARD_DEFS = Object.freeze({
  fn_draw_2: Object.freeze({
    defId: 'fn_draw_2',
    kind: 'function',
    usage: 'instant',
    color: 'colorless',
    gems: Object.freeze([]),
    drawAfterPlay: 0,
    label: '马上摸 2 张',
    description: '马上用：立刻摸 2 张牌，摸到的牌可排进本回合链',
    effects: Object.freeze([
      Object.freeze({
        timing: TIMINGS.ON_CARD_PLAY,
        action: ACTIONS.DRAW_CARDS,
        duration: ACTION_DURATIONS.INSTANT,
        params: Object.freeze({ count: 2 }),
      }),
    ]),
  }),

  fn_hit_percent_50: Object.freeze({
    defId: 'fn_hit_percent_50',
    kind: 'function',
    usage: 'instant',
    color: 'colorless',
    gems: Object.freeze([]),
    drawAfterPlay: 1,
    label: '本回合\n每发 +50%',
    description: '马上用：这回合每发伤害 +50%，用完补摸 1 张',
    effects: Object.freeze([
      Object.freeze({
        timing: TIMINGS.ON_CARD_PLAY,
        action: ACTIONS.MODIFY_HIT_DAMAGE,
        duration: ACTION_DURATIONS.THIS_TURN,
        params: Object.freeze({ stat: 'hitPercent', value: 0.5 }),
      }),
    ]),
  }),

  fn_mult_x2_blue: Object.freeze({
    defId: 'fn_mult_x2_blue',
    kind: 'function',
    usage: 'chain',
    color: 'blue',
    gems: Object.freeze(['blue']),
    drawAfterPlay: 0,
    label: '蓝 · 倍率 ×2',
    description: '排进链：带 1 颗蓝宝石，按蓝牌接链出伤后，倍率再 ×2（后面的牌吃到）',
    effects: Object.freeze([
      Object.freeze({
        timing: TIMINGS.ON_CARD_PLAY,
        action: ACTIONS.MODIFY_MULTIPLIER,
        duration: ACTION_DURATIONS.THIS_CHAIN,
        params: Object.freeze({ mode: 'multiply', value: 2 }),
      }),
    ]),
  }),

  fn_to_complement: Object.freeze({
    defId: 'fn_to_complement',
    kind: 'function',
    usage: 'chain',
    color: 'adaptive',
    gems: Object.freeze([]),
    drawAfterPlay: 0,
    label: '变成当前色的补色',
    description: '排进链：打出去变成当前色的补色并带对应宝石（造合白）；起色或白后变白牌',
    effects: Object.freeze([
      Object.freeze({
        timing: TIMINGS.ON_CARD_PLAY,
        action: ACTIONS.CHANGE_CARD_COLOR,
        duration: ACTION_DURATIONS.THIS_CARD,
        params: Object.freeze({ mode: 'complement' }),
      }),
    ]),
  }),

  fn_record_neighbors: Object.freeze({
    defId: 'fn_record_neighbors',
    kind: 'function',
    usage: 'instant',
    color: 'colorless',
    gems: Object.freeze([]),
    drawAfterPlay: 1,
    label: '记两边颜色',
    description: '马上用：把当前色两边的颜色记入集色（起色或白时从红顺记 2 色），用完补摸 1 张',
    effects: Object.freeze([
      Object.freeze({
        timing: TIMINGS.ON_CARD_PLAY,
        action: ACTIONS.RECORD_COLORS,
        duration: ACTION_DURATIONS.INSTANT,
        params: Object.freeze({ mode: 'neighbors', count: 2 }),
      }),
    ]),
  }),

  fn_shred_shield_2: Object.freeze({
    defId: 'fn_shred_shield_2',
    kind: 'function',
    usage: 'instant',
    color: 'colorless',
    gems: Object.freeze([]),
    drawAfterPlay: 1,
    label: '削目标盾 2 格',
    description: '马上用：削选中那只怪当前未破的一条盾 2 格，用完补摸 1 张',
    effects: Object.freeze([
      Object.freeze({
        timing: TIMINGS.ON_CARD_PLAY,
        action: ACTIONS.SHRED_SHIELD,
        duration: ACTION_DURATIONS.INSTANT,
        params: Object.freeze({ amount: 2, color: 'current', target: 'selected' }),
      }),
    ]),
  }),

  fn_block_next: Object.freeze({
    defId: 'fn_block_next',
    kind: 'function',
    usage: 'instant',
    color: 'colorless',
    gems: Object.freeze([]),
    drawAfterPlay: 1,
    label: '挡下一次攻击',
    description: '马上用：挡掉怪的下一次攻击（留到挡掉为止），用完补摸 1 张',
    effects: Object.freeze([
      Object.freeze({
        timing: TIMINGS.ON_CARD_PLAY,
        action: ACTIONS.ADD_BLOCK,
        duration: ACTION_DURATIONS.UNTIL_CONSUMED,
        params: Object.freeze({ count: 1 }),
      }),
    ]),
  }),

  fn_delay_countdown_1: Object.freeze({
    defId: 'fn_delay_countdown_1',
    kind: 'function',
    usage: 'instant',
    color: 'colorless',
    gems: Object.freeze([]),
    drawAfterPlay: 1,
    label: '怪倒计时 +1',
    description: '马上用：选中那只怪的倒计时往后推 1 格，用完补摸 1 张',
    effects: Object.freeze([
      Object.freeze({
        timing: TIMINGS.ON_CARD_PLAY,
        action: ACTIONS.SHIFT_COUNTDOWN,
        duration: ACTION_DURATIONS.INSTANT,
        params: Object.freeze({ delta: 1, target: 'selected' }),
      }),
    ]),
  }),
});

export const FUNCTION_CARD_LIST = Object.freeze(Object.values(FUNCTION_CARD_DEFS));

/** 怪塞进牌组的无用牌（备用） */
export const JUNK_CARD_DEFS = Object.freeze({
  junk_dud: Object.freeze({
    defId: 'junk_dud',
    kind: 'junk',
    usage: 'instant',
    color: 'colorless',
    gems: Object.freeze([]),
    drawAfterPlay: 0,
    label: '没用的牌',
    description: '占用手牌位置，点一下丢进弃牌堆（不补摸）',
    effects: Object.freeze([]),
  }),
});

export const ALL_CARD_DEFS = Object.freeze({
  ...GEM_CARD_DEFS,
  ...FUNCTION_CARD_DEFS,
  ...JUNK_CARD_DEFS,
});

/** 根据牌定义实例化一张带唯一 uid 的牌 */
export function instantiateCard(defId, uid) {
  const def = ALL_CARD_DEFS[defId];
  if (!def) throw new Error(`未知的牌定义：${defId}`);
  return {
    uid,
    defId: def.defId,
    kind: def.kind,
    usage: def.usage,
    color: def.color,
    gems: [...def.gems],
    enhanced: false,
    drawAfterPlay: def.drawAfterPlay ?? 0,
    label: def.label,
    description: def.description,
    effects: def.effects.map((ef) => ({
      timing: ef.timing,
      action: ef.action,
      ...(ef.duration ? { duration: ef.duration } : {}),
      ...(ef.condition ? { condition: { ...ef.condition } } : {}),
      params: { ...(ef.params || {}) },
    })),
  };
}

/**
 * 构建固定 29 张宝石牌组，并可选混入若干功能牌 defId 列表。
 * @param {string[]} [extraCardDefIds]
 */
export function buildDeck(extraCardDefIds = []) {
  const deck = [];
  let seq = 1;
  for (const color of SEVEN_COLORS) {
    const defId = `gem_${color}`;
    const count = COLOR_META[color].baseDeckCount;
    for (let i = 0; i < count; i++) {
      deck.push(instantiateCard(defId, `card-${seq++}`));
    }
  }
  for (const defId of extraCardDefIds) {
    deck.push(instantiateCard(defId, `card-${seq++}`));
  }
  return deck;
}
