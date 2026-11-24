// 阶段 4 假玩家：从头跑一整趟（设计稿 10.4）。只用 battle-rules、run-rules、content，不碰画面。
// 用法：node tools/sim-run.js [--runs 300]
// 摸牌照第 4 版 5.1：先摸 2，不到 N 补到 N，回合开始最多 N + 2；有一组「攒牌」的假玩家，看攒牌是不是永远最好。
//
// 假玩家怎么走：每回合先用掉马上用的牌，再「自动帮排·最长」打出去；奖励挑第一个（加成挑跟已有路子对得上的）；
// 出口：心 ≤ 1 就走「回去」，否则往里走；歇脚先回心；事件挑第一个能选的。
// 看什么：每层每种仗几回合打完、掉几颗心、一趟走多深、死在哪、带回多少金币；再按「死一半」算 100 趟的金币。

import { createBattle } from '../modules/battle-rules/index.js';
import { createRun, settleRun } from '../modules/run-rules/index.js';
import { buildHeroLoadout, createRunContent, FREE_GEAR, HIDDEN_QUEST, QUEST_DEFS } from '../modules/content/index.js';

const ALL_QUESTS = { ...QUEST_DEFS, [HIDDEN_QUEST.id]: HIDDEN_QUEST };
import { SCHEMA_VERSION } from '../modules/shared/index.js';
import { createDefaultSave } from '../modules/save/index.js';

const args = process.argv.slice(2);
const runsIdx = args.indexOf('--runs');
const RUNS = runsIdx >= 0 ? Math.max(20, Number(args[runsIdx + 1]) || 300) : 300;
const PACK = createRunContent();

function playUsefulInstants(battle) {
  for (let g = 0; g < 12; g++) {
    const inst = battle.getSnapshot().hand.find((c) => !c.hidden && c.usage === 'instant');
    if (!inst) break;
    battle.playInstantCard(inst.uid);
  }
}

// 像真人：一半回合排到最好，一半回合只照手里的顺序排（设计稿 9.2 按「真人排到七成」算）
let HUMAN = false;
let humanTick = 0;
// 攒牌（5.1 第 4 版要看的）：手里没到 N + 2、怪也不是下回合就出手，就一张不打，攒着一把打
let HOARD = false;
// 试别的摸牌数：DRAW=1 OVER=1 node tools/sim-run.js
const DRAW_OVERRIDE = process.env.DRAW ? { drawPerTurn: Number(process.env.DRAW), handOverN: Number(process.env.OVER ?? 2) } : null;
function fight(packet) {
  if (DRAW_OVERRIDE) packet = { ...packet, rulesConfig: { ...packet.rulesConfig, ...DRAW_OVERRIDE } };
  const b = createBattle(packet);
  let out = null;
  for (let t = 0; t < 40 && !b.getResult(); t++) {
    playUsefulInstants(b);
    if (HOARD) {
      const snap = b.getSnapshot();
      const full = snap.hand.length >= snap.player.drawTarget + (DRAW_OVERRIDE?.handOverN ?? 2);
      const danger = snap.monsters.some((m) => m.alive !== false && m.countdown <= 1);
      if (!full && !danger) { out = b.commitChain(); continue; }
    }
    if (HUMAN && (humanTick++ % 2 === 1)) {
      for (const c of b.getSnapshot().hand) if (!c.hidden && c.usage === 'chain') b.queueCard(c.uid);
    } else b.autoArrange('longest');
    out = b.commitChain();
  }
  return b.getResult() || out?.result;
}

function choosePending(run, p) {
  const st = run.getState();
  switch (p.type) {
    case 'notice': return run.choose(null);
    case 'pick_card': return run.choose(p.options[0]);
    case 'pick_buff': return run.choose(p.options[0]);
    case 'enhance':
      if (p.step === 'dir') return run.choose(p.dirs[0]);
      return run.choose(st.player.deck.find((c) => c.kind === 'gem' && !c.enhanced && p.options.includes(c.uid) && c.gems.length >= 2)?.uid || p.options[0]);
    case 'remove': return run.choose(st.player.deck.find((c) => c.kind === 'junk' && p.options.includes(c.uid))?.uid ?? null);
    case 'rest': return run.choose((p.options.find((o) => o.id === 'heal' && !o.disabled) || p.options.find((o) => !o.disabled)).id);
    case 'event': return run.choose(p.options.find((o) => !o.disabled).id);
    default: return run.choose(null);
  }
}

