'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T05 极地冰缝核心地貌 · 浮冰块与冰缝藻缘（T05 极地冰缝）
  //
  // 紧扣 T05「冰缝一张一合、冰下长藻垫」生态规矩：
  //   - 两块不规则多边形厚浮冰块隔着一条深靛海缝相对漂浮
  //   - 浸水底缘用 submerge: 0.55 染出海水浸没的厚重水下冰体
  //   - 缝沿水下透出一排鲜明翠绿/青绿冰下藻垫，在洁白冰面上辨识度拉满
  //
  // 拆件与图集预算（单盒严格 <= 40 格，0 自亮键）：
  //   - floeLeftBase  (24×30×8, lift=0, bias=-0.22, submerge: 0.55)：左浮冰水下厚冰基座
  //   - floeLeftTop   (22×28×9, lift=5, bias=+0.08)：左浮冰水上锐棱雪顶块
  //   - floeRightBase (22×28×8, lift=0, bias=-0.20, submerge: 0.55)：右浮冰水下厚冰基座
  //   - floeRightTop  (20×26×8, lift=5, bias=+0.10)：右浮冰水上锐棱雪顶块
  //   - algaeFringe   (10×24×5, lift=1, bias=-0.12, submerge: 0.42)：缝中翠绿冰下藻垫
  //   - iceBit        (7×7×5,   lift=1, bias=-0.06, symDeg: 90)：复用漂浮碎冰块 ×3
  //
  // 展示动作：
  //   - idle          ：两块浮冰随暗流缓慢微晃沉浮，缝面轻泛寒波
  //   - fissure_cycle ：演示冰缝开合——两块浮冰缓缓向两侧拉开露出宽阔深蓝藻缝并冒水波，
  //                     随后再缓缓靠拢冻合溅出碎冰花
  // =========================================================================

  // 15 色独立色表（<= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 纯白浮冰雪顶
      snowDark:  '#d0e7f2',
      snowMid:   '#eef8fc',
      snowHi:    '#ffffff',
      // 饱和冰青棱角切缘
      iceDark:   '#1a80a6',
      iceMid:    '#38bbe0',
      iceHi:     '#84ecff',
      // 深靛蓝水下厚冰与冷缝底
      deepDark:  '#0d2345',
      deepMid:   '#1c4578',
      deepHi:    '#326ead',
      // 缝沿鲜明翠绿冰下藻垫
      algaeDark: '#126b42',
      algaeMid:  '#24b36a',
      algaeHi:   '#62eb9c',
      // 缝口泛白寒沫冰渣
      frostDark: '#7bb5cc',
      frostMid:  '#b2deed',
      frostHi:   '#e0f5fc'
    },
    glowKeys: [],
    parts: ['snow', 'ice', 'deep', 'algae', 'frost'],
    noCrease: [
      ['snow', 'ice'], ['ice', 'deep'], ['ice', 'frost']
    ],
    materials: {
      snow:  ['snowDark',  'snowMid',  'snowHi'],
      ice:   ['iceDark',   'iceMid',   'iceHi'],
      deep:  ['deepDark',  'deepMid',  'deepHi'],
      algae: ['algaeDark', 'algaeMid', 'algaeHi'],
      frost: ['frostDark', 'frostMid', 'frostHi']
    },
    protectedParts: ['algae']
  });

  // 3 套零重建模换色皮肤（纯白浮冰 / 蓝晶厚冰 / 灰雪碎冰）
  const SKINS = [
    {
      id: 'pure_white_floe',
      name: '纯白浮冰',
      dot: '#eef8fc',
      outline: '#0c1c30',
      pal: {},
      fx: {
        sprayA: '#ffffff',
        sprayB: '#84ecff',
        chipA: '#38bbe0',
        algaeA: '#62eb9c'
      }
    },
    {
      id: 'blue_crystal_floe',
      name: '蓝晶厚冰',
      dot: '#38bbe0',
      outline: '#09182e',
      pal: {
        snowDark:  '#9dd8ed', snowMid: '#c9eef9', snowHi: '#ebfbff',
        iceDark:   '#126499', iceMid:  '#259bd4', iceHi:  '#66d9fa',
        deepDark:  '#091c3d', deepMid: '#153a70', deepHi: '#2661a8',
        algaeDark: '#0f6148', algaeMid:'#1fa377', algaeHi:'#54dbab',
        frostDark: '#5b9ec2', frostMid:'#91cce8', frostHi:'#cceeff'
      },
      fx: {
        sprayA: '#ebfbff',
        sprayB: '#66d9fa',
        chipA: '#259bd4',
        algaeA: '#54dbab'
      }
    },
    {
      id: 'ash_snow_floe',
      name: '灰雪碎冰',
      dot: '#9fb4c4',
      outline: '#16202b',
      pal: {
        snowDark:  '#8fa2b0', snowMid: '#b5c6d1', snowHi: '#d8e4eb',
        iceDark:   '#2e5c73', iceMid:  '#528ba3', iceHi:  '#89bed1',
        deepDark:  '#152536', deepMid: '#264059', deepHi: '#3d6180',
        algaeDark: '#1b6345', algaeMid:'#329e6c', algaeHi:'#6ed69f',
        frostDark: '#698191', frostMid:'#92abb8', frostHi:'#c2d5de'
      },
      fx: {
        sprayA: '#d8e4eb',
        sprayB: '#89bed1',
        chipA: '#528ba3',
        algaeA: '#6ed69f'
      }
    }
  ];

  // 不规则多边形浮冰轮廓判定（左/右各自带参差冰缝边）
  function inLeftPolygon(X, Y) {
    // 右缘（X>0 侧）构成蜿蜒冰缝壁
    const crackEdge = 8.4 + Math.sin(Y * 0.24) * 1.65 + Math.cos(Y * 0.45) * 0.7;
    const outerEdge = -9.8 - Math.cos(Y * 0.19) * 1.4;
    const topEdge = 12.6 + Math.sin(X * 0.28) * 1.3;
    const botEdge = -12.6 - Math.cos(X * 0.25) * 1.4;
    if (X > crackEdge || X < outerEdge || Y > topEdge || Y < botEdge) return false;
    // 削去外侧两角成自然多边形
    if (X + Y < -19.2 || X - Y < -18.8) return false;
    return true;
  }

  function inRightPolygon(X, Y) {
    // 左缘（X<0 侧）与左冰块咬合呼应
    const crackEdge = -7.8 + Math.sin(Y * 0.24 + 0.25) * 1.55 + Math.cos(Y * 0.45) * 0.65;
    const outerEdge = 9.0 + Math.sin(Y * 0.21) * 1.3;
    const topEdge = 11.6 + Math.cos(X * 0.26) * 1.2;
    const botEdge = -11.6 - Math.sin(X * 0.24) * 1.3;
    if (X < crackEdge || X > outerEdge || Y > topEdge || Y < botEdge) return false;
    if (X + Y > 17.8 || X - Y > 17.6) return false;
    return true;
  }

  // =========================================================================
  // 1. 左浮冰水下厚冰基座（24×30×8，submerge: 0.55）
  // =========================================================================
  function buildFloeLeftBase(makeCanvas) {
    const m = new VoxelModel(24, 30, 8, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-11.2, 11.2, -14.2, 14.2, 0, 7, (x, y, z, X, Y) => {
      // 水下厚冰略向外扩 1 格显厚重冰裙
      if (!inLeftPolygon(X * 0.94, Y * 0.95)) return;
      const nearCrack = X > 6.4 + Math.sin(Y * 0.24) * 1.4;
      if (nearCrack && z >= 4 && Math.abs(Y) < 10.5) {
        m.setRaw(x, y, z, mat('algae'), partId.algae);
      } else if (z <= 3) {
        m.setRaw(x, y, z, mat('deep'), partId.deep);
      } else {
        m.setRaw(x, y, z, mat('ice'), partId.ice);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 13.0, headZ: 7, centerZ: 3.5 });
  }

  // =========================================================================
  // 2. 左浮冰水上锐棱雪顶块（22×28×9）
  // =========================================================================
  function buildFloeLeftTop(makeCanvas) {
    const m = new VoxelModel(22, 28, 9, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-10.2, 10.2, -13.2, 13.2, 0, 8, (x, y, z, X, Y) => {
      if (!inLeftPolygon(X * 1.03, Y * 1.03)) return;
      const crackEdge = (8.4 + Math.sin(Y * 0.24) * 1.65) / 1.03;
      const topH = 4.6 + Math.sin(X * 0.22 + 1.0) * 1.1 + Math.cos(Y * 0.2) * 0.8;
      if (z > topH) return;

      // 面向冰缝的直切面显饱和冰青棱角，底部深靛寒底
      if (z <= 1 && X > crackEdge - 2.6) {
        m.setRaw(x, y, z, mat('deep'), partId.deep);
      } else if (z <= 3 || X > crackEdge - 1.5) {
        m.setRaw(x, y, z, mat('ice'), partId.ice);
      } else {
        m.setRaw(x, y, z, mat('snow'), partId.snow);
      }
    });

    // 浮冰面上隆起一小道松软风积雪丘与霜棱
    m.paintEllipsoid(-3.2, -2.4, 5.6, 4.4, 5.2, 2.2, mat('snow'), partId.snow, true);
    m.paintEllipsoid(-1.8,  5.5, 5.2, 3.6, 3.4, 1.8, mat('snow'), partId.snow, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 12.0, headZ: 8, centerZ: 4 });
  }

  // =========================================================================
  // 3. 右浮冰水下厚冰基座（22×28×8，submerge: 0.55）
  // =========================================================================
  function buildFloeRightBase(makeCanvas) {
    const m = new VoxelModel(22, 28, 8, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-10.2, 10.2, -13.2, 13.2, 0, 7, (x, y, z, X, Y) => {
      if (!inRightPolygon(X * 0.94, Y * 0.95)) return;
      const nearCrack = X < -5.8 + Math.sin(Y * 0.24 + 0.25) * 1.4;
      if (nearCrack && z >= 4 && Math.abs(Y) < 9.8) {
        m.setRaw(x, y, z, mat('algae'), partId.algae);
      } else if (z <= 3) {
        m.setRaw(x, y, z, mat('deep'), partId.deep);
      } else {
        m.setRaw(x, y, z, mat('ice'), partId.ice);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 12.0, headZ: 7, centerZ: 3.5 });
  }

  // =========================================================================
  // 4. 右浮冰水上锐棱雪顶块（20×26×8）
  // =========================================================================
  function buildFloeRightTop(makeCanvas) {
    const m = new VoxelModel(20, 26, 8, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-9.2, 9.2, -12.2, 12.2, 0, 7, (x, y, z, X, Y) => {
      if (!inRightPolygon(X * 1.03, Y * 1.03)) return;
      const crackEdge = (-7.8 + Math.sin(Y * 0.24 + 0.25) * 1.55) / 1.03;
      const topH = 4.2 + Math.cos(X * 0.25) * 0.9 + Math.sin(Y * 0.22) * 0.7;
      if (z > topH) return;

      if (z <= 1 && X < crackEdge + 2.4) {
        m.setRaw(x, y, z, mat('deep'), partId.deep);
      } else if (z <= 3 || X < crackEdge + 1.4) {
        m.setRaw(x, y, z, mat('ice'), partId.ice);
      } else {
        m.setRaw(x, y, z, mat('snow'), partId.snow);
      }
    });

    m.paintEllipsoid(2.6, 1.8, 5.0, 3.8, 4.6, 1.9, mat('snow'), partId.snow, true);
    m.paintEllipsoid(1.4, -5.2, 4.6, 3.2, 3.0, 1.6, mat('snow'), partId.snow, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 11.0, headZ: 7, centerZ: 3.5 });
  }

  // =========================================================================
  // 5. 缝中翠绿冰下藻垫（10×24×5，submerge: 0.42）
  // =========================================================================
  function buildAlgaeFringe(makeCanvas) {
    const m = new VoxelModel(10, 24, 5, SPEC);
    const { mat, partId } = SPEC;

    // 一排参差绵延的翠绿冰藻丛，浮在深蓝冰缝水下
    const tufts = [
      [-1.2, -8.5, 2.0, 2.6, 2.4, 1.4],
      [ 1.0, -4.6, 2.2, 2.8, 2.6, 1.5],
      [-0.8, -0.4, 2.4, 3.0, 2.8, 1.6],
      [ 1.2,  3.8, 2.2, 2.8, 2.5, 1.5],
      [-1.0,  7.8, 2.0, 2.5, 2.4, 1.4]
    ];
    for (const [tx, ty, tz, rx, ry, rz] of tufts) {
      m.paintEllipsoid(tx, ty, tz, rx, ry, rz, mat('algae'), partId.algae, true);
    }
    // 藻垫底层一缕深蓝海缝暗底托衬
    m.paintEllipsoid(0, 0, 0.8, 3.2, 10.2, 0.9, mat('deep'), partId.deep, false);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.0, headZ: 5, centerZ: 2 });
  }

  // =========================================================================
  // 6. 漂浮碎冰块（7×7×5，复用 3 块，symDeg: 90）
  // =========================================================================
  function buildIceBit(makeCanvas) {
    const m = new VoxelModel(7, 7, 5, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-2.8, 2.8, -2.8, 2.8, 0, 4, (x, y, z, X, Y) => {
      if (Math.abs(X) + Math.abs(Y) > 3.5 - z * 0.35) return;
      if (z <= 1) m.setRaw(x, y, z, mat('ice'), partId.ice);
      else if (z === 2) m.setRaw(x, y, z, mat('frost'), partId.frost);
      else m.setRaw(x, y, z, mat('snow'), partId.snow);
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 4, centerZ: 2 });
  }

  const ICE_BITS = [
    { lx:  0.4, ly: -15.4, ro: 0.4, phase: 0.0 },
    { lx: -0.8, ly:  15.2, ro: 1.5, phase: 2.1 },
    { lx:  4.6, ly:  13.8, ro: 2.4, phase: 4.0 }
  ];

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t05_ice_floe_hole',
    code: 'T05',
    name: '浮冰块与冰缝藻缘',
    status: 'done',
    defaultHabitat: 'iceSea',
    tag: 'T05 冰缝开合地貌与冰下藻垫',
    summary: '两块不规则多边形厚浮冰隔着深靛海缝相对漂浮，浸水底缘用 submerge 显水下厚冰，缝沿透出鲜明翠绿冰下藻垫，完整演示 T05 冰缝开合周期',
    footRadius: 18.0,
    ecoWeight: 3.0,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',          name: '暗流微晃沉浮', loop: true,  status: 'done' },
      { id: 'fissure_cycle', name: '冰缝开合冻合', loop: false, duration: 3.0, status: 'done' }
    ],
    blocks: ['双块不规则厚浮冰', '水下浸水厚冰底缘', '缝沿翠绿冰下藻垫与碎冰'],
    soulHabit: '平时随暗流缓慢微晃沉浮；演示冰缝开合时两块浮冰缓缓拉开露出宽阔深蓝藻缝并冒寒波，随后再缓缓靠拢冻合溅出碎冰花',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        floeLeftBase:  buildFloeLeftBase(makeCanvas),
        floeLeftTop:   buildFloeLeftTop(makeCanvas),
        floeRightBase: buildFloeRightBase(makeCanvas),
        floeRightTop:  buildFloeRightTop(makeCanvas),
        algaeFringe:   buildAlgaeFringe(makeCanvas),
        iceBit:        buildIceBit(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        gapExtra: 0,
        bobL: 0,
        bobR: 0,
        swayL: 0,
        swayR: 0,
        rippleClock: 0.9,
        lastAction: 'idle',
        openWaveFired: false,
        closeSplashFired: false
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
          state.gapExtra = 0;
          state.bobL = 0;
          state.bobR = 0;
          state.swayL = 0;
          state.swayR = 0;
          state.rippleClock = 0.8;
          state.lastAction = 'idle';
          state.openWaveFired = false;
          state.closeSplashFired = false;
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
            state.openWaveFired = false;
            state.closeSplashFired = false;
          }

          // 基础暗流微晃沉浮
          state.bobL = Math.sin(time * 1.45 * gFreq) * 0.45 * sMul;
          state.bobR = Math.sin(time * 1.45 * gFreq + 1.65) * 0.45 * sMul;
          state.swayL = Math.sin(time * 0.95 * gFreq) * 0.025;
          state.swayR = Math.sin(time * 0.95 * gFreq + 2.1) * 0.025;
          state.gapExtra = Math.sin(time * 0.72 * gFreq) * 0.35;

          if (action === 'idle') {
            state.rippleClock -= dt * gFreq;
            if (state.rippleClock <= 0 && vfx) {
              state.rippleClock = 1.2 + Math.random() * 0.9;
              const oy = (Math.random() - 0.5) * 14.0 * sMul;
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, 0, oy);
              vfx.addRipple(wx, wy, 2.0 * sMul, 8.5 * sMul, 1.35, 1.2);
            }
          } else if (action === 'fissure_cycle') {
            const u = clamp(actionTime / 3.0, 0, 1);
            // 0~0.42 缓缓拉开至最大宽缝（+4.6 格）；0.42~0.58 宽缝停留泛波；0.58~0.88 缓缓靠拢冻合；0.88~1.0 微震稳定
            if (u < 0.42) {
              const k = smoothstep(0.0, 0.42, u);
              state.gapExtra = k * 4.6;
              state.swayL = -k * 0.06;
              state.swayR =  k * 0.06;
            } else if (u < 0.58) {
              state.gapExtra = 4.6 + Math.sin(actionTime * 4.2) * 0.15;
              state.swayL = -0.06;
              state.swayR =  0.06;
            } else if (u < 0.88) {
              const k = smoothstep(0.58, 0.88, u);
              state.gapExtra = (1 - k) * 4.6 - Math.sin(k * Math.PI) * 0.25;
              state.swayL = -(1 - k) * 0.06;
              state.swayR =  (1 - k) * 0.06;
            } else {
              const k = (u - 0.88) / 0.12;
              state.gapExtra = Math.sin(k * Math.PI * 3) * 0.25 * (1 - k);
              state.swayL = 0;
              state.swayR = 0;
            }

            // 冰缝拉开阶段冒出一串寒波涟漪与气泡
            if (!state.openWaveFired && u >= 0.34 && vfx) {
              state.openWaveFired = true;
              for (let j = -1; j <= 1; j++) {
                const [rx, ry] = localToWorldXY(state.x, state.y, state.yaw, 0, j * 6.2 * sMul);
                vfx.addRipple(rx, ry, 2.5 * sMul, 12.0 * sMul, 1.45, 1.5);
              }
              for (let k = 0; k < 8; k++) {
                const [px, py] = localToWorldXY(state.x, state.y, state.yaw, (Math.random() - 0.5) * 4.0 * sMul, (Math.random() - 0.5) * 16.0 * sMul);
                vfx.spawnParticle(
                  px, py, 1.2 * sMul,
                  (Math.random() - 0.5) * 3.0 * sMul, (Math.random() - 0.5) * 3.0 * sMul, (4.5 + Math.random() * 4.0) * sMul,
                  0.65 + Math.random() * 0.3,
                  1.1,
                  k % 3 === 0 ? fx.algaeA : fx.sprayB,
                  false,
                  14
                );
              }
            }

            // 靠拢冻合瞬间溅出碎冰花与水花
            if (!state.closeSplashFired && u >= 0.86 && vfx) {
              state.closeSplashFired = true;
              const [cx, cy] = localToWorldXY(state.x, state.y, state.yaw, 0, 0);
              vfx.addRipple(cx, cy, 4.0 * sMul, 16.5 * sMul, 1.25, 1.8);
              if (habitat && habitat.fx) vfx.spawnSplash(cx, cy, 10, 0.85, habitat.fx);
              for (let k = 0; k < 12; k++) {
                const a = Math.random() * TAU;
                const sp = (5.0 + Math.random() * 9.5) * sMul;
                const oy = (Math.random() - 0.5) * 16.0 * sMul;
                const [px, py] = localToWorldXY(state.x, state.y, state.yaw, 0, oy);
                vfx.spawnParticle(
                  px, py, (4.0 + Math.random() * 3.0) * sMul,
                  Math.cos(a) * sp, Math.sin(a) * sp, (7.0 + Math.random() * 7.5) * sMul,
                  0.55 + Math.random() * 0.35,
                  1.35,
                  k % 2 === 0 ? fx.sprayA : fx.chipA,
                  false,
                  38
                );
              }
            }
          }
        },

        buildPartList(habitat) {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const halfGap = (10.2 + state.gapExtra * 0.5) * sMul;
          const list = [];

          // 1. 缝中翠绿冰下藻垫（水下微沉，冰缝拉开时最醒目）
          list.push({
            partKey: 'algaeFringe',
            asset: parts.algaeFringe,
            x: state.x,
            y: state.y,
            lift: (0.8 + Math.sin(state.bobL * 2) * 0.15) * sMul,
            ro: yw,
            bias: -0.14,
            submerge: 0.42
          });

          // 2. 左浮冰水下厚冰基座 + 水上雪顶块
          const [lx, ly] = localToWorldXY(state.x, state.y, yw, -halfGap, 0);
          const liftL = (1.2 * sMul) + state.bobL;
          list.push({
            partKey: 'floeLeftBase',
            asset: parts.floeLeftBase,
            x: lx,
            y: ly,
            lift: liftL,
            ro: wrapAngle(yw + state.swayL),
            bias: -0.22,
            submerge: 0.55
          });
          list.push({
            partKey: 'floeLeftTop',
            asset: parts.floeLeftTop,
            x: lx,
            y: ly,
            lift: liftL + 4.8 * sMul,
            ro: wrapAngle(yw + state.swayL),
            bias: 0.08
          });

          // 3. 右浮冰水下厚冰基座 + 水上雪顶块
          const [rx, ry] = localToWorldXY(state.x, state.y, yw, halfGap, 0);
          const liftR = (1.2 * sMul) + state.bobR;
          list.push({
            partKey: 'floeRightBase',
            asset: parts.floeRightBase,
            x: rx,
            y: ry,
            lift: liftR,
            ro: wrapAngle(yw + state.swayR),
            bias: -0.20,
            submerge: 0.55
          });
          list.push({
            partKey: 'floeRightTop',
            asset: parts.floeRightTop,
            x: rx,
            y: ry,
            lift: liftR + 4.6 * sMul,
            ro: wrapAngle(yw + state.swayR),
            bias: 0.10
          });

          // 4. 缝端复用漂浮碎冰块 ×3
          for (let i = 0; i < ICE_BITS.length; i++) {
            const b = ICE_BITS[i];
            const [bx, by] = localToWorldXY(state.x, state.y, yw, b.lx * sMul, b.ly * sMul);
            list.push({
              partKey: 'iceBit',
              asset: parts.iceBit,
              x: bx,
              y: by,
              lift: (1.2 + Math.sin(b.phase + state.bobL * 3) * 0.35) * sMul,
              ro: wrapAngle(yw + b.ro),
              bias: -0.06,
              submerge: 0.35,
              symDeg: 90
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
