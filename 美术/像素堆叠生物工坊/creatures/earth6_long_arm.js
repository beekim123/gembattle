'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i, fbm1 } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 地6 · 摇树的长臂（M25 长臂撑着走 · 标杆精制版，+Y 正前，z=0 贴地）
  //
  // 【骨骼联动与比例预算（全件 ≤ 34 格，单怪 31 色、0 重色、0 拉伸）】
  //   - pouchBody      (14×12×13)：无头圆鼓皮囊躯干，高对比冷暖分色 + 浅色肚纹与顶袋口
  //   - shoulderEye    (6×6×6 ×2)：双肩顶独立放大亮眼（无独立脑袋），俯视零遮挡、可独立张望
  //   - hindLeg        (6×7×7 ×2)：极短后腿，随秋千摆动前后收放并轻点落地
  //   - armUpper / armUpperLevel (11×16×12 / 11×16×10)：分节木壳上臂（XY 精确 L1=10.8）
  //   - armFore  / armForeLevel  (10×17×14 / 10×17×10)：分节木壳前臂（XY 精确 L2=11.6）
  //   - hookHand       (13×13×9 ×2)：亮象牙/暗金三钩巨掌（腕至钩尖 L3=7.4），锁腕枢轴
  //     → 单臂总展长 29.8 格 vs 躯干长 11.5 格 = 2.59 倍（严格落在 2.5~3.0 倍区间）
  //     → 2D 平面严格二骨 IK + 3 档纵坡分件：肩/肘/腕 XY 误差恒为 0.00 格，Z 咬合误差 ≤ 1.3 格
  //   - treeTrunk      (14×14×22)：自带局部果树干，摇树时同步受弹簧力矩剧烈晃动
  //   - treeCanopy     (24×24×11)：果树冠叶，滞后于树干猛晃
  //   - treeFruit      (5×5×5)：鲜红熟果（挂枝 + 落果池，摇树时噼里啪啦震落一地）
  // =========================================================================

  // 31 色高对比色表（严守 ≤ 48 色、0 重色，eyeGlint 严禁进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 超长木壳双臂：暖赭橙主壳 + 浅木纹亮脊 + 深木节环（与林地深绿强对比）
      woodDark:   '#783010',
      woodMid:    '#c95c1e',
      woodHi:     '#f59b3d',
      ridgeDark:  '#b87a38',
      ridgeMid:   '#e8b668',
      ridgeHi:    '#ffe5a8',
      ringDark:   '#401809',
      ringMid:    '#632710',
      ringHi:     '#8f3f1d',
      // 夸大张开的三钩巨掌：亮象牙 / 暗金
      hookDark:   '#9e7f3a',
      hookMid:    '#dec06d',
      hookHi:     '#fff3c7',
      // 无头口袋躯干：深靛蓝皮囊 + 浅色肚纹（与暖赭木臂强分色）
      pouchDark:  '#1c2a4d',
      pouchMid:   '#314b85',
      pouchHi:    '#577bbd',
      stripeDark: '#7b93ba',
      stripeMid:  '#b6cae6',
      stripeHi:   '#eaf2fc',
      // 双肩大亮眼（无模糊辉晕，白点不进 glowKeys）
      eyeDark:    '#120d17',
      eyeIris:    '#f5a818',
      eyeBright:  '#ffe36e',
      eyeGlint:   '#ffffff',
      // 自带局部果树：树皮、深浅叶冠、鲜红熟果
      barkDark:   '#38261a',
      barkMid:    '#5e412c',
      barkHi:     '#876143',
      leafDark:   '#1e4f28',
      leafMid:    '#36803c',
      leafHi:     '#68b851',
      fruitDark:  '#8f141e',
      fruitMid:   '#e3242b',
      fruitHi:    '#ff7a6b'
    },
    glowKeys: [],
    parts: [
      'pouch', 'stripe', 'eye', 'wood', 'ridge', 'ring', 'hook',
      'leg', 'bark', 'leaf', 'fruit'
    ],
    noCrease: [
      ['pouch', 'stripe'], ['pouch', 'eye'], ['wood', 'ridge'], ['wood', 'ring'],
      ['hook', 'ring'], ['bark', 'leaf'], ['leaf', 'fruit']
    ],
    materials: {
      wood:   ['woodDark',   'woodMid',   'woodHi'],
      ridge:  ['ridgeDark',  'ridgeMid',  'ridgeHi'],
      ring:   ['ringDark',   'ringMid',   'ringHi'],
      hook:   ['hookDark',   'hookMid',   'hookHi'],
      pouch:  ['pouchDark',  'pouchMid',  'pouchHi'],
      stripe: ['stripeDark', 'stripeMid', 'stripeHi'],
      bark:   ['barkDark',   'barkMid',   'barkHi'],
      leaf:   ['leafDark',   'leafMid',   'leafHi'],
      fruit:  ['fruitDark',  'fruitMid',  'fruitHi']
    },
    protectedParts: ['eye', 'hook', 'fruit']
  });

  // 3 套零重建模换色皮肤（每套保证 0 重色、高俯视辨识度）
  const SKINS = [
    {
      id: 'ochre_indigo',
      name: '赭木靛囊（林地经典）',
      dot: '#c95c1e',
      outline: '#120e14',
      pal: {},
      fx: { fruit: '#e3242b', fruitHi: '#ff7a6b', leaf: '#5ca844', dust: '#a88358' }
    },
    {
      id: 'birch_crimson',
      name: '白桦绛囊（亮纹对比）',
      dot: '#b82c42',
      outline: '#171014',
      pal: {
        woodDark:   '#8f8373', woodMid:   '#c9bfb0', woodHi:   '#f2ece0',
        ridgeDark:  '#594d42', ridgeMid:  '#877768', ridgeHi:  '#b8a898',
        ringDark:   '#2e2824', ringMid:   '#4d433d', ringHi:   '#70635b',
        hookDark:   '#a36c24', hookMid:   '#de9c3a', hookHi:   '#ffd978',
        pouchDark:  '#5e1424', pouchMid:  '#a3223a', pouchHi:  '#de4e64',
        stripeDark: '#b36b78', stripeMid: '#e3a8b0', stripeHi: '#fae3e6',
        eyeIris:    '#7cd624', eyeBright: '#d4ff6e'
      },
      fx: { fruit: '#e3242b', fruitHi: '#ff7a6b', leaf: '#62b349', dust: '#c2b097' }
    },
    {
      id: 'moss_amber',
      name: '苔岩琥珀囊（古林深木）',
      dot: '#d98a1e',
      outline: '#0e1412',
      pal: {
        woodDark:   '#36544e', woodMid:   '#59857c', woodHi:   '#8fbfb4',
        ridgeDark:  '#6b8f68', ridgeMid:  '#9ec493', ridgeHi:  '#d5f0c7',
        ringDark:   '#223632', ringMid:   '#3a5751', ringHi:   '#577d75',
        hookDark:   '#948e7d', hookMid:   '#cfc8b6', hookHi:   '#f7f3e8',
        pouchDark:  '#783f0c', pouchMid:  '#bf6b17', pouchHi:  '#f2a335',
        stripeDark: '#b58438', stripeMid: '#e6bd6c', stripeHi: '#fff0bd',
        eyeIris:    '#1ec9b8', eyeBright: '#85fff0'
      },
      fx: { fruit: '#e3242b', fruitHi: '#ff7a6b', leaf: '#5ca844', dust: '#8a9e8c' }
    }
  ];

  // =========================================================================
  // 精确骨骼常数（体素建模坐标与 IK 解算共享同一份真源，严防关节脱节）
  // =========================================================================
  const UPPER_PIVOT = { x: 0, y: -5.4 };
  const FORE_PIVOT  = { x: 0, y: -5.8 };
  const HOOK_PIVOT  = { x: 0, y: -4.2 };

  const ARM_L1 = 10.8; // 肩球心 -> 肘球心 精确水平距
  const ARM_L2 = 11.6; // 肘球心 -> 腕球心 精确水平距
  const ARM_L3 = 7.4;  // 腕球心 -> 三钩掌尖展长；总长 29.8 vs 躯干 11.5 = 2.59×

  // 各姿态分件内部关节 Z 坐标（用于无损 Z 连续拼合）
  const UPPER_DOWN_Z0 = 8.6, UPPER_DOWN_Z1 = 3.8; // 下斜撑地用：落差 4.8 格
  const UPPER_LVL_Z0  = 5.6, UPPER_LVL_Z1  = 4.4; // 平举抱树用：落差 1.2 格
  const FORE_DOWN_Z0  = 9.8, FORE_DOWN_Z1  = 3.4; // 下斜撑地用：落差 6.4 格
  const FORE_LVL_Z0   = 5.6, FORE_LVL_Z1   = 4.1; // 平举抱树用：落差 1.5 格
  const HOOK_WRIST_Z  = 3.6;

  // =========================================================================
  // 1. 无头短小口袋躯干（pouchBody：14×12×13）
  // =========================================================================
  function buildPouchBody(makeCanvas) {
    const W = 14, D = 12, H = 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.5, 6.5, -5.5, 5.5, 0, H - 1, (x, y, z, X, Y) => {
      const t = z / (H - 1);
      const rx = 5.4 + Math.sin(t * Math.PI) * 1.1 - smoothstep(0.72, 1.0, t) * 1.1;
      const ry = 4.6 + Math.sin(t * Math.PI) * 0.9 - smoothstep(0.72, 1.0, t) * 1.0;
      const d = Math.hypot(X / rx, Y / ry, (z - 5.8) / 5.9);
      if (d > 1.0) return;

      // 顶部中央浅凹口袋口
      if (z >= 10 && Math.hypot(X / 2.2, Y / 2.0) < 1.0) return;

      const isBellyStripe = Y > 1.8 && Math.abs(X) <= 3.1 && z >= 2 && z <= 9;
      const isRim = z >= 9 && Math.hypot(X / 3.4, Y / 3.0) <= 1.05;
      if (isBellyStripe || isRim) {
        m.setRaw(x, y, z, mat('stripe'), partId.stripe);
      } else {
        m.setRaw(x, y, z, mat('pouch'), partId.pouch);
      }
    });

    // 左右双肩厚木质承托球座（中心约 x=±5.4, y=0.9, z=7.4，与上臂肩球严格同心咬合）
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 5.2, 0.9, 7.4, 2.3, 2.4, 2.5, mat('ring'), partId.ring, true);
      m.paintEllipsoid(s * 5.0, 1.0, 9.2, 1.9, 2.0, 1.4, mat('wood'), partId.wood, true);
    }

    // 背部两条加固木肋带
    m.paintCapsule(-2.6, -4.4, 3.0, -3.4, -3.6, 9.2, 1.15, 0.95, mat('ridge'), partId.ridge, true);
    m.paintCapsule( 2.6, -4.4, 3.0,  3.4, -3.6, 9.2, 1.15, 0.95, mat('ridge'), partId.ridge, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.2, headZ: 12, centerZ: 6 });
  }

  // =========================================================================
  // 2. 双肩放大亮眼（shoulderEye：6×6×6，左右肩顶各一只，独立转向张望）
  // =========================================================================
  function buildShoulderEye(makeCanvas) {
    const W = 6, D = 6, H = 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.paintEllipsoid(0, -0.3, 2.4, 2.4, 2.3, 2.2, mat('ring'), partId.ring, true);
    m.paintEllipsoid(0,  0.4, 3.2, 2.0, 2.0, 1.9, keyToId.eyeIris, partId.eye, true);

    m.despeckle();
    m.applyArtShading(false);

    const cx = 2, cy = 4, cz = 3;
    for (let x = 1; x <= 4; x++) {
      for (let y = 2; y <= 4; y++) {
        m.setRaw(x, y, 4, keyToId.eyeBright, partId.eye);
      }
    }
    m.setRaw(cx, cy, cz, keyToId.eyeDark, partId.eye);
    m.setRaw(cx + 1, cy, cz, keyToId.eyeDark, partId.eye);
    m.setRaw(cx, cy, cz + 1, keyToId.eyeDark, partId.eye);
    m.setRaw(cx + 1, cy, cz + 1, keyToId.eyeGlint, partId.eye);
    m.setRaw(cx, cy - 1, 4, keyToId.eyeDark, partId.eye);
    m.setRaw(cx + 1, cy - 1, 4, keyToId.eyeGlint, partId.eye);

    return m.toStripAsset(makeCanvas, { footRadius: 2.5, headZ: 5, centerZ: 3 });
  }

  // =========================================================================
  // 3. 极短后腿（hindLeg：6×7×7）
  // =========================================================================
  function buildHindLeg(makeCanvas) {
    const m = new VoxelModel(6, 7, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -0.6, 5.4, 0, 0.5, 1.5, 1.95, 1.55, mat('pouch'), partId.pouch, true);
    m.paintEllipsoid(0, 1.2, 1.2, 1.85, 2.2, 1.1, mat('ring'), partId.ring, true);
    m.paintCapsule(-1.0, 2.2, 1.0, -1.1, 3.0, 0.8, 0.65, 0.45, mat('hook'), partId.hook, true);
    m.paintCapsule( 1.0, 2.2, 1.0,  1.1, 3.0, 0.8, 0.65, 0.45, mat('hook'), partId.hook, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 4. 超长木壳上臂（下斜撑地版 11×16×12 / 平举抱树版 11×16×10）
  //    肩球精确在 (0, py, z0)，肘球精确在 (0, py + ARM_L1, z1)，全坡度无缝咬合
  // =========================================================================
  function buildArmUpper(makeCanvas, isLevel) {
    const W = 11, D = 16, H = isLevel ? 10 : 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const py = UPPER_PIVOT.y;
    const y0 = py;
    const y1 = py + ARM_L1;
    const yMid = (y0 + y1) * 0.5;
    const z0 = isLevel ? UPPER_LVL_Z0 : UPPER_DOWN_Z0;
    const z1 = isLevel ? UPPER_LVL_Z1 : UPPER_DOWN_Z1;
    const zMid = (z0 + z1) * 0.5 + 0.3;

    // 肩端球节 + 肘端球节（半径 2.9 保证任意倾角 100% 咬合无裂隙）
    m.paintEllipsoid(0, y0, z0, 2.95, 2.95, 2.85, mat('ring'), partId.ring, true);
    m.paintCapsule(0, y0, z0, 0, yMid, zMid, 3.05, 2.85, mat('wood'), partId.wood, true);
    m.paintCapsule(0, yMid, zMid, 0, y1, z1, 2.85, 2.75, mat('wood'), partId.wood, true);
    // 中段深木节环箍 + 肘端木球
    m.paintEllipsoid(0, yMid, zMid, 3.25, 1.4, 3.05, mat('ring'), partId.ring, true);
    m.paintEllipsoid(0, y1, z1, 2.85, 2.85, 2.75, mat('ring'), partId.ring, true);
    // 顶部浅木纹亮脊（随斜度连贯延伸）
    m.paintCapsule(0, y0 + 1.2, z0 + 2.1, 0, y1 - 1.0, z1 + 2.2, 1.55, 1.35, mat('ridge'), partId.ridge, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: H - 1, centerZ: Math.round(H * 0.5) });
  }

  // =========================================================================
  // 5. 超长木壳前臂（下斜撑地版 10×17×14 / 平举抱树版 10×17×10）
  //    肘球精确在 (0, py, z0)，腕球精确在 (0, py + ARM_L2, z1)
  // =========================================================================
  function buildArmFore(makeCanvas, isLevel) {
    const W = 10, D = 17, H = isLevel ? 10 : 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const py = FORE_PIVOT.y;
    const y0 = py;
    const y1 = py + ARM_L2;
    const z0 = isLevel ? FORE_LVL_Z0 : FORE_DOWN_Z0;
    const z1 = isLevel ? FORE_LVL_Z1 : FORE_DOWN_Z1;
    const yA = lerp(y0, y1, 0.36), zA = lerp(z0, z1, 0.36);
    const yB = lerp(y0, y1, 0.72), zB = lerp(z0, z1, 0.72);

    // 肘端咬合球节
    m.paintEllipsoid(0, y0, z0, 2.80, 2.80, 2.75, mat('ring'), partId.ring, true);
    // 两段斜向厚实木壳前臂
    m.paintCapsule(0, y0, z0, 0, lerp(y0, y1, 0.5), lerp(z0, z1, 0.5), 2.80, 2.55, mat('wood'), partId.wood, true);
    m.paintCapsule(0, lerp(y0, y1, 0.5), lerp(z0, z1, 0.5), 0, y1, z1, 2.60, 2.75, mat('wood'), partId.wood, true);
    // 双道木环箍 + 腕端球节
    m.paintEllipsoid(0, yA, zA, 3.00, 1.30, 2.85, mat('ring'), partId.ring, true);
    m.paintEllipsoid(0, yB, zB, 3.00, 1.30, 2.85, mat('ring'), partId.ring, true);
    m.paintEllipsoid(0, y1, z1, 2.70, 2.70, 2.60, mat('ring'), partId.ring, true);
    // 顶部浅木纹亮脊
    m.paintCapsule(0, y0 + 1.2, z0 + 2.0, 0, y1 - 1.0, z1 + 2.0, 1.45, 1.35, mat('ridge'), partId.ridge, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.8, headZ: H - 1, centerZ: Math.round(H * 0.5) });
  }

  // =========================================================================
  // 6. 夸大张开的三钩巨掌（hookHand：13×13×9，腕球精确在 (0, -4.2, 3.6)）
  // =========================================================================
  function buildHookHand(makeCanvas) {
    const W = 13, D = 13, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const py = HOOK_PIVOT.y;

    // 腕球与宽掌背（精确以 (0, py, HOOK_WRIST_Z) 为旋转中心）
    m.paintEllipsoid(0, py, HOOK_WRIST_Z, 2.75, 2.75, 2.60, mat('ring'), partId.ring, true);
    m.paintEllipsoid(0, py + 2.8, 3.6, 3.55, 2.6, 2.25, mat('wood'), partId.wood, true);
    m.paintEllipsoid(0, py + 2.6, 5.4, 2.45, 1.75, 1.05, mat('ridge'), partId.ridge, true);

    // 三根夸大张开的亮象牙/暗金弯钩
    m.paintCapsule( 0.0, py + 4.0, 4.0,  0.0, py + 7.4, 3.5, 1.30, 1.05, mat('hook'), partId.hook, true);
    m.paintCapsule( 0.0, py + 7.4, 3.5,  0.0, py + 9.2, 1.1, 1.02, 0.68, mat('hook'), partId.hook, true);
    m.paintCapsule(-2.2, py + 3.4, 3.8, -4.6, py + 6.2, 3.1, 1.25, 0.98, mat('hook'), partId.hook, true);
    m.paintCapsule(-4.6, py + 6.2, 3.1, -5.1, py + 7.8, 1.0, 0.95, 0.65, mat('hook'), partId.hook, true);
    m.paintCapsule( 2.2, py + 3.4, 3.8,  4.6, py + 6.2, 3.1, 1.25, 0.98, mat('hook'), partId.hook, true);
    m.paintCapsule( 4.6, py + 6.2, 3.1,  5.1, py + 7.8, 1.0, 0.95, 0.65, mat('hook'), partId.hook, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.6, headZ: 8, centerZ: 4 });
  }

  // =========================================================================
  // 7. 自带局部果树道具件：树干（14×14×22）+ 树冠枝（24×24×11）+ 鲜红熟果（5×5×5）
  // =========================================================================
  function buildTreeTrunk(makeCanvas) {
    const W = 14, D = 14, H = 22;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI * 0.5) + 0.4;
      m.paintCapsule(0, 0, 3.0, Math.cos(a) * 5.6, Math.sin(a) * 5.6, 0.9, 1.9, 0.95, mat('bark'), partId.bark, true);
    }
    m.fillAABB(-5.5, 5.5, -5.5, 5.5, 0, H - 3, (x, y, z, X, Y) => {
      const t = z / (H - 3);
      const cx = Math.sin(t * Math.PI) * 0.65;
      const r = lerp(3.4, 2.3, t) + smoothstep(0.75, 1.0, t) * 0.6;
      if (Math.hypot(X - cx, Y) <= r) m.setRaw(x, y, z, mat('bark'), partId.bark);
    });
    for (let i = 0; i < 3; i++) {
      const a = i * (TAU / 3) + 0.25;
      m.paintCapsule(0, 0, 16.5, Math.cos(a) * 4.8, Math.sin(a) * 4.8, 20.5, 1.65, 1.05, mat('bark'), partId.bark, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 21, centerZ: 10 });
  }

  function buildTreeCanopy(makeCanvas) {
    const W = 24, D = 24, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    const puffs = [
      [ 0.0,  0.0, 5.2, 8.0, 7.8, 4.4],
      [-5.6,  2.8, 4.2, 5.2, 5.0, 3.4],
      [ 5.6,  2.6, 4.4, 5.2, 5.0, 3.4],
      [-4.6, -4.8, 4.0, 5.0, 5.0, 3.3],
      [ 4.8, -4.6, 4.2, 5.0, 5.0, 3.3],
      [ 0.0,  5.6, 4.4, 5.2, 4.6, 3.3],
      [ 0.2,  0.4, 7.4, 5.6, 5.4, 2.9]
    ];

    m.fillAABB(-11.5, 11.5, -11.5, 11.5, 0, H - 1, (x, y, z, X, Y) => {
      let best = 99;
      for (let i = 0; i < puffs.length; i++) {
        const [px, py, pz, rx, ry, rz] = puffs[i];
        const d = (Math.hypot((X - px) / rx, (Y - py) / ry, (z - pz) / rz) - 1.0) * Math.min(rx, ry, rz);
        if (d < best) best = d;
      }
      if (best <= Math.sin(X * 0.72 + Y * 0.62) * 0.42) {
        m.setRaw(x, y, z, mat('leaf'), partId.leaf);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.5, headZ: 10, centerZ: 5 });
  }

  function buildTreeFruit(makeCanvas) {
    const m = new VoxelModel(5, 5, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 2.0, 1.9, 1.9, 1.85, mat('fruit'), partId.fruit, true);
    m.setRaw(2, 2, 4, mat('leaf'), partId.leaf);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0, headZ: 4, centerZ: 2 });
  }

  // =========================================================================
  // 精确 2D 水平面二骨 IK（专为 2.5D 像素堆叠打造：保证肩->肘->腕 XY 零脱节！）
  //   - 自动将腕点钳制在合法臂展环 [minD, maxD] 内；
  //   - 肘部法向恒朝躯干外侧（sideSign * right），绝不内折穿躯干或发生 180° 翻转奇点！
  // =========================================================================
  function solveLongArmXYIK(sx, sy, wxTarget, wyTarget, bodyYaw, sideSign, L1, L2, sMul) {
    let dx = wxTarget - sx;
    let dy = wyTarget - sy;
    let rawD = Math.hypot(dx, dy);
    const outX = Math.cos(bodyYaw) * sideSign;
    const outY = Math.sin(bodyYaw) * sideSign;
    if (rawD < 0.001) {
      dx = outX;
      dy = outY;
      rawD = 1;
    }

    const minD = Math.abs(L1 - L2) + 2.8 * sMul;
    const maxD = (L1 + L2) - 0.30 * sMul;
    const d = clamp(rawD, minD, maxD);
    const ux = dx / rawD;
    const uy = dy / rawD;

    // 钳制后的精确腕点（确保 dist(shoulder, wrist) 恒在 [minD, maxD]，三段永不脱节）
    const wx = sx + ux * d;
    const wy = sy + uy * d;

    const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));

    // 取垂直于肩-腕连线且朝向躯干外侧的单位向量，杜绝肘部穿身与翻转
    let px = uy;
    let py = -ux;
    if (px * outX + py * outY < 0) {
      px = -px;
      py = -py;
    }

    const ex = sx + (ux * cosA + px * sinA) * L1;
    const ey = sy + (uy * cosA + py * sinA) * L1;
    return { ex, ey, wx, wy };
  }

  // 挂在树冠外沿的 5 颗鲜红熟果局部偏移
  const HANGING_FRUITS_CFG = [
    { lx: -6.8, ly:  5.2, lz: 19.6 },
    { lx:  6.4, ly:  5.6, lz: 20.2 },
    { lx: -7.2, ly: -3.8, lz: 19.2 },
    { lx:  7.0, ly: -3.4, lz: 19.8 },
    { lx:  0.4, ly:  7.4, lz: 20.4 }
  ];

  // =========================================================================
  // Def 注册对象（code: '地6', name: '摇树的长臂'，不重复前缀）
  // =========================================================================
  const Earth6Def = {
    id: 'earth6_long_arm',
    code: '地6',
    name: '摇树的长臂',
    status: 'done',
    tag: 'M25 长臂撑着走 · 抱树摇果',
    summary: 'M25 标杆：超长分节木壳双前臂（臂长/躯干 = 2.59×，2D 严格二骨 IK + 双纵坡无损衔接）配亮象牙三钩巨掌、无头靛蓝皮囊躯干与双肩放大亮眼；撑杖秋千步态巡游，抱自带小果树猛摇震落熟果雨再弯身捡果入囊',
    defaultHabitat: 'forest',
    footRadius: 11.5,
    ecoWeight: 1.6,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol',         name: '撑臂巡游摇果', loop: true,  status: 'done' },
      { id: 'idle',           name: '拄地张望',     loop: true,  status: 'done' },
      { id: 'shake',          name: '抱树猛摇果雨', loop: true,  status: 'done' },
      { id: 'battle_attack',  name: '甩果猛击',     loop: false, duration: 0.90, status: 'done' },
      { id: 'battle_special', name: '集色威压',     loop: false, duration: 0.85, status: 'done' },
      { id: 'battle_stagger', name: '破盾硬直',     loop: false, duration: 0.85, status: 'done' },
      { id: 'battle_hurt',    name: '受击',         loop: false, duration: 0.35, status: 'done' }
    ],
    blocks: [
      '超长三段木壳前臂严格锁枢轴 IK', '撑杖秋千步态相位解算',
      '无头皮囊躯干与双肩张望亮眼', '自带弹簧小果树与熟果雨粒子', '弯身三钩掌捡果入囊'
    ],
    soulHabit: '双长臂同步前探撑地 → 短小皮囊身与短腿像荡秋千般大幅甩过双臂中线 → 走到小果树旁合抱树干高速猛摇震落一地鲜红熟果 → 弯身用三钩巨掌捡果塞进顶口皮囊',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        pouchBody:     buildPouchBody(makeCanvas),
        shoulderEye:   buildShoulderEye(makeCanvas),
        hindLeg:       buildHindLeg(makeCanvas),
        armUpper:      buildArmUpper(makeCanvas, false),
        armUpperLevel: buildArmUpper(makeCanvas, true),
        armFore:       buildArmFore(makeCanvas, false),
        armForeLevel:  buildArmFore(makeCanvas, true),
        hookHand:      buildHookHand(makeCanvas),
        treeTrunk:     buildTreeTrunk(makeCanvas),
        treeCanopy:    buildTreeCanopy(makeCanvas),
        treeFruit:     buildTreeFruit(makeCanvas)
      };

      const homeX0 = opts.homeX ?? -10;
      const homeY0 = opts.homeY ?? 6;
      const homeYaw0 = opts.homeYaw ?? 0.4;

      const treeShakeX = new SpringDamper1D(0, 140, 6.2);
      const treeShakeY = new SpringDamper1D(0, 140, 6.2);
      const treeCanopyLagX = new SpringDamper1D(0, 75, 4.6);
      const treeCanopyLagY = new SpringDamper1D(0, 75, 4.6);
      const eyeLookSpring = new SpringDamper1D(0, 48, 6.4);
      const bodyBounce = new SpringDamper1D(0, 130, 8.2);
      const pouchRoll = new SpringDamper1D(0, 75, 7.0);

      // 左右手腕世界坐标（作为 IK 末端真源，彻底杜绝腕与前臂错位）
      const hands = [
        { side: -1, x: 0, y: 0, z: 0, sx: 0, sy: 0, tx: 0, ty: 0, planted: true, yaw: 0 },
        { side:  1, x: 0, y: 0, z: 0, sx: 0, sy: 0, tx: 0, ty: 0, planted: true, yaw: 0 }
      ];

      const hangingFruits = HANGING_FRUITS_CFG.map((cfg, idx) => ({
        idx, cfg, intact: true, regrowTimer: 0
      }));
      const fallenFruits = Array.from({ length: 6 }, () => ({
        active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, picked: false
      }));

      const state = {
        x: homeX0,
        y: homeY0,
        z: 7.4,
        vx: 0,
        vy: 0,
        yaw: homeYaw0,
        seed: opts.seed ?? 61,
        mode: 'roam',
        modeTimer: 0,
        roamWaypoints: 0,
        navX: homeX0 + 10,
        navY: homeY0 - 8,
        navSeq: 1,
        crutchPhase: 0,
        prevCrutchPhase: 0,
        swingStartX: homeX0,
        swingStartY: homeY0,
        swingEndX: homeX0,
        swingEndY: homeY0,
        treeX: 16,
        treeY: -8,
        shakeDropCd: 0,
        pickTargetIdx: -1,
        pickProgress: 0,
        pouchHasFruit: false,
        lookTimer: 1.2,
        lookTarget: 0,
        lastAction: 'patrol'
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function clampToSafeRadius(x, y, maxR) {
        const limit = Math.max(8, maxR * 0.78);
        const d = Math.hypot(x, y);
        if (d > limit && d > 0.001) {
          return [x * (limit / d), y * (limit / d)];
        }
        return [x, y];
      }

      function computeTreeAnchor(eco) {
        const maxR = (eco && eco.maxRadius) ? eco.maxRadius : 46;
        const limit = Math.max(12, maxR * 0.52);
        const cx = (eco && eco.centerX) || 0;
        const cy = (eco && eco.centerY) || 0;
        const tx = cx + Math.min(18, limit * 0.78);
        const ty = cy - Math.min(9, limit * 0.40);
        const [clx, cly] = clampToSafeRadius(tx, ty, maxR);
        state.treeX = clx;
        state.treeY = cly;
      }

      function placeHandsAtRest(sMul) {
        for (const h of hands) {
          // 腕部静止落在肩前外侧舒适臂展内（距肩约 12.5 格，肘部自然微弯外拱）
          const [hx, hy] = localToWorldXY(state.x, state.y, state.yaw, h.side * 10.6 * sMul, 9.2 * sMul);
          h.x = h.sx = h.tx = hx;
          h.y = h.sy = h.ty = hy;
          h.z = 0;
          h.planted = true;
          h.yaw = state.yaw;
        }
      }

      function pickNextRoamTarget(eco) {
        const maxR = (eco && eco.maxRadius) ? eco.maxRadius : 46;
        const limit = Math.max(12, maxR * 0.72);
        state.navSeq++;
        const r1 = hash2i(state.navSeq, state.seed, 131);
        const r2 = hash2i(state.navSeq, state.seed, 257);
        const ang = Math.atan2(state.y, state.x) + (r1 > 0.5 ? 1 : -1) * lerp(1.25, 2.35, r2);
        const rad = lerp(limit * 0.42, limit * 0.92, hash2i(state.navSeq, state.seed, 389));
        let nx = Math.cos(ang) * rad;
        let ny = Math.sin(ang) * rad;
        if (Math.hypot(nx - state.treeX, ny - state.treeY) < 14) {
          nx = -nx * 0.8;
          ny = -ny * 0.8;
        }
        [state.navX, state.navY] = clampToSafeRadius(nx, ny, maxR);
      }

      function spawnFruitDrop(vfx, sMul, eco) {
        const maxR = (eco && eco.maxRadius) ? eco.maxRadius : 46;
        const fx = curSkin.fx || SKINS[0].fx;

        const hanging = hangingFruits.find(f => f.intact);
        let sx = state.treeX + (Math.random() - 0.5) * 10 * sMul;
        let sy = state.treeY + (Math.random() - 0.5) * 10 * sMul;
        let sz = 19.5 * sMul;
        if (hanging) {
          hanging.intact = false;
          hanging.regrowTimer = 5.5 + Math.random() * 2.5;
          sx = state.treeX + hanging.cfg.lx * sMul;
          sy = state.treeY + hanging.cfg.ly * sMul;
          sz = hanging.cfg.lz * sMul;
        }

        const slot = fallenFruits.find(f => !f.active);
        if (slot) {
          const outAng = Math.atan2(sy - state.treeY, sx - state.treeX) + (Math.random() - 0.5) * 0.9;
          const spd = (5.5 + Math.random() * 6.5) * sMul;
          slot.active = true;
          slot.picked = false;
          slot.x = sx;
          slot.y = sy;
          slot.z = sz;
          slot.vx = Math.cos(outAng) * spd;
          slot.vy = Math.sin(outAng) * spd;
          slot.vz = (3.5 + Math.random() * 4.0) * sMul;
          slot.life = 14.0;
        }

        if (vfx) {
          for (let i = 0; i < 4; i++) {
            const a = Math.random() * TAU;
            const sp = (6 + Math.random() * 11) * sMul;
            vfx.spawnParticle(
              sx + (Math.random() - 0.5) * 4 * sMul,
              sy + (Math.random() - 0.5) * 4 * sMul,
              sz,
              Math.cos(a) * sp, Math.sin(a) * sp, (4 + Math.random() * 6) * sMul,
              0.72 + Math.random() * 0.35,
              i < 2 ? 1.85 : 1.35,
              i === 0 ? fx.fruit : (i === 1 ? fx.fruitHi : fx.leaf),
              false,
              32
            );
          }
        }
        for (const f of fallenFruits) {
          if (!f.active) continue;
          const [cx, cy] = clampToSafeRadius(f.x, f.y, maxR);
          f.x = cx; f.y = cy;
        }
      }

      // 撑杖秋千步态推进器（步幅与双臂有效可达环严格匹配，避免拉脱）
      function stepCrutchWalk(tx, ty, dt, params, habitat, vfx, eco, arriveDist) {
        const sMul = instance.scaleMul;
        const speed = clamp(params.speed ?? 1.0, 0.3, 2.2);
        const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
        const maxR = (eco && eco.maxRadius) ? eco.maxRadius : 46;

        const dx = tx - state.x;
        const dy = ty - state.y;
        const dist = Math.hypot(dx, dy);

        if (dist <= arriveDist) {
          state.vx = lerp(state.vx, 0, expSmooth(dt, 10));
          state.vy = lerp(state.vy, 0, expSmooth(dt, 10));
          state.z = lerp(state.z, 7.4 * sMul, expSmooth(dt, 9));
          return { arrived: true, dist };
        }

        const desiredYaw = Math.atan2(-dx, dy);
        const yawDiff = wrapAngle(desiredYaw - state.yaw);
        const maxTurn = 3.2 * (0.65 + speed * 0.4);
        state.yaw = wrapAngle(state.yaw + clamp(yawDiff, -maxTurn * dt, maxTurn * dt));

        const prevP = state.crutchPhase;
        state.prevCrutchPhase = prevP;
        const cycleRate = 0.88 * gFreq * (0.70 + speed * 0.36);
        state.crutchPhase = (state.crutchPhase + dt * cycleRate) % 1;
        const p = state.crutchPhase;

        const fwdX = -Math.sin(state.yaw);
        const fwdY = Math.cos(state.yaw);

        // 0.00 -> 0.42：双臂同步前探撑地（腕落点距肩 ~15.5 格，稳稳落在 22.1 格最大臂展内）
        if (p < 0.42) {
          if (prevP >= 0.42 || prevP > p) {
            for (const h of hands) {
              h.sx = h.x;
              h.sy = h.y;
              const reachFwd = Math.min(dist + 3.0 * sMul, 14.5 * sMul);
              const [nx, ny] = localToWorldXY(state.x, state.y, state.yaw, h.side * 10.6 * sMul, reachFwd);
              const [clx, cly] = clampToSafeRadius(nx, ny, maxR);
              h.tx = clx;
              h.ty = cly;
              h.planted = false;
            }
          }
          for (const h of hands) {
            const localU = clamp((p - (h.side > 0 ? 0.05 : 0)) / 0.37, 0, 1);
            const sm = localU * localU * (3 - 2 * localU);
            h.x = lerp(h.sx, h.tx, sm);
            h.y = lerp(h.sy, h.ty, sm);
            h.z = Math.sin(localU * Math.PI) * 4.4 * sMul;
            h.yaw = state.yaw;
          }
          state.vx = lerp(state.vx, fwdX * 1.1 * speed, expSmooth(dt, 9));
          state.vy = lerp(state.vy, fwdY * 1.1 * speed, expSmooth(dt, 9));
          state.x += state.vx * dt;
          state.y += state.vy * dt;
          state.z = lerp(state.z, (7.1 - Math.sin((p / 0.42) * Math.PI) * 0.7) * sMul, expSmooth(dt, 11));
        } else if (p < 0.88) {
          // 0.42 -> 0.88：双掌钉地，口袋身荡秋千大幅甩过双臂中线（落点跨过双掌连线前方 4.2 格）
          if (prevP < 0.42) {
            for (const h of hands) {
              h.x = h.tx;
              h.y = h.ty;
              h.z = 0;
              h.planted = true;
              if (vfx && habitat) EnvFeedback.emitFootstep(vfx, habitat, h.x, h.y, 0.72 * sMul);
            }
            state.swingStartX = state.x;
            state.swingStartY = state.y;
            const midHandX = (hands[0].x + hands[1].x) * 0.5;
            const midHandY = (hands[0].y + hands[1].y) * 0.5;
            const rawEndX = midHandX + fwdX * Math.min(dist * 0.35, 4.2 * sMul);
            const rawEndY = midHandY + fwdY * Math.min(dist * 0.35, 4.2 * sMul);
            [state.swingEndX, state.swingEndY] = clampToSafeRadius(rawEndX, rawEndY, maxR);
            bodyBounce.impulse(9.0 * sMul);
          }

          const u = (p - 0.42) / 0.46;
          const sCurve = u * u * (3 - 2 * u);
          const nx = lerp(state.swingStartX, state.swingEndX, sCurve);
          const ny = lerp(state.swingStartY, state.swingEndY, sCurve);
          state.vx = (nx - state.x) / Math.max(dt, 0.001);
          state.vy = (ny - state.y) / Math.max(dt, 0.001);
          state.x = nx;
          state.y = ny;
          // 柔和秋千弧（+3.6 格）：清晰悬空前甩同时保证肩-腕纵差始终与双斜木臂无缝咬合
          state.z = (7.4 + Math.sin(u * Math.PI) * 3.6) * sMul;
          pouchRoll.update(dt, Math.sin(u * TAU) * 0.14, 75, 7.0);
        } else {
          // 0.88 -> 1.00：短后腿轻点落稳
          if (prevP < 0.88) {
            bodyBounce.impulse(-10.0 * sMul);
            if (vfx && habitat) EnvFeedback.emitFootstep(vfx, habitat, state.x, state.y, 0.52 * sMul);
          }
          state.vx = lerp(state.vx, 0, expSmooth(dt, 14));
          state.vy = lerp(state.vy, 0, expSmooth(dt, 14));
          state.z = lerp(state.z, 7.2 * sMul, expSmooth(dt, 12));
        }

        const [clx, cly] = clampToSafeRadius(state.x, state.y, maxR);
        state.x = clx;
        state.y = cly;
        return { arrived: false, dist: Math.hypot(tx - state.x, ty - state.y) };
      }

      const instance = {
        def: Earth6Def,
        cachePrefix: `earth6_m25_${Math.random().toString(36).slice(2, 7)}`,
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
          const sMul = instance.scaleMul || 1.0;
          computeTreeAnchor({ maxRadius: 46 });
          const [cx, cy] = clampToSafeRadius(homeX, homeY, 46);
          state.x = cx;
          state.y = cy;
          state.z = 7.4 * sMul;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.mode = 'roam';
          state.modeTimer = 0;
          state.roamWaypoints = 0;
          state.crutchPhase = 0;
          state.prevCrutchPhase = 0;
          state.pouchHasFruit = false;
          state.pickTargetIdx = -1;
          state.pickProgress = 0;
          treeShakeX.x = treeShakeX.v = 0;
          treeShakeY.x = treeShakeY.v = 0;
          treeCanopyLagX.x = treeCanopyLagX.v = 0;
          treeCanopyLagY.x = treeCanopyLagY.v = 0;
          bodyBounce.x = bodyBounce.v = 0;
          eyeLookSpring.x = eyeLookSpring.v = 0;

          for (const f of hangingFruits) { f.intact = true; f.regrowTimer = 0; }
          for (const f of fallenFruits) { f.active = false; f.picked = false; }

          pickNextRoamTarget({ maxRadius: 46 });
          placeHandsAtRest(sMul);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = clamp(params.scaleMul ?? 1.0, 0.5, 2.0);
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const maxR = (eco && eco.maxRadius) ? eco.maxRadius : 46;

          computeTreeAnchor(eco);

          const action = (eco && eco.action)
            ? eco.action
            : ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const isBattle = action === 'battle_attack' || action === 'battle_special' || action === 'battle_stagger' || action === 'battle_hurt';

          if (isBattle) {
            const actT = (eco && eco.actionTime != null) ? eco.actionTime : 0;
            const isNewAct = action !== state._bAct || actT < (state._bLastT || 0) - 0.04;
            if (isNewAct) {
              state._bAct = action;
              state._bFired = false;
              state._bFired2 = false;
              state._bFired3 = false;
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
            const fx = curSkin.fx || SKINS[0].fx;

            // 对阵时将小果树安放在身侧后方，彻底杜绝挥臂穿树
            state.treeX = ax + sideX * 26 * sMul - dirX * 10 * sMul;
            state.treeY = ay + sideY * 26 * sMul - dirY * 10 * sMul;

            state.mode = 'battle';
            state.vx = 0; state.vy = 0;

            if (action === 'battle_attack') {
              // 0.90s：双长臂高举蓄果(0.28s) -> 猛力朝主角高弧甩出炽红果弹雨(0.27s) -> 命中爆浆 + 垂臂回位(0.35s)
              state.yaw = aimYaw;
              if (actT < 0.28) {
                const u = smoothstep(0, 1, actT / 0.28);
                state.x = ax - dirX * 2.0 * u * sMul;
                state.y = ay - dirY * 2.0 * u * sMul;
                state.z = lerp(7.4, 9.6, u) * sMul;
                state.pouchHasFruit = true;
                for (const h of hands) {
                  const [hx, hy] = localToWorldXY(state.x, state.y, state.yaw, h.side * lerp(10.6, 9.2, u) * sMul, lerp(9.2, 8.0, u) * sMul);
                  h.x = hx; h.y = hy; h.z = lerp(0, 13.5 + Math.sin(actT * 28) * 1.4, u) * sMul;
                  h.yaw = wrapAngle(state.yaw - h.side * 0.25 * u);
                  h.planted = false;
                }
                if (vfx && Math.random() < 0.45) {
                  vfx.spawnParticle(
                    state.x + (Math.random() - 0.5) * 10 * sMul, state.y + (Math.random() - 0.5) * 10 * sMul, state.z + 15 * sMul,
                    0, 0, 8 * sMul, 0.24, 1.5, fx.fruitHi, true, 10
                  );
                }
              } else if (actT < 0.55) {
                const u = (actT - 0.28) / 0.27;
                const throwE = Math.sin(u * Math.PI * 0.5);
                state.x = ax + dirX * (-2.0 + 7.0 * throwE) * sMul;
                state.y = ay + dirY * (-2.0 + 7.0 * throwE) * sMul;
                state.z = lerp(9.6, 7.2, u) * sMul;
                state.pouchHasFruit = false;
                for (const h of hands) {
                  const [hx, hy] = localToWorldXY(state.x, state.y, state.yaw, h.side * lerp(9.2, 11.2, throwE) * sMul, lerp(8.0, 14.8, throwE) * sMul);
                  h.x = hx; h.y = hy; h.z = lerp(13.5, 4.5, throwE) * sMul;
                  h.yaw = state.yaw;
                  h.planted = false;
                }
                if (!state._bFired && actT >= 0.32) {
                  state._bFired = true;
                  bodyBounce.impulse(-12 * sMul);
                  if (vfx) {
                    const z0 = state.z + 13.0 * sMul;
                    const g = 68 * sMul;
                    for (let i = 0; i < 16; i++) {
                      const flightT = 0.25 + (i % 4) * 0.028;
                      const spread = ((i % 5) - 2) * 2.4 * sMul;
                      const sx0 = state.x + dirX * 8 * sMul + sideX * spread * 0.35;
                      const sy0 = state.y + dirY * 8 * sMul + sideY * spread * 0.35;
                      const ttx = tx + sideX * spread;
                      const tty = ty + sideY * spread;
                      const vxP = (ttx - sx0) / flightT;
                      const vyP = (tty - sy0) / flightT;
                      const vzP = (tz - z0 + 0.5 * g * flightT * flightT) / flightT;
                      const col = i % 4 === 0 ? '#ffe36e' : (i % 3 === 0 ? fx.fruitHi : fx.fruit);
                      vfx.spawnParticle(sx0, sy0, z0, vxP, vyP, vzP, flightT + 0.08, i % 2 === 0 ? 2.2 : 1.75, col, i % 3 === 0, g);
                    }
                  }
                }
              } else {
                const u = clamp((actT - 0.55) / 0.35, 0, 1);
                const ret = 1 - smoothstep(0, 1, u);
                state.x = ax + dirX * 5.0 * ret * sMul;
                state.y = ay + dirY * 5.0 * ret * sMul;
                state.z = 7.4 * sMul;
                for (const h of hands) {
                  const [hx, hy] = localToWorldXY(state.x, state.y, state.yaw, h.side * 10.6 * sMul, lerp(9.2, 14.8, ret) * sMul);
                  h.x = hx; h.y = hy; h.z = 4.5 * ret * sMul;
                  h.yaw = state.yaw;
                  h.planted = ret < 0.2;
                }
                if (!state._bFired2 && actT >= 0.58) {
                  state._bFired2 = true;
                  if (vfx) {
                    // 命中主角处巨大红果爆浆 + 湿渍果浆印 + 双环震波
                    vfx.addDecal({
                      kind: 'wet', x: tx, y: ty, yaw: aimYaw,
                      rx: 10.5 * sMul, ry: 9.0 * sMul, life: 2.4, alpha: 0.72,
                      color: '#8f141e', hiColor: '#ff7a6b', darkColor: '#4d0810'
                    });
                    vfx.addRipple(tx, ty, 3 * sMul, 24 * sMul, 0.54, 2.2);
                    vfx.addRipple(tx, ty, 2 * sMul, 15 * sMul, 0.36, 1.6);
                    for (let i = 0; i < 18; i++) {
                      const a = (i / 18) * TAU + Math.random() * 0.2;
                      const spd = (14 + Math.random() * 20) * sMul;
                      const col = i % 4 === 0 ? '#ffe36e' : (i % 2 === 0 ? fx.fruitHi : fx.fruit);
                      vfx.spawnParticle(
                        tx, ty, tz + 3 * sMul,
                        Math.cos(a) * spd, Math.sin(a) * spd, (12 + Math.random() * 14) * sMul,
                        0.42 + Math.random() * 0.18, 1.9, col, i % 3 === 0, 48
                      );
                    }
                  }
                }
              }
            } else if (action === 'battle_special') {
              // 集色威压 (0.85s)：双臂严格留在合法 IK 环内强力捶胸三连震，全场巨幅冲击波 + 漫天落叶
              const p = clamp(actT / 0.85, 0, 1);
              const env = Math.sin(p * Math.PI);
              const beat = Math.sin(actT * 24.0);
              state.x = ax;
              state.y = ay;
              state.z = (7.4 + env * 2.4 + Math.abs(beat) * 0.8) * sMul;
              state.yaw = wrapAngle(aimYaw + beat * 0.14 * env);
              for (const h of hands) {
                const pound = Math.max(0, h.side * beat);
                // 保持腕距肩 >= 10.0 格，在胸前有力扣击且 0 穿躯干
                const [hx, hy] = localToWorldXY(state.x, state.y, state.yaw, h.side * lerp(10.8, 8.4, pound * env) * sMul, lerp(9.2, 11.4, pound * env) * sMul);
                h.x = hx; h.y = hy;
                h.z = (7.2 + pound * 5.2) * env * sMul;
                h.yaw = wrapAngle(state.yaw - h.side * 0.45 * env);
                h.planted = false;
              }
              if (!state._bFired && actT >= 0.18) {
                state._bFired = true;
                bodyBounce.impulse(-14 * sMul);
                if (vfx) {
                  vfx.addRipple(ax, ay, 6 * sMul, 46 * sMul, 0.66, 2.4);
                  for (let i = 0; i < 16; i++) {
                    const a = (i / 16) * TAU;
                    const spd = (24 + Math.random() * 20) * sMul;
                    vfx.spawnParticle(ax, ay, 16 * sMul, Math.cos(a) * spd, Math.sin(a) * spd, (10 + Math.random() * 12) * sMul, 0.68, 2.0, i % 2 === 0 ? '#f59b3d' : fx.leaf, i % 2 === 0, 22);
                  }
                }
              }
              if (!state._bFired2 && actT >= 0.42) {
                state._bFired2 = true;
                bodyBounce.impulse(-15 * sMul);
                if (vfx) {
                  vfx.addRipple(ax, ay, 8 * sMul, 54 * sMul, 0.64, 2.4);
                  vfx.addRipple(tx, ty, 3 * sMul, 24 * sMul, 0.50, 2.0);
                  for (let i = 0; i < 16; i++) {
                    const a = (i / 16) * TAU + 0.15;
                    const spd = (18 + Math.random() * 18) * sMul;
                    vfx.spawnParticle(tx + (Math.random() - 0.5) * 20 * sMul, ty + (Math.random() - 0.5) * 20 * sMul, 26 * sMul,
                      Math.cos(a) * spd * 0.5, Math.sin(a) * spd * 0.5, -14 * sMul, 0.62, 1.9, i % 3 === 0 ? '#ffe5a8' : fx.leaf, i % 3 === 0, 12);
                  }
                }
              }
              if (!state._bFired3 && actT >= 0.62) {
                state._bFired3 = true;
                bodyBounce.impulse(-12 * sMul);
                if (vfx) vfx.addRipple(ax, ay, 6 * sMul, 42 * sMul, 0.50, 2.0);
              }
            } else if (action === 'battle_stagger') {
              const p = clamp(actT / 0.85, 0, 1);
              const decay = 1 - p;
              const heave = Math.sin(actT * 28) * 1.4 * decay * sMul;
              state.x = ax - dirX * 3.2 * Math.sin(p * Math.PI) * sMul + sideX * heave;
              state.y = ay - dirY * 3.2 * Math.sin(p * Math.PI) * sMul + sideY * heave;
              state.z = lerp(7.4, 4.2, Math.sin(p * Math.PI)) * sMul;
              state.yaw = wrapAngle(aimYaw + Math.sin(actT * 20) * 0.22 * decay);
              for (const h of hands) {
                const [hx, hy] = localToWorldXY(state.x, state.y, state.yaw, h.side * 12.2 * sMul, 9.6 * sMul);
                h.x = hx; h.y = hy; h.z = 0; h.yaw = state.yaw; h.planted = true;
              }
              if (!state._bFired) {
                state._bFired = true;
                bodyBounce.impulse(-16 * sMul);
                if (vfx) {
                  vfx.addRipple(ax, ay, 5 * sMul, 22 * sMul, 0.58, 1.8);
                  for (let i = 0; i < 14; i++) {
                    const a = (i / 14) * TAU;
                    const spd = (12 + Math.random() * 14) * sMul;
                    vfx.spawnParticle(ax, ay, 10 * sMul, Math.cos(a) * spd, Math.sin(a) * spd, (10 + Math.random() * 12) * sMul, 0.48, 1.7, i % 2 === 0 ? '#b8f4ff' : '#ffffff', true, 42);
                  }
                }
              }
            } else {
              // battle_hurt (0.35s)
              const p = clamp(actT / 0.35, 0, 1);
              const env = Math.sin(p * Math.PI);
              const vib = Math.sin(actT * 58) * 1.3 * (1 - p) * sMul;
              state.x = ax - dirX * 4.2 * env * sMul + sideX * vib;
              state.y = ay - dirY * 4.2 * env * sMul + sideY * vib;
              state.z = (7.4 - 1.2 * env) * sMul;
              state.yaw = wrapAngle(aimYaw + Math.sin(actT * 46) * 0.14 * (1 - p));
              for (const h of hands) {
                const [hx, hy] = localToWorldXY(state.x, state.y, state.yaw, h.side * 10.6 * sMul, 9.2 * sMul);
                h.x = hx; h.y = hy; h.z = 0; h.yaw = state.yaw; h.planted = true;
              }
              if (!state._bFired) {
                state._bFired = true;
                bodyBounce.impulse(-10 * sMul);
              }
            }

            eyeLookSpring.update(dt, 0, 56 * sp, clamp(6.4 * dScale, 3.0, 10.0));
            bodyBounce.update(dt, 0, 130 * sp, clamp(8.2 * dScale, 3.5, 13.0));
            pouchRoll.update(dt, 0, 75 * sp, 7.0);
            treeShakeX.update(dt, 0, 140 * sp, clamp(6.2 * dScale, 3.0, 10.5));
            treeShakeY.update(dt, 0, 140 * sp, clamp(6.2 * dScale, 3.0, 10.5));
            treeCanopyLagX.update(dt, 0, 75 * sp, clamp(4.6 * dScale, 2.2, 8.5));
            treeCanopyLagY.update(dt, 0, 75 * sp, clamp(4.6 * dScale, 2.2, 8.5));
            const contacts = [];
            for (const h of hands) if (h.z < 6.0 * sMul) contacts.push({ x: h.x, y: h.y, z: h.z, r: 4.0 * sMul });
            contacts.push({ x: state.treeX, y: state.treeY, z: 0, r: 6.2 * sMul });
            instance.footContacts = contacts;
            sockets.setLocal('pouchTop', state.x, state.y, state.z, state.yaw, 0, 0.5, 10.5, sMul);
            return;
          }
          state._bAct = '';

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.modeTimer = 0;
            if (action === 'shake') {
              state.mode = 'approach_tree';
            } else if (action === 'patrol') {
              state.mode = 'roam';
              state.roamWaypoints = 0;
              pickNextRoamTarget(eco);
            }
          }

          // 1. 挂枝果再生与地面落果物理弹跳
          for (const hf of hangingFruits) {
            if (!hf.intact) {
              hf.regrowTimer -= dt;
              if (hf.regrowTimer <= 0) hf.intact = true;
            }
          }
          for (const ff of fallenFruits) {
            if (!ff.active) continue;
            ff.life -= dt;
            if (ff.life <= 0) { ff.active = false; continue; }
            if (!ff.picked && ff.z > 0.05) {
              ff.vz -= 52 * sMul * dt;
              ff.x += ff.vx * dt;
              ff.y += ff.vy * dt;
              ff.z += ff.vz * dt;
              if (ff.z <= 0) {
                ff.z = 0;
                ff.vx *= 0.25;
                ff.vy *= 0.25;
                ff.vz = Math.abs(ff.vz) > 8 * sMul ? Math.abs(ff.vz) * 0.28 : 0;
              }
              const [fx, fy] = clampToSafeRadius(ff.x, ff.y, maxR);
              ff.x = fx; ff.y = fy;
            }
          }

          // 2. 双肩大眼独立张望驱动
          state.lookTimer -= dt;
          if (state.lookTimer <= 0) {
            state.lookTimer = 1.0 + Math.random() * 1.4;
            const r = Math.random();
            state.lookTarget = r < 0.25 ? 0 : (r < 0.62 ? -0.58 : 0.58);
          }

          // 3. 分动作驱动（抱树站位距树干约 13.5 格，确保双臂自然弯肘环抱不拉直脱节）
          const standOffX = state.treeX - 11.2 * sMul;
          const standOffY = state.treeY + 7.5 * sMul;
          const aimTreeYaw = Math.atan2(-(state.treeX - state.x), state.treeY - state.y);

          if (action === 'idle') {
            state.vx = lerp(state.vx, 0, expSmooth(dt, 8));
            state.vy = lerp(state.vy, 0, expSmooth(dt, 8));
            state.z = lerp(state.z, (7.4 + Math.sin(time * 2.1) * 0.55) * sMul, expSmooth(dt, 7));
            const baseYaw = (eco && eco.homeYaw !== undefined) ? eco.homeYaw : homeYaw0;
            state.yaw = wrapAngle(state.yaw + wrapAngle(baseYaw + Math.sin(time * 0.7) * 0.14 - state.yaw) * expSmooth(dt, 4.5));
            for (const h of hands) {
              const [hx, hy] = localToWorldXY(state.x, state.y, state.yaw, h.side * 10.6 * sMul, 9.2 * sMul);
              h.x = lerp(h.x, hx, expSmooth(dt, 7));
              h.y = lerp(h.y, hy, expSmooth(dt, 7));
              h.z = lerp(h.z, 0, expSmooth(dt, 10));
              h.yaw = state.yaw;
              h.planted = true;
            }
            eyeLookSpring.update(dt, state.lookTarget, 48 * sp, clamp(6.2 * dScale, 3.0, 10.0));
          } else {
            state.modeTimer += dt;

            if (state.mode === 'roam') {
              const res = stepCrutchWalk(state.navX, state.navY, dt, params, habitat, vfx, eco, 5.5 * sMul);
              eyeLookSpring.update(dt, state.lookTarget * 0.65, 48 * sp, clamp(6.2 * dScale, 3.0, 10.0));
              if (res.arrived || state.modeTimer > 5.5) {
                state.modeTimer = 0;
                state.roamWaypoints++;
                if (state.roamWaypoints >= 2) {
                  state.mode = 'approach_tree';
                } else {
                  pickNextRoamTarget(eco);
                }
              }
            } else if (state.mode === 'approach_tree') {
              const res = stepCrutchWalk(standOffX, standOffY, dt, params, habitat, vfx, eco, 4.2 * sMul);
              eyeLookSpring.update(dt, clamp(wrapAngle(aimTreeYaw - state.yaw), -0.6, 0.6), 54 * sp, 6.5);
              if (res.arrived || state.modeTimer > 6.5) {
                state.mode = 'shake_tree';
                state.modeTimer = 0;
                state.shakeDropCd = 0.25;
                for (const hf of hangingFruits) hf.intact = true;
              }
            } else if (state.mode === 'shake_tree') {
              state.vx = lerp(state.vx, 0, expSmooth(dt, 10));
              state.vy = lerp(state.vy, 0, expSmooth(dt, 10));
              state.yaw = wrapAngle(state.yaw + wrapAngle(aimTreeYaw - state.yaw) * expSmooth(dt, 9));

              const shakeFreq = 19.0 * gFreq;
              const shakeWave = Math.sin(state.modeTimer * shakeFreq);
              const shakeEnv = smoothstep(0.0, 0.28, state.modeTimer) * (1 - smoothstep(2.9, 3.3, state.modeTimer));
              const rightX = Math.cos(state.yaw), rightY = Math.sin(state.yaw);
              const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);

              treeShakeX.impulse(rightX * shakeWave * 28.0 * shakeEnv * dt * 60 * sMul);
              treeShakeY.impulse(rightY * shakeWave * 28.0 * shakeEnv * dt * 60 * sMul);

              state.z = lerp(state.z, (8.2 + Math.abs(shakeWave) * 0.9) * sMul, expSmooth(dt, 12));
              const trunkNowX = state.treeX + clamp(treeShakeX.x * 0.08, -2.6, 2.6);
              const trunkNowY = state.treeY + clamp(treeShakeY.x * 0.08, -2.6, 2.6);
              for (const h of hands) {
                // 腕部落在树干侧前方 3.8 格，让三钩掌从两侧紧紧扣住树干
                const grabX = trunkNowX + rightX * h.side * 4.0 * sMul - fwdX * 2.2 * sMul;
                const grabY = trunkNowY + rightY * h.side * 4.0 * sMul - fwdY * 2.2 * sMul;
                h.x = lerp(h.x, grabX, expSmooth(dt, 18));
                h.y = lerp(h.y, grabY, expSmooth(dt, 18));
                h.z = lerp(h.z, (9.8 + h.side * shakeWave * 1.2) * sMul, expSmooth(dt, 18));
                h.yaw = wrapAngle(state.yaw - h.side * 0.55);
                h.planted = false;
              }

              eyeLookSpring.update(dt, shakeWave * 0.28, 60 * sp, 7.0);

              state.shakeDropCd -= dt;
              if (state.shakeDropCd <= 0 && shakeEnv > 0.35) {
                state.shakeDropCd = 0.42;
                spawnFruitDrop(vfx, sMul, eco);
                if (vfx) vfx.addRipple(state.treeX, state.treeY, 3.0 * sMul, 16.0 * sMul, 0.55, 1.8);
              }

              if (state.modeTimer >= 3.35) {
                let bestIdx = -1, bestD = Infinity;
                for (let i = 0; i < fallenFruits.length; i++) {
                  const ff = fallenFruits[i];
                  if (!ff.active || ff.picked) continue;
                  const d = Math.hypot(ff.x - state.x, ff.y - state.y);
                  if (d < bestD) { bestD = d; bestIdx = i; }
                }
                state.pickTargetIdx = bestIdx;
                state.pickProgress = 0;
                state.mode = 'pick_fruit';
                state.modeTimer = 0;
              }
            } else if (state.mode === 'pick_fruit') {
              state.pickProgress += dt / 1.85;
              const u = clamp(state.pickProgress, 0, 1);
              const targetFruit = (state.pickTargetIdx >= 0 && fallenFruits[state.pickTargetIdx] && fallenFruits[state.pickTargetIdx].active)
                ? fallenFruits[state.pickTargetIdx]
                : null;

              if (targetFruit) {
                const aimF = Math.atan2(-(targetFruit.x - state.x), targetFruit.y - state.y);
                state.yaw = wrapAngle(state.yaw + wrapAngle(aimF - state.yaw) * expSmooth(dt, 7));
              }

              const lh = hands[0];
              const rh = hands[1];
              const [lRestX, lRestY] = localToWorldXY(state.x, state.y, state.yaw, -10.4 * sMul, 8.6 * sMul);
              lh.x = lerp(lh.x, lRestX, expSmooth(dt, 10));
              lh.y = lerp(lh.y, lRestY, expSmooth(dt, 10));
              lh.z = lerp(lh.z, 0, expSmooth(dt, 12));
              lh.yaw = state.yaw;
              lh.planted = true;

              const [pouchNearX, pouchNearY] = localToWorldXY(state.x, state.y, state.yaw, 4.8 * sMul, 4.6 * sMul);
              const fruitX = targetFruit ? targetFruit.x : (state.x - Math.sin(state.yaw) * 11 * sMul);
              const fruitY = targetFruit ? targetFruit.y : (state.y + Math.cos(state.yaw) * 11 * sMul);

              if (u < 0.48) {
                const ku = smoothstep(0, 0.48, u);
                rh.x = lerp(rh.x, fruitX, expSmooth(dt, 12));
                rh.y = lerp(rh.y, fruitY, expSmooth(dt, 12));
                rh.z = lerp(rh.z, (0.8 + (1 - ku) * 2.5) * sMul, expSmooth(dt, 12));
                rh.yaw = wrapAngle(state.yaw + 0.30);
                state.z = lerp(state.z, 6.4 * sMul, expSmooth(dt, 8));
              } else if (u < 0.85) {
                const ku = smoothstep(0.48, 0.85, u);
                rh.x = lerp(fruitX, pouchNearX, ku);
                rh.y = lerp(fruitY, pouchNearY, ku);
                rh.z = (1.2 + Math.sin(ku * Math.PI) * 9.5 + ku * 8.6) * sMul;
                rh.yaw = wrapAngle(state.yaw - 0.85 * ku);
                state.z = lerp(state.z, 7.6 * sMul, expSmooth(dt, 8));
                if (targetFruit) {
                  targetFruit.picked = true;
                  const [tipX, tipY] = localToWorldXY(rh.x, rh.y, rh.yaw, 0, 3.6 * sMul);
                  targetFruit.x = tipX;
                  targetFruit.y = tipY;
                  targetFruit.z = Math.max(0, rh.z + 1.0 * sMul);
                }
              } else {
                if (targetFruit && targetFruit.active) {
                  targetFruit.active = false;
                  state.pouchHasFruit = true;
                  bodyBounce.impulse(-9.5 * sMul);
                }
                const [rRestX, rRestY] = localToWorldXY(state.x, state.y, state.yaw, 10.4 * sMul, 8.8 * sMul);
                rh.x = lerp(rh.x, rRestX, expSmooth(dt, 10));
                rh.y = lerp(rh.y, rRestY, expSmooth(dt, 10));
                rh.z = lerp(rh.z, 0, expSmooth(dt, 10));
                rh.yaw = state.yaw;
              }
              eyeLookSpring.update(dt, 0.35, 50 * sp, 6.5);

              if (u >= 1.0) {
                if (action === 'shake') {
                  state.mode = 'shake_tree';
                  state.modeTimer = 0;
                  state.shakeDropCd = 0.25;
                  for (const hf of hangingFruits) hf.intact = true;
                } else {
                  state.mode = 'roam';
                  state.modeTimer = 0;
                  state.roamWaypoints = 0;
                  pickNextRoamTarget(eco);
                }
              }
            }
          }

          // 4. 更新果树弹簧与躯干弹跳
          const windX = (fbm1(time * 0.4, state.seed + 7) - 0.5) * 1.4 * sMul;
          const windY = (fbm1(time * 0.35, state.seed + 23) - 0.5) * 1.4 * sMul;
          treeShakeX.update(dt, windX, 140 * sp, clamp(6.2 * dScale, 3.0, 10.5));
          treeShakeY.update(dt, windY, 140 * sp, clamp(6.2 * dScale, 3.0, 10.5));
          treeCanopyLagX.update(dt, treeShakeX.x * 1.45, 75 * sp, clamp(4.6 * dScale, 2.2, 8.5));
          treeCanopyLagY.update(dt, treeShakeY.x * 1.45, 75 * sp, clamp(4.6 * dScale, 2.2, 8.5));
          bodyBounce.update(dt, 0, 130 * sp, clamp(8.2 * dScale, 3.5, 13.0));

          // 5. 更新接地印接触点（双三钩掌 + 树根）
          const contacts = [];
          for (const h of hands) {
            if (h.z < 6.0 * sMul) contacts.push({ x: h.x, y: h.y, z: h.z, r: 4.0 * sMul });
          }
          contacts.push({ x: state.treeX, y: state.treeY, z: 0, r: 6.2 * sMul });
          instance.footContacts = contacts;

          sockets.setLocal('pouchTop', state.x, state.y, state.z, state.yaw, 0, 0.5, 10.5, sMul);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const isWater = !!(habitat && habitat.isWater);
          const waterLevel = habitat ? (habitat.waterLevel ?? -99) : -99;
          const calcSub = (z) => EnvFeedback.calcSubmerge(z, waterLevel, 4.8, isWater);

          const bodyLift = Math.max(2.0 * sMul, state.z + clamp(bodyBounce.x * 0.14, -1.8, 1.8));
          const bx = state.x;
          const by = state.y;

          // -----------------------------------------------------------------
          // A. 自带局部果树道具件
          // -----------------------------------------------------------------
          const tdx = clamp(treeShakeX.x * 0.08, -2.6, 2.6);
          const tdy = clamp(treeShakeY.x * 0.08, -2.6, 2.6);
          const cdx = clamp(treeCanopyLagX.x * 0.12, -4.2, 4.2);
          const cdy = clamp(treeCanopyLagY.x * 0.12, -4.2, 4.2);

          list.push({
            partKey: 'treeTrunk',
            asset: parts.treeTrunk,
            x: state.treeX + tdx * 0.45,
            y: state.treeY + tdy * 0.45,
            lift: 0,
            ro: clamp(tdx * 0.06, -0.22, 0.22),
            submerge: calcSub(2.5 * sMul),
            bias: -0.45
          });

          list.push({
            partKey: 'treeCanopy',
            asset: parts.treeCanopy,
            x: state.treeX + cdx,
            y: state.treeY + cdy,
            lift: 17.5 * sMul,
            ro: clamp(cdx * 0.09, -0.32, 0.32),
            submerge: calcSub(20.0 * sMul),
            bias: 2.20
          });

          for (const hf of hangingFruits) {
            if (!hf.intact) continue;
            list.push({
              partKey: 'treeFruit',
              asset: parts.treeFruit,
              x: state.treeX + cdx * 1.15 + hf.cfg.lx * sMul,
              y: state.treeY + cdy * 1.15 + hf.cfg.ly * sMul,
              lift: hf.cfg.lz * sMul,
              ro: 0,
              symDeg: 90,
              bias: 2.55
            });
          }

          for (const ff of fallenFruits) {
            if (!ff.active) continue;
            list.push({
              partKey: 'treeFruit',
              asset: parts.treeFruit,
              x: ff.x,
              y: ff.y,
              lift: Math.max(0, ff.z),
              ro: 0,
              symDeg: 90,
              bias: ff.picked ? 1.35 : 0.15
            });
          }

          // -----------------------------------------------------------------
          // B. 极短后腿（相对双臂撑地滞后 0.18 周期 / 约 65° 的秋千钟摆甩动）
          // -----------------------------------------------------------------
          const isSwinging = state.mode === 'roam' || state.mode === 'approach_tree';
          const swingU = isSwinging && state.crutchPhase >= 0.42 && state.crutchPhase < 0.88
            ? (state.crutchPhase - 0.42) / 0.46
            : 0;
          const legPendulum = isSwinging ? Math.sin((state.crutchPhase - 0.18) * TAU) * 3.4 * sMul : 0;
          const legLiftAir = swingU > 0 ? Math.sin(swingU * Math.PI) * 3.2 * sMul : 0;

          for (const side of [-1, 1]) {
            const [lx, ly] = localToWorldXY(bx, by, yw, side * 3.2 * sMul, (-1.8 * sMul) + legPendulum);
            list.push({
              partKey: 'hindLeg',
              asset: parts.hindLeg,
              x: lx,
              y: ly,
              lift: Math.max(0, bodyLift - 5.2 * sMul + legLiftAir),
              ro: yw,
              submerge: calcSub(bodyLift - 3.0 * sMul),
              bias: -0.25
            });
          }

          // -----------------------------------------------------------------
          // C. 无头短小口袋躯干 + 顶口藏果 + 左右双肩放大亮眼
          // -----------------------------------------------------------------
          const bodyYaw = wrapAngle(yw + clamp(pouchRoll.x, -0.22, 0.22));
          list.push({
            partKey: 'pouchBody',
            asset: parts.pouchBody,
            x: bx,
            y: by,
            lift: bodyLift,
            ro: bodyYaw,
            submerge: calcSub(bodyLift + 2.0 * sMul),
            bias: 0.15
          });

          if (state.pouchHasFruit) {
            list.push({
              partKey: 'treeFruit',
              asset: parts.treeFruit,
              x: bx,
              y: by,
              lift: bodyLift + 9.4 * sMul,
              ro: 0,
              symDeg: 90,
              bias: 0.60
            });
          }

          const eyeYaw = wrapAngle(bodyYaw + clamp(eyeLookSpring.x, -0.72, 0.72));
          for (const side of [-1, 1]) {
            const [ex, ey] = localToWorldXY(bx, by, bodyYaw, side * 5.2 * sMul, 1.4 * sMul);
            list.push({
              partKey: 'shoulderEye',
              asset: parts.shoulderEye,
              x: ex,
              y: ey,
              lift: bodyLift + 9.6 * sMul,
              ro: eyeYaw,
              bias: 0.88
            });
          }

          // -----------------------------------------------------------------
          // D. 超长 3 段木壳前臂：严格 2D XY 二骨 IK + 3 档纵坡无缝拼合
          // -----------------------------------------------------------------
          const L1 = ARM_L1 * sMul;
          const L2 = ARM_L2 * sMul;

          for (const h of hands) {
            // 1) 肩关节世界坐标（与 pouchBody 双肩木托球严格同心）
            const [sx, sy] = localToWorldXY(bx, by, bodyYaw, h.side * 5.2 * sMul, 0.9 * sMul);
            const sz = bodyLift + 7.4 * sMul;

            // 2) 严格 2D 平面二骨 IK：保证肩->肘 = L1、肘->腕 = L2（XY 零脱节）
            const { ex, ey, wx, wy } = solveLongArmXYIK(sx, sy, h.x, h.y, bodyYaw, h.side, L1, L2, sMul);
            const wz = Math.max(HOOK_WRIST_Z * sMul, h.z + HOOK_WRIST_Z * sMul);

            const upperYaw = Math.atan2(-(ex - sx), ey - sy);
            const foreYaw  = Math.atan2(-(wx - ex), wy - ey);

            // 三钩掌朝向：撑地/待机时自然顺着前臂微偏向前，抱树/捡果时按动作意图对准
            let handYaw;
            if (state.mode === 'shake_tree' || state.mode === 'pick_fruit') {
              handYaw = h.yaw;
            } else {
              handYaw = wrapAngle(foreYaw + clamp(wrapAngle(bodyYaw - foreYaw), -0.52, 0.52));
            }

            // 3) 按肩-腕真实纵差 dZ 选配最优斜坡资产，并用微调均分残余 Z 误差（≤ 1.3 格）
            const dZ = sz - wz;
            const useUpperLevel = dZ < 4.4 * sMul;
            const useForeLevel  = dZ < 8.4 * sMul;

            const uKey = useUpperLevel ? 'armUpperLevel' : 'armUpper';
            const fKey = useForeLevel  ? 'armForeLevel'  : 'armFore';
            const uZ0  = (useUpperLevel ? UPPER_LVL_Z0 : UPPER_DOWN_Z0) * sMul;
            const uZ1  = (useUpperLevel ? UPPER_LVL_Z1 : UPPER_DOWN_Z1) * sMul;
            const fZ0  = (useForeLevel  ? FORE_LVL_Z0  : FORE_DOWN_Z0)  * sMul;
            const fZ1  = (useForeLevel  ? FORE_LVL_Z1  : FORE_DOWN_Z1)  * sMul;

            const bakedDrop = (uZ0 - uZ1) + (fZ0 - fZ1);
            const zErr = dZ - bakedDrop; // 残余纵差，由肩/肘/腕按 0.3 / 0.4 / 0.3 柔性吸收
            const upperLift = Math.max(0, (sz - uZ0) - zErr * 0.30);
            const foreLift  = Math.max(0, (wz - fZ1) + zErr * 0.30);
            const handLift  = Math.max(0, wz - HOOK_WRIST_Z * sMul);

            const [ux, uy] = pivotToWorldXY(sx, sy, upperYaw, UPPER_PIVOT.x * sMul, UPPER_PIVOT.y * sMul);
            const [fx, fy] = pivotToWorldXY(ex, ey, foreYaw,  FORE_PIVOT.x * sMul,  FORE_PIVOT.y * sMul);
            const [hx, hy] = pivotToWorldXY(wx, wy, handYaw,  HOOK_PIVOT.x * sMul,  HOOK_PIVOT.y * sMul);

            list.push({
              partKey: uKey,
              asset: parts[uKey],
              x: ux,
              y: uy,
              lift: upperLift,
              ro: upperYaw,
              submerge: calcSub(upperLift + uZ1),
              bias: 0.18
            });

            list.push({
              partKey: fKey,
              asset: parts[fKey],
              x: fx,
              y: fy,
              lift: foreLift,
              ro: foreYaw,
              submerge: calcSub(foreLift + fZ1),
              bias: 0.22
            });

            list.push({
              partKey: 'hookHand',
              asset: parts.hookHand,
              x: hx,
              y: hy,
              lift: handLift,
              ro: handYaw,
              submerge: calcSub(handLift + 1.5 * sMul),
              bias: state.mode === 'shake_tree' ? 0.85 : 0.28
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Earth6Def.id,
            code: Earth6Def.code,
            name: Earth6Def.name,
            status: Earth6Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            footRadius: Earth6Def.footRadius,
            headZ: 22,
            centerZ: 10,
            armToTorsoRatio: Number(((ARM_L1 + ARM_L2 + ARM_L3) / 11.5).toFixed(2)),
            blocks: Earth6Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Earth6Def);
})(window.PixelWorkshop);