/** 跑一趟。返回这一趟的记录 */
function playRun(seed, { equipped, quests = [], allies = [], returnAtLayer = 99 }) {
  const lo = buildHeroLoadout({ weapon: equipped.weapon || FREE_GEAR.weapon, armor: equipped.armor, trinket: equipped.trinket });
  const run = createRun({
    schemaVersion: SCHEMA_VERSION, seed, zoneId: 'forest',
    player: { stats: lo.stats, drawTarget: lo.drawTarget, hearts: lo.hearts, maxHearts: lo.maxHearts, gearTraits: lo.gearTraits, extraCards: [], buffs: [], allies },
    quests: quests.map((id) => ({ ...QUEST_DEFS[id], savedProgress: 0 })),
  }, PACK);
  const fights = [];
  for (let step = 0; step < 200 && !run.isEnded(); step++) {
    const s = run.getState();
    if (s.pending) { choosePending(run, s.pending); continue; }
    const c = s.clearing;
    if (c.hidden && !c.hidden.taken) { run.takeHidden(); continue; }
    const g = c.gathers.find((x) => !x.taken);
    if (g) { run.gather(g.id); continue; }
    if (c.findQuestId) { run.takeFindItem(); continue; }
    if (c.needsFight) {
      const res = fight(run.getBattlePacket());
      fights.push({ layer: c.layer, kind: c.kind === 'start' ? 'normal' : c.kind, pack: c.isPack, encounter: c.encounterId, turns: res.stats.turns, lost: res.stats.heartsLost, win: res.outcome === 'win', maxHit: res.stats.maxSingleHit });
      run.finishBattle(res);
      continue;
    }
    const exits = c.exits;
    const low = s.player.hearts <= 1;
    const ret = exits.find((e) => e.kind === 'return');
    const pick = (ret && (low || c.layer >= returnAtLayer)) ? ret : exits.find((e) => e.kind === 'gatekeeper') || exits.find((e) => e.kind !== 'return') || ret;
    run.chooseExit(pick.id);
  }
  return { ret: run.getReturnPacket(), fights, state: run.getState() };
}

const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');
const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const f1 = (x) => x.toFixed(2);

function report(title, setup) {
  const runs = [];
  for (let i = 0; i < RUNS; i++) runs.push(playRun(`sim-${title}-${i}`, setup));
  const fights = runs.flatMap((r) => r.fights);
  console.log(`\n## ${title}（${RUNS} 趟）`);
  const groups = {};
  for (const f of fights) {
    const k = `第 ${f.layer} 层 · ${f.kind === 'gatekeeper' ? '看门的' : f.kind === 'elite' ? '精英' : f.pack ? '一群' : '普通'}`;
    (groups[k] ||= []).push(f);
  }
  console.log('| 仗 | 打了几仗 | 赢 | 平均回合 | 平均掉心 | 最大一发（中位） |');
  console.log('|---|---|---|---|---|---|');
  for (const [k, fs] of Object.entries(groups).sort()) {
    const hits = fs.map((f) => f.maxHit).sort((a, b) => a - b);
    console.log(`| ${k} | ${fs.length} | ${pct(fs.filter((f) => f.win).length, fs.length)} | ${f1(avg(fs.map((f) => f.turns)))} | ${f1(avg(fs.map((f) => f.lost)))} | ${hits[Math.floor(hits.length / 2)] || 0} |`);
  }
  const dead = runs.filter((r) => r.ret.outcome === 'dead');
  const gate = runs.filter((r) => r.ret.stats.gatekeeperBeaten).length;
  const deadAt = {};
  dead.forEach((r) => { const k = `第 ${r.ret.stats.deepestLayer} 层`; deadAt[k] = (deadAt[k] || 0) + 1; });
  console.log(`- 活着回来 ${pct(runs.length - dead.length, runs.length)}，打倒看门的 ${pct(gate, runs.length)}；死在：${Object.entries(deadAt).map(([k, v]) => `${k} ${v}`).join('、') || '没死过'}`);
  console.log(`- 一趟平均走 ${f1(avg(runs.map((r) => r.ret.stats.clearings)))} 片、打 ${f1(avg(runs.map((r) => r.ret.stats.fights)))} 仗；带回金币 平均 ${Math.round(avg(runs.map((r) => r.ret.gold)))}`);
  return runs;
}

