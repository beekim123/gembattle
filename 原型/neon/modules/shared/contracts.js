// 战斗四样约定（设计稿 10.3，第 3 版）：
// 1. 动作表（ActionTable）
// 2. 开战包（BattleStartPacket）
// 3. 战斗的快照 / 预览 / 演出事件（BattleSnapshot / BattlePreview / BattleEvent）
// 4. 战斗结果（BattleResult，明确不管掉落）
//
// 本文件只写数据结构说明（JSDoc）和校验函数，不包含任何战斗玩法计算。

import {
  CARD_COLORS,
  CHAIN_RELATIONS,
  CHAIN_RELATION_LIST,
  COLOR_RING,
  PRIMARY_GEMS,
  SEVEN_COLORS,
  isCardColor,
  isPrimaryGem,
  isRingColor,
  isSevenColor,
} from './colors.js';
import {
  ACTION_DURATION_LIST,
  DEFAULT_ACTION_TABLE,
  EFFECT_SOURCE_LIST,
  RETRIGGER_POLICY_LIST,
  TIMING_LIST,
} from './timings-actions.js';

export const SCHEMA_VERSION = 1;

export const CARD_KINDS = Object.freeze(['gem', 'function', 'junk']);
export const CARD_USAGES = Object.freeze(['chain', 'instant']);
export const MONSTER_TIERS = Object.freeze(['normal', 'elite', 'gatekeeper']);
export const ALLY_ROLES = Object.freeze(['tank', 'warrior', 'assassin', 'support']);
export const ALLY_MODES = Object.freeze(['auto_before', 'auto_after', 'inject', 'passive', 'trigger']);
export const GEAR_SLOTS = Object.freeze(['weapon', 'armor', 'trinket']);
export const BATTLE_PHASES = Object.freeze(['turn_start', 'player_input', 'resolving', 'monster_turn', 'ended']);
export const BATTLE_OUTCOMES = Object.freeze(['win', 'lose']);

export const BATTLE_EVENT_TYPES = Object.freeze({
  TURN_START: 'turn_start',
  CARDS_DRAWN: 'cards_drawn',
  CARD_HIDDEN: 'card_hidden',
  INSTANT_CARD_USED: 'instant_card_used',
  CHAIN_STEP: 'chain_step',
  DAMAGE_PACKET: 'damage_packet',
  COMPLEMENT_WHITE: 'complement_white',
  RAINBOW_TRIGGER: 'rainbow_trigger',
  SHIELD_SHRED: 'shield_shred',
  SHIELD_BREAK: 'shield_break',
  BAR_SWITCHED: 'bar_switched',
  MONSTER_DEFEATED: 'monster_defeated',
  ALLY_ACTION: 'ally_action',
  EFFECT_TRIGGERED: 'effect_triggered',
  MONSTER_ATTACK: 'monster_attack',
  BLOCK_CHANGED: 'block_changed',
  HEARTS_CHANGED: 'hearts_changed',
  GEM_LEVEL_UP: 'gem_level_up',
  CHAIN_SUMMARY: 'chain_summary',
  BATTLE_END: 'battle_end',
});

export const BATTLE_EVENT_TYPE_LIST = Object.freeze(Object.values(BATTLE_EVENT_TYPES));

const FORBIDDEN_RESULT_KEYS = Object.freeze(['loot', 'drops', 'rewards', 'goldDrop', 'trophies']);

/**
 * @typedef {object} ValidationResult
 * @property {boolean} ok 是否完全符合约定
 * @property {string[]} errors 不合约定时的逐条错误说明
 */

/**
 * @typedef {object} EffectSpec
 * @property {string} timing 触发时机（TIMINGS 之一）
 * @property {string} action 动作名（动作表中的 key）
 * @property {object} [condition] 可选触发条件（例如 { gemColor: 'red', everyNHits: 10 }）
 * @property {object} [params] 传给动作的参数对象
 * @property {string} [duration] 可选覆盖持续时间（须在该动作的 allowedDurations 中）
 * @property {string} [source] 可选来源声明（EFFECT_SOURCE_LIST 之一，便于静态检查）
 */

/**
 * @typedef {object} BattleStartPacket
 * @property {number} schemaVersion 约定版本号
 * @property {number|string} seed 随机数种子（第 3 版加，便于单测与模拟器重放）
 * @property {object} [rulesConfig] 阶段 1 可调开关（摸牌方式、留牌不占名额、盾倍数、破盾推格数、初始倒计时等）
 * @property {object} player 玩家开战数据（deck / stats / drawTarget / hearts / maxHearts / buffs / allies / gearTraits / gemLevels）
 * @property {object[]} monsters 敌方怪列表（1 只或一群，每只含 uid / defId / tier / label / attackDamage / initialCountdown / bars）
 */

/**
 * @typedef {object} BattleSnapshot
 * @property {number} schemaVersion 约定版本号
 * @property {number} turn 当前回合数（从 1 起）
 * @property {string} phase 当前阶段（BATTLE_PHASES 之一）
 * @property {'win'|'lose'|null} outcome 胜负结果，未结束时为 null
 * @property {string|null} currentColor 当前链尾色（七色之一，起色前为 null）
 * @property {string[]} recordedColors 当前已集到的色环颜色数组（不重复）
 * @property {string|null} selectedTargetUid 当前选中的目标怪 uid
 * @property {object} player 玩家实时只读状态（含 hearts / maxHearts / blocks / gemLevels / stats）
 * @property {object[]} hand 当前手牌（含 hidden、relationToCurrent；被遮住的牌不得暴露真实颜色与宝石）
 * @property {object[]} chain 当前已排进链里的牌
 * @property {number} drawPileCount 抽牌堆总张数
 * @property {Record<string, number>} drawPileByColor 牌堆中每种颜色剩余张数（第 3 版加）
 * @property {number} discardPileCount 弃牌堆总张数
 * @property {object[]} monsters 场上怪状态列表
 */

