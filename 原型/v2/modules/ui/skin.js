// 界面皮肤统一封装：场景里画面板、按钮、心、血条、牌、图标、路线图、标题纹章……一律从这里取。
//
// 美术来源：5 个外派美术包（实装库 art-packs/，挂在 window.Code00ArtPacks 上）。
//   uiSkin    UI-01  面板 / 按钮 / 心 / 金币 / 血条 / 色盾 / 倒计时 / 集色环 / 宝石等级条 / 像素数字
//   cards     UI-02A 7 色宝石牌、8 张秘术牌、牌背、链槽；UI-02B 10 枚印记、6 枚战利品、4 枚雕琢角标（两包合并挂在同一个键上）
//   mapPanels UI-03  卷轴地图与节点、界门分隔、标题纹章、场景横幅、11 种选项图标、结算纹章
//   groundVfx UI-04  地面微粒与 3D 特效（由 render/world-stage.js 使用，这里只统计）
// 规矩：
//   1. initSkin 在首帧前调一次：把各包的图集预先烘好，离屏画布经本文件的工厂创建，顺便累计 MB（性能浮层显示）；
//   2. 包没加载上、某个函数缺了、或网址带 ?art=blocks，对应的绘制函数无缝退回内置兜底（bars.js / ring.js / cards.js / mapicons.js 的复古色块画法）；
//   3. 本文件和各包都不用画布滤镜、不用实时模糊；都是整数像素贴图。
import { text, roundRect, panel as flatPanel } from './draw.js';
import { drawHpBar as flatHpBar, drawShield as flatShield, drawCountdown as flatCountdown, drawHearts as flatHearts } from './bars.js';
import { drawColorRing as flatRing } from './ring.js';
import { drawCard as flatCard, drawCardBack as flatCardBack, CARD_W, CARD_H } from './cards.js';
import { drawLootBadge as flatLoot, drawNodeIcon, NODE_STYLE, LOOT_HEX } from './mapicons.js';
import { SEALS } from '../content/seals.js';
import { CARVES } from '../content/carves.js';

const S = { enabled: true, ready: false, ui: null, cards: null, icons: null, map: null, mb: 0, ms: 0 };

const packsOf = () => (typeof window !== 'undefined' && window.Code00ArtPacks) || {};
const defaultMake = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; };
const isFn = (o, k) => !!o && typeof o[k] === 'function';
// 包里缺某个函数时，只有那一个退回兜底，别的照用包（旧版本的包、半截包都不会在半路报错）
const has = isFn;

// 首帧前调一次。enabled = false（?art=blocks）时整套走内置兜底。makeCanvas 可换（测试用）。
export function initSkin({ enabled = true, makeCanvas } = {}) {
  S.enabled = enabled; S.ui = S.cards = S.icons = S.map = null; S.mb = 0; S.ms = 0;
  if (enabled) {
    const P = packsOf(), mk = makeCanvas || defaultMake;
    const counted = (w, h) => { S.mb += (Math.max(1, w) * Math.max(1, h) * 4) / 1048576; return mk(w, h); };
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    if (isFn(P.uiSkin, 'drawPanel') && isFn(P.uiSkin, 'init')) { P.uiSkin.init(counted); S.ui = P.uiSkin; }
    if (isFn(P.cards, 'drawCard') && isFn(P.cards, 'initCards')) { P.cards.initCards(counted); S.cards = P.cards; }
    if (isFn(P.cards, 'drawSealIcon') && isFn(P.cards, 'initIcons')) { P.cards.initIcons(counted); S.icons = P.cards; }
    if (isFn(P.mapPanels, 'drawMapNode') && isFn(P.mapPanels, 'init')) { P.mapPanels.init(counted); S.map = P.mapPanels; }
    S.ms = typeof performance !== 'undefined' ? performance.now() - t0 : 0;
  }
  S.ready = true;
  return skinInfo();
}

