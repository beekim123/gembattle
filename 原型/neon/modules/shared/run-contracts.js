// 一趟和大厅之间来往的三样东西（设计稿 10.0、10.3）：出发包、回来包、存档。
// 跟战斗的四样（contracts.js）一样，各模块只照这里的约定读写，拼错、漏字段在这里就报出来。
// 只查「形状对不对」，不管数合不合理（那是 content 和假玩家的事）。

import { GEAR_SLOTS, SCHEMA_VERSION } from './contracts.js';

export const RUN_OUTCOMES = Object.freeze(['returned', 'dead']);
export const ADVENTURER_RANKS = Object.freeze(['C', 'B', 'A', 'S', 'SS', 'SSS']);

const isObj = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isNat = (v) => Number.isInteger(v) && v >= 0;
const isStrList = (v) => Array.isArray(v) && v.every(isStr);
const result = (errors) => ({ ok: errors.length === 0, errors });

/**
 * 出发包（depart → run-rules）：带什么属性、什么牌、什么任务出门。
 * @typedef {object} DepartPacket
 * @property {number} schemaVersion
 * @property {string} seed
 * @property {string} zoneId 去哪个地点（原型只有 forest）
 * @property {{ stats: {attack:number,damageBonus:number,critRate:number,critDamage:number}, drawTarget:number, hearts:number, maxHearts:number, gearTraits?:object[], extraCards?:string[], buffs?:string[], allies?:string[] }} player
 * @property {Array<{id:string, kind:string, count:number, savedProgress?:number}>} quests 带出去的任务（做到一半的进度跟着）
 * @property {object} [rulesConfig] 试打台改的规则开关
 */
export function validateDepartPacket(p) {
  const e = [];
  if (!isObj(p)) return result(['出发包必须是对象']);
  if (p.schemaVersion !== SCHEMA_VERSION) e.push(`出发包 schemaVersion 必须为 ${SCHEMA_VERSION}`);
  if (!isStr(p.seed)) e.push('出发包 seed 必须是非空字符串');
  if (!isStr(p.zoneId)) e.push('出发包 zoneId 必须是非空字符串');
  const pl = p.player;
  if (!isObj(pl)) e.push('出发包 player 必须是对象');
  else {
    if (!isObj(pl.stats)) e.push('player.stats 必须是对象');
    else for (const k of ['attack', 'damageBonus', 'critRate', 'critDamage']) if (!isNum(pl.stats[k])) e.push(`player.stats.${k} 必须是数字`);
    if (!Number.isInteger(pl.drawTarget) || pl.drawTarget < 1 || pl.drawTarget > 12) e.push('player.drawTarget 必须是 1~12 的整数');
    if (!isNum(pl.maxHearts) || pl.maxHearts <= 0) e.push('player.maxHearts 必须是正数');
    if (!isNum(pl.hearts) || pl.hearts <= 0 || pl.hearts > pl.maxHearts) e.push('player.hearts 必须大于 0、不超过 maxHearts');
    // 下面几样不带可以不写，写了就要对
    if (pl.gearTraits !== undefined && !Array.isArray(pl.gearTraits)) e.push('player.gearTraits 必须是数组');
    for (const k of ['extraCards', 'buffs', 'allies']) if (pl[k] !== undefined && !isStrList(pl[k])) e.push(`player.${k} 必须是字符串数组（id）`);
  }
  if (!Array.isArray(p.quests)) e.push('出发包 quests 必须是数组');
  else p.quests.forEach((q, i) => {
    if (!isObj(q)) { e.push(`quests[${i}] 必须是对象`); return; }
    if (!isStr(q.id)) e.push(`quests[${i}].id 必须是非空字符串`);
    if (!isStr(q.kind)) e.push(`quests[${i}].kind 必须是非空字符串`);
    if (!Number.isInteger(q.count) || q.count < 1) e.push(`quests[${i}].count 必须是正整数`);
    if (q.savedProgress !== undefined && !isNat(q.savedProgress)) e.push(`quests[${i}].savedProgress 必须是非负整数`);
  });
  if (p.rulesConfig !== undefined && !isObj(p.rulesConfig)) e.push('出发包 rulesConfig 必须是对象');
  return result(e);
}

/**
 * 回来包（run-rules → settleRun → save）：活没活着、带回多少、任务做到哪。
 * @typedef {object} ReturnPacket
 * @property {number} schemaVersion
 * @property {'returned'|'dead'} outcome
 * @property {number} gold 带回的金币（死了只剩每仗掉的）
 * @property {{ safe:number, risky:number }} goldDetail
 * @property {Array<{id:string, hidden:boolean, progress:number, done:boolean, failed:boolean}>} quests
 * @property {string[]} encountered 碰到过的怪（卡册用）
 * @property {object[]} loot 战利品（原型还没有）
 * @property {object} stats 这一趟的战绩
 */
