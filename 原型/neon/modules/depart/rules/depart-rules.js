// 出发（设计稿 8.1、10.3）：挑地点、看这趟带了什么、穿脱装备、出发（拼出发包交给 run-rules）。
// 主角属性怎么从装备算出来由调用方给（content 的 buildHeroLoadout），这里不认识 content。

import { SCHEMA_VERSION } from '../../shared/index.js';

const clone = (v) => JSON.parse(JSON.stringify(v));
export const SLOTS = Object.freeze(['weapon', 'armor', 'trinket']);
export const SLOT_LABEL = Object.freeze({ weapon: '武器', armor: '护身', trinket: '饰品' });

/** 这一格能穿什么：空着（武器空着就是借工会的基础武器）+ 自己有的（同一种只列一次，穿还能用最久的） */
export function slotOptions(save, slot, gear) {
  const ids = [...new Set(save.gear.owned.map((o) => o.id))].filter((id) => gear[id]?.slot === slot);
  return [null, ...ids];
}

export function equipGear(save, slot, id, gear) {
  if (id !== null && (!gear[id] || gear[id].slot !== slot || !save.gear.owned.some((o) => o.id === id))) return { save, ok: false, msg: '没有这件' };
  const s = clone(save);
  s.gear.equipped[slot] = id;
  return { save: s, ok: true, msg: id ? `穿上「${gear[id].label}」` : '脱了' };
}

/** 换到这一格的下一件（◀ ▶ 用） */
export function cycleGear(save, slot, dir, gear) {
  const opts = slotOptions(save, slot, gear);
  const i = opts.indexOf(save.gear.equipped[slot] ?? null);
  const next = opts[(i + dir + opts.length) % opts.length];
  return equipGear(save, slot, next, gear);
}

/**
 * 拼出发包。
 * @param {object} save
 * @param {object} o
 * @param {object} o.loadout 主角属性（{ stats, hearts, maxHearts, drawTarget, gearTraits }，由调用方从装备算好）
 * @param {object} o.quests 任务定义（id → def，含隐藏任务）
 * @param {string} o.seed
 * @param {object} [o.rulesConfig]
 * @param {string} [o.zoneId='forest']
 */
export function buildDepartPacket(save, { loadout, quests, seed, rulesConfig = {}, zoneId = 'forest' }) {
  return {
    schemaVersion: SCHEMA_VERSION,
    seed,
    zoneId,
    player: {
      stats: { ...loadout.stats },
      drawTarget: loadout.drawTarget,
      hearts: loadout.hearts,
      maxHearts: loadout.maxHearts,
      gearTraits: clone(loadout.gearTraits || []),
      extraCards: [],
      buffs: [],
      allies: [...save.hired],
    },
    quests: save.quests.taken.filter((q) => !q.done && quests[q.id]).map((q) => ({ ...clone(quests[q.id]), savedProgress: q.progress || 0 })),
    rulesConfig: { ...rulesConfig },
  };
}
