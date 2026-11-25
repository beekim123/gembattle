'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 树3 · 伸缩树人（斯拉夫 Leshy · M12 动态变形标杆 · v3 精制纯生态版）
  //
  // 【前置调研与方案确认】
  // 1. 生物原型与运动学调研：
  //    - 斯拉夫神话 Leshy 为林间变形木灵，核心特征是身高随林地深浅自由变化
  //      （深林高过巨树、空地缩成齐草矮灌木），躯体由厚树皮、绿苔与断鹿角拼搭。
  //    - 多节伸缩脊柱采用「阶梯锥度嵌套 + 二阶弹簧逐节起升」方案，全程 1:1 无损绘制、
  //      零小数缩放：5 节树干（trunk0..trunk4）逐级收细，伸展间距 ≤ 4.2 格、单节高 8~10 格
  //      （重叠率 ≥ 47.5%）；收缩时中节（trunk1..3）平滑内收进粗壮底墩 trunk0 内部，
  //      伸出量 < 0.35 格时自动隐去，杜绝穿帮露缝与描边叠厚。
  //    - 双足步态耦合 heightLevel（0~1）：矮灌木态小步紧挪（步阈 2.1 / 周期 0.17s），
  //      参天巨木态迈沉重长步（步阈 4.3 / 周期 0.34s），落地触发重心下沉与木臂滞后晃动。
  // 2. 三维几何坐标预算表（单部件 ≤ 24 格，远低于 40 格上限；图集约 2~4MB << 28MB）：
  //    - legThigh (7×7×7) / legShin (7×7×7) / rootFoot (9×11×5)：髋 Z=7.6 嵌入 trunk0 ≥ 50%
  //    - trunk0 (18×18×10, lift=4.6) / trunk1 (15×15×8) / trunk2 (14×14×8) /
  //      trunk3 (13×13×8) / trunk4 (20×16×10)：总高在矮态 ~23 格 ↔ 高态 ~45 格间无损切换
  //    - armUpperL/R (10×10×11) + armLowerL/R (10×11×12)：枢轴锁肩肘，双段木藤滞后摆动
  //    - head (24×16×18)：木雕面孔、深嵌琥珀双瞳（eyeGlint 不进 glowKeys）、不对称断鹿角
  //    - sproutBud (7×7×7) / sproutLeaf (10×10×10) / shroomCap (9×9×9)：5 株步履嫩芽/小菌池
  // 3. 现有内核盘点：
  //    - 直接复用 PW.Voxel / PW.Solvers（MultiLegGaitSolver, SpringDamper1D, SocketTracker）
  //      与 PW.Behaviors（Propulsion, EnvFeedback），不改 core/；
  //    - 脚本内自建 5 节伸缩脊柱排布器与 5 株立体嫩芽/斑点小菌生长池。
  // =========================================================================

  // 28 色独立色表（零重色，eyeGlint 严禁进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 厚树皮主材
      barkDark:   '#3b2a1c',
      barkMid:    '#634831',
      barkHi:     '#8f6c4a',
      // 深木雕面与盘结树根
      woodDark:   '#2c1f14',
      woodMid:    '#4d3623',
      woodHi:     '#735337',
      // 厚实青苔（肩冠与底墩叶裙）
      mossDark:   '#244d25',
      mossMid:    '#3f7d38',
      mossHi:     '#73b856',
      // 翠绿嫩叶与幼芽
      leafDark:   '#356928',
      leafMid:    '#5ea33c',
      leafHi:     '#9ee060',
      // 不对称分叉断鹿角
      antlerDark: '#695a46',
      antlerMid:  '#a39074',
      antlerHi:   '#d9cbb2',
      // 垂长木藤双臂
      vineDark:   '#384f24',
      vineMid:    '#5a7a36',
      vineHi:     '#8cb354',
      // 林间斑点小菌伞
      shroomDark: '#8a2b20',
      shroomMid:  '#cf4834',
      shroomHi:   '#f58262',
      // 小菌柄
      stemDark:   '#8f856d',
      stemMid:    '#c9bfa6',
      stemHi:     '#ede5cf',
      // 菌伞白斑点
      spotMid:    '#f2ebd4',
      // 深嵌琥珀双瞳（eyeGlint 严禁进 glowKeys）
      eyeDark:    '#140d0a',
      eyeIris:    '#e8981c',
      eyeGlint:   '#fff6d6'
    },
    glowKeys: [],
    parts: [
      'bark', 'wood', 'moss', 'leaf', 'antler', 'vine',
      'shroom', 'stem', 'spot', 'eye'
    ],
    noCrease: [
      ['bark', 'wood'], ['bark', 'moss'], ['moss', 'leaf'],
      ['bark', 'vine'], ['vine', 'moss'], ['wood', 'eye'],
      ['wood', 'antler'], ['shroom', 'spot'], ['shroom', 'stem']
    ],
    materials: {
      bark:   ['barkDark',   'barkMid',   'barkHi'],
      wood:   ['woodDark',   'woodMid',   'woodHi'],
      moss:   ['mossDark',   'mossMid',   'mossHi'],
      leaf:   ['leafDark',   'leafMid',   'leafHi'],
      antler: ['antlerDark', 'antlerMid', 'antlerHi'],
      vine:   ['vineDark',   'vineMid',   'vineHi'],
      shroom: ['shroomDark', 'shroomMid', 'shroomHi'],
      stem:   ['stemDark',   'stemMid',   'stemHi']
    },
    protectedParts: ['eye', 'spot', 'antler']
  });

  // 4 套零重建模换色皮肤
  const SKINS = [
    {
      id: 'ancient_moss',
      name: '古苔苍木（巨木经典）',
      dot: '#4e8f3f',
      outline: '#121710',
      pal: {},
      fx: {
        leafA: '#73b856',
        leafB: '#9ee060',
        pollen: '#f5d96b',
        bark: '#634831'
      }
    },
    {
      id: 'maple_autumn',
      name: '红枫秋木（秋林款）',
      dot: '#d4522a',
      outline: '#1c100c',
      pal: {
        barkDark:   '#472518', barkMid:   '#78422b', barkHi:   '#ab6846',
        woodDark:   '#361b12', woodMid:   '#5c3020', woodHi:   '#8a4d34',
        mossDark:   '#8a2819', mossMid:   '#cf4827', mossHi:   '#f58342',
        leafDark:   '#a84e18', leafMid:   '#e07d24', leafHi:   '#ffbf47',
        antlerDark: '#6e523a', antlerMid: '#ab8560', antlerHi: '#e0c19b',
        vineDark:   '#6b351b', vineMid:   '#a35629', vineHi:   '#d98743',
        shroomDark: '#995c14', shroomMid: '#db9324', shroomHi: '#ffd05c',
        eyeIris:    '#ffb829'
      },
      fx: {
        leafA: '#e0622b',
        leafB: '#ffbf47',
        pollen: '#ffe078',
        bark: '#78422b'
      }
    },
    {
      id: 'birch_frost',
      name: '白桦霜木（寒林款）',
      dot: '#c9d4d9',
      outline: '#121820',
      pal: {
        barkDark:   '#7a848c', barkMid:   '#b8c2c9', barkHi:   '#ebf0f5',
        woodDark:   '#424a52', woodMid:   '#6d7882', woodHi:   '#9eaab5',
        mossDark:   '#2e6163', mossMid:   '#4f9694', mossHi:   '#8fd1cc',
        leafDark:   '#487e85', leafMid:   '#7ab8bd', leafHi:   '#bcebf0',
        antlerDark: '#5b6875', antlerMid: '#94a6b8', antlerHi: '#d4e2f0',
        vineDark:   '#3d5c63', vineMid:   '#628f96', vineHi:   '#9cc7cc',
        shroomDark: '#365880', shroomMid: '#5988bd', shroomHi: '#96c4f5',
        eyeIris:    '#5cd4eb'
      },
      fx: {
        leafA: '#8fd1cc',
        leafB: '#d4f2f7',
        pollen: '#e0f7ff',
        bark: '#b8c2c9'
      }
    },
    {
      id: 'char_crimson',
      name: '焦炭赤菌（老林款）',
      dot: '#b83828',
      outline: '#160d0b',
      pal: {
        barkDark:   '#241e1d', barkMid:   '#403533', barkHi:   '#665550',
        woodDark:   '#1a1414', woodMid:   '#332826', woodHi:   '#54433f',
        mossDark:   '#5c241d', mossMid:   '#963a2c', mossHi:   '#d4654a',
        leafDark:   '#7d1e1b', leafMid:   '#c4352b', leafHi:   '#f56e56',
        antlerDark: '#54463d', antlerMid: '#8a7567', antlerHi: '#c4b09f',
        vineDark:   '#3b2622', vineMid:   '#633e36', vineHi:   '#966153',
        shroomDark: '#9e1919', shroomMid: '#e63229', shroomHi: '#ff7d66',
        eyeIris:    '#ff6b26'
      },
      fx: {
        leafA: '#d4583f',
        leafB: '#ff8a63',
        pollen: '#ffb86b',
        bark: '#403533'
      }
    }
  ];

  // =========================================================================
  // 1. 粗壮树根双腿（大腿 / 小腿 / 三叉盘结树根脚掌）
  // =========================================================================
  function buildLegSeg(makeCanvas, rTop, rBot, hLen) {
    const S = 7, H = hLen;
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-3.2, 3.2, -3.2, 3.2, 0, H - 1, (x, y, z, X, Y) => {
      const t = z / Math.max(1, H - 1);
      const rBase = lerp(rBot, rTop, t);
      const ang = Math.atan2(Y, X);
      const ridge = Math.sin(ang * 4 + z * 0.35) * 0.28;
      const dist = Math.hypot(X, Y);
      if (dist <= rBase + ridge) {
        const isMoss = z >= H - 2 && Y > 0.3 && Math.abs(X) < 1.8;
        m.setRaw(x, y, z, isMoss ? mat('moss') : mat('wood'), isMoss ? partId.moss : partId.wood);
      }
    });
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildRootFoot(makeCanvas) {
    const m = new VoxelModel(9, 11, 5, SPEC);
    const { mat, partId } = SPEC;
    // 粗壮踝墩 + 三根向前张开的盘结树根趾 + 一根后跟锚根
    m.paintEllipsoid(0, 0.0, 2.5, 2.0, 2.1, 1.9, mat('wood'), partId.wood, true);
    m.paintCapsule(0, 0.2, 1.4,  0.0,  4.2, 0.9, 1.25, 0.72, mat('wood'), partId.wood, true);
    m.paintCapsule(0, 0.1, 1.4, -2.6,  3.2, 0.85, 1.15, 0.68, mat('bark'), partId.bark, true);
    m.paintCapsule(0, 0.1, 1.4,  2.6,  3.2, 0.85, 1.15, 0.68, mat('bark'), partId.bark, true);
    m.paintCapsule(0, -0.3, 1.4, 0.0, -3.4, 0.85, 1.15, 0.68, mat('wood'), partId.wood, true);
    // 脚背一点青苔点缀
    m.paintEllipsoid(0, 1.0, 3.0, 1.2, 1.3, 0.75, mat('moss'), partId.moss, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: 4, centerZ: 2 });
  }

  // =========================================================================
  // 2. 5 节阶梯锥度可伸缩树干脊柱（trunk0 底墩 ~ trunk4 顶胸宽肩座）
  //    严守零小数缩放：收缩时中节内收进底墩隐藏，伸展时逐节咔哒拉开且重叠率 ≥ 47.5%
  // =========================================================================
  function buildTrunkBase(makeCanvas) {
    // trunk0：粗壮底墩 + 矮灌木苔叶裙（18×18×10）
    const m = new VoxelModel(18, 18, 10, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-8.5, 8.5, -8.5, 8.5, 0, 9, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const groove = Math.sin(ang * 6 + z * 0.18) * 0.48;
      // 底部微张包裹髋根，中段丰满圆润
      const flare = z < 3 ? (3 - z) * 0.22 : 0;
      const rx = 6.2 + flare - z * 0.06;
      const ry = 5.8 + flare - z * 0.06;
      const d = Math.hypot(X / rx, Y / ry);
      if (d <= 1.0 + groove / 6.2) {
        const isBarkDark = Math.sin(ang * 6) < -0.55;
        m.setRaw(x, y, z, isBarkDark ? mat('wood') : mat('bark'), isBarkDark ? partId.wood : partId.bark);
      }
    });
    // 外圈蓬松矮灌木苔叶裙（缩成矮灌木时伪装成草丛）
    const tufts = [
      [-6.2,  2.4, 4.6, 2.3], [ 6.2,  2.4, 4.6, 2.3],
      [-5.6, -3.2, 4.2, 2.4], [ 5.6, -3.2, 4.2, 2.4],
      [ 0.0,  6.0, 4.4, 2.5], [ 0.0, -5.8, 4.5, 2.5],
      [-4.2,  5.0, 6.2, 1.9], [ 4.2,  5.0, 6.2, 1.9],
      [-4.0, -4.8, 6.4, 1.9], [ 4.0, -4.8, 6.4, 1.9]
    ];
    for (let i = 0; i < tufts.length; i++) {
      const [tx, ty, tz, tr] = tufts[i];
      const useLeaf = i % 3 === 0;
      m.paintEllipsoid(tx, ty, tz, tr, tr * 0.92, tr * 0.88,
        useLeaf ? mat('leaf') : mat('moss'), useLeaf ? partId.leaf : partId.moss, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.4, headZ: 9, centerZ: 5 });
  }

  function buildTrunkRing(makeCanvas, tier) {
    // tier 1..3：阶梯递减中节，外径严格小于 trunk0 (6.2)，高度 9 格（展开间距 4.6 格 -> 重叠率 48.9% ≥ 45%）
    const cfg = [
      null,
      { w: 15, rx: 5.5, ry: 5.2, mossSide: -1, hasKnot: false },
      { w: 14, rx: 5.0, ry: 4.7, mossSide:  1, hasKnot: true  },
      { w: 13, rx: 4.5, ry: 4.2, mossSide: -1, hasKnot: false }
    ][tier];
    const m = new VoxelModel(cfg.w, cfg.w, 9, SPEC);
    const { mat, partId } = SPEC;
    const lim = cfg.w * 0.5 - 0.5;
    m.fillAABB(-lim, lim, -lim, lim, 0, 8, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const groove = Math.sin(ang * 5 + tier * 1.1 + z * 0.22) * 0.42;
      // 节环上下略收腰，拔高时呈现一节节清晰的木节轮廓
      const waist = Math.sin((z / 8) * Math.PI) * 0.34;
      const rx = cfg.rx + waist;
      const ry = cfg.ry + waist;
      const d = Math.hypot(X / rx, Y / ry);
      if (d <= 1.0 + groove / rx) {
        const isWood = Math.sin(ang * 5 + tier) < -0.5;
        m.setRaw(x, y, z, isWood ? mat('wood') : mat('bark'), isWood ? partId.wood : partId.bark);
      }
    });
    // 缠绕青苔带与木藤节疤
    m.paintEllipsoid(cfg.mossSide * (cfg.rx - 0.6), 1.4, 5.8, 2.0, 2.1, 1.6, mat('moss'), partId.moss, true);
    m.paintEllipsoid(-cfg.mossSide * (cfg.rx - 0.8), -1.8, 3.4, 1.7, 1.8, 1.4, mat('leaf'), partId.leaf, true);
    if (cfg.hasKnot) {
      // 中节斜向缠藤与树结
      m.paintCapsule(-cfg.rx + 0.4, 2.2, 2.0, cfg.rx - 0.4, 2.6, 6.4, 0.92, 0.82, mat('vine'), partId.vine, true);
      m.paintEllipsoid(0.6, cfg.ry - 0.2, 4.4, 1.5, 1.2, 1.4, mat('wood'), partId.wood, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: cfg.rx + 0.5, headZ: 8, centerZ: 4 });
  }

  function buildTrunkShoulders(makeCanvas) {
    // trunk4：顶胸宽阔苔肩座（20×16×10），矮灌木态盖在 trunk0 上成圆润灌木冠
    const m = new VoxelModel(20, 16, 10, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-9.5, 9.5, -7.5, 7.5, 0, 9, (x, y, z, X, Y) => {
      const dCore = (Math.hypot(X / 6.8, Y / 5.2, (z - 4.6) / 4.4) - 1.0) * 4.5;
      const dShL  = (Math.hypot((X + 5.6) / 3.4, (Y + 0.2) / 3.6, (z - 5.4) / 3.2) - 1.0) * 3.0;
      const dShR  = (Math.hypot((X - 5.6) / 3.4, (Y + 0.2) / 3.6, (z - 5.4) / 3.2) - 1.0) * 3.0;
      const d = smin(dCore, Math.min(dShL, dShR), 1.6);
      if (d > 0) return;

      // 上层覆厚实青苔肩毯，前胸留深色树皮竖纹
      const isTopMoss = z >= 6.4 || (Math.abs(X) > 4.6 && z >= 4.4);
      const isChestBark = Y > 2.4 && Math.abs(X) < 3.6 && z < 6.8;
      if (isChestBark) {
        const rib = Math.sin(X * 1.9) < -0.25;
        m.setRaw(x, y, z, rib ? mat('wood') : mat('bark'), rib ? partId.wood : partId.bark);
      } else if (isTopMoss) {
        const leafDot = ((Math.round(X) + Math.round(Y) * 2) & 3) === 0 && z >= 7;
        m.setRaw(x, y, z, leafDot ? mat('leaf') : mat('moss'), leafDot ? partId.leaf : partId.moss);
      } else {
        m.setRaw(x, y, z, mat('bark'), partId.bark);
      }
    });
    // 双肩与后背凸起苔簇 + 嫩绿小枝芽
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 6.4, -0.4, 7.6, 2.5, 2.6, 1.7, mat('moss'), partId.moss, true);
      m.paintCapsule(s * 6.8, -1.2, 7.8, s * 8.6, -2.4, 9.2, 0.85, 0.55, mat('leaf'), partId.leaf, true);
    }
    m.paintEllipsoid(0, -4.6, 6.8, 3.6, 2.2, 2.2, mat('moss'), partId.moss, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.8, headZ: 9, centerZ: 5 });
  }

  // =========================================================================
  // 3. 垂长木藤双臂（大臂 + 小臂滞后摆动，枢轴锁死肩/肘关节）
  // =========================================================================
  const ARM_UPPER_PIVOT = { x: 1.4, y: 0.0 };
  function buildArmUpper(makeCanvas, side) {
    const m = new VoxelModel(10, 10, 11, SPEC);
    const { mat, partId } = SPEC;
    const sx = -side * ARM_UPPER_PIVOT.x;
    // 粗壮木藤大臂 + 顶部厚苔肩帽（与苔肩无缝融合，矮态绝不露平顶）
    m.paintCapsule(sx, 0, 7.6, sx + side * 2.2, 0.5, 2.0, 2.10, 1.78, mat('bark'), partId.bark, true);
    m.paintEllipsoid(sx, 0, 8.2, 2.5, 2.5, 2.2, mat('moss'), partId.moss, true);
    m.paintEllipsoid(sx + side * 0.5, 0.1, 9.2, 2.1, 2.1, 1.3, mat('moss'), partId.moss, true);
    // 缠绕大臂的翠绿木藤
    m.paintCapsule(sx + side * 0.4, 1.6, 7.2, sx + side * 2.4, -1.1, 3.0, 0.88, 0.78, mat('vine'), partId.vine, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 10, centerZ: 5 });
  }

  const ARM_LOWER_PIVOT = { x: 0.8, y: -0.6 };
  function buildArmLower(makeCanvas, side) {
    const m = new VoxelModel(10, 11, 12, SPEC);
    const { mat, partId } = SPEC;
    const ex = -side * ARM_LOWER_PIVOT.x;
    const ey = ARM_LOWER_PIVOT.y;
    // 肘部重叠球节 + 垂长木藤前臂 + 三叉枝条木爪
    m.paintEllipsoid(ex, ey, 9.2, 1.9, 1.9, 1.9, mat('vine'), partId.vine, true);
    m.paintCapsule(ex, ey, 9.2, ex + side * 1.4, ey + 2.0, 3.0, 1.75, 1.55, mat('wood'), partId.wood, true);
    // 缠绕小臂的木藤与苔叶
    m.paintCapsule(ex + side * 0.6, ey + 1.4, 7.8, ex + side * 1.6, ey + 0.6, 3.8, 0.85, 0.72, mat('vine'), partId.vine, true);
    m.paintEllipsoid(ex + side * 1.6, ey + 0.6, 6.2, 1.3, 1.3, 1.1, mat('moss'), partId.moss, true);
    // 末端三根粗壮木枝手指
    m.paintCapsule(ex + side * 1.4, ey + 2.0, 3.2, ex + side * 2.2, ey + 3.8, 0.9, 0.90, 0.52, mat('wood'), partId.wood, true);
    m.paintCapsule(ex + side * 1.4, ey + 2.0, 3.2, ex + side * 0.8, ey + 4.2, 0.8, 0.88, 0.50, mat('wood'), partId.wood, true);
    m.paintCapsule(ex + side * 1.4, ey + 2.0, 3.2, ex + side * 2.8, ey + 2.2, 1.1, 0.82, 0.48, mat('bark'), partId.bark, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 4. 木雕头首 + 深嵌琥珀双瞳 + 不对称分叉断鹿角 + 苔藓枝冠（24×16×18）
  // =========================================================================
  function buildHead(makeCanvas) {
    const W = 24, D = 16, H = 18;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 颈根（深嵌苔肩内部，绝对防分离）
    m.paintCapsule(0, -0.4, 0.8, 0, 0.2, 4.4, 3.2, 3.4, mat('bark'), partId.bark, true);

    // 木雕长脸头颅（上宽下收、棱角分明的古木面具轮廓）
    m.fillAABB(-5.5, 5.5, -5.5, 6.5, 2, 12, (x, y, z, X, Y) => {
      const dCranium = (Math.hypot(X / 4.6, (Y + 0.2) / 4.4, (z - 7.6) / 3.8) - 1.0) * 3.8;
      const dJaw     = (Math.hypot(X / 3.4, (Y - 0.8) / 3.8, (z - 4.4) / 2.8) - 1.0) * 2.8;
      const d = smin(dCranium, dJaw, 1.4);
      if (d > 0) return;

      // 脸前为深色木雕面，脑后与头顶覆青苔
      if (Y > 1.4 && z >= 3 && z <= 10) {
        m.setRaw(x, y, z, mat('wood'), partId.wood);
      } else if (z >= 9.6 || Y < -1.8) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else {
        m.setRaw(x, y, z, mat('bark'), partId.bark);
      }
    });

    // 突出木雕眉弓（上移留足眼窝空间）、鼻梁与苔藓胡须（经典斯拉夫 Leshy 绿苔长须）
    m.paintCapsule(-3.4, 3.2, 9.4, 3.4, 3.2, 9.4, 0.95, 0.95, mat('bark'), partId.bark, true);
    m.paintCapsule(0, 3.8, 8.2, 0, 4.4, 5.4, 0.88, 0.76, mat('bark'), partId.bark, true);
    m.paintEllipsoid(0, 3.0, 2.6, 3.2, 2.2, 1.8, mat('moss'), partId.moss, true);
    m.paintCapsule(-2.0, 3.4, 3.0, -2.6, 3.8, 1.0, 1.05, 0.65, mat('leaf'), partId.leaf, true);
    m.paintCapsule( 2.0, 3.4, 3.0,  2.6, 3.8, 1.0, 1.05, 0.65, mat('leaf'), partId.leaf, true);

    // 头顶厚苔冠与几片嫩叶
    m.paintEllipsoid(0, -0.6, 11.2, 4.8, 4.4, 1.9, mat('moss'), partId.moss, true);
    m.paintEllipsoid(-2.2, 1.2, 12.2, 2.0, 1.8, 1.2, mat('leaf'), partId.leaf, true);
    m.paintEllipsoid( 2.4, -1.4, 12.0, 2.1, 1.9, 1.2, mat('leaf'), partId.leaf, true);

    // 不对称分叉断鹿角（左侧完整高耸多叉，右侧中段斜断保留粗茬与侧小叉）
    // 左角（-X 侧：主干外展上扬 + 前叉 + 高叉 + 挂一撮苔叶）
    m.paintCapsule(-2.8, 0.0, 10.6, -7.2, -0.8, 14.0, 1.25, 0.95, mat('antler'), partId.antler, true);
    m.paintCapsule(-7.2, -0.8, 14.0, -10.4, -1.6, 16.8, 0.95, 0.58, mat('antler'), partId.antler, true);
    m.paintCapsule(-5.8, -0.4, 13.0, -6.2,  3.2, 15.6, 0.82, 0.52, mat('antler'), partId.antler, true);
    m.paintCapsule(-8.4, -1.2, 15.0, -8.2,  1.2, 17.2, 0.72, 0.48, mat('antler'), partId.antler, true);
    m.paintEllipsoid(-7.4, -0.6, 13.8, 1.5, 1.3, 1.1, mat('leaf'), partId.leaf, true);

    // 右角（+X 侧：粗壮底座 + 一根侧小叉 + 主干中段折断的平整断茬）
    m.paintCapsule( 2.8, 0.0, 10.6,  6.4, -0.6, 13.2, 1.30, 1.08, mat('antler'), partId.antler, true);
    m.paintCapsule( 5.0, -0.3, 12.2,  5.6,  2.8, 14.2, 0.80, 0.50, mat('antler'), partId.antler, true);
    // 断茬处点出深木茬面
    m.paintEllipsoid(6.8, -0.7, 13.4, 0.95, 0.95, 0.75, mat('wood'), partId.wood, true);

    m.despeckle();
    m.applyArtShading(true);

    // 深嵌琥珀双瞳（清晰露于木雕正面，eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeZ = 6;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 2.3);
      let sy = -1;
      for (let y = D - 2; y >= 1; y--) {
        const pid = m.getPartId(ex, y, eyeZ);
        if (pid === partId.wood || pid === partId.bark) { sy = y; break; }
      }
      if (sy < 0) sy = Math.round(hd + 4.0);
      m.setRaw(ex + s, sy, eyeZ, keyToId.eyeDark, partId.eye);
      m.setRaw(ex + s, sy, eyeZ + 1, keyToId.eyeDark, partId.eye);
      m.setRaw(ex, sy, eyeZ, keyToId.eyeIris, partId.eye);
      m.setRaw(ex, sy, eyeZ + 1, keyToId.eyeGlint, partId.eye);
      m.setRaw(ex, sy + 1, eyeZ, keyToId.eyeIris, partId.eye);
      m.setRaw(ex, sy + 1, eyeZ + 1, keyToId.eyeIris, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 6.2, headZ: 17, centerZ: 8 });
  }

  // =========================================================================
  // 5. 待机与步履交互物：立体翠绿幼芽 / 舒展双叶嫩芽 / 林间斑点小菌
  //    全部注册进 parts 共享贴图，无小数缩放
  // =========================================================================
  function buildSproutBud(makeCanvas) {
    const m = new VoxelModel(7, 7, 7, SPEC);
    const { mat, partId } = SPEC;
    // 小苔土基座 + 刚冒土的圆润卷曲嫩芽
    m.paintEllipsoid(0, 0, 1.0, 2.3, 2.3, 1.1, mat('moss'), partId.moss, true);
    m.paintCapsule(0, 0, 1.2, 0.4, 0.3, 4.6, 0.95, 0.72, mat('leaf'), partId.leaf, true);
    m.paintEllipsoid(0.6, 0.4, 5.0, 1.25, 1.05, 1.1, mat('leaf'), partId.leaf, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.4, headZ: 6, centerZ: 3 });
  }

  function buildSproutLeaf(makeCanvas) {
    const m = new VoxelModel(12, 10, 10, SPEC);
    const { mat, partId } = SPEC;
    // 苔藓基座 + 挺拔嫩茎 + 左右宽展的双片翠绿嫩叶 + 顶芽
    m.paintEllipsoid(0, 0, 1.0, 2.6, 2.6, 1.1, mat('moss'), partId.moss, true);
    m.paintCapsule(0, 0, 1.2, 0, 0, 5.4, 0.92, 0.68, mat('vine'), partId.vine, true);
    m.paintEllipsoid(-2.6,  0.4, 6.4, 2.5, 1.6, 0.95, mat('leaf'), partId.leaf, true);
    m.paintEllipsoid( 2.6, -0.4, 6.6, 2.5, 1.6, 0.95, mat('leaf'), partId.leaf, true);
    m.paintCapsule(-3.4,  0.6, 6.6, -4.8,  1.0, 7.6, 0.85, 0.45, mat('leaf'), partId.leaf, true);
    m.paintCapsule( 3.4, -0.6, 6.8,  4.8, -1.0, 7.8, 0.85, 0.45, mat('leaf'), partId.leaf, true);
    m.paintEllipsoid(0, 0, 7.0, 1.05, 1.05, 1.1, mat('leaf'), partId.leaf, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2, headZ: 9, centerZ: 4 });
  }

  function buildShroomCap(makeCanvas) {
    const m = new VoxelModel(9, 9, 9, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 苔座 + 饱满米白菌柄 + 圆润斑点菌伞
    m.paintEllipsoid(0, 0, 0.9, 2.5, 2.5, 1.0, mat('moss'), partId.moss, true);
    m.paintCapsule(0, 0, 1.2, 0.2, 0, 5.0, 1.45, 1.15, mat('stem'), partId.stem, true);
    m.fillAABB(-3.8, 3.8, -3.8, 3.8, 4, 8, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 3.4, Y / 3.4, (z - 5.2) / 2.8);
      if (d <= 1.0 && z >= 4.6) {
        m.setRaw(x, y, z, mat('shroom'), partId.shroom);
      }
    });
    m.despeckle();
    m.applyArtShading(false);

    // 菌伞顶面清晰点缀 4 颗米白斑点（protectedParts 保护不被去噪）
    const spots = [[2, 4, 7], [6, 4, 7], [4, 2, 7], [4, 6, 7], [4, 4, 8]];
    for (const [sx, sy, sz] of spots) {
      if (m.getId(sx, sy, sz)) m.setRaw(sx, sy, sz, keyToId.spotMid, partId.spot);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 3.2, headZ: 8, centerZ: 4 });
  }

  // =========================================================================
  // Def 注册对象
  // =========================================================================
  const Tree3Def = {
    id: 'tree3_leshy',
    code: '树3',
    name: '树3 · 伸缩树人',
    status: 'done',
    tag: 'M12 动态变形 · 5 节伸缩脊柱 + 步履生芽',
    summary: 'v3 精制：1~5 节无损叠合伸缩树干（矮灌木 ↔ 参天巨木）+ 身高耦合双足步态 + 不对称断鹿角木雕头首 + 垂长木藤双臂 + 5 株步履嫩芽与斑点小菌自循环',
    defaultHabitat: 'canopy',
    footRadius: 8.6,
    ecoWeight: 1.35,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '5 节阶梯伸缩树干', '二阶弹簧身高驱动', '身高耦合双足 IK',
      '双段垂长木藤臂', '不对称断鹿角木首', '5 株步履嫩芽小菌池'
    ],
    soulHabit: '巡游步履所过脚印旁钻出翠绿嫩芽与斑点小菌；停步时一节节缩成矮灌木抖落苔叶伪装，片刻后咔哒拔高成参天巨木展开鹿角震起嫩芽与花粉',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legThigh:   buildLegSeg(makeCanvas, 2.15, 1.85, 7),
        legShin:    buildLegSeg(makeCanvas, 1.85, 1.65, 7),
        rootFoot:   buildRootFoot(makeCanvas),
        trunk0:     buildTrunkBase(makeCanvas),
        trunk1:     buildTrunkRing(makeCanvas, 1),
        trunk2:     buildTrunkRing(makeCanvas, 2),
        trunk3:     buildTrunkRing(makeCanvas, 3),
        trunk4:     buildTrunkShoulders(makeCanvas),
        armUpperL:  buildArmUpper(makeCanvas, -1),
        armUpperR:  buildArmUpper(makeCanvas,  1),
        armLowerL:  buildArmLower(makeCanvas, -1),
        armLowerR:  buildArmLower(makeCanvas,  1),
        head:       buildHead(makeCanvas),
        sproutBud:  buildSproutBud(makeCanvas),
        sproutLeaf: buildSproutLeaf(makeCanvas),
        shroomCap:  buildShroomCap(makeCanvas)
      };

      // 2 足粗壮树根 IK（hipZ=7.6 深嵌 trunk0 底墩，bendDir=1 膝盖自然前屈）
      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -3.2, hipY: -0.2, hipZ: 7.6, restX: -3.6, restY: 0.2, group: 0, L1: 4.5, L2: 4.8, bendDir: 1 },
        { id: 'R', hipX:  3.2, hipY: -0.2, hipZ: 7.6, restX:  3.6, restY: 0.2, group: 1, L1: 4.5, L2: 4.8, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 3.4, stepDuration: 0.26, stepHeight: 2.2, strideAnticipation: 0.44 });

      // 核心二阶弹簧求解器
      const heightSpring   = new SpringDamper1D(0.95, 38, 7.6);
      const tremorSpring   = new SpringDamper1D(0, 220, 9.5);
      const bodyBobSpring  = new SpringDamper1D(0, 150, 8.2);
      const headYawSpring  = new SpringDamper1D(0, 95, 7.8);
      const armUpperSpring = new SpringDamper1D(0, 85, 6.8);
      const armLowerSpring = new SpringDamper1D(0, 62, 5.2);

      // 5 株立体嫩芽 / 斑点小菌生长池（幼芽 -> 舒展 -> 凋落循环）
      const SPROUT_POOL_SIZE = 5;
      const sprouts = Array.from({ length: SPROUT_POOL_SIZE }, (_, idx) => ({
        active: false,
        kind: idx % 2 === 0 ? 'sprout' : 'shroom',
        x: 0,
        y: 0,
        yaw: idx * 1.25,
        age: 0,
        maxLife: 13.0 + (idx % 3) * 2.2,
        sway: new SpringDamper1D(0, 110, 5.2)
      }));

      const homeX0 = opts.homeX ?? 0;
      const homeY0 = opts.homeY ?? 0;
      const homeYaw0 = opts.homeYaw ?? 0;

      const state = {
        x: homeX0,
        y: homeY0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: homeYaw0,
        heightLevel: 0.95,
        targetHeight: 1.0,
        lastNotch: 3,
        stepPhase: 0,
        stepSign: 1,
        stepCounter: 0,
        sproutCursor: 0,
        // 状态机：
        // 巡游：'roam_tall' -> 'center_walk' -> 'shrub_hide' -> 'burst_grow' -> 'roam_shrub' -> 'roam_tall'
        // 待机：'idle_tall' -> 'shrub_hide' -> 'burst_grow' -> 'idle_tall'
        stage: 'roam_tall',
        stageTimer: 5.5,
        hideShakeDone: false,
        burstPollenDone: false
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function spawnSproutAt(wx, wy, sMul, kindOverride) {
        const slot = sprouts[state.sproutCursor % SPROUT_POOL_SIZE];
        state.sproutCursor = (state.sproutCursor + 1) % SPROUT_POOL_SIZE;
        slot.active = true;
        slot.kind = kindOverride || ((state.sproutCursor % 3 === 0) ? 'shroom' : 'sprout');
        slot.x = wx;
        slot.y = wy;
        slot.yaw = (hash2i(Math.round(wx * 3), Math.round(wy * 3), 73) * TAU);
        slot.age = 0;
        slot.maxLife = 12.5 + hash2i(state.sproutCursor, Math.round(wx), 97) * 4.5;
        slot.sway.x = 0;
        slot.sway.v = 0;
        slot.sway.impulse(5.5);
        return slot;
      }

      function seedRingSprouts(cx, cy, sMul) {
        const ringR = 14.5 * sMul;
        for (let i = 0; i < SPROUT_POOL_SIZE; i++) {
          const ang = (i / SPROUT_POOL_SIZE) * TAU + 0.35;
          const sx = cx + Math.cos(ang) * ringR;
          const sy = cy + Math.sin(ang) * ringR;
          const slot = sprouts[i];
          slot.active = true;
          slot.kind = i % 2 === 0 ? 'sprout' : 'shroom';
          slot.x = sx;
          slot.y = sy;
          slot.yaw = ang + 0.8;
          slot.age = 1.6 + i * 0.9;
          slot.maxLife = 15.0 + i * 1.4;
          slot.sway.x = 0;
          slot.sway.v = 0;
        }
      }

      function emitLeafScatter(vfx, wx, wy, wz, count, sMul, power) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let k = 0; k < count; k++) {
          const a = (k / Math.max(1, count)) * TAU + Math.random() * 0.5;
          const spd = (5.0 + Math.random() * 8.5) * power * sMul;
          vfx.spawnParticle(
            wx + (Math.random() - 0.5) * 6.0 * sMul,
            wy + (Math.random() - 0.5) * 6.0 * sMul,
            wz + (Math.random() - 0.5) * 2.5 * sMul,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            (3.5 + Math.random() * 6.0) * power * sMul,
            0.75 + Math.random() * 0.45,
            1.35 + Math.random() * 0.55,
            k % 2 === 0 ? fx.leafA : fx.leafB,
            false,
            14
          );
        }
      }

      function emitPollenBurst(vfx, wx, wy, wz, count, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let k = 0; k < count; k++) {
          const a = (k / Math.max(1, count)) * TAU + Math.random() * 0.4;
          const spd = (6.5 + Math.random() * 11.0) * sMul;
          vfx.spawnParticle(
            wx + (Math.random() - 0.5) * 8.0 * sMul,
            wy + (Math.random() - 0.5) * 8.0 * sMul,
            wz + (Math.random() - 0.5) * 4.0 * sMul,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            (6.0 + Math.random() * 9.0) * sMul,
            0.95 + Math.random() * 0.55,
            1.15 + Math.random() * 0.45,
            fx.pollen,
            false,
            5
          );
        }
      }

      const instance = {
        def: Tree3Def,
        cachePrefix: `tree3_ls_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts: [],
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          const sMul = instance.scaleMul || 1.0;
          state.x = homeX;
          state.y = homeY;
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.heightLevel = 0.95;
          state.targetHeight = 1.0;
          state.lastNotch = 3;
          state.stepPhase = 0;
          state.stepSign = 1;
          state.stepCounter = 0;
          state.stage = 'roam_tall';
          state.stageTimer = 5.2;
          state.hideShakeDone = false;
          state.burstPollenDone = false;

          heightSpring.x = 0.95; heightSpring.v = 0;
          tremorSpring.x = tremorSpring.v = 0;
          bodyBobSpring.x = bodyBobSpring.v = 0;
          headYawSpring.x = headYawSpring.v = 0;
          armUpperSpring.x = armUpperSpring.v = 0;
          armLowerSpring.x = armLowerSpring.v = 0;

          gait.reset(homeX, homeY, homeYaw, sMul);
          seedRingSprouts(homeX, homeY, sMul);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));

          // 严格同时兼容 eco.action === 'idle' 与 eco.patrol === false
          const isIdle = !!(eco && (eco.action === 'idle' || eco.patrol === false));
          const patrol = !isIdle;
          const hxHome = (eco && eco.homeX !== undefined) ? eco.homeX : homeX0;
          const hyHome = (eco && eco.homeY !== undefined) ? eco.homeY : homeY0;
          const hyawHome = (eco && eco.homeYaw !== undefined) ? eco.homeYaw : homeYaw0;

          // 模式切换平滑接管
          if (isIdle && (state.stage === 'roam_tall' || state.stage === 'roam_shrub' || state.stage === 'center_walk')) {
            state.stage = 'idle_tall';
            state.stageTimer = 2.4;
          } else if (patrol && state.stage === 'idle_tall') {
            state.stage = 'roam_tall';
            state.stageTimer = 5.4;
          }

          state.stageTimer -= dt;
          let targetHeadYaw = Math.sin(time * 0.95) * 0.16;

          // -----------------------------------------------------------------
          // 1. 生态与动态伸缩状态机（巡游 + 待机完整自循环）
          // -----------------------------------------------------------------
          if (state.stage === 'roam_tall') {
            state.targetHeight = 1.0;
            Propulsion.multiLegWalk(state, dt, time, { ...params, speed: spdMul * 0.92 }, {
              ...eco, walkStyle: 'heavy', baseLift: 0
            });
            if (state.stageTimer <= 0) {
              state.stage = 'center_walk';
              state.stageTimer = 5.0;
            }
          } else if (state.stage === 'roam_shrub') {
            state.targetHeight = 0.04;
            Propulsion.multiLegWalk(state, dt, time, { ...params, speed: spdMul * 0.72 }, {
              ...eco, walkStyle: 'scurry', baseLift: 0
            });
            if (state.stageTimer <= 0) {
              state.stage = 'roam_tall';
              state.stageTimer = 5.6;
            }
          } else if (state.stage === 'center_walk') {
            state.targetHeight = 0.72;
            const walkRes = Propulsion.walkToPoint(state, hxHome, hyHome, dt, params, {
              arriveDist: 3.5 * sMul,
              maxSpeed: 12.2,
              maxTurn: 2.2,
              aimYaw: hyawHome,
              baseLift: 0
            });
            if (walkRes.arrived || state.stageTimer <= 0) {
              state.stage = 'shrub_hide';
              state.stageTimer = 2.6;
              state.hideShakeDone = false;
            }
          } else if (state.stage === 'idle_tall') {
            state.targetHeight = 1.0;
            Propulsion.walkToPoint(state, hxHome, hyHome, dt, params, {
              arriveDist: 3.2 * sMul,
              maxSpeed: 9.0,
              maxTurn: 2.0,
              aimYaw: hyawHome + Math.sin(time * 0.45) * 0.22,
              baseLift: 0
            });
            targetHeadYaw = Math.sin(time * 1.15) * 0.36;
            if (state.stageTimer <= 0) {
              state.stage = 'shrub_hide';
              state.stageTimer = 2.6;
              state.hideShakeDone = false;
            }
          } else if (state.stage === 'shrub_hide') {
            // 一节节缩成矮灌木伪装草丛，肩头抖落苔叶
            state.targetHeight = 0.0;
            const kStop = expSmooth(dt, 7.5);
            state.vx = lerp(state.vx, 0, kStop);
            state.vy = lerp(state.vy, 0, kStop);
            state.x += state.vx * dt;
            state.y += state.vy * dt;
            targetHeadYaw = Math.sin(time * 2.2) * 0.12;

            if (!state.hideShakeDone && state.heightLevel < 0.22) {
              state.hideShakeDone = true;
              tremorSpring.impulse(10.5 * sp);
              emitLeafScatter(vfx, state.x, state.y, 13.0 * sMul, 8, sMul, 1.0);
            }
            if (state.stageTimer <= 0) {
              state.stage = 'burst_grow';
              state.stageTimer = 2.2;
              state.burstPollenDone = false;
              heightSpring.impulse(1.15 * sp);
            }
          } else if (state.stage === 'burst_grow') {
            // 猛然一节节拔高成参天巨木，仰首展开鹿角，震起周围嫩芽与花粉飘散
            state.targetHeight = 1.0;
            const kStop = expSmooth(dt, 7.5);
            state.vx = lerp(state.vx, 0, kStop);
            state.vy = lerp(state.vy, 0, kStop);
            state.x += state.vx * dt;
            state.y += state.vy * dt;

            const u = clamp(1 - state.stageTimer / 2.2, 0, 1);
            targetHeadYaw = Math.sin(u * Math.PI * 2) * 0.44;

            if (!state.burstPollenDone && state.heightLevel > 0.78) {
              state.burstPollenDone = true;
              tremorSpring.impulse(12.0 * sp);
              bodyBobSpring.impulse(-8.5 * sp);
              emitLeafScatter(vfx, state.x, state.y, 26.0 * sMul, 6, sMul, 1.15);
              emitPollenBurst(vfx, state.x, state.y, 20.0 * sMul, 12, sMul);

              // 震动周围所有嫩芽与斑点小菌，并若池中空位较多则在身旁新冒一株
              let activeCount = 0;
              for (const sr of sprouts) {
                if (!sr.active) continue;
                activeCount++;
                sr.sway.impulse((Math.random() > 0.5 ? 1 : -1) * (8.0 + Math.random() * 5.0) * sp);
              }
              if (activeCount < 4) {
                const ang = Math.random() * TAU;
                const rad = (11.5 + Math.random() * 4.5) * sMul;
                spawnSproutAt(state.x + Math.cos(ang) * rad, state.y + Math.sin(ang) * rad, sMul);
              }
            }

            if (state.stageTimer <= 0) {
              if (patrol) {
                state.stage = 'roam_shrub';
                state.stageTimer = 4.2;
              } else {
                state.stage = 'idle_tall';
                state.stageTimer = 2.8;
              }
            }
          }

          state.z = 0;

          // -----------------------------------------------------------------
          // 2. 二阶弹簧驱动 heightLevel (0~1) + 跨节咔哒轻颤与落叶
          // -----------------------------------------------------------------
          const hStiff = (state.stage === 'burst_grow' ? 52 : 34) * sp;
          const hDamp = clamp((state.stage === 'burst_grow' ? 6.8 : 7.8) * dScale, 3.6, 12.5);
          state.heightLevel = clamp(heightSpring.update(dt, state.targetHeight, hStiff, hDamp), 0, 1);

          const notch = clamp(Math.floor(state.heightLevel * 4.0 + 0.05), 0, 4);
          if (notch !== state.lastNotch) {
            const dir = notch > state.lastNotch ? 1 : -1;
            state.lastNotch = notch;
            tremorSpring.impulse(dir * 7.5 * sp);
            const jointZ = (9.0 + notch * 4.0) * sMul;
            emitLeafScatter(vfx, state.x, state.y, jointZ, 4, sMul, 0.78);
          }

          tremorSpring.update(dt, 0, 220 * sp, clamp(9.5 * dScale, 4.5, 14.0));
          bodyBobSpring.update(dt, 0, 150 * sp, clamp(8.2 * dScale, 3.8, 12.5));
          headYawSpring.update(dt, targetHeadYaw, 95 * sp, clamp(7.8 * dScale, 3.5, 12.0));

          // -----------------------------------------------------------------
          // 3. 身高耦合 biped 双足步态：矮灌木紧凑小步 ↔ 参天巨木沉重长步
          // -----------------------------------------------------------------
          const h = state.heightLevel;
          const moveSpd = Math.hypot(state.vx, state.vy);
          const strideStepFreq = lerp(1.42, 0.74, h) * gFreq;
          const strideThresh   = lerp(2.1, 4.3, h) * sMul;
          const strideDur      = lerp(0.17, 0.34, h);
          const strideHeight   = lerp(1.45, 2.55, h) * sMul * (0.80 + flex * 0.20);

          if (moveSpd > 0.8) {
            state.stepPhase += dt * (2.6 + moveSpd * lerp(0.46, 0.24, h)) * gFreq;
          }

          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: strideStepFreq,
            stepDuration: strideDur,
            stepHeight: strideHeight,
            stepThreshold: strideThresh
          });

          const tiltGain = lerp(0.45, 0.85, h) * sMul;
          state.tiltX = lerp(state.tiltX || 0, gaitRes.tiltX * tiltGain, expSmooth(dt, 11));
          state.tiltY = lerp(state.tiltY || 0, gaitRes.tiltY * tiltGain, expSmooth(dt, 11));

          // 温和钳位双足相对理想落点半径，防止急转脱髋
          const maxFootOff = lerp(4.2, 6.8, h) * sMul;
          for (const leg of gait.legs) {
            const [idealX, idealY] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
            const dx = leg.footX - idealX, dy = leg.footY - idealY;
            const d = Math.hypot(dx, dy);
            if (d > maxFootOff) {
              leg.footX = idealX + (dx / d) * maxFootOff;
              leg.footY = idealY + (dy / d) * maxFootOff;
            }
          }

          if (gaitRes.landed.length > 0) {
            state.stepSign *= -1;
            state.stepCounter++;
            const impact = lerp(4.2, 11.5, h);
            bodyBobSpring.impulse(impact * sp);
            armUpperSpring.impulse(state.stepSign * lerp(1.6, 3.8, h) * sp);
            armLowerSpring.impulse(-state.stepSign * lerp(2.2, 5.4, h) * sp * flex);
            for (const l of gaitRes.landed) {
              if (vfx && habitat) EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, lerp(0.48, 0.95, h) * sMul);
              // 每走出 3 步，脚印外侧“噗”地钻出一株立体嫩芽或斑点小菌
              if (state.stepCounter % 3 === 0) {
                const sideDir = l.isLeft ? -1 : 1;
                const [sx, sy] = localToWorldXY(l.footX, l.footY, state.yaw, sideDir * 4.4 * sMul, -1.8 * sMul);
                const dC = Math.hypot(sx, sy);
                const maxR = (eco && eco.maxRadius) ? eco.maxRadius - 3 : 44;
                if (dC < maxR) {
                  spawnSproutAt(sx, sy, sMul);
                  emitPollenBurst(vfx, sx, sy, 2.2 * sMul, 3, sMul);
                }
              }
            }
          }

          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 3.1 * sMul }));

          // -----------------------------------------------------------------
          // 4. 双段木藤臂滞后摆动弹簧更新
          // -----------------------------------------------------------------
          const walkAmp = clamp(moveSpd / 11.5, 0, 1);
          const upperTarget = walkAmp > 0.12
            ? Math.sin(state.stepPhase) * lerp(0.18, 0.42, h) * walkAmp
            : Math.sin(time * 1.45) * 0.08 * (0.4 + h * 0.6);
          const uArmVal = armUpperSpring.update(dt, upperTarget, 85 * sp, clamp(6.8 * dScale, 3.2, 11.0));
          armLowerSpring.update(dt, uArmVal * 1.35 + Math.sin(time * 1.9 - 0.9) * 0.07 * flex, 62 * sp, clamp(5.2 * dScale, 2.4, 9.5));

          // -----------------------------------------------------------------
          // 5. 更新 5 株立体嫩芽 / 斑点小菌生长池（幼芽 -> 舒展 -> 凋落）
          // -----------------------------------------------------------------
          let aliveSprouts = 0;
          for (const sr of sprouts) {
            if (!sr.active) continue;
            sr.age += dt;
            sr.sway.update(dt, Math.sin(time * 2.1 + sr.yaw) * 0.08, 110 * sp, 5.2);
            if (sr.age >= sr.maxLife) {
              sr.active = false;
            } else {
              aliveSprouts++;
            }
          }
          // 待机模式下保持场地周围始终有 3~5 株生机勃勃的嫩芽小菌循环生长
          if (isIdle && aliveSprouts < 3) {
            const ang = Math.random() * TAU;
            const rad = (12.5 + Math.random() * 5.0) * sMul;
            spawnSproutAt(hxHome + Math.cos(ang) * rad, hyHome + Math.sin(ang) * rad, sMul);
          }
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const h = clamp(state.heightLevel, 0, 1);
          const isWater = !!(habitat && habitat.isWater);
          const waterLevel = habitat ? (habitat.waterLevel ?? -99) : -99;
          const calcSub = (z) => EnvFeedback.calcSubmerge(z, waterLevel, 5.0, isWater);

          const tremor = clamp(tremorSpring.x * 0.028, -0.22, 0.22);
          const breath = Math.sin(performance.now() * 0.0022) * (0.28 + h * 0.22);
          const bob = clamp(-bodyBobSpring.x * 0.07 + breath, -0.75, 0.95) * sMul;

          const bodyX = state.x + (state.tiltX || 0);
          const bodyY = state.y + (state.tiltY || 0);

          // 1. 2 条粗壮树根双腿（大腿根深嵌 trunk0 底墩，膝踝连贯，三叉树根脚掌稳踩地面）
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const hx = l.hipWX + (state.tiltX || 0);
            const hy = l.hipWY + (state.tiltY || 0);
            const hz = l.hipWZ + bob;
            const segs = [
              { k: 'legThigh', x: lerp(hx, l.kneeX, 0.28), y: lerp(hy, l.kneeY, 0.28), z: lerp(hz, l.kneeZ, 0.28), b: -0.35, sym: 90 },
              { k: 'legShin',  x: lerp(l.kneeX, l.footX, 0.48), y: lerp(l.kneeY, l.footY, 0.48), z: lerp(l.kneeZ, l.footZ + 1.6 * sMul, 0.48), b: -0.28, sym: 90 },
              { k: 'rootFoot', x: l.footX, y: l.footY, z: l.footZ, b: -0.22, sym: 0 }
            ];
            for (const pt of segs) {
              const item = {
                partKey: pt.k,
                asset: parts[pt.k],
                x: pt.x,
                y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === 'rootFoot' ? 0 : 2.6 * sMul)),
                ro: yw,
                submerge: calcSub(pt.z + 1.0 * sMul),
                bias: pt.b
              };
              if (pt.sym) item.symDeg = pt.sym;
              list.push(item);
            }
          }

          // 2. 5 节阶梯锥度伸缩树干脊柱（严守 1:1 无损绘制，绝无小数缩放！）
          const trunk0Lift = 4.6 * sMul + bob;
          const e1 = smoothstep(0.04, 0.36, h);
          const e2 = smoothstep(0.24, 0.62, h);
          const e3 = smoothstep(0.48, 0.86, h);
          const eTop = smoothstep(0.72, 1.00, h);

          // 底墩 trunk0（常驻，矮灌木态构成圆润苔叶底座）
          list.push({
            partKey: 'trunk0',
            asset: parts.trunk0,
            x: bodyX,
            y: bodyY,
            lift: trunk0Lift,
            ro: yw,
            submerge: calcSub(trunk0Lift + 3.0 * sMul),
            bias: 0.10
          });

          // 中节 trunk1..3：仅在拔出量 > 0.06 时渲染，完全内收进底墩时自动隐去防穿帮
          const lift1 = trunk0Lift + (0.6 + e1 * 4.2) * sMul;
          const lift2 = lift1 + (0.4 + e2 * 4.2) * sMul;
          const lift3 = lift2 + (0.4 + e3 * 4.2) * sMul;
          const swayYaw = tremor * 0.45;

          if (e1 > 0.06) {
            list.push({
              partKey: 'trunk1',
              asset: parts.trunk1,
              x: bodyX,
              y: bodyY,
              lift: lift1,
              ro: wrapAngle(yw + swayYaw * 0.5),
              submerge: calcSub(lift1 + 3.0 * sMul),
              bias: 0.14
            });
          }
          if (e2 > 0.06) {
            list.push({
              partKey: 'trunk2',
              asset: parts.trunk2,
              x: bodyX,
              y: bodyY,
              lift: lift2,
              ro: wrapAngle(yw - swayYaw * 0.7),
              submerge: calcSub(lift2 + 3.0 * sMul),
              bias: 0.18
            });
          }
          if (e3 > 0.06) {
            list.push({
              partKey: 'trunk3',
              asset: parts.trunk3,
              x: bodyX,
              y: bodyY,
              lift: lift3,
              ro: wrapAngle(yw + swayYaw * 0.9),
              submerge: calcSub(lift3 + 3.0 * sMul),
              bias: 0.22
            });
          }

          // 顶胸宽阔苔肩座 trunk4（随脊柱高度平滑升降，矮态紧扣 trunk0，高态紧扣 trunk3）
          const trunk4Lift = trunk0Lift + (3.2 + e1 * 4.6 + e2 * 4.6 + e3 * 4.6 + eTop * 1.0) * sMul;
          const shoulderYaw = wrapAngle(yw + tremor * 0.55);
          list.push({
            partKey: 'trunk4',
            asset: parts.trunk4,
            x: bodyX,
            y: bodyY,
            lift: trunk4Lift,
            ro: shoulderYaw,
            submerge: calcSub(trunk4Lift + 3.5 * sMul),
            bias: 0.26
          });

          // 更新单一真源挂点（肩、头）
          sockets.setLocal('shoulders', bodyX, bodyY, trunk4Lift, shoulderYaw, 0, 0, 5.0, sMul);

          // 3. 左右双段垂长木藤臂（大臂锁死肩根，小臂锁死肘根并滞后摆动，随顶节同步升降）
          const armBaseSwing = clamp(armUpperSpring.x, -0.58, 0.58);
          const armForeSwing = clamp(armLowerSpring.x, -0.78, 0.78);
          for (const s of [-1, 1]) {
            const uKey = s < 0 ? 'armUpperL' : 'armUpperR';
            const lKey = s < 0 ? 'armLowerL' : 'armLowerR';
            const shOffX = s * lerp(6.6, 7.1, h) * sMul;
            const [shX, shY] = localToWorldXY(bodyX, bodyY, shoulderYaw, shOffX, 0.0);
            const uYaw = wrapAngle(shoulderYaw + s * (armBaseSwing + tremor * 0.35));
            const [uWx, uWy] = pivotToWorldXY(shX, shY, uYaw, -s * ARM_UPPER_PIVOT.x * sMul, ARM_UPPER_PIVOT.y * sMul);
            const uLift = Math.max(1.8 * sMul, trunk4Lift - 2.6 * sMul + Math.abs(armBaseSwing) * 0.8 * sMul);

            list.push({
              partKey: uKey,
              asset: parts[uKey],
              x: uWx,
              y: uWy,
              lift: uLift,
              ro: uYaw,
              submerge: calcSub(uLift + 3.0 * sMul),
              bias: 0.30
            });

            // 肘部挂点：在大臂下端（局部偏移 (s*2.2, 0.5)）
            const [elX, elY] = localToWorldXY(shX, shY, uYaw, s * 2.2 * sMul, 0.5 * sMul);
            const lYaw = wrapAngle(uYaw + s * (armForeSwing * 0.65));
            const [lWx, lWy] = pivotToWorldXY(elX, elY, lYaw, -s * ARM_LOWER_PIVOT.x * sMul, ARM_LOWER_PIVOT.y * sMul);
            // 矮灌木态微收前臂防止插进地面，高态自然垂长
            const foreDrop = lerp(2.8, 5.4, h) * sMul;
            const lLift = Math.max(0.8 * sMul, uLift - foreDrop);

            list.push({
              partKey: lKey,
              asset: parts[lKey],
              x: lWx,
              y: lWy,
              lift: lLift,
              ro: lYaw,
              submerge: calcSub(lLift + 2.0 * sMul),
              bias: 0.34
            });
          }

          // 4. 木雕头首 + 不对称分叉断鹿角（矮态微沉进苔肩窝，高态昂首挺立）
          const hYaw = wrapAngle(shoulderYaw + clamp(headYawSpring.x, -0.58, 0.58) + tremor * 0.4);
          const [headX, headY] = localToWorldXY(bodyX, bodyY, shoulderYaw, 0, lerp(0.5, 1.0, h) * sMul);
          const headLift = trunk4Lift + lerp(5.2, 7.2, h) * sMul;
          list.push({
            partKey: 'head',
            asset: parts.head,
            x: headX,
            y: headY,
            lift: headLift,
            ro: hYaw,
            submerge: calcSub(headLift + 3.0 * sMul),
            bias: 0.45
          });

          // 5. 待机与步履交互物：5 株立体翠绿嫩芽 / 斑点小菌生长池（幼芽 -> 舒展 -> 凋落）
          for (let i = 0; i < sprouts.length; i++) {
            const sr = sprouts[i];
            if (!sr.active) continue;
            const uLife = clamp(sr.age / sr.maxLife, 0, 1);
            // 幼芽阶段 (0..0.18) -> 舒展/成菌阶段 (0.18..0.84) -> 凋落收回阶段 (0.84..1.0)
            let pKey;
            let op = 1.0;
            let liftS = 0;
            if (uLife < 0.18) {
              pKey = 'sproutBud';
              liftS = lerp(-1.2, 0.0, smoothstep(0, 0.18, uLife)) * sMul;
            } else if (uLife < 0.84) {
              pKey = sr.kind === 'shroom' ? 'shroomCap' : 'sproutLeaf';
            } else {
              pKey = 'sproutBud';
              const w = smoothstep(0.84, 1.0, uLife);
              op = clamp(1.0 - w * 0.72, 0.25, 1.0);
              liftS = -w * 1.4 * sMul;
            }
            list.push({
              partKey: pKey,
              asset: parts[pKey],
              x: sr.x,
              y: sr.y,
              lift: Math.max(0, liftS),
              ro: wrapAngle(sr.yaw + clamp(sr.sway.x, -0.55, 0.55)),
              opacity: op,
              submerge: calcSub(1.5 * sMul),
              bias: 0.05
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Tree3Def.id,
            code: Tree3Def.code,
            name: Tree3Def.name,
            status: Tree3Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            stage: state.stage,
            heightLevel: Number(state.heightLevel.toFixed(2)),
            footRadius: Tree3Def.footRadius,
            headZ: Math.round(23 + state.heightLevel * 22),
            centerZ: Math.round(11 + state.heightLevel * 10),
            blocks: Tree3Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Tree3Def);
})(window.PixelWorkshop);
