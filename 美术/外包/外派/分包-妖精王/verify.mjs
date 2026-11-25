// 外包交付自动化校验脚本（零外部依赖，直接运行：node verify.mjs）
// 用途：硬性校验 ./bundle/boss_fairy_king.js 是否 100% 符合主工坊接口、像素堆叠规范与防糊红线。

import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const TARGET = path.join(ROOT, 'bundle', 'boss_fairy_king.js');

if (!fs.existsSync(TARGET)) {
  console.error('❌ 未找到交付文件：./bundle/boss_fairy_king.js');
  process.exit(1);
}

function makeCanvas(w, h) {
  return {
    width: Math.max(1, w),
    height: Math.max(1, h),
    getContext() {
      return {
        imageSmoothingEnabled: false,
        createImageData: (iw, ih) => ({ width: iw, height: ih, data: new Uint8ClampedArray(iw * ih * 4) }),
        putImageData() {}, clearRect() {}, fillRect() {}, drawImage() {},
        save() {}, restore() {}, translate() {}, rotate() {}, scale() {},
        beginPath() {}, arc() {}, ellipse() {}, fill() {}, stroke() {}, setTransform() {}
      };
    }
  };
}

const sandbox = {
  window: {},
  document: { createElement: () => makeCanvas(1, 1), currentScript: null },
  performance: { now: () => Number(process.hrtime.bigint()) / 1e6 },
  console, Math, Array, Object, Number, String, Boolean, Set, Map, WeakMap,
  Uint8Array, Uint8ClampedArray, Int32Array, Float32Array, Error, TypeError, RangeError
};
sandbox.window = sandbox;
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

function loadScript(rel) {
  const code = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  vm.runInContext(code, sandbox, { filename: rel });
}

for (const f of ['core/math.js', 'core/voxel.js', 'core/solvers.js', 'core/behaviors.js', 'core/renderer.js', 'core/registry.js', 'core/habitats.js']) {
  loadScript(f);
}

const sourceCode = fs.readFileSync(TARGET, 'utf8');
vm.runInContext(sourceCode, sandbox, { filename: 'bundle/boss_fairy_king.js' });

const PW = sandbox.PixelWorkshop;
const errors = [];
const warns = [];
const check = (cond, msg) => { if (!cond) errors.push(msg); };

const glowMatch = sourceCode.match(/glowKeys\s*:\s*\[([^\]]*)\]/);
if (glowMatch && /(eyeGlint|wingTrimHi)/i.test(glowMatch[1])) {
  errors.push('违规：eyeGlint / wingTrimHi 被放进了 glowKeys（会导致五官或翅边发糊）');
}

