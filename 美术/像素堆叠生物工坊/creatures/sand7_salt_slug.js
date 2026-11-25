'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 沙7 · 留下一道淡水痕的（M22 腹足滑行 / 留痕标杆，+Y 正前）
  //   1. 外观（中体型 41 格长 × 25 格宽，避开普通地球大蜗牛感）：
  //      - 宽大柔软的浅灰白 / 淡粉腹足拆为 4 块波浪平推节（前 / 中前 / 中后 / 后），
  //        带清晰侧裙边与腹足褶皱；
  //      - 前端一对低伏圆钝独立弹簧短触角（SpringDamper1D 驱动，受惊骤缩进前额下、
  //        负 bias 藏入，再缓缓探出）；
  //      - 背上非螺旋壳，而是厚重、结满结晶盐粒的多层盐丘 / 盐晶壳，提供 3 套不同厚度
  //        资产（薄盐壳 / 中盐丘 / 老盐厚塔）分别对应 3 套换色皮肤；
  //      - 单怪 26 色（<= 48 色）、0 重色、0 自亮防糊。
  //   2. 骨架与生态动作：
  //      - 腹足顺行波滑行：4 块节按从后往前的相位差做纯位移纵向平推与拱起起伏
  //        （严禁常态 scaleX / scaleY 拉伸）；
  //      - 滑行时按节流间隔持续写入地表痕迹层 vfx.addDecal({ kind: 'wet', ... })，
  //        在白色盐壳湖上留下深青湿润的淡水痕，随时间自然晒干淡褪；
  //      - 周期性停下低头舔盐、背上盐壳微微一颤，偶发受惊时短触角骤缩进前额、盐壳下压防卫。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 宽大柔软浅灰白 / 淡粉腹足主体
      footDark:      '#b5a7a4',
      footMid:       '#dfd4cf',
      footHi:        '#f6efea',
      // 腹足侧裙边与波浪褶边
      skirtDark:     '#9c8786',
      skirtMid:      '#c9b3b1',
      skirtHi:       '#e8d8d4',
      // 腹足节间褶沟与软体凹纹
      foldDark:      '#7d696a',
      foldMid:       '#a68f90',
      foldHi:        '#ccbab8',
      // 承托盐丘的湿润背膜领口
      mantleDark:    '#5e757a',
      mantleMid:     '#8aa3a8',
      mantleHi:      '#bdd1d4',
      // 前端独立弹簧短触角
      tentacleDark:  '#8f6a6c',
      tentacleMid:   '#c79b9c',
      tentacleHi:    '#ebd0ce',
      // 盐壳底层厚重结块盐基
      saltBaseDark:  '#949088',
      saltBaseMid:   '#c4bfb5',
      saltBaseHi:    '#e3dfd5',
      // 白色结晶盐丘主体
      saltCrustDark: '#b8c4c9',
      saltCrustMid:  '#e2ebee',
      saltCrustHi:   '#f9fcfd',
      // 壳顶突出的冷白盐晶棱簇
      crystalDark:   '#78a6b5',
      crystalMid:    '#b6dbe6',
      crystalHi:     '#e8f8fc',
      // 舔盐吻唇凹褶（受保护不加暗缝）
      mouthDark:     '#4f3538',
      mouthMid:      '#785256'
    },
    glowKeys: [],
    parts: [
      'foot', 'skirt', 'fold', 'mantle', 'tentacle',
      'saltBase', 'saltCrust', 'crystal', 'mouth'
    ],
    noCrease: [
      ['foot', 'skirt'],
      ['foot', 'fold'],
      ['skirt', 'fold'],
      ['foot', 'mouth'],
      ['saltBase', 'saltCrust'],
      ['saltCrust', 'crystal']
    ],
    materials: {
      foot:      ['footDark',      'footMid',      'footHi'],
      skirt:     ['skirtDark',     'skirtMid',     'skirtHi'],
      fold:      ['foldDark',      'foldMid',      'foldHi'],
      mantle:    ['mantleDark',    'mantleMid',    'mantleHi'],
      tentacle:  ['tentacleDark',  'tentacleMid',  'tentacleHi'],
      saltBase:  ['saltBaseDark',  'saltBaseMid',  'saltBaseHi'],
      saltCrust: ['saltCrustDark', 'saltCrustMid', 'saltCrustHi'],
      crystal:   ['crystalDark',   'crystalMid',   'crystalHi']
    },
    protectedParts: ['mouth']
  });

  // 3 套零重建模换色皮肤，并分别对应 3 套不同厚度的盐壳资产（中盐丘 / 薄盐壳 / 老盐厚塔）
  const SKINS = [
    {
      id: 'salt_white',
      name: '盐湖白晶（中盐丘）',
      dot: '#e2ebee',
      outline: '#161b21',
      shellKey: 'shellMid',
      pal: {},
      fx: {
        wetDark: '#194d5c',
        wetMid:  '#2b768a',
        wetHi:   '#92dae8',
        saltChip: '#f2f7f9',
        saltDust: '#c8d7dc'
      }
    },
    {
      id: 'pink_thin',
      name: '粉盐浅壳（薄盐壳）',
      dot: '#e6b8c0',
      outline: '#21151b',
      shellKey: 'shellThin',
      pal: {
        footDark:      '#ba999e', footMid:      '#e3c6ca', footHi:      '#faeaec',
        skirtDark:     '#a17a82', skirtMid:     '#cf9fa8', skirtHi:     '#edd0d5',
        foldDark:      '#825d66', foldMid:      '#ad828c', foldHi:      '#d4b2b9',
        mantleDark:    '#6b6478', mantleMid:    '#988fa6', mantleHi:    '#c9c2d4',
        tentacleDark:  '#945c68', tentacleMid:  '#cc8b98', tentacleHi:  '#f0c7cf',
        saltBaseDark:  '#a68a8e', saltBaseMid:  '#d4b9bd', saltBaseHi:  '#f0dde0',
        saltCrustDark: '#ccb0b8', saltCrustMid: '#ebd8de', saltCrustHi: '#fcf4f6',
        crystalDark:   '#9e788a', crystalMid:   '#d6b4c4', crystalHi:   '#f7e6ee',
        mouthDark:     '#572e38', mouthMid:     '#824a58'
      },
      fx: {
        wetDark: '#1b5063',
        wetMid:  '#2f7d94',
        wetHi:   '#9ce3f0',
        saltChip: '#f7e6ec',
        saltDust: '#d9bdc7'
      }
    },
    {
      id: 'aged_tower',
      name: '老盐厚塔（厚晶塔）',
      dot: '#d4ccb8',
      outline: '#181715',
      shellKey: 'shellThick',
      pal: {
        footDark:      '#9c948c', footMid:      '#c7bfb5', footHi:      '#e6dfd5',
        skirtDark:     '#827970', skirtMid:     '#ada398', skirtHi:     '#d4ccc2',
        foldDark:      '#665e57', foldMid:      '#8f857c', foldHi:      '#b8aea4',
        mantleDark:    '#4b6366', mantleMid:    '#749094', mantleHi:    '#a7c2c4',
        tentacleDark:  '#78635c', tentacleMid:  '#ad9389', tentacleHi:  '#d6c1b8',
        saltBaseDark:  '#7d786e', saltBaseMid:  '#ada79a', saltBaseHi:  '#d4cec0',
        saltCrustDark: '#ada899', saltCrustMid: '#dbd6c8', saltCrustHi: '#f5f2e8',
        crystalDark:   '#6d949c', crystalMid:   '#a3cbd1', crystalHi:   '#dff2f5',
        mouthDark:     '#473632', mouthMid:     '#6e544d'
      },
      fx: {
        wetDark: '#144452',
        wetMid:  '#23687a',
        wetHi:   '#80cedb',
        saltChip: '#f2eee2',
        saltDust: '#c7c1b2'
      }
    }
  ];

  // =========================================================================
  // 1. 腹足 4 块波浪平推节（前 / 中前 / 中后 / 后，左右严格对称省半数烘焙缓存）
  //    4 节沿 Y 排列总长 ~41 格、宽 ~25 格，相邻重叠 ~38% 保证行波起伏零露缝
  // =========================================================================
  function buildFootSegment(makeCanvas, role) {
    const cfg = {
      front: { W: 26, D: 16, H: 10, rx: 9.8,  ry: 6.8, rz: 4.3, skirtW: 11.4, ridgeZ: 7.4 },
      midA:  { W: 28, D: 16, H: 10, rx: 11.0, ry: 7.0, rz: 4.5, skirtW: 12.6, ridgeZ: 7.8 },
      midB:  { W: 26, D: 16, H: 9,  rx: 10.2, ry: 6.9, rz: 4.0, skirtW: 11.8, ridgeZ: 7.0 },
      rear:  { W: 22, D: 16, H: 8,  rx: 8.6,  ry: 7.0, rz: 3.1, skirtW: 10.0, ridgeZ: 5.2 }
    }[role];

    const m = new VoxelModel(cfg.W, cfg.D, cfg.H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-cfg.skirtW - 0.6, cfg.skirtW + 0.6, -cfg.ry - 0.6, cfg.ry + 0.6, 0, cfg.H - 1, (x, y, z, X, Y) => {
      const absX = Math.abs(X);
      // 前节前端略收成圆润宽吻，后节后端收成平铺叶尾
      let taper = 1.0;
      if (role === 'front' && Y > 0) {
        taper = lerp(1.0, 0.72, clamp(Y / cfg.ry, 0, 1));
      } else if (role === 'rear' && Y < 0) {
        taper = lerp(1.0, 0.36, Math.pow(clamp(-Y / cfg.ry, 0, 1), 1.15));
      }

      const locSkirtW = cfg.skirtW * taper;
      const locRx = cfg.rx * taper;
      const ny = Y / cfg.ry;
      if (Math.abs(ny) > 1.0) return;

      // 底部宽大波浪侧裙边（z = 0..2）：带对称波浪褶皱，一眼认出软体腹足裙边
      const ruffle = Math.cos(Y * 1.15) * 0.65;
      const skirtLim = locSkirtW + ruffle;
      const skirtD = Math.hypot(absX / Math.max(2.0, skirtLim), ny);
      if (z <= 2 && skirtD <= 1.0) {
        const isEdge = skirtD > 0.78 || z === 0;
        const isPleat = (z === 2 && absX > locRx * 0.78 && Math.cos(Y * 1.6) > 0.25);
        if (isPleat) {
          m.setRaw(x, y, z, mat('fold'), partId.fold);
        } else if (isEdge) {
          m.setRaw(x, y, z, mat('skirt'), partId.skirt);
        } else {
          m.setRaw(x, y, z, mat('foot'), partId.foot);
        }
        return;
      }

      // 主腹足拱背肉体（平滑椭球弧，顶部为承托盐丘的湿润背膜）
      const nx = absX / Math.max(1.8, locRx);
      const nz = (z - 2.0) / Math.max(1.6, cfg.rz);
      const d2 = nx * nx + ny * ny * 0.92 + nz * nz;
      if (d2 <= 1.0 && z >= 1) {
        // 节间横褶沟（位于每节前后边缘，强化行波节段节奏）
        const isGroove = (Math.abs(Y) > cfg.ry * 0.68 && z <= 4);
        // 承托盐壳的中央湿润背膜领口（中前 / 中后节顶部）
        const isMantle = (role === 'midA' || role === 'midB') && z >= 5 && nx < 0.72;
        // 前节前缘正中：微凹舔盐吻唇（无大眼，突出盲舔盐面的异世界软体感）
        if (role === 'front' && Y >= cfg.ry * 0.62 && absX <= 2.4 && z >= 1 && z <= 3) {
          m.setRaw(x, y, z, z === 1 ? keyToId.mouthDark : keyToId.mouthMid, partId.mouth);
          return;
        }
        if (isMantle) {
          m.setRaw(x, y, z, mat('mantle'), partId.mantle);
        } else if (isGroove) {
          m.setRaw(x, y, z, mat('fold'), partId.fold);
        } else {
          m.setRaw(x, y, z, mat('foot'), partId.foot);
        }
      }
    });

    // 前节额顶一对低矮肉脊（受惊时触角刚好藏在额脊下方，后沿压低平顺承接入盐壳底面防穿模）
    if (role === 'front') {
      m.paintEllipsoid(0, 1.4, 5.0, 5.6, 3.5, 1.9, mat('foot'), partId.foot, true);
      m.paintEllipsoid(0, -1.8, 4.8, 6.0, 3.0, 1.5, mat('mantle'), partId.mantle, true);
    }
    // 后节尾部中央一条浅褶背脊
    if (role === 'rear') {
      m.paintCapsule(0, 4.5, 4.0, 0, -4.5, 2.2, 2.4, 1.0, mat('fold'), partId.fold, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, {
      footRadius: cfg.skirtW,
      headZ: Math.round(cfg.ridgeZ),
      centerZ: 4
    });
  }

  // =========================================================================
  // 2. 前端独立弹簧短触角（6×10×6，左右共享同一对称资产，枢轴锁在根部 (0, -3.5)）
  //    避开细长直立蜗牛眼柄，做成低伏圆钝带湿润感官结的短触角
  // =========================================================================
  const TENTACLE_PIVOT = { x: 0, y: -3.5 };
  function buildShortTentacle(makeCanvas) {
    const m = new VoxelModel(6, 10, 6, SPEC);
    const { mat, partId } = SPEC;
    // 从根部 (0, -3.4, 2.2) 向前微翘至感官端球 (0, +3.6, 3.3)
    m.paintCapsule(0, -3.4, 2.2, 0, 2.6, 3.2, 1.35, 0.95, mat('tentacle'), partId.tentacle, true);
    // 末端圆钝感官结（微带湿润淡青反色）
    m.paintEllipsoid(0, 3.5, 3.4, 1.25, 1.25, 1.15, mat('mantle'), partId.mantle, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 5, centerZ: 3 });
  }

  // =========================================================================
  // 3. 三套不同厚度的白色结晶盐丘 / 盐晶壳（薄盐壳 / 中盐丘 / 老盐厚塔）
  //    非螺旋蜗牛壳，而是层叠六角/方棱盐盘 + 结满棱角盐晶粒的盐湖白礁
  // =========================================================================
  function buildSaltShell(makeCanvas, tier) {
    const cfg = {
      thin:  { W: 26, D: 26, H: 11, layers: 2, baseRx: 9.8,  baseRy: 11.0, topH: 7.5 },
      mid:   { W: 28, D: 28, H: 16, layers: 3, baseRx: 10.8, baseRy: 12.2, topH: 12.2 },
      thick: { W: 30, D: 30, H: 21, layers: 4, baseRx: 11.4, baseRy: 12.8, topH: 17.0 }
    }[tier];

    const m = new VoxelModel(cfg.W, cfg.D, cfg.H, SPEC);
    const { mat, partId } = SPEC;

    // 阶梯状多层盐晶壳主体（每层呈带棱角的六边/八边盐盘，越往上逐层收阶，严守左右对称）
    const layerSpecs = tier === 'thin'
      ? [
          { z0: 0, z1: 4, rx: 9.8,  ry: 11.0, yOff: 0.0, matKey: 'saltBase' },
          { z0: 4, z1: 7, rx: 7.4,  ry: 8.6,  yOff: -0.6, matKey: 'saltCrust' }
        ]
      : tier === 'mid'
        ? [
            { z0: 0, z1: 4,  rx: 10.8, ry: 12.2, yOff: 0.2,  matKey: 'saltBase' },
            { z0: 4, z1: 8,  rx: 8.8,  ry: 10.2, yOff: -0.4, matKey: 'saltCrust' },
            { z0: 8, z1: 11, rx: 6.0,  ry: 7.0,  yOff: -1.2, matKey: 'saltCrust' }
          ]
        : [
            { z0: 0,  z1: 5,  rx: 11.4, ry: 12.8, yOff: 0.2,  matKey: 'saltBase' },
            { z0: 5,  z1: 9,  rx: 9.4,  ry: 10.6, yOff: -0.4, matKey: 'saltCrust' },
            { z0: 9,  z1: 13, rx: 7.0,  ry: 8.0,  yOff: -1.1, matKey: 'saltCrust' },
            { z0: 13, z1: 16, rx: 4.5,  ry: 5.2,  yOff: -1.8, matKey: 'saltCrust' }
          ];

    for (let li = 0; li < layerSpecs.length; li++) {
      const L = layerSpecs[li];
      m.fillAABB(-L.rx - 1.2, L.rx + 1.2, L.yOff - L.ry - 1.2, L.yOff + L.ry + 1.2, L.z0, L.z1, (x, y, z, X, Y) => {
        const dy = Y - L.yOff;
        // 用 L-infinity 与 L2 混合造出盐结晶块状棱角轮廓（区别于圆滑蜗牛壳）
        const ax = Math.abs(X) / L.rx;
        const ay = Math.abs(dy) / L.ry;
        const hexDist = Math.max(ax * 0.88 + ay * 0.45, ay * 0.94, Math.hypot(ax, ay) * 0.92);
        const topShrink = lerp(1.0, 0.86, clamp((z - L.z0) / Math.max(1, L.z1 - L.z0), 0, 1));
        if (hexDist > topShrink) return;

        // 阶梯边缘结满白色粗盐粒斑点（按 |X| 对称取样以触发半角镜像烘焙省 50% 图集）
        const grain = ((Math.round(Math.abs(X) * 3) + Math.abs(Math.round(Y * 5)) + z * 7) % 11);
        if (hexDist > topShrink * 0.78 && grain < 3) {
          m.setRaw(x, y, z, mat('crystal'), partId.crystal);
        } else {
          m.setRaw(x, y, z, mat(L.matKey), partId[L.matKey]);
        }
      });
    }

    // 壳面突出的棱角盐晶簇与粗盐颗粒（全部左右对称排布，兼顾奇观感与半角镜像缓存）
    const addSaltCrystal = (cx, cy, cz, r, h, tiltX, tiltY) => {
      m.paintCapsule(cx, cy, cz, cx + tiltX, cy + tiltY, cz + h, r, Math.max(0.55, r * 0.42), mat('crystal'), partId.crystal, true);
    };

    if (tier === 'thin') {
      // 薄盐壳：壳面点缀少量矮盐晶粒
      addSaltCrystal(0, -1.0, 6.2, 1.5, 2.6, 0, -0.4);
      for (const s of [-1, 1]) {
        addSaltCrystal(s * 4.4, 2.0, 5.2, 1.2, 2.0, s * 0.8, 0.4);
        addSaltCrystal(s * 5.2, -3.6, 4.6, 1.1, 1.8, s * 0.7, -0.5);
      }
    } else if (tier === 'mid') {
      // 中盐丘：居中主盐晶簇 + 两侧护肩盐棱 + 前后碎盐粒
      addSaltCrystal(0, -1.4, 10.2, 2.0, 4.2, 0, -0.6);
      for (const s of [-1, 1]) {
        addSaltCrystal(s * 2.8, 0.8, 9.6, 1.5, 3.2, s * 0.9, 0.4);
        addSaltCrystal(s * 6.2, 2.6, 6.4, 1.4, 2.8, s * 1.2, 0.5);
        addSaltCrystal(s * 6.0, -4.4, 6.2, 1.4, 2.6, s * 1.1, -0.7);
        m.paintEllipsoid(s * 7.8, -0.8, 4.5, 1.3, 1.6, 1.3, mat('saltCrust'), partId.saltCrust, true);
      }
      addSaltCrystal(0, 5.2, 7.2, 1.3, 2.2, 0, 0.7);
    } else {
      // 老盐厚塔：高耸多簇盐晶塔尖 + 阶梯侧生粗盐晶块
      addSaltCrystal(0, -2.0, 15.0, 2.2, 4.8, 0, -0.6);
      for (const s of [-1, 1]) {
        addSaltCrystal(s * 2.4, -0.4, 14.2, 1.6, 3.6, s * 1.0, 0.3);
        addSaltCrystal(s * 5.2, 2.2, 10.8, 1.7, 3.6, s * 1.3, 0.6);
        addSaltCrystal(s * 5.4, -4.8, 10.4, 1.6, 3.4, s * 1.2, -0.8);
        addSaltCrystal(s * 8.0, 0.2, 6.6, 1.6, 3.2, s * 1.4, 0.0);
        m.paintEllipsoid(s * 7.4, 5.4, 5.2, 1.6, 1.6, 1.5, mat('saltCrust'), partId.saltCrust, true);
      }
      addSaltCrystal(0, 5.8, 8.6, 1.5, 2.8, 0, 0.9);
      addSaltCrystal(0, -7.8, 8.0, 1.5, 2.6, 0, -1.0);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, {
      footRadius: cfg.baseRx,
      headZ: Math.round(cfg.topH),
      centerZ: Math.round(cfg.topH * 0.5)
    });
  }

  // =========================================================================
  // 4. M22 行波与触角参数常量（模板卡第 ④ 栏实测基准）
  // =========================================================================
  const SEG_BASE_Y = [11.5, 2.5, -6.5, -15.0];  // 4 块腹足节局部纵向锚点（总长 ~41 格）
  const WAVE_PHASE_STEP = 1.05;                 // 相邻节相位差（rad，从后往前顺行传递）
  const WAVE_LONG_AMP   = 1.15;                 // 滑行时单节纵向平推幅（格）
  const WAVE_LIFT_AMP   = 0.95;                 // 滑行时单节腹足拱起幅（格）
  const WET_DECAL_STEP  = 2.6;                  // 湿痕写入间距节流（格）
  const WET_DECAL_LIFE  = 11.0;                 // 淡水湿痕晒干淡褪时长（秒）

  const Sand7SaltSlugDef = {
    id: 'sand7_salt_slug',
    code: '沙7',
    name: '留下一道淡水痕的',
    status: 'done',
    tag: 'M22 标杆 · 腹足滑行留湿痕',
    summary: '中体型软体盐壳生物：4 块波浪平推腹足节 + 独立弹簧短触角 + 3 档厚度白色结晶盐丘；滑行时腹底顺行波推进并在盐壳湖面持续留下深青湿润淡水痕，周期停下低头舔盐、偶发受惊骤缩触角',
    defaultHabitat: 'saltlake',
    footRadius: 15.5,
    ecoWeight: 1.15,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '4 节腹足顺行波平推',
      '地表痕迹层渐褪淡水湿痕',
      '双短触角独立弹簧骤缩',
      '3 档厚度多层盐晶壳',
      '低头舔盐与受惊压壳防卫'
    ],
    soulHabit: '在白色盐壳湖面缓缓滑行，腹足节一波波往前平推、身后拖出清晰深青的湿润淡水痕；时不时停下低头舔盐、背上盐壳微颤掉盐粒，偶发受惊时一对短触角瞬间缩进前额下再缓缓探出',
    actions: [
      { id: 'patrol',  name: '自由巡游（慢滑留痕 + 舔盐 / 惊缩）', loop: true,  status: 'done' },
      { id: 'idle',    name: '原地待机（呼吸 + 触角探索）',          loop: true,  status: 'done' },
      { id: 'startle', name: '受惊骤缩（触角缩入 + 盐壳下压）',      loop: false, duration: 3.2, status: 'done' }
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
        footFront:  buildFootSegment(makeCanvas, 'front'),
        footMidA:   buildFootSegment(makeCanvas, 'midA'),
        footMidB:   buildFootSegment(makeCanvas, 'midB'),
        footRear:   buildFootSegment(makeCanvas, 'rear'),
        tentacle:   buildShortTentacle(makeCanvas),
        shellThin:  buildSaltShell(makeCanvas, 'thin'),
        shellMid:   buildSaltShell(makeCanvas, 'mid'),
        shellThick: buildSaltShell(makeCanvas, 'thick')
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.45;
      const seed0 = opts.seed ?? 73;

      // 左右独立短触角弹簧（伸展量 0..1 与外张偏航角）
      const tentExtendL = new SpringDamper1D(1.0, 135, 12.5);
      const tentExtendR = new SpringDamper1D(1.0, 135, 12.5);
      const tentYawL    = new SpringDamper1D(0.32, 85, 8.5);
      const tentYawR    = new SpringDamper1D(-0.32, 85, 8.5);
      // 背上盐丘壳二阶弹簧（垂直微颤与滞后偏航）
      const shellLiftSp = new SpringDamper1D(0, 115, 9.5);
      const shellYawSp  = new SpringDamper1D(0, 82, 7.2);
      // 舔盐低头进度弹簧（0=抬头，1=贴盐面低头舔舐）
      const lickSpring  = new SpringDamper1D(0, 96, 10.5);

      const state = {
        x: hx0, y: hy0, z: 0,
        vx: 0, vy: 0,
        yaw: hyaw0,
        yawRate: 0,
        shadowScale: 0.92,
        wavePhase: 0,
        // 巡游生态状态机：'glide' (慢滑留痕) | 'lick' (停下低头舔盐) | 'startle' (受惊骤缩触角)
        stage: 'glide',
        stageT: 0,
        stageDur: 7.5,
        seq: 1,
        lickCountSinceStartle: 0,
        lickShiverDone: false,
        startleImpulsed: false,
        // 巡游导航点与湿痕节流
        navX: hx0 + 18,
        navY: hy0 + 12,
        decalDistAcc: 0,
        decalCd: 0,
        lastTrailX: hx0,
        lastTrailY: hy0,
        prevAction: 'patrol'
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function clampInSafeDisc(x, y, maxR) {
        const lim = maxR * 0.80;
        const d = Math.hypot(x, y);
        if (d > lim && d > 1e-4) {
          return [x * lim / d, y * lim / d];
        }
        return [x, y];
      }

      function pickNextTarget(maxR) {
        state.seq++;
        const r1 = hash2i(state.seq, seed0, 113);
        const r2 = hash2i(state.seq, seed0, 241);
        const r3 = hash2i(state.seq, seed0, 367);
        const curAng = Math.atan2(state.y, state.x);
        const nextAng = curAng + (r1 > 0.5 ? 1 : -1) * lerp(1.15, 2.35, r2);
        const rad = lerp(maxR * 0.28, maxR * 0.72, r3);
        state.navX = Math.cos(nextAng) * rad;
        state.navY = Math.sin(nextAng) * rad;
      }

      function emitWetTrail(vfx, wx, wy, yaw, sMul, extraWidth = 1.0) {
        if (!vfx || typeof vfx.addDecal !== 'function') return;
        const fx = curSkin.fx || SKINS[0].fx;
        vfx.addDecal({
          kind: 'wet',
          x: wx,
          y: wy,
          yaw,
          rx: 7.4 * sMul * extraWidth,
          ry: 5.2 * sMul * extraWidth,
          life: WET_DECAL_LIFE,
          alpha: 0.85,
          color: fx.wetMid,
          darkColor: fx.wetDark,
          hiColor: fx.wetHi
        });
      }

      function spawnSaltCrumbs(vfx, wx, wy, wz, count, sMul) {
        if (!vfx || typeof vfx.spawnParticle !== 'function') return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU + hash2i(state.seq + i, seed0, 509) * 0.9;
          const spd = (4.5 + hash2i(state.seq + i, seed0, 613) * 6.5) * sMul;
          vfx.spawnParticle(
            wx + Math.cos(a) * 5.2 * sMul,
            wy + Math.sin(a) * 5.2 * sMul,
            wz,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            (4.0 + hash2i(state.seq + i, seed0, 719) * 5.0) * sMul,
            0.42 + hash2i(state.seq + i, seed0, 823) * 0.22,
            1.15,
            i % 2 === 0 ? fx.saltChip : fx.saltDust,
            false,
            34
          );
        }
      }

      function enterGlide() {
        state.stage = 'glide';
        state.stageT = 0;
        state.seq++;
        state.stageDur = lerp(6.2, 10.4, hash2i(state.seq, seed0, 419));
      }

      function enterLick(vfx, sMul) {
        state.stage = 'lick';
        state.stageT = 0;
        state.stageDur = lerp(2.5, 3.4, hash2i(state.seq + 7, seed0, 463));
        state.lickShiverDone = false;
        // 停下时在腹足下补一笔饱满湿斑，衔接滑行湿痕
        const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw, 0, -9.5 * sMul);
        emitWetTrail(vfx, tx, ty, state.yaw, sMul, 1.06);
      }

      function enterStartle(sp, vfx, sMul) {
        state.stage = 'startle';
        state.stageT = 0;
        state.stageDur = 3.0;
        state.startleImpulsed = true;
        // 触角骤缩脉冲 + 盐壳下压微颤
        tentExtendL.impulse(-14.5 * sp);
        tentExtendR.impulse(-13.8 * sp);
        shellLiftSp.impulse(-16.0 * sp);
        shellYawSp.impulse(((state.seq % 2 === 0) ? 1 : -1) * 3.2 * sp);
        spawnSaltCrumbs(vfx, state.x, state.y, 11.0 * sMul, 6, sMul);
      }

      const instance = {
        def: Sand7SaltSlugDef,
        cachePrefix: `sand7_slug_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 0;
          state.vx = 0; state.vy = 0;
          state.yaw = hyaw;
          state.yawRate = 0;
          state.wavePhase = 0;
          state.stage = 'glide';
          state.stageT = 0;
          state.stageDur = 7.2;
          state.lickCountSinceStartle = 0;
          state.lickShiverDone = false;
          state.startleImpulsed = false;
          state.decalDistAcc = 0;
          state.decalCd = 0;
          state.lastTrailX = hx;
          state.lastTrailY = hy;
          state.prevAction = 'patrol';

          tentExtendL.x = 1.0; tentExtendL.v = 0;
          tentExtendR.x = 1.0; tentExtendR.v = 0;
          tentYawL.x = 0.32;   tentYawL.v = 0;
          tentYawR.x = -0.32;  tentYawR.v = 0;
          shellLiftSp.x = 0;   shellLiftSp.v = 0;
          shellYawSp.x = 0;    shellYawSp.v = 0;
          lickSpring.x = 0;    lickSpring.v = 0;

          pickNextTarget(44);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.35, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const speedMul = clamp(params.speed ?? 1.0, 0.35, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const maxR = (eco && eco.maxRadius) || 44;
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const homeYaw = (eco && eco.homeYaw) ?? hyaw0;
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');

          // 动作切换响应
          if (action !== state.prevAction) {
            state.prevAction = action;
            if (action === 'startle') {
              enterStartle(sp, vfx, sMul);
            } else if (action === 'patrol') {
              enterGlide();
            } else if (action === 'idle') {
              state.stage = 'idle';
              state.stageT = 0;
            }
          }

          let moveSpeed = 0;
          let targetTentL = 1.0;
          let targetTentR = 1.0;
          let targetTentYawL = 0.30 + Math.sin(time * 1.45) * 0.22;
          let targetTentYawR = -0.30 + Math.cos(time * 1.28 + 0.8) * 0.22;
          let tentStiff = 115 * sp;
          let tentDamp = clamp(11.5 * dScale, 5.0, 18.0);
          let targetShellLift = 0;
          let targetLick = 0;
          let rawYawRate = 0;

          // -----------------------------------------------------------------
          // 分支 A：受惊骤缩展示（action === 'startle' 或 patrol 内偶发 startle 态）
          // -----------------------------------------------------------------
          if (action === 'startle' || (action === 'patrol' && state.stage === 'startle')) {
            state.stageT += dt;
            const dur = action === 'startle' ? 3.2 : state.stageDur;
            const u = clamp(state.stageT / Math.max(0.1, dur), 0, 1);

            state.vx *= 0.78;
            state.vy *= 0.78;
            state.wavePhase = (state.wavePhase + dt * 1.1 * gFreq) % TAU;

            if (u < 0.44) {
              // 骤缩防卫期：触角迅速缩进前额下，盐壳紧压腹足
              targetTentL = 0.0;
              targetTentR = 0.0;
              targetTentYawL = 0.05;
              targetTentYawR = -0.05;
              tentStiff = 260 * sp;
              tentDamp = clamp(18.0 * dScale, 8.0, 26.0);
              targetShellLift = -1.35 * sMul;
            } else {
              // 缓缓探出试探期：左触角先慢探、右触角略滞后 0.08 进度跟出，盐壳缓升复位
              const pL = smoothstep(0.44, 0.86, u);
              const pR = smoothstep(0.50, 0.92, u);
              targetTentL = pL;
              targetTentR = pR;
              targetTentYawL = lerp(0.08, 0.40, pL) + Math.sin(time * 2.8) * 0.14 * pL;
              targetTentYawR = lerp(-0.08, -0.40, pR) + Math.cos(time * 2.5) * 0.14 * pR;
              tentStiff = 44 * sp;
              tentDamp = clamp(9.5 * dScale, 4.5, 15.0);
              targetShellLift = lerp(-1.35 * sMul, 0, smoothstep(0.46, 0.85, u));
            }

            if (action === 'patrol' && state.stageT >= state.stageDur) {
              enterGlide();
            }
          }
          // -----------------------------------------------------------------
          // 分支 B：原地待机（idle）—— 呼吸微动、触角左右探索，偶发低头舔盐
          // -----------------------------------------------------------------
          else if (action === 'idle') {
            state.stage = 'idle';
            state.stageT += dt;
            state.x = lerp(state.x, homeX, expSmooth(dt, 4.5));
            state.y = lerp(state.y, homeY, expSmooth(dt, 4.5));
            const yd = wrapAngle(homeYaw - state.yaw);
            const turnStep = yd * expSmooth(dt, 3.8);
            state.yaw = wrapAngle(state.yaw + turnStep);
            rawYawRate = turnStep / Math.max(dt, 0.001);
            state.vx = 0;
            state.vy = 0;

            // 原地保持极慢的腹足呼吸微波
            state.wavePhase = (state.wavePhase + dt * 1.9 * gFreq) % TAU;
            // 每 8 秒原地低头舔一口盐
            const idleCycle = state.stageT % 8.4;
            if (idleCycle > 5.2 && idleCycle < 7.4) {
              const lu = (idleCycle - 5.2) / 2.2;
              targetLick = Math.sin(lu * Math.PI);
              targetTentL = 0.72;
              targetTentR = 0.72;
              targetTentYawL = 0.44;
              targetTentYawR = -0.44;
              targetShellLift = Math.sin(lu * Math.PI * 3.0) * 0.28 * sMul;
            } else {
              targetTentL = 0.96 + Math.sin(time * 1.1) * 0.04;
              targetTentR = 0.96 + Math.cos(time * 1.0 + 0.5) * 0.04;
              targetTentYawL = 0.34 + Math.sin(time * 1.65) * 0.26;
              targetTentYawR = -0.34 + Math.cos(time * 1.42 + 0.9) * 0.26;
            }
          }
          // -----------------------------------------------------------------
          // 分支 C：自由巡游（patrol）—— 慢滑留淡水湿痕 ↔ 停下低头舔盐 ↔ 偶发惊缩
          // -----------------------------------------------------------------
          else {
            state.stageT += dt;
            if (state.stage === 'glide') {
              const tx = state.navX + ((eco && eco.avoidX) || 0) * 0.30;
              const ty = state.navY + ((eco && eco.avoidY) || 0) * 0.30;
              const dx = tx - state.x;
              const dy = ty - state.y;
              const dist = Math.hypot(dx, dy);
              if (dist < 7.5 * sMul) pickNextTarget(maxR);

              const desiredYaw = Math.atan2(-dx, dy);
              const yawDiff = wrapAngle(desiredYaw - state.yaw);
              const maxTurn = 1.35 * (0.65 + speedMul * 0.35);
              const turnDelta = clamp(yawDiff, -maxTurn * dt, maxTurn * dt);
              state.yaw = wrapAngle(state.yaw + turnDelta);
              rawYawRate = turnDelta / Math.max(dt, 0.001);

              // 腹足顺行波驱动慢滑推进（带细微脉动感，模拟腹底肌肉波平推）
              state.wavePhase = (state.wavePhase + dt * 4.6 * gFreq * (0.72 + speedMul * 0.28)) % TAU;
              const wavePush = 0.78 + 0.22 * Math.sin(state.wavePhase);
              const align = clamp(Math.cos(yawDiff), 0.22, 1.0);
              moveSpeed = 8.4 * speedMul * wavePush * align * sMul;

              const fwdX = -Math.sin(state.yaw);
              const fwdY =  Math.cos(state.yaw);
              const kVel = expSmooth(dt, 5.5);
              state.vx = lerp(state.vx, fwdX * moveSpeed, kVel);
              state.vy = lerp(state.vy, fwdY * moveSpeed, kVel);

              let nx = state.x + state.vx * dt;
              let ny = state.y + state.vy * dt;
              const safeLim = maxR * 0.80;
              const curR = Math.hypot(nx, ny);
              if (curR > safeLim) {
                [nx, ny] = clampInSafeDisc(nx, ny, maxR);
                pickNextTarget(maxR);
              }
              state.x = nx;
              state.y = ny;

              // 按滑行距离与时间节流，持续往地表痕迹层写入深青湿润淡水痕
              const [trailX, trailY] = localToWorldXY(state.x, state.y, state.yaw, 0, -12.0 * sMul);
              const stepD = Math.hypot(trailX - state.lastTrailX, trailY - state.lastTrailY);
              state.decalDistAcc += stepD;
              state.decalCd -= dt;
              if (state.decalDistAcc >= WET_DECAL_STEP * sMul || state.decalCd <= 0) {
                state.decalDistAcc = 0;
                state.decalCd = clamp(0.32 / speedMul, 0.18, 0.45);
                state.lastTrailX = trailX;
                state.lastTrailY = trailY;
                emitWetTrail(vfx, trailX, trailY, state.yaw, sMul, 1.0);
              }

              // 滑行时触角微向前外探，随转向略微朝目标侧偏摆
              const lookBias = clamp(yawDiff, -0.35, 0.35) * 0.45;
              targetTentL = 1.0;
              targetTentR = 1.0;
              targetTentYawL = 0.28 + lookBias + Math.sin(time * 1.9 + 0.2) * 0.16;
              targetTentYawR = -0.28 + lookBias + Math.cos(time * 1.7 + 0.9) * 0.16;

              if (state.stageT >= state.stageDur) {
                state.lickCountSinceStartle++;
                const wantStartle = state.lickCountSinceStartle >= 3 && hash2i(state.seq + 11, seed0, 577) < 0.65;
                if (wantStartle) {
                  state.lickCountSinceStartle = 0;
                  enterStartle(sp, vfx, sMul);
                } else {
                  enterLick(vfx, sMul);
                }
              }
            } else if (state.stage === 'lick') {
              // 停下低头舔盐，背上盐壳微微一颤、抖落几粒结晶盐屑
              state.vx *= 0.80;
              state.vy *= 0.80;
              state.wavePhase = (state.wavePhase + dt * 1.6 * gFreq) % TAU;
              const u = clamp(state.stageT / Math.max(0.1, state.stageDur), 0, 1);
              targetLick = Math.sin(u * Math.PI);

              // 舔盐中途背壳微微一颤，把吞下的盐压进盐丘里
              if (!state.lickShiverDone && u >= 0.46) {
                state.lickShiverDone = true;
                shellLiftSp.impulse(12.5 * sp);
                shellYawSp.impulse(((state.seq % 2 === 0) ? 1 : -1) * 2.8 * sp);
                spawnSaltCrumbs(vfx, state.x, state.y, 10.5 * sMul, 5, sMul);
              }

              targetTentL = 0.70;
              targetTentR = 0.70;
              targetTentYawL = 0.46 + Math.sin(time * 4.2) * 0.10;
              targetTentYawR = -0.46 - Math.sin(time * 4.2) * 0.10;
              targetShellLift = Math.sin(u * Math.PI * 2.0) * 0.35 * sMul;

              if (state.stageT >= state.stageDur) {
                enterGlide();
              }
            }
          }

          // -----------------------------------------------------------------
          // 统一位置安全钳制（非 idle 模式严格保证 <= maxRadius * 0.80）
          // -----------------------------------------------------------------
          if (action !== 'idle') {
            const [cx, cy] = clampInSafeDisc(state.x, state.y, maxR);
            state.x = cx;
            state.y = cy;
          }
          state.z = 0;
          state.yawRate = lerp(state.yawRate, clamp(rawYawRate, -2.5, 2.5), expSmooth(dt, 6.5));

          // -----------------------------------------------------------------
          // 弹簧平滑更新：双触角伸展/偏摆、背壳起伏/滞后、舔盐低头
          // -----------------------------------------------------------------
          tentExtendL.update(dt, targetTentL, tentStiff, tentDamp);
          tentExtendR.update(dt, targetTentR, tentStiff, tentDamp);
          tentExtendL.x = clamp(tentExtendL.x, -0.05, 1.12);
          tentExtendR.x = clamp(tentExtendR.x, -0.05, 1.12);

          tentYawL.update(dt, targetTentYawL, 85 * sp, clamp(8.5 * dScale, 4.0, 14.0));
          tentYawR.update(dt, targetTentYawR, 85 * sp, clamp(8.5 * dScale, 4.0, 14.0));

          const glideWaveShell = Math.sin(state.wavePhase - 1.4) * (moveSpeed > 0.5 ? 0.42 : 0.16) * sMul;
          shellLiftSp.update(dt, targetShellLift + glideWaveShell, 115 * sp, clamp(9.5 * dScale, 4.2, 16.0));
          shellYawSp.update(dt, clamp(-state.yawRate * 0.12 * flex, -0.22, 0.22), 82 * sp, clamp(7.2 * dScale, 3.6, 13.0));
          lickSpring.update(dt, targetLick, 96 * sp, clamp(10.5 * dScale, 4.5, 16.0));

          // 对外挂点（供共生小动物或生态交互读取）
          sockets.setLocal('head', state.x, state.y, state.z, state.yaw, 0, 15.5, 4.5, sMul);
          sockets.setLocal('shellTop', state.x, state.y, state.z, state.yaw, 0, -2.5, 14.0, sMul);
          sockets.setLocal('trail', state.x, state.y, state.z, state.yaw, 0, -14.0, 0.5, sMul);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const lick = clamp(lickSpring.x, 0, 1);
          const isGliding = state.stage === 'glide' && Math.hypot(state.vx, state.vy) > 1.2;
          const waveGain = isGliding ? 1.0 : 0.24;

          // -----------------------------------------------------------------
          // 1. 4 块腹足波浪平推节（从后往前顺行波：i=3 后 → i=2 中后 → i=1 中前 → i=0 前）
          //    全程零 scaleX / scaleY 缩放，纯靠节位纵移与微拱表达清晰可见的腹足肌肉波
          // -----------------------------------------------------------------
          const segKeys = ['footFront', 'footMidA', 'footMidB', 'footRear'];
          let frontSegY = SEG_BASE_Y[0];
          let frontSegLift = 0;
          let midWaveLiftSum = 0;

          for (let i = 0; i < 4; i++) {
            // 顺行波相位：后节(i=3)先起波，经 WAVE_PHASE_STEP 逐节向前传递到前节(i=0)
            const phi = state.wavePhase - (3 - i) * WAVE_PHASE_STEP;
            const longOff = Math.sin(phi) * WAVE_LONG_AMP * waveGain;
            const liftOff = Math.max(0, Math.cos(phi)) * WAVE_LIFT_AMP * waveGain;
            // 转向时身体后段轻微柔顺外甩（形成自然软体弧线）
            const bendWeight = (i - 1.2) * (i - 1.2) * 0.55;
            const sideBend = clamp(-state.yawRate * bendWeight * 1.4, -2.4, 2.4);
            // 舔盐时前节略微前伸压低贴近盐壳
            const lickForward = i === 0 ? lick * 1.45 : 0;
            const lickDrop = i === 0 ? -lick * 0.45 : 0;

            const locY = (SEG_BASE_Y[i] + longOff + lickForward) * sMul;
            const locX = sideBend * sMul;
            const lift = Math.max(0, (liftOff + lickDrop) * sMul);
            const segYaw = wrapAngle(yw + clamp(-state.yawRate * (i - 1.0) * 0.09, -0.18, 0.18));
            const [wx, wy] = localToWorldXY(state.x, state.y, yw, locX, locY);

            if (i === 0) {
              frontSegY = SEG_BASE_Y[0] + longOff + lickForward;
              frontSegLift = lift;
            } else if (i === 1 || i === 2) {
              midWaveLiftSum += lift;
            }

            list.push({
              partKey: segKeys[i],
              asset: parts[segKeys[i]],
              x: wx,
              y: wy,
              lift,
              ro: segYaw,
              symDeg: (i === 1 || i === 2) ? 180 : 360,
              bias: -0.20 + (3 - i) * 0.04
            });
          }

          // -----------------------------------------------------------------
          // 2. 前端一对独立弹簧短触角（受惊时迅速缩回前额下，负 bias 藏入零穿模）
          // -----------------------------------------------------------------
          const tents = [
            { side: -1, ext: clamp(tentExtendL.x, 0, 1.1), yawOff: tentYawL.x },
            { side:  1, ext: clamp(tentExtendR.x, 0, 1.1), yawOff: tentYawR.x }
          ];
          for (let ti = 0; ti < 2; ti++) {
            const t = tents[ti];
            // 缩入前额超过 86% 时完全藏入不绘制，避免任何穿出前额轮廓的像素
            if (t.ext < 0.14) continue;

            const retractT = 1.0 - smoothstep(0.14, 0.92, t.ext);
            const anchorX = t.side * lerp(4.6, 2.4, retractT) * sMul;
            const anchorY = (frontSegY + lerp(5.4, 0.2, retractT)) * sMul;
            const [jx, jy] = localToWorldXY(state.x, state.y, yw, anchorX, anchorY);
            const tYaw = wrapAngle(yw + clamp(t.yawOff, -0.68, 0.68));
            const [tx, ty] = pivotToWorldXY(jx, jy, tYaw, TENTACLE_PIVOT.x * sMul, TENTACLE_PIVOT.y * sMul);
            const tLift = Math.max(0.2, frontSegLift + lerp(3.4, 1.4, retractT) * sMul - lick * 1.1 * sMul);
            // 缩回过程中用强负 bias(-4.0) 稳稳藏入前额肉脊下方，完全探出后用正 bias 清晰可见
            const tBias = t.ext < 0.55 ? -4.0 : 0.38;

            list.push({
              partKey: 'tentacle',
              asset: parts.tentacle,
              x: tx,
              y: ty,
              lift: tLift,
              ro: tYaw,
              bias: tBias
            });
          }

          // -----------------------------------------------------------------
          // 3. 背上厚重白色结晶盐丘 / 盐晶壳（随皮肤自动对应 薄盐壳 / 中盐丘 / 老盐厚塔）
          //    盐壳坐落在腹足背膜上方，给 bias=18.0 覆盖 4 节腹足最大前后跨距，确保 360° 零穿模
          // -----------------------------------------------------------------
          const shellKey = curSkin.shellKey || 'shellMid';
          const midWaveLift = midWaveLiftSum * 0.5;
          const shellBaseLift = 4.9 * sMul + midWaveLift * 0.65;
          const shellLift = Math.max(3.8 * sMul, shellBaseLift + clamp(shellLiftSp.x * 0.22, -1.1 * sMul, 2.0 * sMul));
          const [sx, sy] = localToWorldXY(state.x, state.y, yw, 0, -2.4 * sMul);
          const shellYaw = wrapAngle(yw + clamp(shellYawSp.x, -0.24, 0.24));

          list.push({
            partKey: shellKey,
            asset: parts[shellKey],
            x: sx,
            y: sy,
            lift: shellLift,
            ro: shellYaw,
            bias: 18.0
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Sand7SaltSlugDef.id,
            code: Sand7SaltSlugDef.code,
            status: Sand7SaltSlugDef.status,
            name: Sand7SaltSlugDef.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            shellAsset: curSkin.shellKey || 'shellMid',
            stage: state.stage,
            wavePhaseStep: WAVE_PHASE_STEP,
            waveLongAmp: WAVE_LONG_AMP,
            waveLiftAmp: WAVE_LIFT_AMP,
            wetDecalLife: WET_DECAL_LIFE,
            footRadius: Sand7SaltSlugDef.footRadius,
            headZ: 17,
            centerZ: 7,
            blocks: Sand7SaltSlugDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sand7SaltSlugDef);
})(window.PixelWorkshop);
