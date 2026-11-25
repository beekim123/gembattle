// 施法链结算：预览（空跑）与实战共用这一个函数。
// mode: 'preview' 不暴击；'max' 每发都暴击（算暴击上限）；'real' 按暴击率掷骰。
import {
  CONFIG, REL, WHITE, relationOf, ringBit, countBits, nextRand, gauss, deepClone, sum3, CARD_MASKS,
} from '../shared/index.js';
import { enemyView, loadBar, retarget, startTurn, aliveEnemies, hasSeal, breakShield } from './state.js';

const ART = ['red', 'green', 'blue'];

function shieldMultOf(b, e) {
  if (sum3(e.shield) > 0) return CONFIG.shieldMult;
  if (e.broken && sum3(e.shieldMax) > 0) return hasSeal(b, 'desperate') ? CONFIG.desperateMult : CONFIG.brokenMult;
  return 1;
}

function rollCrits(b, n, mode) {
  if (mode === 'preview') return 0;
  if (mode === 'max') return n;
  const p = b.player.critChance;
  if (p <= 0) return 0;
  if (p >= 1) return n;
  if (n <= 60) { let c = 0; for (let i = 0; i < n; i++) if (nextRand(b) < p) c++; return c; }
  const c = Math.round(n * p + gauss(b) * Math.sqrt(n * p * (1 - p)));
  return Math.max(0, Math.min(n, c));
}

// 往一只怪身上打 count 发。每发 = 攻击 × 宝石等级加成 × 暴伤 × 盾倍数 × 额外倍数（四舍五入）。
// 打空一条血就换下一条（换上新盾），打空最后一条这只怪就死了。
function applyShots(b, e, ch, count, art, mode, events, extra = 1) {
  if (!e.alive || count <= 0) return 0;
  const lvl = b.player.gems[ch].level;
  const raw = b.player.atk * (1 + CONFIG.gemLevelBonus * (lvl - 1)) * extra;
  const crits = rollCrits(b, count, mode);
  const groups = [[crits, true], [count - crits, false]];
  let total = 0, shots = 0, critShots = 0, perShot = 0, perCrit = 0, barsLost = 0;
  for (const [n0, isCrit] of groups) {
    let n = n0;
    while (n > 0 && e.alive) {
      const sm = shieldMultOf(b, e);
      const d = Math.max(1, Math.round(raw * sm * (isCrit ? b.player.critDmg : 1)));
      if (isCrit) perCrit = d; else perShot = d;
      const need = Math.max(1, Math.ceil(e.hp / d));
      const k = Math.min(n, need);
      total += k * d; shots += k; if (isCrit) critShots += k;
      e.hp = Math.max(0, e.hp - k * d);
      n -= k;
      if (e.hp === 0) {
        if (e.bar + 1 < e.barsTotal) { e.bar++; loadBar(e); barsLost++; }
        else e.alive = false;
      }
    }
  }
  events.push({ type: 'hit', enemy: e.idx, ch, art, shots, crits: critShots, perShot, perCrit, total, view: enemyView(e) });
  if (barsLost) events.push({ type: 'bar', enemy: e.idx, view: enemyView(e) });
  if (!e.alive) events.push({ type: 'kill', enemy: e.idx, view: enemyView(e) });
  return total;
}

// 怪自己的特性怎么改伤害：摇果长臂猿在集色不到 4 色时受伤减半
function traitMult(e, coll) {
  if (e.trait === 'gibbon' && countBits(coll) < CONFIG.gibbonNeed) return CONFIG.gibbonMult;
  return 1;
}

