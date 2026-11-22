// 规则单测（第 3 步：零碎、根须、孢子、精英、石碑；第 4 步：扑粉、盯着、哨子、万花筒、大口袋、跟屁虫、叠罗汉）。用法：node tools/rules-test.js
// 把 rules.js 前面拼上 rngFrom / shuffle 在 node 里跑
const fs = require('fs');
const eng = fs.readFileSync('src/engine.js', 'utf8');
const pick = name => { const i = eng.indexOf('function ' + name); let d = 0, j = eng.indexOf('{', i); for (; j < eng.length; j++) { if (eng[j] === '{') d++; if (eng[j] === '}' && !--d) break; } return eng.slice(i, j + 1); };
const T = new Function(pick('rngFrom') + ';' + pick('shuffle') + ';' + fs.readFileSync('src/rules.js', 'utf8').replace("'use strict';", '') + ';return {newRun,startFight,plan,drawCount,gainRelic,onWin,applyHit,startCast,endCast,monsterTrait,monsterTurn,nextTurn,upgradeCard,removeCard,restHeal,makeCard,relicChoices,handMaxOf,R};')();
const { newRun, startFight, plan, drawCount, gainRelic, onWin, applyHit, startCast, monsterTrait, nextTurn, upgradeCard, removeCard, restHeal, makeCard, relicChoices, handMaxOf } = T;
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
// ---------- 第 4 步 ----------
let r4 = newRun(21);
// 扑棱：盖住一张还看得见的手牌；手里全盖住了就不扑
let b4 = startFight(r4, { kind: 'pulang', hp: 6e4 });
const hid0 = b4.hand.filter(c => c.hidden).length, ev4 = monsterTrait(r4, b4);
eq('扑粉 盖住一张', [b4.hand.filter(c => c.hidden).length, !!(ev4 && ev4.dust && ev4.dust.hidden)], [hid0 + 1, true]);
b4.hand.forEach(c => { c.hidden = true; }); eq('全盖住了不再扑', monsterTrait(r4, b4), null);
b4.hand = []; eq('空手不扑', monsterTrait(r4, b4), null);
// 木木：倒计时 2
b4 = startFight(r4, { kind: 'mumu', hp: 5e4 }); eq('木木 倒计时 2', [b4.mon.cd, b4.mon.countdown], [2, 2]);
// 老猫头：盯着的颜色减半，每回合换一种（不会换成同一种）
b4 = startFight(r4, { kind: 'maotou', hp: 5e6 });
b4.mon.stare = 0; b4.line = ['g0', 'g2'].map(makeCard);   // 红 → 绿（断）
let p4 = plan(r4, b4); eq('盯着红：红一发 50，绿一发 100', p4.states.map(s => s.total), [50, 100]);
eq('盯着的那发做了记号', p4.states[0].shots[0].stared, true);
b4.line = ['g0', 'g3'].map(makeCard); p4 = plan(r4, b4);   // 红 → 青 合白：青 2 发 ×2 = 400，白光红 100 绿 200 蓝 200
eq('合白的白光也按颜色减半', p4.states[1].shots.map(s => s.dmg), [200, 200, 100, 200, 200]);
let changed = 0; for (let i = 0; i < 30; i++) { const before = b4.mon.stare, e = monsterTrait(r4, b4); if (e.stare !== before && e.stare >= 0 && e.stare < 3) changed++; }
eq('老猫头每回合都换颜色', changed, 30);
// 哨子：起手 ×3，断了回到 ×3
let r5 = newRun(5); b4 = startFight(r5, { kind: 'mumu', hp: 1e9 });
b4.line = ['g0', 'g0', 'g2'].map(makeCard); eq('没哨子', plan(r5, b4).states.map(s => s.mult), [1, 2, 1]);
gainRelic(r5, 'whistle'); eq('哨子 ×3 起、断回 ×3', plan(r5, b4).states.map(s => s.mult), [3, 6, 3]);
// 叠罗汉：后面每接一次多乘 1
b4.line = ['g0', 'stack', 'g0', 'g0'].map(makeCard); eq('叠罗汉 ×3 一接', plan(r5, b4).states.map(s => s.mult), [3, 3, 9, 27]);
b4.line = ['g0', 'stack+', 'g0'].map(makeCard); eq('叠罗汉+ ×4 一接', plan(r5, b4).states.map(s => s.mult), [3, 3, 12]);
// 跟屁虫：变成上一张的颜色，一定接上；没有上一张当白
b4.line = ['g4', 'follow'].map(makeCard); p4 = plan(r5, b4); eq('跟屁虫 跟蓝', [p4.states[1].rel, p4.states[1].as.mask, p4.states[1].mult], ['接上', 4, 6]);
b4.line = ['follow'].map(makeCard); eq('跟屁虫 打头 当白', plan(r5, b4).states[0].as.mask, 7);
b4.line = ['g4', 'follow+'].map(makeCard); eq('跟屁虫+ 点数 ×2.5', plan(r5, b4).states[1].shots[0].pts, 250);
// 唱反调接在白牌后面：没有补色，当白
b4.line = ['g6', 'contra'].map(makeCard); p4 = plan(r5, b4); eq('白后面唱反调 当白', [p4.states[1].as.mask, p4.states[1].shots.length > 0], [7, true]);
// 万花筒：彩虹以后每接 ×4
let r6 = newRun(6); b4 = startFight(r6, { kind: 'mumu', hp: 1e9 });
b4.line = ['family', 'g0', 'g0'].map(makeCard); eq('全家福后 每接 ×3', plan(r6, b4).states.map(s => s.mult), [1, 1, 3]);
gainRelic(r6, 'kaleido'); eq('万花筒 每接 ×4', plan(r6, b4).states.map(s => s.mult), [1, 1, 4]);
// 大口袋：手牌上限 12，第一回合多摸 1
let r7 = newRun(7); eq('手牌上限 10', handMaxOf(r7), 10); gainRelic(r7, 'pocket');
eq('大口袋 上限 12、第一回合摸 3、第二回合摸 3', [handMaxOf(r7), drawCount(r7, 1), drawCount(r7, 2)], [12, 3, 3]);
b4 = startFight(r7, { kind: 'mumu', hp: 5e4 }); eq('开打就是 12 上限、手里 3 张', [b4.handMax, b4.hand.length], [12, 3]);
console.log(`对 ${ok}，不对 ${bad}`);
