'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, fbm1 } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SpringDamper3D, SocketTracker } = PW.Solvers;
  const { Propulsion } = PW.Behaviors;

  // =========================================================================
  // 天1 · 当扈（《山海经》无翼长须漂浮鸟 · v3 精制纯生态版，+Y 正前）
  //   1. 饱满圆润的野鸡/雀类小躯干，完全无翼，背部与尾羽雕出清晰羽片层次；
  //   2. 独立头部带分叉清晰的高对比冠羽、尖锐短喙与锐利圆眼（eyeGlint 绝不进 glowKeys），
  //      头部与尾羽均通过 pivotToWorldXY 锁死关节枢轴；
  //   3. 下巴与胸前垂挂 7 束多节层次长须（内短外长、3 段渐变色阶、长胶囊重叠防串珠），
  //      如水母伞裙般「收拢蓄气 -> 猛然张开下推」脉冲悬停，无常态小数缩放；
  //   4. 待机交互物：4 颗立体体素菌伞孢子球（3 色变体，圆润菌伞帽 + 短柄 + 顶芯微亮核）
  //      分高度环绕漂浮；脉冲气流卷近最近孢子 -> 侧头瞄准前冲轻啄 -> 爆散彩色孢粉 -> 远处新飘来复位。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 主体羽色（翠绿林海）
      bodyDark:      '#144d3c',
      bodyMid:       '#258062',
      bodyHi:        '#54b890',
      // 背部叠羽层（深青碧）
      backDark:      '#0e3630',
      backMid:       '#1b6154',
      backHi:        '#3d9984',
      // 胸腹暖绒
      bellyDark:     '#9e9673',
      bellyMid:      '#d9cf9e',
      bellyHi:       '#f5edd0',
      // 高对比分叉冠羽（朱红亮冠）
      crestDark:     '#8c1f2b',
      crestMid:      '#d93b48',
      crestHi:       '#ff8278',
      // 尖锐短喙
      beakDark:      '#7d4c14',
      beakMid:       '#cc8524',
      beakHi:        '#f7c552',
      // 层次尾羽
      tailDark:      '#123b42',
      tailMid:       '#236b73',
      tailHi:        '#58b3b0',
      // 长须 3 段渐变色阶（根 -> 中 -> 梢）
      beardRootDark: '#8c4c12',
      beardRootMid:  '#d47b1e',
      beardRootHi:   '#f5aa3b',
      beardMidDark:  '#a86d16',
      beardMidMid:   '#e8a825',
      beardMidHi:    '#ffd95c',
      beardTipDark:  '#bf9724',
      beardTipMid:   '#f5d44c',
      beardTipHi:    '#fff5a8',
      // 独立锐利圆眼（eyeGlint 严禁进 glowKeys）
      eyeDark:       '#10141c',
      eyeIris:       '#f2b632',
      eyeGlint:      '#f8feff',
      // 菌伞孢子球 3 种柔和色块变体 + 短柄
      sporeCapADark: '#a63c4b',
      sporeCapAMid:  '#eb6c74',
      sporeCapAHi:   '#ffb8b5',
      sporeCapBDark: '#1e7874',
      sporeCapBMid:  '#42bdb0',
      sporeCapBHi:   '#a3f2e3',
      sporeCapCDark: '#5e4396',
      sporeCapCMid:  '#9474d6',
      sporeCapCHi:   '#d8c4ff',
      sporeStemDark: '#8a8275',
      sporeStemMid:  '#c7bfb0',
      sporeStemHi:   '#ede7dc',
      // 仅孢子顶芯微亮核进 glowKeys
      emissiveMid:   '#ff9e42',
      emissiveHot:   '#ffd96e',
      emissiveCore:  '#fffbe0'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'body', 'back', 'belly', 'crest', 'beak', 'tail',
      'beardRoot', 'beardMid', 'beardTip', 'eye',
      'sporeCap', 'sporeStem', 'sporeCore'
    ],
    noCrease: [
      ['body', 'back'], ['body', 'belly'], ['body', 'eye'],
      ['body', 'crest'], ['body', 'beak'],
      ['beardRoot', 'beardMid'], ['beardMid', 'beardTip'],
      ['sporeCap', 'sporeStem'], ['sporeCap', 'sporeCore']
    ],
    materials: {
      body:      ['bodyDark',      'bodyMid',      'bodyHi'],
      back:      ['backDark',      'backMid',      'backHi'],
      belly:     ['bellyDark',     'bellyMid',     'bellyHi'],
      crest:     ['crestDark',     'crestMid',     'crestHi'],
      beak:      ['beakDark',      'beakMid',      'beakHi'],
      tail:      ['tailDark',      'tailMid',      'tailHi'],
      beardRoot: ['beardRootDark', 'beardRootMid', 'beardRootHi'],
      beardMid:  ['beardMidDark',  'beardMidMid',  'beardMidHi'],
      beardTip:  ['beardTipDark',  'beardTipMid',  'beardTipHi'],
      sporeCapA: ['sporeCapADark', 'sporeCapAMid', 'sporeCapAHi'],
      sporeCapB: ['sporeCapBDark', 'sporeCapBMid', 'sporeCapBHi'],
      sporeCapC: ['sporeCapCDark', 'sporeCapCMid', 'sporeCapCHi'],
      sporeStem: ['sporeStemDark', 'sporeStemMid', 'sporeStemHi']
    },
    protectedParts: ['eye', 'crest', 'beak', 'sporeCore']
  });

  // 4 套零重建模换色皮肤（含各自描边色与孢粉微粒配色）
  const SKINS = [
    {
      id: 'jade_gold',
      name: '翠羽金须（林海经典）',
      dot: '#2ea87e',
      outline: '#0b1814',
      pal: {},
      fx: {
        sporeA: '#ff8a8c',
        sporeB: '#6be8d8',
        sporeC: '#c2a6ff',
        pollen: '#ffe57a',
        draft:  '#b8f2dc'
      }
    },
    {
      id: 'autumn_red',
      name: '赤冠朱须（秋枫款）',
      dot: '#d94836',
      outline: '#1c0b0c',
      pal: {
        bodyDark:      '#691d1a', bodyMid:      '#b5382c', bodyHi:      '#eb7059',
        backDark:      '#4a1315', backMid:      '#852424', backHi:      '#c44a3f',
        bellyDark:     '#a88664', bellyMid:     '#e3c39b', bellyHi:     '#faebd2',
        crestDark:     '#9c5b10', crestMid:     '#eb9b23', crestHi:     '#ffe066',
        beakDark:      '#5c381c', beakMid:      '#9c6533', beakHi:      '#d9a15b',
        tailDark:      '#4f1a22', tailMid:      '#8f3039', tailHi:      '#d4615e',
        beardRootDark: '#7a1919', beardRootMid: '#c43127', beardRootHi: '#f06449',
        beardMidDark:  '#a63a19', beardMidMid:  '#e86c2c', beardMidHi:  '#ffa852',
        beardTipDark:  '#c77920', beardTipMid:  '#f7b643', beardTipHi:  '#ffea96',
        emissiveMid:   '#ff6a33', emissiveHot:  '#ffb94f', emissiveCore:'#fff4c4'
      },
      fx: {
        sporeA: '#ff7a66',
        sporeB: '#ffd06b',
        sporeC: '#ff9ec2',
        pollen: '#ffcb57',
        draft:  '#f7cdb0'
      }
    },
    {
      id: 'frost_cyan',
      name: '雪顶青须（高空云霜款）',
      dot: '#72c8e8',
      outline: '#0c1522',
      pal: {
        bodyDark:      '#64788c', bodyMid:      '#a6bdd1', bodyHi:      '#e6f2fa',
        backDark:      '#3c536e', backMid:      '#6a8aa8', backHi:      '#a8c7e0',
        bellyDark:     '#8ca3b5', bellyMid:     '#c7dbe8', bellyHi:     '#f2f9fc',
        crestDark:     '#185f8c', crestMid:     '#35a2db', crestHi:     '#8ce6ff',
        beakDark:      '#6b5a3c', beakMid:      '#b59b68', beakHi:      '#edd8a4',
        tailDark:      '#284c6b', tailMid:      '#4980a8', tailHi:      '#8bc4e8',
        beardRootDark: '#125969', beardRootMid: '#2394a6', beardRootHi: '#5cd4e0',
        beardMidDark:  '#1e7a8a', beardMidMid:  '#42bcc9', beardMidHi:  '#94f0f5',
        beardTipDark:  '#52a1b5', beardTipMid:  '#94dce8', beardTipHi:  '#dffbff',
        emissiveMid:   '#38c2ff', emissiveHot:  '#8cebff', emissiveCore:'#ebfdff'
      },
      fx: {
        sporeA: '#8ce6ff',
        sporeB: '#a8f7e6',
        sporeC: '#c4ccff',
        pollen: '#d4fbff',
        draft:  '#cfe9f7'
      }
    },
    {
      id: 'dusk_indigo',
      name: '靛蓝暖橙须（暮云款）',
      dot: '#4d66c4',
      outline: '#0e1024',
      pal: {
        bodyDark:      '#1e2759', bodyMid:      '#384a99', bodyHi:      '#6e83d4',
        backDark:      '#141a40', backMid:      '#273373', backHi:      '#4d60b0',
        bellyDark:     '#7a708c', bellyMid:     '#b5a8c9', bellyHi:     '#e5dcf2',
        crestDark:     '#a83c18', crestMid:     '#ed6e2b', crestHi:     '#ffb55c',
        beakDark:      '#854d1a', beakMid:      '#d18632', beakHi:      '#ffc56e',
        tailDark:      '#222254', tailMid:      '#413f8f', tailHi:      '#7d78cc',
        beardRootDark: '#8f3016', beardRootMid: '#d95826', beardRootHi: '#fa8b46',
        beardMidDark:  '#b34f1b', beardMidMid:  '#f28233', beardMidHi:  '#ffba66',
        beardTipDark:  '#cc7b2b', beardTipMid:  '#ffa852', beardTipHi:  '#ffe29e',
        emissiveMid:   '#ff7b38', emissiveHot:  '#ffc05c', emissiveCore:'#fff3c9'
      },
      fx: {
        sporeA: '#ff9457',
        sporeB: '#85b8ff',
        sporeC: '#d69eff',
        pollen: '#ffc86b',
        draft:  '#b8c2f0'
      }
    }
  ];

  // =========================================================================
  // 1. 无翼饱满雀鸟躯干（2 档无损烘焙：normal 舒展 / puff 蓄气鼓胸）
  //    尺寸 20×22×16，完全无翼，背部雕琢叠层羽片，胸腹圆润，底缘留须根座
  // =========================================================================
  function buildTorso(makeCanvas, stage) {
    const isPuff = stage === 'puff';
    const W = 20, D = 22, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    const rx = isPuff ? 6.5 : 5.6;
    const ry = isPuff ? 7.6 : 7.8;
    const rz = isPuff ? 5.6 : 5.1;

    // 饱满野鸡/雀类圆润躯干（完全无翼，两侧圆润收敛）
    m.fillAABB(-8.0, 8.0, -9.5, 9.5, 2, 14, (x, y, z, X, Y) => {
      // 主胸腹 + 微微上翘的后臀
      const dChest = (Math.hypot(X / rx, (Y - 1.2) / (ry * 0.84), (z - 7.4) / rz) - 1.0) * 5.2;
      const dRump  = (Math.hypot(X / (rx * 0.78), (Y + 4.4) / 4.8, (z - 8.2) / 3.9) - 1.0) * 4.0;
      const dNeckBase = (Math.hypot(X / 3.5, (Y - 5.2) / 3.4, (z - 10.6) / 3.2) - 1.0) * 3.0;
      const d = smin(smin(dChest, dRump, 2.2), dNeckBase, 1.8);
      if (d > 0) return;

      // 背部叠层羽片纹路（沿 Y 向分 3 道人字弧边叠羽）
      const tierWave = Math.sin((Y + Math.abs(X) * 0.45) * 1.15);
      const isBelly = z < 6.4 && Y > -2.5 && Math.abs(X) < rx * 0.78;
      const isBackPlume = z >= 9.2 && Y < 4.2 && (tierWave > -0.15 || z >= 10.8);

      if (isBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (isBackPlume) {
        m.setRaw(x, y, z, mat('back'), partId.back);
      } else {
        m.setRaw(x, y, z, mat('body'), partId.body);
      }
    });

    // 背部立体羽片棱（微凸 0.8 格，强化无翼雀鸟背部的羽毛层次）
    for (let ti = 0; ti < 3; ti++) {
      const ty = 1.8 - ti * 2.8;
      const tz = 12.1 - ti * 0.35;
      const spanX = 3.8 - ti * 0.45;
      m.paintCapsule(-spanX, ty - 0.8, tz - 0.3, 0, ty + 0.6, tz + 0.35, 0.85, 0.95, mat('back'), partId.back, true);
      m.paintCapsule( spanX, ty - 0.8, tz - 0.3, 0, ty + 0.6, tz + 0.35, 0.85, 0.95, mat('back'), partId.back, true);
    }

    // 底缘 7 枚细小须根芽点（与 7 束水母长须一一对应，不堆成厚块）
    const rootRing = [
      [0.0, 5.4], [-3.0, 4.4], [3.0, 4.4],
      [-4.9, 1.2], [4.9, 1.2], [-4.2, -3.0], [4.2, -3.0]
    ];
    for (const [sx, sy] of rootRing) {
      m.paintEllipsoid(sx, sy, 4.2, 0.72, 0.72, 0.78, mat('beardRoot'), partId.beardRoot, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.4, headZ: 15, centerZ: 8 });
  }

  // =========================================================================
  // 2. 独立雀鸟头部件（normal 正常 / peck 轻啄微张，14×18×15）
  //    枢轴锁在后颈根部 (0, -2.2)，带清晰分叉高对比冠羽 + 尖锐短喙 + 2×2 锐利圆眼
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -2.2 };
  function buildHead(makeCanvas, pose) {
    const isPeck = pose === 'peck';
    const W = 14, D = 18, H = 15;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 圆润颈根 + 雀鸟圆头
    m.paintCapsule(0, -2.2, 2.2, 0, -0.4, 5.4, 2.9, 3.2, mat('body'), partId.body, true);
    m.paintEllipsoid(0, 0.4, 6.2, 3.8, 4.2, 3.7, mat('body'), partId.body, true);
    // 颊部淡绒 + 下巴轻巧须领
    m.paintEllipsoid(0, 1.5, 4.3, 3.1, 2.9, 1.8, mat('belly'), partId.belly, true);
    m.paintEllipsoid(0, 2.6, 3.3, 1.25, 1.15, 0.78, mat('beardRoot'), partId.beardRoot, true);

    // 尖锐短喙（朝 +Y 突出，peck 态微前伸并略微张开上下喙）
    if (isPeck) {
      m.paintCapsule(0, 3.6, 6.4, 0, 7.6, 6.8, 1.35, 0.48, mat('beak'), partId.beak, true);
      m.paintCapsule(0, 3.5, 5.1, 0, 6.8, 4.4, 1.15, 0.45, mat('beak'), partId.beak, true);
    } else {
      m.paintCapsule(0, 3.5, 6.0, 0, 7.4, 5.7, 1.45, 0.48, mat('beak'), partId.beak, true);
      m.paintCapsule(0, 3.6, 5.4, 0, 6.6, 5.3, 1.15, 0.45, mat('beak'), partId.beak, true);
    }

    // 分叉清晰的高对比冠羽（头顶双叉外展 + 中后长羽，一眼辨识野鸡/当扈头冠）
    for (const s of [-1, 1]) {
      // 前侧斜翘羽叉
      m.paintCapsule(s * 0.7, 0.5, 9.2, s * 2.5, -1.6, 12.6, 0.95, 0.55, mat('crest'), partId.crest, true);
      // 后侧长弧羽叉
      m.paintCapsule(s * 0.5, -0.8, 8.8, s * 3.1, -5.0, 11.4, 0.92, 0.50, mat('crest'), partId.crest, true);
    }
    // 中心高挺冠脊
    m.paintCapsule(0, 0.8, 9.2, 0, -2.4, 13.4, 1.05, 0.55, mat('crest'), partId.crest, true);

    m.despeckle();
    m.applyArtShading(true);

    // 独立 2×2 锐利圆眼（表面自动贴合，eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.2);
    const eyeZ = 7;
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 5; step++) {
        const tx = Math.round(hw + s * (4.4 - step));
        const p = m.getPartId(tx, eyeY, eyeZ);
        if (p === partId.body || p === partId.belly) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 3.1);
      // 2×2 清晰鸟眼：外圈虹膜 + 黑瞳 + 右上白点
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dy === 1)
            ? keyToId.eyeGlint
            : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 14, centerZ: 7 });
  }

  // =========================================================================
  // 3. 层次分明的独立尾羽（14×18×12，枢轴锁在尾根 (0, 4.6)）
  // =========================================================================
  const TAIL_PIVOT = { x: 0, y: 4.6 };
  function buildTail(makeCanvas) {
    const m = new VoxelModel(14, 18, 12, SPEC);
    const { mat, partId } = SPEC;

    // 尾根承托块
    m.paintEllipsoid(0, 4.2, 4.4, 2.6, 2.2, 2.0, mat('back'), partId.back, true);

    // 5 根扇形叠层尾羽（中间最长微翘，两侧逐级递减，羽尖带对比色）
    const feathers = [
      { ox:  0.0, tx:  0.0, ty: -7.2, tz: 8.8, r0: 1.35, r1: 0.72, tip: true },
      { ox: -1.1, tx: -3.2, ty: -5.8, tz: 7.4, r0: 1.22, r1: 0.65, tip: true },
      { ox:  1.1, tx:  3.2, ty: -5.8, tz: 7.4, r0: 1.22, r1: 0.65, tip: true },
      { ox: -1.9, tx: -5.0, ty: -3.4, tz: 5.8, r0: 1.08, r1: 0.58, tip: false },
      { ox:  1.9, tx:  5.0, ty: -3.4, tz: 5.8, r0: 1.08, r1: 0.58, tip: false }
    ];
    for (const f of feathers) {
      m.paintCapsule(f.ox, 4.2, 4.4, f.tx, f.ty, f.tz, f.r0, f.r1, mat('tail'), partId.tail, true);
      if (f.tip) {
        m.paintEllipsoid(f.tx, f.ty - 0.4, f.tz + 0.3, 0.95, 0.95, 0.75, mat('crest'), partId.crest, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 10, centerZ: 5 });
  }

  // =========================================================================
  // 4. 纤细水母长须胶囊部件（细长渐变丝带感，相邻节重叠 ~40% 防串珠且绝不粘成团）
  // =========================================================================
  function buildBeardSeg(makeCanvas, rTop, rBot, hLen, matName, partName) {
    const S = Math.max(5, Math.ceil(Math.max(rTop, rBot) * 2 + 3));
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.1, 0, 0, H - 1.1, rBot, rTop, mat(matName), partId[partName], true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  // =========================================================================
  // 5. 待机交互物：立体体素菌伞孢子球（10×10×10，3 种柔和色块变体）
  //    圆润菌伞帽 + 短柄 + 顶芯微亮核（仅顶芯核进 glowKeys）
  // =========================================================================
  function buildSporeBall(makeCanvas, variant) {
    const m = new VoxelModel(10, 10, 10, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const capMat = variant === 0 ? 'sporeCapA' : (variant === 1 ? 'sporeCapB' : 'sporeCapC');

    // 短小圆润菌柄
    m.paintCapsule(0, 0, 1.4, 0, 0, 4.4, 1.25, 1.05, mat('sporeStem'), partId.sporeStem, true);
    m.paintEllipsoid(0, 0, 1.6, 1.45, 1.45, 0.95, mat('sporeStem'), partId.sporeStem, true);

    // 圆润菌伞帽（下宽微卷边，上圆饱满）
    m.fillAABB(-4.0, 4.0, -4.0, 4.0, 3, 8, (x, y, z, X, Y) => {
      const dz = z - 4.4;
      if (dz < -0.5) return;
      const d = Math.hypot(X / 3.45, Y / 3.45, dz / 3.15);
      if (d <= 1.0) {
        // 伞帽底部微空出菌褶凹槽
        if (z === 4 && Math.hypot(X, Y) < 1.8) return;
        m.setRaw(x, y, z, mat(capMat), partId.sporeCap);
      }
    });

    // 顶芯微亮核（嵌入伞顶中央，柔和自亮辨识度拉满）
    m.paintEllipsoid(0, 0, 7.1, 1.45, 1.45, 1.05, keyToId.emissiveMid, partId.sporeCore, true);
    m.paintEllipsoid(0, 0, 7.6, 0.92, 0.92, 0.72, keyToId.emissiveHot, partId.sporeCore, true);
    m.setRaw(5, 5, 8, keyToId.emissiveCore, partId.sporeCore);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 9, centerZ: 5 });
  }

  // 7 束纤细水母触须环状布局（内短 8 节、外长 10 节，细长垂顺、静动交替）
  const BEARD_LAYOUT = [
    { id: 'c0',  lx:  0.0, ly:  5.6, lz: 4.1, outAng:  0.00, segs:  8, spreadMul: 0.84, phase: 0.00 },
    { id: 'l1',  lx: -3.2, ly:  4.5, lz: 4.1, outAng: -0.64, segs:  8, spreadMul: 0.94, phase: 0.72 },
    { id: 'r1',  lx:  3.2, ly:  4.5, lz: 4.1, outAng:  0.64, segs:  8, spreadMul: 0.94, phase: 1.44 },
    { id: 'l2',  lx: -5.2, ly:  1.2, lz: 4.2, outAng: -1.36, segs: 10, spreadMul: 1.12, phase: 2.16 },
    { id: 'r2',  lx:  5.2, ly:  1.2, lz: 4.2, outAng:  1.36, segs: 10, spreadMul: 1.12, phase: 2.88 },
    { id: 'l3',  lx: -4.4, ly: -3.2, lz: 4.4, outAng: -2.18, segs: 10, spreadMul: 1.16, phase: 3.60 },
    { id: 'r3',  lx:  4.4, ly: -3.2, lz: 4.4, outAng:  2.18, segs: 10, spreadMul: 1.16, phase: 4.32 }
  ];

  // 4 颗空中飘浮菌伞孢子球轨道预设
  const SPORE_ORBITS = [
    { variant: 0, baseAng:  0.55, rad: 18.5, hOff:  6.5, speed:  0.34, bobAmp: 2.0, bobFreq: 1.9, phase: 0.2 },
    { variant: 1, baseAng:  2.15, rad: 22.0, hOff: 10.5, speed: -0.28, bobAmp: 2.4, bobFreq: 1.6, phase: 1.7 },
    { variant: 2, baseAng:  3.80, rad: 19.5, hOff:  4.5, speed:  0.31, bobAmp: 1.8, bobFreq: 2.2, phase: 3.1 },
    { variant: 0, baseAng:  5.25, rad: 24.0, hOff:  8.5, speed: -0.26, bobAmp: 2.2, bobFreq: 1.7, phase: 4.8 }
  ];

  const Sky1Def = {
    id: 'sky1_danghu',
    name: '天1 · 当扈',
    tag: '无翼长须漂浮鸟 · 追啄孢子',
    summary: 'v3 精制：饱满无翼雀鸟躯干 + 分叉高对比冠羽 + 7 束内短外长水母伞裙长须脉冲悬停 + 4 颗立体菌伞孢子球自循环追啄交互',
    defaultHabitat: 'sky',
    footRadius: 7.8,
    ecoWeight: 0.65,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: ['无翼饱满雀鸟体态', '高对比分叉冠羽', '7 束水母伞裙长须', '脉冲悬停推力联动', '空中菌伞孢子球交互'],
    soulHabit: '长须收拢蓄气 -> 猛然张开下推脉冲悬停 -> 气流卷近菌伞孢子 -> 侧头前冲轻啄爆散彩色孢粉',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torsoNormal: buildTorso(makeCanvas, 'normal'),
        torsoPuff:   buildTorso(makeCanvas, 'puff'),
        headNormal:  buildHead(makeCanvas, 'normal'),
        headPeck:    buildHead(makeCanvas, 'peck'),
        tailPlume:   buildTail(makeCanvas),
        // 6 级纤细柔软水母触须节（半径 0.90 -> 0.42 丝带感，杜绝粗重腿状感）
        beard0: buildBeardSeg(makeCanvas, 0.90, 0.82, 3.5, 'beardRoot', 'beardRoot'),
        beard1: buildBeardSeg(makeCanvas, 0.82, 0.74, 3.5, 'beardRoot', 'beardRoot'),
        beard2: buildBeardSeg(makeCanvas, 0.74, 0.66, 3.4, 'beardMid',  'beardMid'),
        beard3: buildBeardSeg(makeCanvas, 0.66, 0.58, 3.4, 'beardMid',  'beardMid'),
        beard4: buildBeardSeg(makeCanvas, 0.58, 0.50, 3.3, 'beardTip',  'beardTip'),
        beard5: buildBeardSeg(makeCanvas, 0.50, 0.42, 3.1, 'beardTip',  'beardTip'),
        // 3 色变体立体菌伞孢子球
        spore0: buildSporeBall(makeCanvas, 0),
        spore1: buildSporeBall(makeCanvas, 1),
        spore2: buildSporeBall(makeCanvas, 2)
      };

      // 鸟体、长须与自亮核随皮肤换色，孢子伞帽未覆盖时保留三色柔和变体
      const beardChains = BEARD_LAYOUT.map((cfg) => ({
        ...cfg,
        nodes: Array.from({ length: cfg.segs }, (_, j) =>
          new SpringDamper3D(0, 0, 22 - j * 1.68, 108 - j * 7.2, 6.2 - j * 0.34)
        )
      }));

      // 4 颗菌伞孢子球独立状态机：orbit -> pulled -> popped -> spawning -> orbit
      const spores = SPORE_ORBITS.map((o, idx) => ({
        idx,
        variant: o.variant,
        partKey: `spore${o.variant}`,
        orbitAng: o.baseAng,
        rad: o.rad,
        hOff: o.hOff,
        speed: o.speed,
        bobAmp: o.bobAmp,
        bobFreq: o.bobFreq,
        phase: o.phase,
        x: 0, y: 0, z: 22,
        spin: idx * 1.3,
        mode: 'orbit', // 'orbit' | 'pulled' | 'popped' | 'spawning'
        timer: 0,
        spawnStartX: 0, spawnStartY: 0, spawnStartZ: 22
      }));

      const puffSpring    = new SpringDamper1D(0, 74, 7.2);
      const spreadSpring  = new SpringDamper1D(0, 88, 6.8);
      const headYawSpring = new SpringDamper1D(0, 92, 7.4);
      const lungeSpring   = new SpringDamper1D(0, 128, 8.2);
      const tailSpring    = new SpringDamper1D(0, 78, 6.6);
      const liftImpulse   = new SpringDamper1D(0, 56, 5.4);

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 24.5,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        phase: 0,
        pulseTimer: opts.seed ? (opts.seed % 7.6) : 0,
        pulseTriggeredSmall: false,
        pulseTriggeredBig: false,
        torsoMorph: 'normal',
        headPose: 'normal',
        // 孢子互动状态机：idle -> pull -> aim -> peck -> recover
        interactStage: 'idle',
        interactTimer: 1.0,
        targetSporeIdx: -1,
        peckDidPop: false,
        draftCd: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function getSporeColor(variant) {
        const fx = curSkin.fx || SKINS[0].fx;
        return variant === 0 ? fx.sporeA : (variant === 1 ? fx.sporeB : fx.sporeC);
      }

      function computeOrbitPos(sp, cx, cy, cz, sMul, time) {
        const r = sp.rad * sMul;
        const ox = cx + Math.cos(sp.orbitAng) * r;
        const oy = cy + Math.sin(sp.orbitAng) * r;
        const oz = cz + (sp.hOff + Math.sin(time * sp.bobFreq + sp.phase) * sp.bobAmp) * sMul;
        return [ox, oy, Math.max(8.0 * sMul, oz)];
      }

      const instance = {
        def: Sky1Def,
        cachePrefix: `sky1_dh_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
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
          state.z = 24.5; state.vx = 0; state.vy = 0;
          state.torsoMorph = 'normal';
          state.headPose = 'normal';
          state.interactStage = 'idle';
          state.interactTimer = 0.9;
          state.targetSporeIdx = -1;
          state.peckDidPop = false;
          state.pulseTriggeredSmall = false;
          state.pulseTriggeredBig = false;
          puffSpring.x = puffSpring.v = 0;
          spreadSpring.x = spreadSpring.v = 0;
          headYawSpring.x = headYawSpring.v = 0;
          lungeSpring.x = lungeSpring.v = 0;
          tailSpring.x = tailSpring.v = 0;
          liftImpulse.x = liftImpulse.v = 0;

          for (const bc of beardChains) {
            const [ax, ay] = localToWorldXY(state.x, state.y, state.yaw, bc.lx, bc.ly);
            const dirYaw = state.yaw + bc.outAng;
            let px = ax, py = ay, pz = state.z + bc.lz;
            for (let j = 0; j < bc.nodes.length; j++) {
              const stepOut = (j < 3 ? 0.55 : 0.20) * bc.spreadMul;
              const [fx, fy] = localToWorldXY(px, py, dirYaw, 0, stepOut);
              pz = Math.max(1.5, pz - 2.0);
              bc.nodes[j].reset(fx, fy, pz);
              px = fx; py = fy;
            }
          }
          for (let i = 0; i < spores.length; i++) {
            const sp = spores[i];
            sp.mode = 'orbit';
            sp.timer = 0;
            sp.orbitAng = SPORE_ORBITS[i].baseAng;
            const [ox, oy, oz] = computeOrbitPos(sp, homeX, homeY, state.z, 1.0, 0);
            sp.x = ox; sp.y = oy; sp.z = oz;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const patrol = eco && eco.patrol !== false;

          // -----------------------------------------------------------------
          // 1. 真实水母自然节律（7.6s 宏观周期：静悬微飘 -> 小幅轻推 -> 静悬观察 -> 大幅张伞喷推 -> 渐息回静）
          // -----------------------------------------------------------------
          const macroPeriod = clamp(7.6 / freq, 3.8, 14.0);
          state.pulseTimer = (state.pulseTimer + dt) % macroPeriod;
          const uMacro = state.pulseTimer / macroPeriod;

          function evalJellyPhase(u) {
            const w = ((u % 1) + 1) % 1;
            let expand = 0, contract = 0, env = 0.06;
            if (w >= 0.30 && w < 0.52) {
              const p = (w - 0.30) / 0.22;
              expand   = smoothstep(0.0, 0.38, p) * (1 - smoothstep(0.42, 0.56, p)) * 0.44;
              contract = smoothstep(0.45, 0.58, p) * (1 - smoothstep(0.72, 1.0, p)) * 0.40;
              env = 0.06 + smoothstep(0.0, 0.2, p) * (1 - smoothstep(0.75, 1.0, p)) * 0.38;
            } else if (w >= 0.64 && w < 0.94) {
              const p = (w - 0.64) / 0.30;
              expand   = smoothstep(0.0, 0.36, p) * (1 - smoothstep(0.40, 0.52, p)) * 1.05;
              contract = smoothstep(0.42, 0.53, p) * (1 - smoothstep(0.68, 0.96, p)) * 0.98;
              env = 0.06 + smoothstep(0.0, 0.16, p) * (1 - smoothstep(0.80, 1.0, p)) * 0.94;
            }
            return { expand, contract, env };
          }

          const rootJp = evalJellyPhase(uMacro);
          const gatherCurve = rootJp.expand;
          const thrustCurve = rootJp.contract;
          const activePulseWindow = (uMacro >= 0.38 && uMacro <= 0.48) || (uMacro >= 0.74 && uMacro <= 0.88);

          if (uMacro >= 0.40 && uMacro < 0.48 && !state.pulseTriggeredSmall) {
            state.pulseTriggeredSmall = true;
            liftImpulse.impulse(12.0 * sp * sMul);
          } else if (uMacro < 0.30) {
            state.pulseTriggeredSmall = false;
          }

          if (uMacro >= 0.77 && uMacro < 0.86 && !state.pulseTriggeredBig) {
            state.pulseTriggeredBig = true;
            liftImpulse.impulse(28.0 * sp * sMul);
            for (const bc of beardChains) {
              const dirYaw = state.yaw + bc.outAng;
              const [fx, fy] = localToWorldXY(0, 0, dirYaw, 0, -14.0 * bc.spreadMul * sMul);
              for (let j = 0; j < bc.nodes.length; j++) {
                const w = (j + 1) / bc.nodes.length;
                bc.nodes[j].impulse(fx * (0.3 + w * 0.7), fy * (0.3 + w * 0.7), -16.0 * w * sMul);
              }
            }
            if (vfx) {
              const draftCol = (curSkin.fx && curSkin.fx.draft) || '#b8f2dc';
              for (let k = 0; k < 5; k++) {
                const a = (k / 5) * TAU + Math.random() * 0.5;
                vfx.spawnParticle(
                  state.x + Math.cos(a) * 6.5 * sMul,
                  state.y + Math.sin(a) * 6.5 * sMul,
                  state.z + 1.0 * sMul,
                  Math.cos(a) * 12 * sMul, Math.sin(a) * 12 * sMul, -13.5 * sMul,
                  0.46, 1.20, draftCol, false, 0
                );
              }
            }
          } else if (uMacro < 0.64) {
            state.pulseTriggeredBig = false;
          }

          const puffVal = puffSpring.update(dt, gatherCurve, 74 * sp, clamp(7.2 * dScale, 3.2, 11.5));
          if (state.torsoMorph === 'normal' && puffVal > 0.48) state.torsoMorph = 'puff';
          else if (state.torsoMorph === 'puff' && puffVal < 0.28) state.torsoMorph = 'normal';

          const spreadTarget = gatherCurve * 1.35 - thrustCurve * 0.95;
          spreadSpring.update(dt, spreadTarget, 76 * sp, clamp(5.4 * dScale, 2.4, 9.5));
          const liftBoost = liftImpulse.update(dt, (thrustCurve * 6.8 - gatherCurve * 2.8) * sMul, 46 * sp, clamp(4.6 * dScale, 2.2, 8.8));

          // -----------------------------------------------------------------
          // 2. 巡游大弧线盘旋 / 原地脉冲悬停（静悬时安稳微浮，脉冲时优雅升沉）
          // -----------------------------------------------------------------
          const baseLift = 24.8 * sMul + clamp(liftBoost, -4.5 * sMul, 8.2 * sMul);
          if (patrol) {
            Propulsion.windDrift(state, dt, time, params, {
              ...eco,
              baseLift
            });
            // 巡游瞄准/轻啄期间轻微朝目标孢子偏航，实现「大弧线盘旋顺路追啄」
            if ((state.interactStage === 'aim' || state.interactStage === 'peck') && state.targetSporeIdx >= 0) {
              const tsp = spores[state.targetSporeIdx];
              if (tsp && tsp.mode === 'pulled') {
                const dxS = tsp.x - state.x, dyS = tsp.y - state.y;
                if (Math.hypot(dxS, dyS) > 2.0) {
                  const aimYaw = Math.atan2(-dxS, dyS);
                  state.yaw = wrapAngle(state.yaw + wrapAngle(aimYaw - state.yaw) * expSmooth(dt, 5.2));
                }
              }
            }
          } else {
            // 原地待机（S 键）：围绕中心点稳健脉冲悬停 + 轻柔微飘
            const hx = (eco && eco.homeX) || 0;
            const hy = (eco && eco.homeY) || 0;
            const driftX = hx + (fbm1(time * 0.36, 41) - 0.5) * 6.0 * sMul;
            const driftY = hy + (fbm1(time * 0.32, 97) - 0.5) * 6.0 * sMul;
            const kPos = expSmooth(dt, 3.8);
            const nx = lerp(state.x, driftX, kPos);
            const ny = lerp(state.y, driftY, kPos);
            state.vx = (nx - state.x) / Math.max(dt, 0.001);
            state.vy = (ny - state.y) / Math.max(dt, 0.001);
            state.x = nx; state.y = ny;
            state.z = lerp(state.z, baseLift, expSmooth(dt, 6.2));
            const baseYaw = ((eco && eco.homeYaw) || 0) + Math.sin(time * 0.55) * 0.28;
            state.yaw = wrapAngle(state.yaw + wrapAngle(baseYaw - state.yaw) * expSmooth(dt, 3.5));
          }

          // -----------------------------------------------------------------
          // 3. 空中菌伞孢子球交互循环：轨道漂浮 -> 气流卷近 -> 侧头瞄准 -> 前冲轻啄 -> 爆散 -> 远处重生
          // -----------------------------------------------------------------
          const [beakRestX, beakRestY] = localToWorldXY(state.x, state.y, state.yaw, 0, 12.6 * sMul);
          const beakRestZ = state.z + 12.8 * sMul;

          state.interactTimer -= dt;
          if (state.interactStage === 'idle') {
            state.headPose = 'normal';
            if (state.interactTimer <= 0 && activePulseWindow) {
              // 挑选距离鸟喙最近的在轨孢子球
              let bestIdx = -1, bestDist = 1e9;
              for (let i = 0; i < spores.length; i++) {
                if (spores[i].mode !== 'orbit') continue;
                const d = Math.hypot(spores[i].x - beakRestX, spores[i].y - beakRestY);
                if (d < bestDist) { bestDist = d; bestIdx = i; }
              }
              if (bestIdx >= 0) {
                state.targetSporeIdx = bestIdx;
                spores[bestIdx].mode = 'pulled';
                spores[bestIdx].timer = 0;
                state.interactStage = 'pull';
                state.interactTimer = 0.82;
                state.peckDidPop = false;
              }
            }
          } else if (state.interactStage === 'pull') {
            if (state.interactTimer <= 0) {
              state.interactStage = 'aim';
              state.interactTimer = 0.44;
            }
          } else if (state.interactStage === 'aim') {
            if (state.interactTimer <= 0) {
              state.interactStage = 'peck';
              state.interactTimer = 0.34;
              state.headPose = 'peck';
              lungeSpring.impulse(34.0 * sp);
            }
          } else if (state.interactStage === 'peck') {
            const tsp = spores[state.targetSporeIdx];
            if (!state.peckDidPop && state.interactTimer <= 0.16 && tsp) {
              state.peckDidPop = true;
              tsp.mode = 'popped';
              tsp.timer = 1.45 + Math.random() * 0.55;
              // 轻啄爆散彩色孢粉微粒
              if (vfx) {
                const capCol = getSporeColor(tsp.variant);
                const polCol = (curSkin.fx && curSkin.fx.pollen) || '#ffe57a';
                for (let k = 0; k < 10; k++) {
                  const a = (k / 10) * TAU + Math.random() * 0.4;
                  const spd = (8 + Math.random() * 14) * sMul;
                  const vz = (4 + Math.random() * 11) * sMul;
                  vfx.spawnParticle(
                    tsp.x, tsp.y, tsp.z,
                    Math.cos(a) * spd, Math.sin(a) * spd, vz,
                    0.55 + Math.random() * 0.35, 1.35 + Math.random() * 0.55,
                    k % 3 === 0 ? polCol : capCol, k % 2 === 0, 14
                  );
                }
              }
              liftImpulse.impulse(7.5 * sp * sMul);
            }
            if (state.interactTimer <= 0) {
              state.interactStage = 'recover';
              state.interactTimer = 0.55;
              state.headPose = 'normal';
            }
          } else if (state.interactStage === 'recover') {
            if (state.interactTimer <= 0) {
              state.interactStage = 'idle';
              state.interactTimer = 1.15;
              state.targetSporeIdx = -1;
            }
          }

          // 推进全部 4 颗孢子球的轨道、卷近与远处重生复位
          for (let i = 0; i < spores.length; i++) {
            const spItem = spores[i];
            spItem.orbitAng = wrapAngle(spItem.orbitAng + dt * spItem.speed * (0.7 + freq * 0.3));
            spItem.spin = wrapAngle(spItem.spin + dt * (spItem.mode === 'pulled' ? 2.4 : 0.75));

            if (spItem.mode === 'orbit') {
              const [ox, oy, oz] = computeOrbitPos(spItem, state.x, state.y, state.z, sMul, time);
              const k = expSmooth(dt, 4.2);
              spItem.x = lerp(spItem.x, ox, k);
              spItem.y = lerp(spItem.y, oy, k);
              spItem.z = lerp(spItem.z, oz, k);
            } else if (spItem.mode === 'pulled') {
              // 气流把目标孢子稳稳卷到鸟喙前方悬停（保持 14.5 格距离留出清晰啄击空隙不穿模）
              const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw, Math.sin(time * 5.0) * 1.1 * sMul, 14.5 * sMul);
              const tz = state.z + (12.8 + Math.sin(time * 4.5) * 0.8) * sMul;
              const k = expSmooth(dt, 5.4);
              spItem.x = lerp(spItem.x, tx, k);
              spItem.y = lerp(spItem.y, ty, k);
              spItem.z = lerp(spItem.z, tz, k);
            } else if (spItem.mode === 'popped') {
              spItem.timer -= dt;
              if (spItem.timer <= 0) {
                // 从外围云端远处自然飘来一颗新孢子
                spItem.mode = 'spawning';
                spItem.timer = 0;
                const enterAng = wrapAngle(state.yaw + Math.PI + (Math.random() - 0.5) * 1.8);
                spItem.orbitAng = enterAng;
                spItem.spawnStartX = state.x + Math.cos(enterAng) * 34 * sMul;
                spItem.spawnStartY = state.y + Math.sin(enterAng) * 34 * sMul;
                spItem.spawnStartZ = state.z + (16 + Math.random() * 6) * sMul;
                spItem.x = spItem.spawnStartX;
                spItem.y = spItem.spawnStartY;
                spItem.z = spItem.spawnStartZ;
              }
            } else if (spItem.mode === 'spawning') {
              spItem.timer += dt / 1.25;
              const [ox, oy, oz] = computeOrbitPos(spItem, state.x, state.y, state.z, sMul, time);
              const u = smoothstep(0, 1, clamp(spItem.timer, 0, 1));
              spItem.x = lerp(spItem.spawnStartX, ox, u);
              spItem.y = lerp(spItem.spawnStartY, oy, u);
              spItem.z = lerp(spItem.spawnStartZ, oz, u);
              if (spItem.timer >= 1) spItem.mode = 'orbit';
            }
          }

          // -----------------------------------------------------------------
          // 4. 头部瞄准转角、前冲轻啄位移、尾羽摆动
          // -----------------------------------------------------------------
          let targetHeadYaw = Math.sin(time * 1.35) * 0.22;
          if ((state.interactStage === 'pull' || state.interactStage === 'aim' || state.interactStage === 'peck') && state.targetSporeIdx >= 0) {
            const tsp = spores[state.targetSporeIdx];
            if (tsp && tsp.mode === 'pulled') {
              const dx = tsp.x - state.x, dy = tsp.y - state.y;
              const relYaw = wrapAngle(Math.atan2(-dx, dy) - state.yaw);
              targetHeadYaw = clamp(relYaw, -0.68, 0.68) + (state.interactStage === 'aim' ? 0.14 : 0);
            }
          }
          headYawSpring.update(dt, targetHeadYaw, 96 * sp, clamp(7.4 * dScale, 3.2, 12.0));

          const lungeTarget = state.interactStage === 'peck' ? 3.4 : (state.interactStage === 'aim' ? -0.9 : 0);
          lungeSpring.update(dt, lungeTarget, 130 * sp, clamp(8.0 * dScale, 3.6, 12.5));

          const tailTarget = (thrustCurve * 0.42 - gatherCurve * 0.28) + Math.sin(time * 3.0 * freq) * 0.16 * flex;
          tailSpring.update(dt, tailTarget, 76 * sp, clamp(6.0 * dScale, 2.8, 10.5));

          // -----------------------------------------------------------------
          // 5. 7 束纤细水母触须级联弹簧链（静悬自然垂顺 -> 轻柔小波 -> 偶发大幅张伞抽拉 -> 渐息回静）
          // -----------------------------------------------------------------
          const moveSpd = Math.hypot(state.vx, state.vy);
          const moveBoost = clamp(moveSpd / 22, 0, 0.65);
          for (const bc of beardChains) {
            const [ax, ay] = localToWorldXY(state.x, state.y, state.yaw, bc.lx * sMul, bc.ly * sMul);
            let px = ax, py = ay, pz = state.z + bc.lz * sMul;
            const dirYaw = state.yaw + bc.outAng;

            for (let j = 0; j < bc.nodes.length; j++) {
              const nd = bc.nodes[j];
              const u = (j + 1) / bc.nodes.length;

              // 沿触须向末梢传播的宏观节律相位（延迟 ~0.075 宏观周期 ≈ 0.57s 滚到鞭梢）
              const locJp = evalJellyPhase(uMacro - u * 0.075);
              const localBell = locJp.expand * 1.18 - locJp.contract * 0.85;
              // 动静包络：静止期 env=0.06（自然垂顺微飘），轻脉冲 0.44，大脉冲 1.00！
              const waveEnv = Math.min(1.15, locJp.env + moveBoost * 0.45);

              // 静悬时仅保留极微弱的自然丝带垂弧；小/大脉冲时顺滑荡开柔和触须波
              const idleArch = (j < 2 ? 0.18 : 0.05) * sMul;
              const radialWave = idleArch + (
                localBell * (0.48 + u * 0.52) * bc.spreadMul +
                Math.sin(time * 2.5 * freq - j * 0.68 + bc.phase) * (0.12 + u * 0.48) * waveEnv * flex
              ) * sMul;
              const tangWave = Math.cos(time * 2.1 * freq - j * 0.75 + bc.phase) * (0.08 + u * 0.62) * waveEnv * flex * sMul;
              const [wOffX, wOffY] = localToWorldXY(0, 0, dirYaw, tangWave, radialWave);

              // 飞行惯性拖尾
              const dragX = -state.vx * (0.022 + u * 0.036);
              const dragY = -state.vy * (0.022 + u * 0.036);

              // 等弧长垂距：静止时修长垂直垂坠，大脉冲张开时轻盈上卷，始终像柔软水母触须
              const segLen = 1.72 * sMul;
              const horizTarget = Math.min(1.08 * sMul, Math.hypot(wOffX + dragX, wOffY + dragY));
              const arcDrop = Math.sqrt(Math.max(0.55 * sMul * sMul, segLen * segLen - horizTarget * horizTarget));
              const tx = px + wOffX + dragX;
              const ty = py + wOffY + dragY;
              const tz = Math.max(1.2 * sMul, pz - arcDrop);

              nd.update(dt, tx, ty, tz, nd.stiffness * sp, clamp(nd.damping * dScale, 2.2, 10.5));

              // 纤细触须等弧长防断节约束（匹配 0.90->0.42 细须半径，弯而不折、绝不断节）
              const hdx = nd.x - px, hdy = nd.y - py;
              const hDist = Math.hypot(hdx, hdy);
              const maxHoriz = (1.06 - u * 0.16) * sMul;
              if (hDist > maxHoriz) {
                const k = maxHoriz / hDist;
                nd.x = px + hdx * k;
                nd.y = py + hdy * k;
              }
              const curH = Math.min(hDist, maxHoriz);
              const idealDrop = Math.sqrt(Math.max(0.50 * sMul * sMul, (1.80 * sMul) * (1.80 * sMul) - curH * curH));
              const vGap = pz - nd.z;
              if (vGap > idealDrop + 0.22 * sMul) nd.z = pz - (idealDrop + 0.22 * sMul);
              if (vGap < Math.max(0.65 * sMul, idealDrop - 0.28 * sMul)) nd.z = pz - Math.max(0.65 * sMul, idealDrop - 0.28 * sMul);

              px = nd.x; py = nd.y; pz = nd.z;
            }
          }

          sockets.setLocal('beak', state.x, state.y, state.z, state.yaw, 0, 10.2 + lungeSpring.x, 12.6, sMul);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const lunge = clamp(lungeSpring.x, -1.6, 4.2) * sMul;
          const [bx, by] = localToWorldXY(state.x, state.y, yw, 0, lunge * 0.45);
          const bz = state.z;

          // 1. 7 束连贯纤细水母长须（内短 6 节、外长 8 节，平滑渐变色阶，丝滑不断节）
          const segKeys = ['beard0', 'beard1', 'beard2', 'beard3', 'beard4', 'beard5'];
          for (const bc of beardChains) {
            const n = bc.nodes.length;
            for (let j = 0; j < n; j++) {
              const nd = bc.nodes[j];
              const kIdx = Math.min(segKeys.length - 1, Math.floor((j / Math.max(1, n - 1)) * (segKeys.length - 1) + 0.001));
              list.push({
                partKey: segKeys[kIdx],
                asset: parts[segKeys[kIdx]],
                x: nd.x,
                y: nd.y,
                lift: Math.max(0.5, nd.z - 1.9 * sMul),
                ro: yw,
                symDeg: 90,
                bias: -0.35 - j * 0.03
              });
            }
          }

          // 2. 独立尾羽（pivotToWorldXY 锁死尾根枢轴）
          const tailYaw = wrapAngle(yw + tailSpring.x * 0.48);
          const [tjx, tjy] = localToWorldXY(bx, by, yw, 0, -6.4 * sMul);
          const [tx, ty] = pivotToWorldXY(tjx, tjy, tailYaw, TAIL_PIVOT.x * sMul, TAIL_PIVOT.y * sMul);
          list.push({
            partKey: 'tailPlume',
            asset: parts.tailPlume,
            x: tx,
            y: ty,
            lift: bz + (5.8 + tailSpring.x * 1.8) * sMul,
            ro: tailYaw,
            bias: -0.15
          });

          // 3. 饱满无翼雀鸟主躯干（2 档无损烘焙，零小数缩放）
          const tKey = state.torsoMorph === 'puff' ? 'torsoPuff' : 'torsoNormal';
          list.push({
            partKey: tKey,
            asset: parts[tKey],
            x: bx,
            y: by,
            lift: bz,
            ro: yw,
            bias: 0.25
          });

          // 4. 独立头部（pivotToWorldXY 锁死后颈枢轴 + 轻啄前伸）
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.72, 0.72));
          const [hjx, hjy] = localToWorldXY(bx, by, yw, 0, (4.8 + lunge * 0.55) * sMul);
          const [hx, hy] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const hKey = state.headPose === 'peck' ? 'headPeck' : 'headNormal';
          list.push({
            partKey: hKey,
            asset: parts[hKey],
            x: hx,
            y: hy,
            lift: bz + (8.4 - Math.max(0, lunge) * 0.18) * sMul,
            ro: hYaw,
            bias: 0.75
          });

          // 5. 待机交互物：4 颗空中飘浮菌伞孢子球（非 popped 状态即立体呈现）
          for (let i = 0; i < spores.length; i++) {
            const spItem = spores[i];
            if (spItem.mode === 'popped') continue;
            list.push({
              partKey: spItem.partKey,
              asset: parts[spItem.partKey],
              x: spItem.x,
              y: spItem.y,
              lift: Math.max(2.0, spItem.z - 4.2 * sMul),
              ro: spItem.spin,
              symDeg: 90,
              bias: 0.40
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sky1Def.id,
            name: Sky1Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            torsoMorph: state.torsoMorph,
            headPose: state.headPose,
            interactStage: state.interactStage,
            beardCount: BEARD_LAYOUT.length,
            sporeCount: SPORE_ORBITS.length,
            footRadius: Sky1Def.footRadius,
            headZ: 24,
            centerZ: 14,
            blocks: Sky1Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Sky1Def);
})(window.PixelWorkshop);
