// 假的一片空地状态（单测和 demo 页共用，不靠 run-rules）
export function fakeRunState(over = {}) {
  return {
    schemaVersion: 1,
    zone: { id: 'forest', label: '森林·外头区' },
    ended: null,
    clearing: {
      id: 'cl-1', seed: 'demo', kind: 'normal', layer: 1, indexInLayer: 0, layerLength: 3, needsFight: true,
      monsters: [{ defId: 'm', tier: 'normal', look: 'mon_dual_shield', label: '怪' }],
      hidden: { kind: 'stash', gold: 12, taken: false }, gathers: [{ id: 'g1', questId: 'q1', taken: false }], findQuestId: null, exits: null,
    },
    pending: null,
    player: {
      deck: [{ uid: 'c1', defId: 'gem_red', kind: 'gem', color: 'red', gems: ['red'], label: '红宝石', description: '' }, { uid: 'c2', defId: 'fn_draw_2', kind: 'function', usage: 'instant', color: 'colorless', gems: [], label: '马上摸 2 张', description: '' }],
      stats: { attack: 80, damageBonus: 0, critRate: 0.1, critDamage: 1.5 }, drawTarget: 4, hearts: 2.5, maxHearts: 3,
      buffs: ['b1'], allies: ['a1'], gemLevels: { red: { level: 1 }, green: { level: 1 }, blue: { level: 1 } }, exploreSkills: [],
    },
    gold: { safe: 10, risky: 15 },
    quests: [{ id: 'q1', label: '第 1 层采 3 个', kind: 'gather', count: 3, have: 1, done: false, hidden: false }],
    log: [],
    stats: {},
    ...over,
  };
}

export const FAKE_CATALOG = {
  cards: { fn_draw_2: { label: '马上摸 2 张', description: '马上用：立刻摸 2 张牌', usage: 'instant', drawAfterPlay: 0 }, fn_block_next: { label: '挡下一次攻击', description: '马上用', usage: 'instant', drawAfterPlay: 1 }, fn_mult_x2_blue: { label: '蓝 · 倍率 ×2', description: '排进链', usage: 'chain', color: 'blue' } },
  buffs: { b1: { label: '破盾时全体吃一轮白', description: '破盾时……', lane: 'break', lanes: ['break', 'white'] }, b2: { label: '彩虹以后留 3 色', description: '……', lane: 'rainbow' }, b3: { label: '第一次断色照样 ×2', description: '……', lane: 'chain' } },
  allies: { a1: { role: 'assassin', roleTag: '刺', label: '补刀' } },
};

export const fakeExits = [
  { id: 'x-0', kind: 'normal', label: '加成', reward: { kind: 'buff' }, isPack: false, questMark: true },
  { id: 'x-1', kind: 'elite', label: '属性', reward: { kind: 'stat', stat: 'attack' }, elite: true, isPack: false },
  { id: 'x-2', kind: 'rest', label: '歇脚' },
];
