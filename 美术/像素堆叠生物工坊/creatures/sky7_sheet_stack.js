'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SocketTracker } = PW.Solvers;

  // =========================================================================
  // M35 同类 · 天7 · 一摞薄片（雷云峰顶）
  // -------------------------------------------------------------------------
  // 11 片薄圆片叠成高柱（仅 3 套八重对称 symDeg: 45 圆片资产复用，极省贴图）：
  //   - 深青灰岩片配醒目亮青白片边环 + 明黄内纹，片缝外圈夹着肉眼可见的金黄种子点；
  //   - 动法与 火1 相反：自上而下一片片飘散飞走（沿途飘落金黄种子粒子），
  //     在目标点自下而上一片片落下重新叠成高柱。
  // =========================================================================
  const M35_SKY7_CONFIG = {
    slabCount: 11,
    slabHeight: 3,              // 薄圆片厚度（3 层体素）
    slabStepZ: 3.4,             // 相邻薄片垂直步距（留清晰片缝与种子点）
    biasStep: 3.1,              // 相邻薄片严格递增深度偏置，360° 零穿插
    shedOrder: 'topDown',       // 飘散顺序：自上而下（第 10 片 -> 第 0 片）
    assembleOrder: 'bottomUp',  // 落叠顺序：自下而上（第 0 片 -> 第 10 片）

    breathDuration: [2.6, 3.8], // 柱态迎风摇曳时长（秒）
    compactBreath: 1.05,        // scatter 演示态的柱态停留时长（秒）
    scatterDuration: 1.35,      // 自上而下逐片飘散起飞时长（秒）
    driftDuration: 0.85,        // 乘风飘移飞向目标点时长（秒）
    reassembleDuration: 1.25,   // 目标点逐片落下叠回时长（秒）

    targetRadiusRatio: 0.72,    // 目标点安全半径上限（远小于 0.80）
    partRadiusRatio: 0.79,      // 单片飞行坐标硬钳制半径上限（严格 < 0.80）
    minHopDist: 16.0,           // 单次飘迁最小水平距离（格）

    breathSwayAmp: 1.35,        // 迎风错层水平摆幅（格）
    breathLiftAmp: 0.35,        // 迎风微起伏幅度（格）
    flightLiftExtra: 14.0,      // 飘散时的额外抬升高度（格）
    dropStartExtra: 16.0        // 落回前的起始俯落高度（格）
  };

  // 11 片薄圆片排布表（复用 3 套八重对称圆片资产：sheetBase / sheetMid / sheetTop）
  const LAYER_DEFS = [
    { idx: 0,  assetKey: 'sheetBase', baseYaw:  0.00, swayMul: 0.24, driftOff: [-5.5,  3.2] },
    { idx: 1,  assetKey: 'sheetBase', baseYaw:  0.22, swayMul: 0.34, driftOff: [ 4.8, -3.5] },
    { idx: 2,  assetKey: 'sheetBase', baseYaw: -0.18, swayMul: 0.44, driftOff: [-4.2, -4.6] },
    { idx: 3,  assetKey: 'sheetMid',  baseYaw:  0.35, swayMul: 0.54, driftOff: [ 5.8,  2.8] },
    { idx: 4,  assetKey: 'sheetMid',  baseYaw: -0.28, swayMul: 0.64, driftOff: [-6.0,  0.6] },
    { idx: 5,  assetKey: 'sheetMid',  baseYaw:  0.14, swayMul: 0.74, driftOff: [ 3.2,  5.6] },
    { idx: 6,  assetKey: 'sheetMid',  baseYaw: -0.36, swayMul: 0.84, driftOff: [-2.4, -6.2] },
    { idx: 7,  assetKey: 'sheetMid',  baseYaw:  0.26, swayMul: 0.94, driftOff: [ 6.4, -1.2] },
    { idx: 8,  assetKey: 'sheetTop',  baseYaw: -0.16, swayMul: 1.04, driftOff: [-3.8,  4.8] },
    { idx: 9,  assetKey: 'sheetTop',  baseYaw:  0.32, swayMul: 1.14, driftOff: [ 2.6, -5.0] },
    { idx: 10, assetKey: 'sheetTop',  baseYaw: -0.24, swayMul: 1.24, driftOff: [ 0.4,  2.2] }
  ];

  // =========================================================================
  // 1. 色表（21 色 <= 48 色、0 重色、高对比分色：深青灰岩 + 亮青白边环 + 明黄金种子）
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 深青灰岩片主体（3 档）
      slateDark:  '#1c2433',
      slateMid:   '#2e3b52',
      slateHi:    '#475a78',
      // 岩片顶面风蚀纹理（3 档）
      grainDark:  '#243042',
      grainMid:   '#3b4d69',
      grainHi:    '#576f94',
      // 醒目亮青白片边环（3 档，×4 俯视一眼拉开与峰顶灰岩反差）
      rimDark:    '#7ec4db',
      rimMid:     '#b5ecfa',
      rimHi:      '#ebfcff',
      // 岩片次外圈明黄细环（3 档，增强层叠辨识度）
      bandDark:   '#b88918',
      bandMid:    '#e6b92e',
      bandHi:     '#ffe36e',
      // 片缝深暗底缘（3 档，切出清晰片间空隙）
      seamDark:   '#101521',
      seamMid:    '#192130',
      seamHi:     '#263145',
      // 片缝外圈金黄种子点（3 档，醒目饱满）
      seedDark:   '#cc7a0e',
      seedMid:    '#ffae19',
      seedHi:     '#fff082',
      // 中心风孔微青岩心（3 档）
      coreDark:   '#396e85',
      coreMid:    '#5ca3bd',
      coreHi:     '#8cd4eb'
    },
    glowKeys: ['seedHi', 'rimHi'],
    parts: ['slate', 'grain', 'rim', 'band', 'seam', 'seed', 'core'],
    noCrease: [
      ['slate', 'grain'],
      ['slate', 'rim'],
      ['slate', 'band'],
      ['rim', 'band'],
      ['rim', 'seed'],
      ['band', 'seed'],
      ['slate', 'core']
    ],
    materials: {
      slate: ['slateDark', 'slateMid', 'slateHi'],
      grain: ['grainDark', 'grainMid', 'grainHi'],
      rim:   ['rimDark',   'rimMid',   'rimHi'],
      band:  ['bandDark',  'bandMid',  'bandHi'],
      seam:  ['seamDark',  'seamMid',  'seamHi'],
      seed:  ['seedDark',  'seedMid',  'seedHi'],
      core:  ['coreDark',  'coreMid',  'coreHi']
    },
    protectedParts: ['rim', 'band', 'seed']
  });

  // 3 套零重建模换色皮肤（每套 21 色 0 重色，0 禁用字）
  const SKINS = [
    {
      id: 'peak_cyan_gold',
      name: '峰岩青白金籽',
      dot: '#b5ecfa',
      outline: '#0c101a',
      pal: {},
      fx: {
        seedA: '#ffae19',
        seedB: '#fff082',
        gust:  '#b5ecfa',
        moss:  '#d9b634',
        mossDark: '#473c18'
      }
    },
    {
      id: 'storm_lemon_slate',
      name: '雷岩明黄橙籽',
      dot: '#ffe047',
      outline: '#100e17',
      pal: {
        slateDark: '#231e30', slateMid: '#39324d', slateHi: '#564c73',
        grainDark: '#2c263b', grainMid: '#483f5e', grainHi: '#6b5e8a',
        rimDark:   '#c49d1b', rimMid:   '#f0ca32', rimHi:   '#fff59e',
        bandDark:  '#5ca6bd', bandMid:  '#8bd4eb', bandHi:  '#ccf6ff',
        seamDark:  '#14111c', seamMid:  '#1f1b2b', seamHi:  '#2e2840',
        seedDark:  '#c74b0e', seedMid:  '#ff7a24', seedHi:  '#ffd275',
        coreDark:  '#8f6a20', coreMid:  '#bd8e2f', coreHi:  '#ebba4d'
      },
      fx: {
        seedA: '#ff7a24',
        seedB: '#ffd275',
        gust:  '#fff59e',
        moss:  '#e08c2b',
        mossDark: '#472a14'
      }
    },
    {
      id: 'cloud_jade_seed',
      name: '云石碧白芽籽',
      dot: '#7cf2c7',
      outline: '#0a1414',
      pal: {
        slateDark: '#192929', slateMid: '#2a4242', slateHi: '#416363',
        grainDark: '#203333', grainMid: '#355454', grainHi: '#507d7d',
        rimDark:   '#4ec29b', rimMid:   '#7cf2c7', rimHi:   '#d9fff0',
        bandDark:  '#a89c23', bandMid:  '#d9cc38', bandHi:  '#f7f086',
        seamDark:  '#0e1717', seamMid:  '#172424', seamHi:  '#233636',
        seedDark:  '#bf8a15', seedMid:  '#f5be27', seedHi:  '#fff49c',
        coreDark:  '#3d8573', coreMid:  '#5eb09b', coreHi:  '#91dec9'
      },
      fx: {
        seedA: '#f5be27',
        seedB: '#fff49c',
        gust:  '#7cf2c7',
        moss:  '#b8cf36',
        mossDark: '#364216'
      }
    }
  ];

  // =========================================================================
  // 2. 三套八重对称薄圆片建模（全部 symDeg: 45，极省图集贴图）
  //    - sheetBase (34x34x3, 半径 15.5)
  //    - sheetMid  (30x30x3, 半径 13.5)
  //    - sheetTop  (24x24x3, 半径 10.6)
  //    每片保证 45° 旋转严格对称：
  //      - 外缘 2.2 格亮青白片边环
  //      - 次外圈 1.2 格明黄细环（局部断续成 8 段）
  //      - 8 处对称片缘夹缝内嵌饱满金黄种子团（z=1~2 均可见，俯视清晰）
  // =========================================================================
  function buildThinSheet(makeCanvas, opts) {
    const { boxSize, radius, seedRingOffset, hasCenterEye } = opts;
    const W = boxSize, D = boxSize, H = M35_SKY7_CONFIG.slabHeight;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-radius - 1.2, radius + 1.2, -radius - 1.2, radius + 1.2, 0, H - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);

      // 8 重对称薄岩片外轮廓（轻微 8 瓣风蚀波边，严格满足 symDeg: 45）
      const octWave = Math.cos(ang * 8);
      const zInset = (z === 0) ? 1.1 : 0.0;
      const effR = radius - zInset + octWave * 0.48;
      if (r > effR) return;

      const edgeDist = effR - r;

      // 计算最近的 8 重对称方位角（每隔 45° 一处种子嵌槽）
      const sector = Math.round(ang / (TAU / 8)) * (TAU / 8);
      const dAng = Math.abs(wrapAngle(ang - sector));
      const arcDist = dAng * r;

      // 1) 底层 z=0：深暗片缝底缘，但外缘 8 处种子点向下透出一点金黄（让侧面片缝里能看见夹着的种子）
      if (z === 0) {
        const seedSlotBottom = (arcDist <= 1.35) && (r >= radius - seedRingOffset - 1.4) && (r <= effR - 0.1);
        if (seedSlotBottom) {
          m.setRaw(x, y, z, mat('seed'), partId.seed);
        } else {
          m.setRaw(x, y, z, mat('seam'), partId.seam);
        }
        return;
      }

      // 2) 8 处放大醒目的金黄种子点（夹在片缘凹槽处，z=1 和 z=2 形成饱满 2~3 格金点）
      const seedDist = Math.hypot(r - (radius - seedRingOffset), arcDist);
      if (seedDist <= 1.55) {
        m.setRaw(x, y, z, mat('seed'), partId.seed);
        return;
      }

      // 3) 醒目亮青白外边环（最外 1.9 格，保证俯视 ×4 每一片都有锐利高对比轮廓）
      if (edgeDist <= 1.85) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
        return;
      }

      // 4) 次外圈明黄细环（紧贴青白边环内侧，拉开明度层次）
      if (z === H - 1 && edgeDist > 1.85 && edgeDist <= 3.05) {
        m.setRaw(x, y, z, mat('band'), partId.band);
        return;
      }

      // 5) 中心风孔微青岩心（顶片略大，俯视有焦点）
      if (hasCenterEye && z === H - 1 && r <= 2.7) {
        m.setRaw(x, y, z, mat('core'), partId.core);
        return;
      }

      // 6) 岩片主体：深青灰岩 + 8 重对称风蚀同心纹
      const ringPattern = Math.sin(r * 1.15) > 0.25 && z === H - 1;
      if (ringPattern) {
        m.setRaw(x, y, z, mat('grain'), partId.grain);
      } else {
        m.setRaw(x, y, z, mat('slate'), partId.slate);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, {
      footRadius: radius,
      headZ: H,
      centerZ: Math.round(H * 0.5)
    });
  }

  // =========================================================================
  // 3. 生物定义：天7 · 一摞薄片
  // =========================================================================
  const Sky7SheetStackDef = {
    id: 'sky7_sheet_stack',
    code: '天7',
    name: '一摞薄片',
    status: 'done',
    tag: 'M35 层叠拆拼 · 飘散撒种',
    summary: '11 片薄圆片叠成高柱（仅 3 套八重对称圆片资产复用）：深青灰岩片镶亮青白与明黄片边环，片缝夹着金黄种子点；迎风错层摇曳，迁移时自上而下一片片飘散飞走并沿途撒落金黄种子，在目标点逐片落下重叠成柱',
    defaultHabitat: 'thunderPeak',
    footRadius: 15.8,
    ecoWeight: 1.15,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    m35Config: M35_SKY7_CONFIG,
    blocks: [
      '11片薄圆片复用3套八重对称(symDeg 45)岩片资产',
      '深青灰岩片+亮青白片边环+片缝金黄种子点高对比分色',
      '柱态迎风逐层错位摇曳',
      '自上而下逐片飘散起飞并沿途撒落金黄种子粒子',
      '目标点自下而上逐片落下叠回高柱'
    ],
    soulHabit: '平时十余片薄岩片叠成一根稳稳的高柱，风过时片片微微错开晃动、把风里的种子夹进片缝；要换块峰顶石头时，从最顶上一片开始逐片被风卷起飘散飞走，沿途撒下一串金黄种子，最后在别处一片片飘落叠回高柱',
    actions: [
      { id: 'patrol',  name: '巡游飘迁（撒种重叠）', loop: true, status: 'done' },
      { id: 'idle',    name: '原地摇曳（迎风错片）', loop: true, status: 'done' },
      { id: 'scatter', name: '飘散重叠循环展示',     loop: true, status: 'done' }
    ],
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        sheetBase: buildThinSheet(makeCanvas, {
          boxSize: 34, radius: 15.4, seedRingOffset: 2.3, hasCenterEye: false
        }),
        sheetMid: buildThinSheet(makeCanvas, {
          boxSize: 30, radius: 13.4, seedRingOffset: 2.1, hasCenterEye: false
        }),
        sheetTop: buildThinSheet(makeCanvas, {
          boxSize: 24, radius: 10.6, seedRingOffset: 1.9, hasCenterEye: true
        })
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.2;
      const seed0 = opts.seed ?? 107;

      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      const slabs = LAYER_DEFS.map((ld) => ({
        idx: ld.idx,
        assetKey: ld.assetKey,
        baseYaw: ld.baseYaw,
        swayMul: ld.swayMul,
        driftOffX: ld.driftOff[0],
        driftOffY: ld.driftOff[1],
        visible: true,
        x: hx0,
        y: hy0,
        lift: ld.idx * M35_SKY7_CONFIG.slabStepZ,
        ro: wrapAngle(hyaw0 + ld.baseYaw),
        bias: ld.idx * M35_SKY7_CONFIG.biasStep
      }));

      const state = {
        x: hx0,
        y: hy0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        shadowScale: 1.0,

        // 状态机：'breath' -> 'scatter' -> 'drift' -> 'reassemble' -> 'breath'
        phase: 'breath',
        phaseT: 0,
        phaseDur: 3.0,
        seq: 1,
        prevAction: 'patrol',

        originX: hx0,
        originY: hy0,
        targetX: hx0,
        targetY: hy0,
        targetYaw: hyaw0,
        windArcSign: 1,

        seedCd: 0,
        peeledMask: 0,
        landedMask: 0
      };

      function clampInDisc(x, y, hx, hy, safeR) {
        const dx = x - hx;
        const dy = y - hy;
        const d = Math.hypot(dx, dy);
        if (d > safeR && d > 1e-4) {
          return [hx + (dx * safeR) / d, hy + (dy * safeR) / d];
        }
        return [x, y];
      }

      function pickNextTarget(hx, hy, maxR, sMul) {
        const safeR = Math.max(8, maxR * M35_SKY7_CONFIG.targetRadiusRatio);
        const minDist = Math.min(M35_SKY7_CONFIG.minHopDist * sMul, safeR * 1.12);
        let bestX = hx, bestY = hy;

        for (let attempt = 0; attempt < 6; attempt++) {
          state.seq++;
          const rAng = hash2i(state.seq, seed0, 149 + attempt * 19);
          const rRad = hash2i(state.seq, seed0, 293 + attempt * 29);
          const curAng = Math.atan2(state.y - hy, state.x - hx);
          const ang = curAng + lerp(1.5, 4.7, rAng);
          const rad = lerp(safeR * 0.34, safeR * 0.95, rRad);
          const [cx, cy] = clampInDisc(hx + Math.cos(ang) * rad, hy + Math.sin(ang) * rad, hx, hy, safeR);
          bestX = cx;
          bestY = cy;
          if (Math.hypot(bestX - state.x, bestY - state.y) >= minDist) break;
        }

        state.originX = state.x;
        state.originY = state.y;
        state.targetX = bestX;
        state.targetY = bestY;
        state.targetYaw = wrapAngle(state.yaw + lerp(-0.85, 0.85, hash2i(state.seq, seed0, 401)));
        state.windArcSign = (hash2i(state.seq, seed0, 509) > 0.5) ? 1 : -1;
      }

      function spawnSeedParticles(vfx, x, y, z, count, spreadR, sMul, fxCol) {
        if (!vfx) return;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * TAU;
          const r = Math.random() * spreadR * sMul;
          const vx = Math.cos(a) * (3.0 + Math.random() * 6.5) * sMul;
          const vy = Math.sin(a) * (3.0 + Math.random() * 6.5) * sMul;
          const vz = (2.5 + Math.random() * 5.0) * sMul;
          vfx.spawnParticle(
            x + Math.cos(a) * r,
            y + Math.sin(a) * r,
            Math.max(1.2, z),
            vx, vy, vz,
            0.75 + Math.random() * 0.45,
            1.3 + Math.random() * 0.55,
            (i % 2 === 0) ? fxCol.seedB : fxCol.seedA,
            true,
            7.5
          );
        }
      }

      function spawnGustWhiff(vfx, x, y, z, sMul, fxCol) {
        if (!vfx) return;
        const a = Math.random() * TAU;
        vfx.spawnParticle(
          x + Math.cos(a) * 5.0 * sMul,
          y + Math.sin(a) * 5.0 * sMul,
          Math.max(1.5, z),
          Math.cos(a) * 8.0 * sMul,
          Math.sin(a) * 8.0 * sMul,
          3.5 * sMul,
          0.38,
          1.2,
          fxCol.gust,
          false,
          2.0
        );
      }

      function enterBreath(isCompact) {
        state.phase = 'breath';
        state.phaseT = 0;
        state.seq++;
        if (isCompact) {
          state.phaseDur = M35_SKY7_CONFIG.compactBreath;
        } else {
          const [dMin, dMax] = M35_SKY7_CONFIG.breathDuration;
          state.phaseDur = lerp(dMin, dMax, hash2i(state.seq, seed0, 613));
        }
      }

      function enterScatter(hx, hy, maxR, sMul) {
        state.phase = 'scatter';
        state.phaseT = 0;
        state.phaseDur = M35_SKY7_CONFIG.scatterDuration;
        state.peeledMask = 0;
        pickNextTarget(hx, hy, maxR, sMul);
      }

      function enterDrift() {
        state.phase = 'drift';
        state.phaseT = 0;
        state.phaseDur = M35_SKY7_CONFIG.driftDuration;
      }

      function enterReassemble(vfx, sMul, fxCol) {
        state.phase = 'reassemble';
        state.phaseT = 0;
        state.phaseDur = M35_SKY7_CONFIG.reassembleDuration;
        state.landedMask = 0;
        state.x = state.targetX;
        state.y = state.targetY;
        state.yaw = state.targetYaw;
        if (vfx) {
          vfx.addRipple(state.targetX, state.targetY, 3.0 * sMul, 15.0 * sMul, 0.52, 1.3);
          spawnSeedParticles(vfx, state.targetX, state.targetY, 4.0 * sMul, 3, 6.5, sMul, fxCol);
        }
      }

      const instance = {
        def: Sky7SheetStackDef,
        cachePrefix: `sky7_sheet_stack_${Math.random().toString(36).slice(2, 7)}`,
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

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.shadowScale = 1.0;
          state.phase = 'breath';
          state.phaseT = 0;
          state.phaseDur = 2.8;
          state.seq = 1;
          state.originX = homeX;
          state.originY = homeY;
          state.targetX = homeX;
          state.targetY = homeY;
          state.targetYaw = homeYaw;
          state.windArcSign = 1;
          state.seedCd = 0;
          state.peeledMask = 0;
          state.landedMask = 0;

          for (let i = 0; i < slabs.length; i++) {
            const sl = slabs[i];
            sl.visible = true;
            sl.x = homeX;
            sl.y = homeY;
            sl.lift = i * M35_SKY7_CONFIG.slabStepZ;
            sl.ro = wrapAngle(homeYaw + sl.baseYaw);
            sl.bias = i * M35_SKY7_CONFIG.biasStep;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.4, 2.0);
          const hx = (eco && eco.homeX) ?? 0;
          const hy = (eco && eco.homeY) ?? 0;
          const maxR = (eco && eco.maxRadius) || 46;
          const partSafeR = Math.max(8, maxR * M35_SKY7_CONFIG.partRadiusRatio);
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const isIdle = (action === 'idle');
          const isCompact = (action === 'scatter');
          const fxCol = curSkin.fx || SKINS[0].fx;

          if (action !== state.prevAction) {
            state.prevAction = action;
            if (isIdle) {
              state.phase = 'breath';
              state.phaseT = 0;
              state.phaseDur = 999;
            } else if (isCompact) {
              enterScatter(hx, hy, maxR, sMul);
            } else if (state.phase === 'breath' && state.phaseDur > 10) {
              enterBreath(false);
            }
          }

          // 1. 状态机推进
          const stepDt = dt * (state.phase === 'breath' ? 1.0 : spdMul);
          state.phaseT += stepDt;

          if (!isIdle && state.phaseT >= state.phaseDur) {
            if (state.phase === 'breath') {
              enterScatter(hx, hy, maxR, sMul);
            } else if (state.phase === 'scatter') {
              enterDrift();
            } else if (state.phase === 'drift') {
              enterReassemble(vfx, sMul, fxCol);
            } else if (state.phase === 'reassemble') {
              enterBreath(isCompact);
            }
          }

          // 2. 11 片薄圆片运动解算
          const N = M35_SKY7_CONFIG.slabCount;
          const stepZ = M35_SKY7_CONFIG.slabStepZ * sMul;
          const p = clamp(state.phaseT / Math.max(0.01, state.phaseDur), 0, 1);

          // 计算起点到目标点的风弧垂直方向
          const dxAll = state.targetX - state.originX;
          const dyAll = state.targetY - state.originY;
          const distAll = Math.hypot(dxAll, dyAll) || 1;
          const perpX = (-dyAll / distAll) * state.windArcSign;
          const perpY = (dxAll / distAll) * state.windArcSign;

          footContacts.length = 0;

          if (state.phase === 'breath') {
            if (isIdle) {
              const kHome = expSmooth(dt, 3.0);
              state.x = lerp(state.x, hx, kHome);
              state.y = lerp(state.y, hy, kHome);
            }
            const [cx, cy] = clampInDisc(state.x, state.y, hx, hy, partSafeR);
            state.x = cx;
            state.y = cy;
            state.shadowScale = 1.0;

            const swayBase = M35_SKY7_CONFIG.breathSwayAmp * flex * sMul;
            const liftBase = M35_SKY7_CONFIG.breathLiftAmp * sMul;
            let prevLift = -1;

            for (let i = 0; i < N; i++) {
              const sl = slabs[i];
              const ph = time * 2.25 * gFreq - i * 0.52;
              const ox = Math.sin(ph) * swayBase * sl.swayMul;
              const oy = Math.cos(ph * 0.82 + i * 0.9) * swayBase * 0.72 * sl.swayMul;
              const breathLift = (0.5 + 0.5 * Math.sin(ph + 0.4)) * liftBase * sl.swayMul;
              const rawLift = i * stepZ + breathLift;
              const safeLift = (i === 0) ? Math.max(0, rawLift) : Math.max(rawLift, prevLift + 0.55 * sMul);
              const [sx, sy] = clampInDisc(state.x + ox, state.y + oy, hx, hy, partSafeR);

              sl.visible = true;
              sl.x = sx;
              sl.y = sy;
              sl.lift = safeLift;
              sl.ro = wrapAngle(state.yaw + sl.baseYaw + Math.sin(ph * 0.65) * 0.06 * flex);
              sl.bias = i * M35_SKY7_CONFIG.biasStep;
              prevLift = safeLift;
            }

            // 柱态偶发随风飘出金黄种子粒
            state.seedCd -= dt;
            if (vfx && state.seedCd <= 0) {
              state.seedCd = 0.65;
              const pick = Math.floor((time * 3.1) % N);
              const sl = slabs[pick];
              spawnSeedParticles(vfx, sl.x, sl.y, sl.lift + 1.5 * sMul, 1, 7.0, sMul, fxCol);
            }
            footContacts.push({ x: state.x, y: state.y, z: 0, r: 14.5 * sMul });

          } else if (state.phase === 'scatter') {
            // 自上而下（i = N-1 -> 0）逐片被风卷起、飘散飞向中途风带
            const stagger = 0.058;
            const perSpan = Math.max(0.28, 1.0 - (N - 1) * stagger);
            let groundedCount = 0;

            for (let i = 0; i < N; i++) {
              const sl = slabs[i];
              const orderIdx = N - 1 - i; // 顶片最先起飞
              const u = clamp((p - orderIdx * stagger) / perSpan, 0, 1);
              const e = smoothstep(0, 1, u);

              if (u <= 0.02) groundedCount++;

              // 该片刚脱离柱顶时撒出一小撮金黄种子 + 轻风微粒
              const bit = 1 << i;
              if (u >= 0.14 && !(state.peeledMask & bit)) {
                state.peeledMask |= bit;
                if (vfx) {
                  spawnSeedParticles(vfx, sl.x, sl.y, sl.lift + 1.2 * sMul, 2, 6.5, sMul, fxCol);
                  spawnGustWhiff(vfx, sl.x, sl.y, sl.lift + 1.0 * sMul, sMul, fxCol);
                }
              }

              // 沿风弧飘向中段位置（进度到 0.45 行程处，由 drift 阶段平滑接力）
              const frac = e * 0.45;
              const arc = Math.sin(frac * Math.PI) * 10.5 * sMul;
              const flutterX = Math.sin(time * 5.2 + i * 1.7) * 2.2 * e * sMul;
              const flutterY = Math.cos(time * 4.6 + i * 2.1) * 1.8 * e * sMul;

              const rawX = lerp(state.originX, state.targetX, frac) + perpX * arc + sl.driftOffX * e * sMul + flutterX;
              const rawY = lerp(state.originY, state.targetY, frac) + perpY * arc + sl.driftOffY * e * sMul + flutterY;
              const [sx, sy] = clampInDisc(rawX, rawY, hx, hy, partSafeR);

              const baseZ = i * stepZ;
              const flightZ = baseZ + M35_SKY7_CONFIG.flightLiftExtra * e * sMul + Math.sin(e * Math.PI) * 3.5 * sMul;

              sl.visible = true;
              sl.x = sx;
              sl.y = sy;
              sl.lift = flightZ;
              sl.ro = wrapAngle(state.yaw + sl.baseYaw + e * 2.6 * (i % 2 === 0 ? 1 : -1));
              sl.bias = i * M35_SKY7_CONFIG.biasStep;
            }

            state.shadowScale = clamp(groundedCount / N, 0.25, 1.0);
            state.seedCd -= dt;
            if (vfx && state.seedCd <= 0) {
              state.seedCd = 0.14;
              const idx = Math.floor((time * 9.0) % N);
              spawnSeedParticles(vfx, slabs[idx].x, slabs[idx].y, slabs[idx].lift, 2, 4.0, sMul, fxCol);
            }

          } else if (state.phase === 'drift') {
            // 乘风飘移带：11 片薄片错落盘旋飞向目标点上空，沿途持续撒落金黄种子
            const e = smoothstep(0, 1, p);
            const [midX, midY] = clampInDisc(
              lerp(state.originX, state.targetX, lerp(0.45, 0.96, e)),
              lerp(state.originY, state.targetY, lerp(0.45, 0.96, e)),
              hx, hy, partSafeR
            );
            state.x = midX;
            state.y = midY;
            state.shadowScale = 0.28;

            for (let i = 0; i < N; i++) {
              const sl = slabs[i];
              const frac = lerp(0.45, 0.96, e);
              const arc = Math.sin(frac * Math.PI) * 10.5 * sMul;
              const spreadFade = lerp(1.0, 0.42, e);
              const flutterX = Math.sin(time * 5.8 + i * 1.7) * 2.4 * spreadFade * sMul;
              const flutterY = Math.cos(time * 5.1 + i * 2.1) * 2.0 * spreadFade * sMul;

              const rawX = lerp(state.originX, state.targetX, frac) + perpX * arc + sl.driftOffX * spreadFade * sMul + flutterX;
              const rawY = lerp(state.originY, state.targetY, frac) + perpY * arc + sl.driftOffY * spreadFade * sMul + flutterY;
              const [sx, sy] = clampInDisc(rawX, rawY, hx, hy, partSafeR);

              const baseZ = i * stepZ;
              const liftExtra = lerp(M35_SKY7_CONFIG.flightLiftExtra, M35_SKY7_CONFIG.dropStartExtra, e) * sMul;
              const bob = Math.sin(time * 4.5 + i * 0.9) * 1.4 * sMul;

              sl.visible = true;
              sl.x = sx;
              sl.y = sy;
              sl.lift = baseZ + liftExtra + bob;
              sl.ro = wrapAngle(state.yaw + sl.baseYaw + (2.6 + e * 2.8) * (i % 2 === 0 ? 1 : -1));
              sl.bias = i * M35_SKY7_CONFIG.biasStep;
            }

            state.seedCd -= dt;
            if (vfx && state.seedCd <= 0) {
              state.seedCd = 0.11;
              const idx = Math.floor((time * 11.0) % N);
              spawnSeedParticles(vfx, slabs[idx].x, slabs[idx].y, slabs[idx].lift, 2, 4.5, sMul, fxCol);
            }

          } else if (state.phase === 'reassemble') {
            // 目标点自下而上（i = 0 -> N-1）一片片飘落叠回高柱，严格保证 lift 单调递增
            const stagger = 0.056;
            const perSpan = Math.max(0.28, 1.0 - (N - 1) * stagger);
            let landedCount = 0;
            let prevLift = -1;

            for (let i = 0; i < N; i++) {
              const sl = slabs[i];
              const u = clamp((p - i * stagger) / perSpan, 0, 1);
              const e = smoothstep(0, 1, u);

              const bit = 1 << i;
              if (u >= 0.92 && !(state.landedMask & bit)) {
                state.landedMask |= bit;
                if (vfx && i % 3 === 0) {
                  spawnSeedParticles(vfx, state.targetX, state.targetY, i * stepZ + 1.5 * sMul, 1, 6.5, sMul, fxCol);
                }
              }
              if (u >= 0.85) landedCount++;

              const remain = 1 - e;
              const spiralAng = remain * 2.2 * (i % 2 === 0 ? 1 : -1);
              const ox = sl.driftOffX * 0.42 * remain * sMul + Math.sin(spiralAng + i) * 1.8 * remain * sMul;
              const oy = sl.driftOffY * 0.42 * remain * sMul + Math.cos(spiralAng + i) * 1.4 * remain * sMul;
              const [sx, sy] = clampInDisc(state.targetX + ox, state.targetY + oy, hx, hy, partSafeR);

              const targetZ = i * stepZ;
              const startZ = targetZ + M35_SKY7_CONFIG.dropStartExtra * sMul;
              const settle = Math.sin(u * Math.PI) * 0.25 * remain * sMul;
              const rawLift = lerp(startZ, targetZ, e) + settle;
              const safeLift = (prevLift < 0) ? Math.max(0, rawLift) : Math.max(rawLift, prevLift + 0.55 * sMul);

              sl.visible = true;
              sl.x = sx;
              sl.y = sy;
              sl.lift = safeLift;
              sl.ro = wrapAngle(state.targetYaw + sl.baseYaw + remain * 1.8 * (i % 2 === 0 ? 1 : -1));
              sl.bias = i * M35_SKY7_CONFIG.biasStep;
              prevLift = safeLift;
            }

            state.shadowScale = clamp(0.32 + (landedCount / N) * 0.68, 0.32, 1.0);
            if (landedCount > 0) {
              footContacts.push({ x: state.targetX, y: state.targetY, z: 0, r: 14.5 * sMul * (landedCount / N) });
            }
          }

          // 挂点同步（柱顶）
          const topSl = slabs[N - 1];
          sockets.setWorld('crown', topSl.x, topSl.y, topSl.lift + M35_SKY7_CONFIG.slabHeight * sMul, state.yaw);
        },

        buildPartList() {
          const list = [];
          for (let i = 0; i < slabs.length; i++) {
            const sl = slabs[i];
            if (!sl.visible) continue;
            list.push({
              partKey: sl.assetKey,
              asset: parts[sl.assetKey],
              x: sl.x,
              y: sl.y,
              lift: sl.lift,
              ro: sl.ro,
              symDeg: 45,
              bias: sl.bias
            });
          }
          return list;
        },

        exportManifest(params) {
          return {
            id: Sky7SheetStackDef.id,
            code: Sky7SheetStackDef.code,
            name: Sky7SheetStackDef.name,
            status: Sky7SheetStackDef.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            phase: state.phase,
            slabCount: M35_SKY7_CONFIG.slabCount,
            slabStepZ: M35_SKY7_CONFIG.slabStepZ,
            biasStep: M35_SKY7_CONFIG.biasStep,
            footRadius: Sky7SheetStackDef.footRadius,
            headZ: Math.round((M35_SKY7_CONFIG.slabCount - 1) * M35_SKY7_CONFIG.slabStepZ + M35_SKY7_CONFIG.slabHeight),
            centerZ: Math.round(((M35_SKY7_CONFIG.slabCount - 1) * M35_SKY7_CONFIG.slabStepZ) * 0.5),
            blocks: Sky7SheetStackDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map((k) => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sky7SheetStackDef);
})(window.PixelWorkshop);
