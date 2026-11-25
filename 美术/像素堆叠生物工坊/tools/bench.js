'use strict';

// =============================================================================
// 同屏压测（工坊右栏「性能」里的按钮、网址加 ?bench=1、控制台 PixelWorkshop.Bench.suite() 都用它）
//
// 做法：在一张离屏画布上连续跑 N 帧「逻辑更新 + 渲染」，不等屏幕刷新。
//   - 每帧把画布的 1 个像素拷到一张 1×1 小画布上，逼浏览器把这一帧真的交给 GPU 执行
//     （不然浏览器会把被下一帧整屏盖掉的指令直接丢掉，GPU 开销算不进来）；
//   - 最后读一次那个小画布的像素，等 GPU 把排队的活全干完，总时长 ÷ 帧数 = 每帧真实耗时。
//   不用每帧 getImageData 读主画布：那样 Chrome 会把主画布降成 CPU 渲染，数字就不准了。
// 结果里：
//   frameMs  每帧总耗时（CPU + GPU，决定能跑多少帧）
//   cpuMs    其中 JS 主线程的时间（逻辑 + 渲染指令）
//   p95Ms    主线程最慢 5% 的帧（看卡不卡顿）
//   fps      = 1000 / frameMs，超过屏幕刷新率就是「稳满帧」
// =============================================================================
(function (PW) {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  function pickDefs(ids) {
    const all = (PW.Assets ? PW.Assets.list : PW.Creatures).filter(d => !d.category || d.category === 'creature');
    if (!ids || !ids.length) return all;
    return ids.map(id => all.find(d => d.id === id)).filter(Boolean);
  }

  async function run(opts = {}) {
    const defs = pickDefs(opts.ids);
    const count = opts.count ?? defs.length;
    const frames = opts.frames ?? 150;
    const warm = opts.warm ?? 200;
    const cssW = opts.cssW ?? 1280, cssH = opts.cssH ?? 720, dpr = opts.dpr ?? 2;
    const habId = opts.hab || 'forest';
    const hab = PW.Habitats.HABITAT_MAP[habId];
    const makeCanvas = PW.Renderer.makeCanvas;

    const cv = makeCanvas(1, 1);
    const r = new PW.Renderer.StackRenderer(cv);
    if (r.atlas) {
      r.fit(hab, cssW, cssH, dpr);
    } else {
      // 旧渲染器（对比用）：手动设尺寸
      cv.width = Math.round(cssW * dpr); cv.height = Math.round(cssH * dpr);
      r.DPR = dpr; r.SCALE = Math.max(2, Math.round((Math.round(cssH / 148)) * dpr));
      r.CW = cv.width; r.CH = cv.height;
      r.EW = Math.ceil(cv.width / 4); r.EH = Math.ceil(cv.height / 4);
      r.ec.width = r.eb.width = r.EW; r.ec.height = r.eb.height = r.EH;
      r.renderSky(hab);
    }
    if (opts.mode) r.setRenderMode(opts.mode, hab);

    // 实例：每种先建 1 个，多出来的克隆共用部件（跟游戏里同种怪共用资源一样）
    const templates = new Map();
    const actors = [];
    for (let i = 0; i < count; i++) {
      const def = defs[i % defs.length];
      const tpl = templates.get(def.id);
      const o = { seed: 17 + i * 31 };
      const inst = PW.Assets ? PW.Assets.spawn(def, o, tpl) : def.createInstance(makeCanvas, o);
      if (tpl && tpl.cachePrefix) inst.cachePrefix = tpl.cachePrefix; // 旧渲染器按前缀缓存，对比时也让克隆共用
      if (!tpl) templates.set(def.id, inst);
      actors.push(inst);
    }
    const n = actors.length;
    const layout = (i) => {
      const ring = n > 6 ? 14 + (i % 3) * 16 : 28;
      const ang = (i / n) * Math.PI * 2 + 0.35;
      return [Math.cos(ang) * ring, Math.sin(ang) * ring, ang + Math.PI / 2];
    };
    actors.forEach((a, i) => { const [x, y, yaw] = layout(i); a.reset(x, y, yaw); });
    const params = { gaitFreq: 1, tailFlex: 1, springiness: 1, speed: 1, scaleMul: 1 };
    const platform = PW.Habitats.buildHabitatPlatform(habId, makeCanvas, 200);
    const avoidFn = PW.Behaviors.computeEcoAvoidance;

    const trace = opts.trace ? [] : null;
    const probe = makeCanvas(1, 1);
    const pctx = probe.getContext('2d');
    let t = 0;
    const dt = 1 / 120;
    const cpu = [];
    let updAcc = 0;
    const step = (measure) => {
      t += dt;
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        const a = actors[i];
        const [hx, hy, hyaw] = layout(i);
        const av = n > 1 ? avoidFn(a, actors) : { avoidX: 0, avoidY: 0 };
        a.update(dt, t, params, hab, r.vfx, {
          patrol: true, homeX: n > 1 ? hx : 0, homeY: n > 1 ? hy : 0, homeYaw: hyaw,
          maxRadius: n > 1 ? 56 : 48, seed: 19 + i * 37, avoidX: av.avoidX, avoidY: av.avoidY,
          action: 'patrol', actionTime: t
        });
      }
      r.vfx.update(dt);
      const t1 = performance.now();
      if (opts.spin) r.th += dt * 0.55;
      r.renderScene(platform, actors, t);
      pctx.drawImage(cv, 0, 0, 1, 1, 0, 0, 1, 1);
      const t2 = performance.now();
      if (measure) {
        cpu.push(t2 - t0); updAcc += t1 - t0;
        if (trace) trace.push([+(t2 - t0).toFixed(2), r.stats ? r.stats.frameBakes : 0, r.atlas ? r.atlas.evictions : 0]);
      }
    };

    for (let i = 0; i < warm; i++) {
      step(false);
      if (i % 40 === 39) { pctx.getImageData(0, 0, 1, 1); await sleep(0); }
    }
    pctx.getImageData(0, 0, 1, 1);
    await sleep(0);
    const miss0 = r.cacheMisses || 0;
    const T0 = performance.now();
    for (let i = 0; i < frames; i++) step(true);
    pctx.getImageData(0, 0, 1, 1);
    const T = performance.now() - T0;

    cpu.sort((a, b) => a - b);
    const avg = cpu.reduce((s, x) => s + x, 0) / cpu.length;
    const frameMs = T / frames;
    const res = {
      count: n,
      kinds: templates.size,
      frameMs: +frameMs.toFixed(2),
      fps: Math.round(1000 / frameMs),
      cpuMs: +avg.toFixed(2),
      updateMs: +(updAcc / frames).toFixed(2),
      p95Ms: +cpu[Math.floor(cpu.length * 0.95)].toFixed(2),
      bakesPerFrame: +(((r.cacheMisses || 0) - miss0) / frames).toFixed(2),
      canvas: `${cv.width}×${cv.height}`,
      renderer: r.atlas ? 'new' : 'old'
    };
    if (r.cacheInfo) Object.assign(res, r.cacheInfo());
    if (trace) res.trace = trace;
    if (r.clearCache) r.clearCache();
    return res;
  }

  // 一组标准压测：同屏 1 / 3 / 6 / 12 / 24 / 36 只
  async function suite(opts = {}, onRow) {
    const counts = opts.counts || [1, 3, 6, 12, 24, 36];
    const rows = [];
    for (const c of counts) {
      const row = await run({ ...opts, count: c });
      rows.push(row);
      if (onRow) onRow(row);
      await sleep(30);
    }
    return rows;
  }

  PW.Bench = { run, suite };
})(window.PixelWorkshop);
