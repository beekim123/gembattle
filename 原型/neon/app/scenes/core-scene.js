// 核心试玩（设计稿 10.4，用户 2026-11-24 定的；做法见 设计/做原型的方法.md）：
// 只有宝石牌，连着打 10 只怪，心不回，掉完就输，输了从第 1 只重来。
// 这一页只管：第几只、还剩几颗心、下一只是什么、开打；打一仗交给战斗场景，打完回到这里。
// 外圈（大厅、工会、走一趟、试打台）冻住了，入口关在 app/main.js。

import { CORE_TRIAL, ENCOUNTERS, createCoreTrialPacket } from '../../modules/content/index.js';
import { COLOR_META } from '../../modules/shared/index.js';
import { F, T, bold, forest, hearts, inRect, panelButton, txt, wrapText } from '../../modules/ui/index.js';
import { formatPlayLog, session } from '../session.js';

const N = CORE_TRIAL.fights.length;
const ROW = { x: 60, y: 196, w: 78, h: 92, gap: 6 };

function freshTrial(prev = null) {
  return {
    seedBase: prev?.seedBase ?? Date.now().toString(36),
    attempt: (prev?.attempt ?? 0) + 1,
    index: 0,
    hearts: CORE_TRIAL.hearts,
    fights: [], // 这一趟每只打了几回合、掉几颗心
    status: 'ready', // ready / lost / cleared
    best: prev?.best ?? 0,
    history: prev?.history ?? [], // 之前每趟打过几只
  };
}

/** 这只怪写成几行字：几只、几条血、盾、特性（血是乘过倍数的） */
export function describeFight(index) {
  const packet = createCoreTrialPacket({ index, seed: 'describe' });
  return packet.monsters.map((m) => {
    const hp = m.bars.map((b) => b.maxHp).join(' + ');
    const shields = m.bars[0].shields.map((s) => `${COLOR_META[s.color]?.label || s.color} ${s.max} 格`).join('、');
    const traits = [...new Set(m.bars.flatMap((b) => b.traits.map((t) => t.label)))].join('；');
    return [`${m.label}：血 ${hp}`, shields ? `盾 ${shields}` : '没有盾', traits].filter(Boolean).join(' · ');
  });
}

