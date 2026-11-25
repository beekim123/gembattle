'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 沙5 · 鳄口伏水兽（古埃及 Ammit · M07 三拼半潜伏击兽，+Y 正前，z=0 贴地）
  //   1. 三拼特征极度分明：
  //      - 墨绿长吻鳄鱼头（配雪白锯齿利齿 + 鲜红口腔，闭口/大幅打哈欠双档无损烘焙）
  //      - 蓬松亮金橙雄狮鬃毛前肩 + 健壮金棕前狮爪
  //      - 浑圆深紫褐河马后躯 + 6 节墨绿锯齿脊鳄尾链；
  //   2. 绿洲浅水半潜伏击（submerge 染水色），偶发浮起大幅张开鳄口打哈欠露齿
  //      并荡起水波涟漪与水沫；
  //   3. 3 套零重建模换色皮肤，actions 含 patrol / idle / yawn。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 墨绿鳄鱼头与鳄尾
      crocDark:   '#12301d',
      crocMid:    '#215734',
      crocHi:     '#3f8c54',
      // 鳄背硬脊鳞
      ridgeDark:  '#0b1f13',
      ridgeMid:   '#173d25',
      ridgeHi:    '#2f6e44',
      // 蓬松亮金橙雄狮鬃毛（与墨绿鳄首、深紫河马躯极强分色）
      maneDark:   '#943f0d',
      maneMid:    '#e0761b',
      maneHi:     '#ffbe47',
      // 金棕狮肩与前爪
      lionDark:   '#784e22',
      lionMid:    '#ba803d',
      lionHi:     '#ebba6c',
      // 浑圆深紫褐河马后躯
      hippoDark:  '#2e1f2c',
      hippoMid:   '#52384c',
      hippoHi:    '#7d5a73',
      // 河马浅紫灰腹底
      bellyDark:  '#4d3c47',
      bellyMid:   '#7a6270',
      bellyHi:    '#a88d9c',
      // 雪白利齿与趾爪
      toothDark:  '#c7ccc4',
      toothMid:   '#e8ede6',
      toothHi:    '#ffffff',
      // 鲜红鳄口内腔与舌
      mouthDark:  '#6e1620',
      mouthMid:   '#b52836',
      mouthHi:    '#eb5966',
      // 金黄鳄眼（eyeGlint 严禁进 glowKeys）
      eyeDark:    '#0d0f0d',
      eyeIris:    '#ffd029',
      eyeGlint:   '#f7fffc'
    },
    glowKeys: [],
    parts: [
      'croc', 'ridge', 'mane', 'lion', 'hippo', 'belly', 'tooth', 'mouth', 'eye'
    ],
    noCrease: [
      ['croc', 'ridge'], ['croc', 'tooth'], ['croc', 'mouth'], ['croc', 'eye'],
      ['mane', 'lion'], ['mane', 'hippo'], ['lion', 'hippo'],
      ['hippo', 'belly'], ['hippo', 'croc'], ['lion', 'tooth'], ['hippo', 'tooth']
    ],
    materials: {
      croc:  ['crocDark',  'crocMid',  'crocHi'],
      ridge: ['ridgeDark', 'ridgeMid', 'ridgeHi'],
      mane:  ['maneDark',  'maneMid',  'maneHi'],
      lion:  ['lionDark',  'lionMid',  'lionHi'],
      hippo: ['hippoDark', 'hippoMid', 'hippoHi'],
      belly: ['bellyDark', 'bellyMid', 'bellyHi'],
      tooth: ['toothDark', 'toothMid', 'toothHi'],
      mouth: ['mouthDark', 'mouthMid', 'mouthHi']
    },
    protectedParts: ['eye', 'tooth', 'mouth', 'mane']
  });

  // 3 套零重建模换色皮肤
  const SKINS = [
    {
      id: 'nile_oasis',
      name: '碧鳄金鬃（绿洲经典）',
      dot: '#e0761b',
      outline: '#0c1410',
      pal: {},
      fx: { splash: '#d4f7f2', ripple: '#5ec9c0' }
    },
    {
      id: 'sand_saffron',
      name: '青鳄赤鬃（红沙绿洲款）',
      dot: '#cc3b1e',
      outline: '#140c0c',
      pal: {
        crocDark:  '#102e2e', crocMid:  '#1d5754', crocHi:  '#3a8c84',
        ridgeDark: '#091c1c', ridgeMid: '#133b3b', ridgeHi: '#286b69',
        maneDark:  '#8a2012', maneMid:  '#d43e22', maneHi:  '#ff8547',
        lionDark:  '#824224', lionMid:  '#c76d3c', lionHi:  '#f2a66b',
        hippoDark: '#362320', hippoMid: '#5e3d36', hippoHi: '#8a6056',
        eyeIris:   '#ffae1f'
      },
      fx: { splash: '#f2eadc', ripple: '#73b8ad' }
    },
    {
      id: 'jade_amber',
      name: '翠鳄明黄（浅泉款）',
      dot: '#ebbd26',
      outline: '#0c1714',
      pal: {
        crocDark:  '#173b1d', crocMid:  '#2e7036', crocHi:  '#59b05e',
        ridgeDark: '#0e2412', ridgeMid: '#1d4a23', ridgeHi: '#3a8240',
        maneDark:  '#9c740c', maneMid:  '#e8b51e', maneHi:  '#ffea6e',
        lionDark:  '#7d6224', lionMid:  '#bf993f', lionHi:  '#f0cf73',
        hippoDark: '#25293b', hippoMid: '#424a69', hippoHi: '#6b779e',
        eyeIris:   '#ff881f'
      },
      fx: { splash: '#e0fcf7', ripple: '#6ee0d5' }
    }
  ];

  // =========================================================================
  // 1. 三拼主躯干（前：蓬松亮金橙雄狮鬃毛肩；后：浑圆深紫褐河马臀腹，22×28×16）
  // =========================================================================
  function buildTorso(makeCanvas) {
    const m = new VoxelModel(22, 28, 16, SPEC);
    const { mat, partId } = SPEC;

    // 浑圆深紫褐河马后躯与中腰（Y < 2.5）
    m.fillAABB(-9.8, 9.8, -13.0, 6.0, 1, 14, (x, y, z, X, Y) => {
      const dRump  = (Math.hypot(X / 8.8, (Y + 6.2) / 6.8, (z - 7.6) / 5.6) - 1) * 6.0;
      const dWaist = (Math.hypot(X / 7.2, (Y - 0.6) / 6.0, (z - 7.0) / 5.0) - 1) * 5.2;
      const d = smin(dRump, dWaist, 2.2);
      if (d > 0) return;
      const isBelly = z < 3.8 && Math.abs(X) < 6.4;
      m.setRaw(x, y, z, isBelly ? mat('belly') : mat('hippo'), isBelly ? partId.belly : partId.hippo);
    });

    // 金棕雄狮前胸与肩部核心（Y >= 2.0）
    m.paintEllipsoid(0, 5.2, 7.6, 6.4, 5.4, 5.0, mat('lion'), partId.lion, true);

    // 夸张蓬松亮金橙雄狮鬃毛大围领（放射簇状鬃毛，俯视 ×4 辨识度拉满！）
    const maneTufts = [
      [ 0.0,  6.8, 11.8, 4.6, 3.8, 2.8],
      [-5.6,  6.2,  9.8, 3.8, 4.2, 3.6],
      [ 5.6,  6.2,  9.8, 3.8, 4.2, 3.6],
      [-7.4,  4.4,  7.4, 3.2, 3.8, 3.2],
      [ 7.4,  4.4,  7.4, 3.2, 3.8, 3.2],
      [-4.2,  2.8, 11.2, 3.4, 3.4, 2.8],
      [ 4.2,  2.8, 11.2, 3.4, 3.4, 2.8],
      [ 0.0,  9.4,  8.6, 5.4, 3.0, 3.6],
      [-5.2,  8.6,  6.6, 3.2, 2.8, 2.8],
      [ 5.2,  8.6,  6.6, 3.2, 2.8, 2.8],
      [ 0.0,  7.4,  3.8, 4.8, 3.2, 2.4]
    ];
    for (const [mx, my, mz, rx, ry, rz] of maneTufts) {
      m.paintEllipsoid(mx, my, mz, rx, ry, rz, mat('mane'), partId.mane, true);
    }

    // 河马后臀一对可爱小圆耳状皮褶与背部浅脊
    m.paintEllipsoid(0, -10.8, 8.6, 4.2, 2.4, 2.6, mat('hippo'), partId.hippo, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 11.8, headZ: 16, centerZ: 8 });
  }

  // =========================================================================
  // 2. 墨绿长吻鳄鱼头（2 档无损烘焙：closed 闭口露齿 / yawn 大幅张口打哈欠）
  //    尺寸 14×26×16，枢轴锁在后颈 (0, -6.4)
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -6.4 };
  function buildCrocHead(makeCanvas, yawn) {
    const W = 14, D = 26, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 粗实鳄颈嵌入金橙狮鬃
    m.paintCapsule(0, -7.2, 5.2, 0, -2.4, 5.6, 4.0, 4.2, mat('croc'), partId.croc, true);
    // 宽扁鳄鱼后颅 + 高凸眉眼眶（半潜时高露水面）
    m.paintEllipsoid(0, -1.6, 6.2, 4.4, 4.0, 3.2, mat('croc'), partId.croc, true);
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 2.6, -0.4, 8.8, 1.55, 1.85, 1.45, mat('ridge'), partId.ridge, true);
    }

    if (yawn) {
      // 大幅张开鳄口打哈欠：上颌高高扬起、下颌沉低，露出鲜红口腔、红舌与双排雪白利齿！
      // 上颌长吻斜挑向上
      m.paintCapsule(0, 0.8, 7.6, 0, 10.2, 13.0, 3.4, 2.1, mat('croc'), partId.croc, true);
      m.paintEllipsoid(0, 10.6, 13.6, 2.2, 1.6, 1.2, mat('ridge'), partId.ridge, true);
      // 上颌红内腔
      m.paintCapsule(0, 1.6, 6.6, 0, 8.6, 11.4, 2.4, 1.4, mat('mouth'), partId.mouth, true);
      // 下颌长吻平伸微降
      m.paintCapsule(0, 0.4, 3.4, 0, 10.4, 2.2, 3.2, 1.9, mat('croc'), partId.croc, true);
      // 下颌鲜红口腔与宽舌
      m.paintCapsule(0, 1.4, 4.4, 0, 8.8, 3.3, 2.5, 1.4, mat('mouth'), partId.mouth, true);

      // 双排醒目雪白锯齿利齿（上下各 4 对）
      for (const s of [-1, 1]) {
        const upPts = [[2.5, 3.2, 6.4], [2.2, 5.4, 7.8], [1.9, 7.6, 9.4], [1.6, 9.6, 10.9]];
        for (const [tx, ty, tz] of upPts) {
          m.paintCapsule(s * tx, ty, tz + 0.6, s * tx, ty + 0.2, tz - 1.1, 0.58, 0.32, mat('tooth'), partId.tooth, true);
        }
        const dnPts = [[2.4, 3.6, 4.4], [2.1, 5.8, 4.0], [1.8, 8.0, 3.6], [1.5, 10.0, 3.4]];
        for (const [tx, ty, tz] of dnPts) {
          m.paintCapsule(s * tx, ty, tz - 0.3, s * tx, ty + 0.2, tz + 1.2, 0.58, 0.32, mat('tooth'), partId.tooth, true);
        }
      }
    } else {
      // 闭口长吻：墨绿扁长鳄吻 + 鼻端凸起鼻孔 + 咬合缘外露雪白利齿
      m.paintCapsule(0, 0.8, 5.8, 0, 11.0, 5.2, 3.5, 2.1, mat('croc'), partId.croc, true);
      m.paintCapsule(0, 0.6, 3.8, 0, 10.6, 3.8, 3.2, 1.9, mat('croc'), partId.croc, true);
      // 吻顶双排背脊鳞与鼻端隆起
      m.paintCapsule(-1.2, 1.4, 7.4, -0.8, 9.6, 6.6, 0.72, 0.55, mat('ridge'), partId.ridge, true);
      m.paintCapsule( 1.2, 1.4, 7.4,  0.8, 9.6, 6.6, 0.72, 0.55, mat('ridge'), partId.ridge, true);
      m.paintEllipsoid(0, 11.2, 6.0, 2.1, 1.4, 1.1, mat('ridge'), partId.ridge, true);

      // 外露雪白交错利齿（闭口俯视同样极其清楚！）
      for (const s of [-1, 1]) {
        const teethY = [3.0, 5.2, 7.4, 9.6];
        for (let i = 0; i < teethY.length; i++) {
          const ty = teethY[i];
          const tx = s * lerp(3.1, 2.0, i / 3);
          m.paintEllipsoid(tx, ty, 4.4, 0.68, 0.62, 0.95, mat('tooth'), partId.tooth, true);
        }
      }
    }

    m.despeckle();
    m.applyArtShading(true);

    // 高凸金黄鳄眼（位于眉眶顶侧，eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd - 0.2);
    const eyeZ = 9;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 3.2);
      m.setRaw(ex, eyeY,     eyeZ,     keyToId.eyeIris,  partId.eye);
      m.setRaw(ex, eyeY + 1, eyeZ,     keyToId.eyeDark,  partId.eye);
      m.setRaw(ex, eyeY,     eyeZ + 1, keyToId.eyeIris,  partId.eye);
      m.setRaw(ex, eyeY + 1, eyeZ + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 6.2, headZ: 15, centerZ: 7 });
  }

  // =========================================================================
  // 3. 前狮腿（金棕）与后河马腿（深紫褐），三拼前后腿分色明确
  // =========================================================================
  function buildLegSeg(makeCanvas, matKey, partKey, rTop, rBot, hLen) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 4);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat(matKey), partId[partKey], true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildPaw(makeCanvas, isFront) {
    const m = new VoxelModel(8, 9, 4, SPEC);
    const { mat, partId } = SPEC;
    const mk = isFront ? 'lion' : 'hippo';
    const pk = isFront ? partId.lion : partId.hippo;
    m.paintEllipsoid(0, 0, 1.5, 2.5, 2.8, 1.3, mat(mk), pk, true);
    for (const tx of [-1.5, 0, 1.5]) {
      m.paintEllipsoid(tx, 2.6, 1.0, 0.72, 0.95, 0.72, mat('tooth'), partId.tooth, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8 });
  }

  // =========================================================================
  // 4. 墨绿锯齿脊鳄尾链（6 节）
  // =========================================================================
  function buildCrocTailSeg(makeCanvas, r0, r1, lenY) {
    const W = Math.max(6, Math.ceil(r0 * 2 + 4));
    const D = Math.max(7, Math.ceil(lenY + r0 * 2 + 2));
    const H = Math.max(7, Math.ceil(r0 * 2 + 5));
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const cy = lenY * 0.5;
    const cz = r0 + 1.2;
    m.paintCapsule(0, -cy, cz, 0, cy, cz, r1, r0, mat('croc'), partId.croc, true);
    // 锯齿鳄尾背棘
    m.paintCapsule(0, 0, cz + r0 * 0.65, 0, -0.5, cz + r0 + 1.8, 0.95, 0.45, mat('ridge'), partId.ridge, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: r0, centerZ: Math.round(cz) });
  }

  const TAIL_KEYS = ['tail0', 'tail0', 'tail1', 'tail1', 'tail2', 'tail3'];

  const Sand5Def = {
    id: 'sand5_ammit',
    code: '沙5',
    status: 'done',
    name: '鳄口伏水兽',
    tag: 'M07 三拼半潜 · 鳄首狮鬃河马躯',
    summary: '墨绿长吻雪白利齿鳄鱼头 + 蓬松亮金橙雄狮鬃毛前肩 + 浑圆深紫褐河马后躯与鳄尾链；绿洲浅水半潜伏击，偶发大幅张开鳄口打哈欠露齿并荡起水波',
    defaultHabitat: 'oasis',
    footRadius: 12.2,
    ecoWeight: 1.65,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' },
      { id: 'yawn',   name: '张口打哈欠', loop: false, duration: 2.8, status: 'done' }
    ],
    blocks: [
      '墨绿长吻鳄首（闭口/打哈欠双态）',
      '蓬松亮金橙雄狮鬃毛前肩',
      '浑圆深紫褐河马后躯',
      '前狮后河马 4 足涉水 IK',
      '6 节墨绿锯齿脊鳄尾链'
    ],
    soulHabit: '在绿洲浅水半潜缓行仅露鳄眼鼻孔与亮金狮鬃，周期性缓缓浮起大幅张开鳄口打哈欠露出雪白利齿并荡起双圈水波涟漪',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torso:         buildTorso(makeCanvas),
        headClosed:    buildCrocHead(makeCanvas, false),
        headYawn:      buildCrocHead(makeCanvas, true),
        frontLegUpper: buildLegSeg(makeCanvas, 'lion', 'lion', 2.4, 2.0, 4.6),
        frontLegLower: buildLegSeg(makeCanvas, 'lion', 'lion', 2.0, 1.8, 4.4),
        frontPaw:      buildPaw(makeCanvas, true),
        backLegUpper:  buildLegSeg(makeCanvas, 'hippo', 'hippo', 2.8, 2.4, 4.6),
        backLegLower:  buildLegSeg(makeCanvas, 'hippo', 'hippo', 2.3, 2.1, 4.4),
        backPaw:       buildPaw(makeCanvas, false),
        tail0:         buildCrocTailSeg(makeCanvas, 2.7, 2.4, 3.2),
        tail1:         buildCrocTailSeg(makeCanvas, 2.2, 1.9, 3.2),
        tail2:         buildCrocTailSeg(makeCanvas, 1.75, 1.45, 3.0),
        tail3:         buildCrocTailSeg(makeCanvas, 1.35, 0.95, 2.8)
      };

      const gait = new MultiLegGaitSolver([
        { id: 'FL', hipX: -5.8, hipY:  6.0, hipZ: 3.0, restX: -7.2, restY:  6.6, group: 0, L1: 5.2, L2: 5.4, kneeSign: -1 },
        { id: 'FR', hipX:  5.8, hipY:  6.0, hipZ: 3.0, restX:  7.2, restY:  6.6, group: 1, L1: 5.2, L2: 5.4, kneeSign: -1 },
        { id: 'BL', hipX: -6.2, hipY: -7.2, hipZ: 3.0, restX: -7.6, restY: -7.2, group: 1, L1: 5.2, L2: 5.4, kneeSign:  1 },
        { id: 'BR', hipX:  6.2, hipY: -7.2, hipZ: 3.0, restX:  7.6, restY: -7.2, group: 0, L1: 5.2, L2: 5.4, kneeSign:  1 }
      ], {
        mode: 'walk4',
        stepThreshold: 4.0,
        stepDuration: 0.28,
        stepHeight: 2.0,
        strideAnticipation: 0.44
      });

      const tailChain = new ChainSolver(7, 3.2, {
        maxAngle: 0.54,
        waveFreq: 2.6,
        wavePhaseStep: 0.56,
        waveAmp: 0.34
      });

      const submergeSpring = new SpringDamper1D(0.6, 36, 6.8);
      const headYawSpring  = new SpringDamper1D(0, 56, 7.2);
      const bodyBounce     = new SpringDamper1D(0, 115, 8.0);

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 4.2,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        stage: 'lurk', // 'lurk' (半潜伏击游走) | 'yawn' (浮起大幅张口打哈欠)
        stageTime: 0,
        yawnRippleDone: false,
        wakeCd: 0,
        tiltX: 0,
        tiltY: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: Sand5Def,
        cachePrefix: `sand5_am_${Math.random().toString(36).slice(2, 7)}`,
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
          state.x = homeX; state.y = homeY; state.z = 4.2;
          state.vx = 0; state.vy = 0; state.yaw = homeYaw;
          state.stage = 'lurk';
          state.stageTime = 0;
          state.yawnRippleDone = false;
          state.wakeCd = 0;
          state.tiltX = 0; state.tiltY = 0;
          submergeSpring.x = 0.6; submergeSpring.v = 0;
          headYawSpring.x = headYawSpring.v = 0;
          bodyBounce.x = bodyBounce.v = 0;
          gait.reset(homeX, homeY, homeYaw);
          const [tx, ty] = localToWorldXY(homeX, homeY, homeYaw, 0, -11.8);
          tailChain.reset(tx, ty, 3.0, homeYaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const maxR = ((eco && eco.maxRadius) || 44) * 0.80;

          const forceYawn = !!(eco && eco.action === 'yawn');
          const isIdle = !forceYawn && !!(eco && (eco.action === 'idle' || eco.patrol === false));

          state.stageTime += dt;
          if (forceYawn && state.stage !== 'yawn') {
            state.stage = 'yawn';
            state.stageTime = 0;
            state.yawnRippleDone = false;
          } else if (state.stage === 'lurk') {
            const lurkDur = isIdle ? 3.2 : 6.2;
            if (state.stageTime >= lurkDur) {
              state.stage = 'yawn';
              state.stageTime = 0;
              state.yawnRippleDone = false;
            }
          } else if (state.stage === 'yawn') {
            if (!state.yawnRippleDone && state.stageTime >= 0.35) {
              state.yawnRippleDone = true;
              bodyBounce.impulse(9.5 * sMul);
              if (vfx) {
                const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, 0, 14.0 * sMul);
                vfx.addRipple(mx, my, 3.0 * sMul, 20.0 * sMul, 0.95, 2.0);
                vfx.addRipple(state.x, state.y, 4.5 * sMul, 24.0 * sMul, 1.15, 1.6);
                if (habitat && habitat.fx) vfx.spawnSplash(mx, my, 8, 0.85 * sMul, habitat.fx);
              }
            }
            if (!forceYawn && state.stageTime >= 2.6) {
              state.stage = 'lurk';
              state.stageTime = 0;
            }
          }

          const isYawning = state.stage === 'yawn';
          const canWalk = !isIdle && !isYawning;

          // 半潜深度：绿洲浅水伏击时微沉，打哈欠时浮起展示完整三拼造型与鳄口白齿
          const sinkTarget = isYawning ? 0.0 : (habitat && habitat.isWater ? 0.72 : 0.25);
          const sink = clamp(submergeSpring.update(dt, sinkTarget, 36 * sp, clamp(6.8 * dScale, 3.0, 10.5)), 0, 1);
          const baseLift = lerp(6.6, 3.8, sink) * sMul;

          Propulsion.multiLegWalk(state, dt, time, params, {
            ...eco,
            maxRadius: maxR * 0.95,
            walkStyle: 'heavy',
            patrol: canWalk,
            baseLift,
            pauseFactor: canWalk ? 1.0 : 0
          });

          // 严格钳制在 maxRadius * 0.80 内
          const rNow = Math.hypot(state.x, state.y);
          if (rNow > maxR) {
            const sBack = maxR / rNow;
            state.x *= sBack;
            state.y *= sBack;
          }

          const gaitRes = gait.update(dt, state.x, state.y, state.z, state.yaw, state.vx, state.vy, {
            mode: 'walk4',
            scaleMul: sMul,
            stepFreq: freq * 0.95,
            stepHeight: 1.8 * sMul,
            stepThreshold: 4.0 * sMul
          });
          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 0.85 * sMul, expSmooth(dt, 9.5));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 0.85 * sMul, expSmooth(dt, 9.5));
          if (gaitRes.landed.length > 0) {
            bodyBounce.impulse(-9.0 * sMul);
            for (const leg of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, leg.footX, leg.footY, 0.85 * sMul);
            }
          }

          // 浅水涉行 V 形尾迹
          state.wakeCd -= dt;
          if (vfx && habitat && habitat.isWater && Math.hypot(state.vx, state.vy) > 1.5 && state.wakeCd <= 0) {
            state.wakeCd = 0.34;
            vfx.addWake(state.x, state.y, state.yaw, 9.5 * sMul, 1.15);
          }

          // 6 节鳄尾链
          const [tRootX, tRootY] = localToWorldXY(state.x, state.y, state.yaw, 0, -11.8 * sMul);
          tailChain.update(dt, tRootX, tRootY, Math.max(1.8 * sMul, state.z + 1.2 * sMul), state.yaw, time, {
            segLen: 3.2 * sMul,
            flexibility: flex,
            waveFreq: 2.5 * freq,
            waveAmp: 0.36,
            restAlign: 0.08,
            zTargetFn: (u) => Math.max(1.2 * sMul, lerp(state.z + 1.0 * sMul, 1.6 * sMul, u))
          });

          bodyBounce.update(dt, -gaitRes.liftSum * 0.10, 115 * sp, clamp(8.0 * dScale, 3.2, 12.0));
          const targetHeadYaw = isYawning ? Math.sin(time * 2.2) * 0.14 : Math.sin(time * 1.3) * 0.24;
          headYawSpring.update(dt, targetHeadYaw, 56 * sp, clamp(7.2 * dScale, 3.0, 11.0));

          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 3.0 * sMul }));
          sockets.setLocal('jaw', state.x, state.y, state.z, state.yaw, 0, 14.5, 7.0, sMul);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const wl = habitat ? (habitat.waterLevel ?? -99) : -99;
          const yw = state.yaw;
          const bodyLift = Math.max(2.2 * sMul, state.z + clamp(bodyBounce.x * 0.12, -1.4, 1.4));
          const bx = state.x + state.tiltX;
          const by = state.y + state.tiltY;
          const isYawning = state.stage === 'yawn';

          // 1. 4 条腿（前：金棕狮腿；后：深紫褐河马腿）
          for (let li = 0; li < gait.legs.length; li++) {
            const leg = gait.legs[li];
            const isFront = li < 2;
            const uKey = isFront ? 'frontLegUpper' : 'backLegUpper';
            const lKey = isFront ? 'frontLegLower' : 'backLegLower';
            const pKey = isFront ? 'frontPaw' : 'backPaw';
            const hx = leg.hipWX + state.tiltX;
            const hy = leg.hipWY + state.tiltY;
            const samples = [
              { k: uKey, x: lerp(hx, leg.kneeX, 0.25), y: lerp(hy, leg.kneeY, 0.25), z: lerp(leg.hipWZ, leg.kneeZ, 0.25), b: -0.50, sym: 90 },
              { k: lKey, x: lerp(leg.kneeX, leg.footX, 0.50), y: lerp(leg.kneeY, leg.footY, 0.50), z: lerp(leg.kneeZ, leg.footZ + 1.5 * sMul, 0.50), b: -0.40, sym: 90 },
              { k: pKey, x: leg.footX, y: leg.footY, z: leg.footZ, b: -0.30, sym: 360 }
            ];
            for (const pt of samples) {
              list.push({
                partKey: pt.k,
                asset: parts[pt.k],
                x: pt.x,
                y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === pKey ? 0 : 1.8 * sMul)),
                ro: yw,
                symDeg: pt.sym,
                bias: pt.b,
                submerge: EnvFeedback.calcSubmerge(pt.z + 0.8, wl, 4.2, isWater)
              });
            }
          }

          // 2. 6 节墨绿锯齿脊鳄尾链
          for (let i = 1; i < tailChain.nodes.length; i++) {
            const n = tailChain.nodes[i];
            const k = TAIL_KEYS[i - 1] || 'tail3';
            list.push({
              partKey: k,
              asset: parts[k],
              x: n.x,
              y: n.y,
              lift: Math.max(0.3, n.z - 1.2 * sMul),
              ro: n.yaw,
              bias: -0.18 - i * 0.02,
              submerge: EnvFeedback.calcSubmerge(n.z + 0.5, wl, 4.2, isWater)
            });
          }

          // 3. 蓬松亮金橙狮鬃前肩 + 浑圆深紫褐河马后躯
          list.push({
            partKey: 'torso',
            asset: parts.torso,
            x: bx,
            y: by,
            lift: bodyLift,
            ro: yw,
            bias: 0.30,
            submerge: EnvFeedback.calcSubmerge(bodyLift + 1.5, wl, 4.8, isWater)
          });

          // 4. 墨绿长吻鳄鱼头（打哈欠切换 headYawn）
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.46, 0.46));
          const [hjx, hjy] = localToWorldXY(bx, by, yw, 0, 10.8 * sMul);
          const [hx, hy] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const hKey = isYawning ? 'headYawn' : 'headClosed';
          list.push({
            partKey: hKey,
            asset: parts[hKey],
            x: hx,
            y: hy,
            lift: bodyLift + (isYawning ? 4.4 : 3.2) * sMul,
            ro: hYaw,
            bias: 0.72,
            submerge: EnvFeedback.calcSubmerge(bodyLift + 3.2, wl, 4.4, isWater)
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Sand5Def.id,
            code: Sand5Def.code,
            status: Sand5Def.status,
            name: Sand5Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            stage: state.stage,
            footRadius: Sand5Def.footRadius,
            headZ: 18,
            centerZ: 9,
            blocks: Sand5Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Sand5Def);
})(window.PixelWorkshop);
