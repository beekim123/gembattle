'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 洞5 · 朝死东西长过去的网（M37 铺开的菌毯 / 网标杆）
  //   1. 外观：缩着时是米黄色、表面起皱的核心软垫（保留外描边稳住整体轮廓）；
  //      铺开时是贴地 1~2 层极薄的脉络网，仅建 4 套共享小格子件（直段/拐角/分叉/末端，
  //      宽 6 格高 2 层，全部 noOutline: true），外加养分脉冲颗粒件（noOutline: true，
  //      bias 略高于脉络防遮挡）与一小堆极简残骸骨渣目标道具；
  //   2. 颜色：24 色、0 重色、零自亮防糊，配 3 套零重建模换色皮肤（溶洞米黄菌网、
  //      遗骸青灰腐网、琥珀棕丝网）；
  //   3. 状态机（黏菌找食物力学）：
  //      dormant(2~3s) -> probe(2~3s 四面探脉) -> digest(3~4s 退去无关支脉、强化主脉并
  //      包裹残骸、脉冲一格格回传核心) -> retract(1.6~2.1s 化完逐格缩回，原位落湿痕并留下
  //      一圈 3~4 朵小蘑菇摆件) -> 轮换新残骸位置再循环。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 核心软垫主肉（米黄）
      padDark:   '#a89674',
      padMid:    '#d8c7a3',
      padHi:     '#f0e4c8',
      // 核心起皱褶沟（深米褐）
      foldDark:  '#695a42',
      foldMid:   '#8c795b',
      foldHi:    '#b5a180',
      // 核心顶部菌核呼吸凸点
      nodeDark:  '#7d5f3e',
      nodeMid:   '#ab8457',
      nodeHi:    '#d6ae7c',
      // 脉络主脊（暖米黄）
      veinDark:  '#948261',
      veinMid:   '#c7b58e',
      veinHi:    '#e6d7b5',
      // 脉络边缘细丝（浅灰米）
      filDark:   '#786c56',
      filMid:    '#ada084',
      filHi:     '#cfc4a9',
      // 养分脉冲颗粒（高对比暖橙金，不进 glowKeys 防发糊）
      pulseDark: '#b85c1f',
      pulseMid:  '#e88a35',
      pulseHi:   '#ffd073',
      // 残骸骨渣（苍白旧骨）
      boneDark:  '#8a8478',
      boneMid:   '#c4beb0',
      boneHi:    '#e8e3d5',
      // 残骸腐肉残皮（暗棕红）
      meatDark:  '#3d2220',
      meatMid:   '#5e3430',
      meatHi:    '#824c45'
    },
    glowKeys: [],
    parts: ['pad', 'fold', 'node', 'vein', 'fil', 'pulse', 'bone', 'meat'],
    noCrease: [
      ['pad', 'fold'],
      ['pad', 'node'],
      ['vein', 'fil'],
      ['bone', 'meat']
    ],
    materials: {
      pad:   ['padDark',   'padMid',   'padHi'],
      fold:  ['foldDark',  'foldMid',  'foldHi'],
      node:  ['nodeDark',  'nodeMid',  'nodeHi'],
      vein:  ['veinDark',  'veinMid',  'veinHi'],
      fil:   ['filDark',   'filMid',   'filHi'],
      pulse: ['pulseDark', 'pulseMid', 'pulseHi'],
      bone:  ['boneDark',  'boneMid',  'boneHi'],
      meat:  ['meatDark',  'meatMid',  'meatHi']
    },
    protectedParts: ['node', 'pulse']
  });

  const SKINS = [
    {
      id: 'cave_cream',
      name: '溶洞米黄菌网',
      dot: '#d8c7a3',
      outline: '#1a1510',
      mushroomColor: '#b88c5a',
      mushroomRim: '#e6d7b5',
      wetColor: '#4c3e2c',
      wetDark: '#2e251a',
      pal: {}
    },
    {
      id: 'carcass_ash',
      name: '遗骸青灰腐网',
      dot: '#9eb3a8',
      outline: '#101816',
      mushroomColor: '#76968a',
      mushroomRim: '#cfe0d8',
      wetColor: '#30423c',
      wetDark: '#1c2824',
      pal: {
        padDark:   '#6d7f78', padMid:   '#9eb3a8', padHi:   '#cadad1',
        foldDark:  '#42524c', foldMid:  '#5c7068', foldHi:  '#81968d',
        nodeDark:  '#4e6b62', nodeMid:  '#6f9488', nodeHi:  '#9bc2b5',
        veinDark:  '#5f736b', veinMid:  '#8ea69c', veinHi:  '#bdd1c8',
        filDark:   '#4c5c56', filMid:   '#798f86', filHi:   '#a3b8af',
        pulseDark: '#2c8a7a', pulseMid: '#4ec2aa', pulseHi: '#9bf0db',
        boneDark:  '#787c78', boneMid:  '#b0b5ae', boneHi:  '#dce0d8',
        meatDark:  '#2e2326', meatMid:  '#4a383c', meatHi:  '#6b5358'
      }
    },
    {
      id: 'amber_silk',
      name: '琥珀棕丝网',
      dot: '#c78c4e',
      outline: '#1c1108',
      mushroomColor: '#b0642c',
      mushroomRim: '#e6ba84',
      wetColor: '#4f331b',
      wetDark: '#301d0e',
      pal: {
        padDark:   '#8f5f32', padMid:   '#c78c4e', padHi:   '#e8b87d',
        foldDark:  '#573619', foldMid:  '#784c25', foldHi:  '#a36c3b',
        nodeDark:  '#733b17', nodeMid:  '#a65a24', nodeHi:  '#d98443',
        veinDark:  '#7d522a', veinMid:  '#b57c43', veinHi:  '#dba66b',
        filDark:   '#634121', filMid:   '#946638', filHi:   '#bd8d59',
        pulseDark: '#b33b14', pulseMid: '#eb6c28', pulseHi: '#ffc259',
        boneDark:  '#85796a', boneMid:  '#bfb29e', boneHi:  '#e3d8c5',
        meatDark:  '#3b1f18', meatMid:  '#5c3125', meatHi:  '#804838'
      }
    }
  ];

  // =========================================================================
  // 1. 体素建模（中心软垫 + 呼吸顶盖 + 4 套极薄共享格子件 + 脉冲颗粒 + 残骸骨渣）
  // =========================================================================

  // 中心核心软垫（米黄色、表面起皱，四重对称 symDeg: 90，保留外描边）
  function buildCorePad(makeCanvas) {
    const W = 14, D = 14, H = 5;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const rMax = 5.6;

    m.fillAABB(-6, 6, -6, 6, 0, H - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      // 四重对称瓣状软边 + 表面皱褶波纹
      const lobe = Math.cos(ang * 4) * 0.55;
      const effR = r / Math.max(1.5, rMax + lobe);
      if (effR > 1.0) return;

      const wrinkle = Math.sin(r * 1.65) * 0.28 + Math.cos(ang * 4) * 0.22;
      const topZ = (3.4 + wrinkle) * Math.pow(Math.max(0, 1 - effR * effR), 0.58);
      if (z > topZ) return;

      // 放射状褶沟（4 条主沟 + 外缘浅沟）
      const radialFold = Math.abs(Math.sin(ang * 2)) < 0.24 && r > 1.6 && r < rMax * 0.90;
      const ringFold = Math.abs(r - 3.3) < 0.55 && z >= Math.floor(topZ);
      const isNode = r < 1.55 && z >= 2;

      if (isNode) {
        m.setRaw(x, y, z, mat('node'), partId.node);
      } else if (radialFold || ringFold) {
        m.setRaw(x, y, z, mat('fold'), partId.fold);
      } else {
        m.setRaw(x, y, z, mat('pad'), partId.pad);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.8, headZ: 5, centerZ: 2 });
  }

  // 核心软垫呼吸顶盖（极薄 2 层，通过 lift 微起伏表现吸取养分后的呼吸隆起，绝不拉伸）
  function buildCoreCrown(makeCanvas) {
    const W = 10, D = 10, H = 3;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const rMax = 3.6;

    m.fillAABB(-4, 4, -4, 4, 0, H - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const effR = r / (rMax + Math.cos(ang * 4) * 0.35);
      if (effR > 1.0) return;
      const topZ = 2.0 * Math.pow(Math.max(0, 1 - effR * effR), 0.72);
      if (z > topZ) return;

      const isCenter = r <= 1.25 && z >= 1;
      const isCrease = !isCenter && Math.abs(Math.sin(ang * 2)) < 0.26 && r > 1.3;
      if (isCenter) {
        m.setRaw(x, y, z, mat('node'), partId.node);
      } else if (isCrease) {
        m.setRaw(x, y, z, mat('fold'), partId.fold);
      } else {
        m.setRaw(x, y, z, mat('pad'), partId.pad);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 3, centerZ: 1 });
  }

  // 共享脉络格子件 1：直段（6×6×2，沿 Y 轴贯通，180° 对称 symDeg: 180）
  function buildTileStraight(makeCanvas) {
    const W = 6, D = 6, H = 2;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-2.5, 2.5, -2.5, 2.5, 0, 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      // 底层：粗主脉（宽 ~2.6 格）加两侧细绒丝（偶见分叉感，保持 180° 对称）
      if (z === 0) {
        if (ax <= 1.1) {
          m.setRaw(x, y, z, mat('vein'), partId.vein);
        } else if (ax <= 2.1 && Math.abs(Y) <= 1.0) {
          m.setRaw(x, y, z, mat('fil'), partId.fil);
        }
      } else if (z === 1) {
        // 顶层：居中 1~2 格主脉脊，贴地极薄
        if (ax <= 0.65) {
          m.setRaw(x, y, z, mat('vein'), partId.vein);
        }
      }
    });

    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 2, centerZ: 1 });
  }

  // 共享脉络格子件 2：90° 拐角（6×6×2，连接 +Y 与 +X，圆润弧弯）
  function buildTileCorner(makeCanvas) {
    const W = 6, D = 6, H = 2;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-2.5, 2.5, -2.5, 2.5, 0, 1, (x, y, z, X, Y) => {
      // 从 (0, +2.5) 弯向 (+2.5, 0) 的圆弧，圆心在 (+2.5, +2.5)，半径 2.5
      const dArc = Math.abs(Math.hypot(X - 2.5, Y - 2.5) - 2.5);
      const inArmN = Y >= 0 && Math.abs(X) <= 1.1;
      const inArmE = X >= 0 && Math.abs(Y) <= 1.1;
      const onCurve = dArc <= 1.15 && X >= -1.2 && Y >= -1.2;

      if (z === 0) {
        if (onCurve || inArmN || inArmE) {
          m.setRaw(x, y, z, mat('vein'), partId.vein);
        } else if (dArc <= 1.95 && X >= -1.8 && Y >= -1.8 && (X + Y) < 1.2) {
          // 外拐角微生细丝绒边
          m.setRaw(x, y, z, mat('fil'), partId.fil);
        }
      } else if (z === 1) {
        if ((dArc <= 0.65 && X >= -0.6 && Y >= -0.6) || (Y >= 0.4 && Math.abs(X) <= 0.65) || (X >= 0.4 && Math.abs(Y) <= 0.65)) {
          m.setRaw(x, y, z, mat('vein'), partId.vein);
        }
      }
    });

    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 2, centerZ: 1 });
  }

  // 共享脉络格子件 3：T 型三叉分叉（6×6×2，连接 +Y、+X、-X，左右对称自动半角烘焙）
  function buildTileBranch(makeCanvas) {
    const W = 6, D = 6, H = 2;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-2.5, 2.5, -2.5, 2.5, 0, 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      const onBar = Math.abs(Y) <= 1.1;
      const onStem = Y >= -0.6 && ax <= 1.1;
      const onWeb = Y >= 0.2 && Y <= 1.9 && ax <= 1.9;

      if (z === 0) {
        if (onBar || onStem) {
          m.setRaw(x, y, z, mat('vein'), partId.vein);
        } else if (onWeb || (Y <= -1.0 && Y >= -1.8 && ax <= 1.1)) {
          // 叉口薄膜与背缘细丝
          m.setRaw(x, y, z, mat('fil'), partId.fil);
        }
      } else if (z === 1) {
        if (Math.abs(Y) <= 0.65 || (Y >= -0.2 && ax <= 0.65)) {
          m.setRaw(x, y, z, mat('vein'), partId.vein);
        }
      }
    });

    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 2, centerZ: 1 });
  }

  // 共享脉络格子件 4：末端探须（6×6×2，根部连 -Y，前端向 +Y 分叉成 2 根细探须，左右对称）
  function buildTileTip(makeCanvas) {
    const W = 6, D = 6, H = 2;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-2.5, 2.5, -2.5, 2.5, 0, 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      const onRoot = Y <= 0.2 && ax <= 1.1;
      const onFork = Y > 0.2 && Y <= 2.2 && Math.abs(ax - (0.55 + (Y - 0.2) * 0.55)) <= 0.65;

      if (z === 0) {
        if (onRoot) {
          m.setRaw(x, y, z, mat('vein'), partId.vein);
        } else if (onFork || (Y > 0.0 && Y <= 1.1 && ax <= 1.2)) {
          m.setRaw(x, y, z, mat('fil'), partId.fil);
        }
      } else if (z === 1) {
        if (Y <= -0.1 && ax <= 0.65) {
          m.setRaw(x, y, z, mat('vein'), partId.vein);
        }
      }
    });

    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.6, headZ: 2, centerZ: 1 });
  }

  // 共享养分脉冲颗粒件（4×4×2，四重对称 symDeg: 90，noOutline: true）
  function buildNutrientPulse(makeCanvas) {
    const W = 4, D = 4, H = 2;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-1.5, 1.5, -1.5, 1.5, 0, 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      if (z === 0 && r <= 1.45) {
        m.setRaw(x, y, z, mat('pulse'), partId.pulse);
      } else if (z === 1 && r <= 0.95) {
        m.setRaw(x, y, z, mat('pulse'), partId.pulse);
      }
    });

    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.6, headZ: 2, centerZ: 1 });
  }

  // 极简「残骸骨渣」目标道具（11×10×5，苍白碎肋骨压在暗腐残皮上，保留描边）
  function buildCarcassBone(makeCanvas) {
    const W = 11, D = 10, H = 5;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 底层暗腐残肉垫
    m.paintEllipsoid(0, 0, 0.7, 3.8, 3.2, 1.2, mat('meat'), partId.meat, true);
    // 3 根交错弯曲的苍白碎肋骨
    m.paintCapsule(-3.2, -1.4, 1.0,  2.8, -1.8, 2.6, 0.85, 0.72, mat('bone'), partId.bone, true);
    m.paintCapsule(-2.6,  0.6, 1.1,  3.2,  0.4, 3.1, 0.88, 0.75, mat('bone'), partId.bone, true);
    m.paintCapsule(-2.2,  2.1, 1.0,  2.0,  2.0, 2.2, 0.78, 0.65, mat('bone'), partId.bone, true);
    // 一小块残骨节压在侧边
    m.paintEllipsoid(-2.4, -0.2, 1.5, 1.4, 1.2, 1.1, mat('bone'), partId.bone, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 4, centerZ: 2 });
  }

  // =========================================================================
  // 2. 网格拓扑与黏菌找食物力学工具
  // =========================================================================
  const CELL_STEP = 4.8; // 6×6 格子件按 4.8 格排布，相邻搭接 1.2 格防缝隙
  const DIRS = [
    { bit: 1, dx: 0, dy: 1 },   // N (+Y)
    { bit: 2, dx: 1, dy: 0 },   // E (+X)
    { bit: 4, dx: 0, dy: -1 },  // S (-Y)
    { bit: 8, dx: -1, dy: 0 }   // W (-X)
  ];

  function cellKey(gx, gy) {
    return `${gx},${gy}`;
  }

  // 根据 4 邻域连接掩码（N=1, E=2, S=4, W=8）映射到 4 套共享格子件与精确旋转角
  function resolveTilePlacement(mask) {
    switch (mask) {
      // 末端（度数 1）：根在 -Y，须尖朝 +Y
      case 4:  return [{ key: 'tileTip', rot: 0, symDeg: 360 }];
      case 2:  return [{ key: 'tileTip', rot: Math.PI * 0.5, symDeg: 360 }];
      case 1:  return [{ key: 'tileTip', rot: Math.PI, symDeg: 360 }];
      case 8:  return [{ key: 'tileTip', rot: -Math.PI * 0.5, symDeg: 360 }];
      // 直段（度数 2 对边）：沿 Y 轴贯通，180° 对称
      case 5:  return [{ key: 'tileStraight', rot: 0, symDeg: 180 }];
      case 10: return [{ key: 'tileStraight', rot: Math.PI * 0.5, symDeg: 180 }];
      // 拐角（度数 2 相邻）：基准连 N(+Y) 与 E(+X)
      case 3:  return [{ key: 'tileCorner', rot: 0, symDeg: 360 }];
      case 9:  return [{ key: 'tileCorner', rot: Math.PI * 0.5, symDeg: 360 }];
      case 12: return [{ key: 'tileCorner', rot: Math.PI, symDeg: 360 }];
      case 6:  return [{ key: 'tileCorner', rot: -Math.PI * 0.5, symDeg: 360 }];
      // 分叉（度数 3）：基准连 N, E, W（缺 S）
      case 11: return [{ key: 'tileBranch', rot: 0, symDeg: 360 }];
      case 13: return [{ key: 'tileBranch', rot: Math.PI * 0.5, symDeg: 360 }];
      case 14: return [{ key: 'tileBranch', rot: Math.PI, symDeg: 360 }];
      case 7:  return [{ key: 'tileBranch', rot: -Math.PI * 0.5, symDeg: 360 }];
      // 十字交叉（度数 4）：两片正交直段叠放，零新增资产
      case 15: return [
        { key: 'tileStraight', rot: 0, symDeg: 180 },
        { key: 'tileStraight', rot: Math.PI * 0.5, symDeg: 180 }
      ];
      default: return [{ key: 'tileTip', rot: 0, symDeg: 360 }];
    }
  }

  // =========================================================================
  // 3. 生物定义（洞5 · 朝死东西长过去的网）
  // =========================================================================
  const Cave5MyceliumWebDef = {
    id: 'cave5_mycelium_web',
    code: '洞5',
    name: '朝死东西长过去的网',
    status: 'done',
    tag: 'M37 标杆 · 铺开菌网',
    summary: '贴地 1~3 层极薄菌网：休眠时缩成米黄色起皱核心软垫（留外描边），发现残骸后四面探出共享格子细脉（noOutline），锁定后仅强化主脉包覆残骸并一格格回传养分脉冲，化完逐格缩回并在残骸原位留下一圈 3~4 朵小蘑菇',
    defaultHabitat: 'cave',
    footRadius: 6.5,
    ecoWeight: 0.9,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '4 套共享极薄格子件（直段/拐角/分叉/末端）',
      '单部件 noOutline 跳过描边防碎黑块',
      '黏菌找食物力学（四面探脉→强化主脉→逐格缩回）',
      '养分脉冲沿主脉一格格回传核心',
      '残骸化完原位留一圈小蘑菇摆件'
    ],
    soulHabit: '平时缩成一小块米黄起皱软垫，察觉残骸后四面伸出细脉搜寻，锁定后退去无关支脉、仅强化主脉包覆化掉残骸并一格格送回养分，最后逐格缩回并在原地留下一圈小蘑菇',
    actions: [
      { id: 'patrol', name: '觅食循环（探脉→包覆→留菇）', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机（缩团呼吸＋短须试探）', loop: true, status: 'done' },
      { id: 'spread', name: '大片铺开（全网脉络＋脉冲回传）', loop: true, status: 'done' }
    ],
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        corePad:       buildCorePad(makeCanvas),
        coreCrown:     buildCoreCrown(makeCanvas),
        tileStraight:  buildTileStraight(makeCanvas),
        tileCorner:    buildTileCorner(makeCanvas),
        tileBranch:    buildTileBranch(makeCanvas),
        tileTip:       buildTileTip(makeCanvas),
        nutrientPulse: buildNutrientPulse(makeCanvas),
        carcassBone:   buildCarcassBone(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.25;
      const seed0 = opts.seed ?? 57;

      const crownSpring = new SpringDamper1D(0, 95, 10.5);
      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      const state = {
        x: hx0, y: hy0, z: 0,
        vx: 0, vy: 0, yaw: hyaw0,
        shadowScale: 0.72,
        // 状态机：'dormant' (2~3s) | 'probe' (2~3s) | 'digest' (3~4s) | 'retract' (1.6~2.1s)
        mode: 'probe',
        modeT: 0,
        modeDur: 2.6,
        seq: 1,
        prevAction: 'patrol',
        // 残骸目标格坐标与世界坐标
        targetGX: 4,
        targetGY: 2,
        targetX: hx0,
        targetY: hy0,
        targetYaw: 0.4,
        carcassVisible: true,
        carcassRemain: 1.0, // 1 -> 0 随消化过程沉降化掉
        mushroomsSpawned: false,
        wetCd: 0,
        sporeCd: 0,
        // 当前生成的黏菌网格节点表与主路径（由远到近）
        nodes: [],
        mainPath: [], // [{gx, gy}, ...] 从残骸(0)到核心(len-1)
        activeNodes: [],
        activeMaskMap: new Map(),
        // 养分脉冲颗粒列表（沿 mainPath 回传）
        pulses: [],
        // 记录最近一次实际生效半径与格距
        lastMaxR: 44,
        lastCellStep: CELL_STEP
      };

      function gridToWorld(gx, gy, sMul) {
        const step = CELL_STEP * sMul;
        return localToWorldXY(state.x, state.y, state.yaw, gx * step, gy * step);
      }

      function inSafeRadius(wx, wy, maxR) {
        return Math.hypot(wx, wy) <= maxR * 0.82;
      }

      // 在 maxRadius * 0.72 内轮换生成下一个残骸骨渣目标格
      function pickNextCarcass(maxR, sMul) {
        state.seq++;
        const step = CELL_STEP * sMul;
        const maxTargetDist = maxR * 0.70;
        const minTargetDist = Math.min(maxR * 0.44, step * 3.8);
        const prevAng = Math.atan2(state.targetGY, state.targetGX);
        const deltaAng = (hash2i(state.seq, seed0, 113) > 0.5 ? 1 : -1) * lerp(1.75, 2.85, hash2i(state.seq, seed0, 229));
        const ang = prevAng + deltaAng;
        const dist = lerp(minTargetDist, maxTargetDist, hash2i(state.seq, seed0, 347));

        let gx = Math.round((Math.cos(ang) * dist) / step);
        let gy = Math.round((Math.sin(ang) * dist) / step);
        if (Math.abs(gx) + Math.abs(gy) < 3) {
          gx = gx >= 0 ? 4 : -4;
          gy = gy >= 0 ? 2 : -2;
        }
        // 严格钳制在 maxRadius * 0.72 内
        for (let guard = 0; guard < 12; guard++) {
          const [wx, wy] = gridToWorld(gx, gy, sMul);
          if (Math.hypot(wx, wy) <= maxR * 0.72 && Math.hypot(wx - state.x, wy - state.y) >= step * 2.6) break;
          if (Math.abs(gx) >= Math.abs(gy) && Math.abs(gx) > 1) gx -= Math.sign(gx);
          else if (Math.abs(gy) > 1) gy -= Math.sign(gy);
          else break;
        }

        state.targetGX = gx;
        state.targetGY = gy;
        const [twx, twy] = gridToWorld(gx, gy, sMul);
        state.targetX = twx;
        state.targetY = twy;
        state.targetYaw = hash2i(state.seq, seed0, 461) * TAU;
        state.carcassVisible = true;
        state.carcassRemain = 1.0;
        state.mushroomsSpawned = false;
      }

      // 构建本轮黏菌网络：通向残骸的主脉络 + 残骸包裹格 + 四面试探支脉
      function buildNetwork(maxR, sMul, wideSpread) {
        const map = new Map();
        const nodes = [];
        const limR = maxR * 0.82;

        function addNode(gx, gy, role, depth, branchIdx) {
          if (gx === 0 && gy === 0) return null;
          const k = cellKey(gx, gy);
          if (map.has(k)) {
            const existing = map.get(k);
            // 若原本是试探脉而被主脉复用，升级为主脉
            if (role === 'main' && existing.role === 'probe') {
              existing.role = 'main';
              existing.depth = Math.min(existing.depth, depth);
            }
            return existing;
          }
          const [wx, wy] = gridToWorld(gx, gy, sMul);
          if (Math.hypot(wx, wy) > limR) return null;
          const jitter = hash2i(gx * 13 + state.seq, gy * 19 + branchIdx, seed0) * 0.45;
          const n = {
            gx, gy, key: k, role, depth, branchIdx,
            growOrder: depth + jitter,
            wx, wy
          };
          map.set(k, n);
          nodes.push(n);
          return n;
        }

        // 1. 生成从核心 (0,0) 到残骸 (targetGX, targetGY) 的自然折弯主脉络
        const tx = state.targetGX, ty = state.targetGY;
        const mainForward = [];
        let cx = 0, cy = 0, stepCount = 0;
        let preferX = hash2i(state.seq, seed0, 521) > 0.5;
        while ((cx !== tx || cy !== ty) && stepCount < 24) {
          const rx = tx - cx, ry = ty - cy;
          let moveX;
          if (rx === 0) moveX = false;
          else if (ry === 0) moveX = true;
          else {
            // 每走 1~2 格自然拐弯，形成有机的黏菌脉络折线
            const flip = hash2i(cx + state.seq * 3, cy + stepCount * 7, seed0) > 0.56;
            moveX = flip ? !preferX : preferX;
            if (flip) preferX = moveX;
          }
          if (moveX) cx += Math.sign(rx);
          else cy += Math.sign(ry);
          stepCount++;
          const n = addNode(cx, cy, 'main', stepCount, 0);
          if (n) mainForward.push(n);
        }

        // 记录养分回传路径：从残骸端回到核心 (0,0)
        const mainPath = [];
        for (let i = mainForward.length - 1; i >= 0; i--) {
          mainPath.push({ gx: mainForward[i].gx, gy: mainForward[i].gy });
        }
        mainPath.push({ gx: 0, gy: 0 });

        // 2. 残骸周边包裹脉络（wrap，盖住残骸四邻）
        const wrapBaseDepth = Math.max(2, mainForward.length);
        for (let di = 0; di < DIRS.length; di++) {
          const d = DIRS[di];
          addNode(tx + d.dx, ty + d.dy, 'wrap', wrapBaseDepth + 1, 1);
        }

        // 3. 四面试探支脉（probe）：朝非食物方向伸出 3~4 条主探须并带小分叉
        const probeDirs = [
          { dx: 1, dy: 0 },
          { dx: -1, dy: 0 },
          { dx: 0, dy: 1 },
          { dx: 0, dy: -1 }
        ];
        const maxProbeLen = wideSpread ? 6 : 4;
        for (let bi = 0; bi < probeDirs.length; bi++) {
          let px = 0, py = 0;
          let dirIdx = bi;
          const len = wideSpread
            ? clamp(Math.round(lerp(4, maxProbeLen, hash2i(bi, state.seq, 613))), 4, 6)
            : clamp(Math.round(lerp(3, maxProbeLen, hash2i(bi, state.seq, 613))), 3, 4);
          for (let s = 1; s <= len; s++) {
            // 第 2~3 步轻微拐弯
            if (s === 2 || s === 4) {
              const turn = hash2i(bi * 7 + s, state.seq, 709);
              if (turn > 0.62) dirIdx = (dirIdx + 1) % 4;
              else if (turn < 0.28) dirIdx = (dirIdx + 3) % 4;
            }
            const d = probeDirs[dirIdx];
            const nx = px + d.dx, ny = py + d.dy;
            if (nx === 0 && ny === 0) break;
            const added = addNode(nx, ny, 'probe', s, bi + 2);
            if (!added) break;
            px = nx; py = ny;

            // 在中段长出 1~2 格侧分叉（让铺开网有明显三叉分叉与跨度）
            if ((s === 2 || (wideSpread && s === 4)) && hash2i(bi + s * 5, state.seq, 823) > 0.30) {
              const sideDir = probeDirs[(dirIdx + (hash2i(bi, s, 881) > 0.5 ? 1 : 3)) % 4];
              const bx1 = px + sideDir.dx, by1 = py + sideDir.dy;
              const b1 = addNode(bx1, by1, 'probe', s + 1, bi + 10);
              if (b1 && wideSpread) {
                addNode(bx1 + sideDir.dx, by1 + sideDir.dy, 'probe', s + 2, bi + 14);
              }
            }
          }
        }

        // 在主脉络中段也长 1~2 根短侧须，体现黏菌试探感
        if (mainForward.length >= 3) {
          const mid = mainForward[Math.floor(mainForward.length * 0.5)];
          for (let di = 0; di < DIRS.length; di++) {
            const d = DIRS[di];
            if (hash2i(di, state.seq, 907) > 0.52) {
              addNode(mid.gx + d.dx, mid.gy + d.dy, 'probe', mid.depth + 1, 20 + di);
            }
          }
        }

        state.nodes = nodes;
        state.mainPath = mainPath;
      }

      // 在残骸原位留下一圈 3~4 朵小蘑菇摆件 + 淡湿痕
      function spawnMushroomRing(vfx, sMul) {
        if (!vfx || state.mushroomsSpawned) return;
        state.mushroomsSpawned = true;
        const count = hash2i(state.seq, seed0, 977) > 0.45 ? 4 : 3;
        const baseAng = hash2i(state.seq, seed0, 991) * TAU;
        const ringR = 4.4 * sMul;

        // 地面先落一处淡湿痕
        vfx.addDecal({
          kind: 'wet',
          x: state.targetX,
          y: state.targetY,
          yaw: state.targetYaw,
          rx: 5.8 * sMul,
          ry: 5.2 * sMul,
          life: 16.0,
          alpha: 0.52,
          color: curSkin.wetColor,
          darkColor: curSkin.wetDark
        });

        for (let i = 0; i < count; i++) {
          const a = baseAng + (i / count) * TAU + (hash2i(i, state.seq, 1009) - 0.5) * 0.35;
          const r = ringR * lerp(0.82, 1.18, hash2i(i, state.seq, 1031));
          const mx = state.targetX + Math.cos(a) * r;
          const my = state.targetY + Math.sin(a) * r;
          vfx.addGroundProp({
            kind: 'mushroom',
            x: mx,
            y: my,
            yaw: a,
            radius: lerp(3.4, 4.6, hash2i(i, state.seq, 1061)) * sMul,
            life: 28,
            color: curSkin.mushroomColor,
            rimColor: curSkin.mushroomRim
          });
        }
      }

      function enterDormant(maxR, sMul) {
        state.mode = 'dormant';
        state.modeT = 0;
        state.seq++;
        state.modeDur = lerp(2.1, 2.8, hash2i(state.seq, seed0, 1201));
        pickNextCarcass(maxR, sMul);
        buildNetwork(maxR, sMul, false);
        state.pulses.length = 0;
      }

      function enterProbe() {
        state.mode = 'probe';
        state.modeT = 0;
        state.modeDur = lerp(2.3, 2.9, hash2i(state.seq, seed0, 1303));
        state.pulses.length = 0;
      }

      function enterDigest(vfx, sMul) {
        state.mode = 'digest';
        state.modeT = 0;
        state.modeDur = lerp(3.3, 3.9, hash2i(state.seq, seed0, 1409));
        state.wetCd = 0;
        state.pulses.length = 0;
        // 预先布置 4 颗错开相位的养分脉冲节
        for (let i = 0; i < 4; i++) {
          state.pulses.push({ u: i * 0.25 });
        }
        if (vfx) {
          vfx.addDecal({
            kind: 'wet',
            x: state.targetX,
            y: state.targetY,
            yaw: state.targetYaw,
            rx: 4.8 * sMul,
            ry: 4.4 * sMul,
            life: 10.0,
            alpha: 0.44,
            color: curSkin.wetColor,
            darkColor: curSkin.wetDark
          });
        }
      }

      function enterRetract(vfx, sMul) {
        state.mode = 'retract';
        state.modeT = 0;
        state.modeDur = lerp(1.65, 2.05, hash2i(state.seq, seed0, 1511));
        state.carcassVisible = false;
        state.carcassRemain = 0;
        state.pulses.length = 0;
        spawnMushroomRing(vfx, sMul);
      }

      // 根据活跃格表刷新连通掩码（保证直段/拐角/分叉/末端无缝衔接）
      function refreshConnectivity(activeList, sMul, maxR) {
        const maskMap = state.activeMaskMap;
        maskMap.clear();
        const limR = maxR * 0.84;
        const filtered = [];
        const present = new Set();
        present.add('0,0'); // 中心核心软垫始终参与连通

        for (let i = 0; i < activeList.length; i++) {
          const n = activeList[i];
          const [wx, wy] = gridToWorld(n.gx, n.gy, sMul);
          if (Math.hypot(wx, wy) > limR) continue;
          n.wx = wx;
          n.wy = wy;
          present.add(n.key);
          filtered.push(n);
        }

        for (let i = 0; i < filtered.length; i++) {
          const n = filtered[i];
          let mask = 0;
          for (let di = 0; di < DIRS.length; di++) {
            const d = DIRS[di];
            if (present.has(cellKey(n.gx + d.dx, n.gy + d.dy))) mask |= d.bit;
          }
          maskMap.set(n.key, mask);
        }
        state.activeNodes = filtered;
      }

      const instance = {
        def: Cave5MyceliumWebDef,
        cachePrefix: `cave5_mycelium_web_${Math.random().toString(36).slice(2, 7)}`,
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
          state.x = hx; state.y = hy; state.z = 0;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.shadowScale = 0.72;
          state.seq = 1;
          state.prevAction = 'patrol';
          crownSpring.x = 0;
          crownSpring.v = 0;
          pickNextCarcass(44, 1.0);
          buildNetwork(44, 1.0, false);
          // 初始落在 digest 初段，打开工坊即可直观看到铺开的菌网、包裹残骸与养分脉冲
          state.mode = 'digest';
          state.modeT = 0.45;
          state.modeDur = 3.6;
          state.pulses = [{ u: 0.05 }, { u: 0.30 }, { u: 0.55 }, { u: 0.80 }];
          refreshConnectivity(state.nodes.filter(n => n.role !== 'probe'), 1.0, 44);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const speedMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const maxR = (eco && eco.maxRadius) || 44;
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');

          state.lastMaxR = maxR;
          state.lastCellStep = CELL_STEP * sMul;
          footContacts.length = 0;

          // 轻微向原点居中靠拢，保持核心稳稳贴地
          const hx = (eco && eco.homeX) ?? 0;
          const hy = (eco && eco.homeY) ?? 0;
          state.x = lerp(state.x, hx, expSmooth(dt, 4.0));
          state.y = lerp(state.y, hy, expSmooth(dt, 4.0));
          state.z = 0;
          const [twx, twy] = gridToWorld(state.targetGX, state.targetGY, sMul);
          state.targetX = twx;
          state.targetY = twy;

          // 动作切换响应
          if (action !== state.prevAction) {
            state.prevAction = action;
            if (action === 'spread') {
              buildNetwork(maxR, sMul, true);
              state.carcassVisible = true;
              state.carcassRemain = 0.78;
              state.pulses = [{ u: 0.0 }, { u: 0.25 }, { u: 0.5 }, { u: 0.75 }];
            } else if (action === 'patrol') {
              enterProbe();
              buildNetwork(maxR, sMul, false);
            }
          }

          // -----------------------------------------------------------------
          // 分支 A：idle（缩团核心轻微呼吸 + 偶发极短 1~2 格探须试探）
          // -----------------------------------------------------------------
          if (action === 'idle') {
            state.mode = 'idle';
            state.carcassVisible = false;
            state.pulses.length = 0;
            const breath = 0.25 + 0.35 * (0.5 + 0.5 * Math.sin(time * 2.2 * gFreq));
            crownSpring.update(dt, breath, 80 * sp, 10.0);

            // 每隔几秒朝一个方向伸出 1~2 格极短探须再缩回
            const cycle = (time * 0.35 * speedMul) % 1;
            const active = [];
            if (cycle > 0.35 && cycle < 0.85) {
              const dirIdx = Math.floor(time * 0.35 * speedMul) % 4;
              const d = DIRS[dirIdx];
              const subU = (cycle - 0.35) / 0.50;
              const reach = subU < 0.5 ? smoothstep(0, 0.5, subU) : (1 - smoothstep(0.5, 1.0, subU));
              if (reach > 0.18) {
                active.push({ gx: d.dx, gy: d.dy, key: cellKey(d.dx, d.dy), role: 'probe', depth: 1 });
              }
              if (reach > 0.68) {
                active.push({ gx: d.dx * 2, gy: d.dy * 2, key: cellKey(d.dx * 2, d.dy * 2), role: 'probe', depth: 2 });
              }
            }
            refreshConnectivity(active, sMul, maxR);
            sockets.setWorld('core', state.x, state.y, 2.5 * sMul, state.yaw);
            return;
          }

          // -----------------------------------------------------------------
          // 分支 B：spread（保持大片脉络铺开 + 养分脉冲持续回传展示）
          // -----------------------------------------------------------------
          if (action === 'spread') {
            state.mode = 'spread';
            state.carcassVisible = true;
            state.carcassRemain = 0.72 + 0.08 * Math.sin(time * 2.0 * gFreq);
            const pulseSpeed = 0.42 * speedMul * gFreq;
            let arriveKick = 0;
            for (let i = 0; i < state.pulses.length; i++) {
              const pl = state.pulses[i];
              pl.u += dt * pulseSpeed;
              if (pl.u >= 1.0) {
                pl.u -= 1.0;
                arriveKick = 1.0;
              }
            }
            const targetCrown = 0.45 + 0.45 * (0.5 + 0.5 * Math.sin(time * 3.1 * gFreq)) + arriveKick * 0.45;
            crownSpring.update(dt, targetCrown, 110 * sp, 10.5);
            refreshConnectivity(state.nodes, sMul, maxR);
            sockets.setWorld('core', state.x, state.y, (2.6 + crownSpring.x) * sMul, state.yaw);
            return;
          }

          // -----------------------------------------------------------------
          // 分支 C：patrol 完整黏菌找食物循环（dormant -> probe -> digest -> retract）
          // -----------------------------------------------------------------
          state.modeT += dt * speedMul;
          if (state.modeT >= state.modeDur) {
            if (state.mode === 'dormant') enterProbe();
            else if (state.mode === 'probe') enterDigest(vfx, sMul);
            else if (state.mode === 'digest') enterRetract(vfx, sMul);
            else enterDormant(maxR, sMul);
          }

          const p = clamp(state.modeT / Math.max(0.01, state.modeDur), 0, 1);

          if (state.mode === 'dormant') {
            state.carcassVisible = true;
            state.carcassRemain = 1.0;
            const breath = 0.15 + 0.25 * (0.5 + 0.5 * Math.sin(time * 2.0 * gFreq));
            crownSpring.update(dt, breath, 80 * sp, 10.0);
            refreshConnectivity([], sMul, maxR);
          } else if (state.mode === 'probe') {
            // 四面逐格探出细脉寻找残骸（主脉与探须一齐铺开，wrap 包裹格在末尾冒出）
            state.carcassVisible = true;
            state.carcassRemain = 1.0;
            let maxOrder = 1;
            for (let i = 0; i < state.nodes.length; i++) {
              if (state.nodes[i].growOrder > maxOrder) maxOrder = state.nodes[i].growOrder;
            }
            const cutoff = lerp(0.4, maxOrder + 0.6, smoothstep(0, 0.96, p));
            const active = [];
            for (let i = 0; i < state.nodes.length; i++) {
              const n = state.nodes[i];
              if (n.role === 'wrap' && p < 0.78) continue;
              if (n.growOrder <= cutoff) active.push(n);
            }
            const breath = 0.22 + 0.22 * (0.5 + 0.5 * Math.sin(time * 2.6 * gFreq));
            crownSpring.update(dt, breath, 95 * sp, 10.5);
            refreshConnectivity(active, sMul, maxR);
          } else if (state.mode === 'digest') {
            // 锁定食物：前 35% 时段内逐格收回无关试探支脉，仅保留主脉与残骸包裹网
            state.carcassVisible = true;
            state.carcassRemain = clamp(1 - smoothstep(0.12, 0.96, p), 0.05, 1.0);

            let maxProbeDepth = 1;
            for (let i = 0; i < state.nodes.length; i++) {
              if (state.nodes[i].role === 'probe' && state.nodes[i].depth > maxProbeDepth) {
                maxProbeDepth = state.nodes[i].depth;
              }
            }
            const probeKeepLimit = lerp(maxProbeDepth + 0.5, 0, smoothstep(0.02, 0.36, p));
            const active = [];
            for (let i = 0; i < state.nodes.length; i++) {
              const n = state.nodes[i];
              if (n.role === 'main' || n.role === 'wrap') {
                active.push(n);
              } else if (n.depth < probeKeepLimit) {
                active.push(n);
              }
            }

            // 养分脉冲沿 mainPath 一格格回传核心
            const pulseSpeed = 0.52 * gFreq;
            let arriveBoost = 0;
            for (let i = 0; i < state.pulses.length; i++) {
              const pl = state.pulses[i];
              pl.u += dt * pulseSpeed;
              if (pl.u >= 1.0) {
                pl.u -= 1.0;
                arriveBoost = 0.75;
              }
            }

            // 核心随养分回传微微隆起呼吸
            const digestSwell = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(time * 3.8 * gFreq)) + arriveBoost;
            crownSpring.update(dt, digestSwell, 120 * sp, 10.0);

            // 消化时在残骸附近偶发极细孢子尘粒
            state.sporeCd -= dt;
            if (vfx && state.sporeCd <= 0) {
              state.sporeCd = 0.32;
              const ang = hash2i(Math.floor(time * 10), state.seq, 1601) * TAU;
              vfx.spawnParticle(
                state.targetX + Math.cos(ang) * 2.8 * sMul,
                state.targetY + Math.sin(ang) * 2.8 * sMul,
                1.4 * sMul,
                Math.cos(ang) * 2.5, Math.sin(ang) * 2.5, 5.5,
                0.55, 1.1, curSkin.mushroomRim, false, 4
              );
            }
            refreshConnectivity(active, sMul, maxR);
          } else if (state.mode === 'retract') {
            // 化完后从远端逐格缩回核心
            state.carcassVisible = false;
            state.carcassRemain = 0;
            let maxDepth = 1;
            for (let i = 0; i < state.nodes.length; i++) {
              const n = state.nodes[i];
              if (n.role !== 'probe' && n.depth > maxDepth) maxDepth = n.depth;
            }
            const keepDepth = lerp(maxDepth + 0.6, 0, smoothstep(0, 0.94, p));
            const active = [];
            for (let i = 0; i < state.nodes.length; i++) {
              const n = state.nodes[i];
              if (n.role !== 'probe' && n.depth <= keepDepth) active.push(n);
            }
            const breath = lerp(0.55, 0.15, p);
            crownSpring.update(dt, breath, 95 * sp, 10.5);
            refreshConnectivity(active, sMul, maxR);
          }

          sockets.setWorld('core', state.x, state.y, (2.4 + Math.max(0, crownSpring.x)) * sMul, state.yaw);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const maxR = state.lastMaxR || 44;
          const limR = maxR * 0.84;

          // 1. 铺开的脉络格子件（全部 noOutline: true，跳过描边不把细脉框成碎黑块）
          const active = state.activeNodes;
          const maskMap = state.activeMaskMap;
          for (let i = 0; i < active.length; i++) {
            const n = active[i];
            const wx = n.wx, wy = n.wy;
            if (Math.hypot(wx, wy) > limR) continue;
            const mask = maskMap.get(n.key) || 0;
            const placements = resolveTilePlacement(mask);
            const isMain = (n.role === 'main' || n.role === 'wrap');
            for (let pi = 0; pi < placements.length; pi++) {
              const pl = placements[pi];
              list.push({
                partKey: pl.key,
                asset: parts[pl.key],
                x: wx,
                y: wy,
                lift: 0,
                ro: wrapAngle(state.yaw + pl.rot),
                symDeg: pl.symDeg,
                bias: isMain ? -0.20 : -0.30,
                noOutline: true
              });
            }
          }

          // 2. 脉络内一格格往核心送回养分的脉冲颗粒件（noOutline: true + bias 略高于脉络防遮挡）
          if (state.pulses.length > 0 && state.mainPath.length >= 2) {
            const path = state.mainPath;
            const segCount = path.length - 1;
            for (let i = 0; i < state.pulses.length; i++) {
              const u = clamp(state.pulses[i].u, 0, 0.999);
              // 一格格步进带轻微平滑过渡，呈现黏菌脉动回传感
              const fIdx = u * segCount;
              const idx0 = Math.min(segCount - 1, Math.floor(fIdx));
              const frac = smoothstep(0.15, 0.85, fIdx - idx0);
              const a = path[idx0];
              const b = path[idx0 + 1];
              const gx = lerp(a.gx, b.gx, frac);
              const gy = lerp(a.gy, b.gy, frac);
              const [px, py] = gridToWorld(gx, gy, sMul);
              if (Math.hypot(px, py) > limR) continue;
              list.push({
                partKey: 'nutrientPulse',
                asset: parts.nutrientPulse,
                x: px,
                y: py,
                lift: 1.05 * sMul,
                ro: state.yaw,
                symDeg: 90,
                bias: 0.35,
                noOutline: true
              });
            }
          }

          // 3. 残骸骨渣目标道具（保留描边，消化过程中缓缓沉降淡出直至消失）
          if (state.carcassVisible && state.carcassRemain > 0.04) {
            const sink = (1 - state.carcassRemain) * 2.2 * sMul;
            const op = smoothstep(0.04, 0.32, state.carcassRemain);
            list.push({
              partKey: 'carcassBone',
              asset: parts.carcassBone,
              x: state.targetX,
              y: state.targetY,
              lift: Math.max(0, 0.2 * sMul - sink * 0.4),
              ro: state.targetYaw,
              symDeg: 360,
              bias: 0.15,
              opacity: op
            });
          }

          // 4. 中心核心软垫＋呼吸顶盖（保留描边，稳住整体轮廓）
          list.push({
            partKey: 'corePad',
            asset: parts.corePad,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: state.yaw,
            symDeg: 90,
            bias: 0.55
          });

          const crownLift = clamp(1.75 + crownSpring.x * 0.85, 1.5, 3.1) * sMul;
          list.push({
            partKey: 'coreCrown',
            asset: parts.coreCrown,
            x: state.x,
            y: state.y,
            lift: crownLift,
            ro: wrapAngle(state.yaw + 0.785),
            symDeg: 90,
            bias: 0.72
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Cave5MyceliumWebDef.id,
            code: Cave5MyceliumWebDef.code,
            name: Cave5MyceliumWebDef.name,
            outlineMode: 'hybridCoreOutlineWebNoOutline',
            skin: curSkin.id,
            tileAssetCount: 4,
            cellStep: CELL_STEP,
            footRadius: Cave5MyceliumWebDef.footRadius,
            headZ: 5,
            centerZ: 2,
            blocks: Cave5MyceliumWebDef.blocks,
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

  PW.Creatures.push(Cave5MyceliumWebDef);
})(window.PixelWorkshop);
