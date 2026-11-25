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
  // ---- 第 2 步：一趟里的成长 ----
  handMax: 12,        // 涌泉抽牌等可以突破回合上限，手里最多 12 张
  handBaseMax: 5,     // 手牌扩容最多到 N = 5（3 → 4 → 5）
  desperateMult: 2.25, // 孤注破防：破盾易伤 ×2.25
  surgeBonus: 0.5,    // 魔力沸腾：每发 +50%
  sharpBonus: 0.5,    // 锐切：该牌每发 +50%
  chainSurgeBonus: 0.15, // 连珠迭浪：每多接 1 张 +15%
  gibbonMult: 0.5,    // 摇果长臂猿：集色不到 4 色时受伤减半
  gibbonNeed: 4,
});
