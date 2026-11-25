'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 沙2 · 吞铁兽（韩国不可杀伊 · M12 动态成长版，+Y 正前，z=0 贴地）
  //   1. 无嘴厚重黑铁青兽躯，在黄沙地台上具有极强冷暖与明暗对比；
  //   2. 身上夸张嵌满亮银刀剑刃、赤铜锅片与金黄齿轮碎件；通过解锁叠挂 4 档
  //      独立金属背件表现「越吃越大」，全程严禁常态 scaleX/scaleY 拉伸；
  //   3. 腹底垂挂一簇深红细密根须，自带 4 件散落金属碎片，停在碎片上方伸出
  //      根须缠绕吸入体内，每吃一件解锁新一层金属背件并喷出铜铁碎屑；
  //   4. 3 套零重建模换色皮肤，actions 含 patrol / idle / absorb。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 厚重黑铁青兽躯主材（与黄沙强对比）
      hideDark:   '#171e26',
      hideMid:    '#293542',
      hideHi:     '#46586b',
      // 胸腹深铁灰
      bellyDark:  '#222830',
      bellyMid:   '#39424f',
      bellyHi:    '#5a6778',
      // 亮银刀剑刃（高对比金属亮边）
      steelDark:  '#6f7f91',
      steelMid:   '#b6c6d6',
      steelHi:    '#eef5fc',
      // 赤铜锅片与铜环
      copperDark: '#7a2f18',
      copperMid:  '#c45127',
      copperHi:   '#f28f57',
      // 金黄齿轮与铜铆件
      brassDark:  '#8c5f12',
      brassMid:   '#d99d24',
      brassHi:    '#ffe063',
      // 腹底深红细密根须
      rootDark:   '#54111a',
      rootMid:    '#991f2f',
      rootHi:     '#de4756',
      // 粗铁蹄与关节铆钉
      hoofDark:   '#12151a',
      hoofMid:    '#282e38',
      hoofHi:     '#4a5363',
      // 锐利小眼（eyeGlint 严禁进 glowKeys）
      eyeDark:    '#0c0d10',
      eyeIris:    '#f0921f',
      eyeGlint:   '#f7fcff'
    },
    glowKeys: [],
    parts: [
      'hide', 'belly', 'steel', 'copper', 'brass', 'root', 'hoof', 'eye'
    ],
    noCrease: [
      ['hide', 'belly'], ['hide', 'steel'], ['hide', 'copper'],
      ['hide', 'brass'], ['hide', 'root'], ['hide', 'hoof'],
      ['hide', 'eye'], ['steel', 'copper'], ['steel', 'brass'], ['copper', 'brass']
    ],
    materials: {
      hide:   ['hideDark',   'hideMid',   'hideHi'],
      belly:  ['bellyDark',  'bellyMid',  'bellyHi'],
      steel:  ['steelDark',  'steelMid',  'steelHi'],
      copper: ['copperDark', 'copperMid', 'copperHi'],
      brass:  ['brassDark',  'brassMid',  'brassHi'],
      root:   ['rootDark',   'rootMid',   'rootHi'],
      hoof:   ['hoofDark',   'hoofMid',   'hoofHi']
    },
    protectedParts: ['eye', 'steel', 'brass', 'root']
  });

  // 3 套零重建模换色皮肤
  const SKINS = [
    {
      id: 'black_iron',
      name: '黑铁青躯（戈壁经典）',
      dot: '#344759',
      outline: '#0b0e14',
      pal: {},
      fx: { spark: '#ffe063', rust: '#d97236', root: '#de4756', sand: '#d6ae6d' }
    },
    {
      id: 'oxidized_bronze',
      name: '锈青古铜（铜绿款）',
      dot: '#2f7a68',
      outline: '#0a1412',
      pal: {
        hideDark:   '#142926', hideMid:   '#244a44', hideHi:   '#3f786d',
        bellyDark:  '#1f3330', bellyMid:  '#35544e', bellyHi:  '#558077',
        steelDark:  '#7c8d94', steelMid:  '#c3d5db', steelHi:  '#f0fafc',
        copperDark: '#8c3c1b', copperMid: '#d96930', copperHi: '#ffa863',
        brassDark:  '#946c19', brassMid:  '#e0ad34', brassHi:  '#ffea7a',
        rootDark:   '#6b1929', rootMid:   '#b52b42', rootHi:   '#f25c72',
        eyeIris:    '#ffae2b'
      },
      fx: { spark: '#ffea7a', rust: '#d96930', root: '#f25c72', sand: '#c9b37e' }
    },
    {
      id: 'forge_obsidian',
      name: '玄炭赤铁（红漠款）',
      dot: '#7a2c24',
      outline: '#120a0a',
      pal: {
        hideDark:   '#1e181c', hideMid:   '#362b33', hideHi:   '#594854',
        bellyDark:  '#2b2224', bellyMid:  '#4a3a3d', bellyHi:  '#70595e',
        steelDark:  '#858c99', steelMid:  '#c9d0db', steelHi:  '#f5f7fa',
        copperDark: '#96281c', copperMid: '#de4733', copperHi: '#ff8266',
        brassDark:  '#a36614', brassMid:  '#eb9e24', brassHi:  '#ffd95c',
        rootDark:   '#781612', rootMid:   '#c4291e', rootHi:   '#ff5e47',
        eyeIris:    '#ff6a1f'
      },
      fx: { spark: '#ffd95c', rust: '#de4733', root: '#ff5e47', sand: '#cf8255' }
    }
  ];

  // =========================================================================
  // 1. 无嘴厚重黑铁青兽躯（22×28×17），内置基础亮银碎刃与赤铜铆片
  // =========================================================================
  function buildTorso(makeCanvas) {
    const m = new VoxelModel(22, 28, 17, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-10.2, 10.2, -13.2, 13.2, 1, 16, (x, y, z, X, Y) => {
      const dFront = (Math.hypot(X / 8.2, (Y - 5.2) / 7.2, (z - 8.6) / 6.2) - 1) * 6.2;
      const dMid   = (Math.hypot(X / 8.8, (Y + 0.5) / 8.4, (z - 8.2) / 5.9) - 1) * 6.5;
      const dRear  = (Math.hypot(X / 7.8, (Y + 7.4) / 6.2, (z - 8.4) / 5.6) - 1) * 5.8;
      const dHump  = (Math.hypot(X / 5.6, (Y - 2.0) / 5.8, (z - 12.6) / 3.4) - 1) * 4.2;
      const d = smin(smin(dFront, dMid, 2.2), smin(dRear, dHump, 2.0), 2.2);
      if (d > 0) return;

      const isBelly = z < 4.4 && Math.abs(X) < 6.8;
      m.setRaw(x, y, z, isBelly ? mat('belly') : mat('hide'), isBelly ? partId.belly : partId.hide);
    });

    // 基础嵌在兽躯上的亮银短刃与铜钉（0 级即具鲜明金属辨识度）
    m.paintCapsule(-5.2, 3.0, 12.6, -7.8, 1.4, 15.8, 1.15, 0.55, mat('steel'), partId.steel, true);
    m.paintCapsule( 5.0, -3.2, 12.2, 7.6, -5.0, 15.6, 1.15, 0.55, mat('steel'), partId.steel, true);
    m.paintEllipsoid(0, 4.8, 14.4, 3.2, 2.6, 1.4, mat('copper'), partId.copper, true);
    m.paintEllipsoid(-6.8, -4.5, 9.4, 1.8, 2.2, 1.8, mat('brass'), partId.brass, true);
    m.paintEllipsoid( 6.8,  2.8, 9.4, 1.8, 2.2, 1.8, mat('brass'), partId.brass, true);

    // 腹底深红根须根盘（与悬垂根须无缝衔接）
    m.paintEllipsoid(0, 0.2, 2.2, 4.6, 5.4, 1.6, mat('root'), partId.root, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 12.0, headZ: 18, centerZ: 8 });
  }

  // =========================================================================
  // 2. 无嘴厚重铁青大头（16×16×14），无口裂、双小锐眼、额嵌断银刃
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -4.2 };
  function buildHead(makeCanvas) {
    const W = 16, D = 16, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 粗壮颈根嵌入前胸
    m.paintCapsule(0, -5.0, 4.8, 0, -1.2, 5.6, 4.6, 4.4, mat('hide'), partId.hide, true);
    // 无嘴方钝巨颅（下颌浑圆封死，没有任何口缝）
    m.fillAABB(-6.4, 6.4, -4.6, 6.8, 1, 11, (x, y, z, X, Y) => {
      const dSkull = (Math.hypot(X / 5.4, (Y - 0.6) / 5.4, (z - 6.0) / 4.2) - 1) * 4.4;
      const dSnout = (Math.hypot(X / 4.2, (Y - 3.8) / 3.2, (z - 4.8) / 3.2) - 1) * 3.4;
      if (smin(dSkull, dSnout, 1.6) > 0) return;
      m.setRaw(x, y, z, mat('hide'), partId.hide);
    });

    // 短粗铁耳 + 额顶斜插的亮银断剑刃 + 眉心赤铜铆钉
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 4.2, -1.6, 8.6, s * 6.0, -2.6, 10.6, 1.45, 0.95, mat('hide'), partId.hide, true);
    }
    m.paintCapsule(1.0, 0.8, 9.6, 3.4, 2.2, 13.4, 1.15, 0.50, mat('steel'), partId.steel, true);
    m.paintEllipsoid(-1.8, 3.6, 8.2, 1.35, 1.15, 1.05, mat('copper'), partId.copper, true);

    m.despeckle();
    m.applyArtShading(true);

    // 两侧小巧金橙锐眼（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 3.4);
    const eyeZ = 6;
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 5; step++) {
        const tx = Math.round(hw + s * (5.2 - step));
        if (m.getPartId(tx, eyeY, eyeZ) === partId.hide) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 3.8);
      m.setRaw(sx, eyeY,     eyeZ,     keyToId.eyeIris,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ,     keyToId.eyeDark,  partId.eye);
      m.setRaw(sx, eyeY,     eyeZ + 1, keyToId.eyeIris,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 14, centerZ: 6 });
  }

  // =========================================================================
  // 3. 4 档可解锁叠挂金属背件（表现「越吃越大」，100% 无损 1:1 零拉伸！）
  // =========================================================================
  // 档 1：亮银刀剑刃簇（高耸斜插肩背，在黄沙上极度醒目）
  function buildMetalBlades(makeCanvas) {
    const m = new VoxelModel(22, 20, 14, SPEC);
    const { mat, partId } = SPEC;
    // 左侧宽大亮银大刀刃
    m.paintCapsule(-4.0, 2.0, 1.5, -9.2, -1.0, 12.2, 1.55, 0.65, mat('steel'), partId.steel, true);
    m.paintCapsule(-3.2, 3.2, 2.2, -7.8,  0.4, 11.4, 1.25, 0.55, mat('steel'), partId.steel, true);
    // 右侧交错双剑刃
    m.paintCapsule( 3.6, 3.4, 1.5,  9.0,  1.2, 12.6, 1.35, 0.52, mat('steel'), partId.steel, true);
    m.paintCapsule( 2.4, -3.6, 1.5, 7.6, -7.2, 10.6, 1.25, 0.52, mat('steel'), partId.steel, true);
    // 剑格金铜护手
    m.paintEllipsoid(-5.2, 1.2, 3.4, 2.2, 1.3, 1.1, mat('brass'), partId.brass, true);
    m.paintEllipsoid( 5.0, 2.6, 3.6, 2.0, 1.3, 1.1, mat('copper'), partId.copper, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.5, headZ: 13, centerZ: 6 });
  }

  // 档 2：赤铜大锅片 + 锅耳（倒扣在背脊中后段，鲜亮赤铜色）
  function buildCopperPot(makeCanvas) {
    const m = new VoxelModel(18, 18, 10, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-7.5, 7.5, -7.5, 7.5, 1, 9, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 6.8, Y / 6.4);
      const dome = Math.sqrt(Math.max(0, 1 - r * r)) * 6.5;
      if (r <= 1.0 && z <= dome + 2.0 && z >= dome - 1.2) {
        m.setRaw(x, y, z, mat('copper'), partId.copper);
      }
    });
    // 锅边亮铜耳与裂口补丁
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 6.0, 0, 3.0, s * 7.8, 0, 5.2, 1.05, 0.85, mat('brass'), partId.brass, true);
    }
    m.paintEllipsoid(0, 1.6, 7.6, 2.6, 2.2, 1.1, mat('steel'), partId.steel, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.5, headZ: 9, centerZ: 5 });
  }

  // 档 3：金黄大齿轮（平嵌臀背，会慢速咬合转动，俯视辨识度拉满）
  function buildGoldGear(makeCanvas) {
    const m = new VoxelModel(16, 16, 6, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-7.2, 7.2, -7.2, 7.2, 1, 4, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const tooth = Math.cos(ang * 8) > 0.25 ? 1.55 : 0.0;
      if (r <= 5.2 + tooth && r >= 1.9) {
        m.setRaw(x, y, z, mat('brass'), partId.brass);
      } else if (r < 1.9) {
        m.setRaw(x, y, z, mat('copper'), partId.copper);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.0, headZ: 5, centerZ: 3 });
  }

  // 档 4：宽阔铁盾护肩（左右大幅外扩，解锁后整只横向体量明显膨大一圈）
  function buildArmorFlanks(makeCanvas) {
    const m = new VoxelModel(26, 20, 12, SPEC);
    const { mat, partId } = SPEC;
    for (const s of [-1, 1]) {
      // 两侧宽厚玄铁板与亮银盾缘
      m.paintEllipsoid(s * 9.4, 1.2, 5.8, 2.8, 6.2, 4.4, mat('hide'), partId.hide, true);
      m.paintCapsule(s * 10.6, 5.4, 7.2, s * 10.6, -4.4, 7.2, 1.35, 1.35, mat('steel'), partId.steel, true);
      m.paintEllipsoid(s * 10.8, 0.8, 5.4, 1.4, 2.6, 2.2, mat('brass'), partId.brass, true);
      // 外挑小刃
      m.paintCapsule(s * 9.8, -3.8, 6.6, s * 12.0, -6.2, 10.4, 1.05, 0.45, mat('steel'), partId.steel, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 12.2, headZ: 11, centerZ: 6 });
  }

  // =========================================================================
  // 4. 腹底深红细密根须簇（常态垂须 / 吸收态伸长）
  // =========================================================================
  function buildRootCluster(makeCanvas, extended) {
    const H = extended ? 10 : 7;
    const m = new VoxelModel(14, 14, H, SPEC);
    const { mat, partId } = SPEC;
    const topZ = H - 1.2;
    const strands = [
      [-3.8,  2.6], [ 3.8,  2.6], [-4.2, -2.4], [ 4.2, -2.4],
      [ 0.0,  4.0], [ 0.0, -4.0], [-2.0,  0.4], [ 2.0, -0.6],
      [ 0.0,  0.0]
    ];
    for (let i = 0; i < strands.length; i++) {
      const [rx, ry] = strands[i];
      const tipZ = extended ? (0.8 + (i % 3) * 0.5) : (1.6 + (i % 3) * 0.7);
      const spread = extended ? 1.18 : 0.92;
      m.paintCapsule(rx * 0.7, ry * 0.7, topZ, rx * spread, ry * spread, tipZ, 0.95, 0.55, mat('root'), partId.root, true);
    }
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 5.2, headZ: H, centerZ: Math.round(H * 0.5) });
  }

  // =========================================================================
  // 5. 4 条粗壮铁蹄柱状腿
  // =========================================================================
  function buildLegSeg(makeCanvas, rTop, rBot, hLen) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 4);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat('hide'), partId.hide, true);
    m.paintEllipsoid(0, 0.8, H - 2.0, rTop * 0.75, rTop * 0.75, 1.0, mat('copper'), partId.copper, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildHoof(makeCanvas) {
    const m = new VoxelModel(9, 10, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -0.3, 1.0, 0, -0.2, 4.0, 2.8, 2.4, mat('hide'), partId.hide, true);
    m.paintEllipsoid(0, 0.4, 1.4, 3.0, 3.2, 1.3, mat('hoof'), partId.hoof, true);
    m.paintEllipsoid(0, 2.8, 1.2, 1.4, 1.0, 1.0, mat('steel'), partId.steel, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2 });
  }

  // =========================================================================
  // 6. 地面散落金属碎片（3 种高对比亮件：银剑刃 / 铜锅片 / 金齿轮）
  // =========================================================================
  function buildScrapItem(makeCanvas, kind) {
    const m = new VoxelModel(11, 11, 6, SPEC);
    const { mat, partId } = SPEC;
    if (kind === 'blade') {
      m.paintCapsule(-3.4, -2.6, 1.4, 3.6, 3.2, 2.8, 1.15, 0.55, mat('steel'), partId.steel, true);
      m.paintEllipsoid(-2.2, -1.6, 1.6, 1.8, 1.0, 0.9, mat('brass'), partId.brass, true);
    } else if (kind === 'pot') {
      m.paintEllipsoid(0, 0, 1.8, 3.6, 3.2, 1.8, mat('copper'), partId.copper, true);
      m.paintCapsule(-3.4, 0, 2.0, -4.6, 0, 3.2, 0.85, 0.65, mat('brass'), partId.brass, true);
    } else {
      m.fillAABB(-4.0, 4.0, -4.0, 4.0, 1, 3, (x, y, z, X, Y) => {
        const r = Math.hypot(X, Y);
        const tooth = Math.cos(Math.atan2(Y, X) * 6) > 0.25 ? 1.1 : 0;
        if (r <= 3.1 + tooth && r >= 1.1) m.setRaw(x, y, z, mat('brass'), partId.brass);
      });
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 5, centerZ: 2 });
  }

  const Sand2Def = {
    id: 'sand2_bulgasari',
    code: '沙2',
    status: 'done',
    name: '吞铁兽',
    tag: 'M12 动态成长 · 嵌铁兽躯 + 根须吞金',
    summary: '无嘴黑铁青厚重兽躯，嵌满亮银刀剑、赤铜锅片与金黄齿轮；腹底垂深红细密根须，停在散落金属碎片上伸须吸入体内，逐层解锁叠挂金属背件表现越吃越大',
    defaultHabitat: 'desert',
    footRadius: 13.5,
    ecoWeight: 2.2,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' },
      { id: 'absorb', name: '根须吞铁', loop: false, duration: 3.2, status: 'done' }
    ],
    blocks: [
      '无嘴黑铁青兽躯',
      '4 档可解锁金属背件（刀剑/铜锅/齿轮/护盾）',
      '腹底深红根须与动态吸须',
      '4 足沉重铁蹄 IK',
      '散落金属碎片循环吞食'
    ],
    soulHabit: '在戈壁沙丘缓慢巡行，走到散落的亮银断刃、赤铜锅片或金黄齿轮上方停步，腹底垂下深红细密根须缠绕吸入体内，逐级叠挂更多金属背件',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torso:        buildTorso(makeCanvas),
        head:         buildHead(makeCanvas),
        metalBlades:  buildMetalBlades(makeCanvas),
        copperPot:    buildCopperPot(makeCanvas),
        goldGear:     buildGoldGear(makeCanvas),
        armorFlanks:  buildArmorFlanks(makeCanvas),
        rootNorm:     buildRootCluster(makeCanvas, false),
        rootExtend:   buildRootCluster(makeCanvas, true),
        legUpper:     buildLegSeg(makeCanvas, 3.1, 2.7, 5.2),
        legLower:     buildLegSeg(makeCanvas, 2.5, 2.3, 5.0),
        hoof:         buildHoof(makeCanvas),
        scrapBlade:   buildScrapItem(makeCanvas, 'blade'),
        scrapPot:     buildScrapItem(makeCanvas, 'pot'),
        scrapGear:    buildScrapItem(makeCanvas, 'gear')
      };

      const gait = new MultiLegGaitSolver([
        { id: 'FL', hipX: -6.2, hipY:  6.4, hipZ: 3.8, restX: -7.8, restY:  7.0, group: 0, L1: 6.0, L2: 6.4, kneeSign: -1 },
        { id: 'FR', hipX:  6.2, hipY:  6.4, hipZ: 3.8, restX:  7.8, restY:  7.0, group: 1, L1: 6.0, L2: 6.4, kneeSign: -1 },
        { id: 'BL', hipX: -6.2, hipY: -7.0, hipZ: 3.8, restX: -7.8, restY: -7.2, group: 1, L1: 6.0, L2: 6.4, kneeSign:  1 },
        { id: 'BR', hipX:  6.2, hipY: -7.0, hipZ: 3.8, restX:  7.8, restY: -7.2, group: 0, L1: 6.0, L2: 6.4, kneeSign:  1 }
      ], {
        mode: 'walk4',
        stepThreshold: 4.2,
        stepDuration: 0.30,
        stepHeight: 2.4,
        strideAnticipation: 0.42
      });

      const bodyBounce = new SpringDamper1D(0, 120, 8.0);
      const headYawSpring = new SpringDamper1D(0, 58, 7.2);
      const crouchSpring = new SpringDamper1D(0, 68, 7.4);

      const SCRAP_KINDS = ['scrapBlade', 'scrapPot', 'scrapGear', 'scrapBlade'];
      const scraps = Array.from({ length: 4 }, (_, i) => ({
        idx: i,
        kind: SCRAP_KINDS[i],
        x: 0, y: 0, z: 0,
        yaw: i * 1.4,
        active: true,
        absorbing: false,
        absorbU: 0,
        respawnTimer: 0
      }));

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 8.0,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        growthStage: 2, // 初始带 2 层背件，吃满到 4 层后抖落旧渣回 1 层循环
        stage: 'seek',  // 'seek' | 'absorb' | 'idle_wait'
        stageTime: 0,
        targetScrapIdx: 0,
        gearAngle: 0,
        sparkCd: 0,
        tiltX: 0,
        tiltY: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function placeScraps(cx, cy, maxR) {
        const ringR = clamp(maxR * 0.52, 16, 26);
        for (let i = 0; i < scraps.length; i++) {
          const ang = (i / scraps.length) * TAU + 0.45;
          scraps[i].x = cx + Math.cos(ang) * ringR;
          scraps[i].y = cy + Math.sin(ang) * ringR;
          scraps[i].z = 0;
          scraps[i].yaw = ang + 0.9;
          scraps[i].active = true;
          scraps[i].absorbing = false;
          scraps[i].absorbU = 0;
          scraps[i].respawnTimer = 0;
        }
      }

      const instance = {
        def: Sand2Def,
        cachePrefix: `sand2_bg_${Math.random().toString(36).slice(2, 7)}`,
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
          state.x = homeX;
          state.y = homeY;
          state.z = 8.0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.growthStage = 2;
          state.stage = 'seek';
          state.stageTime = 0;
          state.targetScrapIdx = 0;
          state.gearAngle = 0;
          state.sparkCd = 0;
          state.tiltX = 0;
          state.tiltY = 0;

          bodyBounce.x = bodyBounce.v = 0;
          headYawSpring.x = headYawSpring.v = 0;
          crouchSpring.x = crouchSpring.v = 0;
          gait.reset(homeX, homeY, homeYaw);
          placeScraps(homeX, homeY, 38);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const maxR = ((eco && eco.maxRadius) || 44) * 0.80;
          const fxCol = curSkin.fx || SKINS[0].fx;

          const forceAbsorb = !!(eco && eco.action === 'absorb');
          const isIdle = !forceAbsorb && !!(eco && (eco.action === 'idle' || eco.patrol === false));

          // 刷新已消耗碎片（落在 maxR * 0.72 内）
          for (const sc of scraps) {
            if (!sc.active) {
              sc.respawnTimer -= dt;
              if (sc.respawnTimer <= 0) {
                const ang = Math.random() * TAU;
                const rad = clamp(maxR * (0.38 + Math.random() * 0.30), 12, maxR * 0.72);
                sc.x = Math.cos(ang) * rad;
                sc.y = Math.sin(ang) * rad;
                sc.z = 0;
                sc.yaw = Math.random() * TAU;
                sc.active = true;
                sc.absorbing = false;
                sc.absorbU = 0;
              }
            }
          }

          // 选定当前目标碎片
          let target = scraps[state.targetScrapIdx];
          if (!target || !target.active) {
            let bestDist = Infinity;
            let bestIdx = 0;
            for (let i = 0; i < scraps.length; i++) {
              if (!scraps[i].active) continue;
              const d = Math.hypot(scraps[i].x - state.x, scraps[i].y - state.y);
              if (d < bestDist) { bestDist = d; bestIdx = i; }
            }
            state.targetScrapIdx = bestIdx;
            target = scraps[bestIdx];
          }

          state.stageTime += dt;
          if (forceAbsorb && state.stage !== 'absorb') {
            state.stage = 'absorb';
            state.stageTime = 0;
            if (target) {
              // 把碎片拉到腹下附近以便立即展示根须吸收
              const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, 0, 2.2 * sMul);
              target.x = sx; target.y = sy; target.z = 0;
              target.active = true; target.absorbing = true; target.absorbU = 0;
            }
          } else if (isIdle && state.stage === 'seek') {
            state.stage = 'idle_wait';
            state.stageTime = 0;
          } else if (!isIdle && !forceAbsorb && state.stage === 'idle_wait') {
            state.stage = 'seek';
            state.stageTime = 0;
          }

          const isAbsorbing = state.stage === 'absorb';
          const crouchVal = clamp(
            crouchSpring.update(dt, isAbsorbing ? 1.0 : 0.0, 68 * sp, clamp(7.4 * dScale, 3.2, 11.5)),
            0, 1.1
          );
          const baseLift = (8.0 - crouchVal * 1.8) * sMul;

          if (state.stage === 'seek' && target && target.active) {
            const walkRes = Propulsion.walkToPoint(state, target.x, target.y, dt, { ...params, speed: spdMul * 0.85 }, {
              arriveDist: 4.0 * sMul,
              maxSpeed: 10.5,
              maxTurn: 2.1,
              baseLift
            });
            if (walkRes.arrived || state.stageTime > 9.0) {
              state.stage = 'absorb';
              state.stageTime = 0;
              target.absorbing = true;
              target.absorbU = 0;
            }
          } else if (state.stage === 'absorb') {
            const kStop = expSmooth(dt, 7.5);
            state.vx = lerp(state.vx, 0, kStop);
            state.vy = lerp(state.vy, 0, kStop);
            state.x += state.vx * dt;
            state.y += state.vy * dt;
            state.z = lerp(state.z, baseLift, expSmooth(dt, 8.0));

            const u = clamp(state.stageTime / 2.6, 0, 1);
            if (target && target.active) {
              target.absorbing = true;
              target.absorbU = u;
              // 碎片被腹底根须颤动拉升吸入体内
              target.x = lerp(target.x, state.x, expSmooth(dt, 4.5));
              target.y = lerp(target.y, state.y, expSmooth(dt, 4.5));
              target.z = smoothstep(0.18, 0.92, u) * (state.z + 1.2 * sMul);
              target.yaw = wrapAngle(target.yaw + dt * 3.2);
            }

            state.sparkCd -= dt;
            if (state.sparkCd <= 0 && vfx) {
              state.sparkCd = 0.24;
              for (let k = 0; k < 4; k++) {
                const a = Math.random() * TAU;
                const spd = (5 + Math.random() * 8) * sMul;
                vfx.spawnParticle(
                  state.x + (Math.random() - 0.5) * 4 * sMul,
                  state.y + (Math.random() - 0.5) * 4 * sMul,
                  2.5 * sMul,
                  Math.cos(a) * spd, Math.sin(a) * spd, (6 + Math.random() * 8) * sMul,
                  0.45 + Math.random() * 0.25, 1.35 + Math.random() * 0.45,
                  k % 2 === 0 ? fxCol.spark : fxCol.root, false, 18
                );
              }
            }

            if (state.stageTime >= 2.6) {
              // 吞入完成：背件成长 +1 档（满 4 档后抖落旧渣回 1 档循环）
              if (target) {
                target.active = false;
                target.absorbing = false;
                target.respawnTimer = 4.5;
              }
              state.growthStage = state.growthStage >= 4 ? 1 : (state.growthStage + 1);
              bodyBounce.impulse(-15.0 * sMul);
              if (vfx) {
                for (let k = 0; k < 10; k++) {
                  const a = (k / 10) * TAU;
                  vfx.spawnParticle(
                    state.x, state.y, (10 + Math.random() * 4) * sMul,
                    Math.cos(a) * 11 * sMul, Math.sin(a) * 11 * sMul, (8 + Math.random() * 6) * sMul,
                    0.55, 1.55, k % 2 === 0 ? fxCol.spark : fxCol.rust, false, 24
                  );
                }
              }
              state.stage = isIdle ? 'idle_wait' : 'seek';
              state.stageTime = 0;
            }
          } else {
            // idle_wait：原地稳立，每 3.4 秒触发一次原地根须吞铁展示
            const kStop = expSmooth(dt, 7.5);
            state.vx = lerp(state.vx, 0, kStop);
            state.vy = lerp(state.vy, 0, kStop);
            state.z = lerp(state.z, baseLift, expSmooth(dt, 8.0));
            if (state.stageTime >= 3.4 && target) {
              const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, 0, 2.0 * sMul);
              target.x = sx; target.y = sy; target.z = 0;
              target.active = true; target.absorbing = true; target.absorbU = 0;
              state.stage = 'absorb';
              state.stageTime = 0;
            }
          }

          // 严格巡游钳制在 maxRadius * 0.80 内
          const rNow = Math.hypot(state.x, state.y);
          if (rNow > maxR) {
            const sBack = maxR / rNow;
            state.x *= sBack;
            state.y *= sBack;
          }

          // 4 足沉重铁蹄 IK
          const gaitRes = gait.update(dt, state.x, state.y, state.z, state.yaw, state.vx, state.vy, {
            mode: 'walk4',
            scaleMul: sMul,
            stepFreq: freq * 0.88,
            stepHeight: 2.0 * sMul,
            stepThreshold: 4.4 * sMul
          });
          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 0.9 * sMul, expSmooth(dt, 9.0));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 0.9 * sMul, expSmooth(dt, 9.0));
          if (gaitRes.landed.length > 0) {
            bodyBounce.impulse(-12.0 * sMul);
            for (const leg of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, leg.footX, leg.footY, 1.05 * sMul);
            }
          }

          bodyBounce.update(dt, -gaitRes.liftSum * 0.12, 120 * sp, clamp(8.0 * dScale, 3.2, 12.5));
          const targetHeadYaw = isAbsorbing ? Math.sin(time * 7.5) * 0.16 : Math.sin(time * 1.4) * 0.22;
          headYawSpring.update(dt, targetHeadYaw, 58 * sp, clamp(7.2 * dScale, 3.0, 11.0));
          state.gearAngle = wrapAngle(state.gearAngle + dt * (isAbsorbing ? 2.4 : 0.65));

          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 3.3 * sMul }));
          sockets.setLocal('backMount', state.x, state.y, state.z, state.yaw, 0, -1.0, 15.0, sMul);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const wl = habitat ? (habitat.waterLevel ?? -99) : -99;
          const yw = state.yaw;
          const bodyLift = Math.max(4.0 * sMul, state.z + clamp(bodyBounce.x * 0.14, -1.8, 1.6));
          const bx = state.x + state.tiltX;
          const by = state.y + state.tiltY;
          const isAbsorbing = state.stage === 'absorb';

          // 1. 地面散落金属碎片
          for (const sc of scraps) {
            if (!sc.active) continue;
            if (sc.absorbing && sc.absorbU > 0.88) continue;
            list.push({
              partKey: sc.kind,
              asset: parts[sc.kind],
              x: sc.x,
              y: sc.y,
              lift: Math.max(0, sc.z),
              ro: sc.yaw,
              bias: -0.55,
              submerge: EnvFeedback.calcSubmerge(sc.z + 0.8, wl, 4.0, isWater)
            });
          }

          // 2. 4 条粗壮柱状铁蹄 IK 腿
          for (const leg of gait.legs) {
            const hx = leg.hipWX + state.tiltX;
            const hy = leg.hipWY + state.tiltY;
            const samples = [
              { k: 'legUpper', x: lerp(hx, leg.kneeX, 0.25), y: lerp(hy, leg.kneeY, 0.25), z: lerp(leg.hipWZ, leg.kneeZ, 0.25), b: -0.52, sym: 90 },
              { k: 'legLower', x: lerp(leg.kneeX, leg.footX, 0.50), y: lerp(leg.kneeY, leg.footY, 0.50), z: lerp(leg.kneeZ, leg.footZ + 1.8 * sMul, 0.50), b: -0.42, sym: 90 },
              { k: 'hoof',     x: leg.footX, y: leg.footY, z: leg.footZ, b: -0.32, sym: 360 }
            ];
            for (const pt of samples) {
              list.push({
                partKey: pt.k,
                asset: parts[pt.k],
                x: pt.x,
                y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === 'hoof' ? 0 : 2.0 * sMul)),
                ro: yw,
                symDeg: pt.sym,
                bias: pt.b,
                submerge: EnvFeedback.calcSubmerge(pt.z + 1.0, wl, 4.2, isWater)
              });
            }
          }

          // 3. 腹底深红细密根须（吸收态切换伸长簇 + 动态像素吸须连向碎片）
          const rKey = isAbsorbing ? 'rootExtend' : 'rootNorm';
          list.push({
            partKey: rKey,
            asset: parts[rKey],
            x: bx,
            y: by,
            lift: Math.max(0.2, bodyLift - (isAbsorbing ? 6.2 : 4.2) * sMul),
            ro: yw,
            bias: -0.15
          });

          if (isAbsorbing) {
            const target = scraps[state.targetScrapIdx];
            if (target && target.active) {
              for (let ri = -1; ri <= 1; ri++) {
                const [rx0, ry0] = localToWorldXY(bx, by, yw, ri * 2.4 * sMul, 0.6 * sMul);
                list.push({
                  kind: 'line',
                  x0: rx0, y0: ry0, z0: bodyLift + 1.5 * sMul,
                  x1: target.x + ri * 1.1 * sMul, y1: target.y, z1: Math.max(0.8, target.z + 0.8),
                  widthArtPx: 1,
                  color: (curSkin.fx && curSkin.fx.root) || '#de4756',
                  outlineColor: curSkin.outline || '#0b0e14',
                  sag: 0.6,
                  segments: 6,
                  bias: -0.05
                });
              }
            }
          }

          // 4. 厚重黑铁青主躯干（零拉伸）
          list.push({
            partKey: 'torso',
            asset: parts.torso,
            x: bx,
            y: by,
            lift: bodyLift,
            ro: yw,
            bias: 0.28,
            submerge: EnvFeedback.calcSubmerge(bodyLift + 2.0, wl, 4.8, isWater)
          });

          // 5. 4 档解锁叠挂金属背件（越吃越多、轮廓越胀越大，全程 1:1 零拉伸）
          const g = state.growthStage;
          if (g >= 1) {
            // 档 1：亮银刀剑刃簇
            list.push({
              partKey: 'metalBlades',
              asset: parts.metalBlades,
              x: bx,
              y: by,
              lift: bodyLift + 11.2 * sMul,
              ro: yw,
              bias: 0.56
            });
          }
          if (g >= 2) {
            // 档 2：赤铜大锅片
            const [px, py] = localToWorldXY(bx, by, yw, 0, -2.0 * sMul);
            list.push({
              partKey: 'copperPot',
              asset: parts.copperPot,
              x: px,
              y: py,
              lift: bodyLift + 12.0 * sMul,
              ro: yw,
              bias: 0.62
            });
          }
          if (g >= 3) {
            // 档 3：缓慢咬合转动的金黄大齿轮
            const [gx, gy] = localToWorldXY(bx, by, yw, 0, -6.4 * sMul);
            list.push({
              partKey: 'goldGear',
              asset: parts.goldGear,
              x: gx,
              y: gy,
              lift: bodyLift + 12.6 * sMul,
              ro: state.gearAngle,
              symDeg: 90,
              bias: 0.68
            });
          }
          if (g >= 4) {
            // 档 4：左右宽阔铁盾护肩（横向体量大幅扩张）
            list.push({
              partKey: 'armorFlanks',
              asset: parts.armorFlanks,
              x: bx,
              y: by,
              lift: bodyLift + 4.8 * sMul,
              ro: yw,
              bias: 0.42
            });
          }

          // 6. 无嘴厚重铁青大头（枢轴锁死后颈）
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.45, 0.45));
          const [hjx, hjy] = localToWorldXY(bx, by, yw, 0, 10.6 * sMul);
          const [hx, hy] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          list.push({
            partKey: 'head',
            asset: parts.head,
            x: hx,
            y: hy,
            lift: bodyLift + (isAbsorbing ? 3.2 : 4.6) * sMul,
            ro: hYaw,
            bias: 0.72
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Sand2Def.id,
            code: Sand2Def.code,
            status: Sand2Def.status,
            name: Sand2Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            growthStage: state.growthStage,
            footRadius: Sand2Def.footRadius,
            headZ: 24,
            centerZ: 12,
            blocks: Sand2Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Sand2Def);
})(window.PixelWorkshop);
