// 一仗的规则引擎（设计稿 5.1~5.9、10.3）。初始状态在 battle-state.js，动作在 actions.js，接链的算法在 chain-math.js，自动帮排在 arrange.js。
// 不碰 document / canvas / window，可直接跑在 Node 单测和假玩家模拟器里。

import {
  ACTIONS,
  ACTION_DURATIONS,
  BATTLE_EVENT_TYPES,
  CHAIN_RELATIONS,
  COLOR_META,
  COLOR_RING,
  PRIMARY_GEMS,
  SCHEMA_VERSION,
  TIMINGS,
  createEmptyDrawPileByColor,
  createRng,
  validateBattleStartPacket,
  RULE_KEYS,
} from '../shared/index.js';
import { executeAction } from './actions.js';
import { findBestChainOrder } from './arrange.js';
import {
  advanceRecordedColors,
  computeChainRelation,
  gemLevelMultiplier,
  gemLevelThreshold,
  pickColorsToRecord,
  resolveCardForChain,
} from './chain-math.js';

import { DEFAULT_CFG, buildMonsterState, cloneCard, getMonsterPassiveRule, initBarTurnCounters } from './battle-state.js';

/**
 * 创建一场战斗状态机实例。
 * @param {object} startPacket 符合 shared 约定的 BattleStartPacket
 * @param {object} [options]
 * @param {boolean} [options.showExactDamage=true] 预览里是否显示精确总伤害
 */
