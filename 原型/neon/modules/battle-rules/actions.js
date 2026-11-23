// 动作执行函数表（设计稿 5.9、10.2 第 8 条）：
// 每个动作是一个单独的小函数，不写通用脚本解释器。

import {
  ACTIONS,
  ACTION_DURATIONS,
  BATTLE_EVENT_TYPES,
  COLOR_RING,
  PRIMARY_GEMS,
} from '../shared/index.js';
import { pickColorsToRecord } from './chain-math.js';

function resolveTargets(ctx, targetMode, selfMonster) {
  if (targetMode === 'self' && selfMonster) return [selfMonster];
  if (targetMode === 'event_monster') return selfMonster && selfMonster.alive ? [selfMonster] : []; // 触发这件事的那只（比如被破盾的）
  if (targetMode === 'all') return ctx.getAliveMonsters();
  const selected = ctx.getSelectedMonster();
  return selected ? [selected] : [];
}

/** 每个动作对应一个独立小函数 */
export const ACTION_HANDLERS = Object.freeze({
  [ACTIONS.DRAW_CARDS](ctx, params) {
    const count = Math.max(0, Math.floor(params.count || 0));
    if (count > 0) ctx.drawCards(count, params.colorFilter || null);
  },

  [ACTIONS.MODIFY_HIT_DAMAGE](ctx, params, meta) {
    const stat = params.stat || 'hitPercent';
    const value = Number(params.value) || 0;
    const duration = meta.duration || ACTION_DURATIONS.THIS_TURN;
    if (duration === ACTION_DURATIONS.THIS_TURN) {
      ctx.addTurnDamageMod(stat, value);
    } else if (duration === ACTION_DURATIONS.THIS_BATTLE) {
      ctx.addBattleDamageMod(stat, value);
    } else {
      ctx.addChainDamageMod(stat, value);
    }
  },

  [ACTIONS.MODIFY_MULTIPLIER](ctx, params) {
    const value = Number(params.value) || 1;
    if (params.mode === 'add') {
      ctx.modifyCurrentChainMultiplier((m) => m + value);
    } else {
      ctx.modifyCurrentChainMultiplier((m) => m * value);
    }
  },

  [ACTIONS.SHRED_SHIELD](ctx, params) {
    const amount = Math.max(0, Math.floor(params.amount || 0));
    if (amount <= 0) return;
    const targets = resolveTargets(ctx, params.target || 'selected', null);
    for (const mon of targets) {
      ctx.shredMonsterShieldDirect(mon, params.color || 'current', amount);
    }
  },

  [ACTIONS.SHIFT_COUNTDOWN](ctx, params, meta) {
    const delta = Math.trunc(Number(params.delta) || 0);
    if (delta === 0) return;
    const targets = resolveTargets(ctx, params.target || 'selected', meta.monster || null);
    for (const mon of targets) {
      ctx.shiftMonsterCountdown(mon, delta, meta.sourceLabel || '效果');
    }
  },

  [ACTIONS.RECORD_COLORS](ctx, params) {
    const added = pickColorsToRecord(
      ctx.getRecordedColors(),
      ctx.getCurrentColor(),
      params.mode || 'neighbors',
      params.count ?? 2,
      params.color || null,
    );
    if (added.length > 0) {
      ctx.recordColorsDirectly(added);
    }
  },

  [ACTIONS.CLEAR_RECORDED_COLORS](ctx, _params, meta) {
    ctx.clearRecordedColors(meta.sourceLabel || '特性');
  },

  [ACTIONS.CHANGE_CARD_COLOR]() {
    // 变色在排链与结算解析阶段由 resolveCardForChain 处理，此处保持显式声明
  },

  [ACTIONS.ADD_BLOCK](ctx, params, meta) {
    const count = Math.max(0, Math.floor(params.count || 0));
    if (count <= 0) return;
    const duration = meta.duration || ACTION_DURATIONS.UNTIL_CONSUMED;
    ctx.addBlock(count, duration);
  },

  [ACTIONS.HEAL_HEARTS](ctx, params) {
    const amount = Number(params.amount) || 0;
    if (amount > 0) ctx.healHearts(amount);
  },

  [ACTIONS.DEAL_BONUS_DAMAGE](ctx, params, meta) {
    const targets = resolveTargets(ctx, params.target || 'selected', meta.monster || null);
    for (const mon of targets) {
      ctx.dealBonusDamage(mon, {
        amount: Number(params.amount) || 0,
        scale: params.scale || 'fixed',
        ignoreTraits: Boolean(params.ignoreTraits),
        canCrit: Boolean(params.canCrit),
        sourceLabel: meta.sourceLabel || '补刀',
      });
    }
  },

  [ACTIONS.MODIFY_RULE](ctx, params, meta) {
    const ruleKey = params.ruleKey;
    if (!ruleKey) return;
    if (ruleKey === 'halveRandomRingColor' && meta.monster) {
      // 5.8：每回合挑色环上的一种颜色减半（白不会被挑中）
      const picked = ctx.rng.pick(COLOR_RING);
      meta.monster.turnHalvedColor = picked;
      ctx.emit(BATTLE_EVENT_TYPES.EFFECT_TRIGGERED, {
        source: meta.monster.uid,
        label: `本回合 ${picked} 色牌伤害减半`,
        halvedColor: picked,
      });
      return;
    }
    ctx.setRuleOverride(ruleKey, params.value, meta.duration || ACTION_DURATIONS.THIS_BATTLE, meta.monster || null);
  },

  [ACTIONS.HIDE_HAND_CARD](ctx, params, meta) {
    const count = Math.max(0, Math.floor(params.count || 1));
    ctx.hideRandomHandCards(count, meta.monster?.uid || null);
  },

  [ACTIONS.INJECT_CARD](ctx, params) {
    const count = Math.max(0, Math.floor(params.count || 1));
    ctx.injectCards(params.cardDefId, count, params.destination || 'discard');
  },

  [ACTIONS.CHANGE_SHIELD_COLOR](ctx, params, meta) {
    const mon = meta.monster;
    if (!mon || !mon.alive || mon.shieldBroken || mon.shields.length === 0) return;
    const mode = params.mode || 'rotate';
    for (const sh of mon.shields) {
      if (mode === 'random') {
        const others = PRIMARY_GEMS.filter((g) => g !== sh.color);
        sh.color = ctx.rng.pick(others);
      } else {
        const idx = PRIMARY_GEMS.indexOf(sh.color);
        sh.color = PRIMARY_GEMS[(idx + 1) % PRIMARY_GEMS.length];
      }
    }
    ctx.emit(BATTLE_EVENT_TYPES.EFFECT_TRIGGERED, {
      source: mon.uid,
      label: '盾更换了颜色',
      shields: mon.shields.map((s) => ({ color: s.color, current: s.current, max: s.max })),
    });
  },

  [ACTIONS.HEAL_MONSTER](ctx, params, meta) {
    const mon = meta.monster;
    if (!mon || !mon.alive) return;
    const raw = Number(params.amount) || 0;
    const heal = params.isRatio ? Math.round(mon.maxHp * raw) : Math.round(raw);
    if (heal > 0) {
      mon.hp = Math.min(mon.maxHp, mon.hp + heal);
      ctx.emit(BATTLE_EVENT_TYPES.EFFECT_TRIGGERED, {
        source: mon.uid,
        label: `回复 ${heal} 点血`,
        heal,
      });
    }
  },

  [ACTIONS.ADD_GEM_EXP](ctx, params) {
    const amount = Math.max(0, Math.floor(params.amount || 0));
    if (amount > 0) ctx.addGemExp(params.color, amount);
  },

  [ACTIONS.WHITE_ROUND](ctx, params, meta) {
    ctx.dealWhiteRound(params.target || 'all', meta.sourceLabel || '白');
  },

  [ACTIONS.ADD_HITS](ctx, params) {
    const count = Math.max(0, Math.floor(params.count || 0));
    if (count > 0) ctx.addExtraHits(count, Boolean(params.scaleByMultiplier), params.gemColor || null);
  },
});

export function executeAction(ctx, effect, meta = {}) {
  if (!effect || !effect.action) return;
  const handler = ACTION_HANDLERS[effect.action];
  if (!handler) {
    throw new Error(`未实现的动作函数：${effect.action}`);
  }
  handler(ctx, effect.params || {}, {
    duration: effect.duration,
    ...meta,
  });
}
