// 数值都集中在这里。原型阶段不调平衡，只是别散在代码里。
export const CONFIG = Object.freeze({
  hearts: 3,
  atk: 35,
  critChance: 0.1,
  critDmg: 1.5,
  handBase: 3,        // 起始手牌 N
  drawPerTurn: 2,     // 每回合先摸几张
  handCapExtra: 1,    // 回合开始手牌上限 = N + 1
  joinMult: 2,        // 接上 / 合白 / 百搭 的倍率
  rainbowReplays: 2,  // 彩虹：再重放两遍（总计 ×3）
  gemExpPerLevel: 10,
  gemLevelBonus: 0.1, // 每级每发 +10%
  shieldMult: 0.75,   // 有盾时受伤
  brokenMult: 1.5,    // 破盾后受伤
  breakPush: 1,       // 破盾推迟倒计时 1 格
  resistMult: 0.5,    // 抵制色：伤减半
});
