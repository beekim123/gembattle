// 外包交付自动化校验脚本：UI-04 可旋转像素地面与 3D 战斗特效（运行：node verify.mjs）
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(ROOT, 'bundle', 'pack_ground_vfx.js');
const BUDGET_BYTES = 6 * 1024 * 1024; // 6 MB 硬红线

if (!fs.existsSync(TARGET)) {
  console.error('❌ 未找到交付文件：./bundle/pack_ground_vfx.js');
  process.exit(1);
}

const canvases = [];
function makeCtx() {
  const grad = { addColorStop() {} };
  const state = { filter: 'none', shadowBlur: 0, globalAlpha: 1, imageSmoothingEnabled: true, fillStyle: '#000', strokeStyle: '#000', lineWidth: 1 };
  let runtimeFilterSet = false, runtimeShadowSet = false, badCoord = false;
  const checkNums = (args) => { for (const a of args) if (typeof a === 'number' && !Number.isFinite(a)) badCoord = true; };
  return new Proxy(state, {
    get(o, k) {
      if (k === '__flags') return { runtimeFilterSet, runtimeShadowSet, badCoord };
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (k === 'createImageData') return (w, h) => ({ width: w, height: h, data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4) });
      return (...args) => { checkNums(args); };
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

// 加载工坊只读 math 与 habitats 供复用
for (const rel of ['core/math.js', 'core/habitats.js']) {
  const f = path.join(ROOT, rel);
  if (fs.existsSync(f)) vm.runInContext(fs.readFileSync(f, 'utf8'), sandbox, { filename: rel });
}

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

vm.runInContext(src, sandbox, { filename: 'bundle/pack_ground_vfx.js' });
const pack = sandbox.Code00ArtPacks && sandbox.Code00ArtPacks.groundVfx;
check(!!pack, '未注册 window.Code00ArtPacks.groundVfx');

const BIOMES = ['forest', 'swamp', 'meadow', 'ruins', 'canopy', 'camp', 'trade', 'gate'];
if (pack) {
  check(pack.id === 'groundVfx', `pack.id 应为 "groundVfx"`);
  check(pack.version === 1, `pack.version 应为 1`);
  const reqFns = ['init', 'buildGroundTile', 'drawGroundAmbient3D', 'drawSpellBolt3D', 'drawImpactWave3D', 'drawAttackFx3D'];
  for (const fn of reqFns) check(typeof pack[fn] === 'function', `缺少必需方法：${fn}`);

  if (typeof pack.init === 'function') pack.init(makeCanvas);

  // 1. 校验 8 套地面构建与缓存复用
  let maxBuildMs = 0;
  for (const bid of BIOMES) {
    const t0 = sandbox.performance.now();
    const g1 = pack.buildGroundTile(bid, makeCanvas, 384);
    const ms = sandbox.performance.now() - t0;
    maxBuildMs = Math.max(maxBuildMs, ms);
    check(!!(g1 && g1.canvas && g1.canvas.width >= 256), `${bid} buildGroundTile 必须返回 { canvas, size, biomeId }`);
    const beforeCount = canvases.length;
    const g2 = pack.buildGroundTile(bid, makeCanvas, 384);
    check(g2.canvas === g1.canvas && canvases.length === beforeCount, `${bid} buildGroundTile 未做缓存复用`);
  }
  check(maxBuildMs <= 40, `单套地面构建耗时偏慢：${maxBuildMs.toFixed(1)}ms（上限 40ms）`);

  // 2. 校验全部 3D 特效在不同旋转角与不同 k 下零报错零 NaN
  const ctx = makeCtx();
  const makeProj = (th) => {
    const c = Math.cos(th), s = Math.sin(th), SC = 5, TILT = 0.6, HS = 0.8;
    return (wx, wy, wz = 0) => [480 + (c * wx - s * wy) * SC, 270 + (s * wx + c * wy) * TILT * SC - wz * HS * SC, s * wx + c * wy];
  };

  try {
    for (const th of [0, 0.4, 1.57, 3.14, 5.1]) {
      const proj = makeProj(th);
      for (const bid of BIOMES) pack.drawGroundAmbient3D(ctx, bid, proj, 2.35, 1.4);
      for (const art of ['red', 'green', 'blue', 'white', 'rainbow']) {
        for (const k of [0, 0.25, 0.5, 0.85, 1]) {
          pack.drawSpellBolt3D(ctx, { from: [0, 30, 14], to: [0, -26, 12], k, art, big: art === 'rainbow' }, proj);
        }
      }
      for (const wk of ['white_wave', 'rainbow_burst', 'shield_shatter', 'ward_block']) {
        for (const k of [0, 0.3, 0.7, 1]) pack.drawImpactWave3D(ctx, wk, [0, -26, 6], k, proj);
      }
      for (const fx of ['spit', 'puff', 'club', 'petals', 'fruit', 'claw', 'bite', 'roots']) {
        for (const k of [0, 0.2, 0.5, 0.8, 1]) pack.drawAttackFx3D(ctx, fx, k, [0, -26, 12], [0, 30, 10], proj);
      }
    }
  } catch (e) {
    errors.push(`3D 特效运行期异常：${e.stack || e.message}`);
  }

  check(!ctx.__flags.runtimeFilterSet, '运行期触发了 ctx.filter');
  check(!ctx.__flags.runtimeShadowSet, '运行期触发了 ctx.shadowBlur');
  check(!ctx.__flags.badCoord, '绘制坐标出现 NaN 或 Infinity');

  const totalBytes = canvases.reduce((s, c) => s + c.width * c.height * 4, 0);
  const mb = totalBytes / (1024 * 1024);
  check(totalBytes <= BUDGET_BYTES, `8 套地面总内存超标：${mb.toFixed(2)} MB（上限 6.00 MB）`);

  console.log('\n[UI-04 可旋转像素地面与 3D 特效 自动化校验报告]');
  console.log(`- 名称：${pack.name || pack.id} (v${pack.version})`);
  console.log(`- 最慢单套地面构建：${maxBuildMs.toFixed(2)} ms（上限 40 ms）`);
  console.log(`- 离屏画布：${canvases.length} 张，合计 ${mb.toFixed(2)} MB（上限 6.00 MB）`);
}

if (errors.length) {
  console.error(`\n❌ 校验未通过（${errors.length} 项错误）：\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log('\n✅ 全部硬性校验通过！可以打开 preview.html 360° 实景旋转终检并打包 bundle_ui04_ground_vfx.zip。');
