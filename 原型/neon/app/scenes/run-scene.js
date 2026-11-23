// 走一趟的组装场景：run-rules（一趟的规则）+ explore-view（空地画面），碰到鬼火换到战斗场景，打完回来。
// 场景每次切换都会重新建，所以这一趟本身放在 session 里（app/session.js），不放在场景里。

import { createRun, settleRun } from '../../modules/run-rules/index.js';
import { createExploreView } from '../../modules/explore-view/index.js';
import { ALLY_DEFS, ALL_CARD_DEFS, BUFF_DEFS, createRunContent } from '../../modules/content/index.js';
import { F, T, bold, txt } from '../../modules/ui/index.js';
import { session } from '../session.js';

const W = 960;
const H = 540;
const inRect = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

let RUN_CONTENT = null;
const runContent = () => (RUN_CONTENT ||= createRunContent());

/** 画面按 id 查名字和说明用的表 */
function buildCatalog() {
  const cards = {};
  for (const [id, d] of Object.entries(ALL_CARD_DEFS)) cards[id] = { label: d.label, description: d.description, color: d.color, gems: d.gems, usage: d.usage, kind: d.kind, drawAfterPlay: d.drawAfterPlay || 0 };
  const buffs = {};
  for (const [id, b] of Object.entries(BUFF_DEFS)) buffs[id] = { label: b.label, description: b.description, lane: b.lane, lanes: b.lanes };
  const allies = {};
  for (const [id, a] of Object.entries(ALLY_DEFS)) allies[id] = { role: a.role, roleTag: a.roleTag, label: a.label, description: a.description };
  return { cards, buffs, allies };
}

/** 开一趟（出发包见 run-rules README） */
export function startRun(depart) {
  session.run = createRun(depart, runContent());
  session.depart = depart;
  session.summary = null;
  return session.run;
}

