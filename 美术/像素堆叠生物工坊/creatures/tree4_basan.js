'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SpringDamper3D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 树4 · 吐火竹鸡（日本 Basan · v3 精制纯生态版，+Y 正前，z=0 贴地）
  //   1. 昂首挺胸的锦鸡/火鸡体态：饱满胸腹、多瓣鲜红大鸡冠、双瓣下颌红肉垂、
  //      独立可点动的长颈（3 档无损烘焙喉囊鼓胀）、张合双态锐利喙与清晰禽眼；
  //   2. 翅羽与宽大扇形尾羽雕成一片片层叠的细长竹叶质感（深翠 -> 青翠 -> 嫩青叶尖），
  //      常态收拢贴身，吐火与得意炫耀时微张颤动，关节枢轴全由 pivotToWorldXY 锁死；
  //   3. 2 条细长禽类反关节弯腿 + 三趾前叉与后趾鸟爪，迈步自带真实禽类「头颈先定住
  //      再前推」点步节律；
  //   4. 待机交互物：立体体素青绿竹桩（带竹节环、斜切顶口、侧边虫洞）+ 4 节蠕动嫩绿竹虫；
  //      循环：点步踱至竹桩前 -> 歪头细听 -> 喉囊鼓胀 -> 吐出淡青白低温冷火飘入虫洞 ->
  //      竹虫扭动爬出 -> 颈部闪电下啄叼起吞下 -> 得意抖动竹叶尾羽昂首散步 -> 自然复位。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 主躯干深翠竹羽
      bodyDark:     '#124a38',
      bodyMid:      '#217a59',
      bodyHi:       '#4eb382',
      // 深翠竹叶根羽
      leafDeepDark: '#0c362c',
      leafDeepMid:  '#185e4b',
      leafDeepHi:   '#349474',
      // 青翠竹叶中羽
      leafMidDark:  '#1c6943',
      leafMidMid:   '#37a363',
      leafMidHi:    '#74d68c',
      // 嫩青竹叶叶尖
      leafTipDark:  '#478f3c',
      leafTipMid:   '#82cc58',
      leafTipHi:    '#c8f285',
      // 胸腹暖米绒羽
      bellyDark:    '#8f8764',
      bellyMid:     '#c7be92',
      bellyHi:      '#ede5be',
      // 鲜红多瓣大鸡冠 & 下颌红肉垂
      combDark:     '#8a1420',
      combMid:      '#d92638',
      combHi:       '#ff6e75',
      // 锐利角质喙
      beakDark:     '#7a4b16',
      beakMid:      '#c9862a',
      beakHi:       '#f5c75d',
      // 禽类反关节弯腿与三趾爪
      legDark:      '#694722',
      legMid:       '#a87639',
      legHi:        '#dbac65',
      // 锐利禽眼（eyeGlint 严禁进 glowKeys）
      eyeDark:      '#11151d',
      eyeIris:      '#f2b129',
      eyeGlint:     '#f7fdff',
      // 立体青绿竹桩本体
      bambooDark:   '#1f5930',
      bambooMid:    '#3e8f4e',
      bambooHi:     '#7bc977',
      // 竹节环与斜切口竹肉
      ringDark:     '#7d7a47',
      ringMid:      '#bdb875',
      ringHi:       '#e8e4a8',
      // 虫洞深邃内壁
      holeDark:     '#18241b',
      // 圆滚滚嫩绿竹虫
      grubDark:     '#5b8a29',
      grubMid:      '#99d147',
      grubHi:       '#dcf78b',
      // 淡青白低温冷火（仅此 3 色进 glowKeys）
      coldFireMid:  '#4ad9e0',
      coldFireHot:  '#9cf7f5',
      coldFireCore: '#ebffff'
    },
    glowKeys: ['coldFireMid', 'coldFireHot', 'coldFireCore'],
    parts: [
      'body', 'leafDeep', 'leafMid', 'leafTip', 'belly',
      'comb', 'beak', 'leg', 'eye',
      'bamboo', 'ring', 'hole', 'grub', 'coldFire'
    ],
    noCrease: [
      ['body', 'belly'], ['body', 'leafDeep'], ['body', 'leafMid'],
      ['leafDeep', 'leafMid'], ['leafMid', 'leafTip'],
      ['body', 'comb'], ['body', 'beak'], ['body', 'eye'],
      ['body', 'leg'], ['bamboo', 'ring'], ['bamboo', 'hole'],
      ['grub', 'eye']
    ],
    materials: {
      body:     ['bodyDark',     'bodyMid',     'bodyHi'],
      leafDeep: ['leafDeepDark', 'leafDeepMid', 'leafDeepHi'],
      leafMid:  ['leafMidDark',  'leafMidMid',  'leafMidHi'],
      leafTip:  ['leafTipDark',  'leafTipMid',  'leafTipHi'],
      belly:    ['bellyDark',    'bellyMid',    'bellyHi'],
      comb:     ['combDark',     'combMid',     'combHi'],
      beak:     ['beakDark',     'beakMid',     'beakHi'],
      leg:      ['legDark',      'legMid',      'legHi'],
      bamboo:   ['bambooDark',   'bambooMid',   'bambooHi'],
      ring:     ['ringDark',     'ringMid',     'ringHi'],
      grub:     ['grubDark',     'grubMid',     'grubHi']
    },
    protectedParts: ['eye', 'comb', 'beak', 'coldFire']
  });

  // 4 套零重建模换色皮肤（含各自描边色与冷火/竹屑微粒配色）
  const SKINS = [
    {
      id: 'jade_comb',
      name: '翠竹朱冠（竹林经典）',
      dot: '#2ea366',
      outline: '#0b1a13',
      pal: {},
      fx: {
        fireOuter: '#5ce3e8',
        fireCore:  '#e8ffff',
        leaf:      '#76d687',
        crumb:     '#d8f288'
      }
    },
    {
      id: 'autumn_bamboo',
      name: '金秋竹叶（枯竹款）',
      dot: '#d49a38',
      outline: '#1c140a',
      pal: {
        bodyDark:     '#5e4219', bodyMid:     '#9e732b', bodyHi:     '#d6a952',
        leafDeepDark: '#4d3214', leafDeepMid: '#855823', leafDeepHi: '#bf8841',
        leafMidDark:  '#78591c', leafMidMid:  '#bf9232', leafMidHi:  '#f0c85e',
        leafTipDark:  '#9c7d29', leafTipMid:  '#dbb94b', leafTipHi:  '#fae58c',
        bellyDark:    '#8c7961', bellyMid:    '#c9b393', bellyHi:    '#f2e3c9',
        combDark:     '#7d161b', combMid:     '#c72c2e', combHi:     '#f56a62',
        beakDark:     '#57391a', beakMid:     '#946431', beakHi:     '#cfa063',
        legDark:      '#543b1e', legMid:      '#8c6435', legHi:      '#c49a62',
        coldFireMid:  '#69d4c4', coldFireHot: '#b5f5e6', coldFireCore: '#f2fffb'
      },
      fx: {
        fireOuter: '#7ae0cf',
        fireCore:  '#f0fffb',
        leaf:      '#e6be58',
        crumb:     '#f5e08a'
      }
    },
    {
      id: 'frost_plume',
      name: '霜青白羽（寒篁款）',
      dot: '#7ac7d9',
      outline: '#0d1720',
      pal: {
        bodyDark:     '#587080', bodyMid:     '#96b2c2', bodyHi:     '#d9ecf5',
        leafDeepDark: '#265363', leafDeepMid: '#438499', leafDeepHi: '#7cc0d4',
        leafMidDark:  '#427b8a', leafMidMid:  '#74b5c4', leafMidHi:  '#b8e6f0',
        leafTipDark:  '#7da9b5', leafTipMid:  '#b5dce6', leafTipHi:  '#ebfbff',
        bellyDark:    '#8c9da8', bellyMid:    '#c7d7e0', bellyHi:    '#f0f8fc',
        combDark:     '#912438', combMid:     '#db465c', combHi:     '#ff919e',
        beakDark:     '#6e5b3b', beakMid:     '#b59967', beakHi:     '#ebd4a2',
        legDark:      '#59544c', legMid:      '#918a7e', legHi:      '#c9c2b6',
        coldFireMid:  '#5cc4ff', coldFireHot: '#ade8ff', coldFireCore: '#f2fbff'
      },
      fx: {
        fireOuter: '#7ad4ff',
        fireCore:  '#f2fbff',
        leaf:      '#a8e0ed',
        crumb:     '#dcf5ff'
      }
    },
    {
      id: 'scarlet_crest',
      name: '赤绯焰冠（暖林款）',
      dot: '#d9483b',
      outline: '#1c0c0b',
      pal: {
        bodyDark:     '#631c1f', bodyMid:     '#a83333', bodyHi:     '#e0685c',
        leafDeepDark: '#47151c', leafDeepMid: '#7d242c', leafDeepHi: '#ba494a',
        leafMidDark:  '#8a341c', leafMidMid:  '#d15c2e', leafMidHi:  '#f79957',
        leafTipDark:  '#246e48', leafTipMid:  '#48ad72', leafTipHi:  '#8ce6a6',
        bellyDark:    '#9c7d63', bellyMid:    '#d9b593', bellyHi:    '#fae3c8',
        combDark:     '#9c2411', combMid:     '#eb4d1e', combHi:     '#ff9e4a',
        beakDark:     '#704514', beakMid:     '#bd7d26', beakHi:     '#f2be57',
        legDark:      '#5e381c', legMid:      '#995f32', legHi:      '#cf945d',
        coldFireMid:  '#4ce6cc', coldFireHot: '#a3fae8', coldFireCore: '#edfffb'
      },
      fx: {
        fireOuter: '#5cebd3',
        fireCore:  '#edfffb',
        leaf:      '#f08e54',
        crumb:     '#96ebad'
      }
    }
  ];

  // =========================================================================
  // 1. 真反关节 IK 禽类弯腿（羽绒大腿 / 细长跗跖段 / 三趾鸟爪，起点深嵌躯干、爪尖踩实地面）
  // =========================================================================
  function buildLegThigh(makeCanvas) {
    const m = new VoxelModel(6, 6, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, 4.8, 1.35, 1.85, mat('leafDeep'), partId.leafDeep, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 1.9 });
  }

  function buildLegShin(makeCanvas) {
    const m = new VoxelModel(5, 5, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 0.9, 0, 0, 4.6, 0.85, 0.98, mat('leg'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 1.1 });
  }

  function buildBirdFoot(makeCanvas) {
    const m = new VoxelModel(7, 9, 4, SPEC);
    const { mat, partId } = SPEC;
    // 三趾前叉鸟爪 + 短后趾 + 踝关节
    m.paintEllipsoid(0, 0.0, 1.6, 0.95, 1.05, 1.15, mat('leg'), partId.leg, true);
    m.paintCapsule(0, -0.1, 1.1,  0.0,  3.5, 0.85, 0.75, 0.52, mat('leg'), partId.leg, true);
    m.paintCapsule(0, -0.1, 1.1, -1.7,  2.6, 0.85, 0.68, 0.48, mat('leg'), partId.leg, true);
    m.paintCapsule(0, -0.1, 1.1,  1.7,  2.6, 0.85, 0.68, 0.48, mat('leg'), partId.leg, true);
    m.paintCapsule(0, -0.1, 1.1,  0.0, -2.0, 0.85, 0.65, 0.45, mat('leg'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.6 });
  }

  // =========================================================================
  // 2. 昂首挺胸火鸡/锦鸡主躯干（18×22×16，零小数缩放，背部层叠竹叶羽纹）
  // =========================================================================
  function buildTorso(makeCanvas) {
    const W = 18, D = 22, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-7.5, 7.5, -9.5, 9.5, 1, 14, (x, y, z, X, Y) => {
      // 昂挺的丰满胸膛（+Y 偏高）+ 圆润后腹 + 向上收束的颈根座
      const dChest = (Math.hypot(X / 5.7, (Y - 2.2) / 6.4, (z - 7.6) / 5.4) - 1.0) * 4.8;
      const dBack  = (Math.hypot(X / 5.2, (Y + 3.4) / 6.2, (z - 8.4) / 4.6) - 1.0) * 4.4;
      const dNeckBase = (Math.hypot(X / 3.2, (Y - 5.2) / 3.0, (z - 11.4) / 3.2) - 1.0) * 2.8;
      const d = smin(smin(dChest, dBack, 2.2), dNeckBase, 1.8);
      if (d > 0) return;

      // 胸腹暖绒 + 背部竹叶层叠羽纹
      const isBelly = z < 6.4 && Y > -2.8 && Math.abs(X) < 4.5;
      const leafStripe = Math.sin((Y + Math.abs(X) * 0.55) * 1.1);
      if (isBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (z >= 9.6 && Y < 3.6 && leafStripe > 0.15) {
        m.setRaw(x, y, z, mat('leafMid'), partId.leafMid);
      } else if (z >= 8.2 && Y < 4.5 && leafStripe < -0.25) {
        m.setRaw(x, y, z, mat('leafDeep'), partId.leafDeep);
      } else {
        m.setRaw(x, y, z, mat('body'), partId.body);
      }
    });

    // 背脊 3 层人字竹叶披肩羽片（微凸 0.9 格，呈现层叠竹叶质感）
    for (let i = 0; i < 3; i++) {
      const ty = 2.6 - i * 3.0;
      const tz = 12.6 - i * 0.45;
      const span = 4.2 - i * 0.45;
      const matName = i === 0 ? 'leafDeep' : (i === 1 ? 'leafMid' : 'leafTip');
      m.paintCapsule(-span, ty - 1.2, tz - 0.5, 0, ty + 0.6, tz + 0.35, 0.85, 0.95, mat(matName), partId[matName], true);
      m.paintCapsule( span, ty - 1.2, tz - 0.5, 0, ty + 0.6, tz + 0.35, 0.85, 0.95, mat(matName), partId[matName], true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.8, headZ: 15, centerZ: 8 });
  }

  // =========================================================================
  // 3. 层叠细长竹叶翅羽（左/右独立，10×18×12，枢轴锁在肩根）
  // =========================================================================
  const WING_PIVOT = { x: 2.2, y: 4.8 };
  function buildWing(makeCanvas, side) {
    const m = new VoxelModel(10, 18, 12, SPEC);
    const { mat, partId } = SPEC;
    const rx = -side * WING_PIVOT.x;
    const ry = WING_PIVOT.y;

    // 翅根覆羽
    m.paintEllipsoid(rx + side * 1.2, ry - 1.0, 6.2, 1.8, 3.0, 2.5, mat('leafDeep'), partId.leafDeep, true);

    // 4 片层叠细长竹叶飞羽（上短下长、由深翠过渡到嫩青尖）
    const blades = [
      { ox: 1.4, oy: -0.6, oz: 7.4, tx: 2.4, ty: -6.2, tz: 7.0, r0: 1.15, r1: 0.48, mat: 'leafDeep' },
      { ox: 1.7, oy: -1.4, oz: 6.0, tx: 3.0, ty: -8.8, tz: 5.5, r0: 1.15, r1: 0.45, mat: 'leafMid'  },
      { ox: 1.8, oy: -2.0, oz: 4.6, tx: 3.1, ty: -10.8, tz: 4.2, r0: 1.10, r1: 0.42, mat: 'leafMid'  },
      { ox: 1.5, oy: -2.4, oz: 3.4, tx: 2.6, ty: -11.6, tz: 3.2, r0: 0.95, r1: 0.38, mat: 'leafTip'  }
    ];
    for (const b of blades) {
      const mx = rx + side * lerp(b.ox, b.tx, 0.55);
      const my = ry + lerp(b.oy, b.ty, 0.55);
      const mz = lerp(b.oz, b.tz, 0.55);
      m.paintCapsule(rx + side * b.ox, ry + b.oy, b.oz, mx, my, mz, b.r0, b.r0 * 0.82, mat(b.mat), partId[b.mat], true);
      m.paintCapsule(mx, my, mz, rx + side * b.tx, ry + b.ty, b.tz, b.r0 * 0.78, b.r1, mat('leafTip'), partId.leafTip, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 10, centerZ: 5 });
  }

  // =========================================================================
  // 4. 宽大层叠竹叶扇形尾羽（20×18×16，枢轴锁在尾根 (0, 5.4)）
  // =========================================================================
  const TAIL_PIVOT = { x: 0, y: 5.4 };
  function buildTail(makeCanvas) {
    const m = new VoxelModel(20, 18, 16, SPEC);
    const { mat, partId } = SPEC;

    // 尾根承托覆羽
    m.paintEllipsoid(0, 4.8, 3.8, 3.0, 2.4, 2.2, mat('leafDeep'), partId.leafDeep, true);

    // 7 片高辨识度细长竹叶扇形尾羽（昂扬上翘，由深翠 -> 青翠 -> 嫩青尖端收细）
    const leaves = [
      { ox:  0.0, tx:  0.0, ty: -7.4, tz: 13.8, r0: 1.30, r1: 0.45 },
      { ox: -1.2, tx: -3.2, ty: -6.8, tz: 12.6, r0: 1.22, r1: 0.44 },
      { ox:  1.2, tx:  3.2, ty: -6.8, tz: 12.6, r0: 1.22, r1: 0.44 },
      { ox: -2.1, tx: -6.0, ty: -5.4, tz: 10.6, r0: 1.15, r1: 0.42 },
      { ox:  2.1, tx:  6.0, ty: -5.4, tz: 10.6, r0: 1.15, r1: 0.42 },
      { ox: -2.8, tx: -8.0, ty: -3.2, tz:  8.2, r0: 1.05, r1: 0.40 },
      { ox:  2.8, tx:  8.0, ty: -3.2, tz:  8.2, r0: 1.05, r1: 0.40 }
    ];
    for (const lf of leaves) {
      const m1x = lerp(lf.ox, lf.tx, 0.38), m1y = lerp(4.8, lf.ty, 0.38), m1z = lerp(4.0, lf.tz, 0.38);
      const m2x = lerp(lf.ox, lf.tx, 0.72), m2y = lerp(4.8, lf.ty, 0.72), m2z = lerp(4.0, lf.tz, 0.72);
      m.paintCapsule(lf.ox, 4.8, 4.0, m1x, m1y, m1z, lf.r0, lf.r0 * 0.92, mat('leafDeep'), partId.leafDeep, true);
      m.paintCapsule(m1x, m1y, m1z, m2x, m2y, m2z, lf.r0 * 0.92, lf.r0 * 0.76, mat('leafMid'), partId.leafMid, true);
      m.paintCapsule(m2x, m2y, m2z, lf.tx, lf.ty, lf.tz, lf.r0 * 0.72, lf.r1, mat('leafTip'), partId.leafTip, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 15, centerZ: 7 });
  }

  // =========================================================================
  // 5. 独立可点动长颈 + 3 档无损烘焙喉囊鼓胀（normal / puff1 / puff2）
  //    枢轴锁在颈根 (0, -1.4)，彻底告别小数缩放拉伸
  // =========================================================================
  const NECK_PIVOT = { x: 0, y: -1.4 };
  function buildNeck(makeCanvas, stage) {
    const puff = stage === 'puff2' ? 2 : (stage === 'puff1' ? 1 : 0);
    const W = 12 + puff * 2, D = 14 + puff * 2, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 颈根领羽（一圈青翠竹叶小颈羽）
    m.paintEllipsoid(0, -1.2, 2.6, 3.0, 3.0, 2.2, mat('leafMid'), partId.leafMid, true);
    // 挺拔微弯的禽类长颈（S 形微前探）
    m.paintCapsule(0, -1.2, 2.4, 0, -0.4, 6.8, 2.45, 2.15, mat('body'), partId.body, true);
    m.paintCapsule(0, -0.4, 6.8, 0,  0.8, 11.4, 2.10, 1.90, mat('body'), partId.body, true);

    // 喉囊鼓胀（3 档无损烘焙，puff2 时喉前透出一点冷火微亮纹）
    if (puff === 0) {
      m.paintEllipsoid(0, 1.4, 5.8, 1.65, 1.55, 2.4, mat('belly'), partId.belly, true);
    } else if (puff === 1) {
      m.paintEllipsoid(0, 2.1, 6.0, 2.75, 2.65, 3.0, mat('belly'), partId.belly, true);
      m.paintEllipsoid(0, 3.2, 6.2, 1.45, 1.35, 1.6, mat('comb'), partId.comb, true);
    } else {
      m.paintEllipsoid(0, 2.7, 6.2, 3.85, 3.65, 3.5, mat('belly'), partId.belly, true);
      m.paintEllipsoid(0, 4.3, 6.4, 2.05, 1.95, 2.1, keyToId.coldFireMid, partId.coldFire, true);
      m.paintEllipsoid(0, 4.9, 6.6, 1.10, 1.10, 1.1, keyToId.coldFireHot, partId.coldFire, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 13, centerZ: 6 });
  }

  // =========================================================================
  // 6. 独立锦鸡头部（normal / open 双态无损烘焙，12×18×15）
  //    头顶鲜红饱满多瓣大鸡冠 + 下颌双瓣红肉垂 + 锐利角质喙 + 2×2 锐利禽眼
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -1.8 };
  function buildHead(makeCanvas, pose) {
    const isOpen = pose === 'open';
    const W = 12, D = 18, H = 15;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 饱满禽类头颅
    m.paintEllipsoid(0, 0.0, 5.2, 3.25, 3.85, 3.35, mat('body'), partId.body, true);
    // 后枕竹叶绒羽微翘
    m.paintCapsule(0, -2.4, 5.2, 0, -4.8, 4.2, 1.45, 0.72, mat('leafMid'), partId.leafMid, true);

    // 鲜红饱满多瓣大鸡冠（4 瓣高低错落，从额前延续到后顶，轮廓一眼认出公鸡/火鸡冠）
    const lobes = [
      { y:  2.4, z:  8.6, rx: 1.05, ry: 1.35, rz: 1.85 },
      { y:  0.6, z:  9.8, rx: 1.15, ry: 1.45, rz: 2.35 },
      { y: -1.4, z:  9.5, rx: 1.10, ry: 1.40, rz: 2.20 },
      { y: -3.2, z:  8.4, rx: 0.98, ry: 1.28, rz: 1.75 }
    ];
    for (const lb of lobes) {
      m.paintEllipsoid(0, lb.y, lb.z, lb.rx, lb.ry, lb.rz, mat('comb'), partId.comb, true);
    }

    // 下颌双瓣鲜红肉垂（垂挂在喙根下方左右两侧）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.1, 2.4, 3.4, s * 1.25, 2.9, 1.0, 0.92, 1.08, mat('comb'), partId.comb, true);
    }

    // 锐利角质喙（open 态上下喙明显张开用于吐冷火与闪电啄虫）
    if (isOpen) {
      m.paintCapsule(0, 3.0, 5.8, 0, 7.6, 6.4, 1.32, 0.45, mat('beak'), partId.beak, true);
      m.paintCapsule(0, 2.9, 4.2, 0, 6.8, 3.2, 1.12, 0.42, mat('beak'), partId.beak, true);
    } else {
      m.paintCapsule(0, 3.0, 5.2, 0, 7.7, 4.7, 1.38, 0.46, mat('beak'), partId.beak, true);
      m.paintCapsule(0, 3.0, 4.6, 0, 6.7, 4.4, 1.10, 0.42, mat('beak'), partId.beak, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 独立 2×2 锐利禽眼（自动贴合头侧表面，eyeGlint 严禁进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 1.6);
    const eyeZ = 6;
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 5; step++) {
        const tx = Math.round(hw + s * (3.8 - step));
        if (m.getPartId(tx, eyeY, eyeZ) === partId.body) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 2.6);
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dy === 1)
            ? keyToId.eyeGlint
            : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 14, centerZ: 6 });
  }

  // =========================================================================
  // 7. 蓬松淡青白低温冷火团（2 档体素云团，symDeg: 90，设计半透用 opacity）
  // =========================================================================
  function buildColdFire(makeCanvas, large) {
    const S = large ? 12 : 9;
    const m = new VoxelModel(S, S, S, SPEC);
    const { partId, keyToId } = SPEC;
    const rOuter = large ? 3.8 : 2.6;
    const rMid = large ? 2.5 : 1.7;
    const cz = S * 0.46;

    // 蓬松多层冷火云团 + 上翘火舌
    m.paintEllipsoid(0, 0, cz, rOuter, rOuter, rOuter * 0.92, keyToId.coldFireMid, partId.coldFire, true);
    m.paintEllipsoid(0, 0, cz + rOuter * 0.55, rOuter * 0.58, rOuter * 0.58, rOuter * 0.72, keyToId.coldFireMid, partId.coldFire, true);
    m.paintEllipsoid(0, 0, cz, rMid, rMid, rMid * 0.95, keyToId.coldFireHot, partId.coldFire, true);
    m.paintEllipsoid(0, 0, cz + 0.3, rMid * 0.55, rMid * 0.55, rMid * 0.55, keyToId.coldFireCore, partId.coldFire, true);

    m.despeckle();
    return m.toStripAsset(makeCanvas, { footRadius: rOuter, headZ: S - 1, centerZ: Math.round(cz) });
  }

  // =========================================================================
  // 8. 待机交互物 A：立体体素青绿竹桩（14×14×18）
  //    带双道竹节环、顶口斜切空心断面、朝 -Y 侧边虫洞与一枝小竹叶
  // =========================================================================
  function buildBambooStump(makeCanvas) {
    const W = 14, D = 14, H = 18;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-6.0, 6.0, -6.0, 6.0, 0, 16, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      // 顶口斜切面：Y 越靠前越高，形成经典竹筒斜切造型
      const topCut = 13.4 + Y * 0.52;
      if (z > topCut) return;

      // 两道竹节环微凸（z=4 与 z=10）
      const isNode = (z === 4 || z === 10);
      const outerR = isNode ? 4.55 : 4.05;
      const innerR = 2.45;
      if (r > outerR) return;

      // 侧边虫洞（朝 -Y 面向竹鸡，洞心在 y=-3.8, z=7.5）
      const inHole = (Y < -1.2 && Math.hypot(X / 1.85, (z - 7.5) / 1.95) <= 1.0);
      if (inHole) {
        if (r > innerR + 0.5) return; // 挖穿外壁露出深色洞膛
      }

      // 空心竹筒内腔（z >= 10 以上与虫洞后方呈现深色空腔）
      if (r < innerR && z >= 6) {
        if (z <= 9 && Y < 0.8) {
          m.setRaw(x, y, z, keyToId.holeDark, partId.hole);
        }
        return;
      }

      // 顶口斜切淡黄竹肉边缘 & 虫洞口啃痕 & 竹节环
      const nearTopCut = z > topCut - 1.15;
      const nearHoleRim = (Y < -1.4 && Math.hypot(X / 2.45, (z - 7.5) / 2.55) <= 1.0 && !inHole);
      if (isNode || nearTopCut || nearHoleRim) {
        m.setRaw(x, y, z, mat('ring'), partId.ring);
      } else {
        m.setRaw(x, y, z, mat('bamboo'), partId.bamboo);
      }
    });

    // 竹桩背面 (+Y) 萌出两片嫩绿小竹叶，增加轮廓辨识度
    m.paintCapsule(2.6, 2.8, 10.2, 5.2, 4.6, 12.8, 0.72, 0.36, mat('leafMid'), partId.leafMid, true);
    m.paintCapsule(2.4, 3.0, 10.6, 4.4, 5.4, 14.6, 0.65, 0.32, mat('leafTip'), partId.leafTip, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8, headZ: 17, centerZ: 8 });
  }

  // =========================================================================
  // 9. 待机交互物 B：圆滚滚嫩绿竹虫（4 节蠕动小虫体：头节 + 3 节圆体节）
  // =========================================================================
  function buildGrubSeg(makeCanvas, isHead) {
    const S = isHead ? 6 : 5;
    const m = new VoxelModel(S, S, S, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const r = isHead ? 1.75 : 1.55;
    m.paintEllipsoid(0, 0, r + 0.5, r, r, r * 0.92, mat('grub'), partId.grub, true);
    m.despeckle();
    m.applyArtShading(true);
    if (isHead) {
      // 小竹虫一对豆豆黑眼
      m.setRaw(1, S - 2, Math.round(r + 1), keyToId.eyeDark, partId.eye);
      m.setRaw(S - 2, S - 2, Math.round(r + 1), keyToId.eyeDark, partId.eye);
    }
    return m.toStripAsset(makeCanvas, { footRadius: r, headZ: S - 1, centerZ: Math.round(r + 0.5) });
  }

  // =========================================================================
  // Def 注册对象
  // =========================================================================
  const Tree4Def = {
    id: 'tree4_basan',
    code: '树4',
    name: '树4 · 吐火竹鸡',
    status: 'done',
    tag: '竹叶锦鸡 · 吐冷火啄竹虫',
    summary: 'v3 精制：鲜红多瓣大鸡冠 + 细长层叠竹叶翅尾 + 3 档无损喉囊鼓胀 + 真实禽类点步 + 青绿竹桩与嫩绿竹虫自循环吐火啄食交互',
    defaultHabitat: 'bamboo',
    footRadius: 7.4,
    ecoWeight: 0.78,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '昂首锦鸡体态', '多瓣大鸡冠与红肉垂', '层叠竹叶翅尾',
      '3 档喉囊鼓胀吐冷火', '禽类点步 2 足 IK', '青绿竹桩与嫩绿竹虫交互'
    ],
    soulHabit: '点步踱至青绿竹桩前 -> 歪头细听虫洞 -> 喉囊鼓胀吐出淡青白低温冷火 -> 逼出蠕动嫩绿竹虫 -> 闪电下啄吞下并得意抖尾',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legThigh:    buildLegThigh(makeCanvas),
        legShin:     buildLegShin(makeCanvas),
        footClaw:    buildBirdFoot(makeCanvas),
        torso:       buildTorso(makeCanvas),
        wingL:       buildWing(makeCanvas, -1),
        wingR:       buildWing(makeCanvas,  1),
        tailFan:     buildTail(makeCanvas),
        neckNormal:  buildNeck(makeCanvas, 'normal'),
        neckPuff1:   buildNeck(makeCanvas, 'puff1'),
        neckPuff2:   buildNeck(makeCanvas, 'puff2'),
        headNormal:  buildHead(makeCanvas, 'normal'),
        headOpen:    buildHead(makeCanvas, 'open'),
        coldFireSm:  buildColdFire(makeCanvas, false),
        coldFireLg:  buildColdFire(makeCanvas, true),
        bambooStump: buildBambooStump(makeCanvas),
        grubHead:    buildGrubSeg(makeCanvas, true),
        grubBody:    buildGrubSeg(makeCanvas, false)
      };

      // 2 足禽类反关节 IK 步态（hipZ=9.2 深嵌躯干底腹，bendDir=-1 真实向后反折！）
      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.6, hipY: -0.4, hipZ: 9.2, restX: -2.8, restY: 0.2, group: 0, L1: 4.8, L2: 5.2, bendDir: -1 },
        { id: 'R', hipX:  2.6, hipY: -0.4, hipZ: 9.2, restX:  2.8, restY: 0.2, group: 1, L1: 4.8, L2: 5.2, bendDir: -1 }
      ], { mode: 'biped', stepThreshold: 2.3, stepDuration: 0.16, stepHeight: 1.9, strideAnticipation: 0.44 });

      const headYawSpring    = new SpringDamper1D(0, 155, 9.2);
      const headBobSpring    = new SpringDamper1D(0, 180, 9.8);
      const neckDipSpring    = new SpringDamper1D(0, 165, 8.6);
      const wingSpreadSpring = new SpringDamper1D(0, 110, 6.8);
      const tailWagSpring    = new SpringDamper1D(0, 105, 5.6);
      const bodyBobSpring    = new SpringDamper1D(0, 170, 8.4);
      const throatSpring     = new SpringDamper1D(0, 95, 7.4);

      // 4 节嫩绿竹虫位置缓存
      const grubNodes = Array.from({ length: 4 }, () => new SpringDamper3D(0, 0, 7.5, 140, 9.5));

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
        stepPhase: 0,
        stepSign: 1,
        // 青绿竹桩锚点（相对初始出生点侧前方，确保原地待机与巡游都清晰可观且不穿模）
        stumpX: homeX0 + 15.0,
        stumpY: homeY0 + 10.0,
        stumpYaw: homeYaw0,
        // 交互状态机：
        // 'roam' -> 'approach' -> 'listen' -> 'puff' -> 'breathe' -> 'emerge' -> 'peck' -> 'proud'
        stage: 'listen',
        stageTimer: 1.4,
        listenLookFlip: 0,
        neckStage: 'normal', // 'normal' | 'puff1' | 'puff2'
        headPose: 'normal',  // 'normal' | 'open'
        // 低温冷火团状态
        fireActive: false,
        fireProgress: 0,
        fireX: 0, fireY: 0, fireZ: 14,
        fireStartX: 0, fireStartY: 0, fireStartZ: 14,
        fireEndX: 0, fireEndY: 0, fireEndZ: 7.5,
        fireVfxCd: 0,
        // 竹虫状态：'hidden' | 'peek' | 'out' | 'caught' | 'eaten'
        grubMode: 'peek',
        grubOutT: 0,
        peckSwallowed: false,
        proudBurstDone: false
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function updateStumpAnchor(hx, hy, hyaw, sMul) {
        // 将竹桩稳稳安放在出生点前方偏右，虫洞(-Y)朝向站位点
        const [sx, sy] = localToWorldXY(hx, hy, hyaw, 7.5 * sMul, 16.5 * sMul);
        state.stumpX = sx;
        state.stumpY = sy;
        // 虫洞位于竹桩局部 -Y，故令 stumpYaw 指向“从站位点看向竹桩”的反方向使虫洞正对竹鸡
        const dx = sx - hx, dy = sy - hy;
        state.stumpYaw = Math.atan2(-dx, dy);
      }

      function getHoleWorldPos(sMul) {
        const [hx, hy] = localToWorldXY(state.stumpX, state.stumpY, state.stumpYaw, 0, -4.1 * sMul);
        return [hx, hy, 7.5 * sMul];
      }

      function getStandSpot(sMul) {
        // 竹鸡站在虫洞正前方 14.5 格处，保证长颈、张喙与冷火团均有清晰空隙绝不穿模
        const [sx, sy] = localToWorldXY(state.stumpX, state.stumpY, state.stumpYaw, 0, -15.5 * sMul);
        return [sx, sy];
      }

      function steerToward(tx, ty, dt, speedMul, maxTurnRate) {
        const dx = tx - state.x, dy = ty - state.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.6) {
          const aimYaw = Math.atan2(-dx, dy);
          const diff = wrapAngle(aimYaw - state.yaw);
          state.yaw = wrapAngle(state.yaw + clamp(diff, -maxTurnRate * dt, maxTurnRate * dt));
          const align = clamp(Math.cos(diff), 0.12, 1.0);
          const spd = Math.min(dist * 2.8, 16.5 * speedMul) * align;
          const fx = -Math.sin(state.yaw), fy = Math.cos(state.yaw);
          const k = expSmooth(dt, 7.0);
          state.vx = lerp(state.vx, fx * spd, k);
          state.vy = lerp(state.vy, fy * spd, k);
        } else {
          const k = expSmooth(dt, 9.0);
          state.vx = lerp(state.vx, 0, k);
          state.vy = lerp(state.vy, 0, k);
        }
        state.x += state.vx * dt;
        state.y += state.vy * dt;
        return dist;
      }

      const instance = {
        def: Tree4Def,
        cachePrefix: `tree4_bs_${Math.random().toString(36).slice(2, 7)}`,
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
          updateStumpAnchor(homeX, homeY, homeYaw, sMul);
          const [standX, standY] = getStandSpot(sMul);
          state.x = standX;
          state.y = standY;
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = state.stumpYaw;
          state.stage = 'listen';
          state.stageTimer = 1.25;
          state.listenLookFlip = 0;
          state.neckStage = 'normal';
          state.headPose = 'normal';
          state.fireActive = false;
          state.fireProgress = 0;
          state.grubMode = 'peek';
          state.grubOutT = 0;
          state.peckSwallowed = false;
          state.proudBurstDone = false;

          headYawSpring.x = headYawSpring.v = 0;
          headBobSpring.x = headBobSpring.v = 0;
          neckDipSpring.x = neckDipSpring.v = 0;
          wingSpreadSpring.x = wingSpreadSpring.v = 0;
          tailWagSpring.x = tailWagSpring.v = 0;
          bodyBobSpring.x = bodyBobSpring.v = 0;
          throatSpring.x = throatSpring.v = 0;

          gait.reset(state.x, state.y, state.yaw);
          const [hx, hy, hz] = getHoleWorldPos(sMul);
          for (const nd of grubNodes) nd.reset(hx, hy, hz);
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
          updateStumpAnchor(hxHome, hyHome, hyawHome, sMul);

          const [holeX, holeY, holeZ] = getHoleWorldPos(sMul);
          const [standX, standY] = getStandSpot(sMul);

          // -----------------------------------------------------------------
          // 1. 生态与交互状态机：
          //    巡游模式：roam (林间点步巡游) -> approach (踱至竹桩前) ->
          //             listen -> puff -> breathe -> emerge -> peck -> proud -> roam
          //    待机模式：稳步停在竹桩前直接循环 listen -> puff -> breathe -> emerge -> peck -> proud
          // -----------------------------------------------------------------
          if (isIdle && state.stage === 'roam') {
            state.stage = 'approach';
            state.stageTimer = 2.6;
          }

          state.stageTimer -= dt;
          let targetThroat = 0;
          let targetWingSpread = 0;
          let targetNeckDip = 0;
          let targetHeadYaw = 0;
          let targetTailWag = Math.sin(time * 2.2 * gFreq) * 0.08 * flex;
          state.headPose = 'normal';

          if (state.stage === 'roam') {
            Propulsion.multiLegWalk(state, dt, time, { ...params, speed: spdMul * 0.90 }, {
              ...eco, walkStyle: 'scurry', baseLift: 0
            });
            // 巡游避让竹桩，防止穿模撞进竹桩里
            const dxSt = state.x - state.stumpX, dySt = state.y - state.stumpY;
            const dSt = Math.hypot(dxSt, dySt) || 0.01;
            const minStDist = 11.5 * sMul;
            if (dSt < minStDist) {
              state.x = state.stumpX + (dxSt / dSt) * minStDist;
              state.y = state.stumpY + (dySt / dSt) * minStDist;
            }
            state.grubMode = 'hidden';
            state.grubOutT = 0;
            state.fireActive = false;
            targetHeadYaw = Math.sin(time * 1.9) * 0.16;

            if (state.stageTimer <= 0) {
              state.stage = 'approach';
              state.stageTimer = 4.5;
            }
          } else if (state.stage === 'approach') {
            const aimHole = Math.atan2(-(holeX - standX), holeY - standY);
            const walkRes = Propulsion.walkToPoint(state, standX, standY, dt, params, {
              arriveDist: 2.2 * sMul,
              maxSpeed: 13.5,
              maxTurn: 4.2,
              aimYaw: aimHole,
              baseLift: 0
            });
            state.grubMode = 'peek';
            state.grubOutT = 0.08;
            state.fireActive = false;
            if (walkRes.arrived || state.stageTimer <= 0) {
              state.stage = 'listen';
              state.stageTimer = 1.45;
              state.listenLookFlip = 0;
            }
          } else {
            // 竹桩前交互阶段：自然停步收脚并面朝虫洞（告别横移滑冰）
            const aimHole = Math.atan2(-(holeX - state.x), holeY - state.y);
            Propulsion.walkToPoint(state, standX, standY, dt, params, {
              arriveDist: 2.6 * sMul,
              maxSpeed: 10.0,
              maxTurn: 4.5,
              aimYaw: aimHole,
              baseLift: 0
            });

            if (state.stage === 'listen') {
              // 歪头细听虫洞动静（两次干脆的禽类侧头顿挫）
              state.grubMode = 'peek';
              state.grubOutT = 0.14 + Math.sin(time * 5.0) * 0.04;
              const u = clamp(1 - state.stageTimer / 1.45, 0, 1);
              if (u < 0.42) targetHeadYaw = -0.44;
              else if (u < 0.82) targetHeadYaw = 0.42;
              else targetHeadYaw = 0;
              targetNeckDip = 0.18;
              if (state.stageTimer <= 0) {
                state.stage = 'puff';
                state.stageTimer = 0.85;
              }
            } else if (state.stage === 'puff') {
              // 喉囊鼓胀蓄气，竹叶翅微张、尾羽轻抬
              state.grubMode = 'peek';
              state.grubOutT = 0.14;
              targetThroat = 1.0;
              targetWingSpread = 0.36;
              targetNeckDip = -0.15;
              targetTailWag = 0.18 * flex;
              if (state.stageTimer <= 0) {
                state.stage = 'breathe';
                state.stageTimer = 1.05;
                state.fireActive = true;
                state.fireProgress = 0;
                const [bx, by] = localToWorldXY(state.x, state.y, state.yaw, 0, 8.2 * sMul);
                state.fireStartX = bx;
                state.fireStartY = by;
                state.fireStartZ = 15.2 * sMul;
                state.fireEndX = holeX;
                state.fireEndY = holeY;
                state.fireEndZ = holeZ;
                state.fireX = bx; state.fireY = by; state.fireZ = state.fireStartZ;
                wingSpreadSpring.impulse(5.5 * sp);
              }
            } else if (state.stage === 'breathe') {
              // 张喙吐出淡青白低温冷火飘进虫洞（不伤竹桩）
              const u = clamp(1 - state.stageTimer / 1.05, 0, 1);
              state.headPose = 'open';
              targetThroat = lerp(1.0, 0.25, u);
              targetWingSpread = 0.52;
              targetNeckDip = 0.25;
              targetTailWag = Math.sin(u * Math.PI * 3) * 0.22 * flex;

              state.fireActive = true;
              state.fireProgress = u;
              const eased = smoothstep(0, 1, u);
              state.fireX = lerp(state.fireStartX, state.fireEndX, eased);
              state.fireY = lerp(state.fireStartY, state.fireEndY, eased);
              state.fireZ = lerp(state.fireStartZ, state.fireEndZ, eased) + Math.sin(eased * Math.PI) * 2.4 * sMul;

              state.fireVfxCd -= dt;
              if (vfx && state.fireVfxCd <= 0) {
                state.fireVfxCd = 0.08;
                const fx = curSkin.fx || SKINS[0].fx;
                vfx.spawnParticle(
                  state.fireX + (Math.random() - 0.5) * 2.0 * sMul,
                  state.fireY + (Math.random() - 0.5) * 2.0 * sMul,
                  state.fireZ + (Math.random() - 0.5) * 1.5 * sMul,
                  (Math.random() - 0.5) * 5.0 * sMul,
                  (Math.random() - 0.5) * 5.0 * sMul,
                  (4.0 + Math.random() * 6.0) * sMul,
                  0.45 + Math.random() * 0.25,
                  1.25 + Math.random() * 0.5,
                  Math.random() < 0.45 ? fx.fireCore : fx.fireOuter,
                  true,
                  -4
                );
              }

              if (state.stageTimer <= 0) {
                state.stage = 'emerge';
                state.stageTimer = 0.95;
                state.fireActive = false;
                state.grubMode = 'out';
                // 虫洞口散出一圈清凉青白冷烟
                if (vfx) {
                  const fx = curSkin.fx || SKINS[0].fx;
                  for (let k = 0; k < 6; k++) {
                    const a = (k / 6) * TAU + Math.random() * 0.4;
                    vfx.spawnParticle(
                      holeX, holeY, holeZ,
                      Math.cos(a) * 6.5 * sMul, Math.sin(a) * 6.5 * sMul, (5 + Math.random() * 5) * sMul,
                      0.55, 1.4, k % 2 === 0 ? fx.fireCore : fx.fireOuter, true, -3
                    );
                  }
                }
              }
            } else if (state.stage === 'emerge') {
              // 嫩绿竹虫被冷火逼得扭动爬出竹节虫洞，竹鸡盯紧蓄势
              const u = clamp(1 - state.stageTimer / 0.95, 0, 1);
              state.grubMode = 'out';
              state.grubOutT = smoothstep(0, 1, u);
              targetWingSpread = 0.24;
              targetNeckDip = 0.35 * u;
              targetHeadYaw = Math.sin(u * Math.PI * 2) * 0.14;
              if (state.stageTimer <= 0) {
                state.stage = 'peck';
                state.stageTimer = 0.68;
                state.peckSwallowed = false;
                neckDipSpring.impulse(16.0 * sp);
                headBobSpring.impulse(14.0 * sp);
              }
            } else if (state.stage === 'peck') {
              // 颈部闪电下啄一口叼起嫩绿竹虫吞下
              const u = clamp(1 - state.stageTimer / 0.68, 0, 1);
              if (u < 0.42) {
                state.headPose = 'open';
                targetNeckDip = 1.0;
                state.grubMode = 'out';
                state.grubOutT = 1.0;
              } else if (u < 0.78) {
                state.headPose = 'normal';
                targetNeckDip = lerp(1.0, -0.28, (u - 0.42) / 0.36);
                state.grubMode = 'caught';
              } else {
                targetNeckDip = -0.18;
                state.grubMode = 'eaten';
                if (!state.peckSwallowed) {
                  state.peckSwallowed = true;
                  throatSpring.impulse(4.8 * sp);
                  if (vfx) {
                    const fx = curSkin.fx || SKINS[0].fx;
                    for (let k = 0; k < 5; k++) {
                      const a = (k / 5) * TAU;
                      vfx.spawnParticle(
                        holeX, holeY, holeZ + 2 * sMul,
                        Math.cos(a) * 5 * sMul, Math.sin(a) * 5 * sMul, 6 * sMul,
                        0.42, 1.1, fx.crumb, false, 14
                      );
                    }
                  }
                }
              }
              if (state.stageTimer <= 0) {
                state.stage = 'proud';
                state.stageTimer = 1.55;
                state.proudBurstDone = false;
                tailWagSpring.impulse(12.0 * sp * flex);
                wingSpreadSpring.impulse(6.5 * sp);
              }
            } else if (state.stage === 'proud') {
              // 得意抖动竹叶尾羽、轻展竹叶翅、昂首炫耀
              state.grubMode = 'eaten';
              const u = clamp(1 - state.stageTimer / 1.55, 0, 1);
              targetWingSpread = Math.sin(u * Math.PI) * 0.42;
              targetTailWag = Math.sin(time * 16.0 * gFreq) * 0.42 * (1 - u * 0.5) * flex;
              targetNeckDip = -0.22 * Math.sin(u * Math.PI);
              targetHeadYaw = Math.sin(u * Math.PI * 2) * 0.25;
              if (!state.proudBurstDone && u > 0.25 && vfx) {
                state.proudBurstDone = true;
                const fx = curSkin.fx || SKINS[0].fx;
                const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw, 0, -9.0 * sMul);
                for (let k = 0; k < 4; k++) {
                  const a = (k / 4) * TAU + Math.random() * 0.5;
                  vfx.spawnParticle(
                    tx, ty, 12 * sMul,
                    Math.cos(a) * 6 * sMul, Math.sin(a) * 6 * sMul, 7 * sMul,
                    0.62, 1.15, fx.leaf, false, 8
                  );
                }
              }
              if (state.stageTimer <= 0) {
                // 自然复位：巡游模式下去竹林散步一圈，待机模式下原地稍作停顿开启下一轮
                state.grubMode = 'peek';
                state.grubOutT = 0.08;
                if (patrol) {
                  state.stage = 'roam';
                  state.stageTimer = 5.2 + Math.random() * 2.4;
                } else {
                  state.stage = 'listen';
                  state.stageTimer = 1.55;
                }
              }
            }
          }

          state.z = 0;

          // -----------------------------------------------------------------
          // 2. 2 足禽类步态 + 真实「头颈先定住再前推」点步节律
          // -----------------------------------------------------------------
          const moveSpd = Math.hypot(state.vx, state.vy);
          const walking = moveSpd > 1.2;
          if (walking) {
            state.stepPhase += dt * (4.8 + moveSpd * 0.48) * gFreq;
          }

          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 1.25,
            stepHeight: 1.9 * sMul * (0.75 + flex * 0.25),
            stepThreshold: 2.3 * sMul
          });
          state.tiltX = lerp(state.tiltX || 0, gaitRes.tiltX * 0.65 * sMul, expSmooth(dt, 14));
          state.tiltY = lerp(state.tiltY || 0, gaitRes.tiltY * 0.65 * sMul, expSmooth(dt, 14));

          // 温和钳位双足相对理想落点偏移，保护极限转弯不脱节
          const maxFootOff = 4.2 * sMul;
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
            bodyBobSpring.impulse(7.2 * sp);
            tailWagSpring.impulse(state.stepSign * 3.8 * sp * flex);
            for (const l of gaitRes.landed) {
              if (vfx && habitat) EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.62 * sMul);
            }
          }
          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.2 * sMul }));

          // 禽类点步头颈节奏：0~0.58 相对躯干后滞（头在世界里定住），0.58~0.92 干脆前推
          let targetHeadBob = 0;
          if (walking) {
            const cyc = ((state.stepPhase / Math.PI) % 1 + 1) % 1;
            const walkAmt = clamp(moveSpd / 11.0, 0, 1);
            if (cyc < 0.56) {
              targetHeadBob = lerp(1.6, -1.5, cyc / 0.56) * walkAmt;
            } else {
              targetHeadBob = lerp(-1.5, 1.6, smoothstep(0.56, 0.92, cyc)) * walkAmt;
            }
          } else if (state.stage === 'peck') {
            targetHeadBob = 3.2;
          }

          // -----------------------------------------------------------------
          // 3. 弹簧平滑驱动 + 3 档无损喉囊状态迟滞切换
          // -----------------------------------------------------------------
          const throatVal = throatSpring.update(dt, targetThroat, 95 * sp, clamp(7.4 * dScale, 3.2, 12.0));
          if (throatVal > 0.72) state.neckStage = 'puff2';
          else if (throatVal > 0.28) state.neckStage = 'puff1';
          else state.neckStage = 'normal';

          headYawSpring.update(dt, targetHeadYaw, 155 * sp, clamp(9.2 * dScale, 4.0, 14.0));
          headBobSpring.update(dt, targetHeadBob, 185 * sp, clamp(9.6 * dScale, 4.2, 14.0));
          neckDipSpring.update(dt, targetNeckDip, 165 * sp, clamp(8.6 * dScale, 3.8, 13.0));
          wingSpreadSpring.update(dt, targetWingSpread, 110 * sp, clamp(6.8 * dScale, 3.0, 11.0));
          tailWagSpring.update(dt, targetTailWag, 105 * sp, clamp(5.6 * dScale, 2.6, 10.0));
          bodyBobSpring.update(dt, 0, 170 * sp, clamp(8.4 * dScale, 3.6, 13.0));

          // -----------------------------------------------------------------
          // 4. 更新挂点与 4 节嫩绿竹虫蠕动轨迹
          // -----------------------------------------------------------------
          const dip = clamp(neckDipSpring.x, -0.35, 1.15);
          const bobFwd = clamp(headBobSpring.x, -2.0, 3.8);
          sockets.setLocal('beak', state.x, state.y, state.z, state.yaw, 0, 10.6 + bobFwd + dip * 3.4, 18.8 - dip * 8.6, sMul);

          const bk = sockets.get('beak');
          for (let j = 0; j < grubNodes.length; j++) {
            const nd = grubNodes[j];
            let gx = holeX, gy = holeY, gz = holeZ;
            if (state.grubMode === 'peek') {
              const outDist = Math.max(0, state.grubOutT * 3.0 - j * 1.1) * sMul;
              const [px, py] = localToWorldXY(holeX, holeY, state.stumpYaw, 0, -outDist);
              gx = px; gy = py; gz = holeZ;
            } else if (state.grubMode === 'out') {
              // 蠕动弧线爬出虫洞，4 节依次带正弦扭动
              const crawl = clamp(state.grubOutT * 5.8 - j * 1.35, -0.5, 5.2) * sMul;
              const wiggle = Math.sin(time * 14.0 - j * 1.25) * 0.85 * clamp(crawl / (3.0 * sMul), 0, 1) * sMul;
              const [px, py] = localToWorldXY(holeX, holeY, state.stumpYaw, wiggle, -crawl);
              gx = px; gy = py;
              gz = holeZ + Math.sin(time * 12.0 - j * 1.1) * 0.45 * sMul - Math.max(0, crawl - 1.5 * sMul) * 0.25;
            } else if (state.grubMode === 'caught') {
              // 被竹鸡喙叼起悬在喙尖轻扭
              const sway = Math.sin(time * 20.0 - j * 1.2) * 0.7 * sMul;
              const [px, py] = localToWorldXY(bk.x, bk.y, state.yaw, sway, (0.8 - j * 1.15) * sMul);
              gx = px; gy = py; gz = bk.z - j * 0.6 * sMul;
            }
            nd.update(dt, gx, gy, gz, 155 * sp, 10.0);
          }
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const isWater = !!(habitat && habitat.isWater);
          const waterLevel = habitat ? (habitat.waterLevel ?? -99) : -99;
          const calcSub = (z) => EnvFeedback.calcSubmerge(z, waterLevel, 5.0, isWater);

          const breathBob = Math.sin((state.stepPhase * 0.5) + performance.now() * 0.0028) * 0.35;
          const bob = clamp(bodyBobSpring.x * 0.06 + breathBob, -0.35, 1.1) * sMul;
          const dip = clamp(neckDipSpring.x, -0.35, 1.15);
          const headFwd = clamp(headBobSpring.x, -1.8, 3.6) * sMul;
          const wingSpread = clamp(wingSpreadSpring.x, -0.1, 0.72);
          const tailWag = clamp(tailWagSpring.x, -0.65, 0.65);

          // 1. 2 条真反关节 IK 禽类弯腿（大腿根深嵌躯干，跗跖连续衔接，鸟爪踩实落点，零跳帧零分离）
          const txBody = state.x + (state.tiltX || 0);
          const tyBody = state.y + (state.tiltY || 0);
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const hx = l.hipWX + (state.tiltX || 0);
            const hy = l.hipWY + (state.tiltY || 0);
            const hz = l.hipWZ + bob;
            const segs = [
              { k: 'legThigh', x: lerp(hx, l.kneeX, 0.22), y: lerp(hy, l.kneeY, 0.22), z: lerp(hz, l.kneeZ, 0.22), b: -0.35, sym: 90 },
              { k: 'legShin',  x: l.kneeX, y: l.kneeY, z: l.kneeZ, b: -0.30, sym: 90 },
              { k: 'legShin',  x: lerp(l.kneeX, l.footX, 0.54), y: lerp(l.kneeY, l.footY, 0.54), z: lerp(l.kneeZ, l.footZ + 1.2 * sMul, 0.54), b: -0.26, sym: 90 },
              { k: 'footClaw', x: l.footX, y: l.footY, z: l.footZ, b: -0.20, sym: 0 }
            ];
            for (const pt of segs) {
              const item = {
                partKey: pt.k,
                asset: parts[pt.k],
                x: pt.x,
                y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === 'footClaw' ? 0 : 2.0 * sMul)),
                ro: yw,
                submerge: calcSub(pt.z + 1.0 * sMul),
                bias: pt.b
              };
              if (pt.sym) item.symDeg = pt.sym;
              list.push(item);
            }
          }

          // 2. 昂首挺胸主躯干（叠加真实二足左右横滚摇摆 + 与腿顶深度咬合）
          const torsoLift = 7.2 * sMul + bob;
          list.push({
            partKey: 'torso',
            asset: parts.torso,
            x: txBody,
            y: tyBody,
            lift: torsoLift,
            ro: yw,
            submerge: calcSub(torsoLift + 3.0 * sMul),
            bias: 0.15
          });

          // 3. 左右层叠细长竹叶翅羽（pivotToWorldXY 锁死肩关节，常态收拢、吐火/得意时微张）
          for (const s of [-1, 1]) {
            const wKey = s < 0 ? 'wingL' : 'wingR';
            const wYaw = wrapAngle(yw - s * (0.06 + wingSpread * 0.58));
            const [shX, shY] = localToWorldXY(state.x, state.y, yw, s * 4.6 * sMul, 2.2 * sMul);
            const [wx, wy] = pivotToWorldXY(shX, shY, wYaw, -s * WING_PIVOT.x * sMul, WING_PIVOT.y * sMul);
            list.push({
              partKey: wKey,
              asset: parts[wKey],
              x: wx,
              y: wy,
              lift: torsoLift + (3.2 + wingSpread * 1.4) * sMul,
              ro: wYaw,
              submerge: calcSub(torsoLift + 4.0 * sMul),
              bias: 0.30
            });
          }

          // 4. 宽大层叠竹叶扇形尾羽（pivotToWorldXY 锁死尾根，弹簧微颤）
          const tailYaw = wrapAngle(yw + tailWag * 0.55);
          const [tjx, tjy] = localToWorldXY(state.x, state.y, yw, 0, -6.2 * sMul);
          const [tx, ty] = pivotToWorldXY(tjx, tjy, tailYaw, TAIL_PIVOT.x * sMul, TAIL_PIVOT.y * sMul);
          list.push({
            partKey: 'tailFan',
            asset: parts.tailFan,
            x: tx,
            y: ty,
            lift: torsoLift + (5.2 + Math.abs(tailWag) * 1.6) * sMul,
            ro: tailYaw,
            submerge: calcSub(torsoLift + 6.0 * sMul),
            bias: -0.15
          });

          // 5. 独立可点动长颈（3 档无损喉囊鼓胀 + 点步前推）
          const neckKey = state.neckStage === 'puff2' ? 'neckPuff2' : (state.neckStage === 'puff1' ? 'neckPuff1' : 'neckNormal');
          const neckYaw = wrapAngle(yw + clamp(headYawSpring.x * 0.45, -0.35, 0.35));
          const [njx, njy] = localToWorldXY(state.x, state.y, yw, 0, (4.8 + headFwd * 0.45 + dip * 1.8) * sMul);
          const [nx, ny] = pivotToWorldXY(njx, njy, neckYaw, NECK_PIVOT.x * sMul, NECK_PIVOT.y * sMul);
          const neckLift = torsoLift + (6.8 - dip * 3.4) * sMul;
          list.push({
            partKey: neckKey,
            asset: parts[neckKey],
            x: nx,
            y: ny,
            lift: neckLift,
            ro: neckYaw,
            submerge: calcSub(neckLift + 3.0 * sMul),
            bias: 0.45
          });

          // 6. 独立锦鸡头（多瓣大鸡冠 + 双瓣红肉垂 + 张合双态锐利喙）
          const headKey = state.headPose === 'open' ? 'headOpen' : 'headNormal';
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.68, 0.68));
          const [hjx, hjy] = localToWorldXY(nx, ny, neckYaw, 0, (1.6 + headFwd * 0.55 + dip * 2.4) * sMul);
          const [hx, hy] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const headLift = neckLift + (7.6 - dip * 4.4) * sMul;
          list.push({
            partKey: headKey,
            asset: parts[headKey],
            x: hx,
            y: hy,
            lift: headLift,
            ro: hYaw,
            submerge: calcSub(headLift + 2.0 * sMul),
            bias: 0.70
          });

          // 7. 蓬松淡青白低温冷火团（仅吐火阶段显现，设计半透用 opacity）
          if (state.fireActive) {
            const fKey = (state.fireProgress > 0.25 && state.fireProgress < 0.85) ? 'coldFireLg' : 'coldFireSm';
            const fade = Math.sin(clamp(state.fireProgress, 0, 1) * Math.PI);
            list.push({
              partKey: fKey,
              asset: parts[fKey],
              x: state.fireX,
              y: state.fireY,
              lift: Math.max(1.0, state.fireZ - 4.0 * sMul),
              ro: state.fireProgress * 4.5,
              opacity: clamp(0.45 + fade * 0.45, 0.35, 0.90),
              symDeg: 90,
              bias: 0.85
            });
          }

          // 8. 待机交互物 A：立体青绿竹桩（稳立地面，不穿模）
          list.push({
            partKey: 'bambooStump',
            asset: parts.bambooStump,
            x: state.stumpX,
            y: state.stumpY,
            lift: 0,
            ro: state.stumpYaw,
            submerge: calcSub(2.0 * sMul),
            bias: 0.10
          });

          // 9. 待机交互物 B：4 节圆滚滚嫩绿竹虫（仅 peek / out / caught 状态可见）
          if (state.grubMode === 'peek' || state.grubMode === 'out' || state.grubMode === 'caught') {
            const visCount = state.grubMode === 'peek' ? 1 : grubNodes.length;
            for (let j = visCount - 1; j >= 0; j--) {
              const nd = grubNodes[j];
              const gKey = j === 0 ? 'grubHead' : 'grubBody';
              list.push({
                partKey: gKey,
                asset: parts[gKey],
                x: nd.x,
                y: nd.y,
                lift: Math.max(0.5, nd.z - 1.5 * sMul),
                ro: state.grubMode === 'caught' ? yw : wrapAngle(state.stumpYaw + Math.PI),
                symDeg: j === 0 ? undefined : 90,
                bias: 0.55 - j * 0.03
              });
            }
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Tree4Def.id,
            code: Tree4Def.code,
            name: Tree4Def.name,
            status: Tree4Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            stage: state.stage,
            neckStage: state.neckStage,
            headPose: state.headPose,
            grubMode: state.grubMode,
            footRadius: Tree4Def.footRadius,
            headZ: 30,
            centerZ: 15,
            blocks: Tree4Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Tree4Def);
})(window.PixelWorkshop);
