// 色环与七种颜色的静态定义（设计稿 5.2）。
// 只放数据结构和查表，不写接链倍率、算伤害等玩法逻辑。

/** 三原色宝石（也是盾的三种颜色） */
export const PRIMARY_GEMS = Object.freeze(['red', 'green', 'blue']);

/** 色环上的 6 种颜色，按顺时针排列：红 → 黄 → 绿 → 青 → 蓝 → 紫 → 红 */
export const COLOR_RING = Object.freeze(['red', 'yellow', 'green', 'cyan', 'blue', 'purple']);

/** 七种带色：6 种色环色 + 圆心白 */
export const SEVEN_COLORS = Object.freeze([...COLOR_RING, 'white']);

/** 所有牌面颜色标记：七色 + 跟着变 + 无色 */
export const CARD_COLORS = Object.freeze([...SEVEN_COLORS, 'adaptive', 'colorless']);

/** 固定宝石牌组总张数（设计稿 5.2：红绿蓝各 5、黄青紫各 4、白 2） */
export const BASE_GEM_DECK_TOTAL = 29;

/** 手牌相对于当前链尾色的接链关系标识（只定名字，不算规则） */
export const CHAIN_RELATIONS = Object.freeze({
  START: 'start',
  CONNECT: 'connect',
  COMPLEMENT: 'complement',
  BREAK: 'break',
  INSTANT: 'instant',
  HIDDEN: 'hidden',
});

export const CHAIN_RELATION_LIST = Object.freeze(Object.values(CHAIN_RELATIONS));

export const CHAIN_RELATION_LABELS = Object.freeze({
  [CHAIN_RELATIONS.START]: '起色',
  [CHAIN_RELATIONS.CONNECT]: '可接上',
  [CHAIN_RELATIONS.COMPLEMENT]: '可合白',
  [CHAIN_RELATIONS.BREAK]: '会断色',
  [CHAIN_RELATIONS.INSTANT]: '马上用',
  [CHAIN_RELATIONS.HIDDEN]: '已遮住',
});

/**
 * 每种颜色的静态元数据。
 * - gems：这张颜色带的红绿蓝宝石组成（牌面直接画对应原色点）
 * - opposite：色环正对面补色（仅 6 色环有）
 * - neighbors：色环相邻两色（仅 6 色环有）
 * - baseDeckCount：固定 29 张宝石牌里的张数
 * - swatch：原型阶段色块参考色值
 */
export const COLOR_META = Object.freeze({
  red: Object.freeze({
    id: 'red',
    label: '红',
    ringIndex: 0,
    isCenter: false,
    gems: Object.freeze(['red']),
    gemCount: 1,
    opposite: 'cyan',
    neighbors: Object.freeze(['purple', 'yellow']),
    baseDeckCount: 5,
    swatch: '#e05252',
  }),
  yellow: Object.freeze({
    id: 'yellow',
    label: '黄',
    ringIndex: 1,
    isCenter: false,
    gems: Object.freeze(['red', 'green']),
    gemCount: 2,
    opposite: 'blue',
    neighbors: Object.freeze(['red', 'green']),
    baseDeckCount: 4,
    swatch: '#e6c347',
  }),
  green: Object.freeze({
    id: 'green',
    label: '绿',
    ringIndex: 2,
    isCenter: false,
    gems: Object.freeze(['green']),
    gemCount: 1,
    opposite: 'purple',
    neighbors: Object.freeze(['yellow', 'cyan']),
    baseDeckCount: 5,
    swatch: '#46b868',
  }),
  cyan: Object.freeze({
    id: 'cyan',
    label: '青',
    ringIndex: 3,
    isCenter: false,
    gems: Object.freeze(['green', 'blue']),
    gemCount: 2,
    opposite: 'red',
    neighbors: Object.freeze(['green', 'blue']),
    baseDeckCount: 4,
    swatch: '#3ec2c8',
  }),
  blue: Object.freeze({
    id: 'blue',
    label: '蓝',
    ringIndex: 4,
    isCenter: false,
    gems: Object.freeze(['blue']),
    gemCount: 1,
    opposite: 'yellow',
    neighbors: Object.freeze(['cyan', 'purple']),
    baseDeckCount: 5,
    swatch: '#4a88e8',
  }),
  purple: Object.freeze({
    id: 'purple',
    label: '紫',
    ringIndex: 5,
    isCenter: false,
    gems: Object.freeze(['red', 'blue']),
    gemCount: 2,
    opposite: 'green',
    neighbors: Object.freeze(['blue', 'red']),
    baseDeckCount: 4,
    swatch: '#a662df',
  }),
  white: Object.freeze({
    id: 'white',
    label: '白',
    ringIndex: null,
    isCenter: true,
    gems: Object.freeze(['red', 'green', 'blue']),
    gemCount: 3,
    opposite: null,
    neighbors: Object.freeze([]),
    baseDeckCount: 2,
    swatch: '#eef2f7',
  }),
  adaptive: Object.freeze({
    id: 'adaptive',
    label: '变色',
    ringIndex: null,
    isCenter: false,
    gems: Object.freeze([]),
    gemCount: 0,
    opposite: null,
    neighbors: Object.freeze([]),
    baseDeckCount: 0,
    swatch: '#c299d8',
  }),
  colorless: Object.freeze({
    id: 'colorless',
    label: '无色',
    ringIndex: null,
    isCenter: false,
    gems: Object.freeze([]),
    gemCount: 0,
    opposite: null,
    neighbors: Object.freeze([]),
    baseDeckCount: 0,
    swatch: '#8a93a4',
  }),
});

export function isPrimaryGem(color) {
  return PRIMARY_GEMS.includes(color);
}

export function isRingColor(color) {
  return COLOR_RING.includes(color);
}

export function isSevenColor(color) {
  return SEVEN_COLORS.includes(color);
}

export function isCardColor(color) {
  return CARD_COLORS.includes(color);
}

export function getColorMeta(color) {
  return COLOR_META[color] || null;
}
