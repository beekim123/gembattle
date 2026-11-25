'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 海2 · 冰下甲壳兽（因纽特 Qalupalik · M09 6足三角步态标杆 · v3 精制）
  //
  // 【前置调研与三维坐标预算记录】
  // 1. 生物原型与运动学调研：
  //    - 外形融合因纽特传说 Qalupalik（冰下掠食与背部育儿囊）与深海巨型等足虫
  //      （Bathynomus giganteus）的扁阔流线重甲背甲、横向分节甲片、侧向多节步足与细长触须；
  //    - 6 足三角步态（Hexapod Tripod Gait）：L1+R2+L3 为 0 组（0°），R1+L2+R3 为 1 组（180° 反相），
  //      占空比 β = 0.54（swingFrac = 0.46，交接期短暂 6 足全接地防悬空），低贴地抬足 1.9 格（约为
  //      腿总长 11.6 格的 16%）；三对步足沿体侧呈前/中/后扇形错开，相邻落点间距 >= 9.0 格 > 单步幅，
  //      彻底杜绝摆动交叉打架。
  // 2. 三维几何坐标预算表（单部件严格 <= 40 格，基准体长 ~38 格，色表 31 色 <= 48）：
  //    - carapace（重甲头胸背甲 + 尾扇）：20×30×12，世界 Z=[3.0, 14.0]，宽 ±8.2 格，4 道甲片分缝；
  //    - broodSacRest / broodSacPulse（2档无损烘焙半透育儿囊）：13×15×10，挂点 (0,-1.2)，深嵌背甲 3.5 格；
  //    - broodEggs（囊内圆卵与幼体轮廓）：9×11×7，置于半透囊内，随嗡鸣独立微晃；
  //    - pincerL / pincerR（前伸短螯钳）：10×12×8，挂点 (±4.4, +9.8) 深嵌前甲缘 2.2 格；
  //    - antSeg0/1/2（双侧 3 节细长触须）：5×7×5 / 4×7×4 / 4×6×4，节距 2.5 格（重叠 > 55%）；
  //    - 6 足 3 段硬壳连杆（legCoxaFemur 7×10×7 / legKneeTibia 7×9×8 / legTarsus 6×8×7）：
  //      髋位 |hipX|=5.8~6.4（深嵌 ±8.2 背甲内 2.0 格），L1=5.4 / L2=6.2，高拱折角膝节，重叠 >= 50%；
  //    - iceFloe0/1/2（水面洁白立体浮冰碎块 ×4）：14×13×6 / 12×11×5 / 10×10×5，独立注册进 parts。
  // 3. 现有内核复用与隔离扩展：
  //    - 扩展 core/solvers.js 中 MultiLegGaitSolver 的独立 isHexapod 分支（仅 6 足触发，零改动 2/4 足）；
  //    - 直接复用 core/behaviors.js（multiLegWalk / walkToPoint / EnvFeedback）与 core/renderer.js。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 重甲背甲主色（极地冰蓝经典）
      shellDark:    '#1b3d5c',
      shellMid:     '#326c99',
      shellHi:      '#6ab1db',
      // 甲片边棱高对比亮边
      rimDark:      '#5897bc',
      rimMid:       '#98d3f0',
      rimHi:        '#dcf6ff',
      // 甲片分缝深沟与腹甲底壳
      seamDark:     '#0f2236',
      seamMid:      '#1a3652',
      seamHi:       '#2c5275',
      // 硬壳步足与前伸螯钳
      limbDark:     '#15314a',
      limbMid:      '#28567a',
      limbHi:       '#508cb5',
      // 节肢关节软膜与跗爪尖端
      jointDark:    '#384c59',
      jointMid:     '#647e8f',
      jointHi:      '#a0bac7',
      // 背部半透育儿囊外壳（高辨识冰青半透膜，渲染层配合 opacity）
      sacDark:      '#389ab8',
      sacMid:       '#72d4ed',
      sacHi:        '#c7f6ff',
      // 育儿囊内圆卵与小幼体轮廓（暖玉青白高对比，透过半透囊壳清晰可见）
      eggDark:      '#94dbe6',
      eggMid:       '#d6f7fc',
      eggHi:        '#f7feff',
      // 囊内微亮核心点（少量像素柔亮透出半透囊壳）
      emissiveCore: '#c4f8ff',
      // 暗沉复眼（eyeGlint 严禁进 glowKeys）
      eyeDark:      '#080d14',
      eyeIris:      '#1e3545',
      eyeGlint:     '#9ed4e8',
      // 水面立体浮冰碎块（极地洁白 + 冰蓝断口侧壁，不随皮肤换色）
      iceDark:      '#78b1cd',
      iceMid:       '#c2e6f5',
      iceHi:        '#f0faff'
    },
    glowKeys: ['emissiveCore'],
    parts: [
      'shell', 'rim', 'seam', 'limb', 'joint', 'sac', 'egg', 'eye', 'ice'
    ],
    noCrease: [
      ['shell', 'rim'], ['shell', 'seam'], ['shell', 'eye'],
      ['limb', 'joint'], ['limb', 'rim'], ['sac', 'rim'],
      ['egg', 'sac']
    ],
    materials: {
      shell: ['shellDark', 'shellMid', 'shellHi'],
      rim:   ['rimDark',   'rimMid',   'rimHi'],
      seam:  ['seamDark',  'seamMid',  'seamHi'],
      limb:  ['limbDark',  'limbMid',  'limbHi'],
      joint: ['jointDark', 'jointMid', 'jointHi'],
      sac:   ['sacDark',   'sacMid',   'sacHi'],
      egg:   ['eggDark',   'eggMid',   'eggHi'],
      ice:   ['iceDark',   'iceMid',   'iceHi']
    },
    protectedParts: ['eye']
  });

  // 4 套零重建模换色皮肤（无禁用字）
  const SKINS = [
    {
      id: 'ice_blue',
      name: '冰蓝重甲（极地经典）',
      dot: '#326c99',
      outline: '#091522',
      pal: {},
      fx: {
        ringRGB: '146, 236, 255',
        chipA:   '#eaf9ff',
        chipB:   '#9ee0f7',
        humTint: '#a6edff'
      }
    },
    {
      id: 'deep_indigo',
      name: '深靛玄甲（寒潮款）',
      dot: '#283261',
      outline: '#080b1a',
      pal: {
        shellDark:    '#141936', shellMid:  '#283363', shellHi:  '#4d5e9e',
        rimDark:      '#4f6294', rimMid:    '#869ed4', rimHi:    '#cedbf7',
        seamDark:     '#0c0f24', seamMid:   '#181f40', seamHi:   '#2a3561',
        limbDark:     '#121730', limbMid:   '#242e59', limbHi:   '#465691',
        jointDark:    '#353a54', jointMid:  '#60688c', jointHi:  '#9aa3c4',
        sacDark:      '#36538f', sacMid:    '#628ad4', sacHi:    '#a8c9fa',
        eggDark:      '#7da3d9', eggMid:    '#bed9f7', eggHi:    '#edf5ff',
        emissiveCore: '#b8d8ff',
        eyeIris:      '#35406b', eyeGlint:  '#9eb4e6'
      },
      fx: {
        ringRGB: '158, 198, 255',
        chipA:   '#ebf2ff',
        chipB:   '#a3c4f7',
        humTint: '#b8d8ff'
      }
    },
    {
      id: 'pale_jade',
      name: '苍白玉壳（冰川款）',
      dot: '#9ec4c2',
      outline: '#122124',
      pal: {
        shellDark:    '#57787a', shellMid:  '#8eb3b3', shellHi:  '#cbe6e3',
        rimDark:      '#85aba8', rimMid:    '#c2e3df', rimHi:    '#effcfa',
        seamDark:     '#304a4d', seamMid:   '#4b6e70', seamHi:   '#6f9496',
        limbDark:     '#476669', limbMid:   '#759999', limbHi:   '#acc9c7',
        jointDark:    '#5c6e6d', jointMid:  '#8fa3a1', jointHi:  '#c7d9d7',
        sacDark:      '#3b8c82', sacMid:    '#6cc7ba', sacHi:    '#b3f2e7',
        eggDark:      '#7fd4c6', eggMid:    '#bff2e8', eggHi:    '#ebfcf8',
        emissiveCore: '#b8fff0',
        eyeIris:      '#2f4d4b', eyeGlint:  '#a8dbd4'
      },
      fx: {
        ringRGB: '156, 245, 228',
        chipA:   '#edfcf9',
        chipB:   '#a3e8dc',
        humTint: '#b8fff0'
      }
    },
    {
      id: 'rust_reef',
      name: '赤褐礁壳（深海暖流款）',
      dot: '#8f462d',
      outline: '#1c0e0a',
      pal: {
        shellDark:    '#4a2117', shellMid:  '#87402a', shellHi:  '#c26c4c',
        rimDark:      '#854d38', rimMid:    '#c78667', rimHi:    '#f2c9ae',
        seamDark:     '#2b130d', seamMid:   '#472117', seamHi:   '#6b3526',
        limbDark:     '#3d1b12', limbMid:   '#6e3423', limbHi:   '#a65b41',
        jointDark:    '#543931', jointMid:  '#876459', jointHi:  '#bfa093',
        sacDark:      '#387c82', sacMid:    '#62b3b8', sacHi:    '#a6e3e6',
        eggDark:      '#85c7c4', eggMid:    '#c4ede9', eggHi:    '#edfafa',
        emissiveCore: '#b8f7f0',
        eyeIris:      '#4f2b1f', eyeGlint:  '#d4a894'
      },
      fx: {
        ringRGB: '152, 232, 235',
        chipA:   '#f2f7f5',
        chipB:   '#b0dfe0',
        humTint: '#b8f7f0'
      }
    }
  ];

  // =========================================================================
  // 1. 扁阔流线型重甲头胸背甲 + 分节甲片 + 尾扇（20×30×12）
  //    正面 +Y，带 4 道横向甲片分缝、边棱高对比亮边、暗沉复眼、中央育儿囊基座凹槽
  // =========================================================================
  function buildCarapace(makeCanvas) {
    const W = 20, D = 30, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-9.0, 9.0, -14.0, 13.5, 0, H - 1, (x, y, z, X, Y) => {
      // 1) 头胸盾甲（前宽厚拱）
      const dHead = (Math.hypot(X / 7.8, (Y - 5.6) / 6.8, (z - 5.2) / 4.2) - 1.0) * 5.2;
      // 2) 中胸宽阔主背甲（承托育儿囊）
      const dMid  = (Math.hypot(X / 8.5, (Y + 0.6) / 7.6, (z - 5.4) / 4.5) - 1.0) * 5.6;
      // 3) 后腹收束甲节
      const dRear = (Math.hypot(X / 6.4, (Y + 7.4) / 5.2, (z - 4.8) / 3.5) - 1.0) * 4.4;
      // 4) 扁阔侧甲裙缘（遮护 6 足髋关节挂点，防漏缝）
      const dSkirt = (Math.hypot(X / 8.8, (Y - 0.5) / 10.2, (z - 3.6) / 1.8) - 1.0) * 3.0;

      let d = smin(smin(smin(dHead, dMid, 1.8), dRear, 1.8), dSkirt, 1.2);
      if (d > 0) return;
      // 底部收平贴水底流线
      if (z < 1) return;

      // 背部正中微凹育儿囊基座，让半透育儿囊自然嵌入甲背
      const broodDist = Math.hypot(X / 4.4, (Y + 1.2) / 5.4);
      if (broodDist < 0.88 && z > 8) return;

      // 4 道横向甲片分缝（深沟 + 紧邻边棱亮边）
      const seamYs = [4.4, 0.2, -3.8, -7.6];
      let onSeam = false;
      let onRim = false;
      for (let i = 0; i < seamYs.length; i++) {
        const sy = seamYs[i] - Math.abs(X) * 0.14; // 弧形后掠甲缝
        const dyS = Y - sy;
        if (z >= 4 && Math.abs(dyS) < 0.62) {
          onSeam = true;
          // 顶部浅刻 1 格凹缝感
          if (z >= 9 && Math.abs(dyS) < 0.45) return;
        } else if (z >= 5 && dyS >= 0.62 && dyS < 1.55) {
          onRim = true;
        }
      }

      // 外围甲裙亮棱边 + 育儿囊基座护圈亮边
      const nearOuterRim = (Math.abs(X) > 6.9 && z >= 3 && z <= 5) || (Y > 10.6 && z >= 4 && z <= 6);
      const nearBroodCollar = broodDist >= 0.85 && broodDist <= 1.15 && z >= 7;

      if (z <= 2) {
        m.setRaw(x, y, z, mat('seam'), partId.seam);
      } else if (onSeam) {
        m.setRaw(x, y, z, mat('seam'), partId.seam);
      } else if (onRim || nearOuterRim || nearBroodCollar) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else {
        m.setRaw(x, y, z, mat('shell'), partId.shell);
      }
    });

    // 三瓣硬壳尾扇（中尾节 + 左右尾肢）
    m.paintFinTri([0, -9.2, 4.6], [-2.8, -13.6, 3.6], [2.8, -13.6, 3.6], 0.95, mat('shell'), partId.shell, true);
    m.paintFinTri([-1.6, -8.8, 4.4], [-6.2, -12.6, 3.4], [-2.6, -13.4, 3.4], 0.85, mat('rim'), partId.rim, false);
    m.paintFinTri([ 1.6, -8.8, 4.4], [ 6.2, -12.6, 3.4], [ 2.6, -13.4, 3.4], 0.85, mat('rim'), partId.rim, false);
    // 前额中脊棱线
    m.paintCapsule(0, 6.0, 8.2, 0, 11.4, 6.2, 1.15, 0.72, mat('rim'), partId.rim, true);

    m.despeckle();
    m.applyArtShading(true);

    // 暗沉复眼（前甲左右两侧微凸 2×2 复眼，eyeGlint 严禁进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 8.6);
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 4.2);
      for (const dx of [0, s]) {
        for (const dy of [0, 1]) {
          for (const dz of [0, 1]) {
            const kId = (dx === s && dy === 1 && dz === 1)
              ? keyToId.eyeGlint
              : (dy === 0 ? keyToId.eyeDark : keyToId.eyeIris);
            m.setRaw(ex + dx, eyeY + dy, 7 + dz, kId, partId.eye);
          }
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 10.8, headZ: 12, centerZ: 5 });
  }

  // =========================================================================
  // 2. 背部半透育儿囊袋（2 档无损烘焙过渡：rest 平稳 / pulse 鼓胀搏动，13×15×10）
  //    空心穹顶囊壳 + 侧边加强肋条，渲染时配合 opacity 透出内部微亮圆卵与幼体
  // =========================================================================
  function buildBroodSac(makeCanvas, isPulse) {
    const W = 13, D = 15, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const rx = isPulse ? 5.6 : 4.9;
    const ry = isPulse ? 6.5 : 5.8;
    const rz = isPulse ? 5.6 : 4.7;
    const cz = 3.6;

    m.fillAABB(-6.0, 6.0, -7.0, 7.0, 0, H - 1, (x, y, z, X, Y) => {
      const dOut = Math.hypot(X / rx, Y / ry, (z - cz) / rz);
      if (dOut > 1.0) return;
      // 保留厚约 1.3 格的穹顶薄膜外壳，内部镂空以便透视圆卵层次
      const dIn = Math.hypot(X / (rx - 1.35), Y / (ry - 1.35), (z - (cz - 0.3)) / (rz - 1.25));
      if (dIn < 1.0 && z > 1) return;
      // 囊袋基座与纵向膜肋用亮边着色，增强半透立体轮廓
      const isRib = (Math.abs(X) < 0.75 && z >= 4) || (Math.abs(Y) < 0.75 && z >= 3) || z <= 1;
      m.setRaw(x, y, z, isRib ? mat('rim') : mat('sac'), isRib ? partId.rim : partId.sac);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 9, centerZ: 4 });
  }

  // =========================================================================
  // 3. 育儿囊内部微亮圆卵与小幼体轮廓（9×11×7）
  //    4 颗饱满圆卵 + 1 只蜷缩幼体节段轮廓，中心嵌入极少 emissiveCore 像素柔亮
  // =========================================================================
  function buildBroodEggs(makeCanvas) {
    const W = 9, D = 11, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    const eggs = [
      { x: -1.8, y:  2.2, z: 3.0, r: 1.75 },
      { x:  1.9, y:  1.7, z: 3.4, r: 1.70 },
      { x: -1.5, y: -1.9, z: 3.3, r: 1.75 },
      { x:  1.7, y: -2.2, z: 2.9, r: 1.65 }
    ];
    for (const eg of eggs) {
      m.paintEllipsoid(eg.x, eg.y, eg.z, eg.r, eg.r * 1.08, eg.r * 0.92, mat('egg'), partId.egg, true);
    }
    // 中央蜷缩小幼体背脊轮廓
    m.paintCapsule(-0.6, 0.5, 4.4, 0.8, -0.6, 4.5, 1.35, 1.15, mat('egg'), partId.egg, true);

    m.despeckle();
    m.applyArtShading(true);

    // 每颗卵顶中点放 1~2 格柔和微亮核心（透出半透囊壳，不刺眼）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (const eg of eggs) {
      m.setRaw(Math.round(hw + eg.x), Math.round(hd + eg.y), Math.round(eg.z + 0.8), keyToId.emissiveCore, partId.egg);
    }
    m.setRaw(Math.round(hw), Math.round(hd), 5, keyToId.emissiveCore, partId.egg);

    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 4. 一对前伸短螯钳（10×12×8，枢轴锁在螯基 (side*-1.4, -3.4)）
  // =========================================================================
  function buildPincer(makeCanvas, side) {
    const W = 10, D = 12, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 粗短基臂（深嵌前甲缘）
    m.paintCapsule(-side * 1.4, -3.8, 3.6, side * 0.6, -0.4, 3.4, 1.65, 1.55, mat('limb'), partId.limb, true);
    // 螯掌鼓起护甲
    m.paintEllipsoid(side * 0.6, 1.2, 3.4, 2.0, 2.3, 1.75, mat('limb'), partId.limb, true);
    // 外侧弯钳（带亮棱）
    m.paintCapsule(side * 1.5, 2.0, 3.6, side * 0.3, 5.2, 3.2, 1.15, 0.58, mat('limb'), partId.limb, true);
    m.paintCapsule(side * 1.6, 1.8, 4.3, side * 0.5, 4.9, 3.9, 0.65, 0.42, mat('rim'), partId.rim, false);
    // 内侧短咬指（亮边锯齿感）
    m.paintCapsule(-side * 0.6, 2.2, 3.2, -side * 1.0, 4.7, 3.0, 0.95, 0.52, mat('joint'), partId.joint, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 7, centerZ: 3 });
  }

  // =========================================================================
  // 5. 细长可摆触须节段（3 档递细，沿 +Y 方向拉长胶囊确保高重叠）
  // =========================================================================
  function buildAntennaSeg(makeCanvas, r0, r1, len) {
    const S = Math.max(4, Math.ceil(Math.max(r0, r1) * 2 + 3));
    const D = Math.max(6, Math.ceil(len + 3));
    const m = new VoxelModel(S, D, S, SPEC);
    const { mat, partId } = SPEC;
    const cz = S * 0.5;
    m.paintCapsule(0, -len * 0.5, cz, 0, len * 0.5, cz, r0, r1, mat('rim'), partId.rim, true);
    m.paintEllipsoid(0, -len * 0.45, cz, r0 * 1.15, r0 * 1.15, r0 * 1.1, mat('joint'), partId.joint, false);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.5, headZ: S, centerZ: cz });
  }

  // =========================================================================
  // 6. 多节硬壳步足 3 段连杆（全部左右对称，沿 +Y 指向足尖，渲染器只烘 0~180°）
  //    基节+腿节（上拱）-> 膝护甲+胫节（折角下斜）-> 尖跗节（弯爪触底）
  // =========================================================================
  function buildLegCoxaFemur(makeCanvas) {
    const W = 7, D = 10, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 基节关节球（深嵌背甲内）
    m.paintEllipsoid(0, -3.2, 2.2, 1.55, 1.55, 1.45, mat('joint'), partId.joint, true);
    // 粗壮腿节斜上外伸至高拱膝节
    m.paintCapsule(0, -3.0, 2.2, 0, 3.2, 4.8, 1.55, 1.38, mat('limb'), partId.limb, true);
    // 腿节背侧亮棱
    m.paintCapsule(0, -2.2, 3.2, 0, 3.0, 5.4, 0.72, 0.65, mat('rim'), partId.rim, false);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5, headZ: 6, centerZ: 3 });
  }

  function buildLegKneeTibia(makeCanvas) {
    const W = 7, D = 9, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 膝节硬壳护甲（清晰折角转折点）
    m.paintEllipsoid(0, -2.2, 5.4, 1.65, 1.65, 1.55, mat('rim'), partId.rim, true);
    // 胫节陡斜向下
    m.paintCapsule(0, -2.0, 5.2, 0, 2.6, 1.8, 1.38, 1.12, mat('limb'), partId.limb, true);
    m.paintEllipsoid(0, 2.4, 1.9, 1.15, 1.15, 1.10, mat('joint'), partId.joint, false);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.4, headZ: 7, centerZ: 3 });
  }

  function buildLegTarsus(makeCanvas) {
    const W = 6, D = 8, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 尖跗节上粗下尖弯爪，底端精准落在 z=0 贴底
    m.paintCapsule(0, -1.8, 4.6, 0, 0.6, 2.2, 1.15, 0.88, mat('limb'), partId.limb, true);
    m.paintCapsule(0, 0.5, 2.2, 0, 2.0, 0.6, 0.85, 0.48, mat('joint'), partId.joint, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.8, headZ: 6, centerZ: 2 });
  }

  // =========================================================================
  // 7. 待机交互物：水面立体体素洁白浮冰碎块（3 种造型，散布 4 块）
  // =========================================================================
  function buildIceFloe(makeCanvas, variant) {
    const cfgs = [
      { W: 14, D: 13, H: 6, rx: 5.8, ry: 5.2, seed: 1.1 },
      { W: 12, D: 11, H: 5, rx: 4.8, ry: 4.3, seed: 2.4 },
      { W: 10, D: 10, H: 5, rx: 3.9, ry: 3.7, seed: 3.9 }
    ];
    const cfg = cfgs[variant % cfgs.length];
    const m = new VoxelModel(cfg.W, cfg.D, cfg.H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-cfg.rx - 1, cfg.rx + 1, -cfg.ry - 1, cfg.ry + 1, 0, cfg.H - 1, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      // 多面体不规则冰块轮廓（带棱角切面）
      const poly = 1.0 + Math.sin(ang * 3 + cfg.seed) * 0.14 + Math.cos(ang * 5 - cfg.seed) * 0.08;
      // 顶部略收窄成冰块斜面
      const topTaper = z >= cfg.H - 2 ? 0.86 : 1.0;
      const d = Math.hypot(X / (cfg.rx * poly * topTaper), Y / (cfg.ry * poly * topTaper));
      if (d > 1.0) return;
      if (z === cfg.H - 1 && d > 0.72) return;
      m.setRaw(x, y, z, mat('ice'), partId.ice);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: cfg.rx, headZ: cfg.H, centerZ: 2 });
  }

  // 6 足三角步态挂点配置（L1+R2+L3 为 0 组，R1+L2+R3 为 1 组）
  // 髋位深嵌 ±8.2 背甲内 2.0 格，前/中/后落点沿 Y 轴间隔 >= 10.0 格防交叉打架
  const HEX_LEG_SPECS = [
    { id: 'L1', side: -1, tripodGroup: 0, hipX: -5.8, hipY:  5.2, hipZ: 4.4, restX: -12.2, restY:  10.0, L1: 5.8, L2: 6.6, bendDir: 1 },
    { id: 'R1', side:  1, tripodGroup: 1, hipX:  5.8, hipY:  5.2, hipZ: 4.4, restX:  12.2, restY:  10.0, L1: 5.8, L2: 6.6, bendDir: 1 },
    { id: 'L2', side: -1, tripodGroup: 1, hipX: -6.4, hipY: -0.2, hipZ: 4.3, restX: -13.4, restY:  -0.2, L1: 6.0, L2: 6.8, bendDir: 1 },
    { id: 'R2', side:  1, tripodGroup: 0, hipX:  6.4, hipY: -0.2, hipZ: 4.3, restX:  13.4, restY:  -0.2, L1: 6.0, L2: 6.8, bendDir: 1 },
    { id: 'L3', side: -1, tripodGroup: 0, hipX: -5.8, hipY: -5.8, hipZ: 4.2, restX: -12.0, restY: -10.4, L1: 5.8, L2: 6.6, bendDir: 1 },
    { id: 'R3', side:  1, tripodGroup: 1, hipX:  5.8, hipY: -5.8, hipZ: 4.2, restX:  12.0, restY: -10.4, L1: 5.8, L2: 6.6, bendDir: 1 }
  ];

  // 4 块散布水面的立体浮冰碎块默认布局（与甲壳兽留出清晰外圈间距，防穿模）
  const FLOE_LAYOUT = [
    { key: 'iceFloe0', x:  18.0, y:  20.0, yaw:  0.42, phase: 0.0 },
    { key: 'iceFloe1', x: -24.0, y:  14.0, yaw: -0.85, phase: 1.7 },
    { key: 'iceFloe2', x:  23.0, y: -18.0, yaw:  1.25, phase: 3.1 },
    { key: 'iceFloe1', x: -20.0, y: -22.0, yaw: -2.10, phase: 4.6 }
  ];

  const Sea2Def = {
    id: 'sea2_qalupalik',
    code: '海2',
    status: 'done',
    name: '海2 · 冰下甲壳兽',
    tag: '6足三角步态 · 半透育儿囊嗡鸣',
    summary: 'v3 精制（M09 标杆）：扁阔重甲背甲 + 6 条三段硬壳步足（L1+R2+L3 与 R1+L2+R3 反相三角步态）+ 背部半透育儿囊与微亮圆卵 + 潜伏浮冰下发出青白嗡鸣震波震颤浮冰',
    defaultHabitat: 'iceSea',
    footRadius: 12.2,
    ecoWeight: 1.4,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '6 足三角步态（Tripod Gait）低抬足贴底爬行',
      '扁阔重甲头胸背甲与 4 道甲片分缝',
      '半透育儿囊袋 2 档搏动与微亮圆卵',
      '可摆双触须与前伸短螯钳',
      '冰下潜伏浮冰碎块与嗡鸣震波循环'
    ],
    soulHabit: '冰下沿弧线缓慢爬行潜伏至洁白浮冰下方停住 -> 背部育儿袋周期性鼓胀搏动并向冰面传出青白嗡鸣震波 -> 上方浮冰颤动冒出冰屑微粒、囊内圆卵微晃 -> 继续潜行换位',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        carapace:      buildCarapace(makeCanvas),
        broodSacRest:  buildBroodSac(makeCanvas, false),
        broodSacPulse: buildBroodSac(makeCanvas, true),
        broodEggs:     buildBroodEggs(makeCanvas),
        pincerL:       buildPincer(makeCanvas, -1),
        pincerR:       buildPincer(makeCanvas,  1),
        antSeg0:       buildAntennaSeg(makeCanvas, 0.85, 0.72, 3.6),
        antSeg1:       buildAntennaSeg(makeCanvas, 0.70, 0.56, 3.6),
        antSeg2:       buildAntennaSeg(makeCanvas, 0.54, 0.40, 3.4),
        legCoxaFemur:  buildLegCoxaFemur(makeCanvas),
        legKneeTibia:  buildLegKneeTibia(makeCanvas),
        legTarsus:     buildLegTarsus(makeCanvas),
        iceFloe0:      buildIceFloe(makeCanvas, 0),
        iceFloe1:      buildIceFloe(makeCanvas, 1),
        iceFloe2:      buildIceFloe(makeCanvas, 2)
      };

      // 浮冰保持洁白极地冰色，甲壳兽本体随 4 套皮肤零重建模换色
      const creatureRecolorAssets = Object.keys(parts)
        .filter(k => !k.startsWith('iceFloe'))
        .map(k => parts[k]);

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;

      const gait = new MultiLegGaitSolver(HEX_LEG_SPECS, {
        mode: 'tripod',
        stepThreshold: 3.6,
        stepDuration: 0.24,
        stepHeight: 2.0,
        settleDelay: 0.14,
        settleThreshold: 0.85
      });

      const floes = FLOE_LAYOUT.map((cfg, idx) => ({
        idx,
        partKey: cfg.key,
        baseX: hx0 + cfg.x,
        baseY: hy0 + cfg.y,
        x: hx0 + cfg.x,
        y: hy0 + cfg.y,
        z: 2.8,
        yaw: cfg.yaw,
        phase: cfg.phase,
        shakeAmp: 0,
        shakePhase: idx * 2.1
      }));

      const pincerLSpring = new SpringDamper1D(0, 95, 7.5);
      const pincerRSpring = new SpringDamper1D(0, 95, 7.5);
      const antLSpring    = new SpringDamper1D(0, 62, 5.2);
      const antRSpring    = new SpringDamper1D(0, 62, 5.2);
      const eggSwaySpring = new SpringDamper1D(0, 70, 4.6);

      const state = {
        x: hx0,
        y: hy0,
        z: 3.2,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        turnRate: 0,
        // 状态机：stalk（弧线潜行至浮冰下）-> lurk（冰下停驻收足）-> hum（育儿袋鼓胀嗡鸣震波）-> roam（巡弋换位）
        mode: 'stalk',
        modeTimer: 0,
        targetFloeIdx: 0,
        humPulseIdx: 0,
        sacPulsing: false,
        sacPulseTimer: 0,
        eggLiftOff: 0,
        wakeCd: 0
      };

      const sockets = new SocketTracker();
      const footContacts = HEX_LEG_SPECS.map(() => ({ x: 0, y: 0, z: 0, r: 2.0 }));
      let curSkin = SKINS[0];

      const instance = {
        def: Sea2Def,
        cachePrefix: `sea2_qalupalik_${Math.random().toString(36).slice(2, 7)}`,
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
          for (const a of creatureRecolorAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 3.2;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.turnRate = 0;
          state.mode = 'stalk';
          state.modeTimer = 0;
          state.targetFloeIdx = 0;
          state.humPulseIdx = 0;
          state.sacPulsing = false;
          state.sacPulseTimer = 0;
          state.eggLiftOff = 0;

          for (let i = 0; i < floes.length; i++) {
            const f = floes[i];
            f.baseX = homeX + FLOE_LAYOUT[i].x;
            f.baseY = homeY + FLOE_LAYOUT[i].y;
            f.x = f.baseX;
            f.y = f.baseY;
            f.z = 2.8;
            f.shakeAmp = 0;
          }

          pincerLSpring.x = pincerLSpring.v = 0;
          pincerRSpring.x = pincerRSpring.v = 0;
          antLSpring.x = antLSpring.v = 0;
          antRSpring.x = antRSpring.v = 0;
          eggSwaySpring.x = eggSwaySpring.v = 0;

          gait.reset(homeX, homeY, homeYaw, 1.0);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex  = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp    = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const isIdle = !!(eco && (eco.action === 'idle' || eco.patrol === false));
          const patrol = !isIdle;
          const isWater = !!(habitat && habitat.isWater);
          const fx = curSkin.fx || SKINS[0].fx;
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const homeYaw = (eco && eco.homeYaw) ?? 0;
          const baseLift = (isWater ? 3.0 : 3.2) * sMul;

          // -----------------------------------------------------------------
          // 1. 浮冰布局微调：待机时将 0 号浮冰轻移至甲壳兽正前上方 11.5 格处方便观赏互动
          // -----------------------------------------------------------------
          for (let i = 0; i < floes.length; i++) {
            const f = floes[i];
            let tgtBX = homeX + FLOE_LAYOUT[i].x * sMul;
            let tgtBY = homeY + FLOE_LAYOUT[i].y * sMul;
            if (isIdle && i === 0) {
              const [ix, iy] = localToWorldXY(homeX, homeY, homeYaw, 5.5 * sMul, 16.5 * sMul);
              tgtBX = ix;
              tgtBY = iy;
            }
            f.baseX = lerp(f.baseX, tgtBX, expSmooth(dt, 2.4));
            f.baseY = lerp(f.baseY, tgtBY, expSmooth(dt, 2.4));
          }

          // -----------------------------------------------------------------
          // 2. 生态交互状态机（巡游 & 待机双态完整闭环）
          //    stalk（弧线潜行接近浮冰）-> lurk（冰下停稳收足）-> hum（育儿袋搏动 + 3 圈嗡鸣波纹震冰）-> roam（巡弋换位）
          // -----------------------------------------------------------------
          state.modeTimer += dt;
          const tgtFloe = floes[state.targetFloeIdx % floes.length];

          if (isIdle) {
            // 原地待机：安稳停驻于 0 号浮冰前侧水域，循环「静伏呼吸 -> 3 连育儿袋嗡鸣震颤浮冰」
            state.targetFloeIdx = 0;
            const aimToFloe = Math.atan2(-(floes[0].baseX - state.x), floes[0].baseY - state.y);
            Propulsion.walkToPoint(state, homeX, homeY, dt, { speed: spdMul, gaitFreq: gFreq }, {
              arriveDist: 1.6 * sMul,
              maxSpeed: 10.0,
              maxTurn: 1.8,
              aimYaw: aimToFloe,
              baseLift
            });

            if (state.mode !== 'lurk' && state.mode !== 'hum') {
              state.mode = 'lurk';
              state.modeTimer = 0;
              state.humPulseIdx = 0;
            }
            if (state.mode === 'lurk' && state.modeTimer >= 2.2) {
              state.mode = 'hum';
              state.modeTimer = 0;
              state.humPulseIdx = 0;
            } else if (state.mode === 'hum' && state.modeTimer >= 3.2) {
              state.mode = 'lurk';
              state.modeTimer = 0;
              state.sacPulsing = false;
            }
          } else {
            // 自由巡游：缓慢弧线潜行（heavy 性格）前往浮冰外缘 -> 停稳嗡鸣震冰 -> 换位巡弋
            if (state.mode === 'stalk') {
              // 停在目标浮冰外缘 15.5 格处面向浮冰，杜绝浮冰穿模遮挡躯干与触须
              const toFloeX = tgtFloe.baseX - state.x;
              const toFloeY = tgtFloe.baseY - state.y;
              const dF = Math.hypot(toFloeX, toFloeY) || 1;
              const standOff = 15.5 * sMul;
              const stopX = tgtFloe.baseX - (toFloeX / dF) * standOff;
              const stopY = tgtFloe.baseY - (toFloeY / dF) * standOff;
              const res = Propulsion.walkToPoint(state, stopX, stopY, dt, { speed: spdMul, gaitFreq: gFreq }, {
                arriveDist: 2.8 * sMul,
                maxSpeed: 10.6,
                maxTurn: 1.65,
                pulseAmp: 0.18,
                pulseFreq: 3.2,
                baseLift
              });
              if (res.arrived || state.modeTimer >= 6.8) {
                state.mode = 'lurk';
                state.modeTimer = 0;
                state.humPulseIdx = 0;
              }
            } else if (state.mode === 'lurk') {
              // 刹停收足静伏 0.85s
              const kStop = expSmooth(dt, 7.5);
              state.vx = lerp(state.vx, 0, kStop);
              state.vy = lerp(state.vy, 0, kStop);
              state.x += state.vx * dt;
              state.y += state.vy * dt;
              state.z = lerp(state.z, baseLift, expSmooth(dt, 8));
              if (state.modeTimer >= 0.85) {
                state.mode = 'hum';
                state.modeTimer = 0;
                state.humPulseIdx = 0;
              }
            } else if (state.mode === 'hum') {
              const kStop = expSmooth(dt, 8.5);
              state.vx = lerp(state.vx, 0, kStop);
              state.vy = lerp(state.vy, 0, kStop);
              state.x += state.vx * dt;
              state.y += state.vy * dt;
              state.z = lerp(state.z, baseLift, expSmooth(dt, 8));
              if (state.modeTimer >= 3.3) {
                state.mode = 'roam';
                state.modeTimer = 0;
                state.sacPulsing = false;
                state.targetFloeIdx = (state.targetFloeIdx + 1) % floes.length;
              }
            } else {
              // roam：重甲缓慢弧线巡弋（walkStyle: 'heavy'）约 4.2s 再潜伏下一块浮冰
              Propulsion.multiLegWalk(state, dt, time, { speed: spdMul * 0.92, gaitFreq: gFreq }, {
                ...(eco || {}),
                patrol: true,
                walkStyle: 'heavy',
                baseLift,
                maxRadius: (eco && eco.maxRadius) || 44
              });
              if (state.modeTimer >= 4.2) {
                state.mode = 'stalk';
                state.modeTimer = 0;
              }
            }
          }

          // -----------------------------------------------------------------
          // 3. 育儿袋搏动 + 青白嗡鸣震波（2~3 圈清晰扩散）+ 浮冰震颤与冰屑微粒
          // -----------------------------------------------------------------
          const [sacWX, sacWY] = localToWorldXY(state.x, state.y, state.yaw, 0, -1.2 * sMul);
          if (state.mode === 'hum') {
            const pulseTimes = [0.22, 1.18, 2.14];
            if (state.humPulseIdx < pulseTimes.length && state.modeTimer >= pulseTimes[state.humPulseIdx]) {
              state.humPulseIdx++;
              state.sacPulsing = true;
              state.sacPulseTimer = 0.42;
              eggSwaySpring.impulse((state.humPulseIdx & 1 ? 1 : -1) * 11.5 * sp);
              pincerLSpring.impulse(-4.5 * sp);
              pincerRSpring.impulse( 4.5 * sp);

              // 向冰面传出清晰扩散的青白嗡鸣震动波纹（双圈叠波增强读感）
              if (vfx) {
                vfx.addRipple(sacWX, sacWY, 4.5 * sMul, 26.0 * sMul, 1.05, 2.2);
                vfx.addRipple(sacWX, sacWY, 3.0 * sMul, 18.5 * sMul, 0.78, 1.5);
              }
              // 震颤附近所有浮冰（距离越近颤动越强），并迸发洁白/青白冰屑微粒
              for (const fl of floes) {
                const distF = Math.hypot(fl.baseX - sacWX, fl.baseY - sacWY);
                if (distF < 28 * sMul) {
                  const power = clamp(1 - distF / (28 * sMul), 0.25, 1.0);
                  fl.shakeAmp = Math.max(fl.shakeAmp, 1.35 * power);
                  if (vfx) {
                    const chipCnt = Math.round(3 + power * 4);
                    for (let c = 0; c < chipCnt; c++) {
                      const a = Math.random() * TAU;
                      const spd = (5 + Math.random() * 11) * power * sMul;
                      vfx.spawnParticle(
                        fl.x + (Math.random() - 0.5) * 6 * sMul,
                        fl.y + (Math.random() - 0.5) * 6 * sMul,
                        fl.z + 3.2 * sMul,
                        Math.cos(a) * spd, Math.sin(a) * spd, (8 + Math.random() * 10) * power * sMul,
                        0.45 + Math.random() * 0.22, 1.15 + Math.random() * 0.55,
                        (c & 1) ? fx.chipA : fx.chipB, false, 34
                      );
                    }
                  }
                }
              }
            }
          }

          if (state.sacPulseTimer > 0) {
            state.sacPulseTimer -= dt;
            state.sacPulsing = state.sacPulseTimer > 0;
          } else {
            // 常态轻呼吸偶发微鼓（约每 3.4 秒轻鼓 0.32s）
            const breathCy = (time * 0.30) % 1;
            state.sacPulsing = state.mode !== 'hum' && breathCy > 0.88;
          }

          // 更新 4 块水面浮冰的漂浮微晃、外圈防穿模软排斥与被震颤时的抖动衰减
          const minFloeDist = 15.5 * sMul;
          for (const fl of floes) {
            fl.shakeAmp = Math.max(0, fl.shakeAmp - dt * 1.45);
            fl.shakePhase += dt * 36.0;
            const shX = Math.sin(fl.shakePhase) * fl.shakeAmp * 1.15 * sMul;
            const shY = Math.cos(fl.shakePhase * 1.3) * fl.shakeAmp * 0.95 * sMul;
            const shZ = Math.abs(Math.sin(fl.shakePhase * 0.8)) * fl.shakeAmp * 1.1 * sMul;
            const driftX = Math.sin(time * 0.55 + fl.phase) * 0.8 * sMul;
            const driftY = Math.cos(time * 0.48 + fl.phase) * 0.8 * sMul;
            let fxPos = fl.baseX + driftX + shX;
            let fyPos = fl.baseY + driftY + shY;
            const rdx = fxPos - state.x, rdy = fyPos - state.y;
            const rDist = Math.hypot(rdx, rdy) || 0.001;
            if (rDist < minFloeDist) {
              fxPos = state.x + (rdx / rDist) * minFloeDist;
              fyPos = state.y + (rdy / rDist) * minFloeDist;
            }
            fl.x = fxPos;
            fl.y = fyPos;
            fl.z = (3.1 + Math.sin(time * 1.4 + fl.phase) * 0.28) * sMul + shZ;
          }

          // -----------------------------------------------------------------
          // 4. 6 足三角步态解算（低抬足 1.9 格贴底稳健爬行，停步自动收足）
          // -----------------------------------------------------------------
          const gaitRes = gait.update(dt, state.x, state.y, state.z, state.yaw, state.vx, state.vy, {
            scaleMul: sMul,
            mode: 'tripod',
            stepFreq: gFreq,
            stepHeight: 1.95 * sMul,
            stepThreshold: 3.5 * sMul,
            settleThreshold: 0.85 * sMul
          });

          for (let i = 0; i < gait.legs.length; i++) {
            const leg = gait.legs[i];
            footContacts[i].x = leg.footX;
            footContacts[i].y = leg.footY;
            footContacts[i].z = leg.footZ;
            footContacts[i].r = 1.9 * sMul;
          }

          // 水下潜行轻柔微波尾迹
          const moveSpd = Math.hypot(state.vx, state.vy);
          state.wakeCd -= dt;
          if (vfx && isWater && moveSpd > 3.2 && state.wakeCd <= 0) {
            state.wakeCd = 0.24;
            EnvFeedback.emitWaterWake(vfx, habitat, state.x, state.y, state.yaw, 9.5 * sMul, 0.45);
          }

          // -----------------------------------------------------------------
          // 5. 触须、前伸螯钳与囊内圆卵弹性微动
          // -----------------------------------------------------------------
          const turnBias = clamp(-state.turnRate * 0.22, -0.35, 0.35);
          const antWave = Math.sin(time * 2.4 * gFreq) * 0.22 * flex;
          antLSpring.update(dt, -0.32 + antWave + turnBias, 62 * sp, clamp(5.2 * dScale, 2.4, 9.5));
          antRSpring.update(dt,  0.32 - antWave + turnBias, 62 * sp, clamp(5.2 * dScale, 2.4, 9.5));

          const pinchBreath = Math.sin(time * 1.9) * 0.09 + (state.sacPulsing ? 0.14 : 0);
          pincerLSpring.update(dt, -0.14 - pinchBreath, 92 * sp, clamp(7.2 * dScale, 3.0, 11.5));
          pincerRSpring.update(dt,  0.14 + pinchBreath, 92 * sp, clamp(7.2 * dScale, 3.0, 11.5));

          eggSwaySpring.update(dt, Math.sin(time * 2.1) * 0.18, 68 * sp, clamp(4.6 * dScale, 2.2, 8.8));
          state.eggLiftOff = lerp(state.eggLiftOff, (state.sacPulsing ? 0.75 : 0.0) + Math.sin(time * 2.6) * 0.22, expSmooth(dt, 10.0));

          sockets.setLocal('broodSac', state.x, state.y, state.z, state.yaw, 0, -1.2, 8.5, sMul);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? habitat.waterLevel : 2.6;
          const yw = state.yaw;
          // 冰下潜游保持清晰的 submerge 水色染色（约 0.55~0.75）
          const bodySub = isWater ? clamp(EnvFeedback.calcSubmerge(state.z - 0.8 * sMul, waterLvl + 2.2, 5.4, true), 0.38, 0.72) : 0;

          // 1. 6 条多节硬壳步足（每条由基节腿节 + 膝护甲胫节 + 尖跗节 3 段沿真实髋->膝->足连线高重叠衔接）
          for (let i = 0; i < gait.legs.length; i++) {
            const leg = gait.legs[i];
            const dx = leg.footX - leg.hipWX;
            const dy = leg.footY - leg.hipWY;
            const legYaw = Math.hypot(dx, dy) > 0.05 ? Math.atan2(-dx, dy) : wrapAngle(yw - leg.side * Math.PI * 0.5);

            // 上段：基节+腿节（深嵌背甲内 -> 高拱膝节）
            const cfx = lerp(leg.hipWX, leg.kneeX, 0.44);
            const cfy = lerp(leg.hipWY, leg.kneeY, 0.44);
            const cfz = Math.min(leg.hipWZ, leg.kneeZ) - 1.6 * sMul;
            list.push({
              partKey: 'legCoxaFemur',
              asset: parts.legCoxaFemur,
              x: cfx,
              y: cfy,
              lift: Math.max(0.2, cfz),
              ro: legYaw,
              bias: -0.32,
              submerge: bodySub
            });

            // 中段：膝节护甲+胫节（高拱膝节 -> 小腿下段）
            const ktx = lerp(leg.kneeX, leg.footX, 0.34);
            const kty = lerp(leg.kneeY, leg.footY, 0.34);
            const ktz = leg.footZ + Math.max(0, leg.kneeZ - leg.footZ) * 0.22;
            list.push({
              partKey: 'legKneeTibia',
              asset: parts.legKneeTibia,
              x: ktx,
              y: kty,
              lift: Math.max(0.2, ktz),
              ro: legYaw,
              bias: -0.22,
              submerge: bodySub
            });

            // 末段：尖跗节（精准贴底）
            const tx = lerp(leg.kneeX, leg.footX, 0.78);
            const ty = lerp(leg.kneeY, leg.footY, 0.78);
            list.push({
              partKey: 'legTarsus',
              asset: parts.legTarsus,
              x: tx,
              y: ty,
              lift: Math.max(0, leg.footZ),
              ro: legYaw,
              bias: -0.14,
              submerge: bodySub
            });
          }

          // 2. 一对前伸短螯钳（枢轴锁在头胸前侧深嵌处）
          const pincerDefs = [
            { k: 'pincerL', s: -1, yawOff: pincerLSpring.x },
            { k: 'pincerR', s:  1, yawOff: pincerRSpring.x }
          ];
          for (const pd of pincerDefs) {
            const [jx, jy] = localToWorldXY(state.x, state.y, yw, pd.s * 4.4 * sMul, 9.8 * sMul);
            const pYaw = wrapAngle(yw + clamp(pd.yawOff, -0.55, 0.55));
            const [px, py] = pivotToWorldXY(jx, jy, pYaw, -pd.s * 1.4 * sMul, -3.4 * sMul);
            list.push({
              partKey: pd.k,
              asset: parts[pd.k],
              x: px,
              y: py,
              lift: Math.max(0.6, state.z + 1.2 * sMul),
              ro: pYaw,
              bias: -0.05,
              submerge: bodySub
            });
          }

          // 3. 一对细长可摆触须（每侧 3 节外弧前探，高重叠衔接）
          const antDefs = [
            { s: -1, spring: antLSpring.x },
            { s:  1, spring: antRSpring.x }
          ];
          const antKeys = ['antSeg0', 'antSeg1', 'antSeg2'];
          const antLen = 2.85 * sMul;
          for (const ad of antDefs) {
            let [ax, ay] = localToWorldXY(state.x, state.y, yw, ad.s * 2.4 * sMul, 11.4 * sMul);
            let curYaw = wrapAngle(yw - ad.s * 0.24 + ad.spring * 0.75);
            for (let si = 0; si < antKeys.length; si++) {
              curYaw = wrapAngle(curYaw - ad.s * 0.20 + ad.spring * 0.22);
              const [cx, cy] = localToWorldXY(ax, ay, curYaw, 0, antLen * 0.5);
              list.push({
                partKey: antKeys[si],
                asset: parts[antKeys[si]],
                x: cx,
                y: cy,
                lift: Math.max(1.0, state.z + (4.2 - si * 0.35) * sMul),
                ro: curYaw,
                bias: 0.14 + si * 0.04,
                submerge: bodySub * 0.80
              });
              [ax, ay] = localToWorldXY(ax, ay, curYaw, 0, antLen);
            }
          }

          // 4. 主重甲头胸背甲 + 尾扇
          list.push({
            partKey: 'carapace',
            asset: parts.carapace,
            x: state.x,
            y: state.y,
            lift: Math.max(0.8, state.z),
            ro: yw,
            bias: 0.22,
            submerge: bodySub
          });

          // 5. 背部育儿囊内部微亮圆卵与小幼体轮廓（位于半透囊壳内部，随嗡鸣微晃）
          const [sacX, sacY] = localToWorldXY(state.x, state.y, yw, eggSwaySpring.x * 0.45 * sMul, -1.2 * sMul);
          list.push({
            partKey: 'broodEggs',
            asset: parts.broodEggs,
            x: sacX,
            y: sacY,
            lift: Math.max(1.2, state.z + (7.2 + state.eggLiftOff) * sMul),
            ro: wrapAngle(yw + eggSwaySpring.x * 0.25),
            bias: 0.58,
            submerge: bodySub * 0.25
          });

          // 6. 背部正中半透育儿囊袋（2 档无损烘焙过渡 + opacity 半透壳层）
          const [bagX, bagY] = localToWorldXY(state.x, state.y, yw, 0, -1.2 * sMul);
          const sacKey = state.sacPulsing ? 'broodSacPulse' : 'broodSacRest';
          list.push({
            partKey: sacKey,
            asset: parts[sacKey],
            x: bagX,
            y: bagY,
            lift: Math.max(1.0, state.z + 6.2 * sMul),
            ro: yw,
            bias: 0.74,
            opacity: state.sacPulsing ? 0.62 : 0.54,
            submerge: bodySub * 0.22
          });

          // 7. 待机交互物：4 块水面立体洁白浮冰碎块（浮于水面上方，受震波颤动）
          for (let i = 0; i < floes.length; i++) {
            const fl = floes[i];
            list.push({
              partKey: fl.partKey,
              asset: parts[fl.partKey],
              x: fl.x,
              y: fl.y,
              lift: Math.max(1.2, fl.z),
              ro: fl.yaw,
              bias: 1.45,
              submerge: 0
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sea2Def.id,
            code: Sea2Def.code,
            status: Sea2Def.status,
            name: Sea2Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            mode: state.mode,
            legCount: HEX_LEG_SPECS.length,
            gaitMode: 'tripod',
            floeCount: floes.length,
            footRadius: Sea2Def.footRadius,
            headZ: 15,
            centerZ: 7,
            blocks: Sea2Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sea2Def);
})(window.PixelWorkshop);
