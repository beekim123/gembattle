'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 洞2 · 岩壁巨蛇（西班牙 Cuélebre · M10 固定盘踞巨型拆块）
  //   1. 巨型拆块（所有部件严格 <= 34 格，守 28MB 贴图预算）：
  //      - rockCoilBase (34×34×13)：后半截粗壮盘踞身躯与青灰岩块融为一体；
  //      - backTorso    (22×22×14)：覆厚重铜青/暖褐大石板鳞片的中段背脊；
  //      - wing         (11×15×9 ×2)：背生一对小皮翼，呼吸与抖鳞时微抖；
  //      - neckSeg      (12×12×10 ×3)：缓慢昂首摆动的厚石板鳞长颈；
  //      - throatSac    (14×14×10) + throatPulse (12×12×8)：前半段喉咙处极醒目的
  //        亮粉红/暖橙柔软搏动喉囊（冷岩与暖喉强对比，俯视一眼锁定）；
  //      - snakeHead    (18×20×13)：厚石板冠巨蛇首，缓慢昂首张颌呼吸；
  //      - shedScale    (7×7×4 ×6池)：周期性抖落的厚石板鳞，配碎石粒子落到地面。
  //   2. 严格守则：27 色 <= 48、0 重色、0 禁用字、零常态 scaleX/scaleY、
  //      全实体与落鳞坐标严格钳制在 maxRadius * 0.80 内。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 青灰岩块与溶洞石笋（与后半身融为一体）
      rockDark:   '#2d353d',
      rockMid:    '#4b5866',
      rockHi:     '#738496',
      // 铜青厚大石板鳞片（主鳞色）
      slateDark:  '#1f4f4c',
      slateMid:   '#357d75',
      slateHi:    '#62b3a6',
      // 暖褐厚石板鳞片（交错大石板层叠感）
      ochreDark:  '#5c3b22',
      ochreMid:   '#91623b',
      ochreHi:    '#c9925e',
      // 背生小皮翼骨架
      wBoneDark:  '#3d2d24',
      wBoneMid:   '#6b5142',
      wBoneHi:    '#9c7c68',
      // 背生小皮翼皮膜
      wMemDark:   '#4d262b',
      wMemMid:    '#7a3e44',
      wMemHi:     '#ab5c63',
      // 标志性柔软搏动喉囊（极醒目亮粉红）
      throatDark: '#b83254',
      throatMid:  '#f25c7c',
      throatHi:   '#ff9cb0',
      // 喉囊搏动暖橙内瓣（增强冷暖对比与搏动层次）
      pulseDark:  '#cc5624',
      pulseMid:   '#ff8a47',
      pulseHi:    '#ffc482',
      // 巨蛇腹底硬甲
      bellyDark:  '#61584c',
      bellyMid:   '#8f8371',
      bellyHi:    '#bfb29d',
      // 巨蛇威严金眼（eyeGlint 绝不进 glowKeys）
      eyeDark:    '#0f0c0a',
      eyeIris:    '#f5be2e',
      eyeGlint:   '#fffbe6'
    },
    glowKeys: [],
    parts: [
      'rock', 'slate', 'ochre', 'wBone', 'wMem',
      'throat', 'pulse', 'belly', 'eye'
    ],
    noCrease: [
      ['rock', 'slate'],
      ['rock', 'ochre'],
      ['slate', 'ochre'],
      ['slate', 'belly'],
      ['wBone', 'wMem'],
      ['throat', 'pulse'],
      ['throat', 'belly'],
      ['slate', 'eye']
    ],
    materials: {
      rock:   ['rockDark',   'rockMid',   'rockHi'],
      slate:  ['slateDark',  'slateMid',  'slateHi'],
      ochre:  ['ochreDark',  'ochreMid',  'ochreHi'],
      wBone:  ['wBoneDark',  'wBoneMid',  'wBoneHi'],
      wMem:   ['wMemDark',   'wMemMid',   'wMemHi'],
      throat: ['throatDark', 'throatMid', 'throatHi'],
      pulse:  ['pulseDark',  'pulseMid',  'pulseHi'],
      belly:  ['bellyDark',  'bellyMid',  'bellyHi']
    },
    protectedParts: ['eye', 'throat', 'pulse']
  });

  // 3 套皮肤（每套严格 27 色 <= 48、0 重色、0 禁用字）
  const SKINS = [
    {
      id: 'verdigris_slate',
      name: '铜青石板鳞（经典岩蛇）',
      dot: '#357d75',
      outline: '#0d1417',
      pal: {},
      fx: { rockA: '#738496', rockB: '#91623b', dust: '#62b3a6' }
    },
    {
      id: 'basalt_rust',
      name: '玄岩赭铜鳞（深矿岩蛇）',
      dot: '#a85a32',
      outline: '#140e0c',
      pal: {
        rockDark:   '#26242b', rockMid:   '#423f4a', rockHi:   '#686475',
        slateDark:  '#6b321d', slateMid:  '#a85a32', slateHi:  '#de8d59',
        ochreDark:  '#474338', ochreMid:  '#756f5d', ochreHi:  '#a8a088',
        wBoneDark:  '#362724', wBoneMid:  '#614842', wBoneHi:  '#917168',
        wMemDark:   '#451f2d', wMemMid:   '#73364b', wMemHi:   '#a65570',
        throatDark: '#c22964', throatMid: '#fa528d', throatHi: '#ff96ba',
        pulseDark:  '#d4691e', pulseMid:  '#ffa03b', pulseHi:  '#ffd685',
        bellyDark:  '#574c45', bellyMid:  '#85756b', bellyHi:  '#b8a599',
        eyeIris:    '#57e39c'
      },
      fx: { rockA: '#686475', rockB: '#a85a32', dust: '#de8d59' }
    },
    {
      id: 'limestone_jade',
      name: '灰岩苍碧鳞（寒洞岩蛇）',
      dot: '#489e82',
      outline: '#0c1514',
      pal: {
        rockDark:   '#3e474f', rockMid:   '#677480', rockHi:   '#98a7b5',
        slateDark:  '#246152', slateMid:  '#489e82', slateHi:  '#85d4b6',
        ochreDark:  '#5c523b', ochreMid:  '#8f805e', ochreHi:  '#c4b289',
        wBoneDark:  '#3d3930', wBoneMid:  '#696254', wBoneHi:  '#99907d',
        wMemDark:   '#3b334d', wMemMid:   '#61547d', wMemHi:   '#8f7fb0',
        throatDark: '#c73e2c', throatMid: '#ff6e4f', throatHi: '#ffad94',
        pulseDark:  '#d97b24', pulseMid:  '#ffb247', pulseHi:  '#ffe094',
        bellyDark:  '#636b67', bellyMid:  '#919c97', bellyHi:  '#c2ccc7',
        eyeIris:    '#ffd53d'
      },
      fx: { rockA: '#98a7b5', rockB: '#8f805e', dust: '#85d4b6' }
    }
  ];

  // =========================================================================
  // 1. 巨型拆块建模（每块严格 <= 34 格）
  // =========================================================================

  // 后半截与青灰岩块融为一体的盘踞岩座（34×34×13）
  function buildRockCoilBase(makeCanvas) {
    const m = new VoxelModel(34, 34, 13, SPEC);
    const { mat, partId } = SPEC;

    // 1. 不规则多棱青灰溶洞岩台基底
    m.fillAABB(-16.0, 16.0, -16.0, 16.0, 0, 10, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X, Y);
      const facet = 14.2 + Math.cos(ang * 5 + 0.4) * 1.4 + Math.sin(ang * 3 - 0.6) * 1.1;
      const topZ = (1.0 - smoothstep(facet * 0.45, facet, r)) * 6.8 + 1.2;
      if (z <= topZ && r <= facet) {
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      }
    });

    // 2. 盘踞在岩座里的后半截粗壮蛇躯（约 240° 粗盘，背覆厚重铜青/暖褐交错大石板鳞）
    const steps = 26;
    for (let i = 0; i < steps; i++) {
      const u = i / (steps - 1);
      // 从后右绕到后左再收向中央前方，半埋于岩块中
      const ang = -0.35 + u * 4.35;
      const rad = lerp(11.6, 5.2, u);
      const cx = Math.cos(ang) * rad;
      const cy = Math.sin(ang) * rad - 1.2;
      const cz = lerp(4.2, 8.6, u);
      const thick = lerp(3.4, 4.6, u);
      // 交错厚重铜青与暖褐大石板鳞片
      const isOchre = (i % 3 === 1);
      const isFusedRock = (i < 5) || (i % 5 === 0 && i < 14);
      const mk = isFusedRock ? 'rock' : (isOchre ? 'ochre' : 'slate');
      m.paintEllipsoid(cx, cy, cz, thick, thick, thick * 0.78, mat(mk), partId[mk], true);

      // 每隔 2 节在背脊顶立起一块厚重块状石板鳞甲
      if (i >= 4 && i % 2 === 0) {
        const smk = (i % 4 === 0) ? 'ochre' : 'slate';
        m.paintEllipsoid(cx, cy, cz + thick * 0.62, 2.3, 2.1, 1.45, mat(smk), partId[smk], true);
      }
    }

    // 3. 岩座外沿 4 根粗短青灰溶洞石笋，强化「与岩层长在一起」的厚重感
    const stalagmites = [
      [-12.2, -6.5, 9.2, 2.5],
      [ 12.6, -5.8, 8.6, 2.4],
      [ -9.8,  8.8, 7.6, 2.2],
      [ 11.2,  7.2, 8.2, 2.3]
    ];
    for (const [sx, sy, sh, sr] of stalagmites) {
      m.paintCapsule(sx, sy, 1.0, sx * 0.96, sy * 0.96, sh, sr, 0.95, mat('rock'), partId.rock, true);
    }

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 15.5, headZ: 12, centerZ: 6 });
  }

  // 中段昂起粗壮蛇背（22×22×14，覆层叠厚重铜青/暖褐大石板鳞）
  function buildBackTorso(makeCanvas) {
    const m = new VoxelModel(22, 22, 14, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-9.5, 9.5, -9.5, 9.5, 0, 12, (x, y, z, X, Y) => {
      const d2 = (X / 7.8) ** 2 + (Y / 8.2) ** 2 + ((z - 6.0) / 5.6) ** 2;
      if (d2 > 1.0) return;
      const isBelly = Y > 4.2 && z < 7.0;
      const plateIdx = Math.floor((z + 1) / 3) + Math.floor((Y + 8) / 4);
      const isOchre = (plateIdx % 2 === 0);
      if (isBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else {
        m.setRaw(x, y, z, isOchre ? mat('ochre') : mat('slate'), isOchre ? partId.ochre : partId.slate);
      }
    });

    // 背脊三块突出大石板厚鳞（棱角厚重，俯视极清晰）
    m.paintEllipsoid(0, -4.8, 10.6, 4.4, 3.0, 2.0, mat('slate'), partId.slate, true);
    m.paintEllipsoid(0,  0.2, 11.4, 4.6, 3.0, 2.1, mat('ochre'), partId.ochre, true);
    m.paintEllipsoid(0,  4.8, 10.4, 4.0, 2.8, 1.9, mat('slate'), partId.slate, true);
    // 两侧肩部嵌入岩质骨棱
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 6.8, -1.5, 7.2, 2.6, 3.4, 2.4, mat('rock'), partId.rock, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.8, headZ: 13, centerZ: 6 });
  }

  // 背生小皮翼（11×15×9，右翼基准，左翼水平对称共用/独立各一份）
  function buildSmallWing(makeCanvas, sideSign) {
    const m = new VoxelModel(11, 15, 9, SPEC);
    const { mat, partId } = SPEC;
    const s = sideSign; // +1 右翼 / -1 左翼

    // 粗短翼骨臂 + 上折翼肘 + 后掠主指骨
    m.paintCapsule(-s * 3.2, 3.0, 3.5, s * 1.4, 1.2, 6.2, 1.25, 0.95, mat('wBone'), partId.wBone, true);
    m.paintCapsule(s * 1.4, 1.2, 6.2, s * 4.0, -4.2, 5.4, 0.95, 0.65, mat('wBone'), partId.wBone, true);
    m.paintCapsule(s * 1.0, 1.0, 5.6, s * 2.2, -5.6, 3.0, 0.78, 0.55, mat('wBone'), partId.wBone, true);

    // 暗红褐薄皮膜（在翼骨与翼根中间铺出清晰小翼面）
    m.fillAABB(-4.8, 4.8, -6.2, 4.0, 1, 7, (x, y, z, X, Y) => {
      const lx = X * s;
      if (lx < -2.6 || lx > 3.8 || Y < -5.6 || Y > 2.6) return;
      const u = clamp((lx + 2.6) / 6.4, 0, 1);
      const maxY = lerp(2.2, -1.8, u);
      const minY = lerp(-3.2, -5.4, u);
      const surfZ = lerp(3.4, 5.2, u) - Math.max(0, -Y - 1.0) * 0.28;
      if (Y >= minY && Y <= maxY && Math.abs(z - surfZ) <= 0.95) {
        if (!m.getId(x, y, z)) {
          m.setRaw(x, y, z, mat('wMem'), partId.wMem);
        }
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8, headZ: 8, centerZ: 4 });
  }

  // 厚石板鳞长颈节（12×12×10，前腹平滑、背脊厚石板鳞）
  function buildNeckSeg(makeCanvas, isOchre) {
    const m = new VoxelModel(12, 12, 10, SPEC);
    const { mat, partId } = SPEC;
    const mainKey = isOchre ? 'ochre' : 'slate';

    m.fillAABB(-5.2, 5.2, -5.2, 5.2, 0, 9, (x, y, z, X, Y) => {
      const d2 = (X / 4.4) ** 2 + (Y / 4.6) ** 2 + ((z - 4.5) / 4.3) ** 2;
      if (d2 > 1.0) return;
      const isBelly = Y > 2.2;
      m.setRaw(x, y, z, isBelly ? mat('belly') : mat(mainKey), isBelly ? partId.belly : partId[mainKey]);
    });
    // 背侧一块宽厚石板鳞凸起
    m.paintEllipsoid(0, -3.2, 5.4, 3.2, 2.0, 2.8, mat(isOchre ? 'slate' : 'ochre'), partId[isOchre ? 'slate' : 'ochre'], true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8, headZ: 9, centerZ: 4 });
  }

  // 极醒目的亮粉红柔软搏动喉囊主体（14×14×10，冷岩中唯一高饱和柔肉器官）
  function buildThroatSac(makeCanvas) {
    const m = new VoxelModel(14, 14, 10, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.2, 6.2, -5.6, 6.4, 0, 9, (x, y, z, X, Y) => {
      const d2 = (X / 5.5) ** 2 + ((Y - 0.5) / 5.4) ** 2 + ((z - 4.5) / 4.4) ** 2;
      if (d2 > 1.0) return;
      // 柔和纵肋纹，亮粉红与暖橙交织出鲜活肉感
      const ang = Math.atan2(X, Y + 1.0);
      const isPulseRib = Y > 1.2 && Math.cos(ang * 4) > 0.52 && z >= 2 && z <= 7;
      m.setRaw(x, y, z, isPulseRib ? mat('pulse') : mat('throat'), isPulseRib ? partId.pulse : partId.throat);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.8, headZ: 9, centerZ: 4 });
  }

  // 喉囊前鼓搏动核（12×12×8，随呼吸前后错位鼓出，不用 scale 也能做出饱满肉囊搏动！）
  function buildThroatPulse(makeCanvas) {
    const m = new VoxelModel(12, 12, 8, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0.6, 3.8, 4.6, 4.4, 3.4, mat('pulse'), partId.pulse, true);
    m.paintEllipsoid(0, 2.2, 4.2, 3.2, 2.8, 2.2, mat('throat'), partId.throat, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8, headZ: 7, centerZ: 3 });
  }

  // 厚重石板甲冠巨蛇首（18×20×13，宽石眉脊 + 粗短石角 + 亮金蛇眼）
  function buildGiantHead(makeCanvas) {
    const W = 18, D = 20, H = 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-7.5, 7.5, -8.5, 8.8, 1, 11, (x, y, z, X, Y) => {
      const tFront = clamp((Y + 6.5) / 14.5, 0, 1);
      const halfW = tFront < 0.35
        ? lerp(5.2, 6.8, tFront / 0.35)
        : lerp(6.8, 3.2, (tFront - 0.35) / 0.65);
      const topZ = lerp(9.8, 6.8, tFront) + (Math.abs(X) > 2.2 && Y > -2 && Y < 3 ? 0.9 : 0);
      const botZ = 2.0 + tFront * 0.6;
      if (Y < -6.8 || Y > 8.2 || z < botZ || z > topZ) return;

      const rx = X / Math.max(1.5, halfW);
      const rz = (z - (botZ + topZ) * 0.5) / Math.max(1.2, (topZ - botZ) * 0.56);
      if (Math.abs(rx) ** 1.65 + Math.abs(rz) ** 1.65 > 1.02) return;

      const isCrownPlate = z >= topZ - 1.6 && Math.abs(X) <= halfW * 0.55 && Y >= -4.0 && Y <= 4.5;
      const isJawBelly = z <= botZ + 1.4;
      if (isJawBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (isCrownPlate) {
        m.setRaw(x, y, z, mat('ochre'), partId.ochre);
      } else {
        m.setRaw(x, y, z, mat('slate'), partId.slate);
      }
    });

    // 一对粗短向后延伸的青灰岩角
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 3.8, -3.4, 8.4, s * 6.4, -7.8, 10.6, 1.75, 1.05, mat('rock'), partId.rock, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 一对威严亮金大蛇眼（eyeGlint 绝不进 glowKeys，0.6 俯视清晰可见）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.4);
    const eyeZ = 7;
    for (const s of [-1, 1]) {
      let sx = Math.round(hw + s * 4.8);
      for (let step = 0; step < 6; step++) {
        const gx = Math.round(hw + s * (6.2 - step));
        if (m.getId(gx, eyeY, eyeZ)) { sx = gx; break; }
      }
      m.setRaw(sx, eyeY,     eyeZ,     keyToId.eyeIris,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ,     keyToId.eyeDark,  partId.eye);
      m.setRaw(sx, eyeY,     eyeZ + 1, keyToId.eyeIris,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 7.2, headZ: 12, centerZ: 6 });
  }

  // 脱落的厚重石板鳞片（7×7×4，抖落落地供溶洞小生物啃食）
  function buildShedScale(makeCanvas) {
    const m = new VoxelModel(7, 7, 4, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-3.0, 3.0, -3.0, 3.0, 0, 3, (x, y, z, X, Y) => {
      const d = Math.abs(X) * 0.92 + Math.abs(Y) * 0.85;
      if (d <= 2.9 - z * 0.45) {
        const isEdge = d >= 2.0 - z * 0.45;
        m.setRaw(x, y, z, isEdge ? mat('ochre') : mat('slate'), isEdge ? partId.ochre : partId.slate);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 3, centerZ: 1 });
  }

  // =========================================================================
  // 2. 生物定义（洞2 · 岩壁巨蛇）
  // =========================================================================
  const Cave2Def = {
    id: 'cave2_cuelebre',
    code: '洞2',
    name: '岩壁巨蛇',
    status: 'done',
    tag: 'M10 固定盘踞巨蛇 · 搏动软喉与抖落石鳞',
    summary: '后半截粗壮身躯与青灰岩块盘踞融为一体，背覆厚重铜青/暖褐大石板鳞片与一对小皮翼，唯独前半段喉咙处是一块极醒目的亮粉红/暖橙柔软搏动喉囊；前半身与长颈缓慢昂首呼吸、喉囊鼓动，周期性抖落厚石鳞配碎石粒子落到地面',
    defaultHabitat: 'cave',
    footRadius: 16.0,
    ecoWeight: 2.6,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '盘踞呼吸与周期掉鳞', loop: true, status: 'done' },
      { id: 'idle',   name: '静伏慢呼吸搏动喉囊', loop: true, status: 'done' },
      { id: 'shed',   name: '高频震翼抖落厚石鳞', loop: true, status: 'done' }
    ],
    blocks: [
      '后半身与青灰岩块融合盘踞座（<= 34 格）',
      '层叠铜青/暖褐大石板厚鳞背脊',
      '背生一对微抖小皮翼',
      '极醒目亮粉红/暖橙柔软搏动喉囊',
      '6 槽脱落石板鳞对象池与碎石粒子'
    ],
    soulHabit: '固定盘踞在暗溶洞岩台上，前半身与长颈缓慢昂首呼吸，唯独柔软的亮粉红/暖橙喉囊一鼓一鼓地搏动；每隔片刻震翼抖落几片厚石板鳞砸在岩地上，引来洞里小生物',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        rockCoilBase: buildRockCoilBase(makeCanvas),
        backTorso:    buildBackTorso(makeCanvas),
        wingL:        buildSmallWing(makeCanvas, -1),
        wingR:        buildSmallWing(makeCanvas,  1),
        neckSlate:    buildNeckSeg(makeCanvas, false),
        neckOchre:    buildNeckSeg(makeCanvas, true),
        throatSac:    buildThroatSac(makeCanvas),
        throatPulse:  buildThroatPulse(makeCanvas),
        snakeHead:    buildGiantHead(makeCanvas),
        shedScale:    buildShedScale(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;
      const seed0 = opts.seed ?? 31;

      const neckSpring = new SpringDamper1D(0, 32, 4.8);
      const wingSpring = new SpringDamper1D(0, 120, 7.5);
      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      // 6 槽脱落厚石鳞对象池
      const SCALES_POOL = 6;
      const droppedScales = Array.from({ length: SCALES_POOL }, () => ({
        active: false,
        x: hx0, y: hy0, z: 0,
        vx: 0, vy: 0, vz: 0,
        yaw: 0, spin: 0,
        landed: false,
        life: 0,
        maxLife: 6.5
      }));

      const state = {
        x: hx0, y: hy0, z: 0,
        vx: 0, vy: 0, yaw: hyaw0,
        breathPhase: 0,
        pulseVal: 0,
        shedCd: 2.2,
        shedTimer: -1,
        shedSeq: 1
      };

      function spawnShedBatch(count, boundR, sMul, vfx, habitat) {
        const fx = curSkin.fx || SKINS[0].fx;
        let spawned = 0;
        for (let i = 0; i < droppedScales.length && spawned < count; i++) {
          const sc = droppedScales[i];
          if (sc.active) continue;
          state.shedSeq++;
          const ang = state.yaw + (hash2i(state.shedSeq, seed0, 101) - 0.5) * 4.2;
          const outDist = lerp(7.5, 11.5, hash2i(state.shedSeq, seed0, 211)) * sMul;
          const sx = state.x + Math.cos(ang) * outDist;
          const sy = state.y + Math.sin(ang) * outDist;
          sc.active = true;
          sc.x = sx;
          sc.y = sy;
          sc.z = lerp(14.0, 21.0, hash2i(state.shedSeq, seed0, 307)) * sMul;
          const spd = lerp(10.5, 17.5, hash2i(state.shedSeq, seed0, 409)) * sMul;
          sc.vx = Math.cos(ang) * spd;
          sc.vy = Math.sin(ang) * spd;
          sc.vz = lerp(6.0, 11.0, hash2i(state.shedSeq, seed0, 503)) * sMul;
          sc.yaw = hash2i(state.shedSeq, seed0, 607) * TAU;
          sc.spin = (hash2i(state.shedSeq, seed0, 709) > 0.5 ? 1 : -1) * 5.2;
          sc.landed = false;
          sc.life = 0;
          sc.maxLife = 6.2;
          spawned++;

          // 伴随碎石粒子抖落
          if (vfx) {
            for (let k = 0; k < 4; k++) {
              const pa = ang + (k - 1.5) * 0.35;
              const pspd = (6.0 + k * 2.5) * sMul;
              vfx.spawnParticle(
                sx, sy, sc.z,
                Math.cos(pa) * pspd, Math.sin(pa) * pspd, (4.0 + k * 1.8) * sMul,
                0.55 + k * 0.08, 1.3,
                (k & 1) ? fx.rockA : fx.rockB, false, 34
              );
            }
          }
        }
        if (vfx && habitat) {
          vfx.spawnDust(state.x, state.y, 4, 0.85 * sMul, habitat.fx);
        }
      }

      const instance = {
        def: Cave2Def,
        cachePrefix: `cave2_cuelebre_${Math.random().toString(36).slice(2, 7)}`,
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
          state.x = hx; state.y = hy; state.z = 0;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.breathPhase = 0;
          state.pulseVal = 0;
          state.shedCd = 1.6;
          state.shedTimer = -1;
          neckSpring.x = neckSpring.v = 0;
          wingSpring.x = wingSpring.v = 0;
          for (const sc of droppedScales) sc.active = false;
          // 首帧先在岩台旁摆 2 片已掉落的厚石板鳞，立刻讲清掉鳞生态
          for (let i = 0; i < 2; i++) {
            const sc = droppedScales[i];
            const a = hyaw + (i === 0 ? 0.95 : -1.15);
            sc.active = true;
            sc.x = hx + Math.cos(a) * 21.0;
            sc.y = hy + Math.sin(a) * 21.0;
            sc.z = 0;
            sc.vx = sc.vy = sc.vz = 0;
            sc.yaw = a + 0.4;
            sc.landed = true;
            sc.life = 1.0;
            sc.maxLife = 7.0;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.35, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.35, 2.2);
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const isIdle = action === 'idle';
          const isShedDemo = action === 'shed';

          const rawMaxR = (eco && eco.maxRadius) || 46;
          const boundR = rawMaxR * 0.80;

          // 本体永久稳固盘踞（坐标钳制在安全半径内）
          const hx = clamp((eco && eco.homeX) ?? 0, -boundR * 0.45, boundR * 0.45);
          const hy = clamp((eco && eco.homeY) ?? 0, -boundR * 0.45, boundR * 0.45);
          const hyaw = (eco && eco.homeYaw) ?? 0;
          state.x = lerp(state.x, hx, expSmooth(dt, 6.0));
          state.y = lerp(state.y, hy, expSmooth(dt, 6.0));
          state.yaw = wrapAngle(hyaw + Math.sin(time * 0.35) * 0.025);
          state.z = 0;

          // 缓慢呼吸与醒目喉囊搏动节律（双峰心搏感）
          state.breathPhase = (state.breathPhase + dt * 1.85 * gFreq) % TAU;
          const slowBreath = 0.5 + 0.5 * Math.sin(state.breathPhase);
          const heartBeat = Math.pow(Math.max(0, Math.sin(state.breathPhase * 2.0)), 4.0) * 0.42;
          state.pulseVal = clamp(slowBreath * 0.72 + heartBeat, 0, 1.15);

          // 周期性抖鳞调度（idle 仅慢呼吸，patrol 每 ~5.2s 抖落一次，shed 每 ~2.2s 频发抖落）
          if (!isIdle) {
            if (state.shedTimer >= 0) {
              state.shedTimer += dt * clamp(spdMul, 0.65, 1.6);
              // 抖鳞震动瞬间：在第 0.25s 甩出厚石鳞与碎石粒子
              if (state.shedTimer >= 0.25 && state.shedTimer - dt * clamp(spdMul, 0.65, 1.6) < 0.25) {
                spawnShedBatch(isShedDemo ? 3 : 2, boundR, sMul, vfx, habitat);
                wingSpring.impulse(4.8 * sp);
              }
              if (state.shedTimer >= 0.95) {
                state.shedTimer = -1;
                state.shedCd = isShedDemo ? 1.8 : 4.8;
              }
            } else {
              state.shedCd -= dt * clamp(spdMul, 0.6, 1.6);
              if (state.shedCd <= 0) {
                state.shedTimer = 0;
                wingSpring.impulse(3.5 * sp);
              }
            }
          } else {
            state.shedTimer = -1;
          }

          // 长颈慢摆与小皮翼微抖弹簧
          const isShaking = state.shedTimer >= 0;
          const neckTarget = isShaking
            ? Math.sin(state.shedTimer * 28.0) * 0.32 * flex
            : Math.sin(time * 0.85 * gFreq) * 0.28 * flex;
          neckSpring.update(dt, neckTarget, (isShaking ? 140 : 32) * sp, isShaking ? 7.0 : 4.8);
          const wingTarget = isShaking
            ? Math.sin(state.shedTimer * 34.0) * 0.45
            : Math.sin(state.breathPhase) * 0.08;
          wingSpring.update(dt, wingTarget, 125 * sp, 7.5);

          // 更新脱落石板鳞抛物线落体、弹跳与回收
          const fx = curSkin.fx || SKINS[0].fx;
          footContacts.length = 0;
          for (let i = 0; i < droppedScales.length; i++) {
            const sc = droppedScales[i];
            if (!sc.active) continue;
            sc.life += dt;
            if (!sc.landed) {
              sc.vz -= 52.0 * sMul * dt;
              sc.x += sc.vx * dt;
              sc.y += sc.vy * dt;
              sc.z += sc.vz * dt;
              sc.yaw = wrapAngle(sc.yaw + sc.spin * dt);

              // 严格钳制落鳞坐标在 boundR 内
              const d = Math.hypot(sc.x, sc.y);
              if (d > boundR && d > 0.001) {
                sc.x *= boundR / d;
                sc.y *= boundR / d;
                sc.vx *= -0.35;
                sc.vy *= -0.35;
              }

              if (sc.z <= 0) {
                sc.z = 0;
                if (Math.abs(sc.vz) > 8.0 * sMul) {
                  // 砸地小弹跳 + 碎石岩尘
                  sc.vz = -sc.vz * 0.34;
                  sc.vx *= 0.45;
                  sc.vy *= 0.45;
                  if (vfx) {
                    vfx.addRipple(sc.x, sc.y, 1.4 * sMul, 7.5 * sMul, 0.48, 1.4);
                    for (let k = 0; k < 3; k++) {
                      const pa = k * 2.1 + sc.yaw;
                      vfx.spawnParticle(
                        sc.x, sc.y, 0.8 * sMul,
                        Math.cos(pa) * 6.5 * sMul, Math.sin(pa) * 6.5 * sMul, 5.5 * sMul,
                        0.38, 1.15, (k & 1) ? fx.rockA : fx.dust, false, 30
                      );
                    }
                  }
                } else {
                  sc.landed = true;
                  sc.vx = sc.vy = sc.vz = 0;
                }
              }
            } else {
              // 落地后确保仍在 boundR 内
              const d = Math.hypot(sc.x, sc.y);
              if (d > boundR && d > 0.001) {
                sc.x *= boundR / d;
                sc.y *= boundR / d;
              }
              if (sc.life < sc.maxLife - 0.8) {
                footContacts.push({ x: sc.x, y: sc.y, z: 0, r: 2.6 * sMul });
              }
            }

            if (sc.life >= sc.maxLife) {
              sc.active = false;
            }
          }

          sockets.setLocal('head', state.x, state.y, 24.5 * sMul, state.yaw, 0, 12.0, 0, sMul);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const sway = clamp(neckSpring.x, -0.45, 0.45);
          const wingFlap = clamp(wingSpring.x, -0.55, 0.55);
          const breathLift = Math.sin(state.breathPhase) * 0.75 * sMul;
          const isShaking = state.shedTimer >= 0;
          const shakeJit = isShaking ? Math.sin(state.shedTimer * 42.0) * 0.65 * sMul : 0;

          // 1. 盘踞融于青灰岩块的后半身岩座
          list.push({
            partKey: 'rockCoilBase',
            asset: parts.rockCoilBase,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            bias: -0.60
          });

          // 2. 覆厚石板鳞的中段背脊（嵌入岩座顶领）
          const [tx, ty] = localToWorldXY(state.x, state.y, yw, shakeJit * 0.4, 2.2 * sMul);
          const torsoLift = 7.2 * sMul + breathLift * 0.35;
          list.push({
            partKey: 'backTorso',
            asset: parts.backTorso,
            x: tx,
            y: ty,
            lift: torsoLift,
            ro: wrapAngle(yw + sway * 0.22),
            bias: 0.05
          });

          // 3. 背生一对小皮翼（呼吸与抖鳞时轻抖）
          for (const s of [-1, 1]) {
            const [wx, wy] = localToWorldXY(tx, ty, wrapAngle(yw + sway * 0.22), s * 8.4 * sMul, -1.6 * sMul);
            list.push({
              partKey: s < 0 ? 'wingL' : 'wingR',
              asset: s < 0 ? parts.wingL : parts.wingR,
              x: wx,
              y: wy,
              lift: torsoLift + (4.2 + Math.abs(wingFlap) * 1.4) * sMul,
              ro: wrapAngle(yw + sway * 0.22 + s * (0.24 + wingFlap * 0.42)),
              bias: 0.22
            });
          }

          // 4. 3 节缓慢昂首摆动的厚石板鳞长颈
          const neckConfigs = [
            { key: 'neckSlate', fwd: 6.4,  z: 12.0, swMul: 0.45 },
            { key: 'neckOchre', fwd: 9.2,  z: 16.4, swMul: 0.72 },
            { key: 'neckSlate', fwd: 11.4, z: 20.6, swMul: 0.95 }
          ];
          let topNeckX = tx, topNeckY = ty, topNeckYaw = yw;
          for (let i = 0; i < neckConfigs.length; i++) {
            const nc = neckConfigs[i];
            const nYaw = wrapAngle(yw + sway * nc.swMul);
            const sideShift = Math.sin(sway * nc.swMul) * (2.6 + i * 1.6) * sMul + shakeJit * (0.4 + i * 0.2);
            const [nx, ny] = localToWorldXY(state.x, state.y, yw, sideShift, nc.fwd * sMul);
            const nLift = nc.z * sMul + breathLift * (0.55 + i * 0.25);
            list.push({
              partKey: nc.key,
              asset: parts[nc.key],
              x: nx,
              y: ny,
              lift: nLift,
              ro: nYaw,
              bias: 0.35 + i * 0.12
            });
            if (i === 2) {
              topNeckX = nx; topNeckY = ny; topNeckYaw = nYaw;
            }
          }

          // 5. 极醒目的亮粉红/暖橙柔软搏动喉囊（外凸在长颈前喉正下方，俯视清晰无遮挡！）
          const pVal = state.pulseVal;
          const [sacX, sacY] = localToWorldXY(topNeckX, topNeckY, topNeckYaw, 0, (2.6 + pVal * 1.1) * sMul);
          const sacLift = (14.4 + pVal * 0.85) * sMul + breathLift * 0.8;
          list.push({
            partKey: 'throatSac',
            asset: parts.throatSac,
            x: sacX,
            y: sacY,
            lift: sacLift,
            ro: topNeckYaw,
            bias: 0.85
          });

          // 喉囊暖橙搏动内瓣（通过前后位移 1.6 格鼓出实现逼真搏动，绝不用 scale 拉伸）
          const [plX, plY] = localToWorldXY(sacX, sacY, topNeckYaw, 0, (1.1 + pVal * 1.75) * sMul);
          list.push({
            partKey: 'throatPulse',
            asset: parts.throatPulse,
            x: plX,
            y: plY,
            lift: sacLift + (0.6 + pVal * 0.55) * sMul,
            ro: topNeckYaw,
            bias: 0.96
          });

          // 6. 厚石板冠巨蛇首（高昂在喉囊上方，缓慢顾盼呼吸）
          const headYaw = wrapAngle(yw + sway * 1.25);
          const [hx, hy] = localToWorldXY(topNeckX, topNeckY, topNeckYaw, 0, 4.4 * sMul);
          const headLift = 23.6 * sMul + breathLift * 1.1;
          list.push({
            partKey: 'snakeHead',
            asset: parts.snakeHead,
            x: hx,
            y: hy,
            lift: headLift,
            ro: headYaw,
            bias: 1.25
          });

          // 7. 周期性抖落到地面的厚重石板鳞片
          for (let i = 0; i < droppedScales.length; i++) {
            const sc = droppedScales[i];
            if (!sc.active) continue;
            const fadeOp = sc.life > sc.maxLife - 1.1
              ? clamp((sc.maxLife - sc.life) / 1.1, 0.08, 1.0)
              : 1.0;
            list.push({
              partKey: 'shedScale',
              asset: parts.shedScale,
              x: sc.x,
              y: sc.y,
              lift: Math.max(0, sc.z),
              ro: sc.yaw,
              opacity: fadeOp,
              bias: -0.25
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Cave2Def.id,
            code: Cave2Def.code,
            name: Cave2Def.name,
            status: Cave2Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            footRadius: Cave2Def.footRadius,
            headZ: 36,
            centerZ: 15,
            blocks: Cave2Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Cave2Def);
})(window.PixelWorkshop);
