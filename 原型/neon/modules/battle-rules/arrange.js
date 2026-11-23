// 自动帮排算法（设计稿 10.4 第 3 版明确要求放在 battle-rules 里）：
// 支持 3 种策略：
// - longest：按最长的链 / 最大发数（预期伤害最高）排
// - break_first：先排能削目标盾的牌尽早破盾，再把大牌排在破盾后吃 ×1.5
// - rainbow：尽量凑齐 6 色触发彩虹

import { ACTIONS, CHAIN_RELATIONS } from '../shared/index.js';
import { advanceRecordedColors, computeChainRelation, resolveCardForChain } from './chain-math.js';

function hasMultX2Effect(card) {
  return Array.isArray(card.effects) && card.effects.some((ef) => ef.action === ACTIONS.MODIFY_MULTIPLIER);
}

/**
 * 轻量模拟一条候选排列的得分，用于搜索最优顺序。
 */
function evaluateSequence(seq, context, strategy) {
  let cursor = context.currentColor;
  let recorded = new Set(context.recordedColors);
  let mult = 1;
  let rainbow = false;
  let score = 0;

  // 克隆目标盾状态用于评估破盾时机（按第 3 版：先打当前牌，再削盾；下张牌吃破盾倍率）
  const shields = context.targetShields.map((s) => ({ color: s.color, current: s.current }));
  let shieldBroken = context.targetShieldBroken;
  const hasShield = shields.length > 0;
  let brokenAtStep = -1;

  const activeMult = context.shieldActiveMultiplier;
  const brokenMult = context.shieldBrokenMultiplier;
  const enemyCount = Math.max(1, context.aliveMonsterCount);

  let totalWeightedHits = 0;
  let shieldShredTotal = 0;

  for (let i = 0; i < seq.length; i++) {
    const card = seq[i];
    const resolved = resolveCardForChain(card, cursor);
    const rel = computeChainRelation(resolved.color, cursor);

    if (rel === CHAIN_RELATIONS.CONNECT || rel === CHAIN_RELATIONS.COMPLEMENT) {
      mult *= 2;
    }

    const dmgScale = !hasShield ? 1 : (shieldBroken ? brokenMult : activeMult);
    const colorHalve = (context.targetHalvedColor && resolved.color === context.targetHalvedColor) ? 0.5 : 1;

    // 宝石发数（白牌为群攻乘敌人数）
    const targetFactor = resolved.isWhite ? enemyCount : 1;
    let stepHits = resolved.gems.length * mult * targetFactor;
    // 合白多打一轮白色群攻（3 颗宝石 × 倍率 × 存活敌人数）
    if (rel === CHAIN_RELATIONS.COMPLEMENT) {
      stepHits += 3 * mult * enemyCount;
    }

    totalWeightedHits += stepHits * dmgScale * colorHalve;

    // 破盾判定：只有宝石削盾（合白那一轮不削盾）
    if (hasShield && !shieldBroken) {
      for (const gem of resolved.gems) {
        for (const sh of shields) {
          if (sh.color === gem && sh.current > 0) {
            sh.current--;
            shieldShredTotal++;
          }
        }
      }
      if (shields.every((sh) => sh.current <= 0)) {
        shieldBroken = true;
        brokenAtStep = i;
      }
    }

    // 倍率 ×2 蓝牌：打完这张牌后再 ×2
    if (hasMultX2Effect(card)) {
      mult *= 2;
    }

    // 集色与彩虹
    const adv = advanceRecordedColors(recorded, resolved.color, rel, rainbow);
    recorded = adv.nextRecorded;
    if (adv.triggeredRainbow) rainbow = true;
    cursor = resolved.color;
  }

  // 彩虹再打两遍（吃当前破盾状态与全体存活怪）
  if (rainbow) {
    const finalScale = !hasShield ? 1 : (shieldBroken ? brokenMult : activeMult);
    totalWeightedHits += totalWeightedHits * 2 * (finalScale / Math.max(0.5, activeMult)) * 0.5 + totalWeightedHits * 1.5;
  }

  if (strategy === 'break_first') {
    // 强优先：只要能破盾，越早破盾分越高，破盾后高发数自然赚取 ×1.5
    const breakBonus = brokenAtStep >= 0
      ? 1_000_000 + (seq.length - brokenAtStep) * 10_000
      : shieldShredTotal * 500;
    score = breakBonus + totalWeightedHits;
  } else if (strategy === 'rainbow') {
    const rainbowBonus = rainbow ? 2_000_000 : recorded.size * 50_000;
    score = rainbowBonus + totalWeightedHits;
  } else {
    // longest / 最高发数伤害
    score = totalWeightedHits + (rainbow ? 500 : 0);
  }

  return score;
}

/**
 * 在给定的可排链手牌列表中寻找最优排法，返回按顺序排好的 card 数组。
 * - <= 7 张时精确全排列（同签名去重剪枝，极快）
 * - > 7 张时用束搜索（Beam Search）防止组合爆炸
 */
export function findBestChainOrder(chainableCards, context, strategy = 'longest') {
  if (!Array.isArray(chainableCards) || chainableCards.length <= 1) {
    return chainableCards ? chainableCards.slice() : [];
  }

  // 把被遮住的牌固定放到最后，不参与按颜色优化（规则上不能偷看被遮住牌的真实颜色！）
  const visible = chainableCards.filter((c) => !c.hidden);
  const hidden = chainableCards.filter((c) => c.hidden);

  if (visible.length <= 1) {
    return [...visible, ...hidden];
  }

  let bestSeq = visible.slice();
  let bestScore = -Infinity;

  if (visible.length <= 7) {
    const used = new Array(visible.length).fill(false);
    const current = [];

    function dfs() {
      if (current.length === visible.length) {
        const s = evaluateSequence(current, context, strategy);
        if (s > bestScore) {
          bestScore = s;
          bestSeq = current.slice();
        }
        return;
      }
      // 同一层里同颜色同功能的牌只试一次，极大剪枝
      const triedKeys = new Set();
      for (let i = 0; i < visible.length; i++) {
        if (used[i]) continue;
        const key = `${visible[i].color}|${visible[i].defId}`;
        if (triedKeys.has(key)) continue;
        triedKeys.add(key);

        used[i] = true;
        current.push(visible[i]);
        dfs();
        current.pop();
        used[i] = false;
      }
    }

    dfs();
  } else {
    // 超过 7 张使用 Beam Search（束宽 48）
    const BEAM_WIDTH = 48;
    let beam = [{ seq: [], remaining: visible }];

    for (let depth = 0; depth < visible.length; depth++) {
      const candidates = [];
      for (const node of beam) {
        const triedKeys = new Set();
        for (let i = 0; i < node.remaining.length; i++) {
          const card = node.remaining[i];
          const key = `${card.color}|${card.defId}`;
          if (triedKeys.has(key)) continue;
          triedKeys.add(key);

          const nextSeq = [...node.seq, card];
          const nextRemaining = node.remaining.slice(0, i).concat(node.remaining.slice(i + 1));
          const s = evaluateSequence(nextSeq, context, strategy);
          candidates.push({ seq: nextSeq, remaining: nextRemaining, score: s });
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      beam = candidates.slice(0, BEAM_WIDTH);
    }

    if (beam.length > 0) {
      bestSeq = beam[0].seq;
    }
  }

  return [...bestSeq, ...hidden];
}
