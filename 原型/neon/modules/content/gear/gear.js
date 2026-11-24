// 12 件装备（C 级 9 件、B 级 3 件）+ 一套免费的（设计稿 8.1、9.2，具体的数定在 9.3；当初的候选在 记录/给用户挑-阶段2到4.md F2）。
// stats 是加在主角底子上的；trait 是装备的小特性（一个弱一点的加成，写成「时机 + 动作」）。

import { ACTIONS, TIMINGS, RULE_KEYS } from '../../shared/index.js';

/** 主角底子（9.2：攻击 30） */
export const HERO_BASE = Object.freeze({ attack: 30, damageBonus: 0, critRate: 0.1, critDamage: 1.5, hearts: 3, drawTarget: 4 });

export const GEAR_DEFS = Object.freeze({
  // 工会免费借，不会坏，不带小特性
  gear_free_weapon: Object.freeze({ id: 'gear_free_weapon', slot: 'weapon', grade: 'free', free: true, label: '基础武器', price: 0, uses: null, stats: { attack: 10 } }),

  gear_c_weapon_1: Object.freeze({ id: 'gear_c_weapon_1', slot: 'weapon', grade: 'C', label: '武器：攻击 +50', price: 85, uses: 7, stats: { attack: 50 } }),
  gear_c_weapon_2: Object.freeze({ id: 'gear_c_weapon_2', slot: 'weapon', grade: 'C', label: '武器：攻击 +45，暴击 +15%', price: 90, uses: 7, stats: { attack: 45, critRate: 0.15 } }),
  gear_c_weapon_3: Object.freeze({
    id: 'gear_c_weapon_3', slot: 'weapon', grade: 'C', label: '武器：攻击 +45，破盾后暴击 +35%', price: 95, uses: 7, stats: { attack: 45 },
    // 第 6 版：原来「破盾那一下暴击率 +20%」，算下来比武器 1 还弱；改成破盾以后这条链剩下的都 +35%
    trait: { label: '破盾以后这条链暴击率 +35%', effects: [{ timing: TIMINGS.ON_SHIELD_BREAK, action: ACTIONS.MODIFY_HIT_DAMAGE, duration: 'this_chain', params: { stat: 'critRate', value: 0.35 } }] },
  }),
  gear_c_armor_1: Object.freeze({ id: 'gear_c_armor_1', slot: 'armor', grade: 'C', label: '护身：心上限 +½', price: 70, uses: 7, stats: { hearts: 0.5 } }),
  gear_c_armor_2: Object.freeze({ id: 'gear_c_armor_2', slot: 'armor', grade: 'C', label: '护身：心上限 +1', price: 95, uses: 7, stats: { hearts: 1 } }),
  gear_c_armor_3: Object.freeze({
    id: 'gear_c_armor_3', slot: 'armor', grade: 'C', label: '护身：每仗先挡一次', price: 85, uses: 7, stats: {},
    trait: { label: '每仗开打先挡一次', effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.ADD_BLOCK, duration: 'until_consumed', params: { count: 1 } }] },
  }),
  gear_c_trinket_1: Object.freeze({ id: 'gear_c_trinket_1', slot: 'trinket', grade: 'C', label: '饰品：增伤 +15%', price: 75, uses: 7, stats: { damageBonus: 0.15 } }),
  gear_c_trinket_2: Object.freeze({ id: 'gear_c_trinket_2', slot: 'trinket', grade: 'C', label: '饰品：暴击 +5%，暴伤 +0.4', price: 75, uses: 7, stats: { critRate: 0.05, critDamage: 0.4 } }),
  gear_c_trinket_3: Object.freeze({
    id: 'gear_c_trinket_3', slot: 'trinket', grade: 'C', label: '饰品：增伤 +10%，彩虹每发 +20%', price: 90, uses: 7, stats: { damageBonus: 0.1 },
    trait: { label: '彩虹那两遍每发 +20%', effects: [{ timing: TIMINGS.BATTLE_START, action: ACTIONS.MODIFY_RULE, duration: 'this_battle', params: { ruleKey: RULE_KEYS.rainbowHitBonus, value: 0.2 } }] },
  }),

  // B 级（第 6 版，第 3 轮审核补的）：到了 B 级才上架，数大一档
  gear_b_weapon_1: Object.freeze({ id: 'gear_b_weapon_1', slot: 'weapon', grade: 'B', label: '武器：攻击 +110', price: 260, uses: 7, stats: { attack: 110 } }),
  gear_b_armor_1: Object.freeze({ id: 'gear_b_armor_1', slot: 'armor', grade: 'B', label: '护身：心上限 +1½', price: 240, uses: 7, stats: { hearts: 1.5 } }),
  gear_b_trinket_1: Object.freeze({ id: 'gear_b_trinket_1', slot: 'trinket', grade: 'B', label: '饰品：增伤 +30%', price: 250, uses: 7, stats: { damageBonus: 0.3 } }),
});

export const GEAR_LIST = Object.freeze(Object.values(GEAR_DEFS));
export const FREE_GEAR = Object.freeze({ weapon: 'gear_free_weapon', armor: null, trinket: null });
