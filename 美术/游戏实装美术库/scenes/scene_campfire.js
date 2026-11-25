'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // S04 标杆 · 营地暖火堆（scenes/scene_campfire.js）
  // -------------------------------------------------------------------------
  // 拆件（全部 <= 28×28×22，严守 28MB 图集与 40 格红线）：
  //   1. stoneRing  (26×26×7, symDeg: 90)  : 青灰围火圆石圈 + 中央灰炭底床
  //   2. logPile    (18×18×8, symDeg: 90)  : 交叉焦褐木柴底座
  //   3. emberBed   (14×14×5, symDeg: 90)  : 低热余炭床（low_heat 态主角）
  //   4. flameOuter (14×14×15, symDeg: 90) : 外层赤红/暖橘跳动火舌（进 glowKeys）
  //   5. flameMid   (11×11×14, symDeg: 90) : 中层亮橘黄火冠（错相微跃）
  //   6. flameInner (7×7×11, symDeg: 90)   : 内层炽黄火苗芯（高低错相）
  //   7. potRack    (22×12×20, symDeg: 360): 旁配木架铁汤锅与炖汤（可切换）
  // 严禁常态 scaleX/scaleY 拉伸；仅火苗芯 4 色进 glowKeys；22 色 0 重色 0 禁用字
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 青灰围火圆石（3 档）
      stoneDark:   '#3b444f',
      stoneMid:    '#5e6b78',
      stoneHi:     '#8c9ba8',
      // 石缝微苔点缀（3 档）
      mossDark:    '#2c572b',
      mossMid:     '#478241',
      mossHi:      '#76b562',
      // 焦褐木柴与木架（3 档）
      woodDark:    '#4a2d1b',
      woodMid:     '#784b2c',
      woodHi:      '#ab7448',
      // 炭黑焦木端与炉底灰床（3 档）
      charDark:    '#1c1a1d',
      charMid:     '#332f33',
      charHi:      '#524c50',
      // 铁汤锅与吊链（3 档，绝不进 glowKeys）
      ironDark:    '#232830',
      ironMid:     '#3f4754',
      ironHi:      '#6c788a',
      // 汤锅内浓汤与蔬料（3 档）
      stewDark:    '#9c3d1e',
      stewMid:     '#d46528',
      stewHi:      '#f5a83d',
      // 真火苗芯 4 档（仅此 4 键进 glowKeys）
      flameRed:    '#d93218',
      flameOrange: '#ff731a',
      flameYellow: '#ffc933',
      flameCore:   '#fff6b3'
    },
    glowKeys: ['flameRed', 'flameOrange', 'flameYellow', 'flameCore'],
    parts: ['stone', 'moss', 'wood', 'char', 'iron', 'stew', 'flame'],
    noCrease: [
      ['stone', 'moss'],
      ['wood', 'char'],
      ['iron', 'stew'],
      ['char', 'flame'],
      ['wood', 'flame']
    ],
    materials: {
      stone: ['stoneDark', 'stoneMid', 'stoneHi'],
      moss:  ['mossDark',  'mossMid',  'mossHi'],
      wood:  ['woodDark',  'woodMid',  'woodHi'],
      char:  ['charDark',  'charMid',  'charHi'],
      iron:  ['ironDark',  'ironMid',  'ironHi'],
      stew:  ['stewDark',  'stewMid',  'stewHi']
    },
    protectedParts: ['flame', 'stew']
  });

  // 3 套零重建模换色皮肤（每套 22 色 0 重色 0 禁用字）
  const SKINS = [
    {
      id: 'forest_warm',
      name: '林地暖橘柴火',
      dot: '#ff731a',
      outline: '#120f12',
      pal: {},
      fx: {
        sparkA: '#ff731a',
        sparkB: '#ffc933',
        coal:   '#d93218',
        smoke:  '#b8bec4',
        halo:   '#ff9e42',
        steam:  '#e8ece8'
      }
    },
    {
      id: 'ruins_jade',
      name: '遗迹青碧冷火',
      dot: '#2ee6b8',
      outline: '#0c1618',
      pal: {
        stoneDark:   '#2c3c40', stoneMid:  '#496166', stoneHi:  '#749196',
        mossDark:    '#1f4f3c', mossMid:   '#327d5e', mossHi:   '#59b88c',
        woodDark:    '#38332c', woodMid:   '#5e564a', woodHi:   '#8a7f6d',
        charDark:    '#141d21', charMid:   '#26353b', charHi:   '#3e535c',
        ironDark:    '#1d2b30', ironMid:   '#354b54', ironHi:   '#5c7985',
        stewDark:    '#1a6b61', stewMid:   '#2da392', stewHi:   '#6ee0c8',
        flameRed:    '#108c7a', flameOrange: '#1fd4a8', flameYellow: '#6ef7d2', flameCore: '#d9fff5'
      },
      fx: {
        sparkA: '#1fd4a8',
        sparkB: '#6ef7d2',
        coal:   '#108c7a',
        smoke:  '#9eb8ba',
        halo:   '#4de8c0',
        steam:  '#d4f2ed'
      }
    },
    {
      id: 'volcano_crimson',
      name: '火山赤烈熔火',
      dot: '#ff3b1f',
      outline: '#170a0a',
      pal: {
        stoneDark:   '#241d21', stoneMid:  '#3d3138', stoneHi:  '#614f58',
        mossDark:    '#572b1b', mossMid:   '#8a4429', mossHi:   '#bf643b',
        woodDark:    '#331914', woodMid:   '#572b21', woodHi:   '#854433',
        charDark:    '#140f12', charMid:   '#291f24', charHi:   '#45353c',
        ironDark:    '#1c1a24', ironMid:   '#343042', ironHi:   '#57506b',
        stewDark:    '#a82414', stewMid:   '#e6491e', stewHi:   '#ff9138',
        flameRed:    '#c91818', flameOrange: '#ff441a', flameYellow: '#ff9c24', flameCore: '#fff099'
      },
      fx: {
        sparkA: '#ff441a',
        sparkB: '#ff9c24',
        coal:   '#c91818',
        smoke:  '#7a7075',
        halo:   '#ff5e2b',
        steam:  '#f0c8b4'
      }
    }
  ];

  // 1. 青灰围火圆石圈 + 中央灰炭底床（26×26×7，四重对称 symDeg: 90）
  function buildStoneRing(makeCanvas) {
    const W = 26, D = 26, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 中央灰炭底床（r <= 8.2, z = 0..1）
    m.fillAABB(-9, 9, -9, 9, 0, 2, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      if (z === 0 && r <= 8.4) {
        m.setRaw(x, y, z, mat('char'), partId.char);
      } else if (z === 1 && r <= 6.8) {
        m.setRaw(x, y, z, mat('char'), partId.char);
      }
    });

    // 8 颗四重对称分布的圆润围火石（每象限 2 颗，大小微错落）
    const stoneAngles = [
      { a: 0.36, r: 9.6, rx: 3.1, ry: 2.7, rz: 2.8, moss: true },
      { a: 1.18, r: 9.8, rx: 2.8, ry: 3.0, rz: 2.5, moss: false }
    ];
    for (let q = 0; q < 4; q++) {
      const baseA = q * (Math.PI * 0.5);
      for (const s of stoneAngles) {
        const ang = baseA + s.a;
        const cx = Math.cos(ang) * s.r;
        const cy = Math.sin(ang) * s.r;
        m.paintEllipsoid(cx, cy, 2.3, s.rx, s.ry, s.rz, mat('stone'), partId.stone, true);
        if (s.moss) {
          const mx = Math.cos(ang) * (s.r + 1.8);
          const my = Math.sin(ang) * (s.r + 1.8);
          m.paintEllipsoid(mx, my, 1.4, 1.3, 1.3, 1.1, mat('moss'), partId.moss, true);
        }
      }
    }

    // 压平底面保证紧贴地面
    m.fillAABB(-12, 12, -12, 12, 0, 0, (x, y, z) => {
      if (!m.getId(x, y, 0) && m.getId(x, y, 1)) {
        m.setRaw(x, y, 0, m.getId(x, y, 1), m.getPartId(x, y, 1));
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 12.5, headZ: H, centerZ: 3 });
  }

  // 2. 交叉焦褐木柴底座（18×18×8，四重对称 symDeg: 90）
  function buildLogPile(makeCanvas) {
    const W = 18, D = 18, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 4 根四重对称斜交叉粗木柴（外低内高聚拢，中段焦黑炭化）
    for (let q = 0; q < 4; q++) {
      const ang = q * (Math.PI * 0.5) + Math.PI * 0.25;
      const ox = Math.cos(ang) * 6.8;
      const oy = Math.sin(ang) * 6.8;
      const ix = Math.cos(ang) * 1.4;
      const iy = Math.sin(ang) * 1.4;
      m.paintCapsule(ox, oy, 1.5, ix, iy, 5.2, 1.85, 1.45, mat('wood'), partId.wood, true);
      // 内端焦黑炭化段
      const cx = Math.cos(ang) * 2.5;
      const cy = Math.sin(ang) * 2.5;
      m.paintCapsule(cx, cy, 4.1, ix * 0.6, iy * 0.6, 5.5, 1.4, 1.1, mat('char'), partId.char, true);
    }

    // 底层井字横柴增强俯视立体结构
    m.paintCapsule(-6.0, -3.2, 1.6, 6.0, -3.2, 1.6, 1.35, 1.35, mat('wood'), partId.wood, false);
    m.paintCapsule(-6.0,  3.2, 1.6, 6.0,  3.2, 1.6, 1.35, 1.35, mat('wood'), partId.wood, false);
    m.paintCapsule(-3.2, -6.0, 2.2, -3.2, 6.0, 2.2, 1.25, 1.25, mat('wood'), partId.wood, false);
    m.paintCapsule( 3.2, -6.0, 2.2,  3.2, 6.0, 2.2, 1.25, 1.25, mat('wood'), partId.wood, false);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.5, headZ: H, centerZ: 4 });
  }

  // 3. 低热余炭床（14×14×5，symDeg: 90，带暗红/橘红火炭核）
  function buildEmberBed(makeCanvas) {
    const W = 14, D = 14, H = 5;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-6, 6, -6, 6, 0, H - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const maxR = 5.4 - z * 0.95;
      if (r > maxR) return;
      if (z === 0) {
        m.setRaw(x, y, z, mat('char'), partId.char);
        return;
      }
      const ax = Math.abs(Math.round(X));
      const ay = Math.abs(Math.round(Y));
      if (r <= 2.3 && z >= 2) {
        m.setRaw(x, y, z, keyToId.flameOrange, partId.flame);
      } else if ((ax + ay) % 2 === 0 && r <= 4.0 && z >= 1) {
        m.setRaw(x, y, z, keyToId.flameRed, partId.flame);
      } else {
        m.setRaw(x, y, z, mat('char'), partId.char);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.0, headZ: H, centerZ: 2 });
  }

  // 4. 分层自亮火苗体素（外层/中层/内芯三套错相资产，仅此进 glowKeys）
  function buildFlameLayer(makeCanvas, layerKind) {
    const cfg = layerKind === 'outer'
      ? { w: 14, d: 14, h: 15, baseR: 5.2, topZ: 13.5, lobes: 4, colA: 'flameRed', colB: 'flameOrange' }
      : layerKind === 'mid'
        ? { w: 11, d: 11, h: 14, baseR: 3.7, topZ: 12.8, lobes: 4, colA: 'flameOrange', colB: 'flameYellow' }
        : { w: 7,  d: 7,  h: 11, baseR: 2.2, topZ: 9.8,  lobes: 4, colA: 'flameYellow', colB: 'flameCore' };

    const m = new VoxelModel(cfg.w, cfg.d, cfg.h, SPEC);
    const { keyToId, partId } = SPEC;
    const hw = Math.floor(cfg.w * 0.5);

    m.fillAABB(-hw, hw, -hw, hw, 0, cfg.h - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const u = clamp(z / cfg.topZ, 0, 1);
      const ang = Math.atan2(Y, X);
      // 向上自然螺旋微扭 + 4 瓣火焰舌尖轮廓（四重对称 symDeg: 90）
      const twist = ang + u * 1.15;
      const lobeWave = 0.78 + 0.28 * Math.cos(twist * cfg.lobes);
      const radiusAtZ = cfg.baseR * Math.pow(1 - u * 0.92, 0.72) * lobeWave;
      if (r > radiusAtZ || z > cfg.topZ) return;

      // 底部偏外色，中上核心偏亮色
      const innerRatio = r / Math.max(0.5, radiusAtZ);
      const useBright = (innerRatio < 0.58 && u > 0.12 && u < 0.85) || (layerKind === 'inner' && innerRatio < 0.65);
      m.setRaw(x, y, z, useBright ? keyToId[cfg.colB] : keyToId[cfg.colA], partId.flame);
    });

    m.despeckle();
    return m.toStripAsset(makeCanvas, { footRadius: cfg.baseR, headZ: cfg.h, centerZ: Math.round(cfg.h * 0.45) });
  }

  // 5. 旁配木架铁汤锅（22×12×20，symDeg: 360，锅与汤绝不进 glowKeys）
  function buildPotRack(makeCanvas) {
    const W = 22, D = 12, H = 20;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 左右两根略外八的粗木立柱 + 顶部斜杈
    m.paintCapsule(-8.5, 0, 0.5, -7.2, 0, 17.5, 1.35, 1.1, mat('wood'), partId.wood, true);
    m.paintCapsule( 8.5, 0, 0.5,  7.2, 0, 17.5, 1.35, 1.1, mat('wood'), partId.wood, true);
    // 底部斜撑脚
    m.paintCapsule(-8.8, -3.0, 0.5, -7.8, 0, 9.5, 1.0, 0.9, mat('wood'), partId.wood, true);
    m.paintCapsule( 8.8, -3.0, 0.5,  7.8, 0, 9.5, 1.0, 0.9, mat('wood'), partId.wood, true);
    // 顶部横梁
    m.paintCapsule(-9.2, 0, 16.5, 9.2, 0, 16.5, 1.15, 1.15, mat('wood'), partId.wood, true);

    // 中央铁吊钩（细铁链，x = 0, y = 0, z = 11..16）
    m.paintCapsule(0, 0, 10.5, 0, 0, 16.2, 0.75, 0.75, mat('iron'), partId.iron, true);
    // 锅耳提梁弧
    m.paintCapsule(-3.8, 0, 9.5, 0, 0, 12.2, 0.65, 0.65, mat('iron'), partId.iron, true);
    m.paintCapsule( 3.8, 0, 9.5, 0, 0, 12.2, 0.65, 0.65, mat('iron'), partId.iron, true);

    // 悬挂铸铁圆肚汤锅（中心 z = 6.2，底部悬空留出火势空间）
    m.paintEllipsoid(0, 0, 6.2, 4.4, 4.4, 3.6, mat('iron'), partId.iron, true);
    // 锅口宽卷边（z = 9）
    m.fillAABB(-5, 5, -5, 5, 8, 9, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      if (z === 9 && r >= 3.2 && r <= 4.7) {
        m.setRaw(x, y, z, mat('iron'), partId.iron);
      } else if (z === 8 && r <= 3.4) {
        // 锅内浓汤液面（暖橘红炖汤 + 几粒翠绿香草点）
        const isHerb = (Math.abs(Math.round(X)) === 1 && Math.abs(Math.round(Y)) === 1);
        m.setRaw(x, y, z, isHerb ? mat('moss') : mat('stew'), isHerb ? partId.moss : partId.stew);
      } else if (z === 9 && r < 3.2) {
        // 挖空锅口正上方一格露出汤面
        m.setRaw(x, y, z, 0, 0);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.5, headZ: H, centerZ: 10 });
  }

  // =========================================================================
  // 资产定义：S04 营地暖火堆（注册为 'scene'）
  // =========================================================================
  const SceneCampfireDef = {
    id: 'scene_campfire',
    code: 'S04',
    name: '营地暖火堆',
    status: 'done',
    tag: 'S04 标杆 · 营地歇脚动态火源',
    summary: '青灰围火圆石圈、交叉焦褐木柴底座与 3 层错相跳动的自亮火苗体素，旁配可切换木架铁汤锅；支持常燃待机、添柴爆旺（喷涌暖橘火屑）与低热余炭三态及 3 套换色皮肤',
    defaultHabitat: 'forest',
    footRadius: 15.0,
    ecoWeight: 1.4,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '青灰围火圆石圈与交叉焦褐木柴底座',
      '三层错相自亮火苗体素（仅火苗芯进 glowKeys）',
      '旁配木架铁汤锅（可切换显示）与微沸蒸汽',
      '持续上升暖橘火屑、淡灰轻烟与地面暖晕粒子',
      '常燃 / 添柴爆旺 / 低热余炭多态动作与 3 套皮肤'
    ],
    actions: [
      { id: 'idle',     name: '常燃暖火（跳动火苗+轻烟）', loop: true,  status: 'done' },
      { id: 'stoke',    name: '添柴爆旺（跃高+密集火屑）', loop: false, duration: 2.2, status: 'done' },
      { id: 'low_heat', name: '低热余炭（暗红余炭+细烟）', loop: true,  status: 'done' },
      { id: 'no_pot',   name: '纯火堆（收起木架汤锅）',    loop: true,  status: 'done' }
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
        stoneRing:  buildStoneRing(makeCanvas),
        logPile:    buildLogPile(makeCanvas),
        emberBed:   buildEmberBed(makeCanvas),
        flameOuter: buildFlameLayer(makeCanvas, 'outer'),
        flameMid:   buildFlameLayer(makeCanvas, 'mid'),
        flameInner: buildFlameLayer(makeCanvas, 'inner'),
        potRack:    buildPotRack(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.25;
      let curSkin = SKINS[0];

      const state = {
        x: hx0,
        y: hy0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        shadowScale: 1.0,
        action: 'idle',
        showPot: opts.showPot !== false,
        // 3 层火苗独立错相位移与转角
        outerLift: 3.6,
        midLift:   4.4,
        innerLift: 5.0,
        outerYaw:  hyaw0,
        midYaw:    hyaw0 + 0.5,
        innerYaw:  hyaw0 + 1.1,
        outerOx:   0,
        outerOy:   0,
        midOx:     0,
        midOy:     0,
        potYaw:    hyaw0,
        potLift:   0,
        stokeBoost: 0,
        // 粒子发射计时器
        sparkCd: 0,
        smokeCd: 0,
        steamCd: 0,
        haloCd:  0
      };

      const instance = {
        def: SceneCampfireDef,
        cachePrefix: `scene_campfire_${Math.random().toString(36).slice(2, 7)}`,
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

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.outerYaw = homeYaw;
          state.midYaw = homeYaw + 0.5;
          state.innerYaw = homeYaw + 1.1;
          state.potYaw = homeYaw;
          state.sparkCd = 0;
          state.smokeCd = 0;
          state.steamCd = 0;
          state.haloCd = 0;
          state.stokeBoost = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          state.action = action;
          state.showPot = (action !== 'no_pot') && (opts.showPot !== false);

          // 添柴爆旺包络（0..1，前 0.25s 猛冲跃高，中段旺燃抖动，尾段柔和回落）
          let stokeEnv = 0;
          if (action === 'stoke') {
            const u = clamp(actionTime / 2.2, 0, 1);
            const rise = smoothstep(0.0, 0.18, u);
            const fall = 1 - smoothstep(0.62, 1.0, u);
            stokeEnv = rise * fall;
          }
          state.stokeBoost = stokeEnv;

          const isLow = (action === 'low_heat');
          const t = time * freq;

          // 三层火苗错相抖动与高低微跃（严禁使用 scaleX/scaleY）
          const jumpAmp = (1 + stokeEnv * 1.45);
          state.outerLift = (3.4 + Math.sin(t * 7.2) * 0.65 * jumpAmp + stokeEnv * 2.8) * sMul;
          state.midLift   = (4.3 + Math.sin(t * 9.6 + 1.7) * 0.85 * jumpAmp + stokeEnv * 4.2) * sMul;
          state.innerLift = (5.0 + Math.sin(t * 12.4 + 3.4) * 0.95 * jumpAmp + stokeEnv * 5.1) * sMul;

          state.outerYaw = state.yaw + t * (1.15 + stokeEnv * 1.4);
          state.midYaw   = state.yaw - t * (1.55 + stokeEnv * 1.8) + 0.6;
          state.innerYaw = state.yaw + t * (2.10 + stokeEnv * 2.1) + 1.2;

          state.outerOx = Math.sin(t * 6.3) * (0.45 + stokeEnv * 0.4) * sMul;
          state.outerOy = Math.cos(t * 5.7) * (0.45 + stokeEnv * 0.4) * sMul;
          state.midOx   = Math.cos(t * 8.1 + 1.2) * (0.55 + stokeEnv * 0.5) * sMul;
          state.midOy   = Math.sin(t * 7.4 + 0.8) * (0.55 + stokeEnv * 0.5) * sMul;

          // 木架铁汤锅微晃
          state.potYaw = state.yaw + 0.35 + Math.sin(t * 2.1) * 0.03;
          state.potLift = 0;

          if (!vfx) return;

          // 1. 持续上升的暖橘火屑 / 炭粒（stoke 时密集喷涌）
          state.sparkCd -= dt;
          const sparkInterval = isLow ? 0.52 : (action === 'stoke' ? 0.045 : 0.14);
          if (state.sparkCd <= 0) {
            state.sparkCd = sparkInterval;
            const burst = (action === 'stoke' && stokeEnv > 0.3) ? 3 : 1;
            for (let i = 0; i < burst; i++) {
              const a = Math.random() * TAU;
              const rr = Math.random() * (isLow ? 3.5 : 4.8) * sMul;
              const sp = (isLow ? 1.5 : (2.8 + stokeEnv * 7.5)) * sMul;
              const vz = (isLow ? 6.5 : (13.0 + Math.random() * 8.0 + stokeEnv * 14.0)) * sMul;
              const col = isLow ? fx.coal : ((i % 2 === 0) ? fx.sparkA : fx.sparkB);
              vfx.spawnParticle(
                state.x + Math.cos(a) * rr,
                state.y + Math.sin(a) * rr,
                (isLow ? 3.5 : 7.5) * sMul,
                Math.cos(a) * sp,
                Math.sin(a) * sp,
                vz,
                (isLow ? 0.85 : 0.75) + Math.random() * 0.45,
                (isLow ? 0.95 : 1.15) + Math.random() * 0.5,
                col,
                true,
                stokeEnv > 0.25 ? 8.5 : 2.0
              );
            }
          }

          // 2. 淡灰轻烟（无自亮，缓慢袅袅上升）
          state.smokeCd -= dt;
          const smokeInterval = isLow ? 0.26 : (action === 'stoke' ? 0.18 : 0.30);
          if (state.smokeCd <= 0) {
            state.smokeCd = smokeInterval;
            const a = Math.random() * TAU;
            vfx.spawnParticle(
              state.x + Math.cos(a) * 2.2 * sMul,
              state.y + Math.sin(a) * 2.2 * sMul,
              (isLow ? 4.8 : 13.5 + stokeEnv * 3.5) * sMul,
              (Math.cos(time * 0.8) * 2.4 + (Math.random() - 0.5) * 1.8) * sMul,
              (Math.sin(time * 0.7) * 1.8 + (Math.random() - 0.5) * 1.8) * sMul,
              (isLow ? 5.2 : 7.8) * sMul,
              1.15 + Math.random() * 0.55,
              (isLow ? 1.5 : 2.1) + Math.random() * 0.8,
              fx.smoke,
              false,
              -0.8
            );
          }

          // 3. 铁汤锅热气微粒（显示汤锅且非低热态时）
          if (state.showPot && !isLow) {
            state.steamCd -= dt;
            if (state.steamCd <= 0) {
              state.steamCd = 0.42;
              const [px, py] = localToWorldXY(state.x, state.y, state.yaw, 13.5 * sMul, -4.2 * sMul);
              vfx.spawnParticle(
                px + (Math.random() - 0.5) * 2.4 * sMul,
                py + (Math.random() - 0.5) * 2.4 * sMul,
                10.2 * sMul,
                (Math.random() - 0.5) * 1.5 * sMul,
                (Math.random() - 0.5) * 1.5 * sMul,
                6.2 * sMul,
                0.75 + Math.random() * 0.3,
                1.45,
                fx.steam,
                false,
                -0.5
              );
            }
          }

          // 4. 围石圈边缘暖晕微粒（低空缓慢飘浮，强化营地暖意）
          state.haloCd -= dt;
          if (state.haloCd <= 0 && !isLow) {
            state.haloCd = action === 'stoke' ? 0.16 : 0.34;
            const a = Math.random() * TAU;
            const r = (7.2 + Math.random() * 4.5) * sMul;
            vfx.spawnParticle(
              state.x + Math.cos(a) * r,
              state.y + Math.sin(a) * r,
              1.8 * sMul,
              Math.cos(a) * 1.2 * sMul,
              Math.sin(a) * 1.2 * sMul,
              2.2 * sMul,
              0.65,
              1.25,
              fx.halo,
              true,
              0
            );
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const list = [
            {
              partKey: 'stoneRing',
              asset: parts.stoneRing,
              x: state.x,
              y: state.y,
              lift: 0,
              ro: state.yaw,
              symDeg: 90,
              bias: -0.35
            },
            {
              partKey: 'logPile',
              asset: parts.logPile,
              x: state.x,
              y: state.y,
              lift: 1.0 * sMul,
              ro: state.yaw,
              symDeg: 90,
              bias: -0.05
            },
            {
              partKey: 'emberBed',
              asset: parts.emberBed,
              x: state.x,
              y: state.y,
              lift: (state.action === 'low_heat' ? 1.8 : 1.3) * sMul,
              ro: state.yaw,
              symDeg: 90,
              bias: 0.05
            }
          ];

          // 常燃 / 添柴爆旺 / 纯火堆：叠放 3 层错相跳动自亮火苗
          if (state.action !== 'low_heat') {
            list.push(
              {
                partKey: 'flameOuter',
                asset: parts.flameOuter,
                x: state.x + state.outerOx,
                y: state.y + state.outerOy,
                lift: state.outerLift,
                ro: state.outerYaw,
                symDeg: 90,
                noOutline: true,
                bias: 0.25
              },
              {
                partKey: 'flameMid',
                asset: parts.flameMid,
                x: state.x + state.midOx,
                y: state.y + state.midOy,
                lift: state.midLift,
                ro: state.midYaw,
                symDeg: 90,
                noOutline: true,
                bias: 0.35
              },
              {
                partKey: 'flameInner',
                asset: parts.flameInner,
                x: state.x,
                y: state.y,
                lift: state.innerLift,
                ro: state.innerYaw,
                symDeg: 90,
                noOutline: true,
                bias: 0.45
              }
            );
          }

          // 可切换木架铁汤锅（摆放在火堆右后侧净空处，绝不与主火苗穿插）
          if (state.showPot) {
            const [px, py] = localToWorldXY(state.x, state.y, state.yaw, 13.5 * sMul, -4.2 * sMul);
            list.push({
              partKey: 'potRack',
              asset: parts.potRack,
              x: px,
              y: py,
              lift: state.potLift,
              ro: state.potYaw,
              symDeg: 360,
              bias: 0.15
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: SceneCampfireDef.id,
            code: SceneCampfireDef.code,
            name: SceneCampfireDef.name,
            status: SceneCampfireDef.status,
            skin: curSkin.id,
            action: state.action,
            showPot: state.showPot,
            footRadius: SceneCampfireDef.footRadius,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Assets.register(SceneCampfireDef, 'scene');
})(window.PixelWorkshop);
