// 大厅各个板（工会、招募、出发、卡册）共用的小件：按钮、页签、小标题、一行说明。
// 只画，不管点了干什么；每个都返回能点的框，调用方自己存起来做命中。

import { F, T, txt } from './kit.js';

export const CREAM = '#efe2c4';
export const GOLD = '#ffd79a';

/** 按钮。kind：normal / primary（金色）/ ghost（只有字） */
export function panelButton(r, b, label, { hot = false, kind = 'normal', disabled = false, size = F.s } = {}) {
  const a = disabled ? 0.4 : 1;
  if (kind === 'primary') {
    r.rect({ x: b.x, y: b.y + 3, w: b.w, h: b.h, radius: 10, fill: '#6b5226', alpha: a });
    r.rect({ x: b.x, y: b.y, w: b.w, h: b.h, radius: 10, fill: hot && !disabled ? '#f0c87a' : '#d9b264', alpha: a });
    txt(r, label, b.x + b.w / 2, b.y + b.h / 2, { size, weight: 'bold', align: 'center', color: '#2a1e08', alpha: a });
  } else if (kind === 'ghost') {
    txt(r, label, b.x + b.w / 2, b.y + b.h / 2, { size, weight: 'bold', align: 'center', color: hot && !disabled ? GOLD : T.text2, alpha: a });
  } else {
    r.rect({ x: b.x, y: b.y, w: b.w, h: b.h, radius: 8, fill: hot && !disabled ? '#2c3650' : '#1b2030', stroke: hot && !disabled ? GOLD : '#3e4862', lineWidth: 1, alpha: a });
    txt(r, label, b.x + b.w / 2, b.y + b.h / 2, { size, weight: 'bold', align: 'center', color: T.text, alpha: a });
  }
  return b;
}

/** 一排页签，返回每个页签的框 { id, x, y, w, h } */
export function tabRow(r, x, y, items, active, hot) {
  let cx = x;
  return items.map((it) => {
    const w = r.measureText(it.label, { size: F.m, weight: 'bold' }).width + 24;
    const b = { id: `tab-${it.id}`, x: cx, y, w, h: 30 };
    const on = it.id === active;
    if (on) r.rect({ x: cx, y: y + 27, w, h: 3, radius: 1, fill: GOLD });
    txt(r, it.label, cx + w / 2, y + 14, { size: F.m, weight: 'bold', align: 'center', color: on ? GOLD : hot === b.id ? CREAM : T.text2 });
    if (it.badge) {
      r.circle({ x: cx + w - 6, y: y + 4, r: 8, fill: T.connect });
      txt(r, String(it.badge), cx + w - 6, y + 4, { size: F.xs, weight: 'bold', align: 'center', color: '#0b0d12' });
    }
    cx += w + 6;
    return b;
  });
}

/** 小标题 + 右边一句淡字 */
export function sectionTitle(r, x, y, title, note = '', w = 0) {
  txt(r, title, x, y, { size: F.s, weight: 'bold', color: CREAM });
  if (note) txt(r, note, w ? x + w : x + r.measureText(title, { size: F.s, weight: 'bold' }).width + 10, y, { size: F.xs, color: T.text3, align: w ? 'right' : 'left' });
}

export function inRect(b, x, y) {
  return Boolean(b) && x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}
