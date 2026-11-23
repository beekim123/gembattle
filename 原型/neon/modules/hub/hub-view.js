// 大厅（设计稿 8.1）：只摆入口。整屏森林，左上大字，下面一列没框的文字按钮（用户定的 D2：跟旧样片一样干净）。
// 点了哪个入口，就把那个模块的板画在右边那块里——板是谁画的大厅不管，由 app/ 交给对应的模块。

import { F, T, bold, forest, inRect, txt } from '../ui/index.js';

export const HUB_PANEL = Object.freeze({ x: 392, y: 26, w: 544, h: 488 });
const CREAM = '#efe2c4';
const GOLD = '#ffd79a';

/**
 * @param {object} options
 * @param {Array<{id:string,label:string,size?:number}>} options.entries 入口
 * @param {object} options.callbacks onSelect(id)
 */
export function createHubView(options = {}) {
  const entries = options.entries || [];
  const cb = options.callbacks || {};
  let state = { gold: 0, rank: 'C', badges: {}, allies: [], active: null, note: '', subtitle: '' };
  let hot = null;
  let clock = 0;
  let boxes = [];

  function layoutEntries() {
    let y = 268;
    return entries.map((e, i) => {
      const size = e.size || (i === 0 ? 30 : 22);
      const b = { id: e.id, label: e.label, size, x: 50, y: y - size * 0.7, w: 230, h: size * 1.4, ty: y };
      y += i === 0 ? 50 : 38;
      return b;
    });
  }

  function render(r) {
    forest(r, 960, 540);
    for (let i = 0; i < 12; i++) r.rect({ x: 0, y: 0, w: 420 - i * 30, h: 540, fill: '#05070a', alpha: 0.07 });
    // 空地上站着主角和雇的队友，背对着我们看林子
    const dim = state.active ? 0.35 : 1;
    r.drawActor({ look: 'hero', x: 690, y: 400, size: 64, t: clock, alpha: dim });
    state.allies.forEach((role, i) => r.drawActor({ look: `ally_${role}`, x: i % 2 ? 770 + (i >> 1) * 40 : 610 - (i >> 1) * 40, y: 392, size: 52, t: clock + i, alpha: dim }));

    bold(r, 'code00', 64, 150, { size: 60, color: CREAM, outline: '#0b0d12' });
    txt(r, state.subtitle || '', 68, 194, { size: F.s, color: '#a9b7b2' });
    // 金币、等级
    txt(r, `冒险家等级 ${state.rank}`, 68, 222, { size: F.s, weight: 'bold', color: GOLD });
    r.circle({ x: 200, y: 222, r: 7, fill: T.gold, stroke: '#7a5a10', lineWidth: 1.5 });
    txt(r, String(state.gold), 212, 222, { size: F.s, weight: 'bold', color: T.gold });

    boxes = layoutEntries();
    boxes.forEach((b) => {
      const on = hot === b.id || state.active === b.id;
      const x = 68 + (on ? 8 : 0);
      if (on) r.rect({ x: 52, y: b.ty - 2, w: 6, h: 6, radius: 1, fill: GOLD });
      bold(r, b.label, x, b.ty, { size: b.size, color: on ? GOLD : '#e0dccc', outline: '#0b0d12' });
      const badge = state.badges?.[b.id];
      if (badge) {
        const bw = r.measureText(b.label, { size: b.size, weight: 'bold' }).width;
        r.circle({ x: x + bw + 14, y: b.ty - b.size * 0.3, r: 9, fill: T.connect });
        txt(r, String(badge), x + bw + 14, b.ty - b.size * 0.3, { size: F.xs, weight: 'bold', align: 'center', color: '#0b0d12' });
      }
    });
    if (state.note) txt(r, state.note, 68, 500, { size: F.xs, color: '#a9b7b2' });
  }

  function panelFrame(r, k = 1) {
    const P = { ...HUB_PANEL, x: HUB_PANEL.x + (1 - k) * 80 };
    r.rect({ ...P, radius: 14, fill: '#0b0e13', alpha: 0.92 * k, stroke: '#2c3446', lineWidth: 1 });
    txt(r, '×', P.x + P.w - 25, P.y + 25, { size: F.xl, align: 'center', color: hot === 'close' ? GOLD : T.text2, alpha: k });
    return P;
  }

  /** 只管左边的入口和板右上角的 ×；板里面由 app/ 交给模块 */
  function onPointer(ev) {
    const close = { x: HUB_PANEL.x + HUB_PANEL.w - 40, y: HUB_PANEL.y + 10, w: 30, h: 30 };
    if (state.active && inRect(close, ev.x, ev.y)) {
      hot = 'close';
      if (ev.type === 'up') cb.onSelect?.(null);
      return { cursor: 'pointer', handled: true };
    }
    const b = boxes.find((x) => inRect(x, ev.x, ev.y));
    hot = b?.id || null;
    if (b && ev.type === 'up') cb.onSelect?.(b.id);
    return { cursor: b ? 'pointer' : 'default', handled: Boolean(b) };
  }

  return {
    setState(n) { state = { ...state, ...n }; },
    update(dt) { clock += dt; },
    render,
    panelFrame,
    onPointer,
    getBoxes: () => layoutEntries().map(({ id, x, y, w, h }) => ({ id, x, y, w, h })),
  };
}
