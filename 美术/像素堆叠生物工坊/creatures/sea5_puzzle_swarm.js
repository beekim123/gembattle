'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 海5 · 退潮散开、涨潮合成一只的（M31 散开 / 合体标杆 · v3 精制）
  //
  // 【前置调研与三维坐标预算记录】
  // 1. 生物原型与运动学设计：
  //    - 潮汐滩涂群居拼图甲壳：退潮时 5 只巴掌大的五色拼图小甲壳在浅水滩涂四散碎步觅食，
  //      每只背上顶着 1 块 72° 扇形凹凸卡榫硬壳（左侧凸圆榫、右侧匹配凹槽），底下 4 条深色短足；
  //    - 涨潮浪环涌来时 5 只从四面八方高速冲向汇合中心，各自旋正至 72° 对应槽位，在 0.2s 内
  //      咔咔弹性扣合（1.08 -> 1.0，其余常态严禁拉伸）成一只直径 ~42 格的圆滚 20 足五色大甲壳，
  //      四周齐刷刷伸出 20 条短粗深色步足呈环形波浪抓地扛住潮浪；潮退时整圆微震咔哒弹散。
  // 2. 三维几何坐标预算表（总色表 30 色 <= 48、0 重色、0 禁用字）：
  //    - piece0..4（5 块 72° 旋转对称凹凸卡榫拼图甲片，同造型按 5 色槽着色）：24×22×10，
  //      圆心枢轴 (0, -8.0)，外弧半径 R = 17.4 格，左凸榫 + 右凹槽严格 72° 旋转互补；
  //    - leg（共享短粗深色步足件，5 只 × 4 条 = 20 条全部复用）：5×8×6，左右对称自动减半烘焙。
  // 3. 性能与约束守则：
  //    - 所有子体与合体坐标严格钳制在 maxRadius * 0.80 内；
  //    - 仅合体扣合 0.20s 内使用弹性缩放 1.08 -> 1.0，常态全程 1:1 像素无损绘制；
  //    - glowKeys 为空，eyeGlint 绝不进自亮；3 套五色拼图皮肤零重建模换色。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 0 号拼图甲片：珊瑚红
      p0Dark:   '#8f2024',
      p0Mid:    '#e0433e',
      p0Hi:     '#ff8c7a',
      // 1 号拼图甲片：明琥珀黄
      p1Dark:   '#a86810',
      p1Mid:    '#f2b022',
      p1Hi:     '#ffe36e',
      // 2 号拼图甲片：海松青
      p2Dark:   '#136158',
      p2Mid:    '#22a896',
      p2Hi:     '#6be3cc',
      // 3 号拼图甲片：深靛蓝
      p3Dark:   '#1a2b69',
      p3Mid:    '#3254b5',
      p3Hi:     '#7096ed',
      // 4 号拼图甲片：象牙白
      p4Dark:   '#9c9484',
      p4Mid:    '#ded7c5',
      p4Hi:     '#faf6ec',
      // 拼图甲片暗色镶边与卡榫边棱（强化 5 色拼缝对比）
      rimDark:  '#241d29',
      rimMid:   '#463b4d',
      rimHi:    '#75697d',
      // 腹底暗甲壳与软膜
      underDark:'#191d26',
      underMid: '#2e3545',
      underHi:  '#4b556b',
      // 20 条短粗深色步足
      legDark:  '#12161f',
      legMid:   '#272f3d',
      legHi:    '#485369',
      // 抓泥爪尖与背甲骨铆点缀
      clawDark: '#6b5e50',
      clawMid:  '#a3927d',
      clawHi:   '#d9cab2',
      // 锐利小眼（eyeGlint 严禁进 glowKeys）
      eyeDark:  '#080b10',
      eyeIris:  '#223447',
      eyeGlint: '#f0f8ff'
    },
    glowKeys: [],
    parts: [
      'p0', 'p1', 'p2', 'p3', 'p4',
      'rim', 'under', 'leg', 'claw', 'eye'
    ],
    noCrease: [
      ['p0', 'rim'], ['p1', 'rim'], ['p2', 'rim'], ['p3', 'rim'], ['p4', 'rim'],
      ['p0', 'claw'], ['p1', 'claw'], ['p2', 'claw'], ['p3', 'claw'], ['p4', 'claw'],
      ['rim', 'eye'], ['under', 'eye'], ['leg', 'claw']
    ],
    materials: {
      p0:    ['p0Dark',    'p0Mid',    'p0Hi'],
      p1:    ['p1Dark',    'p1Mid',    'p1Hi'],
      p2:    ['p2Dark',    'p2Mid',    'p2Hi'],
      p3:    ['p3Dark',    'p3Mid',    'p3Hi'],
      p4:    ['p4Dark',    'p4Mid',    'p4Hi'],
      rim:   ['rimDark',   'rimMid',   'rimHi'],
      under: ['underDark', 'underMid', 'underHi'],
      leg:   ['legDark',   'legMid',   'legHi'],
      claw:  ['clawDark',  'clawMid',  'clawHi']
    },
    protectedParts: ['eye']
  });

  // 3 套高辨识五色拼图皮肤（每套 30 色严格 0 重色、0 禁用字）
  const SKINS = [
    {
      id: 'coral_reef',
      name: '珊瑚五彩礁',
      dot: '#e0433e',
      outline: '#10141c',
      pal: {},
      fx: {
        foamA: '#f2fbff',
        foamB: '#9ed9e8',
        sandA: '#d4c39e',
        sandB: '#a6926f'
      }
    },
    {
      id: 'autumn_sand',
      name: '秋砂暖拼',
      dot: '#d96b27',
      outline: '#1a120d',
      pal: {
        // 朱陶红
        p0Dark: '#82231c', p0Mid: '#c9412e', p0Hi: '#f57f62',
        // 枫糖橙
        p1Dark: '#a34a12', p1Mid: '#e87924', p1Hi: '#ffba66',
        // 焦麦黄
        p2Dark: '#9e7d19', p2Mid: '#e0b838', p2Hi: '#fae382',
        // 苔橄绿
        p3Dark: '#365424', p3Mid: '#638f3d', p3Hi: '#9ec96b',
        // 暖沙白
        p4Dark: '#998772', p4Mid: '#d9c8b0', p4Hi: '#f7eee0',
        rimDark: '#291e1a', rimMid: '#4d3b32', rimHi: '#7d6558'
      },
      fx: {
        foamA: '#fff8ed',
        foamB: '#e6c99e',
        sandA: '#d6b687',
        sandB: '#a38258'
      }
    },
    {
      id: 'deep_jade',
      name: '深海碧贝',
      dot: '#28998d',
      outline: '#0a141c',
      pal: {
        // 玫紫贝
        p0Dark: '#692259', p0Mid: '#ad3e8e', p0Hi: '#e882c8',
        // 碧湖青
        p1Dark: '#125e66', p1Mid: '#24a6ad', p1Hi: '#6ee6e6',
        // 孔雀蓝
        p2Dark: '#163870', p2Mid: '#2b67ba', p2Hi: '#6ba8f2',
        // 珍珠绿
        p3Dark: '#266b48', p3Mid: '#46ad76', p3Hi: '#8ce3b0',
        // 霜贝白
        p4Dark: '#879aa8', p4Mid: '#c6d8e3', p4Hi: '#eef7fc',
        rimDark: '#17202e', rimMid: '#314159', rimHi: '#596e8c'
      },
      fx: {
        foamA: '#edfaff',
        foamB: '#8fdce8',
        sandA: '#b8ced6',
        sandB: '#829ea8'
      }
    }
  ];

  // =========================================================================
  // 几何常量：5 块 72° 旋转对称拼图甲片（严格数学互补，扣合零错位）
  // =========================================================================
  const PIECE_COUNT = 5;
  const SECTOR_ANGLE = TAU / PIECE_COUNT;       // 72° = 1.2566 rad
  const HALF_SECTOR  = SECTOR_ANGLE * 0.5;      // 36° = 0.6283 rad
  const PIVOT_Y      = -8.0;                    // 扇片圆心在体素盒内的局部 Y
  const SHELL_R      = 17.4;                    // 合体大背壳外弧半径（整圆直径 34.8，含 20 足 ~42 格）
  const CENTROID_R   = 9.6;                     // 每块扇片质心距圆心距离
  const TAB_R        = 10.0;                    // 卡榫/凹槽沿半径的位置
  const TAB_OFF      = 1.55;                    // 卡榫圆心相对边界线的偏移
  const TAB_RAD      = 2.65;                    // 卡榫凸头半径

  // =========================================================================
  // 1. 拼图扇形甲片建模（24×22×10，5 色共用完全一致的 72° 互补卡榫几何）
  //    左边界 (-36°) 带圆头凸榫，右边界 (+36°) 带匹配凹槽；
  //    外弧缘暗色镶边 + 放射骨棱 + 中央扣心 + 前端双眼
  // =========================================================================
  function buildPuzzlePiece(makeCanvas, slotIdx) {
    const W = 24, D = 22, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const matKey = `p${slotIdx}`;
    const pMat = mat(matKey);
    const pPid = partId[matKey];

    // 预计算左边界凸榫与右边界凹槽在局部坐标的圆心位置
    // 角度约定：ang = Math.atan2(X, Y - PIVOT_Y)，+Y 为 0°，左(-X)为 -36°，右(+X)为 +36°
    const sinH = Math.sin(HALF_SECTOR);
    const cosH = Math.cos(HALF_SECTOR);
    // 左边界方向向量 (-sinH, cosH)，向外法向 (-cosH, -sinH)
    const tabCX = -TAB_R * sinH - TAB_OFF * cosH;
    const tabCY = PIVOT_Y + TAB_R * cosH - TAB_OFF * sinH;
    // 左边界颈部中点（平滑连通扇片与凸榫）
    const neckX = -TAB_R * sinH - 0.35 * cosH;
    const neckY = PIVOT_Y + TAB_R * cosH - 0.35 * sinH;

    // 右边界方向向量 (+sinH, cosH)，向内法向 (-cosH, +sinH)
    // 将左凸榫绕圆心 (0, PIVOT_Y) 顺时针转 +72° 即精确落在此处！
    const slotCX = TAB_R * sinH - TAB_OFF * cosH;
    const slotCY = PIVOT_Y + TAB_R * cosH + TAB_OFF * sinH;
    const sNeckX = TAB_R * sinH - 0.35 * cosH;
    const sNeckY = PIVOT_Y + TAB_R * cosH + 0.35 * sinH;

    m.fillAABB(-11.5, 11.5, -10.5, 10.5, 0, H - 1, (x, y, z, X, Y) => {
      const dy = Y - PIVOT_Y;
      const r = Math.hypot(X, dy);
      if (r > SHELL_R) return;

      const ang = Math.atan2(X, dy);
      const inSector = (ang >= -HALF_SECTOR - 0.015) && (ang <= HALF_SECTOR + 0.015);

      // 左凸榫判断（含颈部）
      const dTab = Math.hypot(X - tabCX, Y - tabCY);
      const dNeck = Math.hypot(X - neckX, Y - neckY);
      const inTab = (dTab <= TAB_RAD) || (dNeck <= 1.65);

      // 右凹槽判断（含颈口，半径略大 0.12 保证拼合清晰黑缝不穿模）
      const dSlot = Math.hypot(X - slotCX, Y - slotCY);
      const dSNeck = Math.hypot(X - sNeckX, Y - sNeckY);
      const inSlot = (dSlot <= TAB_RAD + 0.12) || (dSNeck <= 1.68);

      if ((!inSector && !inTab) || (inSlot && !inTab)) return;

      // 饱满圆滚龟背穹顶轮廓
      const nr = clamp(r / SHELL_R, 0, 1);
      const domeTop = 4.2 + 4.7 * Math.sqrt(Math.max(0, 1 - nr * nr * 0.86));
      // 扇片内沿两条放射骨棱略微隆起 0.6 格，增强俯视立体纹理
      const ribWave = Math.abs(Math.abs(ang) - 0.28) < 0.065 && r > 4.2 && r < SHELL_R - 2.2 ? 0.65 : 0;
      // 圆心扣锁小隆起
      const hubBump = r < 3.4 ? 0.55 * (1 - r / 3.4) : 0;
      const zMax = domeTop + ribWave + hubBump;
      if (z > zMax) return;

      // 腹底收边（z <= 1 时缩进 1.5 格，贴地稳重不露毛边）
      if (z <= 1) {
        if (r > SHELL_R - 1.6 || r < 1.8 || !inSector) return;
        m.setRaw(x, y, z, mat('under'), partId.under);
        return;
      }

      // 边缘暗色镶边判断（外弧缘 + 左右拼缝边 + 卡榫/凹槽边棱，俯视拼图感拉满！）
      const distLeftEdge = Math.abs(ang + HALF_SECTOR) * r;
      const distRightEdge = Math.abs(ang - HALF_SECTOR) * r;
      const onOuterRim = r >= SHELL_R - 1.55;
      const onTabRim = inTab && dTab >= TAB_RAD - 0.95;
      const onSlotRim = !inSlot && (dSlot <= TAB_RAD + 1.05);
      const onSideRim = (distLeftEdge < 0.85 && !inTab) || (distRightEdge < 0.85 && !inSlot);
      const onHubRim = r <= 2.3 && z >= zMax - 1.2;

      // 外缘对称两颗浅色骨铆钉点缀
      const onRivet = Math.abs(r - (SHELL_R - 3.6)) < 1.05 && Math.abs(Math.abs(ang) - 0.30) < 0.085 && z >= zMax - 1.1;

      if (onRivet) {
        m.setRaw(x, y, z, mat('claw'), partId.claw);
      } else if (onOuterRim || onTabRim || onSlotRim || onSideRim || onHubRim) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else {
        m.setRaw(x, y, z, pMat, pPid);
      }
    });

    m.despeckle();
    m.applyArtShading(true);

    // 外弧缘前端一对锐利小眼（散开时一眼认出小甲壳正面，合体后成外圈放哨眼；eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + PIVOT_Y + SHELL_R - 1.2);
    const eyeZ = 4;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 2.2);
      m.setRaw(ex,     eyeY,     eyeZ,     keyToId.eyeDark,  partId.eye);
      m.setRaw(ex + s, eyeY,     eyeZ,     keyToId.eyeIris,  partId.eye);
      m.setRaw(ex,     eyeY,     eyeZ + 1, keyToId.eyeGlint, partId.eye);
      m.setRaw(ex + s, eyeY,     eyeZ + 1, keyToId.eyeDark,  partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 9.0, headZ: 9, centerZ: 4 });
  }

  // =========================================================================
  // 2. 共享短粗深色步足件（5×8×6，左右对称自动减半烘焙；5 只 × 4 条 = 20 足全复用）
  //    根部在 (0, -2.4, 3.6)，斜向下伸至抓泥爪尖 (0, +2.8, 0.8)
  // =========================================================================
  function buildShortLeg(makeCanvas) {
    const W = 5, D = 8, H = 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 粗短基节 + 胫节（深色硬壳）
    m.paintCapsule(0, -2.5, 3.8, 0, 0.4, 3.6, 1.35, 1.22, mat('leg'), partId.leg, true);
    m.paintCapsule(0,  0.3, 3.5, 0, 2.2, 1.5, 1.18, 0.92, mat('leg'), partId.leg, true);
    // 浅色抓泥爪尖贴地
    m.paintEllipsoid(0, 2.5, 1.0, 0.85, 1.05, 0.85, mat('claw'), partId.claw, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.8, headZ: 5, centerZ: 2 });
  }

  // 每只小甲壳外弧底下的 4 条步足挂角（合体后 5×4 = 20 条正好每 18° 均匀排满整圆外圈！）
  const LEG_ANGLES = [-0.4712, -0.1571, 0.1571, 0.4712]; // -27°, -9°, +9°, +27°

  const Sea5Def = {
    id: 'sea5_puzzle_swarm',
    code: '海5',
    status: 'done',
    name: '退潮散开、涨潮合成一只的',
    tag: '散开合体 · 5色拼图20足大甲壳',
    summary: 'v3 精制（M31 散开/合体标杆）：5 只撞色拼图小甲壳（珊瑚红/明琥珀黄/海松青/深靛蓝/象牙白）各自顶着 72° 凹凸卡榫硬壳在滩涂四散觅食，涨潮浪环涌来时从四面高速冲向中心，0.2s 弹性咔咔扣合成一只 20 足五色圆壳巨甲稳稳顶浪，潮退再震颤弹散',
    defaultHabitat: 'tideflat',
    footRadius: 0.5, // 由 footContacts 分别绘制 5 只小甲壳或合体大甲壳的精准接地印
    ecoWeight: 1.2,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '潮汐散合巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '合体稳立待机', loop: true, status: 'done' },
      { id: 'merge',  name: '高频散合演示', loop: true, status: 'done' }
    ],
    blocks: [
      '5 块 72° 旋转对称凹凸卡榫拼图甲片（5 色严格一一对应）',
      '1 套共享深色短足件复用于 20 足环形波浪步态',
      '退潮散开觅食 -> 涨潮浪环集结 -> 0.2s 咔咔扣合 -> 大甲壳顶浪 -> 震颤弹散',
      '3 套五色拼图皮肤零重建模一键换色（30 色 <= 48、0 重色）'
    ],
    soulHabit: '退潮时 5 只五色拼图小甲壳在浅水滩涂四散碎步觅食溅起水花 -> 潮水环纹涌来，5 只同时从四面八方高速冲向汇合中心并旋正卡榫 -> 咔咔弹性扣合成一只 20 足五色圆滚大甲壳沉稳顶浪挪动 -> 潮退整圆微震，5 只咔哒弹散继续觅食',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        piece0: buildPuzzlePiece(makeCanvas, 0),
        piece1: buildPuzzlePiece(makeCanvas, 1),
        piece2: buildPuzzlePiece(makeCanvas, 2),
        piece3: buildPuzzlePiece(makeCanvas, 3),
        piece4: buildPuzzlePiece(makeCanvas, 4),
        leg:    buildShortLeg(makeCanvas)
      };

      const allAssets = Object.values(parts);
      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;
      const seed = opts.seed ?? 41;

      // 5 只独立五色拼图小甲壳状态
      const members = Array.from({ length: PIECE_COUNT }, (_, idx) => ({
        idx,
        partKey: `piece${idx}`,
        x: hx0,
        y: hy0,
        z: 1.4,
        vx: 0,
        vy: 0,
        yaw: wrapAngle(hyaw0 + idx * SECTOR_ANGLE),
        navX: hx0,
        navY: hy0,
        navPause: 0,
        navSeq: idx * 7 + 1,
        legPhase: idx * 1.25,
        stepCd: idx * 0.06,
        crackOffset: 0
      }));

      // 合体中心与状态机
      const state = {
        x: hx0,
        y: hy0,
        z: 1.5,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        // 'scatter' | 'gather' | 'merged' | 'burst'
        phase: 'scatter',
        phaseTimer: 0,
        phaseDur: 5.8,
        cycleSeq: 1,
        // 合体扣合 0.20s 弹性缩放计时器（仅此瞬间允许 1.08 -> 1.0，其余严格 1:1）
        snapTimer: -1,
        snapScale: 1.0,
        // 合体大甲壳顶浪缓慢巡行目标
        mergeNavX: hx0,
        mergeNavY: hy0,
        mergeWaveCd: 0,
        // 待机偶发微裂透气量（0..1）
        idleCrack: 0,
        idleBreathTimer: 0,
        // 潮退弹散微震幅
        burstShake: 0
      };

      const snapSpring = new SpringDamper1D(0, 260, 14.0);
      const sockets = new SocketTracker();
      // 5 只小甲壳独立接地印（合体时自然收拢成大甲壳底部的完整圆印）
      const footContacts = Array.from({ length: PIECE_COUNT }, () => ({ x: hx0, y: hy0, z: 0, r: 7.5 }));
      let curSkin = SKINS[0];

      // 工具：严格钳制坐标在 maxR (= maxRadius * 0.80) 圆内
      function clampInBound(x, y, maxR) {
        const d = Math.hypot(x, y);
        if (d > maxR && d > 0.0001) {
          return [x * (maxR / d), y * (maxR / d)];
        }
        return [x, y];
      }

      // 为单只小甲壳挑一个新的滩涂觅食点（严格在 maxR 内且尽量与当前点拉开角度）
      function pickMemberTarget(mb, maxR, cx, cy) {
        mb.navSeq++;
        const r1 = hash2i(mb.navSeq, seed + mb.idx * 31, 101);
        const r2 = hash2i(mb.navSeq, seed + mb.idx * 31, 211);
        const r3 = hash2i(mb.navSeq, seed + mb.idx * 31, 307);
        const baseAng = mb.idx * SECTOR_ANGLE + (r1 - 0.5) * 1.45;
        const dist = lerp(maxR * 0.36, maxR * 0.90, r2);
        const [tx, ty] = clampInBound(cx + Math.cos(baseAng) * dist, cy + Math.sin(baseAng) * dist, maxR);
        mb.navX = tx;
        mb.navY = ty;
        mb.navPause = lerp(0.25, 0.95, r3);
      }

      // 为合体后的大甲壳挑一个汇合/顶浪挪动中心（留出大壳半径余量确保子体也全在 maxR 内）
      function pickMergeCenter(maxR, sMul, seq) {
        const safeR = Math.max(4.0, maxR - CENTROID_R * sMul - 2.0);
        const a = hash2i(seq, seed, 419) * TAU;
        const r = hash2i(seq, seed, 523) * safeR * 0.72;
        return [Math.cos(a) * r, Math.sin(a) * r];
      }

      // 计算第 i 块拼图在合体圆上的精确质心世界坐标与朝向
      function getMergedSlotPose(cx, cy, cYaw, idx, sMul, radialExtra = 0) {
        const slotYaw = wrapAngle(cYaw + idx * SECTOR_ANGLE);
        const rad = (CENTROID_R + radialExtra) * sMul;
        const [sx, sy] = localToWorldXY(cx, cy, slotYaw, 0, rad);
        return { x: sx, y: sy, yaw: slotYaw };
      }

      function enterPhase(nextPhase, maxR, sMul, compact, vfx, habitat) {
        state.phase = nextPhase;
        state.phaseTimer = 0;
        const fx = curSkin.fx || SKINS[0].fx;

        if (nextPhase === 'scatter') {
          state.phaseDur = compact ? 2.1 : lerp(5.2, 6.8, hash2i(state.cycleSeq, seed, 607));
          state.snapTimer = -1;
          state.snapScale = 1.0;
          state.burstShake = 0;
          for (const mb of members) {
            pickMemberTarget(mb, maxR, 0, 0);
            mb.navPause = 0;
          }
        } else if (nextPhase === 'gather') {
          state.phaseDur = compact ? 1.25 : lerp(1.6, 2.1, hash2i(state.cycleSeq, seed, 709));
          state.snapTimer = -1;
          state.snapScale = 1.0;
          const [mx, my] = pickMergeCenter(maxR, sMul, state.cycleSeq);
          state.x = mx;
          state.y = my;
          state.mergeNavX = mx;
          state.mergeNavY = my;
          // 涨潮信号：在汇合中心与外围荡开浪潮环纹与细水花
          if (vfx) {
            vfx.addRipple(mx, my, 4.0 * sMul, 34.0 * sMul, 1.25, 2.2);
            vfx.addRipple(mx, my, 12.0 * sMul, 42.0 * sMul, 1.05, 1.5);
          }
        } else if (nextPhase === 'merged') {
          state.phaseDur = compact ? 1.85 : lerp(4.4, 5.8, hash2i(state.cycleSeq, seed, 811));
          // 触发一次 0.20s 极短弹性扣合缩放（1.08 -> 1.0）
          state.snapTimer = 0;
          state.snapScale = 1.08;
          snapSpring.x = 0.08;
          snapSpring.v = 0;
          state.mergeWaveCd = 0.7;
          const [nx, ny] = pickMergeCenter(maxR, sMul, state.cycleSeq + 13);
          state.mergeNavX = nx;
          state.mergeNavY = ny;
          // 咔咔扣合瞬间：一圈清脆白沫浪环 + 溅水微粒
          if (vfx) {
            vfx.addRipple(state.x, state.y, 14.0 * sMul, 36.0 * sMul, 0.92, 2.4);
            if (habitat && habitat.isWater) {
              vfx.spawnSplash(state.x, state.y, 10, 1.15 * sMul, habitat.fx);
            } else {
              vfx.spawnDust(state.x, state.y, 8, 1.0 * sMul, habitat && habitat.fx);
            }
            for (let k = 0; k < 10; k++) {
              const a = (k / 10) * TAU + 0.15;
              const rx = state.x + Math.cos(a) * 16 * sMul;
              const ry = state.y + Math.sin(a) * 16 * sMul;
              vfx.spawnParticle(
                rx, ry, 2.4 * sMul,
                Math.cos(a) * 13 * sMul, Math.sin(a) * 13 * sMul, (7 + (k % 3) * 3) * sMul,
                0.42, 1.25, (k & 1) ? fx.foamA : fx.foamB, false, 28
              );
            }
          }
        } else if (nextPhase === 'burst') {
          state.phaseDur = compact ? 0.45 : 0.55;
          state.snapTimer = -1;
          state.snapScale = 1.0;
          state.burstShake = 1.0;
          state.cycleSeq++;
          // 潮退弹散：5 只获得清晰向外弹射初速度并溅起细浪
          for (let i = 0; i < members.length; i++) {
            const mb = members[i];
            const outYaw = wrapAngle(state.yaw + i * SECTOR_ANGLE);
            const fxDir = -Math.sin(outYaw), fyDir = Math.cos(outYaw);
            mb.vx = fxDir * 24.0 * sMul;
            mb.vy = fyDir * 24.0 * sMul;
            mb.yaw = outYaw;
          }
          if (vfx) {
            vfx.addRipple(state.x, state.y, 8.0 * sMul, 28.0 * sMul, 0.75, 1.8);
            if (habitat && habitat.isWater) {
              vfx.spawnSplash(state.x, state.y, 8, 0.95 * sMul, habitat.fx);
            }
          }
        }
      }

      const instance = {
        def: Sea5Def,
        cachePrefix: `sea5_puzzle_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: allAssets,
        state,
        sockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of allAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 1.5;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.phase = 'scatter';
          state.phaseTimer = 0;
          state.phaseDur = 5.6;
          state.cycleSeq = 1;
          state.snapTimer = -1;
          state.snapScale = 1.0;
          state.idleCrack = 0;
          state.idleBreathTimer = 0;
          state.burstShake = 0;
          snapSpring.x = snapSpring.v = 0;

          for (let i = 0; i < members.length; i++) {
            const mb = members[i];
            const ang = homeYaw + i * SECTOR_ANGLE;
            const r0 = 20.0;
            mb.x = homeX - Math.sin(ang) * r0;
            mb.y = homeY + Math.cos(ang) * r0;
            mb.z = 1.4;
            mb.vx = 0;
            mb.vy = 0;
            mb.yaw = wrapAngle(ang);
            mb.navSeq = i * 7 + 1;
            mb.navPause = 0;
            mb.crackOffset = 0;
            pickMemberTarget(mb, 34, homeX, homeY);
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.35, 2.2);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const isIdle = action === 'idle';
          const isMergeDemo = action === 'merge';
          const isWater = !!(habitat && habitat.isWater);
          const fx = curSkin.fx || SKINS[0].fx;

          // 严格遵守边界红线：所有子体与合体坐标严格钳制在 maxRadius * 0.80 内
          const rawMaxR = (eco && eco.maxRadius) || 48;
          const boundR = rawMaxR * 0.80;
          const mergeCenterMaxR = Math.max(4.0, boundR - CENTROID_R * sMul - 1.5);
          const homeX = clamp((eco && eco.homeX) ?? 0, -mergeCenterMaxR, mergeCenterMaxR);
          const homeY = clamp((eco && eco.homeY) ?? 0, -mergeCenterMaxR, mergeCenterMaxR);
          const homeYaw = (eco && eco.homeYaw) ?? 0;

          // -----------------------------------------------------------------
          // 模式 A：原地待机（合体大甲壳稳立呼吸，偶发 5 块甲片微裂透气再合紧）
          // -----------------------------------------------------------------
          if (isIdle) {
            state.phase = 'merged';
            state.snapTimer = -1;
            state.snapScale = 1.0;
            state.burstShake = 0;

            const kHome = expSmooth(dt, 4.5);
            state.x = lerp(state.x, homeX, kHome);
            state.y = lerp(state.y, homeY, kHome);
            state.z = lerp(state.z, (1.45 + Math.sin(time * 2.1 * gFreq) * 0.22) * sMul, expSmooth(dt, 7.0));
            const tgtYaw = wrapAngle(homeYaw + Math.sin(time * 0.55) * 0.12);
            state.yaw = wrapAngle(state.yaw + wrapAngle(tgtYaw - state.yaw) * expSmooth(dt, 3.8));
            state.vx = 0;
            state.vy = 0;

            // 每 3.8s 偶发一次微裂透气（0 -> 1.5 格 -> 0 咔哒合回）
            state.idleBreathTimer = (state.idleBreathTimer + dt) % 3.8;
            let crack = 0;
            if (state.idleBreathTimer > 2.4 && state.idleBreathTimer < 3.4) {
              const u = (state.idleBreathTimer - 2.4) / 1.0;
              crack = Math.sin(u * Math.PI) * 1.65;
            }
            state.idleCrack = lerp(state.idleCrack, crack, expSmooth(dt, 14.0));

            for (let i = 0; i < members.length; i++) {
              const mb = members[i];
              const pose = getMergedSlotPose(state.x, state.y, state.yaw, i, sMul, state.idleCrack);
              const kSnap = expSmooth(dt, 14.0);
              mb.x = lerp(mb.x, pose.x, kSnap);
              mb.y = lerp(mb.y, pose.y, kSnap);
              mb.z = state.z + state.idleCrack * 0.18 * sMul;
              mb.yaw = wrapAngle(mb.yaw + wrapAngle(pose.yaw - mb.yaw) * kSnap);
              mb.vx = 0;
              mb.vy = 0;
              mb.legPhase = (mb.legPhase + dt * 2.4 * gFreq) % TAU;
              const [cx, cy] = clampInBound(mb.x, mb.y, boundR);
              mb.x = cx; mb.y = cy;
              footContacts[i].x = mb.x;
              footContacts[i].y = mb.y;
              footContacts[i].z = 0;
              footContacts[i].r = 7.2 * sMul;
            }
            sockets.setWorld('center', state.x, state.y, state.z + 6 * sMul, state.yaw);
            return;
          }

          // -----------------------------------------------------------------
          // 模式 B：潮汐散合巡游（patrol）与 高频散合演示（merge）
          // -----------------------------------------------------------------
          state.idleCrack = lerp(state.idleCrack, 0, expSmooth(dt, 12.0));
          state.phaseTimer += dt * (isMergeDemo ? 1.0 : clamp(spdMul, 0.65, 1.55));

          // 阶段流转
          if (state.phase === 'scatter' && state.phaseTimer >= state.phaseDur) {
            enterPhase('gather', boundR, sMul, isMergeDemo, vfx, habitat);
          } else if (state.phase === 'gather') {
            // 当 5 只都冲到合体槽位附近或达到集结上限时间，立刻咔咔扣合！
            let maxErr = 0;
            for (let i = 0; i < members.length; i++) {
              const pose = getMergedSlotPose(state.x, state.y, state.yaw, i, sMul, 0);
              const d = Math.hypot(members[i].x - pose.x, members[i].y - pose.y);
              if (d > maxErr) maxErr = d;
            }
            if (maxErr < 1.8 * sMul || state.phaseTimer >= state.phaseDur) {
              enterPhase('merged', boundR, sMul, isMergeDemo, vfx, habitat);
            }
          } else if (state.phase === 'merged' && state.phaseTimer >= state.phaseDur) {
            enterPhase('burst', boundR, sMul, isMergeDemo, vfx, habitat);
          } else if (state.phase === 'burst' && state.phaseTimer >= state.phaseDur) {
            enterPhase('scatter', boundR, sMul, isMergeDemo, vfx, habitat);
          }

          // 更新 0.20s 极短弹性扣合缩放（仅在 snapTimer ∈ [0, 0.20) 生效，平时严格 1.0）
          if (state.snapTimer >= 0) {
            state.snapTimer += dt;
            if (state.snapTimer >= 0.20) {
              state.snapTimer = -1;
              state.snapScale = 1.0;
            } else {
              const sVal = snapSpring.update(dt, 0, 260 * sp, 13.5);
              const env = 1.0 - smoothstep(0.12, 0.20, state.snapTimer);
              state.snapScale = 1.0 + clamp(sVal, -0.04, 0.085) * env;
            }
          } else {
            state.snapScale = 1.0;
          }

          // -----------------------------------------------------------------
          // 各阶段运动解算
          // -----------------------------------------------------------------
          if (state.phase === 'scatter') {
            // 退潮散开：5 只小甲壳各自四散碎步觅食、避碰分离、偶停刮泥屑、溅细水花
            let sumX = 0, sumY = 0;
            for (let i = 0; i < members.length; i++) {
              const mb = members[i];
              if (mb.navPause > 0) {
                mb.navPause -= dt;
                mb.vx = lerp(mb.vx, 0, expSmooth(dt, 9.0));
                mb.vy = lerp(mb.vy, 0, expSmooth(dt, 9.0));
                // 停步低头刮食泥屑微晃
                mb.yaw = wrapAngle(mb.yaw + Math.sin(time * 7.5 + i * 1.7) * 0.65 * dt);
              } else {
                const dx = mb.navX - mb.x;
                const dy = mb.navY - mb.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 4.5 * sMul) {
                  pickMemberTarget(mb, boundR, 0, 0);
                } else {
                  // 彼此防重叠斥力（保证 5 块彩色拼图散开时清爽不糊成一团）
                  let sepX = 0, sepY = 0;
                  const minSep = 15.5 * sMul;
                  for (let j = 0; j < members.length; j++) {
                    if (i === j) continue;
                    const ox = mb.x - members[j].x;
                    const oy = mb.y - members[j].y;
                    const od = Math.hypot(ox, oy) || 0.001;
                    if (od < minSep) {
                      const push = ((minSep - od) / minSep) * 26.0;
                      sepX += (ox / od) * push;
                      sepY += (oy / od) * push;
                    }
                  }
                  const tx = dx / dist * 20.0 * spdMul + sepX;
                  const ty = dy / dist * 20.0 * spdMul + sepY;
                  const desiredYaw = Math.atan2(-tx, ty);
                  const maxTurn = 6.2 * dt;
                  mb.yaw = wrapAngle(mb.yaw + clamp(wrapAngle(desiredYaw - mb.yaw), -maxTurn, maxTurn));
                  const spd = Math.min(22.0 * spdMul, Math.hypot(tx, ty)) * (0.85 + Math.abs(Math.sin(mb.legPhase)) * 0.25);
                  mb.vx = lerp(mb.vx, -Math.sin(mb.yaw) * spd, expSmooth(dt, 8.5));
                  mb.vy = lerp(mb.vy,  Math.cos(mb.yaw) * spd, expSmooth(dt, 8.5));
                }
              }

              mb.x += mb.vx * dt;
              mb.y += mb.vy * dt;
              const [cx, cy] = clampInBound(mb.x, mb.y, boundR);
              mb.x = cx; mb.y = cy;

              const moveSpd = Math.hypot(mb.vx, mb.vy);
              mb.legPhase = (mb.legPhase + dt * (3.5 + moveSpd * 0.62) * gFreq) % TAU;
              mb.z = (1.35 + (moveSpd > 2.0 ? Math.abs(Math.sin(mb.legPhase)) * 0.45 : 0)) * sMul;

              // 跑动时在浅滩溅起细水花与小涟漪
              mb.stepCd -= dt;
              if (vfx && moveSpd > 6.5 && mb.stepCd <= 0) {
                mb.stepCd = 0.26 + (i % 3) * 0.05;
                if (isWater) {
                  vfx.addRipple(mb.x, mb.y, 1.6 * sMul, 8.5 * sMul, 0.55, 1.2);
                  vfx.spawnParticle(
                    mb.x + (Math.random() - 0.5) * 4 * sMul,
                    mb.y + (Math.random() - 0.5) * 4 * sMul,
                    1.6 * sMul,
                    -mb.vx * 0.2 + (Math.random() - 0.5) * 6,
                    -mb.vy * 0.2 + (Math.random() - 0.5) * 6,
                    (5 + Math.random() * 5) * sMul,
                    0.35, 1.0, fx.foamA, false, 24
                  );
                } else {
                  vfx.spawnDust(mb.x, mb.y, 2, 0.55 * sMul, habitat && habitat.fx);
                }
              }

              sumX += mb.x;
              sumY += mb.y;
              footContacts[i].x = mb.x;
              footContacts[i].y = mb.y;
              footContacts[i].z = 0;
              footContacts[i].r = 6.8 * sMul;
            }
            state.x = sumX / PIECE_COUNT;
            state.y = sumY / PIECE_COUNT;
            state.z = 1.4 * sMul;
          } else if (state.phase === 'gather') {
            // 涨潮集结：5 只同时从四面八方高速冲向汇合中心并旋正至 72° 拼图槽位
            const u = clamp(state.phaseTimer / Math.max(0.1, state.phaseDur), 0, 1);
            const pullGain = lerp(5.5, 16.5, smoothstep(0.15, 0.92, u));

            // 周期性生成涨潮涌浪环纹
            state.mergeWaveCd -= dt;
            if (vfx && state.mergeWaveCd <= 0) {
              state.mergeWaveCd = 0.42;
              vfx.addRipple(state.x, state.y, 24.0 * sMul, 42.0 * sMul, 0.85, 1.6);
            }

            for (let i = 0; i < members.length; i++) {
              const mb = members[i];
              const pose = getMergedSlotPose(state.x, state.y, state.yaw, i, sMul, 0);
              const dx = pose.x - mb.x;
              const dy = pose.y - mb.y;
              const dist = Math.hypot(dx, dy);

              const kPos = expSmooth(dt, pullGain);
              const nx = lerp(mb.x, pose.x, kPos);
              const ny = lerp(mb.y, pose.y, kPos);
              mb.vx = (nx - mb.x) / Math.max(dt, 0.001);
              mb.vy = (ny - mb.y) / Math.max(dt, 0.001);
              mb.x = nx;
              mb.y = ny;
              const [cx, cy] = clampInBound(mb.x, mb.y, boundR);
              mb.x = cx; mb.y = cy;

              // 远距离朝冲刺方向跑，临近合体位置时快速旋正到精准 72° 拼图卡榫朝向
              const runYaw = dist > 3.5 * sMul ? Math.atan2(-dx, dy) : pose.yaw;
              const alignBlend = smoothstep(14.0 * sMul, 3.0 * sMul, dist);
              const targetYaw = wrapAngle(runYaw + wrapAngle(pose.yaw - runYaw) * alignBlend);
              mb.yaw = wrapAngle(mb.yaw + wrapAngle(targetYaw - mb.yaw) * expSmooth(dt, 11.5));

              mb.legPhase = (mb.legPhase + dt * 16.5 * gFreq) % TAU;
              mb.z = (1.4 + Math.abs(Math.sin(mb.legPhase)) * 0.55) * sMul;

              mb.stepCd -= dt;
              if (vfx && dist > 3.0 * sMul && mb.stepCd <= 0) {
                mb.stepCd = 0.16;
                if (isWater) vfx.addRipple(mb.x, mb.y, 1.5 * sMul, 7.0 * sMul, 0.45, 1.1);
              }

              footContacts[i].x = mb.x;
              footContacts[i].y = mb.y;
              footContacts[i].z = 0;
              footContacts[i].r = 7.0 * sMul;
            }
          } else if (state.phase === 'merged') {
            // 咔咔扣合 + 20 足大甲壳沉稳顶浪挪动
            const dx = state.mergeNavX - state.x;
            const dy = state.mergeNavY - state.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 2.2 * sMul) {
              const [nx, ny] = pickMergeCenter(boundR, sMul, state.cycleSeq + Math.floor(time * 2));
              state.mergeNavX = nx;
              state.mergeNavY = ny;
            } else if (state.phaseTimer > 0.25) {
              // 沉稳慢挪（带厚重抓地节律）
              const stepPulse = 0.72 + Math.abs(Math.sin(time * 3.8 * gFreq)) * 0.35;
              const moveSpd = 5.4 * spdMul * stepPulse;
              const vxT = (dx / dist) * moveSpd;
              const vyT = (dy / dist) * moveSpd;
              state.vx = lerp(state.vx, vxT, expSmooth(dt, 4.5));
              state.vy = lerp(state.vy, vyT, expSmooth(dt, 4.5));
              state.x += state.vx * dt;
              state.y += state.vy * dt;
              const [cx, cy] = clampInBound(state.x, state.y, mergeCenterMaxR);
              state.x = cx; state.y = cy;
              // 整壳缓缓小幅旋身迎浪
              state.yaw = wrapAngle(state.yaw + dt * 0.26 * spdMul);
            }

            // 迎浪波纹反馈：大甲壳稳稳压地抗住涌浪
            state.mergeWaveCd -= dt;
            if (vfx && state.mergeWaveCd <= 0) {
              state.mergeWaveCd = 1.15;
              vfx.addRipple(state.x, state.y, 16.0 * sMul, 34.0 * sMul, 1.05, 1.8);
            }

            state.z = (1.35 + Math.sin(time * 3.8 * gFreq) * 0.22) * sMul;
            for (let i = 0; i < members.length; i++) {
              const mb = members[i];
              const pose = getMergedSlotPose(state.x, state.y, state.yaw, i, sMul, 0);
              mb.x = pose.x;
              mb.y = pose.y;
              mb.z = state.z;
              mb.yaw = pose.yaw;
              mb.vx = state.vx;
              mb.vy = state.vy;
              mb.legPhase = (time * 5.6 * gFreq + i * 1.1) % TAU;
              const [cx, cy] = clampInBound(mb.x, mb.y, boundR);
              mb.x = cx; mb.y = cy;
              footContacts[i].x = mb.x;
              footContacts[i].y = mb.y;
              footContacts[i].z = 0;
              footContacts[i].r = 7.4 * sMul;
            }
          } else {
            // burst：潮退先微震 0.16s，再 5 只咔哒向外弹散
            const u = clamp(state.phaseTimer / Math.max(0.05, state.phaseDur), 0, 1);
            if (u < 0.28) {
              // 整圆蓄力微震（纯位移微抖，零缩放）
              const sh = Math.sin(time * 55.0) * 0.65 * sMul;
              for (let i = 0; i < members.length; i++) {
                const mb = members[i];
                const pose = getMergedSlotPose(state.x, state.y, state.yaw, i, sMul, 0.35 + (u / 0.28) * 0.8);
                mb.x = pose.x + sh;
                mb.y = pose.y - sh * 0.7;
                mb.z = 1.6 * sMul;
                mb.yaw = pose.yaw;
                footContacts[i].x = mb.x;
                footContacts[i].y = mb.y;
                footContacts[i].z = 0;
                footContacts[i].r = 7.2 * sMul;
              }
            } else {
              // 咔哒向外弹开四散
              const drag = expSmooth(dt, 3.2);
              for (let i = 0; i < members.length; i++) {
                const mb = members[i];
                mb.vx = lerp(mb.vx, mb.vx * 0.45, drag);
                mb.vy = lerp(mb.vy, mb.vy * 0.45, drag);
                mb.x += mb.vx * dt;
                mb.y += mb.vy * dt;
                const [cx, cy] = clampInBound(mb.x, mb.y, boundR);
                mb.x = cx; mb.y = cy;
                mb.legPhase = (mb.legPhase + dt * 18.0 * gFreq) % TAU;
                mb.z = (1.4 + Math.sin(((u - 0.28) / 0.72) * Math.PI) * 1.4) * sMul;
                footContacts[i].x = mb.x;
                footContacts[i].y = mb.y;
                footContacts[i].z = 0;
                footContacts[i].r = 6.8 * sMul;
              }
            }
          }

          sockets.setWorld('center', state.x, state.y, state.z + 6 * sMul, state.yaw);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? habitat.waterLevel : 1.4;
          const isMerged = state.phase === 'merged';
          // 仅在合体瞬间 0.20s 内允许极短弹性缩放（1.08 -> 1.0），其余时间严格 undefined（1:1 无损绘制）
          const useSnapScale = isMerged && state.snapTimer >= 0 && Math.abs(state.snapScale - 1.0) > 0.002;
          const scX = useSnapScale ? state.snapScale : undefined;
          const scY = useSnapScale ? state.snapScale : undefined;

          for (let i = 0; i < members.length; i++) {
            const mb = members[i];
            const yw = mb.yaw;
            const subShell = isWater ? clamp(EnvFeedback.calcSubmerge(mb.z + 1.5 * sMul, waterLvl, 4.0, true), 0, 0.26) : 0;
            const subLeg   = isWater ? clamp(EnvFeedback.calcSubmerge(mb.z - 0.6 * sMul, waterLvl + 0.6, 3.6, true), 0, 0.48) : 0;

            // 由质心反推该块拼图的扇形圆心位置（与 buildPuzzlePiece 的 PIVOT_Y 严丝合缝）
            const [hubX, hubY] = localToWorldXY(mb.x, mb.y, yw, 0, -CENTROID_R * sMul);
            // 拼图甲片绘制原点（将体素盒内的圆心 (0, PIVOT_Y) 锁死在 hubX, hubY）
            const [pieceX, pieceY] = pivotToWorldXY(hubX, hubY, yw, 0, PIVOT_Y * sMul);

            // 1. 每只 4 条共享短粗深色步足（5 只 × 4 条 = 合体整圆四周 20 条短粗步足！）
            for (let li = 0; li < LEG_ANGLES.length; li++) {
              const lAng = LEG_ANGLES[li];
              const phase = mb.legPhase + li * (isMerged ? 0.85 : Math.PI);
              const swing = Math.sin(phase);
              const liftStep = Math.max(0, Math.cos(phase)) * (isMerged ? 0.55 : 0.85) * sMul;
              const legDir = wrapAngle(yw + lAng + swing * (isMerged ? 0.14 : 0.24));
              // 步足从外弧内侧 r = SHELL_R - 0.6 处伸出至外圈
              const [lx, ly] = localToWorldXY(hubX, hubY, wrapAngle(yw + lAng), 0, (SHELL_R + 0.6) * sMul);
              list.push({
                partKey: 'leg',
                asset: parts.leg,
                x: lx,
                y: ly,
                lift: Math.max(0.1, mb.z - 0.9 * sMul + liftStep),
                ro: legDir,
                bias: -0.35,
                submerge: subLeg
              });
            }

            // 2. 五色拼图硬壳甲片
            const item = {
              partKey: mb.partKey,
              asset: parts[mb.partKey],
              x: pieceX,
              y: pieceY,
              lift: Math.max(0.4, mb.z),
              ro: yw,
              bias: 0.25 + i * 0.01,
              submerge: subShell
            };
            if (useSnapScale) {
              item.scaleX = scX;
              item.scaleY = scY;
            }
            list.push(item);
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sea5Def.id,
            code: Sea5Def.code,
            status: Sea5Def.status,
            name: Sea5Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            phase: state.phase,
            pieceCount: PIECE_COUNT,
            legCount: PIECE_COUNT * LEG_ANGLES.length,
            footRadius: 18.0,
            headZ: 11,
            centerZ: 5,
            blocks: Sea5Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sea5Def);
})(window.PixelWorkshop);
