// 核心试玩的假玩家（设计稿 10.4，做法见 设计/做原型的方法.md）：
// 只有宝石牌，照 CORE_TRIAL 连打 10 只怪，心不回。量两个数给用户当参考（好不好玩还是用户打了算）：
//   一、乱打和想清楚了打差多少（能不能打完 10 只）；
//   二、是不是永远排最长链就对（把所有排法都试一遍，比排最长链好多少）。
// 用法：node tools/core-sim.js [--runs 200]

import { createBattle } from '../modules/battle-rules/index.js';
import { CORE_TRIAL, ENCOUNTERS, createCoreTrialPacket } from '../modules/content/index.js';

const args = process.argv.slice(2);
const runsIdx = args.indexOf('--runs');
const RUNS = runsIdx >= 0 ? Math.max(20, Number(args[runsIdx + 1]) || 200) : 200;
// 调难度用：--scales 0.7,1,1,... 临时换掉每只怪的血量倍数（不改 content）
const scalesIdx = args.indexOf('--scales');
const SCALES = scalesIdx >= 0 ? args[scalesIdx + 1].split(',').map(Number) : null;

let seed = 1;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const gems = (b) => b.getSnapshot().hand.filter((c) => !c.hidden && c.usage === 'chain');
const dmgOf = (p) => Object.values(p.byMonster || {}).reduce((s, m) => s + (m.damage || 0), 0);
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function* perms(arr, k) {
  if (k === 0) { yield []; return; }
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of perms(rest, k - 1)) yield [arr[i], ...p];
  }
}

// 「想清楚了打」顺手记：这回合排最长链比最好的排法差多少
const gap = { turns: 0, longestWorse5: 0, longestWorse15: 0 };

const BOTS = [
  { id: 'random', label: '乱打（全打，乱排）', play: (b) => { for (const c of shuffle(gems(b))) b.queueCard(c.uid); } },
  { id: 'longest', label: '排最长链', play: (b) => { b.autoArrange('longest'); } },
  {
    id: 'best',
    label: '想清楚了打（所有排法试一遍）',
    play: (b) => {
      b.clearChain();
      const hand = gems(b);
      b.autoArrange('longest');
      const longestD = dmgOf(b.getPreview());
      let best = null;
      let bestD = -1;
      for (let k = 1; k <= hand.length; k++) {
        for (const p of perms(hand, k)) {
          b.clearChain();
          for (const c of p) b.queueCard(c.uid);
          const d = dmgOf(b.getPreview());
          if (d > bestD) { bestD = d; best = p; }
        }
      }
      if (!best) { b.clearChain(); return; }
      gap.turns++;
      if (bestD > longestD * 1.05) gap.longestWorse5++;
      if (bestD > longestD * 1.15) gap.longestWorse15++;
      b.clearChain();
      for (const c of best) b.queueCard(c.uid);
    },
  },
];

function runTrial(bot, i) {
  seed = i * 7919 + 13;
  let hearts = CORE_TRIAL.hearts;
  const perFight = [];
  for (let idx = 0; idx < CORE_TRIAL.fights.length; idx++) {
    const packet = createCoreTrialPacket({ index: idx, hearts, seed: `core-sim-${bot.id}-${i}` });
    if (SCALES?.[idx]) {
      const k = SCALES[idx] / CORE_TRIAL.fights[idx].hpScale;
      for (const m of packet.monsters) for (const bar of m.bars) bar.maxHp = Math.round(bar.maxHp * k);
    }
    const b = createBattle(packet);
    let guard = 0;
    while (!b.getResult() && guard++ < 60) { bot.play(b); b.commitChain(); }
    const r = b.getResult();
    if (!r) return { reached: idx, perFight };
    perFight.push({ turns: r.stats.turns, heartsLost: r.stats.heartsLost });
    hearts = r.remainingHearts;
    if (r.outcome !== 'win') return { reached: idx, perFight };
  }
  return { reached: CORE_TRIAL.fights.length, perFight };
}

const N = CORE_TRIAL.fights.length;
console.log(`=== 核心试玩假玩家：只有宝石牌，连打 ${N} 只，心 ${CORE_TRIAL.hearts} 颗不回 ===`);
console.log('怪：' + CORE_TRIAL.fights.map((f, i) => `${i + 1}.${ENCOUNTERS[f.encounterId].label}×${SCALES?.[i] ?? f.hpScale}`).join('  '));
for (const bot of BOTS) {
  const runs = bot.id === 'best' ? Math.max(20, Math.round(RUNS / 4)) : RUNS;
  const reachedAt = Array(N + 1).fill(0);
  const turnSum = Array(N).fill(0);
  const lostSum = Array(N).fill(0);
  const cnt = Array(N).fill(0);
  for (let i = 0; i < runs; i++) {
    const out = runTrial(bot, i);
    reachedAt[out.reached]++;
    out.perFight.forEach((f, k) => { turnSum[k] += f.turns; lostSum[k] += f.heartsLost; cnt[k]++; });
  }
  const clear = reachedAt[N] / runs;
  const avgReach = reachedAt.reduce((s, n, k) => s + n * k, 0) / runs;
  console.log(`\n▶ ${bot.label}（${runs} 趟）：打完 10 只 ${(clear * 100).toFixed(0)}% · 平均打过 ${avgReach.toFixed(1)} 只`);
  console.log('  每只的均回合：' + turnSum.map((t, k) => (cnt[k] ? (t / cnt[k]).toFixed(1) : '-')).join(' / '));
  console.log('  每只的均掉心：' + lostSum.map((t, k) => (cnt[k] ? (t / cnt[k]).toFixed(2) : '-')).join(' / '));
  console.log('  死在第几只：' + reachedAt.slice(0, N).map((n, k) => `${k + 1}:${n}`).filter((s) => !s.endsWith(':0')).join(' ') || '  没死过');
}
console.log(`\n▶ 排最长链是不是就对：「想清楚了打」的 ${gap.turns} 个回合里，最好的排法比排最长链多打 5% 以上的回合占 ${((gap.longestWorse5 / Math.max(1, gap.turns)) * 100).toFixed(0)}%，多 15% 以上的占 ${((gap.longestWorse15 / Math.max(1, gap.turns)) * 100).toFixed(0)}%`);
