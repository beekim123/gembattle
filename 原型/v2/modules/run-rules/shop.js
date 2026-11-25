// 行商营帐：花本趟打怪掉落的金币。陈列 2 个印记、2 张秘术牌、1 次宝石雕琢、1 瓶回半颗心的红果饮。
import { SHOP_PRICE } from '../content/index.js';
import { offerSeals, offerArcana, addSeal, addArcana, heal } from './rewards.js';

export function shopStock(trip) {
  const items = [];
  for (const id of offerSeals(trip, 2)) items.push({ kind: 'seal', ref: id, price: SHOP_PRICE.seal, sold: false });
  for (const id of offerArcana(trip, 2)) items.push({ kind: 'arcana', ref: id, price: SHOP_PRICE.arcana, sold: false });
  items.push({ kind: 'carve', ref: null, price: SHOP_PRICE.carve, sold: false });
  items.push({ kind: 'drink', ref: null, price: SHOP_PRICE.drink, sold: false });
  return items;
}

export function canBuy(trip, item) { return !item.sold && trip.gold >= item.price; }

// 买东西。宝石雕琢要先让玩家挑牌：这里只检查，真正扣钱在 buyCarve。
export function buy(trip, item) {
  if (!canBuy(trip, item) || item.kind === 'carve') return false;
  trip.gold -= item.price; item.sold = true;
  if (item.kind === 'seal') addSeal(trip, item.ref);
  else if (item.kind === 'arcana') addArcana(trip, item.ref);
  else if (item.kind === 'drink') heal(trip, 0.5);
  trip.stats.bought++;
  return true;
}
export function payCarve(trip, item) {
  if (!canBuy(trip, item) || item.kind !== 'carve') return false;
  trip.gold -= item.price; item.sold = true; trip.stats.bought++;
  return true;
}