export function createRunScene(context) {
  let view = null;
  let menuOpen = false;
  let hover = null;
  let endAt = -1;
  let clock = 0;

  const run = () => session.run;

  function sync() {
    if (!view || !run()) return;
    view.setState(run().getState());
    if (run().isEnded() && !session.summary) finish();
  }

  function finish() {
    const ret = run().getReturnPacket();
    let lines = [];
    // 阶段 3 有了存档就结算进存档；没有存档（单独试走一趟）只看结果
    if (session.save && session.onSettled) {
      const out = settleRun(session.save, ret, runContent());
      lines = out.lines;
      session.onSettled(out.save, ret);
    } else {
      lines = [ret.outcome === 'returned' ? '活着回来了' : '死在林子里了', `带回 ${ret.gold} 金币`];
    }
    session.summary = { ret, lines };
    endAt = clock;
  }

  function act(fn) {
    if (!run() || run().isEnded()) return;
    fn(run());
    sync();
  }

  function menuButtons() {
    return [
      { id: 'resume', label: '接着走', x: 400, y: 250, w: 160, h: 38 },
      { id: 'giveup', label: '不走了（当死了算）', x: 380, y: 300, w: 200, h: 38 },
    ];
  }

  function endButtons() {
    return [{ id: 'home', label: '回大厅', x: 420, y: 400, w: 120, h: 38 }];
  }

  return {
    getView: () => view,
    getRun: () => run(),

    onEnter(payload = {}) {
      if (payload.depart) startRun(payload.depart);
      if (!run()) { context.switchTo('home'); return; }
      view = createExploreView({
        catalog: buildCatalog(),
        callbacks: {
          onFight: () => {
            const packet = run().getBattlePacket(session.depart?.rulesConfig);
            session.heroPos = view.getHeroPos();
            if (packet) context.switchTo('battle', { runPacket: packet, rulesConfig: session.depart?.rulesConfig || {} });
          },
          onExit: (id) => act((r) => r.chooseExit(id)),
          onTakeHidden: () => act((r) => r.takeHidden()),
          onGather: (id) => act((r) => r.gather(id)),
          onFindItem: () => act((r) => r.takeFindItem()),
          onChoose: (c) => act((r) => r.choose(c)),
          onMenu: () => { menuOpen = true; },
        },
      });
      if (payload.battleResult && !run().isEnded()) run().finishBattle(payload.battleResult);
      sync();
      if (payload.battleResult) view.setHeroPos(session.heroPos);
    },

    onUpdate(dt) {
      clock += dt;
      if (view) view.update(dt);
    },

    onPointer(ev) {
      if (session.summary) {
        const b = endButtons().find((x) => inRect(x, ev.x, ev.y));
        hover = b?.id || null;
        if (ev.type === 'up' && b && clock - endAt > 0.4) {
          session.run = null;
          context.switchTo('home', { fromRun: true });
        }
        return { cursor: b ? 'pointer' : 'default' };
      }
      if (menuOpen) {
        const b = menuButtons().find((x) => inRect(x, ev.x, ev.y));
        hover = b?.id || null;
        if (ev.type === 'up' && b) {
          menuOpen = false;
          if (b.id === 'giveup') { run().debugEnd('dead'); sync(); }
        }
        return { cursor: b ? 'pointer' : 'default' };
      }
      return view ? view.onPointer(ev) : { cursor: 'default' };
    },

    onKeyDown(key) {
      if (key === 'Escape') { menuOpen = !menuOpen; return; }
      view?.onKey(key, true);
    },
    onKeyUp(key) { view?.onKey(key, false); },

    onRender(r) {
      if (view) view.render(r);
      if (menuOpen) {
        r.rect({ x: 0, y: 0, w: W, h: H, fill: '#05070a', alpha: 0.6 });
        r.rect({ x: 340, y: 190, w: 280, h: 170, radius: 14, fill: '#121722', stroke: '#3a4560', lineWidth: 1.5 });
        txt(r, '先停一下', 480, 220, { size: F.l, weight: 'bold', align: 'center' });
        menuButtons().forEach((b) => drawBtn(r, b, hover === b.id));
      }
      if (session.summary) drawSummary(r);
    },
  };

  function drawBtn(r, b, hov) {
    r.rect({ x: b.x, y: b.y, w: b.w, h: b.h, radius: 8, fill: hov ? '#2c3650' : '#1b2030', stroke: hov ? '#ffffff' : '#3e4862', lineWidth: 1 });
    txt(r, b.label, b.x + b.w / 2, b.y + b.h / 2, { size: F.s, weight: 'bold', align: 'center' });
  }

  function drawSummary(r) {
    const { ret, lines } = session.summary;
    const k = Math.min(1, (clock - endAt) / 0.3);
    const alive = ret.outcome === 'returned';
    r.rect({ x: 0, y: 0, w: W, h: H, fill: '#05070a', alpha: 0.78 * k });
    r.rect({ x: 250, y: 110, w: 460, h: 340, radius: 16, fill: '#121722', stroke: alive ? T.gold : T.danger, lineWidth: 2, alpha: k });
    bold(r, alive ? '活着回来了' : '死在林子里了', 480, 150, { size: F.xl, align: 'center', color: alive ? T.gold : T.danger, alpha: k });
    const st = ret.stats;
    const rows = [
      `走了 ${st.clearings} 片、打了 ${st.fights} 仗，最深到第 ${st.deepestLayer} 层${st.gatekeeperBeaten ? '，打倒了看门的' : ''}`,
      `打出 ${st.rainbowCount} 次彩虹 · 最长的链 ${st.maxChainLength} 张 · 最大的一发 ${st.maxSingleHit}`,
      `掉了 ${st.heartsLost} 颗心`,
      ...lines.slice(1),
    ];
    rows.forEach((s, i) => txt(r, s, 480, 196 + i * 26, { size: F.s, align: 'center', color: i < 3 ? T.text2 : T.text, alpha: k }));
    endButtons().forEach((b) => drawBtn(r, b, hover === b.id));
  }
}
