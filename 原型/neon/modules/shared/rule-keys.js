// 「改规则」动作（ACTIONS.MODIFY_RULE）能改的规则，全列在这（设计稿 5.9：「改规则」也是一种动作）。
// 加成、装备、怪的特性要改规则，就在 params.ruleKey 里写这里的一个名字；battle-rules 照名字查开没开。
// 加一种新的「改规则」：这里加一行、battle-rules 里照它改算法、content 里用它（设计稿 10.2 第 8 条）。

/** 名字 → 干什么（值是开关的给 true，是数的给数） */
export const RULE_KEY_LABELS = Object.freeze({
  // 加成（设计稿 9.3）
  complementKeepsRecorded: '合白不清空集到的颜色',
  rainbowKeepsNeighbors: '彩虹以后留下这一色和两边，一共 3 色',
  firstBreakStillDoubles: '每条链第一次断色，照样 ×2',
  firstMatchExtraShred: '每条链第一张对色的牌，每颗宝石多削 1 格',
  brokenMultiplier: '破盾以后受到的伤害倍数（数）',
  noBreakPush: '破盾不推倒计时',
  breakWhiteAtChainEnd: '这回合破过盾，链打完时按链尾的倍率给所有怪补一轮白（不削盾）',
  complementExtraRound: '合白多打的那一轮再多打一轮',
  complementBonusDraw: '一条链里合白 2 次，下回合多 1 张（不到 N + 1 补到 N + 1）',
  breakKeepsRecorded: '断色不清空集到的颜色',
  extraFreeKeep: '回合开始的手牌上限多几张（数）',
  keptStartsDouble: '回合结束手里留着牌，下回合的链从 ×2 起',
  rainbowExtraRepeat: '彩虹再打的两遍变三遍',
  keepRecordedColors: '这回合合白、断色都不清空集到的颜色（以后的功能牌用）',
  // 装备
  rainbowHitBonus: '彩虹那两遍每发多几成（数）',
  // 怪的特性（设计稿 5.8）
  damageReductionPerRecordedColor: '回合开始时集到几色，就少受几成伤害（数）',
  ignoreFirstHitsPerTurn: '每回合挨的前几发不掉血（数）',
  shieldBreakCountdownDelta: '被破盾时倒计时改成拨几格（数，负的是往前拨）',
  halveRandomRingColor: '每回合挑一种颜色，这色的牌打它伤害减半',
});

/** 写代码用：RULE_KEYS.noBreakPush === 'noBreakPush'，写错名字会是 undefined，单测查得出来 */
export const RULE_KEYS = Object.freeze(Object.fromEntries(Object.keys(RULE_KEY_LABELS).map((k) => [k, k])));
export const RULE_KEY_LIST = Object.freeze(Object.keys(RULE_KEY_LABELS));
