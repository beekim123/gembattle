// 一趟（落果密林）的状态与流程：纯数据，可 JSON、可重放。
// 流程：地图选节点 → 进节点（战斗 / 营火 / 行商 / 偶遇）→ 结算战利品 → 回地图；第 4 步打完弹界门；第 8 步首领是终点。
import { createRun, createBattle, commitVictory } from '../battle-rules/index.js';
import { ENCOUNTERS, EVENTS, GOLD_DROP, BIOMES } from '../content/index.js';
import { generateMap, childrenOf, GATE_AFTER, STEPS } from './map.js';
import { applyImmediateLoot, lootNeedsChoice, heal, boostAtk, removable, removeCard, applyCarve, carveOptions } from './rewards.js';
import { shopStock } from './shop.js';

export function createTrip(seed = 1) {
  const run = createRun(seed);
  return {
    ...run, kind: 'trip', rngState: (seed * 40503 + 977) >>> 0,
    map: generateMap(seed),
    pos: null,             // 现在站在哪个节点（进了节点就算站在那）
    busy: false,           // 节点还没办完
    step: 0,               // 走到第几步
    path: [],              // 走过的节点，按顺序
    gatePending: false,    // 第 4 步打完，等玩家在界门选
    gateChosen: false,
    gold: 0, uidSeq: 0,
    ended: null,           // null | { kind: 'retreat' | 'defeat' | 'victory' }
    stats: { battles: 0, carves: [], arcana: [], seals: [], bought: 0, campUsed: [], events: [] },
    shop: null,
  };
}

export const nodeOf = (trip, id) => trip.map.nodes[id];

// 现在能点哪些节点
export function nextNodes(trip) {
  if (trip.ended || trip.busy || trip.gatePending) return [];
  if (!trip.pos) return [...trip.map.layers[0]];
  return childrenOf(trip.map, trip.pos);
}

export function enterNode(trip, id) {
  if (!nextNodes(trip).includes(id)) return null;
  const node = nodeOf(trip, id);
  trip.pos = id; trip.step = node.step; trip.busy = true; trip.path.push(id);
  if (node.type === 'shop') trip.shop = shopStock(trip);
  return node;
}

// 这个节点所处的生态（路线图悬停卡、非战斗场景背景用）
export function biomeOfNode(node) {
  if (node.type === 'camp') return 'camp';
  if (node.type === 'shop') return 'trade';
  if (node.type === 'event') return EVENTS[node.eventId].biome;
  return ENCOUNTERS[node.enc].biome;
}

// 节点上一场仗的定义（战斗引擎用）
export function battleDef(node) {
  const enc = ENCOUNTERS[node.enc];
  return { ...enc, title: `第 ${node.step} 步 · ${enc.title}`, biome: node.biome || enc.biome };
}
export const isFight = node => node.type === 'battle' || node.type === 'elite' || node.type === 'boss';

export function startBattle(trip, node) { return createBattle(trip, battleDef(node)); }

// 赢了：心和宝石等级带回这一趟；掉金币；返回要结算的战利品
export function winBattle(trip, node, b) {
  commitVictory(trip, b);
  const gold = GOLD_DROP[node.type === 'elite' ? 'elite' : node.type === 'boss' ? 'boss' : 'battle'];
  trip.gold += gold;
  trip.stats.battles++;
  if (node.type === 'boss') { trip.ended = { kind: 'victory' }; trip.busy = false; return { gold, loot: null }; }
  return { gold, loot: node.loot };
}
export function loseBattle(trip) { trip.ended = { kind: 'defeat' }; trip.busy = false; }

// 战利品里能立刻结算的就立刻结算；要挑的返回 { choice: kind }
export function takeLoot(trip, kind) {
  if (lootNeedsChoice(kind)) return { choice: kind };
  return applyImmediateLoot(trip, kind);
}

// 节点办完了：回地图。第 4 步办完弹界门。
export function finishNode(trip) {
  trip.busy = false;
  const node = nodeOf(trip, trip.pos);
  if (node.step === GATE_AFTER && !trip.gateChosen) trip.gatePending = true;
}

// ---------- 营火整备（三选一，选一个就结束） ----------
export function campOptions(trip) {
  const purge = removable(trip).length > 0;
  return [
    { id: 'heal', name: '围火疗伤', text: '回 1 颗心' },
    { id: 'carve', name: '雕琢宝石', text: '强化 1 张宝石牌' },
    purge ? { id: 'purge', name: '清理行囊', text: '删 1 张秘术牌或废牌' } : { id: 'purge', name: '清理行囊', text: '没有可删的牌：改成攻击 +10', fallback: true },
  ];
}
export function campHeal(trip) { const g = heal(trip, 1); trip.stats.campUsed.push('heal'); return g; }
export function campPurge(trip, uid) {
  if (!removable(trip).length) { boostAtk(trip, 10); trip.stats.campUsed.push('atk'); return 'atk'; }
  if (!removeCard(trip, uid)) return false;
  trip.stats.campUsed.push('purge');
  return 'purge';
}
export function campCarve(trip, uid, kind) {
  if (!applyCarve(trip, uid, kind)) return false;
  trip.stats.campUsed.push('carve'); return true;
}

// ---------- 青苔界门 ----------
export function gateChoose(trip, choice) {
  if (!trip.gatePending) return false;
  trip.gatePending = false; trip.gateChosen = true;
  if (choice === 'retreat') trip.ended = { kind: 'retreat' };
  return true;
}

// ---------- 结算 ----------
export function summarize(trip) {
  const end = trip.ended;
  return {
    outcome: end ? end.kind : 'running',
    step: trip.step, steps: STEPS,
    gold: trip.gold, hearts: trip.player.hearts, maxHearts: trip.player.maxHearts,
    handBase: trip.player.handBase, atk: trip.player.atk,
    seals: [...trip.player.seals], carves: [...trip.stats.carves], arcana: [...trip.stats.arcana],
    battles: trip.stats.battles,
    gems: trip.player.gems.map(g => g.level),
    kept: end ? end.kind !== 'defeat' : true,   // 阵亡：战利品尽失
  };
}
