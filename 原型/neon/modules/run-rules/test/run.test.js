import test from 'node:test';
import assert from 'node:assert/strict';

import { SCHEMA_VERSION, validateBattleStartPacket } from '../../shared/index.js';
import { createRun, settleRun, statRewardText } from '../index.js';

// 假内容包：只够跑通规则
const gem = { defId: 'g_red', kind: 'gem', usage: 'chain', color: 'red', gems: ['red'], label: '红', description: '', effects: [] };
const fn = { defId: 'f_draw', kind: 'function', usage: 'instant', color: 'colorless', gems: [], label: '摸 2', description: '', effects: [{ timing: 'on_card_play', action: 'draw_cards', params: { count: 2 } }] };
const junk = { defId: 'junk', kind: 'junk', usage: 'chain', color: 'red', gems: [], label: '没用', description: '', effects: [] };
const monster = (hp) => ({ defId: 'mon_a', tier: 'normal', label: '怪', attackDamage: 0.5, initialCountdown: 4, bars: [{ maxHp: hp, shields: [{ color: 'red', max: 2 }], traits: [] }] });
const PACK = {
  zones: {
    forest: {
      id: 'forest', label: '林子', gatekeeper: 'gate',
      layers: {
        1: { clearings: [2, 2], hpScale: 1, eliteHpScale: 1, normal: ['e1'], pack: ['e1'], elite: ['e1'], kindWeights: { normal: 5, rest: 1, event: 1 }, goldPerFight: 10 },
        2: { clearings: [2, 2], hpScale: 2.5, eliteHpScale: 2, normal: ['e1'], pack: ['e1'], elite: ['e1'], kindWeights: { normal: 5 }, goldPerFight: 30 },
      },
      hiddenChance: 0.5, smallEventChance: 0.2, hiddenQuestChance: 0, hiddenGold: [10, 10],
      rewards: { stat: { attack: 15 }, gold: [20, 20], heal: 1, drawPlusMax: 2, drawPlusChance: 0, eliteBonusGold: 20 },
    },
  },
  cardDefs: { g_red: gem, f_draw: fn, junk },
  baseDeck: ['g_red', 'g_red', 'g_red', 'g_red', 'g_red', 'g_red'],
  functionCardList: [fn],
  functionEnhance: { f_draw: { params: { count: 3 }, label: '摸 3' } },
  junkCardId: 'junk',
  buffDefs: { b1: { id: 'b1', lane: 'break', label: '加成一', description: '', effects: [] }, b2: { id: 'b2', lane: 'white', label: '加成二', description: '', effects: [] } },
  buffList: [{ id: 'b1', lane: 'break' }, { id: 'b2', lane: 'white' }],
  allyDefs: { a1: { id: 'a1', role: 'support', mode: 'inject', label: '塞牌', description: '', deckCards: ['f_draw'], explore: { kind: 'rest_extra' }, effects: [] } },
  encounters: { e1: { monsters: [monster(1000)] }, gate: { monsters: [{ ...monster(5000), tier: 'gatekeeper' }] } },
  events: { ev1: { id: 'ev1', label: '事件', options: [{ label: '掉心拿金币', effects: [{ kind: 'lose_hearts', value: 5 }, { kind: 'gain_gold', value: 7 }] }, { label: '走开', effects: [] }] } },
  eventList: [{ id: 'ev1' }],
  hiddenQuest: null,
  gearDefs: { w1: { id: 'w1', slot: 'weapon', label: '武器', uses: 2 } },
  defaultRules: {},
};

const depart = (over = {}) => ({
  schemaVersion: SCHEMA_VERSION,
  seed: 'run-test',
  zoneId: 'forest',
  player: { stats: { attack: 80, damageBonus: 0, critRate: 0.1, critDamage: 1.5 }, drawTarget: 4, hearts: 3, maxHearts: 3, extraCards: ['f_draw'], buffs: [], allies: ['a1'] },
  quests: [{ id: 'q1', kind: 'hunt', layer: 1, count: 2, label: '打 2 仗', reward: 80 }],
  ...over,
});

