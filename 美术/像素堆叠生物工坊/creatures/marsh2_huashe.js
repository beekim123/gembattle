'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 泽2 · 贴地翼狼（《山海经》化蛇 · M04/M07 贴地蛇行链 + 平衡宽翼，+Y 正前）
  //   1. 灰蓝豺狼头躯（与沼泽暗泥强对比）+ 背上一对极醒目亮赭白/青灰宽大鸟翼；
  //   2. 四肢紧收贴地不走步，整条身子像大蛇一样蜿蜒扭动爬行（8 节蛇行主链，
  //      相邻高重叠零串珠），双翼不飞只随扭动左右大幅开合保持平衡；
  //   3. 偶发低气压惊窜钻泥并发出青白环纹呼啸；
  //   4. 3 套零重建模换色皮肤，actions 含 patrol / idle / flee。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 灰蓝豺狼毛皮（在暗泥沼泽上强对比）
      wolfDark:    '#26374a',
      wolfMid:     '#43607d',
      wolfHi:      '#7296b8',
      // 颈腹与颊下浅灰白绒
      bellyDark:   '#798a99',
      bellyMid:    '#b2c2cf',
      bellyHi:     '#e3edf5',
      // 脊背深青蓝鬃纹
      spineDark:   '#172330',
      spineMid:    '#2c4057',
      spineHi:     '#4b6785',
      // 醒目亮赭白宽大鸟翼主羽
      wingDark:    '#9c896d',
      wingMid:     '#d9c6a7',
      wingHi:      '#faf0dc',
      // 青灰鸟翼覆羽与翼梢（与亮赭白强分层）
      wingTipDark: '#3f5763',
      wingTipMid:  '#6c8c9c',
      wingTipHi:   '#a3c4d4',
      // 贴地短爪与鼻吻
      clawDark:    '#14181f',
      clawMid:     '#2e3642',
      clawHi:      '#556173',
      // 琥珀狼眼（eyeGlint 严禁进 glowKeys）
      eyeDark:     '#0c0e12',
      eyeIris:     '#f5a824',
      eyeGlint:    '#f7fcff',
      // 低气压呼啸声波环
      howlOuter:   '#59b8c7',
      howlMid:     '#9be8f0',
      howlCore:    '#e8fdff'
    },
    glowKeys: ['howlMid', 'howlCore'],
    parts: [
      'wolf', 'belly', 'spine', 'wing', 'wingTip', 'claw', 'eye', 'howlRing'
    ],
    noCrease: [
      ['wolf', 'belly'], ['wolf', 'spine'], ['wolf', 'claw'], ['wolf', 'eye'],
      ['wing', 'wingTip'], ['wolf', 'wing']
    ],
    materials: {
      wolf:    ['wolfDark',    'wolfMid',    'wolfHi'],
      belly:   ['bellyDark',   'bellyMid',   'bellyHi'],
      spine:   ['spineDark',   'spineMid',   'spineHi'],
      wing:    ['wingDark',    'wingMid',    'wingHi'],
      wingTip: ['wingTipDark', 'wingTipMid', 'wingTipHi'],
      claw:    ['clawDark',    'clawMid',    'clawHi']
    },
    protectedParts: ['eye', 'claw', 'wing', 'howlRing']
  });

  // 3 套零重建模换色皮肤
  const SKINS = [
    {
      id: 'slate_ochre',
      name: '灰蓝赭翼（沼泽经典）',
      dot: '#d9c6a7',
      outline: '#0b121a',
      pal: {},
      fx: { mud: '#596b4d', howl: '#9be8f0', foam: '#d4e8e0' }
    },
    {
      id: 'frost_marsh',
      name: '苍银青翼（雾沼款）',
      dot: '#9eb8c7',
      outline: '#0c141c',
      pal: {
        wolfDark:    '#384857', wolfMid:    '#627a8f', wolfHi:    '#9bb4c9',
        spineDark:   '#202e3b', spineMid:   '#3b5166', spineHi:   '#62809c',
        wingDark:    '#7e949c', wingMid:    '#bfd4db', wingHi:    '#f0f9fc',
        wingTipDark: '#2a575c', wingTipMid: '#488c91', wingTipHi: '#85ced1',
        eyeIris:     '#47e0d6'
      },
      fx: { mud: '#64756e', howl: '#b8f7ff', foam: '#e6f7fa' }
    },
    {
      id: 'rust_reed',
      name: '褐狼暖羽（芦苇款）',
      dot: '#c9884f',
      outline: '#140f0c',
      pal: {
        wolfDark:    '#3b2f28', wolfMid:    '#665245', wolfHi:    '#997e6b',
        bellyDark:   '#857768', bellyMid:   '#bfa993', bellyHi:   '#ebd9c5',
        spineDark:   '#241a16', spineMid:   '#45332b', spineHi:   '#6e5346',
        wingDark:    '#a66b38', wingMid:    '#e09e58', wingHi:    '#ffd799',
        wingTipDark: '#4a433d', wingTipMid: '#7a7066', wingTipHi: '#b0a396',
        eyeIris:     '#ff981f'
      },
      fx: { mud: '#6b5a42', howl: '#ffe399', foam: '#f2e8d4' }
    }
  ];

  // =========================================================================
  // 1. 灰蓝豺狼头首（13×18×12，竖立狼耳 + 修长狼吻 + 琥珀锐眼）
  // =========================================================================
  function buildWolfHead(makeCanvas) {
    const W = 13, D = 18, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 颈根衔接首节
    m.paintCapsule(0, -4.6, 3.8, 0, -1.2, 4.6, 3.2, 3.4, mat('wolf'), partId.wolf, true);
    // 锐利豺狼颅骨 + 颊下浅绒
    m.paintEllipsoid(0, 0.2, 5.2, 3.8, 3.8, 3.2, mat('wolf'), partId.wolf, true);
    m.paintEllipsoid(0, 0.8, 3.2, 3.0, 3.2, 1.4, mat('belly'), partId.belly, true);
    // 修长狼吻 + 黑鼻头
    m.paintCapsule(0, 2.2, 4.8, 0, 6.6, 4.2, 2.3, 1.45, mat('wolf'), partId.wolf, true);
    m.paintEllipsoid(0, 7.2, 4.5, 1.15, 0.95, 0.88, mat('claw'), partId.claw, true);
    m.paintCapsule(0, 2.2, 3.2, 0, 5.8, 3.1, 1.7, 1.1, mat('belly'), partId.belly, true);

    // 一对高竖警觉豺狼尖耳
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 2.4, -1.0, 7.4, s * 3.8, -1.8, 10.8, 1.45, 0.58, mat('wolf'), partId.wolf, true);
      m.paintCapsule(s * 2.5, -0.4, 7.6, s * 3.4, -1.0, 9.8, 0.72, 0.36, mat('belly'), partId.belly, true);
    }
    // 额后脊毛
    m.paintCapsule(0, -1.4, 7.6, 0, -4.6, 8.2, 1.35, 0.85, mat('spine'), partId.spine, true);

    m.despeckle();
    m.applyArtShading(true);

    // 琥珀锐眼（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.2);
    const eyeZ = 5;
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 5; step++) {
        const tx = Math.round(hw + s * (4.4 - step));
        if (m.getPartId(tx, eyeY, eyeZ) === partId.wolf) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 2.9);
      m.setRaw(sx, eyeY,     eyeZ,     keyToId.eyeIris,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ,     keyToId.eyeDark,  partId.eye);
      m.setRaw(sx, eyeY,     eyeZ + 1, keyToId.eyeIris,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 4.4, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 2. 蛇行蜿蜒狼躯体节（高重叠拉长胶囊 + 紧收贴地四爪版肩节/臀节 + 蓬松狼尾梢）
  // =========================================================================
  function buildWolfSeg(makeCanvas, rx, ry, hasTuckedLegs) {
    const W = Math.ceil((hasTuckedLegs ? rx + 3.4 : rx) * 2 + 4);
    const D = Math.ceil(ry * 2 + 5);
    const H = Math.ceil(rx * 2 + 5);
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const cz = rx + 0.6;

    m.fillAABB(-rx - 0.8, rx + 0.8, -ry - 0.8, ry + 0.8, 0, Math.ceil(cz + rx + 1.0), (x, y, z, X, Y) => {
      const d2 = (X / rx) * (X / rx) + (Y / ry) * (Y / ry) + ((z - cz) / (rx * 0.92)) * ((z - cz) / (rx * 0.92));
      if (d2 <= 1.0) {
        const isBelly = z < cz - rx * 0.35;
        const isSpine = z > cz + rx * 0.55 && Math.abs(X) < 1.3;
        m.setRaw(x, y, z,
          isBelly ? mat('belly') : (isSpine ? mat('spine') : mat('wolf')),
          isBelly ? partId.belly : (isSpine ? partId.spine : partId.wolf)
        );
      }
    });

    if (hasTuckedLegs) {
      // 四肢紧收贴在躯干两侧并贴地向后折收（明确体现「有四肢但不用来走，只贴地蛇行」）
      for (const s of [-1, 1]) {
        m.paintCapsule(s * (rx - 0.2), 1.4, 2.2, s * (rx + 2.2), -2.2, 1.3, 1.35, 1.05, mat('wolf'), partId.wolf, true);
        m.paintEllipsoid(s * (rx + 2.3), -2.8, 1.1, 1.05, 1.45, 0.85, mat('claw'), partId.claw, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: rx + (hasTuckedLegs ? 2.5 : 0.4), centerZ: Math.round(cz) });
  }

  function buildWolfTailTip(makeCanvas) {
    const m = new VoxelModel(9, 14, 8, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 3.6, 3.0, 0, -4.6, 3.4, 2.1, 1.1, mat('wolf'), partId.wolf, true);
    m.paintEllipsoid(0, -4.4, 3.4, 1.5, 2.2, 1.3, mat('belly'), partId.belly, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.6, centerZ: 3 });
  }

  // =========================================================================
  // 3. 背上一对极醒目亮赭白/青灰宽大鸟翼（左右各一，枢轴锁在肩根）
  // =========================================================================
  const WING_PIVOT_X = 5.4;
  function buildBirdWing(makeCanvas, side) {
    // side = -1 左翼（向 -X 展开），side = +1 右翼（向 +X 展开）
    const W = 18, D = 14, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const rootX = -side * WING_PIVOT_X;

    // 翼根覆羽（青灰强对比）
    m.paintCapsule(rootX, 2.4, 3.6, rootX + side * 6.8, 0.6, 4.4, 1.85, 1.45, mat('wingTip'), partId.wingTip, true);
    // 宽大亮赭白飞羽层（4 根扇形展开的厚实羽片，俯视 ×4 极其醒目！）
    const feathers = [
      { dx: 11.4, dy:  1.4, dz: 4.8, r0: 1.45, r1: 0.72 },
      { dx: 11.8, dy: -1.4, dz: 4.4, r0: 1.50, r1: 0.72 },
      { dx: 10.0, dy: -3.8, dz: 3.8, r0: 1.45, r1: 0.68 },
      { dx:  7.4, dy: -5.4, dz: 3.2, r0: 1.35, r1: 0.65 }
    ];
    for (const f of feathers) {
      const mx = rootX + side * f.dx * 0.55;
      const my = 1.4 + (f.dy - 1.4) * 0.55;
      m.paintCapsule(rootX + side * 1.2, 1.4, 3.6, mx, my, f.dz, f.r0, f.r0 * 0.9, mat('wing'), partId.wing, true);
      m.paintCapsule(mx, my, f.dz, rootX + side * f.dx, f.dy, f.dz - 0.5, f.r0 * 0.85, f.r1, mat('wingTip'), partId.wingTip, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.5, headZ: 7, centerZ: 4 });
  }

  // =========================================================================
  // 4. 低气压呼啸青白声波环（2 档大小）
  // =========================================================================
  function buildHowlRing(makeCanvas, radius) {
    const S = Math.ceil(radius * 2 + 4);
    const m = new VoxelModel(S, S, 3, SPEC);
    const { partId, keyToId } = SPEC;
    m.fillAABB(-radius - 1, radius + 1, -radius - 1, radius + 1, 0, 2, (x, y, z, X, Y) => {
      if (z !== 1) return;
      const r = Math.hypot(X, Y);
      if (Math.abs(r - radius) <= 0.82) {
        const kId = Math.abs(r - radius) < 0.35 ? keyToId.howlCore : (Math.sin(Math.atan2(Y, X) * 3) > 0.3 ? keyToId.howlMid : keyToId.howlOuter);
        m.setRaw(x, y, z, kId, partId.howlRing);
      }
    });
    return m.toStripAsset(makeCanvas, { footRadius: radius });
  }

  // 8 节贴地蛇行链（全长 ~28 格，紧实流畅无串珠）
  const NUM_NODES = 8;
  const SEG_LEN = 3.5;

  function relaxChain(nodes, segLen) {
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < nodes.length; i++) {
        const a = nodes[i - 1], b = nodes[i];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz) || 0.001;
        const diff = (d - segLen) / d;
        b.x -= dx * diff;
        b.y -= dy * diff;
        b.z -= dz * diff;
      }
    }
  }

  const Marsh2Def = {
    id: 'marsh2_huashe',
    code: '泽2',
    status: 'done',
    name: '贴地翼狼',
    tag: 'M04/M07 蛇行翼狼 · 双翼平衡 + 低气压惊窜',
    summary: '灰蓝豺狼头躯配亮赭白/青灰宽大鸟翼，四肢紧收贴地、8 节身躯像大蛇般蜿蜒爬行，双翼不飞只随扭动左右开合保持平衡；偶发低气压惊窜钻泥并发出环纹呼啸',
    defaultHabitat: 'swamp',
    footRadius: 10.5,
    ecoWeight: 1.2,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' },
      { id: 'flee',   name: '惊窜呼啸', loop: false, duration: 3.0, status: 'done' }
    ],
    blocks: [
      '灰蓝豺狼头首与竖耳',
      '8 节贴地蛇行狼躯链',
      '紧收贴地四爪（不走步）',
      '亮赭白/青灰宽大平衡鸟翼',
      '低气压钻泥惊窜与呼啸声波环'
    ],
    soulHabit: '四肢紧收贴地像大蛇般蜿蜒爬行，背上一对宽大鸟翼不飞只随扭动左右开合保持平衡；偶发低气压预警惊窜钻泥并仰首呼啸出青白环纹',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        head:        buildWolfHead(makeCanvas),
        segShoulder: buildWolfSeg(makeCanvas, 3.6, 3.6, true),
        segMid:      buildWolfSeg(makeCanvas, 3.3, 3.5, false),
        segHip:      buildWolfSeg(makeCanvas, 3.2, 3.4, true),
        segTailA:    buildWolfSeg(makeCanvas, 2.5, 3.2, false),
        segTailB:    buildWolfSeg(makeCanvas, 1.9, 2.8, false),
        tailTip:     buildWolfTailTip(makeCanvas),
        wingL:       buildBirdWing(makeCanvas, -1),
        wingR:       buildBirdWing(makeCanvas,  1),
        howlSmall:   buildHowlRing(makeCanvas, 4.0),
        howlLarge:   buildHowlRing(makeCanvas, 6.2)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;

      const nodes = Array.from({ length: NUM_NODES }, (_, i) => ({
        x: hx0, y: hy0 - i * SEG_LEN, z: 0.6, yaw: hyaw0
      }));

      const wingBalanceSpring = new SpringDamper1D(0, 72, 6.4);
      const mudDiveSpring     = new SpringDamper1D(0, 58, 7.0);

      const howlRings = Array.from({ length: 3 }, (_, i) => ({
        active: false,
        x: 0, y: 0, z: 6,
        t: 0, life: 1.15,
        large: i === 2,
        spin: i * 1.1
      }));

      const state = {
        x: hx0, y: hy0, z: 1.2,
        vx: 0, vy: 0, yaw: hyaw0,
        patAng: (opts.seed ? (opts.seed % TAU) : 0.4),
        stage: 'slither', // 'slither' | 'flee'
        stageTime: 0,
        howlDone: false,
        mudCd: 0
      };

      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      function triggerHowl(vfx, sMul) {
        const h = nodes[0];
        for (let i = 0; i < howlRings.length; i++) {
          const hr = howlRings[i];
          hr.active = true;
          hr.x = h.x; hr.y = h.y; hr.z = (7.0 + i * 2.2) * sMul;
          hr.t = -i * 0.18;
          hr.life = 1.25;
          hr.spin = h.yaw + i * 0.8;
        }
        if (vfx) {
          vfx.addRipple(h.x, h.y, 3.0 * sMul, 22.0 * sMul, 0.95, 2.0);
          vfx.addRipple(h.x, h.y, 1.5 * sMul, 14.0 * sMul, 0.72, 1.5);
        }
      }

      const instance = {
        def: Marsh2Def,
        cachePrefix: `marsh2_hs_${Math.random().toString(36).slice(2, 7)}`,
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
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 1.2; state.yaw = hyaw;
          state.vx = 0; state.vy = 0;
          state.stage = 'slither';
          state.stageTime = 0;
          state.howlDone = false;
          state.mudCd = 0;
          wingBalanceSpring.x = wingBalanceSpring.v = 0;
          mudDiveSpring.x = mudDiveSpring.v = 0;
          for (const hr of howlRings) hr.active = false;
          for (let i = 0; i < NUM_NODES; i++) {
            const [wx, wy] = localToWorldXY(hx, hy, hyaw, Math.sin(i * 0.75) * 3.0, -i * SEG_LEN * 0.92);
            nodes[i].x = wx; nodes[i].y = wy; nodes[i].z = 0.6; nodes[i].yaw = hyaw;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const speedMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.4, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.0);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const maxR = ((eco && eco.maxRadius) || 44) * 0.80;

          const forceFlee = !!(eco && eco.action === 'flee');
          const isIdle = !forceFlee && !!(eco && (eco.action === 'idle' || eco.patrol === false));

          state.stageTime += dt;
          if (forceFlee && state.stage !== 'flee') {
            state.stage = 'flee';
            state.stageTime = 0;
            state.howlDone = false;
          } else if (state.stage === 'slither') {
            const dur = isIdle ? 3.8 : 6.4;
            if (state.stageTime >= dur) {
              state.stage = 'flee';
              state.stageTime = 0;
              state.howlDone = false;
            }
          } else if (state.stage === 'flee') {
            if (!state.howlDone && state.stageTime >= 0.20) {
              state.howlDone = true;
              triggerHowl(vfx, sMul);
            }
            if (!forceFlee && state.stageTime >= 2.8) {
              state.stage = 'slither';
              state.stageTime = 0;
            }
          }

          const isFlee = state.stage === 'flee';
          const segLen = SEG_LEN * sMul;
          const wigglePhase = time * (isFlee ? 9.8 : 5.4) * gFreq;

          if (!isIdle) {
            const angSpd = (isFlee ? 1.45 : 0.72) * speedMul;
            state.patAng += dt * angSpd;
            const R = Math.min(24.0, maxR * 0.66);
            const bx = Math.cos(state.patAng) * R;
            const by = Math.sin(state.patAng) * R;
            const nx = Math.cos(state.patAng), ny = Math.sin(state.patAng);
            const wiggle = Math.sin(wigglePhase) * (isFlee ? 6.8 : 5.2) * flex * sMul;
            let hx = bx + nx * wiggle;
            let hy = by + ny * wiggle;
            const dH = Math.hypot(hx, hy);
            if (dH > maxR * 0.92) { hx *= (maxR * 0.92) / dH; hy *= (maxR * 0.92) / dH; }

            const kH = expSmooth(dt, isFlee ? 14.0 : 10.5);
            nodes[0].x = lerp(nodes[0].x, hx, kH);
            nodes[0].y = lerp(nodes[0].y, hy, kH);
            nodes[0].z = lerp(nodes[0].z, (isFlee ? 0.5 : 1.2) * sMul, expSmooth(dt, 10.0));
            relaxChain(nodes, segLen);
            for (let i = 1; i < NUM_NODES; i++) {
              nodes[i].z = lerp(nodes[i].z, 0.5 * sMul, expSmooth(dt, 12.0));
            }
            relaxChain(nodes, segLen);
          } else {
            // 原地待机：身躯原地做贴地 S 形呼吸扭动
            const homeX = (eco && eco.homeX !== undefined) ? eco.homeX : hx0;
            const homeY = (eco && eco.homeY !== undefined) ? eco.homeY : hy0;
            const homeYaw = (eco && eco.homeYaw !== undefined) ? eco.homeYaw : hyaw0;
            for (let i = 0; i < NUM_NODES; i++) {
              const side = Math.sin(wigglePhase - i * 0.85) * (isFlee ? 3.8 : 2.6) * flex * sMul;
              const fwd = (3.0 - i) * segLen * 0.86;
              const [wx, wy] = localToWorldXY(homeX, homeY, homeYaw, side, fwd);
              nodes[i].x = lerp(nodes[i].x, wx, expSmooth(dt, 9.5));
              nodes[i].y = lerp(nodes[i].y, wy, expSmooth(dt, 9.5));
              nodes[i].z = lerp(nodes[i].z, (i === 0 ? 1.4 : 0.6) * sMul, expSmooth(dt, 10.0));
            }
            relaxChain(nodes, segLen);
          }

          // 钳制所有节点在 maxRadius * 0.80 内
          for (let i = 0; i < NUM_NODES; i++) {
            const dn = Math.hypot(nodes[i].x, nodes[i].y);
            if (dn > maxR) {
              const sBack = maxR / dn;
              nodes[i].x *= sBack;
              nodes[i].y *= sBack;
            }
          }

          // 重算每节切线朝向 yaw
          for (let i = 0; i < NUM_NODES; i++) {
            const prev = i > 0 ? nodes[i - 1] : nodes[0];
            const next = i < NUM_NODES - 1 ? nodes[i + 1] : nodes[NUM_NODES - 1];
            const dx = prev.x - next.x, dy = prev.y - next.y;
            if (Math.hypot(dx, dy) > 0.06) {
              nodes[i].yaw = Math.atan2(-dx, dy);
            }
          }

          // 双翼平衡摆角（随身体扭动角速度左右开合保持平衡，绝不起飞）
          const bodyBend = wrapAngle(nodes[0].yaw - nodes[3].yaw);
          const wingTarget = clamp(bodyBend * 1.15 + Math.sin(wigglePhase) * 0.25, -0.75, 0.75);
          wingBalanceSpring.update(dt, wingTarget, 72 * sp, clamp(6.4 * dScale, 3.0, 10.5));

          // 惊窜钻泥深度（0.6s..2.1s 短暂压低钻泥溅花）
          const diveTarget = (isFlee && state.stageTime > 0.55 && state.stageTime < 2.15) ? 1.0 : 0.0;
          mudDiveSpring.update(dt, diveTarget, 58 * sp, clamp(7.0 * dScale, 3.0, 10.5));

          // 钻泥溅花与湿痕
          state.mudCd -= dt;
          if (state.mudCd <= 0 && vfx && (isFlee || !isIdle)) {
            state.mudCd = isFlee ? 0.18 : 0.45;
            const mid = nodes[2];
            if (typeof vfx.addDecal === 'function') {
              vfx.addDecal({
                kind: 'wet',
                x: mid.x, y: mid.y, yaw: mid.yaw,
                rx: (isFlee ? 4.8 : 3.2) * sMul,
                ry: (isFlee ? 5.6 : 4.2) * sMul,
                life: 6.5, alpha: 0.75
              });
            }
            if (isFlee && habitat && habitat.fx) {
              vfx.spawnSplash(mid.x, mid.y, 4, 0.65 * sMul, habitat.fx);
            }
          }

          // 更新呼啸声波环
          for (const hr of howlRings) {
            if (!hr.active) continue;
            hr.t += dt;
            if (hr.t >= hr.life) { hr.active = false; continue; }
            if (hr.t >= 0) {
              hr.z += 5.2 * sMul * dt;
              hr.spin = wrapAngle(hr.spin + dt * 2.2);
            }
          }

          // 包围盒中心作为 actor 锚点（钳制在 maxR 内）
          let minX = nodes[0].x, maxX = nodes[0].x, minY = nodes[0].y, maxY = nodes[0].y;
          for (let i = 1; i < NUM_NODES; i++) {
            if (nodes[i].x < minX) minX = nodes[i].x;
            if (nodes[i].x > maxX) maxX = nodes[i].x;
            if (nodes[i].y < minY) minY = nodes[i].y;
            if (nodes[i].y > maxY) maxY = nodes[i].y;
          }
          const cx = (minX + maxX) * 0.5;
          const cy = (minY + maxY) * 0.5;
          state.vx = (cx - state.x) / Math.max(dt, 0.001);
          state.vy = (cy - state.y) / Math.max(dt, 0.001);
          state.x = cx; state.y = cy;
          state.z = Math.max(0.4, (1.2 - clamp(mudDiveSpring.x, 0, 1) * 0.9) * sMul);
          state.yaw = nodes[0].yaw;

          footContacts.length = 0;
          for (let i = 1; i < NUM_NODES; i += 2) {
            footContacts.push({ x: nodes[i].x, y: nodes[i].y, z: nodes[i].z, r: 2.8 * sMul });
          }
          sockets.setWorld('head', nodes[0].x, nodes[0].y, nodes[0].z + 5.0 * sMul, nodes[0].yaw);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const wl = habitat ? (habitat.waterLevel ?? -99) : -99;
          const mudDive = clamp(mudDiveSpring.x, 0, 1);
          const diveDrop = mudDive * 2.0 * sMul;

          // 1. 灰蓝豺狼头首（挂在 0 号节点）
          const h0 = nodes[0];
          list.push({
            partKey: 'head',
            asset: parts.head,
            x: h0.x,
            y: h0.y,
            lift: Math.max(0.2, h0.z + 1.0 * sMul - diveDrop * 0.6),
            ro: h0.yaw,
            bias: 0.78,
            submerge: Math.max(mudDive * 0.65, EnvFeedback.calcSubmerge(h0.z + 1.0, wl, 4.0, isWater))
          });

          // 2. 7 节贴地蛇行狼躯（1 号带紧收前爪，4 号带紧收后爪）
          const segKeys = ['segShoulder', 'segMid', 'segMid', 'segHip', 'segTailA', 'segTailB', 'segTailB'];
          for (let i = 1; i < NUM_NODES; i++) {
            const n = nodes[i];
            const k = segKeys[i - 1] || 'segTailB';
            const lift = Math.max(0.1, n.z - diveDrop * 0.7);
            list.push({
              partKey: k,
              asset: parts[k],
              x: n.x,
              y: n.y,
              lift,
              ro: n.yaw,
              bias: 0.25 - i * 0.03,
              submerge: Math.max(mudDive * 0.85, EnvFeedback.calcSubmerge(lift + 0.5, wl, 3.8, isWater))
            });
          }

          // 3. 蓬松狼尾梢
          const tip = nodes[NUM_NODES - 1];
          const [tx, ty] = localToWorldXY(tip.x, tip.y, tip.yaw, 0, -2.6 * sMul);
          list.push({
            partKey: 'tailTip',
            asset: parts.tailTip,
            x: tx,
            y: ty,
            lift: Math.max(0.1, tip.z - diveDrop * 0.6),
            ro: tip.yaw,
            bias: -0.10,
            submerge: Math.max(mudDive * 0.75, EnvFeedback.calcSubmerge(tip.z, wl, 3.8, isWater))
          });

          // 4. 背上一对极醒目亮赭白/青灰宽大鸟翼（挂在第 1 号肩节，不飞只随扭动左右开合平衡）
          const sh = nodes[1];
          const wb = clamp(wingBalanceSpring.x, -0.75, 0.75);
          for (const s of [-1, 1]) {
            const wKey = s < 0 ? 'wingL' : 'wingR';
            // 身体左弯时右翼外展平衡、左翼微收，始终保持贴地宽展轮廓
            const openAngle = -s * (0.28 + s * wb * 0.42);
            const wYaw = wrapAngle(sh.yaw + openAngle);
            const [wjx, wjy] = localToWorldXY(sh.x, sh.y, sh.yaw, s * 2.8 * sMul, 0.2 * sMul);
            const [wx, wy] = pivotToWorldXY(wjx, wjy, wYaw, -s * WING_PIVOT_X * sMul, 0);
            const wLift = Math.max(1.2 * sMul, sh.z + (3.6 + s * wb * 1.1) * sMul - diveDrop * 0.5);
            list.push({
              partKey: wKey,
              asset: parts[wKey],
              x: wx,
              y: wy,
              lift: wLift,
              ro: wYaw,
              bias: 0.56
            });
          }

          // 5. 低气压呼啸青白声波环
          for (const hr of howlRings) {
            if (!hr.active || hr.t < 0) continue;
            const u = clamp(hr.t / hr.life, 0, 1);
            const fade = smoothstep(0, 0.14, u) * (1 - smoothstep(0.55, 1.0, u));
            if (fade <= 0.04) continue;
            list.push({
              partKey: hr.large ? 'howlLarge' : 'howlSmall',
              asset: parts[hr.large ? 'howlLarge' : 'howlSmall'],
              x: hr.x,
              y: hr.y,
              lift: hr.z,
              ro: hr.spin,
              symDeg: 90,
              opacity: clamp(fade * 0.90, 0.08, 0.90),
              bias: 1.15
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Marsh2Def.id,
            code: Marsh2Def.code,
            status: Marsh2Def.status,
            name: Marsh2Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            stage: state.stage,
            footRadius: Marsh2Def.footRadius,
            headZ: 12,
            centerZ: 5,
            blocks: Marsh2Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Marsh2Def);
})(window.PixelWorkshop);
