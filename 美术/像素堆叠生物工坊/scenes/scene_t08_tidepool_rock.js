'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T08 潮汐滩涂 · 潮汐泥礁与浅潮贝池
  //
  // 视觉层次：暗褐湿滑礁岩围出中央一汪清亮浅碧潮水池，岩壁密布高对比亮米白藤壶与
  // 墨绿垂挂海带，泥边散落象牙白/浅粉小贝壳堆（喂 特5 滩涂鱼人 与 特11 陆行八爪）。
  //
  // 拆件与图集预算（单盒严格 <= 40 格，0 自亮键）：
  //   - rockRing    (38×38×14, lift=0, submerge=0.34)：暗褐湿滑环形泥礁 + 密布亮米白藤壶
  //   - tidePool    (22×22×4,  lift=1.8, symDeg=90)：中央澄澈浅碧潮水池面 + 白沫池沿
  //   - kelpFrond   (8×12×10)：墨绿垂挂海带条（复用 3 处）
  //   - clamCluster (13×11×7)：象牙白/浅粉滩涂小贝壳堆（复用 2 处）
  // =========================================================================

  // 24 色独立色表（<= 48 色、0 重色、glowKeys: []）
  const SPEC = createPaletteSpec({
    pal: {
      // 暗褐湿滑礁岩
      rockDark:     '#2b221e',
      rockMid:      '#4f4038',
      rockHi:       '#7a665a',
      // 湿泥滩缘过渡
      mudDark:      '#38362c',
      mudMid:       '#5e5948',
      mudHi:        '#8a826a',
      // 醒目亮米白藤壶（拉开暗礁焦点）
      barnacleDark: '#9e9584',
      barnacleMid:  '#dfd6c3',
      barnacleHi:   '#fffaf0',
      // 中央清亮浅碧潮水池
      poolDark:     '#188a8c',
      poolMid:      '#38cfc8',
      poolHi:       '#a8fff6',
      // 潮池白沫水波缘
      foamDark:     '#70bdb8',
      foamMid:      '#baf2ec',
      foamHi:       '#effffc',
      // 墨绿垂挂海带
      kelpDark:     '#123b26',
      kelpMid:      '#236e42',
      kelpHi:       '#4ea864',
      // 象牙白小贝壳
      clamDark:     '#a89d8e',
      clamMid:      '#ebe2d3',
      clamHi:       '#fffcf5',
      // 浅粉小贝壳点缀
      pinkDark:     '#b56977',
      pinkMid:      '#f09eae',
      pinkHi:       '#ffd9e0'
    },
    glowKeys: [],
    parts: ['rock', 'mud', 'barnacle', 'pool', 'foam', 'kelp', 'clam', 'pink'],
    noCrease: [
      ['rock', 'mud'], ['pool', 'foam'], ['clam', 'pink']
    ],
    materials: {
      rock:     ['rockDark',     'rockMid',     'rockHi'],
      mud:      ['mudDark',      'mudMid',      'mudHi'],
      barnacle: ['barnacleDark', 'barnacleMid', 'barnacleHi'],
      pool:     ['poolDark',     'poolMid',     'poolHi'],
      foam:     ['foamDark',     'foamMid',     'foamHi'],
      kelp:     ['kelpDark',     'kelpMid',     'kelpHi'],
      clam:     ['clamDark',     'clamMid',     'clamHi'],
      pink:     ['pinkDark',     'pinkMid',     'pinkHi']
    },
    protectedParts: ['barnacle', 'pool', 'clam', 'pink']
  });

  // 3 套换色皮肤（湿泥青池、暖沙白贝、暗礁红藻）
  const SKINS = [
    {
      id: 'mud_cyan_pool',
      name: '湿泥青池',
      dot: '#38cfc8',
      outline: '#121a1a',
      pal: {},
      fx: {
        sprayA: '#f2ffff',
        sprayB: '#94f0e8',
        mudBit: '#7a705a'
      }
    },
    {
      id: 'warm_sand_clams',
      name: '暖沙白贝',
      dot: '#e6be8a',
      outline: '#1f1812',
      pal: {
        rockDark:     '#473526', rockMid:     '#7a5d42', rockHi:     '#b08c68',
        mudDark:      '#69573b', mudMid:      '#9e865c', mudHi:      '#d4bc8c',
        poolDark:     '#1d7ea6', poolMid:     '#42bce0', poolHi:     '#b3f2ff',
        kelpDark:     '#33521e', kelpMid:     '#578732', kelpHi:     '#8ec458',
        pinkDark:     '#c77f54', pinkMid:     '#f5b384', pinkHi:     '#ffe0c2'
      },
      fx: {
        sprayA: '#ffffff',
        sprayB: '#b3f2ff',
        mudBit: '#b89f72'
      }
    },
    {
      id: 'dark_reef_red_algae',
      name: '暗礁红藻',
      dot: '#c9384a',
      outline: '#14121a',
      pal: {
        rockDark:     '#222730', rockMid:     '#3d4554', rockHi:     '#657082',
        mudDark:      '#2d3336', mudMid:      '#4c5459', mudHi:      '#768085',
        poolDark:     '#1a7a78', poolMid:     '#35c4b8', poolHi:     '#a3fff5',
        kelpDark:     '#6e1627', kelpMid:     '#b82c43', kelpHi:     '#f26878',
        pinkDark:     '#b8496c', pinkMid:     '#f27ea0', pinkHi:     '#ffc9d9'
      },
      fx: {
        sprayA: '#f5ffff',
        sprayB: '#ffc2d1',
        mudBit: '#5a6369'
      }
    }
  ];

  // =========================================================================
  // 1. 环形暗褐湿滑泥礁与密布米白藤壶（38×38×14）
  // =========================================================================
  function buildRockRing(makeCanvas) {
    const m = new VoxelModel(38, 38, 14, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-18.5, 18.5, -18.5, 18.5, 0, 13, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      // 不规则环形礁壁：内半径 ~9.2 围出中央潮池，外半径 ~16.5，留一处低矮进潮缺口 (+Y 侧)
      const outerR = 16.2 + Math.sin(ang * 3 + 0.6) * 1.6 + Math.cos(ang * 5 - 0.4) * 0.9;
      const innerR = 9.0 + Math.cos(ang * 4 + 0.3) * 0.9;
      const gap = Math.abs(wrapAngle(ang - 1.35)) < 0.38 ? 0.42 : 1.0;

      // 环形隆起高度分布
      const ridgeU = clamp((r - innerR) / Math.max(1, outerR - innerR), 0, 1);
      const ridgeH = Math.sin(ridgeU * Math.PI) * (10.5 + Math.sin(ang * 2.0 + 1.1) * 2.2) * gap;

      if (r <= outerR && (z <= 1 || (r >= innerR && z <= ridgeH + 1.4))) {
        if (r < innerR && z <= 1) {
          m.setRaw(x, y, z, mat('mud'), partId.mud);
        } else if (z <= 1 && r > outerR - 2.2) {
          m.setRaw(x, y, z, mat('mud'), partId.mud);
        } else {
          m.setRaw(x, y, z, mat('rock'), partId.rock);
        }
      }
    });

    // 岩壁密布高对比亮米白藤壶簇（俯视 ×4 清晰可读）
    const barnacleSpots = [
      [-12.5,  3.5, 8.8], [-10.8, -7.2, 8.2], [-3.2, -12.6, 9.6],
      [  6.8, -11.4, 9.2], [ 12.8, -2.5, 8.5], [11.2,   6.8, 7.6],
      [ -7.2,  10.8, 7.4], [  0.8, -13.2, 7.2], [-13.4, -1.8, 6.4]
    ];
    for (let i = 0; i < barnacleSpots.length; i++) {
      const [bx, by, bz] = barnacleSpots[i];
      m.paintEllipsoid(bx, by, bz, 2.0, 1.85, 1.55, mat('barnacle'), partId.barnacle, true);
      m.paintEllipsoid(bx + 1.1, by - 0.8, bz - 0.6, 1.35, 1.25, 1.1, mat('barnacle'), partId.barnacle, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 17.2, headZ: 13, centerZ: 6 });
  }

  // =========================================================================
  // 2. 中央澄澈浅碧潮水池面（22×22×4，symDeg: 90）
  // =========================================================================
  function buildTidePool(makeCanvas) {
    const m = new VoxelModel(22, 22, 4, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-10.5, 10.5, -10.5, 10.5, 0, 3, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const maxR = 9.4 + Math.cos(ang * 4) * 0.65;
      if (r <= maxR && z <= 2) {
        if (z === 2 && r > maxR - 1.55) {
          m.setRaw(x, y, z, mat('foam'), partId.foam);
        } else if (z === 2 && Math.abs(r - 4.8) < 0.75 && Math.cos(ang * 4) > 0.2) {
          m.setRaw(x, y, z, mat('foam'), partId.foam);
        } else {
          m.setRaw(x, y, z, mat('pool'), partId.pool);
        }
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 9.8, headZ: 3, centerZ: 1 });
  }

  // =========================================================================
  // 3. 墨绿垂挂海带（8×12×10，复用 3 处）
  // =========================================================================
  function buildKelpFrond(makeCanvas) {
    const m = new VoxelModel(8, 12, 10, SPEC);
    const { mat, partId } = SPEC;
    // 主垂挂海带叶 + 副叶，沿 +Y 披挂下垂
    m.paintCapsule(0.0, -3.5, 8.2,  0.4,  0.5, 5.2, 1.55, 1.4, mat('kelp'), partId.kelp, true);
    m.paintCapsule(0.4,  0.5, 5.2, -0.3,  4.6, 1.6, 1.35, 0.95, mat('kelp'), partId.kelp, true);
    m.paintCapsule(-1.8, -2.6, 7.6, -2.0,  2.8, 2.2, 1.15, 0.85, mat('kelp'), partId.kelp, true);
    m.paintCapsule( 2.0, -2.2, 7.2,  2.2,  3.2, 2.6, 1.10, 0.80, mat('kelp'), partId.kelp, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 9, centerZ: 5 });
  }

  // =========================================================================
  // 4. 泥边象牙白/浅粉小贝壳堆（13×11×7，复用 2 处）
  // =========================================================================
  function buildClamCluster(makeCanvas) {
    const m = new VoxelModel(13, 11, 7, SPEC);
    const { mat, partId } = SPEC;
    // 5 枚高低错落、亮米白与浅粉相间的小贝壳
    m.paintEllipsoid(-2.4,  0.8, 2.1, 2.8, 2.2, 1.85, mat('clam'), partId.clam, true);
    m.paintEllipsoid( 2.2,  1.2, 2.2, 2.6, 2.1, 1.85, mat('pink'), partId.pink, true);
    m.paintEllipsoid( 0.0, -1.8, 2.5, 2.7, 2.2, 2.05, mat('clam'), partId.clam, true);
    m.paintEllipsoid(-3.2, -2.0, 1.7, 2.0, 1.8, 1.45, mat('pink'), partId.pink, true);
    m.paintEllipsoid( 3.0, -1.6, 1.8, 2.1, 1.8, 1.50, mat('clam'), partId.clam, true);
    m.paintEllipsoid( 0.2,  0.2, 4.1, 2.1, 1.8, 1.55, mat('clam'), partId.clam, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.6, headZ: 6, centerZ: 3 });
  }

  const KELP_SPOTS = [
    { lx: -12.6, ly: -5.4, lift: 2.0, ro: 2.5, phase: 0.0 },
    { lx:  11.8, ly: -7.6, lift: 2.2, ro: -0.6, phase: 2.1 },
    { lx:  -4.8, ly: 12.2, lift: 1.6, ro: 1.4, phase: 4.0 }
  ];

  const CLAM_SPOTS = [
    { lx:  7.8, ly: 13.8, ro: 0.4, phase: 0.0 },
    { lx: -9.6, ly: 11.4, ro: 2.1, phase: 1.7 }
  ];

  const Def = {
    id: 'scene_t08_tidepool_rock',
    code: 'T08',
    name: '潮汐泥礁与浅潮贝池',
    status: 'done',
    defaultHabitat: 'tideflat',
    tag: 'T08 潮汐滩涂 · 藤壶泥礁与喷水小贝堆',
    summary: '暗褐湿滑礁岩围出中央清亮浅碧潮池，岩壁密布亮米白藤壶与墨绿垂挂海带，泥边散落象牙白/浅粉小贝壳堆（喂 特5 鱼人与 特11 陆行八爪）',
    footRadius: 17.5,
    ecoWeight: 3.8,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',        name: '潮池轻漾', loop: true,  status: 'done' },
      { id: 'clam_squirt', name: '群贝喷水', loop: false, duration: 1.8, status: 'done' }
    ],
    blocks: ['藤壶密布暗褐泥礁环', '澄澈浅碧中央潮池', '滩涂小贝堆齐喷水柱'],
    soulHabit: '中央浅碧潮池微漪轻漾、垂挂海带随潮微摆、泥边小贝偶喷细水柱；受惊或退潮换气时群贝齐齐向空中噗嗤喷出细白水花与泥沫粒',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        rockRing:    buildRockRing(makeCanvas),
        tidePool:    buildTidePool(makeCanvas),
        kelpFrond:   buildKelpFrond(makeCanvas),
        clamCluster: buildClamCluster(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        time: 0,
        flex: 1.0,
        gFreq: 1.0,
        clamShake: 0,
        rippleClock: 1.0,
        squirtClock: 2.1,
        lastAction: 'idle',
        squirtWave: 0
      };

      let curSkin = SKINS[0];

      function spawnClamSquirt(vfx, sMul, spotIdx, jetCount, power) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const cs = CLAM_SPOTS[spotIdx % CLAM_SPOTS.length];
        const [cx, cy] = localToWorldXY(state.x, state.y, state.yaw, cs.lx * sMul, cs.ly * sMul);
        for (let i = 0; i < jetCount; i++) {
          const a = Math.random() * TAU;
          const sp = (2.8 + Math.random() * 5.2) * power * sMul;
          const isMud = i % 4 === 3;
          vfx.spawnParticle(
            cx + (Math.random() - 0.5) * 3.8 * sMul,
            cy + (Math.random() - 0.5) * 3.2 * sMul,
            (4.8 + Math.random() * 1.2) * sMul,
            Math.cos(a) * sp,
            Math.sin(a) * sp,
            (13.5 + Math.random() * 9.5) * power * sMul,
            0.55 + Math.random() * 0.30,
            isMud ? 1.35 : (1.2 + Math.random() * 0.35),
            isMud ? fx.mudBit : (i % 2 === 0 ? fx.sprayA : fx.sprayB),
            false,
            52
          );
        }
        vfx.addRipple(cx, cy, 2.4 * sMul, 9.5 * sMul, 0.72, 1.3);
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
          state.clamShake = 0;
          state.rippleClock = 0.8;
          state.squirtClock = 1.9;
          state.lastAction = 'idle';
          state.squirtWave = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          state.time = time;
          state.flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          state.gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);

          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.squirtWave = 0;
          }

          state.clamShake = 0;

          if (action === 'clam_squirt') {
            // 三波齐射细白水花与泥沫粒
            const waves = [0.12, 0.46, 0.86];
            while (state.squirtWave < waves.length && actionTime >= waves[state.squirtWave]) {
              spawnClamSquirt(vfx, sMul, 0, 6, 1.15);
              spawnClamSquirt(vfx, sMul, 1, 6, 1.10);
              if (vfx && state.squirtWave === 0) {
                vfx.addRipple(state.x, state.y, 3.0 * sMul, 10.5 * sMul, 0.9, 1.5);
              }
              state.squirtWave++;
            }
            const u = clamp(actionTime / 1.8, 0, 1);
            const env = Math.sin(clamp(u / 0.12, 0, 1) * Math.PI * 0.5) * (1 - smoothstep(0.62, 0.95, u));
            state.clamShake = Math.sin(actionTime * 42) * 0.42 * env * sMul;
          } else {
            // 常态：小潮池水面轻漾微漪、泥贝偶尔喷一小股细水柱
            state.rippleClock -= dt;
            if (state.rippleClock <= 0) {
              state.rippleClock = 1.55 + Math.random() * 0.85;
              if (vfx) vfx.addRipple(state.x, state.y, 1.8 * sMul, 8.6 * sMul, 1.25, 1.15);
            }
            state.squirtClock -= dt;
            if (state.squirtClock <= 0) {
              state.squirtClock = 2.6 + Math.random() * 1.4;
              const which = Math.random() > 0.5 ? 0 : 1;
              spawnClamSquirt(vfx, sMul, which, 4, 0.85);
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.time;
          const flex = state.flex;
          const gFreq = state.gFreq;
          const list = [];

          // 1. 环形暗褐湿滑泥礁（底脚浸潮水）
          list.push({
            partKey: 'rockRing',
            asset: parts.rockRing,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            submerge: 0.34,
            bias: -0.35
          });

          // 2. 中央清亮浅碧潮水池面（轻微潮息起伏）
          const poolBob = Math.sin(t * 1.8 * gFreq) * 0.16 * sMul;
          list.push({
            partKey: 'tidePool',
            asset: parts.tidePool,
            x: state.x,
            y: state.y,
            lift: 1.8 * sMul + poolBob,
            ro: yw,
            opacity: 0.88,
            bias: 0.10,
            symDeg: 90
          });

          // 3. 岩壁墨绿垂挂海带（复用 3 处，随水轻晃）
          for (let i = 0; i < KELP_SPOTS.length; i++) {
            const ks = KELP_SPOTS[i];
            const [kx, ky] = localToWorldXY(state.x, state.y, yw, ks.lx * sMul, ks.ly * sMul);
            const sway = Math.sin(t * 2.0 * gFreq + ks.phase) * 0.28 * flex * sMul;
            list.push({
              partKey: 'kelpFrond',
              asset: parts.kelpFrond,
              x: kx + sway,
              y: ky + sway * 0.5,
              lift: ks.lift * sMul,
              ro: wrapAngle(yw + ks.ro + Math.sin(t * 1.7 * gFreq + ks.phase) * 0.10 * flex),
              submerge: 0.22,
              bias: 0.45
            });
          }

          // 4. 泥边象牙白/浅粉小贝壳堆（复用 2 处）
          for (let i = 0; i < CLAM_SPOTS.length; i++) {
            const cs = CLAM_SPOTS[i];
            const [cx, cy] = localToWorldXY(state.x, state.y, yw, cs.lx * sMul, cs.ly * sMul);
            const dir = i === 0 ? 1 : -1;
            list.push({
              partKey: 'clamCluster',
              asset: parts.clamCluster,
              x: cx + state.clamShake * dir,
              y: cy,
              lift: 0,
              ro: wrapAngle(yw + cs.ro),
              submerge: 0.30,
              bias: 0.30
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
