// 布局候选的假数据：三个最难摆的场面。
// chain：一只怪，正在排链，看预览；pack：一群 4 只，刚打出去，数字在飘，队友在出手；
// long：看门的第 2 条血，排好了 12 张的大链还没打，带满 3 个队友、5 个加成；gate：同一下打出去以后，上万发在飘。

const g = (color, gems, extra = {}) => ({ color, gems, ...extra });

const DECK = { red: 3, yellow: 2, green: 4, cyan: 3, blue: 4, purple: 2, white: 1 };

export const SCENES = {
  chain: {
    status: {
      hearts: 2.5, maxHearts: 3, gold: 46, where: '第 1 层 · 第 2 片', turn: 3,
      quests: [{ cur: 2, total: 3 }, { cur: 0, total: 1 }],
      buffs: [{ lane: 'break' }, { lane: 'white' }],
    },
    gemLevels: { red: 2, green: 1, blue: 1 },
    recorded: ['red', 'yellow', 'green'],
    current: 'yellow',
    deck: DECK,
    drawCount: 19,
    discardCount: 6,
    allies: [{ role: '战', mode: '自己动' }],
    monsters: [
      { tier: 'normal', hp: 6420, maxHp: 10000, bars: 1, barIndex: 0, shields: [{ color: 'red', cur: 1, max: 3 }, { color: 'blue', cur: 3, max: 3 }], countdown: 2, intent: 0.5, traits: [], selected: true },
    ],
    chain: [g('red', ['red'], { mult: '×1' }), g('yellow', ['red', 'green'], { mult: '×2', rel: 'connect' })],
    hand: [
      g('green', ['green'], { glow: 'connect' }),
      g('blue', ['blue'], { glow: 'complement' }),
      g('cyan', ['green', 'blue'], { dim: true }),
      { fn: true, text: '马上摸 2 张' },
      g('white', ['red', 'green', 'blue'], { glow: 'connect' }),
    ],
    preview: { hits: 6, perHit: 77, total: 462, lines: ['再接 1 张红就破红盾', '差 3 色彩虹'] },
    hint: '再排一张带红的：破红盾',
  },

  pack: {
    status: {
      hearts: 2, maxHearts: 3, gold: 58, where: '第 1 层 · 第 3 片', turn: 2,
      quests: [{ cur: 2, total: 3 }],
      buffs: [{ lane: 'white', flash: true }, { lane: 'multi' }, { lane: 'break' }],
    },
    gemLevels: { red: 2, green: 2, blue: 1 },
    recorded: ['blue'],
    current: 'blue',
    deck: { ...DECK, blue: 1, cyan: 1 },
    drawCount: 21,
    discardCount: 4,
    allies: [{ role: '刺', mode: '跟着触发', say: '补刀 840' }, { role: '坦', mode: '自己动' }],
    monsters: [
      { tier: 'normal', hp: 7410, maxHp: 9000, bars: 1, barIndex: 0, shields: [{ color: 'blue', cur: 4, max: 4 }], countdown: 3, intent: 0.5, traits: [], selected: true, big: true, flash: true },
      { tier: 'normal', hp: 0, maxHp: 2200, bars: 1, barIndex: 0, shields: [], countdown: 2, intent: 0.5, traits: [], dead: true },
      { tier: 'normal', hp: 240, maxHp: 2200, bars: 1, barIndex: 0, shields: [], countdown: 1, intent: 0.5, traits: [], flash: true },
      { tier: 'normal', hp: 1180, maxHp: 2200, bars: 1, barIndex: 0, shields: [], countdown: 2, intent: 0.5, traits: [], flash: true },
    ],
    chain: [],
    hand: [
      g('green', ['green']),
      g('cyan', ['green', 'blue'], { glow: 'connect' }),
      g('red', ['red'], { dim: true }),
      g('green', ['green']),
    ],
    floaters: [
      { m: 0, dx: -30, dy: -10, text: '60', kind: 'normal' },
      { m: 0, dx: 26, dy: -34, text: '90', kind: 'normal' },
      { m: 0, dx: -4, dy: -62, text: '135', kind: 'crit' },
      { m: 0, dx: 34, dy: 16, text: '840', kind: 'ally' },
      { m: 1, dx: 0, dy: -30, text: '320', kind: 'white' },
      { m: 2, dx: -10, dy: -24, text: '320', kind: 'white' },
      { m: 3, dx: 8, dy: -30, text: '320', kind: 'white' },
    ],
    banner: '合白：每只都吃满白色伤害',
    summary: { total: 5750, why: '4 张 · ×8 · 75 发 · 合白一轮 · 队友 +840' },
    preview: { hits: 75, perHit: 66, total: 5750, lines: ['合白多打一轮：3 只 × 320', '队友补刀 +840'] },
  },

  long: {
    status: {
      hearts: 1.5, maxHearts: 3, gold: 120, where: '第 2 层 · 看门的', turn: 5,
      quests: [{ cur: 3, total: 3 }, { cur: 1, total: 1 }],
      buffs: [{ lane: 'rainbow', flash: false }, { lane: 'chain' }, { lane: 'break' }, { lane: 'multi' }, { lane: 'white' }],
    },
    gemLevels: { red: 3, green: 3, blue: 2 },
    recorded: ['red', 'yellow', 'green', 'cyan', 'blue', 'purple'],
    current: 'purple',
    deck: { red: 1, yellow: 0, green: 2, cyan: 1, blue: 0, purple: 1, white: 0 },
    drawCount: 5,
    discardCount: 14,
    allies: [
      { role: '战', mode: '自己动' },
      { role: '刺', mode: '跟着触发' },
      { role: '辅', mode: '塞牌' },
    ],
    monsters: [
      { tier: 'gatekeeper', hp: 8400, maxHp: 20000, bars: 3, barIndex: 1, shields: [{ color: 'green', cur: 2, max: 7 }], countdown: 3, intent: 0.5, traits: ['出手时清空集色'], selected: true, big: true, flash: false },
    ],
    chain: [
      g('red', ['red'], { mult: '×2' }), g('yellow', ['red', 'green'], { mult: '×4', rel: 'connect' }),
      g('green', ['green'], { mult: '×8', rel: 'connect' }), g('cyan', ['green', 'blue'], { mult: '×16', rel: 'connect' }),
      { color: 'blue', gems: ['blue'], short: '×2', mult: '×64', rel: 'connect' }, g('blue', ['blue'], { mult: '×128', rel: 'connect' }),
      g('purple', ['red', 'blue'], { mult: '×256', rel: 'connect' }), g('white', ['red', 'green', 'blue'], { mult: '×512', rel: 'connect' }),
      g('red', ['red'], { mult: '×1024', rel: 'connect' }), g('cyan', ['green', 'blue'], { mult: '×2048', rel: 'complement' }),
      g('blue', ['blue'], { mult: '×4096', rel: 'connect' }), g('purple', ['red', 'blue'], { mult: '×8192', rel: 'connect' }),
    ],
    fired: -1,
    hand: [g('green', ['green']), { fn: true, text: '挡下一次攻击', draw: 1 }],
    preview: { hits: 11282, perHit: 76, total: 857432, lines: ['第 3 张破绿盾，后面 ×1.5', '链打完彩虹再打两遍'] },
  },
  gate: {
    status: {
      hearts: 1.5, maxHearts: 3, gold: 120, where: '第 2 层 · 看门的', turn: 5,
      quests: [{ cur: 3, total: 3 }, { cur: 1, total: 1 }],
      buffs: [{ lane: 'rainbow', flash: true }, { lane: 'chain' }, { lane: 'break' }, { lane: 'multi' }, { lane: 'white' }],
    },
    gemLevels: { red: 3, green: 3, blue: 2 },
    recorded: ['red', 'yellow', 'green', 'cyan', 'blue', 'purple'],
    current: 'purple',
    deck: { red: 1, yellow: 0, green: 2, cyan: 1, blue: 0, purple: 1, white: 0 },
    drawCount: 5,
    discardCount: 14,
    allies: [
      { role: '战', mode: '自己动', say: '削盾 2 格' },
      { role: '刺', mode: '跟着触发', say: '补刀 9140' },
      { role: '辅', mode: '塞牌' },
    ],
    monsters: [
      { tier: 'gatekeeper', hp: 8400, maxHp: 20000, bars: 3, barIndex: 1, shields: [{ color: 'green', cur: 0, max: 7 }], broken: true, countdown: 3, intent: 0.5, traits: ['出手时清空集色'], selected: true, big: true, flash: true },
    ],
    chain: [],
    chainDone: [
      g('red', ['red'], { mult: '×2' }), g('yellow', ['red', 'green'], { mult: '×4', rel: 'connect' }),
      g('green', ['green'], { mult: '×8', rel: 'connect' }), g('cyan', ['green', 'blue'], { mult: '×16', rel: 'connect' }),
      { color: 'blue', gems: ['blue'], short: '×2', mult: '×64', rel: 'connect' }, g('blue', ['blue'], { mult: '×128', rel: 'connect' }),
      g('purple', ['red', 'blue'], { mult: '×256', rel: 'connect' }), g('white', ['red', 'green', 'blue'], { mult: '×512', rel: 'connect' }),
      g('red', ['red'], { mult: '×1024', rel: 'connect' }), g('cyan', ['green', 'blue'], { mult: '×2048', rel: 'complement' }),
      g('blue', ['blue'], { mult: '×4096', rel: 'connect' }), g('purple', ['red', 'blue'], { mult: '×8192', rel: 'connect' }),
    ],
    hand: [g('green', ['green']), { fn: true, text: '挡下一次攻击', draw: 1 }],
    floaters: [
      { m: 0, dx: -62, dy: -58, text: '113 ×4096', kind: 'normal', size: 22 },
      { m: 0, dx: 58, dy: -28, text: '3420', kind: 'crit', size: 34 },
      { m: 0, dx: -40, dy: 4, text: '170 ×8192', kind: 'rainbow', size: 26 },
      { m: 0, dx: 64, dy: 34, text: '9140', kind: 'ally', size: 28 },
      { m: 0, dx: -54, dy: 62, text: '340 ×2048', kind: 'white', size: 24 },
    ],
    breakStamp: true,
    summary: { total: 1284000, rainbow: true, why: '12 张 · ×8192 · 11282 发 · 彩虹 ×3 · 破盾 ×1.5 · 队友 +9140' },
    preview: { hits: 11282, perHit: 113, total: 1284000, lines: ['彩虹再打两遍 ×3', '破盾以后 ×1.5', '队友补刀 +9140'] },
  },
};
