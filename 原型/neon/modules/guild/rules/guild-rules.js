// 工会的规则（设计稿 8.2~8.4、6.5）：任务板（接、放弃、提交、全部提交）、商店（买装备）、冒险家等级。
// 纯函数：给存档和内容数据，返回新存档（不改传进来的）和一句话。内容（任务、装备）由调用方传进来。

const RANKS = ['C', 'B', 'A', 'S', 'SS', 'SSS'];
const MAX_TAKEN = 3;
const RANK_UP_AFTER = 3;
const clone = (v) => JSON.parse(JSON.stringify(v));

export const rankIndex = (r) => RANKS.indexOf(r);
export const nextRank = (r) => RANKS[Math.min(RANKS.length - 1, rankIndex(r) + 1)];

/**
 * @typedef {object} GuildContent
 * @property {Object<string, object>} quests 任务定义（id → { grade, reward, label, rankUp?, unlockBuff? }）
 * @property {Object<string, string[]>} board 每级任务板上的 id
 * @property {string} rankQuestId 升级任务 id（C → B）
 * @property {object} hiddenQuest 隐藏任务定义
 * @property {Object<string, object>} gear 装备定义（id → { slot, grade, price, uses, free? }）
 */

function questDef(content, id) {
  if (content.hiddenQuest && id === content.hiddenQuest.id) return content.hiddenQuest;
  return content.quests[id];
}

/** 回到大厅刷新任务板：能接到「等级 + 1」，去掉已经接着的；做够 3 个出升级任务 */
export function refreshBoard(save, content) {
  const s = clone(save);
  const taken = new Set(s.quests.taken.map((q) => q.id));
  const failed = new Set(s.quests.failed);
  const ri = rankIndex(s.rank);
  const ids = [];
  for (const r of [s.rank, RANKS[ri + 1]]) for (const id of content.board[r] || []) if (!taken.has(id) && !failed.has(id)) ids.push(id);
  // 升级任务失败了就在「上次失败的」那栏（可以再接），任务板上不再摆一份
  if (s.rank === 'C' && s.rankDone >= RANK_UP_AFTER && content.rankQuestId && !taken.has(content.rankQuestId) && !failed.has(content.rankQuestId)) ids.unshift(content.rankQuestId);
  s.quests.board = ids.slice(0, 6);
  return s;
}

export function canTake(save) {
  return save.quests.taken.filter((q) => !q.hidden).length < MAX_TAKEN;
}

export function takeQuest(save, id, content) {
  if (!canTake(save)) return { save, ok: false, msg: `同时最多接 ${MAX_TAKEN} 个` };
  const fromBoard = save.quests.board.includes(id);
  const fromFailed = save.quests.failed.includes(id);
  if (!fromBoard && !fromFailed) return { save, ok: false, msg: '板上没有这个任务' };
  const s = clone(save);
  s.quests.board = s.quests.board.filter((x) => x !== id);
  s.quests.failed = s.quests.failed.filter((x) => x !== id);
  s.quests.taken.push({ id, progress: 0, done: false });
  return { save: s, ok: true, msg: `接了：${questDef(content, id)?.label || id}` };
}

export function abandonQuest(save, id) {
  const s = clone(save);
  s.quests.taken = s.quests.taken.filter((q) => q.id !== id);
  s.quests.failed = s.quests.failed.filter((x) => x !== id);
  return { save: s, ok: true, msg: '放弃了' };
}

/** 提交一个做完的任务：拿金币；算进升级；升级任务交了就升一级；隐藏任务解锁加成 */
export function submitQuest(save, id, content) {
  const q = save.quests.taken.find((x) => x.id === id);
  if (!q || !q.done) return { save, ok: false, msg: '还没做完' };
  const def = questDef(content, id);
  const s = clone(save);
  s.quests.taken = s.quests.taken.filter((x) => x.id !== id);
  s.gold += def.reward;
  const lines = [`交了「${def.label}」，+${def.reward} 金币`];
  if (def.rankUp) {
    s.rank = def.rankUp;
    s.rankDone = 0;
    lines.push(`冒险家等级升到 ${s.rank}`);
  } else if (rankIndex(def.grade) >= rankIndex(s.rank)) {
    s.rankDone += 1;
  }
  if (def.unlockBuff && !s.unlocks.buffs.includes(def.unlockBuff)) {
    s.unlocks.buffs.push(def.unlockBuff);
    lines.push('解锁了一个加成');
  }
  return { save: s, ok: true, msg: lines.join('；') };
}

export function submitAll(save, content) {
  let s = save;
  const msgs = [];
  for (const q of save.quests.taken.filter((x) => x.done)) {
    const out = submitQuest(s, q.id, content);
    s = out.save;
    msgs.push(out.msg);
  }
  return { save: s, ok: msgs.length > 0, msg: msgs.length ? msgs.join('\n') : '没有能交的' };
}

/** 商店里卖什么：自己这一级和以下的装备（坏了能买回来，6.5） */
export function shopList(save, content) {
  const ri = rankIndex(save.rank);
  return Object.values(content.gear).filter((g) => !g.free && rankIndex(g.grade) <= ri);
}

export function buyGear(save, id, content) {
  const g = content.gear[id];
  if (!g || g.free) return { save, ok: false, msg: '没有这件' };
  if (rankIndex(g.grade) > rankIndex(save.rank)) return { save, ok: false, msg: `要 ${g.grade} 级才能买` };
  if (save.gold < g.price) return { save, ok: false, msg: '金币不够' };
  const s = clone(save);
  s.gold -= g.price;
  s.gear.owned.push({ id, wear: g.uses });
  if (!s.gear.equipped[g.slot]) s.gear.equipped[g.slot] = id; // 空着就直接穿上
  return { save: s, ok: true, msg: `买了「${g.label}」，能用 ${g.uses} 趟` };
}

/** 工会入口上挂的记号：有几个能交的 */
export function submittableCount(save) {
  return save.quests.taken.filter((q) => q.done).length;
}

export function rankInfo(save) {
  const canRankUp = save.rank === 'C' && save.rankDone >= RANK_UP_AFTER;
  return { rank: save.rank, done: save.rankDone, need: RANK_UP_AFTER, canRankUp, next: nextRank(save.rank) };
}
