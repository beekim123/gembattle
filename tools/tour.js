// 试玩一圈：大厅 → 林子 → 关灯看整片 → 挪到鬼火边进战斗 → 排四张牌施法。
// 用法：npx electron tools/shot.cjs tools/tour.js /tmp/shots
module.exports = async g => {
  await g.wait(1500);
  await g.shot('01-lobby');
  await g.js(`MODE_INFO = 1`);
  // 进林子
  await g.click(200, 330);
  await g.wait(1200);
  await g.shot('02-explore');
  // 往前走一段
  await g.key('W', 1500);
  await g.wait(300);
  await g.shot('03-explore-walk');
  // 关灯看整片
  await g.js(`NOLIGHT = true`);
  await g.wait(200);
  await g.shot('04-nolight');
  await g.js(`NOLIGHT = false`);
  // 直接进战斗：找最近的鬼火，把人挪过去
  const info = await g.js(`(()=>{ const w = wisps[0]; if(!w) return 'no wisp'; player.x = w.x + 20; player.y = w.y; return [w.x,w.y]; })()`);
  g.log('wisp', info);
  await g.wait(2500);
  await g.shot('05-battle');
  await g.js(`JSON.stringify({mode, hand: BT.b && BT.b.hand.map(c=>c.name)})`).then(g.log);
  // 拖三张牌进序列
  for (let i = 0; i < 4; i++) { await g.drag(640, 612, 640, 470); await g.wait(200); }
  await g.move(640, 300);
  await g.wait(300);
  await g.shot('06-line');
  await g.click(1166, 581);
  await g.wait(900);
  await g.shot('07-casting');
  await g.wait(2500);
  await g.shot('08-after');
};
