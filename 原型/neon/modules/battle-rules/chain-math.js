// 色环接链、集色与彩虹的纯计算辅助函数（严格对齐用户原型 5494227 与设计稿第 3 版 5.2）。

import {
  CHAIN_RELATIONS,
  COLOR_META,
  COLOR_RING,
  isRingColor,
} from '../shared/index.js';

/**
 * 解析一张牌排进当前链时实际生效的颜色与宝石组成。
 * - adaptive（变成当前色的补色）：若当前色在 6 色环上，变为其补色并带该色宝石；
 *   若没有当前色或当前色是白，则变为白牌（带红绿蓝 3 颗宝石）。
 */
export function resolveCardForChain(card, currentColor) {
  if (!card) return null;
  if (card.color === 'adaptive') {
    if (currentColor && isRingColor(currentColor)) {
      const targetColor = COLOR_META[currentColor].opposite;
      const meta = COLOR_META[targetColor];
      return {
        color: targetColor,
        gems: [...meta.gems],
        isWhite: false,
      };
    }
    return {
      color: 'white',
      gems: [...COLOR_META.white.gems],
      isWhite: true,
    };
  }
  return {
    color: card.color,
    gems: Array.isArray(card.gems) ? [...card.gems] : [],
    isWhite: card.color === 'white',
  };
}

/**
 * 计算某张牌（给定解析后的颜色或牌对象）相对当前链尾色的接链关系。
 */
export function computeChainRelation(cardOrColor, currentColor) {
  const color = typeof cardOrColor === 'string'
    ? cardOrColor
    : resolveCardForChain(cardOrColor, currentColor)?.color;

  if (!color || color === 'colorless') return CHAIN_RELATIONS.INSTANT;
  if (currentColor === null || currentColor === undefined) return CHAIN_RELATIONS.START;
  if (currentColor === 'white' || color === 'white') return CHAIN_RELATIONS.CONNECT;

  const idxA = COLOR_META[currentColor]?.ringIndex;
  const idxB = COLOR_META[color]?.ringIndex;
  if (idxA === null || idxA === undefined || idxB === null || idxB === undefined) {
    return CHAIN_RELATIONS.BREAK;
  }

  const diff = Math.abs(idxA - idxB);
  const dist = Math.min(diff, COLOR_RING.length - diff);
  if (dist === 0 || dist === 1) return CHAIN_RELATIONS.CONNECT;
  if (dist === 3) return CHAIN_RELATIONS.COMPLEMENT;
  return CHAIN_RELATIONS.BREAK;
}

/**
 * 推进集色状态，并判断这张带色牌是否触发彩虹（一条链最多一次彩虹）。
 * 照原型 5494227 与第 3 版 5.2：
 * - 断色、补色会先清空集色，再记下这一色；
 * - 白牌不算集色，但如果之前已靠「记两边」攒满 6 色，打出白牌也会触发彩虹；
 * - 触发彩虹后，集色重置为当前这一色（白则清空）。
 */
export function advanceRecordedColors(recordedSet, resolvedColor, relation, rainbowAlreadyTriggered, keepRecordedOnReset = false) {
  // 第 5 个参数：老的写法是布尔（断色、补色都不清空）；加成用对象：
  // { keepAll, keepOnComplement（合白不清空）, keepOnBreak（断色不清空）, rainbowKeepNeighbors（彩虹以后留这一色和两边）}
  const opt = typeof keepRecordedOnReset === 'object' && keepRecordedOnReset !== null ? keepRecordedOnReset : { keepAll: Boolean(keepRecordedOnReset) };
  const next = new Set(recordedSet);

  const clears = (relation === CHAIN_RELATIONS.BREAK && !opt.keepOnBreak) || (relation === CHAIN_RELATIONS.COMPLEMENT && !opt.keepOnComplement);
  if (!opt.keepAll && clears) {
    next.clear();
  }
  if (isRingColor(resolvedColor)) {
    next.add(resolvedColor);
  }

  let triggeredRainbow = false;
  if (!rainbowAlreadyTriggered && next.size >= COLOR_RING.length) {
    triggeredRainbow = true;
    next.clear();
    if (isRingColor(resolvedColor)) {
      next.add(resolvedColor);
      if (opt.rainbowKeepNeighbors) {
        const i = COLOR_RING.indexOf(resolvedColor);
        next.add(COLOR_RING[(i + 1) % COLOR_RING.length]);
        next.add(COLOR_RING[(i + COLOR_RING.length - 1) % COLOR_RING.length]);
      }
    }
  }

  return { nextRecorded: next, triggeredRainbow };
}

/**
 * 「记两边颜色」算法（照原型 lightNeighbors）：
 * - 当前色在 6 色环上时，依次查看顺时针与逆时针邻色；
 * - 起色或当前色为白时，从红起按色环顺着记未集到的最多 count 色。
 */
export function pickColorsToRecord(recordedSet, currentColor, mode = 'neighbors', count = 2, specificColor = null) {
  const added = [];
  if (mode === 'specific') {
    if (specificColor && isRingColor(specificColor) && !recordedSet.has(specificColor)) {
      added.push(specificColor);
    }
    return added;
  }

  let candidates;
  if (mode === 'neighbors' && currentColor && isRingColor(currentColor)) {
    const idx = COLOR_META[currentColor].ringIndex;
    candidates = [
      COLOR_RING[(idx + 1) % COLOR_RING.length],
      COLOR_RING[(idx + COLOR_RING.length - 1) % COLOR_RING.length],
    ];
  } else {
    candidates = [...COLOR_RING];
  }

  for (const c of candidates) {
    if (added.length >= count) break;
    if (!recordedSet.has(c)) {
      added.push(c);
    }
  }
  return added;
}

/** 宝石升级所需经验（照原型：level * 10） */
export function gemLevelThreshold(level) {
  return Math.max(1, level) * 10;
}

/** 宝石等级每发增伤系数（第 3 版 5.3：每级 +10%，1 级为 1.0） */
export function gemLevelMultiplier(level) {
  return 1 + 0.1 * Math.max(0, (level || 1) - 1);
}
