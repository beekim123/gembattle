// modules/content/ 唯一对外入口。
// 阶段 1 只放战斗内容数据（29 张宝石牌、8 种功能牌、5 种核心仗 + 2 种拓展仗），不碰画面。

import { SCHEMA_VERSION } from '../shared/index.js';
import {
  ALL_CARD_DEFS,
  FUNCTION_CARD_DEFS,
  FUNCTION_CARD_LIST,
  GEM_CARD_DEFS,
  JUNK_CARD_DEFS,
  FUNCTION_ENHANCE,
  buildDeck,
  instantiateCard,
} from './cards/cards.js';
import { ZONES } from './zones/forest.js';
import { EVENT_DEFS, EVENT_LIST } from './events/events.js';
import { HIDDEN_QUEST, QUEST_BOARD, QUEST_DEFS } from './quests/quests.js';
import { FREE_GEAR, GEAR_DEFS, GEAR_LIST, HERO_BASE } from './gear/gear.js';
import {
  ALL_ENCOUNTERS,
  ENCOUNTERS,
  PLAYER_PRESETS,
  CORE_ENCOUNTERS,
} from './monsters/encounters.js';
import { BUFF_DEFS, BUFF_LIST, BUFF_POOL, TRIAL_BUFF_IDS } from './buffs/buffs.js';
import { ALLY_DEFS, ALLY_LIST, TRIAL_ALLY_IDS } from './allies/allies.js';

export {
  GEM_CARD_DEFS,
  FUNCTION_CARD_DEFS,
  FUNCTION_CARD_LIST,
  JUNK_CARD_DEFS,
  ALL_CARD_DEFS,
  instantiateCard,
  buildDeck,
  ENCOUNTERS,
  CORE_ENCOUNTERS,
  ALL_ENCOUNTERS,
  PLAYER_PRESETS,
  BUFF_DEFS,
  BUFF_LIST,
  BUFF_POOL,
  ALLY_DEFS,
  ALLY_LIST,
  FUNCTION_ENHANCE,
  ZONES,
  EVENT_DEFS,
  EVENT_LIST,
  QUEST_DEFS,
  QUEST_BOARD,
  HIDDEN_QUEST,
  GEAR_DEFS,
  GEAR_LIST,
  FREE_GEAR,
  HERO_BASE,
};

/** 试打台默认带的加成、队友（阶段 1 那 4 个加成、2 个队友；试打台上能换） */
export { TRIAL_BUFF_IDS, TRIAL_ALLY_IDS };

function cloneEffects(effects) {
  return (effects || []).map((ef) => ({
    timing: ef.timing,
    action: ef.action,
    ...(ef.duration ? { duration: ef.duration } : {}),
    ...(ef.condition ? { condition: { ...ef.condition } } : {}),
    params: { ...(ef.params || {}) },
  }));
}

function buildBuffs(ids) {
  return ids.map((id) => {
    const def = BUFF_DEFS[id];
    if (!def) throw new Error(`未知的加成：${id}`);
    return { id: def.id, slot: def.slot, lane: def.lane, lanes: def.lanes, label: def.label, description: def.description, effects: cloneEffects(def.effects) };
  });
}

function buildAllies(ids) {
  return ids.map((id) => {
    const def = ALLY_DEFS[id];
    if (!def) throw new Error(`未知的队友：${id}`);
    return {
      id: def.id, role: def.role, roleTag: def.roleTag, mode: def.mode, label: def.label, description: def.description,
      usesPerBattle: def.remainingUses ?? null, effects: cloneEffects(def.effects),
    };
  });
}

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

/** 默认规则开关（对应设计稿默认值；摸牌是第 4 版 5.1） */
export const DEFAULT_RULES_CONFIG = Object.freeze({
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
  allowAutoArrange: true,
});

