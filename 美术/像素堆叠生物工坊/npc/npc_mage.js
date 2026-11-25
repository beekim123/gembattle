'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // N01 标杆 · 宝石卡牌法师（主角，+Y 正前，z=0 贴地）
  // 人类俯视 2.5~3 头身范式（站高约 24 格，头 11×11×10，脚底宽约 10 格）：
  //   1. 宽檐微翘深靛蓝尖角法帽，帽带正面镶嵌红/绿/蓝三颗微型宝石（俯视一眼辨识主角）
  //   2. 暖白立领内衬 + 深靛蓝镶亮金边短披风（后摆拆 2 节在局部坐标系随步态后扬，零穿模）
  //   3. 大腿根深嵌短袍下沿 + MultiLegGaitSolver 二足步态（停步自动收脚，零脱胯）
  //   4. 大臂 + 小臂两段 FK 手臂（小臂相对大臂滞后 0.75 rad），右手木金法杖（自亮棱晶核），
  //      左手侧悬浮红/绿/蓝三张微型法牌
  //   5. 高对比 3 档色阶（≤48 色、0 重色）、仅棱晶核进 glowKeys、严禁常态小数缩放
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      skinDark:    '#cf987d',
      skinMid:     '#f2c6ad',
      skinHi:      '#ffe7d6',
      hairDark:    '#4a2e1e',
      hairMid:     '#7c4f34',
      hairHi:      '#ad7754',
      robeDark:    '#18244a',
      robeMid:     '#2b417d',
      robeHi:      '#4f6db3',
      linerDark:   '#bfb7a6',
      linerMid:    '#e6dfd1',
      linerHi:     '#faf6ee',
      goldDark:    '#9c6e16',
      goldMid:     '#e0aa2b',
      goldHi:      '#ffe06b',
      leatherDark: '#3b2416',
      leatherMid:  '#694228',
      leatherHi:   '#966341',
      woodDark:    '#4d2f1a',
      woodMid:     '#805230',
      woodHi:      '#b57d50',
      gemRedDark:  '#991b24',
      gemRedMid:   '#e6353e',
      gemRedHi:    '#ff7a7d',
      gemGrnDark:  '#187a38',
      gemGrnMid:   '#32c25b',
      gemGrnHi:    '#82f29c',
      gemBluDark:  '#1a4ea8',
      gemBluMid:   '#3584f0',
      gemBluHi:    '#85c4ff',
      eyeDark:     '#121622',
      eyeIris:     '#2f6fd6',
      eyeGlint:    '#f7fcff',
      prismMid:    '#4cd6ff',
      prismHot:    '#b8f2ff',
      prismCore:   '#ffffff'
    },
    glowKeys: ['prismMid', 'prismHot', 'prismCore'],
    parts: [
      'boot', 'leg', 'robe', 'liner', 'belt', 'goldTrim', 'cape',
      'head', 'hair', 'eye', 'hat', 'hatBand', 'gemRed', 'gemGrn', 'gemBlu',
      'upperArm', 'forearm', 'staff', 'staffMetal', 'prism', 'cardBody', 'cardFace'
    ],
    noCrease: [
      ['eye', 'head'], ['hair', 'head'], ['leg', 'boot'],
      ['robe', 'goldTrim'], ['cape', 'goldTrim'], ['hat', 'hatBand'],
      ['hatBand', 'gemRed'], ['hatBand', 'gemGrn'], ['hatBand', 'gemBlu'],
      ['staff', 'staffMetal'], ['staffMetal', 'prism'], ['cardBody', 'cardFace']
    ],
    materials: {
      skin:    ['skinDark',    'skinMid',    'skinHi'],
      hair:    ['hairDark',    'hairMid',    'hairHi'],
      robe:    ['robeDark',    'robeMid',    'robeHi'],
      liner:   ['linerDark',   'linerMid',   'linerHi'],
      gold:    ['goldDark',    'goldMid',    'goldHi'],
      leather: ['leatherDark', 'leatherMid', 'leatherHi'],
      wood:    ['woodDark',    'woodMid',    'woodHi'],
      gemRed:  ['gemRedDark',  'gemRedMid',  'gemRedHi'],
      gemGrn:  ['gemGrnDark',  'gemGrnMid',  'gemGrnHi'],
      gemBlu:  ['gemBluDark',  'gemBluMid',  'gemBluHi']
    },
    protectedParts: ['eye', 'gemRed', 'gemGrn', 'gemBlu', 'prism']
  });

  const SKINS = [
    {
      id: 'indigo', name: '靛蓝旅袍', dot: '#2b417d', outline: '#0e1324',
      pal: {}
    },
    {
      id: 'crimson', name: '绯红暖袍', dot: '#a82835', outline: '#1f0d12',
      pal: {
        robeDark:  '#611520', robeMid:  '#a82835', robeHi:  '#de5963',
        linerDark: '#c4b8a1', linerMid: '#ebe1cd', linerHi: '#fcf7ec',
        goldDark:  '#9e6c14', goldMid:  '#e8b02e', goldHi:  '#ffe375',
        eyeIris:   '#c95c24'
      }
    },
    {
      id: 'pine', name: '松绿林袍', dot: '#266b47', outline: '#0c1c15',
      pal: {
        robeDark:  '#15422d', robeMid:  '#266b47', robeHi:  '#4fa372',
        linerDark: '#b8bfa8', linerMid: '#dfe6d1', linerHi: '#f5faeb',
        goldDark:  '#8f601d', goldMid:  '#cf963c', goldHi:  '#f7cc77',
        eyeIris:   '#289e68'
      }
    }
  ];

  // 偏心关节枢轴常量
  const UPPER_ARM_PIVOT = { y: 1.8 };
  const FOREARM_PIVOT   = { y: 1.6 };
  const STAFF_PIVOT_Y   = 1.2;

  // 1. 双腿与旅靴（大腿根深嵌袍摆，零脱胯）
  function buildLegSeg(makeCanvas, rTop, rBot, hLen) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 3);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat('robe'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildBoot(makeCanvas) {
    const m = new VoxelModel(7, 8, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0.0, 2.7, 1.4, 1.4, 1.2, mat('robe'), partId.leg, true);
    m.paintEllipsoid(0, 0.9, 1.3, 1.75, 2.45, 1.3, mat('leather'), partId.boot, true);
    m.paintEllipsoid(0, 0.3, 2.2, 1.55, 1.65, 0.65, mat('gold'), partId.goldTrim, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5 });
  }

  // 2. 躯干（暖白立领内衬 + 深靛蓝镶亮金边短袍 + 皮腰带金扣，下摆包覆大腿根）
  function buildTorso(makeCanvas) {
    const m = new VoxelModel(12, 11, 12, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-5.2, 5.2, -4.6, 4.6, 0, 11, (x, y, z, X, Y) => {
      const dBody = (Math.hypot(X / 4.2, Y / 3.4, (z - 6.8) / 4.4) - 1) * 3.8;
      const dNeck = (Math.hypot(X / 2.2, (Y - 0.2) / 2.1, (z - 10.2) / 1.9) - 1) * 1.8;
      if (smin(dBody, dNeck, 1.0) <= 0) {
        const isLiner = (Y >= 1.2 && Math.abs(X) <= 2.2 && z >= 4.2 && z <= 10.6) || (z >= 9.4);
        m.setRaw(x, y, z, isLiner ? mat('liner') : mat('robe'), isLiner ? partId.liner : partId.robe);
      }
      // 袍摆（z = 1..5 牢牢包裹大腿根）
      const t = clamp((5.4 - z) / 4.4, 0, 1);
      const rX = lerp(4.1, 4.9, t);
      const rY = lerp(3.4, 4.1, t);
      const r = Math.hypot(X / rX, Y / rY);
      if (z >= 1 && z <= 5.4 && r <= 1.0 && r >= 0.45) {
        const isTrim = (z === 1) || (Math.abs(X) <= 1.1 && Y > 1.8 && z <= 4.4);
        m.setRaw(x, y, z, isTrim ? mat('gold') : mat('robe'), isTrim ? partId.goldTrim : partId.robe);
      }
    });
    // 披肩亮金领缘
    m.paintCapsule(-3.8, 1.6, 9.2, 0, 2.8, 8.2, 0.95, 0.95, mat('gold'), partId.goldTrim, true);
    m.paintCapsule( 3.8, 1.6, 9.2, 0, 2.8, 8.2, 0.95, 0.95, mat('gold'), partId.goldTrim, true);
    // 腰带与亮金腰扣
    m.fillAABB(-4.6, 4.6, -4.0, 4.0, 4, 6, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 4.35, Y / 3.65);
      if (r <= 1.0 && r >= 0.72 && (z === 4 || z === 5)) {
        m.setRaw(x, y, z, mat('leather'), partId.belt);
      }
    });
    m.paintEllipsoid(0, 3.5, 4.6, 1.2, 0.75, 1.0, mat('gold'), partId.goldTrim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8 });
  }

  // 3. 镶亮金边短披风后摆（拆 2 节，局部坐标系沿后背外法向排布，绝不穿背）
  function buildCapeSeg(makeCanvas, width, height, hasGoldHem) {
    const m = new VoxelModel(width, 6, height, SPEC);
    const { mat, partId } = SPEC;
    const hw = width * 0.5 - 1.2;
    m.fillAABB(-hw, hw, -2.2, 2.2, 0, height - 1, (x, y, z, X, Y) => {
      const t = clamp((height - 1 - z) / Math.max(1, height - 2), 0, 1);
      const halfSpan = lerp(hw * 0.76, hw, t);
      const curveY = -0.35 * (X * X) / Math.max(1, halfSpan * halfSpan);
      if (Math.abs(X) <= halfSpan && Math.abs(Y - curveY) <= 1.15) {
        const isGold = (hasGoldHem && z <= 1) || (Math.abs(X) >= halfSpan - 0.95);
        m.setRaw(x, y, z, isGold ? mat('gold') : mat('robe'), isGold ? partId.goldTrim : partId.cape);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: width * 0.42 });
  }

  // 4. 头部（11×11×10，Q 版略写实五官 + 0.6 俯视 0 遮挡 2×2 双眼 + 褐发鬓角）
  function buildHead(makeCanvas) {
    const W = 11, D = 11, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hz = 4.6, hy = 0.2;
    m.paintEllipsoid(0, hy, hz, 4.1, 4.0, 4.0, mat('skin'), partId.head, true);
    // 后脑与两侧鬓角发丝（留出正面清晰脸庞）
    m.fillAABB(-4.6, 4.6, -4.6, 3.6, 1, 9, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 4.45, (Y + 0.2) / 4.45, (z - (hz + 0.4)) / 4.25);
      if (d <= 1.0) {
        if (Y <= 0.2 && z >= 2.0) { m.setRaw(x, y, z, mat('hair'), partId.hair); return; }
        if (Math.abs(X) >= 3.2 && Y <= 2.2 && z >= 2.2 && z <= 7.2) {
          m.setRaw(x, y, z, mat('hair'), partId.hair);
        }
      }
    });
    // 小巧挺鼻
    m.paintEllipsoid(0, hy + 4.0, hz - 0.4, 0.8, 0.75, 0.75, mat('skin'), partId.head, true);
    m.despeckle();
    m.applyArtShading(true);

    // 表面扫描落点精雕 2×2 双眼（eyeGlint 绝不进 glowKeys，0.6 俯视 0 遮挡）
    const eyeZ = Math.round(hz - 0.5);
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (const s of [-1, 1]) {
      const xIn = Math.round(hw + s * 1.4), xOut = Math.round(hw + s * 2.4);
      for (const ex of [xIn, xOut]) {
        let sy = -1;
        for (let y = D - 1; y >= Math.round(hd); y--) {
          if (m.getPartId(ex, y, eyeZ) === partId.head) { sy = y; break; }
        }
        if (sy < 0) continue;
        for (const dz of [0, 1]) {
          const isOut = (ex === xOut);
          const kId = (dz === 1 && !isOut) ? keyToId.eyeGlint : (dz === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(ex, sy, eyeZ + dz, kId, partId.eye);
        }
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.5 });
  }

  // 5. 宽檐微翘深靛蓝尖角法帽（帽带正面清晰镶嵌红、绿、蓝三颗微型宝石！）
  function buildHat(makeCanvas) {
    const W = 17, D = 17, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 宽檐微翘
    m.fillAABB(-7.8, 7.8, -7.8, 7.8, 0, 4, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 7.5, Y / 7.3);
      if (r <= 1.0 && r >= 0.42) {
        const curl = Math.pow(clamp((r - 0.58) / 0.42, 0, 1), 1.6) * 1.55;
        const brimZ = 1.2 + curl;
        if (Math.abs(z - brimZ) <= 0.82) {
          const isEdge = r >= 0.87;
          m.setRaw(x, y, z, isEdge ? mat('gold') : mat('robe'), isEdge ? partId.goldTrim : partId.hat);
        }
      }
    });
    // 略微后倾弯折的尖角帽冠
    m.fillAABB(-4.8, 4.8, -6.2, 4.8, 1, 11, (x, y, z, X, Y) => {
      const t = clamp((z - 1.2) / 9.8, 0, 1);
      const cx = t * t * 1.1;
      const cy = -t * t * 2.8;
      const rad = lerp(4.2, 0.75, Math.pow(t, 0.88));
      if (Math.hypot(X - cx, Y - cy) <= rad) {
        const isBand = z >= 2 && z <= 3.6;
        m.setRaw(x, y, z, isBand ? mat('gold') : mat('robe'), isBand ? partId.hatBand : partId.hat);
      }
    });
    // 帽带正前方三颗微型宝石：左红、中绿、右蓝（清晰突出，俯视一眼认出主角）
    m.paintEllipsoid(-2.3, 3.9, 3.1, 1.05, 1.0, 1.05, mat('gemRed'), partId.gemRed, true);
    m.paintEllipsoid( 0.0, 4.3, 3.2, 1.10, 1.05, 1.10, mat('gemGrn'), partId.gemGrn, true);
    m.paintEllipsoid( 2.3, 3.9, 3.1, 1.05, 1.0, 1.05, mat('gemBlu'), partId.gemBlu, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.4 });
  }

  // 6. 两段式手臂：大臂（法袍袖）+ 小臂（金边袖口+手掌），枢轴锁在后端
  function buildUpperArm(makeCanvas) {
    const m = new VoxelModel(6, 7, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -UPPER_ARM_PIVOT.y, 3.4, 0, 2.2, 2.2, 1.45, 1.32, mat('robe'), partId.upperArm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0 });
  }

  function buildForearm(makeCanvas) {
    const m = new VoxelModel(6, 7, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -FOREARM_PIVOT.y, 2.5, 0, 0.8, 2.4, 1.32, 1.38, mat('robe'), partId.forearm, true);
    m.paintEllipsoid(0, 0.8, 2.4, 1.45, 0.8, 1.45, mat('gold'), partId.goldTrim, true);
    m.paintEllipsoid(0, 2.1, 2.4, 1.12, 1.18, 1.08, mat('skin'), partId.forearm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0 });
  }

  // 7. 木金法杖（杖顶悬浮自亮棱晶核，glowKeys 仅给棱晶核）
  function buildStaff(makeCanvas) {
    const m = new VoxelModel(9, 10, 25, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const py = -STAFF_PIVOT_Y;
    // 胡桃木杖身
    m.paintCapsule(0, py, 1.0, 0, py + 0.6, 17.8, 0.92, 1.02, mat('wood'), partId.staff, true);
    // 握柄与杖顶金箍
    m.paintEllipsoid(0, py + 0.3, 10.5, 1.25, 1.25, 0.95, mat('gold'), partId.staffMetal, true);
    m.paintEllipsoid(0, py + 0.6, 17.6, 1.55, 1.55, 1.05, mat('gold'), partId.staffMetal, true);
    // 杖顶两侧亮金弧爪
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.1, py + 0.6, 18.0, s * 2.4, py + 0.8, 20.6, 0.82, 0.72, mat('gold'), partId.staffMetal, true);
      m.paintCapsule(s * 2.4, py + 0.8, 20.6, s * 1.6, py + 0.9, 22.8, 0.72, 0.65, mat('gold'), partId.staffMetal, true);
    }
    // 悬浮自亮棱晶核（八面体切面，0 遮挡）
    const cx = 0, cy = py + 0.9, cz = 21.3;
    m.fillAABB(-2.5, 2.5, cy - 2.5, cy + 2.5, 18, 24, (x, y, z, X, Y) => {
      const d = (Math.abs(X - cx) / 1.75) + (Math.abs(Y - cy) / 1.75) + (Math.abs(z - cz) / 2.35);
      if (d <= 1.0) {
        const col = d <= 0.42 ? keyToId.prismCore : (d <= 0.72 ? keyToId.prismHot : keyToId.prismMid);
        m.setRaw(x, y, z, col, partId.prism);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2 });
  }

  // 8. 悬浮微型法牌（红/绿/蓝三张，金边 + 暖白卡底 + 中央宝石菱纹）
  function buildCard(makeCanvas, gemMatName) {
    const m = new VoxelModel(5, 3, 7, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-2.0, 2.0, -0.6, 0.6, 0, 6, (x, y, z, X, Y) => {
      if (Math.abs(Y) <= 0.65 && Math.abs(X) <= 1.85 && z >= 0 && z <= 5) {
        const isBorder = Math.abs(X) >= 1.35 || z === 0 || z === 5;
        const isGem = Math.abs(X) <= 0.8 && z >= 2 && z <= 3;
        if (isGem) {
          m.setRaw(x, y, z, mat(gemMatName), partId.cardFace);
        } else {
          m.setRaw(x, y, z, isBorder ? mat('gold') : mat('liner'), isBorder ? partId.goldTrim : partId.cardBody);
        }
      }
    });
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 1.8 });
  }

  const MageDef = {
    id: 'npc_mage',
    code: 'N01',
    name: '宝石卡牌法师',
    tag: '远程法系主角 · 三色宝石卡牌',
    summary: 'N01 人形标杆：2.5~3 头身 + 三宝石尖角法帽 + 局部防穿模双节短披风 + 两段滞后 FK 手臂 + 棱晶法杖与三张悬浮法牌',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 6.2,
    ecoWeight: 0.72,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',          name: '原地待机', loop: true,  status: 'done' },
      { id: 'patrol',        name: '自由巡游', loop: true,  status: 'done' },
      { id: 'cast',          name: '挥杖施法', loop: false, duration: 2.2, status: 'done' },
      { id: 'inspect_cards', name: '翻看卡牌', loop: false, duration: 2.6, status: 'done' }
    ],
    blocks: ['三宝石尖角法帽', '局部坐标系双节披风', '收拢二足步态', '两段滞后 FK 手臂', '棱晶法杖与三色法牌'],
    soulHabit: '待机轻点法杖让三张红绿蓝法牌缓缓浮沉 ↔ 轻快巡游披风后扬 ↔ 挥杖飞牌迸发三色宝石弹丸 ↔ 抬手翻牌敲帽檐思索',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legThigh:  buildLegSeg(makeCanvas, 1.55, 1.35, 3.9),
        legShin:   buildLegSeg(makeCanvas, 1.32, 1.22, 3.7),
        boot:      buildBoot(makeCanvas),
        torso:     buildTorso(makeCanvas),
        capeUpper: buildCapeSeg(makeCanvas, 10, 8, false),
        capeLower: buildCapeSeg(makeCanvas, 12, 7, true),
        head:      buildHead(makeCanvas),
        hat:       buildHat(makeCanvas),
        upperArmL: buildUpperArm(makeCanvas),
        upperArmR: buildUpperArm(makeCanvas),
        forearmL:  buildForearm(makeCanvas),
        forearmR:  buildForearm(makeCanvas),
        staff:     buildStaff(makeCanvas),
        cardRed:   buildCard(makeCanvas, 'gemRed'),
        cardGrn:   buildCard(makeCanvas, 'gemGrn'),
        cardBlu:   buildCard(makeCanvas, 'gemBlu')
      };

      // 二足收拢步态：大腿根深嵌腰衣（hipZ=7.2），停步自动收脚
      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.2, hipY: 0.0, hipZ: 7.2, restX: -2.4, restY: 0.2, group: 0, L1: 3.9, L2: 4.0, bendDir: 1 },
        { id: 'R', hipX:  2.2, hipY: 0.0, hipZ: 7.2, restX:  2.4, restY: 0.2, group: 1, L1: 3.9, L2: 4.0, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 1.8, stepDuration: 0.145, stepHeight: 2.4, strideAnticipation: 0.42 });

      const headYawSpring = new SpringDamper1D(0, 120, 8.6);
      const hatBobSpring  = new SpringDamper1D(0, 160, 7.5);
      const capeSwaySpring = new SpringDamper1D(0, 95, 7.2);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        turnRate: 0,
        walkBlend: 0,
        armPhase: 0,
        time: 0,
        action: 'idle',
        actionTime: 0,
        // 两段手臂 FK 连续角与高度
        lShYaw: 0, lElbYaw: 0, lShZ: 0, lElbZ: 0,
        rShYaw: 0, rElbYaw: 0, rShZ: 0, rElbZ: 0,
        staffLift: 0, staffYawOff: 0,
        headDrop: 0,
        castFxCd: 0,
        castBurstIdx: 0
      };
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: MageDef,
        cachePrefix: `npc_mage_${Math.random().toString(36).slice(2, 7)}`,
        parts, partListAssets: Object.values(parts), state, sockets, footContacts: [], scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.yaw = hyaw; state.z = 0;
          state.vx = 0; state.vy = 0; state.walkBlend = 0;
          state.turnRate = 0; state.castBurstIdx = 0;
          gait.reset(hx, hy, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.4, 2.0);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          state.time = time;

          const act = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const actT = (eco && eco.actionTime != null) ? eco.actionTime : 0;
          state.action = act;
          state.actionTime = actT;

          const isPatrol = act === 'patrol';
          const prevYaw = state.yaw;

          Propulsion.multiLegWalk(state, dt, time, { ...params, speed: (params.speed ?? 1.0) * 1.05 }, {
            ...(eco || {}),
            patrol: isPatrol,
            walkStyle: 'scurry',
            baseLift: 0
          });
          state.z = 0;

          const curTurnRate = wrapAngle(state.yaw - prevYaw) / Math.max(dt, 0.001);
          state.turnRate = lerp(state.turnRate, clamp(curTurnRate, -5.0, 5.0), expSmooth(dt, 10));

          const spdNow = Math.hypot(state.vx, state.vy);
          const tgtWalk = isPatrol ? clamp((spdNow - 1.2) / 9.0, 0, 1) : 0;
          state.walkBlend = lerp(state.walkBlend, tgtWalk, expSmooth(dt, 10));
          state.armPhase += dt * (2.6 + state.walkBlend * 7.2) * gFreq;

          // 二足步态求解 + 温和钳位防脱胯
          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 1.25,
            stepHeight: 2.4 * sMul,
            stepThreshold: 1.8 * sMul
          });
          state.tiltX = lerp(state.tiltX || 0, gaitRes.tiltX * 0.45 * sMul, expSmooth(dt, 12));
          state.tiltY = lerp(state.tiltY || 0, gaitRes.tiltY * 0.45 * sMul, expSmooth(dt, 12));

          const maxFootOffset = 3.5 * sMul;
          for (const leg of gait.legs) {
            const [idealX, idealY] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
            const dx = leg.footX - idealX, dy = leg.footY - idealY;
            const d = Math.hypot(dx, dy);
            if (d > maxFootOffset) {
              leg.footX = idealX + (dx / d) * maxFootOffset;
              leg.footY = idealY + (dy / d) * maxFootOffset;
            }
          }

          if (vfx && gaitRes.landed.length > 0 && state.walkBlend > 0.25) {
            for (const l of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.52 * sMul);
            }
          }
          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.0 * sMul }));

          // 动作分支：计算大臂 + 小臂 FK 目标角（小臂相对大臂滞后 0.75 rad）
          const lag = 0.75;
          let tgtLShYaw = -0.32 + Math.sin(state.armPhase) * 0.14;
          let tgtLElbYaw = -0.22 + Math.sin(state.armPhase - lag) * 0.16;
          let tgtLShZ = 0.25 * Math.sin(time * 2.2);
          let tgtLElbZ = 0.45 + 0.35 * Math.sin(time * 2.2 - lag);

          let tgtRShYaw = 0.26 - Math.sin(state.armPhase) * 0.10;
          let tgtRElbYaw = 0.18 - Math.sin(state.armPhase - lag) * 0.12;
          let tgtRShZ = 0.25 * Math.sin(time * 2.2 + 0.4);
          let tgtRElbZ = Math.sin(time * 2.2 - 0.3) * 0.45; // 法杖轻点地节律

          let tgtStaffLift = Math.max(0, Math.sin(time * 2.2)) * 0.85;
          let tgtStaffYawOff = 0.08 * Math.sin(time * 2.2 - lag);
          let tgtHeadYaw = Math.sin(time * 1.05) * 0.18;
          let tgtHeadDrop = 0;

          if (act === 'patrol') {
            const swing = 0.56 * state.walkBlend;
            tgtLShYaw = -0.20 + Math.sin(state.armPhase) * swing;
            tgtLElbYaw = -0.14 + Math.sin(state.armPhase - lag) * swing * 1.15;
            tgtLShZ = Math.max(0, Math.sin(state.armPhase)) * 0.55 * state.walkBlend;
            tgtLElbZ = Math.max(0, Math.sin(state.armPhase - lag)) * 0.75 * state.walkBlend;

            tgtRShYaw = 0.24 - Math.sin(state.armPhase) * swing * 0.72;
            tgtRElbYaw = 0.18 - Math.sin(state.armPhase - lag) * swing * 0.85;
            tgtRShZ = Math.max(0, -Math.sin(state.armPhase)) * 0.5 * state.walkBlend;
            tgtRElbZ = 0.4 + Math.max(0, -Math.sin(state.armPhase - lag)) * 0.7 * state.walkBlend;
            tgtStaffLift = 1.6 * state.walkBlend;
            tgtStaffYawOff = -0.18 * state.walkBlend;
            tgtHeadYaw = clamp(-state.turnRate * 0.14, -0.35, 0.35);
          } else if (act === 'cast') {
            // 2.2s 抬杖画弧向前指，三张法牌向前飞旋，杖顶连闪迸出红/绿/蓝三色宝石弹丸
            const p = clamp(actT / 2.2, 0, 1);
            const raise = smoothstep(0.0, 0.30, p) * (1 - smoothstep(0.80, 1.0, p));
            const arc = Math.sin(clamp((p - 0.15) / 0.55, 0, 1) * Math.PI);
            tgtRShYaw = lerp(0.26, -0.45, raise) + arc * 0.55;
            tgtRElbYaw = lerp(0.18, -0.25, raise) + Math.sin(clamp((p - 0.22) / 0.55, 0, 1) * Math.PI) * 0.62;
            tgtRShZ = 2.6 * raise;
            tgtRElbZ = 4.2 * raise;
            tgtStaffLift = 4.6 * raise;
            tgtStaffYawOff = -0.35 * raise + arc * 0.42;

            tgtLShYaw = -0.45 - 0.35 * raise;
            tgtLElbYaw = -0.30 - 0.45 * raise;
            tgtLShZ = 1.4 * raise;
            tgtLElbZ = 2.4 * raise;
            tgtHeadYaw = 0.12 * arc;

            // 中段连闪迸发红、绿、蓝三色宝石弹丸粒子
            if (vfx && p >= 0.30 && p <= 0.78) {
              state.castFxCd -= dt;
              if (state.castFxCd <= 0) {
                state.castFxCd = 0.11;
                const gemCols = ['#ff5a5f', '#42e06e', '#4da3ff'];
                const col = gemCols[state.castBurstIdx % 3];
                state.castBurstIdx++;
                const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
                const [tipX, tipY] = localToWorldXY(state.x, state.y, state.yaw, 4.5 * sMul, 9.5 * sMul);
                const spread = (Math.random() - 0.5) * 14;
                const sideX = Math.cos(state.yaw), sideY = Math.sin(state.yaw);
                vfx.spawnParticle(
                  tipX, tipY, (22.5 + Math.random() * 2.0) * sMul,
                  fwdX * 36 + sideX * spread, fwdY * 36 + sideY * spread, 4 + Math.random() * 6,
                  0.58, 1.85, col, true, 12
                );
              }
            }
          } else if (act === 'inspect_cards') {
            // 2.6s 低头抬起左手翻看扇形卡牌，右手轻敲帽檐思考
            const p = clamp(actT / 2.6, 0, 1);
            const focus = smoothstep(0.0, 0.22, p) * (1 - smoothstep(0.84, 1.0, p));
            const tap = Math.max(0, Math.sin(p * Math.PI * 6.0)) * focus;

            tgtLShYaw = lerp(-0.32, 0.36, focus);
            tgtLElbYaw = lerp(-0.22, 0.52, focus);
            tgtLShZ = 1.8 * focus;
            tgtLElbZ = 3.2 * focus;

            tgtRShYaw = lerp(0.26, -0.58, focus);
            tgtRElbYaw = lerp(0.18, -0.78, focus);
            tgtRShZ = (3.0 + tap * 0.6) * focus;
            tgtRElbZ = (5.4 + tap * 1.1) * focus;
            tgtStaffLift = 0.2;
            tgtStaffYawOff = 0.22 * focus;

            tgtHeadYaw = -0.34 * focus + Math.sin(p * Math.PI * 3.0) * 0.08 * focus;
            tgtHeadDrop = 0.9 * focus;
            if (tap > 0.85) hatBobSpring.impulse(3.5 * sp);
          }

          const kArm = expSmooth(dt, 11.5);
          state.lShYaw  = lerp(state.lShYaw,  tgtLShYaw,  kArm);
          state.lElbYaw = lerp(state.lElbYaw, tgtLElbYaw, kArm);
          state.lShZ    = lerp(state.lShZ,    tgtLShZ,    kArm);
          state.lElbZ   = lerp(state.lElbZ,   tgtLElbZ,   kArm);
          state.rShYaw  = lerp(state.rShYaw,  tgtRShYaw,  kArm);
          state.rElbYaw = lerp(state.rElbYaw, tgtRElbYaw, kArm);
          state.rShZ    = lerp(state.rShZ,    tgtRShZ,    kArm);
          state.rElbZ   = lerp(state.rElbZ,   tgtRElbZ,   kArm);
          state.staffLift   = lerp(state.staffLift,   tgtStaffLift,   kArm);
          state.staffYawOff = lerp(state.staffYawOff, tgtStaffYawOff, kArm);
          state.headDrop    = lerp(state.headDrop,    tgtHeadDrop,    kArm);

          headYawSpring.update(dt, tgtHeadYaw, 120 * sp, 8.6);
          hatBobSpring.update(dt, 0, 160 * sp, 7.5);
          // 斗篷侧向微摆仅由限幅转身角速度驱动（绝不做世界空间滞后插值）
          const capeTargetSway = clamp(-state.turnRate * 0.38, -1.65, 1.65) * flex;
          capeSwaySpring.update(dt, capeTargetSway, 95 * sp, 7.2);

          sockets.setWorld('head', state.x, state.y, 18.0 * sMul, wrapAngle(state.yaw + headYawSpring.x));
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.58, 0.58));

          const breath = Math.sin(state.time * 2.4) * 0.35 * sMul;
          const walkBob = Math.abs(Math.sin(state.armPhase)) * 0.55 * state.walkBlend * sMul;
          const bob = breath + walkBob;

          const baseX = state.x + (state.tiltX || 0);
          const baseY = state.y + (state.tiltY || 0);

          // 1. 双腿真屈膝 IK（大腿深嵌腰袍）
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const hx = l.hipWX + (state.tiltX || 0);
            const hy = l.hipWY + (state.tiltY || 0);
            const hz = l.hipWZ + bob * 0.6;
            const segs = [
              { k: 'legThigh', x: lerp(hx, l.kneeX, 0.28), y: lerp(hy, l.kneeY, 0.28), z: lerp(hz, l.kneeZ, 0.28), b: -0.34, sym: 90 },
              { k: 'legShin',  x: lerp(l.kneeX, l.footX, 0.45), y: lerp(l.kneeY, l.footY, 0.45), z: lerp(l.kneeZ, l.footZ + 1.4 * sMul, 0.45), b: -0.26, sym: 90 },
              { k: 'boot',     x: l.footX, y: l.footY, z: l.footZ, b: -0.18, sym: 0 }
            ];
            for (const pt of segs) {
              const item = {
                partKey: pt.k, asset: parts[pt.k],
                x: pt.x, y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === 'boot' ? 0 : 1.7 * sMul)),
                ro: yw, bias: pt.b
              };
              if (pt.sym) item.symDeg = pt.sym;
              list.push(item);
            }
          }

          // 2. 躯干（暖白内衬 + 靛蓝金边短袍）
          list.push({
            partKey: 'torso', asset: parts.torso,
            x: baseX, y: baseY, lift: 4.8 * sMul + bob, ro: yw, bias: 0.12
          });

          // 3. 短披风后摆 2 节（严格在机身局部坐标系沿后背外法向排布，绝不穿背）
          const flare = (0.5 + state.walkBlend * 1.45 + Math.sin(state.time * 2.8) * 0.22) * sMul;
          const sway = clamp(capeSwaySpring.x, -1.7, 1.7) * sMul;
          const [c1x, c1y] = localToWorldXY(baseX, baseY, yw, sway * 0.35, -(3.9 + flare * 0.45) * sMul);
          const [c2x, c2y] = localToWorldXY(baseX, baseY, yw, sway,        -(5.2 + flare * 1.15) * sMul);
          list.push({
            partKey: 'capeUpper', asset: parts.capeUpper,
            x: c1x, y: c1y, lift: 8.2 * sMul + bob, ro: yw + sway * 0.08, bias: -0.22
          });
          list.push({
            partKey: 'capeLower', asset: parts.capeLower,
            x: c2x, y: c2y, lift: (3.6 + flare * 0.55) * sMul + bob, ro: yw + sway * 0.14, bias: -0.32
          });

          // 4. 头部 + 宽檐三宝石尖角法帽
          const headZ = (14.4 - state.headDrop) * sMul + bob * 1.05;
          list.push({
            partKey: 'head', asset: parts.head,
            x: baseX, y: baseY, lift: headZ, ro: hYaw, bias: 0.42
          });
          const hatLift = headZ + (7.2 + clamp(hatBobSpring.x * 0.08, -0.4, 0.8)) * sMul;
          const [hatX, hatY] = localToWorldXY(baseX, baseY, hYaw, 0, -0.2 * sMul);
          list.push({
            partKey: 'hat', asset: parts.hat,
            x: hatX, y: hatY, lift: hatLift, ro: hYaw, bias: 0.52
          });

          // 5. 两段式 FK 左臂（大臂 + 滞后小臂）
          const shZ = 10.6 * sMul + bob;
          const [lShX, lShY] = localToWorldXY(baseX, baseY, yw, -4.4 * sMul, 0.2 * sMul);
          const lUpYaw = yw + state.lShYaw;
          const [lUpX, lUpY] = localToWorldXY(lShX, lShY, lUpYaw, 0, UPPER_ARM_PIVOT.y * sMul);
          const [lElX, lElY] = localToWorldXY(lShX, lShY, lUpYaw, 0, 3.8 * sMul);
          const lFoYaw = lUpYaw + state.lElbYaw;
          const [lFoX, lFoY] = localToWorldXY(lElX, lElY, lFoYaw, 0, FOREARM_PIVOT.y * sMul);
          const [lHdX, lHdY] = localToWorldXY(lElX, lElY, lFoYaw, 0, 3.6 * sMul);

          list.push({ partKey: 'upperArmL', asset: parts.upperArmL, x: lUpX, y: lUpY, lift: shZ + state.lShZ * sMul, ro: lUpYaw, bias: 0.20 });
          list.push({ partKey: 'forearmL',  asset: parts.forearmL,  x: lFoX, y: lFoY, lift: shZ - 1.2 * sMul + state.lElbZ * sMul, ro: lFoYaw, bias: 0.28 });

          // 6. 两段式 FK 右臂 + 锁枢轴木金棱晶法杖
          const [rShX, rShY] = localToWorldXY(baseX, baseY, yw, 4.4 * sMul, 0.2 * sMul);
          const rUpYaw = yw + state.rShYaw;
          const [rUpX, rUpY] = localToWorldXY(rShX, rShY, rUpYaw, 0, UPPER_ARM_PIVOT.y * sMul);
          const [rElX, rElY] = localToWorldXY(rShX, rShY, rUpYaw, 0, 3.8 * sMul);
          const rFoYaw = rUpYaw + state.rElbYaw;
          const [rFoX, rFoY] = localToWorldXY(rElX, rElY, rFoYaw, 0, FOREARM_PIVOT.y * sMul);
          const [rHdX, rHdY] = localToWorldXY(rElX, rElY, rFoYaw, 0, 3.6 * sMul);

          list.push({ partKey: 'upperArmR', asset: parts.upperArmR, x: rUpX, y: rUpY, lift: shZ + state.rShZ * sMul, ro: rUpYaw, bias: 0.20 });
          list.push({ partKey: 'forearmR',  asset: parts.forearmR,  x: rFoX, y: rFoY, lift: shZ - 1.2 * sMul + state.rElbZ * sMul, ro: rFoYaw, bias: 0.28 });

          // 翻看卡牌时右手去敲帽檐，法杖稳立身侧地面；其余动作锁在右手掌心
          const staffYaw = rFoYaw + state.staffYawOff;
          let stX, stY, stLift;
          if (state.action === 'inspect_cards') {
            [stX, stY] = localToWorldXY(baseX, baseY, yw, 5.4 * sMul, 1.8 * sMul);
            stLift = 0.2 * sMul;
          } else {
            [stX, stY] = localToWorldXY(rHdX, rHdY, staffYaw, 0, STAFF_PIVOT_Y * sMul);
            stLift = Math.max(0.1, (1.2 + state.staffLift + state.rElbZ * 0.45) * sMul);
          }
          list.push({
            partKey: 'staff', asset: parts.staff,
            x: stX, y: stY, lift: stLift, ro: staffYaw, bias: 0.38
          });

          // 7. 左手侧悬浮三张红/绿/蓝微型法牌（待机轻晃、施法向前飞旋、翻牌时在身前扇形展开）
          const cardKeys = ['cardRed', 'cardGrn', 'cardBlu'];
          const castP = state.action === 'cast' ? clamp(state.actionTime / 2.2, 0, 1) : 0;
          const inspectP = state.action === 'inspect_cards' ? clamp(state.actionTime / 2.6, 0, 1) : 0;
          const castFly = state.action === 'cast'
            ? smoothstep(0.15, 0.42, castP) * (1 - smoothstep(0.75, 1.0, castP))
            : 0;
          const inspectFan = state.action === 'inspect_cards'
            ? smoothstep(0.05, 0.25, inspectP) * (1 - smoothstep(0.82, 1.0, inspectP))
            : 0;

          for (let ci = 0; ci < 3; ci++) {
            const idxOff = ci - 1; // -1, 0, +1
            const bobCard = Math.sin(state.time * 3.0 + ci * 1.15) * 0.9 * sMul;
            let cx, cy, cz, cYaw;
            if (castFly > 0.02) {
              // 施法时三张法牌向前飞旋成环
              const spinAng = state.time * 7.8 + ci * (Math.PI * 2 / 3);
              const fwdDist = lerp(4.0, 12.8, castFly);
              const orbitR = lerp(2.2, 4.4, castFly);
              [cx, cy] = localToWorldXY(
                baseX, baseY, yw,
                Math.cos(spinAng) * orbitR * sMul,
                (fwdDist + Math.sin(spinAng) * orbitR * 0.65) * sMul
              );
              cz = (13.0 + Math.sin(spinAng) * 1.8) * sMul + bobCard;
              cYaw = yw + spinAng;
            } else if (inspectFan > 0.02) {
              // 翻看卡牌时在身前左前方展开清晰扇面
              const fanX = lerp(-6.2 + idxOff * 1.4, -1.6 + idxOff * 2.5, inspectFan);
              const fanY = lerp(2.0 + Math.abs(idxOff) * 0.4, 6.8 - Math.abs(idxOff) * 0.7, inspectFan);
              [cx, cy] = localToWorldXY(baseX, baseY, yw, fanX * sMul, fanY * sMul);
              cz = (12.8 + inspectFan * 2.4 - Math.abs(idxOff) * 0.4) * sMul + bobCard * 0.5;
              cYaw = yw + idxOff * 0.34;
            } else {
              // 常态随左手侧扇形悬浮轻晃
              [cx, cy] = localToWorldXY(
                lHdX, lHdY, yw,
                (-2.2 + idxOff * 1.45) * sMul,
                (1.4 - Math.abs(idxOff) * 0.45) * sMul
              );
              cz = (11.6 + state.lElbZ * 0.45 - Math.abs(idxOff) * 0.35) * sMul + bobCard;
              cYaw = yw + 0.32 + idxOff * 0.28;
            }
            list.push({
              partKey: cardKeys[ci], asset: parts[cardKeys[ci]],
              x: cx, y: cy, lift: Math.max(2.0, cz), ro: cYaw, bias: 0.46 + ci * 0.02
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: MageDef.id, code: MageDef.code, name: MageDef.name, outlineMode: 'actorUnified',
            skin: curSkin.id, footRadius: MageDef.footRadius, headZ: 24, centerZ: 12,
            blocks: MageDef.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(MageDef, 'npc');
})(window.PixelWorkshop);
