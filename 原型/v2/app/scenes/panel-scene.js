// 战斗以外的所有画面：标题、战利品、营火整备、行商营帐、林中偶遇、青苔界门、结算。
// 一个场景类、立即模式：每帧把按钮和卡片摆出来，同时登记点击区域；规则全在 run-rules。
import {
  takeLoot, offerSeals, addSeal, offerArcana, addArcana, gemCards, applyCarve, carveOptions, campOptions, campHeal, campPurge, campCarve,
  buy, payCarve, canBuy, optionCheck, chooseOption, finishPurgeForGold, finishCarveJunk, removable, summarize, biomeOfNode, nodeOf,
} from '../../modules/run-rules/index.js';
import { SEALS, LINES, ARCANA, CARVES, JUNK, LOOT, EVENTS, BIOMES, HERO_LOOK, SHOP_PRICE } from '../../modules/content/index.js';
import { COLOR_NAMES } from '../../modules/shared/index.js';
import { drawActor, createEnv } from '../../modules/render/index.js';
import { audio } from '../../modules/audio/index.js';
import { recorder, copyText } from '../record.js';
import {
  text, panel, wrap, roundRect, drawHearts, drawCard, CARD_W, CARD_H, GOLD, WHEEL_HEX, drawLootBadge, LOOT_HEX, carveHex,
  layoutDeckGrid, drawDeckGrid, hitDeckGrid, font,
} from '../../modules/ui/index.js';

const LINE_HEX = { shield: '#8ff0ff', white: '#ffffff', rainbow: '#ffb0f0', hold: '#ffd24a', chain: '#9aff9a' };

export class PanelScene {
  constructor() { this.t = 0; this.hits = []; this.mx = 0; this.my = 0; this.screen = null; this.env = null; this.hooks = null; this.trip = null; this.copiedAt = -1; }

  // ---------- 入口 ----------
  setEnv(biome, seed, opts) { this.env = createEnv(biome, seed, opts); audio.scene('explore', { biome }); }
  title(hooks) {
    this.hooks = hooks; this.trip = null; this.setEnv('forest', 3);
    this.screen = { kind: 'title' };
  }
  loot(trip, kind, hooks) {
    this.trip = trip; this.hooks = hooks; this.setEnv('forest', trip.seed + trip.battleIndex);
    const r = takeLoot(trip, kind);
    if (r.choice === 'seal') this.screen = { kind: 'sealPick', options: offerSeals(trip), title: '战利品：选 1 个秘宝印记' };
    else if (r.choice === 'arcana') this.screen = { kind: 'arcanaPick', options: offerArcana(trip), title: '战利品：选 1 张秘术牌（可以不要）' };
    else if (r.choice === 'carve') this.startCarve('loot');
    else this.screen = { kind: 'result', title: `战利品：${LOOT[r.kind].name}`, lines: [r.text] };
  }
  camp(trip, hooks) {
    this.trip = trip; this.hooks = hooks; this.setEnv('camp', trip.seed + trip.step);
    this.screen = { kind: 'camp', opts: campOptions(trip), done: null };
  }
  shop(trip, hooks) {
    this.trip = trip; this.hooks = hooks; this.setEnv('trade', trip.seed + trip.step);
    this.screen = { kind: 'shop', msg: '' };
  }
  event(trip, node, hooks) {
    this.trip = trip; this.hooks = hooks; this.setEnv(biomeOfNode(node), trip.seed + trip.step * 3);
    this.screen = { kind: 'event', id: node.eventId, stage: 'ask' };
  }
  gate(trip, hooks) {
    this.trip = trip; this.hooks = hooks; this.setEnv('gate', trip.seed + 11);
    this.screen = { kind: 'gate' };
  }
  summary(trip, hooks) {
    this.trip = trip; this.hooks = hooks; this.setEnv(trip.ended?.kind === 'victory' ? 'canopy' : 'forest', trip.seed + 17);
    this.copiedAt = -1;
    audio.scene('result', { variant: trip.ended?.kind === 'defeat' ? 'lose' : 'win' });     // 结算短乐句
    this.screen = { kind: 'summary', s: summarize(trip) };
  }

  update(dt) { this.t += dt; if (this.env) this.env.update(dt); }

