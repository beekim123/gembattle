// 一趟的规则（设计稿 6.2~6.4、7.1~7.4、8.2~8.3）：区、层、片、出口、奖励、任务进度、回去、死了。
// 不碰画面；所有内容（怪、牌、加成、队友、事件、任务、数）都由调用方用纯数据传进来（contentPack），
// 本模块不认识 content 模块，单测用假数据就能跑。

import { SCHEMA_VERSION, createRng } from '../shared/index.js';

export const RUN_SCHEMA_VERSION = 1;

/** 奖励记号（出口上显示的） */
export const REWARD_KINDS = Object.freeze(['function_card', 'buff', 'enhance', 'remove', 'stat', 'draw_plus', 'heal', 'gold']);
export const REWARD_LABELS = Object.freeze({
  function_card: '功能牌',
  buff: '加成',
  enhance: '强化',
  remove: '删牌',
  stat: '属性',
  draw_plus: '补牌 +1',
  heal: '回心',
  gold: '金币',
  rest: '歇脚',
  event: '？',
  gatekeeper: '看门的',
  return: '回去',
});
export const STAT_LABELS = Object.freeze({ attack: '攻击', damageBonus: '增伤', critRate: '暴击率', critDamage: '暴伤' });
export const ENHANCE_DIRS = Object.freeze({
  pain: '疼：这张每发 +50%',
  more: '多：多算 1 颗宝石来打发',
  shred: '破盾：每颗多削 1 格',
  record: '集色：打出时顺带记上旁边一色',
});
export const CLEARING_KINDS = Object.freeze(['start', 'normal', 'elite', 'rest', 'event', 'gatekeeper']);

const clone = (v) => JSON.parse(JSON.stringify(v));
const halfStep = (v) => Math.round(v * 2) / 2;

/** 照牌的定义做一张牌（跟 content 里 instantiateCard 一样的形状） */
function makeCard(def, uid) {
  return {
    uid,
    defId: def.defId,
    kind: def.kind,
    usage: def.usage,
    color: def.color,
    gems: [...def.gems],
    enhanced: false,
    drawAfterPlay: def.drawAfterPlay ?? 0,
    label: def.label,
    description: def.description,
    effects: (def.effects || []).map((ef) => ({
      timing: ef.timing,
      action: ef.action,
      ...(ef.duration ? { duration: ef.duration } : {}),
      ...(ef.condition ? { condition: { ...ef.condition } } : {}),
      params: { ...(ef.params || {}) },
    })),
  };
}

function cloneEffects(effects) {
  return (effects || []).map((ef) => ({
    timing: ef.timing,
    action: ef.action,
    ...(ef.duration ? { duration: ef.duration } : {}),
    ...(ef.condition ? { condition: { ...ef.condition } } : {}),
    params: { ...(ef.params || {}) },
  }));
}

/**
 * 出发包（设计稿 10.3，阶段 2 定下来）。
 * @typedef {object} DepartPacket
 * @property {number} schemaVersion
 * @property {string|number} seed
 * @property {string} zoneId 地点（原型只有森林）
 * @property {number} [startLayer=1] 从第几层进（外头区只有 1）
 * @property {object} player { stats, drawTarget, hearts, maxHearts, extraCards?: defId[], buffs?: id[], allies?: id[], gearTraits?: [] }
 * @property {object[]} quests 接的任务（任务定义 + 已经带回来的进度 savedProgress）
 * @property {object} [rulesConfig] 战斗开关
 */

/**
 * 开一趟。
 * @param {DepartPacket} depart
 * @param {object} pack contentPack：纯数据（见 README）
 */
