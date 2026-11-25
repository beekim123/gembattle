import { createRun, createBattle } from '../index.js';
import { COLOR_NAMES } from '../../shared/index.js';
import { makeArcanaCard, makeJunkCard } from '../../content/index.js';

export const C = n => COLOR_NAMES.indexOf(n);
let uid = 1000;
// 名字（'红'）造宝石牌；对象原样放行（秘术牌、带雕琢的牌）
export const card = x => (typeof x === 'string' ? { uid: 'x' + uid++, color: C(x) } : x);
export const cards = names => names.map(card);
export const A = id => makeArcanaCard(id, 'a' + uid++);
export const J = () => makeJunkCard('j' + uid++);
export const carved = (name, ...kinds) => ({ uid: 'x' + uid++, color: C(name), carve: kinds });

// 造一场自定义的仗。暴击默认关掉，让数可以精确算。
export function make(enemyDefs, { crit = 0, seed = 7, hand = null, handBase = 3, seals = [], deckExtra = [] } = {}) {
  const run = createRun(seed);
  run.player.critChance = crit;
  run.player.handBase = handBase;
  run.player.seals = [...seals];
  run.deckCards.push(...deckExtra);
  const def = { id: 't', title: '测试', biome: 'forest', lesson: '', enemies: enemyDefs };
  const b = createBattle(run, def, seed);
  if (hand) { b.deck.discard.push(...b.deck.hand.splice(0), ...b.deck.chain.splice(0)); b.deck.hand.push(...cards(hand)); }
  return b;
}
export const slime = (hp = 1e6, extra = {}) => ({ monster: 'slime_jelly', bars: [{ hp, shield: null }], countdown: 4, hearts: 0.5, ...extra });
export const shielded = (hp, shield, extra = {}) => ({ monster: 'goblin_scout', bars: [{ hp, shield }], countdown: 4, hearts: 1, ...extra });

// 把这些牌按顺序放进链里（直接塞，绕过手牌）
export function chain(b, names) { b.deck.chain.push(...cards(names)); return b; }
