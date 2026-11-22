'use strict';
// 一仗的规则（见 设计.md「战斗」）：摸牌由少到多、没打的牌留着；按色环接链，倍率每次施法从 ×1 起。
// 色环序号：0 红 1 黄 2 绿 3 青 4 蓝 5 紫 6 白；宝石位：1 红 2 绿 4 蓝（黄 = 红+绿，青 = 绿+蓝，紫 = 红+蓝，白 = 全有）。
const R = {
  hearts: 4, handMax: 10, drawFirst: 2, drawMax: 6,   // 第 1 回合摸 2 张，之后每回合 +1，封顶 6
  points: 100, upPoints: 2.5,                          // 宝石牌每发的点数；强化后 ×2.5
  link: 2, rainbowLink: 3, boostLink: 2,               // 接上 / 合白 ×2；彩虹后 ×3；垫脚让下一次再 ×2
  critChance: .1, critMul: 2,
  gemGrowth: 1.5, gemStep: 8,                          // 宝石每级该色 ×1.5；Lv n → n+1 要打出 8n 发
  beans: 8, beansUp: 12, beanPts: 25, bloom: 3, bloomPart: .3,
  lootCount: 3,
};
const MASKS = [1, 3, 2, 6, 4, 5, 7];
const HUES = ['红', '黄', '绿', '青', '蓝', '紫', '白'];
const GEM_NAMES = ['红', '绿', '蓝'];
const hueOfMask = m => MASKS.indexOf(m);
const bits = m => (m & 1) + (m >> 1 & 1) + (m >> 2 & 1);

// ---------- 牌 ----------
// 牌的 id：宝石牌 'g<色>[:<词>]'（如 'g3:垫脚'），无色牌就是名字键（如 'lens'）；强化过的末尾加 '+'。
const SPELLS = {
  block: { name: '挡一下', instant: true, text: u => u ? '挡下怪的下一次攻击，再摸 1 张' : '挡下怪的下一次攻击' },
  lens: { name: '放大镜', text: u => `倍率 ×${u ? 4 : 3}` },
  parrot: { name: '学舌', text: u => u ? '把上一张宝石牌再打两遍' : '把上一张宝石牌再打一遍' },
  contra: { name: '唱反调', text: u => '变成上一张的补色，一定合白' + (u ? '；点数 ×2.5' : '') },
  beans: { name: '撒豆', text: u => `打 ${u ? R.beansUp : R.beans} 发豆子，每发 ${R.beanPts} 点 × 倍率` },
  draw: { name: '摸牌', instant: true, text: u => `马上摸 ${u ? 3 : 2} 张` },
  stall: { name: '打岔', instant: true, text: u => `怪的倒计时 +${u ? 2 : 1}` },
  family: { name: '全家福', rare: true, text: u => '马上凑齐六色：从此每接一张 ×3' + (u ? '；倍率再 ×2' : '') },
  spore: { name: '孢子', junk: true, text: () => '没用，打出去就没了' },
};
const TAGS = { 双响: '打两遍', 垫脚: '下一张接上时 ×4', 开花: '每发再炸出 3 发小的', 稳: '断链时不回 ×1，只减半' };

function makeCard(id) {
  const up = id.endsWith('+'), base = up ? id.slice(0, -1) : id;
  if (base[0] === 'g') {
    const [h, tag = null] = base.slice(1).split(':'), col = +h, mask = MASKS[col];
    const pts = R.points * (up ? R.upPoints : 1);
    const gems = [0, 1, 2].filter(j => mask >> j & 1).map(j => GEM_NAMES[j]).join('');
    let text = `打出 ${bits(mask)} 发（${gems}），每发 ${pts} 点`;
    if (col === 6) text += '，跟谁都接';
    if (tag) text += '；' + TAGS[tag];
    return { id, key: 'gem', kind: 'gem', col, mask, tag, up, pts, name: HUES[col] + (tag ? '·' + tag : '') + (up ? '+' : ''), text };
  }
  const s = SPELLS[base];
  return { id, key: base, kind: 'spell', col: -1, mask: 0, tag: null, up, pts: 0, instant: !!s.instant, junk: !!s.junk, rare: !!s.rare, name: s.name + (up ? '+' : ''), text: s.text(up) };
}
const START_DECK = ['g0', 'g0', 'g2', 'g2', 'g4', 'g4', 'g1', 'g3', 'g5', 'g6', 'block', 'block'];
const startDeck = () => START_DECK.map(makeCard);