console.log('# 阶段 4 假玩家：整趟（森林外头区）');
console.log('假玩家：先用马上用的牌，自动帮排·最长；奖励挑第一个；心 ≤ 1 就回去，不然一路往里走到看门的。');

report('免费基础装（攻 40）', { equipped: { weapon: null, armor: null, trinket: null } });
report('C 级武器（攻 80）', { equipped: { weapon: 'gear_c_weapon_1', armor: null, trinket: null } });
report('C 级全套（攻 80 + 心 +1 + 增伤 15%）', { equipped: { weapon: 'gear_c_weapon_1', armor: 'gear_c_armor_2', trinket: 'gear_c_trinket_1' } });
report('C 级武器 + 刺客', { equipped: { weapon: 'gear_c_weapon_1', armor: null, trinket: null }, allies: ['ally_assassin_break'] });
HUMAN = true;
report('像真人（一半回合不排）· C 级武器', { equipped: { weapon: 'gear_c_weapon_1', armor: null, trinket: null } });
report('像真人（一半回合不排）· 免费基础装', { equipped: { weapon: null, armor: null, trinket: null } });
HUMAN = false;
HOARD = true;
report('攒牌（攒到 N + 2 张才打，怪要出手就打）· C 级武器', { equipped: { weapon: 'gear_c_weapon_1', armor: null, trinket: null } });
HOARD = false;
report('C 级武器，第 1 层打完就回去（C 级任务的走法）', { equipped: { weapon: 'gear_c_weapon_1', armor: null, trinket: null }, returnAtLayer: 1 });

// ───────── 金币：新手按「死一半」算 100 趟（设计稿 8.3、9.2）─────────
console.log('\n## 新手期的金币（100 趟，从新档起，真的结算进存档）');
function economy(label, policy) {
  let save = createDefaultSave();
  const golds = [save.gold];
  let deaths = 0;
  let submitted = 0;
  for (let i = 0; i < 100; i++) {
    // 装备：武器坏了、钱够就买回来
    if (!save.gear.equipped.weapon && save.gold >= 85 && policy.buyWeapon) {
      save.gold -= 85;
      save.gear.owned.push({ id: 'gear_c_weapon_1', wear: 7 });
      save.gear.equipped.weapon = 'gear_c_weapon_1';
    }
    const qs = ['q_c_hunt', 'q_c_gather', 'q_c_find'].slice(0, policy.quests);
    save.quests.taken = qs.map((id) => ({ id, progress: 0, done: false }));
    const allies = policy.hire && save.gold >= 30 ? ['ally_assassin_break'] : [];
    if (allies.length) save.gold -= 30;
    const { ret } = playRun(`eco-${label}-${i}`, { equipped: save.gear.equipped, quests: qs, allies, returnAtLayer: policy.returnAtLayer ?? 99 });
    save = settleRun(save, ret, PACK).save;
    if (ret.outcome === 'dead') deaths++;
    // 提交做完的
    for (const q of save.quests.taken.filter((x) => x.done)) { save.gold += ALL_QUESTS[q.id].reward; submitted++; }
    save.quests.taken = [];
    golds.push(save.gold);
  }
  console.log(`- ${label}：死了 ${deaths} 趟，交了 ${submitted} 个任务；金币 第 0 趟 ${golds[0]} → 第 10 趟 ${golds[10]} → 第 50 趟 ${golds[50]} → 第 100 趟 ${golds[100]}（平均每趟 ${f1((golds[100] - golds[0]) / 100)}）`);
}
economy('接 1 个任务、雇刺客、武器坏了买', { quests: 1, hire: true, buyWeapon: true });
economy('接满 3 个、雇刺客、武器坏了买', { quests: 3, hire: true, buyWeapon: true });
economy('免费装、不雇人、接 1 个', { quests: 1, hire: false, buyWeapon: false });
economy('接 1 个、雇刺客、第 1 层打完就回去', { quests: 1, hire: true, buyWeapon: true, returnAtLayer: 1 });
economy('免费装、不雇人、接 1 个、第 1 层打完就回去', { quests: 1, hire: false, buyWeapon: false, returnAtLayer: 1 });
