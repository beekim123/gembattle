import { DECK_COUNTS } from '../shared/index.js';

// 固定 29 张宝石牌：一趟内不加不删。uid 在一趟内唯一。
export function makeDeck() {
  const cards = [];
  DECK_COUNTS.forEach((n, color) => {
    for (let i = 0; i < n; i++) cards.push({ uid: 'c' + cards.length, color });
  });
  return cards;
}
