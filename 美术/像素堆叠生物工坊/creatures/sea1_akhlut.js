'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, pitchPt } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { solveIK2D, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 海1 · 狼鲸（因纽特 Akhlut · v3 精制海豚波浪泳版，+Y 正前，极地冰缝）
  //   1. 前半身厚实苍狼：棱角狼首、独立转动双竖耳、蓬松领口鬃毛、两只强健带爪前肢（弯膝 IK）；
  //   2. 中后段无缝过渡为流线黑白虎鲸躯干：背脊高耸镰状背鳍、腹部洁白、体侧清晰白色眼斑纹路；
  //   3. 参照潮汐海妖的丝滑海豚式上下波浪畅游：5 档高密连续俯仰躯干 + 6 节 3D 距离约束虎鲸尾链
  //      与 3 档俯仰宽大双叶尾鳍（pivotToWorldXY 锁死尾柄枢轴），下打水爆发加速、上浮破水昂首、
  //      下潜低头入水染水色，游一阵后平滑攀回冰面甩毛抖水珠并趴冰守候；
  //   4. 待机交互物：4 条立体体素小银鱼严格环绕狼鲸外围水域成群游弋并偶发跃水（带躯干排斥防穿底），
  //      绝不钻到身体底下，原地待机与自由巡游双态均清晰观赏；
  //   5. 零小数缩放、零自亮眼白、零禁用字，提供 4 套零重建模换色皮肤。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 苍狼皮毛（头吻、前肩、前肢）
      wolfDark:     '#2c3440',
      wolfMid:      '#4d5a6b',
      wolfHi:       '#7f90a6',
      // 蓬松领口鬃毛与颊毛
      maneDark:     '#6e7b8c',
      maneMid:      '#a6b4c4',
      maneHi:       '#dce6f0',
      // 流线虎鲸黑背、背鳍与尾背
      orcaDark:     '#10151f',
      orcaMid:      '#1e2738',
      orcaHi:       '#384761',
      // 虎鲸洁白腹部、体侧眼斑与尾底
      bellyDark:    '#9eb3c4',
      bellyMid:     '#d4e5f2',
      bellyHi:      '#f5fbff',
      // 鼻尖与厚实爪垫
      pawDark:      '#171c26',
      pawMid:       '#2b3342',
      pawHi:        '#4a5569',
      // 利爪与犬齿
      clawDark:     '#8a8275',
      clawMid:      '#ccc3b4',
      clawHi:       '#f2ece1',
      // 狼耳内侧柔绒
      earInnerDark: '#5c4b57',
      earInnerMid:  '#947c8a',
      earInnerHi:   '#c7b0bd',
      // 狼眼（eyeGlint 严禁进 glowKeys）
      eyeDark:      '#0c1017',
      eyeIris:      '#e8a832',
      eyeGlint:     '#f7feff',
      // 冰缝银鱼小群（蓝钢脊背 + 银亮体侧）
      fishBackDark: '#16456e',
      fishBackMid:  '#2c7ab3',
      fishBackHi:   '#68b8eb',
      fishSideDark: '#7aa0b8',
      fishSideMid:  '#b8d9eb',
      fishSideHi:   '#e8f7ff'
    },
    glowKeys: [],
    parts: [
      'wolf', 'mane', 'orca', 'belly', 'dorsal', 'paw', 'claw',
      'ear', 'earInner', 'eye', 'tail', 'fluke', 'fishBack', 'fishSide', 'fishEye'
    ],
    noCrease: [
      ['wolf', 'mane'], ['wolf', 'orca'], ['orca', 'belly'], ['wolf', 'belly'],
      ['orca', 'dorsal'], ['wolf', 'eye'], ['wolf', 'paw'], ['paw', 'claw'],
      ['ear', 'earInner'], ['orca', 'tail'], ['tail', 'fluke'],
      ['fishBack', 'fishSide'], ['fishSide', 'fishEye']
    ],
    materials: {
      wolf:     ['wolfDark',     'wolfMid',     'wolfHi'],
      mane:     ['maneDark',     'maneMid',     'maneHi'],
      orca:     ['orcaDark',     'orcaMid',     'orcaHi'],
      belly:    ['bellyDark',    'bellyMid',    'bellyHi'],
      paw:      ['pawDark',      'pawMid',      'pawHi'],
      claw:     ['clawDark',     'clawMid',     'clawHi'],
      earInner: ['earInnerDark', 'earInnerMid', 'earInnerHi'],
      fishBack: ['fishBackDark', 'fishBackMid', 'fishBackHi'],
      fishSide: ['fishSideDark', 'fishSideMid', 'fishSideHi']
    },
    protectedParts: ['eye', 'claw', 'fishEye']
  });

  // 4 套零重建模换色皮肤（含对应描边与冰沫/水花/雪印微粒配色）
  const SKINS = [
    {
      id: 'classic_orca',
      name: '玄白虎鲸狼（极地经典）',
      dot: '#243147',
      outline: '#090e17',
      pal: {},
      fx: {
        foam:   '#e8f8ff',
        drop:   '#b8e8ff',
        snow:   '#d9eef7',
        splash: '#8cd4f5'
      }
    },
    {
      id: 'ice_blue',
      name: '冰蓝雪狼（浮冰款）',
      dot: '#4d98c4',
      outline: '#0a1624',
      pal: {
        wolfDark:     '#3a6382', wolfMid:      '#689bc0', wolfHi:      '#a6d2ed',
        maneDark:     '#8ab3cc', maneMid:      '#c4e2f2', maneHi:      '#eef9ff',
        orcaDark:     '#153854', orcaMid:      '#28618a', orcaHi:      '#5498c4',
        bellyDark:    '#a6cce0', bellyMid:     '#d9f0fa', bellyHi:     '#f5fcff',
        pawDark:      '#1e354a', pawMid:       '#375a78', pawHi:       '#628aad',
        earInnerDark: '#5b768f', earInnerMid:  '#8eb0cc', earInnerHi:  '#c7e0f2',
        eyeIris:      '#5cd6ff'
      },
      fx: {
        foam:   '#ebfbff',
        drop:   '#9ce6ff',
        snow:   '#dff4fc',
        splash: '#70ccf5'
      }
    },
    {
      id: 'storm_grey',
      name: '深灰苍鲸（寒潮款）',
      dot: '#5c6673',
      outline: '#0d1014',
      pal: {
        wolfDark:     '#2e3238', wolfMid:      '#525861', wolfHi:      '#858d99',
        maneDark:     '#575e69', maneMid:      '#88919e', maneHi:      '#c0c8d4',
        orcaDark:     '#191c21', orcaMid:      '#2f343d', orcaHi:      '#505866',
        bellyDark:    '#8c96a3', bellyMid:     '#bec7d4', bellyHi:     '#e6ecf5',
        pawDark:      '#16181c', pawMid:       '#2b2f36', pawHi:       '#4c525c',
        earInnerDark: '#4a474f', earInnerMid:  '#78747d', earInnerHi:  '#aba6b0',
        eyeIris:      '#d9b65b'
      },
      fx: {
        foam:   '#e0ebf2',
        drop:   '#a8c4d9',
        snow:   '#cfd9e3',
        splash: '#82a9c4'
      }
    },
    {
      id: 'tundra_ochre',
      name: '赭褐北狼（苔原融冰款）',
      dot: '#9e6238',
      outline: '#17100b',
      pal: {
        wolfDark:     '#4d2e1b', wolfMid:      '#855231', wolfHi:      '#bd8155',
        maneDark:     '#7d583c', maneMid:      '#b88f6c', maneHi:      '#e6ccb0',
        orcaDark:     '#211b19', orcaMid:      '#3d312c', orcaHi:      '#66534a',
        bellyDark:    '#a89782', bellyMid:     '#dbccb6', bellyHi:     '#f5ece0',
        pawDark:      '#241b16', pawMid:       '#42332a', pawHi:       '#695447',
        earInnerDark: '#693c2e', earInnerMid:  '#a36652', earInnerHi:  '#d49c87',
        eyeIris:      '#f0a830'
      },
      fx: {
        foam:   '#edf5f7',
        drop:   '#b8dce8',
        snow:   '#e6e2d8',
        splash: '#94c2d4'
      }
    }
  ];

  // 5 档连续俯仰主躯干（参照潮汐海妖海豚式上下起伏：昂首破水 -> 平稳 -> 俯潜扎水，零跳帧）
  const TORSO_STEPS = [
    { key: 'torso_0', pitch: -0.36, pivZ: 7.5 },
    { key: 'torso_1', pitch: -0.06, pivZ: 7.0 },
    { key: 'torso_2', pitch:  0.22, pivZ: 7.2 },
    { key: 'torso_3', pitch:  0.48, pivZ: 7.8 },
    { key: 'torso_4', pitch:  0.74, pivZ: 8.4 }
  ];

  function pickTorsoStep(pitch) {
    let best = TORSO_STEPS[0], bestD = 99;
    for (let i = 0; i < TORSO_STEPS.length; i++) {
      const d = Math.abs(TORSO_STEPS[i].pitch - pitch);
      if (d < bestD) { bestD = d; best = TORSO_STEPS[i]; }
    }
    return best;
  }

  // 由连续 curPitch 实时解算颈口、肩部与尾根挂点（完全连续，零切换跳动）
  function getContinuousSockets(pitch) {
    const neck = pitchPt([0,  8.6, 1.8], pitch, 0, 0);
    const sh   = pitchPt([0,  5.6, -0.4], pitch, 0, 0);
    const tail = pitchPt([0, -9.6, -1.0], pitch, 0, 0);
    return {
      neckY: neck[1], neckZ: neck[2],
      shY:   sh[1],   shZ:   sh[2],
      tailY: tail[1], tailZ: tail[2]
    };
  }

  // 3D 距离约束松弛（参照潮汐海妖，让 6 节虎鲸尾链上下海豚打水顺滑连贯不拉断）
  function relaxChain3D(chain, segLen) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1], b = chain[i];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz) || 0.001;
        const diff = (d - segLen) / d;
        b.x -= dx * diff;
        b.y -= dy * diff;
        b.z -= dz * diff;
      }
    }
  }

  // =========================================================================
  // 1. 5 档连续俯仰主躯干（18×26×20）
  //    前段厚实苍狼肩胸 + 蓬松领口鬃毛 -> 中后段黑白虎鲸躯干 + 高耸镰状背鳍 + 洁白腹与眼斑
  // =========================================================================
  function buildTorsoStep(makeCanvas, step) {
    const { pitch, pivZ } = step;
    const isSwimPitch = Math.abs(pitch) > 0.14;
    const W = 18, D = 26, H = 20;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const pivY = 0.0;

    const toBody = (X, Y, z) => {
      const p = pitchPt([X, Y, z], -pitch, pivY, pivZ);
      return [p[0], p[1], p[2] - pivZ + 6.4];
    };
    const fromBody = (bx, by, bz) => pitchPt([bx, by, bz - 6.4 + pivZ], pitch, pivY, pivZ);

    m.fillAABB(-8.5, 8.5, -12.5, 12.5, 0, H - 1, (x, y, z, X, Y) => {
      const [bx, by, bz] = toBody(X, Y, z);
      // 苍狼厚实肩胸（前段）
      const dShoulder = (Math.hypot(bx / 5.4, (by - 4.8) / 5.8, (bz - 6.6) / 4.6) - 1.0) * 4.8;
      // 虎鲸流线中躯（中段）
      const dMid = (Math.hypot(bx / 5.1, (by + 0.5) / 6.8, (bz - 6.2) / 4.4) - 1.0) * 4.6;
      // 后躯收束衔接尾链
      const dRear = (Math.hypot(bx / 4.2, (by + 6.8) / 5.4, (bz - 5.6) / 3.7) - 1.0) * 3.8;
      // 领口蓬松狼鬃圈
      const ruffPush = isSwimPitch ? -0.7 : 0.5;
      const ruffNoise = Math.sin(bx * 1.15) * 0.45 + Math.cos(bz * 1.1) * 0.35;
      const dRuff = (Math.hypot(bx / (6.2 + ruffNoise * 0.35), (by - (6.4 + ruffPush)) / 3.4, (bz - 7.3) / 4.7) - 1.0) * 3.4;

      const d = smin(smin(smin(dShoulder, dMid, 2.2), dRear, 2.0), dRuff, 1.5);
      if (d > 0) return;

      const isRuffZone = by > (isSwimPitch ? 4.4 : 4.8) && (bz > 5.0 || Math.abs(bx) > 3.6);
      const isWolfShoulder = by > 2.0 && bz > 4.6;
      const isBelly = bz < 4.5 + Math.sin(by * 0.25) * 0.6 && Math.abs(bx) < 4.2;
      const sidePatch = Math.abs(bx) > 3.1 && Math.hypot((by + 1.8) / 3.6, (bz - 6.5) / 1.55) < 1.0;
      const rearSaddle = Math.abs(bx) > 2.4 && by < -4.2 && by > -9.2 && bz < 6.0 && bz > 3.6;

      if (isBelly || sidePatch || rearSaddle) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (isRuffZone) {
        m.setRaw(x, y, z, mat('mane'), partId.mane);
      } else if (isWolfShoulder) {
        m.setRaw(x, y, z, mat('wolf'), partId.wolf);
      } else {
        m.setRaw(x, y, z, mat('orca'), partId.orca);
      }
    });

    // 蓬松领口鬃毛立体毛簇
    const maneSweep = isSwimPitch ? -2.0 : -0.8;
    const tuftAngles = [-2.2, -1.35, -0.55, 0.55, 1.35, 2.2];
    for (let i = 0; i < tuftAngles.length; i++) {
      const a = tuftAngles[i];
      const sx = Math.sin(a) * 5.0;
      const sz = 7.4 + Math.cos(a) * 3.4;
      const p0 = fromBody(sx, 6.2, sz);
      const p1 = fromBody(sx * 1.22, 6.2 + maneSweep - 1.4, sz + 0.8);
      m.paintCapsule(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 1.22, 0.70, mat('mane'), partId.mane, true);
    }

    // 标志性高耸镰状虎鲸背鳍
    const finBaseF = fromBody(0,  1.2, 10.2);
    const finBaseB = fromBody(0, -4.4,  9.4);
    const finMid   = fromBody(0, -2.4, 14.4);
    const finTip   = fromBody(0, -6.2, 16.4);
    m.paintFinTri(finBaseF, finBaseB, finMid, 1.05, mat('orca'), partId.dorsal, true);
    m.paintFinTri(finMid, finBaseB, finTip, 0.92, mat('orca'), partId.dorsal, true);
    m.paintCapsule(finBaseF[0], finBaseF[1], finBaseF[2], finTip[0], finTip[1], finTip[2], 1.18, 0.58, mat('orca'), partId.dorsal, true);
    const sadA = fromBody(0, -4.6, 9.8);
    const sadB = fromBody(0, -6.6, 8.8);
    m.paintCapsule(sadA[0], sadA[1], sadA[2], sadB[0], sadB[1], sadB[2], 1.12, 0.82, mat('belly'), partId.belly, false);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.2, headZ: 18, centerZ: 9 });
  }

  // =========================================================================
  // 2. 独立棱角狼首（3 档：alert 警戒 / rise 破水昂首 / dive 俯潜追咬，14×18×12）
  //    枢轴锁在后颈根部 (0, -4.0)，eyeGlint 严禁进 glowKeys
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -4.0 };
  function buildWolfHead(makeCanvas, pose) {
    const isSnap = pose === 'dive';
    const headPitch = pose === 'rise' ? -0.22 : (pose === 'dive' ? 0.24 : 0.0);
    const W = 14, D = 18, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const fp = (x, y, z) => headPitch ? pitchPt([x, y, z], headPitch, -2.0, 5.2) : [x, y, z];

    const pN0 = fp(0, -4.2, 4.4), pN1 = fp(0, -1.0, 5.4);
    m.paintCapsule(pN0[0], pN0[1], pN0[2], pN1[0], pN1[1], pN1[2], 3.3, 3.6, mat('mane'), partId.mane, true);
    const pSk = fp(0, -0.4, 5.8);
    m.paintEllipsoid(pSk[0], pSk[1], pSk[2], 4.0, 4.2, 3.6, mat('wolf'), partId.wolf, true);

    for (const s of [-1, 1]) {
      const c0 = fp(s * 3.4, -0.6, 4.4), c1 = fp(s * 5.2, -3.2, 3.6);
      m.paintCapsule(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], 1.55, 0.88, mat('mane'), partId.mane, true);
    }
    const b0 = fp(0, 0.2, 8.2), b1 = fp(0, 3.4, 7.2);
    m.paintCapsule(b0[0], b0[1], b0[2], b1[0], b1[1], b1[2], 2.2, 1.5, mat('wolf'), partId.wolf, true);

    const u0 = fp(0, 1.8, 5.8), u1 = fp(0, 7.2, 5.4);
    m.paintCapsule(u0[0], u0[1], u0[2], u1[0], u1[1], u1[2], 2.4, 1.35, mat('wolf'), partId.wolf, true);
    if (isSnap) {
      const j0 = fp(0, 1.6, 3.8), j1 = fp(0, 6.4, 2.2);
      m.paintCapsule(j0[0], j0[1], j0[2], j1[0], j1[1], j1[2], 1.85, 1.05, mat('belly'), partId.belly, true);
      for (const s of [-1, 1]) {
        const f0 = fp(s * 1.25, 5.2, 4.8), f1 = fp(s * 1.15, 5.6, 3.4);
        m.paintCapsule(f0[0], f0[1], f0[2], f1[0], f1[1], f1[2], 0.58, 0.42, mat('claw'), partId.claw, true);
      }
    } else {
      const j0 = fp(0, 1.6, 4.2), j1 = fp(0, 6.6, 4.2);
      m.paintCapsule(j0[0], j0[1], j0[2], j1[0], j1[1], j1[2], 1.95, 1.10, mat('belly'), partId.belly, true);
    }
    const pNose = fp(0, 7.6, 5.5);
    m.paintEllipsoid(pNose[0], pNose[1], pNose[2], 1.05, 0.95, 0.88, mat('paw'), partId.paw, true);

    m.despeckle();
    m.applyArtShading(true);

    // 表面落点 2×2 锐利狼眼（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const pEye = fp(0, 2.2, 7.0);
    const eyeY = clamp(Math.round(hd + pEye[1]), 2, D - 3);
    const eyeZ = clamp(Math.round(pEye[2]), 2, H - 3);
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 5; step++) {
        const tx = Math.round(hw + s * (4.4 - step));
        const p = m.getPartId(tx, eyeY, eyeZ);
        if (p === partId.wolf || p === partId.mane) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 2.9);
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dy === 1)
            ? keyToId.eyeGlint
            : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 3. 独立竖耳（7×7×8，枢轴锁在耳根 (0, 0)）
  // =========================================================================
  const EAR_PIVOT = { x: 0, y: 0 };
  function buildWolfEar(makeCanvas, side) {
    const m = new VoxelModel(7, 7, 8, SPEC);
    const { mat, partId } = SPEC;
    m.paintFinTri(
      [-side * 1.1, -0.6, 1.0],
      [ side * 1.3, -0.4, 1.0],
      [ side * 0.4, -0.9, 6.8],
      0.95, mat('wolf'), partId.ear, true
    );
    m.paintEllipsoid(0, 0, 1.4, 1.45, 1.35, 1.15, mat('mane'), partId.mane, true);
    m.paintCapsule(0, 0.55, 2.0, side * 0.25, 0.35, 5.2, 0.78, 0.42, mat('earInner'), partId.earInner, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0, headZ: 7, centerZ: 3 });
  }

  // =========================================================================
  // 4. 强健带爪苍狼前肢部件（弯膝多段 IK）
  // =========================================================================
  function buildLimbSeg(makeCanvas, rTop, rBot, hLen, withManeCuff = false) {
    const S = Math.max(7, Math.ceil(Math.max(rTop, rBot) * 2 + 4));
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.3, 0, 0, H - 1.3, rBot, rTop, mat('wolf'), partId.wolf, true);
    if (withManeCuff) {
      m.paintEllipsoid(0, -0.3, H - 1.8, rTop * 1.22, rTop * 1.22, 1.4, mat('mane'), partId.mane, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildWolfPaw(makeCanvas) {
    const m = new VoxelModel(9, 11, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, -1.2, 3.0, 1.9, 2.0, 1.5, mat('wolf'), partId.wolf, true);
    m.paintEllipsoid(0,  0.6, 1.7, 2.5, 2.7, 1.45, mat('paw'), partId.paw, true);
    m.paintEllipsoid(0,  0.2, 2.4, 2.3, 2.3, 1.05, mat('mane'), partId.mane, true);
    for (const cx of [-1.55, 0, 1.55]) {
      m.paintCapsule(cx, 2.0, 1.5, cx * 1.08, 4.3, 0.9, 0.65, 0.42, mat('claw'), partId.claw, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0 });
  }

  // =========================================================================
  // 5. 6 节柔韧虎鲸尾链段（黑背白腹高重叠流线收束）
  // =========================================================================
  function buildTailSeg(makeCanvas, rx, ry, rz, withWhiteBelly = true) {
    const W = Math.max(6, Math.ceil(rx * 2 + 4));
    const D = Math.max(6, Math.ceil(ry * 2 + 4));
    const H = Math.max(6, Math.ceil(rz * 2 + 3));
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const cz = rz + 0.8;
    m.fillAABB(-rx - 0.5, rx + 0.5, -ry - 0.5, ry + 0.5, 0, H - 1, (x, y, z, X, Y) => {
      const d = Math.hypot(X / rx, Y / ry, (z - cz) / rz);
      if (d > 1.0) return;
      const isBelly = withWhiteBelly && z < cz - rz * 0.22;
      m.setRaw(x, y, z, isBelly ? mat('belly') : mat('orca'), isBelly ? partId.belly : partId.tail);
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rx, ry) });
  }

  // =========================================================================
  // 6. 水平宽大双叶虎鲸尾鳍（3 档俯仰：up / mid / down，22×16×12）
  //    枢轴严格锁死在尾柄根部 (0, 4.4)，配合海豚式上下打水大幅起伏
  // =========================================================================
  const FLUKE_PIVOT = { x: 0, y: 4.4 };
  function buildTailFluke(makeCanvas, pitchPose) {
    const W = 22, D = 16, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const zRoot = 5.6;
    const dz = pitchPose === 'up' ? 4.4 : (pitchPose === 'down' ? -4.2 : 0.0);

    const pRoot = [ 0.0,  4.4, zRoot];
    const pMid  = [ 0.0, -2.4, clamp(zRoot + dz * 0.55, 1.4, 10.6)];
    const pLA   = [-8.8,  0.2, clamp(zRoot + dz * 0.72, 1.4, 10.6)];
    const pLB   = [-9.4, -5.8, clamp(zRoot + dz,        1.3, 10.8)];
    const pRA   = [ 8.8,  0.2, clamp(zRoot + dz * 0.72, 1.4, 10.6)];
    const pRB   = [ 9.4, -5.8, clamp(zRoot + dz,        1.3, 10.8)];

    m.paintFinTri(pRoot, pLA, pLB, 1.05, mat('orca'), partId.fluke, true);
    m.paintFinTri(pRoot, pLB, pMid, 1.05, mat('orca'), partId.fluke, true);
    m.paintFinTri(pRoot, pMid, pRB, 1.05, mat('orca'), partId.fluke, true);
    m.paintFinTri(pRoot, pRB, pRA, 1.05, mat('orca'), partId.fluke, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pLB[0], pLB[1], pLB[2], 1.15, 0.75, mat('orca'), partId.fluke, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pRB[0], pRB[1], pRB[2], 1.15, 0.75, mat('orca'), partId.fluke, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2] - 0.6, pLA[0] * 0.75, pLA[1] - 1.2, clamp(zRoot + dz * 0.6 - 0.6, 1.0, 10.0), 0.78, 0.55, mat('belly'), partId.belly, false);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2] - 0.6, pRA[0] * 0.75, pRA[1] - 1.2, clamp(zRoot + dz * 0.6 - 0.6, 1.0, 10.0), 0.78, 0.55, mat('belly'), partId.belly, false);
    m.paintEllipsoid(0, 4.0, zRoot, 1.9, 1.8, 1.45, mat('orca'), partId.tail, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 11, centerZ: 6 });
  }

  // =========================================================================
  // 7. 待机交互物：立体体素冰缝小银鱼（3 档摆尾烘件：L / M / R，9×13×7）
  // =========================================================================
  function buildSilverFish(makeCanvas, tailSwing) {
    const W = 9, D = 13, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const sw = tailSwing === 'L' ? -1.8 : (tailSwing === 'R' ? 1.8 : 0.0);

    m.fillAABB(-2.2, 2.2, -2.8, 4.6, 1, 5, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 1.55, (Y - 0.8) / 3.6, (z - 3.2) / 1.85);
      if (d > 1.0) return;
      const isBack = z >= 3.8;
      m.setRaw(x, y, z, isBack ? mat('fishBack') : mat('fishSide'), isBack ? partId.fishBack : partId.fishSide);
    });
    m.paintFinTri([0, 1.4, 4.5], [0, -0.8, 4.4], [0, -1.2, 5.8], 0.52, mat('fishBack'), partId.fishBack, false);
    m.paintFinTri([0, -2.2, 3.2], [sw, -5.4, 5.2], [sw, -5.4, 1.2], 0.62, mat('fishSide'), partId.fishSide, true);

    m.despeckle();
    m.applyArtShading(true);

    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    m.setRaw(Math.round(hw - 1.3), Math.round(hd + 3.0), 3, keyToId.eyeDark, partId.fishEye);
    m.setRaw(Math.round(hw + 1.3), Math.round(hd + 3.0), 3, keyToId.eyeDark, partId.fishEye);

    return m.toStripAsset(makeCanvas, { footRadius: 2.6, headZ: 6, centerZ: 3 });
  }

  // 4 条冰缝银鱼环绕外圈编队（均匀分布在狼鲸四周 20~26 格外围，绝不钻身体底下）
  const FISH_SCHOOL = [
    { angOff:  0.35, radBase: 20.5, speed: 1.05, swimZ: 3.4, phase: 0.0 },
    { angOff:  1.85, radBase: 23.0, speed: 1.12, swimZ: 3.9, phase: 1.5 },
    { angOff:  3.45, radBase: 21.5, speed: 0.98, swimZ: 3.2, phase: 3.1 },
    { angOff:  5.05, radBase: 24.5, speed: 1.08, swimZ: 4.1, phase: 4.7 }
  ];

  const TAIL_SPECS = [
    { key: 'tail0', rx: 3.9, ry: 3.6, rz: 3.4, belly: true },
    { key: 'tail1', rx: 3.4, ry: 3.3, rz: 3.0, belly: true },
    { key: 'tail2', rx: 2.9, ry: 3.0, rz: 2.6, belly: true },
    { key: 'tail3', rx: 2.4, ry: 2.7, rz: 2.2, belly: true },
    { key: 'tail4', rx: 2.0, ry: 2.4, rz: 1.85, belly: false },
    { key: 'tail5', rx: 1.65, ry: 2.2, rz: 1.55, belly: false }
  ];
  const TAIL_SEG_LEN = 2.85;

  const Sea1Def = {
    id: 'sea1_akhlut',
    code: '海1',
    status: 'done',
    name: '海1 · 狼鲸',
    tag: '海豚波浪游 · 冰缝环绕银鱼',
    summary: 'v3 精制：5 档连续俯仰苍狼虎鲸融合躯干 + 潮汐海妖式高速上下波浪打水畅游 + 6 节 3D 虎鲸尾链与双叶尾鳍 + 4 条环绕外围跃水银鱼与攀冰甩毛循环',
    defaultHabitat: 'iceSea',
    footRadius: 11.2,
    ecoWeight: 1.35,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '5 档连续俯仰海豚波浪游',
      '独立转动追踪狼耳',
      '双前爪弯膝 IK 冰面步态',
      '6 节 3D 虎鲸尾链与双叶尾鳍',
      '外围环绕跃水银鱼群与甩毛循环'
    ],
    soulHabit: '在冰缝水域中如海妖/虎鲸般上下波浪俯仰畅游追逐环绕四周的银鱼群 -> 攀回冰沿甩毛抖水珠 -> 趴冰竖耳盯鱼再破水扎潜',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        headAlert:     buildWolfHead(makeCanvas, 'alert'),
        headRise:      buildWolfHead(makeCanvas, 'rise'),
        headDive:      buildWolfHead(makeCanvas, 'dive'),
        earL:          buildWolfEar(makeCanvas, -1),
        earR:          buildWolfEar(makeCanvas,  1),
        armUpper:      buildLimbSeg(makeCanvas, 2.35, 2.00, 4.6, true),
        armKnee:       buildLimbSeg(makeCanvas, 1.95, 1.80, 3.6, false),
        armLower:      buildLimbSeg(makeCanvas, 1.75, 1.55, 4.4, false),
        wolfPaw:       buildWolfPaw(makeCanvas),
        tailFlukeMid:  buildTailFluke(makeCanvas, 'mid'),
        tailFlukeUp:   buildTailFluke(makeCanvas, 'up'),
        tailFlukeDown: buildTailFluke(makeCanvas, 'down'),
        fishL:         buildSilverFish(makeCanvas, 'L'),
        fishM:         buildSilverFish(makeCanvas, 'M'),
        fishR:         buildSilverFish(makeCanvas, 'R')
      };
      for (let i = 0; i < TORSO_STEPS.length; i++) {
        parts[TORSO_STEPS[i].key] = buildTorsoStep(makeCanvas, TORSO_STEPS[i]);
      }
      for (const ts of TAIL_SPECS) {
        parts[ts.key] = buildTailSeg(makeCanvas, ts.rx, ts.ry, ts.rz, ts.belly);
      }

      // 狼鲸本体随皮肤换色，银鱼群保持高辨识极地蓝银色
      const akhlutRecolorAssets = Object.keys(parts)
        .filter(k => !k.startsWith('fish'))
        .map(k => parts[k]);

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const tailNodes = Array.from({ length: TAIL_SPECS.length }, (_, i) => ({
        x: hx0, y: hy0 - 9.6 - i * TAIL_SEG_LEN, z: 6.0, yaw: opts.homeYaw ?? 0
      }));

      // 2 只强健苍狼前肢（冰面弯膝 IK / 水中流线收拢划水）
      const frontLegs = [
        {
          id: 'FL', side: -1,
          hipX: -4.8, hipY: 5.6, hipZ: 6.0,
          restX: -6.8, restY: 8.6,
          L1: 5.2, L2: 5.4,
          footX: 0, footY: 0, footZ: 0,
          startX: 0, startY: 0, targetX: 0, targetY: 0,
          kneeX: 0, kneeY: 0, kneeZ: 3.5,
          hipWX: 0, hipWY: 0, hipWZ: 6.0,
          stepping: false, stepT: 0
        },
        {
          id: 'FR', side: 1,
          hipX: 4.8, hipY: 5.6, hipZ: 6.0,
          restX: 6.8, restY: 8.6,
          L1: 5.2, L2: 5.4,
          footX: 0, footY: 0, footZ: 0,
          startX: 0, startY: 0, targetX: 0, targetY: 0,
          kneeX: 0, kneeY: 0, kneeZ: 3.5,
          hipWX: 0, hipWY: 0, hipWZ: 6.0,
          stepping: false, stepT: 0
        }
      ];

      // 4 条环绕外围冰缝银鱼
      const fishes = FISH_SCHOOL.map((cfg, idx) => ({
        idx,
        ang: cfg.angOff,
        radBase: cfg.radBase,
        speed: cfg.speed,
        swimZ: cfg.swimZ,
        phase: cfg.phase,
        x: hx0 + Math.cos(cfg.angOff) * cfg.radBase,
        y: hy0 + Math.sin(cfg.angOff) * cfg.radBase,
        z: cfg.swimZ,
        yaw: cfg.angOff + Math.PI * 0.5,
        leapT: -1,
        leapDur: 0.90,
        fleeBoost: 0
      }));

      const headYawSpring = new SpringDamper1D(0, 76, 7.0);
      const earLSpring    = new SpringDamper1D(0, 95, 6.8);
      const earRSpring    = new SpringDamper1D(0, 95, 6.8);
      const shakeSpring   = new SpringDamper1D(0, 155, 5.4);

      const state = {
        x: hx0,
        y: hy0,
        z: 6.0,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        yawRate: 0,
        swimAngle: -Math.PI * 0.5 + (opts.seed ? (opts.seed % TAU) : 0),
        dolphinPhase: 0,
        curPitch: 0.12,
        swimBlend: 1.0, // 0=冰面趴伏/甩毛，1=高速海豚式上下波浪畅游
        // 完整自循环：chase（海豚式畅游追鱼）-> climb（攀冰）-> shake（甩毛抖水珠）-> stalk（趴冰盯鱼）-> dive（破水扎潜）
        mode: 'chase',
        modeTimer: 0,
        cycleCount: 0,
        restX: hx0,
        restY: hy0,
        restYaw: opts.homeYaw ?? 0,
        chaseDir: 1,
        flukePose: 'mid',
        leapingFishIdx: 0,
        nextLeapCd: 1.1,
        wakeCd: 0,
        dropCd: 0,
        slapCd: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function resetFrontLegs(bx, by, byaw, sMul = 1.0) {
        for (const leg of frontLegs) {
          const [rx, ry] = localToWorldXY(bx, by, byaw, leg.restX * sMul, leg.restY * sMul);
          leg.footX = leg.startX = leg.targetX = rx;
          leg.footY = leg.startY = leg.targetY = ry;
          leg.footZ = 0;
          leg.stepping = false;
          leg.stepT = 0;
          const [hx, hy] = localToWorldXY(bx, by, byaw, leg.hipX * sMul, leg.hipY * sMul);
          leg.hipWX = hx; leg.hipWY = hy; leg.hipWZ = state.z + leg.hipZ * sMul;
          leg.kneeX = lerp(hx, rx, 0.5);
          leg.kneeY = lerp(hy, ry, 0.5);
          leg.kneeZ = state.z * 0.55 + 2.2 * sMul;
        }
      }

      const instance = {
        def: Sea1Def,
        cachePrefix: `sea1_akhlut_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of akhlutRecolorAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX; state.y = homeY; state.yaw = homeYaw;
          state.restX = homeX; state.restY = homeY; state.restYaw = homeYaw;
          state.z = 6.2; state.vx = 0; state.vy = 0; state.yawRate = 0;
          state.mode = 'chase';
          state.modeTimer = 0;
          state.swimBlend = 1.0;
          state.curPitch = 0.18;
          state.flukePose = 'mid';
          state.nextLeapCd = 1.1;
          headYawSpring.x = headYawSpring.v = 0;
          earLSpring.x = earLSpring.v = 0;
          earRSpring.x = earRSpring.v = 0;
          shakeSpring.x = shakeSpring.v = 0;

          resetFrontLegs(homeX, homeY, homeYaw, 1.0);
          for (let i = 0; i < TAIL_SPECS.length; i++) {
            const [tx, ty] = localToWorldXY(homeX, homeY, homeYaw, 0, -9.6 - i * TAIL_SEG_LEN);
            tailNodes[i].x = tx;
            tailNodes[i].y = ty;
            tailNodes[i].z = 5.5;
            tailNodes[i].yaw = homeYaw;
          }

          for (let i = 0; i < fishes.length; i++) {
            const f = fishes[i];
            f.ang = FISH_SCHOOL[i].angOff;
            f.leapT = -1;
            f.fleeBoost = 0;
            f.x = homeX + Math.cos(f.ang) * f.radBase;
            f.y = homeY + Math.sin(f.ang) * f.radBase;
            f.z = f.swimZ;
            f.yaw = f.ang + Math.PI * 0.5;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex  = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp    = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          // 同时兼容 eco.action === 'idle' 与 eco.patrol === false
          const isIdle = !!(eco && (eco.action === 'idle' || eco.patrol === false));
          const patrol = !isIdle;
          const maxR = (eco && eco.maxRadius) || 46;
          const fx = curSkin.fx || SKINS[0].fx;
          const isWater = !!(habitat && habitat.isWater);
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const homeYaw = (eco && eco.homeYaw) ?? 0;

          const kPos  = expSmooth(dt, 10.5);
          const kMid  = expSmooth(dt, 13.5);
          const kFast = expSmooth(dt, 17.0);

          // -----------------------------------------------------------------
          // 1. 游歇自循环状态机（参照潮汐海妖：高速海豚波浪游为主 + 攀冰甩毛 + 趴冰盯鱼再扎潜）
          //    巡游模式：6.8s 海豚波浪畅游 -> 0.6s 攀冰 -> 1.3s 甩毛抖水珠 -> 2.8s 趴冰盯鱼 -> 0.55s 扎水
          //    原地待机：3.6s 原地波浪踩水/小环潜游 -> 0.6s 攀冰 -> 1.3s 甩毛 -> 3.4s 趴冰盯鱼 -> 0.55s 扎水
          // -----------------------------------------------------------------
          state.modeTimer += dt;
          const CHASE_DUR = patrol ? 6.8 : 3.6;
          const CLIMB_DUR = 0.60;
          const SHAKE_DUR = 1.30;
          const STALK_DUR = patrol ? 2.8 : 3.4;
          const DIVE_DUR  = 0.55;

          if (state.mode === 'chase') {
            if (state.modeTimer >= CHASE_DUR) {
              state.mode = 'climb';
              state.modeTimer = 0;
              state.restX = patrol ? state.x : homeX;
              state.restY = patrol ? state.y : homeY;
              state.restYaw = patrol ? state.yaw : homeYaw;
              if (vfx && isWater) {
                vfx.addRipple(state.x, state.y, 4.0 * sMul, 20.0 * sMul, 0.68, 1.8);
                vfx.spawnSplash(state.x, state.y, 6, 0.9, habitat.fx);
              }
            }
          } else if (state.mode === 'climb') {
            if (state.modeTimer >= CLIMB_DUR) {
              state.mode = 'shake';
              state.modeTimer = 0;
              shakeSpring.impulse(18.0 * sp);
            }
          } else if (state.mode === 'shake') {
            if (state.modeTimer >= SHAKE_DUR) {
              state.mode = 'stalk';
              state.modeTimer = 0;
            }
          } else if (state.mode === 'stalk') {
            if (state.modeTimer >= STALK_DUR) {
              state.mode = 'dive';
              state.modeTimer = 0;
              state.chaseDir = (state.cycleCount & 1) ? -1 : 1;
              state.cycleCount++;
              // 触发一条外围银鱼跃出水面，引爆狼鲸破水扎潜
              const lf = fishes[state.leapingFishIdx % fishes.length];
              lf.leapT = 0;
              lf.fleeBoost = 1.0;
              state.leapingFishIdx = (state.leapingFishIdx + 1) % fishes.length;
              if (vfx && isWater) {
                vfx.addRipple(lf.x, lf.y, 2.2 * sMul, 13.0 * sMul, 0.55, 1.4);
                vfx.spawnSplash(lf.x, lf.y, 5, 0.65, habitat.fx);
              }
            }
          } else if (state.mode === 'dive') {
            if (state.modeTimer >= DIVE_DUR) {
              state.mode = 'chase';
              state.modeTimer = 0;
              if (vfx && isWater) {
                vfx.addRipple(state.x, state.y, 4.5 * sMul, 22.0 * sMul, 0.72, 2.0);
                vfx.spawnSplash(state.x, state.y, 8, 1.15, habitat.fx);
              }
              for (const f of fishes) f.fleeBoost = 1.0;
            }
          }

          const inSwimPhase = state.mode === 'chase' || state.mode === 'dive';
          state.swimBlend = lerp(state.swimBlend, inSwimPhase ? 1.0 : 0.0, expSmooth(dt, 4.8));

          // -----------------------------------------------------------------
          // 2. 潮汐海妖式敏捷上下波浪海豚游 <-> 平滑攀冰甩毛与趴冰守候
          // -----------------------------------------------------------------
          const kickFreq = lerp(2.8, 4.6, state.swimBlend) * gFreq;
          state.dolphinPhase += dt * kickFreq;
          const wavePos = Math.sin(state.dolphinPhase);
          const waveVel = Math.cos(state.dolphinPhase);
          const downKick = Math.pow(Math.max(0, waveVel), 1.5);

          // 敏捷环游轨迹（与潮汐海妖一致的爆发滑行节奏）
          const angularSpeed = (patrol ? (1.05 + downKick * 0.98) : (0.55 + downKick * 0.45)) * spdMul * state.swimBlend * state.chaseDir;
          state.swimAngle += dt * angularSpeed;

          const R = patrol
            ? (Math.min(27.0, maxR * 0.65) + Math.sin(state.swimAngle * 2.0) * 4.2)
            : 10.5 * sMul;
          const cxSwim = patrol ? 0 : homeX;
          const cySwim = patrol ? 0 : homeY;
          let swimX = cxSwim + Math.cos(state.swimAngle) * R + ((eco && eco.avoidX) || 0) * 0.35;
          let swimY = cySwim + Math.sin(state.swimAngle) * R + ((eco && eco.avoidY) || 0) * 0.35;
          const dR = Math.hypot(swimX, swimY);
          if (dR > maxR) { swimX *= maxR / dR; swimY *= maxR / dR; }

          const baseX = patrol ? state.restX : homeX;
          const baseY = patrol ? state.restY : homeY;
          const baseYaw = patrol ? state.restYaw : homeYaw;
          const restX = baseX + Math.sin(time * 0.7) * 1.4 * sMul;
          const restY = baseY + Math.cos(time * 0.6) * 1.2 * sMul;

          const tgtX = lerp(restX, swimX, state.swimBlend);
          const tgtY = lerp(restY, swimY, state.swimBlend);

          const svx = -Math.sin(state.swimAngle) * state.chaseDir;
          const svy =  Math.cos(state.swimAngle) * state.chaseDir;
          const swimYaw = Math.atan2(-svx, svy);
          const restYaw = baseYaw + Math.sin(time * 0.55) * 0.18;
          const tgtYaw = state.swimBlend > 0.25 ? swimYaw : restYaw;

          // 连续实数俯仰角：上浮破水昂首 (-0.36 rad) <-> 俯冲下潜 (+0.74 rad)，冰面趴伏 (-0.06 rad)
          const diveExtra = state.mode === 'dive' ? 0.36 * Math.sin(clamp(state.modeTimer / DIVE_DUR, 0, 1) * Math.PI) : 0;
          const swimPitchTgt = clamp(0.20 - waveVel * 0.54 + diveExtra, -0.36, 0.74);
          const tgtPitch = lerp(-0.06, swimPitchTgt, state.swimBlend);
          state.curPitch = lerp(state.curPitch, tgtPitch, expSmooth(dt, 13.5));

          // 海豚式上下起伏高度：波峰破水露出狼首与镰状背鳍，波谷潜入冰缝触发 submerge 染水色
          const swimLift = (6.2 + wavePos * 4.6 - diveExtra * 3.5) * sMul;
          const restLift = (3.6 + Math.sin(time * 2.2) * 0.32) * sMul;
          const tgtLift = lerp(restLift, swimLift, state.swimBlend);

          const prevX = state.x, prevY = state.y, prevYaw = state.yaw;
          state.x = lerp(state.x, tgtX, kPos);
          state.y = lerp(state.y, tgtY, kPos);
          state.vx = (state.x - prevX) / Math.max(dt, 0.001);
          state.vy = (state.y - prevY) / Math.max(dt, 0.001);
          state.z = lerp(state.z, tgtLift, kMid);
          state.yaw = wrapAngle(state.yaw + wrapAngle(tgtYaw - state.yaw) * kMid);
          const instYawRate = wrapAngle(state.yaw - prevYaw) / Math.max(dt, 0.001);
          state.yawRate = lerp(state.yawRate, clamp(instYawRate, -3.5, 3.5), expSmooth(dt, 10.0));

          // 甩毛抖水珠弹簧与粒子
          if (state.mode === 'shake') {
            const shakeEnv = Math.sin(clamp(state.modeTimer / SHAKE_DUR, 0, 1) * Math.PI);
            shakeSpring.update(dt, Math.sin(state.modeTimer * 26.0) * 0.52 * shakeEnv, 165 * sp, clamp(5.6 * dScale, 2.6, 10.0));
            state.dropCd -= dt;
            if (vfx && shakeEnv > 0.22 && state.dropCd <= 0) {
              state.dropCd = 0.055;
              const a = Math.random() * TAU;
              const spd = (10 + Math.random() * 14) * sMul;
              vfx.spawnParticle(
                state.x + Math.cos(a) * 5.2 * sMul,
                state.y + Math.sin(a) * 5.2 * sMul,
                state.z + (7.0 + Math.random() * 4.0) * sMul,
                Math.cos(a) * spd, Math.sin(a) * spd, (6 + Math.random() * 9) * sMul,
                0.48, 1.25, Math.random() < 0.5 ? fx.drop : fx.foam, false, 26
              );
            }
          } else {
            shakeSpring.update(dt, 0, 90 * sp, clamp(7.5 * dScale, 3.2, 11.5));
          }

          // 破水白沫弧与尾迹（参照潮汐海妖）
          state.wakeCd -= dt;
          if (vfx && isWater && state.wakeCd <= 0) {
            if (state.swimBlend > 0.35) {
              state.wakeCd = 0.065;
              EnvFeedback.emitWaterWake(vfx, habitat, state.x, state.y, state.yaw, (9.0 + downKick * 5.2) * sMul, downKick);
              if (Math.abs(waveVel) > 0.60) {
                const te = tailNodes[tailNodes.length - 1];
                vfx.spawnParticle(
                  te.x + (Math.random() - 0.5) * 3, te.y + (Math.random() - 0.5) * 3, Math.max(1.5, te.z),
                  (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 9 + Math.random() * 9,
                  0.42, 1.45, fx.foam, false, 18
                );
              }
            } else if (state.mode === 'stalk') {
              state.slapCd -= dt;
              if (state.slapCd <= 0) {
                state.slapCd = 1.25;
                const te = tailNodes[tailNodes.length - 1];
                vfx.addRipple(te.x, te.y, 2.5 * sMul, 13.5 * sMul, 0.65, 1.4);
              }
            }
          }

          // -----------------------------------------------------------------
          // 3. 6 节 3D 虎鲸尾链：参照潮汐海妖，海豚式上下大波浪打水 <-> 趴冰轻拍水面
          // -----------------------------------------------------------------
          const sock = getContinuousSockets(state.curPitch);
          const bodyCenterZ = state.z + 6.4 * sMul;
          const [t0x, t0y] = localToWorldXY(state.x, state.y, state.yaw, 0, sock.tailY * sMul);
          tailNodes[0].x = t0x;
          tailNodes[0].y = t0y;
          tailNodes[0].z = bodyCenterZ + sock.tailZ * sMul;
          const ks = expSmooth(dt, 18.0);
          const turnSway = clamp(-state.yawRate * 0.65, -2.0, 2.0);

          for (let i = 1; i < tailNodes.length; i++) {
            const u = i / (tailNodes.length - 1);
            // 海豚式高速上下打水目标（尾波随节数后传，带轻微转向离心甩尾）
            const [swX, swY] = localToWorldXY(tailNodes[i - 1].x, tailNodes[i - 1].y, state.yaw, turnSway * u * 0.8 * sMul, -TAIL_SEG_LEN * 0.94 * sMul);
            const swZ = Math.max(1.0 * sMul, (6.4 + Math.sin(state.dolphinPhase - i * 0.52) * lerp(3.8, 7.8, Math.pow(u, 0.85)) * flex) * sMul);
            // 趴冰守候态：后半截虎鲸尾垂入冰缝轻拍水面
            const sideWag = Math.sin(time * 2.8 * gFreq - i * 0.55) * u * 2.2 * flex * sMul;
            const [rsX, rsY] = localToWorldXY(tailNodes[i - 1].x, tailNodes[i - 1].y, state.yaw, sideWag * 0.25, -TAIL_SEG_LEN * 0.95 * sMul);
            const rsZ = Math.max(0.8 * sMul, (2.2 - u * 0.8 + Math.sin(time * 3.8 * gFreq - i * 0.6) * 1.15 * u) * sMul);

            tailNodes[i].x = lerp(tailNodes[i].x, lerp(rsX, swX, state.swimBlend), ks);
            tailNodes[i].y = lerp(tailNodes[i].y, lerp(rsY, swY, state.swimBlend), ks);
            tailNodes[i].z = lerp(tailNodes[i].z, lerp(rsZ, swZ, state.swimBlend), ks);
          }
          relaxChain3D(tailNodes, TAIL_SEG_LEN * sMul);

          for (let i = 0; i < tailNodes.length; i++) {
            const prev = i > 0 ? tailNodes[i - 1] : { x: state.x, y: state.y };
            const next = i < tailNodes.length - 1 ? tailNodes[i + 1] : tailNodes[tailNodes.length - 1];
            const dx = prev.x - next.x, dy = prev.y - next.y;
            tailNodes[i].yaw = Math.hypot(dx, dy) > 0.25 ? Math.atan2(-dx, dy) : state.yaw;
          }

          const lastIdx = tailNodes.length - 1;
          const tailSlopeZ = (tailNodes[lastIdx].z - tailNodes[lastIdx - 2].z) / Math.max(0.1, sMul);
          state.flukePose = tailSlopeZ > 0.65 ? 'up' : (tailSlopeZ < -0.65 ? 'down' : 'mid');

          // -----------------------------------------------------------------
          // 4. 4 条冰缝银鱼严格环绕狼鲸外围游弋并偶发跃水（带躯干排斥，绝不钻身体底下！）
          // -----------------------------------------------------------------
          state.nextLeapCd -= dt;
          if (state.nextLeapCd <= 0) {
            state.nextLeapCd = 1.8 + Math.random() * 1.4;
            const pick = fishes[Math.floor(Math.random() * fishes.length)];
            if (pick.leapT < 0) {
              pick.leapT = 0;
              if (vfx && isWater) {
                vfx.addRipple(pick.x, pick.y, 1.8 * sMul, 10.5 * sMul, 0.48, 1.3);
              }
            }
          }

          let leadFish = fishes[0];
          let bestFishScore = -1e9;
          const minClearR = 18.0 * sMul; // 严格保证银鱼始终在狼鲸周围外圈，绝不钻到身底

          for (let i = 0; i < fishes.length; i++) {
            const f = fishes[i];
            f.fleeBoost = Math.max(0, f.fleeBoost - dt * 0.50);
            const fSpd = f.speed * (1.0 + f.fleeBoost * 1.15) * (0.78 + gFreq * 0.22);
            f.ang = wrapAngle(f.ang + dt * fSpd * -state.chaseDir);

            const rOrb = (f.radBase + Math.sin(time * 1.6 + f.phase) * 2.6 + f.fleeBoost * 2.5) * sMul;
            let tx = state.x + Math.cos(f.ang) * rOrb;
            let ty = state.y + Math.sin(f.ang) * rOrb;

            // 限制在冰海平台内
            const dPlat = Math.hypot(tx, ty);
            if (dPlat > maxR + 4) {
              tx *= (maxR + 4) / dPlat;
              ty *= (maxR + 4) / dPlat;
            }

            const pfx = f.x, pfy = f.y;
            const kf = expSmooth(dt, 6.2 + f.fleeBoost * 3.5);
            f.x = lerp(f.x, tx, kf);
            f.y = lerp(f.y, ty, kf);

            // 硬外圈排斥：若因狼鲸急转接近躯干，立刻沿径向推到外围安全半径外，杜绝钻身底
            const rdx = f.x - state.x, rdy = f.y - state.y;
            const rDist = Math.hypot(rdx, rdy) || 0.001;
            if (rDist < minClearR) {
              f.x = state.x + (rdx / rDist) * minClearR;
              f.y = state.y + (rdy / rDist) * minClearR;
            }

            const fdx = f.x - pfx, fdy = f.y - pfy;
            if (Math.hypot(fdx, fdy) > 0.02) {
              const fyaw = Math.atan2(-fdx, fdy);
              f.yaw = wrapAngle(f.yaw + wrapAngle(fyaw - f.yaw) * kFast);
            }

            if (f.leapT >= 0) {
              f.leapT += dt / f.leapDur;
              if (f.leapT >= 1) {
                f.leapT = -1;
                f.z = f.swimZ * sMul;
                if (vfx && isWater) {
                  vfx.addRipple(f.x, f.y, 1.8 * sMul, 11.5 * sMul, 0.52, 1.4);
                  vfx.spawnParticle(f.x, f.y, 2.5 * sMul, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 8, 0.38, 1.15, fx.foam, false, 20);
                }
              } else {
                const arc = Math.sin(f.leapT * Math.PI);
                f.z = (f.swimZ + arc * 9.5) * sMul;
              }
            } else {
              f.z = (f.swimZ + Math.sin(time * 4.5 + f.phase) * 0.9) * sMul;
            }

            const score = (f.leapT >= 0 ? 15 : 0) - Math.hypot(f.x - state.x, f.y - state.y) * 0.1;
            if (score > bestFishScore) { bestFishScore = score; leadFish = f; }
          }

          // -----------------------------------------------------------------
          // 5. 狼首与双竖耳独立雷达追踪外围银鱼
          // -----------------------------------------------------------------
          const dxFish = leadFish.x - state.x, dyFish = leadFish.y - state.y;
          const fishRelYaw = wrapAngle(Math.atan2(-dxFish, dyFish) - state.yaw);
          const headTarget = state.mode === 'shake'
            ? shakeSpring.x
            : clamp(fishRelYaw * lerp(0.62, 0.36, state.swimBlend), -0.58, 0.58);
          headYawSpring.update(dt, headTarget, 84 * sp, clamp(7.0 * dScale, 3.0, 11.5));

          const earTrack = clamp(fishRelYaw * 0.55, -0.55, 0.55);
          const earLTarget = lerp(earTrack - 0.18 + Math.sin(time * 2.6) * 0.14, -0.82, state.swimBlend);
          const earRTarget = lerp(earTrack + 0.18 + Math.cos(time * 2.3 + 0.8) * 0.14, 0.82, state.swimBlend);
          earLSpring.update(dt, earLTarget, 96 * sp, clamp(6.6 * dScale, 2.8, 10.5));
          earRSpring.update(dt, earRTarget, 96 * sp, clamp(6.6 * dScale, 2.8, 10.5));

          // -----------------------------------------------------------------
          // 6. 双前肢：海豚游时贴侧随波浪划水 <-> 冰面弯膝 IK 稳扣冰面
          // -----------------------------------------------------------------
          const stepDur = clamp(0.24 / Math.max(0.4, gFreq), 0.12, 0.42);
          const stepThresh = 5.0 * sMul;
          const anyStepping = frontLegs[0].stepping || frontLegs[1].stepping;

          for (let li = 0; li < frontLegs.length; li++) {
            const leg = frontLegs[li];
            const [hx, hy] = localToWorldXY(state.x, state.y, state.yaw, leg.side * 4.8 * sMul, sock.shY * sMul);
            const hz = bodyCenterZ + sock.shZ * sMul;
            leg.hipWX = hx; leg.hipWY = hy; leg.hipWZ = hz;

            if (state.swimBlend > 0.35) {
              leg.stepping = false;
              const armWave = Math.sin(state.dolphinPhase - 0.25 + (li === 0 ? 0 : 0.45));
              const [px, py] = localToWorldXY(state.x, state.y, state.yaw, leg.side * (6.4 + armWave * 0.65) * sMul, (sock.shY - 3.4 - armWave * 1.8) * sMul);
              const pz = Math.max(0.8 * sMul, hz - (3.4 - Math.cos(state.dolphinPhase) * 1.4) * sMul);
              const kl = expSmooth(dt, 12.0);
              leg.footX = lerp(leg.footX, px, kl);
              leg.footY = lerp(leg.footY, py, kl);
              leg.footZ = lerp(leg.footZ, pz, kl);
            } else {
              const [idealX, idealY] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
              const dFoot = Math.hypot(idealX - leg.footX, idealY - leg.footY);
              if (!leg.stepping && !anyStepping && dFoot > stepThresh) {
                leg.stepping = true;
                leg.stepT = 0;
                leg.startX = leg.footX; leg.startY = leg.footY;
                leg.targetX = idealX + state.vx * stepDur * 0.45;
                leg.targetY = idealY + state.vy * stepDur * 0.45;
              }
              if (leg.stepping) {
                leg.stepT += dt / stepDur;
                if (leg.stepT >= 1) {
                  leg.stepping = false; leg.stepT = 1;
                  leg.footX = leg.targetX; leg.footY = leg.targetY; leg.footZ = 0;
                  if (vfx) {
                    vfx.spawnParticle(leg.footX, leg.footY, 0.8 * sMul, (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 3.5 + Math.random() * 3, 0.42, 1.35, fx.snow, false, 16);
                  }
                } else {
                  const u = smoothstep(0, 1, leg.stepT);
                  leg.footX = lerp(leg.startX, leg.targetX, u);
                  leg.footY = lerp(leg.startY, leg.targetY, u);
                  leg.footZ = Math.sin(leg.stepT * Math.PI) * 3.8 * sMul;
                }
              } else {
                leg.footX = lerp(leg.footX, idealX, expSmooth(dt, 5.2));
                leg.footY = lerp(leg.footY, idealY, expSmooth(dt, 5.2));
                leg.footZ = lerp(leg.footZ, 0, expSmooth(dt, 9.0));
              }
            }

            const dxL = leg.footX - hx, dyL = leg.footY - hy;
            const horiz = Math.hypot(dxL, dyL) || 0.001;
            const ik = solveIK2D(0, hz, horiz, leg.footZ, leg.L1 * sMul, leg.L2 * sMul, 1);
            const ratio = ik.kx / horiz;
            leg.kneeX = hx + dxL * ratio;
            leg.kneeY = hy + dyL * ratio;
            leg.kneeZ = Math.max(1.2 * sMul, ik.kz);
          }

          sockets.setLocal('mouth', state.x, state.y, state.z, state.yaw, 0, sock.neckY + 7.0, 9.2, sMul);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? habitat.waterLevel : 2.6;
          const yw = state.yaw;
          const pitch = state.curPitch;
          const tStep = pickTorsoStep(pitch);
          const sock = getContinuousSockets(pitch);
          const bodyCenterZ = state.z + 6.4 * sMul;
          const shakeRoll = state.mode === 'shake' ? shakeSpring.x * 0.35 : 0;

          // 1. 6 节 3D 海豚波浪虎鲸尾链
          for (let i = 0; i < tailNodes.length; i++) {
            const nd = tailNodes[i];
            const spec = TAIL_SPECS[i];
            list.push({
              partKey: spec.key,
              asset: parts[spec.key],
              x: nd.x,
              y: nd.y,
              lift: Math.max(0, nd.z - spec.rz * sMul),
              ro: nd.yaw,
              bias: -0.35 - i * 0.04,
              submerge: EnvFeedback.calcSubmerge(nd.z, waterLvl, 4.8, isWater)
            });
          }

          // 2. 水平宽大双叶虎鲸尾鳍（3 档俯仰 + pivotToWorldXY 锁死尾柄枢轴）
          const tip = tailNodes[tailNodes.length - 1];
          const flukeKey = state.flukePose === 'up' ? 'tailFlukeUp' : (state.flukePose === 'down' ? 'tailFlukeDown' : 'tailFlukeMid');
          const [flukeX, flukeY] = pivotToWorldXY(tip.x, tip.y, tip.yaw, FLUKE_PIVOT.x * sMul, FLUKE_PIVOT.y * sMul);
          list.push({
            partKey: flukeKey,
            asset: parts[flukeKey],
            x: flukeX,
            y: flukeY,
            lift: Math.max(0, tip.z - 5.6 * sMul),
            ro: tip.yaw,
            bias: -0.58,
            submerge: EnvFeedback.calcSubmerge(tip.z, waterLvl, 5.0, isWater)
          });

          // 3. 强健带爪双前肢（弯膝 IK / 贴侧划水）
          for (let li = 0; li < frontLegs.length; li++) {
            const leg = frontLegs[li];
            const legYaw = wrapAngle(yw + (state.swimBlend > 0.35 ? -leg.side * 0.58 * state.swimBlend : 0));
            const segs = [
              { k: 'armUpper', x: lerp(leg.hipWX, leg.kneeX, 0.38), y: lerp(leg.hipWY, leg.kneeY, 0.38), z: lerp(leg.hipWZ, leg.kneeZ, 0.38), off: 2.2, b: -0.18 },
              { k: 'armKnee',  x: leg.kneeX, y: leg.kneeY, z: leg.kneeZ, off: 1.8, b: -0.12 },
              { k: 'armLower', x: lerp(leg.kneeX, leg.footX, 0.56), y: lerp(leg.kneeY, leg.footY, 0.56), z: lerp(leg.kneeZ, leg.footZ + 1.8 * sMul, 0.56), off: 2.0, b: -0.08 },
              { k: 'wolfPaw',  x: leg.footX, y: leg.footY, z: leg.footZ, off: 0.0, b: 0.02 }
            ];
            for (const pt of segs) {
              list.push({
                partKey: pt.k,
                asset: parts[pt.k],
                x: pt.x,
                y: pt.y,
                lift: Math.max(0, pt.z - pt.off * sMul),
                ro: legYaw,
                bias: pt.b,
                submerge: EnvFeedback.calcSubmerge(pt.z + 1.0 * sMul, waterLvl, 4.4, isWater)
              });
            }
          }

          // 4. 5 档连续俯仰苍狼虎鲸融合主躯干（pivZ 精确锚定躯干中心）
          list.push({
            partKey: tStep.key,
            asset: parts[tStep.key],
            x: state.x,
            y: state.y,
            lift: Math.max(0, bodyCenterZ - tStep.pivZ * sMul),
            ro: wrapAngle(yw + shakeRoll),
            bias: 0.35,
            submerge: EnvFeedback.calcSubmerge(bodyCenterZ - 1.2 * sMul, waterLvl, 5.2, isWater)
          });

          // 5. 连续颈口坐标驱动独立狼首（零跳动，pivotToWorldXY 锁死颈根枢轴）
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.75, 0.75));
          const [njx, njy] = localToWorldXY(state.x, state.y, yw, 0, sock.neckY * sMul);
          const [hx, hy] = pivotToWorldXY(njx, njy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const neckLift = bodyCenterZ + sock.neckZ * sMul - 2.6 * sMul;
          const hKey = pitch < -0.18 ? 'headRise' : (pitch > 0.34 ? 'headDive' : 'headAlert');
          list.push({
            partKey: hKey,
            asset: parts[hKey],
            x: hx,
            y: hy,
            lift: Math.max(0.5, neckLift),
            ro: hYaw,
            bias: 0.68,
            submerge: EnvFeedback.calcSubmerge(neckLift + 3.2 * sMul, waterLvl, 4.8, isWater)
          });

          // 6. 左右独立转动竖耳（pivotToWorldXY 锁死耳根枢轴）
          const earDefs = [
            { k: 'earL', s: -1, yawOff: earLSpring.x },
            { k: 'earR', s:  1, yawOff: earRSpring.x }
          ];
          for (const ed of earDefs) {
            const [ejx, ejy] = localToWorldXY(hx, hy, hYaw, ed.s * 2.5 * sMul, -1.6 * sMul);
            const eYaw = wrapAngle(hYaw + clamp(ed.yawOff, -0.95, 0.95));
            const [ex, ey] = pivotToWorldXY(ejx, ejy, eYaw, EAR_PIVOT.x * sMul, EAR_PIVOT.y * sMul);
            list.push({
              partKey: ed.k,
              asset: parts[ed.k],
              x: ex,
              y: ey,
              lift: Math.max(1.0, neckLift + 7.2 * sMul),
              ro: eYaw,
              bias: 0.85,
              submerge: EnvFeedback.calcSubmerge(neckLift + 8.5 * sMul, waterLvl, 4.8, isWater)
            });
          }

          // 7. 待机交互物：4 条环绕狼鲸四周水域的银鱼小群（外圈游弋 + 高弧跃水）
          for (let i = 0; i < fishes.length; i++) {
            const f = fishes[i];
            const wiggle = Math.sin(state.dolphinPhase * 2.6 + f.phase + f.fleeBoost * 3.0);
            const fKey = wiggle > 0.35 ? 'fishL' : (wiggle < -0.35 ? 'fishR' : 'fishM');
            list.push({
              partKey: fKey,
              asset: parts[fKey],
              x: f.x,
              y: f.y,
              lift: Math.max(0.6, f.z),
              ro: f.yaw,
              bias: f.leapT >= 0 ? 0.55 : 0.05,
              submerge: f.leapT >= 0 ? 0 : EnvFeedback.calcSubmerge(f.z, waterLvl, 3.6, isWater)
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sea1Def.id,
            code: Sea1Def.code,
            status: Sea1Def.status,
            name: Sea1Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            mode: state.mode,
            curPitch: Number(state.curPitch.toFixed(2)),
            flukePose: state.flukePose,
            tailSegments: TAIL_SPECS.length,
            silverFishCount: fishes.length,
            footRadius: Sea1Def.footRadius,
            headZ: 18,
            centerZ: 8,
            blocks: Sea1Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Sea1Def);
})(window.PixelWorkshop);