export function createCoreScene(context) {
  let hot = null;
  let clock = 0;
  let copiedAt = -9;
  const trial = () => session.core;

  function primaryLabel() {
    const t = trial();
    if (t.status === 'lost') return '从头再来';
    if (t.status === 'cleared') return '再来一趟';
    return `打第 ${t.index + 1} 只`;
  }

  function buttons() {
    return [
      { id: 'go', x: 60, y: 430, w: 220, h: 48 },
      { id: 'copy', x: 300, y: 438, w: 200, h: 32 },
    ];
  }

  function startFight() {
    const t = trial();
    const last = t.index === N - 1;
    const packet = createCoreTrialPacket({ index: t.index, hearts: t.hearts, seed: `core-${t.seedBase}-${t.attempt}` });
    context.switchTo('battle', {
      runPacket: packet,
      rulesConfig: CORE_TRIAL.rulesConfig,
      returnTo: 'core',
      outcomeLabels: { win: last ? '看看结果' : '下一只', lose: '看看结果' },
    });
  }

  function primary() {
    const t = trial();
    if (t.status === 'ready') startFight();
    else session.core = freshTrial(t);
  }

  function finishBattle(res) {
    const t = trial();
    t.fights[t.index] = { turns: res.stats?.turns ?? 0, heartsLost: res.stats?.heartsLost ?? 0, win: res.outcome === 'win' };
    t.hearts = res.remainingHearts;
    if (res.outcome === 'win') {
      t.index++;
      if (t.index >= N) t.status = 'cleared';
    } else t.status = 'lost';
    if (t.status !== 'ready') {
      const cleared = t.status === 'cleared' ? N : t.index;
      t.best = Math.max(t.best, cleared);
      t.history.push({ attempt: t.attempt, cleared, heartsLeft: t.hearts });
    }
  }

  function copyText() {
    const t = trial();
    const lines = [
      `code00 核心试玩 · 只有宝石牌连打 ${N} 只 · 一共 ${t.history.length} 趟打完或输了 · 最好打过 ${t.best} 只`,
      ...t.history.map((h) => (h.cleared >= N ? `第 ${h.attempt} 趟：${N} 只都打完，剩 ${h.heartsLeft} 颗心` : `第 ${h.attempt} 趟：打过 ${h.cleared} 只，输在第 ${h.cleared + 1} 只（${ENCOUNTERS[CORE_TRIAL.fights[h.cleared].encounterId].label}）`)),
      '',
      formatPlayLog(session.playLog || []),
    ];
    try { globalThis.navigator?.clipboard?.writeText(lines.join('\n')); } catch { /* 拷不了就算了 */ }
    copiedAt = clock;
  }

  return {
    getHitBoxes: buttons,
    getTrial: trial,

    onEnter(payload = {}) {
      if (!session.core) session.core = freshTrial();
      if (payload?.battleResult && trial().status === 'ready') finishBattle(payload.battleResult);
    },

    onUpdate(dt) { clock += dt; },

    onPointer(ev) {
      const b = buttons().find((x) => inRect(x, ev.x, ev.y));
      hot = b?.id || null;
      if (ev.type === 'up' && b) {
        if (b.id === 'go') primary();
        else if (b.id === 'copy') copyText();
      }
      return { cursor: b ? 'pointer' : 'default' };
    },

    onKeyDown(key) {
      if (key === ' ' || key === 'Enter') primary();
    },

    onRender(r) {
      const t = trial();
      forest(r);
      r.rect({ x: 0, y: 0, w: 960, h: 540, fill: '#05070a', alpha: 0.35 });
      bold(r, `只用宝石牌，连打 ${N} 只`, 60, 58, { size: F.xl, color: T.text });
      txt(r, `心 ${CORE_TRIAL.hearts} 颗，打完一只不回；掉完就输，从第 1 只重来。没有自动排，自己想怎么排。`, 60, 96, { size: F.s, color: T.text2 });

      hearts(r, 60, 140, t.hearts, CORE_TRIAL.hearts, 22);
      txt(r, `第 ${t.attempt} 趟${t.best ? ` · 最好打过 ${t.best} 只` : ''}`, 160, 140, { size: F.s, color: T.text2 });

      // 10 只排一排：打过的绿、现在这只金、输在这只红、还没到的暗
      CORE_TRIAL.fights.forEach((f, i) => {
        const x = ROW.x + i * (ROW.w + ROW.gap);
        const done = i < t.index;
        const here = i === t.index && t.status === 'ready';
        const lostHere = i === t.index && t.status === 'lost';
        const stroke = done ? T.connect : here ? T.gold : lostHere ? T.danger : '#3a4258';
        r.rect({ x, y: ROW.y, w: ROW.w, h: ROW.h, radius: 8, fill: '#121722', stroke, lineWidth: here || lostHere ? 2 : 1, alpha: done || here || lostHere ? 1 : 0.7 });
        txt(r, `${i + 1}`, x + 8, ROW.y + 14, { size: F.s, weight: 'bold', color: stroke });
        const label = ENCOUNTERS[f.encounterId].label.replace('普通怪', '');
        wrapText(r, label, ROW.w - 12, { size: F.xs }).slice(0, 3).forEach((s, k) => {
          txt(r, s, x + 6, ROW.y + 36 + k * 15, { size: F.xs, color: done || here || lostHere ? T.text : T.text3 });
        });
        const rec = t.fights[i];
        if (rec) txt(r, rec.win ? `${rec.turns} 回合` : '输了', x + ROW.w / 2, ROW.y + ROW.h + 14, { size: F.xs, align: 'center', color: rec.win ? T.text2 : T.danger });
      });

      // 下一只 / 结果
      const infoY = 336;
      if (t.status === 'ready') {
        bold(r, `第 ${t.index + 1} 只：${ENCOUNTERS[CORE_TRIAL.fights[t.index].encounterId].label}`, 60, infoY, { size: F.l, color: T.gold });
        describeFight(t.index).forEach((s, k) => txt(r, s, 60, infoY + 30 + k * 22, { size: F.s, color: T.text2 }));
      } else if (t.status === 'lost') {
        bold(r, `输在第 ${t.index + 1} 只：${ENCOUNTERS[CORE_TRIAL.fights[t.index].encounterId].label}`, 60, infoY, { size: F.l, color: T.danger });
        txt(r, `这一趟打过 ${t.index} 只。`, 60, infoY + 30, { size: F.s, color: T.text2 });
      } else {
        bold(r, `${N} 只都打完了，剩 ${t.hearts} 颗心`, 60, infoY, { size: F.l, color: T.gold });
        txt(r, '想不想再来一趟？哪一只最没意思、哪一下最爽，记下来告诉做的人。', 60, infoY + 30, { size: F.s, color: T.text2 });
      }

      const [go, copy] = buttons();
      panelButton(r, go, primaryLabel(), { hot: hot === 'go', kind: 'primary', size: F.m });
      panelButton(r, copy, copiedAt > clock - 2 ? '拷好了' : '复制试玩记录', { hot: hot === 'copy', kind: 'ghost' });
    },
  };
}