export function createBattle(startPacket, options = {}) {
  const check = validateBattleStartPacket(startPacket);
  if (!check.ok) {
    throw new Error(`开战包不合约定：\n${check.errors.join('\n')}`);
  }

  const cfg = {
    ...DEFAULT_CFG,
    ...(startPacket.rulesConfig || {}),
    ...(options.showExactDamage !== undefined ? { showExactDamage: options.showExactDamage } : {}),
  };

  const rng = createRng(startPacket.seed);

  // 牌堆与手牌
  const initialDeck = startPacket.player.deck.map(cloneCard);
  let drawPile = rng.shuffle(initialDeck);
  const discardPile = [];
  const hand = [];
  const chain = [];

  // 玩家状态
  const player = {
    stats: { ...startPacket.player.stats },
    drawTarget: startPacket.player.drawTarget,
    hearts: startPacket.player.hearts,
    maxHearts: startPacket.player.maxHearts,
    blocks: {
      thisTurn: 0,
      untilConsumed: 0,
      allyCharges: 0,
    },
    gemLevels: {
      red: { level: startPacket.player.gemLevels.red.level, exp: startPacket.player.gemLevels.red.exp },
      green: { level: startPacket.player.gemLevels.green.level, exp: startPacket.player.gemLevels.green.exp },
      blue: { level: startPacket.player.gemLevels.blue.level, exp: startPacket.player.gemLevels.blue.exp },
    },
    pendingGemExp: { red: 0, green: 0, blue: 0 },
    buffs: startPacket.player.buffs.map((b) => ({ ...b })),
    allies: startPacket.player.allies.map((a) => ({
      ...a,
      remainingUses: a.usesPerBattle ?? null,
    })),
    gearTraits: startPacket.player.gearTraits.map((g) => ({ ...g })),
  };

  // 怪状态
  const monsters = startPacket.monsters.map(buildMonsterState);

  // 回合与链状态
  let turn = 0;
  let phase = 'turn_start';
  let outcome = null;
  let currentColor = null;
  let recordedColors = new Set();
  let turnStartRecordedCount = 0;
  let selectedTargetUid = null;

  // 回合/链临时加成
  let turnDamageMods = { attack: 0, damageBonus: 0, critRate: 0, critDamage: 0, hitPercent: 0 };
  let battleDamageMods = { attack: 0, damageBonus: 0, critRate: 0, critDamage: 0, hitPercent: 0 };
  let chainDamageMods = { attack: 0, damageBonus: 0, critRate: 0, critDamage: 0, hitPercent: 0 };
  let battleRuleOverrides = {};
  let turnRuleOverrides = {};
  let chainRuleOverrides = {};
  /** 加成改的规则开没开（这条链 / 这回合 / 这一仗，哪层开了都算） */
  const ruleOn = (key) => Boolean(chainRuleOverrides[key] || turnRuleOverrides[key] || battleRuleOverrides[key]);
  /** 加成改的数（几层都给了就加起来；没给是 null） */
  const ruleVal = (key) => {
    const vals = [chainRuleOverrides[key], turnRuleOverrides[key], battleRuleOverrides[key]].filter((v) => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  };
  // 阶段 2 加成用的回合状态
  let turnStartKeptCount = 0; // 回合开始摸牌前，手里留着几张
  let turnStartShieldBreaks = 0; // 回合开始时一共破过几次盾（加成「破过盾，链尾补一轮白」看这回合破没破）
  let bonusDrawNextTurn = 0; // 下回合多几张（加成「一条链合白 2 次」）：先摸的、补到的、上限都多这几张
  let complementDrawUsedThisTurn = false;
  let complementsThisChain = 0;
  const colorAdvanceOpts = () => ({
    keepAll: ruleOn(RULE_KEYS.keepRecordedColors),
    keepOnComplement: ruleOn(RULE_KEYS.complementKeepsRecorded),
    rainbowKeepNeighbors: ruleOn(RULE_KEYS.rainbowKeepsNeighbors),
    keepOnBreak: ruleOn(RULE_KEYS.breakKeepsRecorded),
    rainbowNeed: COLOR_RING.length - (ruleVal(RULE_KEYS.rainbowNeedsFewer) || 0),
  });

  // 战绩与试玩统计（10.3 + 10.4）
  const defeatedMonsters = [];
  const encounteredMonsters = [...new Set(monsters.map((m) => m.defId))];
  const deckChanges = { addedCards: [], removedCardUids: [] };
  const stats = {
    turns: 0,
    rainbowCount: 0,
    maxChainLength: 0,
    heartsLost: 0,
    shieldBreaks: 0,
    totalDamage: 0,
    maxSingleHit: 0,
  };
  const metrics = {
    undoCount: 0,
    emptyTurns: 0,
    brokeBeforeFirstHit: false,
    everTookHit: false,
    turnRecords: [],
  };

  // 事件流
  let eventSeq = 0;
  let activeEvents = [];
  /** 预览空跑中（getPreview）：照打出去的算法算一遍，暴击按期望，算完把状态全换回来 */
  let dryRun = false;

  function emit(type, payload = {}) {
    eventSeq++;
    activeEvents.push({ seq: eventSeq, type, payload });
  }

  function flushEvents() {
    const out = activeEvents;
    activeEvents = [];
    return out;
  }

  function getAliveMonsters() {
    return monsters.filter((m) => m.alive);
  }

  function ensureValidTarget() {
    const alive = getAliveMonsters();
    if (alive.length === 0) {
      selectedTargetUid = null;
      return null;
    }
    const existing = alive.find((m) => m.uid === selectedTargetUid);
    if (existing) return existing;
    // 默认选倒计时最短的存活怪（设计稿 5.5）
    const best = alive.slice().sort((a, b) => a.countdown - b.countdown)[0];
    selectedTargetUid = best.uid;
    return best;
  }

  function getEffectiveStats() {
    return {
      attack: Math.max(1, player.stats.attack + battleDamageMods.attack + turnDamageMods.attack + chainDamageMods.attack),
      damageBonus: player.stats.damageBonus + battleDamageMods.damageBonus + turnDamageMods.damageBonus + chainDamageMods.damageBonus,
      hitPercent: turnDamageMods.hitPercent + battleDamageMods.hitPercent + chainDamageMods.hitPercent,
      critRate: Math.max(0, Math.min(1, player.stats.critRate + battleDamageMods.critRate + turnDamageMods.critRate + chainDamageMods.critRate)),
      critDamage: Math.max(1, player.stats.critDamage + battleDamageMods.critDamage + turnDamageMods.critDamage + chainDamageMods.critDamage),
    };
  }

  function drawOneCard(colorFilter = null) {
    if (drawPile.length === 0) {
      if (discardPile.length === 0) return null;
      drawPile = rng.shuffle(discardPile.splice(0));
    }
    let idx = drawPile.length - 1;
    if (colorFilter) {
      const foundIdx = drawPile.findIndex((c) => c.color === colorFilter);
      if (foundIdx >= 0) idx = foundIdx;
    }
    const [card] = drawPile.splice(idx, 1);
    card.hidden = false;
    if (hand.length >= cfg.maxHandSize) {
      // 第 3 版 5.1：满 12 张再摸到的直接进弃牌堆
      discardPile.push(card);
      return { card, overflowed: true };
    }
    hand.push(card);
    return { card, overflowed: false };
  }

  /** 5.1 摸牌：手里留着 kept 张，回合开始先摸几张（不算「不到 N 补到 N」那步） */
  function floorDrawCount(kept) {
    const freeKeep = Math.max(0, (cfg.freeKeepCount || 0) + (ruleVal(RULE_KEYS.extraFreeKeep) || 0));
    const cap = Math.min(cfg.maxHandSize, player.drawTarget + (cfg.handOverN ?? 1) + freeKeep + bonusDrawNextTurn);
    return Math.max(0, Math.min((cfg.drawPerTurn ?? 2) + bonusDrawNextTurn, cap - kept));
  }

  /** 5.1 摸牌：摸完手里不到几张就补到几张（平时 N；加成「合白 2 次」的下回合 N + 1） */
  function floorHandSize() {
    return Math.min(cfg.maxHandSize, player.drawTarget + bonusDrawNextTurn);
  }

  /** 手里留着 kept 张结束回合，下回合开始手里大概几张（不算牌堆摸空；给画面提示用） */
  function nextTurnHandSize(kept) {
    if (cfg.drawMode === 'draw_one') return Math.min(cfg.maxHandSize, kept + 1);
    if (cfg.drawMode === 'draw_floor') return Math.max(floorHandSize(), kept + floorDrawCount(kept));
    const freeKept = Math.min(kept, Math.max(0, (cfg.freeKeepCount || 0) + (ruleVal(RULE_KEYS.extraFreeKeep) || 0)));
    return Math.max(kept, Math.min(cfg.maxHandSize, player.drawTarget + freeKept + bonusDrawNextTurn));
  }

  function drawCards(count, colorFilter = null) {
    const drawnUids = [];
    const overflowUids = [];
    for (let i = 0; i < count; i++) {
      const res = drawOneCard(colorFilter);
      if (!res) break;
      if (res.overflowed) overflowUids.push(res.card.uid);
      else drawnUids.push(res.card.uid);
    }
    if (drawnUids.length > 0 || overflowUids.length > 0) {
      emit(BATTLE_EVENT_TYPES.CARDS_DRAWN, { drawnUids, overflowUids, count: drawnUids.length });
    }
  }

  // 动作执行上下文
  let activeChainMultRef = null;
  let activeExtraHitsQueue = null;

  const actionCtx = {
    rng,
    emit,
    getAliveMonsters,
    getSelectedMonster: () => ensureValidTarget(),
    getCurrentColor: () => currentColor,
    getRecordedColors: () => recordedColors,
    drawCards,
    addTurnDamageMod(stat, val) {
      turnDamageMods[stat] = (turnDamageMods[stat] || 0) + val;
    },
    addBattleDamageMod(stat, val) {
      battleDamageMods[stat] = (battleDamageMods[stat] || 0) + val;
    },
    addChainDamageMod(stat, val) {
      chainDamageMods[stat] = (chainDamageMods[stat] || 0) + val;
    },
    modifyCurrentChainMultiplier(fn) {
      if (activeChainMultRef) activeChainMultRef.value = fn(activeChainMultRef.value);
    },
    addBlock(count, duration) {
      if (duration === ACTION_DURATIONS.THIS_TURN) {
        player.blocks.thisTurn += count;
      } else {
        player.blocks.untilConsumed += count;
      }
      emit(BATTLE_EVENT_TYPES.BLOCK_CHANGED, { blocks: { ...player.blocks } });
    },
    healHearts(amount) {
      const before = player.hearts;
      player.hearts = Math.min(player.maxHearts, Math.round((player.hearts + amount) * 2) / 2);
      if (player.hearts !== before) {
        emit(BATTLE_EVENT_TYPES.HEARTS_CHANGED, { before, after: player.hearts, delta: player.hearts - before });
      }
    },
    recordColorsDirectly(colors) {
      for (const c of colors) recordedColors.add(c);
      emit(BATTLE_EVENT_TYPES.EFFECT_TRIGGERED, {
        source: 'player',
        label: `记上颜色：${colors.map((c) => COLOR_META[c].label).join('、')}`,
        recordedColors: [...recordedColors],
      });
    },
    clearRecordedColors(sourceLabel) {
      if (recordedColors.size > 0) {
        recordedColors.clear();
        emit(BATTLE_EVENT_TYPES.EFFECT_TRIGGERED, {
          source: sourceLabel,
          label: '已集到的颜色被清空',
        });
      }
    },
    shredMonsterShieldDirect(mon, colorOpt, amount) {
      if (!mon || !mon.alive || mon.shieldBroken || mon.shields.length === 0) return;
      const targets = colorOpt === 'all'
        ? mon.shields.filter((s) => s.current > 0)
        : colorOpt === 'current'
          ? [mon.shields.find((s) => s.current > 0)].filter(Boolean)
          : mon.shields.filter((s) => s.color === colorOpt && s.current > 0);

      let anyShred = false;
      for (const sh of targets) {
        const cut = Math.min(sh.current, amount);
        if (cut > 0) {
          sh.current -= cut;
          anyShred = true;
          emit(BATTLE_EVENT_TYPES.SHIELD_SHRED, {
            targetUid: mon.uid,
            color: sh.color,
            amount: cut,
            remaining: sh.current,
          });
        }
      }
      if (anyShred) checkAndTriggerShieldBreak(mon);
    },
    shiftMonsterCountdown(mon, delta, sourceLabel) {
      if (!mon || !mon.alive) return;
      const before = mon.countdown;
      mon.countdown = Math.max(0, mon.countdown + delta);
      if (mon.countdown === 0 && before > 0 && phase === 'resolving') {
        // 第 3 版 5.5：链里把倒计时拨到 0，不打断链，记成这回合要出手
        mon.queuedAttackThisTurn = true;
      }
      emit(BATTLE_EVENT_TYPES.EFFECT_TRIGGERED, {
        source: sourceLabel,
        targetUid: mon.uid,
        label: `倒计时 ${delta > 0 ? `+${delta}` : delta}`,
        countdown: mon.countdown,
      });
    },
    dealBonusDamage(mon, { amount, scale, ignoreTraits, canCrit = false, sourceLabel }) {
      if (!mon || !mon.alive) return;
      const eff = getEffectiveStats();
      const base = scale === 'attackRatio' ? Math.round(eff.attack * amount) : Math.round(amount);
      if (base <= 0) return;
      applyRawHitsToMonster(mon, {
        hits: 1,
        perHitBase: base,
        canCrit: Boolean(canCrit),
        ignoreTraits,
        cardColor: 'white',
        isWhite: false,
        isRainbow: false,
        sourceLabel,
      });
    },
    /** 加成「破过盾，链尾全体补一轮白」：红绿蓝各打「链尾倍率」发，白色伤害，不削盾 */
    dealWhiteRound(targetMode, sourceLabel) {
      const mult = activeChainMultRef ? activeChainMultRef.value : 1;
      const eff = getEffectiveStats();
      const baseDmgMod = 1 + eff.damageBonus + eff.hitPercent;
      const targets = targetMode === 'selected' ? [ensureValidTarget()].filter(Boolean) : getAliveMonsters();
      emit(BATTLE_EVENT_TYPES.EFFECT_TRIGGERED, { source: sourceLabel, label: `全体吃一轮白 ×${mult}` });
      for (const gem of PRIMARY_GEMS) {
        const perHitBase = eff.attack * gemLevelMultiplier(player.gemLevels[gem].level) * baseDmgMod;
        for (const mon of targets) {
          if (!mon.alive) continue;
          applyRawHitsToMonster(mon, {
            hits: mult,
            perHitBase,
            canCrit: true,
            ignoreTraits: false,
            cardColor: 'white',
            isWhite: true,
            isRainbow: false,
            allowRetargetOnKill: false,
            sourceLabel,
          });
        }
      }
    },
    setRuleOverride(ruleKey, value, duration) {
      if (duration === ACTION_DURATIONS.THIS_CHAIN) chainRuleOverrides[ruleKey] = value;
      else if (duration === ACTION_DURATIONS.THIS_TURN) turnRuleOverrides[ruleKey] = value;
      else battleRuleOverrides[ruleKey] = value;
    },
    hideRandomHandCards(count, monsterUid) {
      const visibleCards = hand.filter((c) => !c.hidden);
      const picked = rng.shuffle(visibleCards).slice(0, count);
      for (const c of picked) {
        c.hidden = true;
        emit(BATTLE_EVENT_TYPES.CARD_HIDDEN, { cardUid: c.uid, monsterUid });
      }
    },
    injectCards(defId, count, dest) {
      for (let i = 0; i < count; i++) {
        const card = {
          uid: `injected-${turn}-${i}-${Math.floor(rng.next() * 1e6)}`,
          defId,
          kind: 'junk',
          usage: 'instant',
          color: 'colorless',
          gems: [],
          enhanced: false,
          drawAfterPlay: 0,
          label: '没用的牌',
          description: '怪塞进来的牌',
          effects: [],
          hidden: false,
        };
        deckChanges.addedCards.push({ uid: card.uid, defId: card.defId });
        if (dest === 'hand' && hand.length < cfg.maxHandSize) hand.push(card);
        else if (dest === 'draw') drawPile.splice(Math.floor(rng.next() * (drawPile.length + 1)), 0, card);
        else discardPile.push(card);
      }
    },
    addGemExp(color, amount) {
      const list = color === 'all' ? PRIMARY_GEMS : [color];
      for (const g of list) {
        if (g in player.pendingGemExp) player.pendingGemExp[g] += amount;
      }
    },
    addExtraHits(count, scaleByMultiplier, gemColor) {
      if (activeExtraHitsQueue) {
        activeExtraHitsQueue.push({ count, scaleByMultiplier, gemColor });
      }
    },
  };

  function triggerEffects(timing, extraMeta = {}) {
    // 玩家加成
    for (const buff of player.buffs) {
      for (const ef of buff.effects || []) {
        if (ef.timing === timing) executeAction(actionCtx, ef, { sourceLabel: buff.label, ...extraMeta });
      }
    }
    // 装备小特性
    for (const gt of player.gearTraits) {
      for (const ef of gt.effects || []) {
        if (ef.timing === timing) executeAction(actionCtx, ef, { sourceLabel: gt.label, ...extraMeta });
      }
    }
    // 队友
    for (const ally of player.allies) {
      for (const ef of ally.effects || []) {
        if (ef.timing === timing) {
          if (ally.remainingUses !== null && ally.remainingUses <= 0) continue;
          // 先报「队友出手」，再出伤害，画面上先看到他动再看到数
          emit(BATTLE_EVENT_TYPES.ALLY_ACTION, { allyId: ally.id, label: ally.label, timing });
          executeAction(actionCtx, ef, { sourceLabel: ally.label, ...extraMeta });
          if (ally.remainingUses !== null) ally.remainingUses--;
        }
      }
    }
  }

  function triggerMonsterTraits(monster, timing) {
    const bar = monster.bars[monster.barIndex];
    if (!bar) return;
    for (const tr of bar.traits) {
      for (const ef of tr.effects) {
        if (ef.timing === timing) {
          executeAction(actionCtx, ef, { monster, sourceLabel: tr.label });
        }
      }
    }
  }

  function checkAndTriggerShieldBreak(mon) {
    if (!mon.alive || mon.shieldBroken || mon.shields.length === 0) return false;
    if (!mon.shields.every((s) => s.current <= 0)) return false;

    mon.shieldBroken = true;
    stats.shieldBreaks++;
    if (!metrics.everTookHit) metrics.brokeBeforeFirstHit = true;

    // 第 3 版 5.5：特性如「每被破一次盾倒计时 -1」盖掉基础推 1 格
    const traitDelta = getMonsterPassiveRule(mon, RULE_KEYS.shieldBreakCountdownDelta);
    // 加成「破盾更疼但不推倒计时」：基础推的那 1 格没了（怪的特性照旧）
    const baseDelta = typeof traitDelta === 'number' ? traitDelta : (ruleOn(RULE_KEYS.noBreakPush) ? 0 : cfg.shieldBreakPush);

    const beforeCd = mon.countdown;
    mon.countdown = Math.max(0, mon.countdown + baseDelta);
    if (mon.countdown === 0 && beforeCd > 0 && phase === 'resolving') {
      mon.queuedAttackThisTurn = true;
    }

    emit(BATTLE_EVENT_TYPES.SHIELD_BREAK, {
      targetUid: mon.uid,
      countdownDelta: baseDelta,
      countdownAfter: mon.countdown,
    });

    // 触发玩家方「破盾时」效果（例如队友额外推格或补刀，不受怪特性覆盖）
    triggerEffects(TIMINGS.ON_SHIELD_BREAK, { monster: mon });
    return true;
  }

  function getShieldDamageFactor(mon) {
    if (mon.shields.length === 0) return 1;
    return mon.shieldBroken ? brokenMult() : cfg.shieldActiveMultiplier;
  }

  function brokenMult() {
    return ruleVal(RULE_KEYS.brokenMultiplier) ?? cfg.shieldBrokenMultiplier;
  }

  function getMonsterTraitDamageFactor(mon, cardColor, ignoreTraits) {
    if (ignoreTraits) return 1;
    let factor = 1;

    // 特性：回合开始时已集到几种颜色，少受几成（5.8，按回合开始时的数算）
    const dimPer = getMonsterPassiveRule(mon, RULE_KEYS.damageReductionPerRecordedColor);
    if (typeof dimPer === 'number' && dimPer > 0 && turnStartRecordedCount > 0) {
      factor *= Math.max(0.1, 1 - dimPer * turnStartRecordedCount);
    }

    // 特性：每回合挑色环上一种颜色伤害减半（按牌颜色算，白不受此减半）
    if (mon.turnHalvedColor && cardColor === mon.turnHalvedColor) {
      factor *= 0.5;
    }
    return factor;
  }

  function switchToNextBar(mon) {
    mon.barIndex++;
    if (mon.barIndex >= mon.bars.length) {
      mon.alive = false;
      mon.hp = 0;
      defeatedMonsters.push({ uid: mon.uid, defId: mon.defId, tier: mon.tier });
      emit(BATTLE_EVENT_TYPES.MONSTER_DEFEATED, { targetUid: mon.uid, defId: mon.defId, tier: mon.tier });
      ensureValidTarget();
      return false;
    }
    const nextBar = mon.bars[mon.barIndex];
    mon.maxHp = nextBar.maxHp;
    mon.hp = nextBar.maxHp;
    mon.shields = nextBar.shields.map((s) => ({ color: s.color, current: s.max, max: s.max }));
    mon.shieldBroken = false;
    initBarTurnCounters(mon);
    emit(BATTLE_EVENT_TYPES.BAR_SWITCHED, {
      targetUid: mon.uid,
      barIndex: mon.barIndex,
      maxHp: mon.maxHp,
      shields: mon.shields.map((s) => ({ color: s.color, current: s.current, max: s.max })),
    });
    return true;
  }

  /**
   * 对一只怪打出一批相同参数的发（支持暴击、打包、前 N 发不掉血、多重血条溢出、单攻死亡转火）。
   * 返回 { dealtTotal, barCleared }。
   */
  function applyRawHitsToMonster(initialTarget, {
    hits,
    perHitBase,
    canCrit,
    ignoreTraits,
    cardColor,
    isWhite,
    isRainbow,
    allowRetargetOnKill = false,
    sourceLabel = '',
  }) {
    if (hits <= 0) return { dealtTotal: 0, barCleared: false };
    const eff = getEffectiveStats();
    let target = initialTarget;
    let remainingHits = hits;
    let dealtTotal = 0;
    let initialBarCleared = false;
    const initialBarIndex = initialTarget.barIndex;

    // 计算暴击与非暴击发数（发数 <= 400 逐发判；> 400 用正态近似/期望拆分，保持性能与期望一致）
    // 预览空跑时不掷骰子：每发都按暴击的期望算
    const expectedCrit = canCrit ? 1 + eff.critRate * (eff.critDamage - 1) : 1;
    let critHits = 0;
    if (canCrit && eff.critRate > 0 && !dryRun) {
      if (remainingHits <= 400) {
        for (let i = 0; i < remainingHits; i++) {
          if (rng.chance(eff.critRate)) critHits++;
        }
      } else {
        // 大发数保持随机波动同时 O(1) 计算
        const mean = remainingHits * eff.critRate;
        const std = Math.sqrt(remainingHits * eff.critRate * (1 - eff.critRate));
        const u = (rng.next() + rng.next() + rng.next() - 1.5) * 1.15;
        critHits = Math.max(0, Math.min(remainingHits, Math.round(mean + u * std)));
      }
    }
    let normalHits = remainingHits - critHits;

    // 按普通组与暴击组拆分成适量演出包（最多约 24 包，万发也不卡画面）
    const groups = [];
    const buildBuckets = (total, isCrit) => {
      if (total <= 0) return;
      const maxPackets = isCrit ? 6 : 16;
      const packetCount = Math.min(total, maxPackets);
      const baseEach = Math.floor(total / packetCount);
      let rem = total - baseEach * packetCount;
      for (let i = 0; i < packetCount; i++) {
        groups.push({ count: baseEach + (rem-- > 0 ? 1 : 0), isCrit });
      }
    };
    buildBuckets(normalHits, false);
    buildBuckets(critHits, true);

    for (const grp of groups) {
      let left = grp.count;
      while (left > 0) {
        if (!target || !target.alive) {
          if (!allowRetargetOnKill) break;
          target = getAliveMonsters()[0] || null;
          if (!target) break;
        }

        // 先扣掉当前血条的「前 N 发不掉血」
        if (!ignoreTraits && target.turnIgnoredHitsLeft > 0) {
          const blocked = Math.min(left, target.turnIgnoredHitsLeft);
          target.turnIgnoredHitsLeft -= blocked;
          left -= blocked;
          emit(BATTLE_EVENT_TYPES.DAMAGE_PACKET, {
            targetUid: target.uid,
            damage: 0,
            perHitDamage: 0,
            hitsInPacket: blocked,
            isCrit: grp.isCrit,
            color: cardColor,
            isWhite,
            isRainbow,
            ignored: true,
            sourceLabel,
          });
          if (left <= 0) break;
        }

        const shieldFactor = getShieldDamageFactor(target);
        const traitFactor = getMonsterTraitDamageFactor(target, cardColor, ignoreTraits);
        const critFactor = dryRun ? expectedCrit : (grp.isCrit ? eff.critDamage : 1);
        const perHit = Math.max(1, Math.round(perHitBase * critFactor * shieldFactor * traitFactor));

        if (perHit > stats.maxSingleHit) stats.maxSingleHit = perHit;

        // 算这包里需要多少发能把当前血条打空，剩下的发按新血条重新算（第 3 版 5.5 溢出细则）
        const hitsToKillBar = Math.ceil(target.hp / perHit);
        if (left < hitsToKillBar) {
          const dmg = left * perHit;
          target.hp -= dmg;
          dealtTotal += dmg;
          stats.totalDamage += dmg;
          emit(BATTLE_EVENT_TYPES.DAMAGE_PACKET, {
            targetUid: target.uid,
            damage: dmg,
            perHitDamage: perHit,
            hitsInPacket: left,
            isCrit: grp.isCrit,
            color: cardColor,
            isWhite,
            isRainbow,
            sourceLabel,
          });
          left = 0;
        } else {
          // 刚好打空当前血条（最后那一发的溢出也按比例折算到下一条）
          const exactHits = hitsToKillBar;
          const totalRawAtOldBar = exactHits * perHit;
          const overflowAtOldBar = totalRawAtOldBar - target.hp;
          const dealtToOldBar = target.hp;

          target.hp = 0;
          dealtTotal += dealtToOldBar;
          stats.totalDamage += dealtToOldBar;
          emit(BATTLE_EVENT_TYPES.DAMAGE_PACKET, {
            targetUid: target.uid,
            damage: dealtToOldBar,
            perHitDamage: perHit,
            hitsInPacket: exactHits,
            isCrit: grp.isCrit,
            color: cardColor,
            isWhite,
            isRainbow,
            sourceLabel,
          });

          if (target === initialTarget && target.barIndex === initialBarIndex) {
            initialBarCleared = true;
          }

          left -= exactHits;
          const hasNextBar = switchToNextBar(target);

          // 同一发里的溢出伤害按新血条倍率与新血条特性折算
          if (overflowAtOldBar > 0 && hasNextBar) {
            if (ignoreTraits || target.turnIgnoredHitsLeft <= 0) {
              const newShieldFactor = getShieldDamageFactor(target);
              const newTraitFactor = getMonsterTraitDamageFactor(target, cardColor, ignoreTraits);
              const oldScale = Math.max(0.01, shieldFactor * traitFactor);
              const converted = Math.max(1, Math.round((overflowAtOldBar / oldScale) * newShieldFactor * newTraitFactor));
              const actualOverflow = Math.min(target.hp, converted);
              target.hp -= actualOverflow;
              dealtTotal += actualOverflow;
              stats.totalDamage += actualOverflow;
              emit(BATTLE_EVENT_TYPES.DAMAGE_PACKET, {
                targetUid: target.uid,
                damage: actualOverflow,
                perHitDamage: actualOverflow,
                hitsInPacket: 1,
                isCrit: grp.isCrit,
                color: cardColor,
                isWhite,
                isRainbow,
                overflow: true,
                sourceLabel,
              });
              if (target.hp <= 0) switchToNextBar(target);
            } else {
              target.turnIgnoredHitsLeft = Math.max(0, target.turnIgnoredHitsLeft - 1);
            }
          }
        }
      }
    }

    return { dealtTotal, barCleared: initialBarCleared };
  }

  function startTurn() {
    turn++;
    stats.turns = turn;
    phase = 'turn_start';
    turnDamageMods = { attack: 0, damageBonus: 0, critRate: 0, critDamage: 0, hitPercent: 0 };
    turnRuleOverrides = {};
    turnStartRecordedCount = recordedColors.size;
    turnStartKeptCount = hand.length;
    turnStartShieldBreaks = stats.shieldBreaks;
    complementDrawUsedThisTurn = false;

    // 取消上回合「本回合」挡与怪的回合临时标记
    player.blocks.thisTurn = 0;
    for (const mon of monsters) {
      mon.queuedAttackThisTurn = false;
      if (mon.alive) initBarTurnCounters(mon);
    }
    // 上回合被遮住的手牌若还在手里，解除旧遮盖，由新回合特性重新判定
    for (const c of hand) c.hidden = false;

    emit(BATTLE_EVENT_TYPES.TURN_START, { turn });

    // 5.1 回合开始 1：摸牌 / 补牌
    if (cfg.drawMode === 'draw_one') {
      const toDraw = turn === 1 ? Math.max(1, Math.min(3, player.drawTarget)) : 1;
      drawCards(toDraw);
    } else if (cfg.drawMode === 'draw_floor') {
      // 先摸 2 张，摸完不到 N 就补到 N；回合开始手里最多 N + 1 张（加成「上限多 1 张」再往上加）：管住「攒几回合一把打爆」。
      // 加成「合白 2 次」给的下回合多 1 张：先摸的、补到的、上限都 +1。
      // 回合中间「马上摸几张」不受这条管，照旧最多 12 张。
      const toDraw = floorDrawCount(hand.length);
      const floorN = floorHandSize();
      bonusDrawNextTurn = 0;
      if (toDraw > 0) drawCards(toDraw);
      if (hand.length < floorN) drawCards(floorN - hand.length);
    } else {
      // 补到 N 张；如开启 freeKeepCount，留下的前 K 张不占名额（第 3 版开关）
      const kept = hand.length;
      const freeKept = Math.min(kept, Math.max(0, (cfg.freeKeepCount || 0) + (ruleVal(RULE_KEYS.extraFreeKeep) || 0)));
      const targetHand = Math.min(cfg.maxHandSize, player.drawTarget + freeKept + bonusDrawNextTurn);
      bonusDrawNextTurn = 0;
      const need = Math.max(0, targetHand - kept);
      if (need > 0) drawCards(need);
    }

    // 5.1 回合开始 2：怪的「每回合开始」特性
    for (const mon of getAliveMonsters()) {
      triggerMonsterTraits(mon, TIMINGS.TURN_START);
    }

    // 5.1 回合开始 3：玩家加成、装备的「每回合开始」效果
    triggerEffects(TIMINGS.TURN_START);

    // 5.1 回合开始 4：「出牌前」队友出手
    triggerEffects(TIMINGS.BEFORE_PLAY);

    ensureValidTarget();
    phase = 'player_input';
  }

  // 开战时初始化
  ensureValidTarget();
  triggerEffects(TIMINGS.BATTLE_START);
  startTurn();
  const initialEvents = flushEvents();

  /** 实时计算当前排链的尾色（用于高亮手牌能接/合白/断色） */
  function getPreviewChainTailColor() {
    let cursor = currentColor;
    for (const card of chain) {
      if (card.hidden) return null; // 链里含被遮住牌时不再推算未知颜色
      const resolved = resolveCardForChain(card, cursor);
      cursor = resolved.color;
    }
    return cursor;
  }

  function getSnapshot() {
    const tailColor = getPreviewChainTailColor();
    const byColor = createEmptyDrawPileByColor();
    for (const c of drawPile) {
      if (c.color in byColor) byColor[c.color]++;
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      turn,
      phase,
      outcome,
      currentColor,
      recordedColors: [...recordedColors],
      selectedTargetUid,
      player: {
        hearts: player.hearts,
        maxHearts: player.maxHearts,
        drawTarget: player.drawTarget,
        maxHandSize: cfg.maxHandSize,
        // 留着手里这些牌（链上的会打出去）结束回合，下回合开始手里几张（5.1 第 4 版，给画面提示）
        nextTurnHand: nextTurnHandSize(hand.length),
        stats: {
          attack: getEffectiveStats().attack,
          damageBonus: getEffectiveStats().damageBonus + getEffectiveStats().hitPercent,
          critRate: getEffectiveStats().critRate,
          critDamage: getEffectiveStats().critDamage,
        },
        blocks: { ...player.blocks },
        gemLevels: {
          red: { ...player.gemLevels.red, nextExp: gemLevelThreshold(player.gemLevels.red.level) },
          green: { ...player.gemLevels.green, nextExp: gemLevelThreshold(player.gemLevels.green.level) },
          blue: { ...player.gemLevels.blue, nextExp: gemLevelThreshold(player.gemLevels.blue.level) },
        },
        buffs: player.buffs.map((b) => ({ id: b.id, label: b.label, lane: b.lane ?? null, description: b.description ?? '' })),
        allies: player.allies.map((a) => ({
          id: a.id,
          role: a.role,
          roleTag: a.roleTag ?? null,
          mode: a.mode,
          label: a.label,
          description: a.description ?? '',
          remainingUses: a.remainingUses,
        })),
        gearTraits: player.gearTraits.map((g) => ({ gearId: g.gearId, slot: g.slot, label: g.label })),
      },
      hand: hand.map((card) => {
        if (card.hidden) {
          // 第 3 版严格防泄漏：被遮住的牌只给遮住态，不给真实颜色、宝石、defId
          return {
            uid: card.uid,
            hidden: true,
            color: null,
            gems: null,
            relationToCurrent: CHAIN_RELATIONS.HIDDEN,
            label: '已遮住',
          };
        }
        const rel = card.usage === 'instant'
          ? CHAIN_RELATIONS.INSTANT
          : computeChainRelation(card, tailColor);
        return {
          uid: card.uid,
          hidden: false,
          defId: card.defId,
          kind: card.kind,
          usage: card.usage,
          color: card.color,
          gems: [...card.gems],
          relationToCurrent: rel,
          label: card.label,
          description: card.description,
          enhanced: card.enhanced,
          // 强化的方向（6.3）：pain / more / shred / record，功能牌加数是 number；画面在牌角上标记号
          enhanceDir: card.enhance?.dir ?? null,
          drawAfterPlay: card.drawAfterPlay,
        };
      }),
      chain: chain.map((card) => {
        if (card.hidden) {
          return { uid: card.uid, hidden: true, color: null, label: '已遮住' };
        }
        return {
          uid: card.uid,
          hidden: false,
          defId: card.defId,
          kind: card.kind,
          usage: card.usage,
          color: card.color,
          gems: [...card.gems],
          label: card.label,
          enhanced: card.enhanced,
        };
      }),
      drawPileCount: drawPile.length,
      drawPileByColor: byColor,
      discardPileCount: discardPile.length,
      monsters: monsters.map((m) => {
        const bar = m.bars[m.barIndex] || m.bars[m.bars.length - 1];
        return {
          uid: m.uid,
          defId: m.defId,
          tier: m.tier,
          label: m.label,
          look: m.look,
          alive: m.alive,
          barIndex: Math.min(m.barIndex, m.bars.length - 1),
          totalBars: m.bars.length,
          hp: m.hp,
          maxHp: m.maxHp,
          shields: m.shields.map((s) => ({ color: s.color, current: s.current, max: s.max })),
          shieldBroken: m.shieldBroken,
          countdown: m.countdown,
          attacksDone: m.attacksDone,
          attackDamage: m.attackDamage,
          intentLabel: m.alive ? `${m.countdown} 回合后打 ${m.attackDamage} 心` : '已打倒',
          activeTraits: bar.traits.map((t) => ({
            id: t.id,
            label: t.label,
            ...(m.turnHalvedColor ? { halvedColor: m.turnHalvedColor } : {}),
            ...(m.turnIgnoredHitsLeft > 0 ? { ignoredHitsLeft: m.turnIgnoredHitsLeft } : {}),
          })),
        };
      }),
    };
  }

  /** 空跑要换回来的状态：怪换成复制品，别的都记下来 */
  function saveStateForDryRun() {
    const allCards = [...hand, ...chain, ...drawPile, ...discardPile];
    const saved = {
      monsters: monsters.slice(),
      hand: hand.slice(),
      chain: chain.slice(),
      drawPile: drawPile.slice(),
      discardPile: discardPile.slice(),
      hidden: allCards.map((c) => [c, c.hidden]),
      hearts: player.hearts,
      blocks: { ...player.blocks },
      pendingGemExp: { ...player.pendingGemExp },
      allyUses: player.allies.map((a) => a.remainingUses),
      recordedColors: new Set(recordedColors),
      currentColor,
      selectedTargetUid,
      phase,
      turnDamageMods: { ...turnDamageMods },
      battleDamageMods: { ...battleDamageMods },
      chainDamageMods: { ...chainDamageMods },
      battleRuleOverrides: { ...battleRuleOverrides },
      turnRuleOverrides: { ...turnRuleOverrides },
      chainRuleOverrides: { ...chainRuleOverrides },
      bonusDrawNextTurn,
      complementDrawUsedThisTurn,
      complementsThisChain,
      stats: { ...stats },
      brokeBeforeFirstHit: metrics.brokeBeforeFirstHit,
      everTookHit: metrics.everTookHit,
      defeatedCount: defeatedMonsters.length,
      addedCount: deckChanges.addedCards.length,
      removedCount: deckChanges.removedCardUids.length,
      events: activeEvents,
      eventSeq,
      rngState: rng.getState(),
      activeChainMultRef,
      activeExtraHitsQueue,
    };
    monsters.splice(0, monsters.length, ...saved.monsters.map((m) => ({ ...m, shields: m.shields.map((sh) => ({ ...sh })) })));
    return saved;
  }

  function restoreStateAfterDryRun(saved) {
    monsters.splice(0, monsters.length, ...saved.monsters);
    hand.splice(0, hand.length, ...saved.hand);
    chain.splice(0, chain.length, ...saved.chain);
    drawPile = saved.drawPile;
    discardPile.splice(0, discardPile.length, ...saved.discardPile);
    for (const [c, h] of saved.hidden) c.hidden = h;
    player.hearts = saved.hearts;
    player.blocks = saved.blocks;
    player.pendingGemExp = saved.pendingGemExp;
    player.allies.forEach((a, i) => { a.remainingUses = saved.allyUses[i]; });
    recordedColors = saved.recordedColors;
    currentColor = saved.currentColor;
    selectedTargetUid = saved.selectedTargetUid;
    phase = saved.phase;
    turnDamageMods = saved.turnDamageMods;
    battleDamageMods = saved.battleDamageMods;
    chainDamageMods = saved.chainDamageMods;
    battleRuleOverrides = saved.battleRuleOverrides;
    turnRuleOverrides = saved.turnRuleOverrides;
    chainRuleOverrides = saved.chainRuleOverrides;
    bonusDrawNextTurn = saved.bonusDrawNextTurn;
    complementDrawUsedThisTurn = saved.complementDrawUsedThisTurn;
    complementsThisChain = saved.complementsThisChain;
    Object.assign(stats, saved.stats);
    metrics.brokeBeforeFirstHit = saved.brokeBeforeFirstHit;
    metrics.everTookHit = saved.everTookHit;
    defeatedMonsters.length = saved.defeatedCount;
    deckChanges.addedCards.length = saved.addedCount;
    deckChanges.removedCardUids.length = saved.removedCount;
    activeEvents = saved.events;
    eventSeq = saved.eventSeq;
    rng.setState(saved.rngState);
    activeChainMultRef = saved.activeChainMultRef;
    activeExtraHitsQueue = saved.activeExtraHitsQueue;
  }

  /**
   * 预览（设计稿 5.3）：复制一份状态，照打出去的同一套算法（resolveChain）空跑这条链，读完结果换回来。
   * 暴击按期望算；链里有被遮住的牌，被遮住的那几张不算，总伤害不给（null）。
   */
  function getPreview() {
    const eff = getEffectiveStats();
    const visible = chain.filter((c) => !c.hidden);
    const hasHiddenInChain = visible.length !== chain.length;
    let out = { finalMultiplier: 1, rainbowTriggered: false, totalHits: 0, steps: [] };
    let totalDamage = 0;
    let recordedAfter = recordedColors.size;
    const byMonster = {};
    const expectedBreakUids = new Set();
    const primaryUid = ensureValidTarget()?.uid ?? null;
    for (const m of getAliveMonsters()) byMonster[m.uid] = { damage: 0, shieldShred: { red: 0, green: 0, blue: 0 } };

    if (visible.length > 0) {
      const saved = saveStateForDryRun();
      dryRun = true;
      activeEvents = [];
      try {
        phase = 'resolving';
        const before = stats.totalDamage;
        out = resolveChain(visible.slice());
        totalDamage = stats.totalDamage - before;
        recordedAfter = recordedColors.size;
        for (const ev of activeEvents) {
          const slot = byMonster[ev.payload?.targetUid];
          if (ev.type === BATTLE_EVENT_TYPES.DAMAGE_PACKET && slot) slot.damage += ev.payload.damage;
          else if (ev.type === BATTLE_EVENT_TYPES.SHIELD_SHRED && slot && ev.payload.color in slot.shieldShred) slot.shieldShred[ev.payload.color] += ev.payload.amount;
          else if (ev.type === BATTLE_EVENT_TYPES.SHIELD_BREAK) expectedBreakUids.add(ev.payload.targetUid);
        }
      } finally {
        dryRun = false;
        restoreStateAfterDryRun(saved);
      }
    }

    const showDamage = cfg.showExactDamage && !hasHiddenInChain;
    const stepByUid = new Map(out.steps.map((st) => [st.cardUid, st]));
    let lastMult = out.steps.length ? out.steps[0].multiplierAfter : 1;
    const steps = chain.map((card) => {
      const st = stepByUid.get(card.uid);
      if (st) { lastMult = st.multiplierAfter; return st; }
      return {
        cardUid: card.uid,
        resolvedColor: null,
        relation: CHAIN_RELATIONS.HIDDEN,
        multiplierAfter: lastMult,
        hits: 0,
        triggersComplementWhite: false,
        triggersRainbow: false,
      };
    });
    const totalHits = out.totalHits;
    const avgPerHit = totalHits > 0 ? Math.round(totalDamage / totalHits) : Math.round(eff.attack * (1 + eff.damageBonus + eff.hitPercent));
    const formulaLines = [
      `发数：${chain.length} 张排链 · 链尾倍率 ×${out.finalMultiplier}${out.rainbowTriggered ? ' · 彩虹再打 2 遍' : ''} = 预计 ${totalHits} 发`,
      `每发：攻 ${Math.round(eff.attack)} × (1 + ${Math.round((eff.damageBonus + eff.hitPercent) * 100)}%) × 暴击/盾 ≈ 均 ${avgPerHit}`,
    ];
    for (const slot of Object.values(byMonster)) {
      slot.damage = showDamage ? Math.round(slot.damage) : null;
    }

    return {
      schemaVersion: SCHEMA_VERSION,
      chainLength: chain.length,
      steps,
      finalMultiplier: out.finalMultiplier,
      hasComplementWhite: steps.some((st) => st.triggersComplementWhite),
      willTriggerRainbow: out.rainbowTriggered,
      colorsNeededForRainbow: out.rainbowTriggered ? 0 : Math.max(0, COLOR_RING.length - recordedAfter),
      // 选中那只怪这条链会被削掉几格（按真算的）；每只怪的见 byMonster
      shieldShred: primaryUid && byMonster[primaryUid] ? { ...byMonster[primaryUid].shieldShred } : { red: 0, green: 0, blue: 0 },
      expectedBreakUids: [...expectedBreakUids],
      estimatedHits: totalHits,
      estimatedDamage: showDamage ? Math.round(totalDamage) : null,
      byMonster,
      formulaLines,
    };
  }

  function assertPlayerInput() {
    if (outcome !== null || phase !== 'player_input') {
      throw new Error('当前不在玩家出牌阶段');
    }
  }

  function selectTarget(monsterUid) {
    const mon = monsters.find((m) => m.uid === monsterUid && m.alive);
    if (!mon) return false;
    selectedTargetUid = mon.uid;
    return true;
  }

  /** 把手里一张排进链；index 是插到链的第几个位子（拖拽放在中间），不给就接在链尾 */
  function queueCard(cardUid, index = null) {
    assertPlayerInput();
    const idx = hand.findIndex((c) => c.uid === cardUid);
    if (idx < 0) return false;
    const card = hand[idx];
    if (card.usage !== 'chain') return false;
    hand.splice(idx, 1);
    if (Number.isInteger(index) && index >= 0 && index < chain.length) chain.splice(index, 0, card);
    else chain.push(card);
    return true;
  }

  /** 链里一张挪到另一个位子（拖拽换顺序，不算撤回） */
  function moveChainCard(cardUid, index) {
    assertPlayerInput();
    const from = chain.findIndex((c) => c.uid === cardUid);
    if (from < 0) return false;
    const [card] = chain.splice(from, 1);
    const to = Math.max(0, Math.min(chain.length, Number.isInteger(index) ? index : chain.length));
    chain.splice(to, 0, card);
    return from !== to;
  }

  function unqueueCard(cardUid) {
    assertPlayerInput();
    const idx = chain.findIndex((c) => c.uid === cardUid);
    if (idx < 0) return false;
    const [card] = chain.splice(idx, 1);
    hand.push(card);
    metrics.undoCount++;
    return true;
  }

  function undoLast() {
    assertPlayerInput();
    if (chain.length === 0) return false;
    hand.push(chain.pop());
    metrics.undoCount++;
    return true;
  }

  function clearChain() {
    assertPlayerInput();
    if (chain.length === 0) return false;
    hand.push(...chain.splice(0));
    metrics.undoCount++;
    return true;
  }

  function playInstantCard(cardUid) {
    assertPlayerInput();
    const idx = hand.findIndex((c) => c.uid === cardUid);
    if (idx < 0) return { ok: false, snapshot: getSnapshot(), events: [] };
    const card = hand[idx];
    if (card.usage !== 'instant') return { ok: false, snapshot: getSnapshot(), events: [] };

    hand.splice(idx, 1);
    card.hidden = false;
    discardPile.push(card);

    emit(BATTLE_EVENT_TYPES.INSTANT_CARD_USED, { cardUid: card.uid, defId: card.defId, label: card.label });

    for (const ef of card.effects || []) {
      if (ef.timing === TIMINGS.ON_CARD_PLAY) {
        executeAction(actionCtx, ef, { sourceLabel: card.label });
      }
    }

    // 第 3 版 5.6：无色马上用功能牌用完补摸 N 张（默认 1 张）
    if (card.drawAfterPlay > 0) {
      drawCards(card.drawAfterPlay);
    }

    return { ok: true, snapshot: getSnapshot(), events: flushEvents() };
  }

  function autoArrange(strategy = 'longest') {
    assertPlayerInput();
    // 先把已排进链的牌放回手牌，再对所有可排链牌统一最优排法
    if (chain.length > 0) {
      hand.push(...chain.splice(0));
    }
    const chainable = hand.filter((c) => c.usage === 'chain');
    if (chainable.length === 0) return [];

    const target = ensureValidTarget();
    const ordered = findBestChainOrder(
      chainable,
      {
        currentColor,
        recordedColors: [...recordedColors],
        targetShields: target ? target.shields : [],
        targetShieldBroken: target ? target.shieldBroken : false,
        targetHalvedColor: target ? target.turnHalvedColor : null,
        shieldActiveMultiplier: cfg.shieldActiveMultiplier,
        shieldBrokenMultiplier: cfg.shieldBrokenMultiplier,
        aliveMonsterCount: getAliveMonsters().length,
      },
      strategy,
    );

    for (const card of ordered) {
      const idx = hand.findIndex((c) => c.uid === card.uid);
      if (idx >= 0) {
        hand.splice(idx, 1);
        chain.push(card);
      }
    }
    return chain.map((c) => c.uid);
  }

  function settlePendingGemExp() {
    for (const gem of PRIMARY_GEMS) {
      const gained = player.pendingGemExp[gem];
      player.pendingGemExp[gem] = 0;
      if (gained <= 0) continue;
      const g = player.gemLevels[gem];
      const before = g.level;
      g.exp += gained;
      while (g.exp >= gemLevelThreshold(g.level)) {
        g.exp -= gemLevelThreshold(g.level);
        g.level++;
      }
      if (g.level > before) {
        emit(BATTLE_EVENT_TYPES.GEM_LEVEL_UP, { color: gem, fromLevel: before, toLevel: g.level });
      }
    }
  }

  function buildBattleResult() {
    return {
      schemaVersion: SCHEMA_VERSION,
      outcome,
      remainingHearts: player.hearts,
      maxHearts: player.maxHearts,
      gemLevels: {
        red: { ...player.gemLevels.red },
        green: { ...player.gemLevels.green },
        blue: { ...player.gemLevels.blue },
      },
      defeatedMonsters: defeatedMonsters.map((m) => ({ ...m })),
      encounteredMonsters: [...encounteredMonsters],
      deckChanges: {
        addedCards: deckChanges.addedCards.map((c) => ({ ...c })),
        removedCardUids: [...deckChanges.removedCardUids],
      },
      stats: { ...stats },
    };
  }

  /**
   * 把一串牌按链结算：接链翻倍、出伤、合白、削盾、集色、彩虹（设计稿 5.2~5.5）。
   * 打出去（commitChain）和预览（getPreview 空跑）共用这一份，免得两边算得不一样。
   * 返回 { finalMultiplier, rainbowTriggered, totalHits, steps }。
   */
  function resolveChain(cardsToResolve) {
    chainDamageMods = { attack: 0, damageBonus: 0, critRate: 0, critDamage: 0, hitPercent: 0 };
    chainRuleOverrides = {};
    complementsThisChain = 0;
    const steps = [];

    const eff = getEffectiveStats();
    // 加成「回合结束手里留着牌，下回合的链从 ×2 起」
    const startDouble = ruleOn(RULE_KEYS.keptStartsDouble) && turnStartKeptCount > 0 && cardsToResolve.length > 0;
    let multRef = { value: startDouble ? 2 : 1 };
    if (startDouble) emit(BATTLE_EVENT_TYPES.EFFECT_TRIGGERED, { source: '留着牌，链从 ×2 起', label: '从 ×2 起' });
    activeChainMultRef = multRef;
    let firstMatchUsed = false;
    let rainbowTriggered = false;
    let turnTotalDamage = 0;
    let turnTotalHits = 0;
    const rainbowBatches = [];

    let chainBreakUsed = false;
    for (const card of cardsToResolve) {
      card.hidden = false;
      const hitsBefore = turnTotalHits;
      const resolved = resolveCardForChain(card, currentColor);
      const rel = computeChainRelation(resolved.color, currentColor);

      if (rel === CHAIN_RELATIONS.CONNECT || rel === CHAIN_RELATIONS.COMPLEMENT) {
        multRef.value *= 2;
      } else if (rel === CHAIN_RELATIONS.BREAK && ruleOn(RULE_KEYS.firstBreakStillDoubles) && !chainBreakUsed) {
        multRef.value *= 2; // 加成「第一次断色照样 ×2」
        chainBreakUsed = true;
        emit(BATTLE_EVENT_TYPES.EFFECT_TRIGGERED, { source: '第一次断色照样 ×2', label: '断色照样 ×2' });
      }

      emit(BATTLE_EVENT_TYPES.CHAIN_STEP, {
        cardUid: card.uid,
        defId: card.defId,
        label: card.label,
        color: resolved.color,
        relation: rel,
        multiplier: multRef.value,
      });

      const currentTarget = ensureValidTarget();
      const targetBarBefore = currentTarget ? currentTarget.barIndex : -1;
      // 白牌削盾也只削出牌时活着的那条（5.5）：先记下每只怪出牌前在第几条
      const barBeforeByUid = new Map(getAliveMonsters().map((m) => [m.uid, m.barIndex]));
      let targetBarClearedByCard = false;

      // 记录每颗宝石的经验（回合末升级）
      for (const gem of resolved.gems) {
        player.pendingGemExp[gem] += 1;
      }

      // 宝石强化（6.3）：疼 = 这张每发 +50%；多 = 多算 1 颗宝石来打发（不多削盾）
      const enhDir = card.enhance?.dir || null;
      const painFactor = enhDir === 'pain' ? 1.5 : 1;
      const damageGems = enhDir === 'more' && resolved.gems.length ? [...resolved.gems, resolved.gems[0]] : resolved.gems;

      // 1. 先按当前盾状态打出这张牌自带宝石的发（第 3 版 5.5：破盾那张吃 ×0.75）
      const baseDmgMod = (1 + eff.damageBonus + eff.hitPercent) * painFactor;
      if (getAliveMonsters().length > 0) {
        if (resolved.isWhite) {
          // 白牌群攻：打所有存活怪，每只吃满
          const aliveNow = getAliveMonsters();
          for (const gem of damageGems) {
            const perHitBase = eff.attack * gemLevelMultiplier(player.gemLevels[gem].level) * baseDmgMod;
            for (const mon of aliveNow) {
              if (!mon.alive) continue;
              const beforeIdx = mon.barIndex;
              const hitRes = applyRawHitsToMonster(mon, {
                hits: multRef.value,
                perHitBase,
                canCrit: true,
                ignoreTraits: false,
                cardColor: 'white',
                isWhite: true,
                isRainbow: false,
                allowRetargetOnKill: false,
                sourceLabel: card.label,
              });
              turnTotalDamage += hitRes.dealtTotal;
              turnTotalHits += multRef.value;
              if (mon === currentTarget && (hitRes.barCleared || mon.barIndex !== beforeIdx)) {
                targetBarClearedByCard = true;
              }
            }
            rainbowBatches.push({ gem, hits: multRef.value, cardColor: 'white' });
          }
        } else if (currentTarget) {
          // 单攻：打选中的怪，死了自动转下一只
          for (const gem of damageGems) {
            const perHitBase = eff.attack * gemLevelMultiplier(player.gemLevels[gem].level) * baseDmgMod;
            const hitRes = applyRawHitsToMonster(currentTarget, {
              hits: multRef.value,
              perHitBase,
              canCrit: true,
              ignoreTraits: false,
              cardColor: resolved.color,
              isWhite: false,
              isRainbow: false,
              allowRetargetOnKill: true,
              sourceLabel: card.label,
            });
            turnTotalDamage += hitRes.dealtTotal;
            turnTotalHits += multRef.value;
            if (hitRes.barCleared || currentTarget.barIndex !== targetBarBefore) {
              targetBarClearedByCard = true;
            }
            rainbowBatches.push({ gem, hits: multRef.value, cardColor: resolved.color });
          }
        }

        // 2. 合白多打一轮白色伤害（群攻每只吃满，不削盾；仍吃本张牌当前的盾倍率）
        if (rel === CHAIN_RELATIONS.COMPLEMENT && getAliveMonsters().length > 0) {
          emit(BATTLE_EVENT_TYPES.COMPLEMENT_WHITE, {
            cardUid: card.uid,
            color: resolved.color,
            multiplier: multRef.value,
          });
          const aliveNow = getAliveMonsters();
          // 加成「合白多打的那一轮，再多打一轮」
          const whiteRounds = ruleOn(RULE_KEYS.complementExtraRound) ? 2 : 1;
          if (whiteRounds > 1) emit(BATTLE_EVENT_TYPES.EFFECT_TRIGGERED, { source: '合白再多打一轮', label: '再一轮白' });
          complementsThisChain++;
          if (ruleOn(RULE_KEYS.complementBonusDraw) && !complementDrawUsedThisTurn && complementsThisChain >= 2) {
            complementDrawUsedThisTurn = true;
            bonusDrawNextTurn += 1;
            emit(BATTLE_EVENT_TYPES.EFFECT_TRIGGERED, { source: '合白 2 次：下回合多 1 张', label: '下回合 +1 张' });
          }
          for (let round = 0; round < whiteRounds; round++)
          for (const gem of PRIMARY_GEMS) {
            const perHitBase = eff.attack * gemLevelMultiplier(player.gemLevels[gem].level) * baseDmgMod;
            for (const mon of aliveNow) {
              if (!mon.alive) continue;
              const hitRes = applyRawHitsToMonster(mon, {
                hits: multRef.value,
                perHitBase,
                canCrit: true,
                ignoreTraits: false,
                cardColor: resolved.color,
                isWhite: true,
                isRainbow: false,
                allowRetargetOnKill: false,
                sourceLabel: '合白',
              });
              turnTotalDamage += hitRes.dealtTotal;
              turnTotalHits += multRef.value;
              if (mon === currentTarget && (hitRes.barCleared || mon.barIndex !== targetBarBefore)) {
                targetBarClearedByCard = true;
              }
            }
            rainbowBatches.push({ gem, hits: multRef.value, cardColor: resolved.color });
          }
          triggerEffects(TIMINGS.ON_COMPLEMENT_WHITE);
        }

        // 3. 伤害打完后再削盾（第 3 版 5.5：打空一条血的那张牌不算破盾、不削下一条的新盾）
        if (resolved.isWhite) {
          for (const mon of getAliveMonsters()) {
            if (!mon.alive || mon.shieldBroken || mon.shields.length === 0) continue;
            // 白牌对场上仍处于出牌前那条血的怪削三色盾各 1 格；这张牌把那条打空了，就不削下一条的新盾
            if (barBeforeByUid.get(mon.uid) !== mon.barIndex) continue;
            let anyShred = false;
            const perGemW = 1 + (enhDir === 'shred' ? 1 : 0);
            for (const gem of resolved.gems) {
              for (const sh of mon.shields) {
                if (sh.color === gem && sh.current > 0) {
                  const cutW = Math.min(sh.current, perGemW);
                  sh.current -= cutW;
                  anyShred = true;
                  emit(BATTLE_EVENT_TYPES.SHIELD_SHRED, {
                    targetUid: mon.uid,
                    color: sh.color,
                    amount: cutW,
                    remaining: sh.current,
                  });
                }
              }
            }
            if (anyShred) checkAndTriggerShieldBreak(mon);
          }
        } else if (currentTarget && currentTarget.alive && !targetBarClearedByCard && currentTarget.barIndex === targetBarBefore) {
          if (!currentTarget.shieldBroken && currentTarget.shields.length > 0) {
            let anyShred = false;
            // 加成「每条链第一张对色的牌，每颗宝石多削 1 格」；强化「破盾：每颗多削 1 格」
            const matches = resolved.gems.some((g) => currentTarget.shields.some((sh) => sh.color === g && sh.current > 0));
            let perGem = 1 + (enhDir === 'shred' ? 1 : 0);
            // 加成「每张对色的牌多削 1 格」（第 3 轮调整，等用户点头）；原来的「每条链第一张」留着
            if (matches && (ruleOn(RULE_KEYS.allMatchExtraShred) || (ruleOn(RULE_KEYS.firstMatchExtraShred) && !firstMatchUsed))) {
              firstMatchUsed = true;
              perGem += 1;
              emit(BATTLE_EVENT_TYPES.EFFECT_TRIGGERED, { source: ruleOn(RULE_KEYS.allMatchExtraShred) ? '对色多削 1 格' : '第一张对色多削 1 格', label: '多削 1 格' });
            }
            for (const gem of resolved.gems) {
              for (const sh of currentTarget.shields) {
                if (sh.color === gem && sh.current > 0) {
                  const cut = Math.min(sh.current, perGem);
                  sh.current -= cut;
                  anyShred = true;
                  emit(BATTLE_EVENT_TYPES.SHIELD_SHRED, {
                    targetUid: currentTarget.uid,
                    color: sh.color,
                    amount: cut,
                    remaining: sh.current,
                  });
                }
              }
            }
            if (anyShred) checkAndTriggerShieldBreak(currentTarget);
          }
        }
      }

      // 4. 牌自身的排链效果（例如蓝牌倍率 ×2 在打完自身后翻倍，供后面的牌吃）
      activeExtraHitsQueue = [];
      for (const ef of card.effects || []) {
        if (ef.timing === TIMINGS.ON_CARD_PLAY) {
          executeAction(actionCtx, ef, { sourceLabel: card.label });
        }
      }
      activeExtraHitsQueue = null;

      // 5. 推进集色与彩虹判定
      const adv = advanceRecordedColors(recordedColors, resolved.color, rel, rainbowTriggered, colorAdvanceOpts());
      recordedColors = adv.nextRecorded;
      if (adv.triggeredRainbow) {
        rainbowTriggered = true;
        stats.rainbowCount++;
      }
      // 强化「集色：打出时顺带记上旁边一色」
      if (enhDir === 'record') {
        for (const c of pickColorsToRecord(recordedColors, resolved.color, 'neighbors', 1)) recordedColors.add(c);
      }
      currentColor = resolved.color;
      discardPile.push(card);

      if (rel === CHAIN_RELATIONS.CONNECT || rel === CHAIN_RELATIONS.COMPLEMENT) {
        triggerEffects(TIMINGS.ON_CHAIN_CONNECT);
      }

      steps.push({
        cardUid: card.uid,
        resolvedColor: resolved.color,
        relation: rel,
        multiplierAfter: multRef.value,
        hits: turnTotalHits - hitsBefore,
        triggersComplementWhite: rel === CHAIN_RELATIONS.COMPLEMENT,
        triggersRainbow: adv.triggeredRainbow,
      });
    }

    // 加成「破过盾，链尾全体补一轮白」：这回合破过盾，按链尾的倍率补一轮（不削盾）
    if (ruleOn(RULE_KEYS.breakWhiteAtChainEnd) && cardsToResolve.length > 0 && stats.shieldBreaks > turnStartShieldBreaks && getAliveMonsters().length > 0) {
      actionCtx.dealWhiteRound('all', '破过盾，链尾补一轮白');
    }

    activeChainMultRef = null;

    // 链打完后，若本链触发彩虹，用彩虹色再打两遍（群攻吃满，不削盾，吃当前破盾倍率）
    if (rainbowTriggered && getAliveMonsters().length > 0) {
      emit(BATTLE_EVENT_TYPES.RAINBOW_TRIGGER, {
        batches: rainbowBatches.length,
        repeats: ruleOn(RULE_KEYS.rainbowExtraRepeat) ? 3 : 2,
      });
      const baseDmgMod = (1 + eff.damageBonus + eff.hitPercent) * (1 + (ruleVal(RULE_KEYS.rainbowHitBonus) || 0));
      for (const bt of rainbowBatches) {
        const extraHits = bt.hits * (ruleOn(RULE_KEYS.rainbowExtraRepeat) ? 3 : 2);
        const perHitBase = eff.attack * gemLevelMultiplier(player.gemLevels[bt.gem].level) * baseDmgMod;
        for (const mon of getAliveMonsters()) {
          if (!mon.alive) continue;
          const hitRes = applyRawHitsToMonster(mon, {
            hits: extraHits,
            perHitBase,
            canCrit: true,
            ignoreTraits: false,
            cardColor: 'white',
            isWhite: true,
            isRainbow: true,
            allowRetargetOnKill: false,
            sourceLabel: '彩虹',
          });
          turnTotalDamage += hitRes.dealtTotal;
          turnTotalHits += extraHits;
        }
      }
      triggerEffects(TIMINGS.ON_RAINBOW);
    }

    return { finalMultiplier: multRef.value, rainbowTriggered, totalHits: turnTotalHits, steps };
  }

  function commitChain() {
    assertPlayerInput();
    phase = 'resolving';

    const playedCount = chain.length;
    if (playedCount === 0) metrics.emptyTurns++;
    if (playedCount > stats.maxChainLength) stats.maxChainLength = playedCount;

    // 这条链打掉的全算上：牌打的、合白、彩虹，还有破盾时队友补刀、加成补的那一轮（预览也这么算）
    const damageBefore = stats.totalDamage;
    const res = resolveChain(chain.splice(0));
    const turnTotalHits = res.totalHits;
    const turnTotalDamage = stats.totalDamage - damageBefore;
    const rainbowTriggered = res.rainbowTriggered;

    const avgHit = turnTotalHits > 0 ? Math.round(turnTotalDamage / turnTotalHits) : 0;
    emit(BATTLE_EVENT_TYPES.CHAIN_SUMMARY, {
      playedCount,
      finalMultiplier: res.finalMultiplier,
      totalHits: turnTotalHits,
      totalDamage: turnTotalDamage,
      rainbowTriggered,
      formulaLines: [
        `本回合：${playedCount} 张牌 · 链尾 ×${res.finalMultiplier}${rainbowTriggered ? ' · 彩虹' : ''} · 共 ${turnTotalHits} 发`,
        `总伤害：${turnTotalDamage}（平均每发 ${avgHit}）`,
      ],
    });

    metrics.turnRecords.push({
      turn,
      playedCount,
      totalHits: turnTotalHits,
      totalDamage: turnTotalDamage,
      rainbowTriggered,
    });

    // 出牌后队友出手
    if (getAliveMonsters().length > 0) {
      triggerEffects(TIMINGS.AFTER_PLAY);
    }

    // 结算本回合宝石经验升级
    settlePendingGemExp();

    // 检查是否全灭获胜
    if (getAliveMonsters().length === 0) {
      outcome = 'win';
      phase = 'ended';
      emit(BATTLE_EVENT_TYPES.BATTLE_END, { outcome: 'win' });
      return { snapshot: getSnapshot(), events: flushEvents(), result: buildBattleResult() };
    }

    // 5.1 第 4 步：怪倒计时与出手
    phase = 'monster_turn';
    for (const mon of getAliveMonsters()) {
      let shouldAttack = false;
      if (mon.queuedAttackThisTurn) {
        shouldAttack = true;
        mon.queuedAttackThisTurn = false;
      } else {
        mon.countdown = Math.max(0, mon.countdown - 1);
        if (mon.countdown === 0) shouldAttack = true;
      }

      if (shouldAttack) {
        // 先检查挡的顺序（第 3 版 5.5）：本回合挡 → 挡掉为止 → 队友次数
        let blocked = false;
        let blockSource = null;
        if (player.blocks.thisTurn > 0) {
          player.blocks.thisTurn--;
          blocked = true;
          blockSource = 'this_turn';
        } else if (player.blocks.untilConsumed > 0) {
          player.blocks.untilConsumed--;
          blocked = true;
          blockSource = 'until_consumed';
        } else if (player.blocks.allyCharges > 0) {
          player.blocks.allyCharges--;
          blocked = true;
          blockSource = 'ally';
        }

        const heartsLost = blocked ? 0 : mon.attackDamage;
        if (!blocked) {
          metrics.everTookHit = true;
          const beforeHearts = player.hearts;
          player.hearts = Math.max(0, Math.round((player.hearts - heartsLost) * 2) / 2);
          stats.heartsLost = Math.round((stats.heartsLost + (beforeHearts - player.hearts)) * 2) / 2;
          emit(BATTLE_EVENT_TYPES.HEARTS_CHANGED, { before: beforeHearts, after: player.hearts, delta: player.hearts - beforeHearts });
          triggerEffects(TIMINGS.ON_PLAYER_HIT, { monster: mon });
        } else {
          emit(BATTLE_EVENT_TYPES.BLOCK_CHANGED, { blocks: { ...player.blocks } });
        }

        emit(BATTLE_EVENT_TYPES.MONSTER_ATTACK, {
          monsterUid: mon.uid,
          monsterLabel: mon.label,
          blocked,
          blockSource,
          heartsLost,
        });

        // 怪出手特性（如「每次出手清空集到的颜色」）
        triggerMonsterTraits(mon, TIMINGS.ON_MONSTER_ATTACK);

        // 出完手：倒计时按原型加速（第 1 次后 base-1，第 2 次后每回合都打）
        mon.attacksDone++;
        mon.countdown = mon.attacksDone >= 2 ? 1 : Math.max(1, mon.initialCountdown - mon.attacksDone);

        // 5.5：破盾后出完手盾回满；没破的盾留着已削格数
        if (mon.shieldBroken && mon.shields.length > 0) {
          for (const sh of mon.shields) sh.current = sh.max;
          mon.shieldBroken = false;
        }

        if (player.hearts <= 0) break;
      }
    }

    if (player.hearts <= 0) {
      outcome = 'lose';
      phase = 'ended';
      emit(BATTLE_EVENT_TYPES.BATTLE_END, { outcome: 'lose' });
      return { snapshot: getSnapshot(), events: flushEvents(), result: buildBattleResult() };
    }

    // 5.1 第 5 步：回合结束，没打的牌留在手里，进入下一回合
    triggerEffects(TIMINGS.TURN_END);
    startTurn();

    return { snapshot: getSnapshot(), events: flushEvents(), result: null };
  }

  return {
    getInitialEvents: () => [...initialEvents],
    getSnapshot,
    getPreview,
    selectTarget,
    queueCard,
    unqueueCard,
    moveChainCard,
    undoLast,
    clearChain,
    playInstantCard,
    autoArrange,
    commitChain,
    getResult: () => (outcome ? buildBattleResult() : null),
    getMetrics: () => ({ ...metrics, turnRecords: metrics.turnRecords.map((r) => ({ ...r })) }),
  };
}
