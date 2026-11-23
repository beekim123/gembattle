// 卡册（设计稿 8.5）：只读不写。照存档算每一格亮没亮：牌和加成、队友、装备看解锁；怪看碰没碰到过；战利品原型只有空格子。
const RANKS = ['C', 'B', 'A', 'S', 'SS', 'SSS'];

export const ALBUM_TABS = Object.freeze([
  { id: 'cards', label: '牌' },
  { id: 'buffs', label: '加成' },
  { id: 'allies', label: '队友' },
  { id: 'monsters', label: '怪' },
  { id: 'gear', label: '装备' },
  { id: 'loot', label: '战利品' },
]);

/**
 * @param {object} save
 * @param {object} data { cards: [{id,label,description,color,kind}], buffs: [{id,label,description,lane,locked}], allies: [{id,label,description,roleTag,unlockRank,explore}], monsters: [{defId,label,tier,info}], gear: [{id,label,grade,trait}] }
 * @returns {Object<string, Array<{id,label,description,open,extra}>>}
 */
export function albumEntries(save, data) {
  const ri = RANKS.indexOf(save.rank);
  const seen = new Set(save.album?.monsters || []);
  const unlockedBuffs = new Set(save.unlocks?.buffs || []);
  return {
    cards: data.cards.map((c) => ({ id: c.id, label: c.label, description: c.description, open: true, extra: c })),
    buffs: data.buffs.map((b) => ({ id: b.id, label: b.label, description: b.description, open: !b.locked || unlockedBuffs.has(b.id), extra: b })),
    allies: data.allies.map((a) => ({ id: a.id, label: `${a.roleTag} · ${a.label}`, description: `${a.description}。探索：${a.explore?.label || '—'}`, open: RANKS.indexOf(a.unlockRank || 'C') <= ri, extra: a })),
    monsters: data.monsters.map((m) => ({ id: m.defId, label: seen.has(m.defId) ? m.label : '？', description: seen.has(m.defId) ? m.info : '还没碰到过', open: seen.has(m.defId), extra: m })),
    gear: data.gear.map((g) => ({ id: g.id, label: g.label, description: `${g.grade === 'free' ? '工会免费借，不会坏' : `${g.grade} 级 · ${g.price} 金币 · 能用 ${g.uses} 趟`}${g.trait ? ` · ${g.trait.label}` : ''}`, open: g.grade === 'free' || RANKS.indexOf(g.grade) <= ri, extra: g })),
    loot: Array.from({ length: 6 }, (_, i) => ({ id: `loot-${i}`, label: '？', description: '精英、看门的身上掉（原型还没做）', open: (save.album?.loot || [])[i] != null })),
  };
}
