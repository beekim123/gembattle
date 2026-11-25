'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, hash2i, fbm1 } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 树1 · 倒挂垂囊（M20 垂吊标杆 · 像素对齐深度排序画线 + 悬摆骤降回缩）
  //
  // 【设计摘要】
  // 1. 空间纵深与外观：
  //    - 高位横枝（perchBranch，lift≈36.5）+ 顶覆树冠叶蓬（perchCanopy，lift≈41.5）构成树冠高处锚点；
  //    - 倒挂隐蔽躯体（hideBody，lift≈30.5）以暗褐树皮纹与青苔脊背紧扣枝底，四只吸盘爪抓牢横枝，
  //      腹底腺口垂下 1 根主韧性肉丝与 2 根极细辅助牵丝（全部调用 core/renderer.js 的 kind: 'line'）；
  //    - 末端悬垂鲜红半透长肉囊，预做 3 档形态资产无损切换（sacRelaxed 舒张 / sacSwollen 鼓胀 /
  //      sacPounce 骤降伞状扑罩），严禁常态小数拉伸；
  //    - 垂丝中段挂 2 颗极轻黏液珠节（dewNode，4×4×4 四重对称），随弧线与微颤同步运动。
  // 2. 状态机（patrol / idle / drop）：
  //    - lure（悬垂诱饵，4.2~6.6s）：SpringDamper1D 驱动钟摆轻晃，周期鼓胀脉动，垂丝柔和下垂 sag；
  //    - tense（蓄势微提，0.30s）：骤降前肉囊微提并鼓胀，垂丝收紧预颤；
  //    - drop（骤降扑罩，0.30s）：放线骤降贴近地面（z≈1.4），切为伞状 sacPounce，sag -> 0，扬起碎叶尘粒；
  //    - hold（贴地罩合，0.32s）：贴地脉动咬合；
  //    - retract（急速回缩，0.64s）：急速拉回高处树冠，垂丝绷直带高频 jitter 微颤，顶枝回弹落叶。
  // 3. 资产与预算：7 个共享部件（最大 32×12×12），33 色 0 重色 0 自亮，3 套零重建模换色皮肤。
  // =========================================================================

  // 33 色独立色表（≤ 48 色、0 重色、eyeGlint 严禁进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 高位横枝树皮
      barkDark:  '#3a281b',
      barkMid:   '#61442e',
      barkHi:    '#8c6646',
      // 深裂木纹与老枝节
      woodDark:  '#261a12',
      woodMid:   '#473121',
      woodHi:    '#6b4c33',
      // 枝背青苔与藤须
      mossDark:  '#224a24',
      mossMid:   '#3b7836',
      mossHi:    '#6bb04f',
      // 树冠中层深叶
      leafDark:  '#1d4f2a',
      leafMid:   '#327a3d',
      leafHi:    '#60b052',
      // 树冠顶层嫩叶
      crownDark: '#2f692a',
      crownMid:  '#559e3e',
      crownHi:   '#92d65c',
      // 倒挂隐蔽躯体斑皮（融入树皮与苔藓）
      hideDark:  '#342920',
      hideMid:   '#544334',
      hideHi:    '#7a664d',
      // 紧抓树枝的吸盘短爪
      clawDark:  '#4d3228',
      clawMid:   '#7d5242',
      clawHi:    '#ad7964',
      // 鲜红半透长肉囊外壁
      sacDark:   '#821821',
      sacMid:    '#cc2b38',
      sacHi:     '#ff636e',
      // 肉囊内部脉动腺核
      coreDark:  '#a81b1b',
      coreMid:   '#eb3d36',
      coreHi:    '#ff9178',
      // 肉囊纵向肌棱与底端捕食口瓣
      veinDark:  '#611524',
      veinMid:   '#9c243b',
      veinHi:    '#db4b63',
      // 倒挂本体窥视窄眼（不进 glowKeys）
      eyeDark:   '#140d0f',
      eyeIris:   '#d9932b',
      eyeGlint:  '#fff2cf'
    },
    glowKeys: [],
    parts: [
      'bark', 'wood', 'moss', 'leaf', 'crown',
      'hide', 'claw', 'sac', 'core', 'vein', 'eye'
    ],
    noCrease: [
      ['bark', 'wood'], ['bark', 'moss'], ['wood', 'moss'],
      ['leaf', 'crown'], ['leaf', 'moss'],
      ['hide', 'moss'], ['hide', 'claw'], ['hide', 'eye'],
      ['sac', 'core'], ['sac', 'vein'], ['core', 'vein']
    ],
    materials: {
      bark:  ['barkDark',  'barkMid',  'barkHi'],
      wood:  ['woodDark',  'woodMid',  'woodHi'],
      moss:  ['mossDark',  'mossMid',  'mossHi'],
      leaf:  ['leafDark',  'leafMid',  'leafHi'],
      crown: ['crownDark', 'crownMid', 'crownHi'],
      hide:  ['hideDark',  'hideMid',  'hideHi'],
      claw:  ['clawDark',  'clawMid',  'clawHi'],
      sac:   ['sacDark',   'sacMid',   'sacHi'],
      core:  ['coreDark',  'coreMid',  'coreHi'],
      vein:  ['veinDark',  'veinMid',  'veinHi']
    },
    protectedParts: ['eye', 'core']
  });

  // 3 套零重建模换色皮肤（赤囊苔枝 / 紫囊枯枝 / 琥珀囊青藤）
  const SKINS = [
    {
      id: 'crimson_moss',
      name: '赤囊苔枝（树冠经典）',
      dot: '#cc2b38',
      outline: '#121410',
      pal: {},
      line: {
        main: '#d94854',
        mainOutline: '#290d12',
        aux: '#b86c63'
      },
      fx: {
        leafA: '#559e3e',
        leafB: '#92d65c',
        dust:  '#78593d',
        drop:  '#ff636e'
      }
    },
    {
      id: 'violet_wither',
      name: '紫囊枯枝（枯冠款）',
      dot: '#9b3dc4',
      outline: '#15101a',
      pal: {
        barkDark:  '#2e272a', barkMid:  '#4d4247', barkHi:  '#73656c',
        woodDark:  '#1f1a1d', woodMid:  '#383034', woodHi:  '#574c52',
        mossDark:  '#363d2d', mossMid:  '#566146', mossHi:  '#808f68',
        leafDark:  '#3d3528', leafMid:  '#635640', leafHi:  '#917f60',
        crownDark: '#52422d', crownMid: '#806846', crownHi: '#b5976b',
        hideDark:  '#2a252e', hideMid:  '#473f4d', hideHi:  '#6b6073',
        clawDark:  '#3f2c42', clawMid:  '#694a6e', clawHi:  '#99709e',
        sacDark:   '#591975', sacMid:   '#9b3dc4', sacHi:   '#db82f5',
        coreDark:  '#781d6c', coreMid:  '#c73da7', coreHi:  '#ff8ce0',
        veinDark:  '#3d1352', veinMid:  '#70248f', veinHi:  '#b054cf',
        eyeIris:   '#d4c44a'
      },
      line: {
        main: '#b556db',
        mainOutline: '#210b2e',
        aux: '#8f6b99'
      },
      fx: {
        leafA: '#635640',
        leafB: '#b5976b',
        dust:  '#574c52',
        drop:  '#db82f5'
      }
    },
    {
      id: 'amber_vine',
      name: '琥珀囊青藤（青藤款）',
      dot: '#e37b24',
      outline: '#101812',
      pal: {
        barkDark:  '#253d24', barkMid:  '#3f663b', barkHi:  '#65945b',
        woodDark:  '#1b2e1b', woodMid:  '#2f4f2d', woodHi:  '#4d7548',
        mossDark:  '#1e5434', mossMid:  '#348a54', mossHi:  '#66c484',
        leafDark:  '#174f38', leafMid:  '#28825b', leafHi:  '#54bd8a',
        crownDark: '#266b41', crownMid: '#45ab68', crownHi: '#85e09e',
        hideDark:  '#263b29', hideMid:  '#406144', hideHi:  '#648f68',
        clawDark:  '#4a3a22', clawMid:  '#785f38', clawHi:  '#ad8c58',
        sacDark:   '#963d12', sacMid:   '#e37b24', sacHi:   '#ffbc59',
        coreDark:  '#b8490f', coreMid:  '#f59227', coreHi:  '#ffe085',
        veinDark:  '#6e280d', veinMid:  '#b34c1b', veinHi:  '#eb7f3d',
        eyeIris:   '#62d9b3'
      },
      line: {
        main: '#f0943a',
        mainOutline: '#2e1607',
        aux: '#7db87a'
      },
      fx: {
        leafA: '#45ab68',
        leafB: '#85e09e',
        dust:  '#4d7548',
        drop:  '#ffbc59'
      }
    }
  ];

  // =========================================================================
  // 1. 高位横枝（perchBranch：32×12×12）
  //    苍劲粗壮的横生枝杈，枝背覆厚实青苔，两端收出分杈与树皮结节，底中预留抓附点
  // =========================================================================
  function buildPerchBranch(makeCanvas) {
    const m = new VoxelModel(32, 12, 12, SPEC);
    const { mat, partId } = SPEC;

    // 主横枝：沿 X 轴从 -14 到 +14 略带弧度延伸
    m.paintCapsule(-14.2, -0.6, 5.2, -5.0,  0.4, 6.2, 2.55, 3.05, mat('bark'), partId.bark, true);
    m.paintCapsule( -5.0,  0.4, 6.2,  5.0,  0.2, 6.0, 3.05, 2.95, mat('bark'), partId.bark, true);
    m.paintCapsule(  5.0,  0.2, 6.0, 14.0, -0.8, 5.0, 2.95, 1.85, mat('wood'), partId.wood, true);

    // 枝干斜岔（左右各生出一截小分枝，增强树冠立体感并作为辅助牵丝锚点）
    m.paintCapsule(-7.5,  0.2, 5.8, -11.5,  3.8, 7.2, 1.75, 1.05, mat('wood'), partId.wood, true);
    m.paintCapsule( 7.2,  0.0, 5.6,  11.4, -3.6, 6.8, 1.65, 1.00, mat('bark'), partId.bark, true);
    m.paintCapsule( 8.0,  0.4, 6.0,  11.8,  3.4, 7.6, 1.45, 0.90, mat('wood'), partId.wood, true);

    // 枝干底侧抓附木瘤（倒挂本体紧扣处）
    m.paintEllipsoid(0.0, 0.2, 4.2, 3.8, 2.6, 2.2, mat('wood'), partId.wood, true);

    // 枝背厚实青苔垫 + 垂下短苔须
    m.paintCapsule(-10.5, -0.1, 7.8,  9.5,  0.1, 7.6, 1.85, 1.65, mat('moss'), partId.moss, true);
    m.paintEllipsoid(-5.2,  1.2, 8.2, 2.8, 2.2, 1.5, mat('moss'), partId.moss, true);
    m.paintEllipsoid( 4.6, -0.8, 8.0, 2.6, 2.0, 1.4, mat('moss'), partId.moss, true);
    m.paintCapsule(-9.8,  2.2, 5.2, -10.2,  2.4, 2.2, 0.72, 0.45, mat('moss'), partId.moss, true);
    m.paintCapsule( 9.4, -2.0, 5.0,   9.6, -2.2, 2.4, 0.68, 0.42, mat('moss'), partId.moss, true);

    // 枝梢小簇浓叶
    m.paintEllipsoid(-12.5,  1.6, 7.5, 3.2, 2.8, 2.4, mat('leaf'), partId.leaf, true);
    m.paintEllipsoid( 12.2,  1.2, 7.4, 3.0, 2.6, 2.2, mat('leaf'), partId.leaf, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 12.5, headZ: 11, centerZ: 6 });
  }

  // =========================================================================
  // 2. 高位隐蔽树冠叶蓬（perchCanopy：24×20×10）
  //    覆盖在横枝上方与后侧，形成树冠垂荫层次
  // =========================================================================
  function buildPerchCanopy(makeCanvas) {
    const m = new VoxelModel(24, 20, 10, SPEC);
    const { mat, partId } = SPEC;

    const puffs = [
      [  0.0,  0.0, 4.4, 7.6, 6.2, 3.8, 'leaf'],
      [ -6.8,  0.8, 3.8, 5.2, 4.6, 3.2, 'leaf'],
      [  6.8, -0.6, 4.0, 5.0, 4.5, 3.2, 'leaf'],
      [ -2.4, -3.4, 4.0, 5.2, 4.2, 3.1, 'moss'],
      [  2.6,  3.2, 4.4, 5.4, 4.2, 3.2, 'crown'],
      [  0.0,  0.4, 6.6, 5.8, 4.8, 2.8, 'crown']
    ];

    m.fillAABB(-11.5, 11.5, -9.5, 9.5, 0, 9, (x, y, z, X, Y) => {
      let bestD = 99;
      let bestMat = 'leaf';
      for (let i = 0; i < puffs.length; i++) {
        const [px, py, pz, rx, ry, rz, mk] = puffs[i];
        const d = (Math.hypot((X - px) / rx, (Y - py) / ry, (z - pz) / rz) - 1.0) * Math.min(rx, ry, rz);
        if (d < bestD) { bestD = d; bestMat = mk; }
      }
      const bumpy = Math.sin(X * 0.75 + Y * 0.65) * 0.38 + Math.cos(Y * 0.8 - z * 0.6) * 0.30;
      if (bestD <= bumpy) {
        const finalMat = z <= 1 ? 'moss' : (z >= 7 ? 'crown' : bestMat);
        m.setRaw(x, y, z, mat(finalMat), partId[finalMat]);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.5, headZ: 9, centerZ: 5 });
  }

  // =========================================================================
  // 3. 倒挂隐蔽躯体（hideBody：14×16×12）
  //    蜷伏倒挂在横枝底侧，四只吸盘爪向上紧扣枝干，背部苔纹伪装，底端收出肉丝腺口
  // =========================================================================
  function buildHideBody(makeCanvas) {
    const W = 14, D = 16, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 倒挂蜷伏躯干主体（上宽接枝、下收出腺口，扁圆贴枝不显突兀）
    m.fillAABB(-6.0, 6.0, -6.5, 6.5, 1, 9, (x, y, z, X, Y) => {
      const t = (z - 1) / 8;
      const rx = lerp(2.8, 4.6, smoothstep(0.0, 0.75, t));
      const ry = lerp(3.0, 5.2, smoothstep(0.0, 0.75, t));
      const d = Math.hypot(X / rx, Y / ry, (z - 5.2) / 4.2);
      if (d <= 1.0) {
        const isMossPatch = t > 0.45 && Math.sin(X * 0.9 + Y * 0.7) > 0.35;
        m.setRaw(x, y, z, isMossPatch ? mat('moss') : mat('hide'), isMossPatch ? partId.moss : partId.hide);
      }
    });

    // 4 只向上弯抱横枝的短爪 + 扁圆吸盘（Yara-ma-yha-who 吸盘手脚特征）
    const clawCoords = [
      [-3.8,  2.8], [ 3.8,  2.8],
      [-3.8, -2.8], [ 3.8, -2.8]
    ];
    for (const [cx, cy] of clawCoords) {
      m.paintCapsule(cx * 0.72, cy * 0.75, 6.2, cx, cy, 9.8, 1.35, 1.10, mat('claw'), partId.claw, true);
      m.paintEllipsoid(cx, cy, 10.2, 1.45, 1.45, 0.85, mat('claw'), partId.claw, true);
    }

    // 下腹垂丝腺口（鲜红收束肉环，主韧性肉丝即从此口垂出）
    m.paintEllipsoid(0, 0, 1.4, 2.2, 2.2, 1.2, mat('vein'), partId.vein, true);
    m.paintEllipsoid(0, 0, 0.8, 1.3, 1.3, 0.8, mat('sac'), partId.sac, true);

    // 倒垂头颅微探向正面（+Y 侧偏下，便于俯视 0.6 倾角清晰看到窥视双眼）
    m.paintEllipsoid(0, 4.2, 4.4, 2.6, 2.3, 2.1, mat('hide'), partId.hide, true);

    m.despeckle();
    m.applyArtShading(true);

    // 表面落点雕一对警觉窥视窄眼（eyeGlint 严禁进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const eyeZ = 4;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.35);
      let sy = -1;
      for (let y = D - 1; y >= 1; y--) {
        if (m.getId(ex, y, eyeZ)) { sy = y; break; }
      }
      if (sy >= 0) {
        m.setRaw(ex, sy, eyeZ, keyToId.eyeIris, partId.eye);
        m.setRaw(ex, sy, eyeZ + 1, keyToId.eyeGlint, partId.eye);
        const ix = ex - s;
        if (ix >= 0 && ix < W) m.setRaw(ix, sy, eyeZ, keyToId.eyeDark, partId.eye);
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 6.2, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 4. 长肉囊三档资产（严禁常态缩放，靠切换烘焙资产表现一鼓一鼓脉动与骤降扑罩）
  //    - sacRelaxed (10×10×13)：舒张修长长肉囊
  //    - sacSwollen (12×12×12)：充血鼓胀长肉囊
  //    - sacPounce  (14×14×10)：骤降伞状展开扑罩态
  // =========================================================================
  function buildSacRelaxed(makeCanvas) {
    const m = new VoxelModel(10, 10, 13, SPEC);
    const { mat, partId } = SPEC;

    // 顶部肉丝衔接颈环（Z = 10..12）
    m.paintCapsule(0, 0, 9.6, 0, 0, 12.0, 1.45, 0.85, mat('vein'), partId.vein, true);

    // 修长滴水状半透外囊壁 + 5 条纵向脉动肌棱
    m.fillAABB(-4.5, 4.5, -4.5, 4.5, 1, 10, (x, y, z, X, Y) => {
      const t = (z - 1) / 9; // 0=底端, 1=顶颈
      const ang = Math.atan2(Y, X);
      const rib = Math.cos(ang * 5);
      const profile = Math.sin(t * Math.PI * 0.88 + 0.18);
      const r = (1.6 + profile * 2.15) + rib * 0.24;
      const d = Math.hypot(X, Y);
      if (d <= r) {
        const isCore = d <= r * 0.56 && t > 0.22 && t < 0.78;
        const isVein = rib > 0.62 && d > r * 0.72 && t > 0.14 && t < 0.88;
        if (isCore) m.setRaw(x, y, z, mat('core'), partId.core);
        else if (isVein) m.setRaw(x, y, z, mat('vein'), partId.vein);
        else m.setRaw(x, y, z, mat('sac'), partId.sac);
      }
    });

    // 底端收拢的 4 瓣捕食肉瓣
    for (let k = 0; k < 4; k++) {
      const a = k * (TAU / 4) + 0.38;
      m.paintCapsule(Math.cos(a) * 1.4, Math.sin(a) * 1.4, 2.2, Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0.5, 0.85, 0.55, mat('vein'), partId.vein, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 12, centerZ: 6 });
  }

  function buildSacSwollen(makeCanvas) {
    const m = new VoxelModel(12, 12, 12, SPEC);
    const { mat, partId } = SPEC;

    // 顶部紧绷肉颈环
    m.paintCapsule(0, 0, 9.2, 0, 0, 11.2, 1.65, 0.95, mat('vein'), partId.vein, true);

    // 鼓胀饱满的鲜红肉囊（横向外鼓 + 内核充血亮显）
    m.fillAABB(-5.5, 5.5, -5.5, 5.5, 1, 9, (x, y, z, X, Y) => {
      const t = (z - 1) / 8;
      const ang = Math.atan2(Y, X);
      const rib = Math.cos(ang * 5);
      const profile = Math.sin(t * Math.PI * 0.86 + 0.22);
      const r = (2.15 + profile * 2.85) + rib * 0.32;
      const d = Math.hypot(X, Y);
      if (d <= r) {
        const isCore = d <= r * 0.66 && t > 0.16 && t < 0.82;
        const isVein = rib > 0.52 && d > r * 0.72 && t > 0.12 && t < 0.86;
        if (isCore) m.setRaw(x, y, z, mat('core'), partId.core);
        else if (isVein) m.setRaw(x, y, z, mat('vein'), partId.vein);
        else m.setRaw(x, y, z, mat('sac'), partId.sac);
      }
    });

    // 底端微张的捕食口瓣（蓄势鼓动感）
    for (let k = 0; k < 5; k++) {
      const a = k * (TAU / 5);
      m.paintCapsule(Math.cos(a) * 2.0, Math.sin(a) * 2.0, 2.2, Math.cos(a) * 2.7, Math.sin(a) * 2.7, 0.5, 0.95, 0.58, mat('vein'), partId.vein, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.2, headZ: 11, centerZ: 5 });
  }

  function buildSacPounce(makeCanvas) {
    const m = new VoxelModel(14, 14, 10, SPEC);
    const { mat, partId } = SPEC;

    // 顶部紧绷肉丝颈扣
    m.paintCapsule(0, 0, 7.0, 0, 0, 9.2, 1.55, 0.90, mat('vein'), partId.vein, true);

    // 骤降扑罩时的伞状钟罩形态（上窄下阔外翻，直接罩向地面小生物）
    m.fillAABB(-6.5, 6.5, -6.5, 6.5, 1, 7, (x, y, z, X, Y) => {
      const t = (z - 1) / 6; // 0=贴地阔缘, 1=顶颈
      const ang = Math.atan2(Y, X);
      const scallop = Math.cos(ang * 6) * 0.42;
      const rOuter = lerp(6.0, 2.1, smoothstep(0.0, 1.0, t)) + scallop * (1 - t * 0.7);
      const rInner = t < 0.42 ? (rOuter - 1.75) : 0; // 底部微凹形成罩腔
      const d = Math.hypot(X, Y);
      if (d <= rOuter && d >= rInner) {
        const isCore = t > 0.38 && d <= rOuter * 0.62;
        const isVein = scallop > 0.22 && d > rOuter * 0.68;
        if (isCore) m.setRaw(x, y, z, mat('core'), partId.core);
        else if (isVein) m.setRaw(x, y, z, mat('vein'), partId.vein);
        else m.setRaw(x, y, z, mat('sac'), partId.sac);
      }
    });

    // 罩缘 6 枚外翻吸盘瓣
    for (let k = 0; k < 6; k++) {
      const a = k * (TAU / 6);
      m.paintEllipsoid(Math.cos(a) * 5.6, Math.sin(a) * 5.6, 0.9, 1.15, 1.15, 0.85, mat('vein'), partId.vein, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.4, headZ: 9, centerZ: 4 });
  }

  // =========================================================================
  // 5. 垂丝黏液珠节（dewNode：4×4×4 四重对称极轻小件）
  // =========================================================================
  function buildDewNode(makeCanvas) {
    const m = new VoxelModel(4, 4, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 1.6, 1.15, 1.15, 1.35, mat('sac'), partId.sac, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 1.2, headZ: 3, centerZ: 1.5 });
  }

  // =========================================================================
  // Def 注册对象
  // =========================================================================
  const Tree1Def = {
    id: 'tree1_hanging_sac',
    code: '树1',
    name: '倒挂垂囊',
    status: 'done',
    tag: 'M20 垂吊标杆（像素对齐深度排序画线 + 悬摆骤降回缩）',
    summary: '高位横枝与苔纹倒挂躯体藏于树冠（z≈36~44），经像素对齐深度排序韧性肉丝与辅助牵丝垂下鲜红半透长肉囊；平时钟摆轻晃、两档资产切换鼓胀脉动诱饵，周期性放线骤降扑罩地面扬尘，再急速绷丝微颤回缩树冠',
    defaultHabitat: 'canopy',
    footRadius: 12.0,
    ecoWeight: 1.3,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由伏击循环', loop: true, status: 'done' },
      { id: 'idle',   name: '高处悬摆待机', loop: true, status: 'done' },
      { id: 'drop',   name: '骤降扑罩演示', loop: true, status: 'done' }
    ],
    blocks: [
      '高位横枝与树冠叶蓬', '苔纹倒挂隐蔽躯体',
      '像素对齐深度排序主垂丝与辅助牵丝', '三档无损切换脉动/扑罩长肉囊',
      '弹簧钟摆悬垂与骤降回缩状态机'
    ],
    soulHabit: '倒挂在树冠高枝底侧，垂下鲜红半透长肉囊像钟摆轻轻摇晃并一鼓一鼓脉动诱饵；看准下方动静便突然放线骤降罩向地面扬起碎叶，再绷直肉丝高频微颤着急速拉回树冠',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        perchBranch: buildPerchBranch(makeCanvas),
        perchCanopy: buildPerchCanopy(makeCanvas),
        hideBody:    buildHideBody(makeCanvas),
        sacRelaxed:  buildSacRelaxed(makeCanvas),
        sacSwollen:  buildSacSwollen(makeCanvas),
        sacPounce:   buildSacPounce(makeCanvas),
        dewNode:     buildDewNode(makeCanvas)
      };

      // 弹簧解算器：钟摆双轴摆角 + 高枝受力上下回弹 + 肉囊垂高跟随
      const swingX = new SpringDamper1D(0, 16, 2.2);
      const swingY = new SpringDamper1D(0, 14, 2.1);
      const branchRecoil = new SpringDamper1D(0, 58, 5.2);
      const sacZSpring = new SpringDamper1D(14.5, 42, 6.2);

      const homeX0 = opts.homeX ?? 0;
      const homeY0 = opts.homeY ?? 0;
      const homeYaw0 = opts.homeYaw ?? 0;

      const state = {
        x: homeX0,
        y: homeY0,
        z: 37.0,
        vx: 0,
        vy: 0,
        yaw: homeYaw0,
        shadowScale: 0.42, // 高处枝冠漫射大暗斑；正下方精确垂高参照由 footContacts 承担
        // M20 垂吊状态机：'lure' | 'tense' | 'drop' | 'hold' | 'retract'
        stage: 'lure',
        stageTimer: 0,
        stageDur: 4.8,
        cycleSeq: 1,
        pulsePhase: 0,
        isSwollen: false,
        // 肉囊与垂丝实时世界坐标（供 buildPartList 与自检读取）
        sacX: homeX0,
        sacY: homeY0,
        sacZ: 14.5,
        sacYaw: homeYaw0,
        sacForm: 'relaxed', // 'relaxed' | 'swollen' | 'pounce'
        lineSag: 1.8,
        auxSag: 3.0,
        lineJitter: 0.04,
        auxJitter: 0.03,
        jitterPhase: 0,
        branchLift: 36.8,
        bodyLift: 30.2,
        targetOffX: 0,
        targetOffY: 0,
        seed: opts.seed ?? 61
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function nextStageDur(stageName, isDropDemo, seq) {
        const r = hash2i(seq, state.seed, 137);
        if (stageName === 'lure') {
          return isDropDemo ? lerp(1.35, 1.75, r) : lerp(4.3, 6.6, r);
        }
        if (stageName === 'tense') return lerp(0.28, 0.36, r);
        if (stageName === 'drop') return lerp(0.28, 0.36, r);
        if (stageName === 'hold') return lerp(0.26, 0.36, r);
        if (stageName === 'retract') return lerp(0.56, 0.74, r);
        return 4.5;
      }

      function enterStage(nextStage, isDropDemo, vfx, habitat, sMul) {
        state.stage = nextStage;
        state.stageTimer = 0;
        state.cycleSeq++;
        state.stageDur = nextStageDur(nextStage, isDropDemo, state.cycleSeq);

        if (nextStage === 'tense') {
          // 选定本次骤降扑罩的地面偏移落点（树枝正下方 ±4.2 格内微偏，呈现活体捕食瞄准）
          const ang = hash2i(state.cycleSeq, state.seed, 251) * TAU;
          const rad = lerp(1.2, 4.2, hash2i(state.cycleSeq, state.seed, 311)) * sMul;
          state.targetOffX = Math.cos(ang) * rad;
          state.targetOffY = Math.sin(ang) * rad;
          branchRecoil.impulse(4.2); // 本体收紧发力，枝干微弹
        } else if (nextStage === 'drop') {
          // 骤然放线
          branchRecoil.impulse(-6.5);
        } else if (nextStage === 'hold') {
          // 贴地扑罩瞬间：扬起碎叶尘粒 + 冲击环纹 + 短暂压痕
          emitPounceImpact(vfx, habitat, state.sacX, state.sacY, sMul);
        } else if (nextStage === 'retract') {
          // 急速拉回树冠，顶部横枝承受拉扯向下轻弯
          branchRecoil.impulse(-9.5);
        } else if (nextStage === 'lure') {
          // 回到高位树冠时抖落几片碎叶，并给钟摆一个小初速
          emitCanopyLeaves(vfx, state.x, state.y, state.branchLift + 4.0 * sMul, 3, sMul);
          const dir = (state.cycleSeq % 2 === 0) ? 1 : -1;
          swingX.impulse(dir * 0.42);
          swingY.impulse(-dir * 0.25);
        }
      }

      function emitPounceImpact(vfx, habitat, wx, wy, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const habFx = (habitat && habitat.fx) || { dustRGB: '120, 96, 70', foamRGB: '220, 232, 224', ringRGB: '198, 220, 184' };

        if (habitat && habitat.isWater) {
          vfx.spawnSplash(wx, wy, 7, 0.85 * sMul, habFx);
        } else {
          vfx.spawnDust(wx, wy, 7, 0.92 * sMul, habFx);
        }
        vfx.addRipple(wx, wy, 2.0 * sMul, 14.5 * sMul, 0.56, 1.8);
        if (typeof vfx.addDecal === 'function') {
          vfx.addDecal({
            kind: 'mound',
            x: wx,
            y: wy,
            yaw: state.sacYaw,
            rx: 4.8 * sMul,
            ry: 4.6 * sMul,
            life: 3.4,
            alpha: 0.48,
            color: fx.dust
          });
        }
        // 额外飞溅几片树冠碎叶与微红液滴
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * TAU + Math.random() * 0.5;
          const spd = (6.0 + Math.random() * 9.5) * sMul;
          vfx.spawnParticle(
            wx + (Math.random() - 0.5) * 3.0 * sMul,
            wy + (Math.random() - 0.5) * 3.0 * sMul,
            1.4 * sMul,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            (5.5 + Math.random() * 7.0) * sMul,
            0.42 + Math.random() * 0.26,
            1.35 + Math.random() * 0.45,
            k % 3 === 0 ? fx.drop : (k % 2 === 0 ? fx.leafA : fx.leafB),
            false,
            24
          );
        }
      }

      function emitCanopyLeaves(vfx, wx, wy, wz, count, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let k = 0; k < count; k++) {
          const a = Math.random() * TAU;
          const spd = (3.5 + Math.random() * 6.5) * sMul;
          vfx.spawnParticle(
            wx + (Math.random() - 0.5) * 10.0 * sMul,
            wy + (Math.random() - 0.5) * 4.0 * sMul,
            wz,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            (1.5 + Math.random() * 3.0) * sMul,
            0.85 + Math.random() * 0.45,
            1.25 + Math.random() * 0.4,
            k % 2 === 0 ? fx.leafA : fx.leafB,
            false,
            12
          );
        }
      }

      function refreshSockets(sMul) {
        const yw = state.yaw;
        // 倒挂躯体腹下主丝锚点（正好贴在 hideBody 底端腺口 Z ≈ bodyLift + 1.0）
        sockets.setLocal('mainAnchor', state.x, state.y, state.bodyLift, yw, 0, 0, 1.0, sMul);
        // 高位横枝左右副杈锚点（供 2 根辅助牵丝挂出柔和悬链弧）
        sockets.setLocal('auxAnchorL', state.x, state.y, state.branchLift, yw, -9.2,  2.2, 5.6, sMul);
        sockets.setLocal('auxAnchorR', state.x, state.y, state.branchLift, yw,  9.2, -2.0, 5.4, sMul);
      }

      const instance = {
        def: Tree1Def,
        cachePrefix: `tree1_hs_${Math.random().toString(36).slice(2, 7)}`,
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
          state.x = homeX;
          state.y = homeY;
          state.z = 37.0 * sMul;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.stage = 'lure';
          state.stageDur = 5.0;
          // 首轮提前走过半程，约 2.4s 后即可观赏第一次骤降扑罩，后续回归 4.3~6.6s 完整周期
          state.stageTimer = 2.6;
          state.cycleSeq = 1;
          state.pulsePhase = 0;
          state.isSwollen = false;
          state.sacForm = 'relaxed';
          state.branchLift = 36.8 * sMul;
          state.bodyLift = 30.2 * sMul;
          state.sacX = homeX;
          state.sacY = homeY;
          state.sacZ = 14.5 * sMul;
          state.sacYaw = homeYaw;
          state.lineSag = 1.8 * sMul;
          state.auxSag = 3.2 * sMul;
          state.lineJitter = 0.04;
          state.auxJitter = 0.03;
          state.jitterPhase = 0;
          state.targetOffX = 0;
          state.targetOffY = 0;

          swingX.x = 0.16; swingX.v = 0.12;
          swingY.x = -0.08; swingY.v = 0.06;
          branchRecoil.x = 0; branchRecoil.v = 0;
          sacZSpring.x = 14.5; sacZSpring.v = 0;

          refreshSockets(sMul);
          instance.footContacts = [{ x: state.sacX, y: state.sacY, z: state.sacZ, r: 4.2 * sMul }];
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));

          const actionId = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const isIdle = actionId === 'idle';
          const isDropDemo = actionId === 'drop';

          // 1. 高位横枝扎根稳悬（微幅树冠风晃，不漂移）
          const baseX = (eco && eco.homeX !== undefined) ? eco.homeX : homeX0;
          const baseY = (eco && eco.homeY !== undefined) ? eco.homeY : homeY0;
          const baseYaw = (eco && eco.homeYaw !== undefined) ? eco.homeYaw : homeYaw0;
          Propulsion.rooted(state, dt, time * 0.4, params, {
            ...(eco || {}),
            homeX: baseX,
            homeY: baseY,
            homeYaw: baseYaw,
            baseLift: 37.0 * sMul
          });
          state.yaw = baseYaw + Math.sin(time * 0.55) * 0.03 * flex;

          // 高枝受力上下回弹弹簧
          branchRecoil.update(dt, 0, 58 * sp, clamp(5.2 * dScale, 2.6, 8.8));
          const recoilZ = clamp(branchRecoil.x * 0.16, -2.0, 1.4);
          const windZ = Math.sin(time * 1.15) * 0.35 * flex;
          state.branchLift = (36.8 + recoilZ + windZ) * sMul;
          state.bodyLift = (30.2 + recoilZ * 1.15 + windZ) * sMul;
          state.z = state.branchLift;

          refreshSockets(sMul);
          const mainAnc = sockets.get('mainAnchor');

          // 2. 钟摆摆角弹簧（悬垂诱饵态自然轻摆，骤降/回缩迅速收稳指向目标）
          const windX = (Math.sin(time * 1.35 * gFreq) * 0.24 + (fbm1(time * 0.48, state.seed) - 0.5) * 0.28) * flex;
          const windY = (Math.cos(time * 1.08 * gFreq + 0.9) * 0.17 + (fbm1(time * 0.42, state.seed + 37) - 0.5) * 0.22) * flex;

          if (isIdle && state.stage !== 'lure') {
            state.stage = 'lure';
            state.stageTimer = 0;
            state.stageDur = 5.0;
          }

          // 3. 脉动呼吸相位（两档无损资产切换，严禁小数拉伸）
          const pulseRate = (state.stage === 'tense' ? 7.5 : (state.stage === 'hold' ? 6.2 : 2.65)) * gFreq;
          state.pulsePhase += dt * pulseRate;
          const pulseWave = Math.sin(state.pulsePhase);
          state.isSwollen = pulseWave > 0.28;

          // 4. 状态机推进
          state.stageTimer += dt * spdMul;
          const u = clamp(state.stageTimer / Math.max(0.01, state.stageDur), 0, 1);

          let desiredSacZ = 14.5 * sMul;
          let swingTargetX = windX;
          let swingTargetY = windY;
          let targetLineSag = 1.85 * sMul;
          let targetAuxSag = 3.25 * sMul;
          let targetJitter = 0.04;
          let targetAuxJitter = 0.03;

          if (state.stage === 'lure') {
            // 悬垂诱饵：半空钟摆轻晃 + 一鼓一鼓脉动 + 垂丝柔和下垂弧度
            desiredSacZ = (14.4 + Math.sin(time * 1.4 * gFreq) * 1.1 + (state.isSwollen ? -0.45 : 0.25)) * sMul;
            state.sacForm = state.isSwollen ? 'swollen' : 'relaxed';
            targetLineSag = (1.55 + Math.abs(swingX.x) * 2.2 + (state.isSwollen ? -0.25 : 0.25)) * sMul;
            targetAuxSag = (2.9 + Math.abs(swingX.x) * 1.8) * sMul;
            targetJitter = state.isSwollen ? 0.07 : 0.03;
            targetAuxJitter = 0.025;

            if (!isIdle && state.stageTimer >= state.stageDur) {
              enterStage('tense', isDropDemo, vfx, habitat, sMul);
            }
          } else if (state.stage === 'tense') {
            // 蓄势微提：先向上抽紧 2.5 格并鼓胀，给玩家清晰前摇
            desiredSacZ = lerp(14.5, 17.6, smoothstep(0, 1, u)) * sMul;
            swingTargetX = 0;
            swingTargetY = 0;
            state.sacForm = 'swollen';
            targetLineSag = lerp(1.5, 0.2, u) * sMul;
            targetAuxSag = lerp(2.8, 1.0, u) * sMul;
            targetJitter = lerp(0.08, 0.28, u);
            targetAuxJitter = lerp(0.04, 0.16, u);

            if (state.stageTimer >= state.stageDur) {
              enterStage('drop', isDropDemo, vfx, habitat, sMul);
            }
          } else if (state.stage === 'drop') {
            // 骤降扑罩（0.28~0.36s）：二次加速猛坠至地面（z -> 1.4），垂丝几乎绷直 sag -> 0
            const dropCurve = u * u;
            desiredSacZ = lerp(17.6, 1.4, dropCurve) * sMul;
            sacZSpring.x = desiredSacZ / sMul; // 骤降直驱，不拖泥带水
            sacZSpring.v = -48.0;
            swingTargetX = 0;
            swingTargetY = 0;
            state.sacForm = u > 0.45 ? 'pounce' : 'swollen';
            targetLineSag = 0.0;
            targetAuxSag = lerp(0.8, 0.15, u) * sMul;
            targetJitter = 0.12;
            targetAuxJitter = 0.08;

            if (state.stageTimer >= state.stageDur) {
              enterStage('hold', isDropDemo, vfx, habitat, sMul);
            }
          } else if (state.stage === 'hold') {
            // 贴地罩合：伞状肉囊贴地脉动吞罩
            desiredSacZ = (1.35 + Math.sin(u * Math.PI * 2) * 0.35) * sMul;
            sacZSpring.x = desiredSacZ / sMul;
            sacZSpring.v = 0;
            swingTargetX = 0;
            swingTargetY = 0;
            state.sacForm = 'pounce';
            targetLineSag = 0.05 * sMul;
            targetAuxSag = 0.35 * sMul;
            targetJitter = 0.18;
            targetAuxJitter = 0.10;

            if (state.stageTimer >= state.stageDur) {
              enterStage('retract', isDropDemo, vfx, habitat, sMul);
            }
          } else if (state.stage === 'retract') {
            // 急速回缩（0.56~0.74s）：快拉回高处（过冲至 21.8 格再回落 15.2 格），垂丝绷直高频微颤
            const pullU = smoothstep(0, 0.78, u);
            const overshoot = Math.sin(smoothstep(0.55, 1.0, u) * Math.PI) * 5.2;
            desiredSacZ = (lerp(1.4, 15.8, pullU) + overshoot) * sMul;
            sacZSpring.x = desiredSacZ / sMul;
            sacZSpring.v = (1 - u) * 28.0;
            swingTargetX = windX * 0.4;
            swingTargetY = windY * 0.4;
            state.sacForm = u < 0.30 ? 'swollen' : 'relaxed';
            targetLineSag = 0.0;
            targetAuxSag = 0.0;
            // 绷直高频微颤峰值
            const tautEnv = Math.sin(u * Math.PI);
            targetJitter = 0.28 + tautEnv * 0.32;
            targetAuxJitter = 0.18 + tautEnv * 0.24;

            if (state.stageTimer >= state.stageDur) {
              enterStage('lure', isDropDemo, vfx, habitat, sMul);
            }
          }

          // 更新钟摆弹簧与肉囊高度弹簧
          const swStiff = (state.stage === 'lure' ? 16 : 36) * sp;
          const swDamp = clamp((state.stage === 'lure' ? 2.2 : 5.4) * dScale, 1.3, 8.5);
          swingX.update(dt, swingTargetX, swStiff, swDamp);
          swingY.update(dt, swingTargetY, swStiff * 0.9, swDamp);

          if (state.stage === 'lure' || state.stage === 'tense') {
            sacZSpring.update(dt, desiredSacZ / sMul, 42 * sp, clamp(6.2 * dScale, 3.0, 10.0));
            state.sacZ = clamp(sacZSpring.x * sMul, 1.2 * sMul, 26.0 * sMul);
          } else {
            state.sacZ = clamp(desiredSacZ, 1.2 * sMul, 26.0 * sMul);
          }

          // 由垂长与摆角解算肉囊实时世界坐标（兼顾骤降时的地面落点偏移）
          const ropeLen = Math.max(4.0 * sMul, mainAnc.z - (state.sacZ + 9.5 * sMul));
          const aimBlend = (state.stage === 'drop' || state.stage === 'hold')
            ? 1.0
            : (state.stage === 'tense' ? smoothstep(0, 1, u) * 0.45 : (state.stage === 'retract' ? (1 - smoothstep(0, 0.85, u)) : 0));

          const pendLx = Math.sin(clamp(swingX.x, -0.52, 0.52)) * ropeLen * 0.72;
          const pendLy = Math.sin(clamp(swingY.x, -0.45, 0.45)) * ropeLen * 0.62;
          const [pwx, pwy] = localToWorldXY(mainAnc.x, mainAnc.y, state.yaw, pendLx, pendLy);
          state.sacX = pwx + state.targetOffX * aimBlend;
          state.sacY = pwy + state.targetOffY * aimBlend;
          state.sacYaw = wrapAngle(state.yaw + swingX.x * 0.95 + Math.sin(time * 0.9) * 0.14);

          // 平滑垂丝参数（下垂弧度与微颤频率）
          const kLine = expSmooth(dt, 14.0);
          state.lineSag = lerp(state.lineSag, targetLineSag, kLine);
          state.auxSag = lerp(state.auxSag, targetAuxSag, kLine);
          state.lineJitter = lerp(state.lineJitter, targetJitter, kLine);
          state.auxJitter = lerp(state.auxJitter, targetAuxJitter, kLine);
          const jitFreq = state.stage === 'retract' ? 52.0 : (state.stage === 'tense' ? 36.0 : 14.0);
          state.jitterPhase = (state.jitterPhase + dt * jitFreq) % (TAU * 16);

          // 地面正下方实时落点印（随肉囊高度与形态动态放大加深，清晰给出垂直空间高度感）
          const sacFootR = state.sacForm === 'pounce' ? 6.6 : (state.sacForm === 'swollen' ? 5.0 : 4.2);
          instance.footContacts = [
            { x: state.sacX, y: state.sacY, z: Math.max(0, state.sacZ - 1.2 * sMul), r: sacFootR * sMul }
          ];
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const isWater = !!(habitat && habitat.isWater);
          const waterLevel = habitat ? (habitat.waterLevel ?? -99) : -99;
          const calcSub = (z) => EnvFeedback.calcSubmerge(z, waterLevel, 5.0, isWater);
          const lineColors = (curSkin && curSkin.line) || SKINS[0].line;

          const mainAnc = sockets.get('mainAnchor');
          const auxL = sockets.get('auxAnchorL');
          const auxR = sockets.get('auxAnchorR');

          // 肉囊顶部衔接点（随 3 档形态的颈口高度精确对齐，避免垂丝与肉囊断开或插穿）
          const sacNeckH = state.sacForm === 'pounce' ? 8.8 : (state.sacForm === 'swollen' ? 10.6 : 11.4);
          const sacTopX = state.sacX;
          const sacTopY = state.sacY;
          const sacTopZ = state.sacZ + sacNeckH * sMul;

          // 辅助牵丝汇合在主垂丝约 68% 下方位置（既稳固牵引又不遮挡肉囊本体）
          const midU = 0.68;
          const midX = lerp(mainAnc.x, sacTopX, midU);
          const midY = lerp(mainAnc.y, sacTopY, midU);
          const midZ = lerp(mainAnc.z, sacTopZ, midU) - 4 * midU * (1 - midU) * state.lineSag;

          // 1. 高位横枝（z ≈ 36.8，隐蔽栖枝）
          list.push({
            partKey: 'perchBranch',
            asset: parts.perchBranch,
            x: state.x,
            y: state.y,
            lift: state.branchLift,
            ro: yw,
            submerge: calcSub(state.branchLift),
            bias: 0.45
          });

          // 2. 高位树冠叶蓬（z ≈ 41.6，盖在横枝上方形成垂挂树冠纵深）
          list.push({
            partKey: 'perchCanopy',
            asset: parts.perchCanopy,
            x: state.x,
            y: state.y,
            lift: state.branchLift + 4.8 * sMul,
            ro: wrapAngle(yw + 0.08),
            submerge: calcSub(state.branchLift + 5.0 * sMul),
            bias: 1.25,
            symDeg: 180
          });

          // 3. 倒挂隐蔽躯体（z ≈ 30.2，紧扣横枝底侧）
          list.push({
            partKey: 'hideBody',
            asset: parts.hideBody,
            x: state.x,
            y: state.y,
            lift: state.bodyLift,
            ro: yw,
            submerge: calcSub(state.bodyLift),
            bias: 0.15
          });

          // 4. 像素对齐深度排序画线：主韧性肉丝（直接走 core/renderer.js kind: 'line'）
          list.push({
            kind: 'line',
            partKey: 'mainSilk',
            x0: mainAnc.x,
            y0: mainAnc.y,
            z0: mainAnc.z,
            x1: sacTopX,
            y1: sacTopY,
            z1: sacTopZ,
            sag: state.lineSag,
            jitter: state.lineJitter,
            jitterPhase: state.jitterPhase,
            segments: 12,
            color: lineColors.main,
            outlineColor: lineColors.mainOutline,
            widthArtPx: 1,
            opacity: 0.96,
            bias: 0.05
          });

          // 5. 2 根极细辅助牵丝（从横枝两侧副杈垂向主丝结节，柔和悬链弧 sag + 高频绷颤）
          list.push({
            kind: 'line',
            partKey: 'auxSilkL',
            x0: auxL.x,
            y0: auxL.y,
            z0: auxL.z,
            x1: midX,
            y1: midY,
            z1: midZ,
            sag: state.auxSag,
            jitter: state.auxJitter,
            jitterPhase: state.jitterPhase + 1.1,
            segments: 10,
            color: lineColors.aux,
            outlineColor: '',
            widthArtPx: 1,
            opacity: 0.72,
            bias: -0.05
          });

          list.push({
            kind: 'line',
            partKey: 'auxSilkR',
            x0: auxR.x,
            y0: auxR.y,
            z0: auxR.z,
            x1: midX,
            y1: midY,
            z1: midZ,
            sag: state.auxSag * 0.92,
            jitter: state.auxJitter,
            jitterPhase: state.jitterPhase + 2.4,
            segments: 10,
            color: lineColors.aux,
            outlineColor: '',
            widthArtPx: 1,
            opacity: 0.72,
            bias: -0.05
          });

          // 6. 主垂丝中段 2 颗极轻黏液珠节（强化垂直空间层次）
          for (const uNode of [0.34, 0.68]) {
            const nx = lerp(mainAnc.x, sacTopX, uNode);
            const ny = lerp(mainAnc.y, sacTopY, uNode);
            const nz = lerp(mainAnc.z, sacTopZ, uNode) - 4 * uNode * (1 - uNode) * state.lineSag - 1.2 * sMul;
            list.push({
              partKey: 'dewNode',
              asset: parts.dewNode,
              x: nx,
              y: ny,
              lift: Math.max(0.5 * sMul, nz),
              ro: state.sacYaw,
              opacity: 0.84,
              submerge: calcSub(nz),
              bias: 0.12,
              symDeg: 90
            });
          }

          // 7. 鲜红半透脉动长肉囊（3 档预烘资产切换，严禁小数 scale 拉伸）
          const sacAsset = state.sacForm === 'pounce'
            ? parts.sacPounce
            : (state.sacForm === 'swollen' ? parts.sacSwollen : parts.sacRelaxed);
          const sacOpacity = state.sacForm === 'swollen' ? 0.90 : 0.85;
          const sacSymDeg = state.sacForm === 'pounce' ? 60 : 72;

          list.push({
            partKey: state.sacForm === 'pounce' ? 'sacPounce' : (state.sacForm === 'swollen' ? 'sacSwollen' : 'sacRelaxed'),
            asset: sacAsset,
            x: state.sacX,
            y: state.sacY,
            lift: state.sacZ,
            ro: state.sacYaw,
            opacity: sacOpacity,
            submerge: calcSub(state.sacZ + 2.0 * sMul),
            bias: 0.25,
            symDeg: sacSymDeg
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Tree1Def.id,
            code: Tree1Def.code,
            name: Tree1Def.name,
            status: Tree1Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            footRadius: Tree1Def.footRadius,
            headZ: 46,
            centerZ: 24,
            blocks: Tree1Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Tree1Def);
})(window.PixelWorkshop);
