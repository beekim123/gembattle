'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D } = PW.Solvers;

  // =========================================================================
  // S02 标杆 · 摇曳花海草簇（T10 花丛草甸）
  //
  // 高频复用品省贴图设计（全部单部件盒 <= 16 格，远低于 22 格上限，且均标 symDeg: 90）：
  //   - grassTuft   (12×12×12, symDeg: 90)：嫩翠绿弧形草叶簇，复用 6 株高低错落排布
  //   - bloomTall   (14×14×16, symDeg: 90)：高株饱和大花（花茎 + 托叶 + 饱满四瓣大花 + 金蕊），复用 2 株
  //   - bloomWide   (14×14×12, symDeg: 90)：低株宽冠大花（宽大双层花瓣 + 暖金花蕊），复用 2 株
  //   - whiteShroom (8×8×8,    symDeg: 90)：小圆白菇（雪白圆伞盖 + 浅米菌柄），复用 2 株
  //
  // 展示动作：
  //   - idle        ：柔和风浪（各株按局部坐标错相轻摆，偶飘 1~2 粒金黄花粉）
  //   - brush_bend  ：踏过压弯回弹（模拟主角或 地4 瞪羚踏过——整簇向一侧低伏压弯，
  //                   靠 SpringDamper1D 阻尼弹回并抖起一蓬彩粉与花瓣粒）
  //   - bloom_shift ：花簇盛放起伏（呼应 T10 花开一片谢一片、花海挪移规矩）
  // =========================================================================

  // 18 色独立色表（严守 <= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 嫩翠绿草叶（拉高明度与饱和度，跳脱草坪底色）
      grassDark:  '#1d6128',
      grassMid:   '#3ea840',
      grassHi:    '#92e655',
      // 鲜嫩花茎与托叶
      stemDark:   '#174d20',
      stemMid:    '#328736',
      stemHi:     '#6ec74a',
      // 主大花瓣（粉樱撞色）
      petalADark: '#b5285a',
      petalAMid:  '#f55f92',
      petalAHi:   '#ffc7db',
      // 副大花瓣（柔粉雪白层）
      petalBDark: '#cf426e',
      petalBMid:  '#ff85b0',
      petalBHi:   '#ffebf2',
      // 暖金花蕊
      stamenDark: '#c77712',
      stamenMid:  '#f7bd26',
      stamenHi:   '#fff080',
      // 小圆白菇
      shroomDark: '#adb5ba',
      shroomMid:  '#e4eaed',
      shroomHi:   '#fcfefd'
    },
    glowKeys: [],
    parts: ['grass', 'stem', 'petalA', 'petalB', 'stamen', 'shroom'],
    noCrease: [
      ['grass', 'stem'], ['petalA', 'petalB'], ['petalA', 'stamen'], ['petalB', 'stamen']
    ],
    materials: {
      grass:  ['grassDark',  'grassMid',  'grassHi'],
      stem:   ['stemDark',   'stemMid',   'stemHi'],
      petalA: ['petalADark', 'petalAMid', 'petalAHi'],
      petalB: ['petalBDark', 'petalBMid', 'petalBHi'],
      stamen: ['stamenDark', 'stamenMid', 'stamenHi'],
      shroom: ['shroomDark', 'shroomMid', 'shroomHi']
    },
    protectedParts: ['stamen', 'shroom']
  });

  // 3 套花海换色皮肤（粉樱金蕊 / 暖橙雏菊 / 青紫风铃花，0 禁用字）
  const SKINS = [
    {
      id: 'sakura_gold',
      name: '粉樱金蕊',
      dot: '#f55f92',
      outline: '#132114',
      pal: {},
      fx: {
        pollen: '#ffe86b',
        petalA: '#f55f92',
        petalB: '#ffc7db',
        leaf:   '#92e655'
      }
    },
    {
      id: 'orange_daisy',
      name: '暖橙雏菊',
      dot: '#f78828',
      outline: '#1f1910',
      pal: {
        petalADark: '#b84712', petalAMid: '#f78325', petalAHi: '#ffd06b',
        petalBDark: '#c9a675', petalBMid: '#f7e5c3', petalBHi: '#fff9eb',
        stamenDark: '#8c3b10', stamenMid: '#cc6418', stamenHi: '#ffaa3b'
      },
      fx: {
        pollen: '#ffda59',
        petalA: '#f78325',
        petalB: '#fff2cf',
        leaf:   '#92e655'
      }
    },
    {
      id: 'violet_bell',
      name: '青紫风铃花',
      dot: '#8466f2',
      outline: '#131624',
      pal: {
        grassDark:  '#185936', grassMid:  '#329c5c', grassHi:  '#7ce092',
        petalADark: '#4a3099', petalAMid: '#8061ed', petalAHi: '#cbbdff',
        petalBDark: '#2f6ea8', petalBMid: '#5cb3f2', petalBHi: '#c4ecff',
        stamenDark: '#bf8717', stamenMid: '#f5cb38', stamenHi: '#fff594'
      },
      fx: {
        pollen: '#fff085',
        petalA: '#8061ed',
        petalB: '#5cb3f2',
        leaf:   '#7ce092'
      }
    }
  ];

  // =========================================================================
  // 1. 嫩翠草叶簇（12×12×12，4 重对称 symDeg: 90）
  // =========================================================================
  function buildGrassTuft(makeCanvas) {
    const m = new VoxelModel(12, 12, 12, SPEC);
    const { mat, partId } = SPEC;

    // 底部草根盘
    m.paintEllipsoid(0, 0, 1.4, 2.4, 2.4, 1.4, mat('stem'), partId.stem, true);

    // 4 片主外展弧形草叶 + 4 片高挺内叶（严格 90° 对称）
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI * 0.5) + 0.22;
      const ca = Math.cos(a), sa = Math.sin(a);
      m.paintCapsule(ca * 0.8, sa * 0.8, 1.5, ca * 3.0, sa * 3.0, 6.2, 1.25, 0.95, mat('grass'), partId.grass, true);
      m.paintCapsule(ca * 3.0, sa * 3.0, 6.2, ca * 4.8, sa * 4.8, 9.2, 0.90, 0.45, mat('grass'), partId.grass, true);

      const a2 = a + Math.PI * 0.25;
      const c2 = Math.cos(a2), s2 = Math.sin(a2);
      m.paintCapsule(c2 * 0.6, s2 * 0.6, 1.8, c2 * 2.2, s2 * 2.2, 7.6, 1.05, 0.65, mat('grass'), partId.grass, true);
      m.paintCapsule(c2 * 2.2, s2 * 2.2, 7.6, c2 * 3.3, s2 * 3.3, 10.6, 0.62, 0.35, mat('grass'), partId.grass, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.6, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 2. 高株饱和大花（14×14×16，4 重对称 symDeg: 90）
  // =========================================================================
  function buildBloomTall(makeCanvas) {
    const m = new VoxelModel(14, 14, 16, SPEC);
    const { mat, partId } = SPEC;

    // 细直绿茎 + 4 片交叉底叶
    m.paintCapsule(0, 0, 0.5, 0, 0, 10.5, 1.2, 1.0, mat('stem'), partId.stem, true);
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI * 0.5) + 0.4;
      m.paintCapsule(0, 0, 3.2, Math.cos(a) * 4.2, Math.sin(a) * 4.2, 6.2, 1.1, 0.55, mat('grass'), partId.grass, true);
    }

    // 花托
    m.paintEllipsoid(0, 0, 10.2, 2.4, 2.4, 1.4, mat('stem'), partId.stem, true);

    // 4 片主饱和大花瓣 + 4 片交错副花瓣（俯视 ×4 一眼醒目）
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI * 0.5);
      m.paintEllipsoid(Math.cos(a) * 3.5, Math.sin(a) * 3.5, 12.2, 2.6, 2.6, 1.6, mat('petalA'), partId.petalA, true);
      const a2 = a + Math.PI * 0.25;
      m.paintEllipsoid(Math.cos(a2) * 3.1, Math.sin(a2) * 3.1, 11.4, 2.2, 2.2, 1.4, mat('petalB'), partId.petalB, true);
    }

    // 暖金圆润花蕊
    m.paintEllipsoid(0, 0, 13.0, 2.1, 2.1, 1.7, mat('stamen'), partId.stamen, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.2, headZ: 15, centerZ: 8 });
  }

  // =========================================================================
  // 3. 低株宽冠大花（14×14×12，4 重对称 symDeg: 90）
  // =========================================================================
  function buildBloomWide(makeCanvas) {
    const m = new VoxelModel(14, 14, 12, SPEC);
    const { mat, partId } = SPEC;

    // 矮茎 + 4 片托叶
    m.paintCapsule(0, 0, 0.5, 0, 0, 6.8, 1.3, 1.05, mat('stem'), partId.stem, true);
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI * 0.5) + 0.35;
      m.paintCapsule(0, 0, 2.2, Math.cos(a) * 4.4, Math.sin(a) * 4.4, 4.6, 1.15, 0.55, mat('grass'), partId.grass, true);
    }

    // 宽大双层花冠（副色在外，主色在内，形成鲜明双色轮廓）
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI * 0.5) + Math.PI * 0.25;
      m.paintEllipsoid(Math.cos(a) * 3.8, Math.sin(a) * 3.8, 8.0, 2.5, 2.5, 1.4, mat('petalA'), partId.petalA, true);
      const a2 = k * (Math.PI * 0.5);
      m.paintEllipsoid(Math.cos(a2) * 3.2, Math.sin(a2) * 3.2, 8.8, 2.4, 2.4, 1.5, mat('petalB'), partId.petalB, true);
    }

    // 饱满暖金花蕊
    m.paintEllipsoid(0, 0, 9.6, 2.2, 2.2, 1.5, mat('stamen'), partId.stamen, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.6, headZ: 11, centerZ: 6 });
  }

  // =========================================================================
  // 4. 小圆白菇（8×8×8，4 重对称 symDeg: 90）
  // =========================================================================
  function buildWhiteShroom(makeCanvas) {
    const m = new VoxelModel(8, 8, 8, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 0.4, 0, 0, 4.2, 1.1, 0.9, mat('shroom'), partId.shroom, true);
    m.paintEllipsoid(0, 0, 5.2, 2.7, 2.7, 1.9, mat('shroom'), partId.shroom, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 7, centerZ: 3.5 });
  }

  // 簇内排布表（6 株草叶 + 4 朵大花 + 2 株小圆白菇 = 12 个复用小件）
  const CLUSTER_ITEMS = [
    // 6 株高低错落草叶
    { key: 'grassTuft',   lx: -7.8, ly: -3.2, baseLift: 0.0, roOff: 0.25, swayMul: 1.05, bendMul: 1.00, bias: -0.05 },
    { key: 'grassTuft',   lx:  7.4, ly: -4.0, baseLift: 0.0, roOff: 0.95, swayMul: 1.00, bendMul: 0.95, bias: -0.05 },
    { key: 'grassTuft',   lx: -6.4, ly:  5.8, baseLift: 0.0, roOff: 1.55, swayMul: 0.95, bendMul: 1.05, bias:  0.02 },
    { key: 'grassTuft',   lx:  6.8, ly:  5.2, baseLift: 0.0, roOff: 2.10, swayMul: 1.10, bendMul: 1.00, bias:  0.02 },
    { key: 'grassTuft',   lx:  0.2, ly: -7.4, baseLift: 0.4, roOff: 0.60, swayMul: 1.15, bendMul: 1.10, bias: -0.08 },
    { key: 'grassTuft',   lx: -0.8, ly:  7.2, baseLift: 0.2, roOff: 1.25, swayMul: 0.92, bendMul: 0.92, bias:  0.06 },
    // 4 朵饱和大花（复用 2 套花株部件）
    { key: 'bloomTall',   lx: -2.4, ly: -2.2, baseLift: 0.6, roOff: 0.15, swayMul: 1.35, bendMul: 1.35, bias:  0.22, isFlower: true, bloomOrder: 0 },
    { key: 'bloomTall',   lx:  3.6, ly: -0.6, baseLift: 0.2, roOff: 0.82, swayMul: 1.30, bendMul: 1.30, bias:  0.20, isFlower: true, bloomOrder: 1 },
    { key: 'bloomWide',   lx: -3.8, ly:  2.8, baseLift: 0.0, roOff: 0.48, swayMul: 1.12, bendMul: 1.15, bias:  0.18, isFlower: true, bloomOrder: 2 },
    { key: 'bloomWide',   lx:  2.6, ly:  3.8, baseLift: 0.0, roOff: 1.15, swayMul: 1.15, bendMul: 1.18, bias:  0.18, isFlower: true, bloomOrder: 3 },
    // 2 株小圆白菇（根部低伏、压弯幅度极小）
    { key: 'whiteShroom', lx: -8.6, ly:  1.6, baseLift: 0.0, roOff: 0.30, swayMul: 0.15, bendMul: 0.18, bias:  0.08 },
    { key: 'whiteShroom', lx:  8.4, ly:  1.4, baseLift: 0.0, roOff: 1.10, swayMul: 0.15, bendMul: 0.18, bias:  0.08 }
  ];

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_flora_cluster',
    code: 'S02',
    name: '摇曳花海草簇',
    status: 'done',
    defaultHabitat: 'meadow',
    tag: 'S02 标杆 · 轻量高频复用草花丛',
    summary: '4 套 <= 16 格 90° 对称小件复用拼出 6 株草叶 + 4 朵大花 + 2 株小圆白菇，支持错相风浪、SpringDamper1D 踏过压弯弹回与花海盛放起伏',
    footRadius: 11.5,
    ecoWeight: 0.8,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',        name: '柔和风浪',     loop: true,  status: 'done' },
      { id: 'brush_bend',  name: '踏过压弯回弹', loop: false, duration: 1.8, status: 'done' },
      { id: 'bloom_shift', name: '花簇盛放起伏', loop: true,  status: 'done' }
    ],
    blocks: ['4 套 <= 16 格复用花叶小件', '错相风浪摇曳', 'SpringDamper1D 踩踏压弯弹回'],
    soulHabit: '花丛随草甸风浪一波波错相轻摆并偶飘金黄花粉；主角或空心角瞪羚踏过时整簇向一侧低伏压弯，靠弹簧阻尼弹回并抖起彩粉与花瓣粒',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        grassTuft:   buildGrassTuft(makeCanvas),
        bloomTall:   buildBloomTall(makeCanvas),
        bloomWide:   buildBloomWide(makeCanvas),
        whiteShroom: buildWhiteShroom(makeCanvas)
      };

      const bendSpring = new SpringDamper1D(0, 72, 6.2);

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        time: 0,
        bendVal: 0,
        bendDir: 0.35,
        pollenClock: 1.1,
        lastAction: 'idle',
        bendTriggered: false,
        reboundBurstFired: false,
        bloomBurstClock: 0.6
      };

      let curSkin = SKINS[0];

      function spawnPollen(vfx, sMul, count, burst) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * TAU;
          const r = (1.5 + Math.random() * 6.5) * sMul;
          const wx = state.x + Math.cos(a) * r;
          const wy = state.y + Math.sin(a) * r;
          const wz = (7.0 + Math.random() * 7.5) * sMul;
          const isPetal = burst && i % 2 === 0;
          const spd = (burst ? (4.5 + Math.random() * 6.0) : (1.5 + Math.random() * 1.8)) * sMul;
          vfx.spawnParticle(
            wx, wy, wz,
            Math.cos(a) * spd + (burst ? 2.5 * sMul : 1.4 * sMul),
            Math.sin(a) * spd,
            (burst ? (6.5 + Math.random() * 5.0) : (2.2 + Math.random() * 1.8)) * sMul,
            burst ? (1.0 + Math.random() * 0.55) : (1.4 + Math.random() * 0.7),
            isPetal ? 1.45 : 1.05,
            isPetal ? (i % 4 === 0 ? fx.petalA : fx.petalB) : fx.pollen,
            false,
            isPetal ? 14 : 2.2
          );
        }
      }

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
          state.time = 0;
          state.bendVal = 0;
          state.pollenClock = 0.9;
          state.lastAction = 'idle';
          state.bendTriggered = false;
          state.reboundBurstFired = false;
          state.bloomBurstClock = 0.6;
          bendSpring.x = 0;
          bendSpring.v = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const springiness = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          state.time = time * gFreq;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.bendTriggered = false;
            state.reboundBurstFired = false;
          }

          const stiff = 68 * springiness;
          const damp = clamp(6.4 / Math.sqrt(springiness), 3.2, 11.0);

          if (action === 'brush_bend') {
            // 0.0~0.38s 强压伏到一侧，随后释放靠 SpringDamper1D 阻尼回弹震荡
            const u = clamp(actionTime / 1.8, 0, 1);
            let target = 0;
            if (u < 0.22) {
              target = 1.0;
              if (!state.bendTriggered) {
                state.bendTriggered = true;
                bendSpring.impulse(7.2);
                spawnPollen(vfx, sMul, 10, true);
                if (vfx) vfx.addRipple(state.x, state.y, 2.5 * sMul, 12.0 * sMul, 0.55, 1.3);
              }
            } else {
              target = 0;
              if (!state.reboundBurstFired && u >= 0.30) {
                state.reboundBurstFired = true;
                bendSpring.impulse(-4.6);
                spawnPollen(vfx, sMul, 8, true);
              }
            }
            state.bendVal = clamp(bendSpring.update(dt, target, stiff, damp), -0.65, 1.25);
          } else {
            state.bendVal = clamp(bendSpring.update(dt, 0, stiff, damp), -0.65, 1.25);
            if (action === 'bloom_shift') {
              state.bloomBurstClock -= dt;
              if (state.bloomBurstClock <= 0) {
                state.bloomBurstClock = 0.75 + Math.random() * 0.45;
                spawnPollen(vfx, sMul, 3, false);
              }
            } else {
              state.pollenClock -= dt;
              if (state.pollenClock <= 0) {
                state.pollenClock = 1.4 + Math.random() * 1.1;
                spawnPollen(vfx, sMul, 2, false);
              }
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.time;
          const bend = state.bendVal;
          const isBloomShift = state.lastAction === 'bloom_shift';
          const bendCos = Math.cos(state.bendDir);
          const bendSin = Math.sin(state.bendDir);
          const list = [];

          for (let i = 0; i < CLUSTER_ITEMS.length; i++) {
            const it = CLUSTER_ITEMS[i];
            // 按局部位置错相的柔和风浪
            const phase = it.lx * 0.22 + it.ly * 0.14;
            const waveX = Math.sin(t * 1.85 - phase) * 0.68 * it.swayMul;
            const waveY = Math.cos(t * 1.35 - phase * 0.8) * 0.34 * it.swayMul;

            // 踏过压弯偏移（纯位移 + 微倾 + 略压低 lift，绝不做小数拉伸）
            const bendOffX = bendCos * bend * 3.1 * it.bendMul;
            const bendOffY = bendSin * bend * 2.2 * it.bendMul;
            const bendDrop = Math.max(0, bend) * 2.3 * it.bendMul;

            // 花海盛放起伏：花株按顺序波浪式上浮舒展微转
            let shiftLift = 0;
            let shiftRo = 0;
            if (isBloomShift && it.isFlower) {
              const bWave = Math.sin(t * 2.1 - it.bloomOrder * 1.15);
              shiftLift = smoothstep(-0.2, 1.0, bWave) * 2.1;
              shiftRo = bWave * 0.32;
            }

            const lx = (it.lx + waveX + bendOffX) * sMul;
            const ly = (it.ly + waveY + bendOffY) * sMul;
            const [wx, wy] = localToWorldXY(state.x, state.y, yw, lx, ly);
            const lift = Math.max(0, (it.baseLift + shiftLift - bendDrop)) * sMul;
            const ro = wrapAngle(yw + it.roOff + waveX * 0.12 + bend * 0.28 * it.bendMul + shiftRo);

            list.push({
              partKey: it.key,
              asset: parts[it.key],
              x: wx,
              y: wy,
              lift,
              ro,
              bias: it.bias,
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