// ---------- 怪 ----------
// cd：倒计时（每回合结束减一，到 0 出手后回满）；atk：打掉几颗心（半颗为单位）；hpMul：同一段里比提可血厚多少；
// wisp：林子里那团鬼火的颜色。模型和动作见 monsters.js 的 LOOKS。
const MONSTERS = {
  tiko: { name: '提可', hp: 2000, hpMul: 1, cd: 3, atk: .5, trait: 'flutter', traitName: '扑闪', traitText: '每次施法的第一发躲开', wisp: [110, 150, 255] },
  dasan: { name: '打伞的', hp: 2400, hpMul: 1.2, cd: 3, atk: .5, trait: 'spore', traitName: '抖伞', traitText: '每回合往你的牌堆里抖一张「孢子」（没用，还占手牌）', wisp: [178, 214, 150] },
  laodun: { name: '老墩', hp: 15e4, hpMul: 1, cd: 3, atk: 1, trait: 'roots', roots: .06, traitName: '扎根', traitText: '每回合长满一圈根须，先替它挡伤害；一次施法打不穿根须，就伤不到它', wisp: [255, 120, 84] },
};
const ELITE = { hp: 3, atk: .5 };   // 精英「凶·××」：血 ×3（world.js 摆鬼火时乘好），攻击多半颗心

// ---------- 零碎：以前走丢的人落下的东西，捡到了这一趟一直有用 ----------
const RELICS = {
  mitten: { name: '毛线手套', text: '每回合多摸 1 张', note: '只有左手那只，还潮乎乎的' },
  watch: { name: '慢表', text: '怪开局的倒计时 +1', note: '一天慢半个钟头，没人去拨它' },
  shard: { name: '白瓷片', text: '合白补的那三发白光 ×5', note: '碗沿上磕下来的，描着一道蓝边' },
  redstring: { name: '红头绳', text: '红色每发 ×2', note: '扎辫子的，打了个死结' },
  greenglass: { name: '绿玻璃', text: '绿色每发 ×2', note: '汽水瓶底，对着亮处看是绿的' },
  blueink: { name: '蓝墨水', text: '蓝色每发 ×2', note: '半瓶，盖子拧不开' },
  tape: { name: '胶布', text: '断链时倍率不回 ×1，只减半', note: '缠了好几圈，撕不下来' },
  dice: { name: '灌铅骰子', text: '暴击率 +15%', note: '怎么扔都是六点' },
  candy: { name: '水果糖', text: '每打赢一仗回半颗心', note: '一兜子，糖纸都粘在一块儿了' },
  coat: { name: '厚棉袄', text: '心的上限 +1，捡到时回 1 颗', note: '大人的，袖子长出一截' },
};
const RELIC_KEYS = Object.keys(RELICS);
const hasRelic = (run, k) => run.relics.includes(k);
const GEM_RELIC = ['redstring', 'greenglass', 'blueink'];
const relicGemMul = (run, j) => j >= 0 && hasRelic(run, GEM_RELIC[j]) ? 2 : 1;
// 从还没有的零碎里随机挑 n 件
function relicChoices(run, n) { return shuffle(RELIC_KEYS.filter(k => !hasRelic(run, k)), run.rng).slice(0, n); }
function gainRelic(run, k) {
  if (!k || hasRelic(run, k)) return;
  run.relics.push(k);
  if (k === 'coat') { run.maxHearts += 1; run.hearts = Math.min(run.maxHearts, run.hearts + 1); }
}

// ---------- 数字 ----------
const CN_UNITS = ['', '万', '亿', '兆', '京', '垓', '秭', '穰', '沟', '涧', '正', '载'];
// 一万以下写全；以上留三位有效数字：1.28万、12.8万、128万、1280万、1.28亿……
function fmt(value) {
  const n = Math.max(0, Math.round(Number(value) || 0));
  if (n < 10000) return String(n);
  let x = n, u = 0;
  while (x >= 10000 && u < CN_UNITS.length - 1) { x /= 10000; u++; }
  let s = x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : String(Math.floor(x));
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  return s + CN_UNITS[u];
}

