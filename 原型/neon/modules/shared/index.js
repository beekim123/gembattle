// modules/shared/ 唯一对外入口。
// 其他模块只能导入这个文件，不许深入目录内部。

export {
  PRIMARY_GEMS,
  COLOR_RING,
  SEVEN_COLORS,
  CARD_COLORS,
  BASE_GEM_DECK_TOTAL,
  CHAIN_RELATIONS,
  CHAIN_RELATION_LIST,
  CHAIN_RELATION_LABELS,
  COLOR_META,
  isPrimaryGem,
  isRingColor,
  isSevenColor,
  isCardColor,
  getColorMeta,
} from './colors.js';

export {
  EFFECT_SOURCES,
  EFFECT_SOURCE_LIST,
  EFFECT_SOURCE_LABELS,
  TIMINGS,
  TIMING_LIST,
  TIMING_LABELS,
  ACTION_DURATIONS,
  ACTION_DURATION_LIST,
  ACTION_DURATION_LABELS,
  RETRIGGER_POLICIES,
  RETRIGGER_POLICY_LIST,
  RETRIGGER_POLICY_LABELS,
  ACTIONS,
  ACTION_LIST,
  DEFAULT_ACTION_TABLE,
} from './timings-actions.js';

export { createRng } from './rng.js';

export {
  SCHEMA_VERSION,
  CARD_KINDS,
  CARD_USAGES,
  MONSTER_TIERS,
  ALLY_ROLES,
  ALLY_MODES,
  GEAR_SLOTS,
  BATTLE_PHASES,
  BATTLE_OUTCOMES,
  BATTLE_EVENT_TYPES,
  BATTLE_EVENT_TYPE_LIST,
  validateActionTable,
  validateEffect,
  validateBattleStartPacket,
  validateBattleSnapshot,
  validateBattlePreview,
  validateBattleEvent,
  validateBattleEvents,
  validateBattleResult,
  createEmptyDrawPileByColor,
} from './contracts.js';
