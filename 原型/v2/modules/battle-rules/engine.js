// 施法链结算：预览（空跑）与实战共用这一个函数。
// mode: 'preview' 不暴击；'max' 每发都暴击（算暴击上限）；'real' 按暴击率掷骰。
import {
  CONFIG, CARD_MASKS, REL, WHITE, ALL_RING, relationOf, ringBit, nextRand, gauss, deepClone, sum3,
} from '../shared/index.js';
import { enemyView, loadBar, retarget, startTurn, aliveEnemies } from './state.js';

const ART = ['red', 'green', 'blue'];

function shieldMultOf(e) {
  if (sum3(e.shield) > 0) return CONFIG.shieldMult;
  if (e.broken && sum3(e.shieldMax) > 0) return CONFIG.brokenMult;
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
      const sm = shieldMultOf(e);
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

export function resolveChain(b, mode = 'real') {
  const events = [];
  const chain = b.deck.chain;
  const S = {
    total: 0, shots: 0, shaved: 0, breaks: 0, waves: 0, rainbow: false, kills: 0,
    steps: [], perEnemy: b.enemies.map(() => 0), levelUps: [],
  };
  let mult = 1, cursor = b.color.cursor, coll = b.color.collected, rainbow = false;
  const batches = [];
  const exp = [0, 0, 0];
  const aliveBefore = aliveEnemies(b).length;

  const track = (e, dmg) => { S.total += dmg; S.perEnemy[e.idx] += dmg; };

  chain.forEach((card, i) => {
    const col = card.color, mask = CARD_MASKS[col];
    const rel = relationOf(col, cursor);
    if (rel === REL.NEAR || rel === REL.COMP || rel === REL.WILD) mult *= CONFIG.joinMult;
    if (col < WHITE) coll = (rel === REL.COMP || rel === REL.BREAK) ? ringBit(col) : (coll | ringBit(col));
    cursor = col;
    let rainbowHere = false;
    if (!rainbow && col < WHITE && coll === ALL_RING) { rainbow = rainbowHere = true; coll = ringBit(col); }
    S.steps.push({ i, uid: card.uid, color: col, rel, mult, collected: coll, rainbowHere });
    events.push({ type: 'card', i, uid: card.uid, color: col, rel, mult, collected: coll, rainbowHere });

    // 目标打死了就换下一只
    let t = b.enemies[b.target];
    if (!t?.alive) { retarget(b); t = b.enemies[b.target]; }
    if (t?.alive) {
      const resisted = t.trait === 'resist' && b.resist && b.resist.now === col;
      const hadShield = sum3(t.shield) > 0;
      if (!resisted && hadShield) {
        const cells = [0, 0, 0];
        for (let ch = 0; ch < 3; ch++) if (mask[ch] && t.shield[ch] > 0) { t.shield[ch]--; cells[ch]++; S.shaved++; }
        if (sum3(cells)) {
          events.push({ type: 'shave', enemy: t.idx, cells, view: enemyView(t) });
          if (sum3(t.shield) === 0) {
            t.broken = true; t.countdown += CONFIG.breakPush; S.breaks++;
            events.push({ type: 'break', enemy: t.idx, view: enemyView(t) });
          }
        }
      }
      for (let ch = 0; ch < 3; ch++) {
        if (!mask[ch]) continue;
        batches.push({ ch, count: mult });
        track(t, applyShots(b, t, ch, mult, ART[ch], mode, events, resisted ? CONFIG.resistMult : 1));
      }
      if (resisted) events.push({ type: 'resisted', enemy: t.idx, color: col });
    } else {
      for (let ch = 0; ch < 3; ch++) if (mask[ch]) batches.push({ ch, count: mult });
    }
    for (let ch = 0; ch < 3; ch++) if (mask[ch]) exp[ch]++;

    if (rel === REL.COMP) {
      S.waves++;
      events.push({ type: 'wave', i });
      for (let ch = 0; ch < 3; ch++) {
        batches.push({ ch, count: mult });
        for (const e of aliveEnemies(b)) track(e, applyShots(b, e, ch, mult, 'white', mode, events));
      }
    }
    if (rainbowHere) events.push({ type: 'rainbowReady', i });
  });

  if (rainbow) {
    S.rainbow = true;
    events.push({ type: 'rainbow' });
    for (const bt of batches) {
      for (const e of aliveEnemies(b)) track(e, applyShots(b, e, bt.ch, bt.count * CONFIG.rainbowReplays, 'rainbow', mode, events));
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
      b.player.hearts = Math.max(0, Math.round((b.player.hearts - e.attackHearts) * 2) / 2);
      e.countdown = e.cdMax;
      events.push({ type: 'attack', enemy: e.idx, hearts: e.attackHearts, heartsAfter: b.player.hearts, view: enemyView(e) });
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
  const drawn = startTurn(b);
  events.push({ type: 'draw', uids: drawn });
  return { events, summary };
}

// 手里的牌接在当前链尾会是什么关系（拖牌时手牌高亮用）。
export function handRelations(b, endCursor) {
  return b.deck.hand.map(c => relationOf(c.color, endCursor));
}
