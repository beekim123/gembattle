// 只用来测试：?auto=1 让假玩家自己点、自己打，从标题一路走到结算。
// 参数：gate=retreat|advance（界门怎么选，默认 advance）；heal=1（心低于 1.5 就补满，保证能打到首领）；loop=1（结算后再来一趟）。
import { queueCard, undoAll, previewChain, instantCheck, setTarget } from '../modules/battle-rules/index.js';
import { nextNodes, canBuy, buy } from '../modules/run-rules/index.js';

export function startAutopilot(flow, params) {
  const gate = params.get('gate') || 'advance', heal = !!params.get('heal'), loop = !!params.get('loop');
  const A = window.__auto = { log: [], trips: [], errors: [], ticks: 0, running: true, outcomes: [] };
  const say = s => { A.log.push(s); if (A.log.length > 400) A.log.shift(); };
  let r = (Number(params.get('auto')) || 1) * 7919;
  const rnd = () => { r = (r * 1103515245 + 12345) & 0x7fffffff; return r / 0x7fffffff; };

  function battleTick(sc) {
    const b = sc.b, trip = flow.trip;
    if (sc.overlay) {
      if (sc.overlay.kind === 'win') { say(`胜利 ${sc.def.title}`); sc.onButton('next'); }
      else if (sc.overlay.kind === 'lose') { say(`败北 ${sc.def.title}`); sc.onButton('again'); }
      else sc.overlay = null;
      return;
    }
    if (sc.play || b.phase !== 'player') return;
    if (heal && trip.player.hearts < 1.5) { b.player.hearts = trip.player.hearts = trip.player.maxHearts; say('（测试用：补满了心）'); }
    // 先出能出的瞬发牌和废牌
    for (let k = 0; k < 6; k++) {
      const i = b.deck.hand.findIndex((c, ix) => c.color < 0 && (c.junk || instantCheck(b, ix).ok));
      if (i < 0) break;
      if (b.deck.hand[i].junk || rnd() < 0.85) sc.useInstant(i); else break;
    }
    const alive = b.enemies.filter(e => e.alive);
    if (alive.length > 1) setTarget(b, alive.reduce((a, e) => (e.countdown < a.countdown ? e : a)).idx);
    // 在手牌里随机试 40 种排法，挑预览伤害最高的
    const idxs = b.deck.hand.map((c, i) => (c.color >= 0 ? i : -1)).filter(i => i >= 0);
    let best = [], bestScore = -1;
    for (let n = 0; n < 40 && idxs.length; n++) {
      const pool = [...idxs].sort(() => rnd() - 0.5).slice(0, 1 + Math.floor(rnd() * idxs.length));
      const uids = pool.map(i => b.deck.hand[i].uid);
      for (const u of uids) queueCard(b, b.deck.hand.findIndex(c => c.uid === u));
      const sc2 = previewChain(b).total;
      undoAll(b);
      if (sc2 > bestScore) { bestScore = sc2; best = uids; }
    }
    for (const u of best) queueCard(b, b.deck.hand.findIndex(c => c.uid === u));
    sc.refresh();
    sc.doCast();
  }

  function panelTick(p) {
    const s = p.screen, hooks = p.hooks, trip = flow.trip;
    if (!s || p.drawnScreen !== s) return;                           // 画面刚换，还没画出来：按钮区是上一个画面的，等下一帧
    const first = () => { const h = p.hits.find(h => h.fn && h.enabled !== false); if (h) h.fn(); };
    switch (s.kind) {
      case 'title': hooks.onStart(); break;
      case 'summary': {
        const sm = s.s; if (A.outcomes.at(-1)?.t !== trip) { A.outcomes.push({ t: trip, o: sm.outcome, step: sm.step }); say(`结算：${sm.outcome} 走到第 ${sm.step} 步`); }
        if (loop) hooks.onAgain(); else A.running = false;
        break;
      }
      case 'result': hooks.onDone(); break;
      case 'gate': say(`界门：${gate}`); hooks.onChoose(gate); break;
      case 'shop': {
        for (const it of trip.shop) if (it.kind !== 'carve' && canBuy(trip, it)) { buy(trip, it); say(`买了 ${it.kind}`); }
        hooks.onLeave(); break;
      }
      case 'camp': if (s.done) hooks.onDone(); else { const hs = p.hits.filter(h => h.fn && h.enabled !== false); (hs[Math.floor(rnd() * hs.length)] || {}).fn?.(); } break;
      case 'event': { const hs = p.hits.filter(h => h.fn && h.enabled !== false); (hs[Math.floor(rnd() * hs.length)] || {}).fn?.(); break; }
      default: first();
    }
  }

  function mapTick(m) {
    const ids = nextNodes(flow.trip);
    if (!ids.length) return;
    // 偏好：营火 > 战斗，随机
    const id = ids[Math.floor(rnd() * ids.length)];
    const y = m.pos(id)[1];
    say(`选 ${id}`);
    // 点以前先把镜头摆到这个节点看得见的位置（真人要拖，假玩家直接设）
    m.cam = m.camTarget = m.clampCam(y - 300);
    const [sx, sy] = m.screenPos(id);                                // 屏幕坐标：已经算上了头区（卷轴窗口从 y = 66 开始）
    m.pointerMove(sx, sy); m.pointerDown(sx, sy); m.pointerUp(sx, sy);
  }

  setInterval(() => {
    if (!A.running) return;
    A.ticks++;
    try {
      const cur = flow.cur;
      if (cur === flow.battle) battleTick(cur);
      else if (cur === flow.map) mapTick(cur);
      else if (cur === flow.panel) panelTick(cur);
      else A.running = false;
    } catch (e) { A.errors.push(String(e.stack || e)); A.running = false; }
  }, 90);
}
