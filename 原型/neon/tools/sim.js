// 阶段 1 假玩家模拟器（设计稿 10.4）：
// 纯 Node 运行，只依赖 shared / content / battle-rules，不碰画面。
// 用法：node tools/sim.js [--runs 200]

import { createBattle } from '../modules/battle-rules/index.js';
import {
  ALLY_LIST,
  BUFF_LIST,
  DECK_LOADOUTS,
  FUNCTION_CARD_LIST,
  CORE_ENCOUNTERS,
  createBattlePacket,
} from '../modules/content/index.js';

const args = process.argv.slice(2);
const runsIdx = args.indexOf('--runs');
const RUNS = runsIdx >= 0 ? Math.max(20, Number(args[runsIdx + 1]) || 200) : 200;

/** 4 种假玩家策略 */
const BOTS = [
  {
    id: 'longest',
    label: '全打·最长链',
    playTurn(battle) {
      playUsefulInstants(battle);
      battle.autoArrange('longest');
      return battle.commitChain();
    },
  },
  {
    id: 'break_first',
    label: '先破盾再打',
    playTurn(battle) {
      playUsefulInstants(battle);
      battle.autoArrange('break_first');
      return battle.commitChain();
    },
  },
  {
    id: 'rainbow',
    label: '优先追彩虹',
    playTurn(battle) {
      playUsefulInstants(battle);
      battle.autoArrange('rainbow');
      return battle.commitChain();
    },
  },
  {
    id: 'keep_one',
    label: '尝试留 1 张桥牌',
    playTurn(battle) {
      playUsefulInstants(battle);
      battle.autoArrange('longest');
      // 留牌策略：手里有 >= 4 张且当前链没触发彩虹时，尝试撤回最后一张留到下回合
      const prev = battle.getPreview();
      if (prev.chainLength >= 4 && !prev.willTriggerRainbow) {
        battle.undoLast();
      }
      return battle.commitChain();
    },
  },
];

function playUsefulInstants(battle) {
  let guard = 0;
  while (guard++ < 12) {
    const snap = battle.getSnapshot();
    const inst = snap.hand.find((c) => !c.hidden && c.usage === 'instant' && c.kind === 'function');
    if (!inst) break;
    battle.playInstantCard(inst.uid);
  }
}

function runBatch({ encounterId, bot, extraCards = [], runs = RUNS, rulesConfig = {}, presetId = null, buffs = [], allies = [] }) {
  let wins = 0;
  let totalTurns = 0;
  let totalHeartsLost = 0;
  let totalShieldBreaks = 0;
  let totalRainbows = 0;
  let totalDamage = 0;

  for (let i = 0; i < runs; i++) {
    const packet = createBattlePacket({
      encounterId,
      presetId,
      extraCards,
      seed: `sim-${encounterId}-${bot.id}-${i}`,
      rulesConfig,
      buffs,
      allies,
    });
    const battle = createBattle(packet);
    let safety = 0;
    while (!battle.getResult() && safety++ < 60) {
      bot.playTurn(battle);
    }
    const res = battle.getResult();
    if (!res) continue;
    if (res.outcome === 'win') wins++;
    totalTurns += res.stats.turns;
    totalHeartsLost += res.stats.heartsLost;
    totalShieldBreaks += res.stats.shieldBreaks;
    totalRainbows += res.stats.rainbowCount;
    totalDamage += res.stats.totalDamage;
  }

  return {
    winRate: ((wins / runs) * 100).toFixed(1) + '%',
    avgTurns: (totalTurns / runs).toFixed(2),
    avgHeartsLost: (totalHeartsLost / runs).toFixed(2),
    avgShieldBreaks: (totalShieldBreaks / runs).toFixed(2),
    avgRainbows: (totalRainbows / runs).toFixed(2),
    avgTurnDmg: Math.round(totalDamage / Math.max(1, totalTurns)),
  };
}

console.log(`=== code00 阶段 1 假玩家模拟器（每组 ${RUNS} 仗） ===\n`);

