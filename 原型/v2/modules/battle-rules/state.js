// 战斗状态：一份纯数据对象（可 JSON / structuredClone），预览靠深拷贝空跑。
import { CONFIG, shuffle, deepClone, ringBit, nextRand } from '../shared/index.js';
import { makeDeck, MONSTERS, ARCANA, isInstant } from '../content/index.js';

export const hasSeal = (b, id) => !!b.player.seals && b.player.seals.includes(id);

export function createRun(seed = 1) {
  return {
    seed, battleIndex: 0,
    player: {
      hearts: CONFIG.hearts, maxHearts: CONFIG.hearts,
      atk: CONFIG.atk, critChance: CONFIG.critChance, critDmg: CONFIG.critDmg,
      handBase: CONFIG.handBase, seals: [],
      gems: [0, 1, 2].map(() => ({ level: 1, exp: 0 })), // 红 绿 蓝，一趟内跨战保留
    },
    deckCards: makeDeck(),
  };
}

export function loadBar(e) {
  const def = e.barDefs[e.bar];
  e.hp = e.maxHp = def.hp;
  e.shield = def.shield ? [...def.shield] : [0, 0, 0];
  e.shieldMax = [...e.shield];
  e.broken = false;
  // 首领后几条血可以换倒计时和出手的轻重
  if (def.countdown !== undefined) { e.cdMax = def.countdown; e.countdown = Math.min(e.countdown, e.cdMax); }
  if (def.hearts !== undefined) e.attackHearts = def.hearts;
}

function makeEnemy(def, idx) {
  const base = MONSTERS[def.monster];
  const e = {
    idx, id: def.monster, name: base.name, look: base.look, trait: def.trait || null,
    barDefs: deepClone(def.bars), bar: 0, barsTotal: def.bars.length,
    hp: 0, maxHp: 0, shield: [0, 0, 0], shieldMax: [0, 0, 0], broken: false,
    countdown: def.countdown, cdMax: def.countdown, attackHearts: def.hearts, alive: true,
    attackNote: def.trait === 'junk' ? '并塞废牌' : '',
  };
  loadBar(e);
  return e;
}

// 战斗开始：洗 29 张，回合 1 起手。
export function createBattle(run, def, seed = (run.seed * 7919 + run.battleIndex * 104729 + 17) >>> 0) {
  const b = {
    phase: 'player', turn: 0, rngState: seed >>> 0,
    battleId: def.id, title: def.title, biome: def.biome, lesson: def.lesson,
    player: deepClone(run.player),
    deck: { draw: [], discard: [], hand: [], chain: [] },
    color: { cursor: -1, collected: 0 },   // 链尾色 / 已集的色（每战开始清空）
    enemies: def.enemies.map(makeEnemy),
    target: 0, resist: null, resistSeq: null, lastDrawn: [],
    ward: 0,                       // 护壁层数（护身结界）
    buff: { surge: 0 },            // 本回合魔力沸腾的层数
    turnFlags: { broke: false },   // 本回合破过盾没有
    startMult: 1,                  // 本回合链倍率的起点（蓄锋待发会改成 2）
    next: { startMult: 1, drawExtra: 0, capExtra: 0 }, // 上回合结束时给下回合留的
    capExtra: 0, maskedUid: null,
  };
  b.deck.draw = shuffle(deepClone(run.deckCards), b);
  if (b.enemies.some(e => e.trait === 'resist')) {
    b.resistSeq = shuffle([0, 1, 2, 3, 4, 5], b);
    b.resist = { now: -1, next: -1 };
  }
  if (hasSeal(b, 'ring_keep')) {
    b.color.collected = shuffle([0, 1, 2, 3, 4, 5], b).slice(0, 3).reduce((m, c) => m | ringBit(c), 0);
  }
  startTurn(b);
  return b;
}

// 带随机色的秘术牌（倍增棱镜、凝色留存）：每次摸到时定色
function rollColor(b, c) {
  const d = c.arcana && ARCANA[c.arcana];
  if (d && d.pool) c.color = d.pool[Math.floor(nextRand(b) * d.pool.length)];
}

