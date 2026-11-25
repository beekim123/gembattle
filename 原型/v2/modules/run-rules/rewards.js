// 一趟里的成长：宝石雕琢、手牌扩容、秘术牌、秘宝印记、疗伤、属性提升（纯逻辑）。
import { nextRand, shuffle, CONFIG } from '../shared/index.js';
import {
  CARVES, CARVE_IDS, ARCANA_IDS, SEALS, SEAL_IDS, makeArcanaCard, makeJunkCard, isGem, LOOT,
} from '../content/index.js';

const newUid = (trip, p) => p + (++trip.uidSeq);

// ---------- 宝石雕琢 ----------
export const gemCards = trip => trip.deckCards.filter(isGem);
export function carveOptions(card) { return CARVE_IDS.filter(k => !(card.carve || []).includes(k)); }
export function applyCarve(trip, uid, kind) {
  const card = trip.deckCards.find(c => c.uid === uid);
  if (!card || !isGem(card) || !CARVES[kind] || (card.carve || []).includes(kind)) return false;
  card.carve = [...(card.carve || []), kind];
  trip.stats.carves.push({ color: card.color, kind });
  return true;
}

// ---------- 手牌扩容 / 疗伤 / 属性 ----------
export function expandHand(trip) {
  if (trip.player.handBase >= CONFIG.handBaseMax) return false;
  trip.player.handBase++;
  return true;
}
export function heal(trip, hearts = 1) {
  const p = trip.player, before = p.hearts;
  p.hearts = Math.min(p.maxHearts, p.hearts + hearts);
  return p.hearts - before;
}
export function boostAtk(trip, n = 10) { trip.player.atk += n; return n; }

// ---------- 秘术牌 ----------
export function offerArcana(trip, n = 3) { return shuffle([...ARCANA_IDS], trip).slice(0, n); }
export function addArcana(trip, id) {
  const c = makeArcanaCard(id, newUid(trip, 'a'));
  trip.deckCards.push(c);
  trip.stats.arcana.push(id);
  return c;
}
export function addJunk(trip) { const c = makeJunkCard(newUid(trip, 'j')); trip.deckCards.push(c); return c; }
export const removable = trip => trip.deckCards.filter(c => c.arcana || c.junk);
export function removeCard(trip, uid) {
  const i = trip.deckCards.findIndex(c => c.uid === uid && (c.arcana || c.junk));
  if (i < 0) return false;
  trip.deckCards.splice(i, 1);
  return true;
}

// ---------- 秘宝印记 ----------
// 拿过哪条路子，后续三选一就向那条路子收窄：已拿路子里没拿的那个排在最前，
// 剩下的位置再从别的路子里补（每条路子最多补 1 个，尽量不重复）。
export function offerSeals(trip, n = 3) {
  const owned = new Set(trip.player.seals);
  const ownedLines = new Set([...owned].map(id => SEALS[id].line));
  const pool = SEAL_IDS.filter(id => !owned.has(id));
  const narrow = shuffle(pool.filter(id => ownedLines.has(SEALS[id].line)), trip);
  const others = shuffle(pool.filter(id => !ownedLines.has(SEALS[id].line)), trip);
  const out = narrow.slice(0, n);
  const lines = new Set(out.map(id => SEALS[id].line));
  for (const id of others) {
    if (out.length >= n) break;
    if (!lines.has(SEALS[id].line)) { out.push(id); lines.add(SEALS[id].line); }
  }
  for (const id of others) if (out.length < n && !out.includes(id)) out.push(id);
  return out;
}
export function addSeal(trip, id) {
  if (!SEALS[id] || trip.player.seals.includes(id)) return false;
  trip.player.seals.push(id);
  trip.stats.seals.push(id);
  return true;
}

// ---------- 战斗节点的战利品 ----------
// 立刻生效的（手牌扩容、疗伤、属性提升）直接结算；要挑选的（雕琢、印记、秘术牌）交给界面。
export function lootNeedsChoice(kind) { return kind === 'carve' || kind === 'seal' || kind === 'arcana'; }
export function applyImmediateLoot(trip, kind) {
  if (kind === 'hand') {
    if (expandHand(trip)) return { kind, text: `摸牌基数 N 提到 ${trip.player.handBase}` };
    boostAtk(trip); return { kind: 'attr', text: '手牌已经到 5 张：改成攻击 +10' };
  }
  if (kind === 'heal') { const g = heal(trip, 1); return { kind, text: g > 0 ? `回了 ${g} 颗心` : '心是满的' }; }
  if (kind === 'attr') { boostAtk(trip); return { kind, text: '攻击 +10' }; }
  return null;
}
export const lootName = k => LOOT[k]?.name || k;