/**
 * @typedef {object} BattlePreview
 * @property {number} schemaVersion 约定版本号
 * @property {number} chainLength 已排进链的牌张数
 * @property {object[]} steps 链上每一步的预览明细
 * @property {number} finalMultiplier 当前链尾倍率
 * @property {boolean} hasComplementWhite 本条链是否会合白
 * @property {boolean} willTriggerRainbow 本条链是否会触发彩虹
 * @property {number} colorsNeededForRainbow 还差几种颜色到彩虹（0~6）
 * @property {{ red: number, green: number, blue: number }} shieldShred 预计可削各色盾格数
 * @property {string[]} expectedBreakUids 预计本条链会破盾的怪 uid 列表
 * @property {number} estimatedHits 预计总发数
 * @property {number|null} estimatedDamage 预计总伤害（关闭精确总伤害开关时可为 null）
 * @property {string[]} [formulaLines] 可选的两行算式预览文本
 */

/**
 * @typedef {object} BattleEvent
 * @property {number} seq 单调递增事件序号（从 0 或 1 起）
 * @property {string} type 事件类型（BATTLE_EVENT_TYPES 之一）
 * @property {object} payload 对应事件的演出数据
 */

/**
 * @typedef {object} BattleResult
 * @property {number} schemaVersion 约定版本号
 * @property {'win'|'lose'} outcome 赢了还是死了
 * @property {number} remainingHearts 剩几颗心
 * @property {number} maxHearts 心的上限
 * @property {object} gemLevels 打完以后的三原色宝石等级和经验（第 3 版改）
 * @property {object[]} defeatedMonsters 打死了哪些怪（任务用，第 3 版加）
 * @property {string[]} encounteredMonsters 本仗碰到了哪些怪 defId（卡册用）
 * @property {{ addedCards: object[], removedCardUids: string[] }} deckChanges 牌组变化（如怪塞进来的牌）
 * @property {object} stats 战绩（turns / rainbowCount / maxChainLength / heartsLost / shieldBreaks / totalDamage / maxSingleHit）
 */

