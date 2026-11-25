import {
  generateMap, childrenOf, parentsOf, reachableFrom, ancestorsOf, createTrip, nextNodes, enterNode, nodeOf, battleDef, isFight,
  startBattle, winBattle, loseBattle, takeLoot, finishNode, campOptions, campHeal, campPurge, campCarve, gateChoose, summarize,
  gemCards, carveOptions, applyCarve, expandHand, heal, offerArcana, addArcana, addJunk, removable, removeCard, offerSeals, addSeal,
  shopStock, buy, payCarve, canBuy, optionCheck, chooseOption, finishPurgeForGold, finishCarveJunk, biomeOfNode, segmentOf, STEPS, GATE_AFTER,
} from '../index.js';
import { ENCOUNTERS, EVENTS, SEALS, SEAL_IDS, LINES, ARCANA_IDS, BIOMES, isGem } from '../../content/index.js';
import { CONFIG } from '../../shared/index.js';
import { playBattle } from './bot.js';

export default function (t) {
  const { assert } = t;
  const eq = assert.equal;
  const SEEDS = Array.from({ length: 200 }, (_, i) => i + 1);

  // ---------- 路线图 ----------
  t.test('路线图：共 8 步；第 1 步固定 2 个入口（水滴软泥 / 草茎绵羊）；第 7 步只有营火；第 8 步只有首领', () => {
    for (const s of SEEDS) {
      const m = generateMap(s);
      eq(m.layers.length, STEPS);
      const L = i => m.layers[i - 1].map(id => m.nodes[id]);
      eq(L(1).length, 2);
      assert.deepEqual(L(1).map(n => n.enc), ['e_slime', 'e_sheep']);
      eq(L(7).length, 1); eq(L(7)[0].type, 'camp');
      eq(L(8).length, 1); eq(L(8)[0].type, 'boss'); eq(L(8)[0].enc, 'e_boss');
      for (let i = 2; i <= 6; i++) assert.ok(L(i).length >= 2 && L(i).length <= 3, `第 ${i} 步 2~3 条路`);
    }
  });
  t.test('路线图：第 4 步必含强敌五尾赤豹和一条稳妥的普通战斗；第 6 步必含强敌腹口懒兽', () => {
    for (const s of SEEDS) {
      const m = generateMap(s);
      const L = i => m.layers[i - 1].map(id => m.nodes[id]);
      assert.ok(L(4).some(n => n.type === 'elite' && n.enc === 'e_leopard'), '赤豹');
      assert.ok(L(4).some(n => n.type === 'battle'), '稳妥分支');
      assert.ok(L(6).some(n => n.type === 'elite' && n.enc === 'e_sloth'), '懒兽');
      assert.ok(L(5).some(n => n.enc === 'e_gibbon'), '第 5 步长臂猿');
    }
  });
  t.test('路线图：每一步都有能打的战斗；第 3 步必含营火；第 2~6 步合起来有行商营帐和林中偶遇', () => {
    for (const s of SEEDS) {
      const m = generateMap(s);
      const L = i => m.layers[i - 1].map(id => m.nodes[id]);
      for (let i = 1; i <= 6; i++) assert.ok(L(i).some(n => n.type === 'battle' || n.type === 'elite'), `第 ${i} 步要有战斗`);
      assert.ok(L(3).some(n => n.type === 'camp'));
      const mid = [2, 3, 4, 5, 6].flatMap(L);
      assert.ok(mid.some(n => n.type === 'shop'), `seed ${s} 行商`);
      assert.ok(mid.some(n => n.type === 'event'), `seed ${s} 偶遇`);
    }
  });
  t.test('路线图：连通——所有节点从第 1 步走得到，也都走得到首领；连线不交叉；每条线只连相邻两步', () => {
    for (const s of SEEDS) {
      const m = generateMap(s);
      const starts = m.layers[0];
      const boss = m.layers[7][0];
      const fromStart = new Set(starts.flatMap(id => [...reachableFrom(m, id)]));
      const toBoss = ancestorsOf(m, boss);
      for (const id of Object.keys(m.nodes)) {
        assert.ok(fromStart.has(id), `${id} 从起点走不到 (seed ${s})`);
        assert.ok(toBoss.has(id), `${id} 走不到首领 (seed ${s})`);
        if (m.nodes[id].step < 8) assert.ok(childrenOf(m, id).length > 0);
        if (m.nodes[id].step > 1) assert.ok(parentsOf(m, id).length > 0);
      }
      for (const e of m.edges) eq(m.nodes[e.to].step, m.nodes[e.from].step + 1);
      for (const a of m.edges) for (const c of m.edges) {
        if (m.nodes[a.from].step !== m.nodes[c.from].step) continue;
        const ax = m.nodes[a.from].col, bx = m.nodes[a.to].col, cx = m.nodes[c.from].col, dx = m.nodes[c.to].col;
        assert.ok(!((ax < cx && bx > dx) || (ax > cx && bx < dx)), `连线交叉 (seed ${s})`);
      }
      // 节点 x 坐标跟列的顺序一致，画出来也不会交叉
      for (const layer of m.layers) for (let k = 1; k < layer.length; k++) assert.ok(m.nodes[layer[k]].x > m.nodes[layer[k - 1]].x);
    }
  });
  t.test('路线图：同一个种子生成同一张图；不同种子不全一样', () => {
    assert.deepEqual(generateMap(9), generateMap(9));
    const sig = s => JSON.stringify(generateMap(s).layers.map(l => l.length));
    assert.ok(new Set(SEEDS.slice(0, 30).map(sig)).size > 1);
  });
  t.test('路线图：战斗节点都挂战利品角标，强敌给手牌扩容；林中偶遇节点带互不相同的偶遇', () => {
    for (const s of SEEDS) {
      const m = generateMap(s);
      for (const n of Object.values(m.nodes)) {
        if (n.type === 'battle') assert.ok(['carve', 'seal', 'arcana', 'hand', 'heal', 'attr'].includes(n.loot), `${n.id} 战利品`);
        if (n.type === 'elite') eq(n.loot, 'hand');
        if (n.type === 'event') assert.ok(EVENTS[n.eventId]);
      }
      const ev = Object.values(m.nodes).filter(n => n.type === 'event').map(n => n.eventId);
      eq(new Set(ev).size, Math.min(ev.length, 4));
    }
  });
  t.test('图里带着步数、界门位置、生态分段：界面按这几个数画，以后加深度不用改界面', () => {
    const m = generateMap(4);
    eq(m.steps, 8); eq(m.gateAfter, 4);
    assert.deepEqual(m.segments.map(s => s.name), ['林缘', '腹地', '巨木树冠']);
    eq(m.layers.length, m.steps);
  });
  t.test('生态分段：林缘 1~4、腹地 5~7、巨木树冠 8', () => {
    eq(segmentOf(1).name, '林缘'); eq(segmentOf(4).name, '林缘');
    eq(segmentOf(5).name, '腹地'); eq(segmentOf(7).name, '腹地');
    eq(segmentOf(8).name, '巨木树冠');
  });
  t.test('每个节点都能对上一个生态场景色板', () => {
    for (const s of SEEDS.slice(0, 20)) for (const n of Object.values(generateMap(s).nodes)) assert.ok(BIOMES[biomeOfNode(n)], n.id);
  });

  // ---------- 一趟的流程 ----------
  const fightStep = (trip, id) => {
    const node = enterNode(trip, id);
    const b = startBattle(trip, node);
    return { node, b };
  };
  const instaWin = (trip, node, b) => { b.enemies.forEach(e => { e.alive = false; e.hp = 0; }); b.phase = 'victory'; return winBattle(trip, node, b); };
  const walk = (trip, pickType) => {
    const ids = nextNodes(trip);
    return ids.find(id => nodeOf(trip, id).type === pickType) || ids[0];
  };

  t.test('起点：能点的是第 1 步的两个入口；点第 2 步的格子点不进去', () => {
    const trip = createTrip(5);
    assert.deepEqual(nextNodes(trip), trip.map.layers[0]);
    eq(enterNode(trip, trip.map.layers[1][0]), null);
    eq(trip.pos, null);
  });
  t.test('进了节点没办完不能再选下一个；办完才能选，且只能选连着的', () => {
    const trip = createTrip(5);
    const first = trip.map.layers[0][0];
    enterNode(trip, first);
    assert.deepEqual(nextNodes(trip), []);
    finishNode(trip);
    assert.deepEqual(nextNodes(trip).sort(), childrenOf(trip.map, first).sort());
    eq(enterNode(trip, trip.map.layers[0][1]), null);
  });
  t.test('赢一场：掉金币（强敌更多）、心和宝石等级带回，返回战利品', () => {
    const trip = createTrip(5);
    const { node, b } = fightStep(trip, trip.map.layers[0][0]);
    b.player.hearts = 2; b.player.gems[0].level = 3;
    const r = instaWin(trip, node, b);
    eq(r.gold, 25); eq(trip.gold, 25);
    eq(trip.player.hearts, 2); eq(trip.player.gems[0].level, 3);
    eq(r.loot, node.loot);
    eq(trip.stats.battles, 1);
  });
  t.test('输一场：整趟结束，战利品尽失', () => {
    const trip = createTrip(5);
    trip.gold = 80;
    fightStep(trip, trip.map.layers[0][0]);
    loseBattle(trip);
    eq(trip.ended.kind, 'defeat');
    const s = summarize(trip);
    eq(s.kept, false);
    assert.deepEqual(nextNodes(trip), []);
  });
  t.test('第 4 步打完弹界门：不选就不能走；见好就收结束并保留战利品', () => {
    const trip = createTrip(6);
    let guard = 0;
    while (trip.step < GATE_AFTER && guard++ < 20) {
      const id = walk(trip, 'battle');
      const node = enterNode(trip, id);
      if (isFight(node)) { const b = startBattle(trip, node); instaWin(trip, node, b); }
      finishNode(trip);
    }
    eq(trip.step, GATE_AFTER);
    eq(trip.gatePending, true);
    assert.deepEqual(nextNodes(trip), []);
    trip.gold = 120;
    eq(gateChoose(trip, 'retreat'), true);
    eq(trip.ended.kind, 'retreat');
    const s = summarize(trip);
    eq(s.kept, true); eq(s.gold, 120);
  });
  t.test('界门深入腹地：能继续走第 5 步；界门只弹一次', () => {
    const trip = createTrip(6);
    let guard = 0;
    while (trip.step < GATE_AFTER && guard++ < 20) {
      const id = walk(trip, 'battle');
      const node = enterNode(trip, id);
      if (isFight(node)) { const b = startBattle(trip, node); instaWin(trip, node, b); }
      finishNode(trip);
    }
    gateChoose(trip, 'advance');
    eq(trip.ended, null);
    assert.ok(nextNodes(trip).length > 0);
    eq(nodeOf(trip, nextNodes(trip)[0]).step, 5);
    eq(gateChoose(trip, 'advance'), false);
  });
  t.test('首领打赢：整趟胜利', () => {
    const trip = createTrip(6);
    trip.pos = trip.map.layers[6][0]; trip.step = 7; trip.gateChosen = true;
    const id = nextNodes(trip)[0];
    const { node, b } = fightStep(trip, id);
    eq(node.type, 'boss');
    const r = instaWin(trip, node, b);
    eq(trip.ended.kind, 'victory');
    eq(r.loot, null);
  });
  t.test('第 7 步营火：围火疗伤回 1 颗心，不超过上限', () => {
    const trip = createTrip(3);
    trip.player.hearts = 1.5;
    eq(campHeal(trip), 1); eq(trip.player.hearts, 2.5);
    eq(campHeal(trip), 0.5); eq(trip.player.hearts, 3);
  });
  t.test('营火：清理行囊删 1 张秘术牌或废牌；没有可删的就换成攻击 +10', () => {
    const trip = createTrip(3);
    const opts = campOptions(trip);
    eq(opts.length, 3);
    assert.ok(opts[2].fallback);
    eq(campPurge(trip), 'atk'); eq(trip.player.atk, 45);
    const c = addArcana(trip, 'surge');
    assert.ok(!campOptions(trip)[2].fallback);
    eq(campPurge(trip, c.uid), 'purge');
    eq(trip.deckCards.length, 29);
  });
  t.test('营火：雕琢宝石强化 1 张宝石牌', () => {
    const trip = createTrip(3);
    const c = gemCards(trip)[0];
    eq(campCarve(trip, c.uid, 'sharp'), true);
    assert.deepEqual(trip.deckCards.find(x => x.uid === c.uid).carve, ['sharp']);
  });

  // ---------- 成长 ----------
  t.test('宝石雕琢：四选一；同一张同一种不能重复，不同种可以叠；秘术牌不能雕琢', () => {
    const trip = createTrip(3);
    const c = gemCards(trip)[3];
    eq(carveOptions(c).length, 4);
    eq(applyCarve(trip, c.uid, 'twin'), true);
    eq(applyCarve(trip, c.uid, 'twin'), false);
    eq(applyCarve(trip, c.uid, 'pierce'), true);
    assert.deepEqual(carveOptions(trip.deckCards.find(x => x.uid === c.uid)), ['sharp', 'overflow']);
    const a = addArcana(trip, 'ward');
    eq(applyCarve(trip, a.uid, 'sharp'), false);
    eq(applyCarve(trip, c.uid, 'nope'), false);
  });
  t.test('雕琢带进战斗：深拷贝的牌上还带着雕琢', () => {
    const trip = createTrip(3);
    const c = gemCards(trip)[0];
    applyCarve(trip, c.uid, 'sharp');
    const node = enterNode(trip, trip.map.layers[0][0]);
    const b = startBattle(trip, node);
    const all = [...b.deck.draw, ...b.deck.hand];
    assert.deepEqual(all.find(x => x.uid === c.uid).carve, ['sharp']);
  });
  t.test('手牌扩容：N 从 3 到 4 到 5，到顶后不再加', () => {
    const trip = createTrip(3);
    eq(expandHand(trip), true); eq(trip.player.handBase, 4);
    eq(expandHand(trip), true); eq(trip.player.handBase, 5);
    eq(expandHand(trip), false);
    const r = takeLoot(trip, 'hand');
    eq(r.kind, 'attr'); eq(trip.player.atk, 45);
  });
  t.test('手牌扩容带进战斗：N=4 开局拿 4 张', () => {
    const trip = createTrip(3);
    expandHand(trip);
    const b = startBattle(trip, enterNode(trip, trip.map.layers[0][0]));
    eq(b.deck.hand.length, 4);
  });
  t.test('秘术牌：8 张里三选一（不重复）；拿到的牌混进牌组', () => {
    const trip = createTrip(3);
    const o = offerArcana(trip);
    eq(o.length, 3); eq(new Set(o).size, 3);
    for (const id of o) assert.ok(ARCANA_IDS.includes(id));
    addArcana(trip, o[0]);
    eq(trip.deckCards.length, 30);
    const node = enterNode(trip, trip.map.layers[0][0]);
    const b = startBattle(trip, node);
    eq(b.deck.draw.length + b.deck.hand.length, 30);
  });
  t.test('秘术牌的 uid 在一趟里不重复', () => {
    const trip = createTrip(3);
    for (let i = 0; i < 5; i++) addArcana(trip, 'ward');
    addJunk(trip);
    eq(new Set(trip.deckCards.map(c => c.uid)).size, trip.deckCards.length);
  });
  t.test('秘宝印记：没拿过时三选一来自不同路子', () => {
    for (const s of SEEDS.slice(0, 40)) {
      const trip = createTrip(s);
      const o = offerSeals(trip);
      eq(o.length, 3);
      eq(new Set(o.map(id => SEALS[id].line)).size, 3, '三个来自三条路子');
    }
  });
  t.test('秘宝印记：拿过哪条路子，后续三选一一定带上那条路子的另一个，并向它收窄', () => {
    for (const s of SEEDS.slice(0, 40)) {
      const trip = createTrip(s);
      addSeal(trip, 'double_white');
      const o = offerSeals(trip);
      assert.ok(o.includes('white_echo'), '合白路子的另一个必出');
      assert.ok(!o.includes('double_white'), '拿过的不再出');
      eq(o.length, 3);
    }
  });
  t.test('秘宝印记：拿过两条路子，选项里两条路子的另一个都在', () => {
    const trip = createTrip(2);
    addSeal(trip, 'leap'); addSeal(trip, 'wide_bag');
    const o = offerSeals(trip);
    assert.ok(o.includes('chain_surge') && o.includes('hold_edge'));
    eq(o.length, 3);
  });
  t.test('秘宝印记：拿满 10 个后不再出；重复拿不了；10 个都能拿到', () => {
    const trip = createTrip(2);
    for (const id of SEAL_IDS) eq(addSeal(trip, id), true);
    eq(addSeal(trip, 'leap'), false);
    eq(offerSeals(trip).length, 0);
    eq(trip.player.seals.length, 10);
  });
  t.test('印记带进战斗并生效', () => {
    const trip = createTrip(2);
    addSeal(trip, 'wide_bag');
    const b = startBattle(trip, enterNode(trip, trip.map.layers[0][0]));
    assert.ok(b.player.seals.includes('wide_bag'));
  });
  t.test('疗伤果泉：回 1 颗心，满了不再加', () => {
    const trip = createTrip(2);
    trip.player.hearts = 2;
    eq(takeLoot(trip, 'heal').text, '回了 1 颗心');
    eq(trip.player.hearts, 3);
    eq(takeLoot(trip, 'heal').text, '心是满的');
  });
  t.test('战利品：雕琢、印记、秘术牌要玩家挑；扩容、疗伤、属性立刻结算', () => {
    const trip = createTrip(2);
    for (const k of ['carve', 'seal', 'arcana']) eq(takeLoot(trip, k).choice, k);
    eq(takeLoot(trip, 'attr').text, '攻击 +10');
  });

  // ---------- 行商营帐 ----------
  t.test('行商：陈列 2 个印记、2 张秘术牌、1 次宝石雕琢、1 瓶红果饮', () => {
    const trip = createTrip(2);
    const st = shopStock(trip);
    const n = k => st.filter(i => i.kind === k).length;
    eq(n('seal'), 2); eq(n('arcana'), 2); eq(n('carve'), 1); eq(n('drink'), 1);
  });
  t.test('行商：钱够才能买，买了就卖完；红果饮回半颗心；买雕琢要走 payCarve', () => {
    const trip = createTrip(2);
    const st = shopStock(trip);
    const seal = st.find(i => i.kind === 'seal');
    eq(buy(trip, seal), false);                       // 没钱
    trip.gold = 500;
    eq(buy(trip, seal), true);
    eq(trip.gold, 500 - seal.price);
    assert.ok(trip.player.seals.includes(seal.ref));
    eq(buy(trip, seal), false, '卖完了');
    trip.player.hearts = 2;
    const drink = st.find(i => i.kind === 'drink');
    buy(trip, drink);
    eq(trip.player.hearts, 2.5);
    const carve = st.find(i => i.kind === 'carve');
    eq(buy(trip, carve), false, '雕琢要先挑牌');
    const before = trip.gold;
    eq(payCarve(trip, carve), true);
    eq(trip.gold, before - carve.price);
    const arc = st.find(i => i.kind === 'arcana');
    buy(trip, arc);
    eq(trip.deckCards.length, 30);
  });

  // ---------- 林中偶遇 ----------
  t.test('红果老木：俯身舀饮扣半颗心（最多扣到剩半颗），获印记三选一；绕道离开什么也不发生', () => {
    const trip = createTrip(4);
    const r = chooseOption(trip, 'old_wood', 'drink');
    eq(r.next, 'seal'); eq(r.options.length, 3);
    eq(trip.player.hearts, 2.5);
    trip.player.hearts = 0.5;
    chooseOption(trip, 'old_wood', 'drink');
    eq(trip.player.hearts, 0.5, '最多扣到剩半颗');
    eq(chooseOption(trip, 'old_wood', 'leave').next, 'done');
  });
  t.test('青苔古碑：以碑砺晶先挑雕琢，再往牌组塞 1 张缠藤废牌；离开无事', () => {
    const trip = createTrip(4);
    const r = chooseOption(trip, 'moss_stele', 'hone');
    eq(r.next, 'carve'); eq(r.thenJunk, true);
    eq(trip.deckCards.length, 29);
    finishCarveJunk(trip);
    eq(trip.deckCards.length, 30);
    assert.ok(trip.deckCards.some(c => c.junk));
  });
  t.test('林泉水洼：投 30 金币回 1 颗心；金币不够选不了', () => {
    const trip = createTrip(4);
    trip.player.hearts = 1;
    eq(optionCheck(trip, 'spring_pool', 'bathe').ok, false);
    eq(chooseOption(trip, 'spring_pool', 'bathe').next, 'refused');
    trip.gold = 50;
    chooseOption(trip, 'spring_pool', 'bathe');
    eq(trip.gold, 20); eq(trip.player.hearts, 2);
  });
  t.test('树洞遗囊：以旧换钱删 1 张秘术牌或废牌换 25 金币；没有可删的选不了；翻找内袋随机得 1 张秘术牌', () => {
    const trip = createTrip(4);
    eq(optionCheck(trip, 'hollow_bag', 'trade').ok, false);
    const j = addJunk(trip);
    eq(optionCheck(trip, 'hollow_bag', 'trade').ok, true);
    eq(chooseOption(trip, 'hollow_bag', 'trade').next, 'purge');
    eq(finishPurgeForGold(trip, j.uid), true);
    eq(trip.gold, 25); eq(trip.deckCards.length, 29);
    eq(finishPurgeForGold(trip, trip.deckCards[0].uid), false, '宝石牌不能换');
    const r = chooseOption(trip, 'hollow_bag', 'search');
    assert.ok(ARCANA_IDS.includes(r.gotArcana));
    eq(trip.deckCards.length, 30);
  });
  t.test('4 个偶遇的名字和文案照文档 3.3', () => {
    eq(EVENTS.old_wood.name, '红果老木'); eq(EVENTS.old_wood.text, '空心倒木里淌出温热的红果浆。');
    eq(EVENTS.moss_stele.text, '碑面凹槽里嵌着半枚无色晶石，摸上去微微发烫。');
    eq(EVENTS.spring_pool.text, '石缝间渗出带着矿香的清泉，水底沉着几枚旧币。');
    eq(EVENTS.hollow_bag.text, '树根空腔里塞着前一位旅人落下的干瘪皮袋。');
    eq(Object.keys(EVENTS).length, 4);
  });

  // ---------- 整趟跑通 ----------
  t.test('假玩家随机打 40 趟：不报错；每趟都以撤离、阵亡或首领胜利结束；牌组 uid 不重复', () => {
    const outcomes = { retreat: 0, defeat: 0, victory: 0 };
    for (let s = 1; s <= 40; s++) {
      const trip = createTrip(s);
      const r = { rngState: s * 31 };
      let guard = 0;
      while (!trip.ended && guard++ < 40) {
        if (trip.gatePending) { gateChoose(trip, s % 4 === 0 ? 'retreat' : 'advance'); continue; }
        const ids = nextNodes(trip);
        assert.ok(ids.length, `没路可走 seed ${s} step ${trip.step}`);
        const node = enterNode(trip, ids[(s + guard) % ids.length]);
        if (isFight(node)) {
          const b = startBattle(trip, node);
          const ph = playBattle(b, r);
          if (ph === 'victory') {
            const res = winBattle(trip, node, b);
            if (res.loot) {
              const lt = takeLoot(trip, res.loot);
              if (lt.choice === 'seal') addSeal(trip, offerSeals(trip)[0]);
              else if (lt.choice === 'arcana') addArcana(trip, offerArcana(trip)[0]);
              else if (lt.choice === 'carve') { const c = gemCards(trip)[guard % 29]; applyCarve(trip, c.uid, carveOptions(c)[0]); }
            }
          } else loseBattle(trip);
        } else if (node.type === 'camp') campHeal(trip);
        else if (node.type === 'shop') { trip.gold += 200; for (const it of trip.shop) buy(trip, it); }
        else if (node.type === 'event') {
          const ev = EVENTS[node.eventId];
          for (const o of ev.options) if (optionCheck(trip, ev.id, o.id).ok) { chooseOption(trip, ev.id, o.id); break; }
        }
        if (!trip.ended) finishNode(trip);
      }
      assert.ok(trip.ended, `seed ${s} 没有结束`);
      outcomes[trip.ended.kind]++;
      eq(new Set(trip.deckCards.map(c => c.uid)).size, trip.deckCards.length);
      assert.ok(trip.player.handBase >= 3 && trip.player.handBase <= 5);
    }
    assert.ok(outcomes.defeat + outcomes.retreat + outcomes.victory === 40);
  });
}
