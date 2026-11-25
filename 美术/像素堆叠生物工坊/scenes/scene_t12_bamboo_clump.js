'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D } = PW.Solvers;

  // =========================================================================
  // T12 · 脆节高竹丛与嫩笋（scenes/scene_t12_bamboo_clump.js）
  //
  // 生态呼应（文档/生态设计数据.js T12 bamboo）：
  //   - 竹子一天长高一大截、咔咔响、藏竹虫与水；与 树5（tree5_bamboo_launcher）严丝合缝合拍。
  //
  // 拆件与图集预算（单盒严格 <= 40 格，复用 2 种竹节小件串起 5 根高竹）：
  //   - bambooRoot  (10×10×9,  symDeg: 90)：扎地竹根节 + 腐殖土墩 + 鲜明象牙黄竹节环
  //   - bambooSeg   (8×8×9,    symDeg: 90)：复用中段竹节（5 根高竹共复用 15 节，仅占 1 份贴图！）
  //   - bambooTip   (18×18×12, symDeg: 90)：细竹梢 + 簇生嫩绿细竹叶（支持降 opacity 防遮挡）
  //   - shootPiece  (8×8×10,   symDeg: 90)：肥嫩赭壳白尖竹笋（复用 3 根破土排布）
  //   - leafCarpet  (16×16×3,  symDeg: 90)：地面散落嫩绿细竹叶与碎竹壳垫
  //
  // 展示动作：
  //   - idle       ：清风过竹（竹梢错相轻摇、偶飘细长竹叶粒）
  //   - bend_snap  ：压弯弹直（主竹竿逐节缓慢压弯成大幅度弧线蓄力，随后啪地弹直高频回颤并抖落竹叶与水珠）
  //   - grow_crack ：嫩笋咔哒拔节（3 根竹笋咔哒咔哒一节节拔高抖泥）
  // =========================================================================

  // 23 色独立色表（<= 48 色、0 重色、0 自亮）
  const SPEC = createPaletteSpec({
    pal: {
      // 深碧翠竹竿（3 阶，与浅绿竹林地台拉开明暗）
      culmDark:  '#0f4729',
      culmMid:   '#1e7a43',
      culmHi:    '#48b865',
      // 极清晰明黄/象牙白竹节环（3 阶，俯视一眼切出竹节段）
      nodeDark:  '#a69d46',
      nodeMid:   '#e3da74',
      nodeHi:    '#fff9bd',
      // 深暗竹节沟线（2 阶，强化脆节切分感）
      ringDark:  '#122618',
      ringMid:   '#284a30',
      // 顶梢与散落嫩绿细竹叶（3 阶）
      leafDark:  '#1f662e',
      leafMid:   '#46ab4a',
      leafHi:    '#98e667',
      // 肥胖竹笋赭褐笋壳（3 阶）
      huskDark:  '#5c3114',
      huskMid:   '#9e5926',
      huskHi:    '#d98b48',
      // 竹笋鲜嫩象牙白尖（3 阶）
      tipDark:   '#bfb795',
      tipMid:    '#e6dfc2',
      tipHi:     '#fcf8e8',
      // 根部湿润泥土墩（3 阶）
      soilDark:  '#2b1e14',
      soilMid:   '#4a3423',
      soilHi:    '#705138',
      // 干枯笋衣碎屑点缀（3 阶）
      dryDark:   '#6e5833',
      dryMid:    '#a68951',
      dryHi:     '#d6bc7e'
    },
    glowKeys: [],
    parts: ['culm', 'node', 'ring', 'leaf', 'husk', 'tip', 'soil', 'dry'],
    noCrease: [
      ['culm', 'node'], ['culm', 'ring'], ['node', 'ring'],
      ['culm', 'leaf'], ['husk', 'tip'], ['soil', 'dry']
    ],
    materials: {
      culm: ['culmDark', 'culmMid', 'culmHi'],
      node: ['nodeDark', 'nodeMid', 'nodeHi'],
      ring: ['ringDark', 'ringMid', 'ringMid'],
      leaf: ['leafDark', 'leafMid', 'leafHi'],
      husk: ['huskDark', 'huskMid', 'huskHi'],
      tip:  ['tipDark',  'tipMid',  'tipHi'],
      soil: ['soilDark', 'soilMid', 'soilHi'],
      dry:  ['dryDark',  'dryMid',  'dryHi']
    },
    protectedParts: ['node', 'ring', 'tip']
  });

  // 3 套零重建模换色皮肤（翠碧鲜竹、金黄斑竹、苍青老竹；0 禁用字）
  const SKINS = [
    {
      id: 'emerald_fresh',
      name: '翠碧鲜竹',
      dot: '#1e7a43',
      outline: '#0d1a10',
      pal: {},
      fx: {
        leafA: '#46ab4a',
        leafB: '#98e667',
        drop:  '#a8e8f5',
        dirt:  '#705138'
      }
    },
    {
      id: 'golden_mottled',
      name: '金黄斑竹',
      dot: '#d99e26',
      outline: '#1f150a',
      pal: {
        culmDark: '#875711', culmMid: '#cc8f1f', culmHi: '#f7c948',
        nodeDark: '#7a4518', nodeMid: '#bd7531', nodeHi: '#f2be72',
        ringDark: '#2e1a09', ringMid: '#523012',
        leafDark: '#3f6e20', leafMid: '#76ad36', leafHi: '#bfe868',
        huskDark: '#592412', huskMid: '#964222', huskHi: '#d47448',
        tipDark:  '#c7b589', tipMid:  '#ede0b4', tipHi:  '#fff7db'
      },
      fx: {
        leafA: '#76ad36',
        leafB: '#f7c948',
        drop:  '#baeef7',
        dirt:  '#7d5838'
      }
    },
    {
      id: 'aged_teal',
      name: '苍青老竹',
      dot: '#2f7a73',
      outline: '#0d191a',
      pal: {
        culmDark: '#134242', culmMid: '#286e6a', culmHi: '#59a89d',
        nodeDark: '#8a8c62', nodeMid: '#c4c795', nodeHi: '#eff0c7',
        ringDark: '#122424', ringMid: '#244545',
        leafDark: '#1e544a', leafMid: '#3b8c7a', leafHi: '#7fd1b8',
        huskDark: '#472c1a', huskMid: '#784c2e', huskHi: '#ad774c',
        tipDark:  '#b0b39c', tipMid:  '#d9dcc7', tipHi:  '#f5f7ea'
      },
      fx: {
        leafA: '#3b8c7a',
        leafB: '#7fd1b8',
        drop:  '#9ce0ed',
        dirt:  '#5c4738'
      }
    }
  ];

  // =========================================================================
  // 1. 体素建模（全复用小件，单盒最大 18×18×12）
  // =========================================================================

  // 1) 扎地竹根节（10×10×9，symDeg: 90）
  function buildBambooRoot(makeCanvas) {
    const m = new VoxelModel(10, 10, 9, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-4.5, 4.5, -4.5, 4.5, 0, 8, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      // 底部一圈湿润泥土根丘
      if (z <= 1 && r <= 4.35 && r > 2.4) {
        const isDry = Math.abs(Math.abs(X) - Math.abs(Y)) < 0.7 && z === 1;
        m.setRaw(x, y, z, isDry ? mat('dry') : mat('soil'), isDry ? partId.dry : partId.soil);
        return;
      }
      const isRing = (z === 6);
      const isNode = (z === 7 || z === 1);
      const rad = z === 0 ? 3.2 : (isNode ? 3.05 : (isRing ? 2.55 : 2.65));
      if (r > rad) return;
      if (isNode) m.setRaw(x, y, z, mat('node'), partId.node);
      else if (isRing) m.setRaw(x, y, z, mat('ring'), partId.ring);
      else m.setRaw(x, y, z, mat('culm'), partId.culm);
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 4.4, headZ: 8, centerZ: 4 });
  }

  // 2) 复用中段竹节（8×8×9，symDeg: 90，明黄象牙白竹节环 + 深暗节沟 + 深碧竹身）
  function buildBambooSeg(makeCanvas) {
    const m = new VoxelModel(8, 8, 9, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-3.5, 3.5, -3.5, 3.5, 0, 8, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const isNode = (z === 7);
      const isRing = (z === 6 || z === 8);
      const rad = isNode ? 2.85 : (isRing ? 2.15 : 2.35);
      if (r > rad) return;
      if (isNode) m.setRaw(x, y, z, mat('node'), partId.node);
      else if (isRing) m.setRaw(x, y, z, mat('ring'), partId.ring);
      else m.setRaw(x, y, z, mat('culm'), partId.culm);
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.9, headZ: 8, centerZ: 4 });
  }

  // 3) 顶梢簇叶件（18×18×12，symDeg: 90，4 重对称细长竹叶簇，可降 opacity 防遮挡）
  function buildBambooTip(makeCanvas) {
    const m = new VoxelModel(18, 18, 12, SPEC);
    const { mat, partId } = SPEC;

    // 细竹梢竿 + 顶竹节环
    m.paintCapsule(0, 0, 0.5, 0, 0, 8.6, 1.95, 1.25, mat('culm'), partId.culm, true);
    m.paintEllipsoid(0, 0, 4.4, 2.25, 2.25, 0.72, mat('node'), partId.node, true);
    m.paintEllipsoid(0, 0, 3.4, 1.90, 1.90, 0.55, mat('ring'), partId.ring, true);

    // 4 重对称两层细长竹叶簇（下层长叶外展 + 上层嫩叶翘起）
    for (let k = 0; k < 4; k++) {
      const a1 = k * (Math.PI * 0.5) + 0.25;
      const a2 = a1 + Math.PI * 0.25;
      m.paintCapsule(
        Math.cos(a1) * 1.4, Math.sin(a1) * 1.4, 5.2,
        Math.cos(a1) * 7.8, Math.sin(a1) * 7.8, 7.6,
        1.15, 0.45, mat('leaf'), partId.leaf, true
      );
      m.paintCapsule(
        Math.cos(a2) * 1.2, Math.sin(a2) * 1.2, 7.2,
        Math.cos(a2) * 6.4, Math.sin(a2) * 6.4, 10.6,
        0.95, 0.42, mat('leaf'), partId.leaf, true
      );
    }
    // 顶部一簇嫩芽叶蓬
    m.paintEllipsoid(0, 0, 10.2, 2.6, 2.6, 1.5, mat('leaf'), partId.leaf, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.8, headZ: 11, centerZ: 6 });
  }

  // 4) 破土肥胖竹笋（8×8×10，symDeg: 90，赭褐交错笋壳 + 鲜嫩象牙白尖）
  function buildShootPiece(makeCanvas) {
    const m = new VoxelModel(8, 8, 10, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-3.5, 3.5, -3.5, 3.5, 0, 9, (x, y, z, X, Y) => {
      const t = z / 9;
      const r = Math.hypot(X, Y);
      // 底座一圈破土碎泥
      if (z === 0 && r <= 3.55) {
        m.setRaw(x, y, z, r > 2.65 ? mat('soil') : mat('husk'), r > 2.65 ? partId.soil : partId.husk);
        return;
      }
      // 肥厚圆锥笋身：底部饱满 2.85 格，向上收尖至 0.65 格
      const rad = lerp(2.85, 0.55, Math.pow(t, 1.12));
      if (r > rad) return;

      if (z >= 7) {
        // 鲜嫩象牙白笋尖
        m.setRaw(x, y, z, mat('tip'), partId.tip);
      } else if (z === 6 && r < rad - 0.55) {
        m.setRaw(x, y, z, mat('tip'), partId.tip);
      } else if ((z === 3 || z === 5) && r > rad - 0.8) {
        // 交错暗色笋壳纹
        m.setRaw(x, y, z, mat('dry'), partId.dry);
      } else {
        m.setRaw(x, y, z, mat('husk'), partId.husk);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 9, centerZ: 4 });
  }

  // 5) 地面散落嫩绿细竹叶垫（16×16×3，symDeg: 90）
  function buildLeafCarpet(makeCanvas) {
    const m = new VoxelModel(16, 16, 3, SPEC);
    const { mat, partId } = SPEC;

    // 4 重对称散落细竹叶与碎笋衣
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI * 0.5) + 0.35;
      const ca = Math.cos(a), sa = Math.sin(a);
      m.paintCapsule(ca * 2.4, sa * 2.4, 0.6, ca * 6.8, sa * 6.8, 0.8, 0.95, 0.45, mat('leaf'), partId.leaf, true);
      const b = a + 0.65;
      m.paintCapsule(Math.cos(b) * 3.8, Math.sin(b) * 3.8, 0.5, Math.cos(b) * 7.2, Math.sin(b) * 7.2, 0.7, 0.78, 0.42, mat('dry'), partId.dry, true);
    }

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 7.4, headZ: 2, centerZ: 1 });
  }

  // 5 根高低错落竹竿排布（第 0 根为主竹竿，支持逐节压弯弹直）
  const STALKS = [
    { lx:  0.0, ly:  2.2, segs: 4, phase: 0.0,  isMain: true,  tipOpacity: 0.92 },
    { lx: -6.8, ly: -1.8, segs: 3, phase: 1.1,  isMain: false, tipOpacity: 0.88 },
    { lx:  6.4, ly: -2.4, segs: 3, phase: 2.3,  isMain: false, tipOpacity: 0.88 },
    { lx: -3.2, ly: -7.2, segs: 2, phase: 3.6,  isMain: false, tipOpacity: 0.94 },
    { lx:  4.2, ly:  6.8, segs: 2, phase: 4.9,  isMain: false, tipOpacity: 0.94 }
  ];

  // 3 根破土肥胖竹笋排布（呼应 T12 咔哒拔高）
  const SHOOTS = [
    { lx:  7.8, ly:  4.6, baseLift: 0.0, growMax: 7.5, delay: 0.00 },
    { lx: -7.6, ly:  5.2, baseLift: 0.0, growMax: 6.2, delay: 0.14 },
    { lx:  0.8, ly: -8.6, baseLift: 0.0, growMax: 5.4, delay: 0.28 }
  ];

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t12_bamboo_clump',
    code: 'T12',
    name: '脆节高竹丛与嫩笋',
    status: 'done',
    defaultHabitat: 'bamboo',
    tag: 'T12 翠绿竹林 · 可压弯弹直竹丛',
    summary: '5 根高低错落的深碧翠竹（复用 2 种竹节小件 + 半透防遮挡簇叶梢）配 3 根褐壳白尖肥嫩竹笋，主竹竿支持像树5一样逐节弯弧再啪地弹直，嫩笋支持咔哒咔哒一节节拔高抖泥',
    footRadius: 12.5,
    ecoWeight: 3.0,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',       name: '清风过竹',     loop: true,  status: 'done' },
      { id: 'bend_snap',  name: '压弯弹直',     loop: false, duration: 2.2, status: 'done' },
      { id: 'grow_crack', name: '嫩笋咔哒拔节', loop: false, duration: 2.4, status: 'done' }
    ],
    blocks: ['复用分节高竹丛', '主竹竿逐节压弯弹直弹簧', '破土肥嫩竹笋咔哒拔节'],
    soulHabit: '清风过竹梢轻摇偶飘细叶；主竹竿被压弯成大弧蓄满力后啪地瞬间弹直高频回颤，抖落一阵竹叶与水珠；根旁嫩笋呼应 T12 生态规矩咔哒咔哒一节节拔高抖泥',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        bambooRoot: buildBambooRoot(makeCanvas),
        bambooSeg:  buildBambooSeg(makeCanvas),
        bambooTip:  buildBambooTip(makeCanvas),
        shootPiece: buildShootPiece(makeCanvas),
        leafCarpet: buildLeafCarpet(makeCanvas)
      };

      // 主竹竿压弯弹直弹簧（高刚度低阻尼 -> 松手啪地弹直并高频回颤！）
      const mainBendSpring = new SpringDamper1D(0, 380, 6.2);

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        mainBend: 0,
        swayX: 0,
        swayY: 0,
        snapTremor: 0,
        shootLifts: [0, 0, 0],
        shootJitters: [0, 0, 0],
        leafClock: 0.85,
        lastAction: 'idle',
        snapFired: false,
        crackStepFired: [0, 0, 0]
      };

      let curSkin = SKINS[0];

      // 沿圆弧计算主竹竿第 kFrac (0..1) 处的局部偏移与高度（与 tree5_bamboo_launcher 一致）
      function evalArcOffset(kFrac, totalH, bendVal) {
        const theta = bendVal * 1.12;
        const s = clamp(kFrac, 0, 1);
        if (Math.abs(theta) < 1e-3) {
          return { horiz: 0, vert: totalH * s };
        }
        const R = totalH / theta;
        const a = theta * s;
        return {
          horiz: R * (1 - Math.cos(a)),
          vert: Math.max(0.5, R * Math.sin(a))
        };
      }

      function spawnBambooLeaf(vfx, wx, wy, wz, sMul, burst) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const a = Math.random() * TAU;
        const spd = (burst ? (5.5 + Math.random() * 8.5) : (2.0 + Math.random() * 2.5)) * sMul;
        vfx.spawnParticle(
          wx + (Math.random() - 0.5) * 4 * sMul,
          wy + (Math.random() - 0.5) * 4 * sMul,
          wz,
          Math.cos(a) * spd + 1.5 * sMul,
          Math.sin(a) * spd,
          (burst ? (3.5 + Math.random() * 4.5) : -1.2) * sMul,
          1.35 + Math.random() * 0.75,
          1.35 + Math.random() * 0.35,
          Math.random() > 0.45 ? fx.leafA : fx.leafB,
          false,
          8.5
        );
      }

      function spawnWaterDrop(vfx, wx, wy, wz, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const a = Math.random() * TAU;
        const spd = (4.5 + Math.random() * 7.5) * sMul;
        vfx.spawnParticle(
          wx, wy, wz,
          Math.cos(a) * spd,
          Math.sin(a) * spd,
          (5.0 + Math.random() * 5.0) * sMul,
          0.75 + Math.random() * 0.35,
          1.25,
          fx.drop,
          false,
          36
        );
      }

      function spawnDirtBurst(vfx, wx, wy, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let i = 0; i < 4; i++) {
          const a = (i / 4) * TAU + Math.random() * 0.6;
          vfx.spawnParticle(
            wx + Math.cos(a) * 1.8 * sMul,
            wy + Math.sin(a) * 1.8 * sMul,
            1.4 * sMul,
            Math.cos(a) * (3.2 + Math.random() * 3.0) * sMul,
            Math.sin(a) * (3.2 + Math.random() * 3.0) * sMul,
            (4.5 + Math.random() * 3.5) * sMul,
            0.55 + Math.random() * 0.25,
            1.15,
            fx.dirt,
            false,
            34
          );
        }
      }

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
          mainBendSpring.x = 0;
          mainBendSpring.v = 0;
          state.mainBend = 0;
          state.swayX = 0;
          state.swayY = 0;
          state.snapTremor = 0;
          state.shootLifts = [0, 0, 0];
          state.shootJitters = [0, 0, 0];
          state.leafClock = 0.8;
          state.lastAction = 'idle';
          state.snapFired = false;
          state.crackStepFired = [0, 0, 0];
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.snapFired = false;
            state.crackStepFired = [0, 0, 0];
            if (action !== 'bend_snap') {
              mainBendSpring.v *= 0.25;
            }
          }

          // 1. 清风微摆基准
          const windAmp = 0.42 * clamp(flex, 0.5, 1.2) * sMul;
          state.swayX = Math.sin(time * 1.35 * gFreq) * windAmp;
          state.swayY = Math.cos(time * 1.05 * gFreq) * windAmp * 0.55;

          // 2. 动作分支
          let targetBend = Math.sin(time * 1.35 * gFreq) * 0.045 * clamp(flex, 0.5, 1.3);
          state.snapTremor = 0;

          if (action === 'bend_snap') {
            // 0..1.12s 缓慢压弯成大幅度弧线蓄力 -> 1.12s 啪地瞬间弹直并高频回颤！
            if (actionTime < 1.12) {
              const u = smoothstep(0, 1, clamp(actionTime / 1.08, 0, 1));
              targetBend = u * 1.05 + (u > 0.75 ? Math.sin(actionTime * 42) * 0.025 : 0);
            } else {
              targetBend = 0;
              if (!state.snapFired) {
                state.snapFired = true;
                mainBendSpring.impulse(-22.0 * sp);
                // 弹直瞬间抖落一阵竹叶与水珠
                const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, STALKS[0].lx * sMul, STALKS[0].ly * sMul);
                for (let i = 0; i < 8; i++) {
                  spawnBambooLeaf(vfx, mx, my, (24 + i * 2.2) * sMul, sMul, true);
                }
                for (let i = 0; i < 7; i++) {
                  spawnWaterDrop(vfx, mx, my, (20 + i * 2.5) * sMul, sMul);
                }
              }
              const postT = actionTime - 1.12;
              state.snapTremor = Math.exp(-postT * 4.2) * Math.sin(postT * 38.0) * 0.65 * sMul;
            }
          }

          // 主竹竿弹簧推进
          const stiff = action === 'bend_snap' && actionTime >= 1.12 ? 420 * sp : 180 * sp;
          const damp = action === 'bend_snap' && actionTime >= 1.12 ? clamp(5.8 * dScale, 3.6, 10.0) : 13.5;
          state.mainBend = clamp(mainBendSpring.update(dt, targetBend, stiff, damp), -0.48, 1.18);

          // 3. grow_crack：3 根嫩笋咔哒咔哒一节节拔高抖泥（4 档棘轮顿挫！）
          for (let i = 0; i < SHOOTS.length; i++) {
            const sh = SHOOTS[i];
            if (action === 'grow_crack') {
              const localT = clamp(actionTime - sh.delay, 0, 2.4);
              const steps = 4;
              if (localT < 1.65) {
                const segDur = 1.65 / steps;
                const stepIdx = Math.min(steps - 1, Math.floor(localT / segDur));
                const frac = clamp((localT - stepIdx * segDur) / segDur, 0, 1);
                // 棘轮式快顶 + 小回弹停顿
                const snapEase = frac < 0.24
                  ? smoothstep(0, 1, frac / 0.24) * 1.12
                  : (frac < 0.42 ? lerp(1.12, 1.0, (frac - 0.24) / 0.18) : 1.0);
                const level = (stepIdx + snapEase) / steps;
                state.shootLifts[i] = level * sh.growMax * sMul;
                state.shootJitters[i] = frac < 0.28 ? Math.sin(frac * 45) * 0.48 * sMul : 0;

                if (stepIdx + 1 > state.crackStepFired[i]) {
                  state.crackStepFired[i] = stepIdx + 1;
                  const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, sh.lx * sMul, sh.ly * sMul);
                  spawnDirtBurst(vfx, sx, sy, sMul);
                }
              } else {
                // 动作尾段平滑回落到常态高度准备下一次演示
                const retU = smoothstep(1.65, 2.35, localT);
                state.shootLifts[i] = lerp(sh.growMax * sMul, 0, retU);
                state.shootJitters[i] = 0;
              }
            } else {
              state.shootLifts[i] = lerp(state.shootLifts[i], 0, clamp(dt * 8.0, 0, 1));
              state.shootJitters[i] = 0;
            }
          }

          // 4. 常态清风偶飘细长竹叶粒
          if (action === 'idle') {
            state.leafClock -= dt;
            if (state.leafClock <= 0) {
              state.leafClock = 1.35 + Math.random() * 1.25;
              spawnBambooLeaf(vfx, state.x, state.y, (26 + Math.random() * 12) * sMul, sMul, false);
            }
          }
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;

          // 1. 地面散落细竹叶垫
          list.push({
            partKey: 'leafCarpet',
            asset: parts.leafCarpet,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            bias: -0.60,
            symDeg: 90
          });

          // 2. 5 根高低错落的翠绿分节高竹（共用 bambooRoot / bambooSeg / bambooTip）
          for (let si = 0; si < STALKS.length; si++) {
            const st = STALKS[si];
            const [bx, by] = localToWorldXY(state.x, state.y, yw, st.lx * sMul, st.ly * sMul);
            const totalH = (st.segs + 1) * 7.2 * sMul;

            // 根节稳扎地面
            list.push({
              partKey: 'bambooRoot',
              asset: parts.bambooRoot,
              x: bx,
              y: by,
              lift: 0,
              ro: wrapAngle(yw + st.phase * 0.4),
              bias: -0.35 + si * 0.02,
              symDeg: 90
            });

            if (st.isMain) {
              // 主竹竿：按圆弧逐节压弯与弹直
              for (let k = 1; k <= st.segs; k++) {
                const frac = k / (st.segs + 1);
                const arc = evalArcOffset(frac, totalH, state.mainBend);
                const [px, py] = localToWorldXY(bx, by, yw, arc.horiz, 0);
                list.push({
                  partKey: 'bambooSeg',
                  asset: parts.bambooSeg,
                  x: px,
                  y: py,
                  lift: Math.max(1.0, arc.vert - 1.2 * sMul),
                  ro: yw,
                  bias: 0.10 + k * 0.08,
                  symDeg: 90
                });
              }
              const tipArc = evalArcOffset(1.0, totalH, state.mainBend);
              const [tx, ty] = localToWorldXY(bx, by, yw, tipArc.horiz, 0);
              list.push({
                partKey: 'bambooTip',
                asset: parts.bambooTip,
                x: tx,
                y: ty,
                lift: Math.max(2.0, tipArc.vert - 1.0 * sMul),
                ro: wrapAngle(yw + state.mainBend * 0.35),
                opacity: st.tipOpacity,
                bias: 0.72,
                symDeg: 90
              });
            } else {
              // 伴生高竹：清风错相轻摇 + 主竹弹直时受余震微颤
              const ph = st.phase;
              const topDx = (state.swayX * Math.cos(ph * 0.5) + state.snapTremor * 0.55);
              const topDy = (state.swayY * Math.sin(ph * 0.5));
              for (let k = 1; k <= st.segs; k++) {
                const frac = k / (st.segs + 1);
                const w = frac * frac;
                list.push({
                  partKey: 'bambooSeg',
                  asset: parts.bambooSeg,
                  x: bx + topDx * w,
                  y: by + topDy * w,
                  lift: k * 7.2 * sMul,
                  ro: wrapAngle(yw + ph * 0.35),
                  bias: -0.10 + si * 0.04 + k * 0.06,
                  symDeg: 90
                });
              }
              list.push({
                partKey: 'bambooTip',
                asset: parts.bambooTip,
                x: bx + topDx,
                y: by + topDy,
                lift: (st.segs + 1) * 7.0 * sMul,
                ro: wrapAngle(yw + ph * 0.6),
                opacity: st.tipOpacity,
                bias: 0.45 + si * 0.04,
                symDeg: 90
              });
            }
          }

          // 3. 3 根破土肥胖竹笋（呼应 T12 咔哒一节节拔高）
          for (let i = 0; i < SHOOTS.length; i++) {
            const sh = SHOOTS[i];
            const [sx, sy] = localToWorldXY(state.x, state.y, yw, sh.lx * sMul, sh.ly * sMul);
            const liftVal = sh.baseLift * sMul + state.shootLifts[i];
            // 拔高超过 4 格时在笋底补一节竹段露出新拔出的脆嫩竹节！
            if (liftVal > 3.8 * sMul) {
              list.push({
                partKey: 'bambooSeg',
                asset: parts.bambooSeg,
                x: sx + state.shootJitters[i] * 0.5,
                y: sy,
                lift: Math.max(0, liftVal - 6.8 * sMul),
                ro: wrapAngle(yw + i * 1.1),
                bias: -0.22,
                symDeg: 90
              });
            }
            list.push({
              partKey: 'shootPiece',
              asset: parts.shootPiece,
              x: sx + state.shootJitters[i],
              y: sy,
              lift: liftVal,
              ro: wrapAngle(yw + i * 1.4),
              bias: -0.15 + i * 0.03,
              symDeg: 90
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

  PW.Assets.register(Def, 'scene');
})(window.PixelWorkshop);
