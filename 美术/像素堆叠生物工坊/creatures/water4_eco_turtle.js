'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback, MountSystem } = PW.Behaviors;

  // =========================================================================
  // 水4 · 背上住生态的巨龟（M30 移动母巢 + 一群小的 标杆 · v3 精制）
  // -------------------------------------------------------------------------
  // 1. 形态与拆块预算（全长 ~92 格、全宽 ~68 格；单块体素盒严格 <= 38 格，全对称省图集）：
  //    - shellCore  (36×38×20)：中央扁圆巨背甲，双轴对称（symDeg=180），雕出六边形盾纹与厚苔斑；
  //    - shellSkirt (32×20×14)：四向共享背甲软裙边（前/后/左/右 4 块复用 1 套 X 对称件），深嵌主甲 7.5 格零接缝；
  //    - headBeak   (18×24×16)：粗壮鸟喙头（钩喙 + 厚眉骨 + 锐利双眼），枢轴锁后枕；
  //    - neckSeg    (14×14×12)：颈链 2 节共享资产；
  //    - legUpper   (12×12×11) & legFoot (14×16×10)：4 条沉重涉水粗足共享资产；
  //    - tailSeg    (12×14×10) & tailTip (14×18×8)：软边鳖尾物理链；
  //    - reedTall   (10×10×16) / reedShort (8×8×11) / mossStone (12×12×9)：背甲弹簧水草与青灰苔石（symDeg=90）；
  //    - guestStand (9×10×8) / guestFlyUp (13×10×8) / guestFlyDown (13×10×8)：5 只背上小水鸟共享资产。
  // 2. 跨个体挂点与母巢循环：
  //    - 实例暴露 inst.mountSockets（6 个开放背甲停靠位），每帧实时更新世界坐标与朝向；
  //    - 5 只共享贴图小水鸟直接通过 PW.Behaviors.MountSystem 停靠/离背觅食/落回/翻浪集结护巢，
  //      同时始终留有空闲挂点供同台外部生物（如水2、水1、地8）停靠。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 背甲主盾（墨青厚甲，3 档）
      shellDark:      '#1e3330',
      shellMid:       '#33544e',
      shellHi:        '#547d73',
      // 背甲硬缘与裙边（深青褐，3 档）
      rimDark:        '#262e29',
      rimMid:         '#414f46',
      rimHi:          '#64786b',
      // 龟颈、涉水粗足与软边鳖尾（灰青厚皮，3 档）
      skinDark:       '#2c3b3d',
      skinMid:        '#4a6163',
      skinHi:         '#718f91',
      // 腹甲与喉下浅甲（暖灰米，3 档）
      bellyDark:      '#6e6b58',
      bellyMid:       '#9e9a81',
      bellyHi:        '#cfcbb0',
      // 粗壮鸟喙（暗金骨角，3 档）
      beakDark:       '#694b21',
      beakMid:        '#a87b39',
      beakHi:         '#dbb065',
      // 钝爪与喙脊骨棱（旧骨灰，3 档）
      clawDark:       '#5c5548',
      clawMid:        '#8f8572',
      clawHi:         '#c2b8a3',
      // 背甲覆苔（湿翠青苔，3 档）
      mossDark:       '#234a2c',
      mossMid:        '#3d7843',
      mossHi:         '#68ab63',
      // 摇曳弹簧水草（鲜碧水草，3 档）
      reedDark:       '#1b593c',
      reedMid:        '#328c5c',
      reedHi:         '#63c485',
      // 背甲青灰苔石（河滩青石，3 档）
      stoneDark:      '#3b474f',
      stoneMid:       '#62737d',
      stoneHi:        '#94a6b0',
      // 双眼（严禁进 glowKeys）
      eyeDark:        '#0c1217',
      eyeIris:        '#e3a229',
      eyeGlint:       '#f5fcff',
      // 背上小水鸟主羽（青白洁羽，3 档）
      guestBodyDark:  '#96adb8',
      guestBodyMid:   '#cfe0e8',
      guestBodyHi:    '#f2f9fc',
      // 小水鸟飞羽与尾羽（黛青羽，3 档）
      guestWingDark:  '#24465c',
      guestWingMid:   '#3f7291',
      guestWingHi:    '#6ea6c7',
      // 小水鸟暖橘喙与细爪（3 档）
      guestBeakDark:  '#99481c',
      guestBeakMid:   '#de7533',
      guestBeakHi:    '#ffae66'
    },
    glowKeys: [],
    parts: [
      'shell', 'rim', 'skin', 'belly', 'beak', 'claw',
      'moss', 'reed', 'stone', 'eye',
      'guestBody', 'guestWing', 'guestBeak'
    ],
    noCrease: [
      ['shell', 'rim'], ['shell', 'moss'], ['rim', 'moss'], ['shell', 'stone'],
      ['skin', 'belly'], ['skin', 'beak'], ['skin', 'eye'], ['beak', 'claw'],
      ['skin', 'claw'], ['moss', 'reed'], ['stone', 'moss'],
      ['guestBody', 'guestWing'], ['guestBody', 'guestBeak'], ['guestBody', 'eye']
    ],
    materials: {
      shell:     ['shellDark',     'shellMid',     'shellHi'],
      rim:       ['rimDark',       'rimMid',       'rimHi'],
      skin:      ['skinDark',      'skinMid',      'skinHi'],
      belly:     ['bellyDark',     'bellyMid',     'bellyHi'],
      beak:      ['beakDark',      'beakMid',      'beakHi'],
      claw:      ['clawDark',      'clawMid',      'clawHi'],
      moss:      ['mossDark',      'mossMid',      'mossHi'],
      reed:      ['reedDark',      'reedMid',      'reedHi'],
      stone:     ['stoneDark',     'stoneMid',     'stoneHi'],
      guestBody: ['guestBodyDark', 'guestBodyMid', 'guestBodyHi'],
      guestWing: ['guestWingDark', 'guestWingMid', 'guestWingHi'],
      guestBeak: ['guestBeakDark', 'guestBeakMid', 'guestBeakHi']
    },
    protectedParts: ['eye', 'beak', 'claw', 'guestBeak']
  });

  // 4 套零重建模换色皮肤（0 禁用字）
  const SKINS = [
    {
      id: 'deep_moss',
      name: '深潭苔青（河湖经典）',
      dot: '#33544e',
      outline: '#091414',
      pal: {},
      fx: { foam: '#e6f7fa', splash: '#8ccfd9', ring: '#bfeef5' }
    },
    {
      id: 'ancient_river',
      name: '古河褐石（老潭款）',
      dot: '#6e523a',
      outline: '#17100b',
      pal: {
        shellDark: '#3b2b1e', shellMid: '#634935', shellHi: '#8f6e53',
        rimDark:   '#2e251e', rimMid:   '#4f4034', rimHi:   '#756150',
        skinDark:  '#3d3930', skinMid:  '#635d4e', skinHi:  '#8f8773',
        mossDark:  '#384d25', mossMid:  '#5c783b', mossHi:  '#88a85e',
        reedDark:  '#425928', reedMid:  '#6b8c42', reedHi:  '#9bc269',
        stoneDark: '#4d463f', stoneMid: '#786e63', stoneHi: '#a89d90',
        beakDark:  '#5e4326', beakMid:  '#997043', beakHi:  '#cfa36e'
      },
      fx: { foam: '#f2efe6', splash: '#b3c4ba', ring: '#d9e3d5' }
    },
    {
      id: 'autumn_reed',
      name: '秋苇赭甲（浅秋款）',
      dot: '#8f4d2e',
      outline: '#1a0e0a',
      pal: {
        shellDark: '#4a2618', shellMid: '#7d442b', shellHi: '#b06946',
        rimDark:   '#382219', rimMid:   '#5e3b2c', rimHi:   '#8a5a44',
        skinDark:  '#45372d', skinMid:  '#6e5949', skinHi:  '#9c826d',
        mossDark:  '#594a21', mossMid:  '#8f7836', mossHi:  '#c4a958',
        reedDark:  '#785921', reedMid:  '#b88c38', reedHi:  '#ebc365',
        stoneDark: '#4b5257', stoneMid: '#768087', stoneHi: '#a9b3ba',
        eyeIris:   '#f0b835'
      },
      fx: { foam: '#faf3e6', splash: '#c9c4ab', ring: '#ebe3c7' }
    },
    {
      id: 'jade_spring',
      name: '碧泉青石（冷泉款）',
      dot: '#2b6e68',
      outline: '#081717',
      pal: {
        shellDark: '#163b3b', shellMid: '#276361', shellHi: '#46948f',
        rimDark:   '#1e3338', rimMid:   '#34565e', rimHi:   '#54818c',
        skinDark:  '#243a45', skinMid:  '#3e6070', skinHi:  '#638fa3',
        mossDark:  '#1d5441', mossMid:  '#328769', mossHi:  '#5cc29b',
        reedDark:  '#196150', reedMid:  '#2e9c82', reedHi:  '#60d4b7',
        stoneDark: '#445763', stoneMid: '#708999', stoneHi: '#a8c1d1',
        eyeIris:   '#f5c442'
      },
      fx: { foam: '#e8fcff', splash: '#8ce3eb', ring: '#bdf5fa' }
    }
  ];

  // =========================================================================
  // 穹顶高度估算（用于背甲水草、苔石与 6 个开放 mountSockets 的精确贴合）
  // 返回相对背甲底面（baseZ）的局部顶面高度
  // =========================================================================
  function evalShellTopZ(lx, ly) {
    const r2 = (lx * lx) / (24.5 * 24.5) + (ly * ly) / (23.0 * 23.0);
    if (r2 >= 0.96) return 7.5;
    return 4.2 + 16.2 * Math.sqrt(Math.max(0.04, 1.0 - r2));
  }

  // =========================================================================
  // 1. 中央巨背甲 shellCore（36×38×20，严格 X 对称）
  //    扁圆厚重主背甲 + 六边形龟甲盾片凹凸刻缝 + 湿润青苔斑
  // =========================================================================
  function buildShellCore(makeCanvas) {
    const W = 36, D = 38, H = 20;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-17.0, 17.0, -18.0, 18.0, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      const ay = Math.abs(Y);
      const r2 = (ax * ax) / (17.2 * 17.2) + (ay * ay) / (18.2 * 18.2);
      if (r2 > 1.0) return;

      // 扁圆厚重龟甲穹顶 + 中脊微隆（严格双轴对称，支持 symDeg=180 省一半图集）
      const arch = Math.sqrt(Math.max(0, 1.0 - r2));
      const spineRidge = Math.exp(-(ax * ax) / 18.0) * 1.15;
      const plateRow = Math.cos(ay * 0.42);
      const plateCol = Math.cos(ax * 0.46 + (Math.round(ay / 7.5) & 1) * 1.4);
      const groove = (Math.abs(plateRow) < 0.14 || Math.abs(plateCol) < 0.14) ? -0.65 : 0.35;
      const topZ = 2.8 + 15.2 * Math.pow(arch, 0.72) + spineRidge + groove;
      if (z > topZ || z < 1.2) return;

      // 底面浅腹甲托底
      if (z <= 3.0) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
        return;
      }

      const isSurface = z >= topZ - 1.7;
      const isGroove = groove < 0;
      const mossNoise = Math.sin(ax * 0.48 + 0.6) * Math.cos(ay * 0.38);
      if (isSurface && isGroove) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else if (isSurface && mossNoise > 0.36 && r2 < 0.72) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (z <= 5.5) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else {
        m.setRaw(x, y, z, mat('shell'), partId.shell);
      }
    });

    // 中央脊甲三块对称隆盾（强化古龟背脊结构感，且避开外侧停靠区）
    for (const sy of [-8.0, 0.0, 8.0]) {
      m.paintEllipsoid(0, sy, 16.4 - Math.abs(sy) * 0.18, 4.2, 3.3, 1.8, mat('shell'), partId.shell, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 17.5, headZ: 19, centerZ: 9 });
  }

  // =========================================================================
  // 2. 四向共享背甲软裙 shellSkirt（32×20×14，严格 X 对称，前/后/左/右 4 块复用！）
  //    局部 +Y 朝外侧鳖甲软边裙缘，局部 -Y 深嵌 shellCore 7.5 格，大幅压缩图集占用
  // =========================================================================
  function buildShellSkirt(makeCanvas) {
    const W = 32, D = 20, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-15.0, 15.0, -9.5, 9.5, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      const eNorm = (ax * ax) / (15.4 * 15.4) + ((Y + 2.4) * (Y + 2.4)) / (12.0 * 12.0);
      if (eNorm > 1.0) return;
      const outU = clamp((Y + 9.5) / 19.0, 0, 1);
      const arch = Math.sqrt(Math.max(0, 1.0 - eNorm));
      const roofZ = lerp(13.2, 3.5, Math.pow(outU, 1.06)) * (0.28 + 0.72 * arch);
      if (z > roofZ || z < 1.0) return;

      if (z <= 2.4 && Y < 3.5) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (Y > 5.0 || z <= 3.6) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else if (z > roofZ - 1.5 && ((Math.round(ax * 0.7 + Y * 0.6) & 3) === 0) && Y < 4.0) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else {
        m.setRaw(x, y, z, mat('shell'), partId.shell);
      }
    });

    // 外裙三道对称甲肋（强化巨龟边缘厚甲层次）
    for (const sx of [-6.8, 0, 6.8]) {
      m.paintCapsule(sx, -4.0, 9.2, sx * 0.88, 6.8, 3.2, 1.9, 1.15, mat('rim'), partId.rim, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 12.8, headZ: 13, centerZ: 6 });
  }

  // =========================================================================
  // 4. 粗壮鸟喙头 headBeak（18×24×16，严格 X 对称，枢轴锁后枕 (0, -8.5)）
  //    《山海经》旋龟鸟首特征：厚实颅顶 + 粗壮弯钩鸟喙 + 清晰 2×2 锐利双眼 + 颊部骨棱
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -8.5 };
  function buildHeadBeak(makeCanvas) {
    const W = 18, D = 24, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 饱满后颅与颊肌
    m.fillAABB(-8.0, 8.0, -10.5, 4.5, 2, 14, (x, y, z, X, Y) => {
      const dSkull = Math.hypot(X / 6.6, (Y + 3.0) / 7.2, (z - 8.0) / 5.4);
      if (dSkull > 1.0) return;
      if (z <= 4.2 && Math.abs(X) < 4.5) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (z >= 11.4 && Math.abs(X) < 3.6 && Y < -1.0) {
        m.setRaw(x, y, z, mat('shell'), partId.shell);
      } else {
        m.setRaw(x, y, z, mat('skin'), partId.skin);
      }
    });

    // 粗壮鹰鸷鸟喙：上钩喙宽厚下弯 + 下喙短实咬合 + 喙背角质脊
    m.paintCapsule(0, 1.5, 8.4, 0, 8.5, 7.6, 4.1, 2.4, mat('beak'), partId.beak, true);
    m.paintCapsule(0, 7.2, 7.5, 0, 10.8, 4.4, 2.3, 1.05, mat('beak'), partId.beak, true);
    // 下喙
    m.paintCapsule(0, 1.0, 5.4, 0, 7.4, 5.2, 3.2, 1.6, mat('beak'), partId.beak, true);
    // 喙背角质骨棱
    m.paintCapsule(0, 1.5, 11.4, 0, 8.6, 9.3, 1.35, 0.72, mat('claw'), partId.claw, true);

    // 两侧粗厚眉骨与颊侧角鳞（俯视辨识度极强）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 4.4, -2.5, 11.2, s * 3.8, 2.8, 10.6, 1.45, 1.05, mat('shell'), partId.shell, true);
      m.paintCapsule(s * 5.2, -5.8, 7.2, s * 6.8, -8.5, 8.6, 1.55, 0.92, mat('rim'), partId.rim, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 表面落点锐利双眼（2×2，eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 0.6);
    const eyeZ = 8;
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 5; step++) {
        const tx = Math.round(hw + s * (7.2 - step));
        const p = m.getPartId(tx, eyeY, eyeZ);
        if (p === partId.skin || p === partId.shell) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 5.6);
      m.setRaw(sx, eyeY,     eyeZ,     keyToId.eyeIris,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ,     keyToId.eyeDark,  partId.eye);
      m.setRaw(sx, eyeY,     eyeZ + 1, keyToId.eyeDark,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 7.2, headZ: 15, centerZ: 8 });
  }

  // =========================================================================
  // 5. 颈链节 neckSeg（14×14×12，严格 X 对称，2 节共享）
  // =========================================================================
  function buildNeckSeg(makeCanvas) {
    const W = 14, D = 14, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.0, 6.0, -6.0, 6.0, 1, 10, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 5.2, Y / 5.6, (z - 5.6) / 4.4);
      if (d > 1.0) return;
      if (z <= 3.0 && Math.abs(X) < 3.6) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (z >= 8.2 && Math.abs(X) < 2.8) {
        m.setRaw(x, y, z, mat('shell'), partId.shell);
      } else {
        m.setRaw(x, y, z, mat('skin'), partId.skin);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 6. 沉重涉水粗足：大腿段 legUpper（12×12×11）+ 带蹼粗足掌 legFoot（14×16×10）
  //    4 条腿全部共享这两套严格 X 对称件，极大节省图集
  // =========================================================================
  function buildLegUpper(makeCanvas) {
    const W = 12, D = 12, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.paintEllipsoid(0, 0, 5.2, 4.4, 4.6, 4.4, mat('skin'), partId.skin, true);
    m.paintEllipsoid(0, 1.2, 6.6, 3.2, 3.0, 2.2, mat('rim'), partId.rim, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8, headZ: 10, centerZ: 5 });
  }

  function buildLegFoot(makeCanvas) {
    const W = 14, D = 16, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 粗壮涉水足柱 + 宽厚蹼掌
    m.paintCapsule(0, -1.2, 7.6, 0, 0.8, 2.6, 3.8, 4.6, mat('skin'), partId.skin, true);
    m.paintEllipsoid(0, 1.4, 2.4, 5.2, 5.4, 2.2, mat('skin'), partId.skin, true);
    // 足背硬鳞护片
    m.paintEllipsoid(0, 0.6, 4.8, 3.6, 3.6, 1.5, mat('rim'), partId.rim, true);
    // 前缘三枚粗钝岩爪
    for (const cx of [-3.0, 0.0, 3.0]) {
      const cy = cx === 0 ? 6.6 : 5.7;
      m.paintCapsule(cx * 0.8, 3.5, 2.2, cx, cy, 1.4, 1.15, 0.72, mat('claw'), partId.claw, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.8, headZ: 9, centerZ: 4 });
  }

  // =========================================================================
  // 7. 软边鳖尾：尾节 tailSeg（12×14×10）+ 宽扁软边尾叶 tailTip（14×18×8）
  // =========================================================================
  const TAIL_TIP_PIVOT = { x: 0, y: 6.5 };
  function buildTailSeg(makeCanvas) {
    const W = 12, D = 14, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5.0, 5.0, -6.0, 6.0, 1, 8, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 4.4, Y / 5.8, (z - 4.2) / 3.4);
      if (d > 1.0) return;
      if (z >= 6.2 && Math.abs(X) < 2.2) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else if (z <= 2.4) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else {
        m.setRaw(x, y, z, mat('skin'), partId.skin);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8, headZ: 9, centerZ: 4 });
  }

  function buildTailTip(makeCanvas) {
    const W = 14, D = 18, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 软边扁宽鳖尾（前端粗实接尾节，两侧展开柔韧水鳍边，后缘渐收）
    m.fillAABB(-6.0, 6.0, -8.0, 8.0, 1, 7, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      const u = clamp((8.0 - Y) / 16.0, 0, 1); // 0=根部, 1=尾尖
      const halfW = lerp(4.2, 5.6, Math.sin(u * Math.PI * 0.78)) * (1.0 - u * 0.58);
      const halfH = lerp(3.0, 1.1, u);
      if (ax > halfW) return;
      const dZ = Math.abs(z - 3.6) / Math.max(0.8, halfH);
      if (dZ > Math.sqrt(Math.max(0, 1.0 - (ax / Math.max(1, halfW)) ** 2))) return;

      if (ax > halfW * 0.65 || u > 0.72) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else {
        m.setRaw(x, y, z, mat('skin'), partId.skin);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.2, headZ: 7, centerZ: 3 });
  }

  // =========================================================================
  // 8. 背甲生态微件：摇曳水草丛 reedTall / reedShort + 青灰苔石 mossStone
  //    均设为四重近似对称（symDeg: 90），全周仅 6~8 档烘焙，图集几乎零压力
  // =========================================================================
  function buildReedClump(makeCanvas, tall) {
    const W = tall ? 10 : 8, D = tall ? 10 : 8, H = tall ? 16 : 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 底部苔座
    m.paintEllipsoid(0, 0, 1.6, tall ? 3.2 : 2.6, tall ? 3.2 : 2.6, 1.5, mat('moss'), partId.moss, true);

    // 四向对称伸展的水草叶片（微弯飘逸，避免死板圆柱）
    const blades = tall
      ? [
          { ang: 0.35, r1: 3.4, z1: 14.2, r: 0.92 },
          { ang: 1.92, r1: 3.2, z1: 13.0, r: 0.88 },
          { ang: 3.49, r1: 3.4, z1: 14.2, r: 0.92 },
          { ang: 5.06, r1: 3.2, z1: 13.0, r: 0.88 },
          { ang: 1.10, r1: 1.8, z1: 11.2, r: 0.82 },
          { ang: 4.24, r1: 1.8, z1: 11.2, r: 0.82 }
        ]
      : [
          { ang: 0.40, r1: 2.6, z1: 9.2, r: 0.86 },
          { ang: 1.97, r1: 2.5, z1: 8.6, r: 0.82 },
          { ang: 3.54, r1: 2.6, z1: 9.2, r: 0.86 },
          { ang: 5.11, r1: 2.5, z1: 8.6, r: 0.82 }
        ];
    for (const b of blades) {
      const mx = Math.cos(b.ang) * b.r1 * 0.45;
      const my = Math.sin(b.ang) * b.r1 * 0.45;
      const tx = Math.cos(b.ang) * b.r1;
      const ty = Math.sin(b.ang) * b.r1;
      m.paintCapsule(0, 0, 1.8, mx, my, b.z1 * 0.56, b.r, b.r * 0.78, mat('reed'), partId.reed, true);
      m.paintCapsule(mx, my, b.z1 * 0.56, tx, ty, b.z1, b.r * 0.78, 0.48, mat('reed'), partId.reed, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: H - 1, centerZ: Math.round(H * 0.4) });
  }

  function buildMossStone(makeCanvas) {
    const W = 12, D = 12, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5.2, 5.2, -5.2, 5.2, 0, 8, (x, y, z, X, Y) => {
      const ax = Math.abs(X), ay = Math.abs(Y);
      const d = Math.hypot(ax / 4.8, ay / 4.4, (z - 1.6) / 6.2);
      if (d > 1.0) return;
      if (z >= 5.2 && d > 0.65) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8, headZ: 8, centerZ: 3 });
  }

  // =========================================================================
  // 9. 背上共享贴图小水鸟（5 只复用同一套 3 档轻量 X 对称件：stand / flyUp / flyDown）
  // =========================================================================
  function buildGuestBird(makeCanvas, pose) {
    const isFly = pose === 'flyUp' || pose === 'flyDown';
    const W = isFly ? 13 : 9;
    const D = 10;
    const H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 精巧圆润小水鸟身
    m.paintEllipsoid(0, -0.3, isFly ? 3.8 : 3.2, 1.8, 2.5, 1.6, mat('guestBody'), partId.guestBody, true);
    // 翘尾羽
    m.paintCapsule(0, -2.1, isFly ? 3.8 : 3.4, 0, -4.1, isFly ? 4.2 : 4.4, 0.95, 0.50, mat('guestWing'), partId.guestWing, true);
    // 鸟首与橘黄尖喙
    const hy = 1.8, hz = isFly ? 4.4 : 5.0;
    m.paintEllipsoid(0, hy, hz, 1.35, 1.4, 1.3, mat('guestBody'), partId.guestBody, true);
    m.paintCapsule(0, hy + 0.8, hz - 0.1, 0, hy + 2.7, hz - 0.3, 0.54, 0.30, mat('guestBeak'), partId.guestBeak, true);

    if (isFly) {
      const tipZ = pose === 'flyUp' ? 6.8 : 1.4;
      for (const s of [-1, 1]) {
        m.paintFinTri(
          [s * 1.2,  1.0, 3.8],
          [s * 1.2, -1.4, 3.6],
          [s * 5.6, -0.3, tipZ],
          0.56, mat('guestBody'), partId.guestBody, true
        );
        m.paintCapsule(s * 3.5, -0.2, lerp(3.8, tipZ, 0.58), s * 5.7, -0.5, tipZ, 0.60, 0.38, mat('guestWing'), partId.guestWing, true);
      }
    } else {
      for (const s of [-1, 1]) {
        m.paintEllipsoid(s * 1.55, -0.6, 3.4, 0.65, 2.0, 1.05, mat('guestWing'), partId.guestWing, true);
        m.paintCapsule(s * 0.72, -0.1, 2.0, s * 0.78, 0.2, 0.6, 0.38, 0.34, mat('guestBeak'), partId.guestBeak, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);

    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const ey = clamp(Math.round(hd + hy + 0.5), 1, D - 2);
    const ez = clamp(Math.round(hz + 0.2), 1, H - 2);
    m.setRaw(Math.round(hw - 1.1), ey, ez, keyToId.eyeDark, partId.eye);
    m.setRaw(Math.round(hw + 1.1), ey, ez, keyToId.eyeDark, partId.eye);

    return m.toStripAsset(makeCanvas, { footRadius: 2.3, headZ: 7, centerZ: 3 });
  }

  // 背甲固定微生态摆件布局（避开 6 个开放 mountSockets）
  const SHELL_PROPS = [
    { kind: 'stone',     lx:   0.0, ly:  -2.5, phase: 0.0 },
    { kind: 'stone',     lx: -13.5, ly:   6.0, phase: 1.2 },
    { kind: 'stone',     lx:  13.2, ly:  -7.5, phase: 2.4 },
    { kind: 'reedTall',  lx:  -2.5, ly:  -5.5, phase: 0.4 },
    { kind: 'reedTall',  lx:  11.5, ly:   5.5, phase: 1.7 },
    { kind: 'reedTall',  lx: -12.8, ly:  -7.8, phase: 3.1 },
    { kind: 'reedShort', lx:   3.2, ly:   4.2, phase: 2.2 },
    { kind: 'reedShort', lx: -14.8, ly:   1.5, phase: 4.5 },
    { kind: 'reedShort', lx:  14.6, ly:   1.2, phase: 5.3 },
    { kind: 'reedShort', lx:   0.5, ly: -13.5, phase: 0.9 }
  ];

  // 6 个清晰开放的背甲挂点（局部坐标，给自带小住客与同台外部生物共同使用）
  const MOUNT_SOCKET_LAYOUT = [
    { id: 'shell_1', lx:  -7.5, ly:   7.5, r: 5.0 },
    { id: 'shell_2', lx:   7.5, ly:   7.5, r: 5.0 },
    { id: 'shell_3', lx: -10.8, ly:  -1.2, r: 5.0 },
    { id: 'shell_4', lx:  10.8, ly:  -1.2, r: 5.0 },
    { id: 'shell_5', lx:  -6.5, ly:  -9.5, r: 5.0 },
    { id: 'shell_6', lx:   6.5, ly:  -9.5, r: 5.0 }
  ];

  // =========================================================================
  // 生物定义：水4 · 背上住生态的巨龟
  // =========================================================================
  const Water4Def = {
    id: 'water4_eco_turtle',
    code: '水4',
    status: 'done',
    name: '背上住生态的巨龟',
    tag: 'M30 移动母巢 + 一群小的 · 鸟头鳖尾巨龟',
    summary: 'v3 精制（M30 标杆）：4 块 ≤38 格对称咬合拆块拼出 92 格鸟头鳖尾巨龟，背甲覆弹簧水草与青灰苔石并开放 6 个跨个体挂点（mountSockets），自带 5 只共享贴图小水鸟经 MountSystem 完整演示停靠 -> 离背觅食 -> 落回 -> 沉身翻浪召回护巢',
    defaultHabitat: 'river',
    footRadius: 27.0,
    ecoWeight: 3.2,
    useWaterFoam: true,
    mountHeight: 20.5,
    mountBackOffset: -1.5,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true,  status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true,  status: 'done' },
      { id: 'wave',   name: '沉身翻浪', loop: false, duration: 5.2, status: 'done' }
    ],
    blocks: [
      'M16 拆块守 28MB（4 块背甲全对称共享侧甲 + 鸟喙颈链 + 软边鳖尾）',
      '4 足沉重涉水对角步态（MultiLegGaitSolver 矢状面 IK）',
      '背甲弹簧摇曳水草与青灰苔石微生态',
      '6 个实时世界坐标 mountSockets 跨个体停靠位',
      '5 只共享贴图小水鸟 MountSystem 觅食落回与翻浪召回闭环'
    ],
    soulHabit: '巨龟在深潭河道极慢涉水挪动，背甲水草轻摇，5 只小水鸟在 6 个开放背甲挂点间停靠、轮流离背低飞觅食点水再落回 -> 周期性沉身蓄力翻浪昂首震鸣，激起多层大环纹波浪，5 只小水鸟齐刷刷飞回绕母体护巢盘旋，浪平后依次落回背甲',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const shellSkirtShared = buildShellSkirt(makeCanvas);
      const parts = {
        shellCore:    buildShellCore(makeCanvas),
        shellSkirtL:  shellSkirtShared,
        shellSkirtR:  shellSkirtShared,
        shellSkirtF:  shellSkirtShared,
        shellSkirtB:  shellSkirtShared,
        headBeak:     buildHeadBeak(makeCanvas),
        neckSeg:      buildNeckSeg(makeCanvas),
        legUpper:     buildLegUpper(makeCanvas),
        legFoot:      buildLegFoot(makeCanvas),
        tailSeg:      buildTailSeg(makeCanvas),
        tailTip:      buildTailTip(makeCanvas),
        reedTall:     buildReedClump(makeCanvas, true),
        reedShort:    buildReedClump(makeCanvas, false),
        mossStone:    buildMossStone(makeCanvas),
        guestStand:   buildGuestBird(makeCanvas, 'stand'),
        guestFlyUp:   buildGuestBird(makeCanvas, 'flyUp'),
        guestFlyDown: buildGuestBird(makeCanvas, 'flyDown')
      };

      const uniqueAssets = Array.from(new Set(Object.values(parts)));
      // 本体与背甲植被随皮肤换色；小水鸟保持鲜明青白橘喙高辨识羽色
      const hullRecolorAssets = Array.from(new Set([
        parts.shellCore, parts.shellSkirtL,
        parts.headBeak, parts.neckSeg, parts.legUpper, parts.legFoot,
        parts.tailSeg, parts.tailTip, parts.reedTall, parts.reedShort, parts.mossStone
      ]));

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.28;
      const seed = opts.seed ?? 67;
      const cachePrefix = `water4_eco_turtle_${Math.random().toString(36).slice(2, 7)}`;

      // 四足沉重对角涉水步态（后足 restY 设在 hipY 略前防后腿拖行）
      const gait = new MultiLegGaitSolver([
        { id: 'FL', hipX: -17.5, hipY:  12.5, hipZ: 5.4, restX: -22.5, restY:  14.8, L1: 5.8, L2: 5.6, kneeSign: -1 },
        { id: 'FR', hipX:  17.5, hipY:  12.5, hipZ: 5.4, restX:  22.5, restY:  14.8, L1: 5.8, L2: 5.6, kneeSign: -1 },
        { id: 'BL', hipX: -17.5, hipY: -12.5, hipZ: 5.2, restX: -22.5, restY: -11.6, L1: 5.8, L2: 5.6, kneeSign:  1 },
        { id: 'BR', hipX:  17.5, hipY: -12.5, hipZ: 5.2, restX:  22.5, restY: -11.6, L1: 5.8, L2: 5.6, kneeSign:  1 }
      ], {
        mode: 'trot',
        stepThreshold: 4.0,
        stepDuration: 0.42,
        stepHeight: 2.9,
        strideAnticipation: 0.38
      });

      // 软边鳖尾 4 节点物理链（根 + 2 尾节 + 软边尾叶）
      const tailChain = new ChainSolver(4, 5.2, {
        maxAngle: 0.36,
        waveFreq: 1.9,
        wavePhaseStep: 0.55,
        waveAmp: 0.24
      });

      const sinkSpring = new SpringDamper1D(0, 22, 6.2);
      const headLiftSpring = new SpringDamper1D(0, 28, 6.8);
      const headYawSpring = new SpringDamper1D(0, 18, 5.8);
      const reedSprings = SHELL_PROPS.map(() => new SpringDamper1D(0, 36, 4.6));
      const sockets = new SocketTracker();

      // 对外暴露的 6 个世界坐标跨个体停靠挂点（供自身小住客与同台外部生物共同使用）
      const mountSockets = MOUNT_SOCKET_LAYOUT.map(cfg => ({
        id: cfg.id,
        lx: cfg.lx,
        ly: cfg.ly,
        x: hx0 + cfg.lx,
        y: hy0 + cfg.ly,
        z: evalShellTopZ(cfg.lx, cfg.ly) + 2.0,
        yaw: hyaw0,
        r: cfg.r,
        occupiedBy: null
      }));

      // 5 只背上共享贴图小水鸟（经 MountSystem 停靠 / 离背觅食 / 返回落位 / 翻浪召回护巢）
      const guests = Array.from({ length: 5 }, (_, i) => ({
        idx: i,
        riderId: `${cachePrefix}_guest_${i}`,
        mode: 'perched', // 'perched' | 'forage' | 'returning' | 'rally'
        slot: null,
        x: hx0,
        y: hy0,
        z: 20.0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        yawOff: (i - 2) * 0.38,
        timer: 2.4 + i * 1.35,
        forageX: hx0,
        forageY: hy0,
        forageZ: 7.5,
        forageSub: 'out', // 'out' | 'dip'
        dipDone: false,
        flapPhase: i * 1.3,
        rallyAng: (i / 5) * TAU,
        rallyRad: 28.0 + (i % 2) * 5.0
      }));

      const state = {
        x: hx0,
        y: hy0,
        z: 1.6,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        navX: hx0 + 14,
        navY: hy0 + 8,
        navSeq: 1,
        navPause: 0,
        // 周期沉身翻浪（patrol 自动循环 / wave 动作强制演示）
        waveMode: 'calm', // 'calm' | 'sink' | 'surge' | 'settle'
        waveTimer: 0,
        waveCooldown: 11.5,
        lastAction: 'patrol',
        sinkDepth: 0,
        headLift: 0,
        headYawRel: 0,
        wakeCd: 0,
        rippleCd: 0,
        footContacts: []
      };

      const footContacts = Array.from({ length: 4 }, () => ({ x: hx0, y: hy0, z: 0, r: 4.8 }));
      let curSkin = SKINS[0];

      // 刷新 6 个背甲挂点的世界坐标（每帧调用，同步巨龟位置、朝向与下沉起伏）
      function syncMountSockets(sMul) {
        const yw = state.yaw;
        for (let i = 0; i < mountSockets.length; i++) {
          const sl = mountSockets[i];
          const [wx, wy] = localToWorldXY(state.x, state.y, yw, sl.lx * sMul, sl.ly * sMul);
          sl.x = wx;
          sl.y = wy;
          sl.z = Math.max(2.0 * sMul, state.z + evalShellTopZ(sl.lx, sl.ly) * sMul);
          sl.yaw = yw;
          sl.r = MOUNT_SOCKET_LAYOUT[i].r * sMul;
        }
      }

      // 为小水鸟找一个本巨龟背上的空闲挂点并通过 MountSystem 认领
      function claimOwnFreeSlot(guest, preferIdx) {
        if (guest.slot && guest.slot.occupiedBy === guest.riderId) return guest.slot;
        const start = preferIdx !== undefined ? preferIdx : guest.idx;
        for (let k = 0; k < mountSockets.length; k++) {
          const sl = mountSockets[(start + k) % mountSockets.length];
          if (!sl.occupiedBy || sl.occupiedBy === guest.riderId) {
            if (MountSystem.claimMount(guest.riderId, instance, sl)) {
              guest.slot = sl;
              return sl;
            }
          }
        }
        return null;
      }

      function releaseOwnSlot(guest) {
        if (guest.slot && guest.slot.occupiedBy === guest.riderId) {
          MountSystem.releaseMount(guest.riderId, [instance]);
        }
        guest.slot = null;
      }

      // 触发沉身翻浪 + 全员召回护巢
      function startWaveEvent(sMul, vfx, habitat) {
        state.waveMode = 'sink';
        state.waveTimer = 0;
        if (vfx && habitat && habitat.isWater) {
          vfx.addRipple(state.x, state.y, 16.0 * sMul, 42.0 * sMul, 1.1, 2.2);
        }
        // 所有在外的与背上的小水鸟齐刷刷进入集结护巢态
        for (let i = 0; i < guests.length; i++) {
          const g = guests[i];
          releaseOwnSlot(g);
          g.mode = 'rally';
          g.rallyAng = Math.atan2(g.y - state.y, g.x - state.x);
          if (!Number.isFinite(g.rallyAng)) g.rallyAng = (i / guests.length) * TAU;
        }
      }

      function emitWaveSurge(vfx, habitat, sMul) {
        if (!vfx) return;
        const fxCol = curSkin.fx || SKINS[0].fx;
        // 沉身翻动引发多层大环纹波浪 + 叫声震出环纹
        vfx.addRipple(state.x, state.y, 14.0 * sMul, 56.0 * sMul, 1.45, 3.0);
        vfx.addRipple(state.x, state.y, 8.0 * sMul, 42.0 * sMul, 1.10, 2.2);
        const [hx, hy] = localToWorldXY(state.x, state.y, state.yaw, 0, 32.0 * sMul);
        vfx.addRipple(hx, hy, 3.0 * sMul, 28.0 * sMul, 0.95, 1.8);

        for (let i = 0; i < 22; i++) {
          const a = (i / 22) * TAU + Math.random() * 0.2;
          const r0 = (20.0 + Math.random() * 6.0) * sMul;
          const sp = (11.0 + Math.random() * 16.0) * sMul;
          vfx.spawnParticle(
            state.x + Math.cos(a) * r0,
            state.y + Math.sin(a) * r0,
            2.5 * sMul,
            Math.cos(a) * sp,
            Math.sin(a) * sp,
            (9.0 + Math.random() * 12.0) * sMul,
            0.55 + Math.random() * 0.30,
            1.7 + Math.random() * 0.9,
            i % 2 === 0 ? fxCol.foam : fxCol.splash,
            false,
            34
          );
        }
        if (habitat && habitat.isWater) {
          vfx.spawnSplash(state.x, state.y, 10, 1.25 * sMul, habitat.fx);
        }
      }

      const instance = {
        def: Water4Def,
        cachePrefix,
        parts,
        partListAssets: uniqueAssets,
        state,
        sockets,
        mountSockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of hullRecolorAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 1.6;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw ?? 0.28;
          state.navX = homeX + 12;
          state.navY = homeY + 8;
          state.navSeq = 1;
          state.navPause = 0.6;
          state.waveMode = 'calm';
          state.waveTimer = 0;
          state.waveCooldown = 11.5;
          state.lastAction = 'patrol';
          state.sinkDepth = 0;
          state.headLift = 0;
          state.headYawRel = 0;
          state.wakeCd = 0;
          state.rippleCd = 0;

          sinkSpring.x = sinkSpring.v = 0;
          headLiftSpring.x = headLiftSpring.v = 0;
          headYawSpring.x = headYawSpring.v = 0;
          for (const rs of reedSprings) { rs.x = rs.v = 0; }

          gait.reset(homeX, homeY, state.yaw, instance.scaleMul);
          const [trX, trY] = localToWorldXY(homeX, homeY, state.yaw, 0, -21.5 * instance.scaleMul);
          tailChain.reset(trX, trY, 4.0 * instance.scaleMul, state.yaw);

          for (const sl of mountSockets) sl.occupiedBy = null;
          state._riderCount = 0;
          syncMountSockets(instance.scaleMul);

          // 初始 5 只小水鸟均停靠在背甲前 5 个挂点（留出第 6 个空位给同台外部生物）
          for (let i = 0; i < guests.length; i++) {
            const g = guests[i];
            g.slot = null;
            g.mode = 'perched';
            g.timer = 2.0 + i * 1.45;
            g.dipDone = false;
            const sl = claimOwnFreeSlot(g, i);
            if (sl) {
              const pose = MountSystem.getMountWorldPose(instance, sl);
              g.x = pose.x;
              g.y = pose.y;
              g.z = pose.z;
              g.yaw = wrapAngle(pose.yaw + g.yawOff);
            } else {
              g.x = homeX; g.y = homeY; g.z = 21.0;
            }
            g.vx = 0; g.vy = 0;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const isWater = !!(habitat && habitat.isWater);

          const action = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const isIdle = action === 'idle';
          const isWaveAction = action === 'wave';
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const homeYaw = (eco && eco.homeYaw) ?? 0.28;
          const maxR = (eco && eco.maxRadius) || 48;
          // 红线：巨龟巡游坐标严格钳制在 maxRadius * 0.78 内
          const patrolLimitR = maxR * 0.78;
          const guestLimitR = maxR * 0.92;

          // -----------------------------------------------------------------
          // 1. 沉身翻浪状态机（wave 动作强制启动；patrol 周期性触发）
          // -----------------------------------------------------------------
          if (isWaveAction && state.lastAction !== 'wave') {
            startWaveEvent(sMul, vfx, habitat);
          }
          state.lastAction = action;

          if (!isIdle && !isWaveAction && state.waveMode === 'calm') {
            state.waveCooldown -= dt * clamp(0.75 + spdMul * 0.25, 0.5, 1.6);
            if (state.waveCooldown <= 0) {
              state.waveCooldown = 14.5;
              startWaveEvent(sMul, vfx, habitat);
            }
          }

          if (state.waveMode !== 'calm') {
            state.waveTimer += dt;
            if (state.waveMode === 'sink' && state.waveTimer >= 1.35) {
              state.waveMode = 'surge';
              state.waveTimer = 0;
              sinkSpring.impulse(12.0 * sp);
              headLiftSpring.impulse(9.5 * sp);
              for (const rs of reedSprings) rs.impulse((Math.random() - 0.5) * 14.0 * sp);
              emitWaveSurge(vfx, habitat, sMul);
            } else if (state.waveMode === 'surge' && state.waveTimer >= 1.25) {
              state.waveMode = 'settle';
              state.waveTimer = 0;
              // 波浪平息，通知小水鸟陆续飞回背甲挂点
              for (let i = 0; i < guests.length; i++) {
                const g = guests[i];
                if (g.mode === 'rally') {
                  g.mode = 'returning';
                  claimOwnFreeSlot(g, i);
                }
              }
            } else if (state.waveMode === 'settle' && state.waveTimer >= 2.4) {
              state.waveMode = 'calm';
              state.waveTimer = 0;
            }
          }

          // -----------------------------------------------------------------
          // 2. 巨龟本体沉重巡游 / 原地浅水呼吸（绝不越过 maxRadius * 0.78）
          // -----------------------------------------------------------------
          const prevX = state.x, prevY = state.y;
          const canWalk = !isIdle && !isWaveAction && state.waveMode === 'calm';

          if (canWalk) {
            if (state.navPause > 0) {
              state.navPause -= dt;
            } else {
              const ndx = state.navX - state.x;
              const ndy = state.navY - state.y;
              const nd = Math.hypot(ndx, ndy);
              if (nd < 6.5) {
                state.navSeq++;
                const r1 = hash2i(state.navSeq, seed, 103);
                const r2 = hash2i(state.navSeq, seed, 227);
                const r3 = hash2i(state.navSeq, seed, 349);
                state.navPause = lerp(1.4, 2.6, r3);
                const curA = Math.atan2(state.y - homeY, state.x - homeX);
                const nextA = curA + (r1 > 0.5 ? 1 : -1) * lerp(1.2, 2.3, r2);
                const nextR = lerp(patrolLimitR * 0.35, patrolLimitR * 0.88, hash2i(state.navSeq, seed, 461));
                state.navX = homeX + Math.cos(nextA) * nextR;
                state.navY = homeY + Math.sin(nextA) * nextR;
              } else {
                const aimX = state.navX + (eco && eco.avoidX ? eco.avoidX * 0.35 : 0);
                const aimY = state.navY + (eco && eco.avoidY ? eco.avoidY * 0.35 : 0);
                const desiredYaw = Math.atan2(-(aimX - state.x), aimY - state.y);
                const yawDiff = wrapAngle(desiredYaw - state.yaw);
                const maxTurn = 0.72 * (0.7 + spdMul * 0.35);
                state.yaw = wrapAngle(state.yaw + clamp(yawDiff, -maxTurn * dt, maxTurn * dt));

                const align = lerp(0.25, 1.0, smoothstep(-0.3, 0.85, Math.cos(yawDiff)));
                const targetSpd = 5.6 * spdMul * align;
                const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
                const kV = expSmooth(dt, 3.2);
                state.vx = lerp(state.vx, fwdX * targetSpd, kV);
                state.vy = lerp(state.vy, fwdY * targetSpd, kV);
                state.x += state.vx * dt;
                state.y += state.vy * dt;
              }
            }
            if (state.navPause > 0) {
              const kStop = expSmooth(dt, 4.5);
              state.vx = lerp(state.vx, 0, kStop);
              state.vy = lerp(state.vy, 0, kStop);
              state.x += state.vx * dt;
              state.y += state.vy * dt;
            }
          } else {
            const kStop = expSmooth(dt, 5.2);
            state.vx = lerp(state.vx, 0, kStop);
            state.vy = lerp(state.vy, 0, kStop);
            state.x += state.vx * dt;
            state.y += state.vy * dt;
            if (isIdle) {
              const idleYaw = homeYaw + Math.sin(time * 0.25) * 0.10;
              state.yaw = wrapAngle(state.yaw + wrapAngle(idleYaw - state.yaw) * expSmooth(dt, 1.5));
            }
          }

          // 严格边界钳制：<= maxRadius * 0.78
          const dCenter = Math.hypot(state.x, state.y);
          if (dCenter > patrolLimitR && dCenter > 0.001) {
            state.x *= patrolLimitR / dCenter;
            state.y *= patrolLimitR / dCenter;
          }
          state.vx = (state.x - prevX) / Math.max(dt, 0.001);
          state.vy = (state.y - prevY) / Math.max(dt, 0.001);

          // 沉身翻浪垂直起伏 + 呼吸微浮（严禁常态 scaleX/Y 拉伸）
          const breathZ = Math.sin(time * 1.15 * gFreq) * 0.45;
          const waveZTarget = state.waveMode === 'sink' ? -2.8 : (state.waveMode === 'surge' ? 1.8 : 0.0);
          state.sinkDepth = sinkSpring.update(dt, waveZTarget, 22 * sp, clamp(6.2 * dScale, 3.6, 10.0));
          state.z = Math.max(-1.6 * sMul, (1.6 + breathZ + state.sinkDepth) * sMul);

          // -----------------------------------------------------------------
          // 3. 四足沉重对角步态 + 软边鳖尾物理链 + 鸟头颈链微摆 + 弹簧水草
          // -----------------------------------------------------------------
          const gaitOut = gait.update(dt, state.x, state.y, Math.max(0.5, state.z), state.yaw, state.vx, state.vy, {
            scaleMul: sMul,
            mode: 'trot',
            stepFreq: gFreq * 0.72,
            stepThreshold: 4.0 * sMul,
            stepHeight: 2.9 * sMul
          });

          for (let i = 0; i < gait.legs.length; i++) {
            const lg = gait.legs[i];
            footContacts[i].x = lg.footX;
            footContacts[i].y = lg.footY;
            footContacts[i].z = lg.footZ;
            footContacts[i].r = 4.8 * sMul;
            if (lg.justLanded && vfx) {
              EnvFeedback.emitFootstep(vfx, habitat, lg.footX, lg.footY, 0.85 * sMul);
            }
          }

          // 软边鳖尾物理链
          const [tailRootX, tailRootY] = localToWorldXY(state.x, state.y, state.yaw, 0, -21.5 * sMul);
          tailChain.update(dt, tailRootX, tailRootY, Math.max(0.8, state.z + 2.6 * sMul), state.yaw, time, {
            segLen: 5.2 * sMul,
            flexibility: flex,
            waveFreq: 1.85 * gFreq,
            waveAmp: (Math.hypot(state.vx, state.vy) > 1.2 ? 0.34 : 0.16) * flex,
            zTargetFn: (u) => Math.max(0.8, state.z + lerp(2.8, 1.4, u) * sMul)
          });

          // 鸟头颈链缓慢环视与翻浪昂首
          const headYawTgt = state.waveMode === 'surge'
            ? 0
            : Math.sin(time * 0.55 + seed * 0.1) * 0.34 * flex;
          const headLiftTgt = state.waveMode === 'surge'
            ? 3.8
            : (state.waveMode === 'sink' ? -1.4 : Math.sin(time * 1.15 * gFreq - 0.6) * 0.65);
          state.headYawRel = headYawSpring.update(dt, headYawTgt, 18 * sp, clamp(5.8 * dScale, 3.2, 9.5));
          state.headLift = headLiftSpring.update(dt, headLiftTgt, 26 * sp, clamp(6.6 * dScale, 3.8, 10.5));

          // 背甲水草弹簧微摇
          const moveSpd = Math.hypot(state.vx, state.vy);
          for (let i = 0; i < SHELL_PROPS.length; i++) {
            const prop = SHELL_PROPS[i];
            if (prop.kind === 'stone') continue;
            const windTgt = Math.sin(time * 1.85 * gFreq + prop.phase) * (0.20 + moveSpd * 0.025) * flex;
            reedSprings[i].update(dt, windTgt, 34 * sp, clamp(4.6 * dScale, 2.5, 8.0));
          }

          // 涉水尾迹与周期静水涟漪
          if (vfx && isWater) {
            state.wakeCd -= dt;
            if (moveSpd > 1.5 && state.wakeCd <= 0) {
              state.wakeCd = 0.65;
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, 0, -24.0 * sMul);
              EnvFeedback.emitWaterWake(vfx, habitat, wx, wy, state.yaw, 18.0 * sMul, 0.65);
            }
            state.rippleCd -= dt;
            if (state.rippleCd <= 0) {
              state.rippleCd = 1.65;
              vfx.addRipple(state.x, state.y, 20.0 * sMul, 34.0 * sMul, 1.05, 1.4);
            }
          }

          // -----------------------------------------------------------------
          // 4. 实时刷新 6 个对外挂点 mountSockets（供自身住客与外部生物停靠）
          // -----------------------------------------------------------------
          syncMountSockets(sMul);

          // -----------------------------------------------------------------
          // 5. 5 只共享贴图小水鸟母巢循环（全部经 MountSystem 停靠/离背/落回/召回）
          // -----------------------------------------------------------------
          let activeForagers = 0;
          for (let i = 0; i < guests.length; i++) {
            if (guests[i].mode === 'forage') activeForagers++;
          }
          const maxForagers = isIdle ? 2 : 3;

          for (let i = 0; i < guests.length; i++) {
            const g = guests[i];
            g.flapPhase += dt * (12.5 * gFreq);

            if (g.mode === 'perched') {
              if (!g.slot || g.slot.occupiedBy !== g.riderId) {
                claimOwnFreeSlot(g, i);
              }
              if (g.slot) {
                const pose = MountSystem.getMountWorldPose(instance, g.slot);
                if (pose && pose.alive) {
                  g.x = pose.x;
                  g.y = pose.y;
                  g.z = pose.z;
                  g.yaw = wrapAngle(pose.yaw + g.yawOff + Math.sin(time * 1.4 + g.idx * 1.7) * 0.25);
                  g.vx = 0;
                  g.vy = 0;
                }
              }

              // 周期性离背起飞去水面觅食（翻浪期间不外出）
              if (state.waveMode === 'calm') {
                g.timer -= dt;
                if (g.timer <= 0 && activeForagers < maxForagers) {
                  activeForagers++;
                  releaseOwnSlot(g);
                  g.mode = 'forage';
                  g.forageSub = 'out';
                  g.dipDone = false;
                  g.timer = 2.8 + (i % 3) * 0.65;

                  // 挑选圆台内合法水面觅食点（严格 <= guestLimitR 且避开巨龟本体）
                  const fAng = wrapAngle(state.yaw + (hash2i(Math.floor(time * 2) + i, seed, 571) - 0.5) * 4.4);
                  const fDist = lerp(28.0 * sMul, 38.0 * sMul, hash2i(Math.floor(time * 2) + i, seed, 683));
                  let fx = state.x + Math.cos(fAng) * fDist;
                  let fy = state.y + Math.sin(fAng) * fDist;
                  const fLen = Math.hypot(fx, fy);
                  if (fLen > guestLimitR && fLen > 0.001) {
                    fx *= guestLimitR / fLen;
                    fy *= guestLimitR / fLen;
                  }
                  g.forageX = fx;
                  g.forageY = fy;
                  g.forageZ = (6.5 + (i % 2) * 1.8) * sMul;
                }
              }
            } else if (g.mode === 'forage') {
              const dx = g.forageX - g.x;
              const dy = g.forageY - g.y;
              const dist = Math.hypot(dx, dy);
              const flySpd = 24.0 * spdMul * sMul;

              if (g.forageSub === 'out') {
                if (dist > 2.2) {
                  const step = Math.min(dist, flySpd * dt);
                  g.vx = (dx / dist) * (step / Math.max(dt, 0.001));
                  g.vy = (dy / dist) * (step / Math.max(dt, 0.001));
                  g.x += (dx / dist) * step;
                  g.y += (dy / dist) * step;
                  g.z = lerp(g.z, (16.5 + Math.sin(g.flapPhase * 0.3) * 1.5) * sMul, expSmooth(dt, 5.5));
                  g.yaw = wrapAngle(g.yaw + wrapAngle(Math.atan2(-dx, dy) - g.yaw) * expSmooth(dt, 9.0));
                } else {
                  g.forageSub = 'dip';
                  g.timer = 1.45;
                }
              } else {
                // 俯冲点水觅食并激起小涟漪，然后飞回落回背甲挂点
                g.timer -= dt;
                const dipPhase = clamp(1 - g.timer / 1.45, 0, 1);
                const lowZ = lerp(14.0, 4.2, Math.sin(dipPhase * Math.PI)) * sMul;
                g.z = lerp(g.z, lowZ, expSmooth(dt, 9.0));
                g.x += Math.cos(time * 2.5 + g.idx) * 3.5 * dt;
                g.y += Math.sin(time * 2.5 + g.idx) * 3.5 * dt;
                g.yaw = wrapAngle(g.yaw + dt * 2.2);

                if (!g.dipDone && dipPhase > 0.45) {
                  g.dipDone = true;
                  if (vfx && isWater) {
                    vfx.addRipple(g.x, g.y, 1.2 * sMul, 8.5 * sMul, 0.6, 1.2);
                    vfx.spawnSplash(g.x, g.y, 3, 0.55 * sMul, habitat.fx);
                  }
                }

                if (g.timer <= 0) {
                  g.mode = 'returning';
                  claimOwnFreeSlot(g, i);
                }
              }
            } else if (g.mode === 'returning') {
              if (!g.slot || g.slot.occupiedBy !== g.riderId) {
                claimOwnFreeSlot(g, i);
              }
              if (g.slot) {
                const res = MountSystem.stepApproachAndMount(g, instance, g.slot, dt, params, {
                  speed: 25.0 * sMul,
                  arriveDist: 2.0 * sMul,
                  arcLift: 8.5 * sMul,
                  arcSpan: 28.0 * sMul,
                  yawOffset: g.yawOff
                });
                if (res.mounted) {
                  g.mode = 'perched';
                  g.timer = 4.2 + ((g.idx * 1.7 + Math.floor(time)) % 4.5);
                }
              } else {
                // 6 个挂点都被外部生物占满时，切入绕母体盘旋等待空位
                g.mode = 'rally';
              }
            } else if (g.mode === 'rally') {
              // 母体沉身翻浪时：齐刷刷绕母体护巢盘旋
              const dir = i % 2 === 0 ? 1 : -1;
              g.rallyAng = wrapAngle(g.rallyAng + dt * dir * (1.85 + (i % 3) * 0.22));
              const orbR = Math.min(g.rallyRad * sMul, Math.max(18.0, guestLimitR - Math.hypot(state.x, state.y) * 0.35));
              let tx = state.x + Math.cos(g.rallyAng) * orbR;
              let ty = state.y + Math.sin(g.rallyAng) * orbR;
              const tLen = Math.hypot(tx, ty);
              if (tLen > guestLimitR && tLen > 0.001) {
                tx *= guestLimitR / tLen;
                ty *= guestLimitR / tLen;
              }
              const tz = (26.5 + Math.sin(time * 3.2 + g.idx * 1.2) * 3.0) * sMul;
              const px = g.x, py = g.y;
              g.x = lerp(g.x, tx, expSmooth(dt, 6.2));
              g.y = lerp(g.y, ty, expSmooth(dt, 6.2));
              g.z = lerp(g.z, tz, expSmooth(dt, 6.2));
              const vx = (g.x - px) / Math.max(dt, 0.001);
              const vy = (g.y - py) / Math.max(dt, 0.001);
              if (Math.hypot(vx, vy) > 0.5) {
                g.yaw = wrapAngle(g.yaw + wrapAngle(Math.atan2(-vx, vy) - g.yaw) * expSmooth(dt, 10.0));
              }

              // 若波浪已结束且出现空闲挂点，自动返回停靠
              if (state.waveMode === 'calm' && claimOwnFreeSlot(g, i)) {
                g.mode = 'returning';
              }
            }

            // 小水鸟活动边界严格钳制在圆台内
            const gDist = Math.hypot(g.x, g.y);
            if (gDist > guestLimitR && gDist > 0.001) {
              g.x *= guestLimitR / gDist;
              g.y *= guestLimitR / gDist;
            }
          }

          // 更新内部通用挂点
          const [headWX, headWY] = localToWorldXY(state.x, state.y, state.yaw, 0, 31.0 * sMul);
          sockets.setWorld('head', headWX, headWY, state.z + (10.0 + state.headLift) * sMul, wrapAngle(state.yaw + state.headYawRel));
          sockets.setWorld('shellTop', state.x, state.y, state.z + 20.5 * sMul, state.yaw);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? habitat.waterLevel : 2.8;
          const yw = state.yaw;
          const bz = state.z;

          // 1. 4 条沉重涉水粗足（大腿段 + 带蹼粗足掌，浸水染水色）
          for (let i = 0; i < gait.legs.length; i++) {
            const lg = gait.legs[i];
            const legYaw = wrapAngle(yw + (lg.isLeft ? 0.22 : -0.22));
            const footLift = Math.max(0.2, lg.footZ);
            const footSub = EnvFeedback.calcSubmerge(footLift + 1.2 * sMul, waterLvl, 4.2, isWater) * 0.78;
            const kneeLift = Math.max(1.2, lg.kneeZ);
            const kneeSub = EnvFeedback.calcSubmerge(kneeLift + 1.0 * sMul, waterLvl, 4.4, isWater) * 0.55;

            list.push({
              partKey: 'legUpper',
              asset: parts.legUpper,
              x: lerp(lg.hipWX, lg.kneeX, 0.55),
              y: lerp(lg.hipWY, lg.kneeY, 0.55),
              lift: kneeLift,
              ro: legYaw,
              bias: -1.1,
              submerge: kneeSub
            });
            list.push({
              partKey: 'legFoot',
              asset: parts.legFoot,
              x: lg.footX,
              y: lg.footY,
              lift: footLift,
              ro: legYaw,
              bias: -1.25,
              submerge: footSub
            });
          }

          // 2. 软边鳖尾物理链（2 节尾节 + 扁宽软边尾叶）
          const tNodes = tailChain.nodes;
          for (let i = 1; i <= 2; i++) {
            const tn = tNodes[i];
            list.push({
              partKey: 'tailSeg',
              asset: parts.tailSeg,
              x: tn.x,
              y: tn.y,
              lift: Math.max(0.4, tn.z),
              ro: tn.yaw,
              bias: -0.95,
              submerge: EnvFeedback.calcSubmerge(tn.z + 0.8 * sMul, waterLvl, 4.2, isWater) * 0.72
            });
          }
          const tLast = tNodes[3];
          const [ttx, tty] = pivotToWorldXY(tLast.x, tLast.y, tLast.yaw, TAIL_TIP_PIVOT.x * sMul, TAIL_TIP_PIVOT.y * sMul);
          list.push({
            partKey: 'tailTip',
            asset: parts.tailTip,
            x: ttx,
            y: tty,
            lift: Math.max(0.3, tLast.z - 0.4 * sMul),
            ro: tLast.yaw,
            bias: -1.05,
            submerge: EnvFeedback.calcSubmerge(tLast.z + 0.5 * sMul, waterLvl, 4.2, isWater) * 0.82
          });

          // 3. 中央双轴对称巨背甲 + 4 块共享软裙边（深嵌中央主甲 7.5 格，360° 零接缝且极省图集）
          const skirtSub = EnvFeedback.calcSubmerge(bz + 1.8 * sMul, waterLvl, 4.4, isWater) * 0.62;
          const [flx, fly] = localToWorldXY(state.x, state.y, yw, -15.6 * sMul, 0);
          const [frx, fry] = localToWorldXY(state.x, state.y, yw,  15.6 * sMul, 0);
          const [ffx, ffy] = localToWorldXY(state.x, state.y, yw, 0,  15.2 * sMul);
          const [frrX, frrY] = localToWorldXY(state.x, state.y, yw, 0, -15.2 * sMul);

          list.push({
            partKey: 'shellSkirtL',
            asset: parts.shellSkirtL,
            x: flx, y: fly,
            lift: Math.max(0.4, bz + 1.2 * sMul),
            ro: wrapAngle(yw + Math.PI * 0.5),
            bias: -0.25,
            submerge: skirtSub
          });
          list.push({
            partKey: 'shellSkirtR',
            asset: parts.shellSkirtR,
            x: frx, y: fry,
            lift: Math.max(0.4, bz + 1.2 * sMul),
            ro: wrapAngle(yw - Math.PI * 0.5),
            bias: -0.25,
            submerge: skirtSub
          });
          list.push({
            partKey: 'shellSkirtB',
            asset: parts.shellSkirtB,
            x: frrX, y: frrY,
            lift: Math.max(0.4, bz + 1.2 * sMul),
            ro: wrapAngle(yw + Math.PI),
            bias: -0.20,
            submerge: skirtSub
          });
          list.push({
            partKey: 'shellSkirtF',
            asset: parts.shellSkirtF,
            x: ffx, y: ffy,
            lift: Math.max(0.4, bz + 1.5 * sMul),
            ro: yw,
            bias: -0.10,
            submerge: skirtSub
          });
          list.push({
            partKey: 'shellCore',
            asset: parts.shellCore,
            x: state.x, y: state.y,
            lift: Math.max(0.8, bz + 2.2 * sMul),
            ro: yw,
            symDeg: 180,
            bias: 0.30,
            submerge: 0
          });

          // 4. 鸟喙头与 2 节颈链（联动抬头 + 独立缓摆环视）
          const neckYaw1 = wrapAngle(yw + state.headYawRel * 0.42);
          const neckYaw2 = wrapAngle(yw + state.headYawRel * 0.78);
          const headYaw  = wrapAngle(yw + state.headYawRel);
          const [n1x, n1y] = localToWorldXY(state.x, state.y, yw, 0, 22.0 * sMul);
          const [n2x, n2y] = localToWorldXY(n1x, n1y, neckYaw1, 0, 6.2 * sMul);
          const [hjx, hjy] = localToWorldXY(n2x, n2y, neckYaw2, 0, 5.8 * sMul);
          const [hx, hy]   = pivotToWorldXY(hjx, hjy, headYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);

          const neckZ1 = Math.max(1.2, bz + (3.6 + state.headLift * 0.35) * sMul);
          const neckZ2 = Math.max(1.5, bz + (4.4 + state.headLift * 0.68) * sMul);
          const headZ  = Math.max(1.8, bz + (4.2 + state.headLift) * sMul);

          list.push({
            partKey: 'neckSeg',
            asset: parts.neckSeg,
            x: n1x, y: n1y,
            lift: neckZ1,
            ro: neckYaw1,
            bias: 0.15,
            submerge: EnvFeedback.calcSubmerge(neckZ1, waterLvl, 4.2, isWater) * 0.45
          });
          list.push({
            partKey: 'neckSeg',
            asset: parts.neckSeg,
            x: n2x, y: n2y,
            lift: neckZ2,
            ro: neckYaw2,
            bias: 0.25,
            submerge: EnvFeedback.calcSubmerge(neckZ2, waterLvl, 4.2, isWater) * 0.35
          });
          list.push({
            partKey: 'headBeak',
            asset: parts.headBeak,
            x: hx, y: hy,
            lift: headZ,
            ro: headYaw,
            bias: 0.55,
            submerge: state.waveMode === 'sink' ? EnvFeedback.calcSubmerge(headZ, waterLvl, 4.0, isWater) * 0.45 : 0
          });

          // 5. 背甲弹簧摇曳水草与青灰苔石（偏正 bias 贴合背甲不穿模，symDeg=90 极省图集）
          for (let i = 0; i < SHELL_PROPS.length; i++) {
            const prop = SHELL_PROPS[i];
            const sway = prop.kind === 'stone' ? 0 : reedSprings[i].x;
            const [px, py] = localToWorldXY(
              state.x, state.y, yw,
              (prop.lx + sway * 1.15) * sMul,
              (prop.ly + Math.abs(sway) * 0.35) * sMul
            );
            const pz = Math.max(2.0, bz + (evalShellTopZ(prop.lx, prop.ly) - 0.8) * sMul);
            const key = prop.kind === 'stone' ? 'mossStone' : prop.kind;
            list.push({
              partKey: key,
              asset: parts[key],
              x: px, y: py,
              lift: pz,
              ro: wrapAngle(yw + prop.phase + sway * 0.85),
              symDeg: 90,
              bias: 0.85,
              submerge: 0
            });
          }

          // 6. 5 只共享贴图背上小水鸟（停靠时 bias=+1.6 防穿进背甲，飞起时 bias=+4.2）
          for (let i = 0; i < guests.length; i++) {
            const g = guests[i];
            const isAir = g.mode !== 'perched';
            const gKey = isAir
              ? (Math.sin(g.flapPhase) >= 0 ? 'guestFlyUp' : 'guestFlyDown')
              : 'guestStand';
            list.push({
              partKey: gKey,
              asset: parts[gKey],
              x: g.x,
              y: g.y,
              lift: Math.max(1.2, g.z),
              ro: g.yaw,
              bias: isAir ? 4.2 : 1.6,
              submerge: 0
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Water4Def.id,
            code: Water4Def.code,
            status: Water4Def.status,
            name: Water4Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            waveMode: state.waveMode,
            mountSocketCount: mountSockets.length,
            guestCount: guests.length,
            guestModes: guests.map(g => g.mode),
            footRadius: Water4Def.footRadius,
            headZ: 22,
            centerZ: 10,
            blocks: Water4Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Water4Def);
})(window.PixelWorkshop);
