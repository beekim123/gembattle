// 战斗状态：一份纯数据对象（可 JSON / structuredClone），预览靠深拷贝空跑。
import { CONFIG, shuffle, deepClone } from '../shared/index.js';
import { makeDeck, MONSTERS } from '../content/index.js';

export function createRun(seed = 1) {
  return {
    seed, battleIndex: 0,
    player: {
      hearts: CONFIG.hearts, maxHearts: CONFIG.hearts,
      atk: CONFIG.atk, critChance: CONFIG.critChance, critDmg: CONFIG.critDmg,
      handBase: CONFIG.handBase,
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
}

function makeEnemy(def, idx) {
  const base = MONSTERS[def.monster];
  const e = {
    idx, id: def.monster, name: base.name, look: base.look, trait: def.trait || null,
    barDefs: deepClone(def.bars), bar: 0, barsTotal: def.bars.length,
    hp: 0, maxHp: 0, shield: [0, 0, 0], shieldMax: [0, 0, 0], broken: false,
    countdown: def.countdown, cdMax: def.countdown, attackHearts: def.hearts, alive: true,
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
  };
  b.deck.draw = shuffle(deepClone(run.deckCards), b);
  if (b.enemies.some(e => e.trait === 'resist')) {
    b.resistSeq = shuffle([0, 1, 2, 3, 4, 5], b);
    b.resist = { now: -1, next: -1 };
  }
  startTurn(b);
  return b;
}

function drawOne(b) {
  const d = b.deck;
  if (!d.draw.length) {
    if (!d.discard.length) return null;
    d.draw = shuffle(d.discard.splice(0), b);
  }
  const c = d.draw.pop();
  d.hand.push(c);
  return c;
}

// 回合开始：先摸 2 张（手里到 N+1 张就不再摸），不足 N 张补到 N 张。
export function startTurn(b) {
  b.turn++;
  if (b.resistSeq) {
    b.resist.now = b.resistSeq[(b.turn - 1) % 6];
    b.resist.next = b.resistSeq[b.turn % 6];
  }
  const N = b.player.handBase, cap = N + CONFIG.handCapExtra;
  const got = [];
  for (let k = 0; k < CONFIG.drawPerTurn && b.deck.hand.length < cap; k++) { const c = drawOne(b); if (!c) break; got.push(c.uid); }
  while (b.deck.hand.length < N) { const c = drawOne(b); if (!c) break; got.push(c.uid); }
  b.lastDrawn = got;
  if (!b.enemies[b.target]?.alive) retarget(b);
  return got;
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
  if (!c) return false;
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

export function enemyView(e) {
  return {
    idx: e.idx, bar: e.bar, barsTotal: e.barsTotal, hp: e.hp, maxHp: e.maxHp,
    shield: [...e.shield], shieldMax: [...e.shieldMax], broken: e.broken,
    countdown: e.countdown, cdMax: e.cdMax, alive: e.alive,
  };
}

// 这场仗赢了：心和宝石等级带回一趟的存档，进入下一战。
export function commitVictory(run, b) {
  run.player = deepClone(b.player);
  run.battleIndex++;
}
