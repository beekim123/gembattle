// 3~4 个小事件（设计稿 7.1：二选一，有得有失；扣心最多扣到剩半颗）。
// 只写功能，样子和说法以后跟用户定。候选见 给用户挑-阶段2到4.md E3。
// effects 的 kind 由 run-rules 认：lose_hearts / gain_hearts / pay_gold / gain_gold / reward /
// add_junk / enhance_random_gem / remove_random_function / add_random_function。

export const EVENT_DEFS = Object.freeze({
  ev_heart_for_buff: Object.freeze({
    id: 'ev_heart_for_buff',
    label: '掉半颗心，换一次加成三选一',
    options: [
      { label: '掉 ½ 心，挑一个加成', effects: [{ kind: 'lose_hearts', value: 0.5 }, { kind: 'reward', reward: 'buff' }] },
      { label: '走开', effects: [] },
    ],
  }),
  ev_enhance_for_junk: Object.freeze({
    id: 'ev_enhance_for_junk',
    label: '随机强化一张宝石牌，但牌组里塞进一张没用的牌',
    options: [
      { label: '强化，收下没用的牌', effects: [{ kind: 'enhance_random_gem' }, { kind: 'add_junk' }] },
      { label: '走开', effects: [] },
    ],
  }),
  ev_gold_for_heart: Object.freeze({
    id: 'ev_gold_for_heart',
    label: '花 30 金币，回 1 颗心',
    options: [
      { label: '花 30 金币回 1 心', effects: [{ kind: 'pay_gold', value: 30 }, { kind: 'gain_hearts', value: 1 }] },
      { label: '走开', effects: [] },
    ],
  }),
  ev_card_trade: Object.freeze({
    id: 'ev_card_trade',
    label: '删一张功能牌换金币，或者拿一张功能牌',
    options: [
      { label: '随机删一张功能牌，+25 金币', effects: [{ kind: 'remove_random_function' }, { kind: 'gain_gold', value: 25 }] },
      { label: '拿一张随机功能牌', effects: [{ kind: 'add_random_function' }] },
    ],
  }),
});

export const EVENT_LIST = Object.freeze(Object.values(EVENT_DEFS));
