'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 泽4 · 三个头各干各的（M32 多头标杆 · v3 精制）
  // -------------------------------------------------------------------------
  // 1. 俯视清晰度与造型分色设计（×4 缩放 + 深泥沼泽舞台一眼区分三头分工）：
  //    - 半沉宽扁泥苔身（拆块 <= 34 格护图集）：
  //      bodyCore(34×34×15, symDeg=180) + bodyFlank(28×16×12, 四向共享) + 6 簇亮翠绿苔藓 + 短墩尾；
  //    - ① 埋泥铲子头（左前粗短颈 4 节，锚点 (-11.5, +11.5)，偏角 +35.5°）：
  //      宽扁亮赭黄/骨白铁铲大吻，贴泥左右拱动翻起泥花与泥潭涟漪，偶发抬头甩泥；
  //    - ② 高举放哨头（背心极细长颈 5 节，锚点 (0, -2.0)，竖直抬升 z≈26~34 格）：
  //      小脑袋配一对放大亮金黄凸眼与鲜红肉冠，360° 慢扫天空，偶发警觉定住并昂头鸣叫震出环纹；
  //    - ③ 喘气鼻囊头（右前中等粗颈 4 节，锚点 (+11.5, +10.5)，偏角 -35.5°）：
  //      头顶一对鲜亮粉橙+浅青双鼻囊，2 档鼓/缩资产无损切换（严禁常态拉伸），贴水喷出细白水汽；
  // 2. 协同小剧场：
  //    - squabble（双头争虫互啄）：铲子头与鼻囊头同时朝正前泥虫点凑近轻撞互啄弹开，放哨头受惊鸣叫；
  //    - alarm（放哨示警齐缩颈）：放哨头高位震环示警 -> 三头齐刷刷缩颈潜低半沉片刻 -> 依次探出复工。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 半沉宽扁泥身（深褐青泥，3 档）
      mudDark:      '#262b24',
      mudMid:       '#3d473a',
      mudHi:        '#5b6955',
      // 浸泥湿缘与底甲（暗泥青，3 档）
      rimDark:      '#1c211b',
      rimMid:       '#30382e',
      rimHi:        '#4a5446',
      // 背上亮翠绿苔藓（高饱和对比，3 档）
      mossDark:     '#226b2d',
      mossMid:      '#3db549',
      mossHi:       '#7ae868',
      // 苔尖嫩芽点缀（嫩黄绿，3 档）
      sporeDark:    '#94a82a',
      sporeMid:     '#d4e04a',
      sporeHi:      '#f5ff8a',
      // ① 铲子头亮赭黄吻背（3 档）
      shovelDark:   '#9e6b14',
      shovelMid:    '#e0a324',
      shovelHi:     '#ffd95e',
      // ① 铲子头骨白厚铲刃（3 档）
      boneDark:     '#a69e8a',
      boneMid:      '#dbd3be',
      boneHi:       '#faf5e6',
      // ② 放哨头细颈青绿皮（3 档）
      scoutDark:    '#2e544a',
      scoutMid:     '#4c8272',
      scoutHi:      '#7ab39e',
      // ② 放哨头鲜红肉冠（3 档）
      crestDark:    '#8f1927',
      crestMid:     '#d92b3f',
      crestHi:      '#ff6673',
      // ② 放哨头放大亮金黄凸眼眶（3 档）
      eyeGoldDark:  '#c4820a',
      eyeGoldMid:   '#ffbe1a',
      eyeGoldHi:    '#fff06b',
      // ③ 鼻囊头中等粗颈水青皮（3 档）
      sacSkinDark:  '#2c4a52',
      sacSkinMid:   '#487580',
      sacSkinHi:    '#72a5b0',
      // ③ 鼻囊头夸张鲜亮粉橙双鼻囊（3 档）
      sacPinkDark:  '#b83c2a',
      sacPinkMid:   '#f5694c',
      sacPinkHi:    '#ffab8c',
      // ③ 双鼻囊气孔浅青亮边（3 档）
      sacAquaDark:  '#2e9694',
      sacAquaMid:   '#5fd4cc',
      sacAquaHi:    '#b3fff5',
      // 锐利五官点睛（严禁进 glowKeys）
      eyeDark:      '#0e1214',
      eyeIris:      '#e89c28',
      eyeSpot:      '#f7fcff'
    },
    glowKeys: [],
    parts: [
      'mud', 'rim', 'moss', 'spore',
      'shovel', 'bone',
      'scout', 'crest', 'eyeGold',
      'sacSkin', 'sacPink', 'sacAqua',
      'eye'
    ],
    noCrease: [
      ['mud', 'rim'], ['mud', 'moss'], ['rim', 'moss'], ['moss', 'spore'],
      ['shovel', 'bone'], ['mud', 'shovel'], ['shovel', 'eye'],
      ['scout', 'crest'], ['scout', 'eyeGold'], ['eyeGold', 'eye'],
      ['sacSkin', 'sacPink'], ['sacPink', 'sacAqua'], ['sacSkin', 'eye']
    ],
    materials: {
      mud:     ['mudDark',     'mudMid',     'mudHi'],
      rim:     ['rimDark',     'rimMid',     'rimHi'],
      moss:    ['mossDark',    'mossMid',    'mossHi'],
      spore:   ['sporeDark',   'sporeMid',   'sporeHi'],
      shovel:  ['shovelDark',  'shovelMid',  'shovelHi'],
      bone:    ['boneDark',    'boneMid',    'boneHi'],
      scout:   ['scoutDark',   'scoutMid',   'scoutHi'],
      crest:   ['crestDark',   'crestMid',   'crestHi'],
      eyeGold: ['eyeGoldDark', 'eyeGoldMid', 'eyeGoldHi'],
      sacSkin: ['sacSkinDark', 'sacSkinMid', 'sacSkinHi'],
      sacPink: ['sacPinkDark', 'sacPinkMid', 'sacPinkHi'],
      sacAqua: ['sacAquaDark', 'sacAquaMid', 'sacAquaHi']
    },
    protectedParts: ['eye', 'eyeGold', 'crest', 'bone', 'sacPink', 'sacAqua', 'spore']
  });

  // 3 套零重建模换色皮肤（0 禁用字，均保持三头高辨识度亮色分色）
  const SKINS = [
    {
      id: 'mud_moss',
      name: '泥苔三色（深沼经典）',
      dot: '#3db549',
      outline: '#0b120e',
      pal: {},
      fx: {
        mud:   '#4f3e2d',
        spray: '#789e76',
        steam: '#ebfcff',
        alert: '#ffbe3b'
      }
    },
    {
      id: 'rot_crimson',
      name: '腐沼赤斑（老泽款）',
      dot: '#c94938',
      outline: '#170c0b',
      pal: {
        mudDark:     '#2e221e', mudMid:     '#4d3831', mudHi:     '#73554b',
        rimDark:     '#211815', rimMid:     '#382924', rimHi:     '#574139',
        mossDark:    '#6b3822', mossMid:    '#ad5e32', mossHi:    '#e69455',
        sporeDark:   '#b58d26', sporeMid:   '#e8c048', sporeHi:   '#fff08c',
        shovelDark:  '#a85a1c', shovelMid:  '#e88d35', shovelHi:  '#ffc46e',
        boneDark:    '#ada08e', boneMid:    '#dfd2bd', boneHi:    '#fcf2e3',
        scoutDark:   '#4d3d33', scoutMid:   '#786050', scoutHi:   '#a88b76',
        crestDark:   '#a3173c', crestMid:   '#eb2f5e', crestHi:   '#ff7897',
        sacSkinDark: '#473642', sacSkinMid: '#705568', sacSkinHi: '#9e7c94',
        sacPinkDark: '#c45e1a', sacPinkMid: '#ff9038', sacPinkHi: '#ffc77d',
        sacAquaDark: '#3c9684', sacAquaMid: '#6cd4bc', sacAquaHi: '#bcfce9'
      },
      fx: {
        mud:   '#5c3b2e',
        spray: '#b88363',
        steam: '#fff5e8',
        alert: '#ff708c'
      }
    },
    {
      id: 'jade_pool',
      name: '浅潭碧苔（清泽款）',
      dot: '#2fa88d',
      outline: '#091416',
      pal: {
        mudDark:     '#1d3033', mudMid:     '#2f4e52', mudHi:     '#4b757a',
        rimDark:     '#162429', rimMid:     '#253c42', rimHi:     '#3b5d66',
        mossDark:    '#187058', mossMid:    '#2bb88e', mossHi:    '#6cf0c2',
        sporeDark:   '#70ad36', sporeMid:   '#a8e35b', sporeHi:   '#e0ff9c',
        shovelDark:  '#a87b18', shovelMid:  '#ebc034', shovelHi:  '#ffea7a',
        boneDark:    '#9aa8a6', boneMid:    '#cedbd9', boneHi:    '#f2faf9',
        scoutDark:   '#1f5461', scoutMid:   '#358394', scoutHi:   '#62b8c9',
        crestDark:   '#b02727', crestMid:   '#f24b4b', crestHi:   '#ff8a80',
        sacSkinDark: '#234a5e', sacSkinMid: '#3a7491', sacSkinHi: '#62a4c4',
        sacPinkDark: '#c43b68', sacPinkMid: '#fa6b98', sacPinkHi: '#ffacc7',
        sacAquaDark: '#2494a8', sacAquaMid: '#54d6eb', sacAquaHi: '#b5f8ff'
      },
      fx: {
        mud:   '#345457',
        spray: '#6ec4bd',
        steam: '#e8fdff',
        alert: '#ffe052'
      }
    }
  ];

  // =========================================================================
  // 背脊高度估算（用于背上 6 簇亮翠苔藓与背心细长颈根部贴合）
  // =========================================================================
  function evalBodyTopZ(lx, ly) {
    const r2 = (lx * lx) / (23.0 * 23.0) + (ly * ly) / (21.0 * 21.0);
    if (r2 >= 0.96) return 5.0;
    return 3.2 + 10.6 * Math.sqrt(Math.max(0.05, 1.0 - r2));
  }

  // =========================================================================
  // 1. 半沉宽扁泥苔身主核 bodyCore（34×34×15，严格双轴对称 symDeg=180）
  //    河马般宽扁沉稳泥身 + 背脊成片亮翠绿苔藓与湿泥脊棱
  // =========================================================================
  function buildBodyCore(makeCanvas) {
    const W = 34, D = 34, H = 15;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-16.0, 16.0, -16.0, 16.0, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      const ay = Math.abs(Y);
      const r2 = (ax * ax) / (16.4 * 16.4) + (ay * ay) / (16.4 * 16.4);
      if (r2 > 1.0) return;

      const arch = Math.sqrt(Math.max(0, 1.0 - r2));
      const rib = Math.cos(ay * 0.52) * 0.42 + Math.cos(ax * 0.48) * 0.35;
      const topZ = 2.6 + 10.8 * Math.pow(arch, 0.68) + rib;
      if (z > topZ || z < 1.0) return;

      const isTop = z >= topZ - 1.65;
      const mossPatch = Math.sin(ax * 0.44 + 0.5) * Math.cos(ay * 0.42);
      if (z <= 3.6) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else if (isTop && mossPatch > 0.18 && r2 < 0.78) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else {
        m.setRaw(x, y, z, mat('mud'), partId.mud);
      }
    });

    // 中央厚苔垫（衬托背心高举放哨细颈的基座）
    m.paintEllipsoid(0, 0, 12.6, 5.2, 5.2, 1.8, mat('moss'), partId.moss, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 16.5, headZ: 14, centerZ: 7 });
  }

  // =========================================================================
  // 2. 四向共享宽扁泥裙侧翼 bodyFlank（28×16×12，严格 X 对称，左/右/前/后 4 块复用）
  //    局部 +Y 朝外缘，局部 -Y 深嵌 bodyCore 6.5 格，无接缝且极大压缩图集占用
  // =========================================================================
  function buildBodyFlank(makeCanvas) {
    const W = 28, D = 16, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-13.0, 13.0, -7.5, 7.5, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      const eNorm = (ax * ax) / (13.4 * 13.4) + ((Y + 2.0) * (Y + 2.0)) / (9.6 * 9.6);
      if (eNorm > 1.0) return;
      const outU = clamp((Y + 7.5) / 15.0, 0, 1);
      const arch = Math.sqrt(Math.max(0, 1.0 - eNorm));
      const roofZ = lerp(11.0, 3.2, Math.pow(outU, 1.04)) * (0.28 + 0.72 * arch);
      if (z > roofZ || z < 0.8) return;

      if (Y > 3.6 || z <= 3.0) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else if (z > roofZ - 1.5 && ((Math.round(ax * 0.65 + Y * 0.55) & 3) === 0) && Y < 2.8) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else {
        m.setRaw(x, y, z, mat('mud'), partId.mud);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 11.2, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 3. 背上亮翠绿苔藓丛 mossTuft（10×10×9，symDeg=90，6 簇复用）
  //    高饱和亮绿苔堆 + 顶部嫩黄芽点，俯视一眼打破暗泥沉闷感
  // =========================================================================
  function buildMossTuft(makeCanvas) {
    const W = 10, D = 10, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.paintEllipsoid(0, 0, 2.2, 3.6, 3.6, 2.0, mat('moss'), partId.moss, true);
    for (const [bx, by, bz] of [[-1.7, 1.4, 4.8], [1.7, -1.4, 4.8], [1.5, 1.6, 4.4], [-1.5, -1.6, 4.4], [0, 0, 6.2]]) {
      m.paintCapsule(bx * 0.4, by * 0.4, 2.0, bx, by, bz, 1.25, 0.72, mat('moss'), partId.moss, true);
    }
    // 顶部三颗亮嫩芽孢点
    m.paintEllipsoid(0, 0, 7.0, 0.92, 0.92, 0.95, mat('spore'), partId.spore, true);
    m.paintEllipsoid(-1.7, 1.4, 5.5, 0.72, 0.72, 0.78, mat('spore'), partId.spore, true);
    m.paintEllipsoid( 1.7, -1.4, 5.5, 0.72, 0.72, 0.78, mat('spore'), partId.spore, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 8, centerZ: 4 });
  }

  // 短墩河马尾（10×12×8）
  function buildStubTail(makeCanvas) {
    const W = 10, D = 12, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 3.2, 4.2, 0, -4.2, 2.6, 2.8, 1.5, mat('mud'), partId.mud, true);
    m.paintEllipsoid(0, -4.2, 2.4, 2.2, 1.6, 1.2, mat('rim'), partId.rim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: 7, centerZ: 3 });
  }

  // =========================================================================
  // 4. 三条独立颈链的轻量共享颈节资产（各设 symDeg=90 / X对称，极省图集）
  //    - shovelNeck (11×11×9)：① 粗短泥颈，背带赭黄条纹
  //    - scoutNeck  (7×7×9)：  ② 极细长竖颈，青绿带细红背脊点
  //    - sacNeck    (9×9×9)：  ③ 中等粗水青颈，带浅青侧筋
  // =========================================================================
  function buildShovelNeckSeg(makeCanvas) {
    const W = 11, D = 11, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 4.4, 4.2, 4.2, 3.8, mat('mud'), partId.mud, true);
    m.paintEllipsoid(0, 0, 7.2, 2.4, 2.8, 1.4, mat('shovel'), partId.shovel, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.4, headZ: 8, centerZ: 4 });
  }

  function buildScoutNeckSeg(makeCanvas) {
    const W = 7, D = 7, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.2, 0, 0, 7.6, 2.15, 1.95, mat('scout'), partId.scout, true);
    // 颈背细红小棘点（俯视与侧视一眼锚定这是放哨细颈）
    m.paintEllipsoid(0, -1.6, 4.6, 0.72, 0.72, 1.15, mat('crest'), partId.crest, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.4, headZ: 8, centerZ: 4 });
  }

  function buildSacNeckSeg(makeCanvas) {
    const W = 9, D = 9, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 4.4, 3.3, 3.3, 3.6, mat('sacSkin'), partId.sacSkin, true);
    m.paintEllipsoid(0, 0, 6.9, 1.9, 2.2, 1.2, mat('sacAqua'), partId.sacAqua, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5, headZ: 8, centerZ: 4 });
  }

  // =========================================================================
  // 5. ① 埋泥铲子头 headShovel（18×24×12，X 对称，枢轴锁后枕 (0, -7.8)）
  //    超大宽扁亮赭黄+骨白铁铲大吻，厚实铲沿前翘，俯视轮廓像一把亮眼泥铲！
  // =========================================================================
  const SHOVEL_PIVOT = { x: 0, y: -7.8 };
  function buildHeadShovel(makeCanvas) {
    const W = 18, D = 24, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 粗实后颅与颊肌
    m.paintEllipsoid(0, -5.2, 5.4, 5.2, 5.2, 4.2, mat('mud'), partId.mud, true);
    m.paintEllipsoid(0, -4.5, 8.2, 4.2, 4.0, 2.0, mat('shovel'), partId.shovel, true);

    // 标志性超宽扁「铁铲大吻」（亮赭黄铲身 + 骨白厚铲刃）
    m.fillAABB(-8.0, 8.0, -2.0, 10.8, 1, 9, (x, y, z, X, Y) => {
      const u = clamp((Y + 2.0) / 12.8, 0, 1); // 0=吻根, 1=铲刃前沿
      const halfW = lerp(5.0, 7.6, Math.sin(u * Math.PI * 0.62)) * (1.0 - Math.max(0, u - 0.85) * 1.4);
      if (Math.abs(X) > halfW) return;
      // 铲面扁平略带中心拱脊，前沿微微上翘利于拱泥
      const centerArch = Math.sqrt(Math.max(0, 1.0 - (X / Math.max(1, halfW)) ** 2));
      const baseZ = lerp(2.0, 1.2, u) + (u > 0.72 ? (u - 0.72) * 3.0 : 0);
      const thick = lerp(5.4, 2.4, u) * (0.45 + 0.55 * centerArch);
      if (z < baseZ || z > baseZ + thick) return;

      // 前沿 3.5 格与两侧外缘做醒目骨白色厚铲刃
      const isBlade = u > 0.66 || Math.abs(X) > halfW - 1.5;
      if (isBlade) {
        m.setRaw(x, y, z, mat('bone'), partId.bone);
      } else {
        m.setRaw(x, y, z, mat('shovel'), partId.shovel);
      }
    });

    // 吻背中央骨质加强筋
    m.paintCapsule(0, -2.5, 7.8, 0, 7.2, 5.2, 1.45, 0.95, mat('bone'), partId.bone, true);

    m.despeckle();
    m.applyArtShading(true);

    // 颅顶两侧小巧警戒眼（不被铲吻遮挡，eyeSpot 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const ey = Math.round(hd - 3.0);
    const ez = 8;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 3.8);
      m.setRaw(ex, ey, ez,     keyToId.eyeDark, partId.eye);
      m.setRaw(ex, ey + 1, ez, keyToId.eyeSpot, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 7.8, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 6. ② 高举放哨头 headScout（14×18×15，X 对称，枢轴锁后枕 (0, -4.0)）
  //    灵巧小脑袋 + 一对极大亮金黄凸眼 + 鲜红高耸肉冠 + 尖敏小哨喙
  // =========================================================================
  const SCOUT_PIVOT = { x: 0, y: -4.0 };
  function buildHeadScout(makeCanvas) {
    const W = 14, D = 18, H = 15;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 灵巧小脑袋 + 尖敏哨喙
    m.paintEllipsoid(0, -1.0, 5.2, 3.6, 4.4, 3.4, mat('scout'), partId.scout, true);
    m.paintCapsule(0, 2.2, 4.8, 0, 7.2, 4.2, 2.0, 0.85, mat('bone'), partId.bone, true);

    // 标志特征 1：头顶三瓣鲜红高耸肉冠（俯视一抹鲜红极其醒目！）
    m.paintCapsule(0, -3.5, 7.8, 0, -4.8, 12.6, 1.45, 0.85, mat('crest'), partId.crest, true);
    m.paintCapsule(0, -1.0, 8.2, 0, -1.4, 13.8, 1.55, 0.90, mat('crest'), partId.crest, true);
    m.paintCapsule(0,  1.6, 7.8, 0,  2.2, 12.2, 1.35, 0.78, mat('crest'), partId.crest, true);

    // 标志特征 2：两侧一对超大放大亮金黄凸眼（突出脸颊外侧，×4 俯视清晰可见！）
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 4.2, 0.8, 6.8, 2.35, 2.45, 2.45, mat('eyeGold'), partId.eyeGold, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 大凸眼正中镶嵌 2×2 锐利黑瞳与洁白点睛（eyeSpot 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const ey = Math.round(hd + 2.4);
    const ez = 7;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 4.5);
      m.setRaw(ex,     ey,     ez,     keyToId.eyeDark, partId.eye);
      m.setRaw(ex,     ey + 1, ez,     keyToId.eyeDark, partId.eye);
      m.setRaw(ex,     ey,     ez + 1, keyToId.eyeSpot, partId.eye);
      m.setRaw(ex - s, ey + 1, ez + 1, keyToId.eyeDark, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 14, centerZ: 7 });
  }

  // =========================================================================
  // 7. ③ 喘气鼻囊头 headSac（2 档无损烘焙：deflate 收缩 / inflate 鼓胀）
  //    严禁常态 scaleX/scaleY 拉伸！头顶夸张鲜亮粉橙+浅青双鼻囊一鼓一缩喘气
  // =========================================================================
  const SAC_PIVOT = { x: 0, y: -6.2 };
  function buildHeadSac(makeCanvas, inflated) {
    const W = inflated ? 20 : 16;
    const D = 22;
    const H = inflated ? 17 : 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 饱满水青色头颅与圆钝水栖吻部
    m.paintEllipsoid(0, -2.0, 5.2, 4.6, 5.8, 4.0, mat('sacSkin'), partId.sacSkin, true);
    m.paintEllipsoid(0,  4.2, 4.6, 4.2, 4.2, 3.2, mat('sacSkin'), partId.sacSkin, true);

    // 标志特征：头顶一对夸张鲜亮粉橙双鼻囊 + 浅青气孔环（鼓/缩两档体积明显差异！）
    const sacOffX = inflated ? 4.4 : 3.2;
    const sacRx   = inflated ? 4.4 : 2.7;
    const sacRy   = inflated ? 4.8 : 3.2;
    const sacRz   = inflated ? 4.2 : 2.5;
    const sacZ    = inflated ? 10.6 : 8.6;
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * sacOffX, 2.2, sacZ, sacRx, sacRy, sacRz, mat('sacPink'), partId.sacPink, true);
      // 鼻囊顶端浅青喷气环口
      m.paintEllipsoid(s * (sacOffX + 0.3), 3.6, sacZ + sacRz * 0.72, sacRx * 0.56, sacRy * 0.52, 1.35, mat('sacAqua'), partId.sacAqua, true);
      m.paintEllipsoid(s * (sacOffX + 0.4), 4.0, sacZ + sacRz * 0.90, 1.0, 1.0, 0.85, keyToId.eyeDark, partId.sacAqua, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 鼻囊下方两侧清晰小眼（eyeSpot 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const ey = Math.round(hd - 0.4);
    const ez = 5;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 4.4);
      m.setRaw(ex, ey,     ez,     keyToId.eyeIris, partId.eye);
      m.setRaw(ex, ey + 1, ez,     keyToId.eyeDark, partId.eye);
      m.setRaw(ex, ey + 1, ez + 1, keyToId.eyeSpot, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: inflated ? 8.2 : 6.6, headZ: H - 1, centerZ: 7 });
  }

  // 背上 6 簇亮翠苔藓排布（避开三条颈链锚点）
  const MOSS_LAYOUT = [
    { lx: -11.0, ly:  -5.5, phase: 0.3 },
    { lx:  11.0, ly:  -5.5, phase: 1.5 },
    { lx:  -6.0, ly: -12.5, phase: 2.7 },
    { lx:   6.5, ly: -12.0, phase: 3.9 },
    { lx:  -1.0, ly:   9.8, phase: 4.8 },
    { lx:  14.2, ly:   1.5, phase: 5.6 }
  ];

  // 三条颈链的身体锚点与基准外展夹角（弧度，相对身体正前 +Y；正=左，负=右）
  const NECK_ANCHORS = {
    shovel: { lx: -11.5, ly: 11.5, zOff: 3.8, baseAngle:  0.62, segCount: 4, segLen: 3.5 },
    scout:  { lx:   0.0, ly: -2.0, zOff: 10.6, baseAngle: 0.00, segCount: 5, segLen: 1.9 },
    sac:    { lx:  11.5, ly: 10.5, zOff: 5.4, baseAngle: -0.62, segCount: 4, segLen: 3.6 }
  };

  // =========================================================================
  // 生物定义：泽4 · 三个头各干各的（注意 name 不重复写「泽4 · 」）
  // =========================================================================
  const Marsh4Def = {
    id: 'marsh4_tri_neck',
    code: '泽4',
    status: 'done',
    name: '三个头各干各的',
    tag: 'M32 多头标杆 · 铲子/放哨/鼻囊三头分工',
    summary: 'v3 精制（M32 标杆）：半沉宽扁泥苔身拆块护图集 + 三条独立物理颈链与各自状态机（左前亮赭骨白铲子头埋泥拱虫、背心极细高举金眼红冠放哨头 360° 巡天、右前粉橙浅青双鼻囊头鼓缩喘气喷水汽）+ 争虫互啄与示警齐缩颈协同小剧场',
    defaultHabitat: 'swamp',
    footRadius: 23.0,
    ecoWeight: 2.6,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol',   name: '半沉慢游',     loop: true,  status: 'done' },
      { id: 'idle',     name: '原地沉泥',     loop: true,  status: 'done' },
      { id: 'squabble', name: '双头争虫互啄', loop: false, duration: 5.0, status: 'done' },
      { id: 'alarm',    name: '示警齐缩颈',   loop: false, duration: 5.0, status: 'done' }
    ],
    blocks: [
      '半沉宽扁泥苔身拆块（34×34 主核 + 四向共享侧翼 + 6 簇亮翠苔）',
      '三条独立 ChainSolver 物理颈链（4/5/4 节，锚点夹角分叉防穿模）',
      '三头独立小状态机（埋泥拱虫 / 高举放哨鸣叫 / 鼓缩鼻囊喷水汽）',
      '双档鼓缩鼻囊无损切换（零常态拉伸）',
      '协同小剧场（争虫互啄弹开 + 示警三头齐缩颈）'
    ],
    soulHabit: '宽扁泥苔身像河马半沉在沼泽里极慢游弋：左前亮黄骨白铲子头一头扎泥拱虫翻泥花、背心极细金眼红冠头高高竖起 360° 巡天、右前粉橙双鼻囊头贴水一鼓一缩喷白汽 -> 每隔数秒触发「铲子头与鼻囊头争泥虫轻啄弹开」或「放哨头震环示警、三头齐刷刷缩颈潜泥再探出」',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const flankShared = buildBodyFlank(makeCanvas);
      const parts = {
        bodyCore:       buildBodyCore(makeCanvas),
        bodyFlankL:     flankShared,
        bodyFlankR:     flankShared,
        bodyFlankF:     flankShared,
        bodyFlankB:     flankShared,
        mossTuft:       buildMossTuft(makeCanvas),
        stubTail:       buildStubTail(makeCanvas),
        shovelNeck:     buildShovelNeckSeg(makeCanvas),
        scoutNeck:      buildScoutNeckSeg(makeCanvas),
        sacNeck:        buildSacNeckSeg(makeCanvas),
        headShovel:     buildHeadShovel(makeCanvas),
        headScout:      buildHeadScout(makeCanvas),
        headSacDeflate: buildHeadSac(makeCanvas, false),
        headSacInflate: buildHeadSac(makeCanvas, true)
      };

      const uniqueAssets = Array.from(new Set(Object.values(parts)));

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.25;
      const seed = opts.seed ?? 41;
      const cachePrefix = `marsh4_tri_neck_${Math.random().toString(36).slice(2, 7)}`;

      // 三条独立物理颈链（nodes[0] 为根，后续 segCount 节向外伸展）
      const shovelChain = new ChainSolver(NECK_ANCHORS.shovel.segCount + 1, NECK_ANCHORS.shovel.segLen, {
        maxAngle: 0.44,
        waveFreq: 3.4,
        wavePhaseStep: 0.55,
        waveAmp: 0.16
      });
      const scoutChain = new ChainSolver(NECK_ANCHORS.scout.segCount + 1, NECK_ANCHORS.scout.segLen, {
        maxAngle: 0.42,
        waveFreq: 1.8,
        wavePhaseStep: 0.48,
        waveAmp: 0.14
      });
      const sacChain = new ChainSolver(NECK_ANCHORS.sac.segCount + 1, NECK_ANCHORS.sac.segLen, {
        maxAngle: 0.40,
        waveFreq: 2.3,
        wavePhaseStep: 0.52,
        waveAmp: 0.14
      });

      // 独立弹性求解器
      const bodySinkSpring = new SpringDamper1D(0, 22, 6.2);
      const shovelYawSpring = new SpringDamper1D(0, 68, 7.2);
      const shovelLiftSpring = new SpringDamper1D(1.2, 64, 7.5);
      const scoutYawSpring = new SpringDamper1D(0, 32, 6.0);
      const scoutHeightSpring = new SpringDamper1D(29.0, 42, 6.6);
      const sacYawSpring = new SpringDamper1D(0, 52, 6.8);
      const sacLiftSpring = new SpringDamper1D(11.0, 56, 7.2);
      const sockets = new SocketTracker();

      const state = {
        x: hx0,
        y: hy0,
        z: 0.6,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        navX: hx0 + 12,
        navY: hy0 + 8,
        navSeq: 1,
        navPause: 0.8,
        lastAction: 'patrol',

        // ① 铲子头独立状态机：dig（埋泥左右拱虫）<-> scoop（抬头甩泥）
        shovelMode: 'dig',
        shovelTimer: 0,
        shovelDur: 5.2,
        shovelMudCd: 0,

        // ② 放哨头独立状态机：scan（高举 360° 慢扫）<-> alert（警觉定住鸣叫震环）
        scoutMode: 'scan',
        scoutTimer: 0,
        scoutDur: 6.4,
        scoutTargetYaw: 0.4,
        scoutCallFired: false,

        // ③ 鼻囊头独立状态机：inhale（鼓囊吸气）<-> exhale（缩囊喷细白水汽）
        sacMode: 'inhale',
        sacTimer: 0,
        sacDur: 1.65,
        sacInflated: true,
        sacSteamCd: 0,

        // 协同小剧场：none | squabble | alarm
        theater: 'none',
        theaterTimer: 0,
        theaterCooldown: 8.5,
        theaterNext: 'squabble',
        theaterPeckCount: 0,
        theaterAlarmFired: false,

        // 实时解算出的三头世界坐标（用于防穿模校正与粒子生成）
        headPos: {
          shovel: { x: hx0, y: hy0, z: 1.5, yaw: hyaw0 },
          scout:  { x: hx0, y: hy0, z: 29.0, yaw: hyaw0 },
          sac:    { x: hx0, y: hy0, z: 11.0, yaw: hyaw0 }
        },
        wakeCd: 0,
        wetDecalCd: 0,
        bubbleCd: 0
      };

      let curSkin = SKINS[0];

      function resetChains(cx, cy, cz, cyaw, sMul) {
        const a1 = NECK_ANCHORS.shovel;
        const [r1x, r1y] = localToWorldXY(cx, cy, cyaw, a1.lx * sMul, a1.ly * sMul);
        shovelChain.reset(r1x, r1y, cz + a1.zOff * sMul, wrapAngle(cyaw + a1.baseAngle + Math.PI));

        const a2 = NECK_ANCHORS.scout;
        const [r2x, r2y] = localToWorldXY(cx, cy, cyaw, a2.lx * sMul, a2.ly * sMul);
        scoutChain.reset(r2x, r2y, cz + a2.zOff * sMul, wrapAngle(cyaw + a2.baseAngle + Math.PI));
        for (let i = 0; i < scoutChain.nodes.length; i++) {
          const u = i / Math.max(1, scoutChain.nodes.length - 1);
          scoutChain.nodes[i].z = cz + lerp(a2.zOff, 29.0, u) * sMul;
        }

        const a3 = NECK_ANCHORS.sac;
        const [r3x, r3y] = localToWorldXY(cx, cy, cyaw, a3.lx * sMul, a3.ly * sMul);
        sacChain.reset(r3x, r3y, cz + a3.zOff * sMul, wrapAngle(cyaw + a3.baseAngle + Math.PI));
      }

      function emitScoutCall(vfx, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const hp = state.headPos.scout;
        vfx.addRipple(hp.x, hp.y, 3.0 * sMul, 26.0 * sMul, 0.95, 2.0);
        vfx.addRipple(hp.x, hp.y, 1.5 * sMul, 16.0 * sMul, 0.65, 1.4);
        for (let k = 0; k < 6; k++) {
          const ang = (k / 6) * TAU + Math.random() * 0.4;
          vfx.spawnParticle(
            hp.x + Math.cos(ang) * 2.2 * sMul,
            hp.y + Math.sin(ang) * 2.2 * sMul,
            hp.z + 5.0 * sMul,
            Math.cos(ang) * 11.0 * sMul,
            Math.sin(ang) * 11.0 * sMul,
            (6.0 + Math.random() * 4.0) * sMul,
            0.48, 1.25, fx.alert, false, 8
          );
        }
      }

      const instance = {
        def: Marsh4Def,
        cachePrefix,
        parts,
        partListAssets: uniqueAssets,
        state,
        sockets,
        footContacts: [],
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
          state.z = 0.6;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw ?? 0.25;
          state.navX = homeX + 12;
          state.navY = homeY + 8;
          state.navSeq = 1;
          state.navPause = 0.8;
          state.lastAction = 'patrol';

          state.shovelMode = 'dig';
          state.shovelTimer = 0;
          state.shovelDur = 5.2;
          state.shovelMudCd = 0;

          state.scoutMode = 'scan';
          state.scoutTimer = 0;
          state.scoutDur = 6.4;
          state.scoutTargetYaw = 0.4;
          state.scoutCallFired = false;

          state.sacMode = 'inhale';
          state.sacTimer = 0;
          state.sacDur = 1.65;
          state.sacInflated = true;
          state.sacSteamCd = 0;

          state.theater = 'none';
          state.theaterTimer = 0;
          state.theaterCooldown = 8.5;
          state.theaterNext = 'squabble';
          state.theaterPeckCount = 0;
          state.theaterAlarmFired = false;

          bodySinkSpring.x = bodySinkSpring.v = 0;
          shovelYawSpring.x = shovelYawSpring.v = 0;
          shovelLiftSpring.x = 1.2; shovelLiftSpring.v = 0;
          scoutYawSpring.x = scoutYawSpring.v = 0;
          scoutHeightSpring.x = 29.0; scoutHeightSpring.v = 0;
          sacYawSpring.x = sacYawSpring.v = 0;
          sacLiftSpring.x = 11.0; sacLiftSpring.v = 0;

          resetChains(homeX, homeY, state.z, state.yaw, instance.scaleMul);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const isWater = !!(habitat && habitat.isWater);
          const fxCol = curSkin.fx || SKINS[0].fx;

          const action = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const isIdle = action === 'idle';
          const isSquabbleAction = action === 'squabble';
          const isAlarmAction = action === 'alarm';
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const homeYaw = (eco && eco.homeYaw) ?? 0.25;
          const maxR = (eco && eco.maxRadius) || 48;
          // 巡游严格钳制在 maxRadius * 0.76 内
          const patrolLimitR = maxR * 0.76;

          // -----------------------------------------------------------------
          // 1. 协同小剧场调度（动作按钮强制触发；patrol/idle 下每隔数秒交替触发）
          // -----------------------------------------------------------------
          if (isSquabbleAction && state.lastAction !== 'squabble') {
            state.theater = 'squabble';
            state.theaterTimer = 0;
            state.theaterPeckCount = 0;
            state.theaterAlarmFired = false;
          } else if (isAlarmAction && state.lastAction !== 'alarm') {
            state.theater = 'alarm';
            state.theaterTimer = 0;
            state.theaterAlarmFired = false;
          }
          state.lastAction = action;

          if (state.theater === 'none' && !isSquabbleAction && !isAlarmAction) {
            state.theaterCooldown -= dt * clamp(0.75 + spdMul * 0.25, 0.5, 1.6);
            if (state.theaterCooldown <= 0) {
              state.theater = state.theaterNext;
              state.theaterNext = state.theaterNext === 'squabble' ? 'alarm' : 'squabble';
              state.theaterTimer = 0;
              state.theaterPeckCount = 0;
              state.theaterAlarmFired = false;
              state.theaterCooldown = 10.5;
            }
          }

          if (state.theater !== 'none') {
            state.theaterTimer += dt;
            if (state.theater === 'squabble' && state.theaterTimer >= 4.8) {
              state.theater = 'none';
              state.theaterTimer = 0;
            } else if (state.theater === 'alarm' && state.theaterTimer >= 4.8) {
              state.theater = 'none';
              state.theaterTimer = 0;
            }
          }

          // -----------------------------------------------------------------
          // 2. 宽扁河马泥身极慢沉重半沉游弋（patrol 慢游 / idle 原地沉泥）
          // -----------------------------------------------------------------
          const prevX = state.x, prevY = state.y;
          const canMove = !isIdle && !isSquabbleAction && !isAlarmAction && state.theater === 'none';

          if (canMove) {
            if (state.navPause > 0) {
              state.navPause -= dt;
              const kStop = expSmooth(dt, 4.2);
              state.vx = lerp(state.vx, 0, kStop);
              state.vy = lerp(state.vy, 0, kStop);
              state.x += state.vx * dt;
              state.y += state.vy * dt;
            } else {
              const ndx = state.navX - state.x;
              const ndy = state.navY - state.y;
              const nd = Math.hypot(ndx, ndy);
              if (nd < 6.0) {
                state.navSeq++;
                const r1 = hash2i(state.navSeq, seed, 107);
                const r2 = hash2i(state.navSeq, seed, 223);
                const r3 = hash2i(state.navSeq, seed, 347);
                state.navPause = lerp(1.6, 2.8, r3);
                const curA = Math.atan2(state.y - homeY, state.x - homeX);
                const nextA = curA + (r1 > 0.5 ? 1 : -1) * lerp(1.15, 2.25, r2);
                const nextR = lerp(patrolLimitR * 0.30, patrolLimitR * 0.86, hash2i(state.navSeq, seed, 457));
                state.navX = homeX + Math.cos(nextA) * nextR;
                state.navY = homeY + Math.sin(nextA) * nextR;
              } else {
                const aimX = state.navX + (eco && eco.avoidX ? eco.avoidX * 0.30 : 0);
                const aimY = state.navY + (eco && eco.avoidY ? eco.avoidY * 0.30 : 0);
                const desiredYaw = Math.atan2(-(aimX - state.x), aimY - state.y);
                const yawDiff = wrapAngle(desiredYaw - state.yaw);
                const maxTurn = 0.58 * (0.7 + spdMul * 0.35);
                state.yaw = wrapAngle(state.yaw + clamp(yawDiff, -maxTurn * dt, maxTurn * dt));

                const align = lerp(0.24, 1.0, smoothstep(-0.3, 0.85, Math.cos(yawDiff)));
                const targetSpd = 4.4 * spdMul * align;
                const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
                const kV = expSmooth(dt, 2.8);
                state.vx = lerp(state.vx, fwdX * targetSpd, kV);
                state.vy = lerp(state.vy, fwdY * targetSpd, kV);
                state.x += state.vx * dt;
                state.y += state.vy * dt;
              }
            }
          } else {
            const kStop = expSmooth(dt, 5.0);
            state.vx = lerp(state.vx, 0, kStop);
            state.vy = lerp(state.vy, 0, kStop);
            state.x += state.vx * dt;
            state.y += state.vy * dt;
            if (isIdle && state.theater === 'none') {
              const idleYaw = homeYaw + Math.sin(time * 0.22) * 0.08;
              state.yaw = wrapAngle(state.yaw + wrapAngle(idleYaw - state.yaw) * expSmooth(dt, 1.4));
            }
          }

          // 严格边界钳制 <= maxRadius * 0.76
          const dCenter = Math.hypot(state.x, state.y);
          if (dCenter > patrolLimitR && dCenter > 0.001) {
            state.x *= patrolLimitR / dCenter;
            state.y *= patrolLimitR / dCenter;
          }
          state.vx = (state.x - prevX) / Math.max(dt, 0.001);
          state.vy = (state.y - prevY) / Math.max(dt, 0.001);

          // 半沉泥身垂直呼吸微浮 + 示警下潜
          const alarmDuck = (state.theater === 'alarm' && state.theaterTimer >= 1.1 && state.theaterTimer < 3.4);
          const sinkTgt = alarmDuck ? -2.4 : 0.0;
          const sinkCur = bodySinkSpring.update(dt, sinkTgt, 24 * sp, clamp(6.4 * dScale, 3.6, 10.5));
          const bodyBreath = Math.sin(time * 1.1 * gFreq) * 0.38;
          state.z = Math.max(-1.6 * sMul, (0.7 + bodyBreath + sinkCur) * sMul);

          // 泥潭水泡涟漪 + 湿痕尾迹
          const moveSpd = Math.hypot(state.vx, state.vy);
          if (vfx) {
            state.bubbleCd -= dt;
            if (state.bubbleCd <= 0) {
              state.bubbleCd = 1.35;
              const ba = Math.random() * TAU;
              const br = (14.0 + Math.random() * 8.0) * sMul;
              vfx.addRipple(state.x + Math.cos(ba) * br, state.y + Math.sin(ba) * br, 1.5 * sMul, 11.5 * sMul, 0.85, 1.3);
            }
            if (moveSpd > 1.2) {
              state.wakeCd -= dt;
              if (state.wakeCd <= 0 && isWater) {
                state.wakeCd = 0.72;
                const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, 0, -18.5 * sMul);
                EnvFeedback.emitWaterWake(vfx, habitat, wx, wy, state.yaw, 15.0 * sMul, 0.62);
              }
              state.wetDecalCd -= dt;
              if (state.wetDecalCd <= 0) {
                state.wetDecalCd = 0.65;
                vfx.addDecal({
                  kind: 'wet',
                  x: state.x,
                  y: state.y,
                  yaw: state.yaw,
                  rx: 13.5 * sMul,
                  ry: 10.5 * sMul,
                  life: 6.5,
                  alpha: 0.62,
                  color: '#252e23',
                  darkColor: '#192118'
                });
              }
            }
          }

          // -----------------------------------------------------------------
          // 3. 三个头独立小状态机 + 协同小剧场叠加
          // -----------------------------------------------------------------
          // ① 铲子头状态机（左前）
          state.shovelTimer += dt * gFreq;
          if (state.shovelTimer >= state.shovelDur) {
            state.shovelTimer = 0;
            if (state.shovelMode === 'dig') {
              state.shovelMode = 'scoop';
              state.shovelDur = 1.65;
            } else {
              state.shovelMode = 'dig';
              state.shovelDur = 5.0;
            }
          }

          // ② 放哨头状态机（背心高举）
          state.scoutTimer += dt * gFreq;
          if (state.scoutTimer >= state.scoutDur) {
            state.scoutTimer = 0;
            if (state.scoutMode === 'scan') {
              state.scoutMode = 'alert';
              state.scoutDur = 2.2;
              state.scoutCallFired = false;
            } else {
              state.scoutMode = 'scan';
              state.scoutDur = 6.2;
            }
          }

          // ③ 鼻囊头状态机（右前喘气）
          state.sacTimer += dt * gFreq;
          if (state.sacTimer >= state.sacDur) {
            state.sacTimer = 0;
            if (state.sacMode === 'inhale') {
              state.sacMode = 'exhale';
              state.sacDur = 1.45;
              state.sacInflated = false;
            } else {
              state.sacMode = 'inhale';
              state.sacDur = 1.65;
              state.sacInflated = true;
            }
          }

          // 默认各头目标姿态
          let shovelOutAng = NECK_ANCHORS.shovel.baseAngle;
          let shovelHeadYawTgt = 0;
          let shovelZTarget = 1.1;
          let shovelSegLenMul = 1.0;

          let scoutOutAng = NECK_ANCHORS.scout.baseAngle + Math.sin(time * 0.45) * 0.35;
          let scoutHeadYawTgt = Math.sin(time * 0.68) * 2.55; // 360° 大幅环视天空
          let scoutZTarget = 28.5 + Math.sin(time * 1.4) * 1.2;
          let scoutSegLenMul = 1.0;

          let sacOutAng = NECK_ANCHORS.sac.baseAngle;
          let sacHeadYawTgt = Math.sin(time * 0.72 + 1.3) * 0.28;
          let sacZTarget = state.sacInflated ? 11.4 : 10.2;
          let sacSegLenMul = 1.0;

          // 按各自独立状态机调整姿态与粒子
          if (state.theater === 'none') {
            if (state.shovelMode === 'dig') {
              const rootWave = Math.sin(time * 5.2 * gFreq);
              shovelOutAng = NECK_ANCHORS.shovel.baseAngle + rootWave * 0.24 * flex;
              shovelHeadYawTgt = rootWave * 0.38 * flex;
              shovelZTarget = 0.7 + Math.abs(Math.cos(time * 5.2 * gFreq)) * 0.8;
            } else {
              // 抬头甩泥
              const u = clamp(state.shovelTimer / state.shovelDur, 0, 1);
              shovelOutAng = NECK_ANCHORS.shovel.baseAngle + 0.08;
              shovelHeadYawTgt = Math.sin(u * Math.PI * 5.0) * 0.52 * (1 - u * 0.3);
              shovelZTarget = lerp(1.5, 8.6, Math.sin(u * Math.PI));
            }

            if (state.scoutMode === 'alert') {
              // 警觉定住并昂头鸣叫（震出环纹）
              const u = clamp(state.scoutTimer / state.scoutDur, 0, 1);
              scoutHeadYawTgt = state.scoutTargetYaw;
              scoutZTarget = 32.8 + Math.sin(u * Math.PI) * 1.4;
              if (!state.scoutCallFired && u > 0.22) {
                state.scoutCallFired = true;
                emitScoutCall(vfx, sMul);
              }
            } else {
              state.scoutTargetYaw = scoutHeadYawTgt;
            }
          } else if (state.theater === 'squabble') {
            // 协同小剧场 A：铲子头与鼻囊头抢正前泥虫撞在一起轻啄弹开，放哨头受惊鸣叫
            const tt = state.theaterTimer;
            if (tt < 1.15) {
              // 1) 双头向正前泥虫点凑近
              const u = smoothstep(0, 1.15, tt);
              shovelOutAng = lerp(NECK_ANCHORS.shovel.baseAngle, -0.22, u);
              sacOutAng = lerp(NECK_ANCHORS.sac.baseAngle, 0.22, u);
              shovelZTarget = lerp(1.4, 5.8, u);
              sacZTarget = lerp(10.6, 6.4, u);
              shovelHeadYawTgt = -0.35 * u;
              sacHeadYawTgt = 0.35 * u;
              scoutZTarget = lerp(29.0, 31.5, u);
              scoutHeadYawTgt = 0; // 低头盯住前方俩家伙
            } else if (tt < 3.15) {
              // 2) 轻撞互啄 3 下 + 放哨头受惊鸣叫
              const peckPhase = (tt - 1.15) * 4.8;
              const jab = Math.sin(peckPhase * Math.PI);
              shovelOutAng = -0.20 + jab * 0.14;
              sacOutAng = 0.20 - jab * 0.14;
              shovelHeadYawTgt = -0.45 + jab * 0.28;
              sacHeadYawTgt = 0.45 - jab * 0.28;
              shovelZTarget = 5.6 + Math.abs(jab) * 1.8;
              sacZTarget = 6.2 + Math.abs(jab) * 1.8;
              state.sacInflated = jab > 0;

              // 放哨头受惊拔高鸣叫
              scoutZTarget = 33.4 + Math.sin(tt * 14.0) * 0.7;
              scoutHeadYawTgt = Math.sin(tt * 12.0) * 0.22;
              if (!state.theaterAlarmFired && tt >= 1.45) {
                state.theaterAlarmFired = true;
                emitScoutCall(vfx, sMul);
              }

              // 每次碰撞飞溅泥花与水纹
              const pIdx = Math.floor((tt - 1.15) / 0.62);
              if (pIdx > state.theaterPeckCount && vfx) {
                state.theaterPeckCount = pIdx;
                const mx = (state.headPos.shovel.x + state.headPos.sac.x) * 0.5;
                const my = (state.headPos.shovel.y + state.headPos.sac.y) * 0.5;
                vfx.addRipple(mx, my, 2.0 * sMul, 15.0 * sMul, 0.65, 1.8);
                for (let k = 0; k < 7; k++) {
                  const a = Math.random() * TAU;
                  vfx.spawnParticle(
                    mx, my, 5.5 * sMul,
                    Math.cos(a) * (8 + Math.random() * 8) * sMul,
                    Math.sin(a) * (8 + Math.random() * 8) * sMul,
                    (7 + Math.random() * 7) * sMul,
                    0.46, 1.35, k % 2 === 0 ? fxCol.mud : fxCol.spray, false, 30
                  );
                }
              }
            } else {
              // 3) 互相弹开回到各自扇区
              const u = smoothstep(3.15, 4.8, tt);
              shovelOutAng = lerp(-0.10, NECK_ANCHORS.shovel.baseAngle + 0.14, u);
              sacOutAng = lerp(0.10, NECK_ANCHORS.sac.baseAngle - 0.14, u);
              shovelZTarget = lerp(6.5, 1.4, u);
              sacZTarget = lerp(7.0, 11.2, u);
              shovelHeadYawTgt = Math.sin(u * Math.PI * 3.0) * 0.35 * (1 - u);
              sacHeadYawTgt = -Math.sin(u * Math.PI * 3.0) * 0.35 * (1 - u);
              scoutZTarget = lerp(33.2, 29.0, u);
            }
          } else if (state.theater === 'alarm') {
            // 协同小剧场 B：放哨头示警 -> 三头齐刷刷缩颈潜低片刻 -> 依次探出
            const tt = state.theaterTimer;
            if (tt < 1.1) {
              // 1) 放哨头拉满高度定住鸣叫示警
              scoutZTarget = 33.8;
              scoutHeadYawTgt = 0.25;
              if (!state.theaterAlarmFired && tt >= 0.25) {
                state.theaterAlarmFired = true;
                emitScoutCall(vfx, sMul);
              }
            } else if (tt < 3.4) {
              // 2) 三头齐刷刷缩颈潜低贴近泥面
              const u = smoothstep(1.1, 1.65, tt);
              shovelSegLenMul = lerp(1.0, 0.58, u);
              scoutSegLenMul = lerp(1.0, 0.55, u);
              sacSegLenMul = lerp(1.0, 0.60, u);
              shovelZTarget = lerp(1.5, 0.6, u);
              scoutZTarget = lerp(33.5, 13.8, u);
              sacZTarget = lerp(10.8, 3.8, u);
              state.sacInflated = false;
              if (tt < 1.35 && vfx && Math.random() < 0.35) {
                vfx.addRipple(state.x, state.y, 14.0 * sMul, 30.0 * sMul, 0.85, 1.8);
              }
            } else {
              // 3) 放哨头先谨慎探出，随后铲子头与鼻囊头复工
              const uScout = smoothstep(3.4, 4.3, tt);
              const uOther = smoothstep(3.8, 4.8, tt);
              scoutSegLenMul = lerp(0.55, 1.0, uScout);
              shovelSegLenMul = lerp(0.58, 1.0, uOther);
              sacSegLenMul = lerp(0.60, 1.0, uOther);
              scoutZTarget = lerp(13.8, 29.2, uScout);
              shovelZTarget = lerp(0.6, 1.4, uOther);
              sacZTarget = lerp(3.8, 11.2, uOther);
              scoutHeadYawTgt = Math.sin((tt - 3.4) * 5.0) * 1.4 * uScout;
              state.sacInflated = uOther > 0.5;
            }
          }

          // 弹簧平滑输出
          const shYawRel = shovelYawSpring.update(dt, shovelHeadYawTgt, 64 * sp, clamp(7.2 * dScale, 3.6, 11.5));
          const shZNow = shovelLiftSpring.update(dt, shovelZTarget, 58 * sp, clamp(7.4 * dScale, 3.6, 11.5));
          const scYawRel = scoutYawSpring.update(dt, scoutHeadYawTgt, 30 * sp, clamp(6.0 * dScale, 3.2, 10.5));
          const scZNow = scoutHeightSpring.update(dt, scoutZTarget, 40 * sp, clamp(6.5 * dScale, 3.4, 10.8));
          const saYawRel = sacYawSpring.update(dt, sacHeadYawTgt, 50 * sp, clamp(6.8 * dScale, 3.4, 11.0));
          const saZNow = sacLiftSpring.update(dt, sacZTarget, 52 * sp, clamp(7.0 * dScale, 3.5, 11.2));

          // -----------------------------------------------------------------
          // 4. 更新三条独立物理颈链（以 rootYaw + PI 驱动 ChainSolver 沿外展方向自然拖拽）
          // -----------------------------------------------------------------
          const a1 = NECK_ANCHORS.shovel;
          const [r1x, r1y] = localToWorldXY(state.x, state.y, state.yaw, a1.lx * sMul, a1.ly * sMul);
          const r1z = Math.max(1.2 * sMul, state.z + a1.zOff * sMul);
          shovelChain.update(dt, r1x, r1y, r1z, wrapAngle(state.yaw + shovelOutAng + Math.PI), time, {
            segLen: a1.segLen * shovelSegLenMul * sMul,
            flexibility: flex,
            restAlign: 0.22,
            waveFreq: 4.2 * gFreq,
            waveAmp: 0.14 * flex,
            zTargetFn: (u) => Math.max(0.5 * sMul, lerp(r1z, shZNow * sMul, Math.pow(u, 0.82)))
          });

          const a2 = NECK_ANCHORS.scout;
          const [r2x, r2y] = localToWorldXY(state.x, state.y, state.yaw, a2.lx * sMul, a2.ly * sMul);
          const r2z = Math.max(4.0 * sMul, state.z + a2.zOff * sMul);
          scoutChain.update(dt, r2x, r2y, r2z, wrapAngle(state.yaw + scoutOutAng + Math.PI), time, {
            segLen: a2.segLen * scoutSegLenMul * sMul,
            flexibility: flex,
            restAlign: 0.24,
            waveFreq: 1.9 * gFreq,
            waveAmp: 0.12 * flex,
            phaseOffset: 1.7,
            zTargetFn: (u) => Math.max(r2z, lerp(r2z, scZNow * sMul, Math.pow(u, 0.92)))
          });

          const a3 = NECK_ANCHORS.sac;
          const [r3x, r3y] = localToWorldXY(state.x, state.y, state.yaw, a3.lx * sMul, a3.ly * sMul);
          const r3z = Math.max(1.8 * sMul, state.z + a3.zOff * sMul);
          sacChain.update(dt, r3x, r3y, r3z, wrapAngle(state.yaw + sacOutAng + Math.PI), time, {
            segLen: a3.segLen * sacSegLenMul * sMul,
            flexibility: flex,
            restAlign: 0.22,
            waveFreq: 2.4 * gFreq,
            waveAmp: 0.12 * flex,
            phaseOffset: 3.1,
            zTargetFn: (u) => Math.max(1.2 * sMul, lerp(r3z, saZNow * sMul, Math.pow(u, 0.85)))
          });

          // 计算三个头的世界位置与朝向（枢轴锁死防脱节 + 双前头最小净空防穿模）
          const n1End = shovelChain.nodes[shovelChain.nodes.length - 1];
          const n1OutYaw = wrapAngle(n1End.yaw + Math.PI);
          const h1Yaw = wrapAngle(n1OutYaw + shYawRel);
          let [h1x, h1y] = pivotToWorldXY(n1End.x, n1End.y, h1Yaw, SHOVEL_PIVOT.x * sMul, SHOVEL_PIVOT.y * sMul);

          const n2End = scoutChain.nodes[scoutChain.nodes.length - 1];
          const h2Yaw = wrapAngle(state.yaw + scYawRel);
          const [h2x, h2y] = pivotToWorldXY(n2End.x, n2End.y, h2Yaw, SCOUT_PIVOT.x * sMul, SCOUT_PIVOT.y * sMul);

          const n3End = sacChain.nodes[sacChain.nodes.length - 1];
          const n3OutYaw = wrapAngle(n3End.yaw + Math.PI);
          const h3Yaw = wrapAngle(n3OutYaw + saYawRel);
          let [h3x, h3y] = pivotToWorldXY(n3End.x, n3End.y, h3Yaw, SAC_PIVOT.x * sMul, SAC_PIVOT.y * sMul);

          // 几何净空守护：铲子头与鼻囊头中心距恒 >= 11.0 格（互啄时刚好碰嘴不穿模）
          const hdx = h3x - h1x;
          const hdy = h3y - h1y;
          const hDist = Math.hypot(hdx, hdy);
          const minHeadDist = 11.0 * sMul;
          if (hDist < minHeadDist && hDist > 0.001) {
            const push = (minHeadDist - hDist) * 0.5;
            const nx = hdx / hDist, ny = hdy / hDist;
            h1x -= nx * push; h1y -= ny * push;
            h3x += nx * push; h3y += ny * push;
          }

          state.headPos.shovel = { x: h1x, y: h1y, z: Math.max(0.5 * sMul, n1End.z), yaw: h1Yaw };
          state.headPos.scout  = { x: h2x, y: h2y, z: Math.max(6.0 * sMul, n2End.z), yaw: h2Yaw };
          state.headPos.sac    = { x: h3x, y: h3y, z: Math.max(1.5 * sMul, n3End.z), yaw: h3Yaw };

          sockets.setWorld('headShovel', h1x, h1y, state.headPos.shovel.z, h1Yaw);
          sockets.setWorld('headScout',  h2x, h2y, state.headPos.scout.z,  h2Yaw);
          sockets.setWorld('headSac',    h3x, h3y, state.headPos.sac.z,    h3Yaw);

          // -----------------------------------------------------------------
          // 5. 各头专属粒子反馈（拱泥翻泥花 / 鼻囊喷细白水汽）
          // -----------------------------------------------------------------
          if (vfx) {
            // ① 铲子头埋泥翻起泥花与泥潭涟漪
            if (state.theater === 'none' && state.shovelMode === 'dig') {
              state.shovelMudCd -= dt;
              if (state.shovelMudCd <= 0) {
                state.shovelMudCd = 0.24;
                const [tipX, tipY] = localToWorldXY(h1x, h1y, h1Yaw, 0, 8.8 * sMul);
                vfx.addRipple(tipX, tipY, 1.2 * sMul, 9.5 * sMul, 0.58, 1.3);
                for (let k = 0; k < 3; k++) {
                  const a = Math.random() * TAU;
                  vfx.spawnParticle(
                    tipX + (Math.random() - 0.5) * 3.0 * sMul,
                    tipY + (Math.random() - 0.5) * 3.0 * sMul,
                    1.6 * sMul,
                    Math.cos(a) * (6 + Math.random() * 6) * sMul,
                    Math.sin(a) * (6 + Math.random() * 6) * sMul,
                    (6 + Math.random() * 6) * sMul,
                    0.46, 1.35, k === 0 ? fxCol.spray : fxCol.mud, false, 32
                  );
                }
              }
            }

            // ③ 鼻囊头缩囊呼气时喷出细白水汽粒子
            if (state.theater !== 'alarm' && !state.sacInflated) {
              state.sacSteamCd -= dt;
              if (state.sacSteamCd <= 0) {
                state.sacSteamCd = 0.14;
                for (const side of [-1, 1]) {
                  const [vx0, vy0] = localToWorldXY(h3x, h3y, h3Yaw, side * 3.4 * sMul, 3.6 * sMul);
                  const [fxv, fyv] = localToWorldXY(0, 0, h3Yaw, side * 2.2 * sMul, 5.0 * sMul);
                  vfx.spawnParticle(
                    vx0, vy0, state.headPos.sac.z + 9.2 * sMul,
                    fxv + (Math.random() - 0.5) * 2.2 * sMul,
                    fyv + (Math.random() - 0.5) * 2.2 * sMul,
                    (8.0 + Math.random() * 4.5) * sMul,
                    0.52, 1.15, fxCol.steam, false, -4
                  );
                }
              }
            }
          }
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? habitat.waterLevel : 2.6;
          const yw = state.yaw;
          const bz = state.z;

          // 1. 短墩河马尾（半沉浸水）
          const [tx, ty] = localToWorldXY(state.x, state.y, yw, 0, -21.0 * sMul);
          list.push({
            partKey: 'stubTail',
            asset: parts.stubTail,
            x: tx, y: ty,
            lift: Math.max(0.3, bz + 1.0 * sMul),
            ro: wrapAngle(yw + Math.sin(state.shovelTimer * 1.4) * 0.18),
            bias: -0.95,
            submerge: EnvFeedback.calcSubmerge(bz + 1.2 * sMul, waterLvl, 4.4, isWater) * 0.75
          });

          // 2. 半沉宽扁泥苔身拆块（4 块共享侧翼深嵌主核 + 双轴对称主核）
          const flankSub = EnvFeedback.calcSubmerge(bz + 1.4 * sMul, waterLvl, 4.6, isWater) * 0.68;
          const [flx, fly] = localToWorldXY(state.x, state.y, yw, -14.2 * sMul, 0);
          const [frx, fry] = localToWorldXY(state.x, state.y, yw,  14.2 * sMul, 0);
          const [ffx, ffy] = localToWorldXY(state.x, state.y, yw, 0,  13.8 * sMul);
          const [fbx, fby] = localToWorldXY(state.x, state.y, yw, 0, -13.8 * sMul);

          list.push({
            partKey: 'bodyFlankL', asset: parts.bodyFlankL,
            x: flx, y: fly, lift: Math.max(0.2, bz + 0.6 * sMul),
            ro: wrapAngle(yw + Math.PI * 0.5), bias: -0.35, submerge: flankSub
          });
          list.push({
            partKey: 'bodyFlankR', asset: parts.bodyFlankR,
            x: frx, y: fry, lift: Math.max(0.2, bz + 0.6 * sMul),
            ro: wrapAngle(yw - Math.PI * 0.5), bias: -0.35, submerge: flankSub
          });
          list.push({
            partKey: 'bodyFlankB', asset: parts.bodyFlankB,
            x: fbx, y: fby, lift: Math.max(0.2, bz + 0.6 * sMul),
            ro: wrapAngle(yw + Math.PI), bias: -0.30, submerge: flankSub
          });
          list.push({
            partKey: 'bodyFlankF', asset: parts.bodyFlankF,
            x: ffx, y: ffy, lift: Math.max(0.2, bz + 0.8 * sMul),
            ro: yw, bias: -0.22, submerge: flankSub
          });
          list.push({
            partKey: 'bodyCore', asset: parts.bodyCore,
            x: state.x, y: state.y, lift: Math.max(0.4, bz + 1.2 * sMul),
            ro: yw, symDeg: 180, bias: 0.15,
            submerge: EnvFeedback.calcSubmerge(bz + 2.2 * sMul, waterLvl, 4.8, isWater) * 0.32
          });

          // 3. 背上 6 簇亮翠绿苔藓（symDeg=90 极省图集，微正 bias 稳贴背脊）
          for (let i = 0; i < MOSS_LAYOUT.length; i++) {
            const mp = MOSS_LAYOUT[i];
            const [mx, my] = localToWorldXY(state.x, state.y, yw, mp.lx * sMul, mp.ly * sMul);
            const mz = Math.max(1.2, bz + (evalBodyTopZ(mp.lx, mp.ly) - 0.9) * sMul);
            list.push({
              partKey: 'mossTuft',
              asset: parts.mossTuft,
              x: mx, y: my,
              lift: mz,
              ro: wrapAngle(yw + mp.phase),
              symDeg: 90,
              bias: 0.55,
              submerge: 0
            });
          }

          // 4. ① 左前粗短颈（4 节共享）+ 埋泥亮赭骨白铲子头
          for (let i = 1; i < shovelChain.nodes.length; i++) {
            const nd = shovelChain.nodes[i];
            list.push({
              partKey: 'shovelNeck',
              asset: parts.shovelNeck,
              x: nd.x, y: nd.y,
              lift: Math.max(0.4, nd.z),
              ro: wrapAngle(nd.yaw + Math.PI),
              symDeg: 90,
              bias: 0.25 + i * 0.06,
              submerge: EnvFeedback.calcSubmerge(nd.z + 0.6 * sMul, waterLvl, 4.2, isWater) * 0.58
            });
          }
          const hp1 = state.headPos.shovel;
          list.push({
            partKey: 'headShovel',
            asset: parts.headShovel,
            x: hp1.x, y: hp1.y,
            lift: Math.max(0.3, hp1.z),
            ro: hp1.yaw,
            bias: 0.72,
            submerge: EnvFeedback.calcSubmerge(hp1.z + 0.4 * sMul, waterLvl, 3.8, isWater) * 0.48
          });

          // 5. ③ 右前中等粗颈（4 节共享）+ 喘气双鼻囊头（2 档鼓/缩无损切换，严禁常态拉伸）
          for (let i = 1; i < sacChain.nodes.length; i++) {
            const nd = sacChain.nodes[i];
            list.push({
              partKey: 'sacNeck',
              asset: parts.sacNeck,
              x: nd.x, y: nd.y,
              lift: Math.max(1.0, nd.z),
              ro: wrapAngle(nd.yaw + Math.PI),
              symDeg: 90,
              bias: 0.30 + i * 0.06,
              submerge: EnvFeedback.calcSubmerge(nd.z + 1.0 * sMul, waterLvl, 4.2, isWater) * 0.40
            });
          }
          const hp3 = state.headPos.sac;
          const sacKey = state.sacInflated ? 'headSacInflate' : 'headSacDeflate';
          list.push({
            partKey: sacKey,
            asset: parts[sacKey],
            x: hp3.x, y: hp3.y,
            lift: Math.max(1.4, hp3.z),
            ro: hp3.yaw,
            bias: 0.85,
            submerge: 0
          });

          // 6. ② 背心极细长颈（5 节共享）+ 高举亮金眼鲜红肉冠放哨头（z≈26~34）
          for (let i = 1; i < scoutChain.nodes.length; i++) {
            const nd = scoutChain.nodes[i];
            list.push({
              partKey: 'scoutNeck',
              asset: parts.scoutNeck,
              x: nd.x, y: nd.y,
              lift: Math.max(2.0, nd.z),
              ro: wrapAngle(nd.yaw + Math.PI),
              bias: 0.90 + i * 0.14,
              submerge: 0
            });
          }
          const hp2 = state.headPos.scout;
          list.push({
            partKey: 'headScout',
            asset: parts.headScout,
            x: hp2.x, y: hp2.y,
            lift: Math.max(4.0, hp2.z),
            ro: hp2.yaw,
            bias: 2.10,
            submerge: 0
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Marsh4Def.id,
            code: Marsh4Def.code,
            status: Marsh4Def.status,
            name: Marsh4Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            shovelMode: state.shovelMode,
            scoutMode: state.scoutMode,
            sacMode: state.sacMode,
            theater: state.theater,
            footRadius: Marsh4Def.footRadius,
            headZ: 34,
            centerZ: 12,
            blocks: Marsh4Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Marsh4Def);
})(window.PixelWorkshop);
