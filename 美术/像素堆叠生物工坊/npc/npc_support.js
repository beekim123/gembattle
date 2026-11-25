'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, lerp, smoothstep, smin, localToWorldXY, pivotToWorldXY, expSmooth, wrapAngle } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 酒6 · 药瓶卷轴队友（辅助）
  // 轮廓锚点：暖白主袍 + 薄荷翠绿半截短披风 + 草药叶饰宽边圆帽 + 红绿蓝三色圆肚药瓶 + 小木药箱
  // 规范铁律：24 格轻盈头身比、二足防脱胯 IK、两段手臂 FK 滞后、局部背法向短披风零穿模、
  //           常态 1:1 零拉伸、仅三色药剂液心微弱自亮（玻璃与眼亮点绝不进 glowKeys）、
  //           <= 48 色 0 重色、0 禁用字
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 柔和白皙肤色
      skinDark:    '#b88267',
      skinMid:     '#e3ad8f',
      skinHi:      '#fad0b4',
      // 暖白主袍（主视觉色）
      robeDark:    '#b3a996',
      robeMid:     '#dfd7c5',
      robeHi:      '#f7f3e6',
      // 薄荷翠绿半截短披风（高辨识职业色）
      capeDark:    '#1f7354',
      capeMid:     '#3eb082',
      capeHi:      '#7ae0b1',
      // 宽边圆帽暖浅棕
      hatDark:     '#70583c',
      hatMid:      '#a68760',
      hatHi:       '#d4b78c',
      // 棕色皮带、挎包与小木药箱
      woodDark:    '#4a2e1d',
      woodMid:     '#7a4e33',
      woodHi:      '#ab7450',
      // 栗色软发
      hairDark:    '#40281c',
      hairMid:     '#6e4733',
      hairHi:      '#9c6b50',
      // 草药叶饰
      herbDark:    '#2a6627',
      herbMid:     '#4fa346',
      herbHi:      '#85d46e',
      // 羊皮卷轴与绑绳
      scrollDark:  '#bfa87e',
      scrollMid:   '#e8d7ad',
      scrollHi:    '#faf1d4',
      // 透明玻璃瓶颈与瓶塞（绝不进 glowKeys）
      glassMid:    '#c4e0eb',
      glassHi:     '#eff9fc',
      // 红、绿、蓝三色药剂液（深边 + 微弱自亮液心）
      potRedRim:   '#b81f30',
      potRedCore:  '#ff4d5c',
      potGrnRim:   '#1e9947',
      potGrnCore:  '#4ef27d',
      potBluRim:   '#1e62bd',
      potBluCore:  '#52b4ff',
      // 药箱黄铜扣（不进 glowKeys）
      brassMid:    '#cf9e36',
      brassHi:     '#f5d473',
      // 眼睛（绝不进 glowKeys）
      eyeDark:     '#16141a',
      eyeIris:     '#3b8c73',
      eyeGlint:    '#f7fcff'
    },
    glowKeys: ['potRedCore', 'potGrnCore', 'potBluCore'],
    parts: [
      'boot', 'leg', 'robe', 'belt', 'cape', 'pouch', 'scroll', 'leaf',
      'head', 'hair', 'hat', 'eye', 'arm', 'hand', 'glass', 'potRed', 'potGrn', 'potBlu', 'box', 'brass'
    ],
    noCrease: [
      ['eye', 'head'], ['hair', 'head'], ['hat', 'leaf'], ['leg', 'boot'],
      ['glass', 'potRed'], ['glass', 'potGrn'], ['glass', 'potBlu'], ['box', 'brass']
    ],
    materials: {
      skin:   ['skinDark',   'skinMid',   'skinHi'],
      robe:   ['robeDark',   'robeMid',   'robeHi'],
      cape:   ['capeDark',   'capeMid',   'capeHi'],
      hat:    ['hatDark',    'hatMid',    'hatHi'],
      wood:   ['woodDark',   'woodMid',   'woodHi'],
      hair:   ['hairDark',   'hairMid',   'hairHi'],
      herb:   ['herbDark',   'herbMid',   'herbHi'],
      scroll: ['scrollDark', 'scrollMid', 'scrollHi']
    },
    protectedParts: ['eye', 'potRed', 'potGrn', 'potBlu', 'leaf']
  });

  const SKINS = [
    { id: 'mint_white', name: '薄荷白袍', dot: '#3eb082', outline: '#101714', pal: {} },
    {
      id: 'sunny_apricot', name: '向阳暖杏', dot: '#e08b4c', outline: '#17110d',
      pal: {
        robeDark: '#baad99', robeMid: '#ebe0cc', robeHi: '#fcf7eb',
        capeDark: '#9e4c1e', capeMid: '#e08b4c', capeHi: '#f7b97e',
        hatDark:  '#7d6235', hatMid:  '#b89454', hatHi:  '#e6c683'
      }
    },
    {
      id: 'pale_cyan', name: '浅青药师', dot: '#4ca6b8', outline: '#0e161a',
      pal: {
        robeDark: '#9fb0b8', robeMid: '#d2e2e8', robeHi: '#eef7fa',
        capeDark: '#236878', capeMid: '#4ca6b8', capeHi: '#85d6e6',
        hatDark:  '#425c5a', hatMid:  '#6b8f8c', hatHi:  '#9bc2bf'
      }
    }
  ];

  function buildLegSeg(makeCanvas, rTop, rBot, hLen) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 3);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat('robe'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildBoot(makeCanvas) {
    const m = new VoxelModel(6, 8, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0.7, 1.25, 1.55, 2.25, 1.25, mat('wood'), partId.boot, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2 });
  }

  function buildTorso(makeCanvas) {
    // 暖白旅行医师主袍 + 薄荷绿半截肩披风 + 腰带一圈三色圆肚药瓶与红绳卷轴
    const m = new VoxelModel(14, 13, 12, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-5.4, 5.4, -4.6, 4.6, 0, 11, (x, y, z, X, Y) => {
      const rx = lerp(4.8, 3.8, clamp(z / 10, 0, 1));
      const ry = lerp(4.1, 3.3, clamp(z / 10, 0, 1));
      const dRobe = (Math.hypot(X / rx, Y / ry, (z - 5.2) / 5.4) - 1) * 3.6;
      const dNeck = (Math.hypot(X / 2.1, Y / 2.0, (z - 10.4) / 1.7) - 1) * 1.7;
      if (smin(dRobe, dNeck, 1.0) <= 0) {
        m.setRaw(x, y, z, z > 9.5 ? mat('skin') : mat('robe'), partId.robe);
      }
      // 袍摆覆住大腿根防脱胯
      const r = Math.hypot(X / 4.8, Y / 4.0);
      if (r <= 1.0 && r >= 0.45 && z >= 0.3 && z <= 3.6) {
        m.setRaw(x, y, z, mat('robe'), partId.robe);
      }
    });
    // 薄荷翠绿半截短披风覆盖双肩与胸前领口
    m.paintEllipsoid(0, -0.2, 8.8, 4.8, 4.0, 1.9, mat('cape'), partId.cape, true);
    m.paintEllipsoid(0, 0.3, 9.6, 2.2, 2.1, 1.5, mat('skin'), partId.robe, true);
    // 棕色腰带
    m.paintEllipsoid(0, 0, 4.2, 4.5, 3.8, 0.85, mat('wood'), partId.belt, true);

    // 腰间极醒目的红、绿、蓝三色圆肚药剂瓶 + 背后绑红绳羊皮卷轴
    const paintBeltPotion = (cx, cy, cz, rimId, coreId, pId) => {
      m.paintEllipsoid(cx, cy, cz, 1.25, 1.25, 1.35, rimId, pId, true);
      m.setRaw(Math.round(m.w * 0.5 - 0.5 + cx), Math.round(m.d * 0.5 - 0.5 + cy), Math.round(cz), coreId, pId);
      m.paintEllipsoid(cx, cy, cz + 1.4, 0.65, 0.65, 0.55, keyToId.glassMid, partId.glass, true);
    };
    paintBeltPotion(-4.5, 1.2, 3.8, keyToId.potRedRim, keyToId.potRedCore, partId.potRed);
    paintBeltPotion( 4.5, 1.2, 3.8, keyToId.potBluRim, keyToId.potBluCore, partId.potBlu);
    paintBeltPotion(-2.2, 3.7, 3.8, keyToId.potGrnRim, keyToId.potGrnCore, partId.potGrn);

    // 背后腰间横绑羊皮卷轴 + 红绳
    m.paintCapsule(-3.2, -4.0, 4.4, 3.2, -4.0, 4.4, 1.1, 1.1, mat('scroll'), partId.scroll, true);
    m.paintEllipsoid(0, -4.0, 4.4, 0.85, 1.25, 1.25, keyToId.potRedRim, partId.potRed, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.0 });
  }

  function buildShortCape(makeCanvas) {
    const m = new VoxelModel(11, 6, 6, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-4.6, 4.6, -2.2, 2.2, 0, 5, (x, y, z, X, Y) => {
      const u = z / 5;
      const halfW = lerp(4.4, 3.4, u);
      const yCurve = -0.6 + Math.abs(X) * 0.14;
      if (Math.abs(X) <= halfW && Math.abs(Y - yCurve) <= 0.95) {
        m.setRaw(x, y, z, mat('cape'), partId.cape);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8 });
  }

  function buildHeadAndHat(makeCanvas) {
    // 亲和圆脸 + 栗色短卷发 + 镶草药叶饰宽边圆帽
    const W = 17, D = 17, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.paintEllipsoid(0, 0.3, 3.5, 3.5, 3.4, 3.3, mat('skin'), partId.head, true);
    m.paintEllipsoid(0, -1.1, 3.7, 3.8, 3.2, 3.2, mat('hair'), partId.hair, false);
    // 宽边圆帽（比向导旅帽更圆润柔和）
    m.fillAABB(-7.6, 7.6, -7.6, 7.6, 5.4, 7.2, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 7.2, Y / 7.2);
      const brimZ = 6.2 - r * r * 0.45;
      if (r <= 1.0 && Math.abs(z - brimZ) <= 0.72) {
        m.setRaw(x, y, z, mat('hat'), partId.hat);
      }
    });
    // 圆顶帽冠 + 薄荷绿帽带
    m.paintEllipsoid(0, 0, 8.0, 4.1, 4.1, 2.5, mat('hat'), partId.hat, true);
    m.paintEllipsoid(0, 0, 6.9, 4.35, 4.35, 0.8, mat('cape'), partId.cape, true);
    // 右侧醒目双片草药叶饰 + 红浆果
    m.paintCapsule(3.4, 2.0, 7.4, 5.8, 3.4, 9.2, 1.15, 0.7, mat('herb'), partId.leaf, true);
    m.paintCapsule(3.6, 1.4, 7.2, 5.6, 0.4, 8.8, 1.05, 0.65, mat('herb'), partId.leaf, true);
    m.paintEllipsoid(3.8, 2.4, 7.5, 0.85, 0.85, 0.85, keyToId.potRedRim, partId.potRed, true);

    m.despeckle();
    m.applyArtShading(true);

    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeZ = 4;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.5);
      let sy = -1;
      for (let y = D - 2; y >= 1; y--) {
        if (m.getPartId(ex, y, eyeZ) === partId.head) { sy = y; break; }
      }
      if (sy < 0) sy = Math.round(hd + 3.4);
      m.setRaw(ex, sy, eyeZ, keyToId.eyeDark, partId.eye);
      m.setRaw(ex, sy, eyeZ + 1, keyToId.eyeGlint, partId.eye);
      m.setRaw(ex + s, sy, eyeZ, keyToId.eyeIris, partId.eye);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 6.4 });
  }

  function buildArmSeg(makeCanvas, len, r0, r1, matName, hasHand) {
    const W = 7, D = Math.ceil(len * 2 + 5), H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 3.0, 0, len, 2.8, r0, r1, mat(matName), partId.arm, true);
    if (hasHand) {
      m.paintEllipsoid(0, len + 0.5, 2.8, 1.15, 1.15, 1.1, mat('skin'), partId.hand, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0 });
  }

  function buildBigFlask(makeCanvas) {
    // 右手举着的大圆肚彩液药瓶（红绿双层液心微弱自亮，玻璃瓶口与软木塞不进 glowKeys）
    const m = new VoxelModel(9, 9, 10, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 圆肚药液本体
    m.paintEllipsoid(0, 0, 3.2, 2.7, 2.7, 2.7, keyToId.potGrnRim, partId.potGrn, true);
    m.paintEllipsoid(0, 0, 2.3, 2.2, 2.2, 1.6, keyToId.potBluRim, partId.potBlu, true);
    // 顶部玻璃颈与软木塞
    m.paintCapsule(0, 0, 5.6, 0, 0, 7.6, 1.15, 1.25, keyToId.glassMid, partId.glass, true);
    m.paintEllipsoid(0, 0, 8.3, 1.0, 1.0, 0.8, mat('wood'), partId.box, true);
    m.despeckle();
    m.applyArtShading(true);
    // 液心自亮点（仅 4 格核心微弱自亮）
    const cx = Math.round(m.w * 0.5 - 0.5), cy = Math.round(m.d * 0.5 - 0.5);
    m.setRaw(cx, cy, 4, keyToId.potGrnCore, partId.potGrn);
    m.setRaw(cx + 1, cy, 3, keyToId.potBluCore, partId.potBlu);
    m.setRaw(cx - 1, cy + 1, 5, keyToId.glassHi, partId.glass);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0 });
  }

  function buildMedBox(makeCanvas) {
    // 左手提着的小木药箱（带提手、黄铜扣与红十字徽）
    const m = new VoxelModel(9, 7, 8, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-3.2, 3.2, -2.2, 2.2, 1, 5, (x, y, z) => {
      m.setRaw(x, y, z, mat('wood'), partId.box);
    });
    // 顶部提手
    m.paintCapsule(-1.6, 0, 5.4, -1.6, 0, 6.8, 0.55, 0.55, keyToId.brassMid, partId.brass, true);
    m.paintCapsule( 1.6, 0, 5.4,  1.6, 0, 6.8, 0.55, 0.55, keyToId.brassMid, partId.brass, true);
    m.paintCapsule(-1.6, 0, 6.8,  1.6, 0, 6.8, 0.55, 0.55, keyToId.brassHi, partId.brass, true);
    // 铜锁扣
    m.paintEllipsoid(0, 2.3, 3.6, 0.85, 0.45, 0.85, keyToId.brassHi, partId.brass, true);
    m.despeckle();
    m.applyArtShading(true);
    // 箱盖醒目绿十字徽
    const cx = Math.round(m.w * 0.5 - 0.5), cy = Math.round(m.d * 0.5 - 0.5);
    m.setRaw(cx, cy, 5, keyToId.potGrnRim, partId.potGrn);
    m.setRaw(cx - 1, cy, 5, keyToId.potGrnRim, partId.potGrn);
    m.setRaw(cx + 1, cy, 5, keyToId.potGrnRim, partId.potGrn);
    m.setRaw(cx, cy - 1, 5, keyToId.potGrnRim, partId.potGrn);
    m.setRaw(cx, cy + 1, 5, keyToId.potGrnRim, partId.potGrn);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2 });
  }

  function buildOpenScroll(makeCanvas) {
    // 增益施法时左手展开的草药羊皮卷轴
    const m = new VoxelModel(10, 6, 8, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.paintCapsule(-3.8, 0, 1.2, -3.8, 0.8, 6.4, 0.8, 0.8, mat('wood'), partId.box, true);
    m.paintCapsule( 3.8, 0, 1.2,  3.8, 0.8, 6.4, 0.8, 0.8, mat('wood'), partId.box, true);
    m.fillAABB(-3.4, 3.4, -0.4, 1.2, 1.5, 6.2, (x, y, z, X, Y) => {
      const ty = 0.2 + (z - 1.5) * 0.14;
      if (Math.abs(Y - ty) <= 0.65) m.setRaw(x, y, z, mat('scroll'), partId.scroll);
    });
    m.despeckle();
    m.applyArtShading(true);
    // 卷轴中央绿叶草药符记
    const cx = Math.round(m.w * 0.5 - 0.5), cy = Math.round(m.d * 0.5 - 0.5 + 1);
    m.setRaw(cx, cy, 4, keyToId.potGrnCore, partId.potGrn);
    m.setRaw(cx - 1, cy, 3, keyToId.herbMid, partId.leaf);
    m.setRaw(cx + 1, cy, 5, keyToId.herbMid, partId.leaf);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5 });
  }

  function buildSmallRedVial(makeCanvas) {
    // 调药动作左手拿出的小红药瓶
    const m = new VoxelModel(6, 6, 7, SPEC);
    const { partId, keyToId } = SPEC;
    m.paintEllipsoid(0, 0, 2.2, 1.8, 1.8, 1.9, keyToId.potRedRim, partId.potRed, true);
    m.paintCapsule(0, 0, 4.0, 0, 0, 5.6, 0.8, 0.85, keyToId.glassMid, partId.glass, true);
    m.despeckle();
    m.applyArtShading(true);
    const cx = Math.round(m.w * 0.5 - 0.5), cy = Math.round(m.d * 0.5 - 0.5);
    m.setRaw(cx, cy, 2, keyToId.potRedCore, partId.potRed);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0 });
  }

  const Def = {
    id: 'npc_support',
    code: '酒6',
    name: '药瓶卷轴队友',
    tag: '辅助队友 · 三色药瓶',
    summary: '暖白主袍配薄荷翠绿半截短披风与叶饰圆帽，周身挂满红绿蓝三色圆肚药剂瓶，手举大药瓶提药箱',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 7.2,
    ecoWeight: 0.85,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',   name: '轻晃药瓶', loop: true,  status: 'done' },
      { id: 'patrol', name: '轻快巡步', loop: true,  status: 'done' },
      { id: 'buff',   name: '药卷增益', loop: false, duration: 2.2, status: 'done' },
      { id: 'brew',   name: '调药候雇', loop: false, duration: 2.4, status: 'done' }
    ],
    blocks: ['二足轻快 IK', '两段手臂 FK 滞后', '局部短披风', '三色药瓶微弱自亮液心', '增益微粒与调药泡泡'],
    soulHabit: '轻晃大药瓶飘起三色药泡 → 轻快巡步药箱错相轻摆 → 举瓶展卷撒青绿暖金增益 / 开箱摇瓶变色',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        thigh:      buildLegSeg(makeCanvas, 1.65, 1.42, 4.4),
        shin:       buildLegSeg(makeCanvas, 1.38, 1.24, 4.2),
        boot:       buildBoot(makeCanvas),
        torso:      buildTorso(makeCanvas),
        shortCape:  buildShortCape(makeCanvas),
        head:       buildHeadAndHat(makeCanvas),
        upperArmL:  buildArmSeg(makeCanvas, 3.0, 1.32, 1.18, 'cape', false),
        forearmL:   buildArmSeg(makeCanvas, 3.2, 1.12, 1.00, 'robe', true),
        upperArmR:  buildArmSeg(makeCanvas, 3.0, 1.32, 1.18, 'cape', false),
        forearmR:   buildArmSeg(makeCanvas, 3.2, 1.12, 1.00, 'robe', true),
        bigFlask:   buildBigFlask(makeCanvas),
        medBox:     buildMedBox(makeCanvas),
        scrollOpen: buildOpenScroll(makeCanvas),
        redVial:    buildSmallRedVial(makeCanvas)
      };

      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.0, hipY: -0.1, hipZ: 8.6, restX: -2.1, restY: 0.2, group: 0, L1: 4.5, L2: 4.6, bendDir: 1 },
        { id: 'R', hipX:  2.0, hipY: -0.1, hipZ: 8.6, restX:  2.1, restY: 0.2, group: 1, L1: 4.5, L2: 4.6, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 2.0, stepDuration: 0.145, stepHeight: 1.85, strideAnticipation: 0.44 });

      const headYawSp  = new SpringDamper1D(0, 130, 9.2);
      const torsoTwist = new SpringDamper1D(0, 120, 8.8);
      const boxSwing   = new SpringDamper1D(0, 110, 5.6);
      const flaskSwirl = new SpringDamper1D(0, 135, 6.2);
      const bodyBounce = new SpringDamper1D(0, 185, 8.8);
      const armLUpSp   = new SpringDamper1D(0, 135, 8.2);
      const armLForeSp = new SpringDamper1D(0, 115, 7.4);
      const armRUpSp   = new SpringDamper1D(0, 135, 8.2);
      const armRForeSp = new SpringDamper1D(0, 115, 7.4);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        prevYaw: opts.homeYaw ?? 0, yawRate: 0,
        walkBlend: 0, stepPhase: 0, stepSign: 1,
        action: 'idle', actionTime: 0,
        tiltX: 0, tiltY: 0,
        bubbleCd: 0.5, buffRingCd: 0
      };
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: Def,
        cachePrefix: `npc_support_${Math.random().toString(36).slice(2, 7)}`,
        parts, partListAssets: Object.values(parts), state, sockets, footContacts: [], scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.yaw = hyaw; state.prevYaw = hyaw; state.z = 0;
          state.vx = 0; state.vy = 0; state.walkBlend = 0; state.yawRate = 0;
          state.action = 'idle'; state.actionTime = 0; state.bubbleCd = 0.5; state.buffRingCd = 0;
          gait.reset(hx, hy, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco = {}) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = params.springiness ?? 1.0;
          const flex = params.tailFlex ?? 1.0;
          const gFreq = params.gaitFreq ?? 1.0;

          const act = eco.action || (eco.patrol ? 'patrol' : 'idle');
          const actT = eco.actionTime ?? 0;
          if (act !== state.action) {
            state.buffRingCd = 0;
          }
          state.action = act;
          state.actionTime = actT;

          const isPatrol = act === 'patrol';
          state.prevYaw = state.yaw;
          Propulsion.multiLegWalk(state, dt, time, { ...params, speed: (params.speed ?? 1.0) * 0.96 }, {
            ...eco, patrol: isPatrol, walkStyle: 'scurry', baseLift: 0
          });
          state.z = 0;
          state.yawRate = clamp(wrapAngle(state.yaw - state.prevYaw) / Math.max(dt, 0.001), -5, 5);

          const spdNow = Math.hypot(state.vx, state.vy);
          state.walkBlend = lerp(state.walkBlend, clamp((spdNow - 1.5) / 6.2, 0, 1), expSmooth(dt, 10));
          state.stepPhase += dt * (3.6 + state.walkBlend * 10.5) * gFreq;

          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 1.25,
            stepHeight: 1.85 * sMul * (0.78 + flex * 0.22),
            stepThreshold: 2.0 * sMul
          });
          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 0.45 * sMul, expSmooth(dt, 12));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 0.45 * sMul, expSmooth(dt, 12));

          const maxFootOff = 3.4 * sMul;
          for (const leg of gait.legs) {
            const [ix, iy] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
            const dx = leg.footX - ix, dy = leg.footY - iy;
            const d = Math.hypot(dx, dy);
            if (d > maxFootOff) {
              leg.footX = ix + (dx / d) * maxFootOff;
              leg.footY = iy + (dy / d) * maxFootOff;
            }
          }

          if (gaitRes.landed.length > 0) {
            state.stepSign *= -1;
            bodyBounce.impulse(4.8 * sp);
            boxSwing.impulse(state.stepSign * 6.5 * sp);
            flaskSwirl.impulse(-state.stepSign * 4.2 * sp);
            for (const l of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.48 * sMul);
            }
          }
          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 1.9 * sMul }));

          let tHeadYaw = Math.sin(time * 1.1) * 0.16;
          let tTorsoTw = 0;
          let tArmLUp = -0.25, tArmLFore = -0.10;
          let tArmRUp = -0.16, tArmRFore = 0.22;

          if (act === 'patrol') {
            const sw = Math.sin(state.stepPhase);
            const swLag = Math.sin(state.stepPhase - 0.82);
            tTorsoTw = sw * 0.08;
            tArmLUp = -0.22 + sw * 0.36 * state.walkBlend;
            tArmLFore = -0.08 + swLag * 0.28 * state.walkBlend;
            tArmRUp = -0.14 - sw * 0.24 * state.walkBlend;
            tArmRFore = 0.20 - swLag * 0.20 * state.walkBlend;
          } else if (act === 'idle') {
            // 轻晃手里药瓶，不时飘起一两颗红绿蓝微小药泡粒子
            const swirl = Math.sin(time * 3.1);
            const swirlLag = Math.sin(time * 3.1 - 0.80);
            tArmRUp = -0.16 + swirl * 0.14;
            tArmRFore = 0.24 + swirlLag * 0.22;
            tArmLUp = -0.26 + Math.sin(time * 1.8) * 0.06;
            tArmLFore = -0.12;
            state.bubbleCd -= dt;
            if (state.bubbleCd <= 0 && vfx) {
              state.bubbleCd = 0.65 + Math.random() * 0.55;
              const cols = ['#ff4d5c', '#4ef27d', '#52b4ff'];
              const col = cols[Math.floor(Math.random() * cols.length)];
              const [bx, by] = localToWorldXY(state.x, state.y, state.yaw, 5.2 * sMul, 5.4 * sMul);
              vfx.spawnParticle(
                bx + (Math.random() - 0.5) * 1.6, by + (Math.random() - 0.5) * 1.6, 15.2 * sMul,
                (Math.random() - 0.5) * 3.5, (Math.random() - 0.5) * 3.5, 5.5 + Math.random() * 4.0,
                0.75, 1.25, col, true, -2
              );
            }
          } else if (act === 'buff') {
            // 双臂举起大药瓶与展开卷轴，周身撒出一圈柔和升腾的青绿与暖金增益微粒
            const p = clamp(actT / 2.2, 0, 1);
            const lift = smoothstep(0.08, 0.28, p) * (1 - smoothstep(0.76, 0.96, p));
            tTorsoTw = Math.sin(p * Math.PI * 2) * 0.14 * lift;
            tHeadYaw = -tTorsoTw * 0.5;
            tArmLUp = lerp(-0.25, 0.36, lift);
            tArmLFore = lerp(-0.10, 0.28, lift);
            tArmRUp = lerp(-0.16, -0.34, lift);
            tArmRFore = lerp(0.22, -0.20, lift);
            if (lift > 0.55 && vfx) {
              state.buffRingCd -= dt;
              if (state.buffRingCd <= 0) {
                state.buffRingCd = 0.09;
                for (let k = 0; k < 2; k++) {
                  const ang = time * 4.5 + k * Math.PI + Math.random() * 0.6;
                  const rad = (7.2 + Math.random() * 3.4) * sMul;
                  const col = k === 0 ? '#6ef2b4' : '#ffe078';
                  vfx.spawnParticle(
                    state.x + Math.cos(ang) * rad, state.y + Math.sin(ang) * rad, (3.0 + Math.random() * 6.0) * sMul,
                    -Math.sin(ang) * 4.5, Math.cos(ang) * 4.5, 11.5 + Math.random() * 5.0,
                    0.72, 1.45, col, true, -1
                  );
                }
              }
            }
          } else if (act === 'brew') {
            // 酒馆候雇：打开小木药箱把红蓝小瓶凑近摇匀观察变色
            const p = clamp(actT / 2.4, 0, 1);
            const focus = smoothstep(0.06, 0.20, p) * (1 - smoothstep(0.82, 0.96, p));
            const shake = Math.sin(p * Math.PI * 10);
            tHeadYaw = shake * 0.08 * focus;
            tArmLUp = lerp(-0.25, 0.38, focus);
            tArmLFore = lerp(-0.10, 0.62 + shake * 0.16, focus);
            tArmRUp = lerp(-0.16, -0.38, focus);
            tArmRFore = lerp(0.22, -0.62 - shake * 0.16, focus);
            if (focus > 0.65 && vfx) {
              state.bubbleCd -= dt;
              if (state.bubbleCd <= 0) {
                state.bubbleCd = 0.14;
                const cols = ['#ff5c77', '#52b4ff', '#c96eff'];
                const col = cols[Math.floor(p * 12) % cols.length];
                const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, 0, 6.4 * sMul);
                vfx.spawnParticle(
                  mx + (Math.random() - 0.5) * 2.4, my + (Math.random() - 0.5) * 2.0, 12.6 * sMul,
                  (Math.random() - 0.5) * 4.0, (Math.random() - 0.5) * 4.0, 7.5 + Math.random() * 4.5,
                  0.62, 1.25, col, true, -2
                );
              }
            }
          }

          headYawSp.update(dt, tHeadYaw, 130 * sp, 9.2);
          torsoTwist.update(dt, tTorsoTw, 120 * sp, 8.8);
          armLUpSp.update(dt, tArmLUp, 135 * sp, 8.2);
          armLForeSp.update(dt, tArmLFore, 115 * sp, 7.4);
          armRUpSp.update(dt, tArmRUp, 135 * sp, 8.2);
          armRForeSp.update(dt, tArmRFore, 115 * sp, 7.4);
          bodyBounce.update(dt, 0, 185 * sp, 8.8);
          boxSwing.update(dt, Math.sin(state.stepPhase - 0.7) * 0.24 * state.walkBlend, 110 * sp, 5.6);
          flaskSwirl.update(dt, Math.sin(time * 3.1) * 0.18, 135 * sp, 6.2);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const tYaw = yw + clamp(torsoTwist.x, -0.65, 0.65);
          const hYaw = tYaw + clamp(headYawSp.x, -0.75, 0.75);

          const breath = Math.sin(state.stepPhase * 0.55) * 0.30 * (1 - state.walkBlend * 0.4);
          const walkBob = Math.abs(Math.sin(state.stepPhase)) * 0.68 * state.walkBlend;
          const bob = clamp(bodyBounce.x * 0.05 + breath + walkBob, -0.35, 0.95) * sMul;

          // 1. 二足 IK 双腿
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const hx = l.hipWX + state.tiltX;
            const hy = l.hipWY + state.tiltY;
            const hz = l.hipWZ + bob;
            list.push({
              partKey: 'thigh', asset: parts.thigh,
              x: lerp(hx, l.kneeX, 0.30), y: lerp(hy, l.kneeY, 0.30),
              lift: Math.max(0, lerp(hz, l.kneeZ, 0.30) - 2.0 * sMul),
              ro: yw, bias: -0.34, symDeg: 90
            });
            list.push({
              partKey: 'shin', asset: parts.shin,
              x: lerp(l.kneeX, l.footX, 0.48), y: lerp(l.kneeY, l.footY, 0.48),
              lift: Math.max(0, lerp(l.kneeZ, l.footZ + 1.5 * sMul, 0.48) - 2.0 * sMul),
              ro: yw, bias: -0.28, symDeg: 90
            });
            list.push({
              partKey: 'boot', asset: parts.boot,
              x: l.footX, y: l.footY, lift: Math.max(0, l.footZ),
              ro: yw, bias: -0.22
            });
          }

          // 2. 暖白主袍躯干（腰挂三色药瓶与卷轴）
          const tx = state.x + state.tiltX;
          const ty = state.y + state.tiltY;
          list.push({
            partKey: 'torso', asset: parts.torso,
            x: tx, y: ty, lift: 6.2 * sMul + bob, ro: tYaw, bias: 0.14
          });

          // 3. 局部背法向薄荷绿短披风（零穿模）
          const turnSwing = clamp(-state.yawRate * 0.14, -0.34, 0.34);
          const capeLift = (state.action === 'buff' && state.actionTime > 0.2 && state.actionTime < 2.0) ? 0.9 : 0;
          const [cpX, cpY] = localToWorldXY(tx, ty, tYaw, turnSwing * 0.9 * sMul, (-3.6 - capeLift * 0.7) * sMul);
          list.push({
            partKey: 'shortCape', asset: parts.shortCape,
            x: cpX, y: cpY, lift: (10.2 + capeLift * 0.5) * sMul + bob, ro: tYaw + turnSwing, bias: -0.20
          });

          // 4. 头部与叶饰宽边圆帽
          const headZ = 15.0 * sMul + bob * 1.05;
          list.push({
            partKey: 'head', asset: parts.head,
            x: tx, y: ty, lift: headZ, ro: hYaw, bias: 0.45
          });

          // 5. 两段手臂 FK
          const isBuff = state.action === 'buff' && state.actionTime > 0.18 && state.actionTime < 2.02;
          const isBrew = state.action === 'brew' && state.actionTime > 0.15 && state.actionTime < 2.25;
          const shZ = 13.5 * sMul + bob;
          const [lShX, lShY] = localToWorldXY(tx, ty, tYaw, -4.1 * sMul, 0.4 * sMul);
          const [rShX, rShY] = localToWorldXY(tx, ty, tYaw,  4.1 * sMul, 0.4 * sMul);

          const lUpYaw = tYaw + armLUpSp.x;
          const lFoYaw = tYaw + armLForeSp.x;
          const rUpYaw = tYaw + armRUpSp.x;
          const rFoYaw = tYaw + armRForeSp.x;

          const lArmZ = shZ + (isBuff ? 2.0 : -0.8) * sMul;
          const rArmZ = shZ + (isBuff ? 2.4 : 0.4) * sMul;

          const [lUpWx, lUpWy] = pivotToWorldXY(lShX, lShY, lUpYaw, 0, -0.4 * sMul);
          const [lElX, lElY] = localToWorldXY(lShX, lShY, lUpYaw, 0, 2.9 * sMul);
          const [lFoWx, lFoWy] = pivotToWorldXY(lElX, lElY, lFoYaw, 0, -0.3 * sMul);
          const [lHdX, lHdY] = localToWorldXY(lElX, lElY, lFoYaw, 0, 3.3 * sMul);

          const [rUpWx, rUpWy] = pivotToWorldXY(rShX, rShY, rUpYaw, 0, -0.4 * sMul);
          const [rElX, rElY] = localToWorldXY(rShX, rShY, rUpYaw, 0, 2.9 * sMul);
          const [rFoWx, rFoWy] = pivotToWorldXY(rElX, rElY, rFoYaw, 0, -0.3 * sMul);
          const [rHdX, rHdY] = localToWorldXY(rElX, rElY, rFoYaw, 0, 3.3 * sMul);

          list.push({ partKey: 'upperArmL', asset: parts.upperArmL, x: lUpWx, y: lUpWy, lift: lArmZ, ro: lUpYaw, bias: 0.22 });
          list.push({ partKey: 'forearmL',  asset: parts.forearmL,  x: lFoWx, y: lFoWy, lift: lArmZ - (isBuff ? -0.6 : 0.9) * sMul, ro: lFoYaw, bias: 0.28 });
          list.push({ partKey: 'upperArmR', asset: parts.upperArmR, x: rUpWx, y: rUpWy, lift: rArmZ, ro: rUpYaw, bias: 0.22 });
          list.push({ partKey: 'forearmR',  asset: parts.forearmR,  x: rFoWx, y: rFoWy, lift: rArmZ + (isBuff ? 1.0 : 0.3) * sMul, ro: rFoYaw, bias: 0.28 });

          // 6. 右手大圆药瓶 + 左手小木药箱 / 增益卷轴 / 调药小红瓶
          const flaskZ = rArmZ + (isBuff ? 2.2 : 0.8) * sMul;
          list.push({
            partKey: 'bigFlask', asset: parts.bigFlask,
            x: rHdX, y: rHdY, lift: flaskZ, ro: rFoYaw + clamp(flaskSwirl.x, -0.35, 0.35), bias: 0.42
          });

          if (isBuff) {
            list.push({
              partKey: 'scrollOpen', asset: parts.scrollOpen,
              x: lHdX, y: lHdY, lift: lArmZ + 0.8 * sMul, ro: tYaw, bias: 0.44
            });
          } else if (isBrew) {
            // 小木药箱放在脚前，左手拿小红药瓶凑近右手大药瓶摇匀
            const [bxX, bxY] = localToWorldXY(tx, ty, tYaw, 0, 7.6 * sMul);
            list.push({
              partKey: 'medBox', asset: parts.medBox,
              x: bxX, y: bxY, lift: 0.2 * sMul, ro: tYaw, bias: 0.20
            });
            list.push({
              partKey: 'redVial', asset: parts.redVial,
              x: lHdX, y: lHdY, lift: lArmZ + 0.6 * sMul, ro: lFoYaw, bias: 0.44
            });
          } else {
            list.push({
              partKey: 'medBox', asset: parts.medBox,
              x: lHdX, y: lHdY, lift: Math.max(1.8 * sMul, lArmZ - 5.2 * sMul),
              ro: lFoYaw + clamp(boxSwing.x, -0.4, 0.4), bias: 0.34
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id, code: Def.code, name: Def.name, outlineMode: 'actorUnified',
            skin: curSkin.id, footRadius: Def.footRadius, headZ: 25, centerZ: 13,
            blocks: Def.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(Def, 'npc');
})(window.PixelWorkshop);