export function validateReturnPacket(p) {
  const e = [];
  if (!isObj(p)) return result(['回来包必须是对象']);
  if (p.schemaVersion !== SCHEMA_VERSION) e.push(`回来包 schemaVersion 必须为 ${SCHEMA_VERSION}`);
  if (!RUN_OUTCOMES.includes(p.outcome)) e.push(`回来包 outcome 必须是 ${RUN_OUTCOMES.join(' / ')}`);
  if (!isNat(p.gold)) e.push('回来包 gold 必须是非负整数');
  if (!isObj(p.goldDetail) || !isNat(p.goldDetail.safe) || !isNat(p.goldDetail.risky)) e.push('回来包 goldDetail 必须是 { safe, risky } 两个非负整数');
  if (!Array.isArray(p.quests)) e.push('回来包 quests 必须是数组');
  else p.quests.forEach((q, i) => {
    if (!isObj(q) || !isStr(q.id)) { e.push(`quests[${i}] 要有 id`); return; }
    if (!isNat(q.progress)) e.push(`quests[${i}].progress 必须是非负整数`);
    for (const k of ['hidden', 'done', 'failed']) if (typeof q[k] !== 'boolean') e.push(`quests[${i}].${k} 必须是布尔值`);
  });
  if (!isStrList(p.encountered)) e.push('回来包 encountered 必须是字符串数组（怪的 defId）');
  if (!Array.isArray(p.loot)) e.push('回来包 loot 必须是数组');
  if (!isObj(p.stats)) e.push('回来包 stats 必须是对象');
  return result(e);
}

/**
 * 存档（save 管读写；guild / recruit / depart / settleRun 交回新存档）。
 * @typedef {object} SaveData
 * @property {number} saveVersion
 * @property {number} gold
 * @property {'C'|'B'|'A'|'S'|'SS'|'SSS'} rank 冒险家等级
 * @property {number} rankDone 这一级做完了几个任务
 * @property {{ board:string[], taken:Array<{id:string, progress:number, done:boolean, hidden?:boolean}>, failed:string[] }} quests
 * @property {{ owned:Array<{id:string, wear:number}>, equipped:{weapon:string|null, armor:string|null, trinket:string|null} }} gear
 * @property {{ buffs:string[] }} unlocks
 * @property {string[]} hired 这一趟雇的队友
 * @property {{ monsters:string[], loot:any[] }} album
 * @property {number} runs
 * @property {object|null} lastRun
 */
export function validateSaveData(s) {
  const e = [];
  if (!isObj(s)) return result(['存档必须是对象']);
  if (!isNat(s.saveVersion)) e.push('存档 saveVersion 必须是非负整数');
  if (!isNat(s.gold)) e.push('存档 gold 必须是非负整数');
  if (!ADVENTURER_RANKS.includes(s.rank)) e.push(`存档 rank 必须是 ${ADVENTURER_RANKS.join(' / ')}`);
  if (!isNat(s.rankDone)) e.push('存档 rankDone 必须是非负整数');
  const q = s.quests;
  if (!isObj(q)) e.push('存档 quests 必须是对象');
  else {
    if (!isStrList(q.board)) e.push('quests.board 必须是字符串数组');
    if (!isStrList(q.failed)) e.push('quests.failed 必须是字符串数组');
    if (!Array.isArray(q.taken)) e.push('quests.taken 必须是数组');
    else q.taken.forEach((t, i) => {
      if (!isObj(t) || !isStr(t.id)) { e.push(`quests.taken[${i}] 要有 id`); return; }
      if (!isNat(t.progress ?? 0)) e.push(`quests.taken[${i}].progress 必须是非负整数`);
      if (t.done !== undefined && typeof t.done !== 'boolean') e.push(`quests.taken[${i}].done 必须是布尔值`);
    });
  }
  const g = s.gear;
  if (!isObj(g) || !Array.isArray(g.owned) || !isObj(g.equipped)) e.push('存档 gear 必须是 { owned: [], equipped: {} }');
  else {
    g.owned.forEach((o, i) => { if (!isObj(o) || !isStr(o.id) || !isNat(o.wear)) e.push(`gear.owned[${i}] 必须是 { id, wear }`); });
    for (const slot of GEAR_SLOTS) if (g.equipped[slot] !== null && !isStr(g.equipped[slot])) e.push(`gear.equipped.${slot} 必须是装备 id 或 null`);
  }
  if (!isObj(s.unlocks) || !isStrList(s.unlocks.buffs)) e.push('存档 unlocks.buffs 必须是字符串数组');
  if (!isStrList(s.hired)) e.push('存档 hired 必须是字符串数组');
  if (!isObj(s.album) || !isStrList(s.album.monsters) || !Array.isArray(s.album.loot)) e.push('存档 album 必须是 { monsters: [], loot: [] }');
  if (!isNat(s.runs)) e.push('存档 runs 必须是非负整数');
  if (s.lastRun !== null && !isObj(s.lastRun)) e.push('存档 lastRun 必须是对象或 null');
  return result(e);
}
