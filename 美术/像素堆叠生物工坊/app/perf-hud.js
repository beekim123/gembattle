'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

// =============================================================================
// 预览台上的半透明性能浮层
//
//   折叠：一行看「帧率 · 主线程 / GPU 占了预算多少 · 短板是谁」，下面一条帧间隔小图
//   展开：帧、每帧开销（逻辑 / 渲染指令 / 烘焙 / GPU）、贴图、画面，全部列出来
//   隐藏：不显示（快捷键 P 在三种之间轮换，点浮层标题在折叠 / 展开之间切）
//
// 数从哪来：
//   - 帧间隔：requestAnimationFrame 两次之间的时间，屏幕刷新率从最快那批帧间隔推出来；
//   - 逻辑 / 渲染指令 / 烘焙：主循环里分段计时（烘焙时间是渲染器自己记的）；
//   - 满负荷一帧（含 GPU）：Canvas 2D 没有直接读 GPU 耗时的接口，单读一次「等 GPU 画完」本身就要 1~5ms 来回，
//     不能每帧抽。所以场景一变（同屏数量、生境、渲染方式、缩放、画布大小），等 0.9 秒缓存热了，
//     就在原画面上不等刷新连着画 6~40 帧，每帧把 1 个像素拷进 1×1 小画布逼它真的交给 GPU，最后只等一次，
//     扣掉一次来回的延迟，÷ 帧数 = 满负荷时一帧要多久（跟 tools/bench.js 同一个办法）。
//     CPU 和 GPU 是流水线并行的：这个数明显大于主线程时间，就说明 GPU 是瓶颈。
//     测的时候画面会停几十毫秒，那一下不算进帧间隔统计。
// =============================================================================
(function (PW) {
  const N = 240;                    // 统计窗口（帧）
  const SPARK = 180;                // 小图显示最近多少帧
  const MEASURE_DELAY_MS = 900;     // 场景变了以后等多久再测满负荷（让烘焙缓存先热起来）
  const MEASURE_TARGET_MS = 60;     // 一次满负荷测量大约占多少毫秒（画面会停这么久）
  const CLIFF_MB = 32;              // Chrome 一帧引用贴图超过这个数会掉到慢路径（见 文档/性能与流畅度-2026-11-23.md）
  const RATES = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 170, 180, 240, 360];
  const MODES = ['mini', 'full', 'off'];

  class Ring {
    constructor(n) { this.a = new Float32Array(n); this.n = n; this.i = 0; this.len = 0; }
    push(v) { this.a[this.i] = v; this.i = (this.i + 1) % this.n; if (this.len < this.n) this.len++; }
    at(k) { return this.a[(this.i - this.len + k + this.n * 2) % this.n]; } // k = 0 最旧
    mean() { let s = 0; for (let k = 0; k < this.len; k++) s += this.at(k); return this.len ? s / this.len : 0; }
    max() { let m = 0; for (let k = 0; k < this.len; k++) m = Math.max(m, this.at(k)); return m; }
    sum() { let s = 0; for (let k = 0; k < this.len; k++) s += this.at(k); return s; }
    sorted() { const out = []; for (let k = 0; k < this.len; k++) out.push(this.at(k)); return out.sort((x, y) => x - y); }
  }

  const q = (arr, p) => arr.length ? arr[Math.min(arr.length - 1, Math.floor(p * arr.length))] : 0;
  const f1 = (v) => (v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2));
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function create(opts) {
    const { root, renderer, canvas } = opts;
    let mode = MODES.includes(opts.mode) ? opts.mode : 'mini';

    const iv = new Ring(N), logic = new Ring(N), render = new Ring(N), bake = new Ring(N), bakes = new Ring(N);
    let skipNext = false;
    let bestHz = 0;                 // 见过的最高刷新率（被浏览器限帧时不跟着往下掉）
    let full = null;                // 最近一次满负荷测量 { frameMs, cpuMs, k, at, count }
    let sig = '', due = 0;
    let lastEvict = renderer.atlas ? renderer.atlas.evictions : 0, lastEvictAt = performance.now(), evictPerSec = 0;
    let lastUpdate = 0;
    let snap = null;

    const probe = PW.Renderer.makeCanvas(1, 1);
    const pctx = probe.getContext('2d');

    root.innerHTML = `
      <div class="hud-head" title="点一下：折叠 / 展开（P：折叠 → 展开 → 隐藏）">
        <span class="hud-dot"></span><span class="hud-line"></span><span class="hud-fold"></span>
      </div>
      <canvas class="hud-spark"></canvas>
      <div class="hud-body"></div>`;
    root.addEventListener('click', (e) => { if (e.target.closest('[data-remeasure]')) { e.stopPropagation(); due = performance.now(); } });
    const head = root.querySelector('.hud-head');
    const line = root.querySelector('.hud-line');
    const fold = root.querySelector('.hud-fold');
    const spark = root.querySelector('.hud-spark');
    const body = root.querySelector('.hud-body');
    const sctx = spark.getContext('2d');
    head.onclick = () => setMode(mode === 'full' ? 'mini' : 'full');

    function setMode(m) {
      mode = MODES.includes(m) ? m : 'mini';
      root.dataset.mode = mode;
      fold.textContent = mode === 'full' ? '收起 ▴' : '全部 ▾';
      if (opts.onMode) opts.onMode(mode);
      lastUpdate = 0;
    }
    setMode(mode);

    // 每帧调用：这一帧的帧间隔、逻辑耗时、渲染耗时（毫秒）
    function frame(frameMs, logicMs, renderMs) {
      if (skipNext) { skipNext = false; return; }
      if (frameMs <= 0 || frameMs > 1000) return; // 切走标签页回来的那一下不算
      const st = renderer.stats || {};
      iv.push(frameMs);
      logic.push(logicMs);
      render.push(renderMs);
      bake.push(st.frameBakeMs || 0);
      bakes.push(st.frameBakes || 0);
    }

    // 主循环每帧在 renderScene 之后调用。signature 是「场景长什么样」的字符串，变了就排一次满负荷测量。
    // renderFn 重画当前这一帧（不推进动画）。
    function maybeMeasure(now, signature, renderFn) {
      if (mode === 'off') return;
      if (signature !== sig) { sig = signature; due = now + MEASURE_DELAY_MS; }
      if (!due || now < due) return;
      due = 0;
      measure(renderFn);
    }

    function measure(renderFn) {
      const flush = () => pctx.drawImage(canvas, 0, 0, 1, 1, 0, 0, 1, 1);
      const wait = () => pctx.getImageData(0, 0, 1, 1);
      flush(); wait();                                   // 先把排着的活清空
      const guess = Math.max(0.4, render.mean() || 1, full ? full.frameMs : 0);
      const k = Math.max(6, Math.min(40, Math.floor(MEASURE_TARGET_MS / guess)));
      let cpu = 0;
      const t0 = performance.now();
      for (let i = 0; i < k; i++) {
        const a = performance.now();
        renderFn();
        cpu += performance.now() - a;
        flush();
      }
      wait();
      const total = performance.now() - t0;
      const r0 = performance.now();
      flush(); wait();                                   // 空跑一次来回，量出等 GPU 本身的延迟
      const rt = performance.now() - r0;
      full = { frameMs: Math.max(cpu / k, (total - rt) / k), cpuMs: cpu / k, k, at: performance.now() };
      skipNext = true;
    }

    function compute(ctx) {
      const s = iv.sorted();
      const fastest = q(s, 0.5) || 16.7;   // 满帧时中位数就是刷新间隔；忙的时候偏大，但 bestHz 只升不降
      const hzNow = RATES.reduce((best, r) => Math.abs(1000 / r - fastest) < Math.abs(1000 / best - fastest) ? r : best, 60);
      if (iv.len >= 30 && hzNow > bestHz) bestHz = hzNow;
      const hz = Math.max(60, bestHz || hzNow);   // 低于 60Hz 的屏幕几乎没有，低于 60 多半是浏览器在限帧
      const B = 1000 / hz;
      const secs = Math.max(0.001, iv.sum() / 1000);
      let drops = 0;
      for (let k = 0; k < iv.len; k++) if (iv.at(k) > B * 1.5) drops++;
      const lg = logic.mean(), rd = render.mean(), bk = bake.mean();
      const rdOnly = Math.max(0, rd - bk);
      const cpu = lg + rd;
      // GPU 比主线程慢 25% 以上才算它拖后腿（流水线并行，慢的那边决定一帧多久）
      const gpuBound = !!full && full.frameMs > full.cpuMs * 1.25 + 0.15;
      const gpu = gpuBound ? full.frameMs : 0;
      const cost = Math.max(cpu, gpu);
      const ci = renderer.cacheInfo ? renderer.cacheInfo() : { mb: 0, budgetMB: 0, pages: 0, evictions: 0, rescued: 0, lost: 0 };
      const now = performance.now();
      if (now - lastEvictAt > 900) {
        evictPerSec = (ci.evictions - lastEvict) * 1000 / (now - lastEvictAt);
        lastEvict = ci.evictions; lastEvictAt = now;
      }
      const dropPerSec = drops / secs;
      const fps = iv.len ? 1000 / iv.mean() : 0;
      const bakePerSec = bakes.sum() / secs;
      const maxLogic = logic.max(), maxRender = render.max(), maxBake = bake.max();

      // 短板：先看贴图会不会撞断崖、有没有在反复淘汰，再看掉帧是不是尖峰造成的，最后看谁占预算最多
      const parts = [
        { k: '逻辑', ms: lg, why: `${ctx.count} 只的动作和物理` },
        { k: '渲染指令', ms: rdOnly, why: '排序、算位置、贴图调用（主线程）' },
        { k: '烘焙', ms: bk, why: evictPerSec > 1 ? `图集满了在淘汰重烘（${evictPerSec.toFixed(1)} 页/秒，${Math.round(bakePerSec)} 张/秒）；右栏调高贴图预算能少烘，但别超过 ${CLIFF_MB}MB` : `新角度 ${Math.round(bakePerSec)} 张/秒` },
        { k: 'GPU', ms: gpu, why: '贴图量大，GPU 画得比主线程排得慢' }
      ];
      let weak = parts.reduce((a, b) => (b.ms > a.ms ? b : a));
      weak = { ...weak, val: `${f1(weak.ms)}ms` };
      if (ci.mb >= CLIFF_MB - 2) {
        weak = { k: '贴图', val: `${ci.mb}/${CLIFF_MB}MB`, why: `图集快到 ${CLIFF_MB}MB 断崖，再多 GPU 会突然慢好几倍；右栏把贴图预算调回 28MB` };
      } else if (document.hidden) {
        weak = { k: '浏览器限帧', val: '页面在后台', why: '这个页面现在不在屏幕上，浏览器会把它限到很低的帧率，这时的数字都不准，切回来看' };
      } else if (q(s, 0.5) > B * 1.8 && cost < B * 0.5) {
        weak = { k: '浏览器限帧', val: `${Math.round(fps)} fps`, why: `帧间隔一直在 ${f1(q(s, 0.5))}ms 左右，可每帧只用 ${f1(cost)}ms：是浏览器在给这个页面限帧（窗口在后台、被挡住、省电模式或在录屏），不是工坊慢` };
      } else if (dropPerSec >= 1 && cost < B * 0.7) {
        const spike = [['逻辑', maxLogic], ['渲染', maxRender - maxBake], ['烘焙', maxBake]].reduce((a, b) => (b[1] > a[1] ? b : a));
        weak = { k: '卡顿', val: `最慢 ${f1(q(s, 1))}ms`, why: spike[1] > B * 0.5 ? `尖峰来自${spike[0]}（${f1(spike[1])}ms）` : '平均不忙，尖峰可能是浏览器回收内存或别的标签页' };
      }

      let level = 'ok';
      if (weak.k === '浏览器限帧') level = 'warn';
      else if (dropPerSec >= 2 || cost > B * 0.9) level = 'bad';
      else if (dropPerSec >= 0.5 || cost > B * 0.6) level = 'warn';

      return {
        hz, B, fps, p50: q(s, 0.5), p95: q(s, 0.95), worst: q(s, 1), dropPerSec,
        logic: lg, render: rdOnly, bake: bk, bakePerSec, full, gpuBound, gpu, cpu, cost,
        room: cost > 0 ? B / cost : 0,
        ci, evictPerSec, weak, level,
        count: ctx.count, parts: renderer.stats ? renderer.stats.frameParts : 0, draws: renderer.stats ? renderer.stats.frameDraws : 0,
        w: canvas.width, h: canvas.height, artPx: renderer.artPx, renderMode: ctx.renderMode
      };
    }

    const MODE_NAME = { cached: '游戏缓存', crisp: '高清逐层', retro: '复古低分' };
    const bar = (ratio, cls) => `<span class="hud-bar"><i class="${cls || ''}" style="width:${Math.min(100, Math.max(0, ratio * 100)).toFixed(1)}%"></i></span>`;
    const lvl = (r) => (r > 0.9 ? 'bad' : r > 0.6 ? 'warn' : 'ok');

    function drawSpark(S) {
      const dpr = window.devicePixelRatio || 1;
      const cw = spark.clientWidth || SPARK, ch = spark.clientHeight || 26;
      if (spark.width !== Math.round(cw * dpr) || spark.height !== Math.round(ch * dpr)) {
        spark.width = Math.round(cw * dpr); spark.height = Math.round(ch * dpr);
      }
      sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      sctx.clearRect(0, 0, cw, ch);
      const n = Math.min(iv.len, SPARK);
      const bw = cw / SPARK;
      const top = S.B * 2.2;
      const y = (ms) => ch - Math.min(1, ms / top) * ch;
      for (let k = 0; k < n; k++) {
        const idx = iv.len - n + k;
        const v = iv.at(idx), c = logic.at(idx) + render.at(idx);
        const x = (SPARK - n + k) * bw;
        sctx.fillStyle = v > S.B * 1.5 ? 'rgba(214,72,40,.85)' : v > S.B * 1.15 ? 'rgba(206,140,30,.75)' : 'rgba(60,150,100,.45)';
        sctx.fillRect(x, y(v), Math.max(1, bw - 0.2), ch - y(v));
        sctx.fillStyle = 'rgba(30,50,80,.55)';
        sctx.fillRect(x, y(c), Math.max(1, bw - 0.2), ch - y(c));
      }
      sctx.fillStyle = 'rgba(30,40,60,.5)';
      sctx.fillRect(0, Math.round(y(S.B)) - 0.5, cw, 1);
    }

    function render_(S) {
      root.dataset.level = S.level;
      line.innerHTML = `<b>${Math.round(S.fps)}</b><small>fps</small>` +
        `<span class="sep"></span>每帧 <b>${f1(S.cost)}</b> / ${f1(S.B)}ms` +
        `<span class="sep"></span>短板 <b class="weak">${esc(S.weak.k)}</b> ${esc(S.weak.val)}`;
      drawSpark(S);
      if (mode !== 'full') { body.innerHTML = ''; return; }
      const B = S.B;
      const row = (k, v, extra = '') => `<div class="hud-row"><span class="k">${k}</span><span class="v">${v}</span>${extra}</div>`;
      body.innerHTML =
        `<div class="hud-why">短板：<b>${esc(S.weak.k)}</b> — ${esc(S.weak.why)}${S.level === 'ok' ? '。现在很宽裕，这只是最费的一项' : ''}</div>` +
        `<div class="hud-sec">帧 · 屏幕 ${S.hz}Hz（每帧预算 ${f1(B)}ms）</div>` +
        row('帧率', `${Math.round(S.fps)} fps`) +
        row('帧间隔', `中位 ${f1(S.p50)} · p95 ${f1(S.p95)} · 最慢 ${f1(S.worst)}ms`) +
        row('掉帧', `${S.dropPerSec.toFixed(1)} 次/秒`, bar(S.dropPerSec / 5, S.dropPerSec >= 2 ? 'bad' : S.dropPerSec >= 0.5 ? 'warn' : 'ok')) +
        `<div class="hud-sec">每帧开销（条 = 占预算多少）</div>` +
        row('逻辑', `${f1(S.logic)}ms`, bar(S.logic / B, lvl(S.logic / B))) +
        row('渲染指令', `${f1(S.render)}ms`, bar(S.render / B, lvl(S.render / B))) +
        row('烘焙', `${f1(S.bake)}ms · ${Math.round(S.bakePerSec)} 张/秒`, bar(S.bake / B, lvl(S.bake / B))) +
        row('GPU', !S.full ? '场景停 1 秒后自动测…' : S.gpuBound ? `≈ ${f1(S.gpu)}ms（比主线程慢，是瓶颈）` : `≤ ${f1(S.full.cpuMs)}ms（藏在主线程后面）`, bar(S.gpu / B, lvl(S.gpu / B))) +
        row('满负荷', S.full ? `一帧 ${f1(S.full.frameMs)}ms ≈ ${Math.round(1000 / S.full.frameMs)} fps 上限 <a class="hud-link" data-remeasure>重测</a>` : '—') +
        row('余量', S.room ? `×${S.room.toFixed(1)}（按慢的那边算）` : '—') +
        `<div class="hud-sec">贴图（Chrome 超过 ${CLIFF_MB}MB 会突然变慢）</div>` +
        row('图集', `${S.ci.mb} / 预算 ${S.ci.budgetMB}MB`, bar(S.ci.mb / CLIFF_MB, S.ci.mb >= CLIFF_MB * 0.9 ? 'bad' : S.ci.mb >= CLIFF_MB * 0.7 ? 'warn' : 'ok')) +
        row('页 · 淘汰', `${S.ci.pages} 页 · ${S.evictPerSec.toFixed(1)} 页/秒 · 救回 ${S.ci.rescued} · 丢 ${S.ci.lost}`) +
        `<div class="hud-sec">画面</div>` +
        row('同屏', `${S.count} 只 · 部件 ${S.parts} · 绘制 ${S.draws} 次`) +
        row('画布', `${S.w}×${S.h} · 1 美术像素 = ${S.artPx} 屏幕像素`) +
        row('渲染', MODE_NAME[S.renderMode] || S.renderMode);
    }

    // 主循环每帧调用，自己控制 4 次/秒刷新文字
    function update(now, ctx) {
      if (mode === 'off' || now - lastUpdate < 250) return;
      lastUpdate = now;
      snap = compute(ctx);
      render_(snap);
    }

    return {
      frame, maybeMeasure, update, setMode,
      remeasure() { due = performance.now(); },
      cycle() { setMode(MODES[(MODES.indexOf(mode) + 1) % MODES.length]); },
      get mode() { return mode; },
      snapshot: (ctx) => compute(ctx || { count: 0, renderMode: renderer.getRenderMode() })
    };
  }

  PW.PerfHud = { create };
})(window.PixelWorkshop);
