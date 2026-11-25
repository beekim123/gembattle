'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 天4 · 吞天长蛇（M04 超长多对长鳍翼巨蛇 · 水5成年态，+Y 正前）
  //   1. 参照 special9_long.js：15 节厚重巨蛇链（仅复用 4 个共享躯干节段 +
  //      丝带巨尾鳍，所有单块严格 <= 30 格，守 28MB 烘焙图集预算）；
  //   2. 深靛黑厚重鳞躯 + 亮青金背脊棱甲与暖金腹纹，在高空云海白云上极其霸气；
  //   3. 3 对滞后起伏的亮青金巨型长鳍翼（锚定于第 2、6、10 节两侧，共享 2 档
  //      尺寸 × up/mid/dn 三态）；
  //   4. 可张合的夸张巨口（headClosed / headGulp 2 档，巨口大张露出亮青金喉腔
  //      与锐利尖牙），周期缓缓张大横扫吞食前方云间小群红囊粒子；
  //   5. 3 套皮肤、严禁常态 scaleX/scaleY、巡游钳制在 maxRadius * 0.80 内。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 深靛黑厚重蛇躯（3 档，与白云高空强反差）
      bodyDark:   '#0a0e1c',
      bodyMid:    '#18213d',
      bodyHi:     '#2e3f6e',
      // 亮青金背脊棱甲与长鳍翼主色（3 档）
      cyanDark:   '#107882',
      cyanMid:    '#2ad4cc',
      cyanHi:     '#96fff0',
      // 暖金腹甲与翼缘金脊（3 档）
      goldDark:   '#a36d17',
      goldMid:    '#ebb338',
      goldHi:     '#ffea85',
      // 巨口深红上腭与牙床（3 档）
      mawDark:    '#570f1d',
      mawMid:     '#a31f37',
      mawHi:      '#e64c66',
      // 锋利白牙与角棱（3 档）
      fangDark:   '#9eb0bd',
      fangMid:    '#d8e6f0',
      fangHi:     '#f7fcff',
      // 云间小群红囊（被吞食目标，3 档）
      preyDark:   '#8f1c24',
      preyMid:    '#e03b3b',
      preyHi:     '#ff8a73',
      // 威严巨眼（eyeGlint 绝不进 glowKeys）
      eyeDark:    '#080a14',
      eyeIris:    '#ffbf24',
      eyeGlint:   '#f2faff',
      // 巨口喉腔自亮青金核（仅此 2 色进 glowKeys）
      throatMid:  '#38e8d9',
      throatCore: '#e0fffa'
    },
    glowKeys: ['throatMid', 'throatCore'],
    parts: [
      'head', 'body', 'belly', 'ridge', 'fin', 'goldTrim', 'maw',
      'fang', 'eye', 'throat', 'tailFin', 'prey'
    ],
    noCrease: [
      ['head', 'body'], ['head', 'belly'], ['head', 'ridge'], ['head', 'eye'],
      ['head', 'maw'], ['maw', 'fang'], ['maw', 'throat'],
      ['body', 'belly'], ['body', 'ridge'], ['fin', 'goldTrim'], ['tailFin', 'goldTrim']
    ],
    materials: {
      body: ['bodyDark', 'bodyMid', 'bodyHi'],
      cyan: ['cyanDark', 'cyanMid', 'cyanHi'],
      gold: ['goldDark', 'goldMid', 'goldHi'],
      maw:  ['mawDark',  'mawMid',  'mawHi'],
      fang: ['fangDark', 'fangMid', 'fangHi'],
      prey: ['preyDark', 'preyMid', 'preyHi']
    },
    protectedParts: ['eye', 'fang', 'throat', 'prey']
  });

  // 3 套皮肤（0 禁用字，0 重色）
  const SKINS = [
    {
      id: 'indigo_cyan_gold',
      name: '靛墨青金翼',
      dot: '#2ad4cc',
      outline: '#060812',
      pal: {},
      fx: { throat: '#96fff0', gold: '#ffea85', prey: '#ff6652' }
    },
    {
      id: 'obsidian_amber',
      name: '玄赤古金翼',
      dot: '#f09429',
      outline: '#120709',
      pal: {
        bodyDark:  '#1a0c12', bodyMid:  '#381924', bodyHi:  '#663042',
        cyanDark:  '#a64e12', cyanMid:  '#eb8a24', cyanHi:  '#ffd66b',
        goldDark:  '#946a18', goldMid:  '#dba635', goldHi:  '#fff099',
        throatMid: '#ffa833', throatCore: '#fff7cc',
        eyeIris:   '#5ceeff'
      },
      fx: { throat: '#ffd66b', gold: '#fff099', prey: '#ff7059' }
    },
    {
      id: 'deep_jade_azure',
      name: '墨翠明青翼',
      dot: '#36c982',
      outline: '#06120e',
      pal: {
        bodyDark:  '#091a17', bodyMid:  '#143832', bodyHi:  '#266358',
        cyanDark:  '#157853', cyanMid:  '#32c98a', cyanHi:  '#9effcf',
        goldDark:  '#1d6e9e', goldMid:  '#42b4eb', goldHi:  '#a6eaff',
        throatMid: '#4ce6a6', throatCore: '#e6fff5',
        eyeIris:   '#ffdc42'
      },
      fx: { throat: '#9effcf', gold: '#a6eaff', prey: '#ff7366' }
    }
  ];

  // =========================================================================
  // 1. 吞天巨蛇首（20×26×18，2 档：closed 闭口 / gulp 夸张巨口大张）
  //    枢轴锁后颈 (0, -5.2)
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -5.2 };
  function buildGiantHead(makeCanvas, isGulp) {
    const W = 20, D = 26, H = 18;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 厚重后颅与颈枕咬合
    m.paintCapsule(0, -7.2, 7.6, 0, -2.0, 8.2, 4.4, 5.2, mat('body'), partId.head, true);
    m.paintEllipsoid(0, -1.2, 8.8, 5.8, 5.2, 4.4, mat('body'), partId.head, true);

    // 上颌（gulp 态大幅上扬，露出宽阔吞天巨口！）
    const upLift = isGulp ? 4.2 : 0.0;
    m.fillAABB(-5.6, 5.6, 1.5, 11.4, 5, 16, (x, y, z, X, Y) => {
      const t = clamp((Y - 1.5) / 9.6, 0, 1);
      const halfW = lerp(5.2, 3.6, t);
      const topZ = lerp(11.4, 10.2, t) + upLift * t;
      const botZ = (isGulp ? lerp(7.8, 8.6, t) : lerp(6.2, 6.8, t)) + upLift * t * 0.82;
      if (Math.abs(X) > halfW || z < botZ || z > topZ) return;
      const isRidge = z >= topZ - 1.2 && Math.abs(X) <= 1.8;
      m.setRaw(x, y, z, isRidge ? mat('cyan') : mat('body'), isRidge ? partId.ridge : partId.head);
    });

    // 下颌（gulp 态夸张下垂张大，形成巨大吞食漏斗口）
    const jawDrop = isGulp ? -4.0 : 0.0;
    m.fillAABB(-5.2, 5.2, 1.0, 10.6, 1, 8, (x, y, z, X, Y) => {
      const t = clamp((Y - 1.0) / 9.2, 0, 1);
      const halfW = lerp(4.8, 3.2, t);
      const jz = lerp(5.2, 5.4, t) + jawDrop * (0.25 + t * 0.75);
      if (Math.abs(X) > halfW || Math.abs(z - jz) > 1.2) return;
      m.setRaw(x, y, z, z <= jz ? mat('gold') : mat('body'), z <= jz ? partId.belly : partId.head);
    });

    if (isGulp) {
      // 夸张大张的深红口腔 + 自亮青金吞天喉腔 + 两排锐利雪白巨牙
      m.paintEllipsoid(0, 2.2, 6.8, 3.2, 3.4, 2.6, mat('maw'), partId.maw, true);
      m.fillAABB(-2.4, 2.4, 0.2, 4.2, 5, 9, (x, y, z, X, Y) => {
        const d = Math.hypot(X / 2.2, (Y - 2.0) / 2.0, (z - 6.8) / 2.0);
        if (d <= 1.0) {
          m.setRaw(x, y, z, d < 0.55 ? keyToId.throatCore : keyToId.throatMid, partId.throat);
        }
      });
      for (const s of [-1, 1]) {
        // 上排两对利齿
        m.paintCapsule(s * 3.1, 8.8, 11.4, s * 3.0, 9.0, 8.6, 0.65, 0.42, mat('fang'), partId.fang, true);
        m.paintCapsule(s * 3.8, 5.8, 10.4, s * 3.7, 6.0, 8.0, 0.60, 0.40, mat('fang'), partId.fang, true);
        // 下排利齿
        m.paintCapsule(s * 2.8, 8.2, 2.6, s * 2.8, 8.4, 5.0, 0.60, 0.40, mat('fang'), partId.fang, true);
      }
    }

    // 头后一对亮青金长鳍角（后掠霸气轮廓）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 3.6, -1.0, 11.6, s * 7.8, -8.8, 15.6, 1.45, 0.72, mat('cyan'), partId.ridge, true);
      m.paintCapsule(s * 4.4, -1.6, 10.6, s * 8.4, -7.8, 13.4, 0.95, 0.55, mat('gold'), partId.goldTrim, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 清晰 2×2 威严金眼
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.8);
    const eyeZ = isGulp ? 11 : 10;
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 6; step++) {
        const tx = Math.round(hw + s * (6.2 - step));
        if (m.getPartId(tx, eyeY, eyeZ) === partId.head) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 4.6);
      for (const dy of [0, 1]) for (const dz of [0, 1]) {
        const kId = (dz === 1 && dy === 1) ? keyToId.eyeGlint : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
        m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 7.5, headZ: 17, centerZ: 8 });
  }

  // =========================================================================
  // 2. 4 档共享厚重巨蛇躯干节（守 28MB 图集预算，单块 <= 16 格）
  //    深靛黑厚重蛇躯 + 亮青金背脊棱甲 + 暖金腹纹
  // =========================================================================
  function buildBodySeg(makeCanvas, rx, rz, halfLenY, ridgeH) {
    const W = Math.ceil(rx * 2 + 4);
    const D = Math.ceil((halfLenY + rx * 0.55) * 2 + 4);
    const H = Math.ceil(rz * 2 + ridgeH + 4);
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const cz = rz + 1.0;

    m.fillAABB(-rx - 0.8, rx + 0.8, -halfLenY - rx, halfLenY + rx, 0, Math.ceil(cz + rz + 1), (x, y, z, X, Y) => {
      const cy = clamp(Y, -halfLenY * 0.52, halfLenY * 0.52);
      const d2 = (X / rx) ** 2 + ((Y - cy) / (rx * 0.90)) ** 2 + ((z - cz) / rz) ** 2;
      if (d2 > 1.0) return;

      const isBelly = z <= cz - rz * 0.34 && Math.abs(X) <= rx * 0.84;
      const isSideGold = Math.abs(X) > rx * 0.68 && Math.abs(z - cz) < 1.1;
      if (isBelly || isSideGold) {
        m.setRaw(x, y, z, mat('gold'), partId.belly);
      } else {
        m.setRaw(x, y, z, mat('body'), partId.body);
      }
    });

    // 亮青金厚重背脊棱甲（连续后掠鳍刺）
    const rBase = cz + rz * 0.72;
    m.paintCapsule(0, halfLenY * 0.38, rBase, 0, -halfLenY * 0.55, rBase + ridgeH, 1.15, 0.58, mat('cyan'), partId.ridge, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: rx + 0.8 });
  }

  // 巨型亮青金丝带尾鳍（16×22×14）
  const TAILFIN_PIVOT = { x: 0, y: 7.4 };
  function buildGiantTailFin(makeCanvas) {
    const m = new VoxelModel(16, 22, 14, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 7.2, 6.4, 0, -2.5, 6.8, 2.2, 1.0, mat('body'), partId.body, true);
    m.paintFinTri([0, 6.2, 6.6], [0, -8.8, 12.6], [0, -2.6, 6.8], 0.95, mat('cyan'), partId.tailFin, true);
    m.paintFinTri([0, 6.2, 6.6], [0, -2.6, 6.8], [0, -8.4, 1.6], 0.95, mat('cyan'), partId.tailFin, true);
    m.paintCapsule(0, 6.2, 6.6, 0, -8.8, 12.6, 1.10, 0.55, mat('gold'), partId.goldTrim, true);
    m.paintCapsule(0, 6.2, 6.6, 0, -8.4, 1.6, 1.10, 0.55, mat('gold'), partId.goldTrim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.5, headZ: 13, centerZ: 7 });
  }

  // =========================================================================
  // 3. 亮青金巨型长鳍翼（2 档尺寸 × up/mid/dn 三态，单块 <= 30 格）
  // =========================================================================
  const BIG_WING_PIVOT = { x: 11.4, y: 4.0 };
  const MID_WING_PIVOT = { x: 8.6,  y: 3.2 };

  function buildFinWing(makeCanvas, side, size, pose) {
    const isBig = size === 'big';
    const W = isBig ? 30 : 22;
    const D = isBig ? 22 : 18;
    const H = isBig ? 18 : 14;
    const piv = isBig ? BIG_WING_PIVOT : MID_WING_PIVOT;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const s = side, rx = -s * piv.x, ry = piv.y, rz = H * 0.48;
    const flap = pose === 'up' ? 0.85 : (pose === 'down' ? -0.82 : 0.04);

    const span = isBig ? 22.8 : 16.4;
    const back = isBig ? 10.6 : 8.2;
    const pRoot  = [rx, ry, rz];
    const pMid   = [rx + s * span * 0.48, ry + 1.8, rz + 1.4 + flap * (isBig ? 2.6 : 1.9)];
    const pTip   = [rx + s * span,        ry - 3.6, rz + 0.6 + flap * (isBig ? 5.2 : 3.8)];
    const pBackA = [rx + s * 2.0,         ry - back * 0.72, rz - 1.0];
    const pBackB = [rx + s * span * 0.62, ry - back,        pMid[2] - 1.4];

    m.paintFinTri(pRoot, pMid, pBackA, 1.05, mat('cyan'), partId.fin, true);
    m.paintFinTri(pMid, pBackB, pBackA, 1.02, mat('cyan'), partId.fin, true);
    m.paintFinTri(pMid, pTip, pBackB, 0.96, mat('cyan'), partId.fin, true);

    // 暖金前缘主翼脊 + 鳍条脉络
    m.paintEllipsoid(rx, ry, rz, 1.8, 1.8, 1.6, mat('body'), partId.body, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pMid[0], pMid[1], pMid[2], 1.55, 1.18, mat('gold'), partId.goldTrim, true);
    m.paintCapsule(pMid[0], pMid[1], pMid[2], pTip[0], pTip[1], pTip[2], 1.15, 0.65, mat('gold'), partId.goldTrim, true);
    m.paintCapsule(pMid[0], pMid[1], pMid[2], pBackB[0], pBackB[1], pBackB[2], 0.92, 0.55, mat('gold'), partId.goldTrim, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: isBig ? 11.0 : 8.0, headZ: H - 2, centerZ: Math.round(H * 0.5) });
  }

  // 云间小群红囊（被吞食目标，7×7×7 共享件）
  function buildCloudPrey(makeCanvas) {
    const m = new VoxelModel(7, 7, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 3.4, 2.2, 2.2, 2.4, mat('prey'), partId.prey, true);
    m.paintCapsule(0, 0, 1.8, 0, -1.8, 0.8, 0.85, 0.52, mat('gold'), partId.goldTrim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.4 });
  }

  // =========================================================================
  // 4. 生物定义与超长巨蛇状态机
  // =========================================================================
  const NUM_NODES = 15; // 0: 颈枕, 1..13: 13 节厚重蛇躯, 14: 巨型尾鳍
  const SEG_LEN = 4.0;
  const WING_ANCHORS = [
    { nodeIdx: 2,  size: 'big', phaseOff:  0.0 },
    { nodeIdx: 6,  size: 'big', phaseOff: -1.1 },
    { nodeIdx: 10, size: 'mid', phaseOff: -2.2 }
  ];

  const Sky4Def = {
    id: 'sky4_bakunawa',
    code: '天4',
    status: 'done',
    name: '吞天长蛇',
    tag: 'M04 多对长鳍翼巨蛇 · 张口吞云群',
    summary: '15 节共享厚重深靛黑巨蛇躯配 3 对滞后起伏的亮青金巨型长鳍翼，可张合的夸张吞天巨口周期缓缓张大横扫吞食云间红囊小群（水5成年态）',
    defaultHabitat: 'sky',
    footRadius: 13.5,
    ecoWeight: 1.95,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '云海缓慢横扫', loop: true, status: 'done' },
      { id: 'idle',   name: '云海盘身慢游', loop: true, status: 'done' },
      { id: 'gulp',   name: '张大巨口吞食', loop: false, duration: 3.4, status: 'done' }
    ],
    blocks: [
      '15 节共享厚重深靛黑蛇躯（单块 <= 30 格守 28MB）',
      '3 对亮青金巨型长鳍翼滞后缓拍',
      '可张合夸张吞天巨口与自亮青金喉腔',
      '云间红囊小群被吸入巨口并重生循环'
    ],
    soulHabit: '在高空云海的白云上极慢蜿蜒巡游，3 对亮青金巨型长鳍翼逐节滞后拍动，周期缓缓张开夸张巨口横扫吞食前方飘浮的云间红囊小群',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        headClosed: buildGiantHead(makeCanvas, false),
        headGulp:   buildGiantHead(makeCanvas, true),
        segNeck:    buildBodySeg(makeCanvas, 3.8, 3.6, 3.8, 2.8),
        segThick:   buildBodySeg(makeCanvas, 4.4, 4.1, 4.0, 3.2),
        segMid:     buildBodySeg(makeCanvas, 3.6, 3.4, 3.8, 2.6),
        segTail:    buildBodySeg(makeCanvas, 2.6, 2.5, 3.4, 1.9),
        tailFin:    buildGiantTailFin(makeCanvas),
        wingBigL_up:  buildFinWing(makeCanvas, -1, 'big', 'up'),
        wingBigR_up:  buildFinWing(makeCanvas,  1, 'big', 'up'),
        wingBigL_mid: buildFinWing(makeCanvas, -1, 'big', 'mid'),
        wingBigR_mid: buildFinWing(makeCanvas,  1, 'big', 'mid'),
        wingBigL_dn:  buildFinWing(makeCanvas, -1, 'big', 'down'),
        wingBigR_dn:  buildFinWing(makeCanvas,  1, 'big', 'down'),
        wingMidL_up:  buildFinWing(makeCanvas, -1, 'mid', 'up'),
        wingMidR_up:  buildFinWing(makeCanvas,  1, 'mid', 'up'),
        wingMidL_mid: buildFinWing(makeCanvas, -1, 'mid', 'mid'),
        wingMidR_mid: buildFinWing(makeCanvas,  1, 'mid', 'mid'),
        wingMidL_dn:  buildFinWing(makeCanvas, -1, 'mid', 'down'),
        wingMidR_dn:  buildFinWing(makeCanvas,  1, 'mid', 'down'),
        cloudPrey:    buildCloudPrey(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.25;
      const seed = opts.seed ?? 94;

      const chain = new ChainSolver(NUM_NODES, SEG_LEN, {
        maxAngle: 0.40,
        waveFreq: 2.2,
        wavePhaseStep: 0.44,
        waveAmp: 0.22
      });

      const headYawSpring = new SpringDamper1D(0, 68, 7.0);
      const sockets = new SocketTracker();

      // 6 只飘浮在巨蛇前方的云间红囊小群（吞食后在前方远处重生）
      const preys = Array.from({ length: 6 }, (_, i) => ({
        idx: i,
        offX: (i - 2.5) * 4.5,
        offY: 16 + (i % 3) * 5.2,
        offZ: (i % 2 === 0 ? 1.8 : -1.4),
        x: hx0, y: hy0 + 18, z: 22,
        alive: true,
        respawnT: 0,
        phase: i * 1.15
      }));

      const state = {
        x: hx0, y: hy0, z: 22.0,
        vx: 0, vy: 0, yaw: hyaw0,
        headX: hx0, headY: hy0 + 8, headZ: 22.5, headYaw: hyaw0,
        orbitT: seed * 0.19,
        wingPhase: 0,
        isGulping: false,
        autoGulpCd: 5.5,
        autoGulpT: 0,
        vfxCd: 0
      };

      let curSkin = SKINS[0];

      function bodyKey(i) {
        if (i <= 2) return 'segNeck';
        if (i <= 7) return 'segThick';
        if (i <= 11) return 'segMid';
        return 'segTail';
      }

      const instance = {
        def: Sky4Def,
        cachePrefix: `sky4_baku_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX; state.y = homeY; state.z = 22.0;
          state.vx = 0; state.vy = 0; state.yaw = homeYaw ?? 0.25;
          state.headX = homeX; state.headY = homeY + 8; state.headZ = 22.5;
          state.headYaw = state.yaw;
          state.isGulping = false; state.autoGulpCd = 5.0; state.autoGulpT = 0;
          headYawSpring.x = headYawSpring.v = 0;

          chain.reset(state.headX, state.headY, state.headZ, state.headYaw);
          for (let i = 1; i < NUM_NODES; i++) {
            const [wx, wy] = localToWorldXY(state.headX, state.headY, state.headYaw, Math.sin(i * 0.45) * 5.2, -i * SEG_LEN * 0.94);
            chain.nodes[i].x = wx;
            chain.nodes[i].y = wy;
            chain.nodes[i].z = 21.5 + Math.sin(i * 0.48) * 2.2;
            chain.nodes[i].yaw = state.headYaw;
          }
          for (const pr of preys) {
            const [px, py] = localToWorldXY(state.headX, state.headY, state.headYaw, pr.offX, pr.offY);
            pr.x = px; pr.y = py; pr.z = state.headZ + pr.offZ;
            pr.alive = true; pr.respawnT = 0;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex  = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp    = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);

          const action = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const maxR = (eco && eco.maxRadius) || 46;
          const limitR = maxR * 0.78;
          const fx = curSkin.fx || SKINS[0].fx;

          let gulpActive = false;
          if (action === 'gulp') {
            gulpActive = true;
          } else if (action === 'patrol') {
            state.autoGulpCd -= dt;
            if (state.autoGulpCd <= 0) {
              state.autoGulpCd = 6.8 + Math.random() * 2.2;
              state.autoGulpT = 2.4;
            }
            if (state.autoGulpT > 0) {
              state.autoGulpT = Math.max(0, state.autoGulpT - dt);
              gulpActive = true;
            }
          }
          state.isGulping = gulpActive;

          // 高空极慢巡游 / 大圆盘游
          const omega = (action === 'idle' ? 0.44 : (gulpActive ? 0.56 : 0.38)) * spdMul;
          state.orbitT = wrapAngle(state.orbitT + dt * omega);
          const rA = action === 'idle' ? Math.min(20.0, limitR * 0.70) : Math.min(27.5, limitR * 0.88);
          const rB = action === 'idle' ? Math.min(20.0, limitR * 0.70) : Math.min(22.0, limitR * 0.74);
          const tx = homeX + Math.cos(state.orbitT) * rA + ((eco && eco.avoidX) || 0) * 0.25;
          const ty = homeY + Math.sin(state.orbitT) * rB + (action === 'idle' ? 0 : Math.sin(state.orbitT * 2.0) * 4.5) + ((eco && eco.avoidY) || 0) * 0.25;

          const dx = tx - state.headX, dy = ty - state.headY;
          const desiredYaw = Math.atan2(-dx, dy);
          const yawDiff = wrapAngle(desiredYaw - state.headYaw);
          const maxTurn = 1.45 * (0.7 + spdMul * 0.35);
          state.headYaw = wrapAngle(state.headYaw + clamp(yawDiff, -maxTurn * dt, maxTurn * dt));

          const kPos = expSmooth(dt, 2.4 * spdMul);
          state.headX = lerp(state.headX, tx, kPos);
          state.headY = lerp(state.headY, ty, kPos);
          const dH = Math.hypot(state.headX, state.headY);
          if (dH > limitR && dH > 0.001) {
            state.headX *= limitR / dH;
            state.headY *= limitR / dH;
          }

          const baseLift = 22.0 * sMul;
          const targetHeadZ = baseLift + (Math.sin(time * 1.8 * gFreq) * 2.6 + (gulpActive ? 2.4 : 0)) * sMul;
          state.headZ = lerp(state.headZ, targetHeadZ, expSmooth(dt, 4.8));

          state.wingPhase += dt * (gulpActive ? 3.8 : 2.6) * gFreq;

          // 15 节厚重巨蛇链物理求解
          chain.update(dt, state.headX, state.headY, state.headZ, state.headYaw, time, {
            segLen: SEG_LEN * sMul,
            flexibility: flex,
            maxAngle: 0.40,
            waveFreq: 2.2 * gFreq,
            waveAmp: 0.22 * flex,
            wavePhaseStep: 0.44,
            restAlign: 0.06,
            zFollowSpeed: 8.5,
            zTargetFn: (u, i, t) => {
              const travel = Math.sin(t * 2.2 * gFreq - i * 0.42) * 3.0 * sMul;
              const arch = Math.sin(u * Math.PI) * 3.2 * sMul;
              return Math.max(8.0 * sMul, baseLift + travel + arch);
            }
          });

          const nodes = chain.nodes;
          // 逐节垂向步差安全锁，防头颈分离
          const maxDz = 1.8 * sMul;
          for (let i = 1; i < NUM_NODES; i++) {
            const dz = nodes[i].z - nodes[i - 1].z;
            if (dz > maxDz) nodes[i].z = nodes[i - 1].z + maxDz;
            else if (dz < -maxDz) nodes[i].z = nodes[i - 1].z - maxDz;
          }

          headYawSpring.update(dt, Math.sin(time * 1.2 + seed) * (gulpActive ? 0.14 : 0.24), 68 * sp, 7.0);
          const renderHeadYaw = wrapAngle(nodes[0].yaw + headYawSpring.x);
          const [mx, my] = localToWorldXY(nodes[0].x, nodes[0].y, renderHeadYaw, 0, 12.0 * sMul);
          const mz = nodes[0].z + 1.5 * sMul;

          // 更新云间红囊小群：常态在巨蛇前方飘浮，张口吞食期被吸入巨口并爆出粒子
          for (const pr of preys) {
            if (!pr.alive) {
              pr.respawnT -= dt;
              if (pr.respawnT <= 0) {
                const [rx, ry] = localToWorldXY(nodes[0].x, nodes[0].y, renderHeadYaw, pr.offX * sMul, (pr.offY + 10.0) * sMul);
                pr.x = rx; pr.y = ry; pr.z = nodes[0].z + pr.offZ * sMul;
                pr.alive = true;
              }
              continue;
            }
            if (gulpActive) {
              // 强烈吸力拉向吞天巨口
              const kPull = expSmooth(dt, 4.6);
              pr.x = lerp(pr.x, mx, kPull);
              pr.y = lerp(pr.y, my, kPull);
              pr.z = lerp(pr.z, mz, kPull);
              if (Math.hypot(pr.x - mx, pr.y - my) < 5.2 * sMul) {
                pr.alive = false;
                pr.respawnT = 2.4 + Math.random() * 1.4;
                if (vfx) {
                  for (let k = 0; k < 5; k++) {
                    vfx.spawnParticle(
                      mx + (Math.random() - 0.5) * 4 * sMul,
                      my + (Math.random() - 0.5) * 4 * sMul,
                      mz,
                      (Math.random() - 0.5) * 10 * sMul,
                      (Math.random() - 0.5) * 10 * sMul,
                      (4 + Math.random() * 6) * sMul,
                      0.45, 1.35, k % 2 === 0 ? fx.throat : fx.prey, true, 4
                    );
                  }
                }
              }
            } else {
              const driftX = pr.offX + Math.sin(time * 1.6 + pr.phase) * 3.2;
              const driftY = pr.offY + Math.cos(time * 1.3 + pr.phase) * 2.8;
              const [txP, tyP] = localToWorldXY(nodes[0].x, nodes[0].y, renderHeadYaw, driftX * sMul, driftY * sMul);
              const kDrift = expSmooth(dt, 2.2);
              pr.x = lerp(pr.x, txP, kDrift);
              pr.y = lerp(pr.y, tyP, kDrift);
              pr.z = lerp(pr.z, nodes[0].z + (pr.offZ + Math.sin(time * 2.2 + pr.phase) * 1.6) * sMul, kDrift);
            }
            // 钳制云间红囊在画幅安全半径内
            const dP = Math.hypot(pr.x, pr.y);
            if (dP > maxR * 0.92 && dP > 0.001) {
              pr.x *= (maxR * 0.92) / dP;
              pr.y *= (maxR * 0.92) / dP;
            }
          }

          // 张口吞食时的气流吸入微粒
          state.vfxCd -= dt;
          if (vfx && gulpActive && state.vfxCd <= 0) {
            state.vfxCd = 0.09;
            const ang = renderHeadYaw + (Math.random() - 0.5) * 0.9;
            const distS = (16 + Math.random() * 10) * sMul;
            const sx = mx - Math.sin(ang) * distS;
            const sy = my + Math.cos(ang) * distS;
            const sz = mz + (Math.random() - 0.5) * 6 * sMul;
            vfx.spawnParticle(
              sx, sy, sz,
              (mx - sx) * 2.2, (my - sy) * 2.2, (mz - sz) * 2.2,
              0.45, 1.35, Math.random() < 0.5 ? fx.throat : fx.gold, true, 0
            );
          }

          // 包围盒锚定并严格钳制 state.x/y 在 limitR 内
          let cx = nodes[5].x, cy = nodes[5].y;
          const dC = Math.hypot(cx, cy);
          if (dC > limitR && dC > 0.001) {
            cx *= limitR / dC;
            cy *= limitR / dC;
          }
          const safeDt = Math.max(dt, 0.001);
          state.vx = (cx - state.x) / safeDt;
          state.vy = (cy - state.y) / safeDt;
          state.x = cx;
          state.y = cy;
          state.z = baseLift;
          state.yaw = renderHeadYaw;

          sockets.setWorld('mouth', mx, my, mz, renderHeadYaw);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const nodes = chain.nodes;

          // 1. 13 节共享厚重巨蛇躯干（nodes[0] 补桥 + nodes[1..13]）
          const [n0x, n0y] = localToWorldXY(nodes[0].x, nodes[0].y, nodes[0].yaw, 0, -1.2 * sMul);
          list.push({
            partKey: 'segNeck',
            asset: parts.segNeck,
            x: n0x,
            y: n0y,
            lift: Math.max(2.0, nodes[0].z - 3.6 * sMul),
            ro: nodes[0].yaw,
            bias: 0.22
          });
          for (let i = 1; i < NUM_NODES - 1; i++) {
            const nd = nodes[i];
            const pk = bodyKey(i);
            list.push({
              partKey: pk,
              asset: parts[pk],
              x: nd.x,
              y: nd.y,
              lift: Math.max(2.0, nd.z - 3.6 * sMul),
              ro: nd.yaw,
              bias: 0.20 - i * 0.015
            });
          }

          // 2. 巨型丝带尾鳍
          const tailNd = nodes[NUM_NODES - 1];
          const [tfx, tfy] = pivotToWorldXY(tailNd.x, tailNd.y, tailNd.yaw, TAILFIN_PIVOT.x * sMul, TAILFIN_PIVOT.y * sMul);
          list.push({
            partKey: 'tailFin',
            asset: parts.tailFin,
            x: tfx,
            y: tfy,
            lift: Math.max(2.0, tailNd.z - 6.4 * sMul),
            ro: tailNd.yaw,
            bias: -0.35
          });

          // 3. 3 对滞后起伏的亮青金巨型长鳍翼（共享 2 档尺寸 × 3 档姿态）
          for (const wa of WING_ANCHORS) {
            const nd = nodes[wa.nodeIdx];
            const beat = Math.sin(state.wingPhase + wa.phaseOff);
            const wp = beat > 0.32 ? 'up' : (beat < -0.32 ? 'dn' : 'mid');
            const piv = wa.size === 'big' ? BIG_WING_PIVOT : MID_WING_PIVOT;
            const prefix = wa.size === 'big' ? 'wingBig' : 'wingMid';
            const sweep = beat * 0.22;
            for (const s of [-1, 1]) {
              const [shX, shY] = localToWorldXY(nd.x, nd.y, nd.yaw, s * 3.8 * sMul, 0.5 * sMul);
              const wYaw = wrapAngle(nd.yaw - s * sweep);
              const [wx, wy] = localToWorldXY(shX, shY, wYaw, s * piv.x * sMul, -piv.y * sMul);
              const key = prefix + (s < 0 ? 'L_' : 'R_') + wp;
              list.push({
                partKey: key,
                asset: parts[key],
                x: wx,
                y: wy,
                lift: Math.max(2.0, nd.z - (wa.size === 'big' ? 7.2 : 5.6) * sMul),
                ro: wYaw,
                bias: -0.05 - wa.nodeIdx * 0.01
              });
            }
          }

          // 4. 可张合吞天巨蛇首
          const hYaw = wrapAngle(nodes[0].yaw + headYawSpring.x);
          const [hx, hy] = pivotToWorldXY(nodes[0].x, nodes[0].y, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const hKey = state.isGulping ? 'headGulp' : 'headClosed';
          list.push({
            partKey: hKey,
            asset: parts[hKey],
            x: hx,
            y: hy,
            lift: Math.max(2.0, nodes[0].z - 6.6 * sMul),
            ro: hYaw,
            bias: 0.72
          });

          // 5. 云间红囊小群（被巨口吞食的伴生群落）
          for (const pr of preys) {
            if (!pr.alive) continue;
            list.push({
              partKey: 'cloudPrey',
              asset: parts.cloudPrey,
              x: pr.x,
              y: pr.y,
              lift: Math.max(3.0, pr.z - 2.6 * sMul),
              ro: pr.phase + state.wingPhase * 0.4,
              symDeg: 90,
              bias: 0.65
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sky4Def.id,
            code: Sky4Def.code,
            status: Sky4Def.status,
            name: Sky4Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            isGulping: state.isGulping,
            segmentCount: NUM_NODES,
            wingPairs: WING_ANCHORS.length,
            footRadius: Sky4Def.footRadius,
            headZ: 28,
            centerZ: 20,
            blocks: Sky4Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sky4Def);
})(window.PixelWorkshop);