// ---------- 一局 ----------
function newRun(seed) {
  return { seed, rng: rngFrom(seed), deck: startDeck(), hearts: R.hearts, maxHearts: R.hearts,
    gems: [0, 1, 2].map(() => ({ level: 1, exp: 0 })), relics: [], wins: 0, bestHit: 0, bestCast: 0 };
}
const gemPow = (run, j) => j < 0 ? 1 : R.gemGrowth ** (run.gems[j].level - 1);
const gemNeed = level => R.gemStep * level;

// ---------- 一仗 ----------
const drawCount = (run, turn) => Math.min(R.drawMax, R.drawFirst + turn - 1) + (hasRelic(run, 'mitten') ? 1 : 0);
// 血量取个整：留三位有效数字（至少到百位），显示出来好看
const niceHp = v => { const p = 10 ** Math.max(2, Math.floor(Math.log10(Math.max(1, v))) - 2); return Math.max(100, Math.round(v / p) * p); };
// spec：{ kind, hp?, atk?, cd?, name?, guard?, elite? }——鬼火身上带着，见 world.js placeWisps
function startFight(run, spec) {
  const base = MONSTERS[spec.kind], hp = niceHp(spec.hp || base.hp);
  const mon = { ...base, name: spec.name || base.name, atk: spec.atk ?? base.atk, cd: spec.cd ?? base.cd, guard: !!spec.guard, elite: !!spec.elite, maxHp: hp, hp };
  if (mon.elite) { mon.name = '凶·' + mon.name; mon.atk += ELITE.atk; }
  mon.countdown = mon.cd + (hasRelic(run, 'watch') ? 1 : 0);
  mon.rootMax = base.roots ? niceHp(hp * base.roots) : 0; mon.roots = mon.rootMax;   // 老墩的根须
  const b = { kind: spec.kind, mon, turn: 1,
    hand: [], line: [], draw: shuffle(run.deck.map(c => ({ ...c })), run.rng), discard: [], gone: [],
    shield: 0, rng: run.rng, gemExp: [0, 0, 0] };
  drawCards(b, drawCount(run, 1));
  return b;
}
// 摸牌：手满了就不摸（留在牌堆里）；牌堆空了把弃牌洗回去
function drawCards(b, n) {
  const got = [];
  for (let i = 0; i < n && b.hand.length < R.handMax; i++) {
    if (!b.draw.length) { if (!b.discard.length) break; b.draw = shuffle(b.discard.splice(0), b.rng); }
    const c = b.draw.pop(); b.hand.push(c); got.push(c);
  }
  return got;
}
function queueCard(b, i) { const c = b.hand[i]; if (!c || c.instant) return false; b.line.push(b.hand.splice(i, 1)[0]); return true; }
function unqueueCard(b, i) { const c = b.line[i]; if (!c) return false; b.line.splice(i, 1); b.hand.push(c); return true; }
function unqueueAll(b) { if (!b.line.length) return false; b.hand.push(...b.line.splice(0)); return true; }
// 马上用的牌（挡一下、摸牌、打岔）
function playInstant(run, b, i) {
  const c = b.hand[i]; if (!c || !c.instant) return null;
  b.hand.splice(i, 1); b.discard.push(c);
  const drawn = [];
  if (c.key === 'block') { b.shield++; if (c.up) drawn.push(...drawCards(b, 1)); }
  if (c.key === 'draw') drawn.push(...drawCards(b, c.up ? 3 : 2));
  if (c.key === 'stall') b.mon.countdown += c.up ? 2 : 1;
  return { card: c, drawn };
}

