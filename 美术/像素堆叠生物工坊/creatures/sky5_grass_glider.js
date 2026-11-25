'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, fbm1, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 天5 · 背上长草的宽翼滑翔者（M28 宽翼滑翔 / 转弯侧倾 标杆）
  // -------------------------------------------------------------------------
  // 1. 形态与拆块预算（翼展 ~70 格 / 身长 ~26 格 ≈ 2.69 倍；单块严格 <= 36 格）：
  //    - spineCore    (16×26×8) ：中央宽脊皮毯（前缘 3 个深色呼吸孔 + 背心草甸底垫，严格 X 对称）；
  //    - wingInner    (12×24×6) ：左右共享内翼条（前缘 2 个深色呼吸孔 + 明黄边纹 + 珊瑚后缘，严格 X 对称）；
  //    - wingMid      (12×20×5) ：左右共享中翼条（明黄前缘斜纹 + 珊瑚圆斑，严格 X 对称）；
  //    - wingTip      (12×14×4) ：左右共享翼梢条（收尖蝠鲼翼角 + 亮边纹，严格 X 对称）；
  //    - tailSeg      (6×10×4)  ：细长尾带中段（2 节共享）；
  //    - tailTip      (6×12×3)  ：细长尾带末梢（枢轴锁根部）；
  //    - grassFlowerA (10×10×12)：嫩绿弹簧草丛 + 明黄小花（symDeg=90，3 簇共享）；
  //    - grassFlowerB (10×10×11)：翠绿弹簧草丛 + 粉红小花（symDeg=90，3 簇共享）。
  // 2. 伪侧倾与波浪滑翔：
  //    - 几乎不上下硬拍，由内翼 -> 中翼 -> 翼梢按 0.78 rad 相位差柔和波浪起伏；
  //    - 按实时 turnRate 驱动二阶弹簧 bankAngle：外侧翼条逐级抬高、内侧压低、
  //      横向间距微收拢、整只微向弯心偏移，形成极具立体感的像素堆叠大弧线压弯滑翔；
  //    - 离地 z ≈ 22~30 格高空巡游，偶发撒落金黄草籽粒子往下飘；
  //    - 暴露 4 个实时世界坐标 inst.mountSockets 供同台小型飞鸟停靠啄籽歇脚。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 身毯主色（深青黛，与浅蓝白云海强反差，3 档）
      bodyDark:     '#122633',
      bodyMid:      '#1e4257',
      bodyHi:       '#336a85',
      // 翼缘醒目边纹（明黄暖金，3 档）
      trimDark:     '#ad6e10',
      trimMid:      '#eba41e',
      trimHi:       '#ffe052',
      // 翼面装饰纹与后缘（亮珊瑚红，3 档）
      accentDark:   '#9e2f26',
      accentMid:    '#e05240',
      accentHi:     '#ff8c73',
      // 腹面浅底皮（暖褐米，侧倾微露底缘，3 档）
      bellyDark:    '#574435',
      bellyMid:     '#856c56',
      bellyHi:      '#b5997e',
      // 前缘深色呼吸孔（2 档，高对比）
      gillHole:     '#081017',
      gillRim:      '#162d3d',
      // 背心草甸苔基（鲜绿草毯底，3 档）
      turfDark:     '#1b5723',
      turfMid:      '#308f35',
      turfHi:       '#5ec952',
      // 弹簧草丛叶片（嫩翠绿，3 档）
      grassDark:    '#186927',
      grassMid:     '#35b03d',
      grassHi:      '#7deb67',
      // 亮色小花 A（明黄花朵，3 档）
      flowerADark:  '#c27a0a',
      flowerAMid:   '#ffbc1f',
      flowerAHi:    '#fff176',
      // 亮色小花 B（粉红花朵，3 档）
      flowerBDark:  '#b02857',
      flowerBMid:   '#f25586',
      flowerBHi:    '#ffa8c4',
      // 细长尾带（深靛青尾，3 档）
      tailDark:     '#0f1f2b',
      tailMid:      '#1c384a',
      tailHi:       '#366178'
    },
    glowKeys: [],
    parts: [
      'body', 'trim', 'accent', 'belly', 'gill',
      'turf', 'grass', 'flowerA', 'flowerB', 'tail'
    ],
    noCrease: [
      ['body', 'trim'], ['body', 'accent'], ['body', 'belly'],
      ['body', 'turf'], ['body', 'gill'], ['trim', 'gill'],
      ['turf', 'grass'], ['grass', 'flowerA'], ['grass', 'flowerB'],
      ['body', 'tail'], ['tail', 'trim']
    ],
    materials: {
      body:    ['bodyDark',    'bodyMid',    'bodyHi'],
      trim:    ['trimDark',    'trimMid',    'trimHi'],
      accent:  ['accentDark',  'accentMid',  'accentHi'],
      belly:   ['bellyDark',   'bellyMid',   'bellyHi'],
      turf:    ['turfDark',    'turfMid',    'turfHi'],
      grass:   ['grassDark',   'grassMid',   'grassHi'],
      flowerA: ['flowerADark', 'flowerAMid', 'flowerAHi'],
      flowerB: ['flowerBDark', 'flowerBMid', 'flowerBHi'],
      tail:    ['tailDark',    'tailMid',    'tailHi']
    },
    protectedParts: ['gill', 'flowerA', 'flowerB']
  });

  // 3 套零重建模换色皮肤（与浅蓝白云海强反差，0 禁用字）
  const SKINS = [
    {
      id: 'indigo_meadow',
      name: '青黛嫩草花',
      dot: '#1e4257',
      outline: '#08111a',
      pal: {},
      fx: { seedA: '#ffe052', seedB: '#ffb326', petal: '#ff8cb3' }
    },
    {
      id: 'terracotta_wheat',
      name: '陶褐金穗毯',
      dot: '#8f4226',
      outline: '#1a0e09',
      pal: {
        bodyDark:    '#4a1f13', bodyMid:    '#7d3822', bodyHi:    '#b35839',
        trimDark:    '#1d6e78', trimMid:    '#38a8b5', trimHi:    '#7ce3ed',
        accentDark:  '#a86b14', accentMid:  '#e8a027', accentHi:  '#ffd466',
        bellyDark:   '#634e3a', bellyMid:   '#94795e', bellyHi:   '#c4a98b',
        gillHole:    '#1c0b07', gillRim:    '#38170f',
        turfDark:    '#385c1b', turfMid:    '#62942c', turfHi:    '#98c94d',
        grassDark:   '#4d6e1d', grassMid:   '#80ad31', grassHi:   '#bce058',
        flowerADark: '#b85c0b', flowerAMid: '#f5921d', flowerAHi: '#ffd26b',
        flowerBDark: '#9e8f75', flowerBMid: '#ded4bd', flowerBHi: '#fff9eb',
        tailDark:    '#3b180e', tailMid:    '#662c1a', tailHi:    '#96472c'
      },
      fx: { seedA: '#ffd466', seedB: '#f5921d', petal: '#fff4d1' }
    },
    {
      id: 'plum_moss',
      name: '深紫苔花毯',
      dot: '#4d2b66',
      outline: '#120a1c',
      pal: {
        bodyDark:    '#261538', bodyMid:    '#452763', bodyHi:    '#6e4496',
        trimDark:    '#b53b4e', trimMid:    '#f06578', trimHi:    '#ffa6b0',
        accentDark:  '#1d7a6e', accentMid:  '#39b8a5', accentHi:  '#82edd9',
        bellyDark:   '#57485e', bellyMid:   '#83708c', bellyHi:   '#b3a1bd',
        gillHole:    '#12081c', gillRim:    '#2b1640',
        turfDark:    '#155942', turfMid:    '#25916b', turfHi:    '#52cf9d',
        grassDark:   '#176b4c', grassMid:   '#2eb37e', grassHi:   '#70ebae',
        flowerADark: '#c49014', flowerAMid: '#ffd138', flowerAHi: '#fff694',
        flowerBDark: '#b82e6e', flowerBMid: '#f55c9e', flowerBHi: '#ffb3d4',
        tailDark:    '#1c0f2b', tailMid:    '#341d4d', tailHi:    '#56347a'
      },
      fx: { seedA: '#ffe56b', seedB: '#ffb3d4', petal: '#82edd9' }
    }
  ];

  // =========================================================================
  // 1. 中央宽脊皮毯 spineCore（16×26×8，严格 X 对称）
  //    前缘饱满圆弧 + 3 个清晰深色呼吸孔 + 明黄前缘边纹 + 背心鲜绿草甸底垫
  // =========================================================================
  function buildSpineCore(makeCanvas) {
    const W = 16, D = 26, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-7.5, 7.5, -12.5, 12.5, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      // 前宽后微收的蝠鲼中脊轮廓（Y: -12 ~ +12）
      const halfW = Y >= 0
        ? lerp(7.6, 5.2, smoothstep(7.5, 12.2, Y))
        : lerp(7.6, 3.4, smoothstep(-3.0, -12.2, Y));
      if (ax > halfW) return;

      // 薄皮毯曲面厚度（中脊微隆 5.6 格，边缘收薄到 2.4 格）
      const xRatio = ax / Math.max(1.0, halfW);
      const yRatio = clamp(Math.abs(Y) / 12.5, 0, 1);
      const topZ = 2.0 + 3.8 * (1.0 - xRatio * xRatio * 0.45) * (1.0 - yRatio * yRatio * 0.42);
      const botZ = 0.8 + xRatio * 0.7;
      if (z < botZ || z > topZ) return;

      if (z <= botZ + 1.0) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
        return;
      }

      // 前缘醒目明黄边纹
      if (Y >= 9.6) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
        return;
      }
      // 后缘珊瑚收边
      if (Y <= -9.8) {
        m.setRaw(x, y, z, mat('accent'), partId.accent);
        return;
      }

      // 背心鲜绿草甸底垫（居中厚实，一眼看出背上长草）
      const turfD = (X * X) / (6.4 * 6.4) + ((Y + 0.5) * (Y + 0.5)) / (8.4 * 8.4);
      if (z >= topZ - 1.4 && turfD <= 1.0) {
        m.setRaw(x, y, z, mat('turf'), partId.turf);
      } else {
        m.setRaw(x, y, z, mat('body'), partId.body);
      }
    });

    // 背脊中央轻微隆起的苔草垫层（托起背草花簇）
    m.paintEllipsoid(0, -0.5, 5.4, 5.0, 6.8, 1.3, mat('turf'), partId.turf, true);

    m.despeckle();
    m.applyArtShading(true);

    // 前缘 3 个清晰深色呼吸孔（对称排布于前额区，着色后精雕防发糊）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const gillXs = [-3.5, 0.0, 3.5];
    const gillY = Math.round(hd + 8.4);
    for (const gx of gillXs) {
      const ix = Math.round(hw + gx);
      for (let dz = 2; dz <= 4; dz++) {
        m.setRaw(ix, gillY, dz, keyToId.gillHole, partId.gill);
        m.setRaw(ix, gillY + 1, dz, keyToId.gillHole, partId.gill);
      }
      m.setRaw(ix, gillY - 1, 4, keyToId.gillRim, partId.gill);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 10.5, headZ: 7, centerZ: 3 });
  }

  // =========================================================================
  // 2. 内翼条 wingInner（12×24×6，严格 X 对称，左右双翼共享）
  //    前缘明黄亮边 + 2 个深色呼吸孔 + 翼面深青黛配珊瑚斜纹与浅草斑
  // =========================================================================
  function buildWingInner(makeCanvas) {
    const W = 12, D = 24, H = 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-5.8, 5.8, -11.5, 11.5, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      // 略带前弧与后缘微扇贝的薄翼条
      const frontEdge = 10.8 - (ax * ax) * 0.035;
      const backEdge = -10.4 + Math.cos(X * 0.72) * 0.85;
      if (Y > frontEdge || Y < backEdge) return;

      const uY = clamp((Y - backEdge) / Math.max(1, frontEdge - backEdge), 0, 1);
      const topZ = 1.8 + 2.8 * Math.sin(uY * Math.PI * 0.85 + 0.15) * (1.0 - (ax / 6.2) * 0.12);
      const botZ = 0.8;
      if (z < botZ || z > topZ) return;

      if (z <= 1.6) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
        return;
      }
      if (Y > frontEdge - 2.2) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
        return;
      }
      if (Y < backEdge + 2.1) {
        m.setRaw(x, y, z, mat('accent'), partId.accent);
        return;
      }
      // 内翼面延伸的翠绿草斑（让草毯自然延展至内翼）
      if (z >= topZ - 1.2 && Math.abs(Y + 0.8) < 4.5 && ax < 3.6) {
        m.setRaw(x, y, z, mat('turf'), partId.turf);
      } else {
        m.setRaw(x, y, z, mat('body'), partId.body);
      }
    });

    m.despeckle();
    m.applyArtShading(true);

    // 内翼前缘 2 个对称深色呼吸孔（与中脊 3 孔连成一排醒目呼吸孔带）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const gillY = Math.round(hd + 7.6);
    for (const gx of [-2.2, 2.2]) {
      const ix = Math.round(hw + gx);
      m.setRaw(ix, gillY, 3, keyToId.gillHole, partId.gill);
      m.setRaw(ix, gillY + 1, 3, keyToId.gillHole, partId.gill);
      m.setRaw(ix, gillY, 4, keyToId.gillHole, partId.gill);
      m.setRaw(ix, gillY - 1, 3, keyToId.gillRim, partId.gill);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 9.2, headZ: 5, centerZ: 2 });
  }

  // =========================================================================
  // 3. 中翼条 wingMid（12×20×5，严格 X 对称，左右双翼共享）
  //    深青黛皮毯 + 明黄宽前缘 + 居中亮珊瑚斑 + 扇贝后缘
  // =========================================================================
  function buildWingMid(makeCanvas) {
    const W = 12, D = 20, H = 5;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5.8, 5.8, -9.5, 9.5, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      const frontEdge = 8.9 - (ax * ax) * 0.04;
      const backEdge = -8.6 + Math.cos(X * 0.85) * 0.9;
      if (Y > frontEdge || Y < backEdge) return;

      const uY = clamp((Y - backEdge) / Math.max(1, frontEdge - backEdge), 0, 1);
      const topZ = 1.6 + 2.2 * Math.sin(uY * Math.PI * 0.88 + 0.12);
      if (z < 0.8 || z > topZ) return;

      if (z <= 1.4) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (Y > frontEdge - 2.3) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
      } else if (Y < backEdge + 2.0) {
        m.setRaw(x, y, z, mat('accent'), partId.accent);
      } else if (Math.hypot(X / 2.6, (Y - 0.5) / 2.4) <= 1.0 && z >= topZ - 1.1) {
        // 中翼标志性明黄圆斑（强化俯视动态辨识）
        m.setRaw(x, y, z, mat('trim'), partId.trim);
      } else {
        m.setRaw(x, y, z, mat('body'), partId.body);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.2, headZ: 4, centerZ: 2 });
  }

  // =========================================================================
  // 4. 翼梢条 wingTip（12×14×4，严格 X 对称，左右双翼共享）
  //    飘逸收尖蝠鲼翼梢 + 高对比明黄/珊瑚双色梢纹
  // =========================================================================
  function buildWingTip(makeCanvas) {
    const W = 12, D = 14, H = 4;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5.8, 5.8, -6.5, 6.5, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      // 菱弧形翼梢轮廓：饱满流畅、不切平边界
      const e = (ax * ax) / (5.8 * 5.8) + (Y * Y) / (6.3 * 6.3);
      if (e > 1.0) return;

      const arch = Math.sqrt(Math.max(0, 1.0 - e));
      const topZ = 1.2 + 1.9 * arch;
      if (z < 0.7 || z > topZ) return;

      if (z <= 1.1) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (Y > 2.2 || ax > 3.6) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
      } else if (Y < -2.6) {
        m.setRaw(x, y, z, mat('accent'), partId.accent);
      } else {
        m.setRaw(x, y, z, mat('body'), partId.body);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.2, headZ: 3, centerZ: 1 });
  }

  // =========================================================================
  // 5. 细长尾带：尾节 tailSeg（6×10×4）+ 尾梢 tailTip（6×12×3，枢轴锁根部）
  // =========================================================================
  const TAIL_TIP_PIVOT = { x: 0, y: 4.5 };
  function buildTailSeg(makeCanvas) {
    const m = new VoxelModel(6, 10, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 3.8, 1.8, 0, -3.8, 1.6, 1.6, 1.25, mat('tail'), partId.tail, true);
    m.paintCapsule(0, 3.0, 2.4, 0, -3.0, 2.2, 0.72, 0.55, mat('trim'), partId.trim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 3, centerZ: 1 });
  }

  function buildTailTip(makeCanvas) {
    const m = new VoxelModel(6, 12, 3, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 4.8, 1.5, 0, -4.8, 1.3, 1.25, 0.55, mat('tail'), partId.tail, true);
    m.paintEllipsoid(0, -4.4, 1.4, 1.35, 1.6, 0.75, mat('trim'), partId.trim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 2, centerZ: 1 });
  }

  // =========================================================================
  // 6. 放大清晰的背上弹簧草花件：grassFlowerA（明黄花）/ grassFlowerB（粉红花）
  //    尺寸 10×10×12 / 10×10×11，四重近似对称（symDeg=90），俯视 ×4 清晰饱满！
  // =========================================================================
  function buildGrassFlower(makeCanvas, variant) {
    const isA = variant === 'A';
    const W = 10, D = 10, H = isA ? 12 : 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const flMat = isA ? 'flowerA' : 'flowerB';
    const flPart = isA ? partId.flowerA : partId.flowerB;

    // 饱满草甸根座
    m.paintEllipsoid(0, 0, 1.5, 3.4, 3.4, 1.4, mat('turf'), partId.turf, true);

    // 6 片外展鲜绿草叶（四向均匀展开，俯视草丛蓬松饱满）
    const blades = [
      { ang: 0.25, r1: 3.6, z1: H - 2.6, r: 0.95 },
      { ang: 1.30, r1: 3.3, z1: H - 3.4, r: 0.90 },
      { ang: 2.35, r1: 3.6, z1: H - 2.8, r: 0.95 },
      { ang: 3.39, r1: 3.5, z1: H - 2.6, r: 0.95 },
      { ang: 4.44, r1: 3.3, z1: H - 3.4, r: 0.90 },
      { ang: 5.49, r1: 3.6, z1: H - 2.8, r: 0.95 }
    ];
    for (const b of blades) {
      const mx = Math.cos(b.ang) * b.r1 * 0.48;
      const my = Math.sin(b.ang) * b.r1 * 0.48;
      const tx = Math.cos(b.ang) * b.r1;
      const ty = Math.sin(b.ang) * b.r1;
      m.paintCapsule(0, 0, 1.6, mx, my, b.z1 * 0.56, b.r, b.r * 0.84, mat('grass'), partId.grass, true);
      m.paintCapsule(mx, my, b.z1 * 0.56, tx, ty, b.z1, b.r * 0.84, 0.56, mat('grass'), partId.grass, true);
    }

    // 中心挺立花茎 + 放大清晰亮色小花朵（3×3 像素级花冠 + 对比花蕊）
    m.paintCapsule(0, 0, 1.8, 0, 0, H - 3.2, 0.95, 0.72, mat('grass'), partId.grass, true);
    m.paintEllipsoid(0, 0, H - 2.0, 2.35, 2.35, 1.45, mat(flMat), flPart, true);
    // 旁边再添一朵错落小花蕾，提升草毯繁茂感
    const bx = isA ? 2.1 : -2.0;
    const by = isA ? 1.8 : -1.9;
    m.paintCapsule(bx * 0.35, by * 0.35, 2.2, bx, by, H - 4.0, 0.65, 0.55, mat('grass'), partId.grass, true);
    m.paintEllipsoid(bx, by, H - 3.4, 1.55, 1.55, 1.05, mat(isA ? 'flowerB' : 'flowerA'), isA ? partId.flowerB : partId.flowerA, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: H - 1, centerZ: Math.round(H * 0.45) });
  }

  // 7 条翼片的静态排布与 M28 侧倾 / 波浪参数
  // stripIdx: 0=中脊, 1=内翼, 2=中翼, 3=翼梢
  const WING_STRIPS = [
    { key: 'wingTipL',   assetKey: 'wingTip',   side: -1, stripIdx: 3, lx: -29.0, ly: -3.6, baseZ: 0.4, bankGain: 6.0, waveAmp: 2.25, phaseOff: -1.56, sweepYaw:  0.14, bias: -0.25 },
    { key: 'wingMidL',   assetKey: 'wingMid',   side: -1, stripIdx: 2, lx: -20.0, ly: -2.2, baseZ: 0.6, bankGain: 3.8, waveAmp: 1.45, phaseOff: -0.78, sweepYaw:  0.07, bias: -0.10 },
    { key: 'wingInnerL', assetKey: 'wingInner', side: -1, stripIdx: 1, lx: -10.5, ly: -0.8, baseZ: 0.8, bankGain: 1.8, waveAmp: 0.75, phaseOff:  0.00, sweepYaw:  0.02, bias:  0.05 },
    { key: 'spineCore',  assetKey: 'spineCore', side:  0, stripIdx: 0, lx:   0.0, ly:  0.0, baseZ: 0.0, bankGain: 0.0, waveAmp: 0.25, phaseOff:  0.22, sweepYaw:  0.00, bias:  0.22 },
    { key: 'wingInnerR', assetKey: 'wingInner', side:  1, stripIdx: 1, lx:  10.5, ly: -0.8, baseZ: 0.8, bankGain: 1.8, waveAmp: 0.75, phaseOff:  0.00, sweepYaw: -0.02, bias:  0.05 },
    { key: 'wingMidR',   assetKey: 'wingMid',   side:  1, stripIdx: 2, lx:  20.0, ly: -2.2, baseZ: 0.6, bankGain: 3.8, waveAmp: 1.45, phaseOff: -0.78, sweepYaw: -0.07, bias: -0.10 },
    { key: 'wingTipR',   assetKey: 'wingTip',   side:  1, stripIdx: 3, lx:  29.0, ly: -3.6, baseZ: 0.4, bankGain: 6.0, waveAmp: 2.25, phaseOff: -1.56, sweepYaw: -0.14, bias: -0.25 }
  ];

  // 6 簇放大清晰的弹簧背草小花（附着在中脊与左右内翼上，随对应翼片联动起伏与侧倾）
  const GRASS_CLUMPS = [
    { kind: 'grassFlowerA', side:  0, stripIdx: 0, lx: -2.6, ly:  3.2, zOff: 5.2, phase: 0.3 },
    { kind: 'grassFlowerB', side:  0, stripIdx: 0, lx:  2.8, ly:  2.0, zOff: 5.3, phase: 1.6 },
    { kind: 'grassFlowerA', side:  0, stripIdx: 0, lx:  0.4, ly: -3.2, zOff: 5.1, phase: 2.9 },
    { kind: 'grassFlowerB', side: -1, stripIdx: 1, lx: -8.8, ly: -2.2, zOff: 4.4, phase: 4.1 },
    { kind: 'grassFlowerA', side:  1, stripIdx: 1, lx:  9.0, ly: -2.4, zOff: 4.4, phase: 5.2 },
    { kind: 'grassFlowerB', side:  0, stripIdx: 0, lx: -3.2, ly: -6.8, zOff: 4.5, phase: 0.9 }
  ];

  // 4 个对外开放的跨个体停靠挂点（避开草花丛，供后续 天1 长须鸟停在背上啄草籽歇脚）
  const MOUNT_SOCKET_LAYOUT = [
    { id: 'glider_front', lx:  0.0, ly:  5.8, side:  0, bankGain: 0.0, zOff: 5.8, r: 4.4 },
    { id: 'glider_back',  lx:  0.0, ly: -5.8, side:  0, bankGain: 0.0, zOff: 5.2, r: 4.4 },
    { id: 'glider_left',  lx: -9.8, ly:  1.4, side: -1, bankGain: 1.8, zOff: 4.9, r: 4.4 },
    { id: 'glider_right', lx:  9.8, ly:  1.4, side:  1, bankGain: 1.8, zOff: 4.9, r: 4.4 }
  ];

  // =========================================================================
  // 生物定义：天5 · 背上长草的宽翼滑翔者
  // =========================================================================
  const Sky5Def = {
    id: 'sky5_grass_glider',
    code: '天5',
    status: 'done',
    name: '背上长草的宽翼滑翔者',
    tag: 'M28 宽翼滑翔 / 转弯侧倾 · 浮空草毯蝠鲼',
    summary: 'M28 标杆：7 块薄翼条（中脊 + 左右 3 段共享翼片）拼出 2.7 倍超宽深青黛皮毯，蝠鲼式柔波滑翔 + 实时 turnRate 驱动伪转弯侧倾，背上繁茂鲜绿草甸小花随风摇曳并撒落金黄草籽，开放 4 个 mountSockets 供长须鸟歇脚',
    defaultHabitat: 'sky',
    footRadius: 22.0,
    ecoWeight: 2.2,
    useWaterFoam: false,
    mountHeight: 6.2,
    mountBackOffset: -0.5,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '高空侧倾巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '迎风柔和悬滑', loop: true, status: 'done' },
      { id: 'bank',   name: '8 字大压弯侧倾', loop: true, status: 'done' }
    ],
    blocks: [
      '7 块薄翼条拆块（中脊 + 左右 3 档共享翼片，单块 <= 26 格守 28MB）',
      '蝠鲼式翼缘行波滑翔（相邻翼条相位差 0.78 rad，柔和不硬拍）',
      '像素堆叠伪转弯侧倾（turnRate 驱动外抬内压 + 横距微收 + 弯心偏移）',
      '背上 6 簇共享弹簧草花 + 偶发撒落金黄草籽粒子',
      '4 个实时世界坐标 mountSockets 跨个体停靠挂点'
    ],
    soulHabit: '离地 22~30 格高空借气流大弧线侧倾兜圈滑翔，转弯时外侧翼条抬高、内侧压低、翼缘像绸布一样柔和波浪起伏，背上鲜绿草丛与亮色小花随风摇曳并一路撒落金黄草籽，背脊留出 4 处空坪供长须鸟落脚啄籽',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const wingInnerShared = buildWingInner(makeCanvas);
      const wingMidShared   = buildWingMid(makeCanvas);
      const wingTipShared   = buildWingTip(makeCanvas);
      const tailSegShared   = buildTailSeg(makeCanvas);
      const grassAShared    = buildGrassFlower(makeCanvas, 'A');
      const grassBShared    = buildGrassFlower(makeCanvas, 'B');

      const parts = {
        spineCore:    buildSpineCore(makeCanvas),
        wingInner:    wingInnerShared,
        wingMid:      wingMidShared,
        wingTip:      wingTipShared,
        tailSeg:      tailSegShared,
        tailTip:      buildTailTip(makeCanvas),
        grassFlowerA: grassAShared,
        grassFlowerB: grassBShared
      };

      const uniqueAssets = Array.from(new Set(Object.values(parts)));
      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.35;
      const seed = opts.seed ?? 55;
      const cachePrefix = `sky5_grass_glider_${Math.random().toString(36).slice(2, 7)}`;

      // 细长尾带物理链（根 + 2 节尾段 + 尾梢）
      const tailChain = new ChainSolver(4, 5.4, {
        maxAngle: 0.42,
        waveFreq: 2.1,
        wavePhaseStep: 0.62,
        waveAmp: 0.28
      });

      const bankSpring = new SpringDamper1D(0, 26, 6.4);
      const grassSprings = GRASS_CLUMPS.map(() => new SpringDamper1D(0, 42, 4.8));
      const sockets = new SocketTracker();

      const mountSockets = MOUNT_SOCKET_LAYOUT.map(cfg => ({
        id: cfg.id,
        lx: cfg.lx,
        ly: cfg.ly,
        x: hx0 + cfg.lx,
        y: hy0 + cfg.ly,
        z: 26.0 + cfg.zOff,
        yaw: hyaw0,
        r: cfg.r,
        occupiedBy: null
      }));

      const state = {
        x: hx0,
        y: hy0,
        z: 26.0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        turnRate: 0,
        bankAngle: 0,
        wavePhase: seed * 0.13,
        glideClock: 0,
        navX: hx0 + 18,
        navY: hy0 + 10,
        navSeq: 1,
        seedCd: 0.45
      };

      let curSkin = SKINS[0];

      // 计算单个翼条相对机身中心的实时局部坐标与 Z 偏移（供渲染与背草/挂点同步复用）
      function evalStripPose(side, stripIdx, lx, ly, bankGain, waveAmp, phaseOff, sMul) {
        const bank = state.bankAngle;
        const rollCos = 1.0 - Math.abs(bank) * 0.14;
        const shiftX = -bank * 3.0;
        const localX = (lx * rollCos + shiftX) * sMul;
        const localY = ly * sMul;
        const waveZ = Math.sin(state.wavePhase + phaseOff) * waveAmp;
        const bankZ = side * bank * bankGain - Math.abs(bank) * 0.55;
        const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, localX, localY);
        const wz = state.z + (waveZ + bankZ) * sMul;
        return { wx, wy, wz, waveZ, bankZ };
      }

      function syncMountSockets(sMul) {
        const bank = state.bankAngle;
        const rollCos = 1.0 - Math.abs(bank) * 0.14;
        const shiftX = -bank * 3.0;
        for (let i = 0; i < mountSockets.length; i++) {
          const cfg = MOUNT_SOCKET_LAYOUT[i];
          const sl = mountSockets[i];
          const phaseOff = cfg.side === 0 ? 0.22 : 0.0;
          const waveAmp = cfg.side === 0 ? 0.25 : 0.75;
          const waveZ = Math.sin(state.wavePhase + phaseOff) * waveAmp;
          const bankZ = cfg.side * bank * cfg.bankGain - Math.abs(bank) * 0.55;
          const [wx, wy] = localToWorldXY(
            state.x, state.y, state.yaw,
            (cfg.lx * rollCos + shiftX) * sMul,
            cfg.ly * sMul
          );
          sl.x = wx;
          sl.y = wy;
          sl.z = Math.max(8.0 * sMul, state.z + (cfg.zOff + waveZ + bankZ) * sMul);
          sl.yaw = state.yaw;
          sl.r = cfg.r * sMul;
        }
      }

      function spawnGrassSeed(vfx, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const clump = GRASS_CLUMPS[Math.floor(Math.random() * GRASS_CLUMPS.length)];
        const [sx, sy] = localToWorldXY(
          state.x, state.y, state.yaw,
          (clump.lx + (Math.random() - 0.5) * 4.5) * sMul,
          (clump.ly + (Math.random() - 0.5) * 4.5) * sMul
        );
        const sz = state.z + (clump.zOff + 3.5) * sMul;
        const driftX = state.vx * 0.18 + (Math.random() - 0.5) * 5.0 * sMul;
        const driftY = state.vy * 0.18 + (Math.random() - 0.5) * 5.0 * sMul;
        const col = Math.random() < 0.78 ? (Math.random() < 0.5 ? fx.seedA : fx.seedB) : fx.petal;
        vfx.spawnParticle(
          sx, sy, sz,
          driftX, driftY, -3.2 * sMul,
          2.6 + Math.random() * 0.8,
          1.25 + Math.random() * 0.45,
          col,
          false,
          3.2
        );
      }

      const instance = {
        def: Sky5Def,
        cachePrefix,
        parts,
        partListAssets: uniqueAssets,
        state,
        sockets,
        mountSockets,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of uniqueAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 26.0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw ?? 0.35;
          state.turnRate = 0;
          state.bankAngle = 0;
          state.wavePhase = seed * 0.13;
          state.glideClock = 0;
          state.navX = homeX + 18;
          state.navY = homeY + 10;
          state.navSeq = 1;
          state.seedCd = 0.45;

          bankSpring.x = bankSpring.v = 0;
          for (const gs of grassSprings) { gs.x = gs.v = 0; }

          const [trX, trY] = localToWorldXY(homeX, homeY, state.yaw, 0, -12.0 * instance.scaleMul);
          tailChain.reset(trX, trY, state.z + 1.0 * instance.scaleMul, state.yaw);

          for (const sl of mountSockets) sl.occupiedBy = null;
          state._riderCount = 0;
          syncMountSockets(instance.scaleMul);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));

          const action = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const homeYaw = (eco && eco.homeYaw) ?? 0.35;
          const maxR = (eco && eco.maxRadius) || 48;
          // 巡游边界严格钳制在 maxRadius * 0.78 内
          const patrolLimitR = maxR * 0.78;

          const prevX = state.x;
          const prevY = state.y;
          const prevYaw = state.yaw;

          state.glideClock += dt * spdMul;

          // -----------------------------------------------------------------
          // 1. 三套动作飞行轨迹：patrol(大弧线兜圈) / idle(迎风悬滑) / bank(8字大压弯)
          // -----------------------------------------------------------------
          if (action === 'idle') {
            // 迎风原地柔和悬滑：极轻微风场漂移 + 缓摆迎风朝向
            const tx = homeX + (fbm1(time * 0.34, seed + 13) - 0.5) * 5.2 * sMul;
            const ty = homeY + (fbm1(time * 0.30, seed + 71) - 0.5) * 5.2 * sMul;
            const kPos = expSmooth(dt, 2.8);
            state.x = lerp(state.x, tx, kPos);
            state.y = lerp(state.y, ty, kPos);
            const aimYaw = homeYaw + Math.sin(time * 0.52 + seed) * 0.24;
            state.yaw = wrapAngle(state.yaw + wrapAngle(aimYaw - state.yaw) * expSmooth(dt, 2.4));
            const targetZ = (25.5 + Math.sin(time * 1.15 * gFreq) * 2.2) * sMul;
            state.z = lerp(state.z, targetZ, expSmooth(dt, 3.6));
          } else if (action === 'bank') {
            // 连续 8 字大压弯侧倾演示（严格在 patrolLimitR * 0.88 内）
            const omega = 0.68 * spdMul;
            const t8 = state.glideClock * omega;
            const rx = patrolLimitR * 0.84;
            const ry = patrolLimitR * 0.56;
            const tx = homeX + Math.sin(t8) * rx;
            const ty = homeY + Math.sin(t8 * 2.0) * ry;
            const dvx = Math.cos(t8) * rx * omega;
            const dvy = Math.cos(t8 * 2.0) * 2.0 * ry * omega;
            const desiredYaw = Math.atan2(-dvx, dvy);
            const yawDiff = wrapAngle(desiredYaw - state.yaw);
            const maxTurn = 2.6 * (0.7 + spdMul * 0.45);
            state.yaw = wrapAngle(state.yaw + clamp(yawDiff, -maxTurn * dt, maxTurn * dt));

            const kPos = expSmooth(dt, 4.8);
            state.x = lerp(state.x, tx, kPos);
            state.y = lerp(state.y, ty, kPos);
            const bankDrop = Math.abs(state.bankAngle) * 1.6;
            const targetZ = (26.4 + Math.cos(t8 * 2.0) * 2.4 - bankDrop) * sMul;
            state.z = lerp(state.z, targetZ, expSmooth(dt, 4.2));
          } else {
            // patrol：高空借上升热气流大弧线侧倾兜圈滑翔
            const nd = Math.hypot(state.navX - state.x, state.navY - state.y);
            if (nd < 11.5) {
              state.navSeq++;
              const r1 = hash2i(state.navSeq, seed, 109);
              const r2 = hash2i(state.navSeq, seed, 239);
              const curA = Math.atan2(state.y - homeY, state.x - homeX);
              // 连续同向兜大圈 2~3 次后偶尔切换左右压弯方向，自然展示左右两侧倾
              const dir = ((state.navSeq >> 1) & 1) === 0 ? 1 : -1;
              const nextA = curA + dir * lerp(1.35, 2.15, r1);
              const nextR = lerp(patrolLimitR * 0.58, patrolLimitR * 0.92, r2);
              state.navX = homeX + Math.cos(nextA) * nextR;
              state.navY = homeY + Math.sin(nextA) * nextR;
            }

            const windX = (fbm1(time * 0.32, seed + 19) - 0.5) * 6.0;
            const windY = (fbm1(time * 0.29, seed + 83) - 0.5) * 6.0;
            const aimX = state.navX + windX + (eco && eco.avoidX ? eco.avoidX * 0.5 : 0);
            const aimY = state.navY + windY + (eco && eco.avoidY ? eco.avoidY * 0.5 : 0);

            const desiredYaw = Math.atan2(-(aimX - state.x), aimY - state.y);
            const yawDiff = wrapAngle(desiredYaw - state.yaw);
            // 滑翔机式有限角速度，稳定拉出大弧线压弯
            const maxTurn = 1.48 * (0.72 + spdMul * 0.38);
            state.yaw = wrapAngle(state.yaw + clamp(yawDiff, -maxTurn * dt, maxTurn * dt));

            const fwdX = -Math.sin(state.yaw);
            const fwdY = Math.cos(state.yaw);
            const glideSpd = (14.5 + Math.sin(time * 0.75 + seed) * 2.5) * spdMul;
            const kVel = expSmooth(dt, 3.8);
            state.vx = lerp(state.vx, fwdX * glideSpd, kVel);
            state.vy = lerp(state.vy, fwdY * glideSpd, kVel);
            state.x += state.vx * dt;
            state.y += state.vy * dt;

            // 高空热气流缓幅升沉（z ≈ 22~30 格）
            const thermalZ = Math.sin(time * 0.65 * gFreq + seed) * 3.0 + (fbm1(time * 0.40, seed + 41) - 0.5) * 2.4;
            const targetZ = clamp(26.2 + thermalZ - Math.abs(state.bankAngle) * 1.4, 22.0, 30.0) * sMul;
            state.z = lerp(state.z, targetZ, expSmooth(dt, 3.4));
          }

          // 严格钳制在 maxRadius * 0.78 内
          const dCenter = Math.hypot(state.x, state.y);
          if (dCenter > patrolLimitR && dCenter > 0.001) {
            state.x *= patrolLimitR / dCenter;
            state.y *= patrolLimitR / dCenter;
          }

          const safeDt = Math.max(dt, 0.001);
          state.vx = (state.x - prevX) / safeDt;
          state.vy = (state.y - prevY) / safeDt;

          // -----------------------------------------------------------------
          // 2. 实时 turnRate -> 二阶弹簧伪侧倾角 bankAngle ∈ [-1, 1]
          // -----------------------------------------------------------------
          const rawTurn = wrapAngle(state.yaw - prevYaw) / safeDt;
          state.turnRate = lerp(state.turnRate, rawTurn, expSmooth(dt, 10.0));
          const targetBank = action === 'idle'
            ? Math.sin(time * 0.75 + seed) * 0.14
            : clamp(state.turnRate * 0.72, -1.0, 1.0);
          state.bankAngle = clamp(
            bankSpring.update(dt, targetBank, 26 * sp, clamp(6.4 * dScale, 3.4, 10.5)),
            -1.05, 1.05
          );

          // -----------------------------------------------------------------
          // 3. 蝠鲼式柔波相位推进 + 细长尾带物理链 + 弹簧背草摇曳
          // -----------------------------------------------------------------
          const waveSpeed = (action === 'idle' ? 1.65 : 2.25) * gFreq;
          state.wavePhase = (state.wavePhase + dt * waveSpeed) % (TAU * 16);

          const bankShiftX = -state.bankAngle * 3.0 * sMul;
          const [tailRootX, tailRootY] = localToWorldXY(state.x, state.y, state.yaw, bankShiftX, -11.8 * sMul);
          tailChain.update(dt, tailRootX, tailRootY, Math.max(6.0, state.z + 0.8 * sMul), state.yaw, time, {
            segLen: 5.4 * sMul,
            flexibility: flex,
            waveFreq: 2.0 * gFreq,
            waveAmp: (action === 'idle' ? 0.20 : 0.34) * flex,
            zTargetFn: (u) => Math.max(6.0, state.z + lerp(0.8, -1.4, u) * sMul)
          });

          const moveSpd = Math.hypot(state.vx, state.vy);
          for (let i = 0; i < GRASS_CLUMPS.length; i++) {
            const cl = GRASS_CLUMPS[i];
            const windTgt = (
              Math.sin(time * 2.4 * gFreq + cl.phase) * (0.24 + moveSpd * 0.015) +
              state.bankAngle * 0.38
            ) * flex;
            grassSprings[i].update(dt, windTgt, 40 * sp, clamp(4.8 * dScale, 2.6, 8.2));
          }

          // -----------------------------------------------------------------
          // 4. 偶发撒落金黄草籽粒子往下飘
          // -----------------------------------------------------------------
          if (vfx) {
            state.seedCd -= dt;
            if (state.seedCd <= 0) {
              state.seedCd = action === 'idle' ? (1.1 + Math.random() * 0.9) : (0.36 + Math.random() * 0.32);
              spawnGrassSeed(vfx, sMul);
              if (action !== 'idle' && Math.random() < 0.38) spawnGrassSeed(vfx, sMul);
            }
          }

          // -----------------------------------------------------------------
          // 5. 同步更新 4 个跨个体停靠挂点与通用 sockets
          // -----------------------------------------------------------------
          syncMountSockets(sMul);
          sockets.setWorld('backCenter', state.x, state.y, state.z + 6.0 * sMul, state.yaw);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const bank = state.bankAngle;

          // 1. 细长尾带（2 节尾段 + 1 节尾梢，枢轴锁尾根）
          const tNodes = tailChain.nodes;
          for (let i = 1; i <= 2; i++) {
            const tn = tNodes[i];
            list.push({
              partKey: 'tailSeg',
              asset: parts.tailSeg,
              x: tn.x,
              y: tn.y,
              lift: Math.max(2.0, tn.z),
              ro: tn.yaw,
              bias: -0.45
            });
          }
          const tLast = tNodes[3];
          const [ttx, tty] = pivotToWorldXY(tLast.x, tLast.y, tLast.yaw, TAIL_TIP_PIVOT.x * sMul, TAIL_TIP_PIVOT.y * sMul);
          list.push({
            partKey: 'tailTip',
            asset: parts.tailTip,
            x: ttx,
            y: tty,
            lift: Math.max(2.0, tLast.z - 0.3 * sMul),
            ro: tLast.yaw,
            bias: -0.55
          });

          // 2. 7 块薄翼条（中脊 + 左右内翼/中翼/翼梢，波浪起伏 + 伪转弯侧倾）
          for (let i = 0; i < WING_STRIPS.length; i++) {
            const st = WING_STRIPS[i];
            const pose = evalStripPose(
              st.side, st.stripIdx, st.lx, st.ly,
              st.bankGain, st.waveAmp, st.phaseOff, sMul
            );
            // 翼梢叠加极轻微的波浪扫掠微转 + 压弯内收微转
            const waveSweep = Math.cos(state.wavePhase + st.phaseOff) * 0.045 * st.stripIdx * (st.side || 0);
            const stripYaw = wrapAngle(yw + st.sweepYaw + waveSweep);
            // 侧倾抬高的一侧略加正 bias，压低的一侧略加负 bias，保证 360° 视角层序自然
            const bankBias = st.side * bank * 0.14 * st.stripIdx;

            list.push({
              partKey: st.assetKey,
              asset: parts[st.assetKey],
              x: pose.wx,
              y: pose.wy,
              lift: Math.max(4.0, pose.wz + st.baseZ * sMul),
              ro: stripYaw,
              bias: st.bias + bankBias
            });
          }

          // 3. 背上 6 簇放大清晰的弹簧草丛 + 亮色小花朵（跟随所在翼条的波浪与侧倾）
          const rollCos = 1.0 - Math.abs(bank) * 0.14;
          const shiftX = -bank * 3.0;
          for (let i = 0; i < GRASS_CLUMPS.length; i++) {
            const cl = GRASS_CLUMPS[i];
            const sway = grassSprings[i].x;
            const bankGain = cl.side === 0 ? 0.0 : 1.8;
            const waveAmp = cl.side === 0 ? 0.25 : 0.75;
            const phaseOff = cl.side === 0 ? 0.22 : 0.0;
            const waveZ = Math.sin(state.wavePhase + phaseOff) * waveAmp;
            const bankZ = cl.side * bank * bankGain - Math.abs(bank) * 0.55;

            const [gx, gy] = localToWorldXY(
              state.x, state.y, yw,
              (cl.lx * rollCos + shiftX + sway * 0.95) * sMul,
              (cl.ly - Math.abs(sway) * 0.25) * sMul
            );
            list.push({
              partKey: cl.kind,
              asset: parts[cl.kind],
              x: gx,
              y: gy,
              lift: Math.max(6.0, state.z + (cl.zOff + waveZ + bankZ) * sMul),
              ro: wrapAngle(yw + cl.phase + sway * 0.72),
              symDeg: 90,
              bias: 0.95 + cl.side * bank * 0.12
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sky5Def.id,
            code: Sky5Def.code,
            status: Sky5Def.status,
            name: Sky5Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            wingStrips: WING_STRIPS.length,
            grassClumps: GRASS_CLUMPS.length,
            mountSocketCount: mountSockets.length,
            bankAngle: Number(state.bankAngle.toFixed(3)),
            footRadius: Sky5Def.footRadius,
            headZ: 14,
            centerZ: 5,
            blocks: Sky5Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sky5Def);
})(window.PixelWorkshop);
