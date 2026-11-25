// 怪的底子：名字、画面编号（look 与工坊模型 id 一致，第 3 步换 3D 像素模型靠它）。
// 血、盾、倒计时随场次不同，写在 battles.js（第 1 步）和 encounters.js（第 2 步）。
export const MONSTERS = {
  slime_jelly: { name: '水滴软泥', look: 'slime_jelly' },
  earth2_barometz: { name: '草茎绵羊', look: 'earth2_barometz' },
  goblin_scout: { name: '拾荒地精', look: 'goblin_scout' },
  fairy_meadow: { name: '花甸灵精', look: 'fairy_meadow' },
  earth3_zheng: { name: '五尾赤豹', look: 'earth3_zheng' },
  earth6_long_arm: { name: '摇果长臂猿', look: 'earth6_long_arm' },
  earth1_belly_maw: { name: '腹口懒兽', look: 'earth1_belly_maw' },
  tree3_leshy: { name: '千丈古树精', look: 'tree3_leshy' },
};
export const HERO_LOOK = 'npc_mage';

// 特性说明（悬停详情用）
export const TRAITS = {
  resist: '每回合抵制一种颜色：该色的牌伤减半、不削盾',
  gibbon: '集色没满 4 色时，受到的伤害减半：先铺集色',
  junk: '出手时往你的弃牌堆塞 1 张缠藤废牌',
  canopy: '第 2 条血起，每回合遮住你 1 张手牌的颜色（只标「已遮蔽」）',
};
