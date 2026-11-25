// 世界舞台与镜头：纯数学（世界到屏幕、反推、挂点）、镜头限幅与输入、地面不画假摆件、性能红线（静态扫描）。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  TILT, HS, BAKE_SCALE, BATTLE_TH0, BATTLE_SPAN, PARALLAX_MAX, STEP_ANGLE, TAU,
  project, layoutToWorld, unproject, anchor, depthOf, heightToWorld, heightToLayout, wrapAngle, clamp, Camera, ViewInput,
} from '../camera.js';
import { isBattleAct, groundPack, mountedPacks, createStage, workshopReady } from '../world-stage.js';
import { bakeGround } from '../env-ground.js';
import { buildFallbackTile, buildVignette } from '../ground-fallback.js';
import { BIOMES, BIOME_IDS } from '../../content/biomes.js';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// 数方法调用次数的假画布：bakeGround 要的 document.createElement 和 2D 上下文
function countingCanvas() {
  const cv = { width: 0, height: 0, calls: 0 };
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, {
    get: (o, k) => {
      if (k in o) return o[k];
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => { cv.calls++; return grad; };
      if (k === 'createPattern') return () => { cv.calls++; return {}; };
      if (k === 'measureText') return () => ({ width: 10 });
      return () => { cv.calls++; };
    },
    set: (o, k, v) => { o[k] = v; return true; },
  });
  cv.getContext = () => ctx;
  return cv;
}
function withFakeDocument(fn) {
  const old = globalThis.document;
  globalThis.document = { createElement: () => countingCanvas() };
  try { return fn(); } finally { if (old === undefined) delete globalThis.document; else globalThis.document = old; }
}

// 去掉注释的源码（够用来扫关键字，不是完整词法分析）
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
function sources(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.') || name === 'tests') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (name.endsWith('.js') && !name.endsWith('.test.js')) out.push(p);
  }
  return out;
}

