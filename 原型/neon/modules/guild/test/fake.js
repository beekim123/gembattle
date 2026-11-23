// 假内容和假存档（单测和 demo 页用）
export const FAKE_GUILD_CONTENT = {
  quests: {
    q1: { id: 'q1', grade: 'C', reward: 90, count: 3, label: '第 1 层采 3 个' },
    q2: { id: 'q2', grade: 'C', reward: 80, count: 3, label: '第 1 层打 3 仗' },
    q3: { id: 'q3', grade: 'C', reward: 100, count: 2, label: '打双色盾的怪 2 只' },
    qb: { id: 'qb', grade: 'B', reward: 350, count: 1, label: '打外头区的看门的' },
    qr: { id: 'qr', grade: 'C', reward: 150, count: 1, rankUp: 'B', label: '升级任务：打看门的' },
  },
  board: { C: ['q1', 'q2', 'q3'], B: ['qb'] },
  rankQuestId: 'qr',
  hiddenQuest: { id: 'qh', grade: 'C', reward: 150, count: 1, unlockBuff: 'buff_x', label: '隐藏任务：打出彩虹' },
  gear: {
    free: { id: 'free', slot: 'weapon', grade: 'free', free: true, label: '基础武器', price: 0 },
    w1: { id: 'w1', slot: 'weapon', grade: 'C', label: '武器：攻击 +50', price: 85, uses: 7 },
    a1: { id: 'a1', slot: 'armor', grade: 'C', label: '护身：心 +1', price: 95, uses: 7 },
    t1: { id: 't1', slot: 'trinket', grade: 'C', label: '饰品：增伤 +15%', price: 75, uses: 7 },
    wb: { id: 'wb', slot: 'weapon', grade: 'B', label: 'B 级武器', price: 300, uses: 7 },
  },
};

export function fakeSave(over = {}) {
  return {
    saveVersion: 1, gold: 120, rank: 'C', rankDone: 0,
    quests: { board: [], taken: [], failed: [] },
    gear: { owned: [], equipped: { weapon: null, armor: null, trinket: null } },
    unlocks: { buffs: [] }, hired: [], album: { monsters: [], loot: [] }, runs: 0, lastRun: null, run: null,
    ...over,
  };
}
