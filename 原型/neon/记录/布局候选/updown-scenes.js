// 布局五（上下布局）的假数据。数都是按设计稿的规矩手算的，只为看画面，不是真打出来的。
// one：一只普通怪，两色盾，链里第 3 张破盾，刺客跟着补一刀，破盾把倒计时推了 1 格。
// pack：一群 3 只（1 只厚的带蓝盾 + 2 只小的倒计时短），链里合白，每只都吃满白色伤害，小的死一只；回合末另一只小的出手打主角。
// gate：看门的第 2 条血，12 张的长链，破盾、合白、打空换第 3 条血、彩虹再打两遍。
// hand：一群 4 只，回合刚开始，手里 12 张（最多就是 12），鼠标放在一张牌和一只怪上。

const g = (color, gems, extra = {}) => ({ color, gems, ...extra });
// 链里一张牌打出去：hits 发，每发 per；critShare 是暴击的比例，暴击那几发每发 critPer
const hit = (hits, per, critShare = 0, critPer = 0) => {
  const critHits = Math.round(hits * critShare);
  return { hits, per, critShare, critPer, dmg: (hits - critHits) * per + critHits * critPer };
};

const DECK = { red: 3, yellow: 2, green: 4, cyan: 3, blue: 4, purple: 2, white: 1 };

// 每发 20，盾没破 ×0.75 = 15，破了 ×1.5 = 30；发数 = 倍率 × 宝石颗数
const ONE = {
  status: {
    hearts: 2.5, maxHearts: 3, gold: 46, where: '第 1 层 · 第 2 片', turn: 3,
    quests: [{ cur: 2, total: 3 }, { cur: 0, total: 1 }],
    buffs: [{ lane: 'break', say: '破盾 +1 格' }, { lane: 'white' }],
  },
  gemLevels: { red: 2, green: 1, blue: 1 },
  recorded: ['red', 'yellow'],
  recordedAfter: ['red', 'yellow', 'cyan', 'blue', 'purple'],
  current: 'yellow',
  deck: DECK,
  drawCount: 19,
  discardCount: 6,
  allies: [{ role: '刺' }],
  target: 0,
  monsters: [
    {
      tier: 'normal', hp: 1400, maxHp: 1400, bars: 1, barIndex: 0,
      shields: [{ color: 'red', cur: 2, max: 2 }, { color: 'blue', cur: 2, max: 2 }],
      countdown: 1, intent: 0.5, traits: [], selected: true,
    },
  ],
  queued: [
    g('red', ['red'], { mult: '×1' }),
    g('purple', ['red', 'blue'], { mult: '×2', rel: 'connect' }),
    g('blue', ['blue'], { mult: '×4', rel: 'connect' }),
    g('cyan', ['green', 'blue'], { mult: '×8', rel: 'connect' }),
  ],
  flyIn: 1, // 链尾那张是从手里第 2 个位子飞过去的
  chain: [
    g('red', ['red'], { mult: '×1', ...hit(1, 15), shred: { red: 1 } }),
    g('purple', ['red', 'blue'], { mult: '×2', rel: 'connect', ...hit(4, 15), shred: { red: 1, blue: 1 } }),
    g('blue', ['blue'], { mult: '×4', rel: 'connect', ...hit(4, 15), shred: { blue: 1 }, ally: { idx: 0, say: '补刀', color: '#c9a8ff', dmg: 120 } }),
    g('cyan', ['green', 'blue'], { mult: '×8', rel: 'connect', ...hit(16, 30, 0.5, 60) }), // 破盾以后每发 ×1.5，一半暴击
  ],
  hand: [g('green', ['green'], { dim: true }), { fn: true, text: '挡下一次攻击', draw: 1 }],
  handAfter: [g('green', ['green']), { fn: true, text: '挡下一次攻击', draw: 1 }],
  ghost: [600],
  willShred: [{ red: 2, blue: 2 }],
  pv: { hits: 25, per: 15, total: 615, hint: '第 3 张破盾，后面 ×1.5' },
  why: '4 张 · 25 发 · 每发 15，破盾以后 30 · 补刀 +120',
};

