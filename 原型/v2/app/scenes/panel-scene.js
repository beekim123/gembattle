// 战斗以外的所有画面：标题、战利品、营火整备、行商营帐、林中偶遇、青苔界门、结算。
// 一个场景类、立即模式：每帧把按钮和卡片摆出来，同时登记点击区域；规则全在 run-rules。
import {
  takeLoot, offerSeals, addSeal, offerArcana, addArcana, gemCards, applyCarve, carveOptions, campOptions, campHeal, campPurge, campCarve,
  buy, payCarve, canBuy, optionCheck, chooseOption, finishPurgeForGold, finishCarveJunk, removable, summarize, biomeOfNode, nodeOf,
} from '../../modules/run-rules/index.js';
import { SEALS, LINES, ARCANA, CARVES, JUNK, LOOT, EVENTS, BIOMES, HERO_LOOK, SHOP_PRICE } from '../../modules/content/index.js';
import { COLOR_NAMES } from '../../modules/shared/index.js';
import { drawActor, createEnv, setView, flushWorld, camera, ViewInput } from '../../modules/render/index.js';
import { audio } from '../../modules/audio/index.js';
import { recorder, copyText } from '../record.js';
import {
  text, wrap, drawPanel, drawButton, drawHearts, drawCoin, drawCard, drawSealIcon, drawCarveBadge, drawLootBadge, drawChoiceIcon, drawSceneRibbon,
  drawTitleEmblem, drawSummaryCrest, drawTip, GOLD, carveHex, layoutDeckGrid, drawDeckGrid, hitDeckGrid, font,
} from '../../modules/ui/index.js';

const LINE_HEX = { shield: '#8ff0ff', white: '#ffffff', rainbow: '#ffb0f0', hold: '#ffd24a', chain: '#9aff9a' };
const arcCard = id => ({ uid: 'p' + id, color: ARCANA[id].kind === 'instant' ? -1 : (ARCANA[id].color ?? ARCANA[id].pool[0]), arcana: id });
// 选项卡上的图标：印记、秘术牌（缩小的牌面）、雕琢角标
const sealIcon = id => (ctx, cx, cy) => drawSealIcon(ctx, id, cx, cy, 34);
const arcanaIcon = id => (ctx, cx, cy) => { ctx.save(); ctx.translate(cx, cy + 4); ctx.scale(0.62, 0.62); drawCard(ctx, arcCard(id)); ctx.restore(); };
const carveIcon = id => (ctx, cx, cy) => drawCarveBadge(ctx, id, cx, cy, 30);
const choiceIcon = kind => (ctx, cx, cy) => drawChoiceIcon(ctx, kind, cx, cy, 30);
const EVENT_ICON = { old_wood: 'event_wood', moss_stele: 'event_stele', spring_pool: 'event_pool', hollow_bag: 'event_bag' };

// 能转镜头的画面：标题、营火、行商、青苔界门、林中偶遇（别的是盖满全屏的选牌和结果，转了也看不见）
const ROTATABLE = new Set(['title', 'camp', 'shop', 'gate', 'event']);

export class PanelScene {
  constructor() { this.t = 0; this.hits = []; this.mx = 0; this.my = 0; this.screen = null; this.env = null; this.hooks = null; this.trip = null; this.copiedAt = -1; this.viewIn = new ViewInput(); }

