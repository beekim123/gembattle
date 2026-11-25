// 界面皮肤封装：包缺了、少了函数、网址带 ?art=blocks，都要无缝退回内置兜底；有包就用包。
import * as skin from '../skin.js';

// 记录每次调用的假画布上下文：什么都接得住，并数一数画了多少次
function recCtx() {
  const calls = [];
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (o, k) => {
      if (k === '__calls') return calls;
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'measureText') return () => ({ width: 10 });
      return (...a) => { calls.push(String(k)); };
    },
    set: (o, k, v) => { o[k] = v; return true; },
  });
  return ctx;
}

// 每个包装函数各给一组样例参数；兜底路径都要跑得过去
const CARD = { uid: 'c1', color: 0 };
function sampleCalls(ctx) {
  return {
    drawPanel: () => { for (const v of ['wood', 'parchment', 'stone', 'tooltip', 'bar']) skin.drawPanel(ctx, 10, 10, 120, 60, v, { accentColor: '#fc0' }); },
    drawButton: () => { for (const v of ['primary', 'secondary', 'danger', 'ghost']) skin.drawButton(ctx, 10, 10, 100, 28, '确定', { variant: v, hover: true, pressed: false, enabled: true }); },
    drawHearts: () => skin.drawHearts(ctx, 20, 16, 2, 3, 8),
    drawCoin: () => skin.drawCoin(ctx, 20, 16, 8),
    drawPixelNumber: () => skin.drawPixelNumber(ctx, '1234', 20, 16, { size: 12 }),
    drawHpBar: () => skin.drawHpBar(ctx, 480, 80, 84, 40, 100, 1, 3),
    drawShield: () => skin.drawShield(ctx, 480, 95, [2, 0, 1, 0, 0, 0, 0], [2, 1, 1, 0, 0, 0, 0], false),
    drawCountdown: () => skin.drawCountdown(ctx, 480, 60, 2, 0.5, false),
    drawColorRing: () => skin.drawColorRing(ctx, 64, 77, 24, [true, false, true, false, false, false, false], 2, 0.5),
    drawGemLevelBar: () => skin.drawGemLevelBar(ctx, 12, 140, 104, 0, 2, 3, 6),
    drawCard: () => skin.drawCard(ctx, CARD, { x: 100, y: 400, s: 1 }),
    drawCardBack: () => skin.drawCardBack(ctx, 100, 400, 1),
    drawChainSlot: () => skin.drawChainSlot(ctx, 300, 394, 60, 80, { hover: true }),
    drawSealIcon: () => skin.drawSealIcon(ctx, 'rainbow_ring', 20, 20, 22, { t: 0.5 }),
    drawLootBadge: () => { for (const k of ['carve', 'seal', 'arcana', 'hand', 'heal', 'attr']) skin.drawLootBadge(ctx, k, 40, 40, 17); },
    drawCarveBadge: () => { for (const k of ['sharp', 'twin', 'break', 'prism']) skin.drawCarveBadge(ctx, k, 40, 40, 14); },
    drawMapScrollBg: () => skin.drawMapScrollBg(ctx, 100, 66, 760, 474, 0, 900, 450, [{ from: 1, to: 4 }, { from: 5, to: 8 }]),
    drawMapGateDivider: () => skin.drawMapGateDivider(ctx, 120, 840, 300, false, 0.3),
    drawMapNode: () => { for (const tp of ['battle', 'elite', 'event', 'shop', 'camp', 'boss']) for (const status of ['future', 'avail', 'visited', 'dim']) skin.drawMapNode(ctx, tp, 400, 300, 18, { status, hover: true, t: 0.4 }); },
    drawTitleEmblem: () => skin.drawTitleEmblem(ctx, 480, 100, '标题', '副标题', 0.3),
    drawSceneRibbon: () => skin.drawSceneRibbon(ctx, 480, 57, 300, '标题', '副标题'),
    drawChoiceIcon: () => { for (const k of ['camp_heal', 'camp_carve', 'camp_purge', 'shop_carve', 'gate_stay', 'gate_go']) skin.drawChoiceIcon(ctx, k, 100, 100, 34); },
    drawSummaryCrest: () => { for (const o of ['victory', 'defeat']) skin.drawSummaryCrest(ctx, 480, 78, o, 0.3); },
  };
}

function withWindow(packs, fn) {
  const had = Object.prototype.hasOwnProperty.call(globalThis, 'window'), old = globalThis.window;
  globalThis.window = { Code00ArtPacks: packs };
  try { return fn(); } finally { if (had) globalThis.window = old; else delete globalThis.window; }
}