const PACK = {
  status: {
    hearts: 2.5, maxHearts: 3, gold: 58, where: '第 1 层 · 第 3 片', turn: 2,
    quests: [{ cur: 2, total: 3 }],
    buffs: [{ lane: 'white', say: '合白 +1 轮' }, { lane: 'multi' }],
  },
  gemLevels: { red: 2, green: 2, blue: 1 },
  recorded: ['blue'],
  recordedAfter: ['blue', 'yellow', 'green', 'purple'],
  current: 'blue',
  deck: { ...DECK, blue: 1, cyan: 1 },
  drawCount: 21,
  discardCount: 4,
  allies: [{ role: '刺' }, { role: '辅' }],
  target: 0,
  monsters: [
    { tier: 'normal', hp: 3200, maxHp: 3200, bars: 1, barIndex: 0, shields: [{ color: 'blue', cur: 4, max: 4 }], countdown: 3, intent: 0.5, traits: [], selected: true },
    { tier: 'normal', hp: 140, maxHp: 600, bars: 1, barIndex: 0, shields: [], countdown: 2, intent: 0.5, traits: [] },
    { tier: 'normal', hp: 600, maxHp: 600, bars: 1, barIndex: 0, shields: [], countdown: 1, intent: 0.5, traits: [] },
  ],
  queued: [
    g('yellow', ['red', 'green'], { mult: '×1' }),
    g('green', ['green'], { mult: '×2', rel: 'connect' }),
    g('purple', ['red', 'blue'], { mult: '×4', rel: 'complement' }),
    g('blue', ['blue'], { mult: '×8', rel: 'connect' }),
  ],
  flyIn: 0,
  chain: [
    g('yellow', ['red', 'green'], { mult: '×1', ...hit(2, 15) }),
    g('green', ['green'], { mult: '×2', rel: 'connect', ...hit(2, 15) }),
    g('purple', ['red', 'blue'], { mult: '×4', rel: 'complement', ...hit(8, 15), shred: { blue: 1 }, white: { hits: 12, per: [15, 20, 20] } }), // 合白：红绿蓝三份，每份倍率那么多发
    g('blue', ['blue'], { mult: '×8', rel: 'connect', ...hit(8, 15), shred: { blue: 1 }, ally: { idx: 0, say: '补刀', color: '#c9a8ff', dmg: 90 } }),
  ],
  hand: [g('red', ['red'], { dim: true }), g('green', ['green'], { dim: true })],
  handAfter: [g('red', ['red']), g('green', ['green'])],
  ghost: [420, 0, 0],
  willShred: [{ blue: 2 }],
  pv: { hits: 20, per: 15, total: 300, hint: '合白：3 只都吃一轮' },
  attack: { m: 2, hearts: 0.5, blocked: false, reset: 3 },
  why: '4 张 · 20 发 · 合白一轮 3 只各 12 发 · 补刀 +90',
};

// 看门的：盾没破每发 24，破了 48
const hitsOf = [2, 8, 8, 32, 64, 128, 512, 1536, 1024, 4096, 4096, 16384];
const GATE_CHAIN = [
  g('red', ['red'], { mult: '×2' }),
  g('yellow', ['red', 'green'], { mult: '×4', rel: 'connect', shred: { green: 1 } }),
  g('green', ['green'], { mult: '×8', rel: 'connect', shred: { green: 1 } }),
  g('cyan', ['green', 'blue'], { mult: '×16', rel: 'connect' }),
  { color: 'blue', gems: ['blue'], short: '×2', mult: '×64', rel: 'connect' },
  g('blue', ['blue'], { mult: '×128', rel: 'connect' }),
  g('purple', ['red', 'blue'], { mult: '×256', rel: 'connect' }),
  g('white', ['red', 'green', 'blue'], { mult: '×512', rel: 'connect' }),
  g('red', ['red'], { mult: '×1024', rel: 'connect' }),
  g('cyan', ['green', 'blue'], { mult: '×2048', rel: 'complement' }),
  g('blue', ['blue'], { mult: '×4096', rel: 'connect' }),
  g('purple', ['red', 'blue'], { mult: '×8192', rel: 'connect' }),
];
const gateChain = GATE_CHAIN.map((c, i) => ({ ...c, ...hit(hitsOf[i], i < 3 ? 24 : 48, i === 11 ? 0.3 : 0, 120) }));
gateChain[2].ally = { idx: 1, say: '补刀', color: '#c9a8ff', dmg: 2400 };
gateChain[9].white = { hits: 2048 * 3, per: [48] };
const CHAIN_HITS = hitsOf.reduce((a, b) => a + b, 0);
const RAINBOW = { hits: CHAIN_HITS, per: 24 }; // 换了一条新血，盾是满的，彩虹再打的两遍每发 24
const gateSum = gateChain.reduce((a, c) => a + c.dmg + (c.white ? c.white.hits * c.white.per[0] : 0) + (c.ally ? c.ally.dmg : 0), 0) + RAINBOW.hits * RAINBOW.per * 2;

