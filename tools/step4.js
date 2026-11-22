// 第 4 步的试玩：老林子的新东西挨个看一遍——地貌、扑棱（扑粉盖牌）、木木（急性子）、精英、老猫头（盯着）、新零碎、新牌。
// 用法：npx electron tools/shot.cjs tools/step4.js /tmp/shots
module.exports = async g => {
  const S = o => JSON.stringify(o);
  // 直接在主角跟前放一团鬼火、马上开打
  const fight = async spec => {
    await g.js(`(()=>{ const w = { x: player.x, y: player.y - 8, hx: player.x, hy: player.y - 8, kind: '${spec.kind}', color: [255,255,255], phase: 0, elite: ${!!spec.elite}, guard: ${!!spec.guard}, spec: ${S(spec)} }; wisps.push(w); trans = { kind: 'enter', t: 0, wisp: w }; })()`);
    await g.wait(1900);
  };
  const flee = async () => { await g.js(`leaveBattle('flee')`); await g.wait(1200); };
  const handPos = async (pick = '!c.instant && !c.junk') => g.js(`(()=>{ const b = BT.b, lay = handLayout(b.hand.length); const i = b.hand.findIndex(c => ${pick}); return i < 0 ? null : [lay[i].x, lay[i].y]; })()`);
  const tapHand = async (n, pick) => {   // 用真点击把手里的牌排进链
    for (let k = 0; k < n; k++) { const pos = await handPos(pick); if (!pos) break; await g.click(pos[0], pos[1]); await g.wait(160); }
  };
  await g.wait(1200);
  await g.click(200, 330); await g.wait(1600);
  await g.js(`enterFloor(1)`); await g.wait(2400);
  await g.shot('l1-forest');
  g.log('这一段', await g.js(`S = JSON.stringify, S({ name: FLOOR.def.name, guard: FLOOR.def.guard, wisps: wisps.map(w => [w.kind, w.elite ? '精英' : w.guard ? '看门的' : '', w.spec.hp|0]) })`));
  await g.key('W', 900); await g.wait(200);
  await g.shot('l2-forest-walk');

  // 扑棱：攒一回合，看它扑粉盖牌
  await fight({ kind: 'pulang', hp: 9e4 });
  await g.shot('l3-pulang');
  await g.key('Space', 60); await g.wait(500);
  await g.shot('l4-pulang-dust');
  await g.wait(2200);
  await g.js(`(()=>{ const c = BT.b.hand.find(c => !c.instant && !c.junk && !c.hidden); if (c) c.hidden = true; })()`);   // 再盖一张宝石牌，好看链里的「？」
  g.log('扑粉以后', await g.js(`S({ phase: BT.phase, turn: BT.b.turn, hand: BT.b.hand.map(c => c.name + (c.hidden ? '(盖)' : '')) })`));
  const hid = await handPos('c.hidden');
  if (hid) { await g.move(hid[0], hid[1]); await g.wait(300); }
  await g.shot('l5-hidden-card');
  await tapHand(6, '!c.instant && !c.junk'); await g.wait(300);
  await g.shot('l6-hidden-in-line');
  await g.key('Space', 60); await g.wait(700);
  await g.shot('l7-hidden-cast');
  await g.wait(3000);
  g.log('打完', await g.js(`S({ phase: BT.phase, hp: BT.b.mon.hp|0, hidden: BT.b.hand.filter(c => c.hidden).length })`));
  await flee();

  // 木木：倒计时 2
  await fight({ kind: 'mumu', hp: 8e4 });
  await g.wait(1200);
  await g.shot('l8-mumu');
  g.log('木木', await g.js(`S({ name: BT.b.mon.name, cd: BT.b.mon.cd, countdown: BT.b.mon.countdown })`));
  await flee();
  // 精英
  await fight({ kind: 'mumu', hp: 4e5, elite: true });
  await g.wait(1200);
  await g.shot('l9-mumu-elite');
  await flee();
  await fight({ kind: 'pulang', hp: 4e5, elite: true });
  await g.wait(1200);
  await g.shot('l10-pulang-elite');
  await flee();

  // 老猫头：盯着一种颜色
  await fight({ kind: 'maotou', hp: 5e6, guard: true });
  await g.wait(800);
  await g.shot('l11-maotou');
  g.log('老猫头', await g.js(`S({ name: BT.b.mon.name, hp: BT.b.mon.hp, stare: BT.b.mon.stare })`));
  await g.key('Space', 60); await g.wait(400);
  await g.shot('l12-maotou-stare');
  await g.wait(2400);
  g.log('换眼神以后', await g.js(`S({ phase: BT.phase, stare: BT.b.mon.stare, turn: BT.b.turn })`));
  await tapHand(5); await g.wait(300);
  await g.shot('l13-maotou-plan');
  await g.key('Space', 60); await g.wait(1300);
  await g.shot('l14-maotou-cast');
  await g.wait(3500);
  g.log('打了一下', await g.js(`S({ phase: BT.phase, hp: BT.b.mon.hp|0 })`));

  // 新零碎和新牌：塞进手里看看
  await g.js(`(()=>{ ['whistle', 'kaleido', 'pocket'].forEach(k => gainRelic(run, k)); BT.b.hand.push(makeCard('follow'), makeCard('stack'), makeCard('follow+')); BT.b.handMax = handMaxOf(run); })()`);
  await g.wait(800);
  const fol = await handPos(`c.key === 'follow'`);
  if (fol) { await g.move(fol[0], fol[1]); await g.wait(300); }
  await g.shot('l15-new-cards');
  const rx = await g.js(`run.relics.length`);
  g.log('零碎', await g.js(`S({ relics: run.relics, handMax: BT.b.handMax })`));
  await g.move(24 + (rx - 1) * 30 + 12, 74); await g.wait(300);
  await g.shot('l16-relic-tip');
};