export default function (t) {
  t.test('皮肤：没有任何包（node 里没有 window）→ 全部兜底，每个封装函数都能画', () => {
    const info = skin.initSkin({ enabled: true, makeCanvas: () => ({}) });
    t.assert.equal(info.ready, true);
    t.assert.deepEqual([info.uiSkin, info.cards, info.icons, info.mapPanels], [false, false, false, false]);
    t.assert.equal(skin.skinActive(), false);
    t.assert.equal(info.mb, 0);
    const ctx = recCtx();
    for (const [name, fn] of Object.entries(sampleCalls(ctx))) { fn(); t.assert.ok(true, name); }
    t.assert.ok(ctx.__calls.length > 100, '兜底路径确实画了东西：' + ctx.__calls.length);
  });

  t.test('皮肤：?art=blocks（enabled=false）→ 就算包在也不用，全走兜底', () => {
    let used = 0;
    const pack = new Proxy({}, { get: (o, k) => (k === 'init' || k === 'initCards' || k === 'initIcons' ? () => { used++; } : () => { used++; }) });
    withWindow({ uiSkin: pack, cards: pack, mapPanels: pack, groundVfx: pack }, () => {
      const info = skin.initSkin({ enabled: false });
      t.assert.equal(info.enabled, false);
      t.assert.equal(skin.skinActive(), false);
      const ctx = recCtx();
      for (const fn of Object.values(sampleCalls(ctx))) fn();
    });
    t.assert.equal(used, 0, '包里的函数一个都没被调');
  });

  t.test('皮肤：包在就用包；init 的离屏画布经工厂创建并累计 MB', () => {
    const hits = [];
    const mk = name => (...a) => { hits.push(name); };
    const uiSkin = { init(make) { make(512, 512); }, drawPanel: mk('panel'), drawButton: mk('button') };
    const cards = { initCards(make) { make(256, 256); }, initIcons(make) { make(256, 256); }, drawCard: mk('card'), drawSealIcon: mk('seal') };
    const mapPanels = { init(make) { make(512, 256); }, drawMapNode: mk('node') };
    withWindow({ uiSkin, cards, mapPanels }, () => {
      const info = skin.initSkin({ enabled: true, makeCanvas: () => ({}) });
      t.assert.deepEqual([info.uiSkin, info.cards, info.icons, info.mapPanels], [true, true, true, true]);
      t.assert.equal(skin.skinActive(), true);
      t.assert.equal(info.mb, 2, '1 + 0.25 + 0.25 + 0.5 MB');
      const ctx = recCtx();
      skin.drawPanel(ctx, 0, 0, 100, 40, 'wood');
      skin.drawButton(ctx, 0, 0, 80, 26, '好', {});
      skin.drawCard(ctx, CARD, { x: 0, y: 0, s: 1 });
      skin.drawSealIcon(ctx, 'rainbow_ring', 10, 10, 20);
      skin.drawMapNode(ctx, 'battle', 10, 10, 18, { status: 'avail' });
    });
    t.assert.deepEqual(hits.sort(), ['button', 'card', 'node', 'panel', 'seal']);
  });

  t.test('皮肤：只有一部分包 / 包里缺函数 → 缺的那部分退回兜底，不报错', () => {
    // 只有 UI-01 的面板，没有按钮、没有别的包
    const uiSkin = { init() {}, drawPanel() {} };
    withWindow({ uiSkin }, () => {
      const info = skin.initSkin({ enabled: true, makeCanvas: () => ({}) });
      t.assert.deepEqual([info.uiSkin, info.cards, info.icons, info.mapPanels], [true, false, false, false]);
      const ctx = recCtx();
      for (const fn of Object.values(sampleCalls(ctx))) fn();
    });
    // 包的 init 缺了：整套当没有
    withWindow({ uiSkin: { drawPanel() {} } }, () => {
      t.assert.equal(skin.initSkin({ enabled: true, makeCanvas: () => ({}) }).uiSkin, false);
    });
  });

  t.test('皮肤：重新 initSkin 会清掉上一次的状态', () => {
    withWindow({ uiSkin: { init() {}, drawPanel() {} } }, () => { t.assert.equal(skin.initSkin({ enabled: true, makeCanvas: () => ({}) }).uiSkin, true); });
    t.assert.equal(skin.initSkin({ enabled: true, makeCanvas: () => ({}) }).uiSkin, false);
    t.assert.equal(skin.skinActive(), false);
  });
}
