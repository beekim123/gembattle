// modules/content/ 唯一对外入口。
// 阶段 1 只放战斗内容数据（29 张宝石牌、8 种功能牌、5 种核心仗 + 2 种拓展仗），不碰画面。

import { SCHEMA_VERSION } from '../shared/index.js';
import {
  ALL_CARD_DEFS,
  FUNCTION_CARD_DEFS,
  FUNCTION_CARD_LIST,
  GEM_CARD_DEFS,
  JUNK_CARD_DEFS,
  buildDeck,
  instantiateCard,
} from './cards/cards.js';
import {
  ALL_ENCOUNTERS,
  ENCOUNTERS,
  PLAYER_PRESETS,
  STAGE1_CORE_ENCOUNTERS,
} from './monsters/encounters.js';

export {
  GEM_CARD_DEFS,
  FUNCTION_CARD_DEFS,
  FUNCTION_CARD_LIST,
  JUNK_CARD_DEFS,
  ALL_CARD_DEFS,
  instantiateCard,
  buildDeck,
  ENCOUNTERS,
  STAGE1_CORE_ENCOUNTERS,
  ALL_ENCOUNTERS,
  PLAYER_PRESETS,
};

/** 默认试打附带的功能牌套装选项 */
export const DECK_LOADOUTS = Object.freeze({
  pure_gems: Object.freeze({
    id: 'pure_gems',
    label: '纯 29 张宝石牌',
    extraCards: Object.freeze([]),
  }),
  all_8_functions: Object.freeze({
    id: 'all_8_functions',
    label: '29 宝石 + 8 种功能牌各 1 张',
    extraCards: Object.freeze(FUNCTION_CARD_LIST.map((c) => c.defId)),
  }),
  starter_4_functions: Object.freeze({
    id: 'starter_4_functions',
    label: '29 宝石 + 4 张常用功能牌',
    extraCards: Object.freeze(['fn_draw_2', 'fn_hit_percent_50', 'fn_shred_shield_2', 'fn_block_next']),
  }),
});

/** 默认规则开关（对应设计稿第 3 版默认值） */
export const DEFAULT_RULES_CONFIG = Object.freeze({
  drawMode: 'refill',
  freeKeepCount: 0,
  shieldActiveMultiplier: 0.75,
  shieldBrokenMultiplier: 1.5,
  shieldBreakPush: 1,
  initialCountdown: 4,
  maxHandSize: 12,
  showExactDamage: true,
  allowAutoArrange: true,
});

function cloneMonsters(monsters, initialCountdownOverride) {
  return monsters.map((m) => ({
    uid: m.uid,
    defId: m.defId,
    tier: m.tier,
    label: m.label,
    attackDamage: m.attackDamage,
    // 只有原本是标准倒计时 4 的怪，受全局 4/3 开关调整；倒计时短的特化怪保持自身短倒计时
    initialCountdown: (initialCountdownOverride && m.initialCountdown === 4)
      ? initialCountdownOverride
      : m.initialCountdown,
    bars: m.bars.map((bar) => ({
      maxHp: bar.maxHp,
      shields: bar.shields.map((s) => ({ color: s.color, max: s.max })),
      traits: bar.traits.map((tr) => ({
        id: tr.id,
        label: tr.label,
        effects: tr.effects.map((ef) => ({
          timing: ef.timing,
          action: ef.action,
          ...(ef.duration ? { duration: ef.duration } : {}),
          ...(ef.condition ? { condition: { ...ef.condition } } : {}),
          params: { ...(ef.params || {}) },
        })),
      })),
    })),
  }));
}

/**
 * 把遭遇配置、玩家预设、额外功能牌与开关组装成标准开战包（BattleStartPacket）。
 */
export function createBattlePacket({
  encounterId = 'dual_shield',
  presetId = null,
  extraCards = [],
  seed = 'code00-battle-1',
  rulesConfig = {},
  drawTarget = null,
} = {}) {
  const encounter = ENCOUNTERS[encounterId];
  if (!encounter) throw new Error(`未知的战斗遭遇：${encounterId}`);

  const preset = PLAYER_PRESETS[presetId || encounter.recommendedPreset] || PLAYER_PRESETS.tier_c;
  const mergedConfig = { ...DEFAULT_RULES_CONFIG, ...rulesConfig };

  return {
    schemaVersion: SCHEMA_VERSION,
    seed,
    rulesConfig: {
      drawMode: mergedConfig.drawMode,
      freeKeepCount: mergedConfig.freeKeepCount,
      shieldActiveMultiplier: mergedConfig.shieldActiveMultiplier,
      shieldBrokenMultiplier: mergedConfig.shieldBrokenMultiplier,
      shieldBreakPush: mergedConfig.shieldBreakPush,
      initialCountdown: mergedConfig.initialCountdown,
      maxHandSize: mergedConfig.maxHandSize,
    },
    player: {
      deck: buildDeck(extraCards),
      stats: { ...preset.stats },
      drawTarget: drawTarget ?? preset.drawTarget,
      hearts: preset.hearts,
      maxHearts: preset.maxHearts,
      buffs: [],
      allies: [],
      gearTraits: [],
      gemLevels: {
        red: { level: 1, exp: 0 },
        green: { level: 1, exp: 0 },
        blue: { level: 1, exp: 0 },
      },
    },
    monsters: cloneMonsters(encounter.monsters, mergedConfig.initialCountdown),
  };
}
