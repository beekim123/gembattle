// 第 2 步：秘术牌、雕琢、印记、新怪特性的规则单测。
import { make, slime, shielded, chain, cards, C, A, J, carved } from './helpers.js';
import {
  queueCard, previewChain, cast, playInstant, instantCheck, createRun, createBattle, resolveChain, setTarget,
} from '../index.js';
import { REL, ringBit, CONFIG } from '../../shared/index.js';
import { ENCOUNTERS, ENCOUNTER_IDS, ARCANA, SEALS, SEAL_IDS, LINES, CARVES } from '../../content/index.js';

export default function (t) {
  const { assert } = t;
  const eq = assert.equal;

  // ---------- 内容表 ----------
  t.test('内容表：8 张秘术牌（5 瞬发 + 3 入链）、10 个印记（5 条路子各 2 个）、4 种雕琢', () => {
    const ar = Object.values(ARCANA);
    eq(ar.length, 8);
    eq(ar.filter(a => a.kind === 'instant').length, 5);
    eq(ar.filter(a => a.kind === 'chain').length, 3);
    eq(SEAL_IDS.length, 10);
    for (const l of Object.keys(LINES)) eq(SEAL_IDS.filter(id => SEALS[id].line === l).length, 2, l);
    assert.deepEqual(Object.values(CARVES).map(c => c.name), ['锐切', '双晶', '碎甲', '溢彩']);
  });

  // ---------- 瞬发秘术 ----------
  t.test('瞬发秘术不能拖进链：queueCard 拒绝，走 playInstant', () => {
    const b = make([slime()], { hand: [A('surge'), '红'] });
    eq(queueCard(b, 0), false);
    eq(b.deck.chain.length, 0);
    eq(queueCard(b, 1), true);
  });
  t.test('涌泉抽牌：打出 1 张，补摸 1 张 + 额外摸 2 张（可超过回合上限）', () => {
    const b = make([slime()], { hand: [A('spring'), '红', '红', '红'] });
    const r = playInstant(b, 0);
    eq(r.ok, true);
    eq(b.deck.hand.length, 3 + 3);
    eq(b.deck.discard.some(c => c.arcana === 'spring'), true);
  });
  t.test('涌泉抽牌：手里最多 12 张', () => {
    const b = make([slime()], { hand: [A('spring'), ...Array(11).fill('红')] });
    playInstant(b, 0);
    eq(b.deck.hand.length, CONFIG.handMax);
  });
  t.test('护身结界：完整抵挡下一次攻击，只用一层', () => {
    const b = make([slime(1e6, { countdown: 1 })], { hand: [A('ward'), '红'] });
    playInstant(b, 0);
    eq(b.ward, 1);
    const r = cast(b);
    eq(b.player.hearts, 3, '被挡下，心不掉');
    assert.ok(r.events.find(e => e.type === 'attack' && e.blocked));
    eq(b.ward, 0);
    cast(b);                               // 只挡一次：下一次出手照扣
    eq(b.player.hearts, 2.5);
  });
  t.test('魔力沸腾：本回合所有宝石每发 +50%，下回合失效；两张叠加', () => {
    const b = make([slime()], { hand: [A('surge'), '红'] });
    playInstant(b, 0);
    chain(b, ['红']);
    eq(previewChain(b).total, Math.round(35 * 1.5));
    const b2 = make([slime()], { hand: [A('surge'), A('surge'), '红'] });
    playInstant(b2, 0); playInstant(b2, 0);
    chain(b2, ['红']);
    eq(previewChain(b2).total, 35 * 2);
    cast(b);
    eq(b.buff.surge, 0);
  });
  t.test('双色共鸣：点亮当前色左右相邻两色；没有当前色用不了', () => {
    const b = make([slime()], { hand: [A('resonance'), '红'] });
    eq(instantCheck(b, 0).ok, false);
    eq(playInstant(b, 0).ok, false);
    eq(b.deck.hand.length, 2, '没打出去，牌还在');
    b.color.cursor = C('黄'); b.color.collected = ringBit(C('黄'));
    const r = playInstant(b, 0);
    eq(r.ok, true);
    eq(b.color.collected, ringBit(C('黄')) | ringBit(C('红')) | ringBit(C('绿')));
  });
  t.test('双色共鸣：当前色是红，相邻是黄和紫（首尾相接）', () => {
    const b = make([slime()], { hand: [A('resonance')] });
    b.color.cursor = C('红'); b.color.collected = 0;
    playInstant(b, 0);
    eq(b.color.collected, ringBit(C('黄')) | ringBit(C('紫')));
  });
  t.test('震裂破甲：击碎目标 2 格护盾；碎完了就破盾并推迟倒计时', () => {
    const b = make([shielded(500, [2, 0, 0], { countdown: 3 })], { hand: [A('shatter')] });
    const r = playInstant(b, 0);
    eq(r.ok, true);
    assert.deepEqual(b.enemies[0].shield, [0, 0, 0]);
    eq(b.enemies[0].broken, true);
    eq(b.enemies[0].countdown, 4, '推迟 1 格');
    eq(b.turnFlags.broke, true);
  });
  t.test('震裂破甲：先削格数最多的颜色；没碎完不算破盾', () => {
    const b = make([shielded(500, [1, 3, 1])], { hand: [A('shatter')] });
    playInstant(b, 0);
    assert.deepEqual(b.enemies[0].shield, [1, 1, 1]);
    eq(b.enemies[0].broken, false);
  });
  t.test('震裂破甲：目标没有盾时用不了，牌留在手里', () => {
    const b = make([slime()], { hand: [A('shatter')] });
    eq(playInstant(b, 0).ok, false);
    eq(b.deck.hand.length, 1);
  });
  t.test('废牌：拖进链区直接丢掉，不补牌；不能入链', () => {
    const b = make([slime()], { hand: [J(), '红'] });
    eq(queueCard(b, 0), false);
    const r = playInstant(b, 0);
    eq(r.ok, true);
    eq(b.deck.hand.length, 1);
    eq(b.deck.discard.some(c => c.junk), true);
  });

  // ---------- 入链秘术 ----------
  t.test('逆色折射：不管前一张是什么色，都触发合白（全体再打一轮）', () => {
    const b = chain(make([slime(), slime()], { hand: [] }), ['红', A('refract')]);
    const p = previewChain(b);
    eq(p.steps[1].rel, REL.COMP);
    eq(p.waves, 1);
    assert.deepEqual(p.steps.map(s => s.mult), [1, 2]);
    // 折射是白色：红 1×1，白 3 颗×2，合白全体 3 色 ×2 打两只
    eq(p.total, 35 * (1 + 6) + 35 * 6 * 2);
  });
  t.test('逆色折射：放在第一张只是普通起色白牌；前一张是白也只算百搭', () => {
    const b = chain(make([slime()], { hand: [] }), [A('refract')]);
    eq(previewChain(b).steps[0].rel, REL.START);
    const b2 = chain(make([slime()], { hand: [] }), ['白', A('refract')]);
    eq(previewChain(b2).steps[1].rel, REL.WILD);
  });
  t.test('倍增棱镜：接链后倍率额外再 ×2 一次；摸到时定为红、绿、蓝其中一色', () => {
    const prism = { ...A('prism'), color: C('红') };
    const b = chain(make([slime()], { hand: [] }), ['红', prism]);
    const p = previewChain(b);
    assert.deepEqual(p.steps.map(s => s.mult), [1, 4]);
    for (let s = 1; s < 30; s++) {
      const bb = make([slime()], { seed: s, hand: [] });
      bb.deck.draw = [A('prism')]; bb.deck.hand = [];
      bb.deck.draw.push(...[]);
      cast(bb);
      const pr = [...bb.deck.hand, ...bb.deck.draw].find(c => c.arcana === 'prism');
      if (pr) assert.ok([0, 2, 4].includes(pr.color), '棱镜色在红绿蓝里');
    }
  });
  t.test('凝色留存：随机黄青紫；用了且回合末还留着牌，下回合手牌上限多 1', () => {
    const keep = { ...A('keep'), color: C('黄') };
    const b = make([slime()], { hand: [keep, '红', '红', '红'] });
    queueCard(b, 0);                       // 凝色入链，手里还剩 3 张
    cast(b);
    // N=3 上限 4，加上凝色留存临时 +1 = 5：留 3 张先摸 2 张 → 5 张
    eq(b.deck.hand.length, 5);
  });
  t.test('凝色留存：手里没牌留着就没有加成', () => {
    const keep = { ...A('keep'), color: C('黄') };
    const b = make([slime()], { hand: [keep] });
    queueCard(b, 0);
    cast(b);
    eq(b.deck.hand.length, 3);
  });

  // ---------- 宝石雕琢 ----------
  t.test('锐切：这张牌自己的每发 +50%，别的牌不变', () => {
    const b = chain(make([slime()], { hand: [] }), [carved('红', 'sharp'), '红']);
    const p = previewChain(b);
    // 红(锐切) 1 发 × 52.5→53；红 ×2 发 × 35
    eq(p.total, Math.round(35 * 1.5) + 2 * 35);
  });
  t.test('双晶：这张牌多算 1 颗宝石打发', () => {
    const b = chain(make([slime()], { hand: [] }), [carved('黄', 'twin')]);
    // 黄 = 红 + 绿，双晶多一颗红：3 颗宝石，起色 ×1
    eq(previewChain(b).shots, 3);
    const b2 = chain(make([slime()], { hand: [] }), ['红', carved('红', 'twin')]);
    eq(previewChain(b2).shots, 1 + 2 * 2);
  });
  t.test('碎甲：每颗宝石削 2 格；对没有该色的盾无效', () => {
    const b = chain(make([shielded(900, [3, 0, 3])], { hand: [] }), [carved('红', 'pierce')]);
    const p = previewChain(b);
    eq(p.shaved, 2);
    const b2 = chain(make([shielded(900, [0, 0, 3])], { hand: [] }), [carved('红', 'pierce')]);
    eq(previewChain(b2).shaved, 0);
  });
  t.test('溢彩：打出时顺带点亮相邻 1 色（先顺时针那一格）', () => {
    const b = chain(make([slime()], { hand: [] }), [carved('绿', 'overflow')]);
    const p = previewChain(b);
    eq(p.steps[0].collected, ringBit(C('绿')) | ringBit(C('青')));
    const b2 = chain(make([slime()], { hand: [] }), [carved('绿', 'overflow')]);
    b2.color.collected = ringBit(C('青'));
    eq(previewChain(b2).steps[0].collected, ringBit(C('青')) | ringBit(C('绿')) | ringBit(C('黄')));
  });
  t.test('溢彩帮忙集满：5 色 + 溢彩 = 彩虹', () => {
    const b = chain(make([slime()], { hand: [], seals: ['rainbow_bridge'] }), [carved('绿', 'overflow')]);
    b.color.collected = ringBit(C('红')) | ringBit(C('黄')) | ringBit(C('蓝')); // 红黄蓝 + 绿青 = 5 色
    eq(previewChain(b).rainbow, true);
  });

  // ---------- 印记 ----------
  t.test('碎甲白潮：本回合破过盾，链尾按最终倍率对全体追加一轮白色伤害', () => {
    const e = shielded(1e6, [1, 0, 0]);
    const with1 = chain(make([e, slime()], { hand: [], seals: ['shatter_tide'] }), ['红', '红']);
    const without = chain(make([e, slime()], { hand: [] }), ['红', '红']);
    const a = previewChain(with1), c = previewChain(without);
    eq(a.tide, true);
    assert.ok(a.total > c.total);
    // 追加一轮：红绿蓝各 mult(=2) 发 × 35 × 2 只怪，其中地精已破盾 ×1.5
    const extra = a.total - c.total;
    eq(extra, 3 * 2 * Math.round(35 * 1.5) + 3 * 2 * 35);
  });
  t.test('碎甲白潮：没破过盾就没有追加', () => {
    const b = chain(make([slime()], { hand: [], seals: ['shatter_tide'] }), ['红', '红']);
    eq(previewChain(b).tide, false);
  });
  t.test('碎甲白潮：震裂破甲先破了盾也算「本回合破过盾」', () => {
    const b = make([shielded(1e6, [2, 0, 0])], { hand: [A('shatter'), '红'], seals: ['shatter_tide'] });
    playInstant(b, 0);
    chain(b, ['红']);
    eq(previewChain(b).tide, true);
  });
  t.test('孤注破防：破盾易伤 ×2.25，但破盾不再推迟倒计时', () => {
    const mk = seals => chain(make([shielded(1e6, [1, 0, 0], { countdown: 3 })], { hand: [], seals }), ['红', '红']);
    const a = mk(['desperate']), c = mk([]);
    // 红 1 发打盾 ×0.75，破盾那张自己就吃易伤：红(第 2 张) 2 发
    const pa = previewChain(a), pc = previewChain(c);
    eq(pa.total, Math.round(35 * 2.25) * 2 + Math.round(35 * 0.75) * 0 + (pa.total - Math.round(35 * 2.25) * 2));
    assert.ok(pa.total > pc.total);
    cast(a); cast(c);
    eq(a.enemies[0].countdown, 2, '不推迟：3 - 1');
    eq(c.enemies[0].countdown, 3, '推迟 1 再减 1');
  });
  t.test('双重合白：每次合白的全体白色伤害多打一轮', () => {
    const mk = seals => chain(make([slime()], { hand: [], seals }), ['红', '青']);
    const a = previewChain(mk(['double_white'])), c = previewChain(mk([]));
    eq(a.waves, 1);
    eq(a.total - c.total, 3 * 2 * 35);
  });
  t.test('白潮余韵：本链触发合白后，下回合多摸 1 张且上限临时 +1', () => {
    const b = make([slime()], { hand: ['红', '青', '蓝', '蓝'], seals: ['white_echo'] });
    queueCard(b, 0); queueCard(b, 0);      // 红、青合白，手里留 2 张
    cast(b);
    // 留 2 张，摸 3 张 → 5 张（上限 N+1+1）
    eq(b.deck.hand.length, 5);
    // 没触发合白就没有
    const b2 = make([slime()], { hand: ['红', '红', '蓝', '蓝'], seals: ['white_echo'] });
    queueCard(b2, 0); queueCard(b2, 0);
    cast(b2);
    eq(b2.deck.hand.length, 4);
  });
  t.test('五彩虹桥：集齐 5 色即触发彩虹', () => {
    const b = chain(make([slime()], { hand: [], seals: ['rainbow_bridge'] }), ['红', '黄', '绿', '青', '蓝']);
    const p = previewChain(b);
    eq(p.rainbow, true);
    const b2 = chain(make([slime()], { hand: [] }), ['红', '黄', '绿', '青', '蓝']);
    eq(previewChain(b2).rainbow, false);
  });
  t.test('彩环常驻：开战随机点亮 3 色；彩虹后保留当前色与相邻色共 3 色', () => {
    const run = createRun(5); run.player.seals = ['ring_keep'];
    const b = createBattle(run, { id: 't', title: '', biome: 'forest', lesson: '', enemies: [slime()] }, 5);
    let n = 0; for (let i = 0; i < 6; i++) n += (b.color.collected >> i) & 1;
    eq(n, 3);
    b.deck.chain.push(...cards(['红', '黄', '绿', '青', '蓝']));
    b.color.collected = 0; b.color.cursor = -1;
    b.deck.chain.push(...cards(['紫']));
    const p = previewChain(b);
    eq(p.rainbow, true);
    const last = p.steps[p.steps.length - 1];
    eq(last.collected, ringBit(C('紫')) | ringBit(C('红')) | ringBit(C('蓝')));
  });
  t.test('宽裕行囊：回合开始手牌上限 N+2', () => {
    const b = make([slime()], { hand: ['红', '红', '红'], seals: ['wide_bag'] });
    cast(b);
    eq(b.deck.hand.length, 5);
    const b2 = make([slime()], { hand: ['红', '红', '红'] });
    cast(b2);
    eq(b2.deck.hand.length, 4);
  });
  t.test('蓄锋待发：回合末手里留牌，下回合链倍率从 ×2 起步', () => {
    const b = make([slime()], { hand: ['红', '红', '红'], seals: ['hold_edge'] });
    queueCard(b, 0);                       // 留 2 张
    cast(b);
    eq(b.startMult, 2);
    b.deck.chain.length = 0; b.deck.hand.length = 0; b.deck.hand.push(...cards(['红']));
    queueCard(b, 0);
    const p = previewChain(b);
    // 上回合末色是红，这张红接上：2 × 2
    eq(p.steps[0].mult, 4);
    cast(b);                               // 手里空着：下回合恢复 ×1
    eq(b.startMult, 1);
  });
  t.test('蓄锋待发：起色也从 ×2 开始', () => {
    const b = make([slime()], { hand: ['红'], seals: ['hold_edge'] });
    b.startMult = 2;
    queueCard(b, 0);
    eq(previewChain(b).steps[0].mult, 2);
  });
  t.test('越隙相连：每条链第 1 次断色也 ×2 且不清集色；第 2 次照旧', () => {
    const b = chain(make([slime()], { hand: [], seals: ['leap'] }), ['红', '绿', '红']);
    const p = previewChain(b);
    assert.deepEqual(p.steps.map(s => s.rel), [REL.START, REL.BREAK, REL.BREAK]);
    assert.deepEqual(p.steps.map(s => s.mult), [1, 2, 2]);
    eq(p.steps[1].collected, ringBit(C('红')) | ringBit(C('绿')), '第 1 次断色不清集色');
    eq(p.steps[2].collected, ringBit(C('红')), '第 2 次断色清空，只留本色');
  });
  t.test('连珠迭浪：链每多接 1 张，本回合所有宝石每发 +15%', () => {
    const b = chain(make([slime()], { hand: [], seals: ['chain_surge'] }), ['红', '红', '红']);
    const p = previewChain(b);
    const per = Math.round(35 * (1 + 0.15 * 2));
    eq(p.total, per * (1 + 2 + 4));
    const one = chain(make([slime()], { hand: [], seals: ['chain_surge'] }), ['红']);
    eq(previewChain(one).total, 35);
  });

  // ---------- 新怪的特性 ----------
  t.test('摇果长臂猿：集色不到 4 色时伤减半，满 4 色后恢复', () => {
    const g = { monster: 'earth6_long_arm', trait: 'gibbon', bars: [{ hp: 1e6, shield: null }], countdown: 4, hearts: 1 };
    const b = chain(make([g], { hand: [] }), ['红', '黄', '绿', '青']);
    const p = previewChain(b);
    // 红 ×1（集 1 色，半）、黄 ×2 两颗宝石（集 2 色，半）、绿 ×4（集 3 色，半）、青 ×8 两颗宝石（集 4 色，满伤）
    const half = Math.round(35 * 0.5);
    eq(p.total, half * 1 + half * 2 * 2 + half * 4 + 35 * 8 * 2);
  });
  t.test('摇果长臂猿：简单算——单张红打它只有一半', () => {
    const g = { monster: 'earth6_long_arm', trait: 'gibbon', bars: [{ hp: 1e6, shield: null }], countdown: 4, hearts: 1 };
    eq(previewChain(chain(make([g], { hand: [] }), ['红'])).total, Math.round(35 * 0.5));
    const b = make([g], { hand: [] }); b.color.collected = ringBit(0) | ringBit(1) | ringBit(2) | ringBit(3);
    eq(previewChain(chain(b, ['红'])).total, 35, '已集 4 色');
  });
  t.test('腹口懒兽：出手往弃牌堆塞 1 张缠藤废牌', () => {
    const s = { monster: 'earth1_belly_maw', trait: 'junk', bars: [{ hp: 1e6, shield: null }], countdown: 1, hearts: 1 };
    const b = make([s], { hand: ['红'] });
    const before = b.deck.discard.length;
    cast(b);
    eq(b.player.hearts, 2);
    eq(b.deck.discard.filter(c => c.junk).length, 1);
  });
  t.test('护壁挡住攻击时，腹口懒兽的废牌也塞不进来', () => {
    const s = { monster: 'earth1_belly_maw', trait: 'junk', bars: [{ hp: 1e6, shield: null }], countdown: 1, hearts: 1 };
    const b = make([s], { hand: ['红'] });
    b.ward = 1;
    cast(b);
    eq(b.deck.discard.filter(c => c.junk).length, 0);
    eq(b.player.hearts, 3);
  });
  t.test('五尾赤豹：两条血，每条都有 4 格绿盾；打空第 1 条换上新盾', () => {
    const enc = ENCOUNTERS.e_leopard;
    const b = make(enc.enemies, { hand: [] });
    const e = b.enemies[0];
    eq(e.barsTotal, 2); eq(e.hp, 580); assert.deepEqual(e.shield, [0, 4, 0]);
    e.hp = 1; e.shield = [0, 0, 0]; e.broken = true;
    b.deck.chain.push(...cards(['红']));
    cast(b);
    eq(e.bar, 1); eq(e.hp, 580); assert.deepEqual(e.shield, [0, 4, 0]); eq(e.broken, false);
  });
  t.test('千丈古树精：3 条血轮换双色盾；第 3 条血倒计时 3、出手扣 1 心', () => {
    const b = make(ENCOUNTERS.e_boss.enemies, { hand: [] });
    const e = b.enemies[0];
    eq(e.barsTotal, 3);
    assert.deepEqual(e.shield, [4, 4, 0]);
    eq(e.cdMax, 4); eq(e.attackHearts, 0.5);
    e.hp = 1; e.shield = [0, 0, 0];
    b.deck.chain.push(...cards(['红'])); cast(b);
    assert.deepEqual(e.shield, [0, 4, 4]); eq(e.bar, 1);
    e.hp = 1; e.shield = [0, 0, 0]; e.countdown = 4;
    b.deck.chain.push(...cards(['红'])); cast(b);
    assert.deepEqual(e.shield, [4, 0, 4]); eq(e.bar, 2);
    eq(e.cdMax, 3); eq(e.attackHearts, 1);
    assert.ok(e.countdown <= 3);
  });
  t.test('千丈古树精：第 1 条血不遮牌；第 2 条血起每回合遮住 1 张手牌', () => {
    const b = make(ENCOUNTERS.e_boss.enemies, { hand: [] });
    eq(b.maskedUid, null);
    const e = b.enemies[0];
    e.hp = 1; e.shield = [0, 0, 0];
    b.deck.chain.push(...cards(['红'])); cast(b);
    eq(e.bar, 1);
    assert.ok(b.maskedUid && b.deck.hand.some(c => c.uid === b.maskedUid), '遮住的是手里的牌');
    cast(b);
    assert.ok(b.maskedUid && b.deck.hand.some(c => c.uid === b.maskedUid));
  });
  t.test('遮牌只是不让你看见颜色：预览和结算仍按真实颜色算', () => {
    const b = make(ENCOUNTERS.e_boss.enemies, { hand: ['红', '蓝'] });
    b.enemies[0].bar = 1; b.maskedUid = b.deck.hand[0].uid;
    queueCard(b, 0);
    eq(previewChain(b).steps[0].color, C('红'));
  });

  // ---------- 8 场遭遇 ----------
  t.test('8 场遭遇的阵容、血、盾、倒计时照文档 3.4', () => {
    eq(ENCOUNTER_IDS.length, 8);
    const E = ENCOUNTERS;
    eq(E.e_slime.enemies[0].bars[0].hp, 420); eq(E.e_slime.enemies[0].countdown, 4);
    assert.deepEqual(E.e_sheep.enemies.map(x => x.bars[0].hp), [280, 280]);
    assert.deepEqual(E.e_sheep.enemies.map(x => x.countdown), [4, 5]);
    eq(E.e_goblin.enemies[0].bars[0].hp, 460); assert.deepEqual(E.e_goblin.enemies[0].bars[0].shield, [3, 0, 0]); eq(E.e_goblin.enemies[0].hearts, 1);
    eq(E.e_fairy.enemies[0].bars[0].hp, 620); assert.deepEqual(E.e_fairy.enemies[0].bars[0].shield, [0, 0, 3]); eq(E.e_fairy.biome, 'meadow');
    eq(E.e_leopard.enemies[0].bars.length, 2); eq(E.e_leopard.enemies[0].countdown, 3); eq(E.e_leopard.kind, 'elite');
    eq(E.e_gibbon.enemies[0].bars[0].hp, 950); assert.deepEqual(E.e_gibbon.enemies[0].bars[0].shield, [3, 3, 0]);
    eq(E.e_sloth.enemies[0].bars.length, 2); eq(E.e_sloth.enemies[0].bars[0].hp, 900); assert.deepEqual(E.e_sloth.enemies[0].bars[0].shield, [3, 0, 3]);
    eq(E.e_boss.enemies[0].bars.length, 3); assert.deepEqual(E.e_boss.enemies[0].bars.map(x => x.hp), [1100, 1100, 1100]);
    eq(E.e_boss.biome, 'canopy');
  });
}
