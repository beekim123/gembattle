'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T06 远洋强对比地标 · 远洋海蚀礁柱与岩巢（T06 远洋浮岛海域）
  //
  // 外观与视觉铁律：
  //   - 底细顶宽、经浪花长年拍蚀的深黑青玄武岩海蚀石柱（分基礁 + 上岩顶两段）
  //   - 基礁浸水（submerge: 0.36）带一圈雪白藤壶与拍岸白沫浪环
  //   - 岩顶长着迎风招展的鲜绿海蓬草 + 浅黄枯枝海鸟巢（窝里清晰卧着两枚斑点蓝鸟蛋）
  //
  // 拆件与图集预算（单盒严格 <= 40 格，0 自亮键）：
  //   - surfRing  (28×28×4,  lift=0.6,  bias=-0.18, opacity: 0.85, symDeg: 90)：拍岸白沫浪环
  //   - reefBase  (24×24×18, lift=0,    bias=-0.08, submerge: 0.36)：海蚀基礁与白色藤壶群
  //   - reefCrown (28×26×17, lift=14.5, bias=+0.06)：外扩玄武上岩顶平台
  //   - seaGrass  (14×14×10, lift=29.0, bias=+0.16)：岩顶鲜绿摇曳海蓬草簇
  //   - birdNest  (14×14×9,  lift=29.0, bias=+0.20)：浅黄枯枝海鸟巢与两枚斑点蓝鸟蛋
  //
  // 展示动作：
  //   - idle       ：海浪周期性拍打礁底溅出雪白浪花与环礁水涟漪，岩顶海草摇曳
  //   - wave_crash ：远洋大涌拍上礁柱，激起高扬白沫水花簇并轻轻撼动海草
  // =========================================================================

  // 21 色独立色表（<= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 深黑青玄武海蚀岩
      rockDark:     '#142129',
      rockMid:      '#273e4a',
      rockHi:       '#456575',
      // 浸水湿岩与白色藤壶
      barnDark:     '#8c99a1',
      barnMid:      '#c4d0d6',
      barnHi:       '#eff6fa',
      // 拍岸雪白浪沫
      foamDark:     '#9ec9db',
      foamMid:      '#d4eef7',
      foamHi:       '#ffffff',
      // 岩顶迎风鲜绿海蓬草
      grassDark:    '#1c692c',
      grassMid:     '#38ad48',
      grassHi:      '#7ae36d',
      // 浅黄枯枝编织海鸟巢
      nestDark:     '#7d5c2e',
      nestMid:      '#bd9450',
      nestHi:       '#ebd08c',
      // 巢中斑点蓝鸟蛋
      eggDark:      '#3786ab',
      eggMid:       '#69c3e6',
      eggHi:        '#b5ecff',
      // 鸟蛋深蓝斑点
      spotDark:     '#123452',
      spotMid:      '#1e4f78',
      spotHi:       '#2f6c9c'
    },
    glowKeys: [],
    parts: ['rock', 'barn', 'foam', 'grass', 'nest', 'egg', 'spot'],
    noCrease: [
      ['rock', 'barn'], ['nest', 'egg'], ['egg', 'spot']
    ],
    materials: {
      rock:  ['rockDark',  'rockMid',  'rockHi'],
      barn:  ['barnDark',  'barnMid',  'barnHi'],
      foam:  ['foamDark',  'foamMid',  'foamHi'],
      grass: ['grassDark', 'grassMid', 'grassHi'],
      nest:  ['nestDark',  'nestMid',  'nestHi'],
      egg:   ['eggDark',   'eggMid',   'eggHi'],
      spot:  ['spotDark',  'spotMid',  'spotHi']
    },
    protectedParts: ['egg', 'spot', 'barn']
  });

  // 3 套零重建模换色皮肤（玄武黑礁 / 灰白钙礁 / 赤褐火山礁）
  const SKINS = [
    {
      id: 'basalt_black_reef',
      name: '玄武黑礁',
      dot: '#273e4a',
      outline: '#0b141a',
      pal: {},
      fx: {
        foamA: '#ffffff',
        foamB: '#d4eef7',
        mistA: '#9ec9db',
        leafA: '#38ad48'
      }
    },
    {
      id: 'pale_chalk_reef',
      name: '灰白钙礁',
      dot: '#b8c4cc',
      outline: '#1f2830',
      pal: {
        rockDark: '#697680', rockMid: '#9aa7b0', rockHi: '#ced9e0',
        barnDark: '#7a7567', barnMid: '#b5afa0', barnHi: '#e3dfd3',
        grassDark:'#21703a', grassMid:'#3fb85e', grassHi:'#82eb89',
        nestDark: '#876335', nestMid: '#c79c5a', nestHi: '#f2d99b'
      },
      fx: {
        foamA: '#ffffff',
        foamB: '#d4eef7',
        mistA: '#9ec9db',
        leafA: '#3fb85e'
      }
    },
    {
      id: 'rust_volcanic_reef',
      name: '赤褐火山礁',
      dot: '#8f3f2c',
      outline: '#1f0f0c',
      pal: {
        rockDark: '#3d1c16', rockMid: '#6e3124', rockHi: '#a6503c',
        barnDark: '#9c8f82', barnMid: '#cfc4b6', barnHi: '#f5ede4',
        grassDark:'#276e24', grassMid:'#4eb03c', grassHi:'#93e366',
        eggDark:  '#2e8a9c', eggMid:  '#5bc7d9', eggHi:  '#a8f2fa'
      },
      fx: {
        foamA: '#ffffff',
        foamB: '#d4eef7',
        mistA: '#9ec9db',
        leafA: '#4eb03c'
      }
    }
  ];

  // =========================================================================
  // 1. 拍岸白沫浪环（28×28×4，symDeg: 90）
  // =========================================================================
  function buildSurfRing(makeCanvas) {
    const m = new VoxelModel(28, 28, 4, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-13.2, 13.2, -13.2, 13.2, 0, 3, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const rIn = 7.4 + Math.sin(ang * 4) * 0.7;
      const rOut = 11.4 + Math.cos(ang * 4) * 1.1;
      if (r < rIn || r > rOut) return;
      if (z === 0 || (z === 1 && r > rIn + 0.6 && r < rOut - 0.6)) {
        m.setRaw(x, y, z, mat('foam'), partId.foam);
      } else if (z === 2 && Math.abs(r - (rIn + rOut) * 0.5) < 1.1 && Math.sin(ang * 8) > 0.1) {
        m.setRaw(x, y, z, mat('foam'), partId.foam);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 12.5, headZ: 3, centerZ: 1 });
  }

  // =========================================================================
  // 2. 海蚀基礁与白色藤壶群（24×24×18，底阔→中腰细蚀→上托）
  // =========================================================================
  function buildReefBase(makeCanvas) {
    const m = new VoxelModel(24, 24, 18, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-11.2, 11.2, -11.2, 11.2, 0, 17, (x, y, z, X, Y) => {
      const t = z / 17;
      const ang = Math.atan2(Y, X);
      // 经典海蚀柱廓形：底座礁盘宽 9.2 → 中腰被浪淘蚀收窄至 5.4 → 上段微张承接岩顶
      let baseR;
      if (t < 0.35) {
        baseR = 9.2 - (t / 0.35) * 3.8;
      } else {
        baseR = 5.4 + ((t - 0.35) / 0.65) * 2.2;
      }
      // 玄武岩竖向棱柱刻槽与海蚀凹痕
      const flute = Math.cos(ang * 6 + t * 0.5) * 0.65 + Math.sin(z * 0.65) * 0.35;
      const r = Math.hypot(X * 1.05, Y * 0.95);
      if (r > baseR + flute) return;

      // 浪线附近（z=2..6）附着一圈清晰白色藤壶斑簇
      const onSurface = r > baseR + flute - 1.3;
      const isBarnacle = onSurface && z >= 2 && z <= 6 &&
        (Math.sin(ang * 7 + z * 1.4) > 0.38 || Math.cos(ang * 5 - z * 0.9) > 0.58);

      if (isBarnacle) {
        m.setRaw(x, y, z, mat('barn'), partId.barn);
      } else {
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      }
    });

    // 礁脚外凸两块湿滑碎岩肩
    m.paintEllipsoid(-7.2,  3.8, 2.2, 3.4, 2.8, 2.2, mat('rock'), partId.rock, true);
    m.paintEllipsoid( 6.8, -4.2, 2.0, 3.2, 2.6, 2.0, mat('rock'), partId.rock, true);
    m.paintEllipsoid(-6.8,  4.8, 3.4, 1.5, 1.3, 0.9, mat('barn'), partId.barn, true);
    m.paintEllipsoid( 6.6, -3.2, 3.0, 1.4, 1.2, 0.9, mat('barn'), partId.barn, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 10.5, headZ: 17, centerZ: 8 });
  }

  // =========================================================================
  // 3. 外扩玄武上岩顶平台（28×26×17，上宽下窄倒悬海蚀顶）
  // =========================================================================
  function buildReefCrown(makeCanvas) {
    const m = new VoxelModel(28, 26, 17, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-13.2, 13.2, -12.2, 12.2, 0, 16, (x, y, z, X, Y) => {
      const t = z / 16;
      const ang = Math.atan2(Y, X);
      // 下端接基礁宽 7.4，中上段外扩成 11.8 宽阔岩冠平台，顶面略平坦供鸟巢与海草落脚
      let rx, ry;
      if (t < 0.65) {
        const k = smoothstep(0, 0.65, t);
        rx = 7.4 + k * 4.6;
        ry = 6.8 + k * 4.0;
      } else {
        const k = (t - 0.65) / 0.35;
        rx = 12.0 - k * 1.4;
        ry = 10.8 - k * 1.3;
      }
      // 阶梯状风化层理与锐利岩棱
      const strata = Math.sin(z * 0.85) * 0.45 + Math.cos(ang * 5) * 0.75;
      const r = Math.hypot(X / (rx + strata), Y / (ry + strata * 0.85));
      if (r > 1.0) return;

      // 顶面外沿略高、内里稍平，留出一点浅白盐霜/海鸟白痕
      if (z >= 14 && r > 0.72 && Math.sin(ang * 3 + 0.8) > 0.45) {
        m.setRaw(x, y, z, mat('barn'), partId.barn);
      } else {
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      }
    });

    // 岩冠左侧一块略高的挡风礁棱
    m.paintEllipsoid(-6.2, -4.2, 14.2, 4.2, 3.4, 2.4, mat('rock'), partId.rock, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 11.5, headZ: 16, centerZ: 9 });
  }

  // =========================================================================
  // 4. 岩顶鲜绿摇曳海蓬草簇（14×14×10）
  // =========================================================================
  function buildSeaGrass(makeCanvas) {
    const m = new VoxelModel(14, 14, 10, SPEC);
    const { mat, partId } = SPEC;

    // 底座青绿草垫
    m.paintEllipsoid(0, 0, 1.4, 4.8, 4.4, 1.6, mat('grass'), partId.grass, true);

    // 7 束迎风微微斜挑的细长鲜绿海草叶片
    const blades = [
      [-2.2, -1.6, 1.4, -4.6, -2.8, 7.6],
      [-0.4, -2.2, 1.4, -1.2, -4.4, 8.8],
      [ 1.8, -1.4, 1.4,  4.2, -2.6, 7.4],
      [-2.6,  1.2, 1.4, -4.8,  2.4, 6.8],
      [ 0.2,  0.4, 1.6,  1.4,  0.8, 9.2],
      [ 2.4,  1.6, 1.4,  4.8,  3.2, 6.6],
      [-0.8,  2.4, 1.4, -1.6,  4.4, 7.0]
    ];
    for (const [ax, ay, az, bx, by, bz] of blades) {
      m.paintCapsule(ax, ay, az, bx, by, bz, 1.15, 0.65, mat('grass'), partId.grass, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.0, headZ: 9, centerZ: 4.5 });
  }

  // =========================================================================
  // 5. 浅黄枯枝海鸟巢与两枚斑点蓝鸟蛋（14×14×9）
  // =========================================================================
  function buildBirdNest(makeCanvas) {
    const m = new VoxelModel(14, 14, 9, SPEC);
    const { mat, partId } = SPEC;

    // 碗状编织枯枝鸟巢（外径 5.8，中间掏凹槽放鸟蛋）
    m.fillAABB(-6.4, 6.4, -6.4, 6.4, 0, 6, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const rOut = 5.6 + Math.sin(ang * 7 + z * 1.1) * 0.45;
      if (r > rOut) return;
      // z=0..1 实心巢底，z=2..5 碗壁（内部 r < 3.4 掏空）
      if (z <= 1) {
        m.setRaw(x, y, z, mat('nest'), partId.nest);
      } else if (z <= 4) {
        if (r >= 3.2) m.setRaw(x, y, z, mat('nest'), partId.nest);
      } else if (z === 5) {
        if (r >= 3.7 && Math.sin(ang * 9) > -0.25) m.setRaw(x, y, z, mat('nest'), partId.nest);
      }
    });

    // 几根翘出巢缘的细枯枝增生动感
    m.paintCapsule(3.8, 2.2, 3.0, 6.0, 3.8, 4.2, 0.7, 0.55, mat('nest'), partId.nest, true);
    m.paintCapsule(-3.6, -2.8, 2.8, -5.8, -4.0, 4.0, 0.7, 0.55, mat('nest'), partId.nest, true);

    // 窝里清晰卧着两枚饱满的斑点蓝鸟蛋！
    const eggs = [
      [-1.4, -0.5, 4.2],
      [ 1.7,  0.7, 4.1]
    ];
    for (const [ex, ey, ez] of eggs) {
      m.paintEllipsoid(ex, ey, ez, 1.85, 1.55, 2.35, mat('egg'), partId.egg, true);
    }
    // 两枚蓝蛋表面的深蓝斑点（逐颗点缀，保护不被去噪抹掉）
    const spots = [
      [-1.9, -1.2, 5.2], [-0.8, 0.2, 5.8], [-1.5, -0.4, 6.2],
      [ 1.2,  1.2, 5.1], [ 2.2, 0.2, 5.6], [ 1.7,  0.8, 6.1]
    ];
    for (const [sx, sy, sz] of spots) {
      m.paintEllipsoid(sx, sy, sz, 0.55, 0.55, 0.55, mat('spot'), partId.spot, true);
    }

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 6.0, headZ: 8, centerZ: 4 });
  }

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t06_sea_stack',
    code: 'T06',
    name: '远洋海蚀礁柱与岩巢',
    status: 'done',
    defaultHabitat: 'openSea',
    tag: 'T06 远洋高对比海蚀礁柱与海鸟栖巢',
    summary: '底细顶宽的深黑青玄武海蚀礁柱（基礁带浸水白色藤壶与拍岸浪环 + 外扩上岩顶），顶上配鲜绿海蓬草与浅黄枯枝海鸟巢（内卧两枚斑点蓝鸟蛋）',
    footRadius: 15.0,
    ecoWeight: 3.6,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',       name: '浪拍礁底草摇曳', loop: true,  status: 'done' },
      { id: 'wave_crash', name: '远洋大涌拍礁',   loop: false, duration: 2.2, status: 'done' }
    ],
    blocks: ['浸水藤壶玄武基礁', '外扩海蚀上岩顶', '鲜绿海蓬草与斑点蓝蛋鸟巢'],
    soulHabit: '海浪周期性拍打礁底溅出雪白浪花与环礁涟漪，岩顶海蓬草随海风摇曳；远洋大涌袭来时白沫水花簇高扬冲上礁腰并撼动岩顶海草',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        surfRing:  buildSurfRing(makeCanvas),
        reefBase:  buildReefBase(makeCanvas),
        reefCrown: buildReefCrown(makeCanvas),
        seaGrass:  buildSeaGrass(makeCanvas),
        birdNest:  buildBirdNest(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        surfLift: 0,
        surfRot: 0,
        grassSway: 0,
        grassShiftX: 0,
        waveClock: 1.1,
        lastAction: 'idle',
        crashFired: 0
      };

      let curSkin = SKINS[0];

      const instance = {
        def: Def,
        parts,
        partListAssets: Object.values(parts),
        state,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(x, y, yaw) {
          state.x = x;
          state.y = y;
          state.z = 0;
          state.yaw = yaw;
          state.surfLift = 0;
          state.surfRot = 0;
          state.grassSway = 0;
          state.grassShiftX = 0;
          state.waveClock = 1.0;
          state.lastAction = 'idle';
          state.crashFired = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.crashFired = 0;
          }

          // 基础海风海草摇曳 + 礁脚浪沫缓起缓落
          state.surfLift = Math.sin(time * 2.1 * gFreq) * 0.45 * sMul;
          state.surfRot = Math.sin(time * 0.85 * gFreq) * 0.08;
          state.grassSway = Math.sin(time * 2.6 * gFreq) * 0.14;
          state.grassShiftX = Math.sin(time * 2.6 * gFreq) * 0.35 * sMul;

          if (action === 'idle') {
            state.waveClock -= dt * gFreq;
            if (state.waveClock <= 0 && vfx) {
              state.waveClock = 1.45 + Math.random() * 0.85;
              vfx.addRipple(state.x, state.y, 9.5 * sMul, 18.5 * sMul, 1.4, 1.5);
              // 礁底一侧溅起几滴雪白浪花
              const ang = Math.random() * TAU;
              const sx = state.x + Math.cos(ang) * 9.5 * sMul;
              const sy = state.y + Math.sin(ang) * 9.5 * sMul;
              for (let k = 0; k < 5; k++) {
                const a = ang + (Math.random() - 0.5) * 1.1;
                const sp = (4.0 + Math.random() * 6.5) * sMul;
                vfx.spawnParticle(
                  sx, sy, (2.0 + Math.random() * 2.0) * sMul,
                  Math.cos(a) * sp, Math.sin(a) * sp, (6.0 + Math.random() * 6.0) * sMul,
                  0.52 + Math.random() * 0.25,
                  1.25,
                  k % 2 === 0 ? fx.foamA : fx.foamB,
                  false,
                  34
                );
              }
            }
          } else if (action === 'wave_crash') {
            const u = clamp(actionTime / 2.2, 0, 1);
            // 0~0.25 涌浪蓄高；0.25~0.50 狠狠拍上礁腰；0.50~1.0 回落余震
            const surge = Math.sin(clamp(u / 0.55, 0, 1) * Math.PI);
            state.surfLift = surge * 2.8 * sMul;
            const shakeEnv = u > 0.22 ? Math.exp(-(u - 0.22) * 5.2) : 0;
            state.grassSway = Math.sin(actionTime * 22.0 * gFreq) * 0.32 * shakeEnv;
            state.grassShiftX = Math.sin(actionTime * 22.0 * gFreq) * 0.9 * shakeEnv * sMul;

            const beats = [0.42, 0.72];
            while (state.crashFired < beats.length && actionTime >= beats[state.crashFired]) {
              if (vfx) {
                const isFirst = state.crashFired === 0;
                vfx.addRipple(state.x, state.y, 10.0 * sMul, (isFirst ? 24.5 : 20.0) * sMul, 1.5, isFirst ? 2.2 : 1.5);
                if (habitat && habitat.fx) vfx.spawnSplash(state.x, state.y, isFirst ? 14 : 8, isFirst ? 1.25 : 0.85, habitat.fx);

                // 高扬白沫水花簇冲上礁柱侧面
                const count = isFirst ? 18 : 10;
                for (let k = 0; k < count; k++) {
                  const a = Math.random() * TAU;
                  const rad = (7.5 + Math.random() * 3.0) * sMul;
                  const sp = (6.0 + Math.random() * 11.0) * sMul;
                  vfx.spawnParticle(
                    state.x + Math.cos(a) * rad,
                    state.y + Math.sin(a) * rad,
                    (3.5 + Math.random() * 8.0) * sMul,
                    Math.cos(a) * sp, Math.sin(a) * sp,
                    (12.0 + Math.random() * 11.5) * sMul,
                    0.68 + Math.random() * 0.38,
                    1.45 + Math.random() * 0.5,
                    k % 3 === 0 ? fx.mistA : (k % 2 === 0 ? fx.foamA : fx.foamB),
                    false,
                    44
                  );
                }
              }
              state.crashFired++;
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const list = [];

          // 1. 拍岸白沫浪环
          list.push({
            partKey: 'surfRing',
            asset: parts.surfRing,
            x: state.x,
            y: state.y,
            lift: Math.max(0.2, (0.6 * sMul) + state.surfLift),
            ro: wrapAngle(yw + state.surfRot),
            bias: -0.18,
            opacity: 0.85,
            symDeg: 90
          });

          // 2. 海蚀玄武基礁（浸水带白色藤壶）
          list.push({
            partKey: 'reefBase',
            asset: parts.reefBase,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            bias: -0.08,
            submerge: 0.36
          });

          // 3. 外扩上岩顶平台
          list.push({
            partKey: 'reefCrown',
            asset: parts.reefCrown,
            x: state.x,
            y: state.y,
            lift: 14.5 * sMul,
            ro: yw,
            bias: 0.06
          });

          // 4. 岩顶鲜绿海蓬草簇（迎风摇曳）
          const [gx, gy] = localToWorldXY(state.x, state.y, yw, (-4.4 * sMul) + state.grassShiftX, -2.6 * sMul);
          list.push({
            partKey: 'seaGrass',
            asset: parts.seaGrass,
            x: gx,
            y: gy,
            lift: 28.8 * sMul,
            ro: wrapAngle(yw + state.grassSway),
            bias: 0.16
          });

          // 5. 浅黄枯枝海鸟巢（卧着两枚斑点蓝鸟蛋）
          const [nx, ny] = localToWorldXY(state.x, state.y, yw, 3.6 * sMul, 2.2 * sMul);
          list.push({
            partKey: 'birdNest',
            asset: parts.birdNest,
            x: nx,
            y: ny,
            lift: 28.6 * sMul,
            ro: wrapAngle(yw - 0.12),
            bias: 0.20
          });

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