function relationOf(mask, last) {
  if (!last) return '起手';
  if (mask & last) return '接上';
  if ((mask | last) === 7) return '合白';
  return '断';
}
// 排好的链 → 每张牌的结果：跟上一张的关系、打完这张时的倍率、打出去的每一发（不含暴击）。
function plan(run, b, cards = b.line) {
  let mult = 1, last = 0, lastGem = null, lamps = 0, rainbow = false, boost = 1, total = 0;
  const states = [];
  for (const raw of cards) {
    let c = raw;
    if (raw.key === 'contra') {   // 唱反调：变成上一张的补色（没有上一张就当白）
      const m = last ? 7 & ~last : 7;
      c = { ...raw, kind: 'gem', mask: m, col: hueOfMask(m), pts: R.points * (raw.up ? R.upPoints : 1) };
    }
    const st = { card: raw, as: c, rel: '', mult: 1, shots: [], total: 0, rainbowNow: false };
    if (c.kind === 'gem') {
      const m = c.mask, rel = relationOf(m, last);
      if (rel === '接上' || rel === '合白') { mult *= (rainbow ? R.rainbowLink : R.link) * boost; boost = 1; }
      else if (rel === '断') { mult = c.tag === '稳' || hasRelic(run, 'tape') ? Math.max(1, mult / 2) : 1; lamps = 0; rainbow = false; boost = 1; }
      st.rel = rel;
      if (c.col >= 0 && c.col < 6) lamps |= 1 << c.col;
      const rep = c.tag === '双响' ? 2 : 1;
      for (let k = 0; k < rep; k++) for (let j = 0; j < 3; j++) if (m >> j & 1) st.shots.push({ gem: j, pts: c.pts });
      if (rel === '合白') for (let j = 0; j < 3; j++) st.shots.push({ gem: j, pts: c.pts * (hasRelic(run, 'shard') ? 5 : 1), white: true });
      if (c.tag === '开花') {
        const extra = [];
        for (const s of st.shots) for (let k = 0; k < R.bloom; k++) extra.push({ gem: s.gem, pts: s.pts * R.bloomPart, small: true });
        st.shots.push(...extra);
      }
      if (!rainbow && lamps === 63) { rainbow = true; st.rainbowNow = true; }
      if (c.tag === '垫脚') boost = R.boostLink;
      last = m; lastGem = st;
    } else if (c.key === 'lens') { mult *= c.up ? 4 : 3; st.rel = '放大'; }
    else if (c.key === 'parrot') {
      st.rel = '学舌';
      if (lastGem) for (let k = 0; k < (c.up ? 2 : 1); k++) for (const s of lastGem.shots) st.shots.push({ gem: s.gem, pts: s.pts, white: s.white, small: s.small });
    } else if (c.key === 'beans') {
      st.rel = '撒豆';
      for (let k = 0; k < (c.up ? R.beansUp : R.beans); k++) st.shots.push({ gem: -1, pts: R.beanPts, bean: true });
    } else if (c.key === 'family') {
      st.rel = '全家福'; lamps = 63;
      if (!rainbow) { rainbow = true; st.rainbowNow = true; }
      if (c.up) mult *= 2;
    } else st.rel = c.junk ? '没用' : '';
    st.mult = mult; st.lamps = lamps; st.rainbow = rainbow; st.boost = boost;
    for (const s of st.shots) { s.dmg = Math.round(s.pts * mult * gemPow(run, s.gem) * relicGemMul(run, s.gem)); st.total += s.dmg; }
    total += st.total;
    states.push(st);
  }
  if (b.mon.trait === 'flutter') {   // 提可：每次施法第一发躲开
    for (const st of states) if (st.shots.length) { const s = st.shots[0]; s.dodge = true; st.total -= s.dmg; total -= s.dmg; break; }
  }
  return { states, mult, lamps, rainbow, total, roots: b.mon.roots || 0 };
}
// 施法：展开成一发一发，掷暴击
function startCast(run, b) {
  const p = plan(run, b);
  p.dealt = 0; p.hits = [];
  p.states.forEach((st, i) => {
    for (const s of st.shots) {
      let dmg = s.dodge ? 0 : s.dmg, crit = false;
      if (!s.dodge && b.rng() < R.critChance + (hasRelic(run, 'dice') ? .15 : 0)) { crit = true; dmg *= R.critMul; }
      p.hits.push({ ci: i, gem: s.gem, white: !!s.white, bean: !!s.bean, small: !!s.small, dodge: !!s.dodge, crit, dmg });
    }
  });
  return p;
}
// 一发打中；返回这一发是不是把怪打死了。老墩的根须先挡（h.rooted = 挡了多少，h.rootBreak = 这一发打穿了）
function applyHit(run, b, p, h) {
  const m = b.mon, before = m.hp;
  let dmg = h.dmg;
  if (m.roots > 0 && dmg > 0) { const a = Math.min(m.roots, dmg); m.roots -= a; dmg -= a; h.rooted = a; if (m.roots <= 0) h.rootBreak = true; }
  m.hp = Math.max(0, m.hp - dmg);
  p.dealt += h.dmg;
  if (h.dmg > run.bestHit) run.bestHit = h.dmg;
  return before > 0 && m.hp === 0;
}
// 施法结束：牌进弃牌堆（孢子直接没了），宝石按打出去的发数涨经验
function endCast(run, b, p) {
  for (const c of b.line) (c.junk ? b.gone : b.discard).push(c);
  b.line.length = 0;
  for (const h of p.hits) if (h.gem >= 0 && !h.small) b.gemExp[h.gem]++;
  run.bestCast = Math.max(run.bestCast, p.dealt);
  return settleGems(run, b);
}
function settleGems(run, b) {
  const ups = [];
  for (let j = 0; j < 3; j++) {
    const got = b.gemExp[j]; b.gemExp[j] = 0; if (!got) continue;
    const g = run.gems[j], from = g.level; g.exp += got;
    while (g.exp >= gemNeed(g.level)) { g.exp -= gemNeed(g.level); g.level++; }
    if (g.level > from) ups.push({ gem: j, to: g.level });
  }
  return ups;
}
// 轮到怪：先发特性（打伞的往牌堆里塞一张孢子），返回发生了什么
function monsterTrait(run, b) {
  const m = b.mon; if (m.hp <= 0) return null;
  if (m.trait === 'spore') { const c = makeCard('spore'); b.draw.splice(Math.floor(b.rng() * (b.draw.length + 1)), 0, c); return { spore: c }; }
  return null;
}
// 回合结束：怪的倒计时减一，到 0 出手（有挡一下就挡掉）。返回 null 或 { blocked, dmg }
function monsterTurn(run, b) {
  const m = b.mon; if (m.hp <= 0) return null;
  m.countdown--;
  if (m.countdown > 0) return null;
  m.countdown = m.cd;
  if (b.shield > 0) { b.shield--; return { blocked: true, dmg: 0 }; }
  run.hearts = Math.max(0, run.hearts - m.atk);
  return { blocked: false, dmg: m.atk };
}
// 下一回合：根须长满（b.rootsGrew = 本来被打掉过），摸牌
function nextTurn(run, b) {
  b.turn++;
  const m = b.mon; b.rootsGrew = m.rootMax > 0 && m.roots < m.rootMax; if (m.rootMax) m.roots = m.rootMax;
  return drawCards(b, drawCount(run, b.turn));
}
// 打赢一仗：水果糖回半颗心。返回回了多少
function onWin(run) {
  if (!hasRelic(run, 'candy')) return 0;
  const before = run.hearts; run.hearts = Math.min(run.maxHearts, run.hearts + .5); return run.hearts - before;
}