// 1. 4 种假玩家 × 5 种核心仗（带 4 张常用功能牌）
console.log('【一】5 种核心仗 × 4 种假玩家（29 宝石 + 4 张常用功能牌）');
for (const enc of CORE_ENCOUNTERS) {
  console.log(`\n▶ ${enc.label}（${enc.id}，推荐档位：${enc.recommendedPreset}）`);
  for (const bot of BOTS) {
    const r = runBatch({
      encounterId: enc.id,
      bot,
      extraCards: DECK_LOADOUTS.starter_4_functions.extraCards,
    });
    console.log(
      `  ${bot.label.padEnd(10, '　')} | 胜率 ${r.winRate.padStart(6)} | 均回合 ${r.avgTurns.padStart(5)} | 均掉心 ${r.avgHeartsLost.padStart(4)} | 破盾 ${r.avgShieldBreaks.padStart(4)} | 彩虹 ${r.avgRainbows.padStart(4)} | 均回伤 ${r.avgTurnDmg}`,
    );
  }
}

// 2. 对照组 1：纯 29 张宝石 vs 分别塞入 3 张每种功能牌（检查有没有陷阱功能牌）
console.log('\n\n【二】功能牌对照（双色盾普通怪 + 全打最长链：纯 29 宝石 vs 每种塞 3 张）');
const baseDual = runBatch({ encounterId: 'dual_shield', bot: BOTS[0], extraCards: [] });
console.log(`  纯 29 张宝石基准     | 胜率 ${baseDual.winRate} | 均回合 ${baseDual.avgTurns} | 均掉心 ${baseDual.avgHeartsLost}`);
for (const fn of FUNCTION_CARD_LIST) {
  const r = runBatch({
    encounterId: 'dual_shield',
    bot: BOTS[0],
    extraCards: [fn.defId, fn.defId, fn.defId],
  });
  const turnDiff = (Number(r.avgTurns) - Number(baseDual.avgTurns)).toFixed(2);
  const flag = Number(r.avgTurns) > Number(baseDual.avgTurns) + 0.15 ? '  [需留意]' : '';
  console.log(
    `  +3 ${fn.label.padEnd(10, '　')} | 胜率 ${r.winRate} | 均回合 ${r.avgTurns} (${Number(turnDiff) >= 0 ? '+' : ''}${turnDiff}) | 均掉心 ${r.avgHeartsLost}${flag}`,
  );
}

// 3. 对照组 2：按破盾排 vs 按最长的链排（看门的 & 双色盾）
console.log('\n\n【三】排法分量对照（按破盾排 vs 按最长的链排，纯 29 宝石）');
for (const encId of ['dual_shield', 'gatekeeper_layer2']) {
  const longest = runBatch({ encounterId: encId, bot: BOTS[0], extraCards: [] });
  const brk = runBatch({ encounterId: encId, bot: BOTS[1], extraCards: [] });
  const heartDiff = (Number(longest.avgHeartsLost) - Number(brk.avgHeartsLost)).toFixed(2);
  const turnDiff = (Number(longest.avgTurns) - Number(brk.avgTurns)).toFixed(2);
  console.log(
    `  ${encId.padEnd(18)} | 最长链: ${longest.avgTurns}回 / 掉${longest.avgHeartsLost}心 | 先破盾: ${brk.avgTurns}回 / 掉${brk.avgHeartsLost}心 | 差值: 快${turnDiff}回, 少掉${heartDiff}心`,
  );
}

// 4. 压测：大发数链（20 / 300 / 2000 / 10000+ 发）耗时与打包事件数量
console.log('\n\n【四】大发数压测（验证打包机制性能与事件量）');
for (const chainLen of [3, 6, 9, 12]) {
  const stressDeck = Array.from({ length: 14 }, (_, i) => ({
    uid: `stress-${i}`,
    defId: i % 3 === 0 ? 'gem_white' : 'gem_yellow',
    kind: 'gem',
    usage: 'chain',
    color: i % 3 === 0 ? 'white' : 'yellow',
    gems: i % 3 === 0 ? ['red', 'green', 'blue'] : ['red', 'green'],
    enhanced: false,
    drawAfterPlay: 0,
    label: i % 3 === 0 ? '白宝石' : '黄宝石',
    effects: [],
  }));
  const p = createBattlePacket({ encounterId: 'dual_shield', seed: `stress-${chainLen}`, drawTarget: 12 });
  p.player.deck = stressDeck;
  p.monsters[0].bars[0].maxHp = 999999999;
  const b = createBattle(p);
  const hand = b.getSnapshot().hand.slice(0, chainLen);
  for (const c of hand) b.queueCard(c.uid);
  const t0 = performance.now();
  const out = b.commitChain();
  const ms = (performance.now() - t0).toFixed(2);
  const sum = out.events.find((e) => e.type === 'chain_summary');
  const pktCount = out.events.filter((e) => e.type === 'damage_packet').length;
  console.log(
    `  排链 ${String(chainLen).padStart(2)} 张 | 总发数 ${String(sum.payload.totalHits).padStart(6)} 发 | 总伤害 ${String(sum.payload.totalDamage).padStart(10)} | 打包事件 ${String(pktCount).padStart(3)} 包 | 耗时 ${ms}ms`,
  );
}

