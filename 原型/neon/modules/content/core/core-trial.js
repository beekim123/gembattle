// 核心试玩（设计稿 10.4，用户 2026-11-24 定的；做法见 设计/做原型的方法.md）：
// 只有 29 张宝石牌，连着打 10 只怪，一只比一只难。心不回，掉完就输，输了从第 1 只重来。
// 没有功能牌、加成、队友、装备、奖励、商店。主角属性固定（C 级装备那档）。
// 这一轮只回答一个问题：每回合排链有没有值得想的取舍，打完想不想再来？
// 怪先从没特性的打起，一只只加特性；hpScale 是血量倍数（看门的本来是给 B 级装备打的，所以打折）。

export const CORE_TRIAL = Object.freeze({
  presetId: 'tier_c',
  hearts: 3,
  // 核心试玩不给「自动排」：要自己想怎么排
  rulesConfig: Object.freeze({ allowAutoArrange: false }),
  fights: Object.freeze([
    Object.freeze({ encounterId: 'dual_shield', hpScale: 0.7 }),
    Object.freeze({ encounterId: 'dual_shield', hpScale: 1.0 }),
    Object.freeze({ encounterId: 'fast_countdown', hpScale: 1.0 }),
    Object.freeze({ encounterId: 'recorded_damage_down', hpScale: 1.0 }),
    Object.freeze({ encounterId: 'pack_mixed', hpScale: 1.1 }),
    Object.freeze({ encounterId: 'halve_one_color', hpScale: 1.3 }),
    Object.freeze({ encounterId: 'elite_ignore_first_hits', hpScale: 1.4 }),
    Object.freeze({ encounterId: 'pack_mixed', hpScale: 1.5 }),
    Object.freeze({ encounterId: 'fast_countdown', hpScale: 1.7 }),
    Object.freeze({ encounterId: 'gatekeeper_layer2', hpScale: 0.7 }),
  ]),
});
