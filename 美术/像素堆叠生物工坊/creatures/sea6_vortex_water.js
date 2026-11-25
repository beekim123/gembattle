'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, fbm1, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 海6 · 一团转着的海水（M33 没形状的流质 / 旋涡 标杆）
  //   1. 俯视清晰度与层次：
  //      - 4 层错速旋转流质圆盘（全部 noOutline: true 防叠成黑圈，symDeg: 90 极省贴图），
  //        自下而上直径渐收（38 -> 30 -> 22 -> 15 格），每层雕出清晰 4 旋臂雪白浪沫
  //        与深靛暗水沟、亮青碧渐变水环（opacity: 0.58 ~ 0.82），在浅海环礁碧水上轮廓分明；
  //      - 正中一颗高对比深靛蓝脉动内核（配 3 档亮青自亮槽 glowKeys），俯视零遮挡锁死重心；
  //      - 体内卷入 4 条鲜橙红/亮金小鱼（保留描边突出辨识度）与 3 片翠绿海草带绕核螺旋公转，
  //        小鱼严格沿轨道切向朝前游动；
  //      - 外圈伴随 8 颗无描边水珠散粒（noOutline: true），随周期节律甩飞又吸回。
  //   2. 旋涡力学：
  //      - 周期性「加速旋吸 -> 甩出一圈水珠与气泡粒子 -> 再次收拢吸回」吞吐节律，
  //        同步在浅海表面带出旋转涟漪 vfx.addRipple；
  //      - 严禁常态 scaleX/scaleY 拉伸，呼吸感全由层高起伏与内核弹簧完成；
  //      - 巡游严格钳制在 maxRadius * 0.78 内。
  //   3. 颜色：30 色、0 重色、3 套零重建模换色皮肤（环礁碧沫金鱼、深潮靛紫赤鱼、暖湾青绿银鱼）。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 深靛暗水沟（与浅海碧水地台拉开强对比）
      deepDark:     '#061c36',
      deepMid:      '#0c345e',
      deepHi:       '#175287',
      // 亮青碧渐变水环
      waterDark:    '#106887',
      waterMid:     '#229cb8',
      waterHi:      '#5ad1e3',
      // 螺旋白沫旋臂
      foamDark:     '#96e2ed',
      foamMid:      '#d2f6fc',
      foamHi:       '#f7feff',
      // 正中深靛脉动内核
      coreDark:     '#051029',
      coreMid:      '#0d234d',
      coreHi:       '#1e4480',
      // 内核自亮槽（严格 3 档色阶，仅此处进 glowKeys）
      emissiveMid:  '#18b4cc',
      emissiveHot:  '#5df0ff',
      emissiveCore: '#d8ffff',
      // 鲜橙红小鱼主躯
      fishDark:     '#bf3511',
      fishMid:      '#f05d1c',
      fishHi:       '#ff9a40',
      // 亮金小鱼鳍与斑纹
      goldDark:     '#cf840a',
      goldMid:      '#ffbc22',
      goldHi:       '#fff080',
      // 小鱼黑眼与眼白（不进 glowKeys 防发糊）
      eyeDark:      '#0a0d14',
      eyeMid:       '#1c2433',
      eyeHi:        '#edf4fa',
      // 翠绿海草带
      kelpDark:     '#186939',
      kelpMid:      '#2da655',
      kelpHi:       '#79de7f',
      // 外圈甩吸无描边水珠散粒
      dropDark:     '#17789e',
      dropMid:      '#66d4eb',
      dropHi:       '#e8fcff'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'deep', 'water', 'foam', 'core', 'emissive',
      'fish', 'gold', 'eye', 'kelp', 'drop'
    ],
    noCrease: [
      ['deep', 'water'],
      ['water', 'foam'],
      ['core', 'emissive'],
      ['fish', 'gold'],
      ['fish', 'eye'],
      ['gold', 'eye']
    ],
    materials: {
      deep:     ['deepDark',    'deepMid',     'deepHi'],
      water:    ['waterDark',   'waterMid',    'waterHi'],
      foam:     ['foamDark',    'foamMid',     'foamHi'],
      core:     ['coreDark',    'coreMid',     'coreHi'],
      emissive: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
      fish:     ['fishDark',    'fishMid',     'fishHi'],
      gold:     ['goldDark',    'goldMid',     'goldHi'],
      eye:      ['eyeDark',     'eyeMid',      'eyeHi'],
      kelp:     ['kelpDark',    'kelpMid',     'kelpHi'],
      drop:     ['dropDark',    'dropMid',     'dropHi']
    },
    protectedParts: ['emissive', 'eye', 'foam']
  });

  const SKINS = [
    {
      id: 'reef_goldfish',
      name: '环礁碧沫金鱼',
      dot: '#229cb8',
      outline: '#071726',
      splashFoam: '#e6fcff',
      splashTint: '#5ad1e3',
      pal: {}
    },
    {
      id: 'deep_indigo_crimson',
      name: '深潮靛紫赤鱼',
      dot: '#4d46a8',
      outline: '#0d0921',
      splashFoam: '#e8e4ff',
      splashTint: '#8d7ef5',
      pal: {
        deepDark:     '#120c38', deepMid:      '#22195c', deepHi:       '#392c8a',
        waterDark:    '#2c3c94', waterMid:     '#4d63c4', waterHi:      '#859cf2',
        foamDark:     '#aebef7', foamMid:      '#dce5ff', foamHi:       '#f5f7ff',
        coreDark:     '#0c0624', coreMid:      '#1f104a', coreHi:       '#3e227d',
        emissiveMid:  '#7c4dff', emissiveHot:  '#b78aff', emissiveCore: '#efe0ff',
        fishDark:     '#a8132c', fishMid:      '#e6294b', fishHi:       '#ff758a',
        goldDark:     '#cf5215', goldMid:      '#ff8738', goldHi:       '#ffd08a',
        eyeDark:      '#0c0a14', eyeMid:       '#211d30', eyeHi:        '#f2f0fa',
        kelpDark:     '#125c54', kelpMid:      '#239485', kelpHi:       '#6edbc6',
        dropDark:     '#3f4fa8', dropMid:      '#8a9cf5', dropHi:       '#edf0ff'
      }
    },
    {
      id: 'warm_bay_silver',
      name: '暖湾青绿银鱼',
      dot: '#24ad99',
      outline: '#081f1c',
      splashFoam: '#e8fff9',
      splashTint: '#5ce0c8',
      pal: {
        deepDark:     '#07292a', deepMid:      '#0f4a4b', deepHi:       '#1c7370',
        waterDark:    '#147d72', waterMid:     '#28b59f', waterHi:      '#6de3cc',
        foamDark:     '#a4f0df', foamMid:      '#dafcf3', foamHi:       '#f7fffd',
        coreDark:     '#041c21', coreMid:      '#0a3840', coreHi:       '#17616b',
        emissiveMid:  '#1fd19c', emissiveHot:  '#6effc9', emissiveCore: '#defff2',
        fishDark:     '#738799', fishMid:      '#b4c7d6', fishHi:       '#edf6fc',
        goldDark:     '#c79812', goldMid:      '#f5ca3b', goldHi:       '#fff29e',
        eyeDark:      '#0a1012', eyeMid:       '#1c2b30', eyeHi:        '#f0f8fa',
        kelpDark:     '#38731a', kelpMid:      '#62ad2b', kelpHi:       '#a8e85d',
        dropDark:     '#1b8a7d', dropMid:      '#6ae0cb', dropHi:       '#ebfffa'
      }
    }
  ];

  // =========================================================================
  // 1. 体素建模
  //    - 4 层四重对称流质旋涡圆盘（symDeg: 90，全部 noOutline: true）
  //    - 1 颗高对比深靛脉动内核（配 3 档自亮槽）
  //    - 2 款鲜明小鱼（鲜橙红条纹鱼 + 亮金礁鱼）+ 1 款翠绿海草带
  //    - 2 款外圈无描边水珠散粒（大白沫水珠 + 小青碧水滴）
  // =========================================================================

  // 通用四重对称螺旋水盘生成器（严格保证 90° 旋转对称以支持 symDeg: 90）
  function buildVortexDisc(makeCanvas, cfg) {
    const { size, h, rOuter, rInner, twist, armSharp, foamThresh, bowlSlope } = cfg;
    const m = new VoxelModel(size, size, h, SPEC);
    const { mat, partId } = SPEC;
    const half = (size - 1) * 0.5;

    m.fillAABB(-half, half, -half, half, 0, h - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      if (r < rInner || r > rOuter) return;

      const ang = Math.atan2(Y, X);
      const uR = clamp((r - rInner) / Math.max(1, rOuter - rInner), 0, 1);

      // 4 条清晰螺旋旋臂波（严格 4 重对称，ang * 4）
      const spiralPhase = ang * 4 + r * twist;
      const armWave = Math.sin(spiralPhase);
      const armSub = Math.cos(spiralPhase * 2);

      // 外缘呈四瓣螺旋锯齿浪边，拒绝死板正圆
      const edgeRipple = 0.88 + 0.12 * Math.sin(spiralPhase - 0.6);
      if (uR > edgeRipple) return;

      // 螺旋间隙轻微镂空，露出下层错速水环与游鱼
      if (uR > 0.36 && uR < 0.88 && armWave < -0.68 && z === h - 1) return;
      if (uR > 0.72 && armWave < -0.45 && z > 0) return;

      // 涡壁高度分布：带轻微碗状抬起与白沫浪脊凸起
      const ridgeH = (armWave > armSharp ? 0.9 : 0) + (bowlSlope ? uR * bowlSlope : 0);
      const localTop = clamp(Math.floor((h - 1.15) * (0.45 + 0.55 * (1 - Math.abs(uR - 0.58))) + ridgeH), 0, h - 1);
      if (z > localTop) return;

      // 三段高对比配色：螺旋雪白浪沫脊 / 亮青碧主水环 / 深靛暗水沟
      const isFoam = (armWave > foamThresh && z >= Math.max(0, localTop - 1))
        || (uR > 0.80 && armWave > 0.15 && z === localTop)
        || (uR < 0.24 && armSub > 0.45 && z === localTop);
      const isDeepGroove = armWave < -0.18 || (z === 0 && uR < 0.48 && armWave < 0.22);

      if (isFoam) {
        m.setRaw(x, y, z, mat('foam'), partId.foam);
      } else if (isDeepGroove) {
        m.setRaw(x, y, z, mat('deep'), partId.deep);
      } else {
        m.setRaw(x, y, z, mat('water'), partId.water);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: rOuter, headZ: h, centerZ: Math.floor(h * 0.5) });
  }

  // 正中醒目深靛脉动内核（12×12×8，四重对称 symDeg: 90，含 3 档亮青自亮槽）
  function buildVortexCore(makeCanvas) {
    const W = 12, D = 12, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5.5, 5.5, -5.5, 5.5, 0, H - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const nz = (z - 3.4) / 3.6;
      const lobe = 1.0 + 0.08 * Math.cos(ang * 4 + z * 0.55);
      const ell = (r * r) / (4.5 * 4.5 * lobe * lobe) + nz * nz;
      if (ell > 1.0) return;

      // 4 道螺旋自亮纹槽 + 顶部中心亮核点（在 0.6 俯视倾角下零遮挡）
      const groove = Math.sin(ang * 4 + z * 0.65);
      const isTopEye = z >= 6 && r <= 1.75;
      const isSpiralGlow = z >= 3 && z <= 6 && r >= 1.8 && groove > 0.66;
      const isRimFoam = z >= 4 && r >= 3.2 && groove < -0.72;

      if (isTopEye || isSpiralGlow) {
        m.setRaw(x, y, z, mat('emissive'), partId.emissive);
      } else if (isRimFoam) {
        m.setRaw(x, y, z, mat('foam'), partId.foam);
      } else {
        m.setRaw(x, y, z, mat('core'), partId.core);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8, headZ: 8, centerZ: 4 });
  }

  // 体内配角 1：鲜橙红条纹小丑鱼（8×12×5，头朝 +Y，尾朝 -Y，保留描边突出辨识度）
  function buildReefFishA(makeCanvas) {
    const W = 8, D = 12, H = 5;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 梭形鱼身（头在 +Y，尾在 -Y）
    m.paintEllipsoid(0, 0.8, 2.1, 2.3, 4.1, 1.8, mat('fish'), partId.fish, true);
    // 两道醒目亮金横纹（让俯视一眼认出活泼小鱼）
    m.fillAABB(-2.5, 2.5, -1.6, 2.6, 1, 4, (x, y, z, X, Y) => {
      if (m.getId(x, y, z) === 0) return;
      if ((Y > 1.0 && Y < 2.2) || (Y > -1.4 && Y < -0.3)) {
        m.setRaw(x, y, z, mat('gold'), partId.gold);
      }
    });
    // 宽扇形亮金尾鳍（-Y 端）
    m.paintEllipsoid(0, -4.1, 2.1, 1.4, 1.8, 1.6, mat('gold'), partId.gold, true);
    // 两侧小胸鳍
    m.paintEllipsoid(-2.3, 0.7, 1.6, 1.1, 1.2, 0.7, mat('gold'), partId.gold, true);
    m.paintEllipsoid( 2.3, 0.7, 1.6, 1.1, 1.2, 0.7, mat('gold'), partId.gold, true);
    // 背鳍脊
    m.paintCapsule(0, 1.5, 3.6, 0, -2.0, 3.3, 0.65, 0.55, mat('gold'), partId.gold, true);
    // 清晰黑亮鱼眼（左右对称）
    m.setRaw(Math.round(W * 0.5 - 1.5), Math.round(D * 0.5 + 3.0), 2, mat('eye'), partId.eye);
    m.setRaw(Math.round(W * 0.5 + 1.0), Math.round(D * 0.5 + 3.0), 2, mat('eye'), partId.eye);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 5, centerZ: 2 });
  }

  // 体内配角 2：亮金赤尾礁鱼（7×10×4，头朝 +Y，尾朝 -Y，小巧圆润）
  function buildReefFishB(makeCanvas) {
    const W = 7, D = 10, H = 4;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 亮金主躯
    m.paintEllipsoid(0, 0.6, 1.8, 2.0, 3.4, 1.5, mat('gold'), partId.gold, true);
    // 鲜橙红背脊与尾鳍
    m.paintCapsule(0, 1.2, 2.9, 0, -1.6, 2.7, 0.7, 0.55, mat('fish'), partId.fish, true);
    m.paintEllipsoid(0, -3.4, 1.8, 1.2, 1.4, 1.3, mat('fish'), partId.fish, true);
    // 左右鱼眼
    m.setRaw(Math.round(W * 0.5 - 1.3), Math.round(D * 0.5 + 2.4), 2, mat('eye'), partId.eye);
    m.setRaw(Math.round(W * 0.5 + 0.8), Math.round(D * 0.5 + 2.4), 2, mat('eye'), partId.eye);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 4, centerZ: 2 });
  }

  // 体内配角 3：翠绿弯曲海草带（6×12×4，弧形叶片顺水流舒展）
  function buildKelpRibbon(makeCanvas) {
    const W = 6, D = 12, H = 4;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    for (let i = 0; i < 10; i++) {
      const u = i / 9;
      const ly = lerp(-4.5, 4.5, u);
      const lx = Math.sin(u * Math.PI * 1.45) * 1.35;
      const lz = 1.2 + Math.sin(u * Math.PI) * 1.1;
      const r = lerp(0.85, 1.35, Math.sin(u * Math.PI)) * (1 - u * 0.2);
      m.paintEllipsoid(lx, ly, lz, r, 1.1, 0.72, mat('kelp'), partId.kelp, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 4, centerZ: 2 });
  }

  // 外圈无描边水珠散粒 A（大白沫水珠 5×5×3，symDeg: 90，noOutline: true）
  function buildDropletBig(makeCanvas) {
    const W = 5, D = 5, H = 3;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 1.1, 1.9, 1.9, 1.1, mat('drop'), partId.drop, true);
    m.paintEllipsoid(0, 0, 1.9, 1.1, 1.1, 0.7, mat('foam'), partId.foam, true);
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0, headZ: 3, centerZ: 1 });
  }

  // 外圈无描边水珠散粒 B（小深碧水滴 4×4×2，symDeg: 90，noOutline: true）
  function buildDropletSmall(makeCanvas) {
    const W = 4, D = 4, H = 2;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 0.8, 1.4, 1.4, 0.8, mat('drop'), partId.drop, true);
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.5, headZ: 2, centerZ: 1 });
  }

  // =========================================================================
  // 2. 轨道配角与散粒配置表
  // =========================================================================
  const FISH_SPECS = [
    { key: 'fishA', baseR: 13.8, zBase: 3.1, omega: 1.55, phase0: 0.35, dir: 1, bobAmp: 0.85, bobFreq: 2.6 },
    { key: 'fishB', baseR: 10.6, zBase: 4.6, omega: 2.05, phase0: 2.15, dir: 1, bobAmp: 0.75, bobFreq: 3.2 },
    { key: 'fishA', baseR: 12.2, zBase: 3.8, omega: 1.75, phase0: 3.95, dir: 1, bobAmp: 0.80, bobFreq: 2.9 },
    { key: 'fishB', baseR: 8.8,  zBase: 5.5, omega: 2.35, phase0: 5.30, dir: 1, bobAmp: 0.65, bobFreq: 3.5 }
  ];

  const KELP_SPECS = [
    { baseR: 15.2, zBase: 2.2, omega: 1.15, phase0: 1.05, bobAmp: 0.55 },
    { baseR: 11.4, zBase: 3.3, omega: 1.48, phase0: 3.18, bobAmp: 0.65 },
    { baseR: 14.0, zBase: 2.7, omega: 1.28, phase0: 5.12, bobAmp: 0.60 }
  ];

  const DROPLET_SPECS = [
    { key: 'dropBig',   baseR: 17.6, flingR: 25.2, zBase: 1.9, zPeak: 6.2, omega: 1.35, phase0: 0.00, delay: 0.00 },
    { key: 'dropSmall', baseR: 16.4, flingR: 23.4, zBase: 3.1, zPeak: 7.4, omega: 1.65, phase0: 0.82, delay: 0.06 },
    { key: 'dropBig',   baseR: 17.8, flingR: 25.8, zBase: 2.1, zPeak: 6.6, omega: 1.30, phase0: 1.60, delay: 0.03 },
    { key: 'dropSmall', baseR: 15.8, flingR: 22.8, zBase: 3.5, zPeak: 7.8, omega: 1.72, phase0: 2.38, delay: 0.09 },
    { key: 'dropBig',   baseR: 17.4, flingR: 24.8, zBase: 2.0, zPeak: 6.0, omega: 1.40, phase0: 3.16, delay: 0.02 },
    { key: 'dropSmall', baseR: 16.2, flingR: 23.6, zBase: 3.2, zPeak: 7.2, omega: 1.62, phase0: 3.96, delay: 0.07 },
    { key: 'dropBig',   baseR: 17.9, flingR: 25.6, zBase: 2.2, zPeak: 6.8, omega: 1.32, phase0: 4.74, delay: 0.04 },
    { key: 'dropSmall', baseR: 16.0, flingR: 23.0, zBase: 3.4, zPeak: 7.6, omega: 1.68, phase0: 5.52, delay: 0.10 }
  ];

  // =========================================================================
  // 3. 生物定义（海6 · 一团转着的海水）
  // =========================================================================
  const Sea6VortexWaterDef = {
    id: 'sea6_vortex_water',
    code: '海6',
    name: '一团转着的海水',
    status: 'done',
    tag: 'M33 标杆 · 流质旋涡',
    summary: '4 层错速旋转的无描边半透海水圆盘（symDeg 90，螺旋雪白浪沫与深靛暗水沟强对比）环绕深靛脉动内核，体内卷着 4 条鲜橙金小鱼与 3 片翠绿海草绕核公转，外圈伴随周期甩出又吸回的无描边水珠散粒与浅海旋转涟漪',
    defaultHabitat: 'reef',
    footRadius: 17.5,
    ecoWeight: 1.25,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '4 层错速半透流质圆盘（noOutline + symDeg 90）',
      '高对比深靛脉动内核（3 档亮青自亮槽）',
      '体内 4 条小鱼与 3 片海草螺旋轨道公转',
      '周期「旋吸→甩出水珠→收拢吸回」吞吐节律',
      '浅海旋转涟漪与飞沫气泡粒子反馈'
    ],
    soulHabit: '在浅海环礁的碧水池里慢慢挪动，四层海水以不同转速错开旋转，周期性加速旋吸并甩出一圈水珠泡沫再猛然吸回；几条鲜艳小鱼和翠绿海草躲在它旋涡中段跟着打转',
    actions: [
      { id: 'patrol', name: '浅海巡旋（慢移＋错速旋转＋周期甩吸）', loop: true, status: 'done' },
      { id: 'idle',   name: '原地慢旋（错速盘旋＋小鱼绕核游）', loop: true, status: 'done' },
      { id: 'surge',  name: '狂旋甩吸（高速旋涡＋水珠齐甩再猛吸）', loop: true, status: 'done' }
    ],
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        // 自下而上直径渐收：38 -> 30 -> 22 -> 15 格，全部 90° 四重对称
        disc0: buildVortexDisc(makeCanvas, {
          size: 38, h: 3, rOuter: 18.2, rInner: 5.5, twist: 0.30, armSharp: 0.35, foamThresh: 0.56, bowlSlope: 0.25
        }),
        disc1: buildVortexDisc(makeCanvas, {
          size: 30, h: 3, rOuter: 14.2, rInner: 4.6, twist: 0.38, armSharp: 0.32, foamThresh: 0.50, bowlSlope: 0.45
        }),
        disc2: buildVortexDisc(makeCanvas, {
          size: 22, h: 3, rOuter: 10.4, rInner: 3.8, twist: 0.48, armSharp: 0.28, foamThresh: 0.44, bowlSlope: 0.65
        }),
        disc3: buildVortexDisc(makeCanvas, {
          size: 16, h: 3, rOuter: 7.2,  rInner: 3.2, twist: 0.62, armSharp: 0.22, foamThresh: 0.34, bowlSlope: 0.85
        }),
        coreOrb:   buildVortexCore(makeCanvas),
        fishA:     buildReefFishA(makeCanvas),
        fishB:     buildReefFishB(makeCanvas),
        kelpBlade: buildKelpRibbon(makeCanvas),
        dropBig:   buildDropletBig(makeCanvas),
        dropSmall: buildDropletSmall(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;
      const seed0 = opts.seed ?? 63;

      const coreLiftSpring = new SpringDamper1D(0, 110, 11.0);
      const radialSpring = new SpringDamper1D(0, 75, 8.5);
      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      const state = {
        x: hx0, y: hy0, z: 0.6,
        vx: 0, vy: 0, yaw: hyaw0,
        shadowScale: 0.92,
        // 4 层圆盘独立角度与高度相位
        discAng: [0.0, 0.78, 1.55, 2.32],
        coreAng: 0.2,
        // 周期性吞吐节律（0..1 循环）
        cycleT: 0,
        cyclePhase: 0,
        spinBoost: 1.0,
        flingAmt: 0.0,
        suckAmt: 0.0,
        rippleCd: 0.2,
        sprayCd: 0.15,
        burstEmitted: false,
        // 巡游慢移目标点
        navX: hx0,
        navY: hy0,
        navPause: 0.4,
        navSeq: 1,
        // 体内配角与散粒运行时角度
        fishAng: FISH_SPECS.map(f => f.phase0),
        kelpAng: KELP_SPECS.map(k => k.phase0),
        dropAng: DROPLET_SPECS.map(d => d.phase0),
        lastTime: 0,
        lastMaxR: 44
      };

      function pickNextWanderTarget(maxR, homeX, homeY) {
        state.navSeq++;
        const limR = maxR * 0.72;
        const curAng = Math.atan2(state.y - homeY, state.x - homeX);
        const turn = (hash2i(state.navSeq, seed0, 107) > 0.5 ? 1 : -1)
          * lerp(1.25, 2.55, hash2i(state.navSeq, seed0, 223));
        const r = lerp(limR * 0.35, limR, hash2i(state.navSeq, seed0, 359));
        let tx = homeX + Math.cos(curAng + turn) * r;
        let ty = homeY + Math.sin(curAng + turn) * r;
        const d0 = Math.hypot(tx, ty);
        if (d0 > maxR * 0.76) {
          tx *= (maxR * 0.76) / d0;
          ty *= (maxR * 0.76) / d0;
        }
        state.navX = tx;
        state.navY = ty;
        state.navPause = lerp(0.8, 1.8, hash2i(state.navSeq, seed0, 487));
      }

      const instance = {
        def: Sea6VortexWaterDef,
        cachePrefix: `sea6_vortex_water_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 0.6;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.shadowScale = 0.92;
          state.discAng = [0.0, 0.78, 1.55, 2.32];
          state.coreAng = 0.2;
          state.cycleT = 0.22;
          state.cyclePhase = 0.04;
          state.spinBoost = 1.0;
          state.flingAmt = 0.0;
          state.suckAmt = 0.0;
          state.rippleCd = 0.2;
          state.sprayCd = 0.15;
          state.burstEmitted = false;
          state.navX = hx;
          state.navY = hy;
          state.navPause = 0.4;
          state.navSeq = 1;
          state.fishAng = FISH_SPECS.map(f => f.phase0);
          state.kelpAng = KELP_SPECS.map(k => k.phase0);
          state.dropAng = DROPLET_SPECS.map(d => d.phase0);
          coreLiftSpring.x = 0; coreLiftSpring.v = 0;
          radialSpring.x = 0; radialSpring.v = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const speedMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const maxR = (eco && eco.maxRadius) || 44;
          const patrolLim = maxR * 0.78;
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;

          state.lastTime = time;
          state.lastMaxR = maxR;
          footContacts.length = 0;

          // -----------------------------------------------------------------
          // 1. 整体位移：patrol 浅海慢速游移（严格钳制在 maxRadius * 0.78 内）
          //    idle / surge 留在原点附近做微幅水波漂移
          // -----------------------------------------------------------------
          if (action === 'patrol') {
            if (state.navPause > 0) {
              state.navPause -= dt;
            } else {
              const dist = Math.hypot(state.navX - state.x, state.navY - state.y);
              if (dist < 4.5) {
                pickNextWanderTarget(maxR, homeX, homeY);
              }
            }
            const wobbleX = (fbm1(time * 0.45, seed0) - 0.5) * 4.2;
            const wobbleY = (fbm1(time * 0.41, seed0 + 31) - 0.5) * 4.2;
            const tx = state.navX + wobbleX + ((eco && eco.avoidX) || 0) * 0.35;
            const ty = state.navY + wobbleY + ((eco && eco.avoidY) || 0) * 0.35;
            const dx = tx - state.x;
            const dy = ty - state.y;
            const d = Math.hypot(dx, dy);
            const moveSpd = (state.navPause > 0 ? 2.4 : 7.8) * speedMul;
            const targetVx = d > 0.4 ? (dx / d) * Math.min(moveSpd, d * 1.4) : 0;
            const targetVy = d > 0.4 ? (dy / d) * Math.min(moveSpd, d * 1.4) : 0;
            const kVel = expSmooth(dt, 2.6);
            state.vx = lerp(state.vx, targetVx, kVel);
            state.vy = lerp(state.vy, targetVy, kVel);
            state.x += state.vx * dt;
            state.y += state.vy * dt;
          } else {
            const driftAmp = action === 'surge' ? 2.2 : 1.5;
            const tx = homeX + Math.sin(time * 0.65 + seed0) * driftAmp;
            const ty = homeY + Math.cos(time * 0.53 + seed0) * driftAmp;
            const kPos = expSmooth(dt, 3.2);
            const nx = lerp(state.x, tx, kPos);
            const ny = lerp(state.y, ty, kPos);
            state.vx = (nx - state.x) / Math.max(dt, 0.001);
            state.vy = (ny - state.y) / Math.max(dt, 0.001);
            state.x = nx;
            state.y = ny;
          }

          // 严格钳制巡游坐标在 maxRadius * 0.78 内
          const curR = Math.hypot(state.x, state.y);
          if (curR > patrolLim) {
            state.x *= patrolLim / curR;
            state.y *= patrolLim / curR;
          }
          state.z = 0.6 + Math.sin(time * 1.9 * gFreq) * 0.35;

          // -----------------------------------------------------------------
          // 2. 周期性「加速旋吸 -> 甩出一圈水珠与气泡 -> 收拢吸回」吞吐节律
          // -----------------------------------------------------------------
          const cycleDur = action === 'surge' ? 3.1 : (action === 'idle' ? 8.0 : 6.2);
          state.cycleT += dt * gFreq * (action === 'surge' ? 1.15 : 1.0);
          const prevPhase = state.cyclePhase;
          const phase = (state.cycleT % cycleDur) / cycleDur;
          state.cyclePhase = phase;
          if (phase < prevPhase) {
            state.burstEmitted = false;
          }

          let targetSpin = 1.0;
          let targetFling = 0.0;
          let targetSuck = 0.0;
          let coreLiftTarget = Math.sin(time * 2.4 * gFreq) * 0.45;

          if (action === 'idle') {
            // 原地慢旋：舒缓错速旋转，微幅呼吸
            targetSpin = 0.72 + 0.14 * Math.sin(phase * TAU);
            targetFling = 0.12 * (0.5 + 0.5 * Math.sin(phase * TAU));
            targetSuck = 0.15 * (0.5 - 0.5 * Math.sin(phase * TAU));
          } else {
            const isSurge = action === 'surge';
            if (phase < 0.36) {
              // 阶段 1：加速旋吸（圆盘提速、散粒与鱼群向核收紧、内核微沉蓄势）
              const u = smoothstep(0, 0.36, phase);
              targetSpin = lerp(0.95, isSurge ? 2.65 : 1.95, u);
              targetSuck = u * (isSurge ? 1.0 : 0.78);
              targetFling = 0;
              coreLiftTarget = -u * (isSurge ? 1.05 : 0.70);
            } else if (phase < 0.68) {
              // 阶段 2：爆发甩出（高速旋转甩出一圈无描边水珠与气泡粒子）
              const u = (phase - 0.36) / 0.32;
              const arc = Math.sin(u * Math.PI);
              targetSpin = lerp(isSurge ? 2.85 : 2.15, isSurge ? 1.90 : 1.35, u);
              targetSuck = (1 - smoothstep(0, 0.25, u)) * 0.5;
              targetFling = arc * (isSurge ? 1.25 : 0.96);
              coreLiftTarget = arc * (isSurge ? 1.45 : 0.95);

              // 在甩出瞬间一次性喷发一圈旋转水滴气泡与浅海涟漪
              if (!state.burstEmitted && u > 0.08 && vfx) {
                state.burstEmitted = true;
                const dropCount = isSurge ? 16 : 10;
                for (let i = 0; i < dropCount; i++) {
                  const a = (i / dropCount) * TAU + state.discAng[1];
                  const rad0 = 11.5 * sMul;
                  const spdOut = (isSurge ? 22 : 15) * sMul;
                  const spdTan = (isSurge ? 14 : 9) * sMul;
                  const vx = Math.cos(a) * spdOut - Math.sin(a) * spdTan;
                  const vy = Math.sin(a) * spdOut + Math.cos(a) * spdTan;
                  vfx.spawnParticle(
                    state.x + Math.cos(a) * rad0,
                    state.y + Math.sin(a) * rad0,
                    (2.8 + (i % 3) * 1.1) * sMul,
                    vx, vy, (11 + (i % 4) * 3.2) * sMul,
                    0.46 + (i % 3) * 0.09,
                    (i % 2 === 0 ? 1.45 : 1.1) * sMul,
                    i % 2 === 0 ? curSkin.splashFoam : curSkin.splashTint,
                    i % 4 === 0,
                    38
                  );
                }
                vfx.addRipple(
                  state.x, state.y,
                  10.5 * sMul, (isSurge ? 29.5 : 24.5) * sMul,
                  0.82, isSurge ? 2.1 : 1.65
                );
              }
            } else {
              // 阶段 3：收拢吸回（散粒被强涡流拉回圆盘边缘，转速平缓回落）
              const u = smoothstep(0.68, 1.0, phase);
              targetSpin = lerp(isSurge ? 1.90 : 1.35, 0.95, u);
              targetFling = 0;
              targetSuck = Math.sin(u * Math.PI) * (isSurge ? 0.65 : 0.42);
              coreLiftTarget = -Math.sin(u * Math.PI) * 0.35;
            }
          }

          state.spinBoost = lerp(state.spinBoost, targetSpin, expSmooth(dt, 5.5));
          state.suckAmt = lerp(state.suckAmt, targetSuck, expSmooth(dt, 6.5));
          radialSpring.update(dt, targetFling - state.suckAmt * 0.38, 82 * sp, 8.8);
          state.flingAmt = radialSpring.x;
          coreLiftSpring.update(dt, coreLiftTarget, 105 * sp, 10.5);

          // -----------------------------------------------------------------
          // 3. 4 层圆盘错速旋转 + 内核反相慢旋 + 体内小鱼/海草/散粒轨道推进
          //    底层最慢、越往上层转速越快，形成清晰错速剪切视觉！
          // -----------------------------------------------------------------
          const baseOmegas = [0.78, 1.36, 2.08, 2.95];
          for (let i = 0; i < 4; i++) {
            state.discAng[i] = wrapAngle(state.discAng[i] + dt * baseOmegas[i] * state.spinBoost * gFreq);
          }
          // 内核以独立角速度自转，与上层圆盘形成错位呼吸
          state.coreAng = wrapAngle(state.coreAng - dt * 1.15 * state.spinBoost * gFreq);
          state.yaw = state.discAng[0];

          for (let i = 0; i < FISH_SPECS.length; i++) {
            const f = FISH_SPECS[i];
            const omega = f.omega * (0.72 + state.spinBoost * 0.48) * gFreq * f.dir;
            state.fishAng[i] = wrapAngle(state.fishAng[i] + dt * omega);
          }
          for (let i = 0; i < KELP_SPECS.length; i++) {
            const k = KELP_SPECS[i];
            const omega = k.omega * (0.75 + state.spinBoost * 0.42) * gFreq;
            state.kelpAng[i] = wrapAngle(state.kelpAng[i] + dt * omega);
          }
          for (let i = 0; i < DROPLET_SPECS.length; i++) {
            const d = DROPLET_SPECS[i];
            const omega = d.omega * (0.80 + state.spinBoost * 0.55) * gFreq;
            state.dropAng[i] = wrapAngle(state.dropAng[i] + dt * omega);
          }

          // -----------------------------------------------------------------
          // 4. 浅海表面旋转涟漪与持续气泡细粒
          // -----------------------------------------------------------------
          if (vfx) {
            state.rippleCd -= dt;
            const ripInterval = action === 'surge' ? 0.34 : (action === 'idle' ? 0.92 : 0.58);
            if (state.rippleCd <= 0) {
              state.rippleCd = ripInterval;
              const isWaterHab = !habitat || habitat.isWater;
              if (isWaterHab) {
                vfx.addRipple(
                  state.x, state.y,
                  (13.5 - state.suckAmt * 2.2) * sMul,
                  (22.5 + Math.max(0, state.flingAmt) * 5.0) * sMul,
                  0.78, 1.45
                );
              }
            }

            state.sprayCd -= dt;
            const sprayInterval = action === 'surge' ? 0.08 : (action === 'idle' ? 0.28 : 0.16);
            if (state.sprayCd <= 0) {
              state.sprayCd = sprayInterval;
              const a = state.discAng[2] + hash2i(Math.floor(time * 20), seed0, 617) * TAU;
              const r = lerp(7.5, 16.5, hash2i(Math.floor(time * 20), seed0, 733)) * sMul;
              const tang = (action === 'surge' ? 11.5 : 6.2) * sMul;
              vfx.spawnParticle(
                state.x + Math.cos(a) * r,
                state.y + Math.sin(a) * r,
                (1.8 + hash2i(Math.floor(time * 20), seed0, 829) * 3.4) * sMul,
                -Math.sin(a) * tang, Math.cos(a) * tang, (5.5 + state.spinBoost * 2.5) * sMul,
                0.38, 1.05 * sMul,
                curSkin.splashFoam, false, 18
              );
            }
          }

          sockets.setWorld('core', state.x, state.y, (4.8 + coreLiftSpring.x) * sMul, state.coreAng);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const t = state.lastTime;
          const cx = state.x;
          const cy = state.y;
          const baseZ = state.z;

          // -----------------------------------------------------------------
          // 1. 4 层错速旋转流质圆盘（全部 noOutline: true，symDeg: 90）
          //    层高做微幅呼吸起伏，自下而上透明度递进（0.58 -> 0.68 -> 0.75 -> 0.82）
          // -----------------------------------------------------------------
          const discDefs = [
            { key: 'disc0', lift: 0.4, op: 0.60, bobAmp: 0.35, bobPh: 0.0, bias: -2.60 },
            { key: 'disc1', lift: 2.3, op: 0.68, bobAmp: 0.42, bobPh: 1.4, bias: -1.40 },
            { key: 'disc2', lift: 4.3, op: 0.75, bobAmp: 0.48, bobPh: 2.8, bias:  0.15 },
            { key: 'disc3', lift: 6.1, op: 0.82, bobAmp: 0.52, bobPh: 4.2, bias:  1.15 }
          ];
          for (let i = 0; i < 4; i++) {
            const d = discDefs[i];
            const breath = Math.sin(t * 2.3 + d.bobPh) * d.bobAmp + Math.max(0, state.flingAmt) * (0.25 + i * 0.15);
            list.push({
              partKey: d.key,
              asset: parts[d.key],
              x: cx,
              y: cy,
              lift: Math.max(0, (baseZ + d.lift + breath) * sMul),
              ro: state.discAng[i],
              symDeg: 90,
              opacity: d.op,
              bias: d.bias,
              noOutline: true
            });
          }

          // -----------------------------------------------------------------
          // 2. 正中醒目深靛脉动内核（保留清晰轮廓，bias 高于中下水盘确保俯视锁死重心）
          // -----------------------------------------------------------------
          const coreLift = Math.max(0.5, (baseZ + 2.4 + coreLiftSpring.x) * sMul);
          list.push({
            partKey: 'coreOrb',
            asset: parts.coreOrb,
            x: cx,
            y: cy,
            lift: coreLift,
            ro: state.coreAng,
            symDeg: 90,
            opacity: 1.0,
            bias: 0.85
          });

          // -----------------------------------------------------------------
          // 3. 体内打转的 4 条鲜明小鱼（留描边突出辨识度，沿螺旋轨道切向朝前）
          // -----------------------------------------------------------------
          const orbitScale = clamp(1.0 - state.suckAmt * 0.16 + Math.max(0, state.flingAmt) * 0.14, 0.78, 1.20);
          for (let i = 0; i < FISH_SPECS.length; i++) {
            const f = FISH_SPECS[i];
            const ang = state.fishAng[i];
            const r = (f.baseR * orbitScale + Math.sin(t * 2.1 + f.phase0) * 0.9) * sMul;
            const fx = cx + Math.cos(ang) * r;
            const fy = cy + Math.sin(ang) * r;
            const fz = Math.max(0.6, (baseZ + f.zBase + Math.sin(t * f.bobFreq + f.phase0) * f.bobAmp) * sMul);

            // 切向速度方向：逆时针旋转 (d/dt [cos a, sin a] = [-sin a, cos a])
            // 本工坊体素头朝 +Y，fwd = (-sin(ro), cos(ro))，故切向朝前角为 atan2(-tvx, tvy)
            const tvx = -Math.sin(ang) * f.dir;
            const tvy =  Math.cos(ang) * f.dir;
            const tailWag = Math.sin(t * 8.5 + f.phase0 * 2.0) * 0.14;
            const fishRo = wrapAngle(Math.atan2(-tvx, tvy) + tailWag);

            list.push({
              partKey: `${f.key}_${i}`,
              asset: parts[f.key],
              x: fx,
              y: fy,
              lift: fz,
              ro: fishRo,
              symDeg: 360,
              opacity: 1.0,
              bias: 0.65
            });
          }

          // -----------------------------------------------------------------
          // 4. 体内卷入的 3 片翠绿海草带（随流螺旋舒展公转）
          // -----------------------------------------------------------------
          for (let i = 0; i < KELP_SPECS.length; i++) {
            const k = KELP_SPECS[i];
            const ang = state.kelpAng[i];
            const r = (k.baseR * orbitScale + Math.cos(t * 1.7 + k.phase0) * 0.8) * sMul;
            const kx = cx + Math.cos(ang) * r;
            const ky = cy + Math.sin(ang) * r;
            const kz = Math.max(0.5, (baseZ + k.zBase + Math.sin(t * 2.2 + k.phase0) * k.bobAmp) * sMul);
            const tvx = -Math.sin(ang);
            const tvy =  Math.cos(ang);
            const kelpRo = wrapAngle(Math.atan2(-tvx, tvy) + Math.sin(t * 3.4 + k.phase0) * 0.22);

            list.push({
              partKey: `kelp_${i}`,
              asset: parts.kelpBlade,
              x: kx,
              y: ky,
              lift: kz,
              ro: kelpRo,
              symDeg: 360,
              opacity: 0.96,
              bias: 0.25
            });
          }

          // -----------------------------------------------------------------
          // 5. 外圈甩出去又吸回来的 8 颗无描边水珠散粒（全部 noOutline: true）
          // -----------------------------------------------------------------
          const flingPos = clamp(state.flingAmt, 0, 1.35);
          const suckPull = clamp(state.suckAmt, 0, 1.0);
          for (let i = 0; i < DROPLET_SPECS.length; i++) {
            const d = DROPLET_SPECS[i];
            const ang = state.dropAng[i];
            const localFling = clamp(flingPos - d.delay, 0, 1.25);
            const baseRad = lerp(d.baseR, d.baseR * 0.78, suckPull);
            const r = (baseRad + localFling * (d.flingR - d.baseR) + Math.sin(t * 3.2 + d.phase0) * 0.65) * sMul;
            const dx = cx + Math.cos(ang) * r;
            const dy = cy + Math.sin(ang) * r;
            const dz = Math.max(
              0.5,
              (baseZ + d.zBase + localFling * (d.zPeak - d.zBase) + Math.sin(t * 3.8 + d.phase0) * 0.55) * sMul
            );
            list.push({
              partKey: `drop_${i}`,
              asset: parts[d.key],
              x: dx,
              y: dy,
              lift: dz,
              ro: wrapAngle(ang * 2.0),
              symDeg: 90,
              opacity: clamp(0.76 + localFling * 0.18, 0.72, 0.94),
              bias: 0.95,
              noOutline: true
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sea6VortexWaterDef.id,
            code: Sea6VortexWaterDef.code,
            name: Sea6VortexWaterDef.name,
            outlineMode: 'hybridCoreFishOutlineWaterNoOutline',
            skin: curSkin.id,
            discLayers: 4,
            fishCount: FISH_SPECS.length,
            kelpCount: KELP_SPECS.length,
            dropletCount: DROPLET_SPECS.length,
            footRadius: Sea6VortexWaterDef.footRadius,
            headZ: 9,
            centerZ: 4,
            blocks: Sea6VortexWaterDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({
              id: k,
              w: parts[k].w,
              d: parts[k].d,
              h: parts[k].h
            }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sea6VortexWaterDef);
})(window.PixelWorkshop);
