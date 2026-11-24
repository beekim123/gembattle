// 原型只有一个地点：森林的外头区（第 1、2 层 + 看门的）。数照设计稿 7.3、9.2。
// 候选和倾向见 原型/neon/给用户挑-阶段2到4.md 的 E 段（claude 先照倾向做，用户可改）。

export const FOREST = Object.freeze({
  id: 'forest',
  label: '森林·外头区',
  gatekeeper: 'gatekeeper_layer2',
  layers: Object.freeze({
    1: Object.freeze({
      clearings: [2, 3], // 每层 2~3 片
      hpScale: 1,
      eliteHpScale: 1,
      normal: ['dual_shield', 'recorded_damage_down', 'fast_countdown', 'halve_one_color'],
      pack: ['pack_mixed'],
      elite: ['elite_ignore_first_hits'],
      kindWeights: { normal: 6, pack: 2, elite: 1.2, rest: 1, event: 1 },
      goldPerFight: 10,
    }),
    2: Object.freeze({
      clearings: [2, 3],
      hpScale: 2.5, // 同一区里两层差 2~3 倍（9.2：1 万 → 2.5 万）
      eliteHpScale: 15000 / 7500, // 阶段 4 调过（用户 2026-11-23 按倾向定）：每条 2 万 → 1.5 万
      normal: ['dual_shield', 'recorded_damage_down', 'fast_countdown', 'halve_one_color'],
      pack: ['pack_mixed'],
      elite: ['elite_ignore_first_hits'],
      kindWeights: { normal: 6, pack: 2, elite: 1.2, rest: 1, event: 1 },
      goldPerFight: 30,
    }),
  }),
  hiddenChance: 0.35,
  smallEventChance: 0.2,
  hiddenQuestChance: 0.35,
  hiddenGold: [10, 20],
  rewards: Object.freeze({
    stat: Object.freeze({ attack: 15, damageBonus: 0.15, critRate: 0.1, critDamage: 0.3 }),
    gold: [15, 25],
    heal: 1,
    drawPlusMax: 2,
    drawPlusChance: 0.15,
    eliteBonusGold: 20,
  }),
});

export const ZONES = Object.freeze({ forest: FOREST });