export function resolveChain(b, mode = 'real') {
  const events = [];
  const chain = b.deck.chain;
  const S = {
    total: 0, shots: 0, shaved: 0, breaks: 0, waves: 0, rainbow: false, kills: 0, keep: false, tide: false,
    steps: [], perEnemy: b.enemies.map(() => 0), levelUps: [],
  };
  const need = hasSeal(b, 'rainbow_bridge') ? 5 : 6;
  // 本回合所有宝石每发的统一加成：魔力沸腾、连珠迭浪
  const gmult = (1 + CONFIG.surgeBonus * (b.buff?.surge || 0))
    * (hasSeal(b, 'chain_surge') ? 1 + CONFIG.chainSurgeBonus * Math.max(0, chain.length - 1) : 1);
  let mult = b.startMult || 1, cursor = b.color.cursor, coll = b.color.collected, rainbow = false, leapUsed = false;
  const batches = [];
  const exp = [0, 0, 0];
  const aliveBefore = aliveEnemies(b).length;

  const track = (e, dmg) => { S.total += dmg; S.perEnemy[e.idx] += dmg; };
  const wave = (count, ctxColl) => {
    for (let ch = 0; ch < 3; ch++) {
      batches.push({ ch, count });
      for (const e of aliveEnemies(b)) track(e, applyShots(b, e, ch, count, 'white', mode, events, gmult * traitMult(e, ctxColl)));
    }
  };

  chain.forEach((card, i) => {
    const col = card.color, mask = CARD_MASKS[col];
    const carves = card.carve || [];
    let rel = relationOf(col, cursor);
    if (card.arcana === 'refract' && cursor >= 0 && cursor < WHITE) rel = REL.COMP;   // 逆色折射：强制合白
    let leap = false;
    if (rel === REL.BREAK && hasSeal(b, 'leap') && !leapUsed) { leapUsed = true; leap = true; } // 越隙相连
    if (rel === REL.NEAR || rel === REL.COMP || rel === REL.WILD || leap) mult *= CONFIG.joinMult;
    if (card.arcana === 'prism') mult *= CONFIG.joinMult;                            // 倍增棱镜：再 ×2
    if (col < WHITE) coll = (!leap && (rel === REL.COMP || rel === REL.BREAK)) ? ringBit(col) : (coll | ringBit(col));
    if (carves.includes('overflow') && col < WHITE) {                               // 溢彩：顺带点亮相邻 1 色
      const a = (col + 1) % 6, c2 = (col + 5) % 6;
      if (!((coll >> a) & 1)) coll |= ringBit(a); else if (!((coll >> c2) & 1)) coll |= ringBit(c2);
    }
    cursor = col;
    let rainbowHere = false;
    if (!rainbow && col < WHITE && countBits(coll) >= need) {
      rainbow = rainbowHere = true;
      coll = hasSeal(b, 'ring_keep') ? (ringBit(col) | ringBit((col + 1) % 6) | ringBit((col + 5) % 6)) : ringBit(col);
    }
    if (card.arcana === 'keep') S.keep = true;
    S.steps.push({ i, uid: card.uid, color: col, rel, mult, collected: coll, rainbowHere });
    events.push({ type: 'card', i, uid: card.uid, color: col, rel, mult, collected: coll, rainbowHere });

    // 这张牌的宝石：双晶多算 1 颗（取牌上第一种宝石）
    const gems = [];
    for (let ch = 0; ch < 3; ch++) if (mask[ch]) gems.push(ch);
    if (carves.includes('twin') && gems.length) gems.push(gems[0]);

    // 目标打死了就换下一只
    let t = b.enemies[b.target];
    if (!t?.alive) { retarget(b); t = b.enemies[b.target]; }
    if (t?.alive) {
      const resisted = t.trait === 'resist' && b.resist && b.resist.now === col;
      const hadShield = sum3(t.shield) > 0;
      if (!resisted && hadShield) {
        const cells = [0, 0, 0];
        const per = carves.includes('pierce') ? 2 : 1;                              // 碎甲：每颗宝石削 2 格
        for (const ch of gems) { const k = Math.min(per, t.shield[ch]); if (k > 0) { t.shield[ch] -= k; cells[ch] += k; S.shaved += k; } }
        if (sum3(cells)) {
          events.push({ type: 'shave', enemy: t.idx, cells, view: enemyView(t) });
          if (sum3(t.shield) === 0) breakShield(b, t, events, S);
        }
      }
      const ex = (resisted ? CONFIG.resistMult : 1) * traitMult(t, coll) * (carves.includes('sharp') ? 1 + CONFIG.sharpBonus : 1) * gmult;
      for (const ch of gems) {
        batches.push({ ch, count: mult });
        track(t, applyShots(b, t, ch, mult, ART[ch], mode, events, ex));
      }
      if (resisted) events.push({ type: 'resisted', enemy: t.idx, color: col });
    } else {
      for (const ch of gems) batches.push({ ch, count: mult });
    }
    for (let ch = 0; ch < 3; ch++) if (mask[ch]) exp[ch]++;

    if (rel === REL.COMP) {
      S.waves++;
      events.push({ type: 'wave', i });
      wave(mult, coll);
      if (hasSeal(b, 'double_white')) wave(mult, coll);                             // 双重合白：多打一轮
    }
    if (rainbowHere) events.push({ type: 'rainbowReady', i });
  });

  // 碎甲白潮：本回合破过盾，链尾按最终倍率对全体追加一轮白色伤害
  if (chain.length && hasSeal(b, 'shatter_tide') && (S.breaks > 0 || b.turnFlags?.broke)) {
    S.tide = true;
    events.push({ type: 'tide' });
    wave(mult, coll);
  }

  if (rainbow) {
    S.rainbow = true;
    events.push({ type: 'rainbow' });
    for (const bt of batches) {
      for (const e of aliveEnemies(b)) track(e, applyShots(b, e, bt.ch, bt.count * CONFIG.rainbowReplays, 'rainbow', mode, events, gmult));
    }
  }

  for (const ev of events) if (ev.type === 'hit') S.shots += ev.shots;
  S.kills = aliveBefore - aliveEnemies(b).length;
  b.color.cursor = cursor; b.color.collected = coll;
  S.mult = mult; S.endCursor = cursor; S.endCollected = coll;
  for (let ch = 0; ch < 3; ch++) {
    const g = b.player.gems[ch];
    g.exp += exp[ch];
    while (g.exp >= CONFIG.gemExpPerLevel) { g.exp -= CONFIG.gemExpPerLevel; g.level++; S.levelUps.push({ ch, level: g.level }); }
  }
  for (const u of S.levelUps) events.push({ type: 'levelup', ch: u.ch, level: u.level });
  return { events, summary: S };
}

