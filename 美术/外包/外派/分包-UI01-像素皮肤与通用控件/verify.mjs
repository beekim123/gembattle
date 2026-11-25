// 外包交付自动化校验脚本：UI-01 像素皮肤与通用控件（零外部依赖，运行：node verify.mjs）
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(ROOT, 'bundle', 'pack_ui_skin.js');
const BUDGET_BYTES = 2 * 1024 * 1024; // 2 MB 硬红线

if (!fs.existsSync(TARGET)) {
  console.error('❌ 未找到交付文件：./bundle/pack_ui_skin.js');
  process.exit(1);
}

const canvases = [];
function makeCtx() {
  const grad = { addColorStop() {} };
  const state = { filter: 'none', shadowBlur: 0, globalAlpha: 1, imageSmoothingEnabled: true, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, font: '12px sans-serif', textAlign: 'left', textBaseline: 'alphabetic' };
  let runtimeFilterSet = false, runtimeShadowSet = false;
  const ctx = new Proxy(state, {
    get(o, k) {
      if (k === '__flags') return { runtimeFilterSet, runtimeShadowSet };
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4) });
      if (k === 'measureText') return (s) => ({ width: String(s || '').length * 8 });
      if (k === 'getTransform') return () => ({ a: 2, b: 0, c: 0, d: 2, e: 0, f: 0 });
      return () => {};
    },
    set(o, k, v) {
      if (k === 'filter' && v && v !== 'none') runtimeFilterSet = true;
      if (k === 'shadowBlur' && Number(v) > 0) runtimeShadowSet = true;
      o[k] = v;
      return true;
    }
  });
  return ctx;
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

// 1. 静态红线扫描
check(!/\.filter\s*=/.test(src), '源码禁止设置 ctx.filter（会拖垮 4K 帧率）');
check(!/shadowBlur/.test(src), '源码禁止使用 shadowBlur（请用像素阶梯描边或微圈替代）');
check(!/\bnew\s+Image\b|https?:\/\/|fetch\s*\(/i.test(src), '源码禁止外部图片或网络加载（必须纯 Canvas 2D 离屏程序化绘制）');

const BAD = /[\u706f\u70ec\u5f71\u591c\u9b42\u566c\u5e7d\u6e0a\u661f\u5149]|\u5b88.\u8005|\u4e4b/;
const lits = src.match(/(['"`])(?:\\.|(?!\1).)*\1/g) || [];
const badHits = [];
for (const lit of lits) { const m = lit.match(BAD); if (m) badHits.push(`${m[0]} in ${lit.slice(0, 24)}`); }
check(badHits.length === 0, `字符串含禁用字：${badHits.slice(0, 5).join('；')}`);

// 2. 加载与初始化校验
vm.runInContext(src, sandbox, { filename: 'bundle/pack_ui_skin.js' });
const pack = sandbox.Code00ArtPacks && sandbox.Code00ArtPacks.uiSkin;
check(!!pack, '未注册 window.Code00ArtPacks.uiSkin');

if (pack) {
  check(pack.id === 'uiSkin', `pack.id 应为 "uiSkin"，实际为 ${pack.id}`);
  check(pack.version === 1, `pack.version 应为 1，实际为 ${pack.version}`);
  const reqFns = [
    'init', 'drawPanel', 'drawButton', 'drawHeart', 'drawCoin',
    'drawHpBar', 'drawShield', 'drawCountdown', 'drawColorRing', 'drawGemLevelBar', 'drawPixelNumber'
  ];
  for (const fn of reqFns) check(typeof pack[fn] === 'function', `缺少必需方法：${fn}`);

  const t0 = sandbox.performance.now();
  if (typeof pack.init === 'function') pack.init(makeCanvas);
  const initMs = sandbox.performance.now() - t0;
  check(initMs <= 40, `init 预烘焙耗时过长：${initMs.toFixed(1)}ms（上限 40ms）`);

  // 3. 全接口覆盖实跑（0 报错、0 运行期 filter/shadowBlur）
  const mainCtx = makeCtx();
  try {
    for (const v of ['wood', 'parchment', 'stone', 'tooltip', 'bar']) {
      pack.drawPanel(mainCtx, 10, 10, 240, 120, v, { accentColor: '#ffd24a', highlight: true });
      pack.drawPanel(mainCtx, 10, 10, 64, 28, v, {});
    }
    for (const variant of ['primary', 'secondary', 'danger', 'ghost']) {
      for (const st of [{ enabled: true }, { enabled: true, hover: true }, { enabled: true, pressed: true }, { enabled: false }]) {
        pack.drawButton(mainCtx, 20, 20, 140, 34, '测试按钮', { variant, ...st });
      }
    }
    for (const fsVal of [1, 0.5, 0]) pack.drawHeart(mainCtx, 30, 30, 9, fsVal);
    pack.drawCoin(mainCtx, 50, 30, 9);
    pack.drawHpBar(mainCtx, 200, 80, 100, 420, 1100, 0, 3);
    pack.drawHpBar(mainCtx, 200, 80, 100, 280, 280, 0, 1);
    pack.drawShield(mainCtx, 200, 100, [2, 4, 0], [4, 4, 0], false);
    pack.drawShield(mainCtx, 200, 100, [0, 0, 0], [3, 0, 3], true);
    pack.drawCountdown(mainCtx, 120, 60, 4, 1.2, false);
    pack.drawCountdown(mainCtx, 120, 60, 1, 1.2, true);
    pack.drawColorRing(mainCtx, 70, 90, 30, 0b101101, 2, 1.5);
    pack.drawColorRing(mainCtx, 70, 90, 30, 0, 6, 1.5);
    for (let ch = 0; ch < 3; ch++) pack.drawGemLevelBar(mainCtx, 16, 160 + ch * 24, 104, ch, ch + 1, ch * 3 + 2, 10);
    pack.drawPixelNumber(mainCtx, '52381', 300, 200, { size: 22, color: '#ffffff', align: 'center' });
    pack.drawPixelNumber(mainCtx, '×16!', 300, 240, { size: 28, crit: true, align: 'center' });
    pack.drawPixelNumber(mainCtx, '+99999', 300, 280, { size: 32, rainbow: true, align: 'center' });
  } catch (e) {
    errors.push(`接口运行期异常：${e.stack || e.message}`);
  }

  check(!mainCtx.__flags.runtimeFilterSet, '运行期主画布触发了 ctx.filter');
  check(!mainCtx.__flags.runtimeShadowSet, '运行期主画布触发了 ctx.shadowBlur');

  // 4. 离屏贴图内存统计
  const totalBytes = canvases.reduce((s, c) => s + c.width * c.height * 4, 0);
  const mb = totalBytes / (1024 * 1024);
  check(totalBytes <= BUDGET_BYTES, `离屏贴图总占用超标：${mb.toFixed(2)} MB（上限 2.00 MB，共 ${canvases.length} 张画布）`);

  console.log('\n[UI-01 像素皮肤与控件 自动化校验报告]');
  console.log(`- 皮肤名称：${pack.name || pack.id} (v${pack.version})`);
  console.log(`- 初始化耗时：${initMs.toFixed(2)} ms（上限 40 ms）`);
  console.log(`- 离屏画布：${canvases.length} 张，合计 ${mb.toFixed(2)} MB（上限 2.00 MB）`);
}

if (errors.length) {
  console.error(`\n❌ 校验未通过（${errors.length} 项错误）：\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log('\n✅ 全部硬性校验通过！可以打开 preview.html 做实机视觉终检并打包交回 bundle_ui01_skin.zip。');
