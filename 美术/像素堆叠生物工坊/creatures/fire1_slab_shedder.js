'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SocketTracker } = PW.Solvers;

  // =========================================================================
  // M35 标杆 · 火1 · 留下一层再走的（一层层拆开 / 在别处拼回来）
  // -------------------------------------------------------------------------
  // 【顶层可复用配置 M35_CONFIG】
  //   天7（一摞薄片，自上而下飘散）与 海7（浮上水面当筏子）可直接复用本套分层拆拼状态机：
  //   - slabCount / slabStepZ / biasStep : 厚片层数、层间步距与严格递增深度偏置
  //   - shedOrder / assembleOrder        : 'bottomUp'（自下而上）或 'topDown'（自上而下）
  //   - breathDuration / sinkDuration / shiftDuration / reassembleDuration / coolDuration
  //   - targetRadiusRatio                : 目标点严格钳制在 maxRadius * 0.78 内
  //   - slabPropLife / slabPropRadius    : 留下冷石板摆件的留存节奏（场面约 4~6 块自然淡出）
  // =========================================================================
  const M35_CONFIG = {
    slabCount: 7,
    slabHeight: 4,              // 每片厚片体素层高（3~6 层规范内）
    slabStepZ: 4.4,             // 相邻厚片垂直步距（> slabHeight，留清晰分层缝）
    biasStep: 3.5,              // 相邻厚片深度偏置步距（> 最大水平错位，360° 零穿插）
    shedOrder: 'bottomUp',      // 沉入地缝顺序：从第 0 层（最底）到第 6 层（最顶）
    assembleOrder: 'bottomUp',  // 拼回顺序：从第 0 层到第 6 层逐片冒出落位

    breathDuration: [2.6, 3.8], // 待机呼吸时长（秒）
    compactBreath: 1.15,        // reassemble 紧凑演示态的呼吸间隔（秒）
    sinkDuration: 1.0,          // 逐层沉入地缝总时长（0.8~1.2 秒）
    shiftDuration: 0.65,        // 地下潜移提示时长（0.5~0.8 秒）
    reassembleDuration: 1.0,    // 逐层冒出拼回总时长（0.8~1.2 秒）
    coolDuration: 2.2,          // 刚冒出后顶层余热缓冷时长（秒）

    targetRadiusRatio: 0.78,    // 目标点安全半径上限系数
    minHopDist: 17.5,           // 单次换位最小位移距离（格）

    slabPropLife: 24.0,         // 巡游留板寿命（秒，周期 ~5.8s → 场面稳定 4~5 块）
    compactPropLife: 18.0,      // 紧凑演示态留板寿命（秒，周期 ~3.8s → 场面稳定 4~5 块）
    minPropInterval: 3.0,       // 留板最小冷却间隔（秒），防高倍速刷屏
    slabPropRadius: 9.2,        // 冷石板地表摆件半径（格）

    breathSwayAmp: 1.10,        // 呼吸错层水平微移幅度（格）
    breathLiftAmp: 0.30,        // 呼吸垂直微起伏幅度（格）
    emergeTravelZ: 3.2          // 拼回单层冒出行程（严格 < slabStepZ - 0.5，保证 lift 递增）
  };

  // 7 块厚片的层级排布表（复用 4 套不同宽度圆角石片资产，全部四重对称 symDeg: 90）
  // 第 0~1 层：38 格宽冷黑玄武岩厚片（无自亮）
  // 第 2~3 层：34 格宽深焦熔壳厚片（暗红冷裂纹，无自亮）
  // 第 4~5 层：30 格宽炽裂熔岩厚片（适量自亮裂纹）
  // 第 6   层：22 格宽顶冠炽裂石片（顶层炽热裂纹）
  const LAYER_DEFS = [
    { idx: 0, assetKey: 'slabBase',  baseYaw:  0.00, swayMul: 0.35, hotWeight: 0.00 },
    { idx: 1, assetKey: 'slabBase',  baseYaw:  0.42, swayMul: 0.52, hotWeight: 0.00 },
    { idx: 2, assetKey: 'slabLower', baseYaw: -0.34, swayMul: 0.68, hotWeight: 0.15 },
    { idx: 3, assetKey: 'slabLower', baseYaw:  0.56, swayMul: 0.82, hotWeight: 0.35 },
    { idx: 4, assetKey: 'slabUpper', baseYaw: -0.46, swayMul: 0.94, hotWeight: 0.72 },
    { idx: 5, assetKey: 'slabUpper', baseYaw:  0.28, swayMul: 1.00, hotWeight: 0.90 },
    { idx: 6, assetKey: 'slabCrown', baseYaw: -0.62, swayMul: 1.08, hotWeight: 1.00 }
  ];

  // =========================================================================
  // 1. 色表（24 色 <= 48 色、0 重色、3 档色阶、仅顶层炽热裂纹进 glowKeys）
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 底层冷硬玄武岩（3 档）
      basaltDark:   '#17151a',
      basaltMid:    '#26232b',
      basaltHi:     '#3d3845',
      // 中下层焦黑熔壳（3 档）
      charDark:     '#241c1f',
      charMid:      '#3b2e33',
      charHi:       '#59464d',
      // 上层温热暗红岩壳（3 档）
      crustDark:    '#382022',
      crustMid:     '#593334',
      crustHi:      '#804d49',
      // 厚片冷硬风化切棱（3 档）
      rimDark:      '#2e2b33',
      rimMid:       '#4a4552',
      rimHi:        '#6e6778',
      // 中层半冷却暗红裂纹（非自亮，3 档）
      veinDark:     '#5c1816',
      veinMid:      '#8f2720',
      veinHi:       '#bf3f2c',
      // 分层深暗凹缝与底倒角（3 档）
      seamDark:     '#0f0d12',
      seamMid:      '#1c1821',
      seamHi:       '#2c2633',
      // 岩面嵌矿粗粒（3 档）
      slagDark:     '#47362e',
      slagMid:      '#6e5244',
      slagHi:       '#96725e',
      // 顶上 2~3 层炽热裂纹（唯一进 glowKeys，守住 3 档色阶）
      emissiveMid:  '#cc2e14',
      emissiveHot:  '#ff6624',
      emissiveCore: '#ffc45c'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: ['basalt', 'charRock', 'crust', 'edgeRim', 'vein', 'seam', 'slag', 'emissive'],
    noCrease: [
      ['basalt', 'edgeRim'],
      ['charRock', 'edgeRim'],
      ['charRock', 'vein'],
      ['crust', 'vein'],
      ['crust', 'emissive'],
      ['vein', 'emissive'],
      ['basalt', 'slag'],
      ['charRock', 'slag']
    ],
    materials: {
      basalt:   ['basaltDark', 'basaltMid', 'basaltHi'],
      charRock: ['charDark',   'charMid',   'charHi'],
      crust:    ['crustDark',  'crustMid',  'crustHi'],
      edgeRim:  ['rimDark',    'rimMid',    'rimHi'],
      vein:     ['veinDark',   'veinMid',   'veinHi'],
      seam:     ['seamDark',   'seamMid',   'seamHi'],
      slag:     ['slagDark',   'slagMid',   'slagHi']
    },
    protectedParts: ['emissive', 'vein']
  });

  // 3 套零重建模换色皮肤（0 禁用字，每套 24 色 0 重色）
  const SKINS = [
    {
      id: 'volcano_lava',
      name: '火山暗红熔岩',
      dot: '#cc2e14',
      outline: '#0d090a',
      pal: {},
      fx: {
        slabColor: '#3b2e33',
        slabRim:   '#17151a',
        crackTint: '#4f1e18',
        crackDark: '#1c0c0a',
        sparkHot:  '#ff6624',
        sparkCore: '#ffc45c',
        dust:      '#59464d'
      }
    },
    {
      id: 'sulfur_gold',
      name: '硫磺金裂岩',
      dot: '#e0a01c',
      outline: '#120e08',
      pal: {
        basaltDark:   '#1b1a14', basaltMid:    '#2e2c20', basaltHi:     '#474432',
        charDark:     '#2b2619', charMid:      '#453d28', charHi:       '#665b3c',
        crustDark:    '#40351a', crustMid:     '#66552a', crustHi:      '#8f783b',
        rimDark:      '#333126', rimMid:       '#524f3d', rimHi:        '#78745a',
        veinDark:     '#704c0f', veinMid:      '#ad7717', veinHi:       '#db9f24',
        seamDark:     '#12110c', seamMid:      '#211f16', seamHi:       '#333022',
        slagDark:     '#54472c', slagMid:      '#806c44', slagHi:       '#ad945e',
        emissiveMid:  '#d98c14', emissiveHot:  '#ffc22e', emissiveCore: '#fff2a6'
      },
      fx: {
        slabColor: '#453d28',
        slabRim:   '#1b1a14',
        crackTint: '#594216',
        crackDark: '#211909',
        sparkHot:  '#ffc22e',
        sparkCore: '#fff2a6',
        dust:      '#665b3c'
      }
    },
    {
      id: 'basalt_ash',
      name: '玄武冷灰岩',
      dot: '#7a8494',
      outline: '#0b0d12',
      pal: {
        basaltDark:   '#161921', basaltMid:    '#252a36', basaltHi:     '#3b4254',
        charDark:     '#222730', charMid:      '#373f4d', charHi:       '#535e70',
        crustDark:    '#313845', crustMid:     '#4d5769', crustHi:      '#707d94',
        rimDark:      '#2c313b', rimMid:       '#48505e', rimHi:        '#6d788a',
        veinDark:     '#57302e', veinMid:      '#8a4942', veinHi:       '#bd6a59',
        seamDark:     '#0e1017', seamMid:      '#1a1e29', seamHi:       '#2b3140',
        slagDark:     '#3e4552', slagMid:      '#606a7a', slagHi:       '#8895a8',
        emissiveMid:  '#b84930', emissiveHot:  '#eb7d4b', emissiveCore: '#ffd699'
      },
      fx: {
        slabColor: '#373f4d',
        slabRim:   '#161921',
        crackTint: '#422c28',
        crackDark: '#17141a',
        sparkHot:  '#eb7d4b',
        sparkCore: '#ffd699',
        dust:      '#606a7a'
      }
    }
  ];

  // =========================================================================
  // 2. 四套四重对称圆角厚石片建模（全部 symDeg: 90，省 4 倍图集贴图）
  //    - slabBase  (40x40x4，实体宽 38 格)：最黑最硬冷石底片
  //    - slabLower (36x36x4，实体宽 34 格)：深焦熔壳，带半冷却暗红裂纹（无自亮）
  //    - slabUpper (32x32x4，实体宽 30 格)：温热熔壳，带暗红炽热裂纹（适量自亮）
  //    - slabCrown (24x24x4，实体宽 22 格)：顶冠厚片，带清晰炽热裂槽（适量自亮）
  // =========================================================================
  function buildLavaSlab(makeCanvas, opts) {
    const {
      boxSize,
      radius,
      mainMat,
      topMat,
      hasVein,
      hasGlow,
      notchDepth,
      crackWidth
    } = opts;

    const W = boxSize, D = boxSize, H = M35_CONFIG.slabHeight;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-radius - 1.0, radius + 1.0, -radius - 1.0, radius + 1.0, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      const ay = Math.abs(Y);
      const ang = Math.atan2(Y, X);

      // 四重对称圆角方岩轮廓（超椭圆 + 4 处自然岩边缺口，保证 symDeg: 90 严格对齐）
      const lobe = Math.cos(ang * 4);
      const notch = Math.pow(Math.max(0, -lobe), 2.2) * notchDepth;
      const superR = Math.pow(Math.pow(ax, 2.7) + Math.pow(ay, 2.7), 1 / 2.7);
      // 底层 z=0 内收形成清晰的分层暗缝，顶层 z=H-1 略微倒角
      const zInset = (z === 0) ? 1.25 : ((z === H - 1) ? 0.55 : 0.0);
      const effLim = radius - notch - zInset + lobe * 0.45;
      if (superR > effLim) return;

      const edgeDist = effLim - superR;

      // 1) 最底一层：深暗分层缝（保证相邻两片叠缝切出厚重暗线）
      if (z === 0) {
        m.setRaw(x, y, z, mat('seam'), partId.seam);
        return;
      }

      // 2) 四重对称熔岩裂纹几何（十字主裂 + 斜向细裂，离中心与边缘留岩肉）
      const dAxis = Math.min(ax, ay);
      const dDiag = Math.abs(ax - ay) * 0.7071;
      const rEuclid = Math.hypot(X, Y);

      // 主裂道：沿四重对称方向微微折曲（仍严格满足 90° 旋转对称）
      const waveAxis = Math.sin(Math.max(ax, ay) * 0.55) * 0.55;
      const onMainCrack = (Math.abs(dAxis - Math.abs(waveAxis)) <= crackWidth) && (rEuclid >= 2.2) && (edgeDist >= 1.1);
      const onDiagCrack = (dDiag <= crackWidth * 0.82) && (rEuclid >= radius * 0.30) && (rEuclid <= radius * 0.76);
      const onCenterPit = hasGlow && (rEuclid <= 2.3) && (z >= H - 2);
      const isCrack = (hasVein || hasGlow) && (onMainCrack || onDiagCrack || onCenterPit);

      // 3) 炽热裂纹着色（仅顶上 2~3 层使用 glowKeys，且严格守住 3 档色阶）
      if (isCrack && z >= H - 2) {
        if (hasGlow) {
          const coreHot = (onCenterPit && rEuclid <= 1.2)
            || (onMainCrack && Math.abs(dAxis - Math.abs(waveAxis)) <= crackWidth * 0.45 && rEuclid < radius * 0.62);
          const midHot = onCenterPit || (onMainCrack && edgeDist >= 2.0) || (onDiagCrack && dDiag <= crackWidth * 0.45);
          if (z === H - 1 && coreHot) {
            m.setRaw(x, y, z, keyToId.emissiveCore, partId.emissive);
          } else if (z === H - 1 && midHot) {
            m.setRaw(x, y, z, keyToId.emissiveHot, partId.emissive);
          } else if (edgeDist >= 2.2 && (onMainCrack || onCenterPit)) {
            m.setRaw(x, y, z, keyToId.emissiveMid, partId.emissive);
          } else {
            m.setRaw(x, y, z, mat('vein'), partId.vein);
          }
          return;
        }
        // 中下层已半冷却裂纹：仅用非自亮暗红 vein
        m.setRaw(x, y, z, mat('vein'), partId.vein);
        return;
      }

      // 裂纹边缘焦红过渡带（仅顶面紧贴裂纹外 1 格）
      const nearCrack = (hasVein || hasGlow) && z === H - 1
        && ((Math.abs(dAxis - Math.abs(waveAxis)) <= crackWidth + 1.05 && rEuclid >= 1.8 && edgeDist >= 1.0)
          || (dDiag <= crackWidth + 0.85 && rEuclid >= radius * 0.28 && rEuclid <= radius * 0.78));
      if (nearCrack) {
        m.setRaw(x, y, z, mat('vein'), partId.vein);
        return;
      }

      // 4) 侧缘风化切棱与岩面嵌矿粗粒
      const isOuterRim = edgeDist <= 1.65 && z >= 2;
      const isSlagNodule = (z === H - 1) && (edgeDist > 2.2) && (edgeDist < 5.0)
        && (Math.abs(ax - ay) > 2.2) && ((Math.round(ax + ay) % 5) === 0);

      if (isOuterRim) {
        m.setRaw(x, y, z, mat('edgeRim'), partId.edgeRim);
      } else if (isSlagNodule) {
        m.setRaw(x, y, z, mat('slag'), partId.slag);
      } else if (z === H - 1) {
        m.setRaw(x, y, z, mat(topMat), partId[topMat]);
      } else {
        m.setRaw(x, y, z, mat(mainMat), partId[mainMat]);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, {
      footRadius: radius,
      headZ: H,
      centerZ: Math.round(H * 0.5)
    });
  }

  // =========================================================================
  // 3. 生物定义：火1 · 留下一层再走的（M35 模板标杆）
  // =========================================================================
  const Fire1SlabShedderDef = {
    id: 'fire1_slab_shedder',
    code: '火1',
    name: '留下一层再走的',
    status: 'done',
    tag: 'M35 标杆 · 厚片分层拆拼',
    summary: '矮壮熔岩岩体由 7 块厚片叠成（复用 4 套四重对称圆角石片资产）：待机错层呼吸、从最底层逐片沉入地缝并在原地留下一块冷石板与焦裂痕、地下潜移至新点后从下往上逐片冒出拼回并由红热缓冷回常态',
    defaultHabitat: 'volcano',
    footRadius: 18.5,
    ecoWeight: 1.6,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    m35Config: M35_CONFIG,
    blocks: [
      '7块厚片复用4套四重对称圆角石片',
      '顶层暗红炽热裂纹至底层黑硬玄武岩色阶',
      '待机错层起伏呼吸',
      '自下而上沉入地缝并原地留下冷石板摆件',
      '目标点焦痕热屑提示与自下而上零穿插拼回'
    ],
    soulHabit: '从不迈步行走：平时七层厚石片微微错开呼吸，要换地方时从最底层逐片沉入地缝，把底片留在原地冷成一块可落脚的石板，随后在别处地缝冒出热屑焦痕，自下而上一层层冒出拼回并由炽红慢慢冷却回深黑',
    actions: [
      { id: 'patrol',     name: '巡游拆拼（留板潜移）', loop: true, status: 'done' },
      { id: 'idle',       name: '原地呼吸（错层起伏）', loop: true, status: 'done' },
      { id: 'reassemble', name: '拆沉拼回循环展示',     loop: true, status: 'done' }
    ],
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        slabBase: buildLavaSlab(makeCanvas, {
          boxSize: 40, radius: 18.8,
          mainMat: 'basalt', topMat: 'basalt',
          hasVein: false, hasGlow: false,
          notchDepth: 1.7, crackWidth: 0.0
        }),
        slabLower: buildLavaSlab(makeCanvas, {
          boxSize: 36, radius: 16.8,
          mainMat: 'basalt', topMat: 'charRock',
          hasVein: true, hasGlow: false,
          notchDepth: 1.5, crackWidth: 0.65
        }),
        slabUpper: buildLavaSlab(makeCanvas, {
          boxSize: 32, radius: 14.8,
          mainMat: 'charRock', topMat: 'crust',
          hasVein: true, hasGlow: true,
          notchDepth: 1.3, crackWidth: 0.78
        }),
        slabCrown: buildLavaSlab(makeCanvas, {
          boxSize: 24, radius: 10.8,
          mainMat: 'crust', topMat: 'crust',
          hasVein: true, hasGlow: true,
          notchDepth: 1.0, crackWidth: 0.88
        })
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.25;
      const seed0 = opts.seed ?? 71;

      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      // 7 块厚片的实时运动态
      const slabs = LAYER_DEFS.map((ld) => ({
        idx: ld.idx,
        assetKey: ld.assetKey,
        baseYaw: ld.baseYaw,
        swayMul: ld.swayMul,
        hotWeight: ld.hotWeight,
        visible: true,
        x: hx0,
        y: hy0,
        lift: ld.idx * M35_CONFIG.slabStepZ,
        ro: wrapAngle(hyaw0 + ld.baseYaw),
        bias: ld.idx * M35_CONFIG.biasStep
      }));

      const state = {
        x: hx0,
        y: hy0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        shadowScale: 1.0,

        // 状态机：'breath' -> 'sink' -> 'shift' -> 'reassemble' -> 'breath'
        phase: 'breath',
        phaseT: 0,
        phaseDur: 3.1,
        heat: 0.45,              // 1 = 刚冒出红热，0 = 冷却回常态
        seq: 1,
        prevAction: 'patrol',

        // 潜移目标点（严格钳制在 maxRadius * 0.78 内）
        originX: hx0,
        originY: hy0,
        targetX: hx0,
        targetY: hy0,
        targetYaw: hyaw0,

        // 特效与留板节流标记
        shedDropped: false,
        shiftHinted: false,
        lastPropTime: -99,
        emergeNotified: 0,
        sparkCd: 0
      };

      function clampInTargetDisc(x, y, hx, hy, safeR) {
        const dx = x - hx;
        const dy = y - hy;
        const d = Math.hypot(dx, dy);
        if (d > safeR && d > 1e-4) {
          return [hx + (dx * safeR) / d, hy + (dy * safeR) / d];
        }
        return [x, y];
      }

      function pickNextTarget(hx, hy, maxR, sMul) {
        const safeR = Math.max(8, maxR * M35_CONFIG.targetRadiusRatio);
        const minDist = Math.min(M35_CONFIG.minHopDist * sMul, safeR * 1.15);
        let bestX = hx, bestY = hy;

        for (let attempt = 0; attempt < 6; attempt++) {
          state.seq++;
          const rAng = hash2i(state.seq, seed0, 131 + attempt * 17);
          const rRad = hash2i(state.seq, seed0, 277 + attempt * 23);
          const curAng = Math.atan2(state.y - hy, state.x - hx);
          const ang = curAng + lerp(1.55, 4.70, rAng);
          const rad = lerp(safeR * 0.32, safeR * 0.96, rRad);
          const cx = hx + Math.cos(ang) * rad;
          const cy = hy + Math.sin(ang) * rad;
          const [clampedX, clampedY] = clampInTargetDisc(cx, cy, hx, hy, safeR);
          bestX = clampedX;
          bestY = clampedY;
          if (Math.hypot(bestX - state.x, bestY - state.y) >= minDist) break;
        }

        state.originX = state.x;
        state.originY = state.y;
        state.targetX = bestX;
        state.targetY = bestY;
        state.targetYaw = wrapAngle(state.yaw + lerp(-0.9, 0.9, hash2i(state.seq, seed0, 389)));
      }

      function spawnHeatSparks(vfx, x, y, z, count, spreadR, sMul, fxCol, speedMul) {
        if (!vfx) return;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * TAU;
          const r = Math.random() * spreadR * sMul;
          const sp = (3.5 + Math.random() * 7.5) * sMul * speedMul;
          vfx.spawnParticle(
            x + Math.cos(a) * r,
            y + Math.sin(a) * r,
            z + Math.random() * 1.6 * sMul,
            Math.cos(a) * sp,
            Math.sin(a) * sp,
            (9.0 + Math.random() * 11.0) * sMul,
            0.42 + Math.random() * 0.30,
            1.15 + Math.random() * 0.55,
            (i % 3 === 0) ? fxCol.sparkCore : fxCol.sparkHot,
            true,
            14
          );
        }
      }

      function dropColdSlab(vfx, time, sMul, fxCol, isCompact) {
        if (!vfx) return;
        // 留板节流：保证场面稳定维持约 4~6 块并自然淡出，不刷屏
        if (time - state.lastPropTime >= M35_CONFIG.minPropInterval) {
          state.lastPropTime = time;
          vfx.addGroundProp({
            kind: 'slab',
            x: state.originX,
            y: state.originY,
            yaw: state.yaw,
            radius: M35_CONFIG.slabPropRadius * sMul,
            life: isCompact ? M35_CONFIG.compactPropLife : M35_CONFIG.slabPropLife,
            color: fxCol.slabColor,
            rimColor: fxCol.slabRim
          });
        }
        // 原地留下一小圈焦裂痕 + 少量沉落岩尘
        vfx.addDecal({
          kind: 'crack',
          x: state.originX,
          y: state.originY,
          yaw: state.yaw,
          rx: 10.6 * sMul,
          ry: 10.6 * sMul,
          life: 8.0,
          alpha: 0.80,
          color: fxCol.crackTint,
          darkColor: fxCol.crackDark
        });
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * TAU + Math.random() * 0.4;
          const rr = (7.0 + Math.random() * 4.5) * sMul;
          vfx.spawnParticle(
            state.originX + Math.cos(a) * rr,
            state.originY + Math.sin(a) * rr,
            1.0 * sMul,
            Math.cos(a) * 6.0 * sMul,
            Math.sin(a) * 6.0 * sMul,
            (5.0 + Math.random() * 5.0) * sMul,
            0.45,
            1.45,
            fxCol.dust,
            false,
            24
          );
        }
      }

      function enterBreath(isCompact) {
        state.phase = 'breath';
        state.phaseT = 0;
        state.seq++;
        if (isCompact) {
          state.phaseDur = M35_CONFIG.compactBreath;
        } else {
          const [dMin, dMax] = M35_CONFIG.breathDuration;
          state.phaseDur = lerp(dMin, dMax, hash2i(state.seq, seed0, 419));
        }
      }

      function enterSink(hx, hy, maxR, sMul) {
        state.phase = 'sink';
        state.phaseT = 0;
        state.phaseDur = M35_CONFIG.sinkDuration;
        state.shedDropped = false;
        pickNextTarget(hx, hy, maxR, sMul);
      }

      function enterShift(vfx, sMul, fxCol) {
        state.phase = 'shift';
        state.phaseT = 0;
        state.phaseDur = M35_CONFIG.shiftDuration;
        state.shiftHinted = true;
        // 地下潜移：将逻辑锚点移至已钳制的目标点
        state.x = state.targetX;
        state.y = state.targetY;
        state.yaw = state.targetYaw;
        if (vfx) {
          vfx.addDecal({
            kind: 'crack',
            x: state.targetX,
            y: state.targetY,
            yaw: state.targetYaw,
            rx: 9.8 * sMul,
            ry: 9.8 * sMul,
            life: 7.5,
            alpha: 0.86,
            color: fxCol.crackTint,
            darkColor: fxCol.crackDark
          });
          spawnHeatSparks(vfx, state.targetX, state.targetY, 1.0 * sMul, 5, 6.0, sMul, fxCol, 1.0);
        }
      }

      function enterReassemble(vfx, sMul, fxCol) {
        state.phase = 'reassemble';
        state.phaseT = 0;
        state.phaseDur = M35_CONFIG.reassembleDuration;
        state.emergeNotified = 0;
        state.heat = 1.0;
        if (vfx) {
          vfx.addRipple(state.x, state.y, 4.0 * sMul, 16.0 * sMul, 0.55, 1.6);
          spawnHeatSparks(vfx, state.x, state.y, 1.2 * sMul, 6, 7.5, sMul, fxCol, 1.1);
        }
      }

      const instance = {
        def: Fire1SlabShedderDef,
        cachePrefix: `fire1_slab_shedder_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.shadowScale = 1.0;
          state.phase = 'breath';
          state.phaseT = 0;
          state.phaseDur = 2.8;
          state.heat = 0.55;
          state.seq = 1;
          state.originX = homeX;
          state.originY = homeY;
          state.targetX = homeX;
          state.targetY = homeY;
          state.targetYaw = homeYaw;
          state.shedDropped = false;
          state.shiftHinted = false;
          state.lastPropTime = -99;
          state.emergeNotified = 0;
          state.sparkCd = 0;

          for (let i = 0; i < slabs.length; i++) {
            const sl = slabs[i];
            sl.visible = true;
            sl.x = homeX;
            sl.y = homeY;
            sl.lift = i * M35_CONFIG.slabStepZ;
            sl.ro = wrapAngle(homeYaw + sl.baseYaw);
            sl.bias = i * M35_CONFIG.biasStep;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.4, 2.0);
          const hx = (eco && eco.homeX) ?? 0;
          const hy = (eco && eco.homeY) ?? 0;
          const maxR = (eco && eco.maxRadius) || 46;
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const isIdle = (action === 'idle');
          const isCompact = (action === 'reassemble');
          const fxCol = curSkin.fx || SKINS[0].fx;

          // 动作切换响应
          if (action !== state.prevAction) {
            state.prevAction = action;
            if (isIdle) {
              state.phase = 'breath';
              state.phaseT = 0;
              state.phaseDur = 999;
            } else if (isCompact) {
              enterSink(hx, hy, maxR, sMul);
            } else if (state.phase === 'breath' && state.phaseDur > 10) {
              enterBreath(false);
            }
          }

          // -----------------------------------------------------------------
          // 1. 状态机推进
          // -----------------------------------------------------------------
          const stepDt = dt * (state.phase === 'breath' ? 1.0 : spdMul);
          state.phaseT += stepDt;

          if (!isIdle && state.phaseT >= state.phaseDur) {
            if (state.phase === 'breath') {
              enterSink(hx, hy, maxR, sMul);
            } else if (state.phase === 'sink') {
              if (!state.shedDropped) {
                state.shedDropped = true;
                dropColdSlab(vfx, time, sMul, fxCol, isCompact);
              }
              enterShift(vfx, sMul, fxCol);
            } else if (state.phase === 'shift') {
              enterReassemble(vfx, sMul, fxCol);
            } else if (state.phase === 'reassemble') {
              enterBreath(isCompact);
            }
          }

          // -----------------------------------------------------------------
          // 2. 各状态 7 层厚片坐标解算（严格保证 lift 与 bias 由下往上递增、零穿插）
          // -----------------------------------------------------------------
          const N = M35_CONFIG.slabCount;
          const stepZ = M35_CONFIG.slabStepZ * sMul;
          const p = clamp(state.phaseT / Math.max(0.01, state.phaseDur), 0, 1);

          footContacts.length = 0;

          if (state.phase === 'breath') {
            // 原地待机时缓缓回归原点
            if (isIdle) {
              const kHome = expSmooth(dt, 3.2);
              state.x = lerp(state.x, hx, kHome);
              state.y = lerp(state.y, hy, kHome);
            }
            // 拼回后的余热冷却：由红热高活跃逐步冷却至常态微热
            if (state.heat > 0) {
              state.heat = Math.max(0, state.heat - dt / M35_CONFIG.coolDuration);
            }
            state.shadowScale = 1.0;

            const swayBase = M35_CONFIG.breathSwayAmp * flex * sMul;
            const liftBase = M35_CONFIG.breathLiftAmp * sMul;
            let prevLift = -1;

            for (let i = 0; i < N; i++) {
              const sl = slabs[i];
              const ph = time * 2.05 * gFreq - i * 0.72;
              const ox = Math.sin(ph) * swayBase * sl.swayMul;
              const oy = Math.cos(ph * 0.78 + i * 1.15) * swayBase * 0.72 * sl.swayMul;
              // 刚冒出热态时顶上 2~3 层略微张开透气，冷却后缓缓合拢压实
              const heatGap = state.heat * sl.hotWeight * 0.55 * sMul;
              const breathLift = (0.5 + 0.5 * Math.sin(ph)) * liftBase * (0.5 + 0.5 * sl.swayMul);
              const rawLift = i * stepZ + breathLift + heatGap;
              const safeLift = (i === 0) ? Math.max(0, rawLift) : Math.max(rawLift, prevLift + 0.6 * sMul);

              sl.visible = true;
              sl.x = state.x + ox;
              sl.y = state.y + oy;
              sl.lift = safeLift;
              sl.ro = wrapAngle(state.yaw + sl.baseYaw + Math.sin(ph * 0.65) * 0.045 * flex);
              sl.bias = i * M35_CONFIG.biasStep;
              prevLift = safeLift;
            }

            // 呼吸态顶部裂纹微弱热屑（刚拼回余热期稍密，冷却后偶发）
            state.sparkCd -= dt;
            const sparkInterval = lerp(0.58, 0.16, state.heat);
            if (vfx && state.sparkCd <= 0) {
              state.sparkCd = sparkInterval;
              const topSlab = slabs[N - 1];
              spawnHeatSparks(vfx, topSlab.x, topSlab.y, topSlab.lift + 3.2 * sMul, state.heat > 0.25 ? 2 : 1, 7.5, sMul, fxCol, 0.75);
            }
            footContacts.push({ x: state.x, y: state.y, z: 0, r: 16.5 * sMul });

          } else if (state.phase === 'sink') {
            // 逐层沉入地缝（自下而上 i = 0 -> 6）：底层先沉，高层始终高于底层，零穿插
            const stagger = 0.095;
            const perSpan = Math.max(0.22, 1.0 - (N - 1) * stagger);
            let visibleCount = 0;
            let prevLift = -1;

            for (let i = 0; i < N; i++) {
              const sl = slabs[i];
              const orderIdx = (M35_CONFIG.shedOrder === 'topDown') ? (N - 1 - i) : i;
              const u = clamp((p - orderIdx * stagger) / perSpan, 0, 1);

              // 第 0 层刚沉到底时，立即在原地留下冷石板摆件 + 一圈焦裂痕
              if (i === 0 && u >= 0.72 && !state.shedDropped) {
                state.shedDropped = true;
                dropColdSlab(vfx, time, sMul, fxCol, isCompact);
              }

              if (u >= 0.98) {
                sl.visible = false;
                continue;
              }

              visibleCount++;
              const easeIn = u * u * (2.2 - 1.2 * u);
              const baseZ = i * stepZ;
              // 尚未轮到的上层微微下压蓄沉，轮到时快速沉入地缝
              const rawLift = Math.max(0, lerp(baseZ, 0.0, easeIn));
              const safeLift = (prevLift < 0) ? rawLift : Math.max(rawLift, prevLift + 0.55 * sMul);
              const pullIn = 1.0 - easeIn;
              const jitter = Math.sin(time * 34 + i * 2.1) * 0.35 * (1 - pullIn) * sMul;

              sl.visible = true;
              sl.x = state.x + jitter;
              sl.y = state.y - jitter * 0.6;
              sl.lift = safeLift;
              sl.ro = wrapAngle(state.yaw + sl.baseYaw + easeIn * 0.18 * (i % 2 === 0 ? 1 : -1));
              sl.bias = i * M35_CONFIG.biasStep;
              prevLift = safeLift;
            }

            state.shadowScale = visibleCount / N;
            state.sparkCd -= dt;
            if (vfx && state.sparkCd <= 0) {
              state.sparkCd = 0.14;
              spawnHeatSparks(vfx, state.x, state.y, 1.5 * sMul, 2, 11.0, sMul, fxCol, 0.9);
            }

          } else if (state.phase === 'shift') {
            // 地下潜移提示：本体完全隐于地下，目标点地缝冒出少量热屑与焦痕
            for (let i = 0; i < N; i++) slabs[i].visible = false;
            state.shadowScale = 0.0;
            state.sparkCd -= dt;
            if (vfx && state.sparkCd <= 0) {
              state.sparkCd = 0.12;
              spawnHeatSparks(vfx, state.targetX, state.targetY, 0.9 * sMul, 2, 7.5, sMul, fxCol, 1.05);
            }

          } else if (state.phase === 'reassemble') {
            // 目标点自下而上逐层冒出拼回（i = 0 -> 6）：
            // 每层从 baseLift[i] - emergeTravelZ 冒起落位，严格保证 lift 与 bias 由下往上递增
            const stagger = 0.095;
            const perSpan = Math.max(0.22, 1.0 - (N - 1) * stagger);
            const travelZ = M35_CONFIG.emergeTravelZ * sMul;
            let visibleCount = 0;
            let prevLift = -1;

            for (let i = 0; i < N; i++) {
              const sl = slabs[i];
              const orderIdx = (M35_CONFIG.assembleOrder === 'topDown') ? (N - 1 - i) : i;
              const u = clamp((p - orderIdx * stagger) / perSpan, 0, 1);

              if (u <= 0.001) {
                sl.visible = false;
                continue;
              }

              // 新一层破缝冒出时喷发少量红热碎屑
              if (i >= state.emergeNotified) {
                state.emergeNotified = i + 1;
                if (vfx && i >= 3) {
                  spawnHeatSparks(vfx, state.x, state.y, i * stepZ + 1.5 * sMul, 2, 8.5, sMul, fxCol, 0.95);
                }
              }

              visibleCount++;
              const easeOut = smoothstep(0, 1, u);
              // 轻微落位微弹（限幅 <= 0.35 格，绝不破坏相邻层 lift 单调递增）
              const settle = Math.sin(u * Math.PI) * 0.32 * (1 - u) * sMul;
              const targetZ = i * stepZ + sl.hotWeight * 0.55 * sMul;
              const startZ = (i === 0) ? 0.0 : Math.max(0, targetZ - travelZ);
              const rawLift = lerp(startZ, targetZ, easeOut) + settle;
              const safeLift = (prevLift < 0) ? Math.max(0, rawLift) : Math.max(rawLift, prevLift + 0.65 * sMul);

              // 刚冒出时带轻微错角，落位后旋正到各自错层基准角
              const twist = (1 - easeOut) * 0.24 * (i % 2 === 0 ? 1 : -1);
              sl.visible = true;
              sl.x = state.x + (1 - easeOut) * Math.cos(i * 1.9) * 1.1 * sMul;
              sl.y = state.y + (1 - easeOut) * Math.sin(i * 1.9) * 1.1 * sMul;
              sl.lift = safeLift;
              sl.ro = wrapAngle(state.yaw + sl.baseYaw + twist);
              sl.bias = i * M35_CONFIG.biasStep;
              prevLift = safeLift;
            }

            state.shadowScale = visibleCount / N;
            if (visibleCount > 0) {
              footContacts.push({ x: state.x, y: state.y, z: 0, r: 16.5 * sMul * (visibleCount / N) });
            }
          }

          // 挂点同步（顶冠中心）
          const topZ = slabs[N - 1].visible ? (slabs[N - 1].lift + M35_CONFIG.slabHeight * sMul) : 0;
          sockets.setWorld('crown', state.x, state.y, topZ, state.yaw);
        },

        buildPartList() {
          const list = [];
          for (let i = 0; i < slabs.length; i++) {
            const sl = slabs[i];
            if (!sl.visible) continue;
            list.push({
              partKey: sl.assetKey,
              asset: parts[sl.assetKey],
              x: sl.x,
              y: sl.y,
              lift: sl.lift,
              ro: sl.ro,
              symDeg: 90,
              bias: sl.bias
            });
          }
          return list;
        },

        exportManifest(params) {
          return {
            id: Fire1SlabShedderDef.id,
            code: Fire1SlabShedderDef.code,
            name: Fire1SlabShedderDef.name,
            status: Fire1SlabShedderDef.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            phase: state.phase,
            heat: Number(state.heat.toFixed(3)),
            slabCount: M35_CONFIG.slabCount,
            slabStepZ: M35_CONFIG.slabStepZ,
            biasStep: M35_CONFIG.biasStep,
            footRadius: Fire1SlabShedderDef.footRadius,
            headZ: Math.round((M35_CONFIG.slabCount - 1) * M35_CONFIG.slabStepZ + M35_CONFIG.slabHeight),
            centerZ: Math.round(((M35_CONFIG.slabCount - 1) * M35_CONFIG.slabStepZ) * 0.5),
            blocks: Fire1SlabShedderDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map((k) => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Fire1SlabShedderDef);
})(window.PixelWorkshop);
