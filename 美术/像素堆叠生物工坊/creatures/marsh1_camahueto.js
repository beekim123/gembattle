'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, fbm1 } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, ChainSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 泽1 · 破土独角牛犊（智利 Camahueto · v3 精制纯生态版，+Y 正前，z=0 贴地）
  //   1. 敦实有力的青灰小壮牛身躯：宽额厚颈、立耳、鼻环纹、强壮四肢与沾满深褐泥浆的宽蹄；
  //   2. 额头正中一根修长微弯的青碧玉质独角（三档清透青碧色阶 + 角尖水汽微亮核心，为全怪视觉焦点）；
  //   3. 严守 v3 清晰度与零抖动铁律：色表 39 色（<= 48、零重色）、eyeGlint 绝不进 glowKeys、
  //      零常态小数缩放、头部与尾根以 pivotToWorldXY 锁死枢轴、四足弯膝 IK 高重叠防串珠；
  //   4. 待机交互物与潜泥破土双态循环：
  //      - 泥潭水面漂浮 3 片立体体素圆浮萍叶，主叶上蹲着鼓鳃呼吸的立体体素泥潭小青蛙；
  //      - 潜泥蓄水态（submerge 半潜染水色、独角冒泥泡水汽、小青蛙歪头张望）
  //        -> 破泥惊蛙态（青角高频震动蓄水汽、吓得小青蛙跃离浮萍扎水溅涟漪）
  //        -> 跃出冲刺态（破泥昂身四溅泥花、四足绕沼泽短距疾驰留水沟尾迹、停步甩头抖泥）
  //        -> 缓步回泥潭重潜、小青蛙爬回浮萍叶，待机与巡游双态完整自循环且零穿模。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 主体青灰牛皮（3 档）
      hideDark:      '#36434d',
      hideMid:       '#566978',
      hideHi:        '#8499a8',
      // 肩峰与背脊深青灰（3 档）
      backDark:      '#232d36',
      backMid:       '#3c4d5c',
      backHi:        '#62778a',
      // 胸腹浅雾灰（3 档）
      bellyDark:     '#657580',
      bellyMid:      '#91a3ad',
      bellyHi:       '#c2d1d9',
      // 宽蹄与腿下深褐泥浆（3 档）
      mudDark:       '#2b1f16',
      mudMid:        '#4f3928',
      mudHi:         '#7a5a40',
      // 牛吻深岩灰（3 档）
      snoutDark:     '#222830',
      snoutMid:      '#3b4450',
      snoutHi:       '#5c6878',
      // 牛鼻环纹古铜色（3 档）
      ringDark:      '#6e4b1c',
      ringMid:       '#b07c32',
      ringHi:        '#e3b25d',
      // 额中青碧玉质独角（3 档清透青碧）
      hornDark:      '#146b66',
      hornMid:       '#28b3a4',
      hornHi:        '#78ebd8',
      // 独立锐利双眼（eyeGlint 严禁进 glowKeys）
      eyeDark:       '#10151c',
      eyeIris:       '#e8b438',
      eyeGlint:      '#f5feff',
      // 立体浮萍叶（3 档）
      padDark:       '#1f4f28',
      padMid:        '#388240',
      padHi:         '#6cb865',
      // 浮萍小花苞（3 档）
      budDark:       '#9e485c',
      budMid:        '#d97589',
      budHi:         '#f7b7c2',
      // 泥潭小青蛙（3 档）
      frogDark:      '#2c6626',
      frogMid:       '#52a63d',
      frogHi:        '#94d96c',
      // 小青蛙鼓鳃喉腹（3 档）
      frogBellyDark: '#8c9c6b',
      frogBellyMid:  '#c7d69a',
      frogBellyHi:   '#edf5cc',
      // 仅青角角尖水汽核心进 glowKeys
      emissiveMid:   '#2ce6d6',
      emissiveHot:   '#8cfcf0',
      emissiveCore:  '#ebfffe'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'torso', 'back', 'belly', 'mud', 'snout', 'ring',
      'horn', 'hornCore', 'eye', 'leg', 'hoof', 'tail',
      'pad', 'bud', 'frog', 'frogBelly'
    ],
    noCrease: [
      ['torso', 'back'], ['torso', 'belly'], ['torso', 'mud'],
      ['torso', 'snout'], ['snout', 'ring'], ['torso', 'eye'],
      ['torso', 'horn'], ['horn', 'hornCore'],
      ['leg', 'mud'], ['leg', 'hoof'], ['mud', 'hoof'],
      ['pad', 'bud'], ['frog', 'frogBelly'], ['frog', 'eye']
    ],
    materials: {
      hide:      ['hideDark',      'hideMid',      'hideHi'],
      back:      ['backDark',      'backMid',      'backHi'],
      belly:     ['bellyDark',     'bellyMid',     'bellyHi'],
      mud:       ['mudDark',       'mudMid',       'mudHi'],
      snout:     ['snoutDark',     'snoutMid',     'snoutHi'],
      ring:      ['ringDark',      'ringMid',      'ringHi'],
      horn:      ['hornDark',      'hornMid',      'hornHi'],
      pad:       ['padDark',       'padMid',       'padHi'],
      bud:       ['budDark',       'budMid',       'budHi'],
      frog:      ['frogDark',      'frogMid',      'frogHi'],
      frogBelly: ['frogBellyDark', 'frogBellyMid', 'frogBellyHi']
    },
    protectedParts: ['eye', 'horn', 'hornCore', 'ring', 'bud']
  });

  // 4 套零重建模换色皮肤（含专属描边与泥花/水汽粒子配色）
  const SKINS = [
    {
      id: 'jade_mud',
      name: '青玉泥犊（沼泽经典）',
      dot: '#28b3a4',
      outline: '#0d1518',
      pal: {},
      fx: {
        mud:   '#59402c',
        spray: '#78d9cc',
        mist:  '#b8fff6',
        foam:  '#d4f7f2'
      }
    },
    {
      id: 'iron_jade',
      name: '玄铁碧角（深潭款）',
      dot: '#22a37a',
      outline: '#0a0e14',
      pal: {
        hideDark:     '#1d222b', hideMid:     '#323b4a', hideHi:     '#546175',
        backDark:     '#13171f', backMid:     '#232a36', backHi:     '#3f4a5c',
        bellyDark:    '#3c4654', bellyMid:    '#5c697a', bellyHi:    '#8695a8',
        mudDark:      '#1e1a17', mudMid:      '#383028', mudHi:      '#594c3f',
        hornDark:     '#0c5c46', hornMid:     '#1ba87c', hornHi:     '#6ee8ba',
        ringDark:     '#6b5a2e', ringMid:     '#ad9450', ringHi:     '#e0c982',
        emissiveMid:  '#1ce09b', emissiveHot: '#7cfad0', emissiveCore:'#e3fff5'
      },
      fx: {
        mud:   '#3b332b',
        spray: '#52d6a8',
        mist:  '#9efce0',
        foam:  '#ccf7ea'
      }
    },
    {
      id: 'moss_amber',
      name: '苔藓黄角（芦苇滩款）',
      dot: '#d9a432',
      outline: '#14170c',
      pal: {
        hideDark:     '#3a452d', hideMid:     '#5c6b45', hideHi:     '#89996b',
        backDark:     '#27301e', backMid:     '#425231', backHi:     '#687d50',
        bellyDark:    '#6c7353', bellyMid:    '#9aa17a', bellyHi:    '#cbd1ab',
        mudDark:      '#332617', mudMid:      '#594329', mudHi:      '#856642',
        hornDark:     '#8a5a12', hornMid:     '#d99824', hornHi:     '#ffe070',
        ringDark:     '#5c3b20', ringMid:     '#966338', ringHi:     '#cc945e',
        emissiveMid:  '#f0b429', emissiveHot: '#ffe26e', emissiveCore:'#fffbe0'
      },
      fx: {
        mud:   '#634b2e',
        spray: '#e6c565',
        mist:  '#fff0a6',
        foam:  '#f7f2d4'
      }
    },
    {
      id: 'porcelain_cyan',
      name: '白瓷青角（雾泽款）',
      dot: '#5bc4e0',
      outline: '#0e161f',
      pal: {
        hideDark:     '#8899a6', hideMid:     '#bccbd6', hideHi:     '#eaf2f7',
        backDark:     '#5e7385', backMid:     '#8ba2b5', backHi:     '#bed1e0',
        bellyDark:    '#9eadb8', bellyMid:    '#cdd9e0', bellyHi:    '#f5fafc',
        mudDark:      '#3a444d', mudMid:      '#5b6975', mudHi:      '#8292a1',
        snoutDark:    '#485563', snoutMid:    '#6c7d8f', snoutHi:    '#98a9ba',
        hornDark:     '#14658a', hornMid:     '#2fa8d6', hornHi:     '#8ce6ff',
        emissiveMid:  '#3bc8f5', emissiveHot: '#9cebff', emissiveCore:'#edfaff'
      },
      fx: {
        mud:   '#62707d',
        spray: '#8cdcf5',
        mist:  '#c7f4ff',
        foam:  '#e8faff'
      }
    }
  ];

  // =========================================================================
  // 1. 敦实青灰小壮牛躯干（2 档无损烘焙：calm 静伏平稳 / surge 破泥昂胸）
  //    尺寸 20×26×16：厚实肩峰、饱满胸腔、浑圆后臀、腹底与两侧下缘沾泥渍
  // =========================================================================
  function buildTorso(makeCanvas, stage) {
    const isSurge = stage === 'surge';
    const W = 20, D = 26, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    const shoulderZ = isSurge ? 10.6 : 9.8;
    const chestY    = isSurge ? 4.8  : 4.2;

    m.fillAABB(-9.0, 9.0, -12.0, 12.0, 1, 14, (x, y, z, X, Y) => {
      // 厚实牛肩 + 壮硕胸腹 + 浑圆后臀 + 粗短厚颈根
      const dChest    = (Math.hypot(X / 7.2, (Y - chestY) / 7.2, (z - 7.8) / 5.5) - 1.0) * 5.8;
      const dShoulder = (Math.hypot(X / 6.6, (Y - (chestY - 1.2)) / 6.2, (z - shoulderZ) / 4.2) - 1.0) * 4.6;
      const dBarrel   = (Math.hypot(X / 7.5, (Y + 1.0) / 8.8, (z - 7.4) / 5.2) - 1.0) * 6.0;
      const dRump     = (Math.hypot(X / 6.8, (Y + 6.6) / 5.4, (z - 8.2) / 4.8) - 1.0) * 4.8;
      const dNeckBase = (Math.hypot(X / 4.6, (Y - 9.2) / 3.8, (z - (isSurge ? 9.8 : 8.8)) / 4.2) - 1.0) * 3.8;

      const d = smin(smin(smin(dChest, dShoulder, 2.0), smin(dBarrel, dRump, 2.2), 2.2), dNeckBase, 1.8);
      if (d > 0) return;

      // 腹底与两侧下缘的自然泥浆斑纹
      const mudWave = Math.sin(X * 0.85 + Y * 0.55) * 0.9;
      const isMudSplash = z <= 3.6 + mudWave && (Math.abs(X) > 3.2 || Y < 5.5);
      const isBackRidge = z >= 10.6 - Math.abs(X) * 0.35 && Math.abs(X) < 4.6;
      const isBelly     = z < 5.4 && Math.abs(X) < 4.8 && !isMudSplash;

      if (isMudSplash) {
        m.setRaw(x, y, z, mat('mud'), partId.mud);
      } else if (isBackRidge) {
        m.setRaw(x, y, z, mat('back'), partId.back);
      } else if (isBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else {
        m.setRaw(x, y, z, mat('hide'), partId.torso);
      }
    });

    // 背脊微隆肌肉棱（强化壮牛肩峰体量）
    m.paintCapsule(0, 6.2, isSurge ? 12.6 : 11.8, 0, -5.2, 11.4, 2.0, 1.5, mat('back'), partId.back, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.5, headZ: 15, centerZ: 8 });
  }

  // =========================================================================
  // 2. 独立壮牛头 + 额中青碧玉质独角（2 档无损烘焙：normal 常态 / charge 蓄水震角）
  //    尺寸 16×22×22，枢轴锁在后颈根部 (0, -4.4)
  //    包含：宽额、立耳、牛吻、古铜鼻环纹、2×2 锐利牛眼、三档青碧玉独角 + 角尖水汽核心
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -4.4 };
  function buildHead(makeCanvas, pose) {
    const isCharge = pose === 'charge';
    const W = 16, D = 22, H = 22;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 粗壮厚颈 + 宽阔牛额
    m.paintCapsule(0, -4.6, 3.6, 0, -0.6, 6.8, 3.9, 4.2, mat('hide'), partId.torso, true);
    m.paintEllipsoid(0, 0.2, 7.2, 4.8, 4.8, 4.2, mat('hide'), partId.torso, true);
    // 额顶深色厚毛顶脊
    m.paintEllipsoid(0, -0.8, 9.8, 3.6, 3.6, 2.0, mat('back'), partId.back, true);

    // 宽厚方形牛吻（朝 +Y 突出）
    m.paintEllipsoid(0, 5.0, 5.2, 3.6, 3.8, 2.8, mat('snout'), partId.snout, true);
    m.paintEllipsoid(0, 7.2, 4.6, 3.1, 1.8, 2.2, mat('snout'), partId.snout, true);
    // 下颌浅绒
    m.paintEllipsoid(0, 3.6, 3.1, 2.6, 3.2, 1.5, mat('belly'), partId.belly, true);

    // 清晰牛鼻环纹（横跨鼻端下缘的古铜色半环）
    m.paintCapsule(-2.1, 7.6, 3.6, 0, 8.7, 2.9, 0.72, 0.78, mat('ring'), partId.ring, true);
    m.paintCapsule( 2.1, 7.6, 3.6, 0, 8.7, 2.9, 0.72, 0.78, mat('ring'), partId.ring, true);
    // 左右鼻孔微凹点缀（用深岩灰区分）
    m.paintEllipsoid(-1.5, 8.4, 5.4, 0.75, 0.65, 0.72, keyToId.snoutDark, partId.snout, true);
    m.paintEllipsoid( 1.5, 8.4, 5.4, 0.75, 0.65, 0.72, keyToId.snoutDark, partId.snout, true);

    // 一对有力立耳（charge 态微向后抿，凸显冲刺气势）
    const earBackY = isCharge ? -3.4 : -1.8;
    const earTipZ  = isCharge ? 11.4 : 12.4;
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 3.6, -1.0, 8.6, s * 6.8, earBackY, earTipZ, 1.55, 0.78, mat('hide'), partId.torso, true);
      m.paintCapsule(s * 4.2, -0.4, 8.5, s * 6.0, earBackY + 0.6, earTipZ - 0.6, 0.85, 0.45, mat('belly'), partId.belly, true);
    }

    // ---------------------------------------------------------------------
    // 全怪第一视觉焦点：额头正中修长微弯的青碧玉质独角（3 段弧形收尖 + 蓄水微亮核心）
    // ---------------------------------------------------------------------
    // 角座玉环（深青碧嵌入宽额）
    m.paintEllipsoid(0, 2.2, 10.6, 2.0, 2.1, 1.35, mat('horn'), partId.horn, true);
    // 独角下段（略前倾上扬）
    m.paintCapsule(0, 2.2, 10.8, 0, 4.0, 14.4, 1.65, 1.30, mat('horn'), partId.horn, true);
    // 独角中段（优雅微弯向上）
    m.paintCapsule(0, 4.0, 14.4, 0, 5.8, 17.8, 1.28, 0.92, mat('horn'), partId.horn, true);
    // 独角尖梢（锐利收尖 + 水汽亮核）
    m.paintCapsule(0, 5.8, 17.8, 0, 6.9, 20.4, 0.88, 0.45, mat('horn'), partId.horn, true);

    // 角尖水汽核心（仅此处进 glowKeys；charge 蓄水态微扩水汽亮芒）
    if (isCharge) {
      m.paintEllipsoid(0, 6.2, 18.6, 1.35, 1.35, 1.55, keyToId.emissiveMid, partId.hornCore, true);
      m.paintEllipsoid(0, 6.7, 19.8, 0.95, 0.95, 1.10, keyToId.emissiveHot, partId.hornCore, true);
      m.paintEllipsoid(0, 7.0, 20.5, 0.58, 0.58, 0.65, keyToId.emissiveCore, partId.hornCore, true);
    } else {
      m.paintEllipsoid(0, 6.5, 19.4, 0.92, 0.92, 1.05, keyToId.emissiveMid, partId.hornCore, true);
      m.paintEllipsoid(0, 6.8, 20.2, 0.58, 0.58, 0.65, keyToId.emissiveHot, partId.hornCore, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 表面落点 2×2 锐利牛眼（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.8);
    const eyeZ = 8;
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 6; step++) {
        const tx = Math.round(hw + s * (5.5 - step));
        const p = m.getPartId(tx, eyeY, eyeZ);
        if (p === partId.torso || p === partId.snout) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 4.0);
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dy === 1)
            ? keyToId.eyeGlint
            : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 5.2, headZ: 21, centerZ: 10 });
  }

  // =========================================================================
  // 3. 强壮四肢连杆 + 沾满深褐泥浆的宽蹄（高重叠弯膝 IK，起点深嵌躯干永不分离）
  // =========================================================================
  function buildLimbSeg(makeCanvas, rTop, rBot, hLen, muddyBottom) {
    const S = Math.max(7, Math.ceil(Math.max(rTop, rBot) * 2 + 4));
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.2, 0, 0, H - 1.2, rBot, rTop, mat('hide'), partId.leg, true);
    if (muddyBottom) {
      m.paintCapsule(0, 0, 1.1, 0, 0, Math.min(H - 2, 3.6), rBot * 1.06, rBot * 0.98, mat('mud'), partId.mud, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildMudHoof(makeCanvas) {
    const m = new VoxelModel(9, 10, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0.3, 2.0, 2.55, 2.85, 1.85, mat('mud'), partId.hoof, true);
    m.paintEllipsoid(-1.05, 1.9, 1.5, 1.15, 1.45, 1.35, mat('mud'), partId.hoof, true);
    m.paintEllipsoid( 1.05, 1.9, 1.5, 1.15, 1.45, 1.35, mat('mud'), partId.hoof, true);
    m.paintEllipsoid(0, -0.3, 3.8, 1.95, 2.05, 1.35, mat('mud'), partId.mud, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.9 });
  }

  // 短壮牛尾节 + 沾泥尾穗
  function buildTailSeg(makeCanvas, r, hLen, isTuft) {
    const S = Math.max(6, Math.ceil(r * 2 + 4));
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    if (isTuft) {
      m.paintEllipsoid(0, 0, H * 0.5, r * 1.15, r * 1.25, H * 0.42, mat('mud'), partId.mud, true);
      m.paintEllipsoid(0, 0.3, H * 0.72, r * 0.85, r * 0.85, H * 0.25, mat('back'), partId.tail, true);
    } else {
      m.paintCapsule(0, 0, 1.1, 0, 0, H - 1.1, r * 0.88, r, mat('back'), partId.tail, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: r });
  }

  // =========================================================================
  // 4. 待机交互物 A：立体体素圆浮萍叶（大小两款，带 V 形缺口、微卷叶缘与可选小花苞）
  // =========================================================================
  function buildLilypad(makeCanvas, radius, withBud) {
    const S = Math.ceil(radius * 2 + 4);
    const H = withBud ? 7 : 5;
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-radius - 0.5, radius + 0.5, -radius - 0.5, radius + 0.5, 1, 3, (x, y, z, X, Y) => {
      const dist = Math.hypot(X, Y);
      if (dist > radius) return;
      // 经典浮萍 V 形缺口（朝 +X 微偏 -Y）
      const ang = Math.atan2(Y, X);
      if (ang > -0.34 && ang < 0.26 && dist > 1.0) return;
      // 叶片中心略薄，边缘微卷增厚
      const isRim = dist > radius - 1.35;
      if (z === 1 || (z === 2 && (dist > 1.2 || isRim)) || (z === 3 && isRim && dist > radius - 1.0)) {
        m.setRaw(x, y, z, mat('pad'), partId.pad);
      }
    });

    if (withBud) {
      // 一朵精致小沼泽花苞点缀在叶缘旁
      m.paintEllipsoid(-radius * 0.42, radius * 0.32, 3.6, 1.45, 1.45, 1.85, mat('bud'), partId.bud, true);
      m.paintEllipsoid(-radius * 0.42, radius * 0.32, 4.9, 0.85, 0.85, 0.95, mat('bud'), partId.bud, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: radius, headZ: H - 1, centerZ: 2 });
  }

  // =========================================================================
  // 5. 待机交互物 B：立体体素泥潭小青蛙（3 档无损烘焙：calm 静蹲 / puff 鼓鳃 / leap 跃水）
  //    尺寸 10×12×9：圆滚滚青蛙身 + 大凸眼 + 折叠后腿 + 鼓鳃喉囊
  // =========================================================================
  function buildMudFrog(makeCanvas, stage) {
    const isPuff = stage === 'puff';
    const isLeap = stage === 'leap';
    const W = 10, D = 12, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 圆滚滚蛙身（leap 态前倾拉长）
    if (isLeap) {
      m.paintCapsule(0, -1.6, 3.2, 0, 2.8, 5.0, 2.2, 2.4, mat('frog'), partId.frog, true);
      m.paintEllipsoid(0, 1.4, 3.6, 2.0, 2.3, 1.3, mat('frogBelly'), partId.frogBelly, true);
      // 蹬直向后的双后腿
      for (const s of [-1, 1]) {
        m.paintCapsule(s * 1.5, -1.6, 3.0, s * 2.4, -4.8, 1.8, 1.05, 0.72, mat('frog'), partId.frog, true);
        m.paintCapsule(s * 1.6, 2.2, 3.4, s * 2.5, 4.2, 3.2, 0.75, 0.55, mat('frog'), partId.frog, true);
      }
    } else {
      m.paintEllipsoid(0, -0.2, 3.2, 2.85, 3.15, 2.35, mat('frog'), partId.frog, true);
      // 腹部与鼓鳃喉囊（puff 态明显鼓起圆润喉囊）
      const throatR = isPuff ? 2.25 : 1.55;
      const throatY = isPuff ? 2.65 : 1.95;
      m.paintEllipsoid(0, throatY, 2.35, throatR, throatR * 0.92, isPuff ? 1.65 : 1.15, mat('frogBelly'), partId.frogBelly, true);
      // 两侧折叠后腿
      for (const s of [-1, 1]) {
        m.paintEllipsoid(s * 2.75, -1.4, 2.2, 1.15, 1.85, 1.45, mat('frog'), partId.frog, true);
        m.paintCapsule(s * 2.2, 1.8, 2.2, s * 2.5, 3.2, 1.2, 0.72, 0.62, mat('frog'), partId.frog, true);
      }
    }

    // 头顶一对高辨识度大凸眼基座
    const eyeBaseY = isLeap ? 2.6 : 1.6;
    const eyeBaseZ = isLeap ? 6.2 : 5.4;
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 1.65, eyeBaseY, eyeBaseZ, 1.15, 1.15, 1.25, mat('frog'), partId.frog, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 凸眼黑瞳 + 虹膜 + 白点（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const ey = Math.round(hd + eyeBaseY + 0.9);
    const ez = Math.round(eyeBaseZ);
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.7);
      m.setRaw(ex, ey, ez,     keyToId.eyeIris,  partId.eye);
      m.setRaw(ex, ey, ez + 1, keyToId.eyeDark,  partId.eye);
      m.setRaw(ex - s, ey, ez + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 8, centerZ: 4 });
  }

  // 3 片浮萍叶相对泥潭中心的排布（安全外距 >= 15 格，绝不与牛犊穿模）
  const POND_PADS = [
    { key: 'lilyMain',  lx:  15.5, ly:  11.0, yaw:  0.45, phase: 0.0, hasFrog: true  },
    { key: 'lilyBud',   lx: -16.5, ly:   9.5, yaw: -1.10, phase: 1.8, hasFrog: false },
    { key: 'lilySmall', lx:  11.5, ly: -14.5, yaw:  2.25, phase: 3.4, hasFrog: false }
  ];

  const Marsh1Def = {
    id: 'marsh1_camahueto',
    code: '泽1',
    name: '泽1 · 破土独角牛犊',
    status: 'done',
    tag: '潜泥破土双态 · 浮萍泥蛙',
    summary: 'v3 精制：智利 Camahueto 独角牛犊，青灰壮躯 + 额中三档青碧玉角 + 沾泥宽蹄四足 IK + 浮萍泥蛙潜泥破土冲刺自循环',
    defaultHabitat: 'swamp',
    footRadius: 11.2,
    ecoWeight: 1.35,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: ['青碧玉质独角焦点', '潜泥半潜/破泥跃出双态', '四足弯膝 IK 冲刺水沟', '甩头弹簧抖落泥点', '浮萍叶与泥潭小青蛙交互'],
    soulHabit: '潜伏泥潭仅露青碧独角冒泥泡 -> 青角高频震动吓得浮萍小青蛙跃水 -> 破泥跃出绕泽疾驰留水沟 -> 停步甩头抖泥后回潜泥潭',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torsoCalm:  buildTorso(makeCanvas, 'calm'),
        torsoSurge: buildTorso(makeCanvas, 'surge'),
        headNormal: buildHead(makeCanvas, 'normal'),
        headCharge: buildHead(makeCanvas, 'charge'),
        limbThigh:  buildLimbSeg(makeCanvas, 2.45, 2.10, 5.4, false),
        limbKnee:   buildLimbSeg(makeCanvas, 2.00, 1.88, 4.0, false),
        limbShin:   buildLimbSeg(makeCanvas, 1.80, 1.70, 5.0, true),
        hoof:       buildMudHoof(makeCanvas),
        tailBase:   buildTailSeg(makeCanvas, 1.15, 3.4, false),
        tailMid:    buildTailSeg(makeCanvas, 0.95, 3.2, false),
        tailTuft:   buildTailSeg(makeCanvas, 1.35, 3.8, true),
        lilyMain:   buildLilypad(makeCanvas, 5.8, false),
        lilyBud:    buildLilypad(makeCanvas, 5.2, true),
        lilySmall:  buildLilypad(makeCanvas, 4.0, false),
        frogCalm:   buildMudFrog(makeCanvas, 'calm'),
        frogPuff:   buildMudFrog(makeCanvas, 'puff'),
        frogLeap:   buildMudFrog(makeCanvas, 'leap')
      };

      // 四足弯膝 IK 步态器（髋点深嵌躯干内部 ±5.4；冲刺切 bound 腾跃奔跑，返回切 walk4 四拍稳走）
      const gait = new MultiLegGaitSolver([
        { id: 'FL', hipX: -5.4, hipY:  5.6, hipZ: 3.2, restX: -6.5, restY:  6.2, group: 0, L1: 5.6, L2: 5.8, kneeSign: -1 },
        { id: 'FR', hipX:  5.4, hipY:  5.6, hipZ: 3.2, restX:  6.5, restY:  6.2, group: 1, L1: 5.6, L2: 5.8, kneeSign: -1 },
        { id: 'BL', hipX: -5.5, hipY: -6.0, hipZ: 3.2, restX: -6.6, restY: -5.8, group: 1, L1: 5.6, L2: 5.8, kneeSign:  1 },
        { id: 'BR', hipX:  5.5, hipY: -6.0, hipZ: 3.2, restX:  6.6, restY: -5.8, group: 0, L1: 5.6, L2: 5.8, kneeSign:  1 }
      ], {
        mode: 'walk4',
        stepThreshold: 4.1,
        stepDuration: 0.22,
        stepHeight: 2.8,
        strideAnticipation: 0.54
      });

      const tailChain = new ChainSolver(3, 3.1, {
        maxAngle: 0.58,
        waveFreq: 5.2,
        wavePhaseStep: 0.72,
        waveAmp: 0.34
      });

      const headYawSpring = new SpringDamper1D(0, 125, 7.6);
      const bodyLiftSpring = new SpringDamper1D(8.2, 86, 8.0);
      const padRecoilSpring = new SpringDamper1D(0, 95, 5.8);

      // 浮萍叶与小青蛙独立生态状态
      const pond = {
        cx: opts.homeX ?? 0,
        cy: opts.homeY ?? 0,
        pads: POND_PADS.map((p) => ({ ...p, x: (opts.homeX ?? 0) + p.lx, y: (opts.homeY ?? 0) + p.ly, z: 1.5 }))
      };

      const frog = {
        mode: 'sit', // 'sit' | 'dive' | 'under' | 'climb'
        x: pond.pads[0].x,
        y: pond.pads[0].y,
        z: 3.4,
        yaw: 0,
        pose: 'calm',
        timer: 0,
        startX: 0, startY: 0,
        endX: 0, endY: 0,
        splashed: false
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 8.2,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        cycleTimer: opts.seed ? (opts.seed % 14.4) : 0.4,
        phaseName: 'submerge', // 'submerge' | 'vibrate' | 'emerge' | 'dash' | 'shake' | 'return'
        submergeAmt: 0.85,
        torsoPose: 'calm',
        headPose: 'normal',
        hornVib: 0,
        dashStartAng: 0,
        dashDir: 1,
        dashRadius: 20,
        emergeFired: false,
        frogJumpFired: false,
        shakeFired: false,
        bubbleCd: 0,
        wakeCd: 0,
        mudFlingCd: 0,
        tiltX: 0,
        tiltY: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function syncPondPositions(cx, cy, sMul, time) {
        pond.cx = cx;
        pond.cy = cy;
        for (let i = 0; i < pond.pads.length; i++) {
          const p = pond.pads[i];
          const driftX = Math.sin(time * 0.55 + p.phase) * 0.65 * sMul;
          const driftY = Math.cos(time * 0.48 + p.phase) * 0.55 * sMul;
          p.x = cx + p.lx * sMul + driftX;
          p.y = cy + p.ly * sMul + driftY;
          const recoil = i === 0 ? padRecoilSpring.x * sMul : 0;
          p.z = (1.55 + Math.sin(time * 1.9 + p.phase) * 0.24) * sMul + recoil;
        }
      }

      const instance = {
        def: Marsh1Def,
        cachePrefix: `marsh1_cm_${Math.random().toString(36).slice(2, 7)}`,
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
          state.z = 2.0;
          state.vx = 0;
          state.vy = 0;
          state.cycleTimer = 0.4;
          state.phaseName = 'submerge';
          state.submergeAmt = 0.85;
          state.torsoPose = 'calm';
          state.headPose = 'normal';
          state.hornVib = 0;
          state.emergeFired = false;
          state.frogJumpFired = false;
          state.shakeFired = false;
          headYawSpring.x = headYawSpring.v = 0;
          bodyLiftSpring.x = 2.0; bodyLiftSpring.v = 0;
          padRecoilSpring.x = padRecoilSpring.v = 0;

          syncPondPositions(homeX, homeY, 1.0, 0);
          frog.mode = 'sit';
          frog.x = pond.pads[0].x;
          frog.y = pond.pads[0].y;
          frog.z = pond.pads[0].z + 1.8;
          frog.pose = 'calm';
          frog.splashed = false;

          gait.reset(state.x, state.y, state.yaw);
          const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw, 0, -10.5);
          tailChain.reset(tx, ty, state.z + 7.2, state.yaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const isIdle = !!(eco && (eco.action === 'idle' || eco.patrol === false));
          const hx = (eco && eco.homeX) || 0;
          const hy = (eco && eco.homeY) || 0;
          const hyaw = (eco && eco.homeYaw) || 0;
          const fxCol = curSkin.fx || SKINS[0].fx;

          // -----------------------------------------------------------------
          // 1. 完整 14.4s 生态循环（待机与巡游双态通用，节奏紧凑易观赏）
          //    0.0 -  4.8s : submerge 潜泥蓄水（半潜露青角、冒泥泡水汽、小青蛙好奇鼓鳃张望）
          //    4.8 -  6.4s : vibrate  破泥惊蛙（青角高频震动、小青蛙受惊跃离浮萍扎水）
          //    6.4 -  7.3s : emerge   破泥跃出（昂身破泥、泥花水花四溅）
          //    7.3 - 10.7s : dash     沼泽疾驰（四足 IK 绕泽冲刺半圈、留清晰水沟尾迹）
          //   10.7 - 12.3s : shake    停步甩头（高弹性甩头抖落泥点与水花）
          //   12.3 - 14.4s : return   缓步回潭（走回泥潭重新下潜、小青蛙爬回浮萍叶）
          // -----------------------------------------------------------------
          const CYCLE = 14.4;
          const prevT = state.cycleTimer;
          state.cycleTimer = (state.cycleTimer + dt * (0.75 + spdMul * 0.25)) % CYCLE;
          const ct = state.cycleTimer;

          if (ct < prevT) {
            state.emergeFired = false;
            state.frogJumpFired = false;
            state.shakeFired = false;
            state.dashDir = -state.dashDir;
          }

          if (ct < 4.8) state.phaseName = 'submerge';
          else if (ct < 6.4) state.phaseName = 'vibrate';
          else if (ct < 7.3) state.phaseName = 'emerge';
          else if (ct < 10.7) state.phaseName = 'dash';
          else if (ct < 12.3) state.phaseName = 'shake';
          else state.phaseName = 'return';

          // 泥潭中心在待机与巡游时均稳居 home 附近，保证浮萍叶不瞬移
          syncPondPositions(hx, hy, sMul, time);
          padRecoilSpring.update(dt, 0, 95 * sp, clamp(5.8 * dScale, 2.6, 10.5));

          let targetLift = 8.0 * sMul;
          let targetSub = 0.0;
          let targetHeadYaw = Math.sin(time * 1.4) * 0.14;
          let moveTargetX = state.x;
          let moveTargetY = state.y;
          let desiredYaw = state.yaw;
          let moveSpeed = 0;

          if (state.phaseName === 'submerge') {
            const sinkU = smoothstep(0.0, 0.9, ct);
            targetLift = lerp(4.2, 1.5, sinkU) * sMul + Math.sin(time * 2.1) * 0.28 * sMul;
            targetSub = lerp(0.55, 0.90, sinkU);
            state.torsoPose = 'calm';
            state.headPose = 'normal';
            state.hornVib = 0;

            // 潜泥时稳在泥潭中心略偏一侧，朝向浮萍小青蛙附近
            moveTargetX = hx;
            moveTargetY = hy;
            desiredYaw = wrapAngle(hyaw + Math.sin(time * 0.45) * 0.18);
            const kHold = expSmooth(dt, 4.5);
            state.vx = (moveTargetX - state.x) * 3.0;
            state.vy = (moveTargetY - state.y) * 3.0;
            state.x = lerp(state.x, moveTargetX, kHold);
            state.y = lerp(state.y, moveTargetY, kHold);
            state.yaw = wrapAngle(state.yaw + wrapAngle(desiredYaw - state.yaw) * expSmooth(dt, 3.6));

            // 独角周围持续冒出泥泡与水汽环
            state.bubbleCd -= dt;
            if (state.bubbleCd <= 0 && vfx) {
              state.bubbleCd = 0.34;
              const hSock = sockets.get('hornTip');
              const ang = Math.random() * TAU;
              const rad = (2.8 + Math.random() * 4.5) * sMul;
              const bx = state.x + Math.cos(ang) * rad;
              const by = state.y + Math.sin(ang) * rad;
              vfx.addRipple(bx, by, 1.4, 8.5 * sMul, 0.65, 1.1);
              vfx.spawnParticle(
                hSock.x + (Math.random() - 0.5) * 2.4 * sMul,
                hSock.y + (Math.random() - 0.5) * 2.4 * sMul,
                Math.max(4 * sMul, hSock.z - 2 * sMul),
                (Math.random() - 0.5) * 3.2 * sMul,
                (Math.random() - 0.5) * 3.2 * sMul,
                (5.5 + Math.random() * 4.0) * sMul,
                0.55, 1.15, fxCol.mist, true, 0
              );
            }
          } else if (state.phaseName === 'vibrate') {
            const vibU = clamp((ct - 4.8) / 1.6, 0, 1);
            targetLift = lerp(1.5, 3.4, vibU) * sMul;
            targetSub = lerp(0.90, 0.72, vibU);
            state.torsoPose = 'calm';
            state.headPose = 'charge';
            state.hornVib = (0.55 + vibU * 1.15) * sMul;
            targetHeadYaw = Math.sin(time * 42.0) * 0.16 * (0.4 + vibU * 0.6);

            state.vx *= 0.85;
            state.vy *= 0.85;

            // 高频水汽环与泥泡加速翻涌
            state.bubbleCd -= dt;
            if (state.bubbleCd <= 0 && vfx) {
              state.bubbleCd = 0.14;
              const hSock = sockets.get('hornTip');
              vfx.addRipple(state.x, state.y, 3.0, (14 + vibU * 8) * sMul, 0.48, 1.6);
              for (let k = 0; k < 2; k++) {
                const a = Math.random() * TAU;
                vfx.spawnParticle(
                  hSock.x + Math.cos(a) * 1.8 * sMul,
                  hSock.y + Math.sin(a) * 1.8 * sMul,
                  hSock.z,
                  Math.cos(a) * 9.0 * sMul, Math.sin(a) * 9.0 * sMul, (7.0 + Math.random() * 5.0) * sMul,
                  0.42, 1.30, k === 0 ? fxCol.mist : fxCol.spray, true, 0
                );
              }
            }

            // 5.4s 时吓得浮萍上的小青蛙“扑通”跃水
            if (ct >= 5.35 && !state.frogJumpFired) {
              state.frogJumpFired = true;
              frog.mode = 'dive';
              frog.timer = 0;
              frog.startX = frog.x;
              frog.startY = frog.y;
              const outAng = Math.atan2(frog.y - state.y, frog.x - state.x) + 0.25;
              frog.endX = frog.x + Math.cos(outAng) * 9.5 * sMul;
              frog.endY = frog.y + Math.sin(outAng) * 9.5 * sMul;
              frog.yaw = wrapAngle(Math.atan2(-(frog.endX - frog.startX), frog.endY - frog.startY));
              frog.splashed = false;
              padRecoilSpring.impulse(-12.0 * sp);
            }
          } else if (state.phaseName === 'emerge') {
            const emU = clamp((ct - 6.4) / 0.9, 0, 1);
            // 破泥昂身跃出再稳稳落地
            const hopArc = Math.sin(emU * Math.PI) * 7.2 * sMul;
            targetLift = lerp(3.4, 8.2, smoothstep(0, 0.65, emU)) * sMul + hopArc;
            targetSub = lerp(0.72, 0.0, smoothstep(0, 0.55, emU));
            state.torsoPose = 'surge';
            state.headPose = 'charge';
            state.hornVib = 0;

            if (!state.emergeFired) {
              state.emergeFired = true;
              bodyLiftSpring.impulse(34.0 * sp * sMul);
              state.dashStartAng = Math.atan2(state.y - hy, state.x - hx);
              if (Math.hypot(state.x - hx, state.y - hy) < 2) {
                // 避开主浮萍方向起步，向开阔泥潭弧线冲出
                state.dashStartAng = -Math.PI * 0.72;
              }
              state.dashRadius = (isIdle ? 18.5 : 30.0) * sMul;

              if (vfx) {
                vfx.addRipple(state.x, state.y, 4.5, 28 * sMul, 0.75, 2.4);
                if (habitat && habitat.isWater) {
                  vfx.spawnSplash(state.x, state.y, 12, 1.35 * sMul, habitat.fx);
                }
                for (let k = 0; k < 12; k++) {
                  const a = (k / 12) * TAU + Math.random() * 0.35;
                  const spd = (10 + Math.random() * 14) * sMul;
                  const vz = (11 + Math.random() * 11) * sMul;
                  vfx.spawnParticle(
                    state.x + Math.cos(a) * 5.0 * sMul,
                    state.y + Math.sin(a) * 5.0 * sMul,
                    3.2 * sMul,
                    Math.cos(a) * spd, Math.sin(a) * spd, vz,
                    0.58 + Math.random() * 0.25, 1.55,
                    k % 3 === 0 ? fxCol.spray : fxCol.mud, false, 28
                  );
                }
              }
            }
          } else if (state.phaseName === 'dash') {
            const du = clamp((ct - 7.3) / 3.4, 0, 1);
            targetLift = 8.2 * sMul + Math.abs(Math.sin(time * 10.5 * freq)) * 1.15 * sMul;
            targetSub = 0.08;
            state.torsoPose = 'surge';
            state.headPose = du < 0.75 ? 'charge' : 'normal';
            state.hornVib = 0;

            // 沿沼泽绕半圈（~1.15 PI 弧度）疾驰，避开浮萍叶位置，保证轨迹舒展流畅
            const sweepAng = state.dashStartAng + state.dashDir * smoothstep(0, 1, du) * Math.PI * 1.18;
            const rCur = state.dashRadius * (0.78 + Math.sin(du * Math.PI) * 0.30);
            moveTargetX = hx + Math.cos(sweepAng) * rCur + ((eco && eco.avoidX) || 0) * 0.35;
            moveTargetY = hy + Math.sin(sweepAng) * rCur + ((eco && eco.avoidY) || 0) * 0.35;

            const dx = moveTargetX - state.x;
            const dy = moveTargetY - state.y;
            const dist = Math.hypot(dx, dy);
            if (dist > 0.8) {
              desiredYaw = Math.atan2(-dx, dy);
              state.yaw = wrapAngle(state.yaw + wrapAngle(desiredYaw - state.yaw) * expSmooth(dt, 9.5));
            }
            const fwdX = -Math.sin(state.yaw);
            const fwdY =  Math.cos(state.yaw);
            const dashEnv = smoothstep(0.0, 0.14, du) * (1 - smoothstep(0.84, 1.0, du) * 0.55);
            moveSpeed = (isIdle ? 24.0 : 34.0) * spdMul * dashEnv * sMul;
            state.vx = lerp(state.vx, fwdX * moveSpeed, expSmooth(dt, 9.0));
            state.vy = lerp(state.vy, fwdY * moveSpeed, expSmooth(dt, 9.0));
            state.x += state.vx * dt;
            state.y += state.vy * dt;

            // 背后留下清晰水沟尾迹 + 泥水飞溅
            state.wakeCd -= dt;
            if (state.wakeCd <= 0 && vfx) {
              state.wakeCd = 0.095;
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, 0, -9.5 * sMul);
              if (habitat && habitat.isWater) {
                vfx.addWake(wx, wy, state.yaw, 9.8 * sMul, 1.25);
                vfx.addRipple(wx, wy, 2.2, 14.0 * sMul, 0.55, 1.5);
              }
              vfx.spawnParticle(
                wx + (Math.random() - 0.5) * 4.5 * sMul,
                wy + (Math.random() - 0.5) * 4.5 * sMul,
                2.0 * sMul,
                -state.vx * 0.25 + (Math.random() - 0.5) * 6 * sMul,
                -state.vy * 0.25 + (Math.random() - 0.5) * 6 * sMul,
                (6.5 + Math.random() * 5.0) * sMul,
                0.44, 1.35, Math.random() < 0.55 ? fxCol.spray : fxCol.mud, false, 24
              );
            }
          } else if (state.phaseName === 'shake') {
            const su = clamp((ct - 10.7) / 1.6, 0, 1);
            targetLift = 8.0 * sMul;
            targetSub = 0.06;
            state.torsoPose = 'calm';
            state.headPose = 'normal';
            state.hornVib = 0;

            state.vx = lerp(state.vx, 0, expSmooth(dt, 9.0));
            state.vy = lerp(state.vy, 0, expSmooth(dt, 9.0));
            state.x += state.vx * dt;
            state.y += state.vy * dt;

            // 高弹性左右甩头抖落泥点与水花
            const shakeEnv = smoothstep(0.05, 0.20, su) * (1 - smoothstep(0.75, 0.96, su));
            targetHeadYaw = Math.sin((ct - 10.7) * 22.0) * 0.62 * shakeEnv;
            if (!state.shakeFired && su > 0.12) {
              state.shakeFired = true;
              headYawSpring.impulse(9.5 * sp);
            }
            state.mudFlingCd -= dt;
            if (shakeEnv > 0.35 && state.mudFlingCd <= 0 && vfx) {
              state.mudFlingCd = 0.09;
              const hSock = sockets.get('hornTip');
              const side = Math.sin((ct - 10.7) * 22.0) >= 0 ? 1 : -1;
              const [fxv, fyv] = localToWorldXY(0, 0, state.yaw, side * (12 + Math.random() * 8) * sMul, (2 + Math.random() * 4) * sMul);
              vfx.spawnParticle(
                hSock.x, hSock.y, hSock.z - 3.5 * sMul,
                fxv, fyv, (4.5 + Math.random() * 5.5) * sMul,
                0.48, 1.35, Math.random() < 0.6 ? fxCol.mud : fxCol.spray, false, 26
              );
            }
          } else {
            // return：四拍沉稳走回浅泥潭并开始重新下潜（先对准再迈步）
            const ru = clamp((ct - 12.3) / 2.1, 0, 1);
            state.torsoPose = 'calm';
            state.headPose = 'normal';
            state.hornVib = 0;

            Propulsion.walkToPoint(state, hx, hy, dt, params, {
              arriveDist: 2.2 * sMul,
              maxSpeed: 15.0 * sMul,
              maxTurn: 4.0,
              aimYaw: hyaw
            });
            const reSink = smoothstep(0.62, 1.0, ru);
            targetLift = lerp(8.0, 4.2, reSink) * sMul;
            targetSub = lerp(0.06, 0.55, reSink);
          }

          // 安全软边界
          const maxR = (eco && eco.maxRadius) || 48;
          const curD = Math.hypot(state.x, state.y);
          if (curD > maxR) {
            state.x *= maxR / curD;
            state.y *= maxR / curD;
          }

          // 弹簧平滑更新身体高度、浸水深度与头部转角
          state.z = bodyLiftSpring.update(dt, targetLift, 86 * sp, clamp(8.0 * dScale, 3.6, 12.5));
          state.submergeAmt = lerp(state.submergeAmt, targetSub, expSmooth(dt, 7.5));
          headYawSpring.update(dt, targetHeadYaw, 125 * sp, clamp(7.4 * dScale, 3.2, 12.0));

          // -----------------------------------------------------------------
          // 2. 四足弯膝 IK（冲刺切 bound 前后腾跃奔跑，其余切 walk4 四拍稳走）
          // -----------------------------------------------------------------
          const isDashing = state.phaseName === 'dash';
          const gaitRes = gait.update(dt, state.x, state.y, Math.max(2.0 * sMul, state.z), state.yaw, state.vx, state.vy, {
            mode: isDashing ? 'bound' : 'walk4',
            scaleMul: sMul,
            stepFreq: freq * (isDashing ? 1.48 : 0.98),
            stepHeight: (isDashing ? 3.1 : 2.1) * sMul * (0.75 + flex * 0.25),
            stepThreshold: (isDashing ? 4.0 : 4.3) * sMul
          });
          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 1.1 * sMul, expSmooth(dt, 10));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 1.1 * sMul, expSmooth(dt, 10));

          if (gaitRes.landed.length > 0 && state.submergeAmt < 0.55 && vfx) {
            for (const leg of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, leg.footX, leg.footY, (isDashing ? 0.95 : 0.6) * sMul);
            }
          }

          instance.footContacts = state.submergeAmt < 0.55
            ? gait.legs.map((l) => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.9 * sMul }))
            : [];

          const [tailRootX, tailRootY] = localToWorldXY(state.x + state.tiltX, state.y + state.tiltY, state.yaw, 0, -10.8 * sMul);
          tailChain.update(dt, tailRootX, tailRootY, state.z + 7.2 * sMul, state.yaw, time, {
            segLen: 3.1 * sMul,
            flexibility: flex,
            waveFreq: isDashing ? 9.5 : 4.2,
            waveAmp: isDashing ? 0.55 : 0.24,
            zTargetFn: (u) => Math.max(1.2 * sMul, state.z + (7.2 - u * 4.4) * sMul)
          });

          // 挂点：青角尖端（供水汽泥泡与甩泥粒子精确生成）
          const hYawNow = wrapAngle(state.yaw + clamp(headYawSpring.x, -0.75, 0.75));
          const [hjx, hjy] = localToWorldXY(state.x, state.y, state.yaw, 0, 9.6 * sMul);
          const [hxPos, hyPos] = pivotToWorldXY(hjx, hjy, hYawNow, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          sockets.setLocal('hornTip', hxPos, hyPos, state.z + 5.0 * sMul, hYawNow, 0, 6.8, 20.0, sMul);

          // -----------------------------------------------------------------
          // 3. 浮萍泥潭小青蛙完整自循环：
          //    sit（鼓鳃呼吸、歪头看独角）-> dive（受惊跃水溅涟漪）-> under（潜藏水下）-> climb（爬回浮萍）
          // -----------------------------------------------------------------
          const mainPad = pond.pads[0];
          if (frog.mode === 'sit') {
            frog.x = mainPad.x;
            frog.y = mainPad.y;
            frog.z = mainPad.z + 1.85 * sMul;
            // 好奇地转向并微歪头看着牛犊的青碧独角
            const dxF = state.x - frog.x;
            const dyF = state.y - frog.y;
            const watchYaw = Math.atan2(-dxF, dyF) + Math.sin(time * 2.2) * 0.24;
            frog.yaw = wrapAngle(frog.yaw + wrapAngle(watchYaw - frog.yaw) * expSmooth(dt, 5.0));
            // 鼓鳃呼吸节奏（每 ~1.6s 鼓一次鳃）
            frog.pose = Math.sin(time * 3.8) > 0.25 ? 'puff' : 'calm';
          } else if (frog.mode === 'dive') {
            frog.timer += dt / 0.52;
            const u = clamp(frog.timer, 0, 1);
            frog.x = lerp(frog.startX, frog.endX, u);
            frog.y = lerp(frog.startY, frog.endY, u);
            frog.z = lerp(mainPad.z + 1.8 * sMul, 0.2 * sMul, u) + Math.sin(u * Math.PI) * 7.8 * sMul;
            frog.pose = 'leap';
            if (u >= 1) {
              frog.mode = 'under';
              frog.timer = 0;
              if (!frog.splashed && vfx) {
                frog.splashed = true;
                vfx.addRipple(frog.x, frog.y, 1.8, 15.0 * sMul, 0.68, 1.8);
                if (habitat && habitat.isWater) {
                  vfx.spawnSplash(frog.x, frog.y, 7, 0.85 * sMul, habitat.fx);
                }
              }
            }
          } else if (frog.mode === 'under') {
            frog.timer += dt;
            // 牛犊甩完头开始走回泥潭（ct >= 12.6s）时，小青蛙从水面爬回主浮萍叶
            if (state.phaseName === 'return' && ct >= 12.65) {
              frog.mode = 'climb';
              frog.timer = 0;
              frog.startX = frog.x;
              frog.startY = frog.y;
              frog.yaw = wrapAngle(Math.atan2(-(mainPad.x - frog.x), mainPad.y - frog.y));
              if (vfx) vfx.addRipple(frog.x, frog.y, 1.5, 10.0 * sMul, 0.55, 1.2);
            }
          } else if (frog.mode === 'climb') {
            frog.timer += dt / 0.62;
            const u = clamp(frog.timer, 0, 1);
            const su = smoothstep(0, 1, u);
            frog.x = lerp(frog.startX, mainPad.x, su);
            frog.y = lerp(frog.startY, mainPad.y, su);
            frog.z = lerp(0.4 * sMul, mainPad.z + 1.85 * sMul, su) + Math.sin(u * Math.PI) * 5.0 * sMul;
            frog.pose = u < 0.82 ? 'leap' : 'calm';
            if (u >= 1) {
              frog.mode = 'sit';
              frog.pose = 'calm';
              padRecoilSpring.impulse(-6.5 * sp);
            }
          }
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = habitat && habitat.isWater;
          const yw = state.yaw;
          const sub = state.submergeAmt;
          const bx = state.x + state.tiltX;
          const by = state.y + state.tiltY;
          const bz = state.z;

          // 1. 3 片漂浮立体体素圆浮萍叶
          for (let i = 0; i < pond.pads.length; i++) {
            const p = pond.pads[i];
            list.push({
              partKey: p.key,
              asset: parts[p.key],
              x: p.x,
              y: p.y,
              lift: Math.max(0.4, p.z),
              ro: p.yaw,
              bias: -0.90
            });
          }

          // 2. 泥潭小青蛙（非潜藏水下时呈现）
          if (frog.mode !== 'under') {
            const fKey = frog.pose === 'leap' ? 'frogLeap' : (frog.pose === 'puff' ? 'frogPuff' : 'frogCalm');
            list.push({
              partKey: fKey,
              asset: parts[fKey],
              x: frog.x,
              y: frog.y,
              lift: Math.max(0.5, frog.z),
              ro: frog.yaw,
              bias: -0.45,
              submerge: frog.mode === 'climb' ? 0.35 : 0
            });
          }

          // 3. 四足弯膝 IK 腿 + 沾泥宽蹄（起点深嵌躯干，高重叠无缝衔接）
          if (sub < 0.72) {
            const legSubBase = isWater ? clamp(sub * 1.15, 0, 1) : 0;
            for (const leg of gait.legs) {
              const hx = leg.hipWX + state.tiltX;
              const hy = leg.hipWY + state.tiltY;
              const samples = [
                { k: 'limbThigh', x: lerp(hx, leg.kneeX, 0.24), y: lerp(hy, leg.kneeY, 0.24), z: lerp(leg.hipWZ, leg.kneeZ, 0.24), b: -0.45, sym: 90 },
                { k: 'limbKnee',  x: leg.kneeX, y: leg.kneeY, z: leg.kneeZ, b: -0.38, sym: 90 },
                { k: 'limbShin',  x: lerp(leg.kneeX, leg.footX, 0.54), y: lerp(leg.kneeY, leg.footY, 0.54), z: lerp(leg.kneeZ, leg.footZ + 2.0 * sMul, 0.54), b: -0.32, sym: 90 },
                { k: 'hoof',      x: leg.footX, y: leg.footY, z: leg.footZ, b: -0.22, sym: 0 }
              ];
              for (const pt of samples) {
                const envSub = EnvFeedback.calcSubmerge(pt.z + 0.8, habitat ? habitat.waterLevel : 2.2, 4.2, isWater);
                const partSub = Math.max(legSubBase, envSub);
                const item = {
                  partKey: pt.k,
                  asset: parts[pt.k],
                  x: pt.x,
                  y: pt.y,
                  lift: Math.max(0, pt.z - (pt.k === 'hoof' ? 0 : 2.0 * sMul)),
                  ro: yw,
                  bias: pt.b,
                  submerge: partSub
                };
                if (pt.sym) item.symDeg = pt.sym;
                list.push(item);
              }
            }
          }

          // 4. 短壮牛尾（深潜时收没泥水，出水后随冲刺摆动）
          if (sub < 0.75) {
            const tailKeys = ['tailBase', 'tailMid', 'tailTuft'];
            for (let i = 0; i < tailChain.nodes.length; i++) {
              const nd = tailChain.nodes[i];
              list.push({
                partKey: tailKeys[i],
                asset: parts[tailKeys[i]],
                x: nd.x,
                y: nd.y,
                lift: Math.max(0.4, nd.z - 1.4 * sMul),
                ro: nd.yaw,
                symDeg: 90,
                bias: -0.28 - i * 0.04,
                submerge: isWater ? clamp(sub * 1.1, 0, 1) : 0
              });
            }
          }

          // 5. 敦实青灰牛犊主躯干（2 档无损烘焙，潜泥态由 submerge 呈现真实泥潭半潜染色）
          const tKey = state.torsoPose === 'surge' ? 'torsoSurge' : 'torsoCalm';
          const torsoSub = Math.max(
            isWater ? sub : sub * 0.45,
            EnvFeedback.calcSubmerge(bz + 1.8, habitat ? habitat.waterLevel : 2.2, 5.2, isWater)
          );
          list.push({
            partKey: tKey,
            asset: parts[tKey],
            x: bx,
            y: by,
            lift: Math.max(0.2, bz),
            ro: yw,
            bias: 0.35,
            submerge: clamp(torsoSub, 0, 1)
          });

          // 6. 独立壮牛头 + 额中青碧玉质独角（pivotToWorldXY 锁死后颈枢轴，潜泥态独角清晰露水）
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.75, 0.75));
          const vibX = state.hornVib > 0 ? Math.sin(state.cycleTimer * 78.0) * state.hornVib * 0.45 : 0;
          const vibY = state.hornVib > 0 ? Math.cos(state.cycleTimer * 64.0) * state.hornVib * 0.35 : 0;
          const [hjx, hjy] = localToWorldXY(bx, by, yw, vibX, (9.4 + vibY) * sMul);
          const [hxPos, hyPos] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const hKey = state.headPose === 'charge' ? 'headCharge' : 'headNormal';
          // 潜泥时头部略微扬起，确保青碧玉质独角完全露出泥面成为第一视觉焦点
          const headLift = Math.max(1.6 * sMul, bz + lerp(5.2, 3.6, sub) * sMul);
          list.push({
            partKey: hKey,
            asset: parts[hKey],
            x: hxPos,
            y: hyPos,
            lift: headLift,
            ro: hYaw,
            bias: 0.82,
            submerge: clamp(sub * 0.35, 0, 0.38)
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Marsh1Def.id,
            code: Marsh1Def.code,
            name: Marsh1Def.name,
            status: Marsh1Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            phaseName: state.phaseName,
            torsoPose: state.torsoPose,
            headPose: state.headPose,
            frogMode: frog.mode,
            footRadius: Marsh1Def.footRadius,
            headZ: 28,
            centerZ: 13,
            blocks: Marsh1Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map((k) => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Marsh1Def);
})(window.PixelWorkshop);
