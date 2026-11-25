'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, fbm1 } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, MultiLegGaitSolver, SpringDamper1D, SpringDamper3D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 地3 · 五尾红豹（《山海经》狰 · v3 精制纯生态版，+Y 正前，z=0 贴地）
  //   1. 修长矫健赤红巨豹体态：拆出独立胸肩（2 档无损烘焙：normal 舒展 / crouch 伏身）、
  //      独立腰胯（转弯自然屈脊）、独立颈部与独立豹首（3 档无损烘焙：alert 警觉 / butt 俯首敲石 /
  //      earsBack 惊蝶后压耳），额头正中微弯短独角（骨白带暗环纹），毛皮雕出深赤斑纹与浅暖腹毛；
  //   2. 核心特征：臀部呈扇形错开排布 5 条修长拖拽长尾（每条 8 节独立相位 ChainSolver，
  //      高重叠连贯轮廓、尾尖深色毛簇），急转弯甩出飘逸扇弧，惊蝶瞬间猛然炸开成宽大扇面左右轻扫；
  //   3. 待机交互物：林间立体体素青苔界石 + 石顶 2 只立体体素彩翅林蝶（2 档无损振翅）；
  //      完整自循环：轻盈踱步至界石前 -> 伏身用独角“当、当”轻敲两下（震纹 + 碎苔微粒）
  //      -> 惊起双蝶振翅盘旋 -> 豹耳后压 + 五尾猛然炸开成扇面 + 仰头追视 + 前爪试探虚扑
  //      -> 双蝶绕半圈落回石面 -> 五尾缓缓垂落恢复巡游/待机。
  //   4. 严守 v3 清晰度铁律：单怪 39 色（≤48 零重色）、零常态小数缩放、eyeGlint 不进 glowKeys、
  //      偏心旋转部件用 pivotToWorldXY 锁死枢轴、零整屏离屏画布。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 赤红豹毛主体
      furDark:      '#6e1918',
      furMid:       '#b82e24',
      furHi:        '#eb593e',
      // 深赤斑纹、耳缘与尾尖毛簇
      spotDark:     '#2b0d12',
      spotMid:      '#4f181c',
      spotHi:       '#782928',
      // 浅暖腹毛与吻颊绒毛
      bellyDark:    '#b38c6b',
      bellyMid:     '#e6c59e',
      bellyHi:      '#faebd4',
      // 额头短独角（骨白）
      hornDark:     '#8f8474',
      hornMid:      '#cfc5b2',
      hornHi:       '#f5efe2',
      // 独角暗环纹
      ringDark:     '#362c28',
      ringMid:      '#5c4d45',
      ringHi:       '#826e62',
      // 鼻头与足垫
      pawDark:      '#1c171c',
      pawMid:       '#382f38',
      pawHi:        '#5c4f5c',
      // 锐利琥珀豹眼（eyeGlint 绝不进 glowKeys）
      eyeDark:      '#100c12',
      eyeIris:      '#f5b82e',
      eyeGlint:     '#f7fcff',
      // 林间青苔界石岩体
      stoneDark:    '#474c52',
      stoneMid:     '#737a80',
      stoneHi:      '#a6aeb5',
      // 界石青苔覆层
      mossDark:     '#24522a',
      mossMid:      '#428741',
      mossHi:       '#78bd62',
      // 石脚落果点缀
      berryDark:    '#7a2638',
      berryMid:     '#bf3f54',
      berryHi:      '#ed7482',
      // 彩翅林蝶 A（碧蓝蝶翅）
      bflyADark:    '#1d5b8c',
      bflyAMid:     '#3898d4',
      bflyAHi:      '#8ce0ff',
      // 彩翅林蝶 B（橘金蝶翅）
      bflyBDark:    '#a3441c',
      bflyBMid:     '#eb7d2d',
      bflyBHi:      '#ffd25c',
      // 林蝶细身
      bflyBodyDark: '#1a1521',
      bflyBodyMid:  '#362d42',
      bflyBodyHi:   '#594c69'
    },
    glowKeys: [],
    parts: [
      'chest', 'pelvis', 'neck', 'head', 'spot', 'belly', 'horn', 'hornRing',
      'ear', 'paw', 'eye', 'leg', 'tail', 'tailTip',
      'stone', 'moss', 'berry', 'bflyA', 'bflyB', 'bflyBody'
    ],
    noCrease: [
      ['chest', 'spot'], ['chest', 'belly'], ['pelvis', 'spot'], ['pelvis', 'belly'],
      ['head', 'spot'], ['head', 'belly'], ['head', 'ear'], ['head', 'eye'], ['head', 'paw'],
      ['horn', 'hornRing'], ['tail', 'tailTip'], ['leg', 'spot'], ['leg', 'paw'],
      ['stone', 'moss'], ['stone', 'berry'], ['bflyA', 'bflyBody'], ['bflyB', 'bflyBody']
    ],
    materials: {
      fur:      ['furDark',      'furMid',      'furHi'],
      spot:     ['spotDark',     'spotMid',     'spotHi'],
      belly:    ['bellyDark',    'bellyMid',    'bellyHi'],
      horn:     ['hornDark',     'hornMid',     'hornHi'],
      ring:     ['ringDark',     'ringMid',     'ringHi'],
      paw:      ['pawDark',      'pawMid',      'pawHi'],
      stone:    ['stoneDark',    'stoneMid',    'stoneHi'],
      moss:     ['mossDark',     'mossMid',     'mossHi'],
      berry:    ['berryDark',    'berryMid',    'berryHi'],
      bflyA:    ['bflyADark',    'bflyAMid',    'bflyAHi'],
      bflyB:    ['bflyBDark',    'bflyBMid',    'bflyBHi'],
      bflyBody: ['bflyBodyDark', 'bflyBodyMid', 'bflyBodyHi']
    },
    protectedParts: ['eye', 'horn', 'hornRing', 'bflyA', 'bflyB', 'bflyBody']
  });

  // 4 套零重建模换色皮肤（含各自描边色与敲石/碎苔微粒配色）
  const SKINS = [
    {
      id: 'crimson_leopard',
      name: '赤朱斑豹（山林经典）',
      dot: '#c93428',
      outline: '#1a0b0c',
      pal: {},
      fx: {
        moss:  '#62b851',
        stone: '#9aa4ad',
        spark: '#f5e8c8',
        dust:  '#a89274'
      }
    },
    {
      id: 'obsidian_gold',
      name: '玄墨金纹（墨岩款）',
      dot: '#36333d',
      outline: '#0c0b12',
      pal: {
        furDark:   '#1e1d26', furMid:   '#353442', furHi:   '#59586e',
        spotDark:  '#7d4f12', spotMid:  '#c78624', spotHi:  '#f5c14e',
        bellyDark: '#696573', bellyMid: '#9d98ab', bellyHi: '#d4cfe0',
        hornDark:  '#947c4e', hornMid:  '#d4b679', hornHi:  '#fae6b4',
        ringDark:  '#241d17', ringMid:  '#42362b', ringHi:  '#665544',
        eyeIris:   '#ffb833',
        bflyADark: '#1c6b63', bflyAMid: '#34b8a6', bflyAHi: '#96f7e6',
        bflyBDark: '#9c2d4b', bflyBMid: '#e35478', bflyBHi: '#ffa8bc'
      },
      fx: {
        moss:  '#55ab62',
        stone: '#8f96a3',
        spark: '#ffd870',
        dust:  '#8f877d'
      }
    },
    {
      id: 'frost_horn',
      name: '霜白赤角（寒林款）',
      dot: '#c8d9e8',
      outline: '#101824',
      pal: {
        furDark:   '#798ea3', furMid:   '#b5c9db', furHi:   '#edf5fc',
        spotDark:  '#31465c', spotMid:  '#52708f', spotHi:  '#7f9eb8',
        bellyDark: '#9cb2c4', bellyMid: '#d2e2f0', bellyHi: '#f7fbff',
        hornDark:  '#7d1b24', hornMid:  '#cc353e', hornHi:  '#ff7a78',
        ringDark:  '#450d16', ringMid:  '#6e1a24', ringHi:  '#9e2c36',
        eyeIris:   '#4fd4ff',
        mossDark:  '#24595c', mossMid:  '#3d9491', mossHi:  '#7ed6cf',
        bflyADark: '#4d3b8f', bflyAMid: '#836be0', bflyAHi: '#ccbfff',
        bflyBDark: '#9e334c', bflyBMid: '#e85d75', bflyBHi: '#ffb3bf'
      },
      fx: {
        moss:  '#68c2bd',
        stone: '#b4c5d6',
        spark: '#ff9691',
        dust:  '#c0d1e0'
      }
    },
    {
      id: 'amber_steppe',
      name: '琥珀沙纹（秋原款）',
      dot: '#d98a2b',
      outline: '#1c120a',
      pal: {
        furDark:   '#8a4c16', furMid:   '#d4842a', furHi:   '#f7b952',
        spotDark:  '#421c10', spotMid:  '#73341c', spotHi:  '#a6532e',
        bellyDark: '#bfa178', bellyMid: '#ebd4ad', bellyHi: '#fcf0d4',
        hornDark:  '#8a7d68', hornMid:  '#c9bca0', hornHi:  '#f2e8d0',
        ringDark:  '#423020', ringMid:  '#6b4e34', ringHi:  '#946f4d',
        eyeIris:   '#8ce038',
        mossDark:  '#5c5e20', mossMid:  '#949134', mossHi:  '#c9c25b',
        bflyADark: '#1e5c7a', bflyAMid: '#3a9cc4', bflyAHi: '#94e2ff',
        bflyBDark: '#8c2424', bflyBMid: '#d4463b', bflyBHi: '#ff9985'
      },
      fx: {
        moss:  '#b8b24d',
        stone: '#ab9f8c',
        spark: '#ffe8a8',
        dust:  '#c9b18b'
      }
    }
  ];

  // =========================================================================
  // 1. 独立胸肩躯干（2 档无损烘焙：normal 舒展 / crouch 伏身敲石与虚扑）
  //    尺寸 16×18×14，枢轴在胸腹中段，雕出肩胛轮廓、深赤豹斑与浅暖胸腹毛
  // =========================================================================
  function buildChest(makeCanvas, stage) {
    const isCrouch = stage === 'crouch';
    const W = 16, D = 18, H = isCrouch ? 13 : 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    const zMid = isCrouch ? 5.6 : 6.4;
    const shoulderZ = isCrouch ? 7.6 : 8.8;

    m.fillAABB(-7.0, 7.0, -8.0, 8.0, 1, H - 1, (x, y, z, X, Y) => {
      // 修长矫健的猫科前胸 + 饱满肩胛 + 收窄后腰衔接段
      const dChest = (Math.hypot(X / 4.9, (Y - 1.2) / 6.2, (z - zMid) / 4.4) - 1.0) * 4.6;
      const dShoulders = (Math.hypot(X / (isCrouch ? 5.3 : 4.8), (Y - 2.6) / 4.6, (z - shoulderZ) / 3.4) - 1.0) * 3.8;
      const dWaistLink = (Math.hypot(X / 4.1, (Y + 4.4) / 4.4, (z - (zMid + 0.4)) / 3.7) - 1.0) * 3.6;
      const d = smin(smin(dChest, dShoulders, 1.8), dWaistLink, 1.8);
      if (d > 0) return;

      const isBelly = z < zMid - 1.6 && Math.abs(X) < 3.4 && Y > -4.5;
      // 豹纹斑块：肩侧与背脊错落分布的深赤斑点
      const spotA = Math.hypot((Math.abs(X) - 3.6) / 1.5, (Y - 2.2) / 1.7, (z - (zMid + 1.5)) / 1.6) < 1.0;
      const spotB = Math.hypot((Math.abs(X) - 3.2) / 1.4, (Y + 2.4) / 1.6, (z - (zMid + 1.1)) / 1.5) < 1.0;
      const spotSpine = Math.abs(X) < 1.1 && z > zMid + 3.0 && Math.abs(((Y + 10) % 3.8) - 1.9) < 0.85;

      if (isBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (spotA || spotB || spotSpine) {
        m.setRaw(x, y, z, mat('spot'), partId.spot);
      } else {
        m.setRaw(x, y, z, mat('fur'), partId.chest);
      }
    });

    // 胸前蓬松绒毛领口（强化猛兽颈胸层次）
    m.paintEllipsoid(0, 5.4, zMid - 0.8, 2.9, 2.2, 2.4, mat('belly'), partId.belly, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.2, headZ: 14, centerZ: 7 });
  }

  // =========================================================================
  // 2. 独立腰胯躯干（15×18×13，枢轴锁在前腰 (0, 4.4)，转弯时脊柱自然弯折）
  //    后臀错开留出 5 条长尾根芽，绝不粘连
  // =========================================================================
  const PELVIS_PIVOT = { x: 0, y: 4.4 };
  function buildPelvis(makeCanvas) {
    const W = 15, D = 18, H = 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.5, 6.5, -8.2, 7.5, 1, H - 1, (x, y, z, X, Y) => {
      // 柔韧收腰 + 强健后胯
      const dWaist = (Math.hypot(X / 3.9, (Y - 2.6) / 4.8, (z - 6.2) / 3.6) - 1.0) * 3.8;
      const dHip   = (Math.hypot(X / 4.8, (Y + 2.6) / 5.4, (z - 6.5) / 4.1) - 1.0) * 4.2;
      const d = smin(dWaist, dHip, 1.8);
      if (d > 0) return;

      const isBelly = z < 4.5 && Math.abs(X) < 3.0 && Y > -4.8;
      const spotHip = Math.hypot((Math.abs(X) - 3.6) / 1.5, (Y + 2.4) / 1.8, (z - 7.4) / 1.6) < 1.0;
      const spotWaist = Math.hypot((Math.abs(X) - 2.9) / 1.3, (Y - 2.0) / 1.5, (z - 7.0) / 1.5) < 1.0;
      const spotSpine = Math.abs(X) < 1.05 && z > 8.8 && Math.abs(((Y + 10) % 3.6) - 1.8) < 0.8;

      if (isBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (spotHip || spotWaist || spotSpine) {
        m.setRaw(x, y, z, mat('spot'), partId.spot);
      } else {
        m.setRaw(x, y, z, mat('fur'), partId.pelvis);
      }
    });

    // 臀后扇形 5 枚尾根连接芽（与 5 条独立 ChainSolver 长尾一一对应）
    const tailRoots = [
      [-3.4, -5.8, 6.4], [-1.7, -6.7, 7.1], [0.0, -7.1, 7.5],
      [ 1.7, -6.7, 7.1], [ 3.4, -5.8, 6.4]
    ];
    for (const [rx, ry, rz] of tailRoots) {
      m.paintEllipsoid(rx, ry, rz, 1.05, 1.15, 1.05, mat('fur'), partId.pelvis, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.4, headZ: 12, centerZ: 6 });
  }

  // =========================================================================
  // 3. 独立颈部（10×12×10，枢轴锁在肩前根部 (0, -2.4)）
  // =========================================================================
  const NECK_PIVOT = { x: 0, y: -2.4 };
  function buildNeck(makeCanvas) {
    const m = new VoxelModel(10, 12, 10, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -2.4, 2.2, 0, 2.2, 6.6, 3.1, 2.55, mat('fur'), partId.neck, true);
    m.paintCapsule(0, -1.6, 1.5, 0, 2.4, 5.2, 2.3, 1.8, mat('belly'), partId.belly, true);
    // 颈背深赤鬃斑
    m.paintCapsule(0, -2.2, 4.6, 0, 1.5, 8.2, 1.25, 0.95, mat('spot'), partId.spot, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 9, centerZ: 5 });
  }

  // =========================================================================
  // 4. 独立豹首（3 档无损烘焙：alert 警觉 / butt 俯首独角敲石 / earsBack 惊蝶后压耳）
  //    尺寸 14×18×15，枢轴锁在枕骨根 (0, -3.4)
  //    含：精雕豹吻鼻垫、颊绒、双耳、2×2 琥珀锐眼（eyeGlint 不进 glowKeys）、额头微弯短独角（骨白带暗环纹）
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -3.4 };
  function buildHead(makeCanvas, pose) {
    const isButt = pose === 'butt';
    const isEarsBack = pose === 'earsBack';
    const W = 14, D = 18, H = 15;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    const skullZ = isButt ? 5.2 : 6.4;
    const snoutZ = isButt ? 3.8 : 5.4;

    // 饱满猫科颅骨 + 颊部微宽绒毛
    m.paintEllipsoid(0, -0.4, skullZ, 3.9, 4.3, 3.6, mat('fur'), partId.head, true);
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 3.1, 0.2, skullZ - 1.1, 1.65, 2.2, 1.75, mat('belly'), partId.belly, true);
    }

    // 矫健豹吻 + 浅暖下颔（earsBack 追蝶时略微张口显露俏皮兴致）
    m.paintEllipsoid(0, 3.7, snoutZ + 0.3, 2.35, 2.8, 1.85, mat('fur'), partId.head, true);
    m.paintEllipsoid(0, 4.0, snoutZ - 0.9, 2.05, 2.35, 1.15, mat('belly'), partId.belly, true);
    if (isEarsBack) {
      m.paintEllipsoid(0, 4.3, snoutZ - 1.9, 1.55, 1.85, 0.78, mat('belly'), partId.belly, true);
    }
    // 深色豹鼻头
    m.paintEllipsoid(0, 6.2, snoutZ + 0.5, 1.15, 0.82, 0.82, mat('paw'), partId.paw, true);

    // 额头眉骨深赤纹
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.6, 1.6, skullZ + 2.3, s * 2.2, -1.6, skullZ + 2.7, 0.82, 0.72, mat('spot'), partId.spot, true);
    }

    // 双耳（alert/butt 竖起警觉，earsBack 惊蝶时紧贴颅后后压！）
    for (const s of [-1, 1]) {
      if (isEarsBack) {
        m.paintCapsule(s * 2.4, -1.6, skullZ + 2.2, s * 3.8, -5.6, skullZ + 1.5, 1.35, 0.78, mat('fur'), partId.ear, true);
        m.paintCapsule(s * 2.7, -2.8, skullZ + 2.2, s * 4.0, -5.8, skullZ + 1.5, 0.92, 0.65, mat('spot'), partId.spot, true);
      } else {
        m.paintCapsule(s * 2.5, -1.6, skullZ + 2.4, s * 3.3, -2.5, skullZ + 5.2, 1.38, 0.78, mat('fur'), partId.ear, true);
        m.paintCapsule(s * 2.6, -2.2, skullZ + 2.8, s * 3.4, -2.9, skullZ + 5.3, 0.95, 0.62, mat('spot'), partId.spot, true);
      }
    }

    // 额头正中微弯短独角（骨白带两道清晰暗环纹；butt 态前倾对准界石敲击！）
    const hBaseY = isButt ? 2.6 : 1.8;
    const hBaseZ = skullZ + 2.4;
    const hMidY  = isButt ? 5.6 : 3.6;
    const hMidZ  = isButt ? skullZ + 3.4 : skullZ + 4.8;
    const hTipY  = isButt ? 7.9 : 5.4;
    const hTipZ  = isButt ? skullZ + 3.5 : skullZ + 6.9;

    // 独角下段 + 上段（微弧前弯）
    m.paintCapsule(0, hBaseY, hBaseZ, 0, hMidY, hMidZ, 1.35, 1.05, mat('horn'), partId.horn, true);
    m.paintCapsule(0, hMidY, hMidZ, 0, hTipY, hTipZ, 1.05, 0.56, mat('horn'), partId.horn, true);
    // 两道清晰暗环纹（在角基与角中段绕环）
    const r1y = lerp(hBaseY, hMidY, 0.34), r1z = lerp(hBaseZ, hMidZ, 0.34);
    const r2y = lerp(hBaseY, hMidY, 0.82), r2z = lerp(hBaseZ, hMidZ, 0.82);
    m.paintEllipsoid(0, r1y, r1z, 1.38, 0.95, 0.92, mat('ring'), partId.hornRing, true);
    m.paintEllipsoid(0, r2y, r2z, 1.18, 0.85, 0.82, mat('ring'), partId.hornRing, true);

    m.despeckle();
    m.applyArtShading(true);

    // 表面贴合 2×2 锐利琥珀豹眼（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.6);
    const eyeZ = Math.round(skullZ + (isButt ? -0.3 : 0.4));
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 5; step++) {
        const tx = Math.round(hw + s * (4.2 - step));
        const p = m.getPartId(tx, eyeY, eyeZ);
        if (p === partId.head || p === partId.belly || p === partId.spot) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 2.8);
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dy === 1)
            ? keyToId.eyeGlint
            : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 14, centerZ: 7 });
  }

  // =========================================================================
  // 5. 敏捷四足肢体与猫科足爪（高重叠关节，弯膝 IK 无断节）
  // =========================================================================
  // 5. 高重叠连贯猫科弯膝腿段 + 柔韧猫爪（严格锚死在胸肩 / 腰胯 IK 关节线上，永不分离）
  // =========================================================================
  function buildLimbSeg(makeCanvas, rTop, rBot, hLen, withSpot) {
    const S = Math.max(6, Math.ceil(Math.max(rTop, rBot) * 2 + 3));
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.1, 0, 0, H - 1.1, rBot, rTop, mat('fur'), partId.leg, true);
    if (withSpot) {
      m.paintEllipsoid(rTop * 0.55, 0.2, H * 0.55, 0.95, 0.95, 1.15, mat('spot'), partId.spot, true);
      m.paintEllipsoid(-rTop * 0.55, -0.2, H * 0.48, 0.95, 0.95, 1.15, mat('spot'), partId.spot, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildPaw(makeCanvas) {
    const m = new VoxelModel(7, 9, 5, SPEC);
    const { mat, partId } = SPEC;
    // 柔韧猫科足垫 + 前伸趾尖
    m.paintEllipsoid(0, 0.5, 1.8, 1.85, 2.35, 1.45, mat('fur'), partId.leg, true);
    m.paintEllipsoid(0, 2.1, 1.35, 1.65, 1.35, 1.05, mat('belly'), partId.belly, true);
    m.paintEllipsoid(0, 0.6, 0.85, 1.55, 1.85, 0.72, mat('paw'), partId.paw, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2 });
  }

  // =========================================================================
  // 6. 五尾拖拽长尾体素节（高重叠连贯轮廓 + 尾尖深色毛簇）
  // =========================================================================
  function buildTailSeg(makeCanvas, rad, withBand) {
    const S = Math.max(5, Math.ceil(rad * 2 + 3));
    const H = S;
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, H * 0.5 - 0.5, rad, rad, rad * 0.95, mat('fur'), partId.tail, true);
    if (withBand) {
      m.paintEllipsoid(0, 0, H * 0.5 + 0.1, rad * 0.98, rad * 0.98, rad * 0.45, mat('spot'), partId.spot, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: rad });
  }

  function buildTailTuft(makeCanvas) {
    const m = new VoxelModel(7, 8, 7, SPEC);
    const { mat, partId } = SPEC;
    // 尾梢深色蓬松毛簇（前接细尾、后舒尖簇）
    m.paintCapsule(0, 1.8, 3.0, 0, -2.4, 3.6, 1.35, 1.65, mat('spot'), partId.tailTip, true);
    m.paintEllipsoid(0, -1.6, 3.8, 1.55, 1.95, 1.45, mat('spot'), partId.tailTip, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0 });
  }

  // =========================================================================
  // 7. 待机交互物 A：林间立体体素青苔界石（14×14×14）
  //    风化灰岩界碑 + 顶部垂落厚实青苔 + 侧壁浅刻界槽 + 石脚红浆果点缀
  // =========================================================================
  function buildMossStone(makeCanvas) {
    const W = 14, D = 14, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.0, 6.0, -6.0, 6.0, 0, H - 2, (x, y, z, X, Y) => {
      // 下宽上略收的不规则立柱界石，顶面平缓可供林蝶停歇
      const taper = 1.0 - (z / H) * 0.28;
      const rx = 4.6 * taper;
      const ry = 4.1 * taper;
      const nx = X / rx, ny = Y / ry;
      // 带自然切面棱角的超椭圆石柱
      const radial = Math.pow(Math.abs(nx), 2.6) + Math.pow(Math.abs(ny), 2.6);
      const topRound = z > 10.5 ? (z - 10.5) * 0.42 : 0;
      if (radial + topRound > 1.0) return;

      // 界石中腰一道浅刻古界环槽
      if (z === 6 && Math.hypot(X, Y) > 3.2 && Math.abs(X) < 2.2) return;

      // 顶面与西北侧自然垂挂青苔层
      const mossDrop = 8.4 + Math.sin(X * 0.9 + Y * 0.7) * 1.2 + (X < 0 ? -1.4 : 0.6);
      const isMoss = z >= 10 || (z >= mossDrop && radial > 0.45);
      m.setRaw(x, y, z, isMoss ? mat('moss') : mat('stone'), isMoss ? partId.moss : partId.stone);
    });

    // 石脚小岩块 + 两颗林地落果点缀
    m.paintEllipsoid(-4.2, 2.8, 1.5, 1.6, 1.5, 1.4, mat('stone'), partId.stone, true);
    m.paintEllipsoid(3.8, -2.5, 1.2, 1.3, 1.3, 1.1, mat('moss'), partId.moss, true);
    m.paintEllipsoid(3.6, 2.9, 1.1, 1.0, 1.0, 0.95, mat('berry'), partId.berry, true);
    m.paintEllipsoid(2.3, 3.8, 0.9, 0.85, 0.85, 0.82, mat('berry'), partId.berry, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.4, headZ: 13, centerZ: 6 });
  }

  // =========================================================================
  // 8. 待机交互物 B：立体体素彩翅林蝶（2 种配色 × 2 档无损振翅：up 合翅上扬 / down 展翅平扇）
  //    尺寸 10×10×8，两片清晰三角小翅 + 细长深色蝶身
  // =========================================================================
  function buildButterfly(makeCanvas, variant, wingPose) {
    const isUp = wingPose === 'up';
    const W = 10, D = 10, H = isUp ? 8 : 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const wingMat = variant === 0 ? 'bflyA' : 'bflyB';
    const wingPart = variant === 0 ? partId.bflyA : partId.bflyB;

    // 纤细蝶身
    m.paintCapsule(0, -1.8, 2.6, 0, 2.0, 3.0, 0.62, 0.58, mat('bflyBody'), partId.bflyBody, true);

    // 左右两片清晰立体三角小翅（前大翅 + 后小翅，up 态 V 字上扬，down 态平展微垂）
    for (const s of [-1, 1]) {
      if (isUp) {
        // 前三角翅上扬
        m.paintFinTri(
          [s * 0.4,  1.2, 2.9],
          [s * 3.4,  2.6, 6.5],
          [s * 2.8, -1.2, 5.6],
          0.55, mat(wingMat), wingPart, true
        );
        // 后小三角翅
        m.paintFinTri(
          [s * 0.4, -0.4, 2.7],
          [s * 2.6, -0.8, 5.1],
          [s * 1.9, -3.0, 4.0],
          0.50, mat(wingMat), wingPart, true
        );
      } else {
        // 前三角翅平展微压
        m.paintFinTri(
          [s * 0.4,  1.2, 3.0],
          [s * 4.3,  2.7, 2.6],
          [s * 3.7, -1.0, 2.4],
          0.55, mat(wingMat), wingPart, true
        );
        // 后小三角翅
        m.paintFinTri(
          [s * 0.4, -0.4, 2.8],
          [s * 3.4, -0.8, 2.3],
          [s * 2.2, -3.1, 2.0],
          0.50, mat(wingMat), wingPart, true
        );
      }
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2, headZ: 7, centerZ: 3 });
  }

  // 5 条修长拖拽长尾配置（臀部扇形错开根部，每条 8 节，独立波相位）
  const TAIL_CONFIGS = [
    { id: 't0', lx: -3.5, ly: -5.6, lz: 6.4, restFan: -0.44, flareFan: -1.16, liftBase: 1.6, phase: 0.00 },
    { id: 't1', lx: -1.8, ly: -6.5, lz: 7.1, restFan: -0.21, flareFan: -0.58, liftBase: 2.3, phase: 1.15 },
    { id: 't2', lx:  0.0, ly: -6.9, lz: 7.5, restFan:  0.00, flareFan:  0.00, liftBase: 2.9, phase: 2.30 },
    { id: 't3', lx:  1.8, ly: -6.5, lz: 7.1, restFan:  0.21, flareFan:  0.58, liftBase: 2.3, phase: 3.45 },
    { id: 't4', lx:  3.5, ly: -5.6, lz: 6.4, restFan:  0.44, flareFan:  1.16, liftBase: 1.6, phase: 4.60 }
  ];

  // =========================================================================
  // 猫科循环步态 + 矢状面 3D 2-Bone IK（根治阈值步态后腿卡滞拖行与膝盖后翻）
  //   - 驱动方式：按实际位移与转向角连续推进步态相位，低速呈猫科四拍潜行步
  //     （左后->左前->右后->右前），巡航平滑过渡至弹性对角小跑（BL+FR / BR+FL 微错相）；
  //   - 支撑期足掌世界坐标钉地（零滑冰），摆动期后足迅速抬离并向前探至腰腹下（绝不拖腿）；
  //   - 矢状面解析 IK：前肢肘部恒向后折（kneeSign=-1），后肢膝盖恒向前折（kneeSign=+1），
  //     360° 全视角呈现矫健猫科 Z 字后腿，绝无 180° 翻转奇点。
  // =========================================================================
  function solveSagittalLegIK(hx, hy, hz, fx, fy, fz, ayaw, L1, L2, kneeSign, sMul) {
    const fwdX = -Math.sin(ayaw), fwdY = Math.cos(ayaw);
    const rightX = Math.cos(ayaw), rightY = Math.sin(ayaw);
    const dx = fx - hx, dy = fy - hy;
    const dFwd = dx * fwdX + dy * fwdY;
    const dSide = dx * rightX + dy * rightY;
    const dZ = fz - hz;
    const rawD = Math.hypot(dFwd, dZ) || 0.001;
    const minD = Math.abs(L1 - L2) + 0.15 * sMul;
    const maxD = L1 + L2 - 0.12 * sMul;
    const d = clamp(rawD, minD, maxD);
    const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const uFwd = dFwd / rawD;
    const uZ = dZ / rawD;
    // 腿部主体朝下（uZ < 0），法向 (-uZ, uFwd) 恒指向身体正前方 (+fwd)
    const along = L1 * cosA;
    const perp = L1 * sinA * kneeSign;
    const kFwd = along * uFwd + perp * (-uZ);
    const kZ = hz + along * uZ + perp * uFwd;
    const kSide = dSide * 0.45;
    return {
      kx: hx + kFwd * fwdX + kSide * rightX,
      ky: hy + kFwd * fwdY + kSide * rightY,
      kz: Math.max(1.3 * sMul, kZ)
    };
  }

  class FelineCyclicGait {
    constructor(legs) {
      this.phase = 0;
      this.trotBlend = 0;
      this.idleTime = 0;
      this.prevBodyYaw = 0;
      this.hasPrevYaw = false;
      this.legs = legs.map((l, idx) => ({
        ...l,
        index: idx,
        isFront: l.id === 'FL' || l.id === 'FR',
        hipWX: l.hipX, hipWY: l.hipY, hipWZ: l.hipZ,
        footX: l.restX, footY: l.restY, footZ: 0,
        kneeX: l.restX, kneeY: l.restY, kneeZ: l.hipZ * 0.55,
        anchorYaw: 0,
        inSwing: false,
        liftX: l.restX, liftY: l.restY,
        settling: false, settleT: 0, settleStartX: l.restX, settleStartY: l.restY,
        justLanded: false
      }));
    }

    reset(bodyX, bodyY, bodyYaw, sMul = 1.0, legAnchors = null) {
      this.phase = 0;
      this.trotBlend = 0;
      this.idleTime = 0;
      this.prevBodyYaw = bodyYaw;
      this.hasPrevYaw = true;
      for (const leg of this.legs) {
        const anc = (legAnchors && legAnchors[leg.id]) || null;
        const ax = anc ? anc.x : bodyX;
        const ay = anc ? anc.y : bodyY;
        const ayaw = anc ? anc.yaw : bodyYaw;
        const [hx, hy] = localToWorldXY(ax, ay, ayaw, leg.hipX * sMul, leg.hipY * sMul);
        const [rx, ry] = localToWorldXY(ax, ay, ayaw, leg.restX * sMul, leg.restY * sMul);
        leg.hipWX = hx; leg.hipWY = hy;
        leg.footX = leg.liftX = leg.settleStartX = rx;
        leg.footY = leg.liftY = leg.settleStartY = ry;
        leg.footZ = 0;
        leg.anchorYaw = ayaw;
        leg.inSwing = false;
        leg.settling = false;
        leg.settleT = 0;
        leg.justLanded = false;
      }
    }

    update(dt, bodyX, bodyY, bodyZ, bodyYaw, velX, velY, opts = {}) {
      const sMul = opts.scaleMul ?? 1.0;
      const freq = opts.stepFreq ?? 1.0;
      const stepHeight = opts.stepHeight ?? (3.6 * sMul);
      const legAnchors = opts.legAnchors || null;
      const landed = [];

      const yawRate = this.hasPrevYaw ? Math.abs(wrapAngle(bodyYaw - this.prevBodyYaw)) / Math.max(dt, 0.001) : 0;
      this.prevBodyYaw = bodyYaw;
      this.hasPrevYaw = true;

      const moveSpd = Math.hypot(velX, velY);
      const isMoving = moveSpd > 1.35 || yawRate > 0.24;
      if (isMoving) this.idleTime = 0;
      else this.idleTime += dt;

      // 速度越高越趋向轻快弹性对角小跑，低速平滑退回四拍猫步
      const targetTrot = smoothstep(5.5, 13.5, moveSpd);
      this.trotBlend = lerp(this.trotBlend, targetTrot, expSmooth(dt, 6.5));

      // 步幅周期：每推进 11.4*sMul 格完成一次完整步态循环（单脚前后摆幅各约 2.8 格，绝不过伸）
      const strideLen = 11.4 * sMul;
      if (isMoving) {
        const dPhase = ((moveSpd / strideLen) + yawRate * 0.24) * dt * clamp(freq, 0.45, 2.0);
        this.phase = (this.phase + dPhase) % 1;
      }

      const SWING_FRAC = 0.46;
      const reachHalf = 2.85 * sMul;
      const maxBackBehindHip = 3.15 * sMul;
      const maxFootDistFromIdeal = 4.35 * sMul;

      let liftSum = 0, frontLift = 0, rearLift = 0;
      let localRoll = 0, localPitch = 0;
      let settlingAny = this.legs.some(l => l.settling);

      for (const leg of this.legs) {
        leg.justLanded = false;
        const anc = (legAnchors && legAnchors[leg.id]) || null;
        const ax = anc ? anc.x : bodyX;
        const ay = anc ? anc.y : bodyY;
        const az = (anc && anc.z !== undefined) ? anc.z : bodyZ;
        const ayaw = anc ? anc.yaw : bodyYaw;
        leg.anchorYaw = ayaw;

        const [hx, hy] = localToWorldXY(ax, ay, ayaw, leg.hipX * sMul, leg.hipY * sMul);
        const hz = az + leg.hipZ * sMul;
        leg.hipWX = hx; leg.hipWY = hy; leg.hipWZ = hz;

        const [idealX, idealY] = localToWorldXY(ax, ay, ayaw, leg.restX * sMul, leg.restY * sMul);
        const fwdX = -Math.sin(ayaw), fwdY = Math.cos(ayaw);
        const rightX = Math.cos(ayaw), rightY = Math.sin(ayaw);

        if (isMoving) {
          leg.settling = false;
          leg.settleT = 0;
          const off = lerp(leg.walkOff, leg.trotOff, this.trotBlend);
          const phi = (this.phase + off) % 1;
          const wantSwing = phi < SWING_FRAC;

          // 目标落点：沿前进方向提前探步（后足主动前探至腰腹下，而非滞后拖行）
          const speedRatio = clamp(moveSpd / 14.0, 0.25, 1.15);
          const leadDist = reachHalf * speedRatio;
          const landX = idealX + fwdX * leadDist;
          const landY = idealY + fwdY * leadDist;

          if (wantSwing) {
            if (!leg.inSwing) {
              leg.inSwing = true;
              leg.liftX = leg.footX;
              leg.liftY = leg.footY;
            }
            const u = clamp(phi / SWING_FRAC, 0, 1);
            const s = smoothstep(0, 1, u);
            leg.footX = lerp(leg.liftX, landX, s);
            leg.footY = lerp(leg.liftY, landY, s);
            // 敏捷猫科抬腿弧：离地干脆、中段轻盈收脚、落掌稳健
            const curStepH = stepHeight * (0.55 + 0.45 * speedRatio);
            leg.footZ = Math.pow(Math.sin(u * Math.PI), 0.76) * curStepH;
            liftSum += leg.footZ;
            if (leg.isFront) frontLift += leg.footZ;
            else rearLift += leg.footZ;
            const w = Math.sin(u * Math.PI);
            localRoll -= Math.sign(leg.restX) * w * 0.26;
            localPitch -= (leg.isFront ? 1 : -1) * w * 0.22;
          } else {
            if (leg.inSwing) {
              leg.inSwing = false;
              leg.footX = landX;
              leg.footY = landY;
              leg.footZ = 0;
              leg.justLanded = true;
              landed.push(leg);
            } else {
              leg.footZ = 0;
            }
            // 支撑期足掌钉地，同时加硬保护防止急转弯时后足被拉到臀后过远
            const dxH = leg.footX - hx, dyH = leg.footY - hy;
            const fwdFromHip = dxH * fwdX + dyH * fwdY;
            const sideFromHip = dxH * rightX + dyH * rightY;
            if (fwdFromHip < -maxBackBehindHip) {
              const fixFwd = -maxBackBehindHip;
              leg.footX = hx + fixFwd * fwdX + sideFromHip * rightX;
              leg.footY = hy + fixFwd * fwdY + sideFromHip * rightY;
            }
            const distIdeal = Math.hypot(leg.footX - idealX, leg.footY - idealY);
            if (distIdeal > maxFootDistFromIdeal) {
              const k = maxFootDistFromIdeal / distIdeal;
              leg.footX = idealX + (leg.footX - idealX) * k;
              leg.footY = idealY + (leg.footY - idealY) * k;
            }
          }
        } else {
          // 停步收脚：先平稳落完空中脚，再依次轻抬把偏离站位的脚收回肩胯正下方
          if (leg.inSwing) {
            leg.inSwing = false;
            leg.settling = true;
            leg.settleT = 0.25;
            leg.settleStartX = leg.footX;
            leg.settleStartY = leg.footY;
            settlingAny = true;
          }
          const distIdeal = Math.hypot(leg.footX - idealX, leg.footY - idealY);
          if (!leg.settling && !settlingAny && this.idleTime > 0.10 && distIdeal > 1.15 * sMul) {
            leg.settling = true;
            leg.settleT = 0;
            leg.settleStartX = leg.footX;
            leg.settleStartY = leg.footY;
            settlingAny = true;
          }
          if (leg.settling) {
            leg.settleT += dt / 0.16;
            if (leg.settleT >= 1) {
              leg.settling = false;
              leg.settleT = 0;
              leg.footX = idealX;
              leg.footY = idealY;
              leg.footZ = 0;
              leg.justLanded = true;
              landed.push(leg);
            } else {
              const s = smoothstep(0, 1, leg.settleT);
              leg.footX = lerp(leg.settleStartX, idealX, s);
              leg.footY = lerp(leg.settleStartY, idealY, s);
              leg.footZ = Math.sin(leg.settleT * Math.PI) * 1.8 * sMul;
              liftSum += leg.footZ;
            }
          } else {
            leg.footZ = 0;
          }
        }

        // 矢状面 3D 2-Bone IK：前肢肘向后折(-1)，后肢膝向前折(+1)
        const ik = solveSagittalLegIK(
          hx, hy, hz, leg.footX, leg.footY, leg.footZ,
          ayaw, leg.L1 * sMul, leg.L2 * sMul, leg.kneeSign, sMul
        );
        leg.kneeX = ik.kx;
        leg.kneeY = ik.ky;
        leg.kneeZ = ik.kz;
      }

      const [tiltX, tiltY] = localToWorldXY(0, 0, bodyYaw, localRoll, localPitch);
      return { landed, liftSum, frontLift, rearLift, tiltX, tiltY };
    }
  }

  const Earth3Def = {
    id: 'earth3_zheng',
    code: '地3',
    status: 'done',
    name: '地3 · 五尾红豹',
    tag: '独角五尾巨豹 · 敲石惊蝶',
    summary: 'v3 精制：《山海经》狰，修长赤红豹躯（胸肩/腰胯/豹首分节）+ 额头暗环短独角 + 5 条 8 节独立拖拽扇尾 + 林间青苔界石与惊起彩翅林蝶交互循环',
    defaultHabitat: 'forest',
    footRadius: 10.5,
    ecoWeight: 1.15,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol',         name: '自由巡游', loop: true,  status: 'done' },
      { id: 'idle',           name: '原地待机', loop: true,  status: 'done' },
      { id: 'battle_attack',  name: '赤爪三连', loop: false, duration: 0.85, status: 'done' },
      { id: 'battle_stagger', name: '破盾硬直', loop: false, duration: 0.85, status: 'done' },
      { id: 'battle_hurt',    name: '受击',     loop: false, duration: 0.35, status: 'done' }
    ],
    blocks: [
      '胸肩/腰胯/豹首分节脊柱',
      '额头暗环微弯短独角',
      '5 条 8 节扇形拖拽长尾',
      '4 足敏捷对角小跑 IK',
      '青苔界石敲击与惊蝶开扇'
    ],
    soulHabit: '轻盈踱步至青苔界石前 -> 伏身独角“当、当”轻敲两下 -> 惊起彩翅林蝶盘旋 -> 压耳炸开五尾扇面仰头追视并前爪虚扑 -> 蝶落回石五尾渐垂',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        chestNormal:  buildChest(makeCanvas, 'normal'),
        chestCrouch:  buildChest(makeCanvas, 'crouch'),
        pelvis:       buildPelvis(makeCanvas),
        neck:         buildNeck(makeCanvas),
        headAlert:    buildHead(makeCanvas, 'alert'),
        headButt:     buildHead(makeCanvas, 'butt'),
        headEarsBack: buildHead(makeCanvas, 'earsBack'),
        limbHip:      buildLimbSeg(makeCanvas, 2.25, 1.90, 4.4, true),
        limbUpper:    buildLimbSeg(makeCanvas, 1.95, 1.60, 4.8, true),
        limbKnee:     buildLimbSeg(makeCanvas, 1.65, 1.45, 4.0, false),
        limbLower:    buildLimbSeg(makeCanvas, 1.48, 1.30, 4.8, false),
        paw:          buildPaw(makeCanvas),
        tailSeg0:     buildTailSeg(makeCanvas, 1.45, false),
        tailSeg1:     buildTailSeg(makeCanvas, 1.22, true),
        tailSeg2:     buildTailSeg(makeCanvas, 1.02, false),
        tailTuft:     buildTailTuft(makeCanvas),
        mossStone:    buildMossStone(makeCanvas),
        bflyAUp:      buildButterfly(makeCanvas, 0, 'up'),
        bflyADown:    buildButterfly(makeCanvas, 0, 'down'),
        bflyBUp:      buildButterfly(makeCanvas, 1, 'up'),
        bflyBDown:    buildButterfly(makeCanvas, 1, 'down')
      };

      // 4 足猫科循环步态 + 矢状面 IK：前腿挂胸肩（肘向后折），后腿挂腰胯正下（膝向前折、绝不后拖！）
      const gait = new FelineCyclicGait([
        { id: 'FL', hipX: -3.4, hipY:  3.8, hipZ: 3.4, restX: -4.0, restY:  4.2, L1: 5.8, L2: 6.0, kneeSign: -1, walkOff: 0.25, trotOff: 0.55 },
        { id: 'FR', hipX:  3.4, hipY:  3.8, hipZ: 3.4, restX:  4.0, restY:  4.2, L1: 5.8, L2: 6.0, kneeSign: -1, walkOff: 0.75, trotOff: 0.05 },
        { id: 'BL', hipX: -3.4, hipY: -2.0, hipZ: 3.6, restX: -4.1, restY: -1.8, L1: 5.9, L2: 6.1, kneeSign:  1, walkOff: 0.00, trotOff: 0.00 },
        { id: 'BR', hipX:  3.4, hipY: -2.0, hipZ: 3.6, restX:  4.1, restY: -1.8, L1: 5.9, L2: 6.1, kneeSign:  1, walkOff: 0.50, trotOff: 0.50 }
      ]);

      // 5 条独立相位 ChainSolver 长尾（每条 8 节，高重叠防串珠）
      const tailSolvers = TAIL_CONFIGS.map((cfg) => ({
        cfg,
        solver: new ChainSolver(8, 2.35, {
          maxAngle: 0.58,
          waveFreq: 4.4,
          wavePhaseStep: 0.52,
          waveAmp: 0.34
        })
      }));

      // 2 只立体彩翅林蝶状态
      const butterflies = [
        {
          idx: 0,
          upKey: 'bflyAUp', downKey: 'bflyADown',
          perchOffX: -1.4, perchOffY: 0.6, perchOffZ: 12.6,
          x: 0, y: 0, z: 12.6, yaw: 0.6,
          wingUp: true, flapTimer: 0,
          orbitDir: 1, orbitRad: 11.5, orbitHeight: 19.5, phaseOff: 0.0
        },
        {
          idx: 1,
          upKey: 'bflyBUp', downKey: 'bflyBDown',
          perchOffX: 1.7, perchOffY: -1.1, perchOffZ: 12.2,
          x: 0, y: 0, z: 12.2, yaw: -1.2,
          wingUp: false, flapTimer: 0.35,
          orbitDir: -1, orbitRad: 14.5, orbitHeight: 22.8, phaseOff: 0.85
        }
      ];

      // 弹簧驱动器（零抖动平滑过渡）
      const crouchSpring   = new SpringDamper1D(0, 96, 8.2);
      const tailFlareSpring = new SpringDamper1D(0, 118, 7.6);
      const headYawSpring  = new SpringDamper1D(0, 92, 7.4);
      const headNodSpring  = new SpringDamper1D(0, 130, 8.6);
      const spineBendSpring = new SpringDamper1D(0, 74, 7.2);
      const swatSpring     = new SpringDamper1D(0, 140, 8.4);
      const stoneShakeSpring = new SpringDamper1D(0, 210, 9.2);
      const bodyBounce     = new SpringDamper1D(0, 132, 8.0);

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 7.4,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        prevYaw: opts.homeYaw ?? 0,
        pelvisYaw: opts.homeYaw ?? 0,
        // 界石锚点（位于林地空坪一侧，待机与巡游均清晰可见且不穿模）
        stoneX: (opts.homeX ?? 0) + 17.5,
        stoneY: (opts.homeY ?? 0) + 12.5,
        stoneYaw: 0.35,
        // 生态交互状态机：roam -> approach -> tap1 -> tap2 -> flutter -> swat -> settle
        stage: 'roam',
        stageTimer: 1.6,
        tap1Done: false,
        tap2Done: false,
        swatSide: 1,
        flutterProgress: 0,
        chestPose: 'normal',
        headPose: 'alert',
        tiltX: 0,
        tiltY: 0,
        lastHomeX: opts.homeX ?? 0,
        lastHomeY: opts.homeY ?? 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function computeStoneSpot(hx, hy, hyaw, sMul) {
        // 将界石放在基准点右前方约 21 格，视角清晰、离场地中心不远
        const [sx, sy] = localToWorldXY(hx, hy, hyaw, 13.5 * sMul, 16.5 * sMul);
        return [sx, sy];
      }

      function emitStoneTapVfx(vfx, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        // 地面环形震纹
        vfx.addRipple(state.stoneX, state.stoneY, 4.5 * sMul, 24.0 * sMul, 0.56, 2.2);
        // 碎苔与石屑微粒
        for (let k = 0; k < 9; k++) {
          const a = (k / 9) * TAU + Math.random() * 0.45;
          const spd = (8 + Math.random() * 14) * sMul;
          const vz = (7 + Math.random() * 12) * sMul;
          const col = k % 3 === 0 ? fx.spark : (k % 2 === 0 ? fx.moss : fx.stone);
          vfx.spawnParticle(
            state.stoneX + Math.cos(a) * 3.2 * sMul,
            state.stoneY + Math.sin(a) * 3.2 * sMul,
            (8.0 + Math.random() * 3.0) * sMul,
            Math.cos(a) * spd, Math.sin(a) * spd, vz,
            0.48 + Math.random() * 0.28, 1.25 + Math.random() * 0.45,
            col, false, 24
          );
        }
      }

      const instance = {
        def: Earth3Def,
        cachePrefix: `earth3_zh_${Math.random().toString(36).slice(2, 7)}`,
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
          state.x = homeX; state.y = homeY; state.yaw = homeYaw;
          state.prevYaw = homeYaw;
          state.pelvisYaw = homeYaw;
          state.z = 7.4; state.vx = 0; state.vy = 0;
          state.lastHomeX = homeX; state.lastHomeY = homeY;
          const [sx, sy] = computeStoneSpot(homeX, homeY, homeYaw, instance.scaleMul);
          state.stoneX = sx; state.stoneY = sy;

          state.stage = 'roam';
          state.stageTimer = 1.4;
          state.tap1Done = false;
          state.tap2Done = false;
          state.flutterProgress = 0;
          state.chestPose = 'normal';
          state.headPose = 'alert';

          crouchSpring.x = crouchSpring.v = 0;
          tailFlareSpring.x = tailFlareSpring.v = 0;
          headYawSpring.x = headYawSpring.v = 0;
          headNodSpring.x = headNodSpring.v = 0;
          spineBendSpring.x = spineBendSpring.v = 0;
          swatSpring.x = swatSpring.v = 0;
          stoneShakeSpring.x = stoneShakeSpring.v = 0;
          bodyBounce.x = bodyBounce.v = 0;

          const [pJointX, pJointY] = localToWorldXY(state.x, state.y, state.yaw, 0, -4.4);
          const [px, py] = pivotToWorldXY(pJointX, pJointY, state.pelvisYaw, PELVIS_PIVOT.x, PELVIS_PIVOT.y);
          gait.reset(state.x, state.y, state.yaw, instance.scaleMul, {
            BL: { x: px, y: py, yaw: state.pelvisYaw },
            BR: { x: px, y: py, yaw: state.pelvisYaw }
          });
          for (const ts of tailSolvers) {
            const [rx, ry] = localToWorldXY(px, py, state.pelvisYaw, ts.cfg.lx, ts.cfg.ly);
            ts.solver.reset(rx, ry, state.z + ts.cfg.lz, state.pelvisYaw + ts.cfg.restFan);
          }

          for (const bf of butterflies) {
            bf.x = state.stoneX + bf.perchOffX;
            bf.y = state.stoneY + bf.perchOffY;
            bf.z = bf.perchOffZ;
            bf.wingUp = bf.idx === 0;
            bf.flapTimer = bf.idx * 0.4;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const act = eco && eco.action;
          const isBattle = act === 'battle_attack' || act === 'battle_stagger' || act === 'battle_hurt';

          if (isBattle) {
            const actT = (eco && eco.actionTime != null) ? eco.actionTime : 0;
            const isNewAct = act !== state._bAct || actT < (state._bLastT || 0) - 0.04;
            if (isNewAct) {
              state._bAct = act;
              state._bFired = false;
              state._bFired2 = false;
              state._bAx = (eco && eco.homeX != null) ? eco.homeX : state.x;
              state._bAy = (eco && eco.homeY != null) ? eco.homeY : state.y;
              state._bYaw = (eco && eco.homeYaw != null) ? eco.homeYaw : state.yaw;
            }
            state._bLastT = actT;
            const ax = (eco && eco.homeX != null) ? eco.homeX : state._bAx;
            const ay = (eco && eco.homeY != null) ? eco.homeY : state._bAy;
            const hasTgt = eco && Array.isArray(eco.targetPos) && eco.targetPos.length >= 2 && Number.isFinite(eco.targetPos[0]) && Number.isFinite(eco.targetPos[1]);
            const tx = hasTgt ? eco.targetPos[0] : ax - Math.sin(state._bYaw) * 46 * sMul;
            const ty = hasTgt ? eco.targetPos[1] : ay + Math.cos(state._bYaw) * 46 * sMul;
            const tz = (hasTgt && Number.isFinite(eco.targetPos[2])) ? eco.targetPos[2] : 8 * sMul;
            const dx = tx - ax, dy = ty - ay;
            const dist = Math.hypot(dx, dy) || 1;
            const dirX = dx / dist, dirY = dy / dist;
            const sideX = -dirY, sideY = dirX;
            const aimYaw = Math.atan2(-dx, dy);

            // 对阵时将青苔界石与林蝶安放在身侧后方，彻底杜绝扑击穿石
            state.stoneX = ax + sideX * 28 * sMul - dirX * 10 * sMul;
            state.stoneY = ay + sideY * 28 * sMul - dirY * 10 * sMul;
            for (const bf of butterflies) {
              bf.x = state.stoneX + bf.perchOffX * sMul;
              bf.y = state.stoneY + bf.perchOffY * sMul;
              bf.z = bf.perchOffZ * sMul;
            }

            let crouchTgt = 0, flareTgt = 0, swatTgt = 0;
            state.vx = 0; state.vy = 0;

            if (act === 'battle_attack') {
              state.yaw = aimYaw;
              state.pelvisYaw = aimYaw;
              if (actT < 0.25) {
                const u = smoothstep(0, 1, actT / 0.25);
                state.x = ax - dirX * 3.5 * u * sMul;
                state.y = ay - dirY * 3.5 * u * sMul;
                state.z = 7.4 * sMul;
                crouchTgt = 1.0 * u;
                flareTgt = 1.2 * u;
                state.chestPose = u > 0.35 ? 'crouch' : 'normal';
                state.headPose = 'alert';
                if (vfx && Math.random() < 0.5) {
                  vfx.spawnParticle(
                    state.x - dirX * 8 * sMul + sideX * (Math.random() - 0.5) * 14 * sMul,
                    state.y - dirY * 8 * sMul + sideY * (Math.random() - 0.5) * 14 * sMul,
                    12 * sMul, 0, 0, 10 * sMul, 0.25, 1.5, '#ff8c42', true, 4
                  );
                }
              } else if (actT < 0.50) {
                const u = (actT - 0.25) / 0.25;
                const lunge = Math.sin(u * Math.PI * 0.5);
                state.x = ax + dirX * (-3.5 + 14.5 * lunge) * sMul;
                state.y = ay + dirY * (-3.5 + 14.5 * lunge) * sMul;
                state.z = (7.4 + Math.sin(u * Math.PI) * 3.6) * sMul;
                crouchTgt = 0.55;
                flareTgt = 1.2;
                swatTgt = 1.1;
                state.chestPose = 'crouch';
                state.headPose = 'earsBack';
                if (!state._bFired && actT >= 0.32) {
                  state._bFired = true;
                  swatSpring.impulse(36 * sp);
                  if (vfx) {
                    vfx.addRipple(tx, ty, 3 * sMul, 22 * sMul, 0.48, 2.0);
                    // 前两道巨型斜掠赤焰爪痕（横扫主角）
                    for (let claw = -1; claw <= 1; claw++) {
                      for (let k = 0; k < 6; k++) {
                        const frac = (k / 5) - 0.5;
                        const px0 = tx + sideX * (claw * 3.6 + frac * 11.0) * sMul + dirX * (frac * 5.0) * sMul;
                        const py0 = ty + sideY * (claw * 3.6 + frac * 11.0) * sMul + dirY * (frac * 5.0) * sMul;
                        const pz0 = tz + (5.5 - frac * 7.0) * sMul;
                        const col = k % 2 === 0 ? '#ff3b1f' : (claw === 0 ? '#fff0a6' : '#ff8c42');
                        vfx.spawnParticle(px0, py0, pz0, sideX * 20 * sMul, sideY * 20 * sMul, -6 * sMul, 0.34, 2.1, col, true, 6);
                      }
                    }
                  }
                }
                if (!state._bFired2 && actT >= 0.41) {
                  state._bFired2 = true;
                  if (vfx) {
                    // 第三道交叉重撕裂 + 地面裂印 + 爆裂赤火星
                    vfx.addDecal({
                      kind: 'crack', x: tx, y: ty, yaw: aimYaw,
                      rx: 9.0 * sMul, ry: 9.0 * sMul, life: 2.2, alpha: 0.72,
                      color: '#4f181c', hiColor: '#ff5930', darkColor: '#1a080a'
                    });
                    vfx.addRipple(tx, ty, 2 * sMul, 16 * sMul, 0.36, 1.6);
                    for (let k = 0; k < 9; k++) {
                      const frac = (k / 8) - 0.5;
                      const px0 = tx - sideX * (frac * 12.0) * sMul + dirX * (frac * 5.0) * sMul;
                      const py0 = ty - sideY * (frac * 12.0) * sMul + dirY * (frac * 5.0) * sMul;
                      const pz0 = tz + (6.0 - frac * 6.5) * sMul;
                      vfx.spawnParticle(px0, py0, pz0, -sideX * 22 * sMul, -sideY * 22 * sMul, -5 * sMul, 0.36, 2.2, k % 2 === 0 ? '#fff0a6' : '#ff3b1f', true, 6);
                    }
                    for (let i = 0; i < 14; i++) {
                      const a = (i / 14) * TAU;
                      const spd = (14 + Math.random() * 18) * sMul;
                      vfx.spawnParticle(tx, ty, tz + 3 * sMul, Math.cos(a) * spd, Math.sin(a) * spd, (10 + Math.random() * 12) * sMul, 0.40, 1.65, i % 2 === 0 ? '#ff4a2e' : '#ffe082', true, 44);
                    }
                  }
                }
              } else {
                const u = clamp((actT - 0.50) / 0.35, 0, 1);
                const ret = 1 - smoothstep(0, 1, u);
                state.x = ax + dirX * 11.0 * ret * sMul;
                state.y = ay + dirY * 11.0 * ret * sMul;
                state.z = (7.4 + Math.sin(u * Math.PI) * 1.4) * sMul;
                crouchTgt = 0.4 * ret;
                flareTgt = 0.8 * ret;
                state.chestPose = ret > 0.5 ? 'crouch' : 'normal';
                state.headPose = 'alert';
              }
            } else if (act === 'battle_stagger') {
              const p = clamp(actT / 0.85, 0, 1);
              const decay = 1 - p;
              const jit = Math.sin(actT * 36) * 2.2 * decay * sMul;
              state.x = ax - dirX * 4.2 * Math.sin(p * Math.PI) * sMul + sideX * jit;
              state.y = ay - dirY * 4.2 * Math.sin(p * Math.PI) * sMul + sideY * jit;
              state.z = lerp(7.4, 5.2, Math.sin(p * Math.PI)) * sMul;
              state.yaw = wrapAngle(aimYaw + Math.sin(actT * 24) * 0.24 * decay);
              state.pelvisYaw = wrapAngle(state.yaw - Math.sin(actT * 24) * 0.16 * decay);
              crouchTgt = 1.0;
              flareTgt = 0;
              state.chestPose = 'crouch';
              state.headPose = 'earsBack';
              if (!state._bFired) {
                state._bFired = true;
                bodyBounce.impulse(-16 * sMul);
                if (vfx) {
                  vfx.addRipple(ax, ay, 5 * sMul, 22 * sMul, 0.56, 1.8);
                  for (let i = 0; i < 14; i++) {
                    const a = (i / 14) * TAU;
                    const spd = (12 + Math.random() * 14) * sMul;
                    vfx.spawnParticle(ax, ay, 9 * sMul, Math.cos(a) * spd, Math.sin(a) * spd, (10 + Math.random() * 12) * sMul, 0.46, 1.65, i % 2 === 0 ? '#b8f4ff' : '#ffffff', true, 42);
                  }
                }
              }
            } else {
              // battle_hurt (0.35s)
              const p = clamp(actT / 0.35, 0, 1);
              const env = Math.sin(p * Math.PI);
              const vib = Math.sin(actT * 60) * 1.4 * (1 - p) * sMul;
              state.x = ax - dirX * 4.5 * env * sMul + sideX * vib;
              state.y = ay - dirY * 4.5 * env * sMul + sideY * vib;
              state.z = (7.4 - 1.0 * env) * sMul;
              state.yaw = wrapAngle(aimYaw + Math.sin(actT * 48) * 0.16 * (1 - p));
              state.pelvisYaw = state.yaw;
              state.chestPose = 'normal';
              state.headPose = 'earsBack';
              if (!state._bFired) {
                state._bFired = true;
                bodyBounce.impulse(-10 * sMul);
              }
            }

            const crouchVal = clamp(crouchSpring.update(dt, crouchTgt, 120 * sp, clamp(8.2 * dScale, 3.5, 12.0)), -0.1, 1.15);
            const flareVal = clamp(tailFlareSpring.update(dt, flareTgt, 128 * sp, clamp(6.6 * dScale, 3.0, 11.0)), 0, 1.25);
            swatSpring.update(dt, swatTgt, 150 * sp, clamp(8.4 * dScale, 3.6, 12.5));
            headYawSpring.update(dt, 0, 100 * sp, clamp(7.4 * dScale, 3.2, 11.5));
            headNodSpring.update(dt, 0, 125 * sp, clamp(8.4 * dScale, 3.5, 12.0));
            bodyBounce.update(dt, 0, 132 * sp, clamp(8.0 * dScale, 3.4, 12.0));
            state.tiltX = 0; state.tiltY = 0; state.frontBob = 0; state.rearBob = 0;

            const crouchDrop = clamp(crouchVal, 0, 1.1) * 1.45 * sMul;
            const bodyLift = state.z - crouchDrop + clamp(bodyBounce.x * 0.13, -1.8, 1.8);
            const [pJointX, pJointY] = localToWorldXY(state.x, state.y, state.yaw, 0, -4.4 * sMul);
            const [pelvisCX, pelvisCY] = pivotToWorldXY(pJointX, pJointY, state.pelvisYaw, PELVIS_PIVOT.x * sMul, PELVIS_PIVOT.y * sMul);
            const leapLift = Math.max(0, state.z - 7.4 * sMul);
            for (const leg of gait.legs) {
              const isRear = !leg.isFront;
              const ancX = isRear ? pelvisCX : state.x;
              const ancY = isRear ? pelvisCY : state.y;
              const ancYaw = isRear ? state.pelvisYaw : state.yaw;
              const [hx, hy] = localToWorldXY(ancX, ancY, ancYaw, leg.hipX * sMul, leg.hipY * sMul);
              const [rx, ry] = localToWorldXY(ancX, ancY, ancYaw, leg.restX * sMul, (leg.restY + (leg.isFront ? leapLift * 0.35 : -leapLift * 0.25)) * sMul);
              leg.anchorYaw = ancYaw;
              leg.hipWX = hx; leg.hipWY = hy;
              leg.hipWZ = bodyLift + (isRear ? 0.3 * sMul : 0) + leg.hipZ * sMul;
              leg.footX = rx; leg.footY = ry;
              leg.footZ = leg.isFront ? leapLift * 0.85 : leapLift * 0.45;
              const ik = solveSagittalLegIK(leg.hipWX, leg.hipWY, leg.hipWZ, leg.footX, leg.footY, leg.footZ, ancYaw, leg.L1 * sMul, leg.L2 * sMul, leg.kneeSign, sMul);
              leg.kneeX = ik.kx; leg.kneeY = ik.ky; leg.kneeZ = ik.kz;
            }
            instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.3 * sMul }));
            for (const ts of tailSolvers) {
              const cfg = ts.cfg;
              const [rx, ry] = localToWorldXY(pelvisCX, pelvisCY, state.pelvisYaw, cfg.lx * sMul, cfg.ly * sMul);
              const rz = bodyLift + cfg.lz * sMul;
              const fanAngle = lerp(cfg.restFan, cfg.flareFan, flareVal);
              ts.solver.update(dt, rx, ry, rz, state.pelvisYaw, time, {
                segLen: 2.28 * sMul,
                flexibility: flex * lerp(0.95, 1.25, flareVal),
                maxAngle: lerp(0.52, 0.72, flareVal),
                fanAngle,
                waveFreq: (4.0 + flareVal * 2.6) * freq,
                waveAmp: lerp(0.18, 0.52, flareVal),
                wavePhaseStep: 0.48,
                phaseOffset: cfg.phase,
                restAlign: lerp(0.14, 0.34, flareVal),
                zTargetFn: (u) => Math.max(2.0 * sMul, rz + lerp(cfg.liftBase * (1 - u * 0.7), cfg.liftBase + u * 8.0, flareVal) * sMul),
                zFollowSpeed: 14.0
              });
            }
            sockets.setLocal('horn', state.x, state.y, bodyLift, state.yaw, 0, 14.5, 13.5, sMul);
            return;
          }
          state._bAct = '';

          // 同时兼容 eco.action === 'idle' 与 eco.patrol === false 判定原地待机
          const isIdle = !eco || eco.action === 'idle' || eco.patrol === false;
          const patrol = !isIdle;

          const hx = (eco && eco.homeX) ?? state.lastHomeX ?? 0;
          const hy = (eco && eco.homeY) ?? state.lastHomeY ?? 0;
          const hyaw = (eco && eco.homeYaw) ?? 0;

          // 若工坊重排了站位中心，平滑更新界石锚点
          if (Math.hypot(hx - state.lastHomeX, hy - state.lastHomeY) > 1.5) {
            state.lastHomeX = hx;
            state.lastHomeY = hy;
            const [sx, sy] = computeStoneSpot(hx, hy, hyaw, sMul);
            state.stoneX = sx;
            state.stoneY = sy;
          }

          // -----------------------------------------------------------------
          // 1. 界石与林蝶完整生态自循环（待机与巡游双态皆清晰观赏且零穿模）
          //    roam -> approach -> tap1 -> tap2 -> flutter -> swat -> settle -> roam
          // -----------------------------------------------------------------
          state.stageTimer -= dt;
          const dxStone = state.stoneX - state.x;
          const dyStone = state.stoneY - state.y;
          const distStone = Math.hypot(dxStone, dyStone) || 0.001;
          const yawToStone = Math.atan2(-dxStone, dyStone);

          // 敲石站位点：保持在界石外 16.5*sMul 格处，独角俯首正好轻触石面不穿模
          const standDist = 16.5 * sMul;
          const approachDirX = (state.x - state.stoneX) / distStone;
          const approachDirY = (state.y - state.stoneY) / distStone;
          const standX = state.stoneX + approachDirX * standDist;
          const standY = state.stoneY + approachDirY * standDist;

          if (state.stage === 'roam') {
            if (state.stageTimer <= 0) {
              state.stage = 'approach';
              state.stageTimer = 5.5; // 最长接近超时保护
              state.tap1Done = false;
              state.tap2Done = false;
            }
          } else if (state.stage === 'approach') {
            const distStand = Math.hypot(standX - state.x, standY - state.y);
            const yawErr = Math.abs(wrapAngle(yawToStone - state.yaw));
            if ((distStand < 2.2 * sMul && yawErr < 0.22) || state.stageTimer <= 0) {
              state.stage = 'tap1';
              state.stageTimer = 0.62;
              state.tap1Done = false;
            }
          } else if (state.stage === 'tap1') {
            // 第一声“当！”敲石
            if (!state.tap1Done && state.stageTimer <= 0.24) {
              state.tap1Done = true;
              headNodSpring.impulse(38.0 * sp);
              stoneShakeSpring.impulse(24.0 * sp);
              bodyBounce.impulse(-12.0 * sMul);
              emitStoneTapVfx(vfx, sMul);
            }
            if (state.stageTimer <= 0) {
              state.stage = 'tap2';
              state.stageTimer = 0.64;
              state.tap2Done = false;
            }
          } else if (state.stage === 'tap2') {
            // 第二声“当！”敲石 -> 惊起石顶双蝶！
            if (!state.tap2Done && state.stageTimer <= 0.24) {
              state.tap2Done = true;
              headNodSpring.impulse(44.0 * sp);
              stoneShakeSpring.impulse(30.0 * sp);
              bodyBounce.impulse(-15.0 * sMul);
              emitStoneTapVfx(vfx, sMul);
            }
            if (state.stageTimer <= 0) {
              state.stage = 'flutter';
              state.stageTimer = 1.65;
              state.flutterProgress = 0;
              state.swatSide = Math.random() < 0.5 ? -1 : 1;
              // 惊蝶瞬间：5 条长尾猛然炸开成宽大扇面！
              tailFlareSpring.impulse(24.0 * sp);
              bodyBounce.impulse(14.0 * sMul);
            }
          } else if (state.stage === 'flutter') {
            state.flutterProgress = clamp(state.flutterProgress + dt / 3.9, 0, 1);
            if (state.stageTimer <= 0) {
              state.stage = 'swat';
              state.stageTimer = 0.85;
              swatSpring.impulse(36.0 * sp);
              bodyBounce.impulse(10.0 * sMul);
            }
          } else if (state.stage === 'swat') {
            state.flutterProgress = clamp(state.flutterProgress + dt / 3.9, 0, 1);
            if (state.stageTimer <= 0) {
              state.stage = 'settle';
              state.stageTimer = 1.55;
            }
          } else if (state.stage === 'settle') {
            state.flutterProgress = clamp(state.flutterProgress + dt / 3.9, 0, 1);
            if (state.stageTimer <= 0) {
              state.stage = 'roam';
              state.stageTimer = patrol ? (3.6 + Math.random() * 2.2) : (2.2 + Math.random() * 1.2);
              state.flutterProgress = 0;
            }
          }

          // -----------------------------------------------------------------
          // 2. 敏捷四足小跑巡游 / 轻盈踱步近石 / 原地微步待机
          // -----------------------------------------------------------------
          const prevYaw = state.yaw;
          const baseLift = 7.4 * sMul;

          if (state.stage === 'roam') {
            if (patrol) {
              Propulsion.multiLegWalk(state, dt, time, { ...params, speed: spdMul * 1.10 }, {
                ...eco,
                walkStyle: 'stalk',
                baseLift,
                maxRadius: (eco && eco.maxRadius) ?? 46
              });
              // 巡游时温和避开界石本体防穿模
              const dS = Math.hypot(state.x - state.stoneX, state.y - state.stoneY);
              const minStoneClear = 13.5 * sMul;
              if (dS < minStoneClear && dS > 0.01) {
                const push = (minStoneClear - dS) * 0.45;
                state.x += ((state.x - state.stoneX) / dS) * push;
                state.y += ((state.y - state.stoneY) / dS) * push;
              }
            } else {
              // 原地待机（S 键）：走回待机点后自然收脚停驻，呼吸微动并张望界石
              Propulsion.walkToPoint(state, hx, hy, dt, params, {
                arriveDist: 2.2 * sMul,
                maxSpeed: 14.5,
                maxTurn: 3.8,
                aimYaw: yawToStone + Math.sin(time * 0.85) * 0.18,
                baseLift
              });
            }
          } else if (state.stage === 'approach') {
            // 轻盈小跑踱步至界石前最佳敲击位（先对准再迈步，拒绝横移滑冰）
            Propulsion.walkToPoint(state, standX, standY, dt, params, {
              arriveDist: 1.8 * sMul,
              maxSpeed: 18.0,
              maxTurn: 4.4,
              aimYaw: yawToStone,
              baseLift
            });
          } else {
            // tap1 / tap2 / flutter / swat / settle：稳稳面向界石与盘旋林蝶
            const k = expSmooth(dt, 8.5);
            state.vx = lerp(state.vx, 0, k);
            state.vy = lerp(state.vy, 0, k);
            state.x += state.vx * dt;
            state.y += state.vy * dt;
            state.yaw = wrapAngle(state.yaw + wrapAngle(yawToStone - state.yaw) * expSmooth(dt, 5.2));
            state.z = lerp(state.z, baseLift, expSmooth(dt, 8.5));
          }

          // 脊柱转向屈曲：腰胯滞后跟随胸肩朝向，急转弯自然弯脊
          const yawRate = wrapAngle(state.yaw - prevYaw) / Math.max(dt, 0.001);
          state.prevYaw = state.yaw;
          const targetSpineBend = clamp(-yawRate * 0.14, -0.42, 0.42);
          const spineBend = spineBendSpring.update(dt, targetSpineBend, 78 * sp, clamp(7.4 * dScale, 3.2, 11.5));
          state.pelvisYaw = wrapAngle(state.yaw + spineBend);

          // -----------------------------------------------------------------
          // 3. 姿态弹簧：伏身、炸尾开扇、豹首俯仰与压耳、前爪虚扑
          // -----------------------------------------------------------------
          const crouchTarget = (state.stage === 'tap1' || state.stage === 'tap2')
            ? 1.0
            : (state.stage === 'swat' ? 0.65 : 0.0);
          const crouchVal = clamp(crouchSpring.update(dt, crouchTarget, 96 * sp, clamp(8.2 * dScale, 3.5, 12.0)), -0.1, 1.15);
          state.chestPose = crouchVal > 0.45 ? 'crouch' : 'normal';

          const flareTarget = (state.stage === 'flutter' || state.stage === 'swat')
            ? 1.0
            : (state.stage === 'settle' ? 0.25 : 0.0);
          const flareVal = clamp(tailFlareSpring.update(dt, flareTarget, 108 * sp, clamp(6.6 * dScale, 3.0, 11.0)), 0, 1.25);

          const swatTarget = state.stage === 'swat' ? 1.0 : 0.0;
          swatSpring.update(dt, swatTarget, 138 * sp, clamp(8.4 * dScale, 3.6, 12.5));

          const nodTarget = (state.stage === 'tap1' || state.stage === 'tap2')
            ? (state.stageTimer < 0.30 ? 1.0 : -0.25)
            : 0.0;
          headNodSpring.update(dt, nodTarget, 125 * sp, clamp(8.4 * dScale, 3.5, 12.0));
          stoneShakeSpring.update(dt, 0, 210 * sp, clamp(9.2 * dScale, 4.0, 13.0));

          if (state.stage === 'tap1' || state.stage === 'tap2') {
            state.headPose = 'butt';
          } else if (state.stage === 'flutter' || state.stage === 'swat') {
            state.headPose = 'earsBack';
          } else {
            state.headPose = 'alert';
          }

          // -----------------------------------------------------------------
          // 4. 推进 2 只彩翅林蝶：停歇微扇 -> 受惊盘旋半圈 -> 优雅落回石顶
          // -----------------------------------------------------------------
          const isFlying = state.stage === 'flutter' || state.stage === 'swat' || state.stage === 'settle';
          for (const bf of butterflies) {
            const flapPeriod = isFlying ? 0.085 : 0.72;
            bf.flapTimer += dt;
            if (bf.flapTimer >= flapPeriod) {
              bf.flapTimer = 0;
              bf.wingUp = !bf.wingUp;
            }

            if (!isFlying) {
              const tx = state.stoneX + bf.perchOffX * sMul;
              const ty = state.stoneY + bf.perchOffY * sMul;
              const tz = bf.perchOffZ * sMul;
              const k = expSmooth(dt, 8.0);
              bf.x = lerp(bf.x, tx, k);
              bf.y = lerp(bf.y, ty, k);
              bf.z = lerp(bf.z, tz, k);
              bf.yaw = wrapAngle(bf.yaw + Math.sin(time * 0.9 + bf.idx * 2.1) * dt * 0.25);
            } else {
              // 绕界石与红豹前方盘旋优雅半圈后落回石面
              const u = clamp(state.flutterProgress, 0, 1);
              const arc = Math.sin(u * Math.PI);
              // 盘旋中心在界石与红豹中间略偏石侧，确保视觉层次清晰且不穿模
              const midX = lerp(state.stoneX, state.x, 0.34);
              const midY = lerp(state.stoneY, state.y, 0.34);
              const baseAng = Math.atan2(state.y - state.stoneY, state.x - state.stoneX);
              const orbitAng = baseAng + bf.orbitDir * (u * Math.PI * 1.45 - 0.55 + bf.phaseOff * 0.4);
              const curRad = lerp(2.2, bf.orbitRad, arc) * sMul;

              const tx = lerp(state.stoneX + bf.perchOffX * sMul, midX + Math.cos(orbitAng) * curRad, smoothstep(0, 0.14, u) * (1 - smoothstep(0.84, 1.0, u)));
              const ty = lerp(state.stoneY + bf.perchOffY * sMul, midY + Math.sin(orbitAng) * curRad, smoothstep(0, 0.14, u) * (1 - smoothstep(0.84, 1.0, u)));
              const hoverWave = Math.sin(time * 7.5 + bf.idx * 2.4) * 1.3 * arc * sMul;
              const tz = lerp(bf.perchOffZ * sMul, bf.orbitHeight * sMul, Math.pow(arc, 0.65)) + hoverWave;

              const prevX = bf.x, prevY = bf.y;
              const k = expSmooth(dt, 9.5);
              bf.x = lerp(bf.x, tx, k);
              bf.y = lerp(bf.y, ty, k);
              bf.z = lerp(bf.z, tz, k);
              const vxB = bf.x - prevX, vyB = bf.y - prevY;
              if (Math.hypot(vxB, vyB) > 0.05) {
                const flyYaw = Math.atan2(-vxB, vyB);
                bf.yaw = wrapAngle(bf.yaw + wrapAngle(flyYaw - bf.yaw) * expSmooth(dt, 10.0));
              }
            }
          }

          // 豹首追视：惊蝶期盯紧领头彩蝶，巡游期顺弯张望
          let targetHeadYaw = clamp(-yawRate * 0.18, -0.52, 0.52) + Math.sin(time * 1.15) * 0.14;
          if (state.stage === 'flutter' || state.stage === 'swat') {
            const leadBf = butterflies[0];
            const dxB = leadBf.x - state.x, dyB = leadBf.y - state.y;
            const relB = wrapAngle(Math.atan2(-dxB, dyB) - state.yaw);
            targetHeadYaw = clamp(relB, -0.78, 0.78);
          } else if (state.stage === 'tap1' || state.stage === 'tap2') {
            targetHeadYaw = clamp(wrapAngle(yawToStone - state.yaw), -0.35, 0.35);
          }
          headYawSpring.update(dt, targetHeadYaw, 96 * sp, clamp(7.4 * dScale, 3.2, 11.5));

          // -----------------------------------------------------------------
          // 5. 四足敏捷对角小跑 IK 更新
          // -----------------------------------------------------------------
          const crouchDrop = clamp(crouchVal, 0, 1.1) * 1.45 * sMul;
          const [pJointPreX, pJointPreY] = localToWorldXY(state.x, state.y, state.yaw, 0, -4.4 * sMul);
          const [pelvisPreX, pelvisPreY] = pivotToWorldXY(pJointPreX, pJointPreY, state.pelvisYaw, PELVIS_PIVOT.x * sMul, PELVIS_PIVOT.y * sMul);
          const pelvisAnchor = { x: pelvisPreX, y: pelvisPreY, z: state.z - crouchDrop + 0.3 * sMul, yaw: state.pelvisYaw };

          const gaitRes = gait.update(dt, state.x, state.y, state.z - crouchDrop, state.yaw, state.vx, state.vy, {
            scaleMul: sMul,
            legAnchors: { BL: pelvisAnchor, BR: pelvisAnchor },
            stepFreq: freq * 1.08,
            stepHeight: 3.6 * sMul * clamp(flex, 0.7, 1.3)
          });

          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 0.75 * sMul, expSmooth(dt, 11));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 0.75 * sMul, expSmooth(dt, 11));
          state.frontBob = lerp(state.frontBob || 0, clamp(gaitRes.frontLift * 0.20, 0, 1.0), expSmooth(dt, 14));
          state.rearBob  = lerp(state.rearBob  || 0, clamp(gaitRes.rearLift  * 0.20, 0, 1.0), expSmooth(dt, 14));

          if (gaitRes.landed.length > 0) {
            bodyBounce.impulse(-10.5 * sMul);
            for (const leg of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, leg.footX, leg.footY, 0.72 * sMul);
            }
          }
          bodyBounce.update(dt, -gaitRes.liftSum * 0.12, 132 * sp, clamp(8.0 * dScale, 3.4, 12.0));
          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.3 * sMul }));

          // -----------------------------------------------------------------
          // 6. 5 条独立相位 ChainSolver 拖拽长尾（急转弯甩扇弧 / 惊蝶猛炸宽大扇面）
          // -----------------------------------------------------------------
          const bodyLift = state.z - crouchDrop + clamp(bodyBounce.x * 0.13, -1.8, 1.8);
          const bx = state.x + state.tiltX;
          const by = state.y + state.tiltY;
          const [pJointX, pJointY] = localToWorldXY(bx, by, state.yaw, 0, -4.4 * sMul);
          const [pelvisCX, pelvisCY] = pivotToWorldXY(pJointX, pJointY, state.pelvisYaw, PELVIS_PIVOT.x * sMul, PELVIS_PIVOT.y * sMul);

          const moveSpd = Math.hypot(state.vx, state.vy);
          const sweepOsc = Math.sin(time * 5.2 * freq) * 0.24 * flareVal;

          for (const ts of tailSolvers) {
            const cfg = ts.cfg;
            const [rx, ry] = localToWorldXY(pelvisCX, pelvisCY, state.pelvisYaw, cfg.lx * sMul, cfg.ly * sMul);
            const rz = bodyLift + cfg.lz * sMul;
            const fanAngle = lerp(cfg.restFan, cfg.flareFan, flareVal) + sweepOsc;
            const tailWaveAmp = lerp(0.24, 0.56, flareVal) + clamp(moveSpd / 28, 0, 0.28);

            ts.solver.update(dt, rx, ry, rz, state.pelvisYaw, time, {
              segLen: 2.28 * sMul,
              flexibility: flex * lerp(0.95, 1.25, flareVal),
              maxAngle: lerp(0.52, 0.72, flareVal),
              fanAngle,
              waveFreq: (3.6 + flareVal * 2.4) * freq,
              waveAmp: tailWaveAmp,
              wavePhaseStep: 0.48,
              phaseOffset: cfg.phase,
              // 炸尾开扇时提高归位力矩让 5 尾迅速定型成壮观扇面，巡游时保持轻柔归位凸显拖拽甩尾！
              restAlign: lerp(0.085, 0.28, flareVal),
              zTargetFn: (u, idx, t) => {
                // 巡游时优雅低垂尾梢微翘，惊蝶炸尾时高高扬起扇面波浪轻扫！
                const restCurve = rz + (cfg.liftBase * (1 - u * 0.65) - Math.sin(u * Math.PI) * 2.2 + Math.pow(u, 2.2) * 3.0) * sMul;
                const flareCurve = rz + (cfg.liftBase + u * 8.2 + Math.sin(t * 5.8 * freq - idx * 0.55 + cfg.phase) * 1.45 * u) * sMul;
                return Math.max(2.0 * sMul, lerp(restCurve, flareCurve, flareVal));
              },
              zFollowSpeed: lerp(9.5, 14.0, flareVal)
            });
          }

          sockets.setLocal('horn', bx, by, bodyLift, state.yaw, 0, 14.5, 13.5, sMul);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = habitat.isWater;
          const yw = state.yaw;
          const crouchVal = clamp(crouchSpring.x, 0, 1.15);
          const crouchDrop = crouchVal * 1.45 * sMul;
          const breathBob = Math.sin(state.stageTimer * 2.6 + state.x * 0.05) * 0.28 * sMul;
          const bodyLift = state.z - crouchDrop + clamp(bodyBounce.x * 0.13, -1.8, 1.8) + breathBob;
          const bx = state.x + state.tiltX;
          const by = state.y + state.tiltY;
          const swatVal = clamp(swatSpring.x, 0, 1.2);

          // 1. 四足高重叠连贯 IK 腿（起点 100% 锁死在胸肩 / 腰胯内部，终点 100% 踩实地面落点，永不分离）
          for (const leg of gait.legs) {
            const isSwatPaw = (state.swatSide < 0 && leg.id === 'FL') || (state.swatSide >= 0 && leg.id === 'FR');
            const legYaw = leg.anchorYaw ?? yw;
            let fx = leg.footX, fy = leg.footY, fz = leg.footZ;
            let kx = leg.kneeX, ky = leg.kneeY, kz = leg.kneeZ;
            const hx = leg.hipWX + state.tiltX;
            const hy = leg.hipWY + state.tiltY;
            const hz = leg.hipWZ;

            if (isSwatPaw && swatVal > 0.04) {
              const [swX, swY] = localToWorldXY(0, 0, yw, state.swatSide * 1.6 * swatVal * sMul, 5.4 * swatVal * sMul);
              fx += swX;
              fy += swY;
              fz += (7.2 * swatVal + Math.sin(swatVal * Math.PI) * 1.8) * sMul;
              kx += swX * 0.55;
              ky += swY * 0.55;
              kz += 4.6 * swatVal * sMul;
            }

            const segs = [
              { k: 'limbHip',   x: hx, y: hy, z: hz, b: -0.58, sym: 90 },
              { k: 'limbUpper', x: lerp(hx, kx, 0.50), y: lerp(hy, ky, 0.50), z: lerp(hz, kz, 0.50), b: -0.52, sym: 90 },
              { k: 'limbKnee',  x: kx, y: ky, z: kz, b: -0.45, sym: 90 },
              { k: 'limbLower', x: lerp(kx, fx, 0.52), y: lerp(ky, fy, 0.52), z: lerp(kz, fz + 1.6 * sMul, 0.52), b: -0.38, sym: 90 },
              { k: 'paw',       x: fx, y: fy, z: fz, b: isSwatPaw && swatVal > 0.3 ? 0.65 : -0.28, sym: 0 }
            ];
            for (const pt of segs) {
              const item = {
                partKey: pt.k,
                asset: parts[pt.k],
                x: pt.x,
                y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === 'paw' ? 0 : 2.1 * sMul)),
                ro: legYaw,
                bias: pt.b,
                submerge: EnvFeedback.calcSubmerge(pt.z + 0.8, habitat.waterLevel, 4.4, isWater)
              };
              if (pt.sym) item.symDeg = pt.sym;
              list.push(item);
            }
          }

          // 2. 5 条 8 节修长拖拽长尾（高重叠、尾尖深色毛簇）
          const tailSegMap = ['tailSeg0', 'tailSeg0', 'tailSeg1', 'tailSeg1', 'tailSeg2', 'tailSeg2', 'tailSeg2', 'tailTuft'];
          for (let ti = 0; ti < tailSolvers.length; ti++) {
            const nodes = tailSolvers[ti].solver.nodes;
            for (let j = 0; j < nodes.length; j++) {
              const nd = nodes[j];
              const pk = tailSegMap[Math.min(tailSegMap.length - 1, j)];
              const isTuft = pk === 'tailTuft';
              const item = {
                partKey: pk,
                asset: parts[pk],
                x: nd.x,
                y: nd.y,
                lift: Math.max(0.6, nd.z - (isTuft ? 2.6 : 2.0) * sMul),
                ro: nd.yaw,
                bias: -0.25 - j * 0.025,
                submerge: EnvFeedback.calcSubmerge(nd.z, habitat.waterLevel, 4.4, isWater)
              };
              if (!isTuft) item.symDeg = 90;
              list.push(item);
            }
          }

          // 3. 独立腰胯躯干（pivotToWorldXY 锁死前腰脊柱关节 + 后足起伏错相）
          const [pJointX, pJointY] = localToWorldXY(bx, by, yw, 0, -4.4 * sMul);
          const [pelvisCX, pelvisCY] = pivotToWorldXY(pJointX, pJointY, state.pelvisYaw, PELVIS_PIVOT.x * sMul, PELVIS_PIVOT.y * sMul);
          list.push({
            partKey: 'pelvis',
            asset: parts.pelvis,
            x: pelvisCX,
            y: pelvisCY,
            lift: bodyLift + 0.3 * sMul + (state.rearBob || 0) * 0.75,
            ro: state.pelvisYaw,
            bias: 0.15,
            submerge: EnvFeedback.calcSubmerge(bodyLift + 1.5, habitat.waterLevel, 4.8, isWater)
          });

          // 4. 独立胸肩躯干（2 档无损烘焙：normal / crouch + 前足起伏错相）
          const chestKey = state.chestPose === 'crouch' ? 'chestCrouch' : 'chestNormal';
          list.push({
            partKey: chestKey,
            asset: parts[chestKey],
            x: bx,
            y: by,
            lift: bodyLift + (state.frontBob || 0) * 0.75,
            ro: yw,
            bias: 0.42,
            submerge: EnvFeedback.calcSubmerge(bodyLift + 1.5, habitat.waterLevel, 4.8, isWater)
          });

          // 5. 独立颈部 + 独立豹首（pivotToWorldXY 锁死枕颈枢轴 + 敲石俯冲位移）
          const hRel = clamp(headYawSpring.x, -0.78, 0.78);
          const nod = clamp(headNodSpring.x, -0.35, 1.35);
          const nYaw = wrapAngle(yw + hRel * 0.42);
          const hYaw = wrapAngle(yw + hRel);

          const [nJointX, nJointY] = localToWorldXY(bx, by, yw, 0, (4.8 + nod * 1.4) * sMul);
          const [neckCX, neckCY] = pivotToWorldXY(nJointX, nJointY, nYaw, NECK_PIVOT.x * sMul, NECK_PIVOT.y * sMul);
          const neckLift = bodyLift + (5.8 - crouchVal * 1.2 - nod * 1.1) * sMul;
          list.push({
            partKey: 'neck',
            asset: parts.neck,
            x: neckCX,
            y: neckCY,
            lift: neckLift,
            ro: nYaw,
            bias: 0.65
          });

          const [hJointX, hJointY] = localToWorldXY(nJointX, nJointY, nYaw, 0, (3.8 + nod * 2.1) * sMul);
          const [headCX, headCY] = pivotToWorldXY(hJointX, hJointY, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const headKey = state.headPose === 'butt'
            ? 'headButt'
            : (state.headPose === 'earsBack' ? 'headEarsBack' : 'headAlert');
          const headLift = neckLift + (3.4 - nod * 1.8 + (state.headPose === 'earsBack' ? 1.1 : 0)) * sMul;
          list.push({
            partKey: headKey,
            asset: parts[headKey],
            x: headCX,
            y: headCY,
            lift: headLift,
            ro: hYaw,
            bias: 0.90
          });

          // 6. 待机交互物：林间青苔界石（敲击时轻微震动）
          const shake = clamp(stoneShakeSpring.x, -0.8, 0.8) * 0.35 * sMul;
          list.push({
            partKey: 'mossStone',
            asset: parts.mossStone,
            x: state.stoneX + shake,
            y: state.stoneY - shake * 0.5,
            lift: 0,
            ro: state.stoneYaw,
            bias: 0.05,
            submerge: EnvFeedback.calcSubmerge(2.0, habitat.waterLevel, 4.5, isWater)
          });

          // 7. 待机交互物：2 只振翅彩翅林蝶
          for (const bf of butterflies) {
            const pk = bf.wingUp ? bf.upKey : bf.downKey;
            list.push({
              partKey: pk,
              asset: parts[pk],
              x: bf.x,
              y: bf.y,
              lift: Math.max(2.0, bf.z - 2.2 * sMul),
              ro: bf.yaw,
              bias: 0.95
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Earth3Def.id,
            code: Earth3Def.code,
            status: Earth3Def.status,
            name: Earth3Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            chestPose: state.chestPose,
            headPose: state.headPose,
            interactStage: state.stage,
            tailCount: TAIL_CONFIGS.length,
            tailSegmentsEach: 8,
            butterflyCount: butterflies.length,
            footRadius: Earth3Def.footRadius,
            headZ: 22,
            centerZ: 12,
            blocks: Earth3Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Earth3Def);
})(window.PixelWorkshop);
