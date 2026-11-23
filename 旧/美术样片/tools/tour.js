// 试玩一圈：大厅 → 林子 → 挪到鬼火边进战斗 → 攒两回合 → 点牌排链 → 施法 → 打赢看奖励。
// 用法：npx electron tools/shot.cjs tools/tour.js /tmp/shots
module.exports = async g => {
  await g.wait(1500);
  await g.shot('01-lobby');
  await g.click(200, 330);                       // 进入迷雾森林
  await g.wait(1200);
  await g.key('W', 1200);
  await g.wait(300);
  await g.shot('02-explore');
  await g.js(`(()=>{ const w = wisps[0]; player.x = w.x + 20; player.y = w.y; })()`);
  await g.wait(2600);
  await g.shot('03-battle-turn1');
  const st = () => g.js(`JSON.stringify({ phase: BT.phase, turn: BT.b.turn, hand: BT.b.hand.map(c => c.name), line: BT.b.line.map(c => c.name), hp: BT.b.mon.hp, cd: BT.b.mon.countdown, hearts: run.hearts })`);
  g.log('开局', await st());
  for (let i = 0; i < 2; i++) { await g.key('Space', 80); await g.wait(1800); g.log('攒着后', await st()); }
  await g.shot('04-turn3-hand');
  // 用真的点击把牌排进链：每次挑一张能接上的（找不到就点第一张不是“马上用”的）
  for (let k = 0; k < 10; k++) {
    const pos = await g.js(`(()=>{ const b = BT.b, lay = handLayout(b.hand.length);
      let best = -1, bestM = -1;
      b.hand.forEach((c, i) => { if (c.instant) return; const s = plan(run, b, [...b.line, c]).states.at(-1); if (s.rel === '断') return; if (s.mult > bestM) { bestM = s.mult; best = i; } });
      return best < 0 ? null : [lay[best].x, lay[best].y]; })()`);
    if (!pos) break;
    await g.click(pos[0], pos[1]); await g.wait(250);
  }
  await g.move(640, 300); await g.wait(400);
  g.log('排好', await st());
  await g.shot('05-chain');
  await g.key('Space', 80);
  await g.wait(900);
  await g.shot('06-casting');
  await g.wait(2600);
  g.log('施法后', await st());
  await g.shot('07-after-cast');
  // 打赢看奖励
  await g.js(`BT.b.mon.hp = 1`);
  for (let k = 0; k < 6; k++) {
    const pos = await g.js(`(()=>{ const b = BT.b, lay = handLayout(b.hand.length); const i = b.hand.findIndex(c => !c.instant); return i < 0 ? null : [lay[i].x, lay[i].y]; })()`);
    if (!pos) break; await g.click(pos[0], pos[1]); await g.wait(200);
  }
  await g.key('Space', 80);
  await g.wait(4500);
  g.log('打完', await st(), await g.js(`BT.loot ? BT.loot.cards.map(c => c.name).join(' / ') : '没有奖励界面'`));
  await g.shot('08-loot');
  await g.click(640, 333);                       // 拿中间那张
  await g.wait(1500);
  await g.shot('09-back-to-forest');
  g.log('回林子', await g.js(`JSON.stringify({ mode, deck: run.deck.length, wins: run.wins, bestHit: run.bestHit })`));
};
