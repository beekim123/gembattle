'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 泽3 · 鹿角翼蛇（M02 沼泽低空盘旋 + 悬停尖啸震波环，+Y 正前）
  //   1. 艳翠绿 + 深紫毒蛇长身（7 节细蛇链复用 3 档胶囊节 + 尖尾梢，零串珠）；
  //   2. 蛇首（闭口 / 张口露毒牙 2 档）头顶一对放大雪白分叉小鹿角，
  //      在沼泽暗绿底色下极其抢眼；
  //   3. 一对宽大绛红暗紫蝙蝠膜翅（三段振翅 + 滑翔，锚定于胸蛇节两侧）；
  //   4. 沼泽低空盘旋滑翔、周期悬停张口发出清晰震波环（空中像素扩张环 + 水面涟漪）；
  //   5. 3 套皮肤、严禁常态 scaleX/scaleY、巡游钳制在 maxRadius * 0.80 内。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 艳翠绿毒蛇主鳞（3 档）
      greenDark:  '#126b36',
      greenMid:   '#28bd57',
      greenHi:    '#74f27e',
      // 深紫毒斑脊纹（3 档）
      purpleDark: '#2b1042',
      purpleMid:  '#57207a',
      purpleHi:   '#8c45b5',
      // 蛇腹淡黄绿（3 档）
      bellyDark:  '#7c8f42',
      bellyMid:   '#b8cf6b',
      bellyHi:    '#e5f2a6',
      // 宽大绛红暗紫蝙蝠膜翅（膜 + 翼骨各 3 档）
      wingDark:   '#4d102a',
      wingMid:    '#8f1f44',
      wingHi:     '#cf4265',
      boneDark:   '#290d24',
      boneMid:    '#4d1b42',
      boneHi:     '#783166',
      // 头顶放大雪白分叉小鹿角（3 档，极强对比）
      antlerDark: '#b8c4cc',
      antlerMid:  '#e8f0f5',
      antlerHi:   '#fcffff',
      // 张口毒牙与深红口腔（3 档）
      mouthDark:  '#590c1c',
      mouthMid:   '#a61c35',
      mouthHi:    '#eb526b',
      // 竖瞳蛇眼（eyeGlint 绝不进 glowKeys）
      eyeDark:    '#0c0912',
      eyeIris:    '#ffcf24',
      eyeGlint:   '#f5fcff'
    },
    glowKeys: [],
    parts: [
      'head', 'scale', 'stripe', 'belly', 'antler', 'fang', 'mouth',
      'eye', 'wingBone', 'wingMem', 'tail'
    ],
    noCrease: [
      ['head', 'stripe'], ['head', 'belly'], ['head', 'antler'], ['head', 'eye'],
      ['head', 'mouth'], ['mouth', 'fang'], ['scale', 'stripe'], ['scale', 'belly'],
      ['wingBone', 'wingMem'], ['scale', 'tail']
    ],
    materials: {
      green:  ['greenDark',  'greenMid',  'greenHi'],
      purple: ['purpleDark', 'purpleMid', 'purpleHi'],
      belly:  ['bellyDark',  'bellyMid',  'bellyHi'],
      wing:   ['wingDark',   'wingMid',   'wingHi'],
      bone:   ['boneDark',   'boneMid',   'boneHi'],
      antler: ['antlerDark', 'antlerMid', 'antlerHi'],
      mouth:  ['mouthDark',  'mouthMid',  'mouthHi']
    },
    protectedParts: ['eye', 'antler', 'fang']
  });

  // 3 套皮肤（0 禁用字，0 重色）
  const SKINS = [
    {
      id: 'emerald_crimson',
      name: '翠鳞绛蝠翼',
      dot: '#28bd57',
      outline: '#0d0814',
      pal: {},
      fx: { ring: '#f2a6ff', ringOut: '#54146b', puff: '#b8f59d' }
    },
    {
      id: 'venom_wine',
      name: '金毒酒红翼',
      dot: '#c9cf2b',
      outline: '#140b08',
      pal: {
        greenDark:  '#666e14', greenMid:  '#b0bd26', greenHi:  '#ebfa5c',
        purpleDark: '#36141a', purpleMid: '#692431', purpleHi: '#a33e50',
        bellyDark:  '#8a7545', bellyMid:  '#c7b075', bellyHi:  '#f2e2b3',
        wingDark:   '#470f16', wingMid:   '#851c27', wingHi:   '#c73c46',
        boneDark:   '#260c10', boneMid:   '#4a1920', boneHi:   '#752d36',
        antlerDark: '#cfc4b2', antlerMid: '#f2ebdc', antlerHi: '#fffcf5',
        eyeIris:    '#ff5233'
      },
      fx: { ring: '#ffe07d', ringOut: '#782610', puff: '#ebfa5c' }
    },
    {
      id: 'teal_violet',
      name: '青毒暗紫翼',
      dot: '#26b8a8',
      outline: '#081017',
      pal: {
        greenDark:  '#0f5e59', greenMid:  '#1ea89c', greenHi:  '#63ebd9',
        purpleDark: '#201247', purpleMid: '#432785', purpleHi: '#7452c2',
        bellyDark:  '#668f8b', bellyMid:  '#9cc9c4', bellyHi:  '#d4f2ee',
        wingDark:   '#38124a', wingMid:   '#6c248c', wingHi:   '#a84dc9',
        boneDark:   '#1e0c2b', boneMid:   '#3b1854', boneHi:   '#622d87',
        antlerDark: '#bfd0db', antlerMid: '#e6f2fa', antlerHi: '#f7fcff',
        eyeIris:    '#ffe847'
      },
      fx: { ring: '#99f5ff', ringOut: '#2c186e', puff: '#7df5e6' }
    }
  ];

  // =========================================================================
  // 1. 毒蛇首 + 放大雪白分叉小鹿角（16×18×16，2 档：calm 闭口 / shriek 张口毒牙）
  //    枢轴锁后颈 (0, -3.4)
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -3.4 };
  function buildSnakeHead(makeCanvas, openMouth) {
    const W = 16, D = 18, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 毒蛇三角形阔颅（艳翠绿 + 头顶深紫菱斑）
    m.fillAABB(-5.0, 5.0, -4.5, 6.8, 2, 10, (x, y, z, X, Y) => {
      const t = clamp((Y + 4.0) / 10.5, 0, 1);
      const halfW = lerp(3.4, 1.9, t) + Math.sin(t * Math.PI) * 1.1;
      const topZ = openMouth ? lerp(7.8, 8.6, t) : lerp(7.4, 6.8, t);
      const botZ = openMouth ? lerp(4.4, 5.6, t) : lerp(3.4, 3.8, t);
      if (Math.abs(X) > halfW || z < botZ || z > topZ) return;
      const edge = Math.pow(Math.abs(X) / halfW, 2.2) + Math.pow((z - (topZ + botZ) * 0.5) / Math.max(0.8, (topZ - botZ) * 0.55), 2.2);
      if (edge > 1.12) return;

      const isDiamond = z >= topZ - 1.1 && Math.abs(X) < 1.8 && Y > -2.0 && Y < 3.6;
      const isBelly = !openMouth && z <= botZ + 0.9;
      if (isBelly) m.setRaw(x, y, z, mat('belly'), partId.belly);
      else if (isDiamond) m.setRaw(x, y, z, mat('purple'), partId.stripe);
      else m.setRaw(x, y, z, mat('green'), partId.head);
    });

    if (openMouth) {
      // 张大下颌 + 深红口腔 + 一对雪白毒牙
      m.paintCapsule(0, -1.2, 4.0, 0, 5.6, 1.8, 2.2, 1.35, mat('belly'), partId.belly, true);
      m.paintEllipsoid(0, 2.8, 4.4, 1.75, 2.6, 1.45, mat('mouth'), partId.mouth, true);
      for (const s of [-1, 1]) {
        m.paintCapsule(s * 1.35, 4.8, 5.6, s * 1.25, 5.1, 3.5, 0.52, 0.36, mat('antler'), partId.fang, true);
      }
    }

    // 头顶一对放大雪白分叉小鹿角（俯视 ×4 一眼认出鹿角！）
    for (const s of [-1, 1]) {
      // 主干向上外展
      m.paintCapsule(s * 1.6, -0.6, 7.6, s * 3.8, -1.8, 11.4, 1.05, 0.82, mat('antler'), partId.antler, true);
      m.paintCapsule(s * 3.8, -1.8, 11.4, s * 5.6, -2.6, 14.5, 0.80, 0.55, mat('antler'), partId.antler, true);
      // 清晰前叉
      m.paintCapsule(s * 3.2, -1.4, 10.6, s * 4.2, 1.4, 13.8, 0.72, 0.48, mat('antler'), partId.antler, true);
      // 清晰内侧小叉
      m.paintCapsule(s * 4.6, -2.2, 12.8, s * 2.8, -3.2, 14.8, 0.65, 0.45, mat('antler'), partId.antler, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 金色毒蛇眼
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.4);
    const eyeZ = openMouth ? 7 : 6;
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 5; step++) {
        const tx = Math.round(hw + s * (4.6 - step));
        if (m.getPartId(tx, eyeY, eyeZ) === partId.head) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 2.9);
      for (const dy of [0, 1]) for (const dz of [0, 1]) {
        const kId = (dz === 1 && dy === 1) ? keyToId.eyeGlint : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
        m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 15, centerZ: 7 });
  }

  // =========================================================================
  // 2. 细长毒蛇身节（3 档共享复用 + 尖尾梢，艳翠绿 + 深紫环斑）
  // =========================================================================
  function buildSnakeSeg(makeCanvas, rx, rz, halfLenY) {
    const W = Math.ceil(rx * 2 + 4);
    const D = Math.ceil((halfLenY + rx * 0.6) * 2 + 4);
    const H = Math.ceil(rz * 2 + 4);
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const cz = rz + 1.0;

    m.fillAABB(-rx - 0.8, rx + 0.8, -halfLenY - rx, halfLenY + rx, 0, H - 1, (x, y, z, X, Y) => {
      const cy = clamp(Y, -halfLenY * 0.55, halfLenY * 0.55);
      const d2 = (X / rx) ** 2 + ((Y - cy) / (rx * 0.92)) ** 2 + ((z - cz) / rz) ** 2;
      if (d2 > 1.0) return;

      const isBelly = z <= cz - rz * 0.35 && Math.abs(X) <= rx * 0.8;
      const isStripe = z >= cz + rz * 0.25 && Math.abs(Y) < halfLenY * 0.45 && Math.abs(X) < rx * 0.78;
      if (isBelly) m.setRaw(x, y, z, mat('belly'), partId.belly);
      else if (isStripe) m.setRaw(x, y, z, mat('purple'), partId.stripe);
      else m.setRaw(x, y, z, mat('green'), partId.scale);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: rx + 0.8 });
  }

  function buildSnakeTailTip(makeCanvas) {
    const m = new VoxelModel(6, 12, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 4.0, 2.8, 0, -4.6, 2.6, 1.55, 0.55, mat('green'), partId.tail, true);
    m.paintCapsule(0, 1.5, 3.4, 0, -2.4, 3.2, 0.85, 0.45, mat('purple'), partId.stripe, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5 });
  }

  // =========================================================================
  // 3. 宽大绛红暗紫蝙蝠膜翅（24×20×18，up / mid / down / glide）
  // =========================================================================
  const WING_PIVOT = { x: 9.2, y: 3.0 };
  function paintWingQuad(m, p00, p10, p11, p01, halfThick, val, partId, scallop = 1.2) {
    const pts = [p00, p10, p11, p01];
    let x0 = 999, x1 = -999, y0 = 999, y1 = -999, z0 = 999, z1 = -999;
    for (const p of pts) {
      if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0];
      if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1];
      if (p[2] < z0) z0 = p[2]; if (p[2] > z1) z1 = p[2];
    }
    const pad = halfThick + 1.0, ux = p10[0] - p00[0], uSign = ux >= 0 ? 1 : -1;
    const spanX = Math.max(0.5, Math.abs(ux));
    m.fillAABB(x0 - 0.6, x1 + 0.6, y0 - 0.8, y1 + 0.8, z0 - pad, z1 + pad, (x, y, z, X, Y) => {
      const i = m.idx(x, y, z);
      if (m.grid[i]) return;
      const u = clamp(uSign > 0 ? (X - p00[0]) / spanX : (p00[0] - X) / spanX, 0, 1);
      const ly = lerp(p00[1], p10[1], u), lz = lerp(p00[2], p10[2], u);
      const ty = lerp(p01[1], p11[1], u) + scallop * Math.sin(u * Math.PI), tz = lerp(p01[2], p11[2], u);
      if (Y < Math.min(ly, ty) - 0.35 || Y > Math.max(ly, ty) + 0.35) return;
      const v = clamp((ly - Y) / Math.max(0.5, ly - ty), 0, 1);
      if (Math.abs(z - lerp(lz, tz, v)) <= halfThick) { m.grid[i] = val; m.parts[i] = partId; }
    });
  }

  function buildBatWing(makeCanvas, side, pose) {
    const W = 24, D = 20, H = 18;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const s = side, rx = -s * WING_PIVOT.x, ry = WING_PIVOT.y, rz = 8.4;
    const flap = pose === 'up' ? 0.88 : (pose === 'down' ? -0.82 : (pose === 'glide' ? 0.14 : 0.04));

    const pRoot  = [rx, ry, rz];
    const pWrist = [rx + s * 8.4,  ry + 2.8, rz + 2.2 + flap * 2.6];
    const pTip   = [rx + s * 18.4, ry - 0.6, rz + 1.0 + flap * 5.2];
    const pTRoot = [rx,            ry - 7.8, rz - 1.6];
    const pTRib2 = [rx + s * 6.8,  ry - 10.4, pWrist[2] - 3.6];
    const pTRib1 = [rx + s * 13.4, ry - 8.2,  lerp(pWrist[2], pTip[2], 0.5) - 2.6];
    const pTBack = [rx + s * 18.0, ry - 2.6,  pTip[2] - 0.8];

    paintWingQuad(m, pRoot,  pWrist, pTRib2, pTRoot, 1.05, mat('wing'), partId.wingMem, 1.4);
    paintWingQuad(m, pWrist, pTRib1, pTRib1, pTRib2, 1.02, mat('wing'), partId.wingMem, 1.5);
    paintWingQuad(m, pWrist, pTip,   pTBack, pTRib1, 1.00, mat('wing'), partId.wingMem, 1.6);

    // 暗紫蝙蝠翼骨 + 腕爪
    m.paintEllipsoid(rx, ry - 0.4, rz, 1.6, 1.6, 1.4, mat('bone'), partId.wingBone, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pWrist[0], pWrist[1], pWrist[2], 1.45, 1.15, mat('bone'), partId.wingBone, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pTip[0], pTip[1], pTip[2], 1.15, 0.78, mat('bone'), partId.wingBone, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pTRib2[0], pTRib2[1], pTRib2[2], 0.88, 0.62, mat('bone'), partId.wingBone, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pTRib1[0], pTRib1[1], pTRib1[2], 0.88, 0.62, mat('bone'), partId.wingBone, true);
    // 雪白腕小钩爪
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pWrist[0] + s * 0.8, pWrist[1] + 2.2, pWrist[2] + 1.2, 0.72, 0.45, mat('antler'), partId.antler, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.0, headZ: 16, centerZ: 8 });
  }

  // =========================================================================
  // 4. 生物定义与状态机
  // =========================================================================
  const NUM_NODES = 8; // 0: 颈根, 1..6: 6 节毒蛇身, 7: 尖尾梢
  const SEG_LEN = 3.5;

  const Marsh3Def = {
    id: 'marsh3_peuchen',
    code: '泽3',
    status: 'done',
    name: '鹿角翼蛇',
    tag: 'M02 蝙蝠翼蛇 · 低空盘旋尖啸震波',
    summary: '艳翠绿深紫细长毒蛇身（7 节蛇链）配宽大绛红暗紫蝙蝠膜翅与头顶放大雪白分叉小鹿角；沼泽低空盘旋滑翔，偶发悬停张口发出清晰震波环',
    defaultHabitat: 'swamp',
    footRadius: 10.5,
    ecoWeight: 1.25,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '沼泽低空盘旋', loop: true, status: 'done' },
      { id: 'idle',   name: '低空悬停盘尾', loop: true, status: 'done' },
      { id: 'shriek', name: '悬停尖啸震波', loop: false, duration: 2.4, status: 'done' }
    ],
    blocks: [
      '放大雪白分叉小鹿角与可张口毒牙蛇首',
      '7 节艳翠绿深紫细蛇链（共享 3 档胶囊）',
      '一对宽大绛红暗紫蝙蝠膜翅三段振翅',
      '周期悬停张口释放清晰多层震波环'
    ],
    soulHabit: '在沼泽泥潭低空拍翅盘旋滑翔，细长蛇尾在空中拉出 S 形弧线，周期性悬停昂首张口发出清晰扩张的尖啸震波环，随后俯冲贴水掠过',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        headCalm:    buildSnakeHead(makeCanvas, false),
        headShriek:  buildSnakeHead(makeCanvas, true),
        segFront:    buildSnakeSeg(makeCanvas, 2.5, 2.3, 3.1),
        segMid:      buildSnakeSeg(makeCanvas, 2.1, 2.0, 3.0),
        segThin:     buildSnakeSeg(makeCanvas, 1.6, 1.5, 2.8),
        tailTip:     buildSnakeTailTip(makeCanvas),
        wingL_up:    buildBatWing(makeCanvas, -1, 'up'),
        wingR_up:    buildBatWing(makeCanvas,  1, 'up'),
        wingL_mid:   buildBatWing(makeCanvas, -1, 'mid'),
        wingR_mid:   buildBatWing(makeCanvas,  1, 'mid'),
        wingL_dn:    buildBatWing(makeCanvas, -1, 'down'),
        wingR_dn:    buildBatWing(makeCanvas,  1, 'down'),
        wingL_glide: buildBatWing(makeCanvas, -1, 'glide'),
        wingR_glide: buildBatWing(makeCanvas,  1, 'glide')
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.4;
      const seed = opts.seed ?? 73;

      const chain = new ChainSolver(NUM_NODES, SEG_LEN, {
        maxAngle: 0.50,
        waveFreq: 4.4,
        wavePhaseStep: 0.56,
        waveAmp: 0.34
      });

      const headLookSpring = new SpringDamper1D(0, 90, 6.6);
      const sockets = new SocketTracker();

      const state = {
        x: hx0, y: hy0, z: 12.5,
        vx: 0, vy: 0, yaw: hyaw0,
        headX: hx0, headY: hy0 + 4, headZ: 13.0,
        orbitAng: seed * 0.21,
        wingPhase: 0,
        wingPose: 'mid',
        wingSweep: 0,
        flapLift: 0,
        isShrieking: false,
        autoShriekCd: 4.6,
        autoShriekT: 0,
        ringList: [], // 空中扩张震波环 { x, y, z, r, maxR, t, life }
        ringEmitCd: 0
      };

      let curSkin = SKINS[0];

      function spawnShriekRing(vfx, sMul) {
        const [mx, my] = localToWorldXY(state.headX, state.headY, state.yaw, 0, 8.2 * sMul);
        const mz = state.headZ + 2.0 * sMul;
        state.ringList.push({ x: mx, y: my, z: mz, r: 2.5 * sMul, maxR: 20.0 * sMul, t: 0, life: 0.78 });
        if (state.ringList.length > 6) state.ringList.shift();
        if (vfx) {
          vfx.addRipple(mx, my, 3.0 * sMul, 22.0 * sMul, 0.82, 2.0);
          const fx = curSkin.fx || SKINS[0].fx;
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * TAU;
            vfx.spawnParticle(
              mx + Math.cos(a) * 3.0 * sMul,
              my + Math.sin(a) * 3.0 * sMul,
              mz,
              Math.cos(a) * 18 * sMul,
              Math.sin(a) * 18 * sMul,
              (Math.random() - 0.5) * 4 * sMul,
              0.46, 1.35, fx.ring, true, 0
            );
          }
        }
      }

      const instance = {
        def: Marsh3Def,
        cachePrefix: `marsh3_peu_${Math.random().toString(36).slice(2, 7)}`,
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
          state.x = homeX; state.y = homeY; state.z = 12.5;
          state.vx = 0; state.vy = 0; state.yaw = homeYaw ?? 0.4;
          state.headX = homeX; state.headY = homeY + 4; state.headZ = 13.0;
          state.wingPhase = 0; state.wingPose = 'mid';
          state.wingSweep = 0; state.flapLift = 0;
          state.isShrieking = false;
          state.autoShriekCd = 4.2; state.autoShriekT = 0;
          state.ringList.length = 0;
          headLookSpring.x = headLookSpring.v = 0;
          chain.reset(state.headX, state.headY, state.headZ, state.yaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex  = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp    = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);

          const action = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const homeYaw = (eco && eco.homeYaw) ?? 0.4;
          const maxR = (eco && eco.maxRadius) || 46;
          const limitR = maxR * 0.78;

          const prevX = state.headX, prevY = state.headY;
          let forcePose = null;
          let sweepTgt = 0;
          let flapLiftTgt = 0;
          let shriekActive = false;

          if (action === 'shriek') {
            shriekActive = true;
            const kHold = expSmooth(dt, 4.8);
            state.headX = lerp(state.headX, homeX, kHold);
            state.headY = lerp(state.headY, homeY, kHold);
            state.headZ = lerp(state.headZ, 15.0 * sMul, expSmooth(dt, 5.5));
            state.wingPhase += dt * gFreq * 9.2;
            sweepTgt = Math.sin(state.wingPhase) * 0.34;
            flapLiftTgt = Math.sin(state.wingPhase - 0.8) * 0.85 * sMul;
          } else if (action === 'idle') {
            const tx = homeX + Math.sin(time * 0.8 + seed) * 3.8 * sMul;
            const ty = homeY + Math.cos(time * 0.7 + seed) * 3.2 * sMul;
            state.headX = lerp(state.headX, tx, expSmooth(dt, 3.6));
            state.headY = lerp(state.headY, ty, expSmooth(dt, 3.6));
            state.headZ = lerp(state.headZ, (12.6 + Math.sin(time * 1.3) * 1.4) * sMul, expSmooth(dt, 4.5));
            const aimYaw = homeYaw + Math.sin(time * 0.65) * 0.32;
            state.yaw = wrapAngle(state.yaw + wrapAngle(aimYaw - state.yaw) * expSmooth(dt, 3.4));
            state.wingPhase += dt * gFreq * 7.2;
            sweepTgt = Math.sin(state.wingPhase) * 0.28;
            flapLiftTgt = Math.sin(state.wingPhase - 0.8) * 0.75 * sMul;
          } else {
            // 巡游态：低空盘旋滑翔 + 周期短暂悬停尖啸震波
            state.autoShriekCd -= dt;
            if (state.autoShriekCd <= 0) {
              state.autoShriekCd = 6.2 + Math.random() * 2.2;
              state.autoShriekT = 1.65;
            }
            if (state.autoShriekT > 0) {
              state.autoShriekT = Math.max(0, state.autoShriekT - dt);
              shriekActive = true;
              state.headZ = lerp(state.headZ, 14.8 * sMul, expSmooth(dt, 5.5));
              state.wingPhase += dt * gFreq * 9.0;
              sweepTgt = Math.sin(state.wingPhase) * 0.32;
              flapLiftTgt = Math.sin(state.wingPhase - 0.8) * 0.85 * sMul;
            } else {
              state.orbitAng = wrapAngle(state.orbitAng + dt * 0.72 * spdMul);
              const rA = Math.min(26.5, limitR * 0.88);
              const rB = Math.min(21.0, limitR * 0.72);
              const tx = homeX + Math.sin(state.orbitAng) * rA + ((eco && eco.avoidX) || 0) * 0.3;
              const ty = homeY + Math.sin(state.orbitAng * 2.0) * (rB * 0.58) + Math.cos(state.orbitAng) * (rB * 0.45) + ((eco && eco.avoidY) || 0) * 0.3;

              const dx = tx - state.headX, dy = ty - state.headY;
              const desiredYaw = Math.atan2(-dx, dy);
              state.yaw = wrapAngle(state.yaw + wrapAngle(desiredYaw - state.yaw) * expSmooth(dt, 4.4));
              const kPos = expSmooth(dt, 3.0 * spdMul);
              state.headX = lerp(state.headX, tx, kPos);
              state.headY = lerp(state.headY, ty, kPos);

              // 低空俯冲贴水 -> 拉升滑翔
              const swoop = Math.sin(state.orbitAng * 2.0);
              const targetZ = (11.5 + swoop * 3.4) * sMul;
              state.headZ = lerp(state.headZ, targetZ, expSmooth(dt, 3.8));

              const isGlide = swoop < -0.25;
              if (isGlide) {
                forcePose = 'glide';
                sweepTgt = -0.20;
                flapLiftTgt = 0;
                state.wingPhase += dt * gFreq * 1.6;
              } else {
                state.wingPhase += dt * gFreq * 7.2;
                sweepTgt = Math.sin(state.wingPhase) * 0.30;
                flapLiftTgt = Math.sin(state.wingPhase - 0.8) * 0.8 * sMul;
              }
            }
          }

          // 严格钳制头部在 limitR 内
          const dH = Math.hypot(state.headX, state.headY);
          if (dH > limitR && dH > 0.001) {
            state.headX *= limitR / dH;
            state.headY *= limitR / dH;
          }

          state.isShrieking = shriekActive;
          if (shriekActive) {
            state.ringEmitCd -= dt;
            if (state.ringEmitCd <= 0) {
              state.ringEmitCd = 0.48;
              spawnShriekRing(vfx, sMul);
            }
          } else {
            state.ringEmitCd = 0.05;
          }

          // 更新空中震波环
          for (let i = state.ringList.length - 1; i >= 0; i--) {
            const rg = state.ringList[i];
            rg.t += dt;
            const u = clamp(rg.t / rg.life, 0, 1);
            rg.r = lerp(2.5 * sMul, rg.maxR, smoothstep(0, 1, u));
            if (rg.t >= rg.life) state.ringList.splice(i, 1);
          }

          state.wingSweep = lerp(state.wingSweep, sweepTgt, expSmooth(dt, 13.0));
          state.flapLift = lerp(state.flapLift, flapLiftTgt, expSmooth(dt, 11.0));
          const wbVal = Math.sin(state.wingPhase);
          state.wingPose = forcePose || (wbVal > 0.30 ? 'up' : (wbVal < -0.30 ? 'down' : 'mid'));

          // 7 节细蛇链物理求解（悬停时蛇尾柔和下垂摆动，滑翔时拉直微飘）
          const curZ = Math.max(2.0, state.headZ + state.flapLift);
          chain.update(dt, state.headX, state.headY, curZ, state.yaw, time, {
            segLen: SEG_LEN * sMul,
            flexibility: flex,
            maxAngle: 0.48,
            waveFreq: (shriekActive ? 5.6 : 4.2) * gFreq,
            waveAmp: (shriekActive ? 0.38 : 0.28) * flex,
            wavePhaseStep: 0.56,
            restAlign: 0.08,
            zFollowSpeed: 9.0,
            zTargetFn: (u, i, t) => {
              const droop = shriekActive ? -u * 5.2 : -u * 2.2;
              const wave = Math.sin(t * 4.0 * gFreq - i * 0.55) * 1.15;
              return Math.max(2.2 * sMul, curZ + (droop + wave) * sMul);
            }
          });

          const safeDt = Math.max(dt, 0.001);
          state.vx = (state.headX - prevX) / safeDt;
          state.vy = (state.headY - prevY) / safeDt;
          state.x = chain.nodes[2].x;
          state.y = chain.nodes[2].y;
          state.z = chain.nodes[2].z;
          // 确保本体中心也在 maxR * 0.80 内
          const dC = Math.hypot(state.x, state.y);
          if (dC > limitR && dC > 0.001) {
            state.x *= limitR / dC;
            state.y *= limitR / dC;
          }

          headLookSpring.update(dt, Math.sin(time * 1.8 + seed) * (shriekActive ? 0.14 : 0.32), 86 * sp, 6.6);
          sockets.setLocal('mouth', state.headX, state.headY, curZ, state.yaw, 0, 7.5, 2.0, sMul);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const nodes = chain.nodes;
          const fx = curSkin.fx || SKINS[0].fx;

          // 1. 蛇身 6 节（复用 3 档胶囊）+ 尾梢
          for (let i = 1; i < NUM_NODES - 1; i++) {
            const nd = nodes[i];
            const pk = i <= 2 ? 'segFront' : (i <= 4 ? 'segMid' : 'segThin');
            list.push({
              partKey: pk,
              asset: parts[pk],
              x: nd.x,
              y: nd.y,
              lift: Math.max(1.2, nd.z - 2.0 * sMul),
              ro: nd.yaw,
              bias: 0.12 - i * 0.02
            });
          }
          const last = nodes[NUM_NODES - 1];
          list.push({
            partKey: 'tailTip',
            asset: parts.tailTip,
            x: last.x,
            y: last.y,
            lift: Math.max(1.0, last.z - 1.6 * sMul),
            ro: last.yaw,
            bias: -0.25
          });

          // 2. 宽大绛红暗紫蝙蝠膜翅（锚定在第 1 节胸蛇节点两侧）
          const wingNode = nodes[1];
          const wp = state.wingPose === 'glide'
            ? 'glide'
            : (state.wingPose === 'down' ? 'dn' : (state.wingPose === 'mid' ? 'mid' : 'up'));
          for (const s of [-1, 1]) {
            const [shX, shY] = localToWorldXY(wingNode.x, wingNode.y, wingNode.yaw, s * 2.2 * sMul, 0.8 * sMul);
            const wYaw = wrapAngle(wingNode.yaw - s * state.wingSweep);
            const [wx, wy] = localToWorldXY(shX, shY, wYaw, s * WING_PIVOT.x * sMul, -WING_PIVOT.y * sMul);
            const key = (s < 0 ? 'wingL_' : 'wingR_') + wp;
            list.push({
              partKey: key,
              asset: parts[key],
              x: wx,
              y: wy,
              lift: Math.max(1.5, wingNode.z - 4.8 * sMul),
              ro: wYaw,
              bias: -0.06
            });
          }

          // 3. 毒蛇首 + 放大雪白分叉小鹿角
          const hYaw = wrapAngle(nodes[0].yaw + clamp(headLookSpring.x, -0.45, 0.45));
          const [hx, hy] = pivotToWorldXY(nodes[0].x, nodes[0].y, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const hKey = state.isShrieking ? 'headShriek' : 'headCalm';
          list.push({
            partKey: hKey,
            asset: parts[hKey],
            x: hx,
            y: hy,
            lift: Math.max(1.5, nodes[0].z - 3.6 * sMul),
            ro: hYaw,
            bias: 0.58
          });

          // 4. 悬停尖啸时的清晰空中扩张震波环（10 段闭合像素折线）
          for (let ri = 0; ri < state.ringList.length; ri++) {
            const rg = state.ringList[ri];
            const u = clamp(rg.t / rg.life, 0, 1);
            const alpha = (1 - u) * 0.92;
            if (alpha < 0.08) continue;
            const segs = 10;
            for (let k = 0; k < segs; k++) {
              const a0 = (k / segs) * TAU;
              const a1 = ((k + 1) / segs) * TAU;
              list.push({
                kind: 'line',
                x0: rg.x + Math.cos(a0) * rg.r,
                y0: rg.y + Math.sin(a0) * rg.r,
                z0: rg.z,
                x1: rg.x + Math.cos(a1) * rg.r,
                y1: rg.y + Math.sin(a1) * rg.r,
                z1: rg.z,
                widthArtPx: 1,
                color: fx.ring,
                outlineColor: fx.ringOut,
                opacity: alpha,
                segments: 2,
                bias: 0.92
              });
            }
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Marsh3Def.id,
            code: Marsh3Def.code,
            status: Marsh3Def.status,
            name: Marsh3Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            wingPose: state.wingPose,
            isShrieking: state.isShrieking,
            segmentCount: NUM_NODES,
            footRadius: Marsh3Def.footRadius,
            headZ: 18,
            centerZ: 11,
            blocks: Marsh3Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Marsh3Def);
})(window.PixelWorkshop);
