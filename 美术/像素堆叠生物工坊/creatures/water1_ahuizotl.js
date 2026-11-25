'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, MultiLegGaitSolver, SpringDamper1D, SpringDamper3D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 水1 · 尾手水兽（阿兹特克 Ahuizotl · v3 精制纯生态版，+Y 正前，z=0 贴地）
  //   1. 紧凑敏捷的犬形水兽躯干（2 档无损烘焙：常态巡游 / 浅水蹲伏），独立可扭转头颈、
  //      湿润竖起成簇的尖刺背毛、短立耳、鼻吻与锐利双眼（eyeGlint 严禁进 glowKeys）；
  //   2. 4 条带弯膝折角的涉水短腿（脚掌带浅蹼），MultiLegGaitSolver 驱动涉水步态；
  //   3. 7 节细长柔韧拖拽长尾（ChainSolver 拖拽 + 交互时平滑追踪目标点），末端雕出
  //      辨识度极高的五指灵巧小手（掌心朝前，拇指与四指分明，支持张开摸索/合拢抓握
  //      两档无损烘焙，pivotToWorldXY 锁死腕部枢轴）；
  //   4. 待机交互物：岸边鹅卵石缝（3 块圆石拼出暗缝 + 青苔点缀）与立体赤壳小螃蟹
  //      （扁圆蟹壳 + 双钳开合两档 + 豆豆眼），完整演绎「蹲稳盯缝 -> 尾手伸缝摸索
  //      -> 螃蟹横行探出 -> 尾手抓提晃至鼻前 -> 凑近嗅探被夹猛甩 -> 落水溅沫溜回」。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 主毛皮（墨蓝湿毛）
      furDark:      '#16293d',
      furMid:       '#254563',
      furHi:        '#436f94',
      // 湿润竖起成簇的尖刺背毛（深青墨对比）
      spikeDark:    '#0d1c2b',
      spikeMid:     '#1a364d',
      spikeHi:      '#2f5e7a',
      // 胸腹与颊下浅绒
      bellyDark:    '#627585',
      bellyMid:     '#94abbd',
      bellyHi:      '#c7dae6',
      // 浅蹼脚掌与湿吻
      webDark:      '#1c303d',
      webMid:       '#335263',
      webHi:        '#587f91',
      // 尾端五指小手（高辨识度苍暖肤色，与长尾强对比）
      handDark:     '#7d625a',
      handMid:      '#b89284',
      handHi:       '#e3bfb0',
      // 鼻头与短爪
      clawDark:     '#141821',
      clawMid:      '#2d3442',
      clawHi:       '#535d70',
      // 锐利双眼（eyeGlint 严禁进 glowKeys）
      eyeDark:      '#0c1017',
      eyeIris:      '#f0b429',
      eyeGlint:     '#f5fcff',
      // 岸边鹅卵石缝
      rockDark:     '#3b454c',
      rockMid:      '#64727a',
      rockHi:       '#93a3ab',
      mossDark:     '#234a35',
      mossMid:      '#3c7852',
      mossHi:       '#69ab79',
      // 赤壳小螃蟹
      crabDark:     '#8c221d',
      crabMid:      '#cf3e2e',
      crabHi:       '#f57458',
      crabClawDark: '#a83e16',
      crabClawMid:  '#e86e2c',
      crabClawHi:   '#ffb266'
    },
    glowKeys: [],
    parts: [
      'torso', 'spike', 'belly', 'head', 'snout', 'ear', 'eye', 'claw',
      'leg', 'web', 'tail', 'hand', 'rock', 'moss', 'crabShell', 'crabClaw'
    ],
    noCrease: [
      ['torso', 'belly'], ['torso', 'spike'], ['head', 'snout'], ['head', 'ear'],
      ['head', 'eye'], ['head', 'spike'], ['leg', 'web'], ['web', 'claw'],
      ['tail', 'hand'], ['rock', 'moss'], ['crabShell', 'crabClaw'], ['crabShell', 'eye']
    ],
    materials: {
      fur:      ['furDark',      'furMid',      'furHi'],
      spike:    ['spikeDark',    'spikeMid',    'spikeHi'],
      belly:    ['bellyDark',    'bellyMid',    'bellyHi'],
      web:      ['webDark',      'webMid',      'webHi'],
      hand:     ['handDark',     'handMid',     'handHi'],
      claw:     ['clawDark',     'clawMid',     'clawHi'],
      rock:     ['rockDark',     'rockMid',     'rockHi'],
      moss:     ['mossDark',     'mossMid',     'mossHi'],
      crab:     ['crabDark',     'crabMid',     'crabHi'],
      crabClaw: ['crabClawDark', 'crabClawMid', 'crabClawHi']
    },
    protectedParts: ['eye', 'claw', 'hand', 'crabClaw']
  });

  // 4 套零重建模换色皮肤（含对应描边色与水花/溅沫配色）
  const SKINS = [
    {
      id: 'ink_blue',
      name: '墨蓝湿毛（深湾经典）',
      dot: '#285278',
      outline: '#09131f',
      pal: {},
      fx: { splash: '#c9f0f7', ripple: '#5cc8d9', crabBit: '#f57458' }
    },
    {
      id: 'otter_brown',
      name: '獭褐苔背（泥岸款）',
      dot: '#6e4c32',
      outline: '#17100b',
      pal: {
        furDark:   '#3b2718', furMid:   '#63442b', furHi:   '#946c4a',
        spikeDark: '#1c3825', spikeMid: '#305e3c', spikeHi: '#538c5b',
        bellyDark: '#786c57', bellyMid: '#b0a084', bellyHi: '#ded0b6',
        webDark:   '#2e231a', webMid:   '#4d3b2d', webHi:   '#755c48',
        handDark:  '#735345', handMid:  '#ad816d', handHi:  '#d9ae9a',
        eyeIris:   '#d9e645'
      },
      fx: { splash: '#d4e6d8', ripple: '#7eb896', crabBit: '#f57458' }
    },
    {
      id: 'pale_jade',
      name: '苍白浅碧（溪泉款）',
      dot: '#8cc7c2',
      outline: '#0d1c1f',
      pal: {
        furDark:   '#5c737d', furMid:   '#91adb8', furHi:   '#c9dfe6',
        spikeDark: '#1f5e61', spikeMid: '#379494', spikeHi: '#6cc9c4',
        bellyDark: '#7d949c', bellyMid: '#b8cfd6', bellyHi: '#e8f5f7',
        webDark:   '#3b5c63', webMid:   '#5c8a91', webHi:   '#8ab8bd',
        handDark:  '#8a7078', handMid:  '#c4a3ac', handHi:  '#ebd0d7',
        eyeIris:   '#45c8f0'
      },
      fx: { splash: '#e0fafc', ripple: '#78e0e6', crabBit: '#f57458' }
    },
    {
      id: 'copper_dark',
      name: '赤铜玄尾（红岩款）',
      dot: '#ad492b',
      outline: '#1c0c0a',
      pal: {
        furDark:   '#542116', furMid:   '#8f3a24', furHi:   '#c75e3c',
        spikeDark: '#1c1824', spikeMid: '#332c40', spikeHi: '#564c69',
        bellyDark: '#85654e', bellyMid: '#bd9577', bellyHi: '#e8c4a7',
        webDark:   '#291c1e', webMid:   '#4a3336', webHi:   '#735256',
        handDark:  '#7a4d3a', handMid:  '#b5785c', handHi:  '#e3a88a',
        eyeIris:   '#ff9e2b'
      },
      fx: { splash: '#f2dec9', ripple: '#d9986c', crabBit: '#ff8552' }
    }
  ];

  // =========================================================================
  // 1. 紧凑敏捷犬形水兽躯干（2 档无损烘焙：norm 常态 / crouch 浅水蹲伏）
  //    基准尺寸 16×22×13，背脊带 4 簇湿润竖起的尖刺背毛，胸腹分明
  // =========================================================================
  function buildTorso(makeCanvas, stage) {
    const isCrouch = stage === 'crouch';
    const W = 16, D = 22, H = 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.8, 6.8, -9.5, 9.5, 1, 11, (x, y, z, X, Y) => {
      const zDrop = isCrouch ? -0.9 : 0.0;
      const dChest = (Math.hypot(X / 4.8, (Y - 3.4) / 5.4, (z - (5.6 + zDrop)) / 3.9) - 1.0) * 4.4;
      const dWaist = (Math.hypot(X / 3.9, (Y + 0.6) / 4.6, (z - (5.2 + zDrop * 0.6)) / 3.2) - 1.0) * 3.8;
      const dRump  = (Math.hypot(X / 4.5, (Y + 5.0) / 4.8, (z - (5.8 + zDrop * 0.3)) / 3.7) - 1.0) * 4.2;
      const d = smin(smin(dChest, dWaist, 2.0), dRump, 2.0);
      if (d > 0) return;

      const isBelly = z < (4.4 + zDrop * 0.5) && Math.abs(X) < 3.4 && Y > -5.5 && Y < 7.2;
      if (isBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else {
        m.setRaw(x, y, z, mat('fur'), partId.torso);
      }
    });

    // 4 簇湿润竖起的尖刺背毛（前短后高、向后上方斜挑，蹲伏时微微炸开更挺）
    const spikeBoost = isCrouch ? 0.85 : 0.0;
    const clusters = [
      { y0:  4.2, z0: 8.2, dy: -1.4, dz: 2.5 + spikeBoost, r0: 1.45, r1: 0.45, side: 1.5 },
      { y0:  1.0, z0: 8.0, dy: -1.7, dz: 3.1 + spikeBoost, r0: 1.55, r1: 0.48, side: 1.8 },
      { y0: -2.4, z0: 8.1, dy: -1.9, dz: 3.0 + spikeBoost, r0: 1.45, r1: 0.46, side: 1.7 },
      { y0: -5.6, z0: 7.9, dy: -1.7, dz: 2.3 + spikeBoost, r0: 1.25, r1: 0.42, side: 1.2 }
    ];
    for (const c of clusters) {
      const bz = c.z0 - (isCrouch ? 0.7 : 0);
      // 中央主刺
      m.paintCapsule(0, c.y0, bz, 0, c.y0 + c.dy, bz + c.dz, c.r0, c.r1, mat('spike'), partId.spike, true);
      // 两侧斜向湿毛小簇
      for (const s of [-1, 1]) {
        m.paintCapsule(
          s * 1.1, c.y0 - 0.3, bz - 0.5,
          s * (1.2 + c.side), c.y0 + c.dy * 0.85, bz + c.dz * 0.72,
          c.r0 * 0.72, 0.40, mat('spike'), partId.spike, true
        );
      }
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.8, headZ: 13, centerZ: 6 });
  }

  // =========================================================================
  // 2. 独立可扭转头颈（2 档无损烘焙：norm 常态 / sniff 凑近嗅探）
  //    尺寸 12×15×11，枢轴锁在后颈根部 (0, -3.2)，含短立耳、鼻吻与 2×2 锐利双眼
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -3.2 };
  function buildHead(makeCanvas, pose) {
    const isSniff = pose === 'sniff';
    const W = 12, D = 15, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 粗实颈根（与躯干前胸自然咬合）
    m.paintCapsule(0, -3.4, 1.8, 0, -0.8, 4.4, 2.75, 3.05, mat('fur'), partId.head, true);
    // 紧凑犬形颅骨
    m.paintEllipsoid(0, 0.2, 5.2, 3.5, 3.6, 3.1, mat('fur'), partId.head, true);
    // 颊下浅绒
    m.paintEllipsoid(0, 1.0, 3.4, 2.7, 2.8, 1.4, mat('belly'), partId.belly, true);

    // 紧凑犬吻 + 湿润黑鼻头（嗅探态微扬前探）
    const snoutZ = isSniff ? 5.0 : 4.4;
    const snoutY = isSniff ? 4.8 : 4.2;
    m.paintEllipsoid(0, 3.2, snoutZ, 2.1, 2.5, 1.85, mat('web'), partId.snout, true);
    m.paintEllipsoid(0, snoutY + 1.0, snoutZ + 0.55, 1.15, 0.95, 0.85, mat('claw'), partId.claw, true);
    // 下颌轮廓
    m.paintEllipsoid(0, 3.0, isSniff ? 2.8 : 3.1, 1.6, 1.9, 0.95, mat('belly'), partId.belly, true);

    // 一对警觉短立耳（嗅探态更向前竖起）
    for (const s of [-1, 1]) {
      const earTipY = isSniff ? 0.6 : -0.8;
      const earTipZ = isSniff ? 9.6 : 9.1;
      m.paintCapsule(s * 2.2, -0.6, 7.2, s * 3.2, earTipY, earTipZ, 1.25, 0.52, mat('fur'), partId.ear, true);
      m.paintCapsule(s * 2.3, -0.1, 7.2, s * 2.8, earTipY + 0.4, earTipZ - 0.6, 0.65, 0.35, mat('belly'), partId.ear, true);
    }

    // 额后一簇竖立湿刺毛
    m.paintCapsule(0, -1.2, 7.4, 0, -3.4, 9.6, 1.2, 0.45, mat('spike'), partId.spike, true);

    m.despeckle();
    m.applyArtShading(true);

    // 表面贴合 2×2 锐利双眼（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.0);
    const eyeZ = 5;
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 5; step++) {
        const tx = Math.round(hw + s * (4.1 - step));
        const p = m.getPartId(tx, eyeY, eyeZ);
        if (p === partId.head || p === partId.snout) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 2.7);
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dy === 1)
            ? keyToId.eyeGlint
            : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 10, centerZ: 5 });
  }

  // =========================================================================
  // 3. 4 条带弯膝折角的涉水短腿 + 带浅蹼的涉水脚掌（高重叠 IK 连贯衔接，永不分离）
  // =========================================================================
  function buildLegSeg(makeCanvas, rTop, rBot, hLen) {
    const S = Math.max(5, Math.ceil(Math.max(rTop, rBot) * 2 + 3));
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat('fur'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildWebPaw(makeCanvas) {
    const m = new VoxelModel(7, 8, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, -0.6, 1.5, 1.9, 2.0, 1.2, mat('web'), partId.web, true);
    m.paintEllipsoid(0,  0.8, 0.9, 2.5, 2.2, 0.75, mat('web'), partId.web, true);
    const toes = [[-1.6, 2.4], [0.0, 2.9], [1.6, 2.4]];
    for (const [tx, ty] of toes) {
      m.paintCapsule(tx * 0.45, -0.2, 1.1, tx, ty, 0.85, 0.85, 0.62, mat('web'), partId.web, true);
      m.paintEllipsoid(tx, ty + 0.55, 0.75, 0.52, 0.55, 0.52, mat('claw'), partId.claw, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.6 });
  }

  // =========================================================================
  // 4. 7 节柔韧长尾节（4 级递减粗细，高重叠连贯防串珠）
  // =========================================================================
  function buildTailSeg(makeCanvas, r0, r1, lenY) {
    const W = Math.max(5, Math.ceil(r0 * 2 + 3));
    const D = Math.max(6, Math.ceil(lenY + r0 * 2 + 2));
    const H = Math.max(5, Math.ceil(r0 * 2 + 3));
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const cy = lenY * 0.5;
    const cz = H * 0.5;
    m.paintCapsule(0, -cy, cz, 0, cy, cz, r1, r0, mat('spike'), partId.tail, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: r0, centerZ: Math.round(cz) });
  }

  // =========================================================================
  // 5. 核心特征：尾巴末端的五指灵巧小手（2 档无损烘焙：open 张开摸索 / grab 合拢抓握）
  //    尺寸 12×12×10，掌心朝前（+Y），拇指与四指清晰可辨，枢轴锁在腕部 (0, -3.4)
  // =========================================================================
  const HAND_PIVOT = { x: 0, y: -4.0 };
  function buildTailHand(makeCanvas, pose) {
    const isGrab = pose === 'grab';
    const m = new VoxelModel(14, 14, 11, SPEC);
    const { mat, partId } = SPEC;

    // 腕部与尾梢衔接段（深色尾梢过渡到苍暖手腕）
    m.paintCapsule(0, -4.8, 4.6, 0, -2.0, 4.8, 1.45, 1.55, mat('spike'), partId.tail, true);
    // 饱满立体手掌（掌心朝 +Y，略微抬起方便多角度清晰辨识五指）
    m.paintEllipsoid(0, -0.4, 4.8, 2.95, 2.05, 2.45, mat('hand'), partId.hand, true);

    if (isGrab) {
      // 合拢抓握态：四指向前下方收拢弯曲，大拇指对扣成抓钳，稳稳兜住小螃蟹
      const fxs = [-2.5, -0.85, 0.85, 2.5];
      const fzs = [6.0, 6.6, 6.6, 5.9];
      for (let i = 0; i < 4; i++) {
        const fx = fxs[i], fz = fzs[i];
        m.paintCapsule(fx * 0.88, 0.6, fz, fx, 2.9, fz + 0.4, 0.86, 0.78, mat('hand'), partId.hand, true);
        m.paintCapsule(fx, 2.9, fz + 0.4, fx * 0.88, 3.6, fz - 1.6, 0.78, 0.68, mat('hand'), partId.hand, true);
      }
      // 侧伸对扣大拇指
      m.paintCapsule(-2.5, 0.2, 3.8, -3.9, 2.2, 3.0, 0.92, 0.80, mat('hand'), partId.hand, true);
      m.paintCapsule(-3.9, 2.2, 3.0, -2.2, 3.4, 3.4, 0.80, 0.68, mat('hand'), partId.hand, true);
    } else {
      // 张开摸索态：大拇指与四指实心分叉、指缝清晰，360° 旋转一眼认出五指小手
      const fingers = [
        { bx: -2.4, bz: 5.8, tx: -4.2, ty: 3.6, tz: 8.0 },
        { bx: -0.8, bz: 6.3, tx: -1.6, ty: 4.5, tz: 9.0 },
        { bx:  0.8, bz: 6.3, tx:  1.5, ty: 4.6, tz: 9.1 },
        { bx:  2.4, bz: 5.7, tx:  4.0, ty: 3.7, tz: 7.9 }
      ];
      for (const f of fingers) {
        m.paintCapsule(f.bx, 0.5, f.bz, f.tx, f.ty, f.tz, 0.86, 0.72, mat('hand'), partId.hand, true);
      }
      // 清晰外展的大拇指（偏低侧伸，形成鲜明手掌轮廓）
      m.paintCapsule(-2.5, 0.0, 3.9, -5.2, 2.4, 4.2, 0.94, 0.78, mat('hand'), partId.hand, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 10, centerZ: 5 });
  }

  // =========================================================================
  // 6. 待机交互物 A：岸边鹅卵石缝（18×16×10，3 块圆润鹅卵石拼出清晰暗缝 + 青苔）
  // =========================================================================
  function buildPebbleCluster(makeCanvas) {
    const m = new VoxelModel(18, 16, 10, SPEC);
    const { mat, partId } = SPEC;

    // 左后大鹅卵石
    m.paintEllipsoid(-3.4, -2.2, 3.4, 4.8, 4.4, 3.6, mat('rock'), partId.rock, true);
    // 右侧中鹅卵石（与左石相隔，朝 +Y 方向留出约 3.2 格宽的清晰暗石缝）
    m.paintEllipsoid( 4.0, -0.4, 2.8, 4.0, 4.5, 2.9, mat('rock'), partId.rock, true);
    // 顶部搭桥扁圆石（盖在两石后上方，形成有纵深的“石缝洞口”）
    m.paintEllipsoid( 0.4, -3.4, 5.8, 4.4, 3.2, 2.1, mat('rock'), partId.rock, true);
    // 左前低矮小卵石点缀
    m.paintEllipsoid(-5.2,  3.2, 1.5, 2.4, 2.2, 1.6, mat('rock'), partId.rock, true);

    // 雕刻清晰石缝洞口（从 +Y 朝向水兽的一侧向内挖出深暗缝隙）
    m.fillAABB(-2.2, 2.4, -1.8, 6.5, 1, 5, (x, y, z, X, Y) => {
      const slit = Math.hypot((X - 0.1) / 1.9, (z - 2.4) / 2.2);
      if (slit <= 1.0 && Y > -1.4) {
        m.setRaw(x, y, z, 0, 0);
      }
    });

    // 石顶湿润青苔点缀
    m.paintEllipsoid(-3.6, -2.5, 6.6, 2.6, 2.1, 0.95, mat('moss'), partId.moss, true);
    m.paintEllipsoid( 3.8, -0.8, 5.3, 2.0, 2.2, 0.85, mat('moss'), partId.moss, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.4, headZ: 9, centerZ: 4 });
  }

  // =========================================================================
  // 7. 待机交互物 B：立体赤壳小螃蟹（2 档无损烘焙：open 举钳威吓 / pinch 合钳夹紧）
  //    尺寸 12×11×7，扁圆赤红蟹壳 + 3 对小步足 + 一对可开合大钳 + 豆豆眼
  // =========================================================================
  function buildCrab(makeCanvas, pose) {
    const isPinch = pose === 'pinch';
    const W = 12, D = 11, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 扁圆赤红蟹壳
    m.paintEllipsoid(0, -0.5, 2.7, 3.6, 2.7, 1.75, mat('crab'), partId.crabShell, true);

    // 两侧 3 对细小步足（横行姿态清晰）
    for (const s of [-1, 1]) {
      for (const ly of [-2.0, -0.5, 1.0]) {
        m.paintCapsule(s * 2.8, ly, 2.0, s * 4.8, ly - 0.3, 0.9, 0.58, 0.45, mat('crab'), partId.crabShell, true);
      }
    }

    // 前方一对鲜亮暖橙大钳子（open 高举外张 / pinch 向内合拢夹紧）
    for (const s of [-1, 1]) {
      if (isPinch) {
        m.paintCapsule(s * 2.2, 1.4, 2.5, s * 2.5, 3.6, 3.4, 0.85, 1.05, mat('crabClaw'), partId.crabClaw, true);
        m.paintCapsule(s * 2.5, 3.6, 3.4, s * 0.9, 4.4, 3.8, 0.95, 0.65, mat('crabClaw'), partId.crabClaw, true);
      } else {
        m.paintCapsule(s * 2.4, 1.2, 2.5, s * 3.8, 3.2, 3.6, 0.82, 1.05, mat('crabClaw'), partId.crabClaw, true);
        m.paintCapsule(s * 3.8, 3.2, 3.6, s * 3.2, 4.5, 4.6, 0.82, 0.52, mat('crabClaw'), partId.crabClaw, true);
        m.paintCapsule(s * 3.8, 3.2, 3.6, s * 2.2, 4.3, 3.4, 0.72, 0.48, mat('crabClaw'), partId.crabClaw, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);

    // 一对高辨识度黑亮豆豆眼（立在壳前缘，eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.4);
      const ey = Math.round(hd + 2.0);
      m.setRaw(ex, ey, 4, keyToId.eyeDark, partId.eye);
      m.setRaw(ex, ey, 5, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 6, centerZ: 3 });
  }

  // 7 节长尾对应的规格键（由粗到细自然收尖）
  const TAIL_SEG_KEYS = ['tail0', 'tail0', 'tail1', 'tail1', 'tail2', 'tail2', 'tail3'];

  const Water1Def = {
    id: 'water1_ahuizotl',
    code: '水1',
    name: '水1 · 尾手水兽',
    status: 'done',
    tag: '犬形涉水兽 · 尾手掏蟹',
    summary: 'v3 精制：紧凑犬形水兽与湿润尖刺背毛 + 4 足浅蹼弯膝涉水 IK + 7 节柔韧长尾与五指尾手（张开/抓握双态）+ 岸边鹅卵石缝与赤壳小螃蟹交互自循环',
    defaultHabitat: 'stoneBay',
    footRadius: 7.4,
    ecoWeight: 0.9,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: ['犬形湿刺背毛躯干', '4 足浅蹼弯膝 IK', '7 节拖拽长尾', '五指尾手张合双态', '鹅卵石缝与赤壳小螃蟹'],
    soulHabit: '浅水边蹲稳歪头盯石缝 -> 长尾绕身将五指尾手伸缝摸索 -> 赤壳小螃蟹举钳探出 -> 尾手抓提晃至鼻前嗅探 -> 被钳夹猛甩落水溜回',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torsoNorm:    buildTorso(makeCanvas, 'norm'),
        torsoCrouch:  buildTorso(makeCanvas, 'crouch'),
        headNorm:     buildHead(makeCanvas, 'norm'),
        headSniff:    buildHead(makeCanvas, 'sniff'),
        legUpper:     buildLegSeg(makeCanvas, 1.65, 1.40, 3.8),
        legLower:     buildLegSeg(makeCanvas, 1.38, 1.20, 3.8),
        pawWeb:       buildWebPaw(makeCanvas),
        tail0:        buildTailSeg(makeCanvas, 1.50, 1.35, 2.8),
        tail1:        buildTailSeg(makeCanvas, 1.32, 1.18, 2.7),
        tail2:        buildTailSeg(makeCanvas, 1.15, 1.02, 2.6),
        tail3:        buildTailSeg(makeCanvas, 1.00, 0.90, 2.5),
        tailHandOpen: buildTailHand(makeCanvas, 'open'),
        tailHandGrab: buildTailHand(makeCanvas, 'grab'),
        pebbleCluster:buildPebbleCluster(makeCanvas),
        crabOpen:     buildCrab(makeCanvas, 'open'),
        crabPinch:    buildCrab(makeCanvas, 'pinch')
      };

      // 4 足涉水四拍稳走 IK（髋点深嵌躯干内部 ±3.5，写实低抬掌涉水）
      const gait = new MultiLegGaitSolver([
        { id: 'FL', hipX: -3.5, hipY:  4.2, hipZ: 2.2, restX: -4.6, restY:  4.8, group: 0, L1: 4.0, L2: 4.2, kneeSign: -1 },
        { id: 'FR', hipX:  3.5, hipY:  4.2, hipZ: 2.2, restX:  4.6, restY:  4.8, group: 1, L1: 4.0, L2: 4.2, kneeSign: -1 },
        { id: 'BL', hipX: -3.6, hipY: -4.6, hipZ: 2.2, restX: -4.7, restY: -4.4, group: 1, L1: 4.1, L2: 4.3, kneeSign:  1 },
        { id: 'BR', hipX:  3.6, hipY: -4.6, hipZ: 2.2, restX:  4.7, restY: -4.4, group: 0, L1: 4.1, L2: 4.3, kneeSign:  1 }
      ], {
        mode: 'walk4',
        stepThreshold: 3.2,
        stepDuration: 0.21,
        stepHeight: 2.4,
        strideAnticipation: 0.46
      });

      // 7 节长尾真拖拽物理链（总节点数 8：0 为臀根，1..7 为 7 节长尾，末端接五指小手）
      const tailChain = new ChainSolver(8, 2.35, {
        maxAngle: 0.62,
        waveFreq: 3.8,
        wavePhaseStep: 0.54,
        waveAmp: 0.34
      });

      const headYawSpring  = new SpringDamper1D(0, 96, 8.2);
      const crouchSpring   = new SpringDamper1D(0, 72, 7.6);
      const bodyBounce     = new SpringDamper1D(0, 124, 8.4);
      const handShake      = new SpringDamper1D(0, 180, 6.2);
      const tailBlendSpring = new SpringDamper1D(0, 54, 7.4);
      const handTarget     = new SpringDamper3D(0, 0, 5, 86, 7.8);

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 5.0,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        // 鹅卵石缝世界坐标（相对 home 放在侧前方浅水边）
        rockX: (opts.homeX ?? 0) + 17.5,
        rockY: (opts.homeY ?? 0) + 12.5,
        rockYaw: (opts.homeYaw ?? 0) + Math.PI * 0.78,
        // 小螃蟹实时状态
        crabX: (opts.homeX ?? 0) + 17.5,
        crabY: (opts.homeY ?? 0) + 12.5,
        crabZ: 0.6,
        crabYaw: 0,
        crabPose: 'open',
        crabVisible: false,
        crabSplashDone: false,
        // 形态切换状态
        torsoPose: 'norm',
        headPose: 'norm',
        handPose: 'open',
        // 交互循环状态机：
        // 'wander' -> 'approach' -> 'crouch' -> 'probe' -> 'emerge' -> 'grab' -> 'sniff' -> 'pinch_fling' -> 'cooldown'
        stage: 'crouch',
        stageTimer: 0.75,
        stageDur: 0.75,
        probeRippleCd: 0,
        flingStartX: 0, flingStartY: 0, flingStartZ: 9,
        flingEndX: 0, flingEndY: 0,
        // 最终渲染用的长尾节点（由 ChainSolver 与交互追踪样条平滑融合）
        tailPts: Array.from({ length: 8 }, () => ({ x: 0, y: 0, z: 5, yaw: 0 })),
        handX: 0, handY: 0, handZ: 5, handYaw: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      // 计算石缝洞口世界坐标（洞口朝向石堆局部 +Y）
      function getCreviceMouth(sMul) {
        const [mx, my] = localToWorldXY(state.rockX, state.rockY, state.rockYaw, 0, 3.6 * sMul);
        return [mx, my, 1.3 * sMul];
      }

      // 计算石缝外小螃蟹探头坐标
      function getCrabOutPos(sMul, sideShift = 0) {
        const [ox, oy] = localToWorldXY(state.rockX, state.rockY, state.rockYaw, sideShift * sMul, 8.2 * sMul);
        return [ox, oy, 0.5 * sMul];
      }

      // 计算水兽在浅水边蹲稳盯缝的理想站位
      function getWatchSpot(sMul) {
        const [wx, wy] = localToWorldXY(state.rockX, state.rockY, state.rockYaw, -2.5 * sMul, 17.8 * sMul);
        const aimYaw = Math.atan2(-(state.rockX - wx), state.rockY - wy);
        return [wx, wy, aimYaw];
      }

      function enterStage(next, dur) {
        state.stage = next;
        state.stageTimer = dur;
        state.stageDur = dur;
      }

      const instance = {
        def: Water1Def,
        cachePrefix: `water1_ah_${Math.random().toString(36).slice(2, 7)}`,
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
          state.yaw = homeYaw;
          state.z = 5.0;
          state.vx = 0;
          state.vy = 0;

          // 把鹅卵石缝放在 home 侧前方，洞口朝向水兽
          const [rx, ry] = localToWorldXY(homeX, homeY, homeYaw, 11.5, 14.5);
          state.rockX = rx;
          state.rockY = ry;
          state.rockYaw = wrapAngle(Math.atan2(-(homeX - rx), homeY - ry));

          state.torsoPose = 'norm';
          state.headPose = 'norm';
          state.handPose = 'open';
          state.crabPose = 'open';
          state.crabVisible = false;
          state.crabSplashDone = false;
          enterStage('crouch', 0.75);

          gait.reset(state.x, state.y, state.yaw);
          const [tx0, ty0] = localToWorldXY(state.x, state.y, state.yaw, 0, -8.2);
          tailChain.reset(tx0, ty0, state.z + 2.2, state.yaw);
          for (let i = 0; i < 8; i++) {
            state.tailPts[i].x = tailChain.nodes[i].x;
            state.tailPts[i].y = tailChain.nodes[i].y;
            state.tailPts[i].z = tailChain.nodes[i].z;
            state.tailPts[i].yaw = tailChain.nodes[i].yaw;
          }
          const tip = tailChain.nodes[7];
          handTarget.reset(tip.x, tip.y, tip.z);
          state.handX = tip.x; state.handY = tip.y; state.handZ = tip.z; state.handYaw = tip.yaw;
          headYawSpring.x = headYawSpring.v = 0;
          crouchSpring.x = crouchSpring.v = 0;
          bodyBounce.x = bodyBounce.v = 0;
          handShake.x = handShake.v = 0;
          tailBlendSpring.x = tailBlendSpring.v = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));

          // 同时兼容新版 eco.action === 'idle' 与旧版 eco.patrol === false
          const isIdle = !!(eco && (eco.action === 'idle' || eco.patrol === false));
          const patrol = !isIdle;

          const [mouthX, mouthY, mouthZ] = getCreviceMouth(sMul);
          const [watchX, watchY, watchYaw] = getWatchSpot(sMul);

          // -----------------------------------------------------------------
          // 1. 待机 / 巡游交互状态机推进
          // -----------------------------------------------------------------
          if (isIdle && (state.stage === 'wander' || state.stage === 'approach')) {
            enterStage('crouch', 0.65);
          }

          state.stageTimer -= dt;
          const stageU = clamp(1 - state.stageTimer / Math.max(0.01, state.stageDur), 0, 1);

          if (state.stage === 'wander') {
            state.crabVisible = false;
            state.torsoPose = 'norm';
            state.headPose = 'norm';
            state.handPose = 'open';
            if (state.stageTimer <= 0) {
              enterStage('approach', 4.5);
            }
          } else if (state.stage === 'approach') {
            state.crabVisible = false;
            state.torsoPose = 'norm';
            state.headPose = 'norm';
            state.handPose = 'open';
            const dWatch = Math.hypot(watchX - state.x, watchY - state.y);
            if (dWatch < 4.5 * sMul || state.stageTimer <= 0) {
              enterStage('crouch', 0.72);
            }
          } else if (state.stage === 'crouch') {
            state.crabVisible = false;
            state.torsoPose = 'crouch';
            state.headPose = 'norm';
            state.handPose = 'open';
            if (state.stageTimer <= 0) {
              enterStage('probe', 2.15);
            }
          } else if (state.stage === 'probe') {
            state.torsoPose = 'crouch';
            state.headPose = 'norm';
            state.handPose = 'open';
            state.crabVisible = false;
            // 尾手在石缝浅水中左右摸索，同步荡开水波涟漪
            state.probeRippleCd -= dt;
            if (state.probeRippleCd <= 0 && vfx) {
              state.probeRippleCd = 0.42;
              vfx.addRipple(mouthX, mouthY, 2.0, 13.0 * sMul, 0.65, 1.4);
            }
            if (state.stageTimer <= 0) {
              enterStage('emerge', 1.15);
              state.crabVisible = true;
              state.crabPose = 'open';
            }
          } else if (state.stage === 'emerge') {
            state.torsoPose = 'crouch';
            state.headPose = 'norm';
            state.handPose = 'open';
            state.crabVisible = true;
            state.crabPose = 'open';
            if (state.stageTimer <= 0) {
              enterStage('grab', 1.30);
              state.handPose = 'grab';
              if (vfx) {
                vfx.addRipple(state.crabX, state.crabY, 2.5, 15.0 * sMul, 0.60, 1.6);
                vfx.spawnSplash(state.crabX, state.crabY, 5, 0.75 * sMul, habitat.fx);
              }
            }
          } else if (state.stage === 'grab') {
            state.torsoPose = 'crouch';
            state.headPose = 'norm';
            state.handPose = 'grab';
            state.crabVisible = true;
            state.crabPose = 'open';
            if (state.stageTimer <= 0) {
              enterStage('sniff', 1.35);
              state.headPose = 'sniff';
            }
          } else if (state.stage === 'sniff') {
            state.torsoPose = 'norm';
            state.headPose = 'sniff';
            state.handPose = 'grab';
            state.crabVisible = true;
            // 后半段小螃蟹猛然合钳夹住尾手！
            state.crabPose = stageU > 0.68 ? 'pinch' : 'open';
            if (state.stageTimer <= 0) {
              enterStage('pinch_fling', 1.35);
              state.headPose = 'norm';
              state.crabPose = 'pinch';
              state.crabSplashDone = false;
              state.flingStartX = state.crabX;
              state.flingStartY = state.crabY;
              state.flingStartZ = state.crabZ;
              const [endX, endY] = getCrabOutPos(sMul, 1.2);
              state.flingEndX = endX;
              state.flingEndY = endY;
              handShake.impulse(42.0 * sp);
              bodyBounce.impulse(14.0 * sMul);
            }
          } else if (state.stage === 'pinch_fling') {
            state.torsoPose = 'norm';
            state.headPose = 'norm';
            // 前 0.25s 被夹剧烈抖甩，随后松手甩飞小螃蟹
            state.handPose = stageU > 0.22 ? 'open' : 'grab';
            state.crabPose = stageU > 0.28 ? 'open' : 'pinch';
            state.crabVisible = true;
            if (state.stageTimer <= 0) {
              state.crabVisible = false;
              enterStage('cooldown', isIdle ? 1.1 : 0.7);
            }
          } else if (state.stage === 'cooldown') {
            state.torsoPose = 'norm';
            state.headPose = 'norm';
            state.handPose = 'open';
            state.crabVisible = false;
            if (state.stageTimer <= 0) {
              if (patrol) enterStage('wander', 5.4);
              else enterStage('crouch', 0.75);
            }
          }

          // -----------------------------------------------------------------
          // 2. 主体移动：涉水自由巡游 / 走向石缝 / 原地蹲稳盯缝（防与鹅卵石缝穿模）
          // -----------------------------------------------------------------
          const crouchTarget = state.torsoPose === 'crouch' ? 1.0 : 0.0;
          const crouchVal = clamp(crouchSpring.update(dt, crouchTarget, 72 * sp, clamp(7.6 * dScale, 3.2, 11.5)), 0, 1.1);
          const baseLift = (5.0 - crouchVal * 1.15) * sMul;

          if (patrol && state.stage === 'wander') {
            // 避开鹅卵石缝半径，防止巡游穿模
            let rockAvoidX = 0, rockAvoidY = 0;
            const rdx = state.x - state.rockX, rdy = state.y - state.rockY;
            const rDist = Math.hypot(rdx, rdy) || 0.01;
            const safeRock = 15.5 * sMul;
            if (rDist < safeRock) {
              const push = ((safeRock - rDist) / safeRock) * 24;
              rockAvoidX = (rdx / rDist) * push;
              rockAvoidY = (rdy / rDist) * push;
            }
            Propulsion.multiLegWalk(state, dt, time, params, {
              ...eco,
              walkStyle: 'scurry',
              baseLift,
              avoidX: (eco && eco.avoidX ? eco.avoidX : 0) + rockAvoidX,
              avoidY: (eco && eco.avoidY ? eco.avoidY : 0) + rockAvoidY
            });
          } else if (patrol && state.stage === 'approach') {
            // 主动涉水走回鹅卵石缝观测点（先对准再迈步，彻底告别横移滑冰）
            Propulsion.walkToPoint(state, watchX, watchY, dt, params, {
              arriveDist: 2.2 * sMul,
              maxSpeed: 15.0,
              maxTurn: 3.8,
              aimYaw: watchYaw,
              baseLift
            });
          } else {
            // 交互期间或原地待机：自然走到位停步收脚并面向石缝
            Propulsion.walkToPoint(state, watchX, watchY, dt, params, {
              arriveDist: 2.6 * sMul,
              maxSpeed: 12.0,
              maxTurn: 4.0,
              aimYaw: wrapAngle(watchYaw + Math.sin(time * 0.9) * 0.06),
              baseLift
            });
          }

          // -----------------------------------------------------------------
          // 3. 4 足四拍涉水 IK 步态 + 落脚水波涟漪
          // -----------------------------------------------------------------
          const gaitRes = gait.update(dt, state.x, state.y, state.z, state.yaw, state.vx, state.vy, {
            mode: 'walk4',
            scaleMul: sMul,
            stepFreq: freq * 1.18,
            stepHeight: 1.9 * sMul,
            stepThreshold: 3.3 * sMul
          });
          state.tiltX = lerp(state.tiltX || 0, gaitRes.tiltX * 0.75 * sMul, expSmooth(dt, 11));
          state.tiltY = lerp(state.tiltY || 0, gaitRes.tiltY * 0.75 * sMul, expSmooth(dt, 11));
          if (gaitRes.landed.length > 0) {
            bodyBounce.impulse(-8.5 * sMul);
            for (const leg of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, leg.footX, leg.footY, 0.72 * sMul);
            }
          }
          bodyBounce.update(dt, -gaitRes.liftSum * 0.10, 124 * sp, clamp(8.4 * dScale, 3.5, 12.5));
          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.5 * sMul }));

          // -----------------------------------------------------------------
          // 4. 头部歪头盯缝 / 追随尾手 / 嗅探被夹反应
          // -----------------------------------------------------------------
          let targetHeadYaw = Math.sin(time * 1.4) * 0.18;
          if (state.stage === 'crouch' || state.stage === 'probe' || state.stage === 'emerge') {
            const dxR = state.rockX - state.x, dyR = state.rockY - state.y;
            const relR = wrapAngle(Math.atan2(-dxR, dyR) - state.yaw);
            targetHeadYaw = clamp(relR, -0.58, 0.58) + Math.sin(time * 2.4) * 0.12;
          } else if (state.stage === 'grab' || state.stage === 'sniff') {
            const dxH = state.handX - state.x, dyH = state.handY - state.y;
            const relH = wrapAngle(Math.atan2(-dxH, dyH) - state.yaw);
            targetHeadYaw = clamp(relH, -0.52, 0.52);
          } else if (state.stage === 'pinch_fling') {
            targetHeadYaw = Math.sin(time * 22.0) * 0.28;
          }
          headYawSpring.update(dt, targetHeadYaw, 96 * sp, clamp(8.2 * dScale, 3.6, 12.0));

          // -----------------------------------------------------------------
          // 5. 7 节长尾：ChainSolver 拖拽 + 交互期绕身目标追踪样条平滑融合
          // -----------------------------------------------------------------
          const [tRootX, tRootY] = localToWorldXY(state.x, state.y, state.yaw, 0, -7.8 * sMul);
          const tRootZ = state.z + 2.8 * sMul;
          tailChain.update(dt, tRootX, tRootY, tRootZ, state.yaw, time, {
            segLen: 2.35 * sMul,
            flexibility: flex,
            waveFreq: 3.6 * freq,
            waveAmp: 0.36,
            restAlign: 0.09,
            zTargetFn: (u) => Math.max(1.2 * sMul, tRootZ - u * 1.6 * sMul + Math.sin(time * 2.6 - u * 3.0) * 0.7 * sMul)
          });

          const isTailInteract = (
            state.stage === 'crouch' || state.stage === 'probe' ||
            state.stage === 'emerge' || state.stage === 'grab' ||
            state.stage === 'sniff' || state.stage === 'pinch_fling'
          );
          const tailBlend = clamp(
            tailBlendSpring.update(dt, isTailInteract ? 1.0 : 0.0, 52 * sp, clamp(7.2 * dScale, 3.0, 11.0)),
            0, 1
          );

          // 计算交互期尾手的世界目标位置（留出清晰鼻前观赏空隙，避免与吻部重叠）
          const [noseFrontX, noseFrontY] = localToWorldXY(state.x, state.y, state.yaw, 4.2 * sMul, 14.8 * sMul);
          const noseFrontZ = state.z + 6.4 * sMul;
          let goalX = mouthX, goalY = mouthY, goalZ = mouthZ;

          if (state.stage === 'crouch') {
            // 尾手绕到右侧待命
            const [rdyX, rdyY] = localToWorldXY(state.x, state.y, state.yaw, 10.2 * sMul, 4.4 * sMul);
            goalX = rdyX; goalY = rdyY; goalZ = state.z + 2.2 * sMul;
          } else if (state.stage === 'probe') {
            // 尾手缓缓伸进鹅卵石缝左右摸索
            const sway = Math.sin(time * 5.2) * 1.9 * sMul;
            const depth = lerp(4.8, 0.6, smoothstep(0.0, 0.32, stageU)) * sMul;
            const [px, py] = localToWorldXY(mouthX, mouthY, state.rockYaw, sway, depth);
            goalX = px; goalY = py; goalZ = (1.5 + Math.sin(time * 6.5) * 0.45) * sMul;
          } else if (state.stage === 'emerge') {
            // 小螃蟹探头时尾手略微后撤蓄势准备一抓
            const [px, py] = localToWorldXY(mouthX, mouthY, state.rockYaw, 2.8 * sMul, 6.6 * sMul);
            goalX = px; goalY = py; goalZ = 3.2 * sMul;
          } else if (state.stage === 'grab') {
            // 迅速前探抓起小螃蟹并弧线提离水面晃到鼻前
            const [cx0, cy0, cz0] = getCrabOutPos(sMul, 0);
            const liftU = smoothstep(0.22, 0.95, stageU);
            goalX = lerp(cx0, noseFrontX, liftU);
            goalY = lerp(cy0, noseFrontY, liftU);
            goalZ = lerp(cz0 + 1.5 * sMul, noseFrontZ, liftU) + Math.sin(liftU * Math.PI) * 3.4 * sMul;
          } else if (state.stage === 'sniff') {
            // 在鼻前轻轻晃动展示小螃蟹
            goalX = noseFrontX + Math.sin(time * 4.8) * 1.0 * sMul;
            goalY = noseFrontY + Math.cos(time * 4.2) * 0.8 * sMul;
            goalZ = noseFrontZ + Math.sin(time * 5.5) * 0.65 * sMul;
          } else if (state.stage === 'pinch_fling') {
            // 被钳夹住后高举剧烈抖甩
            const shake = handShake.update(dt, 0, 210 * sp, 5.2);
            const [fx, fy] = localToWorldXY(state.x, state.y, state.yaw, (9.8 + Math.sin(time * 28) * 2.8) * sMul, 6.6 * sMul);
            goalX = fx + shake * 0.08;
            goalY = fy;
            goalZ = state.z + (9.8 + Math.cos(time * 24) * 1.4) * sMul;
          } else {
            const cTip = tailChain.nodes[7];
            goalX = cTip.x; goalY = cTip.y; goalZ = cTip.z;
          }

          handTarget.update(dt, goalX, goalY, goalZ, 88 * sp, clamp(7.8 * dScale, 3.2, 11.5));

          // 构造绕过水兽右侧身旁的二次贝塞尔样条（根部 -> 右侧外弧控制点 -> 尾手目标点）
          const [ctrlX, ctrlY] = localToWorldXY(state.x, state.y, state.yaw, 14.2 * sMul, -3.2 * sMul);
          const ctrlZ = state.z + (state.stage === 'pinch_fling' ? 6.8 : 3.2) * sMul;

          for (let i = 0; i < 8; i++) {
            const u = i / 7;
            const inv = 1 - u;
            const bx = inv * inv * tRootX + 2 * inv * u * ctrlX + u * u * handTarget.x;
            const by = inv * inv * tRootY + 2 * inv * u * ctrlY + u * u * handTarget.y;
            const bz = inv * inv * tRootZ + 2 * inv * u * ctrlZ + u * u * handTarget.z;

            const cn = tailChain.nodes[i];
            const pt = state.tailPts[i];
            pt.x = lerp(cn.x, bx, tailBlend);
            pt.y = lerp(cn.y, by, tailBlend);
            pt.z = lerp(cn.z, bz, tailBlend);
          }

          // 从相邻节点重算每一节的切线朝向（让胶囊顺滑衔接无折角）
          for (let i = 0; i < 8; i++) {
            const a = state.tailPts[Math.max(0, i - 1)];
            const b = state.tailPts[Math.min(7, i + 1)];
            const dx = b.x - a.x, dy = b.y - a.y;
            state.tailPts[i].yaw = (Math.hypot(dx, dy) > 0.01) ? Math.atan2(-dx, dy) : state.yaw;
          }

          const endPt = state.tailPts[7];
          state.handX = endPt.x;
          state.handY = endPt.y;
          state.handZ = endPt.z;
          state.handYaw = endPt.yaw;
          if (state.stage === 'sniff' || state.stage === 'grab') {
            // 提到鼻前时让掌心微朝水兽头部，观赏性拉满
            const toHeadYaw = Math.atan2(-(state.x - state.handX), state.y - state.handY);
            state.handYaw = wrapAngle(state.handYaw + wrapAngle(toHeadYaw - state.handYaw) * 0.55);
          }

          // -----------------------------------------------------------------
          // 6. 赤壳小螃蟹轨迹：横行探出 -> 被尾手提离晃动 -> 抛物线落水溅沫溜回石缝
          // -----------------------------------------------------------------
          if (state.stage === 'emerge') {
            const u = smoothstep(0, 1, stageU);
            const sideWalk = Math.sin(stageU * Math.PI * 3.0) * 1.6;
            const [ox, oy, oz] = getCrabOutPos(sMul, sideWalk);
            state.crabX = lerp(mouthX, ox, u);
            state.crabY = lerp(mouthY, oy, u);
            state.crabZ = lerp(mouthZ * 0.5, oz, u) + Math.abs(Math.sin(time * 14)) * 0.35 * sMul;
            state.crabYaw = state.rockYaw;
          } else if (state.stage === 'grab' || state.stage === 'sniff') {
            // 稳稳挂在五指尾手掌心前方 2.4 格处，零穿模且清晰可见
            const [cx, cy] = localToWorldXY(state.handX, state.handY, state.handYaw, 0, 2.5 * sMul);
            state.crabX = cx;
            state.crabY = cy;
            state.crabZ = state.handZ + 0.3 * sMul;
            state.crabYaw = wrapAngle(state.handYaw + Math.PI + Math.sin(time * 10) * 0.25);
          } else if (state.stage === 'pinch_fling') {
            if (stageU < 0.24) {
              const [cx, cy] = localToWorldXY(state.handX, state.handY, state.handYaw, 0, 2.5 * sMul);
              state.crabX = cx; state.crabY = cy; state.crabZ = state.handZ + 0.2 * sMul;
              state.flingStartX = cx; state.flingStartY = cy; state.flingStartZ = state.crabZ;
            } else if (stageU < 0.62) {
              // 抛物线扑通落水
              const fu = (stageU - 0.24) / 0.38;
              state.crabX = lerp(state.flingStartX, state.flingEndX, fu);
              state.crabY = lerp(state.flingStartY, state.flingEndY, fu);
              state.crabZ = lerp(state.flingStartZ, 0.5 * sMul, fu) + Math.sin(fu * Math.PI) * 5.2 * sMul;
              state.crabYaw = wrapAngle(state.crabYaw + dt * 9.0);
            } else {
              // 落水瞬间溅出白沫双圈涟漪，随后横行飞快溜回鹅卵石缝
              if (!state.crabSplashDone && vfx) {
                state.crabSplashDone = true;
                vfx.addRipple(state.flingEndX, state.flingEndY, 2.5, 18.0 * sMul, 0.72, 2.0);
                vfx.addRipple(state.flingEndX, state.flingEndY, 1.2, 11.0 * sMul, 0.55, 1.4);
                vfx.spawnSplash(state.flingEndX, state.flingEndY, 9, 1.1 * sMul, habitat.fx);
              }
              const ru = smoothstep(0, 1, (stageU - 0.62) / 0.38);
              const scuttle = Math.sin(ru * Math.PI * 5.0) * 1.1 * sMul;
              const [sx, sy] = localToWorldXY(lerp(state.flingEndX, mouthX, ru), lerp(state.flingEndY, mouthY, ru), state.rockYaw, scuttle, 0);
              state.crabX = sx;
              state.crabY = sy;
              state.crabZ = 0.5 * sMul;
              state.crabYaw = wrapAngle(state.rockYaw + Math.PI * 0.5);
            }
          }

          sockets.setWorld('tailHand', state.handX, state.handY, state.handZ, state.handYaw);
          sockets.setLocal('nose', state.x, state.y, state.z, state.yaw, 0, 10.5, 8.2, sMul);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = habitat.isWater;
          const wl = habitat.waterLevel;
          const yw = state.yaw;
          const breathBob = Math.sin(performance.now() * 0.0032) * 0.28 * sMul;
          const bodyLift = Math.max(2.0 * sMul, state.z + clamp(bodyBounce.x * 0.12, -1.4, 1.4) + breathBob);

          // 1. 岸边鹅卵石缝（底部浸入浅水自动染水色）
          list.push({
            partKey: 'pebbleCluster',
            asset: parts.pebbleCluster,
            x: state.rockX,
            y: state.rockY,
            lift: 0,
            ro: state.rockYaw,
            bias: -0.20,
            submerge: EnvFeedback.calcSubmerge(0.8, wl, 4.2, isWater)
          });

          // 2. 4 条带弯膝折角的涉水短腿 + 浅蹼脚掌（起点深嵌躯干内部，高重叠无缝衔接）
          for (const leg of gait.legs) {
            const hx = leg.hipWX + (state.tiltX || 0);
            const hy = leg.hipWY + (state.tiltY || 0);
            const samples = [
              { k: 'legUpper', x: lerp(hx, leg.kneeX, 0.25), y: lerp(hy, leg.kneeY, 0.25), z: lerp(leg.hipWZ, leg.kneeZ, 0.25), b: -0.48, sym: 90 },
              { k: 'legUpper', x: leg.kneeX, y: leg.kneeY, z: leg.kneeZ, b: -0.42, sym: 90 },
              { k: 'legLower', x: lerp(leg.kneeX, leg.footX, 0.50), y: lerp(leg.kneeY, leg.footY, 0.50), z: lerp(leg.kneeZ, leg.footZ + 1.3 * sMul, 0.50), b: -0.35, sym: 90 },
              { k: 'pawWeb',   x: leg.footX, y: leg.footY, z: leg.footZ, b: -0.25, sym: 0 }
            ];
            for (const pt of samples) {
              const item = {
                partKey: pt.k,
                asset: parts[pt.k],
                x: pt.x,
                y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === 'pawWeb' ? 0 : 1.6 * sMul)),
                ro: yw,
                bias: pt.b,
                submerge: EnvFeedback.calcSubmerge(pt.z + 0.6, wl, 4.0, isWater)
              };
              if (pt.sym) item.symDeg = pt.sym;
              list.push(item);
            }
          }

          // 3. 紧凑犬形主躯干（叠加局部涉水重心微偏）
          const tKey = state.torsoPose === 'crouch' ? 'torsoCrouch' : 'torsoNorm';
          list.push({
            partKey: tKey,
            asset: parts[tKey],
            x: state.x + (state.tiltX || 0),
            y: state.y + (state.tiltY || 0),
            lift: bodyLift,
            ro: yw,
            bias: 0.30,
            submerge: EnvFeedback.calcSubmerge(bodyLift + 1.2, wl, 4.5, isWater)
          });

          // 4. 独立可扭转头颈（pivotToWorldXY 锁死后颈枢轴）
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.64, 0.64));
          const [hjx, hjy] = localToWorldXY(state.x, state.y, yw, 0, 6.2 * sMul);
          const [hx, hy] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const hKey = state.headPose === 'sniff' ? 'headSniff' : 'headNorm';
          list.push({
            partKey: hKey,
            asset: parts[hKey],
            x: hx,
            y: hy,
            lift: bodyLift + (state.torsoPose === 'crouch' ? 4.4 : 5.4) * sMul,
            ro: hYaw,
            bias: 0.65
          });

          // 5. 7 节细长柔韧长尾（高重叠连贯轮廓）
          for (let i = 1; i <= 7; i++) {
            const pt = state.tailPts[i];
            const k = TAIL_SEG_KEYS[i - 1];
            list.push({
              partKey: k,
              asset: parts[k],
              x: pt.x,
              y: pt.y,
              lift: Math.max(0.4, pt.z - 1.5 * sMul),
              ro: pt.yaw,
              bias: -0.10 + i * 0.04,
              submerge: EnvFeedback.calcSubmerge(pt.z, wl, 3.8, isWater)
            });
          }

          // 6. 尾端五指灵巧小手（pivotToWorldXY 锁死腕部枢轴，支持张开摸索 / 合拢抓握双态）
          const [hwx, hwy] = pivotToWorldXY(state.handX, state.handY, state.handYaw, HAND_PIVOT.x * sMul, HAND_PIVOT.y * sMul);
          const handKey = state.handPose === 'grab' ? 'tailHandGrab' : 'tailHandOpen';
          list.push({
            partKey: handKey,
            asset: parts[handKey],
            x: hwx,
            y: hwy,
            lift: Math.max(0.6, state.handZ - 3.6 * sMul),
            ro: state.handYaw,
            bias: 0.55,
            submerge: EnvFeedback.calcSubmerge(state.handZ, wl, 3.8, isWater)
          });

          // 7. 立体赤壳小螃蟹（出现于探出 -> 被抓提 -> 嗅探 -> 夹甩落水溜回阶段）
          if (state.crabVisible) {
            const cKey = state.crabPose === 'pinch' ? 'crabPinch' : 'crabOpen';
            list.push({
              partKey: cKey,
              asset: parts[cKey],
              x: state.crabX,
              y: state.crabY,
              lift: Math.max(0.2, state.crabZ),
              ro: state.crabYaw,
              bias: 0.72,
              submerge: EnvFeedback.calcSubmerge(state.crabZ + 0.6, wl, 3.6, isWater)
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Water1Def.id,
            code: Water1Def.code,
            name: Water1Def.name,
            status: Water1Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            torsoPose: state.torsoPose,
            headPose: state.headPose,
            handPose: state.handPose,
            interactStage: state.stage,
            tailSegments: TAIL_SEG_KEYS.length,
            footRadius: Water1Def.footRadius,
            headZ: 17,
            centerZ: 8,
            blocks: Water1Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Water1Def);
})(window.PixelWorkshop);
