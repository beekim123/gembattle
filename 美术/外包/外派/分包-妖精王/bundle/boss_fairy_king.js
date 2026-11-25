'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 第三大 Boss · 妖精王（boss_fairy_king，+Y 正前，z=0 为地面）
  // 血脉承接林间妖精标杆，全面升级为花甸与树冠的凌空王者：
  //   1. 六片金边叠彩巨型扇贝蝶翼（上/中/下三对对称复用，pivotToWorldXY 严锁后背枢轴，
  //      上 -> 中 -> 下依次保持 0.45 rad 相位滞后，呈现丝滑羽浪律动）
  //   2. 枝杈金边鹿角花冠 + 0.6 俯视 0 遮挡精雕 2×2 大眼 + 3 束机身局部坐标背面零穿模长发链
  //   3. 8 瓣立体绽放王者长裙（严遮双腿防背视角穿模）+ 红/绿/蓝三色悬浮花苞法核环绕
  //   4. 枢轴锁死古藤金环自亮花核长权杖（常态 / 施法前指双态）+ 4 套四季一键换色
  //   5. 完整 7 个动作（凌空巡舞 / 花环悬停 / 折翼失衡 / 4 大 Boss 技能分段时间轴与道具演出）
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      skinDark:     '#d49e84',
      skinMid:      '#f4ccb6',
      skinHi:       '#ffe9dc',
      hairDark:     '#6b451d',
      hairMid:      '#bd823c',
      hairHi:       '#f0c472',
      robeDark:     '#1f6e38',
      robeMid:      '#46b85a',
      robeHi:       '#8be388',
      petalDark:    '#4e962b',
      petalMid:     '#92d64b',
      petalHi:      '#dff584',
      goldDark:     '#9e6714',
      goldMid:      '#e8b02e',
      goldHi:       '#ffe675',
      wingDark:     '#4ca8a0',
      wingMid:      '#9be8dc',
      wingHi:       '#e2fff8',
      wingSubDark:  '#b5567c',
      wingSubMid:   '#f08cb4',
      wingSubHi:    '#ffd4e6',
      wingTrimDark: '#b37819',
      wingTrimMid:  '#f2bc38',
      wingTrimHi:   '#ffec87',
      woodDark:     '#452b18',
      woodMid:      '#784d2c',
      woodHi:       '#ad7d52',
      eyeDark:      '#131822',
      eyeIris:      '#24b566',
      eyeGlint:     '#f8fcff',
      budRedDark:   '#a61c36',
      budRedHi:     '#ff5274',
      budGrnDark:   '#1b8a44',
      budGrnHi:     '#5ef07c',
      budBluDark:   '#1b5ea8',
      budBluHi:     '#5cc4ff',
      emissiveMid:  '#4be05c',
      emissiveHot:  '#96ff5e',
      emissiveCore: '#f7ffd8'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'leg', 'boot', 'skirtInner', 'skirtPetal', 'sash',
      'torso', 'collar', 'goldTrim', 'arm',
      'head', 'ear', 'hair', 'eye',
      'antlerWood', 'antlerGold', 'crownFlower', 'crownCore',
      'wingMain', 'wingSub', 'wingTrim',
      'scepterWood', 'scepterGold', 'scepterPetal', 'scepterCore',
      'budShell', 'budCore', 'bladeBody', 'bladeCore', 'spriteBody', 'spriteWing'
    ],
    noCrease: [
      ['eye', 'head'], ['ear', 'head'], ['head', 'torso'],
      ['leg', 'boot'], ['skirtInner', 'skirtPetal'], ['skirtPetal', 'sash'],
      ['torso', 'collar'], ['torso', 'goldTrim'],
      ['antlerWood', 'antlerGold'], ['crownFlower', 'crownCore'],
      ['wingMain', 'wingTrim'], ['wingMain', 'wingSub'], ['wingSub', 'wingTrim'],
      ['scepterWood', 'scepterGold'], ['scepterPetal', 'scepterCore'], ['scepterWood', 'scepterPetal'],
      ['budShell', 'budCore'], ['bladeBody', 'bladeCore'], ['spriteBody', 'spriteWing']
    ],
    materials: {
      skin:     ['skinDark',     'skinMid',     'skinHi'],
      hair:     ['hairDark',     'hairMid',     'hairHi'],
      robe:     ['robeDark',     'robeMid',     'robeHi'],
      petal:    ['petalDark',    'petalMid',    'petalHi'],
      gold:     ['goldDark',     'goldMid',     'goldHi'],
      wing:     ['wingDark',     'wingMid',     'wingHi'],
      wingSub:  ['wingSubDark',  'wingSubMid',  'wingSubHi'],
      wingTrim: ['wingTrimDark', 'wingTrimMid', 'wingTrimHi'],
      wood:     ['woodDark',     'woodMid',     'woodHi']
    },
    protectedParts: ['eye', 'crownCore', 'scepterCore', 'budCore', 'bladeCore']
  });

  const SKINS = [
    {
      id: 'spring_bloom', name: '春华翠金', dot: '#46b85a', outline: '#0d1a14',
      pal: {},
      fx: {
        pollenA: '#96ff5e', pollenB: '#ffe675', pollenC: '#f08cb4',
        decal: '#5ec968', decalHi: '#dff584', decalDark: '#266936',
        heal: '#7cf594'
      }
    },
    {
      id: 'summer_crimson', name: '盛夏绯樱', dot: '#d64062', outline: '#1e0c14',
      pal: {
        hairDark:     '#5e2e2a', hairMid:     '#a65c4e', hairHi:     '#e09b87',
        robeDark:     '#8a1e3c', robeMid:     '#d64062', robeHi:     '#ff85a2',
        petalDark:    '#b0344c', petalMid:    '#f06884', petalHi:    '#ffc0ce',
        goldDark:     '#9e461c', goldMid:     '#e88835', goldHi:     '#ffd478',
        wingDark:     '#c75b4c', wingMid:     '#fa9d7d', wingHi:     '#ffe4cc',
        wingSubDark:  '#c23664', wingSubMid:  '#ff6e9c', wingSubHi:  '#ffcce0',
        wingTrimDark: '#a84624', wingTrimMid: '#eb8638', wingTrimHi: '#ffd17a',
        eyeIris:      '#e63c6c',
        emissiveMid:  '#e8386a', emissiveHot: '#ff7896', emissiveCore: '#fff0f5'
      },
      fx: {
        pollenA: '#ff7896', pollenB: '#ffd478', pollenC: '#ffadc4',
        decal: '#d64062', decalHi: '#ffc0ce', decalDark: '#7a1c35',
        heal: '#ff96b0'
      }
    },
    {
      id: 'autumn_amber', name: '深秋枫琥', dot: '#c96228', outline: '#1c100a',
      pal: {
        hairDark:     '#4d2614', hairMid:     '#8c4926', hairHi:     '#c7794a',
        robeDark:     '#7d3110', robeMid:     '#c96228', robeHi:     '#f59d56',
        petalDark:    '#962418', petalMid:    '#d94a2b', petalHi:    '#ff9c66',
        goldDark:     '#6e431a', goldMid:     '#b57938', goldHi:     '#e6ba78',
        wingDark:     '#ad6c1d', wingMid:     '#ebb142', wingHi:     '#ffe48f',
        wingSubDark:  '#9e3c1b', wingSubMid:  '#e06b34', wingSubHi:  '#ffb678',
        wingTrimDark: '#75481c', wingTrimMid: '#bd7e3a', wingTrimHi: '#edc482',
        eyeIris:      '#e0841e',
        emissiveMid:  '#eb7d1c', emissiveHot: '#ffbf47', emissiveCore: '#fff6cc'
      },
      fx: {
        pollenA: '#ffbf47', pollenB: '#ff7b3b', pollenC: '#ffe48f',
        decal: '#c96228', decalHi: '#ffbf47', decalDark: '#6b2c12',
        heal: '#ffd066'
      }
    },
    {
      id: 'winter_frost', name: '凛冬冰莲', dot: '#3d8ec9', outline: '#0b1624',
      pal: {
        hairDark:     '#6b849e', hairMid:     '#adc6de', hairHi:     '#e6f3ff',
        robeDark:     '#1e5185', robeMid:     '#3d8ec9', robeHi:     '#8cd0fa',
        petalDark:    '#4b7ca8', petalMid:    '#8ec2e8', petalHi:    '#dcf2ff',
        goldDark:     '#6f859c', goldMid:     '#b5c9dc', goldHi:     '#eef7ff',
        wingDark:     '#569ec2', wingMid:     '#a6e3f7', wingHi:     '#ebfcff',
        wingSubDark:  '#5e76b8', wingSubMid:  '#9cb6ed', wingSubHi:  '#deeaff',
        wingTrimDark: '#788fa6', wingTrimMid: '#bccfe0', wingTrimHi: '#f0f8ff',
        woodDark:     '#3e4f63', woodMid:     '#6a829c', woodHi:     '#9eb8d1',
        eyeIris:      '#28a8e6',
        emissiveMid:  '#28b4e8', emissiveHot: '#7ae8ff', emissiveCore: '#ebfdff'
      },
      fx: {
        pollenA: '#7ae8ff', pollenB: '#eef7ff', pollenC: '#9cb6ed',
        decal: '#3d8ec9', decalHi: '#a6e3f7', decalDark: '#1c4470',
        heal: '#8cf0ff'
      }
    }
  ];

  const RGB_COLORS = ['#ff5274', '#5ef07c', '#5cc4ff'];

  // -------------------------------------------------------------------------
  // 体素部件构建（严格单盒 <= 40，对称复用的部件严守中心轴对称与边界留白）
  // -------------------------------------------------------------------------

  // 1. 悬空微曲修长双腿与金边精灵靴（10×10×12，大腿上端收在裙内绝不穿背）
  function buildLegsPart(makeCanvas) {
    const m = new VoxelModel(10, 10, 12, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(-1.5, 0.2, 9.2, -1.9, 1.9, 5.6, 1.25, 1.06, mat('skin'), partId.leg, true);
    m.paintCapsule(-1.9, 1.9, 5.6, -2.0, 0.7, 2.5, 1.06, 0.98, mat('skin'), partId.leg, true);
    m.paintCapsule(-2.0, 0.7, 2.5, -2.0, 1.3, 1.2, 1.16, 1.08, mat('robe'), partId.boot, true);
    m.paintEllipsoid(-2.0, 1.3, 2.7, 1.22, 1.22, 0.65, mat('gold'), partId.goldTrim, true);

    m.paintCapsule(1.5, 0.2, 9.2, 1.9, 2.1, 5.1, 1.25, 1.06, mat('skin'), partId.leg, true);
    m.paintCapsule(1.9, 2.1, 5.1, 2.0, 0.8, 1.7, 1.06, 0.98, mat('skin'), partId.leg, true);
    m.paintCapsule(2.0, 0.8, 1.7, 2.0, 1.4, 0.8, 1.16, 1.08, mat('robe'), partId.boot, true);
    m.paintEllipsoid(2.0, 1.4, 2.1, 1.22, 1.22, 0.65, mat('gold'), partId.goldTrim, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2 });
  }

  // 2. 8 瓣立体层叠王者花瓣长裙 + 金色王权腰带（20×20×13）
  function buildSkirtPart(makeCanvas) {
    const m = new VoxelModel(20, 20, 13, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-9.4, 9.4, -9.4, 9.4, 0, 12, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const lobe8 = Math.cos(ang * 8);
      if (z >= 1 && z <= 10.6) {
        const t = clamp((10.6 - z) / 9.6, 0, 1);
        const rInner = lerp(3.1, 7.2, Math.pow(t, 0.84));
        const rOuter = lerp(3.5, 8.2, Math.pow(t, 0.80)) + (0.75 + t * 0.95) * Math.max(0, lobe8);
        if (z >= 2.6 && r <= rOuter && r >= rInner - 1.3 && lobe8 > -0.18) {
          const isGoldRim = (rOuter - r < 0.85 && z <= 5.0) || (z === 3 && lobe8 > 0.55);
          m.setRaw(x, y, z, isGoldRim ? mat('gold') : mat('petal'), isGoldRim ? partId.goldTrim : partId.skirtPetal);
          return;
        }
        if (r <= rInner) {
          const isHemGold = (z === 1 || z === 2) && r >= rInner - 1.1;
          m.setRaw(x, y, z, isHemGold ? mat('gold') : mat('robe'), isHemGold ? partId.goldTrim : partId.skirtInner);
        }
      }
    });
    m.paintEllipsoid(0, 0.1, 10.7, 3.8, 3.4, 1.3, mat('gold'), partId.sash, true);
    m.paintEllipsoid(0, 3.2, 10.7, 1.25, 0.95, 1.25, mat('petal'), partId.skirtPetal, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.6 });
  }

  // 3. 挺拔纤细上身 + 花萼高领 + 胸前金纹（14×12×13）
  function buildTorsoPart(makeCanvas) {
    const m = new VoxelModel(14, 12, 13, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-6.0, 6.0, -4.8, 4.8, 0, 12, (x, y, z, X, Y) => {
      const rx = lerp(3.1, 4.3, smoothstep(1.0, 8.0, z));
      const ry = lerp(2.6, 3.0, smoothstep(1.0, 8.0, z));
      const dBody = (Math.hypot(X / rx, (Y - 0.1) / ry, (z - 4.8) / 4.3) - 1.0) * 3.0;
      const dNeck = (Math.hypot(X / 1.65, (Y - 0.3) / 1.65, (z - 9.8) / 2.2) - 1.0) * 1.5;
      if (smin(dBody, dNeck, 1.0) <= 0) {
        if (z <= 8.1) {
          const isChestGold = Y > 1.8 && Math.abs(X) <= 1.35 && z >= 4.0 && z <= 7.6;
          m.setRaw(x, y, z, isChestGold ? mat('gold') : mat('robe'), isChestGold ? partId.goldTrim : partId.torso);
        } else {
          m.setRaw(x, y, z, mat('skin'), partId.torso);
        }
      }
    });
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 4.4, 0.0, 7.8, 2.0, 2.2, 1.3, mat('petal'), partId.collar, true);
      m.paintEllipsoid(s * 4.8, 0.2, 8.3, 1.1, 1.3, 0.85, mat('gold'), partId.goldTrim, true);
    }
    m.fillAABB(-4.8, 4.8, -4.4, 1.6, 7, 12, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y + 0.4);
      const flare = 2.6 + (z - 7.5) * 0.42;
      if (Y < 0.8 && r >= flare - 1.25 && r <= flare + 0.55) {
        const isRim = z >= 11 || r > flare + 0.1;
        m.setRaw(x, y, z, isRim ? mat('gold') : mat('petal'), isRim ? partId.goldTrim : partId.collar);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.0 });
  }

  // 4. 精雕五官 + 长尖耳 + 抬高刘海（16×15×15，0.6 俯视 0 遮挡，eyeGlint 绝不进 glowKeys）
  function buildHeadPart(makeCanvas) {
    const W = 16, D = 15, H = 15;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hz = 5.3, hy = 0.7;

    m.paintEllipsoid(0, hy, hz, 4.15, 4.15, 3.85, mat('skin'), partId.head, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 3.8, hy - 0.5, hz - 0.1, s * 6.9, hy - 1.3, hz + 1.4, 1.16, 0.74, mat('skin'), partId.ear, true);
    }

    // 丰盈后发、鬓发与抬高刘海（z >= hz + 2.8，0.6 俯视绝不压眼）
    m.fillAABB(-5.2, 5.2, -5.6, 4.6, 0, 14, (x, y, z, X, Y) => {
      const dCap = Math.hypot(X / 4.65, (Y - 0.35) / 4.65, (z - (hz + 0.45)) / 4.35);
      if (dCap <= 1.0) {
        if (Y <= 0.35 && z >= 1.8) { m.setRaw(x, y, z, mat('hair'), partId.hair); return; }
        if (Math.abs(X) >= 3.35 && Y <= 2.4 && z >= 2.6) { m.setRaw(x, y, z, mat('hair'), partId.hair); return; }
        if (z >= hz + 2.8 && Y <= 3.55) { m.setRaw(x, y, z, mat('hair'), partId.hair); return; }
      }
      if (Math.hypot(X / 3.8, (Y + 3.0) / 1.9, (z - (hz - 2.6)) / 2.6) <= 1.0) {
        m.setRaw(x, y, z, mat('hair'), partId.hair);
      }
    });

    // 额前金丝细冠带（严格位于刘海上方，不压眼）
    m.fillAABB(-4.6, 4.6, -2.5, 4.6, 8, 10, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y - 0.5);
      if (z === 9 && Y > 1.2 && r >= 3.8 && r <= 4.65) {
        m.setRaw(x, y, z, mat('gold'), partId.goldTrim);
      }
    });

    m.despeckle();
    m.applyArtShading(true);

    // 表面扫描精雕 2×2 锐利大眼（eyeGlint 绝不进 glowKeys）
    const eyeZ = Math.round(hz - 0.5);
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
    return m.toStripAsset(makeCanvas, { footRadius: 4.5 });
  }

  // 5. 分叉金边鹿角枝冠 + 盛开顶花（22×14×14，俯视极强王者辨识度）
  function buildAntlerCrownPart(makeCanvas) {
    const m = new VoxelModel(22, 14, 14, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-4.8, 4.8, -4.8, 4.8, 0, 3, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      if (z >= 1 && z <= 2 && r >= 2.8 && r <= 4.35) {
        m.setRaw(x, y, z, mat('gold'), partId.antlerGold);
      }
    });

    for (const s of [-1, 1]) {
      m.paintCapsule(s * 2.5, 0.2, 2.0, s * 5.6, -0.3, 5.6, 1.12, 0.96, mat('wood'), partId.antlerWood, true);
      m.paintCapsule(s * 5.6, -0.3, 5.6, s * 8.4, -0.8, 9.6, 0.96, 0.82, mat('wood'), partId.antlerWood, true);
      m.paintCapsule(s * 8.4, -0.8, 9.6, s * 9.5, -0.9, 12.2, 0.82, 0.65, mat('gold'), partId.antlerGold, true);
      m.paintCapsule(s * 4.4, 0.0, 4.4, s * 4.6, 2.2, 7.6, 0.84, 0.66, mat('gold'), partId.antlerGold, true);
      m.paintCapsule(s * 6.8, -0.5, 7.4, s * 5.8, -0.4, 11.4, 0.82, 0.64, mat('gold'), partId.antlerGold, true);
      m.paintEllipsoid(s * 5.7, 0.6, 8.2, 1.45, 1.35, 1.35, mat('petal'), partId.crownFlower, true);
      m.paintEllipsoid(s * 5.7, 0.9, 8.5, 0.72, 0.72, 0.72, keyToId.emissiveHot, partId.crownCore, true);
    }

    const fx = 0, fy = 2.0, fz = 4.4;
    for (let k = 0; k < 4; k++) {
      const a = k * (TAU * 0.25) + Math.PI * 0.25;
      m.paintEllipsoid(fx + Math.cos(a) * 1.45, fy + Math.sin(a) * 0.85, fz + Math.sin(a) * 1.1, 1.35, 1.2, 1.25, mat('petal'), partId.crownFlower, true);
    }
    m.fillAABB(fx - 1.5, fx + 1.5, fy - 1.2, fy + 1.8, fz - 1.2, fz + 1.6, (x, y, z, X, Y) => {
      const dc = Math.hypot((X - fx) / 1.15, (Y - (fy + 0.35)) / 1.15, (z - fz) / 1.15);
      if (dc <= 1.0) {
        m.setRaw(x, y, z, dc <= 0.55 ? keyToId.emissiveCore : keyToId.emissiveHot, partId.crownCore);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.5 });
  }

  // 6. 飘动长发链节（上节 6×8×7 / 尾节 5×6×6，3 束复用）
  function buildHairSegPart(makeCanvas, isUpper) {
    const W = isUpper ? 6 : 5, D = isUpper ? 8 : 6, H = isUpper ? 7 : 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    if (isUpper) {
      m.paintCapsule(0, 1.2, 4.8, 0, -1.5, 1.8, 1.75, 1.55, mat('hair'), partId.hair, true);
    } else {
      m.paintCapsule(0, 0.9, 4.0, 0, -1.2, 1.2, 1.45, 1.05, mat('hair'), partId.hair, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: isUpper ? 2.1 : 1.6 });
  }

  // 7. 舒展修长单臂资产（6×11×6，沿 +Y 伸展，肩枢轴位于局部 (0, -3.5)，左右臂完全复用）
  const ARM_PIVOT_Y = -3.5;
  const ARM_HAND_LEN = 7.4;

  function buildArmPart(makeCanvas) {
    const m = new VoxelModel(6, 11, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -3.5, 3.2, 0, -0.4, 2.6, 1.38, 1.12, mat('robe'), partId.arm, true);
    m.paintEllipsoid(0, -0.2, 2.6, 1.42, 0.95, 1.28, mat('gold'), partId.goldTrim, true);
    m.paintCapsule(0, -0.1, 2.6, 0, 3.9, 3.1, 1.06, 0.95, mat('skin'), partId.arm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2 });
  }

  // 8. 古藤金环花冠权杖（常态 10×10×32 / 施法前指 10×16×30，握柄枢轴锁死在右手）
  const SCEPTER_HOLD_PIVOT = { y: 0.0, z: 12.0, tipY: 0.9, tipZ: 27.6 };
  const SCEPTER_CAST_PIVOT = { y: -1.8, z: 11.2, tipY: 4.5, tipZ: 26.2 };

  function buildScepterPart(makeCanvas, castStyle) {
    const W = 10, D = castStyle ? 16 : 10, H = castStyle ? 30 : 32;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const tilt = castStyle ? 0.28 : 0.04;
    const pvt = castStyle ? SCEPTER_CAST_PIVOT : SCEPTER_HOLD_PIVOT;
    const mp = (lx, ly, lz) => [lx, pvt.y + ly + (lz - pvt.z) * tilt, lz];

    const p0 = mp(0, 0, 1.5), p1 = mp(0, 0, 12.0), p2 = mp(0, 0, 22.8), p3 = mp(0, 0.3, 25.0);
    m.paintCapsule(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 0.92, 1.05, mat('wood'), partId.scepterWood, true);
    m.paintCapsule(p1[0], p1[1], p1[2], p2[0], p2[1], p2[2], 1.05, 1.02, mat('wood'), partId.scepterWood, true);
    m.paintCapsule(p2[0], p2[1], p2[2], p3[0], p3[1], p3[2], 1.08, 1.15, mat('wood'), partId.scepterWood, true);

    for (const rz of [6.5, 14.5, 21.5]) {
      const rp = mp(0, 0, rz);
      m.paintEllipsoid(rp[0], rp[1], rp[2], 1.38, 1.38, 0.78, mat('gold'), partId.scepterGold, true);
    }
    const lf1 = mp(-1.2, 0.5, 17.5), lf2 = mp(1.2, 0.5, 20.0);
    m.paintEllipsoid(lf1[0], lf1[1], lf1[2], 1.15, 0.95, 1.05, mat('petal'), partId.scepterPetal, true);
    m.paintEllipsoid(lf2[0], lf2[1], lf2[2], 1.15, 0.95, 1.05, mat('petal'), partId.scepterPetal, true);

    const tc = mp(0, 0.5, pvt.tipZ);
    for (let k = 0; k < 4; k++) {
      const a = k * (TAU * 0.25) + Math.PI * 0.25;
      const sx = tc[0] + Math.cos(a) * 2.1;
      const sy = tc[1] + Math.sin(a) * 2.1;
      m.paintCapsule(p3[0], p3[1], p3[2], sx, sy, tc[2] - 0.4, 0.95, 1.12, mat('petal'), partId.scepterPetal, true);
      m.paintEllipsoid(sx, sy, tc[2] + 0.1, 0.82, 0.82, 0.78, mat('gold'), partId.scepterGold, true);
    }

    m.fillAABB(tc[0] - 2.2, tc[0] + 2.2, tc[1] - 2.2, tc[1] + 2.2, tc[2] - 2.0, tc[2] + 2.4, (x, y, z, X, Y) => {
      const dc = Math.hypot((X - tc[0]) / 1.75, (Y - tc[1]) / 1.75, (z - tc[2]) / 1.9);
      if (dc <= 1.0) {
        const col = dc <= 0.48 ? keyToId.emissiveCore : (dc <= 0.78 ? keyToId.emissiveHot : keyToId.emissiveMid);
        m.setRaw(x, y, z, col, partId.scepterCore);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.6 });
  }

  // 9. 六片金边叠彩巨型扇贝蝶翼（上/中/下 3 套资产沿 +X 对称建模，左右完全镜像复用，边界留足余量）
  const WING_CFG = {
    top: { w: 24, d: 8, h: 22, pivotX: -9.6, rootZ: 5.2, lenX: 19.8, liftSlope:  0.34, topH: 8.6, botH: 4.4, scallops: 3, spotU: 0.62, spotR: 2.4 },
    mid: { w: 20, d: 8, h: 17, pivotX: -7.8, rootZ: 7.5, lenX: 16.2, liftSlope:  0.04, topH: 6.2, botH: 5.2, scallops: 3, spotU: 0.58, spotR: 2.0 },
    bot: { w: 15, d: 8, h: 14, pivotX: -5.4, rootZ: 8.4, lenX: 11.2, liftSlope: -0.28, topH: 3.2, botH: 5.0, scallops: 2, spotU: 0.55, spotR: 1.5 }
  };

  function buildWingPart(makeCanvas, cfg) {
    const m = new VoxelModel(cfg.w, cfg.d, cfg.h, SPEC);
    const { mat, partId } = SPEC;
    const matWing = mat('wing'), matSub = mat('wingSub'), matTrim = mat('wingTrim');
    const pMain = partId.wingMain, pSub = partId.wingSub, pTrim = partId.wingTrim;

    m.paintEllipsoid(cfg.pivotX + 0.5, 0, cfg.rootZ, 1.45, 1.35, 1.65, matTrim, pTrim, true);

    const hw = m.w * 0.5 - 0.5, hd = m.d * 0.5 - 0.5;
    const invLen = 1 / cfg.lenX;
    for (let z = 0; z < m.h; z++) {
      for (let y = 0; y < m.d; y++) {
        const Y = y - hd;
        const absY = Math.abs(Y);
        if (absY > 1.55) continue;
        for (let x = 0; x < m.w; x++) {
          const X = x - hw;
          const dx = X - cfg.pivotX;
          if (dx < -0.5 || dx > cfg.lenX + 0.5) continue;
          const u = clamp(dx * invLen, 0, 1);
          const halfThick = lerp(1.38, 1.08, u);
          if (absY > halfThick) continue;

          const arch = Math.sqrt(Math.max(0, 4 * u * (1 - u * 0.86)));
          const scallop = 0.68 * Math.sin(u * Math.PI * cfg.scallops);
          const zMid = cfg.rootZ + dx * cfg.liftSlope;
          const topLim = 1.6 + (cfg.topH - 1.6) * arch + (u > 0.25 ? scallop * 0.52 : 0);
          const botLim = 1.4 + (cfg.botH - 1.4) * Math.pow(arch, 0.92) + (u > 0.25 ? Math.abs(scallop) * 0.42 : 0);
          const dz = z - zMid;
          if (dz > topLim || dz < -botLim) continue;

          const edgeDistTop = topLim - dz;
          const edgeDistBot = dz + botLim;
          const isOuterRim = u > 0.14 && (edgeDistTop < 1.15 || edgeDistBot < 1.10 || u > 0.87);

          const normV = dz / Math.max(1.5, dz >= 0 ? topLim : botLim);
          const isVein = u > 0.08 && u < 0.88 && (
            Math.abs(normV - 0.38) < 0.10 ||
            Math.abs(normV + 0.34) < 0.10
          );

          const spotDz = dz - (cfg.topH - cfg.botH) * 0.22;
          const spotDist = Math.hypot((u - cfg.spotU) * cfg.lenX * 0.82, spotDz);
          const isSpot = spotDist <= cfg.spotR;

          if (isOuterRim || isVein) {
            m.setRaw(x, y, z, matTrim, pTrim);
          } else if (isSpot) {
            m.setRaw(x, y, z, matSub, pSub);
          } else {
            m.setRaw(x, y, z, matWing, pMain);
          }
        }
      }
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: cfg.lenX * 0.42 });
  }

  // 10. 红/绿/蓝三色悬浮花苞法核（7×7×8，4 重对称 symDeg: 90）
  function buildOrbitBudPart(makeCanvas, colorIdx) {
    const m = new VoxelModel(7, 7, 8, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const darkIds = [keyToId.budRedDark, keyToId.budGrnDark, keyToId.budBluDark];
    const hiIds   = [keyToId.budRedHi,   keyToId.budGrnHi,   keyToId.budBluHi];
    const cDark = darkIds[colorIdx], cHi = hiIds[colorIdx];

    m.paintEllipsoid(0, 0, 1.8, 2.2, 2.2, 1.2, mat('gold'), partId.budShell, true);
    m.fillAABB(-2.8, 2.8, -2.8, 2.8, 2, 6, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const t = (z - 2.0) / 4.2;
      const rLim = lerp(2.15, 0.95, t) + 0.35 * Math.cos(ang * 4);
      if (r <= rLim) {
        const isHi = z >= 4 || r >= rLim - 0.65;
        m.setRaw(x, y, z, isHi ? cHi : cDark, partId.budShell);
      }
    });
    m.setRaw(3, 3, 6, keyToId.emissiveHot, partId.budCore);
    m.setRaw(3, 3, 7, keyToId.emissiveCore, partId.budCore);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5 });
  }

  // 11. 技能道具：旋转晶瓣刃（7×13×5，沿 +Y 锐利拉长，symDeg: 180）
  function buildPetalBladePart(makeCanvas) {
    const m = new VoxelModel(7, 13, 5, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-3.0, 3.0, -6.0, 6.0, 0, 4, (x, y, z, X, Y) => {
      const ay = Math.abs(Y);
      if (ay > 5.8) return;
      const halfX = 2.6 * Math.sin(clamp((1 - ay / 5.8) * Math.PI * 0.5, 0, Math.PI * 0.5));
      const halfZ = 1.6 * (1 - ay / 6.8);
      if (Math.abs(X) <= halfX && Math.abs(z - 2.0) <= halfZ) {
        if (Math.abs(X) <= 0.65 && ay <= 3.6 && z >= 2) {
          m.setRaw(x, y, z, ay <= 1.5 ? keyToId.emissiveCore : keyToId.emissiveHot, partId.bladeCore);
        } else if (Math.abs(X) >= halfX - 0.8 || ay >= 4.4) {
          m.setRaw(x, y, z, mat('gold'), partId.goldTrim);
        } else {
          m.setRaw(x, y, z, mat('petal'), partId.bladeBody);
        }
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4 });
  }

  // 12. 技能道具：迷你伴生花灵（10×10×11，技能 3 召出 3 只共享复用）
  function buildMiniSpritePart(makeCanvas) {
    const m = new VoxelModel(10, 10, 11, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.paintEllipsoid(0, 0, 2.8, 2.5, 2.5, 1.8, mat('petal'), partId.skirtPetal, true);
    m.fillAABB(-2.2, 2.2, -2.2, 2.2, 4, 8, (x, y, z, X, Y) => {
      const dc = Math.hypot(X / 1.9, Y / 1.9, (z - 5.8) / 2.0);
      if (dc <= 1.0) {
        const col = dc <= 0.52 ? keyToId.emissiveCore : (dc <= 0.8 ? keyToId.emissiveHot : keyToId.emissiveMid);
        m.setRaw(x, y, z, col, partId.spriteBody);
      }
    });
    m.paintEllipsoid(0, 0, 8.6, 1.25, 1.25, 1.1, mat('gold'), partId.goldTrim, true);
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 3.1, -1.2, 6.2, 1.8, 0.9, 2.2, mat('wing'), partId.spriteWing, true);
      m.paintEllipsoid(s * 2.4, -1.2, 3.8, 1.3, 0.8, 1.4, mat('wingSub'), partId.spriteWing, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4 });
  }

  // -------------------------------------------------------------------------
  // Boss 定义与 7 个连续动作（含 4 大 Boss 技能完整演出）
  // -------------------------------------------------------------------------
  const BossFairyKingDef = {
    id: 'boss_fairy_king',
    name: '妖精王',
    code: 'BOSS3',
    status: 'done',
    tag: '六翼花冠 · 三色法核',
    summary: '花甸与树冠凌空大 Boss：六片金边叠彩巨翼（逐级 0.45 rad 相位浪）+ 枝杈鹿角花冠 + 3 束零穿模长发 + 8 瓣王者长裙 + 红绿蓝悬浮花苞法核 + 古藤权杖与 4 大技能',
    defaultHabitat: 'meadow',
    footRadius: 9.2,
    ecoWeight: 2.2,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '六片金边叠彩巨翼',
      '枝杈鹿角花冠与2×2大眼',
      '机身局部背面零穿模3束长发',
      '8瓣王者长裙与红绿蓝三色花苞',
      '古藤自亮权杖与4大Boss技能'
    ],
    soulHabit: '凌空花环悬停巡舞，三色悬浮花苞绕身盘旋，展六翼掀起花粉迷雾、晶瓣连射、唤灵花舞与六翼彩岚',
    actions: [
      { id: 'patrol',              name: '凌空巡舞',   loop: true,  status: 'done' },
      { id: 'idle',                name: '花环悬停',   loop: true,  status: 'done' },
      { id: 'stagger',             name: '折翼失衡',   loop: false, duration: 1.5, status: 'done' },
      { id: 'skill_pollen_veil',   name: '迷彩花粉',   loop: false, duration: 2.4, status: 'done' },
      { id: 'skill_petal_lance',   name: '晶瓣穿刺',   loop: false, duration: 2.4, status: 'done' },
      { id: 'skill_sprite_waltz',  name: '唤灵花舞',   loop: false, duration: 3.0, status: 'done' },
      { id: 'skill_prism_tempest', name: '六翼彩岚',   loop: false, duration: 3.4, status: 'done' }
    ],
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legs:        buildLegsPart(makeCanvas),
        skirt:       buildSkirtPart(makeCanvas),
        torso:       buildTorsoPart(makeCanvas),
        head:        buildHeadPart(makeCanvas),
        antlerCrown: buildAntlerCrownPart(makeCanvas),
        hairSegL:    buildHairSegPart(makeCanvas, true),
        hairSegS:    buildHairSegPart(makeCanvas, false),
        arm:         buildArmPart(makeCanvas),
        scepterHold: buildScepterPart(makeCanvas, false),
        scepterCast: buildScepterPart(makeCanvas, true),
        wingTop:     buildWingPart(makeCanvas, WING_CFG.top),
        wingMid:     buildWingPart(makeCanvas, WING_CFG.mid),
        wingBot:     buildWingPart(makeCanvas, WING_CFG.bot),
        orbitBudR:   buildOrbitBudPart(makeCanvas, 0),
        orbitBudG:   buildOrbitBudPart(makeCanvas, 1),
        orbitBudB:   buildOrbitBudPart(makeCanvas, 2),
        petalBlade:  buildPetalBladePart(makeCanvas),
        miniSprite:  buildMiniSpritePart(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const headSpring = new SpringDamper1D(0, 76, 8.2);
      const sockets = new SocketTracker();

      const state = {
        x: hx0, y: hy0, z: 9.2,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        yawRate: 0,
        patrolPhase: opts.seed ? (opts.seed % TAU) : 0,
        wingPhase: 0,
        wingFlapTop: 0,
        wingFlapMid: 0,
        wingFlapBot: 0,
        wingSpreadBias: 0,
        wingDropZ: 0,
        armLYaw: 0, armLZ: 0,
        armRYaw: 0, armRZ: 0,
        scepterCast: false,
        scepterSpin: 0,
        legSway: 0,
        skirtSway: 0,
        budAngle: 0,
        budRadius: 14.5,
        budLiftOff: 20.5,
        budScatter: 0,
        budTriadMode: 0,
        hairTime: 0,
        trailCd: 0,
        pollenCd: 0,
        decalCd: 0,
        waltzCd: 0,
        staggerCd: 0,
        curAction: 'patrol',
        lastActionTime: 0,
        lanceFired: [false, false, false, false, false],
        tempestPulse: [false, false, false],
        tempestFired: new Array(9).fill(false),
        blades: [],
        sprites: []
      };

      let curSkinIdx = 0;
      let curSkin = SKINS[0];

      function resetSkillFlags() {
        for (let i = 0; i < 5; i++) state.lanceFired[i] = false;
        for (let i = 0; i < 3; i++) state.tempestPulse[i] = false;
        for (let i = 0; i < 9; i++) state.tempestFired[i] = false;
      }

      function spawnPollenBurst(vfx, x, y, z, count, spread, color) {
        if (!vfx) return;
        for (let i = 0; i < count; i++) {
          const a = (i / Math.max(1, count)) * TAU + Math.random() * 0.45;
          const sp = (0.45 + Math.random() * 0.75) * spread;
          vfx.spawnParticle(
            x + (Math.random() - 0.5) * 2.4,
            y + (Math.random() - 0.5) * 2.4,
            z + (Math.random() - 0.5) * 1.6,
            Math.cos(a) * sp, Math.sin(a) * sp, 6 + Math.random() * 11,
            0.42 + Math.random() * 0.25, 1.35 + Math.random() * 0.65,
            color, i % 2 === 0, 26
          );
        }
      }

      const instance = {
        def: BossFairyKingDef,
        cachePrefix: `boss_fk_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },
        get curSkinIdx() { return curSkinIdx; },

        applySkin(idx) {
          const next = (typeof idx === 'number' && Number.isFinite(idx))
            ? ((Math.floor(idx) % SKINS.length) + SKINS.length) % SKINS.length
            : (curSkinIdx + 1) % SKINS.length;
          curSkinIdx = next;
          curSkin = SKINS[curSkinIdx];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 9.2;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.yawRate = 0;
          state.blades.length = 0;
          state.sprites.length = 0;
          resetSkillFlags();
        },

        update(dt, time, params, habitat, vfx, eco) {
          const safeDt = clamp(dt || 1 / 60, 0.001, 0.06);
          instance.scaleMul = clamp(params.scaleMul ?? params.scale ?? 1.0, 0.5, 2.0);
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? params.spring ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const speedMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const fx = curSkin.fx || SKINS[0].fx;

          const homeX = (eco && eco.homeX) || 0;
          const homeY = (eco && eco.homeY) || 0;
          const homeYaw = (eco && eco.homeYaw) || 0;
          const maxR = Math.min(48, ((eco && (eco.maxRadius ?? eco.radius)) || 48) * 0.72);
          const act = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const actT = (eco && typeof eco.actionTime === 'number') ? eco.actionTime : 0;

          if (act !== state.curAction || actT < state.lastActionTime - 0.05) {
            state.curAction = act;
            resetSkillFlags();
            if (act !== 'skill_sprite_waltz') state.sprites.length = 0;
          }
          state.lastActionTime = actT;
          state.hairTime = time;

          const kSlow = expSmooth(safeDt, 7.5);
          const kFast = expSmooth(safeDt, 12.5);

          let tgtX = homeX + Math.sin(time * 1.45) * 1.8;
          let tgtY = homeY + Math.cos(time * 1.25) * 1.4;
          let tgtZ = (9.2 + Math.sin(time * 3.1 * gFreq) * 1.35) * sMul;
          let tgtYaw = homeYaw + Math.sin(time * 1.05) * 0.14;
          let tgtHeadYaw = Math.sin(time * 1.2) * 0.22;
          let wingFreq = 11.5 * gFreq;
          let wingAmp = 0.42;
          let tgtSpreadBias = 0.0;
          let tgtWingDropZ = 0.0;
          let tgtArmLYaw = -0.34 + Math.sin(time * 2.5) * 0.12;
          let tgtArmLZ = Math.cos(time * 2.5) * 0.65 * sMul;
          let tgtArmRYaw = 0.28 - Math.sin(time * 2.1) * 0.10;
          let tgtArmRZ = Math.sin(time * 2.1) * 0.55 * sMul;
          let tgtScepterCast = false;
          let tgtScepterSpin = 0;
          let budSpeed = 1.65;
          let tgtBudRadius = 14.5;
          let tgtBudLiftOff = 20.5;
          let tgtBudScatter = 0;
          let tgtBudTriad = 0;

          if (act === 'patrol') {
            const beat = Math.sin(time * 1.25 * gFreq);
            const glide = smoothstep(-0.35, 0.55, beat);
            state.patrolPhase += safeDt * (0.28 + glide * 0.68) * speedMul;
            const rx = Math.min(28, maxR * 0.76);
            const ry = Math.min(19, maxR * 0.54);
            tgtX = homeX + Math.sin(state.patrolPhase) * rx;
            tgtY = homeY + Math.sin(state.patrolPhase * 2.0) * ry;
            const dR = Math.hypot(tgtX - homeX, tgtY - homeY);
            if (dR > maxR) {
              tgtX = homeX + (tgtX - homeX) * (maxR / dR);
              tgtY = homeY + (tgtY - homeY) * (maxR / dR);
            }
            const tvx = Math.cos(state.patrolPhase) * rx;
            const tvy = Math.cos(state.patrolPhase * 2.0) * ry * 2.0;
            tgtYaw = Math.atan2(-tvx, tvy);
            tgtZ = (9.6 + Math.sin(state.patrolPhase * 3.0) * 2.6 + glide * 1.4) * sMul;
            wingFreq = (12.5 + glide * 5.0) * gFreq;
            wingAmp = 0.44 + glide * 0.10;
            tgtArmLYaw = -0.45 - glide * 0.14;
            tgtArmRYaw =  0.34 + glide * 0.12;
            budSpeed = 1.95;

            state.trailCd -= safeDt;
            if (vfx && state.trailCd <= 0) {
              state.trailCd = glide > 0.45 ? 0.08 : 0.16;
              vfx.spawnParticle(
                state.x + (Math.random() - 0.5) * 8 * sMul,
                state.y + (Math.random() - 0.5) * 8 * sMul,
                state.z + (14 + Math.random() * 14) * sMul,
                (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 2 + Math.random() * 4,
                0.62, 1.35, Math.random() < 0.5 ? fx.pollenA : fx.pollenB, true, 3
              );
            }
          } else if (act === 'stagger') {
            tgtX = homeX; tgtY = homeY; tgtYaw = homeYaw;
            if (actT < 1.05) {
              const dropEnv = actT < 0.25 ? smoothstep(0, 0.25, actT) : 1.0;
              tgtZ = (9.2 - 5.2 * dropEnv + Math.sin(actT * 26) * 0.65) * sMul;
              tgtWingDropZ = -3.8 * dropEnv * sMul;
              tgtSpreadBias = -0.32 * dropEnv;
              wingFreq = 26.0;
              wingAmp = 0.24;
              tgtHeadYaw = Math.sin(actT * 18.0) * 0.42;
              tgtArmLYaw = -0.78 + Math.sin(actT * 16) * 0.2;
              tgtArmLZ = -2.2 * dropEnv * sMul;
              tgtArmRYaw = 0.68 + Math.cos(actT * 15) * 0.18;
              tgtArmRZ = -2.6 * dropEnv * sMul;
              tgtBudRadius = 19.5;
              tgtBudLiftOff = 15.0;
              tgtBudScatter = dropEnv;
              budSpeed = 0.65;

              state.staggerCd -= safeDt;
              if (vfx && state.staggerCd <= 0) {
                state.staggerCd = 0.09;
                const a = Math.random() * TAU;
                vfx.spawnParticle(
                  state.x + Math.cos(a) * 6 * sMul,
                  state.y + Math.sin(a) * 6 * sMul,
                  state.z + 36 * sMul,
                  Math.cos(a) * 14, Math.sin(a) * 14, 7 + Math.random() * 8,
                  0.45, 1.45, Math.random() < 0.5 ? fx.pollenB : fx.pollenC, true, 24
                );
              }
            } else {
              const rec = smoothstep(1.05, 1.50, actT);
              tgtZ = lerp(4.0, 9.6, rec) * sMul;
              tgtWingDropZ = lerp(-3.8, 0.0, rec) * sMul;
              tgtSpreadBias = lerp(-0.32, 0.18 * Math.sin(rec * Math.PI), rec);
              wingFreq = 18.0;
              wingAmp = 0.54;
              tgtHeadYaw = 0;
              tgtBudRadius = lerp(19.5, 14.5, rec);
              tgtBudLiftOff = lerp(15.0, 20.5, rec);
              tgtBudScatter = 1 - rec;
              budSpeed = 2.4;
            }
          } else if (act === 'skill_pollen_veil') {
            tgtX = homeX; tgtY = homeY; tgtYaw = homeYaw;
            if (actT < 0.60) {
              const u = smoothstep(0, 0.60, actT);
              tgtZ = (9.2 + u * 2.0) * sMul;
              tgtSpreadBias = 0.42 * u;
              wingFreq = 8.0;
              wingAmp = 0.14;
              tgtArmLYaw = lerp(-0.34, -0.95, u);
              tgtArmRYaw = lerp(0.28, 0.85, u);
              tgtArmLZ = u * 2.0 * sMul;
              tgtArmRZ = u * 1.8 * sMul;
              tgtBudRadius = lerp(14.5, 10.5, u);
              budSpeed = 5.4;
            } else if (actT < 1.80) {
              const u = (actT - 0.60) / 1.20;
              tgtZ = (11.2 + Math.sin(u * Math.PI * 4) * 0.9) * sMul;
              tgtSpreadBias = 0.14;
              wingFreq = 28.0 * gFreq;
              wingAmp = 0.56;
              tgtArmLYaw = -0.25 + Math.sin(actT * 12) * 0.25;
              tgtArmRYaw =  0.22 - Math.sin(actT * 12) * 0.22;
              tgtArmLZ = 1.6 * sMul;
              tgtArmRZ = 1.6 * sMul;
              tgtBudRadius = 13.0 + Math.sin(u * Math.PI) * 3.5;
              budSpeed = 4.2;

              state.pollenCd -= safeDt;
              if (vfx && state.pollenCd <= 0) {
                state.pollenCd = 0.032;
                for (let k = 0; k < 3; k++) {
                  const spreadAng = (Math.random() - 0.5) * 1.15;
                  const dirYaw = state.yaw + spreadAng;
                  const spd = 24 + Math.random() * 24;
                  const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, (Math.random() - 0.5) * 14 * sMul, 4 * sMul);
                  const col = k === 0 ? fx.pollenA : (k === 1 ? fx.pollenB : fx.pollenC);
                  vfx.spawnParticle(
                    sx, sy, state.z + (15 + Math.random() * 14) * sMul,
                    -Math.sin(dirYaw) * spd, Math.cos(dirYaw) * spd, (Math.random() - 0.35) * 10,
                    0.75 + Math.random() * 0.35, 1.8 + Math.random() * 0.9,
                    col, true, 10
                  );
                }
              }
              state.decalCd -= safeDt;
              if (vfx && state.decalCd <= 0) {
                state.decalCd = 0.28;
                const dist = 16 + u * 22;
                const lat = (Math.random() - 0.5) * 16;
                const [dx, dy] = localToWorldXY(state.x, state.y, state.yaw, lat * sMul, dist * sMul);
                vfx.addDecal({
                  kind: 'mound', x: dx, y: dy, yaw: state.yaw,
                  rx: 6.5 * sMul, ry: 5.8 * sMul, life: 3.4, alpha: 0.72,
                  color: fx.decal, hiColor: fx.decalHi, darkColor: fx.decalDark
                });
                vfx.addRipple(dx, dy, 3 * sMul, 15 * sMul, 0.75, 1.5);
              }
            } else {
              const u = smoothstep(1.80, 2.40, actT);
              tgtZ = lerp(11.2, 9.2, u) * sMul;
              tgtSpreadBias = lerp(0.14, 0.0, u);
              wingFreq = lerp(22.0, 11.5, u) * gFreq;
              tgtBudRadius = lerp(13.0, 14.5, u);
              budSpeed = 2.0;
            }
          } else if (act === 'skill_petal_lance') {
            tgtX = homeX; tgtY = homeY; tgtYaw = homeYaw;
            if (actT < 0.70) {
              const u = smoothstep(0, 0.70, actT);
              tgtZ = (9.2 + 3.2 * u) * sMul;
              tgtArmLYaw = lerp(-0.34, -0.72, u);
              tgtArmRYaw = lerp(0.28, -0.05, u);
              tgtArmRZ = 3.2 * u * sMul;
              tgtScepterCast = u > 0.35;
              wingFreq = 16.0 * gFreq;
              tgtBudRadius = lerp(14.5, 12.2, u);
              tgtBudLiftOff = lerp(20.5, 25.0, u);
              budSpeed = 4.6;
              if (vfx && Math.random() < 0.45) {
                const tip = sockets.get('scepterTip');
                vfx.spawnParticle(
                  tip.x + (Math.random() - 0.5) * 3, tip.y + (Math.random() - 0.5) * 3, tip.z,
                  (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 4 + Math.random() * 6,
                  0.35, 1.4, fx.pollenA, true, 0
                );
              }
            } else if (actT < 1.80) {
              tgtZ = (12.4 + Math.sin(actT * 8) * 0.45) * sMul;
              tgtArmLYaw = -0.68;
              tgtArmRYaw = -0.06 + Math.sin((actT - 0.7) * 24) * 0.08;
              tgtArmRZ = 2.8 * sMul;
              tgtScepterCast = true;
              wingFreq = 18.0 * gFreq;
              tgtBudRadius = 12.5;
              tgtBudLiftOff = 24.5;
              budSpeed = 4.2;

              const fireTimes = [0.70, 0.88, 1.06, 1.24, 1.42];
              const latOffsets = [0, -7.5, 7.5, -3.8, 3.8];
              for (let fi = 0; fi < 5; fi++) {
                if (!state.lanceFired[fi] && actT >= fireTimes[fi]) {
                  state.lanceFired[fi] = true;
                  const tip = sockets.get('scepterTip');
                  const sx = tip.x || state.x;
                  const sy = tip.y || state.y;
                  const sz = tip.z || (state.z + 36 * sMul);
                  const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw, latOffsets[fi] * sMul, (36 + (fi % 2) * 6) * sMul);
                  const bColor = RGB_COLORS[fi % 3];
                  state.blades.push({
                    mode: 'lance',
                    sx, sy, sz,
                    tx, ty, tz: 2.2 * sMul,
                    x: sx, y: sy, z: sz,
                    t: 0, dur: 0.42,
                    ro: Math.atan2(-(tx - sx), ty - sy),
                    spin: 0,
                    color: bColor,
                    trailCd: 0
                  });
                  spawnPollenBurst(vfx, sx, sy, sz, 5, 14, bColor);
                }
              }
            } else {
              const u = smoothstep(1.80, 2.40, actT);
              tgtZ = lerp(12.4, 9.2, u) * sMul;
              tgtArmLYaw = lerp(-0.68, -0.34, u);
              tgtArmRYaw = lerp(-0.06, 0.28, u);
              tgtArmRZ = lerp(2.8, 0.0, u) * sMul;
              tgtScepterCast = u < 0.35;
              tgtBudRadius = lerp(12.5, 14.5, u);
              tgtBudLiftOff = lerp(24.5, 20.5, u);
              budSpeed = 2.0;
            }
          } else if (act === 'skill_sprite_waltz') {
            tgtX = homeX; tgtY = homeY; tgtYaw = homeYaw;
            if (actT < 0.70) {
              const u = smoothstep(0, 0.70, actT);
              tgtZ = (9.5 + Math.sin(u * Math.PI) * 2.0) * sMul;
              tgtArmRYaw = 0.25 + Math.sin(u * TAU) * 0.48;
              tgtArmRZ = (2.4 + Math.cos(u * TAU) * 1.4) * sMul;
              tgtArmLYaw = -0.55;
              tgtScepterSpin = u * TAU;
              wingFreq = 14.5 * gFreq;
              budSpeed = 3.2;
              state.waltzCd -= safeDt;
              if (vfx && state.waltzCd <= 0) {
                state.waltzCd = 0.22;
                vfx.addRipple(state.x, state.y, 6 * sMul, 28 * sMul, 0.85, 1.7);
              }
            } else if (actT < 2.50) {
              const u = (actT - 0.70) / 1.80;
              tgtZ = (10.2 + Math.sin(actT * 4.5) * 1.4) * sMul;
              tgtArmLYaw = -0.52 + Math.sin(actT * 4.0) * 0.20;
              tgtArmRYaw =  0.46 - Math.sin(actT * 4.0) * 0.20;
              tgtArmLZ = 1.6 * sMul;
              tgtArmRZ = 1.8 * sMul;
              wingFreq = 15.0 * gFreq;
              tgtBudRadius = 15.8;
              budSpeed = 2.6;

              state.sprites.length = 3;
              for (let si = 0; si < 3; si++) {
                const ph = u * TAU * 1.35 + si * (TAU / 3);
                const appear = smoothstep(0, 0.14, u);
                const rX = (15.5 + si * 2.4) * appear * sMul;
                const rY = (11.5 + (si % 2) * 2.2) * appear * sMul;
                const lx = Math.sin(ph) * rX;
                const ly = Math.sin(ph * 2.0) * rY;
                const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, lx, ly);
                const vxL = Math.cos(ph) * rX;
                const vyL = Math.cos(ph * 2.0) * rY * 2.0;
                const wz = state.z + (12.5 + si * 4.2 + Math.cos(ph * 2.0) * 4.5) * sMul;
                state.sprites[si] = {
                  x: wx, y: wy, z: wz,
                  ro: wrapAngle(state.yaw + Math.atan2(-vxL, vyL))
                };
              }
              state.waltzCd -= safeDt;
              if (vfx && state.waltzCd <= 0) {
                state.waltzCd = 0.065;
                const spPick = state.sprites[Math.floor(Math.random() * 3)];
                if (spPick) {
                  vfx.spawnParticle(
                    spPick.x, spPick.y, spPick.z + 4 * sMul,
                    (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 4 + Math.random() * 6,
                    0.55, 1.35, fx.heal, true, 6
                  );
                }
                const a = Math.random() * TAU;
                vfx.spawnParticle(
                  state.x + Math.cos(a) * 9 * sMul, state.y + Math.sin(a) * 9 * sMul, state.z + 4 * sMul,
                  0, 0, 14 + Math.random() * 8,
                  0.68, 1.45, Math.random() < 0.5 ? fx.pollenA : fx.pollenB, true, -2
                );
              }
            } else {
              const u = smoothstep(2.50, 3.00, actT);
              tgtZ = lerp(10.2, 9.2, u) * sMul;
              if (u < 0.82 && state.sprites.length === 3) {
                for (let si = 0; si < 3; si++) {
                  const spObj = state.sprites[si];
                  const ang = u * 3.5 + si * (TAU / 3);
                  const rad = (16 + u * 10) * sMul;
                  const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, Math.cos(ang) * rad, Math.sin(ang) * rad);
                  spObj.x = wx;
                  spObj.y = wy;
                  spObj.z = state.z + (22 + u * 18) * sMul;
                  spObj.ro = wrapAngle(ang + Math.PI * 0.5);
                }
              } else {
                if (state.sprites.length > 0) {
                  for (const spObj of state.sprites) spawnPollenBurst(vfx, spObj.x, spObj.y, spObj.z, 6, 16, fx.heal);
                  state.sprites.length = 0;
                }
              }
            }
          } else if (act === 'skill_prism_tempest') {
            tgtX = homeX; tgtY = homeY; tgtYaw = homeYaw;
            if (actT < 1.05) {
              const u = smoothstep(0, 1.05, actT);
              tgtZ = (9.2 + 5.2 * u) * sMul;
              tgtSpreadBias = 0.52 * u;
              wingFreq = (14.0 + u * 12.0) * gFreq;
              wingAmp = 0.22;
              tgtArmLYaw = lerp(-0.34, -0.92, u);
              tgtArmRYaw = lerp(0.28, 0.72, u);
              tgtArmLZ = 3.2 * u * sMul;
              tgtArmRZ = 3.6 * u * sMul;
              tgtBudTriad = u;
              tgtBudRadius = lerp(14.5, 7.6, u);
              tgtBudLiftOff = lerp(20.5, 45.0, u);
              budSpeed = 3.0 + u * 7.5;

              const pulseTimes = [0.28, 0.62, 0.92];
              for (let pi = 0; pi < 3; pi++) {
                if (!state.tempestPulse[pi] && actT >= pulseTimes[pi]) {
                  state.tempestPulse[pi] = true;
                  spawnPollenBurst(vfx, state.x, state.y, state.z + 46 * sMul, 12, 24, RGB_COLORS[pi]);
                  if (vfx) vfx.addRipple(state.x, state.y, 4 * sMul, (22 + pi * 6) * sMul, 0.65, 1.8);
                }
              }
            } else if (actT < 2.45) {
              tgtZ = (14.4 + Math.sin(actT * 10) * 0.55) * sMul;
              tgtSpreadBias = 0.36;
              wingFreq = 26.0 * gFreq;
              wingAmp = 0.54;
              tgtArmLYaw = -0.78;
              tgtArmRYaw = -0.10;
              tgtArmRZ = 1.6 * sMul;
              tgtScepterCast = true;
              tgtBudTriad = 1.0;
              tgtBudRadius = 8.0;
              tgtBudLiftOff = 45.5;
              budSpeed = 9.0;

              for (let bi = 0; bi < 9; bi++) {
                const fireAt = 1.08 + bi * 0.145;
                if (!state.tempestFired[bi] && actT >= fireAt) {
                  state.tempestFired[bi] = true;
                  const row = Math.floor(bi / 3);
                  const col = (bi % 3) - 1;
                  const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, (col * 10.5) * sMul, (2.0 + row * 2.5) * sMul);
                  const sz = state.z + (36 + (bi % 2) * 5) * sMul;
                  const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw, (col * 17.0 + (row - 1) * 4.0) * sMul, (20 + row * 12.5) * sMul);
                  const bColor = RGB_COLORS[bi % 3];
                  state.blades.push({
                    mode: 'arc',
                    sx, sy, sz,
                    tx, ty, tz: 1.5 * sMul,
                    arcH: (12 + (bi % 3) * 3.5) * sMul,
                    x: sx, y: sy, z: sz,
                    t: 0, dur: 0.68,
                    ro: Math.atan2(-(tx - sx), ty - sy),
                    spin: 0,
                    color: bColor,
                    trailCd: 0
                  });
                  spawnPollenBurst(vfx, sx, sy, sz, 4, 12, bColor);
                }
              }
            } else if (actT < 3.00) {
              const u = (actT - 2.45) / 0.55;
              tgtZ = lerp(14.4, 12.2, u) * sMul;
              tgtSpreadBias = lerp(0.36, 0.14, u);
              wingFreq = 18.0 * gFreq;
              tgtArmRYaw = lerp(-0.10, 0.24, u);
              tgtScepterCast = u < 0.4;
              tgtBudTriad = 1.0 - u * 0.4;
              tgtBudRadius = lerp(8.0, 11.5, u);
              tgtBudLiftOff = lerp(45.5, 34.0, u);
              budSpeed = 5.0;
            } else {
              const u = smoothstep(3.00, 3.40, actT);
              tgtZ = lerp(12.2, 9.2, u) * sMul;
              tgtSpreadBias = lerp(0.14, 0.0, u);
              wingFreq = lerp(16.0, 11.5, u) * gFreq;
              tgtBudTriad = lerp(0.6, 0.0, u);
              tgtBudRadius = lerp(11.5, 14.5, u);
              tgtBudLiftOff = lerp(34.0, 20.5, u);
              budSpeed = 2.0;
            }
          }

          const kPos = act === 'patrol' ? kFast : kSlow;
          const nextX = lerp(state.x, tgtX, kPos);
          const nextY = lerp(state.y, tgtY, kPos);
          state.vx = (nextX - state.x) / safeDt;
          state.vy = (nextY - state.y) / safeDt;
          state.x = nextX;
          state.y = nextY;
          state.z = lerp(state.z, tgtZ, kFast);

          const yawDiff = wrapAngle(tgtYaw - state.yaw);
          const yawStep = yawDiff * kFast;
          state.yaw = wrapAngle(state.yaw + yawStep);
          state.yawRate = lerp(state.yawRate, yawStep / safeDt, expSmooth(safeDt, 10.0));

          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          headSpring.update(safeDt, tgtHeadYaw, 76 * sp, clamp(8.2 * dScale, 3.8, 12.5));

          state.armLYaw = lerp(state.armLYaw, tgtArmLYaw, kFast);
          state.armLZ   = lerp(state.armLZ,   tgtArmLZ,   kFast);
          state.armRYaw = lerp(state.armRYaw, tgtArmRYaw, kFast);
          state.armRZ   = lerp(state.armRZ,   tgtArmRZ,   kFast);
          state.scepterCast = tgtScepterCast;
          state.scepterSpin = lerp(state.scepterSpin, tgtScepterSpin, kFast);

          state.wingPhase += safeDt * wingFreq;
          state.wingSpreadBias = lerp(state.wingSpreadBias, tgtSpreadBias, kFast);
          state.wingDropZ = lerp(state.wingDropZ, tgtWingDropZ, kFast);
          state.wingFlapTop = Math.sin(state.wingPhase) * wingAmp;
          state.wingFlapMid = Math.sin(state.wingPhase - 0.45) * (wingAmp * 0.92);
          state.wingFlapBot = Math.sin(state.wingPhase - 0.90) * (wingAmp * 0.84);

          state.legSway   = Math.sin(time * 2.8 * gFreq) * 0.06;
          state.skirtSway = Math.sin(time * 3.1 * gFreq) * 0.05;

          state.budAngle = wrapAngle(state.budAngle + safeDt * budSpeed);
          state.budRadius = lerp(state.budRadius, tgtBudRadius, kFast);
          state.budLiftOff = lerp(state.budLiftOff, tgtBudLiftOff, kFast);
          state.budScatter = lerp(state.budScatter, tgtBudScatter, kFast);
          state.budTriadMode = lerp(state.budTriadMode, tgtBudTriad, kFast);

          let writeIdx = 0;
          for (let i = 0; i < state.blades.length; i++) {
            const b = state.blades[i];
            b.t += safeDt;
            const u = clamp(b.t / b.dur, 0, 1);
            b.x = lerp(b.sx, b.tx, u);
            b.y = lerp(b.sy, b.ty, u);
            b.z = lerp(b.sz, b.tz, u) + (b.mode === 'arc' ? Math.sin(u * Math.PI) * b.arcH : 0);
            b.spin += safeDt * (b.mode === 'lance' ? 16.0 : 12.0);
            b.trailCd -= safeDt;
            if (vfx && b.trailCd <= 0) {
              b.trailCd = 0.045;
              vfx.spawnParticle(
                b.x, b.y, b.z,
                (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 2 + Math.random() * 4,
                0.34, 1.25, b.color, true, 6
              );
            }
            if (b.t >= b.dur) {
              spawnPollenBurst(vfx, b.tx, b.ty, b.tz + 1.5, b.mode === 'arc' ? 10 : 7, 20, b.color);
              if (vfx) {
                vfx.addRipple(b.tx, b.ty, 2.5 * sMul, (b.mode === 'arc' ? 16 : 11) * sMul, 0.55, 1.5);
                if (b.mode === 'arc') {
                  vfx.addDecal({
                    kind: 'mound', x: b.tx, y: b.ty, yaw: b.ro,
                    rx: 4.5 * sMul, ry: 4.5 * sMul, life: 3.0, alpha: 0.72,
                    color: b.color, hiColor: fx.pollenB, darkColor: fx.decalDark
                  });
                }
              }
            } else {
              state.blades[writeIdx++] = b;
            }
          }
          state.blades.length = writeIdx;

          const yw = state.yaw;
          const hYaw = wrapAngle(yw + clamp(headSpring.x, -0.45, 0.45));
          const [rShX, rShY] = localToWorldXY(state.x, state.y, yw, 4.8 * sMul, 0.5 * sMul);
          const rArmYaw = wrapAngle(yw + state.armRYaw);
          const [rHdX, rHdY] = localToWorldXY(rShX, rShY, rArmYaw, 0, ARM_HAND_LEN * sMul);
          const scepPvt = state.scepterCast ? SCEPTER_CAST_PIVOT : SCEPTER_HOLD_PIVOT;
          const scepYaw = wrapAngle(rArmYaw + state.scepterSpin);
          const [tipX, tipY] = localToWorldXY(rHdX, rHdY, scepYaw, 0, (scepPvt.tipY - scepPvt.y) * sMul);
          const tipZ = state.z + (22.3 - scepPvt.z + scepPvt.tipZ) * sMul + state.armRZ;

          sockets.setWorld('head', state.x, state.y, state.z + 24.0 * sMul, hYaw);
          sockets.setWorld('crown', state.x, state.y, state.z + 32.5 * sMul, hYaw);
          sockets.setWorld('scepterTip', tipX, tipY, tipZ, scepYaw);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const hYaw = wrapAngle(yw + clamp(headSpring.x, -0.45, 0.45));
          const t = state.hairTime;

          list.push({ partKey: 'legs',  asset: parts.legs,  x: state.x, y: state.y, lift: state.z, ro: yw + state.legSway, bias: -2.20 });
          list.push({ partKey: 'skirt', asset: parts.skirt, x: state.x, y: state.y, lift: state.z + 4.0 * sMul, ro: yw + state.skirtSway, bias: -0.10 });

          const [trX, trY] = localToWorldXY(state.x, state.y, yw, 0, 0.3 * sMul);
          list.push({ partKey: 'torso', asset: parts.torso, x: trX, y: trY, lift: state.z + 14.0 * sMul, ro: yw, bias: 0.15 });

          const [hdX, hdY] = localToWorldXY(state.x, state.y, yw, 0, 0.6 * sMul);
          list.push({ partKey: 'head', asset: parts.head, x: hdX, y: hdY, lift: state.z + 24.0 * sMul, ro: hYaw, bias: 0.45 });

          const [crX, crY] = localToWorldXY(hdX, hdY, hYaw, 0, 0.1 * sMul);
          list.push({ partKey: 'antlerCrown', asset: parts.antlerCrown, x: crX, y: crY, lift: state.z + 32.5 * sMul, ro: hYaw, bias: 0.70 });

          const spdRatio = clamp(Math.hypot(state.vx, state.vy) / 28, 0, 1);
          const turnSway = clamp(-state.yawRate * 0.85, -1.65, 1.65);
          const strandX = [-2.55, 0.0, 2.55];
          for (let si = 0; si < 3; si++) {
            const wave1 = Math.sin(t * 4.2 + si * 1.15) * 0.72 + turnSway * 0.55;
            const wave2 = Math.sin(t * 4.2 + si * 1.15 - 0.85) * 1.15 + turnSway;
            const lx1 = (strandX[si] + wave1) * sMul;
            const ly1 = (-4.0 - spdRatio * 1.1) * sMul;
            const [hx1, hy1] = localToWorldXY(state.x, state.y, yw, lx1, ly1);
            list.push({ partKey: 'hairSegL', asset: parts.hairSegL, x: hx1, y: hy1, lift: state.z + 21.0 * sMul, ro: yw, bias: -0.35 });

            const lx2 = (strandX[si] * 1.12 + wave2) * sMul;
            const ly2 = (-5.8 - spdRatio * 2.1) * sMul;
            const [hx2, hy2] = localToWorldXY(state.x, state.y, yw, lx2, ly2);
            list.push({ partKey: 'hairSegS', asset: parts.hairSegS, x: hx2, y: hy2, lift: state.z + 16.0 * sMul, ro: yw, bias: -0.40 });
          }

          const [lShX, lShY] = localToWorldXY(state.x, state.y, yw, -4.8 * sMul, 0.5 * sMul);
          const [rShX, rShY] = localToWorldXY(state.x, state.y, yw,  4.8 * sMul, 0.5 * sMul);
          const lArmYaw = wrapAngle(yw + state.armLYaw);
          const rArmYaw = wrapAngle(yw + state.armRYaw);
          const [lArmX, lArmY] = pivotToWorldXY(lShX, lShY, lArmYaw, 0, ARM_PIVOT_Y * sMul);
          const [rArmX, rArmY] = pivotToWorldXY(rShX, rShY, rArmYaw, 0, ARM_PIVOT_Y * sMul);
          list.push({ partKey: 'arm', asset: parts.arm, x: lArmX, y: lArmY, lift: state.z + 19.2 * sMul + state.armLZ, ro: lArmYaw, bias: 0.30 });
          list.push({ partKey: 'arm', asset: parts.arm, x: rArmX, y: rArmY, lift: state.z + 19.2 * sMul + state.armRZ, ro: rArmYaw, bias: 0.30 });

          const [rHdX, rHdY] = localToWorldXY(rShX, rShY, rArmYaw, 0, ARM_HAND_LEN * sMul);
          const scepKey = state.scepterCast ? 'scepterCast' : 'scepterHold';
          const scepPvt = state.scepterCast ? SCEPTER_CAST_PIVOT : SCEPTER_HOLD_PIVOT;
          const scepYaw = wrapAngle(rArmYaw + state.scepterSpin);
          const [scX, scY] = pivotToWorldXY(rHdX, rHdY, scepYaw, 0, scepPvt.y * sMul);
          list.push({
            partKey: scepKey, asset: parts[scepKey],
            x: scX, y: scY,
            lift: state.z + (22.3 - scepPvt.z) * sMul + state.armRZ,
            ro: scepYaw, bias: 0.60
          });

          const wingDefs = [
            { key: 'wingTop', cfg: WING_CFG.top, shX: 2.4, shY: -3.2, zOff: 16.5, sweep: 0.34, flap: state.wingFlapTop, bias: -0.60 },
            { key: 'wingMid', cfg: WING_CFG.mid, shX: 2.2, shY: -3.4, zOff: 12.0, sweep: 0.44, flap: state.wingFlapMid, bias: -0.80 },
            { key: 'wingBot', cfg: WING_CFG.bot, shX: 2.0, shY: -3.4, zOff:  8.5, sweep: 0.56, flap: state.wingFlapBot, bias: -1.00 }
          ];
          for (let wi = 0; wi < wingDefs.length; wi++) {
            const wd = wingDefs[wi];
            const sweepAll = clamp(wd.sweep + state.wingSpreadBias + wd.flap, -0.35, 1.38);
            for (const s of [-1, 1]) {
              const [jX, jY] = localToWorldXY(state.x, state.y, yw, s * wd.shX * sMul, wd.shY * sMul);
              const wYaw = s > 0 ? wrapAngle(yw - sweepAll) : wrapAngle(yw + Math.PI + sweepAll);
              const [wX, wY] = pivotToWorldXY(jX, jY, wYaw, wd.cfg.pivotX * sMul, 0);
              list.push({
                partKey: wd.key, asset: parts[wd.key],
                x: wX, y: wY,
                lift: state.z + wd.zOff * sMul + state.wingDropZ,
                ro: wYaw, bias: wd.bias
              });
            }
          }

          const budKeys = ['orbitBudR', 'orbitBudG', 'orbitBudB'];
          for (let bi = 0; bi < 3; bi++) {
            const ang = state.budAngle + bi * (TAU / 3);
            const scatterR = state.budScatter * Math.sin(t * 9.0 + bi * 2.1) * 4.5;
            const rad = (state.budRadius + scatterR) * sMul;
            const lx = Math.cos(ang) * rad;
            const ly = Math.sin(ang) * rad;
            const [bx, by] = localToWorldXY(state.x, state.y, yw, lx, ly);
            const bob = Math.sin(t * 3.4 + bi * 2.09) * (2.4 * (1 - state.budTriadMode * 0.55));
            const scatterZ = state.budScatter * Math.cos(t * 11.0 + bi * 1.7) * 3.2;
            list.push({
              partKey: budKeys[bi], asset: parts[budKeys[bi]],
              x: bx, y: by,
              lift: state.z + (state.budLiftOff + bob + scatterZ) * sMul,
              ro: wrapAngle(ang + t * 1.2), symDeg: 90, bias: 0.50
            });
          }

          for (let i = 0; i < state.blades.length; i++) {
            const b = state.blades[i];
            list.push({
              partKey: 'petalBlade', asset: parts.petalBlade,
              x: b.x, y: b.y, lift: b.z,
              ro: b.mode === 'lance' ? wrapAngle(b.ro + Math.sin(b.spin) * 0.14) : wrapAngle(b.ro + b.spin * 0.35),
              symDeg: 180, bias: 0.65
            });
          }

          for (let i = 0; i < state.sprites.length; i++) {
            const spObj = state.sprites[i];
            list.push({
              partKey: 'miniSprite', asset: parts.miniSprite,
              x: spObj.x, y: spObj.y, lift: spObj.z,
              ro: spObj.ro, symDeg: 360, bias: 0.35
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: BossFairyKingDef.id,
            name: BossFairyKingDef.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            action: state.curAction,
            footRadius: BossFairyKingDef.footRadius,
            headZ: 48,
            centerZ: 24,
            blocks: BossFairyKingDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(BossFairyKingDef);
})(window.PixelWorkshop);
