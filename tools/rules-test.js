// 规则单测（第 3 步：零碎、根须、孢子、精英、石碑）。用法：node tools/rules-test.js
// 把 rules.js 前面拼上 rngFrom / shuffle 在 node 里跑
const fs = require('fs');
const eng = fs.readFileSync('src/engine.js', 'utf8');
const pick = name => { const i = eng.indexOf('function ' + name); let d = 0, j = eng.indexOf('{', i); for (; j < eng.length; j++) { if (eng[j] === '{') d++; if (eng[j] === '}' && !--d) break; } return eng.slice(i, j + 1); };
const T = new Function(pick('rngFrom') + ';' + pick('shuffle') + ';' + fs.readFileSync('src/rules.js', 'utf8').replace("'use strict';", '') + ';return {newRun,startFight,plan,drawCount,gainRelic,onWin,applyHit,startCast,endCast,monsterTrait,monsterTurn,nextTurn,upgradeCard,removeCard,restHeal,makeCard,relicChoices,R};')();
const { newRun, startFight, plan, drawCount, gainRelic, onWin, applyHit, startCast, monsterTrait, nextTurn, upgradeCard, removeCard, restHeal, makeCard, relicChoices } = T;
let ok = 0, bad = 0; const eq = (name, a, b) => { if (JSON.stringify(a) === JSON.stringify(b)) ok++; else { bad++; console.log('不对', name, a, '应该是', b); } };
let run = newRun(7);
eq('摸牌 第1回合', drawCount(run, 1), 2);
gainRelic(run, 'mitten'); eq('毛线手套 第1回合', drawCount(run, 1), 3); eq('毛线手套 第9回合', drawCount(run, 9), 7);
let b = startFight(run, { kind: 'tiko', hp: 5000 }); eq('慢表之前 倒计时', b.mon.countdown, 3);
gainRelic(run, 'watch'); b = startFight(run, { kind: 'tiko', hp: 5000 }); eq('慢表 倒计时', b.mon.countdown, 4);
// 链：红 → 蓝（断） → 绿
const line = ['g0', 'g4', 'g2'].map(makeCard);
b = startFight(run, { kind: 'dasan', hp: 5000 }); b.line = line;
let p = plan(run, b); eq('断回 ×1', p.states.map(s => s.mult), [1, 1, 1]);
gainRelic(run, 'tape'); p = plan(run, b); eq('胶布 断只减半', p.states.map(s => s.mult), [1, 1, 1]);
b.line = ['g0', 'g0', 'g2'].map(makeCard); p = plan(run, b); eq('胶布：×2 后断（红→绿）→ ×1', p.states.map(s => s.mult), [1, 2, 1]);
b.line = ['g0', 'g0', 'g0', 'g4'].map(makeCard); p = plan(run, b); eq('胶布：×4 后断（红→蓝）→ ×2', p.states.map(s => s.mult), [1, 2, 4, 2]);
b.line = ['g0', 'g3'].map(makeCard); p = plan(run, b); eq('合白 白光 100×2', p.states[1].shots.filter(s => s.white).map(s => s.dmg), [200, 200, 200]);
gainRelic(run, 'shard'); p = plan(run, b); eq('白瓷片 白光 ×5', p.states[1].shots.filter(s => s.white).map(s => s.dmg), [1000, 1000, 1000]);
b.line = ['g0'].map(makeCard); p = plan(run, b); eq('红 一发', p.total, 100);
gainRelic(run, 'redstring'); p = plan(run, b); eq('红头绳 红 ×2', p.total, 200);
// 孢子
b = startFight(run, { kind: 'dasan', hp: 5000 }); const n0 = b.draw.length; const ev = monsterTrait(run, b);
eq('抖伞 牌堆 +1', b.draw.length, n0 + 1); eq('抖伞 是孢子', ev.spore.key, 'spore');
// 根须
b = startFight(run, { kind: 'laodun', hp: 15e4 }); eq('根须', [b.mon.rootMax, b.mon.roots], [9000, 9000]);
const pp = { dealt: 0 }, h1 = { dmg: 5000 }; applyHit(run, b, pp, h1); eq('小的一发全挡', [b.mon.hp, b.mon.roots, h1.rooted], [15e4, 4000, 5000]);
const h2 = { dmg: 6000 }; applyHit(run, b, pp, h2); eq('打穿', [b.mon.hp, b.mon.roots, h2.rootBreak], [148000, 0, true]);
nextTurn(run, b); eq('下回合长满', [b.mon.roots, b.rootsGrew], [9000, true]);
nextTurn(run, b); eq('没打掉就不算长', b.rootsGrew, false);
// 精英
b = startFight(run, { kind: 'tiko', hp: 9000, elite: true }); eq('精英', [b.mon.name, b.mon.atk, b.mon.elite], ['凶·提可', 1, true]);
// 水果糖、厚棉袄
run.hearts = 2; eq('没糖不回', onWin(run), 0); gainRelic(run, 'candy'); eq('糖回半颗', onWin(run), .5); eq('心', run.hearts, 2.5);
gainRelic(run, 'coat'); eq('棉袄', [run.maxHearts, run.hearts], [5, 3.5]);
gainRelic(run, 'coat'); eq('同一件不重复拿', run.maxHearts, 5);
// 石碑
eq('回心 +2', restHeal(run), 1.5); eq('心满', run.hearts, 5);
const u = upgradeCard(run, 0); eq('强化', [u.name, u.pts], ['红+', 250]); eq('强化过的不能再强化', upgradeCard(run, 0), null);
const n1 = run.deck.length; removeCard(run, 0); eq('删牌', run.deck.length, n1 - 1);
run.deck.length = 5; eq('最少留 5 张', removeCard(run, 0), null);
eq('零碎三选一不重复', new Set(relicChoices(run, 3)).size, 3);
eq('三选一不给已经有的', relicChoices(run, 3).some(k => run.relics.includes(k)), false);
// 暴击：灌铅骰子
let r2 = newRun(11), crit = 0, crit2 = 0; const bb = startFight(r2, { kind: 'dasan', hp: 1e9 }); bb.line = Array(20).fill(0).map(() => makeCard('g6'));
for (let i = 0; i < 200; i++) crit += startCast(r2, bb).hits.filter(h => h.crit).length;
gainRelic(r2, 'dice'); for (let i = 0; i < 200; i++) crit2 += startCast(r2, bb).hits.filter(h => h.crit).length;
console.log('暴击率 没骰子 ≈', (crit / 200 / bb.line.length / 3).toFixed(3), '有骰子 ≈', (crit2 / 200 / bb.line.length / 3).toFixed(3));
console.log(`对 ${ok}，不对 ${bad}`);
