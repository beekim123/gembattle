'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, localToWorldXY, hexToRgba } = PW.Math;
  const { EnvFeedback } = PW.Behaviors;

  // ===========================================================================
  // 投影与烘焙常数（这几个决定美术风格，改了画风就变了，别轻动）
  // ===========================================================================
  const TILT = 0.6;          // 俯视压扁
  const HS = 0.8;            // 每升高 1 格，屏幕上抬 0.8 格
  const BAKE_SCALE = 2.5;    // 1 格体素 = 2.5 个烘焙像素（1 个烘焙像素 = 1 个「美术像素」）
  const BAKE_STEP = 2;       // 每层抬 2 个烘焙像素（= HS × BAKE_SCALE）
  const BAKE_HALF = 1;       // 双子步压实，消掉斜角百叶窗缝
  const GROUND_SUPERSAMPLE = 2;

  // ===========================================================================
  // 流畅度参数（2026-11-23 claude 优化，原因见 文档/性能与流畅度-2026-11-23.md）
  // ===========================================================================
  // 角度档位按部件大小自适应：换一档角度时，部件最远端最多挪 ANGLE_EDGE_PX 个烘焙像素。
  // 大部件档位细（不再一格一格跳），小部件档位粗（省缓存）。旧版是一律 3°。
  const ANGLE_EDGE_PX = 1.75;
  const ANGLE_MIN_DEG = 1.5;
  const ANGLE_MAX_DEG = 7.5;
  // 浸水改「染水色」（不透明），不再半透明叠出珠子斑；档位 0..3
  const SUBMERGE_LEVELS = 3;
  const SUBMERGE_MIX = 0.44;   // 完全浸没时往水色混 44%，跟旧版 alpha 0.56 的观感对齐

  // ===========================================================================
  // 性能参数
  // 实测（Chrome 内核，2560×1440）：一帧里引用的贴图总量超过 32MB 左右，GPU 耗时会暴涨 7~35 倍。
  // 所以图集总量封顶 28MB（工坊右栏可改），天空只画在 1/8 大小的小画布上再放大贴，不占整屏贴图。
  // ===========================================================================
  const ATLAS_PAGE = 512;       // 烘焙图集一页 512²（1MB）；页小，淘汰时丢掉的热数据少
  const ATLAS_BUDGET_MB = 28;   // 图集总量上限（超过 32MB 会掉到 GPU 的慢路径，留一点余量）
  const BAKE_BUDGET_MS = 2.5;   // 每帧烘焙预算，超出就先借相邻角度顶一帧
  const SCRATCH_POOL = 8;       // 烘焙临时画布轮换，避免同一帧里反复改同一张画布

  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, w);
    c.height = Math.max(1, h);
    return c;
  }

  // 部件的几何信息（只算一次，挂在部件上）：
  //   u0..u1 / v0..v1 / zMin..zMax：真正有体素的范围（体素盒常留了很多空边，烘焙时按这个裁紧）
  //   sym：左右对称（x ↔ w-1-x 完全一样）→ 只烘 0~180°，另一半水平翻转着画
  //   R：转动半径（烘焙像素），决定角度档位多细
  function assetInfo(asset) {
    if (asset._pw) return asset._pw;
    const { w, d, h, grid } = asset;
    let x0 = w, x1 = -1, y0 = d, y1 = -1, z0 = h, z1 = -1;
    let sym = true;
    for (let z = 0; z < h; z++) {
      for (let y = 0; y < d; y++) {
        const row = (z * d + y) * w;
        for (let x = 0; x < w; x++) {
          const id = grid[row + x];
          if (sym && x < (w >> 1) && id !== grid[row + w - 1 - x]) sym = false;
          if (!id) continue;
          if (x < x0) x0 = x; if (x > x1) x1 = x;
          if (y < y0) y0 = y; if (y > y1) y1 = y;
          if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
      }
    }
    if (x1 < 0) { x0 = 0; x1 = 0; y0 = 0; y1 = 0; z0 = 0; z1 = 0; }
    const u0 = x0 - w * 0.5, u1 = x1 + 1 - w * 0.5, v0 = y0 - d * 0.5, v1 = y1 + 1 - d * 0.5;
    const R = Math.max(4, Math.hypot(Math.max(-u0, u1), Math.max(-v0, v1)) * BAKE_SCALE);
    asset._pw = { u0, u1, v0, v1, zMin: z0, zMax: z1, sym, R };
    return asset._pw;
  }

  // ===========================================================================
  // 通用 VFX 容器（涟漪、V 形尾迹、3D 像素粒子、接地扬尘）
  // ===========================================================================
  function compactInPlace(arr, keep) {
    let w = 0;
    for (let i = 0; i < arr.length; i++) {
      const it = arr[i];
      if (keep(it)) arr[w++] = it;
    }
    arr.length = w;
  }

  class VFXPool {
    constructor() {
      this.particles = [];
      this.ripples = [];
      this.wakes = [];
      this.maxParticles = 600;

      // 地表痕迹层（环形缓冲，数量封顶，直接绘入 drawGround 的 gbuf，不另开大画布）
      this.maxDecals = 220;
      this.decals = new Array(this.maxDecals);
      this.decalHead = 0;
      this.decalCount = 0;

      // 预留「留成摆件」环形缓冲（供 火1 冷石板 / 洞5 小蘑菇 / 树3 嫩芽复用）
      this.maxProps = 48;
      this.props = new Array(this.maxProps);
      this.propHead = 0;
      this.propCount = 0;
    }

    clear() {
      this.particles.length = 0;
      this.ripples.length = 0;
      this.wakes.length = 0;
      for (let i = 0; i < this.maxDecals; i++) this.decals[i] = null;
      this.decalHead = 0;
      this.decalCount = 0;
      for (let i = 0; i < this.maxProps; i++) this.props[i] = null;
      this.propHead = 0;
      this.propCount = 0;
    }

    // 新增贴地痕迹：kind 支持 'mound'(沙垄/土隆) | 'wet'(水沟/湿痕) | 'crack'(焦痕/裂纹)
    // 可选 propOnExpire: { kind, radius, life, color, rimColor } 在痕迹结束时自动留成摆件
    addDecal(opts) {
      if (!opts) return null;
      const idx = this.decalHead;
      let d = this.decals[idx];
      if (!d) {
        d = {};
        this.decals[idx] = d;
      }
      d.active = true;
      d.kind = opts.kind || 'mound';
      d.x = opts.x || 0;
      d.y = opts.y || 0;
      d.yaw = opts.yaw || 0;
      d.rx = opts.rx ?? opts.radius ?? 4.6;
      d.ry = opts.ry ?? opts.radius ?? 5.6;
      d.t = 0;
      d.life = Math.max(0.2, opts.life ?? 7.5);
      d.alpha = opts.alpha ?? 0.88;
      d.color = opts.color || '';
      d.hiColor = opts.hiColor || '';
      d.darkColor = opts.darkColor || '';
      d.seed = opts.seed ?? ((Math.abs(Math.round(d.x * 13 + d.y * 29)) % 97) + 1);
      d.propOnExpire = opts.propOnExpire || null;

      this.decalHead = (idx + 1) % this.maxDecals;
      if (this.decalCount < this.maxDecals) this.decalCount++;
      return d;
    }

    // 预留「留成摆件」接口：在地面留下一件低矮贴地摆件（石板、蘑菇、嫩芽等）
    addGroundProp(opts) {
      if (!opts) return null;
      const idx = this.propHead;
      let p = this.props[idx];
      if (!p) {
        p = {};
        this.props[idx] = p;
      }
      p.active = true;
      p.kind = opts.kind || 'slab';
      p.x = opts.x || 0;
      p.y = opts.y || 0;
      p.yaw = opts.yaw || 0;
      p.radius = opts.radius ?? 5.2;
      p.t = 0;
      p.life = opts.life ?? Infinity; // Infinity 表示常驻直到环形缓冲覆盖或清台
      p.color = opts.color || '';
      p.rimColor = opts.rimColor || '';
      p.seed = opts.seed ?? ((Math.abs(Math.round(p.x * 17 + p.y * 31)) % 89) + 1);

      this.propHead = (idx + 1) % this.maxProps;
      if (this.propCount < this.maxProps) this.propCount++;
      return p;
    }

    spawnParticle(x, y, z, vx, vy, vz, life, sz, color, glow = false, gravity = 0) {
      if (this.particles.length >= this.maxParticles) return;
      this.particles.push({ x, y, z, vx, vy, vz, t: 0, life, sz, color, glow, gravity });
    }

    addRipple(x, y, r0, r1, life, width = 1.8) {
      if (this.ripples.length > 80) this.ripples.shift();
      this.ripples.push({ x, y, r0, r1, t: 0, life, width });
    }

    addWake(x, y, yaw, width, life = 1.05) {
      if (this.wakes.length > 96) this.wakes.shift();
      this.wakes.push({ x, y, yaw, width, t: 0, life });
    }

    spawnSplash(wx, wy, count, power, fx) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
        const sp = (8 + Math.random() * 16) * power;
        this.spawnParticle(
          wx + (Math.random() - 0.5) * 3, wy + (Math.random() - 0.5) * 3, 1.2,
          Math.cos(a) * sp, Math.sin(a) * sp, (9 + Math.random() * 14) * power,
          0.35 + Math.random() * 0.22, 1.4 + Math.random() * 0.8,
          `rgb(${i % 2 === 0 ? fx.foamRGB : fx.ringRGB})`, i % 3 === 0, 48
        );
      }
    }

    spawnDust(wx, wy, count, power, fx) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * TAU;
        const sp = (6 + Math.random() * 14) * power;
        this.spawnParticle(
          wx + (Math.random() - 0.5) * 4, wy + (Math.random() - 0.5) * 4, 0.8,
          Math.cos(a) * sp, Math.sin(a) * sp, (6 + Math.random() * 10) * power,
          0.40 + Math.random() * 0.25, 1.8 + Math.random() * 1.1,
          `rgb(${fx.dustRGB})`, false, 24
        );
      }
    }

    update(dt) {
      const ps = this.particles;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.t += dt;
        p.vz -= p.gravity * dt;
        p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
        if (p.z < 0.4) { p.z = 0.4; p.vz = Math.abs(p.vz) * 0.25; p.vx *= 0.6; p.vy *= 0.6; }
      }
      compactInPlace(ps, p => p.t < p.life);
      for (const r of this.ripples) r.t += dt;
      compactInPlace(this.ripples, r => r.t < r.life);
      for (const w of this.wakes) w.t += dt;
      compactInPlace(this.wakes, w => w.t < w.life);

      if (this.decalCount > 0) {
        let alive = 0;
        for (let i = 0; i < this.maxDecals; i++) {
          const d = this.decals[i];
          if (!d || !d.active) continue;
          d.t += dt;
          if (d.t >= d.life) {
            d.active = false;
            if (d.propOnExpire) {
              const po = d.propOnExpire;
              this.addGroundProp({
                x: d.x, y: d.y, yaw: d.yaw,
                kind: po.kind || 'slab',
                radius: po.radius ?? Math.max(d.rx, d.ry),
                life: po.life ?? Infinity,
                color: po.color || d.color,
                rimColor: po.rimColor || d.hiColor,
                seed: d.seed
              });
              d.propOnExpire = null;
            }
          } else {
            alive++;
          }
        }
        this.decalCount = alive;
      }

      if (this.propCount > 0) {
        let aliveP = 0;
        for (let i = 0; i < this.maxProps; i++) {
          const p = this.props[i];
          if (!p || !p.active) continue;
          if (Number.isFinite(p.life)) {
            p.t += dt;
            if (p.t >= p.life) { p.active = false; continue; }
          }
          aliveP++;
        }
        this.propCount = aliveP;
      }
    }
  }

  // ===========================================================================
  // 烘焙图集：几十张 512² 小图集页代替几千张小画布，总量封顶，按页做 LRU 淘汰
  // ===========================================================================
  class AtlasPage {
    constructor(size, id) {
      this.size = size;
      this.id = id;
      this.canvas = makeCanvas(size, size);
      this.ctx = this.canvas.getContext('2d');
      this.gen = 0;
      this.reset();
    }

    reset() {
      this.gen++;
      this.shelves = [];
      this.entries = [];
      this.nextY = 0;
      this.lastUse = -1;
      this.usedPx = 0;
      const ctx = this.ctx;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, this.size, this.size);
    }

    alloc(w, h) {
      const size = this.size;
      if (w > size || h > size) return null;
      let best = null;
      for (let i = 0; i < this.shelves.length; i++) {
        const s = this.shelves[i];
        if (s.h >= h && s.h <= h * 1.3 + 4 && s.x + w <= size && (!best || s.h < best.h)) best = s;
      }
      if (!best) {
        if (this.nextY + h > size) return null;
        best = { y: this.nextY, h, x: 0 };
        this.shelves.push(best);
        this.nextY += h;
      }
      const x = best.x;
      best.x += w;
      this.usedPx += w * h;
      return { x, y: best.y };
    }
  }

  // 图集总量封顶。满了就挑一页清掉：优先挑最久没用的；
  // 清之前把这一两帧还在用的贴图记下来，清完马上重烘回这一页（贴图对象原地更新，正在用它的部件不受影响），
  // 等于顺手把冷数据扔掉、热数据挤紧。
  class SpriteAtlas {
    constructor(pageSize = ATLAS_PAGE, budgetMB = ATLAS_BUDGET_MB) {
      this.pageSize = pageSize;
      this.budgetBytes = budgetMB * 1048576;
      this.pages = [];
      this.frame = 0;
      this.evictions = 0;
      this.rescued = 0;        // 淘汰时顺手重烘保住的热贴图数
      this.lost = 0;           // 实在保不住、少画一帧的贴图数（单帧用量都超预算时才会有）
      this.repaint = null;     // (entry, page) => bool，由渲染器提供
    }

    setBudgetMB(mb) {
      this.budgetBytes = Math.max(4, mb) * 1048576;
      while (this.bytes() > this.budgetBytes && this.pages.length > 1) {
        this._dropPage(this._pickVictim(0) || this.pages[0]);
      }
    }

    bytes() { let b = 0; for (const p of this.pages) b += p.size * p.size * 4; return b; }

    _hotCount(p) {
      let n = 0;
      const f = this.frame - 1;
      for (const e of p.entries) if (e.lastUse >= f) n++;
      return n;
    }

    // 挑要清的页：先找这两帧没用过的最久的页；都用过就挑热贴图最少的
    _pickVictim(sizeOnly) {
      let best = null;
      const f = this.frame - 1;
      for (const p of this.pages) {
        if (sizeOnly && p.size !== sizeOnly) continue;
        if (p.lastUse < f && (!best || p.lastUse < best.lastUse)) best = p;
      }
      if (best) return best;
      let bestHot = Infinity;
      for (const p of this.pages) {
        if (sizeOnly && p.size !== sizeOnly) continue;
        const h = this._hotCount(p);
        if (h < bestHot) { bestHot = h; best = p; }
      }
      return best;
    }

    _evictInPlace(p) {
      const f = this.frame - 1;
      const keep = p.entries.filter(e => e.lastUse >= f);
      keep.sort((a, b) => b.bh - a.bh);
      p.reset();
      this.evictions++;
      for (const e of keep) {
        if (this.repaint && this.repaint(e, p)) this.rescued++;
        else { e.gen = -1; this.lost++; }
      }
    }

    _dropPage(p) {
      const i = this.pages.indexOf(p);
      if (i < 0) return;
      for (const e of p.entries) if (e.lastUse >= this.frame - 1) { e.gen = -1; this.lost++; }
      p.reset();
      p.canvas.width = 1; p.canvas.height = 1;
      this.pages.splice(i, 1);
      this.evictions++;
    }

    alloc(w, h) {
      for (let i = this.pages.length - 1; i >= 0; i--) {
        const r = this.pages[i].alloc(w, h);
        if (r) { r.page = this.pages[i]; return r; }
      }
      const need = Math.max(w, h);
      const size = need > this.pageSize ? Math.pow(2, Math.ceil(Math.log2(need))) : this.pageSize;
      const pageBytes = size * size * 4;

      if (size === this.pageSize && this.bytes() + pageBytes > this.budgetBytes) {
        for (let tries = 0; tries < 4; tries++) {
          const victim = this._pickVictim(size);
          if (!victim) break;
          this._evictInPlace(victim);
          const r = victim.alloc(w, h);
          if (r) { r.page = victim; return r; }
        }
      }
      // 超大部件（以后的 Boss、建筑）用单独的大页，腾够预算再开
      while (this.pages.length && this.bytes() + pageBytes > this.budgetBytes) {
        const victim = this._pickVictim(0);
        if (!victim) break;
        this._dropPage(victim);
      }
      const p = new AtlasPage(size, this.pages.length);
      this.pages.push(p);
      const r = p.alloc(w, h);
      if (r) r.page = p;
      return r;
    }

    clear() {
      for (const p of this.pages) {
        for (const e of p.entries) e.gen = -1;
        p.reset();
        p.canvas.width = 1; p.canvas.height = 1;
      }
      this.pages.length = 0;
    }
  }

  // ===========================================================================
  // 核心像素堆叠渲染器
  //
  // cached（游戏缓存，默认）：
  //   1) 每个部件按「角度档位 × 浸水档」烘进图集，一次烘出三格：本体 / 描边环 / 自亮；
  //   2) 每只生物：先画所有部件的描边环，再按深度画部件本体，直接画到屏幕上。
  //      各部件外扩一圈的并集 = 整只外扩一圈，所以效果跟原来 actorBuf 整体描边完全一样，
  //      但不用每只怪一张离屏画布，部件位置也精确到设备像素（不再 0.4 格一跳）；
  //   3) 屏幕缩放只取「1 美术像素 = 整数个设备像素」，像素宽窄永远一致。
  // crisp / retro：旧版的逐层实时画法，留着对照，不为性能优化。
  // ===========================================================================
  class StackRenderer {
    constructor(canvas) {
      this.cv = canvas;
      this.dctx = canvas.getContext('2d');
      this.vfx = new VFXPool();

      this.mc = makeCanvas(1, 1);  this.mctx = this.mc.getContext('2d');
      this.oc = makeCanvas(1, 1);  this.octx = this.oc.getContext('2d');
      this.ec = makeCanvas(1, 1);  this.ectx = this.ec.getContext('2d');
      this.eb = makeCanvas(1, 1);  this.ebctx = this.eb.getContext('2d');
      this.gbuf = makeCanvas(200 * GROUND_SUPERSAMPLE, 200 * GROUND_SUPERSAMPLE);
      this.gbctx = this.gbuf.getContext('2d');

      this.atlas = new SpriteAtlas();
      this.atlas.repaint = (e, page) => this._repaint(e, page);
      this.assetCache = new WeakMap();
      this.scratch = [];
      this.scratchIdx = 0;
      this.frame = 0;

      this.tintEpoch = 0;
      this.tintKey = '';
      this.tintStyles = ['', '', '', ''];

      this.stats = {
        hits: 0, misses: 0, borrowed: 0,
        frameBakes: 0, frameBakeMs: 0, frameDraws: 0, frameParts: 0
      };
      // 兼容旧字段
      this.cacheHits = 0;
      this.cacheMisses = 0;

      this.MODES = ['cached', 'crisp', 'retro'];
      this.MODE_LABELS = { cached: '游戏缓存', crisp: '高清逐层（对照）', retro: '复古低分（对照）' };
      this.modeIdx = 0;

      this.DPR = 1;
      this.artPx = 4;            // 1 个美术像素 = artPx 个设备像素（整数）
      this.SCALE = this.artPx * BAKE_SCALE;
      this.CW = 1; this.CH = 1;
      this.EW = 1; this.EH = 1;
      this.zoom = 0;
      this.th = 0.56;
      this.useOutline = true;
      this.lastHabitatId = null;
      this.bakeBudgetMs = BAKE_BUDGET_MS;

      this._glowOn = false;
      this._ecDirty = false;
      this._g = [0, 0, 0, 0];
      this._sorted = [];
    }

    // ---------------------------------------------------------------- 画布尺寸
    // cssW / cssH：画布在页面上的 CSS 尺寸；不传就量画布自己的布局尺寸
    fit(habitatDef, cssW, cssH, dpr) {
      this._lastCssW = cssW; this._lastCssH = cssH; this._lastDpr = dpr;
      this.DPR = dpr || Math.min(2, window.devicePixelRatio || 1);
      const w = cssW || this.cv.clientWidth || window.innerWidth;
      const h = cssH || this.cv.clientHeight || window.innerHeight;
      this.cv.width = Math.max(1, Math.round(w * this.DPR));
      this.cv.height = Math.max(1, Math.round(h * this.DPR));

      // 缩放档位按「美术像素 = 整数个设备像素」取，像素宽窄永远一致
      const baseArt = Math.max(1, Math.round(Math.max(2, h / 148) * this.DPR / BAKE_SCALE));
      this.artPx = clamp(baseArt + this.zoom, 1, 16);
      this.SCALE = this.artPx * BAKE_SCALE;

      const mode = this.getRenderMode();
      if (mode === 'retro') {
        this.CW = Math.max(1, Math.ceil(this.cv.width / this.SCALE));
        this.CH = Math.max(1, Math.ceil(this.cv.height / this.SCALE));
      } else {
        this.CW = this.cv.width;
        this.CH = this.cv.height;
      }
      if (mode === 'cached') {
        this.mc.width = this.oc.width = 1;
        this.mc.height = this.oc.height = 1;
      } else {
        this.mc.width = this.oc.width = this.CW;
        this.mc.height = this.oc.height = this.CH;
      }
      this.EW = Math.max(1, Math.ceil(this.cv.width / 4));
      this.EH = Math.max(1, Math.ceil(this.cv.height / 4));
      this.ec.width = this.eb.width = this.EW;
      this.ec.height = this.eb.height = this.EH;
      this._ecDirty = false;
      if (habitatDef) this.renderSky(habitatDef);
    }

    // 天空：画在 1/8 分辨率的小图上，每帧平滑放大贴一次（渐变放大看不出差别；
    // 小图只有零点几 MB，不占图集那 32MB 的贴图预算，也比每帧整屏算径向渐变便宜）
    renderSky(habitatDef) {
      const { cv } = this;
      if (!this.skyC) { this.skyC = makeCanvas(1, 1); this.skyCtx = this.skyC.getContext('2d'); }
      const w = Math.max(2, Math.ceil(cv.width / 8)), h = Math.max(2, Math.ceil(cv.height / 8));
      this.skyC.width = w; this.skyC.height = h;
      const g = this.skyCtx;
      const sky = g.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, habitatDef.skyTop);
      sky.addColorStop(0.55, habitatDef.skyMid);
      sky.addColorStop(1, habitatDef.skyBot);
      g.fillStyle = sky;
      g.fillRect(0, 0, w, h);
      const halo = g.createRadialGradient(w * 0.5, h * 0.44, 2, w * 0.5, h * 0.44, h * 0.56);
      halo.addColorStop(0, habitatDef.skyHalo);
      halo.addColorStop(1, 'rgba(0, 0, 0, 0)');
      g.fillStyle = halo;
      g.fillRect(0, 0, w, h);
      this.lastHabitatId = habitatDef.id;
    }

    drawSky() {
      const { dctx, cv } = this;
      if (!this.skyC) { dctx.fillStyle = '#123'; dctx.fillRect(0, 0, cv.width, cv.height); return; }
      dctx.imageSmoothingEnabled = true;
      dctx.drawImage(this.skyC, 0, 0, cv.width, cv.height);
      dctx.imageSmoothingEnabled = false;
    }

    getRenderMode() { return this.MODES[this.modeIdx] || 'cached'; }
    getRenderModeLabel() { return this.MODE_LABELS[this.getRenderMode()] || '游戏缓存'; }
    setRenderMode(modeOrIdx, habitatDef) {
      if (typeof modeOrIdx === 'string') {
        const idx = this.MODES.indexOf(modeOrIdx);
        if (idx >= 0) this.modeIdx = idx;
      } else if (typeof modeOrIdx === 'number') {
        this.modeIdx = ((modeOrIdx % this.MODES.length) + this.MODES.length) % this.MODES.length;
      }
      this.fit(habitatDef, this._lastCssW, this._lastCssH, this._lastDpr);
      return this.getRenderMode();
    }

    // ---------------------------------------------------------------- 缓存管理
    // 换色时 recolorAsset 会把 asset.rev +1，旧缓存自动失效，这个函数留着兼容旧调用
    flushCacheByPrefix() {}

    clearCache() {
      this.atlas.clear();
      this.assetCache = new WeakMap();
    }

    cacheInfo() {
      return {
        pages: this.atlas.pages.length,
        mb: Math.round(this.atlas.bytes() / 1048576),
        budgetMB: Math.round(this.atlas.budgetBytes / 1048576),
        evictions: this.atlas.evictions,
        rescued: this.atlas.rescued,
        lost: this.atlas.lost
      };
    }

    // 这个生境的水色（浸水染色用），换生境时让染过色的缓存失效
    updateTint(hab) {
      const key = hab.isWater ? (hab.pal && hab.pal.mid) || '#1e80a6' : '';
      if (key === this.tintKey) return;
      this.tintKey = key;
      this.tintEpoch++;
      if (!key) return;
      const [r, g, b] = hexToRgba(key);
      for (let lv = 1; lv <= SUBMERGE_LEVELS; lv++) {
        this.tintStyles[lv] = `rgba(${r}, ${g}, ${b}, ${(lv / SUBMERGE_LEVELS) * SUBMERGE_MIX})`;
      }
    }

    slotCount(asset, symDeg) {
      const R = assetInfo(asset).R;
      const stepDeg = clamp((ANGLE_EDGE_PX / R) * (180 / Math.PI), ANGLE_MIN_DEG, ANGLE_MAX_DEG);
      return Math.max(4, Math.ceil(symDeg / stepDeg));
    }

    _scratch(w, h) {
      const i = this.scratchIdx++ % SCRATCH_POOL;
      let c = this.scratch[i];
      if (!c) c = this.scratch[i] = makeCanvas(w, h);
      if (c.width < w) c.width = w;
      if (c.height < h) c.height = h;
      return c;
    }

    _valid(e, asset, tint, outlineHex) {
      return e && e.page.gen === e.gen && e.rev === (asset.rev | 0)
        && (tint === 0 || e.tintEpoch === this.tintEpoch) && e.outline === outlineHex;
    }

    // 取一个部件在某个角度的烘焙贴图（没有就烘；本帧烘焙超预算时先借相邻角度）。
    // 左右对称的部件只烘 0~180°，另一半返回时 this._mirror = true，画的时候水平翻转。
    getSprite(asset, angle, symDeg, tint, outlineHex) {
      let map = this.assetCache.get(asset);
      if (!map) { map = new Map(); this.assetCache.set(asset, map); }
      const slots = this.slotCount(asset, symDeg);
      const step = symDeg / slots;
      let deg = (angle * 180 / Math.PI) % symDeg;
      if (deg < 0) deg += symDeg;
      let slot = Math.round(deg / step) % slots;
      this._mirror = false;
      if (symDeg === 360 && slot > (slots >> 1) && assetInfo(asset).sym) {
        slot = slots - slot;
        this._mirror = true;
      }
      const base = symDeg << 16;
      const key = base | (slot << 2) | tint;

      let e = map.get(key);
      if (this._valid(e, asset, tint, outlineHex)) {
        this.stats.hits++;
        e.lastUse = this.frame;
        e.page.lastUse = this.frame;
        return e;
      }

      if (this.stats.frameBakeMs > this.bakeBudgetMs) {
        for (let dSlot = 1; dSlot <= 8; dSlot++) {
          for (const sgn of [1, -1]) {
            const s2 = (slot + sgn * dSlot + slots) % slots;
            const e2 = map.get(base | (s2 << 2) | tint);
            if (this._valid(e2, asset, tint, outlineHex)) {
              this.stats.borrowed++;
              e2.lastUse = this.frame;
              e2.page.lastUse = this.frame;
              return e2;
            }
          }
        }
      }

      const t0 = performance.now();
      e = this.bake(asset, slot * step * Math.PI / 180, tint, outlineHex);
      this.stats.frameBakeMs += performance.now() - t0;
      this.stats.frameBakes++;
      this.stats.misses++;
      map.set(key, e);
      return e;
    }

    // 某个部件在某个角度下的烘焙尺寸和锚点（按真正有体素的范围算，不按体素盒外框，省掉大片空白）
    _layout(asset, qAng) {
      const c = Math.cos(qAng), s = Math.sin(qAng);
      const sc = BAKE_SCALE;
      const pad = 2;
      const info = assetInfo(asset);
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (let ci = 0; ci < 4; ci++) {
        const u = (ci & 1) ? info.u1 : info.u0;
        const v = (ci & 2) ? info.v1 : info.v0;
        const X = sc * (c * u - s * v);
        const Y = sc * TILT * (s * u + c * v);
        if (X < minX) minX = X; if (X > maxX) maxX = X;
        if (Y < minY) minY = Y; if (Y > maxY) maxY = Y;
      }
      const top = minY - info.zMax * BAKE_STEP;
      const bottom = maxY - info.zMin * BAKE_STEP + BAKE_HALF;
      const fx0 = Math.floor(minX), fy0 = Math.floor(top);
      return {
        bw: Math.ceil(maxX) - fx0 + pad * 2,
        bh: Math.ceil(bottom) - fy0 + pad * 2,
        ax: pad - fx0,
        ay: pad - fy0,
        cells: (asset.glowStrip && asset.glowLayers.length) ? 3 : 2
      };
    }

    bake(asset, qAng, tint, outlineHex) {
      const L = this._layout(asset, qAng);
      const r = this.atlas.alloc(L.cells * (L.bw + 1), L.bh + 1);
      const e = {
        asset, qAng, tint, outline: outlineHex,
        page: r.page, gen: r.page.gen, x: r.x, y: r.y, rx: 0, gx: -1,
        bw: L.bw, bh: L.bh, ax: L.ax, ay: L.ay, cells: L.cells,
        rev: asset.rev | 0, tintEpoch: this.tintEpoch, lastUse: this.frame
      };
      this._place(e, r);
      this._paint(e);
      return e;
    }

    // 图集淘汰一页时，把还在用的贴图重烘回这一页（对象原地更新）
    _repaint(e, page) {
      const r = page.alloc(e.cells * (e.bw + 1), e.bh + 1);
      if (!r) return false;
      r.page = page;
      this._place(e, r);
      this._paint(e);
      return true;
    }

    _place(e, r) {
      e.page = r.page;
      e.gen = r.page.gen;
      e.x = r.x; e.y = r.y;
      e.rx = r.x + e.bw + 1;
      e.gx = e.cells === 3 ? r.x + 2 * (e.bw + 1) : -1;
      r.page.lastUse = Math.max(r.page.lastUse, e.lastUse);
      r.page.entries.push(e);
    }

    // 往图集里画一格：本体 / 描边剪影 / 自亮
    _paint(e) {
      const asset = e.asset;
      const { w, d, activeLayers, glowLayers, glowSlot, glowStrip, strip } = asset;
      const c = Math.cos(e.qAng), s = Math.sin(e.qAng);
      const sc = BAKE_SCALE;
      const { bw, bh, ax: anchorX, ay: anchorY } = e;
      const pctx = e.page.ctx;
      const mx = e.x, my = e.y, ringX = e.rx, glowX = e.gx;
      const cs = c * sc, ss = s * sc, tss = TILT * ss, tcs = TILT * cs;
      const hw = -w * 0.5, hd = -d * 0.5;

      // 1. 本体切片画进临时画布
      const scr = this._scratch(bw, bh);
      const sx = scr.getContext('2d');
      sx.setTransform(1, 0, 0, 1, 0, 0);
      sx.globalCompositeOperation = 'source-over';
      sx.globalAlpha = 1;
      sx.imageSmoothingEnabled = false;
      sx.clearRect(0, 0, bw, bh);
      for (let li = 0; li < activeLayers.length; li++) {
        const z = activeLayers[li];
        const yy = anchorY - z * BAKE_STEP;
        const sxo = z * w;
        sx.setTransform(cs, tss, -ss, tcs, anchorX, yy + BAKE_HALF);
        sx.drawImage(strip, sxo, 0, w, d, hw, hd, w, d);
        sx.setTransform(cs, tss, -ss, tcs, anchorX, yy);
        sx.drawImage(strip, sxo, 0, w, d, hw, hd, w, d);
      }
      sx.setTransform(1, 0, 0, 1, 0, 0);
      if (e.tint > 0 && this.tintStyles[e.tint]) {
        // 只往已有像素上混水色，alpha 保持 255（守「切片 alpha 只能 0/255」）
        sx.globalCompositeOperation = 'source-atop';
        sx.fillStyle = this.tintStyles[e.tint];
        sx.fillRect(0, 0, bw, bh);
        sx.globalCompositeOperation = 'source-over';
      }

      // 2. 本体格
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.globalCompositeOperation = 'source-over';
      pctx.globalAlpha = 1;
      pctx.imageSmoothingEnabled = false;
      pctx.drawImage(scr, 0, 0, bw, bh, mx, my, bw, bh);

      // 3. 描边格：四向外扩 1 个烘焙像素的实心剪影，填描边色。
      //    画的时候先铺所有部件的剪影、再画本体，露在外面的一圈就是整只的外轮廓；
      //    半透明部件（果冻壳）底下也垫着描边色，跟旧版 actorBuf 的观感一致。
      pctx.save();
      pctx.beginPath();
      pctx.rect(ringX, my, bw, bh);
      pctx.clip();
      pctx.drawImage(scr, 0, 0, bw, bh, ringX - 1, my, bw, bh);
      pctx.drawImage(scr, 0, 0, bw, bh, ringX + 1, my, bw, bh);
      pctx.drawImage(scr, 0, 0, bw, bh, ringX, my - 1, bw, bh);
      pctx.drawImage(scr, 0, 0, bw, bh, ringX, my + 1, bw, bh);
      pctx.drawImage(scr, 0, 0, bw, bh, ringX, my, bw, bh);
      pctx.globalCompositeOperation = 'source-in';
      pctx.fillStyle = e.outline;
      pctx.fillRect(ringX, my, bw, bh);
      pctx.restore();

      // 4. 自亮格（被上层本体挡住的部分挖掉）
      if (glowX >= 0) {
        const minGlowZ = glowLayers[0];
        pctx.save();
        pctx.beginPath();
        pctx.rect(glowX, my, bw, bh);
        pctx.clip();
        for (let li = 0; li < activeLayers.length; li++) {
          const z = activeLayers[li];
          if (z < minGlowZ) continue;
          const yy = my + anchorY - z * BAKE_STEP;
          const ax = glowX + anchorX;
          if (z > minGlowZ) {
            pctx.globalCompositeOperation = 'destination-out';
            pctx.setTransform(cs, tss, -ss, tcs, ax, yy + BAKE_HALF);
            pctx.drawImage(strip, z * w, 0, w, d, hw, hd, w, d);
            pctx.setTransform(cs, tss, -ss, tcs, ax, yy);
            pctx.drawImage(strip, z * w, 0, w, d, hw, hd, w, d);
          }
          const gSlot = glowSlot[z];
          if (gSlot >= 0) {
            pctx.globalCompositeOperation = 'source-over';
            pctx.setTransform(cs, tss, -ss, tcs, ax, yy);
            pctx.drawImage(glowStrip, gSlot * w, 0, w, d, hw, hd, w, d);
          }
        }
        pctx.restore();
      }
      pctx.setTransform(1, 0, 0, 1, 0, 0);
      pctx.globalCompositeOperation = 'source-over';
    }

    // ---------------------------------------------------------------- 投影
    proj(x, y, z) {
      const c = Math.cos(this.th), s = Math.sin(this.th);
      const rx = c * x - s * y, ry = s * x + c * y;
      const sc = this.SCALE;
      return [this.cv.width / 2 + rx * sc, this.cv.height / 2 + 16 * sc + ry * TILT * sc - z * HS * sc, ry];
    }

    projBuf(x, y, z, isRetro) {
      const c = Math.cos(this.th), s = Math.sin(this.th);
      const rx = c * x - s * y, ry = s * x + c * y;
      const sc = isRetro ? 1 : this.SCALE;
      const step = isRetro ? HS : Math.max(1, Math.round(HS * sc));
      return [this.CW / 2 + rx * sc, this.CH / 2 + 16 * sc + ry * TILT * sc - z * step, ry];
    }

    // ---------------------------------------------------------------- 像素对齐画线
    _projectLinePoints(p, c, s, W2, H2, SC, grid) {
      const sag = p.sag || 0;
      const jit = p.jitter || 0;
      const jPhase = p.jitterPhase || 0;
      const segs = (sag === 0 && jit === 0) ? 1 : clamp(Math.round(p.segments || 10), 2, 24);
      const pts = new Array((segs + 1) * 2);
      for (let i = 0; i <= segs; i++) {
        const u = i / segs;
        const wx = lerp(p.x0, p.x1, u);
        const wy = lerp(p.y0, p.y1, u);
        const sagZ = sag ? (4 * u * (1 - u) * sag) : 0;
        const wz = lerp(p.z0, p.z1, u) - sagZ;
        const jitOff = jit ? (jit * Math.sin(u * Math.PI) * Math.sin(u * Math.PI * 3 + jPhase) * SC) : 0;
        const X = W2 + (c * wx - s * wy) * SC + jitOff;
        const Y = H2 + (s * wx + c * wy) * TILT * SC - wz * HS * SC;
        pts[i * 2] = Math.round(X / grid);
        pts[i * 2 + 1] = Math.round(Y / grid);
      }
      return pts;
    }

    _drawPixelLine(ctx, pts, grid, thick, color) {
      if (!pts || pts.length < 4) return;
      ctx.fillStyle = color;
      const halfOff = (thick - grid) >> 1;
      for (let i = 0; i < pts.length - 2; i += 2) {
        let x0 = pts[i], y0 = pts[i + 1];
        const x1 = pts[i + 2], y1 = pts[i + 3];
        if (!Number.isFinite(x0) || !Number.isFinite(y0) || !Number.isFinite(x1) || !Number.isFinite(y1)) continue;
        const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
        const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
        let err = dx + dy;
        let guard = 0;
        while (guard++ < 2048) {
          ctx.fillRect(x0 * grid - halfOff, y0 * grid - halfOff, thick, thick);
          if (x0 === x1 && y0 === y1) break;
          const e2 = err * 2;
          if (e2 >= dy) { err += dy; x0 += sx; }
          if (e2 <= dx) { err += dx; y0 += sy; }
        }
      }
    }

    // ---------------------------------------------------------------- cached：准备
    // 先把所有生物的贴图都解析好（要烘的在这一步烘完），再统一画；
    // 这样画的时候图集不会再被改，浏览器不用为「改了正在用的图」额外复制。
    prepareActor(actor, hab, c, s) {
      const partList = actor.buildPartList(hab);
      const sizeScale = actor.scaleMul ?? 1.0;
      const rootX = actor.state.x, rootY = actor.state.y;
      for (let i = 0; i < partList.length; i++) {
        const p = partList[i];
        if (p.kind === 'line') {
          const mx = (p.x0 + p.x1) * 0.5;
          const my = (p.y0 + p.y1) * 0.5;
          const mz = (p.z0 + p.z1) * 0.5;
          const dxW = (mx - rootX) / sizeScale;
          const dyW = (my - rootY) / sizeScale;
          p._depth = s * dxW + c * dyW + (mz / sizeScale) * 0.08 + (p.bias || 0);
        } else {
          const dxW = (p.x - rootX) / sizeScale;
          const dyW = (p.y - rootY) / sizeScale;
          p._depth = s * dxW + c * dyW + (p.lift / sizeScale) * 0.08 + (p.bias || 0);
        }
      }
      partList.sort((a, b) => a._depth - b._depth);

      const outlineHex = (actor.curSkin && actor.curSkin.outline) || '#0c121a';
      const k = this.artPx;
      const grid = Math.max(1, k);
      const SC = this.SCALE;
      const W2 = this.cv.width / 2, H2 = this.cv.height / 2 + 16 * SC;
      const isWater = !!hab.isWater;
      const th = this.th;

      for (let i = 0; i < partList.length; i++) {
        const p = partList[i];
        if (p.kind === 'line') {
          const widthArt = Math.max(1, Math.round(p.widthArtPx ?? p.widthPx ?? 1));
          p._pts = this._projectLinePoints(p, c, s, W2, H2, SC, grid);
          p._grid = grid;
          p._thick = widthArt * grid;
          p._op = p.opacity ?? 1;
          p._color = p.color || '#d8d0c0';
          p._outlineCol = p.outlineColor || '';
          continue;
        }
        const sub = p.submerge > 0 ? p.submerge : 0;
        let tint = 0;
        let op = p.opacity ?? 1;
        if (sub > 0) {
          if (isWater) tint = Math.min(SUBMERGE_LEVELS, Math.round(sub * SUBMERGE_LEVELS));
          else op *= 1 - sub * 0.44; // 旧写法：非水域里用 submerge 表示半透明，照旧
        }
        const e = this.getSprite(p.asset, p.ro + th, p.symDeg || 360, tint, outlineHex);
        const mir = this._mirror;
        const X = W2 + (c * p.x - s * p.y) * SC;
        const Y = H2 + (s * p.x + c * p.y) * TILT * SC - p.lift * HS * SC;
        const kx = k * sizeScale * (p.scaleX || 1);
        const ky = k * sizeScale * (p.scaleY || 1);
        p._e = e;
        p._op = op;
        p._m = mir;
        p._dx = Math.round(X - (mir ? e.bw - e.ax : e.ax) * kx);
        p._dy = Math.round(Y - e.ay * ky);
        p._dw = Math.round(e.bw * kx);
        p._dh = Math.round(e.bh * ky);
      }
      this.stats.frameParts += partList.length;
      return partList;
    }

    _glowUnion(x, y, w, h) {
      const g = this._g;
      if (!this._glowOn) {
        g[0] = x; g[1] = y; g[2] = x + w; g[3] = y + h;
        this._glowOn = true;
        return;
      }
      if (x < g[0]) g[0] = x;
      if (y < g[1]) g[1] = y;
      if (x + w > g[2]) g[2] = x + w;
      if (y + h > g[3]) g[3] = y + h;
    }

    drawPreparedActor(parts) {
      const d = this.dctx, ec = this.ectx;
      const eS = this.EW / this.cv.width;
      let calls = 0;

      d.setTransform(1, 0, 0, 1, 0, 0);
      d.globalCompositeOperation = 'source-over';
      d.imageSmoothingEnabled = false;

      // 第 1 遍：需要描边的部件外扩轮廓（单部件设 noOutline: true 时跳过）
      // 半透明部件的轮廓按旧版「四向叠 4 次」的累积不透明度画：1 - (1 - a)^4
      let alpha = 1, flipped = false;
      d.globalAlpha = 1;
      if (this.useOutline) {
        for (let i = 0; i < parts.length; i++) {
          const p = parts[i];
          if (p.noOutline) continue;
          if (p.kind === 'line') {
            if (!p._outlineCol) continue;
            if (flipped) { d.setTransform(1, 0, 0, 1, 0, 0); flipped = false; }
            if (p._op !== alpha) { alpha = p._op; d.globalAlpha = alpha; }
            this._drawPixelLine(d, p._pts, p._grid, p._thick + p._grid * 2, p._outlineCol);
            calls++;
            continue;
          }
          const e = p._e;
          if (!e || e.gen !== e.page.gen) continue; // 这一帧里所在页被挤掉了，跳过一帧
          const op = p._op >= 1 ? 1 : 1 - Math.pow(1 - p._op, 4);
          if (op !== alpha) { alpha = op; d.globalAlpha = alpha; }
          if (p._m) {
            d.setTransform(-1, 0, 0, 1, 2 * p._dx + p._dw, 0); flipped = true;
          } else if (flipped) {
            d.setTransform(1, 0, 0, 1, 0, 0); flipped = false;
          }
          d.drawImage(e.page.canvas, e.rx, e.y, e.bw, e.bh, p._dx, p._dy, p._dw, p._dh);
          calls++;
        }
      }

      // 第 2 遍：按深度画本体与像素画线；自亮层同步遮挡
      const g = this._g;
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i];
        if (p.kind === 'line') {
          if (flipped) { d.setTransform(1, 0, 0, 1, 0, 0); flipped = false; }
          if (p._op !== alpha) { alpha = p._op; d.globalAlpha = alpha; }
          this._drawPixelLine(d, p._pts, p._grid, p._thick, p._color);
          calls++;
          continue;
        }
        const e = p._e;
        if (!e || e.gen !== e.page.gen) continue;
        if (p._op !== alpha) { alpha = p._op; d.globalAlpha = alpha; }
        if (p._m) {
          d.setTransform(-1, 0, 0, 1, 2 * p._dx + p._dw, 0); flipped = true;
        } else if (flipped) {
          d.setTransform(1, 0, 0, 1, 0, 0); flipped = false;
        }
        d.drawImage(e.page.canvas, e.x, e.y, e.bw, e.bh, p._dx, p._dy, p._dw, p._dh);
        calls++;

        const ex = p._dx * eS, ey = p._dy * eS, ew = p._dw * eS, eh = p._dh * eS;
        const occlude = this._glowOn && ex < g[2] && ex + ew > g[0] && ey < g[3] && ey + eh > g[1];
        if (occlude || e.gx >= 0) {
          ec.setTransform(p._m ? -1 : 1, 0, 0, 1, p._m ? 2 * ex + ew : 0, 0);
          if (occlude) {
            ec.globalCompositeOperation = 'destination-out';
            ec.globalAlpha = 1;
            ec.drawImage(e.page.canvas, e.x, e.y, e.bw, e.bh, ex, ey, ew, eh);
            calls++;
          }
          if (e.gx >= 0) {
            ec.globalCompositeOperation = 'source-over';
            ec.globalAlpha = p._op;
            ec.drawImage(e.page.canvas, e.gx, e.y, e.bw, e.bh, ex, ey, ew, eh);
            this._glowUnion(ex, ey, ew, eh);
            calls++;
          }
        }
      }
      d.setTransform(1, 0, 0, 1, 0, 0);
      d.globalAlpha = 1;
      ec.setTransform(1, 0, 0, 1, 0, 0);
      ec.globalAlpha = 1;
      ec.globalCompositeOperation = 'source-over';
      return calls;
    }

    // ---------------------------------------------------------------- crisp / retro（对照用）
    drawPartRealtime(p, sizeScale, isRetro) {
      const { mctx, ectx, CW, CH, EW, EH, SCALE, th } = this;
      const sc = (isRetro ? 1 : SCALE) * sizeScale;
      const [X, Y] = this.projBuf(p.x, p.y, p.lift, isRetro);
      const a = p.ro + th, c = Math.cos(a), s = Math.sin(a);
      const X0 = Math.round(X), Y0 = Math.round(Y);
      const step = isRetro ? (HS * sizeScale) : Math.max(1, Math.round(HS * sc));
      const halfStep = (!isRetro && step > Math.floor(TILT * sc)) ? Math.max(1, Math.round(step * 0.5)) : 0;
      const { w, d, activeLayers, glowLayers, glowSlot, glowStrip, strip } = p.asset;
      const hasGlow = !!glowStrip && glowLayers.length > 0;
      const minGlowZ = hasGlow ? glowLayers[0] : 9999;
      const eScaleX = EW / CW, eScaleY = EH / CH;
      const alpha = (p.opacity ?? 1) * (p.submerge > 0 ? (1 - p.submerge * 0.44) : 1);
      const hw = -w * 0.5, hd = -d * 0.5;
      let calls = 0;

      mctx.globalAlpha = alpha;
      for (let li = 0; li < activeLayers.length; li++) {
        const z = activeLayers[li];
        const yy = Y0 - z * step;
        const sx = z * w;
        if (halfStep) {
          mctx.setTransform(c * sc, TILT * s * sc, -s * sc, TILT * c * sc, X0, yy + halfStep);
          mctx.drawImage(strip, sx, 0, w, d, hw, hd, w, d);
          calls++;
        }
        mctx.setTransform(c * sc, TILT * s * sc, -s * sc, TILT * c * sc, X0, yy);
        mctx.drawImage(strip, sx, 0, w, d, hw, hd, w, d);
        calls++;
        if (!hasGlow || z >= minGlowZ) {
          ectx.globalCompositeOperation = 'destination-out';
          ectx.globalAlpha = 1;
          ectx.setTransform(c * sc * eScaleX, TILT * s * sc * eScaleY, -s * sc * eScaleX, TILT * c * sc * eScaleY, X0 * eScaleX, yy * eScaleY);
          ectx.drawImage(strip, sx, 0, w, d, hw, hd, w, d);
        }
        if (hasGlow && glowSlot[z] >= 0) {
          ectx.globalCompositeOperation = 'source-over';
          ectx.globalAlpha = alpha;
          ectx.drawImage(glowStrip, glowSlot[z] * w, 0, w, d, hw, hd, w, d);
          calls++;
        }
      }
      mctx.globalAlpha = 1;
      ectx.globalAlpha = 1;
      ectx.globalCompositeOperation = 'source-over';
      ectx.setTransform(1, 0, 0, 1, 0, 0);
      return calls;
    }

    drawActorRealtime(actor, hab, c, s, isRetro) {
      const { dctx, mctx, octx, mc, oc, CW, CH, SCALE } = this;
      const partList = actor.buildPartList(hab);
      const outlineHex = (actor.curSkin && actor.curSkin.outline) || '#0c121a';
      const sizeScale = actor.scaleMul ?? 1.0;
      let calls = 0;
      mctx.setTransform(1, 0, 0, 1, 0, 0);
      mctx.globalCompositeOperation = 'source-over';
      mctx.imageSmoothingEnabled = false;
      mctx.clearRect(0, 0, CW, CH);

      const rootX = actor.state.x, rootY = actor.state.y;
      let hasSpecial = false;
      for (let i = 0; i < partList.length; i++) {
        const p = partList[i];
        if (p.noOutline || p.kind === 'line') hasSpecial = true;
        if (p.kind === 'line') {
          const mx = (p.x0 + p.x1) * 0.5, my = (p.y0 + p.y1) * 0.5, mz = (p.z0 + p.z1) * 0.5;
          p._depth = s * ((mx - rootX) / sizeScale) + c * ((my - rootY) / sizeScale) + (mz / sizeScale) * 0.08 + (p.bias || 0);
        } else {
          const dxW = (p.x - rootX) / sizeScale;
          const dyW = (p.y - rootY) / sizeScale;
          p._depth = s * dxW + c * dyW + (p.lift / sizeScale) * 0.08 + (p.bias || 0);
        }
      }
      partList.sort((a, b) => a._depth - b._depth);

      const drawW = isRetro ? CW * SCALE : CW;
      const drawH = isRetro ? CH * SCALE : CH;
      const scBuf = isRetro ? 1 : SCALE;
      const gridBuf = isRetro ? 1 : Math.max(1, this.artPx);
      const W2B = CW / 2, H2B = CH / 2 + 16 * scBuf;
      const drawLineInBuf = (p, targetCtx, col, extraPx) => {
        const pts = this._projectLinePoints(p, c, s, W2B, H2B, scBuf, gridBuf);
        const wArt = Math.max(1, Math.round(p.widthArtPx ?? p.widthPx ?? 1));
        targetCtx.setTransform(1, 0, 0, 1, 0, 0);
        targetCtx.globalAlpha = p.opacity ?? 1;
        this._drawPixelLine(targetCtx, pts, gridBuf, wArt * gridBuf + extraPx, col);
        targetCtx.globalAlpha = 1;
      };

      if (!hasSpecial) {
        for (let i = 0; i < partList.length; i++) calls += this.drawPartRealtime(partList[i], sizeScale, isRetro);
        dctx.setTransform(1, 0, 0, 1, 0, 0);
        dctx.imageSmoothingEnabled = false;
        if (this.useOutline) {
          octx.setTransform(1, 0, 0, 1, 0, 0);
          octx.globalCompositeOperation = 'source-over';
          octx.clearRect(0, 0, CW, CH);
          octx.drawImage(mc, 0, 0);
          octx.globalCompositeOperation = 'source-in';
          octx.fillStyle = outlineHex;
          octx.fillRect(0, 0, CW, CH);
          octx.globalCompositeOperation = 'source-over';
          const op = isRetro ? SCALE : Math.max(1, Math.round(SCALE * 0.30));
          dctx.drawImage(oc, -op, 0, drawW, drawH);
          dctx.drawImage(oc,  op, 0, drawW, drawH);
          dctx.drawImage(oc, 0, -op, drawW, drawH);
          dctx.drawImage(oc, 0,  op, drawW, drawH);
          calls += 4;
        }
        dctx.drawImage(mc, 0, 0, drawW, drawH);
        return calls + 1;
      }

      // 含 noOutline 部件或像素画线：先为需描边件生成轮廓，再按严密深度画全部本体与线条
      dctx.setTransform(1, 0, 0, 1, 0, 0);
      dctx.imageSmoothingEnabled = false;
      if (this.useOutline) {
        for (let i = 0; i < partList.length; i++) {
          const p = partList[i];
          if (p.noOutline) continue;
          if (p.kind === 'line') {
            if (p.outlineColor) drawLineInBuf(p, mctx, p.outlineColor, gridBuf * 2);
          } else {
            calls += this.drawPartRealtime(p, sizeScale, isRetro);
          }
        }
        octx.setTransform(1, 0, 0, 1, 0, 0);
        octx.globalCompositeOperation = 'source-over';
        octx.clearRect(0, 0, CW, CH);
        octx.drawImage(mc, 0, 0);
        octx.globalCompositeOperation = 'source-in';
        octx.fillStyle = outlineHex;
        octx.fillRect(0, 0, CW, CH);
        octx.globalCompositeOperation = 'source-over';
        const op = isRetro ? SCALE : Math.max(1, Math.round(SCALE * 0.30));
        dctx.drawImage(oc, -op, 0, drawW, drawH);
        dctx.drawImage(oc,  op, 0, drawW, drawH);
        dctx.drawImage(oc, 0, -op, drawW, drawH);
        dctx.drawImage(oc, 0,  op, drawW, drawH);
        calls += 4;
        mctx.setTransform(1, 0, 0, 1, 0, 0);
        mctx.clearRect(0, 0, CW, CH);
      }

      for (let i = 0; i < partList.length; i++) {
        const p = partList[i];
        if (p.kind === 'line') {
          drawLineInBuf(p, mctx, p.color || '#d8d0c0', 0);
          calls++;
        } else {
          calls += this.drawPartRealtime(p, sizeScale, isRetro);
        }
      }
      dctx.drawImage(mc, 0, 0, drawW, drawH);
      return calls + 1;
    }

    // ---------------------------------------------------------------- 地表
    drawGround(platform, actors, animTime, c, s) {
      const { dctx, gbctx, gbuf, cv, SCALE } = this;
      const hab = platform.def;
      const fx = hab.fx;
      const bSize = platform.size;
      const halfB = bSize * 0.5;
      gbctx.setTransform(GROUND_SUPERSAMPLE, 0, 0, GROUND_SUPERSAMPLE, 0, 0);
      gbctx.globalCompositeOperation = 'source-over';
      gbctx.imageSmoothingEnabled = false;
      gbctx.clearRect(0, 0, bSize, bSize);
      gbctx.drawImage(platform.base, 0, 0);

      gbctx.save();
      gbctx.translate(halfB, halfB);
      gbctx.beginPath();
      gbctx.arc(0, 0, platform.rInner, 0, TAU);
      gbctx.clip();

      if (hab.isWater) {
        gbctx.strokeStyle = `rgba(${fx.foamRGB}, 0.16)`;
        gbctx.lineWidth = 1.0;
        for (let w = 0; w < 9; w++) {
          const angW = w * 0.72 + animTime * 0.14;
          const radW = 22 + (w % 3) * 19;
          gbctx.beginPath();
          gbctx.arc(Math.cos(angW) * radW, Math.sin(angW) * radW, 8 + Math.sin(animTime * 1.6 + w) * 2.0, -0.5, 0.7);
          gbctx.stroke();
        }
      }

      for (const wk of this.vfx.wakes) {
        const u = clamp(wk.t / wk.life, 0, 1);
        const fade = (1 - u) * (1 - u);
        const spread = wk.width * (0.65 + u * 2.5);
        const back = 4.5 + u * 14.0;
        const [lx, ly] = localToWorldXY(wk.x, wk.y, wk.yaw, -spread, -back);
        const [rx, ry] = localToWorldXY(wk.x, wk.y, wk.yaw,  spread, -back);
        const [cx, cy] = localToWorldXY(wk.x, wk.y, wk.yaw, 0, 2.0);
        gbctx.strokeStyle = `rgba(${fx.ringRGB}, ${fade * 0.62})`;
        gbctx.lineWidth = Math.max(1.1, (1 - u) * 3.0);
        gbctx.beginPath(); gbctx.moveTo(lx, ly); gbctx.lineTo(cx, cy); gbctx.lineTo(rx, ry); gbctx.stroke();
        gbctx.strokeStyle = `rgba(${fx.foamRGB}, ${fade * 0.85})`;
        gbctx.lineWidth = Math.max(0.7, (1 - u) * 1.6);
        gbctx.beginPath(); gbctx.moveTo(lx, ly); gbctx.lineTo(cx, cy); gbctx.lineTo(rx, ry); gbctx.stroke();
      }

      for (const rp of this.vfx.ripples) {
        const u = clamp(rp.t / rp.life, 0, 1);
        const rr = lerp(rp.r0, rp.r1, smoothstep(0, 1, u));
        gbctx.strokeStyle = `rgba(${fx.ringRGB}, ${(1 - u) * 0.84})`;
        gbctx.lineWidth = rp.width;
        gbctx.beginPath(); gbctx.arc(rp.x, rp.y, rr, 0, TAU); gbctx.stroke();
      }

      // 地表痕迹层（沙垄/土隆 mound、水沟/湿痕 wet、焦痕/裂纹 crack）与留成摆件（slab/mushroom/sprout）
      this._drawGroundTraces(gbctx, hab);

      for (const actor of actors) {
        const shScale = actor.state.shadowScale ?? 1;
        if (shScale > 0.01) {
          const sh = EnvFeedback.calcGroundShadow(actor.state.z, (actor.def.footRadius || 10) * (actor.scaleMul || 1));
          const shA = sh.alpha * shScale;
          gbctx.fillStyle = hab.isWater ? `rgba(6, 24, 38, ${shA * 0.95})` : `rgba(10, 14, 22, ${shA})`;
          gbctx.beginPath();
          gbctx.ellipse(actor.state.x + sh.offsetX, actor.state.y + sh.offsetY, sh.radius, sh.radius * 0.85, actor.state.yaw, 0, TAU);
          gbctx.fill();
        }

        if (actor.footContacts) {
          for (const fc of actor.footContacts) {
            const fl = clamp(1 - fc.z / 12, 0.25, 1);
            gbctx.fillStyle = `rgba(8, 12, 20, ${0.46 * fl})`;
            gbctx.beginPath();
            gbctx.arc(fc.x, fc.y, (fc.r || 3.2) * (0.7 + 0.3 * fl), 0, TAU);
            gbctx.fill();
          }
        }

        if (hab.isWater && actor.state.z < 6.0 && actor.def.useWaterFoam) {
          const rFoam = (actor.def.footRadius || 9) * (actor.scaleMul || 1);
          gbctx.strokeStyle = `rgba(${fx.foamRGB}, 0.62)`;
          gbctx.lineWidth = 1.4;
          gbctx.beginPath();
          gbctx.ellipse(actor.state.x, actor.state.y, rFoam + Math.sin(animTime * 4) * 0.9, rFoam * 0.86, actor.state.yaw, 0, TAU);
          gbctx.stroke();
        }
      }
      gbctx.restore();

      dctx.setTransform(1, 0, 0, 1, 0, 0);
      dctx.globalCompositeOperation = 'source-over';
      dctx.globalAlpha = 1;
      dctx.imageSmoothingEnabled = false;
      this.drawSky();
      dctx.setTransform(c * SCALE, TILT * s * SCALE, -s * SCALE, TILT * c * SCALE,
        cv.width / 2, cv.height / 2 + 16 * SCALE);
      dctx.drawImage(gbuf, -halfB, -halfB, bSize, bSize);
      dctx.setTransform(1, 0, 0, 1, 0, 0);
      return 2;
    }

    // 绘制地表痕迹层与留成摆件（直接绘进 gbuf，随地台自动旋转与圆台裁切，零额外贴图预算）
    _drawGroundTraces(gbctx, hab) {
      const vfx = this.vfx;
      if (vfx.decalCount === 0 && vfx.propCount === 0) return;

      const pal = hab.pal || {};
      const fx = hab.fx || {};
      const palDeep = pal.deep || '#7a5832';
      const palMid  = pal.mid  || '#b8864b';
      const palHi   = pal.hi   || '#e2b676';
      const palRim  = pal.rimA || '#4a3520';
      const foamRGB = fx.foamRGB || '235, 224, 196';

      // 1. 贴地痕迹（从最旧到最新绘制，保证新拱起的沙垄盖在旧痕之上）
      if (vfx.decalCount > 0) {
        const cap = vfx.maxDecals;
        const start = vfx.decalHead;
        for (let k = 0; k < cap; k++) {
          const d = vfx.decals[(start + k) % cap];
          if (!d || !d.active) continue;
          const u = clamp(d.t / d.life, 0, 1);
          const fadeIn = smoothstep(0, 0.08, u);
          const fadeOut = 1 - smoothstep(0.62, 1.0, u);
          const a = d.alpha * fadeIn * fadeOut;
          if (a <= 0.02) continue;

          gbctx.save();
          gbctx.translate(d.x, d.y);
          gbctx.rotate(d.yaw);

          if (d.kind === 'mound') {
            // 沙垄 / 土隆：柔和暗缘 + 沿行进方向拉长的隆起主脊 + 亮脊线 + 侧缘翻土碎粒
            const rx = d.rx * 0.90, ry = d.ry * 1.15;
            gbctx.globalAlpha = a * 0.34;
            gbctx.fillStyle = d.darkColor || palRim;
            gbctx.beginPath();
            gbctx.ellipse(-0.5, 0.6, rx * 1.10, ry * 1.04, 0, 0, TAU);
            gbctx.fill();

            gbctx.globalAlpha = a * 0.78;
            gbctx.fillStyle = d.color || palDeep;
            gbctx.beginPath();
            gbctx.ellipse(0, 0, rx * 0.96, ry * 0.96, 0, 0, TAU);
            gbctx.fill();

            gbctx.globalAlpha = a * 0.88;
            gbctx.fillStyle = d.hiColor || palHi;
            gbctx.beginPath();
            gbctx.ellipse(0.30, -0.25, rx * 0.54, ry * 0.68, 0, 0, TAU);
            gbctx.fill();

            // 两侧细碎翻沙点（由 seed 固定，不闪烁）
            gbctx.globalAlpha = a * 0.55;
            gbctx.fillStyle = d.darkColor || palDeep;
            const s1 = ((d.seed * 37) % 100) / 100 - 0.5;
            const s2 = ((d.seed * 61) % 100) / 100 - 0.5;
            gbctx.fillRect(Math.round(rx * 0.82 + s1 * 1.1), Math.round(s2 * ry), 1.4, 1.4);
            gbctx.fillRect(Math.round(-rx * 0.92 + s2 * 1.1), Math.round(-s1 * ry), 1.4, 1.4);
          } else if (d.kind === 'wet') {
            // 水沟 / 湿痕：深色湿槽 + 居中水膜反色条
            const rx = d.rx, ry = d.ry;
            gbctx.globalAlpha = a * 0.52;
            gbctx.fillStyle = d.darkColor || palDeep;
            gbctx.beginPath();
            gbctx.ellipse(0, 0, rx * 1.12, ry * 1.08, 0, 0, TAU);
            gbctx.fill();

            gbctx.globalAlpha = a * 0.68;
            gbctx.fillStyle = d.color || palRim;
            gbctx.beginPath();
            gbctx.ellipse(0, 0, rx * 0.74, ry * 0.84, 0, 0, TAU);
            gbctx.fill();

            gbctx.globalAlpha = a * 0.34;
            gbctx.fillStyle = d.hiColor || `rgb(${foamRGB})`;
            gbctx.beginPath();
            gbctx.ellipse(rx * 0.12, -ry * 0.08, rx * 0.30, ry * 0.52, 0, 0, TAU);
            gbctx.fill();
          } else if (d.kind === 'crack') {
            // 焦痕 / 裂纹：焦枯底斑 + 放射折线裂隙
            const r = Math.max(d.rx, d.ry);
            gbctx.globalAlpha = a * 0.45;
            gbctx.fillStyle = d.color || palRim;
            gbctx.beginPath();
            gbctx.ellipse(0, 0, d.rx, d.ry, 0, 0, TAU);
            gbctx.fill();

            gbctx.globalAlpha = a * 0.88;
            gbctx.strokeStyle = d.darkColor || '#1e1612';
            gbctx.lineWidth = 1.05;
            const rays = 4;
            for (let ri = 0; ri < rays; ri++) {
              const ang = (ri / rays) * TAU + ((d.seed + ri * 19) % 17) * 0.07;
              const midR = r * (0.45 + ((d.seed + ri * 7) % 5) * 0.06);
              const endR = r * (0.95 + ((d.seed + ri * 11) % 5) * 0.07);
              const bend = (((d.seed + ri * 13) % 2) ? 1 : -1) * 0.24;
              gbctx.beginPath();
              gbctx.moveTo(0, 0);
              gbctx.lineTo(Math.cos(ang + bend) * midR, Math.sin(ang + bend) * midR);
              gbctx.lineTo(Math.cos(ang) * endR, Math.sin(ang) * endR);
              gbctx.stroke();
            }
          } else {
            // 兜底通用贴地印
            gbctx.globalAlpha = a * 0.65;
            gbctx.fillStyle = d.color || palMid;
            gbctx.beginPath();
            gbctx.ellipse(0, 0, d.rx, d.ry, 0, 0, TAU);
            gbctx.fill();
          }

          gbctx.restore();
        }
      }

      // 2. 留成摆件（石板 / 小蘑菇 / 嫩芽等）
      if (vfx.propCount > 0) {
        const capP = vfx.maxProps;
        const startP = vfx.propHead;
        for (let k = 0; k < capP; k++) {
          const p = vfx.props[(startP + k) % capP];
          if (!p || !p.active) continue;
          const fadeOut = Number.isFinite(p.life) ? (1 - smoothstep(0.75, 1.0, p.t / p.life)) : 1;
          if (fadeOut <= 0.02) continue;

          gbctx.save();
          gbctx.translate(p.x, p.y);
          gbctx.rotate(p.yaw);
          gbctx.globalAlpha = fadeOut;

          if (p.kind === 'slab') {
            // 冷石板（供 火1 复用）
            const r = p.radius;
            gbctx.fillStyle = p.rimColor || '#1e191a';
            gbctx.fillRect(-r, -r * 0.85, r * 2, r * 1.7);
            gbctx.fillStyle = p.color || '#4a3d3c';
            gbctx.fillRect(-r + 1, -r * 0.85 + 1, r * 2 - 2, r * 1.7 - 2);
          } else if (p.kind === 'mushroom') {
            // 菌圈小蘑菇（供 洞5 复用）
            const r = Math.max(1.8, p.radius * 0.45);
            gbctx.fillStyle = p.rimColor || '#d8ccb2';
            gbctx.beginPath(); gbctx.arc(0, 0, r, 0, TAU); gbctx.fill();
            gbctx.fillStyle = p.color || '#a87d56';
            gbctx.beginPath(); gbctx.arc(-0.3, -0.3, r * 0.72, 0, TAU); gbctx.fill();
          } else if (p.kind === 'sprout') {
            // 嫩芽（供 树3 复用）
            gbctx.fillStyle = p.color || '#66b852';
            gbctx.beginPath(); gbctx.ellipse(-1.4, -0.5, 1.8, 0.9, -0.45, 0, TAU); gbctx.fill();
            gbctx.beginPath(); gbctx.ellipse( 1.4, -0.5, 1.8, 0.9,  0.45, 0, TAU); gbctx.fill();
          } else {
            gbctx.fillStyle = p.color || palMid;
            gbctx.beginPath(); gbctx.arc(0, 0, p.radius * 0.6, 0, TAU); gbctx.fill();
          }

          gbctx.restore();
        }
      }
      gbctx.globalAlpha = 1;
    }

    drawWaterFront(actor, hab) {
      const { dctx, SCALE } = this;
      const fx = hab.fx;
      if (!(hab.isWater && actor.state.z < 5.5 && actor.def.useWaterFoam)) return;
      const wet = clamp((5.5 - actor.state.z) / 5.5, 0.35, 1.0);
      const [wxP, wyP] = this.proj(actor.state.x, actor.state.y, 0.8);
      const wrX = (actor.def.footRadius || 9.5) * (actor.scaleMul || 1) * SCALE;
      const wrY = wrX * TILT;
      dctx.save();
      dctx.fillStyle = fx.waterTint;
      dctx.beginPath();
      dctx.ellipse(wxP, wyP, wrX * 0.94, wrY * 0.88, 0, 0, Math.PI);
      dctx.fill();
      dctx.strokeStyle = `rgba(${fx.foamRGB}, ${0.80 * wet})`;
      dctx.lineWidth = Math.max(1.5, SCALE * 0.34);
      dctx.beginPath();
      dctx.ellipse(wxP, wyP, wrX, wrY, 0, 0.1, Math.PI - 0.1);
      dctx.stroke();
      dctx.restore();
    }

    // ---------------------------------------------------------------- 一帧
    renderScene(platform, actors, animTime) {
      const { dctx, ectx, ebctx, cv, EW, EH, SCALE } = this;
      const hab = platform.def;
      const st = this.stats;
      this.frame++;
      this.atlas.frame = this.frame;
      this.scratchIdx = 0;
      st.frameBakes = 0; st.frameBakeMs = 0; st.frameDraws = 0; st.frameParts = 0;

      if (this.lastHabitatId !== hab.id) this.renderSky(hab);
      this.updateTint(hab);
      const c = Math.cos(this.th), s = Math.sin(this.th);
      const mode = this.getRenderMode();

      // 自亮缓冲：上一帧画过才需要清
      ectx.setTransform(1, 0, 0, 1, 0, 0);
      ectx.globalCompositeOperation = 'source-over';
      ectx.globalAlpha = 1;
      ectx.imageSmoothingEnabled = false;
      if (this._ecDirty || mode !== 'cached') ectx.clearRect(0, 0, EW, EH);
      this._glowOn = false;

      // 远 → 近（支持寄生/搭载个体用 actor.state.sortBias 稳压在宿主前方）
      const sorted = this._sorted;
      sorted.length = 0;
      for (let i = 0; i < actors.length; i++) {
        const a = actors[i];
        sorted.push({ actor: a, ry: s * a.state.x + c * a.state.y + (a.state.sortBias || 0), parts: null });
      }
      sorted.sort((a, b) => a.ry - b.ry);

      // 1. cached：先解析全部贴图（烘焙都在这一步）
      if (mode === 'cached') {
        for (const item of sorted) item.parts = this.prepareActor(item.actor, hab, c, s);
      }

      // 2. 背景 + 地台
      let drawCalls = this.drawGround(platform, actors, animTime, c, s);

      // 3. 生物
      const isRetro = mode === 'retro';
      for (const item of sorted) {
        if (mode === 'cached') drawCalls += this.drawPreparedActor(item.parts);
        else { drawCalls += this.drawActorRealtime(item.actor, hab, c, s, isRetro); this._glowOn = true; this._g[0] = 0; this._g[1] = 0; this._g[2] = EW; this._g[3] = EH; }
        this.drawWaterFront(item.actor, hab);
      }

      // 4. 3D 像素粒子
      const eScale = EW / cv.width;
      const W2 = cv.width / 2, H2 = cv.height / 2 + 16 * SCALE;
      for (const p of this.vfx.particles) {
        const u = p.t / p.life;
        const px = W2 + (c * p.x - s * p.y) * SCALE;
        const py = H2 + (s * p.x + c * p.y) * TILT * SCALE - p.z * HS * SCALE;
        const sPx = Math.max(2, Math.round(p.sz * (1 - u * 0.5) * SCALE));
        dctx.fillStyle = p.color;
        dctx.fillRect(Math.round(px) - (sPx >> 1), Math.round(py) - (sPx >> 1), sPx, sPx);
        if (p.glow) {
          const es = Math.max(1, Math.round(sPx * eScale));
          const gx = Math.round(px * eScale) - (es >> 1), gy = Math.round(py * eScale) - (es >> 1);
          ectx.fillStyle = p.color;
          ectx.fillRect(gx, gy, es, es);
          this._glowUnion(gx, gy, es, es);
        }
      }

      // 5. 自亮柔化：只处理有光的那一块；整帧没光就整段跳过
      if (this._glowOn) {
        const blur = Math.max(1, Math.round(SCALE * 0.16));
        const pad = blur * 3 + 2;
        const g = this._g;
        const x0 = clamp(Math.floor(g[0] - pad), 0, EW), y0 = clamp(Math.floor(g[1] - pad), 0, EH);
        const x1 = clamp(Math.ceil(g[2] + pad), 0, EW), y1 = clamp(Math.ceil(g[3] + pad), 0, EH);
        const w = x1 - x0, h = y1 - y0;
        if (w > 0 && h > 0) {
          const inv = cv.width / EW;
          ebctx.setTransform(1, 0, 0, 1, 0, 0);
          ebctx.clearRect(0, 0, EW, EH);
          ebctx.filter = `blur(${blur}px)`;
          ebctx.drawImage(this.ec, x0, y0, w, h, x0, y0, w, h);
          ebctx.filter = 'none';

          dctx.setTransform(1, 0, 0, 1, 0, 0);
          dctx.globalCompositeOperation = 'screen';
          dctx.imageSmoothingEnabled = true;
          dctx.globalAlpha = 0.68;
          dctx.drawImage(this.eb, x0, y0, w, h, x0 * inv, y0 * inv, w * inv, h * inv);
          dctx.globalAlpha = 0.48;
          dctx.imageSmoothingEnabled = false;
          dctx.drawImage(this.ec, x0, y0, w, h, x0 * inv, y0 * inv, w * inv, h * inv);
          dctx.globalAlpha = 1;
          dctx.globalCompositeOperation = 'source-over';
          drawCalls += 3;
        }
      }
      this._ecDirty = this._glowOn;

      st.frameDraws = drawCalls;
      this.cacheHits = st.hits;
      this.cacheMisses = st.misses;
      return { drawCalls };
    }
  }

  PW.Renderer = {
    TILT, HS, BAKE_SCALE, BAKE_STEP,
    makeCanvas, VFXPool, SpriteAtlas, StackRenderer
  };
})(window.PixelWorkshop);