function isPlainObject(v) {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isFiniteNumber(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

function isNonNegativeInt(v) {
  return Number.isInteger(v) && v >= 0;
}

function isPositiveInt(v) {
  return Number.isInteger(v) && v > 0;
}

function isValidHalfStep(v) {
  return isFiniteNumber(v) && v >= 0 && Math.abs(v * 2 - Math.round(v * 2)) < 1e-9;
}

function isValidSeed(v) {
  return (typeof v === 'number' && Number.isFinite(v)) || isNonEmptyString(v);
}

function checkGemLevels(gemLevels, path, errors, requireNextExp = false) {
  if (!isPlainObject(gemLevels)) {
    errors.push(`${path} 必须是包含 red/green/blue 的对象`);
    return;
  }
  for (const gem of PRIMARY_GEMS) {
    const item = gemLevels[gem];
    if (!isPlainObject(item)) {
      errors.push(`${path}.${gem} 缺失或不是对象`);
      continue;
    }
    if (!isPositiveInt(item.level)) {
      errors.push(`${path}.${gem}.level 必须是正整数`);
    }
    if (!isFiniteNumber(item.exp) || item.exp < 0) {
      errors.push(`${path}.${gem}.exp 必须是非负数字`);
    }
    if (requireNextExp && (!isFiniteNumber(item.nextExp) || item.nextExp <= 0)) {
      errors.push(`${path}.${gem}.nextExp 必须是正数`);
    }
  }
}

function checkStats(stats, path, errors) {
  if (!isPlainObject(stats)) {
    errors.push(`${path} 必须是对象`);
    return;
  }
  if (!isFiniteNumber(stats.attack) || stats.attack < 0) errors.push(`${path}.attack 必须是非负数字`);
  if (!isFiniteNumber(stats.damageBonus)) errors.push(`${path}.damageBonus 必须是数字`);
  if (!isFiniteNumber(stats.critRate) || stats.critRate < 0) errors.push(`${path}.critRate 必须是非负数字`);
  if (!isFiniteNumber(stats.critDamage) || stats.critDamage < 1) errors.push(`${path}.critDamage 必须是不小于 1 的数字`);
}

function checkGemsArray(gems, path, errors) {
  if (!Array.isArray(gems)) {
    errors.push(`${path} 必须是数组`);
    return;
  }
  gems.forEach((g, idx) => {
    if (!isPrimaryGem(g)) {
      errors.push(`${path}[${idx}] 不是合法的三原色宝石（red/green/blue）：${String(g)}`);
    }
  });
}

function checkEffectsArray(effects, path, errors, actionTable, expectedSource) {
  if (!Array.isArray(effects)) {
    errors.push(`${path} 必须是数组`);
    return;
  }
  effects.forEach((ef, idx) => {
    const res = validateEffect(ef, actionTable, expectedSource);
    if (!res.ok) {
      for (const msg of res.errors) {
        errors.push(`${path}[${idx}]: ${msg}`);
      }
    }
  });
}

/**
 * 校验动作表是否合乎设计稿 10.3 约定（含持续时间与再触发声明）。
 * @param {object} table
 * @returns {ValidationResult}
 */
export function validateActionTable(table) {
  const errors = [];
  if (!isPlainObject(table)) {
    return { ok: false, errors: ['动作表必须是对象'] };
  }
  const keys = Object.keys(table);
  if (keys.length === 0) {
    errors.push('动作表不能为空');
  }
  for (const key of keys) {
    const def = table[key];
    const p = `actionTable.${key}`;
    if (!isPlainObject(def)) {
      errors.push(`${p} 必须是对象`);
      continue;
    }
    if (def.id !== key) errors.push(`${p}.id 必须与键名 ${key} 一致`);
    if (!isNonEmptyString(def.label)) errors.push(`${p}.label 必须是非空中文名称`);
    if (!isPlainObject(def.params)) {
      errors.push(`${p}.params 必须是参数定义对象`);
    } else {
      for (const [paramKey, spec] of Object.entries(def.params)) {
        if (!isPlainObject(spec) || !isNonEmptyString(spec.type) || typeof spec.required !== 'boolean') {
          errors.push(`${p}.params.${paramKey} 必须包含 type 和布尔值 required`);
        }
      }
    }
    if (!Array.isArray(def.allowedSources) || def.allowedSources.length === 0) {
      errors.push(`${p}.allowedSources 必须是非空数组`);
    } else {
      for (const src of def.allowedSources) {
        if (!EFFECT_SOURCE_LIST.includes(src)) {
          errors.push(`${p}.allowedSources 包含未知来源：${String(src)}`);
        }
      }
    }
    if (!ACTION_DURATION_LIST.includes(def.defaultDuration)) {
      errors.push(`${p}.defaultDuration 必须是合法的持续时间类型`);
    }
    if (!Array.isArray(def.allowedDurations) || def.allowedDurations.length === 0) {
      errors.push(`${p}.allowedDurations 必须是非空数组`);
    } else {
      for (const dur of def.allowedDurations) {
        if (!ACTION_DURATION_LIST.includes(dur)) {
          errors.push(`${p}.allowedDurations 包含未知持续时间：${String(dur)}`);
        }
      }
      if (!def.allowedDurations.includes(def.defaultDuration)) {
        errors.push(`${p}.defaultDuration 必须包含在 allowedDurations 中`);
      }
    }
    if (!isPlainObject(def.retrigger)) {
      errors.push(`${p}.retrigger 必须是再触发声明对象`);
    } else {
      if (!RETRIGGER_POLICY_LIST.includes(def.retrigger.policy)) {
        errors.push(`${p}.retrigger.policy 不是合法的再触发策略`);
      }
      for (const flag of ['triggersOnGemPlay', 'triggersOnHit', 'triggersOnShieldBreak', 'breaksShield']) {
        if (typeof def.retrigger[flag] !== 'boolean') {
          errors.push(`${p}.retrigger.${flag} 必须是布尔值`);
        }
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * 校验单条「时机 + 条件 + 动作 + 数」效果配置。
 * @param {EffectSpec} effect
 * @param {object} [actionTable]
 * @param {string} [expectedSource]
 * @returns {ValidationResult}
 */
export function validateEffect(effect, actionTable = DEFAULT_ACTION_TABLE, expectedSource) {
  const errors = [];
  if (!isPlainObject(effect)) {
    return { ok: false, errors: ['效果条目必须是对象'] };
  }
  if (!TIMING_LIST.includes(effect.timing)) {
    errors.push(`timing 不是已知时机：${String(effect.timing)}`);
  }
  const actionDef = isPlainObject(actionTable) ? actionTable[effect.action] : null;
  if (!actionDef) {
    errors.push(`action 不在动作表中：${String(effect.action)}`);
    return { ok: false, errors };
  }
  const src = effect.source || expectedSource;
  if (src) {
    if (!EFFECT_SOURCE_LIST.includes(src)) {
      errors.push(`source 不是合法来源：${String(src)}`);
    } else if (!actionDef.allowedSources.includes(src)) {
      errors.push(`动作 ${effect.action} 不允许由 ${src} 使用`);
    }
  }
  if (effect.duration !== undefined && !actionDef.allowedDurations.includes(effect.duration)) {
    errors.push(`动作 ${effect.action} 不支持持续时间 ${String(effect.duration)}`);
  }
  if (effect.condition !== undefined && !isPlainObject(effect.condition)) {
    errors.push('condition 如果提供，必须是对象');
  }
  const params = effect.params ?? {};
  if (!isPlainObject(params)) {
    errors.push('params 必须是对象');
  } else {
    for (const [paramKey, spec] of Object.entries(actionDef.params)) {
      const val = params[paramKey];
      if (spec.required && val === undefined) {
        errors.push(`动作 ${effect.action} 缺少必填参数 ${paramKey}`);
        continue;
      }
      if (val !== undefined && spec.type !== 'any' && typeof val !== spec.type) {
        errors.push(`动作 ${effect.action} 的参数 ${paramKey} 需要类型 ${spec.type}`);
      }
    }
  }
  return { ok: errors.length === 0, errors };
}

/**
 * 校验开战包（run-rules -> battle-rules）。
 * @param {BattleStartPacket} packet
 * @param {object} [actionTable]
 * @returns {ValidationResult}
 */
export function validateBattleStartPacket(packet, actionTable = DEFAULT_ACTION_TABLE) {
  const errors = [];
  if (!isPlainObject(packet)) {
    return { ok: false, errors: ['开战包必须是对象'] };
  }
  if (packet.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion 必须为 ${SCHEMA_VERSION}`);
  }
  if (!isValidSeed(packet.seed)) {
    errors.push('seed 必须是有限数字或非空字符串');
  }

  // 可选 rulesConfig 校验
  if (packet.rulesConfig !== undefined) {
    const cfg = packet.rulesConfig;
    if (!isPlainObject(cfg)) {
      errors.push('rulesConfig 如果提供，必须是对象');
    } else {
      if (cfg.drawMode !== undefined && !['draw_floor', 'refill', 'draw_one'].includes(cfg.drawMode)) {
        errors.push('rulesConfig.drawMode 只能是 draw_floor、refill 或 draw_one');
      }
      for (const k of ['drawPerTurn', 'handOverN']) {
        if (cfg[k] !== undefined && !isNonNegativeInt(cfg[k])) errors.push(`rulesConfig.${k} 必须是非负整数`);
      }
      if (cfg.freeKeepCount !== undefined && !isNonNegativeInt(cfg.freeKeepCount)) {
        errors.push('rulesConfig.freeKeepCount 必须是非负整数');
      }
      if (cfg.shieldActiveMultiplier !== undefined && (!isFiniteNumber(cfg.shieldActiveMultiplier) || cfg.shieldActiveMultiplier <= 0)) {
        errors.push('rulesConfig.shieldActiveMultiplier 必须是正数');
      }
      if (cfg.shieldBrokenMultiplier !== undefined && (!isFiniteNumber(cfg.shieldBrokenMultiplier) || cfg.shieldBrokenMultiplier <= 0)) {
        errors.push('rulesConfig.shieldBrokenMultiplier 必须是正数');
      }
      if (cfg.shieldBreakPush !== undefined && !Number.isInteger(cfg.shieldBreakPush)) {
        errors.push('rulesConfig.shieldBreakPush 必须是整数');
      }
      if (cfg.initialCountdown !== undefined && !isPositiveInt(cfg.initialCountdown)) {
        errors.push('rulesConfig.initialCountdown 必须是正整数');
      }
      if (cfg.maxHandSize !== undefined && !isPositiveInt(cfg.maxHandSize)) {
        errors.push('rulesConfig.maxHandSize 必须是正整数');
      }
    }
  }

  // 玩家部分
  const player = packet.player;
  if (!isPlainObject(player)) {
    errors.push('player 必须是对象');
  } else {
    if (!Array.isArray(player.deck) || player.deck.length === 0) {
      errors.push('player.deck 必须是非空牌组数组');
    } else {
      const seenCardUids = new Set();
      player.deck.forEach((card, idx) => {
        const cp = `player.deck[${idx}]`;
        if (!isPlainObject(card)) {
          errors.push(`${cp} 必须是对象`);
          return;
        }
        if (!isNonEmptyString(card.uid)) errors.push(`${cp}.uid 必须是非空字符串`);
        else if (seenCardUids.has(card.uid)) errors.push(`${cp}.uid 重复：${card.uid}`);
        else seenCardUids.add(card.uid);

        if (!isNonEmptyString(card.defId)) errors.push(`${cp}.defId 必须是非空字符串`);
        if (!CARD_KINDS.includes(card.kind)) errors.push(`${cp}.kind 不合法`);
        if (!CARD_USAGES.includes(card.usage)) errors.push(`${cp}.usage 不合法`);
        if (!isCardColor(card.color)) errors.push(`${cp}.color 不合法：${String(card.color)}`);
        // 第 3 版硬规矩：排进链的牌都带颜色（或变色）；无色功能牌必须马上用
        if (card.color === 'colorless' && card.kind === 'function' && card.usage !== 'instant') {
          errors.push(`${cp}: 无色功能牌必须是 instant（马上用）`);
        }
        checkGemsArray(card.gems, `${cp}.gems`, errors);
        if (typeof card.enhanced !== 'boolean') errors.push(`${cp}.enhanced 必须是布尔值`);
        if (card.drawAfterPlay !== undefined && !isNonNegativeInt(card.drawAfterPlay)) {
          errors.push(`${cp}.drawAfterPlay 必须是非负整数`);
        }
        if (card.effects !== undefined) {
          checkEffectsArray(card.effects, `${cp}.effects`, errors, actionTable, 'card');
        }
      });
    }

    checkStats(player.stats, 'player.stats', errors);
    if (!isPositiveInt(player.drawTarget)) errors.push('player.drawTarget 必须是正整数');
    if (!isValidHalfStep(player.hearts)) errors.push('player.hearts 必须是 0.5 步进的非负数');
    if (!isValidHalfStep(player.maxHearts) || player.maxHearts <= 0) {
      errors.push('player.maxHearts 必须是 0.5 步进的正数');
    } else if (isValidHalfStep(player.hearts) && player.hearts > player.maxHearts) {
      errors.push('player.hearts 不能大于 player.maxHearts');
    }

    if (!Array.isArray(player.buffs)) {
      errors.push('player.buffs 必须是数组');
    } else {
      player.buffs.forEach((buff, idx) => {
        const bp = `player.buffs[${idx}]`;
        if (!isPlainObject(buff)) {
          errors.push(`${bp} 必须是对象`);
          return;
        }
        if (!isNonEmptyString(buff.id)) errors.push(`${bp}.id 必须是非空字符串`);
        if (!isNonEmptyString(buff.label)) errors.push(`${bp}.label 必须是非空字符串`);
        checkEffectsArray(buff.effects, `${bp}.effects`, errors, actionTable, 'buff');
      });
    }

    if (!Array.isArray(player.allies)) {
      errors.push('player.allies 必须是数组');
    } else {
      player.allies.forEach((ally, idx) => {
        const ap = `player.allies[${idx}]`;
        if (!isPlainObject(ally)) {
          errors.push(`${ap} 必须是对象`);
          return;
        }
        if (!isNonEmptyString(ally.id)) errors.push(`${ap}.id 必须是非空字符串`);
        if (!ALLY_ROLES.includes(ally.role)) errors.push(`${ap}.role 不合法`);
        if (!ALLY_MODES.includes(ally.mode)) errors.push(`${ap}.mode 不合法`);
        if (!isNonEmptyString(ally.label)) errors.push(`${ap}.label 必须是非空字符串`);
        if (ally.usesPerBattle !== undefined && ally.usesPerBattle !== null && !isNonNegativeInt(ally.usesPerBattle)) {
          errors.push(`${ap}.usesPerBattle 必须是非负整数或 null`);
        }
        checkEffectsArray(ally.effects, `${ap}.effects`, errors, actionTable, 'ally');
      });
    }

    if (!Array.isArray(player.gearTraits)) {
      errors.push('player.gearTraits 必须是数组');
    } else {
      player.gearTraits.forEach((trait, idx) => {
        const gp = `player.gearTraits[${idx}]`;
        if (!isPlainObject(trait)) {
          errors.push(`${gp} 必须是对象`);
          return;
        }
        if (!isNonEmptyString(trait.gearId)) errors.push(`${gp}.gearId 必须是非空字符串`);
        if (!GEAR_SLOTS.includes(trait.slot)) errors.push(`${gp}.slot 不合法`);
        if (!isNonEmptyString(trait.label)) errors.push(`${gp}.label 必须是非空字符串`);
        checkEffectsArray(trait.effects, `${gp}.effects`, errors, actionTable, 'gear');
      });
    }

    checkGemLevels(player.gemLevels, 'player.gemLevels', errors, false);
  }

  // 怪部分
  if (!Array.isArray(packet.monsters) || packet.monsters.length === 0) {
    errors.push('monsters 必须是非空数组');
  } else {
    const seenMonsterUids = new Set();
    packet.monsters.forEach((m, idx) => {
      const mp = `monsters[${idx}]`;
      if (!isPlainObject(m)) {
        errors.push(`${mp} 必须是对象`);
        return;
      }
      if (!isNonEmptyString(m.uid)) errors.push(`${mp}.uid 必须是非空字符串`);
      else if (seenMonsterUids.has(m.uid)) errors.push(`${mp}.uid 重复：${m.uid}`);
      else seenMonsterUids.add(m.uid);

      if (!isNonEmptyString(m.defId)) errors.push(`${mp}.defId 必须是非空字符串`);
      if (!MONSTER_TIERS.includes(m.tier)) errors.push(`${mp}.tier 不合法`);
      if (!isNonEmptyString(m.label)) errors.push(`${mp}.label 必须是非空字符串`);
      if (!isValidHalfStep(m.attackDamage) || m.attackDamage <= 0) {
        errors.push(`${mp}.attackDamage 必须是 0.5 步进的正数`);
      }
      if (!isPositiveInt(m.initialCountdown)) errors.push(`${mp}.initialCountdown 必须是正整数`);
      if (!Array.isArray(m.bars) || m.bars.length === 0) {
        errors.push(`${mp}.bars 必须是非空血条数组`);
      } else {
        m.bars.forEach((bar, bIdx) => {
          const bp = `${mp}.bars[${bIdx}]`;
          if (!isPlainObject(bar)) {
            errors.push(`${bp} 必须是对象`);
            return;
          }
          if (!isPositiveInt(bar.maxHp)) errors.push(`${bp}.maxHp 必须是正整数`);
          if (!Array.isArray(bar.shields)) {
            errors.push(`${bp}.shields 必须是数组`);
          } else {
            const shieldColors = new Set();
            bar.shields.forEach((sh, sIdx) => {
              const sp = `${bp}.shields[${sIdx}]`;
              if (!isPlainObject(sh)) {
                errors.push(`${sp} 必须是对象`);
                return;
              }
              if (!isPrimaryGem(sh.color)) errors.push(`${sp}.color 必须是 red/green/blue`);
              else if (shieldColors.has(sh.color)) errors.push(`${sp}.color 重复：${sh.color}`);
              else shieldColors.add(sh.color);
              if (!isPositiveInt(sh.max)) errors.push(`${sp}.max 必须是正整数`);
            });
          }
          if (!Array.isArray(bar.traits)) {
            errors.push(`${bp}.traits 必须是数组`);
          } else {
            bar.traits.forEach((tr, tIdx) => {
              const tp = `${bp}.traits[${tIdx}]`;
              if (!isPlainObject(tr)) {
                errors.push(`${tp} 必须是对象`);
                return;
              }
              if (!isNonEmptyString(tr.id)) errors.push(`${tp}.id 必须是非空字符串`);
              if (!isNonEmptyString(tr.label)) errors.push(`${tp}.label 必须是非空字符串`);
              checkEffectsArray(tr.effects, `${tp}.effects`, errors, actionTable, 'monster_trait');
            });
          }
        });
      }
    });
  }

  return { ok: errors.length === 0, errors };
}

/**
 * 校验战斗快照（battle-rules -> battle-view，只读视图）。
 * 重点守住第 3 版要求：手牌接链状态、牌堆各色剩余、被遮住的牌不得泄漏真色。
 * @param {BattleSnapshot} snapshot
 * @returns {ValidationResult}
 */
export function validateBattleSnapshot(snapshot) {
  const errors = [];
  if (!isPlainObject(snapshot)) {
    return { ok: false, errors: ['战斗快照必须是对象'] };
  }
  if (snapshot.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion 必须为 ${SCHEMA_VERSION}`);
  }
  if (!isPositiveInt(snapshot.turn)) errors.push('turn 必须是正整数');
  if (!BATTLE_PHASES.includes(snapshot.phase)) errors.push('phase 不合法');
  if (snapshot.outcome !== null && !BATTLE_OUTCOMES.includes(snapshot.outcome)) {
    errors.push('outcome 必须是 null、win 或 lose');
  }
  if (snapshot.currentColor !== null && !isSevenColor(snapshot.currentColor)) {
    errors.push('currentColor 必须是七种带色之一或 null');
  }

  if (!Array.isArray(snapshot.recordedColors)) {
    errors.push('recordedColors 必须是数组');
  } else {
    const seen = new Set();
    snapshot.recordedColors.forEach((c, idx) => {
      if (!isRingColor(c)) errors.push(`recordedColors[${idx}] 必须是色环上的 6 色之一`);
      else if (seen.has(c)) errors.push(`recordedColors[${idx}] 颜色重复：${c}`);
      else seen.add(c);
    });
  }

  if (snapshot.selectedTargetUid !== null && !isNonEmptyString(snapshot.selectedTargetUid)) {
    errors.push('selectedTargetUid 必须是非空字符串或 null');
  }

  // 玩家状态
  const p = snapshot.player;
  if (!isPlainObject(p)) {
    errors.push('player 必须是对象');
  } else {
    if (!isValidHalfStep(p.hearts)) errors.push('player.hearts 必须是 0.5 步进的非负数');
    if (!isValidHalfStep(p.maxHearts) || p.maxHearts <= 0) {
      errors.push('player.maxHearts 必须是 0.5 步进的正数');
    } else if (isValidHalfStep(p.hearts) && p.hearts > p.maxHearts) {
      errors.push('player.hearts 不能大于 player.maxHearts');
    }
    if (!isPositiveInt(p.drawTarget)) errors.push('player.drawTarget 必须是正整数');
    if (!isPositiveInt(p.maxHandSize)) errors.push('player.maxHandSize 必须是正整数');
    checkStats(p.stats, 'player.stats', errors);
    if (!isPlainObject(p.blocks)) {
      errors.push('player.blocks 必须是对象');
    } else {
      for (const k of ['thisTurn', 'untilConsumed', 'allyCharges']) {
        if (!isNonNegativeInt(p.blocks[k])) errors.push(`player.blocks.${k} 必须是非负整数`);
      }
    }
    checkGemLevels(p.gemLevels, 'player.gemLevels', errors, true);
    if (!Array.isArray(p.buffs)) errors.push('player.buffs 必须是数组');
    if (!Array.isArray(p.allies)) errors.push('player.allies 必须是数组');
    if (!Array.isArray(p.gearTraits)) errors.push('player.gearTraits 必须是数组');
  }

  // 手牌（重点检查：接链提示 + 被遮住的牌不得泄漏真实颜色）
  if (!Array.isArray(snapshot.hand)) {
    errors.push('hand 必须是数组');
  } else {
    snapshot.hand.forEach((card, idx) => {
      const hp = `hand[${idx}]`;
      if (!isPlainObject(card)) {
        errors.push(`${hp} 必须是对象`);
        return;
      }
      if (!isNonEmptyString(card.uid)) errors.push(`${hp}.uid 必须是非空字符串`);
      if (typeof card.hidden !== 'boolean') {
        errors.push(`${hp}.hidden 必须是布尔值`);
        return;
      }
      if (card.hidden) {
        if (card.color !== null) errors.push(`${hp} 被遮住时 color 必须为 null（不得泄漏真实颜色）`);
        if (card.gems !== null) errors.push(`${hp} 被遮住时 gems 必须为 null（不得泄漏宝石组成）`);
        if (card.relationToCurrent !== CHAIN_RELATIONS.HIDDEN) {
          errors.push(`${hp} 被遮住时 relationToCurrent 必须为 hidden`);
        }
        if (card.defId !== undefined && card.defId !== null) {
          errors.push(`${hp} 被遮住时不得提供真实 defId`);
        }
      } else {
        if (!isNonEmptyString(card.defId)) errors.push(`${hp}.defId 必须是非空字符串`);
        if (!CARD_KINDS.includes(card.kind)) errors.push(`${hp}.kind 不合法`);
        if (!CARD_USAGES.includes(card.usage)) errors.push(`${hp}.usage 不合法`);
        if (!isCardColor(card.color)) errors.push(`${hp}.color 不合法`);
        checkGemsArray(card.gems, `${hp}.gems`, errors);
        if (!CHAIN_RELATION_LIST.includes(card.relationToCurrent) || card.relationToCurrent === CHAIN_RELATIONS.HIDDEN) {
          errors.push(`${hp}.relationToCurrent 必须是合法的可见接链关系`);
        }
        if (!isNonEmptyString(card.label)) errors.push(`${hp}.label 必须是非空字符串`);
        if (typeof card.enhanced !== 'boolean') errors.push(`${hp}.enhanced 必须是布尔值`);
      }
    });
  }

  // 当前排好的链
  if (!Array.isArray(snapshot.chain)) {
    errors.push('chain 必须是数组');
  } else {
    snapshot.chain.forEach((card, idx) => {
      const cp = `chain[${idx}]`;
      if (!isPlainObject(card)) {
        errors.push(`${cp} 必须是对象`);
        return;
      }
      if (!isNonEmptyString(card.uid)) errors.push(`${cp}.uid 必须是非空字符串`);
      if (typeof card.hidden !== 'boolean') errors.push(`${cp}.hidden 必须是布尔值`);
      if (card.hidden) {
        if (card.color !== null) errors.push(`${cp} 被遮住时 color 必须为 null`);
      } else if (!isCardColor(card.color)) {
        errors.push(`${cp}.color 不合法`);
      }
    });
  }

  // 牌堆与各色剩余统计（第 3 版加）
  if (!isNonNegativeInt(snapshot.drawPileCount)) errors.push('drawPileCount 必须是非负整数');
  if (!isNonNegativeInt(snapshot.discardPileCount)) errors.push('discardPileCount 必须是非负整数');
  if (!isPlainObject(snapshot.drawPileByColor)) {
    errors.push('drawPileByColor 必须是按牌色统计的对象');
  } else {
    let sum = 0;
    for (const color of CARD_COLORS) {
      const count = snapshot.drawPileByColor[color];
      if (!isNonNegativeInt(count)) {
        errors.push(`drawPileByColor.${color} 必须是非负整数`);
      } else {
        sum += count;
      }
    }
    if (isNonNegativeInt(snapshot.drawPileCount) && sum !== snapshot.drawPileCount) {
      errors.push(`drawPileByColor 总和（${sum}）必须等于 drawPileCount（${snapshot.drawPileCount}）`);
    }
  }

  // 怪列表
  if (!Array.isArray(snapshot.monsters) || snapshot.monsters.length === 0) {
    errors.push('monsters 必须是非空数组');
  } else {
    const uids = new Set();
    snapshot.monsters.forEach((m, idx) => {
      const mp = `monsters[${idx}]`;
      if (!isPlainObject(m)) {
        errors.push(`${mp} 必须是对象`);
        return;
      }
      if (!isNonEmptyString(m.uid)) errors.push(`${mp}.uid 必须是非空字符串`);
      else uids.add(m.uid);
      if (!isNonEmptyString(m.defId)) errors.push(`${mp}.defId 必须是非空字符串`);
      if (!MONSTER_TIERS.includes(m.tier)) errors.push(`${mp}.tier 不合法`);
      if (!isNonEmptyString(m.label)) errors.push(`${mp}.label 必须是非空字符串`);
      if (typeof m.alive !== 'boolean') errors.push(`${mp}.alive 必须是布尔值`);
      if (!isNonNegativeInt(m.barIndex)) errors.push(`${mp}.barIndex 必须是非负整数`);
      if (!isPositiveInt(m.totalBars)) errors.push(`${mp}.totalBars 必须是正整数`);
      if (isNonNegativeInt(m.barIndex) && isPositiveInt(m.totalBars) && m.barIndex >= m.totalBars) {
        errors.push(`${mp}.barIndex 必须小于 totalBars`);
      }
      if (!isNonNegativeInt(m.hp)) errors.push(`${mp}.hp 必须是非负整数`);
      if (!isPositiveInt(m.maxHp)) errors.push(`${mp}.maxHp 必须是正整数`);
      if (isNonNegativeInt(m.hp) && isPositiveInt(m.maxHp) && m.hp > m.maxHp) {
        errors.push(`${mp}.hp 不能大于 maxHp`);
      }
      if (!Array.isArray(m.shields)) {
        errors.push(`${mp}.shields 必须是数组`);
      } else {
        m.shields.forEach((sh, sIdx) => {
          const sp = `${mp}.shields[${sIdx}]`;
          if (!isPlainObject(sh)) {
            errors.push(`${sp} 必须是对象`);
            return;
          }
          if (!isPrimaryGem(sh.color)) errors.push(`${sp}.color 必须是 red/green/blue`);
          if (!isNonNegativeInt(sh.current)) errors.push(`${sp}.current 必须是非负整数`);
          if (!isPositiveInt(sh.max)) errors.push(`${sp}.max 必须是正整数`);
          if (isNonNegativeInt(sh.current) && isPositiveInt(sh.max) && sh.current > sh.max) {
            errors.push(`${sp}.current 不能大于 max`);
          }
        });
      }
      if (typeof m.shieldBroken !== 'boolean') errors.push(`${mp}.shieldBroken 必须是布尔值`);
      if (!isNonNegativeInt(m.countdown)) errors.push(`${mp}.countdown 必须是非负整数`);
      if (!isNonNegativeInt(m.attacksDone)) errors.push(`${mp}.attacksDone 必须是非负整数`);
      if (!isValidHalfStep(m.attackDamage) || m.attackDamage <= 0) {
        errors.push(`${mp}.attackDamage 必须是 0.5 步进的正数`);
      }
      if (!isNonEmptyString(m.intentLabel)) errors.push(`${mp}.intentLabel 必须是非空字符串`);
      if (!Array.isArray(m.activeTraits)) errors.push(`${mp}.activeTraits 必须是数组`);
    });
    if (snapshot.selectedTargetUid !== null && !uids.has(snapshot.selectedTargetUid)) {
      errors.push(`selectedTargetUid（${snapshot.selectedTargetUid}）不在 monsters 列表中`);
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * 校验战斗预览（排链时的实时提示数据）。
 * @param {BattlePreview} preview
 * @returns {ValidationResult}
 */
export function validateBattlePreview(preview) {
  const errors = [];
  if (!isPlainObject(preview)) {
    return { ok: false, errors: ['战斗预览必须是对象'] };
  }
  if (preview.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion 必须为 ${SCHEMA_VERSION}`);
  }
  if (!isNonNegativeInt(preview.chainLength)) errors.push('chainLength 必须是非负整数');
  if (!Array.isArray(preview.steps)) {
    errors.push('steps 必须是数组');
  } else {
    if (isNonNegativeInt(preview.chainLength) && preview.steps.length !== preview.chainLength) {
      errors.push('steps 长度必须等于 chainLength');
    }
    preview.steps.forEach((step, idx) => {
      const sp = `steps[${idx}]`;
      if (!isPlainObject(step)) {
        errors.push(`${sp} 必须是对象`);
        return;
      }
      if (!isNonEmptyString(step.cardUid)) errors.push(`${sp}.cardUid 必须是非空字符串`);
      if (step.resolvedColor !== null && !isSevenColor(step.resolvedColor)) {
        errors.push(`${sp}.resolvedColor 必须是七色之一或 null（被遮住时）`);
      }
      if (!CHAIN_RELATION_LIST.includes(step.relation)) errors.push(`${sp}.relation 不合法`);
      if (!isFiniteNumber(step.multiplierAfter) || step.multiplierAfter < 1) {
        errors.push(`${sp}.multiplierAfter 必须是不小于 1 的数字`);
      }
      if (!isNonNegativeInt(step.hits)) errors.push(`${sp}.hits 必须是非负整数`);
      if (typeof step.triggersComplementWhite !== 'boolean') {
        errors.push(`${sp}.triggersComplementWhite 必须是布尔值`);
      }
      if (typeof step.triggersRainbow !== 'boolean') {
        errors.push(`${sp}.triggersRainbow 必须是布尔值`);
      }
    });
  }
  if (!isFiniteNumber(preview.finalMultiplier) || preview.finalMultiplier < 1) {
    errors.push('finalMultiplier 必须是不小于 1 的数字');
  }
  if (typeof preview.hasComplementWhite !== 'boolean') errors.push('hasComplementWhite 必须是布尔值');
  if (typeof preview.willTriggerRainbow !== 'boolean') errors.push('willTriggerRainbow 必须是布尔值');
  if (!Number.isInteger(preview.colorsNeededForRainbow) || preview.colorsNeededForRainbow < 0 || preview.colorsNeededForRainbow > COLOR_RING.length) {
    errors.push('colorsNeededForRainbow 必须是 0 到 6 的整数');
  }
  if (!isPlainObject(preview.shieldShred)) {
    errors.push('shieldShred 必须是对象');
  } else {
    for (const gem of PRIMARY_GEMS) {
      if (!isNonNegativeInt(preview.shieldShred[gem])) {
        errors.push(`shieldShred.${gem} 必须是非负整数`);
      }
    }
  }
  if (!Array.isArray(preview.expectedBreakUids)) {
    errors.push('expectedBreakUids 必须是数组');
  }
  if (!isNonNegativeInt(preview.estimatedHits)) errors.push('estimatedHits 必须是非负整数');
  if (preview.estimatedDamage !== null && (!isFiniteNumber(preview.estimatedDamage) || preview.estimatedDamage < 0)) {
    errors.push('estimatedDamage 必须是非负数字或 null');
  }
  if (preview.formulaLines !== undefined) {
    if (!Array.isArray(preview.formulaLines) || !preview.formulaLines.every((s) => typeof s === 'string')) {
      errors.push('formulaLines 如果提供，必须是字符串数组');
    }
  }

  return { ok: errors.length === 0, errors };
}

/**
 * 校验单条演出事件。
 * @param {BattleEvent} event
 * @returns {ValidationResult}
 */
export function validateBattleEvent(event) {
  const errors = [];
  if (!isPlainObject(event)) {
    return { ok: false, errors: ['演出事件必须是对象'] };
  }
  if (!isNonNegativeInt(event.seq)) errors.push('seq 必须是非负整数');
  if (!BATTLE_EVENT_TYPE_LIST.includes(event.type)) {
    errors.push(`type 不是已知演出事件类型：${String(event.type)}`);
  }
  if (!isPlainObject(event.payload)) {
    errors.push('payload 必须是对象');
    return { ok: false, errors };
  }

  const p = event.payload;
  switch (event.type) {
    case BATTLE_EVENT_TYPES.DAMAGE_PACKET:
      if (!isNonEmptyString(p.targetUid)) errors.push('damage_packet.payload.targetUid 必须是非空字符串');
      if (!isFiniteNumber(p.damage) || p.damage < 0) errors.push('damage_packet.payload.damage 必须是非负数字');
      if (!isPositiveInt(p.hitsInPacket)) errors.push('damage_packet.payload.hitsInPacket 必须是正整数');
      if (typeof p.isCrit !== 'boolean') errors.push('damage_packet.payload.isCrit 必须是布尔值');
      break;
    case BATTLE_EVENT_TYPES.SHIELD_BREAK:
      if (!isNonEmptyString(p.targetUid)) errors.push('shield_break.payload.targetUid 必须是非空字符串');
      if (!Number.isInteger(p.countdownDelta)) errors.push('shield_break.payload.countdownDelta 必须是整数');
      break;
    case BATTLE_EVENT_TYPES.MONSTER_ATTACK:
      if (!isNonEmptyString(p.monsterUid)) errors.push('monster_attack.payload.monsterUid 必须是非空字符串');
      if (typeof p.blocked !== 'boolean') errors.push('monster_attack.payload.blocked 必须是布尔值');
      if (!isValidHalfStep(p.heartsLost)) errors.push('monster_attack.payload.heartsLost 必须是 0.5 步进的非负数');
      break;
    case BATTLE_EVENT_TYPES.BATTLE_END:
      if (!BATTLE_OUTCOMES.includes(p.outcome)) errors.push('battle_end.payload.outcome 必须是 win 或 lose');
      break;
    default:
      break;
  }

  return { ok: errors.length === 0, errors };
}

/**
 * 校验整串演出事件（包含 seq 单调递增校验）。
 * @param {BattleEvent[]} events
 * @returns {ValidationResult}
 */
export function validateBattleEvents(events) {
  const errors = [];
  if (!Array.isArray(events)) {
    return { ok: false, errors: ['演出事件列表必须是数组'] };
  }
  let prevSeq = -1;
  events.forEach((ev, idx) => {
    const res = validateBattleEvent(ev);
    if (!res.ok) {
      for (const msg of res.errors) errors.push(`events[${idx}]: ${msg}`);
    }
    if (isPlainObject(ev) && isNonNegativeInt(ev.seq)) {
      if (ev.seq <= prevSeq) {
        errors.push(`events[${idx}].seq（${ev.seq}）必须严格大于上一条（${prevSeq}）`);
      }
      prevSeq = ev.seq;
    }
  });
  return { ok: errors.length === 0, errors };
}

/**
 * 校验战斗结果（battle-rules -> run-rules）。
 * 重点守住边界：包含打完后的宝石等级和打死的怪，且明确禁止携带掉落字段。
 * @param {BattleResult} result
 * @returns {ValidationResult}
 */
export function validateBattleResult(result) {
  const errors = [];
  if (!isPlainObject(result)) {
    return { ok: false, errors: ['战斗结果必须是对象'] };
  }
  if (result.schemaVersion !== SCHEMA_VERSION) {
    errors.push(`schemaVersion 必须为 ${SCHEMA_VERSION}`);
  }
  for (const key of FORBIDDEN_RESULT_KEYS) {
    if (key in result) {
      errors.push(`战斗结果不管掉落，禁止包含字段：${key}`);
    }
  }
  if (!BATTLE_OUTCOMES.includes(result.outcome)) {
    errors.push('outcome 必须是 win 或 lose');
  }
  if (!isValidHalfStep(result.remainingHearts)) errors.push('remainingHearts 必须是 0.5 步进的非负数');
  if (!isValidHalfStep(result.maxHearts) || result.maxHearts <= 0) {
    errors.push('maxHearts 必须是 0.5 步进的正数');
  } else if (isValidHalfStep(result.remainingHearts) && result.remainingHearts > result.maxHearts) {
    errors.push('remainingHearts 不能大于 maxHearts');
  }
  if (result.outcome === 'lose' && result.remainingHearts !== 0) {
    errors.push('outcome 为 lose 时，remainingHearts 必须为 0');
  }

  checkGemLevels(result.gemLevels, 'gemLevels', errors, false);

  if (!Array.isArray(result.defeatedMonsters)) {
    errors.push('defeatedMonsters 必须是数组');
  } else {
    result.defeatedMonsters.forEach((m, idx) => {
      const mp = `defeatedMonsters[${idx}]`;
      if (!isPlainObject(m)) {
        errors.push(`${mp} 必须是对象`);
        return;
      }
      if (!isNonEmptyString(m.uid)) errors.push(`${mp}.uid 必须是非空字符串`);
      if (!isNonEmptyString(m.defId)) errors.push(`${mp}.defId 必须是非空字符串`);
      if (!MONSTER_TIERS.includes(m.tier)) errors.push(`${mp}.tier 不合法`);
    });
  }

  if (!Array.isArray(result.encounteredMonsters) || !result.encounteredMonsters.every(isNonEmptyString)) {
    errors.push('encounteredMonsters 必须是非空字符串数组');
  }

  if (!isPlainObject(result.deckChanges)) {
    errors.push('deckChanges 必须是对象');
  } else {
    if (!Array.isArray(result.deckChanges.addedCards)) errors.push('deckChanges.addedCards 必须是数组');
    if (!Array.isArray(result.deckChanges.removedCardUids) || !result.deckChanges.removedCardUids.every(isNonEmptyString)) {
      errors.push('deckChanges.removedCardUids 必须是非空字符串数组');
    }
  }

  if (!isPlainObject(result.stats)) {
    errors.push('stats 必须是对象');
  } else {
    const s = result.stats;
    for (const k of ['turns', 'rainbowCount', 'maxChainLength', 'shieldBreaks']) {
      if (!isNonNegativeInt(s[k])) errors.push(`stats.${k} 必须是非负整数`);
    }
    if (!isValidHalfStep(s.heartsLost)) errors.push('stats.heartsLost 必须是 0.5 步进的非负数');
    if (!isFiniteNumber(s.totalDamage) || s.totalDamage < 0) errors.push('stats.totalDamage 必须是非负数字');
    if (!isFiniteNumber(s.maxSingleHit) || s.maxSingleHit < 0) errors.push('stats.maxSingleHit 必须是非负数字');
  }

  return { ok: errors.length === 0, errors };
}

/** 生成空的各色剩余统计表（便于测试与构造样本） */
export function createEmptyDrawPileByColor() {
  const counts = {};
  for (const color of CARD_COLORS) counts[color] = 0;
  return counts;
}