const win = (hearts = 3) => ({
  outcome: 'win', remainingHearts: hearts, maxHearts: 3, gemLevels: { red: { level: 2, exp: 0 }, green: { level: 1, exp: 0 }, blue: { level: 1, exp: 0 } },
  defeatedMonsters: [{ uid: 'x', defId: 'mon_a', tier: 'normal' }], encounteredMonsters: ['mon_a'], deckChanges: { addedCards: [], removedCardUids: [] },
  stats: { turns: 2, rainbowCount: 0, maxChainLength: 3, heartsLost: 0, shieldBreaks: 1, totalDamage: 1000, maxSingleHit: 100 },
});

/** 把等着挑的东西都挑掉（每样挑第一个） */
function drain(run) {
  for (let i = 0; i < 20; i++) {
    const p = run.getState().pending;
    if (!p) return;
    if (p.type === 'notice') run.choose(null);
    else if (p.type === 'event' || p.type === 'rest') run.choose(p.options.find((o) => !o.disabled).id);
    else if (p.type === 'enhance' && p.step === 'dir') run.choose(p.dirs[0]);
    else run.choose(p.options[0]);
  }
}

test('第一片：一进去就要打，开战包合约定，队友塞的牌只进这一仗', () => {
  const run = createRun(depart(), PACK);
  const s = run.getState();
  assert.equal(s.clearing.kind, 'start');
  assert.equal(s.clearing.needsFight, true);
  const packet = run.getBattlePacket();
  const check = validateBattleStartPacket(packet);
  assert.ok(check.ok, check.errors.join('\n'));
  assert.equal(packet.player.deck.length, 6 + 1 + 1); // 宝石 + 带的功能牌 + 队友塞的
  assert.equal(s.player.deck.length, 7);
});

test('打赢：掉金币、任务进度、第一片给功能牌三选一，出口里一定有加成', () => {
  const run = createRun(depart(), PACK);
  run.finishBattle(win());
  let s = run.getState();
  assert.equal(s.gold.safe, 10);
  assert.equal(s.quests[0].have, 1);
  assert.equal(s.player.gemLevels.red.level, 2);
  assert.equal(s.pending.type, 'pick_card');
  run.choose('f_draw');
  drain(run);
  s = run.getState();
  assert.ok(s.clearing.exits.length >= 2);
  assert.ok(s.clearing.exits.some((e) => e.reward?.kind === 'buff'), '第一片的出口里要有加成');
  assert.equal(s.player.deck.filter((c) => c.defId === 'f_draw').length, 2);
});

test('一路走到看门的、回去：出层、第 2 层血 ×2.5、回来包带金币和任务', () => {
  const run = createRun(depart(), PACK);
  let sawLayer2 = false;
  let sawGate = false;
  for (let step = 0; step < 30 && !run.isEnded(); step++) {
    const s = run.getState();
    if (s.pending) { drain(run); continue; }
    if (s.clearing.needsFight) {
      const packet = run.getBattlePacket();
      if (s.clearing.layer === 2 && s.clearing.kind === 'normal') {
        sawLayer2 = true;
        assert.equal(packet.monsters[0].bars[0].maxHp, 2500);
      }
      if (s.clearing.kind === 'gatekeeper') sawGate = true;
      run.finishBattle(win());
      continue;
    }
    const exits = s.clearing.exits;
    const pick = exits.find((e) => e.kind === 'gatekeeper') || exits.find((e) => e.kind !== 'return') || exits[0];
    run.chooseExit(pick.id);
  }
  assert.ok(sawLayer2 && sawGate);
  assert.equal(run.isEnded(), true);
  const ret = run.getReturnPacket();
  assert.equal(ret.outcome, 'returned');
  assert.ok(ret.gold > 0);
  assert.equal(ret.quests[0].done, true);
});

test('死了：只剩每仗掉的金币，做完没交的任务算失败；事件扣心最多扣到剩半颗', () => {
  const run = createRun(depart(), PACK);
  run.finishBattle(win());
  drain(run);
  const s = run.getState();
  run.chooseExit(s.clearing.exits.find((e) => e.kind !== 'return').id);
  const lose = { ...win(0), outcome: 'lose', remainingHearts: 0 };
  // 第 2 片也打一仗再死
  if (run.getState().clearing.needsFight) run.finishBattle(lose);
  else run.debugEnd('dead');
  const ret = run.getReturnPacket();
  assert.equal(ret.outcome, 'dead');
  assert.equal(ret.gold, ret.goldDetail.safe);

  // 事件：扣 5 颗心也只扣到剩半颗
  const r2 = createRun(depart({ seed: 'ev' }), { ...PACK, zones: { forest: { ...PACK.zones.forest, hiddenChance: 0, smallEventChance: 1 } } });
  assert.equal(r2.getState().clearing.hidden.kind, 'event');
  r2.takeHidden();
  r2.choose('o0');
  assert.equal(r2.getState().player.hearts, 0.5);
});