function cloneMonsters(monsters, initialCountdownOverride) {
  return monsters.map((m) => ({
    uid: m.uid,
    defId: m.defId,
    tier: m.tier,
    label: m.label,
    look: m.look || null,
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
  buffs = [],
  allies = [],
} = {}) {
  const encounter = ENCOUNTERS[encounterId];
  if (!encounter) throw new Error(`未知的战斗遭遇：${encounterId}`);

  const preset = PLAYER_PRESETS[presetId || encounter.recommendedPreset] || PLAYER_PRESETS.tier_c;
  const mergedConfig = { ...DEFAULT_RULES_CONFIG, ...rulesConfig };
  // 辅助队友塞进牌组的牌，跟着额外牌一起进
  const allyCards = allies.flatMap((id) => ALLY_DEFS[id]?.deckCards || []);

  return {
    schemaVersion: SCHEMA_VERSION,
    seed,
    rulesConfig: {
      drawMode: mergedConfig.drawMode,
      drawPerTurn: mergedConfig.drawPerTurn,
      handOverN: mergedConfig.handOverN,
      freeKeepCount: mergedConfig.freeKeepCount,
      shieldActiveMultiplier: mergedConfig.shieldActiveMultiplier,
      shieldBrokenMultiplier: mergedConfig.shieldBrokenMultiplier,
      shieldBreakPush: mergedConfig.shieldBreakPush,
      initialCountdown: mergedConfig.initialCountdown,
      maxHandSize: mergedConfig.maxHandSize,
    },
    player: {
      deck: buildDeck([...extraCards, ...allyCards]),
      stats: { ...preset.stats },
      drawTarget: drawTarget ?? preset.drawTarget,
      hearts: preset.hearts,
      maxHearts: preset.maxHearts,
      buffs: buildBuffs(buffs),
      allies: buildAllies(allies),
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

/** 29 张宝石牌的 defId（照固定牌组的顺序） */
export const BASE_DECK_DEF_IDS = Object.freeze(buildDeck([]).map((c) => c.defId));

/**
 * 给 run-rules 的内容包（纯数据）：run-rules 不认识 content，由 app/ 拼好传进去。
 */
export function createRunContent() {
  return {
    zones: ZONES,
    cardDefs: ALL_CARD_DEFS,
    baseDeck: BASE_DECK_DEF_IDS,
    functionCardList: FUNCTION_CARD_LIST,
    functionEnhance: FUNCTION_ENHANCE,
    junkCardId: Object.keys(JUNK_CARD_DEFS)[0],
    buffDefs: BUFF_DEFS,
    buffList: BUFF_POOL,
    allyDefs: ALLY_DEFS,
    encounters: ENCOUNTERS,
    events: EVENT_DEFS,
    eventList: EVENT_LIST,
    hiddenQuest: HIDDEN_QUEST,
    gearDefs: GEAR_DEFS,
    defaultRules: {
      drawMode: DEFAULT_RULES_CONFIG.drawMode,
      drawPerTurn: DEFAULT_RULES_CONFIG.drawPerTurn,
      handOverN: DEFAULT_RULES_CONFIG.handOverN,
      freeKeepCount: DEFAULT_RULES_CONFIG.freeKeepCount,
      shieldActiveMultiplier: DEFAULT_RULES_CONFIG.shieldActiveMultiplier,
      shieldBrokenMultiplier: DEFAULT_RULES_CONFIG.shieldBrokenMultiplier,
      shieldBreakPush: DEFAULT_RULES_CONFIG.shieldBreakPush,
      initialCountdown: DEFAULT_RULES_CONFIG.initialCountdown,
      maxHandSize: DEFAULT_RULES_CONFIG.maxHandSize,
    },
  };
}

/**
 * 照穿的装备算出主角的属性（设计稿 6.5、9.2）：底子 + 每件装备的数；小特性变成开战包的 gearTraits。
 * @param {{weapon?:string|null, armor?:string|null, trinket?:string|null}} equipped
 */
export function buildHeroLoadout(equipped = FREE_GEAR) {
  const stats = { attack: HERO_BASE.attack, damageBonus: HERO_BASE.damageBonus, critRate: HERO_BASE.critRate, critDamage: HERO_BASE.critDamage };
  let hearts = HERO_BASE.hearts;
  const gearTraits = [];
  for (const slot of ['weapon', 'armor', 'trinket']) {
    const id = equipped?.[slot];
    if (!id) continue;
    const g = GEAR_DEFS[id];
    if (!g) continue;
    for (const [k, v] of Object.entries(g.stats || {})) {
      if (k === 'hearts') hearts += v;
      else stats[k] = Math.round((stats[k] + v) * 1000) / 1000;
    }
    if (g.trait) gearTraits.push({ gearId: g.id, slot: g.slot, label: g.trait.label, effects: cloneEffects(g.trait.effects) });
  }
  return { stats, hearts, maxHearts: hearts, drawTarget: HERO_BASE.drawTarget, gearTraits };
}