const GATE = {
  status: {
    hearts: 1.5, maxHearts: 3, gold: 120, where: '第 2 层 · 看门的', turn: 5,
    quests: [{ cur: 3, total: 3 }, { cur: 1, total: 1 }],
    buffs: [{ lane: 'rainbow', say: '彩虹 ×3' }, { lane: 'chain' }, { lane: 'break', say: '破盾 +1 格' }, { lane: 'multi' }, { lane: 'white', say: '合白 +1 轮' }],
  },
  gemLevels: { red: 3, green: 3, blue: 2 },
  recorded: ['red', 'yellow', 'green', 'cyan', 'blue'],
  recordedAfter: ['red', 'yellow', 'green', 'cyan', 'blue', 'purple'],
  current: 'blue',
  deck: { red: 1, yellow: 0, green: 2, cyan: 1, blue: 0, purple: 1, white: 0 },
  drawCount: 5,
  discardCount: 14,
  allies: [{ role: '战' }, { role: '刺' }, { role: '坦' }],
  target: 0,
  interval: 0.13,
  monsters: [
    {
      tier: 'gatekeeper', hp: 1200000, maxHp: 3000000, bars: 3, barIndex: 1,
      shields: [{ color: 'green', cur: 2, max: 7 }], countdown: 2, intent: 1,
      traits: [{ glyph: '清', text: '出手时清空集到的颜色' }],
      nextShields: [{ color: 'purple', cur: 8, max: 8 }],
      nextTraits: [{ glyph: '拨', text: '每被破一次盾，倒计时 -1' }],
      selected: true,
    },
  ],
  queued: GATE_CHAIN,
  flyIn: 4,
  chain: gateChain,
  rainbow: [RAINBOW, RAINBOW],
  packBudget: 4, // 长链：一张牌最多冒 4 个数，0.5 秒就淡掉，同屏二十来个
  floatLife: 0.5,
  hand: [g('green', ['green'], { dim: true }), { fn: true, text: '挡下一次攻击', draw: 1 }, g('red', ['red'], { dim: true })],
  handAfter: [g('green', ['green']), { fn: true, text: '挡下一次攻击', draw: 1 }, g('red', ['red'])],
  ghost: [1200000],
  willShred: [{ green: 2 }],
  pv: { hits: CHAIN_HITS, per: 48, total: gateSum - 2400, hint: '第 3 张破盾 · 彩虹再打两遍' },
  why: `12 张 · ${CHAIN_HITS} 发 · 每发 24，破盾以后 48 · 合白一轮 · 彩虹再打两遍 · 补刀 +2400`,
};

const HAND = {
  status: {
    hearts: 3, maxHearts: 3, gold: 58, where: '第 1 层 · 第 4 片', turn: 1,
    quests: [{ cur: 2, total: 3 }],
    buffs: [{ lane: 'white' }, { lane: 'multi' }, { lane: 'break' }],
  },
  gemLevels: { red: 2, green: 2, blue: 1 },
  recorded: [],
  current: null,
  deck: DECK,
  drawCount: 17,
  discardCount: 0,
  allies: [{ role: '刺' }, { role: '坦' }, { role: '辅' }],
  target: 0,
  monsters: [
    { tier: 'elite', hp: 5400, maxHp: 5400, bars: 1, barIndex: 0, shields: [{ color: 'red', cur: 3, max: 3 }, { color: 'cyan', cur: 2, max: 2 }], countdown: 4, intent: 1, traits: [{ glyph: '减', text: '集到几色，就少受几成伤害' }], selected: true },
    { tier: 'normal', hp: 600, maxHp: 600, bars: 1, barIndex: 0, shields: [], countdown: 2, intent: 0.5, traits: [] },
    { tier: 'normal', hp: 600, maxHp: 600, bars: 1, barIndex: 0, shields: [], countdown: 3, intent: 0.5, traits: [] },
    { tier: 'normal', hp: 380, maxHp: 600, bars: 1, barIndex: 0, shields: [], countdown: 1, intent: 0.5, traits: [] },
  ],
  queued: [],
  chain: [],
  hand: [
    g('red', ['red'], { glow: 'connect' }), g('yellow', ['red', 'green']), g('green', ['green']),
    { fn: true, text: '马上摸 2 张' }, g('cyan', ['green', 'blue']), g('blue', ['blue']),
    g('purple', ['red', 'blue']), g('white', ['red', 'green', 'blue']), g('green', ['green']),
    { fn: true, text: '这回合每发 +50%' }, g('red', ['red']), g('blue', ['blue']),
  ],
  hoverCard: 4,
  handAfter: [],
  why: '',
};

export const UPDOWN_SCENES = { one: ONE, pack: PACK, gate: GATE, hand: HAND };
