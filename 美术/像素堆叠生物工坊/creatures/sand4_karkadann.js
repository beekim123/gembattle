'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SpringDamper3D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 沙4 · 弯角犀与斑鸠（波斯 Karkadann · v3 精制纯生态版，+Y 正前，z=0 贴地）
  //   1. 厚重披甲犀牛体格：宽肩隆背、分块铆接厚皮褶、独立厚实大头、小而悍的眼睛、
  //      粗短扇耳、带流苏短尾、4 条粗壮柱状弯膝 IK 腿；
  //   2. 标志性黑色弧形长弯角：鼻端向前上方优雅弯曲，角身雕出清晰横向年轮沟纹，
  //      角尖略向后弯形成天然落脚点；
  //   3. 待机交互物（角尖常驻立体体素斑鸠）：圆润灰褐鸟身、颈侧黑白斑点领环、
  //      小巧尾羽与独立可扇双翅，通过 SocketTracker + 平衡弹簧锁在弯角尖端；
  //   4. 完整情绪反差自循环（待机与巡游双态皆可观赏）：
  //      暴躁刨沙态（低头呼白气、交替刨沙扬尘、斑鸠晃动拍翅稳住）
  //      -> 唱歌安抚态（斑鸠挺胸张喙蹦跳鸣叫、飘出 3~4 圈暖色律动音环）
  //      -> 瞬间乖巧态（犀牛立刻收蹄站定、切换惬意眯眼头态、双耳温柔垂晃、短尾欢快摇摆）
  //      -> 停唱理羽与偶发绕角半圈飞行落回 -> 自然复位循环。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 厚皮褶基底（深岩灰）
      hideDark:        '#2d2c30',
      hideMid:         '#4b4a52',
      hideHi:          '#706f7a',
      // 分块重甲皮板（玄岩青灰）
      plateDark:       '#202229',
      plateMid:        '#383b47',
      plateHi:         '#595e70',
      // 胸腹暖岩皮
      bellyDark:       '#4f463d',
      bellyMid:        '#7a6d5f',
      bellyHi:         '#a69684',
      // 甲片铆钉与骨突
      rivetDark:       '#5e5952',
      rivetMid:        '#8f877b',
      rivetHi:         '#c2b8a8',
      // 黑色弧形长弯角主材
      hornDark:        '#111217',
      hornMid:         '#23252e',
      hornHi:          '#3d404f',
      // 弯角横向年轮沟纹
      hornRingDark:    '#323540',
      hornRingMid:     '#525666',
      hornRingHi:      '#797e91',
      // 粗蹄与角质趾甲
      hoofDark:        '#24201c',
      hoofMid:         '#473f36',
      hoofHi:          '#8c8172',
      // 扇耳内侧暖肤
      earInnerDark:    '#5c433e',
      earInnerMid:     '#8c675e',
      earInnerHi:      '#b88c80',
      // 短尾流苏簇
      tuftDark:        '#1c1a1e',
      tuftMid:         '#363238',
      tuftHi:          '#575159',
      // 眼部配色（eyeGlint 严禁进 glowKeys）
      eyeDark:         '#0e0d12',
      eyeIris:         '#e68a2e',
      eyeGlint:        '#f7fbff',
      eyeBlush:        '#c9736b',
      // 斑鸠羽色（灰褐背羽 + 暖绒胸腹 + 深灰尾羽）
      doveBodyDark:    '#57483e',
      doveBodyMid:     '#8a7465',
      doveBodyHi:      '#bfa795',
      doveBreastDark:  '#7d695e',
      doveBreastMid:   '#b59b8c',
      doveBreastHi:    '#dec9ba',
      doveTailDark:    '#38302c',
      doveTailMid:     '#5e524b',
      doveTailHi:      '#85756c',
      // 斑鸠黑白斑点领环与小喙
      doveCollarDark:  '#18161a',
      doveCollarWhite: '#f0ece4',
      doveBeak:        '#d99b38',
      // 斑鸠暖色律动音环（仅音环核心进 glowKeys）
      noteOuter:       '#e89b48',
      noteMid:         '#ffd06e',
      noteCore:        '#fff4c4'
    },
    glowKeys: ['noteOuter', 'noteMid', 'noteCore'],
    parts: [
      'hide', 'plate', 'belly', 'rivet', 'horn', 'hornRing',
      'hoof', 'earInner', 'tuft', 'eye',
      'doveBody', 'doveBreast', 'doveTail', 'doveCollar', 'doveBeak',
      'noteRing'
    ],
    noCrease: [
      ['hide', 'plate'], ['hide', 'belly'], ['plate', 'rivet'],
      ['hide', 'eye'], ['plate', 'eye'], ['hide', 'earInner'],
      ['horn', 'hornRing'], ['hide', 'horn'], ['hide', 'hoof'],
      ['doveBody', 'doveBreast'], ['doveBody', 'doveTail'],
      ['doveBody', 'doveCollar'], ['doveBody', 'doveBeak'],
      ['doveBody', 'eye'], ['doveBreast', 'doveCollar']
    ],
    materials: {
      hide:       ['hideDark',       'hideMid',       'hideHi'],
      plate:      ['plateDark',      'plateMid',      'plateHi'],
      belly:      ['bellyDark',      'bellyMid',      'bellyHi'],
      rivet:      ['rivetDark',      'rivetMid',      'rivetHi'],
      horn:       ['hornDark',       'hornMid',       'hornHi'],
      hornRing:   ['hornRingDark',   'hornRingMid',   'hornRingHi'],
      hoof:       ['hoofDark',       'hoofMid',       'hoofHi'],
      earInner:   ['earInnerDark',   'earInnerMid',   'earInnerHi'],
      tuft:       ['tuftDark',       'tuftMid',       'tuftHi'],
      doveBody:   ['doveBodyDark',   'doveBodyMid',   'doveBodyHi'],
      doveBreast: ['doveBreastDark', 'doveBreastMid', 'doveBreastHi'],
      doveTail:   ['doveTailDark',   'doveTailMid',   'doveTailHi']
    },
    protectedParts: ['eye', 'hornRing', 'rivet', 'doveCollar', 'doveBeak', 'noteRing']
  });

  // 4 套零重建模换色皮肤（含专属描边色与微粒配色）
  const SKINS = [
    {
      id: 'obsidian_horn',
      name: '玄岩黑角（戈壁经典）',
      dot: '#4b4e5c',
      outline: '#0d0e14',
      pal: {},
      fx: {
        sand:  '#d9b073',
        steam: '#f2f5f7',
        noteA: '#ffd06e',
        noteB: '#ff9e66',
        feather: '#bfa795'
      }
    },
    {
      id: 'red_sand',
      name: '赤砂厚甲（红漠款）',
      dot: '#b85432',
      outline: '#1a0c0a',
      pal: {
        hideDark:       '#4f271c', hideMid:       '#7d402d', hideHi:       '#ab5f44',
        plateDark:      '#381a14', plateMid:      '#612c20', plateHi:      '#8f4432',
        bellyDark:      '#6e4934', bellyMid:      '#a67353', bellyHi:      '#cfa07c',
        rivetDark:      '#78593c', rivetMid:      '#b58b5e', rivetHi:      '#e3bd8a',
        hornDark:       '#141012', hornMid:       '#2b2226', hornHi:       '#473a40',
        hornRingDark:   '#403133', hornRingMid:   '#695152', hornRingHi:   '#947775',
        tuftDark:       '#241412', tuftMid:       '#452722', tuftHi:       '#6b3f37',
        doveBodyDark:   '#6b4e3c', doveBodyMid:   '#a37c62', doveBodyHi:   '#d4b094',
        doveBreastDark: '#8c6e5b', doveBreastMid: '#c4a189', doveBreastHi: '#ebd0bc',
        noteOuter:      '#ff8c42', noteMid:       '#ffc857', noteCore:     '#fff5cc'
      },
      fx: {
        sand:  '#d47b4a',
        steam: '#f7ece6',
        noteA: '#ffc857',
        noteB: '#ff8c42',
        feather: '#d4b094'
      }
    },
    {
      id: 'bronze_oasis',
      name: '青铜绿洲（绿洲款）',
      dot: '#4c8577',
      outline: '#0c1714',
      pal: {
        hideDark:       '#2e3830', hideMid:       '#4d5e50', hideHi:       '#738a76',
        plateDark:      '#1e3834', plateMid:      '#326159', plateHi:      '#549184',
        bellyDark:      '#5c543e', bellyMid:      '#8f8362', bellyHi:      '#bdaf88',
        rivetDark:      '#6e572c', rivetMid:      '#ab8846', rivetHi:      '#deb96f',
        hornDark:       '#121a18', hornMid:       '#22332f', hornHi:       '#3a544e',
        hornRingDark:   '#354f48', hornRingMid:   '#577d72', hornRingHi:   '#83ab9f',
        tuftDark:       '#1b2421', tuftMid:       '#32423d', tuftHi:       '#50665f',
        doveBodyDark:   '#4c5952', doveBodyMid:   '#7a8f83', doveBodyHi:   '#acc2b4',
        doveBreastDark: '#757a6b', doveBreastMid: '#adb39f', doveBreastHi: '#dce0ce',
        noteOuter:      '#52c99e', noteMid:       '#99f0c8', noteCore:     '#e8fff4'
      },
      fx: {
        sand:  '#c9b381',
        steam: '#ebf7f2',
        noteA: '#99f0c8',
        noteB: '#ffd978',
        feather: '#acc2b4'
      }
    },
    {
      id: 'frost_plateau',
      name: '霜灰岩甲（风蚀高原款）',
      dot: '#93a2b0',
      outline: '#10141c',
      pal: {
        hideDark:       '#3e454f', hideMid:       '#656f7d', hideHi:       '#939fae',
        plateDark:      '#4c5663', plateMid:      '#7c8a9c', plateHi:      '#b4c2d4',
        bellyDark:      '#595a5e', bellyMid:      '#888a8f', bellyHi:      '#babcc2',
        rivetDark:      '#66717d', rivetMid:      '#99a8b8', rivetHi:      '#d2dfed',
        hornDark:       '#10131a', hornMid:       '#222836', hornHi:       '#3c465c',
        hornRingDark:   '#384254', hornRingMid:   '#5c6b85', hornRingHi:   '#8b9cb8',
        tuftDark:       '#252930', tuftMid:       '#434a57', tuftHi:       '#6a7485',
        doveBodyDark:   '#555c66', doveBodyMid:   '#8792a1', doveBodyHi:   '#bec8d6',
        doveBreastDark: '#7c828c', doveBreastMid: '#b3bac4', doveBreastHi: '#e3e8f0',
        noteOuter:      '#f0a65b', noteMid:       '#ffd980', noteCore:     '#fff7d6'
      },
      fx: {
        sand:  '#b8b2a6',
        steam: '#f2f7fc',
        noteA: '#ffd980',
        noteB: '#a3d4ff',
        feather: '#bec8d6'
      }
    }
  ];

  // =========================================================================
  // 1. 披甲犀牛主躯干（24×32×19，左右对称 -> 渲染器自动只烘 0~180°）
  //    宽肩隆背 + 三段铆接厚甲皮褶（肩甲 / 肋腹桶甲 / 臀甲）+ 深皮褶缝隙
  // =========================================================================
  function buildTorso(makeCanvas) {
    const W = 24, D = 32, H = 19;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-11.2, 11.2, -14.8, 14.8, 1, 18, (x, y, z, X, Y) => {
      // 宽厚肩峰 + 滚圆胸腹 + 浑厚后臀 + 粗壮颈根承接
      const dShoulder = (Math.hypot(X / 9.2, (Y - 6.2) / 7.4, (z - 10.6) / 6.9) - 1) * 6.8;
      const dBarrel   = (Math.hypot(X / 9.8, (Y + 0.6) / 8.8, (z - 9.4) / 6.5) - 1) * 7.2;
      const dRump     = (Math.hypot(X / 8.7, (Y + 8.6) / 6.4, (z - 9.8) / 6.1) - 1) * 6.2;
      const dHump     = (Math.hypot(X / 6.2, (Y - 5.2) / 5.4, (z - 14.2) / 3.8) - 1) * 4.5;
      const dNeckBase = (Math.hypot(X / 5.6, (Y - 12.2) / 3.8, (z - 10.2) / 4.8) - 1) * 4.2;
      const d = smin(smin(smin(dShoulder, dBarrel, 2.2), dRump, 2.0), smin(dHump, dNeckBase, 2.0), 2.2);
      if (d > 0) return;

      // 三段分块披甲皮褶：肩甲 (Y > 3.2)、躯干中甲 (-4.8 < Y < 2.2)、臀甲 (Y < -5.8)
      // 间隙处露深色厚皮褶，形成印度犀/波斯弯角犀标志性折甲轮廓
      const inFrontFold = Math.abs(Y - 2.8) < 0.85 && z > 4.2;
      const inRearFold  = Math.abs(Y + 5.2) < 0.85 && z > 4.2;
      const isBelly     = z < 5.4 && Math.abs(X) < 7.6;

      if (isBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (inFrontFold || inRearFold) {
        // 折甲皮褶内收一格，增强分块立体感
        if (d > -0.75) return;
        m.setRaw(x, y, z, mat('hide'), partId.hide);
      } else if (z > 5.8) {
        m.setRaw(x, y, z, mat('plate'), partId.plate);
      } else {
        m.setRaw(x, y, z, mat('hide'), partId.hide);
      }
    });

    // 凸起甲片厚边（肩甲棱、臀甲棱、背脊中棱）+ 沿甲缘铆钉骨突
    for (const s of [-1, 1]) {
      // 肩甲后缘厚褶棱
      m.paintCapsule(s * 2.2, 3.8, 16.0, s * 8.6, 3.6, 8.2, 1.35, 1.45, mat('plate'), partId.plate, true);
      // 臀甲前缘厚褶棱
      m.paintCapsule(s * 2.2, -6.2, 15.2, s * 8.4, -6.0, 8.0, 1.30, 1.40, mat('plate'), partId.plate, true);
      // 侧腹水平护裙棱
      m.paintCapsule(s * 9.0, 5.5, 6.2, s * 8.8, -8.5, 6.2, 1.25, 1.20, mat('plate'), partId.plate, true);

      // 铆钉感骨突颗粒（肩甲与臀甲各 3 颗，清晰好认不杂乱）
      const rivets = [
        [s * 7.8,  5.0, 12.2],
        [s * 8.8,  4.8,  9.2],
        [s * 7.4,  8.2, 11.4],
        [s * 8.4, -0.8, 11.8],
        [s * 8.2, -7.2, 11.6],
        [s * 7.6, -9.8,  9.4]
      ];
      for (const [rx, ry, rz] of rivets) {
        m.paintEllipsoid(rx, ry, rz, 0.92, 0.92, 0.85, mat('rivet'), partId.rivet, true);
      }
    }

    // 背脊中线粗犷骨棱
    m.paintCapsule(0, 7.6, 16.6, 0, -9.2, 15.0, 1.45, 1.25, mat('rivet'), partId.rivet, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 13.5, headZ: 24, centerZ: 10 });
  }

  // =========================================================================
  // 2. 独立厚实犀牛大头 + 黑色弧形长弯角（2 档无损烘焙：fierce 悍眼 / calm 惬意眯眼）
  //    尺寸 18×28×25，枢轴锁死在后颈根部 (0, -6.2)
  //    角尖精准定位于局部 (0, +10.2, 22.8)，供 SocketTracker 锁死斑鸠落脚点！
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -6.2 };
  const HORN_TIP_LOCAL = { x: 0, y: 10.2, z: 22.8 };

  function buildHead(makeCanvas, mood) {
    const isCalm = mood === 'calm';
    const W = 18, D = 28, H = 25;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 厚重颈环（深嵌进肩胸，转身低头绝不漏缝）
    m.paintCapsule(0, -7.2, 5.2, 0, -2.0, 6.2, 5.2, 5.0, mat('hide'), partId.hide, true);
    m.paintEllipsoid(0, -5.2, 7.8, 5.4, 2.8, 4.4, mat('plate'), partId.plate, true);

    // 宽厚方颅 + 棱角眉骨 + 粗壮长吻（典型的重甲犀牛大头）
    m.fillAABB(-7.5, 7.5, -6.0, 11.5, 1, 13, (x, y, z, X, Y) => {
      const dSkull  = (Math.hypot(X / 5.8, (Y + 1.4) / 5.4, (z - 7.0) / 4.8) - 1) * 4.8;
      const dMuzzle = (Math.hypot(X / 4.4, (Y - 5.2) / 5.0, (z - 5.8) / 3.8) - 1) * 4.2;
      const dJaw    = (Math.hypot(X / 4.2, (Y - 3.6) / 4.8, (z - 3.2) / 2.2) - 1) * 3.0;
      const d = smin(smin(dSkull, dMuzzle, 1.8), dJaw, 1.4);
      if (d > 0) return;
      const isArmorTop = z > 7.4 && Y < 5.5;
      m.setRaw(x, y, z, isArmorTop ? mat('plate') : mat('hide'), isArmorTop ? partId.plate : partId.hide);
    });

    // 凸起宽眉骨与颌角甲片
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 3.8, -1.0, 9.6, s * 4.2, 2.8, 8.8, 1.35, 1.15, mat('plate'), partId.plate, true);
      m.paintEllipsoid(s * 4.6, -2.0, 4.4, 1.4, 2.0, 1.6, mat('plate'), partId.plate, true);
    }

    // 厚实方唇 + 双侧鼻孔（呼白气来源）
    m.paintEllipsoid(0, 9.2, 4.6, 3.6, 1.8, 2.2, mat('hide'), partId.hide, true);
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (const s of [-1, 1]) {
      const nx = Math.round(hw + s * 2.2);
      const ny = Math.round(hd + 9.8);
      m.setRaw(nx, ny, 5, keyToId.eyeDark, partId.hide);
      m.setRaw(nx, ny, 6, keyToId.eyeDark, partId.hide);
    }

    // 标志性黑色弧形长弯角：从鼻端 (0, 5.8, 8.4) 向前上弧形挑出，角尖略向后弯至 (0, 10.2, 22.8)
    // 角身雕出 6 道清晰横向年轮沟纹！
    const hornPts = [
      [0,  5.6,  8.2, 2.55],
      [0,  7.6, 10.0, 2.22],
      [0,  9.5, 12.2, 1.92],
      [0, 11.0, 14.6, 1.64],
      [0, 11.8, 17.2, 1.38],
      [0, 11.7, 19.8, 1.14],
      [0, 11.0, 21.6, 0.96],
      [0, 10.2, 22.8, 0.85]
    ];
    for (let i = 0; i < hornPts.length - 1; i++) {
      const a = hornPts[i], b = hornPts[i + 1];
      m.paintCapsule(a[0], a[1], a[2], b[0], b[1], b[2], a[3], b[3], mat('horn'), partId.horn, true);
    }
    // 角根角质护座
    m.paintEllipsoid(0, 5.8, 8.2, 3.0, 2.8, 1.5, mat('rivet'), partId.rivet, true);

    // 横向年轮沟纹（沿角身自下而上 5 圈醒目灰黑年轮环）
    for (let i = 1; i <= 5; i++) {
      const p = hornPts[i];
      const rx = p[3] * 1.14;
      const ry = p[3] * 1.12;
      m.paintEllipsoid(p[0], p[1], p[2], rx, ry, 0.62, mat('hornRing'), partId.hornRing, true);
    }
    // 角尖微平落脚面，承托斑鸠双爪
    m.paintEllipsoid(HORN_TIP_LOCAL.x, HORN_TIP_LOCAL.y, HORN_TIP_LOCAL.z, 1.02, 1.02, 0.72, mat('horn'), partId.horn, true);

    m.despeckle();
    m.applyArtShading(true);

    // 独立双眼：fierce 态为小而悍的橙瞳锐眼；calm 态为惬意弯弯眯眼 + 淡暖颊晕（eyeGlint 绝不进 glowKeys）
    const eyeY = Math.round(hd + 2.4);
    const eyeZ = 7;
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 6; step++) {
        const tx = Math.round(hw + s * (6.4 - step));
        const p = m.getPartId(tx, eyeY, eyeZ);
        if (p === partId.hide || p === partId.plate) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 4.4);

      if (isCalm) {
        // 惬意弯弯眯眼（弧形闭眼线条 + 眼下一点暖腮红，情绪反差一眼拉满）
        m.setRaw(sx, eyeY - 1, eyeZ,     keyToId.eyeDark,  partId.eye);
        m.setRaw(sx, eyeY,     eyeZ + 1, keyToId.eyeDark,  partId.eye);
        m.setRaw(sx, eyeY + 1, eyeZ,     keyToId.eyeDark,  partId.eye);
        m.setRaw(sx, eyeY,     eyeZ - 1, keyToId.eyeBlush, partId.eye);
      } else {
        // 小而悍的犀牛锐眼（2×2：琥珀虹膜 + 黑瞳 + 右上清晰白点）
        m.setRaw(sx, eyeY - 1, eyeZ,     keyToId.eyeIris,  partId.eye);
        m.setRaw(sx, eyeY,     eyeZ,     keyToId.eyeDark,  partId.eye);
        m.setRaw(sx, eyeY - 1, eyeZ + 1, keyToId.eyeDark,  partId.eye);
        m.setRaw(sx, eyeY,     eyeZ + 1, keyToId.eyeGlint, partId.eye);
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 6.5, headZ: 24, centerZ: 10 });
  }

  // =========================================================================
  // 3. 独立粗短扇耳（8×8×9，枢轴在耳根 (0, 0)）与带流苏短尾（8×12×10）
  // =========================================================================
  const EAR_PIVOT = { x: 0, y: 0 };
  function buildEar(makeCanvas) {
    const m = new VoxelModel(8, 8, 9, SPEC);
    const { mat, partId } = SPEC;
    // 外耳廓（略向后上方张开的厚实扇形耳）
    m.paintCapsule(0, 0, 1.4, 0, -0.8, 6.2, 1.6, 2.2, mat('hide'), partId.hide, true);
    m.paintEllipsoid(0, -1.0, 5.2, 2.4, 1.4, 2.6, mat('plate'), partId.plate, true);
    // 暖色耳窝（朝前 +Y）
    m.paintEllipsoid(0, 0.3, 4.8, 1.5, 0.9, 1.8, mat('earInner'), partId.earInner, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.4 });
  }

  const TAIL_PIVOT = { x: 0, y: 3.4 };
  function buildTail(makeCanvas) {
    const m = new VoxelModel(8, 12, 10, SPEC);
    const { mat, partId } = SPEC;
    // 短粗犀牛尾干（从尾根 (0, 3.4, 7.6) 向后下方垂出）
    m.paintCapsule(0, 3.4, 7.6, 0, -1.6, 4.2, 1.55, 1.05, mat('hide'), partId.hide, true);
    // 尾端蓬松深色流苏簇
    m.paintCapsule(0, -1.6, 4.2, 0, -3.6, 1.6, 1.45, 1.75, mat('tuft'), partId.tuft, true);
    m.paintEllipsoid(0, -3.8, 1.6, 1.85, 1.55, 1.45, mat('tuft'), partId.tuft, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.6 });
  }

  // =========================================================================
  // 4. 4 条粗壮柱状弯膝 IK 腿（大腿护甲段 / 膝关节 / 柱状小腿 / 三趾重蹄，高重叠无缝衔接）
  // =========================================================================
  function buildLegSeg(makeCanvas, rTop, rBot, hLen, armored) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 4);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.1, 0, 0, H - 1.1, rBot, rTop, mat('hide'), partId.hide, true);
    if (armored) {
      m.paintEllipsoid(0, 0.2, H - 2.2, rTop * 1.12, rTop * 1.12, 1.9, mat('plate'), partId.plate, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildHoof(makeCanvas) {
    const m = new VoxelModel(10, 11, 6, SPEC);
    const { mat, partId } = SPEC;
    // 粗壮圆柱脚踝 + 宽厚蹄底
    m.paintCapsule(0, -0.4, 1.2, 0, -0.2, 4.6, 3.1, 2.7, mat('hide'), partId.hide, true);
    m.paintEllipsoid(0, 0.2, 1.6, 3.3, 3.5, 1.4, mat('hoof'), partId.hoof, true);
    // 犀牛标志性前方 3 枚粗壮钝趾甲
    for (const tx of [-1.9, 0, 1.9]) {
      const ty = tx === 0 ? 3.2 : 2.5;
      m.paintEllipsoid(tx, ty, 1.2, 1.05, 1.25, 1.05, mat('rivet'), partId.rivet, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4 });
  }

  // =========================================================================
  // 5. 待机交互物：立体体素灰褐斑鸠（圆润鸟身 + 颈侧黑白斑点领环 + 尾羽 + 独立双翅）
  //    2 档无损烘焙：normal 栖息理羽 / sing 挺胸抬头张喙鸣叫
  // =========================================================================
  function buildDoveBody(makeCanvas, pose) {
    const isSing = pose === 'sing';
    const W = 10, D = 13, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 圆润灰褐鸟身 + 饱满暖绒小胸脯（唱歌态胸脯挺起、头更昂扬）
    const chestY = isSing ? 1.8 : 1.0;
    const chestZ = isSing ? 4.4 : 3.8;
    m.paintEllipsoid(0, -0.4, 3.8, 2.9, 3.4, 2.6, mat('doveBody'), partId.doveBody, true);
    m.paintEllipsoid(0, chestY, chestZ, 2.5, 2.6, isSing ? 2.6 : 2.1, mat('doveBreast'), partId.doveBreast, true);

    // 小巧翘尾羽（朝 -Y 伸出）
    m.paintCapsule(0, -2.8, 3.6, 0, -5.6, 2.6, 1.35, 0.85, mat('doveTail'), partId.doveTail, true);

    // 头部与颈部
    const headY = isSing ? 2.2 : 2.4;
    const headZ = isSing ? 7.6 : 6.7;
    m.paintCapsule(0, 1.4, 4.8, 0, headY, headZ - 0.6, 1.9, 1.85, mat('doveBody'), partId.doveBody, true);
    m.paintEllipsoid(0, headY, headZ, 2.05, 2.15, 1.95, mat('doveBody'), partId.doveBody, true);

    // 颈侧标志性黑白斑点领环（珠颈斑鸠特征，左右对称清晰点缀）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const colZ = isSing ? 6 : 5;
    for (const s of [-1, 1]) {
      const cx = Math.round(hw + s * 1.9);
      const cy = Math.round(hd + 1.4);
      m.setRaw(cx, cy - 1, colZ,     keyToId.doveCollarDark,  partId.doveCollar);
      m.setRaw(cx, cy,     colZ,     keyToId.doveCollarWhite, partId.doveCollar);
      m.setRaw(cx, cy + 1, colZ,     keyToId.doveCollarDark,  partId.doveCollar);
      m.setRaw(cx, cy,     colZ + 1, keyToId.doveCollarDark,  partId.doveCollar);
      m.setRaw(cx, cy - 1, colZ + 1, keyToId.doveCollarWhite, partId.doveCollar);
    }

    // 小喙（唱歌态抬头微张上下喙）
    if (isSing) {
      m.paintCapsule(0, headY + 1.8, headZ + 0.5, 0, headY + 3.6, headZ + 1.2, 0.68, 0.35, keyToId.doveBeak, partId.doveBeak, true);
      m.paintCapsule(0, headY + 1.7, headZ - 0.4, 0, headY + 3.1, headZ - 0.7, 0.60, 0.32, keyToId.doveBeak, partId.doveBeak, true);
    } else {
      m.paintCapsule(0, headY + 1.8, headZ - 0.1, 0, headY + 3.5, headZ - 0.3, 0.72, 0.35, keyToId.doveBeak, partId.doveBeak, true);
    }

    // 细小栖息鸟爪（z=0..1，稳稳扣住弯角尖）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 0.9, 0.2, 0.6, s * 0.9, 0.4, 2.0, 0.55, 0.55, keyToId.doveBeak, partId.doveBeak, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 斑鸠小巧圆眼（eyeGlint 不进 glowKeys）
    const ey = Math.round(hd + headY + 0.9);
    const ez = Math.round(headZ + 0.2);
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.9);
      m.setRaw(ex, ey,     ez,     keyToId.eyeDark,  partId.eye);
      m.setRaw(ex, ey + 1, ez + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 10, centerZ: 5 });
  }

  // 独立斑鸠翅膀（2 档无损烘焙：folded 收拢贴身 / spread 展翅拍打）
  const WING_PIVOT = { x: 0, y: 0.6 };
  function buildDoveWing(makeCanvas, spread) {
    const W = 9, D = 9, H = 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    if (spread) {
      // 向外展翅羽片（用于晃动稳住平衡、唱歌轻拍、绕角飞行）
      m.paintCapsule(0, 0.4, 2.6, 3.2, -1.6, 3.4, 1.15, 0.85, mat('doveBody'), partId.doveBody, true);
      m.paintCapsule(1.4, -0.4, 2.5, 3.8, -2.8, 2.8, 0.95, 0.65, mat('doveTail'), partId.doveTail, true);
    } else {
      // 柔和贴身收拢翼片
      m.paintEllipsoid(0.6, -0.8, 2.4, 1.15, 2.6, 1.45, mat('doveBody'), partId.doveBody, true);
      m.paintEllipsoid(0.7, -2.4, 2.1, 0.85, 1.4, 1.05, mat('doveTail'), partId.doveTail, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2 });
  }

  // =========================================================================
  // 6. 斑鸠暖色律动音环（2 档大小，立体镂空像素环，带柔和暖色自亮）
  // =========================================================================
  function buildNoteRing(makeCanvas, radius) {
    const S = Math.ceil(radius * 2 + 4);
    const m = new VoxelModel(S, S, 3, SPEC);
    const { partId, keyToId } = SPEC;
    m.fillAABB(-radius - 1, radius + 1, -radius - 1, radius + 1, 0, 2, (x, y, z, X, Y) => {
      if (z !== 1) return;
      const r = Math.hypot(X, Y);
      if (Math.abs(r - radius) <= 0.78) {
        const ang = Math.atan2(Y, X);
        const kId = Math.abs(Math.sin(ang * 2)) > 0.65 ? keyToId.noteCore : (Math.abs(r - radius) < 0.38 ? keyToId.noteMid : keyToId.noteOuter);
        m.setRaw(x, y, z, kId, partId.noteRing);
      }
    });
    return m.toStripAsset(makeCanvas, { footRadius: radius });
  }

  const Sand4Def = {
    id: 'sand4_karkadann',
    code: '沙4',
    status: 'done',
    name: '沙4 · 弯角犀与斑鸠',
    tag: '披甲重犀 · 角尖斑鸠安抚',
    summary: 'v3 精制：厚甲铆接犀牛 + 年轮黑弯角 + 4 足弯膝 IK + 角尖立体灰褐斑鸠，暴躁刨沙呼白气被斑鸠歌声暖环瞬间安抚成眯眼摇耳乖巧态',
    defaultHabitat: 'desert',
    footRadius: 14.5,
    ecoWeight: 2.1,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '分块铆接厚甲犀牛躯干',
      '年轮沟纹黑色长弯角',
      '悍眼/眯眼无损换态大头',
      '4 足柱状弯膝 IK 与刨沙',
      '角尖立体斑鸠与音环安抚循环'
    ],
    soulHabit: '暴躁低头呼白气交替刨沙 -> 角尖斑鸠挺胸唱出暖色音环 -> 犀牛瞬间收蹄眯眼垂耳摇尾变乖巧 -> 斑鸠理羽绕角飞半圈落回',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torso:          buildTorso(makeCanvas),
        headFierce:     buildHead(makeCanvas, 'fierce'),
        headCalm:       buildHead(makeCanvas, 'calm'),
        ear:            buildEar(makeCanvas),
        tail:           buildTail(makeCanvas),
        legUpper:       buildLegSeg(makeCanvas, 3.35, 2.95, 5.6, true),
        legKnee:        buildLegSeg(makeCanvas, 2.80, 2.60, 4.4, false),
        legLower:       buildLegSeg(makeCanvas, 2.55, 2.45, 5.2, false),
        hoof:           buildHoof(makeCanvas),
        doveBodyNormal: buildDoveBody(makeCanvas, 'normal'),
        doveBodySing:   buildDoveBody(makeCanvas, 'sing'),
        doveWingFold:   buildDoveWing(makeCanvas, false),
        doveWingSpread: buildDoveWing(makeCanvas, true),
        noteRingSmall:  buildNoteRing(makeCanvas, 3.2),
        noteRingLarge:  buildNoteRing(makeCanvas, 4.6)
      };

      const gait = new MultiLegGaitSolver([
        { id: 'FL', hipX: -6.8, hipY:  7.2, hipZ: 4.0, restX: -8.6, restY:  7.8, group: 0, L1: 6.4, L2: 6.8, kneeSign: -1 },
        { id: 'FR', hipX:  6.8, hipY:  7.2, hipZ: 4.0, restX:  8.6, restY:  7.8, group: 1, L1: 6.4, L2: 6.8, kneeSign: -1 },
        { id: 'BL', hipX: -6.8, hipY: -8.0, hipZ: 4.0, restX: -8.6, restY: -7.8, group: 1, L1: 6.4, L2: 6.8, kneeSign:  1 },
        { id: 'BR', hipX:  6.8, hipY: -8.0, hipZ: 4.0, restX:  8.6, restY: -7.8, group: 0, L1: 6.4, L2: 6.8, kneeSign:  1 }
      ], {
        mode: 'walk4',
        stepThreshold: 4.4,
        stepDuration: 0.28,
        stepHeight: 3.0,
        strideAnticipation: 0.44
      });

      // 物理弹簧：低头刨沙压肩、抬头舒展、身体落地微弹、耳垂摇摆、短尾摇摆、斑鸠角尖平衡弹簧
      const headDropSpring = new SpringDamper1D(0, 62, 7.6);
      const headYawSpring  = new SpringDamper1D(0, 54, 7.2);
      const bodyBounce     = new SpringDamper1D(0, 125, 8.2);
      const earDroopSpring = new SpringDamper1D(0, 48, 6.2);
      const tailWagSpring  = new SpringDamper1D(0, 68, 5.8);
      const doveSpring     = new SpringDamper3D(0, 0, 34, 96, 6.8);
      const doveYawSpring  = new SpringDamper1D(0, 64, 6.4);

      // 4 圈暖色律动音环池（唱歌态轮流飘出）
      const noteRings = Array.from({ length: 4 }, (_, i) => ({
        idx: i,
        active: false,
        x: 0, y: 0, z: 36,
        vx: 0, vy: 0, vz: 0,
        t: 0, life: 1.5,
        spin: i * 1.1,
        large: (i & 1) === 1
      }));

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 8.8,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        // 完整交互状态机：paw (暴躁刨沙) -> sing (斑鸠唱歌 + 犀牛瞬间乖巧) -> preen (理羽/绕角飞半圈) -> walk (巡游步态)
        stage: 'paw',
        stageTime: opts.seed ? (opts.seed % 1.2) : 0.25,
        cycleCount: 0,
        headMood: 'fierce',   // 'fierce' | 'calm'
        dovePose: 'normal',   // 'normal' | 'sing'
        doveFlap: false,
        doveOrbitT: 0,        // >0 表示斑鸠正在起飞绕角半圈落回
        pawFootIdx: 0,        // 0=左前蹄, 1=右前蹄
        pawPhase: 0,
        pawDustDone: false,
        snortCd: 0.35,
        noteCd: 0,
        noteSeq: 0,
        tiltX: 0,
        tiltY: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function computeHornTipWorld(bx, by, bodyLift, yw, hYaw, headDrop, sMul) {
        // 头颈关节挂点（与 buildPartList 严格一致，单一真源）
        const [hjx, hjy] = localToWorldXY(bx, by, yw, 0, (12.8 + headDrop * 0.48) * sMul);
        const [hx, hy] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
        const headLift = bodyLift + (5.2 - headDrop) * sMul;
        // 弯角尖端在头部局部空间的位置（低头时角尖跟着前倾微降）
        const tipLy = HORN_TIP_LOCAL.y + headDrop * 0.22;
        const tipLz = HORN_TIP_LOCAL.z - headDrop * 0.28;
        const [tx, ty] = localToWorldXY(hx, hy, hYaw, HORN_TIP_LOCAL.x * sMul, tipLy * sMul);
        return { x: tx, y: ty, z: headLift + tipLz * sMul, hx, hy, headLift };
      }

      const instance = {
        def: Sand4Def,
        cachePrefix: `sand4_krk_${Math.random().toString(36).slice(2, 7)}`,
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
          state.z = 8.8; state.vx = 0; state.vy = 0;
          state.stage = 'paw';
          state.stageTime = 0.25;
          state.headMood = 'fierce';
          state.dovePose = 'normal';
          state.doveFlap = false;
          state.doveOrbitT = 0;
          state.pawFootIdx = 0;
          state.pawPhase = 0;
          state.pawDustDone = false;
          state.snortCd = 0.35;
          state.noteCd = 0;
          state.tiltX = 0;
          state.tiltY = 0;

          headDropSpring.x = headDropSpring.v = 0;
          headYawSpring.x = headYawSpring.v = 0;
          bodyBounce.x = bodyBounce.v = 0;
          earDroopSpring.x = earDroopSpring.v = 0;
          tailWagSpring.x = tailWagSpring.v = 0;
          doveYawSpring.x = doveYawSpring.v = 0;

          gait.reset(state.x, state.y, state.yaw);
          const tip = computeHornTipWorld(state.x, state.y, state.z, state.yaw, state.yaw, 0, 1.0);
          doveSpring.reset(tip.x, tip.y, tip.z);
          for (const nr of noteRings) nr.active = false;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          // 同时兼容 eco.action === 'idle' 与 eco.patrol === false
          const isIdle = !eco || eco.action === 'idle' || eco.patrol === false;
          const fxCol = curSkin.fx || SKINS[0].fx;

          // -----------------------------------------------------------------
          // 1. 情绪反差交互状态机：paw -> sing -> preen -> (walk / idle rest)
          // -----------------------------------------------------------------
          state.stageTime += dt;
          if (state.stage === 'paw') {
            state.headMood = 'fierce';
            state.dovePose = 'normal';
            state.doveOrbitT = 0;
            if (state.stageTime >= 4.2) {
              state.stage = 'sing';
              state.stageTime = 0;
              state.noteCd = 0.08;
              state.noteSeq = 0;
            }
          } else if (state.stage === 'sing') {
            state.dovePose = 'sing';
            // 音环一飘出（~0.25s 后），犀牛立刻瞬间变乖巧！
            state.headMood = state.stageTime >= 0.25 ? 'calm' : 'fierce';
            if (state.stageTime >= 4.4) {
              state.stage = 'preen';
              state.stageTime = 0;
              state.dovePose = 'normal';
              state.cycleCount++;
              // 每逢奇数轮，斑鸠理完羽毛顺便起飞绕弯角飞半圈落回
              state.doveOrbitT = (state.cycleCount & 1) === 1 ? 0.001 : 0;
            }
          } else if (state.stage === 'preen') {
            state.dovePose = 'normal';
            state.headMood = state.stageTime < 2.2 ? 'calm' : 'fierce';
            if (state.doveOrbitT > 0) {
              state.doveOrbitT += dt / 1.55;
              if (state.doveOrbitT >= 1) state.doveOrbitT = 0;
            }
            const preenDur = isIdle ? 2.6 : 2.2;
            if (state.stageTime >= preenDur) {
              state.stage = isIdle ? 'paw' : 'walk';
              state.stageTime = 0;
              state.doveOrbitT = 0;
            }
          } else if (state.stage === 'walk') {
            state.headMood = 'fierce';
            state.dovePose = 'normal';
            state.doveOrbitT = 0;
            if (isIdle || state.stageTime >= 4.6) {
              state.stage = 'paw';
              state.stageTime = 0;
            }
          }

          const isPawing   = state.stage === 'paw';
          const isSinging  = state.stage === 'sing';
          const isCalmNow  = state.headMood === 'calm';
          const canWalk    = !isIdle && state.stage === 'walk';

          // -----------------------------------------------------------------
          // 2. 沉重 4 足四拍稳走与步态解算（heavy 性格 + walk4 轮流迈单脚 + 停步自动收脚）
          // -----------------------------------------------------------------
          Propulsion.multiLegWalk(state, dt, time, params, {
            ...eco,
            walkStyle: 'heavy',
            patrol: canWalk,
            baseLift: 8.8 * sMul,
            pauseFactor: canWalk ? 1.0 : 0
          });

          const gaitRes = gait.update(dt, state.x, state.y, state.z, state.yaw, state.vx, state.vy, {
            mode: 'walk4',
            scaleMul: sMul,
            stepFreq: freq * 0.90,
            stepHeight: 2.2 * sMul * (0.75 + flex * 0.25),
            stepThreshold: 4.6 * sMul
          });

          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 1.15 * sMul, expSmooth(dt, 9.5));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 1.15 * sMul, expSmooth(dt, 9.5));

          if (gaitRes.landed.length > 0) {
            bodyBounce.impulse(-13.5 * sMul);
            for (const leg of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, leg.footX, leg.footY, 1.15 * sMul);
            }
          }

          // -----------------------------------------------------------------
          // 3. 暴躁刨沙态：交替前蹄用力刨沙 + 鼻孔呼出两股白气微粒
          // -----------------------------------------------------------------
          if (isPawing) {
            state.pawPhase += dt * 1.65 * freq;
            if (state.pawPhase >= 1) {
              state.pawPhase -= 1;
              state.pawFootIdx = 1 - state.pawFootIdx;
              state.pawDustDone = false;
            }
            // 刨沙触地回拉瞬间扬起一蓬细沙微粒并带动肩头轻震
            if (!state.pawDustDone && state.pawPhase >= 0.48) {
              state.pawDustDone = true;
              bodyBounce.impulse(-8.5 * sMul);
              const pawLeg = gait.legs[state.pawFootIdx];
              if (vfx && pawLeg) {
                const backYaw = state.yaw + Math.PI;
                const [bxDir, byDir] = localToWorldXY(0, 0, backYaw, 0, 1);
                for (let k = 0; k < 6; k++) {
                  const spread = (Math.random() - 0.5) * 8.0 * sMul;
                  const spd = (10 + Math.random() * 14) * sMul;
                  vfx.spawnParticle(
                    pawLeg.footX + (Math.random() - 0.5) * 2.5 * sMul,
                    pawLeg.footY + (Math.random() - 0.5) * 2.5 * sMul,
                    1.0 * sMul,
                    bxDir * spd + spread, byDir * spd + spread, (5 + Math.random() * 8) * sMul,
                    0.42 + Math.random() * 0.22, 1.55 + Math.random() * 0.65,
                    fxCol.sand, false, 28
                  );
                }
              }
              // 晃动冲击传给角尖斑鸠，激发斑鸠拍翅稳住平衡
              doveSpring.impulse((Math.random() - 0.5) * 14 * sMul, (Math.random() - 0.5) * 14 * sMul, -16 * sMul);
            }

            // 鼻孔呼出两股白气微粒
            state.snortCd -= dt;
            if (state.snortCd <= 0 && vfx) {
              state.snortCd = 0.92 / Math.max(0.6, freq);
              const nL = sockets.get('nostrilL');
              const nR = sockets.get('nostrilR');
              const [fxDir, fyDir] = localToWorldXY(0, 0, state.yaw + headYawSpring.x, 0, 1);
              for (const nos of [nL, nR]) {
                for (let k = 0; k < 3; k++) {
                  const sideJit = (Math.random() - 0.5) * 4.5 * sMul;
                  const fwdSpd = (9.5 + k * 3.8) * sMul;
                  vfx.spawnParticle(
                    nos.x, nos.y, nos.z,
                    fxDir * fwdSpd + sideJit, fyDir * fwdSpd + sideJit, (-2.2 + Math.random() * 3.2) * sMul,
                    0.46 + k * 0.08, 1.65 + k * 0.25,
                    fxCol.steam, false, -4
                  );
                }
              }
            }
          } else {
            state.pawPhase = 0;
            state.pawDustDone = false;
            state.snortCd = 0.35;
          }

          // -----------------------------------------------------------------
          // 4. 头颈、双耳、短尾弹簧驱动（无小数缩放，全靠位置/转角/换态）
          // -----------------------------------------------------------------
          const targetHeadDrop = isPawing
            ? (3.6 + Math.sin(state.pawPhase * Math.PI) * 1.15)
            : (isCalmNow ? -0.35 : 0.45);
          const headDrop = headDropSpring.update(dt, targetHeadDrop, 62 * sp, clamp(7.4 * dScale, 3.0, 11.5));

          const targetHeadYaw = isPawing
            ? Math.sin(time * 5.2 * freq) * 0.14
            : (isCalmNow ? Math.sin(time * 1.8) * 0.18 : Math.sin(time * 1.1) * 0.12);
          const headRelYaw = headYawSpring.update(dt, targetHeadYaw, 54 * sp, clamp(7.0 * dScale, 3.0, 11.0));

          // 双耳：暴躁态向后紧绷，乖巧态温柔外垂轻晃
          const targetEarDroop = isCalmNow
            ? (0.68 + Math.sin(time * 4.2 * freq) * 0.22)
            : (isPawing ? -0.35 + Math.sin(time * 8.5) * 0.08 : 0.08);
          earDroopSpring.update(dt, targetEarDroop, 48 * sp, clamp(6.0 * dScale, 2.8, 10.5));

          // 短尾：乖巧态欢快小幅摇摆，暴躁态僵硬微抖
          const targetTailWag = isCalmNow
            ? Math.sin(time * 8.4 * freq) * 0.56 * flex
            : (isPawing ? Math.sin(time * 12.0) * 0.10 : Math.sin(time * 2.6 * freq) * 0.18 * flex);
          tailWagSpring.update(dt, targetTailWag, 68 * sp, clamp(5.8 * dScale, 2.6, 10.2));

          bodyBounce.update(dt, -gaitRes.liftSum * 0.12, 125 * sp, clamp(8.0 * dScale, 3.2, 12.5));

          // -----------------------------------------------------------------
          // 5. 弯角尖挂点追踪 + 斑鸠平衡弹簧 + 暖色律动音环发射
          // -----------------------------------------------------------------
          const breathBob = Math.sin(time * (isPawing ? 4.4 : 2.1)) * (isPawing ? 0.45 : 0.35) * sMul;
          const bodyLift = state.z + clamp(bodyBounce.x * 0.14, -2.0, 1.8) + breathBob;
          const bx = state.x + state.tiltX;
          const by = state.y + state.tiltY;
          const hYaw = wrapAngle(state.yaw + clamp(headRelYaw, -0.42, 0.42));

          const tip = computeHornTipWorld(bx, by, bodyLift, state.yaw, hYaw, headDrop, sMul);
          sockets.setWorld('hornTip', tip.x, tip.y, tip.z, hYaw);

          // 鼻孔挂点（左右各一，供暴躁呼白气使用）
          const [nlx, nly] = localToWorldXY(tip.hx, tip.hy, hYaw, -2.2 * sMul, 10.0 * sMul);
          const [nrx, nry] = localToWorldXY(tip.hx, tip.hy, hYaw,  2.2 * sMul, 10.0 * sMul);
          sockets.setWorld('nostrilL', nlx, nly, tip.headLift + 5.2 * sMul, hYaw);
          sockets.setWorld('nostrilR', nrx, nry, tip.headLift + 5.2 * sMul, hYaw);

          // 斑鸠目标位置：常态锁死在弯角尖端；唱歌态小幅左右蹦跳；绕角飞态优雅绕角半圈落回
          let doveTx = tip.x, doveTy = tip.y, doveTz = tip.z;
          let doveTargetYaw = hYaw;

          if (state.doveOrbitT > 0) {
            const u = clamp(state.doveOrbitT, 0, 1);
            const arcAng = u * Math.PI;
            const orbitR = Math.sin(arcAng) * 11.5 * sMul;
            const orbitH = Math.sin(arcAng) * 7.5 * sMul;
            const localAng = hYaw + Math.PI * 0.5 + u * Math.PI;
            doveTx = tip.x + Math.cos(localAng) * orbitR;
            doveTy = tip.y + Math.sin(localAng) * orbitR;
            doveTz = tip.z + orbitH;
            doveTargetYaw = wrapAngle(localAng + Math.PI * 0.5);
            state.doveFlap = Math.sin(time * 28) > -0.15;
          } else if (isSinging) {
            // 唱歌态：边唱边小幅左右蹦跳，翅膀轻快扑扇
            const hopWave = Math.abs(Math.sin(time * 5.6 * freq));
            const sideHop = Math.sin(time * 2.8 * freq) * 1.45 * sMul;
            const [shx, shy] = localToWorldXY(0, 0, hYaw, sideHop, 0);
            doveTx = tip.x + shx;
            doveTy = tip.y + shy;
            doveTz = tip.z + hopWave * 1.85 * sMul;
            doveTargetYaw = wrapAngle(hYaw + Math.sin(time * 2.8 * freq) * 0.42);
            state.doveFlap = hopWave > 0.52;
          } else if (isPawing) {
            // 暴躁刨沙态：跟着弯角晃动，高频拍翅稳住平衡
            doveTargetYaw = wrapAngle(hYaw + Math.sin(time * 7.2) * 0.25);
            state.doveFlap = Math.sin(time * 22.0) > -0.1;
          } else {
            // 理羽/巡游态：安稳栖息在角尖，偶发微转头整理羽毛
            doveTargetYaw = wrapAngle(hYaw + Math.sin(time * 2.4) * 0.28);
            state.doveFlap = false;
          }

          doveSpring.update(dt, doveTx, doveTy, doveTz, 108 * sp, clamp(7.0 * dScale, 3.2, 11.5));
          const dRelYaw = wrapAngle(doveTargetYaw - doveYawSpring.x);
          doveYawSpring.update(dt, doveYawSpring.x + dRelYaw, 72 * sp, clamp(6.6 * dScale, 3.0, 11.0));

          // 唱歌态飘出 3~4 圈柔和暖色律动音环 + 微小暖音符微粒
          if (isSinging) {
            state.noteCd -= dt;
            if (state.noteCd <= 0) {
              state.noteCd = 0.46 / Math.max(0.65, freq);
              const nr = noteRings[state.noteSeq % noteRings.length];
              state.noteSeq++;
              const ringAng = hYaw + ((state.noteSeq % 4) - 1.5) * 0.75;
              nr.active = true;
              nr.t = 0;
              nr.life = 1.85;
              nr.x = doveSpring.x;
              nr.y = doveSpring.y;
              nr.z = doveSpring.z + 7.2 * sMul;
              nr.vx = Math.cos(ringAng) * 5.2 * sMul;
              nr.vy = Math.sin(ringAng) * 5.2 * sMul;
              nr.vz = (6.4 + (state.noteSeq & 1) * 1.6) * sMul;
              nr.spin = ringAng;

              if (vfx) {
                for (let k = 0; k < 3; k++) {
                  const pa = ringAng + (k - 1) * 0.9;
                  vfx.spawnParticle(
                    doveSpring.x, doveSpring.y, doveSpring.z + 7.5 * sMul,
                    Math.cos(pa) * 7.5 * sMul, Math.sin(pa) * 7.5 * sMul, (7.5 + k * 2.2) * sMul,
                    0.85, 1.35, k === 1 ? fxCol.noteB : fxCol.noteA, true, -2
                  );
                }
              }
            }
          }

          for (const nr of noteRings) {
            if (!nr.active) continue;
            nr.t += dt;
            if (nr.t >= nr.life) { nr.active = false; continue; }
            nr.x += (nr.vx + Math.sin(time * 4.5 + nr.idx * 1.7) * 2.4 * sMul) * dt;
            nr.y += (nr.vy + Math.cos(time * 4.0 + nr.idx * 1.7) * 2.4 * sMul) * dt;
            nr.z += nr.vz * dt;
            nr.spin = wrapAngle(nr.spin + dt * 1.8);
          }

          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 3.6 * sMul }));
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = habitat.isWater;
          const yw = state.yaw;
          const headDrop = clamp(headDropSpring.x, -1.2, 5.2);
          const breathBob = Math.sin(state.stageTime * (state.stage === 'paw' ? 4.4 : 2.1)) * 0.38 * sMul;
          const bodyLift = state.z + clamp(bodyBounce.x * 0.14, -2.0, 1.8) + breathBob;
          const bx = state.x + state.tiltX;
          const by = state.y + state.tiltY;
          const isPawing = state.stage === 'paw';

          // 1. 4 条粗壮柱状弯膝 IK 腿（起点深嵌肩甲/臀甲，终点踩实重蹄，零脱臼零分离）
          for (let li = 0; li < gait.legs.length; li++) {
            const leg = gait.legs[li];
            let fx = leg.footX, fy = leg.footY, fz = leg.footZ;
            let kx = leg.kneeX, ky = leg.kneeY, kz = leg.kneeZ;
            const hx = leg.hipWX + state.tiltX;
            const hy = leg.hipWY + state.tiltY;
            const hz = leg.hipWZ;

            if (isPawing && li === state.pawFootIdx) {
              const p = state.pawPhase;
              // 0..0.42 抬蹄前探 -> 0.42..0.72 用力回刨擦地 -> 0.72..1.0 回位
              let fwdOff = 0, liftOff = 0;
              if (p < 0.42) {
                const u = smoothstep(0, 0.42, p);
                fwdOff = u * 4.4;
                liftOff = Math.sin(u * Math.PI) * 3.4;
              } else if (p < 0.75) {
                const u = (p - 0.42) / 0.33;
                fwdOff = lerp(4.4, -2.2, smoothstep(0, 1, u));
                liftOff = 0.25;
              } else {
                const u = (p - 0.75) / 0.25;
                fwdOff = lerp(-2.2, 0, smoothstep(0, 1, u));
                liftOff = Math.sin(u * Math.PI) * 1.4;
              }
              const [ox, oy] = localToWorldXY(0, 0, yw, 0, fwdOff * sMul);
              fx += ox; fy += oy; fz += liftOff * sMul;
              kx += ox * 0.55; ky += oy * 0.55; kz += liftOff * 0.55 * sMul;
            }

            const samples = [
              { k: 'legUpper', x: lerp(hx, kx, 0.22), y: lerp(hy, ky, 0.22), z: lerp(hz, kz, 0.22), b: -0.58, sym: 90 },
              { k: 'legKnee',  x: kx, y: ky, z: kz, b: -0.48, sym: 90 },
              { k: 'legLower', x: lerp(kx, fx, 0.52), y: lerp(ky, fy, 0.52), z: lerp(kz, fz + 2.0 * sMul, 0.52), b: -0.42, sym: 90 },
              { k: 'hoof',     x: fx, y: fy, z: fz, b: -0.32, sym: 360 }
            ];
            for (const pt of samples) {
              list.push({
                partKey: pt.k,
                asset: parts[pt.k],
                x: pt.x,
                y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === 'hoof' ? 0 : 2.1 * sMul)),
                ro: yw,
                symDeg: pt.sym,
                bias: pt.b,
                submerge: EnvFeedback.calcSubmerge(pt.z + 1.0, habitat.waterLevel, 4.6, isWater)
              });
            }
          }

          // 2. 带流苏短尾（pivotToWorldXY 锁死尾根枢轴）
          const tailYaw = wrapAngle(yw + clamp(tailWagSpring.x, -0.78, 0.78));
          const [tjx, tjy] = localToWorldXY(bx, by, yw, 0, -13.4 * sMul);
          const [tx, ty] = pivotToWorldXY(tjx, tjy, tailYaw, TAIL_PIVOT.x * sMul, TAIL_PIVOT.y * sMul);
          list.push({
            partKey: 'tail',
            asset: parts.tail,
            x: tx,
            y: ty,
            lift: bodyLift + 4.4 * sMul,
            ro: tailYaw,
            bias: -0.22,
            submerge: EnvFeedback.calcSubmerge(bodyLift + 4.4 * sMul, habitat.waterLevel, 4.6, isWater)
          });

          // 3. 披甲犀牛主躯干（零小数缩放）
          list.push({
            partKey: 'torso',
            asset: parts.torso,
            x: bx,
            y: by,
            lift: bodyLift,
            ro: yw,
            bias: 0.35,
            submerge: EnvFeedback.calcSubmerge(bodyLift + 2.5 * sMul, habitat.waterLevel, 5.2, isWater)
          });

          // 4. 独立犀牛大头 + 黑色年轮长弯角（无损切换 headFierce / headCalm，枢轴锁死）
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.42, 0.42));
          const [hjx, hjy] = localToWorldXY(bx, by, yw, 0, (12.8 + headDrop * 0.48) * sMul);
          const [hx, hy] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const headLift = bodyLift + (5.2 - headDrop) * sMul;
          const headKey = state.headMood === 'calm' ? 'headCalm' : 'headFierce';
          list.push({
            partKey: headKey,
            asset: parts[headKey],
            x: hx,
            y: hy,
            lift: headLift,
            ro: hYaw,
            bias: 0.72,
            submerge: EnvFeedback.calcSubmerge(headLift + 3.0 * sMul, habitat.waterLevel, 4.6, isWater)
          });

          // 5. 左右粗短扇耳（pivotToWorldXY 锁死耳根，乖巧态温柔垂晃）
          const earDroop = clamp(earDroopSpring.x, -0.5, 1.0);
          for (const s of [-1, 1]) {
            const earYaw = wrapAngle(hYaw + s * (0.48 + earDroop * 0.58));
            const [ejx, ejy] = localToWorldXY(hx, hy, hYaw, s * (4.8 + Math.max(0, earDroop) * 0.65) * sMul, -2.6 * sMul);
            const [ex, ey] = pivotToWorldXY(ejx, ejy, earYaw, EAR_PIVOT.x * sMul, EAR_PIVOT.y * sMul);
            list.push({
              partKey: 'ear',
              asset: parts.ear,
              x: ex,
              y: ey,
              lift: headLift + (9.6 - Math.max(0, earDroop) * 1.45) * sMul,
              ro: earYaw,
              bias: 0.82
            });
          }

          // 6. 待机交互物：角尖立体体素灰褐斑鸠 + 独立双翅
          const dKey = state.dovePose === 'sing' ? 'doveBodySing' : 'doveBodyNormal';
          const dYaw = doveYawSpring.x;
          list.push({
            partKey: dKey,
            asset: parts[dKey],
            x: doveSpring.x,
            y: doveSpring.y,
            lift: doveSpring.z - 0.6 * sMul,
            ro: dYaw,
            bias: 1.05
          });

          const wKey = state.doveFlap ? 'doveWingSpread' : 'doveWingFold';
          for (const s of [-1, 1]) {
            const wingYaw = wrapAngle(dYaw + (s > 0 ? 0 : Math.PI) + (state.doveFlap ? s * 0.26 : 0));
            const [wjx, wjy] = localToWorldXY(doveSpring.x, doveSpring.y, dYaw, s * 2.55 * sMul, -0.4 * sMul);
            const [wx, wy] = pivotToWorldXY(wjx, wjy, wingYaw, WING_PIVOT.x * sMul, WING_PIVOT.y * sMul);
            list.push({
              partKey: wKey,
              asset: parts[wKey],
              x: wx,
              y: wy,
              lift: doveSpring.z + (state.doveFlap ? 2.6 : 1.7) * sMul,
              ro: wingYaw,
              bias: 1.12
            });
          }

          // 7. 斑鸠唱歌暖色律动音环（设计上的轻柔半透明用 opacity）
          for (const nr of noteRings) {
            if (!nr.active) continue;
            const u = clamp(nr.t / nr.life, 0, 1);
            const fade = smoothstep(0, 0.16, u) * (1 - smoothstep(0.58, 1.0, u));
            if (fade <= 0.04) continue;
            const rKey = nr.large ? 'noteRingLarge' : 'noteRingSmall';
            list.push({
              partKey: rKey,
              asset: parts[rKey],
              x: nr.x,
              y: nr.y,
              lift: nr.z,
              ro: nr.spin,
              symDeg: 90,
              opacity: clamp(fade * 0.88, 0.08, 0.88),
              bias: 1.28
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sand4Def.id,
            code: Sand4Def.code,
            status: Sand4Def.status,
            name: Sand4Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            stage: state.stage,
            headMood: state.headMood,
            dovePose: state.dovePose,
            footRadius: Sand4Def.footRadius,
            headZ: 36,
            centerZ: 14,
            blocks: Sand4Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Sand4Def);
})(window.PixelWorkshop);
