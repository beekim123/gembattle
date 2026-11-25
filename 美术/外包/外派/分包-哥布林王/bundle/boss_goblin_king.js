'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const {
    TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle,
    localToWorldXY, pivotToWorldXY
  } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 第二个大 Boss · 哥布林王（boss_goblin_king）
  //   - 与苔绿哥布林血脉同源，体型放大至 Boss 级宽厚蛮横体态（+Y 正前，z=0 贴地）
  //   - 四大记忆点：歪戴嵌红绿蓝三宝石巨型锯齿金冠 + 宽大狞笑獠牙头与枢轴锁死金环双尖耳
  //     + 大肚腩镶金赤红披风与滞后颠簸满溢金币宝袋 + 两段式手臂与枢轴锁死黑铁镶金狼牙重锤
  //   - 39 色高对比 3 档色表（0 重色），glowKeys 严格仅限 emissive 三档，常态 1:1 锐利无损像素
  //   - 完整实现 4 套一键换色皮肤与 7 个连续动作（含 4 大 Boss 技能 + 破盾歪冠硬直）
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      skinDark:     '#2e6126',
      skinMid:      '#5ca339',
      skinHi:       '#9ad459',
      bellyDark:    '#4c7a32',
      bellyMid:     '#7fb84b',
      bellyHi:      '#b8e075',
      capeDark:     '#63121b',
      capeMid:      '#a8242c',
      capeHi:       '#de494b',
      leatherDark:  '#3d2417',
      leatherMid:   '#6e4228',
      leatherHi:    '#a16742',
      sackDark:     '#5c4429',
      sackMid:      '#8f6c45',
      sackHi:       '#c29969',
      goldDark:     '#966410',
      goldMid:      '#e3ad24',
      goldHi:       '#ffe46b',
      metalDark:    '#222730',
      metalMid:     '#495363',
      metalHi:      '#8594a8',
      woodDark:     '#472b19',
      woodMid:      '#7a4d2e',
      woodHi:       '#ad764c',
      boneDark:     '#8f8573',
      boneMid:      '#d1c7b4',
      boneHi:       '#f7f2e4',
      gemRedMid:    '#d92136',
      gemRedHi:     '#ff707d',
      gemGreenMid:  '#1eb84c',
      gemGreenHi:   '#7ef598',
      gemBlueMid:   '#1f72e0',
      gemBlueHi:    '#7cc4ff',
      eyeDark:      '#120e17',
      eyeIris:      '#f5b82e',
      eyeGlint:     '#f8fdff',
      emissiveMid:  '#ff4d1a',
      emissiveHot:  '#ff9e26',
      emissiveCore: '#fff2b8'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'leg', 'boot', 'body', 'belly', 'skirt', 'strap', 'cape', 'capeTrim',
      'sack', 'sackPatch', 'goldTrim', 'gem', 'head', 'nose', 'mouth', 'eye',
      'ear', 'crown', 'arm', 'bracer', 'weapon', 'spike', 'banner', 'emblem',
      'minionBody', 'minionCloth', 'emissive'
    ],
    noCrease: [
      ['eye', 'head'], ['nose', 'head'], ['mouth', 'head'], ['ear', 'head'],
      ['body', 'belly'], ['leg', 'boot'], ['cape', 'capeTrim'],
      ['sack', 'sackPatch'], ['sack', 'goldTrim'], ['sack', 'gem'],
      ['crown', 'gem'], ['crown', 'emissive'], ['weapon', 'spike'],
      ['weapon', 'goldTrim'], ['weapon', 'emissive'],
      ['banner', 'emblem'], ['banner', 'capeTrim'],
      ['minionBody', 'minionCloth'], ['minionBody', 'eye']
    ],
    materials: {
      skin:    ['skinDark',    'skinMid',    'skinHi'],
      belly:   ['bellyDark',   'bellyMid',   'bellyHi'],
      cape:    ['capeDark',    'capeMid',    'capeHi'],
      leather: ['leatherDark', 'leatherMid', 'leatherHi'],
      sack:    ['sackDark',    'sackMid',    'sackHi'],
      gold:    ['goldDark',    'goldMid',    'goldHi'],
      metal:   ['metalDark',   'metalMid',   'metalHi'],
      wood:    ['woodDark',    'woodMid',    'woodHi'],
      bone:    ['boneDark',    'boneMid',    'boneHi']
    },
    protectedParts: ['eye', 'mouth', 'gem', 'emissive']
  });

  const SKINS = [
    {
      id: 'forest_tyrant',
      name: '苔绿金冠',
      dot: '#5ca339',
      outline: '#12100d',
      pal: {},
      fx: { coin: '#ffe46b', spark: '#ff9e26', shout: '#de494b', dust: '#a8966e' }
    },
    {
      id: 'blood_warlord',
      name: '赤皮战酋',
      dot: '#9c4632',
      outline: '#1c0c0a',
      pal: {
        skinDark:    '#5e2418', skinMid:    '#9c4632', skinHi:    '#d47457',
        bellyDark:   '#733524', bellyMid:   '#b55f45', bellyHi:   '#e39476',
        capeDark:    '#362014', capeMid:    '#593825', capeHi:    '#8a5c3f',
        goldDark:    '#824614', goldMid:    '#cf7d2b', goldHi:    '#ffb963',
        metalDark:   '#574e45', metalMid:   '#9c9282', metalHi:   '#e8e0cf',
        eyeIris:     '#ffaa22'
      },
      fx: { coin: '#ffb963', spark: '#ff7033', shout: '#c94c2e', dust: '#9e7c5a' }
    },
    {
      id: 'frost_raider',
      name: '霜青雪酋',
      dot: '#548c9e',
      outline: '#0d1521',
      pal: {
        skinDark:    '#2f5766', skinMid:    '#548c9e', skinHi:    '#8ec5d6',
        bellyDark:   '#447080', bellyMid:   '#76abb8', bellyHi:   '#b4dce6',
        capeDark:    '#132242', capeMid:    '#233c6b', capeHi:    '#456bb0',
        goldDark:    '#7294ab', goldMid:    '#c8e4f5', goldHi:    '#f0f9ff',
        metalDark:   '#26394d', metalMid:   '#4f7091', metalHi:   '#9ac0e0',
        emissiveMid: '#26a8ff', emissiveHot:'#7ce0ff', emissiveCore:'#ebfcff',
        eyeIris:     '#7ce8ff'
      },
      fx: { coin: '#c8e4f5', spark: '#7ce0ff', shout: '#456bb0', dust: '#b8d6e3' }
    },
    {
      id: 'royal_obsidian',
      name: '玄铁黑酋',
      dot: '#3d4f46',
      outline: '#0c0b12',
      pal: {
        skinDark:    '#212e28', skinMid:    '#3d4f46', skinHi:    '#698275',
        bellyDark:   '#2e3d36', bellyMid:   '#50665b', bellyHi:   '#80998c',
        capeDark:    '#3b1440', capeMid:    '#63286b', capeHi:    '#9c4ca6',
        goldDark:    '#a36b12', goldMid:    '#f0b832', goldHi:    '#ffeb85',
        metalDark:   '#16161f', metalMid:   '#313242', metalHi:   '#626680',
        emissiveMid: '#e83862', emissiveHot:'#ff8a36', emissiveCore:'#fff0bd',
        eyeIris:     '#ff5e3a'
      },
      fx: { coin: '#f0b832', spark: '#ff8a36', shout: '#9c4ca6', dust: '#787585' }
    }
  ];

  const ACTIONS = [
    { id: 'patrol',             name: '霸道巡营', loop: true,  status: 'done' },
    { id: 'idle',               name: '叉腰狞笑', loop: true,  status: 'done' },
    { id: 'stagger',            name: '破盾歪冠', loop: false, duration: 1.5, status: 'done' },
    { id: 'skill_mace_smash',   name: '霸王重锤', loop: false, duration: 2.4, status: 'done' },
    { id: 'skill_gold_rain',    name: '撒币乱砸', loop: false, duration: 2.8, status: 'done' },
    { id: 'skill_rally_horde',  name: '摇旗召众', loop: false, duration: 3.0, status: 'done' },
    { id: 'skill_greed_charge', name: '贪财蛮冲', loop: false, duration: 3.2, status: 'done' }
  ];

  // 偏心旋转部件枢轴常数（全部采用 pivotToWorldXY 严格锁死关节）
  const EAR_PIVOT       = { x: 3.6, y: 0.8 };
  const UPPER_ARM_PIVOT = { x: 0.0, y: -2.2 };
  const FOREARM_PIVOT   = { x: 0.0, y: -2.6 };
  const MACE_PIVOT_Y    = -8.2;
  const MACE_UP_PIVOT_Y = -1.6;
  const BANNER_PIVOT_Y  = 0.0;

  // =========================================================================
  // 体素部件构建区（每盒严格 <= 40 格，高对比 3 档色阶 + 独立 partId 切暗缝）
  // =========================================================================

  // 1. 粗壮短腿 + 裹皮铁靴（8×9×11，左右复用，顶部 z=10 深嵌躯干战裙内 >= 3 格）
  function buildLeg(makeCanvas) {
    const m = new VoxelModel(8, 9, 11, SPEC);
    const { mat, partId } = SPEC;
    // 粗壮绿色大腿与小腿（直插至顶部 z=10.2，深嵌躯干防脱胯）
    m.paintCapsule(0, -0.3, 3.2, 0, -0.1, 10.2, 2.35, 2.75, mat('skin'), partId.leg, true);
    // 裹腿皮绑带
    m.paintEllipsoid(0, 0.0, 4.6, 2.6, 2.6, 1.4, mat('leather'), partId.boot, true);
    // 重型铁头皮靴（前掌向 +Y 探出，稳稳踩实 z=0 地面）
    m.paintEllipsoid(0, 0.8, 1.7, 2.75, 3.45, 1.95, mat('leather'), partId.boot, true);
    // 铁靴头甲与侧面金扣
    m.paintEllipsoid(0, 2.7, 1.4, 2.15, 1.45, 1.45, mat('metal'), partId.spike, true);
    m.paintEllipsoid(2.3, 0.6, 2.6, 0.8, 1.0, 0.8, mat('gold'), partId.goldTrim, true);
    m.paintEllipsoid(-2.3, 0.6, 2.6, 0.8, 1.0, 0.8, mat('gold'), partId.goldTrim, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 10, centerZ: 5 });
  }

  // 2. 宽厚大肚腩躯干 + 镶金皮带 + 皮革战裙（24×20×18）
  function buildTorso(makeCanvas) {
    const m = new VoxelModel(24, 20, 18, SPEC);
    const { mat, partId } = SPEC;

    // 宽厚肩胸 + 圆鼓大肚腩 + 粗短颈座
    m.fillAABB(-11, 11, -9, 9, 0, 17, (x, y, z, X, Y) => {
      const dChest = (Math.hypot(X / 9.2, (Y + 0.5) / 6.8, (z - 11.4) / 5.4) - 1) * 5.2;
      const dBelly = (Math.hypot(X / 8.5, (Y - 2.2) / 7.2, (z - 7.4) / 5.6) - 1) * 5.2;
      const dNeck  = (Math.hypot(X / 4.8, (Y - 0.6) / 4.4, (z - 16.0) / 2.6) - 1) * 2.6;
      const dBody  = smin(smin(dChest, dBelly, 2.0), dNeck, 1.4);
      if (dBody <= 0) {
        // 胸前圆鼓浅绿肚腩区
        const isBelly = Y > 2.0 && z >= 4.0 && z <= 11.6 && Math.hypot(X / 6.6, (z - 7.8) / 4.2) <= 1.0;
        m.setRaw(x, y, z, isBelly ? mat('belly') : mat('skin'), isBelly ? partId.belly : partId.body);
      }

      // 皮革战裙下沿（z=0..6，牢牢包覆大腿上段 3 格以上，彻底杜绝身腿分离）
      const rSkirt = Math.hypot(X / 9.6, (Y - 0.2) / 7.8);
      if (z >= 1 && z <= 5 && rSkirt <= 1.0 && rSkirt >= 0.42) {
        const isTrim = z === 1 && rSkirt >= 0.78;
        m.setRaw(x, y, z, isTrim ? mat('gold') : mat('leather'), isTrim ? partId.goldTrim : partId.skirt);
      }
      // 前后宽大战裙垂片（直落 z=0）
      if (z >= 0 && z <= 5 && Math.abs(X) <= 4.4 && Y >= 4.2 && Y <= 8.2) {
        const isBorder = z === 0 || Math.abs(X) >= 3.5;
        m.setRaw(x, y, z, isBorder ? mat('gold') : mat('cape'), isBorder ? partId.goldTrim : partId.cape);
      }
      if (z >= 0 && z <= 5 && Math.abs(X) <= 5.0 && Y <= -4.4 && Y >= -7.8) {
        const isBorder = z === 0;
        m.setRaw(x, y, z, isBorder ? mat('gold') : mat('leather'), isBorder ? partId.goldTrim : partId.skirt);
      }
    });

    // 宽厚镶金王者皮带（z=4.8..6.8）
    m.fillAABB(-10.2, 10.2, -8.4, 9.2, 4, 7, (x, y, z, X, Y) => {
      if (z < 5 || z > 6) return;
      const rBelt = Math.hypot(X / 9.8, (Y - 0.6) / 8.4);
      if (rBelt <= 1.0 && rBelt >= 0.76) {
        m.setRaw(x, y, z, mat('leather'), partId.strap);
      }
    });
    // 正中巨型金腰扣 + 红宝石镶嵌
    m.paintEllipsoid(0, 8.6, 5.6, 2.5, 1.3, 1.75, mat('gold'), partId.goldTrim, true);
    m.paintEllipsoid(0, 9.2, 5.6, 1.0, 0.85, 0.95, SPEC.keyToId.gemRedMid, partId.gem, true);

    // 斜挎胸甲皮带与肩部大金扣（扣住披风与宝袋）
    m.paintCapsule(-7.8, 3.6, 15.0, 7.6, 5.6, 6.2, 1.35, 1.35, mat('leather'), partId.strap, true);
    m.paintCapsule(-7.4, -3.6, 14.8, 7.0, -5.2, 6.2, 1.35, 1.35, mat('leather'), partId.strap, true);
    m.paintEllipsoid(-7.2, 4.2, 14.4, 1.65, 1.4, 1.45, mat('gold'), partId.goldTrim, true);
    m.paintEllipsoid( 7.2, 4.2, 14.4, 1.65, 1.4, 1.45, mat('gold'), partId.goldTrim, true);
    // 胸带铆钉
    m.paintEllipsoid(-2.4, 6.6, 11.4, 1.1, 0.9, 1.1, mat('metal'), partId.spike, true);
    m.paintEllipsoid( 2.4, 7.2, 8.6, 1.1, 0.9, 1.1, mat('metal'), partId.spike, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.5, headZ: 17, centerZ: 9 });
  }

  // 3. 镶金边赤红王者披风（22×14×16，背挂局部坐标，零穿模）
  function buildCape(makeCanvas) {
    const m = new VoxelModel(22, 14, 16, SPEC);
    const { mat, partId } = SPEC;
    // 上宽下展弧形披风，顶部扣在肩背，下摆向 -Y 扬起
    m.fillAABB(-10.5, 10.5, -6.5, 6.5, 0, 15, (x, y, z, X, Y) => {
      const u = z / 15.0; // 0=底边, 1=肩领
      const halfW = lerp(10.0, 7.8, u);
      if (Math.abs(X) > halfW) return;
      // 弧形背壳：左右微向前包，下摆向后(-Y)舒展
      const archY = lerp(-3.6, 2.8, u) + (X * X) / (halfW * halfW) * lerp(2.2, 1.4, u);
      const thick = u > 0.85 ? 2.1 : 1.55;
      if (Math.abs(Y - archY) <= thick) {
        // 底部锯齿小缺口装饰（暴君粗犷感）
        if (z <= 1 && Math.abs(((Math.round(X) + 12) % 4) - 1.5) < 0.6) return;
        const isGoldHem = z <= 2 || Math.abs(X) >= halfW - 1.35 || z >= 14;
        m.setRaw(x, y, z, isGoldHem ? mat('gold') : mat('cape'), isGoldHem ? partId.capeTrim : partId.cape);
      }
    });
    // 领口厚重毛/金翻领
    m.paintCapsule(-7.6, 3.0, 14.2, 7.6, 3.0, 14.2, 1.85, 1.85, mat('gold'), partId.capeTrim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.0, headZ: 15, centerZ: 8 });
  }

  // 4. 鼓胀满溢金币与红绿蓝晶石的黄金大宝袋（18×16×16）
  function buildLootSack(makeCanvas) {
    const m = new VoxelModel(18, 16, 16, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 鼓胀粗麻袋主体
    m.paintEllipsoid(0, 0, 5.8, 7.4, 6.2, 5.4, mat('sack'), partId.sack, true);
    // 侧面缝补皮补丁与加固皮带
    m.paintEllipsoid(-5.4, -2.0, 5.4, 2.4, 2.4, 2.4, mat('leather'), partId.sackPatch, true);
    m.paintEllipsoid( 5.2, -2.4, 4.6, 2.2, 2.2, 2.2, mat('leather'), partId.sackPatch, true);
    // 袋口勒紧粗皮绳束颈
    m.paintEllipsoid(0, 0, 10.6, 5.4, 4.8, 1.3, mat('leather'), partId.sackPatch, true);
    // 袋口外翻布缘
    m.paintEllipsoid(0, 0, 11.4, 6.2, 5.4, 1.1, mat('sack'), partId.sack, false);

    // 袋口堆满金灿灿金锭与金币堆（0.6 俯视一眼可见满溢财富！）
    m.paintEllipsoid( 0.0,  0.2, 12.2, 5.2, 4.5, 2.2, mat('gold'), partId.goldTrim, true);
    m.paintEllipsoid(-2.6, -1.0, 13.4, 2.1, 1.8, 1.6, mat('gold'), partId.goldTrim, true);
    m.paintEllipsoid( 2.5,  0.8, 13.5, 2.1, 1.7, 1.5, mat('gold'), partId.goldTrim, true);
    m.paintEllipsoid( 0.2, -1.8, 13.8, 2.0, 1.8, 1.5, mat('gold'), partId.goldTrim, true);

    // 探出袋口的红、绿、蓝三原色大晶石
    m.paintCapsule(-3.2, 1.4, 12.2, -4.0, 2.0, 14.8, 1.35, 0.85, keyToId.gemRedMid, partId.gem, true);
    m.paintEllipsoid(-4.0, 2.0, 14.8, 0.95, 0.95, 0.85, keyToId.gemRedHi, partId.gem, true);

    m.paintCapsule(0.0, 1.8, 12.6, 0.0, 2.2, 15.0, 1.35, 0.85, keyToId.gemGreenMid, partId.gem, true);
    m.paintEllipsoid(0.0, 2.2, 15.0, 0.95, 0.95, 0.85, keyToId.gemGreenHi, partId.gem, true);

    m.paintCapsule(3.2, -1.2, 12.2, 3.8, -1.8, 14.8, 1.35, 0.85, keyToId.gemBlueMid, partId.gem, true);
    m.paintEllipsoid(3.8, -1.8, 14.8, 0.95, 0.95, 0.85, keyToId.gemBlueHi, partId.gem, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.5, headZ: 15, centerZ: 8 });
  }

  // 5. 宽大狞笑头颅 + 鹰钩鼻 + 露白双獠牙 + 0.6 俯视 0 遮挡锐利邪眼（18×17×15）
  function buildHead(makeCanvas) {
    const W = 18, D = 17, H = 15;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;

    // 宽颅骨 + 宽厚下颚（暴君霸气比例）
    m.fillAABB(-8.2, 8.2, -7.2, 7.2, 0, 14, (x, y, z, X, Y) => {
      const dSkull = (Math.hypot(X / 6.9, (Y + 0.4) / 6.1, (z - 7.6) / 5.7) - 1) * 5.6;
      const dJaw   = (Math.hypot(X / 7.4, (Y - 1.4) / 5.6, (z - 3.9) / 3.4) - 1) * 3.8;
      if (smin(dSkull, dJaw, 1.6) <= 0) {
        m.setRaw(x, y, z, mat('skin'), partId.head);
      }
    });

    // 粗大弯钩哥布林鼻（不遮挡上方双眼）
    m.paintCapsule(0, 4.8, 6.2, 0, 7.6, 4.9, 1.95, 1.25, mat('skin'), partId.nose, true);

    // 宽大狞笑黑口槽
    m.fillAABB(-4.8, 4.8, 4.2, 7.4, 2, 5, (x, y, z, X, Y) => {
      const smileCurve = Math.abs(X) * 0.22;
      if (Math.abs(X) <= 4.3 && Y >= 4.4 && Y <= 6.8 && z >= Math.round(2.0 + smileCurve) && z <= Math.round(3.6 + smileCurve)) {
        m.setRaw(x, y, z, keyToId.eyeDark, partId.mouth);
      }
    });

    // 两颗醒目雪白上翘大獠牙 + 中间两颗尖牙
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 3.4, 6.0, 2.2, s * 3.7, 6.7, 5.0, 0.95, 0.72, mat('bone'), partId.mouth, true);
      const tx = Math.round(hw + s * 3.7);
      const ty = Math.round(hd + 6.7);
      m.setRaw(tx, ty, 5, keyToId.boneHi, partId.mouth);
      m.setRaw(tx, ty, 4, keyToId.boneHi, partId.mouth);
      // 内侧小牙
      const ix = Math.round(hw + s * 1.4);
      const iy = Math.round(hd + 6.4);
      m.setRaw(ix, iy, 3, keyToId.boneMid, partId.mouth);
    }

    // 粗犷怒眉脊（置于眼上方偏后，确保 0.6 俯视绝对不遮挡眼睛！）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.6, 4.8, 10.2, s * 5.2, 4.1, 11.2, 1.15, 0.95, mat('skin'), partId.head, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 着色完成后沿前表面扫描落点精雕双邪眼（3×2 锐利不糊，0.6 俯视 0 遮挡）
    const eyeZ = 8;
    for (const s of [-1, 1]) {
      const cx = Math.round(hw + s * 3.4);
      let sy = -1;
      for (let y = D - 2; y >= 2; y--) {
        if (m.getPartId(cx, y, eyeZ) === partId.head) { sy = y; break; }
      }
      if (sy < 0) sy = Math.round(hd + 5.6);
      // 外侧斜挑金橙虹膜 + 中央深黑竖瞳 + 顶部单格锐利 eyeGlint（绝不进 glowKeys）
      const cols = s < 0 ? [cx - 1, cx, cx + 1] : [cx - 1, cx, cx + 1];
      for (let ci = 0; ci < 3; ci++) {
        const px = cols[ci];
        const isPupil = (ci === 1);
        const isOuter = (s < 0 ? ci === 0 : ci === 2);
        for (let dz = 0; dz <= 1; dz++) {
          let kId = keyToId.eyeIris;
          if (isPupil) kId = (dz === 1) ? keyToId.eyeGlint : keyToId.eyeDark;
          else if (!isOuter && dz === 0) kId = keyToId.eyeDark;
          const pz = eyeZ + dz + (isOuter ? 1 : 0);
          m.setRaw(px, sy, pz, kId, partId.eye);
          if (sy + 1 < D) m.setRaw(px, sy + 1, pz, kId, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 7.4, headZ: 14, centerZ: 7 });
  }

  // 6. 歪戴巨型锯齿金冠 + 额前红绿蓝三原色大宝石（15×15×9）
  //    charged=true 时仅在三宝石顶端与冠尖点亮微小 emissive 脉动核，常态 100% 锐利无糊
  function buildCrown(makeCanvas, charged, tiltAngle) {
    const W = 15, D = 15, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const ct = Math.cos(tiltAngle), st = Math.sin(tiltAngle);

    m.fillAABB(-7, 7, -7, 7, 0, 8, (x, y, z, X, Y) => {
      // 绕 Y 轴侧歪（roll），打造暴君歪戴王冠标志轮廓
      const lx = X * ct + (z - 3.5) * st;
      const lz = -X * st + (z - 3.5) * ct + 3.5;
      if (lz < 0 || lz > 7.8) return;
      const r = Math.hypot(lx, Y);
      const rOut = 5.6 + lz * 0.14;
      const rIn  = 3.7 + lz * 0.10;
      if (r > rOut || r < rIn) return;

      const ang = Math.atan2(Y, lx);
      // 6 枚霸气大锯齿冠尖（正前 +Y 居中留宽额镶三宝石，两侧与后方高耸锯齿）
      const toothWave = Math.cos(ang * 6);
      const maxZ = 3.2 + (toothWave > 0 ? Math.pow(toothWave, 0.75) * 4.4 : 0);
      if (lz <= maxZ) {
        const isTip = charged && lz >= maxZ - 0.85 && toothWave > 0.85;
        m.setRaw(x, y, z, isTip ? keyToId.emissiveHot : mat('gold'), isTip ? partId.emissive : partId.crown);
      }
    });

    // 冠额正中并排镶嵌红、绿、蓝三颗大宝石（+Y 前缘）
    const gems = [
      { gx: -3.1, gy: 5.1, mid: keyToId.gemRedMid,   hi: keyToId.gemRedHi },
      { gx:  0.0, gy: 5.9, mid: keyToId.gemGreenMid, hi: keyToId.gemGreenHi },
      { gx:  3.1, gy: 5.1, mid: keyToId.gemBlueMid,  hi: keyToId.gemBlueHi }
    ];
    for (const g of gems) {
      // 随王冠侧歪计算宝石中心高度
      const gz = 2.6 + g.gx * st;
      m.fillAABB(g.gx - 1.3, g.gx + 1.3, g.gy - 1.3, g.gy + 1.3, gz - 1.3, gz + 1.5, (x, y, z, X, Y) => {
        const dist = Math.hypot(X - g.gx, Y - g.gy, z - gz);
        if (dist <= 1.25) {
          let kId = (z > gz + 0.25) ? g.hi : g.mid;
          let pId = partId.gem;
          if (charged && dist <= 0.75) {
            kId = keyToId.emissiveCore;
            pId = partId.emissive;
          }
          m.setRaw(x, y, z, kId, pId);
        }
      });
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.5, headZ: 8, centerZ: 4 });
  }

  // 7. 超长带金环大尖耳（10×6×7，枢轴锁死耳根）
  function buildEar(makeCanvas, side) {
    const m = new VoxelModel(10, 6, 7, SPEC);
    const { mat, partId } = SPEC;
    const rx = -side * EAR_PIVOT.x;
    const ry = EAR_PIVOT.y;
    const rz = 2.2;
    // 耳根粗厚渐细上挑
    m.paintCapsule(rx, ry, rz, rx + side * 3.8, ry - 1.0, rz + 1.0, 1.9, 1.45, mat('skin'), partId.ear, true);
    m.paintCapsule(rx + side * 3.8, ry - 1.0, rz + 1.0, rx + side * 7.8, ry - 2.3, rz + 2.7, 1.45, 0.95, mat('skin'), partId.ear, true);
    // 标志金耳环（垂挂在耳中下方）
    const ringX = rx + side * 4.2;
    const ringY = ry - 1.1;
    m.paintCapsule(ringX, ringY, rz - 0.1, ringX + side * 0.4, ringY, rz - 1.5, 0.85, 0.85, mat('gold'), partId.goldTrim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5, headZ: 6, centerZ: 3 });
  }

  // 8. 两段式手臂：大臂（8×10×8）与小臂（7×10×7），左右对称复用
  function buildUpperArm(makeCanvas) {
    const m = new VoxelModel(8, 10, 8, SPEC);
    const { mat, partId } = SPEC;
    // 肩头镶金皮护肩
    m.paintEllipsoid(0, UPPER_ARM_PIVOT.y + 0.4, 4.4, 3.1, 3.0, 2.7, mat('leather'), partId.bracer, true);
    m.paintEllipsoid(0, UPPER_ARM_PIVOT.y + 0.4, 6.2, 2.5, 2.4, 1.0, mat('gold'), partId.goldTrim, true);
    // 粗壮绿色大臂向 +Y 延伸至肘部
    m.paintCapsule(0, UPPER_ARM_PIVOT.y + 0.8, 3.8, 0, 3.4, 3.0, 2.25, 1.95, mat('skin'), partId.arm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5, headZ: 7, centerZ: 4 });
  }

  function buildForearm(makeCanvas) {
    const m = new VoxelModel(7, 10, 7, SPEC);
    const { mat, partId } = SPEC;
    // 肘部过渡肌
    m.paintCapsule(0, FOREARM_PIVOT.y, 3.2, 0, 2.8, 3.2, 1.85, 1.95, mat('skin'), partId.arm, true);
    // 黑铁镶金护腕
    m.paintCapsule(0, -0.4, 3.2, 0, 1.6, 3.2, 2.2, 2.2, mat('leather'), partId.bracer, true);
    m.paintEllipsoid(0, 0.6, 5.0, 1.2, 1.1, 0.85, mat('metal'), partId.spike, true);
    // 粗大紧握拳头
    m.paintEllipsoid(0, 3.2, 3.3, 2.15, 2.05, 2.05, mat('skin'), partId.arm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 6, centerZ: 3 });
  }

  // 9. 黑铁镶金巨型狼牙重锤（常态横握 12×24×12 + 蓄力高举 12×14×24）
  function buildMace(makeCanvas, charged) {
    const m = new VoxelModel(12, 24, 12, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 尾部金球配重 + 长木柄（枢轴位于 y = MACE_PIVOT_Y = -8.2）
    m.paintEllipsoid(0, -10.2, 5.8, 1.6, 1.5, 1.6, mat('gold'), partId.goldTrim, true);
    m.paintCapsule(0, -9.5, 5.8, 0, 2.6, 5.8, 1.15, 1.45, mat('wood'), partId.weapon, true);
    // 握柄皮缠带
    m.paintCapsule(0, -8.8, 5.8, 0, -5.6, 5.8, 1.38, 1.38, mat('leather'), partId.bracer, true);
    // 锤颈镶金环箍
    m.paintEllipsoid(0, 2.2, 5.8, 2.35, 1.4, 2.35, mat('gold'), partId.goldTrim, true);
    // 巨型黑铁狼牙锤头（y = 3.2..9.6）
    m.paintCapsule(0, 4.0, 5.8, 0, 8.6, 5.8, 3.45, 3.25, mat('metal'), partId.weapon, true);
    // 锤头金边束带
    m.paintEllipsoid(0, 6.3, 5.8, 3.65, 1.15, 3.65, mat('gold'), partId.goldTrim, true);
    // 蓄力火纹（仅在 charged=true 时亮起，常态 100% 锐利黑铁）
    if (charged) {
      m.paintEllipsoid(0, 4.6, 5.8, 3.55, 0.75, 3.55, keyToId.emissiveHot, partId.emissive, true);
      m.paintEllipsoid(0, 8.0, 5.8, 3.45, 0.75, 3.45, keyToId.emissiveCore, partId.emissive, true);
    }
    // 8 根粗犷黑铁/镶金狼牙刺
    const spikeDirs = [
      [ 1,  0,  0], [-1,  0,  0], [ 0,  0,  1], [ 0,  0, -1],
      [ 0.72, 0,  0.72], [-0.72, 0,  0.72], [ 0.72, 0, -0.72], [-0.72, 0, -0.72]
    ];
    for (let i = 0; i < spikeDirs.length; i++) {
      const sd = spikeDirs[i];
      const sy = (i < 4) ? 6.3 : 7.8;
      const sx0 = sd[0] * 2.8, sz0 = 5.8 + sd[2] * 2.8;
      const sx1 = sd[0] * 5.2, sz1 = 5.8 + sd[2] * 5.2;
      m.paintCapsule(sx0, sy, sz0, sx1, sy, sz1, 1.05, 0.55, (i < 4) ? mat('gold') : mat('metal'), partId.spike, true);
    }
    // 锤顶前端尖刺
    m.paintCapsule(0, 8.6, 5.8, 0, 11.2, 5.8, 1.5, 0.65, mat('gold'), partId.spike, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 11, centerZ: 6 });
  }

  // 9b. 高举蓄力竖直态狼牙重锤（12×14×24，霸王重锤蓄力过顶专用）
  function buildMaceRaised(makeCanvas) {
    const m = new VoxelModel(12, 14, 24, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 底部握柄向斜上高举
    m.paintEllipsoid(0, MACE_UP_PIVOT_Y, 1.6, 1.5, 1.5, 1.5, mat('gold'), partId.goldTrim, true);
    m.paintCapsule(0, MACE_UP_PIVOT_Y, 2.0, 0, 1.2, 14.2, 1.2, 1.45, mat('wood'), partId.weapon, true);
    m.paintCapsule(0, MACE_UP_PIVOT_Y, 2.5, 0, -0.8, 5.6, 1.4, 1.4, mat('leather'), partId.bracer, true);
    m.paintEllipsoid(0, 1.2, 13.8, 2.35, 2.35, 1.3, mat('gold'), partId.goldTrim, true);
    // 顶部巨型锤头 + 炽热蓄力火纹
    m.paintCapsule(0, 1.4, 15.6, 0, 1.8, 20.2, 3.45, 3.25, mat('metal'), partId.weapon, true);
    m.paintEllipsoid(0, 1.6, 17.8, 3.65, 3.65, 1.1, mat('gold'), partId.goldTrim, true);
    m.paintEllipsoid(0, 1.5, 16.3, 3.55, 3.55, 0.72, keyToId.emissiveHot, partId.emissive, true);
    m.paintEllipsoid(0, 1.7, 19.3, 3.45, 3.45, 0.72, keyToId.emissiveCore, partId.emissive, true);
    const dirs = [[1,0],[-1,0],[0,1],[0,-1],[0.72,0.72],[-0.72,0.72],[0.72,-0.72],[-0.72,-0.72]];
    for (let i = 0; i < dirs.length; i++) {
      const dx = dirs[i][0], dy = dirs[i][1];
      const sz = i < 4 ? 17.8 : 19.2;
      m.paintCapsule(dx * 2.8, 1.6 + dy * 2.8, sz, dx * 5.1, 1.6 + dy * 5.1, sz, 1.0, 0.55, i < 4 ? mat('gold') : mat('metal'), partId.spike, true);
    }
    m.paintCapsule(0, 1.8, 20.2, 0, 1.8, 22.8, 1.45, 0.65, mat('gold'), partId.spike, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 23, centerZ: 12 });
  }

  // 10. 立体金锭金币块（7×7×6，symDeg: 90，技能 2 撒币乱砸 6 枚复用）
  function buildGoldChunk(makeCanvas) {
    const m = new VoxelModel(7, 7, 6, SPEC);
    const { mat, partId } = SPEC;
    // 底部叠放金币堆 + 顶部交叉厚金锭（四重旋转对称，省 75% 缓存图集）
    m.paintEllipsoid(0, 0, 1.5, 2.8, 2.8, 1.5, mat('gold'), partId.goldTrim, true);
    m.fillAABB(-2.2, 2.2, -2.2, 2.2, 2, 4, (x, y, z, X, Y) => {
      if ((Math.abs(X) <= 2.0 && Math.abs(Y) <= 1.2) || (Math.abs(Y) <= 2.0 && Math.abs(X) <= 1.2)) {
        m.setRaw(x, y, z, mat('gold'), partId.goldTrim);
      }
    });
    m.paintEllipsoid(0, 0, 4.6, 1.3, 1.3, 1.0, mat('gold'), partId.goldTrim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 5, centerZ: 3 });
  }

  // 11. 锯齿赤红部落战旗（14×6×26，技能 3 摇旗召众左手高举狂摇）
  function buildWarBanner(makeCanvas) {
    const m = new VoxelModel(14, 6, 26, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 长木矛杆 + 顶部黄金王冠矛尖 + 横木梁
    m.paintCapsule(0, 0, 0.5, 0, 0, 23.0, 0.95, 0.95, mat('wood'), partId.weapon, true);
    m.paintCapsule(-6.0, 0, 21.0, 6.0, 0, 21.0, 0.95, 0.95, mat('wood'), partId.weapon, true);
    m.paintEllipsoid(-6.2, 0, 21.0, 1.15, 1.15, 1.15, mat('gold'), partId.goldTrim, true);
    m.paintEllipsoid( 6.2, 0, 21.0, 1.15, 1.15, 1.15, mat('gold'), partId.goldTrim, true);
    m.paintCapsule(0, 0, 22.8, 0, 0, 25.2, 1.5, 0.65, mat('gold'), partId.goldTrim, true);

    // 锯齿赤红大旗面（带微浪起伏 + 醒目金边 + 居中骷髅金冠纹）
    m.fillAABB(-5.8, 5.8, -2.2, 2.2, 8, 20, (x, y, z, X, Y) => {
      const waveY = Math.sin(X * 0.55 + z * 0.25) * 0.75;
      if (Math.abs(Y - waveY) > 0.95) return;
      // 底部锯齿燕尾切口
      const notch = (Math.abs(X) < 1.6) ? 10.2 : ((Math.abs(X) > 4.0) ? 8.2 : 9.2);
      if (z < notch) return;
      const isEdge = Math.abs(X) >= 4.7 || z >= 19.5 || z <= notch + 0.9;
      m.setRaw(x, y, z, isEdge ? mat('gold') : mat('cape'), isEdge ? partId.capeTrim : partId.banner);
    });

    // 旗面居中白骨骷髅头 + 金冠小纹章（正反两面皆清晰可辨）
    const hw = 14 * 0.5 - 0.5;
    m.fillAABB(-2.6, 2.6, -2.0, 2.0, 12, 18, (x, y, z, X, Y) => {
      const waveY = Math.sin(X * 0.55 + z * 0.25) * 0.75;
      if (Math.abs(Y - waveY) > 1.25) return;
      // 骷髅圆颅 + 窄颌
      const inSkull = Math.hypot(X / 2.3, (z - 15.0) / 1.9) <= 1.0 || (Math.abs(X) <= 1.2 && z >= 12.6 && z <= 13.8);
      if (inSkull) {
        const isEyeHole = Math.abs(Math.abs(X) - 1.0) <= 0.65 && Math.abs(z - 15.0) <= 0.65;
        m.setRaw(x, y, z, isEyeHole ? keyToId.eyeDark : keyToId.boneHi, partId.emblem);
      }
      // 骷髅头顶小金冠
      if (z >= 17 && z <= 18 && Math.abs(X) <= 2.1 && (z === 17 || Math.abs(Math.round(X)) !== 1)) {
        m.setRaw(x, y, z, keyToId.goldHi, partId.goldTrim);
      }
    });
    // 防止未使用的 hw 告警，顺手补强旗杆中段红缨
    const cx = Math.round(hw);
    m.setRaw(cx, 2, 22, keyToId.gemRedHi, partId.gem);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 25, centerZ: 14 });
  }

  // 12. 迷你持棒哥布林喽啰（11×11×13，技能 3 召出 2 只共享 1 份资产）
  function buildMinionGoblin(makeCanvas) {
    const m = new VoxelModel(11, 11, 13, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 双短腿 + 粗布裤裙
    m.paintCapsule(-1.8, 0, 0.8, -1.6, 0, 4.4, 1.15, 1.2, mat('skin'), partId.minionBody, true);
    m.paintCapsule( 1.8, 0, 0.8,  1.6, 0, 4.4, 1.15, 1.2, mat('skin'), partId.minionBody, true);
    m.paintEllipsoid(0, 0, 4.6, 3.0, 2.5, 2.1, mat('sack'), partId.minionCloth, true);
    // 瘦小绿躯干
    m.paintEllipsoid(0, 0.2, 6.8, 2.7, 2.3, 2.0, mat('skin'), partId.minionBody, true);
    // 大脑袋 + 尖鼻 + 横展小尖耳
    m.paintEllipsoid(0, 0.6, 10.0, 3.1, 2.9, 2.6, mat('skin'), partId.minionBody, true);
    m.paintCapsule(0, 3.0, 9.8, 0, 4.5, 9.2, 0.95, 0.65, mat('skin'), partId.minionBody, true);
    m.paintCapsule(-2.6, 0.4, 10.6, -5.0, -0.6, 11.8, 1.0, 0.65, mat('skin'), partId.minionBody, true);
    m.paintCapsule( 2.6, 0.4, 10.6,  5.0, -0.6, 11.8, 1.0, 0.65, mat('skin'), partId.minionBody, true);
    // 左臂前挥 + 右臂高举小木棒
    m.paintCapsule(-2.6, 0.4, 7.2, -3.6, 2.6, 6.6, 0.95, 0.85, mat('skin'), partId.minionBody, true);
    m.paintCapsule( 2.6, 0.4, 7.4,  3.6, 2.2, 8.8, 0.95, 0.85, mat('skin'), partId.minionBody, true);
    m.paintCapsule( 3.6, 2.2, 8.2,  4.0, 3.2, 12.2, 0.85, 1.25, mat('wood'), partId.weapon, true);
    m.paintEllipsoid(4.0, 3.2, 11.4, 1.2, 1.2, 0.8, mat('metal'), partId.spike, true);
    m.despeckle();
    m.applyArtShading(true);
    // 锐利双邪眼
    const hw = 5, hd = 5;
    for (const s of [-1, 1]) {
      const ex = hw + s * 1;
      m.setRaw(ex, hd + 3, 10, keyToId.eyeDark, partId.eye);
      m.setRaw(ex + s, hd + 3, 10, keyToId.eyeIris, partId.eye);
      m.setRaw(ex, hd + 3, 11, keyToId.eyeGlint, partId.eye);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 12, centerZ: 6 });
  }

  // =========================================================================
  // 资产主定义：哥布林王（boss_goblin_king）
  // =========================================================================
  const BossGoblinKingDef = {
    id: 'boss_goblin_king',
    name: '哥布林王',
    tag: '部落蛮横大 Boss · 贪财暴君',
    summary: '歪戴红绿蓝三宝石锯齿金冠的巨型哥布林暴君：宽厚大肚腩、赤红镶金披风、滞后颠簸满溢宝袋、黑铁镶金狼牙重锤，内置 4 套皮肤与 7 个动作/技能演出',
    defaultHabitat: 'forest',
    status: 'done',
    footRadius: 12.6,
    ecoWeight: 1.9,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: ACTIONS,
    blocks: [
      '歪戴三宝石锯齿金冠',
      '枢轴锁死金环双尖耳',
      '滞后颠簸满溢大宝袋',
      '两段式手臂 + 枢轴重锤',
      '深嵌不脱胯二足重步',
      '4 大 Boss 技能演出'
    ],
    soulHabit: '平时叉腰挺肚霸道巡营，破盾时金冠歪弹，战时依次施展霸王重锤、撒币乱砸、摇旗召众与贪财蛮冲',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torso:        buildTorso(makeCanvas),
        cape:         buildCape(makeCanvas),
        lootSack:     buildLootSack(makeCanvas),
        head:         buildHead(makeCanvas),
        crown:        buildCrown(makeCanvas, false, 0.14),
        crownCharged: buildCrown(makeCanvas, true,  0.14),
        crownAskew:   buildCrown(makeCanvas, false, -0.34),
        earL:         buildEar(makeCanvas, -1),
        earR:         buildEar(makeCanvas,  1),
        upperArm:     buildUpperArm(makeCanvas),
        forearm:      buildForearm(makeCanvas),
        mace:         buildMace(makeCanvas, false),
        maceCharged:  buildMace(makeCanvas, true),
        maceRaised:   buildMaceRaised(makeCanvas),
        leg:          buildLeg(makeCanvas),
        goldChunk:    buildGoldChunk(makeCanvas),
        warBanner:    buildWarBanner(makeCanvas),
        minionGoblin: buildMinionGoblin(makeCanvas)
      };

      // 粗壮二足重步 IK（hipX=±4.8, restX=±5.0，步幅紧凑稳重、绝不脱胯）
      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -4.8, hipY: 0.0, hipZ: 8.6, restX: -5.0, restY: 0.2, group: 0, L1: 4.6, L2: 4.6, bendDir: 1 },
        { id: 'R', hipX:  4.8, hipY: 0.0, hipZ: 8.6, restX:  5.0, restY: 0.2, group: 1, L1: 4.6, L2: 4.6, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 3.1, stepDuration: 0.22, stepHeight: 2.8, strideAnticipation: 0.36 });

      const headYawSpring = new SpringDamper1D(0, 125, 8.2);
      const earLSpring    = new SpringDamper1D(0, 185, 6.2);
      const earRSpring    = new SpringDamper1D(0, 185, 6.2);
      const bodyBounce    = new SpringDamper1D(0, 165, 8.4);
      const sackBounce    = new SpringDamper1D(0, 105, 5.2);
      const sackSway      = new SpringDamper1D(0, 88,  5.6);
      const crownBounce   = new SpringDamper1D(0, 130, 5.8);
      const maceSpring    = new SpringDamper1D(0, 100, 6.0);

      // 预分配技能复用池（零每帧 GC 抖动）
      const goldChunks = Array.from({ length: 6 }, (_, i) => ({
        active: false,
        launchT: 0.62 + i * 0.11,
        sx: 0, sy: 0, sz: 22,
        tx: 0, ty: 0,
        x: 0, y: 0, z: 0,
        peakZ: 18 + (i % 3) * 4.2,
        ro: i * 0.7,
        spinRate: (i % 2 === 0 ? 1 : -1) * (5.2 + i * 0.6),
        bounced1: false,
        bounced2: false
      }));

      const minions = Array.from({ length: 2 }, (_, i) => ({
        active: false,
        side: i === 0 ? -1 : 1,
        x: 0, y: 0, z: 0,
        yaw: 0,
        hopPhase: i * Math.PI
      }));

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;

      const state = {
        x: hx0, y: hy0, z: 0,
        vx: 0, vy: 0, yaw: hyaw0,
        stepPhase: 0, stepSign: 1,
        tiltX: 0, tiltY: 0,
        lastAction: 'patrol',
        lastActionTime: 0,
        actStartX: hx0, actStartY: hy0, actStartYaw: hyaw0,
        chargeDirYaw: hyaw0,
        // 动作姿态输出包（由 update 连续写入，buildPartList 纯读）
        pose: {
          bodyLiftOff: 0,
          bodyFwdOff: 0,
          bodyYawOff: 0,
          headYawOff: 0,
          headLiftOff: 0,
          capeBackOff: 0,
          capeLiftOff: 0,
          capeYawOff: 0,
          sackLiftOff: 0,
          crownMode: 'normal', // 'normal' | 'charged' | 'askew'
          crownLiftOff: 0,
          crownSideOff: 0,
          crownYawOff: 0,
          earLOff: 0,
          earROff: 0,
          earLiftOff: 0,
          // 两段式手臂 FK 角与抬升
          lUpperYaw: 0.25, lUpperLift: 0, lForeYaw: -0.20, lForeLift: -1.4,
          rUpperYaw: -0.25, rUpperLift: 0, rForeYaw: 0.22, rForeLift: -1.0,
          maceMode: 'hand', // 'hand' | 'raised' | 'charged' | 'slung'
          maceYawOff: 0.15,
          maceLiftOff: 0,
          showBanner: false,
          bannerYawOff: 0,
          bannerLiftOff: 0,
          showGold: false,
          showMinions: false
        },
        // 一次性技能节拍触发标记
        flags: {
          staggerBurst: false,
          smashImpact: false,
          smashPullDust: false,
          goldLaunched: false,
          bellyPat1: false,
          bellyPat2: false,
          rallyWave1: false,
          rallyWave2: false,
          minionsOut: false,
          minionsIn: false,
          chargeSweep: false
        },
        fxTimer: 0
      };

      const sockets = new SocketTracker();
      let curSkinIdx = 0;
      let curSkin = SKINS[0];

      function emitCoinSparkles(vfx, wx, wy, wz, count, spread, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * TAU;
          const sp = (6 + Math.random() * spread) * sMul;
          vfx.spawnParticle(
            wx + (Math.random() - 0.5) * 3 * sMul,
            wy + (Math.random() - 0.5) * 3 * sMul,
            wz,
            Math.cos(a) * sp, Math.sin(a) * sp, (10 + Math.random() * 14) * sMul,
            0.38 + Math.random() * 0.26, 1.35 + Math.random() * 0.65,
            i % 3 === 0 ? '#fff6c4' : fx.coin, false, 42
          );
        }
      }

      function emitShoutRing(vfx, wx, wy, wz, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        vfx.addRipple(wx, wy, 6 * sMul, 34 * sMul, 0.55, 2.6);
        const n = 16;
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU;
          const sp = 26 * sMul;
          vfx.spawnParticle(
            wx + Math.cos(a) * 5 * sMul,
            wy + Math.sin(a) * 5 * sMul,
            wz,
            Math.cos(a) * sp, Math.sin(a) * sp, (3 + Math.random() * 5) * sMul,
            0.42, 1.75, i % 2 === 0 ? fx.shout : fx.coin, true, 6
          );
        }
      }

      function resetActionFlags(action) {
        state.actStartX = state.x;
        state.actStartY = state.y;
        state.actStartYaw = state.yaw;
        state.fxTimer = 0;
        for (const k in state.flags) state.flags[k] = false;
        for (let i = 0; i < goldChunks.length; i++) {
          goldChunks[i].active = false;
          goldChunks[i].bounced1 = false;
          goldChunks[i].bounced2 = false;
        }
        for (let i = 0; i < minions.length; i++) minions[i].active = false;

        // 蛮冲自动安全选向：若当前面朝位置前冲 18 格会逼近圆台外缘，则顺势微转向场内
        if (action === 'skill_greed_charge') {
          const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
          const endX = state.x + fwdX * 18, endY = state.y + fwdY * 18;
          if (Math.hypot(endX, endY) > 58) {
            state.chargeDirYaw = Math.atan2(state.x, -state.y);
          } else {
            state.chargeDirYaw = state.yaw;
          }
        }
      }

      function clampFeetSafe(sMul) {
        const maxOff = 4.4 * sMul;
        for (let i = 0; i < gait.legs.length; i++) {
          const leg = gait.legs[i];
          const [ix, iy] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
          const dx = leg.footX - ix, dy = leg.footY - iy;
          const d = Math.hypot(dx, dy);
          if (d > maxOff && d > 0.001) {
            leg.footX = ix + (dx / d) * maxOff;
            leg.footY = iy + (dy / d) * maxOff;
          }
        }
      }

      const instance = {
        def: BossGoblinKingDef,
        cachePrefix: `boss_goblin_king_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts: [],
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          if (typeof idx === 'number' && Number.isFinite(idx)) {
            curSkinIdx = ((Math.floor(idx) % SKINS.length) + SKINS.length) % SKINS.length;
          } else {
            curSkinIdx = (curSkinIdx + 1) % SKINS.length;
          }
          curSkin = SKINS[curSkinIdx];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (let i = 0; i < instance.partListAssets.length; i++) {
            recolorAsset(instance.partListAssets[i], tbl, SPEC.glowIdSet);
          }
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 0;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.lastAction = 'patrol';
          state.lastActionTime = 0;
          resetActionFlags('patrol');
          gait.reset(hx, hy, hyaw, instance.scaleMul);
        },

        update(dt, time, params, habitat, vfx, eco) {
          const safeDt = clamp(dt, 0.001, 0.05);
          instance.scaleMul = clamp(params.scaleMul ?? params.scale ?? 1.0, 0.5, 2.0);
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? params.spring ?? 1.0, 0.4, 2.0);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.0);
          const ecoSafe = eco || {};
          const action = ecoSafe.action || (ecoSafe.patrol === false ? 'idle' : 'patrol');
          const actT = ecoSafe.actionTime ?? 0;

          if (action !== state.lastAction || actT < state.lastActionTime - 0.05) {
            resetActionFlags(action);
          }
          state.lastAction = action;
          state.lastActionTime = actT;

          const P = state.pose;
          // 归零本帧动态覆写
          P.bodyLiftOff = 0;
          P.bodyFwdOff = 0;
          P.bodyYawOff = 0;
          P.headYawOff = 0;
          P.headLiftOff = 0;
          P.capeBackOff = 0;
          P.capeLiftOff = 0;
          P.capeYawOff = 0;
          P.sackLiftOff = 0;
          P.crownMode = 'normal';
          P.crownLiftOff = 0;
          P.crownSideOff = 0;
          P.crownYawOff = 0;
          P.earLOff = 0;
          P.earROff = 0;
          P.earLiftOff = 0;
          P.maceMode = 'hand';
          P.maceYawOff = 0.14;
          P.maceLiftOff = 0;
          P.showBanner = false;
          P.bannerYawOff = 0;
          P.bannerLiftOff = 0;
          P.showGold = false;
          P.showMinions = false;

          let wantGaitStep = true;
          let gaitFreqMul = 1.0;

          // -----------------------------------------------------------------
          // 分动作连续状态机
          // -----------------------------------------------------------------
          if (action === 'patrol') {
            // 1. 霸道巡营：沉稳重步巡走 + 滞后大宝袋偶尔颠落金屑 + 扛锤摆臂
            Propulsion.multiLegWalk(state, safeDt, time, { ...params, speed: (params.speed ?? 1.0) * 0.92 }, {
              ...ecoSafe, patrol: true, walkStyle: 'heavy', maxRadius: 42, baseLift: 0
            });
            state.z = 0;
            const spdNow = Math.hypot(state.vx, state.vy);
            const moveFactor = clamp(spdNow / 9.0, 0, 1);
            state.stepPhase += safeDt * (2.6 + moveFactor * 4.4) * gFreq;

            const sw = Math.sin(state.stepPhase);
            const swLag = Math.sin(state.stepPhase - 0.78);
            P.bodyYawOff = sw * 0.10 * moveFactor;
            P.capeBackOff = -0.8 * moveFactor - Math.abs(sw) * 0.5;
            P.capeYawOff = -clamp(state.turnRate || 0, -1.8, 1.8) * 0.14 - swLag * 0.08;
            // 左臂大步摆动，小臂滞后 0.78 rad 随动
            P.lUpperYaw = 0.28 + sw * 0.42 * moveFactor;
            P.lUpperLift = Math.max(0, sw) * 1.1 * moveFactor;
            P.lForeYaw = P.lUpperYaw - 0.28 + swLag * 0.24 * moveFactor;
            P.lForeLift = -1.2 + Math.max(0, swLag) * 0.8 * moveFactor;
            // 右臂扛重锤霸气轻晃
            P.rUpperYaw = -0.26 - sw * 0.28 * moveFactor;
            P.rUpperLift = 0.3 + Math.max(0, -sw) * 0.9 * moveFactor;
            P.rForeYaw = P.rUpperYaw + 0.22 - swLag * 0.18 * moveFactor;
            P.rForeLift = -0.5 + Math.sin(time * 2.6) * 0.45;
            P.maceYawOff = 0.12 + maceSpring.x * 0.35;

            headYawSpring.update(safeDt, clamp(-(state.turnRate || 0) * 0.22 + Math.sin(time * 1.3) * 0.16, -0.45, 0.45), 115 * sp, 8.0);
            earLSpring.update(safeDt, -0.18 * moveFactor + Math.sin(state.stepPhase) * 0.10, 185 * sp, 6.4);
            earRSpring.update(safeDt,  0.18 * moveFactor - Math.sin(state.stepPhase) * 0.10, 185 * sp, 6.4);
            maceSpring.update(safeDt, Math.sin(state.stepPhase - 0.5) * 0.18, 95 * sp, 5.8);

          } else if (action === 'idle') {
            // 2. 叉腰狞笑：平稳制动停步 + 左手叉腰挺肚 + 周期狂笑抖耳掂锤
            const kStop = expSmooth(safeDt, 7.5);
            state.vx = lerp(state.vx, 0, kStop);
            state.vy = lerp(state.vy, 0, kStop);
            state.x += state.vx * safeDt;
            state.y += state.vy * safeDt;
            state.z = 0;

            const laughCy = time % 3.4;
            const laughing = laughCy > 1.3 && laughCy < 2.6;
            const laughPulse = laughing ? Math.sin(((laughCy - 1.3) / 1.3) * Math.PI * 5.0) : 0;
            const laughEnv = laughing ? Math.sin(((laughCy - 1.3) / 1.3) * Math.PI) : 0;

            P.bodyLiftOff = Math.sin(time * 2.8) * 0.45 + Math.abs(laughPulse) * 0.95 * laughEnv;
            P.headLiftOff = laughEnv * 0.8 + Math.abs(laughPulse) * 0.7 * laughEnv;
            P.sackLiftOff = -laughPulse * 0.8 * laughEnv;
            P.crownLiftOff = Math.abs(laughPulse) * 0.9 * laughEnv;
            P.crownYawOff = laughPulse * 0.12 * laughEnv;

            // 左手牢牢叉在腰际
            P.lUpperYaw = 0.78 + laughEnv * 0.08;
            P.lUpperLift = -0.8;
            P.lForeYaw = -0.72;
            P.lForeLift = -2.8;
            // 右手提锤轻掂炫耀
            P.rUpperYaw = -0.34 - Math.sin(time * 3.1) * 0.10;
            P.rUpperLift = 0.4 + Math.sin(time * 3.1) * 0.7 + laughEnv * 0.6;
            P.rForeYaw = 0.08 + Math.sin(time * 3.1 - 0.7) * 0.14;
            P.rForeLift = -0.4 + Math.sin(time * 3.1 - 0.6) * 0.9;
            P.maceYawOff = 0.24 + Math.sin(time * 3.1 - 0.8) * 0.22;

            headYawSpring.update(safeDt, Math.sin(time * 1.45) * 0.28 + laughPulse * 0.12 * laughEnv, 125 * sp, 7.6);
            earLSpring.update(safeDt, Math.sin(time * 5.0) * 0.12 - laughPulse * 0.36 * laughEnv, 210 * sp, 5.8);
            earRSpring.update(safeDt, -Math.sin(time * 4.7) * 0.12 + laughPulse * 0.36 * laughEnv, 210 * sp, 5.8);
            maceSpring.update(safeDt, 0, 100 * sp, 6.2);

          } else if (action === 'stagger') {
            // 3. 破盾歪冠（1.5s）：踉跄下沉 + 金冠歪弹扣歪 + 宝袋颠币 + 双耳耷拉 + 伸手扶冠
            wantGaitStep = false;
            const fwdX = -Math.sin(state.actStartYaw), fwdY = Math.cos(state.actStartYaw);
            state.vx = 0; state.vy = 0; state.z = 0;
            state.yaw = state.actStartYaw;

            if (!state.flags.staggerBurst) {
              state.flags.staggerBurst = true;
              bodyBounce.impulse(-12 * sp);
              sackBounce.impulse(22 * sp);
              crownBounce.impulse(24 * sp);
              const [skX, skY] = localToWorldXY(state.actStartX, state.actStartY, state.actStartYaw, 0, -10 * sMul);
              emitCoinSparkles(vfx, skX, skY, 26 * sMul, 10, 16, sMul);
              EnvFeedback.emitFootstep(vfx, habitat, state.actStartX, state.actStartY, 1.4 * sMul);
            }

            if (actT < 0.40) {
              const u = smoothstep(0, 1, actT / 0.40);
              const backD = -3.0 * u;
              state.x = state.actStartX + fwdX * backD * sMul;
              state.y = state.actStartY + fwdY * backD * sMul;
              P.bodyLiftOff = -2.5 * u;
              P.bodyYawOff = Math.sin(u * Math.PI) * 0.24;
              // 王冠猛然弹飞 4.5 格并歪斜
              P.crownMode = 'askew';
              P.crownLiftOff = Math.sin(u * Math.PI * 0.85) * 4.8;
              P.crownSideOff = 2.0 * u;
              P.crownYawOff = 0.55 * u;
              P.sackLiftOff = Math.sin(u * Math.PI) * 3.0;
              P.earLiftOff = -1.6 * u;
              P.lUpperYaw = 0.95 * u; P.lForeYaw = 0.65 * u; P.lForeLift = -1.0;
              P.rUpperYaw = -0.95 * u; P.rForeYaw = -0.55 * u; P.rForeLift = -1.8;
              P.maceYawOff = -0.45 * u;
            } else if (actT < 1.05) {
              const u = (actT - 0.40) / 0.65;
              const sway = Math.sin(u * Math.PI * 3.0) * (1 - u * 0.4);
              state.x = state.actStartX - fwdX * 3.0 * sMul;
              state.y = state.actStartY - fwdY * 3.0 * sMul;
              P.bodyLiftOff = -2.5 + Math.abs(sway) * 0.35;
              P.bodyYawOff = sway * 0.16;
              // 金冠弹回扣歪在脑门上（带一次轻弹）
              P.crownMode = 'askew';
              P.crownLiftOff = Math.max(0, Math.sin(u * Math.PI * 2.2) * Math.exp(-u * 3.0) * 1.8);
              P.crownSideOff = 1.9;
              P.crownYawOff = 0.52 + sway * 0.15;
              P.earLiftOff = -1.7;
              P.lUpperYaw = 0.72 + sway * 0.2; P.lForeYaw = 0.35; P.lForeLift = -2.0;
              P.rUpperYaw = -0.68 - sway * 0.2; P.rForeYaw = -0.25; P.rForeLift = -2.2;
              P.maceYawOff = -0.32;
            } else {
              // 气急败坏伸左手扶正王冠并跨回原位
              const u = smoothstep(0, 1, (actT - 1.05) / 0.45);
              const reach = Math.sin(u * Math.PI);
              state.x = lerp(state.actStartX - fwdX * 3.0 * sMul, state.actStartX, u);
              state.y = lerp(state.actStartY - fwdY * 3.0 * sMul, state.actStartY, u);
              P.bodyLiftOff = lerp(-2.5, 0, u);
              P.crownMode = u < 0.55 ? 'askew' : 'normal';
              P.crownSideOff = lerp(1.9, 0, smoothstep(0.35, 0.85, u));
              P.crownYawOff = lerp(0.52, 0, smoothstep(0.35, 0.85, u));
              P.crownLiftOff = reach * 0.8;
              P.earLiftOff = lerp(-1.7, 0, u);
              // 左手高抬到额角扶正金冠
              P.lUpperYaw = lerp(0.72, 0.25, u) - reach * 0.45;
              P.lUpperLift = reach * 5.2;
              P.lForeYaw = lerp(0.35, -0.2, u) - reach * 0.65;
              P.lForeLift = lerp(-2.0, -1.2, u) + reach * 7.8;
              P.rUpperYaw = lerp(-0.68, -0.26, u);
              P.rForeYaw = lerp(-0.25, 0.22, u);
              P.rForeLift = lerp(-2.2, -0.6, u);
              P.maceYawOff = lerp(-0.32, 0.14, u);
            }

            // 双耳耷拉并高频发抖
            const shiver = Math.sin(actT * 42) * 0.22 * (1 - smoothstep(1.0, 1.5, actT));
            headYawSpring.update(safeDt, Math.sin(actT * 10) * 0.22 * (1 - actT / 1.5), 140 * sp, 7.0);
            earLSpring.update(safeDt, -0.58 + shiver, 200 * sp, 6.0);
            earRSpring.update(safeDt,  0.58 - shiver, 200 * sp, 6.0);
            // 同步双脚稳跟踉跄
            for (let i = 0; i < gait.legs.length; i++) {
              const l = gait.legs[i];
              const [rx, ry] = localToWorldXY(state.x, state.y, state.yaw, l.restX * sMul, l.restY * sMul);
              l.footX = lerp(l.footX, rx, expSmooth(safeDt, 12));
              l.footY = lerp(l.footY, ry, expSmooth(safeDt, 12));
              l.footZ = 0;
            }

          } else if (action === 'skill_mace_smash') {
            // 4. 技能 1 · 霸王重锤（2.4s）：高举蓄力脉冲 -> 前跨狠砸裂地 -> 拔锤回位
            wantGaitStep = false;
            const fwdX = -Math.sin(state.actStartYaw), fwdY = Math.cos(state.actStartYaw);
            state.yaw = state.actStartYaw;
            state.z = 0;

            if (actT < 0.85) {
              // 0.0~0.85s：后仰蓄劲 + 高举重锤过顶 + emissive 脉冲
              const u = smoothstep(0, 1, actT / 0.85);
              state.x = state.actStartX - fwdX * (1.8 * u) * sMul;
              state.y = state.actStartY - fwdY * (1.8 * u) * sMul;
              P.bodyLiftOff = -0.8 * u + Math.sin(actT * 20) * 0.25 * u;
              P.bodyYawOff = -0.28 * u;
              P.crownMode = (Math.floor(actT * 12) & 1) === 0 ? 'charged' : 'normal';
              P.capeBackOff = -1.2 * u;
              // 右臂抡起竖直重锤高举过顶
              P.rUpperYaw = lerp(-0.26, -0.78, u);
              P.rUpperLift = 4.6 * u;
              P.rForeYaw = lerp(0.22, -0.45, u);
              P.rForeLift = lerp(-0.6, 5.8, u);
              P.maceMode = u > 0.22 ? 'raised' : 'charged';
              P.maceLiftOff = 2.6 * u;
              P.maceYawOff = -0.15 * u;
              // 左臂张开保持平衡
              P.lUpperYaw = lerp(0.28, 0.85, u);
              P.lUpperLift = 1.6 * u;
              P.lForeYaw = lerp(-0.20, 0.55, u);
              P.lForeLift = -0.5 + 1.0 * u;

              state.fxTimer += safeDt;
              if (vfx && state.fxTimer >= 0.08) {
                state.fxTimer = 0;
                const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, 9.5 * sMul, 2.0 * sMul);
                const fx = curSkin.fx || SKINS[0].fx;
                vfx.spawnParticle(
                  mx + (Math.random() - 0.5) * 6 * sMul,
                  my + (Math.random() - 0.5) * 6 * sMul,
                  34 * sMul + Math.random() * 8 * sMul,
                  (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, 8 + Math.random() * 10,
                  0.32, 1.45, fx.spark, true, -8
                );
              }
              earLSpring.update(safeDt, -0.64, 210 * sp, 6.5);
              earRSpring.update(safeDt,  0.64, 210 * sp, 6.5);
              headYawSpring.update(safeDt, 0.14 * u, 130 * sp, 8.0);

            } else if (actT < 1.45) {
              // 0.85~1.45s：大步前跨 +5 格，重锤弧线狠砸地面 + addDecal 裂纹与碎石粒子
              const slamU = clamp((actT - 0.85) / 0.18, 0, 1);
              const easeSlam = slamU * slamU;
              const holdT = Math.max(0, actT - 1.03);
              const tremble = holdT < 0.25 ? Math.sin(holdT * 75) * (1 - holdT / 0.25) * 0.45 : 0;

              state.x = state.actStartX + fwdX * lerp(-1.8, 5.2, easeSlam) * sMul;
              state.y = state.actStartY + fwdY * lerp(-1.8, 5.2, easeSlam) * sMul;
              P.bodyLiftOff = lerp(-0.8, -2.6, easeSlam) + tremble;
              P.bodyYawOff = lerp(-0.28, 0.34, easeSlam);
              P.capeBackOff = -2.2 * easeSlam;
              P.capeLiftOff = 1.6 * easeSlam;
              P.crownMode = slamU < 0.9 ? 'charged' : 'normal';
              P.crownLiftOff = Math.max(0, Math.sin(slamU * Math.PI) * 1.4);

              P.rUpperYaw = lerp(-0.78, 0.38, easeSlam);
              P.rUpperLift = lerp(4.6, -2.2, easeSlam);
              P.rForeYaw = lerp(-0.45, 0.28, easeSlam);
              P.rForeLift = lerp(5.8, -4.6, easeSlam);
              P.maceMode = slamU < 0.42 ? 'raised' : 'charged';
              P.maceLiftOff = lerp(2.6, -5.8, easeSlam);
              P.maceYawOff = lerp(-0.15, 0.04, easeSlam);

              P.lUpperYaw = lerp(0.85, 0.65, easeSlam);
              P.lUpperLift = lerp(1.6, -1.0, easeSlam);
              P.lForeYaw = lerp(0.55, 0.35, easeSlam);
              P.lForeLift = -1.8;

              if (slamU >= 1.0 && !state.flags.smashImpact) {
                state.flags.smashImpact = true;
                bodyBounce.impulse(-16 * sp);
                sackBounce.impulse(24 * sp);
                crownBounce.impulse(14 * sp);
                const [hitX, hitY] = localToWorldXY(state.x, state.y, state.yaw, 5.5 * sMul, 16.5 * sMul);
                if (vfx) {
                  vfx.addDecal({
                    kind: 'crack', x: hitX, y: hitY, yaw: state.yaw,
                    rx: 11.5 * sMul, ry: 9.5 * sMul, life: 6.5, alpha: 0.92,
                    color: '#2e221b', darkColor: '#120d0a'
                  });
                  vfx.addRipple(hitX, hitY, 3 * sMul, 25 * sMul, 0.56, 2.8);
                  const fx = curSkin.fx || SKINS[0].fx;
                  for (let i = 0; i < 20; i++) {
                    const a = (i / 20) * TAU + (Math.random() - 0.5) * 0.25;
                    const spd = (12 + Math.random() * 22) * sMul;
                    const isHot = i % 4 === 0;
                    vfx.spawnParticle(
                      hitX + Math.cos(a) * 3 * sMul, hitY + Math.sin(a) * 3 * sMul, 1.5 * sMul,
                      Math.cos(a) * spd, Math.sin(a) * spd, (12 + Math.random() * 18) * sMul,
                      0.45 + Math.random() * 0.28, isHot ? 1.8 : 2.1,
                      isHot ? fx.spark : fx.dust, isHot, 54
                    );
                  }
                }
              }
              earLSpring.update(safeDt, -0.42, 200 * sp, 6.2);
              earRSpring.update(safeDt,  0.42, 200 * sp, 6.2);
              headYawSpring.update(safeDt, -0.10, 140 * sp, 8.0);

            } else {
              // 1.45~2.40s：用力拔锤回肩 + 大步退回原位
              const u = smoothstep(0, 1, (actT - 1.45) / 0.95);
              const pullTug = actT < 1.82 ? Math.sin(((actT - 1.45) / 0.37) * Math.PI * 2) * 0.65 : 0;
              if (!state.flags.smashPullDust && actT >= 1.65) {
                state.flags.smashPullDust = true;
                const [hitX, hitY] = localToWorldXY(state.x, state.y, state.yaw, 5.5 * sMul, 16.0 * sMul);
                EnvFeedback.emitFootstep(vfx, habitat, hitX, hitY, 0.95 * sMul);
              }
              state.x = state.actStartX + fwdX * lerp(5.2, 0, smoothstep(0.25, 1.0, u)) * sMul;
              state.y = state.actStartY + fwdY * lerp(5.2, 0, smoothstep(0.25, 1.0, u)) * sMul;
              P.bodyLiftOff = lerp(-2.6, 0, u) + pullTug;
              P.bodyYawOff = lerp(0.34, 0, u);
              P.rUpperYaw = lerp(0.38, -0.26, u);
              P.rUpperLift = lerp(-2.2, 0.3, u) + Math.abs(pullTug);
              P.rForeYaw = lerp(0.28, 0.22, u);
              P.rForeLift = lerp(-4.6, -0.5, u);
              P.maceMode = 'hand';
              P.maceLiftOff = lerp(-5.8, 0, smoothstep(0.15, 0.85, u));
              P.maceYawOff = lerp(0.04, 0.14, u);
              P.lUpperYaw = lerp(0.65, 0.28, u);
              P.lForeYaw = lerp(0.35, -0.20, u);
              P.lForeLift = lerp(-1.8, -1.2, u);
              earLSpring.update(safeDt, 0, 175 * sp, 6.8);
              earRSpring.update(safeDt, 0, 175 * sp, 6.8);
              headYawSpring.update(safeDt, 0, 125 * sp, 8.2);
            }

            // 跨步腿位跟随
            const stepProgress = actT < 0.85 ? 0 : (actT < 1.45 ? 1 : (1 - smoothstep(1.65, 2.35, actT)));
            for (let i = 0; i < gait.legs.length; i++) {
              const l = gait.legs[i];
              const extraY = (i === 0 ? 2.4 : -1.8) * stepProgress;
              const [rx, ry] = localToWorldXY(state.x, state.y, state.yaw, l.restX * sMul, (l.restY + extraY) * sMul);
              l.footX = lerp(l.footX, rx, expSmooth(safeDt, 14));
              l.footY = lerp(l.footY, ry, expSmooth(safeDt, 14));
              l.footZ = (actT > 0.85 && actT < 1.03 && i === 0) ? Math.sin(((actT - 0.85) / 0.18) * Math.PI) * 3.0 * sMul : 0;
            }

          } else if (action === 'skill_gold_rain') {
            // 5. 技能 2 · 撒币乱砸（2.8s）：叉腰狂笑抓宝 -> 抛射 6 枚 goldChunk 弹跳溅屑 -> 拍肚归位
            wantGaitStep = false;
            state.x = state.actStartX; state.y = state.actStartY; state.z = 0;
            state.yaw = state.actStartYaw;
            state.vx = 0; state.vy = 0;
            P.showGold = true;

            // 初始化 6 枚金块抛射落点（正前方扇形分布，安全约束在圆台内）
            if (!state.flags.goldLaunched) {
              state.flags.goldLaunched = true;
              const [skX, skY] = localToWorldXY(state.x, state.y, state.yaw, 2.0 * sMul, -6.5 * sMul);
              const angles = [-0.62, -0.37, -0.13, 0.13, 0.37, 0.62];
              const dists  = [20.5, 26.5, 17.5, 25.0, 19.0, 27.5];
              for (let i = 0; i < goldChunks.length; i++) {
                const gc = goldChunks[i];
                gc.active = false;
                gc.bounced1 = false;
                gc.bounced2 = false;
                gc.sx = skX;
                gc.sy = skY;
                gc.sz = 23.0 * sMul;
                const a = state.yaw + angles[i];
                let tx = state.x - Math.sin(a) * dists[i] * sMul;
                let ty = state.y + Math.cos(a) * dists[i] * sMul;
                const rd = Math.hypot(tx, ty);
                if (rd > 62) { tx *= 62 / rd; ty *= 62 / rd; }
                gc.tx = tx;
                gc.ty = ty;
                gc.x = skX;
                gc.y = skY;
                gc.z = gc.sz;
                gc.ro = i * 0.85;
              }
            }

            // 重锤在抓宝撒币期间暂挂腰侧，收招前归手
            const maceSlung = actT > 0.14 && actT < 2.52;
            P.maceMode = maceSlung ? 'slung' : 'hand';

            if (actT < 0.60) {
              // 0.0~0.60s：左手叉腰挺肚大笑抖耳 + 右手反手伸向背后大宝袋抓金块
              const u = smoothstep(0, 1, actT / 0.60);
              const laugh = Math.sin(actT * 26);
              P.bodyLiftOff = 0.6 * u + Math.abs(laugh) * 0.65;
              P.headLiftOff = 0.8 * u + Math.abs(laugh) * 0.55;
              P.crownLiftOff = Math.abs(laugh) * 0.85;
              P.crownYawOff = laugh * 0.16;
              P.sackLiftOff = 1.4 * u;
              P.lUpperYaw = 0.82; P.lUpperLift = -0.6; P.lForeYaw = -0.74; P.lForeLift = -2.8;
              // 右手反伸向背后宝袋口
              P.rUpperYaw = lerp(-0.26, -1.65, u);
              P.rUpperLift = 2.6 * u;
              P.rForeYaw = lerp(0.22, -2.25, u);
              P.rForeLift = 2.2 * u;
              earLSpring.update(safeDt, -0.35 + Math.sin(actT * 38) * 0.34, 240 * sp, 5.2);
              earRSpring.update(safeDt,  0.35 - Math.sin(actT * 38) * 0.34, 240 * sp, 5.2);
              headYawSpring.update(safeDt, Math.sin(actT * 14) * 0.24, 150 * sp, 7.0);
            } else if (actT < 2.10) {
              // 0.60~2.10s：右手连续挥甩抛洒 6 枚金块，左手叉腰狂笑
              const throwWave = Math.sin((actT - 0.60) * 14.5);
              const activeThrow = actT < 1.55 ? 1 : clamp(1 - (actT - 1.55) / 0.45, 0, 1);
              P.bodyLiftOff = Math.abs(throwWave) * 0.75 * activeThrow;
              P.bodyYawOff = throwWave * 0.22 * activeThrow;
              P.crownLiftOff = Math.abs(throwWave) * 0.7 * activeThrow;
              P.lUpperYaw = 0.82; P.lUpperLift = -0.6; P.lForeYaw = -0.74; P.lForeLift = -2.8;
              P.rUpperYaw = -0.45 + throwWave * 0.95 * activeThrow;
              P.rUpperLift = 2.2 + Math.max(0, throwWave) * 2.4 * activeThrow;
              P.rForeYaw = 0.25 + throwWave * 0.75 * activeThrow;
              P.rForeLift = 1.6 + Math.max(0, throwWave) * 2.2 * activeThrow;
              earLSpring.update(safeDt, Math.sin(actT * 32) * 0.28, 220 * sp, 5.6);
              earRSpring.update(safeDt, -Math.sin(actT * 32) * 0.28, 220 * sp, 5.6);
              headYawSpring.update(safeDt, throwWave * 0.20, 140 * sp, 7.5);
            } else {
              // 2.10~2.80s：拍两下大肚腩得意归位，重锤回手
              const u = (actT - 2.10) / 0.70;
              const pat = actT < 2.55 ? Math.sin(u * Math.PI * 4.0) : 0;
              if (!state.flags.bellyPat1 && actT >= 2.24) {
                state.flags.bellyPat1 = true;
                bodyBounce.impulse(9 * sp);
                emitCoinSparkles(vfx, state.x, state.y, 16 * sMul, 4, 8, sMul);
              }
              if (!state.flags.bellyPat2 && actT >= 2.46) {
                state.flags.bellyPat2 = true;
                bodyBounce.impulse(9 * sp);
                emitCoinSparkles(vfx, state.x, state.y, 16 * sMul, 4, 8, sMul);
              }
              P.bodyLiftOff = Math.max(0, pat) * 0.65;
              P.lUpperYaw = lerp(0.82, 0.28, smoothstep(0.55, 1.0, u));
              P.lForeYaw = lerp(-0.74, -0.20, smoothstep(0.55, 1.0, u));
              P.lForeLift = lerp(-2.8, -1.2, smoothstep(0.55, 1.0, u));
              // 右手伸到肚前拍肚皮
              const patBlend = 1 - smoothstep(0.65, 1.0, u);
              P.rUpperYaw = lerp(-0.26, 0.35 + pat * 0.16, patBlend);
              P.rUpperLift = lerp(0.3, -1.4, patBlend);
              P.rForeYaw = lerp(0.22, 0.92 + pat * 0.22, patBlend);
              P.rForeLift = lerp(-0.5, -2.4, patBlend);
              earLSpring.update(safeDt, Math.sin(actT * 18) * 0.14, 190 * sp, 6.4);
              earRSpring.update(safeDt, -Math.sin(actT * 18) * 0.14, 190 * sp, 6.4);
              headYawSpring.update(safeDt, Math.sin(u * Math.PI * 2) * 0.14, 130 * sp, 8.0);
            }

            // 更新 6 枚复用立体 goldChunk 抛物线 + 二次弹跳 + 落地溅金屑
            const flightDur = 0.62;
            const b1Dur = 0.28;
            const b2Dur = 0.18;
            for (let i = 0; i < goldChunks.length; i++) {
              const gc = goldChunks[i];
              const age = actT - gc.launchT;
              if (age < 0 || age > flightDur + b1Dur + b2Dur + 0.35) {
                gc.active = false;
                continue;
              }
              gc.active = true;
              if (age < flightDur) {
                const f = age / flightDur;
                gc.x = lerp(gc.sx, gc.tx, f);
                gc.y = lerp(gc.sy, gc.ty, f);
                gc.z = lerp(gc.sz, 0, f) + Math.sin(f * Math.PI) * gc.peakZ * sMul;
                gc.ro = wrapAngle(gc.ro + gc.spinRate * safeDt);
              } else if (age < flightDur + b1Dur) {
                if (!gc.bounced1) {
                  gc.bounced1 = true;
                  emitCoinSparkles(vfx, gc.tx, gc.ty, 1.8 * sMul, 5, 12, sMul);
                  if (vfx) vfx.addRipple(gc.tx, gc.ty, 1.5 * sMul, 7.5 * sMul, 0.32, 1.2);
                }
                const f = (age - flightDur) / b1Dur;
                const overshootX = (gc.tx - gc.sx) * 0.10;
                const overshootY = (gc.ty - gc.sy) * 0.10;
                gc.x = gc.tx + overshootX * f;
                gc.y = gc.ty + overshootY * f;
                gc.z = Math.sin(f * Math.PI) * gc.peakZ * 0.38 * sMul;
                gc.ro = wrapAngle(gc.ro + gc.spinRate * 0.65 * safeDt);
              } else if (age < flightDur + b1Dur + b2Dur) {
                const b1x = gc.tx + (gc.tx - gc.sx) * 0.10;
                const b1y = gc.ty + (gc.ty - gc.sy) * 0.10;
                if (!gc.bounced2) {
                  gc.bounced2 = true;
                  emitCoinSparkles(vfx, b1x, b1y, 1.2 * sMul, 3, 8, sMul);
                }
                const f = (age - flightDur - b1Dur) / b2Dur;
                gc.x = b1x + (gc.tx - gc.sx) * 0.04 * f;
                gc.y = b1y + (gc.ty - gc.sy) * 0.04 * f;
                gc.z = Math.sin(f * Math.PI) * gc.peakZ * 0.16 * sMul;
                gc.ro = wrapAngle(gc.ro + gc.spinRate * 0.35 * safeDt);
              } else {
                gc.x = gc.tx + (gc.tx - gc.sx) * 0.14;
                gc.y = gc.ty + (gc.ty - gc.sy) * 0.14;
                gc.z = 0;
              }
            }

            // 稳稳双脚踏地
            for (let i = 0; i < gait.legs.length; i++) {
              const l = gait.legs[i];
              const [rx, ry] = localToWorldXY(state.x, state.y, state.yaw, l.restX * sMul, l.restY * sMul);
              l.footX = lerp(l.footX, rx, expSmooth(safeDt, 12));
              l.footY = lerp(l.footY, ry, expSmooth(safeDt, 12));
              l.footZ = 0;
            }

          } else if (action === 'skill_rally_horde') {
            // 6. 技能 3 · 摇旗召众（3.0s）：左手高举战旗狂摇出声波环 -> 召出 2 只迷你喽啰冲锋 -> 收旗退场
            wantGaitStep = false;
            state.x = state.actStartX; state.y = state.actStartY; state.z = 0;
            state.yaw = state.actStartYaw;
            state.vx = 0; state.vy = 0;

            const bannerVis = actT >= 0.06 && actT <= 2.75;
            P.showBanner = bannerVis;

            if (actT < 0.90) {
              // 0.0~0.90s：左手擎出赤红战旗大幅狂摇 + 扩散 2 道红色声波环
              const u = smoothstep(0, 1, actT / 0.25);
              const wave = Math.sin(actT * 18.0);
              P.bodyLiftOff = 0.8 * u + Math.abs(wave) * 0.55;
              P.bodyYawOff = wave * 0.14;
              P.headLiftOff = 1.1 * u;
              P.crownMode = (Math.floor(actT * 10) & 1) === 0 ? 'charged' : 'normal';
              P.lUpperYaw = lerp(0.28, 0.52, u) + wave * 0.34;
              P.lUpperLift = 4.5 * u;
              P.lForeYaw = lerp(-0.20, 0.28, u) + wave * 0.42;
              P.lForeLift = 5.2 * u;
              P.bannerYawOff = wave * 0.45;
              P.bannerLiftOff = 1.8 * u;
              // 右手高抬重锤助威
              P.rUpperYaw = -0.38 - wave * 0.16;
              P.rUpperLift = 1.4 * u;
              P.rForeYaw = 0.18;
              P.rForeLift = 0.8 * u;
              P.maceYawOff = 0.18 - wave * 0.14;

              if (!state.flags.rallyWave1 && actT >= 0.28) {
                state.flags.rallyWave1 = true;
                emitShoutRing(vfx, state.x, state.y, 28 * sMul, sMul);
                crownBounce.impulse(12 * sp);
              }
              if (!state.flags.rallyWave2 && actT >= 0.64) {
                state.flags.rallyWave2 = true;
                emitShoutRing(vfx, state.x, state.y, 28 * sMul, sMul);
                crownBounce.impulse(12 * sp);
              }
              earLSpring.update(safeDt, -0.45 - wave * 0.18, 210 * sp, 6.0);
              earRSpring.update(safeDt,  0.45 + wave * 0.18, 210 * sp, 6.0);
              headYawSpring.update(safeDt, wave * 0.18, 140 * sp, 7.5);

            } else if (actT < 2.40) {
              // 0.90~2.40s：双喽啰窜出绕场冲锋挥棒，Boss 摇旗鼓劲
              const wave = Math.sin(actT * 12.0);
              P.bodyLiftOff = Math.abs(wave) * 0.6;
              P.bodyYawOff = wave * 0.10;
              P.lUpperYaw = 0.48 + wave * 0.24;
              P.lUpperLift = 4.2;
              P.lForeYaw = 0.25 + wave * 0.30;
              P.lForeLift = 4.8;
              P.bannerYawOff = wave * 0.32;
              P.bannerLiftOff = 1.6;
              // 右手指向前方发号施令
              P.rUpperYaw = -0.15 + Math.sin(actT * 9.0) * 0.18;
              P.rUpperLift = 1.8 + Math.max(0, Math.sin(actT * 9.0)) * 1.4;
              P.rForeYaw = 0.10;
              P.rForeLift = 1.4;
              P.maceYawOff = 0.12 + Math.sin(actT * 9.0) * 0.22;
              earLSpring.update(safeDt, -0.20 + Math.sin(actT * 16) * 0.18, 190 * sp, 6.2);
              earRSpring.update(safeDt,  0.20 - Math.sin(actT * 16) * 0.18, 190 * sp, 6.2);
              headYawSpring.update(safeDt, Math.sin(actT * 4.5) * 0.25, 125 * sp, 8.0);
            } else {
              // 2.40~3.00s：收旗退场恢复持锤警戒
              const u = smoothstep(0, 1, (actT - 2.40) / 0.60);
              P.lUpperYaw = lerp(0.48, 0.28, u);
              P.lUpperLift = lerp(4.2, 0, u);
              P.lForeYaw = lerp(0.25, -0.20, u);
              P.lForeLift = lerp(4.8, -1.2, u);
              P.bannerLiftOff = lerp(1.6, -6.0, u);
              P.rUpperYaw = lerp(-0.15, -0.26, u);
              P.rUpperLift = lerp(1.8, 0.3, u);
              P.rForeYaw = lerp(0.10, 0.22, u);
              P.rForeLift = lerp(1.4, -0.5, u);
              earLSpring.update(safeDt, 0, 180 * sp, 6.8);
              earRSpring.update(safeDt, 0, 180 * sp, 6.8);
              headYawSpring.update(safeDt, 0, 125 * sp, 8.2);
            }

            // 驱动 2 只复用 minionGoblin 冲锋轨迹
            if (actT >= 0.88 && actT <= 2.72) {
              P.showMinions = true;
              const mu = clamp((actT - 0.88) / 1.52, 0, 1); // 0.88~2.40 主冲锋段
              const retreatU = actT > 2.40 ? smoothstep(0, 1, (actT - 2.40) / 0.32) : 0;

              if (!state.flags.minionsOut) {
                state.flags.minionsOut = true;
                for (let i = 0; i < 2; i++) {
                  const sd = i === 0 ? -1 : 1;
                  const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, sd * 17 * sMul, -4 * sMul);
                  EnvFeedback.emitFootstep(vfx, habitat, sx, sy, 1.25 * sMul);
                }
              }
              if (actT >= 2.66 && !state.flags.minionsIn) {
                state.flags.minionsIn = true;
                for (let i = 0; i < 2; i++) {
                  EnvFeedback.emitFootstep(vfx, habitat, minions[i].x, minions[i].y, 1.0 * sMul);
                }
              }

              state.fxTimer += safeDt;
              const emitDust = state.fxTimer >= 0.16;
              if (emitDust) state.fxTimer = 0;

              for (let i = 0; i < 2; i++) {
                const mn = minions[i];
                mn.active = true;
                const sd = mn.side;
                // 绕着 Boss 前方划出活力弧线并高跳挥棒
                const arcAng = lerp(sd * 1.45, -sd * 0.45, smoothstep(0, 1, mu));
                const rad = lerp(18.5, 22.0, Math.sin(mu * Math.PI)) * (1 + retreatU * 0.25) * sMul;
                const lx = Math.sin(arcAng) * rad;
                const ly = Math.cos(arcAng) * rad + 2.5 * sMul;
                let [mx, my] = localToWorldXY(state.x, state.y, state.yaw, lx, ly);
                const md = Math.hypot(mx, my);
                if (md > 62) { mx *= 62 / md; my *= 62 / md; }
                const dx = mx - mn.x, dy = my - mn.y;
                if (mu > 0.02 && Math.hypot(dx, dy) > 0.05) {
                  mn.yaw = wrapAngle(Math.atan2(-dx, dy) + Math.sin(actT * 18 + i * 2) * 0.28);
                } else {
                  mn.yaw = state.yaw;
                }
                mn.x = mx;
                mn.y = my;
                const hop = Math.abs(Math.sin(actT * 13.5 + i * 1.6)) * 4.6 * sMul;
                mn.z = retreatU > 0 ? lerp(hop, 7.5 * sMul, retreatU) : hop;
                if (emitDust && retreatU === 0) {
                  EnvFeedback.emitFootstep(vfx, habitat, mx, my, 0.55 * sMul);
                }
              }
            }

            for (let i = 0; i < gait.legs.length; i++) {
              const l = gait.legs[i];
              const [rx, ry] = localToWorldXY(state.x, state.y, state.yaw, l.restX * sMul, l.restY * sMul);
              l.footX = lerp(l.footX, rx, expSmooth(safeDt, 12));
              l.footY = lerp(l.footY, ry, expSmooth(safeDt, 12));
              l.footZ = 0;
            }

          } else if (action === 'skill_greed_charge') {
            // 7. 技能 4 · 贪财蛮冲（3.2s）：低身刨地蓄势 -> 猛冲 +18 格犁地掉币 -> 终点大回旋横扫 -> 挺肚走回
            const dirYaw = state.chargeDirYaw;
            const fwdX = -Math.sin(dirYaw), fwdY = Math.cos(dirYaw);
            state.z = 0;

            if (actT < 1.05) {
              // 0.0~1.05s：低身刨地蓄势 + 重锤横抱胸前 + 王冠锤头高频亮脉冲
              wantGaitStep = false;
              const u = smoothstep(0, 1, actT / 0.35);
              state.yaw = wrapAngle(state.yaw + wrapAngle(dirYaw - state.yaw) * expSmooth(safeDt, 10));
              state.x = state.actStartX;
              state.y = state.actStartY;
              state.vx = 0; state.vy = 0;

              const paw = Math.sin(actT * 26.0);
              P.bodyLiftOff = -2.3 * u + Math.abs(paw) * 0.35;
              P.bodyYawOff = paw * 0.08;
              P.capeBackOff = -1.2 * u;
              P.crownMode = (Math.floor(actT * 14) & 1) === 0 ? 'charged' : 'normal';
              P.maceMode = 'charged';
              // 双臂收拢胸前横抱重锤
              P.lUpperYaw = lerp(0.28, -0.35, u);
              P.lUpperLift = -1.2 * u;
              P.lForeYaw = lerp(-0.20, -1.05, u);
              P.lForeLift = -1.8 * u;
              P.rUpperYaw = lerp(-0.26, 0.38, u);
              P.rUpperLift = -1.0 * u;
              P.rForeYaw = lerp(0.22, 1.15, u);
              P.rForeLift = -1.8 * u;
              P.maceYawOff = lerp(0.14, 1.38, u);
              P.maceLiftOff = -1.4 * u;

              // 双脚原地急促交替刨地扬尘
              for (let i = 0; i < gait.legs.length; i++) {
                const l = gait.legs[i];
                const pawSign = i === 0 ? paw : -paw;
                const [rx, ry] = localToWorldXY(state.x, state.y, state.yaw, l.restX * sMul, (l.restY + pawSign * 1.6) * sMul);
                l.footX = rx;
                l.footY = ry;
                l.footZ = Math.max(0, pawSign) * 2.2 * sMul;
              }
              state.fxTimer += safeDt;
              if (state.fxTimer >= 0.14) {
                state.fxTimer = 0;
                const [dxP, dyP] = localToWorldXY(state.x, state.y, state.yaw, (paw > 0 ? -4.8 : 4.8) * sMul, -2.5 * sMul);
                EnvFeedback.emitFootstep(vfx, habitat, dxP, dyP, 1.15 * sMul);
              }
              earLSpring.update(safeDt, -0.68, 220 * sp, 6.2);
              earRSpring.update(safeDt,  0.68, 220 * sp, 6.2);
              headYawSpring.update(safeDt, 0, 140 * sp, 8.0);

            } else if (actT < 1.80) {
              // 1.05~1.80s：重坦猛冲 +18 格 + 沿途犁地 decal + 宝袋剧烈颠簸掉金币粒子
              wantGaitStep = true;
              gaitFreqMul = 2.15;
              const u = clamp((actT - 1.05) / 0.75, 0, 1);
              const dist = 18.0 * smoothstep(0, 1, u) * sMul;
              const nx = state.actStartX + fwdX * dist;
              const ny = state.actStartY + fwdY * dist;
              state.vx = (nx - state.x) / safeDt;
              state.vy = (ny - state.y) / safeDt;
              state.x = nx;
              state.y = ny;
              state.yaw = dirYaw;
              state.stepPhase += safeDt * 18.0 * gFreq;

              P.bodyLiftOff = -1.6 + Math.abs(Math.sin(state.stepPhase)) * 0.9;
              P.capeBackOff = -2.8;
              P.capeLiftOff = 2.2;
              P.sackLiftOff = Math.sin(state.stepPhase * 1.4) * 2.2;
              P.crownMode = 'charged';
              P.maceMode = 'charged';
              P.lUpperYaw = -0.35; P.lUpperLift = -1.0; P.lForeYaw = -1.05; P.lForeLift = -1.6;
              P.rUpperYaw =  0.38; P.rUpperLift = -0.8; P.rForeYaw =  1.15; P.rForeLift = -1.6;
              P.maceYawOff = 1.38;
              P.maceLiftOff = -1.2;

              state.fxTimer += safeDt;
              if (state.fxTimer >= 0.10) {
                state.fxTimer = 0;
                const [trX, trY] = localToWorldXY(state.x, state.y, state.yaw, 0, -6.5 * sMul);
                if (vfx) {
                  vfx.addDecal({
                    kind: 'mound', x: trX, y: trY, yaw: state.yaw,
                    rx: 6.2 * sMul, ry: 7.4 * sMul, life: 5.5, alpha: 0.85
                  });
                }
                const [skX, skY] = localToWorldXY(state.x, state.y, state.yaw, 0, -10.5 * sMul);
                emitCoinSparkles(vfx, skX, skY, 22 * sMul, 3, 10, sMul);
              }
              earLSpring.update(safeDt, -0.72, 220 * sp, 6.2);
              earRSpring.update(safeDt,  0.72, 220 * sp, 6.2);
              headYawSpring.update(safeDt, 0, 140 * sp, 8.0);

            } else if (actT < 2.15) {
              // 1.80~2.15s：终点大回旋横扫重锤（整圈 360° 爆发横扫！）
              wantGaitStep = false;
              const u = clamp((actT - 1.80) / 0.35, 0, 1);
              const spin = smoothstep(0, 1, u) * TAU;
              state.x = state.actStartX + fwdX * 18.0 * sMul;
              state.y = state.actStartY + fwdY * 18.0 * sMul;
              state.vx = 0; state.vy = 0;
              state.yaw = wrapAngle(dirYaw + spin);

              P.bodyLiftOff = -0.8 + Math.sin(u * Math.PI) * 1.4;
              P.capeBackOff = -2.4;
              P.capeLiftOff = 2.4;
              P.crownMode = 'charged';
              P.maceMode = 'charged';
              // 右臂完全外展抡起巨锤扫出一圈
              P.rUpperYaw = -0.85;
              P.rUpperLift = 0.8;
              P.rForeYaw = -0.65;
              P.rForeLift = 0.6;
              P.maceYawOff = -0.35;
              P.lUpperYaw = 0.95;
              P.lForeYaw = 0.65;

              if (!state.flags.chargeSweep && u >= 0.25) {
                state.flags.chargeSweep = true;
                sackBounce.impulse(20 * sp);
                if (vfx) {
                  vfx.addRipple(state.x, state.y, 6 * sMul, 26 * sMul, 0.48, 2.8);
                  const fx = curSkin.fx || SKINS[0].fx;
                  for (let i = 0; i < 18; i++) {
                    const a = (i / 18) * TAU;
                    vfx.spawnParticle(
                      state.x + Math.cos(a) * 15 * sMul,
                      state.y + Math.sin(a) * 15 * sMul,
                      12 * sMul,
                      Math.cos(a) * 16 * sMul, Math.sin(a) * 16 * sMul, (4 + Math.random() * 8) * sMul,
                      0.36, 1.9, i % 2 === 0 ? fx.spark : fx.coin, true, 16
                    );
                  }
                }
              }
              for (let i = 0; i < gait.legs.length; i++) {
                const l = gait.legs[i];
                const [rx, ry] = localToWorldXY(state.x, state.y, dirYaw, l.restX * sMul, l.restY * sMul);
                l.footX = rx; l.footY = ry; l.footZ = 0;
              }
              earLSpring.update(safeDt, -0.65, 220 * sp, 6.2);
              earRSpring.update(safeDt,  0.65, 220 * sp, 6.2);
              headYawSpring.update(safeDt, 0, 150 * sp, 8.0);

            } else {
              // 2.15~3.20s：得意挺肚慢步走回原位
              wantGaitStep = true;
              gaitFreqMul = 1.25;
              const u = clamp((actT - 2.15) / 1.05, 0, 1);
              const backU = smoothstep(0, 1, u);
              const nx = lerp(state.actStartX + fwdX * 18.0 * sMul, state.actStartX, backU);
              const ny = lerp(state.actStartY + fwdY * 18.0 * sMul, state.actStartY, backU);
              state.vx = (nx - state.x) / safeDt;
              state.vy = (ny - state.y) / safeDt;
              state.x = nx;
              state.y = ny;

              // 前 75% 朝向归途走回，最后 25% 霸气转身面向原方向
              const wantYaw = u < 0.78 ? wrapAngle(dirYaw + Math.PI) : state.actStartYaw;
              state.yaw = wrapAngle(state.yaw + wrapAngle(wantYaw - state.yaw) * expSmooth(safeDt, 9.5));
              state.stepPhase += safeDt * 7.5 * gFreq;
              const sw = Math.sin(state.stepPhase);

              P.bodyLiftOff = 0.6 + Math.abs(sw) * 0.55;
              P.bodyYawOff = sw * 0.12;
              P.lUpperYaw = 0.72; P.lUpperLift = -0.6; P.lForeYaw = -0.64; P.lForeLift = -2.4;
              P.rUpperYaw = -0.30 - sw * 0.22; P.rUpperLift = 0.5;
              P.rForeYaw = 0.16; P.rForeLift = -0.3;
              P.maceYawOff = 0.18 + sw * 0.16;
              earLSpring.update(safeDt, Math.sin(state.stepPhase) * 0.16, 180 * sp, 6.4);
              earRSpring.update(safeDt, -Math.sin(state.stepPhase) * 0.16, 180 * sp, 6.4);
              headYawSpring.update(safeDt, Math.sin(state.stepPhase * 0.5) * 0.18, 125 * sp, 8.0);
            }
          }

          // -----------------------------------------------------------------
          // 公共步态解算与弹簧阻尼物理更新
          // -----------------------------------------------------------------
          if (wantGaitStep) {
            const gaitRes = gait.update(safeDt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
              mode: 'biped',
              scaleMul: sMul,
              stepFreq: gFreq * gaitFreqMul,
              stepHeight: 2.8 * sMul,
              stepThreshold: 3.1 * sMul
            });
            state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 0.55 * sMul, expSmooth(safeDt, 12));
            state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 0.55 * sMul, expSmooth(safeDt, 12));
            clampFeetSafe(sMul);

            if (gaitRes.landed.length > 0) {
              state.stepSign *= -1;
              bodyBounce.impulse(-7.5 * sp);
              sackBounce.impulse(-14.5 * sp);
              sackSway.impulse(state.stepSign * 7.5 * sp);
              crownBounce.impulse(-8.0 * sp);
              maceSpring.impulse(state.stepSign * 4.8 * sp);
              earLSpring.impulse(-5.5 * sp);
              earRSpring.impulse(5.5 * sp);
              for (let i = 0; i < gaitRes.landed.length; i++) {
                const lf = gaitRes.landed[i];
                EnvFeedback.emitFootstep(vfx, habitat, lf.footX, lf.footY, 1.15 * sMul);
              }
              // 巡营重步偶尔从大宝袋颠落金色碎粒
              if (action === 'patrol' && Math.random() < 0.45) {
                const [skX, skY] = localToWorldXY(state.x, state.y, state.yaw, 0, -10.5 * sMul);
                emitCoinSparkles(vfx, skX, skY, 24 * sMul, 2, 7, sMul);
              }
            }
          } else {
            state.tiltX = lerp(state.tiltX, 0, expSmooth(safeDt, 10));
            state.tiltY = lerp(state.tiltY, 0, expSmooth(safeDt, 10));
            clampFeetSafe(sMul);
          }

          bodyBounce.update(safeDt, 0, 165 * sp, 8.4);
          sackBounce.update(safeDt, 0, 105 * sp, 5.2);
          sackSway.update(safeDt, 0, 88 * sp, 5.6);
          crownBounce.update(safeDt, 0, 130 * sp, 5.8);

          instance.footContacts = gait.legs.map(l => ({
            x: l.footX, y: l.footY, z: l.footZ, r: 3.4 * sMul
          }));
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const P = state.pose;
          const yw = wrapAngle(state.yaw + P.bodyYawOff);
          const bob = clamp(bodyBounce.x * 0.08, -1.2, 1.4) * sMul;
          const baseBodyLift = Math.max(4.8 * sMul, (7.5 + P.bodyLiftOff) * sMul + bob);

          // 1. 左右粗壮二足（顶部 z=10 深嵌躯干战裙，bias=-0.35 彻底零穿模、零脱胯）
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            list.push({
              partKey: 'leg',
              asset: parts.leg,
              x: l.footX,
              y: l.footY,
              lift: Math.max(0, l.footZ),
              ro: state.yaw,
              bias: -0.35
            });
          }

          // 2. 宽厚大肚腩躯干 + 镶金皮带与战裙（lift: 7.5, bias: +0.10）
          const [tx, ty] = localToWorldXY(
            state.x + state.tiltX,
            state.y + state.tiltY,
            yw, 0, P.bodyFwdOff * sMul
          );
          list.push({
            partKey: 'torso',
            asset: parts.torso,
            x: tx,
            y: ty,
            lift: baseBodyLift,
            ro: yw,
            bias: 0.10
          });
          sockets.setWorld('torso', tx, ty, baseBodyLift, yw);

          // 3. 镶金边赤红王者披风（局部坐标后置 -7.8, lift: 8.5, bias: -0.25）
          const [cpX, cpY] = localToWorldXY(tx, ty, yw, 0, (-7.8 + P.capeBackOff) * sMul);
          list.push({
            partKey: 'cape',
            asset: parts.cape,
            x: cpX,
            y: cpY,
            lift: Math.max(1.0, baseBodyLift + (1.0 + P.capeLiftOff) * sMul),
            ro: wrapAngle(yw + P.capeYawOff),
            bias: -0.25
          });

          // 4. 满溢金币大宝袋（局部坐标 -10.5, lift: 13.5, 弹簧滞后颠簸, bias: -0.15）
          const sackBob = clamp(sackBounce.x * 0.13, -1.8, 2.6) * sMul;
          const sackRo = wrapAngle(yw + clamp(sackSway.x, -0.34, 0.34));
          const [skX, skY] = localToWorldXY(tx, ty, yw, 0, -10.5 * sMul);
          const sackZ = Math.max(4.0, baseBodyLift + (6.0 + P.sackLiftOff) * sMul + sackBob);
          list.push({
            partKey: 'lootSack',
            asset: parts.lootSack,
            x: skX,
            y: skY,
            lift: sackZ,
            ro: sackRo,
            bias: -0.15
          });
          sockets.setWorld('lootSack', skX, skY, sackZ + 12.0 * sMul, sackRo);

          // 5. 宽大狞笑头颅（(0, +1.5), lift: 21.0, bias: +0.40）
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x + P.headYawOff, -0.75, 0.75));
          const [hx, hy] = localToWorldXY(tx, ty, yw, 0, 1.5 * sMul);
          const headZ = baseBodyLift + (13.5 + P.headLiftOff) * sMul;
          list.push({
            partKey: 'head',
            asset: parts.head,
            x: hx,
            y: hy,
            lift: headZ,
            ro: hYaw,
            bias: 0.40
          });
          sockets.setWorld('head', hx, hy, headZ, hYaw);

          // 6. 巨型锯齿金冠 + 额前红绿蓝三宝石（(0, +1.2), lift: 32.5, bias: +0.65）
          const crownAsset = P.crownMode === 'charged'
            ? parts.crownCharged
            : (P.crownMode === 'askew' ? parts.crownAskew : parts.crown);
          const crownKey = P.crownMode === 'charged'
            ? 'crownCharged'
            : (P.crownMode === 'askew' ? 'crownAskew' : 'crown');
          const crBob = clamp(crownBounce.x * 0.10, -0.8, 2.4) * sMul;
          const [crX, crY] = localToWorldXY(hx, hy, hYaw, P.crownSideOff * sMul, 1.2 * sMul);
          const crZ = headZ + (11.5 + P.crownLiftOff) * sMul + crBob;
          list.push({
            partKey: crownKey,
            asset: crownAsset,
            x: crX,
            y: crY,
            lift: crZ,
            ro: wrapAngle(hYaw + P.crownYawOff),
            bias: 0.65
          });
          sockets.setWorld('crown', crX, crY, crZ, hYaw);

          // 7. 枢轴锁死超长金环双尖耳（耳根 (±8.2, +0.5), lift: 26.5, bias: +0.45）
          for (const side of [-1, 1]) {
            const [rootX, rootY] = localToWorldXY(hx, hy, hYaw, side * 8.2 * sMul, 0.5 * sMul);
            const spr = side < 0 ? earLSpring.x : earRSpring.x;
            const eYaw = wrapAngle(hYaw + clamp(spr + (side < 0 ? P.earLOff : P.earROff), -0.78, 0.78));
            const [eWx, eWy] = pivotToWorldXY(rootX, rootY, eYaw, -side * EAR_PIVOT.x * sMul, EAR_PIVOT.y * sMul);
            const eKey = side < 0 ? 'earL' : 'earR';
            list.push({
              partKey: eKey,
              asset: parts[eKey],
              x: eWx,
              y: eWy,
              lift: headZ + (5.5 + P.earLiftOff) * sMul,
              ro: eYaw,
              bias: 0.45
            });
          }

          // 8. 两段式左右手臂（肩位 (±11.5, +1.2), lift: 19.0, 连续 FK + 小臂滞后随动）
          // 左臂
          const [lShX, lShY] = localToWorldXY(tx, ty, yw, -11.5 * sMul, 1.2 * sMul);
          const lShZ = baseBodyLift + (11.5 + P.lUpperLift) * sMul;
          const lUpYaw = wrapAngle(yw + P.lUpperYaw);
          const [lUpX, lUpY] = pivotToWorldXY(lShX, lShY, lUpYaw, UPPER_ARM_PIVOT.x * sMul, UPPER_ARM_PIVOT.y * sMul);
          list.push({
            partKey: 'upperArm',
            asset: parts.upperArm,
            x: lUpX,
            y: lUpY,
            lift: lShZ,
            ro: lUpYaw,
            bias: 0.30
          });
          // 左肘 -> 左小臂 -> 左手腕挂点
          const [lElX, lElY] = localToWorldXY(lShX, lShY, lUpYaw, 0, 5.4 * sMul);
          const lElZ = lShZ + P.lForeLift * sMul;
          const lFoYaw = wrapAngle(yw + P.lForeYaw);
          const [lFoX, lFoY] = pivotToWorldXY(lElX, lElY, lFoYaw, FOREARM_PIVOT.x * sMul, FOREARM_PIVOT.y * sMul);
          list.push({
            partKey: 'forearm',
            asset: parts.forearm,
            x: lFoX,
            y: lFoY,
            lift: lElZ,
            ro: lFoYaw,
            bias: 0.34
          });
          const [lWrX, lWrY] = localToWorldXY(lElX, lElY, lFoYaw, 0, 5.6 * sMul);
          sockets.setWorld('handL', lWrX, lWrY, lElZ + 2.5 * sMul, lFoYaw);

          // 右臂
          const [rShX, rShY] = localToWorldXY(tx, ty, yw, 11.5 * sMul, 1.2 * sMul);
          const rShZ = baseBodyLift + (11.5 + P.rUpperLift) * sMul;
          const rUpYaw = wrapAngle(yw + P.rUpperYaw);
          const [rUpX, rUpY] = pivotToWorldXY(rShX, rShY, rUpYaw, UPPER_ARM_PIVOT.x * sMul, UPPER_ARM_PIVOT.y * sMul);
          list.push({
            partKey: 'upperArm',
            asset: parts.upperArm,
            x: rUpX,
            y: rUpY,
            lift: rShZ,
            ro: rUpYaw,
            bias: 0.30
          });
          // 右肘 -> 右小臂 -> 右手腕挂点
          const [rElX, rElY] = localToWorldXY(rShX, rShY, rUpYaw, 0, 5.4 * sMul);
          const rElZ = rShZ + P.rForeLift * sMul;
          const rFoYaw = wrapAngle(yw + P.rForeYaw);
          const [rFoX, rFoY] = pivotToWorldXY(rElX, rElY, rFoYaw, FOREARM_PIVOT.x * sMul, FOREARM_PIVOT.y * sMul);
          list.push({
            partKey: 'forearm',
            asset: parts.forearm,
            x: rFoX,
            y: rFoY,
            lift: rElZ,
            ro: rFoYaw,
            bias: 0.34
          });
          const [rWrX, rWrY] = localToWorldXY(rElX, rElY, rFoYaw, 0, 5.6 * sMul);
          sockets.setWorld('handR', rWrX, rWrY, rElZ + 2.5 * sMul, rFoYaw);

          // 9. 枢轴锁死黑铁镶金巨型狼牙重锤（bias: +0.55）
          if (P.maceMode === 'slung') {
            // 撒币乱砸期间重锤稳挂右腰侧，避免瞬隐
            const slungYaw = wrapAngle(yw - 1.25);
            const [slX, slY] = localToWorldXY(tx, ty, yw, 9.6 * sMul, -3.6 * sMul);
            list.push({
              partKey: 'mace',
              asset: parts.mace,
              x: slX,
              y: slY,
              lift: Math.max(2.0, baseBodyLift + 2.5 * sMul),
              ro: slungYaw,
              bias: 0.22
            });
          } else if (P.maceMode === 'raised') {
            const mYaw = wrapAngle(rFoYaw + P.maceYawOff);
            const [mWx, mWy] = pivotToWorldXY(rWrX, rWrY, mYaw, 0, MACE_UP_PIVOT_Y * sMul);
            const mZ = Math.max(2.0, rElZ + (1.5 + P.maceLiftOff) * sMul);
            list.push({
              partKey: 'maceRaised',
              asset: parts.maceRaised,
              x: mWx,
              y: mWy,
              lift: mZ,
              ro: mYaw,
              bias: 0.55
            });
            sockets.setWorld('maceHead', mWx, mWy, mZ + 18.0 * sMul, mYaw);
          } else {
            const mAsset = P.maceMode === 'charged' ? parts.maceCharged : parts.mace;
            const mKey = P.maceMode === 'charged' ? 'maceCharged' : 'mace';
            const mYaw = wrapAngle(rFoYaw + P.maceYawOff);
            const [mWx, mWy] = pivotToWorldXY(rWrX, rWrY, mYaw, 0, MACE_PIVOT_Y * sMul);
            const mZ = Math.max(0.5, rElZ - 2.2 * sMul + P.maceLiftOff * sMul);
            list.push({
              partKey: mKey,
              asset: mAsset,
              x: mWx,
              y: mWy,
              lift: mZ,
              ro: mYaw,
              bias: 0.55
            });
            const [mhX, mhY] = localToWorldXY(mWx, mWy, mYaw, 0, 7.0 * sMul);
            sockets.setWorld('maceHead', mhX, mhY, mZ + 5.8 * sMul, mYaw);
          }

          // 10. 技能 3 · 赤红部落战旗（左手高举狂摇，bias: +0.60）
          if (P.showBanner) {
            const bYaw = wrapAngle(lFoYaw + P.bannerYawOff);
            const [bX, bY] = pivotToWorldXY(lWrX, lWrY, bYaw, 0, BANNER_PIVOT_Y * sMul);
            const bZ = Math.max(2.0, lElZ - 1.5 * sMul + P.bannerLiftOff * sMul);
            list.push({
              partKey: 'warBanner',
              asset: parts.warBanner,
              x: bX,
              y: bY,
              lift: bZ,
              ro: bYaw,
              bias: 0.60
            });
            sockets.setWorld('bannerTop', bX, bY, bZ + 24.0 * sMul, bYaw);
          }

          // 11. 技能 2 · 6 枚复用立体金块（symDeg: 90, bias: +0.50）
          if (P.showGold) {
            for (let i = 0; i < goldChunks.length; i++) {
              const gc = goldChunks[i];
              if (!gc.active) continue;
              list.push({
                partKey: 'goldChunk',
                asset: parts.goldChunk,
                x: gc.x,
                y: gc.y,
                lift: Math.max(0, gc.z),
                ro: gc.ro,
                symDeg: 90,
                bias: 0.50
              });
            }
          }

          // 12. 技能 3 · 2 只复用迷你哥布林喽啰（bias: +0.25）
          if (P.showMinions) {
            for (let i = 0; i < minions.length; i++) {
              const mn = minions[i];
              if (!mn.active) continue;
              list.push({
                partKey: 'minionGoblin',
                asset: parts.minionGoblin,
                x: mn.x,
                y: mn.y,
                lift: Math.max(0, mn.z),
                ro: mn.yaw,
                bias: 0.25
              });
            }
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: BossGoblinKingDef.id,
            name: BossGoblinKingDef.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            footRadius: BossGoblinKingDef.footRadius,
            headZ: 40,
            centerZ: 18,
            blocks: BossGoblinKingDef.blocks,
            actions: ACTIONS.map(a => ({ id: a.id, name: a.name, loop: a.loop, duration: a.duration || null })),
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(BossGoblinKingDef);
})(window.PixelWorkshop);
