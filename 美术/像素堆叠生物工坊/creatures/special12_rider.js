'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, fbm1 } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // M17 · 骑兽猎手（双体共生 / 骑乘组合模板标杆 · +Y 正前，z=0 贴地）
  //
  // 【前置调研与三维几何坐标预算】
  // 1. 原型与运动学调研：
  //    - 林地大角坐骑参照马鹿/角兽解剖比例：前胸深厚、肩峰微隆、粗颈斜昂、多叉大角、
  //      四肢修长（前肘向后折 kneeSign=-1，后膝向前折 kneeSign=+1）；
  //    - 坐骑采用 trot 弹性对角小跑（BL+FR / BR+FL 反相 0.50、微错相 0.05、占空比 β≈0.54、
  //      抬脚高度约腿长 25% 写实不踢正步）+ stalk 巡游性格，后腿通过 legAnchors 绑定独立腰胯，
  //      转弯屈脊绝不脱胯；
  //    - 双体骑乘次级物理传递：骑手骨盆与双腿锚死在坐骑鞍座挂点 sockets.get('saddle')，
  //      骑手上身叠加二阶弹簧阻尼（SpringDamper1D）传递垂直颠簸（欠阻尼滞后 ~0.1s）与
  //      加减速前后倾微移，头部与持矛右臂具备独立于坐骑的左右扫视警戒逻辑；
  //    - 骑手后肩挂接 4 节布质披风弹簧链（ChainSolver 距离+转角约束），奔跑飞扬、驻足轻垂；
  //    - 伴生立体体素小型林间猎隼（振翅/滑翔/收翅立姿 3 档无损烘焙）：巡游时在头顶前上方
  //      绕大圈领飞侦察；停步驻足或原地待机（S 键）时俯冲刹车轻巧落在猎手抬起的左臂护甲上
  //      收翅理羽，同时猎手右手收矛、微微前倾轻拍坐骑脖颈，坐骑惬意甩耳并前蹄轻刨草地两下，
  //      片刻后猎隼振翅腾空重新领航。
  // 2. 三维几何坐标预算（单部件 <= 40 格，关节重叠率 >= 45%，总图集 <= 28MB）：
  //    - 坐骑 baseLift = 8.4；四足 hipZ = 3.6（髋世界 Z ≈ 12.0），L1 = 6.2, L2 = 6.4；
  //    - 坐骑胸肩 mountChest (16×18×14) 世界 Z ∈ [9.4, 20.4]，背部鞍槽局部 z ≈ 10.6；
  //    - 坐骑腰胯 mountPelvis (15×17×13) 枢轴 (0, 4.2) 锁死在胸后 (0, -4.2)，重叠 > 55%；
  //    - 坐骑颈部 mountNeck (11×13×12) + 鹿角兽头 mountHead (18×18×17)，鹿角顶世界 Z ≈ 35.6；
  //    - 鞍座挂点 saddle 位于胸肩局部 (0, -0.8, 10.6)，世界 Z ≈ 19.0；
  //    - 骑手骨盆与夹腿 riderPelvis (15×11×9) 锚死 saddle，双腿跨于 X=±5.4（贴合坐骑体宽 ±5.2 外侧），
  //      0 穿模、0 脱座；
  //    - 骑手上身 riderTorso (12×10×10) 重叠骨盆 3.5 格（>50%），兜帽头 riderHead (10×11×10) 独立转头；
  //    - 右手持矛 riderArmSpearHold (10×22×16) / 拍颈 riderArmPat (10×14×12) + 鞍侧收矛 saddleSpear (6×18×12)；
  //    - 左手拉缰 riderArmRein (8×12×9) / 抬臂架鹰 riderArmPerch (10×12×10) 提供 falconPerch 挂点。
  // 3. 现有内核盘点：
  //    - 直接复用 core/solvers.js 的 MultiLegGaitSolver(trot)、ChainSolver、SpringDamper1D、SocketTracker
  //      与 core/behaviors.js 的 Propulsion.multiLegWalk(stalk)、walkToPoint、EnvFeedback；零改动 core/。
  // 4. 画质与规范铁律：
  //    - 调色板 42 色（<=48、零重色）、glowKeys: []（eyeGlint 绝不进 glowKeys）、零常态小数缩放、
  //      偏心部件全部使用 pivotToWorldXY 锁死枢轴、parts 完整注册支持同屏共享贴图。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 坐骑林地兽毛主体
      coatDark:     '#573420',
      coatMid:      '#8c5735',
      coatHi:       '#c4885a',
      // 坐骑深色肩鬃与背脊纹
      maneDark:     '#2e1a12',
      maneMid:      '#4f2e20',
      maneHi:       '#754732',
      // 坐骑浅暖腹毛与吻毛
      bellyDark:    '#a68b6c',
      bellyMid:     '#d9be9c',
      bellyHi:      '#f5e5cc',
      // 多叉林地大鹿角（骨白）
      antlerDark:   '#8c7e68',
      antlerMid:    '#ccbfa6',
      antlerHi:     '#f2ead8',
      // 坐骑硬蹄与鼻垫
      hoofDark:     '#1c1718',
      hoofMid:      '#383033',
      hoofHi:       '#594e52',
      // 皮革鞍座、缰绳与骑手靴带
      leatherDark:  '#3d2114',
      leatherMid:   '#6b3c24',
      leatherHi:    '#9c5e3a',
      // 坐骑鞍毯与骑手苍林披风/兜帽布料
      clothDark:    '#1f422b',
      clothMid:     '#356e45',
      clothHi:      '#5ea368',
      // 骑手皮甲与护臂
      armorDark:    '#4a3c30',
      armorMid:     '#7a6550',
      armorHi:      '#ad9476',
      // 长矛木柄与护具饰带
      woodDark:     '#472c1a',
      woodMid:      '#784e30',
      woodHi:       '#ab784e',
      // 长矛铁尖与带扣金属
      steelDark:    '#57616e',
      steelMid:     '#94a2b3',
      steelHi:      '#d7e2ed',
      // 矛饰与披风滚边（暖赤点缀）
      trimDark:     '#782320',
      trimMid:      '#bd3c33',
      trimHi:       '#eb6d5b',
      // 骑手肤色/面罩中段
      skinDark:     '#9e7356',
      skinMid:      '#cfa07e',
      skinHi:       '#f0c8a8',
      // 猎隼羽色（深褐翼羽 + 浅斑胸羽）
      falconDark:   '#3b281e',
      falconMid:    '#6b4b38',
      falconHi:     '#a37a5d',
      // 猎隼浅腹羽与喙爪
      beakDark:     '#9e7222',
      beakMid:      '#deaa3c',
      beakHi:       '#fce07c',
      // 兽眼与隼眼（eyeGlint 绝不进 glowKeys）
      eyeDark:      '#120f14',
      eyeIris:      '#e8a82e',
      eyeGlint:     '#f7fbff'
    },
    glowKeys: [],
    parts: [
      'mountChest', 'mountPelvis', 'mountNeck', 'mountHead', 'mane', 'belly', 'antler', 'hoof', 'ear', 'eye', 'leg',
      'saddle', 'cloth', 'riderPelvis', 'riderTorso', 'riderHead', 'armor', 'skin', 'cape', 'wood', 'steel', 'trim',
      'falconBody', 'falconWing', 'beak'
    ],
    noCrease: [
      ['mountChest', 'mane'], ['mountChest', 'belly'], ['mountPelvis', 'belly'], ['mountPelvis', 'mane'],
      ['mountNeck', 'mane'], ['mountNeck', 'belly'], ['mountHead', 'belly'], ['mountHead', 'ear'], ['mountHead', 'eye'],
      ['mountHead', 'hoof'], ['leg', 'mane'], ['leg', 'hoof'],
      ['saddle', 'cloth'], ['saddle', 'trim'], ['cloth', 'trim'], ['cape', 'trim'],
      ['riderTorso', 'armor'], ['riderTorso', 'cloth'], ['riderHead', 'cloth'], ['riderHead', 'skin'], ['riderHead', 'eye'],
      ['wood', 'trim'], ['falconBody', 'falconWing'], ['falconBody', 'belly'], ['falconBody', 'beak'], ['falconBody', 'eye']
    ],
    materials: {
      coat:    ['coatDark',    'coatMid',    'coatHi'],
      mane:    ['maneDark',    'maneMid',    'maneHi'],
      belly:   ['bellyDark',   'bellyMid',   'bellyHi'],
      antler:  ['antlerDark',  'antlerMid',  'antlerHi'],
      hoof:    ['hoofDark',    'hoofMid',    'hoofHi'],
      leather: ['leatherDark', 'leatherMid', 'leatherHi'],
      cloth:   ['clothDark',   'clothMid',   'clothHi'],
      armor:   ['armorDark',   'armorMid',   'armorHi'],
      wood:    ['woodDark',    'woodMid',    'woodHi'],
      steel:   ['steelDark',   'steelMid',   'steelHi'],
      trim:    ['trimDark',    'trimMid',    'trimHi'],
      skin:    ['skinDark',    'skinMid',    'skinHi'],
      falcon:  ['falconDark',  'falconMid',  'falconHi'],
      beak:    ['beakDark',    'beakMid',    'beakHi']
    },
    protectedParts: ['eye', 'antler', 'steel', 'beak', 'trim']
  });

  // 4 套换色皮肤（严守用词规范）
  const SKINS = [
    {
      id: 'forest_brown_rider',
      name: '苍林褐骑（林地经典）',
      dot: '#3d784c',
      outline: '#141712',
      pal: {},
      fx: { dust: '#a89274', feather: '#8f6a4f', leaf: '#5ea368' }
    },
    {
      id: 'crimson_sand_rider',
      name: '赤甲沙骑（荒漠款）',
      dot: '#c94932',
      outline: '#1c100c',
      pal: {
        coatDark:    '#8c673e', coatMid:    '#c99d65', coatHi:    '#f0cca0',
        maneDark:    '#57341a', maneMid:    '#85512a', maneHi:    '#b37544',
        bellyDark:   '#b89c78', bellyMid:   '#e6cfad', bellyHi:   '#faf0d9',
        antlerDark:  '#9c896a', antlerMid:  '#d9c6a3', antlerHi:  '#faf0d7',
        clothDark:   '#7a1e1c', clothMid:   '#bf362c', clothHi:   '#f06754',
        armorDark:   '#6e2f20', armorMid:   '#ad4f34', armorHi:   '#e07e55',
        trimDark:    '#9c6b1c', trimMid:    '#de9e31', trimHi:    '#fae078',
        steelDark:   '#785f3c', steelMid:   '#b8955c', steelHi:   '#f2d694',
        falconDark:  '#63331e', falconMid:  '#a35833', falconHi:  '#d98b5b',
        eyeIris:     '#ffb833'
      },
      fx: { dust: '#d1b588', feather: '#c97847', leaf: '#e07e55' }
    },
    {
      id: 'frost_fur_rider',
      name: '霜绒雪骑（寒原款）',
      dot: '#7cb5d9',
      outline: '#101824',
      pal: {
        coatDark:    '#6c7e91', coatMid:    '#a6bad0', coatHi:    '#e3eef7',
        maneDark:    '#3c4e61', maneMid:    '#637c96', maneHi:    '#9bb4cc',
        bellyDark:   '#9fb2c4', bellyMid:   '#d4e3f0', bellyHi:   '#f7fbff',
        antlerDark:  '#42708c', antlerMid:  '#78b2d1', antlerHi:  '#c7ecff',
        leatherDark: '#2f3a47', leatherMid: '#516275', leatherHi: '#7e93ab',
        clothDark:   '#1c446b', clothMid:   '#3274ab', clothHi:   '#6cb4e8',
        armorDark:   '#4d5a69', armorMid:   '#7e91a6', armorHi:   '#b8cadb',
        trimDark:    '#7a2638', trimMid:    '#bf435a', trimHi:    '#f28599',
        falconDark:  '#596573', falconMid:  '#94a3b5', falconHi:  '#dbe5f0',
        eyeIris:     '#57d8ff'
      },
      fx: { dust: '#c2d4e6', feather: '#c2d3e3', leaf: '#6cb4e8' }
    },
    {
      id: 'iron_ink_rider',
      name: '玄铁墨骑（古迹款）',
      dot: '#454857',
      outline: '#0c0d14',
      pal: {
        coatDark:    '#23242e', coatMid:    '#3d3f4f', coatHi:    '#64687d',
        maneDark:    '#14151c', maneMid:    '#262836', maneHi:    '#414459',
        bellyDark:   '#4f5161', bellyMid:   '#7c7f94', bellyHi:   '#b0b3c7',
        antlerDark:  '#75592e', antlerMid:  '#b38c4b', antlerHi:  '#e8c67d',
        leatherDark: '#261d1c', leatherMid: '#473634', leatherHi: '#6e5652',
        clothDark:   '#3d1c2e', clothMid:   '#6e304e', clothHi:   '#a85277',
        armorDark:   '#2b303b', armorMid:   '#4d5566', armorHi:   '#7d899e',
        trimDark:    '#825c1c', trimMid:    '#c79232', trimHi:    '#f5cb69',
        falconDark:  '#1c1c24', falconMid:  '#363745', falconHi:  '#5c5e73',
        eyeIris:     '#f2a629'
      },
      fx: { dust: '#8c8a84', feather: '#525466', leaf: '#a85277' }
    }
  ];

  // =========================================================================
  // 1. 下体 · 坐骑独立胸肩 + 皮革鞍毯与鞍座（16×18×14）
  //    背部中央做出浅凹鞍槽（局部 z ≈ 10.6），两侧垂挂雕边鞍毯，前后立起鞍桥
  // =========================================================================
  function buildMountChest(makeCanvas) {
    const W = 16, D = 18, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-7.0, 7.0, -8.2, 8.2, 1, H - 1, (x, y, z, X, Y) => {
      // 深厚健壮的鹿科胸廓 + 微隆肩峰 + 后腰衔接段
      const dChest = (Math.hypot(X / 5.1, (Y - 1.0) / 6.4, (z - 6.2) / 4.6) - 1.0) * 4.8;
      const dWithers = (Math.hypot(X / 4.4, (Y - 3.0) / 4.2, (z - 8.8) / 3.4) - 1.0) * 3.8;
      const dWaist = (Math.hypot(X / 4.4, (Y + 4.4) / 4.4, (z - 6.4) / 3.9) - 1.0) * 3.8;
      const d = smin(smin(dChest, dWithers, 1.8), dWaist, 1.8);
      if (d > 0) return;

      const isBelly = z < 4.3 && Math.abs(X) < 3.4 && Y > -4.8;
      const isMane = Y > 2.4 && z > 8.6 && Math.abs(X) < 2.2;
      if (isBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (isMane) {
        m.setRaw(x, y, z, mat('mane'), partId.mane);
      } else {
        m.setRaw(x, y, z, mat('coat'), partId.mountChest);
      }
    });

    // 胸前丰厚绒毛
    m.paintEllipsoid(0, 5.8, 5.4, 3.0, 2.2, 2.5, mat('mane'), partId.mane, true);

    // 背部皮革鞍毯（覆在胸背中后段 Y ∈ [-5.2, 2.8]，两侧垂落至 X = ±5.3）
    m.fillAABB(-6.2, 6.2, -5.6, 3.2, 5, 12, (x, y, z, X, Y) => {
      const rx = 5.4, ry = 4.4;
      const ell = Math.hypot(X / rx, (Y + 1.0) / ry);
      if (ell > 1.02) return;
      // 仅贴在躯干表层外缘形成厚实鞍毯
      const bodyCheck = Math.hypot(X / 4.5, (Y + 0.5) / 5.5, (z - 6.2) / 4.1);
      if (bodyCheck < 0.86 || bodyCheck > 1.24) return;
      if (z < 5.4) return;
      const isTrim = (Math.abs(Y + 1.0) > 3.2 || z <= 6.2) && ell > 0.72;
      m.setRaw(x, y, z, isTrim ? mat('trim') : mat('cloth'), isTrim ? partId.trim : partId.cloth);
    });

    // 皮革鞍座主体 + 前后鞍桥（精准托住骑手骨盆，不遮挡不悬空）
    m.paintEllipsoid(0, -0.8, 10.2, 4.1, 3.3, 1.4, mat('leather'), partId.saddle, true);
    // 前鞍桥微翘
    m.paintEllipsoid(0, 2.0, 11.4, 3.3, 1.2, 1.4, mat('leather'), partId.saddle, true);
    // 后鞍桥微翘
    m.paintEllipsoid(0, -3.5, 11.5, 3.4, 1.2, 1.5, mat('leather'), partId.saddle, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.4, headZ: 14, centerZ: 7 });
  }

  // =========================================================================
  // 2. 下体 · 坐骑独立腰胯（15×17×13，枢轴锁死在前腰 (0, 4.2)）
  // =========================================================================
  const MOUNT_PELVIS_PIVOT = { x: 0, y: 4.2 };
  function buildMountPelvis(makeCanvas) {
    const W = 15, D = 17, H = 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.5, 6.5, -7.8, 7.2, 1, H - 1, (x, y, z, X, Y) => {
      const dWaist = (Math.hypot(X / 4.2, (Y - 2.4) / 4.6, (z - 6.3) / 3.8) - 1.0) * 3.8;
      const dHip   = (Math.hypot(X / 4.9, (Y + 2.4) / 5.2, (z - 6.6) / 4.2) - 1.0) * 4.2;
      const d = smin(dWaist, dHip, 1.8);
      if (d > 0) return;
      const isBelly = z < 4.5 && Math.abs(X) < 3.0 && Y > -4.6;
      const isBackStripe = Math.abs(X) < 1.1 && z > 9.4;
      if (isBelly) m.setRaw(x, y, z, mat('belly'), partId.belly);
      else if (isBackStripe) m.setRaw(x, y, z, mat('mane'), partId.mane);
      else m.setRaw(x, y, z, mat('coat'), partId.mountPelvis);
    });

    // 鹿科翘起小短尾（深背浅底）
    m.paintCapsule(0, -6.0, 7.6, 0, -7.4, 5.4, 1.45, 0.85, mat('coat'), partId.mountPelvis, true);
    m.paintEllipsoid(0, -6.5, 5.8, 1.05, 0.95, 1.25, mat('belly'), partId.belly, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.4, headZ: 12, centerZ: 6 });
  }

  // =========================================================================
  // 3. 下体 · 坐骑独立颈部（11×13×12，枢轴锁死在胸肩前根 (0, -2.4)）
  // =========================================================================
  const MOUNT_NECK_PIVOT = { x: 0, y: -2.4 };
  function buildMountNeck(makeCanvas) {
    const m = new VoxelModel(11, 13, 12, SPEC);
    const { mat, partId } = SPEC;
    // 粗壮斜昂鹿颈 + 颈下丰厚深色垂鬃 + 颈部皮缰环
    m.paintCapsule(0, -2.6, 1.8, 0, 2.4, 9.2, 3.3, 2.55, mat('coat'), partId.mountNeck, true);
    m.paintCapsule(0, -1.6, 1.4, 0, 3.0, 6.8, 2.5, 1.9, mat('mane'), partId.mane, true);
    m.paintCapsule(0, -2.8, 4.6, 0, 1.4, 10.2, 1.4, 1.05, mat('mane'), partId.mane, true);
    // 颈部皮革项环（连接骑手缰绳）
    m.paintEllipsoid(0, 0.6, 5.8, 2.95, 2.5, 0.95, mat('leather'), partId.saddle, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 4. 下体 · 坐骑昂首鹿角兽头（2 档无损烘焙：alert 昂首 / happy 惬意甩耳微俯）
  //    尺寸 18×18×17，枢轴锁死在枕骨根 (0, -3.6)
  // =========================================================================
  const MOUNT_HEAD_PIVOT = { x: 0, y: -3.6 };
  function buildMountHead(makeCanvas, pose) {
    const isHappy = pose === 'happy';
    const W = 18, D = 18, H = 17;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    const skullZ = isHappy ? 4.4 : 5.2;
    const snoutZ = isHappy ? 3.2 : 4.2;

    // 鹿科修长颅骨 + 颊部
    m.paintEllipsoid(0, -0.6, skullZ, 3.2, 4.0, 3.2, mat('coat'), partId.mountHead, true);
    // 修长鹿吻 + 浅色唇颊
    m.paintCapsule(0, 1.4, skullZ - 0.3, 0, 5.8, snoutZ, 2.35, 1.65, mat('coat'), partId.mountHead, true);
    m.paintEllipsoid(0, 4.4, snoutZ - 0.9, 1.85, 2.2, 1.05, mat('belly'), partId.belly, true);
    // 深色鼻端
    m.paintEllipsoid(0, 7.2, snoutZ + 0.2, 1.15, 0.85, 0.95, mat('hoof'), partId.hoof, true);

    // 皮革笼头缰带
    m.paintEllipsoid(0, 4.2, snoutZ + 0.1, 2.05, 0.85, 1.45, mat('leather'), partId.saddle, true);
    m.paintEllipsoid(0, 0.8, skullZ - 0.2, 3.35, 0.9, 1.9, mat('leather'), partId.saddle, true);

    // 灵敏双鹿耳（happy 态惬意微向两侧舒展）
    for (const s of [-1, 1]) {
      const earTipX = isHappy ? s * 5.2 : s * 4.2;
      const earTipY = isHappy ? -3.4 : -2.6;
      const earTipZ = isHappy ? skullZ + 3.2 : skullZ + 4.4;
      m.paintCapsule(s * 2.2, -1.8, skullZ + 1.8, earTipX, earTipY, earTipZ, 1.15, 0.65, mat('coat'), partId.ear, true);
      m.paintCapsule(s * 2.4, -1.5, skullZ + 2.0, earTipX * 0.92, earTipY + 0.4, earTipZ - 0.3, 0.72, 0.48, mat('belly'), partId.belly, true);
    }

    // 多叉林地大鹿角（左右对称，主干后展上扬 + 眉叉前探 + 顶叉双分，轮廓极具气势）
    for (const s of [-1, 1]) {
      // 主角干下段
      m.paintCapsule(s * 1.6, -0.4, skullZ + 2.4, s * 4.4, -1.8, skullZ + 6.4, 1.12, 0.94, mat('antler'), partId.antler, true);
      // 主角干上段外展（梢端加厚防斜角断粒）
      m.paintCapsule(s * 4.4, -1.8, skullZ + 6.4, s * 7.0, -3.0, skullZ + 10.2, 0.94, 0.74, mat('antler'), partId.antler, true);
      // 前探眉叉
      m.paintCapsule(s * 2.8, -0.8, skullZ + 4.2, s * 3.8, 2.5, skullZ + 6.4, 0.82, 0.68, mat('antler'), partId.antler, true);
      // 中段侧叉
      m.paintCapsule(s * 4.8, -2.0, skullZ + 6.8, s * 6.4, 0.5, skullZ + 9.2, 0.80, 0.68, mat('antler'), partId.antler, true);
      // 顶分内叉
      m.paintCapsule(s * 5.6, -2.4, skullZ + 8.4, s * 4.5, -1.6, skullZ + 11.0, 0.76, 0.66, mat('antler'), partId.antler, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 表面贴合 2×2 琥珀兽眼（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.2);
    const eyeZ = Math.round(skullZ + 0.4);
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 6; step++) {
        const tx = Math.round(hw + s * (3.8 - step));
        const p = m.getPartId(tx, eyeY, eyeZ);
        if (p === partId.mountHead || p === partId.belly) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 2.5);
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dy === 1)
            ? keyToId.eyeGlint
            : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 5.0, headZ: 16, centerZ: 7 });
  }

  // =========================================================================
  // 5. 下体 · 坐骑高重叠连贯 IK 腿段与硬蹄
  // =========================================================================
  function buildMountLimbSeg(makeCanvas, rTop, rBot, hLen, darkLower) {
    const S = Math.max(6, Math.ceil(Math.max(rTop, rBot) * 2 + 3));
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.1, 0, 0, H - 1.1, rBot, rTop, mat(darkLower ? 'mane' : 'coat'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildMountHoof(makeCanvas) {
    const m = new VoxelModel(7, 8, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 2.4, 0, 0.4, 4.0, 1.45, 1.35, mat('mane'), partId.leg, true);
    m.paintEllipsoid(0, 0.6, 1.3, 1.65, 1.95, 1.35, mat('hoof'), partId.hoof, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0 });
  }

  // =========================================================================
  // 6. 上体 · 骑手骨盆与跨骑双腿（15×11×9，锚死在 saddle 挂点，双腿跨于 X=±5.4 绝不穿模）
  // =========================================================================
  function buildRiderPelvis(makeCanvas) {
    const W = 15, D = 11, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 骑手腰胯与皮甲腰带（局部 z ∈ [4.5, 8.2]，正坐于鞍座表面）
    m.paintEllipsoid(0, 0.0, 6.2, 3.8, 2.8, 2.1, mat('armor'), partId.riderPelvis, true);
    m.paintEllipsoid(0, 0.0, 7.4, 3.9, 2.9, 0.85, mat('leather'), partId.saddle, true);
    // 腰带金属扣
    m.paintEllipsoid(0, 2.7, 7.4, 0.95, 0.65, 0.75, mat('steel'), partId.steel, true);

    // 左右跨骑大腿 + 小腿皮靴（避开坐骑中央 X ∈ [-4.4, 4.4]，沿鞍毯外侧自然下垂）
    for (const s of [-1, 1]) {
      // 大腿外跨段
      m.paintCapsule(s * 3.4, 0.2, 6.0, s * 5.6, 1.2, 3.8, 1.55, 1.35, mat('armor'), partId.riderPelvis, true);
      // 膝部微屈向下至马镫靴位
      m.paintCapsule(s * 5.6, 1.2, 3.8, s * 5.5, 0.4, 1.1, 1.30, 1.25, mat('leather'), partId.saddle, true);
      // 前探靴尖
      m.paintEllipsoid(s * 5.5, 1.6, 1.0, 1.15, 1.55, 0.95, mat('leather'), partId.saddle, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.2, headZ: 8, centerZ: 4 });
  }

  // =========================================================================
  // 7. 上体 · 骑手独立躯干（12×10×10，叠在骨盆上方，叠加二阶弹簧颠簸与加减速倾角）
  // =========================================================================
  function buildRiderTorso(makeCanvas) {
    const W = 12, D = 10, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 猎手皮甲胸腹（下接腰胯，上宽肩挺拔）
    m.paintCapsule(0, 0, 1.2, 0, 0.2, 7.2, 3.1, 3.7, mat('armor'), partId.riderTorso, true);
    // 苍林林地短斗篷披肩（覆盖双肩与后背）
    m.paintEllipsoid(0, -0.4, 7.0, 4.6, 3.1, 2.2, mat('cloth'), partId.cloth, true);
    // 披肩赤色饰边
    m.paintEllipsoid(0, -0.6, 5.4, 4.7, 3.1, 0.72, mat('trim'), partId.trim, true);
    // 胸前斜挎皮肩带 + 金属胸扣
    m.paintCapsule(-2.8, 2.4, 7.6, 2.6, 2.5, 2.2, 0.78, 0.78, mat('leather'), partId.saddle, true);
    m.paintEllipsoid(0.0, 3.0, 5.4, 0.95, 0.70, 0.85, mat('steel'), partId.steel, true);
    // 颈领
    m.paintCapsule(0, 0.2, 7.8, 0, 0.4, 9.2, 1.85, 1.65, mat('cloth'), partId.cloth, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 9, centerZ: 5 });
  }

  // =========================================================================
  // 8. 上体 · 骑手独立扫视警戒兜帽首部（10×11×10）
  //    尖顶林地兜帽 + 护颊面罩 + 锐利露眼缝（一眼看清独立左右转头方向！）
  // =========================================================================
  function buildRiderHead(makeCanvas) {
    const W = 10, D = 11, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 头部内核（脸庞）
    m.paintEllipsoid(0, 0.6, 4.2, 2.5, 2.7, 2.8, mat('skin'), partId.skin, true);
    // 下半脸布质护面巾
    m.paintEllipsoid(0, 1.6, 2.6, 2.45, 2.1, 1.45, mat('armor'), partId.armor, true);
    // 林地尖顶兜帽（前檐遮额、后尖微翘）
    m.paintEllipsoid(0, -0.4, 5.4, 3.3, 3.5, 3.0, mat('cloth'), partId.cloth, true);
    m.paintCapsule(0, -1.2, 6.2, 0, -4.2, 5.6, 2.5, 1.15, mat('cloth'), partId.cloth, true);
    // 帽檐赤色滚边
    m.paintEllipsoid(0, 2.4, 6.4, 2.9, 1.1, 0.82, mat('trim'), partId.trim, true);

    m.despeckle();
    m.applyArtShading(true);

    // 清晰双目（朝向 +Y 正前，独立扫视时辨识度拉满）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 3.0);
    const eyeZ = 4;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.2);
      m.setRaw(ex, eyeY, eyeZ, keyToId.eyeDark, partId.eye);
      m.setRaw(ex, eyeY, eyeZ + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 9, centerZ: 5 });
  }

  // =========================================================================
  // 9. 上体 · 骑手右手 + 长矛（2 档无损：hold 巡游持矛 / pat 收矛前倾轻拍坐骑脖颈）
  // =========================================================================
  const RARM_HOLD_PIVOT = { x: 0, y: -2.0 };
  function buildRiderArmSpearHold(makeCanvas) {
    const W = 10, D = 22, H = 21;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 右肩 -> 右肘 -> 外展右手握矛
    m.paintCapsule(0.0, -2.0, 7.2, 1.2, 0.6, 4.8, 1.45, 1.25, mat('armor'), partId.armor, true);
    m.paintCapsule(1.2, 0.6, 4.8, 1.5, 3.4, 6.2, 1.25, 1.18, mat('leather'), partId.saddle, true);

    // 林地长矛（高挺斜举于右外侧，越过鹿角清晰辨识，矛颈系红羽绑饰）
    m.paintCapsule(1.5, -5.8, 1.2, 1.5, 6.8, 15.4, 0.78, 0.78, mat('wood'), partId.wood, true);
    // 矛颈赤色羽毛绑饰
    m.paintEllipsoid(1.5, 5.6, 14.0, 1.25, 1.35, 1.25, mat('trim'), partId.trim, true);
    m.paintCapsule(1.5, 5.0, 13.0, 1.5, 3.6, 11.2, 0.92, 0.68, mat('trim'), partId.trim, true);
    // 菱形锻铁矛尖
    m.paintCapsule(1.5, 6.8, 15.4, 1.5, 9.4, 18.8, 1.12, 0.65, mat('steel'), partId.steel, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 20, centerZ: 9 });
  }

  const RARM_PAT_PIVOT = { x: 0, y: -3.2 };
  function buildRiderArmPat(makeCanvas) {
    const W = 9, D = 14, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 右臂前伸微倾，手掌朝下轻拍坐骑脖颈
    m.paintCapsule(0.0, -3.2, 6.8, -0.4, 0.8, 5.2, 1.45, 1.25, mat('armor'), partId.armor, true);
    m.paintCapsule(-0.4, 0.8, 5.2, -1.6, 4.8, 3.2, 1.20, 1.05, mat('leather'), partId.saddle, true);
    m.paintEllipsoid(-1.8, 5.6, 2.8, 1.25, 1.35, 0.85, mat('leather'), partId.saddle, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 10, centerZ: 5 });
  }

  // 收矛态：斜挂在鞍座右侧的收起长矛
  function buildSaddleSpear(makeCanvas) {
    const W = 6, D = 18, H = 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -6.8, 1.6, 0, 5.6, 9.6, 0.65, 0.65, mat('wood'), partId.wood, true);
    m.paintEllipsoid(0, 4.6, 8.8, 1.05, 1.15, 1.05, mat('trim'), partId.trim, true);
    m.paintCapsule(0, 5.6, 9.6, 0, 8.0, 11.4, 0.95, 0.46, mat('steel'), partId.steel, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5, headZ: 12, centerZ: 6 });
  }

  // =========================================================================
  // 10. 上体 · 骑手左手（2 档无损：rein 拉缰绳 / perch 抬臂架鹰）
  // =========================================================================
  const LARM_PIVOT = { x: 0, y: -2.4 };
  function buildRiderArmRein(makeCanvas) {
    const W = 9, D = 14, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 左臂自然前垂握住缰绳，并带一小段向前延伸的皮缰
    m.paintCapsule(0, -2.4, 6.4, 0.4, 1.2, 4.2, 1.4, 1.2, mat('armor'), partId.armor, true);
    m.paintCapsule(0.4, 1.2, 4.2, 1.8, 4.4, 3.8, 1.15, 1.05, mat('leather'), partId.saddle, true);
    // 皮缰连向坐骑颈侧
    m.paintCapsule(1.8, 4.4, 3.8, 2.4, 6.4, 2.6, 0.55, 0.55, mat('leather'), partId.saddle, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2, headZ: 9, centerZ: 4 });
  }

  function buildRiderArmPerch(makeCanvas) {
    const W = 12, D = 12, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 左臂戴厚皮鹰套向左侧前方稳稳平抬，形成平坦稳固的猎隼栖落点
    m.paintCapsule(0, -2.4, 6.0, -2.6, 0.2, 5.8, 1.45, 1.35, mat('armor'), partId.armor, true);
    m.paintCapsule(-2.6, 0.2, 5.8, -3.9, 3.8, 6.5, 1.48, 1.42, mat('leather'), partId.saddle, true);
    // 护臂金属扣环
    m.paintEllipsoid(-3.2, 2.2, 6.2, 1.55, 0.85, 1.45, mat('trim'), partId.trim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: 9, centerZ: 5 });
  }

  // =========================================================================
  // 11. 上体 · 4 节随奔跑飞扬的布质披风弹簧链体素片
  // =========================================================================
  function buildCapeSeg(makeCanvas, halfW, isTail) {
    const W = Math.ceil(halfW * 2 + 3);
    const D = 7;
    const H = 5;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 2.2, halfW, 2.1, 1.15, mat('cloth'), partId.cape, true);
    if (isTail) {
      m.paintEllipsoid(0, -1.6, 2.0, halfW * 0.92, 0.95, 0.95, mat('trim'), partId.trim, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: halfW });
  }

  // =========================================================================
  // 12. 伴生立体体素小型林间猎隼（3 档无损烘焙：flap 振翅 / glide 滑翔 / perch 收翅理羽）
  // =========================================================================
  function buildFalcon(makeCanvas, pose) {
    const isFlap = pose === 'flap';
    const isGlide = pose === 'glide';
    const isPerch = pose === 'perch';
    const W = isPerch ? 8 : (isGlide ? 18 : 16);
    const D = 12;
    const H = isPerch ? 11 : (isFlap ? 11 : 8);
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    if (isPerch) {
      // 立姿收翅猎隼（挺拔立于左臂，双翅紧收，锐利钩喙）
      m.paintCapsule(0, -0.6, 2.4, 0, 0.8, 7.6, 2.1, 1.65, mat('falcon'), partId.falconBody, true);
      // 浅斑胸羽
      m.paintEllipsoid(0, 1.3, 4.8, 1.55, 1.25, 2.2, mat('belly'), partId.belly, true);
      // 收拢双翼贴身
      for (const s of [-1, 1]) {
        m.paintCapsule(s * 1.4, 0.0, 6.2, s * 1.6, -1.6, 2.2, 1.05, 0.82, mat('falcon'), partId.falconWing, true);
      }
      // 翘尾羽
      m.paintCapsule(0, -1.6, 2.8, 0, -3.6, 0.8, 1.05, 0.65, mat('falcon'), partId.falconWing, true);
      // 头部 + 锐利钩喙
      m.paintEllipsoid(0, 1.0, 8.2, 1.55, 1.75, 1.55, mat('falcon'), partId.falconBody, true);
      m.paintCapsule(0, 2.4, 8.2, 0, 3.6, 7.6, 0.72, 0.45, mat('beak'), partId.beak, true);
      // 双爪扣稳护臂
      for (const s of [-1, 1]) {
        m.paintCapsule(s * 0.9, 0.4, 2.2, s * 1.0, 0.8, 0.6, 0.62, 0.58, mat('beak'), partId.beak, true);
      }
    } else {
      // 飞行态猎隼（流线身躯 + 展开尖翅 + 扇尾）
      const bodyZ = isFlap ? 3.8 : 4.0;
      m.paintCapsule(0, -2.2, bodyZ, 0, 2.8, bodyZ + 0.4, 1.55, 1.45, mat('falcon'), partId.falconBody, true);
      m.paintEllipsoid(0, 0.8, bodyZ - 0.6, 1.25, 1.85, 0.95, mat('belly'), partId.belly, true);
      // 隼头 + 钩喙
      m.paintEllipsoid(0, 3.4, bodyZ + 0.6, 1.25, 1.45, 1.25, mat('falcon'), partId.falconBody, true);
      m.paintCapsule(0, 4.6, bodyZ + 0.6, 0, 5.4, bodyZ + 0.2, 0.62, 0.42, mat('beak'), partId.beak, true);
      // 扇形尾羽
      m.paintFinTri(
        [0, -1.8, bodyZ],
        [-2.2, -5.2, bodyZ - 0.2],
        [ 2.2, -5.2, bodyZ - 0.2],
        0.55, mat('falcon'), partId.falconWing, true
      );
      // 左右双翅（flap 上扬扑翅 / glide 宽展平掠）
      for (const s of [-1, 1]) {
        if (isFlap) {
          m.paintFinTri(
            [s * 1.0,  1.4, bodyZ + 0.4],
            [s * 6.8,  2.2, bodyZ + 5.6],
            [s * 4.8, -1.8, bodyZ + 3.6],
            0.65, mat('falcon'), partId.falconWing, true
          );
          m.paintFinTri(
            [s * 1.0,  1.2, bodyZ + 0.2],
            [s * 4.8, -1.8, bodyZ + 3.6],
            [s * 1.2, -1.6, bodyZ + 0.1],
            0.60, mat('falcon'), partId.falconWing, true
          );
        } else {
          m.paintFinTri(
            [s * 1.0,  1.6, bodyZ + 0.3],
            [s * 8.2,  0.8, bodyZ + 0.8],
            [s * 5.6, -2.0, bodyZ + 0.2],
            0.62, mat('falcon'), partId.falconWing, true
          );
          m.paintFinTri(
            [s * 1.0,  1.4, bodyZ + 0.2],
            [s * 5.6, -2.0, bodyZ + 0.2],
            [s * 1.2, -1.8, bodyZ + 0.1],
            0.58, mat('falcon'), partId.falconWing, true
          );
        }
      }
    }

    m.despeckle();
    m.applyArtShading(true);

    // 猎隼锐目
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + (isPerch ? 1.8 : 3.8));
    const eyeZ = isPerch ? 8 : 5;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.2);
      m.setRaw(ex, eyeY, eyeZ, keyToId.eyeDark, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: isPerch ? 2.6 : 5.5, headZ: H - 1, centerZ: Math.round(H * 0.5) });
  }

  // =========================================================================
  // 生物主定义：M17 · 骑兽猎手
  // =========================================================================
  const Special12Def = {
    id: 'special12_rider',
    code: 'M17',
    status: 'done',
    name: 'M17 · 骑兽猎手',
    tag: '双体骑乘组合 · 角兽与猎隼',
    summary: 'M17 双体共生/骑乘标杆：林地大角坐骑（独立胸肩/腰胯/鹿角头 + trot 对角小跑 IK + 皮革鞍毯）+ 鞍座锚定骑乘猎手（二阶弹簧垂直颠簸与加减速前倾滞后 + 独立左右扫视警戒 + 4 节披风弹簧链）+ 伴生立体体素林间猎隼领飞盘旋与停步落臂理羽、拍颈安抚、甩耳刨蹄循环',
    defaultHabitat: 'forest',
    footRadius: 11.2,
    ecoWeight: 1.35,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '坐骑胸/胯分段 trot 对角小跑 IK',
      '鞍座挂点死锁 + 骑手二阶弹簧颠簸',
      '骑手独立扫视警戒 + 4 节披风链',
      '伴生立体猎隼领飞与落臂理羽',
      '收矛拍颈安抚 + 坐骑甩耳刨蹄'
    ],
    soulHabit: '林地角兽弹性小跑巡游，骑手随颠簸轻弹并左右转头持矛警戒，猎隼在头顶前上方绕大圈领飞；驻足或原地待机时猎隼俯冲落于猎手抬起的左臂收翅理羽，猎手右手收矛前倾轻拍坐骑脖颈，角兽惬意甩耳并前蹄轻刨两下草地，片刻后猎隼振翅腾空重新领航',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        mountChest:     buildMountChest(makeCanvas),
        mountPelvis:    buildMountPelvis(makeCanvas),
        mountNeck:      buildMountNeck(makeCanvas),
        mountHeadAlert: buildMountHead(makeCanvas, 'alert'),
        mountHeadHappy: buildMountHead(makeCanvas, 'happy'),
        limbHip:        buildMountLimbSeg(makeCanvas, 2.25, 1.90, 4.6, false),
        limbUpper:      buildMountLimbSeg(makeCanvas, 1.92, 1.55, 5.0, false),
        limbKnee:       buildMountLimbSeg(makeCanvas, 1.58, 1.38, 4.2, true),
        limbLower:      buildMountLimbSeg(makeCanvas, 1.38, 1.18, 5.0, true),
        hoof:           buildMountHoof(makeCanvas),
        riderPelvis:    buildRiderPelvis(makeCanvas),
        riderTorso:     buildRiderTorso(makeCanvas),
        riderHead:      buildRiderHead(makeCanvas),
        riderArmSpear:  buildRiderArmSpearHold(makeCanvas),
        riderArmPat:    buildRiderArmPat(makeCanvas),
        saddleSpear:    buildSaddleSpear(makeCanvas),
        riderArmRein:   buildRiderArmRein(makeCanvas),
        riderArmPerch:  buildRiderArmPerch(makeCanvas),
        cape0:          buildCapeSeg(makeCanvas, 3.2, false),
        cape1:          buildCapeSeg(makeCanvas, 3.6, false),
        cape2:          buildCapeSeg(makeCanvas, 3.8, false),
        cape3:          buildCapeSeg(makeCanvas, 3.5, true),
        falconFlap:     buildFalcon(makeCanvas, 'flap'),
        falconGlide:    buildFalcon(makeCanvas, 'glide'),
        falconPerch:    buildFalcon(makeCanvas, 'perch')
      };

      // 坐骑 4 足对角小跑 IK（前腿挂胸肩，后腿挂腰胯 legAnchors，绝不脱腿）
      const gait = new MultiLegGaitSolver([
        { id: 'FL', hipX: -3.6, hipY:  3.8, hipZ: 3.6, restX: -4.1, restY:  4.2, L1: 6.2, L2: 6.4, kneeSign: -1 },
        { id: 'FR', hipX:  3.6, hipY:  3.8, hipZ: 3.6, restX:  4.1, restY:  4.2, L1: 6.2, L2: 6.4, kneeSign: -1 },
        { id: 'BL', hipX: -3.6, hipY: -2.2, hipZ: 3.8, restX: -4.2, restY: -2.0, L1: 6.3, L2: 6.5, kneeSign:  1 },
        { id: 'BR', hipX:  3.6, hipY: -2.2, hipZ: 3.8, restX:  4.2, restY: -2.0, L1: 6.3, L2: 6.5, kneeSign:  1 }
      ], {
        mode: 'trot',
        stepThreshold: 4.4,
        stepDuration: 0.24,
        stepHeight: 3.3,
        settleDelay: 0.14,
        settleThreshold: 1.05
      });

      // 骑手身后 4 节布质披风弹簧链
      const capeChain = new ChainSolver(4, 2.25, {
        maxAngle: 0.56,
        waveFreq: 5.4,
        wavePhaseStep: 0.62,
        waveAmp: 0.36
      });

      // 二阶弹簧系统：坐骑起伏 -> 骑手上身垂直颠簸 + 加减速前后倾滞后 + 独立转头警戒 + 互动动作
      const mountBounceSpring = new SpringDamper1D(0, 145, 8.6);
      const spineBendSpring   = new SpringDamper1D(0, 82, 7.6);
      const mountHeadYawSp    = new SpringDamper1D(0, 96, 7.8);
      const riderBounceSpring = new SpringDamper1D(0, 108, 6.8); // 欠阻尼产生真实骑乘弹性颠簸
      const riderPitchSpring  = new SpringDamper1D(0, 74, 7.2);  // 加减速前后倾滞后
      const riderRollSpring   = new SpringDamper1D(0, 78, 7.4);  // 过弯侧倾滞后
      const riderScanYawSp    = new SpringDamper1D(0, 68, 7.0);  // 骑手独立左右扫视转头
      const riderLeanSp       = new SpringDamper1D(0, 92, 8.0);  // 拍颈微前倾
      const patPulseSp        = new SpringDamper1D(0, 165, 8.8); // 轻拍坐骑脖颈脉冲
      const pawScrapeSp       = new SpringDamper1D(0, 150, 8.4); // 前蹄轻刨草地

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 8.4,
        vx: 0, vy: 0,
        prevVx: 0, prevVy: 0,
        yaw: opts.homeYaw ?? 0,
        prevYaw: opts.homeYaw ?? 0,
        pelvisYaw: opts.homeYaw ?? 0,
        tiltX: 0, tiltY: 0,
        frontBob: 0, rearBob: 0,
        // 骑手独立扫视状态
        scanTarget: 0,
        scanTimer: 1.4,
        // 伴生猎隼与驻足安抚交互状态机：scout -> dive -> perch -> launch
        falconStage: 'scout',
        falconTimer: 0,
        stopHoldTimer: 0,
        patCount: 0,
        patCooldown: 0,
        pawCount: 0,
        pawCooldown: 0,
        // 猎隼世界状态
        falconX: (opts.homeX ?? 0) + 12,
        falconY: (opts.homeY ?? 0) + 16,
        falconZ: 33,
        falconYaw: opts.homeYaw ?? 0,
        falconOrbitAng: 0.4,
        falconFlapPhase: 0,
        falconGlideMode: false,
        falconPose: 'flap',
        falconStartX: 0, falconStartY: 0, falconStartZ: 32,
        // 骑手双臂与坐骑头部无损姿态键
        leftArmPose: 'rein',
        rightArmPose: 'spear',
        mountHeadPose: 'alert'
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: Special12Def,
        cachePrefix: `special12_rd_${Math.random().toString(36).slice(2, 7)}`,
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
          state.z = 8.4; state.vx = 0; state.vy = 0;
          state.prevVx = 0; state.prevVy = 0;
          state.tiltX = 0; state.tiltY = 0;
          state.frontBob = 0; state.rearBob = 0;
          state.scanTarget = 0;
          state.scanTimer = 1.2;
          state.falconStage = 'scout';
          state.falconTimer = 0;
          state.stopHoldTimer = 0;
          state.patCount = 0;
          state.pawCount = 0;
          state.leftArmPose = 'rein';
          state.rightArmPose = 'spear';
          state.mountHeadPose = 'alert';

          mountBounceSpring.x = mountBounceSpring.v = 0;
          spineBendSpring.x = spineBendSpring.v = 0;
          mountHeadYawSp.x = mountHeadYawSp.v = 0;
          riderBounceSpring.x = riderBounceSpring.v = 0;
          riderPitchSpring.x = riderPitchSpring.v = 0;
          riderRollSpring.x = riderRollSpring.v = 0;
          riderScanYawSp.x = riderScanYawSp.v = 0;
          riderLeanSp.x = riderLeanSp.v = 0;
          patPulseSp.x = patPulseSp.v = 0;
          pawScrapeSp.x = pawScrapeSp.v = 0;

          const [pJX, pJY] = localToWorldXY(state.x, state.y, state.yaw, 0, -4.2);
          const [px, py] = pivotToWorldXY(pJX, pJY, state.pelvisYaw, MOUNT_PELVIS_PIVOT.x, MOUNT_PELVIS_PIVOT.y);
          gait.reset(state.x, state.y, state.yaw, instance.scaleMul, {
            BL: { x: px, y: py, yaw: state.pelvisYaw },
            BR: { x: px, y: py, yaw: state.pelvisYaw }
          });

          const [capeRX, capeRY] = localToWorldXY(state.x, state.y, state.yaw, 0, -4.0);
          capeChain.reset(capeRX, capeRY, state.z + 18.2, state.yaw);

          const [fx, fy] = localToWorldXY(state.x, state.y, state.yaw, 10, 14);
          state.falconX = fx; state.falconY = fy; state.falconZ = 33;
          state.falconYaw = state.yaw;
          state.falconOrbitAng = 0.4;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));

          // 兼容 eco.action === 'idle' 与 eco.patrol === false
          const isIdle = !eco || eco.action === 'idle' || eco.patrol === false;
          const patrol = !isIdle;
          const hx = (eco && eco.homeX) ?? 0;
          const hy = (eco && eco.homeY) ?? 0;
          const hyaw = (eco && eco.homeYaw) ?? 0;

          const prevYaw = state.yaw;
          const baseLift = 8.4 * sMul;

          // -----------------------------------------------------------------
          // 1. 下体坐骑推进：trot 弹性小跑 + stalk 巡游性格；猎隼栖落期稳步驻足
          // -----------------------------------------------------------------
          const holdForPerch = state.falconStage === 'dive' || state.falconStage === 'perch';
          if (patrol) {
            Propulsion.multiLegWalk(state, dt, time, { ...params, speed: spdMul * 1.05 }, {
              ...eco,
              walkStyle: 'stalk',
              baseLift,
              pauseFactor: holdForPerch ? 0.0 : 1.0,
              maxRadius: (eco && eco.maxRadius) ?? 46
            });
          } else {
            // 原地待机（S 键）：走回待机点后稳稳停驻，循环猎隼落臂理羽 + 拍颈安抚
            Propulsion.walkToPoint(state, hx, hy, dt, params, {
              arriveDist: 2.2 * sMul,
              maxSpeed: 15.0,
              maxTurn: 3.6,
              aimYaw: hyaw + Math.sin(time * 0.55) * 0.12,
              baseLift
            });
          }

          // 计算坐骑线加速度与转向角速度，用于驱动骑手上身次级惯性
          const moveSpd = Math.hypot(state.vx, state.vy);
          const axW = (state.vx - state.prevVx) / Math.max(dt, 0.004);
          const ayW = (state.vy - state.prevVy) / Math.max(dt, 0.004);
          state.prevVx = state.vx;
          state.prevVy = state.vy;

          const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
          const rightX = Math.cos(state.yaw), rightY = Math.sin(state.yaw);
          const fwdAccel = clamp(axW * fwdX + ayW * fwdY, -45, 45);
          const latAccel = clamp(axW * rightX + ayW * rightY, -40, 40);

          const yawRate = wrapAngle(state.yaw - prevYaw) / Math.max(dt, 0.001);
          state.prevYaw = state.yaw;

          // 坐骑腰胯脊柱弯折（转弯自然屈脊）
          const spineBend = spineBendSpring.update(
            dt,
            clamp(-yawRate * 0.14, -0.38, 0.38),
            82 * sp,
            clamp(7.6 * dScale, 3.4, 11.5)
          );
          state.pelvisYaw = wrapAngle(state.yaw + spineBend);

          // -----------------------------------------------------------------
          // 2. 坐骑 4 足 trot 对角小跑 IK（后腿锚死在腰胯 pelvisAnchor，绝不脱腿）
          // -----------------------------------------------------------------
          const [pJPreX, pJPreY] = localToWorldXY(state.x, state.y, state.yaw, 0, -4.2 * sMul);
          const [pelvisPreX, pelvisPreY] = pivotToWorldXY(
            pJPreX, pJPreY, state.pelvisYaw,
            MOUNT_PELVIS_PIVOT.x * sMul, MOUNT_PELVIS_PIVOT.y * sMul
          );
          const pelvisAnchor = { x: pelvisPreX, y: pelvisPreY, z: state.z + 0.2 * sMul, yaw: state.pelvisYaw };

          const gaitRes = gait.update(dt, state.x, state.y, state.z, state.yaw, state.vx, state.vy, {
            scaleMul: sMul,
            mode: 'trot',
            legAnchors: { BL: pelvisAnchor, BR: pelvisAnchor },
            stepFreq: freq * 1.05,
            stepHeight: 3.3 * sMul * clamp(flex, 0.75, 1.25)
          });

          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 0.65 * sMul, expSmooth(dt, 11));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 0.65 * sMul, expSmooth(dt, 11));
          state.frontBob = lerp(state.frontBob, clamp(gaitRes.frontLift * 0.16, 0, 0.9), expSmooth(dt, 14));
          state.rearBob  = lerp(state.rearBob,  clamp(gaitRes.rearLift  * 0.16, 0, 0.9), expSmooth(dt, 14));

          // 坐骑 trot 落蹄冲量 -> 传给坐骑本体与骑手上身二阶弹簧（欠阻尼滞后颠簸）
          if (gaitRes.landed.length > 0) {
            mountBounceSpring.impulse(-11.5 * sMul);
            riderBounceSpring.impulse(-14.5 * sMul * clamp(moveSpd / 12, 0.45, 1.25));
            for (const leg of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, leg.footX, leg.footY, 0.78 * sMul);
            }
          }
          const mountBounceTarget = -gaitRes.liftSum * 0.11 + (moveSpd > 2 ? Math.sin(gait.gaitPhase * TAU * 2) * 0.55 * sMul : 0);
          mountBounceSpring.update(dt, mountBounceTarget, 145 * sp, clamp(8.6 * dScale, 3.6, 12.5));
          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.3 * sMul }));

          // -----------------------------------------------------------------
          // 3. 骑手上身二阶弹簧次级物理 + 独立左右扫视警戒逻辑
          // -----------------------------------------------------------------
          const riderBounceTarget = clamp(mountBounceSpring.x * 0.16, -1.1, 1.1) * sMul;
          riderBounceSpring.update(dt, riderBounceTarget, 108 * sp, clamp(6.6 * dScale, 2.8, 10.5));

          // 加速时骑手微后仰（-Y），刹车时微前倾（+Y），小跑常态微前倾
          const pitchTarget = clamp(-fwdAccel * 0.022 + (moveSpd > 4 ? 0.32 : 0), -0.85, 0.95);
          riderPitchSpring.update(dt, pitchTarget, 74 * sp, clamp(7.2 * dScale, 3.2, 11.5));
          const rollTarget = clamp(-latAccel * 0.020 - yawRate * 0.14, -0.75, 0.75);
          riderRollSpring.update(dt, rollTarget, 78 * sp, clamp(7.4 * dScale, 3.2, 11.5));

          // 骑手独立左右扫视警戒（巡游时左右侦察，栖落期转头温情看向左臂猎隼与坐骑脖颈）
          state.scanTimer -= dt;
          if (state.falconStage === 'perch') {
            // 栖落期在左臂猎隼(-0.48)与坐骑脖颈(+0.18)交替注视
            state.scanTarget = (state.falconTimer > 2.2) ? -0.48 : 0.18;
          } else if (state.falconStage === 'dive') {
            state.scanTarget = -0.52; // 仰头迎接猎隼落臂
          } else if (state.scanTimer <= 0) {
            state.scanTimer = 1.6 + Math.random() * 1.6;
            const pick = Math.random();
            if (pick < 0.36) state.scanTarget = -0.58 - Math.random() * 0.22;
            else if (pick < 0.72) state.scanTarget = 0.58 + Math.random() * 0.22;
            else state.scanTarget = (Math.random() - 0.5) * 0.24;
          }
          riderScanYawSp.update(dt, state.scanTarget, 68 * sp, clamp(7.0 * dScale, 3.0, 11.0));

          // -----------------------------------------------------------------
          // 4. 伴生猎隼 + 驻足拍颈安抚 + 坐骑甩耳刨蹄 完整生态自循环
          // -----------------------------------------------------------------
          const isStopped = moveSpd < 1.6;
          if (isStopped) state.stopHoldTimer += dt;
          else state.stopHoldTimer = 0;

          // 计算最新鞍座与左臂栖落挂点（单一真源 SocketTracker）
          const breathBob = Math.sin(time * 2.4) * 0.24 * sMul;
          const bodyLift = state.z + clamp(mountBounceSpring.x * 0.14, -1.6, 1.6) + breathBob;
          const bx = state.x + state.tiltX;
          const by = state.y + state.tiltY;
          const saddle = sockets.setLocal('saddle', bx, by, bodyLift, state.yaw, 0, -0.8, 10.6, sMul);

          const riderLean = clamp(riderLeanSp.x, 0, 1.15);
          const riderLocalY = clamp(riderPitchSpring.x, -0.85, 0.95) + riderLean * 1.15;
          const riderLocalX = clamp(riderRollSpring.x, -0.75, 0.75);
          const [riderTX, riderTY] = localToWorldXY(saddle.x, saddle.y, state.yaw, riderLocalX * sMul, riderLocalY * sMul);
          const riderZ = saddle.z + (3.2 - riderLean * 0.55) * sMul + clamp(riderBounceSpring.x * 0.12, -1.1, 1.1);
          const riderTorsoYaw = wrapAngle(state.yaw + clamp(riderScanYawSp.x * 0.28, -0.26, 0.26));
          sockets.setWorld('riderChest', riderTX, riderTY, riderZ, riderTorsoYaw);

          // 左臂抬起后的猎隼精准栖落挂点
          const perchSocket = sockets.setLocal('falconPerch', riderTX, riderTY, riderZ, riderTorsoYaw, -7.8, 2.8, 7.4, sMul);

          // 猎隼状态机推进
          state.falconTimer -= dt;
          if (state.falconStage === 'scout') {
            state.leftArmPose = 'rein';
            state.rightArmPose = 'spear';
            state.mountHeadPose = 'alert';

            // 驻足/待机满一定时长，召唤猎隼俯冲落臂！
            const triggerWait = patrol ? 0.55 : 2.6;
            if (state.stopHoldTimer > triggerWait && state.falconTimer <= 0) {
              state.falconStage = 'dive';
              state.falconTimer = 1.15;
              state.falconStartX = state.falconX;
              state.falconStartY = state.falconY;
              state.falconStartZ = state.falconZ;
              state.leftArmPose = 'perch';
            }
          } else if (state.falconStage === 'dive') {
            state.leftArmPose = 'perch';
            state.rightArmPose = 'spear';
            state.mountHeadPose = 'alert';
            if (state.falconTimer <= 0) {
              state.falconStage = 'perch';
              state.falconTimer = 4.2;
              state.patCount = 0;
              state.patCooldown = 0.45;
              state.pawCount = 0;
              state.pawCooldown = 0.85;
              riderBounceSpring.impulse(-8.5 * sMul); // 猎隼落臂轻压反馈
              // 落臂轻羽微粒
              if (vfx) {
                const fCol = (curSkin.fx && curSkin.fx.feather) || '#8f6a4f';
                for (let i = 0; i < 4; i++) {
                  const a = Math.random() * TAU;
                  vfx.spawnParticle(
                    perchSocket.x, perchSocket.y, perchSocket.z + 2 * sMul,
                    Math.cos(a) * 6, Math.sin(a) * 6, 4 + Math.random() * 5,
                    0.55, 1.2, fCol, false, 12
                  );
                }
              }
            }
          } else if (state.falconStage === 'perch') {
            state.leftArmPose = 'perch';
            state.rightArmPose = 'pat';
            state.mountHeadPose = 'happy';

            // 猎手右手收矛、微微前倾轻拍坐骑脖颈 2 下
            state.patCooldown -= dt;
            if (state.patCount < 2 && state.patCooldown <= 0) {
              state.patCount++;
              state.patCooldown = 0.95;
              patPulseSp.impulse(28.0 * sp);
              mountHeadYawSp.impulse((state.patCount === 1 ? 14 : -16) * sp);
            }

            // 坐骑惬意甩耳 + 右前蹄轻刨 2 下草地激起微尘
            state.pawCooldown -= dt;
            if (state.pawCount < 2 && state.pawCooldown <= 0) {
              state.pawCount++;
              state.pawCooldown = 1.05;
              pawScrapeSp.impulse(32.0 * sp);
              const fr = gait.legs[1];
              if (fr) EnvFeedback.emitFootstep(vfx, habitat, fr.footX, fr.footY, 0.58 * sMul);
            }

            if (state.falconTimer <= 0) {
              state.falconStage = 'launch';
              state.falconTimer = 1.05;
              state.falconStartX = perchSocket.x;
              state.falconStartY = perchSocket.y;
              state.falconStartZ = perchSocket.z;
              riderBounceSpring.impulse(6.5 * sMul);
            }
          } else if (state.falconStage === 'launch') {
            state.leftArmPose = 'rein';
            state.rightArmPose = 'spear';
            state.mountHeadPose = 'alert';
            if (state.falconTimer <= 0) {
              state.falconStage = 'scout';
              state.falconTimer = patrol ? 5.2 : 3.4;
            }
          }

          // 更新拍颈前倾、坐骑甩头、前蹄轻刨弹簧
          riderLeanSp.update(dt, state.falconStage === 'perch' ? 1.0 : 0.0, 92 * sp, clamp(8.0 * dScale, 3.5, 12.0));
          patPulseSp.update(dt, 0, 165 * sp, clamp(8.8 * dScale, 3.8, 12.5));
          pawScrapeSp.update(dt, 0, 150 * sp, clamp(8.4 * dScale, 3.6, 12.0));

          const mountHeadTarget = state.falconStage === 'perch'
            ? Math.sin(time * 5.2) * 0.26
            : clamp(-yawRate * 0.16, -0.45, 0.45) + Math.sin(time * 1.1) * 0.09;
          mountHeadYawSp.update(dt, mountHeadTarget, 96 * sp, clamp(7.8 * dScale, 3.4, 11.5));

          // -----------------------------------------------------------------
          // 5. 猎隼三维飞行轨迹与振翅/滑翔/栖落切换
          // -----------------------------------------------------------------
          if (state.falconStage === 'scout') {
            state.falconOrbitAng = (state.falconOrbitAng + dt * 1.38 * clamp(spdMul, 0.65, 1.5)) % TAU;
            const orbitR = 13.5 * sMul;
            const [leadCX, leadCY] = localToWorldXY(bx, by, state.yaw, 0, 10.0 * sMul);
            const tx = leadCX + Math.cos(state.falconOrbitAng) * orbitR;
            const ty = leadCY + Math.sin(state.falconOrbitAng) * orbitR * 0.84;
            const tz = (29.0 + Math.sin(state.falconOrbitAng * 2.0 + time * 0.8) * 2.8) * sMul;
            const kF = expSmooth(dt, 5.2);
            const prevFX = state.falconX, prevFY = state.falconY;
            state.falconX = lerp(state.falconX, tx, kF);
            state.falconY = lerp(state.falconY, ty, kF);
            state.falconZ = lerp(state.falconZ, tz, kF);
            const fvx = state.falconX - prevFX, fvy = state.falconY - prevFY;
            if (Math.hypot(fvx, fvy) > 0.02) {
              const flyYaw = Math.atan2(-fvx, fvy);
              state.falconYaw = wrapAngle(state.falconYaw + wrapAngle(flyYaw - state.falconYaw) * expSmooth(dt, 9.0));
            }
            // 周期交替：振翅爬升 1.2s -> 滑翔掠空 1.4s
            const flapCycle = (time * 0.42) % 1;
            if (flapCycle < 0.48) {
              state.falconFlapPhase += dt * 14.5 * freq;
              state.falconPose = Math.sin(state.falconFlapPhase) > 0 ? 'flap' : 'glide';
            } else {
              state.falconPose = 'glide';
            }
          } else if (state.falconStage === 'dive') {
            const u = clamp(1 - state.falconTimer / 1.15, 0, 1);
            const s = smoothstep(0, 1, u);
            const prevFX = state.falconX, prevFY = state.falconY;
            state.falconX = lerp(state.falconStartX, perchSocket.x, s);
            state.falconY = lerp(state.falconStartY, perchSocket.y, s);
            // 俯冲先降后略微拉起刹车落臂
            state.falconZ = lerp(state.falconStartZ, perchSocket.z, Math.pow(s, 0.85)) + Math.sin(u * Math.PI) * 2.6 * sMul;
            const fvx = state.falconX - prevFX, fvy = state.falconY - prevFY;
            if (Math.hypot(fvx, fvy) > 0.02) {
              const flyYaw = Math.atan2(-fvx, fvy);
              state.falconYaw = wrapAngle(state.falconYaw + wrapAngle(flyYaw - state.falconYaw) * expSmooth(dt, 11.0));
            }
            // 降落最后阶段高频刹车振翅
            state.falconFlapPhase += dt * 20.0 * freq;
            state.falconPose = Math.sin(state.falconFlapPhase) > -0.15 ? 'flap' : 'glide';
          } else if (state.falconStage === 'perch') {
            state.falconX = perchSocket.x;
            state.falconY = perchSocket.y;
            state.falconZ = perchSocket.z;
            // 收翅理羽：轻轻左右歪头梳理羽翼
            const preenYaw = Math.sin(time * 3.8) * 0.36 + (fbm1(time * 1.4, 29) - 0.5) * 0.28;
            state.falconYaw = wrapAngle(riderTorsoYaw + 0.35 + preenYaw);
            state.falconPose = 'perch';
          } else if (state.falconStage === 'launch') {
            const u = clamp(1 - state.falconTimer / 1.05, 0, 1);
            const s = smoothstep(0, 1, u);
            const [tx, ty] = localToWorldXY(bx, by, state.yaw, -11.0 * sMul, 15.0 * sMul);
            const tz = 33.0 * sMul;
            const prevFX = state.falconX, prevFY = state.falconY;
            state.falconX = lerp(state.falconStartX, tx, s);
            state.falconY = lerp(state.falconStartY, ty, s);
            state.falconZ = lerp(state.falconStartZ, tz, Math.pow(s, 0.72));
            const fvx = state.falconX - prevFX, fvy = state.falconY - prevFY;
            if (Math.hypot(fvx, fvy) > 0.02) {
              const flyYaw = Math.atan2(-fvx, fvy);
              state.falconYaw = wrapAngle(state.falconYaw + wrapAngle(flyYaw - state.falconYaw) * expSmooth(dt, 10.0));
            }
            state.falconFlapPhase += dt * 19.0 * freq;
            state.falconPose = Math.sin(state.falconFlapPhase) > 0 ? 'flap' : 'glide';
          }

          // -----------------------------------------------------------------
          // 6. 骑手身后 4 节布质披风弹簧链（奔跑飘扬，驻足自然垂落于马背上方不穿模）
          // -----------------------------------------------------------------
          const [capeRX, capeRY] = localToWorldXY(riderTX, riderTY, riderTorsoYaw, 0, -3.2 * sMul);
          const capeRZ = riderZ + 6.4 * sMul;
          const runRatio = clamp(moveSpd / 15.0, 0, 1.1);
          const minCapeZ = bodyLift + 11.2 * sMul; // 保护下限：绝不穿进坐骑腰胯

          capeChain.update(dt, capeRX, capeRY, capeRZ, riderTorsoYaw, time, {
            segLen: lerp(1.95, 2.38, runRatio) * sMul,
            flexibility: flex * lerp(0.85, 1.25, runRatio),
            maxAngle: 0.54,
            waveFreq: (3.4 + runRatio * 4.2) * freq,
            waveAmp: lerp(0.14, 0.46, runRatio),
            wavePhaseStep: 0.65,
            restAlign: lerp(0.22, 0.10, runRatio),
            zTargetFn: (u, idx, t) => {
              const drop = lerp(5.4, 2.0, runRatio) * u * sMul;
              const flutter = Math.sin(t * (4.5 + runRatio * 4.5) - idx * 0.85) * (0.4 + runRatio * 1.1) * u * sMul;
              return Math.max(minCapeZ, capeRZ - drop + flutter);
            },
            zFollowSpeed: 12.0
          });
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = habitat.isWater;
          const yw = state.yaw;

          const bodyLift = state.z + clamp(mountBounceSpring.x * 0.14, -1.6, 1.6);
          const bx = state.x + state.tiltX;
          const by = state.y + state.tiltY;
          const pawScrape = clamp(pawScrapeSp.x, -0.3, 1.3);

          // -----------------------------------------------------------------
          // 1. 下体 · 坐骑 4 条高重叠连贯 IK 腿（右前蹄在栖落期轻刨草地）
          // -----------------------------------------------------------------
          for (const leg of gait.legs) {
            const legYaw = leg.anchorYaw ?? yw;
            const hx = leg.hipWX + state.tiltX;
            const hy = leg.hipWY + state.tiltY;
            const hz = leg.hipWZ;
            let fx = leg.footX, fy = leg.footY, fz = leg.footZ;
            let kx = leg.kneeX, ky = leg.kneeY, kz = leg.kneeZ;

            if (leg.id === 'FR' && pawScrape > 0.04) {
              const [pOffX, pOffY] = localToWorldXY(0, 0, yw, 0.4 * pawScrape * sMul, 3.2 * pawScrape * sMul);
              fx += pOffX;
              fy += pOffY;
              fz += Math.sin(clamp(pawScrape, 0, 1) * Math.PI) * 2.4 * sMul;
              kx += pOffX * 0.55;
              ky += pOffY * 0.55;
              kz += 1.4 * pawScrape * sMul;
            }

            const segs = [
              { k: 'limbHip',   x: hx, y: hy, z: hz, b: -0.58, sym: 90 },
              { k: 'limbUpper', x: lerp(hx, kx, 0.50), y: lerp(hy, ky, 0.50), z: lerp(hz, kz, 0.50), b: -0.52, sym: 90 },
              { k: 'limbKnee',  x: kx, y: ky, z: kz, b: -0.45, sym: 90 },
              { k: 'limbLower', x: lerp(kx, fx, 0.52), y: lerp(ky, fy, 0.52), z: lerp(kz, fz + 1.5 * sMul, 0.52), b: -0.38, sym: 90 },
              { k: 'hoof',      x: fx, y: fy, z: fz, b: -0.28, sym: 0 }
            ];
            for (const pt of segs) {
              const item = {
                partKey: pt.k,
                asset: parts[pt.k],
                x: pt.x,
                y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === 'hoof' ? 0 : 2.2 * sMul)),
                ro: legYaw,
                bias: pt.b,
                submerge: EnvFeedback.calcSubmerge(pt.z + 0.8, habitat.waterLevel, 4.4, isWater)
              };
              if (pt.sym) item.symDeg = pt.sym;
              list.push(item);
            }
          }

          // -----------------------------------------------------------------
          // 2. 下体 · 坐骑独立腰胯 + 胸肩 + 颈部 + 昂首鹿角兽头
          // -----------------------------------------------------------------
          const [pJointX, pJointY] = localToWorldXY(bx, by, yw, 0, -4.2 * sMul);
          const [pelvisCX, pelvisCY] = pivotToWorldXY(
            pJointX, pJointY, state.pelvisYaw,
            MOUNT_PELVIS_PIVOT.x * sMul, MOUNT_PELVIS_PIVOT.y * sMul
          );
          list.push({
            partKey: 'mountPelvis',
            asset: parts.mountPelvis,
            x: pelvisCX,
            y: pelvisCY,
            lift: bodyLift + 0.2 * sMul + state.rearBob * 0.65,
            ro: state.pelvisYaw,
            bias: 0.12,
            submerge: EnvFeedback.calcSubmerge(bodyLift + 1.4, habitat.waterLevel, 4.8, isWater)
          });

          const chestLift = bodyLift + state.frontBob * 0.65;
          list.push({
            partKey: 'mountChest',
            asset: parts.mountChest,
            x: bx,
            y: by,
            lift: chestLift,
            ro: yw,
            bias: 0.36,
            submerge: EnvFeedback.calcSubmerge(bodyLift + 1.4, habitat.waterLevel, 4.8, isWater)
          });

          const mHeadRel = clamp(mountHeadYawSp.x, -0.52, 0.52);
          const mNeckYaw = wrapAngle(yw + mHeadRel * 0.42);
          const mHeadYaw = wrapAngle(yw + mHeadRel);

          const [nJointX, nJointY] = localToWorldXY(bx, by, yw, 0, 5.0 * sMul);
          const [neckCX, neckCY] = pivotToWorldXY(
            nJointX, nJointY, mNeckYaw,
            MOUNT_NECK_PIVOT.x * sMul, MOUNT_NECK_PIVOT.y * sMul
          );
          const neckLift = chestLift + 6.0 * sMul;
          list.push({
            partKey: 'mountNeck',
            asset: parts.mountNeck,
            x: neckCX,
            y: neckCY,
            lift: neckLift,
            ro: mNeckYaw,
            bias: 0.55
          });

          const [hJointX, hJointY] = localToWorldXY(nJointX, nJointY, mNeckYaw, 0, 3.8 * sMul);
          const [headCX, headCY] = pivotToWorldXY(
            hJointX, hJointY, mHeadYaw,
            MOUNT_HEAD_PIVOT.x * sMul, MOUNT_HEAD_PIVOT.y * sMul
          );
          const mHeadKey = state.mountHeadPose === 'happy' ? 'mountHeadHappy' : 'mountHeadAlert';
          list.push({
            partKey: mHeadKey,
            asset: parts[mHeadKey],
            x: headCX,
            y: headCY,
            lift: neckLift + 5.2 * sMul,
            ro: mHeadYaw,
            bias: 0.72
          });

          // -----------------------------------------------------------------
          // 3. 上体 · 独立骑乘猎手（骨盆死锁鞍座 + 上身二阶弹簧颠簸 + 独立转头警戒）
          // -----------------------------------------------------------------
          const saddle = sockets.get('saddle');

          // 3a. 骑手骨盆与夹腿（死死锚定 saddle，0 脱座、0 穿模）
          list.push({
            partKey: 'riderPelvis',
            asset: parts.riderPelvis,
            x: saddle.x,
            y: saddle.y,
            lift: saddle.z - 4.4 * sMul,
            ro: yw,
            bias: 0.62
          });

          // 3b. 骑手上身（叠加二阶弹簧垂直颠簸 + 加减速前后倾滞后）
          const riderChest = sockets.get('riderChest');
          const rTorsoYaw = riderChest.yaw;
          list.push({
            partKey: 'riderTorso',
            asset: parts.riderTorso,
            x: riderChest.x,
            y: riderChest.y,
            lift: riderChest.z,
            ro: rTorsoYaw,
            bias: 0.76
          });

          // 3c. 骑手兜帽首部（独立左右扫视警戒）
          const rHeadYaw = wrapAngle(yw + clamp(riderScanYawSp.x, -0.78, 0.78));
          const [rhX, rhY] = localToWorldXY(riderChest.x, riderChest.y, rTorsoYaw, 0, 0.3 * sMul);
          list.push({
            partKey: 'riderHead',
            asset: parts.riderHead,
            x: rhX,
            y: rhY,
            lift: riderChest.z + 7.2 * sMul,
            ro: rHeadYaw,
            bias: 0.92
          });

          // 3d. 骑手右手：巡游持矛随警戒微调 / 驻足收矛前倾轻拍坐骑脖颈
          if (state.rightArmPose === 'pat') {
            // 收起的长矛斜挂鞍座右侧
            const [spX, spY] = localToWorldXY(saddle.x, saddle.y, yw, 5.2 * sMul, -0.6 * sMul);
            list.push({
              partKey: 'saddleSpear',
              asset: parts.saddleSpear,
              x: spX,
              y: spY,
              lift: saddle.z - 2.2 * sMul,
              ro: yw,
              bias: 0.58
            });
            // 右手轻拍坐骑脖颈
            const patDrop = clamp(patPulseSp.x, -0.3, 1.2) * 1.35 * sMul;
            const patYaw = wrapAngle(rTorsoYaw - 0.14);
            const [raJX, raJY] = localToWorldXY(riderChest.x, riderChest.y, rTorsoYaw, 4.0 * sMul, 1.0 * sMul);
            const [raCX, raCY] = pivotToWorldXY(raJX, raJY, patYaw, RARM_PAT_PIVOT.x * sMul, RARM_PAT_PIVOT.y * sMul);
            list.push({
              partKey: 'riderArmPat',
              asset: parts.riderArmPat,
              x: raCX,
              y: raCY,
              lift: riderChest.z + 1.2 * sMul - patDrop,
              ro: patYaw,
              bias: 0.86
            });
          } else {
            const spearYaw = wrapAngle(rTorsoYaw + clamp(riderScanYawSp.x * 0.25, -0.22, 0.22));
            const [raJX, raJY] = localToWorldXY(riderChest.x, riderChest.y, rTorsoYaw, 4.2 * sMul, 0.4 * sMul);
            const [raCX, raCY] = pivotToWorldXY(raJX, raJY, spearYaw, RARM_HOLD_PIVOT.x * sMul, RARM_HOLD_PIVOT.y * sMul);
            list.push({
              partKey: 'riderArmSpear',
              asset: parts.riderArmSpear,
              x: raCX,
              y: raCY,
              lift: riderChest.z - 0.2 * sMul,
              ro: spearYaw,
              bias: 0.88
            });
          }

          // 3e. 骑手左手：巡游拉缰绳 / 驻足抬起护臂迎接猎隼栖落
          const lArmKey = state.leftArmPose === 'perch' ? 'riderArmPerch' : 'riderArmRein';
          const [laJX, laJY] = localToWorldXY(riderChest.x, riderChest.y, rTorsoYaw, -4.0 * sMul, 0.4 * sMul);
          const [laCX, laCY] = pivotToWorldXY(laJX, laJY, rTorsoYaw, LARM_PIVOT.x * sMul, LARM_PIVOT.y * sMul);
          list.push({
            partKey: lArmKey,
            asset: parts[lArmKey],
            x: laCX,
            y: laCY,
            lift: riderChest.z + 0.6 * sMul,
            ro: rTorsoYaw,
            bias: 0.85
          });

          // 3f. 4 节布质披风弹簧链
          const capeKeys = ['cape0', 'cape1', 'cape2', 'cape3'];
          for (let i = 0; i < capeChain.nodes.length; i++) {
            const nd = capeChain.nodes[i];
            const pk = capeKeys[Math.min(capeKeys.length - 1, i)];
            list.push({
              partKey: pk,
              asset: parts[pk],
              x: nd.x,
              y: nd.y,
              lift: Math.max(2.0, nd.z - 1.8 * sMul),
              ro: nd.yaw,
              bias: 0.68 - i * 0.03
            });
          }

          // -----------------------------------------------------------------
          // 4. 伴生立体体素小型林间猎隼
          // -----------------------------------------------------------------
          const fKey = state.falconPose === 'perch'
            ? 'falconPerch'
            : (state.falconPose === 'glide' ? 'falconGlide' : 'falconFlap');
          list.push({
            partKey: fKey,
            asset: parts[fKey],
            x: state.falconX,
            y: state.falconY,
            lift: state.falconPose === 'perch' ? state.falconZ : Math.max(8.0, state.falconZ - 3.5 * sMul),
            ro: state.falconYaw,
            bias: 1.05
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Special12Def.id,
            code: Special12Def.code,
            status: Special12Def.status,
            name: Special12Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            falconStage: state.falconStage,
            falconPose: state.falconPose,
            leftArmPose: state.leftArmPose,
            rightArmPose: state.rightArmPose,
            capeSegments: capeChain.count,
            footRadius: Special12Def.footRadius,
            headZ: 36,
            centerZ: 16,
            blocks: Special12Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Special12Def);
})(window.PixelWorkshop);
