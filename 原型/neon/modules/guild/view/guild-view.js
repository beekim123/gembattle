// 工会的板（画在大厅右边那块里）：任务 / 商店 / 等级三页。只画和收点击，规则在 rules/。

import { CREAM, F, GOLD, T, inRect, panelButton, sectionTitle, tabRow, txt, wrapText } from '../../ui/index.js';
import { rankInfo, shopList, submittableCount } from '../rules/guild-rules.js';

const SLOT_LABEL = { weapon: '武器', armor: '护身', trinket: '饰品' };

/**
 * @param {object} options
 * @param {object} options.callbacks onTake(id) / onAbandon(id) / onSubmit(id) / onSubmitAll() / onBuy(id)
 */
export function createGuildView(options = {}) {
  const cb = options.callbacks || {};
  let state = null; // { save, content }
  let tab = 'quests';
  let boxes = [];
  let hot = null;

  const qdef = (id) => (state.content.hiddenQuest?.id === id ? state.content.hiddenQuest : state.content.quests[id]);

  function render(r, P) {
    boxes = [];
    if (!state) return;
    const { save } = state;
    const x0 = P.x + 24;
    txt(r, '工会', x0, P.y + 30, { size: F.xl, weight: 'bold', color: CREAM });
    txt(r, `冒险家等级 ${save.rank} · 金币 ${save.gold}`, P.x + P.w - 56, P.y + 30, { size: F.s, align: 'right', color: GOLD });
    const tabs = tabRow(r, x0, P.y + 54, [
      { id: 'quests', label: '任务', badge: submittableCount(save) || null },
      { id: 'shop', label: '商店' },
      { id: 'rank', label: '等级' },
    ], tab, hot);
    tabs.forEach((t) => boxes.push({ ...t, onClick: () => { tab = t.id.slice(4); } }));
    const top = P.y + 100;
    if (tab === 'quests') drawQuests(r, P, x0, top);
    else if (tab === 'shop') drawShop(r, P, x0, top);
    else drawRank(r, P, x0, top);
  }

  function questRow(r, x, y, w, def, right, sub, col = T.text) {
    r.rect({ x: x - 8, y, w: w + 16, h: 38, radius: 8, fill: '#11151d', stroke: '#2c3446', lineWidth: 1 });
    r.rect({ x, y: y + 11, w: 22, h: 16, radius: 4, fill: def.grade === 'B' ? '#5a7ac8' : '#6a8a5a' });
    txt(r, def.grade, x + 11, y + 19, { size: F.xs, weight: 'bold', align: 'center', color: '#0b0d12' });
    txt(r, def.label, x + 30, y + 13, { size: F.s, weight: 'bold', color: col });
    txt(r, sub, x + 30, y + 29, { size: F.xs, color: T.text3 });
    right.forEach((b) => {
      panelButton(r, b, b.label, { hot: hot === b.id, kind: b.kind || 'normal', disabled: b.disabled });
      if (!b.disabled) boxes.push(b);
    });
  }

  /** 挤的时候用的一行（做完了的有两个以上）：名字和报酬写一行，高 30 */
  function questRowSlim(r, x, y, w, def, right, sub) {
    r.rect({ x: x - 8, y, w: w + 16, h: 28, radius: 8, fill: '#11151d', stroke: '#2c3446', lineWidth: 1 });
    r.rect({ x, y: y + 6, w: 22, h: 16, radius: 4, fill: def.grade === 'B' ? '#5a7ac8' : '#6a8a5a' });
    txt(r, def.grade, x + 11, y + 14, { size: F.xs, weight: 'bold', align: 'center', color: '#0b0d12' });
    txt(r, def.label, x + 30, y + 14, { size: F.xs, weight: 'bold' });
    txt(r, sub, right[0].x - 10, y + 14, { size: F.xs, color: T.text3, align: 'right' });
    right.forEach((b) => {
      panelButton(r, b, b.label, { hot: hot === b.id, kind: b.kind || 'normal', disabled: b.disabled, size: F.xs });
      if (!b.disabled) boxes.push(b);
    });
  }

  function drawQuests(r, P, x0, top) {
    const { save } = state;
    const w = P.w - 48;
    let y = top;
    const done = save.quests.taken.filter((q) => q.done);
    const doing = save.quests.taken.filter((q) => !q.done);
    if (done.length) {
      sectionTitle(r, x0, y + 6, '做完了，点提交', '');
      if (done.length > 1) {
        const b = { id: 'submit-all', x: x0 + w - 90, y: y - 6, w: 90, h: 24, label: '全部提交', onClick: () => cb.onSubmitAll?.() };
        panelButton(r, b, b.label, { hot: hot === b.id, kind: 'primary', size: F.xs });
        boxes.push(b);
      }
      y += 22;
      // 做完的有两个以上就用窄的一行，给下面的任务板留位子（第 3 轮审核 S3：原来下面的任务放不下就悄悄不画了）
      const slim = done.length >= 2;
      done.forEach((q) => {
        const d = qdef(q.id);
        if (slim) {
          questRowSlim(r, x0, y, w, d, [{ id: `submit-${q.id}`, x: x0 + w - 60, y: y + 4, w: 60, h: 20, label: '提交', kind: 'primary', onClick: () => cb.onSubmit?.(q.id) }], `报酬 ${d.reward}${d.rankUp ? ' · 升一级' : ''}`);
          y += 32;
          return;
        }
        questRow(r, x0, y, w, d, [{ id: `submit-${q.id}`, x: x0 + w - 70, y: y + 7, w: 70, h: 24, label: '提交', kind: 'primary', onClick: () => cb.onSubmit?.(q.id) }], `报酬 ${d.reward} 金币${d.rankUp ? ' · 交了升一级' : ''}${d.unlockBuff ? ' · 解锁一个加成' : ''}`, T.connect);
        y += 44;
      });
    }
    sectionTitle(r, x0, y + 6, `接着的 ${save.quests.taken.filter((q) => !q.hidden).length}/3`, doing.length ? '做到一半的进度存着' : '');
    y += 22;
    if (!doing.length) { txt(r, done.length ? '接着的都做完了，在上面点提交' : '还没接任务，从下面挑', x0, y + 8, { size: F.xs, color: T.text3 }); y += 24; }
    doing.forEach((q) => {
      const d = qdef(q.id);
      questRow(r, x0, y, w, d, [{ id: `abandon-${q.id}`, x: x0 + w - 60, y: y + 7, w: 60, h: 24, label: '放弃', onClick: () => cb.onAbandon?.(q.id) }], `进度 ${q.progress}/${d.count} · 报酬 ${d.reward}`);
      y += 44;
    });
    const full = save.quests.taken.filter((q) => !q.hidden).length >= 3;
    sectionTitle(r, x0, y + 6, '任务板', full ? '接满 3 个了' : '能接到高一级的');
    y += 22;
    const list = [...save.quests.failed.map((id) => ({ id, failed: true })), ...save.quests.board.map((id) => ({ id }))];
    const fit = Math.max(0, Math.floor((P.y + P.h - 20 - y) / 44));
    const shown = list.length > fit ? Math.max(0, fit - 1) : list.length; // 放不下就留一行写「还有几个」
    if (shown < list.length) txt(r, `还有 ${list.length - shown} 个放不下：先提交、放弃上面的，或者先出发`, x0, y + shown * 44 + 12, { size: F.xs, color: T.text3 });
    list.slice(0, shown).forEach((it) => {
      const d = qdef(it.id);
      if (!d) return;
      questRow(r, x0, y, w, d, [{ id: `take-${it.id}`, x: x0 + w - 60, y: y + 7, w: 60, h: 24, label: '接', disabled: full, onClick: () => cb.onTake?.(it.id) }], `${it.failed ? '上次失败的 · ' : ''}报酬 ${d.reward} 金币${d.rankUp ? ' · 升级任务' : ''}`, it.failed ? '#ffb3ba' : T.text);
      y += 44;
    });
  }

  function drawShop(r, P, x0, top) {
    const { save, content } = state;
    const w = P.w - 48;
    txt(r, '装备会磨损：每出一趟磨 1 点，磨到 0 就坏了。坏了能再买', x0, top + 4, { size: F.xs, color: T.text3 });
    let y = top + 16;
    for (const slot of ['weapon', 'armor', 'trinket']) {
      sectionTitle(r, x0, y + 6, SLOT_LABEL[slot]);
      y += 16;
      shopList(save, content).filter((g) => g.slot === slot).forEach((g) => {
        const have = save.gear.owned.filter((o) => o.id === g.id);
        r.rect({ x: x0 - 8, y, w: w + 16, h: 27, radius: 8, fill: '#11151d', stroke: '#2c3446', lineWidth: 1 });
        txt(r, g.label, x0, y + 13, { size: F.xs, weight: 'bold' });
        txt(r, `${g.uses} 趟${have.length ? ` · 有 ${have.length} 件（还剩 ${have.map((o) => o.wear).join('、')} 趟）` : ''}`, x0 + w - 92, y + 13, { size: F.xs, color: have.length ? T.connect : T.text3, align: 'right' });
        const b = { id: `buy-${g.id}`, x: x0 + w - 84, y: y + 3, w: 84, h: 21, onClick: () => cb.onBuy?.(g.id) };
        panelButton(r, b, `买 ${g.price}`, { hot: hot === b.id, disabled: save.gold < g.price, size: F.xs });
        if (save.gold >= g.price) boxes.push(b);
        y += 30;
      });
    }
  }

  function drawRank(r, P, x0, top) {
    const info = rankInfo(state.save);
    const w = P.w - 48;
    txt(r, info.rank, x0 + 40, top + 50, { size: 64, weight: 'bold', color: GOLD, align: 'center' });
    txt(r, `${info.rank} 级做完 ${info.done}/${info.need} 个任务`, x0 + 100, top + 36, { size: F.m, weight: 'bold' });
    txt(r, info.canRankUp ? '任务板上出了升级任务：打外头区的看门的，交了升 B 级' : `再做 ${Math.max(0, info.need - info.done)} 个，任务板上会出升级任务`, x0 + 100, top + 60, { size: F.s, color: info.canRankUp ? T.connect : T.text2 });
    const rows = [
      ['B 级解锁', '能接 A 级任务 · 商店多一批装备 · 雇队友的席位变 2 个 · 招募多一个战士'],
      ['A 级解锁', '每回合补牌永久 +1（里程碑）· 能从中间区进（原型没做）'],
      ['以后', '中间区、深处区原型没做，到 B 级以后先在外头区接着打'],
    ];
    let y = top + 110;
    rows.forEach(([a, b]) => {
      txt(r, a, x0, y, { size: F.s, weight: 'bold', color: CREAM });
      wrapText(r, b, w - 90, { size: F.xs }).forEach((ln, i) => txt(r, ln, x0 + 80, y + i * 16, { size: F.xs, color: T.text2 }));
      y += 44;
    });
  }

  function onPointer(ev) {
    const hit = [...boxes].reverse().find((b) => inRect(b, ev.x, ev.y));
    hot = hit?.id || null;
    if (ev.type === 'up' && hit) hit.onClick?.();
    return { cursor: hit ? 'pointer' : 'default' };
  }

  return {
    setState(next) { state = next; },
    render,
    onPointer,
    update() {},
    getBoxes: () => boxes.map((b) => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h })),
    setTab(t) { tab = t; },
  };
}