// 性能浮层要看的：哪几套包接上了、离屏占多少 MB、初始化花了多少毫秒
export function skinInfo() {
  return {
    enabled: S.enabled, ready: S.ready, mb: Math.round(S.mb * 100) / 100, ms: Math.round(S.ms * 10) / 10,
    uiSkin: !!S.ui, cards: !!S.cards, icons: !!S.icons, mapPanels: !!S.map,
  };
}
export const skinActive = () => !!(S.ui || S.cards || S.icons || S.map);

// ---------- 面板与按钮（UI-01）----------
// 面板变体：wood 木框（主面板）、parchment 羊皮纸、stone 青石、tooltip 悬停说明、bar 顶栏横条
const FLAT_PANEL = {
  wood: ['rgba(14,22,16,0.84)', 'rgba(255,255,255,0.18)'],
  parchment: ['rgba(214,196,150,0.94)', '#7a6340'],
  stone: ['rgba(34,46,42,0.92)', '#526962'],
  tooltip: ['rgba(10,16,12,0.95)', 'rgba(255,255,255,0.32)'],
  bar: ['rgba(8,16,10,0.78)', null],
};
// o: { accentColor 镶边色, highlight 高亮角标, alpha }
export function drawPanel(ctx, x, y, w, h, variant = 'wood', o = {}) {
  if (has(S.ui, 'drawPanel')) return S.ui.drawPanel(ctx, x, y, w, h, variant, o);
  const f = FLAT_PANEL[variant] || FLAT_PANEL.wood;
  ctx.save();
  if (typeof o.alpha === 'number') ctx.globalAlpha *= o.alpha;
  flatPanel(ctx, x, y, w, h, f[0], o.accentColor || (o.highlight ? '#ffd24a' : f[1]));
  ctx.restore();
}

// st: { variant 'primary' | 'secondary' | 'danger' | 'ghost', hover, pressed, enabled, fontSize }
export function drawButton(ctx, x, y, w, h, label, st = {}) {
  if (has(S.ui, 'drawButton')) return S.ui.drawButton(ctx, x, y, w, h, label, st);
  const enabled = st.enabled !== false, hov = enabled && st.hover, accent = st.variant === 'primary';
  roundRect(ctx, x, y, w, h, 6);
  ctx.fillStyle = !enabled ? 'rgba(40,46,40,0.55)' : accent ? (hov ? '#e8b92c' : '#c99a1c') : st.variant === 'danger' ? (hov ? '#c4443a' : '#9e2c26') : (hov ? 'rgba(90,110,90,0.95)' : 'rgba(46,62,48,0.92)');
  ctx.fill();
  ctx.lineWidth = 1.5; ctx.strokeStyle = enabled ? (accent ? '#ffe9a0' : 'rgba(255,255,255,0.45)') : 'rgba(255,255,255,0.12)'; ctx.stroke();
  if (label) text(ctx, label, x + w / 2, y + h / 2 + 1, { size: st.fontSize || 14, align: 'center', color: enabled ? '#fff' : 'rgba(255,255,255,0.4)', outline: null });
}

