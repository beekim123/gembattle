// 外包交付自动化校验脚本：UI-02 七色宝石与秘术卡牌（运行：node verify.mjs）
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(ROOT, 'bundle', 'pack_cards_icons.js');
const BUDGET_BYTES = 3 * 1024 * 1024; // 3 MB 硬红线

if (!fs.existsSync(TARGET)) {
  console.error('❌ 未找到交付文件：./bundle/pack_cards_icons.js');
  process.exit(1);
}

const canvases = [];
function makeCtx() {
  const grad = { addColorStop() {} };
  const state = { filter: 'none', shadowBlur: 0, globalAlpha: 1, imageSmoothingEnabled: true, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '12px sans-serif', textAlign: 'left', textBaseline: 'alphabetic' };
  let runtimeFilterSet = false, runtimeShadowSet = false;
  return new Proxy(state, {
    get(o, k) {
      if (k === '__flags') return { runtimeFilterSet, runtimeShadowSet };
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4) });
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 8 });
      return () => {};
    },
    set(o, k, v) {
      if (k === 'filter' && v && v !== 'none') runtimeFilterSet = true;
      if (k === 'shadowBlur' && Number(v) > 0) runtimeShadowSet = true;
      o[k] = v;
      return true;
    }
  });
}
function makeCanvas(w = 1, h = 1) {
  const c = { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)), _ctx: null, getContext() { if (!this._ctx) this._ctx = makeCtx(); return this._ctx; } };
  canvases.push(c);
  return c;
}

const sandbox = {
  window: {},
  document: { createElement: (tag) => (tag === 'canvas' ? makeCanvas(1, 1) : {}) },
  performance: { now: () => Number(process.hrtime.bigint()) / 1e6 },
  console, Math, Array, Object, Number, String, Boolean, Set, Map, WeakMap,
  Uint8Array, Uint8ClampedArray, Int32Array, Float32Array, Error, TypeError, RangeError
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

const src = fs.readFileSync(TARGET, 'utf8');
const errors = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

check(!/\.filter\s*=/.test(src), '源码禁止设置 ctx.filter');
check(!/shadowBlur/.test(src), '源码禁止使用 shadowBlur');
check(!/\bnew\s+Image\b|https?:\/\/|fetch\s*\(/i.test(src), '源码禁止外部图片或网络加载');

const BAD = /[\u706f\u70ec\u5f71\u591c\u9b42\u566c\u5e7d\u6e0a\u661f\u5149]|\u5b88.\u8005|\u4e4b/;
const lits = src.match(/(['"`])(?:\\.|(?!\1).)*\1/g) || [];
const badHits = [];
for (const lit of lits) { const m = lit.match(BAD); if (m) badHits.push(`${m[0]} in ${lit.slice(0, 24)}`); }
check(badHits.length === 0, `字符串含禁用字：${badHits.slice(0, 5).join('；')}`);

vm.runInContext(src, sandbox, { filename: 'bundle/pack_cards_icons.js' });
const pack = sandbox.Code00ArtPacks && sandbox.Code00ArtPacks.cards;
check(!!pack, '未注册 window.Code00ArtPacks.cards');

if (pack) {
  check(pack.id === 'cards', `pack.id 应为 "cards"，实际为 ${pack.id}`);
  check(pack.version === 1, `pack.version 应为 1`);
  check(pack.CARD_W === 62 && pack.CARD_H === 88, `CARD_W/CARD_H 必须为 62×88`);
  const reqFns = ['init', 'drawCard', 'drawCardBack', 'drawChainSlot', 'drawCarveBadge', 'drawSealIcon', 'drawLootBadge'];
  for (const fn of reqFns) check(typeof pack[fn] === 'function', `缺少必需方法：${fn}`);

  const t0 = sandbox.performance.now();
  if (typeof pack.init === 'function') pack.init(makeCanvas);
  const initMs = sandbox.performance.now() - t0;
  check(initMs <= 60, `init 预烘焙耗时过长：${initMs.toFixed(1)}ms（上限 60ms）`);

  const ctx = makeCtx();
  try {
    for (let c = 0; c < 7; c++) {
      pack.drawCard(ctx, { color: c, carve: c === 0 ? ['sharp', 'pierce'] : [] }, { frame: ['near', 'comp', 'wild', 'break', null][c % 5], tag: '接上', tagColor: '#6fe07a', t: 1.2 });
    }
    for (const [id, col] of [['spring', -1], ['ward', -1], ['shatter', -1], ['surge', -1], ['resonance', -1], ['refract', 6], ['prism', 0], ['keep', 3]]) {
      pack.drawCard(ctx, { color: col, arcana: id }, { lit: id === 'prism', t: 1.2 });
    }
    pack.drawCard(ctx, { color: -1, junk: true }, { dim: true });
    pack.drawCard(ctx, { color: 2 }, { masked: true });
    pack.drawCardBack(ctx, 100, 100, 1);
    for (const st of [{ isNext: true, dragging: true, index: 0, filled: false }, { isNext: false, dragging: false, index: 1, filled: true }]) {
      pack.drawChainSlot(ctx, 200, 200, 45, 64, st);
    }
    for (const k of ['sharp', 'twin', 'pierce', 'overflow']) pack.drawCarveBadge(ctx, k, 50, 50, 14);
    for (const id of ['shatter_tide', 'desperate', 'double_white', 'white_echo', 'rainbow_bridge', 'ring_keep', 'wide_bag', 'hold_edge', 'leap', 'chain_surge']) {
      pack.drawSealIcon(ctx, id, 80, 80, 24, { hover: true });
    }
    for (const k of ['carve', 'seal', 'arcana', 'hand', 'heal', 'attr']) pack.drawLootBadge(ctx, k, 120, 80, 18);
  } catch (e) {
    errors.push(`接口运行期异常：${e.stack || e.message}`);
  }

  check(!ctx.__flags.runtimeFilterSet, '运行期触发了 ctx.filter');
  check(!ctx.__flags.runtimeShadowSet, '运行期触发了 ctx.shadowBlur');

  const totalBytes = canvases.reduce((s, c) => s + c.width * c.height * 4, 0);
  const mb = totalBytes / (1024 * 1024);
  check(totalBytes <= BUDGET_BYTES, `离屏贴图超标：${mb.toFixed(2)} MB（上限 3.00 MB）`);

  console.log('\n[UI-02 宝石与秘术卡牌 自动化校验报告]');
  console.log(`- 名称：${pack.name || pack.id} (v${pack.version})`);
  console.log(`- 初始化耗时：${initMs.toFixed(2)} ms（上限 60 ms）`);
  console.log(`- 离屏画布：${canvases.length} 张，合计 ${mb.toFixed(2)} MB（上限 3.00 MB）`);
}

if (errors.length) {
  console.error(`\n❌ 校验未通过（${errors.length} 项错误）：\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log('\n✅ 全部硬性校验通过！可以打开 preview.html 目检全套牌面与图标并打包 bundle_ui02_cards.zip。');
