// 外包交付自动化校验脚本：UI-02B 印记、雕琢与战利品图标（运行：node verify.mjs）
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(ROOT, 'bundle', 'pack_icons.js');
const BUDGET_BYTES = 1 * 1024 * 1024; // 1 MB 硬红线

if (!fs.existsSync(TARGET)) {
  console.error('❌ 未找到交付文件：./bundle/pack_icons.js');
  process.exit(1);
}

const canvases = [];
function makeCtx() {
  const grad = { addColorStop() {} };
  const state = {
    filter: 'none', shadowBlur: 0, globalAlpha: 1, imageSmoothingEnabled: true,
    fillStyle: '#000', strokeStyle: '#000', lineWidth: 1,
    font: '12px sans-serif', textAlign: 'left', textBaseline: 'alphabetic'
  };
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
  const c = {
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
    _ctx: null,
    getContext() { if (!this._ctx) this._ctx = makeCtx(); return this._ctx; }
  };
  canvases.push(c);
  return c;
}

const sandbox = {
  window: { Code00ArtPacks: { cards: { __keepSentinel: true } } }, // 校验不覆盖 UI-02A
  document: { createElement: (tag) => (tag === 'canvas' ? makeCanvas(1, 1) : {}) },
  performance: { now: () => Number(process.hrtime.bigint()) / 1e6 },
  console, Math, Array, Object, Number, String, Boolean, Set, Map, WeakMap,
  Uint8Array, Uint8ClampedArray, Int32Array, Float32Array, Error, TypeError, RangeError
};
sandbox.Code00ArtPacks = sandbox.window.Code00ArtPacks;
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
for (const lit of lits) {
  const m = lit.match(BAD);
  if (m) badHits.push(`${m[0]} in ${lit.slice(0, 24)}`);
}
check(badHits.length === 0, `字符串含禁用字：${badHits.slice(0, 5).join('；')}`);

vm.runInContext(src, sandbox, { filename: 'bundle/pack_icons.js' });
const pack = sandbox.Code00ArtPacks && sandbox.Code00ArtPacks.cards;
check(!!pack, '未注册 window.Code00ArtPacks.cards');

const SEALS = [
  'shatter_tide', 'desperate',
  'double_white', 'white_echo',
  'rainbow_bridge', 'ring_keep',
  'wide_bag', 'hold_edge',
  'leap', 'chain_surge'
];
const LOOTS = ['carve', 'seal', 'arcana', 'hand', 'heal', 'attr'];
const CARVES = ['sharp', 'twin', 'pierce', 'overflow'];

if (pack) {
  check(pack.__keepSentinel === true, '必须使用 Object.assign 合并挂载到 Code00ArtPacks.cards，不得直接覆盖清空原有字段（否则会覆盖 UI-02A）');
  for (const fn of ['initIcons', 'drawSealIcon', 'drawLootBadge', 'drawCarveBadge']) {
    check(typeof pack[fn] === 'function', `缺少必需方法：${fn}`);
  }

  const t0 = sandbox.performance.now();
  if (typeof pack.initIcons === 'function') pack.initIcons(makeCanvas);
  const initMs = sandbox.performance.now() - t0;
  check(initMs <= 30, `initIcons 耗时过长：${initMs.toFixed(1)}ms（上限 30ms）`);

  const ctx = makeCtx();
  try {
    for (const id of SEALS) {
      pack.drawSealIcon(ctx, id, 40, 40, 24, { active: id === 'shatter_tide', dim: id === 'leap', count: 2, t: 1.0 });
    }
    pack.drawSealIcon(ctx, 'unknown_seal_fallback', 40, 40, 24, {});

    for (const k of LOOTS) {
      pack.drawLootBadge(ctx, k, 80, 40, 17);
    }
    pack.drawLootBadge(ctx, 'unknown_loot_fallback', 80, 40, 17);

    for (const c of CARVES) {
      pack.drawCarveBadge(ctx, c, 120, 40, 14);
    }
    pack.drawCarveBadge(ctx, 'unknown_carve_fallback', 120, 40, 14);
  } catch (e) {
    errors.push(`接口运行期异常：${e.stack || e.message}`);
  }

  check(!ctx.__flags.runtimeFilterSet, '运行期触发了 ctx.filter');
  check(!ctx.__flags.runtimeShadowSet, '运行期触发了 ctx.shadowBlur');

  const totalBytes = canvases.reduce((s, c) => s + c.width * c.height * 4, 0);
  const mb = totalBytes / (1024 * 1024);
  check(totalBytes <= BUDGET_BYTES, `离屏贴图超标：${mb.toFixed(2)} MB（上限 1.00 MB）`);

  console.log('\n[UI-02B 印记雕琢与战利品图标 自动化校验报告]');
  console.log(`- 初始化耗时：${initMs.toFixed(2)} ms（上限 30 ms）`);
  console.log(`- 离屏画布：${canvases.length} 张，合计 ${mb.toFixed(2)} MB（上限 1.00 MB）`);
}

if (errors.length) {
  console.error(`\n❌ 校验未通过（${errors.length} 项错误）：\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log('\n✅ 全部硬性校验通过！可以打开 preview.html 目检并打包 bundle_ui02b_icons.zip。');