  // ---------- 入口 ----------
  // view：镜头设置。origin 是世界原点落在布局哪里，也是转镜头的中心，各画面放在主角或营火脚下
  setEnv(biome, seed, opts, view = {}) {
    setView({ mode: 'free', origin: [480, 300], ...view });
    this.viewIn.cancel();
    this.env = createEnv(biome, seed, opts); audio.scene('explore', { biome });
  }
  rotatable() { return !!this.screen && ROTATABLE.has(this.screen.kind); }
  title(hooks) {
    this.hooks = hooks; this.trip = null; this.setEnv('forest', 3, undefined, { origin: [480, 318], autoSpin: 0.12 });      // 标题页慢速缓转
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
    this.trip = trip; this.hooks = hooks; this.setEnv('camp', trip.seed + trip.step, undefined, { origin: [480, 292] });
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
  pointerMove(x, y) { this.mx = x; this.my = y; if (this.viewIn.active) this.viewIn.move(x); }
  pointerDown(x, y, btn = 0) {
    this.pointerMove(x, y);
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i];
      if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) { if (h.enabled !== false && h.fn) { audio.sfx('click'); h.fn(); } return; }
    }
    if (this.rotatable()) this.viewIn.down(x, btn);                  // 没点到按钮：左键或右键拖动转镜头
  }
  pointerUp() { this.viewIn.up(); }
  key(k) {
    if (this.rotatable() && this.viewIn.key(k)) return;               // Q / E 转，R 回正
    if (this.screen?.kind === 'title' && (k === ' ' || k === 'Enter')) this.hooks.onStart();
  }

  // ---------- 小件 ----------
  over(h) { return this.mx >= h.x && this.mx <= h.x + h.w && this.my >= h.y && this.my <= h.y + h.h; }
  // 按钮：画法交给皮肤（variant：primary 金 / secondary 绿 / danger 红 / ghost 灰）
  button(ctx, label, x, y, w, h, fn, { accent = false, enabled = true, size = 15, variant = null } = {}) {
    const hit = { x, y, w, h, fn, enabled }; this.hits.push(hit);
    drawButton(ctx, x, y, w, h, label, { variant: variant || (accent ? 'primary' : 'secondary'), hover: enabled && this.over(hit), enabled, fontSize: size });
  }
  // 一张选项卡：木框面板；上面一个图标（o.icon(ctx, cx, cy) 自己画），下面标题、副标题、说明，最下面一行小字（价格等）。
  // o.tip：悬停时在旁边展开的完整说明（行商用：卡面只留图标、名字和价格，不塞满字）。
  choice(ctx, x, y, w, h, o, fn) {
    const enabled = o.enabled !== false;
    const hit = { x, y, w, h, fn, enabled }; this.hits.push(hit);
    const hov = enabled && this.over(hit);
    ctx.save();
    if (hov) ctx.translate(0, -4);
    drawPanel(ctx, x, y, w, h, 'wood', { accentColor: enabled ? (o.color || null) : null, highlight: hov });
    if (!enabled) { ctx.globalAlpha = 0.55; }
    let yy = y + 20;
    if (o.icon) { o.icon(ctx, x + w / 2, y + 12 + (o.iconSize || 32) / 2); yy = y + 12 + (o.iconSize || 32) + 16; }
    text(ctx, o.title, x + w / 2, yy, { size: 16, align: 'center', color: enabled ? (o.color || GOLD) : '#8a8a80', weight: 800 });
    yy += 20;
    if (o.sub) { text(ctx, o.sub, x + w / 2, yy, { size: 12, align: 'center', color: '#cfd8dc', outline: null }); yy += 18; }
    if (o.text) wrap(ctx, o.text, w - 24, 12).forEach(l => { text(ctx, l, x + w / 2, yy, { size: 12, align: 'center', color: enabled ? '#f0ece0' : '#8a8a80', weight: 500, outline: null }); yy += 16; });
    if (o.foot) text(ctx, o.foot, x + w / 2, y + h - 16, { size: 13, align: 'center', color: o.footColor || (enabled ? '#fff' : '#8a8a80'), weight: 800, outline: null });
    ctx.restore();
    if (hov && o.tip) this.tipNow = { lines: o.tip, x: x + w / 2, y: y - 6 };
  }
  backdrop(ctx, a = 0.5) { ctx.fillStyle = `rgba(0,0,0,${a})`; ctx.fillRect(0, 0, 960, 540); }
  // 页面顶部的横幅：页面名加一行副标题。取代原来的厚黑框，只占 y 35~79，把中上部留给转着的 3D 场景
  header(ctx, title, sub) {
    ctx.font = font(12, 500); const sw = sub ? ctx.measureText(sub).width : 0;
    ctx.font = font(20, 800); const tw = ctx.measureText(title).width;
    drawSceneRibbon(ctx, 480, sub ? 57 : 52, Math.max(260, Math.min(640, Math.max(tw, sw) + 60)), title, sub);
  }
  // 顶栏：固定高 32。左：心、金币；中：手牌基数、攻击、牌组张数、印记个数。右边留给音乐 / 音效按钮（flow 画）。
  status(ctx) {
    const t = this.trip; if (!t) return;
    drawPanel(ctx, 0, 0, 960, 32, 'bar');
    drawHearts(ctx, 20, 16, t.player.hearts, t.player.maxHearts, 8);
    let x = 20 + t.player.maxHearts * 22.4 + 8;
    drawCoin(ctx, x + 6, 16, 7); text(ctx, String(t.gold), x + 18, 16, { size: 13, align: 'left', color: GOLD }); x += 70;
    for (const [str, col, w] of [[`手牌 N = ${t.player.handBase}`, '#cfd8dc', 92], [`攻击 ${t.player.atk}`, '#cfd8dc', 68], [`牌组 ${t.deckCards.length} 张`, '#cfd8dc', 84], [t.player.seals.length ? `秘宝印记 ${t.player.seals.length} 个` : '还没有秘宝印记', '#ffe9a0', 120]]) {
      text(ctx, str, x, 16, { size: 12, align: 'left', color: col }); x += w;
    }
  }

  // ---------- 绘制 ----------
  // 先把世界排好队一次画完（地面、摆件、角色），再在上面画 2D 界面
  draw(ctx) {
    this.hits = []; this.tipNow = null;
    if (this.env) this.env.draw(ctx);
    const s = this.screen; if (!s) return;
    this.drawnScreen = s;                                              // 这个画面的按钮区是画出来的（测试用：假玩家等画出来再点，不点上一个画面留下的旧按钮）
    this.queueActors(ctx, s);
    flushWorld(ctx);
    this['draw_' + s.kind](ctx, s);
    if (s.kind !== 'title' && s.kind !== 'summary') this.status(ctx);
    if (this.tipNow) drawTip(ctx, this.tipNow.lines, Math.max(8, Math.min(952 - 240, this.tipNow.x - 120)), 0, 240, this.tipNow.y);
    if (this.rotatable()) text(ctx, '拖动画面或按 Q / E 转视角，R 回正', 10, 530, { size: 12, color: 'rgba(255,255,255,0.5)', outline: 'rgba(0,0,0,0.5)', align: 'left' });
  }
  // 每个画面里站在世界里的角色（营火、行商摊和界门这些摆件由生态环境负责）
  queueActors(ctx, s) {
    const t = this.t;
    if (s.kind === 'title') drawActor(ctx, HERO_LOOK, 480, 318, { t, scale: 1.5 });
    else if (s.kind === 'camp') drawActor(ctx, HERO_LOOK, 395, 318, { t, scale: 1 });
    else if (s.kind === 'shop') { drawActor(ctx, 'npc_gear_smith', 285, 282, { t, scale: 1 }); drawActor(ctx, HERO_LOOK, 650, 304, { t, scale: 1 }); }
    else if (s.kind === 'event') drawActor(ctx, HERO_LOOK, 480, 300, { t, scale: 1 });
    else if (s.kind === 'gate') drawActor(ctx, HERO_LOOK, 480, 352, { t, scale: 1, yaw: Math.PI });
    else if (s.kind === 'sealPick' || s.kind === 'arcanaPick' || s.kind === 'result' || s.kind === 'carveKind') drawActor(ctx, HERO_LOOK, 480, 252, { t, scale: 1 });
  }

  draw_title(ctx) {
    // 只压暗上下两条（纹章和按钮所在），中间留给转着的主角
    const g = ctx.createLinearGradient(0, 0, 0, 540);
    g.addColorStop(0, 'rgba(6,14,8,0.5)'); g.addColorStop(0.34, 'rgba(6,14,8,0.06)'); g.addColorStop(0.64, 'rgba(6,14,8,0.06)'); g.addColorStop(1, 'rgba(6,14,8,0.5)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 960, 540);
    drawTitleEmblem(ctx, 480, 100, '落果密林', 'code00 · 第 1 步到第 8 步', this.t);
    this.button(ctx, '深入林地', 390, 366, 180, 46, () => this.hooks.onStart(), { accent: true, size: 20 });
    this.button(ctx, '核心试玩（4 场教学仗）', 390, 424, 180, 30, () => this.hooks.onTutorial(), { size: 13 });
  }

  draw_result(ctx, s) {
    this.backdrop(ctx, 0.3);
    drawPanel(ctx, 270, 300, 420, 200, 'wood', { accentColor: GOLD });
    text(ctx, s.title, 480, 334, { size: 22, align: 'center', color: GOLD, weight: 800 });
    s.lines.forEach((l, i) => text(ctx, l, 480, 378 + i * 24, { size: 15, align: 'center' }));
    this.button(ctx, '继续', 405, 448, 150, 36, () => this.hooks.onDone(), { accent: true });
  }

  draw_sealPick(ctx, s) {
    this.backdrop(ctx, 0.3);
    this.header(ctx, s.title, '拿过哪条路子，后面三选一就向它收窄：路子拿齐了才有联动');
    const w = 230, h = 176, gap = 22, x0 = 480 - (s.options.length * w + (s.options.length - 1) * gap) / 2;
    s.options.forEach((id, i) => {
      const sd = SEALS[id], owned = this.trip.player.seals.some(o => SEALS[o].line === sd.line);
      this.choice(ctx, x0 + i * (w + gap), 296, w, h, { title: sd.name, sub: LINES[sd.line].name + (owned ? '（你拿过的路子）' : ''), text: sd.text, color: LINE_HEX[sd.line], icon: sealIcon(id) }, () => {
        addSeal(this.trip, id);
        this.afterPick(`拿到秘宝印记：${sd.name}`);
      });
    });
    this.ownedSeals(ctx, 492);
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
    this.backdrop(ctx, 0.3);
    this.header(ctx, s.title, '拿到的秘术牌会混进 29 张宝石牌的循环里');
    const w = 230, h = 190, gap = 22, x0 = 480 - (s.options.length * w + (s.options.length - 1) * gap) / 2;
    s.options.forEach((id, i) => {
      const a = ARCANA[id];
      this.choice(ctx, x0 + i * (w + gap), 290, w, h, { title: a.name, sub: a.kind === 'instant' ? '瞬发秘术（无色，不占链位）' : '入链秘术（带色，拖进链尾）', text: a.text, color: a.kind === 'instant' ? '#b8a8ff' : '#ffd24a', icon: arcanaIcon(id), iconSize: 48 }, () => {
        addArcana(this.trip, id);
        this.afterPick(`拿到秘术牌：${a.name}`);
      });
    });
    this.button(ctx, '都不要', 405, 490, 150, 32, () => { this.screen = { kind: 'result', title: '没有拿秘术牌', lines: ['牌组保持原样。'] }; }, { variant: 'ghost', size: 14 });
  }

  // 从牌组里挑一张牌的网格。filter 决定哪些牌能选；onPick 在选中后调用。
  draw_pickGrid(ctx, s) {
    this.backdrop(ctx, 0.62);
    drawPanel(ctx, 150, 34, 660, 490, 'stone');
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
      const w = 230, nl = lines.map((ln, k) => wrap(ctx, ln, w - 16, k === 0 ? 14 : 12)).reduce((a, l) => a + l.length, 0), h = 14 + nl * 17;
      drawTip(ctx, lines, Math.min(950 - w, this.mx + 14), Math.min(515 - h, this.my + 14), w);
    }
    if (s.onCancel) this.button(ctx, '放弃', 700, 488, 90, 28, s.onCancel, { variant: 'ghost', size: 13 });
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
    this.backdrop(ctx, 0.3);
    this.header(ctx, `雕琢这张 ${COLOR_NAMES[s.card.color]} 牌：四选一`, '同一张牌同一种雕琢只能有一次，不同方向可以叠');
    ctx.save(); ctx.translate(98, 392); ctx.scale(1.5, 1.5); drawCard(ctx, s.card); ctx.restore();
    const w = 172, h = 168, gap = 12, x0 = 200;
    Object.values(CARVES).forEach((c, i) => {
      const have = (s.card.carve || []).includes(c.id);
      this.choice(ctx, x0 + i * (w + gap), 296, w, h, { title: c.name, sub: have ? '这张牌已经有了' : '', text: c.text, color: carveHex(c.id), enabled: !have, icon: carveIcon(c.id) }, () => { s.after(s.card, c.id); });
    });
    this.button(ctx, '回去重新挑牌', 405, 484, 150, 32, () => this.carveFlow(s.after, s.cancel), { variant: 'ghost', size: 13 });
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
    this.header(ctx, '营火整备', s.done ? s.done : '三选一，选了就整备完毕');
    if (s.done) { this.button(ctx, '继续赶路', 405, 420, 150, 38, () => this.hooks.onDone(), { accent: true }); return; }
    const w = 240, h = 124, gap = 18, x0 = 480 - (3 * w + 2 * gap) / 2, y = 388;
    const trip = this.trip;
    const [oh, oc, op] = s.opts;
    this.choice(ctx, x0, y, w, h, { title: oh.name, text: oh.text + `（现在 ${trip.player.hearts} / ${trip.player.maxHearts} 颗）`, color: '#ff8a98', icon: choiceIcon('camp_heal') }, () => {
      const g = campHeal(trip); s.done = g > 0 ? `回了 ${g} 颗心` : '心本来就是满的';
    });
    this.choice(ctx, x0 + w + gap, y, w, h, { title: oc.name, text: oc.text, color: '#6ad8ff', icon: choiceIcon('camp_carve') }, () => this.startCarve('camp', { cancel: () => { this.screen = s; } }));
    this.choice(ctx, x0 + 2 * (w + gap), y, w, h, { title: op.name, text: op.text, color: '#c8e0a0', icon: choiceIcon('camp_purge') }, () => {
      if (op.fallback) { campPurge(trip); s.done = '没有可删的牌：攻击 +10'; return; }
      this.screen = {
        kind: 'pickGrid', title: '清理行囊：删掉 1 张秘术牌或废牌', sub: '宝石牌不能删', cards: trip.deckCards, gemsOnly: false,
        filter: c => !!(c.arcana || c.junk),
        onPick: card => { campPurge(trip, card.uid); s.done = '删掉了一张牌'; this.screen = s; },
        onCancel: () => { this.screen = s; },
      };
    });
  }

  // ---------- 行商营帐 ----------
  // 6 件商品一排，卡面只留图标、名字和价格，说明等鼠标放上去才展开；「离开营帐」在独立的底栏里。
  draw_shop(ctx, s) {
    const trip = this.trip;
    this.header(ctx, '行商营帐', s.msg || `花本趟打怪掉落的金币。你有 ${trip.gold} 金币`);
    const w = 146, h = 122, gap = 8, x0 = 480 - (6 * w + 5 * gap) / 2, y = 346;
    trip.shop.forEach((it, i) => {
      let o;
      if (it.kind === 'seal') { const sd = SEALS[it.ref]; o = { title: sd.name, sub: '秘宝印记 · ' + LINES[sd.line].name, color: LINE_HEX[sd.line], icon: sealIcon(it.ref), tip: [sd.name, LINES[sd.line].name, sd.text] }; }
      else if (it.kind === 'arcana') { const a = ARCANA[it.ref]; o = { title: a.name, sub: a.kind === 'instant' ? '秘术牌 · 瞬发' : '秘术牌 · 入链', color: '#ffd24a', icon: arcanaIcon(it.ref), iconSize: 44, tip: [a.name, a.kind === 'instant' ? '瞬发秘术（无色，不占链位）' : '入链秘术（带色，拖进链尾）', a.text] }; }
      else if (it.kind === 'carve') o = { title: '宝石雕琢', sub: '1 次', color: '#6ad8ff', icon: choiceIcon('shop_carve'), tip: ['宝石雕琢', '任挑 1 张宝石牌，四选一加方向。'] };
      else o = { title: '红果饮', sub: '1 瓶', color: '#ff8a98', icon: choiceIcon('shop_potion'), tip: ['红果饮', '回半颗心。'] };
      o.foot = it.sold ? '已售出' : `${it.price} 金币`;
      o.footColor = it.sold ? '#8a8a80' : trip.gold >= it.price ? GOLD : '#ff8a8a';
      o.enabled = canBuy(trip, it);
      this.choice(ctx, x0 + i * (w + gap), y, w, h, o, () => {
        if (it.kind === 'carve') this.startCarve('shop', { item: it, cancel: () => { this.screen = s; } });
        else { buy(trip, it); s.msg = `买下了${o.title}`; }
      });
    });
    // 底栏：左边金币，右边离开
    drawPanel(ctx, 0, 486, 960, 54, 'bar');
    drawCoin(ctx, 26, 513, 8); text(ctx, `${trip.gold} 金币`, 42, 513, { size: 15, align: 'left', color: GOLD });
    this.button(ctx, '离开营帐', 780, 494, 160, 36, () => this.hooks.onLeave(), { accent: true });
  }

  // ---------- 林中偶遇 ----------
  draw_event(ctx, s) {
    const ev = EVENTS[s.id], trip = this.trip;
    if (s.stage === 'ask') {
      this.header(ctx, ev.name, ev.text);
      const w = 340, h = 112, gap = 24, x0 = 480 - (2 * w + gap) / 2, y = 392;
      ev.options.forEach((o, i) => {
        const chk = optionCheck(trip, ev.id, o.id);
        this.choice(ctx, x0 + i * (w + gap), y, w, h, { title: o.label, text: o.note + (chk.ok ? '' : `（${chk.reason}）`), color: '#e8e0c8', enabled: chk.ok, icon: i === 0 ? choiceIcon(EVENT_ICON[ev.id]) : null, iconSize: 30 }, () => this.pickEvent(s, ev, o));
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
    this.header(ctx, '青苔界门', '第 4 步打完了。门后面是密林腹地：收益更高，也更险');
    const w = 380, h = 118, gap = 20, x0 = 480 - (2 * w + gap) / 2, y = 392;
    this.choice(ctx, x0, y, w, h, { title: '见好就收 · 折返结算', text: '带着现在攒下的金币和战利品，安全离开林地，看本趟战果。', color: '#9ad8a0', icon: choiceIcon('gate_retreat') }, () => this.hooks.onChoose('retreat'));
    this.choice(ctx, x0 + w + gap, y, w, h, { title: '推开石门 · 深入腹地', text: '继续走第 5 到 8 步，最后是林地首领千丈古树精。中途心归 0，战利品全部丢掉。', color: '#ffb070', icon: choiceIcon('gate_advance') }, () => this.hooks.onChoose('advance'));
  }

  // ---------- 结算 ----------
  draw_summary(ctx, s0) {
    const s = s0.s;
    ctx.fillStyle = 'rgba(6,12,8,0.5)'; ctx.fillRect(0, 0, 960, 540);
    drawPanel(ctx, 190, 24, 580, 506, 'wood', { accentColor: s.outcome === 'defeat' ? '#ff8a8a' : GOLD });
    drawSummaryCrest(ctx, 480, 78, s.outcome, this.t);
    const head = s.outcome === 'victory' ? '击败千丈古树精 · 通关落果密林' : s.outcome === 'retreat' ? '见好就收 · 折返结算' : '倒下了 · 战利品尽失';
    text(ctx, head, 480, 132, { size: 24, align: 'center', color: s.outcome === 'defeat' ? '#ff8a8a' : GOLD, weight: 800 });
    const rows = [
      ['走到', `第 ${s.step} 步（共 ${s.steps} 步）`], ['打赢', `${s.battles} 场`], ['心', `${s.hearts} / ${s.maxHearts}`],
      ['金币', s.kept ? String(s.gold) : `${s.gold}（没带出去）`], ['手牌基数 N', String(s.handBase)], ['攻击', String(s.atk)],
      ['宝石等级', `红 ${s.gems[0]} · 绿 ${s.gems[1]} · 蓝 ${s.gems[2]}`],
    ];
    rows.forEach(([a, b], i) => { text(ctx, a, 250, 170 + i * 25, { size: 15, align: 'left', color: '#cfd8dc' }); text(ctx, b, 420, 170 + i * 25, { size: 15, align: 'left' }); });
    const list = (label, arr, y) => {
      text(ctx, label, 250, y, { size: 15, align: 'left', color: '#cfd8dc' });
      wrap(ctx, arr.length ? arr.join('、') : '没有', 330, 13).forEach((l, i) => text(ctx, l, 420, y + i * 18, { size: 13, align: 'left', outline: null }));
    };
    list('秘宝印记', s.seals.map(id => SEALS[id].name), 348);
    list('宝石雕琢', s.carves.map(c => `${COLOR_NAMES[c.color]}牌${CARVES[c.kind].name}`), 396);
    list('秘术牌', s.arcana.map(id => ARCANA[id].name), 444);
    this.button(ctx, this.copiedAt > 0 && this.t - this.copiedAt < 2.5 ? '已复制，发给我吧' : '复制试玩记录', 300, 486, 170, 34, async () => {
      if (await copyText(recorder.text(summarize(this.trip)))) this.copiedAt = this.t;
    }, { size: 14 });
    this.button(ctx, '再来一趟', 490, 486, 170, 34, () => this.hooks.onAgain(), { accent: true });
  }
}