export function drawOne(b, cap = Infinity) {
  if (b.deck.hand.length >= cap) return null;
  const d = b.deck;
  if (!d.draw.length) {
    if (!d.discard.length) return null;
    d.draw = shuffle(d.discard.splice(0), b);
  }
  const c = d.draw.pop();
  rollColor(b, c);
  d.hand.push(c);
  return c;
}

// 回合开始：先摸 2 张（手里到上限就不再摸），不足 N 张补到 N 张。
// 上限 = N + 1（宽裕行囊 +1，白潮余韵 / 凝色留存临时 +1）。
export function startTurn(b) {
  b.turn++;
  const nx = b.next || { startMult: 1, drawExtra: 0, capExtra: 0 };
  b.next = { startMult: 1, drawExtra: 0, capExtra: 0 };
  b.startMult = nx.startMult;
  b.buff = { surge: 0 };
  b.turnFlags = { broke: false };
  b.capExtra = nx.capExtra;
  if (b.resistSeq) {
    b.resist.now = b.resistSeq[(b.turn - 1) % 6];
    b.resist.next = b.resistSeq[b.turn % 6];
  }
  const N = b.player.handBase, cap = handCap(b);
  const got = [];
  const n = CONFIG.drawPerTurn + nx.drawExtra;
  for (let k = 0; k < n && b.deck.hand.length < cap; k++) { const c = drawOne(b); if (!c) break; got.push(c.uid); }
  while (b.deck.hand.length < N) { const c = drawOne(b); if (!c) break; got.push(c.uid); }
  b.lastDrawn = got;
  if (!b.enemies[b.target]?.alive) retarget(b);
  // 千丈古树精第 2 条血起：每回合遮住 1 张手牌的颜色
  b.maskedUid = null;
  if (b.enemies.some(e => e.alive && e.trait === 'canopy' && e.bar >= 1) && b.deck.hand.length) {
    b.maskedUid = b.deck.hand[Math.floor(nextRand(b) * b.deck.hand.length)].uid;
  }
  return got;
}

export function handCap(b) {
  return b.player.handBase + CONFIG.handCapExtra + (hasSeal(b, 'wide_bag') ? 1 : 0) + (b.capExtra || 0);
}

export function aliveEnemies(b) { return b.enemies.filter(e => e.alive); }
export function retarget(b) {
  const e = b.enemies.find(x => x.alive);
  b.target = e ? e.idx : 0;
}
export function setTarget(b, i) {
  if (b.enemies[i]?.alive) { b.target = i; return true; }
  return false;
}

// 排链：只接在链尾（没有「插到中间」的接口）。
export function queueCard(b, handIndex) {
  if (b.phase !== 'player') return false;
  const c = b.deck.hand[handIndex];
  if (!c || isInstant(c)) return false;   // 瞬发秘术和废牌不占链位，走 playInstant
  b.deck.hand.splice(handIndex, 1);
  b.deck.chain.push(c);
  return true;
}
export function undoLast(b) {
  if (b.phase !== 'player' || !b.deck.chain.length) return false;
  b.deck.hand.push(b.deck.chain.pop());
  return true;
}
export function undoAll(b) {
  if (b.phase !== 'player' || !b.deck.chain.length) return false;
  b.deck.hand.push(...b.deck.chain.splice(0));
  return true;
}

// 护盾被打空：进入易伤，推迟倒计时（孤注破防不推迟），记下本回合破过盾。
export function breakShield(b, e, events, S) {
  e.broken = true;
  if (!hasSeal(b, 'desperate')) e.countdown += CONFIG.breakPush;
  if (S) S.breaks++;
  if (b.turnFlags) b.turnFlags.broke = true;
  events.push({ type: 'break', enemy: e.idx, view: enemyView(e) });
}

export function enemyView(e) {
  return {
    idx: e.idx, bar: e.bar, barsTotal: e.barsTotal, hp: e.hp, maxHp: e.maxHp,
    shield: [...e.shield], shieldMax: [...e.shieldMax], broken: e.broken,
    countdown: e.countdown, cdMax: e.cdMax, alive: e.alive, attackHearts: e.attackHearts,
  };
}

// 这场仗赢了：心和宝石等级带回一趟的存档，进入下一战。
export function commitVictory(run, b) {
  run.player = deepClone(b.player);
  run.battleIndex++;
}
