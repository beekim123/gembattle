// 宝石雕琢：给 29 张宝石牌里的一张加方向。同一张牌同一种雕琢只能有一次，不同方向可以叠。
export const CARVES = {
  sharp: { id: 'sharp', name: '锐切', text: '这张牌自己打出的每发伤害 +50%。' },
  twin: { id: 'twin', name: '双晶', text: '这张牌额外多算 1 颗宝石打发（多的一颗取牌上第一种宝石）。' },
  pierce: { id: 'pierce', name: '碎甲', text: '这张牌每颗宝石多削 1 格颜色护盾（共 2 格）。' },
  overflow: { id: 'overflow', name: '溢彩', text: '打出时顺带点亮色环相邻 1 色。' },
};
export const CARVE_IDS = Object.keys(CARVES);
