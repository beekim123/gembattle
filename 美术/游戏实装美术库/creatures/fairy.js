'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 特3 · 林间妖精仙子（v3 标杆重做版，+Y 正前）
  // 严格复用已验证的 v3 林间妖精 15 部件精制比例、四片金边蝶翅与弯头花枝法杖：
  //   1. 完整轻盈体型：悬空微曲双腿与精灵小鞋(10×10×10) + 6 瓣分层花瓣裙(15×15×9) +
  //      常规/前倾 32° 双态纤细上身 + 小尖耳/花瓣发饰/抬高刘海 2×2 大眼小头(15×14×14) +
  //      飘动后发链 + 舒展双臂 + 弯头花枝法杖（顶端自亮花苞核 0 遮挡）
  //   2. 四片独立蝶翅（上对 16×12×15 + 下对 12×10×10）：弧形包络 + 金色镶边，翅根严格锁死
  //      后背枢轴 (±2.0, -2.0)，高频微振 + 上下翅 0.55 rad 相位滞后，360° 零脱节零挤捏缝
  //   3. 防糊红线：eyeGlint 严禁进 glowKeys，常态全程 1:1 整数像素绘制（零小数缩放）
  //   4. 真实蜂鸟/蝶翼生态：花丛悬停轻舞偶发挥杖洒花粉 ↔ 8 字形急停赏花与灵巧穿飞
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      skinDark:     '#d49e84',
      skinMid:      '#f5ceb8',
      skinHi:       '#ffeadc',
      hairDark:     '#6e421c',
      hairMid:      '#b87a38',
      hairHi:       '#e8b664',
      dressDark:    '#2a7a3e',
      dressMid:     '#5cc258',
      dressHi:      '#a8e87c',
      petalDark:    '#58992e',
      petalMid:     '#9ed94c',
      petalHi:      '#e6f788',
      wingDark:     '#70b8b0',
      wingMid:      '#b6ebe0',
      wingHi:       '#e8fff8',
      wingTrimDark: '#b87d1e',
      wingTrimMid:  '#f0b838',
      wingTrimHi:   '#ffe67a',
      staffDark:    '#4a2e1a',
      staffMid:     '#7d5232',
      staffHi:      '#b58356',
      eyeDark:      '#141a24',
      eyeIris:      '#2eb868',
      eyeGlint:     '#f7fbff',
      emissiveMid:  '#42e868',
      emissiveHot:  '#c4ff5e',
      emissiveCore: '#f8ffd6'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'leg', 'shoe', 'skirtInner', 'skirtPetal', 'sash', 'torso', 'arm',
      'head', 'ear', 'hair', 'flowerCrown', 'eye',
      'wingUpper', 'wingLower', 'wingTrim',
      'staff', 'staffLeaf', 'staffCore'
    ],
    noCrease: [
      ['eye', 'head'], ['ear', 'head'], ['head', 'torso'],
      ['leg', 'shoe'], ['skirtInner', 'skirtPetal'], ['skirtPetal', 'sash'],
      ['wingUpper', 'wingTrim'], ['wingLower', 'wingTrim'],
      ['staff', 'staffLeaf'], ['staff', 'staffCore'], ['staffLeaf', 'staffCore'],
      ['hair', 'flowerCrown']
    ],
    materials: {
      skin:     ['skinDark',     'skinMid',     'skinHi'],
      hair:     ['hairDark',     'hairMid',     'hairHi'],
      dress:    ['dressDark',    'dressMid',    'dressHi'],
      petal:    ['petalDark',    'petalMid',    'petalHi'],
      wing:     ['wingDark',     'wingMid',     'wingHi'],
      wingTrim: ['wingTrimDark', 'wingTrimMid', 'wingTrimHi'],
      staff:    ['staffDark',    'staffMid',    'staffHi']
    },
    protectedParts: ['eye', 'staffCore']
  });

  const SKINS = [
    {
      id: 'spring', name: '嫩绿林间', dot: '#68d67c', outline: '#0e1a14',
      pal: {},
      fx: { pollenA: '#a8e87c', pollenB: '#ffe67a', pollenC: '#f8ffd6' }
    },
    {
      id: 'sakura', name: '粉樱花季', dot: '#f592b8', outline: '#1c0e16',
      pal: {
        hairDark:     '#634438', hairMid:     '#9e7360', hairHi:     '#d4ac96',
        dressDark:    '#a8446e', dressMid:    '#e67ca4', dressHi:    '#ffbdd6',
        petalDark:    '#c95884', petalMid:    '#f79ec0', petalHi:    '#ffe0ec',
        wingDark:     '#c78aa6', wingMid:     '#f5cadc', wingHi:     '#fff2f7',
        wingTrimDark: '#b83c6b', wingTrimMid: '#f26b9c', wingTrimHi: '#ffadc9',
        eyeIris:      '#e05388',
        emissiveMid:  '#ff5498', emissiveHot: '#ffa8cc', emissiveCore: '#fff5fa'
      },
      fx: { pollenA: '#ffb8d2', pollenB: '#fff0f6', pollenC: '#ff70a6' }
    },
    {
      id: 'frost', name: '冰青寒霜', dot: '#6ed4f5', outline: '#0b1622',
      pal: {
        hairDark:     '#788ea3', hairMid:     '#b5cce0', hairHi:     '#e6f2fc',
        dressDark:    '#2b6b94', dressMid:    '#62b3db', dressHi:    '#bce8fc',
        petalDark:    '#488cb5', petalMid:    '#8ad4f2', petalHi:    '#def7ff',
        wingDark:     '#429cb8', wingMid:     '#8ce0f5', wingHi:     '#d9fbff',
        wingTrimDark: '#1c5a82', wingTrimMid: '#48b8e8', wingTrimHi: '#a6edff',
        eyeIris:      '#2ba8e6',
        emissiveMid:  '#2cc4ff', emissiveHot: '#8ff0ff', emissiveCore: '#f0feff'
      },
      fx: { pollenA: '#9cebff', pollenB: '#e6fcff', pollenC: '#4dc4f5' }
    },
    {
      id: 'autumn', name: '琥珀秋叶', dot: '#f09438', outline: '#1c100a',
      pal: {
        hairDark:     '#4f2718', hairMid:     '#8a482c', hairHi:     '#bf764c',
        dressDark:    '#9c3b16', dressMid:    '#e07628', dressHi:    '#f7ba52',
        petalDark:    '#b52d1c', petalMid:    '#e85c2c', petalHi:    '#ffaa4c',
        wingDark:     '#b06c24', wingMid:     '#ebb04c', wingHi:     '#ffdf8c',
        wingTrimDark: '#8c1f16', wingTrimMid: '#d94126', wingTrimHi: '#ff8a47',
        eyeIris:      '#e68a1e',
        emissiveMid:  '#ff641c', emissiveHot: '#ffc042', emissiveCore: '#fff7cc'
      },
      fx: { pollenA: '#ffba4c', pollenB: '#ff6e30', pollenC: '#fff2b8' }
    }
  ];

  // 柔和发丝链距离约束
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

  // 弧形包络 + 镶边蝶翅填充器（原汁原味复用 v3 标杆）
  function paintButterflyWing(m, opts) {
    const { side, rootX, rootY, rootZ, lenX, sweepY, liftZ, heightTop, heightBot, halfThick, partId, trimPartId } = opts;
    const ux = side * Math.cos(sweepY) * Math.cos(liftZ);
    const uy = -Math.sin(sweepY) * Math.cos(liftZ);
    const uz = Math.sin(liftZ);
    const vx = 0, vy = -Math.sin(liftZ) * 0.35, vz = Math.cos(liftZ);
    const vLen = Math.hypot(vx, vy, vz) || 1;
    const bx = vx / vLen, by = vy / vLen, bz = vz / vLen;
    const nx = uy * bz - uz * by, ny = uz * bx - ux * bz, nz = ux * by - uy * bx;
    const nLen = Math.hypot(nx, ny, nz) || 1;
    const fnx = nx / nLen, fny = ny / nLen, fnz = nz / nLen;
    const invLen = 1 / lenX;
    const matWing = SPEC.mat('wing'), matTrim = SPEC.mat('wingTrim');
    const hw = m.w * 0.5 - 0.5, hd = m.d * 0.5 - 0.5;
    const { w, d, h, grid, parts } = m;

    for (let z = 0; z < h; z++) {
      const dz = z - rootZ, zOff = z * d * w;
      const dzu = dz * uz, dzb = dz * bz, dzn = dz * fnz;
      for (let y = 0; y < d; y++) {
        const dy = (y - hd) - rootY, row = zOff + y * w;
        const dyu = dzu + dy * uy, dyb = dzb + dy * by, dyn = dzn + dy * fny;
        for (let x = 0; x < w; x++) {
          const i = row + x;
          if (grid[i]) continue;
          const dx = (x - hw) - rootX;
          if (Math.abs(dyn + dx * fnx) > halfThick) continue;
          const uRaw = dyu + dx * ux;
          if (uRaw < -0.4 || uRaw > lenX) continue;
          const u = uRaw <= 0 ? 0 : uRaw * invLen;
          const env = 4 * u * (1 - u * 0.88);
          const envS = env > 0 ? Math.sqrt(env) : 0;
          const topLim = 1.55 + (heightTop - 1.55) * envS;
          const botLim = 1.45 + (heightBot - 1.45) * envS;
          const vRaw = dyb + dx * bx;
          if (vRaw > topLim || vRaw < -botLim) continue;
          const isTrim = u > 0.18 && ((topLim - vRaw) < 1.05 || (vRaw + botLim) < 0.95 || u > 0.85);
          grid[i] = isTrim ? matTrim : matWing;
          parts[i] = isTrim ? trimPartId : partId;
        }
      }
    }
  }

  // 1. 悬空微曲双腿与精灵小鞋（10×10×10，大腿上端收在裙摆内侧防穿背）
  function buildFairyLegsPart(makeCanvas) {
    const m = new VoxelModel(10, 10, 10, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(-1.6, 0.2, 7.4, -2.0, 2.1, 4.6, 1.25, 1.08, mat('skin'), partId.leg, true);
    m.paintCapsule(-2.0, 2.1, 4.6, -2.1, 0.8, 2.0, 1.08, 1.02, mat('skin'), partId.leg, true);
    m.paintEllipsoid(-2.1, 1.2, 1.4, 1.25, 1.65, 1.05, mat('petal'), partId.shoe, true);

    m.paintCapsule(1.6, 0.2, 7.4, 2.0, 2.4, 4.2, 1.25, 1.08, mat('skin'), partId.leg, true);
    m.paintCapsule(2.0, 2.4, 4.2, 2.1, 1.0, 1.3, 1.08, 1.02, mat('skin'), partId.leg, true);
    m.paintEllipsoid(2.1, 1.4, 0.85, 1.25, 1.65, 0.95, mat('petal'), partId.shoe, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0 });
  }

  // 2. 6 瓣立体分层花瓣裙（15×15×9）
  function buildFairySkirtPart(makeCanvas) {
    const m = new VoxelModel(15, 15, 9, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-6.6, 6.6, -6.6, 6.6, 0, 8, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const lobe = Math.cos(ang * 6);
      if (z >= 1 && z <= 7.2) {
        const t = clamp((7.2 - z) / 6.2, 0, 1);
        const rInner = lerp(2.4, 5.1, Math.pow(t, 0.85));
        const rOuter = lerp(2.6, 6.1, Math.pow(t, 0.82)) + (0.65 + t * 0.65) * Math.max(0, lobe);
        if (z >= 2.2 && r <= rOuter && r >= rInner - 1.1 && lobe > -0.15) {
          m.setRaw(x, y, z, mat('petal'), partId.skirtPetal);
          return;
        }
        if (r <= rInner) m.setRaw(x, y, z, mat('dress'), partId.skirtInner);
      }
    });
    m.paintEllipsoid(0, 0.1, 7.2, 3.0, 2.7, 1.1, mat('petal'), partId.sash, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.2 });
  }

  // 3. 常规 / 前倾穿梭双态纤细上身（10×10×10 / 10×14×10）
  function buildFairyTorsoPart(makeCanvas, dartMode = false) {
    const m = new VoxelModel(10, dartMode ? 14 : 10, 10, SPEC);
    const { mat, partId } = SPEC;
    const pitch = dartMode ? 0.56 : 0.0;
    const cp = Math.cos(-pitch), sp = Math.sin(-pitch);
    m.fillAABB(-3.5, 3.5, -3.5, dartMode ? 6.5 : 3.5, 0, 9, (x, y, z, X, Y) => {
      const dy = Y, dz = z - 1.2;
      const ly = dy * cp + dz * sp;
      const lz = 1.2 - dy * sp + dz * cp;
      const dTorso = (Math.hypot(X / 2.75, (ly - 0.1) / 2.35, (lz - 3.9) / 2.9) - 1) * 2.6;
      const dNeck  = (Math.hypot(X / 1.45, (ly - 0.2) / 1.45, (lz - 6.8) / 1.5) - 1) * 1.4;
      if (smin(dTorso, dNeck, 0.9) <= 0) {
        m.setRaw(x, y, z, lz <= 5.2 ? mat('dress') : mat('skin'), partId.torso);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: dartMode ? 3.8 : 3.5 });
  }

  // 4. 精灵小尖耳 + 发髻花瓣发饰 + 抬高刘海 + 0.6 俯视 0 遮挡大眼（15×14×14）
  function buildFairyHeadPart(makeCanvas) {
    const W = 15, D = 14, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hz = 4.8, hy = 0.6;
    m.paintEllipsoid(0, hy, hz, 3.9, 3.9, 3.6, mat('skin'), partId.head, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 3.6, hy - 0.5, hz - 0.2, s * 5.9, hy - 1.1, hz + 1.0, 1.12, 0.82, mat('skin'), partId.ear, true);
    }
    // 柔和发髻、后发、侧发与抬高刘海（z >= hz + 2.6，0.6 俯视绝不压眼）
    m.fillAABB(-4.8, 4.8, -5.2, 4.4, 0, 13, (x, y, z, X, Y) => {
      const dBun = Math.hypot(X / 2.6, (Y + 1.8) / 2.5, (z - (hz + 5.0)) / 2.3);
      if (dBun <= 1.0) { m.setRaw(x, y, z, mat('hair'), partId.hair); return; }
      const dCap = Math.hypot(X / 4.35, (Y - 0.3) / 4.35, (z - (hz + 0.3)) / 4.05);
      if (dCap <= 1.0) {
        if (Y <= 0.4 && z >= 1.6) { m.setRaw(x, y, z, mat('hair'), partId.hair); return; }
        if (Math.abs(X) >= 3.15 && Y <= 2.2 && z >= 2.6) { m.setRaw(x, y, z, mat('hair'), partId.hair); return; }
        if (z >= hz + 2.6 && Y <= 3.3) { m.setRaw(x, y, z, mat('hair'), partId.hair); return; }
      }
      if (Math.hypot(X / 3.4, (Y + 2.8) / 1.6, (z - (hz - 3.0)) / 2.2) <= 1.0) {
        m.setRaw(x, y, z, mat('hair'), partId.hair);
      }
    });
    // 头顶三色小花瓣发饰（Y <= 2.2，绝不压眼）
    m.paintEllipsoid(-2.2, 1.1, hz + 5.0, 1.5, 1.35, 1.25, mat('petal'), partId.flowerCrown, true);
    m.paintEllipsoid(-0.4, 0.9, hz + 5.4, 1.25, 1.15, 1.05, mat('wingTrim'), partId.flowerCrown, true);
    m.paintEllipsoid( 1.2, 0.6, hz + 5.0, 1.35, 1.1,  1.05, mat('dress'), partId.flowerCrown, true);
    m.despeckle();
    m.applyArtShading(true);

    // 清晰 2×2 大眼（0.6 俯视 0 遮挡，eyeGlint 绝不进 glowKeys）
    const eyeZ = Math.round(hz - 0.6);
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (const s of [-1, 1]) {
      const xIn = Math.round(hw + s * 1.5), xOut = Math.round(hw + s * 2.5);
      for (const ex of [xIn, xOut]) {
        let sy = -1;
        for (let y = D - 1; y >= Math.round(hd); y--) {
          if (m.getPartId(ex, y, eyeZ) === partId.head) { sy = y; break; }
        }
        if (sy < 0) continue;
        for (const dz of [0, 1]) {
          const isOut = (ex === xOut);
          const kId = (dz === 1 && !isOut) ? keyToId.eyeGlint : (dz === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(ex, sy, eyeZ + dz, kId, partId.eye);
        }
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.2 });
  }

  function buildFairyHairNode(makeCanvas, radius) {
    const S = Math.ceil(radius * 2 + 3);
    const m = new VoxelModel(S, S, S, SPEC);
    m.paintEllipsoid(0, 0, S * 0.5 - 0.5, radius, radius, radius, SPEC.mat('hair'), SPEC.partId.hair, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: radius });
  }

  function buildFairyArmPart(makeCanvas, side) {
    const m = new VoxelModel(10, 10, 8, SPEC);
    const { mat, partId } = SPEC;
    const s = side;
    m.paintCapsule(0, 0, 4.6, s * 2.1, 1.4, 3.2, 1.15, 1.05, mat('skin'), partId.arm, true);
    m.paintCapsule(s * 2.1, 1.4, 3.2, s * 3.4, 3.5, 4.0, 1.05, 0.98, mat('skin'), partId.arm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0 });
  }

  // 5. 弯头花枝法杖（局部握柄在 (0, 0, 13)，顶端自亮花苞核 +Y/0.6 严格 0 遮挡）
  function buildFairyStaffPart(makeCanvas, castStyle = false) {
    const W = 12, D = castStyle ? 22 : 14, H = castStyle ? 26 : 30;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const tilt = castStyle ? 0.42 : 0.08;
    const mp = (lx, ly, lz) => [lx, ly + (lz - 12) * tilt, lz];
    const p0 = mp(0, 0, 1.5), p1 = mp(0, 0, 13.5), p2 = mp(0.9, 0.8, 21.5), p3 = mp(2.1, 1.6, 24.5), p4 = mp(3.4, 2.4, 25.4);
    m.paintCapsule(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 1.02, 1.06, mat('staff'), partId.staff, true);
    m.paintCapsule(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], 1.06, 1.06, mat('staff'), partId.staff, true);
    m.paintCapsule(p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], 1.06, 1.04, mat('staff'), partId.staff, true);
    m.paintCapsule(p3[0], p3[1], p3[2], p4[0], p4[1], p4[2], 1.04, 1.00, mat('staff'), partId.staff, true);

    const lf1 = mp(-1.0, 0.6, 17.2), lf2 = mp(0.2, 0.6, 22.0);
    m.paintEllipsoid(lf1[0], lf1[1], lf1[2], 1.25, 1.05, 1.08, mat('petal'), partId.staffLeaf, true);
    m.paintEllipsoid(lf2[0], lf2[1], lf2[2], 1.20, 1.02, 1.05, mat('petal'), partId.staffLeaf, true);

    const cx = p4[0] + 1.1, cy = p4[1] + 1.8, cz = p4[2] + 0.6;
    m.fillAABB(cx - 2, cx + 2, cy - 2, cy + 2, cz - 2, cz + 2, (x, y, z, X, Y) => {
      const dc = Math.hypot((X - cx) / 1.65, (Y - cy) / 1.65, (z - cz) / 1.75);
      if (dc <= 1.0) {
        const col = dc <= 0.48 ? keyToId.emissiveCore : (dc <= 0.78 ? keyToId.emissiveHot : keyToId.emissiveMid);
        m.setRaw(x, y, z, col, partId.staffCore);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2 });
  }

  // 6. 四片独立金边蝶翅（翅根局部枢轴固定在 PIVOT，摆放时锁死后背 ±2.0, -2.0）
  const FAIRY_UP_PIVOT = { x: 5.5, y: 2.2 };
  const FAIRY_LO_PIVOT = { x: 3.8, y: 1.6 };

  function buildFairyWingPart(makeCanvas, side, isUpper) {
    const W = isUpper ? 16 : 12, D = isUpper ? 12 : 10, H = isUpper ? 15 : 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const s = side;
    const rx = -s * (isUpper ? FAIRY_UP_PIVOT.x : FAIRY_LO_PIVOT.x);
    const ry = isUpper ? FAIRY_UP_PIVOT.y : FAIRY_LO_PIVOT.y;
    const rz = isUpper ? 5.2 : 5.4;

    m.paintEllipsoid(rx, ry, rz, 1.25, 1.25, 1.35, mat('wing'), isUpper ? partId.wingUpper : partId.wingLower, true);
    paintButterflyWing(m, {
      side: s,
      rootX: rx, rootY: ry, rootZ: rz,
      lenX: isUpper ? 12.2 : 8.4,
      sweepY: isUpper ? 0.36 : 0.44,
      liftZ: isUpper ? 0.42 : -0.34,
      heightTop: isUpper ? 5.0 : 1.9,
      heightBot: isUpper ? 2.2 : 3.2,
      halfThick: isUpper ? 1.28 : 1.22,
      partId: isUpper ? partId.wingUpper : partId.wingLower,
      trimPartId: partId.wingTrim
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: isUpper ? 5.5 : 4.2 });
  }

  const FairyDef = {
    id: 'fairy_meadow',
    name: '林间妖精',
    tag: '四翼蝶舞 · 花枝法杖',
    summary: 'v3 标杆重做：15 部件完整妖精体型（悬空双腿+6瓣花瓣裙+尖耳花饰小头+弯头花枝法杖）+ 锁枢轴四片金边蝶翅 + 8 字急停穿飞',
    defaultHabitat: 'meadow',
    footRadius: 6.2,
    ecoWeight: 0.58,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol',         name: '自由巡游',   loop: true,  status: 'done' },
      { id: 'idle',           name: '原地待机',   loop: true,  status: 'done' },
      { id: 'battle_attack',  name: '螺旋花瓣',   loop: false, duration: 0.85, status: 'done' },
      { id: 'battle_special', name: '切换抵制色', loop: false, duration: 0.85, status: 'done' },
      { id: 'battle_stagger', name: '破盾硬直',   loop: false, duration: 0.85, status: 'done' },
      { id: 'battle_hurt',    name: '受击',       loop: false, duration: 0.35, status: 'done' }
    ],
    blocks: ['完整双腿与花瓣裙', '尖耳花饰2×2大眼', '弯头花枝自亮法杖', '锁枢轴四片金边蝶翅', '8字急停赏花穿飞'],
    soulHabit: '花丛悬停轻舞偶发挥杖洒花粉 ↔ 8 字形高低穿飞与急停赏花悬停节律',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legs:      buildFairyLegsPart(makeCanvas),
        skirt:     buildFairySkirtPart(makeCanvas),
        torso:     buildFairyTorsoPart(makeCanvas, false),
        torsoDart: buildFairyTorsoPart(makeCanvas, true),
        head:      buildFairyHeadPart(makeCanvas),
        hairL:     buildFairyHairNode(makeCanvas, 1.85),
        hairS:     buildFairyHairNode(makeCanvas, 1.40),
        armL:      buildFairyArmPart(makeCanvas, -1),
        armR:      buildFairyArmPart(makeCanvas,  1),
        staffHold: buildFairyStaffPart(makeCanvas, false),
        staffCast: buildFairyStaffPart(makeCanvas, true),
        wingUL:    buildFairyWingPart(makeCanvas, -1, true),
        wingUR:    buildFairyWingPart(makeCanvas,  1, true),
        wingLL:    buildFairyWingPart(makeCanvas, -1, false),
        wingLR:    buildFairyWingPart(makeCanvas,  1, false)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hairChain = [
        { x: hx0, y: hy0 - 3, z: 28 },
        { x: hx0, y: hy0 - 5, z: 25 },
        { x: hx0, y: hy0 - 7, z: 22 }
      ];
      const headSpring = new SpringDamper1D(0, 82, 7.6);

      const state = {
        x: hx0, y: hy0, z: 10.5,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        dartPhase: opts.seed ? (opts.seed % TAU) : 0,
        dartPose: false,
        armLYaw: 0, armLZ: 0,
        armRYaw: 0, armRZ: 0,
        staffCast: false,
        wingPhase: 0,
        wingUpFlap: 0,
        wingLoFlap: 0,
        legSway: 0,
        skirtSway: 0,
        trailCd: 0,
        idleDustCd: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: FairyDef,
        cachePrefix: `fairy_v3b_${Math.random().toString(36).slice(2, 7)}`,
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

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 10.5;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.dartPose = false; state.staffCast = false;
          hairChain[0] = { x: hx, y: hy - 3, z: 28 };
          hairChain[1] = { x: hx, y: hy - 5, z: 25 };
          hairChain[2] = { x: hx, y: hy - 7, z: 22 };
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const speedMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.4, 2.0);
          const act = eco && eco.action;
          const isBattle = act === 'battle_attack' || act === 'battle_special' || act === 'battle_stagger' || act === 'battle_hurt';
          const patrol = eco && eco.patrol !== false;
          const maxR = (eco && eco.maxRadius) || 48;
          const fx = curSkin.fx || SKINS[0].fx;

          if (isBattle) {
            const actT = (eco && eco.actionTime != null) ? eco.actionTime : 0;
            const isNewAct = act !== state._bAct || actT < (state._bLastT || 0) - 0.04;
            if (isNewAct) {
              state._bAct = act;
              state._bFired = false;
              state._bFired2 = false;
              state._bFired3 = false;
              state._bAx = (eco && eco.homeX != null) ? eco.homeX : state.x;
              state._bAy = (eco && eco.homeY != null) ? eco.homeY : state.y;
              state._bYaw = (eco && eco.homeYaw != null) ? eco.homeYaw : state.yaw;
            }
            state._bLastT = actT;
            const ax = (eco && eco.homeX != null) ? eco.homeX : state._bAx;
            const ay = (eco && eco.homeY != null) ? eco.homeY : state._bAy;
            const hasTgt = eco && Array.isArray(eco.targetPos) && eco.targetPos.length >= 2 && Number.isFinite(eco.targetPos[0]) && Number.isFinite(eco.targetPos[1]);
            const tx = hasTgt ? eco.targetPos[0] : ax - Math.sin(state._bYaw) * 46 * sMul;
            const ty = hasTgt ? eco.targetPos[1] : ay + Math.cos(state._bYaw) * 46 * sMul;
            const tz = (hasTgt && Number.isFinite(eco.targetPos[2])) ? eco.targetPos[2] : 10 * sMul;
            const dx = tx - ax, dy = ty - ay;
            const dist = Math.hypot(dx, dy) || 1;
            const dirX = dx / dist, dirY = dy / dist;
            const sideX = -dirY, sideY = dirX;
            const aimYaw = Math.atan2(-dx, dy);

            let wingFreq = 26.0 * gFreq;
            let tgtHeadYaw = 0;
            state.vx = 0; state.vy = 0;

            if (act === 'battle_attack') {
              if (actT < 0.25) {
                const u = smoothstep(0, 1, actT / 0.25);
                state.x = ax - dirX * 2.2 * u * sMul;
                state.y = ay - dirY * 2.2 * u * sMul;
                state.z = lerp(10.5, 16.0, u) * sMul;
                state.yaw = wrapAngle(aimYaw + u * 0.72);
                state.dartPose = false;
                state.staffCast = true;
                state.armLYaw = -0.34 * u; state.armLZ = 2.2 * u * sMul;
                state.armRYaw =  0.34 * u; state.armRZ = 2.4 * u * sMul;
                wingFreq = 34.0 * gFreq;
                if (vfx && Math.random() < 0.55) {
                  const a = actT * 18;
                  vfx.spawnParticle(
                    state.x + Math.cos(a) * 6 * sMul, state.y + Math.sin(a) * 6 * sMul, state.z + 18 * sMul,
                    -Math.cos(a) * 8 * sMul, -Math.sin(a) * 8 * sMul, 4 * sMul,
                    0.24, 1.4, '#ff88b8', true, 0
                  );
                }
              } else if (actT < 0.55) {
                const u = (actT - 0.25) / 0.30;
                const surge = Math.sin(u * Math.PI * 0.5);
                state.x = ax + dirX * (-2.2 + 7.8 * surge) * sMul;
                state.y = ay + dirY * (-2.2 + 7.8 * surge) * sMul;
                state.z = lerp(16.0, 12.2, u) * sMul;
                state.yaw = aimYaw;
                state.dartPose = true;
                state.staffCast = true;
                state.armLYaw = -0.32; state.armLZ = 1.5 * sMul;
                state.armRYaw =  0.35; state.armRZ = 1.8 * sMul;
                wingFreq = 36.0 * gFreq;
                const petalCols = ['#ff88b8', '#ffd6e8', '#ffe67a', '#ff5ea0', '#ffffff'];
                if (!state._bFired && actT >= 0.26) {
                  state._bFired = true;
                  if (vfx) {
                    const z0 = state.z + 17.5 * sMul;
                    for (let i = 0; i < 14; i++) {
                      const ang = (i / 14) * TAU * 2;
                      const rad = (2.6 + (i % 3) * 1.4) * sMul;
                      const flightT = 0.24 + (i / 14) * 0.12;
                      const sx0 = state.x + dirX * 5.0 * sMul + sideX * Math.cos(ang) * rad;
                      const sy0 = state.y + dirY * 5.0 * sMul + sideY * Math.cos(ang) * rad;
                      const sz0 = z0 + Math.sin(ang) * rad * 0.7;
                      const vxP = (tx - sx0 + sideX * Math.cos(ang + 1.4) * 3.8 * sMul) / flightT;
                      const vyP = (ty - sy0 + sideY * Math.cos(ang + 1.4) * 3.8 * sMul) / flightT;
                      const vzP = (tz - sz0) / flightT;
                      vfx.spawnParticle(sx0, sy0, sz0, vxP, vyP, vzP, flightT + 0.08, 1.85 + (i % 2) * 0.35, petalCols[i % petalCols.length], true, 2);
                    }
                  }
                }
                if (!state._bFired2 && actT >= 0.36) {
                  state._bFired2 = true;
                  if (vfx) {
                    const z0 = state.z + 16.5 * sMul;
                    for (let i = 0; i < 10; i++) {
                      const ang = (i / 10) * TAU * 2 + Math.PI;
                      const rad = 3.2 * sMul;
                      const flightT = 0.20 + (i / 10) * 0.08;
                      const sx0 = state.x + dirX * 6.0 * sMul + sideX * Math.cos(ang) * rad;
                      const sy0 = state.y + dirY * 6.0 * sMul + sideY * Math.cos(ang) * rad;
                      const sz0 = z0 + Math.sin(ang) * rad * 0.7;
                      vfx.spawnParticle(sx0, sy0, sz0, (tx - sx0) / flightT, (ty - sy0) / flightT, (tz - sz0) / flightT, flightT + 0.06, 1.7, petalCols[(i + 2) % petalCols.length], true, 2);
                    }
                  }
                }
                if (!state._bFired3 && actT >= 0.50) {
                  state._bFired3 = true;
                  if (vfx) {
                    vfx.addRipple(tx, ty, 3 * sMul, 22 * sMul, 0.50, 2.0);
                    for (let i = 0; i < 16; i++) {
                      const a = (i / 16) * TAU;
                      const spd = (14 + (i % 3) * 6) * sMul;
                      vfx.spawnParticle(
                        tx, ty, tz + 3 * sMul,
                        Math.cos(a) * spd, Math.sin(a) * spd, (8 + (i % 4) * 3) * sMul,
                        0.45 + (i % 3) * 0.08, 1.9, petalCols[i % petalCols.length], true, 16
                      );
                    }
                  }
                }
              } else {
                const u = clamp((actT - 0.55) / 0.30, 0, 1);
                const ret = 1 - smoothstep(0, 1, u);
                state.x = ax + dirX * 5.6 * ret * sMul;
                state.y = ay + dirY * 5.6 * ret * sMul;
                state.z = lerp(10.5, 12.2, ret) * sMul;
                state.yaw = aimYaw;
                state.dartPose = ret > 0.4;
                state.staffCast = ret > 0.3;
                state.armLYaw = -0.32 * ret; state.armLZ = 1.5 * ret * sMul;
                state.armRYaw =  0.35 * ret; state.armRZ = 1.8 * ret * sMul;
              }
              state.wingPhase += dt * wingFreq;
              state.wingUpFlap = Math.sin(state.wingPhase) * 0.52;
              state.wingLoFlap = Math.sin(state.wingPhase - 0.55) * 0.42;
            } else if (act === 'battle_special') {
              const p = clamp(actT / 0.85, 0, 1);
              const spin = smoothstep(0.08, 0.84, p) * TAU;
              const rise = Math.sin(p * Math.PI);
              state.x = ax;
              state.y = ay;
              state.z = (10.5 + rise * 5.8) * sMul;
              state.yaw = wrapAngle(aimYaw + spin);
              state.dartPose = false;
              state.staffCast = p > 0.10 && p < 0.88;
              state.armLYaw = -0.35 * rise; state.armLZ = 2.6 * rise * sMul;
              state.armRYaw =  0.35 * rise; state.armRZ = 2.6 * rise * sMul;
              state.wingPhase += dt * 36.0 * gFreq;
              state.wingUpFlap = Math.sin(state.wingPhase) * 0.54;
              state.wingLoFlap = Math.sin(state.wingPhase - 0.55) * 0.44;
              const ringCols = ['#ff5e7e', '#ffd166', '#46d67a', '#4da8ff', '#c87cff', '#ff94c8', '#ffffff'];
              if (!state._bFired && actT >= 0.18) {
                state._bFired = true;
                if (vfx) {
                  vfx.addRipple(ax, ay, 5 * sMul, 46 * sMul, 0.68, 2.4);
                  for (let i = 0; i < 16; i++) {
                    const a = (i / 16) * TAU;
                    const spd = 48 * sMul;
                    vfx.spawnParticle(ax + Math.cos(a) * 4 * sMul, ay + Math.sin(a) * 4 * sMul, state.z + 12 * sMul,
                      Math.cos(a) * spd, Math.sin(a) * spd, (6 + (i % 3) * 3) * sMul, 0.72, 2.1, ringCols[i % ringCols.length], true, 6);
                  }
                }
              }
              if (!state._bFired2 && actT >= 0.38) {
                state._bFired2 = true;
                if (vfx) {
                  vfx.addRipple(ax, ay, 8 * sMul, 54 * sMul, 0.65, 2.2);
                  vfx.addRipple(tx, ty, 3 * sMul, 24 * sMul, 0.52, 1.9);
                  for (let i = 0; i < 16; i++) {
                    const a = (i / 16) * TAU + 0.2;
                    const spd = 38 * sMul;
                    vfx.spawnParticle(ax + Math.cos(a) * 4 * sMul, ay + Math.sin(a) * 4 * sMul, state.z + 16 * sMul,
                      Math.cos(a) * spd, Math.sin(a) * spd, 10 * sMul, 0.64, 1.95, ringCols[(i + 2) % ringCols.length], true, 10);
                  }
                }
              }
              if (!state._bFired3 && actT >= 0.58) {
                state._bFired3 = true;
                if (vfx) {
                  for (let i = 0; i < 12; i++) {
                    const a = (i / 12) * TAU;
                    const spd = 16 * sMul;
                    vfx.spawnParticle(tx, ty, tz + 4 * sMul,
                      Math.cos(a) * spd, Math.sin(a) * spd, 12 * sMul, 0.48, 1.8, ringCols[(i + 4) % ringCols.length], true, 14);
                  }
                }
              }
            } else if (act === 'battle_stagger') {
              const p = clamp(actT / 0.85, 0, 1);
              const decay = 1 - p;
              const wobble = Math.sin(actT * 34) * 2.0 * decay * sMul;
              state.x = ax - dirX * 3.8 * Math.sin(p * Math.PI) * sMul + sideX * wobble;
              state.y = ay - dirY * 3.8 * Math.sin(p * Math.PI) * sMul + sideY * wobble;
              state.z = lerp(10.5, 6.4, Math.sin(p * Math.PI)) * sMul;
              state.yaw = wrapAngle(aimYaw + Math.sin(actT * 18) * 0.58 * decay);
              state.dartPose = false;
              state.staffCast = false;
              state.armLYaw = -0.30 * decay; state.armLZ = -1.2 * decay * sMul;
              state.armRYaw =  0.30 * decay; state.armRZ = -1.2 * decay * sMul;
              state.wingUpFlap = -0.38 + Math.sin(actT * 28) * 0.14 * decay;
              state.wingLoFlap =  0.30 - Math.sin(actT * 24) * 0.12 * decay;
              if (!state._bFired) {
                state._bFired = true;
                if (vfx) {
                  vfx.addRipple(ax, ay, 4 * sMul, 20 * sMul, 0.56, 1.8);
                  for (let i = 0; i < 14; i++) {
                    const a = (i / 14) * TAU;
                    const spd = (12 + Math.random() * 14) * sMul;
                    vfx.spawnParticle(ax, ay, state.z + 12 * sMul, Math.cos(a) * spd, Math.sin(a) * spd, (10 + Math.random() * 12) * sMul, 0.48, 1.65, i % 2 === 0 ? '#b8f4ff' : '#ffffff', true, 36);
                  }
                }
              }
            } else {
              // battle_hurt (0.35s)
              const p = clamp(actT / 0.35, 0, 1);
              const env = Math.sin(p * Math.PI);
              const vib = Math.sin(actT * 58) * 1.4 * (1 - p) * sMul;
              state.x = ax - dirX * 4.4 * env * sMul + sideX * vib;
              state.y = ay - dirY * 4.4 * env * sMul + sideY * vib;
              state.z = (10.5 - 2.0 * env) * sMul;
              state.yaw = wrapAngle(aimYaw + Math.sin(actT * 46) * 0.18 * (1 - p));
              state.dartPose = false; state.staffCast = false;
              state.armLYaw = 0; state.armRYaw = 0;
              state.wingPhase += dt * 16.0 * gFreq;
              state.wingUpFlap = Math.sin(state.wingPhase) * 0.35;
              state.wingLoFlap = Math.sin(state.wingPhase - 0.55) * 0.25;
              if (!state._bFired) {
                state._bFired = true;
                if (vfx) {
                  for (let i = 0; i < 6; i++) {
                    const a = Math.random() * TAU;
                    vfx.spawnParticle(ax, ay, state.z + 12 * sMul, Math.cos(a) * 12 * sMul, Math.sin(a) * 12 * sMul, 8 * sMul, 0.4, 1.4, fx.pollenA, true, 16);
                  }
                }
              }
            }

            const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
            headSpring.update(dt, tgtHeadYaw, 96 * sp, clamp(7.6 * dScale, 3.2, 12.0));
            state.legSway = Math.sin(time * 4.0) * 0.08;
            state.skirtSway = Math.sin(time * 4.5) * 0.06;
            const hYaw = wrapAngle(state.yaw + clamp(headSpring.x, -0.45, 0.45));
            const [hx, hy] = localToWorldXY(state.x, state.y, state.yaw, 0, (state.dartPose ? 3.2 : 0.2) * sMul);
            const [a0x, a0y] = localToWorldXY(hx, hy, hYaw, 0, -2.8 * sMul);
            hairChain[0].x = a0x; hairChain[0].y = a0y; hairChain[0].z = state.z + 21.8 * sMul;
            const kh = expSmooth(dt, 14.0);
            for (let j = 1; j < hairChain.length; j++) {
              const [htx, hty] = localToWorldXY(a0x, a0y, hYaw, 0, -2.4 * j * sMul);
              hairChain[j].x = lerp(hairChain[j].x, htx, kh);
              hairChain[j].y = lerp(hairChain[j].y, hty, kh);
              hairChain[j].z = lerp(hairChain[j].z, state.z + (21.8 - j * 2.6) * sMul, kh);
            }
            relaxChain(hairChain, 2.7 * sMul);
            sockets.setWorld('head', hx, hy, state.z + (state.dartPose ? 16.6 : 17.6) * sMul, hYaw);
            return;
          }
          state._bAct = '';

          const kSlow = expSmooth(dt, 9.0);
          const kFast = expSmooth(dt, 14.0);

          let wingFreq = 18.0 * gFreq;
          let tgtX = (eco ? (eco.homeX ?? 0) : 0) + Math.sin(time * 1.9) * 1.6;
          let tgtY = (eco ? (eco.homeY ?? 0) : 0) + Math.cos(time * 1.6) * 1.2;
          let tgtLift = (10.0 + Math.sin(time * 4.2 * gFreq) * 1.5) * sMul;
          let tgtYaw = (eco ? (eco.homeYaw ?? 0) : 0) + Math.sin(time * 1.4) * 0.16;
          let tgtHeadYaw = Math.sin(time * 1.1) * 0.24;
          let tgtDart = false;

          const cy = time % 4.5;
          const flour = (cy > 3.0 && cy < 4.2) ? Math.sin(((cy - 3.0) / 1.2) * Math.PI) : 0;
          let tgtArmLYaw = Math.sin(time * 3.0) * 0.16 - flour * 0.35;
          let tgtArmLZ   = (Math.cos(time * 3.0) * 0.5 + flour * 1.8) * sMul;
          let tgtArmRYaw = -Math.sin(time * 2.4) * 0.12 + flour * 0.28;
          let tgtArmRZ   = (Math.sin(time * 2.4) * 0.4 + flour * 1.6) * sMul;
          let tgtStaffCast = flour > 0.52;

          if (patrol) {
            // 蜂鸟/蝶翼 8 字形花间穿梭 + 急停悬停赏花 → 灵巧加速穿飞
            const beat = Math.sin(time * 1.55 * gFreq);
            const dartFactor = smoothstep(-0.25, 0.45, beat);
            state.dartPhase += dt * (0.14 + dartFactor * 0.92) * speedMul;
            wingFreq = (18.0 + dartFactor * 10.0) * gFreq;
            tgtDart = dartFactor > 0.35;

            const rx = Math.min(28.0, maxR * 0.62);
            const ry = Math.min(18.0, maxR * 0.44);
            let nx = Math.sin(state.dartPhase) * rx + ((eco && eco.avoidX) || 0) * 0.35;
            let ny = Math.sin(state.dartPhase * 2.0) * ry + ((eco && eco.avoidY) || 0) * 0.35;
            const dR = Math.hypot(nx, ny);
            if (dR > maxR) { nx *= maxR / dR; ny *= maxR / dR; }

            const vx = Math.cos(state.dartPhase) * rx;
            const vy = Math.cos(state.dartPhase * 2.0) * ry * 2.0;
            tgtX = nx; tgtY = ny;
            tgtLift = (11.5 + Math.sin(state.dartPhase * 3.0) * 4.5 + dartFactor * 2.0) * sMul;
            tgtYaw = Math.atan2(-vx, vy);
            tgtHeadYaw = Math.sin(time * 2.5) * 0.18;
            tgtArmLYaw = -0.28 * dartFactor;
            tgtArmLZ   = 1.2 * dartFactor * sMul;
            tgtArmRYaw =  0.22 * dartFactor;
            tgtArmRZ   = 0.8 * dartFactor * sMul;
            tgtStaffCast = false;

            state.trailCd -= dt;
            if (vfx && state.trailCd <= 0) {
              state.trailCd = dartFactor > 0.3 ? 0.065 : 0.16;
              vfx.spawnParticle(
                state.x + (Math.random() - 0.5) * 4 * sMul,
                state.y + (Math.random() - 0.5) * 4 * sMul,
                state.z + (10 + Math.random() * 6) * sMul,
                (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 3 + Math.random() * 5,
                0.56, 1.35, Math.random() < 0.5 ? fx.pollenA : fx.pollenB, true, 4
              );
            }
          } else if (vfx && flour > 0.4) {
            state.idleDustCd -= dt;
            if (state.idleDustCd <= 0) {
              state.idleDustCd = 0.14;
              const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, 9.2 * sMul, 7.2 * sMul);
              vfx.spawnParticle(
                sx, sy, state.z + 26 * sMul,
                (Math.random() - 0.5) * 9, (Math.random() - 0.5) * 9, 5 + Math.random() * 6,
                0.55, 1.4, Math.random() < 0.5 ? fx.pollenC : fx.pollenA, true, 8
              );
            }
          }

          const kPos = patrol ? kFast : kSlow;
          const nextX = lerp(state.x, tgtX, kPos);
          const nextY = lerp(state.y, tgtY, kPos);
          state.vx = (nextX - state.x) / Math.max(dt, 0.001);
          state.vy = (nextY - state.y) / Math.max(dt, 0.001);
          state.x = nextX;
          state.y = nextY;
          state.z = lerp(state.z, tgtLift, kFast);
          state.yaw = wrapAngle(state.yaw + wrapAngle(tgtYaw - state.yaw) * kFast);
          state.dartPose = tgtDart;
          state.staffCast = tgtStaffCast;

          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          headSpring.update(dt, tgtHeadYaw, 82 * sp, clamp(7.6 * dScale, 3.2, 12.0));
          state.armLYaw = lerp(state.armLYaw, tgtArmLYaw, kFast);
          state.armLZ   = lerp(state.armLZ,   tgtArmLZ,   kFast);
          state.armRYaw = lerp(state.armRYaw, tgtArmRYaw, kFast);
          state.armRZ   = lerp(state.armRZ,   tgtArmRZ,   kFast);

          state.wingPhase += dt * wingFreq;
          state.wingUpFlap = Math.sin(state.wingPhase) * 0.46;
          state.wingLoFlap = Math.sin(state.wingPhase - 0.55) * 0.36;
          state.legSway    = Math.sin(time * 3.0 * gFreq) * 0.08;
          state.skirtSway  = Math.sin(time * 3.4 * gFreq) * 0.06;

          // 飘动后发链实时求解
          const hYaw = wrapAngle(state.yaw + clamp(headSpring.x, -0.45, 0.45));
          const [hx, hy] = localToWorldXY(state.x, state.y, state.yaw, 0, (state.dartPose ? 3.2 : 0.2) * sMul);
          const [a0x, a0y] = localToWorldXY(hx, hy, hYaw, 0, -2.8 * sMul);
          hairChain[0].x = a0x; hairChain[0].y = a0y; hairChain[0].z = state.z + 21.8 * sMul;
          const kh = expSmooth(dt, 12.0);
          for (let j = 1; j < hairChain.length; j++) {
            const wSide = Math.sin(time * 4.2 - j * 0.9) * (1.2 + j * 0.8) * flex * sMul;
            const backPull = (state.dartPose ? 4.2 : 2.2) * j * sMul;
            const [tx, ty] = localToWorldXY(a0x, a0y, hYaw, wSide, -backPull);
            const tz = state.z + (21.8 - j * (state.dartPose ? 1.8 : 2.8)) * sMul;
            hairChain[j].x = lerp(hairChain[j].x, tx, kh);
            hairChain[j].y = lerp(hairChain[j].y, ty, kh);
            hairChain[j].z = lerp(hairChain[j].z, tz, kh);
          }
          relaxChain(hairChain, 2.7 * sMul);

          sockets.setWorld('head', hx, hy, state.z + (state.dartPose ? 16.6 : 17.6) * sMul, hYaw);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const hYaw = wrapAngle(yw + clamp(headSpring.x, -0.45, 0.45));
          const isDart = state.dartPose;

          // 1. 悬空双腿 + 6 瓣分层花瓣裙（双腿严居中且 bias=-2.2，360° 与穿飞绝不穿出裙背）
          const [lgX, lgY] = localToWorldXY(state.x, state.y, yw, 0, (isDart ? -0.35 : 0) * sMul);
          list.push({ partKey: 'legs',  asset: parts.legs,  x: lgX, y: lgY, lift: state.z, ro: yw + state.legSway, bias: -2.2 });
          list.push({ partKey: 'skirt', asset: parts.skirt, x: state.x, y: state.y, lift: state.z + 5.0 * sMul, ro: yw + state.skirtSway, bias: 0.1 });

          // 2. 纤细上身（常规/前倾穿梭双态）
          const tKey = isDart ? 'torsoDart' : 'torso';
          list.push({ partKey: tKey, asset: parts[tKey], x: state.x, y: state.y, lift: state.z + 11.2 * sMul, ro: yw, bias: 0.2 });

          // 3. 精灵小头 + 2 节飘动后发链
          const [hdX, hdY] = localToWorldXY(state.x, state.y, yw, 0, (isDart ? 3.2 : 0.2) * sMul);
          list.push({ partKey: 'head', asset: parts.head, x: hdX, y: hdY, lift: state.z + (isDart ? 16.6 : 17.6) * sMul, ro: hYaw, bias: 0.45 });
          for (let j = 1; j < hairChain.length; j++) {
            const hn = hairChain[j];
            const hKey = j === 1 ? 'hairL' : 'hairS';
            list.push({ partKey: hKey, asset: parts[hKey], x: hn.x, y: hn.y, lift: hn.z - 2.0 * sMul, ro: hYaw, symDeg: 90, bias: -0.15 });
          }

          // 4. 左右臂 + 弯头花枝法杖（握柄锁在右手）
          const shY = (isDart ? 1.8 : 0.2) * sMul;
          const [lShX, lShY] = localToWorldXY(state.x, state.y, yw, -2.6 * sMul, shY);
          const [rShX, rShY] = localToWorldXY(state.x, state.y, yw,  2.6 * sMul, shY);
          const lArmY = yw + state.armLYaw;
          const rArmY = yw + state.armRYaw;
          list.push({ partKey: 'armL', asset: parts.armL, x: lShX, y: lShY, lift: state.z + 11.8 * sMul + state.armLZ, ro: lArmY, bias: 0.2 });
          list.push({ partKey: 'armR', asset: parts.armR, x: rShX, y: rShY, lift: state.z + 11.8 * sMul + state.armRZ, ro: rArmY, bias: 0.2 });

          const [rHdX, rHdY] = localToWorldXY(rShX, rShY, rArmY, 3.4 * sMul, 3.5 * sMul);
          const stKey = state.staffCast ? 'staffCast' : 'staffHold';
          list.push({ partKey: stKey, asset: parts[stKey], x: rHdX, y: rHdY, lift: state.z + 3.0 * sMul + state.armRZ, ro: rArmY, bias: 0.35 });

          // 5. 四片金边蝶翅（翅根严格锁死后背 ±2.0, -2.0 枢轴）
          const bkY = (isDart ? -1.4 : -2.0) * sMul;
          for (const s of [-1, 1]) {
            const [uShX, uShY] = localToWorldXY(state.x, state.y, yw, s * 2.0 * sMul, bkY);
            const uYaw = yw - s * state.wingUpFlap;
            const [uWx, uWy] = localToWorldXY(uShX, uShY, uYaw, s * FAIRY_UP_PIVOT.x * sMul, -FAIRY_UP_PIVOT.y * sMul);
            const uKey = s < 0 ? 'wingUL' : 'wingUR';
            list.push({ partKey: uKey, asset: parts[uKey], x: uWx, y: uWy, lift: state.z + 11.2 * sMul, ro: uYaw, bias: -0.25 });

            const [lShX2, lShY2] = localToWorldXY(state.x, state.y, yw, s * 1.8 * sMul, bkY - 0.2 * sMul);
            const lYaw = yw - s * state.wingLoFlap;
            const [lWx, lWy] = localToWorldXY(lShX2, lShY2, lYaw, s * FAIRY_LO_PIVOT.x * sMul, -FAIRY_LO_PIVOT.y * sMul);
            const lKey = s < 0 ? 'wingLL' : 'wingLR';
            list.push({ partKey: lKey, asset: parts[lKey], x: lWx, y: lWy, lift: state.z + 7.4 * sMul, ro: lYaw, bias: -0.35 });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: FairyDef.id, name: FairyDef.name, outlineMode: 'actorUnified',
            skin: curSkin.id, dartPose: state.dartPose,
            footRadius: FairyDef.footRadius, headZ: 31, centerZ: 18,
            blocks: FairyDef.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(FairyDef);
})(window.PixelWorkshop);
