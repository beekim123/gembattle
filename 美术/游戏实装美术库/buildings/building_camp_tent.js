'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // B02 标杆 · 野外商贩布艺帐篷（buildings/building_camp_tent.js）
  // -------------------------------------------------------------------------
  // 拆件（全部 <= 36×30×22，顶篷严守 <= 36×36×24 红线，左右侧帘与货箱复用同一资产）：
  //   1. woodFrame    (34×26×22, symDeg: 360) : 木桩斜支架、屋脊横梁与地钉绳桩
  //   2. canopyRoof   (36×30×17, symDeg: 360) : 柔和弧面撞色条纹帆布顶篷 + 波浪檐边 + 顶铜铃
  //   3. sideCurtain  (7×20×16,  symDeg: 360) : 侧垂布帘（左右复用 1 套资产，微风水平轻摆）
  //   4. goodsCounter (28×12×13, symDeg: 360) : 帐前木货摊（摆红绿蓝药瓶、卷轴与小剑）
  //   5. supplyCrate  (11×11×10, symDeg: 90)  : 储物木箱（左右复用 2 只）
  // 严禁常态 scaleX/scaleY 拉伸；布料与金属绝不进 glowKeys（glowKeys: []）；27 色 0 重色 0 禁用字
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 帆布主条纹色（默认赤红，3 档高对比）
      clothADark:    '#821d24',
      clothAMid:     '#c93238',
      clothAHi:      '#f2665e',
      // 帆布副条纹色（默认暖米白，3 档）
      clothBDark:    '#ada28d',
      clothBMid:     '#dfd6c3',
      clothBHi:      '#faf5e8',
      // 木桩支架与木货摊箱（3 档）
      woodDark:      '#4f2f1b',
      woodMid:       '#825130',
      woodHi:        '#b5794d',
      // 黄铜顶铃、剑柄与箱钉（3 档，不进 glowKeys）
      brassDark:     '#8f6014',
      brassMid:      '#d4982a',
      brassHi:       '#ffda66',
      // 货摊精钢小剑刃（3 档，不进 glowKeys）
      bladeDark:     '#576575',
      bladeMid:      '#8fa1b5',
      bladeHi:       '#d2e2f2',
      // 红药瓶（3 档）
      potionRedDark: '#8f172b',
      potionRedMid:  '#de2844',
      potionRedHi:   '#ff758a',
      // 绿药瓶（3 档）
      potionGrnDark: '#166e40',
      potionGrnMid:  '#26b566',
      potionGrnHi:   '#70eb9e',
      // 蓝药瓶（3 档）
      potionBluDark: '#19498f',
      potionBluMid:  '#2c7be0',
      potionBluHi:   '#78beff',
      // 羊皮卷轴与地绳（3 档）
      scrollDark:    '#9c7d4b',
      scrollMid:     '#d4b47a',
      scrollHi:      '#f5dfb0'
    },
    glowKeys: [],
    parts: [
      'clothA', 'clothB', 'wood', 'brass', 'blade',
      'potionRed', 'potionGrn', 'potionBlu', 'scroll'
    ],
    noCrease: [
      ['clothA', 'clothB'],
      ['wood', 'brass'],
      ['wood', 'scroll'],
      ['blade', 'brass']
    ],
    materials: {
      clothA:    ['clothADark',    'clothAMid',    'clothAHi'],
      clothB:    ['clothBDark',    'clothBMid',    'clothBHi'],
      wood:      ['woodDark',      'woodMid',      'woodHi'],
      brass:     ['brassDark',     'brassMid',     'brassHi'],
      blade:     ['bladeDark',     'bladeMid',     'bladeHi'],
      potionRed: ['potionRedDark', 'potionRedMid', 'potionRedHi'],
      potionGrn: ['potionGrnDark', 'potionGrnMid', 'potionGrnHi'],
      potionBlu: ['potionBluDark', 'potionBluMid', 'potionBluHi'],
      scroll:    ['scrollDark',    'scrollMid',    'scrollHi']
    },
    protectedParts: ['brass', 'blade', 'potionRed', 'potionGrn', 'potionBlu']
  });

  // 3 套零重建模换色皮肤（每套 27 色 0 重色 0 禁用字）
  const SKINS = [
    {
      id: 'crimson_stripe',
      name: '赤白条纹',
      dot: '#c93238',
      outline: '#170f0e',
      pal: {},
      fx: {
        coinA: '#e0a628',
        coinB: '#ffe26e',
        dust:  '#c7b599'
      }
    },
    {
      id: 'indigo_stripe',
      name: '靛青条纹',
      dot: '#2864a8',
      outline: '#0d141f',
      pal: {
        clothADark: '#183b6e', clothAMid: '#2864a8', clothAHi: '#579be0',
        clothBDark: '#9ea8b0', clothBMid: '#d4dee6', clothBHi: '#f5faff',
        woodDark:   '#403024', woodMid:   '#6b513d', woodHi:   '#99775c'
      },
      fx: {
        coinA: '#d9a834',
        coinB: '#ffea80',
        dust:  '#b0bcc7'
      }
    },
    {
      id: 'ochre_desert',
      name: '赭黄荒漠篷',
      dot: '#cf7c29',
      outline: '#1a110a',
      pal: {
        clothADark: '#854614', clothAMid: '#cf7c29', clothAHi: '#f7b259',
        clothBDark: '#a68d68', clothBMid: '#d9be94', clothBHi: '#f7e5c6',
        woodDark:   '#59341a', woodMid:   '#8c552b', woodHi:   '#bf7d47'
      },
      fx: {
        coinA: '#ebad2f',
        coinB: '#ffea75',
        dust:  '#d9be91'
      }
    }
  ];

  // 1. 木桩斜支架与屋脊横梁（34×26×22）
  function buildWoodFrame(makeCanvas) {
    const W = 34, D = 26, H = 22;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 4 根略微内收的角木桩（底部外扩抓地，顶部承托篷檐）
    const corners = [
      [-13.5, -9.5, -12.2, -8.5],
      [ 13.5, -9.5,  12.2, -8.5],
      [-13.5,  9.5, -12.2,  8.5],
      [ 13.5,  9.5,  12.2,  8.5]
    ];
    for (const [bx, by, tx, ty] of corners) {
      m.paintCapsule(bx, by, 0.5, tx, ty, 15.5, 1.35, 1.15, mat('wood'), partId.wood, true);
      // 角落外侧小地桩与拉绳
      const sx = bx > 0 ? bx + 2.2 : bx - 2.2;
      const sy = by > 0 ? by + 1.8 : by - 1.8;
      m.paintCapsule(sx, sy, 0.4, sx, sy, 2.8, 0.9, 0.75, mat('wood'), partId.wood, true);
      m.paintCapsule(sx, sy, 2.2, tx, ty, 14.5, 0.55, 0.55, mat('scroll'), partId.scroll, false);
    }

    // 顶部前后檐横梁与左右侧横梁
    m.paintCapsule(-12.5,  8.5, 15.0, 12.5,  8.5, 15.0, 1.05, 1.05, mat('wood'), partId.wood, true);
    m.paintCapsule(-12.5, -8.5, 15.0, 12.5, -8.5, 15.0, 1.05, 1.05, mat('wood'), partId.wood, true);
    m.paintCapsule(-12.2, -8.5, 15.0, -12.2, 8.5, 15.0, 1.0,  1.0,  mat('wood'), partId.wood, true);
    m.paintCapsule( 12.2, -8.5, 15.0,  12.2, 8.5, 15.0, 1.0,  1.0,  mat('wood'), partId.wood, true);

    // 两侧人字斜梁支撑屋脊
    m.paintCapsule(-12.2, -8.5, 15.0, -10.5, 0, 20.5, 1.0, 0.95, mat('wood'), partId.wood, true);
    m.paintCapsule(-12.2,  8.5, 15.0, -10.5, 0, 20.5, 1.0, 0.95, mat('wood'), partId.wood, true);
    m.paintCapsule( 12.2, -8.5, 15.0,  10.5, 0, 20.5, 1.0, 0.95, mat('wood'), partId.wood, true);
    m.paintCapsule( 12.2,  8.5, 15.0,  10.5, 0, 20.5, 1.0, 0.95, mat('wood'), partId.wood, true);
    // 屋脊主梁
    m.paintCapsule(-12.5, 0, 20.5, 12.5, 0, 20.5, 1.1, 1.1, mat('wood'), partId.wood, true);

    // 后墙半高木挡板（让帐篷有清晰前后进深，正面 +Y 敞开迎客）
    m.fillAABB(-12, 12, -10, -8, 0, 9, (x, y, z, X, Y) => {
      if (Math.abs(X) > 11.5 || Y < -9.3 || Y > -8.1) return;
      const isBand = (z === 2 || z === 8);
      m.setRaw(x, y, z, isBand ? mat('brass') : mat('clothA'), isBand ? partId.brass : partId.clothA);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 16.5, headZ: H, centerZ: 10 });
  }

  // 2. 柔和弧面撞色条纹帆布顶篷（36×30×17，严守 <= 36×36×24 红线）
  function buildCanopyRoof(makeCanvas) {
    const W = 36, D = 30, H = 17;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-17, 17, -14, 14, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X), ay = Math.abs(Y);
      if (ax > 16.6 || ay > 13.6) return;

      // 柔和下垂曲面帐篷顶：屋脊沿 X 轴（Y=0 最高 z≈13.5），向前后檐（|Y|=13）柔和微凹弧落至 z≈4.2
      const uY = clamp(ay / 13.5, 0, 1);
      const uX = clamp(ax / 16.5, 0, 1);
      // 略带自然帆布垂弧感（sag）与两端收坡
      const ridgeH = 13.6 - uX * uX * 1.4;
      const eaveH = 4.0;
      const arch = Math.pow(1 - uY, 1.32);
      const surfZ = eaveH + (ridgeH - eaveH) * arch;

      // 四周波浪锯齿垂檐（z = 1..4，俯视极抢眼）
      const isRim = (ay >= 12.2 && ax <= 16.2) || (ax >= 15.2 && ay <= 13.2);
      if (isRim) {
        const wave = Math.sin((ay >= 12.2 ? X : Y) * 0.95) * 1.1;
        const skirtBot = 1.6 + wave;
        if (z >= skirtBot && z <= surfZ + 0.6) {
          const stripe = (Math.floor((X + 18) / 4) % 2 === 0);
          const isTrim = (z < skirtBot + 1.1);
          m.setRaw(
            x, y, z,
            isTrim ? mat('brass') : (stripe ? mat('clothA') : mat('clothB')),
            isTrim ? partId.brass : (stripe ? partId.clothA : partId.clothB)
          );
        }
        return;
      }

      // 顶面帆布壳（厚 2.1 格防止俯视漏缝）
      if (z <= surfZ && z >= surfZ - 2.1) {
        // 宽 4 格高对比撞色条纹（沿 X 方向交替）
        const stripe = (Math.floor((X + 18) / 4) % 2 === 0);
        // 屋脊中线滚边
        const isRidgeTrim = (ay <= 0.9 && z >= surfZ - 1.1);
        if (isRidgeTrim) {
          m.setRaw(x, y, z, mat('brass'), partId.brass);
        } else {
          m.setRaw(x, y, z, stripe ? mat('clothA') : mat('clothB'), stripe ? partId.clothA : partId.clothB);
        }
      }
    });

    // 屋脊两端黄铜招客顶饰铃铛（z = 13..16）
    m.paintEllipsoid(-11.5, 0, 14.5, 1.5, 1.5, 1.8, mat('brass'), partId.brass, true);
    m.paintEllipsoid( 11.5, 0, 14.5, 1.5, 1.5, 1.8, mat('brass'), partId.brass, true);
    m.paintEllipsoid(0, 0, 14.8, 1.9, 1.9, 1.8, mat('brass'), partId.brass, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 17.5, headZ: H, centerZ: 8 });
  }

  // 3. 侧垂布帘（7×20×16，左右复用同一套资产）
  function buildSideCurtain(makeCanvas) {
    const W = 7, D = 20, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-3, 3, -9, 9, 0, H - 1, (x, y, z, X, Y) => {
      if (Math.abs(Y) > 8.6) return;
      // 垂布自然褶皱波浪（沿 Y 方向起伏，底部微扬）
      const uZ = z / (H - 1);
      const foldX = Math.sin(Y * 0.85) * 0.85 + (1 - uZ) * 0.8;
      if (Math.abs(X - foldX) > 1.15) return;

      const stripe = (Math.floor((Y + 10) / 4) % 2 === 0);
      const isHem = (z <= 1 || z >= H - 2);
      if (isHem) {
        m.setRaw(x, y, z, mat('brass'), partId.brass);
      } else {
        m.setRaw(x, y, z, stripe ? mat('clothA') : mat('clothB'), stripe ? partId.clothA : partId.clothB);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.5, headZ: H, centerZ: 8 });
  }

  // 4. 帐前木货摊（28×12×13，桌面摆红绿蓝药瓶、羊皮卷轴与小剑）
  function buildGoodsCounter(makeCanvas) {
    const W = 28, D = 12, H = 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 货摊木柜与厚实桌面（z = 0..7）
    m.fillAABB(-13, 13, -5, 5, 0, 7, (x, y, z, X, Y) => {
      const ax = Math.abs(X), ay = Math.abs(Y);
      if (z <= 5) {
        if (ax > 11.8 || ay > 4.2) return;
        // 正面（+Y）挂一条彩色条纹桌旗
        if (Y > 3.2 && ax <= 5.5 && z >= 2) {
          const isStripe = (Math.floor(ax / 2) % 2 === 0);
          m.setRaw(x, y, z, isStripe ? mat('clothA') : mat('clothB'), isStripe ? partId.clothA : partId.clothB);
          return;
        }
        // 四角粗桌腿与铜角包边
        const isCorner = (ax >= 10.2 && ay >= 2.8);
        m.setRaw(x, y, z, isCorner ? mat('brass') : mat('wood'), isCorner ? partId.brass : partId.wood);
      } else {
        // 宽厚台面（z = 6..7）
        if (ax > 12.8 || ay > 4.8) return;
        const isRunner = (ax <= 5.2 && z === 7);
        m.setRaw(x, y, z, isRunner ? mat('clothB') : mat('wood'), isRunner ? partId.clothB : partId.wood);
      }
    });

    // 货品 1（左侧）：红、绿、蓝三色圆肚药瓶（呼应游戏三色宝石！）
    const bottles = [
      { bx: -9.5, by:  1.2, matName: 'potionRed' },
      { bx: -6.5, by: -0.8, matName: 'potionGrn' },
      { bx: -3.8, by:  1.4, matName: 'potionBlu' }
    ];
    for (const b of bottles) {
      m.paintEllipsoid(b.bx, b.by, 9.2, 1.5, 1.5, 1.7, mat(b.matName), partId[b.matName], true);
      // 瓶颈与木塞
      m.paintCapsule(b.bx, b.by, 10.6, b.bx, b.by, 11.8, 0.75, 0.65, mat('scroll'), partId.scroll, true);
    }

    // 货品 2（中右）：两卷捆扎羊皮卷轴
    m.paintCapsule(0.8, -1.8, 8.7, 4.8, 1.6, 8.7, 1.15, 1.15, mat('scroll'), partId.scroll, true);
    m.paintCapsule(2.6, -2.4, 8.7, 6.2, 1.0, 8.7, 1.05, 1.05, mat('scroll'), partId.scroll, true);
    // 卷轴红丝带
    m.paintEllipsoid(2.8, -0.1, 8.9, 0.8, 0.8, 1.2, mat('clothA'), partId.clothA, true);

    // 货品 3（最右）：陈列亮钢小短剑 + 黄铜十字护手
    m.paintCapsule(7.5, -2.2, 8.8, 11.6, 2.2, 9.2, 0.85, 0.55, mat('blade'), partId.blade, true);
    m.paintCapsule(7.2, -0.4, 8.8, 9.4, -2.6, 8.8, 0.75, 0.75, mat('brass'), partId.brass, true);
    m.paintCapsule(6.5, -3.0, 8.8, 7.6, -1.9, 8.8, 0.75, 0.75, mat('wood'),  partId.wood,  true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 13.0, headZ: H, centerZ: 6 });
  }

  // 5. 储物木箱（11×11×10，四重对称 symDeg: 90，复用 2 只）
  function buildSupplyCrate(makeCanvas) {
    const W = 11, D = 11, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5, 5, -5, 5, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(Math.round(X));
      const ay = Math.abs(Math.round(Y));
      const maxA = Math.max(ax, ay);
      if (maxA > 4) return;

      const isFrame = (maxA === 4 && (z <= 1 || z >= H - 2)) || (ax === 4 && ay === 4);
      const isCornerStud = (ax >= 3 && ay >= 3 && (z === 1 || z === H - 2));
      const isLidSeam = (z === H - 1 && maxA <= 3 && (ax === 0 || ay === 0));
      if (isCornerStud) {
        m.setRaw(x, y, z, mat('brass'), partId.brass);
      } else if (isFrame) {
        m.setRaw(x, y, z, mat('wood'), partId.wood);
      } else if (isLidSeam) {
        m.setRaw(x, y, z, mat('scroll'), partId.scroll);
      } else {
        m.setRaw(x, y, z, mat('wood'), partId.wood);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: H, centerZ: 5 });
  }

  // =========================================================================
  // 资产定义：B02 野外商贩布艺帐篷（注册为 'building'）
  // =========================================================================
  const BuildingCampTentDef = {
    id: 'building_camp_tent',
    code: 'B02',
    name: '野外商贩布艺帐篷',
    status: 'done',
    tag: 'B02 标杆 · 野外商贩与营地摊位',
    summary: '分块拆件木桩支架、柔和弧面高对比条纹帆布顶篷（36×30×17 严守上限）、左右复用微风侧帘、摆满红绿蓝药瓶/卷轴/小剑的木货摊与两只储物木箱；支持待机轻摇与开市招客动效及 3 套换色皮肤',
    defaultHabitat: 'forest',
    footRadius: 21.5,
    ecoWeight: 2.0,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '木桩斜支架与屋脊横梁（单块 <=34×26×22）',
      '柔和弧面撞色条纹帆布顶篷与波浪檐边（<=36×30×17）',
      '左右复用侧垂布帘随微风轻摇与开市掀起',
      '帐前木货摊陈列红绿蓝药瓶、卷轴与精钢小剑 + 2 只储物箱',
      '赤白条纹 / 靛青条纹 / 赭黄荒漠篷 3 套换色皮肤'
    ],
    actions: [
      { id: 'idle',      name: '布帘轻摇（摊位待客）', loop: true,  status: 'done' },
      { id: 'open_shop', name: '开市招客（掀帘+暖金粒）', loop: false, duration: 2.4, status: 'done' }
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
        woodFrame:    buildWoodFrame(makeCanvas),
        canopyRoof:   buildCanopyRoof(makeCanvas),
        sideCurtain:  buildSideCurtain(makeCanvas),
        goodsCounter: buildGoodsCounter(makeCanvas),
        supplyCrate:  buildSupplyCrate(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.22;
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
        roofLift: 11.2,
        roofJitterYaw: 0,
        leftCurtainOut: 0,
        rightCurtainOut: 0,
        leftCurtainLift: 1.2,
        rightCurtainLift: 1.2,
        leftCurtainYaw: 0,
        rightCurtainYaw: 0,
        coinBurstDone: false
      };

      const instance = {
        def: BuildingCampTentDef,
        cachePrefix: `building_camp_tent_${Math.random().toString(36).slice(2, 7)}`,
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
          state.roofLift = 11.2;
          state.roofJitterYaw = 0;
          state.leftCurtainOut = 0;
          state.rightCurtainOut = 0;
          state.leftCurtainLift = 1.2;
          state.rightCurtainLift = 1.2;
          state.coinBurstDone = false;
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
            state.coinBurstDone = false;
          }

          const t = time * freq;
          // 常态微风水平轻摆（严禁使用 scaleX/scaleY）
          const breezeL = Math.sin(t * 2.3) * 0.65;
          const breezeR = Math.sin(t * 2.3 + 1.1) * 0.65;

          state.roofLift = 11.2 * sMul;
          state.roofJitterYaw = 0;
          state.leftCurtainOut = breezeL * sMul;
          state.rightCurtainOut = breezeR * sMul;
          state.leftCurtainLift = (1.2 + Math.abs(breezeL) * 0.35) * sMul;
          state.rightCurtainLift = (1.2 + Math.abs(breezeR) * 0.35) * sMul;
          state.leftCurtainYaw = breezeL * 0.08;
          state.rightCurtainYaw = -breezeR * 0.08;

          if (action === 'open_shop') {
            const u = clamp(actionTime / 2.4, 0, 1);
            // 前 0.35s 响铃般棚顶轻抖，随后双侧布帘向外掀起迎客，尾段柔和回落
            const bellShake = u < 0.32 ? Math.sin(u * TAU * 8) * (1 - u / 0.32) : 0;
            const openEnv = smoothstep(0.08, 0.30, u) * (1 - smoothstep(0.72, 1.0, u));

            state.roofLift = (11.2 + Math.abs(bellShake) * 0.9 + openEnv * 0.55) * sMul;
            state.roofJitterYaw = bellShake * 0.045;

            state.leftCurtainOut  = (-2.6 * openEnv + breezeL * 0.5) * sMul;
            state.rightCurtainOut = ( 2.6 * openEnv + breezeR * 0.5) * sMul;
            state.leftCurtainLift  = (1.2 + openEnv * 2.4) * sMul;
            state.rightCurtainLift = (1.2 + openEnv * 2.4) * sMul;
            state.leftCurtainYaw   = -openEnv * 0.24;
            state.rightCurtainYaw  =  openEnv * 0.24;

            // 摊前飘出几枚交易暖金小粒（非自亮 glow: false）
            if (!state.coinBurstDone && u >= 0.22 && vfx) {
              state.coinBurstDone = true;
              const [gx, gy] = localToWorldXY(state.x, state.y, state.yaw, 0, 14.5 * sMul);
              for (let i = 0; i < 12; i++) {
                const spreadX = (i - 5.5) * 1.8 * sMul;
                const [px, py] = localToWorldXY(gx, gy, state.yaw, spreadX, (Math.random() - 0.5) * 3.0 * sMul);
                vfx.spawnParticle(
                  px, py, 10.5 * sMul,
                  (Math.random() - 0.5) * 4.5 * sMul,
                  (Math.random() - 0.5) * 4.5 * sMul,
                  (10.0 + Math.random() * 8.0) * sMul,
                  0.85 + Math.random() * 0.35,
                  1.25 + Math.random() * 0.4,
                  (i % 2 === 0) ? fx.coinA : fx.coinB,
                  false,
                  16
                );
              }
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          // 帐篷主体略靠后（ly = -2.5），货摊摆在帐前（ly = +13.5），两只储物木箱置两侧
          const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw, 0, -2.5 * sMul);
          const [lcx, lcy] = localToWorldXY(tx, ty, state.yaw, -13.2 * sMul + state.leftCurtainOut, 0);
          const [rcx, rcy] = localToWorldXY(tx, ty, state.yaw,  13.2 * sMul + state.rightCurtainOut, 0);
          const [gx, gy] = localToWorldXY(state.x, state.y, state.yaw, 0, 12.8 * sMul);
          const [c1x, c1y] = localToWorldXY(state.x, state.y, state.yaw, -17.5 * sMul, 6.5 * sMul);
          const [c2x, c2y] = localToWorldXY(state.x, state.y, state.yaw,  17.5 * sMul, 4.5 * sMul);

          return [
            {
              partKey: 'woodFrame',
              asset: parts.woodFrame,
              x: tx,
              y: ty,
              lift: 0,
              ro: state.yaw,
              symDeg: 360,
              bias: -0.20
            },
            {
              partKey: 'sideCurtainL',
              asset: parts.sideCurtain,
              x: lcx,
              y: lcy,
              lift: state.leftCurtainLift,
              ro: state.yaw + state.leftCurtainYaw,
              symDeg: 360,
              bias: 0.05
            },
            {
              partKey: 'sideCurtainR',
              asset: parts.sideCurtain,
              x: rcx,
              y: rcy,
              lift: state.rightCurtainLift,
              ro: state.yaw + Math.PI + state.rightCurtainYaw,
              symDeg: 360,
              bias: 0.05
            },
            {
              partKey: 'canopyRoof',
              asset: parts.canopyRoof,
              x: tx,
              y: ty,
              lift: state.roofLift,
              ro: state.yaw + state.roofJitterYaw,
              symDeg: 360,
              bias: 0.35
            },
            {
              partKey: 'goodsCounter',
              asset: parts.goodsCounter,
              x: gx,
              y: gy,
              lift: 0,
              ro: state.yaw,
              symDeg: 360,
              bias: 0.25
            },
            {
              partKey: 'supplyCrateL',
              asset: parts.supplyCrate,
              x: c1x,
              y: c1y,
              lift: 0,
              ro: state.yaw + 0.14,
              symDeg: 90,
              bias: 0.15
            },
            {
              partKey: 'supplyCrateR',
              asset: parts.supplyCrate,
              x: c2x,
              y: c2y,
              lift: 0,
              ro: state.yaw - 0.18,
              symDeg: 90,
              bias: 0.15
            }
          ];
        },

        exportManifest(params) {
          return {
            id: BuildingCampTentDef.id,
            code: BuildingCampTentDef.code,
            name: BuildingCampTentDef.name,
            status: BuildingCampTentDef.status,
            skin: curSkin.id,
            action: state.action,
            footRadius: BuildingCampTentDef.footRadius,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Assets.register(BuildingCampTentDef, 'building');
})(window.PixelWorkshop);
