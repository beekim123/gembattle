// 招募（设计稿 8.1、8.4）：花金币雇这一趟的队友；出发前能退，全额退钱。席位跟着冒险家等级涨。
const clone = (v) => JSON.parse(JSON.stringify(v));
const RANKS = ['C', 'B', 'A', 'S', 'SS', 'SSS'];
const SEATS = { C: 1, B: 2, A: 2, S: 3, SS: 3, SSS: 3 };

export const seatsFor = (rank) => SEATS[rank] ?? 1;

/** 这一级能雇谁（队友的 unlockRank ≤ 等级） */
export function availableAllies(save, allies) {
  const ri = RANKS.indexOf(save.rank);
  return Object.values(allies).filter((a) => RANKS.indexOf(a.unlockRank || 'C') <= ri);
}

export function hireAlly(save, id, allies) {
  const a = allies[id];
  if (!a) return { save, ok: false, msg: '没有这个队友' };
  if (save.hired.includes(id)) return { save, ok: false, msg: '已经雇了' };
  if (!availableAllies(save, allies).some((x) => x.id === id)) return { save, ok: false, msg: `要 ${a.unlockRank} 级才能雇` };
  if (save.hired.length >= seatsFor(save.rank)) return { save, ok: false, msg: `席位满了（${save.rank} 级 ${seatsFor(save.rank)} 个）` };
  if (save.gold < a.hireCost) return { save, ok: false, msg: '金币不够' };
  const s = clone(save);
  s.gold -= a.hireCost;
  s.hired.push(id);
  return { save: s, ok: true, msg: `雇了${a.roleTag}，这一趟跟着你` };
}

export function refundAlly(save, id, allies) {
  if (!save.hired.includes(id)) return { save, ok: false, msg: '没雇这个' };
  const s = clone(save);
  s.hired = s.hired.filter((x) => x !== id);
  s.gold += allies[id]?.hireCost || 0;
  return { save: s, ok: true, msg: '退了，钱全退回来' };
}
