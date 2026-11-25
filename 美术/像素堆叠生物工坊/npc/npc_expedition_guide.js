'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, lerp, smoothstep, smin, localToWorldXY, pivotToWorldXY, expSmooth, wrapAngle } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 酒4 · 远行引路向导（大厅出发入口）
  // 轮廓锚点：沙褐宽檐折边皮旅帽 + 赭红斜挎披风 + 麻绳水壶指南针大行囊 + 展开彩针羊皮地图
  // 规范铁律：24 格头身比、二足防脱胯 IK、两段手臂 FK 滞后、局部背法向披风零穿模、
  //           常态 1:1 零拉伸、非自亮不进 glowKeys、<= 48 色 0 重色、0 禁用字
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 皮肤（暖麦健康肤色）
      skinDark:    '#a87352',
      skinMid:     '#d69c75',
      skinHi:      '#f2c29d',
      // 赭红斜披风（主视觉高对比色）
      cloakDark:   '#6b211a',
      cloakMid:    '#ad3b2c',
      cloakHi:     '#de654e',
      // 沙褐宽檐皮旅帽 & 行囊主皮
      hatDark:     '#543924',
      hatMid:      '#8a623f',
      hatHi:       '#bd8f64',
      // 探险卡其内衫
      tunicDark:   '#59513c',
      tunicMid:    '#8a7f61',
      tunicHi:     '#b8ad8d',
      // 深棕皮靴与背带
      bootDark:    '#2e1f16',
      bootMid:     '#4f3626',
      bootHi:      '#75543e',
      // 浅米羊皮地图 & 麻绳
      mapDark:     '#b59c72',
      mapMid:      '#e3cf9f',
      mapHi:       '#faf0cf',
      // 地图色块：绿林 / 黄沙 / 蓝海 / 红标针
      mapGreen:    '#4b9e46',
      mapSand:     '#e0b84c',
      mapSea:      '#3b82b8',
      mapPin:      '#e62e2e',
      // 黄铜指南针与帽扣（不进 glowKeys）
      brassDark:   '#7d5c1a',
      brassMid:    '#bf9230',
      brassHi:     '#ebd06e',
      // 麻绳
      ropeDark:    '#7a6845',
      ropeMid:     '#ad986d',
      ropeHi:      '#d9c698',
      // 头发（深栗短发）
      hairDark:    '#291c15',
      hairMid:     '#473124',
      hairHi:      '#694b38',
      // 眼睛（eyeGlint 绝不进 glowKeys）
      eyeDark:     '#141218',
      eyeIris:     '#4d7a5e',
      eyeGlint:    '#f5faff'
    },
    glowKeys: [],
    parts: [
      'boot', 'leg', 'tunic', 'belt', 'cloak', 'pack', 'rope', 'canteen', 'compass',
      'head', 'hair', 'hat', 'hatBand', 'eye', 'arm', 'hand', 'map', 'mapMark'
    ],
    noCrease: [
      ['eye', 'head'], ['hair', 'head'], ['hat', 'hatBand'],
      ['map', 'mapMark'], ['leg', 'boot'], ['pack', 'rope'], ['pack', 'canteen'], ['pack', 'compass']
    ],
    materials: {
      skin:  ['skinDark',  'skinMid',  'skinHi'],
      cloak: ['cloakDark', 'cloakMid', 'cloakHi'],
      hat:   ['hatDark',   'hatMid',   'hatHi'],
      tunic: ['tunicDark', 'tunicMid', 'tunicHi'],
      boot:  ['bootDark',  'bootMid',  'bootHi'],
      map:   ['mapDark',   'mapMid',   'mapHi'],
      brass: ['brassDark', 'brassMid', 'brassHi'],
      rope:  ['ropeDark',  'ropeMid',  'ropeHi'],
      hair:  ['hairDark',  'hairMid',  'hairHi']
    },
    protectedParts: ['eye', 'mapMark', 'compass']
  });

  const SKINS = [
    { id: 'ochre_wild', name: '赭红荒野', dot: '#ad3b2c', outline: '#140f0c', pal: {} },
    {
      id: 'moss_trail', name: '苔绿林径', dot: '#3e7d47', outline: '#0e1410',
      pal: {
        cloakDark: '#204a2b', cloakMid: '#3e7d47', cloakHi: '#6cb36f',
        hatDark:   '#422b1a', hatMid:   '#704c2f', hatHi:   '#9e734e',
        tunicDark: '#524b3a', tunicMid: '#80765c', tunicHi: '#ada284'
      }
    },
    {
      id: 'indigo_chart', name: '靛蓝海图', dot: '#2e5994', outline: '#0d121a',
      pal: {
        cloakDark: '#193159', cloakMid: '#2e5994', cloakHi: '#5487c7',
        hatDark:   '#3b424d', hatMid:   '#626e7d', hatHi:   '#8f9dad',
        tunicDark: '#696254', tunicMid: '#9c9482', tunicHi: '#ccc4b2'
      }
    }
  ];

  // --- 体素部件建模 ---
  function buildLegSeg(makeCanvas, rTop, rBot, hLen, matName) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 3);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat(matName), partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildBoot(makeCanvas) {
    const m = new VoxelModel(7, 8, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, -0.2, 3.0, 1.45, 1.45, 1.4, mat('boot'), partId.boot, true);
    m.paintEllipsoid(0, 0.9, 1.3, 1.65, 2.35, 1.3, mat('boot'), partId.boot, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.3 });
  }

  function buildTorso(makeCanvas) {
    const m = new VoxelModel(13, 12, 12, SPEC);
    const { mat, partId } = SPEC;
    // 探险内衫躯干（底摆包住髋部防脱胯）
    m.fillAABB(-5.2, 5.2, -4.4, 4.4, 0, 11, (x, y, z, X, Y) => {
      const dBody = (Math.hypot(X / 4.3, Y / 3.4, (z - 5.6) / 5.1) - 1) * 3.6;
      const dNeck = (Math.hypot(X / 2.2, Y / 2.1, (z - 10.4) / 1.8) - 1) * 1.8;
      if (smin(dBody, dNeck, 1.0) <= 0) {
        m.setRaw(x, y, z, z > 9.4 ? mat('skin') : mat('tunic'), partId.tunic);
      }
      // 下摆围裙护腿根
      const r = Math.hypot(X / 4.5, Y / 3.6);
      if (r <= 1.0 && r >= 0.45 && z >= 0.5 && z <= 3.6) {
        m.setRaw(x, y, z, mat('tunic'), partId.tunic);
      }
    });
    // 赭红斜挎披风前肩覆片（从左肩斜披到右肋）
    m.paintCapsule(-4.2, 1.4, 9.2, 2.6, 2.8, 4.8, 1.55, 1.45, mat('cloak'), partId.cloak, true);
    m.paintCapsule(-4.4, -0.6, 9.4, 3.8, -1.6, 7.6, 1.6, 1.45, mat('cloak'), partId.cloak, true);
    m.paintEllipsoid(-3.0, 0.2, 9.4, 2.3, 2.6, 1.5, mat('cloak'), partId.cloak, true);
    // 腰带与黄铜扣
    m.paintEllipsoid(0, 0, 3.8, 4.4, 3.6, 0.95, mat('boot'), partId.belt, true);
    m.paintEllipsoid(0, 3.5, 3.8, 1.15, 0.7, 1.0, mat('brass'), partId.compass, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8 });
  }

  function buildCloakFlap(makeCanvas, wSpan, hSpan) {
    const m = new VoxelModel(11, 7, hSpan, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-wSpan, wSpan, -2.5, 2.5, 0, hSpan - 1, (x, y, z, X, Y) => {
      const u = z / Math.max(1, hSpan - 1);
      const halfW = lerp(wSpan * 0.95, wSpan * 0.65, u);
      const yCurve = -0.7 + Math.abs(X) * 0.16;
      if (Math.abs(X) <= halfW && Math.abs(Y - yCurve) <= 1.05) {
        m.setRaw(x, y, z, mat('cloak'), partId.cloak);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8 });
  }

  function buildBackpack(makeCanvas) {
    // 饱满行军大背囊：主体皮囊 + 顶部睡卷 + 左侧盘卷麻绳 + 右侧铜指南针与皮水壶
    const m = new VoxelModel(14, 11, 13, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 主皮囊
    m.paintEllipsoid(0, 0.0, 5.4, 4.1, 3.1, 4.4, mat('hat'), partId.pack, true);
    // 顶部横卷铺盖
    m.paintCapsule(-4.0, 0.2, 9.6, 4.0, 0.2, 9.6, 1.55, 1.55, mat('tunic'), partId.tunic, true);
    // 束带
    m.paintCapsule(-2.2, -2.6, 2.4, -2.2, -2.6, 9.8, 0.75, 0.75, mat('boot'), partId.belt, true);
    m.paintCapsule( 2.2, -2.6, 2.4,  2.2, -2.6, 9.8, 0.75, 0.75, mat('boot'), partId.belt, true);
    // 左侧盘卷麻绳（高辨识浅米环）
    for (let a = 0; a < 12; a++) {
      const ang = (a / 12) * Math.PI * 2;
      const ry = Math.cos(ang) * 1.55;
      const rz = 5.4 + Math.sin(ang) * 1.75;
      m.paintEllipsoid(-4.4, ry, rz, 0.95, 0.85, 0.85, mat('rope'), partId.rope, true);
    }
    // 右侧皮水壶
    m.paintEllipsoid(4.4, 0.4, 4.2, 1.35, 1.45, 1.85, mat('boot'), partId.canteen, true);
    m.paintEllipsoid(4.4, 0.4, 6.2, 0.7, 0.7, 0.75, mat('brass'), partId.compass, true);
    // 右后挂黄铜指南针圆盘
    m.paintEllipsoid(3.4, -2.7, 7.6, 1.35, 0.75, 1.35, mat('brass'), partId.compass, true);
    const cx = Math.round(m.w * 0.5 - 0.5 + 3.4);
    const cy = Math.round(m.d * 0.5 - 0.5 - 3.3);
    m.setRaw(cx, cy, 8, keyToId.mapPin, partId.compass);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8 });
  }

  function buildHeadAndHat(makeCanvas) {
    // 头部 + 防风宽檐折边皮旅帽（俯视第一辨识轮廓！）
    const W = 17, D = 17, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 脸与后脑短发
    m.paintEllipsoid(0, 0.3, 3.6, 3.6, 3.5, 3.4, mat('skin'), partId.head, true);
    m.paintEllipsoid(0, -1.2, 4.0, 3.7, 3.1, 3.3, mat('hair'), partId.hair, false);
    // 宽檐皮旅帽：宽大帽檐 + 左缘微微上折
    m.fillAABB(-7.8, 7.8, -7.6, 7.6, 5.2, 8.2, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 7.4, Y / 6.9);
      const foldUp = X < -3.8 ? ((-3.8 - X) * 0.42) : 0;
      const brimZ = 6.2 + foldUp - Math.max(0, Y - 2.2) * 0.14;
      if (r <= 1.0 && Math.abs(z - brimZ) <= 0.72) {
        m.setRaw(x, y, z, mat('hat'), partId.hat);
      }
    });
    // 帽冠与赭红帽带+铜扣
    m.paintEllipsoid(0, -0.2, 8.3, 4.1, 4.0, 2.6, mat('hat'), partId.hat, true);
    m.paintEllipsoid(0, -0.2, 7.1, 4.3, 4.2, 0.85, mat('cloak'), partId.hatBand, true);
    m.paintEllipsoid(2.6, 3.2, 7.2, 0.95, 0.8, 0.9, mat('brass'), partId.compass, true);

    m.despeckle();
    m.applyArtShading(true);

    // 表层贴画锐利双眼（0.6 俯视 0 遮挡）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeZ = 4;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.6);
      let sy = -1;
      for (let y = D - 2; y >= 1; y--) {
        if (m.getPartId(ex, y, eyeZ) === partId.head) { sy = y; break; }
      }
      if (sy < 0) sy = Math.round(hd + 3.5);
      m.setRaw(ex, sy, eyeZ, keyToId.eyeDark, partId.eye);
      m.setRaw(ex, sy, eyeZ + 1, keyToId.eyeGlint, partId.eye);
      m.setRaw(ex + s, sy, eyeZ, keyToId.eyeIris, partId.eye);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 6.5 });
  }

  function buildArmSeg(makeCanvas, len, r0, r1, matName, hasHand) {
    // 枢轴位于局部 (0, 0)，向 +Y 延伸 len
    const W = 7, D = Math.ceil(len * 2 + 5), H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 3.0, 0, len, 2.7, r0, r1, mat(matName), partId.arm, true);
    if (hasHand) {
      m.paintEllipsoid(0, len + 0.6, 2.7, 1.2, 1.2, 1.15, mat('skin'), partId.hand, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2 });
  }

  function buildOpenMap(makeCanvas) {
    // 展开大型浅米羊皮生态地图（两侧木轴 + 绿林/黄沙/蓝海色块 + 红标针）
    const W = 15, D = 10, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 左右卷轴木柄
    m.paintCapsule(-5.8, -0.5, 1.4, -5.8, 2.5, 6.8, 0.95, 0.95, mat('boot'), partId.boot, true);
    m.paintCapsule( 5.8, -0.5, 1.4,  5.8, 2.5, 6.8, 0.95, 0.95, mat('boot'), partId.boot, true);
    // 微微倾斜朝上展开的羊皮图面（俯视超大清晰面！）
    m.fillAABB(-5.4, 5.4, -1.5, 3.5, 1, 7, (x, y, z, X, Y) => {
      const targetY = -0.4 + (z - 1.5) * 0.52 + Math.sin(X * 0.45) * 0.25;
      if (Math.abs(Y - targetY) <= 0.72 && z >= 1.5 && z <= 6.8) {
        m.setRaw(x, y, z, mat('map'), partId.map);
      }
    });
    m.despeckle();
    m.applyArtShading(true);

    // 贴画生态色块（绿林、黄沙、蓝海）与醒目红标针
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (let z = 2; z <= 6; z++) {
      for (let x = 2; x < W - 2; x++) {
        const X = x - hw;
        // 找到图面最上层/最前层像素
        let topY = -1;
        for (let y = D - 1; y >= 0; y--) {
          if (m.getPartId(x, y, z) === partId.map) { topY = y; break; }
        }
        if (topY < 0) continue;
        if (X <= -1.2 && z >= 4) {
          m.setRaw(x, topY, z, keyToId.mapGreen, partId.mapMark);
        } else if (X >= 1.5 && z >= 3 && z <= 5) {
          m.setRaw(x, topY, z, keyToId.mapSand, partId.mapMark);
        } else if (X >= -1.2 && X <= 2.4 && z <= 3) {
          m.setRaw(x, topY, z, keyToId.mapSea, partId.mapMark);
        }
      }
    }
    // 红色坐标标针凸起
    const px = Math.round(hw - 0.4), py = Math.round(hd + 1.6);
    m.setRaw(px, py, 5, keyToId.mapPin, partId.mapMark);
    m.setRaw(px, py, 6, keyToId.mapPin, partId.mapMark);
    m.setRaw(px + 1, py, 6, keyToId.mapPin, partId.mapMark);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5 });
  }

  function buildRolledMap(makeCanvas) {
    // 卷起挟在左腋下的羊皮地图筒 + 红绳扎带
    const m = new VoxelModel(6, 11, 6, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.paintCapsule(0, -3.8, 2.5, 0, 3.8, 2.5, 1.35, 1.35, mat('map'), partId.map, true);
    m.paintEllipsoid(0, 0, 2.5, 1.5, 0.85, 1.5, mat('cloak'), partId.hatBand, true);
    m.despeckle();
    m.applyArtShading(true);
    const cx = Math.round(m.w * 0.5 - 0.5), cy = Math.round(m.d * 0.5 - 0.5);
    m.setRaw(cx, cy, 4, keyToId.mapPin, partId.mapMark);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5 });
  }

  const Def = {
    id: 'npc_expedition_guide',
    code: '酒4',
    name: '远行引路向导',
    tag: '大厅出发官 · 旅帽地图',
    summary: '宽檐折边皮旅帽、赭红斜披风与满载绳索水壶的大背囊，双手展开生态羊皮地图指引远行路线',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 7.4,
    ecoWeight: 0.9,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',       name: '展开看图', loop: true,  status: 'done' },
      { id: 'patrol',     name: '稳健巡视', loop: true,  status: 'done' },
      { id: 'point',      name: '卷图指路', loop: false, duration: 2.0, status: 'done' },
      { id: 'check_pack', name: '检查行囊', loop: false, duration: 2.2, status: 'done' }
    ],
    blocks: ['二足稳步 IK', '两段手臂 FK 滞后', '局部背法向披风', '展开/卷起双态地图', '大行囊惯性颠簸'],
    soulHabit: '低头点划生态地图路线 → 利落卷图挟腋抬臂招呼出发 → 拍拍背后行囊绳索与水壶',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        thigh:     buildLegSeg(makeCanvas, 1.72, 1.48, 4.4, 'tunic'),
        shin:      buildLegSeg(makeCanvas, 1.45, 1.32, 4.2, 'boot'),
        boot:      buildBoot(makeCanvas),
        torso:     buildTorso(makeCanvas),
        cloakTop:  buildCloakFlap(makeCanvas, 4.2, 6),
        cloakBot:  buildCloakFlap(makeCanvas, 4.6, 5),
        backpack:  buildBackpack(makeCanvas),
        head:      buildHeadAndHat(makeCanvas),
        upperArmL: buildArmSeg(makeCanvas, 3.2, 1.38, 1.24, 'cloak', false),
        forearmL:  buildArmSeg(makeCanvas, 3.4, 1.18, 1.05, 'tunic', true),
        upperArmR: buildArmSeg(makeCanvas, 3.2, 1.38, 1.24, 'tunic', false),
        forearmR:  buildArmSeg(makeCanvas, 3.4, 1.18, 1.05, 'tunic', true),
        mapOpen:   buildOpenMap(makeCanvas),
        mapRolled: buildRolledMap(makeCanvas)
      };

      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.1, hipY: -0.1, hipZ: 8.6, restX: -2.2, restY: 0.2, group: 0, L1: 4.5, L2: 4.6, bendDir: 1 },
        { id: 'R', hipX:  2.1, hipY: -0.1, hipZ: 8.6, restX:  2.2, restY: 0.2, group: 1, L1: 4.5, L2: 4.6, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 2.2, stepDuration: 0.16, stepHeight: 1.8, strideAnticipation: 0.42 });

      const headYawSp   = new SpringDamper1D(0, 120, 9.5);
      const torsoTwist  = new SpringDamper1D(0, 110, 8.8);
      const packBounce  = new SpringDamper1D(0, 145, 6.2);
      const packSway    = new SpringDamper1D(0, 105, 6.0);
      const cloakBillow = new SpringDamper1D(0, 95, 5.6);
      const armLUpSp    = new SpringDamper1D(0, 130, 8.4);
      const armLForeSp  = new SpringDamper1D(0, 110, 7.6);
      const armRUpSp    = new SpringDamper1D(0, 130, 8.4);
      const armRForeSp  = new SpringDamper1D(0, 110, 7.6);
      const bodyBounce  = new SpringDamper1D(0, 180, 9.0);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        prevYaw: opts.homeYaw ?? 0, yawRate: 0,
        walkBlend: 0, stepPhase: 0, stepSign: 1,
        action: 'idle', actionTime: 0,
        tiltX: 0, tiltY: 0,
        vfxFired: false
      };
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: Def,
        cachePrefix: `npc_guide_${Math.random().toString(36).slice(2, 7)}`,
        parts, partListAssets: Object.values(parts), state, sockets, footContacts: [], scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.yaw = hyaw; state.prevYaw = hyaw; state.z = 0;
          state.vx = 0; state.vy = 0; state.walkBlend = 0; state.yawRate = 0;
          state.action = 'idle'; state.actionTime = 0; state.vfxFired = false;
          gait.reset(hx, hy, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco = {}) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = params.springiness ?? 1.0;
          const flex = params.tailFlex ?? 1.0;
          const gFreq = params.gaitFreq ?? 1.0;

          const act = eco.action || (eco.patrol ? 'patrol' : 'idle');
          const actT = eco.actionTime ?? 0;
          if (act !== state.action) {
            state.vfxFired = false;
            if (act === 'point') cloakBillow.impulse(4.8 * sp);
            if (act === 'check_pack') packBounce.impulse(-7.5 * sp);
          }
          state.action = act;
          state.actionTime = actT;

          const isPatrol = act === 'patrol';
          state.prevYaw = state.yaw;
          Propulsion.multiLegWalk(state, dt, time, { ...params, speed: (params.speed ?? 1.0) * 0.88 }, {
            ...eco, patrol: isPatrol, walkStyle: 'default', baseLift: 0
          });
          state.z = 0;
          state.yawRate = clamp(wrapAngle(state.yaw - state.prevYaw) / Math.max(dt, 0.001), -5, 5);

          const spdNow = Math.hypot(state.vx, state.vy);
          state.walkBlend = lerp(state.walkBlend, clamp((spdNow - 1.5) / 6.5, 0, 1), expSmooth(dt, 10));
          state.stepPhase += dt * (3.2 + state.walkBlend * 9.5) * gFreq;

          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 1.15,
            stepHeight: 1.75 * sMul * (0.78 + flex * 0.22),
            stepThreshold: 2.2 * sMul
          });
          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 0.5 * sMul, expSmooth(dt, 12));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 0.5 * sMul, expSmooth(dt, 12));

          // 防急转脱胯钳位
          const maxFootOff = 3.5 * sMul;
          for (const leg of gait.legs) {
            const [ix, iy] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
            const dx = leg.footX - ix, dy = leg.footY - iy;
            const d = Math.hypot(dx, dy);
            if (d > maxFootOff) {
              leg.footX = ix + (dx / d) * maxFootOff;
              leg.footY = iy + (dy / d) * maxFootOff;
            }
          }

          if (gaitRes.landed.length > 0) {
            state.stepSign *= -1;
            bodyBounce.impulse(5.5 * sp);
            packBounce.impulse(-9.0 * sp);
            packSway.impulse(state.stepSign * 5.0 * sp);
            for (const l of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.55 * sMul);
            }
          }
          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.0 * sMul }));

          // 动作目标姿态解算
          let tHeadYaw = Math.sin(time * 0.9) * 0.14;
          let tTorsoTw = 0;
          let tCloak = state.walkBlend * 0.55 + Math.sin(time * 2.2) * 0.08;
          let tArmLUp = 0.24, tArmLFore = 0.36;
          let tArmRUp = -0.24, tArmRFore = -0.36;

          if (act === 'patrol') {
            const sw = Math.sin(state.stepPhase);
            const swLag = Math.sin(state.stepPhase - 0.80);
            tHeadYaw = Math.sin(time * 1.6) * 0.22;
            tTorsoTw = sw * 0.08;
            tArmLUp = 0.22 + sw * 0.26 * state.walkBlend;
            tArmLFore = 0.34 + swLag * 0.22 * state.walkBlend;
            tArmRUp = -0.22 - sw * 0.26 * state.walkBlend;
            tArmRFore = -0.34 - swLag * 0.22 * state.walkBlend;
          } else if (act === 'idle') {
            // 低头看图，右手周期性抬起点划路线
            const trace = Math.sin(time * 2.1);
            const traceLag = Math.sin(time * 2.1 - 0.82);
            const traceActive = smoothstep(0.25, 0.85, Math.sin(time * 0.72));
            tHeadYaw = trace * 0.16 * traceActive;
            tArmLUp = 0.28;
            tArmLFore = 0.42;
            tArmRUp = -0.26 + trace * 0.22 * traceActive;
            tArmRFore = -0.40 + traceLag * 0.28 * traceActive;
          } else if (act === 'point') {
            // 卷图挟左腋 + 右臂平直指向前方 + 披风扬起
            const p = clamp(actT / 2.0, 0, 1);
            const raise = smoothstep(0.08, 0.26, p) * (1 - smoothstep(0.76, 0.96, p));
            tTorsoTw = -0.18 * raise;
            tHeadYaw = 0.08 * raise;
            tCloak = 0.2 + 1.35 * raise;
            // 左臂夹紧卷图
            tArmLUp = lerp(0.28, -0.32, raise);
            tArmLFore = lerp(0.42, 0.58, raise);
            // 右臂平直前指招呼出发
            tArmRUp = lerp(-0.26, 0.02, raise);
            tArmRFore = lerp(-0.40, 0.04, raise);
            if (!state.vfxFired && p > 0.24 && vfx) {
              state.vfxFired = true;
              const [fx, fy] = localToWorldXY(state.x, state.y, state.yaw, 2.5 * sMul, 10.5 * sMul);
              for (let i = 0; i < 6; i++) {
                const a = state.yaw + (Math.random() - 0.5) * 0.7;
                vfx.spawnParticle(
                  fx, fy, 14.5 * sMul,
                  -Math.sin(a) * (12 + Math.random() * 8), Math.cos(a) * (12 + Math.random() * 8), 3 + Math.random() * 4,
                  0.45, 1.2, '#f2df9b', false, 6
                );
              }
            }
          } else if (act === 'check_pack') {
            // 转身微晃拍拍背后大行囊，检查绳索与水壶
            const p = clamp(actT / 2.2, 0, 1);
            const turn = smoothstep(0.08, 0.28, p) * (1 - smoothstep(0.78, 0.96, p));
            const pat = Math.sin(p * Math.PI * 6) * smoothstep(0.26, 0.36, p) * (1 - smoothstep(0.72, 0.82, p));
            tTorsoTw = -0.52 * turn + pat * 0.06;
            tHeadYaw = -0.45 * turn;
            tArmLUp = lerp(0.28, -0.25, turn);
            tArmLFore = lerp(0.42, 0.52, turn);
            // 右臂绕向背后轻拍行囊
            tArmRUp = lerp(-0.26, -1.75, turn) + pat * 0.16;
            tArmRFore = lerp(-0.40, -1.15, turn) + pat * 0.22;
            if (Math.abs(pat) > 0.75) {
              packBounce.impulse(-2.2 * sp * dt * 60);
              packSway.impulse(pat * 1.4 * sp * dt * 60);
            }
          }

          headYawSp.update(dt, tHeadYaw, 120 * sp, 9.5);
          torsoTwist.update(dt, tTorsoTw, 110 * sp, 8.8);
          cloakBillow.update(dt, tCloak, 95 * sp, 5.6);
          armLUpSp.update(dt, tArmLUp, 130 * sp, 8.4);
          armLForeSp.update(dt, tArmLFore, 110 * sp, 7.6);
          armRUpSp.update(dt, tArmRUp, 130 * sp, 8.4);
          armRForeSp.update(dt, tArmRFore, 110 * sp, 7.6);
          bodyBounce.update(dt, 0, 180 * sp, 9.0);
          packBounce.update(dt, 0, 145 * sp, 6.2);
          packSway.update(dt, state.walkBlend * Math.sin(state.stepPhase) * 0.12, 105 * sp, 6.0);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const tYaw = yw + clamp(torsoTwist.x, -0.65, 0.65);
          const hYaw = tYaw + clamp(headYawSp.x, -0.75, 0.75);

          const breath = Math.sin(state.stepPhase * 0.55) * 0.32 * (1 - state.walkBlend * 0.4);
          const walkBob = Math.abs(Math.sin(state.stepPhase)) * 0.65 * state.walkBlend;
          const bob = clamp(bodyBounce.x * 0.05 + breath + walkBob, -0.35, 0.95) * sMul;
          const packBob = clamp(packBounce.x * 0.09, -1.2, 1.4) * sMul;

          // 1. 二足 IK 双腿
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const hx = l.hipWX + state.tiltX;
            const hy = l.hipWY + state.tiltY;
            const hz = l.hipWZ + bob;
            list.push({
              partKey: 'thigh', asset: parts.thigh,
              x: lerp(hx, l.kneeX, 0.30), y: lerp(hy, l.kneeY, 0.30),
              lift: Math.max(0, lerp(hz, l.kneeZ, 0.30) - 2.0 * sMul),
              ro: yw, bias: -0.34, symDeg: 90
            });
            list.push({
              partKey: 'shin', asset: parts.shin,
              x: lerp(l.kneeX, l.footX, 0.48), y: lerp(l.kneeY, l.footY, 0.48),
              lift: Math.max(0, lerp(l.kneeZ, l.footZ + 1.6 * sMul, 0.48) - 2.0 * sMul),
              ro: yw, bias: -0.28, symDeg: 90
            });
            list.push({
              partKey: 'boot', asset: parts.boot,
              x: l.footX, y: l.footY, lift: Math.max(0, l.footZ),
              ro: yw, bias: -0.22
            });
          }

          // 2. 躯干
          const tx = state.x + state.tiltX;
          const ty = state.y + state.tiltY;
          list.push({
            partKey: 'torso', asset: parts.torso,
            x: tx, y: ty, lift: 6.2 * sMul + bob, ro: tYaw, bias: 0.14
          });

          // 3. 局部背法向披风（永不穿模）+ 大行囊
          const billow = clamp(cloakBillow.x, 0, 1.8);
          const turnSwing = clamp(-state.yawRate * 0.16, -0.38, 0.38);
          const [cl1X, cl1Y] = localToWorldXY(tx, ty, tYaw, turnSwing * 0.8 * sMul, (-3.6 - billow * 0.8) * sMul);
          const [cl2X, cl2Y] = localToWorldXY(tx, ty, tYaw, turnSwing * 1.9 * sMul, (-4.5 - billow * 1.8) * sMul);
          list.push({
            partKey: 'cloakTop', asset: parts.cloakTop,
            x: cl1X, y: cl1Y, lift: 9.8 * sMul + bob, ro: tYaw + turnSwing * 0.5, bias: -0.22
          });
          list.push({
            partKey: 'cloakBot', asset: parts.cloakBot,
            x: cl2X, y: cl2Y, lift: (5.6 + billow * 0.65) * sMul + bob, ro: tYaw + turnSwing, bias: -0.26
          });

          const [pkX, pkY] = localToWorldXY(tx, ty, tYaw, 0, -5.6 * sMul);
          list.push({
            partKey: 'backpack', asset: parts.backpack,
            x: pkX, y: pkY, lift: 7.4 * sMul + bob + packBob,
            ro: tYaw + clamp(packSway.x, -0.25, 0.25), bias: -0.32
          });

          // 4. 头部与宽檐皮旅帽
          const headZ = 15.0 * sMul + bob * 1.05;
          list.push({
            partKey: 'head', asset: parts.head,
            x: tx, y: ty, lift: headZ, ro: hYaw, bias: 0.45
          });

          // 5. 两段手臂 FK（大臂 -> 肘 -> 小臂滞后 -> 手）
          const shZ = 13.6 * sMul + bob;
          const [lShX, lShY] = localToWorldXY(tx, ty, tYaw, -4.3 * sMul, 0.4 * sMul);
          const [rShX, rShY] = localToWorldXY(tx, ty, tYaw,  4.3 * sMul, 0.4 * sMul);

          const isPoint = state.action === 'point' && state.actionTime > 0.18 && state.actionTime < 1.82;
          const isCheck = state.action === 'check_pack' && state.actionTime > 0.16 && state.actionTime < 2.02;
          const lUpYaw = tYaw + armLUpSp.x;
          const lFoYaw = tYaw + armLForeSp.x;
          const rUpYaw = tYaw + armRUpSp.x;
          const rFoYaw = tYaw + armRForeSp.x;

          const lArmZ = shZ - (isPoint ? 0.6 : 1.0) * sMul;
          const rArmZ = shZ + (isPoint ? 1.2 : -1.0) * sMul;

          // 左大臂 & 左小臂
          const [lUpWx, lUpWy] = pivotToWorldXY(lShX, lShY, lUpYaw, 0, -0.4 * sMul);
          const [lElX, lElY] = localToWorldXY(lShX, lShY, lUpYaw, 0, 3.1 * sMul);
          const [lFoWx, lFoWy] = pivotToWorldXY(lElX, lElY, lFoYaw, 0, -0.3 * sMul);
          const [lHdX, lHdY] = localToWorldXY(lElX, lElY, lFoYaw, 0, 3.4 * sMul);

          // 右大臂 & 右小臂
          const [rUpWx, rUpWy] = pivotToWorldXY(rShX, rShY, rUpYaw, 0, -0.4 * sMul);
          const [rElX, rElY] = localToWorldXY(rShX, rShY, rUpYaw, 0, 3.1 * sMul);
          const [rFoWx, rFoWy] = pivotToWorldXY(rElX, rElY, rFoYaw, 0, -0.3 * sMul);
          const [rHdX, rHdY] = localToWorldXY(rElX, rElY, rFoYaw, 0, 3.4 * sMul);

          list.push({ partKey: 'upperArmL', asset: parts.upperArmL, x: lUpWx, y: lUpWy, lift: lArmZ, ro: lUpYaw, bias: 0.22 });
          list.push({ partKey: 'forearmL',  asset: parts.forearmL,  x: lFoWx, y: lFoWy, lift: lArmZ - 0.6 * sMul, ro: lFoYaw, bias: 0.26 });
          list.push({ partKey: 'upperArmR', asset: parts.upperArmR, x: rUpWx, y: rUpWy, lift: rArmZ, ro: rUpYaw, bias: 0.22 });
          list.push({ partKey: 'forearmR',  asset: parts.forearmR,  x: rFoWx, y: rFoWy, lift: rArmZ - (isPoint ? -0.4 : 0.6) * sMul, ro: rFoYaw, bias: 0.26 });

          // 6. 羊皮地图（指路/查行囊时卷起挟左腋，待机/巡视时双手展开在身前）
          if (isPoint || isCheck) {
            const [rmX, rmY] = localToWorldXY(tx, ty, tYaw, -4.6 * sMul, 1.4 * sMul);
            list.push({
              partKey: 'mapRolled', asset: parts.mapRolled,
              x: rmX, y: rmY, lift: 10.6 * sMul + bob, ro: tYaw + 0.15, bias: 0.34
            });
          } else {
            const mapX = (lHdX + rHdX) * 0.5;
            const mapY = (lHdY + rHdY) * 0.5;
            const [mWx, mWy] = localToWorldXY(mapX, mapY, tYaw, 0, 1.6 * sMul);
            list.push({
              partKey: 'mapOpen', asset: parts.mapOpen,
              x: mWx, y: mWy, lift: (9.6 - state.walkBlend * 0.7) * sMul + bob,
              ro: tYaw, bias: 0.42
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id, code: Def.code, name: Def.name, outlineMode: 'actorUnified',
            skin: curSkin.id, footRadius: Def.footRadius, headZ: 25, centerZ: 13,
            blocks: Def.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(Def, 'npc');
})(window.PixelWorkshop);