// ---------- 心、金币、血条、色盾、倒计时 ----------
// hearts 可以是半颗；size 是半宽（像素心画 2 × size 见方），间距 2.8 × size
export function drawHearts(ctx, x, y, hearts, max, size = 9) {
  if (!has(S.ui, 'drawHeart')) return flatHearts(ctx, x, y, hearts, max, size);
  for (let i = 0; i < max; i++) S.ui.drawHeart(ctx, x + i * size * 2.8, y, size, hearts >= i + 1 ? 1 : hearts >= i + 0.5 ? 0.5 : 0);
}
export function drawCoin(ctx, cx, cy, size = 8) {
  if (has(S.ui, 'drawCoin')) return S.ui.drawCoin(ctx, cx, cy, size);
  ctx.beginPath(); ctx.arc(cx, cy, size, 0, Math.PI * 2); ctx.fillStyle = '#e6b32e'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#6b420c'; ctx.stroke();
}
// 像素伤害数字。opts: { size, color, align 'left' | 'center' | 'right', crit, rainbow, strokeColor }
export function drawPixelNumber(ctx, str, x, y, o = {}) {
  if (has(S.ui, 'drawPixelNumber')) return S.ui.drawPixelNumber(ctx, str, x, y, o);
  text(ctx, String(str), x, y, { size: Math.max(12, o.size || 14), color: o.color || '#fff', align: o.align || 'left', weight: 800 });
}
// 血条（带血量数字和多条血的小宝石）：cx 条的正中，y 条的上沿，条高 12
export function drawHpBar(ctx, cx, y, w, hp, max, bar, barsTotal) {
  if (has(S.ui, 'drawHpBar')) return S.ui.drawHpBar(ctx, cx, y, w, hp, max, bar, barsTotal);
  return flatHpBar(ctx, cx, y, w, hp, max, bar, barsTotal);
}
export function drawShield(ctx, cx, y, shield, shieldMax, broken) {
  if (has(S.ui, 'drawShield')) return S.ui.drawShield(ctx, cx, y, shield, shieldMax, broken);
  return flatShield(ctx, cx, y, shield, shieldMax, broken);
}
export function drawCountdown(ctx, cx, cy, n, t, danger) {
  if (has(S.ui, 'drawCountdown')) return S.ui.drawCountdown(ctx, cx, cy, n, t, danger);
  return flatCountdown(ctx, cx, cy, n, t);
}
// 集色环：六色按色环顺序从正上方顺时针排，白在圆心。collected 是位掩码，cursor 是链尾色（0..6，-1 没有）
export function drawColorRing(ctx, cx, cy, r, collected, cursor, t) {
  if (has(S.ui, 'drawColorRing')) return S.ui.drawColorRing(ctx, cx, cy, r, collected, cursor, t);
  return flatRing(ctx, cx, cy, r, collected, cursor, t);
}
// 宝石等级条：占 w × 18，channelIdx 0 红 1 绿 2 蓝
export function drawGemLevelBar(ctx, x, y, w, channelIdx, level, exp, maxExp) {
  if (has(S.ui, 'drawGemLevelBar')) return S.ui.drawGemLevelBar(ctx, x, y, w, channelIdx, level, exp, maxExp);
  const GEM = ['#ff5a4a', '#52d65a', '#5a8cff'], mid = y + 9;
  ctx.beginPath(); ctx.arc(x + 8, mid, 7, 0, 6.3); ctx.fillStyle = GEM[channelIdx]; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
  text(ctx, `${level}级`, x + 20, mid, { size: 12, align: 'left' });
  const bx = x + 48, bw = Math.max(20, w - 48);
  roundRect(ctx, bx, mid - 4, bw, 8, 3); ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fill();
  roundRect(ctx, bx, mid - 4, Math.max(2, bw * Math.min(1, exp / Math.max(1, maxExp))), 8, 3); ctx.fillStyle = GEM[channelIdx]; ctx.fill();
}

