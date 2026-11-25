'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 洞1 · 猫头蛇（阿尔卑斯 Tatzelwurm · M08/M04 溶洞捕手）
  //   1. 俯视强对比造型：放大萌锐猫首 + 一对独立可动竖直大尖耳 + 亮琥珀绿大猫眼 +
  //      仅有一对健壮虎斑前爪 + 8 节暖橘褐/象牙环纹修长蛇身（在暗溶洞里极清亮）；
  //   2. 独特步态与习性：靠双前爪交替前扒拖着 8 节蛇身蛇尾爬行，时不时急停竖耳倾听
  //      岩壁动静，伏低身姿后再向前猛扑一小段；
  //   3. 严格守则：26 色 <= 48、0 重色、0 禁用字、零常态 scaleX/scaleY、
  //      全节点坐标严格钳制在 maxRadius * 0.80 内。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 暖橘褐主毛/主鳞（暗溶洞里高明度暖色立住视觉）
      coatDark:   '#8f4216',
      coatMid:    '#d47228',
      coatHi:     '#ffab52',
      // 深栗虎斑与耳尖深纹
      stripeDark: '#36190c',
      stripeMid:  '#5c2c16',
      stripeHi:   '#874626',
      // 象牙奶油环纹与颊毛/胸毛/爪掌
      ivoryDark:  '#b8a382',
      ivoryMid:   '#e6d6b5',
      ivoryHi:    '#fff4db',
      // 内耳与猫鼻暖粉
      pinkDark:   '#9e4852',
      pinkMid:    '#db7984',
      pinkHi:     '#ffadb6',
      // 利爪角质
      clawDark:   '#3b312a',
      clawMid:    '#6b5c50',
      clawHi:     '#a69382',
      // 蛇腹浅暖灰
      bellyDark:  '#7d6952',
      bellyMid:   '#b0987b',
      bellyHi:    '#d9c3a7',
      // 亮琥珀绿大猫眼（eyeGlint 绝不进 glowKeys）
      eyeDark:    '#0c120d',
      eyeIris:    '#4fe059',
      eyeRim:     '#a8ff5e',
      eyeGlint:   '#f7fff5'
    },
    glowKeys: [],
    parts: [
      'coat', 'stripe', 'ivory', 'pink', 'claw', 'belly', 'eye'
    ],
    noCrease: [
      ['coat', 'stripe'],
      ['coat', 'ivory'],
      ['coat', 'pink'],
      ['coat', 'belly'],
      ['ivory', 'belly'],
      ['ivory', 'claw'],
      ['coat', 'eye'],
      ['ivory', 'eye']
    ],
    materials: {
      coat:   ['coatDark',   'coatMid',   'coatHi'],
      stripe: ['stripeDark', 'stripeMid', 'stripeHi'],
      ivory:  ['ivoryDark',  'ivoryMid',  'ivoryHi'],
      pink:   ['pinkDark',   'pinkMid',   'pinkHi'],
      claw:   ['clawDark',   'clawMid',   'clawHi'],
      belly:  ['bellyDark',  'bellyMid',  'bellyHi']
    },
    protectedParts: ['eye', 'pink', 'claw']
  });

  // 3 套高对比溶洞皮肤（每套严格 22 色 <= 48、0 重色、0 禁用字）
  const SKINS = [
    {
      id: 'amber_tabby',
      name: '暖橘虎斑（溶洞亮纹）',
      dot: '#d47228',
      outline: '#140c08',
      pal: {},
      dustColor: '#9e8f7d'
    },
    {
      id: 'snow_lynx',
      name: '霜白岩猞（寒洞银纹）',
      dot: '#dce6ed',
      outline: '#0d131a',
      pal: {
        coatDark:   '#8a9eab', coatMid:   '#c4d5e0', coatHi:   '#edf6fc',
        stripeDark: '#2a3745', stripeMid: '#4c6073', stripeHi: '#758ea6',
        ivoryDark:  '#9eb0ba', ivoryMid:  '#d4e2eb', ivoryHi:  '#f7fbff',
        pinkDark:   '#9e5268', pinkMid:   '#d98299', pinkHi:   '#ffb8c9',
        clawDark:   '#282e38', clawMid:   '#505b6b', clawHi:   '#8492a6',
        bellyDark:  '#6f7e8a', bellyMid:  '#9fb0bd', bellyHi:  '#cddbe6',
        eyeIris:    '#38d4f0', eyeRim:    '#9cf5ff', eyeGlint: '#f2fcff'
      },
      dustColor: '#92a2ad'
    },
    {
      id: 'golden_calico',
      name: '金褐环纹（岩脉金斑）',
      dot: '#e0a928',
      outline: '#171007',
      pal: {
        coatDark:   '#9e6c14', coatMid:   '#e0a928', coatHi:   '#ffe066',
        stripeDark: '#3d220e', stripeMid: '#6e3f1c', stripeHi: '#9e6231',
        ivoryDark:  '#b8a87f', ivoryMid:  '#ebe0be', ivoryHi:  '#fff9e3',
        pinkDark:   '#a34f45', pinkMid:   '#de7d6f', pinkHi:   '#ffb3a6',
        clawDark:   '#382c21', clawMid:   '#695542', clawHi:   '#a38970',
        bellyDark:  '#857353', bellyMid:  '#baaa84', bellyHi:  '#e6dab8',
        eyeIris:    '#40d98d', eyeRim:    '#9effc8', eyeGlint: '#f5fff8'
      },
      dustColor: '#a89476'
    }
  ];

  // =========================================================================
  // 1. 体素部件建模（全部小巧清晰，单块 <= 16 格）
  // =========================================================================

  // 放大萌锐猫首（16×16×12，圆润猫颊 + 小粉鼻 + 额头 M 虎斑 + 亮琥珀绿大猫眼）
  function buildCatHead(makeCanvas) {
    const W = 16, D = 16, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-6.8, 6.8, -6.2, 6.6, 1, 10, (x, y, z, X, Y) => {
      // 圆润饱满猫头颅 + 两侧蓬松猫颊毛 + 前凸短吻
      const inCranium = (X / 5.4) ** 2 + ((Y + 0.4) / 4.8) ** 2 + ((z - 5.2) / 4.3) ** 2 <= 1.0;
      const inCheekL  = ((X + 4.0) / 2.4) ** 2 + ((Y - 0.5) / 2.6) ** 2 + ((z - 4.2) / 2.5) ** 2 <= 1.0;
      const inCheekR  = ((X - 4.0) / 2.4) ** 2 + ((Y - 0.5) / 2.6) ** 2 + ((z - 4.2) / 2.5) ** 2 <= 1.0;
      const inMuzzle  = (X / 3.0) ** 2 + ((Y - 4.2) / 2.4) ** 2 + ((z - 4.0) / 2.2) ** 2 <= 1.0;

      if (!inCranium && !inCheekL && !inCheekR && !inMuzzle) return;

      // 额头三条清晰虎斑竖纹 + 颊侧虎斑
      const isForeheadStripe = z >= 7.5 && Y >= -1.8 && Y <= 2.8 &&
        (Math.abs(X) <= 0.75 || (Math.abs(Math.abs(X) - 2.3) <= 0.65));
      const isCheekIvory = (inMuzzle && z <= 4.6) || ((inCheekL || inCheekR) && z <= 4.3 && Y >= 0.4);
      const isChin = z <= 2.4 && Y >= 1.0;

      if (isForeheadStripe) {
        m.setRaw(x, y, z, mat('stripe'), partId.stripe);
      } else if (isCheekIvory || isChin) {
        m.setRaw(x, y, z, mat('ivory'), partId.ivory);
      } else {
        m.setRaw(x, y, z, mat('coat'), partId.coat);
      }
    });

    // 小巧暖粉猫鼻（前端正中）
    m.paintEllipsoid(0, 6.0, 4.7, 1.15, 0.9, 0.85, mat('pink'), partId.pink, true);

    m.despeckle();
    m.applyArtShading(true);

    // 放大亮琥珀绿大猫眼（3×2 醒目猫眼，俯视清晰可见，eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 4.4);
    const eyeZ = 6;
    for (const s of [-1, 1]) {
      const exInner = Math.round(hw + s * 1.9);
      const exOuter = Math.round(hw + s * 2.9);
      // 贴表皮找最外层像素，保证俯视零遮挡
      for (const ex of [exInner, exOuter]) {
        m.setRaw(ex, eyeY,     eyeZ,     ex === exInner ? keyToId.eyeDark  : keyToId.eyeIris, partId.eye);
        m.setRaw(ex, eyeY,     eyeZ + 1, ex === exInner ? keyToId.eyeGlint : keyToId.eyeRim,  partId.eye);
        m.setRaw(ex, eyeY - 1, eyeZ + 1, keyToId.eyeIris, partId.eye);
      }
      // 清除眼睛正前方 1 格可能遮挡视线的毛发体素
      m.setRaw(exInner, eyeY + 1, eyeZ,     0, 0);
      m.setRaw(exInner, eyeY + 1, eyeZ + 1, 0, 0);
      m.setRaw(exOuter, eyeY + 1, eyeZ,     0, 0);
      m.setRaw(exOuter, eyeY + 1, eyeZ + 1, 0, 0);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 6.2, headZ: 11, centerZ: 5 });
  }

  // 独立竖直大尖猫耳（6×6×8，耳尖深褐、耳背暖橘、内耳粉白，竖耳倾听时可独立微颤）
  function buildCatEar(makeCanvas) {
    const W = 6, D = 6, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-2.6, 2.6, -2.2, 2.2, 0, 7, (x, y, z, X, Y) => {
      const t = z / 7;
      const halfW = lerp(2.3, 0.55, Math.pow(t, 0.85));
      const halfD = lerp(1.7, 0.55, Math.pow(t, 0.90));
      if (Math.abs(X) > halfW || Math.abs(Y) > halfD) return;
      // 前面微凹呈粉红内耳，耳尖深褐，背面暖橘
      const isTip = z >= 6;
      const isInner = Y > 0.25 && Math.abs(X) <= halfW * 0.65 && z >= 1 && z <= 5;
      if (isTip) {
        m.setRaw(x, y, z, mat('stripe'), partId.stripe);
      } else if (isInner) {
        m.setRaw(x, y, z, mat('pink'), partId.pink);
      } else {
        m.setRaw(x, y, z, mat('coat'), partId.coat);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 7, centerZ: 3 });
  }

  // 宽实肩胸（13×14×10，象牙胸毛 + 暖橘虎斑肩脊）
  function buildChest(makeCanvas) {
    const W = 13, D = 14, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5.8, 5.8, -6.0, 6.0, 0, 9, (x, y, z, X, Y) => {
      const d2 = (X / 5.2) ** 2 + (Y / 5.6) ** 2 + ((z - 4.4) / 4.2) ** 2;
      if (d2 > 1.0) return;
      const isStripe = z >= 6.2 && (Math.abs(Y - 1.2) < 1.15 || Math.abs(Y + 2.2) < 1.05);
      const isChestIvory = (Y > 2.4 && z <= 5.5) || z <= 2.0;
      if (isStripe) {
        m.setRaw(x, y, z, mat('stripe'), partId.stripe);
      } else if (isChestIvory) {
        m.setRaw(x, y, z, mat('ivory'), partId.ivory);
      } else {
        m.setRaw(x, y, z, mat('coat'), partId.coat);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.4, headZ: 9, centerZ: 4 });
  }

  // 健壮虎斑前爪（7×12×8，粗壮虎斑前臂 + 宽大象牙白猫掌 + 3 根清晰利爪）
  function buildForePaw(makeCanvas) {
    const W = 7, D = 12, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 粗壮虎斑上臂（后上端连肩部，前下端连猫掌）
    m.paintCapsule(0, -3.4, 5.4, 0, 0.8, 2.6, 2.2, 1.9, mat('coat'), partId.coat, true);
    // 臂背两道清晰深虎斑环
    m.paintEllipsoid(0, -1.8, 4.8, 2.1, 0.85, 1.4, mat('stripe'), partId.stripe, true);
    m.paintEllipsoid(0,  0.2, 3.3, 1.95, 0.8, 1.3, mat('stripe'), partId.stripe, true);
    // 宽大圆润象牙白前猫掌（贴地抓扒极醒目）
    m.paintEllipsoid(0, 2.4, 1.6, 2.4, 2.3, 1.5, mat('ivory'), partId.ivory, true);
    // 前端 3 根深色弧形利爪
    for (const cx of [-1.45, 0, 1.45]) {
      m.paintCapsule(cx, 3.8, 1.5, cx, 5.2, 0.8, 0.62, 0.42, mat('claw'), partId.claw, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2, headZ: 7, centerZ: 3 });
  }

  // 暖橘褐/象牙环纹蛇躯体节（共享 4 档，沿纵轴微拉长实现密排无缝蛇身）
  function buildSnakeSeg(makeCanvas, radius, isIvoryRing) {
    const ry = radius * 1.18;
    const W = Math.ceil(radius * 2 + 4);
    const D = Math.ceil(ry * 2 + 4);
    const H = Math.ceil(radius * 2 + 4);
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const cz = radius + 0.3;

    m.fillAABB(-radius - 0.6, radius + 0.6, -ry - 0.6, ry + 0.6, 0, Math.ceil(cz + radius + 0.8), (x, y, z, X, Y) => {
      const d2 = (X / radius) ** 2 + (Y / ry) ** 2 + ((z - cz) / radius) ** 2;
      if (d2 > 1.0) return;
      const isBelly = z <= cz - radius * 0.42;
      const isSpineStripe = !isIvoryRing && z >= cz + radius * 0.45 && Math.abs(X) <= radius * 0.48;
      const isEdgeBand = isIvoryRing && Math.abs(Y) > ry * 0.62 && z >= cz - 0.2;
      if (isBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (isSpineStripe || isEdgeBand) {
        m.setRaw(x, y, z, mat('stripe'), partId.stripe);
      } else if (isIvoryRing) {
        m.setRaw(x, y, z, mat('ivory'), partId.ivory);
      } else {
        m.setRaw(x, y, z, mat('coat'), partId.coat);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: radius, headZ: H - 1, centerZ: Math.round(cz) });
  }

  // 斑纹渐细蛇尾梢（7×12×6）
  function buildTailTip(makeCanvas) {
    const W = 7, D = 12, H = 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 3.6, 2.2, 0, 0.2, 2.0, 2.05, 1.55, mat('coat'), partId.coat, true);
    m.paintCapsule(0, 0.2, 2.0, 0, -2.6, 1.9, 1.50, 1.10, mat('ivory'), partId.ivory, true);
    m.paintCapsule(0, -2.6, 1.9, 0, -5.0, 2.2, 1.05, 0.62, mat('stripe'), partId.stripe, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 5, centerZ: 2 });
  }

  // =========================================================================
  // 2. 8 节修长蛇身链解算（含肩胸 + 8 节环纹蛇躯 + 尾梢 = 10 节点）
  // =========================================================================
  const NUM_BODY_SEGS = 8; // 8 节环纹蛇身
  const TOTAL_NODES = 1 + NUM_BODY_SEGS + 1; // 0:胸 1..8:8节蛇身 9:尾梢
  const SEG_STEP = 3.55;

  function relaxChain(nodes, segStep) {
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 1; i < nodes.length; i++) {
        const a = nodes[i - 1], b = nodes[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const step = (i === nodes.length - 1) ? segStep * 0.85 : segStep;
        const diff = (d - step) / d;
        b.x -= dx * diff;
        b.y -= dy * diff;
      }
    }
  }

  function clampInBound(x, y, boundR) {
    const d = Math.hypot(x, y);
    if (d > boundR && d > 0.0001) {
      return [x * (boundR / d), y * (boundR / d)];
    }
    return [x, y];
  }

  // =========================================================================
  // 3. 生物定义（洞1 · 猫头蛇）
  // =========================================================================
  const Cave1Def = {
    id: 'cave1_tatzelwurm',
    code: '洞1',
    name: '猫头蛇',
    status: 'done',
    tag: 'M08/M04 溶洞捕手 · 双前爪拖拽长蛇身',
    summary: '放大萌锐猫首（竖直大尖耳 + 亮琥珀绿大猫眼）+ 仅有一对健壮虎斑前爪 + 8 节暖橘褐/象牙环纹修长蛇身；靠双前爪交替前扒拖着蛇尾爬行，时不时急停竖耳倾听岩壁动静再猛扑一小段',
    defaultHabitat: 'cave',
    footRadius: 7.2,
    ecoWeight: 0.78,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '岩缝巡猎（扒爬→竖耳→猛扑）', loop: true, status: 'done' },
      { id: 'idle',   name: '原地伏地竖耳倾听', loop: true, status: 'done' },
      { id: 'pounce', name: '高频竖耳猛扑演示', loop: true, status: 'done' }
    ],
    blocks: [
      '放大萌锐猫首与亮琥珀绿大猫眼',
      '独立双大尖耳竖耳倾听微颤',
      '双虎斑前爪交替扒地推进',
      '8 节暖橘褐/象牙环纹拖拽蛇身链',
      '急停竖耳→伏低蓄势→低空猛扑状态机'
    ],
    soulHabit: '在暗溶洞里靠一对健壮虎斑前爪交替前扒拖着 8 节亮暖环纹蛇身游走，时不时急停竖直大猫耳左右倾听岩壁动静，伏低蓄势后猛扑一小段',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        catHead:       buildCatHead(makeCanvas),
        catEar:        buildCatEar(makeCanvas),
        chest:         buildChest(makeCanvas),
        forePaw:       buildForePaw(makeCanvas),
        segThickWarm:  buildSnakeSeg(makeCanvas, 3.85, false),
        segThickIvory: buildSnakeSeg(makeCanvas, 3.85, true),
        segMidWarm:    buildSnakeSeg(makeCanvas, 3.15, false),
        segMidIvory:   buildSnakeSeg(makeCanvas, 3.15, true),
        segSlimWarm:   buildSnakeSeg(makeCanvas, 2.45, false),
        segSlimIvory:  buildSnakeSeg(makeCanvas, 2.45, true),
        tailTip:       buildTailTip(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;
      const seed0 = opts.seed ?? 19;

      const nodes = Array.from({ length: TOTAL_NODES }, (_, i) => ({
        x: hx0, y: hy0 - i * SEG_STEP, z: 0.5, yaw: hyaw0
      }));

      const headLookSpring = new SpringDamper1D(0, 88, 7.8);
      const earPerkSpring  = new SpringDamper1D(0, 120, 9.0);
      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      const state = {
        x: hx0, y: hy0, z: 1.2,
        vx: 0, vy: 0, yaw: hyaw0,
        // 'crawl' | 'listen' | 'crouch' | 'pounce' | 'recover'
        mode: 'crawl',
        modeT: 0,
        modeDur: 4.4,
        seq: 1,
        navX: hx0 + 18,
        navY: hy0 + 10,
        pawPhase: 0,
        lastPawStep: 0,
        pounceStartX: hx0,
        pounceStartY: hy0,
        pounceEndX: hx0,
        pounceEndY: hy0,
        pounceYaw: hyaw0,
        pounceJumpZ: 0,
        dustCd: 0
      };

      function pickNavPoint(boundR) {
        state.seq++;
        const curAng = Math.atan2(state.y, state.x);
        const turn = (hash2i(state.seq, seed0, 101) > 0.5 ? 1 : -1) * lerp(1.1, 2.35, hash2i(state.seq, seed0, 211));
        const ang = curAng + turn;
        const r = lerp(boundR * 0.32, boundR * 0.86, hash2i(state.seq, seed0, 307));
        const [tx, ty] = clampInBound(Math.cos(ang) * r, Math.sin(ang) * r, boundR);
        state.navX = tx;
        state.navY = ty;
      }

      function enterMode(nextMode, boundR, sMul, compact) {
        state.mode = nextMode;
        state.modeT = 0;
        state.seq++;
        if (nextMode === 'crawl') {
          state.modeDur = compact ? 1.5 : lerp(3.8, 5.2, hash2i(state.seq, seed0, 401));
          pickNavPoint(boundR);
        } else if (nextMode === 'listen') {
          state.modeDur = compact ? 1.15 : lerp(1.5, 2.2, hash2i(state.seq, seed0, 503));
          earPerkSpring.impulse(4.5);
        } else if (nextMode === 'crouch') {
          state.modeDur = compact ? 0.45 : 0.58;
          // 确定猛扑落点（严格钳制在 boundR 内，不撞边界）
          const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
          const hopDist = (compact ? 15.5 : 17.0) * sMul;
          let ex = nodes[0].x + fwdX * hopDist;
          let ey = nodes[0].y + fwdY * hopDist;
          if (Math.hypot(ex, ey) > boundR * 0.92) {
            // 若前方接近边缘，则转向场地中心方向再扑
            const toCenterYaw = Math.atan2(-(-nodes[0].x), -nodes[0].y);
            state.pounceYaw = toCenterYaw + (hash2i(state.seq, seed0, 607) - 0.5) * 0.55;
            const cxDir = -Math.sin(state.pounceYaw), cyDir = Math.cos(state.pounceYaw);
            ex = nodes[0].x + cxDir * hopDist;
            ey = nodes[0].y + cyDir * hopDist;
          } else {
            state.pounceYaw = state.yaw;
          }
          const [clx, cly] = clampInBound(ex, ey, boundR * 0.92);
          state.pounceStartX = nodes[0].x;
          state.pounceStartY = nodes[0].y;
          state.pounceEndX = clx;
          state.pounceEndY = cly;
        } else if (nextMode === 'pounce') {
          state.modeDur = 0.42;
          state.pounceStartX = nodes[0].x;
          state.pounceStartY = nodes[0].y;
          state.yaw = state.pounceYaw;
        } else {
          state.modeDur = compact ? 0.55 : 0.72;
        }
      }

      const instance = {
        def: Cave1Def,
        cachePrefix: `cave1_tatzel_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 1.2;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.mode = 'crawl';
          state.modeT = 0;
          state.modeDur = 4.2;
          state.pawPhase = 0;
          state.pounceJumpZ = 0;
          headLookSpring.x = headLookSpring.v = 0;
          earPerkSpring.x = earPerkSpring.v = 0;
          for (let i = 0; i < TOTAL_NODES; i++) {
            const [wx, wy] = localToWorldXY(hx, hy, hyaw, Math.sin(i * 0.55) * 2.2, -i * SEG_STEP);
            nodes[i].x = wx;
            nodes[i].y = wy;
            nodes[i].z = i === 0 ? 1.4 : 0.4;
            nodes[i].yaw = hyaw;
          }
          pickNavPoint(34);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.35, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.35, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const isIdle = action === 'idle';
          const isPounceDemo = action === 'pounce';

          const rawMaxR = (eco && eco.maxRadius) || 46;
          const boundR = rawMaxR * 0.80;
          const segStep = SEG_STEP * sMul;

          // -----------------------------------------------------------------
          // 分支 A：idle 原地伏地竖耳倾听（蛇尾轻扫 + 双耳警觉转动）
          // -----------------------------------------------------------------
          if (isIdle) {
            state.mode = 'listen';
            state.pounceJumpZ = lerp(state.pounceJumpZ, 0, expSmooth(dt, 10));
            const hx = clamp((eco && eco.homeX) ?? 0, -boundR * 0.5, boundR * 0.5);
            const hy = clamp((eco && eco.homeY) ?? 0, -boundR * 0.5, boundR * 0.5);
            const hyaw = (eco && eco.homeYaw) ?? 0;

            nodes[0].x = lerp(nodes[0].x, hx, expSmooth(dt, 4.5));
            nodes[0].y = lerp(nodes[0].y, hy, expSmooth(dt, 4.5));
            nodes[0].z = (1.5 + Math.sin(time * 2.4 * gFreq) * 0.25) * sMul;
            state.yaw = wrapAngle(state.yaw + wrapAngle(hyaw - state.yaw) * expSmooth(dt, 4.5));
            nodes[0].yaw = state.yaw;

            // 后方 8 节蛇身自然弧弯静伏，尾梢警觉轻摆
            for (let i = 1; i < TOTAL_NODES; i++) {
              const u = i / (TOTAL_NODES - 1);
              const sweep = Math.sin(i * 0.42 + time * 1.4 * gFreq) * (1.8 + u * 3.8 * flex) * sMul;
              const [tx, ty] = localToWorldXY(nodes[0].x, nodes[0].y, state.yaw, sweep, -i * segStep * 0.94);
              const [cx, cy] = clampInBound(tx, ty, boundR);
              nodes[i].x = lerp(nodes[i].x, cx, expSmooth(dt, 6.0));
              nodes[i].y = lerp(nodes[i].y, cy, expSmooth(dt, 6.0));
              nodes[i].z = (0.4 + (i === TOTAL_NODES - 1 ? Math.abs(Math.sin(time * 3.6)) * 0.8 : 0)) * sMul;
            }
            relaxChain(nodes, segStep);
            const lookTgt = Math.sin(time * 1.85) * 0.46;
            headLookSpring.update(dt, lookTgt, 75 * sp, 7.2);
            earPerkSpring.update(dt, 1.0, 110 * sp, 8.5);
          } else {
            // ---------------------------------------------------------------
            // 分支 B：patrol / pounce 完整猎手循环
            // ---------------------------------------------------------------
            state.modeT += dt * clamp(spdMul, 0.55, 1.85);
            if (state.modeT >= state.modeDur) {
              if (state.mode === 'crawl') enterMode('listen', boundR, sMul, isPounceDemo);
              else if (state.mode === 'listen') enterMode('crouch', boundR, sMul, isPounceDemo);
              else if (state.mode === 'crouch') enterMode('pounce', boundR, sMul, isPounceDemo);
              else if (state.mode === 'pounce') {
                // 猛扑落地瞬间扬起溶洞岩尘
                if (vfx) {
                  vfx.spawnDust(nodes[0].x, nodes[0].y, 6, 0.95 * sMul, habitat && habitat.fx);
                  vfx.addRipple(nodes[0].x, nodes[0].y, 2.0 * sMul, 11.0 * sMul, 0.52, 1.5);
                }
                enterMode('recover', boundR, sMul, isPounceDemo);
              } else {
                enterMode('crawl', boundR, sMul, isPounceDemo);
              }
            }

            if (state.mode === 'crawl') {
              // 靠双前爪交替前扒拖着蛇身爬行
              state.pounceJumpZ = lerp(state.pounceJumpZ, 0, expSmooth(dt, 12));
              const tx = state.navX + ((eco && eco.avoidX) || 0) * 0.4;
              const ty = state.navY + ((eco && eco.avoidY) || 0) * 0.4;
              const dx = tx - nodes[0].x, dy = ty - nodes[0].y;
              const dist = Math.hypot(dx, dy);
              if (dist < 6.0 * sMul) {
                pickNavPoint(boundR);
              } else {
                const desiredYaw = Math.atan2(-dx, dy);
                const yawDiff = wrapAngle(desiredYaw - state.yaw);
                const maxTurn = 4.2 * (0.7 + spdMul * 0.35);
                state.yaw = wrapAngle(state.yaw + clamp(yawDiff, -maxTurn * dt, maxTurn * dt));

                // 双前爪交替扒地相位：每次前爪用力往后扒时身体前窜一下
                state.pawPhase = (state.pawPhase + dt * 6.4 * gFreq * (0.75 + spdMul * 0.35)) % TAU;
                const pullPulse = 0.58 + 0.52 * Math.abs(Math.sin(state.pawPhase));
                const align = smoothstep(-0.25, 0.75, Math.cos(yawDiff));
                const moveSpd = 17.5 * spdMul * pullPulse * align;

                const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
                // 扒行时胸口随左右前爪发力轻微左右摆
                const sideSway = Math.sin(state.pawPhase) * 2.2 * flex;
                const nx = nodes[0].x + (fwdX * moveSpd + Math.cos(state.yaw) * sideSway) * dt;
                const ny = nodes[0].y + (fwdY * moveSpd + Math.sin(state.yaw) * sideSway) * dt;
                const [cx, cy] = clampInBound(nx, ny, boundR * 0.94);
                nodes[0].x = cx;
                nodes[0].y = cy;
                nodes[0].z = (1.35 + Math.abs(Math.sin(state.pawPhase)) * 0.45) * sMul;
                nodes[0].yaw = state.yaw;

                // 前爪扒地偶发微尘
                state.dustCd -= dt;
                if (vfx && state.dustCd <= 0) {
                  state.dustCd = 0.28;
                  const side = Math.sin(state.pawPhase) >= 0 ? 1 : -1;
                  const [px, py] = localToWorldXY(nodes[0].x, nodes[0].y, state.yaw, side * 5.2 * sMul, 2.0 * sMul);
                  vfx.spawnDust(px, py, 2, 0.42 * sMul, habitat && habitat.fx);
                }
              }

              // 8 节蛇身被拖着蜿蜒跟随
              relaxChain(nodes, segStep);
              for (let i = 1; i < TOTAL_NODES; i++) {
                const wave = Math.sin(time * 5.2 * gFreq - i * 0.65) * (0.35 + i * 0.08) * flex * dt * 6;
                const perpX = Math.cos(nodes[i].yaw), perpY = Math.sin(nodes[i].yaw);
                const [cx, cy] = clampInBound(nodes[i].x + perpX * wave, nodes[i].y + perpY * wave, boundR);
                nodes[i].x = cx;
                nodes[i].y = cy;
                nodes[i].z = (0.35 + (i <= 2 ? 0.35 : 0)) * sMul;
              }
              relaxChain(nodes, segStep);
              headLookSpring.update(dt, Math.sin(state.pawPhase) * 0.14, 85 * sp, 8.0);
              earPerkSpring.update(dt, 0.25, 110 * sp, 8.5);
            } else if (state.mode === 'listen') {
              // 急停竖耳倾听：胸口微微昂起、双耳竖直高警觉、猫头左右审视
              state.pounceJumpZ = lerp(state.pounceJumpZ, 0, expSmooth(dt, 10));
              nodes[0].z = lerp(nodes[0].z, 2.15 * sMul, expSmooth(dt, 9.0));
              const lookDir = Math.sin(state.modeT * 4.4) * 0.52;
              headLookSpring.update(dt, lookDir, 95 * sp, 7.2);
              earPerkSpring.update(dt, 1.15, 130 * sp, 8.0);
              // 尾梢微微焦躁摆动
              const tip = nodes[TOTAL_NODES - 1];
              const tipWave = Math.sin(time * 8.5 * gFreq) * 3.5 * dt;
              const [tcx, tcy] = clampInBound(tip.x + Math.cos(tip.yaw) * tipWave, tip.y + Math.sin(tip.yaw) * tipWave, boundR);
              tip.x = tcx; tip.y = tcy;
              relaxChain(nodes, segStep);
            } else if (state.mode === 'crouch') {
              // 伏低蓄势：胸口压低、转向扑击方向、双耳后掠
              state.yaw = wrapAngle(state.yaw + wrapAngle(state.pounceYaw - state.yaw) * expSmooth(dt, 12.0));
              nodes[0].yaw = state.yaw;
              nodes[0].z = lerp(nodes[0].z, 0.55 * sMul, expSmooth(dt, 14.0));
              headLookSpring.update(dt, 0, 110 * sp, 9.0);
              earPerkSpring.update(dt, -0.55, 130 * sp, 9.0);
              relaxChain(nodes, segStep);
            } else if (state.mode === 'pounce') {
              // 猛扑一小段：抛物线前跃，拖着 8 节修长蛇身凌空拉直
              const u = clamp(state.modeT / Math.max(0.05, state.modeDur), 0, 1);
              const easeU = smoothstep(0, 1, u);
              const nx = lerp(state.pounceStartX, state.pounceEndX, easeU);
              const ny = lerp(state.pounceStartY, state.pounceEndY, easeU);
              const [cx, cy] = clampInBound(nx, ny, boundR * 0.94);
              nodes[0].x = cx;
              nodes[0].y = cy;
              state.pounceJumpZ = Math.sin(u * Math.PI) * 5.2 * sMul;
              nodes[0].z = 1.4 * sMul + state.pounceJumpZ;
              nodes[0].yaw = state.pounceYaw;
              relaxChain(nodes, segStep);
              for (let i = 1; i < TOTAL_NODES; i++) {
                const lag = Math.max(0, 1 - i * 0.16);
                nodes[i].z = (0.35 + state.pounceJumpZ * lag * 0.72) * sMul;
                const [ncx, ncy] = clampInBound(nodes[i].x, nodes[i].y, boundR);
                nodes[i].x = ncx; nodes[i].y = ncy;
              }
              headLookSpring.update(dt, 0, 120 * sp, 10.0);
              earPerkSpring.update(dt, -0.45, 130 * sp, 9.5);
            } else {
              // recover：落地稳住姿态
              state.pounceJumpZ = lerp(state.pounceJumpZ, 0, expSmooth(dt, 14));
              nodes[0].z = lerp(nodes[0].z, 1.3 * sMul, expSmooth(dt, 10));
              headLookSpring.update(dt, Math.sin(state.modeT * 5.0) * 0.18, 90 * sp, 8.0);
              earPerkSpring.update(dt, 0.75, 110 * sp, 8.5);
              relaxChain(nodes, segStep);
            }
          }

          // 逐节更新切线朝向（严格钳制所有节点在 boundR 内）
          for (let i = 0; i < TOTAL_NODES; i++) {
            const [cx, cy] = clampInBound(nodes[i].x, nodes[i].y, boundR);
            nodes[i].x = cx;
            nodes[i].y = cy;
            if (i > 0) {
              const prev = nodes[i - 1];
              const next = i < TOTAL_NODES - 1 ? nodes[i + 1] : nodes[i];
              const dx = prev.x - next.x, dy = prev.y - next.y;
              if (Math.hypot(dx, dy) > 0.08) {
                nodes[i].yaw = Math.atan2(-dx, dy);
              }
            }
          }

          // 将 actor 锚点更新到包围盒中心（确保长蛇身 360° 不裁切）
          let minX = nodes[0].x, maxX = nodes[0].x, minY = nodes[0].y, maxY = nodes[0].y;
          for (let i = 1; i < TOTAL_NODES; i++) {
            if (nodes[i].x < minX) minX = nodes[i].x;
            if (nodes[i].x > maxX) maxX = nodes[i].x;
            if (nodes[i].y < minY) minY = nodes[i].y;
            if (nodes[i].y > maxY) maxY = nodes[i].y;
          }
          const cx = (minX + maxX) * 0.5;
          const cy = (minY + maxY) * 0.5;
          state.vx = (cx - state.x) / Math.max(dt, 0.001);
          state.vy = (cy - state.y) / Math.max(dt, 0.001);
          state.x = cx;
          state.y = cy;
          state.z = nodes[0].z;

          sockets.setLocal('head', nodes[0].x, nodes[0].y, nodes[0].z, state.yaw, 0, 5.8, 3.2, sMul);

          // 沿胸与蛇身输出贴地接触印
          footContacts.length = 0;
          footContacts.push({ x: nodes[0].x, y: nodes[0].y, z: Math.max(0, state.pounceJumpZ), r: 5.5 * sMul });
          for (let i = 2; i < TOTAL_NODES; i += 2) {
            const r = i <= 4 ? 3.8 : (i <= 7 ? 3.0 : 2.2);
            footContacts.push({ x: nodes[i].x, y: nodes[i].y, z: nodes[i].z, r: r * sMul });
          }
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const n0 = nodes[0];
          const bodyYaw = state.yaw;
          const headYaw = wrapAngle(bodyYaw + clamp(headLookSpring.x, -0.58, 0.58));

          // 1. 放大萌锐猫首（挂在肩胸正前方偏上，俯视大头大眼超清亮）
          const headFwd = state.mode === 'crouch' ? 6.6 : (state.mode === 'pounce' ? 7.2 : 5.8);
          const headLiftBase = state.mode === 'listen' ? 4.4 : (state.mode === 'crouch' ? 2.4 : 3.5);
          const [hx, hy] = localToWorldXY(n0.x, n0.y, bodyYaw, 0, headFwd * sMul);
          const headLift = Math.max(0.2, n0.z + headLiftBase * sMul);

          list.push({
            partKey: 'catHead',
            asset: parts.catHead,
            x: hx,
            y: hy,
            lift: headLift,
            ro: headYaw,
            bias: 1.15
          });

          // 2. 一对竖直大尖猫耳（随竖耳倾听/伏低蓄势独立微转微颤）
          const perk = clamp(earPerkSpring.x, -0.7, 1.3);
          const twitch = state.mode === 'listen' ? Math.sin(state.modeT * 19.0) * 0.14 : 0;
          for (const s of [-1, 1]) {
            const earBack = -1.6 - Math.max(0, -perk) * 1.4;
            const earLift = headLift + (8.0 + perk * 0.85) * sMul;
            const [ex, ey] = localToWorldXY(hx, hy, headYaw, s * 3.8 * sMul, earBack * sMul);
            list.push({
              partKey: 'catEar',
              asset: parts.catEar,
              x: ex,
              y: ey,
              lift: earLift,
              ro: wrapAngle(headYaw + s * (0.18 - perk * 0.12) + (s > 0 ? twitch : -twitch * 0.6)),
              bias: 1.38
            });
          }

          // 3. 宽实肩胸
          list.push({
            partKey: 'chest',
            asset: parts.chest,
            x: n0.x,
            y: n0.y,
            lift: Math.max(0.2, n0.z),
            ro: bodyYaw,
            bias: 0.45
          });

          // 4. 仅有一对健壮虎斑前爪（交替前扒 / 伏地蓄力 / 凌空前探）
          for (const s of [-1, 1]) {
            let pawFwd = 2.6;
            let pawOut = 5.4;
            let pawLift = 0.2;
            let pawTurn = s * 0.14;

            if (state.mode === 'crawl') {
              const phi = state.pawPhase + (s > 0 ? 0 : Math.PI);
              const swing = Math.sin(phi);
              const stepUp = Math.max(0, Math.cos(phi));
              pawFwd = 2.4 + swing * 2.8;
              pawLift = stepUp * 1.65;
              pawTurn = s * 0.12 - swing * 0.18;
            } else if (state.mode === 'crouch') {
              pawFwd = 1.6;
              pawOut = 6.0;
              pawLift = 0.1;
              pawTurn = s * 0.24;
            } else if (state.mode === 'pounce') {
              pawFwd = 5.6;
              pawOut = 4.6;
              pawLift = state.pounceJumpZ * 0.85 + 1.2;
              pawTurn = -s * 0.08;
            } else if (state.mode === 'listen') {
              pawFwd = 3.2;
              pawOut = 5.2;
              pawLift = 0.15;
            }

            const [px, py] = localToWorldXY(n0.x, n0.y, bodyYaw, s * pawOut * sMul, pawFwd * sMul);
            list.push({
              partKey: 'forePaw',
              asset: parts.forePaw,
              x: px,
              y: py,
              lift: Math.max(0, pawLift * sMul),
              ro: wrapAngle(bodyYaw + pawTurn),
              bias: 0.28
            });
          }

          // 5. 8 节暖橘褐/象牙环纹修长蛇身（交替双色环纹，暗溶洞里极清亮！）
          for (let i = 1; i <= NUM_BODY_SEGS; i++) {
            const n = nodes[i];
            const isIvory = (i % 2 === 0);
            let k;
            if (i <= 3) k = isIvory ? 'segThickIvory' : 'segThickWarm';
            else if (i <= 6) k = isIvory ? 'segMidIvory' : 'segMidWarm';
            else k = isIvory ? 'segSlimIvory' : 'segSlimWarm';

            list.push({
              partKey: k,
              asset: parts[k],
              x: n.x,
              y: n.y,
              lift: Math.max(0, n.z),
              ro: n.yaw,
              bias: 0.15 - i * 0.02
            });
          }

          // 6. 斑纹渐细蛇尾梢
          const tip = nodes[TOTAL_NODES - 1];
          list.push({
            partKey: 'tailTip',
            asset: parts.tailTip,
            x: tip.x,
            y: tip.y,
            lift: Math.max(0, tip.z),
            ro: tip.yaw,
            bias: -0.15
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Cave1Def.id,
            code: Cave1Def.code,
            name: Cave1Def.name,
            status: Cave1Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            bodySegCount: NUM_BODY_SEGS,
            footRadius: Cave1Def.footRadius,
            headZ: 20,
            centerZ: 6,
            blocks: Cave1Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Cave1Def);
})(window.PixelWorkshop);
