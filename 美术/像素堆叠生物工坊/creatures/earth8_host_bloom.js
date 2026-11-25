'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, localToWorldXY, expSmooth, wrapAngle, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SpringDamper3D, SocketTracker } = PW.Solvers;
  const { EnvFeedback, MountSystem, notifyHostDisturb } = PW.Behaviors;

  // =========================================================================
  // 地8 · 长在别人身上的花（M36 挂在别的生物身上标杆，+Y 正前，z=0 贴地）
  //   1. 体型小巧（核心生长资产体素盒 16~22 格），预烘 4 档共享生长姿态：
  //      stageSeed（钩籽落芽）-> stageBud（鼓花苞）-> stageBloom（盛开大花）-> stageDisperse（结籽抖落），
  //      另配白色细根须底盘（rootPad）、独立倒钩种子小球（seedBurr）与独台林地苔木桩（stump）；
  //   2. 双态运行：
  //      - 多怪同台：自动调用 MountSystem 搜寻大型宿主（优先 地1、地4、沙4），
  //        钩籽抛物线弹跳挂上背心，强正 bias（+1.85）防穿模，随宿主走完
  //        「弹跳附着 -> 发芽 -> 鼓苞 -> 盛开摇曳 -> 抖落钩籽 -> 掉落枯萎 -> 换下一只宿主」闭环，
  //        盛开与扎根期间定时向宿主发 notifyHostDisturb 触发微晃/蹭树信号；
  //      - 独台预览：自动在原地附带极简林地苔木桩载体演示完整 4 档生长、随风晃动与散籽弹跳；
  //   3. 严格守规：27 色 0 重色 0 自亮糊边、4 套换色皮肤、严禁常态 scaleX/scaleY 拉伸。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 白色细根须（3 档）
      rootDark:    '#8c8578',
      rootMid:     '#ccc5b6',
      rootHi:      '#f5f0e4',
      // 短茎与萼叶（3 档）
      stemDark:    '#214724',
      stemMid:     '#3b7a3d',
      stemHi:      '#6eb562',
      // 外瓣大花（3 档，默认呼应 地1 赤毛配色）
      petalDark:   '#781d1b',
      petalMid:    '#c93a30',
      petalHi:     '#f2745c',
      // 内瓣花心环（3 档）
      innerDark:   '#a84125',
      innerMid:    '#e67845',
      innerHi:     '#ffb573',
      // 花蕊与花粉（3 档）
      pollenDark:  '#995e14',
      pollenMid:   '#de9f24',
      pollenHi:    '#ffe066',
      // 倒钩种子壳（3 档）
      seedDark:    '#4a3423',
      seedMid:     '#805e3f',
      seedHi:      '#bd9566',
      // 浅色倒钩尖刺（3 档）
      barbDark:    '#7a6d5a',
      barbMid:     '#b5a388',
      barbHi:      '#e8dcc6',
      // 独台林地木桩（3 档）
      woodDark:    '#302219',
      woodMid:     '#573e2e',
      woodHi:      '#856248',
      // 木桩覆苔（3 档）
      mossDark:    '#1c3b1f',
      mossMid:     '#346635',
      mossHi:      '#5e9950'
    },
    glowKeys: [],
    parts: [
      'root', 'stem', 'leaf', 'petal', 'inner', 'pollen', 'seed', 'barb', 'wood', 'moss'
    ],
    noCrease: [
      ['stem', 'leaf'], ['petal', 'inner'], ['inner', 'pollen'],
      ['seed', 'barb'], ['wood', 'moss']
    ],
    materials: {
      root:   ['rootDark',   'rootMid',   'rootHi'],
      stem:   ['stemDark',   'stemMid',   'stemHi'],
      petal:  ['petalDark',  'petalMid',  'petalHi'],
      inner:  ['innerDark',  'innerMid',  'innerHi'],
      pollen: ['pollenDark', 'pollenMid', 'pollenHi'],
      seed:   ['seedDark',   'seedMid',   'seedHi'],
      barb:   ['barbDark',   'barbMid',   'barbHi'],
      wood:   ['woodDark',   'woodMid',   'woodHi'],
      moss:   ['mossDark',   'mossMid',   'mossHi']
    },
    protectedParts: ['barb', 'pollen']
  });

  const SKINS = [
    {
      id: 'crimson_fur',
      name: '赤毛花',
      dot: '#cf3e32',
      outline: '#170c0b',
      pal: {},
      fx: { pollen: '#ffe066', petal: '#f2745c', seed: '#bd9566' }
    },
    {
      id: 'meadow_pink',
      name: '草甸粉黄',
      dot: '#eb6e9c',
      outline: '#1a0c14',
      pal: {
        stemDark:   '#28542a', stemMid:  '#488f46', stemHi:  '#82cc72',
        petalDark:  '#992f59', petalMid: '#e0588d', petalHi: '#ff9ec2',
        innerDark:  '#b8781f', innerMid: '#f0b33e', innerHi: '#ffea8a',
        pollenDark: '#b34b19', pollenMid:'#f2832c', pollenHi:'#ffd269'
      },
      fx: { pollen: '#ffea8a', petal: '#ff9ec2', seed: '#c4a16c' }
    },
    {
      id: 'moss_white',
      name: '苔绿白花',
      dot: '#e6f0e1',
      outline: '#0d1710',
      pal: {
        stemDark:   '#1a3d24', stemMid:  '#2e6e40', stemHi:  '#5aa66c',
        petalDark:  '#8a9c8e', petalMid: '#cddbd0', petalHi: '#f4faf2',
        innerDark:  '#698c6e', innerMid: '#a5ccaa', innerHi: '#dff5df',
        pollenDark: '#9e6c1c', pollenMid:'#dba235', pollenHi:'#ffe47a'
      },
      fx: { pollen: '#ffe47a', petal: '#f4faf2', seed: '#a69878' }
    },
    {
      id: 'sunset_plum',
      name: '晚霞橙紫',
      dot: '#b84da8',
      outline: '#170b1a',
      pal: {
        stemDark:   '#2f4222', stemMid:  '#526e37', stemHi:  '#85a358',
        petalDark:  '#591f5c', petalMid: '#9c3a94', petalHi: '#d973cc',
        innerDark:  '#a83d19', innerMid: '#eb6b2d', innerHi: '#ffad5c',
        pollenDark: '#a67014', pollenMid:'#e8ae27', pollenHi:'#fff078'
      },
      fx: { pollen: '#fff078', petal: '#ffad5c', seed: '#9e7254' }
    }
  ];

  // =========================================================================
  // 体素建模工具：白根须垫 + 4 档生长姿态 + 倒钩种子小球 + 独台林地苔木桩
  // =========================================================================

  // 0. 贴附白色细根须底盘（16×16×6）：牢牢抓在宿主背毛或木桩顶面
  function buildRootPad(makeCanvas) {
    const m = new VoxelModel(16, 16, 6, SPEC);
    const { mat, partId } = SPEC;

    // 中心缠结白根团
    m.paintEllipsoid(0, 0, 2.0, 3.6, 3.6, 1.5, mat('root'), partId.root, true);

    // 7 条向外放射并微微下弯抓附的白色细根须
    const rays = 7;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * TAU + 0.25;
      const len = (i & 1) ? 6.1 : 5.2;
      const mx = Math.cos(a) * len * 0.55;
      const my = Math.sin(a) * len * 0.55;
      const ex = Math.cos(a) * len;
      const ey = Math.sin(a) * len;
      m.paintCapsule(0, 0, 2.2, mx, my, 1.8, 1.05, 0.88, mat('root'), partId.root, true);
      m.paintCapsule(mx, my, 1.8, ex, ey, 0.85, 0.85, 0.55, mat('root'), partId.root, true);
    }

    // 中心短茎基座
    m.paintCapsule(0, 0, 2.2, 0, 0, 4.6, 1.7, 1.45, mat('stem'), partId.stem, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.8, headZ: 6, centerZ: 3 });
  }

  // 1. 生长第 1 档：stageSeed（16×16×14，钩籽刚落芽）
  function buildStageSeed(makeCanvas) {
    const m = new VoxelModel(16, 16, 14, SPEC);
    const { mat, partId } = SPEC;

    // 底部细密白根须刚扎下
    m.paintEllipsoid(0, 0, 1.4, 3.2, 3.2, 1.2, mat('root'), partId.root, true);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.4;
      m.paintCapsule(0, 0, 1.5, Math.cos(a) * 4.8, Math.sin(a) * 4.8, 0.8, 0.85, 0.52, mat('root'), partId.root, true);
    }

    // 主倒钩种子球 + 2 颗伴生小籽
    m.paintEllipsoid(0, 0, 4.2, 2.9, 2.9, 2.7, mat('seed'), partId.seed, true);
    m.paintEllipsoid(-2.8, 1.6, 3.0, 1.8, 1.8, 1.7, mat('seed'), partId.seed, true);
    m.paintEllipsoid(2.6, -1.8, 2.8, 1.7, 1.7, 1.6, mat('seed'), partId.seed, true);

    // 种子表面外翘的浅色倒钩尖刺
    const hookAngles = [0.2, 1.15, 2.1, 3.1, 4.2, 5.25];
    for (let i = 0; i < hookAngles.length; i++) {
      const a = hookAngles[i];
      const z0 = (i & 1) ? 4.8 : 3.6;
      m.paintCapsule(
        Math.cos(a) * 2.2, Math.sin(a) * 2.2, z0,
        Math.cos(a) * 4.2, Math.sin(a) * 4.2, z0 + 0.9,
        0.72, 0.48, mat('barb'), partId.barb, true
      );
    }

    // 籽缝里顶出的嫩绿双叶小芽
    m.paintCapsule(0, 0, 5.8, 0.3, 0.2, 9.4, 1.05, 0.82, mat('stem'), partId.stem, true);
    m.paintEllipsoid(-1.5, 0.6, 10.2, 1.6, 1.1, 1.2, mat('stem'), partId.leaf, true);
    m.paintEllipsoid( 1.7, -0.4, 10.6, 1.5, 1.1, 1.2, mat('stem'), partId.leaf, true);
    // 芽心露出一丁点花苞红尖
    m.paintEllipsoid(0.2, 0.1, 11.4, 1.05, 1.05, 1.1, mat('petal'), partId.petal, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 13, centerZ: 6 });
  }

  // 2. 生长第 2 档：stageBud（18×18×17，鼓花苞）
  function buildStageBud(makeCanvas) {
    const m = new VoxelModel(18, 18, 17, SPEC);
    const { mat, partId } = SPEC;

    // 底部白根簇
    m.paintEllipsoid(0, 0, 1.4, 3.6, 3.6, 1.2, mat('root'), partId.root, true);

    // 短粗绿茎 + 4 片外展圆阔叶
    m.paintCapsule(0, 0, 1.6, 0, 0, 7.6, 2.1, 1.7, mat('stem'), partId.stem, true);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.35;
      const lx = Math.cos(a) * 4.6, ly = Math.sin(a) * 4.6;
      m.paintCapsule(Math.cos(a) * 1.4, Math.sin(a) * 1.4, 3.8, lx, ly, 4.9, 1.65, 1.15, mat('stem'), partId.leaf, true);
      m.paintEllipsoid(lx * 1.08, ly * 1.08, 4.7, 2.0, 1.5, 1.0, mat('stem'), partId.leaf, true);
    }

    // 饱满鼓胀的主花苞（外瓣合拢，顶缝露出亮内瓣）
    m.paintEllipsoid(0, 0, 10.6, 4.1, 4.1, 4.5, mat('petal'), partId.petal, true);
    m.paintEllipsoid(0, 0, 14.3, 2.2, 2.2, 1.6, mat('inner'), partId.inner, true);
    m.paintEllipsoid(0, 0, 15.1, 1.1, 1.1, 0.9, mat('pollen'), partId.pollen, true);

    // 托住花苞底部的 4 片绿萼
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.78;
      m.paintCapsule(
        Math.cos(a) * 2.0, Math.sin(a) * 2.0, 6.8,
        Math.cos(a) * 4.2, Math.sin(a) * 4.2, 10.2,
        1.25, 0.72, mat('stem'), partId.stem, true
      );
    }

    // 两侧 2 颗歪着冒头的小花苞
    const sideBuds = [
      { x: -4.4, y: -2.4, z: 7.4 },
      { x:  4.5, y:  2.2, z: 7.0 }
    ];
    for (const sb of sideBuds) {
      m.paintCapsule(0, 0, 3.6, sb.x * 0.75, sb.y * 0.75, sb.z - 1.2, 1.0, 0.85, mat('stem'), partId.stem, true);
      m.paintEllipsoid(sb.x, sb.y, sb.z + 1.0, 2.1, 2.1, 2.3, mat('petal'), partId.petal, true);
      m.paintEllipsoid(sb.x, sb.y, sb.z + 2.8, 1.1, 1.1, 0.9, mat('inner'), partId.inner, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.8, headZ: 16, centerZ: 8 });
  }

  // 3. 生长第 3 档：stageBloom（22×22×19，盛开大花丛）
  function buildStageBloom(makeCanvas) {
    const m = new VoxelModel(22, 22, 19, SPEC);
    const { mat, partId } = SPEC;

    // 底部缠绕白根与短茎
    m.paintEllipsoid(0, 0, 1.5, 4.0, 4.0, 1.2, mat('root'), partId.root, true);
    m.paintCapsule(0, 0, 1.8, 0, 0, 8.6, 2.2, 1.8, mat('stem'), partId.stem, true);

    // 5 片舒展底叶托底
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.55;
      m.paintCapsule(
        Math.cos(a) * 1.5, Math.sin(a) * 1.5, 4.0,
        Math.cos(a) * 6.8, Math.sin(a) * 6.8, 5.2,
        1.75, 1.15, mat('stem'), partId.leaf, true
      );
    }

    // 盛开主大花：5 片宽阔微翘大外瓣（错开圆弧花冠）
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.15;
      const midX = Math.cos(a) * 4.5, midY = Math.sin(a) * 4.5;
      const tipX = Math.cos(a) * 7.6, tipY = Math.sin(a) * 7.6;
      m.paintCapsule(Math.cos(a) * 1.8, Math.sin(a) * 1.8, 9.6, midX, midY, 11.4, 2.4, 2.8, mat('petal'), partId.petal, true);
      m.paintEllipsoid(tipX, tipY, 12.6, 2.6, 2.6, 1.65, mat('petal'), partId.petal, true);
      // 瓣尖微卷立体弧
      m.paintEllipsoid(Math.cos(a) * 8.4, Math.sin(a) * 8.4, 13.4, 1.6, 1.6, 1.1, mat('petal'), partId.petal, true);
    }

    // 5 片错位内瓣环，托出明快花心层次
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.15 + Math.PI / 5;
      m.paintEllipsoid(Math.cos(a) * 4.2, Math.sin(a) * 4.2, 13.0, 2.3, 2.3, 1.6, mat('inner'), partId.inner, true);
    }

    // 鼓起的花粉蕊芯 + 几颗凸起花药点
    m.paintEllipsoid(0, 0, 13.8, 3.1, 3.1, 2.4, mat('pollen'), partId.pollen, true);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      m.paintEllipsoid(Math.cos(a) * 1.7, Math.sin(a) * 1.7, 16.0, 0.95, 0.95, 1.0, mat('pollen'), partId.pollen, true);
    }
    m.paintEllipsoid(0, 0, 16.5, 1.05, 1.05, 0.95, mat('pollen'), partId.pollen, true);

    // 2 朵饱满侧花组成一丛花簇，360° 都丰满立体
    const sideFlowers = [
      { x: -6.2, y: -4.2, z: 8.6 },
      { x:  6.4, y:  3.8, z: 8.2 }
    ];
    for (const sf of sideFlowers) {
      m.paintCapsule(0, 0, 4.2, sf.x * 0.72, sf.y * 0.72, sf.z - 1.2, 1.1, 0.95, mat('stem'), partId.stem, true);
      for (let k = 0; k < 4; k++) {
        const ka = (k / 4) * TAU + 0.35;
        m.paintEllipsoid(sf.x + Math.cos(ka) * 2.2, sf.y + Math.sin(ka) * 2.2, sf.z + 0.8, 1.55, 1.55, 1.15, mat('petal'), partId.petal, true);
      }
      m.paintEllipsoid(sf.x, sf.y, sf.z + 1.8, 1.35, 1.35, 1.15, mat('pollen'), partId.pollen, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.8, headZ: 18, centerZ: 10 });
  }

  // 4. 生长第 4 档：stageDisperse（22×22×19，结籽抖落）
  function buildStageDisperse(makeCanvas) {
    const m = new VoxelModel(22, 22, 19, SPEC);
    const { mat, partId } = SPEC;

    // 底部白根与短茎
    m.paintEllipsoid(0, 0, 1.5, 3.8, 3.8, 1.2, mat('root'), partId.root, true);
    m.paintCapsule(0, 0, 1.8, 0, 0, 8.6, 2.2, 1.75, mat('stem'), partId.stem, true);

    // 微垂叶片
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.4;
      m.paintCapsule(
        Math.cos(a) * 1.5, Math.sin(a) * 1.5, 4.2,
        Math.cos(a) * 6.4, Math.sin(a) * 6.4, 3.4,
        1.6, 1.0, mat('stem'), partId.leaf, true
      );
    }

    // 微微翻卷下垂的外花瓣（让出饱满成熟的结籽球头）
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.15;
      m.paintCapsule(
        Math.cos(a) * 2.2, Math.sin(a) * 2.2, 9.2,
        Math.cos(a) * 7.2, Math.sin(a) * 7.2, 7.6,
        2.1, 1.6, mat('petal'), partId.petal, true
      );
      m.paintEllipsoid(Math.cos(a) * 4.4, Math.sin(a) * 4.4, 10.0, 1.8, 1.8, 1.2, mat('inner'), partId.inner, true);
    }

    // 中央鼓起的成熟结籽托 + 5 颗欲坠的带倒钩种子小球
    m.paintEllipsoid(0, 0, 11.4, 3.4, 3.4, 2.8, mat('seed'), partId.seed, true);
    const seedSpots = [
      { x:  0.0, y:  0.0, z: 15.0, r: 2.0 },
      { x:  3.0, y:  1.4, z: 13.6, r: 1.75 },
      { x: -3.0, y:  1.2, z: 13.4, r: 1.75 },
      { x:  1.4, y: -3.1, z: 13.2, r: 1.70 },
      { x: -1.8, y: -2.8, z: 13.5, r: 1.70 }
    ];
    for (let i = 0; i < seedSpots.length; i++) {
      const s = seedSpots[i];
      m.paintEllipsoid(s.x, s.y, s.z, s.r, s.r, s.r * 0.95, mat('seed'), partId.seed, true);
      // 每颗种子外翘 2 根浅色倒钩
      const ang = i * 1.25 + 0.3;
      m.paintCapsule(s.x, s.y, s.z + 0.6, s.x + Math.cos(ang) * 2.2, s.y + Math.sin(ang) * 2.2, s.z + 2.0, 0.65, 0.45, mat('barb'), partId.barb, true);
      m.paintCapsule(s.x, s.y, s.z + 0.4, s.x - Math.sin(ang) * 2.0, s.y + Math.cos(ang) * 2.0, s.z + 1.5, 0.60, 0.42, mat('barb'), partId.barb, true);
    }

    // 侧枝也结出 2 颗成熟倒钩籽
    for (const sf of [{ x: -5.8, y: -3.8, z: 8.8 }, { x: 5.8, y: 3.6, z: 8.6 }]) {
      m.paintCapsule(0, 0, 4.2, sf.x * 0.72, sf.y * 0.72, sf.z - 1.0, 1.0, 0.85, mat('stem'), partId.stem, true);
      m.paintEllipsoid(sf.x, sf.y, sf.z + 0.8, 1.9, 1.9, 1.8, mat('seed'), partId.seed, true);
      m.paintCapsule(sf.x, sf.y, sf.z + 1.4, sf.x * 1.25, sf.y * 1.25, sf.z + 2.8, 0.62, 0.42, mat('barb'), partId.barb, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.4, headZ: 18, centerZ: 10 });
  }

  // 5. 独立带倒钩种子小球（8×8×8，用于弹跳飞挂宿主 & 散籽落地弹跳）
  function buildSeedBurr(makeCanvas) {
    const m = new VoxelModel(8, 8, 8, SPEC);
    const { mat, partId } = SPEC;

    m.paintEllipsoid(0, 0, 3.6, 2.0, 2.0, 1.9, mat('seed'), partId.seed, true);
    // 6 根对称浅色倒钩
    const dirs = [
      [1, 0, 0.45], [-1, 0, 0.45], [0, 1, 0.45], [0, -1, 0.45],
      [0.65, 0.65, 0.9], [-0.65, -0.65, 0.9]
    ];
    for (const [dx, dy, dz] of dirs) {
      m.paintCapsule(dx * 1.1, dy * 1.1, 3.6 + dz * 0.5, dx * 2.8, dy * 2.8, 3.6 + dz * 2.1, 0.62, 0.42, mat('barb'), partId.barb, true);
    }
    // 顶部极小绿芽点
    m.paintEllipsoid(0, 0, 5.6, 0.85, 0.85, 0.75, mat('stem'), partId.stem, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 7, centerZ: 4 });
  }

  // 6. 独台预览用：极简林地苔木桩载体（22×22×14，仅在无其他宿主时出现）
  function buildStump(makeCanvas) {
    const m = new VoxelModel(22, 22, 14, SPEC);
    const { mat, partId } = SPEC;

    // 底部 4 条抓地树根拱脚
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.52;
      m.paintCapsule(
        Math.cos(a) * 3.8, Math.sin(a) * 3.8, 3.2,
        Math.cos(a) * 8.6, Math.sin(a) * 8.6, 1.1,
        2.3, 1.35, mat('wood'), partId.wood, true
      );
    }

    // 树桩主体（略微上窄下宽 + 树皮竖棱）
    m.fillAABB(-8.5, 8.5, -8.5, 8.5, 0, 10.6, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const ridge = Math.sin(ang * 7 + 0.4) * 0.45 + Math.cos(ang * 3 - 0.6) * 0.3;
      const rad = lerp(7.0, 5.9, clamp(z / 10.5, 0, 1)) + ridge;
      if (r <= rad) {
        m.setRaw(x, y, z, mat('wood'), partId.wood);
      }
    });

    // 桩顶边沿几块柔软林地青苔垫
    const mossPatches = [
      { x: -4.4, y:  3.0, z: 10.4, rx: 2.6, ry: 2.2, rz: 1.5 },
      { x:  4.2, y: -3.2, z: 10.2, rx: 2.8, ry: 2.3, rz: 1.5 },
      { x: -5.4, y:  2.2, z:  7.8, rx: 1.6, ry: 1.8, rz: 2.2 },
      { x:  5.2, y: -2.4, z:  7.4, rx: 1.6, ry: 1.8, rz: 2.1 },
      { x:  1.2, y:  4.8, z: 10.3, rx: 2.1, ry: 1.8, rz: 1.2 }
    ];
    for (const mp of mossPatches) {
      m.paintEllipsoid(mp.x, mp.y, mp.z, mp.rx, mp.ry, mp.rz, mat('moss'), partId.moss, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.0, headZ: 12, centerZ: 6 });
  }

  // =========================================================================
  // 生物定义与双态运行状态机
  // =========================================================================
  const STUMP_TOP_Z = 10.4;

  const Earth8Def = {
    id: 'earth8_host_bloom',
    code: '地8',
    name: '长在别人身上的花',
    status: 'done',
    noHost: true,
    tag: 'M36 寄生挂载标杆 · 4 档生长 · 宿主轮替',
    summary: '钩籽弹跳粘在路过大型生物背上扎根开花，花熟抖落倒钩种子再换下一只宿主；独台预览自动配林地苔木桩演示完整 4 档生长与散籽',
    defaultHabitat: 'forest',
    footRadius: 8.2,
    ecoWeight: 0.45,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      'MountSystem 任意宿主背心挂点挂载',
      '4 档预烘生长（钩籽 / 花苞 / 盛开 / 结籽）',
      'notifyHostDisturb 触发宿主微晃蹭树',
      '双态自适应（多怪寄生 / 独台苔木桩）',
      '花冠 3D 弹簧随风与宿主惯性摇曳'
    ],
    soulHabit: '多怪同台时钩籽弹跳飞挂到肚嘴巨兽等大家伙背上，依次发芽、鼓苞、盛开摇曳、抖落倒钩籽并脱落换宿主；独台时附于林地苔木桩演示 4 档完整生长',
    actions: [
      { id: 'patrol',   name: '寄生轮替（4档生长）', loop: true, status: 'done' },
      { id: 'idle',     name: '盛开摇曳',           loop: true, status: 'done' },
      { id: 'disperse', name: '散籽弹跳附着',       loop: true, status: 'done' }
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
        rootPad:       buildRootPad(makeCanvas),
        stageSeed:     buildStageSeed(makeCanvas),
        stageBud:      buildStageBud(makeCanvas),
        stageBloom:    buildStageBloom(makeCanvas),
        stageDisperse: buildStageDisperse(makeCanvas),
        seedBurr:      buildSeedBurr(makeCanvas),
        stump:         buildStump(makeCanvas)
      };

      const riderId = `earth8_bloom_${Math.random().toString(36).slice(2, 7)}`;
      const swaySpring = new SpringDamper3D(0, 0, 0, 68, 5.4);
      const yawSpring  = new SpringDamper1D(0, 52, 5.2);
      const sockets    = new SocketTracker();

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: opts.homeYaw ?? 0,
        shadowScale: 1,
        // 双态与寄生挂载状态
        hasHostEnv: false,
        host: null,
        slot: null,
        lastHost: null,
        // 状态机：seek | approach | seed | bud | bloom | disperse | drop
        mode: 'seed',
        modeT: 0,
        stage: 'stageSeed',
        cycleSeq: 0,
        attachCount: 0,
        hostSwitchCount: 0,
        disperseCount: 0,
        // 散籽与扰动计时
        disturbCd: 0,
        pollenCd: 0.4,
        seedBurstDone: 0,
        prevHostVx: 0,
        prevHostVy: 0,
        // 掉落弧线起点/终点
        dropStartX: 0,
        dropStartY: 0,
        dropStartZ: 12,
        dropEndX: 0,
        dropEndY: 0,
        // 独台弹跳演示回桩弧线
        soloHopStartX: 0,
        soloHopStartY: 0,
        // 物理弹跳小钩籽视觉池（最多 5 颗）
        subSeeds: []
      };

      let curSkin = SKINS[0];

      function spawnSubSeed(ox, oy, oz, vx, vy, vz, life) {
        if (state.subSeeds.length >= 6) state.subSeeds.shift();
        state.subSeeds.push({
          x: ox, y: oy, z: oz,
          vx, vy, vz,
          yaw: Math.random() * TAU,
          spin: (Math.random() - 0.5) * 9.0,
          t: 0,
          life: life || 2.2
        });
      }

      function updateSubSeeds(dt, vfx, habitat) {
        for (let i = state.subSeeds.length - 1; i >= 0; i--) {
          const b = state.subSeeds[i];
          b.t += dt;
          if (b.t >= b.life) {
            state.subSeeds.splice(i, 1);
            continue;
          }
          b.vz -= 46 * dt;
          b.x += b.vx * dt;
          b.y += b.vy * dt;
          b.z += b.vz * dt;
          b.yaw = wrapAngle(b.yaw + b.spin * dt);
          if (b.z < 0.2) {
            b.z = 0.2;
            if (Math.abs(b.vz) > 4.2) {
              b.vz = Math.abs(b.vz) * 0.42;
              b.vx *= 0.62;
              b.vy *= 0.62;
              b.spin *= 0.65;
              if (vfx && habitat) {
                vfx.spawnDust(b.x, b.y, 2, 0.35, habitat.fx);
              }
            } else {
              b.vz = 0;
              b.vx *= Math.max(0, 1 - dt * 8);
              b.vy *= Math.max(0, 1 - dt * 8);
              b.spin *= Math.max(0, 1 - dt * 8);
            }
          }
        }
      }

      function emitSeedVolley(cx, cy, cz, sMul, vfx, count) {
        const n = count || 3;
        const fx = curSkin.fx || { pollen: '#ffe066', petal: '#f2745c', seed: '#bd9566' };
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * TAU + state.cycleSeq * 0.7 + (Math.random() - 0.5) * 0.65;
          const spd = (10 + Math.random() * 11) * sMul;
          const vz  = (14 + Math.random() * 10) * sMul;
          spawnSubSeed(
            cx + Math.cos(ang) * 2.2 * sMul,
            cy + Math.sin(ang) * 2.2 * sMul,
            cz + 12.0 * sMul,
            Math.cos(ang) * spd,
            Math.sin(ang) * spd,
            vz,
            1.9 + Math.random() * 0.8
          );
          if (vfx) {
            vfx.spawnParticle(
              cx, cy, cz + 12.5 * sMul,
              Math.cos(ang) * spd * 1.25, Math.sin(ang) * spd * 1.25, vz * 0.9,
              0.65 + Math.random() * 0.3, 1.35, fx.pollen, false, 18
            );
          }
        }
        // 花冠猛抖反冲
        swaySpring.impulse((Math.random() - 0.5) * 28, (Math.random() - 0.5) * 28, -14);
        yawSpring.impulse((Math.random() - 0.5) * 9);
      }

      function releaseCurrentHost(allActors, rememberLast) {
        if (rememberLast && state.host) state.lastHost = state.host;
        if (allActors && allActors.length) {
          MountSystem.releaseMount(riderId, allActors);
        } else if (state.slot && state.slot.occupiedBy === riderId) {
          state.slot.occupiedBy = null;
        }
        state.host = null;
        state.slot = null;
        state.sortBias = 0;
      }

      function enterMode(nextMode) {
        state.mode = nextMode;
        state.modeT = 0;
        state.seedBurstDone = 0;
        if (nextMode === 'seed')          state.stage = 'stageSeed';
        else if (nextMode === 'bud')      state.stage = 'stageBud';
        else if (nextMode === 'bloom')    state.stage = 'stageBloom';
        else if (nextMode === 'disperse') state.stage = 'stageDisperse';
      }

      const instance = {
        def: Earth8Def,
        cachePrefix: riderId,
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
          releaseCurrentHost(null, false);
          state.x = homeX;
          state.y = homeY;
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.shadowScale = 1;
          state.hasHostEnv = false;
          state.lastHost = null;
          state.mode = 'seed';
          state.modeT = 0;
          state.stage = 'stageSeed';
          state.disturbCd = 0;
          state.pollenCd = 0.4;
          state.seedBurstDone = 0;
          state.prevHostVx = 0;
          state.prevHostVy = 0;
          state.subSeeds.length = 0;
          swaySpring.reset(0, 0, 0);
          yawSpring.x = 0;
          yawSpring.v = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.35, 2.5);
          const speedMul = clamp(params.speed ?? 1.0, 0.3, 2.5);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(sp);
          const action = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const allActors = (eco && Array.isArray(eco.allActors)) ? eco.allActors : [];
          const selfRef = (eco && eco.self) || instance;

          // 判断台上是否存在可寄生宿主（排除自身与 noHost）
          let hostAvailable = false;
          if (state.host && allActors.includes(state.host)) {
            hostAvailable = true;
          } else {
            const probe = MountSystem.findMountHost(selfRef, allActors, {
              riderId,
              preferredCodes: ['地1', '地4', '沙4'],
              minFootRadius: 7
            });
            hostAvailable = !!probe;
          }

          // 若此前持有的宿主已离台，及时释放
          if (state.host && !allActors.includes(state.host)) {
            releaseCurrentHost(allActors, false);
            if (hostAvailable) enterMode('seek');
          }

          // 独台 ↔ 多怪同台切换时的干净重置
          if (hostAvailable && !state.hasHostEnv) {
            state.hasHostEnv = true;
            state.lastHost = null;
            enterMode('seek');
          } else if (!hostAvailable && state.hasHostEnv) {
            releaseCurrentHost(allActors, false);
            state.hasHostEnv = false;
            enterMode(action === 'idle' ? 'bloom' : 'seed');
          }

          updateSubSeeds(dt, vfx, habitat);
          state.modeT += dt * speedMul;
          state.pollenCd -= dt;
          state.disturbCd -= dt;

          const fx = curSkin.fx || { pollen: '#ffe066', petal: '#f2745c', seed: '#bd9566' };

          // =================================================================
          // 分支 A：多怪同台模式（真正搜寻宿主、弹跳飞挂背心、4 档生长、换宿主）
          // =================================================================
          if (state.hasHostEnv) {
            const isFastDisperse = action === 'disperse';
            const durSeed     = isFastDisperse ? 1.0 : 2.5;
            const durBud      = isFastDisperse ? 1.1 : 2.9;
            const durBloom    = isFastDisperse ? 1.5 : 4.5;
            const durDisperse = isFastDisperse ? 2.6 : 3.2;
            const durDrop     = isFastDisperse ? 1.2 : 2.1;

            if (state.mode === 'seek') {
              state.shadowScale = 0.55;
              state.z = lerp(state.z, 0, expSmooth(dt, 10));
              state.vx = lerp(state.vx, 0, expSmooth(dt, 8));
              state.vy = lerp(state.vy, 0, expSmooth(dt, 8));

              // 优先换一只不同的宿主；若台上只有 1 只宿主，则短暂休整后重新飞挂
              let found = MountSystem.findMountHost(selfRef, allActors, {
                riderId,
                preferredCodes: ['地1', '地4', '沙4'],
                excludeHost: state.lastHost,
                minFootRadius: 7
              });
              if (!found && state.modeT >= 0.45) {
                found = MountSystem.findMountHost(selfRef, allActors, {
                  riderId,
                  preferredCodes: ['地1', '地4', '沙4'],
                  excludeHost: null,
                  minFootRadius: 7
                });
              }
              if (found && MountSystem.claimMount(riderId, found.host, found.slot)) {
                if (state.lastHost && found.host !== state.lastHost) {
                  state.hostSwitchCount++;
                }
                state.host = found.host;
                state.slot = found.slot;
                state.prevHostVx = found.host.state.vx || 0;
                state.prevHostVy = found.host.state.vy || 0;
                enterMode('approach');
                if (vfx && habitat) {
                  vfx.spawnDust(state.x, state.y, 4, 0.55, habitat.fx);
                }
              }
            } else if (state.mode === 'approach') {
              state.shadowScale = 0.45;
              const offsetLocal = (state.slot && state.slot.auto) ? { lx: 0, ly: 0, lz: 1.4 } : null;
              const res = MountSystem.stepApproachAndMount(state, state.host, state.slot, dt, params, {
                speed: 28,
                arcLift: 9,
                arriveDist: 2.5,
                offsetLocal
              });
              if (res.lost) {
                releaseCurrentHost(allActors, false);
                enterMode('seek');
              } else {
                // 空中旋转的小钩籽微粒拖尾
                if (vfx && state.pollenCd <= 0) {
                  state.pollenCd = 0.09;
                  vfx.spawnParticle(state.x, state.y, state.z + 2.0, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 2, 0.36, 1.1, fx.seed, false, 8);
                }
                if (res.mounted) {
                  state.attachCount++;
                  state.cycleSeq++;
                  state.shadowScale = 0;
                  swaySpring.impulse((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, -16);
                  notifyHostDisturb(state.host, riderId, 0.65);
                  if (vfx) {
                    for (let k = 0; k < 5; k++) {
                      const a = (k / 5) * TAU + Math.random() * 0.4;
                      vfx.spawnParticle(state.x, state.y, state.z + 2.2, Math.cos(a) * 9, Math.sin(a) * 9, 7 + Math.random() * 4, 0.42, 1.25, fx.pollen, false, 20);
                    }
                  }
                  enterMode(action === 'idle' ? 'bloom' : 'seed');
                }
              }
            } else if (state.mode === 'seed' || state.mode === 'bud' || state.mode === 'bloom' || state.mode === 'disperse') {
              // 紧跟宿主背心挂点
              const offsetLocal = (state.slot && state.slot.auto) ? { lx: 0, ly: 0, lz: 1.4 } : null;
              const pose = MountSystem.getMountWorldPose(state.host, state.slot, offsetLocal);
              if (!pose || !pose.alive) {
                releaseCurrentHost(allActors, true);
                enterMode('seek');
              } else {
                state.shadowScale = 0;
                state.sortBias = Math.max((state.host.def.footRadius || 12) * (state.host.scaleMul || 1) * 1.15, 16);
                state.x = pose.x;
                state.y = pose.y;
                state.z = pose.z;
                state.yaw = pose.yaw;

                // 计算宿主加速度，驱动花冠真实惯性滞后摇曳
                const hvx = state.host.state.vx || 0;
                const hvy = state.host.state.vy || 0;
                const ax = clamp((hvx - state.prevHostVx) / Math.max(dt, 0.004), -60, 60);
                const ay = clamp((hvy - state.prevHostVy) / Math.max(dt, 0.004), -60, 60);
                state.prevHostVx = hvx;
                state.prevHostVy = hvy;
                state.vx = hvx;
                state.vy = hvy;

                const windAmp = (state.mode === 'bloom' ? 1.45 : (state.mode === 'disperse' ? 1.8 : 0.75)) * flex;
                const tx = -ax * 0.025 * flex + Math.sin(time * 2.6 + (eco.seed || 0)) * windAmp;
                const ty = -ay * 0.025 * flex + Math.cos(time * 2.1 + (eco.seed || 0)) * windAmp * 0.85;
                const tz = Math.sin(time * 3.8) * (state.mode === 'bloom' ? 0.45 : 0.25);
                swaySpring.update(dt, tx, ty, tz, 68 * sp, clamp(5.4 * dScale, 2.5, 10.0));
                yawSpring.update(dt, Math.sin(time * 2.2) * 0.16 * flex, 52 * sp, clamp(5.2 * dScale, 2.4, 9.5));

                if (action === 'idle') {
                  state.mode = 'bloom';
                  state.stage = 'stageBloom';
                  if (state.disturbCd <= 0) {
                    state.disturbCd = 2.4;
                    notifyHostDisturb(state.host, riderId, 0.75);
                  }
                  if (vfx && state.pollenCd <= 0) {
                    state.pollenCd = 0.45;
                    vfx.spawnParticle(state.x + (Math.random() - 0.5) * 4, state.y + (Math.random() - 0.5) * 4, state.z + 13 * sMul, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 4 + Math.random() * 4, 0.85, 1.15, fx.pollen, false, 4);
                  }
                } else if (state.mode === 'seed') {
                  if (state.modeT >= durSeed) {
                    enterMode('bud');
                    swaySpring.impulse(0, 0, 10);
                    notifyHostDisturb(state.host, riderId, 0.75);
                  }
                } else if (state.mode === 'bud') {
                  if (state.disturbCd <= 0) {
                    state.disturbCd = 1.9;
                    notifyHostDisturb(state.host, riderId, 0.72);
                  }
                  if (state.modeT >= durBud) {
                    enterMode('bloom');
                    swaySpring.impulse(0, 0, 14);
                    notifyHostDisturb(state.host, riderId, 0.9);
                    if (vfx) {
                      for (let k = 0; k < 6; k++) {
                        const a = (k / 6) * TAU;
                        vfx.spawnParticle(state.x, state.y, state.z + 13 * sMul, Math.cos(a) * 8, Math.sin(a) * 8, 6 + Math.random() * 4, 0.65, 1.25, fx.petal, false, 12);
                      }
                    }
                  }
                } else if (state.mode === 'bloom') {
                  if (state.disturbCd <= 0) {
                    state.disturbCd = 1.75;
                    notifyHostDisturb(state.host, riderId, 0.9);
                  }
                  if (vfx && state.pollenCd <= 0) {
                    state.pollenCd = 0.32;
                    vfx.spawnParticle(
                      state.x + (Math.random() - 0.5) * 5,
                      state.y + (Math.random() - 0.5) * 5,
                      state.z + 13.5 * sMul,
                      hvx * 0.25 + (Math.random() - 0.5) * 6,
                      hvy * 0.25 + (Math.random() - 0.5) * 6,
                      5 + Math.random() * 4,
                      0.82, 1.2, fx.pollen, false, 5
                    );
                  }
                  if (state.modeT >= durBloom) {
                    enterMode('disperse');
                    notifyHostDisturb(state.host, riderId, 0.95);
                  }
                } else if (state.mode === 'disperse') {
                  // 两波结籽抖落
                  if (state.seedBurstDone === 0 && state.modeT >= 0.45) {
                    state.seedBurstDone = 1;
                    state.disperseCount++;
                    notifyHostDisturb(state.host, riderId, 0.95);
                    emitSeedVolley(state.x, state.y, state.z, sMul, vfx, isFastDisperse ? 4 : 3);
                  } else if (state.seedBurstDone === 1 && state.modeT >= durDisperse * 0.56) {
                    state.seedBurstDone = 2;
                    notifyHostDisturb(state.host, riderId, 0.9);
                    emitSeedVolley(state.x, state.y, state.z, sMul, vfx, 3);
                  }
                  if (state.modeT >= durDisperse) {
                    // 从宿主背侧被蹭落掉落到地面
                    const sideAng = state.yaw + ((state.cycleSeq & 1) ? 1.35 : -1.35);
                    state.dropStartX = state.x;
                    state.dropStartY = state.y;
                    state.dropStartZ = Math.max(4, state.z);
                    state.dropEndX = clamp(state.x + Math.cos(sideAng) * 14, -(eco.maxRadius || 48), eco.maxRadius || 48);
                    state.dropEndY = clamp(state.y + Math.sin(sideAng) * 14, -(eco.maxRadius || 48), eco.maxRadius || 48);
                    releaseCurrentHost(allActors, true);
                    enterMode('drop');
                    state.stage = 'stageSeed';
                  }
                }
              }
            } else if (state.mode === 'drop') {
              // 掉落弧线（前 0.65s 抛物线落地，随后原地枯萎休整准备弹跳换新宿主）
              const fallDur = 0.65;
              const u = clamp(state.modeT / fallDur, 0, 1);
              const s = u * u * (3 - 2 * u);
              state.x = lerp(state.dropStartX, state.dropEndX, s);
              state.y = lerp(state.dropStartY, state.dropEndY, s);
              state.z = lerp(state.dropStartZ, 0, u * u) + Math.sin(u * Math.PI) * 5.2;
              state.shadowScale = lerp(0.25, 0.55, u);
              if (u >= 1 && state.seedBurstDone === 0) {
                state.seedBurstDone = 1;
                if (vfx && habitat) {
                  vfx.spawnDust(state.x, state.y, 4, 0.55, habitat.fx);
                }
              }
              swaySpring.update(dt, 0, 0, 0, 60 * sp, 6.5);
              if (state.modeT >= durDrop) {
                enterMode('seek');
              }
            } else {
              enterMode('seek');
            }
          } else {
            // ===============================================================
            // 分支 B：独台预览模式（自带林地苔木桩载体，绝不干悬空气里）
            // ===============================================================
            const homeX = eco && eco.homeX !== undefined ? eco.homeX : 0;
            const homeY = eco && eco.homeY !== undefined ? eco.homeY : 0;
            const homeYaw = eco && eco.homeYaw !== undefined ? eco.homeYaw : 0;
            state.x = homeX;
            state.y = homeY;
            state.z = 0;
            state.vx = 0;
            state.vy = 0;
            state.yaw = homeYaw;
            state.shadowScale = 1;

            const windX = Math.sin(time * 2.1 + 0.4) * 1.35 * flex;
            const windY = Math.cos(time * 1.7 + 1.1) * 1.05 * flex;
            const windZ = Math.sin(time * 3.1) * 0.35;
            swaySpring.update(dt, windX, windY, windZ, 64 * sp, clamp(5.0 * dScale, 2.4, 9.5));
            yawSpring.update(dt, Math.sin(time * 1.8) * 0.14 * flex, 48 * sp, clamp(5.0 * dScale, 2.4, 9.5));

            if (action === 'idle') {
              state.mode = 'bloom';
              state.stage = 'stageBloom';
              if (vfx && state.pollenCd <= 0) {
                state.pollenCd = 0.42;
                vfx.spawnParticle(
                  homeX + (Math.random() - 0.5) * 5,
                  homeY + (Math.random() - 0.5) * 5,
                  (STUMP_TOP_Z + 13.5) * sMul,
                  (Math.random() - 0.5) * 5,
                  (Math.random() - 0.5) * 5,
                  4.5 + Math.random() * 4,
                  0.85, 1.2, fx.pollen, false, 4
                );
              }
            } else if (action === 'disperse') {
              // 连续演示：短盛开 -> 抖落钩籽 -> 新钩籽从桩旁弹跳回木桩 -> 发芽 -> 鼓苞
              if (state.mode === 'seek' || state.mode === 'drop') enterMode('bloom');
              if (state.mode === 'bloom') {
                if (state.modeT >= 1.3) enterMode('disperse');
              } else if (state.mode === 'disperse') {
                if (state.seedBurstDone === 0 && state.modeT >= 0.35) {
                  state.seedBurstDone = 1;
                  state.disperseCount++;
                  emitSeedVolley(homeX, homeY, STUMP_TOP_Z * sMul, sMul, vfx, 4);
                } else if (state.seedBurstDone === 1 && state.modeT >= 1.25) {
                  state.seedBurstDone = 2;
                  emitSeedVolley(homeX, homeY, STUMP_TOP_Z * sMul, sMul, vfx, 3);
                }
                if (state.modeT >= 2.2) {
                  const a = hash2i(state.cycleSeq + 1, 73, 19) * TAU;
                  state.soloHopStartX = homeX + Math.cos(a) * 18;
                  state.soloHopStartY = homeY + Math.sin(a) * 18;
                  enterMode('approach');
                }
              } else if (state.mode === 'approach') {
                if (state.modeT >= 0.95) {
                  state.cycleSeq++;
                  swaySpring.impulse(0, 0, -14);
                  enterMode('seed');
                }
              } else if (state.mode === 'seed') {
                if (state.modeT >= 1.1) enterMode('bud');
              } else if (state.mode === 'bud') {
                if (state.modeT >= 1.1) enterMode('bloom');
              }
            } else {
              // 独台 patrol：完整 4 档生长循环（seed -> bud -> bloom -> disperse -> seed）
              if (state.mode === 'seek' || state.mode === 'approach' || state.mode === 'drop') {
                enterMode('seed');
              }
              if (state.mode === 'seed') {
                if (state.modeT >= 2.4) {
                  enterMode('bud');
                  swaySpring.impulse(0, 0, 10);
                }
              } else if (state.mode === 'bud') {
                if (state.modeT >= 2.8) {
                  enterMode('bloom');
                  swaySpring.impulse(0, 0, 14);
                  if (vfx) {
                    for (let k = 0; k < 6; k++) {
                      const a = (k / 6) * TAU;
                      vfx.spawnParticle(homeX, homeY, (STUMP_TOP_Z + 12) * sMul, Math.cos(a) * 8, Math.sin(a) * 8, 6, 0.65, 1.25, fx.petal, false, 12);
                    }
                  }
                }
              } else if (state.mode === 'bloom') {
                if (vfx && state.pollenCd <= 0) {
                  state.pollenCd = 0.34;
                  vfx.spawnParticle(
                    homeX + (Math.random() - 0.5) * 5,
                    homeY + (Math.random() - 0.5) * 5,
                    (STUMP_TOP_Z + 13.5) * sMul,
                    (Math.random() - 0.5) * 5.5,
                    (Math.random() - 0.5) * 5.5,
                    5 + Math.random() * 4,
                    0.85, 1.2, fx.pollen, false, 4
                  );
                }
                if (state.modeT >= 4.4) enterMode('disperse');
              } else if (state.mode === 'disperse') {
                if (state.seedBurstDone === 0 && state.modeT >= 0.5) {
                  state.seedBurstDone = 1;
                  state.disperseCount++;
                  emitSeedVolley(homeX, homeY, STUMP_TOP_Z * sMul, sMul, vfx, 3);
                } else if (state.seedBurstDone === 1 && state.modeT >= 1.75) {
                  state.seedBurstDone = 2;
                  emitSeedVolley(homeX, homeY, STUMP_TOP_Z * sMul, sMul, vfx, 3);
                }
                if (state.modeT >= 3.1) {
                  state.cycleSeq++;
                  enterMode('seed');
                }
              }
            }
          }

          // 更新挂点追踪器（便于外部查询花冠中心）
          const crownZ = state.hasHostEnv ? (state.z + 11 * sMul) : ((STUMP_TOP_Z + 11) * sMul);
          sockets.setWorld('crown', state.x + swaySpring.x * 0.45, state.y + swaySpring.y * 0.45, crownZ, state.yaw);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!habitat.isWater;
          const swayX = clamp(swaySpring.x, -3.2, 3.2) * sMul;
          const swayY = clamp(swaySpring.y, -3.2, 3.2) * sMul;
          const swayZ = clamp(swaySpring.z, -1.8, 1.8) * sMul;
          const flowerYaw = wrapAngle(state.yaw + clamp(yawSpring.x, -0.45, 0.45));

          if (state.hasHostEnv) {
            // 多怪同台模式：不画木桩，只画弹跳钩籽或寄生在宿主背上的花
            if (state.mode === 'approach' || state.mode === 'seek' || state.mode === 'drop') {
              const spinYaw = state.mode === 'approach'
                ? wrapAngle(state.yaw + state.modeT * 10.5)
                : state.yaw;
              list.push({
                partKey: 'seedBurr',
                asset: parts.seedBurr,
                x: state.x,
                y: state.y,
                lift: Math.max(0, state.z),
                ro: spinYaw,
                symDeg: 90,
                bias: 2.05,
                submerge: EnvFeedback.calcSubmerge(state.z + 1.0, habitat.waterLevel, 4.0, isWater)
              });
            } else {
              // 牢牢扎根的白色细根须底盘（紧贴宿主背心，强正 bias 防穿模）
              list.push({
                partKey: 'rootPad',
                asset: parts.rootPad,
                x: state.x,
                y: state.y,
                lift: Math.max(0, state.z),
                ro: state.yaw,
                bias: 1.55
              });
              // 当前生长档位的花体（随风与宿主惯性摇曳，bias = +1.85 稳居宿主背上）
              const stageKey = parts[state.stage] ? state.stage : 'stageBloom';
              list.push({
                partKey: stageKey,
                asset: parts[stageKey],
                x: state.x + swayX * 0.45,
                y: state.y + swayY * 0.45,
                lift: Math.max(0, state.z + 1.0 * sMul + swayZ * 0.4),
                ro: flowerYaw,
                bias: 1.85
              });
            }
          } else {
            // 独台预览模式：自带极简林地苔木桩载体
            list.push({
              partKey: 'stump',
              asset: parts.stump,
              x: state.x,
              y: state.y,
              lift: 0,
              ro: state.yaw,
              bias: -0.45,
              submerge: EnvFeedback.calcSubmerge(1.5, habitat.waterLevel, 4.8, isWater)
            });

            if (state.mode === 'approach') {
              // 散籽演示动作中：新钩籽从桩旁抛物线弹跳回木桩顶
              const u = clamp(state.modeT / 0.95, 0, 1);
              const s = u * u * (3 - 2 * u);
              const hx = lerp(state.soloHopStartX, state.x, s);
              const hy = lerp(state.soloHopStartY, state.y, s);
              const hz = lerp(0.5, STUMP_TOP_Z * sMul, u) + Math.sin(u * Math.PI) * 11.5 * sMul;
              list.push({
                partKey: 'seedBurr',
                asset: parts.seedBurr,
                x: hx,
                y: hy,
                lift: hz,
                ro: wrapAngle(state.yaw + state.modeT * 11.0),
                symDeg: 90,
                bias: 1.85
              });
            } else {
              const topZ = STUMP_TOP_Z * sMul;
              list.push({
                partKey: 'rootPad',
                asset: parts.rootPad,
                x: state.x,
                y: state.y,
                lift: topZ,
                ro: state.yaw,
                bias: 0.75
              });
              const stageKey = parts[state.stage] ? state.stage : 'stageBloom';
              list.push({
                partKey: stageKey,
                asset: parts[stageKey],
                x: state.x + swayX * 0.48,
                y: state.y + swayY * 0.48,
                lift: topZ + 0.9 * sMul + swayZ * 0.45,
                ro: flowerYaw,
                bias: 1.25
              });
            }
          }

          // 正在空中/地面弹跳散落的倒钩小种子
          for (let i = 0; i < state.subSeeds.length; i++) {
            const b = state.subSeeds[i];
            list.push({
              partKey: 'seedBurr',
              asset: parts.seedBurr,
              x: b.x,
              y: b.y,
              lift: Math.max(0, b.z),
              ro: b.yaw,
              symDeg: 90,
              bias: state.hasHostEnv ? 2.05 : 1.50,
              submerge: EnvFeedback.calcSubmerge(b.z + 0.6, habitat.waterLevel, 3.6, isWater)
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Earth8Def.id,
            code: Earth8Def.code,
            name: Earth8Def.name,
            template: 'M36',
            noHost: true,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            mode: state.mode,
            stage: state.stage,
            hasHostEnv: state.hasHostEnv,
            footRadius: Earth8Def.footRadius,
            headZ: 28,
            centerZ: 14,
            blocks: Earth8Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Earth8Def);
})(window.PixelWorkshop);
