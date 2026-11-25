'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // B04 标杆 · T16 破损苔藓遗迹拱门（buildings/building_ruin_arch.js）
  // -------------------------------------------------------------------------
  // 呼应 T16（苔藓古石遗迹）生态规矩与母表 B04（消除工整积木感！）：
  //   - 非对称破损断口：左高雕纹石柱 + 右拦腰斜断残柱 + 上方残缺半截弧形拱梁
  //   - 跌落地面 3 块刻纹断石块 + 石缝渗出青碧矿水细线 + 亮翠苔衣与垂挂青藤
  //   - 拱顶残缝嵌一枚古旧暗金圆环饰
  // 拆件与图集预算（严格每块 <= 34 格，0 glowKeys，靠明晰配色与青碧矿水提亮）：
  //   1. leftPillar  (14×14×34) : 左侧较完整雕纹青灰石柱（带裂纹、矿水细线、翠苔）
  //   2. rightStub   (14×14×20) : 右侧拦腰斜断残柱（锯齿参差斜裂断口 + 碎茬）
  //   3. brokenArch  (30×14×15) : 上方残缺半截弧形拱梁（右侧锯齿断口 + 暗金圆环饰）
  //   4. rubbleBlock (10×9×7)   : 跌落地面刻纹断石块（复用 3 块散落地面）
  //   5. hangingVine (6×6×16)   : 随风轻摇垂挂青藤（复用 4 束挂在拱眉与残柱）
  //   6. seepPuddle  (18×12×2, noOutline: true) : 地面浅碧矿温水浅洼
  // 严禁常态 scaleX/scaleY 拉伸；24 色 0 重色 0 禁用字
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 古石主体青灰岩（3 档）
      stoneDark:  '#3a474a',
      stoneMid:   '#5e7073',
      stoneHi:    '#8da1a3',
      // 浅灰断茬与切棱（3 档，拉出锯齿斜裂断口锐利边缘）
      chipDark:   '#728282',
      chipMid:    '#a6b8b5',
      chipHi:     '#d9e6e2',
      // 深凿回字几何刻纹与裂缝（3 档，呼应遗1/遗2）
      carveDark:  '#1d2629',
      carveMid:   '#2e3b3f',
      carveHi:    '#485a60',
      // 顺水路蔓延的亮翠苔衣（3 档，高对比跳脱灰石）
      mossDark:   '#23632f',
      mossMid:    '#3ea849',
      mossHi:     '#80e374',
      // 垂挂青藤深绿枝叶（3 档）
      vineDark:   '#1a4d2c',
      vineMid:    '#2f8245',
      vineHi:     '#63c46c',
      // 石缝渗出的温润青碧矿水（3 档，不进 glowKeys 但高饱和清亮）
      waterDark:  '#1e7d7b',
      waterMid:   '#38c2ba',
      waterHi:    '#94f5ea',
      // 拱顶残缝古旧暗金圆环饰（3 档，绝不进 glowKeys）
      goldDark:   '#755017',
      goldMid:    '#b5812b',
      goldHi:     '#ebc15e',
      // 地面碎土砾（3 档）
      dirtDark:   '#3b372e',
      dirtMid:    '#5c5548',
      dirtHi:     '#857c6a'
    },
    glowKeys: [],
    parts: ['stone', 'chip', 'carve', 'moss', 'vine', 'water', 'gold', 'dirt'],
    noCrease: [
      ['stone', 'chip'],
      ['stone', 'carve'],
      ['stone', 'moss'],
      ['stone', 'water'],
      ['moss', 'vine'],
      ['moss', 'water'],
      ['stone', 'gold'],
      ['stone', 'dirt']
    ],
    materials: {
      stone: ['stoneDark', 'stoneMid', 'stoneHi'],
      chip:  ['chipDark',  'chipMid',  'chipHi'],
      carve: ['carveDark', 'carveMid', 'carveHi'],
      moss:  ['mossDark',  'mossMid',  'mossHi'],
      vine:  ['vineDark',  'vineMid',  'vineHi'],
      water: ['waterDark', 'waterMid', 'waterHi'],
      gold:  ['goldDark',  'goldMid',  'goldHi'],
      dirt:  ['dirtDark',  'dirtMid',  'dirtHi']
    },
    protectedParts: ['water', 'gold', 'moss']
  });

  // 3 套零重建模换色皮肤（每套 24 色 0 重色 0 禁用字）
  const SKINS = [
    {
      id: 'blue_stone_emerald_moss',
      name: '青石翠苔',
      dot: '#3ea849',
      outline: '#0e1617',
      pal: {},
      fx: {
        mist:   '#a8f0e4',
        waterA: '#38c2ba',
        waterB: '#9ef7ed',
        leaf:   '#6ed470'
      }
    },
    {
      id: 'warm_sand_gold_vine',
      name: '暖砂金藤',
      dot: '#c99b42',
      outline: '#1a140d',
      pal: {
        stoneDark: '#594734', stoneMid: '#8a7052', stoneHi: '#bd9f7b',
        chipDark:  '#856d53', chipMid:  '#b89c79', chipHi:  '#e8d3b3',
        carveDark: '#302419', carveMid: '#4a3928', carveHi: '#6b533b',
        mossDark:  '#616b1f', mossMid:  '#9eb031', mossHi:  '#dce868',
        vineDark:  '#78591c', vineMid:  '#bd8f2d', vineHi:  '#f0cc60',
        waterDark: '#1c786e', waterMid: '#34b8a8', waterHi: '#91f0e2',
        goldDark:  '#245c54', goldMid:  '#3a9184', goldHi:  '#70d4c4'
      },
      fx: {
        mist:   '#c4f2e8',
        waterA: '#34b8a8',
        waterB: '#a2f5e9',
        leaf:   '#d4d957'
      }
    },
    {
      id: 'dark_rock_blue_moss',
      name: '暗岩蓝苔',
      dot: '#399ec4',
      outline: '#0b101a',
      pal: {
        stoneDark: '#262d3b', stoneMid: '#404c61', stoneHi: '#667896',
        chipDark:  '#556580', chipMid:  '#8398bd', chipHi:  '#bdd0f0',
        carveDark: '#141821', carveMid: '#222836', carveHi: '#374257',
        mossDark:  '#1a576b', mossMid:  '#2f96b3', mossHi:  '#6fd9f0',
        vineDark:  '#164459', vineMid:  '#277594', vineHi:  '#5bbcd9',
        waterDark: '#21759e', waterMid: '#45b5e6', waterHi: '#a3ebff',
        goldDark:  '#75694e', goldMid:  '#b3a178', goldHi:  '#e8d9b0'
      },
      fx: {
        mist:   '#b8ecff',
        waterA: '#45b5e6',
        waterB: '#b0efff',
        leaf:   '#5ecce6'
      }
    }
  ];

  // 1. 左侧较完整的雕纹青灰石柱（14×14×34，严守 <= 34 格）
  function buildLeftPillar(makeCanvas) {
    const m = new VoxelModel(14, 14, 34, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6, 6, -6, 6, 0, 33, (x, y, z, X, Y) => {
      const ax = Math.abs(X), ay = Math.abs(Y);
      // 柱础（z=0..4）宽，柱身（z=5..28）收窄并带右上角崩缺，柱头（z=29..33）略外挑
      const lim = (z <= 4 || z >= 29) ? 5.6 : 4.4;
      if (ax > lim || ay > lim) return;
      // 切去柱身四角造石棱
      if (ax > lim - 0.9 && ay > lim - 0.9 && z >= 5 && z <= 28) return;
      // 非对称破损崩缺：柱腰右侧一处深缺口（z=14..20, X>2.8, Y>1.2）
      if (z >= 14 && z <= 20 && X > 2.8 && Y > 1.2) return;
      // 柱顶左后角小崩茬
      if (z >= 31 && X < -3.2 && Y < -2.4) return;

      // 沿柱面蜿蜒渗下的青碧矿水细线（呼应 T16：苔只沿水路长）
      const seepX = Math.sin(z * 0.24) * 1.4 - 0.6;
      const isWaterLine = (Y >= lim - 1.0 && Math.abs(X - seepX) <= 0.65 && z >= 2 && z <= 27);
      const isMossAlongWater = (Y >= lim - 1.1 && Math.abs(X - seepX) > 0.65 && Math.abs(X - seepX) <= 1.85 && z >= 1 && z <= 26);

      // 遗1 同源几何回字刻纹槽
      const isCarve = (
        (ay >= lim - 0.8 && Math.abs(X) >= 2.2 && Math.abs(X) <= 3.1 && ((z >= 8 && z <= 13) || (z >= 21 && z <= 26))) ||
        (ax >= lim - 0.8 && Math.abs(Y) <= 1.2 && (z === 10 || z === 18 || z === 25))
      );

      // 崩缺边与柱头浅灰断茬
      const isChip = (z === 29 || z === 33 || (z >= 13 && z <= 21 && X > 2.0 && Y > 0.6));

      if (isWaterLine) {
        m.setRaw(x, y, z, mat('water'), partId.water);
      } else if (isMossAlongWater || (z <= 3 && ax > 4.2 && Y > 1.0) || (z >= 30 && X > 1.5)) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isCarve) {
        m.setRaw(x, y, z, mat('carve'), partId.carve);
      } else if (isChip) {
        m.setRaw(x, y, z, mat('chip'), partId.chip);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 6.8, headZ: 34, centerZ: 16 });
  }

  // 2. 右侧拦腰斜断的残柱（14×14×20，锯齿斜裂断口，彻底消除积木感）
  function buildRightStub(makeCanvas) {
    const m = new VoxelModel(14, 14, 20, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6, 6, -6, 6, 0, 19, (x, y, z, X, Y) => {
      const ax = Math.abs(X), ay = Math.abs(Y);
      const lim = z <= 4 ? 5.6 : 4.4;
      if (ax > lim || ay > lim) return;
      if (ax > lim - 0.9 && ay > lim - 0.9 && z >= 5) return;

      // 拦腰大幅斜裂断口：左侧高至 z=18，右侧斜劈至 z=11，叠加参差锯齿
      const jagged = Math.sin(X * 1.15 + Y * 0.85) * 1.6 + Math.cos(Y * 1.7) * 0.9;
      const cutZ = 14.8 - X * 0.68 + Y * 0.25 + jagged;
      if (z > cutZ) return;

      // 断口顶部浅灰碎岩茬 + 顺缝渗下的矿水细线与亮翠苔
      const isBreakFace = (z >= cutZ - 1.5);
      const seepY = Math.cos(z * 0.3) * 1.1;
      const isWater = (X <= -lim + 1.1 && Math.abs(Y - seepY) <= 0.6 && z >= 1 && z <= cutZ - 1);
      const isMoss = (
        (X <= -lim + 1.2 && Math.abs(Y - seepY) <= 1.9 && z >= 1 && z <= cutZ - 1) ||
        (isBreakFace && X < -1.0 && Y > -1.0) ||
        (z <= 3 && ay > 4.2 && X < 1.5)
      );
      const isCarve = (ay >= lim - 0.8 && Math.abs(X) <= 1.8 && (z === 7 || z === 11));

      if (isWater) {
        m.setRaw(x, y, z, mat('water'), partId.water);
      } else if (isMoss) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isBreakFace) {
        m.setRaw(x, y, z, mat('chip'), partId.chip);
      } else if (isCarve) {
        m.setRaw(x, y, z, mat('carve'), partId.carve);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 6.8, headZ: 20, centerZ: 9 });
  }

  // 3. 上方残缺半截的弧形拱梁（30×14×15，右侧参差锯齿斜断 + 拱顶暗金圆环饰）
  function buildBrokenArch(makeCanvas) {
    const m = new VoxelModel(30, 14, 15, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-14, 14, -6, 6, 0, 14, (x, y, z, X, Y) => {
      const ay = Math.abs(Y);
      if (ay > 5.0) return;

      // 右侧在 X = 4..8 之间参差斜断，形成半截残缺拱梁
      const breakX = 6.2 - (z - 6) * 0.42 + Math.sin(z * 1.1 + Y * 0.9) * 1.4;
      if (X > breakX) return;
      if (X < -13.5) return;

      // 拱顶外轮廓（左端压在左柱上 z=10，向中间隆起至 z=14）
      const topZ = 13.6 - Math.pow((X + 1.5) / 14.0, 2) * 3.8 + Math.sin(X * 0.6) * 0.45;
      if (z > topZ) return;

      // 下方拱洞圆弧挖空（圆心在 X = 1.5, z = -3，半径约 10.2）
      if (X > -7.8) {
        const dx = (X - 1.5) / 10.2;
        const archBot = Math.sqrt(Math.max(0, 1 - dx * dx)) * 6.4;
        if (z < archBot) return;
      }

      // 拱顶残缝嵌入古旧暗金圆环饰（前后双面突出，X 居中偏左 -1.0, z=8..13）
      const ringD = Math.hypot(X + 1.0, z - 10.2);
      const isGoldRing = (ay >= 3.2 && ringD >= 1.4 && ringD <= 2.9);

      const isBreakEdge = (X > breakX - 1.6);
      const isTopMoss = (z >= topZ - 1.6 && X > -10.0 && X < breakX - 1.0 && Math.sin(X * 0.5 + Y) > -0.2);
      const isCarve = (ay >= 4.0 && Math.abs(z - 8.0) < 0.8 && X < -5.0 && X > -12.0);
      const isWaterSeep = (ay >= 4.1 && Math.abs(X + 6.2) <= 0.7 && z <= 7);

      if (isGoldRing) {
        m.setRaw(x, y, z, mat('gold'), partId.gold);
      } else if (isWaterSeep) {
        m.setRaw(x, y, z, mat('water'), partId.water);
      } else if (isTopMoss) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isBreakEdge || z >= topZ - 0.8) {
        m.setRaw(x, y, z, mat('chip'), partId.chip);
      } else if (isCarve) {
        m.setRaw(x, y, z, mat('carve'), partId.carve);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 14.5, headZ: 15, centerZ: 7 });
  }

  // 4. 跌落地面的刻纹断石块（10×9×7，复用 3 块）
  function buildRubbleBlock(makeCanvas) {
    const m = new VoxelModel(10, 9, 7, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-4, 4, -4, 4, 0, 6, (x, y, z, X, Y) => {
      // 斜裂梯形残石块，消除正方体感
      const topZ = 5.4 - X * 0.35 + Y * 0.22;
      if (z > topZ) return;
      const rLim = 4.0 - z * 0.14;
      if (Math.abs(X) > rLim || Math.abs(Y) > rLim - 0.4) return;
      if (X > 2.4 && Y < -1.8 && z > 2) return;

      const isCarve = (z >= topZ - 1.1 && Math.abs(X) < 1.8 && Math.abs(Y) < 1.6 && (Math.abs(X) > 0.7 || Math.abs(Y) > 0.7));
      const isMoss = (X < -1.6 && z >= 2);
      const isChip = (X > rLim - 1.1 || z >= topZ - 0.7);

      if (isMoss) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isCarve) {
        m.setRaw(x, y, z, mat('carve'), partId.carve);
      } else if (isChip) {
        m.setRaw(x, y, z, mat('chip'), partId.chip);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 4.6, headZ: 7, centerZ: 3 });
  }

  // 5. 随风轻摇的垂挂青藤（6×6×16，复用 4 束）
  function buildHangingVine(makeCanvas) {
    const m = new VoxelModel(6, 6, 16, SPEC);
    const { mat, partId } = SPEC;

    // 蜿蜒下垂的主藤茎 + 错落亮翠叶片
    for (let z = 1; z <= 15; z++) {
      const t = z / 15;
      const vx = Math.sin(t * Math.PI * 2.2) * 1.1;
      const vy = Math.cos(t * Math.PI * 1.6) * 0.8;
      const r = lerp(0.65, 1.05, t);
      m.paintEllipsoid(vx, vy, z, r, r, 0.85, mat('vine'), partId.vine, true);
      if (z % 3 === 1 && z >= 3) {
        const lx = vx + ((z & 2) ? 1.15 : -1.15);
        m.paintEllipsoid(lx, vy + 0.3, z, 1.15, 0.85, 0.9, mat('moss'), partId.moss, true);
      }
    }

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.6, headZ: 16, centerZ: 8 });
  }

  // 6. 地面浅碧矿温水浅洼（18×12×2，noOutline: true，顺石缝汇聚）
  function buildSeepPuddle(makeCanvas) {
    const m = new VoxelModel(18, 12, 2, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-8, 8, -5, 5, 0, 1, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const wave = Math.sin(ang * 3 + 0.8) * 1.2 + Math.cos(ang * 2) * 0.8;
      const d = Math.hypot(X / (7.6 + wave * 0.5), Y / (4.8 + wave * 0.4));
      if (d > 1.0) return;
      if (z === 1 && d > 0.78) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else {
        m.setRaw(x, y, z, mat('water'), partId.water);
      }
    });

    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 8.5, headZ: 2, centerZ: 1 });
  }

  // 跌落地面 3 块刻纹断石块布局
  const RUBBLES = [
    { lx:  9.5, ly:  7.4, ro:  0.48 },
    { lx:  3.8, ly:  5.2, ro: -0.92 },
    { lx: 15.8, ly: -3.2, ro:  1.75 }
  ];

  // 4 束垂挂青藤挂点（挂在拱眉与残柱断口下方）
  const VINES = [
    { lx: -6.2, ly:  3.8, lift: 22.0, ro:  0.2,  phase: 0.0 },
    { lx:  1.4, ly:  4.2, lift: 25.0, ro:  1.2,  phase: 1.4 },
    { lx:  5.6, ly: -3.4, lift: 21.5, ro:  2.5,  phase: 2.8 },
    { lx: 11.4, ly:  3.2, lift:  7.5, ro: -0.9,  phase: 4.1 }
  ];

  const Def = {
    id: 'building_ruin_arch',
    code: 'B04',
    name: '破损苔藓遗迹拱门',
    status: 'done',
    defaultHabitat: 'ruins',
    tag: 'B04 标杆 · T16 破损苔藓遗迹拱门',
    summary: '严格非对称破损的古石遗迹拱门（单块 <=34 格）：左侧雕纹青灰石柱 + 右侧拦腰锯齿斜断残柱 + 残缺半截弧形拱梁（嵌暗金圆环饰）+ 3 块跌落刻纹断石 + 青碧矿水线与 4 束摇曳垂藤；支持微风湿气待机与石缝矿水渗流演出及 3 套换色皮肤',
    footRadius: 21.0,
    ecoWeight: 3.6,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',         name: '垂藤轻拂与湿气飘升', loop: true,  status: 'done' },
      { id: 'mineral_seep', name: '石缝渗出带矿温水',   loop: false, duration: 2.6, status: 'done' }
    ],
    blocks: [
      '左完整雕纹石柱 + 右拦腰斜断残柱 + 半截锯齿拱梁（单块 <=34 格）',
      '拱顶残缝古旧暗金圆环饰 + 3 块复用跌落刻纹断石',
      '顺石缝蜿蜒青碧矿水细线与亮翠苔衣 + 4 束随风轻摇垂藤',
      '呼应 T16 生态规矩：石缝渗出带矿温水汇聚地面泛开浅碧涟漪'
    ],
    soulHabit: '常态下 4 束垂藤错相轻拂、断石间偶有湿气青粒飘升；触发矿水渗流时，带矿温水顺石柱缝隙滑落至地面浅洼，泛开浅碧涟漪与温润雾粒',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        leftPillar:  buildLeftPillar(makeCanvas),
        rightStub:   buildRightStub(makeCanvas),
        brokenArch:  buildBrokenArch(makeCanvas),
        rubbleBlock: buildRubbleBlock(makeCanvas),
        hangingVine: buildHangingVine(makeCanvas),
        seepPuddle:  buildSeepPuddle(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0.24,
        vineSway: [0, 0, 0, 0],
        vineRot:  [0, 0, 0, 0],
        puddleOp: 0.72,
        mistCd: 0.9,
        seepCd: 0.1,
        lastAction: 'idle',
        rippleDone: 0
      };

      let curSkin = SKINS[0];

      const instance = {
        def: Def,
        parts,
        partListAssets: Object.values(parts),
        state,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(x, y, yaw) {
          state.x = x;
          state.y = y;
          state.z = 0;
          state.yaw = yaw;
          state.vineSway = [0, 0, 0, 0];
          state.vineRot = [0, 0, 0, 0];
          state.puddleOp = 0.72;
          state.mistCd = 0.9;
          state.seepCd = 0.1;
          state.lastAction = 'idle';
          state.rippleDone = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.rippleDone = 0;
          }

          // 4 束垂挂青藤错相轻拂微摆（位移与微小转角，绝不拉伸）
          for (let i = 0; i < VINES.length; i++) {
            const ph = VINES[i].phase;
            state.vineSway[i] = Math.sin(time * 1.9 * freq + ph) * 0.42 * sMul;
            state.vineRot[i] = Math.sin(time * 1.5 * freq + ph + 0.6) * 0.12;
          }

          if (action === 'idle') {
            state.puddleOp = 0.70 + Math.sin(time * 1.4) * 0.06;
            // 断石间偶有湿气青粒缓缓飘升
            state.mistCd -= dt;
            if (state.mistCd <= 0 && vfx) {
              state.mistCd = (1.35 + Math.random() * 0.85) / freq;
              const [mx, my] = localToWorldXY(
                state.x, state.y, state.yaw,
                (-4.0 + Math.random() * 14.0) * sMul,
                (1.0 + Math.random() * 6.0) * sMul
              );
              vfx.spawnParticle(
                mx, my, 2.5 * sMul,
                (Math.random() - 0.5) * 1.6 * sMul,
                (Math.random() - 0.5) * 1.6 * sMul,
                (4.2 + Math.random() * 2.8) * sMul,
                1.35 + Math.random() * 0.4,
                1.25 + Math.random() * 0.35,
                fx.mist,
                false,
                -1.0
              );
            }
          } else if (action === 'mineral_seep') {
            const u = clamp(actionTime / 2.6, 0, 1);
            state.puddleOp = clamp(0.72 + Math.sin(u * Math.PI) * 0.28, 0.70, 1.0);

            // 0.1s ~ 1.75s：石缝持续渗出带矿温水珠顺左柱与右残柱滑落
            if (u >= 0.04 && u <= 0.68 && vfx) {
              state.seepCd -= dt;
              if (state.seepCd <= 0) {
                state.seepCd = 0.095;
                // 左柱石缝滑落水珠
                const [lx, ly] = localToWorldXY(state.x, state.y, state.yaw, (-10.8 + (Math.random() - 0.5) * 1.8) * sMul, 4.8 * sMul);
                vfx.spawnParticle(
                  lx, ly, (16.0 + Math.random() * 11.0) * sMul,
                  (Math.random() - 0.5) * 1.4 * sMul, 1.8 * sMul, -6.5 * sMul,
                  0.65, 1.35, Math.random() > 0.4 ? fx.waterA : fx.waterB, true, 36
                );
                // 右断柱裂口滑落水珠
                const [rx, ry] = localToWorldXY(state.x, state.y, state.yaw, (8.6 + (Math.random() - 0.5) * 1.8) * sMul, 2.6 * sMul);
                vfx.spawnParticle(
                  rx, ry, (10.0 + Math.random() * 6.0) * sMul,
                  -1.2 * sMul, 1.4 * sMul, -5.0 * sMul,
                  0.58, 1.25, fx.waterB, true, 34
                );
              }
            }

            // 地面水洼汇聚泛开浅碧涟漪与温润雾粒
            const [px, py] = localToWorldXY(state.x, state.y, state.yaw, -3.6 * sMul, 5.4 * sMul);
            if (state.rippleDone === 0 && actionTime >= 0.48 && vfx) {
              state.rippleDone = 1;
              vfx.addRipple(px, py, 2.5 * sMul, 16.5 * sMul, 1.05, 1.8);
              vfx.addRipple(px, py, 1.2 * sMul, 10.5 * sMul, 0.78, 1.3);
            }
            if (state.rippleDone === 1 && actionTime >= 1.12 && vfx) {
              state.rippleDone = 2;
              vfx.addRipple(px, py, 3.0 * sMul, 19.0 * sMul, 1.15, 1.6);
              for (let k = 0; k < 12; k++) {
                const a = (k / 12) * TAU + Math.random() * 0.35;
                const r = (2.0 + Math.random() * 6.0) * sMul;
                vfx.spawnParticle(
                  px + Math.cos(a) * r,
                  py + Math.sin(a) * r,
                  2.6 * sMul,
                  Math.cos(a) * 2.2 * sMul, Math.sin(a) * 2.2 * sMul, (6.0 + Math.random() * 4.0) * sMul,
                  1.25 + Math.random() * 0.45,
                  1.35 + Math.random() * 0.4,
                  k % 2 === 0 ? fx.mist : fx.waterB,
                  k % 3 === 0,
                  -1.4
                );
              }
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const list = [];

          // 1. 地面浅碧矿温水浅洼（noOutline: true 柔和贴地）
          const [px, py] = localToWorldXY(state.x, state.y, yw, -3.6 * sMul, 5.4 * sMul);
          list.push({
            partKey: 'seepPuddle',
            asset: parts.seepPuddle,
            x: px,
            y: py,
            lift: 0,
            ro: wrapAngle(yw + 0.14),
            noOutline: true,
            opacity: state.puddleOp,
            bias: -0.45
          });

          // 2. 左侧较完整的雕纹青灰石柱
          const [lx, ly] = localToWorldXY(state.x, state.y, yw, -11.4 * sMul, 0);
          list.push({
            partKey: 'leftPillar',
            asset: parts.leftPillar,
            x: lx,
            y: ly,
            lift: 0,
            ro: yw,
            bias: 0.05
          });

          // 3. 右侧拦腰斜断的残柱
          const [rx, ry] = localToWorldXY(state.x, state.y, yw, 11.4 * sMul, 0.6 * sMul);
          list.push({
            partKey: 'rightStub',
            asset: parts.rightStub,
            x: rx,
            y: ry,
            lift: 0,
            ro: wrapAngle(yw - 0.08),
            bias: 0.05
          });

          // 4. 上方残缺半截弧形拱梁（稳坐左柱顶，右侧残缺悬断）
          const [ax, ay] = localToWorldXY(state.x, state.y, yw, -1.8 * sMul, 0);
          list.push({
            partKey: 'brokenArch',
            asset: parts.brokenArch,
            x: ax,
            y: ay,
            lift: 29.0 * sMul,
            ro: yw,
            bias: 0.30
          });

          // 5. 3 块跌落地面的刻纹断石块
          for (let i = 0; i < RUBBLES.length; i++) {
            const rb = RUBBLES[i];
            const [bx, by] = localToWorldXY(state.x, state.y, yw, rb.lx * sMul, rb.ly * sMul);
            list.push({
              partKey: `rubble_${i}`,
              asset: parts.rubbleBlock,
              x: bx,
              y: by,
              lift: 0,
              ro: wrapAngle(yw + rb.ro),
              bias: -0.15
            });
          }

          // 6. 4 束随风轻摇的垂挂青藤
          for (let i = 0; i < VINES.length; i++) {
            const vn = VINES[i];
            const [vx, vy] = localToWorldXY(
              state.x, state.y, yw,
              vn.lx * sMul + state.vineSway[i],
              vn.ly * sMul
            );
            list.push({
              partKey: `vine_${i}`,
              asset: parts.hangingVine,
              x: vx,
              y: vy,
              lift: vn.lift * sMul,
              ro: wrapAngle(yw + vn.ro + state.vineRot[i]),
              bias: 0.38
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id,
            code: Def.code,
            name: Def.name,
            status: Def.status,
            skin: curSkin.id,
            footRadius: Def.footRadius,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(Def, 'building');
})(window.PixelWorkshop);
