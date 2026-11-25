'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i, fbm1 } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 树2 · 走果巨树（Waq-waq 树 · M10 扎根固定本体 + 派生独立子实体 · v3 精制）
  //
  // 【前置调研与方案确认】
  // 1. 生物原型与运动学调研：
  //    - 原型取自古波斯与阿拉伯传说中的瓦克瓦克树（Waq-waq），枝梢垂挂受风鼓胀的奇异囊果，
  //      外形参考古榕树「盘错板根座 → 粗壮扭曲主干 → 外展粗枝 → 分层茂密叶冠」比例；
  //      囊果不做人头，雕为带嫩绿叶蒂、纵向鼓胀棱纹与顶芽的可爱肉质果囊（青涩/熟透两档）。
  //    - 俯视 45° 像素堆叠大树拆块防露缝方案：统一采用部件中心深度排序并阶梯拉开层级 bias
  //      （根座 -0.60 → 主干 -0.10 → 3 根弹簧粗枝 +0.08 → 下层环冠 +1.80 → 中层主冠 +2.60 →
  //      顶冠 +3.20），保证所有子部件起点 100% 嵌入父体且 Z 咬合重叠率 ≥ 50%。
  //    - 枝冠风摆采用低频二阶阻尼谐振弹簧（Damped Harmonic Oscillator）与父子相位滞后耦合；
  //      脱落走果的 4 条迷你短腿采用高占空比四足对角小跑（占空比 0.65，抬脚 1.1 格贴合短腿比例），
  //      并内置树根圆周避障导向与全阶段硬超时兜底，彻底杜绝对象池状态卡死或穿入树根。
  // 2. 三维几何坐标预算表（11 个共享部件，单部件 ≤ 34 格，远低于 40 格上限；图集约 3~6MB << 28MB）：
  //    - rootBase      (34×34×10, lift=0.0,  bias=-0.60)：5 叉盘错粗根座，顶领 Z=9.5，r=7.6
  //    - trunkMain     (22×22×20, lift=4.0,  bias=-0.10)：世界 Z=4.0~24.0，嵌入根座 5.5 格（重叠 55%）
  //    - branchA / B   (14×24×14 / 13×22×13, lift=15.6~17.2)：3 根径向弹簧粗枝，根枢轴深嵌主干 r=1.6 处
  //    - canopyCluster (26×26×13, lift=23.2~24.8, bias=+1.80)：3 团枝梢叶冠，包裹粗枝顶端重叠 ≥ 50%
  //    - canopyMid     (34×34×12, lift=26.5, bias=+2.60)：中层主叶冠，世界 Z=26.5~38.5，覆盖主干顶与环冠
  //    - canopyTop     (24×24×10, lift=33.5, bias=+3.20)：顶层冠蓬，世界 Z=33.5~43.5，与中冠重叠 5.0 格（50%）
  //    - podYoung      (8×8×9) / podRipe (11×11×12)：4 个枝梢外缘垂挂点（Z=19.8~22.2），两档无损切换
  //    - walkerBody    (10×11×10) + walkerLeg (4×4×4 ×4)：3 槽独立走果池，短腿顶嵌入果腹 ≥ 55%
  // 3. 现有内核盘点：
  //    - 直接复用 PW.Voxel / PW.Solvers（SpringDamper1D, SocketTracker）与 PW.Behaviors（Propulsion.rooted,
  //      EnvFeedback），不修改 core/；
  //    - 脚本内自建 4 挂点枝果生长调度器与 3 槽独立走果对象池状态机（熟透摇晃→落体砸地→绕根爬走→钻土回收）。
  // =========================================================================

  // 29 色独立色表（严守 ≤ 48 色、零重色，eyeGlint 严禁进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 古树粗树皮
      barkDark:   '#3d2b1d',
      barkMid:    '#664831',
      barkHi:     '#946d4b',
      // 深裂纹木质与盘结老根
      woodDark:   '#291c13',
      woodMid:    '#4a3322',
      woodHi:     '#705036',
      // 树根与枝背青苔
      mossDark:   '#254f27',
      mossMid:    '#3f8039',
      mossHi:     '#71b853',
      // 下层与中层茂密叶冠
      leafDark:   '#1f542d',
      leafMid:    '#368241',
      leafHi:     '#68ba59',
      // 顶层暖绿嫩叶蓬
      crownDark:  '#326e2c',
      crownMid:   '#5ca842',
      crownHi:    '#9de063',
      // 囊果叶蒂与小芽苞
      stemDark:   '#3b5e22',
      stemMid:    '#679938',
      stemHi:     '#a5d65c',
      // 青涩小果果皮
      youngDark:  '#4d7529',
      youngMid:   '#80b541',
      youngHi:    '#bfe86b',
      // 熟透鼓胀肉质囊果与走果本体
      podDark:    '#8c2420',
      podMid:     '#d64433',
      podHi:      '#ff8059',
      // 囊果鼓胀棱纹与走果短腿
      ribDark:    '#a84c20',
      ribMid:     '#e88338',
      ribHi:      '#ffbf66',
      // 走果纯黑圆眼与白点（eyeGlint 严禁进 glowKeys）
      eyeDark:    '#140e0c',
      eyeGlint:   '#fff7e0'
    },
    glowKeys: [],
    parts: [
      'bark', 'wood', 'moss', 'leaf', 'crown',
      'stem', 'young', 'pod', 'rib', 'eye'
    ],
    noCrease: [
      ['bark', 'wood'], ['bark', 'moss'], ['wood', 'moss'],
      ['leaf', 'crown'], ['leaf', 'moss'],
      ['pod', 'rib'], ['pod', 'stem'], ['young', 'stem'],
      ['pod', 'eye']
    ],
    materials: {
      bark:  ['barkDark',  'barkMid',  'barkHi'],
      wood:  ['woodDark',  'woodMid',  'woodHi'],
      moss:  ['mossDark',  'mossMid',  'mossHi'],
      leaf:  ['leafDark',  'leafMid',  'leafHi'],
      crown: ['crownDark', 'crownMid', 'crownHi'],
      stem:  ['stemDark',  'stemMid',  'stemHi'],
      young: ['youngDark', 'youngMid', 'youngHi'],
      pod:   ['podDark',   'podMid',   'podHi'],
      rib:   ['ribDark',   'ribMid',   'ribHi']
    },
    protectedParts: ['eye', 'stem']
  });

  // 4 套零重建模换色皮肤（无禁用字）
  const SKINS = [
    {
      id: 'emerald_vermilion',
      name: '翠冠朱果（古林经典）',
      dot: '#d64433',
      outline: '#121710',
      pal: {},
      fx: {
        leafA: '#5ca842',
        leafB: '#9de063',
        fruit: '#ff8059',
        ring:  '#ffbf66',
        dirt:  '#664831'
      }
    },
    {
      id: 'autumn_maple',
      name: '金秋枫果（秋林款）',
      dot: '#e67829',
      outline: '#1c110b',
      pal: {
        barkDark:  '#452819', barkMid:  '#75472d', barkHi:  '#a86d48',
        woodDark:  '#301b11', woodMid:  '#57331f', woodHi:  '#855134',
        mossDark:  '#6e4d1c', mossMid:  '#a67b2e', mossHi:  '#deb44e',
        leafDark:  '#8c2b1a', leafMid:  '#cf4d25', leafHi:  '#f5883b',
        crownDark: '#b04e19', crownMid: '#e88227', crownHi: '#ffc44d',
        stemDark:  '#69481c', stemMid:  '#9e742b', stemHi:  '#d9ae4c',
        youngDark: '#7a7822', youngMid: '#b5b038', youngHi: '#e8e061',
        podDark:   '#9e2c16', podMid:   '#e65c22', podHi:   '#ffa047',
        ribDark:   '#b56a18', ribMid:   '#f0a22e', ribHi:   '#ffe073'
      },
      fx: {
        leafA: '#cf4d25',
        leafB: '#ffc44d',
        fruit: '#ffa047',
        ring:  '#ffe073',
        dirt:  '#75472d'
      }
    },
    {
      id: 'frost_jade',
      name: '霜枝碧果（寒林款）',
      dot: '#3ec4a0',
      outline: '#101921',
      pal: {
        barkDark:  '#445261', barkMid:  '#738699', barkHi:  '#aebfcf',
        woodDark:  '#2b3540', woodMid:  '#4e5c6b', woodHi:  '#7c8e9e',
        mossDark:  '#264d63', mossMid:  '#417a96', mossHi:  '#7ab5cf',
        leafDark:  '#1f485e', leafMid:  '#356e8a', leafHi:  '#68a4bf',
        crownDark: '#34647d', crownMid: '#5c95b0', crownHi: '#99cce0',
        stemDark:  '#1c5c4a', stemMid:  '#339978', stemHi:  '#6ee0b8',
        youngDark: '#2e6e60', youngMid: '#52ab95', youngHi: '#96e8d2',
        podDark:   '#0f664a', podMid:   '#1ec486', podHi:   '#6bffbf',
        ribDark:   '#1d7a69', ribMid:   '#42d1b2', ribHi:   '#a6ffea'
      },
      fx: {
        leafA: '#7cbcc9',
        leafB: '#c4f0f5',
        fruit: '#72f2c8',
        ring:  '#a3faf0',
        dirt:  '#7f909e'
      }
    },
    {
      id: 'withered_plum',
      name: '枯木紫果（深林款）',
      dot: '#a84ec7',
      outline: '#16101c',
      pal: {
        barkDark:  '#2e292e', barkMid:  '#4d444d', barkHi:  '#756975',
        woodDark:  '#1f1b21', woodMid:  '#38303b', woodHi:  '#594d5e',
        mossDark:  '#24453d', mossMid:  '#3c7062', mossHi:  '#69a693',
        leafDark:  '#1f3d3c', leafMid:  '#35635f', leafHi:  '#609990',
        crownDark: '#2e5250', crownMid: '#4e807b', crownHi: '#85b8b0',
        stemDark:  '#3c4f30', stemMid:  '#61804c', stemHi:  '#96b879',
        youngDark: '#4a4a6e', youngMid: '#7877a8', youngHi: '#b0b0e0',
        podDark:   '#5c1f78', podMid:   '#9e42bd', podHi:   '#de85f5',
        ribDark:   '#7d2f7a', ribMid:   '#c75ca8', ribHi:   '#ffa6df'
      },
      fx: {
        leafA: '#4e807b',
        leafB: '#85b8b0',
        fruit: '#de85f5',
        ring:  '#ffa6df',
        dirt:  '#4d444d'
      }
    }
  ];

  // =========================================================================
  // 1. 盘错粗根座（rootBase：34×34×10，lift=0）
  //    5 条蜿蜒盘结的粗板根向外抓地，根谷嵌厚实青苔，中央厚根领包裹主干底端
  // =========================================================================
  function buildRootBase(makeCanvas) {
    const m = new VoxelModel(34, 34, 10, SPEC);
    const { mat, partId } = SPEC;

    // 中央厚实根领（高度 0..9，顶半径 ~7.4，稳稳包裹主干底端）
    m.fillAABB(-9.5, 9.5, -9.5, 9.5, 0, 9, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const t = z / 9;
      const groove = Math.sin(ang * 5 + z * 0.20) * 0.72;
      const rBase = lerp(8.8, 7.2, t) + groove;
      const d = Math.hypot(X, Y);
      if (d <= rBase) {
        const isCrevice = Math.sin(ang * 5 + 0.35) < -0.52;
        m.setRaw(x, y, z, isCrevice ? mat('wood') : mat('bark'), isCrevice ? partId.wood : partId.bark);
      }
    });

    // 5 条盘错蜿蜒粗板根，向外延展抓地并带拱起根脊与根杈
    const rootAngles = [0.22, 1.48, 2.72, 3.98, 5.24];
    for (let i = 0; i < rootAngles.length; i++) {
      const a0 = rootAngles[i];
      const a1 = a0 + (i % 2 === 0 ? 0.18 : -0.18);
      const a2 = a1 + (i % 2 === 0 ? -0.14 : 0.16);
      const p0x = Math.cos(a0) * 5.2,  p0y = Math.sin(a0) * 5.2;
      const p1x = Math.cos(a1) * 10.6, p1y = Math.sin(a1) * 10.6;
      const p2x = Math.cos(a2) * 15.0, p2y = Math.sin(a2) * 15.0;
      const rKey = i % 2 === 0 ? 'bark' : 'wood';

      // 主根拱起段 + 抓地尖端
      m.paintCapsule(p0x, p0y, 5.4, p1x, p1y, 2.8, 3.1, 2.25, mat(rKey), partId[rKey], true);
      m.paintCapsule(p1x, p1y, 2.8, p2x, p2y, 1.0, 2.15, 1.05, mat('bark'), partId.bark, true);
      // 侧岔小根爪
      const forkAng = a1 + (i % 2 === 0 ? -0.46 : 0.46);
      const fx = p1x + Math.cos(forkAng) * 4.4;
      const fy = p1y + Math.sin(forkAng) * 4.4;
      m.paintCapsule(p1x, p1y, 2.2, fx, fy, 0.9, 1.45, 0.78, mat('wood'), partId.wood, true);

      // 根背青苔垫与根谷苔簇
      const mossAng = a0 + 0.62;
      m.paintEllipsoid(Math.cos(mossAng) * 7.6, Math.sin(mossAng) * 7.6, 2.0, 2.3, 2.1, 1.4, mat('moss'), partId.moss, true);
      m.paintEllipsoid(p1x * 0.88, p1y * 0.88, 4.4, 1.6, 1.5, 0.95, mat('moss'), partId.moss, true);
    }

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 14.5, headZ: 9, centerZ: 4 });
  }

  // =========================================================================
  // 2. 苍劲扭曲主干（trunkMain：22×22×20，lift=4.0）
  //    螺旋 S 形苍劲扭曲、深裂树皮纹、正面树瘤洞疤、顶部三叉冠座
  // =========================================================================
  function buildTrunkMain(makeCanvas) {
    const m = new VoxelModel(22, 22, 20, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-10.5, 10.5, -10.5, 10.5, 0, 19, (x, y, z, X, Y) => {
      const t = z / 19;
      // 苍劲螺旋扭转中轴
      const cx = Math.sin(t * Math.PI * 1.35) * 1.55;
      const cy = Math.cos(t * Math.PI * 1.15) * 1.10 - 0.35;
      const lx = X - cx;
      const ly = Y - cy;
      const ang = Math.atan2(ly, lx);

      // 下粗中收上扩（底部嵌入根座，顶部外展托起 3 根粗枝）
      const flareBot = (1 - smoothstep(0.0, 0.28, t)) * 1.35;
      const flareTop = smoothstep(0.68, 1.0, t) * 1.45;
      const rCore = 5.2 + flareBot + flareTop;
      // 清晰的螺旋树皮纵裂纹
      const barkRidge = Math.sin(ang * 7 + t * 3.8) * 0.56 + Math.sin(ang * 3 - t * 2.2) * 0.32;
      const d = Math.hypot(lx, ly);

      if (d <= rCore + barkRidge) {
        const fissure = Math.sin(ang * 7 + t * 3.8);
        const isMossSide = t > 0.25 && t < 0.82 && ang > 1.3 && ang < 2.6 && d > rCore - 0.65;
        if (isMossSide) {
          m.setRaw(x, y, z, mat('moss'), partId.moss);
        } else if (fissure < -0.45) {
          m.setRaw(x, y, z, mat('wood'), partId.wood);
        } else {
          m.setRaw(x, y, z, mat('bark'), partId.bark);
        }
      }
    });

    // 正面树干苍劲节瘤与深邃老树疤（提升树干近景细节辨识度）
    m.paintEllipsoid(1.2, 5.2, 8.5, 2.3, 1.8, 2.6, mat('bark'), partId.bark, true);
    m.paintEllipsoid(1.2, 6.2, 8.5, 1.25, 1.05, 1.55, mat('wood'), partId.wood, true);
    // 树干腰部一簇翠绿青苔挂垫
    m.paintEllipsoid(-4.2, 2.8, 11.4, 2.2, 2.0, 1.8, mat('moss'), partId.moss, true);
    m.paintEllipsoid(3.8, -3.4, 15.2, 2.1, 2.0, 1.6, mat('moss'), partId.moss, true);

    // 顶部三叉托肩（预留与 3 根弹簧粗枝咬合的浑圆木肩）
    const shoulderAngs = [0.35, 2.45, 4.50];
    for (const a of shoulderAngs) {
      m.paintCapsule(
        0, 0, 15.0,
        Math.cos(a) * 5.6, Math.sin(a) * 5.6, 17.8,
        3.2, 2.45, mat('bark'), partId.bark, true
      );
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.4, headZ: 19, centerZ: 10 });
  }

  // =========================================================================
  // 3. 可微摆弹簧粗枝（branchA：14×24×14，branchB：13×22×13）
  //    根端枢轴深嵌主干，拱形外展并生出副杈，枝背覆青苔
  // =========================================================================
  const BRANCH_A_PIVOT = { x: 0.0, y: -7.5 };
  const BRANCH_B_PIVOT = { x: 0.0, y: -6.8 };

  function buildBranch(makeCanvas, variant) {
    const isA = variant === 'A';
    const W = isA ? 14 : 13;
    const D = isA ? 24 : 22;
    const H = isA ? 14 : 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const py = isA ? BRANCH_A_PIVOT.y : BRANCH_B_PIVOT.y;
    const bend = isA ? 1.4 : -1.3;
    const len = isA ? 17.0 : 15.5;

    // 主枝拱起弧线（起点在枢轴 py，向 +Y 外展抬升）
    const midY = py + len * 0.52;
    const tipY = py + len;
    const midZ = isA ? 7.8 : 7.2;
    const tipZ = isA ? 10.6 : 9.8;

    // 根部浑圆木节（深嵌主干内部，摆动时绝不露缝）
    m.paintEllipsoid(0, py + 0.6, 3.2, 3.0, 3.0, 2.9, mat('bark'), partId.bark, true);
    m.paintCapsule(0, py, 3.2, bend, midY, midZ, 2.75, 2.05, mat('bark'), partId.bark, true);
    m.paintCapsule(bend, midY, midZ, bend * 0.45, tipY, tipZ, 2.00, 1.35, mat('wood'), partId.wood, true);

    // 侧斜副杈（用于托起叶冠外沿并垂挂囊果）
    const sideDir = isA ? -1 : 1;
    m.paintCapsule(
      bend * 0.8, midY + 0.8, midZ - 0.2,
      bend * 0.8 + sideDir * 4.4, midY + 5.8, midZ + 2.4,
      1.55, 0.95, mat('bark'), partId.bark, true
    );

    // 枝背覆盖一条自然青苔带与小嫩叶芽
    m.paintCapsule(0.2, py + 2.4, 5.2, bend, midY + 1.2, midZ + 1.6, 1.35, 1.10, mat('moss'), partId.moss, true);
    m.paintEllipsoid(bend * 0.6, tipY - 1.4, tipZ + 0.8, 1.8, 1.8, 1.2, mat('leaf'), partId.leaf, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: H - 1, centerZ: Math.round(H * 0.5) });
  }

  // =========================================================================
  // 4. 分层茂密叶冠（canopyCluster 26×26×13 / canopyMid 34×34×12 / canopyTop 24×24×10）
  //    圆润蓬松的多叶团叠雕，底面深苔暗底、中段浓叶、顶面明亮嫩叶层次分明
  // =========================================================================
  function buildCanopyCluster(makeCanvas) {
    const m = new VoxelModel(26, 26, 13, SPEC);
    const { mat, partId } = SPEC;

    // 7 团高低错落的球形叶簇融合，形成饱满云朵状分枝叶冠
    const puffs = [
      [ 0.0,  0.0, 5.6, 8.2, 8.0, 5.0, 'leaf'],
      [-5.6,  2.4, 4.8, 5.6, 5.4, 4.0, 'leaf'],
      [ 5.6,  2.2, 5.0, 5.5, 5.3, 4.1, 'leaf'],
      [-3.8, -5.2, 4.6, 5.4, 5.2, 3.9, 'moss'],
      [ 4.2, -5.0, 4.8, 5.3, 5.1, 4.0, 'leaf'],
      [ 0.0,  5.6, 5.2, 5.8, 5.2, 4.0, 'crown'],
      [-1.4,  0.8, 8.2, 6.2, 6.0, 3.6, 'crown']
    ];

    m.fillAABB(-12.5, 12.5, -12.5, 12.5, 0, 12, (x, y, z, X, Y) => {
      let bestD = 99;
      let bestMat = 'leaf';
      for (let i = 0; i < puffs.length; i++) {
        const [px, py, pz, rx, ry, rz, mk] = puffs[i];
        const d = (Math.hypot((X - px) / rx, (Y - py) / ry, (z - pz) / rz) - 1.0) * Math.min(rx, ry, rz);
        if (d < bestD) {
          bestD = d;
          bestMat = mk;
        }
      }
      // 表面细微有机叶缘起伏，避免像平整塑料球
      const bumpy = Math.sin(X * 0.72 + Y * 0.55) * 0.42 + Math.cos(Y * 0.85 - z * 0.65) * 0.36;
      if (bestD <= bumpy) {
        const finalMat = z <= 2 ? 'moss' : (z >= 9 ? 'crown' : bestMat);
        m.setRaw(x, y, z, mat(finalMat), partId[finalMat]);
      }
    });

    // 边缘垂下 3 缕短气根/藤尖，强化古木树冠垂挂空间感
    m.paintCapsule(-6.8,  3.2, 3.2, -7.2,  3.6, 0.6, 0.9, 0.55, mat('moss'), partId.moss, true);
    m.paintCapsule( 6.6, -2.4, 3.4,  7.0, -2.8, 0.8, 0.9, 0.55, mat('moss'), partId.moss, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 11.2, headZ: 12, centerZ: 6 });
  }

  function buildCanopyMid(makeCanvas) {
    const m = new VoxelModel(34, 34, 12, SPEC);
    const { mat, partId } = SPEC;

    const puffs = [
      [  0.0,   0.0, 5.4, 11.2, 11.0, 4.9, 'leaf'],
      [ -8.2,   4.6, 4.8,  7.2,  6.8, 4.2, 'leaf'],
      [  8.4,   4.2, 5.0,  7.0,  6.8, 4.2, 'crown'],
      [ -7.6,  -5.6, 4.6,  7.2,  6.8, 4.0, 'leaf'],
      [  7.8,  -5.4, 4.8,  7.0,  6.8, 4.1, 'leaf'],
      [  0.0,   9.0, 5.2,  7.4,  6.4, 4.1, 'crown'],
      [  0.2,  -8.8, 4.6,  7.4,  6.4, 4.0, 'moss'],
      [ -2.4,   2.2, 7.6,  7.6,  7.4, 3.6, 'crown'],
      [  3.6,  -1.8, 7.4,  7.0,  6.8, 3.5, 'crown']
    ];

    m.fillAABB(-16.5, 16.5, -16.5, 16.5, 0, 11, (x, y, z, X, Y) => {
      let bestD = 99;
      let bestMat = 'leaf';
      for (let i = 0; i < puffs.length; i++) {
        const [px, py, pz, rx, ry, rz, mk] = puffs[i];
        const d = (Math.hypot((X - px) / rx, (Y - py) / ry, (z - pz) / rz) - 1.0) * Math.min(rx, ry, rz);
        if (d < bestD) {
          bestD = d;
          bestMat = mk;
        }
      }
      const bumpy = Math.sin(X * 0.62 - Y * 0.52) * 0.48 + Math.cos(X * 0.45 + z * 0.72) * 0.36;
      if (bestD <= bumpy) {
        const finalMat = z <= 2 ? 'moss' : (z >= 8 ? 'crown' : bestMat);
        m.setRaw(x, y, z, mat(finalMat), partId[finalMat]);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 15.2, headZ: 11, centerZ: 5 });
  }

  function buildCanopyTop(makeCanvas) {
    const m = new VoxelModel(24, 24, 10, SPEC);
    const { mat, partId } = SPEC;

    const puffs = [
      [ 0.0,  0.0, 4.8, 8.2, 8.0, 4.2, 'crown'],
      [-5.2,  2.8, 3.8, 5.4, 5.2, 3.4, 'crown'],
      [ 5.4,  2.2, 4.0, 5.2, 5.0, 3.4, 'crown'],
      [-4.2, -4.6, 3.6, 5.2, 5.0, 3.2, 'leaf'],
      [ 4.4, -4.4, 3.8, 5.2, 5.0, 3.3, 'leaf'],
      [ 0.4,  0.8, 6.8, 5.6, 5.4, 2.8, 'crown']
    ];

    m.fillAABB(-11.5, 11.5, -11.5, 11.5, 0, 9, (x, y, z, X, Y) => {
      let bestD = 99;
      let bestMat = 'crown';
      for (let i = 0; i < puffs.length; i++) {
        const [px, py, pz, rx, ry, rz, mk] = puffs[i];
        const d = (Math.hypot((X - px) / rx, (Y - py) / ry, (z - pz) / rz) - 1.0) * Math.min(rx, ry, rz);
        if (d < bestD) {
          bestD = d;
          bestMat = mk;
        }
      }
      const bumpy = Math.sin(X * 0.78 + Y * 0.68) * 0.40;
      if (bestD <= bumpy) {
        const finalMat = z <= 1 ? 'leaf' : bestMat;
        m.setRaw(x, y, z, mat(finalMat), partId[finalMat]);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.2, headZ: 9, centerZ: 5 });
  }

  // =========================================================================
  // 5. 枝梢垂挂囊果（两档无损烘焙：podYoung 青涩小果 / podRipe 熟透鼓胀囊果）
  //    非人头！带叶蒂、纵向鼓胀棱纹、小芽苞的奇异可爱肉质果囊
  // =========================================================================
  function buildPodYoung(makeCanvas) {
    const m = new VoxelModel(8, 8, 9, SPEC);
    const { mat, partId } = SPEC;
    // 顶部细长叶蒂
    m.paintCapsule(0, 0, 5.6, 0, 0, 8.2, 0.72, 0.55, mat('stem'), partId.stem, true);
    m.paintEllipsoid(0, 0, 5.6, 1.9, 1.9, 0.85, mat('stem'), partId.stem, true);
    // 圆润略垂的青涩小果囊
    m.paintEllipsoid(0, 0, 3.0, 2.55, 2.55, 2.75, mat('young'), partId.young, true);
    // 顶部侧翘嫩叶小芽苞
    m.paintCapsule(0.4, 0.2, 6.2, 2.2, 1.2, 7.6, 0.75, 0.45, mat('stem'), partId.stem, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.6, headZ: 8, centerZ: 4 });
  }

  function buildPodRipe(makeCanvas) {
    const m = new VoxelModel(11, 11, 12, SPEC);
    const { mat, partId } = SPEC;

    // 鼓胀圆润的梨形/瓜形肉质果囊，带 5 条清晰纵向鼓胀棱纹
    m.fillAABB(-4.8, 4.8, -4.8, 4.8, 0, 8, (x, y, z, X, Y) => {
      const t = z / 8;
      // 下腹饱满鼓胀、上肩微收接叶蒂
      const bulge = 1.0 + Math.sin(t * Math.PI) * 0.16 - t * 0.18;
      const ang = Math.atan2(Y, X);
      const ribWave = Math.cos(ang * 5);
      const r = (3.75 + ribWave * 0.34) * bulge;
      const d = Math.hypot(X / r, Y / r, (z - 3.9) / 3.9);
      if (d <= 1.0) {
        const isRib = ribWave > 0.58 && t > 0.14 && t < 0.84;
        m.setRaw(x, y, z, isRib ? mat('rib') : mat('pod'), isRib ? partId.rib : partId.pod);
      }
    });

    // 顶部饱满叶蒂托盖 + 紧绷果柄 + 双瓣翘起小芽苞
    m.paintEllipsoid(0, 0, 7.8, 2.6, 2.6, 1.05, mat('stem'), partId.stem, true);
    m.paintCapsule(0, 0, 8.0, 0, 0, 11.2, 0.90, 0.65, mat('stem'), partId.stem, true);
    m.paintCapsule(0.6, 0.4, 8.6, 3.0, 1.8, 10.6, 0.88, 0.48, mat('stem'), partId.stem, true);
    m.paintCapsule(-0.6, -0.4, 8.6, -2.6, -1.6, 10.2, 0.82, 0.46, mat('young'), partId.young, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.1, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 6. 独立走果子实体（walkerBody 10×11×10 + 4 条迷你短腿 walkerLeg 4×4×4）
  //    落地后展开四条迷你肉质小短腿，头顶翘着叶蒂小芽苞，正面一对纯黑圆豆眼
  // =========================================================================
  function buildWalkerBody(makeCanvas) {
    const W = 10, D = 11, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 圆滚滚肉质果囊身躯（略微前倾椭圆，带纵向果棱）
    m.fillAABB(-4.5, 4.5, -5.0, 5.0, 0, 7, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const ribWave = Math.cos(ang * 5);
      const rx = 3.7 + ribWave * 0.28;
      const ry = 4.1 + ribWave * 0.25;
      const d = Math.hypot(X / rx, Y / ry, (z - 3.6) / 3.4);
      if (d <= 1.0) {
        const isRib = ribWave > 0.60 && z >= 1 && z <= 6 && Y < 2.2;
        m.setRaw(x, y, z, isRib ? mat('rib') : mat('pod'), isRib ? partId.rib : partId.pod);
      }
    });

    // 头顶叶蒂小圆帽 + 两片俏皮小芽叶（跑动时像小天线一样可爱）
    m.paintEllipsoid(0, -0.3, 6.8, 2.3, 2.3, 0.95, mat('stem'), partId.stem, true);
    m.paintCapsule(0, -0.3, 7.0, 1.8, -1.6, 9.2, 0.85, 0.48, mat('stem'), partId.stem, true);
    m.paintCapsule(0, -0.3, 7.0, -1.8, 0.8, 8.8, 0.80, 0.45, mat('young'), partId.young, true);

    m.despeckle();
    m.applyArtShading(true);

    // 正面（+Y 侧）嵌一对纯黑小圆豆眼 + 亮白眼点（eyeGlint 严禁进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const eyeZ = 3;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.55);
      let sy = -1;
      for (let y = D - 1; y >= 1; y--) {
        if (m.getId(ex, y, eyeZ)) { sy = y; break; }
      }
      if (sy >= 0) {
        m.setRaw(ex, sy, eyeZ, keyToId.eyeDark, partId.eye);
        m.setRaw(ex, sy, eyeZ + 1, keyToId.eyeGlint, partId.eye);
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 9, centerZ: 4 });
  }

  function buildWalkerLeg(makeCanvas) {
    const m = new VoxelModel(4, 4, 4, SPEC);
    const { mat, partId } = SPEC;
    // 短胖肉质小腿（顶高 Z=3 深嵌入走果果腹内部 ≥ 55%，底面平稳踏地）
    m.paintCapsule(0, 0, 3.2, 0, 0.3, 0.6, 1.15, 0.92, mat('rib'), partId.rib, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 1.2, headZ: 3, centerZ: 1.5 });
  }

  // =========================================================================
  // 枝干与 4 个垂挂囊果的几何挂点配置（局部坐标系，主干中心为原点）
  // =========================================================================
  const BRANCH_CONFIGS = [
    { id: 'b0', assetKey: 'branchA', ang: 0.35, mountR: 1.6, lift: 16.0, pivot: BRANCH_A_PIVOT, tipLen: 16.2, tipZ: 10.2, crownOff: 12.2, crownLift: 23.6, phase: 0.0 },
    { id: 'b1', assetKey: 'branchB', ang: 2.45, mountR: 1.6, lift: 17.2, pivot: BRANCH_B_PIVOT, tipLen: 14.8, tipZ:  9.5, crownOff: 11.4, crownLift: 24.4, phase: 2.1 },
    { id: 'b2', assetKey: 'branchA', ang: 4.50, mountR: 1.6, lift: 16.4, pivot: BRANCH_A_PIVOT, tipLen: 16.2, tipZ: 10.2, crownOff: 12.2, crownLift: 23.8, phase: 4.2 }
  ];

  // 4 颗枝梢垂挂囊果（分布在 3 根粗枝外沿，果蒂嵌入叶冠下缘、饱满果腹清晰垂露）
  const POD_SLOTS_CFG = [
    { branchIdx: 0, along: 15.0, side: -3.4, zLift: 17.4 },
    { branchIdx: 0, along: 12.6, side:  5.2, zLift: 16.8 },
    { branchIdx: 1, along: 14.2, side:  3.8, zLift: 18.2 },
    { branchIdx: 2, along: 14.8, side: -3.8, zLift: 17.6 }
  ];

  // 走果 4 条迷你短腿局部偏移与对角步态相序（占空比 0.65，紧收果腹正下重叠 ≥ 60%）
  const WALKER_LEGS_CFG = [
    { lx: -1.8, ly:  1.6, phaseOff: 0.00 }, // 左前
    { lx:  1.8, ly:  1.6, phaseOff: 0.50 }, // 右前
    { lx: -1.8, ly: -1.6, phaseOff: 0.50 }, // 左后
    { lx:  1.8, ly: -1.6, phaseOff: 0.00 }  // 右后
  ];

  // =========================================================================
  // Def 注册对象
  // =========================================================================
  const Tree2Def = {
    id: 'tree2_waqwaq',
    code: '树2',
    name: '树2 · 走果巨树',
    status: 'done',
    tag: 'M10 扎根固定本体 + 派生独立走果子实体',
    summary: 'v3 精制：盘错粗根座 + 苍劲扭曲主干 + 3 根低频弹簧粗枝 + 分层茂密叶冠 + 4 颗枝梢垂挂肉质囊果（青涩/熟透两档）+ 3 槽独立走果对象池（枝头蠕动→落体发声→四足绕根爬走→钻土回收复位）',
    defaultHabitat: 'canopy',
    footRadius: 15.0,
    ecoWeight: 2.2,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '盘错粗根座与扭曲主干', '3 根弹簧微摆粗枝', '分层茂密叶冠',
      '4 颗双态垂挂囊果', '3 槽走果对象池状态机', '四足绕根避障爬行与钻土'
    ],
    soulHabit: '古树扎根微摆，枝梢熟透的肉质囊果剧烈蠕动后脱离枝头砸地发出清晰声波环纹，随即长出四条小短腿摇晃绕根爬远、扭动钻入地底，空出的枝梢再冒出新青果慢慢长大',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        rootBase:      buildRootBase(makeCanvas),
        trunkMain:     buildTrunkMain(makeCanvas),
        branchA:       buildBranch(makeCanvas, 'A'),
        branchB:       buildBranch(makeCanvas, 'B'),
        canopyCluster: buildCanopyCluster(makeCanvas),
        canopyMid:     buildCanopyMid(makeCanvas),
        canopyTop:     buildCanopyTop(makeCanvas),
        podYoung:      buildPodYoung(makeCanvas),
        podRipe:       buildPodRipe(makeCanvas),
        walkerBody:    buildWalkerBody(makeCanvas),
        walkerLeg:     buildWalkerLeg(makeCanvas)
      };

      // 3 根粗枝低频阻尼谐振弹簧 + 中顶叶冠滞后风摆弹簧
      const branchSprings = BRANCH_CONFIGS.map(() => new SpringDamper1D(0, 26, 3.6));
      const crownMidSpring = new SpringDamper1D(0, 18, 3.2);
      const crownTopSpring = new SpringDamper1D(0, 14, 2.8);

      // 4 个枝梢挂果槽状态
      // status: 'ripe' | 'shaking' | 'empty' | 'young'
      const podSlots = POD_SLOTS_CFG.map((cfg, idx) => ({
        idx,
        cfg,
        status: idx === 3 ? 'young' : 'ripe',
        timer: idx === 3 ? 1.8 : 0,
        shakePhase: 0,
        wx: 0,
        wy: 0,
        wz: cfg.zLift
      }));

      // 3 槽独立走果子实体对象池（防卡死硬超时状态机）
      // stage: 'dormant' | 'falling' | 'impact' | 'crawling' | 'burrowing'
      const WALKER_POOL_SIZE = 3;
      const walkers = Array.from({ length: WALKER_POOL_SIZE }, (_, idx) => ({
        idx,
        stage: 'dormant',
        stageTimer: 0,
        maxDur: 0,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: 0,
        targetX: 0,
        targetY: 0,
        gaitPhase: idx * 0.33,
        wobbleSpring: new SpringDamper1D(0, 110, 6.2),
        burrowDepth: 0,
        opacity: 1.0,
        dustClock: 0
      }));

      const homeX0 = opts.homeX ?? 0;
      const homeY0 = opts.homeY ?? 0;
      const homeYaw0 = opts.homeYaw ?? 0;

      const state = {
        x: homeX0,
        y: homeY0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: homeYaw0,
        dropCooldown: 1.4,
        dropCursor: 0,
        seed: opts.seed ?? 29
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function computeBranchAndPodSockets(time, sMul) {
        const yw = state.yaw;
        for (let i = 0; i < BRANCH_CONFIGS.length; i++) {
          const bc = BRANCH_CONFIGS[i];
          const sway = clamp(branchSprings[i].x, -0.22, 0.22);
          const bYaw = wrapAngle(yw + bc.ang + sway);
          const [mx, my] = localToWorldXY(state.x, state.y, yw, Math.cos(bc.ang) * bc.mountR * sMul, Math.sin(bc.ang) * bc.mountR * sMul);
          // 枝条局部坐标正面朝 +Y，bYaw - PI/2 使 +Y 对准径向角 bYaw
          const partYaw = wrapAngle(bYaw - Math.PI * 0.5);
          sockets.setWorld(bc.id, mx, my, bc.lift * sMul, partYaw);
        }

        for (let i = 0; i < podSlots.length; i++) {
          const ps = podSlots[i];
          const bc = BRANCH_CONFIGS[ps.cfg.branchIdx];
          const bSock = sockets.get(bc.id);
          const [px, py] = localToWorldXY(bSock.x, bSock.y, bSock.yaw, ps.cfg.side * sMul, ps.cfg.along * sMul);
          ps.wx = px;
          ps.wy = py;
          ps.wz = ps.cfg.zLift * sMul;
        }
      }

      function emitLeaves(vfx, wx, wy, wz, count, sMul, power) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let k = 0; k < count; k++) {
          const a = (k / Math.max(1, count)) * TAU + Math.random() * 0.6;
          const spd = (5.0 + Math.random() * 9.5) * power * sMul;
          vfx.spawnParticle(
            wx + (Math.random() - 0.5) * 4.0 * sMul,
            wy + (Math.random() - 0.5) * 4.0 * sMul,
            wz + (Math.random() - 0.5) * 2.0 * sMul,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            (4.0 + Math.random() * 6.5) * power * sMul,
            0.65 + Math.random() * 0.45,
            1.3 + Math.random() * 0.5,
            k % 2 === 0 ? fx.leafA : fx.leafB,
            false,
            15
          );
        }
      }

      function emitImpactSoundAndBurst(vfx, habitat, wx, wy, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        // 双圈清晰扩大的果鸣声波环纹
        vfx.addRipple(wx, wy, 2.2 * sMul, 16.5 * sMul, 0.72, 2.1);
        vfx.addRipple(wx, wy, 1.4 * sMul, 11.2 * sMul, 0.52, 1.5);
        // 砸地碎叶与果屑粒子
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU + Math.random() * 0.4;
          const spd = (7.5 + Math.random() * 10.0) * sMul;
          vfx.spawnParticle(
            wx, wy, 1.4 * sMul,
            Math.cos(a) * spd, Math.sin(a) * spd, (6.5 + Math.random() * 8.0) * sMul,
            0.48 + Math.random() * 0.28,
            1.35 + Math.random() * 0.5,
            k % 3 === 0 ? fx.fruit : (k % 2 === 0 ? fx.leafA : fx.ring),
            false,
            26
          );
        }
        if (habitat) EnvFeedback.emitFootstep(vfx, habitat, wx, wy, 0.85 * sMul);
      }

      function emitBurrowDirt(vfx, wx, wy, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let k = 0; k < 5; k++) {
          const a = Math.random() * TAU;
          const spd = (4.5 + Math.random() * 6.5) * sMul;
          vfx.spawnParticle(
            wx + (Math.random() - 0.5) * 2.5 * sMul,
            wy + (Math.random() - 0.5) * 2.5 * sMul,
            1.0 * sMul,
            Math.cos(a) * spd, Math.sin(a) * spd, (5.5 + Math.random() * 6.5) * sMul,
            0.42 + Math.random() * 0.24,
            1.4 + Math.random() * 0.5,
            k % 2 === 0 ? fx.dirt : fx.leafA,
            false,
            28
          );
        }
      }

      function spawnWalkerFromPod(ps, sMul, eco) {
        const slot = walkers.find(w => w.stage === 'dormant');
        if (!slot) return false;

        // 确定落点（略微沿枝梢径向外抛，确保落在根座外缘不砸进树干）
        const dx = ps.wx - state.x;
        const dy = ps.wy - state.y;
        const d = Math.hypot(dx, dy) || 1;
        const ux = dx / d;
        const uy = dy / d;

        slot.stage = 'falling';
        slot.stageTimer = 0;
        slot.maxDur = 1.6;
        slot.x = ps.wx;
        slot.y = ps.wy;
        slot.z = ps.wz;
        slot.vx = ux * 3.8 * sMul;
        slot.vy = uy * 3.8 * sMul;
        slot.vz = 1.5 * sMul;
        slot.yaw = Math.atan2(-ux, uy);
        slot.burrowDepth = 0;
        slot.opacity = 1.0;
        slot.dustClock = 0;
        slot.wobbleSpring.x = 0;
        slot.wobbleSpring.v = 0;

        // 挑选钻土终点：在树周外圈安全半径（26~38 格）且偏转一定角度绕根爬行
        const maxR = Math.min((eco && eco.maxRadius) ? eco.maxRadius - 4 : 42, 40) * sMul;
        const minR = 25.0 * sMul;
        const baseAng = Math.atan2(uy, ux);
        const sideSign = ((state.dropCursor + slot.idx) % 2 === 0) ? 1 : -1;
        const turnOff = sideSign * lerp(0.55, 1.35, hash2i(state.dropCursor, slot.idx + 7, state.seed));
        const destAng = baseAng + turnOff;
        const destR = lerp(minR, Math.max(minR + 3, maxR), hash2i(state.dropCursor + 3, slot.idx + 19, state.seed));
        slot.targetX = state.x + Math.cos(destAng) * destR;
        slot.targetY = state.y + Math.sin(destAng) * destR;

        // 粗枝脱果后向上弹回一下，激发自然微颤
        branchSprings[ps.cfg.branchIdx].impulse((ps.idx % 2 === 0 ? 1 : -1) * 0.72);
        return true;
      }

      const instance = {
        def: Tree2Def,
        cachePrefix: `tree2_wq_${Math.random().toString(36).slice(2, 7)}`,
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
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.dropCooldown = 0.6;
          state.dropCursor = 0;

          for (const sp of branchSprings) { sp.x = 0; sp.v = 0; }
          crownMidSpring.x = crownMidSpring.v = 0;
          crownTopSpring.x = crownTopSpring.v = 0;

          for (let i = 0; i < podSlots.length; i++) {
            podSlots[i].status = i === 3 ? 'young' : 'ripe';
            podSlots[i].timer = i === 3 ? 2.0 : 0;
            podSlots[i].shakePhase = 0;
          }

          for (const w of walkers) {
            w.stage = 'dormant';
            w.stageTimer = 0;
            w.burrowDepth = 0;
            w.opacity = 1.0;
            w.wobbleSpring.x = w.wobbleSpring.v = 0;
          }

          computeBranchAndPodSockets(0, sMul);

          // 开场直接让 1 只走果已在树下开心爬行，让预览台首帧即可观赏本体 + 派生子实体生态
          const w0 = walkers[0];
          const startAng = homeYaw + 0.85;
          w0.stage = 'crawling';
          w0.stageTimer = 0;
          w0.maxDur = 5.4;
          w0.x = homeX + Math.cos(startAng) * 19.5 * sMul;
          w0.y = homeY + Math.sin(startAng) * 19.5 * sMul;
          w0.z = 0;
          w0.yaw = Math.atan2(-Math.cos(startAng + 0.5), Math.sin(startAng + 0.5));
          w0.targetX = homeX + Math.cos(startAng + 1.05) * 32.0 * sMul;
          w0.targetY = homeY + Math.sin(startAng + 1.05) * 32.0 * sMul;
          w0.burrowDepth = 0;
          w0.opacity = 1.0;

          // 同时让 0 号枝果立即进入熟透摇晃阶段，1 秒多后即可看到脱落砸地全过程
          podSlots[0].status = 'shaking';
          podSlots[0].timer = 1.35;
          podSlots[0].shakePhase = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));

          // 同时兼容 eco.action === 'idle' 与 eco.patrol === false
          const isIdle = !!(eco && (eco.action === 'idle' || eco.patrol === false));
          const pace = isIdle ? 0.78 : 1.18;
          const maxActiveWalkers = isIdle ? 1 : 2;

          // 1. 主体永久扎根原地（使用内核 Propulsion.rooted + 极轻柔树身低频呼吸微摆）
          Propulsion.rooted(state, dt, time * 0.45, params, {
            ...(eco || {}),
            homeX: (eco && eco.homeX !== undefined) ? eco.homeX : homeX0,
            homeY: (eco && eco.homeY !== undefined) ? eco.homeY : homeY0,
            homeYaw: (eco && eco.homeYaw !== undefined) ? eco.homeYaw : homeYaw0,
            baseLift: 0
          });
          // 压低根部转角幅度，保证盘错粗根座稳重抓地不漂移
          const baseYaw = (eco && eco.homeYaw !== undefined) ? eco.homeYaw : homeYaw0;
          state.yaw = baseYaw + Math.sin(time * 0.65) * 0.022 * flex;

          // 2. 粗枝与分层叶冠的低频风摆谐振弹簧更新
          const windBase = (fbm1(time * 0.32 * spdMul, state.seed) - 0.5) * 0.14 * flex;
          for (let i = 0; i < BRANCH_CONFIGS.length; i++) {
            const bc = BRANCH_CONFIGS[i];
            const bWind = windBase + Math.sin(time * 1.15 * gFreq + bc.phase) * 0.055 * flex;
            branchSprings[i].update(dt, bWind, 26 * sp, clamp(3.6 * dScale, 2.0, 6.5));
          }
          const avgBranch = (branchSprings[0].x + branchSprings[1].x + branchSprings[2].x) / 3;
          crownMidSpring.update(dt, avgBranch * 1.25 + windBase * 0.85, 18 * sp, clamp(3.2 * dScale, 1.8, 5.8));
          crownTopSpring.update(dt, crownMidSpring.x * 1.35 + Math.sin(time * 0.9 - 0.8) * 0.045 * flex, 14 * sp, clamp(2.8 * dScale, 1.6, 5.2));

          // 更新枝干与 4 颗垂挂囊果的实时世界挂点
          computeBranchAndPodSockets(time, sMul);

          // 3. 枝梢 4 颗囊果的生长与熟透脱落调度
          let activeWalkerCount = 0;
          for (const w of walkers) {
            if (w.stage !== 'dormant') activeWalkerCount++;
          }
          const shakingCount = podSlots.filter(p => p.status === 'shaking').length;

          state.dropCooldown -= dt * pace * spdMul;
          if (state.dropCooldown <= 0 && (activeWalkerCount + shakingCount) < maxActiveWalkers) {
            // 按轮转顺序挑选一颗熟透囊果开始剧烈蠕动摇晃
            let picked = null;
            for (let k = 0; k < podSlots.length; k++) {
              const cand = podSlots[(state.dropCursor + k) % podSlots.length];
              if (cand.status === 'ripe') {
                picked = cand;
                state.dropCursor = (cand.idx + 1) % podSlots.length;
                break;
              }
            }
            if (picked) {
              picked.status = 'shaking';
              picked.timer = isIdle ? 1.85 : 1.35;
              picked.shakePhase = 0;
              state.dropCooldown = isIdle ? 3.2 : 1.7;
            } else {
              state.dropCooldown = 0.6;
            }
          }

          for (const ps of podSlots) {
            if (ps.status === 'shaking') {
              ps.shakePhase += dt * 22.0 * gFreq;
              ps.timer -= dt * spdMul;
              // 蠕动摇晃时拉动所属粗枝微微颤动
              branchSprings[ps.cfg.branchIdx].impulse(Math.sin(ps.shakePhase) * 0.08 * dt * 60);
              if (ps.timer <= 0) {
                const spawned = spawnWalkerFromPod(ps, sMul, eco);
                if (spawned) {
                  ps.status = 'empty';
                  ps.timer = isIdle ? 2.4 : 1.6;
                  emitLeaves(vfx, ps.wx, ps.wy, ps.wz + 2.0 * sMul, 4, sMul, 0.75);
                } else {
                  // 若对象池暂满，安全退回熟透等待而不卡死
                  ps.status = 'ripe';
                  ps.timer = 0;
                }
              }
            } else if (ps.status === 'empty') {
              ps.timer -= dt * pace * spdMul;
              if (ps.timer <= 0) {
                ps.status = 'young';
                ps.timer = isIdle ? 3.2 : 2.2;
              }
            } else if (ps.status === 'young') {
              ps.timer -= dt * pace * spdMul;
              if (ps.timer <= 0) {
                ps.status = 'ripe';
                ps.timer = 0;
              }
            }
          }

          // 4. 更新 3 槽独立走果小实体生命周期（落体 → 砸地发声 → 绕根避障爬行 → 钻土回收）
          const contacts = [];
          const rootAvoidR = 16.5 * sMul;
          const walkSpeed = (isIdle ? 9.6 : 12.8) * spdMul * sMul;

          for (const w of walkers) {
            if (w.stage === 'dormant') continue;
            w.stageTimer += dt;
            w.wobbleSpring.update(dt, 0, 110 * sp, clamp(6.2 * dScale, 3.0, 10.5));

            if (w.stage === 'falling') {
              w.vz -= 58.0 * sMul * dt;
              w.x += w.vx * dt;
              w.y += w.vy * dt;
              w.z += w.vz * dt;
              w.yaw = wrapAngle(w.yaw + dt * 2.4);

              // 确保落点不被拉进主根中心内部
              const rdx = w.x - state.x, rdy = w.y - state.y;
              const rd = Math.hypot(rdx, rdy) || 0.01;
              if (rd < rootAvoidR) {
                w.x = state.x + (rdx / rd) * rootAvoidR;
                w.y = state.y + (rdy / rd) * rootAvoidR;
              }

              if (w.z <= 0 || w.stageTimer >= w.maxDur) {
                w.z = 0;
                w.vx = 0;
                w.vy = 0;
                w.vz = 0;
                w.stage = 'impact';
                w.stageTimer = 0;
                w.maxDur = 0.42;
                w.wobbleSpring.impulse(12.0 * sp);
                emitImpactSoundAndBurst(vfx, habitat, w.x, w.y, sMul);
              }
            } else if (w.stage === 'impact') {
              w.z = 0;
              if (w.stageTimer >= w.maxDur) {
                w.stage = 'crawling';
                w.stageTimer = 0;
                w.maxDur = isIdle ? 5.6 : 4.6;
              }
            } else if (w.stage === 'crawling') {
              const dx = w.targetX - w.x;
              const dy = w.targetY - w.y;
              const dist = Math.hypot(dx, dy);

              // 目标导向向量 + 树根避障切向绕行力
              let steerX = dist > 0.01 ? dx / dist : 0;
              let steerY = dist > 0.01 ? dy / dist : 0;

              const rdx = w.x - state.x, rdy = w.y - state.y;
              const rd = Math.hypot(rdx, rdy) || 0.01;
              if (rd < rootAvoidR + 3.0 * sMul) {
                const push = smoothstep(rootAvoidR + 3.0 * sMul, rootAvoidR - 1.5 * sMul, rd);
                const nx = rdx / rd, ny = rdy / rd;
                // 径向推离 + 切向绕行，自然绕着粗树根走开
                const tangSign = (w.idx % 2 === 0) ? 1 : -1;
                steerX += (nx * 1.6 - ny * tangSign * 0.9) * push;
                steerY += (ny * 1.6 + nx * tangSign * 0.9) * push;
              }

              const desiredYaw = Math.atan2(-steerX, steerY);
              const yawDiff = wrapAngle(desiredYaw - w.yaw);
              const maxTurn = 4.2 * (0.7 + spdMul * 0.3);
              w.yaw = wrapAngle(w.yaw + clamp(yawDiff, -maxTurn * dt, maxTurn * dt));

              // 带可爱左右摇晃步频的前进速度
              w.gaitPhase = (w.gaitPhase + dt * 3.1 * gFreq * spdMul) % 1;
              const pulse = 0.78 + 0.28 * Math.abs(Math.sin(w.gaitPhase * TAU));
              const align = smoothstep(-0.3, 0.8, Math.cos(yawDiff));
              const fwdX = -Math.sin(w.yaw), fwdY = Math.cos(w.yaw);
              const spd = walkSpeed * align * pulse;

              w.vx = lerp(w.vx, fwdX * spd, expSmooth(dt, 9.0));
              w.vy = lerp(w.vy, fwdY * spd, expSmooth(dt, 9.0));
              w.x += w.vx * dt;
              w.y += w.vy * dt;

              // 硬半径钳位：不穿进根座核心，也不跑出地台
              const ndx = w.x - state.x, ndy = w.y - state.y;
              const nd = Math.hypot(ndx, ndy) || 0.01;
              if (nd < rootAvoidR) {
                w.x = state.x + (ndx / nd) * rootAvoidR;
                w.y = state.y + (ndy / nd) * rootAvoidR;
              }
              const maxR = ((eco && eco.maxRadius) ? eco.maxRadius - 2 : 44) * sMul;
              const fromOrigin = Math.hypot(w.x, w.y);
              if (fromOrigin > maxR) {
                w.x *= maxR / fromOrigin;
                w.y *= maxR / fromOrigin;
              }

              // 偶发小扬尘
              w.dustClock += dt;
              if (w.dustClock > 0.45 && vfx && habitat) {
                w.dustClock = 0;
                EnvFeedback.emitFootstep(vfx, habitat, w.x, w.y, 0.38 * sMul);
              }

              if (dist < 2.8 * sMul || w.stageTimer >= w.maxDur) {
                w.stage = 'burrowing';
                w.stageTimer = 0;
                w.maxDur = 1.35;
                w.vx = 0;
                w.vy = 0;
                w.dustClock = 0;
                emitBurrowDirt(vfx, w.x, w.y, sMul);
                if (vfx) vfx.addRipple(w.x, w.y, 1.5 * sMul, 8.5 * sMul, 0.55, 1.4);
              }
            } else if (w.stage === 'burrowing') {
              const u = clamp(w.stageTimer / w.maxDur, 0, 1);
              w.burrowDepth = smoothstep(0.08, 1.0, u);
              w.opacity = clamp(1.0 - smoothstep(0.62, 1.0, u), 0.12, 1.0);
              // 钻土时高频左右扭动
              w.yaw = wrapAngle(w.yaw + Math.sin(w.stageTimer * 24.0) * 5.2 * dt);
              w.dustClock += dt;
              if (w.dustClock > 0.28) {
                w.dustClock = 0;
                emitBurrowDirt(vfx, w.x, w.y, sMul);
              }
              if (w.stageTimer >= w.maxDur) {
                w.stage = 'dormant';
                w.stageTimer = 0;
                w.burrowDepth = 0;
                w.opacity = 1.0;
              }
            }

            if (w.stage !== 'dormant' && w.burrowDepth < 0.75) {
              contacts.push({ x: w.x, y: w.y, z: w.z, r: 3.6 * sMul });
            }
          }

          instance.footContacts = contacts;
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const isWater = !!(habitat && habitat.isWater);
          const waterLevel = habitat ? (habitat.waterLevel ?? -99) : -99;
          const calcSub = (z) => EnvFeedback.calcSubmerge(z, waterLevel, 5.0, isWater);

          // 1. 盘错粗根座（扎根于 Z=0，bias=-0.60）
          list.push({
            partKey: 'rootBase',
            asset: parts.rootBase,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            submerge: calcSub(2.5 * sMul),
            bias: -0.60
          });

          // 2. 苍劲扭曲主干（底端嵌入根座 5.5 格，重叠率 55%）
          const trunkLift = 4.0 * sMul;
          list.push({
            partKey: 'trunkMain',
            asset: parts.trunkMain,
            x: state.x,
            y: state.y,
            lift: trunkLift,
            ro: yw,
            submerge: calcSub(trunkLift + 4.0 * sMul),
            bias: -0.10
          });

          // 3. 3 根可微摆弹簧粗枝 + 3 团下层枝梢叶冠
          for (let i = 0; i < BRANCH_CONFIGS.length; i++) {
            const bc = BRANCH_CONFIGS[i];
            const bSock = sockets.get(bc.id);
            const [bx, by] = pivotToWorldXY(bSock.x, bSock.y, bSock.yaw, bc.pivot.x * sMul, bc.pivot.y * sMul);
            const bLift = bc.lift * sMul;

            list.push({
              partKey: bc.assetKey,
              asset: parts[bc.assetKey],
              x: bx,
              y: by,
              lift: bLift,
              ro: bSock.yaw,
              submerge: calcSub(bLift + 4.0 * sMul),
              bias: 0.08
            });

            // 挂在粗枝中远端的饱满叶冠团（包裹枝梢顶端重叠 ≥ 50%）
            const [cx, cy] = localToWorldXY(bSock.x, bSock.y, bSock.yaw, 0, bc.crownOff * sMul);
            const cLift = bc.crownLift * sMul;
            list.push({
              partKey: 'canopyCluster',
              asset: parts.canopyCluster,
              x: cx,
              y: cy,
              lift: cLift,
              ro: wrapAngle(bSock.yaw + i * 1.15),
              submerge: calcSub(cLift + 4.0 * sMul),
              bias: 1.80
            });
          }

          // 4. 中层主叶冠 + 顶层冠蓬（带父子相位滞后风摆）
          const midSway = clamp(crownMidSpring.x, -0.18, 0.18);
          const topSway = clamp(crownTopSpring.x, -0.24, 0.24);
          const [midX, midY] = localToWorldXY(state.x, state.y, yw, midSway * 5.0 * sMul, midSway * 2.5 * sMul);
          const [topX, topY] = localToWorldXY(state.x, state.y, yw, topSway * 8.5 * sMul, topSway * 4.0 * sMul);

          list.push({
            partKey: 'canopyMid',
            asset: parts.canopyMid,
            x: midX,
            y: midY,
            lift: 26.5 * sMul,
            ro: wrapAngle(yw + midSway * 0.45),
            submerge: calcSub(30.0 * sMul),
            bias: 2.60
          });

          list.push({
            partKey: 'canopyTop',
            asset: parts.canopyTop,
            x: topX,
            y: topY,
            lift: 33.5 * sMul,
            ro: wrapAngle(yw + topSway * 0.65),
            submerge: calcSub(36.0 * sMul),
            bias: 3.20
          });

          // 5. 枝梢垂挂 4 颗肉质囊果（青涩小果 / 熟透鼓胀两档，摇晃时剧烈蠕动）
          for (let i = 0; i < podSlots.length; i++) {
            const ps = podSlots[i];
            if (ps.status === 'empty') continue;

            const isYoung = ps.status === 'young';
            const isShaking = ps.status === 'shaking';
            const bc = BRANCH_CONFIGS[ps.cfg.branchIdx];
            const bSock = sockets.get(bc.id);

            let offX = 0;
            let offY = 0;
            let liftMod = 0;
            let podYaw = wrapAngle(bSock.yaw + i * 0.7);

            if (isShaking) {
              // 枝头剧烈左右蠕动摇晃 + 轻微上下绷紧拉扯
              const wob = Math.sin(ps.shakePhase);
              const [sx, sy] = localToWorldXY(0, 0, bSock.yaw, wob * 1.45 * sMul, 0);
              offX = sx;
              offY = sy;
              liftMod = Math.abs(Math.cos(ps.shakePhase * 0.5)) * 0.85 * sMul;
              podYaw = wrapAngle(podYaw + wob * 0.55);
            } else if (isYoung) {
              // 新生小青果从枝梢叶蒂处缓缓垂出（零小数缩放）
              const growU = clamp(1 - ps.timer / 2.6, 0, 1);
              liftMod = lerp(1.6, 0.0, growU) * sMul;
            }

            list.push({
              partKey: isYoung ? 'podYoung' : 'podRipe',
              asset: isYoung ? parts.podYoung : parts.podRipe,
              x: ps.wx + offX,
              y: ps.wy + offY,
              lift: Math.max(0, ps.wz + liftMod),
              ro: podYaw,
              submerge: calcSub(ps.wz + 2.0 * sMul),
              bias: 1.25
            });
          }

          // 6. 独立走果小实体池（落体形态 → 落地长出 4 条迷你小短腿摇晃爬行 → 扭动钻土）
          for (let i = 0; i < walkers.length; i++) {
            const w = walkers[i];
            if (w.stage === 'dormant') continue;

            if (w.stage === 'falling') {
              // 自由落体空中仍为熟透肉质果囊形态
              list.push({
                partKey: 'podRipe',
                asset: parts.podRipe,
                x: w.x,
                y: w.y,
                lift: Math.max(0, w.z),
                ro: w.yaw,
                submerge: calcSub(w.z + 2.0 * sMul),
                bias: 1.10
              });
              continue;
            }

            // 落地后切换为带 4 条迷你短腿的「走果形态」
            const wob = clamp(w.wobbleSpring.x * 0.04, -0.35, 0.35);
            const strideSway = w.stage === 'crawling' ? Math.sin(w.gaitPhase * TAU) * 0.16 : 0;
            const bodyYaw = wrapAngle(w.yaw + wob + strideSway);
            const stepBob = w.stage === 'crawling' ? Math.abs(Math.sin(w.gaitPhase * TAU)) * 0.50 * sMul : 0;
            const impactSquash = w.stage === 'impact' ? -Math.sin(clamp(w.stageTimer / w.maxDur, 0, 1) * Math.PI) * 0.70 * sMul : 0;
            const burrowSink = w.burrowDepth * 7.8 * sMul;

            // 4 条迷你短腿（占空比 0.65 四足对角小跑，钻土深度 > 0.45 时随身隐入土中）
            if (w.burrowDepth < 0.48) {
              const swingFrac = 0.35;
              for (let li = 0; li < WALKER_LEGS_CFG.length; li++) {
                const lc = WALKER_LEGS_CFG[li];
                let strideFwd = 0;
                let footLift = 0;
                if (w.stage === 'crawling') {
                  const phi = (w.gaitPhase + lc.phaseOff) % 1;
                  if (phi < swingFrac) {
                    const u = phi / swingFrac;
                    strideFwd = lerp(-0.85, 0.85, u * u * (3 - 2 * u));
                    footLift = Math.sin(u * Math.PI) * 1.05 * sMul;
                  } else {
                    const u = (phi - swingFrac) / (1 - swingFrac);
                    strideFwd = lerp(0.85, -0.85, u);
                    footLift = 0;
                  }
                }
                const [lx, ly] = localToWorldXY(w.x, w.y, bodyYaw, lc.lx * sMul, (lc.ly + strideFwd) * sMul);
                list.push({
                  partKey: 'walkerLeg',
                  asset: parts.walkerLeg,
                  x: lx,
                  y: ly,
                  lift: Math.max(0, footLift - burrowSink * 0.5),
                  ro: bodyYaw,
                  opacity: w.opacity,
                  submerge: calcSub(footLift + 1.0 * sMul),
                  bias: 0.05,
                  symDeg: 90
                });
              }
            }

            // 走果肉质果囊身躯（底部 Z=1.8 稳稳包裹 4 条短腿顶端 Z=3.2，重叠率 ≥ 60%）
            const bodyLift = Math.max(0, 1.8 * sMul + stepBob + impactSquash - burrowSink);
            list.push({
              partKey: 'walkerBody',
              asset: parts.walkerBody,
              x: w.x,
              y: w.y,
              lift: bodyLift,
              ro: bodyYaw,
              opacity: w.opacity,
              submerge: calcSub(bodyLift + 2.0 * sMul),
              bias: 0.35
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Tree2Def.id,
            code: Tree2Def.code,
            name: Tree2Def.name,
            status: Tree2Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            footRadius: Tree2Def.footRadius,
            headZ: 44,
            centerZ: 20,
            blocks: Tree2Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Tree2Def);
})(window.PixelWorkshop);
