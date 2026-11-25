'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, fbm1, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback, MountSystem } = PW.Behaviors;

  // =========================================================================
  // 水2 · 衔石小鸟（M13 编队群落 · 5 只共享贴图花鸟 + 俯冲抛石 + 停靠水4巨龟背）
  //
  // 【体貌与俯视清晰度设计】
  // - 俯视 ×4 放大关键特征色块：
  //   1. 明赤喙：醒目朱红长尖喙，喙尖恒定衔着亮灰白圆石子或赭褐短枝；
  //   2. 雪白冠羽：头顶向后蓬起的大簇洁白羽冠，俯视一眼可辨；
  //   3. 深青蓝尾羽：独立微摆的长扇尾，与白冠/赤喙形成高对比；
  //   4. 3 档无损翼姿（上扬 wingUp / 平展 wingGlide / 下拍 wingDown）+ 歇脚收翅 wingFold，严禁常态拉伸。
  // - 行为闭环：
  //   - 5 只成群在石缝河湾低空盘旋，周期性轮流俯冲将喙中小石子抛入水中激起涟漪与水花；
  //   - 若同台有 水4 巨龟，部分小鸟通过 MountSystem 飞落到巨龟背甲挂点歇脚再起飞；
  //   - 无巨龟时偶发落在河湾浅滩石堆旁歇脚并重新衔起石子。
  // - 预算检查：28 色 <= 48，0 重色，0 禁用字，全部部件单件 <= 16 格。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 雪白冠羽与胸腹（高对比亮白）
      crestDark:   '#b6c8d6',
      crestMid:    '#e6f0f7',
      crestHi:     '#fcfdff',
      // 明赤尖喙（醒目朱红）
      beakDark:    '#9c1919',
      beakMid:     '#e82e28',
      beakHi:      '#ff7059',
      // 背羽主色（暖青蓝）
      backDark:    '#1c4866',
      backMid:     '#2f7399',
      backHi:      '#5ea8cc',
      // 肩部栗红花斑（花鸟点缀）
      patchDark:   '#7a2e22',
      patchMid:    '#ba4b34',
      patchHi:     '#eb7c5b',
      // 深青蓝长尾羽（高饱和深青）
      tailDark:    '#0f2c4a',
      tailMid:     '#1a4d7a',
      tailHi:      '#387cb0',
      // 飞羽外缘（浅天青）
      wingDark:    '#235778',
      wingMid:     '#3f8ab3',
      wingHi:      '#7cc6e8',
      // 醒目亮灰白小石子（喙中衔物）
      stoneDark:   '#8f9aa3',
      stoneMid:    '#cfd9e0',
      stoneHi:     '#f2f7fa',
      // 赭色短枝（另一类喙中衔物）
      twigDark:    '#59331c',
      twigMid:     '#8f542c',
      twigHi:      '#c4814b',
      // 锐利黑眼（eyeGlint 不进 glowKeys）
      eyeDark:     '#0c1017',
      eyeIris:     '#f2b632',
      eyeGlint:    '#f5fbff',
      // 浅滩苔石堆底石（环境锚点，不随鸟换色）
      pileBase:    '#62707a'
    },
    glowKeys: [],
    parts: ['crest', 'beak', 'back', 'patch', 'tail', 'wing', 'stone', 'twig', 'eye', 'pile'],
    noCrease: [
      ['crest', 'back'], ['crest', 'eye'], ['crest', 'beak'],
      ['back', 'patch'], ['back', 'wing'], ['back', 'tail']
    ],
    materials: {
      crest: ['crestDark', 'crestMid', 'crestHi'],
      beak:  ['beakDark',  'beakMid',  'beakHi'],
      back:  ['backDark',  'backMid',  'backHi'],
      patch: ['patchDark', 'patchMid', 'patchHi'],
      tail:  ['tailDark',  'tailMid',  'tailHi'],
      wing:  ['wingDark',  'wingMid',  'wingHi'],
      stone: ['stoneDark', 'stoneMid', 'stoneHi'],
      twig:  ['twigDark',  'twigMid',  'twigHi']
    },
    protectedParts: ['eye', 'beak', 'stone', 'twig']
  });

  // 3 套零重建模换色皮肤（0 禁用字，0 重色）
  const SKINS = [
    {
      id: 'classic_bay',
      name: '赤喙雪冠（河湾经典）',
      dot: '#2f7399',
      outline: '#0d1a26',
      pal: {},
      fx: { splash: '#d4f0fa', ripple: '#a6ddf2' }
    },
    {
      id: 'coral_crest',
      name: '朱羽碧尾（暖滩款）',
      dot: '#d9573b',
      outline: '#24100c',
      pal: {
        crestDark: '#c9bfb5', crestMid: '#f2eae0', crestHi: '#fffcf7',
        beakDark:  '#a62414', beakMid:  '#f04324', beakHi:  '#ff855e',
        backDark:  '#8f3022', backMid:  '#d45439', backHi:  '#ff8a66',
        patchDark: '#a66d1b', patchMid: '#e09e34', patchHi: '#ffd470',
        tailDark:  '#124d47', tailMid:  '#218276', tailHi:  '#4cc2ad',
        wingDark:  '#1d665c', wingMid:  '#34a18f', wingHi:  '#73dbC5'
      },
      fx: { splash: '#e8faf5', ripple: '#9ce6d4' }
    },
    {
      id: 'indigo_gold',
      name: '金喙靛尾（深潭款）',
      dot: '#2d4b8c',
      outline: '#0b1224',
      pal: {
        crestDark: '#b3bdd4', crestMid: '#e0e8f5', crestHi: '#f7faff',
        beakDark:  '#a66a0e', beakMid:  '#eba11c', beakHi:  '#ffd966',
        backDark:  '#1c2e5e', backMid:  '#325096', backHi:  '#668bd4',
        patchDark: '#6b294c', patchMid: '#ab4678', patchHi: '#e381ae',
        tailDark:  '#111d42', tailMid:  '#213978', tailHi:  '#486bb8',
        wingDark:  '#26407d', wingMid:  '#476db5', wingHi:  '#87aee8'
      },
      fx: { splash: '#e3efff', ripple: '#9ec4f5' }
    }
  ];

  // =========================================================================
  // 1. 鸟身主体（11×15×10）：雪白羽冠 + 明赤长喙 + 花鸟背斑
  // =========================================================================
  function buildBirdBody(makeCanvas) {
    const W = 11, D = 15, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-4.8, 4.8, -6.5, 6.8, 0, H - 1, (x, y, z, X, Y) => {
      const dBody = (Math.hypot(X / 3.4, (Y + 0.8) / 4.4, (z - 4.2) / 3.2) - 1.0) * 3.1;
      const dHead = (Math.hypot(X / 2.8, (Y - 2.9) / 2.7, (z - 5.5) / 2.6) - 1.0) * 2.6;
      const d = smin(dBody, dHead, 1.3);
      if (d > 0 || z < 1) return;

      if (z <= 2.7 && Math.abs(X) < 2.6) {
        m.setRaw(x, y, z, mat('crest'), partId.crest);
      } else if (Y >= 1.6 && z >= 5.6) {
        // 头顶大片雪白冠底
        m.setRaw(x, y, z, mat('crest'), partId.crest);
      } else if (Math.abs(X) >= 1.8 && Y > -2.4 && Y < 1.6 && z >= 3.8) {
        // 两侧栗红花斑肩羽
        m.setRaw(x, y, z, mat('patch'), partId.patch);
      } else {
        m.setRaw(x, y, z, mat('back'), partId.back);
      }
    });

    // 蓬起向后飘的雪白冠羽（俯视放大，极高辨识度）
    m.paintCapsule(0, 3.2, 7.6, 0, -0.8, 9.2, 1.55, 0.85, mat('crest'), partId.crest, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 0.9, 2.8, 7.2, s * 1.8, 0.2, 8.5, 0.95, 0.55, mat('crest'), partId.crest, true);
    }

    // 醒目明赤尖喙（大号向前伸出，一眼看清）
    m.paintCapsule(0, 4.0, 5.4, 0, 7.2, 4.8, 1.35, 0.48, mat('beak'), partId.beak, true);
    m.paintCapsule(0, 4.4, 4.6, 0, 6.7, 4.3, 1.05, 0.40, mat('beak'), partId.beak, true);

    // 胸侧翼肩座
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 2.6, 0.2, 4.8, 1.3, 1.8, 1.3, mat('wing'), partId.wing, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 锐利黑眼
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 3.2);
    const eyeZ = 5;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 2.5);
      m.setRaw(ex, eyeY, eyeZ, keyToId.eyeIris, partId.eye);
      m.setRaw(ex, eyeY + 1, eyeZ, keyToId.eyeDark, partId.eye);
      m.setRaw(ex, eyeY, eyeZ + 1, keyToId.eyeDark, partId.eye);
      m.setRaw(ex, eyeY + 1, eyeZ + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 9, centerZ: 5 });
  }

  // =========================================================================
  // 2. 深青蓝宽扇尾（9×10×7，独立摆动）
  // =========================================================================
  const TAIL_PIVOT = { x: 0, y: 3.4, attachY: -4.8 };

  function buildTailFan(makeCanvas) {
    const W = 9, D = 10, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.paintEllipsoid(0, 3.0, 3.4, 1.6, 1.6, 1.4, mat('back'), partId.back, true);
    m.paintFinTri([0, 3.0, 3.5], [-3.8, -4.2, 4.4], [3.8, -4.2, 4.4], 0.72, mat('tail'), partId.tail, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(0, 2.4, 3.5, s * 3.2, -3.8, 4.5, 0.95, 0.55, mat('tail'), partId.tail, true);
      // 尾尖雪白饰点
      m.paintEllipsoid(s * 3.2, -4.0, 4.5, 0.72, 0.72, 0.65, mat('crest'), partId.crest, true);
    }
    m.paintCapsule(0, 2.2, 3.5, 0, -4.4, 4.3, 0.95, 0.55, mat('tail'), partId.tail, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 3. 四档无损花鸟翅（上扬 / 平展滑翔 / 下拍 / 歇脚收拢）
  // =========================================================================
  const WING_PIVOTS = {
    up:    { x: 5.0, y: 0.6, attachX: 2.6, attachY: 0.3 },
    glide: { x: 6.2, y: 0.8, attachX: 2.6, attachY: 0.3 },
    down:  { x: 5.0, y: 0.6, attachX: 2.6, attachY: 0.3 },
    fold:  { x: 1.2, y: 2.8, attachX: 2.4, attachY: 0.0 }
  };

  function buildWingPose(makeCanvas, side, pose) {
    if (pose === 'fold') {
      const W = 6, D = 10, H = 7;
      const m = new VoxelModel(W, D, H, SPEC);
      const { mat, partId } = SPEC;
      const px = -side * WING_PIVOTS.fold.x, py = WING_PIVOTS.fold.y;
      m.paintCapsule(px, py, 3.6, side * 1.2, -3.4, 3.4, 1.3, 0.72, mat('wing'), partId.wing, true);
      m.paintEllipsoid(side * 0.8, 1.2, 4.0, 1.1, 1.6, 1.1, mat('patch'), partId.patch, true);
      m.paintEllipsoid(side * 1.2, -3.8, 3.2, 0.75, 0.9, 0.7, mat('tail'), partId.tail, true);
      m.despeckle();
      m.applyArtShading(true);
      return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 6, centerZ: 3 });
    }

    const isGlide = pose === 'glide';
    const isUp = pose === 'up';
    const W = isGlide ? 16 : 14;
    const D = 10;
    const H = isGlide ? 7 : 11;
    const piv = WING_PIVOTS[pose];
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const rx = -side * piv.x, ry = piv.y;
    const rootZ = isGlide ? 3.4 : (isUp ? 3.2 : 6.8);
    const midZ  = isGlide ? 4.2 : (isUp ? 7.6 : 4.4);
    const tipZ  = isGlide ? 4.6 : (isUp ? 9.6 : 2.0);
    const tipX  = side * (isGlide ? 6.8 : 5.6);

    m.paintEllipsoid(rx, ry, rootZ, 1.6, 1.8, 1.4, mat('patch'), partId.patch, true);
    m.paintCapsule(rx, ry + 0.5, rootZ, side * 1.2, ry + 1.4, midZ, 1.35, 1.05, mat('wing'), partId.wing, true);
    m.paintCapsule(side * 1.2, ry + 1.4, midZ, tipX, ry - 0.8, tipZ, 1.05, 0.62, mat('wing'), partId.wing, true);

    m.paintFinTri([rx, ry, rootZ], [side * 1.4, ry + 1.2, midZ], [side * 0.4, ry - 3.6, (rootZ + midZ) * 0.5], 0.68, mat('wing'), partId.wing, false);
    m.paintFinTri([side * 1.2, ry + 1.2, midZ], [tipX, ry - 0.8, tipZ], [side * 0.4, ry - 3.6, (rootZ + midZ) * 0.5], 0.65, mat('tail'), partId.tail, false);
    // 醒目深青蓝翼尖羽
    m.paintCapsule(side * 3.4, ry - 0.4, lerp(midZ, tipZ, 0.5), tipX + side * 0.6, ry - 1.2, tipZ, 0.78, 0.48, mat('tail'), partId.tail, true);
    m.paintCapsule(side * 2.4, ry - 2.0, lerp(midZ, tipZ, 0.4), tipX - side * 0.6, ry - 3.2, tipZ - 0.3, 0.72, 0.44, mat('tail'), partId.tail, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: H - 1, centerZ: Math.round(H * 0.5) });
  }

  // =========================================================================
  // 4. 喙中衔物：亮灰白小石子（5×5×5）& 赭色短木枝（7×4×4）+ 浅滩石堆（14×14×8）
  // =========================================================================
  function buildPebble(makeCanvas) {
    const m = new VoxelModel(5, 5, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 2.2, 1.85, 1.75, 1.65, mat('stone'), partId.stone, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0, headZ: 4, centerZ: 2 });
  }

  function buildTwig(makeCanvas) {
    const m = new VoxelModel(8, 5, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(-3.0, 0.2, 2.2, 3.0, -0.2, 2.4, 0.85, 0.72, mat('twig'), partId.twig, true);
    m.paintCapsule(0.8, 0.0, 2.4, 2.4, 1.6, 3.2, 0.65, 0.45, mat('twig'), partId.twig, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5, headZ: 4, centerZ: 2 });
  }

  function buildStonePile(makeCanvas) {
    const m = new VoxelModel(14, 14, 8, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 浅滩鹅卵石堆（衔石小鸟长期填湾聚成的亮白鹅卵石堆）
    m.paintEllipsoid(0, 0, 2.0, 5.6, 5.2, 2.2, keyToId.pileBase, partId.pile, true);
    m.paintEllipsoid(-2.2, 1.4, 3.4, 2.6, 2.4, 2.0, mat('stone'), partId.stone, true);
    m.paintEllipsoid(2.3, -1.0, 3.2, 2.5, 2.2, 1.8, mat('stone'), partId.stone, true);
    m.paintEllipsoid(0.2, -2.2, 2.8, 2.1, 2.0, 1.7, mat('stone'), partId.stone, true);
    m.paintEllipsoid(0.0, 0.6, 4.9, 2.2, 2.1, 1.8, mat('stone'), partId.stone, true);
    // 堆顶斜插一根短木枝
    m.paintCapsule(-2.6, -0.8, 5.2, 2.8, 1.8, 6.2, 0.72, 0.55, mat('twig'), partId.twig, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.8, headZ: 7, centerZ: 3 });
  }

  // =========================================================================
  // 5 只花鸟成员配置（各自衔石/衔枝、盘旋半径、拍翅节律与停靠性格）
  // =========================================================================
  const BIRD_PROFILES = [
    { idx: 0, item: 'stone', orbitR: 22.0, orbitSpd: 0.78, ang0: 0.2, cruiseZ: 17.5, flapFreq: 11.2, phase: 0.0, canMount: true  },
    { idx: 1, item: 'twig',  orbitR: 27.5, orbitSpd: 0.70, ang0: 1.5, cruiseZ: 20.5, flapFreq: 10.4, phase: 1.3, canMount: true  },
    { idx: 2, item: 'stone', orbitR: 18.5, orbitSpd: 0.84, ang0: 2.7, cruiseZ: 15.8, flapFreq: 11.8, phase: 2.5, canMount: false },
    { idx: 3, item: 'stone', orbitR: 25.0, orbitSpd: 0.74, ang0: 4.0, cruiseZ: 19.0, flapFreq: 10.8, phase: 3.9, canMount: true  },
    { idx: 4, item: 'twig',  orbitR: 30.0, orbitSpd: 0.66, ang0: 5.2, cruiseZ: 22.0, flapFreq: 10.0, phase: 5.1, canMount: false }
  ];

  const Water2Def = {
    id: 'water2_jingwei',
    code: '水2',
    status: 'done',
    name: '衔石小鸟',
    tag: 'M13 编队群落 · 5只低飞抛石与巨龟停靠',
    summary: '5 只共享资产的明赤喙雪冠花鸟，喙中恒衔亮白小石子或赭色短枝；成群在石缝河湾低空盘旋、轮流俯冲抛石激起清晰涟漪与水花，同台有 水4 巨龟时会借 MountSystem 落到龟背歇脚再起飞',
    defaultHabitat: 'stoneBay',
    footRadius: 0.5,
    ecoWeight: 0.6,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol',    name: '自由巡游', loop: true,  status: 'done' },
      { id: 'idle',      name: '原地待机', loop: true,  status: 'done' },
      { id: 'dropStone', name: '俯冲抛石', loop: false, duration: 3.6, status: 'done' }
    ],
    blocks: [
      '5 只共享贴图花鸟（明赤喙 / 雪白羽冠 / 深青蓝扇尾）',
      '喙中恒衔亮灰白石子或赭色短枝 + 抛物线坠落溅水花',
      '四档无损翼姿（上扬 / 滑翔 / 下拍 / 收翅），零小数拉伸',
      'MountSystem 跨个体停靠（同台自动寻找 水4 巨龟背甲歇脚）'
    ],
    soulHabit: '5 只花鸟衔着亮白小石子与赭色短枝在河湾低空盘旋 -> 轮流俯冲松喙将石子丢进浅湾激起大圈涟漪与水花 -> 绕湾再衔新石，同台若见 水4 巨龟游过便飞落其宽背甲收翅歇脚片刻再振翅归队',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        birdBody:   buildBirdBody(makeCanvas),
        tailFan:    buildTailFan(makeCanvas),
        wingUpL:    buildWingPose(makeCanvas, -1, 'up'),
        wingUpR:    buildWingPose(makeCanvas,  1, 'up'),
        wingGlideL: buildWingPose(makeCanvas, -1, 'glide'),
        wingGlideR: buildWingPose(makeCanvas,  1, 'glide'),
        wingDownL:  buildWingPose(makeCanvas, -1, 'down'),
        wingDownR:  buildWingPose(makeCanvas,  1, 'down'),
        wingFoldL:  buildWingPose(makeCanvas, -1, 'fold'),
        wingFoldR:  buildWingPose(makeCanvas,  1, 'fold'),
        pebble:     buildPebble(makeCanvas),
        twig:       buildTwig(makeCanvas),
        stonePile:  buildStonePile(makeCanvas)
      };

      const recolorAssets = Object.keys(parts)
        .filter(k => k !== 'pebble' && k !== 'twig' && k !== 'stonePile')
        .map(k => parts[k]);

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;
      const seed = opts.seed ?? 41;
      const uid = `water2_${Math.random().toString(36).slice(2, 7)}`;

      // 5 只花鸟状态
      const birds = BIRD_PROFILES.map((p) => ({
        ...p,
        riderId: `${uid}_b${p.idx}`,
        x: hx0,
        y: hy0,
        z: p.cruiseZ,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        ang: p.ang0,
        flapPhase: p.phase * 2.0,
        wingPose: 'glide',
        tailYaw: 0,
        mode: 'circle', // 'circle' | 'dive' | 'pickup' | 'mountApproach' | 'mounted' | 'perchPile'
        modeT: 0,
        carrying: true,
        diveT: 0,
        diveStartX: hx0,
        diveStartY: hy0,
        diveTargetX: hx0,
        diveTargetY: hy0,
        mountHost: null,
        mountSlot: null,
        mountDur: 3.8,
        mountCd: 2.5 + p.idx * 1.4,
        sortBias: 0
      }));

      // 抛出的飞行石子/短枝（最多 5 颗并发）
      const droppedItems = [];

      const pile = {
        x: hx0,
        y: hy0,
        z: 0.6,
        yaw: 0.25,
        bob: new SpringDamper1D(0, 80, 6.0)
      };

      const state = {
        x: hx0,
        y: hy0,
        z: 18.0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        dropCd: 1.6,
        dropSeq: 0,
        actionTriggered: false
      };

      const sockets = new SocketTracker();
      const footContacts = Array.from({ length: BIRD_PROFILES.length + 1 }, () => ({ x: hx0, y: hy0, z: 0, r: 3.4 }));
      let curSkin = SKINS[0];

      function clampToSafeRadius(x, y, cx, cy, limitR) {
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (d > limitR && d > 0.001) {
          return [cx + (dx / d) * limitR, cy + (dy / d) * limitR];
        }
        return [x, y];
      }

      function launchDive(b, homeX, homeY, safeR, sMul) {
        state.dropSeq++;
        b.mode = 'dive';
        b.diveT = 0;
        b.carrying = true;
        b.diveStartX = b.x;
        b.diveStartY = b.y;
        const a = hash2i(state.dropSeq, b.idx + 3, seed + 19) * TAU;
        const r = lerp(7.5, Math.max(10.0, safeR * 0.72), hash2i(state.dropSeq, b.idx + 7, seed + 53));
        b.diveTargetX = homeX + Math.cos(a) * r;
        b.diveTargetY = homeY + Math.sin(a) * r;
      }

      function spawnDroppedProjectile(b, sMul) {
        const [bx, by] = localToWorldXY(b.x, b.y, b.yaw, 0, 7.6 * sMul);
        droppedItems.push({
          kind: b.item,
          x: bx,
          y: by,
          z: Math.max(2.5, b.z + 3.2 * sMul),
          vx: b.vx * 0.32,
          vy: b.vy * 0.32,
          vz: -4.0 * sMul,
          yaw: b.yaw,
          age: 0
        });
      }

      const instance = {
        def: Water2Def,
        cachePrefix: uid,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of recolorAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 18.0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.dropCd = 1.4;
          state.dropSeq = 0;
          state.actionTriggered = false;
          droppedItems.length = 0;

          pile.x = homeX;
          pile.y = homeY;
          pile.z = 0.6;
          pile.bob.x = pile.bob.v = 0;

          for (let i = 0; i < birds.length; i++) {
            const b = birds[i];
            b.ang = b.ang0;
            b.x = homeX + Math.cos(b.ang) * b.orbitR * 0.85;
            b.y = homeY + Math.sin(b.ang) * b.orbitR * 0.85;
            b.z = b.cruiseZ;
            b.vx = 0;
            b.vy = 0;
            b.yaw = wrapAngle(b.ang + Math.PI * 0.5);
            b.mode = 'circle';
            b.modeT = 0;
            b.carrying = true;
            b.wingPose = 'glide';
            b.mountHost = null;
            b.mountSlot = null;
            b.mountCd = 2.0 + i * 1.4;
            b.sortBias = 0;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const action = eco && eco.action ? eco.action : (eco && eco.patrol === false ? 'idle' : 'patrol');
          const isIdle = action === 'idle';
          const isDropAction = action === 'dropStone';
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const rawMaxR = (eco && eco.maxRadius) || 48;
          const safeR = rawMaxR * 0.78;
          const allActors = (eco && Array.isArray(eco.allActors)) ? eco.allActors : null;
          const fx = curSkin.fx || SKINS[0].fx;

          // 石堆微震弹簧
          const bobVal = pile.bob.update(dt, 0, 80 * sp, 6.0);
          pile.x = homeX;
          pile.y = homeY;
          pile.z = Math.max(0.4, (0.6 + bobVal * 0.35) * sMul);

          // 1. 触发抛石动作（dropStone 动作下齐飞轮番俯冲抛石；巡游下周期性轮流抛石）
          if (isDropAction) {
            if (!state.actionTriggered) {
              state.actionTriggered = true;
              for (let i = 0; i < 3; i++) {
                const b = birds[i];
                if (b.mountHost && allActors) {
                  MountSystem.releaseMount(b.riderId, allActors);
                  b.mountHost = null;
                  b.mountSlot = null;
                }
                launchDive(b, homeX, homeY, safeR, sMul);
                b.diveT = -i * 0.35;
              }
            }
          } else {
            state.actionTriggered = false;
            if (!isIdle) {
              state.dropCd -= dt * spdMul;
              if (state.dropCd <= 0) {
                state.dropCd = 2.1 + hash2i(state.dropSeq + 1, seed, 71) * 1.4;
                const cand = birds.find(b => b.mode === 'circle' && b.carrying);
                if (cand) launchDive(cand, homeX, homeY, safeR, sMul);
              }
            }
          }

          // 2. 更新空中坠落的石子/短枝，入水立即激起涟漪与水花
          for (let i = droppedItems.length - 1; i >= 0; i--) {
            const it = droppedItems[i];
            it.age += dt;
            it.vz -= 46 * dt * sMul;
            it.x += it.vx * dt;
            it.y += it.vy * dt;
            it.z += it.vz * dt;
            it.yaw = wrapAngle(it.yaw + dt * 5.0);
            if (it.z <= 1.2 * sMul || it.age > 2.2) {
              if (vfx) {
                vfx.addRipple(it.x, it.y, 2.2 * sMul, 17.5 * sMul, 0.85, 2.0);
                vfx.addRipple(it.x, it.y, 1.0 * sMul, 11.0 * sMul, 0.60, 1.4);
                vfx.spawnSplash(it.x, it.y, 10, 1.25 * sMul, habitat && habitat.fx ? habitat.fx : null);
                for (let k = 0; k < 5; k++) {
                  const a = (k / 5) * TAU + Math.random() * 0.5;
                  vfx.spawnParticle(
                    it.x, it.y, 2.0 * sMul,
                    Math.cos(a) * 11 * sMul, Math.sin(a) * 11 * sMul, (9 + Math.random() * 7) * sMul,
                    0.48, 1.2, fx.splash, false, 28
                  );
                }
              }
              droppedItems.splice(i, 1);
            }
          }

          // 3. 更新 5 只花鸟个体
          let sumX = 0, sumY = 0, sumZ = 0;
          for (let i = 0; i < birds.length; i++) {
            const b = birds[i];
            b.mountCd = Math.max(0, b.mountCd - dt);
            b.sortBias = 0;

            // 尝试寻找同台 水4 巨龟挂点停靠歇脚
            if (!isDropAction && b.canMount && b.mode === 'circle' && b.mountCd <= 0 && allActors && allActors.length > 1) {
              const found = MountSystem.findMountHost(instance, allActors, {
                riderId: b.riderId,
                preferredCodes: ['水4'],
                excludeCodes: ['水2', '地9', '泽5'],
                preferExplicit: true,
                maxDist: rawMaxR * 2.2
              });
              if (found && MountSystem.claimMount(b.riderId, found.host, found.slot)) {
                b.mountHost = found.host;
                b.mountSlot = found.slot;
                b.mode = 'mountApproach';
                b.modeT = 0;
                b.mountDur = 3.6 + hash2i(i + 1, Math.floor(time), seed + 91) * 2.2;
              } else {
                b.mountCd = 4.0;
              }
            }

            if (b.mode === 'mountApproach' || b.mode === 'mounted') {
              const stepRes = MountSystem.stepApproachAndMount(b, b.mountHost, b.mountSlot, dt, params, {
                speed: 28 * sMul,
                arriveDist: 2.2 * sMul,
                arcLift: 6.5 * sMul,
                arcSpan: 24 * sMul,
                matchYaw: true,
                yawOffset: (i % 2 === 0 ? 0.35 : -0.35)
              });
              if (stepRes.lost) {
                if (allActors) MountSystem.releaseMount(b.riderId, allActors);
                b.mountHost = null;
                b.mountSlot = null;
                b.mode = 'circle';
                b.mountCd = 5.0;
              } else if (stepRes.mounted) {
                b.mode = 'mounted';
                b.modeT += dt;
                b.wingPose = 'fold';
                b.tailYaw = Math.sin(time * 2.6 + b.phase) * 0.14 * flex;
                // 歇脚够了振翅起飞
                if (b.modeT >= b.mountDur) {
                  if (allActors) MountSystem.releaseMount(b.riderId, allActors);
                  b.mountHost = null;
                  b.mountSlot = null;
                  b.mode = 'circle';
                  b.mountCd = 6.5 + i * 1.5;
                }
              } else {
                b.flapPhase = (b.flapPhase + dt * b.flapFreq * gFreq * 1.15) % TAU;
                const wv = Math.sin(b.flapPhase);
                b.wingPose = wv > 0.3 ? 'up' : (wv < -0.3 ? 'down' : 'glide');
                b.tailYaw = wv * 0.16 * flex;
              }
            } else if (b.mode === 'dive') {
              b.diveT += dt * (0.85 + spdMul * 0.30);
              if (b.diveT < 0) {
                // 等待错相起俯冲，先小幅盘旋
                b.ang = wrapAngle(b.ang + dt * b.orbitSpd * spdMul);
                const r = Math.min(b.orbitR * sMul, safeR * 0.88);
                const tx = homeX + Math.cos(b.ang) * r;
                const ty = homeY + Math.sin(b.ang) * r;
                b.vx = (tx - b.x) * 4.0;
                b.vy = (ty - b.y) * 4.0;
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.z = lerp(b.z, b.cruiseZ * sMul, expSmooth(dt, 5));
                b.yaw = wrapAngle(Math.atan2(-b.vx, b.vy));
                b.wingPose = 'glide';
              } else {
                const dur = 1.65;
                const u = clamp(b.diveT / dur, 0, 1);
                // 前半俯冲贴近水面，中点松喙抛石，后半拉起爬升
                const tgtX = lerp(b.diveStartX, b.diveTargetX, smoothstep(0, 0.65, u));
                const tgtY = lerp(b.diveStartY, b.diveTargetY, smoothstep(0, 0.65, u));
                const [cx, cy] = clampToSafeRadius(tgtX, tgtY, homeX, homeY, safeR);
                const kP = expSmooth(dt, 7.2);
                const nx = lerp(b.x, cx, kP);
                const ny = lerp(b.y, cy, kP);
                b.vx = (nx - b.x) / Math.max(dt, 0.001);
                b.vy = (ny - b.y) / Math.max(dt, 0.001);
                b.x = nx;
                b.y = ny;

                const lowZ = 6.2 * sMul;
                const highZ = b.cruiseZ * sMul;
                const diveDip = Math.sin(u * Math.PI);
                b.z = lerp(highZ, lowZ, Math.pow(diveDip, 0.85));

                if (Math.hypot(b.vx, b.vy) > 1.2) {
                  b.yaw = wrapAngle(b.yaw + wrapAngle(Math.atan2(-b.vx, b.vy) - b.yaw) * expSmooth(dt, 8.5));
                }

                // 在俯冲最低点附近松喙抛出石子/短枝
                if (b.carrying && u >= 0.46) {
                  b.carrying = false;
                  spawnDroppedProjectile(b, sMul);
                }

                if (u < 0.45) {
                  b.wingPose = 'glide';
                } else {
                  b.flapPhase = (b.flapPhase + dt * b.flapFreq * gFreq * 1.4) % TAU;
                  const wv = Math.sin(b.flapPhase);
                  b.wingPose = wv > 0.25 ? 'up' : (wv < -0.25 ? 'down' : 'glide');
                }
                b.tailYaw = Math.sin(b.flapPhase) * 0.20 * flex;

                if (u >= 1.0) {
                  b.mode = 'pickup';
                  b.modeT = 0;
                }
              }
            } else if (b.mode === 'pickup') {
              // 飞回浅滩石堆低掠重新衔起一颗亮白石子/短枝
              b.modeT += dt;
              const dx = pile.x - b.x, dy = pile.y - b.y;
              const dist = Math.hypot(dx, dy);
              const spd = 24 * spdMul * sMul;
              if (dist > 3.2 * sMul) {
                const step = Math.min(dist, spd * dt);
                b.vx = (dx / dist) * (step / Math.max(dt, 0.001));
                b.vy = (dy / dist) * (step / Math.max(dt, 0.001));
                b.x += (dx / dist) * step;
                b.y += (dy / dist) * step;
                b.z = lerp(b.z, 7.0 * sMul, expSmooth(dt, 5.5));
                b.yaw = wrapAngle(b.yaw + wrapAngle(Math.atan2(-dx, dy) - b.yaw) * expSmooth(dt, 8.0));
                b.flapPhase = (b.flapPhase + dt * b.flapFreq * gFreq) % TAU;
                const wv = Math.sin(b.flapPhase);
                b.wingPose = wv > 0.28 ? 'up' : (wv < -0.28 ? 'down' : 'glide');
              } else {
                b.carrying = true;
                pile.bob.impulse(3.8 * sp);
                if (vfx) {
                  vfx.addRipple(pile.x, pile.y, 3.0 * sMul, 10.5 * sMul, 0.55, 1.3);
                }
                b.mode = 'circle';
                b.modeT = 0;
              }
              b.tailYaw = Math.sin(time * 5.0 + b.phase) * 0.16 * flex;
            } else {
              // 常态盘旋（idle 时绕石堆小圈低飞，其中 2 只停在石堆边歇脚）
              if (isIdle && (b.idx === 0 || b.idx === 3)) {
                const perchAng = b.idx === 0 ? 0.6 : 3.5;
                const px = pile.x + Math.cos(perchAng) * 3.8 * sMul;
                const py = pile.y + Math.sin(perchAng) * 3.8 * sMul;
                const kP = expSmooth(dt, 4.5);
                b.vx = (px - b.x) * 3.0;
                b.vy = (py - b.y) * 3.0;
                b.x = lerp(b.x, px, kP);
                b.y = lerp(b.y, py, kP);
                b.z = lerp(b.z, 5.4 * sMul, kP);
                b.yaw = wrapAngle(perchAng + Math.sin(time * 1.4 + b.phase) * 0.35);
                b.wingPose = 'fold';
                b.tailYaw = Math.sin(time * 2.8 + b.phase) * 0.14 * flex;
              } else {
                const spdFactor = isIdle ? 0.68 : 1.0;
                b.ang = wrapAngle(b.ang + dt * b.orbitSpd * spdMul * spdFactor);
                const rBase = isIdle ? (11.5 + b.idx * 2.4) : b.orbitR;
                const rWave = (fbm1(time * 0.45 + b.phase, seed + b.idx * 17) - 0.5) * 6.5;
                const targetR = clamp((rBase + rWave) * sMul, 9.0 * sMul, safeR);
                const tx = homeX + Math.cos(b.ang) * targetR;
                const ty = homeY + Math.sin(b.ang) * targetR;

                // 成员间轻分离，避免重叠
                let sepX = 0, sepY = 0;
                for (let j = 0; j < birds.length; j++) {
                  if (i === j) continue;
                  const o = birds[j];
                  const dx = b.x - o.x, dy = b.y - o.y;
                  const d = Math.hypot(dx, dy) || 0.001;
                  if (d < 11.5 * sMul) {
                    const push = (11.5 * sMul - d) * 1.4;
                    sepX += (dx / d) * push;
                    sepY += (dy / d) * push;
                  }
                }

                const [cx, cy] = clampToSafeRadius(tx + sepX, ty + sepY, homeX, homeY, safeR);
                const kV = expSmooth(dt, 4.8);
                b.vx = lerp(b.vx, (cx - b.x) * 3.2, kV);
                b.vy = lerp(b.vy, (cy - b.y) * 3.2, kV);
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                const [fxPos, fyPos] = clampToSafeRadius(b.x, b.y, homeX, homeY, rawMaxR * 0.80);
                b.x = fxPos;
                b.y = fyPos;

                const zTarget = ((isIdle ? 12.5 : b.cruiseZ) + Math.sin(time * 2.4 + b.phase) * 2.0) * sMul;
                b.z = lerp(b.z, zTarget, expSmooth(dt, 5.0));

                const spd = Math.hypot(b.vx, b.vy);
                if (spd > 1.2) {
                  b.yaw = wrapAngle(b.yaw + wrapAngle(Math.atan2(-b.vx, b.vy) - b.yaw) * expSmooth(dt, 6.8));
                }

                // 拍翅-滑翔交替（每 2.4 秒短滑翔一次，轻盈灵动）
                const glideCycle = (time * 0.42 + b.phase * 0.3) % 1.0;
                if (glideCycle > 0.72) {
                  b.wingPose = 'glide';
                } else {
                  b.flapPhase = (b.flapPhase + dt * b.flapFreq * gFreq) % TAU;
                  const wv = Math.sin(b.flapPhase);
                  b.wingPose = wv > 0.28 ? 'up' : (wv < -0.28 ? 'down' : 'glide');
                }
                b.tailYaw = Math.sin(time * 4.2 + b.phase) * 0.22 * flex;
              }
            }

            // 最终硬边界钳制（停靠在移动宿主上时不强制拉断挂点，其余一律 <= maxRadius * 0.80）
            if (b.mode !== 'mounted' && b.mode !== 'mountApproach') {
              const [cx, cy] = clampToSafeRadius(b.x, b.y, homeX, homeY, rawMaxR * 0.80);
              b.x = cx;
              b.y = cy;
            }

            footContacts[i].x = b.x + b.z * 0.14;
            footContacts[i].y = b.y - b.z * 0.14;
            footContacts[i].z = b.z;
            footContacts[i].r = (b.wingPose === 'fold' ? 3.2 : 4.2) * sMul;

            sumX += b.x;
            sumY += b.y;
            sumZ += b.z;
          }

          footContacts[BIRD_PROFILES.length].x = pile.x;
          footContacts[BIRD_PROFILES.length].y = pile.y;
          footContacts[BIRD_PROFILES.length].z = 0.5;
          footContacts[BIRD_PROFILES.length].r = 5.6 * sMul;

          state.x = sumX / birds.length;
          state.y = sumY / birds.length;
          state.z = sumZ / birds.length;
          state.yaw = birds[0].yaw;
          sockets.setWorld('leadBird', birds[0].x, birds[0].y, birds[0].z + 5 * sMul, birds[0].yaw);
          sockets.setWorld('stonePile', pile.x, pile.y, pile.z + 4 * sMul, pile.yaw);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);

          // 1. 浅滩鹅卵石堆
          list.push({
            partKey: 'stonePile',
            asset: parts.stonePile,
            x: pile.x,
            y: pile.y,
            lift: Math.max(0.4, pile.z),
            ro: pile.yaw,
            bias: -0.20,
            submerge: isWater ? 0.16 : 0
          });

          // 2. 正在坠落的石子/短枝
          for (let i = 0; i < droppedItems.length; i++) {
            const it = droppedItems[i];
            const key = it.kind === 'twig' ? 'twig' : 'pebble';
            list.push({
              partKey: key,
              asset: parts[key],
              x: it.x,
              y: it.y,
              lift: Math.max(0.8, it.z),
              ro: it.yaw,
              bias: 0.65,
              submerge: 0
            });
          }

          // 3. 5 只共享贴图花鸟
          for (let i = 0; i < birds.length; i++) {
            const b = birds[i];
            const yw = b.yaw;
            const airBias = b.sortBias > 0 ? b.sortBias : (b.z > 8 ? 0.90 : 0.25);

            // A) 独立摆动深青蓝扇尾
            const tYaw = wrapAngle(yw + b.tailYaw);
            const [tjx, tjy] = localToWorldXY(b.x, b.y, yw, 0, TAIL_PIVOT.attachY * sMul);
            const [tx, ty] = pivotToWorldXY(tjx, tjy, tYaw, TAIL_PIVOT.x * sMul, TAIL_PIVOT.y * sMul);
            list.push({
              partKey: 'tailFan',
              asset: parts.tailFan,
              x: tx,
              y: ty,
              lift: Math.max(0.5, b.z + 0.8 * sMul),
              ro: tYaw,
              bias: airBias - 0.10,
              submerge: 0
            });

            // B) 左右四档无损翅
            const pose = b.wingPose;
            const piv = WING_PIVOTS[pose] || WING_PIVOTS.glide;
            const lKey = pose === 'up' ? 'wingUpL' : (pose === 'down' ? 'wingDownL' : (pose === 'fold' ? 'wingFoldL' : 'wingGlideL'));
            const rKey = pose === 'up' ? 'wingUpR' : (pose === 'down' ? 'wingDownR' : (pose === 'fold' ? 'wingFoldR' : 'wingGlideR'));
            const wLift = (pose === 'down' ? -0.4 : (pose === 'up' ? 1.4 : 1.0)) * sMul;

            const [ljx, ljy] = localToWorldXY(b.x, b.y, yw, -piv.attachX * sMul, piv.attachY * sMul);
            const [lx, ly] = pivotToWorldXY(ljx, ljy, yw, piv.x * sMul, piv.y * sMul);
            list.push({
              partKey: lKey,
              asset: parts[lKey],
              x: lx,
              y: ly,
              lift: Math.max(0.5, b.z + wLift),
              ro: yw,
              bias: airBias + 0.05,
              submerge: 0
            });

            const [rjx, rjy] = localToWorldXY(b.x, b.y, yw, piv.attachX * sMul, piv.attachY * sMul);
            const [rx, ry] = pivotToWorldXY(rjx, rjy, yw, -piv.x * sMul, piv.y * sMul);
            list.push({
              partKey: rKey,
              asset: parts[rKey],
              x: rx,
              y: ry,
              lift: Math.max(0.5, b.z + wLift),
              ro: yw,
              bias: airBias + 0.05,
              submerge: 0
            });

            // C) 花鸟主体
            list.push({
              partKey: 'birdBody',
              asset: parts.birdBody,
              x: b.x,
              y: b.y,
              lift: Math.max(0.5, b.z),
              ro: yw,
              bias: airBias + 0.14,
              submerge: 0
            });

            // D) 喙中醒目衔物（亮灰白小石子或赭色短枝）
            if (b.carrying) {
              const itemKey = b.item === 'twig' ? 'twig' : 'pebble';
              const [ix, iy] = localToWorldXY(b.x, b.y, yw, 0, 7.6 * sMul);
              list.push({
                partKey: itemKey,
                asset: parts[itemKey],
                x: ix,
                y: iy,
                lift: Math.max(0.5, b.z + 3.4 * sMul),
                ro: yw,
                bias: airBias + 0.26,
                submerge: 0
              });
            }
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Water2Def.id,
            code: Water2Def.code,
            status: Water2Def.status,
            name: Water2Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            flockCount: birds.length,
            footRadius: 4.2,
            headZ: 9,
            centerZ: 5,
            blocks: Water2Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Water2Def);
})(window.PixelWorkshop);
