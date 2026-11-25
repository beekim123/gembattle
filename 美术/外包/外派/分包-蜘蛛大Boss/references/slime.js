'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SpringDamper3D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 弹性史莱姆（v3 标杆版 · 腹中随机食物彩蛋，+Y 正前）
  //   1. 去掉外壳旁飘浮气泡，保持极度干净圆润的水滴果冻轮廓
  //   2. 5 档无损体积守恒体素壳体（28×28×20 基准），半透绘制（alpha≈0.68）清晰透出腹中物
  //   3. 腹中内置 8 种高辨识度立体体素食物（红苹果 / 紫葡萄 / 弯香蕉 / 红瓢虫 /
  //      小橘鱼 / 斑点蘑菇 / 肉骨头 / 奶酪块），由二阶弹簧锁死在腹腔中央滞后晃动，
  //      工坊演示每隔 3.6 秒随机切换一种，游戏内可锁定单次随机结果
  //   4. 独立双层厚豆豆双眼（eyeGlint 绝不进 glowKeys）+ 皇冠金专属四面红宝石小金冠
  //   5. 真实 4 阶段蓄力弹性蹦跳巡游（蓄力压扁 -> 拉伸弹射 -> 抛物线滞空 -> 砸地回弹）
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      bodyDark:       '#165e96',
      bodyMid:        '#2ea4e8',
      bodyHi:         '#8ce2ff',
      emissiveMid:    '#42d4f5',
      emissiveHot:    '#9cf2fc',
      emissiveCore:   '#e8feff',
      eyeDark:        '#111827',
      eyeGlint:       '#ffffff',
      crownDark:      '#8c5612',
      crownMid:       '#e0a422',
      crownHi:        '#ffe46b',
      rubyMid:        '#cc1e3a',
      rubyHi:         '#ff6680',
      foodRedDark:    '#9e1726',
      foodRedMid:     '#e62937',
      foodRedHi:      '#ff707a',
      foodGreenDark:  '#1f7a32',
      foodGreenMid:   '#3cd048',
      foodGreenHi:    '#96f578',
      foodYellowDark: '#b87d14',
      foodYellowMid:  '#f5cc22',
      foodYellowHi:   '#fff28c',
      foodOrangeDark: '#b54612',
      foodOrangeMid:  '#ff7b24',
      foodOrangeHi:   '#ffc46b',
      foodPurpleDark: '#4f1c8c',
      foodPurpleMid:  '#8c3be8',
      foodPurpleHi:   '#c88cff',
      foodBrownDark:  '#4a2a14',
      foodBrownMid:   '#7d4d28',
      foodCreamDark:  '#bfa988',
      foodCreamMid:   '#f2e5c9'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: ['body', 'core', 'eye', 'crown', 'ruby', 'foodMain', 'foodLeaf', 'foodDetail'],
    noCrease: [
      ['eye', 'body'], ['eye', 'core'],
      ['core', 'body'], ['crown', 'ruby'],
      ['foodMain', 'foodLeaf'], ['foodMain', 'foodDetail'], ['foodLeaf', 'foodDetail']
    ],
    materials: {
      body:       ['bodyDark',       'bodyMid',       'bodyHi'],
      crown:      ['crownDark',      'crownMid',      'crownHi'],
      foodRed:    ['foodRedDark',    'foodRedMid',    'foodRedHi'],
      foodGreen:  ['foodGreenDark',  'foodGreenMid',  'foodGreenHi'],
      foodYellow: ['foodYellowDark', 'foodYellowMid', 'foodYellowHi'],
      foodOrange: ['foodOrangeDark', 'foodOrangeMid', 'foodOrangeHi'],
      foodPurple: ['foodPurpleDark', 'foodPurpleMid', 'foodPurpleHi'],
      foodCream:  ['foodCreamDark',  'foodCreamMid',  'eyeGlint']
    },
    protectedParts: ['eye', 'ruby', 'foodDetail']
  });

  const SKINS = [
    {
      id: 'aqua', name: '水蓝（经典）', dot: '#2ea4e8', outline: '#0b1826',
      hasCrown: false,
      pal: {},
      fx: { dropMid: '#2ea4e8', dropHi: '#c4f2ff', core: '#e8feff' }
    },
    {
      id: 'acid', name: '毒绿（酸液）', dot: '#4ad638', outline: '#0a1f10',
      hasCrown: false,
      pal: {
        bodyDark:    '#165c24', bodyMid:     '#34b83d', bodyHi:       '#8ef054',
        emissiveMid: '#58e838', emissiveHot: '#b6ff47', emissiveCore: '#f0ffd4'
      },
      fx: { dropMid: '#48d63e', dropHi: '#c2f768', core: '#f0ffd4' }
    },
    {
      id: 'lava', name: '熔岩红（火胶）', dot: '#f04e24', outline: '#1e0b0c',
      hasCrown: false,
      pal: {
        bodyDark:    '#5c1214', bodyMid:     '#b8261e', bodyHi:       '#f06428',
        emissiveMid: '#ff5218', emissiveHot: '#ffad26', emissiveCore: '#fff5b8'
      },
      fx: { dropMid: '#eb461c', dropHi: '#ffad26', core: '#fff5b8' }
    },
    {
      id: 'crown', name: '皇冠金（稀有）', dot: '#f2b82e', outline: '#1f1508',
      hasCrown: true,
      pal: {
        bodyDark:    '#7d4b0f', bodyMid:     '#d99b1e', bodyHi:       '#fae06b',
        emissiveMid: '#f5b828', emissiveHot: '#ffe87a', emissiveCore: '#fffce8'
      },
      fx: { dropMid: '#e8ad24', dropHi: '#fff09c', core: '#fffce8' }
    }
  ];

  // 5 档无损体积守恒形变壳体（零非整数 scaleX/scaleY 拉伸模糊）
  const MORPHS = [
    { key: 'bodySquash2',  sXY: 1.24, sZ: 0.68, w: 32, d: 32, h: 15 },
    { key: 'bodySquash1',  sXY: 1.11, sZ: 0.84, w: 30, d: 30, h: 18 },
    { key: 'bodyNormal',   sXY: 1.00, sZ: 1.00, w: 28, d: 28, h: 20 },
    { key: 'bodyStretch1', sXY: 0.91, sZ: 1.15, w: 26, d: 26, h: 22 },
    { key: 'bodyStretch2', sXY: 0.83, sZ: 1.32, w: 24, d: 24, h: 25 }
  ];

  // 8 种腹中随机食物目录
  const FOODS = [
    { key: 'food_apple',    name: '红苹果' },
    { key: 'food_berry',    name: '紫葡萄' },
    { key: 'food_banana',   name: '弯香蕉' },
    { key: 'food_beetle',   name: '红瓢虫' },
    { key: 'food_fish',     name: '小橘鱼' },
    { key: 'food_mushroom', name: '斑点蘑菇' },
    { key: 'food_bone',     name: '肉骨头' },
    { key: 'food_cheese',   name: '奶酪块' }
  ];

  // 1. 平滑穹顶果冻躯壳（饱满贴地裙摆 + 圆润半球 + 微尖水滴顶 + 顶弧透亮窗）
  function buildSlimeBodyMorph(makeCanvas, mf) {
    const { sXY, sZ, w: W, d: D, h: H } = mf;
    const m = new VoxelModel(W, D, H, SPEC);
    const { partId, keyToId } = SPEC;
    const pBody = partId.body;
    const pCore = partId.core;
    const kDark = keyToId.bodyDark;
    const kMid  = keyToId.bodyMid;
    const kHi   = keyToId.bodyHi;
    const kHot  = keyToId.emissiveHot;
    const kEm   = keyToId.emissiveMid;

    const rMax = 12.6 * sXY;
    const zMax = Math.min(H - 1, Math.ceil(18.5 * sZ));

    m.fillAABB(-rMax, rMax, -rMax, rMax, 0, zMax, (x, y, z, X, Y) => {
      const uX = X / sXY;
      const uY = Y / sXY;
      const uZ = z / sZ;
      const dDome  = (Math.hypot(uX / 11.1, uY / 11.1, (uZ - 1.8) / 13.4) - 1.0) * 7.8;
      const dSkirt = (Math.hypot(uX / 11.9, uY / 11.9, (uZ - 0.8) / 4.8) - 1.0) * 4.8;
      const dPeak  = (Math.hypot(uX / 4.1, (uY + 0.3) / 4.1, (uZ - 13.4) / 3.7) - 1.0) * 4.0;
      const dAll   = smin(smin(dDome, dSkirt, 2.3), dPeak, 2.7);
      if (dAll <= 0) {
        if (uZ >= 14.0 && dAll > -1.3) {
          const topR2 = uX * uX + (uY + 0.3) * (uY + 0.3);
          if (topR2 <= 10.5) {
            m.setRaw(x, y, z, topR2 <= 2.9 ? kHot : kEm, pCore);
            return;
          }
        }
        m.setRaw(x, y, z, kMid, pBody);
      }
    });

    m.despeckle();

    // 平滑穹顶果冻明暗分级（避免台阶噪斑，呈现圆润胶质感）
    let minZ = H, maxZ = -1;
    const wd = W * D;
    for (let z = 0; z < H; z++) {
      const zOff = z * wd;
      for (let i = zOff, end = zOff + wd; i < end; i++) {
        if (m.parts[i] === pBody) {
          if (z < minZ) minZ = z;
          if (z > maxZ) maxZ = z;
        }
      }
    }
    const span = Math.max(1, maxZ - minZ);
    const snap = m.grid.slice();
    for (let z = 0; z < H; z++) {
      const zOff = z * wd;
      const localZ = (z - minZ) / span;
      for (let y = 0; y < D; y++) {
        const row = zOff + y * W;
        for (let x = 0; x < W; x++) {
          const i = row + x;
          if (m.parts[i] !== pBody) continue;
          const topEmpty = z + 1 >= H || !snap[i + wd];
          const botEmpty = z > 0 && !snap[i - wd];
          if (botEmpty || z <= 1 || localZ < 0.16) m.grid[i] = kDark;
          else if (z >= maxZ - 2 || (topEmpty && localZ >= 0.78)) m.grid[i] = kHi;
          else m.grid[i] = kMid;
        }
      }
    }
    return m.toStripAsset(makeCanvas, {
      footRadius: 11.4 * sXY,
      headZ: Math.round(17.5 * sZ),
      centerZ: Math.round(9 * sZ)
    });
  }

  // =========================================================================
  // 2. 8 种腹中随机食物体素建模（全部控制在 12×12×9 内，360° 严丝合缝藏于腹中）
  // =========================================================================
  function buildFoodApple(makeCanvas) {
    const m = new VoxelModel(12, 12, 9, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 饱满红苹果果身（顶部微凹）
    m.fillAABB(-4.2, 4.2, -4.2, 4.2, 1, 6, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const dent = z >= 5 && r < 1.2 ? 0.55 : 0;
      const d = Math.hypot(X / 3.4, Y / 3.4, (z - 3.3 + dent) / 2.7);
      if (d <= 1.0) m.setRaw(x, y, z, mat('foodRed'), partId.foodMain);
    });
    // 棕色果柄 + 翠绿小嫩叶
    m.paintCapsule(0, 0, 5.4, 0.3, 0, 7.6, 0.75, 0.65, keyToId.foodBrownMid, partId.foodDetail, true);
    m.paintEllipsoid(1.9, 0.3, 7.0, 1.8, 1.1, 0.85, mat('foodGreen'), partId.foodLeaf, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 8, centerZ: 4 });
  }

  function buildFoodBerry(makeCanvas) {
    const m = new VoxelModel(12, 12, 9, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 串状圆润紫葡萄（上宽下尖 7 颗果粒团簇）
    const grapes = [
      [ 0.0,  0.0, 1.8, 1.55],
      [-1.5,  0.9, 3.4, 1.55],
      [ 1.5,  0.9, 3.4, 1.55],
      [ 0.0, -1.4, 3.4, 1.55],
      [-1.7, -0.6, 5.1, 1.55],
      [ 1.7, -0.6, 5.1, 1.55],
      [ 0.0,  1.4, 5.1, 1.55]
    ];
    for (const [gx, gy, gz, r] of grapes) {
      m.paintEllipsoid(gx, gy, gz, r, r, r, mat('foodPurple'), partId.foodMain, true);
    }
    m.paintCapsule(0, 0, 6.2, 0, 0, 7.8, 0.72, 0.62, keyToId.foodBrownMid, partId.foodDetail, true);
    m.paintEllipsoid(1.6, 0.4, 7.1, 1.6, 1.1, 0.8, mat('foodGreen'), partId.foodLeaf, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 8, centerZ: 4 });
  }

  function buildFoodBanana(makeCanvas) {
    const m = new VoxelModel(12, 12, 9, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 金黄弯月形香蕉
    const pts = [
      [-3.8, -0.6, 5.4, 0.95],
      [-2.3,  0.2, 3.4, 1.42],
      [ 0.0,  0.6, 2.5, 1.58],
      [ 2.3,  0.2, 3.4, 1.42],
      [ 3.8, -0.6, 5.4, 0.95]
    ];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      m.paintCapsule(a[0], a[1], a[2], b[0], b[1], b[2], a[3], b[3], mat('foodYellow'), partId.foodMain, true);
    }
    // 两端深棕果蒂
    m.paintEllipsoid(-4.1, -0.8, 5.9, 0.85, 0.85, 0.85, keyToId.foodBrownDark, partId.foodDetail, true);
    m.paintEllipsoid( 4.1, -0.8, 5.9, 0.85, 0.85, 0.85, keyToId.foodBrownDark, partId.foodDetail, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 7, centerZ: 4 });
  }

  function buildFoodBeetle(makeCanvas) {
    const m = new VoxelModel(12, 12, 9, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 红壳半球瓢虫背甲
    m.fillAABB(-4.0, 4.0, -4.5, 3.5, 1, 6, (x, y, z, X, Y) => {
      if (z < 2) return;
      const d = Math.hypot(X / 3.3, (Y + 0.5) / 3.6, (z - 2.2) / 3.2);
      if (d <= 1.0) {
        // 中缝黑线 + 两侧黑圆点
        const isSeam = Math.abs(X) <= 0.45 && z >= 4;
        const isSpot = (Math.hypot(Math.abs(X) - 1.8, Y + 0.4) <= 0.95 && z >= 3) ||
                       (Math.hypot(Math.abs(X) - 1.5, Y + 2.3) <= 0.85 && z >= 3);
        m.setRaw(x, y, z, (isSeam || isSpot) ? keyToId.eyeDark : mat('foodRed'), (isSeam || isSpot) ? partId.foodDetail : partId.foodMain);
      }
    });
    // 黑色小圆头 + 两根小触角 + 6 条短足
    m.paintEllipsoid(0, 3.2, 2.9, 1.85, 1.35, 1.35, keyToId.eyeDark, partId.foodDetail, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 0.9, 4.1, 3.4, s * 1.8, 5.0, 4.4, 0.55, 0.50, keyToId.eyeDark, partId.foodDetail, true);
      for (const ly of [-2.0, -0.3, 1.4]) {
        m.paintCapsule(s * 2.6, ly, 2.0, s * 4.1, ly, 1.2, 0.58, 0.52, keyToId.eyeDark, partId.foodDetail, true);
      }
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 6, centerZ: 3 });
  }

  function buildFoodFish(makeCanvas) {
    const m = new VoxelModel(12, 12, 9, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 胖嘟嘟小橘鱼躯干（朝 +Y）
    m.paintEllipsoid(0, 0.8, 4.0, 2.2, 3.6, 2.3, mat('foodOrange'), partId.foodMain, true);
    // 扁扇尾鳍（-Y）
    m.paintCapsule(0, -2.2, 4.0, 0, -4.4, 5.8, 1.1, 0.85, mat('foodYellow'), partId.foodLeaf, true);
    m.paintCapsule(0, -2.2, 4.0, 0, -4.4, 2.2, 1.1, 0.85, mat('foodYellow'), partId.foodLeaf, true);
    // 背鳍与两侧小胸鳍
    m.paintEllipsoid(0, 0.2, 6.4, 0.75, 1.8, 1.1, mat('foodYellow'), partId.foodLeaf, true);
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 2.5, 0.8, 3.3, 1.1, 1.1, 0.75, mat('foodYellow'), partId.foodLeaf, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    // 左右 1px 清晰黑眼点
    const hw = 5.5, hd = 5.5;
    m.setRaw(Math.round(hw - 1.9), Math.round(hd + 2.8), 4, keyToId.eyeDark, partId.foodDetail);
    m.setRaw(Math.round(hw + 1.9), Math.round(hd + 2.8), 4, keyToId.eyeDark, partId.foodDetail);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: 8, centerZ: 4 });
  }

  function buildFoodMushroom(makeCanvas) {
    const m = new VoxelModel(12, 12, 9, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 奶白蘑菇柄
    m.paintCapsule(0, 0, 1.2, 0, 0, 4.2, 1.75, 1.45, mat('foodCream'), partId.foodLeaf, true);
    // 红伞盖 + 醒目白圆斑
    m.fillAABB(-4.2, 4.2, -4.2, 4.2, 4, 8, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 3.8, Y / 3.8, (z - 4.0) / 3.4);
      if (d <= 1.0) {
        const spots = [
          [ 2.1,  1.6, 5.6], [-2.2,  1.3, 5.7],
          [ 0.2, -2.4, 5.5], [ 0.0,  0.3, 7.2]
        ];
        let isWhite = false;
        for (const [sx, sy, sz] of spots) {
          if (Math.hypot(X - sx, Y - sy, z - sz) <= 1.15) { isWhite = true; break; }
        }
        m.setRaw(x, y, z, isWhite ? keyToId.eyeGlint : mat('foodRed'), isWhite ? partId.foodDetail : partId.foodMain);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: 8, centerZ: 4 });
  }

  function buildFoodBone(makeCanvas) {
    const m = new VoxelModel(12, 12, 9, SPEC);
    const { mat, partId } = SPEC;
    // 经典双头大肉骨头（斜摆 25° 更立体）
    m.paintCapsule(-3.0, -0.5, 3.6, 3.0, 0.5, 4.8, 1.15, 1.15, mat('foodCream'), partId.foodMain, true);
    for (const [bx, by, bz] of [
      [-3.5, -1.6, 3.5], [-3.5,  0.8, 3.7],
      [ 3.5, -0.8, 4.7], [ 3.5,  1.6, 4.9]
    ]) {
      m.paintEllipsoid(bx, by, bz, 1.35, 1.35, 1.35, mat('foodCream'), partId.foodMain, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 7, centerZ: 4 });
  }

  function buildFoodCheese(makeCanvas) {
    const m = new VoxelModel(12, 12, 9, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 金黄三角奶酪块 + 表面深金孔洞
    m.fillAABB(-4.0, 4.0, -3.5, 3.5, 1, 6, (x, y, z, X, Y) => {
      // 三角楔形：从 -X 尖端向 +X 张开
      const u = (X + 3.6) / 7.2;
      if (u < 0 || u > 1) return;
      const halfY = 0.6 + u * 2.9;
      if (Math.abs(Y) <= halfY && z >= 1 && z <= 5) {
        const hole1 = Math.hypot(X - 1.2, Y - 1.2, z - 4.8) <= 1.05;
        const hole2 = Math.hypot(X - 2.6, Y + 1.0, z - 3.0) <= 1.0;
        const hole3 = Math.hypot(X + 0.6, Y + 0.5, z - 3.6) <= 0.9;
        if (hole1 || hole2 || hole3) {
          m.setRaw(x, y, z, keyToId.foodOrangeDark, partId.foodDetail);
        } else {
          m.setRaw(x, y, z, mat('foodYellow'), partId.foodMain);
        }
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: 6, centerZ: 3 });
  }

  // 3. 独立豆豆双眼部件（14×6×6，2×2 深色豆豆眼 + 右上 1px 亮白反点，双层厚防旋转断裂）
  function buildEyesPart(makeCanvas) {
    const W = 14, D = 6, H = 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { partId, keyToId } = SPEC;
    const hw = W * 0.5 - 0.5;
    const ey = 3;
    const ez = 2;
    for (const side of [-1, 1]) {
      const cols = side < 0
        ? [Math.round(hw - 4.0), Math.round(hw - 3.0)]
        : [Math.round(hw + 3.0), Math.round(hw + 4.0)];
      for (let ci = 0; ci < 2; ci++) {
        const x = cols[ci];
        for (let dz = 0; dz <= 1; dz++) {
          const isGlint = (dz === 1 && ci === 1);
          m.setRaw(x, ey,     ez + dz, isGlint ? keyToId.eyeGlint : keyToId.eyeDark, partId.eye);
          m.setRaw(x, ey - 1, ez + dz, keyToId.eyeDark, partId.eye);
        }
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 5, centerZ: 3 });
  }

  // 4. 皇冠金专属小金冠（14×14×8，4 重对称 symDeg=90 + 四面红宝石）
  function buildMiniCrown(makeCanvas) {
    const W = 14, D = 14, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (let z = 0; z < H; z++) {
      for (let y = 0; y < D; y++) {
        const Y = y - hd;
        for (let x = 0; x < W; x++) {
          const X = x - hw;
          const r = Math.hypot(X, Y);
          const rOut = 3.8 + z * 0.16;
          const rIn  = 2.0 + z * 0.12;
          if (z <= 2 && r <= rOut && r >= rIn) {
            m.setRaw(x, y, z, mat('crown'), partId.crown);
            continue;
          }
          if (z >= 3 && z <= 4 && r <= rOut && r >= rIn - 0.2) {
            const ax = Math.abs(X), ay = Math.abs(Y);
            const tw = z === 3 ? 1.85 : 1.15;
            if ((ax <= tw && ay >= 2.0) || (ay <= tw && ax >= 2.0)) {
              m.setRaw(x, y, z, mat('crown'), partId.crown);
            }
          }
          if (z === 5) {
            const ax = Math.abs(X), ay = Math.abs(Y);
            if ((ax <= 0.9 && Math.abs(ay - 3.6) <= 0.9) || (ay <= 0.9 && Math.abs(ax - 3.6) <= 0.9)) {
              m.setRaw(x, y, z, keyToId.crownHi, partId.crown);
            }
          }
        }
      }
    }
    for (const [gx, gy] of [[0, 3.9], [0, -3.9], [3.9, 0], [-3.9, 0]]) {
      m.fillAABB(gx - 1.0, gx + 1.0, gy - 1.0, gy + 1.0, 1, 2, (x, y, z, X, Y) => {
        if (Math.hypot(X - gx, Y - gy) <= 1.0) {
          m.setRaw(x, y, z, z === 2 ? keyToId.rubyHi : keyToId.rubyMid, partId.ruby);
        }
      });
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 7, centerZ: 3 });
  }

  const HOP_WAYPOINTS = [
    { x:  22, y: -14 },
    { x:  26, y:  14 },
    { x:   4, y:  24 },
    { x: -22, y:  16 },
    { x: -26, y: -12 },
    { x:  -2, y: -24 }
  ];

  const SlimeDef = {
    id: 'slime_jelly',
    name: '弹性史莱姆',
    tag: '弹性软体 · 腹中吞食',
    summary: 'v3 标杆版：干净无外飘气泡的 5 档无损半透果冻壳 + 腹中 8 种随机食物弹簧漂浮（每 3.6 秒轮换演示）+ 皇冠金小金冠',
    defaultHabitat: 'swamp',
    footRadius: 11.2,
    ecoWeight: 0.78,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    blocks: ['5 档无损果冻形变', '腹中 8 种随机食物', '二阶弹簧腹腔滞后', '独立双层豆豆眼', '皇冠金小金冠彩蛋'],
    soulHabit: '肚子里漂着刚吞下的水果、瓢虫、小鱼或奶酪，边 Q 弹颤动边蓄力四阶段蹦跳巡游',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {};
      for (let i = 0; i < MORPHS.length; i++) {
        parts[MORPHS[i].key] = buildSlimeBodyMorph(makeCanvas, MORPHS[i]);
      }
      parts.food_apple    = buildFoodApple(makeCanvas);
      parts.food_berry    = buildFoodBerry(makeCanvas);
      parts.food_banana   = buildFoodBanana(makeCanvas);
      parts.food_beetle   = buildFoodBeetle(makeCanvas);
      parts.food_fish     = buildFoodFish(makeCanvas);
      parts.food_mushroom = buildFoodMushroom(makeCanvas);
      parts.food_bone     = buildFoodBone(makeCanvas);
      parts.food_cheese   = buildFoodCheese(makeCanvas);
      parts.eyes          = buildEyesPart(makeCanvas);
      parts.crown         = buildMiniCrown(makeCanvas);

      // 仅壳体随换色变化，腹中食物与双眼/金冠保持真实鲜明本色
      const recolorAssets = MORPHS.map(mf => parts[mf.key]);

      const squishSpring = new SpringDamper1D(0, 140, 9.0);
      const foodSpring   = new SpringDamper3D(opts.homeX ?? 0, opts.homeY ?? 0, 4.4, 145, 11.5);
      const crownSpring  = new SpringDamper3D(opts.homeX ?? 0, opts.homeY ?? 0, 15.6, 175, 12.5);

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const initFoodIdx = typeof opts.foodIdx === 'number'
        ? ((opts.foodIdx % FOODS.length) + FOODS.length) % FOODS.length
        : Math.floor(Math.random() * FOODS.length);

      const state = {
        x: hx0, y: hy0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        eyeYawOff: 0,
        morphIdx: 2,
        scaleXY: 1.0, scaleZ: 1.0,
        foodIdx: initFoodIdx,
        foodTimer: 0,
        foodSwitchInterval: opts.foodSwitchInterval ?? 3.6,
        foodSpin: 0,
        hopWpIdx: Math.abs(Math.floor(opts.seed || 0)) % HOP_WAYPOINTS.length,
        hopPhase: 0,
        hopSx: hx0, hopSy: hy0,
        hopTx: hx0 + HOP_WAYPOINTS[0].x,
        hopTy: hy0 + HOP_WAYPOINTS[0].y,
        hopLaunched: false,
        hopLanded: false
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function spawnJellySplash(vfx, habitat, wx, wy, count, power, sMul) {
        if (!vfx) return;
        if (habitat && habitat.isWater) {
          vfx.addRipple(wx, wy, 6 * sMul, 20 * power * sMul, 0.58, 1.8);
          vfx.spawnSplash(wx, wy, count, power, habitat.fx);
        } else {
          vfx.addRipple(wx, wy, 5 * sMul, 18 * power * sMul, 0.46, 1.5);
          const fx = curSkin.fx || SKINS[0].fx;
          for (let i = 0; i < count; i++) {
            const a = (i / count) * TAU + Math.random() * 0.35;
            const sp = (11 + Math.random() * 16) * power * sMul;
            const col = i % 3 === 0 ? fx.core : (i % 2 === 0 ? fx.dropHi : fx.dropMid);
            vfx.spawnParticle(
              wx + Math.cos(a) * 4 * sMul, wy + Math.sin(a) * 4 * sMul, 1.8 * sMul,
              Math.cos(a) * sp, Math.sin(a) * sp, (9 + Math.random() * 13) * power * sMul,
              0.36 + Math.random() * 0.22, 1.45 + Math.random() * 0.65,
              col, i % 3 === 0, 52
            );
          }
        }
      }

      const instance = {
        def: SlimeDef,
        cachePrefix: `slime_v3c_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of recolorAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 0;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.eyeYawOff = 0; state.morphIdx = 2;
          state.scaleXY = 1.0; state.scaleZ = 1.0;
          state.hopPhase = 0;
          state.hopSx = hx; state.hopSy = hy;
          const wp = HOP_WAYPOINTS[state.hopWpIdx];
          state.hopTx = wp.x; state.hopTy = wp.y;
          state.hopLaunched = false; state.hopLanded = false;
          squishSpring.x = 0; squishSpring.v = 0;
          foodSpring.reset(hx, hy, 4.4);
          crownSpring.reset(hx, hy, 15.6);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const speedMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const patrol = eco && eco.patrol !== false;
          const maxR = (eco && eco.maxRadius) || 48;

          // 工坊预览：每隔几秒随机切换一种腹中食物（游戏内设 foodSwitchInterval = 0 即锁定单次随机结果）
          if (state.foodSwitchInterval > 0) {
            state.foodTimer += dt;
            if (state.foodTimer >= state.foodSwitchInterval) {
              state.foodTimer -= state.foodSwitchInterval;
              let nextIdx = Math.floor(Math.random() * FOODS.length);
              if (nextIdx === state.foodIdx) nextIdx = (nextIdx + 1) % FOODS.length;
              state.foodIdx = nextIdx;
              foodSpring.impulse(0, 0, 14 * sp);
              squishSpring.impulse(1.6 * sp);
            }
          }
          state.foodSpin = wrapAngle(state.foodSpin + dt * 0.65);

          let targetSquish = 0;
          let targetEyeYaw = 0;

          if (patrol) {
            // 真实 4 阶段弹性蹦跳巡游：蓄力压扁 -> 拉伸弹射 -> 抛物线滞空 -> 砸地回弹
            const dur = clamp(1.20 / (gFreq * 0.6 + speedMul * 0.4), 0.58, 2.1);
            state.hopPhase += dt / dur;
            if (state.hopPhase >= 1.0) {
              state.hopPhase -= 1.0;
              state.hopSx = state.x;
              state.hopSy = state.y;
              state.hopWpIdx = (state.hopWpIdx + 1) % HOP_WAYPOINTS.length;
              const wp = HOP_WAYPOINTS[state.hopWpIdx];
              let tx = wp.x + ((eco && eco.avoidX) || 0) * 0.45;
              let ty = wp.y + ((eco && eco.avoidY) || 0) * 0.45;
              const dR = Math.hypot(tx, ty);
              if (dR > maxR) { tx *= maxR / dR; ty *= maxR / dR; }
              state.hopTx = tx;
              state.hopTy = ty;
              state.hopLaunched = false;
              state.hopLanded = false;
            }

            const p = state.hopPhase;
            const dx = state.hopTx - state.hopSx;
            const dy = state.hopTy - state.hopSy;
            const tgtYaw = Math.hypot(dx, dy) > 0.5 ? Math.atan2(-dx, dy) : state.yaw;
            state.yaw = wrapAngle(state.yaw + wrapAngle(tgtYaw - state.yaw) * expSmooth(dt, 10));

            if (p < 0.26) {
              const u = smoothstep(0, 1, p / 0.26);
              state.x = state.hopSx;
              state.y = state.hopSy;
              state.z = 0;
              state.vx = 0; state.vy = 0;
              targetSquish = u * 0.96;
            } else if (p < 0.74) {
              const u = (p - 0.26) / 0.48;
              if (!state.hopLaunched) {
                state.hopLaunched = true;
                squishSpring.impulse(-3.2 * sp);
                foodSpring.impulse(0, 0, -14 * sp);
                crownSpring.impulse(0, 0, -18 * sp);
                spawnJellySplash(vfx, habitat, state.hopSx, state.hopSy, 7, 0.76, sMul);
              }
              const nx = lerp(state.hopSx, state.hopTx, u);
              const ny = lerp(state.hopSy, state.hopTy, u);
              state.vx = (nx - state.x) / Math.max(dt, 0.001);
              state.vy = (ny - state.y) / Math.max(dt, 0.001);
              state.x = nx;
              state.y = ny;
              state.z = Math.sin(u * Math.PI) * 19.5 * clamp(0.8 + sp * 0.2, 0.8, 1.32) * sMul;
              const airVel = Math.abs(Math.cos(u * Math.PI));
              targetSquish = lerp(-0.24, -0.96, airVel);
            } else {
              const u = (p - 0.74) / 0.26;
              if (!state.hopLanded) {
                state.hopLanded = true;
                squishSpring.impulse(4.6 * sp);
                foodSpring.impulse(0, 0, -26 * sp);
                crownSpring.impulse(0, 0, -34 * sp);
                spawnJellySplash(vfx, habitat, state.hopTx, state.hopTy, 12, 1.05, sMul);
              }
              state.x = state.hopTx;
              state.y = state.hopTy;
              state.z = 0;
              state.vx = 0; state.vy = 0;
              const damp = Math.exp(-u * 4.2);
              const osc = Math.cos(u * Math.PI * 3.0);
              targetSquish = 0.96 * damp * osc;
            }
            targetEyeYaw = 0;
          } else {
            // 原地颤动：体积守恒果冻呼吸 + 偶发 Q 弹小抖动 + 好奇微张望
            const kHome = expSmooth(dt, 6.0);
            state.x = lerp(state.x, eco ? (eco.homeX ?? 0) : 0, kHome);
            state.y = lerp(state.y, eco ? (eco.homeY ?? 0) : 0, kHome);
            state.z = lerp(state.z, 0, expSmooth(dt, 10));
            state.vx *= 0.82; state.vy *= 0.82;
            const idleYaw = (eco ? (eco.homeYaw ?? 0) : 0) + Math.sin(time * 0.9) * 0.16;
            state.yaw = wrapAngle(state.yaw + wrapAngle(idleYaw - state.yaw) * expSmooth(dt, 6.5));

            const breath = Math.sin(time * 3.4 * gFreq);
            const jiggleCy = time % 4.4;
            const jiggle = jiggleCy > 3.2 && jiggleCy < 4.0
              ? Math.sin(((jiggleCy - 3.2) / 0.8) * Math.PI * 3) * Math.exp(-(jiggleCy - 3.2) * 3.8) * 0.65 * sp
              : 0;
            targetSquish = 0.42 * breath + jiggle;
            targetEyeYaw = Math.sin(time * 1.4) * 0.14;
          }

          // 二阶弹簧推进弹性形变，量化映射到 5 档无损体素壳体（0 模糊）
          const sq = clamp(
            squishSpring.update(dt, targetSquish, 130 * sp, clamp(9.5 / Math.sqrt(sp), 4.8, 13.5)),
            -1.15, 1.15
          );
          let mIdx = 2;
          if (sq >= 0.62) mIdx = 0;
          else if (sq >= 0.22) mIdx = 1;
          else if (sq <= -0.62) mIdx = 4;
          else if (sq <= -0.22) mIdx = 3;
          state.morphIdx = mIdx;

          const mf = MORPHS[mIdx];
          state.scaleXY = lerp(state.scaleXY, mf.sXY, expSmooth(dt, 18));
          state.scaleZ  = lerp(state.scaleZ,  mf.sZ,  expSmooth(dt, 18));
          state.eyeYawOff = lerp(state.eyeYawOff, targetEyeYaw, expSmooth(dt, 9));

          // 腹中食物弹簧滞后漂浮（严密锁在果冻腹腔中央）
          const foodTgtZ = state.z + (4.2 * state.scaleZ + Math.cos(time * 3.0 * gFreq) * 0.55) * sMul;
          foodSpring.update(dt, state.x, state.y, foodTgtZ, 145 * sp, clamp(11.5 / Math.sqrt(sp), 6.0, 15.0));

          const crownZ = state.z + 15.6 * state.scaleZ * sMul;
          crownSpring.update(dt, state.x, state.y, crownZ, 175 * sp, clamp(12.5 / Math.sqrt(sp), 6.5, 16.0));

          sockets.setWorld('food', foodSpring.x, foodSpring.y, foodSpring.z, state.yaw + state.foodSpin);
          sockets.setWorld('crown', crownSpring.x, crownSpring.y, crownSpring.z, state.yaw);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const mf = MORPHS[state.morphIdx] || MORPHS[2];
          const envSub = (habitat && habitat.isWater) ? EnvFeedback.calcSubmerge(state.z, 2.6 * sMul, 5.2 * sMul, true) : 0;
          // 半透果冻外壳：opacity 0.68（原先借 submerge=0.72 换算出来的同一个值），腹中食物清晰可辨；
          // submerge 只表示浸水深度（水里会染水色）。2026-11-23 渲染器把两者分开了。
          const BODY_OPACITY = 1 - 0.72 * 0.44;

          // 1. 腹中随机食物（bias=-12 严格锁在半透果冻腹腔中央，360° 零穿模、绝不外飘）
          const food = FOODS[state.foodIdx] || FOODS[0];
          const fOffX = clamp(foodSpring.x - state.x, -2.0 * mf.sXY * sMul, 2.0 * mf.sXY * sMul);
          const fOffY = clamp(foodSpring.y - state.y, -2.0 * mf.sXY * sMul, 2.0 * mf.sXY * sMul);
          const fLocZ = clamp(foodSpring.z - state.z, 1.8 * mf.sZ * sMul, 6.2 * mf.sZ * sMul);
          list.push({
            partKey: food.key, asset: parts[food.key],
            x: state.x + fOffX, y: state.y + fOffY, lift: state.z + fLocZ,
            ro: wrapAngle(state.yaw + state.foodSpin), symDeg: 360, bias: -12, submerge: 0
          });

          // 2. 半透果冻主躯壳（5 档无损体素形变，1:1 整数像素渲染）
          list.push({
            partKey: mf.key, asset: parts[mf.key],
            x: state.x, y: state.y, lift: state.z,
            ro: state.yaw, symDeg: 360, bias: 0, submerge: envSub, opacity: BODY_OPACITY
          });

          // 3. 独立正面豆豆双眼（贴合前表面 Y=8.2*sXY, Z=6.2*sZ，正面零遮挡、背面自然被果冻壳遮挡）
          const eyeYaw = wrapAngle(state.yaw + state.eyeYawOff);
          const [ex, ey] = localToWorldXY(state.x, state.y, eyeYaw, 0, 8.2 * mf.sXY * sMul);
          list.push({
            partKey: 'eyes', asset: parts.eyes,
            x: ex, y: ey, lift: state.z + 6.2 * mf.sZ * sMul,
            ro: eyeYaw, symDeg: 360, bias: 0, submerge: 0
          });

          // 4. 皇冠金稀有色系专属：四面红宝石弹簧小金冠（稳坐水滴顶峰之上）
          if (curSkin && curSkin.hasCrown) {
            const [cx, cy] = localToWorldXY(state.x, state.y, state.yaw, 0, -0.3 * mf.sXY * sMul);
            const crLocZ = clamp(crownSpring.z - state.z, 13.4 * mf.sZ * sMul, 20.5 * mf.sZ * sMul);
            list.push({
              partKey: 'crown', asset: parts.crown,
              x: cx, y: cy, lift: state.z + crLocZ,
              ro: state.yaw, symDeg: 90, bias: 12, submerge: 0
            });
          }

          return list;
        },

        exportManifest(params) {
          const food = FOODS[state.foodIdx] || FOODS[0];
          return {
            id: SlimeDef.id, name: SlimeDef.name, outlineMode: 'actorUnified',
            skin: curSkin.id, hasCrown: !!curSkin.hasCrown, morph: MORPHS[state.morphIdx].key,
            stomachFood: food.key, stomachFoodName: food.name,
            foodPool: FOODS.map(f => ({ id: f.key, name: f.name })),
            footRadius: SlimeDef.footRadius, headZ: 18, centerZ: 9,
            blocks: SlimeDef.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(SlimeDef);
})(window.PixelWorkshop);
