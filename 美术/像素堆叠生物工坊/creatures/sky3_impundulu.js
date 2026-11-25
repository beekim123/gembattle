'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 天3 · 雷羽大鸟（M02 三段硬羽振翅 + 羽尖像素电弧，+Y 正前）
  //   1. 纯黑主羽 + 亮雪白胸领/肩带极强色差对比，配亮红钩喙与亮红利爪，
  //      默认 ×4 俯视下体貌特征放大、轮廓极其锐利；
  //   2. 三段宽大羽翼（up / mid / dn / glide / rest）末端雕成放大锐利的
  //      青白电刺硬羽尖，尾羽亦为分叉锐利电刺硬羽；
  //   3. 解耦巡航升沉与拍翅相位，避免上下弹跳感；拍翼与放雷动作时在左右羽尖
  //      与尾刺间跳跃亮青像素短折电弧（kind: 'line' + jitter）；
  //   4. 3 套皮肤、严禁常态 scaleX/scaleY、巡游钳制在 maxRadius * 0.80 内。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 纯黑主羽（3 档）
      blackDark:   '#0b0d14',
      blackMid:    '#181c29',
      blackHi:     '#2f364a',
      // 亮雪白胸领与羽带（3 档，极强对比）
      whiteDark:   '#b6c4d4',
      whiteMid:    '#e4edf5',
      whiteHi:     '#f8fcff',
      // 亮红钩喙与利爪（3 档）
      redDark:     '#8f1419',
      redMid:      '#db252a',
      redHi:       '#ff5c54',
      // 翼骨与冠羽深灰过渡（3 档）
      slateDark:   '#242a38',
      slateMid:    '#434d63',
      slateHi:     '#6e7b96',
      // 羽尖青白硬电刺（3 档，仅电刺尖进 glowKeys）
      boltDark:    '#1a88b5',
      boltMid:     '#4ce0ff',
      boltHi:      '#d9fbff',
      // 锐利猛禽眼（eyeGlint 绝不进 glowKeys）
      eyeDark:     '#090b10',
      eyeIris:     '#ffaa1d',
      eyeGlint:    '#f2f9ff'
    },
    glowKeys: ['boltMid', 'boltHi'],
    parts: [
      'torso', 'whiteBand', 'head', 'beak', 'crest', 'claw',
      'eye', 'wingBone', 'wingFeath', 'wingTip', 'tailFeath', 'tailTip'
    ],
    noCrease: [
      ['torso', 'whiteBand'], ['torso', 'head'], ['head', 'beak'],
      ['head', 'eye'], ['head', 'crest'], ['torso', 'claw'],
      ['wingBone', 'wingFeath'], ['wingFeath', 'wingTip'],
      ['wingFeath', 'whiteBand'], ['tailFeath', 'tailTip']
    ],
    materials: {
      black: ['blackDark', 'blackMid', 'blackHi'],
      white: ['whiteDark', 'whiteMid', 'whiteHi'],
      red:   ['redDark',   'redMid',   'redHi'],
      slate: ['slateDark', 'slateMid', 'slateHi'],
      bolt:  ['boltDark',  'boltMid',  'boltHi']
    },
    protectedParts: ['eye', 'beak', 'wingTip', 'tailTip']
  });

  // 3 套高对比换色皮肤（0 禁用字，0 重色）
  const SKINS = [
    {
      id: 'storm_raven',
      name: '玄雪雷羽',
      dot: '#4ce0ff',
      outline: '#07090f',
      pal: {},
      fx: { arc: '#7cf4ff', arcCore: '#e8feff', arcOut: '#155c82', spark: '#4ce0ff' }
    },
    {
      id: 'crimson_bolt',
      name: '墨褐金电',
      dot: '#ffbe3b',
      outline: '#120a08',
      pal: {
        blackDark: '#171110', blackMid: '#2e221e', blackHi: '#4f3b33',
        whiteDark: '#cfc2ad', whiteMid: '#f2e8d5', whiteHi: '#fffaf0',
        redDark:   '#9e1914', redMid:   '#eb3223', redHi:   '#ff7052',
        slateDark: '#362a24', slateMid: '#5e4b40', slateHi: '#8c7465',
        boltDark:  '#c27a10', boltMid:  '#ffbe33', boltHi:  '#fff6bd',
        eyeIris:   '#ff5526'
      },
      fx: { arc: '#ffd24d', arcCore: '#fff9cf', arcOut: '#8f4d0c', spark: '#ffbe33' }
    },
    {
      id: 'cobalt_gale',
      name: '靛青霜电',
      dot: '#5ea8ff',
      outline: '#070e1c',
      pal: {
        blackDark: '#0b152b', blackMid: '#182b52', blackHi: '#2f4c85',
        whiteDark: '#b8d0e8', whiteMid: '#e2f0fc', whiteHi: '#f7fbff',
        redDark:   '#a32914', redMid:   '#f04c24', redHi:   '#ff8357',
        slateDark: '#1c3259', slateMid: '#355891', slateHi: '#5e86c4',
        boltDark:  '#2470d6', boltMid:  '#66c2ff', boltHi:  '#e0f7ff',
        eyeIris:   '#ffe042'
      },
      fx: { arc: '#7dd3ff', arcCore: '#ebfaff', arcOut: '#194b8f', spark: '#66c2ff' }
    }
  ];

  // =========================================================================
  // 1. 猛禽躯干（16×22×16）：纯黑厚胸 + 宽大亮雪白领带 + 一对放大亮红利爪
  // =========================================================================
  function buildTorso(makeCanvas) {
    const W = 16, D = 22, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.8, 6.8, -9.5, 9.8, 2, 15, (x, y, z, X, Y) => {
      const dChest = (Math.hypot(X / 5.4, (Y - 2.4) / 6.2, (z - 8.6) / 4.8) - 1) * 4.8;
      const dBack  = (Math.hypot(X / 4.4, (Y + 3.6) / 5.6, (z - 7.8) / 4.0) - 1) * 4.0;
      if (smin(dChest, dBack, 1.8) > 0) return;

      // 胸前与双肩宽大亮雪白羽带（俯视下与黑羽极强对比）
      const isCollar = (Y > 1.8 && z > 6.4) || (Math.abs(X) > 2.6 && Y > -1.2 && Y < 4.5 && z > 8.6);
      const isBellyWhite = z < 6.4 && Math.abs(X) < 3.6 && Y > -2.5;
      if (isCollar || isBellyWhite) {
        m.setRaw(x, y, z, mat('white'), partId.whiteBand);
      } else {
        m.setRaw(x, y, z, mat('black'), partId.torso);
      }
    });

    // 背脊双道亮雪白肩纹
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 2.4, 4.2, 12.6, s * 3.6, -2.5, 11.4, 1.15, 0.85, mat('white'), partId.whiteBand, true);
    }

    // 放大亮红猛禽利爪（悬空微曲，俯视侧视均醒目）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 3.2, -1.0, 4.8, s * 4.0, 0.8, 2.2, 1.35, 1.05, mat('red'), partId.claw, true);
      // 前三趾 + 后一趾
      m.paintCapsule(s * 4.0, 0.8, 2.2, s * 4.4, 4.0, 1.1, 0.82, 0.52, mat('red'), partId.claw, true);
      m.paintCapsule(s * 4.0, 0.8, 2.2, s * 5.6, 3.0, 1.1, 0.72, 0.48, mat('red'), partId.claw, true);
      m.paintCapsule(s * 4.0, 0.8, 2.2, s * 2.6, 3.2, 1.1, 0.72, 0.48, mat('red'), partId.claw, true);
      m.paintCapsule(s * 4.0, 0.8, 2.2, s * 3.8, -1.6, 1.2, 0.72, 0.48, mat('red'), partId.claw, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.0, headZ: 15, centerZ: 8 });
  }

  // =========================================================================
  // 2. 猛禽首（14×18×14）：纯黑额顶 + 亮雪白颊冠 + 放大亮红钩喙 + 锐利金眼
  //    枢轴锁在后颈根 (0, -3.2)
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -3.2 };
  function buildHead(makeCanvas) {
    const W = 14, D = 18, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 亮雪白颈根过渡
    m.paintCapsule(0, -3.8, 4.8, 0, -0.8, 6.2, 3.0, 3.3, mat('white'), partId.whiteBand, true);
    // 猛禽颅骨（纯黑头顶 + 雪白侧颊）
    m.fillAABB(-4.5, 4.5, -3.5, 4.5, 3, 11, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 3.7, (Y - 0.2) / 3.8, (z - 6.8) / 3.4);
      if (d > 1.0) return;
      const isWhiteCheek = z < 6.4 && Math.abs(X) > 1.6 && Y < 2.2;
      m.setRaw(x, y, z, isWhiteCheek ? mat('white') : mat('black'), isWhiteCheek ? partId.whiteBand : partId.head);
    });

    // 头后尖锐三簇电刺冠羽（纯黑基 + 青白尖）
    m.paintCapsule(0, -0.6, 9.4, 0, -5.8, 12.0, 1.15, 0.55, mat('black'), partId.crest, true);
    m.paintCapsule(0, -4.6, 11.4, 0, -7.2, 12.6, 0.68, 0.45, mat('bolt'), partId.wingTip, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.8, -0.8, 8.8, s * 3.8, -5.2, 10.6, 0.95, 0.52, mat('white'), partId.crest, true);
    }

    // 放大亮红猛禽钩喙（俯视极清晰！）
    m.paintCapsule(0, 2.8, 6.8, 0, 7.2, 6.0, 2.05, 1.15, mat('red'), partId.beak, true);
    m.paintCapsule(0, 6.8, 6.0, 0, 8.2, 3.6, 1.05, 0.55, mat('red'), partId.beak, true);
    m.paintCapsule(0, 2.6, 4.8, 0, 5.8, 4.6, 1.35, 0.78, mat('red'), partId.beak, true);

    m.despeckle();
    m.applyArtShading(true);

    // 锐利 2×2 金眼（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.0);
    const eyeZ = 7;
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 5; step++) {
        const tx = Math.round(hw + s * (4.4 - step));
        if (m.getPartId(tx, eyeY, eyeZ) === partId.head) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 3.0);
      for (const dy of [0, 1]) for (const dz of [0, 1]) {
        const kId = (dz === 1 && dy === 1) ? keyToId.eyeGlint : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
        m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 5.0, headZ: 13, centerZ: 6 });
  }

  // =========================================================================
  // 3. 锐利电刺分叉尾羽（14×18×10，枢轴锁尾根 (0, 6.2)）
  // =========================================================================
  const TAIL_PIVOT = { x: 0, y: 6.2 };
  function buildTail(makeCanvas) {
    const m = new VoxelModel(14, 18, 10, SPEC);
    const { mat, partId } = SPEC;

    // 尾根基座
    m.paintEllipsoid(0, 5.5, 4.4, 2.8, 2.6, 2.0, mat('black'), partId.tailFeath, true);
    // 5 根扇形展开的锐利硬刺尾羽（黑羽 + 白中纹 + 亮青白硬电刺尖）
    const feathers = [
      { tx:  0.0, ty: -6.8, tz: 5.4, r: 1.25 },
      { tx: -3.6, ty: -6.2, tz: 5.0, r: 1.15 },
      { tx:  3.6, ty: -6.2, tz: 5.0, r: 1.15 },
      { tx: -5.8, ty: -3.6, tz: 4.5, r: 1.05 },
      { tx:  5.8, ty: -3.6, tz: 4.5, r: 1.05 }
    ];
    for (let i = 0; i < feathers.length; i++) {
      const f = feathers[i];
      const mx = f.tx * 0.62, my = lerp(5.2, f.ty, 0.62), mz = lerp(4.4, f.tz, 0.62);
      m.paintCapsule(0, 5.2, 4.4, mx, my, mz, f.r, f.r * 0.85, i % 2 === 0 ? mat('black') : mat('white'), partId.tailFeath, true);
      m.paintCapsule(mx, my, mz, f.tx, f.ty, f.tz, f.r * 0.82, 0.52, mat('bolt'), partId.tailTip, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.0, headZ: 9, centerZ: 5 });
  }

  // =========================================================================
  // 4. 三段宽大猛禽羽翼（28×22×20）：纯黑大羽 + 亮雪白翼带 + 放大青白电刺硬羽尖
  // =========================================================================
  const WING_PIVOT = { x: 10.6, y: 3.4 };

  function paintFeatherBlade(m, p0, p1, r0, r1, matName, partId) {
    m.paintCapsule(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], r0, r1, SPEC.mat(matName), partId, true);
  }

  function buildWing(makeCanvas, side, pose) {
    const W = 28, D = 22, H = 20;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const s = side;
    const rx = -s * WING_PIVOT.x;
    const ry = WING_PIVOT.y;
    const rz = 9.0;

    const flap = pose === 'up' ? 0.92 : (pose === 'down' ? -0.85 : (pose === 'glide' ? 0.16 : 0.04));
    const pRoot  = [rx, ry, rz];
    const pWrist = [rx + s * 9.8,  ry + 3.2, rz + 1.8 + flap * 3.0];
    const pTip   = [rx + s * 20.5, ry - 0.6, rz + 0.8 + flap * 5.8];

    // 翼面羽片（内段纯黑 + 中段亮雪白宽羽带，强对比！）
    for (let i = 0; i < 6; i++) {
      const u = i / 5;
      const sx = lerp(pRoot[0], pWrist[0], u);
      const sy = lerp(pRoot[1], pWrist[1], u);
      const sz = lerp(pRoot[2], pWrist[2], u);
      const backLen = lerp(8.4, 10.2, Math.sin(u * Math.PI * 0.85 + 0.15));
      const ex = sx + s * (0.8 + u * 1.4);
      const ey = sy - backLen;
      const ez = sz - 1.2 - u * 0.6;
      const mx = lerp(sx, ex, 0.52), my = lerp(sy, ey, 0.52), mz = lerp(sz, ez, 0.52);
      paintFeatherBlade(m, [sx, sy, sz], [mx, my, mz], 1.45, 1.25, 'black', partId.wingFeath);
      paintFeatherBlade(m, [mx, my, mz], [ex, ey, ez], 1.25, 0.82, 'white', partId.whiteBand);
    }

    // 外段 5 根放大锐利初级飞羽 + 末端青白电刺硬羽尖（俯视最醒目的特征！）
    const primaries = [
      { u: 0.15, dx: 5.0, dy: -8.6, dz: -1.6 },
      { u: 0.38, dx: 7.4, dy: -7.4, dz: -1.2 },
      { u: 0.62, dx: 9.2, dy: -5.4, dz: -0.6 },
      { u: 0.82, dx: 10.2, dy: -2.8, dz:  0.0 },
      { u: 1.00, dx: 10.8, dy:  0.2, dz:  0.4 }
    ];
    for (const pr of primaries) {
      const bx = lerp(pWrist[0], pTip[0], pr.u * 0.55);
      const by = lerp(pWrist[1], pTip[1], pr.u * 0.55);
      const bz = lerp(pWrist[2], pTip[2], pr.u * 0.55);
      const ex = clamp(bx + s * pr.dx, -13.2, 13.2);
      const ey = clamp(by + pr.dy, -10.0, 9.8);
      const ez = clamp(bz + pr.dz + flap * 1.6, 1.5, 18.2);
      const mx = lerp(bx, ex, 0.56), my = lerp(by, ey, 0.56), mz = lerp(bz, ez, 0.56);
      paintFeatherBlade(m, [bx, by, bz], [mx, my, mz], 1.35, 1.05, 'black', partId.wingFeath);
      // 末端放大青白电刺硬羽尖
      paintFeatherBlade(m, [mx, my, mz], [ex, ey, ez], 1.08, 0.55, 'bolt', partId.wingTip);
    }

    // 粗壮前缘翼骨（纯黑 + 亮雪白肩线）
    m.paintEllipsoid(rx, ry, rz, 2.0, 2.0, 1.8, mat('black'), partId.wingBone, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pWrist[0], pWrist[1], pWrist[2], 1.75, 1.45, mat('black'), partId.wingBone, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pTip[0], pTip[1], pTip[2], 1.38, 0.85, mat('slate'), partId.wingBone, true);
    // 前缘雪白亮线
    m.paintCapsule(pRoot[0], pRoot[1] + 0.6, pRoot[2] + 0.8, pWrist[0], pWrist[1] + 0.5, pWrist[2] + 0.8, 0.92, 0.72, mat('white'), partId.whiteBand, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.5, headZ: 18, centerZ: 9 });
  }

  // =========================================================================
  // 5. 生物定义与状态机
  // =========================================================================
  const Sky3Def = {
    id: 'sky3_impundulu',
    code: '天3',
    status: 'done',
    name: '雷羽大鸟',
    tag: 'M02 三段电刺硬羽 · 拍翼折线电弧',
    summary: '黑白极强对比大型猛禽，三段宽大羽翼末端雕成放大锐利的青白电刺硬羽尖与亮红钩喙利爪；拍翼与放雷时左右羽尖跃动亮青像素短折电弧',
    defaultHabitat: 'thunderPeak',
    footRadius: 11.0,
    ecoWeight: 1.35,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '高空雷云盘旋', loop: true, status: 'done' },
      { id: 'idle',   name: '原地鼓翼悬停', loop: true, status: 'done' },
      { id: 'spark',  name: '双翼放雷电弧', loop: false, duration: 2.6, status: 'done' }
    ],
    blocks: [
      '纯黑雪白极强对比猛禽身与亮红喙爪',
      '三段硬羽振翅与放大青白电刺羽尖',
      '解耦巡航气流与高频拍翅托举',
      '左右羽尖与尾刺间跳跃像素短折电弧'
    ],
    soulHabit: '雷云峰顶高空大弧线盘旋滑翔，强力拍翼时左右青白电刺羽尖间跃动亮青像素小电弧，偶发悬停振羽释放连环电弧',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torso:        buildTorso(makeCanvas),
        head:         buildHead(makeCanvas),
        tail:         buildTail(makeCanvas),
        wingL_up:     buildWing(makeCanvas, -1, 'up'),
        wingR_up:     buildWing(makeCanvas,  1, 'up'),
        wingL_mid:    buildWing(makeCanvas, -1, 'mid'),
        wingR_mid:    buildWing(makeCanvas,  1, 'mid'),
        wingL_dn:     buildWing(makeCanvas, -1, 'down'),
        wingR_dn:     buildWing(makeCanvas,  1, 'down'),
        wingL_glide:  buildWing(makeCanvas, -1, 'glide'),
        wingR_glide:  buildWing(makeCanvas,  1, 'glide')
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.3;
      const seed = opts.seed ?? 31;

      const headLookSpring = new SpringDamper1D(0, 96, 6.8);
      const tailWagSpring  = new SpringDamper1D(0, 72, 6.2);
      const sockets = new SocketTracker();

      const state = {
        x: hx0,
        y: hy0,
        z: 18.0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        orbitAng: seed * 0.27,
        wingPhase: 0,
        wingPose: 'mid',
        wingSweep: 0,
        flapLift: 0,
        glideClock: 0,
        arcStrength: 0,
        arcPhase: 0,
        autoSparkCd: 3.4,
        autoSparkT: 0,
        sparkVfxCd: 0
      };

      let curSkin = SKINS[0];

      // 实时计算左右羽尖与尾尖世界坐标（用于电弧线段和粒子生成）
      function getTipWorld(sMul) {
        const yw = state.yaw;
        const baseZ = Math.max(2.0, state.z + state.flapLift);
        const tipZOff = state.wingPose === 'up' ? 16.2 : (state.wingPose === 'down' ? 4.4 : 10.6);
        const tipYOff = -1.2 - state.wingSweep * 6.0;
        const [lx, ly] = localToWorldXY(state.x, state.y, yw, -22.5 * sMul, tipYOff * sMul);
        const [rx, ry] = localToWorldXY(state.x, state.y, yw,  22.5 * sMul, tipYOff * sMul);
        const [tx, ty] = localToWorldXY(state.x, state.y, yw,   0.0,        -16.2 * sMul);
        return {
          lx, ly, lz: baseZ + tipZOff * sMul,
          rx, ry, rz: baseZ + tipZOff * sMul,
          tx, ty, tz: baseZ + 9.2 * sMul
        };
      }

      const instance = {
        def: Sky3Def,
        cachePrefix: `sky3_imp_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 18.0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw ?? 0.3;
          state.wingPhase = 0;
          state.wingPose = 'mid';
          state.wingSweep = 0;
          state.flapLift = 0;
          state.arcStrength = 0;
          state.autoSparkCd = 3.0;
          state.autoSparkT = 0;
          headLookSpring.x = headLookSpring.v = 0;
          tailWagSpring.x = tailWagSpring.v = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex  = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp    = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);

          const action = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const actionTime = (eco && eco.actionTime) || 0;
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const homeYaw = (eco && eco.homeYaw) ?? 0.3;
          const maxR = (eco && eco.maxRadius) || 46;
          const limitR = maxR * 0.78;
          const fx = curSkin.fx || SKINS[0].fx;

          const prevX = state.x, prevY = state.y;
          state.glideClock += dt;
          state.arcPhase += dt * 22.0;

          let forcePose = null;
          let sweepTgt = 0;
          let flapLiftTgt = 0;
          let arcTarget = 0;
          let lookTgt = Math.sin(time * 1.4 + seed) * 0.36;

          if (action === 'spark') {
            // 放雷动作：原地微升悬停 -> 高频猛拍 -> 双翼与尾刺迸发强折线电弧
            const u = clamp(actionTime / 2.6, 0, 1);
            const kHold = expSmooth(dt, 4.5);
            state.x = lerp(state.x, homeX, kHold);
            state.y = lerp(state.y, homeY, kHold);
            state.z = lerp(state.z, (21.5 + Math.sin(u * Math.PI) * 3.5) * sMul, expSmooth(dt, 6.0));
            state.yaw = wrapAngle(state.yaw + Math.sin(u * TAU * 1.5) * 0.8 * dt);
            state.wingPhase += dt * gFreq * (u < 0.35 ? 4.5 : 10.8);
            const wb = Math.sin(state.wingPhase);
            if (u < 0.28) {
              forcePose = 'up';
              sweepTgt = -0.30;
              arcTarget = 0.65;
            } else {
              sweepTgt = wb * 0.36;
              flapLiftTgt = Math.sin(state.wingPhase - 0.85) * 1.2 * sMul;
              arcTarget = 1.0;
            }
            lookTgt = Math.sin(u * TAU * 2.0) * 0.45;
          } else if (action === 'idle') {
            // 原地鼓翼悬停，温和气流起伏 + 偶发羽尖小火花
            const tx = homeX + Math.sin(time * 0.65 + seed) * 3.4 * sMul;
            const ty = homeY + Math.cos(time * 0.58 + seed) * 3.0 * sMul;
            const kPos = expSmooth(dt, 3.6);
            state.x = lerp(state.x, tx, kPos);
            state.y = lerp(state.y, ty, kPos);
            state.z = lerp(state.z, (17.5 + Math.sin(time * 1.1) * 1.6) * sMul, expSmooth(dt, 4.5));
            const aimYaw = homeYaw + Math.sin(time * 0.55) * 0.28;
            state.yaw = wrapAngle(state.yaw + wrapAngle(aimYaw - state.yaw) * expSmooth(dt, 3.5));

            state.wingPhase += dt * gFreq * 6.8;
            const wb = Math.sin(state.wingPhase);
            sweepTgt = wb * 0.28;
            flapLiftTgt = Math.sin(state.wingPhase - 0.85) * 0.85 * sMul;
            // 下拍峰值瞬间跃出短电弧
            arcTarget = wb < -0.52 ? 0.78 : 0.0;
          } else {
            // 高空雷云盘旋：慢速大弧线圆周+椭圆巡航，交替滑翔与强力拍翼放弧
            state.orbitAng = wrapAngle(state.orbitAng + dt * 0.62 * spdMul);
            const rX = Math.min(28.0, limitR * 0.88);
            const rY = Math.min(24.0, limitR * 0.76);
            const tx = homeX + Math.cos(state.orbitAng) * rX + ((eco && eco.avoidX) || 0) * 0.3;
            const ty = homeY + Math.sin(state.orbitAng) * rY + Math.sin(state.orbitAng * 2.0) * 4.5 + ((eco && eco.avoidY) || 0) * 0.3;

            const dx = tx - state.x, dy = ty - state.y;
            const desiredYaw = Math.atan2(-dx, dy);
            state.yaw = wrapAngle(state.yaw + wrapAngle(desiredYaw - state.yaw) * expSmooth(dt, 4.2));
            const kPos = expSmooth(dt, 2.8 * spdMul);
            state.x = lerp(state.x, tx, kPos);
            state.y = lerp(state.y, ty, kPos);

            // 慢速气流缓升缓降（绝不跟拍翅同频弹跳）
            const thermalZ = (18.5 + Math.sin(time * 0.72 + seed) * 2.8) * sMul;
            state.z = lerp(state.z, thermalZ, expSmooth(dt, 3.5));

            const cycle = (state.glideClock % 6.2) / 6.2;
            const isGliding = cycle > 0.56 && cycle < 0.82;
            if (isGliding) {
              forcePose = 'glide';
              sweepTgt = -0.22;
              flapLiftTgt = 0;
              state.wingPhase += dt * gFreq * 1.4;
            } else {
              state.wingPhase += dt * gFreq * 6.4;
              const wb = Math.sin(state.wingPhase);
              sweepTgt = wb * 0.32;
              flapLiftTgt = Math.sin(state.wingPhase - 0.85) * 0.95 * sMul;
              if (wb < -0.45) arcTarget = 0.82;
            }

            // 周期自动爆发一小段羽尖电弧
            state.autoSparkCd -= dt;
            if (state.autoSparkCd <= 0) {
              state.autoSparkCd = 4.2 + Math.random() * 2.2;
              state.autoSparkT = 0.95;
            }
            if (state.autoSparkT > 0) {
              state.autoSparkT = Math.max(0, state.autoSparkT - dt);
              arcTarget = 1.0;
            }
          }

          // 严格巡游边界钳制（maxRadius * 0.80 内）
          const dist = Math.hypot(state.x, state.y);
          if (dist > limitR && dist > 0.001) {
            state.x *= limitR / dist;
            state.y *= limitR / dist;
          }
          const safeDt = Math.max(dt, 0.001);
          state.vx = (state.x - prevX) / safeDt;
          state.vy = (state.y - prevY) / safeDt;

          state.wingSweep = lerp(state.wingSweep, sweepTgt, expSmooth(dt, 13.0));
          state.flapLift = lerp(state.flapLift, flapLiftTgt, expSmooth(dt, 11.0));
          state.arcStrength = lerp(state.arcStrength, arcTarget, expSmooth(dt, arcTarget > state.arcStrength ? 22.0 : 9.0));

          const wbVal = Math.sin(state.wingPhase);
          state.wingPose = forcePose || (wbVal > 0.30 ? 'up' : (wbVal < -0.30 ? 'down' : 'mid'));

          headLookSpring.update(dt, lookTgt, 92 * sp, 6.8);
          tailWagSpring.update(dt, -state.wingSweep * 0.45 * flex, 68 * sp, 6.2);

          // 羽尖电火花粒子
          state.sparkVfxCd -= dt;
          if (vfx && state.arcStrength > 0.35 && state.sparkVfxCd <= 0) {
            state.sparkVfxCd = action === 'spark' ? 0.065 : 0.13;
            const tips = getTipWorld(sMul);
            const pickL = Math.random() < 0.5;
            const px = pickL ? tips.lx : tips.rx;
            const py = pickL ? tips.ly : tips.ry;
            const pz = pickL ? tips.lz : tips.rz;
            vfx.spawnParticle(
              px + (Math.random() - 0.5) * 2.4 * sMul,
              py + (Math.random() - 0.5) * 2.4 * sMul,
              pz + (Math.random() - 0.5) * 2.0 * sMul,
              (Math.random() - 0.5) * 14 * sMul,
              (Math.random() - 0.5) * 14 * sMul,
              (3 + Math.random() * 8) * sMul,
              0.32 + Math.random() * 0.22,
              1.35 + Math.random() * 0.45,
              Math.random() < 0.45 ? fx.arcCore : fx.spark,
              true,
              6
            );
          }

          sockets.setLocal('beak', state.x, state.y, state.z + state.flapLift, state.yaw, 0, 13.0, 11.5, sMul);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const baseZ = Math.max(2.0, state.z + state.flapLift);
          const hYaw = wrapAngle(yw + clamp(headLookSpring.x, -0.58, 0.58));
          const tYaw = wrapAngle(yw + clamp(tailWagSpring.x, -0.42, 0.42));
          const fx = curSkin.fx || SKINS[0].fx;

          // 1. 猛禽躯干（纯黑+亮雪白领+亮红爪）
          list.push({
            partKey: 'torso',
            asset: parts.torso,
            x: state.x,
            y: state.y,
            lift: baseZ,
            ro: yw,
            bias: 0.15
          });

          // 2. 猛禽首（pivotToWorldXY 锁颈根）
          const [njx, njy] = localToWorldXY(state.x, state.y, yw, 0, 7.6 * sMul);
          const [hx, hy] = pivotToWorldXY(njx, njy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          list.push({
            partKey: 'head',
            asset: parts.head,
            x: hx,
            y: hy,
            lift: baseZ + 6.8 * sMul,
            ro: hYaw,
            bias: 0.52
          });

          // 3. 锐利分叉电刺尾羽
          const [tjx, tjy] = localToWorldXY(state.x, state.y, yw, 0, -7.8 * sMul);
          const [tx, ty] = pivotToWorldXY(tjx, tjy, tYaw, TAIL_PIVOT.x * sMul, TAIL_PIVOT.y * sMul);
          list.push({
            partKey: 'tail',
            asset: parts.tail,
            x: tx,
            y: ty,
            lift: baseZ + 3.6 * sMul,
            ro: tYaw,
            bias: -0.35
          });

          // 4. 左右三段宽大羽翼
          const wp = state.wingPose === 'glide'
            ? 'glide'
            : (state.wingPose === 'down' ? 'dn' : (state.wingPose === 'mid' ? 'mid' : 'up'));
          for (const s of [-1, 1]) {
            const [shX, shY] = localToWorldXY(state.x, state.y, yw, s * 4.2 * sMul, 1.8 * sMul);
            const wYaw = wrapAngle(yw - s * state.wingSweep);
            const [wx, wy] = localToWorldXY(shX, shY, wYaw, s * WING_PIVOT.x * sMul, -WING_PIVOT.y * sMul);
            const key = (s < 0 ? 'wingL_' : 'wingR_') + wp;
            list.push({
              partKey: key,
              asset: parts[key],
              x: wx,
              y: wy,
              lift: baseZ + 2.2 * sMul,
              ro: wYaw,
              bias: -0.08
            });
          }

          // 5. 拍翼/放雷时的亮青像素短折电弧（kind: 'line' + jitter）
          if (state.arcStrength > 0.25) {
            const tips = getTipWorld(sMul);
            const op = clamp(state.arcStrength, 0, 1);
            // 左羽尖 <-> 右羽尖横跨电弧
            list.push({
              kind: 'line',
              x0: tips.lx, y0: tips.ly, z0: tips.lz,
              x1: tips.rx, y1: tips.ry, z1: tips.rz,
              widthArtPx: 1,
              color: fx.arcCore,
              outlineColor: fx.arcOut,
              opacity: op,
              sag: -1.8 * sMul,
              jitter: 2.2 * sMul,
              jitterPhase: state.arcPhase,
              segments: 10,
              bias: 0.95
            });
            // 左/右羽尖 -> 锐利尾刺跳跃短电弧
            if (state.arcStrength > 0.55) {
              list.push({
                kind: 'line',
                x0: tips.lx, y0: tips.ly, z0: tips.lz,
                x1: tips.tx, y1: tips.ty, z1: tips.tz,
                widthArtPx: 1,
                color: fx.arc,
                outlineColor: fx.arcOut,
                opacity: op * 0.9,
                sag: 0,
                jitter: 1.7 * sMul,
                jitterPhase: state.arcPhase * 1.3 + 2.1,
                segments: 8,
                bias: 0.92
              });
              list.push({
                kind: 'line',
                x0: tips.rx, y0: tips.ry, z0: tips.rz,
                x1: tips.tx, y1: tips.ty, z1: tips.tz,
                widthArtPx: 1,
                color: fx.arc,
                outlineColor: fx.arcOut,
                opacity: op * 0.9,
                sag: 0,
                jitter: 1.7 * sMul,
                jitterPhase: state.arcPhase * 1.15 + 4.4,
                segments: 8,
                bias: 0.92
              });
            }
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sky3Def.id,
            code: Sky3Def.code,
            status: Sky3Def.status,
            name: Sky3Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            wingPose: state.wingPose,
            footRadius: Sky3Def.footRadius,
            headZ: 24,
            centerZ: 14,
            blocks: Sky3Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sky3Def);
})(window.PixelWorkshop);
