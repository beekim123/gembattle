// 第 1 步：4 场递进教学仗。shield 是 [红, 绿, 蓝] 各几格；hearts 是敌人出手扣几颗心。
export const BATTLES = [
  {
    id: 'b1', title: '第 1 战', biome: 'forest',
    lesson: '起手只有 3 张。先接几张同色、邻色试试倍率；留 2 张不打，下回合就能摸成 4 张。',
    enemies: [
      { monster: 'slime_jelly', bars: [{ hp: 420, shield: null }], countdown: 4, hearts: 0.5 },
    ],
  },
  {
    id: 'b2', title: '第 2 战', biome: 'forest',
    lesson: '两只都要打：先秒掉倒计时短的，还是排一个补色合白，一网打尽？',
    enemies: [
      { monster: 'earth2_barometz', bars: [{ hp: 280, shield: null }], countdown: 4, hearts: 0.5 },
      { monster: 'earth2_barometz', bars: [{ hp: 280, shield: null }], countdown: 5, hearts: 0.5 },
    ],
  },
  {
    id: 'b3', title: '第 3 战', biome: 'forest',
    lesson: '地精有红盾：用红、黄、紫、白牌先破盾，能推迟它的重击，破盾后伤害更高。',
    enemies: [
      { monster: 'goblin_scout', bars: [{ hp: 460, shield: [3, 0, 0] }], countdown: 3, hearts: 1 },
      { monster: 'slime_jelly', bars: [{ hp: 320, shield: null }], countdown: 5, hearts: 0.5 },
    ],
  },
  {
    id: 'b4', title: '第 4 战', biome: 'meadow',
    lesson: '每回合它抵制一种颜色：这个颜色的牌伤害减半，也削不了盾。绕开它排链。',
    enemies: [
      { monster: 'fairy_meadow', trait: 'resist', bars: [{ hp: 620, shield: [0, 0, 3] }], countdown: 4, hearts: 0.5 },
    ],
  },
];
