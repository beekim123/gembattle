// 外包交付自动化校验脚本：UI-03 探索地图与非战斗装饰（运行：node verify.mjs）
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(ROOT, 'bundle', 'pack_map_panels.js');
const BUDGET_BYTES = 4 * 1024 * 1024; // 4 MB 硬红线

if (!fs.existsSync(TARGET)) {
  console.error('❌ 未找到交付文件：./bundle/pack_map_panels.js');
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

vm.runInContext(src, sandbox, { filename: 'bundle/pack_map_panels.js' });
const pack = sandbox.Code00ArtPacks && sandbox.Code00ArtPacks.mapPanels;
check(!!pack, '未注册 window.Code00ArtPacks.mapPanels');

if (pack) {
  check(pack.id === 'mapPanels', `pack.id 应为 "mapPanels"`);
  check(pack.version === 1, `pack.version 应为 1`);
  const reqFns = [
    'init', 'drawMapScrollBg', 'drawMapGateDivider', 'drawMapNode',
    'drawTitleEmblem', 'drawSceneRibbon', 'drawChoiceIcon', 'drawSummaryCrest'
  ];
  for (const fn of reqFns) check(typeof pack[fn] === 'function', `缺少必需方法：${fn}`);

  const t0 = sandbox.performance.now();
  if (typeof pack.init === 'function') pack.init(makeCanvas);
  const initMs = sandbox.performance.now() - t0;
  check(initMs <= 60, `init 预烘焙耗时过长：${initMs.toFixed(1)}ms（上限 60ms）`);

  const ctx = makeCtx();
  try {
    const segs = [{ name: '林缘', from: 1, to: 4 }, { name: '腹地', from: 5, to: 7 }, { name: '巨木树冠', from: 8, to: 8 }];
    pack.drawMapScrollBg(ctx, 140, 64, 680, 476, 120, 960, 480, segs);
    pack.drawMapGateDivider(ctx, 160, 800, 480, false, 1.0);
    pack.drawMapGateDivider(ctx, 160, 800, 480, true, 1.0);
    for (const tp of ['battle', 'elite', 'event', 'shop', 'camp', 'boss']) {
      for (const st of ['visited', 'avail', 'future', 'dim']) {
        pack.drawMapNode(ctx, tp, 300, 200, tp === 'boss' ? 30 : 19, { status: st, hover: st === 'future', t: 1.5 });
      }
    }
    pack.drawTitleEmblem(ctx, 480, 120, '落果密林', '深入林地 · 第 1 步到第 8 步', 1.2);
    pack.drawSceneRibbon(ctx, 480, 54, 460, '营火整备', '三选一，选了就整备完毕');
    const kinds = ['camp_heal', 'camp_carve', 'camp_purge', 'shop_potion', 'shop_carve', 'gate_retreat', 'gate_advance', 'event_wood', 'event_stele', 'event_pool', 'event_bag'];
    for (const k of kinds) pack.drawChoiceIcon(ctx, k, 200, 300, 34);
    for (const o of ['victory', 'retreat', 'defeat']) pack.drawSummaryCrest(ctx, 480, 100, o, 1.5);
  } catch (e) {
    errors.push(`接口运行期异常：${e.stack || e.message}`);
  }

  check(!ctx.__flags.runtimeFilterSet, '运行期触发了 ctx.filter');
  check(!ctx.__flags.runtimeShadowSet, '运行期触发了 ctx.shadowBlur');

  const totalBytes = canvases.reduce((s, c) => s + c.width * c.height * 4, 0);
  const mb = totalBytes / (1024 * 1024);
  check(totalBytes <= BUDGET_BYTES, `离屏贴图超标：${mb.toFixed(2)} MB（上限 4.00 MB）`);

  console.log('\n[UI-03 探索地图与非战斗装饰 自动化校验报告]');
  console.log(`- 名称：${pack.name || pack.id} (v${pack.version})`);
  console.log(`- 初始化耗时：${initMs.toFixed(2)} ms（上限 60 ms）`);
  console.log(`- 离屏画布：${canvases.length} 张，合计 ${mb.toFixed(2)} MB（上限 4.00 MB）`);
}

if (errors.length) {
  console.error(`\n❌ 校验未通过（${errors.length} 项错误）：\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log('\n✅ 全部硬性校验通过！可以打开 preview.html 滚动目检并打包 bundle_ui03_map.zip。');
