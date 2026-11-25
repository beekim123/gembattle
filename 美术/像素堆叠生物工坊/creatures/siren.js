'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pitchPt } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 特7 · 潮汐海妖（v3 丝滑高速俯仰海豚游 · 7 档连续倾角 + 6 种灵动海洋小伙伴，+Y 正前）
  //   1. 彻底消除换姿跳帧卡顿：连续驱动实数倾角 curPitch（0°~108°），颈口/肩关节/发根全由
  //      连续 curPitch 实时解算，并预烘 7 档高密躯干倾角（每档仅差 ~18°），丝滑如真 3D 俯仰；
  //   2. 提升至真实敏捷水生游速：海豚打水频率与环礁冲刺滑行速度提升至 2.2 倍，下打水爆发
  //      加速推进、上浮破水滑翔，游一阵后平滑减速立身踩水待机，毫无顿挫感；
  //   3. 保持零武器与零穿模背上飘发，6 种海洋小伙伴（小丑鱼/章鱼/蓝唐王鱼/河豚/海马/海龟）
  //      也同步提速，灵动环绕伴游互动。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      tailDark:        '#0d545e',
      tailMid:         '#1d999c',
      tailHi:          '#64e0d4',
      finDark:         '#197496',
      finMid:          '#42b7d6',
      finHi:           '#a2eef7',
      skinDark:        '#9eb5bd',
      skinMid:         '#cde1e6',
      skinHi:          '#eef7fa',
      hairDark:        '#152b57',
      hairMid:         '#2a5494',
      hairHi:          '#5b8fd1',
      shellDark:       '#8ea4b8',
      shellMid:        '#d4e4f0',
      shellHi:         '#f7fbff',
      coralDark:       '#8c2f3e',
      coralMid:        '#d65865',
      coralHi:         '#ff9b9e',
      eyeDark:         '#0e1526',
      eyeIris:         '#2be0d2',
      eyeGlint:        '#f2ffff',
      emissiveMid:     '#18c4ff',
      emissiveHot:     '#78efff',
      emissiveCore:    '#e8feff',
      fishOrangeDark:  '#b84210',
      fishOrangeMid:   '#ff6e1f',
      fishOrangeHi:    '#ffba66',
      fishBlueDark:    '#103b8c',
      fishBlueMid:     '#1f74f0',
      fishBlueHi:      '#7cc2ff',
      fishYellowDark:  '#b88212',
      fishYellowMid:   '#ffd42b',
      fishYellowHi:    '#fff494',
      octoPinkDark:    '#a62652',
      octoPinkMid:     '#f75488',
      octoPinkHi:      '#ffa8c4',
      turtleGreenDark: '#166e32',
      turtleGreenMid:  '#2ec45a',
      turtleGreenHi:   '#8cf29e'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'tail', 'tailFin', 'hipFin', 'torso', 'shellTop', 'shoulderFin',
      'arm', 'head', 'eye', 'earFin', 'crown', 'hair', 'pearl',
      'critterBody', 'critterFin', 'critterMark'
    ],
    noCrease: [
      ['eye', 'head'], ['torso', 'head'], ['torso', 'arm'],
      ['torso', 'tail'], ['tail', 'tailFin'], ['head', 'earFin'],
      ['crown', 'pearl'], ['critterBody', 'critterFin'], ['critterBody', 'critterMark']
    ],
    materials: {
      tail:        ['tailDark',        'tailMid',        'tailHi'],
      fin:         ['finDark',         'finMid',         'finHi'],
      skin:        ['skinDark',        'skinMid',        'skinHi'],
      hair:        ['hairDark',        'hairMid',        'hairHi'],
      shell:       ['shellDark',       'shellMid',       'shellHi'],
      coral:       ['coralDark',       'coralMid',       'coralHi'],
      fishOrange:  ['fishOrangeDark',  'fishOrangeMid',  'fishOrangeHi'],
      fishBlue:    ['fishBlueDark',    'fishBlueMid',    'fishBlueHi'],
      fishYellow:  ['fishYellowDark',  'fishYellowMid',  'fishYellowHi'],
      octoPink:    ['octoPinkDark',    'octoPinkMid',    'octoPinkHi'],
      turtleGreen: ['turtleGreenDark', 'turtleGreenMid', 'turtleGreenHi']
    },
    protectedParts: ['eye', 'pearl', 'critterMark']
  });

  const SKINS = [
    {
      id: 'azure', name: '蔚蓝碧绿（浅海经典）', dot: '#2ec4d6', outline: '#071824',
      pal: {},
      fx: { core: '#e8feff', hot: '#78efff', foam: '#dff9ff' }
    },
    {
      id: 'coral', name: '珊瑚粉金（礁石款）', dot: '#f0786c', outline: '#1c0c14',
      pal: {
        tailDark:  '#992d3b', tailMid:  '#e66057', tailHi:  '#ffa280',
        finDark:   '#b54868', finMid:   '#f08299', finHi:   '#ffd0cc',
        skinDark:  '#b89c94', skinMid:  '#e8cfc5', skinHi:  '#fff0e8',
        hairDark:  '#8a652d', hairMid:  '#d4aa5c', hairHi:  '#fae19e',
        shellDark: '#996f21', shellMid: '#deb045', shellHi: '#ffe794',
        coralDark: '#914b1b', coralMid: '#d98132', coralHi: '#ffc266',
        eyeIris:   '#ffbf47',
        emissiveMid: '#ff6b9a', emissiveHot: '#ffb875', emissiveCore: '#fff6d6'
      },
      fx: { core: '#fff6d6', hot: '#ffb875', foam: '#ffe8e0' }
    },
    {
      id: 'deepsea', name: '深海蓝紫（深海精锐）', dot: '#7d66f2', outline: '#0b0a1f',
      pal: {
        tailDark:  '#1d1a5c', tailMid:  '#3e399e', tailHi:  '#7774db',
        finDark:   '#322178', finMid:   '#684cc4', finHi:   '#b298ff',
        skinDark:  '#8994b8', skinMid:  '#bcc7e6', skinHi:  '#e4ebfc',
        hairDark:  '#24406e', hairMid:  '#4b77b3', hairHi:  '#8ab7eb',
        shellDark: '#6b7aa3', shellMid: '#a5b5db', shellHi: '#dce5fa',
        coralDark: '#2a306e', coralMid: '#4f5cb0', coralHi: '#8a9ae8',
        eyeIris:   '#5ce8ff',
        emissiveMid: '#8a4bff', emissiveHot: '#4ae4ff', emissiveCore: '#e6f9ff'
      },
      fx: { core: '#e6f9ff', hot: '#4ae4ff', foam: '#d6d2ff' }
    },
    {
      id: 'frost', name: '霜白青鳞（寒海款）', dot: '#8cd9eb', outline: '#0b1824',
      pal: {
        tailDark:  '#396b7d', tailMid:  '#76b2c2', tailHi:  '#c0ebf5',
        finDark:   '#477da1', finMid:   '#89c1e3', finHi:   '#d7f3ff',
        skinDark:  '#9eb2bf', skinMid:  '#d0e1eb', skinHi:  '#f0f8fc',
        hairDark:  '#697d91', hairMid:  '#a7bccf', hairHi:  '#e4eff7',
        shellDark: '#7299b3', shellMid: '#b4d6eb', shellHi: '#f1faff',
        coralDark: '#2f658d', coralMid: '#5da2cf', coralHi: '#aae2ff',
        eyeIris:   '#45d9ff',
        emissiveMid: '#3ec6ff', emissiveHot: '#9cf1ff', emissiveCore: '#f4feff'
      },
      fx: { core: '#f4feff', hot: '#9cf1ff', foam: '#eefbff' }
    }
  ];

  // 7 档高密连续俯仰躯干（每档仅差 ~18°，彻底消除换姿跳帧卡顿！）
  const TORSO_STEPS = [
    { key: 'torso_0', pitch: 0.00, pivZ: 2.0 },
    { key: 'torso_1', pitch: 0.30, pivZ: 2.0 },
    { key: 'torso_2', pitch: 0.62, pivZ: 2.5 },
    { key: 'torso_3', pitch: 0.94, pivZ: 3.5 },
    { key: 'torso_4', pitch: 1.25, pivZ: 5.0 },
    { key: 'torso_5', pitch: 1.56, pivZ: 6.8 },
    { key: 'torso_6', pitch: 1.88, pivZ: 8.5 }
  ];

  function getContinuousSockets(pitch) {
    const neck = pitchPt([0, 0.2, 10.6], pitch, 0, 0);
    const sh   = pitchPt([0, 0.0,  7.6], pitch, 0, 0);
    return {
      neckY: neck[1], neckZ: neck[2],
      shY: sh[1],     shZ: sh[2]
    };
  }

  function pickTorsoStep(pitch) {
    let best = TORSO_STEPS[0], bestD = 99;
    for (let i = 0; i < TORSO_STEPS.length; i++) {
      const d = Math.abs(TORSO_STEPS[i].pitch - pitch);
      if (d < bestD) { bestD = d; best = TORSO_STEPS[i]; }
    }
    return best;
  }

  // 6 种灵动高速海洋小伙伴
  const CRITTERS = [
    { key: 'critter_clownfish', name: '小丑鱼',   bobFreq: 7.2, swimSpd: 1.75, zOff: 12.5 },
    { key: 'critter_octopus',   name: '小章鱼',   bobFreq: 4.8, swimSpd: 1.35, zOff: 11.5 },
    { key: 'critter_tang',      name: '蓝唐王鱼', bobFreq: 6.8, swimSpd: 1.95, zOff: 13.5 },
    { key: 'critter_puffer',    name: '河豚宝宝', bobFreq: 5.2, swimSpd: 1.25, zOff: 12.0 },
    { key: 'critter_seahorse',  name: '小海马',   bobFreq: 4.5, swimSpd: 1.20, zOff: 14.0 },
    { key: 'critter_turtle',    name: '小海龟',   bobFreq: 4.0, swimSpd: 1.45, zOff: 11.0 }
  ];

  const TAIL_COUNT = 10;
  const TAIL_SEG_LEN = 2.55;

  function relaxChain(chain, segLen) {
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 1; i < chain.length; i++) {
        const a = chain[i - 1], b = chain[i];
        const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
        const d = Math.hypot(dx, dy, dz) || 0.001;
        const diff = (d - segLen) / d;
        b.x -= dx * diff; b.y -= dy * diff; b.z -= dz * diff;
      }
    }
  }

  // =========================================================================
  // 1. 人鱼海妖 7 档连续俯仰部件
  // =========================================================================
  function buildTailSegmentPart(makeCanvas, radius, isScaled = true) {
    const W = Math.ceil(radius * 2 + 5);
    const D = W, H = Math.ceil(radius * 2 + 3);
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const cz = radius + 0.6;
    m.fillAABB(-radius - 0.6, radius + 0.6, -radius - 0.6, radius + 0.6, 0, H - 1, (x, y, z, X, Y) => {
      const d = Math.hypot(X / radius, Y / (radius * 1.12), (z - cz) / (radius * 0.92));
      if (d <= 1.0) {
        const isScaleBand = isScaled && z >= cz - 0.6 && ((Math.round(X + Y + z) & 1) === 0) && d > 0.72 && Y > -radius * 0.5;
        m.setRaw(x, y, z, isScaleBand ? mat('fin') : mat('tail'), partId.tail);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: radius });
  }

  function buildTailFinPart(makeCanvas, pitchPose = 'mid') {
    const W = 22, D = 22, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const dzTip = pitchPose === 'up' ? 4.8 : (pitchPose === 'down' ? -4.6 : 0.2);
    const zBase = 7.2;
    const pWr  = [ 0.0,  3.2, zBase];
    const pLA  = [-8.6, -3.6, clamp(zBase + dzTip * 0.75 + 1.2, 1.5, 14.4)];
    const pLB  = [-6.6, -9.2, clamp(zBase + dzTip,              1.5, 14.6)];
    const pMid = [ 0.0, -4.4, clamp(zBase + dzTip * 0.55,       1.5, 14.0)];
    const pRB  = [ 6.6, -9.2, clamp(zBase + dzTip,              1.5, 14.6)];
    const pRA  = [ 8.6, -3.6, clamp(zBase + dzTip * 0.75 + 1.2, 1.5, 14.4)];

    m.paintFinTri(pWr, pLA, pLB, 1.18, mat('fin'), partId.tailFin, false);
    m.paintFinTri(pWr, pLB, pMid, 1.18, mat('fin'), partId.tailFin, false);
    m.paintFinTri(pWr, pMid, pRB, 1.18, mat('fin'), partId.tailFin, false);
    m.paintFinTri(pWr, pRB, pRA, 1.18, mat('fin'), partId.tailFin, false);
    m.paintCapsule(pWr[0], pWr[1], pWr[2], pLA[0], pLA[1], pLA[2], 1.25, 0.92, mat('tail'), partId.tailFin, true);
    m.paintCapsule(pWr[0], pWr[1], pWr[2], pLB[0], pLB[1], pLB[2], 1.15, 0.88, mat('fin'),  partId.tailFin, true);
    m.paintCapsule(pWr[0], pWr[1], pWr[2], pRB[0], pRB[1], pRB[2], 1.15, 0.88, mat('fin'),  partId.tailFin, true);
    m.paintCapsule(pWr[0], pWr[1], pWr[2], pRA[0], pRA[1], pRA[2], 1.25, 0.92, mat('tail'), partId.tailFin, true);
    m.paintEllipsoid(0, 2.8, zBase, 2.1, 2.2, 1.8, mat('tail'), partId.tail, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.2 });
  }

  function buildHipSkirtPart(makeCanvas, swimMode = false) {
    const m = new VoxelModel(16, 16, 9, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 4.8, 3.2, 2.7, 2.6, mat('tail'), partId.tail, true);
    m.fillAABB(-3.8, 3.8, -3.2, 3.2, 5.4, 6.8, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 3.35, Y / 2.8);
      if (r >= 0.72 && r <= 1.08) m.setRaw(x, y, z, mat('shell'), partId.shellTop);
    });
    if (!swimMode) {
      for (let k = 0; k < 6; k++) {
        const ang = (k / 6) * TAU + 0.52;
        const rIn = 2.6, rOut = 5.4;
        const a1 = ang - 0.36, a2 = ang + 0.36;
        m.paintFinTri(
          [Math.cos(ang) * rIn, Math.sin(ang) * rIn, 6.0],
          [Math.cos(a1) * rOut, Math.sin(a1) * rOut, 3.8],
          [Math.cos(a2) * rOut, Math.sin(a2) * rOut, 3.8],
          1.08, (k % 2 === 0) ? mat('shell') : mat('fin'), partId.hipFin, false
        );
      }
    } else {
      for (const s of [-1, 1]) {
        m.paintFinTri([s * 2.5, 0.8, 5.4], [s * 5.6, -2.6, 5.0], [s * 4.4, -4.8, 3.8], 1.08, mat('fin'), partId.hipFin, false);
        m.paintFinTri([s * 2.2, 1.2, 6.0], [s * 4.6, -0.6, 6.2], [s * 3.8, -2.6, 5.2], 1.05, mat('shell'), partId.hipFin, false);
      }
      m.paintFinTri([0, 0.8, 6.6], [0, -4.6, 7.6], [0, -5.2, 5.2], 1.05, mat('fin'), partId.hipFin, false);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: swimMode ? 4.8 : 5.0 });
  }

  function buildTorsoStepPart(makeCanvas, step) {
    const { pitch, pivZ } = step;
    const isSwim = pitch > 0.15;
    const W = 18, D = isSwim ? 24 : 14, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const mapFwd = (x, y, z) => pitch ? pitchPt([x, y, z], pitch, 0, pivZ) : [x, y, z];
    const cp = Math.cos(-pitch), sp = Math.sin(-pitch);

    m.fillAABB(-5.2, 5.2, -4.8, isSwim ? 11.4 : 4.2, 0, H - 1, (x, y, z, X, Y) => {
      const dy = Y, dz = z - pivZ;
      const ly = dy * cp + dz * sp;
      const lz = 2.0 - dy * sp + dz * cp;
      const dWaist = (Math.hypot(X / 2.65, ly / 2.25, (lz - 2.6) / 3.0) - 1) * 2.5;
      const dChest = (Math.hypot(X / 3.75, (ly - 0.3) / 2.75, (lz - 6.8) / 3.4) - 1) * 2.8;
      const dNeck  = (Math.hypot(X / 1.75, (ly - 0.3) / 1.75, (lz - 11.4) / 2.6) - 1) * 1.7;
      if (smin(smin(dWaist, dChest, 1.4), dNeck, 1.2) <= 0) {
        m.setRaw(x, y, z, mat('skin'), partId.torso);
      }
    });
    for (const s of [-1, 1]) {
      const p = mapFwd(s * 1.8, 2.15, pivZ + 4.2);
      m.paintEllipsoid(p[0], p[1], p[2], 1.78, 1.45, 1.75, mat('shell'), partId.shellTop, true);
    }
    const pBand = mapFwd(0, 0.2, pivZ + 3.0);
    m.paintEllipsoid(pBand[0], pBand[1], pBand[2], 3.55, 2.65, 1.0, mat('shell'), partId.shellTop, false);
    for (const s of [-1, 1]) {
      const pA = mapFwd(s * 3.5, -0.4, pivZ + 6.6);
      const pB = isSwim ? [pA[0] + s * 4.2, pA[1] - 3.8, pA[2] + (pitch > 1.4 ? 2.0 : 1.0)] : [s * 7.2, -2.0, pivZ + 8.2];
      const pC = isSwim ? [pA[0] + s * 3.0, pA[1] - 4.8, pA[2] + (pitch > 1.4 ? 0.2 : -1.2)] : [s * 6.2, -2.3, pivZ + 4.6];
      m.paintFinTri(pA, pB, pC, 1.10, mat('fin'), partId.shoulderFin, false);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: isSwim ? 4.6 : 4.2 });
  }

  function buildHeadPart(makeCanvas, pose = 'idle') {
    const W = 18, D = 18, H = 15;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const isDive = pose === 'dive';
    const isSwim = pose !== 'idle';
    const headZ = isDive ? 4.2 : (pose === 'rise' ? 5.2 : 4.6);
    const headY = isSwim ? 1.8 : 0.8;

    m.paintEllipsoid(0, isSwim ? 0.5 : 0.4, isDive ? 5.6 : 1.8, 1.85, 1.95, 1.85, mat('skin'), partId.head, true);
    m.paintEllipsoid(0, headY, headZ, 3.65, 3.75, 3.55, mat('skin'), partId.head, true);

    m.fillAABB(-4.8, 4.8, headY - 4.8, headY + 0.3, headZ - 2.4, headZ + 3.6, (x, y, z, X, Y) => {
      const dCap = Math.hypot(X / 4.35, (Y - (headY - 1.2)) / 3.9, (z - (headZ + 0.25)) / 3.7);
      if (dCap <= 1.0 && Y <= headY + 0.1) m.setRaw(x, y, z, mat('hair'), partId.hair);
    });
    for (const s of [-1, 1]) {
      const backSweep = isSwim ? -3.0 : -1.7;
      m.paintFinTri(
        [s * 3.3, headY - 0.4, headZ + 0.2],
        [s * (isSwim ? 6.8 : 7.6), headY + backSweep, headZ + (isDive ? 2.8 : 2.2)],
        [s * (isSwim ? 6.0 : 6.6), headY + backSweep - 0.5, headZ - 1.2],
        1.12, mat('fin'), partId.earFin, false
      );
    }
    const crZ = headZ + 3.3;
    m.paintFinTri([0, headY, crZ - 0.2], [-2.7, headY - 0.8, crZ + 3.5], [2.7, headY - 0.8, crZ + 3.5], 1.12, mat('shell'), partId.crown, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.9, headY - 0.4, crZ, s * 3.6, headY - 1.4, crZ + 3.6, 1.12, 0.94, mat('coral'), partId.crown, true);
    }
    m.paintCapsule(-2.9, headY + 0.2, crZ - 0.2, 2.9, headY + 0.2, crZ - 0.2, 1.08, 1.08, mat('shell'), partId.crown, true);
    m.paintEllipsoid(0, headY + 0.8, crZ + 0.5, 1.05, 0.95, 1.05, keyToId.emissiveHot, partId.pearl, true);

    m.despeckle();
    m.applyArtShading(true);

    const eyeZ = Math.round(headZ + (isDive ? -0.5 : (pose === 'rise' ? 0.3 : -0.1)));
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (const s of [-1, 1]) {
      const ex0 = Math.round(hw + s * 1.6);
      const ex1 = Math.round(hw + s * 2.5);
      for (const ex of [ex0, ex1]) {
        let sy = -1;
        for (let y = D - 2; y >= Math.round(hd); y--) {
          if (m.getPartId(ex, y, eyeZ) === partId.head) { sy = y; break; }
        }
        if (sy < 0) sy = Math.round(hd + headY + 3.5);
        const isOuter = (ex === ex1);
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && !isOuter) ? keyToId.eyeGlint : (dz === 0 ? keyToId.eyeIris : keyToId.eyeDark);
          m.setRaw(ex, sy, eyeZ + dz, kId, partId.eye);
        }
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.0 });
  }

  function buildHairNodePart(makeCanvas, radius) {
    const S = Math.ceil(radius * 2 + 4);
    const m = new VoxelModel(S, S, S, SPEC);
    m.paintEllipsoid(0, 0, S * 0.5 - 0.4, radius * 1.05, radius * 1.12, radius * 0.95, SPEC.mat('hair'), SPEC.partId.hair, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: radius });
  }

  function buildUpperArmPart(makeCanvas, side) {
    const m = new VoxelModel(12, 12, 9, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 4.4, 1.45, 1.42, 1.45, mat('skin'), partId.arm, true);
    m.paintCapsule(0, 0, 4.4, side * 2.5, 2.2, 3.6, 1.28, 1.08, mat('skin'), partId.arm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.8 });
  }

  function buildForearmPart(makeCanvas, side) {
    const m = new VoxelModel(12, 14, 9, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 4.2, 1.10, 1.10, 1.10, mat('skin'), partId.arm, true);
    m.paintCapsule(0, 0, 4.2, side * 1.6, 3.8, 4.5, 1.08, 0.88, mat('skin'), partId.arm, true);
    m.paintEllipsoid(side * 1.25, 2.95, 4.4, 1.20, 1.18, 0.96, mat('shell'), partId.shellTop, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.6 });
  }

  // =========================================================================
  // 2. 6 种高辨识度海洋小伙伴体素建模
  // =========================================================================
  function buildCritterClownfish(makeCanvas) {
    const m = new VoxelModel(10, 12, 9, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-2.5, 2.5, -3.5, 4.2, 1, 7, (x, y, z, X, Y) => {
      if (Math.hypot(X / 2.0, (Y - 0.5) / 3.4, (z - 4.0) / 2.4) <= 1.0) {
        const isStripe = (Y >= 1.3 && Y <= 2.3) || (Y >= -1.4 && Y <= -0.4);
        m.setRaw(x, y, z, isStripe ? keyToId.eyeGlint : mat('fishOrange'), isStripe ? partId.critterMark : partId.critterBody);
      }
    });
    m.paintFinTri([0, -2.2, 4.0], [0, -5.0, 6.2], [0, -5.0, 1.8], 0.82, mat('fishOrange'), partId.critterFin, false);
    m.paintEllipsoid(0, 0.2, 6.6, 0.72, 1.9, 1.0, mat('fishOrange'), partId.critterFin, true);
    m.despeckle();
    m.applyArtShading(true);
    const hw = 4.5, hd = 5.5;
    m.setRaw(Math.round(hw - 1.6), Math.round(hd + 2.8), 4, keyToId.eyeDark, partId.critterMark);
    m.setRaw(Math.round(hw + 1.6), Math.round(hd + 2.8), 4, keyToId.eyeDark, partId.critterMark);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2 });
  }

  function buildCritterOctopus(makeCanvas) {
    const m = new VoxelModel(12, 12, 10, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.paintEllipsoid(0, 0, 5.6, 3.1, 3.1, 2.9, mat('octoPink'), partId.critterBody, true);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + 0.35;
      m.paintCapsule(Math.cos(a) * 1.8, Math.sin(a) * 1.8, 3.4, Math.cos(a) * 4.4, Math.sin(a) * 4.4, 1.6, 0.95, 0.72, mat('octoPink'), partId.critterFin, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    const hw = 5.5, hd = 5.5;
    for (const s of [-1, 1]) {
      m.setRaw(Math.round(hw + s * 1.5), Math.round(hd + 3.0), 5, keyToId.eyeDark, partId.critterMark);
      m.setRaw(Math.round(hw + s * 1.5), Math.round(hd + 3.0), 6, keyToId.eyeGlint, partId.critterMark);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 3.8 });
  }

  function buildCritterTang(makeCanvas) {
    const m = new VoxelModel(10, 12, 9, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-2.2, 2.2, -3.4, 4.2, 1, 7, (x, y, z, X, Y) => {
      if (Math.hypot(X / 1.8, (Y - 0.5) / 3.5, (z - 4.0) / 2.7) <= 1.0) {
        const isDarkStripe = z >= 5.2 && Y >= -1.8 && Y <= 1.8;
        m.setRaw(x, y, z, isDarkStripe ? keyToId.eyeDark : mat('fishBlue'), isDarkStripe ? partId.critterMark : partId.critterBody);
      }
    });
    m.paintFinTri([0, -2.2, 4.0], [0, -5.2, 6.2], [0, -5.2, 1.8], 0.82, mat('fishYellow'), partId.critterFin, false);
    m.despeckle();
    m.applyArtShading(true);
    const hw = 4.5, hd = 5.5;
    m.setRaw(Math.round(hw - 1.5), Math.round(hd + 2.8), 4, keyToId.eyeDark, partId.critterMark);
    m.setRaw(Math.round(hw + 1.5), Math.round(hd + 2.8), 4, keyToId.eyeDark, partId.critterMark);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2 });
  }

  function buildCritterPuffer(makeCanvas) {
    const m = new VoxelModel(11, 11, 10, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-3.5, 3.5, -3.5, 3.5, 1, 8, (x, y, z, X, Y) => {
      if (Math.hypot(X / 3.0, Y / 3.1, (z - 4.4) / 2.8) <= 1.0) {
        const isBelly = z <= 3.1;
        m.setRaw(x, y, z, isBelly ? keyToId.eyeGlint : mat('fishYellow'), isBelly ? partId.critterMark : partId.critterBody);
      }
    });
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 3.4, 0.2, 4.2, 1.05, 1.1, 0.85, mat('fishOrange'), partId.critterFin, true);
    }
    m.paintFinTri([0, -2.6, 4.4], [0, -4.8, 5.8], [0, -4.8, 3.0], 0.78, mat('fishOrange'), partId.critterFin, false);
    m.despeckle();
    m.applyArtShading(true);
    const hw = 5.0, hd = 5.0;
    for (const s of [-1, 1]) {
      m.setRaw(Math.round(hw + s * 1.6), Math.round(hd + 3.0), 5, keyToId.eyeDark, partId.critterMark);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 3.4 });
  }

  function buildCritterSeahorse(makeCanvas) {
    const m = new VoxelModel(9, 10, 12, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.paintCapsule(0, -0.6, 1.6, 0,  1.2, 2.2, 0.85, 0.95, mat('fishOrange'), partId.critterBody, true);
    m.paintCapsule(0, -0.6, 1.6, 0, -0.2, 4.6, 0.95, 1.45, mat('fishOrange'), partId.critterBody, true);
    m.paintCapsule(0, -0.2, 4.6, 0,  0.6, 7.6, 1.45, 1.25, mat('fishOrange'), partId.critterBody, true);
    m.paintEllipsoid(0, 0.6, 9.2, 1.45, 1.65, 1.45, mat('fishOrange'), partId.critterBody, true);
    m.paintCapsule(0, 1.6, 9.0, 0, 3.8, 8.6, 0.82, 0.65, mat('fishYellow'), partId.critterFin, true);
    m.paintFinTri([0, -1.0, 6.8], [0, -3.2, 7.6], [0, -3.0, 4.8], 0.68, mat('fishYellow'), partId.critterFin, false);
    m.despeckle();
    m.applyArtShading(true);
    const hw = 4.0, hd = 4.5;
    m.setRaw(Math.round(hw - 1.3), Math.round(hd + 1.6), 9, keyToId.eyeDark, partId.critterMark);
    m.setRaw(Math.round(hw + 1.3), Math.round(hd + 1.6), 9, keyToId.eyeDark, partId.critterMark);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8 });
  }

  function buildCritterTurtle(makeCanvas) {
    const m = new VoxelModel(12, 12, 8, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.paintEllipsoid(0, -0.4, 3.8, 3.0, 3.5, 2.1, mat('turtleGreen'), partId.critterBody, true);
    m.paintEllipsoid(0, 3.4, 3.4, 1.35, 1.45, 1.25, mat('fishYellow'), partId.critterFin, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 2.2, 1.2, 3.0, s * 4.8, 2.2, 2.6, 1.05, 0.85, mat('turtleGreen'), partId.critterFin, true);
      m.paintCapsule(s * 1.8, -2.6, 2.8, s * 3.4, -4.4, 2.4, 0.90, 0.72, mat('turtleGreen'), partId.critterFin, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    const hw = 5.5, hd = 5.5;
    m.setRaw(Math.round(hw - 1.0), Math.round(hd + 4.4), 4, keyToId.eyeDark, partId.critterMark);
    m.setRaw(Math.round(hw + 1.0), Math.round(hd + 4.4), 4, keyToId.eyeDark, partId.critterMark);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8 });
  }

  // =========================================================================
  // 3. 生物定义：潮汐海妖（丝滑高速 7 档连续俯仰海豚游 + 游歇交替 + 6 种海洋小伙伴）
  // =========================================================================
  const SirenDef = {
    id: 'siren_tide',
    name: '潮汐海妖',
    tag: '丝滑高速海豚游 · 海洋伴游',
    summary: '7 档高密连续俯仰躯干 + 敏捷高速海豚式上下波浪畅游（零跳帧卡顿）+ 零穿模飘发 + 6 种灵动海洋小伙伴轮换互动',
    defaultHabitat: 'reef',
    footRadius: 9.5,
    ecoWeight: 1.0,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    blocks: ['7 档连续俯仰丝滑游姿', '敏捷高速海豚上下波浪', '3 档俯仰水平双叶尾鳍', '零穿模背上流线长发', '6 种灵动海洋小伙伴'],
    soulHabit: '以敏捷流畅的海豚式头下俯潜与昂首上浮在环礁畅游，游一阵后平滑减速立身踩水与海洋小伙伴嬉戏',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        tailThick:    buildTailSegmentPart(makeCanvas, 3.15, true),
        tailMid:      buildTailSegmentPart(makeCanvas, 2.70, true),
        tailSlim:     buildTailSegmentPart(makeCanvas, 2.20, false),
        tailTip:      buildTailSegmentPart(makeCanvas, 1.72, false),
        tailFinUp:    buildTailFinPart(makeCanvas, 'up'),
        tailFinMid:   buildTailFinPart(makeCanvas, 'mid'),
        tailFinDown:  buildTailFinPart(makeCanvas, 'down'),
        hipSkirt:     buildHipSkirtPart(makeCanvas, false),
        hipSkirtSwim: buildHipSkirtPart(makeCanvas, true),
        head_idle:    buildHeadPart(makeCanvas, 'idle'),
        head_rise:    buildHeadPart(makeCanvas, 'rise'),
        head_glide:   buildHeadPart(makeCanvas, 'glide'),
        head_dive:    buildHeadPart(makeCanvas, 'dive'),
        upperArmL:    buildUpperArmPart(makeCanvas, -1),
        upperArmR:    buildUpperArmPart(makeCanvas,  1),
        forearmL:     buildForearmPart(makeCanvas,  -1),
        forearmR:     buildForearmPart(makeCanvas,   1),
        hairL:        buildHairNodePart(makeCanvas, 1.82),
        hairM:        buildHairNodePart(makeCanvas, 1.48),
        hairS:        buildHairNodePart(makeCanvas, 1.12),
        critter_clownfish: buildCritterClownfish(makeCanvas),
        critter_octopus:   buildCritterOctopus(makeCanvas),
        critter_tang:      buildCritterTang(makeCanvas),
        critter_puffer:    buildCritterPuffer(makeCanvas),
        critter_seahorse:  buildCritterSeahorse(makeCanvas),
        critter_turtle:    buildCritterTurtle(makeCanvas)
      };
      for (let i = 0; i < TORSO_STEPS.length; i++) {
        parts[TORSO_STEPS[i].key] = buildTorsoStepPart(makeCanvas, TORSO_STEPS[i]);
      }

      const sirenRecolorAssets = Object.keys(parts)
        .filter(k => !k.startsWith('critter_'))
        .map(k => parts[k]);

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const tailNodes = Array.from({ length: TAIL_COUNT }, (_, i) => ({ x: hx0, y: hy0 - i * 2.2, z: 9, yaw: 0 }));
      const hairChains = [
        { latX:  0.0, dBias: 0.35, nodes: Array.from({ length: 4 }, () => ({ x: hx0, y: hy0 - 5, z: 28 })) },
        { latX: -2.4, dBias: 0.00, nodes: Array.from({ length: 3 }, () => ({ x: hx0 - 3, y: hy0 - 4, z: 27 })) },
        { latX:  2.4, dBias: 0.00, nodes: Array.from({ length: 3 }, () => ({ x: hx0 + 3, y: hy0 - 4, z: 27 })) }
      ];

      const initCritterIdx = Math.floor(Math.random() * CRITTERS.length);
      const state = {
        x: hx0, y: hy0, z: 10.0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0, yawRate: 0,
        swimAngle: -Math.PI * 0.5 + (opts.seed ? (opts.seed % TAU) : 0),
        swimCycleT: 0,
        swimBlend: 1.0, // 0=立身待机，1=高速畅游，连续平滑过渡无顿挫！
        curPitch: 1.15, // 连续实数俯仰角（rad），彻底告别单帧跳变卡顿！
        restX: hx0, restY: hy0, restYaw: opts.homeYaw ?? 0,
        wasResting: false,
        dolphinPhase: 0,
        finPose: 'mid',
        headYaw: 0,
        uSweepL: 0.25, fBendL: 0.10, elbowZL: 0,
        uSweepR: 0.25, fBendR: 0.10, elbowZR: 0,
        wakeCd: 0,
        critterIdx: initCritterIdx,
        critterT: 0.6,
        critterDur: 5.2,
        critterSide: 1,
        critterX: hx0 + 16, critterY: hy0 + 6, critterZ: 12, critterYaw: 0,
        critterVis: true,
        critterBubbleCd: 0
      };

      let curSkin = SKINS[0];

      const instance = {
        def: SirenDef,
        cachePrefix: `siren_v3g_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of sirenRecolorAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 10.0;
          state.vx = 0; state.vy = 0; state.yaw = hyaw; state.yawRate = 0;
          state.swimCycleT = 0; state.wasResting = false;
          state.swimBlend = 1.0; state.curPitch = 1.15;
          state.restX = hx; state.restY = hy; state.restYaw = hyaw;
          state.uSweepL = 0.25; state.fBendL = 0.10; state.elbowZL = 0;
          state.uSweepR = 0.25; state.fBendR = 0.10; state.elbowZR = 0;
          for (let i = 0; i < TAIL_COUNT; i++) {
            tailNodes[i].x = hx;
            tailNodes[i].y = hy - i * TAIL_SEG_LEN;
            tailNodes[i].z = Math.max(4.0, 14 - i * 0.9);
            tailNodes[i].yaw = hyaw;
          }
          for (const hc of hairChains) {
            for (let j = 0; j < hc.nodes.length; j++) {
              hc.nodes[j].x = hx + hc.latX;
              hc.nodes[j].y = hy - 4.5 - j * 2.4;
              hc.nodes[j].z = 28;
            }
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const speedMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.4, 2.0);
          const patrol = eco && eco.patrol !== false;
          const maxR = (eco && eco.maxRadius) || 46;
          const fx = curSkin.fx || SKINS[0].fx;

          const kPos  = expSmooth(dt, 11.0);
          const kMid  = expSmooth(dt, 14.0);
          const kFast = expSmooth(dt, 18.0);

          // =====================================================================
          // 1. 灵动高速海洋小伙伴轮换互动
          // =====================================================================
          state.critterT += dt;
          if (state.critterT >= state.critterDur) {
            state.critterT -= state.critterDur;
            let nextIdx = Math.floor(Math.random() * CRITTERS.length);
            if (nextIdx === state.critterIdx) nextIdx = (nextIdx + 1) % CRITTERS.length;
            state.critterIdx = nextIdx;
            state.critterSide = Math.random() < 0.5 ? -1 : 1;
          }
          const cr = CRITTERS[state.critterIdx] || CRITTERS[0];
          const ct = state.critterT;
          const cd = state.critterDur;
          const isInteracting = ct > 0.9 && ct < cd - 0.9;

          let crRad = 12.5, crAng = state.critterSide * 0.65, crZ = cr.zOff * sMul;
          if (ct < 0.9) {
            const u = smoothstep(0, 1, ct / 0.9);
            crRad = lerp(28.0, 12.0, u);
            crAng = state.critterSide * lerp(1.9, 0.6, u);
            crZ = lerp(2.0, cr.zOff, u) * sMul;
          } else if (ct < cd - 0.9) {
            const u = (ct - 0.9) / (cd - 1.8);
            crAng = state.critterSide * (0.6 + u * TAU * 1.15 * cr.swimSpd);
            crRad = (11.5 + Math.sin(u * Math.PI * 3.5) * 2.4) * sMul;
            crZ = (cr.zOff + Math.sin(time * cr.bobFreq) * 2.6) * sMul;
          } else {
            const u = smoothstep(0, 1, (ct - (cd - 0.9)) / 0.9);
            crRad = lerp(12.0, 30.0, u) * sMul;
            crAng = state.critterSide * (0.6 + TAU * 1.15 * cr.swimSpd + u * 1.6);
            crZ = lerp(cr.zOff, 1.5, u) * sMul;
          }

          const prevCrX = state.critterX, prevCrY = state.critterY;
          const [cTargetX, cTargetY] = localToWorldXY(
            state.x, state.y, state.yaw,
            Math.sin(crAng) * crRad, Math.cos(crAng) * crRad + (state.swimBlend > 0.4 ? 5.0 : 2.0) * sMul
          );
          state.critterX = lerp(state.critterX, cTargetX, kFast);
          state.critterY = lerp(state.critterY, cTargetY, kFast);
          state.critterZ = lerp(state.critterZ, state.z + crZ, kFast);
          const cdx = state.critterX - prevCrX, cdy = state.critterY - prevCrY;
          if (Math.hypot(cdx, cdy) > 0.04) {
            const cYawTgt = Math.atan2(-cdx, cdy);
            state.critterYaw = wrapAngle(state.critterYaw + wrapAngle(cYawTgt - state.critterYaw) * kFast);
          }
          state.critterVis = ct > 0.1 && ct < cd - 0.1;

          state.critterBubbleCd -= dt;
          if (vfx && state.critterVis && state.critterBubbleCd <= 0) {
            state.critterBubbleCd = isInteracting ? 0.18 : 0.28;
            vfx.spawnParticle(
              state.critterX + (Math.random() - 0.5) * 2, state.critterY + (Math.random() - 0.5) * 2,
              state.critterZ + 2.0 * sMul,
              (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 6 + Math.random() * 5,
              0.50, 1.2, Math.random() < 0.5 ? fx.core : fx.hot, true, -3
            );
          }

          // =====================================================================
          // 2. 敏捷高速丝滑海豚游 ↔ 平滑减速立身踩水待机（零跳帧卡顿）
          // =====================================================================
          const SWIM_DUR = 7.4;
          const REST_DUR = 3.6;
          const CYCLE_DUR = SWIM_DUR + REST_DUR;
          if (patrol) {
            state.swimCycleT = (state.swimCycleT + dt) % CYCLE_DUR;
          } else {
            state.swimCycleT = SWIM_DUR + 0.5;
          }
          const inSwimPhase = patrol && state.swimCycleT < SWIM_DUR;
          state.swimBlend = lerp(state.swimBlend, inSwimPhase ? 1.0 : 0.0, expSmooth(dt, 4.5));

          if (!inSwimPhase && !state.wasResting) {
            state.wasResting = true;
            state.restX = state.x; state.restY = state.y; state.restYaw = state.yaw;
          } else if (inSwimPhase && state.wasResting) {
            state.wasResting = false;
          }

          const toCrYaw = Math.atan2(-(state.critterX - state.x), state.critterY - state.y);
          const relCrYaw = wrapAngle(toCrYaw - state.yaw);

          // 游动节拍更快更灵动（真实鱼类/海豚的敏捷推进节奏）
          const kickFreq = lerp(2.8, 4.6, state.swimBlend) * gFreq;
          state.dolphinPhase += dt * kickFreq;
          const wavePos = Math.sin(state.dolphinPhase);
          const waveVel = Math.cos(state.dolphinPhase);
          const downKick = Math.pow(Math.max(0, waveVel), 1.5);

          // 敏捷环礁高速滑行（约 2.2 倍提速，顺滑不拖沓）
          const angularSpeed = (1.12 + downKick * 1.05) * speedMul * state.swimBlend;
          state.swimAngle += dt * angularSpeed;

          const R = Math.min(28.0, maxR * 0.68) + Math.sin(state.swimAngle * 2.0) * 4.5;
          let swimX = Math.cos(state.swimAngle) * R + ((eco && eco.avoidX) || 0) * 0.35;
          let swimY = Math.sin(state.swimAngle) * R + ((eco && eco.avoidY) || 0) * 0.35;
          const dR = Math.hypot(swimX, swimY);
          if (dR > maxR) { swimX *= maxR / dR; swimY *= maxR / dR; }

          const baseX = patrol ? state.restX : (eco ? (eco.homeX ?? 0) : 0);
          const baseY = patrol ? state.restY : (eco ? (eco.homeY ?? 0) : 0);
          const baseYaw = patrol ? state.restYaw : (eco ? (eco.homeYaw ?? 0) : 0);
          const restX = baseX + Math.sin(time * 0.8) * 3.0 * sMul;
          const restY = baseY + Math.cos(time * 0.7) * 2.4 * sMul;

          const tgtX = lerp(restX, swimX, state.swimBlend);
          const tgtY = lerp(restY, swimY, state.swimBlend);

          const vx = -Math.sin(state.swimAngle), vy = Math.cos(state.swimAngle);
          const swimYaw = Math.atan2(-vx, vy);
          const restYaw = baseYaw + Math.sin(time * 0.6) * 0.22;
          const tgtYaw = state.swimBlend > 0.25 ? swimYaw : restYaw;

          // 连续实数俯仰角：下潜时平滑压低到 1.88 rad(头朝下)，上浮时平滑抬升到 0.44 rad(头朝上)，待机平滑回正到 0.0 rad！
          const swimPitchTgt = clamp(1.16 - waveVel * 0.72, 0.42, 1.88);
          const tgtPitch = lerp(0.0, swimPitchTgt, state.swimBlend);
          state.curPitch = lerp(state.curPitch, tgtPitch, expSmooth(dt, 14.0));

          const swimLift = (11.5 + wavePos * 6.0) * sMul;
          const restLift = (7.4 + wavePos * 2.2) * sMul;
          const tgtLift = lerp(restLift, swimLift, state.swimBlend);

          const tgtHeadYaw = isInteracting
            ? clamp(relCrYaw * lerp(0.65, 0.42, state.swimBlend), -0.50, 0.50)
            : lerp(Math.sin(time * 1.1) * 0.22, 0, state.swimBlend);

          // 两段式柔顺手臂运动（大臂引领 + 小臂滞后 0.80 rad 随动，彻底告别机械僵硬感！）
          const reachL = (!inSwimPhase && isInteracting && relCrYaw > 0) ? 1.0 : 0.0;
          const reachR = (!inSwimPhase && isInteracting && relCrYaw <= 0) ? 1.0 : 0.0;
          const swimArmWave  = Math.sin(state.dolphinPhase - 0.15);
          const swimForeWave = Math.sin(state.dolphinPhase - 0.95);
          const swimElbZ     = Math.cos(state.dolphinPhase - 0.40) * 1.15;

          const idlePhaseL = time * 2.2;
          const idlePhaseR = time * 2.2 + 0.65;
          const tgtUSweepL = lerp(0.14 + Math.sin(idlePhaseL) * 0.24 - reachL * 0.42, 0.48 - swimArmWave * 0.62, state.swimBlend);
          const tgtFBendL  = lerp(-0.08 + Math.sin(idlePhaseL - 0.80) * 0.38 - reachL * 0.26, 0.16 - swimForeWave * 0.56, state.swimBlend);
          const tgtElbZL   = lerp(Math.sin(idlePhaseL - 0.40) * 0.65 + reachL * 1.45, swimElbZ, state.swimBlend) * sMul;

          const tgtUSweepR = lerp(0.14 + Math.sin(idlePhaseR) * 0.24 - reachR * 0.42, 0.48 - swimArmWave * 0.62, state.swimBlend);
          const tgtFBendR  = lerp(-0.08 + Math.sin(idlePhaseR - 0.80) * 0.38 - reachR * 0.26, 0.16 - swimForeWave * 0.56, state.swimBlend);
          const tgtElbZR   = lerp(Math.sin(idlePhaseR - 0.40) * 0.65 + reachR * 1.45, swimElbZ, state.swimBlend) * sMul;

          const nx = lerp(state.x, tgtX, kPos);
          const ny = lerp(state.y, tgtY, kPos);
          state.vx = (nx - state.x) / Math.max(dt, 0.001);
          state.vy = (ny - state.y) / Math.max(dt, 0.001);
          state.x = nx; state.y = ny;
          state.z = lerp(state.z, tgtLift, kMid);
          const prevYaw = state.yaw;
          state.yaw = wrapAngle(state.yaw + wrapAngle(tgtYaw - state.yaw) * kMid);
          const instYawRate = wrapAngle(state.yaw - prevYaw) / Math.max(dt, 0.001);
          state.yawRate = lerp(state.yawRate, clamp(instYawRate, -3.5, 3.5), expSmooth(dt, 10.0));
          state.headYaw = lerp(state.headYaw, tgtHeadYaw, kMid);
          state.uSweepL = lerp(state.uSweepL, tgtUSweepL, kFast);
          state.fBendL  = lerp(state.fBendL,  tgtFBendL,  kFast);
          state.elbowZL = lerp(state.elbowZL, tgtElbZL,   kFast);
          state.uSweepR = lerp(state.uSweepR, tgtUSweepR, kFast);
          state.fBendR  = lerp(state.fBendR,  tgtFBendR,  kFast);
          state.elbowZR = lerp(state.elbowZR, tgtElbZR,   kFast);

          state.wakeCd -= dt;
          if (vfx && state.wakeCd <= 0) {
            if (state.swimBlend > 0.35) {
              state.wakeCd = 0.06;
              EnvFeedback.emitWaterWake(vfx, habitat, state.x, state.y, state.yaw, (8.0 + downKick * 5.0) * sMul, downKick);
              if (Math.abs(waveVel) > 0.62) {
                const te = tailNodes[TAIL_COUNT - 1];
                vfx.spawnParticle(
                  te.x + (Math.random() - 0.5) * 3, te.y + (Math.random() - 0.5) * 3, Math.max(1.5, te.z),
                  (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 9 + Math.random() * 9,
                  0.42, 1.45, fx.foam, true, 18
                );
              }
            } else if (Math.abs(waveVel) > 0.88) {
              state.wakeCd = 0.55;
              const te = tailNodes[TAIL_COUNT - 1];
              if (habitat && habitat.isWater) vfx.addRipple(te.x, te.y, 3 * sMul, 16 * sMul, 0.70, 1.5);
            }
          }

          // =====================================================================
          // 3. 10 节人鱼尾链：随 swimBlend 丝滑混合高速海豚波与踩水弧（0 突跳）
          // =====================================================================
          const hipZ = state.z + 10.8 * sMul;
          const [h0x, h0y] = localToWorldXY(state.x, state.y, state.yaw, 0, lerp(-0.6, -1.4, state.swimBlend) * sMul);
          tailNodes[0].x = h0x; tailNodes[0].y = h0y; tailNodes[0].z = hipZ - 0.6 * sMul;
          const ks = expSmooth(dt, 18.0);

          for (let i = 1; i < TAIL_COUNT; i++) {
            const u = i / (TAIL_COUNT - 1);
            // 高速海豚游目标
            const [swX, swY] = localToWorldXY(tailNodes[i - 1].x, tailNodes[i - 1].y, state.yaw, 0, -TAIL_SEG_LEN * 0.94 * sMul);
            const swZ = Math.max(1.2 * sMul, (11.5 + 9.2 * (1 - u * 0.25) + Math.sin(state.dolphinPhase - i * 0.42) * lerp(6.0, 9.2, Math.pow(u, 0.85)) * flex) * sMul);
            // 竖姿踩水目标
            const kickFwd = Math.sin(state.dolphinPhase - i * 0.44) * Math.pow(u, 1.3) * 5.2 * flex * sMul;
            const [rsX, rsY] = localToWorldXY(state.x, state.y, state.yaw, 0, -Math.pow(u, 1.42) * 14.8 * sMul + kickFwd);
            const rsZ = Math.max(1.0 * sMul, lerp(hipZ - 1.6 * sMul, 2.2 * sMul, Math.pow(u, 0.65)) + Math.cos(state.dolphinPhase - i * 0.44) * Math.pow(u, 1.2) * 3.0 * flex * sMul);

            tailNodes[i].x = lerp(tailNodes[i].x, lerp(rsX, swX, state.swimBlend), ks);
            tailNodes[i].y = lerp(tailNodes[i].y, lerp(rsY, swY, state.swimBlend), ks);
            tailNodes[i].z = lerp(tailNodes[i].z, lerp(rsZ, swZ, state.swimBlend), ks);
          }
          relaxChain(tailNodes, TAIL_SEG_LEN * sMul);

          const tailSlopeZ = (tailNodes[TAIL_COUNT - 1].z - tailNodes[TAIL_COUNT - 3].z) / Math.max(0.1, sMul);
          state.finPose = tailSlopeZ > 0.65 ? 'up' : (tailSlopeZ < -0.65 ? 'down' : 'mid');

          for (let i = 0; i < TAIL_COUNT; i++) {
            const prev = i > 0 ? tailNodes[i - 1] : tailNodes[0];
            const next = i < TAIL_COUNT - 1 ? tailNodes[i + 1] : tailNodes[TAIL_COUNT - 1];
            const dx = prev.x - next.x, dy = prev.y - next.y;
            tailNodes[i].yaw = Math.hypot(dx, dy) > 0.25 ? Math.atan2(-dx, dy) : state.yaw;
          }

          // =====================================================================
          // 4. 脊柱法向零穿模长发（机身局部坐标实时解算，高速转弯绝对不切肩/不穿背！）
          // =====================================================================
          const sock = getContinuousSockets(state.curPitch);
          const dirY  = Math.sin(state.curPitch);
          const dirZ  = Math.cos(state.curPitch);
          const backY = -Math.cos(state.curPitch);
          const backZ =  Math.sin(state.curPitch);
          const skullY = sock.neckY + lerp(0.8, 1.8, state.swimBlend);
          const skullZ = sock.neckZ + 3.6;
          const rootY  = skullY + backY * 4.4 - dirY * 1.4;
          const rootZ  = skullZ + backZ * 4.4 - dirZ * 0.6;
          const turnSway = clamp(-state.yawRate * 0.42, -1.35, 1.35);

          for (let cIdx = 0; cIdx < hairChains.length; cIdx++) {
            const hc = hairChains[cIdx];
            const [rwx, rwy] = localToWorldXY(state.x, state.y, state.yaw, hc.latX * sMul, rootY * sMul);
            hc.nodes[0].x = rwx; hc.nodes[0].y = rwy; hc.nodes[0].z = hipZ + rootZ * sMul;
            for (let j = 1; j < hc.nodes.length; j++) {
              const sDist  = j * lerp(2.55, 2.95, state.swimBlend);
              const waveB  = Math.sin(state.dolphinPhase - j * 0.68 + cIdx * 0.5) * (0.45 + j * 0.30) * state.swimBlend * flex;
              const dClear = 0.85 + hc.dBias + j * 0.58 + waveB;
              const wSide  = Math.sin(time * 3.8 - j * 0.85 + cIdx * 1.05) * (0.55 + j * 0.38) * flex;
              const lx = hc.latX * (1.0 + j * 0.14) + wSide + turnSway * j * 0.42;
              const ly = rootY - dirY * sDist + backY * dClear;
              const lz = hipZ + (rootZ - dirZ * sDist + backZ * dClear) * sMul;
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, lx * sMul, ly * sMul);
              hc.nodes[j].x = wx;
              hc.nodes[j].y = wy;
              hc.nodes[j].z = Math.max(2.0 * sMul, lz);
            }
          }
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? habitat.waterLevel : 2.6;
          const pitch = state.curPitch;
          const isSwim = state.swimBlend > 0.35;
          const tStep = pickTorsoStep(pitch);
          const sock = getContinuousSockets(pitch);
          const hipZ = state.z + 10.8 * sMul;

          // 按连续倾角平滑选取头与双臂部件（位置全部由连续 sock 驱动，零跳帧！）
          const limbPose = pitch < 0.22 ? 'idle' : (pitch < 0.85 ? 'rise' : (pitch < 1.48 ? 'glide' : 'dive'));

          // 1. 10 节大鳞人鱼尾链
          for (let i = 0; i < TAIL_COUNT; i++) {
            const n = tailNodes[i];
            if (n.z < -3.0 * sMul) continue;
            const key = i <= 2 ? 'tailThick' : (i <= 5 ? 'tailMid' : (i <= 7 ? 'tailSlim' : 'tailTip'));
            list.push({
              partKey: key, asset: parts[key],
              x: n.x, y: n.y, lift: n.z - 3.0 * sMul, ro: n.yaw,
              bias: i <= 1 ? -1.4 : 0,
              submerge: EnvFeedback.calcSubmerge(n.z, waterLvl, 5.2, isWater)
            });
          }

          // 2. 水平双叶扇形尾鳍（上扬/平展/下压三态）
          const tip = tailNodes[TAIL_COUNT - 1];
          const finKey = state.finPose === 'up' ? 'tailFinUp' : (state.finPose === 'down' ? 'tailFinDown' : 'tailFinMid');
          const [finX, finY] = localToWorldXY(tip.x, tip.y, tip.yaw, 0, -2.6 * sMul);
          list.push({
            partKey: finKey, asset: parts[finKey],
            x: finX, y: finY, lift: tip.z - 6.8 * sMul, ro: tip.yaw, bias: 0,
            submerge: EnvFeedback.calcSubmerge(tip.z, waterLvl, 5.4, isWater)
          });

          // 3. 高腰贴身贝壳水裙
          const skKey = isSwim ? 'hipSkirtSwim' : 'hipSkirt';
          const skZ = hipZ - 1.4 * sMul;
          list.push({
            partKey: skKey, asset: parts[skKey],
            x: state.x, y: state.y, lift: skZ, ro: state.yaw, bias: 0.8,
            submerge: EnvFeedback.calcSubmerge(skZ + 4.5 * sMul, waterLvl, 5.0, isWater)
          });

          // 4. 7 档高密俯仰躯干（pivZ 精确锚定腰部 hipZ）
          list.push({
            partKey: tStep.key, asset: parts[tStep.key],
            x: state.x, y: state.y, lift: hipZ - tStep.pivZ * sMul + 1.8 * sMul, ro: state.yaw, bias: 0.45,
            submerge: EnvFeedback.calcSubmerge(hipZ + 4.0 * sMul, waterLvl, 5.0, isWater)
          });

          // 5. 连续颈口坐标驱动头部（零单帧跳动！）
          const headAbsYaw = state.yaw + state.headYaw;
          const [hX, hY] = localToWorldXY(state.x, state.y, state.yaw, 0, sock.neckY * sMul);
          const hZ = hipZ + sock.neckZ * sMul - 1.0 * sMul;
          const hKey = 'head_' + limbPose;
          list.push({ partKey: hKey, asset: parts[hKey], x: hX, y: hY, lift: hZ, ro: headAbsYaw, bias: 0.65 });

          // 6. 3 束零穿模飘动长发（严格沿脊柱背面法向浮起，高速转弯零穿模）
          for (let cIdx = 0; cIdx < hairChains.length; cIdx++) {
            const hc = hairChains[cIdx];
            for (let j = 1; j < hc.nodes.length; j++) {
              const hn = hc.nodes[j];
              const hid = (cIdx === 0 && j === 1) ? 'hairL' : (j === hc.nodes.length - 1 ? 'hairS' : 'hairM');
              list.push({
                partKey: hid, asset: parts[hid],
                x: hn.x, y: hn.y, lift: hn.z - 2.0 * sMul, ro: state.yaw, symDeg: 90, bias: -0.25,
                submerge: EnvFeedback.calcSubmerge(hn.z, waterLvl, 5.0, isWater)
              });
            }
          }

          // 7. 两段式大臂+小臂柔顺连动（零换姿跳变，肘腕 0.80 rad 随动）
          const shZ = hipZ + sock.shZ * sMul;
          const armSpecs = [
            { s: -1, uKey: 'upperArmL', fKey: 'forearmL', uSw: state.uSweepL, fBd: state.fBendL, elZOff: state.elbowZL },
            { s:  1, uKey: 'upperArmR', fKey: 'forearmR', uSw: state.uSweepR, fBd: state.fBendR, elZOff: state.elbowZR }
          ];
          for (let aIdx = 0; aIdx < armSpecs.length; aIdx++) {
            const a = armSpecs[aIdx];
            const [shX, shY] = localToWorldXY(state.x, state.y, state.yaw, a.s * 3.4 * sMul, sock.shY * sMul);
            const uYaw = state.yaw - a.s * a.uSw;
            const fYaw = uYaw - a.s * a.fBd;
            const [elX, elY] = localToWorldXY(shX, shY, uYaw, a.s * 2.5 * sMul, 2.2 * sMul);
            const elZ = shZ - 0.8 * sMul + a.elZOff;
            list.push({ partKey: a.uKey, asset: parts[a.uKey], x: shX, y: shY, lift: shZ - 4.4 * sMul, ro: uYaw, bias: 0.30 });
            list.push({ partKey: a.fKey, asset: parts[a.fKey], x: elX, y: elY, lift: elZ - 4.2 * sMul, ro: fYaw, bias: 0.36 });
          }

          // 8. 正在与人鱼互动的灵动海洋小伙伴
          if (state.critterVis) {
            const cr = CRITTERS[state.critterIdx] || CRITTERS[0];
            list.push({
              partKey: cr.key, asset: parts[cr.key],
              x: state.critterX, y: state.critterY, lift: Math.max(1.0, state.critterZ),
              ro: state.critterYaw, bias: 0,
              submerge: EnvFeedback.calcSubmerge(state.critterZ, waterLvl, 4.5, isWater)
            });
          }

          return list;
        },

        exportManifest(params) {
          const cr = CRITTERS[state.critterIdx] || CRITTERS[0];
          return {
            id: SirenDef.id, name: SirenDef.name, outlineMode: 'actorUnified',
            skin: curSkin.id, weaponless: true, swimStyle: 'smoothFastDolphinPitch',
            curPitch: Number(state.curPitch.toFixed(2)),
            activeCritter: cr.key, activeCritterName: cr.name,
            critterPool: CRITTERS.map(c => ({ id: c.key, name: c.name })),
            footRadius: SirenDef.footRadius, headZ: 34, centerZ: 18,
            blocks: SirenDef.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(SirenDef);
})(window.PixelWorkshop);
