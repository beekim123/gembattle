'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, lerp, smoothstep, smin, localToWorldXY, pivotToWorldXY, expSmooth } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 酒1 · 工会任务接待员（+Y 正前，z=0 贴地，总高约 25 格）
  // 辨识核心：藏青金边短披肩制服 + 象牙白衬领 + 羽饰斜檐小帽 + 朱红封蜡印袋
  //           + 左手厚实木夹红黄任务卷宗 + 右手硕大黄铜工会印章
  // 清晰铁律：0 glowKeys、0 常态拉伸、<= 48 色且 0 重色、0 禁用字
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      skinDark:     '#b57c5c',
      skinMid:      '#e3a884',
      skinHi:       '#ffd1b3',
      navyDark:     '#162442',
      navyMid:      '#263f73',
      navyHi:       '#4366ab',
      goldDark:     '#996912',
      goldMid:      '#dea324',
      goldHi:       '#ffe169',
      ivoryDark:    '#9c9384',
      ivoryMid:     '#d6cec0',
      ivoryHi:      '#faf5eb',
      waxDark:      '#7d151b',
      waxMid:       '#c9282e',
      waxHi:        '#ff5c54',
      woodDark:     '#452918',
      woodMid:      '#784b2c',
      woodHi:       '#ad7449',
      paperDark:    '#b39a6b',
      paperMid:     '#e6d2a1',
      paperHi:      '#fff3cc',
      yellowDark:   '#b58814',
      yellowMid:    '#f0c329',
      yellowHi:     '#ffeb7a',
      leatherDark:  '#2e1e15',
      leatherMid:   '#573928',
      leatherHi:    '#855b42',
      hairDark:     '#382115',
      hairMid:      '#633b25',
      hairHi:       '#915d3d',
      eyeDark:      '#10121a',
      eyeIris:      '#3876b5',
      eyeGlint:     '#f2f9ff',
      mouthDark:    '#7a3b36'
    },
    glowKeys: [],
    parts: [
      'foot', 'leg', 'tunic', 'cape', 'trim', 'collar', 'belt', 'pouch',
      'head', 'hair', 'eye', 'mouth', 'hat', 'feather', 'badge',
      'upperArm', 'forearm', 'hand', 'board', 'paper', 'paperY', 'seal', 'stampWood', 'stampBrass', 'quill'
    ],
    noCrease: [
      ['eye', 'head'], ['mouth', 'head'], ['hair', 'head'], ['leg', 'foot'],
      ['collar', 'tunic'], ['trim', 'cape'], ['badge', 'hat'], ['feather', 'hat'],
      ['paper', 'board'], ['paperY', 'board'], ['seal', 'paper'], ['stampWood', 'stampBrass'],
      ['forearm', 'hand']
    ],
    materials: {
      skin:    ['skinDark',    'skinMid',    'skinHi'],
      navy:    ['navyDark',    'navyMid',    'navyHi'],
      gold:    ['goldDark',    'goldMid',    'goldHi'],
      ivory:   ['ivoryDark',   'ivoryMid',   'ivoryHi'],
      wax:     ['waxDark',     'waxMid',     'waxHi'],
      wood:    ['woodDark',    'woodMid',    'woodHi'],
      paper:   ['paperDark',   'paperMid',   'paperHi'],
      yellow:  ['yellowDark',  'yellowMid',  'yellowHi'],
      leather: ['leatherDark', 'leatherMid', 'leatherHi'],
      hair:    ['hairDark',    'hairMid',    'hairHi']
    },
    protectedParts: ['eye', 'mouth']
  });

  const SKINS = [
    {
      id: 'navy_gold',
      name: '藏青金徽',
      dot: '#263f73',
      outline: '#0e1424',
      pal: {}
    },
    {
      id: 'emerald_patrol',
      name: '翠绿巡查',
      dot: '#1f7a55',
      outline: '#0b1c15',
      pal: {
        navyDark: '#124230', navyMid: '#1f7a55', navyHi: '#42b383',
        waxDark:  '#8f3914', waxMid:  '#d95d22', waxHi:  '#ff914d',
        eyeIris:  '#2e9468'
      }
    },
    {
      id: 'crimson_envoy',
      name: '绛红特派',
      dot: '#8f1f32',
      outline: '#1f0b11',
      pal: {
        navyDark: '#4d111c', navyMid: '#8f1f32', navyHi: '#c94057',
        waxDark:  '#1d3566', waxMid:  '#345ba8', waxHi:  '#6490e3',
        eyeIris:  '#a63f4f'
      }
    }
  ];

  // 1. 双足分节部件（大腿 / 小腿 / 利落短皮靴）
  function buildLegSeg(makeCanvas, rTop, rBot, hLen, useCloth) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 3);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat(useCloth ? 'navy' : 'leather'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildBoot(makeCanvas) {
    const m = new VoxelModel(7, 9, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, -0.2, 2.3, 1.35, 1.35, 1.2, mat('leather'), partId.leg, true);
    m.paintEllipsoid(0, 1.1, 1.2, 1.65, 2.55, 1.25, mat('leather'), partId.foot, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5 });
  }

  // 2. 躯干：利落藏青制服 + 亮金镶边短披肩 + 象牙白衬领 + 腰间朱红封蜡印袋
  function buildTorso(makeCanvas) {
    const m = new VoxelModel(15, 13, 13, SPEC);
    const { mat, partId } = SPEC;
    // 主制服上身与微张下摆
    m.fillAABB(-5.5, 5.5, -4.8, 4.8, 0, 12, (x, y, z, X, Y) => {
      const rx = lerp(4.4, 3.8, clamp(z / 10, 0, 1));
      const ry = lerp(3.4, 3.0, clamp(z / 10, 0, 1));
      const dBody = Math.hypot(X / rx, Y / ry);
      if (dBody <= 1.0 && z >= 1 && z <= 10) {
        m.setRaw(x, y, z, mat('navy'), partId.tunic);
      }
      // 金色前襟双排扣纹与腰带
      if (z >= 4 && z <= 5 && dBody <= 1.06 && dBody >= 0.72) {
        m.setRaw(x, y, z, mat('leather'), partId.belt);
      }
      // 短披肩（覆盖双肩与后背，带亮金外沿）
      if (z >= 6 && z <= 10.5) {
        const capeRx = lerp(5.4, 4.4, clamp((z - 6) / 4.5, 0, 1));
        const capeRy = lerp(4.4, 3.5, clamp((z - 6) / 4.5, 0, 1));
        const dCape = Math.hypot(X / capeRx, (Y + 0.4) / capeRy);
        const frontOpen = Y > 1.6 && Math.abs(X) < 1.8 && z < 9;
        if (dCape <= 1.0 && !frontOpen && (Y <= 2.2 || z >= 8)) {
          const isTrim = (z === 6) || (dCape >= 0.84 && Y <= 1.8);
          m.setRaw(x, y, z, mat(isTrim ? 'gold' : 'navy'), isTrim ? partId.trim : partId.cape);
        }
      }
    });
    // 象牙白立衬领与领巾
    m.paintEllipsoid(0, 0.5, 10.6, 2.7, 2.6, 1.4, mat('ivory'), partId.collar, true);
    m.paintEllipsoid(0, 2.6, 9.2, 1.5, 1.1, 1.7, mat('ivory'), partId.collar, true);
    // 胸前金徽扣
    m.paintEllipsoid(0, 3.3, 9.6, 0.9, 0.7, 0.9, mat('gold'), partId.trim, true);
    // 腰带金扣
    m.paintEllipsoid(0, 3.4, 4.5, 1.2, 0.8, 1.0, mat('gold'), partId.trim, true);
    // 右腰侧醒目朱红封蜡印袋
    m.paintEllipsoid(4.3, 1.0, 3.4, 1.7, 1.5, 2.0, mat('wax'), partId.pouch, true);
    m.paintEllipsoid(4.5, 1.2, 4.8, 1.2, 1.1, 0.8, mat('gold'), partId.trim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.2 });
  }

  // 3. 头部：清爽人型五官 + 齐整栗发 + 表面扫描落点 2x2 锐利双眼
  function buildHead(makeCanvas) {
    const W = 11, D = 11, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hz = 4.6;
    m.paintEllipsoid(0, 0, hz, 3.9, 3.8, 4.0, mat('skin'), partId.head, true);
    // 齐整后梳栗发与鬓角
    m.fillAABB(-4.5, 4.5, -4.5, 4.2, 2, 9, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 4.25, (Y + 0.35) / 4.1, (z - (hz + 0.8)) / 4.1);
      if (r <= 1.0 && (Y < 1.2 || z > hz + 2.2 || (Math.abs(X) > 2.8 && Y < 2.2))) {
        m.setRaw(x, y, z, mat('hair'), partId.hair);
      }
    });
    // 鼻尖与微笑小口
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    m.setRaw(Math.round(hw), Math.round(hd + 3.9), Math.round(hz - 0.2), mat('skin'), partId.head);
    for (const dx of [-1, 0, 1]) {
      m.setRaw(Math.round(hw + dx), Math.round(hd + 3.5), Math.round(hz - 1.7), keyToId.mouthDark, partId.mouth);
    }
    m.despeckle();
    m.applyArtShading(true);

    // 表面扫描落点 2x2 锐利双眼（eyeGlint 不进 glowKeys）
    const eyeZ = Math.round(hz + 0.6);
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.7);
      let sy = -1;
      for (let y = D - 2; y >= 1; y--) {
        if (m.getPartId(ex, y, eyeZ) === partId.head) { sy = y; break; }
      }
      if (sy < 0) sy = Math.round(hd + 3.6);
      for (const dx of [0, s]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dx === 0) ? keyToId.eyeGlint : (dx === 0 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(ex + dx, sy, eyeZ + dz, kId, partId.eye);
        }
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.2 });
  }

  // 4. 精致羽饰斜檐小帽（藏青帽身 + 金边金徽 + 高翘雪白羽毛）
  function buildHat(makeCanvas) {
    const m = new VoxelModel(14, 15, 11, SPEC);
    const { mat, partId } = SPEC;
    // 斜檐宽边
    m.fillAABB(-6.2, 6.2, -5.8, 6.5, 0, 5, (x, y, z, X, Y) => {
      const tiltZ = 1.6 + X * 0.16 - Y * 0.08;
      if (Math.abs(z - tiltZ) <= 0.95) {
        const dBrim = Math.hypot(X / 5.6, (Y - 0.5) / 5.8);
        if (dBrim <= 1.0) {
          const isRim = dBrim >= 0.80;
          m.setRaw(x, y, z, mat(isRim ? 'gold' : 'navy'), isRim ? partId.trim : partId.hat);
        }
      }
    });
    // 帽冠
    m.paintEllipsoid(-0.2, -0.2, 4.0, 4.0, 4.0, 2.4, mat('navy'), partId.hat, true);
    // 前额亮金工会帽徽
    m.paintEllipsoid(0, 3.8, 3.6, 1.35, 0.9, 1.35, mat('gold'), partId.badge, true);
    // 左侧高翘象牙白羽毛
    m.paintCapsule(-3.6, 0.8, 3.6, -5.0, -1.6, 7.6, 1.05, 1.25, mat('ivory'), partId.feather, true);
    m.paintCapsule(-5.0, -1.6, 7.6, -4.6, -4.4, 9.4, 1.15, 0.75, mat('ivory'), partId.feather, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5 });
  }

  // 5. 两段手臂（大臂 / 小臂含手掌）
  function buildUpperArm(makeCanvas) {
    const m = new VoxelModel(6, 8, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -1.0, 3.2, 0, 2.2, 2.2, 1.45, 1.3, mat('navy'), partId.upperArm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0 });
  }

  function buildForearm(makeCanvas) {
    const m = new VoxelModel(6, 9, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -1.4, 2.6, 0, 1.8, 2.6, 1.25, 1.15, mat('ivory'), partId.forearm, true);
    m.paintEllipsoid(0, 2.8, 2.6, 1.25, 1.35, 1.2, mat('skin'), partId.hand, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0 });
  }

  // 6. 标志道具 A：厚实木夹任务卷宗（贴红、黄两色委托纸 + 朱红蜡印）
  function buildClipboard(makeCanvas) {
    const m = new VoxelModel(11, 12, 8, SPEC);
    const { mat, partId } = SPEC;
    // 略微倾斜的厚实胡桃木夹板
    m.fillAABB(-4.5, 4.5, -4.8, 4.8, 0, 7, (x, y, z, X, Y) => {
      const planeZ = 2.6 + Y * 0.28;
      if (Math.abs(X) <= 3.8 && Math.abs(Y) <= 4.3 && Math.abs(z - planeZ) <= 0.85) {
        m.setRaw(x, y, z, mat('wood'), partId.board);
      }
      // 底层米白委托纸
      if (X >= -3.1 && X <= 2.4 && Y >= -3.4 && Y <= 3.3 && Math.abs(z - (planeZ + 1.05)) <= 0.55) {
        m.setRaw(x, y, z, mat('paper'), partId.paper);
      }
      // 叠贴的亮黄委托纸（稍偏右斜）
      if (X >= -0.6 && X <= 3.3 && Y >= -2.8 && Y <= 2.5 && Math.abs(z - (planeZ + 1.65)) <= 0.5) {
        m.setRaw(x, y, z, mat('yellow'), partId.paperY);
      }
    });
    // 顶部金属木夹扣
    m.paintCapsule(-1.8, 3.6, 4.7, 1.8, 3.6, 4.7, 0.9, 0.9, mat('gold'), partId.trim, true);
    // 纸面醒目朱红封蜡印
    m.paintEllipsoid(-1.4, -1.6, 4.1, 1.25, 1.25, 0.85, mat('wax'), partId.seal, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5 });
  }

  // 7. 标志道具 B：硕大醒目黄铜工会印章
  function buildStamp(makeCanvas) {
    const m = new VoxelModel(9, 9, 10, SPEC);
    const { mat, partId } = SPEC;
    // 底部朱红印泥垫边
    m.paintEllipsoid(0, 0, 1.1, 2.9, 2.9, 0.9, mat('wax'), partId.seal, true);
    // 宽厚亮黄铜印座与钟形印身
    m.paintEllipsoid(0, 0, 2.4, 3.1, 3.1, 1.35, mat('gold'), partId.stampBrass, true);
    m.paintCapsule(0, 0, 2.8, 0, 0, 6.2, 2.1, 1.3, mat('gold'), partId.stampBrass, true);
    // 顶部圆润红木握柄
    m.paintEllipsoid(0, 0, 7.6, 1.9, 1.9, 1.75, mat('wood'), partId.stampWood, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2 });
  }

  // 8. 羽毛笔（待机翻阅点选）
  function buildQuill(makeCanvas) {
    const m = new VoxelModel(7, 10, 10, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -1.0, 1.2, 0.5, 2.2, 5.2, 0.55, 0.85, mat('gold'), partId.trim, true);
    m.paintCapsule(0.5, 2.2, 5.2, 1.2, 4.0, 8.6, 1.2, 0.75, mat('ivory'), partId.quill, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5 });
  }

  // 9. 委托羊皮纸卷（热情招手招呼冒险家时挥舞）
  function buildScroll(makeCanvas) {
    const m = new VoxelModel(10, 8, 9, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(-3.2, 0, 4.2, 3.2, 0, 4.6, 1.65, 1.65, mat('paper'), partId.paper, true);
    m.paintCapsule(-2.4, 0.8, 2.0, 2.4, 0.8, 2.2, 1.25, 1.25, mat('yellow'), partId.paperY, true);
    m.paintEllipsoid(0, 1.3, 4.4, 1.15, 0.9, 1.15, mat('wax'), partId.seal, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5 });
  }

  const Def = {
    id: 'npc_guild_clerk',
    code: '酒1',
    name: '工会任务接待员',
    tag: '酒馆核心·工会任务',
    summary: '藏青金边短披肩制服 + 羽饰斜檐小帽 + 朱红封蜡印袋，左手厚木夹红黄委托卷宗、右手大黄铜印章',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 7.4,
    ecoWeight: 0.9,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: ['25 格人型双足 IK', '两段手臂 FK 滞后', '木夹红黄委托卷宗', '黄铜工会印章盖戳爆发', '挥舞羊皮纸招呼'],
    soulHabit: '低头翻阅任务卷宗点羽毛笔 → 高举黄铜印章重重盖下迸发封蜡金粒 → 挥舞羊皮纸热情招手',
    actions: [
      { id: 'idle',   name: '翻阅卷宗', loop: true,  status: 'done' },
      { id: 'stamp',  name: '盖戳提交', loop: false, duration: 2.0, status: 'done' },
      { id: 'beckon', name: '挥纸招呼', loop: false, duration: 2.0, status: 'done' },
      { id: 'patrol', name: '稳步巡查', loop: true,  status: 'done' }
    ],
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legThigh:  buildLegSeg(makeCanvas, 1.7, 1.45, 4.0, true),
        legShin:   buildLegSeg(makeCanvas, 1.4, 1.25, 3.8, false),
        boot:      buildBoot(makeCanvas),
        torso:     buildTorso(makeCanvas),
        head:      buildHead(makeCanvas),
        hat:       buildHat(makeCanvas),
        upperArm:  buildUpperArm(makeCanvas),
        forearm:   buildForearm(makeCanvas),
        clipboard: buildClipboard(makeCanvas),
        stamp:     buildStamp(makeCanvas),
        quill:     buildQuill(makeCanvas),
        scroll:    buildScroll(makeCanvas)
      };

      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.1, hipY: 0, hipZ: 7.4, restX: -2.2, restY: 0.2, group: 0, L1: 4.0, L2: 4.2, bendDir: 1 },
        { id: 'R', hipX:  2.1, hipY: 0, hipZ: 7.4, restX:  2.2, restY: 0.2, group: 1, L1: 4.0, L2: 4.2, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 2.1, stepDuration: 0.16, stepHeight: 1.7, strideAnticipation: 0.42 });

      const headYawSp  = new SpringDamper1D(0, 140, 8.5);
      const hatBobSp   = new SpringDamper1D(0, 180, 7.2);
      const bodyBobSp  = new SpringDamper1D(0, 170, 8.0);
      const stampHitSp = new SpringDamper1D(0, 220, 9.0);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        walkBlend: 0, stepPhase: 0,
        action: 'idle', actionTime: 0,
        stampedThisCycle: false,
        armLYaw: 0, armRYaw: 0,
        foreLYaw: 0, foreRYaw: 0,
        armLLift: 0, armRLift: 0,
        foreLLift: 0, foreRLift: 0,
        headLift: 0, propMode: 'stamp'
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: Def,
        cachePrefix: `npc_guild_clerk_${Math.random().toString(36).slice(2, 7)}`,
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
          state.stampedThisCycle = false;
          gait.reset(hx, hy, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = params.springiness ?? 1.0;
          const gFreq = params.gaitFreq ?? 1.0;

          const act = (eco && eco.action) || (eco && eco.patrol === true ? 'patrol' : 'idle');
          const actT = (eco && eco.actionTime != null) ? eco.actionTime : time;
          if (act !== state.action || actT < state.actionTime - 0.1) {
            state.stampedThisCycle = false;
          }
          state.action = act;
          state.actionTime = actT;

          if (act === 'patrol') {
            Propulsion.multiLegWalk(state, dt, time, { ...params, speed: (params.speed ?? 1.0) * 0.78 }, {
              ...eco, patrol: true, walkStyle: 'default', baseLift: 0
            });
          } else {
            Propulsion.multiLegWalk(state, dt, time, params, {
              ...eco, patrol: false, baseLift: 0
            });
          }
          state.z = 0;

          const spd = Math.hypot(state.vx, state.vy);
          state.walkBlend = lerp(state.walkBlend, clamp(spd / 8.0, 0, 1), expSmooth(dt, 10));
          state.stepPhase += dt * (2.6 + state.walkBlend * 7.8) * gFreq;

          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 1.15,
            stepHeight: 1.7 * sMul,
            stepThreshold: 2.1 * sMul
          });
          state.tiltX = lerp(state.tiltX || 0, gaitRes.tiltX * 0.45 * sMul, expSmooth(dt, 12));
          state.tiltY = lerp(state.tiltY || 0, gaitRes.tiltY * 0.45 * sMul, expSmooth(dt, 12));

          // 钳位双脚偏移，杜绝急转脱臼
          const maxOff = 3.5 * sMul;
          for (const leg of gait.legs) {
            const [ix, iy] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
            const dx = leg.footX - ix, dy = leg.footY - iy;
            const d = Math.hypot(dx, dy);
            if (d > maxOff) {
              leg.footX = ix + (dx / d) * maxOff;
              leg.footY = iy + (dy / d) * maxOff;
            }
          }

          if (gaitRes.landed.length > 0) {
            bodyBobSp.impulse(5.5 * sp);
            hatBobSp.impulse(-6.5 * sp);
            for (const l of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.45 * sMul);
            }
          }
          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.0 * sMul }));

          // 按动作驱动两段手臂 FK（小臂相对大臂滞后 0.80 rad）
          let tgtArmL = 0.22, tgtArmR = -0.25;
          let tgtForeL = 0.32, tgtForeR = -0.35;
          let tgtArmLLift = 0.5, tgtArmRLift = 0.4;
          let tgtForeLLift = 1.0, tgtForeRLift = 0.8;
          let tgtHeadYaw = 0, tgtHeadLift = 0;

          if (act === 'stamp') {
            state.propMode = 'stamp';
            const u = clamp(actT / 2.0, 0, 1);
            if (u < 0.30) {
              // 高举黄铜印章蓄势
              const k = smoothstep(0, 0.30, u);
              tgtArmL = 0.32; tgtForeL = 0.48; tgtArmLLift = 0.8; tgtForeLLift = 1.6;
              tgtArmR = lerp(-0.2, -0.55, k);
              tgtForeR = lerp(-0.25, -0.45, k);
              tgtArmRLift = lerp(0.5, 4.6, k);
              tgtForeRLift = lerp(1.0, 6.2, k);
              tgtHeadYaw = -0.18 * k;
              tgtHeadLift = 0.65 * k;
            } else if (u < 0.44) {
              // 重重盖向任务卷宗
              const k = smoothstep(0.30, 0.44, u);
              tgtArmL = 0.36; tgtForeL = 0.54; tgtArmLLift = 0.7; tgtForeLLift = 1.4;
              tgtArmR = lerp(-0.55, 0.34, k);
              tgtForeR = lerp(-0.45, 0.56, k);
              tgtArmRLift = lerp(4.6, 0.5, k);
              tgtForeRLift = lerp(6.2, 1.3, k);
              tgtHeadYaw = lerp(-0.18, 0.14, k);
              tgtHeadLift = lerp(0.65, -0.55, k);
              if (u >= 0.40 && !state.stampedThisCycle) {
                state.stampedThisCycle = true;
                bodyBobSp.impulse(-12.0 * sp);
                hatBobSp.impulse(-15.0 * sp);
                stampHitSp.impulse(-14.0 * sp);
                // 迸出一小圈朱红封蜡与金黄金币微粒
                if (vfx) {
                  const [bx, by] = localToWorldXY(state.x, state.y, state.yaw, -0.4 * sMul, 5.6 * sMul);
                  const bz = 11.2 * sMul;
                  for (let i = 0; i < 12; i++) {
                    const ang = (i / 12) * Math.PI * 2 + (i % 2) * 0.18;
                    const spdP = 7.5 + (i % 3) * 3.8;
                    const isGold = (i % 2 === 0);
                    vfx.spawnParticle(
                      bx, by, bz,
                      Math.cos(ang) * spdP, Math.sin(ang) * spdP, 11.0 + (i % 3) * 3.2,
                      0.48 + (i % 3) * 0.08, isGold ? 1.55 : 1.35,
                      isGold ? '#ffd845' : '#e02d33', false, 36
                    );
                  }
                }
              }
            } else if (u < 0.72) {
              // 压实印章停顿
              tgtArmL = 0.36; tgtForeL = 0.54; tgtArmLLift = 0.6; tgtForeLLift = 1.2;
              tgtArmR = 0.32; tgtForeR = 0.52; tgtArmRLift = 0.5; tgtForeRLift = 1.2;
              tgtHeadYaw = 0.12;
              tgtHeadLift = -0.35;
            } else {
              // 利落收手回位
              const k = smoothstep(0.72, 1.0, u);
              tgtArmL = lerp(0.36, 0.24, k); tgtForeL = lerp(0.54, 0.36, k);
              tgtArmLLift = lerp(0.6, 0.8, k); tgtForeLLift = lerp(1.2, 1.5, k);
              tgtArmR = lerp(0.32, -0.22, k); tgtForeR = lerp(0.52, -0.28, k);
              tgtArmRLift = lerp(0.5, 1.4, k); tgtForeRLift = lerp(1.2, 2.2, k);
              tgtHeadYaw = lerp(0.12, 0, k);
              tgtHeadLift = lerp(-0.35, 0, k);
            }
          } else if (act === 'beckon') {
            state.propMode = 'scroll';
            const u = clamp(actT / 2.0, 0, 1);
            const env = Math.sin(u * Math.PI);
            const wave = Math.sin(actT * 9.5);
            const waveLag = Math.sin(actT * 9.5 - 0.82);
            tgtArmL = 0.25; tgtForeL = 0.38; tgtArmLLift = 0.6; tgtForeLLift = 1.2;
            tgtArmR = -0.45 + wave * 0.42 * env;
            tgtForeR = -0.48 + waveLag * 0.52 * env;
            tgtArmRLift = 1.0 + 3.2 * env + Math.max(0, wave) * 0.8;
            tgtForeRLift = 1.8 + 4.4 * env + Math.max(0, waveLag) * 1.1;
            tgtHeadYaw = wave * 0.22 * env;
            tgtHeadLift = 0.45 * env;
          } else if (act === 'patrol') {
            state.propMode = 'stamp';
            const sw = Math.sin(state.stepPhase);
            const swLag = Math.sin(state.stepPhase - 0.80);
            tgtArmL = 0.26 + sw * 0.14 * state.walkBlend;
            tgtForeL = 0.40 + swLag * 0.18 * state.walkBlend;
            tgtArmLLift = 0.7; tgtForeLLift = 1.4;
            tgtArmR = -0.24 - sw * 0.36 * state.walkBlend;
            tgtForeR = -0.28 - swLag * 0.44 * state.walkBlend;
            tgtArmRLift = 0.3 + Math.max(0, -sw) * 0.7;
            tgtForeRLift = 0.6 + Math.max(0, -swLag) * 0.9;
            tgtHeadYaw = Math.sin(time * 1.4) * 0.22;
            tgtHeadLift = 0.15;
          } else {
            // idle：低头翻阅任务卷宗轻点羽毛笔
            state.propMode = 'quill';
            const tap = Math.sin(time * 4.4);
            const tapLag = Math.sin(time * 4.4 - 0.80);
            tgtArmL = 0.30; tgtForeL = 0.46;
            tgtArmLLift = 0.8 + Math.sin(time * 2.2) * 0.22;
            tgtForeLLift = 1.5 + Math.sin(time * 2.2 - 0.6) * 0.25;
            tgtArmR = 0.16 + tap * 0.16;
            tgtForeR = 0.34 + tapLag * 0.24;
            tgtArmRLift = 0.9 + Math.max(0, tap) * 0.7;
            tgtForeRLift = 1.8 + Math.max(0, tapLag) * 1.1;
            tgtHeadYaw = 0.10 + Math.sin(time * 1.3) * 0.16;
            tgtHeadLift = -0.25 + Math.sin(time * 2.2) * 0.18;
          }

          const kArm = expSmooth(dt, 14);
          const kFore = expSmooth(dt, 10.5);
          state.armLYaw   = lerp(state.armLYaw,   tgtArmL,  kArm);
          state.armRYaw   = lerp(state.armRYaw,   tgtArmR,  kArm);
          state.foreLYaw  = lerp(state.foreLYaw,  tgtForeL, kFore);
          state.foreRYaw  = lerp(state.foreRYaw,  tgtForeR, kFore);
          state.armLLift  = lerp(state.armLLift,  tgtArmLLift,  kArm);
          state.armRLift  = lerp(state.armRLift,  tgtArmRLift,  kArm);
          state.foreLLift = lerp(state.foreLLift, tgtForeLLift, kFore);
          state.foreRLift = lerp(state.foreRLift, tgtForeRLift, kFore);
          state.headLift  = lerp(state.headLift,  tgtHeadLift,  kArm);

          headYawSp.update(dt, tgtHeadYaw, 140 * sp, 8.5);
          bodyBobSp.update(dt, 0, 170 * sp, 8.0);
          hatBobSp.update(dt, 0, 180 * sp, 7.2);
          stampHitSp.update(dt, 0, 220 * sp, 9.0);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const hYaw = yw + clamp(headYawSp.x, -0.65, 0.65);

          const breath = Math.sin(state.actionTime * 2.4) * 0.32 * (1 - state.walkBlend * 0.5);
          const stepBob = Math.abs(Math.sin(state.stepPhase)) * 0.55 * state.walkBlend;
          const bob = clamp(bodyBobSp.x * 0.05 + breath + stepBob, -0.5, 0.9) * sMul;

          // 1. 双足 IK
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const hx = l.hipWX + (state.tiltX || 0);
            const hy = l.hipWY + (state.tiltY || 0);
            const hz = l.hipWZ + bob;
            list.push({
              partKey: 'legThigh', asset: parts.legThigh,
              x: lerp(hx, l.kneeX, 0.25), y: lerp(hy, l.kneeY, 0.25),
              lift: Math.max(0, lerp(hz, l.kneeZ, 0.25) - 1.8 * sMul),
              ro: yw, bias: -0.32, symDeg: 90
            });
            list.push({
              partKey: 'legShin', asset: parts.legShin,
              x: lerp(l.kneeX, l.footX, 0.45), y: lerp(l.kneeY, l.footY, 0.45),
              lift: Math.max(0, lerp(l.kneeZ, l.footZ + 1.4 * sMul, 0.45) - 1.7 * sMul),
              ro: yw, bias: -0.26, symDeg: 90
            });
            list.push({
              partKey: 'boot', asset: parts.boot,
              x: l.footX, y: l.footY, lift: Math.max(0, l.footZ),
              ro: yw, bias: -0.20
            });
          }

          // 2. 躯干（制服 + 金边短披肩 + 封蜡印袋）
          const [tx, ty] = localToWorldXY(state.x + (state.tiltX || 0), state.y + (state.tiltY || 0), yw, 0, 0.2 * sMul);
          const torsoZ = 5.8 * sMul + bob;
          list.push({
            partKey: 'torso', asset: parts.torso,
            x: tx, y: ty, lift: torsoZ, ro: yw, bias: 0.12
          });

          // 3. 头部 + 斜檐羽饰小帽
          const [hx, hy] = localToWorldXY(tx, ty, yw, 0, 0.6 * sMul);
          const headZ = 15.6 * sMul + bob + state.headLift * sMul;
          list.push({
            partKey: 'head', asset: parts.head,
            x: hx, y: hy, lift: headZ, ro: hYaw, bias: 0.36
          });
          const hatZ = headZ + 6.4 * sMul + clamp(hatBobSp.x * 0.04, -0.45, 0.55) * sMul;
          list.push({
            partKey: 'hat', asset: parts.hat,
            x: hx, y: hy, lift: hatZ, ro: hYaw, bias: 0.46
          });

          // 4. 左臂两段 FK + 厚实木夹任务卷宗
          const shZ = 12.6 * sMul + bob;
          const [lShX, lShY] = localToWorldXY(tx, ty, yw, -4.4 * sMul, 0.5 * sMul);
          const lUpYaw = yw + state.armLYaw;
          const [lUpX, lUpY] = pivotToWorldXY(lShX, lShY, lUpYaw, 0, -1.0 * sMul);
          list.push({
            partKey: 'upperArmL', asset: parts.upperArm,
            x: lUpX, y: lUpY, lift: shZ - 1.6 * sMul + state.armLLift * sMul, ro: lUpYaw, bias: 0.18
          });

          const [lElX, lElY] = localToWorldXY(lShX, lShY, lUpYaw, 0, 3.0 * sMul);
          const lFoYaw = yw + state.foreLYaw;
          const [lFoX, lFoY] = pivotToWorldXY(lElX, lElY, lFoYaw, 0, -1.4 * sMul);
          const lHandZ = shZ - 1.8 * sMul + state.foreLLift * sMul;
          list.push({
            partKey: 'forearmL', asset: parts.forearm,
            x: lFoX, y: lFoY, lift: lHandZ, ro: lFoYaw, bias: 0.26
          });

          const [lHdX, lHdY] = localToWorldXY(lElX, lElY, lFoYaw, 0.4 * sMul, 3.8 * sMul);
          list.push({
            partKey: 'clipboard', asset: parts.clipboard,
            x: lHdX, y: lHdY,
            lift: lHandZ + 0.6 * sMul + clamp(stampHitSp.x * 0.03, -0.6, 0.4) * sMul,
            ro: lFoYaw + 0.25, bias: 0.34
          });

          // 5. 右臂两段 FK + 黄铜工会印章 / 羽毛笔 / 羊皮纸卷
          const [rShX, rShY] = localToWorldXY(tx, ty, yw, 4.4 * sMul, 0.5 * sMul);
          const rUpYaw = yw + state.armRYaw;
          const [rUpX, rUpY] = pivotToWorldXY(rShX, rShY, rUpYaw, 0, -1.0 * sMul);
          list.push({
            partKey: 'upperArmR', asset: parts.upperArm,
            x: rUpX, y: rUpY, lift: shZ - 1.6 * sMul + state.armRLift * sMul, ro: rUpYaw, bias: 0.18
          });

          const [rElX, rElY] = localToWorldXY(rShX, rShY, rUpYaw, 0, 3.0 * sMul);
          const rFoYaw = yw + state.foreRYaw;
          const [rFoX, rFoY] = pivotToWorldXY(rElX, rElY, rFoYaw, 0, -1.4 * sMul);
          const rHandZ = shZ - 1.8 * sMul + state.foreRLift * sMul;
          list.push({
            partKey: 'forearmR', asset: parts.forearm,
            x: rFoX, y: rFoY, lift: rHandZ, ro: rFoYaw, bias: 0.28
          });

          const [rHdX, rHdY] = localToWorldXY(rElX, rElY, rFoYaw, 0, 3.8 * sMul);
          if (state.propMode === 'scroll') {
            list.push({
              partKey: 'scroll', asset: parts.scroll,
              x: rHdX, y: rHdY, lift: rHandZ + 1.8 * sMul, ro: rFoYaw, bias: 0.42
            });
          } else if (state.propMode === 'quill') {
            list.push({
              partKey: 'quill', asset: parts.quill,
              x: rHdX, y: rHdY, lift: rHandZ + 0.6 * sMul, ro: rFoYaw - 0.2, bias: 0.40
            });
          } else {
            list.push({
              partKey: 'stamp', asset: parts.stamp,
              x: rHdX, y: rHdY, lift: rHandZ - 0.6 * sMul, ro: rFoYaw, bias: 0.42
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
