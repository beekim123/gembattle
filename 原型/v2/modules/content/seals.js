// 10 个秘宝印记：5 条构筑路子，每条 2 个。
export const LINES = {
  shield: { id: 'shield', name: '破盾路子' },
  white: { id: 'white', name: '合白路子' },
  rainbow: { id: 'rainbow', name: '彩虹路子' },
  hold: { id: 'hold', name: '留牌路子' },
  chain: { id: 'chain', name: '长链路子' },
};
export const LINE_IDS = Object.keys(LINES);

export const SEALS = {
  shatter_tide: { id: 'shatter_tide', line: 'shield', name: '碎甲白潮', text: '本回合破过盾：链尾按最终倍率，对全体追加一轮白色伤害。' },
  desperate: { id: 'desperate', line: 'shield', name: '孤注破防', text: '破盾易伤由 ×1.5 提到 ×2.25，但破盾不再推迟敌方倒计时。' },
  double_white: { id: 'double_white', line: 'white', name: '双重合白', text: '每次触发合白，额外的白色全体伤害再多打一轮。' },
  white_echo: { id: 'white_echo', line: 'white', name: '白潮余韵', text: '本链触发合白后，下回合起手多摸 1 张牌（上限临时 +1）。' },
  rainbow_bridge: { id: 'rainbow_bridge', line: 'rainbow', name: '五彩虹桥', text: '集齐 5 色就能触发彩虹（原本要 6 色）。' },
  ring_keep: { id: 'ring_keep', line: 'rainbow', name: '彩环常驻', text: '开战随机点亮 3 色；触发彩虹后保留当前色与相邻色（共 3 色）。' },
  wide_bag: { id: 'wide_bag', line: 'hold', name: '宽裕行囊', text: '回合开始手牌上限再 +1（N + 2）。' },
  hold_edge: { id: 'hold_edge', line: 'hold', name: '蓄锋待发', text: '回合结束时手里还留着牌，下回合施法链直接从 ×2 起步。' },
  leap: { id: 'leap', line: 'chain', name: '越隙相连', text: '每条链第 1 次断色也照常 ×2，而且不清空已集颜色。' },
  chain_surge: { id: 'chain_surge', line: 'chain', name: '连珠迭浪', text: '施法链每多接 1 张牌（第 1 张不算），本回合所有宝石每发伤害额外 +15%。' },
};
export const SEAL_IDS = Object.keys(SEALS);
export const sealsOfLine = line => SEAL_IDS.filter(id => SEALS[id].line === line);
