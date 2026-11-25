'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T01 高空云海 · 厚云绒台与孢子绒团
  //
  // 生态定位：T01 全部生物的食物底座（厚云团能站脚，云顶长满会结孢子的暖金/浅桃云绒）
  // 拆件与图集预算（单盒严格 <= 40 格，0 自亮键，0 常态拉伸）：
  //   - cloudCore  (34×30×12, lift=4)：承重主浮云岛（多层错叠雪白/浅天蓝/淡蓝灰，留立体轮廓）
  //   - cloudSideA (22×20×10, lift=3)：左侧承重厚云团（留轮廓）
  //   - cloudSideB (22×18×10, lift=3)：右侧承重厚云团（留轮廓）
  //   - cloudCrown (20×18×11, lift=6)：后方高耸厚云顶（留轮廓）
  //   - fluffBig   (12×12×8,  复用 ×3)：云顶大簇暖金/浅桃孢子绒团（强对比食物层）
  //   - fluffSmall (9×9×7,    复用 ×2)：云顶小簇孢子绒团
  //   - wispA      (18×14×5,  noOutline: true, opacity: 0.65)：底层慢漂散云缕 A
  //   - wispB      (14×12×4,  noOutline: true, opacity: 0.65)：底层慢漂散云缕 B
  //
  // 展示动作：
  //   - idle       ：厚云缓慢上下沉浮，云绒随气流轻颤、偶有金色孢子微粒随风飘起
  //   - spore_gust ：loop: false, duration: 2.4；高空上升气流吹过，整座云台轻抬、绒团抖出一大片金白孢子粒漫天飘散
  // =========================================================================

  // 21 色独立色表（<= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 厚云底腹淡蓝灰（与 T01 浅蓝云海地台拉开立体沉降层次）
      cloudBaseDark: '#4f6e96',
      cloudBaseMid:  '#7598c2',
      cloudBaseHi:   '#a3c2e3',
      // 承重云体浅天蓝过渡
      cloudMidDark:  '#8eb5de',
      cloudMidMid:   '#bedbf7',
      cloudMidHi:    '#e6f3ff',
      // 云顶雪白蓬松冠
      cloudTopDark:  '#c8dff2',
      cloudTopMid:   '#eaf5ff',
      cloudTopHi:    '#ffffff',
      // 底层薄半透散云
      wispDark:      '#9ebde0',
      wispMid:       '#cde3f7',
      wispHi:        '#f2f9ff',
      // 云绒孢子暖金主团（与蓝白云海高对比！）
      goldDark:      '#c47510',
      goldMid:       '#f5b324',
      goldHi:        '#ffeb78',
      // 浅桃孢子绒球点缀
      peachDark:     '#cc5d3b',
      peachMid:      '#fa936e',
      peachHi:       '#ffd1b5',
      // 绒团根部薄荷青托叶（切开白雪与暖金的视觉边缘）
      stemDark:      '#2b8068',
      stemMid:       '#4cb593',
      stemHi:        '#8de6c6'
    },
    glowKeys: [],
    parts: ['cloudBase', 'cloudMid', 'cloudTop', 'wisp', 'gold', 'peach', 'stem'],
    noCrease: [
      ['cloudBase', 'cloudMid'],
      ['cloudMid', 'cloudTop'],
      ['gold', 'peach'],
      ['gold', 'stem'],
      ['peach', 'stem']
    ],
    materials: {
      cloudBase: ['cloudBaseDark', 'cloudBaseMid', 'cloudBaseHi'],
      cloudMid:  ['cloudMidDark',  'cloudMidMid',  'cloudMidHi'],
      cloudTop:  ['cloudTopDark',  'cloudTopMid',  'cloudTopHi'],
      wisp:      ['wispDark',      'wispMid',      'wispHi'],
      gold:      ['goldDark',      'goldMid',      'goldHi'],
      peach:     ['peachDark',     'peachMid',     'peachHi'],
      stem:      ['stemDark',      'stemMid',      'stemHi']
    },
    protectedParts: ['gold', 'peach', 'cloudTop']
  });

  // 3 套天色换皮（晴白金绒 / 朝霞桃绒 / 薄暮靛绒）
  const SKINS = [
    {
      id: 'sunny_gold_fluff',
      name: '晴白金绒',
      dot: '#f5b324',
      outline: '#273c59',
      pal: {},
      fx: { sporeA: '#ffeb78', sporeB: '#f5b324', sporeC: '#ffffff', mist: '#dceeff' }
    },
    {
      id: 'dawn_peach_fluff',
      name: '朝霞桃绒',
      dot: '#f78a72',
      outline: '#4a2936',
      pal: {
        cloudBaseDark: '#7a526e', cloudBaseMid: '#a87694', cloudBaseHi: '#d4a3bc',
        cloudMidDark:  '#c78fa2', cloudMidMid:  '#ebbcc7', cloudMidHi:  '#ffe3e8',
        cloudTopDark:  '#f0cbd0', cloudTopMid:  '#ffebed', cloudTopHi:  '#fff9fa',
        wispDark:      '#d9a7b8', wispMid:      '#f5cfd9', wispHi:      '#fff0f4',
        goldDark:      '#cc662b', goldMid:      '#ff9a52', goldHi:      '#ffdca3',
        peachDark:     '#bd3b4b', peachMid:     '#f26d7d', peachHi:     '#ffc2cb',
        stemDark:      '#66783b', stemMid:      '#96ad58', stemHi:      '#cde38a'
      },
      fx: { sporeA: '#ffdca3', sporeB: '#f26d7d', sporeC: '#fff9fa', mist: '#ffe3e8' }
    },
    {
      id: 'dusk_indigo_fluff',
      name: '薄暮靛绒',
      dot: '#6d78c9',
      outline: '#161b38',
      pal: {
        cloudBaseDark: '#2a3361', cloudBaseMid: '#43518c', cloudBaseHi: '#697ab8',
        cloudMidDark:  '#5869a8', cloudMidMid:  '#8597d4', cloudMidHi:  '#bcc9f2',
        cloudTopDark:  '#9aa9db', cloudTopMid:  '#cbd5f7', cloudTopHi:  '#edf1ff',
        wispDark:      '#6878b5', wispMid:      '#96a6de', wispHi:      '#d5defa',
        goldDark:      '#c48414', goldMid:      '#f5c238', goldHi:      '#fff08c',
        peachDark:     '#9c4c87', peachMid:     '#d97ec0', peachHi:     '#ffc4ee',
        stemDark:      '#246e78', stemMid:      '#3fa6b0', stemHi:      '#82e3eb'
      },
      fx: { sporeA: '#fff08c', sporeB: '#d97ec0', sporeC: '#edf1ff', mist: '#bcc9f2' }
    }
  ];

  // 辅助：用多球体拼出厚实蓬松云团，按高度自然分层着色（底蓝灰 -> 中天蓝 -> 顶雪白）
  function paintCloudPuffGroup(m, spheres) {
    const { mat, partId } = SPEC;
    const hw = (m.w - 1) * 0.5;
    const hd = (m.d - 1) * 0.5;
    for (let z = 0; z < m.h; z++) {
      for (let y = 0; y < m.d; y++) {
        const Y = y - hd;
        for (let x = 0; x < m.w; x++) {
          const X = x - hw;
          let inside = false;
          let maxRelZ = -9;
          for (let i = 0; i < spheres.length; i++) {
            const [sx, sy, sz, rx, ry, rz] = spheres[i];
            const dx = (X - sx) / rx;
            const dy = (Y - sy) / ry;
            const dz = (z - sz) / rz;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 <= 1.0) {
              inside = true;
              const relZ = (z - (sz - rz)) / (2 * rz);
              if (relZ > maxRelZ) maxRelZ = relZ;
            }
          }
          if (!inside) continue;
          const wave = Math.sin(X * 0.35 + Y * 0.28) * 0.08;
          const hRatio = (z / Math.max(1, m.h - 1)) * 0.65 + maxRelZ * 0.35 + wave;
          if (hRatio < 0.36) {
            m.setRaw(x, y, z, mat('cloudBase'), partId.cloudBase);
          } else if (hRatio < 0.68) {
            m.setRaw(x, y, z, mat('cloudMid'), partId.cloudMid);
          } else {
            m.setRaw(x, y, z, mat('cloudTop'), partId.cloudTop);
          }
        }
      }
    }
  }

  // 1. 承重主浮云岛（34×30×12）：平坦厚实可站脚，边缘多团蓬松鼓包
  function buildCloudCore(makeCanvas) {
    const m = new VoxelModel(34, 30, 12, SPEC);
    paintCloudPuffGroup(m, [
      [  0.0,  0.0, 5.2, 12.5, 10.5, 5.2],
      [ -9.0,  4.2, 4.8,  7.4,  6.8, 4.6],
      [  9.2,  3.6, 5.0,  7.6,  6.6, 4.6],
      [ -8.2, -5.8, 5.4,  7.2,  6.4, 4.8],
      [  8.4, -5.2, 5.2,  7.2,  6.5, 4.6],
      [  0.0,  7.8, 4.5,  7.8,  5.6, 4.2],
      [  0.2, -7.6, 5.4,  7.6,  5.8, 4.6],
      [  0.0,  0.0, 7.2, 10.2,  8.4, 3.8]
    ]);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 15.0, headZ: 12, centerZ: 6 });
  }

  // 2. 左侧承重厚云团（22×20×10）
  function buildCloudSideA(makeCanvas) {
    const m = new VoxelModel(22, 20, 10, SPEC);
    paintCloudPuffGroup(m, [
      [  0.0,  0.0, 4.6, 8.2, 7.2, 4.4],
      [ -4.8,  2.8, 4.2, 5.4, 4.8, 3.8],
      [  4.6, -2.6, 4.8, 5.6, 5.0, 4.2],
      [ -1.2, -4.0, 4.4, 5.2, 4.6, 3.8]
    ]);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 9.5, headZ: 10, centerZ: 5 });
  }

  // 3. 右侧承重厚云团（22×18×10）
  function buildCloudSideB(makeCanvas) {
    const m = new VoxelModel(22, 18, 10, SPEC);
    paintCloudPuffGroup(m, [
      [  0.0,  0.0, 4.6, 8.0, 6.8, 4.4],
      [  5.0,  2.4, 4.2, 5.2, 4.6, 3.8],
      [ -4.4, -2.2, 5.0, 5.6, 4.8, 4.2],
      [  1.5, -3.6, 4.5, 5.0, 4.4, 3.8]
    ]);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 9.2, headZ: 10, centerZ: 5 });
  }

  // 4. 后方高耸厚云顶（20×18×11）
  function buildCloudCrown(makeCanvas) {
    const m = new VoxelModel(20, 18, 11, SPEC);
    paintCloudPuffGroup(m, [
      [  0.0,  0.0, 5.0, 7.6, 6.6, 5.0],
      [ -4.2,  1.8, 4.6, 4.8, 4.5, 4.2],
      [  4.4,  1.4, 4.8, 4.8, 4.4, 4.4],
      [  0.0, -2.0, 6.6, 5.4, 4.8, 3.8]
    ]);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 8.6, headZ: 11, centerZ: 5 });
  }

  // 5. 大簇暖金/浅桃云绒孢子团（12×12×8，复用 ×3）
  function buildFluffBig(makeCanvas) {
    const m = new VoxelModel(12, 12, 8, SPEC);
    const { mat, partId } = SPEC;
    // 底部薄荷青托叶圈，和白云拉开清晰边界
    m.paintEllipsoid(0, 0, 1.3, 4.8, 4.6, 1.4, mat('stem'), partId.stem, true);
    // 5 颗毛茸茸错落暖金与浅桃孢子绒球
    m.paintEllipsoid( 0.0,  0.0, 4.4, 3.2, 3.1, 2.8, mat('gold'),  partId.gold,  true);
    m.paintEllipsoid(-3.0,  1.8, 3.2, 2.4, 2.3, 2.1, mat('peach'), partId.peach, true);
    m.paintEllipsoid( 3.0,  1.4, 3.4, 2.4, 2.3, 2.2, mat('gold'),  partId.gold,  true);
    m.paintEllipsoid(-2.2, -2.4, 3.5, 2.3, 2.2, 2.1, mat('gold'),  partId.gold,  true);
    m.paintEllipsoid( 2.4, -2.2, 3.1, 2.2, 2.1, 2.0, mat('peach'), partId.peach, true);
    // 顶部冒尖小孢子苞
    m.paintEllipsoid( 0.2,  0.0, 6.6, 1.4, 1.4, 1.2, mat('peach'), partId.peach, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.0, headZ: 8, centerZ: 4 });
  }

  // 6. 小簇云绒孢子团（9×9×7，复用 ×2）
  function buildFluffSmall(makeCanvas) {
    const m = new VoxelModel(9, 9, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 1.1, 3.4, 3.3, 1.2, mat('stem'), partId.stem, true);
    m.paintEllipsoid( 0.0,  0.0, 3.5, 2.4, 2.4, 2.2, mat('gold'),  partId.gold,  true);
    m.paintEllipsoid(-2.0,  1.4, 2.6, 1.8, 1.8, 1.7, mat('peach'), partId.peach, true);
    m.paintEllipsoid( 2.0, -1.2, 2.7, 1.8, 1.8, 1.7, mat('gold'),  partId.gold,  true);
    m.paintEllipsoid( 0.0,  0.2, 5.4, 1.2, 1.2, 1.1, mat('gold'),  partId.gold,  true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: 7, centerZ: 3 });
  }

  // 7. 底层薄半透散云缕 A（18×14×5，noOutline: true, opacity: 0.65）
  function buildWispA(makeCanvas) {
    const m = new VoxelModel(18, 14, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid( 0.0,  0.0, 2.0, 6.8, 4.2, 1.8, mat('wisp'), partId.wisp, true);
    m.paintEllipsoid(-5.2,  1.6, 1.8, 3.6, 3.2, 1.4, mat('wisp'), partId.wisp, true);
    m.paintEllipsoid( 5.4, -1.4, 2.0, 3.8, 3.0, 1.5, mat('wisp'), partId.wisp, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 7.5, headZ: 5, centerZ: 2 });
  }

  // 8. 底层薄半透散云缕 B（14×12×4，noOutline: true, opacity: 0.65）
  function buildWispB(makeCanvas) {
    const m = new VoxelModel(14, 12, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid( 0.0,  0.0, 1.6, 5.2, 3.6, 1.5, mat('wisp'), partId.wisp, true);
    m.paintEllipsoid( 3.6,  1.4, 1.5, 3.0, 2.6, 1.3, mat('wisp'), partId.wisp, true);
    m.paintEllipsoid(-3.4, -1.2, 1.6, 2.8, 2.5, 1.2, mat('wisp'), partId.wisp, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 6.0, headZ: 4, centerZ: 2 });
  }

  // 云顶 5 簇孢子绒团布点（覆盖主云岛、左右云团与后方云顶）
  const FLUFF_CLUSTERS = [
    { key: 'fluffBig',   lx: -2.0, ly:  1.2, baseZ: 14.2, ro: 0.25, ph: 0.0, bias: 0.42 },
    { key: 'fluffBig',   lx:  8.8, ly:  2.4, baseZ: 12.6, ro: 1.45, ph: 1.3, bias: 0.36 },
    { key: 'fluffBig',   lx: -9.6, ly: -1.4, baseZ: 12.4, ro: 2.60, ph: 2.6, bias: 0.34 },
    { key: 'fluffSmall', lx:  2.2, ly: -7.6, baseZ: 15.8, ro: 0.85, ph: 3.8, bias: 0.28 },
    { key: 'fluffSmall', lx: -4.2, ly:  7.2, baseZ: 12.2, ro: 4.10, ph: 5.0, bias: 0.48 }
  ];

  const Def = {
    id: 'scene_t01_fluff_cloud',
    code: 'T01',
    name: '厚云绒台与孢子绒团',
    status: 'done',
    defaultHabitat: 'sky',
    tag: 'T01 高空云海食物底座 · 承重浮云岛',
    summary: '4 团高低错落、厚实蓬松的承重白云体素块拼成可站脚的浮云岛，云顶长满 5 簇暖金/浅桃色云绒孢子团（T01 原住民食物底座），底层飘着 2 缕薄半透无描边散云慢速飘移',
    footRadius: 19.0,
    ecoWeight: 2.4,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',       name: '浮云沉浮吐绒', loop: true,  status: 'done' },
      { id: 'spore_gust', name: '上升气流漫天散孢', loop: false, duration: 2.4, status: 'done' }
    ],
    blocks: [
      '4 团高低错落承重厚云台（蓝灰底/天蓝腹/雪白冠）',
      '5 簇高对比暖金浅桃孢子绒团',
      '2 缕底层无描边半透慢漂散云（opacity 0.65）'
    ],
    soulHabit: '在高空云海中缓慢上下沉浮，云顶绒团随气流轻颤并偶有飘起金色孢子粒；遇上升气流时整座云台轻抬，抖出一大片金白孢子漫天飘散',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        cloudCore:  buildCloudCore(makeCanvas),
        cloudSideA: buildCloudSideA(makeCanvas),
        cloudSideB: buildCloudSideB(makeCanvas),
        cloudCrown: buildCloudCrown(makeCanvas),
        fluffBig:   buildFluffBig(makeCanvas),
        fluffSmall: buildFluffSmall(makeCanvas),
        wispA:      buildWispA(makeCanvas),
        wispB:      buildWispB(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        time: 0,
        bobZ: 0,
        gustLift: 0,
        fluffShake: 0,
        sporeCd: 0.65,
        lastAction: 'idle',
        gustBurstStep: 0
      };

      let curSkin = SKINS[0];

      const instance = {
        def: Def,
        parts,
        partListAssets: Object.values(parts),
        state,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(x, y, yaw) {
          state.x = x;
          state.y = y;
          state.z = 0;
          state.yaw = yaw;
          state.time = 0;
          state.bobZ = 0;
          state.gustLift = 0;
          state.fluffShake = 0;
          state.sporeCd = 0.55;
          state.lastAction = 'idle';
          state.gustBurstStep = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          state.time = time;
          if (action !== state.lastAction) {
            state.lastAction = action;
            state.gustBurstStep = 0;
          }

          // 基础缓慢上下沉浮
          state.bobZ = Math.sin(time * 1.15 * gFreq) * 1.15;

          if (action === 'spore_gust') {
            const u = clamp(actionTime / 2.4, 0, 1);
            // 先顺气流轻抬，中段绒团疾颤，后段平稳回落
            const liftArc = Math.sin(smoothstep(0, 0.42, u) * Math.PI * 0.5) * (1 - smoothstep(0.55, 1.0, u));
            state.gustLift = liftArc * 3.6;
            const shakeEnv = smoothstep(0.08, 0.25, u) * (1 - smoothstep(0.65, 0.95, u));
            state.fluffShake = shakeEnv;

            // 分 4 波抖出一大片金白孢子粒漫天飘散
            const waveTimes = [0.22, 0.52, 0.88, 1.28];
            while (state.gustBurstStep < waveTimes.length && actionTime >= waveTimes[state.gustBurstStep]) {
              if (vfx) {
                const count = state.gustBurstStep < 2 ? 12 : 9;
                for (let k = 0; k < count; k++) {
                  const fc = FLUFF_CLUSTERS[(k + state.gustBurstStep) % FLUFF_CLUSTERS.length];
                  const [wx, wy] = localToWorldXY(
                    state.x, state.y, state.yaw,
                    (fc.lx + (Math.random() - 0.5) * 6.0) * sMul,
                    (fc.ly + (Math.random() - 0.5) * 6.0) * sMul
                  );
                  const ang = Math.random() * TAU;
                  const driftSpd = (6.0 + Math.random() * 11.0) * sMul;
                  const col = k % 3 === 0 ? fx.sporeC : (k % 2 === 0 ? fx.sporeA : fx.sporeB);
                  vfx.spawnParticle(
                    wx, wy,
                    (fc.baseZ + state.bobZ + state.gustLift + 2.0 + Math.random() * 2.5) * sMul,
                    Math.cos(ang) * driftSpd + 4.5 * sMul,
                    Math.sin(ang) * driftSpd * 0.65,
                    (7.5 + Math.random() * 7.5) * sMul,
                    1.25 + Math.random() * 0.65,
                    k % 3 === 0 ? 1.35 : 1.15,
                    col,
                    false,
                    2.4
                  );
                }
              }
              state.gustBurstStep++;
            }
          } else {
            state.gustLift = lerp(state.gustLift, 0, clamp(dt * 4.5, 0, 1));
            state.fluffShake = lerp(state.fluffShake, 0, clamp(dt * 6.0, 0, 1));

            // 待机时偶有金色孢子微粒随风飘起
            state.sporeCd -= dt;
            if (state.sporeCd <= 0 && vfx) {
              state.sporeCd = 0.62 + Math.random() * 0.55;
              const fc = FLUFF_CLUSTERS[Math.floor(Math.random() * FLUFF_CLUSTERS.length)];
              const [wx, wy] = localToWorldXY(
                state.x, state.y, state.yaw,
                (fc.lx + (Math.random() - 0.5) * 4.5) * sMul,
                (fc.ly + (Math.random() - 0.5) * 4.5) * sMul
              );
              const a = Math.random() * TAU;
              vfx.spawnParticle(
                wx, wy,
                (fc.baseZ + state.bobZ + 2.2) * sMul,
                (2.2 + Math.cos(a) * 2.4) * sMul,
                Math.sin(a) * 1.8 * sMul,
                (3.6 + Math.random() * 2.6) * sMul,
                1.35 + Math.random() * 0.55,
                1.10,
                Math.random() < 0.7 ? fx.sporeA : fx.sporeC,
                false,
                0.6
              );
            }
          }

          state.z = Math.max(0, (3.2 + state.bobZ + state.gustLift) * sMul);
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.time;
          const cx = state.x;
          const cy = state.y;
          const zShift = state.bobZ + state.gustLift;
          const list = [];

          // 1. 底层 2 缕薄半透无描边散云慢速飘移（noOutline: true, opacity: 0.65）
          const w1Lx = -9.5 + Math.sin(t * 0.62) * 3.8;
          const w1Ly =  6.8 + Math.cos(t * 0.48) * 2.2;
          const [w1x, w1y] = localToWorldXY(cx, cy, yw, w1Lx * sMul, w1Ly * sMul);
          list.push({
            partKey: 'wispA',
            asset: parts.wispA,
            x: w1x,
            y: w1y,
            lift: Math.max(0.2, (1.2 + Math.sin(t * 0.9) * 0.5 + state.gustLift * 0.45) * sMul),
            ro: wrapAngle(yw + 0.18),
            opacity: 0.65,
            noOutline: true,
            bias: -0.95
          });

          const w2Lx = 10.6 + Math.cos(t * 0.54 + 1.4) * 3.6;
          const w2Ly = -5.6 + Math.sin(t * 0.44 + 1.4) * 2.0;
          const [w2x, w2y] = localToWorldXY(cx, cy, yw, w2Lx * sMul, w2Ly * sMul);
          list.push({
            partKey: 'wispB',
            asset: parts.wispB,
            x: w2x,
            y: w2y,
            lift: Math.max(0.2, (1.8 + Math.cos(t * 0.85 + 1.1) * 0.5 + state.gustLift * 0.45) * sMul),
            ro: wrapAngle(yw - 0.35),
            opacity: 0.65,
            noOutline: true,
            bias: -0.90
          });

          // 2. 四团错落厚实承重白云体素块（保留立体轮廓防糊成白块）
          const [saX, saY] = localToWorldXY(cx, cy, yw, -11.4 * sMul, -1.6 * sMul);
          list.push({
            partKey: 'cloudSideA',
            asset: parts.cloudSideA,
            x: saX,
            y: saY,
            lift: Math.max(0.5, (3.2 + zShift + Math.sin(t * 1.3 + 1.1) * 0.25) * sMul),
            ro: wrapAngle(yw + 0.12),
            bias: -0.22
          });

          const [sbX, sbY] = localToWorldXY(cx, cy, yw, 11.2 * sMul, 2.2 * sMul);
          list.push({
            partKey: 'cloudSideB',
            asset: parts.cloudSideB,
            x: sbX,
            y: sbY,
            lift: Math.max(0.5, (3.5 + zShift + Math.cos(t * 1.25 + 0.6) * 0.25) * sMul),
            ro: wrapAngle(yw - 0.16),
            bias: -0.18
          });

          const [crX, crY] = localToWorldXY(cx, cy, yw, 1.8 * sMul, -8.2 * sMul);
          list.push({
            partKey: 'cloudCrown',
            asset: parts.cloudCrown,
            x: crX,
            y: crY,
            lift: Math.max(0.8, (5.8 + zShift + Math.sin(t * 1.1 + 2.2) * 0.28) * sMul),
            ro: wrapAngle(yw + 0.08),
            bias: -0.15
          });

          list.push({
            partKey: 'cloudCore',
            asset: parts.cloudCore,
            x: cx,
            y: cy,
            lift: Math.max(0.6, (4.0 + zShift) * sMul),
            ro: yw,
            bias: -0.05
          });

          // 3. 云顶 5 簇高对比暖金/浅桃孢子绒团（随气流轻颤，gust 时高频疾抖）
          for (let i = 0; i < FLUFF_CLUSTERS.length; i++) {
            const fc = FLUFF_CLUSTERS[i];
            const quiver = Math.sin(t * 3.6 + fc.ph) * 0.18 + Math.sin(t * 24.0 + fc.ph * 2.1) * state.fluffShake * 0.62;
            const rotJit = Math.sin(t * 2.8 + fc.ph) * 0.06 + Math.cos(t * 21.0 + fc.ph) * state.fluffShake * 0.18;
            const [fx, fy] = localToWorldXY(
              cx, cy, yw,
              (fc.lx + quiver) * sMul,
              (fc.ly + quiver * 0.5) * sMul
            );
            list.push({
              partKey: `${fc.key}_${i}`,
              asset: parts[fc.key],
              x: fx,
              y: fy,
              lift: Math.max(1.0, (fc.baseZ + zShift + Math.abs(quiver) * 0.45) * sMul),
              ro: wrapAngle(yw + fc.ro + rotJit),
              bias: fc.bias
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id,
            code: Def.code,
            name: Def.name,
            status: Def.status,
            skin: curSkin.id,
            footRadius: Def.footRadius,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(Def, 'scene');
})(window.PixelWorkshop);
