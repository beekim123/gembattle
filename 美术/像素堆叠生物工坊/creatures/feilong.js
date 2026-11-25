'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { clamp, lerp, smin, localToWorldXY, expSmooth } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 赤焰飞龙 · 高清锐利 + 丝滑翱翔双形态自动循环变身版（+Y 正前，z=0 贴地）
  // 重点修复“一上一下弹跳感”：
  //   1. 彻底解耦「飞行巡航轨迹」与「翅膀拍打频率」：
  //      飞行水平/缓升高度由 Propulsion.windDrift（慢速气流起伏）平滑驱动，
  //      绝不再把高频 wingFlap 脉冲叠进 state.z 导致乒乓球式上下弹跳！
  //   2. 翅膀独立 wingPhase 高频三段拍击 + 温和的 0.85rad 滞后升力微托（±0.7~1.0格），
  //      既能看清下拍托举质感，整体飞行又如大型飞禽般稳健丝滑。
  //   3. 保留 ChainSolver 真拖拽长鞭尾、双形态落地循环变身与 5 套联动换色。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      scaleDark:   '#7a1c1a',
      scaleMid:    '#c83a24',
      scaleHi:     '#f06834',
      armorDark:   '#4a1216',
      armorMid:    '#8c2220',
      armorHi:     '#c4422c',
      bellyDark:   '#a8875a',
      bellyMid:    '#e2c99a',
      bellyHi:     '#f7ead0',
      wingDark:    '#9e3b24',
      wingMid:     '#df6b38',
      wingHi:      '#f7a05c',
      hornDark:    '#362724',
      hornMid:     '#6b5348',
      hornHi:      '#b09886',
      eyeDark:     '#120e16',
      eyeIris:     '#f5be3b',
      eyeGlint:    '#f7fbff',
      emissiveMid: '#ff521b',
      emissiveHot: '#ffaa2b',
      emissiveCore:'#fff6c7'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'body', 'belly', 'neck', 'head', 'snout', 'jaw',
      'eye', 'horn', 'spine', 'leg', 'claw', 'tail', 'tailBarb',
      'wingBone', 'wingMem', 'mouthCore', 'chestCore'
    ],
    noCrease: [
      ['eye', 'head'], ['eye', 'snout'],
      ['mouthCore', 'jaw'], ['mouthCore', 'snout'],
      ['chestCore', 'body'], ['chestCore', 'belly'], ['chestCore', 'neck'],
      ['head', 'neck'], ['body', 'neck'], ['body', 'tail']
    ],
    materials: {
      scale: ['scaleDark', 'scaleMid', 'scaleHi'],
      armor: ['armorDark', 'armorMid', 'armorHi'],
      belly: ['bellyDark', 'bellyMid', 'bellyHi'],
      wing:  ['wingDark',  'wingMid',  'wingHi'],
      horn:  ['hornDark',  'hornMid',  'hornHi']
    },
    protectedParts: ['eye', 'mouthCore', 'chestCore']
  });

  const SKINS = [
    {
      id: 'crimson', name: '赤焰红', dot: '#e84c28', outline: '#120b10', pal: {},
      fx: { core: '#fff6c7', hot: '#ffaa2b', mid: '#ff521b' }
    },
    {
      id: 'frost', name: '寒霜冰蓝', dot: '#48b8f0', outline: '#0b1422',
      pal: {
        scaleDark: '#1b4978', scaleMid: '#3486c2', scaleHi: '#74c8f5',
        armorDark: '#13274f', armorMid: '#244b8a', armorHi: '#4a7ec4',
        bellyDark: '#8baac4', bellyMid: '#c6e2f5', bellyHi: '#eaf7ff',
        wingDark:  '#3f84a8', wingMid:  '#6ec4e3', wingHi:  '#b4ecff',
        hornDark:  '#3b4859', hornMid:  '#72859c', hornHi:  '#b6cadb',
        eyeIris:   '#4cf2ff',
        emissiveMid: '#24b4ff', emissiveHot: '#7cf0ff', emissiveCore: '#e8feff'
      },
      fx: { core: '#e8feff', hot: '#7cf0ff', mid: '#24b4ff' }
    },
    {
      id: 'venom', name: '剧毒翠绿', dot: '#5cd645', outline: '#0c1a10',
      pal: {
        scaleDark: '#1b5e2d', scaleMid: '#37a64a', scaleHi: '#7be060',
        armorDark: '#143b24', armorMid: '#246638', armorHi: '#429650',
        bellyDark: '#9c9b5a', bellyMid: '#d9db8c', bellyHi: '#f3f5be',
        wingDark:  '#5b8a24', wingMid:  '#98cc3b', wingHi:  '#ccf266',
        hornDark:  '#3d3023', hornMid:  '#735c42', hornHi:  '#ad9472',
        eyeIris:   '#ffe23b',
        emissiveMid: '#48e639', emissiveHot: '#b7ff42', emissiveCore: '#f0ffd1'
      },
      fx: { core: '#f0ffd1', hot: '#b7ff42', mid: '#48e639' }
    },
    {
      id: 'thunder', name: '雷电紫金', dot: '#9b66f2', outline: '#120b20',
      pal: {
        scaleDark: '#362375', scaleMid: '#6845c4', scaleHi: '#a47cf5',
        armorDark: '#21144a', armorMid: '#432785', armorHi: '#724bc2',
        bellyDark: '#7b7494', bellyMid: '#b7b0cf', bellyHi: '#e2ddf2',
        wingDark:  '#6942a8', wingMid:  '#9c6ee3', wingHi:  '#cda8ff',
        hornDark:  '#59421c', hornMid:  '#9e7832', hornHi:  '#e0b85c',
        eyeIris:   '#ffdd47',
        emissiveMid: '#a84cff', emissiveHot: '#ffd24a', emissiveCore: '#fff9d6'
      },
      fx: { core: '#fff9d6', hot: '#ffd24a', mid: '#a84cff' }
    },
    {
      id: 'obsidian', name: '黑曜熔金', dot: '#f0a629', outline: '#0c0b10',
      pal: {
        scaleDark: '#23252e', scaleMid: '#3d414f', scaleHi: '#6b7285',
        armorDark: '#161820', armorMid: '#2a2e3a', armorHi: '#52586b',
        bellyDark: '#3f4552', bellyMid: '#646d7d', bellyHi: '#939eb0',
        wingDark:  '#6e3214', wingMid:  '#b55d1c', wingHi:  '#eb9a38',
        hornDark:  '#20242d', hornMid:  '#464e5e', hornHi:  '#7e889c',
        eyeIris:   '#ff3b30',
        emissiveMid: '#e83814', emissiveHot: '#ffc23d', emissiveCore: '#fffce0'
      },
      fx: { core: '#fffce0', hot: '#ffc23d', mid: '#e83814' }
    }
  ];

  function smoothstep(e0, e1, x) {
    const t = clamp((x - e0) / (e1 - e0 || 1e-6), 0, 1);
    return t * t * (3 - 2 * t);
  }

  function paintWingQuad(m, p00, p10, p11, p01, halfThick, val, partId, scallop = 0, overwrite = false) {
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
      if (!overwrite && m.grid[i]) return;
      const u = clamp(uSign > 0 ? (X - p00[0]) / spanX : (p00[0] - X) / spanX, 0, 1);
      const ly = lerp(p00[1], p10[1], u), lz = lerp(p00[2], p10[2], u);
      const ty = lerp(p01[1], p11[1], u) + scallop * Math.sin(u * Math.PI), tz = lerp(p01[2], p11[2], u);
      if (Y < Math.min(ly, ty) - 0.35 || Y > Math.max(ly, ty) + 0.35) return;
      const v = clamp((ly - Y) / Math.max(0.5, ly - ty), 0, 1);
      if (Math.abs(z - lerp(lz, tz, v)) <= halfThick) { m.grid[i] = val; m.parts[i] = partId; }
    });
  }

  // =========================================================================
  // 一、幼年飞龙精制部件
  // =========================================================================
  function buildYoungTorso(makeCanvas) {
    const m = new VoxelModel(14, 16, 17, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-5.6, 5.6, -6.8, 6.2, 1.5, 16.0, (x, y, z, X, Y) => {
      const dBody = (Math.hypot(X / 5.1, (Y + 1.0) / 5.5, (z - 8.2) / 4.8) - 1) * 4.8;
      const dNeck = (Math.hypot(X / 3.1, (Y - 4.2) / 3.0, (z - 13.0) / 2.8) - 1) * 2.8;
      if (smin(dBody, dNeck, 1.5) <= 0) {
        const isBelly = z < 7.0 && Math.abs(X) < 3.6 && Y > -4.2;
        m.setRaw(x, y, z, isBelly ? mat('belly') : mat('scale'), isBelly ? partId.belly : partId.body);
      }
    });
    for (const sp of [[0,1.8,13.2,1.25],[0,-1.0,13.4,1.3],[0,-3.8,12.6,1.2],[0,-6.0,11.2,1.1]]) {
      m.paintEllipsoid(sp[0], sp[1], sp[2], sp[3] * 0.85, sp[3], sp[3] * 1.05, mat('horn'), partId.spine, true);
    }
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 3.6, -2.5, 5.2, s * 4.4, -2.2, 1.8, 1.65, 1.3, mat('scale'), partId.leg, true);
      m.paintEllipsoid(s * 4.4, -1.0, 1.2, 1.35, 1.6, 1.05, mat('horn'), partId.claw, true);
    }
    m.despeckle(); m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.5 });
  }

  function buildYoungHead(makeCanvas) {
    const W = 13, D = 18, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hz = 5.6, hy = -1.2;
    m.paintEllipsoid(0, hy, hz, 4.8, 4.9, 4.2, mat('scale'), partId.head, true);
    m.paintEllipsoid(0, hy + 3.4, hz + 0.1, 2.9, 2.5, 1.55, mat('scale'), partId.snout, true);
    m.paintEllipsoid(0, hy + 4.0, hz - 2.6, 2.5, 2.9, 1.15, mat('belly'), partId.jaw, true);
    const mcZ = Math.round(hz - 1.3);
    m.fillAABB(-1.6, 1.6, hy + 6.0, hy + 7.2, mcZ - 0.5, mcZ + 0.8, (x, y, z, X, Y) => {
      if (Math.abs(X) <= 1.2 && Y >= hy + 6.1 && Y <= hy + 7.0 && z >= mcZ && z <= mcZ + 1) {
        m.setRaw(x, y, z, Math.abs(X) <= 0.6 ? keyToId.emissiveCore : keyToId.emissiveHot, partId.mouthCore);
      }
    });
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 2.5, hy - 2.0, hz + 3.2, s * 3.7, hy - 4.6, hz + 6.4, 1.35, 0.9, mat('horn'), partId.horn, true);
    }
    m.despeckle(); m.applyArtShading(true);

    const eyeZ = Math.round(hz + 1.3), eyeY = Math.round(D * 0.5 - 0.5 + hy + 3.6);
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 6; step++) {
        const x = Math.round(W * 0.5 - 0.5 + s * (5.2 - step));
        if (m.getPartId(x, eyeY, eyeZ) === partId.head) { sx = x; break; }
      }
      if (sx < 0) sx = Math.round(W * 0.5 - 0.5 + s * 3.8);
      for (const dy of [0, 1]) for (const dz of [0, 1]) {
        const kId = (dz === 1 && dy === 1) ? keyToId.eyeGlint : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
        m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 5.5 });
  }

  const Y_TAIL_PIVOT_Y = 5.4;
  function buildYoungTail(makeCanvas) {
    const m = new VoxelModel(8, 14, 9, SPEC);
    const { mat, partId } = SPEC;
    const ry = Y_TAIL_PIVOT_Y;
    m.paintCapsule(0, ry, 3.2, 0, ry - 4.0, 2.6, 2.8, 2.2, mat('scale'), partId.tail, true);
    m.paintCapsule(0, ry - 4.0, 2.6, 0, ry - 7.8, 3.2, 2.2, 1.6, mat('scale'), partId.tail, true);
    m.paintCapsule(0, ry - 7.8, 3.2, 0, ry - 11.0, 4.6, 1.6, 1.15, mat('scale'), partId.tail, true);
    m.despeckle(); m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5 });
  }

  const Y_WING_PIVOT = { x: 6.4, y: 2.6 };
  function buildYoungWing(makeCanvas, side, pose) {
    const m = new VoxelModel(18, 16, 18, SPEC);
    const { mat, partId } = SPEC;
    const s = side, rx = -s * Y_WING_PIVOT.x, ry = Y_WING_PIVOT.y, rz = 7.4;
    const flap = pose === 'up' ? 0.90 : (pose === 'down' ? -0.82 : (pose === 'mid' ? 0.08 : -0.68));
    const spread = pose === 'tuck' ? 0.56 : 1.0;
    const pRoot  = [rx, ry, rz];
    const pElbow = [rx + s * 5.4 * spread, ry + 1.8, rz + 2.0 + flap * 2.8];
    const pTip   = [rx + s * 11.4 * spread, ry - 0.4, rz + 1.0 + flap * 5.0];
    const pTRoot = [rx, ry - 5.2, rz - 1.4];
    const pTMid  = [rx + s * 5.4 * spread, ry - 5.8, pElbow[2] - 1.6];
    const pTTip  = [rx + s * 10.8 * spread, ry - 2.2, pTip[2] - 0.8];
    paintWingQuad(m, pRoot, pElbow, pTMid, pTRoot, 1.15, mat('wing'), partId.wingMem, 0.8, false);
    paintWingQuad(m, pElbow, pTip, pTTip, pTMid,  1.12, mat('wing'), partId.wingMem, 1.0, false);
    m.paintEllipsoid(rx, ry - 0.4, rz, 1.7, 1.7, 1.5, mat('scale'), partId.wingBone, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pElbow[0], pElbow[1], pElbow[2], 1.45, 1.25, mat('scale'), partId.wingBone, true);
    m.paintCapsule(pElbow[0], pElbow[1], pElbow[2], pTip[0], pTip[1], pTip[2], 1.25, 0.95, mat('scale'), partId.wingBone, true);
    m.paintCapsule(pElbow[0], pElbow[1], pElbow[2], pTMid[0], pTMid[1], pTMid[2], 1.02, 0.82, mat('scale'), partId.wingBone, true);
    m.despeckle(); m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: pose === 'tuck' ? 4.5 : 6.0 });
  }

  // =========================================================================
  // 二、成年飞龙精制部件
  // =========================================================================
  function buildAdultTorso(makeCanvas) {
    const m = new VoxelModel(18, 22, 26, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-7.6, 7.6, -9.2, 10.8, 7.5, 22.5, (x, y, z, X, Y) => {
      const dTorso = (Math.hypot(X / 6.9, (Y - 0.4) / 9.0, (z - 14.8) / 6.0) - 1) * 6.0;
      const dChest = (Math.hypot(X / 5.8, (Y - 6.0) / 5.2, (z - 16.0) / 5.4) - 1) * 5.2;
      if (smin(dTorso, dChest, 2.2) <= 0) {
        const isBelly = z < 13.0 && Math.abs(X) < 4.8 && Y > -5.5;
        const isArmor = !isBelly && z > 17.0 && Math.abs(X) < 5.0;
        m.setRaw(x, y, z, isBelly ? mat('belly') : (isArmor ? mat('armor') : mat('scale')), isBelly ? partId.belly : partId.body);
      }
    });
    m.fillAABB(-3.0, 3.0, 7.6, 11.4, 12.0, 19.6, (x, y, z, X, Y) => {
      const cd = Math.hypot(X / 2.6, (Y - 10.2) / 1.8, (z - 15.8) / 3.4);
      if (cd <= 1.0) {
        m.setRaw(x, y, z, cd <= 0.55 ? keyToId.emissiveCore : (cd <= 0.82 ? keyToId.emissiveHot : keyToId.emissiveMid), partId.chestCore);
      }
    });
    for (const f of [[0,5.5,20.4,0,3.8,23.4,1.3],[0,1.2,20.6,0,-0.6,24.0,1.35],[0,-3.2,19.9,0,-5.2,23.0,1.3],[0,-7.4,18.0,0,-9.2,20.6,1.2]]) {
      m.paintCapsule(f[0], f[1], f[2], f[3], f[4], f[5], f[6], 0.9, mat('horn'), partId.spine, true);
    }
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 5.6, -4.4, 11.6, s * 6.8, -2.0, 6.4, 2.4, 1.85, mat('armor'), partId.leg, true);
      m.paintCapsule(s * 6.8, -2.0,  6.4, s * 5.6, -4.6, 2.6, 1.75, 1.45, mat('scale'), partId.leg, true);
      m.paintCapsule(s * 5.6, -4.6,  2.6, s * 5.6, -1.2, 1.4, 1.45, 1.15, mat('horn'), partId.claw, true);
      m.paintCapsule(s * 5.6, -1.6,  1.6, s * 6.6,  0.4, 0.8, 1.05, 0.85, mat('horn'), partId.claw, true);
    }
    m.despeckle(); m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 11.0 });
  }

  function buildAdultNeck(makeCanvas) {
    const m = new VoxelModel(10, 12, 18, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.paintCapsule(0, -2.0, 1.5, 0,  1.6, 6.8, 4.0, 3.3, mat('scale'), partId.neck, true);
    m.paintCapsule(0,  1.6, 6.8, 0,  0.8, 12.2, 3.3, 3.0, mat('scale'), partId.neck, true);
    m.paintCapsule(0,  0.8, 12.2, 0, 3.2, 16.2, 3.0, 3.1, mat('scale'), partId.neck, true);
    m.fillAABB(-2.0, 2.0, 1.8, 5.2, 4.0, 10.6, (x, y, z, X, Y) => {
      const td = Math.hypot(X / 1.7, (Y - 3.2) / 1.6, (z - 7.2) / 3.2);
      if (td <= 1.0) {
        m.setRaw(x, y, z, td <= 0.55 ? keyToId.emissiveCore : (td <= 0.82 ? keyToId.emissiveHot : keyToId.emissiveMid), partId.chestCore);
      }
    });
    m.paintCapsule(0, -0.2, 8.8, 0, -2.0, 10.4, 1.2, 0.9, mat('horn'), partId.spine, true);
    m.paintCapsule(0, -0.4, 14.0, 0, -2.2, 15.6, 1.15, 0.9, mat('horn'), partId.spine, true);
    m.despeckle(); m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.0 });
  }

  function buildAdultHead(makeCanvas) {
    const W = 16, D = 26, H = 20;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hz = 7.2, hy = 0.2;
    m.paintEllipsoid(0, hy, hz, 4.7, 4.8, 3.6, mat('scale'), partId.head, true);
    m.paintEllipsoid(0, hy + 5.1, hz + 0.5, 3.1, 3.4, 1.55, mat('armor'), partId.snout, true);
    m.paintEllipsoid(0, hy + 7.6, hz + 1.5, 1.4, 1.1, 1.0, mat('horn'), partId.horn, true);
    m.paintEllipsoid(0, hy + 5.9, hz - 3.0, 2.8, 4.0, 1.35, mat('belly'), partId.jaw, true);
    m.paintCapsule(0, hy + 4.5, hz - 4.0, 0, hy + 2.3, hz - 5.2, 1.15, 0.85, mat('horn'), partId.horn, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 2.1, hy + 4.0, hz - 3.6, s * 2.8, hy + 2.1, hz - 4.7, 1.05, 0.8, mat('horn'), partId.horn, true);
      m.paintCapsule(s * 2.8, hy - 2.3, hz + 2.6, s * 5.2, hy - 6.7, hz + 6.4, 1.55, 1.3, mat('horn'), partId.horn, true);
      m.paintCapsule(s * 5.2, hy - 6.7, hz + 6.4, s * 6.8, hy - 11.4, hz + 9.2, 1.3, 1.05, mat('horn'), partId.horn, true);
      m.paintCapsule(s * 4.2, hy - 2.5, hz - 0.4, s * 6.2, hy - 5.1, hz + 0.8, 1.15, 0.85, mat('horn'), partId.horn, true);
    }
    const mcZ = Math.round(hz - 1.5);
    m.fillAABB(-1.8, 1.8, hy + 8.5, hy + 10.0, mcZ - 0.5, mcZ + 1.2, (x, y, z, X, Y) => {
      if (Math.abs(X) <= 1.5 && Y >= hy + 8.6 && Y <= hy + 9.6 && z >= mcZ && z <= mcZ + 1) {
        m.setRaw(x, y, z, Math.abs(X) <= 0.7 ? keyToId.emissiveCore : keyToId.emissiveHot, partId.mouthCore);
      }
    });
    m.despeckle(); m.applyArtShading(true);

    const eyeZ = Math.round(hz + 1.4), eyeY = Math.round(D * 0.5 - 0.5 + hy + 1.9);
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 6; step++) {
        const x = Math.round(W * 0.5 - 0.5 + s * (5.2 - step));
        if (m.getPartId(x, eyeY, eyeZ) === partId.head) { sx = x; break; }
      }
      const minOuterX = Math.round(W * 0.5 - 0.5 + s * 3.6);
      if (sx < 0 || (s > 0 ? sx < minOuterX : sx > minOuterX)) sx = minOuterX;
      for (const dy of [0, 1]) for (const dz of [0, 1]) {
        const kId = (dz === 1 && dy === 1) ? keyToId.eyeGlint : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
        m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 6.5 });
  }

  const A_TAIL_SEG_LEN = 7.4;
  function buildAdultTailSeg(makeCanvas, r0, r1, isTip) {
    const m = new VoxelModel(isTip ? 9 : 8, isTip ? 12 : 11, 8, SPEC);
    const { mat, partId } = SPEC;
    const ry = 3.6;
    m.paintCapsule(0, ry, 3.6, 0, ry - A_TAIL_SEG_LEN, isTip ? 4.8 : 3.2, r0, r1, mat('scale'), partId.tail, true);
    if (isTip) {
      const ty = ry - A_TAIL_SEG_LEN;
      m.paintCapsule(0, ty + 1.2, 4.5, -2.2, ty + 3.0, 5.2, 1.15, 0.9, mat('horn'), partId.tailBarb, true);
      m.paintCapsule(0, ty + 1.2, 4.5,  2.2, ty + 3.0, 5.2, 1.15, 0.9, mat('horn'), partId.tailBarb, true);
      m.paintCapsule(0, ty + 0.8, 4.8,  0,   ty - 1.8, 5.8, 1.2,  0.9, mat('horn'), partId.tailBarb, true);
    }
    m.despeckle(); m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: isTip ? 3.0 : 3.8 });
  }

  const A_WING_PIVOT = { x: 11.8, y: 5.8 };
  function buildAdultWing(makeCanvas, side, pose) {
    const m = new VoxelModel(30, 28, 26, SPEC);
    const { mat, partId } = SPEC;
    const s = side, rx = -s * A_WING_PIVOT.x, ry = A_WING_PIVOT.y, rz = 10.6;
    const isRest = pose === 'rest';
    const flap = pose === 'up' ? 0.86 : (pose === 'down' ? -0.78 : (pose === 'mid' ? 0.05 : (isRest ? -0.58 : 0.20)));
    const sp = isRest ? 0.56 : 1.0;

    const pRoot    = [rx, ry, rz];
    const pWrist   = [rx + s * 10.4 * sp, ry + (isRest ? 0.4 : 3.4), rz + 4.0 + flap * 3.6];
    const pTip     = [rx + s * 22.8 * sp, ry + (isRest ? -7.2 : -1.2), rz + 1.4 + flap * 7.0];
    const pTRoot   = [rx, ry - 10.6, rz - 2.8];
    const pTRib3   = [rx + s * 7.6 * sp,  ry - (isRest ? 12.0 : 14.2), pWrist[2] - 5.2];
    const pTRib2   = [rx + s * 14.8 * sp, ry - (isRest ? 12.2 : 13.2), lerp(pWrist[2], pTip[2], 0.45) - 4.4];
    const pTRib1   = [rx + s * 18.8 * sp, ry - (isRest ? 10.2 : 9.2),  pTip[2] - 2.8];
    const pTipBack = [rx + s * 22.4 * sp, ry - (isRest ? 8.2 : 3.0),   pTip[2] - 0.8];

    paintWingQuad(m, pRoot,  pWrist, pTRib3, pTRoot, 1.22, mat('wing'), partId.wingMem, 1.5, false);
    paintWingQuad(m, pWrist, pTRib1, pTRib2, pTRib3, 1.22, mat('wing'), partId.wingMem, 1.6, false);
    paintWingQuad(m, pWrist, pTip,   pTipBack, pTRib1, 1.18, mat('wing'), partId.wingMem, 1.8, false);
    m.paintEllipsoid(rx, ry - 0.6, rz, 2.1, 2.2, 1.9, mat('armor'), partId.wingBone, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pWrist[0], pWrist[1], pWrist[2], 1.85, 1.55, mat('armor'), partId.wingBone, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pTip[0], pTip[1], pTip[2], 1.5, 1.05, mat('armor'), partId.wingBone, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pWrist[0] + s * 1.2, pWrist[1] + 2.4, pWrist[2] + 1.6, 1.15, 0.85, mat('horn'), partId.horn, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pTRib1[0], pTRib1[1], pTRib1[2], 1.08, 0.82, mat('scale'), partId.wingBone, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pTRib2[0], pTRib2[1], pTRib2[2], 1.08, 0.82, mat('scale'), partId.wingBone, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pTRib3[0], pTRib3[1], pTRib3[2], 1.08, 0.82, mat('scale'), partId.wingBone, true);
    m.despeckle(); m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 11.0 });
  }

  // =========================================================================
  // 三、双形态自动循环变身状态机（总周期 23.5 秒，无限循环）
  // =========================================================================
  const STAGES = [
    { name: 'young_fly',      dur: 6.0 },
    { name: 'young_land',     dur: 1.8 },
    { name: 'morph_to_adult', dur: 2.0 },
    { name: 'adult_takeoff',  dur: 1.2 },
    { name: 'adult_fly',      dur: 7.5 },
    { name: 'adult_land',     dur: 2.0 },
    { name: 'morph_to_young', dur: 2.0 },
    { name: 'young_takeoff',  dur: 1.0 }
  ];

  const FeilongDef = {
    id: 'feilong_drake',
    name: '赤焰飞龙',
    tag: '双形态循环变身',
    summary: 'v3 锐利丝滑翱翔双形态：解耦巡航与拍翅升沉 + 真拖拽鞭尾链 + 幼年落地变身成年⇄成年落地变回幼年循环',
    defaultHabitat: 'volcano',
    footRadius: 11.0,
    ecoWeight: 1.55,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: ['幼年/成年双形态', '落地自动循环变身', '丝滑翱翔升沉振翅', '真拖拽 S 形长鞭尾', '扇贝宽翼零裁切'],
    soulHabit: '幼年轻快飞巡 → 落地收翼爆发变身成年 → 成年稳健滑翔 → 重着陆回卷变回幼年循环',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        yTorso:      buildYoungTorso(makeCanvas),
        yHead:       buildYoungHead(makeCanvas),
        yTail:       buildYoungTail(makeCanvas),
        yWingL_up:   buildYoungWing(makeCanvas, -1, 'up'),
        yWingR_up:   buildYoungWing(makeCanvas,  1, 'up'),
        yWingL_mid:  buildYoungWing(makeCanvas, -1, 'mid'),
        yWingR_mid:  buildYoungWing(makeCanvas,  1, 'mid'),
        yWingL_dn:   buildYoungWing(makeCanvas, -1, 'down'),
        yWingR_dn:   buildYoungWing(makeCanvas,  1, 'down'),
        yWingL_tuck: buildYoungWing(makeCanvas, -1, 'tuck'),
        yWingR_tuck: buildYoungWing(makeCanvas,  1, 'tuck'),

        aTorso:       buildAdultTorso(makeCanvas),
        aNeck:        buildAdultNeck(makeCanvas),
        aHead:        buildAdultHead(makeCanvas),
        aTail1:       buildAdultTailSeg(makeCanvas, 3.5, 2.5, false),
        aTail2:       buildAdultTailSeg(makeCanvas, 2.4, 1.7, false),
        aTailTip:     buildAdultTailSeg(makeCanvas, 1.6, 1.1, true),
        aWingL_up:    buildAdultWing(makeCanvas, -1, 'up'),
        aWingR_up:    buildAdultWing(makeCanvas,  1, 'up'),
        aWingL_mid:   buildAdultWing(makeCanvas, -1, 'mid'),
        aWingR_mid:   buildAdultWing(makeCanvas,  1, 'mid'),
        aWingL_dn:    buildAdultWing(makeCanvas, -1, 'down'),
        aWingR_dn:    buildAdultWing(makeCanvas,  1, 'down'),
        aWingL_glide: buildAdultWing(makeCanvas, -1, 'glide'),
        aWingR_glide: buildAdultWing(makeCanvas,  1, 'glide'),
        aWingL_rest:  buildAdultWing(makeCanvas, -1, 'rest'),
        aWingR_rest:  buildAdultWing(makeCanvas,  1, 'rest')
      };

      const adultTailChain = new ChainSolver(4, A_TAIL_SEG_LEN, { maxAngle: 0.56, waveFreq: 4.2, wavePhaseStep: 0.72, waveAmp: 0.42 });
      const youngTailChain = new ChainSolver(2, 6.2, { maxAngle: 0.65, waveFreq: 6.8, wavePhaseStep: 0.6, waveAmp: 0.45 });
      const headLookSpring = new SpringDamper1D(0, 110, 6.8);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 14.0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        phase: 0,      // 缓慢气流起伏相位（给 windDrift 用，不弹跳）
        wingPhase: 0,  // 独立翅膀拍打相位
        stageIdx: 0, stageTime: 0,
        form: 'young',
        wingPose: 'up', wingSweep: 0, headLift: 0, flapLiftOffset: 0,
        morphScale: 1.0, tremorX: 0, tremorY: 0,
        morphSwapped: false, landedVfxFired: false,
        emberCd: 0, morphParticleCd: 0, landStartZ: 14.0
      };
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function spawnMorphBurst(vfx, x, y, z, sMul, outward, count) {
        const fx = curSkin.fx || SKINS[0].fx;
        for (let i = 0; i < count; i++) {
          const ang = (i / count) * Math.PI * 2 + Math.random() * 0.35;
          const r = outward ? (3.0 + Math.random() * 4.0) * sMul : (17.0 + Math.random() * 7.0) * sMul;
          const spd = outward ? (18 + Math.random() * 22) * sMul : -(18 + Math.random() * 14) * sMul;
          const px = x + Math.cos(ang) * r;
          const py = y + Math.sin(ang) * r;
          const pz = z + (3.0 + Math.random() * 10.0) * sMul;
          const col = i % 3 === 0 ? fx.core : (i % 3 === 1 ? fx.hot : fx.mid);
          vfx.spawnParticle(
            px, py, pz,
            Math.cos(ang) * spd, Math.sin(ang) * spd, (outward ? 13 : 6) + Math.random() * 10,
            0.50 + Math.random() * 0.35, 2.0 + Math.random() * 1.2, col, true, outward ? 14 : -5
          );
        }
      }

      const instance = {
        def: FeilongDef,
        cachePrefix: `feilong_v3e_${Math.random().toString(36).slice(2, 7)}`,
        parts, partListAssets: Object.values(parts), state, sockets, scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.yaw = hyaw;
          state.z = 14.0; state.vx = 0; state.vy = 0;
          state.stageIdx = 0; state.stageTime = 0;
          state.form = 'young'; state.morphScale = 1.0;
          state.tremorX = 0; state.tremorY = 0; state.flapLiftOffset = 0;
          state.morphSwapped = false; state.landedVfxFired = false;
          adultTailChain.reset(hx, hy, state.z + 11, hyaw);
          youngTailChain.reset(hx, hy, state.z + 4.5, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = params.springiness ?? 1.0;
          const gFreq = params.gaitFreq ?? 1.0;
          const flex = params.tailFlex ?? 1.0;

          state.stageTime += dt;
          let stg = STAGES[state.stageIdx];
          if (state.stageTime >= stg.dur) {
            state.stageTime -= stg.dur;
            state.stageIdx = (state.stageIdx + 1) % STAGES.length;
            stg = STAGES[state.stageIdx];
            state.morphSwapped = false;
            state.landedVfxFired = false;
            state.landStartZ = state.z;
          }

          const u = clamp(state.stageTime / stg.dur, 0, 1);
          const name = stg.name;
          state.morphScale = 1.0;
          state.tremorX = 0;
          state.tremorY = 0;

          let forcePose = null;
          let lookTarget = Math.sin(time * 1.5) * 0.34;
          let headLiftTgt = 0;
          let sweepTgt = 0;
          let flapLiftTgt = 0;

          if (name === 'young_fly') {
            state.form = 'young';
            // 使用缓慢气流频率(0.45)驱动 windDrift，完全消除高频上下弹跳！
            Propulsion.windDrift(state, dt, time, { ...params, gaitFreq: 0.45, speed: (params.speed ?? 1.0) * 1.12 }, {
              ...eco, baseLift: 14.0 * sMul
            });
            // 独立高频翅膀拍打 + 温和的滞后升力微托(±0.75 格)
            state.wingPhase += dt * gFreq * 8.4;
            const wingBeat = Math.sin(state.wingPhase);
            flapLiftTgt = Math.sin(state.wingPhase - 0.85) * 0.75 * sMul;
            sweepTgt = wingBeat * 0.28;
            headLiftTgt = Math.sin(state.wingPhase - 0.5) * 0.65;

            state.emberCd -= dt;
            if (state.emberCd <= 0) {
              state.emberCd = 0.24;
              const sgn = Math.random() < 0.5 ? -1 : 1;
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, sgn * 11 * sMul, -1 * sMul);
              vfx.spawnParticle(wx, wy, state.z + 8 * sMul, -state.vx * 0.18, -state.vy * 0.18, -1.5, 0.45, 1.3, curSkin.fx.hot, true, 4);
            }
          } else if (name === 'young_land') {
            state.form = 'young';
            const decel = expSmooth(dt, 4.2);
            state.vx = lerp(state.vx, 0, decel);
            state.vy = lerp(state.vy, 0, decel);
            state.x += state.vx * dt;
            state.y += state.vy * dt;
            state.z = lerp(state.landStartZ, 0, smoothstep(0, 0.84, u));
            state.wingPhase += dt * gFreq * lerp(7.5, 1.8, u);
            sweepTgt = u < 0.72 ? Math.sin(state.wingPhase) * 0.24 * (1 - u * 0.5) : -0.15;
            if (u >= 0.74) forcePose = 'tuck';
            if (u >= 0.80 && !state.landedVfxFired) {
              state.landedVfxFired = true;
              EnvFeedback.emitFootstep(vfx, habitat, state.x, state.y, 1.1 * sMul);
            }
          } else if (name === 'morph_to_adult') {
            state.vx = lerp(state.vx, 0, expSmooth(dt, 10));
            state.vy = lerp(state.vy, 0, expSmooth(dt, 10));
            state.z = 0;
            if (u < 0.46) {
              state.form = 'young';
              forcePose = 'tuck';
              const p = u / 0.46;
              state.tremorX = Math.sin(time * 64) * 1.1 * p * sMul;
              state.tremorY = Math.cos(time * 54) * 0.8 * p * sMul;
              state.morphScale = 1.0 + p * 0.34;
              state.morphParticleCd -= dt;
              if (state.morphParticleCd <= 0) {
                state.morphParticleCd = 0.065;
                spawnMorphBurst(vfx, state.x, state.y, 2.0, sMul, false, 5);
              }
            } else {
              if (!state.morphSwapped) {
                state.morphSwapped = true;
                state.form = 'adult';
                adultTailChain.reset(state.x, state.y, 11.0 * sMul, state.yaw);
                EnvFeedback.emitFootstep(vfx, habitat, state.x, state.y, 2.0 * sMul);
                spawnMorphBurst(vfx, state.x, state.y, 4.0, sMul, true, 26);
              }
              state.form = 'adult';
              const v = smoothstep(0.46, 1.0, u);
              state.morphScale = v < 0.80 ? lerp(0.74, 1.0, v / 0.80) : 1.0;
              forcePose = v < 0.32 ? 'rest' : 'up';
              headLiftTgt = 3.2 * Math.sin(v * Math.PI);
              sweepTgt = v < 0.32 ? -0.15 : -0.32;
              lookTarget = Math.sin(v * Math.PI * 2.2) * 0.40;
            }
          } else if (name === 'adult_takeoff') {
            state.form = 'adult';
            state.z = lerp(0, 19.0 * sMul, smoothstep(0, 1, u));
            state.wingPhase += dt * gFreq * 6.5;
            if (u < 0.30) { forcePose = 'down'; sweepTgt = 0.36; }
            else { sweepTgt = Math.sin(state.wingPhase) * 0.30; }
            if (u >= 0.14 && !state.landedVfxFired) {
              state.landedVfxFired = true;
              EnvFeedback.emitFootstep(vfx, habitat, state.x, state.y, 1.8 * sMul);
              spawnMorphBurst(vfx, state.x, state.y, 2.0, sMul, true, 12);
            }
            const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
            state.vx = lerp(state.vx, fwdX * 14 * (params.speed ?? 1.0), expSmooth(dt, 3.8));
            state.vy = lerp(state.vy, fwdY * 14 * (params.speed ?? 1.0), expSmooth(dt, 3.8));
            state.x += state.vx * dt;
            state.y += state.vy * dt;
          } else if (name === 'adult_fly') {
            state.form = 'adult';
            const isGliding = u > 0.46 && u < 0.75;
            const baseLift = (isGliding ? 22.0 : 19.0) * sMul;
            // 慢速平稳气流巡航，彻底消除垂直上下抽动
            Propulsion.windDrift(state, dt, time, { ...params, gaitFreq: 0.36, speed: (params.speed ?? 1.0) * 1.12 }, {
              ...eco, baseLift
            });
            state.wingPhase += dt * gFreq * (isGliding ? 1.5 : 5.2);
            const wingBeat = Math.sin(state.wingPhase);
            if (isGliding) {
              forcePose = 'glide';
              sweepTgt = -0.26;
              flapLiftTgt = 0;
              headLiftTgt = 1.2;
            } else {
              flapLiftTgt = Math.sin(state.wingPhase - 0.85) * 1.1 * sMul;
              sweepTgt = wingBeat * 0.32;
              headLiftTgt = Math.sin(state.wingPhase - 0.7) * 1.0;
            }
            state.emberCd -= dt;
            if (!isGliding && state.emberCd <= 0) {
              state.emberCd = 0.16;
              const sgn = Math.random() < 0.5 ? -1 : 1;
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, sgn * 22 * sMul, -2 * sMul);
              vfx.spawnParticle(wx, wy, state.z + 15 * sMul, -state.vx * 0.22, -state.vy * 0.22, -2.0, 0.58, 1.6, curSkin.fx.hot, true, 5);
            }
          } else if (name === 'adult_land') {
            state.form = 'adult';
            const decel = expSmooth(dt, 3.6);
            state.vx = lerp(state.vx, 0, decel);
            state.vy = lerp(state.vy, 0, decel);
            state.x += state.vx * dt;
            state.y += state.vy * dt;
            state.z = lerp(state.landStartZ, 0, smoothstep(0, 0.84, u));
            state.wingPhase += dt * gFreq * lerp(4.8, 1.4, u);
            sweepTgt = u < 0.72 ? Math.sin(state.wingPhase) * 0.28 * (1 - u * 0.5) : -0.15;
            if (u >= 0.74) forcePose = 'rest';
            if (u >= 0.80 && !state.landedVfxFired) {
              state.landedVfxFired = true;
              EnvFeedback.emitFootstep(vfx, habitat, state.x, state.y, 2.0 * sMul);
              spawnMorphBurst(vfx, state.x, state.y, 1.5, sMul, true, 12);
            }
          } else if (name === 'morph_to_young') {
            state.vx = lerp(state.vx, 0, expSmooth(dt, 10));
            state.vy = lerp(state.vy, 0, expSmooth(dt, 10));
            state.z = 0;
            if (u < 0.48) {
              state.form = 'adult';
              forcePose = 'rest';
              const p = u / 0.48;
              state.tremorX = Math.sin(time * 58) * 1.2 * p * sMul;
              state.tremorY = Math.cos(time * 50) * 0.9 * p * sMul;
              state.morphScale = lerp(1.0, 0.72, p);
              state.morphParticleCd -= dt;
              if (state.morphParticleCd <= 0) {
                state.morphParticleCd = 0.06;
                spawnMorphBurst(vfx, state.x, state.y, 2.5, sMul, false, 6);
              }
            } else {
              if (!state.morphSwapped) {
                state.morphSwapped = true;
                state.form = 'young';
                youngTailChain.reset(state.x, state.y, 4.5 * sMul, state.yaw);
                EnvFeedback.emitFootstep(vfx, habitat, state.x, state.y, 1.25 * sMul);
                spawnMorphBurst(vfx, state.x, state.y, 2.5, sMul, true, 16);
              }
              state.form = 'young';
              const v = smoothstep(0.48, 1.0, u);
              state.morphScale = v < 0.80 ? lerp(1.26, 1.0, v / 0.80) : 1.0;
              if (v < 0.45) forcePose = 'tuck';
              else {
                state.wingPhase += dt * gFreq * 12.0;
                sweepTgt = Math.sin(state.wingPhase) * 0.28;
              }
              lookTarget = Math.sin(v * Math.PI * 3.5) * 0.48;
            }
          } else if (name === 'young_takeoff') {
            state.form = 'young';
            state.z = lerp(0, 14.0 * sMul, smoothstep(0, 1, u));
            state.wingPhase += dt * gFreq * 9.5;
            sweepTgt = Math.sin(state.wingPhase) * 0.28;
            if (u >= 0.14 && !state.landedVfxFired) {
              state.landedVfxFired = true;
              EnvFeedback.emitFootstep(vfx, habitat, state.x, state.y, 1.0 * sMul);
            }
            const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
            state.vx = lerp(state.vx, fwdX * 13 * (params.speed ?? 1.0), expSmooth(dt, 4.0));
            state.vy = lerp(state.vy, fwdY * 13 * (params.speed ?? 1.0), expSmooth(dt, 4.0));
            state.x += state.vx * dt;
            state.y += state.vy * dt;
          }

          const maxR = eco.maxRadius ?? 48;
          const dist = Math.hypot(state.x, state.y);
          if (dist > maxR) {
            state.x *= maxR / dist;
            state.y *= maxR / dist;
          }

          headLookSpring.update(dt, lookTarget, 110 * sp, 6.8);
          state.headLift = lerp(state.headLift, headLiftTgt, expSmooth(dt, 10));
          state.wingSweep = lerp(state.wingSweep, sweepTgt, expSmooth(dt, 14));
          state.flapLiftOffset = lerp(state.flapLiftOffset, flapLiftTgt, expSmooth(dt, 12));

          const wingBeatVal = Math.sin(state.wingPhase);
          state.wingPose = forcePose || (wingBeatVal > 0.32 ? 'up' : (wingBeatVal < -0.32 ? 'down' : 'mid'));

          const isAdult = state.form === 'adult';
          const rootX = state.x + state.tremorX;
          const rootY = state.y + state.tremorY;
          const curZ = Math.max(0, state.z + state.flapLiftOffset);
          if (isAdult) {
            const [tx0, ty0] = localToWorldXY(rootX, rootY, state.yaw, 0, -7.8 * sMul);
            adultTailChain.update(dt, tx0, ty0, curZ + 11.2 * sMul, state.yaw, time, {
              segLen: A_TAIL_SEG_LEN * sMul,
              flexibility: flex,
              maxAngle: 0.56,
              waveFreq: gFreq * (state.z < 1.5 ? 2.4 : 4.2),
              waveAmp: state.z < 1.5 ? 0.22 : 0.42,
              restAlign: 0.08,
              zTargetFn: (t) => Math.max(1.2 * sMul, curZ + (11.2 - t * 1.2) * sMul)
            });
          } else {
            const [tx0, ty0] = localToWorldXY(rootX, rootY, state.yaw, 0, -5.6 * sMul);
            youngTailChain.update(dt, tx0, ty0, curZ + 4.5 * sMul, state.yaw, time, {
              segLen: 6.2 * sMul,
              flexibility: flex,
              maxAngle: 0.65,
              waveFreq: gFreq * (state.z < 1.5 ? 3.2 : 6.4),
              waveAmp: state.z < 1.5 ? 0.26 : 0.42,
              restAlign: 0.12,
              zTargetFn: () => Math.max(1.0 * sMul, curZ + 4.5 * sMul)
            });
          }
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const mScale = state.morphScale;
          const useScale = Math.abs(mScale - 1.0) > 0.005;
          const sx = useScale ? mScale : 1;
          const sy = useScale ? mScale : 1;
          const yw = state.yaw;
          const hYaw = yw + clamp(headLookSpring.x, -0.62, 0.62);
          const rx = state.x + state.tremorX;
          const ry = state.y + state.tremorY;
          const baseZ = Math.max(0, state.z + state.flapLiftOffset);

          if (state.form === 'young') {
            list.push({
              partKey: 'yTorso', asset: parts.yTorso,
              x: rx, y: ry, lift: baseZ, ro: yw, scaleX: sx, scaleY: sy, bias: 0.1
            });

            const [hx, hy] = localToWorldXY(rx, ry, yw, 0, 7.6 * sMul * mScale);
            list.push({
              partKey: 'yHead', asset: parts.yHead,
              x: hx, y: hy, lift: baseZ + (11.4 + state.headLift) * sMul * mScale,
              ro: hYaw, scaleX: sx, scaleY: sy, bias: 0.45
            });

            const [tRootX, tRootY] = localToWorldXY(rx, ry, yw, 0, -5.6 * sMul * mScale);
            const tYaw = youngTailChain.nodes[1].yaw;
            const [tWx, tWy] = localToWorldXY(tRootX, tRootY, tYaw, 0, -Y_TAIL_PIVOT_Y * sMul * mScale);
            list.push({
              partKey: 'yTail', asset: parts.yTail,
              x: tWx, y: tWy, lift: baseZ + 4.5 * sMul * mScale,
              ro: tYaw, scaleX: sx, scaleY: sy, bias: -0.3
            });

            const wp = state.wingPose === 'tuck' ? 'tuck' : (state.wingPose === 'down' ? 'dn' : (state.wingPose === 'mid' ? 'mid' : 'up'));
            for (const s of [-1, 1]) {
              const [shX, shY] = localToWorldXY(rx, ry, yw, s * 3.6 * sMul * mScale, 0.6 * sMul * mScale);
              const wYaw = yw - s * state.wingSweep;
              const [wx, wy] = localToWorldXY(shX, shY, wYaw, s * Y_WING_PIVOT.x * sMul * mScale, -Y_WING_PIVOT.y * sMul * mScale);
              const id = (s < 0 ? 'yWingL_' : 'yWingR_') + wp;
              list.push({
                partKey: id, asset: parts[id],
                x: wx, y: wy, lift: baseZ + 3.2 * sMul * mScale,
                ro: wYaw, scaleX: sx, scaleY: sy, bias: -0.1
              });
            }
          } else {
            list.push({
              partKey: 'aTorso', asset: parts.aTorso,
              x: rx, y: ry, lift: baseZ, ro: yw, scaleX: sx, scaleY: sy, bias: 0.1
            });

            const [nx, ny] = localToWorldXY(rx, ry, yw, 0, 10.2 * sMul * mScale);
            const nYaw = yw + (hYaw - yw) * 0.45;
            list.push({
              partKey: 'aNeck', asset: parts.aNeck,
              x: nx, y: ny, lift: baseZ + (16.0 + state.headLift * 0.45) * sMul * mScale,
              ro: nYaw, scaleX: sx, scaleY: sy, bias: 0.25
            });

            const [hx, hy] = localToWorldXY(nx, ny, nYaw, 0, 5.4 * sMul * mScale);
            list.push({
              partKey: 'aHead', asset: parts.aHead,
              x: hx, y: hy, lift: baseZ + (26.8 + state.headLift) * sMul * mScale,
              ro: hYaw, scaleX: sx, scaleY: sy, bias: 0.48
            });

            const segs = ['aTail1', 'aTail2', 'aTailTip'];
            const segZ = [11.2, 10.8, 10.4];
            for (let i = 0; i < 3; i++) {
              const prev = adultTailChain.nodes[i];
              const cur = adultTailChain.nodes[i + 1];
              const sYaw = cur.yaw;
              const [cx, cy] = localToWorldXY(prev.x, prev.y, sYaw, 0, -3.6 * sMul * mScale);
              list.push({
                partKey: segs[i], asset: parts[segs[i]],
                x: cx, y: cy, lift: baseZ + segZ[i] * sMul * mScale,
                ro: sYaw, scaleX: sx, scaleY: sy, bias: -0.3 - i * 0.08
              });
            }

            const wp = state.wingPose === 'rest'
              ? 'rest'
              : (state.wingPose === 'glide' ? 'glide' : (state.wingPose === 'down' ? 'dn' : (state.wingPose === 'mid' ? 'mid' : 'up')));
            for (const s of [-1, 1]) {
              const [shX, shY] = localToWorldXY(rx, ry, yw, s * 4.8 * sMul * mScale, 3.2 * sMul * mScale);
              const wYaw = yw - s * state.wingSweep;
              const [wx, wy] = localToWorldXY(shX, shY, wYaw, s * A_WING_PIVOT.x * sMul * mScale, -A_WING_PIVOT.y * sMul * mScale);
              const id = (s < 0 ? 'aWingL_' : 'aWingR_') + wp;
              list.push({
                partKey: id, asset: parts[id],
                x: wx, y: wy, lift: baseZ + 8.0 * sMul * mScale,
                ro: wYaw, scaleX: sx, scaleY: sy, bias: -0.1
              });
            }
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: FeilongDef.id, name: FeilongDef.name, outlineMode: 'actorUnified',
            skin: curSkin.id, form: state.form, stage: STAGES[state.stageIdx].name,
            footRadius: FeilongDef.footRadius, headZ: 42, centerZ: 22,
            blocks: FeilongDef.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(FeilongDef);
})(window.PixelWorkshop);
