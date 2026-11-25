'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SocketTracker } = PW.Solvers;

  // =========================================================================
  // 树6 · 一节节咔哒伸高的（M34 刚性分节棘轮同类 · 照 ruins1_grid_armor.js 改写）
  //
  // 【设计摘要】
  // 1. 俯视高对比外观（默认 ×4 缩放一眼区分于普通竹子）：
  //    - 8 节一节套一节的亮翠竹硬筒（segBase + 6 节共享 segMid + 顶节 segTop），
  //      每节配醒目深墨绿 + 金黄竹节环，明暗层次远强于竹林地台；
  //    - 节缝间一圈鲜橙红短毛腿（legRing，四重对称共享资产），挪步时底圈腿交替划动，
  //      伸高时每拉开一节就露出一圈鲜橙红短毛腿；
  //    - 顶节张开的亮象牙色四瓣嚼叶口器（4 片共享 jawPetal，带珊瑚红内齿），
  //      顶到高处张口咔咔嚼叶并洒落翠绿碎叶粒子；
  // 2. 棘轮顿挫运动学（复用 ruins1_grid_armor.js 的 evalRatchetStep 曲线）：
  //    - 伸高时一节一节咔哒往上顶（每节 0.16s 急速顶升带极短过冲回弹 + 0.15s 硬停顿锁位）；
  //    - 顶到高处张开四瓣口器咔咔嚼叶 3 拍；
  //    - 嚼完再从上往下逐节咔哒缩回，缩矮后用底圈鲜橙红短毛腿顿挫挪到新点（钳制在 maxRadius * 0.80 内）。
  // 3. 资产与预算：5 个共享资产，27 色 0 重色 0 自亮，3 套零重建模换色皮肤，0 禁用字。
  // =========================================================================

  const RATCHET_CFG = {
    segCount: 8,               // 8 节套筒（0=基座, 1..6=中节, 7=顶节）
    collapsedStepZ: 1.85,      // 缩矮态每节露出高度（总高 ~18 格）
    extendedStepZ: 5.55,       // 伸高态每节拉出高度（总高 ~45 格）
    clickMoveDur: 0.16,        // 单节咔哒顶升/缩回动作时长（秒）
    clickHoldDur: 0.14,        // 单节到位硬停顿锁位时长（秒）
    chewBeats: 4,              // 顶高后咔咔嚼叶拍数
    chewBeatDur: 0.34,
    hopStepDist: 5.8,          // 缩矮后单步挪移距离（格）
    hopMoveDur: 0.22,
    hopHoldDur: 0.15,
    targetRadiusRatio: 0.78
  };

  // 27 色独立色表（<= 48 色、0 重色、0 自亮）
  const SPEC = createPaletteSpec({
    pal: {
      // 亮翠竹硬筒主体
      culmDark:    '#186e40',
      culmMid:     '#2eb863',
      culmHi:      '#78eb8c',
      // 深墨绿竹节厚环（与亮翠筒身拉开强明暗）
      nodeDark:    '#0c2e1c',
      nodeMid:     '#184d31',
      nodeHi:      '#2c754d',
      // 金黄竹节镶箍（高对比标志节环）
      goldDark:    '#9c680a',
      goldMid:     '#e8b01e',
      goldHi:      '#fff07a',
      // 套筒内壁深暗槽
      coreDark:    '#091c12',
      coreMid:     '#133624',
      coreHi:      '#21543a',
      // 节缝间鲜橙红短毛腿（与翠绿竹林形成极强补色撞色）
      legDark:     '#96240c',
      legMid:      '#eb4d1e',
      legHi:       '#ff9757',
      // 短毛腿尖端亮黄绒爪
      bristleDark: '#b85a0d',
      bristleMid:  '#ff9829',
      bristleHi:   '#ffe07d',
      // 顶节张开的亮象牙色四瓣嚼叶口器
      ivoryDark:   '#b5a88b',
      ivoryMid:    '#ebe0c5',
      ivoryHi:     '#fffbf0',
      // 口器内侧珊瑚红锯齿
      toothDark:   '#781b2c',
      toothMid:    '#c4334c',
      toothHi:     '#ff758a',
      // 基座与顶节暗铜棘轮卡扣
      latchDark:   '#402b18',
      latchMid:    '#704c2c',
      latchHi:     '#a8794c'
    },
    glowKeys: [],
    parts: [
      'culm', 'node', 'gold', 'core',
      'leg', 'bristle', 'ivory', 'tooth', 'latch'
    ],
    noCrease: [
      ['culm', 'node'],
      ['node', 'gold'],
      ['leg', 'bristle'],
      ['ivory', 'tooth'],
      ['node', 'latch']
    ],
    materials: {
      culm:    ['culmDark',    'culmMid',    'culmHi'],
      node:    ['nodeDark',    'nodeMid',    'nodeHi'],
      gold:    ['goldDark',    'goldMid',    'goldHi'],
      core:    ['coreDark',    'coreMid',    'coreHi'],
      leg:     ['legDark',     'legMid',     'legHi'],
      bristle: ['bristleDark', 'bristleMid', 'bristleHi'],
      ivory:   ['ivoryDark',   'ivoryMid',   'ivoryHi'],
      tooth:   ['toothDark',   'toothMid',   'toothHi'],
      latch:   ['latchDark',   'latchMid',   'latchHi']
    },
    protectedParts: ['gold', 'leg', 'bristle', 'ivory', 'tooth']
  });

  // 3 套零重建模换色皮肤（翠筒金环 / 金竹朱环 / 墨竹赤节）
  const SKINS = [
    {
      id: 'jade_gold',
      name: '翠筒金环（竹林经典）',
      dot: '#2eb863',
      outline: '#09170f',
      pal: {},
      fx: {
        leafA: '#2eb863',
        leafB: '#78eb8c',
        chip:  '#e8b01e',
        dust:  '#a89c78'
      }
    },
    {
      id: 'gold_culm',
      name: '湘妃金竹（金筒青腿）',
      dot: '#e8b01e',
      outline: '#1c1208',
      pal: {
        culmDark:    '#9c6c10', culmMid:    '#e3aa24', culmHi:    '#ffe46b',
        nodeDark:    '#381a14', nodeMid:    '#632d22', nodeHi:    '#964938',
        goldDark:    '#822116', goldMid:    '#cc3b29', goldHi:    '#ff7f66',
        coreDark:    '#26110d', coreMid:    '#452019', coreHi:    '#6b3429',
        legDark:     '#0c7285', legMid:     '#1fc4db', legHi:     '#8cf7ff',
        bristleDark: '#125078', bristleMid: '#3699db', bristleHi: '#9ee0ff',
        ivoryDark:   '#b8b3a6', ivoryMid:   '#ede9df', ivoryHi:   '#ffffff',
        toothDark:   '#6b193c', toothMid:   '#b33067', toothHi:   '#f573a7',
        latchDark:   '#3b2a1c', latchMid:   '#694b33', latchHi:   '#9e7554'
      },
      fx: {
        leafA: '#e3aa24',
        leafB: '#ffe46b',
        chip:  '#1fc4db',
        dust:  '#baa884'
      }
    },
    {
      id: 'ink_bamboo',
      name: '墨竹朱节（黑筒翠腿）',
      dot: '#d93d2b',
      outline: '#080c12',
      pal: {
        culmDark:    '#182433', culmMid:    '#293d54', culmHi:    '#48678a',
        nodeDark:    '#0b111a', nodeMid:    '#162130', nodeHi:    '#293b54',
        goldDark:    '#8f1f14', goldMid:    '#d93d2b', goldHi:    '#ff826e',
        coreDark:    '#070a0f', coreMid:    '#111824', coreHi:    '#1f2c40',
        legDark:     '#148041', legMid:     '#2ee075', legHi:     '#9effc2',
        bristleDark: '#599410', bristleMid: '#9ee024', bristleHi: '#e4ff8c',
        ivoryDark:   '#b8aa91', ivoryMid:   '#ede0c7', ivoryHi:   '#fffaf0',
        toothDark:   '#822a0e', toothMid:   '#d44f1c', toothHi:   '#ff9b66',
        latchDark:   '#4d3219', latchMid:   '#85582c', latchHi:   '#c48a4d'
      },
      fx: {
        leafA: '#2ee075',
        leafB: '#9effc2',
        chip:  '#d93d2b',
        dust:  '#8f96a3'
      }
    }
  ];

  // =========================================================================
  // 1. 竹筒分节资产（segBase / segMid / segTop，均四重对称 symDeg: 90）
  //    每节外壁亮翠竹绿 + 上下深墨绿与金黄竹节环，层次锐利一眼辨识
  // =========================================================================
  function buildBambooTube(makeCanvas, role) {
    const cfg = {
      base: { W: 16, D: 16, H: 8, rOut: 6.6, rIn: 3.4 },
      mid:  { W: 14, D: 14, H: 7, rOut: 5.4, rIn: 2.6 },
      top:  { W: 12, D: 12, H: 7, rOut: 4.5, rIn: 2.0 }
    }[role];

    const m = new VoxelModel(cfg.W, cfg.D, cfg.H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-cfg.rOut - 1.2, cfg.rOut + 1.2, -cfg.rOut - 1.2, cfg.rOut + 1.2, 0, cfg.H - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const isNodeBand = (z === 0 || z === cfg.H - 1);
      const isGoldBand = (z === cfg.H - 2);
      const lim = isNodeBand ? (cfg.rOut + 0.55) : cfg.rOut;
      if (r > lim) return;

      // 内部深腔（顶面凹入显出中空套筒结构）
      if (z >= cfg.H - 2 && r < cfg.rIn) {
        m.setRaw(x, y, z, mat('core'), partId.core);
        return;
      }

      // 四向棘轮卡扣齿（位于东西南北四面，增强机械套筒感）
      const onAxis = (Math.abs(X) < 0.75 || Math.abs(Y) < 0.75);
      if (onAxis && r > cfg.rOut - 1.1 && (z === 2 || z === 3)) {
        m.setRaw(x, y, z, mat('latch'), partId.latch);
        return;
      }

      if (isNodeBand) {
        m.setRaw(x, y, z, mat('node'), partId.node);
      } else if (isGoldBand) {
        m.setRaw(x, y, z, mat('gold'), partId.gold);
      } else {
        m.setRaw(x, y, z, mat('culm'), partId.culm);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: cfg.rOut + 0.6, headZ: cfg.H, centerZ: Math.round(cfg.H * 0.5) });
  }

  // =========================================================================
  // 2. 节缝间鲜橙红短毛腿环（legRing：20×20×4，四重对称 symDeg: 90）
  //    8 条鲜橙红短毛腿呈放射状从竹节缝探出，末端亮黄绒爪，在翠竹林里极其醒目
  // =========================================================================
  function buildLegRing(makeCanvas) {
    const m = new VoxelModel(20, 20, 4, SPEC);
    const { mat, partId } = SPEC;

    for (let k = 0; k < 8; k++) {
      const a = k * (TAU / 8) + 0.39;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      m.paintCapsule(ca * 3.8, sa * 3.8, 2.2, ca * 7.6, sa * 7.6, 1.4, 1.05, 0.75, mat('leg'), partId.leg, true);
      m.paintEllipsoid(ca * 8.4, sa * 8.4, 0.9, 1.05, 1.05, 0.85, mat('bristle'), partId.bristle, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.2, headZ: 4, centerZ: 2 });
  }

  // =========================================================================
  // 3. 顶节亮象牙色四瓣嚼叶口器单片（jawPetal：8×9×6，枢轴在根部 (0, -3.2)）
  //    4 片围在顶节四周，合拢成尖苞、顶高后张开成亮象牙色四瓣大花嚼叶
  // =========================================================================
  const JAW_PIVOT = { x: 0, y: -3.2 };
  function buildJawPetal(makeCanvas) {
    const m = new VoxelModel(8, 9, 6, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-3.5, 3.5, -3.5, 4.5, 0, 5, (x, y, z, X, Y) => {
      const ty = clamp((Y + 3.2) / 7.2, 0, 1);
      const halfW = lerp(1.8, 3.1, Math.sin(ty * Math.PI * 0.78)) * (1 - z * 0.08);
      if (Math.abs(X) > halfW) return;
      if (Y < -3.2 || Y > 3.8) return;
      // 向上外翻的弧形瓣片
      const arcZ = 1.2 + ty * 2.6;
      if (Math.abs(z - arcZ) > 1.35) return;

      // 内缘珊瑚红嚼叶锯齿
      if (z < arcZ - 0.3 && Math.abs(X) < halfW * 0.68 && ty > 0.28) {
        m.setRaw(x, y, z, mat('tooth'), partId.tooth);
      } else {
        m.setRaw(x, y, z, mat('ivory'), partId.ivory);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 5, centerZ: 2.5 });
  }

  // 棘轮顿挫曲线（复用遗1 M34 标杆：急速顶升 + 末尾极短咔哒过冲回弹 + 死锁在 1.0）
  function evalRatchetStep(u) {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    if (u < 0.80) {
      const t = u / 0.80;
      return t * t * (3 - 2 * t);
    }
    const k = (u - 0.80) / 0.20;
    return 1.0 + Math.sin(k * Math.PI) * 0.095 * (1 - k);
  }

  // =========================================================================
  // Def 注册对象
  // =========================================================================
  const Tree6RatchetBambooDef = {
    id: 'tree6_ratchet_bamboo',
    code: '树6',
    name: '一节节咔哒伸高的',
    status: 'done',
    tag: 'M34 同类 · 8 节套筒棘轮咔哒伸高 + 四瓣口器嚼叶',
    summary: '8 节一节套一节的亮翠竹硬筒（深墨绿与金黄竹节环 + 节缝间一圈鲜橙红短毛腿 + 顶节亮象牙色四瓣嚼叶口器，一眼区分于普通竹子）；棘轮式一节一节咔哒往上顶高、每顶一节带明显硬停顿与小回弹，顶到高处张口咔咔嚼叶再咔哒缩回挪步',
    defaultHabitat: 'bamboo',
    footRadius: 11.0,
    ecoWeight: 1.25,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '挪步巡游+棘轮伸高嚼叶', loop: true, status: 'done' },
      { id: 'idle',   name: '缩矮待机（竹节微震）',  loop: true, status: 'done' },
      { id: 'extend', name: '棘轮伸高嚼叶演示',      loop: true, status: 'done' }
    ],
    blocks: [
      '8 节亮翠竹套筒与深墨绿金黄竹节环',
      '节缝间鲜橙红短毛腿环（强补色撞色）',
      '顶节亮象牙色四瓣珊瑚齿嚼叶口器',
      '棘轮顿挫曲线逐节咔哒顶高与缩回（硬停顿+小回弹）',
      '顶高张口咔咔嚼叶与碎竹叶粒子洒下'
    ],
    soulHabit: '缩矮时像一截带金环和鲜橙红毛腿的奇异竹桩，在竹林地上顿挫挪到竹叶茂密处，便一节一节咔、咔、咔地把八节竹筒往上顶高，每顶一节硬停回弹并露出一圈橙红短毛腿；顶到高处张开顶节四瓣象牙口器咔咔嚼叶，再逐节咔哒缩回',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        segBase:  buildBambooTube(makeCanvas, 'base'),
        segMid:   buildBambooTube(makeCanvas, 'mid'),
        segTop:   buildBambooTube(makeCanvas, 'top'),
        legRing:  buildLegRing(makeCanvas),
        jawPetal: buildJawPetal(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.3;
      const seed0 = opts.seed ?? 36;

      // 7 个可伸缩节缝（对应节 1..7 相对下方一节的展开进度 0..1）
      const jointExt = [0, 0, 0, 0, 0, 0, 0];

      const state = {
        x: hx0,
        y: hy0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        shadowScale: 0.78,
        // 状态机：'walk_hop' | 'extend_click' | 'chew' | 'retract_click' | 'idle_tick'
        mode: 'extend_click',
        activeJoint: 0,    // 正在顶高或缩回的节缝索引 (0..6)
        phaseT: 0,
        chewIdx: 0,
        jawOpen: 0,        // 0=合拢, 1=张开嚼叶
        hopsLeft: 2,
        hopStartX: hx0,
        hopStartY: hy0,
        hopEndX: hx0,
        hopEndY: hy0,
        navX: hx0 + 18,
        navY: hy0 + 10,
        seq: 1,
        beatFxDone: false,
        prevAction: 'patrol',
        legSpin: 0,
        simTime: 0
      };

      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      function clampInSafeDisc(x, y, hx, hy, maxR) {
        const safeR = Math.max(8, maxR * RATCHET_CFG.targetRadiusRatio);
        const dx = x - hx;
        const dy = y - hy;
        const d = Math.hypot(dx, dy);
        if (d > safeR && d > 1e-4) {
          return [hx + (dx * safeR) / d, hy + (dy * safeR) / d];
        }
        return [x, y];
      }

      function pickNavTarget(hx, hy, maxR) {
        state.seq++;
        const r1 = hash2i(state.seq, seed0, 157);
        const r2 = hash2i(state.seq, seed0, 283);
        const ang = Math.atan2(state.y - hy, state.x - hx) + (r1 > 0.5 ? 1 : -1) * lerp(1.2, 2.5, r2);
        const rad = lerp(maxR * 0.25, maxR * 0.72, hash2i(state.seq, seed0, 409));
        const [cx, cy] = clampInSafeDisc(hx + Math.cos(ang) * rad, hy + Math.sin(ang) * rad, hx, hy, maxR);
        state.navX = cx;
        state.navY = cy;
      }

      function prepareNextHop(hx, hy, maxR, sMul) {
        const dx = state.navX - state.x;
        const dy = state.navY - state.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 7.5 * sMul) pickNavTarget(hx, hy, maxR);

        const ndx = state.navX - state.x;
        const ndy = state.navY - state.y;
        const nd = Math.max(1e-3, Math.hypot(ndx, ndy));
        const step = Math.min(RATCHET_CFG.hopStepDist * sMul, nd);
        state.yaw = Math.atan2(-ndx, ndy);
        state.hopStartX = state.x;
        state.hopStartY = state.y;
        const [ex, ey] = clampInSafeDisc(state.x + (ndx / nd) * step, state.y + (ndy / nd) * step, hx, hy, maxR);
        state.hopEndX = ex;
        state.hopEndY = ey;
        state.phaseT = 0;
        state.beatFxDone = false;
      }

      function spawnChewLeaves(vfx, wx, wy, wz, count, sMul) {
        if (!vfx || typeof vfx.spawnParticle !== 'function') return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU + hash2i(state.seq + i, seed0, 563) * 0.8;
          const spd = (5.0 + hash2i(state.seq + i, seed0, 677) * 8.0) * sMul;
          vfx.spawnParticle(
            wx + Math.cos(a) * 3.5 * sMul,
            wy + Math.sin(a) * 3.5 * sMul,
            wz,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            (3.0 + hash2i(state.seq + i, seed0, 773) * 5.0) * sMul,
            0.65 + hash2i(state.seq + i, seed0, 881) * 0.35,
            1.35,
            i % 3 === 0 ? fx.chip : (i % 2 === 0 ? fx.leafA : fx.leafB),
            false,
            18
          );
        }
      }

      function getTopLift(sMul) {
        let z = 1.6 * sMul;
        for (let i = 0; i < jointExt.length; i++) {
          z += lerp(RATCHET_CFG.collapsedStepZ, RATCHET_CFG.extendedStepZ, jointExt[i]) * sMul;
        }
        return z + 6.5 * sMul;
      }

      const instance = {
        def: Tree6RatchetBambooDef,
        cachePrefix: `tree6_rb_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx;
          state.y = hy;
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = hyaw;
          for (let i = 0; i < jointExt.length; i++) jointExt[i] = 0;
          state.mode = 'extend_click';
          state.activeJoint = 0;
          state.phaseT = 0;
          state.chewIdx = 0;
          state.jawOpen = 0.15;
          state.hopsLeft = 3;
          state.hopStartX = hx;
          state.hopStartY = hy;
          state.hopEndX = hx;
          state.hopEndY = hy;
          state.seq = 1;
          state.beatFxDone = false;
          state.prevAction = 'patrol';
          state.legSpin = 0;
          state.simTime = 0;
          pickNavTarget(hx, hy, 44);
          footContacts.length = 0;
          footContacts.push({ x: hx, y: hy, z: 0, r: 9.5 * (instance.scaleMul || 1.0) });
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.45, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.45, 2.2);
          const tempo = clamp(gFreq * (0.65 + 0.35 * spdMul), 0.45, 2.5);
          const hx = (eco && eco.homeX) ?? hx0;
          const hy = (eco && eco.homeY) ?? hy0;
          const maxR = (eco && eco.maxRadius) || 44;
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');

          state.simTime = time;

          if (action !== state.prevAction) {
            state.prevAction = action;
            state.phaseT = 0;
            state.beatFxDone = false;
            if (action === 'idle') {
              state.mode = 'idle_tick';
              for (let i = 0; i < jointExt.length; i++) jointExt[i] = 0;
            } else if (action === 'extend') {
              for (let i = 0; i < jointExt.length; i++) jointExt[i] = 0;
              state.mode = 'extend_click';
              state.activeJoint = 0;
            } else {
              state.mode = 'extend_click';
              state.activeJoint = 0;
            }
          }

          if (action === 'idle') {
            // 原地缩矮待机：偶尔单节咔哒微顶回弹 + 顶节口器微张轻探
            state.mode = 'idle_tick';
            state.phaseT += dt * gFreq;
            const cyc = state.phaseT % 2.4;
            for (let i = 0; i < jointExt.length; i++) jointExt[i] = 0;
            if (cyc < 0.35) {
              const u = cyc / 0.35;
              jointExt[6] = Math.sin(u * Math.PI) * 0.28;
            }
            state.jawOpen = 0.22 + Math.sin(time * 2.4) * 0.14;
            state.vx = 0;
            state.vy = 0;
          } else if (state.mode === 'extend_click') {
            // 逐节咔哒往上顶（从节缝 0 到 6，每节急速顶升过冲回弹 + 硬停顿锁位）
            const moveD = RATCHET_CFG.clickMoveDur;
            const totalD = moveD + RATCHET_CFG.clickHoldDur;
            state.phaseT += dt * tempo;
            const u = clamp(state.phaseT / moveD, 0, 1);
            const r = evalRatchetStep(u);
            jointExt[state.activeJoint] = r;
            state.jawOpen = lerp(0.12, 0.38, (state.activeJoint + clamp(u, 0, 1)) / jointExt.length);

            if (state.phaseT >= moveD && !state.beatFxDone) {
              state.beatFxDone = true;
              state.legSpin += 0.32;
              if (vfx && state.activeJoint % 2 === 1) {
                spawnChewLeaves(vfx, state.x, state.y, getTopLift(sMul) - 2.0 * sMul, 2, sMul);
              }
            }

            state.vx = 0;
            state.vy = 0;

            if (state.phaseT >= totalD) {
              jointExt[state.activeJoint] = 1.0;
              state.phaseT = 0;
              state.beatFxDone = false;
              state.activeJoint++;
              if (state.activeJoint >= jointExt.length) {
                state.mode = 'chew';
                state.chewIdx = 0;
                state.phaseT = 0;
                state.beatFxDone = false;
              }
            }
          } else if (state.mode === 'chew') {
            // 顶到高处：四瓣亮象牙色口器咔咔张合嚼叶并洒下翠绿碎叶粒子
            state.phaseT += dt * tempo;
            const dur = RATCHET_CFG.chewBeatDur;
            const u = clamp(state.phaseT / dur, 0, 1);
            // 先急速大张再咔嚓咬合
            state.jawOpen = u < 0.45 ? lerp(0.35, 1.0, smoothstep(0, 1, u / 0.45)) : lerp(1.0, 0.25, evalRatchetStep((u - 0.45) / 0.55));

            if (u >= 0.52 && !state.beatFxDone) {
              state.beatFxDone = true;
              state.seq++;
              spawnChewLeaves(vfx, state.x, state.y, getTopLift(sMul), 5, sMul);
            }

            state.vx = 0;
            state.vy = 0;

            if (state.phaseT >= dur) {
              state.phaseT = 0;
              state.beatFxDone = false;
              state.chewIdx++;
              if (state.chewIdx >= RATCHET_CFG.chewBeats) {
                state.mode = 'retract_click';
                state.activeJoint = jointExt.length - 1;
                state.phaseT = 0;
                state.beatFxDone = false;
              }
            }
          } else if (state.mode === 'retract_click') {
            // 从顶节往下逐节咔哒缩回（每节硬停顿锁位）
            const moveD = RATCHET_CFG.clickMoveDur * 0.90;
            const totalD = moveD + RATCHET_CFG.clickHoldDur * 0.82;
            state.phaseT += dt * tempo;
            const u = clamp(state.phaseT / moveD, 0, 1);
            const r = evalRatchetStep(u);
            jointExt[state.activeJoint] = clamp(1.0 - r, -0.05, 1.05);
            state.jawOpen = lerp(0.28, 0.10, 1 - state.activeJoint / jointExt.length);

            if (state.phaseT >= moveD && !state.beatFxDone) {
              state.beatFxDone = true;
              state.legSpin -= 0.28;
            }

            state.vx = 0;
            state.vy = 0;

            if (state.phaseT >= totalD) {
              jointExt[state.activeJoint] = 0;
              state.phaseT = 0;
              state.beatFxDone = false;
              state.activeJoint--;
              if (state.activeJoint < 0) {
                if (action === 'extend') {
                  state.mode = 'extend_click';
                  state.activeJoint = 0;
                } else {
                  state.mode = 'walk_hop';
                  state.seq++;
                  state.hopsLeft = 3 + Math.floor(hash2i(state.seq, seed0, 317) * 3);
                  prepareNextHop(hx, hy, maxR, sMul);
                }
              }
            }
          } else if (state.mode === 'walk_hop') {
            // 缩矮后靠底圈鲜橙红短毛腿顿挫挪步（钳制在 maxRadius * 0.80 内）
            const moveD = RATCHET_CFG.hopMoveDur;
            const totalD = moveD + RATCHET_CFG.hopHoldDur;
            state.phaseT += dt * tempo;
            const u = clamp(state.phaseT / moveD, 0, 1);
            const r = evalRatchetStep(u);
            const nx = lerp(state.hopStartX, state.hopEndX, clamp(r, 0, 1.04));
            const ny = lerp(state.hopStartY, state.hopEndY, clamp(r, 0, 1.04));
            const [cx, cy] = clampInSafeDisc(nx, ny, hx, hy, maxR);
            state.vx = (cx - state.x) / Math.max(dt, 0.001);
            state.vy = (cy - state.y) / Math.max(dt, 0.001);
            state.x = cx;
            state.y = cy;
            state.z = state.phaseT < moveD ? Math.sin(u * Math.PI) * 1.4 * sMul : 0;
            state.legSpin += (state.phaseT < moveD ? dt * 6.5 : 0);
            state.jawOpen = 0.14;

            if (state.phaseT >= moveD && !state.beatFxDone) {
              state.beatFxDone = true;
              if (vfx && typeof vfx.spawnDust === 'function') {
                vfx.spawnDust(state.x, state.y, 3, 0.55 * sMul, (habitat && habitat.fx) || undefined);
              }
            }

            if (state.phaseT >= totalD) {
              state.x = state.hopEndX;
              state.y = state.hopEndY;
              state.z = 0;
              state.hopsLeft--;
              if (state.hopsLeft <= 0) {
                state.mode = 'extend_click';
                state.activeJoint = 0;
                state.phaseT = 0;
                state.beatFxDone = false;
              } else {
                prepareNextHop(hx, hy, maxR, sMul);
              }
            }
          }

          // 安全位置钳制
          if (action !== 'idle') {
            const [cx, cy] = clampInSafeDisc(state.x, state.y, hx, hy, maxR);
            state.x = cx;
            state.y = cy;
          }

          footContacts.length = 0;
          footContacts.push({ x: state.x, y: state.y, z: state.z, r: 9.5 * sMul });
          sockets.setWorld('topMouth', state.x, state.y, state.z + getTopLift(sMul), state.yaw);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.simTime;

          // 1. 底层接地鲜橙红短毛腿环（挪步时交替旋动）
          list.push({
            partKey: 'legRing',
            asset: parts.legRing,
            x: state.x,
            y: state.y,
            lift: Math.max(0.0, state.z + 0.2 * sMul),
            ro: wrapAngle(yw + state.legSpin),
            symDeg: 90,
            bias: -0.45
          });

          // 2. 8 节一节套一节的亮翠竹硬筒 + 节缝间露出的鲜橙红短毛腿环
          let curZ = state.z + 1.4 * sMul;
          for (let i = 0; i < RATCHET_CFG.segCount; i++) {
            const assetKey = i === 0 ? 'segBase' : (i === RATCHET_CFG.segCount - 1 ? 'segTop' : 'segMid');
            // 伸高时高节略带极微竹竿风晃（纯位移，严禁 scale）
            const heightFrac = i / (RATCHET_CFG.segCount - 1);
            const swayAmp = (curZ / (44 * sMul)) * heightFrac * 0.95 * sMul;
            const sx = state.x + Math.sin(t * 2.1 + i * 0.4) * swayAmp;
            const sy = state.y + Math.cos(t * 1.7 + i * 0.4) * swayAmp;

            list.push({
              partKey: assetKey,
              asset: parts[assetKey],
              x: sx,
              y: sy,
              lift: curZ,
              ro: wrapAngle(yw + (i % 2 === 0 ? 0 : 0.39)),
              symDeg: 90,
              bias: i * 0.18
            });

            // 节缝展开后露出一圈鲜橙红短毛腿（第 1、3、5 节缝露出，既清晰又不糊成一团）
            if (i < jointExt.length) {
              const ext = clamp(jointExt[i], 0, 1.15);
              if ((i === 0 || i === 2 || i === 4 || i === 6) && ext > 0.35) {
                list.push({
                  partKey: 'legRing',
                  asset: parts.legRing,
                  x: sx,
                  y: sy,
                  lift: curZ + (RATCHET_CFG.collapsedStepZ + ext * 1.8) * sMul,
                  ro: wrapAngle(yw + state.legSpin * 0.5 + i * 0.55),
                  symDeg: 90,
                  bias: i * 0.18 + 0.08
                });
              }
              curZ += lerp(RATCHET_CFG.collapsedStepZ, RATCHET_CFG.extendedStepZ, ext) * sMul;
            }
          }

          // 3. 顶节张开的亮象牙色四瓣嚼叶口器（4 片共享 jawPetal，随 jawOpen 向外张开）
          const topSway = (curZ / (44 * sMul)) * 1.05 * sMul;
          const topX = state.x + Math.sin(t * 2.1 + 2.8) * topSway;
          const topY = state.y + Math.cos(t * 1.7 + 2.8) * topSway;
          const topZ = curZ + 3.6 * sMul;
          const openAmt = clamp(state.jawOpen, 0, 1.1);

          for (let k = 0; k < 4; k++) {
            const pAng = wrapAngle(yw + k * (TAU / 4) + 0.785);
            const radialOut = lerp(1.5, 4.3, openAmt) * sMul;
            const [jx, jy] = localToWorldXY(topX, topY, pAng, 0, radialOut);
            const [px, py] = pivotToWorldXY(jx, jy, pAng, JAW_PIVOT.x * sMul, JAW_PIVOT.y * sMul);
            list.push({
              partKey: 'jawPetal',
              asset: parts.jawPetal,
              x: px,
              y: py,
              lift: topZ + lerp(0.8, -0.5, openAmt) * sMul,
              ro: pAng,
              bias: 2.2 + k * 0.04
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Tree6RatchetBambooDef.id,
            code: Tree6RatchetBambooDef.code,
            name: Tree6RatchetBambooDef.name,
            status: Tree6RatchetBambooDef.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            mode: state.mode,
            segCount: RATCHET_CFG.segCount,
            footRadius: Tree6RatchetBambooDef.footRadius,
            headZ: 46,
            centerZ: 18,
            blocks: Tree6RatchetBambooDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Tree6RatchetBambooDef);
})(window.PixelWorkshop);
