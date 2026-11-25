'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T06 远洋漂浮地标 · 漂流巨藻筏与破木浮标（T06 远洋浮岛海域）
  //
  // 外观与视觉铁律：
  //   - 厚重橄榄绿 / 亮黄绿带圆气囊的巨海藻垫漂浮在深蓝大洋面
  //   - 中央缠着一只捆麻绳的暖棕漂流破木桶 + 倾斜红白条纹旧木航标柱
  //   - 随远洋长涌上下晃荡，在深蓝大浪上远近一眼分明
  //
  // 拆件与图集预算（单盒严格 <= 40 格，0 自亮键）：
  //   - kelpSub     (34×32×6,  lift=0,   bias=-0.20, submerge: 0.55)：水下拖曳厚巨藻裙
  //   - kelpMat     (32×30×8,  lift=2.2, bias=-0.05)：水上厚重橄榄绿巨藻垫与亮黄绿气囊
  //   - kelpFrond   (10×10×5,  lift=1.8, bias=-0.10, submerge: 0.35, symDeg: 90)：复用外缘漂浮藻尾 ×3
  //   - driftBarrel (14×14×13, lift=5.5, bias=+0.12)：捆麻绳的暖棕漂流破木桶
  //   - buoyPost    (14×14×22, lift=6.0, bias=+0.20)：倾斜红白条纹旧木航标柱
  //
  // 展示动作：
  //   - idle       ：随远洋长涌规律上下起伏、缓慢微转、荡开轻涟漪
  //   - swell_roll ：大浪推涌，巨藻筏连同旧浮标剧烈起伏并甩开一圈泡沫水滴
  // =========================================================================

  // 21 色独立色表（<= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 厚重橄榄绿巨藻叶垫
      kelpDark:    '#1f4216',
      kelpMid:     '#3f7824',
      kelpHi:      '#76b535',
      // 亮黄绿巨藻气囊球
      bladDark:    '#5f8f22',
      bladMid:     '#9ed439',
      bladHi:      '#d7fa6b',
      // 暖棕漂流旧木桶板
      woodDark:    '#4a2715',
      woodMid:     '#7d4626',
      woodHi:      '#b87242',
      // 粗麻绳捆扎与木桶铁箍
      ropeDark:    '#6b5535',
      ropeMid:     '#a6895a',
      ropeHi:      '#dbc08c',
      // 航标柱高饱和亮橙红条纹
      buoyRedDark: '#992214',
      buoyRedMid:  '#e64327',
      buoyRedHi:   '#ff8159',
      // 航标柱旧漆纯白条纹
      buoyWhtDark: '#aebac4',
      buoyWhtMid:  '#dbe4eb',
      buoyWhtHi:   '#f7fbff',
      // 铁箍深钢锈色
      ironDark:    '#232b33',
      ironMid:     '#43505c',
      ironHi:      '#6d7f8f'
    },
    glowKeys: [],
    parts: ['kelp', 'blad', 'wood', 'rope', 'buoyRed', 'buoyWht', 'iron'],
    noCrease: [
      ['kelp', 'blad'], ['wood', 'rope'], ['buoyRed', 'buoyWht']
    ],
    materials: {
      kelp:    ['kelpDark',    'kelpMid',    'kelpHi'],
      blad:    ['bladDark',    'bladMid',    'bladHi'],
      wood:    ['woodDark',    'woodMid',    'woodHi'],
      rope:    ['ropeDark',    'ropeMid',    'ropeHi'],
      buoyRed: ['buoyRedDark', 'buoyRedMid', 'buoyRedHi'],
      buoyWht: ['buoyWhtDark', 'buoyWhtMid', 'buoyWhtHi'],
      iron:    ['ironDark',    'ironMid',    'ironHi']
    },
    protectedParts: ['blad', 'buoyRed', 'buoyWht']
  });

  // 3 套零重建模换色皮肤（翠藻赤标 / 金藻白标 / 深褐沉木筏）
  const SKINS = [
    {
      id: 'emerald_kelp_red_buoy',
      name: '翠藻赤标',
      dot: '#e64327',
      outline: '#0d1a14',
      pal: {},
      fx: {
        foamA: '#f7fbff',
        foamB: '#bfe6f5',
        kelpA: '#9ed439',
        buoyA: '#e64327'
      }
    },
    {
      id: 'gold_kelp_white_buoy',
      name: '金藻白标',
      dot: '#d9c23b',
      outline: '#1a170b',
      pal: {
        kelpDark:    '#5c4c14', kelpMid: '#998223', kelpHi: '#d4bc3d',
        bladDark:    '#8a781b', bladMid: '#cfa92d', bladHi: '#ffe666',
        buoyRedDark: '#1b5c80', buoyRedMid:'#3190bd', buoyRedHi:'#75cef0',
        buoyWhtDark: '#bcc7cf', buoyWhtMid:'#e3ecf2', buoyWhtHi:'#ffffff'
      },
      fx: {
        foamA: '#ffffff',
        foamB: '#bfe6f5',
        kelpA: '#ffe666',
        buoyA: '#3190bd'
      }
    },
    {
      id: 'dark_driftwood_raft',
      name: '深褐沉木筏',
      dot: '#7d4626',
      outline: '#17110d',
      pal: {
        kelpDark:    '#1c3322', kelpMid: '#315938', kelpHi: '#598c58',
        bladDark:    '#4b6b28', bladMid: '#7aa33e', bladHi: '#b3d962',
        woodDark:    '#331b10', woodMid: '#59311d', woodHi: '#8a5233',
        buoyRedDark: '#9e4714', buoyRedMid:'#de7026', buoyRedHi:'#ffaa5c'
      },
      fx: {
        foamA: '#f7fbff',
        foamB: '#a9d2e3',
        kelpA: '#7aa33e',
        buoyA: '#de7026'
      }
    }
  ];

  // =========================================================================
  // 1. 水下拖曳厚巨藻裙（34×32×6，submerge: 0.55）
  // =========================================================================
  function buildKelpSub(makeCanvas) {
    const m = new VoxelModel(34, 32, 6, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-16.2, 16.2, -15.2, 15.2, 0, 5, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X, Y);
      // 放射状拖曳藻叶外轮廓
      const lobe = 11.8 + Math.sin(ang * 5 + 0.4) * 2.8 + Math.cos(ang * 3 - 0.8) * 1.8;
      if (r > lobe) return;
      const hMax = 4.6 - (r / lobe) * 2.6;
      if (z > hMax) return;
      m.setRaw(x, y, z, mat('kelp'), partId.kelp);
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 15.0, headZ: 5, centerZ: 2 });
  }

  // =========================================================================
  // 2. 水上厚重巨藻垫与亮黄绿气囊（32×30×8）
  // =========================================================================
  function buildKelpMat(makeCanvas) {
    const m = new VoxelModel(32, 30, 8, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-15.2, 15.2, -14.2, 14.2, 0, 7, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X * 0.96, Y * 1.04);
      const edge = 11.4 + Math.sin(ang * 5 + 0.4) * 2.3 + Math.cos(ang * 4) * 1.2;
      if (r > edge) return;
      const dome = 4.4 - (r / edge) * 2.2 + Math.sin(X * 0.45 + Y * 0.35) * 0.65;
      if (z > dome) return;
      m.setRaw(x, y, z, mat('kelp'), partId.kelp);
    });

    // 交错盘绕的粗巨藻茎带
    m.paintCapsule(-10.5, -4.2, 3.2, 10.2,  3.8, 3.6, 1.8, 1.5, mat('kelp'), partId.kelp, true);
    m.paintCapsule( -6.8,  8.4, 2.8,  8.4, -7.2, 3.2, 1.7, 1.4, mat('kelp'), partId.kelp, true);

    // 10 颗饱满醒目的亮黄绿巨藻气囊球
    const bladders = [
      [-9.2, -2.5, 4.4, 1.9],
      [-7.0,  5.8, 4.6, 2.0],
      [-2.2,  9.2, 4.2, 1.8],
      [ 4.8,  8.4, 4.4, 1.9],
      [ 9.8,  2.6, 4.2, 1.8],
      [ 8.6, -5.2, 4.5, 2.0],
      [ 2.2, -9.6, 4.2, 1.8],
      [-5.6, -8.8, 4.4, 1.9],
      [-1.5, -4.8, 5.2, 1.7],
      [ 5.4,  2.2, 5.0, 1.7]
    ];
    for (const [bx, by, bz, r] of bladders) {
      m.paintEllipsoid(bx, by, bz, r, r, r * 0.85, mat('blad'), partId.blad, true);
    }

    // 中央一截半埋藻垫的破旧漂流船板
    m.paintCapsule(-7.6, -1.8, 4.2, 7.2, 2.2, 4.8, 1.6, 1.5, mat('wood'), partId.wood, true);
    // 缠绕船板的麻绳
    m.paintCapsule(-3.2, -2.2, 5.4, -2.0, 1.4, 5.6, 0.9, 0.9, mat('rope'), partId.rope, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 14.0, headZ: 7, centerZ: 3.5 });
  }

  // =========================================================================
  // 3. 外缘漂浮巨藻尾簇（10×10×5，复用 3 簇，symDeg: 90）
  // =========================================================================
  function buildKelpFrond(makeCanvas) {
    const m = new VoxelModel(10, 10, 5, SPEC);
    const { mat, partId } = SPEC;

    m.paintEllipsoid(0, 0, 1.6, 4.0, 2.6, 1.2, mat('kelp'), partId.kelp, true);
    m.paintEllipsoid(-1.4, 0.6, 2.8, 1.5, 1.5, 1.3, mat('blad'), partId.blad, true);
    m.paintEllipsoid( 2.0, -0.5, 2.5, 1.3, 1.3, 1.1, mat('blad'), partId.blad, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 4, centerZ: 2 });
  }

  // =========================================================================
  // 4. 捆麻绳的暖棕漂流破木桶（14×14×13）
  // =========================================================================
  function buildDriftBarrel(makeCanvas) {
    const m = new VoxelModel(14, 14, 13, SPEC);
    const { mat, partId } = SPEC;

    // 略倾斜横卧/半陷在藻筏里的暖棕旧木桶
    m.fillAABB(-6.2, 6.2, -6.2, 6.2, 0, 12, (x, y, z, X, Y) => {
      // 沿 X 轴略倾的桶身
      const tiltX = X - (z - 5.5) * 0.22;
      const tiltZ = z - 5.4;
      const r = Math.hypot(Y, tiltZ);
      // 桶身中鼓两头略收
      const halfLen = 5.2;
      if (Math.abs(tiltX) > halfLen) return;
      const bulge = 4.6 - Math.pow(tiltX / halfLen, 2) * 0.9;
      if (r > bulge) return;

      // 一端破损豁口，露出一小块深色空腔
      if (tiltX > 3.6 && Y > 0.6 && tiltZ > 0.8 && r < bulge - 1.0) return;

      // 两道深钢铁箍 + 中央一圈粗麻绳捆扎
      const isHoop = Math.abs(Math.abs(tiltX) - 3.3) < 0.75;
      const isRope = Math.abs(tiltX) < 1.1;
      if (isRope && r > bulge - 1.1) {
        m.setRaw(x, y, z, mat('rope'), partId.rope);
      } else if (isHoop && r > bulge - 1.0) {
        m.setRaw(x, y, z, mat('iron'), partId.iron);
      } else {
        m.setRaw(x, y, z, mat('wood'), partId.wood);
      }
    });

    // 桶顶斜绕一根缠连到浮标的粗麻绳
    m.paintCapsule(-0.6, 2.2, 9.6, 3.8, 3.4, 7.6, 0.95, 0.85, mat('rope'), partId.rope, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 6.0, headZ: 11, centerZ: 5.5 });
  }

  // =========================================================================
  // 5. 倾斜红白条纹旧木航标柱（14×14×22）
  // =========================================================================
  function buildBuoyPost(makeCanvas) {
    const m = new VoxelModel(14, 14, 22, SPEC);
    const { mat, partId } = SPEC;

    // 底部木质浮箱底座 + 倾斜立柱（随高度向 +X / -Y 侧倾，极富漂流感）
    m.fillAABB(-6.2, 6.2, -6.2, 6.2, 0, 21, (x, y, z, X, Y) => {
      const cx = (z - 2) * 0.16;
      const cy = -(z - 2) * 0.08;
      const lx = X - cx;
      const ly = Y - cy;

      // 底座方木浮框（z=0..4）
      if (z <= 4) {
        if (Math.abs(lx) <= 4.2 && Math.abs(ly) <= 4.2) {
          const isBand = z === 2 && (Math.abs(lx) > 3.2 || Math.abs(ly) > 3.2);
          m.setRaw(x, y, z, isBand ? mat('iron') : mat('wood'), isBand ? partId.iron : partId.wood);
        }
        return;
      }

      // 倾斜八角/圆形航标主柱（z=5..20），红白相间高对比条纹
      const r = Math.hypot(lx, ly);
      const rad = z >= 18 ? 2.8 - (z - 18) * 0.35 : 2.35;
      if (r <= rad) {
        if (z <= 7) {
          m.setRaw(x, y, z, mat('rope'), partId.rope);
        } else {
          // 每 3 格一道亮红 / 纯白警示条纹
          const band = Math.floor((z - 8) / 3) % 2;
          m.setRaw(x, y, z, band === 0 ? mat('buoyRed') : mat('buoyWht'), band === 0 ? partId.buoyRed : partId.buoyWht);
        }
      }
    });

    // 航标上段一块倾斜横木牌（亮红漆旧航标板）
    m.paintCapsule(-1.4, -0.8, 15.6, 6.0, -1.6, 16.4, 1.25, 1.15, mat('buoyRed'), partId.buoyRed, true);
    m.paintEllipsoid(3.0, -1.4, 20.6, 1.8, 1.8, 1.4, mat('buoyWht'), partId.buoyWht, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 21, centerZ: 10 });
  }

  const SIDE_FRONDS = [
    { lx: -15.5, ly: -5.8, ro: 0.4, phase: 0.0 },
    { lx:  14.8, ly:  7.2, ro: 2.1, phase: 1.9 },
    { lx:  -3.6, ly: 15.2, ro: 1.2, phase: 3.7 }
  ];

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t06_floating_kelp',
    code: 'T06',
    name: '漂流巨藻筏与破木浮标',
    status: 'done',
    defaultHabitat: 'openSea',
    tag: 'T06 远洋漂流巨藻筏与旧木航标',
    summary: '厚重橄榄绿与亮黄绿带气囊的巨海藻垫，中央缠着捆麻绳的暖棕漂流破木桶与倾斜红白条纹旧木航标柱，随远洋长涌起伏摇晃',
    footRadius: 17.5,
    ecoWeight: 2.6,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',       name: '长涌起伏微转', loop: true,  status: 'done' },
      { id: 'swell_roll', name: '大浪推涌翻荡', loop: false, duration: 2.4, status: 'done' }
    ],
    blocks: ['水下厚巨藻裙与气囊藻垫', '捆麻绳漂流破木桶', '倾斜红白条纹旧木航标柱'],
    soulHabit: '平时随远洋长涌规律上下起伏、缓慢微转并荡开轻涟漪；大浪推涌时巨藻筏连同旧浮标剧烈起伏并甩开一圈泡沫水滴',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        kelpSub:     buildKelpSub(makeCanvas),
        kelpMat:     buildKelpMat(makeCanvas),
        kelpFrond:   buildKelpFrond(makeCanvas),
        driftBarrel: buildDriftBarrel(makeCanvas),
        buoyPost:    buildBuoyPost(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        bobZ: 0,
        rockYaw: 0,
        buoyRock: 0,
        driftX: 0,
        rippleClock: 1.0,
        lastAction: 'idle',
        rollFired: 0
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
          state.bobZ = 0;
          state.rockYaw = 0;
          state.buoyRock = 0;
          state.driftX = 0;
          state.rippleClock = 0.9;
          state.lastAction = 'idle';
          state.rollFired = 0;
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
            state.rollFired = 0;
          }

          // 基础远洋长涌规律起伏与缓慢微转
          state.bobZ = Math.sin(time * 1.55 * gFreq) * 0.95 * sMul;
          state.rockYaw = Math.sin(time * 0.72 * gFreq) * 0.09;
          state.buoyRock = Math.sin(time * 1.55 * gFreq - 0.5) * 0.12;
          state.driftX = Math.cos(time * 0.85 * gFreq) * 0.55 * sMul;

          if (action === 'idle') {
            state.rippleClock -= dt * gFreq;
            if (state.rippleClock <= 0 && vfx) {
              state.rippleClock = 1.55 + Math.random() * 0.85;
              vfx.addRipple(state.x, state.y, 11.0 * sMul, 20.5 * sMul, 1.6, 1.3);
            }
          } else if (action === 'swell_roll') {
            const u = clamp(actionTime / 2.4, 0, 1);
            // 0~0.38 大浪托高；0.38~0.68 跌入浪谷回荡；0.68~1.0 二次余波归稳
            const wave = Math.sin(u * Math.PI * 2.0) * Math.exp(-u * 1.25);
            state.bobZ = (wave * 3.6 + Math.sin(u * Math.PI) * 1.4) * sMul;
            state.rockYaw = Math.sin(u * Math.PI * 2.2) * 0.28 * (1 - u * 0.4);
            state.buoyRock = Math.sin(u * Math.PI * 3.0 - 0.4) * 0.34 * (1 - u * 0.35);
            state.driftX = Math.sin(u * Math.PI * 1.8) * 1.8 * sMul;

            const beats = [0.46, 1.18];
            while (state.rollFired < beats.length && actionTime >= beats[state.rollFired]) {
              if (vfx) {
                const isPeak = state.rollFired === 0;
                vfx.addRipple(state.x, state.y, 11.5 * sMul, (isPeak ? 25.0 : 21.0) * sMul, 1.55, isPeak ? 2.0 : 1.5);
                if (habitat && habitat.fx) vfx.spawnSplash(state.x, state.y, isPeak ? 12 : 8, isPeak ? 1.1 : 0.8, habitat.fx);

                // 甩开一圈泡沫水滴
                const count = isPeak ? 16 : 10;
                for (let k = 0; k < count; k++) {
                  const a = (k / count) * TAU + Math.random() * 0.25;
                  const rad = (10.5 + Math.random() * 3.5) * sMul;
                  const sp = (6.5 + Math.random() * 8.5) * sMul;
                  vfx.spawnParticle(
                    state.x + Math.cos(a) * rad,
                    state.y + Math.sin(a) * rad,
                    (2.6 + Math.random() * 4.0) * sMul,
                    Math.cos(a) * sp, Math.sin(a) * sp,
                    (6.5 + Math.random() * 7.5) * sMul,
                    0.58 + Math.random() * 0.32,
                    1.35,
                    k % 4 === 0 ? fx.kelpA : (k % 2 === 0 ? fx.foamA : fx.foamB),
                    false,
                    36
                  );
                }
              }
              state.rollFired++;
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = wrapAngle(state.yaw + state.rockYaw);
          const cx = state.x + state.driftX;
          const cy = state.y;
          const baseLift = Math.max(0.1, (0.8 * sMul) + state.bobZ);
          const list = [];

          // 1. 水下拖曳厚巨藻裙（submerge: 0.55）
          list.push({
            partKey: 'kelpSub',
            asset: parts.kelpSub,
            x: cx,
            y: cy,
            lift: Math.max(0, baseLift - 0.6 * sMul),
            ro: yw,
            bias: -0.20,
            submerge: 0.55
          });

          // 2. 外缘复用漂浮巨藻尾簇 ×3
          for (let i = 0; i < SIDE_FRONDS.length; i++) {
            const f = SIDE_FRONDS[i];
            const [fx, fy] = localToWorldXY(cx, cy, yw, f.lx * sMul, f.ly * sMul);
            list.push({
              partKey: 'kelpFrond',
              asset: parts.kelpFrond,
              x: fx,
              y: fy,
              lift: Math.max(0.2, baseLift + Math.sin(f.phase + state.bobZ * 1.4) * 0.45 * sMul),
              ro: wrapAngle(yw + f.ro),
              bias: -0.10,
              submerge: 0.35,
              symDeg: 90
            });
          }

          // 3. 水上厚重橄榄绿巨藻垫与亮黄绿气囊
          list.push({
            partKey: 'kelpMat',
            asset: parts.kelpMat,
            x: cx,
            y: cy,
            lift: baseLift + 1.4 * sMul,
            ro: yw,
            bias: -0.05
          });

          // 4. 中央缠绳暖棕漂流破木桶
          const [bx, by] = localToWorldXY(cx, cy, yw, -3.6 * sMul, 2.4 * sMul);
          list.push({
            partKey: 'driftBarrel',
            asset: parts.driftBarrel,
            x: bx,
            y: by,
            lift: baseLift + 4.4 * sMul,
            ro: wrapAngle(yw - 0.25 + state.buoyRock * 0.4),
            bias: 0.12
          });

          // 5. 倾斜红白条纹旧木航标柱
          const [px, py] = localToWorldXY(cx, cy, yw, 3.8 * sMul, -2.0 * sMul);
          list.push({
            partKey: 'buoyPost',
            asset: parts.buoyPost,
            x: px,
            y: py,
            lift: baseLift + 5.0 * sMul,
            ro: wrapAngle(yw + 0.18 + state.buoyRock),
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
