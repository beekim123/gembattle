'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T04 石缝河湾 · 冲滩流木枝杈与砾滩（scenes/scene_t04_driftwood_weir.js）
  //
  // 紧扣 T04 浅湾砾滩 + 水2 衔石小鸟歇脚与衔短木枝的理想落点：
  //   - gravelShoal   (34×28×6, submerge: 0.48)：浸水浅滩砾石与河湾卵石底床
  //   - driftwoodMain (36×16×14)               ：苍白剥皮冲滩主枯木（水浸底段微湿深色，上部高对比漂白木）
  //   - driftwoodFork (18×14×14)               ：斜翘流木枝杈（供小鸟落脚歇息）
  //   - sedgeClump    (12×12×12, 复用 2 丛)    ：枝杈间挂着的翠绿浅水莎草丛
  //   - shoalStone    (10×9×6, 复用 2 块)      ：卡住流木的露水浅暖灰/赭白鹅卵石
  //
  // 展示动作：
  //   - idle        ：浅水绕枯木流过泛出轻白水花、莎草轻摇
  //   - splash_drop ：模拟小鸟丢下石子砸中木边浅水，溅起一蓬清亮水花与扩散涟漪
  // =========================================================================

  // 18 色独立色表（严守 <= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 苍白剥皮流木主体（高对比浅灰白，撞蓝青浅湾）
      woodDark:   '#9e9689',
      woodMid:    '#d1c9ba',
      woodHi:     '#f5f0e6',
      // 水线浸湿深褐木段（3 档）
      wetDark:    '#4a3a2e',
      wetMid:     '#735d4b',
      wetHi:      '#9e846c',
      // 枯木裂纹木芯（3 档）
      grainDark:  '#786e60',
      grainMid:   '#aba090',
      grainHi:    '#dfd5c3',
      // 枝杈间翠绿浅水莎草（3 档）
      sedgeDark:  '#1a6134',
      sedgeMid:   '#32a352',
      sedgeHi:    '#74de73',
      // 浅滩暖赭鹅卵石（3 档）
      stoneDark:  '#736558',
      stoneMid:   '#a89888',
      stoneHi:    '#dbd0c3',
      // 浸水砾石底床（3 档）
      gravelDark: '#47595e',
      gravelMid:  '#6f878c',
      gravelHi:   '#a2b8ba'
    },
    glowKeys: [],
    parts: ['wood', 'wet', 'grain', 'sedge', 'stone', 'gravel'],
    noCrease: [
      ['wood', 'grain'],
      ['wood', 'wet'],
      ['stone', 'gravel']
    ],
    materials: {
      wood:   ['woodDark',   'woodMid',   'woodHi'],
      wet:    ['wetDark',    'wetMid',    'wetHi'],
      grain:  ['grainDark',  'grainMid',  'grainHi'],
      sedge:  ['sedgeDark',  'sedgeMid',  'sedgeHi'],
      stone:  ['stoneDark',  'stoneMid',  'stoneHi'],
      gravel: ['gravelDark', 'gravelMid', 'gravelHi']
    },
    protectedParts: ['sedge']
  });

  // 3 套零重建模换色皮肤（苍白流木 / 湿褐沉木 / 青苔枯杈）
  const SKINS = [
    {
      id: 'bleached_driftwood',
      name: '苍白流木',
      dot: '#e6dfd3',
      outline: '#0e1920',
      pal: {},
      fx: {
        splashA: '#d4f5f7',
        splashB: '#ffffff',
        pebble:  '#98a2a8',
        foam:    '#e8fafa'
      }
    },
    {
      id: 'wet_chestnut_log',
      name: '湿褐沉木',
      dot: '#8c5a3c',
      outline: '#17110d',
      pal: {
        woodDark:  '#543321', woodMid:  '#875538', woodHi:  '#ba825d',
        wetDark:   '#2e1b12', wetMid:   '#4d2f20', wetHi:   '#704934',
        grainDark: '#6b422a', grainMid: '#9e6744', grainHi: '#cf9970',
        sedgeDark: '#2a6b24', sedgeMid: '#52ad3b', sedgeHi: '#96e366',
        stoneDark: '#6e5c4c', stoneMid: '#a38d77', stoneHi: '#d9c6b0'
      },
      fx: {
        splashA: '#d4f5f7',
        splashB: '#ffffff',
        pebble:  '#a38d77',
        foam:    '#e6f7f5'
      }
    },
    {
      id: 'mossy_snag',
      name: '青苔枯杈',
      dot: '#6db579',
      outline: '#0d1a16',
      pal: {
        woodDark:  '#69756d', woodMid:  '#9ca89e', woodHi:  '#cfd9ce',
        wetDark:   '#2b4f3a', wetMid:   '#457d5a', wetHi:   '#73b086',
        grainDark: '#4d6652', grainMid: '#78997c', grainHi: '#b0ccb0',
        sedgeDark: '#165e4d', sedgeMid: '#299e7e', sedgeHi: '#62dbad',
        stoneDark: '#596966', stoneMid: '#889c97', stoneHi: '#bfd1cb'
      },
      fx: {
        splashA: '#d4f5f7',
        splashB: '#ffffff',
        pebble:  '#889c97',
        foam:    '#e6faf7'
      }
    }
  ];

  // =========================================================================
  // 1. 浅水砾滩底床（34×28×6，submerge: 0.48）
  // =========================================================================
  function buildGravelShoal(makeCanvas) {
    const m = new VoxelModel(34, 28, 6, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-16, 16, -13, 13, 0, 5, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X * 0.88, Y * 1.12);
      const maxR = (13.4 - z * 1.6) + Math.sin(ang * 4 + 0.5) * 1.6;
      if (r > maxR || z > 3) return;
      const isPebble = ((Math.round(X + 16) * 5 + Math.round(Y + 13) * 3) % 7 === 0) && z >= 2;
      m.setRaw(x, y, z, isPebble ? mat('stone') : mat('gravel'), isPebble ? partId.stone : partId.gravel);
    });

    // 几块半埋浅滩卵石
    m.paintEllipsoid(-10.5, 4.2, 2.2, 4.2, 3.2, 2.2, mat('stone'), partId.stone, true);
    m.paintEllipsoid( 10.8,-3.6, 2.0, 4.0, 3.0, 2.0, mat('stone'), partId.stone, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 15.2, headZ: 5, centerZ: 2 });
  }

  // =========================================================================
  // 2. 苍白剥皮冲滩主枯木（36×16×14）
  // =========================================================================
  function buildDriftwoodMain(makeCanvas) {
    const m = new VoxelModel(36, 16, 14, SPEC);
    const { mat, partId } = SPEC;

    // 弯曲斜躺的剥皮粗树干：左低半浸水、右高架在卵石上
    const segs = [
      [-15.2,  2.2, 2.0,  -6.5,  0.6, 4.2, 3.1, 3.4],
      [ -6.5,  0.6, 4.2,   4.5, -1.2, 6.2, 3.4, 2.8],
      [  4.5, -1.2, 6.2,  14.8, -0.4, 9.6, 2.8, 1.5]
    ];
    for (const [ax, ay, az, bx, by, bz, r0, r1] of segs) {
      m.paintCapsule(ax, ay, az, bx, by, bz, r0, r1, mat('wood'), partId.wood, true);
    }

    // 左侧根部斜岔短根须
    m.paintCapsule(-11.5, 1.4, 3.0, -15.6, -4.4, 3.8, 1.9, 0.95, mat('wood'), partId.wood, true);
    m.paintCapsule(-10.2, 2.4, 2.8, -13.5,  6.2, 2.0, 1.6, 0.85, mat('wet'), partId.wet, true);

    // 水线以下染深湿木色 + 树干表面加纵向风化木纹
    m.fillAABB(-17, 17, -7, 7, 0, 13, (x, y, z, X, Y) => {
      if (!m.getId(x, y, z)) return;
      if (z <= 2) {
        m.setRaw(x, y, z, mat('wet'), partId.wet);
      } else if (Math.abs(Math.sin(Y * 1.45 + z * 0.7)) < 0.22 && X > -12 && X < 12) {
        m.setRaw(x, y, z, mat('grain'), partId.grain);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 15.8, headZ: 13, centerZ: 5.5 });
  }

  // =========================================================================
  // 3. 高翘流木枝杈（18×14×14，供 水2 衔石小鸟歇脚）
  // =========================================================================
  function buildDriftwoodFork(makeCanvas) {
    const m = new VoxelModel(18, 14, 14, SPEC);
    const { mat, partId } = SPEC;

    // 主斜翘枝杈 + 次级短杈
    m.paintCapsule(-4.8, 0.0, 1.2,  3.2, -1.6,  8.6, 2.2, 1.35, mat('wood'), partId.wood, true);
    m.paintCapsule( 3.2,-1.6, 8.6,  7.4, -3.4, 12.4, 1.35, 0.78, mat('wood'), partId.wood, true);
    m.paintCapsule( 0.4,-0.8, 5.6,  5.6,  4.2,  9.8, 1.4, 0.75, mat('wood'), partId.wood, true);

    // 断口木纹点缀
    m.paintEllipsoid(7.4, -3.4, 12.4, 0.75, 0.75, 0.75, mat('grain'), partId.grain, true);
    m.paintEllipsoid(5.6,  4.2,  9.8, 0.75, 0.75, 0.75, mat('grain'), partId.grain, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.5, headZ: 13, centerZ: 6 });
  }

  // =========================================================================
  // 4. 枝杈间翠绿浅水莎草丛（12×12×12，复用 2 丛）
  // =========================================================================
  function buildSedgeClump(makeCanvas) {
    const m = new VoxelModel(12, 12, 12, SPEC);
    const { mat, partId } = SPEC;

    const blades = [
      [ 0.0,  0.0, 0.6,  2.8,  2.2, 10.2, 0.95, 0.50],
      [ 0.0,  0.0, 0.6, -3.4,  1.6,  9.4, 0.95, 0.50],
      [ 0.0,  0.0, 0.6,  1.2, -3.6,  8.8, 0.90, 0.48],
      [-0.5, -0.5, 0.6, -2.6, -2.8,  7.6, 0.85, 0.46],
      [ 0.6,  0.4, 0.6,  4.2, -0.8,  7.2, 0.85, 0.46]
    ];
    for (const [ax, ay, az, bx, by, bz, r0, r1] of blades) {
      m.paintCapsule(ax, ay, az, bx, by, bz, r0, r1, mat('sedge'), partId.sedge, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 5. 露水浅滩鹅卵石（10×9×6，复用 2 块）
  // =========================================================================
  function buildShoalStone(makeCanvas) {
    const m = new VoxelModel(10, 9, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 2.2, 4.1, 3.5, 2.4, mat('stone'), partId.stone, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 5, centerZ: 2 });
  }

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t04_driftwood_weir',
    code: 'T04',
    name: '冲滩流木枝杈与砾滩',
    status: 'done',
    defaultHabitat: 'stoneBay',
    tag: 'T04 石缝河湾冲滩流木与水鸟落点',
    summary: '卡在浅滩鹅卵石间的苍白剥皮枯树杈，高对比浅灰白枯木撞蓝青河湾，枝杈间挂着一丛翠绿浅水莎草，正是衔石小鸟歇脚与投石激花的理想落点',
    footRadius: 18.0,
    ecoWeight: 2.6,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',        name: '浅水绕木', loop: true,  status: 'done' },
      { id: 'splash_drop', name: '投石溅花', loop: false, duration: 2.0, status: 'done' }
    ],
    blocks: ['浸水浅滩砾石床', '苍白剥皮冲滩主干与高翘枝杈', '翠绿浅水莎草丛', '卡木鹅卵石'],
    soulHabit: '浅水绕枯木流过泛出轻白水花、莎草轻摇；小鸟投石落入木边浅水时溅起一蓬清亮水花与扩散涟漪',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        gravelShoal:   buildGravelShoal(makeCanvas),
        driftwoodMain: buildDriftwoodMain(makeCanvas),
        driftwoodFork: buildDriftwoodFork(makeCanvas),
        sedgeClump:    buildSedgeClump(makeCanvas),
        shoalStone:    buildShoalStone(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0.12,
        shadowScale: 0.85,
        t: 0,
        sedgeShake: 0,
        foamCd: 0.55,
        rippleCd: 1.15,
        lastAction: 'idle',
        dropPhase: 0
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
          state.sedgeShake = 0;
          state.foamCd = 0.55;
          state.rippleCd = 1.15;
          state.lastAction = 'idle';
          state.dropPhase = 0;
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
            state.dropPhase = 0;
          }

          state.sedgeShake = 0;

          if (!vfx) return;

          if (action === 'idle') {
            // 浅水绕枯木流过泛出轻白水花与细涟漪
            state.foamCd -= dt;
            if (state.foamCd <= 0) {
              state.foamCd = 0.55 + Math.random() * 0.45;
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, (-10.0 + Math.random() * 16.0) * sMul, (3.2 + Math.random() * 3.5) * sMul);
              vfx.spawnParticle(
                wx, wy, 1.8 * sMul,
                Math.cos(state.yaw) * 4.5 * sMul,
                Math.sin(state.yaw) * 4.5 * sMul,
                1.6 * sMul,
                0.55 + Math.random() * 0.25,
                1.15,
                fx.foam,
                false,
                8
              );
            }

            state.rippleCd -= dt;
            if (state.rippleCd <= 0) {
              state.rippleCd = 1.7 + Math.random() * 0.8;
              const [rx, ry] = localToWorldXY(state.x, state.y, state.yaw, -9.5 * sMul, 4.5 * sMul);
              vfx.addRipple(rx, ry, 3.0 * sMul, 15.0 * sMul, 1.4, 1.2);
            }
          } else if (action === 'splash_drop') {
            const u = clamp(actionTime / 2.0, 0, 1);
            // 0.08s：小石子从枝杈上方落下；0.38s：砸中木边浅水溅起清亮水花与扩散涟漪
            if (state.dropPhase === 0 && actionTime >= 0.06) {
              state.dropPhase = 1;
              const [px, py] = localToWorldXY(state.x, state.y, state.yaw, 5.2 * sMul, 7.2 * sMul);
              vfx.spawnParticle(
                px, py, 16.5 * sMul,
                0.5 * sMul, 0.8 * sMul, -28.0 * sMul,
                0.36, 1.65, fx.pebble, false, 68
              );
            }
            if (state.dropPhase === 1 && actionTime >= 0.38) {
              state.dropPhase = 2;
              const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, 5.4 * sMul, 7.6 * sMul);
              vfx.addRipple(sx, sy, 2.2 * sMul, 22.0 * sMul, 1.35, 1.85);
              for (let k = 0; k < 14; k++) {
                const a = (k / 14) * TAU + Math.random() * 0.3;
                const sp = (5.5 + Math.random() * 11.5) * sMul;
                vfx.spawnParticle(
                  sx + Math.cos(a) * 1.4 * sMul,
                  sy + Math.sin(a) * 1.4 * sMul,
                  2.2 * sMul,
                  Math.cos(a) * sp,
                  Math.sin(a) * sp,
                  (9.5 + Math.random() * 10.5) * sMul,
                  0.45 + Math.random() * 0.3,
                  1.25 + Math.random() * 0.55,
                  k % 2 === 0 ? fx.splashA : fx.splashB,
                  false,
                  42
                );
              }
            }
            if (state.dropPhase === 2 && actionTime >= 0.72) {
              state.dropPhase = 3;
              const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, 5.4 * sMul, 7.6 * sMul);
              vfx.addRipple(sx, sy, 3.0 * sMul, 17.5 * sMul, 1.15, 1.35);
            }

            // 水花落点余波轻晃莎草
            const shakeEnv = smoothstep(0.36, 0.48, u) * (1 - smoothstep(0.62, 0.95, u));
            state.sedgeShake = Math.sin(actionTime * 18.0 * freq) * shakeEnv * 0.24;
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.t;
          const list = [];

          // 1. 浸水浅滩砾石床（submerge: 0.48）
          list.push({
            partKey: 'gravelShoal',
            asset: parts.gravelShoal,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            submerge: 0.48,
            bias: -0.35
          });

          // 2. 卡住流木的 2 块露水浅滩鹅卵石（复用同一资产）
          const [st1x, st1y] = localToWorldXY(state.x, state.y, yw, -3.6 * sMul, 5.6 * sMul);
          list.push({
            partKey: 'shoalStone',
            asset: parts.shoalStone,
            x: st1x,
            y: st1y,
            lift: 1.0 * sMul,
            ro: wrapAngle(yw + 0.4),
            bias: 0.06
          });

          const [st2x, st2y] = localToWorldXY(state.x, state.y, yw, 8.6 * sMul, -4.8 * sMul);
          list.push({
            partKey: 'shoalStone',
            asset: parts.shoalStone,
            x: st2x,
            y: st2y,
            lift: 1.2 * sMul,
            ro: wrapAngle(yw - 1.1),
            bias: -0.08
          });

          // 3. 苍白剥皮冲滩主枯木
          list.push({
            partKey: 'driftwoodMain',
            asset: parts.driftwoodMain,
            x: state.x,
            y: state.y,
            lift: 1.0 * sMul,
            ro: yw,
            bias: 0.0
          });

          // 4. 高翘流木枝杈（衔石小鸟歇脚点）
          const [fkx, fky] = localToWorldXY(state.x, state.y, yw, 7.6 * sMul, -1.6 * sMul);
          list.push({
            partKey: 'driftwoodFork',
            asset: parts.driftwoodFork,
            x: fkx,
            y: fky,
            lift: 5.4 * sMul,
            ro: wrapAngle(yw + 0.14),
            bias: 0.18
          });

          // 5. 枝杈间挂着的 2 丛翠绿浅水莎草（轻柔摇曳）
          const [sg1x, sg1y] = localToWorldXY(state.x, state.y, yw, 1.4 * sMul, 2.8 * sMul);
          list.push({
            partKey: 'sedgeClump',
            asset: parts.sedgeClump,
            x: sg1x,
            y: sg1y,
            lift: 2.2 * sMul,
            ro: wrapAngle(yw + Math.sin(t * 2.1) * 0.14 + state.sedgeShake),
            bias: 0.24
          });

          const [sg2x, sg2y] = localToWorldXY(state.x, state.y, yw, -7.8 * sMul, -3.2 * sMul);
          list.push({
            partKey: 'sedgeClump',
            asset: parts.sedgeClump,
            x: sg2x,
            y: sg2y,
            lift: 1.6 * sMul,
            ro: wrapAngle(yw + 1.8 + Math.sin(t * 1.9 + 1.5) * 0.12 - state.sedgeShake * 0.6),
            bias: -0.02
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
