import { createRun, createBattle } from '../index.js';
import { COLOR_NAMES } from '../../shared/index.js';

export const C = n => COLOR_NAMES.indexOf(n);
let uid = 1000;
export const card = name => ({ uid: 'x' + uid++, color: C(name) });
export const cards = names => names.map(card);

// 造一场自定义的仗。暴击默认关掉，让数可以精确算。
export function make(enemyDefs, { crit = 0, seed = 7, hand = null, handBase = 3 } = {}) {
  const run = createRun(seed);
  run.player.critChance = crit;
  run.player.handBase = handBase;
  const def = { id: 't', title: '测试', biome: 'forest', lesson: '', enemies: enemyDefs };
  const b = createBattle(run, def, seed);
  if (hand) { b.deck.discard.push(...b.deck.hand.splice(0), ...b.deck.chain.splice(0)); b.deck.hand.push(...cards(hand)); }
  return b;
}
export const slime = (hp = 1e6, extra = {}) => ({ monster: 'slime_jelly', bars: [{ hp, shield: null }], countdown: 4, hearts: 0.5, ...extra });

// 把这些牌按顺序放进链里（直接塞，绕过手牌）
export function chain(b, names) { b.deck.chain.push(...cards(names)); return b; }