// ---------- 牌（UI-02A）与图标（UI-02B）----------
export { CARD_W, CARD_H };
// 画一张牌，中心点在 (0,0)，调用方先 translate / rotate / scale。
// o: { frame 'near' | 'comp' | 'wild' | 'break', lit, dim, masked, tag, tagColor, t 动画时间秒 }
export function drawCard(ctx, card, o = {}) {
  if (has(S.cards, 'drawCard')) return S.cards.drawCard(ctx, card, o);
  return flatCard(ctx, card, o);
}
export function drawCardBack(ctx, x, y, s = 1) {
  if (has(S.cards, 'drawCardBack')) return S.cards.drawCardBack(ctx, x, y, s);
  return flatCardBack(ctx, x, y, s);
}
// 链槽：中心 (x, y)，大小 w × h；st: { filled, index, isNext, dragging }
export function drawChainSlot(ctx, x, y, w, h, st = {}) {
  if (has(S.cards, 'drawChainSlot')) return S.cards.drawChainSlot(ctx, x, y, w, h, st);
  roundRect(ctx, x - w / 2, y - h / 2, w, h, 5);
  ctx.fillStyle = st.filled ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.25)'; ctx.fill();
  ctx.setLineDash([5, 4]); ctx.lineWidth = st.isNext && st.dragging ? 3 : 1.5;
  ctx.strokeStyle = st.isNext && st.dragging ? '#ffd24a' : 'rgba(255,255,255,0.3)'; ctx.stroke(); ctx.setLineDash([]);
}
const SEAL_LINE_HEX = { shield: '#8ff0ff', white: '#ffffff', rainbow: '#ffb0f0', hold: '#ffd24a', chain: '#9aff9a' };
// 一枚印记图标（10 枚）。o: { dim, active, count, t }
export function drawSealIcon(ctx, sealId, cx, cy, size = 24, o = {}) {
  if (has(S.icons, 'drawSealIcon')) return S.icons.drawSealIcon(ctx, sealId, cx, cy, size, o);
  const sd = SEALS[sealId], h = size / 2;
  ctx.save(); if (o.dim) ctx.globalAlpha *= 0.45;
  roundRect(ctx, cx - h, cy - h, size, size, 5); ctx.fillStyle = sd ? SEAL_LINE_HEX[sd.line] : '#ccc'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = '#1a1a14'; ctx.stroke();
  ctx.restore();
  text(ctx, sd ? sd.name[0] : '印', cx, cy + 1, { size: Math.max(12, size * 0.56), align: 'center', color: '#1a1a14', outline: null, weight: 800 });
}
export function drawLootBadge(ctx, kind, cx, cy, size = 17) {
  if (has(S.icons, 'drawLootBadge')) return S.icons.drawLootBadge(ctx, kind, cx, cy, size);
  return flatLoot(ctx, kind, cx, cy, size);
}
const CARVE_HEX = { sharp: '#ffb04a', twin: '#7ad8ff', pierce: '#ff7a7a', overflow: '#d49aff' };
export function drawCarveBadge(ctx, kind, cx, cy, size = 14) {
  if (has(S.icons, 'drawCarveBadge')) return S.icons.drawCarveBadge(ctx, kind, cx, cy, size);
  roundRect(ctx, cx - size / 2, cy - size / 2, size, size, 3); ctx.fillStyle = CARVE_HEX[kind] || '#ccc'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.stroke();
  const nm = CARVES[kind] ? CARVES[kind].name[0] : '雕';
  text(ctx, nm, cx, cy + 0.5, { size: Math.max(12, size - 2), align: 'center', color: '#1a1208', outline: null, weight: 800 });
}