test('结算：活着带回全部金币、做完的任务等着提交、装备磨 1 点、坏了就没了', () => {
  const save = { gold: 50, quests: { taken: [{ id: 'q1', progress: 0, done: false }], failed: [] }, gear: { owned: [{ id: 'w1', wear: 1 }], equipped: { weapon: 'w1', armor: null, trinket: null } }, album: { monsters: [] }, hired: ['a1'] };
  const ret = { outcome: 'returned', gold: 40, goldDetail: { safe: 20, risky: 20 }, quests: [{ id: 'q1', progress: 2, done: true }], encountered: ['mon_a'], stats: {} };
  const { save: next, lines } = settleRun(save, ret, PACK);
  assert.equal(next.gold, 90);
  assert.equal(next.quests.taken[0].done, true);
  assert.equal(next.gear.equipped.weapon, null);
  assert.deepEqual(next.hired, []);
  assert.deepEqual(next.album.monsters, ['mon_a']);
  assert.ok(lines.some((l) => l.includes('磨坏')));
  assert.equal(save.gold, 50, '不改传进来的存档');
});

test('事件 2（第 6 版）：自己挑一张牌强化，再塞一张没用的牌；没用的牌不在挑的里面', () => {
  const ev2 = { id: 'ev2', label: '挑一张强化', options: [{ label: '挑一张强化，收下没用的牌', effects: [{ kind: 'reward', reward: 'enhance' }, { kind: 'add_junk' }] }, { label: '走开', effects: [] }] };
  const run = createRun(depart({ seed: 'ev' }), { ...PACK, events: { ev2 }, eventList: [{ id: 'ev2' }], zones: { forest: { ...PACK.zones.forest, hiddenChance: 0, smallEventChance: 1 } } });
  const deckBefore = run.getState().player.deck.length;
  run.takeHidden();
  run.choose('o0');
  const p = run.getState().pending;
  assert.equal(p.type, 'enhance');
  assert.equal(p.step, 'card');
  const deck = run.getState().player.deck;
  assert.equal(deck.length, deckBefore + 1);
  const junkUid = deck.find((c) => c.defId === 'junk').uid;
  assert.ok(!p.options.includes(junkUid));
  run.choose(p.options[0]);
  run.choose(run.getState().pending.dirs[0]);
  assert.ok(run.getState().player.deck.find((c) => c.uid === p.options[0]).enhanced);
});

test('属性奖励能几项一起加（第 6 版：暴击率 +5% 带暴伤 +0.4）', () => {
  assert.equal(statRewardText({ critRate: 0.05, critDamage: 0.4 }), '暴击率 +5%，暴伤 +0.4');
  assert.equal(statRewardText({ attack: 15 }), '攻击 +15');
  const pack = { ...PACK, zones: { forest: { ...PACK.zones.forest, rewards: { ...PACK.zones.forest.rewards, stat: { critDamage: { critRate: 0.05, critDamage: 0.4 } } } } } };
  // 换几个种子找一个属性出口，走进去打赢，属性两项都加上
  for (let i = 0; i < 40; i++) {
    const run = createRun(depart({ seed: `stat-${i}` }), pack);
    run.finishBattle(win());
    drain(run);
    const ex = run.getState().clearing.exits.find((e) => e.reward?.kind === 'stat');
    if (!ex) continue;
    run.chooseExit(ex.id);
    if (run.getState().clearing.needsFight) run.finishBattle(win());
    drain(run);
    const st = run.getState().player.stats;
    assert.equal(st.critRate, 0.15);
    assert.equal(st.critDamage, 1.9);
    return;
  }
  assert.fail('40 个种子都没出属性出口');
});