// 预览：深拷贝整份状态空跑，跑完丢弃。返回结算摘要 + 暴击上限。
export function previewChain(b) {
  const a = deepClone(b);
  const s = resolveChain(a, 'preview').summary;
  const m = deepClone(b);
  s.maxTotal = resolveChain(m, 'max').summary.total;
  return s;
}

// 施法：真打（掷暴击），弃链，倒计时 -1，到点的怪出手，没输没赢就进下一回合。
export function cast(b) {
  if (b.phase !== 'player') return null;
  const { events, summary } = resolveChain(b, 'real');
  b.deck.discard.push(...b.deck.chain.splice(0));
  if (!aliveEnemies(b).length) {
    b.phase = 'victory';
    events.push({ type: 'victory' });
    return { events, summary };
  }
  for (const e of aliveEnemies(b)) {
    e.countdown--;
    if (e.countdown <= 0) {
      e.countdown = e.cdMax;
      if (b.ward > 0) {                                   // 护身结界：完整抵挡一次
        b.ward--;
        events.push({ type: 'attack', enemy: e.idx, hearts: e.attackHearts, heartsAfter: b.player.hearts, blocked: true, ward: b.ward, view: enemyView(e) });
        continue;
      }
      b.player.hearts = Math.max(0, Math.round((b.player.hearts - e.attackHearts) * 2) / 2);
      let junk = null;
      if (e.trait === 'junk') {                           // 腹口懒兽：往弃牌堆塞缠藤废牌
        junk = { uid: 'jb' + b.turn + '_' + e.idx, color: -1, junk: true };
        b.deck.discard.push(junk);
      }
      events.push({ type: 'attack', enemy: e.idx, hearts: e.attackHearts, heartsAfter: b.player.hearts, blocked: false, junk: junk && junk.uid, view: enemyView(e) });
      if (b.player.hearts <= 0) break;
    } else {
      events.push({ type: 'tick', enemy: e.idx, view: enemyView(e) });
    }
  }
  if (b.player.hearts <= 0) {
    b.phase = 'defeat';
    events.push({ type: 'defeat' });
    return { events, summary };
  }
  // 给下回合留的：蓄锋待发、白潮余韵、凝色留存
  const left = b.deck.hand.length > 0;
  const nx = { startMult: 1, drawExtra: 0, capExtra: 0 };
  if (hasSeal(b, 'hold_edge') && left) nx.startMult = 2;
  if (hasSeal(b, 'white_echo') && summary.waves > 0) { nx.drawExtra = 1; nx.capExtra += 1; }
  if (summary.keep && left) nx.capExtra += 1;
  b.next = nx;
  const drawn = startTurn(b);
  events.push({ type: 'draw', uids: drawn });
  return { events, summary };
}

// 手里的牌接在当前链尾会是什么关系（拖牌时手牌高亮用）。
export function handRelations(b, endCursor) {
  return b.deck.hand.map(c => (c.color < 0 ? null : relationOf(c.color, endCursor)));
}
