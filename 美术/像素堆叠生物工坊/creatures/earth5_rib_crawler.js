'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 地5 · 在肋骨间穿行的长多足（M23 超长多足波浪标杆，+Y 正前）
  //   1. 高对比体貌与清晰度：象牙骨白/暖灰棱角背甲 + 醒目深绛红软膜缝隙/20 对步足 +
  //      铁锈橙气孔与加粗超长探测触角；宽扁铲状头盾配 2x2 清晰复眼，一秒分清头尾；
  //   2. 防爆贴图与零 IK 麦浪：18 节体节链（相邻重叠 44.0% 消除串珠），全部躯干仅共享
  //      2 套交替体节资产（segA / segB），18 对步足仅共享 3 帧预烘成对小件（legPair0/1/2）
  //      沿链按相位错开轮播，零 IK 跑出流畅麦浪步态；
  //   3. 2 根拱起巨兽肋骨道具件：拆分为半埋骨根（ribPillar）与高拱穹顶（ribSpan），
  //      360° 视角下长身子稳稳从肋骨下方与后方蜿蜒穿行，零穿模；
  //   4. 动作完备：patrol（穿行双肋骨 + 麦浪步态 + 触角交替点地探路）、
  //      idle（防御盘圈姿态，硬甲朝外、触角在内微探）、
  //      coil（受惊急速收拢盘圈防御与缓缓舒展演示）。
  // =========================================================================

  // 严格 27 色、0 重色（<= 48 色上限），glowKeys 为空（零自亮防糊）
  const SPEC = createPaletteSpec({
    pal: {
      // 象牙骨白/暖灰盾甲（主背甲）
      plateDark: '#9e927d',
      plateMid:  '#d9ccb2',
      plateHi:   '#faf4e6',
      // 背甲厚棱脊与甲边暗骨缘
      ridgeDark: '#594e40',
      ridgeMid:  '#827460',
      ridgeHi:   '#b8a990',
      // 节间软膜与腹腔（醒目深绛红）
      seamDark:  '#540d17',
      seamMid:   '#9c1c2c',
      seamHi:    '#d93848',
      // 侧缘气孔与甲角亮斑（高对比铁锈橙）
      poreDark:  '#9e3210',
      poreMid:   '#e85a1c',
      poreHi:    '#ff9c38',
      // 步足（深绛红配亮橙爪尖）
      legDark:   '#69121a',
      legMid:    '#bd2630',
      legHi:     '#f25c49',
      // 超长探测触角（亮橙/绛红分节）
      antDark:   '#a82c12',
      antMid:    '#ed5a21',
      antHi:     '#ffad42',
      // 清晰 2x2 复眼（不进 glowKeys）
      eyeDark:   '#120a0d',
      eyeIris:   '#ff731c',
      eyeGlint:  '#fffdf2',
      // 巨兽遗骸肋骨道具件（偏冷暗的陈年枯骨，与生物暖象牙甲拉开对比）
      ribDark:   '#524c44',
      ribMid:    '#857d70',
      ribHi:     '#b8b0a0',
      // 肋骨根部淡青腐菌苔
      mossDark:  '#365448',
      mossMid:   '#558270',
      mossHi:    '#82b59e'
    },
    glowKeys: [],
    parts: ['plate', 'ridge', 'seam', 'pore', 'leg', 'ant', 'eye', 'rib', 'moss'],
    noCrease: [
      ['plate', 'ridge'],
      ['plate', 'eye'],
      ['plate', 'pore'],
      ['seam', 'leg'],
      ['rib', 'moss']
    ],
    materials: {
      plate: ['plateDark', 'plateMid', 'plateHi'],
      ridge: ['ridgeDark', 'ridgeMid', 'ridgeHi'],
      seam:  ['seamDark',  'seamMid',  'seamHi'],
      pore:  ['poreDark',  'poreMid',  'poreHi'],
      leg:   ['legDark',   'legMid',   'legHi'],
      ant:   ['antDark',   'antMid',   'antHi'],
      rib:   ['ribDark',   'ribMid',   'ribHi'],
      moss:  ['mossDark',  'mossMid',  'mossHi']
    },
    protectedParts: ['eye', 'pore', 'ant']
  });

  // 3 套零重建模换色皮肤（绛缝骨白、菌青枯骨、琥珀腐甲）
  const SKINS = [
    {
      id: 'crimson_ivory',
      name: '绛缝骨白',
      dot: '#bd2630',
      outline: '#1a0a0c',
      pal: {},
      fx: { dust: '#8c6e54', spore: '#d94838' }
    },
    {
      id: 'mycelium_bone',
      name: '菌青枯骨',
      dot: '#28a894',
      outline: '#091716',
      pal: {
        plateDark: '#858a7e', plateMid: '#c2c7b8', plateHi: '#ebf0e4',
        ridgeDark: '#484f46', ridgeMid: '#6b7568', ridgeHi: '#9ea899',
        seamDark:  '#0c4a47', seamMid:  '#18857d', seamHi:  '#3cc9ba',
        poreDark:  '#1c7a62', poreMid:  '#32c299', poreHi:  '#80f2cc',
        legDark:   '#105752', legMid:   '#20998e', legHi:   '#5ce0cf',
        antDark:   '#166e5e', antMid:   '#2eb89e', antHi:   '#8cf7df',
        eyeIris:   '#5cf2d4'
      },
      fx: { dust: '#6c7d73', spore: '#42cca8' }
    },
    {
      id: 'amber_rot',
      name: '琥珀腐甲',
      dot: '#d97b1e',
      outline: '#1c1008',
      pal: {
        plateDark: '#7a634b', plateMid: '#b59674', plateHi: '#e3cba8',
        ridgeDark: '#473626', ridgeMid: '#6e543c', ridgeHi: '#9e7e5e',
        seamDark:  '#66240a', seamMid:  '#b84612', seamHi:  '#ed7824',
        poreDark:  '#a8520c', poreMid:  '#eb8b1c', poreHi:  '#ffd154',
        legDark:   '#782e0c', legMid:   '#cc5618', legHi:   '#fa9237',
        antDark:   '#9e480a', antMid:   '#e87e1a', antHi:   '#ffc947',
        eyeIris:   '#ffbe2e'
      },
      fx: { dust: '#8f6b47', spore: '#eb8b1c' }
    }
  ];

  // =========================================================================
  // 1. 共享体素资产建模（共 11 套轻量左右对称资产，渲染器自动半角烘焙）
  // =========================================================================

  // 宽扁铲状骨头盾（18x18x9，含大颚钳、清晰 2x2 复眼、后缘绛红颈膜）
  function buildHeadShield(makeCanvas) {
    const W = 18, D = 18, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 1. 底部绛红肉腹与后颈衔接囊（深入至 -6.2 与第 1 节紧密咬合）
    m.paintCapsule(0, -6.2, 2.2, 0, 1.8, 2.2, 4.2, 3.6, mat('seam'), partId.seam, true);

    // 2. 宽扁铲状象牙骨头盾（前宽后收、边缘棱角分明、中线双骨脊）
    m.fillAABB(-7.8, 7.8, -5.5, 6.8, 2, 7, (x, y, z, X, Y) => {
      const t = clamp((Y + 5.0) / 11.4, 0, 1);
      // 铲形轮廓：中段最宽 7.4，前铲缘宽阔圆钝 5.2，后缘微收 5.6
      const halfW = t < 0.55
        ? lerp(5.4, 7.5, t / 0.55)
        : lerp(7.5, 4.4, Math.pow((t - 0.55) / 0.45, 1.35));
      if (Math.abs(X) > halfW) return;
      const topZ = lerp(6.6, 4.2, Math.pow(t, 1.1)) - (Math.abs(X) / Math.max(1, halfW)) * 1.4;
      const botZ = lerp(2.8, 2.0, t);
      if (z < botZ || z > topZ) return;

      const isEdge = Math.abs(X) > halfW - 1.25 || Y < -3.6 || Y > 5.0;
      const isMidRidge = Math.abs(Math.abs(X) - 1.8) < 0.85 && Y > -3.5 && Y < 3.6 && z >= topZ - 1.1;
      const isPore = Math.abs(X) > halfW - 2.3 && Math.abs(X) < halfW - 0.7 && Math.abs(Y - 0.2) < 1.3 && z >= topZ - 1.2;

      if (isPore) {
        m.setRaw(x, y, z, mat('pore'), partId.pore);
      } else if (isEdge || isMidRidge) {
        m.setRaw(x, y, z, mat('ridge'), partId.ridge);
      } else {
        m.setRaw(x, y, z, mat('plate'), partId.plate);
      }
    });

    // 3. 左右外张的深绛红大颚钳（前探至 +8.0，增强异兽捕食/分解辨识度）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 3.2, 4.2, 2.4, s * 4.8, 6.6, 2.2, 1.15, 0.85, mat('seam'), partId.seam, true);
      m.paintCapsule(s * 4.8, 6.6, 2.2, s * 2.6, 8.0, 2.0, 0.85, 0.55, mat('pore'), partId.pore, true);
      // 触角根部高亮基座
      m.paintEllipsoid(s * 4.8, 3.6, 4.4, 1.25, 1.25, 1.15, mat('ant'), partId.ant, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 4. 清晰 2x2 表面复眼（位于头盾前侧上方，0.6 俯视 0 遮挡，eyeGlint 不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.5);
    const eyeZ = 5;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 4.2);
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const col = (dy === 1 && dz === 1)
            ? keyToId.eyeGlint
            : ((dy === 0 && dz === 0) ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(ex, eyeY + dy, eyeZ + dz, col, partId.eye);
          m.setRaw(ex + s, eyeY + dy, eyeZ + dz, col, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 7.4, headZ: 8, centerZ: 4 });
  }

  // 交替躯干体节（16x14x8，仅 2 套共享资产 segA / segB）
  // 有效前后实体长度 L_eff = 10.0 格，配合 SEG_LEN = 5.6 格实现 44.0% 重叠零串珠
  function buildBodySegment(makeCanvas, variant) {
    const isA = variant === 'A';
    const W = 16, D = 14, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 1. 下层深绛红软膜节囊（完整贯通前后 -5.0 ~ +5.0，形成醒目的红缝分节）
    m.fillAABB(-5.6, 5.6, -5.0, 5.0, 1, 5, (x, y, z, X, Y) => {
      const nx = X / (isA ? 5.2 : 4.8);
      const ny = Y / 5.0;
      const nz = (z - 2.6) / 2.2;
      if (nx * nx + ny * ny + nz * nz <= 1.0) {
        m.setRaw(x, y, z, mat('seam'), partId.seam);
      }
    });

    // 2. 上层宽厚棱角分明象牙骨盾甲（前后故意留出 1.6 格深绛红软膜缝，俯视红骨相间极醒目！）
    const halfWMax = isA ? 7.3 : 6.4;
    const yFront = isA ? 3.5 : 2.8;
    const yBack  = isA ? -3.6 : -3.4;

    m.fillAABB(-7.5, 7.5, -4.5, 4.5, 3, 7, (x, y, z, X, Y) => {
      if (Y < yBack || Y > yFront) return;
      // 六边形外展护翼廓线：中段宽出尖角，前后收折
      const uY = (Y - yBack) / (yFront - yBack); // 0..1
      const wingFactor = 1.0 - Math.abs(uY - 0.45) * 0.48;
      const halfW = halfWMax * wingFactor;
      if (Math.abs(X) > halfW) return;

      const archZ = (isA ? 7.0 : 6.5) - Math.pow(Math.abs(X) / Math.max(1, halfW), 1.5) * 2.2;
      const botZ = 3.1;
      if (z < botZ || z > archZ) return;

      // 侧缘气孔（醒目铁锈橙亮斑，每节左右各 1 枚，俯视清晰成排）
      const isPore = Math.abs(X) > halfW - 2.1 && Math.abs(X) < halfW - 0.5 && Math.abs(Y + 0.2) < 1.25 && z >= archZ - 1.3;
      // 背甲棱脊与边缘暗骨框
      const isBorder = Math.abs(X) > halfW - 1.15 || Y > yFront - 1.0 || Y < yBack + 1.0;
      const isSpine = (isA ? Math.abs(Math.abs(X) - 1.7) < 0.75 : Math.abs(X) < 0.95) && z >= archZ - 1.0;

      if (isPore) {
        m.setRaw(x, y, z, mat('pore'), partId.pore);
      } else if (isBorder || isSpine) {
        m.setRaw(x, y, z, mat('ridge'), partId.ridge);
      } else {
        m.setRaw(x, y, z, mat('plate'), partId.plate);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: halfWMax, headZ: 7, centerZ: 4 });
  }

  // 后收骨尾盾 + 一对短尾须（14x14x8，明显短于前触角，一秒分清头尾）
  function buildTailShield(makeCanvas) {
    const W = 14, D = 14, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 绛红尾囊
    m.paintCapsule(0, 4.2, 2.4, 0, -2.5, 2.2, 4.0, 2.0, mat('seam'), partId.seam, true);

    // 尖收骨尾盾
    m.fillAABB(-6.0, 6.0, -4.5, 4.5, 3, 7, (x, y, z, X, Y) => {
      const t = clamp((Y + 3.8) / 7.8, 0, 1); // 0 尾尖 -> 1 前缘
      const halfW = lerp(1.6, 5.8, Math.pow(t, 0.85));
      if (Math.abs(X) > halfW) return;
      const topZ = lerp(4.2, 6.4, t) - (Math.abs(X) / Math.max(1, halfW)) * 1.4;
      if (z < 2.8 || z > topZ) return;
      const isBorder = Math.abs(X) > halfW - 1.1 || Y < -2.6 || Y > 3.0;
      m.setRaw(x, y, z, isBorder ? mat('ridge') : mat('plate'), isBorder ? partId.ridge : partId.plate);
    });

    // 一对短而尖的亮橙/绛红尾须（向后外张至 -6.2）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.8, -2.2, 3.0, s * 3.8, -5.8, 2.8, 0.95, 0.55, mat('leg'), partId.leg, true);
      m.paintEllipsoid(s * 3.9, -6.0, 2.8, 0.65, 0.65, 0.65, mat('pore'), partId.pore, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.8, headZ: 7, centerZ: 3 });
  }

  // 加粗超长探测触角分节（2 节：antBase / antTip，截面 2x2 保证 ×4 俯视清晰醒目）
  function buildAntennaSeg(makeCanvas, isTip) {
    const W = 5, D = isTip ? 10 : 11, H = 5;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const len = isTip ? 7.8 : 8.6;
    const r0 = isTip ? 0.95 : 1.20;
    const r1 = isTip ? 0.65 : 0.95;

    // 沿 +Y 方向伸展，枢轴位于后端 (0, -len*0.42)
    m.paintCapsule(0, -len * 0.45, 2.0, 0, len * 0.48, isTip ? 1.5 : 2.1, r0, r1, mat('ant'), partId.ant, true);
    // 节环与亮尖强化分节感
    if (!isTip) {
      m.paintEllipsoid(0, 0.0, 2.1, 1.32, 1.0, 1.25, mat('seam'), partId.seam, true);
    } else {
      m.paintEllipsoid(0, len * 0.45, 1.5, 0.95, 1.05, 0.95, mat('pore'), partId.pore, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0, headZ: 4, centerZ: 2 });
  }

  // 3 帧预烘成对步足小件（24x12x6，零 IK 跑麦浪步态！）
  // frame 0: 左前抬 + 右后蹬 | frame 1: 左右中立外展 | frame 2: 左后蹬 + 右前抬
  function buildLegPair(makeCanvas, frame) {
    const W = 24, D = 12, H = 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 左足(-1) 与 右足(+1) 的前后摆幅与抬脚高度
    const leftSwing  = frame === 0 ?  3.4 : (frame === 2 ? -3.4 :  0.0);
    const rightSwing = frame === 0 ? -3.4 : (frame === 2 ?  3.4 :  0.0);
    const leftLift   = frame === 0 ?  1.8 : (frame === 1 ?  0.4 :  0.0);
    const rightLift  = frame === 2 ?  1.8 : (frame === 1 ?  0.4 :  0.0);

    const sides = [
      { s: -1, sw: leftSwing,  lf: leftLift  },
      { s:  1, sw: rightSwing, lf: rightLift }
    ];

    for (const { s, sw, lf } of sides) {
      // 股节：从体侧 (s*5.2, 0, 2.6) 向外折肘至 (s*8.6, sw*0.55, 3.3 + lf*0.5)
      const kx = s * 8.6;
      const ky = sw * 0.55;
      const kz = 3.2 + lf * 0.55;
      m.paintCapsule(s * 5.0, 0, 2.5, kx, ky, kz, 1.15, 1.0, mat('leg'), partId.leg, true);
      // 胫节与亮橙爪尖：从肘部外探至 (s*10.8, sw, 0.8 + lf)
      const fx = s * 10.6;
      const fy = sw;
      const fz = 0.8 + lf;
      m.paintCapsule(kx, ky, kz, fx, fy, fz, 0.95, 0.72, mat('leg'), partId.leg, true);
      m.paintEllipsoid(fx, fy, fz, 0.85, 0.85, 0.78, mat('pore'), partId.pore, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 11.0, headZ: 5, centerZ: 2 });
  }

  // 巨兽肋骨道具件 A：半埋骨根（9x9x13，修长白骨柱体，插在南北两端腐土中）
  function buildRibPillar(makeCanvas) {
    const W = 9, D = 9, H = 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 修长白骨柱体，底部嵌入腐土，顶部平滑承接高拱穹顶
    m.paintCapsule(0, 0, 0.8, 0, 0, 11.4, 2.5, 1.95, mat('rib'), partId.rib, true);
    // 根部腐土与淡青菌苔斑块（增强半埋地台的接地感）
    m.paintEllipsoid(0, 0, 0.9, 3.2, 3.2, 1.2, mat('moss'), partId.moss, true);
    m.paintEllipsoid(1.6, 1.1, 2.4, 1.0, 1.0, 0.95, mat('moss'), partId.moss, true);
    m.paintEllipsoid(-1.6, -1.1, 2.4, 1.0, 1.0, 0.95, mat('moss'), partId.moss, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.3, headZ: 12, centerZ: 6 });
  }

  // 巨兽肋骨道具件 B：高拱穹顶（10x30x11，沿 Y 轴大跨距横跨南北骨根，给穿行体节留足净空）
  function buildRibSpan(makeCanvas) {
    const W = 10, D = 30, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 沿 Y ∈ [-13.5, +13.5] 画出宽阔高耸的巨兽肋骨大弯拱
    const steps = 20;
    for (let i = 0; i < steps; i++) {
      const u0 = i / steps;
      const u1 = (i + 1) / steps;
      const y0 = lerp(-13.5, 13.5, u0);
      const y1 = lerp(-13.5, 13.5, u1);
      const z0 = 0.8 + Math.sin(u0 * Math.PI) * 7.8;
      const z1 = 0.8 + Math.sin(u1 * Math.PI) * 7.8;
      // 略带弧度偏移让肋骨更具天然生物骨骼曲线
      const x0 = Math.sin(u0 * Math.PI) * 1.4;
      const x1 = Math.sin(u1 * Math.PI) * 1.4;
      const r0 = lerp(2.05, 1.65, Math.sin(u0 * Math.PI));
      const r1 = lerp(2.05, 1.65, Math.sin(u1 * Math.PI));
      m.paintCapsule(x0, y0, z0, x1, y1, z1, r0, r1, mat('rib'), partId.rib, true);
    }
    // 拱腰点缀点状青苔斑
    m.paintEllipsoid(1.2, -7.2, 5.4, 1.0, 1.2, 0.85, mat('moss'), partId.moss, true);
    m.paintEllipsoid(1.2,  7.2, 5.4, 1.0, 1.2, 0.85, mat('moss'), partId.moss, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 13.5, headZ: 10, centerZ: 5 });
  }

  // =========================================================================
  // 2. 链与步态核心参数（M23 模板卡实测红线）
  // =========================================================================
  const NUM_NODES = 18;           // 0: 头盾, 1..16: 交替 segA/segB, 17: 尾盾
  const SEG_LEN = 5.6;            // 体节有效长 10.0 格 → 相邻重叠 44.0%（消除串珠）
  const WAVE_PHASE_STEP = 0.65;   // 相邻节步足相位差（约 9.7 节一完整麦浪，全长 ~1.8 浪）
  const ANT_PIVOT = { x: 0, y: -3.5 };

  const Earth5RibCrawlerDef = {
    id: 'earth5_rib_crawler',
    code: '地5',
    name: '在肋骨间穿行的长多足',
    status: 'done',
    tag: 'M23 标杆 · 超长多足波浪',
    summary: '18 节象牙骨甲与深绛红软膜相间的超长多足，共享 2 套躯干件与 3 帧成对步足小件零 IK 跑出麦浪步态，宽扁头盾配 2 节超长探测触角，在 2 根巨兽肋骨拱下蜿蜒穿行、受惊盘圈防御',
    defaultHabitat: 'carcass',
    footRadius: 14.0,
    ecoWeight: 1.35,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '18 节高重叠象牙骨甲链',
      '3 帧共享成对步足零 IK 麦浪',
      '宽扁铲状头盾与 2 节超长探测触角',
      '2 根半埋巨兽肋骨真穿行拱门',
      '防御盘圈与受惊收拢舒展状态机'
    ],
    soulHabit: '在巨兽遗骸的两根白骨肋拱下蜿蜒穿进穿出，18 对绛红步足掀起绵延麦浪，一对亮橙长触角不停在前方点地试探；受惊时瞬间收拢盘成硬甲朝外的防御圆环',
    actions: [
      { id: 'patrol', name: '自由巡游（肋骨穿行）', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机（防御盘圈）', loop: true, status: 'done' },
      { id: 'coil',   name: '受惊盘圈与舒展',       loop: true, status: 'done' }
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
        headShield: buildHeadShield(makeCanvas),
        segA:       buildBodySegment(makeCanvas, 'A'),
        segB:       buildBodySegment(makeCanvas, 'B'),
        tailShield: buildTailShield(makeCanvas),
        antBase:    buildAntennaSeg(makeCanvas, false),
        antTip:     buildAntennaSeg(makeCanvas, true),
        legPair0:   buildLegPair(makeCanvas, 0),
        legPair1:   buildLegPair(makeCanvas, 1),
        legPair2:   buildLegPair(makeCanvas, 2),
        ribPillar:  buildRibPillar(makeCanvas),
        ribSpan:    buildRibSpan(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;

      const chain = new ChainSolver(NUM_NODES, SEG_LEN, {
        maxAngle: 0.56,
        waveFreq: 4.8,
        wavePhaseStep: 0.52,
        waveAmp: 0.16
      });

      // 左右超长触角独立弹簧（基节偏角 + 末节滞后偏角）
      const antSprings = [-1, 1].map((side) => ({
        side,
        baseYaw: new SpringDamper1D(side * 0.36, 95, 8.2),
        tipYaw:  new SpringDamper1D(side * 0.18, 72, 6.8),
        tapZ:    new SpringDamper1D(0, 120, 9.5)
      }));

      // 2 根半埋巨兽肋骨道具位置（跨距 27 格，通道中轴 y = -5.5，给穿行与后方盘圈留足安全净空）
      const ribs = [
        { lx: -13.5, ly: -5.5, yaw: 0.0 },
        { lx:  13.5, ly: -5.5, yaw: 0.0 }
      ];
      const RIB_PILLAR_HALF_Y = 13.5;
      const PILLAR_AVOID_R = 8.6; // 体节半宽 + 骨根半径安全排斥距，物理杜绝穿骨根

      const state = {
        x: hx0, y: hy0, z: 0,
        homeX: hx0, homeY: hy0,
        vx: 0, vy: 0, yaw: hyaw0,
        shadowScale: 0.55,
        patU: opts.seed ? (opts.seed % TAU) : -Math.PI * 0.5,
        wavePhase: 0,
        coilBlend: 0,      // 0 = 舒展穿行, 1 = 紧凑盘圈防御
        coilClock: 0,      // coil 演示动作循环时钟（周期 7.6s）
        coilStartled: false,
        dustCd: 0,
        tapCd: 0,
        prevAction: 'patrol'
      };

      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      // 计算平滑闭合的双肋穿行轨迹点：去程严格沿通道中轴 (y ≈ -5.5) 穿双拱，回程大弧绕行肋骨后方 (y ≈ +24.5)
      function samplePatrolPoint(u, homeX, homeY, maxR) {
        const lim = maxR * 0.80;
        const rx = Math.min(29.5, lim * 0.84);
        const sy = Math.sin(u);
        const backLoop = 0.5 + 0.5 * sy;
        const yBack = Math.min(24.5, lim * 0.72);
        const px = homeX + Math.cos(u) * rx;
        const py = homeY + lerp(-5.5, yBack, Math.pow(backLoop, 1.95)) + Math.sin(u * 2.0) * 0.8;
        const dx = px - homeX, dy = py - homeY;
        const d = Math.hypot(dx, dy);
        if (d > lim && d > 1e-4) {
          return [homeX + dx * (lim / d), homeY + dy * (lim / d)];
        }
        return [px, py];
      }

      // 计算紧凑防御盘圈目标位姿（盘于双肋后方开阔空地 (0, +21.5)，远离所有骨根，硬甲朝外、零碰撞）
      function evalCoilPose(i, homeX, homeY, sMul, time, maxR) {
        const lim = maxR * 0.78;
        const u = i / (NUM_NODES - 1); // 0 = 头, 1 = 尾
        const rBase = lerp(4.8, 8.2, Math.pow(u, 0.72)) * sMul;
        const r = Math.min(rBase, lim * 0.35);
        const ang0 = -Math.PI * 0.35 + Math.sin(time * 0.55) * 0.04;
        const ang = ang0 - u * (TAU * 1.24);
        const cx = homeX;
        const cy = homeY + Math.min(21.5 * sMul, lim - r - 1.2);
        const px = cx + Math.cos(ang) * r;
        const py = cy + Math.sin(ang) * r;
        const yaw = wrapAngle(ang);
        const lift = Math.sin(time * 2.4 - i * 0.35) * 0.35 * sMul + (u < 0.2 ? (0.2 - u) * 3.5 * sMul : 0);
        return { x: px, y: py, z: Math.max(0, lift), yaw };
      }

      // 按等弧长采样平滑穿行轨迹上的整条 18 节身躯（天然沿通道穿双拱、绕外侧，绝不抄近道撞骨根或断节）
      function samplePatrolChain(headU, homeX, homeY, maxR, sMul, time, flex, moveWeight) {
        const segLen = SEG_LEN * sMul;
        const out = new Array(NUM_NODES);
        let curU = headU;
        let [px, py] = samplePatrolPoint(curU, homeX, homeY, maxR);
        const [ax, ay] = samplePatrolPoint(curU + 0.05, homeX, homeY, maxR);
        out[0] = { x: px, y: py, yaw: Math.atan2(-(ax - px), ay - py) };

        for (let i = 1; i < NUM_NODES; i++) {
          // 用两步切线速度估算等弧长步长 dU，保证相邻体节严格贴合 SEG_LEN
          const [bx, by] = samplePatrolPoint(curU - 0.04, homeX, homeY, maxR);
          const spd = Math.max(8.0, Math.hypot(px - bx, py - by) / 0.04);
          curU -= segLen / spd;
          const [nx, ny] = samplePatrolPoint(curU, homeX, homeY, maxR);
          // 叠加极轻柔的法向蛇行微摆（在通道内收窄摆幅防擦骨根）
          const tx = px - nx, ty = py - ny;
          const td = Math.hypot(tx, ty) || 1;
          const sideAmp = 0.65 * flex * sMul * moveWeight;
          const sway = Math.sin(time * 4.8 - i * 0.55) * sideAmp;
          const wx = nx + (-ty / td) * sway;
          const wy = ny + ( tx / td) * sway;
          out[i] = { x: wx, y: wy, yaw: Math.atan2(-(px - wx), py - wy) };
          px = nx; py = ny;
        }
        return out;
      }

      // 骨根物理排斥 + 边界钳制（兜底防过渡帧擦撞任意骨根；盘圈收拢时统一往北侧顺滑绕离防劈节）
      function resolveConstraints(homeX, homeY, lim, sMul, biasNorth) {
        const nodes = chain.nodes;
        const avoidR = PILLAR_AVOID_R * sMul;
        const pillars = [];
        for (let r = 0; r < ribs.length; r++) {
          const rb = ribs[r];
          const rx = homeX + rb.lx * sMul;
          const ry = homeY + rb.ly * sMul;
          const [nx, ny] = localToWorldXY(rx, ry, rb.yaw, 0,  RIB_PILLAR_HALF_Y * sMul);
          const [sx, sy] = localToWorldXY(rx, ry, rb.yaw, 0, -RIB_PILLAR_HALF_Y * sMul);
          pillars.push([nx, ny], [sx, sy]);
        }

        for (let i = 0; i < NUM_NODES; i++) {
          const n = nodes[i];
          for (let p = 0; p < pillars.length; p++) {
            const dx = n.x - pillars[p][0];
            let dy = n.y - pillars[p][1];
            const d = Math.hypot(dx, dy);
            if (d < avoidR) {
              if (biasNorth && (p % 2 === 0)) {
                dy = Math.max(dy, 2.2 * sMul);
                const dn = Math.hypot(dx, dy) || 1;
                n.x = pillars[p][0] + (dx / dn) * avoidR;
                n.y = pillars[p][1] + (dy / dn) * avoidR;
              } else if (d > 1e-4) {
                n.x = pillars[p][0] + (dx / d) * avoidR;
                n.y = pillars[p][1] + (dy / d) * avoidR;
              } else {
                n.y += avoidR;
              }
            }
          }
          const bx = n.x - homeX, by = n.y - homeY;
          const bd = Math.hypot(bx, by);
          if (bd > lim && bd > 1e-4) {
            n.x = homeX + bx * (lim / bd);
            n.y = homeY + by * (lim / bd);
          }
        }
        for (let i = 1; i < NUM_NODES; i++) {
          const prev = nodes[i - 1], cur = nodes[i];
          const dx = prev.x - cur.x, dy = prev.y - cur.y;
          if (Math.hypot(dx, dy) > 0.05) {
            cur.yaw = Math.atan2(-dx, dy);
          }
        }
      }

      const instance = {
        def: Earth5RibCrawlerDef,
        cachePrefix: `earth5_rib_${Math.random().toString(36).slice(2, 7)}`,
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

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 0;
          state.homeX = hx; state.homeY = hy;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.patU = -Math.PI * 0.42;
          state.wavePhase = 0;
          state.coilBlend = 0;
          state.coilClock = 0;
          state.coilStartled = false;
          state.dustCd = 0;
          state.tapCd = 0;

          // 初始按等弧长摆在穿过两根肋骨下方的蜿蜒姿态，打开工坊即刻见穿行叙事感
          const nodes = chain.nodes;
          const initChain = samplePatrolChain(state.patU, hx, hy, 44, 1.0, 0, 1.0, 1.0);
          for (let i = 0; i < NUM_NODES; i++) {
            nodes[i].x = initChain[i].x;
            nodes[i].y = initChain[i].y;
            nodes[i].z = 0;
            nodes[i].yaw = initChain[i].yaw;
          }
          state.yaw = nodes[0].yaw;

          for (const a of antSprings) {
            a.baseYaw.x = a.side * 0.36; a.baseYaw.v = 0;
            a.tipYaw.x  = a.side * 0.18; a.tipYaw.v  = 0;
            a.tapZ.x = 0; a.tapZ.v = 0;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.4, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const speedMul = clamp(params.speed ?? 1.0, 0.35, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));

          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const homeX = (eco && eco.homeX !== undefined) ? eco.homeX : state.homeX;
          const homeY = (eco && eco.homeY !== undefined) ? eco.homeY : state.homeY;
          state.homeX = homeX;
          state.homeY = homeY;
          const maxR = (eco && eco.maxRadius) || 44;
          const lim = maxR * 0.80;
          const segLen = SEG_LEN * sMul;
          const nodes = chain.nodes;
          const fx = curSkin.fx || SKINS[0].fx;

          if (action !== state.prevAction) {
            state.prevAction = action;
            if (action === 'coil') {
              state.coilClock = 0;
              state.coilStartled = false;
            }
          }

          // -----------------------------------------------------------------
          // 1. 决定目标盘圈权重（patrol = 0 | idle = 1 | coil = 演示受惊收拢与舒展）
          // -----------------------------------------------------------------
          let targetCoil = 0;
          let coilSpeed = 3.5;
          let isStartleMoment = false;
          let patrolPace = 1.0;

          if (action === 'idle') {
            targetCoil = 1.0;
            coilSpeed = 4.2;
            patrolPace = 0.0;
          } else if (action === 'coil') {
            state.coilClock = (state.coilClock + dt) % 7.6;
            const ct = state.coilClock;
            if (ct < 1.35) {
              // 正常穿行一段
              targetCoil = 0.0;
              coilSpeed = 4.0;
              patrolPace = 1.0;
              state.coilStartled = false;
            } else if (ct < 2.35) {
              // 受惊瞬间：急速收拢盘圈防御！
              targetCoil = 1.0;
              coilSpeed = 9.5;
              patrolPace = 0.15;
              isStartleMoment = true;
              if (!state.coilStartled) {
                state.coilStartled = true;
                for (const a of antSprings) {
                  a.baseYaw.impulse(a.side * 4.5 * sp);
                  a.tapZ.impulse(12.0 * sp);
                }
                if (vfx && habitat && habitat.fx) {
                  vfx.spawnDust(nodes[0].x, nodes[0].y, 10, 1.05, habitat.fx);
                  vfx.spawnDust(nodes[8].x, nodes[8].y, 8, 0.85, habitat.fx);
                }
              }
            } else if (ct < 5.0) {
              // 紧盘防御驻留
              targetCoil = 1.0;
              coilSpeed = 5.5;
              patrolPace = 0.0;
            } else {
              // 确认安全后缓缓舒展恢复爬行
              const uUnroll = smoothstep(5.0, 7.2, ct);
              targetCoil = 1.0 - uUnroll;
              coilSpeed = 2.6;
              patrolPace = uUnroll * 0.9;
            }
          }

          state.coilBlend = lerp(state.coilBlend, targetCoil, expSmooth(dt, coilSpeed));
          const cb = state.coilBlend;

          // -----------------------------------------------------------------
          // 2. 驱动沿轨等弧长穿行链（patrol）与盘圈防御姿态（coil / idle）平滑融合
          // -----------------------------------------------------------------
          const moveWeight = clamp(1.0 - cb * 1.15, 0, 1) * patrolPace;
          if (moveWeight > 0.01) {
            state.patU = wrapAngle(state.patU + dt * 0.58 * speedMul * moveWeight);
          }

          const patrolChain = samplePatrolChain(state.patU, homeX, homeY, maxR, sMul, time, flex, moveWeight);
          const kFollow = expSmooth(dt, 14.0);
          for (let i = 0; i < NUM_NODES; i++) {
            const pt = patrolChain[i];
            const cl = evalCoilPose(i, homeX, homeY, sMul, time, maxR);
            const tx = lerp(pt.x, cl.x, cb);
            const ty = lerp(pt.y, cl.y, cb);
            const crawlZ = Math.max(0, Math.sin(time * 7.5 * gFreq - i * WAVE_PHASE_STEP) * 0.42 * sMul * moveWeight);
            const tz = lerp(crawlZ, cl.z, cb);
            const tyaw = wrapAngle(pt.yaw + wrapAngle(cl.yaw - pt.yaw) * cb);
            const n = nodes[i];
            n.x = lerp(n.x, tx, kFollow);
            n.y = lerp(n.y, ty, kFollow);
            n.z = lerp(n.z, tz, kFollow);
            n.yaw = wrapAngle(n.yaw + wrapAngle(tyaw - n.yaw) * kFollow);
          }

          // 骨根物理排斥 + 严格钳制全链 18 节在 maxRadius * 0.80 内
          resolveConstraints(homeX, homeY, lim, sMul, cb > 0.08);

          // -----------------------------------------------------------------
          // 3. 麦浪步态相位推进（速度驱动 + 最小微蠕，盘圈时渐停）
          // -----------------------------------------------------------------
          const waveSpeed = lerp(9.6 * gFreq * speedMul, 0.8 * gFreq, cb);
          state.wavePhase += dt * waveSpeed;

          // -----------------------------------------------------------------
          // 4. 一对超长探测触角弹簧驱动（巡游时交替点地探路，盘圈时内收微探）
          // -----------------------------------------------------------------
          const headNode = nodes[0];
          state.tapCd -= dt;
          for (let ai = 0; ai < 2; ai++) {
            const a = antSprings[ai];
            const phase = time * (cb > 0.5 ? 2.4 : 5.4) * gFreq + ai * Math.PI;
            const sweep = Math.sin(phase);
            const tap = Math.max(0, Math.cos(phase));
            // 巡游时大幅前伸左右扫探；盘圈时向内收拢警惕微颤；受惊瞬间向两侧甩开
            const baseTarget = isStartleMoment
              ? a.side * 0.92
              : (cb > 0.5
                ? a.side * 0.24 + sweep * 0.14
                : a.side * 0.38 + sweep * 0.32 * flex);
            // 末节相对基节带 ~0.75 rad 相位滞后，柔顺甩动不僵硬
            const tipTarget = isStartleMoment
              ? a.side * 0.45
              : (cb > 0.5
                ? -a.side * 0.16 + Math.sin(phase - 0.78) * 0.18
                : -a.side * 0.12 + Math.sin(phase - 0.78) * 0.36 * flex);
            const liftTarget = cb > 0.5
              ? (1.2 + tap * 0.9) * sMul
              : (0.2 + (1 - tap) * 2.2) * sMul;

            a.baseYaw.update(dt, baseTarget, 92 * sp, clamp(7.8 * dScale, 3.0, 12.0));
            a.tipYaw.update(dt, tipTarget, 68 * sp, clamp(6.4 * dScale, 2.5, 10.5));
            a.tapZ.update(dt, liftTarget, 115 * sp, clamp(9.0 * dScale, 3.5, 14.0));

            // 触角尖点地时偶尔扬起极细微腐土颗粒
            if (vfx && cb < 0.4 && tap > 0.94 && state.tapCd <= 0) {
              state.tapCd = 0.28;
              const rootYaw = wrapAngle(headNode.yaw + a.baseYaw.x);
              const [rx, ry] = localToWorldXY(headNode.x, headNode.y, headNode.yaw, a.side * 4.5 * sMul, 4.0 * sMul);
              const [midX, midY] = localToWorldXY(rx, ry, rootYaw, 0, 7.6 * sMul);
              const tipYaw = wrapAngle(rootYaw + a.tipYaw.x);
              const [tipX, tipY] = localToWorldXY(midX, midY, tipYaw, 0, 7.0 * sMul);
              vfx.spawnParticle(
                tipX, tipY, 0.8 * sMul,
                (Math.random() - 0.5) * 4 * sMul, (Math.random() - 0.5) * 4 * sMul, (3 + Math.random() * 3) * sMul,
                0.35, 1.15, fx.dust, false, 18
              );
            }
          }

          // 爬行时偶发从步足边缘扬起少量腐土尘点
          state.dustCd -= dt;
          if (vfx && habitat && habitat.fx && moveWeight > 0.4 && state.dustCd <= 0) {
            state.dustCd = 0.24;
            const pick = 2 + Math.floor(Math.random() * 12);
            const nd = nodes[pick];
            vfx.spawnDust(nd.x, nd.y, 2, 0.42, habitat.fx);
          }

          // -----------------------------------------------------------------
          // 5. 更新整体中心坐标与接地印点
          // -----------------------------------------------------------------
          footContacts.length = 0;
          let sumX = 0, sumY = 0;
          for (let i = 0; i < NUM_NODES; i++) {
            sumX += nodes[i].x;
            sumY += nodes[i].y;
            if (i % 3 === 0) {
              footContacts.push({ x: nodes[i].x, y: nodes[i].y, z: nodes[i].z, r: 4.8 * sMul });
            }
          }
          const cx = sumX / NUM_NODES;
          const cy = sumY / NUM_NODES;
          state.vx = (cx - state.x) / Math.max(dt, 0.001);
          state.vy = (cy - state.y) / Math.max(dt, 0.001);
          state.x = cx;
          state.y = cy;
          state.z = 0;
          state.yaw = headNode.yaw;
          state.shadowScale = 0.35;

          sockets.setWorld('head', headNode.x, headNode.y, headNode.z + 4 * sMul, headNode.yaw);
          sockets.setWorld('center', cx, cy, 4 * sMul, headNode.yaw);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const nodes = chain.nodes;
          const cb = state.coilBlend;
          const homeX = state.homeX;
          const homeY = state.homeY;

          // 判断某点是否位于任一根巨兽肋骨的拱下通道（宽裕包围盒保证 360° 视角下拱顶稳压在穿行体节上方）
          const ribHalfSpanY = 12.5 * sMul;
          const ribGateHalfX = 9.5 * sMul;
          function isUnderRib(wx, wy) {
            for (let r = 0; r < ribs.length; r++) {
              const rx = homeX + ribs[r].lx * sMul;
              const ry = homeY + ribs[r].ly * sMul;
              if (Math.abs(wx - rx) < ribGateHalfX && Math.abs(wy - ry) < ribHalfSpanY) return true;
            }
            return false;
          }

          // 1. 2 根巨兽肋骨道具件：南北半埋骨根（真实 3D 深度排序）+ 高拱穹顶（lift=9.0 稳跨多足上方）
          for (let r = 0; r < ribs.length; r++) {
            const rb = ribs[r];
            const rx = homeX + rb.lx * sMul;
            const ry = homeY + rb.ly * sMul;
            const [pNorthX, pNorthY] = localToWorldXY(rx, ry, rb.yaw, 0,  RIB_PILLAR_HALF_Y * sMul);
            const [pSouthX, pSouthY] = localToWorldXY(rx, ry, rb.yaw, 0, -RIB_PILLAR_HALF_Y * sMul);
            list.push({
              partKey: 'ribPillar', asset: parts.ribPillar,
              x: pNorthX, y: pNorthY, lift: 0,
              ro: rb.yaw, bias: 0.10
            });
            list.push({
              partKey: 'ribPillar', asset: parts.ribPillar,
              x: pSouthX, y: pSouthY, lift: 0,
              ro: wrapAngle(rb.yaw + Math.PI), bias: 0.10
            });
            // 高空拱顶赋予足够正偏置 (+12.5)，彻底覆盖通道内任意 360° 视角下穿过其下方的体节与步足
            list.push({
              partKey: 'ribSpan', asset: parts.ribSpan,
              x: rx, y: ry, lift: 9.0 * sMul,
              ro: rb.yaw, bias: 12.5
            });
          }

          // 2. 18 对预烘 3 帧成对步足（零 IK 麦浪轮播；第 0 对挂于头盾后颈膜处，盘圈防御时收为中立贴地态）
          for (let i = 0; i < NUM_NODES; i++) {
            const nd = nodes[i];
            let lx = nd.x, ly = nd.y;
            if (i === 0) {
              [lx, ly] = localToWorldXY(nd.x, nd.y, nd.yaw, 0, -2.2 * sMul);
            }
            const under = isUnderRib(lx, ly);
            let legKey = 'legPair1';
            if (cb < 0.72) {
              const sWave = Math.sin(state.wavePhase - i * WAVE_PHASE_STEP);
              legKey = sWave > 0.34 ? 'legPair0' : (sWave < -0.34 ? 'legPair2' : 'legPair1');
            }
            list.push({
              partKey: legKey,
              asset: parts[legKey],
              x: lx,
              y: ly,
              lift: Math.max(0, nd.z),
              ro: nd.yaw,
              bias: (under ? -5.2 : -0.45) - i * 0.008
            });
          }

          // 3. 18 节躯干（0: 头盾, 1..16: 交替 segA/segB, 17: 尾盾）
          for (let i = 0; i < NUM_NODES; i++) {
            const nd = nodes[i];
            const under = isUnderRib(nd.x, nd.y);
            let partKey;
            if (i === 0) partKey = 'headShield';
            else if (i === NUM_NODES - 1) partKey = 'tailShield';
            else partKey = (i % 2 === 1) ? 'segA' : 'segB';

            const baseBias = under ? (-4.5 - i * 0.01) : (i === 0 ? 0.55 : (0.28 - i * 0.01));
            list.push({
              partKey,
              asset: parts[partKey],
              x: nd.x,
              y: nd.y,
              lift: Math.max(0, nd.z + 0.6 * sMul),
              ro: nd.yaw,
              bias: baseBias
            });
          }

          // 4. 一对 2 节超长探测触角（挂在头盾前侧，亮橙/绛红醒目分节，零脱节）
          const hNode = nodes[0];
          for (let ai = 0; ai < 2; ai++) {
            const a = antSprings[ai];
            const [jointX, jointY] = localToWorldXY(hNode.x, hNode.y, hNode.yaw, a.side * 4.4 * sMul, 3.8 * sMul);
            const rootYaw = wrapAngle(hNode.yaw + a.baseYaw.x);
            const [baseCX, baseCY] = pivotToWorldXY(jointX, jointY, rootYaw, ANT_PIVOT.x * sMul, ANT_PIVOT.y * sMul);
            const baseZ = Math.max(0.5, hNode.z + 2.6 * sMul + a.tapZ.x * 0.45);
            const baseUnder = isUnderRib(baseCX, baseCY);

            list.push({
              partKey: 'antBase',
              asset: parts.antBase,
              x: baseCX,
              y: baseCY,
              lift: baseZ,
              ro: rootYaw,
              bias: baseUnder ? -4.2 : 0.72
            });

            // 第 2 节触角末节锁死在第 1 节末端关节上
            const [tipJointX, tipJointY] = localToWorldXY(jointX, jointY, rootYaw, 0, 7.6 * sMul);
            const tipYaw = wrapAngle(rootYaw + a.tipYaw.x);
            const [tipCX, tipCY] = pivotToWorldXY(tipJointX, tipJointY, tipYaw, ANT_PIVOT.x * sMul, ANT_PIVOT.y * sMul);
            const tipZ = Math.max(0.3, hNode.z + 1.4 * sMul + a.tapZ.x);
            const tipUnder = isUnderRib(tipCX, tipCY);

            list.push({
              partKey: 'antTip',
              asset: parts.antTip,
              x: tipCX,
              y: tipCY,
              lift: tipZ,
              ro: tipYaw,
              bias: tipUnder ? -4.1 : 0.78
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Earth5RibCrawlerDef.id,
            code: Earth5RibCrawlerDef.code,
            name: Earth5RibCrawlerDef.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            segmentCount: NUM_NODES,
            segLen: SEG_LEN,
            overlapRatio: 0.44,
            wavePhaseStep: WAVE_PHASE_STEP,
            footRadius: Earth5RibCrawlerDef.footRadius,
            headZ: 9,
            centerZ: 4,
            blocks: Earth5RibCrawlerDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Earth5RibCrawlerDef);
})(window.PixelWorkshop);
