'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, localToWorldXY, pivotToWorldXY, expSmooth } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SpringDamper3D, SocketTracker } = PW.Solvers;
  const { Propulsion } = PW.Behaviors;

  // =========================================================================
  // 天2 · 无脸红囊（v3 高精锐利骨骼化纯生态版，+Y 正前）
  // 严格遵循防糊与精制标杆：
  //   1. 彻底取消常态小数 scaleX/scaleY 拉伸，改以 3 档无损烘焙囊体（舒展/鼓胀/收缩）
  //      配合二阶弹簧滞回切换与高度起伏，全程 1:1 像素锐利无抖动
  //   2. 帝江 × 僧帽水母无脸轮廓：6 瓣肉囊 + 经纬脉络暗缝 + S 形褶皱气冠 + 底部 6 座囊口
  //   3. 4 片扇贝弧边薄膜翅（paintWingQuad + 放射细脉翼骨 + 深嵌肩窝），up/mid/down 三段锁枢轴
  //   4. 6 条 5 节细长级联弹簧垂腿，转弯甩出水母弧线，蓄气上收、喷气微跃舒展飘红孢
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      sacDark:      '#751926',
      sacMid:       '#c4303e',
      sacHi:        '#f56f6c',
      veinDark:     '#470e18',
      veinMid:      '#821f30',
      veinHi:       '#bd4656',
      crestDark:    '#9e404c',
      crestMid:     '#d9757a',
      crestHi:      '#fad0c8',
      collarDark:   '#5e242c',
      collarMid:    '#9e4b52',
      collarHi:     '#de8e8c',
      shdDark:      '#541620',
      shdMid:       '#8f2936',
      shdHi:        '#c75058',
      wingDark:     '#993c48',
      wingMid:      '#db7072',
      wingHi:       '#fcc2b8',
      ribDark:      '#4d121d',
      ribMid:       '#872634',
      ribHi:        '#bd4d58',
      legDark:      '#4f1a28',
      legMid:       '#8c3348',
      legHi:        '#cc6678',
      tipDark:      '#a64c5a',
      tipMid:       '#e3888e',
      tipHi:        '#ffd0cc',
      emissiveMid:  '#ff5e4d',
      emissiveHot:  '#ffad66',
      emissiveCore: '#fff3c4'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'sac', 'vein', 'crest', 'collar', 'shoulder',
      'wingMem', 'wingRib', 'leg', 'legTip', 'core'
    ],
    noCrease: [
      ['sac', 'core'], ['crest', 'core'], ['leg', 'legTip'],
      ['legTip', 'core'], ['wingMem', 'wingRib']
    ],
    materials: {
      sac:    ['sacDark',    'sacMid',    'sacHi'],
      vein:   ['veinDark',   'veinMid',   'veinHi'],
      crest:  ['crestDark',  'crestMid',  'crestHi'],
      collar: ['collarDark', 'collarMid', 'collarHi'],
      shd:    ['shdDark',    'shdMid',    'shdHi'],
      wing:   ['wingDark',   'wingMid',   'wingHi'],
      rib:    ['ribDark',    'ribMid',    'ribHi'],
      leg:    ['legDark',    'legMid',    'legHi'],
      tip:    ['tipDark',    'tipMid',    'tipHi']
    },
    protectedParts: ['core', 'vein', 'wingRib']
  });

  const SKINS = [
    {
      id: 'crimson', name: '朱红肉囊', dot: '#d93848', outline: '#1c080e', pal: {},
      fx: { spore: '#ffad66' }
    },
    {
      id: 'peach', name: '霜桃粉囊', dot: '#f08998', outline: '#210e16',
      pal: {
        sacDark: '#993d54', sacMid: '#de738a', sacHi: '#ffbac6',
        veinDark: '#692238', veinMid: '#a3425d', veinHi: '#db7690',
        crestDark: '#b06478', crestMid: '#e39cb0', crestHi: '#ffe0e8',
        collarDark: '#7a3b4d', collarMid: '#ba6c80', collarHi: '#f0b3c0',
        shdDark: '#732940', shdMid: '#ad4964', shdHi: '#e07e96',
        wingDark: '#b0566e', wingMid: '#e890a4', wingHi: '#ffd6df',
        ribDark: '#631f34', ribMid: '#9c3e58', ribHi: '#cf6e88',
        legDark: '#6b283f', legMid: '#a64d68', legHi: '#de8ca2',
        tipDark: '#b86c82', tipMid: '#eda8ba', tipHi: '#ffe3ea',
        emissiveMid: '#ff7d9e', emissiveHot: '#ffc480', emissiveCore: '#fff6cf'
      },
      fx: { spore: '#ffc480' }
    },
    {
      id: 'plum', name: '紫藤闷囊', dot: '#8d52c4', outline: '#12081f',
      pal: {
        sacDark: '#47216b', sacMid: '#7d3fb5', sacHi: '#bd82ed',
        veinDark: '#2b1047', veinMid: '#542682', veinHi: '#8a52bd',
        crestDark: '#6e4c99', crestMid: '#a37ec9', crestHi: '#e0cef5',
        collarDark: '#3f225e', collarMid: '#6e4696', collarHi: '#ad87d4',
        shdDark: '#351754', shdMid: '#60328f', shdHi: '#9665c7',
        wingDark: '#6c3e9e', wingMid: '#a372d6', wingHi: '#dfc4fa',
        ribDark: '#2a0f45', ribMid: '#562980', ribHi: '#8856b5',
        legDark: '#361a57', legMid: '#643894', legHi: '#9e70cf',
        tipDark: '#7c4da8', tipMid: '#b88ae0', tipHi: '#ebd4ff',
        emissiveMid: '#b554ff', emissiveHot: '#e099ff', emissiveCore: '#f9e6ff'
      },
      fx: { spore: '#e099ff' }
    },
    {
      id: 'jade', name: '碧琉璃囊', dot: '#38b5a6', outline: '#081b1c',
      pal: {
        sacDark: '#135759', sacMid: '#268f8b', sacHi: '#6ed6c8',
        veinDark: '#0a3638', veinMid: '#166161', veinHi: '#349994',
        crestDark: '#30827d', crestMid: '#63bfb6', crestHi: '#c4f5ec',
        collarDark: '#1b5957', collarMid: '#3c918b', collarHi: '#85d1c8',
        shdDark: '#0f474a', shdMid: '#217875', shdHi: '#4eb3ab',
        wingDark: '#257d7a', wingMid: '#52b8b0', wingHi: '#aef0e6',
        ribDark: '#0c3b3d', ribMid: '#1b6969', ribHi: '#3ca39c',
        legDark: '#164d52', legMid: '#2e8085', legHi: '#6cc0c2',
        tipDark: '#479494', tipMid: '#85d4d1', tipHi: '#cffaf6',
        emissiveMid: '#24d4c2', emissiveHot: '#7effea', emissiveCore: '#e0fff9'
      },
      fx: { spore: '#7effea' }
    }
  ];

  // 扇贝弧边薄膜翅曲面绘制器（对齐飞龙宽翼算法）
  function paintWingQuad(m, p00, p10, p11, p01, halfThick, val, partId, scallop = 0, overwrite = false) {
    const pts = [p00, p10, p11, p01];
    let x0 = 999, x1 = -999, y0 = 999, y1 = -999, z0 = 999, z1 = -999;
    for (const p of pts) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
      if (p[2] < z0) z0 = p[2]; if (p[2] > z1) z1 = p[2];
    }
    const pad = halfThick + 1.0;
    const ux = p10[0] - p00[0], uSign = ux >= 0 ? 1 : -1;
    const spanX = Math.max(0.5, Math.abs(ux));
    m.fillAABB(x0 - 0.6, x1 + 0.6, y0 - 0.8, y1 + 0.8, z0 - pad, z1 + pad, (x, y, z, X, Y) => {
      const i = m.idx(x, y, z);
      if (!overwrite && m.grid[i]) return;
      const u = clamp(uSign > 0 ? (X - p00[0]) / spanX : (p00[0] - X) / spanX, 0, 1);
      const ly = lerp(p00[1], p10[1], u), lz = lerp(p00[2], p10[2], u);
      const ty = lerp(p01[1], p11[1], u) + scallop * Math.sin(u * Math.PI * 2);
      const tz = lerp(p01[2], p11[2], u);
      if (Y < Math.min(ly, ty) - 0.35 || Y > Math.max(ly, ty) + 0.35) return;
      const v = clamp((ly - Y) / Math.max(0.5, ly - ty), 0, 1);
      if (Math.abs(z - lerp(lz, tz, v)) <= halfThick) {
        m.grid[i] = val;
        m.parts[i] = partId;
      }
    });
  }

  // 1. 3 档无损烘焙无脸红囊（24×24×24：舒展 normal / 鼓胀 inflate / 收缩 contract）
  function buildSac(makeCanvas, morph) {
    const W = 24, D = 24, H = 24;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    const cfg = morph === 'inflate'
      ? { cz: 10.6, rx: 8.2, ry: 8.5, rz: 6.8, lobe: 0.08, crestLift: 3.2, collarZ: 4.0, collarR: 3.6, coreR: 2.3, shdR: 7.4 }
      : morph === 'contract'
        ? { cz: 11.2, rx: 6.2, ry: 6.6, rz: 7.4, lobe: 0.12, crestLift: 2.6, collarZ: 3.4, collarR: 4.1, coreR: 2.0, shdR: 5.8 }
        : { cz: 10.8, rx: 7.3, ry: 7.6, rz: 6.5, lobe: 0.10, crestLift: 2.9, collarZ: 3.8, collarR: 3.8, coreR: 1.9, shdR: 6.7 };

    // (A) 6 瓣无脸肉囊 + 6 条纵向分瓣筋线 + 赤道张力环
    m.fillAABB(-9.5, 9.5, -9.5, 9.5, 2, 20, (x, y, z, X, Y) => {
      const dz = z - cfg.cz;
      const zNorm = clamp(dz / cfg.rz, -1.2, 1.2);
      const taper = zNorm < 0 ? (1 + zNorm * 0.24) : (1 - zNorm * 0.08);
      const ang = Math.atan2(Y, X);
      const lobe = 1 + Math.cos(ang * 6) * cfg.lobe * (1 - Math.abs(zNorm) * 0.42);
      const d = Math.hypot(X / (cfg.rx * taper * lobe), Y / (cfg.ry * taper * lobe), dz / cfg.rz);
      if (d > 1.0) return;
      const isVein = (Math.cos(ang * 6) < -0.78 && Math.abs(zNorm) < 0.82 && d > 0.78)
        || (Math.abs(zNorm + 0.16) < 0.09 && d > 0.82);
      m.setRaw(x, y, z, isVein ? mat('vein') : mat('sac'), isVein ? partId.vein : partId.sac);
    });

    // (B) 囊顶僧帽水母 S 形褶皱弧形气冠脊棱
    const crestBaseZ = cfg.cz + cfg.rz * 0.70;
    m.fillAABB(-4.0, 4.0, -7.8, 7.8, Math.floor(crestBaseZ - 1), H - 2, (x, y, z, X, Y) => {
      const u = Y / (cfg.ry * 0.86);
      if (Math.abs(u) > 1.0) return;
      const sCurveX = Math.sin(u * Math.PI * 1.15) * 0.9;
      const arch = Math.cos(u * Math.PI * 0.5);
      const pleat = 0.36 * Math.sin(u * Math.PI * 5.0);
      const topZ = crestBaseZ + (cfg.crestLift + pleat) * Math.pow(Math.max(0, arch), 0.72);
      if (z < crestBaseZ - 0.5 || z > topZ) return;
      const hFrac = clamp((z - crestBaseZ) / Math.max(0.8, topZ - crestBaseZ), 0, 1);
      const halfThick = lerp(1.5, 0.62, hFrac) * (0.75 + 0.25 * arch);
      if (Math.abs(X - sCurveX) <= halfThick) {
        m.setRaw(x, y, z, mat('crest'), partId.crest);
      }
    });

    // (C) 囊顶自亮气核（仅此部位进 glowKeys）
    const coreZ = cfg.cz + cfg.rz * 0.62;
    m.paintEllipsoid(0, 0.3, coreZ, cfg.coreR, cfg.coreR * 1.18, cfg.coreR * 0.68, keyToId.emissiveMid, partId.core, true);
    m.paintEllipsoid(0, 0.4, coreZ + 0.4, cfg.coreR * 0.66, cfg.coreR * 0.78, cfg.coreR * 0.50, keyToId.emissiveHot, partId.core, true);
    m.paintEllipsoid(0, 0.5, coreZ + 0.7, cfg.coreR * 0.38, cfg.coreR * 0.42, cfg.coreR * 0.34, keyToId.emissiveCore, partId.core, true);

    // (D) 底部 6 瓣收束囊口 + 6 枚垂须根座
    m.fillAABB(-5.5, 5.5, -5.5, 5.5, 2, 7, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const dz = z - cfg.collarZ;
      if (Math.abs(dz) > 1.55) return;
      const ang = Math.atan2(Y, X);
      const outerR = cfg.collarR * (1 + 0.16 * Math.cos(ang * 6)) * (1 - Math.abs(dz) * 0.12);
      const innerR = outerR * (morph === 'contract' ? 0.45 : 0.30);
      if (r <= outerR && r >= innerR) m.setRaw(x, y, z, mat('collar'), partId.collar);
    });
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6;
      m.paintEllipsoid(Math.cos(a) * cfg.collarR * 0.82, Math.sin(a) * cfg.collarR * 0.82, cfg.collarZ - 0.5, 1.1, 1.1, 1.05, mat('collar'), partId.collar, true);
    }

    // (E) 4 处侧腹翼根肩窝垫
    for (const s of [-1, 1]) {
      for (const ly of [2.4, -2.4]) {
        m.paintEllipsoid(s * cfg.shdR * 0.90, ly, cfg.cz + 0.5, 1.55, 1.4, 1.4, mat('shd'), partId.shoulder, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.5, headZ: 22, centerZ: 11 });
  }

  // 2. 扇贝弧边薄膜翅（18×16×14 零裁切，up/mid/down 三段，翼根锁于 (-side*5.2, 0.8)）
  const WING_PIVOT = { x: 5.2, y: 0.8 };
  function buildWing(makeCanvas, side, pose) {
    const m = new VoxelModel(18, 16, 14, SPEC);
    const { mat, partId } = SPEC;
    const rx = -side * WING_PIVOT.x, ry = WING_PIVOT.y;
    const rz = pose === 'up' ? 4.6 : (pose === 'down' ? 8.8 : 6.6);
    const tipLift = pose === 'up' ? 4.6 : (pose === 'down' ? -4.4 : 0.4);

    const pRoot  = [rx, ry + 1.0, rz];
    const pTip   = [rx + side * 9.8, ry + 2.6, rz + tipLift];
    const pBackT = [rx + side * 8.4, ry - 4.4, rz + tipLift * 0.72];
    const pBackR = [rx + side * 0.4, ry - 3.6, rz - 0.6];

    paintWingQuad(m, pRoot, pTip, pBackT, pBackR, 1.05, mat('wing'), partId.wingMem, 0.95, false);

    // 放射细脉翼骨 + 深嵌肩垫
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pTip[0], pTip[1], pTip[2], 1.12, 0.72, mat('rib'), partId.wingRib, true);
    const midX = lerp(pBackR[0], pBackT[0], 0.58), midY = lerp(pBackR[1], pBackT[1], 0.58), midZ = lerp(pBackR[2], pBackT[2], 0.58);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], midX, midY, midZ, 0.82, 0.55, mat('rib'), partId.wingRib, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pBackT[0], pBackT[1], pBackT[2], 0.78, 0.52, mat('rib'), partId.wingRib, true);
    m.paintEllipsoid(rx, ry - 0.4, rz, 1.65, 1.85, 1.45, mat('shd'), partId.shoulder, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5 });
  }

  // 3. 5 节细长渐变垂腿节（根节 -> 上节 -> 中节 -> 下节 -> 细小自亮末梢珠）
  function buildLegNode(makeCanvas, r, lenMul, isTip) {
    const S = Math.ceil(r * 2 + 4);
    const H = Math.ceil(r * 2 * lenMul + 4);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const cz = H * 0.5;
    m.paintEllipsoid(0, 0, cz, r, r, r * lenMul, mat(isTip ? 'tip' : 'leg'), isTip ? partId.legTip : partId.leg, true);
    if (isTip) {
      m.paintEllipsoid(0, 0, cz - 0.5, r * 0.62, r * 0.62, r * 0.62, keyToId.emissiveHot, partId.core, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: r });
  }

  const Sky2Def = {
    id: 'sky2_red_sac',
    name: '天2 · 无脸红囊',
    tag: '软体多态无脸囊',
    summary: 'v3 锐利精制：3 档无损烘焙无脸红囊（气冠+6瓣脉络）+ 4 片扇贝弧边三段膜翅 + 6 条 5 节细长垂腿',
    defaultHabitat: 'sky',
    footRadius: 8.5,
    ecoWeight: 0.75,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: ['3 档无损囊体形态', '僧帽褶皱气冠', '4 片扇贝三段膜翅', '6 条 5 节弹簧垂腿', '鼓胀喷气微跃'],
    soulHabit: '气流漂浮 → 红囊鼓胀蓄气收腿 → 收缩喷气微跃拍翅飘红孢',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        sacNormal:   buildSac(makeCanvas, 'normal'),
        sacInflate:  buildSac(makeCanvas, 'inflate'),
        sacContract: buildSac(makeCanvas, 'contract'),
        wingLUp:     buildWing(makeCanvas, -1, 'up'),
        wingLMid:    buildWing(makeCanvas, -1, 'mid'),
        wingLDown:   buildWing(makeCanvas, -1, 'down'),
        wingRUp:     buildWing(makeCanvas,  1, 'up'),
        wingRMid:    buildWing(makeCanvas,  1, 'mid'),
        wingRDown:   buildWing(makeCanvas,  1, 'down'),
        legRoot:     buildLegNode(makeCanvas, 1.48, 1.25, false),
        legUpper:    buildLegNode(makeCanvas, 1.28, 1.32, false),
        legMid:      buildLegNode(makeCanvas, 1.12, 1.35, false),
        legLower:    buildLegNode(makeCanvas, 0.98, 1.35, false),
        legTip:      buildLegNode(makeCanvas, 1.12, 1.15, true)
      };

      // 6 条 5 节细长级联弹簧垂腿
      const legChains = [];
      for (let i = 0; i < 6; i++) {
        const ang = (i / 6) * TAU + Math.PI / 6;
        legChains.push({
          lx: Math.cos(ang) * 3.1,
          ly: Math.sin(ang) * 3.1,
          phase: i * 1.05,
          nodes: [
            new SpringDamper3D(0, 0, 14.0, 110, 7.8),
            new SpringDamper3D(0, 0, 11.8,  84, 6.4),
            new SpringDamper3D(0, 0,  9.6,  62, 5.2),
            new SpringDamper3D(0, 0,  7.4,  46, 4.4),
            new SpringDamper3D(0, 0,  5.2,  34, 3.6)
          ]
        });
      }

      const wingSprings = [
        new SpringDamper1D(0, 120, 7.8),
        new SpringDamper1D(0, 100, 7.2),
        new SpringDamper1D(0, 120, 7.8),
        new SpringDamper1D(0, 100, 7.2)
      ];
      // 用弹簧平滑驱动囊态指标（+1 鼓胀 / 0 舒展 / -1 收缩），杜绝生硬跳切
      const morphSpring = new SpringDamper1D(0, 68, 6.4);

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 17.5,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        phase: 0,
        habitTimer: opts.seed ? (opts.seed % 6.8) : 0,
        sacMorph: 'normal',
        pulsed: false,
        sporeCd: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: Sky2Def,
        cachePrefix: `sky2_v3_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX; state.y = homeY; state.yaw = homeYaw;
          state.z = 17.5; state.vx = 0; state.vy = 0;
          state.sacMorph = 'normal';
          for (const lc of legChains) {
            const [ax, ay] = localToWorldXY(state.x, state.y, state.yaw, lc.lx, lc.ly);
            for (let j = 0; j < lc.nodes.length; j++) {
              lc.nodes[j].reset(ax, ay, Math.max(1.2, state.z - (j + 1) * 2.1));
            }
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = params.springiness ?? 1.0;
          const freq = params.gaitFreq ?? 1.0;
          const flex = params.tailFlex ?? 1.0;

          // 6.8s 连续生态周期（smoothstep 平滑驱动）：
          // 0~3.4s 舒展漂浮 -> 3.4~4.9s 鼓胀蓄气 -> 4.9~5.9s 收缩喷气微跃 -> 5.9~6.8s 舒展回稳
          state.habitTimer = (state.habitTimer + dt) % 6.8;
          const ht = state.habitTimer;
          const inflateCurve  = smoothstep(3.3, 4.1, ht) * (1 - smoothstep(4.6, 5.05, ht));
          const contractCurve = smoothstep(4.85, 5.25, ht) * (1 - smoothstep(5.75, 6.25, ht));
          const targetMorph = inflateCurve - contractCurve;

          if (contractCurve > 0.55 && !state.pulsed) {
            state.pulsed = true;
            morphSpring.impulse(-3.2 * sp);
          } else if (ht < 3.0) {
            state.pulsed = false;
          }

          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const mVal = morphSpring.update(dt, targetMorph, 68 * sp, clamp(6.4 * dScale, 2.8, 10.5));
          // 带滞回阈值切换 3 档无损烘焙囊体（避免临界点抖动）
          if (state.sacMorph === 'normal') {
            if (mVal > 0.42) state.sacMorph = 'inflate';
            else if (mVal < -0.40) state.sacMorph = 'contract';
          } else if (state.sacMorph === 'inflate') {
            if (mVal < 0.25) state.sacMorph = 'normal';
          } else {
            if (mVal > -0.22) state.sacMorph = 'normal';
          }

          const habitLift = (-inflateCurve * 2.2 + contractCurve * 5.2) * sMul;
          Propulsion.windDrift(state, dt, time, params, {
            ...eco,
            baseLift: 17.5 * sMul + habitLift
          });

          sockets.setLocal('sacBase', state.x, state.y, state.z, state.yaw, 0, 0, 2.8, sMul);

          // 6 条 5 节级联水母弹簧垂腿（蓄气时自然上收，喷气时舒展荡开）
          const tuck = lerp(1.0, 0.72, inflateCurve) * lerp(1.0, 1.12, contractCurve);
          for (const lc of legChains) {
            const [ax, ay] = localToWorldXY(state.x, state.y, state.yaw, lc.lx * sMul, lc.ly * sMul);
            let px = ax, py = ay, pz = state.z + 2.8 * sMul;
            for (let j = 0; j < lc.nodes.length; j++) {
              const nd = lc.nodes[j];
              const swayAmp = (0.95 + j * 0.52) * flex * sMul;
              const swayX = Math.sin(time * 2.4 * freq - j * 0.62 + lc.phase) * swayAmp - state.vx * (0.042 + j * 0.022);
              const swayY = Math.cos(time * 2.1 * freq - j * 0.62 + lc.phase) * swayAmp - state.vy * (0.042 + j * 0.022);
              const tx = px + swayX * 0.48;
              const ty = py + swayY * 0.48;
              const tz = Math.max(0.8, pz - 2.15 * tuck * sMul);
              nd.update(dt, tx, ty, tz, nd.stiffness * sp, clamp(nd.damping * dScale, 2.0, 12.0));
              px = nd.x; py = nd.y; pz = nd.z;
            }
          }

          // 4 片扇贝膜翅滞后拍动（喷气微跃期高频拍动）
          const flapFreq = lerp(3.8, 9.8, contractCurve) * freq;
          const flapAmp  = lerp(0.36, 0.64, contractCurve) * flex;
          for (let w = 0; w < 4; w++) {
            const targetAng = Math.sin(time * flapFreq - (w & 1) * 0.85) * flapAmp;
            wingSprings[w].update(dt, targetAng, 108 * sp, clamp(7.4 * dScale, 2.8, 12.0));
          }

          // 收缩喷气时飘落红孢微粒
          state.sporeCd -= dt;
          if (contractCurve > 0.25 && state.sporeCd <= 0) {
            state.sporeCd = 0.085;
            const base = sockets.get('sacBase');
            vfx.spawnParticle(
              base.x + (Math.random() - 0.5) * 5.5,
              base.y + (Math.random() - 0.5) * 5.5,
              base.z,
              (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, -4.5 - Math.random() * 4,
              0.72, 1.35, curSkin.fx ? curSkin.fx.spore : '#ffad66', true, 3.5
            );
          }
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const bob = Math.sin(state.phase * 1.4) * 0.7 * sMul;

          // 1. 6 条 5 节细长弹簧垂腿（全程 1:1 像素无损）
          const legKeys = ['legRoot', 'legUpper', 'legMid', 'legLower', 'legTip'];
          for (const lc of legChains) {
            for (let j = 0; j < lc.nodes.length; j++) {
              const nd = lc.nodes[j];
              list.push({
                partKey: legKeys[j], asset: parts[legKeys[j]],
                x: nd.x, y: nd.y, lift: Math.max(0.4, nd.z - 1.4 * sMul),
                ro: yw, symDeg: 90, bias: -0.45 - j * 0.05
              });
            }
          }

          // 2. 4 片扇贝弧边三段膜翅（肩根随囊体形态微调，严锁枢轴零脱节）
          const shdSpan = state.sacMorph === 'inflate' ? 6.5 : (state.sacMorph === 'contract' ? 5.1 : 5.9);
          const wingMeta = [
            { side: -1, ly:  2.4, lz: 10.6, idx: 0 },
            { side: -1, ly: -2.4, lz:  9.0, idx: 1 },
            { side:  1, ly:  2.4, lz: 10.6, idx: 2 },
            { side:  1, ly: -2.4, lz:  9.0, idx: 3 }
          ];
          for (const wm of wingMeta) {
            const ang = wingSprings[wm.idx].x;
            const stage = ang > 0.14 ? 'Up' : (ang < -0.14 ? 'Down' : 'Mid');
            const pKey = (wm.side < 0 ? 'wingL' : 'wingR') + stage;
            const [jx, jy] = localToWorldXY(state.x, state.y, yw, wm.side * shdSpan * sMul, wm.ly * sMul);
            const wingYaw = yw + wm.side * ang * 0.52;
            const [wx, wy] = pivotToWorldXY(jx, jy, wingYaw, -wm.side * WING_PIVOT.x * sMul, WING_PIVOT.y * sMul);
            list.push({
              partKey: pKey, asset: parts[pKey],
              x: wx, y: wy, lift: state.z + wm.lz * sMul + bob + ang * 1.4 * sMul,
              ro: wingYaw, bias: 0.28
            });
          }

          // 3. 3 档无损烘焙无脸红囊主体（零小数 scaleX/scaleY 拉伸！）
          const sacKey = state.sacMorph === 'inflate'
            ? 'sacInflate'
            : (state.sacMorph === 'contract' ? 'sacContract' : 'sacNormal');
          list.push({
            partKey: sacKey, asset: parts[sacKey],
            x: state.x, y: state.y, lift: state.z + bob,
            ro: yw, bias: 0.65
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Sky2Def.id, name: Sky2Def.name, outlineMode: 'actorUnified',
            skin: curSkin.id, sacMorph: state.sacMorph,
            footRadius: Sky2Def.footRadius, headZ: 36, centerZ: 24,
            blocks: Sky2Def.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Sky2Def);
})(window.PixelWorkshop);