export function createRun(depart, pack) {
  if (!depart || depart.schemaVersion !== SCHEMA_VERSION) throw new Error('出发包 schemaVersion 不对');
  if (!pack || !pack.zones || !pack.cardDefs) throw new Error('缺 contentPack');
  const zone = pack.zones[depart.zoneId || 'forest'];
  if (!zone) throw new Error(`未知的地点：${depart.zoneId}`);

  const rng = createRng(`run:${depart.seed}`);
  let uidSeq = 0;
  const nextUid = (p = 'c') => `${p}-${++uidSeq}`;

  const allyIds = [...(depart.player.allies || [])];
  const exploreSkills = new Set(allyIds.map((id) => pack.allyDefs[id]?.explore?.kind).filter(Boolean));

  // 起手牌组：29 张宝石牌 + 带的功能牌（设计稿 6.4，宝石牌由 pack.baseDeck 给出 defId 列表）
  const deck = [...pack.baseDeck, ...(depart.player.extraCards || [])].map((defId) => {
    const def = pack.cardDefs[defId];
    if (!def) throw new Error(`未知的牌：${defId}`);
    return makeCard(def, nextUid('card'));
  });

  const player = {
    deck,
    stats: { ...depart.player.stats },
    drawTarget: depart.player.drawTarget,
    drawPlusTaken: 0,
    hearts: depart.player.hearts,
    maxHearts: depart.player.maxHearts,
    buffs: [...(depart.player.buffs || [])],
    allies: allyIds,
    gearTraits: clone(depart.player.gearTraits || []),
    gemLevels: { red: { level: 1, exp: 0 }, green: { level: 1, exp: 0 }, blue: { level: 1, exp: 0 } },
  };

  const quests = (depart.quests || []).map((q) => ({
    ...clone(q),
    progress: q.savedProgress || 0, // 以前带回来存着的（死了也不丢）
    gained: 0, // 这一趟新拿到的（死了就丢）
    done: (q.savedProgress || 0) >= q.count,
    findPlaced: false,
  }));

  const gold = { safe: 0, risky: 0 };
  const log = [];
  const encountered = new Set();
  const runStats = { fights: 0, rainbowCount: 0, heartsLost: 0, maxSingleHit: 0, maxChainLength: 0, totalDamage: 0, clearings: 0 };
  const layerCounters = {}; // 每层出过几个精英、歇脚、事件
  let ended = null;
  let pending = null; // 等玩家挑：{ type, ... }
  const pendingQueue = [];
  let clearing = null;
  let clearingSeq = 0;
  let firstClearing = true;

  const layerDef = (layer) => zone.layers[layer];
  const counters = (layer) => (layerCounters[layer] ||= { elite: 0, rest: 0, event: 0 });

  function questsOnLayer(layer) {
    return quests.filter((q) => !q.done && (q.layer == null || q.layer === layer));
  }

  function note(text) {
    log.push({ seq: log.length + 1, text });
  }

  // ───────── 生成一片 ─────────

  function pickEncounter(kind, layer) {
    const L = layerDef(layer);
    if (kind === 'gatekeeper') return zone.gatekeeper;
    if (kind === 'elite') return rng.pick(L.elite);
    return null; // 普通的在下面挑（要区分一只还是一群）
  }

  function rollNormalEncounter(layer, wantPack) {
    const L = layerDef(layer);
    const pool = wantPack ? L.pack : L.normal;
    return rng.pick(pool);
  }

  function removableCards() {
    return player.deck.filter((c) => c.kind !== 'gem');
  }

  /** 一片里放什么（设计稿 7.1） */
  function buildClearing({ kind, layer, indexInLayer, layerLength, reward = null, encounterId = null, pack: isPack = false }) {
    clearingSeq++;
    const c = {
      id: `cl-${clearingSeq}`,
      kind,
      layer,
      indexInLayer,
      layerLength,
      encounterId,
      isPack,
      reward, // 打完给什么（出口上写的）
      cleared: kind === 'rest' || kind === 'event' ? false : false,
      fought: false,
      hidden: null,
      gathers: [],
      findQuestId: null,
      questMonster: false,
      exits: null,
      seed: `${depart.seed}:${clearingSeq}`,
      // 画面用：一团鬼火一只怪（一群画成几团挨着的）
      monsters: (pack.encounters[encounterId]?.monsters || []).map((m) => ({ defId: m.defId, tier: m.tier, look: m.look || null, label: m.label })),
    };

    if (kind === 'event') c.eventId = rng.pick(pack.eventList).id;

    // 0~1 样藏着的东西或小事件（不写在出口上）
    if (kind === 'normal' || kind === 'start' || kind === 'elite') {
      const roll = rng.next();
      if (roll < zone.hiddenChance) {
        c.hidden = { kind: 'stash', gold: rng.int(zone.hiddenGold[0], zone.hiddenGold[1]), taken: false };
        // 隐藏任务：藏着的东西里偶尔翻出来（设计稿 8.2）
        if (pack.hiddenQuest && !quests.some((q) => q.id === pack.hiddenQuest.id) && rng.chance(zone.hiddenQuestChance)) {
          c.hidden.questId = pack.hiddenQuest.id;
        }
      } else if (roll < zone.hiddenChance + zone.smallEventChance) {
        c.hidden = { kind: 'event', eventId: rng.pick(pack.eventList).id, taken: false };
      }
    }

    // 任务要的东西
    if (kind !== 'gatekeeper') {
      for (const q of questsOnLayer(layer)) {
        if (q.kind === 'gather') {
          const n = rng.int(1, 2);
          for (let i = 0; i < n; i++) c.gathers.push({ id: `${c.id}-g${i}`, questId: q.id, taken: false });
        } else if (q.kind === 'find' && !q.findPlaced) {
          const last = indexInLayer >= layerLength - 1;
          if (last || rng.chance(0.5)) c.findQuestId = q.id;
        }
      }
    }
    return c;
  }

  function markQuestMonster(c) {
    if (!c.encounterId) return;
    const mons = pack.encounters[c.encounterId]?.monsters || [];
    c.questMonster = quests.some((q) => !q.done && (
      (q.kind === 'drop' && mons.some((m) => m.defId === q.target))
      || (q.kind === 'hunt' && (q.layer == null || q.layer === c.layer))
      || (q.kind === 'gatekeeper' && c.kind === 'gatekeeper')
    ));
  }

  function rollKind(layer, avoid) {
    const L = layerDef(layer);
    const cnt = counters(layer);
    const opts = [];
    for (const [k, w] of Object.entries(L.kindWeights)) {
      if (k === 'elite' && cnt.elite >= 1) continue;
      if (k === 'rest' && cnt.rest >= 1) continue;
      if (k === 'event' && cnt.event >= 1) continue;
      if (avoid.has(k) && k !== 'normal' && k !== 'pack') continue;
      opts.push([k, w]);
    }
    const total = opts.reduce((s, [, w]) => s + w, 0);
    let x = rng.next() * total;
    for (const [k, w] of opts) {
      x -= w;
      if (x <= 0) return k;
    }
    return 'normal';
  }

  function rewardPool(mustBuff) {
    const pool = ['function_card', 'buff', 'enhance', 'stat', 'heal', 'gold'];
    if (removableCards().length > 0) pool.push('remove');
    if (player.drawPlusTaken < zone.rewards.drawPlusMax && rng.chance(zone.rewards.drawPlusChance)) pool.push('draw_plus');
    if (player.hearts >= player.maxHearts) pool.splice(pool.indexOf('heal'), 1);
    return mustBuff ? pool : pool;
  }

  /** 生成这一片打完以后的出口（设计稿 7.3） */
  function buildExits(c) {
    const exits = [];
    const L = c.layer;
    const last = c.indexInLayer >= c.layerLength - 1;
    if (c.kind === 'gatekeeper') {
      exits.push({ id: 'x-return', kind: 'return', label: REWARD_LABELS.return });
      return exits;
    }
    const nextLayer = last ? L + 1 : L;
    if (last) exits.push({ id: 'x-return', kind: 'return', label: REWARD_LABELS.return });
    if (last && !zone.layers[nextLayer]) {
      // 这个区最后一层打完：接着往里就是看门的
      const g = buildClearing({ kind: 'gatekeeper', layer: L, indexInLayer: c.indexInLayer + 1, layerLength: c.layerLength + 1, encounterId: zone.gatekeeper, reward: { kind: 'buff' } });
      markQuestMonster(g);
      exits.push({ id: 'x-gate', kind: 'gatekeeper', label: REWARD_LABELS.gatekeeper, next: g, reward: g.reward, questMark: g.questMonster });
      return exits;
    }
    const layerLength = last ? rng.int(layerDef(nextLayer).clearings[0], layerDef(nextLayer).clearings[1]) : c.layerLength;
    const indexInLayer = last ? 0 : c.indexInLayer + 1;
    const n = last ? rng.int(1, 2) : rng.int(2, 3);
    const usedRewards = new Set();
    const usedKinds = new Set();
    const mustBuff = c.kind === 'start';
    for (let i = 0; i < n; i++) {
      let kind = rollKind(nextLayer, usedKinds);
      usedKinds.add(kind);
      let reward = null;
      let encounterId = null;
      let isPack = false;
      if (kind === 'rest' || kind === 'event') {
        counters(nextLayer)[kind]++;
      } else {
        if (kind === 'elite') {
          counters(nextLayer).elite++;
          encounterId = pickEncounter('elite', nextLayer);
        } else {
          isPack = kind === 'pack';
          encounterId = rollNormalEncounter(nextLayer, isPack);
          kind = 'normal';
        }
        let pool = rewardPool(mustBuff).filter((r) => !usedRewards.has(r));
        let rk = (mustBuff && i === 0) ? 'buff' : rng.pick(pool.length ? pool : ['gold']);
        usedRewards.add(rk);
        reward = { kind: rk };
        if (rk === 'stat') reward.stat = rng.pick(Object.keys(zone.rewards.stat));
        if (rk === 'gold') reward.amount = rng.int(zone.rewards.gold[0], zone.rewards.gold[1]);
      }
      const nc = buildClearing({ kind, layer: nextLayer, indexInLayer, layerLength, reward, encounterId, pack: isPack });
      markQuestMonster(nc);
      exits.push({
        id: `x-${i}`,
        kind,
        label: kind === 'rest' ? REWARD_LABELS.rest : kind === 'event' ? REWARD_LABELS.event : REWARD_LABELS[reward.kind],
        reward,
        isPack,
        elite: kind === 'elite',
        next: nc,
        deeper: last,
        questMark: nc.questMonster || nc.gathers.length > 0 || Boolean(nc.findQuestId),
      });
    }
    // 任务的「找东西」：同一步的几个出口都放了，走哪个都行，进去了才算放下
    return exits;
  }

  function enterClearing(c) {
    clearing = c;
    runStats.clearings++;
    if (c.findQuestId) {
      const q = quests.find((x) => x.id === c.findQuestId);
      if (q) q.findPlaced = true;
    }
    for (const m of pack.encounters[c.encounterId]?.monsters || []) encountered.add(m.defId);
    if (c.kind === 'rest') queue({ type: 'rest', options: restOptions() });
    if (c.kind === 'event') queue(eventPending(c.eventId, 'clearing'));
    if (!needsFight(c) && pendingQueue.length === 0 && !pending) openExits();
  }

  function needsFight(c) {
    return Boolean(c.encounterId) && !c.fought;
  }

  function openExits() {
    if (!clearing.exits) clearing.exits = buildExits(clearing);
    clearing.cleared = true;
  }

  // ───────── 等玩家挑的东西 ─────────

  function queue(p) {
    if (!pending) pending = p;
    else pendingQueue.push(p);
  }

  function shiftPending() {
    pending = pendingQueue.shift() || null;
    if (!pending && clearing && !needsFight(clearing)) openExits();
  }

  function restOptions() {
    const opts = [
      { id: 'heal', label: '回 1 颗心', disabled: player.hearts >= player.maxHearts },
      { id: 'enhance', label: '强化一张牌' },
    ];
    if (removableCards().length > 0) opts.push({ id: 'remove', label: '删一张牌' });
    else opts.push({ id: 'stat', stat: 'attack', label: `攻击 +${zone.rewards.stat.attack}` });
    if (exploreSkills.has('rest_extra')) opts.push({ id: 'stat', stat: 'damageBonus', label: `增伤 +${Math.round(zone.rewards.stat.damageBonus * 100)}%（队友的本事）` });
    return opts;
  }

  function eventPending(eventId, where) {
    const ev = pack.events[eventId];
    return {
      type: 'event',
      eventId,
      where,
      label: ev.label,
      options: ev.options.map((o, i) => ({ id: `o${i}`, label: o.label, disabled: !eventOptionUsable(o) })),
    };
  }

  function eventOptionUsable(o) {
    for (const ef of o.effects) {
      if (ef.kind === 'pay_gold' && gold.risky + gold.safe < ef.value) return false;
      if (ef.kind === 'remove_random_function' && removableCards().filter((c) => c.kind === 'function').length === 0) return false;
      if (ef.kind === 'enhance_random_gem' && player.deck.filter((c) => c.kind === 'gem' && !c.enhanced).length === 0) return false;
    }
    return true;
  }

  function loseHearts(v) {
    let amount = v;
    if (exploreSkills.has('event_half_damage')) amount = halfStep(Math.max(0.5, amount / 2));
    const before = player.hearts;
    player.hearts = Math.max(0.5, halfStep(player.hearts - amount)); // 事件最多扣到剩半颗（7.4）
    runStats.heartsLost += before - player.hearts;
  }

  function payGold(v) {
    // 先花一趟里捡的（风险的），不够再花每仗掉的
    const fromRisky = Math.min(gold.risky, v);
    gold.risky -= fromRisky;
    gold.safe -= v - fromRisky;
  }

  function addFunctionCard(defId) {
    const card = makeCard(pack.cardDefs[defId], nextUid('card'));
    player.deck.push(card);
    return card;
  }

  function enhanceCard(card, dir) {
    if (card.enhanced) return false;
    card.enhanced = true;
    if (card.kind === 'gem') {
      card.enhance = { dir };
      card.label = `${card.label}+`;
      card.description = `${card.description || ''}（强化：${ENHANCE_DIRS[dir]}）`;
    } else {
      const up = pack.functionEnhance[card.defId];
      if (up) {
        card.effects = card.effects.map((ef) => ({ ...ef, params: { ...ef.params, ...up.params } }));
        if (up.drawAfterPlay != null) card.drawAfterPlay = up.drawAfterPlay;
        card.label = up.label;
        card.description = up.description || up.label;
      }
      card.enhance = { dir: up?.dir || 'number' };
    }
    return true;
  }

  function offerBuffs() {
    const owned = new Set(player.buffs);
    const candidates = pack.buffList.filter((b) => !owned.has(b.id));
    if (candidates.length === 0) return [];
    const ownedLanes = new Set(player.buffs.flatMap((id) => pack.buffDefs[id]?.lanes || [pack.buffDefs[id]?.lane]).filter(Boolean));
    const picks = [];
    // 跟着路子收窄（设计稿 6.2）：拿过某条路子，至少一个从那条（或横跨它的）里出
    if (ownedLanes.size > 0) {
      const narrowed = candidates.filter((b) => (b.lanes || [b.lane]).some((l) => ownedLanes.has(l)));
      if (narrowed.length) picks.push(rng.pick(narrowed));
    }
    const rest = rng.shuffle(candidates.filter((b) => !picks.includes(b)));
    while (picks.length < 3 && rest.length) picks.push(rest.shift());
    return picks.map((b) => b.id);
  }

  function offerFunctionCards() {
    return rng.shuffle(pack.functionCardList.map((c) => c.defId)).slice(0, 3);
  }

  function enhanceDirs() {
    return rng.shuffle(Object.keys(ENHANCE_DIRS)).slice(0, rng.int(2, 3));
  }

  /** 把「打完给什么」变成等玩家挑的东西 */
  function grantReward(reward, source = '出口') {
    if (!reward) return;
    switch (reward.kind) {
      case 'function_card':
        queue({ type: 'pick_card', options: offerFunctionCards(), source });
        break;
      case 'buff': {
        const options = offerBuffs();
        if (options.length) queue({ type: 'pick_buff', options, source });
        else queue(applyGold(zone.rewards.gold[1], '加成都拿满了，换成金币'));
        break;
      }
      case 'enhance':
        queue({ type: 'enhance', step: 'card', options: player.deck.filter((c) => !c.enhanced).map((c) => c.uid), dirs: enhanceDirs(), source });
        break;
      case 'remove':
        queue({ type: 'remove', options: removableCards().map((c) => c.uid), source });
        break;
      case 'stat': {
        const v = zone.rewards.stat[reward.stat];
        player.stats[reward.stat] = Math.round((player.stats[reward.stat] + v) * 1000) / 1000;
        const shown = reward.stat === 'attack' ? `+${v}` : reward.stat === 'critDamage' ? `+${v}` : `+${Math.round(v * 100)}%`;
        queue({ type: 'notice', text: `${STAT_LABELS[reward.stat]} ${shown}`, icon: 'stat' });
        break;
      }
      case 'draw_plus':
        player.drawTarget += 1;
        player.drawPlusTaken += 1;
        queue({ type: 'notice', text: `每回合补到 ${player.drawTarget} 张`, icon: 'draw_plus' });
        break;
      case 'heal': {
        const before = player.hearts;
        player.hearts = Math.min(player.maxHearts, player.hearts + zone.rewards.heal);
        queue({ type: 'notice', text: `回了 ${player.hearts - before} 颗心`, icon: 'heal' });
        break;
      }
      case 'gold':
        queue(applyGold(reward.amount ?? zone.rewards.gold[0], '金币'));
        break;
      default:
        break;
    }
  }

  function applyGold(amount, text) {
    gold.risky += amount;
    return { type: 'notice', text: `${text} +${amount}`, icon: 'gold' };
  }

  function applyEventEffects(effects) {
    const notes = [];
    for (const ef of effects) {
      switch (ef.kind) {
        case 'lose_hearts': loseHearts(ef.value); notes.push(`掉了 ${ef.value} 颗心`); break;
        case 'gain_hearts': player.hearts = Math.min(player.maxHearts, player.hearts + ef.value); notes.push(`回了 ${ef.value} 颗心`); break;
        case 'pay_gold': payGold(ef.value); notes.push(`花了 ${ef.value} 金币`); break;
        case 'gain_gold': gold.risky += ef.value; notes.push(`金币 +${ef.value}`); break;
        case 'reward': grantReward({ kind: ef.reward }, '事件'); break;
        case 'add_junk': {
          const junk = makeCard(pack.cardDefs[pack.junkCardId], nextUid('card'));
          player.deck.push(junk);
          notes.push(`牌组里多了一张「${junk.label}」`);
          break;
        }
        case 'enhance_random_gem': {
          const gems = player.deck.filter((c) => c.kind === 'gem' && !c.enhanced);
          if (gems.length) {
            const card = rng.pick(gems);
            const dir = rng.pick(Object.keys(ENHANCE_DIRS));
            enhanceCard(card, dir);
            notes.push(`「${card.label}」强化了：${ENHANCE_DIRS[dir]}`);
          }
          break;
        }
        case 'remove_random_function': {
          const fns = player.deck.filter((c) => c.kind === 'function');
          if (fns.length) {
            const card = rng.pick(fns);
            player.deck.splice(player.deck.indexOf(card), 1);
            notes.push(`删了「${card.label}」`);
          }
          break;
        }
        case 'add_random_function': {
          const card = addFunctionCard(rng.pick(pack.functionCardList).defId);
          notes.push(`拿到「${card.label}」`);
          break;
        }
        default: break;
      }
    }
    return notes;
  }

  // ───────── 对外操作 ─────────

  function assertActive() {
    if (ended) throw new Error('这一趟已经结束了');
  }

  /** 挑等着的东西。choice：pick 类给 id（或 null 跳过）；enhance 先给 uid 再给方向；event / rest 给选项 id */
  function choose(choice) {
    assertActive();
    if (!pending) return false;
    const p = pending;
    switch (p.type) {
      case 'pick_card':
        if (choice != null) {
          if (!p.options.includes(choice)) return false;
          const card = addFunctionCard(choice);
          note(`拿了「${card.label}」`);
        }
        shiftPending();
        return true;
      case 'pick_buff':
        if (choice != null) {
          if (!p.options.includes(choice)) return false;
          player.buffs.push(choice);
          note(`拿了加成「${pack.buffDefs[choice].label}」`);
        }
        shiftPending();
        return true;
      case 'enhance':
        if (choice == null) { shiftPending(); return true; }
        if (p.step === 'card') {
          const card = player.deck.find((c) => c.uid === choice && !c.enhanced);
          if (!card) return false;
          if (card.kind === 'gem') {
            pending = { ...p, step: 'dir', cardUid: card.uid };
            return true;
          }
          enhanceCard(card, 'number');
          note(`强化了「${card.label}」`);
          shiftPending();
          return true;
        }
        if (!p.dirs.includes(choice)) return false;
        enhanceCard(player.deck.find((c) => c.uid === p.cardUid), choice);
        note(`强化：${ENHANCE_DIRS[choice]}`);
        shiftPending();
        return true;
      case 'remove': {
        if (choice != null) {
          const idx = player.deck.findIndex((c) => c.uid === choice && c.kind !== 'gem');
          if (idx < 0) return false;
          note(`删了「${player.deck[idx].label}」`);
          player.deck.splice(idx, 1);
        }
        shiftPending();
        return true;
      }
      case 'notice':
        shiftPending();
        return true;
      case 'rest': {
        const opt = p.options.find((o) => o.id === choice && !o.disabled);
        if (!opt) return false;
        pending = null;
        if (opt.id === 'heal') { player.hearts = Math.min(player.maxHearts, player.hearts + 1); queue({ type: 'notice', text: '回了 1 颗心', icon: 'heal' }); }
        else if (opt.id === 'enhance') grantReward({ kind: 'enhance' }, '歇脚');
        else if (opt.id === 'remove') grantReward({ kind: 'remove' }, '歇脚');
        else if (opt.id === 'stat') grantReward({ kind: 'stat', stat: opt.stat }, '歇脚');
        if (!pending) shiftPending();
        return true;
      }
      case 'event': {
        const ev = pack.events[p.eventId];
        const idx = p.options.findIndex((o) => o.id === choice && !o.disabled);
        if (idx < 0) return false;
        pending = null;
        const notes = applyEventEffects(ev.options[idx].effects);
        if (notes.length) queue({ type: 'notice', text: notes.join('；'), icon: 'event' });
        if (!pending) shiftPending();
        return true;
      }
      default:
        return false;
    }
  }

  /** 走近藏着的东西 / 小事件点一下 */
  function takeHidden() {
    assertActive();
    const h = clearing?.hidden;
    if (!h || h.taken || pending) return false;
    h.taken = true;
    if (h.kind === 'stash') {
      gold.risky += h.gold;
      let text = `翻到 ${h.gold} 金币`;
      if (h.questId && pack.hiddenQuest) {
        quests.push({ ...clone(pack.hiddenQuest), hidden: true, progress: 0, gained: 0, done: false });
        text += `；还翻出一个任务：${pack.hiddenQuest.label}`;
      }
      queue({ type: 'notice', text, icon: 'gold' });
    } else if (h.kind === 'event') {
      queue(eventPending(h.eventId, 'hidden'));
    }
    return true;
  }

  /** 采任务要的东西 */
  function gather(gatherId) {
    assertActive();
    const g = clearing?.gathers.find((x) => x.id === gatherId);
    if (!g || g.taken) return false;
    g.taken = true;
    bumpQuest(g.questId, 1);
    return true;
  }

  /** 找到藏着的任务物品 */
  function takeFindItem() {
    assertActive();
    if (!clearing?.findQuestId) return false;
    const id = clearing.findQuestId;
    clearing.findQuestId = null;
    bumpQuest(id, 1);
    return true;
  }

  function bumpQuest(id, n) {
    const q = quests.find((x) => x.id === id);
    if (!q || q.done) return;
    q.gained += n;
    if (q.progress + q.gained >= q.count) {
      q.done = true;
      queue({ type: 'notice', text: `任务做完了：${q.label}（回大厅在工会提交）`, icon: 'quest' });
    }
  }

  /** 这一片的开战包（设计稿 10.3） */
  function getBattlePacket(rulesConfig = depart.rulesConfig || {}) {
    if (!clearing || !needsFight(clearing)) return null;
    const enc = pack.encounters[clearing.encounterId];
    const L = layerDef(clearing.layer);
    const scale = clearing.kind === 'gatekeeper' ? 1 : clearing.kind === 'elite' ? (L.eliteHpScale ?? 1) : (L.hpScale ?? 1);
    const allyCards = player.allies.flatMap((id) => pack.allyDefs[id]?.deckCards || []);
    const deckCards = [
      ...player.deck.map((c) => clone(c)),
      ...allyCards.map((defId, i) => ({ ...makeCard(pack.cardDefs[defId], `ally-${clearing.id}-${i}`), fromAlly: true })),
    ];
    return {
      schemaVersion: SCHEMA_VERSION,
      seed: `${clearing.seed}:battle`,
      rulesConfig: { ...(pack.defaultRules || {}), ...rulesConfig },
      player: {
        deck: deckCards,
        stats: { ...player.stats },
        drawTarget: player.drawTarget,
        hearts: player.hearts,
        maxHearts: player.maxHearts,
        buffs: player.buffs.map((id) => {
          const d = pack.buffDefs[id];
          return { id: d.id, slot: d.slot, lane: d.lane, label: d.label, description: d.description, effects: cloneEffects(d.effects) };
        }),
        allies: player.allies.map((id) => {
          const d = pack.allyDefs[id];
          return { id: d.id, role: d.role, roleTag: d.roleTag, mode: d.mode, label: d.label, description: d.description, usesPerBattle: d.remainingUses ?? null, effects: cloneEffects(d.effects) };
        }),
        gearTraits: clone(player.gearTraits),
        gemLevels: clone(player.gemLevels),
      },
      monsters: enc.monsters.map((m, i) => ({
        uid: `${clearing.id}-m${i}`,
        defId: m.defId,
        tier: m.tier,
        label: m.label,
        look: m.look || null,
        attackDamage: m.attackDamage,
        initialCountdown: m.initialCountdown,
        bars: m.bars.map((b) => ({
          maxHp: Math.round(b.maxHp * scale),
          shields: b.shields.map((s) => ({ color: s.color, max: s.max })),
          traits: b.traits.map((t) => ({ id: t.id, label: t.label, effects: cloneEffects(t.effects) })),
        })),
      })),
    };
  }

  /** 一仗打完，交回战斗结果（设计稿 10.3） */
  function finishBattle(result) {
    assertActive();
    if (!clearing || !needsFight(clearing)) throw new Error('这一片没有要打的仗');
    clearing.fought = true;
    runStats.fights++;
    runStats.rainbowCount += result.stats.rainbowCount;
    runStats.heartsLost += result.stats.heartsLost;
    runStats.maxSingleHit = Math.max(runStats.maxSingleHit, result.stats.maxSingleHit);
    runStats.maxChainLength = Math.max(runStats.maxChainLength, result.stats.maxChainLength);
    runStats.totalDamage += result.stats.totalDamage;
    for (const d of result.encounteredMonsters) encountered.add(d);
    player.hearts = result.remainingHearts;
    if (result.gemLevels) player.gemLevels = clone(result.gemLevels);

    if (result.outcome === 'lose') {
      endRun('dead');
      return getState();
    }

    // 怪塞进来的牌留在牌组里（删牌能删）
    for (const card of result.deckChanges.addedCards || []) player.deck.push({ ...clone(card), uid: nextUid('card') });

    // 每仗掉的金币（死了也留着，8.3）
    const L = layerDef(clearing.layer);
    const drop = clearing.kind === 'gatekeeper' ? L.goldPerFight * 3 : clearing.kind === 'elite' ? L.goldPerFight * 2 : L.goldPerFight;
    gold.safe += drop;
    note(`打赢了，掉了 ${drop} 金币`);

    // 任务进度
    for (const q of quests) {
      if (q.done) continue;
      if (q.kind === 'drop') {
        const n = result.defeatedMonsters.filter((m) => m.defId === q.target).length;
        if (n) bumpQuest(q.id, n);
      } else if (q.kind === 'hunt' && (q.layer == null || q.layer === clearing.layer)) {
        bumpQuest(q.id, 1);
      } else if (q.kind === 'gatekeeper' && clearing.kind === 'gatekeeper') {
        bumpQuest(q.id, 1);
      } else if (q.kind === 'challenge_rainbow' && result.stats.rainbowCount > 0) {
        bumpQuest(q.id, 1);
      }
    }

    // 打完给什么
    if (clearing.kind === 'start' && firstClearing) grantReward({ kind: 'function_card' }, '第一片');
    else grantReward(clearing.reward, '出口');
    if (clearing.kind === 'elite' || clearing.kind === 'gatekeeper') {
      grantReward({ kind: 'buff' }, clearing.kind === 'elite' ? '精英' : '看门的');
      if (clearing.kind === 'elite' && exploreSkills.has('elite_gold')) queue(applyGold(zone.rewards.eliteBonusGold, '队友多拿到'));
    }
    firstClearing = false;
    if (!pending) openExits();
    return getState();
  }

  /** 挑一个出口走 */
  function chooseExit(exitId) {
    assertActive();
    if (pending || !clearing?.exits) return false;
    const ex = clearing.exits.find((e) => e.id === exitId);
    if (!ex) return false;
    if (ex.kind === 'return') {
      endRun('returned');
      return true;
    }
    enterClearing(ex.next);
    return true;
  }

  function endRun(outcome) {
    ended = { outcome };
    pending = null;
    pendingQueue.length = 0;
    note(outcome === 'dead' ? '死在林子里了' : '活着回去了');
  }

  /** 回来包（设计稿 10.3）：交给结算 */
  function getReturnPacket() {
    if (!ended) return null;
    const alive = ended.outcome === 'returned';
    return {
      schemaVersion: SCHEMA_VERSION,
      outcome: ended.outcome,
      gold: alive ? gold.safe + gold.risky : gold.safe,
      goldDetail: { ...gold },
      quests: quests.map((q) => ({
        id: q.id,
        hidden: Boolean(q.hidden),
        // 活着回来：这一趟拿到的都存下；死了：只剩以前存着的，这一趟做完没交的算失败
        progress: alive ? Math.min(q.count, q.progress + q.gained) : q.progress,
        done: alive ? q.done : false,
        failed: !alive && q.done,
      })),
      encountered: [...encountered],
      loot: [],
      stats: { ...runStats, deepestLayer: clearing?.layer ?? 1, gatekeeperBeaten: clearing?.kind === 'gatekeeper' && clearing.fought && alive },
    };
  }

  function getState() {
    return clone({
      schemaVersion: RUN_SCHEMA_VERSION,
      zone: { id: zone.id, label: zone.label },
      ended,
      clearing: clearing && {
        ...clearing,
        needsFight: needsFight(clearing),
      },
      pending,
      player: {
        deck: player.deck,
        stats: player.stats,
        drawTarget: player.drawTarget,
        hearts: player.hearts,
        maxHearts: player.maxHearts,
        buffs: player.buffs,
        allies: player.allies,
        gemLevels: player.gemLevels,
        exploreSkills: [...exploreSkills],
      },
      gold,
      quests: quests.map((q) => ({ id: q.id, label: q.label, kind: q.kind, count: q.count, have: q.progress + q.gained, done: q.done, hidden: Boolean(q.hidden), layer: q.layer ?? null })),
      log: log.slice(-6),
      stats: runStats,
    });
  }

  // 第一片：普通怪，打完给一张功能牌三选一；出口里一定有一个是加成（6.4）
  const startLayer = depart.startLayer || 1;
  const firstLen = rng.int(layerDef(startLayer).clearings[0], layerDef(startLayer).clearings[1]);
  const first = buildClearing({ kind: 'start', layer: startLayer, indexInLayer: 0, layerLength: firstLen, encounterId: rollNormalEncounter(startLayer, false), reward: { kind: 'function_card' } });
  markQuestMonster(first);
  enterClearing(first);

  return {
    getState,
    getBattlePacket,
    finishBattle,
    choose,
    takeHidden,
    gather,
    takeFindItem,
    chooseExit,
    getReturnPacket,
    isEnded: () => Boolean(ended),
    /** 投降回去（只在测试和调试用；正式只能走「回去」出口） */
    debugEnd: (o = 'returned') => endRun(o),
  };
}
