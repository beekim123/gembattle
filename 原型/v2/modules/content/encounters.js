// 第 2 步：落果密林 8 场遭遇（照方案文档 3.4）。shield 是 [红, 绿, 蓝] 各几格；hearts 是敌人出手扣几颗心。
// 其中没有写死的（长臂猿、赤豹等扣几颗心）见 偏离.md。
export const ENCOUNTERS = {
  e_slime: {
    id: 'e_slime', title: '水滴软泥', biome: 'swamp', kind: 'battle',
    lesson: '入门：先接几张同色、邻色试试倍率；留 2 张不打，下回合就能摸成 4 张。',
    enemies: [{ monster: 'slime_jelly', bars: [{ hp: 420, shield: null }], countdown: 4, hearts: 0.5 }],
  },
  e_sheep: {
    id: 'e_sheep', title: '草茎绵羊', biome: 'forest', kind: 'battle',
    lesson: '两只都要打：先秒掉倒计时短的，还是排一个补色合白，一网打尽？',
    enemies: [
      { monster: 'earth2_barometz', bars: [{ hp: 280, shield: null }], countdown: 4, hearts: 0.5 },
      { monster: 'earth2_barometz', bars: [{ hp: 280, shield: null }], countdown: 5, hearts: 0.5 },
    ],
  },
  e_goblin: {
    id: 'e_goblin', title: '拾荒地精', biome: 'forest', kind: 'battle',
    lesson: '地精有红盾：用红、黄、紫、白牌先破盾，能推迟它的重击，破盾后伤害更高。',
    enemies: [
      { monster: 'goblin_scout', bars: [{ hp: 460, shield: [3, 0, 0] }], countdown: 3, hearts: 1 },
      { monster: 'slime_jelly', bars: [{ hp: 320, shield: null }], countdown: 5, hearts: 0.5 },
    ],
  },
  e_fairy: {
    id: 'e_fairy', title: '花甸灵精', biome: 'meadow', kind: 'battle',
    lesson: '每回合它抵制一种颜色：这个颜色的牌伤害减半，也削不了盾。绕开它排链。',
    enemies: [{ monster: 'fairy_meadow', trait: 'resist', bars: [{ hp: 620, shield: [0, 0, 3] }], countdown: 4, hearts: 0.5 }],
  },
  e_leopard: {
    id: 'e_leopard', title: '五尾赤豹', biome: 'ruins', kind: 'elite',
    lesson: '强敌：两条血，每条都带 4 格绿盾，倒计时只有 3。高压破盾竞速：先用绿、黄、青、白牌破盾。',
    enemies: [{ monster: 'earth3_zheng', bars: [{ hp: 580, shield: [0, 4, 0] }, { hp: 580, shield: [0, 4, 0] }], countdown: 3, hearts: 1 }],
  },
  e_gibbon: {
    id: 'e_gibbon', title: '摇果长臂猿', biome: 'forest', kind: 'battle',
    lesson: '集色没满 4 色时它受伤减半：先铺集色，再打出大数。红绿双盾也要破。',
    enemies: [{ monster: 'earth6_long_arm', trait: 'gibbon', bars: [{ hp: 950, shield: [3, 3, 0] }], countdown: 4, hearts: 1 }],
  },
  e_sloth: {
    id: 'e_sloth', title: '腹口懒兽', biome: 'ruins', kind: 'elite',
    lesson: '强敌：两条血，红蓝双盾。它出手会往你的弃牌堆塞缠藤废牌，要赶在倒计时走完前打倒它。',
    enemies: [{ monster: 'earth1_belly_maw', trait: 'junk', bars: [{ hp: 900, shield: [3, 0, 3] }, { hp: 900, shield: [3, 0, 3] }], countdown: 4, hearts: 1 }],
  },
  e_boss: {
    id: 'e_boss', title: '千丈古树精', biome: 'canopy', kind: 'boss',
    lesson: '林地首领：三条血，每条换一组双色盾。第 2 条血起每回合遮住 1 张手牌的颜色，要算牌、要留牌。第 3 条血倒计时缩到 3，出手扣 1 心。',
    enemies: [{
      monster: 'tree3_leshy', trait: 'canopy', countdown: 4, hearts: 0.5,
      bars: [
        { hp: 1100, shield: [4, 4, 0] },
        { hp: 1100, shield: [0, 4, 4] },
        { hp: 1100, shield: [4, 0, 4], countdown: 3, hearts: 1 },
      ],
    }],
  },
};
export const ENCOUNTER_IDS = Object.keys(ENCOUNTERS);