// ---------- 路线图与非战斗页（UI-03）----------
export { NODE_STYLE, LOOT_HEX, drawNodeIcon };
// 路线图卷轴底：只在 (x, y, w, h) 窗口里画，跟着镜头 camY 滚动。segments: [{ name, from, to }]
export function drawMapScrollBg(ctx, x, y, w, h, camY, worldH, gateY, segments) {
  if (has(S.map, 'drawMapScrollBg')) return S.map.drawMapScrollBg(ctx, x, y, w, h, camY, worldH, gateY, segments);
  // 兜底：一张浅色羊皮纸底（路线图的线是深褐墨色，要配浅底才看得清）
  ctx.fillStyle = 'rgba(214,196,150,0.9)'; ctx.fillRect(x + 18, y, w - 36, h);
  ctx.strokeStyle = '#6a5230'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x + 18, y); ctx.lineTo(x + 18, y + h); ctx.moveTo(x + w - 18, y); ctx.lineTo(x + w - 18, y + h); ctx.stroke();
}
// 青苔界门分隔线：从 x0 到 x1，竖直位置 y
export function drawMapGateDivider(ctx, x0, x1, y, passed, t) {
  if (has(S.map, 'drawMapGateDivider')) return S.map.drawMapGateDivider(ctx, x0, x1, y, passed, t);
  ctx.save();
  ctx.strokeStyle = passed ? 'rgba(160,220,150,0.5)' : 'rgba(170,230,160,0.9)'; ctx.lineWidth = 3; ctx.setLineDash([14, 8]);
  ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]);
  const cx = (x0 + x1) / 2;
  for (const px of [cx - 34, cx + 34]) {
    ctx.fillStyle = '#4a5855'; ctx.fillRect(px - 8, y - 24, 16, 40);
    ctx.fillStyle = '#5a8756'; ctx.fillRect(px - 8, y - 24, 16, 7);
    ctx.strokeStyle = '#1a2422'; ctx.lineWidth = 2; ctx.strokeRect(px - 8, y - 24, 16, 40);
  }
  ctx.restore();
}
// 路线图节点。type: battle elite event shop camp boss；st: { status 'future' | 'avail' | 'visited' | 'dim', hover, t }
export function drawMapNode(ctx, type, cx, cy, r, st = {}) {
  if (has(S.map, 'drawMapNode')) return S.map.drawMapNode(ctx, type, cx, cy, r, st);
  const sty = NODE_STYLE[type] || NODE_STYLE.battle, visited = st.status === 'visited', dim = st.status === 'dim', avail = st.status === 'avail';
  ctx.save(); ctx.globalAlpha = dim ? 0.3 : 1;
  if (avail) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 3.5; ctx.beginPath(); ctx.arc(cx, cy, r + 6 + Math.sin((st.t || 0) * 4) * 1.5, 0, Math.PI * 2); ctx.stroke(); }
  if (st.hover && !dim) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r + 3, 0, Math.PI * 2); ctx.stroke(); }
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = visited ? '#3a3a36' : sty.fill; ctx.fill();
  ctx.lineWidth = type === 'boss' || type === 'elite' ? 4 : 3; ctx.strokeStyle = visited ? '#8a8a80' : sty.ring; ctx.stroke();
  drawNodeIcon(ctx, type, cx, cy, r * (type === 'boss' ? 0.8 : 0.9), visited ? '#9a9a90' : sty.ring);
  if (visited) { ctx.strokeStyle = '#ffd24a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(cx - 7, cy + 1); ctx.lineTo(cx - 2, cy + 7); ctx.lineTo(cx + 8, cy - 6); ctx.stroke(); }
  ctx.restore();
}
// 标题纹章：占 296~430 宽，高 68（有副标题 86）
export function drawTitleEmblem(ctx, cx, cy, title, sub, t) {
  if (has(S.map, 'drawTitleEmblem')) return S.map.drawTitleEmblem(ctx, cx, cy, title, sub, t);
  text(ctx, title, cx, cy - (sub ? 10 : 0), { size: 48, align: 'center', color: '#ffe9a0', weight: 800 });
  if (sub) text(ctx, sub, cx, cy + 30, { size: 14, align: 'center', color: '#d8e8c8' });
}
// 场景横幅：中心 (cx, y)，宽 w（两头还有 22 的燕尾），高 30（有副标题 42）
export function drawSceneRibbon(ctx, cx, y, w, title, sub) {
  if (has(S.map, 'drawSceneRibbon')) return S.map.drawSceneRibbon(ctx, cx, y, w, title, sub);
  const rh = sub ? 42 : 30;
  flatPanel(ctx, cx - w / 2, y - rh / 2, w, rh, 'rgba(10,16,12,0.85)', 'rgba(255,255,255,0.3)');
  text(ctx, title, cx, y - (sub ? 8 : 0), { size: 18, align: 'center', color: '#ffd24a', weight: 800 });
  if (sub) text(ctx, sub, cx, y + 11, { size: 12, align: 'center', color: '#e8e0c8', outline: null });
}
// 选项图标（11 种）：camp_carve camp_heal camp_purge event_bag event_pool event_stele event_wood gate_advance gate_retreat shop_carve shop_potion
export function drawChoiceIcon(ctx, kind, cx, cy, size = 34) {
  if (has(S.map, 'drawChoiceIcon')) return S.map.drawChoiceIcon(ctx, kind, cx, cy, size);
  roundRect(ctx, cx - size / 2, cy - size / 2, size, size, 6); ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fill(); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke();
}
// 结算纹章：outcome 'victory' | 'retreat' | 'defeat'，占 180 × 72
export function drawSummaryCrest(ctx, cx, cy, outcome, t) {
  if (has(S.map, 'drawSummaryCrest')) return S.map.drawSummaryCrest(ctx, cx, cy, outcome, t);
  const head = outcome === 'victory' ? '通关' : outcome === 'defeat' ? '倒下' : '折返';
  text(ctx, head, cx, cy, { size: 30, align: 'center', color: outcome === 'defeat' ? '#ff8a8a' : '#ffd24a', weight: 800 });
}

