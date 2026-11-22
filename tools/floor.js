// 一局的骨架试玩：一段林子的俯视图（f0-overview）→ 走两步 → 打看门的 → 零碎 + 选牌 → 开石门 → 进下一段 → 回大厅看结算。
// 用法：npx electron tools/shot.cjs tools/floor.js /tmp/shots
const fs = require('fs');
module.exports = async g => {
  await g.wait(1200);
  await g.click(200, 330); await g.wait(1600);
  await g.shot('f1-entry');
  g.log('这一段', await g.js(`JSON.stringify({ name: FLOOR.def.name, entry: FLOOR.entry, gate: FLOOR.gate, wisps: wisps.map(w => ({ x: w.x|0, y: w.y|0, hp: w.spec.hp|0, guard: !!w.guard })) })`));
  // 整段的俯视图：把小地图全部点亮，再标上入口、鬼火、看门的、石门、主路
  const url = await g.js(`(()=>{ const F = FLOOR; for (let y = 0; y < FLOOR_W; y += 40) for (let x = 0; x < FLOOR_W; x += 40) exploreAround(F, x, y, 60);
    const c = document.createElement('canvas'); c.width = c.height = FLOOR_W; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(F.mm, 0, 0, FLOOR_W, FLOOR_W);
    for (const ch of chunks.values()) for (const o of ch.objs) if (o.tall) { x.fillStyle = o.dead ? '#5a4a40' : '#1e3a2c'; x.fillRect(o.x - 2, o.y - 2, 4, 4); }
    x.strokeStyle = 'rgba(255,220,150,.5)'; x.beginPath(); F.path.forEach(([a, b], i) => i ? x.lineTo(a, b) : x.moveTo(a, b)); x.stroke();
    for (const w of wisps) { x.fillStyle = w.guard ? '#ff7a54' : w.elite ? '#ff3c3c' : rgba(w.color); x.beginPath(); x.arc(w.x, w.y, w.guard ? 7 : w.elite ? 6 : 5, 0, 7); x.fill(); }
    for (const sp of F.spots) { x.fillStyle = sp.kind === 'rest' ? '#7cc8ff' : '#ffd08a'; x.fillRect(sp.x - 5, sp.y - 5, 10, 10); }
    x.fillStyle = '#fff'; x.fillRect(F.entry.x - 4, F.entry.y - 4, 8, 8); x.fillStyle = '#7cc8ff'; x.fillRect(F.gate.x - 10, F.gate.y - 3, 20, 6);
    F.explored.fill(0); F.mm.getContext('2d').clearRect(0, 0, MM_N, MM_N);
    return c.toDataURL(); })()`);
  fs.writeFileSync(require('path').join(g.out, 'f0-overview.png'), Buffer.from(url.split(',')[1], 'base64'));
  await g.key('W', 1500); await g.wait(300);
  await g.shot('f2-walk');
  // 挪到看门的南边一点
  await g.js(`(()=>{ const gd = wisps.find(w => w.guard); player.x = gd.x; player.y = gd.y + 60; CAM.x = player.x; CAM.y = player.y; })()`);
  await g.wait(800);
  await g.shot('f3-guard');
  await g.js(`(()=>{ const gd = wisps.find(w => w.guard); player.x = gd.x; player.y = gd.y + 40; })()`);   // 挪进碰撞距离（直接走过去偶尔会被树挡住）
  await g.wait(2600);
  g.log('进战斗', await g.js(`JSON.stringify({ mode, name: BT.b && BT.b.mon.name, hp: BT.b && BT.b.mon.hp, guard: BT.b && BT.b.mon.guard })`));
  await g.shot('f4-guard-battle');
  await g.js(`BT.b.mon.hp = 1; BT.b.mon.roots = BT.b.mon.rootMax = 0`);   // 老墩的根须也拿掉，一下打死
  for (let k = 0; k < 3; k++) { const pos = await g.js(`(()=>{ const b = BT.b, lay = handLayout(b.hand.length); const i = b.hand.findIndex(c => !c.instant); return i < 0 ? null : [lay[i].x, lay[i].y]; })()`); if (!pos) break; await g.click(pos[0], pos[1]); await g.wait(150); }
  await g.key('Space', 60); await g.wait(4200);
  g.log('看门的掉的零碎', await g.js(`JSON.stringify(BT.relicPick && BT.relicPick.keys)`));
  await g.click(640, 345); await g.wait(500);   // 零碎三选一：中间那件
  await g.click(640, 333); await g.wait(1600);   // 选牌：中间那张
  g.log('打完', await g.js(`JSON.stringify({ mode, gateOpen: FLOOR.gateOpen, toast: exploreToast && exploreToast.text })`));
  await g.shot('f5-gate-open');
  await g.js(`(()=>{ player.x = FLOOR.gate.x; player.y = FLOOR.gate.y + 24; })()`);
  await g.wait(400);
  await g.shot('f6-at-gate');
  await g.key('W', 1200); await g.wait(1500);
  g.log('下一段', await g.js(`JSON.stringify({ mode, floor: FLOOR.i, name: FLOOR.def.name, wisps: wisps.length, hp: wisps[0].spec.hp|0 })`));
  await g.shot('f7-floor2');
  await g.key('Escape', 60); await g.wait(300); await g.click(575, 400); await g.wait(1500);
  await g.shot('f8-summary');
  g.log('大厅', await g.js(`JSON.stringify({ mode, summary: lobbySummary, profile })`));
};
