'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 特6 · 鳞甲魔蛇（v3 修长巨蛇重制版 · 26 节超长脊柱 + 魔翼兜帽 + 盘绕立颈↔蜿蜒游走，+Y 正前）
  //   1. 彻底告别短虫比例：26 节修长蛇身（节距 2.85，全长 ~83 格，达到头长的 4.5 倍以上），
  //      游走时拖出流畅大 S 形长波，盘踞时卷成 1.7 圈紧实螺旋 + 高昂 S 形立颈；
  //   2. 移植 v3 异界魔蛇高精造型：棱角双魔角蛇首 + 颊侧副棘 + 额心魔晶 + 锯齿魔翼兜帽
  //      （正背自亮魔眼符纹，盘踞戒备自动张开）+ 宽厚分叉红信 + 环纹/背棘/晶点体节 + 三叉镰尾；
  //   3. 严守防糊清晰度规范：eyeGlint 绝不进 glowKeys、零小数缩放、蛇身包围盒中心锚定
  //      确保超长蛇身 360° 绝不裁切，并输出沿身贴地接触印。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      scaleDark:    '#1c5c34',
      scaleMid:     '#2fa054',
      scaleHi:      '#66d97c',
      patDark:      '#0d2e1f',
      patMid:       '#164a32',
      patHi:        '#266e4a',
      bellyDark:    '#a8984c',
      bellyMid:     '#ded178',
      bellyHi:      '#f5eead',
      hoodDark:     '#226b36',
      hoodMid:      '#3db858',
      hoodHi:       '#84e67e',
      rimDark:      '#143b24',
      rimMid:       '#297042',
      rimHi:        '#52b064',
      boneDark:     '#474036',
      boneMid:      '#8c7f6b',
      boneHi:       '#d9ccb4',
      eyeDark:      '#0a0d0c',
      eyeIris:      '#f2b629',
      eyeGlint:     '#f4fff9',
      tongueDark:   '#8f1422',
      tongueMid:    '#cf2436',
      tongueHi:     '#ff5e6e',
      emissiveMid:  '#72d624',
      emissiveHot:  '#d8ff3b',
      emissiveCore: '#f6ffbd'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'head', 'jaw', 'horn', 'eye', 'tongue',
      'hood', 'hoodRim', 'hoodSigil',
      'neck', 'coil', 'belly', 'spine', 'tailBlade', 'crystal'
    ],
    noCrease: [
      ['eye', 'head'], ['tongue', 'head'], ['tongue', 'jaw'],
      ['hood', 'hoodRim'], ['hood', 'hoodSigil'], ['hoodRim', 'hoodSigil'],
      ['coil', 'belly'], ['neck', 'belly'],
      ['crystal', 'coil'], ['crystal', 'neck'], ['crystal', 'tailBlade'], ['crystal', 'spine']
    ],
    materials: {
      scale:  ['scaleDark',  'scaleMid',  'scaleHi'],
      pat:    ['patDark',    'patMid',    'patHi'],
      belly:  ['bellyDark',  'bellyMid',  'bellyHi'],
      hood:   ['hoodDark',   'hoodMid',   'hoodHi'],
      rim:    ['rimDark',    'rimMid',    'rimHi'],
      bone:   ['boneDark',   'boneMid',   'boneHi'],
      tongue: ['tongueDark', 'tongueMid', 'tongueHi']
    },
    protectedParts: ['eye', 'tongue', 'crystal', 'hoodSigil']
  });

  const SKINS = [
    {
      id: 'jade', name: '翠绿毒斑（森林毒蛇）', dot: '#3eb862', outline: '#09140e',
      pal: {}
    },
    {
      id: 'crimson', name: '黑红环纹（赤练魔蛇）', dot: '#e62c38', outline: '#0d080c',
      pal: {
        scaleDark: '#18181f', scaleMid: '#2c2d38', scaleHi: '#4b4e5e',
        patDark:   '#7a121b', patMid:   '#d42432', patHi:   '#ff5c63',
        bellyDark: '#747985', bellyMid: '#adb3bf', bellyHi: '#dce1eb',
        hoodDark:  '#1e1a22', hoodMid:  '#352e3a', hoodHi:  '#594e61',
        rimDark:   '#8c141d', rimMid:   '#e62c38', rimHi:   '#ff6e75',
        boneDark:  '#3b2626', boneMid:  '#7a4e46', boneHi:  '#cfa091',
        eyeIris:   '#ff8a24',
        emissiveMid: '#ff4818', emissiveHot: '#ff9c24', emissiveCore: '#fff1b8'
      }
    },
    {
      id: 'desert', name: '沙金荒漠（响尾金蛇）', dot: '#dbac4a', outline: '#140f08',
      pal: {
        scaleDark: '#8a6324', scaleMid: '#cc9b3e', scaleHi: '#f2cc6b',
        patDark:   '#452612', patMid:   '#784320', patHi:   '#a86536',
        bellyDark: '#9e8f76', bellyMid: '#d4c8b0', bellyHi: '#f2eadc',
        hoodDark:  '#9c7128', hoodMid:  '#dbac4a', hoodHi:  '#fae08c',
        rimDark:   '#542f16', rimMid:   '#8c5026', rimHi:   '#bd7742',
        boneDark:  '#4a3c2c', boneMid:  '#967e5f', boneHi:  '#e3cfa8',
        eyeIris:   '#ffd230',
        emissiveMid: '#e89417', emissiveHot: '#ffd230', emissiveCore: '#fff7c2'
      }
    },
    {
      id: 'frost', name: '冰蓝白鳞（寒霜玉蛇）', dot: '#4bbbe0', outline: '#08101a',
      pal: {
        scaleDark: '#1d5582', scaleMid: '#3d92c9', scaleHi: '#7fd2f5',
        patDark:   '#123254', patMid:   '#235c8f', patHi:   '#438cc2',
        bellyDark: '#9ab6cc', bellyMid: '#d2e7f5', bellyHi: '#f2faff',
        hoodDark:  '#8cb4d1', hoodMid:  '#cce6f7', hoodHi:  '#eef8ff',
        rimDark:   '#26789e', rimMid:   '#4bbbe0', rimHi:   '#99ecff',
        boneDark:  '#3a4d63', boneMid:  '#7e9cb8', boneHi:  '#d4e9fa',
        eyeIris:   '#4cf2ff',
        emissiveMid: '#24c2ff', emissiveHot: '#78f0ff', emissiveCore: '#e6ffff'
      }
    }
  ];

  // =========================================================================
  // 1. 模块化魔蛇体素建模
  // =========================================================================
  function buildDemonHead(makeCanvas) {
    const W = 18, D = 22, H = 15;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const headCy = -0.8;
    const headCz = 5.4;

    // 1. 锐利三角异兽蛇头（比例精致，衬托修长蛇身）
    m.fillAABB(-4.8, 4.8, headCy - 3.8, headCy + 6.4, 1, H - 2, (x, y, z, X, Y) => {
      const ly = Y - headCy;
      const lz = z - headCz;
      const pitch = ly * 0.12;
      const tFront = clamp((ly + 3.0) / 8.8, 0, 1);
      const halfW = tFront < 0.30
        ? lerp(2.4, 4.35, tFront / 0.30)
        : lerp(4.35, 1.65, Math.pow((tFront - 0.30) / 0.70, 0.90));
      const topZ = lerp(2.5, 1.3, tFront) - pitch + (Math.abs(X) > 1.8 && ly > -0.8 && ly < 2.0 ? 0.45 : 0);
      const botZ = -1.35 - pitch * 0.6;
      if (ly >= -3.1 && ly <= 5.8 && lz >= botZ && lz <= topZ) {
        const rx = X / Math.max(1.1, halfW);
        const rz = (lz - (botZ + topZ) * 0.5) / Math.max(0.85, (topZ - botZ) * 0.55);
        if (Math.pow(Math.abs(rx), 1.55) + Math.pow(Math.abs(rz), 1.55) <= 1.02) {
          const isCrown = (lz > topZ - 1.0) && (Math.abs(X) <= 1.35) && (ly >= -1.0 && ly <= 2.4);
          m.setRaw(x, y, z, isCrown ? mat('pat') : mat('scale'), partId.head);
        }
      }
    });

    // 2. 后弯双魔角 + 颊侧副棘 + 额心魔晶
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 2.2, headCy - 0.4, headCz + 1.9, s * 4.3, headCy - 3.2, headCz + 4.8, 1.22, 0.92, mat('bone'), partId.horn, true);
      m.paintCapsule(s * 4.3, headCy - 3.2, headCz + 4.8, s * 5.8, headCy - 5.8, headCz + 6.4, 0.92, 0.68, mat('bone'), partId.horn, true);
      m.paintCapsule(s * 3.4, headCy - 0.2, headCz - 0.3, s * 5.0, headCy - 2.0, headCz + 0.5, 0.92, 0.66, mat('bone'), partId.horn, true);
    }
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    m.setRaw(Math.round(hw), Math.round(headCy + 1.1 + hd), Math.round(headCz + 2.2), keyToId.emissiveHot, partId.crystal);

    // 3. 下颌与颌底骨棘
    m.fillAABB(-3.4, 3.4, headCy - 1.2, headCy + 6.0, 1, headCz, (x, y, z, X, Y) => {
      const ly = Y - headCy;
      const tF = clamp((ly + 1.0) / 6.6, 0, 1);
      const halfW = lerp(3.0, 1.55, tF);
      const jawZ = headCz - 1.75 - ly * 0.10;
      if (ly >= -1.0 && ly <= 5.4 && Math.abs(X) <= halfW && Math.abs(z - jawZ) <= 0.95) {
        m.setRaw(x, y, z, mat('belly'), partId.jaw);
      }
    });
    m.paintCapsule(0, headCy + 1.6, headCz - 2.4, 0, headCy + 0.4, headCz - 3.5, 0.85, 0.62, mat('bone'), partId.horn, true);

    m.despeckle();
    m.applyArtShading(true);

    // 4. 表面落点 2×2 锐利竖瞳蛇眼（严守 eyeGlint 不进 glowKeys，0.6 俯视 0 遮挡）
    const eyeBaseZ = Math.round(headCz + 0.4);
    const eyeBaseY = Math.round(hd + headCy + 2.1);
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 7; step++) {
        const gx = Math.round(hw + s * (4.4 - step));
        if (m.getPartId(gx, eyeBaseY, eyeBaseZ) === partId.head) { sx = gx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 2.8);
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const col = (dy === 1 && dz === 0)
            ? keyToId.eyeDark
            : ((dy === 1 && dz === 1) ? keyToId.eyeGlint : keyToId.eyeIris);
          m.setRaw(sx, eyeBaseY + dy, eyeBaseZ + dz, col, partId.eye);
        }
      }
      for (let k = 1; k <= 4; k++) {
        for (const dz of [0, 1]) {
          const fy = eyeBaseY + 1 + k;
          const fz0 = eyeBaseZ + dz;
          const fz1 = Math.round(eyeBaseZ + dz + k * 0.6);
          if (m.getPartId(sx, fy, fz0) === partId.head) m.setRaw(sx, fy, fz0, 0, 0);
          if (m.getPartId(sx, fy, fz1) === partId.head) m.setRaw(sx, fy, fz1, 0, 0);
        }
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 5.0, headZ: 14, centerZ: 6 });
  }

  function buildTongue(makeCanvas) {
    const m = new VoxelModel(8, 12, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -4.0, 2.0, 0, 1.2, 2.0, 0.82, 0.72, mat('tongue'), partId.tongue, true);
    m.paintCapsule(0,  1.2, 2.0, -2.0, 4.6, 2.0, 0.70, 0.56, mat('tongue'), partId.tongue, true);
    m.paintCapsule(0,  1.2, 2.0,  2.0, 4.6, 2.0, 0.70, 0.56, mat('tongue'), partId.tongue, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0 });
  }

  function buildDemonHood(makeCanvas, flared = false) {
    const W = 24, D = 12, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hoodHalfW = flared ? 9.8 : 7.2;
    const zMin = 1, zMax = 11;

    m.fillAABB(-hoodHalfW - 1.4, hoodHalfW + 1.4, -4.8, 4.8, zMin, zMax, (x, y, z, X, Y) => {
      const u = clamp((z - zMin) / (zMax - zMin), 0, 1);
      const baseProfile = Math.sin(Math.pow(u, 0.68) * Math.PI);
      const barbWave = 1.0 + 0.14 * Math.sin(u * Math.PI * 5.0);
      const maxW = 2.4 + (hoodHalfW - 2.4) * baseProfile * barbWave;
      const adx = Math.abs(X);
      if (adx > maxW) return;

      const edgeFrac = adx / Math.max(1.8, maxW);
      const surfY = -0.6 + edgeFrac * edgeFrac * 2.0;
      const halfThick = 1.32 - edgeFrac * 0.14;
      if (Math.abs(Y - surfY) <= halfThick) {
        if (adx <= 2.1) {
          const isBelly = Y > surfY + 0.15;
          const isStripe = isBelly && (z % 3 === 0) && adx <= 1.2;
          m.setRaw(x, y, z, isStripe ? mat('pat') : (isBelly ? mat('belly') : mat('scale')), isBelly ? partId.belly : partId.neck);
          return;
        }
        const isRim = edgeFrac > 0.78 || u < 0.08 || u > 0.92;
        const sigilD = Math.hypot((adx - maxW * 0.54) / 1.45, (u - 0.56) / 0.18);
        if (!isRim && sigilD <= 0.64) {
          m.setRaw(x, y, z, sigilD <= 0.34 ? keyToId.emissiveCore : keyToId.emissiveHot, partId.hoodSigil);
        } else if (!isRim && sigilD <= 1.12) {
          m.setRaw(x, y, z, mat('pat'), partId.hood);
        } else {
          m.setRaw(x, y, z, isRim ? mat('rim') : mat('hood'), isRim ? partId.hoodRim : partId.hood);
        }
      }
    });
    for (const s of [-1, 1]) {
      const xb = s * (hoodHalfW * 0.76);
      m.paintCapsule(xb, 0.6, 8.2, xb + s * 1.8, -0.8, 11.0, 0.95, 0.68, mat('bone'), partId.spine, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: flared ? 7.4 : 6.0 });
  }

  function buildBodySegment(makeCanvas, radius, variant = 'scale') {
    // variant: 'neck' | 'scale' | 'band' | 'crystal'
    // 沿纵轴微拉长（ry = radius * 1.18），配合 1.95 密排节距实现无缝连续蛇躯
    const ry = radius * 1.18;
    const W = Math.ceil(radius * 2 + 5);
    const D = Math.ceil(ry * 2 + 5);
    const H = Math.ceil(radius * 2 + 5);
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const cz = radius + 0.4;
    const isNeck = variant === 'neck';
    const isBand = variant === 'band';
    const hasCrystal = variant === 'crystal';

    m.fillAABB(-radius - 0.8, radius + 0.8, -ry - 0.8, ry + 0.8, 0, Math.ceil(cz + radius + 1.0), (x, y, z, X, Y) => {
      const d2 = (X / radius) * (X / radius) + (Y / ry) * (Y / ry) + ((z - cz) / radius) * ((z - cz) / radius);
      if (d2 <= 1.0) {
        let isBelly = false, isStripe = false;
        if (isNeck) {
          isBelly = Y > 0.55 && Math.abs(X) <= radius * 0.72;
          isStripe = isBelly && (z % 3 === 0) && Math.abs(X) <= 1.15;
        } else {
          isBelly = z <= cz - radius * 0.36;
        }
        const val = isStripe ? mat('pat') : (isBelly ? mat('belly') : (isBand ? mat('pat') : mat('scale')));
        m.setRaw(x, y, z, val, isBelly ? partId.belly : (isNeck ? partId.neck : partId.coil));
      }
    });

    if (isNeck) {
      m.paintCapsule(0, -ry * 0.48, cz, 0, -ry - 1.15, cz + 0.85, 0.88, 0.62, mat('bone'), partId.spine, true);
    } else if (isBand || hasCrystal) {
      m.paintCapsule(0, 0, cz + radius * 0.55, 0, -0.35, cz + radius + 1.35, 0.92, 0.62, mat('bone'), partId.spine, true);
      if (hasCrystal) {
        const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
        m.setRaw(Math.round(hw), Math.round(hd), Math.min(H - 1, Math.round(cz + radius + 1.2)), keyToId.emissiveHot, partId.crystal);
      }
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: radius });
  }

  function buildTailBlade(makeCanvas) {
    const W = 14, D = 18, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 尾节沿 -Y 延伸，主棘+双侧倒刺+自亮尾晶
    m.paintCapsule(0,  3.2, 2.2, 0, -5.8, 3.4, 1.55, 0.85, mat('bone'), partId.tailBlade, true);
    m.paintCapsule(0, -0.6, 2.5, -2.5, -3.2, 4.0, 1.05, 0.72, mat('bone'), partId.tailBlade, true);
    m.paintCapsule(0, -0.6, 2.5,  2.5, -3.2, 4.0, 1.05, 0.72, mat('bone'), partId.tailBlade, true);
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    m.setRaw(Math.round(hw), Math.round(hd - 2.0), 4, keyToId.emissiveHot,  partId.crystal);
    m.setRaw(Math.round(hw), Math.round(hd - 2.0), 5, keyToId.emissiveCore, partId.crystal);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.6 });
  }

  // =========================================================================
  // 2. 42 节等弧长密排超长蛇链（全长 ~89 格，盘踞与游走均 100% 紧实无缝不散开！）
  // =========================================================================
  const NUM_NODES = 42;
  const SEG_LEN = 1.95;

  function relaxSnakeChain(nodes, segLen) {
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

  function evalCoiledLocal(out, t, sMul) {
    const sway = Math.sin(t * 2.4) * 1.9;
    const breath = Math.sin(t * 4.8) * 0.45;
    const step = SEG_LEN;

    // 前 10 节（0..9）：等弧长高昂 S 形立颈（每节严格间隔 ~1.95，无缝衔接）
    const neckCtrl = [
      [sway * 1.05,  5.0, 23.2 + breath],
      [sway * 0.92,  3.3, 21.8 + breath * 0.9],
      [sway * 0.76,  1.5, 20.2 + breath * 0.8],
      [sway * 0.58, -0.3, 18.5 + breath * 0.7],
      [sway * 0.40, -1.9, 16.7 + breath * 0.5],
      [sway * 0.24, -3.2, 14.8 + breath * 0.4],
      [sway * 0.12, -4.1, 12.8 + breath * 0.2],
      [sway * 0.04, -4.3, 10.8],
      [0.0,         -3.7,  8.9],
      [0.0,         -2.7,  7.1]
    ];
    for (let i = 0; i < 10; i++) {
      out[i].x = neckCtrl[i][0] * sMul;
      out[i].y = neckCtrl[i][1] * sMul;
      out[i].z = neckCtrl[i][2] * sMul;
    }

    // 后 32 节（10..41）：严格等弧长阿基米德螺旋（dθ = SEG_LEN / hypot(r, b)），
    // 内外圈每一节间距恒定 1.95 格，盘成紧实饱满的两层螺旋，绝不分离散开！
    const r0 = 3.8;
    const b = 1.12; // 每转一圈半径增 ~7.0 格，紧贴相邻圈无空缝
    let theta = 0.0;
    const baseAng = -Math.PI * 0.52;
    for (let i = 10; i < NUM_NODES; i++) {
      const u = (i - 10) / (NUM_NODES - 11);
      const rad = r0 + b * theta;
      const ang = baseAng + theta;
      const wave = Math.sin(t * 3.2 - i * 0.28) * (0.22 + u * 0.42);
      const tailTap = u > 0.84 ? Math.max(0, Math.sin(t * 4.8 - 0.7)) * ((u - 0.84) / 0.16) * 2.0 : 0;
      out[i].x = Math.cos(ang) * (rad + wave) * sMul;
      out[i].y = Math.sin(ang) * (rad + wave) * sMul;
      out[i].z = (lerp(5.4, 0.2, Math.pow(u, 0.55)) + tailTap) * sMul;
      theta += step / Math.hypot(rad, b);
    }
  }

  const SnakeDef = {
    id: 'snake_wyrm',
    name: '鳞甲魔蛇',
    tag: '42 节密排巨蛇 · 紧实盘踞',
    summary: '42 节等弧长密排超长蛇身（全长 ~89 格，零断节）+ 锯齿魔翼兜帽 + 棱角双角蛇首 + 可伸缩分叉红信，大 S 波蜿蜒游走与紧实螺旋盘踞立颈平滑切换',
    defaultHabitat: 'ruins',
    footRadius: 11.5,
    ecoWeight: 1.15,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    blocks: ['42 节密排超长蛇脊', '等弧长紧实螺旋盘踞', '锯齿魔翼兜帽', '棱角魔角蛇首与红信', '大 S 波蜿蜒游走'],
    soulHabit: '拖着 42 节修长密排蛇身以大 S 形横向波游走，随后等弧长紧实盘成螺旋、昂首张开魔翼兜帽环视并高频吞吐红信',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        head:       buildDemonHead(makeCanvas),
        tongue:     buildTongue(makeCanvas),
        hoodNormal: buildDemonHood(makeCanvas, false),
        hoodFlared: buildDemonHood(makeCanvas, true),
        segNeck:    buildBodySegment(makeCanvas, 2.70, 'neck'),
        segThickS:  buildBodySegment(makeCanvas, 3.25, 'scale'),
        segThickB:  buildBodySegment(makeCanvas, 3.25, 'band'),
        segThickC:  buildBodySegment(makeCanvas, 3.25, 'crystal'),
        segMidS:    buildBodySegment(makeCanvas, 2.75, 'scale'),
        segMidB:    buildBodySegment(makeCanvas, 2.75, 'band'),
        segSlimS:   buildBodySegment(makeCanvas, 2.15, 'scale'),
        segSlimB:   buildBodySegment(makeCanvas, 2.15, 'band'),
        segTip:     buildBodySegment(makeCanvas, 1.62, 'scale'),
        tailBlade:  buildTailBlade(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;

      const nodes = Array.from({ length: NUM_NODES }, (_, i) => ({
        x: hx0, y: hy0 - i * SEG_LEN, z: 0.4, yaw: hyaw0
      }));
      const coilTmp = Array.from({ length: NUM_NODES }, () => ({ x: 0, y: 0, z: 0 }));

      const lookSpring   = new SpringDamper1D(0, 44, 6.8);
      const tongueSpring = new SpringDamper1D(0, 165, 10.5);

      const state = {
        x: hx0, y: hy0, z: 1.5,
        vx: 0, vy: 0, yaw: hyaw0,
        patAng: -Math.PI * 0.35 + (opts.seed ? (opts.seed % TAU) : 0),
        cycleT: 0,
        coilBlend: 0,
        wasCoiling: false,
        coilAnchorX: hx0, coilAnchorY: hy0, coilAnchorYaw: hyaw0,
        tongueOut: 0,
        dustCd: 0
      };
      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      const instance = {
        def: SnakeDef,
        cachePrefix: `snake_v3l_${Math.random().toString(36).slice(2, 7)}`,
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
          state.x = hx; state.y = hy; state.z = 1.5; state.yaw = hyaw;
          state.vx = 0; state.vy = 0; state.cycleT = 0;
          state.coilBlend = 0; state.wasCoiling = false; state.tongueOut = 0;
          state.coilAnchorX = hx; state.coilAnchorY = hy; state.coilAnchorYaw = hyaw;
          for (let i = 0; i < NUM_NODES; i++) {
            const [wx, wy] = localToWorldXY(hx, hy, hyaw, Math.sin(i * 0.45) * 4.5, -i * SEG_LEN * 0.88);
            nodes[i].x = wx;
            nodes[i].y = wy;
            nodes[i].z = i < 4 ? lerp(5.2, 0.3, i / 4) : 0.3;
            nodes[i].yaw = hyaw;
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
          const patrol = eco && eco.patrol !== false;
          const maxR = (eco && eco.maxRadius) || 44;

          // 1. 生态节奏：7.5s 大 S 波蜿蜒游走 ↔ 4.5s 1.7 圈螺旋盘踞立颈
          const SLITHER_DUR = 7.5;
          const COIL_DUR = 4.5;
          const CYCLE_DUR = SLITHER_DUR + COIL_DUR;
          if (patrol) {
            state.cycleT = (state.cycleT + dt) % CYCLE_DUR;
          } else {
            state.cycleT = SLITHER_DUR + 1.0;
          }
          const inCoil = !patrol || state.cycleT >= SLITHER_DUR;
          state.coilBlend = lerp(state.coilBlend, inCoil ? 1.0 : 0.0, expSmooth(dt, 3.6));

          if (inCoil && !state.wasCoiling) {
            state.wasCoiling = true;
            // 在当前蛇身中段位置锚定盘踞点，自然卷身而不瞬移
            const mid = nodes[8];
            state.coilAnchorX = clamp(mid.x, -maxR * 0.65, maxR * 0.65);
            state.coilAnchorY = clamp(mid.y, -maxR * 0.65, maxR * 0.65);
            state.coilAnchorYaw = nodes[0].yaw;
          } else if (!inCoil && state.wasCoiling) {
            state.wasCoiling = false;
            state.patAng = Math.atan2(nodes[0].y, nodes[0].x);
          }

          const segLen = SEG_LEN * sMul;

          // 2. 连续驱动 26 节修长蛇身
          if (state.coilBlend < 0.96) {
            // 自由蜿蜒游走（真实横向大 S 波 Lateral Undulation + Follow-the-Leader）
            const slitherWeight = 1.0 - state.coilBlend;
            const angSpd = 0.78 * speedMul * (0.25 + 0.75 * slitherWeight);
            state.patAng += dt * angSpd;
            const R = Math.min(26.0, maxR * 0.64);
            const bx = Math.cos(state.patAng) * R + ((eco && eco.avoidX) || 0) * 0.35;
            const by = Math.sin(state.patAng) * R + ((eco && eco.avoidY) || 0) * 0.35;
            const nx = Math.cos(state.patAng), ny = Math.sin(state.patAng);
            const wiggle = Math.sin(time * 5.8 * gFreq) * (7.2 * flex) * sMul;
            let hx = bx + nx * wiggle;
            let hy = by + ny * wiggle;
            const dH = Math.hypot(hx, hy);
            if (dH > maxR) { hx *= maxR / dH; hy *= maxR / dH; }
            const hz = (5.4 + Math.sin(time * 5.8 * gFreq) * 0.85) * sMul;

            const kH = expSmooth(dt, 11.5);
            nodes[0].x = lerp(nodes[0].x, hx, kH * slitherWeight);
            nodes[0].y = lerp(nodes[0].y, hy, kH * slitherWeight);
            nodes[0].z = lerp(nodes[0].z, hz, kH * slitherWeight);
            relaxSnakeChain(nodes, segLen);
            const kz = expSmooth(dt, 14.0);
            for (let i = 1; i < NUM_NODES; i++) {
              const tgtZ = (i < 4 ? lerp(hz, 0.25 * sMul, i / 4) : 0.25 * sMul);
              nodes[i].z = lerp(nodes[i].z, tgtZ, kz * slitherWeight);
            }
            relaxSnakeChain(nodes, segLen);
          }

          if (state.coilBlend > 0.02) {
            // 等弧长紧实螺旋盘踞 + 高昂 S 形立颈（过渡期同步做链约束，绝不拉散）
            const ax = patrol ? state.coilAnchorX : (eco ? (eco.homeX ?? 0) : 0);
            const ay = patrol ? state.coilAnchorY : (eco ? (eco.homeY ?? 0) : 0);
            const aYaw = patrol ? state.coilAnchorYaw : (eco ? (eco.homeYaw ?? 0) : 0);
            evalCoiledLocal(coilTmp, time, sMul);
            const kC = expSmooth(dt, 9.5) * state.coilBlend;
            for (let i = 0; i < NUM_NODES; i++) {
              const [wx, wy] = localToWorldXY(ax, ay, aYaw, coilTmp[i].x, coilTmp[i].y);
              nodes[i].x = lerp(nodes[i].x, wx, kC);
              nodes[i].y = lerp(nodes[i].y, wy, kC);
              nodes[i].z = lerp(nodes[i].z, coilTmp[i].z, kC);
            }
            if (state.coilBlend < 0.92) relaxSnakeChain(nodes, segLen);
          }

          // 3. 逐节计算切线朝向 yaw（+Y 正前）
          for (let i = 0; i < NUM_NODES; i++) {
            const prev = i > 0 ? nodes[i - 1] : nodes[0];
            const next = i < NUM_NODES - 1 ? nodes[i + 1] : nodes[NUM_NODES - 1];
            const dx = prev.x - next.x, dy = prev.y - next.y;
            if (Math.hypot(dx, dy) > 0.08) {
              nodes[i].yaw = Math.atan2(-dx, dy);
            }
          }

          // 盘踞立颈时蛇头稳稳朝前并左右顾盼
          const lookTarget = state.coilBlend > 0.35
            ? Math.sin(time * 2.2) * 0.42 * state.coilBlend
            : Math.sin(time * 5.8 * gFreq) * 0.08;
          lookSpring.update(dt, lookTarget, 46 * sp, clamp(6.8 * dScale, 3.0, 10.5));
          if (state.coilBlend > 0.45) {
            const aYaw = patrol ? state.coilAnchorYaw : (eco ? (eco.homeYaw ?? 0) : 0);
            const blendYaw = wrapAngle(aYaw + lookSpring.x);
            nodes[0].yaw = wrapAngle(nodes[0].yaw + wrapAngle(blendYaw - nodes[0].yaw) * state.coilBlend);
            nodes[1].yaw = wrapAngle(nodes[1].yaw + wrapAngle(aYaw + lookSpring.x * 0.7 - nodes[1].yaw) * state.coilBlend);
            nodes[2].yaw = wrapAngle(nodes[2].yaw + wrapAngle(aYaw + lookSpring.x * 0.4 - nodes[2].yaw) * state.coilBlend);
          }

          // 4. 高频灵动吞吐分叉红信
          const flickCycle = (time * (state.coilBlend > 0.4 ? 1.15 : 0.48)) % 1.0;
          const tongueTarget = flickCycle < 0.26 ? Math.sin((flickCycle / 0.26) * Math.PI) : 0;
          state.tongueOut = clamp(tongueSpring.update(dt, tongueTarget, 165 * sp, 10.5), 0, 1.1);

          // 5. 将 actor 锚点 (state.x, state.y) 置于全蛇包围盒中心，确保 83 格超长蛇身 360° 绝不裁切！
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
          state.x = cx;
          state.y = cy;
          state.z = lerp(1.2, 2.0, state.coilBlend) * sMul;
          state.yaw = nodes[0].yaw;

          sockets.setLocal('mouth', nodes[0].x, nodes[0].y, nodes[0].z, nodes[0].yaw, 0, 8.2, 2.4, sMul);

          // 6. 沿修长蛇身输出贴地接触印 + 游走微尘
          footContacts.length = 0;
          for (let i = 6; i < NUM_NODES; i += 4) {
            const n = nodes[i];
            const r = i <= 22 ? 3.4 : (i <= 33 ? 2.8 : 2.1);
            footContacts.push({ x: n.x, y: n.y, z: n.z, r: r * sMul });
          }

          state.dustCd -= dt;
          if (vfx && state.coilBlend < 0.35 && state.dustCd <= 0) {
            state.dustCd = 0.24;
            const tail = nodes[NUM_NODES - 3];
            if (habitat && habitat.isWater) {
              vfx.addRipple(tail.x, tail.y, 2.2 * sMul, 12 * sMul, 0.6, 1.3);
            } else if (habitat && habitat.fx) {
              vfx.spawnDust(tail.x, tail.y, 2, 0.45, habitat.fx);
            }
          }
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const headNode = nodes[0];
          const hYaw = headNode.yaw;

          // 1. 棱角双魔角蛇首
          list.push({
            partKey: 'head', asset: parts.head,
            x: headNode.x, y: headNode.y, lift: Math.max(0, headNode.z - 2.6 * sMul),
            ro: hYaw, bias: 0.95
          });

          // 2. 可伸缩分叉红信
          if (state.tongueOut > 0.08) {
            const flickYaw = hYaw + Math.sin(state.cycleT * 38) * 0.14;
            const [tx, ty] = localToWorldXY(headNode.x, headNode.y, hYaw, 0, (6.4 + state.tongueOut * 4.0) * sMul);
            list.push({
              partKey: 'tongue', asset: parts.tongue,
              x: tx, y: ty, lift: Math.max(0, headNode.z + 1.0 * sMul),
              ro: flickYaw, bias: 0.98
            });
          }

          // 3. 第 3 节颈部挂载锯齿魔翼兜帽（盘踞戒备自动张开！）
          const hoodNode = nodes[3];
          const hoodKey = state.coilBlend > 0.42 ? 'hoodFlared' : 'hoodNormal';
          list.push({
            partKey: hoodKey, asset: parts[hoodKey],
            x: hoodNode.x, y: hoodNode.y, lift: Math.max(0, hoodNode.z - 4.6 * sMul),
            ro: hoodNode.yaw, bias: 0.42
          });

          // 4. 40 节密排渐细环纹/背棘/晶点躯干体节（1..NUM_NODES-2，100% 重叠无缝）
          for (let i = 1; i < NUM_NODES - 1; i++) {
            const n = nodes[i];
            let k;
            if (i <= 8) {
              k = 'segNeck';
            } else if (i <= 22) {
              k = (i % 6 === 0) ? 'segThickC' : ((i % 3 === 0) ? 'segThickB' : 'segThickS');
            } else if (i <= 31) {
              k = (i % 3 === 0) ? 'segMidB' : 'segMidS';
            } else if (i <= 37) {
              k = (i % 3 === 0) ? 'segSlimB' : 'segSlimS';
            } else {
              k = 'segTip';
            }
            list.push({
              partKey: k, asset: parts[k],
              x: n.x, y: n.y, lift: Math.max(0, n.z - 0.6 * sMul),
              ro: n.yaw, bias: 0.12 - i * 0.008
            });
          }

          // 5. 三叉骨刺镰刃尾梢（严格沿尾切线转向）
          const tip = nodes[NUM_NODES - 1];
          const [bx, by] = localToWorldXY(tip.x, tip.y, tip.yaw, 0, -2.0 * sMul);
          list.push({
            partKey: 'tailBlade', asset: parts.tailBlade,
            x: bx, y: by, lift: Math.max(0, tip.z - 0.4 * sMul),
            ro: tip.yaw, bias: -0.35
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: SnakeDef.id, name: SnakeDef.name, outlineMode: 'actorUnified',
            skin: curSkin.id, segmentCount: NUM_NODES, segLen: SEG_LEN,
            footRadius: SnakeDef.footRadius, headZ: 25, centerZ: 10,
            blocks: SnakeDef.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(SnakeDef);
})(window.PixelWorkshop);