export default function (t) {
  t.test('世界到屏幕：th = 0 时跟 960×540 布局一一对应，高度每格抬 2 个布局单位', () => {
    t.assert.equal(TILT, 0.6); t.assert.equal(HS, 0.8); t.assert.equal(BAKE_SCALE, 2.5);
    const o = [480, 256];
    const p = project(o, 0, 10, 20, 3);
    t.assert.ok(near(p[0], 480 + 25) && near(p[1], 256 + 30 - 6) && near(p[2], 20));
    for (const [lx, ly] of [[100, 400], [480, 256], [900, 60], [0, 0]]) {
      const [wx, wy] = layoutToWorld(o, lx, ly);
      const q = project(o, 0, wx, wy, 0);
      t.assert.ok(near(q[0], lx, 1e-9) && near(q[1], ly, 1e-9), `${lx},${ly}`);
    }
  });

  t.test('转镜头：绕原点转，距离不变；转 90° 以后 x 轴指向画面下方', () => {
    const o = [480, 300];
    const q = project(o, Math.PI / 2, 10, 0, 0);
    t.assert.ok(near(q[0], 480) && near(q[1], 300 + 10 * TILT * BAKE_SCALE) && near(q[2], 10));
    const a = project(o, 0, 0, 0, 0), b = project(o, 1.234, 0, 0, 0);
    t.assert.ok(near(a[0], b[0]) && near(a[1], b[1]), '原点转不动');
    for (const th of [-3, -1, 0.3, 2, 3.1]) {
      const r = Math.hypot(7, 11);
      const rx = (project(o, th, 7, 11, 0)[0] - o[0]) / BAKE_SCALE, ry = (project(o, th, 7, 11, 0)[1] - o[1]) / (BAKE_SCALE * TILT);
      t.assert.ok(near(Math.hypot(rx, ry), r, 1e-9), '地面距离不变 th=' + th);
    }
  });

  t.test('反推：屏幕点 → 世界地面点，跟 project 互为逆运算（任意镜头角）', () => {
    const o = [480, 258];
    for (const th of [0, 0.28, -0.7, 1.9, 3.0, -3.1]) for (const [wx, wy] of [[0, 0], [12, -8], [-30, 22], [5, 40]]) {
      const [sx, sy, d] = project(o, th, wx, wy, 0);
      const [ux, uy] = unproject(o, th, sx, sy);
      t.assert.ok(near(ux, wx, 1e-9) && near(uy, wy, 1e-9), `th=${th} ${wx},${wy}`);
      t.assert.ok(near(d, depthOf(th, wx, wy)), '深度一致');
    }
  });

  t.test('挂点：血条、飘字挂在脚下点正上方；th = 0 时就是布局点往上抬 h', () => {
    const o = [480, 256];
    const a = anchor(o, 0, 300, 200, 80);
    t.assert.ok(near(a[0], 300) && near(a[1], 120));
    t.assert.ok(near(heightToLayout(heightToWorld(37)), 37), '高度互逆');
    // 转了镜头，头顶仍在脚点正上方（屏幕 x 相同，y 高出 h）
    for (const th of [-0.5, 0.28, 1.3, 2.6]) {
      const foot = anchor(o, th, 300, 200, 0), top = anchor(o, th, 300, 200, 80);
      t.assert.ok(near(foot[0], top[0]) && near(foot[1] - top[1], 80, 1e-9), 'th=' + th);
    }
  });

  t.test('角度归一：落在 (−π, π]，非有限数回 0', () => {
    t.assert.ok(near(wrapAngle(3 * Math.PI), Math.PI) && near(wrapAngle(-Math.PI), Math.PI) && near(wrapAngle(TAU + 0.5), 0.5));
    t.assert.equal(wrapAngle(NaN), 0); t.assert.equal(wrapAngle(Infinity), 0);
    t.assert.equal(clamp(5, 0, 3), 3); t.assert.equal(clamp(-1, 0, 3), 0); t.assert.equal(clamp(2, 0, 3), 2);
  });

  t.test('战斗镜头：默认机位约 16°，只能在两边各转 45°；拖多狠都出不去', () => {
    const cam = new Camera().setup({ mode: 'battle', th0: BATTLE_TH0, origin: [480, 256], parallax: false });
    t.assert.ok(near(cam.th, BATTLE_TH0) && cam.limited && cam.canRotate);
    cam.rotateBy(50); for (let i = 0; i < 60; i++) cam.update(1 / 60);
    t.assert.ok(near(cam.user, BATTLE_SPAN) && cam.th <= BATTLE_TH0 + BATTLE_SPAN + 1e-9, '右边到头');
    cam.rotateBy(-500); for (let i = 0; i < 60; i++) cam.update(1 / 60);
    t.assert.ok(near(cam.user, -BATTLE_SPAN) && cam.th >= BATTLE_TH0 - BATTLE_SPAN - 1e-9, '左边到头');
    cam.recenter(); for (let i = 0; i < 120; i++) cam.update(1 / 60);
    t.assert.ok(near(cam.th, BATTLE_TH0, 1e-3), 'R 回正');
    cam.step(1); t.assert.ok(near(cam.user, STEP_ANGLE)); cam.step(-1); cam.step(-1); t.assert.ok(near(cam.user, -STEP_ANGLE));
    cam.rotateBy(NaN); t.assert.ok(near(cam.user, -STEP_ANGLE), '非数字不动');
  });

  t.test('战斗镜头：解锁以后能转满 360°，锁回来又被收进 ± 45°', () => {
    const cam = new Camera().setup({ mode: 'battle', th0: BATTLE_TH0, origin: [480, 256] });
    cam.setUnlocked(true); t.assert.ok(!cam.limited);
    cam.rotateBy(Math.PI); t.assert.ok(Math.abs(cam.user) > BATTLE_SPAN, '转到背面');
    cam.rotateBy(TAU * 3); t.assert.ok(cam.user > -Math.PI - 1e-9 && cam.user <= Math.PI + 1e-9, '一直归在一圈里');
    cam.setUnlocked(false); t.assert.ok(Math.abs(cam.user) <= BATTLE_SPAN + 1e-9 && cam.limited);
    const free = new Camera().setup({ mode: 'free' }); free.setUnlocked(true); t.assert.ok(!free.unlocked, '只有战斗镜头有解锁');
  });

  t.test('鼠标视差：最多 ± 4°，只在开着的时候叠上去', () => {
    t.assert.ok(near(PARALLAX_MAX, 4 * Math.PI / 180));
    const on = new Camera().setup({ mode: 'battle', th0: BATTLE_TH0, parallax: true }), off = new Camera().setup({ mode: 'battle', th0: BATTLE_TH0, parallax: false });
    for (const c of [on, off]) { c.setParallax(9); for (let i = 0; i < 300; i++) c.update(1 / 60); }
    t.assert.ok(near(on.th - BATTLE_TH0, PARALLAX_MAX, 1e-4), '开着：偏到 4°');
    t.assert.ok(near(off.th, BATTLE_TH0), '关着：不偏');
    on.setParallax(-0.5); for (let i = 0; i < 300; i++) on.update(1 / 60);
    t.assert.ok(near(on.th - BATTLE_TH0, -PARALLAX_MAX / 2, 1e-4));
    on.setParallax(NaN); for (let i = 0; i < 300; i++) on.update(1 / 60);
    t.assert.ok(near(on.th, BATTLE_TH0, 1e-4), '传非数字当不偏');
  });

  t.test('开放镜头：标题页松手一阵后慢转，拖动的时候不转；路线图（fixed）不能转', () => {
    const cam = new Camera().setup({ mode: 'free', autoSpin: 0.12, origin: [480, 318] });
    cam.update(1); t.assert.ok(cam.user > 0.1, '一开始就缓转');
    const u = cam.user; cam.rotateBy(0.5); cam.update(1); t.assert.ok(near(cam.user, u + 0.5), '刚拖过，先不转');
    cam.update(2.5); t.assert.ok(cam.user > u + 0.5 + 0.05, '松手 2 秒以后又转');
    cam.dragging = true; const v = cam.user; cam.update(5); t.assert.ok(near(cam.user, v), '手按着不转');
    const fixed = new Camera().setup({ mode: 'fixed' });
    fixed.rotateBy(1); fixed.step(1); fixed.recenter(); t.assert.ok(!fixed.canRotate && near(fixed.th, 0));
  });

  t.test('拖动输入：向右拖镜头角变小；点一下不算拖；Q / E 步进、R 回正', () => {
    const cam = new Camera().setup({ mode: 'free' }), vi = new ViewInput(cam);
    t.assert.ok(vi.down(100) && vi.active && cam.dragging);
    vi.move(200); t.assert.ok(cam.user < -0.5, '向右拖 100 个单位');
    t.assert.ok(vi.up() && !vi.active && !cam.dragging, '拖过了');
    const before = cam.user;
    vi.down(50); vi.move(52); t.assert.ok(!vi.up(), '只挪了 2 个单位，算点击'); t.assert.ok(cam.user < before);
    cam.recenter(); t.assert.ok(near(cam.user, 0));
    t.assert.ok(vi.key('q') && near(cam.user, -STEP_ANGLE)); t.assert.ok(vi.key('E') && near(cam.user, 0));
    vi.key('e'); t.assert.ok(vi.key('R') && near(cam.user, 0), 'R 回正');
    t.assert.ok(!vi.key('x'), '别的键不收');
    vi.down(10); vi.cancel(); t.assert.ok(!vi.active && !cam.dragging);
    const fixed = new Camera().setup({ mode: 'fixed' }), v2 = new ViewInput(fixed);
    t.assert.ok(!v2.down(0) && !v2.key('q') && !v2.move(5));
  });

  t.test('世界舞台：没有工坊（node 里）时造不出来，美术包清单是空的，战斗动作名认得全', () => {
    t.assert.ok(!workshopReady());
    t.assert.equal(createStage({}), null);
    t.assert.equal(groundPack(), null);
    t.assert.deepEqual(mountedPacks(), []);
    for (const a of ['battle_attack', 'battle_special', 'battle_stagger', 'battle_hurt']) t.assert.ok(isBattleAct(a), a);
    for (const a of ['idle', 'walk', 'battle_nothing', undefined]) t.assert.ok(!isBattleAct(a), String(a));
  });

  t.test('内置兜底地砖与暗角：画得出来，每个生态都能造，同一个生态每次一样', () => {
    for (const id of BIOME_IDS) {
      const a = buildFallbackTile(BIOMES[id], () => countingCanvas(), 384), b = buildFallbackTile(BIOMES[id], () => countingCanvas(), 384);
      t.assert.ok(a.calls > 100 && a.calls === b.calls, id);
      const v = buildVignette(BIOMES[id], () => countingCanvas());
      t.assert.ok(v.calls >= 3, id + ' 暗角');
    }
    t.assert.ok(buildFallbackTile(BIOMES.ruins, () => countingCanvas()).calls !== buildFallbackTile(BIOMES.forest, () => countingCanvas()).calls, '石板地和草地画法不同');
  });

  t.test('生态地面：世界舞台接管时（props: false）不画假树、假帐篷、假石门，每个生态都比带摆件的少画东西', () => {
    withFakeDocument(() => {
      for (const id of BIOME_IDS) {
        const withProps = bakeGround(BIOMES[id], 7, { props: true }), bare = bakeGround(BIOMES[id], 7, { props: false }), again = bakeGround(BIOMES[id], 7, { props: false });
        t.assert.ok(bare.calls < withProps.calls, `${id}：${bare.calls} 应少于 ${withProps.calls}`);
        t.assert.equal(bare.calls, again.calls, id + ' 同种子同结果');
      }
      t.assert.ok(bakeGround(BIOMES.forest, 7).calls === bakeGround(BIOMES.forest, 7, { props: true }).calls, '默认带摆件');
    });
  });

  t.test('性能红线：渲染、界面、场景代码里不出现 shadowBlur 和 ctx.filter（去掉注释再扫）', () => {
    const files = [...sources(join(ROOT, 'app')), ...sources(join(ROOT, 'modules'))];
    t.assert.ok(files.length > 20, '扫到的文件数 ' + files.length);
    const bad = [];
    for (const f of files) {
      const s = stripComments(readFileSync(f, 'utf8'));
      if (/shadowBlur/.test(s)) bad.push(relative(ROOT, f) + '：shadowBlur');
      if (/\.filter\s*=(?!=)/.test(s)) bad.push(relative(ROOT, f) + '：.filter =');
      if (/\bctx\.filter\b/.test(s)) bad.push(relative(ROOT, f) + '：ctx.filter');
      if (/\bfilter\s*:\s*['"`]/.test(s)) bad.push(relative(ROOT, f) + '：filter: 字符串');
    }
    t.assert.deepEqual(bad, []);
  });

  t.test('性能红线：世界舞台一帧只合一次发亮层、地面不再建整屏画布', () => {
    const s = stripComments(readFileSync(join(ROOT, 'modules/render/world-stage.js'), 'utf8'));
    t.assert.equal((s.match(/flushGlow\s*\(/g) || []).length >= 1, true);
    t.assert.ok(!/1920|1080/.test(s), '地面没有整屏尺寸的画布');
    t.assert.ok(!/createPattern/.test(s), '整屏图案填充太慢，不用');
    const main = stripComments(readFileSync(join(ROOT, 'app/main.js'), 'utf8'));
    t.assert.ok(!/26\s*(ms)?\b.*(降|缩|dpr)/i.test(main) && !/downscale|autoScale/i.test(main), '没有自动降分辨率');
  });
}
