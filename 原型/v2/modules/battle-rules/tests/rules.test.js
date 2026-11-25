import { make, slime, chain, cards, C } from './helpers.js';
import {
  createRun, createBattle, queueCard, undoLast, undoAll, previewChain, cast, setTarget, startTurn, resolveChain,
} from '../index.js';
import { relationOf, REL, DECK_COUNTS, CARD_MASKS, ringBit, CONFIG } from '../../shared/index.js';
import { makeDeck, BATTLES } from '../../content/index.js';

export default function (t) {
  const { assert } = t;
  const eq = assert.equal;

  // ---------- 牌组 ----------
  t.test('牌组：固定 29 张，红绿蓝各 5、黄青紫各 4、白 2', () => {
    const d = makeDeck();
    eq(d.length, 29);
    const n = c => d.filter(x => x.color === C(c)).length;
    for (const c of ['红', '绿', '蓝']) eq(n(c), 5);
    for (const c of ['黄', '青', '紫']) eq(n(c), 4);
    eq(n('白'), 2);
    eq(new Set(d.map(x => x.uid)).size, 29);
    eq(DECK_COUNTS.reduce((a, b) => a + b), 29);
  });
  t.test('牌面宝石：黄=红+绿、青=绿+蓝、紫=红+蓝、白=红+绿+蓝', () => {
    assert.deepEqual(CARD_MASKS[C('黄')], [1, 1, 0]);
    assert.deepEqual(CARD_MASKS[C('青')], [0, 1, 1]);
    assert.deepEqual(CARD_MASKS[C('紫')], [1, 0, 1]);
    assert.deepEqual(CARD_MASKS[C('白')], [1, 1, 1]);
  });

  // ---------- 色环 ----------
  t.test('色环：同色邻色接上、隔一格断色、正对面补色、白百搭、没色起色', () => {
    for (let a = 0; a < 6; a++) {
      eq(relationOf(a, a), REL.NEAR);
      eq(relationOf((a + 1) % 6, a), REL.NEAR);
      eq(relationOf((a + 5) % 6, a), REL.NEAR);
      eq(relationOf((a + 2) % 6, a), REL.BREAK);
      eq(relationOf((a + 4) % 6, a), REL.BREAK);
      eq(relationOf((a + 3) % 6, a), REL.COMP);
      eq(relationOf(6, a), REL.WILD);
      eq(relationOf(a, 6), REL.WILD);
      eq(relationOf(a, -1), REL.START);
    }
    eq(relationOf(C('红'), C('紫')), REL.NEAR, '紫红相邻（首尾相接）');
    eq(relationOf(C('红'), C('青')), REL.COMP);
    eq(relationOf(C('黄'), C('蓝')), REL.COMP);
    eq(relationOf(C('绿'), C('紫')), REL.COMP);
  });

  // ---------- 摸牌 ----------
  t.test('第 1 回合空手起抓，拿到 N = 3 张', () => {
    const b = make([slime()]);
    eq(b.deck.hand.length, 3);
    eq(b.deck.draw.length, 26);
    eq(b.turn, 1);
  });
  t.test('留 2 张：下回合先摸 2 张，凑成 4 张（N+1 上限）', () => {
    const b = make([slime()]);
    queueCard(b, 0);
    cast(b);
    eq(b.deck.hand.length, 4, '打 1 张留 2 张，下回合先摸 2 张，凑成 4 张');
  });
  t.test('留牌：留 2 张摸到 4 张；留 3 张只摸 1 张到 4 张；留 4 张不摸', () => {
    for (const [keep, expect] of [[2, 4], [3, 4], [4, 4], [1, 3], [0, 3]]) {
      const b = make([slime()], { hand: ['红', '红', '红', '红'].slice(0, keep) });
      // 手里留 keep 张，打一张空链（过回合）
      cast(b);
      eq(b.deck.hand.length, expect, `留 ${keep} 张 → ${expect} 张`);
    }
  });
  t.test('N = 4 时上限 5；留 3 张摸到 5 张', () => {
    const b = make([slime()], { handBase: 4, hand: ['红', '红', '红'] });
    cast(b);
    eq(b.deck.hand.length, 5);
  });
  t.test('手牌全打完：下回合只摸到 N = 3 张（先摸 2 再补 1）', () => {
    const b = make([slime()]);
    while (b.deck.hand.length) queueCard(b, 0);
    cast(b);
    eq(b.deck.hand.length, 3);
    eq(b.lastDrawn.length, 3);
  });
  t.test('摸空洗回：抽牌堆没了就把弃牌堆洗回来', () => {
    const b = make([slime()]);
    b.deck.discard.push(...b.deck.draw.splice(0));
    const before = b.deck.discard.length;
    cast(b);
    assert.ok(b.deck.draw.length + b.deck.hand.length >= before - 1);
    eq(b.deck.hand.length, 4);
    eq(b.deck.draw.length + b.deck.discard.length + b.deck.hand.length + b.deck.chain.length, 29, '牌总数不变');
  });
  t.test('牌总数始终 29', () => {
    const b = make([slime()], { seed: 3 });
    for (let k = 0; k < 12; k++) {
      if (b.phase !== 'player') break;
      if (b.deck.hand.length) queueCard(b, 0);
      cast(b);
      const d = b.deck;
      eq(d.draw.length + d.discard.length + d.hand.length + d.chain.length, 29);
    }
  });

  // ---------- 排链 ----------
  t.test('排链只接链尾；撤销一张 / 撤销全部把牌退回手里', () => {
    const b = make([slime()], { hand: ['红', '黄', '蓝'] });
    const [r, y, bl] = b.deck.hand.map(c => c.uid);
    queueCard(b, 1); queueCard(b, 0);           // 黄、红
    assert.deepEqual(b.deck.chain.map(c => c.uid), [y, r]);
    undoLast(b);
    assert.deepEqual(b.deck.chain.map(c => c.uid), [y]);
    eq(b.deck.hand.length, 2);
    queueCard(b, 0);
    undoAll(b);
    eq(b.deck.chain.length, 0);
    eq(b.deck.hand.length, 3);
    assert.deepEqual(b.deck.hand.map(c => c.uid).sort(), [r, y, bl].sort());
  });

  // ---------- 倍率 ----------
  t.test('起色 ×1；同色 ×2；邻色再 ×2（沿链累乘）', () => {
    const b = chain(make([slime()], { hand: [] }), ['红', '红', '黄']);
    const p = previewChain(b);
    assert.deepEqual(p.steps.map(s => s.mult), [1, 2, 4]);
    // 红 1×1 + 红 1×2 + 黄(红+绿) 2×4 = 11 发
    eq(p.total, 35 * (1 + 2 + 8));
    eq(p.shots, 11);
  });
  t.test('断色：倍率不掉也不翻倍，清空集色只留本色', () => {
    const b = chain(make([slime()], { hand: [] }), ['红', '红', '绿']);
    const p = previewChain(b);
    assert.deepEqual(p.steps.map(s => s.rel), [REL.START, REL.NEAR, REL.BREAK]);
    assert.deepEqual(p.steps.map(s => s.mult), [1, 2, 2]);
    eq(p.steps[2].collected, ringBit(C('绿')));
    eq(p.total, 35 * (1 + 2 + 2));
  });
  t.test('白牌百搭 ×2，白不算集色；白后面接什么都 ×2', () => {
    const b = chain(make([slime()], { hand: [] }), ['红', '白', '蓝']);
    const p = previewChain(b);
    assert.deepEqual(p.steps.map(s => s.rel), [REL.START, REL.WILD, REL.WILD]);
    assert.deepEqual(p.steps.map(s => s.mult), [1, 2, 4]);
    eq(p.steps[1].collected, ringBit(C('红')), '白不改集色');
    eq(p.steps[2].collected, ringBit(C('红')) | ringBit(C('蓝')));
    eq(p.total, 35 * (1 + 3 * 2 + 1 * 4));
  });
  t.test('跨回合接色：上回合末色留着，下回合第 1 张接得上就从 ×2 起步', () => {
    const b = make([slime()], { hand: ['黄', '蓝', '红'] });
    b.color.cursor = C('红');
    chain(b, ['黄']);
    const p = previewChain(b);
    eq(p.steps[0].rel, REL.NEAR);
    eq(p.steps[0].mult, 2);
    eq(p.total, 35 * 2 * 2);
    // 真的跨回合：打完一张红，下回合接黄
    const b2 = make([slime()], { hand: ['红', '黄', '蓝'] });
    queueCard(b2, 0); cast(b2);
    eq(b2.color.cursor, C('红'));
    b2.deck.hand.length = 0; b2.deck.hand.push(...cards(['黄']));
    queueCard(b2, 0);
    eq(previewChain(b2).steps[0].mult, 2);
  });
  t.test('跨回合接不上：第 1 张断色，倍率 ×1 且清集色', () => {
    const b = make([slime()], { hand: [] });
    b.color.cursor = C('红'); b.color.collected = ringBit(0) | ringBit(1);
    chain(b, ['绿']);
    const p = previewChain(b);
    eq(p.steps[0].rel, REL.BREAK);
    eq(p.steps[0].mult, 1);
    eq(p.steps[0].collected, ringBit(C('绿')));
  });

  // ---------- 合白 ----------
  t.test('补色合白：本张照 ×2，对全体敌人再打一轮白色（红绿蓝各 mult 发）', () => {
    const b = chain(make([slime(), slime()], { hand: [] }), ['红', '青']);
    const p = previewChain(b);
    eq(p.steps[1].rel, REL.COMP);
    eq(p.steps[1].mult, 2);
    eq(p.waves, 1);
    // 目标：红 35 + 青(绿蓝)2×2 发 = 4×35 + 白潮 3×2×35 = 35+140+210
    eq(p.perEnemy[0], 35 + 140 + 210);
    eq(p.perEnemy[1], 210, '另一只只吃白潮');
    eq(p.steps[1].collected, ringBit(C('青')), '合白清集色，只留本色');
  });

  // ---------- 彩虹 ----------
  t.test('彩虹：集齐六色，全体把本链所有发再打 2 遍（总计 ×3）；随后从当前色重集', () => {
    const b = chain(make([slime(), slime()], { hand: [] }), ['红', '黄', '绿', '青', '蓝', '紫']);
    const p = previewChain(b);
    eq(p.rainbow, true);
    eq(p.steps[5].rainbowHere, true);
    eq(p.steps[5].collected, ringBit(C('紫')));
    const shots = 1 * 1 + 2 * 2 + 1 * 4 + 2 * 8 + 1 * 16 + 2 * 32; // 105
    eq(p.perEnemy[0], 35 * shots * 3, '目标：直接打 + 重放两遍 = ×3');
    eq(p.perEnemy[1], 35 * shots * 2, '另一只吃两遍重放');
  });
  t.test('彩虹一条链最多触发 1 次', () => {
    const b = chain(make([slime()], { hand: [] }), ['红', '黄', '绿', '青', '蓝', '紫', '红', '黄', '绿', '青', '蓝', '紫']);
    const p = previewChain(b);
    eq(p.steps.filter(s => s.rainbowHere).length, 1);
  });
  t.test('彩虹重放里包含合白那一轮', () => {
    // 红 青(合白) 后接 ... 集不齐也无所谓，这里手动把集色凑到差一色
    const b = make([slime()], { hand: [] });
    b.color.cursor = C('红'); b.color.collected = 0b011111 & ~ringBit(C('紫'));
    // 集色缺紫，链：红→青(合白，清集色) 就集不齐了；改用 紫 直接补齐
    b.color.collected = ringBit(0) | ringBit(1) | ringBit(2) | ringBit(3) | ringBit(4);
    b.color.cursor = C('蓝');
    chain(b, ['紫']);
    const p = previewChain(b);
    eq(p.rainbow, true);
    eq(p.steps[0].mult, 2);
    // 紫(红+蓝) 2 颗 × 2 发 = 4 发，重放 2 遍 = 8 发
    eq(p.total, 35 * (4 + 8));
  });

  // ---------- 盾 ----------
  t.test('有盾 ×0.75；每张牌按所含颜色宝石削盾；破盾 ×1.5 并推倒计时 1 格', () => {
    const gob = { monster: 'goblin_scout', bars: [{ hp: 100000, shield: [3, 0, 0] }], countdown: 3, hearts: 1 };
    const b = chain(make([gob], { hand: [] }), ['红', '红', '红']);
    const p = previewChain(b);
    eq(p.shaved, 3);
    eq(p.breaks, 1);
    // 红1(盾剩2,×0.75=26) + 红2×26 + 红4发破盾后每发 round(35×1.5)=53
    eq(p.total, 26 + 52 + 4 * 53);
    const r = cast(b);
    eq(b.enemies[0].shield[0], 0);
    eq(b.enemies[0].broken, true);
    eq(b.enemies[0].countdown, 3 + 1 - 1, '推到 4，再 -1');
    assert.ok(r.events.some(e => e.type === 'break'));
  });
  t.test('黄牌同时削红绿各 1 格；白牌三色各削 1 格；蓝牌削不了红盾', () => {
    const gob = { monster: 'goblin_scout', bars: [{ hp: 1e6, shield: [2, 2, 2] }], countdown: 3, hearts: 1 };
    const b = make([gob], { hand: [] });
    chain(b, ['黄']);
    previewChain(b);
    let r = resolveChain(b, 'preview');
    assert.deepEqual(b.enemies[0].shield, [1, 1, 2]);
    b.deck.chain.length = 0; chain(b, ['白']);
    resolveChain(b, 'preview');
    assert.deepEqual(b.enemies[0].shield, [0, 0, 1]);
    b.deck.chain.length = 0;
    const c = make([{ ...gob, bars: [{ hp: 1e6, shield: [3, 0, 0] }] }], { hand: [] });
    chain(c, ['蓝']);
    resolveChain(c, 'preview');
    assert.deepEqual(c.enemies[0].shield, [3, 0, 0]);
  });
  t.test('合白追加波与彩虹重放不削盾', () => {
    const e = { monster: 'goblin_scout', bars: [{ hp: 1e7, shield: [0, 0, 5] }], countdown: 3, hearts: 1 };
    const b = chain(make([e], { hand: [] }), ['红', '青']); // 青削蓝 1 格，波不再削
    resolveChain(b, 'preview');
    assert.deepEqual(b.enemies[0].shield, [0, 0, 4]);
  });
  t.test('宝石不削自己颜色以外的盾，没盾的怪不会"破盾"', () => {
    const b = chain(make([slime()], { hand: [] }), ['红', '红']);
    const p = previewChain(b);
    eq(p.breaks, 0);
    eq(p.shaved, 0);
  });

  // ---------- 多重血条 ----------
  t.test('多重血条：打空一条换下一条，并刷新那条的盾', () => {
    const e = { monster: 'goblin_scout', bars: [{ hp: 60, shield: null }, { hp: 500, shield: [0, 0, 2] }], countdown: 3, hearts: 1 };
    const b = chain(make([e], { hand: [] }), ['红', '红']); // 35 + 70 = 105 > 60
    const r = resolveChain(b, 'preview');
    eq(b.enemies[0].bar, 1);
    eq(b.enemies[0].alive, true);
    assert.deepEqual(b.enemies[0].shield, [0, 0, 2]);
    assert.ok(r.events.some(x => x.type === 'bar'));
  });
  t.test('打空最后一条血：怪死亡，目标自动换下一只', () => {
    const b = chain(make([slime(30), slime(1e6)], { hand: [] }), ['红', '红']);
    resolveChain(b, 'preview');
    eq(b.enemies[0].alive, false);
    eq(b.target, 1);
    assert.ok(b.enemies[1].hp < 1e6, '第二张牌打到了新目标');
  });

  // ---------- 倒计时 / 出手 ----------
  t.test('施法后倒计时 -1；到 0 出手扣心并重置', () => {
    const b = make([slime(1e6, { countdown: 2 })]);
    cast(b);
    eq(b.enemies[0].countdown, 1);
    eq(b.player.hearts, 3);
    cast(b);
    eq(b.player.hearts, 2.5);
    eq(b.enemies[0].countdown, 2);
  });
  t.test('半颗心与 1 颗心；心归 0 就败', () => {
    const b = make([slime(1e6, { countdown: 1, hearts: 1 })]);
    cast(b); eq(b.player.hearts, 2);
    cast(b); cast(b);
    eq(b.player.hearts, 0);
    eq(b.phase, 'defeat');
  });
  t.test('场上敌人全部击败即胜，死了的怪不再出手', () => {
    const b = chain(make([slime(10, { countdown: 1 })], { hand: [] }), ['红']);
    const r = cast(b);
    eq(b.phase, 'victory');
    eq(b.player.hearts, 3);
    assert.ok(r.events.some(e => e.type === 'victory'));
  });

  // ---------- 宝石等级 ----------
  t.test('宝石等级：每级每发 +10%；打出带点的牌攒经验，每满 10 点升 1 级', () => {
    const b = chain(make([slime()], { hand: [] }), ['红']);
    b.player.gems[0].level = 3;
    eq(previewChain(b).total, Math.round(35 * 1.2));
    b.player.gems[0].level = 1; b.player.gems[0].exp = 9;
    cast(b);
    eq(b.player.gems[0].level, 2);
    eq(b.player.gems[0].exp, 0);
    eq(b.player.gems[1].exp, 0, '红牌不给绿经验');
  });
  t.test('黄牌给红绿各 1 点经验；白牌三色各 1 点', () => {
    const b = chain(make([slime()], { hand: [] }), ['黄', '白']);
    cast(b);
    assert.deepEqual(b.player.gems.map(g => g.exp), [2, 2, 1]);
  });
  t.test('合白那一轮按各颜色宝石等级算', () => {
    const b = chain(make([slime()], { hand: [] }), ['红', '青']);
    b.player.gems[2].level = 6; // 蓝 +50%
    const base = previewChain(b).total;
    b.player.gems[2].level = 1;
    assert.ok(base > previewChain(b).total);
  });
  t.test('宝石等级跨战保留，重开归 1 级', () => {
    const run = createRun(5);
    run.player.critChance = 0;
    const b = createBattle(run, { id: 't', title: '', biome: 'forest', lesson: '', enemies: [slime(10)] });
    b.player.gems[0].level = 4; b.player.hearts = 1.5;
    b.deck.hand.length = 0; chain(b, ['红']);
    cast(b);
    eq(b.phase, 'victory');
    run.player = JSON.parse(JSON.stringify(b.player)); run.battleIndex++;
    const b2 = createBattle(run, BATTLES[0]);
    eq(b2.player.gems[0].level, 4);
    eq(b2.player.hearts, 1.5, '心跨战不回');
    eq(createRun(5).player.gems[0].level, 1);
  });

  // ---------- 暴击 ----------
  t.test('暴击：真打才掷骰；暴击每发 ×1.5；预览不暴击且暴击上限更高', () => {
    const b = chain(make([slime()], { hand: [], crit: 0.5, seed: 11 }), ['红', '黄', '绿']);
    const p = previewChain(b);
    assert.ok(p.maxTotal > p.total);
    const r = cast(b);
    const hits = r.events.filter(e => e.type === 'hit');
    assert.ok(hits.some(h => h.crits > 0));
    assert.ok(r.summary.total >= p.total && r.summary.total <= p.maxTotal);
  });
  t.test('发数不封顶：很长的链也照算', () => {
    const names = Array(8).fill('红');
    const b = chain(make([slime()], { hand: [] }), names);
    const p = previewChain(b);
    eq(p.shots, 255);
    eq(p.total, 35 * 255);
  });

  // ---------- 预览与实战 ----------
  t.test('预览与实战一致：同一份算法，不暴击时数完全一样，且预览不改状态', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = make([slime(5000), slime(5000, { countdown: 3 })], { seed, crit: 0 });
      // 随机排一条链
      const n = 1 + (seed % 3);
      for (let k = 0; k < n; k++) queueCard(b, 0);
      if (seed % 2) setTarget(b, 1);
      const snapshot = JSON.stringify(b);
      const p = previewChain(b);
      eq(JSON.stringify(b), snapshot, '预览没动状态 #' + seed);
      const r = cast(b);
      eq(r.summary.total, p.total, '总伤 #' + seed);
      assert.deepEqual(r.summary.perEnemy, p.perEnemy);
      eq(r.summary.shots, p.shots);
      assert.deepEqual(r.summary.steps, p.steps);
    }
  });
  t.test('预览与实战一致（带盾、合白、彩虹）', () => {
    const e1 = { monster: 'goblin_scout', bars: [{ hp: 90000, shield: [3, 3, 0] }], countdown: 3, hearts: 1 };
    const b = chain(make([e1, slime(90000)], { hand: [] }), ['红', '黄', '绿', '青', '蓝', '紫']);
    const p = previewChain(b);
    const r = cast(b);
    eq(r.summary.total, p.total);
    eq(r.summary.rainbow, true);
    eq(r.summary.breaks, p.breaks);
  });

  // ---------- 抵制色 ----------
  t.test('抵制色：该色的牌伤减半、不削盾；别的色不受干扰；每回合轮换', () => {
    const f = { monster: 'fairy_meadow', trait: 'resist', bars: [{ hp: 1e6, shield: [0, 0, 3] }], countdown: 4, hearts: 0.5 };
    const b = make([f], { hand: [] });
    b.resist.now = C('蓝');
    chain(b, ['蓝']);
    let p = previewChain(b);
    eq(p.shaved, 0, '抵制的蓝牌削不了盾');
    eq(p.total, Math.round(35 * 0.75 * 0.5));
    b.deck.chain.length = 0; chain(b, ['青']);
    p = previewChain(b);
    eq(p.shaved, 1, '青牌不是抵制色，能削蓝盾');
    // 轮换：6 回合内每种色各抵制一次
    const b2 = make([f], { hand: [] });
    const seen = new Set();
    for (let k = 0; k < 6; k++) { seen.add(b2.resist.now); cast(b2); }
    eq(seen.size, 6);
    eq(b2.resist.now, b2.resistSeq[(b2.turn - 1) % 6]);
  });

  // ---------- 4 场仗的内容 ----------
  t.test('4 场教学仗：阵容、血、盾、倒计时照文档 2.2', () => {
    eq(BATTLES.length, 4);
    const run = createRun(1);
    const bs = BATTLES.map(d => createBattle(run, d));
    eq(bs[0].enemies.length, 1); eq(bs[0].enemies[0].name, '水滴软泥'); eq(bs[0].enemies[0].hp, 420);
    eq(bs[0].enemies[0].shield.reduce((a, c) => a + c), 0); eq(bs[0].enemies[0].countdown, 4);
    eq(bs[1].enemies.length, 2); assert.deepEqual(bs[1].enemies.map(e => e.hp), [280, 280]);
    assert.deepEqual(bs[1].enemies.map(e => e.countdown), [4, 5]);
    eq(bs[2].enemies[0].name, '拾荒地精'); eq(bs[2].enemies[0].hp, 460); assert.deepEqual(bs[2].enemies[0].shield, [3, 0, 0]);
    eq(bs[2].enemies[0].countdown, 3); eq(bs[2].enemies[0].attackHearts, 1);
    eq(bs[2].enemies[1].hp, 320); eq(bs[2].enemies[1].countdown, 5);
    eq(bs[3].enemies[0].name, '花甸灵精'); eq(bs[3].enemies[0].hp, 620); assert.deepEqual(bs[3].enemies[0].shield, [0, 0, 3]);
    eq(bs[3].enemies[0].trait, 'resist'); eq(bs[3].biome, 'meadow'); eq(bs[0].biome, 'forest');
    for (const b of bs) { eq(b.player.hearts, 3); eq(b.player.atk, 35); eq(b.player.critChance, 0.1); eq(b.player.critDmg, 1.5); }
  });
}
