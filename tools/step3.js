// 第 3 步的试玩：砍柴坡的新东西挨个看一遍——打伞的（抖伞）、凶·提可（精英）、老墩（扎根）、零碎三选一、石碑、强化、树洞。
// 用法：npx electron tools/shot.cjs tools/step3.js /tmp/shots
module.exports = async g => {
  const S = o => JSON.stringify(o);
  // 直接在主角跟前放一团鬼火、马上开打
  const fight = async spec => {
    await g.js(`(()=>{ const w = { x: player.x, y: player.y - 8, hx: player.x, hy: player.y - 8, kind: '${spec.kind}', color: [255,255,255], phase: 0, elite: ${!!spec.elite}, guard: ${!!spec.guard}, spec: ${S(spec)} }; wisps.push(w); trans = { kind: 'enter', t: 0, wisp: w }; })()`);
    await g.wait(1900);
  };
  const flee = async () => { await g.js(`leaveBattle('flee')`); await g.wait(1200); };
  const tapHand = async n => {   // 用真点击把手里的宝石牌排进链
    for (let k = 0; k < n; k++) {
      const pos = await g.js(`(()=>{ const b = BT.b, lay = handLayout(b.hand.length); const i = b.hand.findIndex(c => !c.instant && !c.junk); return i < 0 ? null : [lay[i].x, lay[i].y]; })()`);
      if (!pos) break; await g.click(pos[0], pos[1]); await g.wait(160);
    }
  };
  await g.wait(1200);
  await g.click(200, 330); await g.wait(1600);
  g.log('这一段', await g.js(`S = JSON.stringify, S({ guard: FLOOR.def.guard, spots: FLOOR.spots.map(s => [s.kind, s.x|0, s.y|0]), wisps: wisps.map(w => [w.kind, w.elite ? '精英' : w.guard ? '看门的' : '', w.spec.hp|0]) })`));

  // 打伞的：攒一回合，看它抖伞
  await fight({ kind: 'dasan', hp: 3000 });
  await g.shot('s1-dasan');
  await g.key('Space', 60); await g.wait(900);
  await g.shot('s2-dasan-spore');
  await g.wait(1600);
  g.log('抖伞以后', await g.js(`S({ phase: BT.phase, spores: BT.b.draw.concat(BT.b.hand).filter(c => c.key === 'spore').length, turn: BT.b.turn })`));
  await flee();

  // 精英提可
  await fight({ kind: 'tiko', hp: 12000, elite: true });
  await g.shot('s3-elite');
  g.log('精英', await g.js(`S({ name: BT.b.mon.name, atk: BT.b.mon.atk, hp: BT.b.mon.hp })`));
  await flee();

  // 老墩：根须、小打打不穿
  await fight({ kind: 'laodun', hp: 15e4, guard: true });
  await g.shot('s4-laodun');
  g.log('老墩', await g.js(`S({ name: BT.b.mon.name, hp: BT.b.mon.hp, roots: BT.b.mon.roots, guard: BT.b.mon.guard })`));
  await tapHand(2); await g.wait(300);
  await g.shot('s5-laodun-plan');
  await g.key('Space', 60); await g.wait(1300);
  await g.shot('s6-laodun-cast');
  await g.wait(2500);
  g.log('打了一下', await g.js(`S({ phase: BT.phase, hp: BT.b.mon.hp, roots: BT.b.mon.roots, turn: BT.b.turn })`));
  // 第二回合：根须长回来；把手里的牌全排上，点数调大，看打穿
  await g.js(`BT.b.hand.forEach(c => { c.pts = 4000; })`);
  await tapHand(4); await g.wait(200);
  await g.key('Space', 60); await g.wait(1400);
  await g.shot('s7-laodun-break');
  await g.wait(3000);
  g.log('打穿以后', await g.js(`S({ phase: BT.phase, hp: BT.b.mon.hp, roots: BT.b.mon.roots })`));
  // 打死它 → 零碎三选一
  await g.js(`BT.b.mon.hp = 1; BT.b.mon.roots = 0; BT.b.mon.rootMax = 0`);
  if (await g.js(`BT.phase`) === 'plan') { await tapHand(1); await g.key('Space', 60); }
  await g.wait(4500);
  await g.shot('s8-relic-pick');
  g.log('零碎三选一', await g.js(`S({ keys: BT.relicPick && BT.relicPick.keys })`));
  await g.click(640, 330); await g.wait(500);
  await g.shot('s9-loot');
  g.log('拿了零碎', await g.js(`S({ relics: run.relics, loot: !!BT.loot })`));
  await g.click(640, 559); await g.wait(1500);

  // 石碑
  await g.js(`(()=>{ const s = FLOOR.spots.find(s => s.kind === 'rest'); player.x = s.x; player.y = s.y + 16; CAM.x = player.x; CAM.y = player.y; wisps = wisps.filter(w => w.guard); })()`);
  await g.wait(600);
  await g.shot('s10-stone');
  await g.key('W', 500); await g.wait(400);
  await g.shot('s11-rest-menu');
  g.log('石碑菜单', await g.js(`S({ menu: spotMenu && spotMenu.kind })`));
  await g.click(640, 378); await g.wait(400);   // 强化一张牌
  await g.move(560, 300); await g.wait(300);
  await g.shot('s12-upgrade-pick');
  const first = await g.js(`(()=>{ const p = deckGrid()[0]; return [p.x, p.y]; })()`);
  await g.click(first[0], first[1]); await g.wait(500);
  g.log('强化完', await g.js(`S({ menu: spotMenu, toast: exploreToast && exploreToast.text, deck0: run.deck[0].name, used: FLOOR.spots.find(s => s.kind === 'rest').used })`));
  await g.shot('s13-after-rest');

  // 树洞
  await g.js(`(()=>{ const s = FLOOR.spots.find(s => s.kind === 'hollow'); player.x = s.x; player.y = s.y + 16; CAM.x = player.x; CAM.y = player.y; })()`);
  await g.wait(700);
  await g.shot('s14-hollow');
  await g.key('W', 500); await g.wait(400);
  await g.shot('s15-hollow-popup');
  await g.click(640, 518); await g.wait(600);
  g.log('树洞', await g.js(`S({ relics: run.relics, toast: exploreToast && exploreToast.text })`));
  await g.move(30, 84); await g.wait(200);
  await g.shot('s16-explore-ui');
};