const stringLiterals = sourceCode.match(/(['"`])(?:\\.|(?!\1).)*\1/g) || [];
const badWords = [];
for (const lit of stringLiterals) {
  const m = lit.match(/[灯烬影夜魂噬幽渊星光]|守.者|.之./);
  if (m) badWords.push(`${m[0]} in ${lit.slice(0, 24)}`);
}
check(badWords.length === 0, `字符串含禁用字：${badWords.slice(0, 5).join('；')}`);

const def = PW.Assets.byId['boss_fairy_king'];
check(!!def, '未通过 PW.Creatures.push 登记 id 为 "boss_fairy_king" 的资产');

if (def) {
  const t0 = sandbox.performance.now();
  const inst = PW.Assets.spawn(def, { seed: 42 });
  const initMs = sandbox.performance.now() - t0;
  check(initMs <= 60, `单次建模耗时过长：${initMs.toFixed(1)}ms（上限 60ms）`);

  const parts = inst.parts || {};
  const partKeys = Object.keys(parts);
  check(partKeys.length >= 9, `部件资产过少（仅 ${partKeys.length} 个），需拆出腿/长裙/上身/头/鹿角冠/长发/双臂/权杖/三对蝶翼与技能道具`);
  for (const k of partKeys) {
    const p = parts[k];
    if (!p || typeof p.w !== 'number') continue;
    check(p.w <= 40 && p.d <= 40 && p.h <= 40, `部件 ${k} 尺寸超限：${p.w}×${p.d}×${p.h}（单盒必须 <= 40）`);
    if (p.palette) {
      const hexes = Object.values(p.palette).filter(v => typeof v === 'string');
      check(hexes.length <= 48, `部件 ${k} 色表超 48 色（当前 ${hexes.length}）`);
    }
  }

  const skins = def.skins || [];
  check(skins.length >= 4, `皮肤数不足 4 套（当前 ${skins.length}）`);
  for (let i = 0; i < skins.length; i++) {
    try { if (inst.applySkin) inst.applySkin(i); }
    catch (e) { errors.push(`applySkin(${i}) 报错：${e.message}`); }
  }

  const requiredActions = [
    'patrol', 'idle', 'stagger',
    'skill_pollen_veil', 'skill_petal_lance', 'skill_sprite_waltz', 'skill_prism_tempest'
  ];
  const actIds = (def.actions || []).map(a => a.id);
  for (const req of requiredActions) {
    check(actIds.includes(req), `Def.actions 缺少必需动作：${req}`);
  }

  const hab = PW.Habitats.HABITAT_MAP['meadow'] || PW.Habitats.HABITAT_DEFS[0];
  const vfx = new PW.Renderer.VFXPool();
  const params = Object.assign({ gaitFreq: 1, tailFlex: 1, spring: 1, speed: 1, scale: 1 }, def.defaultParams || {});

  for (const act of (def.actions || [])) {
    const dur = act.loop ? 2.5 : (act.duration || 2.5);
    const steps = Math.ceil(dur * 60);
    let maxParts = 0;
    for (let s = 0; s <= steps; s++) {
      const dt = 1 / 60;
      const t = s * dt;
      inst.update(dt, t, params, hab, vfx, {
        patrol: act.id === 'patrol',
        action: act.id,
        actionTime: t,
        homeX: 0, homeY: 0, radius: 68, others: []
      });
      const list = inst.buildPartList(hab) || [];
      maxParts = Math.max(maxParts, list.length);
      for (const item of list) {
        for (const f of ['x', 'y', 'lift', 'ro']) {
          const val = item[f];
          if (typeof val !== 'number' || !Number.isFinite(val)) {
            errors.push(`动作 ${act.id} 在 t=${t.toFixed(2)}s 部件 ${item.partKey || '?'} 出现非法值 ${f}=${val}`);
            break;
          }
        }
        if (Math.abs(item.x) > 110 || Math.abs(item.y) > 110 || item.lift < -8 || item.lift > 95) {
          warns.push(`动作 ${act.id} 部件 ${item.partKey} 位置偏远：(${item.x.toFixed(1)}, ${item.y.toFixed(1)}, z=${item.lift.toFixed(1)})`);
        }
      }
      if (errors.length >= 12) break;
    }
    check(maxParts >= 14, `动作 ${act.id} 渲染部件仅 ${maxParts} 个（含六翼、长发、花苞、权杖与躯干应 >= 14）`);
  }

  console.log(`\n[妖精王 自动化校验报告]`);
  console.log(`- 资产 ID：${def.id}（${def.name || '未命名'}）`);
  console.log(`- 建模耗时：${initMs.toFixed(2)} ms（红线 <= 60ms）`);
  console.log(`- 部件资产数：${partKeys.length} · 皮肤数：${skins.length} · 动作数：${actIds.length}`);
}

if (warns.length) console.log(`⚠️ 提示（${warns.length} 条，展示前 3 条）：\n  - ${warns.slice(0, 3).join('\n  - ')}`);
if (errors.length) {
  console.error(`\n❌ 校验未通过（${errors.length} 项错误）：\n  - ${errors.join('\n  - ')}`);
  process.exit(1);
}
console.log('\n✅ 全部硬性校验通过！可以打开 preview.html 做 360° 视觉终检并打包交回 bundle/。');
