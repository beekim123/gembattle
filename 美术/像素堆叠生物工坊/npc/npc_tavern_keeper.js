'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // N04 标杆 · 酒馆吧台老板（生活交互型站桩/柜台标杆，+Y 正前，z=0 贴地）
  // 人类俯视 2.5~3 头身壮实范式（站高约 24 格，头 12×12×11，脚底宽约 11 格）：
  //   1. 宽厚敦实身板：卷袖暖白亚麻衬衫 + 厚实暖棕系带皮围裙（亮铜腰扣 + 侧挂抹布）
  //   2. 高辨识度大叔头：显眼蓬松赤褐大胡子 + 秃顶两侧卷发 + 笑眯眯粗眉大眼 + 红鼻头
  //   3. 大腿深嵌围裙下沿 + MultiLegGaitSolver 稳健二足步态（停步自动收脚，零脱胯）
  //   4. 两段式 FK 手臂（小臂滞后 0.75 rad），右手端泡沫大麦酒木杯、左手抓白擦杯布，
  //      身前配小型木质酒桶台道具件（待机/倒酒/敬酒立身前，巡游收起）
  //   5. 高对比 3 档色阶（≤48 色、0 重色）、glowKeys 为空、严禁常态小数缩放
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      skinDark:    '#c98c6b',
      skinMid:     '#ebb594',
      skinHi:      '#ffdbc2',
      noseRed:     '#d97b68',
      beardDark:   '#632c19',
      beardMid:    '#9e4827',
      beardHi:     '#cf6c3e',
      shirtDark:   '#bdb4a2',
      shirtMid:    '#e8e1d3',
      shirtHi:     '#faf6ee',
      apronDark:   '#4d2c19',
      apronMid:    '#824d2c',
      apronHi:     '#b57245',
      pantsDark:   '#2a2e38',
      pantsMid:    '#434a59',
      pantsHi:     '#656f82',
      bootDark:    '#291910',
      bootMid:     '#472c1c',
      bootHi:      '#6e472f',
      brassDark:   '#8f6015',
      brassMid:    '#d49a2a',
      brassHi:     '#ffd461',
      woodDark:    '#472916',
      woodMid:     '#784826',
      woodHi:      '#ab6c3e',
      aleDark:     '#b57112',
      aleMid:      '#ebb028',
      aleHi:       '#ffe26b',
      foamDark:    '#d6d1c5',
      foamMid:     '#f2efe6',
      foamHi:      '#ffffff',
      eyeDark:     '#141218',
      eyeIris:     '#473020',
      eyeGlint:    '#f5fbff'
    },
    glowKeys: [],
    parts: [
      'boot', 'leg', 'shirt', 'apron', 'brass', 'rag',
      'head', 'nose', 'beard', 'hair', 'eye',
      'upperArm', 'forearm', 'mug', 'ale', 'foam', 'cloth', 'barrel', 'barrelBand'
    ],
    noCrease: [
      ['eye', 'head'], ['nose', 'head'], ['beard', 'head'], ['hair', 'head'],
      ['leg', 'boot'], ['apron', 'brass'], ['apron', 'rag'],
      ['mug', 'ale'], ['mug', 'foam'], ['ale', 'foam'], ['barrel', 'barrelBand']
    ],
    materials: {
      skin:   ['skinDark',   'skinMid',   'skinHi'],
      beard:  ['beardDark',  'beardMid',  'beardHi'],
      shirt:  ['shirtDark',  'shirtMid',  'shirtHi'],
      apron:  ['apronDark',  'apronMid',  'apronHi'],
      pants:  ['pantsDark',  'pantsMid',  'pantsHi'],
      boot:   ['bootDark',   'bootMid',   'bootHi'],
      brass:  ['brassDark',  'brassMid',  'brassHi'],
      wood:   ['woodDark',   'woodMid',   'woodHi'],
      ale:    ['aleDark',    'aleMid',    'aleHi'],
      foam:   ['foamDark',   'foamMid',   'foamHi']
    },
    protectedParts: ['eye', 'foam', 'ale']
  });

  const SKINS = [
    {
      id: 'oak', name: '橡木棕围裙', dot: '#824d2c', outline: '#1a100a',
      pal: {}
    },
    {
      id: 'wine', name: '红酒绛围裙', dot: '#852834', outline: '#1f0c10',
      pal: {
        apronDark: '#52151f', apronMid: '#852834', apronHi: '#b84b58',
        beardDark: '#472518', beardMid: '#753f28', beardHi: '#a66042',
        pantsDark: '#26242b', pantsMid: '#3f3b47', pantsHi: '#5e5969'
      }
    },
    {
      id: 'harbor', name: '海港青围裙', dot: '#286470', outline: '#0c1a1f',
      pal: {
        apronDark: '#163f47', apronMid: '#286470', apronHi: '#4a94a3',
        shirtDark: '#b3bdc4', shirtMid: '#dfe8ed', shirtHi: '#f4f9fc',
        beardDark: '#59341d', beardMid: '#8f5732', beardHi: '#bf8052'
      }
    }
  ];

  const UPPER_ARM_PIVOT = { y: 1.9 };
  const FOREARM_PIVOT   = { y: 1.7 };
  const MUG_PIVOT_Y     = 1.4;

  // 1. 粗壮双腿与结实短靴（大腿深嵌围裙下沿）
  function buildLegSeg(makeCanvas, rTop, rBot, hLen) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 3);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat('pants'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildBoot(makeCanvas) {
    const m = new VoxelModel(8, 9, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0.0, 2.7, 1.55, 1.55, 1.25, mat('pants'), partId.leg, true);
    m.paintEllipsoid(0, 1.0, 1.35, 1.95, 2.65, 1.35, mat('boot'), partId.boot, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8 });
  }

  // 2. 壮实大叔躯干（暖白亚麻衬衫 + 厚实系带皮围裙 + 亮铜腰扣 + 侧挂抹布）
  function buildTorso(makeCanvas) {
    const m = new VoxelModel(15, 13, 13, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-6.4, 6.4, -5.6, 5.6, 0, 12, (x, y, z, X, Y) => {
      const dBelly = (Math.hypot(X / 5.5, (Y - 0.3) / 4.8, (z - 6.6) / 4.9) - 1) * 4.5;
      const dChest = (Math.hypot(X / 5.7, Y / 4.3, (z - 9.2) / 3.2) - 1) * 3.6;
      const dNeck  = (Math.hypot(X / 2.6, Y / 2.4, (z - 11.4) / 1.8) - 1) * 1.8;
      if (smin(smin(dBelly, dChest, 1.4), dNeck, 1.0) <= 0) {
        m.setRaw(x, y, z, z >= 10.8 ? mat('skin') : mat('shirt'), partId.shirt);
      }
      // 围裙下摆与胸兜（z=1..10，深包大腿根）
      const rApron = Math.hypot(X / 5.85, (Y - 0.3) / 5.1);
      if (z >= 1 && z <= 5.8 && rApron <= 1.0 && rApron >= 0.56) {
        if (Y >= -1.2 || Math.abs(X) >= 3.2) {
          m.setRaw(x, y, z, mat('apron'), partId.apron);
        }
      }
      if (z >= 5.5 && z <= 9.8 && Y >= 2.2 && Math.abs(X) <= 3.6 && rApron <= 1.04) {
        m.setRaw(x, y, z, mat('apron'), partId.apron);
      }
    });
    // 围裙背带与腰带
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 2.6, 3.2, 9.5, s * 2.8, -3.0, 9.6, 0.88, 0.88, mat('apron'), partId.apron, true);
    }
    m.fillAABB(-6.0, 6.0, -5.2, 5.2, 5, 6, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 5.75, (Y - 0.2) / 4.95);
      if (r <= 1.02 && r >= 0.78) m.setRaw(x, y, z, mat('apron'), partId.apron);
    });
    // 亮铜腰扣
    m.paintEllipsoid(0, 4.9, 5.5, 1.35, 0.8, 1.15, mat('brass'), partId.brass, true);
    // 右腰侧挂白抹布角
    m.paintCapsule(5.1, 1.6, 5.2, 5.4, 1.8, 2.0, 1.15, 0.95, mat('shirt'), partId.rag, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.0 });
  }

  // 3. 壮实大叔头（秃顶 + 两侧蓬松赤褐卷发 + 浓眉笑眼 + 圆红鼻头 + 显眼蓬松赤褐大胡子）
  function buildHead(makeCanvas) {
    const W = 12, D = 12, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hz = 5.0, hy = 0.0;
    // 圆润宽厚头颅（头顶圆润秃顶）
    m.paintEllipsoid(0, hy, hz, 4.4, 4.3, 4.3, mat('skin'), partId.head, true);
    // 秃顶两侧与后脑蓬松赤褐卷发（z <= 6.8，留出头顶发亮秃顶辨识度）
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 4.2, hy - 0.4, hz + 0.5, 1.45, 2.5, 2.1, mat('beard'), partId.hair, true);
      m.paintEllipsoid(s * 3.6, hy - 2.6, hz + 0.2, 1.6, 1.8, 1.9, mat('beard'), partId.hair, true);
    }
    m.paintEllipsoid(0, hy - 3.6, hz + 0.0, 3.6, 1.4, 2.2, mat('beard'), partId.hair, true);
    // 显眼蓬松赤褐大胡子（下巴与两颊厚实浓密）
    m.paintEllipsoid(0, hy + 2.6, hz - 2.4, 4.1, 2.6, 2.5, mat('beard'), partId.beard, true);
    m.paintEllipsoid(0, hy + 3.4, hz - 3.6, 3.1, 2.1, 1.8, mat('beard'), partId.beard, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 0.6, hy + 4.3, hz - 1.2, s * 3.2, hy + 3.6, hz - 1.7, 1.25, 1.05, mat('beard'), partId.beard, true);
    }
    // 笑眯眯粗眉（留足净空不压眼）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.1, hy + 4.1, hz + 2.3, s * 3.1, hy + 3.6, hz + 2.0, 0.82, 0.78, mat('beard'), partId.hair, true);
    }
    // 圆润酒糟红鼻头
    m.paintEllipsoid(0, hy + 4.4, hz - 0.1, 1.25, 1.15, 1.05, keyToId.noseRed, partId.nose, true);
    m.despeckle();
    m.applyArtShading(true);

    // 表面扫描落点精雕 2×2 笑眯眯大眼（eyeGlint 绝不进 glowKeys）
    const eyeZ = Math.round(hz + 0.3);
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (const s of [-1, 1]) {
      const xIn = Math.round(hw + s * 1.5), xOut = Math.round(hw + s * 2.5);
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
    return m.toStripAsset(makeCanvas, { footRadius: 4.8 });
  }

  // 4. 两段式壮实手臂：卷袖白衬衫大臂 + 古铜色粗壮小臂
  function buildUpperArm(makeCanvas) {
    const m = new VoxelModel(7, 8, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -UPPER_ARM_PIVOT.y, 3.6, 0, 2.1, 2.6, 1.85, 1.72, mat('shirt'), partId.upperArm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.3 });
  }

  function buildForearm(makeCanvas) {
    const m = new VoxelModel(7, 8, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -FOREARM_PIVOT.y, 2.8, 0, 2.2, 2.8, 1.52, 1.38, mat('skin'), partId.forearm, true);
    m.paintEllipsoid(0, 2.4, 2.8, 1.35, 1.35, 1.25, mat('skin'), partId.forearm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2 });
  }

  // 5. 装满金色麦酒、顶着厚白泡沫的大木杯（锁在右手枢轴）
  function buildMug(makeCanvas) {
    const m = new VoxelModel(8, 8, 9, SPEC);
    const { mat, partId } = SPEC;
    const py = -MUG_PIVOT_Y + 1.4;
    // 橡木杯体 + 双铜箍
    m.fillAABB(-3.2, 3.2, py - 3.2, py + 3.2, 0, 6, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y - py);
      if (r <= 2.45 && z >= 0 && z <= 5) {
        const isBand = (z === 1 || z === 4) && r >= 1.95;
        m.setRaw(x, y, z, isBand ? mat('brass') : mat('wood'), isBand ? partId.brass : partId.mug);
      }
    });
    // 侧面木握把
    m.paintCapsule(2.1, py, 1.4, 3.1, py, 2.8, 0.72, 0.72, mat('wood'), partId.mug, true);
    m.paintCapsule(3.1, py, 2.8, 2.1, py, 4.4, 0.72, 0.72, mat('wood'), partId.mug, true);
    // 满杯金色麦酒与厚实溢边白泡沫
    m.paintEllipsoid(0, py, 5.5, 2.15, 2.15, 0.85, mat('ale'), partId.ale, true);
    m.paintEllipsoid(0, py, 6.6, 2.45, 2.45, 1.35, mat('foam'), partId.foam, true);
    m.paintEllipsoid(-1.3, py + 1.2, 6.2, 1.15, 1.15, 1.25, mat('foam'), partId.foam, true);
    m.paintEllipsoid( 1.2, py - 0.8, 6.4, 1.10, 1.10, 1.05, mat('foam'), partId.foam, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8 });
  }

  // 6. 擦杯白布（锁在左手）
  function buildCloth(makeCanvas) {
    const m = new VoxelModel(6, 6, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0.4, 2.2, 1.85, 1.55, 1.25, mat('shirt'), partId.cloth, true);
    m.paintCapsule(-0.6, 0.2, 2.0, -1.2, 1.6, 0.9, 0.95, 0.78, mat('shirt'), partId.cloth, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0 });
  }

  // 7. 身前小型木质酒桶台道具件（橡木桶 + 双亮铜箍 + 黄铜龙头）
  function buildBarrelStand(makeCanvas) {
    const m = new VoxelModel(12, 13, 13, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-5.2, 5.2, -5.2, 5.2, 0, 11, (x, y, z, X, Y) => {
      const bulge = Math.sin((z / 11) * Math.PI) * 0.85;
      const rad = 3.9 + bulge;
      const r = Math.hypot(X, Y);
      if (r <= rad && z >= 0 && z <= 11) {
        const isBand = (z === 2 || z === 9) && r >= rad - 0.9;
        const isRim = z === 11 && r >= rad - 0.95;
        m.setRaw(x, y, z, (isBand || isRim) ? mat('brass') : mat('wood'), isBand ? partId.barrelBand : partId.barrel);
      }
    });
    // 朝向老板一侧（-Y 方向）的黄铜龙头与旋钮，倒酒时正好对准酒杯
    m.paintCapsule(0, -4.4, 7.6, 0, -5.8, 7.2, 0.82, 0.72, mat('brass'), partId.barrelBand, true);
    m.paintCapsule(0, -5.7, 7.2, 0, -5.8, 5.8, 0.65, 0.58, mat('brass'), partId.barrelBand, true);
    m.paintEllipsoid(0, -5.2, 8.6, 1.05, 0.7, 0.65, mat('brass'), partId.barrelBand, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.0 });
  }

  const TavernKeeperDef = {
    id: 'npc_tavern_keeper',
    code: 'N04',
    name: '酒馆吧台老板',
    tag: '生活交互标杆 · 擦杯倒酒与酒桶台',
    summary: 'N04 生活交互标杆：壮实大叔身板 + 赤褐大胡子秃顶卷发 + 两段滞后 FK 手臂 + 泡沫大麦酒杯/抹布 + 身前小型酒桶台',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 7.2,
    ecoWeight: 0.92,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',   name: '擦杯待机', loop: true,  status: 'done' },
      { id: 'pour',   name: '扶桶倒酒', loop: false, duration: 2.4, status: 'done' },
      { id: 'toast',  name: '举杯招呼', loop: false, duration: 2.0, status: 'done' },
      { id: 'patrol', name: '巡视酒馆', loop: true,  status: 'done' }
    ],
    blocks: ['赤褐大胡子秃顶头雕', '厚皮围裙与铜扣抹布', '稳健二足步态', '两段滞后 FK 手臂', '身前酒桶台与泡沫麦酒杯'],
    soulHabit: '站桩顺时针擦拭大麦酒杯轻晃点头 ↔ 俯身开酒桶龙头倒酒冒白沫 ↔ 高举麦酒杯大笑招呼 ↔ 收桶稳步巡视酒馆',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legThigh:    buildLegSeg(makeCanvas, 1.72, 1.50, 3.8),
        legShin:     buildLegSeg(makeCanvas, 1.48, 1.38, 3.6),
        boot:        buildBoot(makeCanvas),
        torso:       buildTorso(makeCanvas),
        head:        buildHead(makeCanvas),
        upperArmL:   buildUpperArm(makeCanvas),
        upperArmR:   buildUpperArm(makeCanvas),
        forearmL:    buildForearm(makeCanvas),
        forearmR:    buildForearm(makeCanvas),
        mug:         buildMug(makeCanvas),
        cloth:       buildCloth(makeCanvas),
        barrelStand: buildBarrelStand(makeCanvas)
      };

      // 稳健二足步态：大腿深嵌围裙下沿（hipZ=7.0），停步自动收脚
      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.4, hipY: 0.0, hipZ: 7.0, restX: -2.5, restY: 0.2, group: 0, L1: 3.8, L2: 3.9, bendDir: 1 },
        { id: 'R', hipX:  2.4, hipY: 0.0, hipZ: 7.0, restX:  2.5, restY: 0.2, group: 1, L1: 3.8, L2: 3.9, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 1.8, stepDuration: 0.17, stepHeight: 2.3, strideAnticipation: 0.38 });

      const headYawSpring = new SpringDamper1D(0, 110, 8.2);
      const nodSpring     = new SpringDamper1D(0, 140, 7.6);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        walkBlend: 0,
        armPhase: 0,
        time: 0,
        action: 'idle',
        actionTime: 0,
        lShYaw: 0, lElbYaw: 0, lShZ: 0, lElbZ: 0,
        rShYaw: 0, rElbYaw: 0, rShZ: 0, rElbZ: 0,
        leanFwd: 0,
        barrelShow: 1.0,
        barrelTilt: 0,
        fxCd: 0
      };
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: TavernKeeperDef,
        cachePrefix: `npc_keeper_${Math.random().toString(36).slice(2, 7)}`,
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
          state.barrelShow = 1.0; state.leanFwd = 0;
          gait.reset(hx, hy, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          state.time = time;

          const act = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const actT = (eco && eco.actionTime != null) ? eco.actionTime : 0;
          state.action = act;
          state.actionTime = actT;

          const isPatrol = act === 'patrol';
          Propulsion.multiLegWalk(state, dt, time, { ...params, speed: (params.speed ?? 1.0) * 0.82 }, {
            ...(eco || {}),
            patrol: isPatrol,
            walkStyle: 'heavy',
            baseLift: 0
          });
          state.z = 0;

          const spdNow = Math.hypot(state.vx, state.vy);
          const tgtWalk = isPatrol ? clamp((spdNow - 0.8) / 7.5, 0, 1) : 0;
          state.walkBlend = lerp(state.walkBlend, tgtWalk, expSmooth(dt, 9.5));
          state.armPhase += dt * (3.2 + state.walkBlend * 4.8) * gFreq;

          // 二足步态求解 + 温和钳位防脱胯
          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 1.05,
            stepHeight: 2.3 * sMul,
            stepThreshold: 1.8 * sMul
          });
          state.tiltX = lerp(state.tiltX || 0, gaitRes.tiltX * 0.55 * sMul, expSmooth(dt, 11));
          state.tiltY = lerp(state.tiltY || 0, gaitRes.tiltY * 0.55 * sMul, expSmooth(dt, 11));

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
              EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.72 * sMul);
            }
          }
          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.3 * sMul }));

          // 动作分支：大臂 + 小臂 FK（小臂滞后 0.75 rad）
          const lag = 0.75;
          const wipeT = time * 4.6 * gFreq;
          // 默认 idle：左手持布顺时针擦拭右手大木杯，身体跟着节拍轻晃点头
          let tgtLShYaw  = 0.36 + Math.cos(wipeT) * 0.24;
          let tgtLElbYaw = 0.52 + Math.cos(wipeT - lag) * 0.28;
          let tgtLShZ    = 0.9 + Math.sin(wipeT) * 0.55;
          let tgtLElbZ   = 1.8 + Math.sin(wipeT - lag) * 0.75;

          let tgtRShYaw  = -0.34 + Math.sin(wipeT * 0.5) * 0.08;
          let tgtRElbYaw = -0.44 + Math.sin(wipeT * 0.5 - lag) * 0.10;
          let tgtRShZ    = 0.7;
          let tgtRElbZ   = 1.3;

          let tgtHeadYaw = Math.sin(time * 1.7) * 0.22;
          let tgtNod     = Math.sin(wipeT * 0.5) * 0.55;
          let tgtLean    = 0;
          let tgtBarrelShow = 1.0;
          let tgtBarrelTilt = 0;

          if (act === 'pour') {
            // 2.4s 俯身倾斜酒桶龙头往大木杯倒酒，杯口冒出欢快白沫微粒
            const p = clamp(actT / 2.4, 0, 1);
            const pourIn = smoothstep(0.0, 0.24, p) * (1 - smoothstep(0.82, 1.0, p));
            tgtLean = 1.85 * pourIn;
            tgtBarrelTilt = 0.26 * pourIn;

            // 左手扶住酒桶顶沿/龙头旋钮
            tgtLShYaw  = lerp(0.36, 0.18, pourIn);
            tgtLElbYaw = lerp(0.52, 0.25, pourIn);
            tgtLShZ    = 0.6 * pourIn;
            tgtLElbZ   = 1.1 * pourIn;

            // 右手持大木杯探至酒桶龙头下方接酒
            tgtRShYaw  = lerp(-0.34, -0.48, pourIn);
            tgtRElbYaw = lerp(-0.44, -0.58, pourIn);
            tgtRShZ    = -0.5 * pourIn;
            tgtRElbZ   = -1.2 * pourIn + Math.sin(p * Math.PI * 5.0) * 0.25 * pourIn;

            tgtHeadYaw = 0.06 * Math.sin(p * Math.PI * 2.0);
            tgtNod = -0.8 * pourIn;

            if (vfx && p >= 0.26 && p <= 0.80) {
              state.fxCd -= dt;
              if (state.fxCd <= 0) {
                state.fxCd = 0.085;
                const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, 1.8 * sMul, 6.2 * sMul);
                const isFoam = Math.random() < 0.72;
                vfx.spawnParticle(
                  mx + (Math.random() - 0.5) * 2.0 * sMul,
                  my + (Math.random() - 0.5) * 2.0 * sMul,
                  (10.8 + Math.random() * 1.4) * sMul,
                  (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 7 + Math.random() * 7,
                  0.48, isFoam ? 1.55 : 1.25, isFoam ? '#faf6ec' : '#f2bd33', false, 6
                );
              }
            }
          } else if (act === 'toast') {
            // 2.0s 高举大麦酒杯大笑挥手招呼客人，洒出几点金黄酒滴粒子
            const p = clamp(actT / 2.0, 0, 1);
            const cheer = smoothstep(0.0, 0.22, p) * (1 - smoothstep(0.80, 1.0, p));
            const wave = Math.sin(p * Math.PI * 5.0) * cheer;

            tgtRShYaw  = lerp(-0.34, 0.25, cheer) + wave * 0.24;
            tgtRElbYaw = lerp(-0.44, 0.12, cheer) + Math.sin(p * Math.PI * 5.0 - lag) * 0.30 * cheer;
            tgtRShZ    = 2.8 * cheer;
            tgtRElbZ   = 5.2 * cheer + wave * 0.65;

            tgtLShYaw  = lerp(0.36, -0.45, cheer) - wave * 0.35;
            tgtLElbYaw = lerp(0.52, -0.35, cheer) - Math.sin(p * Math.PI * 5.0 - lag) * 0.40 * cheer;
            tgtLShZ    = 1.6 * cheer;
            tgtLElbZ   = 3.0 * cheer;

            tgtHeadYaw = Math.sin(p * Math.PI * 3.0) * 0.26 * cheer;
            tgtNod     = Math.abs(Math.sin(p * Math.PI * 6.0)) * 0.9 * cheer;

            if (vfx && p >= 0.25 && p <= 0.78) {
              state.fxCd -= dt;
              if (state.fxCd <= 0) {
                state.fxCd = 0.14;
                const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, 5.4 * sMul, 4.4 * sMul);
                vfx.spawnParticle(
                  mx + (Math.random() - 0.5) * 2.2 * sMul,
                  my + (Math.random() - 0.5) * 2.2 * sMul,
                  18.8 * sMul,
                  (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, 8 + Math.random() * 6,
                  0.52, 1.45, Math.random() < 0.65 ? '#f5be31' : '#fff8e8', false, 10
                );
              }
            }
          } else if (act === 'patrol') {
            // 巡视酒馆：收起酒桶台，厚重稳健迈步，右手稳端酒杯，左手轻摆
            tgtBarrelShow = 0;
            const swing = 0.45 * state.walkBlend;
            tgtLShYaw  = -0.18 + Math.sin(state.armPhase) * swing;
            tgtLElbYaw = -0.12 + Math.sin(state.armPhase - lag) * swing * 1.15;
            tgtLShZ    = Math.max(0, Math.sin(state.armPhase)) * 0.45 * state.walkBlend;
            tgtLElbZ   = Math.max(0, Math.sin(state.armPhase - lag)) * 0.65 * state.walkBlend;

            tgtRShYaw  = -0.22 - Math.sin(state.armPhase) * 0.14 * state.walkBlend;
            tgtRElbYaw = -0.28 - Math.sin(state.armPhase - lag) * 0.16 * state.walkBlend;
            tgtRShZ    = 0.95;
            tgtRElbZ   = 1.65 + Math.sin(state.armPhase - lag) * 0.25 * state.walkBlend;

            tgtHeadYaw = Math.sin(state.armPhase * 0.5) * 0.16;
            tgtNod     = Math.abs(Math.sin(state.armPhase)) * 0.35 * state.walkBlend;
          }

          const kArm = expSmooth(dt, 11.0);
          state.lShYaw  = lerp(state.lShYaw,  tgtLShYaw,  kArm);
          state.lElbYaw = lerp(state.lElbYaw, tgtLElbYaw, kArm);
          state.lShZ    = lerp(state.lShZ,    tgtLShZ,    kArm);
          state.lElbZ   = lerp(state.lElbZ,   tgtLElbZ,   kArm);
          state.rShYaw  = lerp(state.rShYaw,  tgtRShYaw,  kArm);
          state.rElbYaw = lerp(state.rElbYaw, tgtRElbYaw, kArm);
          state.rShZ    = lerp(state.rShZ,    tgtRShZ,    kArm);
          state.rElbZ   = lerp(state.rElbZ,   tgtRElbZ,   kArm);
          state.leanFwd    = lerp(state.leanFwd,    tgtLean,       kArm);
          state.barrelShow = lerp(state.barrelShow, tgtBarrelShow, expSmooth(dt, 9.5));
          state.barrelTilt = lerp(state.barrelTilt, tgtBarrelTilt, kArm);

          headYawSpring.update(dt, tgtHeadYaw, 110 * sp, 8.2);
          nodSpring.update(dt, tgtNod, 140 * sp, 7.6);
          sockets.setWorld('head', state.x, state.y, 18.6 * sMul, wrapAngle(state.yaw + headYawSpring.x));
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.55, 0.55));

          const idleSway = (state.action === 'idle') ? Math.sin(state.time * 2.3) * 0.45 * sMul : 0;
          const breath = Math.sin(state.time * 2.6) * 0.32 * sMul;
          const walkBob = Math.abs(Math.sin(state.armPhase)) * 0.62 * state.walkBlend * sMul;
          const bob = breath + walkBob;

          const [leanX, leanY] = localToWorldXY(
            state.x + (state.tiltX || 0),
            state.y + (state.tiltY || 0),
            yw,
            idleSway,
            state.leanFwd * sMul
          );

          // 1. 双腿真屈膝 IK（大腿深嵌皮围裙下沿）
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const hx = l.hipWX + (state.tiltX || 0);
            const hy = l.hipWY + (state.tiltY || 0);
            const hz = l.hipWZ + bob * 0.5;
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

          // 2. 壮实躯干
          list.push({
            partKey: 'torso', asset: parts.torso,
            x: leanX, y: leanY, lift: 4.5 * sMul + bob, ro: yw, bias: 0.14
          });

          // 3. 大胡子秃顶大叔头
          const [hdX, hdY] = localToWorldXY(leanX, leanY, yw, 0, state.leanFwd * 0.45 * sMul);
          const headZ = (14.8 + clamp(nodSpring.x, -1.0, 1.2)) * sMul + bob * 1.05;
          list.push({
            partKey: 'head', asset: parts.head,
            x: hdX, y: hdY, lift: headZ, ro: hYaw, bias: 0.42
          });

          // 4. 两段式 FK 左臂 + 擦杯白布
          const shZ = 10.9 * sMul + bob;
          const [lShX, lShY] = localToWorldXY(leanX, leanY, yw, -5.6 * sMul, 0.4 * sMul);
          const lUpYaw = yw + state.lShYaw;
          const [lUpX, lUpY] = localToWorldXY(lShX, lShY, lUpYaw, 0, UPPER_ARM_PIVOT.y * sMul);
          const [lElX, lElY] = localToWorldXY(lShX, lShY, lUpYaw, 0, 4.0 * sMul);
          const lFoYaw = lUpYaw + state.lElbYaw;
          const [lFoX, lFoY] = localToWorldXY(lElX, lElY, lFoYaw, 0, FOREARM_PIVOT.y * sMul);
          const [lHdX, lHdY] = localToWorldXY(lElX, lElY, lFoYaw, 0, 3.8 * sMul);

          list.push({ partKey: 'upperArmL', asset: parts.upperArmL, x: lUpX, y: lUpY, lift: shZ + state.lShZ * sMul, ro: lUpYaw, bias: 0.22 });
          list.push({ partKey: 'forearmL',  asset: parts.forearmL,  x: lFoX, y: lFoY, lift: shZ - 1.3 * sMul + state.lElbZ * sMul, ro: lFoYaw, bias: 0.30 });
          list.push({ partKey: 'cloth',     asset: parts.cloth,     x: lHdX, y: lHdY, lift: shZ - 1.5 * sMul + state.lElbZ * sMul, ro: lFoYaw, bias: 0.36 });

          // 5. 两段式 FK 右臂 + 锁枢轴大麦酒木杯
          const [rShX, rShY] = localToWorldXY(leanX, leanY, yw, 5.6 * sMul, 0.4 * sMul);
          const rUpYaw = yw + state.rShYaw;
          const [rUpX, rUpY] = localToWorldXY(rShX, rShY, rUpYaw, 0, UPPER_ARM_PIVOT.y * sMul);
          const [rElX, rElY] = localToWorldXY(rShX, rShY, rUpYaw, 0, 4.0 * sMul);
          const rFoYaw = rUpYaw + state.rElbYaw;
          const [rFoX, rFoY] = localToWorldXY(rElX, rElY, rFoYaw, 0, FOREARM_PIVOT.y * sMul);
          const [rHdX, rHdY] = localToWorldXY(rElX, rElY, rFoYaw, 0, 3.8 * sMul);

          list.push({ partKey: 'upperArmR', asset: parts.upperArmR, x: rUpX, y: rUpY, lift: shZ + state.rShZ * sMul, ro: rUpYaw, bias: 0.22 });
          list.push({ partKey: 'forearmR',  asset: parts.forearmR,  x: rFoX, y: rFoY, lift: shZ - 1.3 * sMul + state.rElbZ * sMul, ro: rFoYaw, bias: 0.30 });

          const [mgX, mgY] = localToWorldXY(rHdX, rHdY, rFoYaw, 0, MUG_PIVOT_Y * sMul);
          list.push({
            partKey: 'mug', asset: parts.mug,
            x: mgX, y: mgY, lift: Math.max(1.0, shZ - 2.2 * sMul + state.rElbZ * sMul), ro: rFoYaw, bias: 0.40
          });

          // 6. 身前小型木质酒桶台（待机/倒酒/敬酒稳立身前，巡游时收起）
          if (state.barrelShow > 0.12) {
            const [brX, brY] = localToWorldXY(state.x, state.y, yw, -1.6 * sMul, 11.4 * sMul);
            list.push({
              partKey: 'barrelStand', asset: parts.barrelStand,
              x: brX, y: brY, lift: 0, ro: yw + state.barrelTilt, bias: 0.26
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: TavernKeeperDef.id, code: TavernKeeperDef.code, name: TavernKeeperDef.name, outlineMode: 'actorUnified',
            skin: curSkin.id, footRadius: TavernKeeperDef.footRadius, headZ: 25, centerZ: 12,
            blocks: TavernKeeperDef.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(TavernKeeperDef, 'npc');
})(window.PixelWorkshop);
