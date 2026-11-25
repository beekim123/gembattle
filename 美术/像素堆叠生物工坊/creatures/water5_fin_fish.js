'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, pitchPt } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 水5 · 长鳍大鱼（M03 脉冲游泳 + 跃水滑翔破浪 · 天4幼年态，+Y 正前）
  //   1. 粗壮流线深青蓝大鱼身 + 暖金腹纹与体侧金鳞带，3 档俯仰躯干（昂首跃水 /
  //      平泳 / 俯冲扎水）无缝衔接；
  //   2. 两对极度飘逸拉长的亮橙金长胸鳍（前对超长飞翼胸鳍 + 后对修长腹鳍），
  //      腾空滑翔时宽幅张开如橙金双翼；
  //   3. 3 节鱼尾链 + 超长分叉亮橙金丝带尾鳍（左/中/右三档摆尾）；
  //   4. 深潭脉冲巡游 + 周期蓄力加速冲破水面腾空滑翔一大段再扎水溅起白浪；
  //   5. 3 套皮肤、严禁常态 scaleX/scaleY、巡游钳制在 maxRadius * 0.80 内。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 深青蓝主鱼背（3 档）
      bodyDark:   '#0a2742',
      bodyMid:    '#15507a',
      bodyHi:     '#2e89ba',
      // 暖金腹纹与体侧金带（3 档）
      bellyDark:  '#a87320',
      bellyMid:   '#e6ae3e',
      bellyHi:    '#ffe58f',
      // 极度飘逸拉长的亮橙金长胸鳍与丝带尾鳍（3 档）
      finDark:    '#b53b0e',
      finMid:     '#f57c1f',
      finHi:      '#ffd059',
      // 鳍缘深橙红脉络（3 档）
      veinDark:   '#781d0a',
      veinMid:    '#bf3915',
      veinHi:     '#eb6b34',
      // 脊背深靛棱脊（3 档）
      ridgeDark:  '#071a30',
      ridgeMid:   '#0f355c',
      ridgeHi:    '#1f6094',
      // 嘴唇与短须（天4幼年态特征，3 档）
      barbDark:   '#9e5a16',
      barbMid:    '#de8e2a',
      barbHi:     '#ffc966',
      // 亮金大鱼眼（eyeGlint 绝不进 glowKeys）
      eyeDark:    '#08101c',
      eyeIris:    '#ffcf33',
      eyeGlint:   '#f5fcff'
    },
    glowKeys: [],
    parts: [
      'body', 'ridge', 'belly', 'fin', 'vein', 'barb', 'eye', 'tail'
    ],
    noCrease: [
      ['body', 'ridge'], ['body', 'belly'], ['body', 'eye'], ['body', 'barb'],
      ['body', 'fin'], ['fin', 'vein'], ['body', 'tail'], ['tail', 'fin']
    ],
    materials: {
      body:  ['bodyDark',  'bodyMid',  'bodyHi'],
      belly: ['bellyDark', 'bellyMid', 'bellyHi'],
      fin:   ['finDark',   'finMid',   'finHi'],
      vein:  ['veinDark',  'veinMid',  'veinHi'],
      ridge: ['ridgeDark', 'ridgeMid', 'ridgeHi'],
      barb:  ['barbDark',  'barbMid',  'barbHi']
    },
    protectedParts: ['eye', 'fin', 'barb']
  });

  // 3 套皮肤（0 禁用字，0 重色）
  const SKINS = [
    {
      id: 'cobalt_amber',
      name: '青蓝橙金鳍',
      dot: '#f57c1f',
      outline: '#061424',
      pal: {},
      fx: { foam: '#ebf9ff', drop: '#9ee6ff', gold: '#ffd059' }
    },
    {
      id: 'jade_coral',
      name: '碧潭赤羽鳍',
      dot: '#f04a42',
      outline: '#071c19',
      pal: {
        bodyDark:  '#0a3b34', bodyMid:  '#157363', bodyHi:  '#32b59c',
        bellyDark: '#a68c4c', bellyMid: '#dec47c', bellyHi: '#fcf0bf',
        finDark:   '#9e1922', finMid:   '#e83f44', finHi:   '#ff9185',
        veinDark:  '#690e18', veinMid:  '#ad212f', veinHi:  '#db4d57',
        ridgeDark: '#062624', ridgeMid: '#0e4f47', ridgeHi: '#1f8578',
        barbDark:  '#8f2b22', barbMid:  '#d44f3d', barbHi:  '#ff8c73',
        eyeIris:   '#ffe64d'
      },
      fx: { foam: '#ebfffb', drop: '#8cf2e1', gold: '#ff9185' }
    },
    {
      id: 'slate_lemon',
      name: '玄青明金鳍',
      dot: '#ffd633',
      outline: '#0a0e17',
      pal: {
        bodyDark:  '#141d2e', bodyMid:  '#283c5c', bodyHi:  '#4d6fa3',
        bellyDark: '#879cb0', bellyMid: '#c4d8e8', bellyHi: '#edf7ff',
        finDark:   '#b5800e', finMid:   '#f2bc24', finHi:   '#fff082',
        veinDark:  '#7a4e08', veinMid:  '#bd8115', veinHi:  '#e6b032',
        ridgeDark: '#0d1321', ridgeMid: '#1d2b45', ridgeHi: '#38517d',
        barbDark:  '#946a10', barbMid:  '#d9a524', barbHi:  '#ffe173',
        eyeIris:   '#5ce8ff'
      },
      fx: { foam: '#eef7ff', drop: '#a8d9ff', gold: '#fff082' }
    }
  ];

  // 3 档俯仰流线粗壮大鱼躯干（18×28×16）：跃水昂首(-0.34) / 平泳(0) / 扎水俯冲(+0.36)
  const TORSO_STEPS = [
    { key: 'torsoUp',   pitch: -0.34, pivZ: 7.4 },
    { key: 'torsoFlat', pitch:  0.00, pivZ: 7.0 },
    { key: 'torsoDown', pitch:  0.36, pivZ: 7.4 }
  ];

  function buildFishTorso(makeCanvas, step) {
    const { pitch, pivZ } = step;
    const W = 18, D = 28, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    const toBody = (X, Y, z) => {
      const p = pitchPt([X, Y, z], -pitch, 0, pivZ);
      return [p[0], p[1], p[2] - pivZ + 6.8];
    };
    const fromBody = (bx, by, bz) => pitchPt([bx, by, bz - 6.8 + pivZ], pitch, 0, pivZ);

    m.fillAABB(-8.5, 8.5, -13.2, 13.2, 0, H - 1, (x, y, z, X, Y) => {
      const [bx, by, bz] = toBody(X, Y, z);
      // 粗壮流线大鱼躯干（前宽厚、中饱满、后收束）
      const dHead = (Math.hypot(bx / 5.4, (by - 5.2) / 7.2, (bz - 6.8) / 4.6) - 1.0) * 4.8;
      const dMid  = (Math.hypot(bx / 6.0, (by + 0.5) / 8.8, (bz - 6.9) / 5.0) - 1.0) * 5.0;
      const dRear = (Math.hypot(bx / 3.8, (by + 7.6) / 6.2, (bz - 6.6) / 3.8) - 1.0) * 3.8;
      if (smin(smin(dHead, dMid, 2.2), dRear, 2.0) > 0) return;

      // 暖金腹纹与体侧亮金斑带
      const isBelly = bz < 5.0 && Math.abs(bx) < 5.2;
      const isGoldStripe = Math.abs(bx) > 3.8 && Math.abs(bz - 6.8) < 1.25 && by > -6.5 && by < 6.5;
      const isRidge = bz > 9.8 && Math.abs(bx) < 2.2;
      if (isBelly || isGoldStripe) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (isRidge) {
        m.setRaw(x, y, z, mat('ridge'), partId.ridge);
      } else {
        m.setRaw(x, y, z, mat('body'), partId.body);
      }
    });

    // 飘逸亮橙金高背鳍（沿背脊后掠）
    const d0 = fromBody(0,  2.2, 10.6);
    const d1 = fromBody(0, -6.4,  9.8);
    const d2 = fromBody(0, -9.8, 14.6);
    m.paintFinTri(d0, d1, d2, 0.92, mat('fin'), partId.fin, true);
    m.paintCapsule(d0[0], d0[1], d0[2], d2[0], d2[1], d2[2], 0.95, 0.52, mat('vein'), partId.vein, true);

    // 吻侧一对暖金短触须（呼应长大后变身吞天长蛇的幼年特征）
    for (const s of [-1, 1]) {
      const b0 = fromBody(s * 2.6, 10.8, 6.2);
      const b1 = fromBody(s * 5.4, 8.2, 5.4);
      m.paintCapsule(b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], 0.72, 0.45, mat('barb'), partId.barb, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 清晰 2×2 亮金鱼眼
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const pEye = fromBody(0, 7.6, 7.8);
    const eyeY = clamp(Math.round(hd + pEye[1]), 2, D - 3);
    const eyeZ = clamp(Math.round(pEye[2]), 2, H - 3);
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let st = 0; st < 6; st++) {
        const tx = Math.round(hw + s * (5.6 - st));
        const p = m.getPartId(tx, eyeY, eyeZ);
        if (p === partId.body || p === partId.belly) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 3.8);
      for (const dy of [0, 1]) for (const dz of [0, 1]) {
        const kId = (dz === 1 && dy === 1) ? keyToId.eyeGlint : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
        m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 9.8, headZ: 15, centerZ: 7 });
  }

  // =========================================================================
  // 2. 极度飘逸拉长的亮橙金长胸鳍（前主翼 26×22×10 + 后腹鳍 18×16×8）
  //    枢轴严格锁在鳍根，水中贴侧划水、跃水腾空时大展开如橙金羽翼！
  // =========================================================================
  const PEC_PIVOT = { x: 10.2, y: 4.8 };
  function buildLongPecFin(makeCanvas, side, pose) {
    const W = 26, D = 22, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const s = side, rx = -s * PEC_PIVOT.x, ry = PEC_PIVOT.y, rz = 4.6;
    const spread = pose === 'glide' ? 1.0 : 0.72;
    const liftZ = pose === 'glide' ? 1.6 : -0.4;

    const pRoot = [rx, ry, rz];
    const pMid  = [rx + s * 10.5 * spread, ry - 0.6, rz + liftZ * 0.6];
    const pTip  = [rx + s * 20.6 * spread, ry - 5.2, rz + liftZ];
    const pBackA = [rx + s * 2.4 * spread, ry - 7.8, rz - 0.8];
    const pBackB = [rx + s * 13.5 * spread, ry - 11.4, rz + liftZ * 0.4 - 0.6];

    m.paintFinTri(pRoot, pMid, pBackA, 0.92, mat('fin'), partId.fin, true);
    m.paintFinTri(pMid, pBackB, pBackA, 0.88, mat('fin'), partId.fin, true);
    m.paintFinTri(pMid, pTip, pBackB, 0.85, mat('fin'), partId.fin, true);
    // 醒目深橙红主鳍骨与飘带尾缘
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pMid[0], pMid[1], pMid[2], 1.25, 0.95, mat('vein'), partId.vein, true);
    m.paintCapsule(pMid[0], pMid[1], pMid[2], pTip[0], pTip[1], pTip[2], 0.95, 0.58, mat('fin'), partId.fin, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pBackB[0], pBackB[1], pBackB[2], 0.85, 0.52, mat('vein'), partId.vein, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.0, headZ: 9, centerZ: 5 });
  }

  const PELVIC_PIVOT = { x: 6.4, y: 3.4 };
  function buildPelvicFin(makeCanvas, side) {
    const W = 16, D = 16, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const s = side, rx = -s * PELVIC_PIVOT.x, ry = PELVIC_PIVOT.y, rz = 3.8;

    const pRoot = [rx, ry, rz];
    const pTip  = [rx + s * 11.8, ry - 6.4, rz + 0.4];
    const pBack = [rx + s * 3.8,  ry - 8.6, rz - 0.4];
    m.paintFinTri(pRoot, pTip, pBack, 0.82, mat('fin'), partId.fin, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pTip[0], pTip[1], pTip[2], 0.95, 0.52, mat('vein'), partId.vein, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.8, headZ: 7, centerZ: 4 });
  }

  // =========================================================================
  // 3. 鱼尾链段 + 超长分叉亮橙金丝带尾鳍（L / M / R 三档摆尾）
  // =========================================================================
  function buildTailSeg(makeCanvas, rx, rz) {
    const W = Math.ceil(rx * 2 + 4);
    const D = 9;
    const H = Math.ceil(rz * 2 + 4);
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const cz = rz + 1.0;
    m.fillAABB(-rx - 0.5, rx + 0.5, -3.5, 3.5, 0, H - 1, (x, y, z, X, Y) => {
      const d2 = (X / rx) ** 2 + (Y / 3.4) ** 2 + ((z - cz) / rz) ** 2;
      if (d2 > 1.0) return;
      const isBelly = z < cz - rz * 0.25;
      m.setRaw(x, y, z, isBelly ? mat('belly') : mat('body'), isBelly ? partId.belly : partId.tail);
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: rx + 1.0 });
  }

  const TAILFIN_PIVOT = { x: 0, y: 7.4 };
  function buildRibbonTailFin(makeCanvas, swing) {
    const W = 16, D = 22, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const sw = swing === 'L' ? -3.4 : (swing === 'R' ? 3.4 : 0.0);
    const pRoot = [0, 7.2, 6.8];
    const pMid  = [sw * 0.45, 0.5, 6.8];
    // 上下超长分叉丝带尾叶
    const pTop  = [sw, -8.8, 12.2];
    const pBot  = [sw, -8.4, 1.8];
    const pFork = [sw * 0.65, -2.8, 6.8];

    m.paintFinTri(pRoot, pTop, pFork, 0.88, mat('fin'), partId.fin, true);
    m.paintFinTri(pRoot, pFork, pBot, 0.88, mat('fin'), partId.fin, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pTop[0], pTop[1], pTop[2], 1.15, 0.58, mat('vein'), partId.vein, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pBot[0], pBot[1], pBot[2], 1.15, 0.58, mat('vein'), partId.vein, true);
    m.paintEllipsoid(0, 6.6, 6.8, 1.8, 1.8, 1.8, mat('body'), partId.tail, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.5, headZ: 13, centerZ: 7 });
  }

  // =========================================================================
  // 4. 生物定义与脉冲游 + 蓄力跃水滑翔状态机
  // =========================================================================
  const TAIL_NODES = 4;
  const TAIL_SEG_LEN = 3.2;

  const Water5Def = {
    id: 'water5_fin_fish',
    code: '水5',
    status: 'done',
    name: '长鳍大鱼',
    tag: 'M03 深潭脉冲游 · 跃水长鳍滑翔',
    summary: '粗壮流线深青蓝+暖金腹纹大鱼（吞天长蛇幼年态），两对极度飘逸拉长的亮橙金长胸鳍与丝带尾鳍；深潭脉冲巡游并周期蓄力冲破水面腾空滑翔一大段再扎水溅浪',
    defaultHabitat: 'river',
    footRadius: 11.0,
    ecoWeight: 1.30,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '深潭巡游跃水', loop: true, status: 'done' },
      { id: 'idle',   name: '深潭缓泳摆鳍', loop: true, status: 'done' },
      { id: 'breach', name: '蓄力跃水滑翔', loop: false, duration: 3.6, status: 'done' }
    ],
    blocks: [
      '深青蓝流线大鱼身与暖金腹纹',
      '两对极度飘逸拉长的亮橙金长胸鳍/腹鳍',
      '3 节鱼尾链与超长分叉亮橙金丝带尾鳍',
      '脉冲巡游 + 蓄力冲刺跃水滑翔扎浪闭环'
    ],
    soulHabit: '在河湖深潭中以强劲脉冲摆尾巡游，周期蓄力加速冲破水面，展开两对亮橙金长胸鳍在半空滑翔一大段再俯冲扎水溅起白浪与涟漪',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torsoUp:    buildFishTorso(makeCanvas, TORSO_STEPS[0]),
        torsoFlat:  buildFishTorso(makeCanvas, TORSO_STEPS[1]),
        torsoDown:  buildFishTorso(makeCanvas, TORSO_STEPS[2]),
        pecL_swim:  buildLongPecFin(makeCanvas, -1, 'swim'),
        pecR_swim:  buildLongPecFin(makeCanvas,  1, 'swim'),
        pecL_glide: buildLongPecFin(makeCanvas, -1, 'glide'),
        pecR_glide: buildLongPecFin(makeCanvas,  1, 'glide'),
        pelvicL:    buildPelvicFin(makeCanvas, -1),
        pelvicR:    buildPelvicFin(makeCanvas,  1),
        tail0:      buildTailSeg(makeCanvas, 3.0, 2.8),
        tail1:      buildTailSeg(makeCanvas, 2.3, 2.2),
        tail2:      buildTailSeg(makeCanvas, 1.7, 1.7),
        tailFinL:   buildRibbonTailFin(makeCanvas, 'L'),
        tailFinM:   buildRibbonTailFin(makeCanvas, 'M'),
        tailFinR:   buildRibbonTailFin(makeCanvas, 'R')
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.2;
      const seed = opts.seed ?? 53;

      const tailChain = new ChainSolver(TAIL_NODES, TAIL_SEG_LEN, {
        maxAngle: 0.56,
        waveFreq: 5.8,
        wavePhaseStep: 0.65,
        waveAmp: 0.42
      });

      const finSpreadSpring = new SpringDamper1D(0, 68, 6.2);
      const sockets = new SocketTracker();

      const state = {
        x: hx0, y: hy0, z: 3.4,
        vx: 0, vy: 0, yaw: hyaw0,
        swimAng: seed * 0.31,
        tailPhase: 0,
        curPitch: 0,
        airBlend: 0, // 0=水中巡游, 1=腾空滑翔
        breachTimer: 4.5,
        breachStage: 'swim', // 'swim' | 'charge' | 'air' | 'splash'
        breachStageT: 0,
        wakeCd: 0,
        dropCd: 0,
        splashFired: false
      };

      let curSkin = SKINS[0];

      function emitSplashBurst(vfx, habitat, sMul, big) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        vfx.addRipple(state.x, state.y, 3.5 * sMul, (big ? 26.0 : 18.0) * sMul, 0.85, big ? 2.4 : 1.7);
        if (habitat && habitat.fx) {
          vfx.spawnSplash(state.x, state.y, big ? 12 : 7, big ? 1.25 : 0.85, habitat.fx);
        }
        const n = big ? 10 : 6;
        for (let k = 0; k < n; k++) {
          const a = (k / n) * TAU + Math.random() * 0.3;
          const spd = (10 + Math.random() * 14) * sMul;
          vfx.spawnParticle(
            state.x + Math.cos(a) * 3.0 * sMul,
            state.y + Math.sin(a) * 3.0 * sMul,
            2.2 * sMul,
            Math.cos(a) * spd, Math.sin(a) * spd, (11 + Math.random() * 11) * sMul,
            0.52, 1.55, k % 2 === 0 ? fx.foam : fx.drop, false, 36
          );
        }
      }

      const instance = {
        def: Water5Def,
        cachePrefix: `water5_fish_${Math.random().toString(36).slice(2, 7)}`,
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
          state.x = homeX; state.y = homeY; state.z = 3.4;
          state.vx = 0; state.vy = 0; state.yaw = homeYaw ?? 0.2;
          state.curPitch = 0; state.airBlend = 0;
          state.breachStage = 'swim'; state.breachStageT = 0;
          state.breachTimer = 4.2; state.splashFired = false;
          finSpreadSpring.x = finSpreadSpring.v = 0;
          const [tx, ty] = localToWorldXY(homeX, homeY, state.yaw, 0, -10.5);
          tailChain.reset(tx, ty, 3.4, state.yaw);
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
          const homeYaw = (eco && eco.homeYaw) ?? 0.2;
          const maxR = (eco && eco.maxRadius) || 46;
          const limitR = maxR * 0.78;
          const isWater = !!(habitat && habitat.isWater);
          const fx = curSkin.fx || SKINS[0].fx;

          const prevX = state.x, prevY = state.y;
          let targetPitch = 0;
          let targetZ = 3.4 * sMul;
          let inAir = false;
          let tailRate = 5.4;

          if (action === 'idle') {
            state.breachStage = 'swim';
            const tx = homeX + Math.sin(time * 0.75 + seed) * 4.5 * sMul;
            const ty = homeY + Math.cos(time * 0.65 + seed) * 3.8 * sMul;
            state.x = lerp(state.x, tx, expSmooth(dt, 3.4));
            state.y = lerp(state.y, ty, expSmooth(dt, 3.4));
            const aimYaw = homeYaw + Math.sin(time * 0.6) * 0.35;
            state.yaw = wrapAngle(state.yaw + wrapAngle(aimYaw - state.yaw) * expSmooth(dt, 3.2));
            targetZ = (3.4 + Math.sin(time * 2.0) * 0.65) * sMul;
            targetPitch = Math.cos(time * 2.0) * 0.08;
            tailRate = 4.2;
          } else if (action === 'breach') {
            // 专用动作：0~0.75s 深水蓄力加速 -> 0.75~2.75s 破水腾空滑翔 -> 2.75~3.6s 扎水溅浪
            const tA = clamp(actionTime, 0, 3.6);
            state.swimAng = wrapAngle(state.swimAng + dt * (tA < 0.75 ? 1.55 : (tA < 2.75 ? 1.25 : 0.75)) * spdMul);
            const rOrb = Math.min(24.0, limitR * 0.84);
            const tx = homeX + Math.cos(state.swimAng) * rOrb;
            const ty = homeY + Math.sin(state.swimAng) * rOrb;
            const svx = -Math.sin(state.swimAng), svy = Math.cos(state.swimAng);
            state.yaw = wrapAngle(state.yaw + wrapAngle(Math.atan2(-svx, svy) - state.yaw) * expSmooth(dt, 8.0));
            state.x = lerp(state.x, tx, expSmooth(dt, 6.5));
            state.y = lerp(state.y, ty, expSmooth(dt, 6.5));

            if (tA < 0.75) {
              const p = tA / 0.75;
              targetZ = lerp(3.0, 1.8, p) * sMul;
              targetPitch = lerp(0.10, -0.32, p);
              tailRate = 11.5;
              state.splashFired = false;
            } else if (tA < 2.75) {
              inAir = true;
              const u = (tA - 0.75) / 2.0;
              if (u < 0.08 && !state.splashFired) {
                state.splashFired = true;
                emitSplashBurst(vfx, habitat, sMul, false);
              }
              const arc = Math.sin(u * Math.PI);
              targetZ = (3.2 + arc * 16.5) * sMul;
              targetPitch = lerp(-0.36, 0.38, smoothstep(0.12, 0.90, u));
              tailRate = 3.2;
            } else {
              const u = (tA - 2.75) / 0.85;
              if (u < 0.16 && state.splashFired) {
                state.splashFired = false;
                emitSplashBurst(vfx, habitat, sMul, true);
              }
              targetZ = lerp(1.6, 3.4, u) * sMul;
              targetPitch = lerp(0.32, 0.0, u);
              tailRate = 5.5;
            }
          } else {
            // patrol：脉冲巡游 + 每隔 ~5.4s 自动蓄力跃水滑翔再扎水溅浪
            state.breachStageT += dt;
            if (state.breachStage === 'swim') {
              state.breachTimer -= dt;
              const pulse = Math.pow(Math.max(0, Math.sin(state.tailPhase * 0.5)), 2.0);
              const angSpd = (0.72 + pulse * 0.58) * spdMul;
              state.swimAng = wrapAngle(state.swimAng + dt * angSpd);
              const rOrb = Math.min(26.5, limitR * 0.88) + Math.sin(state.swimAng * 2.0) * 3.2;
              const tx = homeX + Math.cos(state.swimAng) * rOrb + ((eco && eco.avoidX) || 0) * 0.3;
              const ty = homeY + Math.sin(state.swimAng) * rOrb + ((eco && eco.avoidY) || 0) * 0.3;
              const svx = -Math.sin(state.swimAng), svy = Math.cos(state.swimAng);
              state.yaw = wrapAngle(state.yaw + wrapAngle(Math.atan2(-svx, svy) - state.yaw) * expSmooth(dt, 6.2));
              state.x = lerp(state.x, tx, expSmooth(dt, 5.2));
              state.y = lerp(state.y, ty, expSmooth(dt, 5.2));
              targetZ = (3.2 + Math.sin(time * 2.4) * 0.85) * sMul;
              targetPitch = Math.cos(time * 2.4) * 0.08;
              tailRate = 5.8 + pulse * 3.2;
              if (state.breachTimer <= 0) {
                state.breachStage = 'charge';
                state.breachStageT = 0;
              }
            } else if (state.breachStage === 'charge') {
              const p = clamp(state.breachStageT / 0.72, 0, 1);
              state.swimAng = wrapAngle(state.swimAng + dt * 1.48 * spdMul);
              const rOrb = Math.min(26.0, limitR * 0.86);
              const tx = homeX + Math.cos(state.swimAng) * rOrb;
              const ty = homeY + Math.sin(state.swimAng) * rOrb;
              const svx = -Math.sin(state.swimAng), svy = Math.cos(state.swimAng);
              state.yaw = wrapAngle(state.yaw + wrapAngle(Math.atan2(-svx, svy) - state.yaw) * expSmooth(dt, 8.0));
              state.x = lerp(state.x, tx, expSmooth(dt, 7.0));
              state.y = lerp(state.y, ty, expSmooth(dt, 7.0));
              targetZ = lerp(3.2, 1.8, p) * sMul;
              targetPitch = lerp(0.08, -0.34, p);
              tailRate = 11.8;
              if (state.breachStageT >= 0.72) {
                state.breachStage = 'air';
                state.breachStageT = 0;
                emitSplashBurst(vfx, habitat, sMul, false);
              }
            } else if (state.breachStage === 'air') {
              inAir = true;
              const u = clamp(state.breachStageT / 1.95, 0, 1);
              state.swimAng = wrapAngle(state.swimAng + dt * 1.28 * spdMul);
              const rOrb = Math.min(26.0, limitR * 0.86);
              const tx = homeX + Math.cos(state.swimAng) * rOrb;
              const ty = homeY + Math.sin(state.swimAng) * rOrb;
              const svx = -Math.sin(state.swimAng), svy = Math.cos(state.swimAng);
              state.yaw = wrapAngle(state.yaw + wrapAngle(Math.atan2(-svx, svy) - state.yaw) * expSmooth(dt, 7.0));
              state.x = lerp(state.x, tx, expSmooth(dt, 6.2));
              state.y = lerp(state.y, ty, expSmooth(dt, 6.2));
              targetZ = (3.2 + Math.sin(u * Math.PI) * 16.0) * sMul;
              targetPitch = lerp(-0.36, 0.38, smoothstep(0.14, 0.90, u));
              tailRate = 3.0;
              if (state.breachStageT >= 1.95) {
                state.breachStage = 'swim';
                state.breachStageT = 0;
                state.breachTimer = 5.2 + Math.random() * 1.8;
                emitSplashBurst(vfx, habitat, sMul, true);
              }
            }
          }

          // 严格巡游钳制在 maxRadius * 0.80 内
          const dist = Math.hypot(state.x, state.y);
          if (dist > limitR && dist > 0.001) {
            state.x *= limitR / dist;
            state.y *= limitR / dist;
          }

          const safeDt = Math.max(dt, 0.001);
          state.vx = (state.x - prevX) / safeDt;
          state.vy = (state.y - prevY) / safeDt;
          state.z = lerp(state.z, targetZ, expSmooth(dt, 11.0));
          state.curPitch = lerp(state.curPitch, targetPitch, expSmooth(dt, 10.0));
          state.airBlend = lerp(state.airBlend, inAir ? 1.0 : 0.0, expSmooth(dt, 9.0));
          state.tailPhase += dt * tailRate * gFreq;

          finSpreadSpring.update(dt, inAir ? 1.0 : 0.0, 68 * sp, 6.2);

          // 3 节鱼尾链
          const [t0x, t0y] = localToWorldXY(state.x, state.y, state.yaw, 0, -10.4 * sMul);
          tailChain.update(dt, t0x, t0y, state.z + 5.8 * sMul, state.yaw, time, {
            segLen: TAIL_SEG_LEN * sMul,
            flexibility: flex,
            maxAngle: 0.56,
            waveFreq: tailRate * gFreq,
            waveAmp: (inAir ? 0.16 : 0.45) * flex,
            wavePhaseStep: 0.65,
            restAlign: 0.10,
            zTargetFn: (u) => Math.max(1.2 * sMul, state.z + (5.8 + state.curPitch * 5.2 * u) * sMul)
          });

          // 水面尾迹与跃水滴落水珠
          state.wakeCd -= dt;
          if (vfx && isWater && !inAir && state.wakeCd <= 0) {
            state.wakeCd = 0.08;
            EnvFeedback.emitWaterWake(vfx, habitat, state.x, state.y, state.yaw, 8.8 * sMul, 0.75);
          }
          state.dropCd -= dt;
          if (vfx && inAir && state.dropCd <= 0) {
            state.dropCd = 0.06;
            vfx.spawnParticle(
              state.x + (Math.random() - 0.5) * 8 * sMul,
              state.y + (Math.random() - 0.5) * 8 * sMul,
              state.z + 2.0 * sMul,
              -state.vx * 0.2, -state.vy * 0.2, -4.0 * sMul,
              0.42, 1.25, fx.drop, false, 28
            );
          }

          sockets.setLocal('mouth', state.x, state.y, state.z, state.yaw, 0, 12.0, 6.5, sMul);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? habitat.waterLevel : 2.8;
          const subFn = (z) => (isWater && state.airBlend < 0.45)
            ? EnvFeedback.calcSubmerge(z, waterLvl, 4.6, true)
            : 0;

          const yw = state.yaw;
          const p = state.curPitch;
          const tStep = p < -0.15 ? TORSO_STEPS[0] : (p > 0.16 ? TORSO_STEPS[2] : TORSO_STEPS[1]);

          // 1. 粗壮流线大鱼主躯干
          list.push({
            partKey: tStep.key,
            asset: parts[tStep.key],
            x: state.x,
            y: state.y,
            lift: Math.max(0.2, state.z),
            ro: yw,
            submerge: subFn(state.z + 3.2 * sMul),
            bias: 0.28
          });

          // 2. 前对极度飘逸拉长的亮橙金长胸鳍（腾空滑翔时切 glide 宽幅展开）
          const useGlide = state.airBlend > 0.35;
          const finWave = Math.sin(state.tailPhase * 0.65) * (useGlide ? 0.08 : 0.22);
          for (const s of [-1, 1]) {
            const [shX, shY] = localToWorldXY(state.x, state.y, yw, s * 4.8 * sMul, 3.6 * sMul);
            const fYaw = wrapAngle(yw - s * (useGlide ? -0.14 : 0.22) + s * finWave);
            const [fxW, fyW] = localToWorldXY(shX, shY, fYaw, s * PEC_PIVOT.x * sMul, -PEC_PIVOT.y * sMul);
            const k = (s < 0 ? 'pecL_' : 'pecR_') + (useGlide ? 'glide' : 'swim');
            list.push({
              partKey: k,
              asset: parts[k],
              x: fxW,
              y: fyW,
              lift: Math.max(0.4, state.z + (useGlide ? 4.2 : 2.2) * sMul),
              ro: fYaw,
              submerge: subFn(state.z + 2.6 * sMul),
              bias: 0.08
            });
          }

          // 3. 后对修长亮橙金腹鳍
          for (const s of [-1, 1]) {
            const [shX, shY] = localToWorldXY(state.x, state.y, yw, s * 3.6 * sMul, -4.6 * sMul);
            const fYaw = wrapAngle(yw - s * (useGlide ? -0.08 : 0.26) - s * finWave * 0.8);
            const [fxW, fyW] = localToWorldXY(shX, shY, fYaw, s * PELVIC_PIVOT.x * sMul, -PELVIC_PIVOT.y * sMul);
            const k = s < 0 ? 'pelvicL' : 'pelvicR';
            list.push({
              partKey: k,
              asset: parts[k],
              x: fxW,
              y: fyW,
              lift: Math.max(0.2, state.z + 1.4 * sMul),
              ro: fYaw,
              submerge: subFn(state.z + 1.8 * sMul),
              bias: -0.06
            });
          }

          // 4. 3 节鱼尾链 + 超长分叉亮橙金丝带尾鳍
          const tNodes = tailChain.nodes;
          const segKeys = ['tail0', 'tail1', 'tail2'];
          for (let i = 0; i < 3; i++) {
            const nd = tNodes[i];
            list.push({
              partKey: segKeys[i],
              asset: parts[segKeys[i]],
              x: nd.x,
              y: nd.y,
              lift: Math.max(0.2, nd.z - 2.6 * sMul),
              ro: nd.yaw,
              submerge: subFn(nd.z),
              bias: -0.22 - i * 0.05
            });
          }
          const tLast = tNodes[3];
          const [tfx, tfy] = pivotToWorldXY(tLast.x, tLast.y, tLast.yaw, TAILFIN_PIVOT.x * sMul, TAILFIN_PIVOT.y * sMul);
          const swVal = Math.sin(state.tailPhase - 1.2);
          const finKey = swVal > 0.35 ? 'tailFinL' : (swVal < -0.35 ? 'tailFinR' : 'tailFinM');
          list.push({
            partKey: finKey,
            asset: parts[finKey],
            x: tfx,
            y: tfy,
            lift: Math.max(0.2, tLast.z - 6.4 * sMul),
            ro: tLast.yaw,
            submerge: subFn(tLast.z),
            bias: -0.45
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Water5Def.id,
            code: Water5Def.code,
            status: Water5Def.status,
            name: Water5Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            breachStage: state.breachStage,
            footRadius: Water5Def.footRadius,
            headZ: 15,
            centerZ: 7,
            blocks: Water5Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Water5Def);
})(window.PixelWorkshop);
