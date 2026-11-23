// 阶段 1 战斗遭遇定义（设计稿 5.8、9.2、10.4）。
// 主推阶段 1 规定的 5 种仗（双色盾、集色减伤、倒计时短、一群、看门的），另附 5.8 的另 2 种仗（挑色减半、精英前 N 发不掉血）供拓展试打。
// 原型阶段不取名，怪与特性只写功能。

import { ACTIONS, ACTION_DURATIONS, TIMINGS } from '../../shared/index.js';

/**
 * 阶段 1 的战斗遭遇列表（外头区第 1、2 层口径，参考设计稿 9.2）：
 * - 普通怪第 1 层约 10000 血（C 级装备攻击约 80，每发约 60）
 * - 看门的位于第 2 层（3 条血，每条 20000，搭配 B 级装备攻击约 140、每发约 120）
 */
export const ENCOUNTERS = Object.freeze({
  dual_shield: Object.freeze({
    id: 'dual_shield',
    stage1Core: true,
    layer: 1,
    label: '双色盾普通怪',
    summary: '1 条血，红 3 格 + 蓝 3 格双色盾；试破盾与组合色当桥',
    recommendedPreset: 'tier_c',
    monsters: Object.freeze([
      Object.freeze({
        uid: 'm-dual-1',
        defId: 'monster_dual_shield',
        tier: 'normal',
        label: '双色盾普通怪',
        attackDamage: 0.5,
        initialCountdown: 4,
        bars: Object.freeze([
          Object.freeze({
            maxHp: 10000,
            shields: Object.freeze([
              Object.freeze({ color: 'red', max: 3 }),
              Object.freeze({ color: 'blue', max: 3 }),
            ]),
            traits: Object.freeze([]),
          }),
        ]),
      }),
    ]),
  }),

  recorded_damage_down: Object.freeze({
    id: 'recorded_damage_down',
    stage1Core: true,
    layer: 1,
    label: '集色减伤普通怪',
    summary: '1 条血，回合开始每集到 1 色少受 10% 伤害；试集色与出伤取舍',
    recommendedPreset: 'tier_c',
    monsters: Object.freeze([
      Object.freeze({
        uid: 'm-rec-1',
        defId: 'monster_recorded_down',
        tier: 'normal',
        label: '集色减伤普通怪',
        attackDamage: 0.5,
        initialCountdown: 4,
        bars: Object.freeze([
          Object.freeze({
            maxHp: 10000,
            shields: Object.freeze([
              Object.freeze({ color: 'green', max: 4 }),
            ]),
            traits: Object.freeze([
              Object.freeze({
                id: 'trait_dim_per_recorded',
                label: '回合开始每集 1 色少受 10% 伤害',
                effects: Object.freeze([
                  Object.freeze({
                    timing: TIMINGS.PASSIVE,
                    action: ACTIONS.MODIFY_RULE,
                    duration: ACTION_DURATIONS.THIS_BATTLE,
                    params: Object.freeze({ ruleKey: 'damageReductionPerRecordedColor', value: 0.1 }),
                  }),
                ]),
              }),
            ]),
          }),
        ]),
      }),
    ]),
  }),

  fast_countdown: Object.freeze({
    id: 'fast_countdown',
    stage1Core: true,
    layer: 1,
    label: '倒计时短普通怪',
    summary: '1 条血，初始倒计时只有 2；试抢杀、破盾推条或防守',
    recommendedPreset: 'tier_c',
    monsters: Object.freeze([
      Object.freeze({
        uid: 'm-fast-1',
        defId: 'monster_fast_countdown',
        tier: 'normal',
        label: '倒计时短普通怪',
        attackDamage: 0.5,
        initialCountdown: 2,
        bars: Object.freeze([
          Object.freeze({
            maxHp: 8500,
            shields: Object.freeze([
              Object.freeze({ color: 'red', max: 4 }),
            ]),
            traits: Object.freeze([
              Object.freeze({
                id: 'trait_fast_cd',
                label: '倒计时只有 2 回合',
                effects: Object.freeze([]),
              }),
            ]),
          }),
        ]),
      }),
    ]),
  }),

  pack_mixed: Object.freeze({
    id: 'pack_mixed',
    stage1Core: true,
    layer: 1,
    label: '一群怪（1 厚 2 薄）',
    summary: '1 只血厚带单色盾 + 2 只血少、倒计时 2 的小怪；试选目标、溢出、单攻与群攻',
    recommendedPreset: 'tier_c',
    monsters: Object.freeze([
      Object.freeze({
        uid: 'm-pack-tank',
        defId: 'monster_pack_heavy',
        tier: 'normal',
        label: '血厚单色盾怪',
        attackDamage: 0.5,
        initialCountdown: 4,
        bars: Object.freeze([
          Object.freeze({
            maxHp: 9000,
            shields: Object.freeze([
              Object.freeze({ color: 'blue', max: 4 }),
            ]),
            traits: Object.freeze([]),
          }),
        ]),
      }),
      Object.freeze({
        uid: 'm-pack-small-1',
        defId: 'monster_pack_small',
        tier: 'normal',
        label: '血少快攻小怪 A',
        attackDamage: 0.5,
        initialCountdown: 2,
        bars: Object.freeze([
          Object.freeze({
            maxHp: 2200,
            shields: Object.freeze([]),
            traits: Object.freeze([
              Object.freeze({ id: 'trait_small_fast_1', label: '血少、2 回合出手', effects: Object.freeze([]) }),
            ]),
          }),
        ]),
      }),
      Object.freeze({
        uid: 'm-pack-small-2',
        defId: 'monster_pack_small',
        tier: 'normal',
        label: '血少快攻小怪 B',
        attackDamage: 0.5,
        initialCountdown: 2,
        bars: Object.freeze([
          Object.freeze({
            maxHp: 2200,
            shields: Object.freeze([]),
            traits: Object.freeze([
              Object.freeze({ id: 'trait_small_fast_2', label: '血少、2 回合出手', effects: Object.freeze([]) }),
            ]),
          }),
        ]),
      }),
    ]),
  }),

  gatekeeper_layer2: Object.freeze({
    id: 'gatekeeper_layer2',
    stage1Core: true,
    layer: 2,
    label: '看门的（3 条血换特性）',
    summary: '3 条血各 20000，每条换特性：盾每回合换色 → 每次出手清空集色 → 被破盾倒计时 -1',
    recommendedPreset: 'tier_b',
    monsters: Object.freeze([
      Object.freeze({
        uid: 'm-gate-1',
        defId: 'monster_gatekeeper_outer',
        tier: 'gatekeeper',
        label: '外头区看门的',
        attackDamage: 0.5,
        initialCountdown: 4,
        bars: Object.freeze([
          Object.freeze({
            maxHp: 20000,
            shields: Object.freeze([
              Object.freeze({ color: 'red', max: 7 }),
            ]),
            traits: Object.freeze([
              Object.freeze({
                id: 'trait_shift_shield',
                label: '每回合盾换一种颜色',
                effects: Object.freeze([
                  Object.freeze({
                    timing: TIMINGS.TURN_START,
                    action: ACTIONS.CHANGE_SHIELD_COLOR,
                    duration: ACTION_DURATIONS.INSTANT,
                    params: Object.freeze({ mode: 'rotate' }),
                  }),
                ]),
              }),
            ]),
          }),
          Object.freeze({
            maxHp: 20000,
            shields: Object.freeze([
              Object.freeze({ color: 'green', max: 7 }),
            ]),
            traits: Object.freeze([
              Object.freeze({
                id: 'trait_clear_recorded',
                label: '每次出手清空集到的颜色',
                effects: Object.freeze([
                  Object.freeze({
                    timing: TIMINGS.ON_MONSTER_ATTACK,
                    action: ACTIONS.CLEAR_RECORDED_COLORS,
                    duration: ACTION_DURATIONS.INSTANT,
                    params: Object.freeze({}),
                  }),
                ]),
              }),
            ]),
          }),
          Object.freeze({
            maxHp: 20000,
            shields: Object.freeze([
              Object.freeze({ color: 'blue', max: 7 }),
            ]),
            traits: Object.freeze([
              Object.freeze({
                id: 'trait_reverse_break',
                label: '每被破一次盾，倒计时 -1',
                effects: Object.freeze([
                  Object.freeze({
                    timing: TIMINGS.PASSIVE,
                    action: ACTIONS.MODIFY_RULE,
                    duration: ACTION_DURATIONS.THIS_BATTLE,
                    params: Object.freeze({ ruleKey: 'shieldBreakCountdownDelta', value: -1 }),
                  }),
                ]),
              }),
            ]),
          }),
        ]),
      }),
    ]),
  }),

  // 以下 2 种来自设计稿 5.8 另两场原型仗，方便后续随时试打
  halve_one_color: Object.freeze({
    id: 'halve_one_color',
    stage1Core: false,
    layer: 1,
    label: '挑色减半普通怪',
    summary: '1 条血，每回合挑色环上 1 色，该色牌打它伤害减半（白不被挑中）',
    recommendedPreset: 'tier_c',
    monsters: Object.freeze([
      Object.freeze({
        uid: 'm-halve-1',
        defId: 'monster_halve_color',
        tier: 'normal',
        label: '挑色减半普通怪',
        attackDamage: 0.5,
        initialCountdown: 4,
        bars: Object.freeze([
          Object.freeze({
            maxHp: 10000,
            shields: Object.freeze([
              Object.freeze({ color: 'blue', max: 4 }),
            ]),
            traits: Object.freeze([
              Object.freeze({
                id: 'trait_halve_color',
                label: '每回合挑一色牌伤害减半',
                effects: Object.freeze([
                  Object.freeze({
                    timing: TIMINGS.TURN_START,
                    action: ACTIONS.MODIFY_RULE,
                    duration: ACTION_DURATIONS.THIS_TURN,
                    params: Object.freeze({ ruleKey: 'halveRandomRingColor', value: 0.5 }),
                  }),
                ]),
              }),
            ]),
          }),
        ]),
      }),
    ]),
  }),

  elite_ignore_first_hits: Object.freeze({
    id: 'elite_ignore_first_hits',
    stage1Core: false,
    layer: 1,
    label: '精英（前 N 发不掉血）',
    summary: '2 条血各 7500，打一下掉 1 颗心；每回合前 12 发不掉血',
    recommendedPreset: 'tier_c',
    monsters: Object.freeze([
      Object.freeze({
        uid: 'm-elite-1',
        defId: 'monster_elite_first_hits',
        tier: 'elite',
        label: '前 12 发不掉血精英',
        attackDamage: 1,
        initialCountdown: 4,
        bars: Object.freeze([
          Object.freeze({
            maxHp: 7500,
            shields: Object.freeze([
              Object.freeze({ color: 'red', max: 6 }),
            ]),
            traits: Object.freeze([
              Object.freeze({
                id: 'trait_ignore_12_bar1',
                label: '每回合前 12 发不掉血',
                effects: Object.freeze([
                  Object.freeze({
                    timing: TIMINGS.PASSIVE,
                    action: ACTIONS.MODIFY_RULE,
                    duration: ACTION_DURATIONS.THIS_BATTLE,
                    params: Object.freeze({ ruleKey: 'ignoreFirstHitsPerTurn', value: 12 }),
                  }),
                ]),
              }),
            ]),
          }),
          Object.freeze({
            maxHp: 7500,
            shields: Object.freeze([
              Object.freeze({ color: 'green', max: 6 }),
            ]),
            traits: Object.freeze([
              Object.freeze({
                id: 'trait_ignore_12_bar2',
                label: '每回合前 12 发不掉血',
                effects: Object.freeze([
                  Object.freeze({
                    timing: TIMINGS.PASSIVE,
                    action: ACTIONS.MODIFY_RULE,
                    duration: ACTION_DURATIONS.THIS_BATTLE,
                    params: Object.freeze({ ruleKey: 'ignoreFirstHitsPerTurn', value: 12 }),
                  }),
                ]),
              }),
            ]),
          }),
        ]),
      }),
    ]),
  }),
});

