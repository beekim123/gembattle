'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, pitchPt } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 海3 · 浮岛巨兽（挪威古籍 Konungs skuggsjaHafgufa · M16 超巨型拆块 Boss 标杆 · v3 精制纯生态版）
  // -------------------------------------------------------------------------
  // 【前置调研与工程预算】
  // 1. 生物原型与运动学调研：
  //    - 出自中世纪挪威文献挪威古籍 Konungs skuggsja（Konungs skuggsja）：巨兽半潜远洋时背脊如积沙长草的
  //      荒礁浮岛，进食时反刍吐出食糜引诱鱼群聚入张开的巨口，待鱼群聚满后猛然合口吞下；
  //      现代海洋学研究表明其对应座头鲸与布氏鲸的「陷阱捕食」（trap-feeding）行为。
  //    - 运动学采用低频浮力呼吸起伏 + 非对称二阶弹簧巨口开合（慢张低刚度 -> 猛合高刚度）+
  //      5 条小银鱼简化 Boids 集群力场（分离/对齐/凝聚 + 趋食引力 / 合口径向逃逸）+
  //      2 只背脊海鸟「歇息踱步理羽 <-> 惊起绕岛盘旋 <-> 轻盈落回」状态机。
  // 2. 三维几何拆块与图集预算（单件严格 <= 38 格、全大件 X 对称、glowKeys 为空 cells=2）：
  //    - 核查 core/renderer.js：ATLAS_PAGE=512、ATLAS_BUDGET_MB=28、BAKE_SCALE=2.5、
  //      ANGLE_EDGE_PX=1.75；严格 X 对称件（x <-> w-1-x）触发 assetInfo.sym=true 只烘 0~180°，
  //      且控制单块烘焙宽 bw <= 126 px 让 512 页每行并排 2 格，图集占用极度克制。
  //    - islandCore  (36×38×22)：中央积沙长草龟背礁丘，覆暖沙、绿草与岩脊，中心 (0, 0)，submerge=0；
  //    - flankL/R    (34×24×16)：左右对称巨兽侧背岩甲，共享同一 X 对称件分别旋 +90°/-90° 挂在
  //                              (±18.5, -1.0)，内侧深嵌 islandCore 达 9 格（重叠率 > 52%）；
  //    - jawUpper×3  (28×28×16)：前方上颌（闭/半开/全开 3 档无损姿态），枢轴 (0, -9.5) 锁在
  //                              (0, +12.5)，后缘深嵌 islandCore 8.5 格，含锯齿利牙、深红上腭与双目；
  //    - jawLower×3  (28×30×14)：前方下颌（闭/半开/全开 3 档无损姿态），枢轴 (0, -10.5) 锁在
  //                              (0, +12.5)，含锯齿利牙与深红咽喉盆，bias=-2.2 稳居上颌与鱼群下方；
  //    - tailRidge   (24×30×15)：后方半潜脊鳍尾峰，枢轴 (0, +10.5) 锁在 (0, -14.5)，前缘深嵌 6.5 格；
  //    - 整兽跨度约 78（长）× 59（宽）格，所有接缝深嵌 6.5~9 格，任意 360° 旋转零缝隙零穿模；
  //    - 伴生交互物：2 只白羽海鸟（birdStand/Peck/FlyUp/FlyDown，12×12×10）+ 5 条小银鱼（9×13×7）。
  // 3. 现有内核盘点：
  //    - 直接复用 PW.Math / PW.Voxel / PW.Solvers.SpringDamper1D / SocketTracker / EnvFeedback；
  //    - 本脚本内自建巨口捕食闭环状态机、简化 Boids 鱼群与双海鸟生态机，不改动 core/。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 巨兽主岩背与颌甲（3 档）
      rockDark:     '#2a343d',
      rockMid:      '#465461',
      rockHi:       '#6e7f8f',
      // 深海硬鳞甲与脊鳍尾峰（3 档）
      slateDark:    '#1c2530',
      slateMid:     '#314052',
      slateHi:      '#4e637a',
      // 中央龟背暖沙（3 档）
      sandDark:     '#9e855c',
      sandMid:      '#cfb584',
      sandHi:       '#f0dcb0',
      // 礁丘绿草（3 档）
      grassDark:    '#2b5932',
      grassMid:     '#488547',
      grassHi:      '#7ab865',
      // 岩缝湿苔（3 档）
      mossDark:     '#39523b',
      mossMid:      '#587856',
      mossHi:       '#85a67b',
      // 侧甲藤壶与海盐斑（3 档）
      barnacleDark: '#7a858a',
      barnacleMid:  '#b0babd',
      barnacleHi:   '#dee6e8',
      // 深红咽喉与口腔内壁（3 档）
      mawDark:      '#3d1018',
      mawMid:       '#731e2c',
      mawHi:        '#ab3546',
      // 锯齿利牙（3 档）
      toothDark:    '#9c927d',
      toothMid:     '#d6ccb4',
      toothHi:      '#f7f2e4',
      // 巨兽双目（eyeGlint 严禁进 glowKeys）
      eyeDark:      '#0e131a',
      eyeIris:      '#e09a2b',
      eyeGlint:     '#f7fdff',
      // 背上白羽海鸟（3 档白羽 + 3 档灰翼尖 + 3 档橘喙）
      birdDark:     '#9aaab8',
      birdMid:      '#d4e1eb',
      birdHi:       '#f5fbff',
      wingDark:     '#3a4a5e',
      wingMid:      '#5d738c',
      wingHi:       '#8ca3bd',
      beakDark:     '#9e5c19',
      beakMid:      '#de8c2a',
      beakHi:       '#ffc259',
      // 聚食小银鱼群（3 档蓝钢背 + 3 档银白腹）
      fishBackDark: '#15446b',
      fishBackMid:  '#2b7bb3',
      fishBackHi:   '#67b8ed',
      fishSideDark: '#789fb8',
      fishSideMid:  '#b6d8eb',
      fishSideHi:   '#e8f6ff'
    },
    glowKeys: [],
    parts: [
      'rock', 'slate', 'sand', 'grass', 'moss', 'barnacle',
      'maw', 'tooth', 'eye', 'bird', 'wing', 'beak', 'fishBack', 'fishSide', 'fishEye'
    ],
    noCrease: [
      ['rock', 'slate'], ['rock', 'sand'], ['sand', 'grass'], ['rock', 'moss'],
      ['grass', 'moss'], ['rock', 'barnacle'], ['slate', 'barnacle'],
      ['rock', 'maw'], ['maw', 'tooth'], ['rock', 'eye'],
      ['bird', 'wing'], ['bird', 'beak'], ['bird', 'eye'],
      ['fishBack', 'fishSide'], ['fishSide', 'fishEye']
    ],
    materials: {
      rock:     ['rockDark',     'rockMid',     'rockHi'],
      slate:    ['slateDark',    'slateMid',    'slateHi'],
      sand:     ['sandDark',     'sandMid',     'sandHi'],
      grass:    ['grassDark',    'grassMid',    'grassHi'],
      moss:     ['mossDark',     'mossMid',     'mossHi'],
      barnacle: ['barnacleDark', 'barnacleMid', 'barnacleHi'],
      maw:      ['mawDark',      'mawMid',      'mawHi'],
      tooth:    ['toothDark',    'toothMid',    'toothHi'],
      bird:     ['birdDark',     'birdMid',     'birdHi'],
      wing:     ['wingDark',     'wingMid',     'wingHi'],
      beak:     ['beakDark',     'beakMid',     'beakHi'],
      fishBack: ['fishBackDark', 'fishBackMid', 'fishBackHi'],
      fishSide: ['fishSideDark', 'fishSideMid', 'fishSideHi']
    },
    protectedParts: ['eye', 'tooth', 'beak', 'fishEye']
  });

  // 4 套零重建模换色皮肤（严格 0 禁用字）
  const SKINS = [
    {
      id: 'emerald_reef',
      name: '碧草礁岛（远洋经典）',
      dot: '#488547',
      outline: '#09121c',
      pal: {},
      fx: {
        foam:   '#e6f7ff',
        chumA:  '#f2a65a',
        chumB:  '#ffd48a',
        splash: '#9cdcf7'
      }
    },
    {
      id: 'volcanic_obsidian',
      name: '玄岩火山岛（黑曜礁款）',
      dot: '#3d3336',
      outline: '#0d090a',
      pal: {
        rockDark:     '#1d191c', rockMid:     '#332c30', rockHi:     '#52474d',
        slateDark:    '#121014', slateMid:    '#242026', slateHi:    '#3d3640',
        sandDark:     '#524742', sandMid:     '#786861', sandHi:     '#a39087',
        grassDark:    '#7a2c16', grassMid:    '#bf4a22', grassHi:    '#f27c38',
        mossDark:     '#4f3728', mossMid:     '#7d563c', mossHi:     '#b58057',
        barnacleDark: '#59504d', barnacleMid: '#857873', barnacleHi: '#b8a9a3',
        mawDark:      '#4a0e12', mawMid:      '#911c20', mawHi:      '#d93c36',
        eyeIris:      '#ff9d2e'
      },
      fx: {
        foam:   '#e6eaed',
        chumA:  '#f08b46',
        chumB:  '#ffc675',
        splash: '#b8c4cc'
      }
    },
    {
      id: 'polar_iceberg',
      name: '白雪浮冰岛（极海款）',
      dot: '#8ecae6',
      outline: '#0a1826',
      pal: {
        rockDark:     '#2c4863', rockMid:     '#4a7091', rockHi:     '#79a2c4',
        slateDark:    '#1b334a', slateMid:    '#325678', slateHi:    '#5782a8',
        sandDark:     '#8cb3cc', sandMid:     '#bdddf0', sandHi:     '#e8f7ff',
        grassDark:    '#a8cde0', grassMid:    '#d8effa', grassHi:    '#f7fcff',
        mossDark:     '#5a88a3', mossMid:     '#82b4cf', mossHi:     '#b5dcf0',
        barnacleDark: '#7ca2ba', barnacleMid: '#b2d4e8', barnacleHi: '#e3f4fc',
        mawDark:      '#361426', mawMid:      '#692446', mawHi:      '#9e3d6b',
        eyeIris:      '#5ce1ff'
      },
      fx: {
        foam:   '#f0fbff',
        chumA:  '#eb9e6c',
        chumB:  '#ffd1a8',
        splash: '#a6e5ff'
      }
    },
    {
      id: 'coral_atoll',
      name: '赤珊暖礁岛（浅海款）',
      dot: '#d45b4a',
      outline: '#1c1012',
      pal: {
        rockDark:     '#54433a', rockMid:     '#80685b', rockHi:     '#b09484',
        slateDark:    '#3b312d', slateMid:    '#615048', slateHi:    '#8c7569',
        sandDark:     '#bd9c68', sandMid:     '#e6c891', sandHi:     '#fff0c7',
        grassDark:    '#8f2924', grassMid:    '#cf4a3e', grassHi:    '#fa7d6b',
        mossDark:     '#2b6b63', mossMid:     '#459e92', mossHi:     '#78cfc2',
        barnacleDark: '#9e8476', barnacleMid: '#cfbab0', barnacleHi: '#f5e7e1',
        mawDark:      '#4d1220', mawMid:      '#8c223b', mawHi:      '#c73e5c',
        eyeIris:      '#ffbe3b'
      },
      fx: {
        foam:   '#edfafa',
        chumA:  '#f5a04c',
        chumB:  '#ffdb8c',
        splash: '#91e3e0'
      }
    }
  ];

  // =========================================================================
  // 1. 中央龟背礁丘 islandCore（36×38×22，严格 X 对称 -> sym=true 省一半烘焙）
  //    暖沙海滩围裙 + 层叠绿草丘顶 + 对称小岩脊 + 湿苔与藤壶肌理
  // =========================================================================
  function buildIslandCore(makeCanvas) {
    const W = 36, D = 38, H = 22;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-16.5, 16.5, -17.5, 17.5, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X); // 仅用 |X| 构造地形起伏，严格保证左右对称（sym=true）
      const ridgeWave = Math.sin(ax * 0.42 + Y * 0.16) * 0.75 + Math.cos(Y * 0.28) * 0.55;
      // 宽厚龟背主穹顶（底宽顶圆，高 18 格左右）
      const rx = 16.2 + Math.sin(Y * 0.20) * 0.7;
      const ry = 17.2;
      const rz = 16.2 + ridgeWave * 0.55;
      const dome = Math.hypot(ax / rx, Y / ry, (z - 1.5) / rz);
      // 略微凸起的前额眉峰与后背岩肩
      const brow = Math.hypot(ax / 12.2, (Y - 7.5) / 8.8, (z - 3.5) / 13.0);
      const back = Math.hypot(ax / 13.0, (Y + 6.5) / 9.8, (z - 2.5) / 13.4);
      const d = smin(dome - 1.0, smin(brow - 1.0, back - 1.0, 0.18), 0.20);
      if (d > 0) return;

      // 顶面高度估计，用于铺设绿草层与暖沙环带
      const rNorm = Math.hypot(ax / 15.5, Y / 16.5);
      const isTopShell = d > -0.18;
      const grassPatch = Math.sin(ax * 0.55) * 0.12 + Math.cos(Y * 0.45) * 0.12;
      if (z >= 13 + grassPatch * 4 && rNorm < 0.74 + grassPatch && isTopShell) {
        m.setRaw(x, y, z, mat('grass'), partId.grass);
      } else if (z >= 9.5 && rNorm < 0.88 && isTopShell) {
        m.setRaw(x, y, z, mat('sand'), partId.sand);
      } else if (z >= 6 && z <= 11 && ((Math.round(ax + Y * 0.5) & 7) === 0)) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (z <= 5 && rNorm > 0.76 && ((Math.round(ax * 2 + Y) % 9) === 0)) {
        m.setRaw(x, y, z, mat('barnacle'), partId.barnacle);
      } else if (z <= 4.5) {
        m.setRaw(x, y, z, mat('slate'), partId.slate);
      } else {
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      }
    });

    // 岛顶对称小岩脊（凸显荒礁地貌，且保持左右严格对称）
    const rockSpines = [
      { x: 0,   y: -4.5, z0: 15.0, z1: 20.2, r0: 3.1, r1: 1.3 },
      { x: 5.5, y:  3.0, z0: 13.6, z1: 18.2, r0: 2.3, r1: 1.0 },
      { x: 6.2, y: -7.5, z0: 12.2, z1: 16.6, r0: 2.1, r1: 0.9 }
    ];
    for (const sp of rockSpines) {
      if (sp.x === 0) {
        m.paintCapsule(0, sp.y, sp.z0, 0, sp.y - 1.2, sp.z1, sp.r0, sp.r1, mat('rock'), partId.rock, true);
      } else {
        for (const s of [-1, 1]) {
          m.paintCapsule(s * sp.x, sp.y, sp.z0, s * (sp.x + 0.6), sp.y - 0.8, sp.z1, sp.r0, sp.r1, mat('rock'), partId.rock, true);
        }
      }
    }

    // 岛顶几簇饱满青草堆（让海鸟踱步的草坪立体丰盈）
    const grassClumps = [
      { x: 0,   y:  2.2, z: 16.8, rx: 4.5, ry: 4.2, rz: 1.9 },
      { x: 5.8, y: -1.8, z: 15.2, rx: 3.4, ry: 3.8, rz: 1.7 },
      { x: 3.6, y:  7.2, z: 14.2, rx: 3.0, ry: 2.8, rz: 1.6 }
    ];
    for (const gc of grassClumps) {
      if (gc.x === 0) {
        m.paintEllipsoid(0, gc.y, gc.z, gc.rx, gc.ry, gc.rz, mat('grass'), partId.grass, true);
      } else {
        for (const s of [-1, 1]) {
          m.paintEllipsoid(s * gc.x, gc.y, gc.z, gc.rx, gc.ry, gc.rz, mat('grass'), partId.grass, true);
        }
      }
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 16.5, headZ: 21, centerZ: 10 });
  }

  // =========================================================================
  // 2. 对称巨兽侧背岩甲 flank（34×24×16，严格 X 对称，flankL / flankR 共享！）
  //    局部 +Y 朝向外侧入海斜坡，局部 -Y 朝向内侧深嵌 islandCore，局部 X 沿前后轴对称
  // =========================================================================
  function buildFlankPlate(makeCanvas) {
    const W = 34, D = 24, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-16.0, 16.0, -11.0, 11.0, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      // 圆润椭圆龟背侧礁轮廓（消除直角翼感）：内侧厚实深嵌 islandCore，外侧圆弧缓坡入海
      const eNorm = (ax * ax) / (15.8 * 15.8) + ((Y + 3.2) * (Y + 3.2)) / (14.2 * 14.2);
      if (eNorm > 1.0) return;
      const outRatio = clamp((Y + 11.0) / 22.0, 0, 1);
      const arch = Math.sqrt(Math.max(0, 1.0 - eNorm));
      const roofZ = lerp(14.6, 4.2, Math.pow(outRatio, 1.08)) * (0.30 + 0.70 * arch) + Math.cos(ax * 0.36) * 0.7;
      if (z > roofZ) return;

      // 表皮分层：内侧顶面铺暖沙与湿苔，外侧岩甲带深海硬鳞与稀疏藤壶斑
      if (Y < -2.0 && z > roofZ - 1.8 && ax < 10.5) {
        m.setRaw(x, y, z, mat('sand'), partId.sand);
      } else if (Y >= -2.0 && Y <= 4.5 && z > roofZ - 1.6 && ((Math.round(ax + Y) & 3) === 0)) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (Y > 2.0 && z <= 6.0 && ((Math.round(ax * 2.1 + Y * 2.7) % 11) === 0)) {
        m.setRaw(x, y, z, mat('barnacle'), partId.barnacle);
      } else if (z <= 4.2 || Y > 6.5) {
        m.setRaw(x, y, z, mat('slate'), partId.slate);
      } else {
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      }
    });

    // 外侧两道对称岩鳍肋脊（强化巨兽甲壳感）
    for (const sx of [-7.5, 0, 7.5]) {
      m.paintCapsule(sx, -5.0, 10.2, sx * 0.85, 6.2, 4.4, 2.2, 1.3, mat('slate'), partId.slate, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 13.5, headZ: 15, centerZ: 7 });
  }

  // =========================================================================
  // 3. 巨型半潜上颌 jawUpper（3 档无损烘焙：closed / mid / open，28×28×16）
  //    枢轴锁在后根部 (0, -9.5)，严格 X 对称；含厚重岩吻、深红上腭、锯齿利牙与双眼
  // =========================================================================
  const JAW_UPPER_PIVOT = { x: 0, y: -9.5 };
  function buildJawUpper(makeCanvas, openLevel) {
    // openLevel: 0=闭合伏水, 1=半张, 2=大角度昂首全张
    const pitch = openLevel === 2 ? -0.44 : (openLevel === 1 ? -0.22 : 0.0);
    const W = 28, D = 28, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const pivY = -9.0, pivZ = 5.2;

    const toLocal = (X, Y, z) => pitch ? pitchPt([X, Y, z], -pitch, pivY, pivZ) : [X, Y, z];
    const fromLocal = (lx, ly, lz) => pitch ? pitchPt([lx, ly, lz], pitch, pivY, pivZ) : [lx, ly, lz];

    m.fillAABB(-13.0, 13.0, -13.0, 13.0, 0, H - 1, (x, y, z, X, Y) => {
      const [lx, ly, lz] = toLocal(X, Y, z);
      const ax = Math.abs(lx);
      // 宽吻弧形上颌壳（后宽前略收，底部平直以便贴合下颌或张开露齿）
      const dSnout = Math.hypot(ax / 11.4, (ly - 0.8) / 12.2, (lz - 6.4) / 4.8);
      const dRoot  = Math.hypot(ax / 12.2, (ly + 7.2) / 6.2,  (lz - 6.8) / 5.4);
      const d = smin(dSnout - 1.0, dRoot - 1.0, 0.22);
      if (d > 0) return;
      if (lz < 3.6) return; // 平切上腭底面

      // 上腭内腔深红（张口时从 45° 清晰可见深红口腔穹顶）
      const isPalate = lz <= 5.2 && ax < 8.4 && ly > -5.5 && ly < 10.2;
      const isMossCap = lz >= 9.6 && ax < 7.2 && ly < 2.5;
      const isSandRidge = lz >= 8.8 && ax < 5.2 && ly < -2.0;

      if (isPalate) {
        m.setRaw(x, y, z, mat('maw'), partId.maw);
      } else if (isSandRidge) {
        m.setRaw(x, y, z, mat('sand'), partId.sand);
      } else if (isMossCap) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (lz >= 8.2) {
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      } else {
        m.setRaw(x, y, z, mat('slate'), partId.slate);
      }
    });

    // 上颌沿唇缘密排锯齿利牙（向下垂出，张口态极为醒目）
    const toothCount = 5;
    for (let i = 0; i < toothCount; i++) {
      const ang = lerp(-1.12, 1.12, i / (toothCount - 1));
      const tx = Math.sin(ang) * 9.2;
      const ty = 1.6 + Math.cos(ang) * 9.8;
      const pTop = fromLocal(tx, ty, 4.4);
      const pTip = fromLocal(tx * 1.02, ty + 0.4, openLevel > 0 ? 1.5 : 2.3);
      m.paintCapsule(pTop[0], pTop[1], pTop[2], pTip[0], pTip[1], pTip[2], 0.92, 0.46, mat('tooth'), partId.tooth, true);
    }

    // 上颌眉骨岩棱（强化凶悍巨兽轮廓）
    for (const s of [-1, 1]) {
      const b0 = fromLocal(s * 7.8, -5.5, 9.5);
      const b1 = fromLocal(s * 6.4,  2.5, 9.2);
      m.paintCapsule(b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], 1.75, 1.25, mat('rock'), partId.rock, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 巨兽双眼（精确落在上颌外侧眉下表面，eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const pEye = fromLocal(0, -1.8, 7.6);
    const eyeY = clamp(Math.round(hd + pEye[1]), 2, D - 3);
    const eyeZ = clamp(Math.round(pEye[2]), 2, H - 3);
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 6; step++) {
        const tx = Math.round(hw + s * (11.5 - step));
        const p = m.getPartId(tx, eyeY, eyeZ);
        if (p === partId.rock || p === partId.slate) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 9.4);
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dy === 1)
            ? keyToId.eyeGlint
            : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 11.8, headZ: 15, centerZ: 7 });
  }

  // =========================================================================
  // 4. 巨型半潜下颌 jawLower（3 档无损烘焙：closed / mid / open，28×30×14）
  //    枢轴锁在后根部 (0, -10.5)，严格 X 对称；含深红咽喉盆与一圈向上锯齿利牙
  // =========================================================================
  const JAW_LOWER_PIVOT = { x: 0, y: -10.5 };
  function buildJawLower(makeCanvas, openLevel) {
    const pitch = openLevel === 2 ? 0.24 : (openLevel === 1 ? 0.12 : 0.0);
    const W = 28, D = 30, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const pivY = -10.0, pivZ = 5.4;

    const toLocal = (X, Y, z) => pitch ? pitchPt([X, Y, z], -pitch, pivY, pivZ) : [X, Y, z];
    const fromLocal = (lx, ly, lz) => pitch ? pitchPt([lx, ly, lz], pitch, pivY, pivZ) : [lx, ly, lz];

    m.fillAABB(-13.0, 13.0, -14.0, 14.0, 0, H - 1, (x, y, z, X, Y) => {
      const [lx, ly, lz] = toLocal(X, Y, z);
      const ax = Math.abs(lx);
      // 宽厚 U 形下颌盆体
      const dOuter = Math.hypot(ax / 11.5, (ly - 0.4) / 13.0, (lz - 4.4) / 4.4);
      if (dOuter > 1.0) return;

      // 挖出深红咽喉盆腔（仅张口或半张时盆腔深凹，闭合时保持实体）
      const basinDist = Math.hypot(ax / 8.4, (ly - 0.8) / 9.2);
      if (basinDist < 1.0 && lz > 4.6) return;

      const isThroat = basinDist < 1.04 && lz >= 2.2;
      if (isThroat) {
        m.setRaw(x, y, z, mat('maw'), partId.maw);
      } else if (lz <= 2.8) {
        m.setRaw(x, y, z, mat('slate'), partId.slate);
      } else {
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      }
    });

    // 深红肉舌/咽喉隆起（张口时从俯视清晰可见鲜明深红咽喉！）
    const tg0 = fromLocal(0, -6.5, 4.4);
    const tg1 = fromLocal(0,  4.8, 3.8);
    m.paintCapsule(tg0[0], tg0[1], tg0[2], tg1[0], tg1[1], tg1[2], 5.6, 3.4, mat('maw'), partId.maw, true);

    // 下颌一圈向上竖起的锯齿利牙（与上颌利牙错位咬合）
    const toothCount = 6;
    for (let i = 0; i < toothCount; i++) {
      const ang = lerp(-1.20, 1.20, i / (toothCount - 1));
      const tx = Math.sin(ang) * 9.4;
      const ty = 1.4 + Math.cos(ang) * 10.6;
      const pBase = fromLocal(tx, ty, 5.2);
      const pTip  = fromLocal(tx * 0.96, ty + 0.3, openLevel > 0 ? 8.3 : 7.0);
      m.paintCapsule(pBase[0], pBase[1], pBase[2], pTip[0], pTip[1], pTip[2], 0.90, 0.45, mat('tooth'), partId.tooth, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 12.2, headZ: 12, centerZ: 5 });
  }

  // =========================================================================
  // 5. 后方半潜脊鳍尾峰 tailRidge（24×30×15，严格 X 对称）
  //    枢轴锁在前根部 (0, +10.5)，深嵌 islandCore 后缘 6.5 格，后端竖起锯齿岩鳍峰
  // =========================================================================
  const TAIL_PIVOT = { x: 0, y: 10.5 };
  function buildTailRidge(makeCanvas) {
    const W = 24, D = 30, H = 15;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-11.0, 11.0, -14.0, 14.0, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      // 由前向后收束的流线厚重尾背
      const u = clamp((14.0 - Y) / 28.0, 0, 1); // 0=前端接岛身, 1=尾尖
      const halfW = lerp(10.2, 2.2, Math.pow(u, 0.92));
      const maxH  = lerp(9.4, 3.2, Math.pow(u, 0.85));
      if (ax > halfW) return;
      const arch = Math.sqrt(Math.max(0, 1.0 - Math.pow(ax / Math.max(1, halfW), 2.0)));
      if (z > maxH * (0.25 + 0.75 * arch)) return;

      if (z <= 3.5) {
        m.setRaw(x, y, z, mat('slate'), partId.slate);
      } else if (u < 0.38 && z > 6.5 && ax < 4.8) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (u > 0.25 && ((Math.round(ax * 2 + Y) % 8) === 0)) {
        m.setRaw(x, y, z, mat('barnacle'), partId.barnacle);
      } else {
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      }
    });

    // 尾背三道依次渐收的半潜脊鳍尾峰（若隐若现破出洋面）
    m.paintFinTri([0,  6.5, 7.5], [0, -1.5, 6.2], [0, -3.5, 13.8], 1.35, mat('slate'), partId.slate, true);
    m.paintFinTri([0, -2.5, 5.8], [0, -9.5, 4.4], [0, -11.2, 11.2], 1.15, mat('slate'), partId.slate, true);
    // 尾端水平宽鳍缘
    m.paintFinTri([0, -8.5, 3.0], [-7.2, -13.2, 2.2], [0, -13.6, 2.4], 0.95, mat('slate'), partId.slate, true);
    m.paintFinTri([0, -8.5, 3.0], [ 7.2, -13.2, 2.2], [0, -13.6, 2.4], 0.95, mat('slate'), partId.slate, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.8, headZ: 14, centerZ: 6 });
  }

  // =========================================================================
  // 6. 背脊伴生立体白羽海鸟（4 档无损烘焙：stand / peck / flyUp / flyDown，12×12×10）
  //    全部严格 X 对称 -> sym=true
  // =========================================================================
  function buildSeabird(makeCanvas, pose) {
    const isFly = pose === 'flyUp' || pose === 'flyDown';
    const isPeck = pose === 'peck';
    const W = 12, D = 12, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 圆润白羽鸟身
    m.paintEllipsoid(0, -0.4, isFly ? 4.4 : 4.0, 2.1, 3.1, 1.85, mat('bird'), partId.bird, true);
    // 短尾羽
    m.paintCapsule(0, -2.6, isFly ? 4.4 : 4.2, 0, -4.8, isFly ? 4.8 : 4.9, 1.1, 0.55, mat('wing'), partId.wing, true);

    // 鸟首与橘黄尖喙（peck 态低头理羽）
    const headY = isPeck ? 2.4 : 2.1;
    const headZ = isPeck ? 4.5 : (isFly ? 5.2 : 6.2);
    m.paintEllipsoid(0, headY, headZ, 1.45, 1.55, 1.4, mat('bird'), partId.bird, true);
    m.paintCapsule(0, headY + 1.0, headZ - 0.1, 0, headY + 3.1, isPeck ? headZ - 1.1 : headZ - 0.3, 0.58, 0.32, mat('beak'), partId.beak, true);

    if (isFly) {
      // 展翼振翅（flyUp 上扬 / flyDown 下压）
      const tipZ = pose === 'flyUp' ? 8.2 : 1.8;
      for (const s of [-1, 1]) {
        m.paintFinTri(
          [s * 1.4,  1.2, 4.6],
          [s * 1.4, -1.6, 4.4],
          [s * 5.4, -0.4, tipZ],
          0.62, mat('bird'), partId.bird, true
        );
        m.paintCapsule(s * 3.6, -0.2, lerp(4.6, tipZ, 0.58), s * 5.5, -0.6, tipZ, 0.65, 0.42, mat('wing'), partId.wing, true);
      }
    } else {
      // 收拢在体侧的灰蓝翼片 + 一对细橘爪站立
      for (const s of [-1, 1]) {
        m.paintEllipsoid(s * 1.85, -0.8, 4.2, 0.72, 2.45, 1.2, mat('wing'), partId.wing, true);
        m.paintCapsule(s * 0.85, -0.2, 2.5, s * 0.95, 0.2, 0.8, 0.42, 0.38, mat('beak'), partId.beak, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);

    // 清晰黑眼点
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const ey = clamp(Math.round(hd + headY + 0.5), 1, D - 2);
    const ez = clamp(Math.round(headZ + 0.3), 1, H - 2);
    m.setRaw(Math.round(hw - 1.2), ey, ez, keyToId.eyeDark, partId.eye);
    m.setRaw(Math.round(hw + 1.2), ey, ez, keyToId.eyeDark, partId.eye);

    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 9, centerZ: 4 });
  }

  // =========================================================================
  // 7. 伴生立体小银鱼（3 档摆尾：L / M / R，9×13×7）
  // =========================================================================
  function buildSilverFish(makeCanvas, tailSwing) {
    const W = 9, D = 13, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const sw = tailSwing === 'L' ? -1.8 : (tailSwing === 'R' ? 1.8 : 0.0);

    m.fillAABB(-2.2, 2.2, -2.8, 4.6, 1, 5, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 1.55, (Y - 0.8) / 3.6, (z - 3.2) / 1.85);
      if (d > 1.0) return;
      const isBack = z >= 3.8;
      m.setRaw(x, y, z, isBack ? mat('fishBack') : mat('fishSide'), isBack ? partId.fishBack : partId.fishSide);
    });
    m.paintFinTri([0, 1.4, 4.5], [0, -0.8, 4.4], [0, -1.2, 5.8], 0.52, mat('fishBack'), partId.fishBack, false);
    m.paintFinTri([0, -2.2, 3.2], [sw, -5.4, 5.2], [sw, -5.4, 1.2], 0.62, mat('fishSide'), partId.fishSide, true);

    m.despeckle();
    m.applyArtShading(true);

    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    m.setRaw(Math.round(hw - 1.3), Math.round(hd + 3.0), 3, keyToId.eyeDark, partId.fishEye);
    m.setRaw(Math.round(hw + 1.3), Math.round(hd + 3.0), 3, keyToId.eyeDark, partId.fishEye);

    return m.toStripAsset(makeCanvas, { footRadius: 2.6, headZ: 6, centerZ: 3 });
  }

  // 估算浮岛顶面高度（让 2 只白羽海鸟稳稳踩在草背上踱步，零悬空零穿模）
  function evalIslandTopZ(lx, ly) {
    const r2 = (lx * lx) / (15.5 * 15.5) + (ly * ly) / (16.5 * 16.5);
    if (r2 >= 0.92) return 11.0;
    return 1.5 + 16.0 * Math.sqrt(Math.max(0.05, 1.0 - r2));
  }

  // =========================================================================
  // 生物定义：海3 · 浮岛巨兽
  // =========================================================================
  const Sea3Def = {
    id: 'sea3_hafgufa',
    code: '海3',
    status: 'done',
    name: '海3 · 浮岛巨兽',
    tag: 'M16 超巨型拆块 Boss · 巨口吐食糜引鱼惊鸟',
    summary: 'v3 精制：6 大 ≤38 格高重叠咬合拆块拼出 78 格浮岛巨兽（左右侧甲共享对称烘焙省缓存），背上常驻 2 只立体白羽海鸟踱步理羽，周期上浮张口吐暖色食糜吸引 5 条立体小银鱼聚食，猛然合口溅浪惊鸟盘旋',
    defaultHabitat: 'openSea',
    footRadius: 26.0,
    ecoWeight: 3.0,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '6 大 ≤38 格无缝拆块（全对称省一半图集）',
      '二阶弹簧非对称巨口张合（锯齿利牙+深红咽喉）',
      '半潜浮力起伏与水色染浸（submerge）',
      '背脊 2 只立体白羽海鸟踱步理羽与受惊盘旋',
      '5 条立体小银鱼 Boids 趋食与受惊四散闭环'
    ],
    soulHabit: '平时如荒礁浮岛半潜远洋缓慢呼吸，2 只白羽海鸟在草背上踱步理羽 -> 缓缓上浮破出白沫张开巨口吐出暖色食糜，吸引 5 条小银鱼从四周游聚口前盘旋啄食 -> 巨口砰然合拢爆出大片浪花与扩散涟漪，小鱼四散逃离、海鸟受惊振翅绕岛盘旋一圈后轻盈落回巨背',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const flankShared = buildFlankPlate(makeCanvas);
      const parts = {
        islandCore:    buildIslandCore(makeCanvas),
        flankL:        flankShared,
        flankR:        flankShared,
        jawUpperClose: buildJawUpper(makeCanvas, 0),
        jawUpperMid:   buildJawUpper(makeCanvas, 1),
        jawUpperOpen:  buildJawUpper(makeCanvas, 2),
        jawLowerClose: buildJawLower(makeCanvas, 0),
        jawLowerMid:   buildJawLower(makeCanvas, 1),
        jawLowerOpen:  buildJawLower(makeCanvas, 2),
        tailRidge:     buildTailRidge(makeCanvas),
        birdStand:     buildSeabird(makeCanvas, 'stand'),
        birdPeck:      buildSeabird(makeCanvas, 'peck'),
        birdFlyUp:     buildSeabird(makeCanvas, 'flyUp'),
        birdFlyDown:   buildSeabird(makeCanvas, 'flyDown'),
        fishL:         buildSilverFish(makeCanvas, 'L'),
        fishM:         buildSilverFish(makeCanvas, 'M'),
        fishR:         buildSilverFish(makeCanvas, 'R')
      };

      // 去重后的唯一资产列表（flankL/flankR 共享同一对象，避免重复 recolor）
      const uniqueAssets = Array.from(new Set(Object.values(parts)));
      // 本体岩岛换色列表（海鸟与银鱼保持高辨识天然羽色/银蓝鱼色）
      const hullRecolorAssets = Array.from(new Set([
        parts.islandCore, parts.flankL,
        parts.jawUpperClose, parts.jawUpperMid, parts.jawUpperOpen,
        parts.jawLowerClose, parts.jawLowerMid, parts.jawLowerOpen,
        parts.tailRidge
      ]));

      const jawSpring = new SpringDamper1D(0, 26, 7.2);
      const bobSpring = new SpringDamper1D(0, 32, 7.8);
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.35;

      // 2 只背脊白羽海鸟状态（支持草背踱步理羽 <-> 惊起绕岛盘旋 <-> 轻盈落回）
      const birds = [
        {
          id: 0, mode: 'perch',
          lx: -4.2, ly: 3.4, targetLx: -3.5, targetLy: 5.2,
          yaw: 0.4, peckTimer: 0.8, walkCd: 1.4,
          wx: hx0 - 4.2, wy: hy0 + 3.4, wz: 18.0,
          flyAng: 0.3, flyRad: 26.0, flyZ: 32.0, flyT: 0, flyDur: 4.4,
          flapPhase: 0.0
        },
        {
          id: 1, mode: 'perch',
          lx: 5.0, ly: -2.8, targetLx: 3.2, targetLy: -4.5,
          yaw: -1.1, peckTimer: 0.0, walkCd: 2.1,
          wx: hx0 + 5.0, wy: hy0 - 2.8, wz: 17.6,
          flyAng: 3.4, flyRad: 31.0, flyZ: 36.0, flyT: 0, flyDur: 4.8,
          flapPhase: 1.9
        }
      ];

      // 5 条海面小银鱼（简化 Boids 集群力场 + 趋食聚口 / 合口四散逃逸）
      const fishes = Array.from({ length: 5 }, (_, i) => {
        const ang = (i / 5) * TAU + 0.45;
        const rad = 42.0 + (i % 2) * 5.5;
        return {
          idx: i,
          x: hx0 + Math.cos(ang) * rad,
          y: hy0 + Math.sin(ang) * rad,
          z: 3.0,
          vx: -Math.sin(ang) * 10.0,
          vy:  Math.cos(ang) * 10.0,
          yaw: ang + Math.PI * 0.5,
          phase: i * 1.25,
          orbitAng: ang,
          fleeTimer: 0
        };
      });

      const state = {
        x: hx0,
        y: hy0,
        z: 0.0,
        vx: 0, vy: 0,
        yaw: hyaw0,
        patrolAng: 0.2,
        // 巨口捕食闭环 4 阶段：
        //   'rest' (浮岛静伏 4.2s) -> 'open_chum' (浮起张口吐食糜引鱼 5.6s) ->
        //   'snap' (猛然合口溅浪惊鸟 0.75s) -> 'settle' (海鸟绕岛盘旋落回 4.8s)
        cyclePhase: 'rest',
        phaseTimer: 0,
        jawOpen: 0,       // [0..1] 弹簧驱动连续张口度
        buoyOffset: 0,    // 上浮偏移量
        tailSway: 0,
        chumCd: 0,
        foamCd: 0,
        seed: opts.seed ?? 41
      };

      function triggerBirdStartle(sMul) {
        for (let i = 0; i < birds.length; i++) {
          const b = birds[i];
          b.mode = 'circle';
          b.flyT = 0;
          b.flyDur = 4.2 + i * 0.45;
          b.flyAng = Math.atan2(b.wy - state.y, b.wx - state.x);
          b.flyRad = (29.0 + i * 6.0) * sMul;
          b.flyZ = (32.0 + i * 4.5) * sMul;
        }
      }

      function emitChumParticles(vfx, mx, my, mz, yaw, sMul, fxCol) {
        if (!vfx) return;
        const fwdX = -Math.sin(yaw), fwdY = Math.cos(yaw);
        const rightX = Math.cos(yaw), rightY = Math.sin(yaw);
        for (let i = 0; i < 3; i++) {
          const spread = (Math.random() - 0.5) * 10.5 * sMul;
          const push = (5.0 + Math.random() * 11.0) * sMul;
          vfx.spawnParticle(
            mx + rightX * spread * 0.45,
            my + rightY * spread * 0.45,
            mz + (Math.random() - 0.5) * 2.5 * sMul,
            fwdX * push + rightX * spread * 0.7,
            fwdY * push + rightY * spread * 0.7,
            (2.5 + Math.random() * 4.0) * sMul,
            0.95 + Math.random() * 0.45,
            1.45 + Math.random() * 0.75,
            i % 2 === 0 ? fxCol.chumA : fxCol.chumB,
            false,
            7.5
          );
        }
      }

      function emitSnapSplash(vfx, habitat, mx, my, yaw, sMul, fxCol) {
        if (!vfx) return;
        // 巨口猛然合拢：爆出大片海面浪花与多层扩散大涟漪
        vfx.addRipple(mx, my, 8.0 * sMul, 46.0 * sMul, 1.15, 2.8);
        vfx.addRipple(mx, my, 5.0 * sMul, 32.0 * sMul, 0.85, 2.0);
        vfx.addRipple(state.x, state.y, 20.0 * sMul, 52.0 * sMul, 1.25, 2.2);
        for (let i = 0; i < 24; i++) {
          const a = (i / 24) * TAU + Math.random() * 0.25;
          const sp = (12.0 + Math.random() * 22.0) * sMul;
          vfx.spawnParticle(
            mx + Math.cos(a) * 6.5 * sMul,
            my + Math.sin(a) * 6.5 * sMul,
            3.0 * sMul,
            Math.cos(a) * sp,
            Math.sin(a) * sp,
            (11.0 + Math.random() * 16.0) * sMul,
            0.55 + Math.random() * 0.32,
            1.8 + Math.random() * 1.0,
            i % 3 === 0 ? fxCol.splash : fxCol.foam,
            false,
            38
          );
        }
        if (habitat && habitat.isWater) {
          vfx.spawnSplash(mx, my, 12, 1.35 * sMul, habitat.fx);
        }
      }

      const instance = {
        def: Sea3Def,
        cachePrefix: `sea3_hafgufa_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: uniqueAssets,
        state,
        sockets,
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
          state.z = 0.0;
          state.vx = 0; state.vy = 0;
          state.yaw = homeYaw ?? 0.35;
          state.patrolAng = 0.2;
          state.cyclePhase = 'rest';
          state.phaseTimer = 0;
          state.jawOpen = 0;
          state.buoyOffset = 0;
          state.tailSway = 0;
          state.chumCd = 0;
          state.foamCd = 0;

          jawSpring.x = jawSpring.v = 0;
          bobSpring.x = bobSpring.v = 0;

          const presets = [
            { lx: -4.2, ly:  3.4, yaw:  0.4 },
            { lx:  5.0, ly: -2.8, yaw: -1.1 }
          ];
          for (let i = 0; i < birds.length; i++) {
            const b = birds[i];
            b.mode = 'perch';
            b.lx = b.targetLx = presets[i].lx;
            b.ly = b.targetLy = presets[i].ly;
            b.yaw = presets[i].yaw;
            b.peckTimer = i === 0 ? 0.8 : 0;
            b.walkCd = 1.2 + i * 0.8;
            const [bx, by] = localToWorldXY(homeX, homeY, state.yaw, b.lx, b.ly);
            b.wx = bx; b.wy = by; b.wz = evalIslandTopZ(b.lx, b.ly);
          }

          for (let i = 0; i < fishes.length; i++) {
            const f = fishes[i];
            const ang = (i / fishes.length) * TAU + 0.45;
            const rad = 42.0 + (i % 2) * 5.5;
            f.x = homeX + Math.cos(ang) * rad;
            f.y = homeY + Math.sin(ang) * rad;
            f.z = 3.0;
            f.vx = -Math.sin(ang) * 10.0;
            f.vy =  Math.cos(ang) * 10.0;
            f.yaw = ang + Math.PI * 0.5;
            f.fleeTimer = 0;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul   = instance.scaleMul;
          const gFreq  = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex   = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp     = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const isIdle = !!(eco && (eco.action === 'idle' || eco.patrol === false));
          const isWater = !!(habitat && habitat.isWater);
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const homeYaw = (eco && eco.homeYaw) ?? 0.35;
          const maxR = (eco && eco.maxRadius) || 48;
          const fxCol = curSkin.fx || SKINS[0].fx;

          // -----------------------------------------------------------------
          // 1. 巨兽本体缓慢远洋浮游（巡游缓弧移位 / 待机原地呼吸微浮）
          // -----------------------------------------------------------------
          const prevX = state.x, prevY = state.y;
          if (!isIdle) {
            // 超巨型浮岛巡游：在洋面以小半径、极沉稳速度缓缓漂航转向，绝不冲出地台边缘
            state.patrolAng += dt * 0.14 * spdMul;
            const orbitR = Math.min(14.5, Math.max(8.0, maxR - 30.0 * sMul));
            const tx = homeX + Math.cos(state.patrolAng) * orbitR;
            const ty = homeY + Math.sin(state.patrolAng) * orbitR * 0.82;
            const kPos = expSmooth(dt, 1.8);
            state.x = lerp(state.x, tx, kPos);
            state.y = lerp(state.y, ty, kPos);
            const dvx = -Math.sin(state.patrolAng);
            const dvy =  Math.cos(state.patrolAng) * 0.82;
            const desiredYaw = Math.atan2(-dvx, dvy);
            state.yaw = wrapAngle(state.yaw + wrapAngle(desiredYaw - state.yaw) * expSmooth(dt, 1.35));
          } else {
            // 待机态：稳守中心微幅随波晃动
            const tx = homeX + Math.sin(time * 0.42) * 1.2 * sMul;
            const ty = homeY + Math.cos(time * 0.36) * 1.0 * sMul;
            state.x = lerp(state.x, tx, expSmooth(dt, 2.6));
            state.y = lerp(state.y, ty, expSmooth(dt, 2.6));
            const idleYaw = homeYaw + Math.sin(time * 0.28) * 0.14;
            state.yaw = wrapAngle(state.yaw + wrapAngle(idleYaw - state.yaw) * expSmooth(dt, 2.0));
          }
          state.vx = (state.x - prevX) / Math.max(dt, 0.001);
          state.vy = (state.y - prevY) / Math.max(dt, 0.001);

          // -----------------------------------------------------------------
          // 2. 巨口捕食闭环状态机（待机与巡游均自动完整循环）
          //    rest (静伏呼吸) -> open_chum (上浮破沫张口吐食糜引鱼) ->
          //    snap (砰然合口溅浪惊鸟散鱼) -> settle (海鸟绕岛盘旋落回)
          // -----------------------------------------------------------------
          const cycleRate = clamp(0.75 + gFreq * 0.25, 0.5, 1.8);
          state.phaseTimer += dt * cycleRate;

          const REST_DUR   = 4.0;
          const OPEN_DUR   = 5.6;
          const SNAP_DUR   = 0.75;
          const SETTLE_DUR = 4.9;

          const [mawFrontX, mawFrontY] = localToWorldXY(state.x, state.y, state.yaw, 0, 31.0 * sMul);
          const [mawMouthX, mawMouthY] = localToWorldXY(state.x, state.y, state.yaw, 0, 24.0 * sMul);

          if (state.cyclePhase === 'rest') {
            if (state.phaseTimer >= REST_DUR) {
              state.cyclePhase = 'open_chum';
              state.phaseTimer = 0;
              // 上浮破水瞬间释放一圈白沫涟漪
              if (vfx && isWater) {
                vfx.addRipple(state.x, state.y, 18.0 * sMul, 42.0 * sMul, 1.05, 2.2);
                vfx.spawnSplash(mawFrontX, mawFrontY, 8, 0.95 * sMul, habitat.fx);
              }
            }
          } else if (state.cyclePhase === 'open_chum') {
            // 上浮张口期：持续向外吐出暖色食糜微粒，并在巨兽周身翻起破水白沫
            state.chumCd -= dt;
            if (state.chumCd <= 0 && state.jawOpen > 0.35) {
              state.chumCd = 0.16;
              emitChumParticles(vfx, mawMouthX, mawMouthY, (state.z + 5.8) * sMul, state.yaw, sMul, fxCol);
            }
            state.foamCd -= dt;
            if (state.foamCd <= 0 && vfx && isWater) {
              state.foamCd = 0.42;
              vfx.addRipple(mawFrontX, mawFrontY, 6.0 * sMul, 24.0 * sMul, 0.85, 1.5);
            }
            if (state.phaseTimer >= OPEN_DUR) {
              // 猛然合口！
              state.cyclePhase = 'snap';
              state.phaseTimer = 0;
              jawSpring.impulse(-14.0 * sp);
              bobSpring.impulse(-10.5 * sp);
              emitSnapSplash(vfx, habitat, mawFrontX, mawFrontY, state.yaw, sMul, fxCol);
              triggerBirdStartle(sMul);
              for (const f of fishes) f.fleeTimer = 2.6;
            }
          } else if (state.cyclePhase === 'snap') {
            if (state.phaseTimer >= SNAP_DUR) {
              state.cyclePhase = 'settle';
              state.phaseTimer = 0;
            }
          } else if (state.cyclePhase === 'settle') {
            if (state.phaseTimer >= SETTLE_DUR) {
              state.cyclePhase = 'rest';
              state.phaseTimer = 0;
            }
          }

          // 非对称二阶弹簧：张口舒缓优雅（低刚度），合口干脆猛烈（高刚度）
          const jawTarget = state.cyclePhase === 'open_chum' ? 1.0 : 0.0;
          const jawK = state.cyclePhase === 'snap' ? (190 * sp) : (26 * sp);
          const jawD = state.cyclePhase === 'snap' ? clamp(12.5 * dScale, 6.5, 18.0) : clamp(7.2 * dScale, 3.8, 12.0);
          state.jawOpen = clamp(jawSpring.update(dt, jawTarget, jawK, jawD), 0, 1.08);

          // 浮力呼吸起伏：静伏半潜较低，张口期缓缓上浮 2.6 格破出大片白沫，合口期震沉再回稳
          const breathWave = Math.sin(time * 1.15 * gFreq) * 0.72;
          const buoyTarget = (state.cyclePhase === 'open_chum' ? 2.5 : (state.cyclePhase === 'snap' ? -1.1 : 0.0)) + breathWave;
          state.buoyOffset = bobSpring.update(dt, buoyTarget, 34 * sp, clamp(7.6 * dScale, 4.0, 12.5));
          state.z = Math.max(-1.6 * sMul, (0.8 + state.buoyOffset) * sMul);

          // 尾脊微摆（巡游时幅度略增）
          const swayAmp = (isIdle ? 0.08 : 0.16) * flex;
          state.tailSway = Math.sin(time * 1.45 * gFreq) * swayAmp;

          // 巡游缓慢水尾迹
          if (vfx && isWater && !isIdle && Math.hypot(state.vx, state.vy) > 1.2) {
            state.foamCd -= dt;
            if (state.foamCd <= 0) {
              state.foamCd = 0.55;
              const [twx, twy] = localToWorldXY(state.x, state.y, state.yaw, 0, -28.0 * sMul);
              EnvFeedback.emitWaterWake(vfx, habitat, twx, twy, state.yaw, 18.0 * sMul, 0.55);
            }
          }

          // -----------------------------------------------------------------
          // 3. 背脊 2 只白羽海鸟状态机（草背踱步理羽 <-> 惊起绕岛盘旋 <-> 轻盈落回）
          // -----------------------------------------------------------------
          for (let i = 0; i < birds.length; i++) {
            const b = birds[i];
            b.flapPhase += dt * (11.5 * gFreq);
            if (b.mode === 'perch') {
              if (b.peckTimer > 0) {
                b.peckTimer -= dt;
              } else {
                const dlx = b.targetLx - b.lx, dly = b.targetLy - b.ly;
                const d = Math.hypot(dlx, dly);
                if (d > 0.35) {
                  const walkSpd = 2.6 * dt;
                  b.lx += (dlx / d) * Math.min(d, walkSpd);
                  b.ly += (dly / d) * Math.min(d, walkSpd);
                  const locYaw = Math.atan2(-dlx, dly);
                  b.yaw = wrapAngle(b.yaw + wrapAngle(locYaw - b.yaw) * expSmooth(dt, 8.0));
                } else {
                  b.walkCd -= dt;
                  if (b.walkCd <= 0) {
                    // 停步理羽或挑选草背新落脚点（限定在中央草丘安全半径内，避开中央岩脊）
                    if (((Math.floor(time * 3 + i * 7)) % 3) === 0) {
                      b.peckTimer = 1.15;
                      b.walkCd = 1.6;
                    } else {
                      const ang = (time * 1.7 + i * 2.9) % TAU;
                      const rad = 3.2 + ((i + 1) * 2.4) % 4.5;
                      b.targetLx = clamp(Math.cos(ang) * rad, -7.8, 7.8);
                      b.targetLy = clamp(Math.sin(ang) * rad + 0.8, -6.2, 8.5);
                      b.walkCd = 1.8 + i * 0.5;
                    }
                  }
                }
              }
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, b.lx * sMul, b.ly * sMul);
              b.wx = wx;
              b.wy = wy;
              b.wz = Math.max(1.0, state.z + evalIslandTopZ(b.lx, b.ly) * sMul);
            } else if (b.mode === 'circle') {
              b.flyT += dt / b.flyDur;
              if (b.flyT >= 1.0) {
                b.mode = 'perch';
                b.peckTimer = 0.6;
                b.walkCd = 1.5;
              } else {
                const u = b.flyT;
                const dir = i === 0 ? 1 : -1;
                b.flyAng = wrapAngle(b.flyAng + dt * dir * 1.65);
                const [homeBX, homeBY] = localToWorldXY(state.x, state.y, state.yaw, b.lx * sMul, b.ly * sMul);
                const homeBZ = Math.max(1.0, state.z + evalIslandTopZ(b.lx, b.ly) * sMul);

                // 起飞加速拉高 -> 绕浮岛高空盘旋一整圈 -> 平滑降落回草背
                const env = Math.sin(u * Math.PI);
                const radNow = b.flyRad * Math.pow(env, 0.62);
                const cx = state.x + Math.cos(b.flyAng) * radNow;
                const cy = state.y + Math.sin(b.flyAng) * radNow;
                const targetX = lerp(homeBX, cx, smoothstep(0.0, 0.18, u) * smoothstep(1.0, 0.80, u));
                const targetY = lerp(homeBY, cy, smoothstep(0.0, 0.18, u) * smoothstep(1.0, 0.80, u));
                const targetZ = lerp(homeBZ, b.flyZ + Math.sin(u * TAU * 2) * 2.5 * sMul, Math.pow(env, 0.55));

                const pbx = b.wx, pby = b.wy;
                b.wx = lerp(b.wx, targetX, expSmooth(dt, 7.5));
                b.wy = lerp(b.wy, targetY, expSmooth(dt, 7.5));
                b.wz = lerp(b.wz, targetZ, expSmooth(dt, 7.5));
                const fdx = b.wx - pbx, fdy = b.wy - pby;
                if (Math.hypot(fdx, fdy) > 0.05) {
                  const flyYaw = Math.atan2(-fdx, fdy);
                  b.yaw = wrapAngle(b.yaw + wrapAngle(flyYaw - b.yaw) * expSmooth(dt, 10.0));
                }
              }
            }
          }

          // -----------------------------------------------------------------
          // 4. 5 条立体小银鱼简化 Boids（分离/对齐/凝聚 + 趋食聚口 / 合口四散逃逸）
          // -----------------------------------------------------------------
          const attractMode = state.cyclePhase === 'open_chum' && state.jawOpen > 0.25;
          const [feedCenterX, feedCenterY] = localToWorldXY(state.x, state.y, state.yaw, 0, 41.5 * sMul);
          const fishLimitR = Math.max(60, maxR + 14);

          for (let i = 0; i < fishes.length; i++) {
            const f = fishes[i];
            if (f.fleeTimer > 0) f.fleeTimer = Math.max(0, f.fleeTimer - dt);

            // Boids 三规则（分离、对齐、凝聚）
            let sepX = 0, sepY = 0, aliX = 0, aliY = 0, cohX = 0, cohY = 0, nb = 0;
            for (let j = 0; j < fishes.length; j++) {
              if (i === j) continue;
              const o = fishes[j];
              const dx = f.x - o.x, dy = f.y - o.y;
              const d = Math.hypot(dx, dy) || 0.001;
              if (d < 9.0 * sMul) {
                sepX += (dx / d) * ((9.0 * sMul - d) / (9.0 * sMul)) * 30.0;
                sepY += (dy / d) * ((9.0 * sMul - d) / (9.0 * sMul)) * 30.0;
              }
              if (d < 24.0 * sMul) {
                aliX += o.vx; aliY += o.vy;
                cohX += o.x;  cohY += o.y;
                nb++;
              }
            }
            let ax = sepX, ay = sepY;
            if (nb > 0) {
              ax += (aliX / nb - f.vx) * 1.2 + ((cohX / nb - f.x) * 0.55);
              ay += (aliY / nb - f.vy) * 1.2 + ((cohY / nb - f.y) * 0.55);
            }

            if (f.fleeTimer > 0) {
              // 合口受惊四散逃离：从巨口向外围海域强径向奔逃
              const dx = f.x - mawFrontX, dy = f.y - mawFrontY;
              const d = Math.hypot(dx, dy) || 0.001;
              ax += (dx / d) * 65.0 * (f.fleeTimer / 2.6);
              ay += (dy / d) * 65.0 * (f.fleeTimer / 2.6);
            } else if (attractMode) {
              // 张口吐食糜态：从四周欢快游聚到巨口前方盘旋啄食
              const swirlAng = time * 2.3 + f.phase;
              const goalX = feedCenterX + Math.cos(swirlAng) * (7.2 + (i % 2) * 3.2) * sMul;
              const goalY = feedCenterY + Math.sin(swirlAng) * (6.2 + (i % 3) * 2.2) * sMul;
              ax += (goalX - f.x) * 2.6;
              ay += (goalY - f.y) * 2.6;
            } else {
              // 浮岛静伏态：在浮岛外围海域悠闲盘游
              f.orbitAng = wrapAngle(f.orbitAng + dt * 0.42 * (i % 2 === 0 ? 1 : -1));
              const orbR = (45.0 + Math.sin(time * 0.9 + f.phase) * 4.0) * sMul;
              const goalX = state.x + Math.cos(f.orbitAng) * orbR;
              const goalY = state.y + Math.sin(f.orbitAng) * orbR;
              ax += (goalX - f.x) * 1.6;
              ay += (goalY - f.y) * 1.6;
            }

            // 浮岛主体排斥（杜绝小鱼穿入岛腹、侧甲或闭合下颌）
            const dxC = f.x - state.x, dyC = f.y - state.y;
            const dC = Math.hypot(dxC, dyC) || 0.001;
            const bodyKeepOut = (attractMode ? 33.5 : 39.5) * sMul;
            if (dC < bodyKeepOut) {
              const push = (bodyKeepOut - dC) * 5.2;
              ax += (dxC / dC) * push;
              ay += (dyC / dC) * push;
            }

            // 地台外缘软回拉
            const dPlat = Math.hypot(f.x, f.y);
            if (dPlat > fishLimitR) {
              ax -= (f.x / dPlat) * (dPlat - fishLimitR) * 4.0;
              ay -= (f.y / dPlat) * (dPlat - fishLimitR) * 4.0;
            }

            f.vx += ax * dt;
            f.vy += ay * dt;
            const maxSpd = (f.fleeTimer > 0 ? 34.0 : (attractMode ? 22.0 : 15.5)) * sMul;
            const minSpd = 6.5 * sMul;
            const spNow = Math.hypot(f.vx, f.vy) || 0.001;
            if (spNow > maxSpd) { f.vx *= maxSpd / spNow; f.vy *= maxSpd / spNow; }
            else if (spNow < minSpd) { f.vx *= minSpd / spNow; f.vy *= minSpd / spNow; }

            f.x += f.vx * dt;
            f.y += f.vy * dt;
            f.z = (2.8 + Math.sin(time * 4.2 + f.phase) * 0.65 + (attractMode ? 0.65 : 0)) * sMul;

            const fyaw = Math.atan2(-f.vx, f.vy);
            f.yaw = wrapAngle(f.yaw + wrapAngle(fyaw - f.yaw) * expSmooth(dt, 11.0));
          }

          sockets.setWorld('maw', mawFrontX, mawFrontY, state.z + 5.0 * sMul, state.yaw);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? habitat.waterLevel : 3.0;
          const yw = state.yaw;
          const bz = state.z;

          // 1. 中央龟背礁丘 islandCore（高出海面，submerge=0 避免冗余水色烘焙）
          list.push({
            partKey: 'islandCore',
            asset: parts.islandCore,
            x: state.x,
            y: state.y,
            lift: Math.max(0, bz),
            ro: yw,
            bias: 0.40,
            submerge: 0
          });

          // 2. 左右对称巨兽侧背岩甲 flankL / flankR（共享同一 X 对称件，旋转 ±90° 朝外入海）
          const flankSub = EnvFeedback.calcSubmerge(bz + 1.8 * sMul, waterLvl, 4.6, isWater) * 0.55;
          const [flx, fly] = localToWorldXY(state.x, state.y, yw, -16.8 * sMul, -1.0 * sMul);
          const [frx, fry] = localToWorldXY(state.x, state.y, yw,  16.8 * sMul, -1.0 * sMul);
          list.push({
            partKey: 'flankL',
            asset: parts.flankL,
            x: flx,
            y: fly,
            lift: Math.max(0, bz - 0.6 * sMul),
            ro: wrapAngle(yw + Math.PI * 0.5),
            bias: -0.25,
            submerge: flankSub
          });
          list.push({
            partKey: 'flankR',
            asset: parts.flankR,
            x: frx,
            y: fry,
            lift: Math.max(0, bz - 0.6 * sMul),
            ro: wrapAngle(yw - Math.PI * 0.5),
            bias: -0.25,
            submerge: flankSub
          });

          // 3. 后方若隐若现半潜脊鳍尾峰 tailRidge（深嵌 islandCore 后缘）
          const tailYaw = wrapAngle(yw + state.tailSway);
          const [tjx, tjy] = localToWorldXY(state.x, state.y, yw, 0, -14.5 * sMul);
          const [tx, ty] = pivotToWorldXY(tjx, tjy, tailYaw, TAIL_PIVOT.x * sMul, TAIL_PIVOT.y * sMul);
          list.push({
            partKey: 'tailRidge',
            asset: parts.tailRidge,
            x: tx,
            y: ty,
            lift: Math.max(0, bz - 1.2 * sMul),
            ro: tailYaw,
            bias: -0.45,
            submerge: EnvFeedback.calcSubmerge(bz + 0.8 * sMul, waterLvl, 4.4, isWater) * 0.72
          });

          // 4. 前方巨型半潜上下颌（jawLower bias=-2.2 稳居下方，jawUpper bias=+1.8 稳盖上方）
          const openU = clamp(state.jawOpen, 0, 1);
          const jawLvl = openU > 0.66 ? 2 : (openU > 0.24 ? 1 : 0);
          const upperKey = jawLvl === 2 ? 'jawUpperOpen' : (jawLvl === 1 ? 'jawUpperMid' : 'jawUpperClose');
          const lowerKey = jawLvl === 2 ? 'jawLowerOpen' : (jawLvl === 1 ? 'jawLowerMid' : 'jawLowerClose');

          const [jjx, jjy] = localToWorldXY(state.x, state.y, yw, 0, 12.5 * sMul);
          const [jlx, jly] = pivotToWorldXY(jjx, jjy, yw, JAW_LOWER_PIVOT.x * sMul, (JAW_LOWER_PIVOT.y - openU * 1.4) * sMul);
          const [jux, juy] = pivotToWorldXY(jjx, jjy, yw, JAW_UPPER_PIVOT.x * sMul, (JAW_UPPER_PIVOT.y + openU * 1.0) * sMul);

          // 下颌：张口时下压半潜水面成深红诱鱼盆
          const lowerLift = Math.max(0, bz - (0.8 + openU * 1.5) * sMul);
          list.push({
            partKey: lowerKey,
            asset: parts[lowerKey],
            x: jlx,
            y: jly,
            lift: lowerLift,
            ro: yw,
            bias: -2.2,
            submerge: EnvFeedback.calcSubmerge(lowerLift + 1.4 * sMul, waterLvl, 4.4, isWater) * 0.75
          });

          // 上颌：闭合时贴合下颌，张口时大角度抬起露出锯齿利牙与深红咽喉
          const upperLift = Math.max(1.5 * sMul, bz + (3.2 + openU * 4.4) * sMul);
          list.push({
            partKey: upperKey,
            asset: parts[upperKey],
            x: jux,
            y: juy,
            lift: upperLift,
            ro: yw,
            bias: 1.8,
            submerge: openU > 0.3 ? 0 : EnvFeedback.calcSubmerge(upperLift + 1.0 * sMul, waterLvl, 4.8, isWater) * 0.35
          });

          // 5. 背上常驻 2 只立体白羽海鸟（歇息草背 / 受惊绕岛高飞）
          for (let i = 0; i < birds.length; i++) {
            const b = birds[i];
            let bKey = 'birdStand';
            if (b.mode === 'circle') {
              bKey = Math.sin(b.flapPhase) >= 0 ? 'birdFlyUp' : 'birdFlyDown';
            } else if (b.peckTimer > 0) {
              bKey = 'birdPeck';
            }
            const bYaw = b.mode === 'perch' ? wrapAngle(yw + b.yaw) : b.yaw;
            list.push({
              partKey: bKey,
              asset: parts[bKey],
              x: b.wx,
              y: b.wy,
              lift: Math.max(1.0, b.wz),
              ro: bYaw,
              bias: b.mode === 'circle' ? 6.5 : 3.2,
              submerge: 0
            });
          }

          // 6. 5 条立体小银鱼群（在巨口前方盘旋啄食或四周外围游弋）
          for (let i = 0; i < fishes.length; i++) {
            const f = fishes[i];
            const wag = Math.sin(f.phase + (f.fleeTimer > 0 ? 18.0 : 9.5) * state.phaseTimer);
            const fKey = wag > 0.35 ? 'fishL' : (wag < -0.35 ? 'fishR' : 'fishM');
            list.push({
              partKey: fKey,
              asset: parts[fKey],
              x: f.x,
              y: f.y,
              lift: Math.max(0.5, f.z),
              ro: f.yaw,
              bias: 0.35,
              submerge: EnvFeedback.calcSubmerge(f.z, waterLvl, 3.8, isWater) * 0.55
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sea3Def.id,
            code: Sea3Def.code,
            status: Sea3Def.status,
            name: Sea3Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            cyclePhase: state.cyclePhase,
            jawOpen: Number(state.jawOpen.toFixed(2)),
            birdModes: birds.map(b => b.mode),
            fishCount: fishes.length,
            footRadius: Sea3Def.footRadius,
            headZ: 22,
            centerZ: 10,
            blocks: Sea3Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Sea3Def);
})(window.PixelWorkshop);