  // ---------- 输入 ----------
  pointerMove(x, y) { this.mx = x; this.my = y; }
  pointerDown(x, y) {
    this.pointerMove(x, y);
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { if (h.enabled !== false && h.fn) { audio.sfx('click'); h.fn(); } return; }
    }
  }
  pointerUp() {}
  key(k) {
    if (this.screen?.kind === 'title' && (k === ' ' || k === 'Enter')) this.hooks.onStart();
  }

  // ---------- 小件 ----------
  over(h) { return this.mx >= h.x && this.mx <= h.x + h.w && this.my >= h.y && this.my <= h.y + h.h; }
  button(ctx, label, x, y, w, h, fn, { accent = false, enabled = true, size = 15 } = {}) {
    const hit = { x, y, w, h, fn, enabled }; this.hits.push(hit);
    const hov = enabled && this.over(hit);
    roundRect(ctx, x, y, w, h, 7);
    ctx.fillStyle = !enabled ? 'rgba(40,46,40,0.6)' : accent ? (hov ? '#e8b92c' : '#c99a1c') : (hov ? 'rgba(90,110,90,0.95)' : 'rgba(46,62,48,0.92)');
    ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = enabled ? (accent ? '#ffe9a0' : 'rgba(255,255,255,0.5)') : 'rgba(255,255,255,0.12)'; ctx.stroke();
    text(ctx, label, x + w / 2, y + h / 2 + 1, { size, align: 'center', color: enabled ? '#fff' : 'rgba(255,255,255,0.4)', outline: null, weight: 700 });
  }
  // 一张选项卡：标题、副标题、说明
  choice(ctx, x, y, w, h, o, fn) {
    const enabled = o.enabled !== false;
    const hit = { x, y, w, h, fn, enabled }; this.hits.push(hit);
    const hov = enabled && this.over(hit);
    ctx.save();
    if (hov) { ctx.translate(0, -4); }
    roundRect(ctx, x, y, w, h, 9);
    ctx.fillStyle = enabled ? (hov ? 'rgba(40,56,44,0.98)' : 'rgba(20,32,24,0.95)') : 'rgba(30,32,30,0.9)'; ctx.fill();
    ctx.lineWidth = hov ? 3 : 2; ctx.strokeStyle = enabled ? (o.color || 'rgba(255,255,255,0.5)') : 'rgba(255,255,255,0.15)'; ctx.stroke();
    text(ctx, o.title, x + w / 2, y + 22, { size: 17, align: 'center', color: enabled ? (o.color || GOLD) : '#8a8a80', weight: 800 });
    let yy = y + 44;
    if (o.sub) { text(ctx, o.sub, x + w / 2, yy, { size: 12, align: 'center', color: '#cfd8dc', outline: null }); yy += 20; }
    wrap(ctx, o.text || '', w - 20, 12).forEach(l => { text(ctx, l, x + w / 2, yy, { size: 12, align: 'center', color: enabled ? '#f0ece0' : '#8a8a80', weight: 500, outline: null }); yy += 17; });
    if (o.foot) text(ctx, o.foot, x + w / 2, y + h - 16, { size: 13, align: 'center', color: o.footColor || (enabled ? '#fff' : '#8a8a80'), weight: 800, outline: null });
    ctx.restore();
  }
  backdrop(ctx, a = 0.5) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, 960, 540); }
  header(ctx, title, sub) {
    panel(ctx, 220, 34, 520, sub ? 66 : 44, 'rgba(10,16,12,0.85)', 'rgba(255,255,255,0.3)');
    text(ctx, title, 480, 56, { size: 20, align: 'center', color: GOLD, weight: 800 });
    if (sub) text(ctx, sub, 480, 82, { size: 13, align: 'center', color: '#e8e0c8', outline: null });
  }
  status(ctx) {
    const t = this.trip; if (!t) return;
    ctx.fillStyle = 'rgba(8,16,10,0.7)'; ctx.fillRect(0, 0, 960, 28);
    drawHearts(ctx, 20, 14, t.player.hearts, t.player.maxHearts, 8);
    text(ctx, `金币 ${t.gold}`, 120, 14, { size: 13, color: GOLD });
    text(ctx, `手牌 N = ${t.player.handBase}`, 200, 14, { size: 13, color: '#cfd8dc' });
    text(ctx, `攻击 ${t.player.atk}`, 290, 14, { size: 13, color: '#cfd8dc' });
    text(ctx, `牌组 ${t.deckCards.length} 张`, 370, 14, { size: 13, color: '#cfd8dc' });
    // 印记名字太长就只写个数，别压到右上角的音乐 / 音效按钮
    let seals = t.player.seals.length ? '印记：' + t.player.seals.map(id => SEALS[id].name).join('、') : '还没有秘宝印记';
    ctx.font = font(12, 600);
    if (ctx.measureText(seals).width > 270) seals = `秘宝印记 ${t.player.seals.length} 个（悬停路线图上的小图标看说明）`;
    text(ctx, seals, 470, 14, { size: 12, color: '#ffe9a0' });
  }

  // ---------- 绘制 ----------
  draw(ctx) {
    this.hits = [];
    if (this.env) this.env.draw(ctx);
    const s = this.screen; if (!s) return;
    this['draw_' + s.kind](ctx, s);
    if (s.kind !== 'title' && s.kind !== 'summary') this.status(ctx);
  }

  draw_title(ctx) {
    ctx.fillStyle = 'rgba(6,14,8,0.45)'; ctx.fillRect(0, 0, 960, 540);
    text(ctx, '落果密林', 480, 110, { size: 60, align: 'center', color: '#ffe9a0', weight: 800 });
    text(ctx, 'code00 · 一局清晰的主线（第 1 步 到 第 8 步）', 480, 160, { size: 16, align: 'center', color: '#d8e8c8' });
    drawActor(ctx, HERO_LOOK, 480, 318, { t: this.t, scale: 1.5 });
    this.button(ctx, '深入林地', 390, 350, 180, 48, () => this.hooks.onStart(), { accent: true, size: 20 });
    this.button(ctx, '核心试玩（4 场教学仗）', 390, 410, 180, 32, () => this.hooks.onTutorial(), { size: 13 });
    text(ctx, '拖牌进链尾，空格施法；链里的牌不能再拖，放错了点「退回一张」或「清空」。', 480, 470, { size: 13, align: 'center', color: '#c8d8c0' });
    text(ctx, '一趟 8 步：路线图上挑路 → 打怪拿战利品 → 第 4 步打完在青苔界门选「折返结算」或「深入腹地」→ 第 8 步林地首领。', 480, 492, { size: 12, align: 'center', color: '#a8c0a0' });
  }

  draw_result(ctx, s) {
    this.backdrop(ctx, 0.45);
    panel(ctx, 270, 170, 420, 200, 'rgba(14,22,16,0.96)', GOLD);
    text(ctx, s.title, 480, 204, { size: 22, align: 'center', color: GOLD, weight: 800 });
    s.lines.forEach((l, i) => text(ctx, l, 480, 252 + i * 24, { size: 15, align: 'center' }));
    this.button(ctx, '继续', 405, 310, 150, 36, () => this.hooks.onDone(), { accent: true });
  }

  draw_sealPick(ctx, s) {
    this.backdrop(ctx, 0.5);
    this.header(ctx, s.title, '拿过哪条路子，后面三选一就向它收窄：路子拿齐了才有联动');
    const w = 200, h = 200, gap = 20, x0 = 480 - (s.options.length * w + (s.options.length - 1) * gap) / 2;
    s.options.forEach((id, i) => {
      const sd = SEALS[id], owned = this.trip.player.seals.some(o => SEALS[o].line === sd.line);
      this.choice(ctx, x0 + i * (w + gap), 130, w, h, { title: sd.name, sub: LINES[sd.line].name + (owned ? '（你拿过的路子）' : ''), text: sd.text, color: LINE_HEX[sd.line] }, () => {
        addSeal(this.trip, id);
        this.afterPick(`拿到秘宝印记：${sd.name}`);
      });
    });
    this.ownedSeals(ctx, 350);
  }
  ownedSeals(ctx, y) {
    const p = this.trip.player.seals;
    text(ctx, p.length ? '已有印记：' + p.map(id => `${SEALS[id].name}（${LINES[SEALS[id].line].name}）`).join('、') : '还没有秘宝印记', 480, y, { size: 13, align: 'center', color: '#e8e0c8' });
  }
  afterPick(msg) {
    audio.sfx('reward');
    if (this.screen.thenJunk) finishCarveJunk(this.trip);
    this.screen = { kind: 'result', title: msg, lines: this.screen.thenJunk ? ['往牌组里塞进了 1 张缠藤废牌。'] : ['已加入这一趟。'] };
  }

  draw_arcanaPick(ctx, s) {
    this.backdrop(ctx, 0.5);
    this.header(ctx, s.title, '拿到的秘术牌会混进 29 张宝石牌的循环里');
    const w = 200, h = 200, gap = 20, x0 = 480 - (s.options.length * w + (s.options.length - 1) * gap) / 2;
    s.options.forEach((id, i) => {
      const a = ARCANA[id];
      this.choice(ctx, x0 + i * (w + gap), 130, w, h, { title: a.name, sub: a.kind === 'instant' ? '瞬发秘术（无色，不占链位）' : '入链秘术（带色，拖进链尾）', text: a.text, color: a.kind === 'instant' ? '#b8a8ff' : '#ffd24a' }, () => {
        addArcana(this.trip, id);
        this.afterPick(`拿到秘术牌：${a.name}`);
      });
    });
    this.button(ctx, '都不要', 405, 360, 150, 34, () => { this.screen = { kind: 'result', title: '没有拿秘术牌', lines: ['牌组保持原样。'] }; });
  }

  // 从牌组里挑一张牌的网格。filter 决定哪些牌能选；onPick 在选中后调用。
  draw_pickGrid(ctx, s) {
    this.backdrop(ctx, 0.62);
    panel(ctx, 150, 34, 660, 490, 'rgba(14,22,16,0.97)', 'rgba(255,255,255,0.3)');
    text(ctx, s.title, 480, 56, { size: 18, align: 'center', color: GOLD, weight: 800 });
    if (s.sub) text(ctx, s.sub, 480, 80, { size: 13, align: 'center', color: '#e8e0c8', outline: null });
    const items = layoutDeckGrid(s.cards, 190, 98, { gemsOnly: s.gemsOnly });
    const hover = hitDeckGrid(items, this.mx, this.my);
    drawDeckGrid(ctx, items, 190, 98, { hover: hover && s.filter(hover) ? hover : null, dimFn: c => !s.filter(c) });
    for (const it of items) if (s.filter(it.card)) this.hits.push({ x: it.x - 14, y: it.y - 22, w: 28, h: 44, fn: () => s.onPick(it.card) });
    if (hover) {
      const c = hover;
      const lines = c.arcana ? [ARCANA[c.arcana].name, ARCANA[c.arcana].text] : c.junk ? [JUNK.name, JUNK.text]
        : [`${COLOR_NAMES[c.color]}牌${(c.carve || []).length ? '，已有雕琢' : ''}`, ...(c.carve || []).map(k => `${CARVES[k].name}：${CARVES[k].text}`)];
      const w = 230, wr = lines.map((ln, k) => wrap(ctx, ln, w - 16, k === 0 ? 14 : 12)), h = 14 + wr.reduce((a, l) => a + l.length, 0) * 17;
      const x = Math.min(950 - w, this.mx + 14), y = Math.min(515 - h, this.my + 14);
      panel(ctx, x, y, w, h, 'rgba(10,16,12,0.96)', 'rgba(255,255,255,0.4)');
      let yy = y + 15;
      wr.forEach((ls, k) => ls.forEach(l => { text(ctx, l, x + 8, yy, { size: k === 0 ? 14 : 12, align: 'left', weight: k === 0 ? 800 : 500, color: k === 0 ? GOLD : '#fff', outline: null }); yy += 17; }));
    }
    if (s.onCancel) this.button(ctx, '放弃', 700, 490, 90, 28, s.onCancel, { size: 13 });
  }

  // ---------- 宝石雕琢：先挑牌，再挑方向 ----------
  carveFlow(after, cancel) {
    const trip = this.trip;
    this.screen = {
      kind: 'pickGrid', title: '宝石雕琢：挑 1 张宝石牌', sub: '29 张宝石牌里任挑 1 张（秘术牌和废牌不能雕琢）', cards: trip.deckCards, gemsOnly: true,
      filter: c => !c.arcana && !c.junk && carveOptions(c).length > 0,
      onPick: card => { this.screen = { kind: 'carveKind', card, after, cancel }; },
      onCancel: cancel,
    };
  }
  draw_carveKind(ctx, s) {
    this.backdrop(ctx, 0.55);
    this.header(ctx, `雕琢这张 ${COLOR_NAMES[s.card.color]} 牌：四选一`, '同一张牌同一种雕琢只能有一次，不同方向可以叠');
    ctx.save(); ctx.translate(150, 250); ctx.scale(1.6, 1.6); drawCard(ctx, s.card); ctx.restore();
    const w = 170, h = 190, gap = 14, x0 = 250;
    Object.values(CARVES).forEach((c, i) => {
      const have = (s.card.carve || []).includes(c.id);
      this.choice(ctx, x0 + i * (w + gap), 130, w, h, { title: c.name, sub: have ? '这张牌已经有了' : '', text: c.text, color: carveHex(c.id), enabled: !have }, () => { s.after(s.card, c.id); });
    });
    if (s.cancel) this.button(ctx, '回去重新挑牌', 405, 340, 150, 32, () => this.carveFlow(s.after, s.cancel), { size: 13 });
    else this.button(ctx, '回去重新挑牌', 405, 340, 150, 32, () => this.carveFlow(s.after, s.cancel), { size: 13 });
  }

  // 雕琢流程的四个出口：战利品 / 营火 / 行商 / 古碑
  startCarve(mode, extra = {}) {
    const trip = this.trip;
    const finish = (card, kind) => {
      audio.sfx('reward');
      if (mode === 'loot') { applyCarve(trip, card.uid, kind); this.screen = { kind: 'result', title: `${COLOR_NAMES[card.color]}牌：${CARVES[kind].name}`, lines: [CARVES[kind].text] }; }
      else if (mode === 'camp') { campCarve(trip, card.uid, kind); this.screen = { kind: 'result', title: `${COLOR_NAMES[card.color]}牌：${CARVES[kind].name}`, lines: [CARVES[kind].text], leave: true }; }
      else if (mode === 'shop') { applyCarve(trip, card.uid, kind); payCarve(trip, extra.item); this.screen = { kind: 'shop', msg: `买下了宝石雕琢：${COLOR_NAMES[card.color]}牌 ${CARVES[kind].name}` }; }
      else if (mode === 'stele') { applyCarve(trip, card.uid, kind); finishCarveJunk(trip); this.screen = { kind: 'result', title: `${COLOR_NAMES[card.color]}牌：${CARVES[kind].name}`, lines: [CARVES[kind].text, '往牌组里塞进了 1 张缠藤废牌。'] }; }
    };
    this.carveFlow(finish, extra.cancel || null);
  }

  // ---------- 营火整备 ----------
  draw_camp(ctx, s) {
    ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fillRect(0, 0, 960, 540);
    drawActor(ctx, HERO_LOOK, 395, 318, { t: this.t, scale: 1 });
    this.header(ctx, '营火整备', s.done ? s.done : '三选一，选了就整备完毕');
    if (s.done) { this.button(ctx, '继续赶路', 405, 400, 150, 38, () => this.hooks.onDone(), { accent: true }); return; }
    const w = 220, h = 118, gap = 24, x0 = 480 - (3 * w + 2 * gap) / 2, y = 392;
    const trip = this.trip;
    const [oh, oc, op] = s.opts;
    this.choice(ctx, x0, y, w, h, { title: oh.name, text: oh.text + `（现在 ${trip.player.hearts} / ${trip.player.maxHearts} 颗）`, color: '#ff8a98' }, () => {
      const g = campHeal(trip); s.done = g > 0 ? `回了 ${g} 颗心` : '心本来就是满的';
    });
    this.choice(ctx, x0 + w + gap, y, w, h, { title: oc.name, text: oc.text, color: '#6ad8ff' }, () => this.startCarve('camp', { cancel: () => { this.screen = s; } }));
    this.choice(ctx, x0 + 2 * (w + gap), y, w, h, { title: op.name, text: op.text, color: '#c8e0a0' }, () => {
      if (op.fallback) { campPurge(trip); s.done = '没有可删的牌：攻击 +10'; return; }
      this.screen = {
        kind: 'pickGrid', title: '清理行囊：删掉 1 张秘术牌或废牌', sub: '宝石牌不能删', cards: trip.deckCards, gemsOnly: false,
        filter: c => !!(c.arcana || c.junk),
        onPick: card => { campPurge(trip, card.uid); s.done = '删掉了一张牌'; this.screen = s; },
        onCancel: () => { this.screen = s; },
      };
    });
  }
  draw_result_leave() {}

  // ---------- 行商营帐 ----------
  draw_shop(ctx, s) {
    const trip = this.trip;
    drawActor(ctx, 'npc_gear_smith', 285, 282, { t: this.t, scale: 1 });
    drawActor(ctx, HERO_LOOK, 650, 304, { t: this.t, scale: 1 });
    this.header(ctx, '行商营帐', s.msg || `花本趟打怪掉落的金币。你有 ${trip.gold} 金币`);
    const w = 140, h = 156, gap = 8, x0 = 480 - (6 * w + 5 * gap) / 2, y = 340;
    trip.shop.forEach((it, i) => {
      let o;
      if (it.kind === 'seal') { const sd = SEALS[it.ref]; o = { title: sd.name, sub: '秘宝印记 · ' + LINES[sd.line].name, text: sd.text, color: LINE_HEX[sd.line] }; }
      else if (it.kind === 'arcana') { const a = ARCANA[it.ref]; o = { title: a.name, sub: a.kind === 'instant' ? '秘术牌 · 瞬发' : '秘术牌 · 入链', text: a.text, color: '#ffd24a' }; }
      else if (it.kind === 'carve') o = { title: '宝石雕琢', sub: '1 次', text: '任挑 1 张宝石牌，四选一加方向。', color: '#6ad8ff' };
      else o = { title: '红果饮', sub: '1 瓶', text: '回半颗心。', color: '#ff8a98' };
      o.foot = it.sold ? '已售出' : `${it.price} 金币`;
      o.footColor = it.sold ? '#8a8a80' : trip.gold >= it.price ? GOLD : '#ff8a8a';
      o.enabled = canBuy(trip, it);
      this.choice(ctx, x0 + i * (w + gap), y, w, h, o, () => {
        if (it.kind === 'carve') this.startCarve('shop', { item: it, cancel: () => { this.screen = s; } });
        else { buy(trip, it); s.msg = `买下了${o.title}`; }
      });
    });
    this.button(ctx, '离开营帐', 805, 500, 130, 30, () => this.hooks.onLeave(), { accent: true });
  }

  // ---------- 林中偶遇 ----------
  draw_event(ctx, s) {
    const ev = EVENTS[s.id], trip = this.trip;
    drawActor(ctx, HERO_LOOK, 480, 300, { t: this.t, scale: 1 });
    if (s.stage === 'ask') {
      this.header(ctx, ev.name, ev.text);
      const w = 300, h = 110, gap = 30, x0 = 480 - (2 * w + gap) / 2, y = 400;
      ev.options.forEach((o, i) => {
        const chk = optionCheck(trip, ev.id, o.id);
        this.choice(ctx, x0 + i * (w + gap), y, w, h, { title: o.label, text: o.note + (chk.ok ? '' : `（${chk.reason}）`), color: '#e8e0c8', enabled: chk.ok }, () => this.pickEvent(s, ev, o));
      });
    }
  }
  pickEvent(s, ev, o) {
    const trip = this.trip, r = chooseOption(trip, ev.id, o.id);
    if (r.next === 'seal') this.screen = { kind: 'sealPick', options: r.options, title: `${ev.name}：选 1 个秘宝印记` };
    else if (r.next === 'carve') { this.startCarve('stele', { cancel: () => { this.screen = s; } }); }
    else if (r.next === 'purge') {
      this.screen = {
        kind: 'pickGrid', title: '以旧换钱：删 1 张秘术牌或废牌，换 25 金币', sub: '宝石牌不能换', cards: trip.deckCards, gemsOnly: false,
        filter: c => !!(c.arcana || c.junk),
        onPick: card => { finishPurgeForGold(trip, card.uid); this.screen = { kind: 'result', title: '换到了 25 金币', lines: ['那张牌已经从牌组里删掉了。'] }; },
        onCancel: () => { this.screen = s; },
      };
    } else if (r.next === 'done') this.screen = { kind: 'result', title: ev.name, lines: [r.text || '什么也没有发生。', ...(r.gotArcana ? ['拿到秘术牌：' + ARCANA[r.gotArcana].name] : [])] };
  }

  // ---------- 青苔界门 ----------
  draw_gate(ctx) {
    const trip = this.trip;
    drawActor(ctx, HERO_LOOK, 480, 404, { t: this.t, scale: 1, yaw: Math.PI });
    this.header(ctx, '青苔界门', '第 4 步打完了。门后面是密林腹地：收益更高，也更险');
    const w = 330, h = 150, y = 330;
    this.choice(ctx, 90, y, w, h, { title: '见好就收 · 折返结算', text: '带着现在攒下的金币和战利品，安全离开林地，看本趟战果。', color: '#9ad8a0' }, () => this.hooks.onChoose('retreat'));
    this.choice(ctx, 540, y, w, h, { title: '推开石门 · 深入腹地', text: '继续走第 5 到 8 步，最后是林地首领千丈古树精。中途心归 0，战利品全部丢掉。', color: '#ffb070' }, () => this.hooks.onChoose('advance'));
    panel(ctx, 250, 112, 460, 54, 'rgba(10,16,12,0.8)', 'rgba(255,255,255,0.25)');
    const p = trip.player;
    text(ctx, `现在手里：金币 ${trip.gold} · 印记 ${p.seals.length} 个 · 心 ${p.hearts}/${p.maxHearts} · 手牌 N = ${p.handBase}`, 480, 130, { size: 14, align: 'center' });
    text(ctx, `牌组 ${trip.deckCards.length} 张 · 雕琢 ${trip.stats.carves.length} 次 · 秘术牌 ${trip.stats.arcana.length} 张`, 480, 152, { size: 13, align: 'center', color: '#cfd8dc' });
  }

  // ---------- 结算 ----------
  draw_summary(ctx, s0) {
    const s = s0.s;
    ctx.fillStyle = 'rgba(6,12,8,0.6)'; ctx.fillRect(0, 0, 960, 540);
    panel(ctx, 200, 40, 560, 450, 'rgba(14,22,16,0.96)', GOLD);
    const head = s.outcome === 'victory' ? '击败千丈古树精 · 通关落果密林' : s.outcome === 'retreat' ? '见好就收 · 折返结算' : '倒下了 · 战利品尽失';
    text(ctx, head, 480, 76, { size: 26, align: 'center', color: s.outcome === 'defeat' ? '#ff8a8a' : GOLD, weight: 800 });
    const rows = [
      ['走到', `第 ${s.step} 步（共 ${s.steps} 步）`], ['打赢', `${s.battles} 场`], ['心', `${s.hearts} / ${s.maxHearts}`],
      ['金币', s.kept ? String(s.gold) : `${s.gold}（没带出去）`], ['手牌基数 N', String(s.handBase)], ['攻击', String(s.atk)],
      ['宝石等级', `红 ${s.gems[0]} · 绿 ${s.gems[1]} · 蓝 ${s.gems[2]}`],
    ];
    rows.forEach(([a, b], i) => { text(ctx, a, 250, 118 + i * 26, { size: 15, align: 'left', color: '#cfd8dc' }); text(ctx, b, 420, 118 + i * 26, { size: 15, align: 'left' }); });
    const list = (label, arr, y) => {
      text(ctx, label, 250, y, { size: 15, align: 'left', color: '#cfd8dc' });
      wrap(ctx, arr.length ? arr.join('、') : '没有', 330, 13).forEach((l, i) => text(ctx, l, 420, y + i * 18, { size: 13, align: 'left', outline: null }));
    };
    list('秘宝印记', s.seals.map(id => SEALS[id].name), 318);
    list('宝石雕琢', s.carves.map(c => `${COLOR_NAMES[c.color]}牌${CARVES[c.kind].name}`), 372);
    list('秘术牌', s.arcana.map(id => ARCANA[id].name), 426);
    this.button(ctx, this.copiedAt > 0 && this.t - this.copiedAt < 2.5 ? '已复制，发给我吧' : '复制试玩记录', 300, 452, 170, 32, async () => {
      if (await copyText(recorder.text(summarize(this.trip)))) this.copiedAt = this.t;
    }, { size: 14 });
    this.button(ctx, '再来一趟', 490, 452, 170, 32, () => this.hooks.onAgain(), { accent: true });
  }
}
