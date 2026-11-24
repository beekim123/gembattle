// 卡册的板：六页（牌 / 加成 / 队友 / 怪 / 装备 / 战利品），一格一格，鼠标放上去在底下看全文。
import { CREAM, F, LANE, T, buffIcon, gemCard, inRect, swatch, tabRow, txt, wrapText } from '../../ui/index.js';
import { ALBUM_TABS, albumEntries } from '../rules/album-rules.js';

export function createAlbumView() {
  let state = null; // { save, data }
  let tab = 'cards';
  let boxes = [];
  let hot = null;
  let clock = 0;

  function render(r, P) {
    boxes = [];
    if (!state) return;
    const x0 = P.x + 24;
    const w = P.w - 48;
    txt(r, '卡册', x0, P.y + 30, { size: F.xl, weight: 'bold', color: CREAM });
    const tabs = tabRow(r, x0, P.y + 54, ALBUM_TABS, tab, hot);
    tabs.forEach((t) => boxes.push({ ...t, onClick: () => { tab = t.id.slice(4); } }));
    const list = albumEntries(state.save, state.data)[tab];
    const opened = list.filter((e) => e.open).length;
    txt(r, `${opened}/${list.length}`, P.x + P.w - 56, P.y + 30, { size: F.s, align: 'right', color: T.text2 });
    const cols = tab === 'cards' ? 5 : 3;
    const cw = (w - (cols - 1) * 8) / cols;
    const ch = tab === 'cards' ? 52 : 50;
    const top = P.y + 98;
    list.forEach((e, i) => {
      const x = x0 + (i % cols) * (cw + 8);
      const y = top + Math.floor(i / cols) * (ch + 8);
      const on = hot === `e-${e.id}`;
      r.rect({ x, y, w: cw, h: ch, radius: 8, fill: e.open ? '#151a25' : '#0d1016', stroke: on ? CREAM : '#2c3446', lineWidth: on ? 1.5 : 1 });
      if (!e.open) {
        txt(r, e.label === '？' ? '？' : `${e.label}`, x + cw / 2, y + ch / 2 - 6, { size: F.s, align: 'center', color: T.text3 });
        txt(r, '没解锁 / 没碰到', x + cw / 2, y + ch / 2 + 12, { size: F.xs, align: 'center', color: T.text3 });
      } else if (tab === 'cards') {
        const c = e.extra;
        if (c.kind === 'gem') gemCard(r, { x: x + 6, y: y + 6, w: 30, h: 40, color: c.color, gems: c.gems });
        else r.rect({ x: x + 6, y: y + 6, w: 30, h: 40, radius: 5, fill: '#252b3d', stroke: c.color && c.color !== 'colorless' ? swatch(c.color) : '#59657f', lineWidth: 1.5 });
        wrapText(r, c.label, cw - 46, { size: F.xs }).slice(0, 2).forEach((ln, j) => txt(r, ln, x + 42, y + 18 + j * 15, { size: F.xs, color: T.text }));
      } else if (tab === 'buffs') {
        buffIcon(r, x + 6, y + 12, { lane: LANE[e.extra.lane] ? e.extra.lane : 'chain' }, 26);
        wrapText(r, e.label, cw - 44, { size: F.xs, weight: 'bold' }).slice(0, 2).forEach((ln, j) => txt(r, ln, x + 40, y + 18 + j * 15, { size: F.xs, weight: 'bold' }));
      } else if (tab === 'allies') {
        r.drawActor({ look: `ally_${e.extra.role}`, x: x + 22, y: y + ch - 6, size: 36, t: clock + i });
        txt(r, e.label, x + 44, y + ch / 2, { size: F.s, weight: 'bold' });
      } else if (tab === 'monsters') {
        r.drawActor({ look: e.extra.look, x: x + 24, y: y + ch - 4, size: 36, t: clock + i });
        wrapText(r, e.label, cw - 54, { size: F.xs, weight: 'bold' }).slice(0, 2).forEach((ln, j) => txt(r, ln, x + 48, y + 18 + j * 15, { size: F.xs, weight: 'bold' }));
      } else {
        wrapText(r, e.label, cw - 16, { size: F.xs, weight: 'bold' }).slice(0, 2).forEach((ln, j) => txt(r, ln, x + 8, y + 18 + j * 15, { size: F.xs, weight: 'bold' }));
      }
      boxes.push({ id: `e-${e.id}`, x, y, w: cw, h: ch, entry: e });
    });
    // 底下：鼠标放在哪格就写它
    const ib = { x: x0 - 8, y: P.y + P.h - 88, w: w + 16, h: 76 };
    r.rect({ ...ib, radius: 10, fill: '#11151d', stroke: '#2c3446', lineWidth: 1 });
    const hb = boxes.find((b) => b.id === hot && b.entry);
    const text = hb ? `${hb.entry.label}：${hb.entry.description}` : '鼠标放到格子上看它是什么';
    wrapText(r, text, ib.w - 24, { size: F.xs }).slice(0, 4).forEach((ln, j) => txt(r, ln, ib.x + 12, ib.y + 16 + j * 16, { size: F.xs, color: hb ? T.text : T.text3 }));
  }

  function onPointer(ev) {
    const hit = [...boxes].reverse().find((b) => inRect(b, ev.x, ev.y));
    hot = hit?.id || null;
    if (ev.type === 'up' && hit?.onClick) hit.onClick();
    return { cursor: hit?.onClick ? 'pointer' : 'default' };
  }

  return { setState(n) { state = n; }, render, onPointer, update(dt) { clock += dt; }, setTab(t) { tab = t; }, getBoxes: () => boxes.map(({ id, x, y, w, h }) => ({ id, x, y, w, h })) };
}
