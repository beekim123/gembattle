'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T04 石缝河湾 · 河湾鹅卵石缝与螺蟹窝（scenes/scene_t04_cobble_crevice.js）
  //
  // 紧扣 T04「河水把鹅卵石一块块冲着往下游挪，石缝每天变，缝里住螺和小蟹」规矩：
  //   - wetCobbleBase (34×30×8, submerge: 0.45)：浸水底层卵石滩与暗色水下石缝槽
  //   - cobbleBigA    (20×16×12)               ：左侧浅暖灰白脉滚圆大鹅卵石
  //   - cobbleBigB    (18×16×11)               ：右侧暖赭滚圆大鹅卵石，与 A 搭靠出清晰石缝
  //   - cobbleTop     (12×10×8)                ：架在石缝上方的小鹅卵石（急流冲过时微微滚挪半格）
  //   - crabClaw      (10×8×6)                 ：缝口探出的醒目赤橙小蟹与双螯
  //   - spiralShell   (8×8×6, 复用 2 颗)       ：石缝边螺旋红褐小贝壳
  //
  // 展示动作：
  //   - idle          ：河水冲过石缝荡出轻漪，缝口小蟹偶尔探头一缩
  //   - current_shift ：一阵急流冲过，上方小鹅卵石微微滚挪半格激起白沫，缝里小蟹吓得缩回冒出一串小泡
  // =========================================================================

  // 21 色独立色表（严守 <= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 浅暖灰大鹅卵石（3 档）
      greyDark:  '#666e73',
      greyMid:   '#98a2a8',
      greyHi:    '#cfd8dc',
      // 鹅卵石白脉纹（3 档）
      veinDark:  '#aeb8bd',
      veinMid:   '#dce4e8',
      veinHi:    '#f7fafc',
      // 暖赭河滩鹅卵石（3 档）
      ochreDark: '#7a593f',
      ochreMid:  '#b58863',
      ochreHi:   '#e6bf98',
      // 水下暗色石缝腔壁（3 档）
      gapDark:   '#142129',
      gapMid:    '#233845',
      gapHi:     '#385463',
      // 醒目赤橙小蟹与双螯（3 档）
      crabDark:  '#a82b14',
      crabMid:   '#eb5324',
      crabHi:    '#ff9452',
      // 螺旋红褐河螺壳（3 档）
      shellDark: '#6e2e20',
      shellMid:  '#b05238',
      shellHi:   '#e89b74',
      // 螺壳口浅米边（3 档）
      rimDark:   '#b59e84',
      rimMid:    '#e0cbb2',
      rimHi:     '#faf0e1'
    },
    glowKeys: [],
    parts: ['grey', 'vein', 'ochre', 'gap', 'crab', 'shell', 'rim'],
    noCrease: [
      ['grey', 'vein'],
      ['ochre', 'vein'],
      ['shell', 'rim'],
      ['grey', 'gap'],
      ['ochre', 'gap']
    ],
    materials: {
      grey:  ['greyDark',  'greyMid',  'greyHi'],
      vein:  ['veinDark',  'veinMid',  'veinHi'],
      ochre: ['ochreDark', 'ochreMid', 'ochreHi'],
      gap:   ['gapDark',   'gapMid',   'gapHi'],
      crab:  ['crabDark',  'crabMid',  'crabHi'],
      shell: ['shellDark', 'shellMid', 'shellHi'],
      rim:   ['rimDark',   'rimMid',   'rimHi']
    },
    protectedParts: ['crab', 'shell', 'vein']
  });

  // 3 套零重建模换色皮肤（青白卵石 / 暖赭河石 / 花斑滩石）
  const SKINS = [
    {
      id: 'blue_white_cobble',
      name: '青白卵石',
      dot: '#cfd8dc',
      outline: '#0d1a21',
      pal: {},
      fx: {
        foamA: '#e0f7fa',
        foamB: '#ffffff',
        bubble: '#c4f0f5'
      }
    },
    {
      id: 'warm_ochre_river',
      name: '暖赭河石',
      dot: '#c98e5b',
      outline: '#1a140f',
      pal: {
        greyDark:  '#735b46', greyMid:  '#ad8c6d', greyHi:  '#dec09e',
        veinDark:  '#b59d84', veinMid:  '#e3ceb6', veinHi:  '#faf0e3',
        ochreDark: '#874c2c', ochreMid: '#c47545', ochreHi: '#f2ac79',
        crabDark:  '#9c1c20', crabMid:  '#de3538', crabHi:  '#ff7a70',
        shellDark: '#573620', shellMid: '#8f5d38', shellHi: '#cf9b69'
      },
      fx: {
        foamA: '#e6f5f2',
        foamB: '#fffaf0',
        bubble: '#ccf0ed'
      }
    },
    {
      id: 'speckled_shoal',
      name: '花斑滩石',
      dot: '#8c9c99',
      outline: '#0e1719',
      pal: {
        greyDark:  '#465459', greyMid:  '#72878c', greyHi:  '#abc2c4',
        veinDark:  '#c7b597', veinMid:  '#ebd9b9', veinHi:  '#fff5e0',
        ochreDark: '#5e564a', ochreMid: '#918776', ochreHi: '#c9bfb0',
        crabDark:  '#b5440e', crabMid:  '#f5761a', crabHi:  '#ffba52',
        shellDark: '#7a2c38', shellMid: '#bd4c59', shellHi: '#f2949c'
      },
      fx: {
        foamA: '#dff5f7',
        foamB: '#f7ffff',
        bubble: '#bcecf2'
      }
    }
  ];

  // =========================================================================
  // 1. 浸水底层鹅卵石滩与暗色水下石缝槽（34×30×8，submerge: 0.45）
  // =========================================================================
  function buildWetCobbleBase(makeCanvas) {
    const m = new VoxelModel(34, 30, 8, SPEC);
    const { mat, partId } = SPEC;

    // 中央暗色水下石缝底槽
    m.paintEllipsoid(0.0, 1.2, 2.0, 9.5, 6.8, 2.2, mat('gap'), partId.gap, true);

    // 外圈 6 块浸在水线下的圆润鹅卵石
    const baseStones = [
      [-10.2,  2.4, 2.6, 5.4, 4.4, 3.0, 'grey'],
      [ 10.6,  1.8, 2.5, 5.2, 4.5, 2.9, 'ochre'],
      [ -5.8, -7.4, 2.8, 5.6, 4.2, 3.1, 'ochre'],
      [  6.2, -7.2, 2.7, 5.4, 4.4, 3.0, 'grey'],
      [ -8.2,  8.6, 2.0, 4.4, 3.4, 2.3, 'ochre'],
      [  8.4,  8.2, 2.1, 4.5, 3.5, 2.4, 'grey']
    ];
    for (const [cx, cy, cz, rx, ry, rz, mk] of baseStones) {
      m.paintEllipsoid(cx, cy, cz, rx, ry, rz, mat(mk), partId[mk], true);
    }

    // 正前中央留出清晰暗色水下石缝通道（Y > 1.5, |X| < 3.6）
    m.fillAABB(-4.2, 4.2, 0.5, 13.0, 2, 7, (x, y, z, X, Y) => {
      if (Math.abs(X) < 3.4 && Y > 1.0) {
        if (z <= 3) m.setRaw(x, y, z, mat('gap'), partId.gap);
        else m.setRaw(x, y, z, 0, 0);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 15.8, headZ: 7, centerZ: 3 });
  }

  // =========================================================================
  // 2. 左侧浅暖灰白脉大鹅卵石（20×16×12）
  // =========================================================================
  function buildCobbleBigA(makeCanvas) {
    const m = new VoxelModel(20, 16, 12, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-9, 9, -7, 7, 0, 11, (x, y, z, X, Y) => {
      const dx = X / 8.6;
      const dy = Y / 6.8;
      const dz = (z - 4.6) / 5.4;
      if (dx * dx + dy * dy + dz * dz > 1.0) return;
      // 一道斜穿卵石顶面的清晰白石英脉
      const veinDist = Math.abs(X * 0.55 + Y * 0.82 - 1.2 + Math.sin(z * 0.4) * 0.6);
      const isVein = veinDist < 0.95;
      m.setRaw(x, y, z, isVein ? mat('vein') : mat('grey'), isVein ? partId.vein : partId.grey);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.6, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 3. 右侧暖赭大鹅卵石（18×16×11）
  // =========================================================================
  function buildCobbleBigB(makeCanvas) {
    const m = new VoxelModel(18, 16, 11, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-8, 8, -7, 7, 0, 10, (x, y, z, X, Y) => {
      const dx = X / 7.8;
      const dy = Y / 6.6;
      const dz = (z - 4.2) / 5.0;
      if (dx * dx + dy * dy + dz * dz > 1.0) return;
      const veinDist = Math.abs(X * 0.78 - Y * 0.62 + 1.5);
      const isVein = veinDist < 0.78 && z > 3;
      m.setRaw(x, y, z, isVein ? mat('vein') : mat('ochre'), isVein ? partId.vein : partId.ochre);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.8, headZ: 10, centerZ: 4.5 });
  }

  // =========================================================================
  // 4. 架在石缝上方的小鹅卵石（12×10×8，急流冲过时微微滚挪半格）
  // =========================================================================
  function buildCobbleTop(makeCanvas) {
    const m = new VoxelModel(12, 10, 8, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5, 5, -4, 4, 0, 7, (x, y, z, X, Y) => {
      const dx = X / 4.9;
      const dy = Y / 4.1;
      const dz = (z - 3.0) / 3.4;
      if (dx * dx + dy * dy + dz * dz > 1.0) return;
      const isVein = Math.abs(X - Y * 0.7) < 0.75 && z >= 3;
      m.setRaw(x, y, z, isVein ? mat('vein') : mat('grey'), isVein ? partId.vein : partId.grey);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.0, headZ: 7, centerZ: 3 });
  }

  // =========================================================================
  // 5. 缝口赤橙小蟹与双螯（10×8×6）
  // =========================================================================
  function buildCrabClaw(makeCanvas) {
    const m = new VoxelModel(10, 8, 6, SPEC);
    const { mat, partId } = SPEC;

    // 扁圆小蟹甲
    m.paintEllipsoid(0.0, -0.6, 2.0, 2.5, 1.9, 1.4, mat('crab'), partId.crab, true);
    // 左右探出的醒目大蟹螯（面向 +Y 缝口）
    m.paintCapsule(-2.2, 0.2, 2.0, -3.4, 2.6, 2.8, 1.15, 0.95, mat('crab'), partId.crab, true);
    m.paintCapsule( 2.2, 0.2, 2.0,  3.2, 2.4, 2.6, 1.05, 0.85, mat('crab'), partId.crab, true);
    // 蟹螯内缘亮色钳尖
    m.paintEllipsoid(-2.7, 3.0, 2.8, 0.85, 0.75, 0.75, mat('rim'), partId.rim, true);
    m.paintEllipsoid( 2.5, 2.8, 2.6, 0.8, 0.7, 0.7, mat('rim'), partId.rim, true);
    // 两侧短步足
    m.paintCapsule(-2.4, -0.8, 1.2, -4.1, -1.6, 0.8, 0.65, 0.5, mat('crab'), partId.crab, true);
    m.paintCapsule( 2.4, -0.8, 1.2,  4.1, -1.6, 0.8, 0.65, 0.5, mat('crab'), partId.crab, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 5, centerZ: 2 });
  }

  // =========================================================================
  // 6. 石缝边螺旋小贝壳（8×8×6，复用 2 颗）
  // =========================================================================
  function buildSpiralShell(makeCanvas) {
    const m = new VoxelModel(8, 8, 6, SPEC);
    const { mat, partId } = SPEC;

    // 锥形螺旋螺壳
    m.paintEllipsoid(-0.6, 0.0, 2.0, 2.2, 2.0, 1.8, mat('shell'), partId.shell, true);
    m.paintCapsule(0.6, 0.0, 2.2, 3.0, 0.4, 3.2, 1.55, 0.65, mat('shell'), partId.shell, true);
    // 壳口浅米色卷边
    m.paintEllipsoid(-2.0, 0.4, 1.8, 1.0, 1.4, 1.2, mat('rim'), partId.rim, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2, headZ: 5, centerZ: 2 });
  }

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t04_cobble_crevice',
    code: 'T04',
    name: '河湾鹅卵石缝与螺蟹窝',
    status: 'done',
    defaultHabitat: 'stoneBay',
    tag: 'T04 石缝河湾鹅卵石窝与螺蟹藏身处',
    summary: '几块河水磨圆的浅暖灰白脉与暖赭大鹅卵石搭靠出暗色水下石缝，底部浸水石带 submerge 染水色，缝口探出醒目赤橙小蟹螯与螺旋小贝壳',
    footRadius: 17.5,
    ecoWeight: 3.0,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',          name: '浅湾轻漪', loop: true,  status: 'done' },
      { id: 'current_shift', name: '急流挪石', loop: false, duration: 2.2, status: 'done' }
    ],
    blocks: ['浸水鹅卵石滩与石缝槽', '白脉浅灰与暖赭大鹅卵石', '可滚挪顶石', '缝口探头赤橙小蟹与河螺'],
    soulHabit: '河水冲过石缝荡出轻漪，小蟹偶尔探头一缩；急流涌过时上方小鹅卵石微微滚挪半格激起白沫，小蟹受惊缩回缝中冒出一串小泡',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        wetCobbleBase: buildWetCobbleBase(makeCanvas),
        cobbleBigA:    buildCobbleBigA(makeCanvas),
        cobbleBigB:    buildCobbleBigB(makeCanvas),
        cobbleTop:     buildCobbleTop(makeCanvas),
        crabClaw:      buildCrabClaw(makeCanvas),
        spiralShell:   buildSpiralShell(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0.1,
        shadowScale: 0.85,
        t: 0,
        crabPeek: 0.4,
        stoneShiftX: 0,
        stoneShiftY: 0,
        stoneRoll: 0,
        stoneHop: 0,
        rippleCd: 1.0,
        lastAction: 'idle',
        shiftBeats: 0
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
          state.t = 0;
          state.crabPeek = 0.4;
          state.stoneShiftX = 0;
          state.stoneShiftY = 0;
          state.stoneRoll = 0;
          state.stoneHop = 0;
          state.rippleCd = 1.0;
          state.lastAction = 'idle';
          state.shiftBeats = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          state.t = time * freq;
          if (action !== state.lastAction) {
            state.lastAction = action;
            state.shiftBeats = 0;
          }

          if (action === 'idle') {
            // 小蟹周期性探头一缩（0..1）
            const cyc = (state.t * 0.45) % 1;
            const peek = smoothstep(0.08, 0.30, cyc) * (1 - smoothstep(0.68, 0.88, cyc));
            state.crabPeek = 0.25 + peek * 0.75;
            state.stoneShiftX = 0;
            state.stoneShiftY = 0;
            state.stoneRoll = 0;
            state.stoneHop = 0;

            state.rippleCd -= dt;
            if (state.rippleCd <= 0 && vfx) {
              state.rippleCd = 1.65 + Math.random() * 0.9;
              const [rx, ry] = localToWorldXY(state.x, state.y, state.yaw, 0.0, 9.2 * sMul);
              vfx.addRipple(rx, ry, 3.0 * sMul, 15.5 * sMul, 1.4, 1.25);
            }
          } else if (action === 'current_shift') {
            const u = clamp(actionTime / 2.2, 0, 1);
            // 急流冲过：0.12~0.55 小鹅卵石微微滚挪半格并轻颠，尾段回稳
            const push = smoothstep(0.10, 0.42, u) * (1 - smoothstep(0.74, 1.0, u));
            const wobble = Math.sin(actionTime * 22.0 * freq) * smoothstep(0.08, 0.22, u) * (1 - smoothstep(0.46, 0.72, u));
            state.stoneShiftX = push * 1.45 + wobble * 0.35;
            state.stoneShiftY = push * 0.85;
            state.stoneRoll = push * 0.42 + wobble * 0.14;
            state.stoneHop = Math.abs(Math.sin(u * Math.PI * 3.0)) * push * 0.75;

            // 缝里小蟹吓得迅速缩回石缝深处，后半段小心探出一点
            const hide = smoothstep(0.05, 0.16, u) * (1 - smoothstep(0.76, 1.0, u));
            state.crabPeek = 0.85 * (1 - hide) - 0.55 * hide;

            // 激起急流白沫与小蟹缩回时冒出的一串小泡
            const beats = [0.12, 0.34, 0.62, 0.95];
            while (state.shiftBeats < beats.length && actionTime >= beats[state.shiftBeats]) {
              const idx = state.shiftBeats;
              if (vfx) {
                const [fxW, fyW] = localToWorldXY(state.x, state.y, state.yaw, (idx - 1.2) * 3.2 * sMul, 7.6 * sMul);
                vfx.addRipple(fxW, fyW, 3.6 * sMul, 18.5 * sMul, 1.3, 1.65);

                // 白沫水花
                for (let k = 0; k < 5; k++) {
                  const sp = (5.0 + Math.random() * 8.5) * sMul;
                  const a = -0.35 + (Math.random() - 0.5) * 1.1;
                  vfx.spawnParticle(
                    fxW + (Math.random() - 0.5) * 3.5 * sMul,
                    fyW + (Math.random() - 0.5) * 3.0 * sMul,
                    2.6 * sMul,
                    Math.cos(state.yaw + a) * sp,
                    Math.sin(state.yaw + a) * sp,
                    (5.0 + Math.random() * 6.0) * sMul,
                    0.42 + Math.random() * 0.25,
                    1.25 + Math.random() * 0.45,
                    k % 2 === 0 ? fx.foamA : fx.foamB,
                    false,
                    30
                  );
                }

                // 缝口冒出一串受惊小泡
                if (idx >= 1) {
                  const [bx, by] = localToWorldXY(state.x, state.y, state.yaw, 0.2 * sMul, 6.2 * sMul);
                  for (let b = 0; b < 3; b++) {
                    vfx.spawnParticle(
                      bx + (Math.random() - 0.5) * 2.2 * sMul,
                      by + (Math.random() - 0.5) * 2.0 * sMul,
                      2.2 * sMul,
                      (Math.random() - 0.5) * 2.0 * sMul,
                      (1.2 + Math.random() * 2.0) * sMul,
                      (6.5 + Math.random() * 4.5) * sMul,
                      0.65 + Math.random() * 0.3,
                      1.05 + Math.random() * 0.35,
                      fx.bubble,
                      false,
                      2.0
                    );
                  }
                }
              }
              state.shiftBeats++;
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const list = [];

          // 1. 浸水底层鹅卵石滩与暗色水下石缝槽（submerge: 0.45）
          list.push({
            partKey: 'wetCobbleBase',
            asset: parts.wetCobbleBase,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            submerge: 0.45,
            bias: -0.35
          });

          // 2. 缝口赤橙小蟹（随 peek 探头或缩进石缝）
          const [cx, cy] = localToWorldXY(state.x, state.y, yw, 0.2 * sMul, (5.2 + state.crabPeek * 2.9) * sMul);
          list.push({
            partKey: 'crabClaw',
            asset: parts.crabClaw,
            x: cx,
            y: cy,
            lift: 1.6 * sMul,
            ro: wrapAngle(yw + Math.sin(state.t * 3.1) * 0.12),
            bias: 0.08
          });

          // 3. 左侧浅暖灰白脉大鹅卵石
          const [ax, ay] = localToWorldXY(state.x, state.y, yw, -6.4 * sMul, -0.6 * sMul);
          list.push({
            partKey: 'cobbleBigA',
            asset: parts.cobbleBigA,
            x: ax,
            y: ay,
            lift: 2.2 * sMul,
            ro: wrapAngle(yw + 0.26),
            bias: 0.12
          });

          // 4. 右侧暖赭大鹅卵石（与左侧搭靠出清晰暗色石缝）
          const [bx, by] = localToWorldXY(state.x, state.y, yw, 6.2 * sMul, -1.2 * sMul);
          list.push({
            partKey: 'cobbleBigB',
            asset: parts.cobbleBigB,
            x: bx,
            y: by,
            lift: 2.0 * sMul,
            ro: wrapAngle(yw - 0.34),
            bias: 0.10
          });

          // 5. 架在石缝上方的小鹅卵石（急流时滚挪半格）
          const [tx, ty] = localToWorldXY(
            state.x, state.y, yw,
            (-0.6 + state.stoneShiftX) * sMul,
            (-2.4 + state.stoneShiftY) * sMul
          );
          list.push({
            partKey: 'cobbleTop',
            asset: parts.cobbleTop,
            x: tx,
            y: ty,
            lift: (8.6 + state.stoneHop) * sMul,
            ro: wrapAngle(yw + 0.18 + state.stoneRoll),
            bias: 0.28
          });

          // 6. 石缝边 2 颗螺旋小贝壳（复用同一资产）
          const [s1x, s1y] = localToWorldXY(state.x, state.y, yw, -7.8 * sMul, 7.6 * sMul);
          list.push({
            partKey: 'spiralShell',
            asset: parts.spiralShell,
            x: s1x,
            y: s1y,
            lift: 1.8 * sMul,
            ro: wrapAngle(yw + 0.8),
            bias: 0.22
          });

          const [s2x, s2y] = localToWorldXY(state.x, state.y, yw, 7.2 * sMul, 6.8 * sMul);
          list.push({
            partKey: 'spiralShell',
            asset: parts.spiralShell,
            x: s2x,
            y: s2y,
            lift: 1.9 * sMul,
            ro: wrapAngle(yw - 1.9),
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
