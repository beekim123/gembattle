'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, lerp, smoothstep, localToWorldXY, pivotToWorldXY, expSmooth } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 酒2 · 装备修造匠（+Y 正前，z=0 贴地，总高约 24 格）
  // 辨识核心：壮实粗臂工匠 + 炭黑厚皮铆钉大围裙 + 粗铜护腕 + 额推大号亮铜护目镜
  //           + 身前亮银灰钢小铁砧（红热铁胚仅胚心微红进 glowKeys）+ 重型方头锻锤 + 长铁钳
  // 清晰铁律：仅铁胚炽红芯进 glowKeys，镜片/眼睛/砧面绝不进；0 常态拉伸；<= 48 色 0 重色；0 禁用字
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      skinDark:     '#996042',
      skinMid:      '#cc8860',
      skinHi:       '#f2b48c',
      apronDark:    '#1c1e24',
      apronMid:     '#333842',
      apronHi:      '#535a6b',
      shirtDark:    '#8c8274',
      shirtMid:     '#bfb4a3',
      shirtHi:      '#e6dccb',
      copperDark:   '#854417',
      copperMid:    '#cc7129',
      copperHi:     '#ffa64d',
      lensDark:     '#2a5366',
      lensMid:      '#4f8ea8',
      lensHi:       '#8ecae0',
      steelDark:    '#5a6575',
      steelMid:     '#92a1b5',
      steelHi:      '#d0dceb',
      ironDark:     '#232730',
      ironMid:      '#414857',
      ironHi:       '#677185',
      woodDark:     '#4a2d19',
      woodMid:      '#7d4e2d',
      woodHi:       '#b3784a',
      beardDark:    '#2b1b13',
      beardMid:     '#4f3324',
      beardHi:      '#78503a',
      bootDark:     '#261811',
      bootMid:      '#472f21',
      bootHi:       '#6e4b37',
      eyeDark:      '#121014',
      eyeIris:      '#a65c26',
      eyeGlint:     '#f5faff',
      emissiveMid:  '#d93211',
      emissiveHot:  '#ff741a',
      emissiveCore: '#ffe269'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'foot', 'leg', 'shirt', 'apron', 'rivet', 'strap',
      'head', 'beard', 'eye', 'goggleRim', 'goggleLens',
      'upperArm', 'forearm', 'bracer', 'hand',
      'hammerWood', 'hammerHead', 'tongs', 'stump', 'anvil', 'billet', 'billetCore', 'blade'
    ],
    noCrease: [
      ['eye', 'head'], ['beard', 'head'], ['leg', 'foot'],
      ['rivet', 'apron'], ['goggleLens', 'goggleRim'], ['bracer', 'forearm'], ['forearm', 'hand'],
      ['hammerWood', 'hammerHead'], ['billetCore', 'billet'], ['billet', 'anvil']
    ],
    materials: {
      skin:   ['skinDark',   'skinMid',   'skinHi'],
      apron:  ['apronDark',  'apronMid',  'apronHi'],
      shirt:  ['shirtDark',  'shirtMid',  'shirtHi'],
      copper: ['copperDark', 'copperMid', 'copperHi'],
      lens:   ['lensDark',   'lensMid',   'lensHi'],
      steel:  ['steelDark',  'steelMid',  'steelHi'],
      iron:   ['ironDark',   'ironMid',   'ironHi'],
      wood:   ['woodDark',   'woodMid',   'woodHi'],
      beard:  ['beardDark',  'beardMid',  'beardHi'],
      boot:   ['bootDark',   'bootMid',   'bootHi']
    },
    protectedParts: ['eye', 'billetCore']
  });

  const SKINS = [
    {
      id: 'iron_furnace',
      name: '黑铁红炉',
      dot: '#cc7129',
      outline: '#101014',
      pal: {}
    },
    {
      id: 'bronze_warm',
      name: '古铜暖褐',
      dot: '#b8833b',
      outline: '#18120e',
      pal: {
        apronDark:  '#3b2619', apronMid:  '#66432c', apronHi:  '#946546',
        copperDark: '#7a5c1d', copperMid: '#bd9233', copperHi: '#f2cc66',
        lensDark:   '#285c48', lensMid:   '#469678', lensHi:   '#7fd4b3'
      }
    },
    {
      id: 'steel_miner',
      name: '青钢矿匠',
      dot: '#467c96',
      outline: '#0d141a',
      pal: {
        apronDark:  '#1d3142', apronMid:  '#325570', apronHi:  '#5482a6',
        shirtDark:  '#737a82', shirtMid:  '#a5aeb8', shirtHi:  '#d5dee8',
        copperDark: '#8c6920', copperMid: '#d1a33b', copperHi: '#ffe078'
      }
    }
  ];

  // 1. 粗壮双腿与厚工装靴
  function buildLegSeg(makeCanvas, rTop, rBot, hLen) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 3);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat('apron'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildBoot(makeCanvas) {
    const m = new VoxelModel(8, 9, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, -0.2, 2.3, 1.55, 1.55, 1.2, mat('boot'), partId.leg, true);
    m.paintEllipsoid(0, 1.1, 1.25, 1.95, 2.7, 1.3, mat('boot'), partId.foot, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8 });
  }

  // 2. 壮实工匠躯干：炭黑厚皮铆钉大围裙 + 粗铜铆钉 + 卷袖内衬
  function buildTorso(makeCanvas) {
    const m = new VoxelModel(16, 14, 13, SPEC);
    const { mat, partId } = SPEC;
    // 宽厚肩胸内衬
    m.paintEllipsoid(0, 0, 7.0, 5.8, 4.4, 5.2, mat('shirt'), partId.shirt, true);
    // 前胸与腰腹炭黑厚皮大围裙
    m.fillAABB(-6.2, 6.2, -5.0, 5.5, 0, 11, (x, y, z, X, Y) => {
      const rx = lerp(5.6, 4.9, clamp(z / 10, 0, 1));
      const ry = lerp(4.6, 4.1, clamp(z / 10, 0, 1));
      const d = Math.hypot(X / rx, Y / ry);
      // 围裙下摆包裹至 z=1，前胸护兜至 z=10
      const inLower = z >= 1 && z <= 5.5 && d <= 1.02 && (Y >= -3.2);
      const inBib   = z > 5.5 && z <= 10 && Y >= 1.2 && Math.abs(X) <= 3.6 && d <= 1.04;
      if (inLower || inBib) {
        m.setRaw(x, y, z, mat('apron'), partId.apron);
      }
    });
    // 背部交叉围裙背带
    m.paintCapsule(-3.4, 2.6, 10.2, -3.4, -3.2, 8.8, 0.9, 0.9, mat('apron'), partId.strap, true);
    m.paintCapsule( 3.4, 2.6, 10.2,  3.4, -3.2, 8.8, 0.9, 0.9, mat('apron'), partId.strap, true);
    m.paintCapsule(-3.2, -3.4, 8.8,  3.2, -3.6, 5.4, 0.85, 0.85, mat('apron'), partId.strap, true);
    m.paintCapsule( 3.2, -3.4, 8.8, -3.2, -3.6, 5.4, 0.85, 0.85, mat('apron'), partId.strap, true);
    // 醒目亮铜大铆钉与皮带扣
    for (const [rx, ry, rz] of [[-2.8, 4.0, 9.2], [2.8, 4.0, 9.2], [-3.2, 4.1, 5.2], [3.2, 4.1, 5.2], [0, 4.4, 5.2]]) {
      m.paintEllipsoid(rx, ry, rz, 0.9, 0.75, 0.9, mat('copper'), partId.rivet, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.0 });
  }

  // 3. 头部：方正工匠脸 + 短络腮胡 + 锐利双眼
  function buildHead(makeCanvas) {
    const W = 12, D = 12, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hz = 4.6;
    m.paintEllipsoid(0, 0, hz, 4.3, 4.1, 4.1, mat('skin'), partId.head, true);
    // 短寸发与浓密络腮短须
    m.fillAABB(-4.8, 4.8, -4.6, 4.6, 1, 9, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 4.5, (Y + 0.2) / 4.3, (z - hz) / 4.3);
      if (r <= 1.02 && (z >= hz + 2.4 || (Y < -0.6 && z >= hz - 0.5))) {
        m.setRaw(x, y, z, mat('beard'), partId.beard);
      }
      if (r <= 1.04 && z <= hz - 0.8 && Y >= -0.4) {
        m.setRaw(x, y, z, mat('beard'), partId.beard);
      }
    });
    m.despeckle();
    m.applyArtShading(true);

    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeZ = Math.round(hz + 0.6);
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.9);
      let sy = -1;
      for (let y = D - 2; y >= 1; y--) {
        if (m.getPartId(ex, y, eyeZ) === partId.head) { sy = y; break; }
      }
      if (sy < 0) sy = Math.round(hd + 3.9);
      for (const dx of [0, s]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dx === 0) ? keyToId.eyeGlint : (dx === 0 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(ex + dx, sy, eyeZ + dz, kId, partId.eye);
        }
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.5 });
  }

  // 4. 大号亮铜护目镜（常态推在额头，检查装备时往下拉近眼部）
  function buildGoggles(makeCanvas) {
    const m = new VoxelModel(12, 12, 5, SPEC);
    const { mat, partId } = SPEC;
    // 绕头皮带
    m.fillAABB(-5.2, 5.2, -5.0, 4.5, 1, 3, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 4.8, Y / 4.6);
      if (r <= 1.0 && r >= 0.78 && z === 2) {
        m.setRaw(x, y, z, mat('apron'), partId.strap);
      }
    });
    // 一对大号亮铜镜框 + 清凉蓝灰镜片（镜片绝不进 glowKeys）
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 2.1, 4.1, 2.2, 1.85, 1.2, 1.65, mat('copper'), partId.goggleRim, true);
      m.paintEllipsoid(s * 2.1, 4.6, 2.2, 1.2, 0.85, 1.05, mat('lens'), partId.goggleLens, true);
    }
    m.paintCapsule(-0.6, 4.4, 2.2, 0.6, 4.4, 2.2, 0.7, 0.7, mat('copper'), partId.goggleRim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8 });
  }

  // 5. 粗壮两段手臂（肌肉大臂 + 粗铜护腕小臂）
  function buildUpperArm(makeCanvas) {
    const m = new VoxelModel(7, 9, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -1.2, 3.6, 0, 2.2, 2.8, 1.9, 1.75, mat('skin'), partId.upperArm, true);
    m.paintEllipsoid(0, -1.0, 3.8, 2.05, 1.8, 1.8, mat('shirt'), partId.shirt, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.4 });
  }

  function buildForearm(makeCanvas) {
    const m = new VoxelModel(7, 10, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -1.4, 3.0, 0, 1.6, 3.0, 1.7, 1.65, mat('copper'), partId.bracer, true);
    m.paintEllipsoid(0, 3.0, 3.0, 1.55, 1.65, 1.5, mat('skin'), partId.hand, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.3 });
  }

  // 6. 重型方头锻锤（木柄 + 硕大方头亮钢锤头）
  function buildHammer(makeCanvas) {
    const m = new VoxelModel(11, 14, 16, SPEC);
    const { mat, partId } = SPEC;
    // 粗木柄（从握点向上前斜伸）
    m.paintCapsule(0, -1.5, 1.5, 0, 2.8, 11.2, 1.0, 1.15, mat('wood'), partId.hammerWood, true);
    // 硕大亮银方头锻锤（俯视一眼可辨）
    m.fillAABB(-3.2, 3.2, -1.0, 6.8, 9, 14, (x, y, z, X, Y) => {
      if (Math.abs(X) <= 2.3 && Y >= 0.0 && Y <= 5.6 && z >= 9.6 && z <= 13.4) {
        m.setRaw(x, y, z, mat('steel'), partId.hammerHead);
      }
    });
    m.paintEllipsoid(0, 2.8, 11.6, 1.5, 1.5, 2.1, mat('iron'), partId.rivet, false);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0 });
  }

  // 7. 长铁钳（左手持握）
  function buildTongs(makeCanvas) {
    const m = new VoxelModel(7, 14, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(-0.7, -3.2, 2.6, 0, 1.2, 2.6, 0.65, 0.75, mat('iron'), partId.tongs, true);
    m.paintCapsule( 0.7, -3.2, 2.6, 0, 1.2, 2.6, 0.65, 0.75, mat('iron'), partId.tongs, true);
    m.paintEllipsoid(0, 1.4, 2.6, 1.05, 1.05, 0.85, mat('copper'), partId.rivet, true);
    m.paintCapsule(-0.4, 1.6, 2.6, -1.1, 5.2, 2.6, 0.7, 0.6, mat('steel'), partId.tongs, true);
    m.paintCapsule( 0.4, 1.6, 2.6,  1.1, 5.2, 2.6, 0.7, 0.6, mat('steel'), partId.tongs, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5 });
  }

  // 8. 亮银灰钢小铁砧（木墩底座 + 亮钢带角铁砧 + 砧面红热铁胚，仅胚心微红进 glowKeys）
  function buildAnvil(makeCanvas) {
    const m = new VoxelModel(16, 14, 13, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 粗壮木墩底座
    m.fillAABB(-5.5, 5.5, -5.0, 5.0, 0, 6, (x, y, z, X, Y) => {
      if (Math.hypot(X / 4.8, Y / 4.2) <= 1.0 && z <= 5) {
        m.setRaw(x, y, z, mat('wood'), partId.stump);
      }
    });
    // 铁砧收腰底座与宽厚亮银灰钢砧面 + 尖角砧鼻
    m.fillAABB(-7.2, 7.2, -4.2, 4.2, 5, 10, (x, y, z, X, Y) => {
      // 底座脚
      if (z >= 5 && z <= 6 && Math.abs(X) <= 4.4 && Math.abs(Y) <= 3.1) {
        m.setRaw(x, y, z, mat('iron'), partId.anvil);
      }
      // 砧腰
      if (z === 7 && Math.abs(X) <= 3.0 && Math.abs(Y) <= 2.3) {
        m.setRaw(x, y, z, mat('iron'), partId.anvil);
      }
      // 亮银灰钢主砧台（绝不进 glowKeys）
      if (z >= 8 && z <= 10 && X >= -5.2 && X <= 4.2 && Math.abs(Y) <= 3.2) {
        m.setRaw(x, y, z, mat('steel'), partId.anvil);
      }
      // 尖角砧鼻（向右延伸）
      if (z >= 8 && z <= 10 && X > 4.2 && X <= 7.0) {
        const taper = 1 - (X - 4.2) / 3.0;
        if (Math.abs(Y) <= 2.6 * taper && z >= 8 + (1 - taper) * 1.2) {
          m.setRaw(x, y, z, mat('steel'), partId.anvil);
        }
      }
    });
    // 砧面放一块红热铁胚（外缘暗铁，仅胚心微红进 glowKeys）
    m.fillAABB(-3.2, 2.4, -1.8, 1.8, 10, 12, (x, y, z, X, Y) => {
      if (X >= -2.6 && X <= 2.0 && Math.abs(Y) <= 1.2 && z === 11) {
        const coreD = Math.hypot((X + 0.3) / 1.4, Y / 0.75);
        if (coreD <= 0.52) {
          m.setRaw(x, y, z, keyToId.emissiveCore, partId.billetCore);
        } else if (coreD <= 0.85) {
          m.setRaw(x, y, z, keyToId.emissiveHot, partId.billetCore);
        } else if (coreD <= 1.15) {
          m.setRaw(x, y, z, keyToId.emissiveMid, partId.billetCore);
        } else {
          m.setRaw(x, y, z, mat('iron'), partId.billet);
        }
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.5 });
  }

  // 9. 刚修好的亮钢短刃/护符（inspect 动作举起端详）
  function buildBlade(makeCanvas) {
    const m = new VoxelModel(7, 13, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -3.4, 2.6, 0, -1.2, 2.6, 0.85, 0.85, mat('wood'), partId.hammerWood, true);
    m.paintCapsule(-2.2, -1.0, 2.6, 2.2, -1.0, 2.6, 0.75, 0.75, mat('copper'), partId.rivet, true);
    m.paintCapsule(0, -0.4, 2.6, 0, 5.0, 2.6, 1.15, 0.55, mat('steel'), partId.blade, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5 });
  }

  const Def = {
    id: 'npc_gear_smith',
    code: '酒2',
    name: '装备修造匠',
    tag: '酒馆核心·装备修造',
    summary: '炭黑厚皮铆钉大围裙 + 粗铜护腕 + 额推亮铜护目镜 + 亮银灰钢小铁砧与红热铁胚 + 重型方头锻锤',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 8.2,
    ecoWeight: 1.15,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: ['24 格壮实双足 IK', '两段粗臂 FK 滞后', '亮钢小铁砧与红热铁胚', '重锤三连锻打飞火屑', '下拉护目镜检视利刃'],
    soulHabit: '单手扛锤铁钳翻胚 → 抡起大锻锤三连砸砧四溅火屑 → 下推护目镜凑近检视修好的剑刃',
    actions: [
      { id: 'idle',    name: '翻胚端详', loop: true,  status: 'done' },
      { id: 'forge',   name: '三连锻打', loop: false, duration: 2.2, status: 'done' },
      { id: 'inspect', name: '推镜检刃', loop: false, duration: 2.2, status: 'done' },
      { id: 'patrol',  name: '扛锤巡摊', loop: true,  status: 'done' }
    ],
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legThigh: buildLegSeg(makeCanvas, 1.95, 1.7, 3.8),
        legShin:  buildLegSeg(makeCanvas, 1.65, 1.5, 3.6),
        boot:     buildBoot(makeCanvas),
        torso:    buildTorso(makeCanvas),
        head:     buildHead(makeCanvas),
        goggles:  buildGoggles(makeCanvas),
        upperArm: buildUpperArm(makeCanvas),
        forearm:  buildForearm(makeCanvas),
        hammer:   buildHammer(makeCanvas),
        tongs:    buildTongs(makeCanvas),
        anvil:    buildAnvil(makeCanvas),
        blade:    buildBlade(makeCanvas)
      };

      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.6, hipY: 0, hipZ: 7.2, restX: -2.8, restY: 0.2, group: 0, L1: 3.9, L2: 4.0, bendDir: 1 },
        { id: 'R', hipX:  2.6, hipY: 0, hipZ: 7.2, restX:  2.8, restY: 0.2, group: 1, L1: 3.9, L2: 4.0, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 2.2, stepDuration: 0.18, stepHeight: 1.6, strideAnticipation: 0.40 });

      const headYawSp   = new SpringDamper1D(0, 130, 8.2);
      const bodyBobSp   = new SpringDamper1D(0, 180, 8.2);
      const anvilShakeSp = new SpringDamper1D(0, 320, 7.5);
      const goggleSlideSp = new SpringDamper1D(0, 160, 9.0);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        anvilX: 0, anvilY: 9.0, anvilYaw: 0,
        walkBlend: 0, stepPhase: 0,
        action: 'idle', actionTime: 0,
        hitCount: 0, emberCd: 0.5,
        armLYaw: 0, armRYaw: 0,
        foreLYaw: 0, foreRYaw: 0,
        armLLift: 0, armRLift: 0,
        foreLLift: 0, foreRLift: 0,
        headLift: 0, showBlade: false
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function syncAnvilInFront(sMul) {
        const [ax, ay] = localToWorldXY(state.x, state.y, state.yaw, 0, 8.6 * sMul);
        state.anvilX = ax;
        state.anvilY = ay;
        state.anvilYaw = state.yaw;
      }

      const instance = {
        def: Def,
        cachePrefix: `npc_gear_smith_${Math.random().toString(36).slice(2, 7)}`,
        parts, partListAssets: Object.values(parts), state, sockets, footContacts: [], scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.yaw = hyaw; state.z = 0;
          state.vx = 0; state.vy = 0; state.walkBlend = 0;
          state.hitCount = 0;
          syncAnvilInFront(instance.scaleMul || 1.0);
          gait.reset(hx, hy, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = params.springiness ?? 1.0;
          const gFreq = params.gaitFreq ?? 1.0;

          const act = (eco && eco.action) || (eco && eco.patrol === true ? 'patrol' : 'idle');
          const actT = (eco && eco.actionTime != null) ? eco.actionTime : time;
          if (act !== state.action || actT < state.actionTime - 0.1) {
            state.hitCount = 0;
          }
          state.action = act;
          state.actionTime = actT;

          if (act === 'patrol') {
            Propulsion.multiLegWalk(state, dt, time, { ...params, speed: (params.speed ?? 1.0) * 0.72 }, {
              ...eco, patrol: true, walkStyle: 'heavy', baseLift: 0
            });
          } else {
            Propulsion.multiLegWalk(state, dt, time, params, {
              ...eco, patrol: false, baseLift: 0
            });
            // 待机、锻打与检刃时，小铁砧稳放身前
            syncAnvilInFront(sMul);
          }
          state.z = 0;

          const spd = Math.hypot(state.vx, state.vy);
          state.walkBlend = lerp(state.walkBlend, clamp(spd / 7.5, 0, 1), expSmooth(dt, 10));
          state.stepPhase += dt * (2.4 + state.walkBlend * 6.8) * gFreq;

          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 1.05,
            stepHeight: 1.6 * sMul,
            stepThreshold: 2.2 * sMul
          });
          state.tiltX = lerp(state.tiltX || 0, gaitRes.tiltX * 0.45 * sMul, expSmooth(dt, 12));
          state.tiltY = lerp(state.tiltY || 0, gaitRes.tiltY * 0.45 * sMul, expSmooth(dt, 12));

          const maxOff = 3.6 * sMul;
          for (const leg of gait.legs) {
            const [ix, iy] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
            const dx = leg.footX - ix, dy = leg.footY - iy;
            const d = Math.hypot(dx, dy);
            if (d > maxOff) {
              leg.footX = ix + (dx / d) * maxOff;
              leg.footY = iy + (dy / d) * maxOff;
            }
          }

          if (gaitRes.landed.length > 0) {
            bodyBobSp.impulse(6.5 * sp);
            for (const l of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.65 * sMul);
            }
          }
          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.3 * sMul }));

          // 铁胚偶发微弱升腾余热火屑
          state.emberCd -= dt;
          if (state.emberCd <= 0 && vfx) {
            state.emberCd = 0.45 + Math.random() * 0.4;
            vfx.spawnParticle(
              state.anvilX + (Math.random() - 0.5) * 2.2 * sMul,
              state.anvilY + (Math.random() - 0.5) * 1.8 * sMul,
              11.2 * sMul,
              (Math.random() - 0.5) * 3.0, (Math.random() - 0.5) * 3.0, 6.5 + Math.random() * 4.0,
              0.42, 1.1, '#ff8026', true, 4
            );
          }

          let tgtArmL = 0.22, tgtArmR = -0.30;
          let tgtForeL = 0.34, tgtForeR = -0.45;
          let tgtArmLLift = 0.4, tgtArmRLift = 1.6;
          let tgtForeLLift = 0.6, tgtForeRLift = 2.8;
          let tgtHeadYaw = 0, tgtHeadLift = 0;
          let tgtGoggleDrop = 0;
          state.showBlade = false;

          if (act === 'forge') {
            // 三连重锤砸砧（分别在 0.46s / 1.10s / 1.74s 落下）
            const hitTimes = [0.46, 1.10, 1.74];
            const cycleDur = 0.64;
            const hitIdx = Math.min(2, Math.floor(actT / cycleDur));
            const localU = clamp((actT - hitIdx * cycleDur) / cycleDur, 0, 1);

            tgtArmL = 0.28; tgtForeL = 0.44; tgtArmLLift = 0.3; tgtForeLLift = 0.4;
            if (localU < 0.55) {
              // 抡起大锻锤
              const k = smoothstep(0, 0.55, localU);
              tgtArmR = lerp(-0.1, -0.62, k);
              tgtForeR = lerp(-0.15, -0.58, k);
              tgtArmRLift = lerp(0.5, 4.8, k);
              tgtForeRLift = lerp(0.6, 6.4, k);
              tgtHeadYaw = -0.14 * k;
              tgtHeadLift = 0.45 * k;
            } else if (localU < 0.78) {
              // 猛力下砸
              const k = smoothstep(0.55, 0.78, localU);
              tgtArmR = lerp(-0.62, 0.36, k);
              tgtForeR = lerp(-0.58, 0.54, k);
              tgtArmRLift = lerp(4.8, -0.2, k);
              tgtForeRLift = lerp(6.4, -0.4, k);
              tgtHeadYaw = lerp(-0.14, 0.10, k);
              tgtHeadLift = lerp(0.45, -0.65, k);
            } else {
              // 击砧回弹
              const k = smoothstep(0.78, 1.0, localU);
              tgtArmR = lerp(0.36, -0.1, k);
              tgtForeR = lerp(0.54, -0.15, k);
              tgtArmRLift = lerp(-0.2, 1.2, k);
              tgtForeRLift = lerp(-0.4, 1.8, k);
              tgtHeadYaw = 0.08 * (1 - k);
              tgtHeadLift = lerp(-0.65, 0, k);
            }

            if (state.hitCount < hitTimes.length && actT >= hitTimes[state.hitCount]) {
              state.hitCount++;
              bodyBobSp.impulse(-14.0 * sp);
              anvilShakeSp.impulse(-22.0 * sp);
              // 四溅的橘红飞火屑
              if (vfx) {
                for (let i = 0; i < 14; i++) {
                  const ang = (i / 14) * Math.PI * 2 + Math.random() * 0.3;
                  const spdS = 10 + Math.random() * 14;
                  vfx.spawnParticle(
                    state.anvilX, state.anvilY, 11.4 * sMul,
                    Math.cos(ang) * spdS, Math.sin(ang) * spdS, 12 + Math.random() * 10,
                    0.34 + Math.random() * 0.22, 1.2 + Math.random() * 0.6,
                    (i % 3 === 0) ? '#ffe066' : ((i % 2 === 0) ? '#ff7a1a' : '#e63b14'),
                    true, 44
                  );
                }
              }
            }
          } else if (act === 'inspect') {
            // 下推护目镜，左手举起修好的短刃凑近端详
            state.showBlade = true;
            const u = clamp(actT / 2.2, 0, 1);
            const focusEnv = smoothstep(0.08, 0.28, u) * (1 - smoothstep(0.78, 0.96, u));
            tgtGoggleDrop = 1.0 * focusEnv;
            const sway = Math.sin(actT * 4.5);
            tgtArmL = 0.30 + sway * 0.14 * focusEnv;
            tgtForeL = 0.48 + Math.sin(actT * 4.5 - 0.80) * 0.18 * focusEnv;
            tgtArmLLift = 1.6 + 1.8 * focusEnv;
            tgtForeLLift = 2.6 + 2.4 * focusEnv;
            // 右手托锤待命微抬
            tgtArmR = -0.35; tgtForeR = -0.45;
            tgtArmRLift = 1.4; tgtForeRLift = 2.4;
            tgtHeadYaw = 0.18 * focusEnv + sway * 0.10 * focusEnv;
            tgtHeadLift = -0.45 * focusEnv + Math.sin(actT * 7.0) * 0.22 * focusEnv;
          } else if (act === 'patrol') {
            // 扛锤稳步巡视货摊
            const sw = Math.sin(state.stepPhase);
            const swLag = Math.sin(state.stepPhase - 0.82);
            tgtArmL = 0.18 + sw * 0.34 * state.walkBlend;
            tgtForeL = 0.22 + swLag * 0.42 * state.walkBlend;
            tgtArmLLift = 0.2 + Math.max(0, sw) * 0.6;
            tgtForeLLift = 0.4 + Math.max(0, swLag) * 0.8;
            // 右手扛锻锤于肩侧
            tgtArmR = -0.42 - sw * 0.10 * state.walkBlend;
            tgtForeR = -0.58 - swLag * 0.12 * state.walkBlend;
            tgtArmRLift = 2.2 + Math.abs(sw) * 0.4;
            tgtForeRLift = 3.8 + Math.abs(swLag) * 0.5;
            tgtHeadYaw = Math.sin(time * 1.2) * 0.24;
          } else {
            // idle：单手扛锻锤、另一手用铁钳轻翻铁胚端详
            const flip = Math.sin(time * 2.8);
            const flipLag = Math.sin(time * 2.8 - 0.80);
            tgtArmL = 0.26 + flip * 0.16;
            tgtForeL = 0.40 + flipLag * 0.24;
            tgtArmLLift = 0.4 + Math.max(0, flip) * 0.5;
            tgtForeLLift = 0.6 + Math.max(0, flipLag) * 0.8;
            tgtArmR = -0.40;
            tgtForeR = -0.56;
            tgtArmRLift = 2.0 + Math.sin(time * 2.1) * 0.35;
            tgtForeRLift = 3.6 + Math.sin(time * 2.1 - 0.6) * 0.4;
            tgtHeadYaw = 0.08 + flip * 0.12;
            tgtHeadLift = -0.20 + Math.sin(time * 2.1) * 0.15;
          }

          const kArm = expSmooth(dt, 14);
          const kFore = expSmooth(dt, 10.5);
          state.armLYaw   = lerp(state.armLYaw,   tgtArmL,  kArm);
          state.armRYaw   = lerp(state.armRYaw,   tgtArmR,  kArm);
          state.foreLYaw  = lerp(state.foreLYaw,  tgtForeL, kFore);
          state.foreRYaw  = lerp(state.foreRYaw,  tgtForeR, kFore);
          state.armLLift  = lerp(state.armLLift,  tgtArmLLift,  kArm);
          state.armRLift  = lerp(state.armRLift,  tgtArmRLift,  kArm);
          state.foreLLift = lerp(state.foreLLift, tgtForeLLift, kFore);
          state.foreRLift = lerp(state.foreRLift, tgtForeRLift, kFore);
          state.headLift  = lerp(state.headLift,  tgtHeadLift,  kArm);

          headYawSp.update(dt, tgtHeadYaw, 130 * sp, 8.2);
          bodyBobSp.update(dt, 0, 180 * sp, 8.2);
          anvilShakeSp.update(dt, 0, 320 * sp, 7.5);
          goggleSlideSp.update(dt, tgtGoggleDrop, 160 * sp, 9.0);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const hYaw = yw + clamp(headYawSp.x, -0.62, 0.62);

          const breath = Math.sin(state.actionTime * 2.1) * 0.30 * (1 - state.walkBlend * 0.5);
          const stepBob = Math.abs(Math.sin(state.stepPhase)) * 0.50 * state.walkBlend;
          const bob = clamp(bodyBobSp.x * 0.05 + breath + stepBob, -0.55, 0.85) * sMul;

          // 1. 双足 IK
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const hx = l.hipWX + (state.tiltX || 0);
            const hy = l.hipWY + (state.tiltY || 0);
            const hz = l.hipWZ + bob;
            list.push({
              partKey: 'legThigh', asset: parts.legThigh,
              x: lerp(hx, l.kneeX, 0.25), y: lerp(hy, l.kneeY, 0.25),
              lift: Math.max(0, lerp(hz, l.kneeZ, 0.25) - 1.8 * sMul),
              ro: yw, bias: -0.32, symDeg: 90
            });
            list.push({
              partKey: 'legShin', asset: parts.legShin,
              x: lerp(l.kneeX, l.footX, 0.45), y: lerp(l.kneeY, l.footY, 0.45),
              lift: Math.max(0, lerp(l.kneeZ, l.footZ + 1.4 * sMul, 0.45) - 1.7 * sMul),
              ro: yw, bias: -0.26, symDeg: 90
            });
            list.push({
              partKey: 'boot', asset: parts.boot,
              x: l.footX, y: l.footY, lift: Math.max(0, l.footZ),
              ro: yw, bias: -0.20
            });
          }

          // 2. 壮实躯干（厚皮铆钉围裙）
          const [tx, ty] = localToWorldXY(state.x + (state.tiltX || 0), state.y + (state.tiltY || 0), yw, 0, 0.2 * sMul);
          list.push({
            partKey: 'torso', asset: parts.torso,
            x: tx, y: ty, lift: 5.5 * sMul + bob, ro: yw, bias: 0.14
          });

          // 3. 头部 + 可下滑额推大号亮铜护目镜
          const [hx, hy] = localToWorldXY(tx, ty, yw, 0, 0.6 * sMul);
          const headZ = 15.2 * sMul + bob + state.headLift * sMul;
          list.push({
            partKey: 'head', asset: parts.head,
            x: hx, y: hy, lift: headZ, ro: hYaw, bias: 0.36
          });
          const gDrop = clamp(goggleSlideSp.x, 0, 1.2) * 1.8 * sMul;
          list.push({
            partKey: 'goggles', asset: parts.goggles,
            x: hx, y: hy, lift: headZ + 5.6 * sMul - gDrop, ro: hYaw, bias: 0.45
          });

          // 4. 左粗臂两段 FK + 长铁钳（检刃时托起亮钢短刃）
          const shZ = 12.2 * sMul + bob;
          const [lShX, lShY] = localToWorldXY(tx, ty, yw, -5.2 * sMul, 0.6 * sMul);
          const lUpYaw = yw + state.armLYaw;
          const [lUpX, lUpY] = pivotToWorldXY(lShX, lShY, lUpYaw, 0, -1.2 * sMul);
          list.push({
            partKey: 'upperArmL', asset: parts.upperArm,
            x: lUpX, y: lUpY, lift: shZ - 1.8 * sMul + state.armLLift * sMul, ro: lUpYaw, bias: 0.18
          });

          const [lElX, lElY] = localToWorldXY(lShX, lShY, lUpYaw, 0, 3.2 * sMul);
          const lFoYaw = yw + state.foreLYaw;
          const [lFoX, lFoY] = pivotToWorldXY(lElX, lElY, lFoYaw, 0, -1.4 * sMul);
          const lHandZ = shZ - 2.0 * sMul + state.foreLLift * sMul;
          list.push({
            partKey: 'forearmL', asset: parts.forearm,
            x: lFoX, y: lFoY, lift: lHandZ, ro: lFoYaw, bias: 0.26
          });

          const [lHdX, lHdY] = localToWorldXY(lElX, lElY, lFoYaw, 0, 4.2 * sMul);
          list.push({
            partKey: 'tongs', asset: parts.tongs,
            x: lHdX, y: lHdY, lift: lHandZ + 0.2 * sMul, ro: lFoYaw, bias: 0.34
          });
          if (state.showBlade) {
            const [bX, bY] = localToWorldXY(lHdX, lHdY, lFoYaw, 0, 3.6 * sMul);
            list.push({
              partKey: 'blade', asset: parts.blade,
              x: bX, y: bY, lift: lHandZ + 0.8 * sMul, ro: lFoYaw + 0.35, bias: 0.42
            });
          }

          // 5. 右粗臂两段 FK + 重型方头锻锤
          const [rShX, rShY] = localToWorldXY(tx, ty, yw, 5.2 * sMul, 0.6 * sMul);
          const rUpYaw = yw + state.armRYaw;
          const [rUpX, rUpY] = pivotToWorldXY(rShX, rShY, rUpYaw, 0, -1.2 * sMul);
          list.push({
            partKey: 'upperArmR', asset: parts.upperArm,
            x: rUpX, y: rUpY, lift: shZ - 1.8 * sMul + state.armRLift * sMul, ro: rUpYaw, bias: 0.18
          });

          const [rElX, rElY] = localToWorldXY(rShX, rShY, rUpYaw, 0, 3.2 * sMul);
          const rFoYaw = yw + state.foreRYaw;
          const [rFoX, rFoY] = pivotToWorldXY(rElX, rElY, rFoYaw, 0, -1.4 * sMul);
          const rHandZ = shZ - 2.0 * sMul + state.foreRLift * sMul;
          list.push({
            partKey: 'forearmR', asset: parts.forearm,
            x: rFoX, y: rFoY, lift: rHandZ, ro: rFoYaw, bias: 0.28
          });

          const [rHdX, rHdY] = localToWorldXY(rElX, rElY, rFoYaw, 0, 4.0 * sMul);
          list.push({
            partKey: 'hammer', asset: parts.hammer,
            x: rHdX, y: rHdY, lift: rHandZ - 0.5 * sMul, ro: rFoYaw, bias: 0.40
          });

          // 6. 身前亮银灰钢小铁砧（锤击时清脆颤动）
          const aShake = clamp(anvilShakeSp.x * 0.035, -0.55, 0.55) * sMul;
          list.push({
            partKey: 'anvil', asset: parts.anvil,
            x: state.anvilX + aShake * 0.4,
            y: state.anvilY,
            lift: Math.max(0, Math.abs(aShake) * 0.35),
            ro: state.anvilYaw, bias: 0.10
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id, code: Def.code, name: Def.name, outlineMode: 'actorUnified',
            skin: curSkin.id, footRadius: Def.footRadius, headZ: 24, centerZ: 12,
            blocks: Def.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(Def, 'npc');
})(window.PixelWorkshop);
