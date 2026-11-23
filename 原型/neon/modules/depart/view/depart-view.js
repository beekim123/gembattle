// 出发的板：去哪、穿什么（◀ ▶ 换）、主角属性、带的任务、带的队友、出发。
import { CREAM, F, GOLD, T, inRect, panelButton, sectionTitle, txt } from '../../ui/index.js';
import { SLOTS, SLOT_LABEL } from '../rules/depart-rules.js';

export function createDepartView(options = {}) {
  const cb = options.callbacks || {};
  let state = null; // { save, gear, quests, allies, loadout, zoneLabel }
  let boxes = [];
  let hot = null;

  function render(r, P) {
    boxes = [];
    if (!state) return;
    const { save, gear, quests, allies, loadout } = state;
    const x0 = P.x + 24;
    const w = P.w - 48;
    txt(r, '出发', x0, P.y + 30, { size: F.xl, weight: 'bold', color: CREAM });
    txt(r, `金币 ${save.gold}`, P.x + P.w - 56, P.y + 30, { size: F.s, align: 'right', color: GOLD });

    let y = P.y + 66;
    sectionTitle(r, x0, y, '去哪');
    r.rect({ x: x0 + 50, y: y - 13, w: w - 50, h: 26, radius: 8, fill: '#1b2a1c', stroke: '#5a8a5a', lineWidth: 1.5 });
    txt(r, `${state.zoneLabel}：第 1、2 层，最后是看门的`, x0 + 62, y, { size: F.s, weight: 'bold' });

    y += 36;
    sectionTitle(r, x0, y, '穿什么', '每出一趟磨 1 点');
    y += 18;
    SLOTS.forEach((slot) => {
      const id = save.gear.equipped[slot];
      const g = id ? gear[id] : null;
      const own = id ? save.gear.owned.filter((o) => o.id === id).sort((a, b) => b.wear - a.wear)[0] : null;
      r.rect({ x: x0 - 8, y, w: w + 16, h: 32, radius: 8, fill: '#11151d', stroke: '#2c3446', lineWidth: 1 });
      txt(r, SLOT_LABEL[slot], x0, y + 16, { size: F.s, weight: 'bold', color: CREAM });
      const label = g ? g.label : slot === 'weapon' ? '借工会的基础武器（攻击 +10，不会坏）' : '空着';
      txt(r, label, x0 + 80, y + 16, { size: F.s, color: g ? T.text : T.text3 });
      if (own) txt(r, `还能用 ${own.wear} 趟`, x0 + w - 70, y + 16, { size: F.xs, align: 'right', color: own.wear <= 1 ? T.danger : T.text2 });
      const L = { id: `prev-${slot}`, x: x0 + w - 60, y: y + 4, w: 26, h: 24 };
      const R = { id: `next-${slot}`, x: x0 + w - 28, y: y + 4, w: 26, h: 24 };
      panelButton(r, L, '◀', { hot: hot === L.id, size: F.xs });
      panelButton(r, R, '▶', { hot: hot === R.id, size: F.xs });
      boxes.push({ ...L, onClick: () => cb.onCycle?.(slot, -1) }, { ...R, onClick: () => cb.onCycle?.(slot, 1) });
      y += 36;
    });

    const st = loadout.stats;
    txt(r, `主角：攻击 ${st.attack} · 增伤 +${Math.round(st.damageBonus * 100)}% · 暴击 ${Math.round(st.critRate * 100)}% ×${st.critDamage} · 心 ${loadout.maxHearts} · 每回合补到 ${loadout.drawTarget} 张${loadout.gearTraits?.length ? ` · ${loadout.gearTraits.map((t) => t.label).join('、')}` : ''}`, x0, y + 8, { size: F.xs, color: T.text2 });

    y += 32;
    sectionTitle(r, x0, y, '带的任务', save.quests.taken.length ? '' : '没接任务也能去，只拿打怪的金币');
    y += 18;
    save.quests.taken.slice(0, 4).forEach((q) => {
      const d = quests[q.id];
      if (!d) return;
      txt(r, `· ${d.label}${q.done ? '（做完了，回工会交）' : `（${q.progress}/${d.count}）`}`, x0 + 8, y + 6, { size: F.xs, color: q.done ? T.connect : T.text });
      y += 18;
    });

    y += 10;
    sectionTitle(r, x0, y, '带的队友', save.hired.length ? '' : '没雇（去招募雇）');
    y += 18;
    save.hired.forEach((id, i) => {
      const a = allies[id];
      txt(r, `· ${a?.roleTag || ''} ${a?.label || id}：${a?.explore?.label || ''}`, x0 + 8, y + 6 + i * 18, { size: F.xs });
    });

    const go = { id: 'go', x: P.x + P.w - 24 - 150, y: P.y + P.h - 60, w: 150, h: 42 };
    panelButton(r, go, '出发', { hot: hot === 'go', kind: 'primary', size: F.l });
    boxes.push({ ...go, onClick: () => cb.onGo?.() });
  }

  function onPointer(ev) {
    const hit = [...boxes].reverse().find((b) => inRect(b, ev.x, ev.y));
    hot = hit?.id || null;
    if (ev.type === 'up' && hit) hit.onClick?.();
    return { cursor: hit ? 'pointer' : 'default' };
  }

  return { setState(n) { state = n; }, render, onPointer, update() {}, getBoxes: () => boxes.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })) };
}