export const STAGE1_CORE_ENCOUNTERS = Object.freeze(
  Object.values(ENCOUNTERS).filter((e) => e.stage1Core),
);

export const ALL_ENCOUNTERS = Object.freeze(Object.values(ENCOUNTERS));

/**
 * 试打时的玩家装备/属性档位预设（严格对照设计稿 9.2 第 3 版）：
 * - tier_free：工会免费基础装备（攻击 40，打第 1 层普通怪约 4 回合多，会挨一下）
 * - tier_c：第 1 层 C 级商店装备（攻击 80，增伤 0%，单发均约 60）
 * - tier_b：第 2 层 B 级装备 + 层 2 局内成长（攻击 140，增伤 +30%，单发均约 120~140，用于试打看门的）
 */
export const PLAYER_PRESETS = Object.freeze({
  tier_free: Object.freeze({
    id: 'tier_free',
    label: '免费基础装（攻 40）',
    stats: Object.freeze({ attack: 40, damageBonus: 0, critRate: 0.1, critDamage: 1.5 }),
    drawTarget: 4,
    hearts: 3,
    maxHearts: 3,
  }),
  tier_c: Object.freeze({
    id: 'tier_c',
    label: 'C 级装备（攻 80）',
    stats: Object.freeze({ attack: 80, damageBonus: 0, critRate: 0.1, critDamage: 1.5 }),
    drawTarget: 4,
    hearts: 3,
    maxHearts: 3,
  }),
  tier_b: Object.freeze({
    id: 'tier_b',
    label: 'B 级装备（攻 140，增伤 +30%）',
    stats: Object.freeze({ attack: 140, damageBonus: 0.3, critRate: 0.15, critDamage: 1.8 }),
    drawTarget: 4,
    hearts: 3,
    maxHearts: 3,
  }),
});