// 5. 加成、队友对照（阶段 1 后半段，claude 的倾向，用户没拍板）：每样单带一个，跟什么都不带比
console.log('\n\n【五】加成、队友单带对照（29 宝石 + 4 张常用功能牌，全打·最长链）');
const extras = [
  { label: '什么都不带', buffs: [], allies: [] },
  ...BUFF_LIST.map((b) => ({ label: `加成：${b.label}`, buffs: [b.id], allies: [] })),
  ...ALLY_LIST.map((a) => ({ label: `队友：${a.label}`, buffs: [], allies: [a.id] })),
  { label: '全带', buffs: BUFF_LIST.map((b) => b.id), allies: ALLY_LIST.map((a) => a.id) },
];
for (const enc of CORE_ENCOUNTERS) {
  console.log(`\n▶ ${enc.label}（${enc.id}）`);
  for (const ex of extras) {
    const r = runBatch({ encounterId: enc.id, bot: BOTS[0], extraCards: DECK_LOADOUTS.starter_4_functions.extraCards, buffs: ex.buffs, allies: ex.allies });
    console.log(`  ${ex.label.padEnd(14, '　')} | 胜率 ${r.winRate.padStart(6)} | 均回合 ${r.avgTurns.padStart(5)} | 均掉心 ${r.avgHeartsLost.padStart(4)} | 均回伤 ${r.avgTurnDmg}`);
  }
}

// 【六】第 3 轮第 3 块（设计稿 10.4 新合格线）：每个加成照它自己路子的排法、打它路子顺手的怪（设计稿 6.1），跟同一种排法、同一种怪什么都不带比
// 排法：破盾 → 先破盾；彩虹 → 追彩虹；留牌 → 留 1 张；别的 → 最长链。目标：每回合伤害 +8%~+32%
const LANE_BOT = { break: 'break_first', rainbow: 'rainbow', keep: 'keep_one' };
const LANE_FOES = {
  break: ['dual_shield'],
  white: ['pack_mixed', 'dual_shield', 'recorded_damage_down'],
  rainbow: ['pack_mixed', 'gatekeeper_layer2'],
  keep: ['gatekeeper_layer2'],
  chain: CORE_ENCOUNTERS.map((e) => e.id), // 长链顺手的（遮手牌、挑色减半）原型没放进核心仗，五种都算
};
const botFor = (b) => BOTS.find((x) => x.id === (LANE_BOT[b.lane] || 'longest'));
console.log('\n\n【六】加成照自己路子的排法、打自己路子顺手的怪（29 宝石 + 4 张常用功能牌），跟同样打法什么都不带比；目标每回合伤害 +8%~+32%');
{
  const base = {};
  const batch = (enc, bot, buffs) => runBatch({ encounterId: enc, bot, extraCards: DECK_LOADOUTS.starter_4_functions.extraCards, buffs, allies: [] });
  for (const b of BUFF_LIST) {
    const bot = botFor(b);
    const foes = LANE_FOES[b.lane] || LANE_FOES.chain;
    const ups = foes.map((enc) => {
      const k = `${enc}|${bot.id}`;
      base[k] ||= batch(enc, bot, []);
      return batch(enc, bot, [b.id]).avgTurnDmg / base[k].avgTurnDmg - 1;
    });
    const up = Math.round((ups.reduce((x, y) => x + y, 0) / ups.length) * 100);
    const ok = up >= 8 && up <= 32 ? '到了' : up < 8 ? '偏弱' : '偏强';
    console.log(`  ${b.label.padEnd(16, '　')} | ${bot.label.padEnd(7, '　')} | 打 ${foes.length === CORE_ENCOUNTERS.length ? '五种都算' : foes.join('、')} | 每回合伤害 ${up >= 0 ? '+' : ''}${up}% | ${ok}`);
  }
}
