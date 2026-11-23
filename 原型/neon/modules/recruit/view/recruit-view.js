// 招募的板：能雇的队友一张一张，写打仗的本事、探索的本事、多少钱；雇 / 退。
import { CREAM, F, GOLD, T, inRect, panelButton, txt, wrapText } from '../../ui/index.js';
import { availableAllies, seatsFor } from '../rules/recruit-rules.js';

const ROLE_COLOR = { assassin: '#9a78c2', support: '#86d6a6', tank: '#86b4dc', warrior: '#e09a62' };

export function createRecruitView(options = {}) {
  const cb = options.callbacks || {};
  let state = null; // { save, allies }
  let boxes = [];
  let hot = null;
  let clock = 0;

  function render(r, P) {
    boxes = [];
    if (!state) return;
    const { save, allies } = state;
    const x0 = P.x + 24;
    txt(r, '招募', x0, P.y + 30, { size: F.xl, weight: 'bold', color: CREAM });
    txt(r, `席位 ${save.hired.length}/${seatsFor(save.rank)} · 金币 ${save.gold}`, P.x + P.w - 56, P.y + 30, { size: F.s, align: 'right', color: GOLD });
    txt(r, '只管这一趟；出发前能退，全额退钱', x0, P.y + 58, { size: F.xs, color: T.text3 });
    const all = Object.values(allies);
    const avail = new Set(availableAllies(save, allies).map((a) => a.id));
    const w = P.w - 48;
    all.forEach((a, i) => {
      const y = P.y + 76 + i * 98;
      const col = ROLE_COLOR[a.role] || T.text2;
      const hired = save.hired.includes(a.id);
      const locked = !avail.has(a.id);
      r.rect({ x: x0 - 8, y, w: w + 16, h: 88, radius: 10, fill: hired ? '#16201a' : '#11151d', stroke: hired ? T.connect : '#2c3446', lineWidth: hired ? 2 : 1, alpha: locked ? 0.5 : 1 });
      r.drawActor({ look: `ally_${a.role}`, x: x0 + 26, y: y + 70, size: 52, t: clock + i, alpha: locked ? 0.4 : 1 });
      txt(r, `${a.roleTag} · ${a.label}`, x0 + 62, y + 16, { size: F.m, weight: 'bold', color: locked ? T.text3 : col });
      wrapText(r, `打仗：${a.description.replace(/^[^：]*：/, '')}`, w - 170, { size: F.xs }).slice(0, 2).forEach((ln, j) => txt(r, ln, x0 + 62, y + 38 + j * 15, { size: F.xs, color: T.text2 }));
      txt(r, `探索：${a.explore?.label || '—'}`, x0 + 62, y + 72, { size: F.xs, color: T.text2 });
      const b = { id: `${hired ? 'refund' : 'hire'}-${a.id}`, x: x0 + w - 96, y: y + 30, w: 96, h: 30 };
      if (locked) txt(r, `${a.unlockRank} 级解锁`, b.x + b.w / 2, b.y + 15, { size: F.xs, align: 'center', color: T.text3 });
      else {
        const full = !hired && save.hired.length >= seatsFor(save.rank);
        const poor = !hired && save.gold < a.hireCost;
        panelButton(r, b, hired ? '退掉' : `雇 ${a.hireCost}`, { hot: hot === b.id, kind: hired ? 'normal' : 'primary', disabled: full || poor, size: F.xs });
        if (!full && !poor) boxes.push({ ...b, onClick: () => (hired ? cb.onRefund?.(a.id) : cb.onHire?.(a.id)) });
      }
    });
  }

  function onPointer(ev) {
    const hit = [...boxes].reverse().find((b) => inRect(b, ev.x, ev.y));
    hot = hit?.id || null;
    if (ev.type === 'up' && hit) hit.onClick?.();
    return { cursor: hit ? 'pointer' : 'default' };
  }

  return { setState(n) { state = n; }, render, onPointer, update(dt) { clock += dt; }, getBoxes: () => boxes.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })) };
}