// ---------- 石碑歇脚 ----------
const REST_HEAL = 2;
function restHeal(run) { const before = run.hearts; run.hearts = Math.min(run.maxHearts, run.hearts + REST_HEAL); return run.hearts - before; }
const canUpgrade = c => !c.up && !c.junk;
function upgradeCard(run, i) { const c = run.deck[i]; if (!c || !canUpgrade(c)) return null; run.deck[i] = makeCard(c.id + '+'); return run.deck[i]; }
const MIN_DECK = 5;
function removeCard(run, i) { if (run.deck.length <= MIN_DECK || !run.deck[i]) return null; return run.deck.splice(i, 1)[0]; }

// ---------- 奖励 ----------
const LOOT_SPELLS = ['block', 'lens', 'parrot', 'contra', 'beans', 'draw', 'stall', 'family'];
const LOOT_TAGS = Object.keys(TAGS);
function lootChoices(run) {
  const r = run.rng, out = [], seen = new Set();
  for (let tries = 0; out.length < R.lootCount && tries < 60; tries++) {
    let id;
    const k = r();
    if (k < .5) id = 'g' + (r() < .1 ? 6 : (r() * 6) | 0) + ':' + LOOT_TAGS[(r() * LOOT_TAGS.length) | 0];
    else if (k < .62) id = 'g' + ((r() * 6) | 0);
    else { id = LOOT_SPELLS[(r() * LOOT_SPELLS.length) | 0]; if (SPELLS[id].rare && r() < .6) continue; }
    if (seen.has(id)) continue;
    seen.add(id); out.push(makeCard(id));
  }
  return out;
}
