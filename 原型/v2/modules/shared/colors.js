// 色环常量与颜色关系（用户原型的核心规则，保持原样）。
// 色环顺序：红 → 黄 → 绿 → 青 → 蓝 → 紫 → 红；白在圆心（编号 6）。
export const WHEEL = ['红', '黄', '绿', '青', '蓝', '紫'];
export const WHITE = 6;
export const COLOR_NAMES = [...WHEEL, '白'];
// 宝石三原色（牌面上的小圆点）：编号 0 红、1 绿、2 蓝
export const CHANNELS = ['红', '绿', '蓝'];
export const CHANNEL_ART = ['red', 'green', 'blue'];
// 每种牌色包含的宝石：[红, 绿, 蓝]
export const CARD_MASKS = [
  [1, 0, 0], // 红
  [1, 1, 0], // 黄 = 红 + 绿
  [0, 1, 0], // 绿
  [0, 1, 1], // 青 = 绿 + 蓝
  [0, 0, 1], // 蓝
  [1, 0, 1], // 紫 = 红 + 蓝
  [1, 1, 1], // 白 = 红 + 绿 + 蓝
];
// 29 张固定牌组：红黄绿青蓝紫白 各几张
export const DECK_COUNTS = [5, 4, 5, 4, 5, 4, 2];
export const ALL_RING = 0b111111;

// 本张牌与「链尾色」的关系
export const REL = Object.freeze({
  START: 'start', // 起色：前面没有色
  NEAR: 'near',   // 同色 / 邻色：接上，倍率 ×2
  COMP: 'comp',   // 补色：合白，倍率 ×2，全体再打一轮白色伤害
  BREAK: 'break', // 断色：不翻倍（倍率不掉），清空集色
  WILD: 'wild',   // 白牌百搭：倍率 ×2
});

export function relationOf(col, cursor) {
  if (cursor < 0) return REL.START;
  if (cursor === WHITE || col === WHITE) return REL.WILD;
  const d = Math.abs(cursor - col);
  const ring = Math.min(d, 6 - d);
  if (ring <= 1) return REL.NEAR;
  if (ring === 2) return REL.BREAK;
  return REL.COMP;
}

export const REL_TEXT = {
  start: '起色', near: '接上', comp: '合白', break: '断色', wild: '百搭',
};

export const maskOf = col => CARD_MASKS[col];
export const ringBit = col => (col >= 0 && col < 6 ? 1 << col : 0);
export const countBits = m => { let n = 0; for (let i = 0; i < 6; i++) n += (m >> i) & 1; return n; };
