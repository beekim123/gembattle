'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 酒8 · 老寻宝客（酒馆氛围客座 NPC，+Y 正前，z=0 贴地）
  // 俯视高辨识特征：
  //   1. 豪迈微胖老冒险家：左眼黑皮眼罩 + 浓密灰白络腮胡 + 宽边旧皮帽 + 深苔褐旧厚皮大衣
  //   2. 异世界生态战利品彩蛋：右肩赤红龙鳞 + 腰间白粉盐晶串 + 鼓囊绿林落果袋
  //   3. 左手紧握泡沫大木酒杯 + 身旁高脚圆木凳；靠凳抿酒 / 张臂比划吹牛 / 微醺打盹惊醒 / 微醺溜达
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      skinDark:    '#b57d5c',
      skinMid:     '#deaa85',
      skinHi:      '#f5ceb0',
      coatDark:    '#382e21',
      coatMid:     '#5c4c37',
      coatHi:      '#857054',
      shirtDark:   '#8f836c',
      shirtMid:    '#c2b59b',
      shirtHi:     '#e6dcc5',
      beardDark:   '#787d85',
      beardMid:    '#b8bec7',
      beardHi:     '#e8edf2',
      hatDark:     '#2b1e16',
      hatMid:      '#4d3627',
      hatHi:       '#75543e',
      scaleDark:   '#82161a',
      scaleMid:    '#cc2929',
      scaleHi:     '#fa5f4d',
      saltDark:    '#c2a5b0',
      saltMid:     '#ebd2dc',
      saltHi:      '#fff2f7',
      pouchDark:   '#285c29',
      pouchMid:    '#489444',
      pouchHi:     '#7acc6e',
      woodDark:    '#57341d',
      woodMid:     '#8c5734',
      woodHi:      '#bf8154',
      metalDark:   '#594624',
      metalMid:    '#997b42',
      metalHi:     '#d4b46c',
      aleGold:     '#e8a825',
      foamMid:     '#e6e0d1',
      foamHi:      '#faf7f0',
      patchDark:   '#17151a',
      eyeDark:     '#12141a',
      eyeIris:     '#477a8c',
      eyeGlint:    '#f2f9ff'
    },
    glowKeys: [],
    parts: [
      'foot', 'leg', 'coat', 'shirt', 'belt', 'buckle',
      'scaleTrophy', 'saltTrophy', 'pouchTrophy',
      'head', 'beard', 'patch', 'eye', 'hat',
      'upperArm', 'forearm', 'mug', 'mugBand', 'mugFoam',
      'stool'
    ],
    noCrease: [
      ['eye', 'head'], ['beard', 'head'], ['patch', 'head'],
      ['hat', 'head'], ['mug', 'mugBand'], ['mug', 'mugFoam'],
      ['belt', 'buckle'], ['leg', 'foot']
    ],
    materials: {
      skin:  ['skinDark',  'skinMid',  'skinHi'],
      coat:  ['coatDark',  'coatMid',  'coatHi'],
      shirt: ['shirtDark', 'shirtMid', 'shirtHi'],
      beard: ['beardDark', 'beardMid', 'beardHi'],
      hat:   ['hatDark',   'hatMid',   'hatHi'],
      scale: ['scaleDark', 'scaleMid', 'scaleHi'],
      salt:  ['saltDark',  'saltMid',  'saltHi'],
      pouch: ['pouchDark', 'pouchMid', 'pouchHi'],
      wood:  ['woodDark',  'woodMid',  'woodHi'],
      metal: ['metalDark', 'metalMid', 'metalHi']
    },
    protectedParts: ['eye', 'patch', 'scaleTrophy', 'saltTrophy']
  });

  const SKINS = [
    {
      id: 'moss_leather', name: '苔褐旧皮', dot: '#5c4c37', outline: '#14100c',
      pal: {},
      fx: { aleA: '#f2be38', aleB: '#faf7f0', zzz: '#e8eef5' }
    },
    {
      id: 'sand_trench', name: '沙黄风衣', dot: '#c29855', outline: '#1a130b',
      pal: {
        coatDark:  '#785a2e', coatMid:  '#b58b4c', coatHi:  '#e0b977',
        hatDark:   '#4f361e', hatMid:   '#805a35', hatHi:   '#b08253',
        shirtDark: '#474f48', shirtMid: '#707d72', shirtHi: '#9ead9f',
        scaleDark: '#912214', scaleMid: '#db3c23', scaleHi: '#ff7252',
        pouchDark: '#3c5722', pouchMid: '#68913b', pouchHi: '#9cc765'
      },
      fx: { aleA: '#f5c242', aleB: '#fff9eb', zzz: '#edf2f7' }
    },
    {
      id: 'deep_sailor', name: '深青水手', dot: '#285e73', outline: '#0b141a',
      pal: {
        coatDark:  '#173745', coatMid:  '#285c70', coatHi:  '#46879e',
        hatDark:   '#1a2530', hatMid:   '#304354', hatHi:   '#4e6a82',
        shirtDark: '#918778', shirtMid: '#c4baaa', shirtHi: '#ebe2d3',
        scaleDark: '#8f242b', scaleMid: '#d6404a', scaleHi: '#ff7a80',
        pouchDark: '#1c5448', pouchMid: '#318a76', pouchHi: '#5ec2aa'
      },
      fx: { aleA: '#f0b83a', aleB: '#f5f2e6', zzz: '#e0f0fa' }
    }
  ];

  // 1. 厚实双腿与重皮靴
  function buildLegSeg(makeCanvas, rTop, rBot, hLen) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 3);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, SPEC.mat('hat'), SPEC.partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildBoot(makeCanvas) {
    const m = new VoxelModel(8, 9, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0.0, 2.3, 1.55, 1.55, 1.0, mat('hat'), partId.leg, true);
    m.paintEllipsoid(0, 1.0, 1.2, 1.85, 2.65, 1.25, mat('wood'), partId.foot, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.7 });
  }

  // 2. 豪迈微胖旧厚皮大衣躯干（含右肩赤红龙鳞 + 左腰白粉盐晶串 + 右腰绿林落果袋）
  function buildTorso(makeCanvas) {
    const m = new VoxelModel(16, 14, 14, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-6.0, 6.0, -5.0, 5.2, 0, 13, (x, y, z, X, Y) => {
      const dBelly = (Math.hypot(X / 5.1, (Y - 0.5) / 4.4, (z - 4.8) / 4.5) - 1) * 4.2;
      const dChest = (Math.hypot(X / 5.4, Y / 4.0, (z - 8.6) / 3.8) - 1) * 3.8;
      const dNeck  = (Math.hypot(X / 2.4, Y / 2.2, (z - 12.0) / 1.8) - 1) * 1.9;
      const d = smin(smin(dBelly, dChest, 1.2), dNeck, 0.9);
      if (d > 0) return;
      if (z >= 11.2) {
        m.setRaw(x, y, z, mat('skin'), partId.shirt);
      } else if (z >= 3.2 && z <= 4.6) {
        const isBuckle = Math.abs(X) <= 1.5 && Y > 3.2;
        m.setRaw(x, y, z, isBuckle ? mat('metal') : mat('hat'), isBuckle ? partId.buckle : partId.belt);
      } else if (Y > 2.4 && Math.abs(X) <= 1.8 && z >= 4.7 && z <= 10.8) {
        m.setRaw(x, y, z, mat('shirt'), partId.shirt);
      } else {
        m.setRaw(x, y, z, mat('coat'), partId.coat);
      }
    });
    // 厚皮大衣翻领
    m.paintCapsule(-2.4, 2.8, 10.8, -3.5, 2.2, 7.2, 1.15, 0.95, mat('coat'), partId.coat, true);
    m.paintCapsule( 2.4, 2.8, 10.8,  3.5, 2.2, 7.2, 1.15, 0.95, mat('coat'), partId.coat, true);

    // 生态彩蛋 1：右肩缝着一片醒目赤红大龙鳞（俯视一眼可见！）
    m.paintEllipsoid(4.7, 0.2, 10.4, 2.35, 2.45, 1.85, mat('scale'), partId.scaleTrophy, true);
    m.paintEllipsoid(5.4, 0.0, 9.2,  1.65, 1.80, 1.35, mat('scale'), partId.scaleTrophy, true);

    // 生态彩蛋 2：左腰挂着一小串白粉盐晶块
    m.paintEllipsoid(-5.4, 0.9, 4.4, 1.45, 1.35, 1.65, mat('salt'), partId.saltTrophy, true);
    m.paintEllipsoid(-5.8, -0.5, 3.2, 1.25, 1.15, 1.40, mat('salt'), partId.saltTrophy, true);
    m.paintEllipsoid(-4.8, 1.9, 3.1, 1.10, 1.10, 1.25, mat('salt'), partId.saltTrophy, true);

    // 生态彩蛋 3：右腰鼓囊的绿林落果采集袋
    m.paintEllipsoid(5.4, 0.6, 3.5, 1.85, 1.95, 2.05, mat('pouch'), partId.pouchTrophy, true);
    m.paintEllipsoid(5.5, 1.2, 5.1, 1.15, 1.15, 0.85, mat('metal'), partId.buckle, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.8 });
  }

  // 3. 老寻宝客头部（左眼黑皮眼罩 + 满脸灰白络腮胡 + 宽边旧皮帽）
  function buildHead(makeCanvas) {
    const W = 15, D = 15, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hz = 5.4, hy = 0.2;

    // 宽厚圆脸
    m.paintEllipsoid(0, hy, hz, 4.3, 4.2, 4.0, mat('skin'), partId.head, true);
    // 圆润红鼻头
    m.paintEllipsoid(0, hy + 4.2, hz - 0.1, 1.05, 0.95, 0.85, mat('skin'), partId.head, true);

    // 蓬松灰白大络腮胡（从两鬓包住下巴并垂下，俯视辨识度极高）
    m.paintEllipsoid(0, hy + 2.4, hz - 2.6, 3.9, 2.7, 2.5, mat('beard'), partId.beard, true);
    m.paintEllipsoid(0, hy + 3.4, hz - 1.3, 3.2, 1.5, 1.1, mat('beard'), partId.beard, true);
    m.paintEllipsoid(-3.6, hy + 0.5, hz - 1.4, 1.5, 2.1, 2.2, mat('beard'), partId.beard, true);
    m.paintEllipsoid( 3.6, hy + 0.5, hz - 1.4, 1.5, 2.1, 2.2, mat('beard'), partId.beard, true);
    // 后脑灰白短发
    m.paintEllipsoid(0, hy - 2.2, hz - 0.2, 4.1, 2.5, 3.2, mat('beard'), partId.beard, true);
    // 粗犷灰白右眉
    m.paintCapsule(1.0, hy + 3.7, hz + 1.8, 3.0, hy + 3.2, hz + 1.9, 0.72, 0.68, mat('beard'), partId.beard, true);

    // 宽边旧皮帽（z >= 8.2，留出前脸 0.6 俯视清晰视野）
    m.fillAABB(-6.8, 6.8, -6.8, 6.8, 8, 10, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 6.5, (Y + 0.2) / 6.3);
      const brimZ = 8.4 + Math.abs(X) * 0.08 - Y * 0.06;
      if (r <= 1.0 && Math.abs(z - brimZ) <= 0.85) {
        m.setRaw(x, y, z, mat('hat'), partId.hat);
      }
    });
    m.paintEllipsoid(0, -0.3, 10.4, 4.3, 4.3, 2.6, mat('hat'), partId.hat, true);
    // 帽带（金属扣）
    m.fillAABB(-4.6, 4.6, -4.6, 4.6, 9, 10, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 4.4, (Y + 0.3) / 4.4);
      if (z === 9 && r <= 1.04 && r >= 0.82) {
        const isClasp = Math.abs(X - 2.0) <= 1.0 && Y > 2.2;
        m.setRaw(x, y, z, isClasp ? mat('metal') : mat('coat'), isClasp ? partId.buckle : partId.hat);
      }
    });

    m.despeckle();
    m.applyArtShading(true);

    // 精雕双眼与左眼黑皮眼罩（-X 为角色左眼，+X 为角色右眼）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeZ = Math.round(hz + 0.6);

    // 左眼黑皮眼罩 + 斜绑带
    for (const dx of [-3, -2, -1]) {
      const ex = Math.round(hw + dx);
      let sy = -1;
      for (let y = D - 1; y >= Math.round(hd); y--) {
        if (m.getPartId(ex, y, eyeZ) === partId.head) { sy = y; break; }
      }
      if (sy < 0) continue;
      for (const dz of [0, 1]) {
        m.setRaw(ex, sy, eyeZ + dz, keyToId.patchDark, partId.patch);
      }
    }
    // 眼罩斜带向右额角延伸
    for (let t = 0; t <= 4; t++) {
      const sx = Math.round(hw + lerp(-1.2, 2.2, t / 4));
      const sz = Math.round(lerp(eyeZ + 1, eyeZ + 2.4, t / 4));
      for (let y = D - 1; y >= Math.round(hd); y--) {
        if (m.getPartId(sx, y, sz) === partId.head) {
          m.setRaw(sx, y, sz, keyToId.patchDark, partId.patch);
          break;
        }
      }
    }

    // 右眼清晰 2×2 炯炯眼神（eyeGlint 不进 glowKeys）
    const rxIn = Math.round(hw + 1.5), rxOut = Math.round(hw + 2.5);
    for (const ex of [rxIn, rxOut]) {
      let sy = -1;
      for (let y = D - 1; y >= Math.round(hd); y--) {
        if (m.getPartId(ex, y, eyeZ) === partId.head) { sy = y; break; }
      }
      if (sy < 0) continue;
      for (const dz of [0, 1]) {
        const isOut = ex === rxOut;
        const kId = (dz === 1 && !isOut) ? keyToId.eyeGlint : (dz === 1 ? keyToId.eyeDark : keyToId.eyeIris);
        m.setRaw(ex, sy, eyeZ + dz, kId, partId.eye);
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 5.8 });
  }

  // 4. 两段手臂（厚大衣袖大臂 + 卷袖小臂与粗壮手掌）
  function buildUpperArm(makeCanvas) {
    const m = new VoxelModel(7, 8, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -1.6, 3.8, 0, 2.2, 2.8, 1.85, 1.55, mat('coat'), partId.upperArm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.3 });
  }

  function buildForearm(makeCanvas) {
    const m = new VoxelModel(7, 9, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -2.0, 2.8, 0, 1.0, 2.8, 1.52, 1.35, mat('coat'), partId.forearm, true);
    m.paintEllipsoid(0, 1.3, 2.8, 1.45, 0.75, 1.45, mat('shirt'), partId.shirt, true);
    m.paintEllipsoid(0, 2.6, 2.8, 1.35, 1.45, 1.35, mat('skin'), partId.forearm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.1 });
  }

  // 5. 超大木质麦酒杯（双金属箍 + 金黄麦酒 + 厚白泡沫，绝不进 glowKeys）
  function buildMug(makeCanvas) {
    const m = new VoxelModel(8, 9, 9, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-3.0, 3.0, -3.5, 3.5, 0, 7, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      if (z >= 1 && z <= 5 && r <= 2.35) {
        const isBand = (z === 2 || z === 5) && r >= 1.85;
        m.setRaw(x, y, z, isBand ? mat('metal') : mat('wood'), isBand ? partId.mugBand : partId.mug);
      } else if (z === 6 && r <= 2.15) {
        m.setRaw(x, y, z, keyToId.aleGold, partId.mugFoam);
      }
    });
    // 厚白泡沫帽（带溢出小泡泡）
    m.paintEllipsoid(0, 0.1, 6.9, 2.25, 2.25, 1.25, keyToId.foamHi, partId.mugFoam, true);
    m.paintEllipsoid(1.5, 1.2, 6.0, 0.95, 0.95, 1.05, keyToId.foamMid, partId.mugFoam, true);
    // 杯把（在 -Y 侧方便手握）
    m.paintCapsule(0, -2.2, 4.5, 0, -3.2, 3.5, 0.65, 0.65, mat('wood'), partId.mug, true);
    m.paintCapsule(0, -3.2, 3.5, 0, -2.2, 2.2, 0.65, 0.65, mat('wood'), partId.mug, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.6 });
  }

  // 6. 简朴高脚圆木凳（待机/吹牛/打盹时放在身旁靠着，巡游时收起）
  function buildStool(makeCanvas) {
    const m = new VoxelModel(11, 11, 11, SPEC);
    const { mat, partId } = SPEC;
    // 圆凳面（z = 8..9）
    m.fillAABB(-4.6, 4.6, -4.6, 4.6, 8, 10, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      if (z >= 8 && z <= 9 && r <= 4.2) {
        m.setRaw(x, y, z, mat('wood'), partId.stool);
      }
    });
    // 4 条略外八的圆木凳腿 + 横撑
    const legs = [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]];
    for (const [lx, ly] of legs) {
      m.paintCapsule(lx * 0.85, ly * 0.85, 8.2, lx * 1.15, ly * 1.15, 0.5, 0.95, 0.95, mat('wood'), partId.stool, true);
    }
    m.paintCapsule(-2.7, 0, 3.4, 2.7, 0, 3.4, 0.72, 0.72, mat('wood'), partId.stool, true);
    m.paintCapsule(0, -2.7, 3.4, 0, 2.7, 3.4, 0.72, 0.72, mat('wood'), partId.stool, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2 });
  }

  const VeteranDef = {
    id: 'npc_tavern_veteran',
    code: '酒8',
    name: '老寻宝客',
    tag: '酒馆氛围 · 生态吹牛客',
    summary: '豪迈微胖老冒险家：左眼黑皮眼罩大胡子 + 缝满红龙鳞/白盐晶/绿果袋的旧厚皮大衣 + 大酒杯与高脚圆凳',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 7.4,
    ecoWeight: 1.05,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: ['24格豪迈微胖人形', '二足微醺稳步IK', '两段手臂FK滞后随动', '三大生态战利品挂饰', '张臂比划吹牛', '打盹惊醒循环'],
    soulHabit: '靠着高脚圆凳悠闲抿酒张望，兴起就张开双臂夸张比划巨兽有多大，喝晕了还会点头打盹猛地惊醒',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },
    actions: [
      { id: 'idle',   name: '靠凳抿酒', loop: true,  status: 'done' },
      { id: 'boast',  name: '比划吹牛', loop: false, duration: 2.6, status: 'done' },
      { id: 'doze',   name: '微醺打盹', loop: false, duration: 3.0, status: 'done' },
      { id: 'patrol', name: '微醺溜达', loop: true,  status: 'done' }
    ],

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legThigh:  buildLegSeg(makeCanvas, 1.90, 1.62, 4.1),
        legShin:   buildLegSeg(makeCanvas, 1.58, 1.45, 4.1),
        boot:      buildBoot(makeCanvas),
        torso:     buildTorso(makeCanvas),
        head:      buildHead(makeCanvas),
        upperArmL: buildUpperArm(makeCanvas),
        forearmL:  buildForearm(makeCanvas),
        upperArmR: buildUpperArm(makeCanvas),
        forearmR:  buildForearm(makeCanvas),
        mug:       buildMug(makeCanvas),
        stool:     buildStool(makeCanvas)
      };

      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.4, hipY: -0.1, hipZ: 7.5, restX: -2.6, restY: 0.2, group: 0, L1: 4.1, L2: 4.1, bendDir: 1 },
        { id: 'R', hipX:  2.4, hipY: -0.1, hipZ: 7.5, restX:  2.6, restY: 0.2, group: 1, L1: 4.1, L2: 4.1, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 1.9, stepDuration: 0.19, stepHeight: 2.1, strideAnticipation: 0.38 });

      const headSpring = new SpringDamper1D(0, 110, 7.6);
      const bodyBounce = new SpringDamper1D(0, 165, 8.2);
      const wakeSpring = new SpringDamper1D(0, 220, 7.5);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        walkBlend: 0, stepPhase: 0,
        tiltX: 0, tiltY: 0,
        tipsySway: 0,
        sipAmt: 0, boastAmt: 0, laughAmt: 0,
        dozeNod: 0, wakeJolt: 0,
        lookTarget: 0, lookTimer: 1.4,
        vfxCd: 0, curAction: 'idle', actionTime: 0,
        showStool: true,
        stoolX: (opts.homeX ?? 0) - 7.8, stoolY: (opts.homeY ?? 0) - 2.6
      };
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: VeteranDef,
        cachePrefix: `npc_vet_${Math.random().toString(36).slice(2, 7)}`,
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
          state.sipAmt = 0; state.boastAmt = 0; state.laughAmt = 0;
          state.dozeNod = 0; state.wakeJolt = 0;
          const [sx, sy] = localToWorldXY(hx, hy, hyaw, -7.8, -2.6);
          state.stoolX = sx; state.stoolY = sy;
          gait.reset(hx, hy, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const fx = curSkin.fx || SKINS[0].fx;

          let act = (eco && eco.action) ? eco.action : (eco && eco.patrol ? 'patrol' : 'idle');
          const actT = (eco && eco.actionTime) || 0;
          const prevAct = state.curAction;
          state.curAction = act;
          state.actionTime = actT;

          const isPatrol = act === 'patrol';
          const isBoast  = act === 'boast';
          const isDoze   = act === 'doze';

          if (isPatrol) {
            Propulsion.multiLegWalk(state, dt, time, { ...params, speed: (params.speed ?? 1.0) * 0.78 }, {
              ...eco, patrol: true, walkStyle: 'heavy', baseLift: 0
            });
          } else {
            Propulsion.multiLegWalk(state, dt, time, params, {
              ...eco, patrol: false, baseLift: 0
            });
          }
          state.z = 0;

          const spdNow = Math.hypot(state.vx, state.vy);
          state.walkBlend = lerp(state.walkBlend, isPatrol ? clamp(spdNow / 7.5, 0, 1) : 0, expSmooth(dt, 9));
          state.stepPhase += dt * (2.6 + state.walkBlend * 7.2) * gFreq;

          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 0.95,
            stepHeight: 2.1 * sMul,
            stepThreshold: 1.9 * sMul
          });
          state.tiltX = lerp(state.tiltX || 0, gaitRes.tiltX * 0.60 * sMul, expSmooth(dt, 11));
          state.tiltY = lerp(state.tiltY || 0, gaitRes.tiltY * 0.60 * sMul, expSmooth(dt, 11));

          // 防脱胯限幅
          const maxFootOffset = 3.6 * sMul;
          for (const leg of gait.legs) {
            const [idealX, idealY] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
            const dx = leg.footX - idealX, dy = leg.footY - idealY;
            const d = Math.hypot(dx, dy);
            if (d > maxFootOffset) {
              leg.footX = idealX + (dx / d) * maxFootOffset;
              leg.footY = idealY + (dy / d) * maxFootOffset;
            }
          }

          if (gaitRes.landed.length > 0) {
            bodyBounce.impulse(7.2 * sp);
            for (const l of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.65 * sMul);
            }
          }

          // 站桩/吹牛/打盹时身旁摆高脚圆木凳，巡游时收起
          state.showStool = !isPatrol;
          if (!isPatrol) {
            const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, -7.8 * sMul, -2.4 * sMul);
            state.stoolX = lerp(state.stoolX, sx, expSmooth(dt, 8));
            state.stoolY = lerp(state.stoolY, sy, expSmooth(dt, 8));
          }

          let tgtSip = 0, tgtBoast = 0, tgtLaugh = 0, tgtDoze = 0, tgtHeadYaw = 0, tgtTipsy = 0;

          if (isBoast) {
            const u = clamp(actT / 2.6, 0, 1);
            // 0.08..0.62 突然张开双臂夸张比划「有这么大」；0.62..0.95 仰头哈哈大笑
            tgtBoast = smoothstep(0.06, 0.22, u) * (1 - smoothstep(0.56, 0.72, u));
            tgtLaugh = smoothstep(0.54, 0.68, u) * (1 - smoothstep(0.90, 1.0, u));
            tgtHeadYaw = Math.sin(u * Math.PI * 5) * 0.16 * tgtBoast + Math.sin(time * 16) * 0.08 * tgtLaugh;

            // 张臂激动手晃酒杯甩出几滴金黄酒花粒子
            state.vfxCd -= dt;
            if (vfx && state.vfxCd <= 0 && u > 0.14 && u < 0.56) {
              state.vfxCd = 0.12;
              const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, (-8.8 - tgtBoast * 2.5) * sMul, 2.6 * sMul);
              vfx.spawnParticle(
                mx, my, (14.5 + Math.random() * 2.5) * sMul,
                (Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, 10 + Math.random() * 6,
                0.55 + Math.random() * 0.2, 1.35 + Math.random() * 0.4,
                Math.random() < 0.62 ? fx.aleA : fx.aleB, false, 36
              );
            }
          } else if (isDoze) {
            const u = clamp(actT / 3.0, 0, 1);
            // 0..0.76 头一点一点往下垂，0.78 猛地惊醒抓紧酒杯
            if (u < 0.76) {
              const stepNod = (u / 0.76);
              tgtDoze = clamp(stepNod * 0.72 + Math.sin(u * Math.PI * 6) * 0.18, 0, 1);
              tgtHeadYaw = Math.sin(time * 1.6) * 0.14;
              // 淡白睡眠小气泡缓缓上飘
              state.vfxCd -= dt;
              if (vfx && state.vfxCd <= 0 && u > 0.15) {
                state.vfxCd = 0.34;
                const [bx, by] = localToWorldXY(state.x, state.y, state.yaw, 1.2 * sMul, 4.4 * sMul);
                vfx.spawnParticle(
                  bx, by, (17.5 + Math.random() * 1.5) * sMul,
                  (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2.4, 6.2 + Math.random() * 2.2,
                  1.15, 1.25 + Math.random() * 0.45,
                  fx.zzz, false, -1.8
                );
              }
            } else {
              tgtDoze = 0;
              if (u < 0.84 && state.wakeJolt < 0.5) {
                wakeSpring.impulse(18.0 * sp);
                bodyBounce.impulse(10.0 * sp);
                state.wakeJolt = 1;
              }
              tgtHeadYaw = Math.sin((u - 0.76) * 28) * 0.22 * (1 - u);
            }
          } else if (isPatrol) {
            // 微醺摇晃但脚步稳稳踩实
            tgtTipsy = Math.sin(state.stepPhase * 0.65) * 0.16 * state.walkBlend;
            tgtHeadYaw = Math.sin(time * 1.8) * 0.18;
            state.wakeJolt = 0;
          } else {
            // idle：靠凳悠闲小口抿酒、不时左右张望
            state.wakeJolt = 0;
            const sipCy = (time * 0.32) % 1;
            tgtSip = (sipCy > 0.58 && sipCy < 0.88) ? Math.sin(((sipCy - 0.58) / 0.30) * Math.PI) : 0;
            state.lookTimer -= dt;
            if (state.lookTimer <= 0) {
              state.lookTimer = 1.2 + Math.random() * 1.6;
              const r = Math.random();
              state.lookTarget = r < 0.3 ? 0 : (r < 0.65 ? -0.45 : 0.45);
            }
            tgtHeadYaw = tgtSip > 0.2 ? -0.15 : state.lookTarget;
            tgtTipsy = Math.sin(time * 1.5) * 0.05;
          }

          if (prevAct !== act) state.wakeJolt = 0;

          state.sipAmt   = lerp(state.sipAmt,   tgtSip,   expSmooth(dt, 7.5));
          state.boastAmt = lerp(state.boastAmt, tgtBoast, expSmooth(dt, 11.5));
          state.laughAmt = lerp(state.laughAmt, tgtLaugh, expSmooth(dt, 10.0));
          state.dozeNod  = lerp(state.dozeNod,  tgtDoze,  expSmooth(dt, 8.5));
          state.tipsySway = lerp(state.tipsySway, tgtTipsy, expSmooth(dt, 7.5));

          headSpring.update(dt, tgtHeadYaw, 110 * sp, 7.6);
          bodyBounce.update(dt, 0, 165 * sp, 8.2);
          wakeSpring.update(dt, 0, 220 * sp, 7.5);

          instance.footContacts = gait.legs.map(l => ({
            x: l.footX, y: l.footY, z: l.footZ, r: 2.3 * sMul
          }));
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const bodyYaw = yw + state.tipsySway;
          const hYaw = bodyYaw + clamp(headSpring.x, -0.58, 0.58);

          const breath = Math.sin(state.stepPhase * 0.55) * 0.35;
          const walkBob = Math.abs(Math.sin(state.stepPhase)) * 0.72 * state.walkBlend;
          const laughBob = Math.sin(state.actionTime * 19.0) * 0.55 * state.laughAmt;
          const joltLift = clamp(wakeSpring.x * 0.10, -0.4, 1.4);
          const bob = clamp(bodyBounce.x * 0.05 + breath + walkBob + laughBob + joltLift, -0.8, 1.6) * sMul;

          // 1. 身旁简朴高脚圆木凳
          if (state.showStool) {
            list.push({
              partKey: 'stool', asset: parts.stool,
              x: state.stoolX, y: state.stoolY, lift: 0, ro: yw + 0.25, bias: -0.25
            });
          }

          // 2. 二足稳步 IK 双腿
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const hx = l.hipWX + (state.tiltX || 0);
            const hy = l.hipWY + (state.tiltY || 0);
            const hz = l.hipWZ + bob * 0.45;
            const segs = [
              { k: 'legThigh', x: lerp(hx, l.kneeX, 0.30), y: lerp(hy, l.kneeY, 0.30), z: lerp(hz, l.kneeZ, 0.30), b: -0.35, sym: 90 },
              { k: 'legShin',  x: lerp(l.kneeX, l.footX, 0.48), y: lerp(l.kneeY, l.footY, 0.48), z: lerp(l.kneeZ, l.footZ + 1.5 * sMul, 0.48), b: -0.26, sym: 90 },
              { k: 'boot',     x: l.footX, y: l.footY, z: l.footZ, b: -0.18, sym: 0 }
            ];
            for (const pt of segs) {
              const item = {
                partKey: pt.k, asset: parts[pt.k],
                x: pt.x, y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === 'boot' ? 0 : 1.9 * sMul)),
                ro: yw, bias: pt.b
              };
              if (pt.sym) item.symDeg = pt.sym;
              list.push(item);
            }
          }

          // 3. 豪迈微胖旧厚皮大衣躯干（含红龙鳞、白盐晶、绿果袋）
          const swaySide = Math.sin(state.stepPhase * 0.65) * 0.85 * state.walkBlend;
          const [tx, ty] = localToWorldXY(
            state.x + (state.tiltX || 0), state.y + (state.tiltY || 0),
            yw, swaySide * sMul, (0.2 + state.dozeNod * 0.9 - state.laughAmt * 0.8) * sMul
          );
          const torsoLift = 5.6 * sMul + bob;
          list.push({
            partKey: 'torso', asset: parts.torso,
            x: tx, y: ty, lift: torsoLift, ro: bodyYaw, bias: 0.15
          });

          // 4. 眼罩络腮胡大头（打盹下垂，大笑仰头微抬）
          const [hdX, hdY] = localToWorldXY(tx, ty, bodyYaw, 0, (0.3 + state.dozeNod * 1.9 - state.laughAmt * 1.1) * sMul);
          const headZ = torsoLift + (10.8 - state.dozeNod * 2.1 + state.laughAmt * 0.8 + joltLift * 0.5) * sMul;
          list.push({
            partKey: 'head', asset: parts.head,
            x: hdX, y: hdY, lift: headZ, ro: hYaw, bias: 0.48
          });

          // 5. 两段手臂 FK（大臂引领 + 小臂滞后 0.75 rad 随动）
          const shZ = torsoLift + 7.6 * sMul;
          const [lShX, lShY] = localToWorldXY(tx, ty, bodyYaw, -5.2 * sMul, 0.4 * sMul);
          const [rShX, rShY] = localToWorldXY(tx, ty, bodyYaw,  5.2 * sMul, 0.4 * sMul);

          // 左臂（握大木酒杯）：平时稳端胸前，抿酒抬近嘴边，吹牛大力向外张开，打盹微垂，惊醒抓紧
          const walkSwing = Math.sin(state.stepPhase) * 0.28 * state.walkBlend;
          const walkSwingLag = Math.sin(state.stepPhase - 0.75) * 0.34 * state.walkBlend;
          const lUpperAng = bodyYaw + 0.18 + walkSwing * 0.45
                          + state.boastAmt * 1.25 - state.sipAmt * 0.42;
          const lForeAng  = lUpperAng - 0.32 + walkSwingLag * 0.35
                          + state.boastAmt * 0.25 - state.sipAmt * 0.48;
          const lLiftZ    = (state.sipAmt * 3.0 + state.boastAmt * 2.4 - state.dozeNod * 1.4 + joltLift * 1.2) * sMul;

          const [lUpWx, lUpWy] = localToWorldXY(lShX, lShY, lUpperAng, 0, 1.6 * sMul);
          const [lElX, lElY]   = localToWorldXY(lShX, lShY, lUpperAng, 0, 3.6 * sMul);
          const [lFoWx, lFoWy] = localToWorldXY(lElX, lElY, lForeAng,  0, 2.0 * sMul);
          const [lHdX, lHdY]   = localToWorldXY(lElX, lElY, lForeAng,  0, 4.4 * sMul);

          list.push({ partKey: 'upperArmL', asset: parts.upperArmL, x: lUpWx, y: lUpWy, lift: shZ - 2.4 * sMul + lLiftZ * 0.45, ro: lUpperAng, bias: 0.24 });
          list.push({ partKey: 'forearmL',  asset: parts.forearmL,  x: lFoWx, y: lFoWy, lift: shZ - 2.6 * sMul + lLiftZ, ro: lForeAng, bias: 0.32 });

          // 右臂：吹牛时猛地向外大大张开比划「有这么大！」，大笑拍肚/挥手，巡游自然摆臂
          const rUpperAng = bodyYaw - 0.24 - walkSwing
                          - state.boastAmt * 1.32 + state.laughAmt * 0.35;
          const rForeAng  = rUpperAng + 0.25 - walkSwingLag
                          - state.boastAmt * 0.28 + state.laughAmt * 0.55;
          const rLiftZ    = (state.boastAmt * 2.6 + state.laughAmt * 1.8 - state.dozeNod * 1.5) * sMul;

          const [rUpWx, rUpWy] = localToWorldXY(rShX, rShY, rUpperAng, 0, 1.6 * sMul);
          const [rElX, rElY]   = localToWorldXY(rShX, rShY, rUpperAng, 0, 3.6 * sMul);
          const [rFoWx, rFoWy] = localToWorldXY(rElX, rElY, rForeAng,  0, 2.0 * sMul);

          list.push({ partKey: 'upperArmR', asset: parts.upperArmR, x: rUpWx, y: rUpWy, lift: shZ - 2.4 * sMul + rLiftZ * 0.45, ro: rUpperAng, bias: 0.24 });
          list.push({ partKey: 'forearmR',  asset: parts.forearmR,  x: rFoWx, y: rFoWy, lift: shZ - 2.6 * sMul + rLiftZ, ro: rForeAng, bias: 0.30 });

          // 6. 左手紧握超大泡沫木酒杯（锁在左手掌枢轴）
          const mugYaw = lForeAng + 0.12 * Math.sin(state.actionTime * 10) * state.boastAmt;
          const [mgX, mgY] = localToWorldXY(lHdX, lHdY, mugYaw, 0, 1.8 * sMul);
          list.push({
            partKey: 'mug', asset: parts.mug,
            x: mgX, y: mgY, lift: shZ - 2.0 * sMul + lLiftZ, ro: mugYaw, bias: 0.38
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: VeteranDef.id, code: VeteranDef.code, name: VeteranDef.name, outlineMode: 'actorUnified',
            skin: curSkin.id, footRadius: VeteranDef.footRadius, headZ: 25, centerZ: 13,
            blocks: VeteranDef.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(VeteranDef, 'npc');
})(window.PixelWorkshop);
