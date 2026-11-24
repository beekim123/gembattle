// 一仗开打时的初始状态：默认规则开关、牌和怪的状态怎么从开战包里建出来（纯函数，不碰 engine 里的变量）。

import { ACTIONS, TIMINGS, RULE_KEYS } from '../shared/index.js';

export const DEFAULT_CFG = Object.freeze({
  // 第 4 版 5.1（用户定的）：每回合先摸 2 张，不到 N 补到 N；回合开始手里最多 N + 2 张
  drawMode: 'draw_floor',
  drawPerTurn: 2,
  handOverN: 2,
  freeKeepCount: 0,
  shieldActiveMultiplier: 0.75,
  shieldBrokenMultiplier: 1.5,
  shieldBreakPush: 1,
  initialCountdown: 4,
  maxHandSize: 12,
  showExactDamage: true,
});

export function cloneCard(card) {
  return {
    uid: card.uid,
    defId: card.defId,
    kind: card.kind,
    usage: card.usage,
    color: card.color,
    gems: [...card.gems],
    enhanced: Boolean(card.enhanced),
    enhance: card.enhance ? { ...card.enhance } : null, // 宝石强化的方向（6.3）：pain / more / shred / record
    drawAfterPlay: card.drawAfterPlay ?? 0,
    label: card.label || card.defId,
    description: card.description || '',
    effects: Array.isArray(card.effects)
      ? card.effects.map((ef) => ({
          timing: ef.timing,
          action: ef.action,
          ...(ef.duration ? { duration: ef.duration } : {}),
          ...(ef.condition ? { condition: { ...ef.condition } } : {}),
          params: { ...(ef.params || {}) },
        }))
      : [],
    hidden: false,
  };
}

export function buildMonsterState(spec) {
  const firstBar = spec.bars[0];
  return {
    uid: spec.uid,
    defId: spec.defId,
    tier: spec.tier,
    label: spec.label,
    look: spec.look || null,
    alive: true,
    attackDamage: spec.attackDamage,
    initialCountdown: spec.initialCountdown,
    countdown: spec.initialCountdown,
    attacksDone: 0,
    queuedAttackThisTurn: false,
    bars: spec.bars.map((bar) => ({
      maxHp: bar.maxHp,
      shields: bar.shields.map((s) => ({ color: s.color, max: s.max })),
      traits: bar.traits.map((t) => ({
        id: t.id,
        label: t.label,
        effects: t.effects.map((ef) => ({ ...ef, params: { ...(ef.params || {}) } })),
      })),
    })),
    barIndex: 0,
    hp: firstBar.maxHp,
    maxHp: firstBar.maxHp,
    shields: firstBar.shields.map((s) => ({ color: s.color, current: s.max, max: s.max })),
    shieldBroken: firstBar.shields.length === 0 ? false : false,
    // 当前血条内的回合动态状态
    turnHalvedColor: null,
    turnIgnoredHitsLeft: 0,
  };
}

export function getMonsterPassiveRule(monster, ruleKey) {
  const bar = monster.bars[monster.barIndex];
  if (!bar) return null;
  for (const tr of bar.traits) {
    for (const ef of tr.effects) {
      if (ef.timing === TIMINGS.PASSIVE && ef.action === ACTIONS.MODIFY_RULE && ef.params?.ruleKey === ruleKey) {
        return ef.params.value;
      }
    }
  }
  return null;
}

export function initBarTurnCounters(monster) {
  const ignoreN = getMonsterPassiveRule(monster, RULE_KEYS.ignoreFirstHitsPerTurn);
  monster.turnIgnoredHitsLeft = typeof ignoreN === 'number' && ignoreN > 0 ? Math.floor(ignoreN) : 0;
  monster.turnHalvedColor = null;
}
