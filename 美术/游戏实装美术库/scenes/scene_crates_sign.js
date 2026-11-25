'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // S05 标杆 · 岔路木牌与战利品宝箱（scenes/scene_crates_sign.js）
  // -------------------------------------------------------------------------
  // 拆件（全部 <= 22×15×28，严守 40 格红线；金币/金属锁扣/宝石绝不进 glowKeys）：
  //   1. signPost       (12×12×28, symDeg: 360) : 岔路立柱与石墩底座
  //   2. signArrowUpper (22×6×7,   symDeg: 360) : 上层木箭板（绘赤红奖励记号色块）
  //   3. signArrowLower (22×6×7,   symDeg: 360) : 下层木箭板（绘翠青路线记号色块）
  //   4. chestBase      (20×15×11, symDeg: 360) : 暖棕木铜边厚实箱体与亮金锁座
  //   5. chestLidClosed (20×15×8,  symDeg: 360) : 闭合圆顶木箱盖与亮金大锁扣
  //   6. chestLidMid    (20×15×11, symDeg: 360) : 半掀过渡箱盖（防跳帧无拉伸）
  //   7. chestLidOpen   (20×13×12, symDeg: 360) : 全掀向后翻开的独立铰链箱盖
  //   8. lootPile       (16×11×7,  symDeg: 360) : 箱内堆叠金币与红绿蓝三色宝石块
  //   9. woodBarrel     (12×12×14, symDeg: 90)  : 旁侧小木桶组景
  // 27 色 0 重色 0 禁用字，glowKeys 为空数组 []
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 暖棕宝箱与木桶橡木（3 档）
      woodDark:     '#4f2c17',
      woodMid:      '#824d28',
      woodHi:       '#b87642',
      // 路牌风化浅棕木（3 档）
      postDark:     '#57402a',
      postMid:      '#876745',
      postHi:       '#ba9468',
      // 铜边包铁箍带（3 档，不进 glowKeys）
      trimDark:     '#663e18',
      trimMid:      '#a66b29',
      trimHi:       '#db9d47',
      // 亮金大锁扣与堆叠金币（3 档，绝不进 glowKeys）
      goldDark:     '#a87414',
      goldMid:      '#e6b229',
      goldHi:       '#ffe566',
      // 红宝石与上箭板记号（3 档）
      gemRedDark:   '#8c1824',
      gemRedMid:    '#d92b3a',
      gemRedHi:     '#ff7078',
      // 绿宝石与地基微苔（3 档）
      gemGreenDark: '#17693a',
      gemGreenMid:  '#28ab5c',
      gemGreenHi:   '#6ee895',
      // 蓝宝石与下箭板记号（3 档）
      gemBlueDark:  '#1a468c',
      gemBlueMid:   '#2e76db',
      gemBlueHi:    '#75baff',
      // 路牌底座碎石（3 档）
      stoneDark:    '#404852',
      stoneMid:     '#64707d',
      stoneHi:      '#91a0ad',
      // 宝箱暗槽内衬（3 档）
      innerDark:    '#1f130d',
      innerMid:     '#382217',
      innerHi:      '#543524'
    },
    glowKeys: [],
    parts: ['wood', 'post', 'trim', 'gold', 'gemRed', 'gemGreen', 'gemBlue', 'stone', 'inner'],
    noCrease: [
      ['wood', 'trim'],
      ['wood', 'gold'],
      ['trim', 'gold'],
      ['post', 'gemRed'],
      ['post', 'gemGreen'],
      ['post', 'gemBlue'],
      ['gold', 'gemRed'],
      ['gold', 'gemGreen'],
      ['gold', 'gemBlue']
    ],
    materials: {
      wood:     ['woodDark',     'woodMid',     'woodHi'],
      post:     ['postDark',     'postMid',     'postHi'],
      trim:     ['trimDark',     'trimMid',     'trimHi'],
      gold:     ['goldDark',     'goldMid',     'goldHi'],
      gemRed:   ['gemRedDark',   'gemRedMid',   'gemRedHi'],
      gemGreen: ['gemGreenDark', 'gemGreenMid', 'gemGreenHi'],
      gemBlue:  ['gemBlueDark',  'gemBlueMid',  'gemBlueHi'],
      stone:    ['stoneDark',    'stoneMid',    'stoneHi'],
      inner:    ['innerDark',    'innerMid',    'innerHi']
    },
    protectedParts: ['gold', 'gemRed', 'gemGreen', 'gemBlue']
  });

  // 3 套零重建模换色皮肤（每套 27 色 0 重色 0 禁用字）
  const SKINS = [
    {
      id: 'oak_gold',
      name: '橡木金箱',
      dot: '#e6b229',
      outline: '#140f0c',
      pal: {},
      fx: {
        coinA: '#e6b229',
        coinB: '#ffe566',
        gemR:  '#ff4d5a',
        gemG:  '#3bd174',
        gemB:  '#4d9eff',
        leaf:  '#6aa84f'
      }
    },
    {
      id: 'iron_silver',
      name: '铁箍银箱',
      dot: '#a8b8c8',
      outline: '#0d1117',
      pal: {
        woodDark:  '#3a3d45', woodMid:  '#5d626e', woodHi:  '#878e9e',
        postDark:  '#464440', postMid:  '#6e6a63', postHi:  '#9c968c',
        trimDark:  '#262c36', trimMid:  '#444e5e', trimHi:  '#707f94',
        goldDark:  '#7a8899', goldMid:  '#b0c0d4', goldHi:  '#e3effc',
        stoneDark: '#2f3842', stoneMid: '#4f5d6b', stoneHi: '#7b8c9c',
        innerDark: '#14171f', innerMid: '#242936', innerHi: '#394154'
      },
      fx: {
        coinA: '#b0c0d4',
        coinB: '#e3effc',
        gemR:  '#ff5468',
        gemG:  '#3ee084',
        gemB:  '#5caeff',
        leaf:  '#8cb89e'
      }
    },
    {
      id: 'bronze_mahogany',
      name: '古铜红木箱',
      dot: '#b85635',
      outline: '#170b0a',
      pal: {
        woodDark:  '#4a1818', woodMid:  '#7d2b26', woodHi:  '#b3473c',
        postDark:  '#4d2c20', postMid:  '#7d4a35', postHi:  '#b07154',
        trimDark:  '#2f574b', trimMid:  '#4e8774', trimHi:  '#82bfa8',
        goldDark:  '#995224', goldMid:  '#d97d3b', goldHi:  '#ffbe78',
        stoneDark: '#473d38', stoneMid: '#706159', stoneHi: '#9e8b80',
        innerDark: '#240c0c', innerMid: '#3d1717', innerHi: '#5c2626'
      },
      fx: {
        coinA: '#d97d3b',
        coinB: '#ffbe78',
        gemR:  '#ff5c6a',
        gemG:  '#45d98a',
        gemB:  '#59a6ff',
        leaf:  '#c97b3e'
      }
    }
  ];

  // 1. 岔路立柱与石墩底座（12×12×28）
  function buildSignPost(makeCanvas) {
    const W = 12, D = 12, H = 28;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 底部 4 块围石稳住立柱
    m.paintEllipsoid(-3.0, -2.0, 1.5, 2.3, 2.2, 1.8, mat('stone'), partId.stone, true);
    m.paintEllipsoid( 2.8,  2.2, 1.4, 2.2, 2.1, 1.6, mat('stone'), partId.stone, true);
    m.paintEllipsoid( 2.6, -2.5, 1.2, 1.8, 1.8, 1.4, mat('stone'), partId.stone, true);
    m.paintEllipsoid(-2.4,  2.6, 1.3, 1.9, 1.7, 1.5, mat('gemGreen'), partId.gemGreen, true);

    // 方木立柱（3×3，z = 0..25，顶部斜切木帽）
    m.fillAABB(-2, 2, -2, 2, 0, 26, (x, y, z, X, Y) => {
      const ax = Math.abs(X), ay = Math.abs(Y);
      if (z <= 24) {
        if (ax > 1.6 || ay > 1.6) return;
        const isBand = (z === 11 || z === 18);
        m.setRaw(x, y, z, isBand ? mat('trim') : mat('post'), isBand ? partId.trim : partId.post);
      } else if (z === 25) {
        if (ax <= 2.0 && ay <= 2.0) m.setRaw(x, y, z, mat('trim'), partId.trim);
      } else if (z === 26) {
        if (ax <= 1.2 && ay <= 1.2) m.setRaw(x, y, z, mat('gold'), partId.gold);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: H, centerZ: 14 });
  }

  // 2. 分叉木箭板（22×6×7，指向 +X 尖头，正反面均画醒目出口记号色块）
  function buildSignArrow(makeCanvas, iconMatName) {
    const W = 22, D = 6, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-10, 10, -2, 2, 0, H - 1, (x, y, z, X, Y) => {
      const ay = Math.abs(Y);
      if (ay > 1.6) return;
      // 右端（X > 4）削尖成标准路牌箭头
      if (X > 4.0) {
        const taper = (X - 4.0) / 5.5;
        const halfH = (1 - taper) * 3.1;
        if (Math.abs(z - 3.0) > halfH) return;
      }
      if (X < -9.2) return;

      // 木板两端铜铆钉条
      if (Math.abs(X + 7.5) < 0.7 && ay > 0.5) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
        return;
      }
      // 醒目出口记号色块（红/蓝/金宝石小菱形，双面可见）
      const dx = Math.abs(X - 0.5);
      const dz = Math.abs(z - 3.0);
      if (ay >= 0.8 && dx + dz <= 2.4) {
        const isCenter = (dx < 0.8 && dz < 0.8);
        m.setRaw(
          x, y, z,
          isCenter ? mat('gold') : mat(iconMatName),
          isCenter ? partId.gold : partId[iconMatName]
        );
        return;
      }
      m.setRaw(x, y, z, mat('post'), partId.post);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.5, headZ: H, centerZ: 3 });
  }

  // 3. 战利品宝箱底座（20×15×11，正面 +Y 镶亮金大锁座）
  function buildChestBase(makeCanvas) {
    const W = 20, D = 15, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-9, 9, -7, 7, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X), ay = Math.abs(Y);
      if (ax > 8.6 || ay > 6.2) return;
      // 底部四脚垫起 1 格
      if (z === 0 && ax < 6.0 && ay < 4.0) return;

      // 挖空箱体内部上方槽（z >= 5，留出 2 格厚箱壁）
      if (z >= 5 && ax < 6.4 && ay < 4.2) {
        if (z === 5) m.setRaw(x, y, z, mat('inner'), partId.inner);
        return;
      }

      // 正面（+Y）亮金大锁扣底板
      if (Y > 5.0 && ax <= 2.1 && z >= 6 && z <= 10) {
        m.setRaw(x, y, z, mat('gold'), partId.gold);
        return;
      }
      // 四角铜边护角与两条竖向铜带
      const isCorner = (ax >= 7.2 && ay >= 4.8);
      const isBand = (Math.abs(ax - 4.5) <= 0.75) || (z === 1 && (ax >= 7.8 || ay >= 5.4)) || (z === H - 1 && (ax >= 7.4 || ay >= 5.0));
      if (isCorner || isBand) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
        return;
      }
      // 两侧拉环
      if (ax > 7.8 && ay <= 1.2 && z >= 4 && z <= 6) {
        m.setRaw(x, y, z, mat('gold'), partId.gold);
        return;
      }
      m.setRaw(x, y, z, mat('wood'), partId.wood);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.5, headZ: H, centerZ: 5 });
  }

  // 4. 独立铰链圆顶箱盖（支持 'closed' / 'mid' / 'open' 三档，绕后缘铰链翻开）
  function buildChestLid(makeCanvas, pose) {
    const tiltRad = pose === 'closed' ? 0 : (pose === 'mid' ? -0.58 : -1.18);
    const W = 20, D = 15, H = pose === 'closed' ? 8 : (pose === 'mid' ? 11 : 13);
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    const ct = Math.cos(-tiltRad), st = Math.sin(-tiltRad);
    const pivotY = -5.6;
    const pivotZ = 0.8;

    m.fillAABB(-9, 9, -7, 7, 0, H - 1, (x, y, z, X, Y) => {
      // 反旋转回未掀开时的盖子局部坐标（ly, lz）
      const dy = Y - pivotY;
      const dz = z - pivotZ;
      const ly = pivotY + dy * ct - dz * st;
      const lz = pivotZ + dy * st + dz * ct;

      const ax = Math.abs(X);
      const aly = Math.abs(ly);
      if (ax > 8.6 || aly > 6.2 || lz < 0 || lz > 6.6) return;

      // 圆拱顶曲线
      const archH = 1.6 + Math.sqrt(Math.max(0, 1 - (aly / 6.4) * (aly / 6.4))) * 4.8;
      if (lz > archH) return;

      // 内腔挖空（掀开时可见深色木内壁）
      if (ax < 6.6 && aly < 4.4 && lz < archH - 1.8) {
        return;
      }
      if (ax < 7.0 && aly < 4.8 && lz < 1.2) {
        m.setRaw(x, y, z, mat('inner'), partId.inner);
        return;
      }

      // 前缘（ly > 5.0）亮金大锁舌
      if (ly > 5.0 && ax <= 1.8 && lz <= 3.0) {
        m.setRaw(x, y, z, mat('gold'), partId.gold);
        return;
      }
      // 铜边拱带与边沿镶条
      const isBand = (Math.abs(ax - 4.5) <= 0.8) || (ax >= 7.5) || (lz < 1.2 && aly >= 5.0);
      if (isBand) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
        return;
      }
      m.setRaw(x, y, z, mat('wood'), partId.wood);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.5, headZ: H, centerZ: Math.round(H * 0.5) });
  }

  // 5. 箱内堆叠金币与红绿蓝三色宝石块（16×11×7，绝不进 glowKeys）
  function buildLootPile(makeCanvas) {
    const W = 16, D = 11, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 鼓起金币堆主体
    m.paintEllipsoid(0, 0, 1.5, 6.2, 4.0, 2.9, mat('gold'), partId.gold, true);
    m.paintEllipsoid(-2.4, 0.8, 2.6, 2.5, 2.2, 1.9, mat('gold'), partId.gold, true);
    m.paintEllipsoid( 2.6, -0.6, 2.4, 2.4, 2.0, 1.8, mat('gold'), partId.gold, true);

    // 醒目红绿蓝三色大宝石块（呼应游戏三色宝石）
    m.paintEllipsoid(-3.2, -1.2, 3.8, 1.6, 1.5, 1.8, mat('gemRed'),   partId.gemRed,   true);
    m.paintEllipsoid( 0.2,  1.0, 4.4, 1.7, 1.6, 2.0, mat('gemGreen'), partId.gemGreen, true);
    m.paintEllipsoid( 3.3,  0.4, 3.9, 1.6, 1.5, 1.8, mat('gemBlue'),  partId.gemBlue,  true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.5, headZ: H, centerZ: 3 });
  }

  // 6. 旁侧小木桶（12×12×14，四重对称 symDeg: 90）
  function buildWoodBarrel(makeCanvas) {
    const W = 12, D = 12, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5, 5, -5, 5, 0, H - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      // 鼓肚桶身半径曲线
      const u = z / (H - 1);
      const bulge = 4.2 + Math.sin(u * Math.PI) * 1.15;
      if (r > bulge) return;

      // 顶盖微凹 1 格
      if (z === H - 1 && r < bulge - 1.1) return;
      // 两道宽铜/铁箍
      if ((z === 3 || z === 10) && r >= bulge - 1.2) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
        return;
      }
      if (z === H - 2 && r < bulge - 1.0) {
        m.setRaw(x, y, z, mat('post'), partId.post);
        return;
      }
      m.setRaw(x, y, z, mat('wood'), partId.wood);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: H, centerZ: 7 });
  }

  // =========================================================================
  // 资产定义：S05 岔路木牌与战利品宝箱（注册为 'scene'）
  // =========================================================================
  const SceneCratesSignDef = {
    id: 'scene_crates_sign',
    code: 'S05',
    name: '岔路木牌与战利品宝箱',
    status: 'done',
    tag: 'S05 标杆 · 岔路出口牌与战利品宝箱',
    summary: '双叉木箭指示牌（绘有醒目出口记号色块）、圆顶铜边战利品宝箱（独立铰链箱盖 + 亮金大锁扣 + 内藏金币与红绿蓝三色宝石）与小木桶成组；支持宝箱微颤待机、锁扣震开迸发财宝与路牌轻晃三态',
    defaultHabitat: 'forest',
    footRadius: 17.5,
    ecoWeight: 1.5,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '岔路双箭板木指示牌（红/蓝宝石记号色块呼应出口）',
      '圆顶铜边厚木宝箱（独立闭合/半开/全开铰链箱盖）',
      '内藏堆叠金币与红绿蓝三色宝石块（0 误进 glowKeys）',
      '旁配小木桶组景与抛物线弹跳战利品粒子',
      '橡木金箱 / 铁箍银箱 / 古铜红木箱 3 套皮肤'
    ],
    actions: [
      { id: 'idle',      name: '闭合待机（偶发藏宝微颤）', loop: true,  status: 'done' },
      { id: 'open_loot', name: '弹开宝箱（迸发金币宝石）', loop: false, duration: 2.6, status: 'done' },
      { id: 'sign_sway', name: '路牌轻晃（微风摇曳落叶）', loop: true,  status: 'done' }
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
        signPost:       buildSignPost(makeCanvas),
        signArrowUpper: buildSignArrow(makeCanvas, 'gemRed'),
        signArrowLower: buildSignArrow(makeCanvas, 'gemBlue'),
        chestBase:      buildChestBase(makeCanvas),
        chestLidClosed: buildChestLid(makeCanvas, 'closed'),
        chestLidMid:    buildChestLid(makeCanvas, 'mid'),
        chestLidOpen:   buildChestLid(makeCanvas, 'open'),
        lootPile:       buildLootPile(makeCanvas),
        woodBarrel:     buildWoodBarrel(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.2;
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
        lidStage: 'closed', // 'closed' | 'mid' | 'open'
        chestShakeX: 0,
        chestShakeY: 0,
        chestBounceZ: 0,
        lidBounceZ: 0,
        lootLiftExtra: 0,
        showLoot: false,
        upperSignYaw: 0.42,
        lowerSignYaw: -0.68,
        lootBurstDone: false,
        leafCd: 0
      };

      const instance = {
        def: SceneCratesSignDef,
        cachePrefix: `scene_crates_sign_${Math.random().toString(36).slice(2, 7)}`,
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
          state.lidStage = 'closed';
          state.chestShakeX = 0;
          state.chestShakeY = 0;
          state.chestBounceZ = 0;
          state.lidBounceZ = 0;
          state.lootLiftExtra = 0;
          state.showLoot = false;
          state.lootBurstDone = false;
          state.leafCd = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          if (action !== state.action) {
            state.action = action;
            state.lootBurstDone = false;
          }

          // 默认路牌微风轻晃幅度
          const swayAmp = (action === 'sign_sway') ? 0.16 : 0.035;
          const swaySpd = (action === 'sign_sway') ? 3.2 * freq : 1.4 * freq;
          state.upperSignYaw = 0.42 + Math.sin(time * swaySpd) * swayAmp;
          state.lowerSignYaw = -0.68 + Math.sin(time * swaySpd * 1.18 + 1.4) * swayAmp * 1.15;

          state.chestShakeX = 0;
          state.chestShakeY = 0;
          state.chestBounceZ = 0;
          state.lidBounceZ = 0;
          state.lootLiftExtra = 0;
          state.lidStage = 'closed';
          state.showLoot = false;

          if (action === 'idle') {
            // 每 3.6 秒宝箱偶发一次小幅欢快微颤，暗示里面藏着好东西
            const cyc = (time * freq) % 3.6;
            if (cyc < 0.34) {
              const p = cyc / 0.34;
              const env = Math.sin(p * Math.PI);
              state.chestShakeX = Math.sin(p * TAU * 3) * 0.55 * env * sMul;
              state.chestBounceZ = env * 0.75 * sMul;
              state.lidBounceZ = env * 0.55 * sMul;
            }
          } else if (action === 'open_loot') {
            // 2.6 秒完整开启演出：0~0.35 锁扣震动 -> 0.35~0.50 半开 -> 0.50~1.95 全开弹跳迸财宝 -> 1.95~2.20 半合 -> 2.20~2.60 落锁
            const u = clamp(actionTime / 2.6, 0, 1);
            if (u < 0.14) {
              const p = u / 0.14;
              state.chestShakeX = Math.sin(p * TAU * 4) * 0.9 * sMul;
              state.chestBounceZ = Math.sin(p * Math.PI) * 0.9 * sMul;
            } else if (u < 0.21) {
              state.lidStage = 'mid';
              state.showLoot = true;
              state.lidBounceZ = 0.7 * sMul;
            } else if (u < 0.76) {
              state.lidStage = 'open';
              state.showLoot = true;
              const openP = (u - 0.21) / 0.55;
              // 掀开瞬间箱盖微微弹跳 + 财宝鼓起
              const bounce = Math.exp(-openP * 6.0) * Math.sin(openP * 18.0);
              state.lidBounceZ = Math.max(0, bounce) * 1.4 * sMul;
              state.lootLiftExtra = (0.9 + Math.sin(openP * Math.PI) * 0.7) * sMul;

              // 迸出一大簇闪亮金币与红绿蓝宝石粒（仅触发一次，绝不设 glow: true）
              if (!state.lootBurstDone && vfx) {
                state.lootBurstDone = true;
                const [cx, cy] = localToWorldXY(state.x, state.y, state.yaw, 5.5 * sMul, 3.0 * sMul);
                const colors = [fx.coinA, fx.coinB, fx.gemR, fx.gemG, fx.gemB, fx.coinB];
                for (let i = 0; i < 24; i++) {
                  const a = (i / 24) * TAU + (Math.random() - 0.5) * 0.25;
                  const sp = (6.0 + Math.random() * 14.0) * sMul;
                  const vz = (18.0 + Math.random() * 16.0) * sMul;
                  vfx.spawnParticle(
                    cx + (Math.random() - 0.5) * 4.0 * sMul,
                    cy + (Math.random() - 0.5) * 3.0 * sMul,
                    11.5 * sMul,
                    Math.cos(a) * sp,
                    Math.sin(a) * sp,
                    vz,
                    0.85 + Math.random() * 0.45,
                    1.25 + Math.random() * 0.55,
                    colors[i % colors.length],
                    false,
                    52
                  );
                }
              }
            } else if (u < 0.85) {
              state.lidStage = 'mid';
              state.showLoot = true;
            } else {
              state.lidStage = 'closed';
              const closeP = (u - 0.85) / 0.15;
              state.chestBounceZ = Math.sin(closeP * Math.PI) * 0.45 * sMul;
            }
          } else if (action === 'sign_sway' && vfx) {
            state.leafCd -= dt;
            if (state.leafCd <= 0) {
              state.leafCd = 0.55;
              const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, -10.5 * sMul, -3.0 * sMul);
              vfx.spawnParticle(
                sx + (Math.random() - 0.5) * 8.0 * sMul,
                sy + (Math.random() - 0.5) * 6.0 * sMul,
                22.0 * sMul,
                (3.5 + Math.random() * 3.0) * sMul,
                (Math.random() - 0.5) * 2.5 * sMul,
                -4.5 * sMul,
                1.4,
                1.2,
                fx.leaf,
                false,
                2.5
              );
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          // 1. 左侧岔路木指示牌
          const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, -10.5 * sMul, -3.5 * sMul);
          // 2. 右前侧战利品宝箱
          const [cx, cy] = localToWorldXY(state.x, state.y, state.yaw, 5.5 * sMul, 3.0 * sMul);
          // 3. 后方小木桶组景
          const [bx, by] = localToWorldXY(state.x, state.y, state.yaw, 10.0 * sMul, -9.5 * sMul);

          const lidAsset = state.lidStage === 'open'
            ? parts.chestLidOpen
            : (state.lidStage === 'mid' ? parts.chestLidMid : parts.chestLidClosed);

          const list = [
            {
              partKey: 'signPost',
              asset: parts.signPost,
              x: sx,
              y: sy,
              lift: 0,
              ro: state.yaw,
              symDeg: 360,
              bias: -0.15
            },
            {
              partKey: 'signArrowLower',
              asset: parts.signArrowLower,
              x: sx,
              y: sy,
              lift: 12.5 * sMul,
              ro: state.yaw + state.lowerSignYaw,
              symDeg: 360,
              bias: 0.15
            },
            {
              partKey: 'signArrowUpper',
              asset: parts.signArrowUpper,
              x: sx,
              y: sy,
              lift: 19.5 * sMul,
              ro: state.yaw + state.upperSignYaw,
              symDeg: 360,
              bias: 0.25
            },
            {
              partKey: 'woodBarrel',
              asset: parts.woodBarrel,
              x: bx,
              y: by,
              lift: 0,
              ro: state.yaw,
              symDeg: 90,
              bias: -0.20
            },
            {
              partKey: 'chestBase',
              asset: parts.chestBase,
              x: cx + state.chestShakeX,
              y: cy + state.chestShakeY,
              lift: state.chestBounceZ,
              ro: state.yaw - 0.18,
              symDeg: 360,
              bias: 0.05
            },
            {
              partKey: 'chestLid',
              asset: lidAsset,
              x: cx + state.chestShakeX,
              y: cy + state.chestShakeY,
              lift: (9.2 + state.chestBounceZ + state.lidBounceZ) * sMul,
              ro: state.yaw - 0.18,
              symDeg: 360,
              bias: state.lidStage === 'open' ? -0.05 : 0.20
            }
          ];

          if (state.showLoot) {
            list.push({
              partKey: 'lootPile',
              asset: parts.lootPile,
              x: cx + state.chestShakeX,
              y: cy + state.chestShakeY,
              lift: (6.2 + state.chestBounceZ + state.lootLiftExtra) * sMul,
              ro: state.yaw - 0.18,
              symDeg: 360,
              bias: 0.12
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: SceneCratesSignDef.id,
            code: SceneCratesSignDef.code,
            name: SceneCratesSignDef.name,
            status: SceneCratesSignDef.status,
            skin: curSkin.id,
            action: state.action,
            lidStage: state.lidStage,
            footRadius: SceneCratesSignDef.footRadius,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Assets.register(SceneCratesSignDef, 'scene');
})(window.PixelWorkshop);
