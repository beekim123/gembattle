'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, lerp, smoothstep, smin, localToWorldXY, pivotToWorldXY, expSmooth, wrapAngle } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 酒5 · 重刃破盾队友（战士）
  // 轮廓锚点：露臂赤褐毛领甲 + 鲜红飘尾额带 + 亮铜护腕 + 右肩斜扛夸张宽刃双弧重战斧
  // 规范铁律：24 格强壮头身比、二足防脱胯 IK、两段手臂 FK 滞后、锁死斧柄枢轴、
  //           常态 1:1 零拉伸、金属刃口绝不进 glowKeys、<= 48 色 0 重色、0 禁用字
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 古铜健硕肤色
      skinDark:    '#9c6546',
      skinMid:     '#cc8c64',
      skinHi:      '#edb38a',
      // 赤褐皮胸甲（战士主色）
      armorDark:   '#59261b',
      armorMid:    '#8f402e',
      armorHi:     '#bf634b',
      // 暖白粗毛领
      furDark:     '#968a78',
      furMid:      '#ccc0ab',
      furHi:       '#f2eadc',
      // 鲜红额带与腰带饰布
      bandDark:    '#82141a',
      bandMid:     '#cf2329',
      bandHi:      '#f5534d',
      // 亮铜护腕与甲扣（绝不进 glowKeys）
      copperDark:  '#7a491c',
      copperMid:   '#c27b30',
      copperHi:    '#f2b661',
      // 深炭战裤与厚皮靴
      pantsDark:   '#262326',
      pantsMid:    '#403c42',
      pantsHi:     '#615c63',
      // 重战斧厚重暗铁刃身（不进 glowKeys）
      steelDark:   '#2f3640',
      steelMid:    '#546070',
      steelHi:     '#8594a8',
      // 极亮银白斧刃口（不进 glowKeys）
      edgeMid:     '#c7d4e3',
      edgeHi:      '#eef5fc',
      // 粗硬深木斧柄
      woodDark:    '#3b2416',
      woodMid:     '#633d24',
      woodHi:      '#8f5c3a',
      // 深棕短发与磨刀石
      hairDark:    '#211815',
      hairMid:     '#3b2b24',
      hairHi:      '#5c453a',
      stoneDark:   '#4d5259',
      stoneMid:    '#7a828c',
      stoneHi:     '#adb6c2',
      // 眼睛（eyeGlint 绝不进 glowKeys）
      eyeDark:     '#121014',
      eyeIris:     '#c46e2b',
      eyeGlint:    '#f7fbff'
    },
    glowKeys: [],
    parts: [
      'boot', 'leg', 'armor', 'fur', 'belt', 'band', 'copper',
      'head', 'hair', 'eye', 'arm', 'bracer', 'haft', 'blade', 'edge', 'stone'
    ],
    noCrease: [
      ['eye', 'head'], ['hair', 'head'], ['band', 'head'], ['band', 'hair'],
      ['blade', 'edge'], ['blade', 'haft'], ['leg', 'boot'], ['arm', 'bracer']
    ],
    materials: {
      skin:   ['skinDark',   'skinMid',   'skinHi'],
      armor:  ['armorDark',  'armorMid',  'armorHi'],
      fur:    ['furDark',    'furMid',    'furHi'],
      band:   ['bandDark',   'bandMid',   'bandHi'],
      copper: ['copperDark', 'copperMid', 'copperHi'],
      pants:  ['pantsDark',  'pantsMid',  'pantsHi'],
      steel:  ['steelDark',  'steelMid',  'steelHi'],
      wood:   ['woodDark',   'woodMid',   'woodHi'],
      hair:   ['hairDark',   'hairMid',   'hairHi'],
      stone:  ['stoneDark',  'stoneMid',  'stoneHi']
    },
    protectedParts: ['eye', 'edge', 'band']
  });

  const SKINS = [
    { id: 'crimson_bronze', name: '赤带铜甲', dot: '#cf2329', outline: '#140c0a', pal: {} },
    {
      id: 'iron_gold', name: '玄铁金斧', dot: '#d9a536', outline: '#0e0f14',
      pal: {
        armorDark:  '#22252e', armorMid:  '#3a404f', armorHi:  '#5c657a',
        furDark:    '#4a474c', furMid:    '#757278', furHi:    '#a6a3ab',
        bandDark:   '#6b132b', bandMid:   '#a82246', bandHi:   '#de4b70',
        steelDark:  '#785914', steelMid:  '#b88b23', steelHi:  '#e8be4a',
        edgeMid:    '#f2da79', edgeHi:    '#fff4bf'
      }
    },
    {
      id: 'wolf_cyan', name: '狼皮苍青', dot: '#3a7b8c', outline: '#0d1417',
      pal: {
        armorDark:  '#1f4552', armorMid:  '#3a7b8c', armorHi:  '#66adc0',
        furDark:    '#6c7880', furMid:    '#9eadb8', furHi:    '#d1dfe8',
        bandDark:   '#9e3411', bandMid:   '#e0581f', bandHi:   '#ff8a4c',
        copperDark: '#5b6673', copperMid: '#8fa0b3', copperHi: '#c5d6e8'
      }
    }
  ];

  // 战斧握柄枢轴（位于局部 (0, -3.5) 便于右手锁死握把并向后/向前挥劈）
  const AXE_PIVOT = { x: 0, y: -3.2 };

  function buildLegSeg(makeCanvas, rTop, rBot, hLen) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 3);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat('pants'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildBoot(makeCanvas) {
    const m = new VoxelModel(7, 9, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, -0.1, 3.0, 1.55, 1.55, 1.4, mat('armor'), partId.boot, true);
    m.paintEllipsoid(0, 1.0, 1.35, 1.80, 2.50, 1.35, mat('pants'), partId.boot, true);
    m.paintEllipsoid(0, 2.2, 1.6, 1.35, 0.9, 0.85, mat('copper'), partId.copper, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5 });
  }

  function buildTorso(makeCanvas) {
    // 宽肩精悍战士胸甲 + 厚实毛领 + 鲜红腰布
    const m = new VoxelModel(15, 13, 12, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-6.2, 6.2, -4.6, 4.6, 0, 11, (x, y, z, X, Y) => {
      const rx = lerp(4.2, 5.4, clamp(z / 10, 0, 1));
      const ry = lerp(3.4, 4.0, clamp(z / 10, 0, 1));
      const dChest = (Math.hypot(X / rx, Y / ry, (z - 5.8) / 5.2) - 1) * 3.8;
      const dNeck  = (Math.hypot(X / 2.4, Y / 2.3, (z - 10.6) / 1.8) - 1) * 1.8;
      if (smin(dChest, dNeck, 1.0) <= 0) {
        m.setRaw(x, y, z, z > 9.6 ? mat('skin') : mat('armor'), partId.armor);
      }
      // 护胯皮甲裙片
      const r = Math.hypot(X / 4.8, Y / 3.8);
      if (r <= 1.0 && r >= 0.45 && z >= 0.5 && z <= 3.4) {
        m.setRaw(x, y, z, mat('pants'), partId.armor);
      }
    });
    // 粗犷毛领环绕双肩
    m.paintEllipsoid(0, -0.2, 9.4, 5.6, 4.4, 1.45, mat('fur'), partId.fur, true);
    m.paintEllipsoid(0, 0.2, 9.6, 2.5, 2.3, 1.8, mat('skin'), partId.armor, true);
    // 胸前斜皮带与铜扣 + 鲜红腰带
    m.paintCapsule(-4.4, 2.8, 9.2, 3.8, 3.0, 4.2, 0.95, 0.95, mat('copper'), partId.copper, true);
    m.paintEllipsoid(0, 0, 3.6, 4.8, 3.9, 1.05, mat('band'), partId.belt, true);
    m.paintEllipsoid(0, 3.8, 3.6, 1.35, 0.8, 1.15, mat('copper'), partId.copper, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.4 });
  }

  function buildHead(makeCanvas) {
    // 战士头 + 粗短发 + 鲜红额带
    const W = 12, D = 12, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.paintEllipsoid(0, 0.2, 3.8, 3.8, 3.7, 3.5, mat('skin'), partId.head, true);
    // 浓密凌乱短发顶
    m.paintEllipsoid(0, -0.6, 6.2, 4.0, 3.8, 2.3, mat('hair'), partId.hair, true);
    m.paintCapsule(-2.2, -1.8, 6.8, -3.2, -3.0, 8.2, 1.2, 0.8, mat('hair'), partId.hair, true);
    m.paintCapsule( 2.0, -1.8, 7.0,  3.0, -2.8, 8.4, 1.2, 0.8, mat('hair'), partId.hair, true);
    m.paintCapsule( 0.0,  1.2, 7.6,  0.2,  2.4, 8.6, 1.3, 0.8, mat('hair'), partId.hair, true);
    // 鲜红额带紧束前额（一圈极醒目亮红）
    m.paintEllipsoid(0, 0.1, 5.5, 4.15, 4.05, 0.95, mat('band'), partId.band, true);
    // 脑后布结
    m.paintEllipsoid(0, -4.1, 5.4, 1.35, 1.0, 1.15, mat('band'), partId.band, true);

    m.despeckle();
    m.applyArtShading(true);

    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeZ = 4;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.6);
      let sy = -1;
      for (let y = D - 2; y >= 1; y--) {
        if (m.getPartId(ex, y, eyeZ) === partId.head) { sy = y; break; }
      }
      if (sy < 0) sy = Math.round(hd + 3.6);
      m.setRaw(ex, sy, eyeZ, keyToId.eyeDark, partId.eye);
      m.setRaw(ex, sy, eyeZ + 1, keyToId.eyeGlint, partId.eye);
      m.setRaw(ex + s, sy, eyeZ, keyToId.eyeIris, partId.eye);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.4 });
  }

  function buildHeadbandTail(makeCanvas, len) {
    const m = new VoxelModel(5, Math.ceil(len + 4), 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 2.2, 0, -len, 1.8, 0.95, 0.65, mat('band'), partId.band, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0 });
  }

  function buildUpperArm(makeCanvas) {
    // 露臂强壮肌肉大臂
    const m = new VoxelModel(7, 11, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 3.0, 0, 3.3, 2.7, 1.68, 1.48, mat('skin'), partId.arm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.4 });
  }

  function buildForearm(makeCanvas) {
    // 肌肉小臂 + 亮铜护腕 + 粗实拳头
    const m = new VoxelModel(7, 12, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 2.9, 0, 3.2, 2.7, 1.42, 1.28, mat('skin'), partId.arm, true);
    m.paintCapsule(0, 1.1, 2.9, 0, 2.8, 2.8, 1.55, 1.48, mat('copper'), partId.bracer, true);
    m.paintEllipsoid(0, 3.8, 2.7, 1.35, 1.35, 1.3, mat('skin'), partId.arm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.4 });
  }

  function buildBattleAxe(makeCanvas, horizontalMode) {
    // 夸张宽阔双弧刃重战斧：
    //   horizontalMode = false：斜扛右肩态（柄由握点向后上方斜延，宽刃巍然立于右肩上方）
    //   horizontalMode = true ：横劈/磨刃态（柄沿 +Y 水平前伸，宽双弧刃横向铺展，俯视冲击力拉满）
    const W = horizontalMode ? 15 : 13;
    const D = horizontalMode ? 21 : 19;
    const H = horizontalMode ? 10 : 18;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    if (!horizontalMode) {
      // 斜扛态：握把枢轴在 (0, -3.2, 3.5) 附近，柄向后上方斜伸至 (0.8, -8.0, 14.5)
      const p0 = [0, 3.8, 1.8];
      const p1 = [0.6, -6.2, 14.6];
      m.paintCapsule(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 1.05, 1.15, mat('wood'), partId.haft, true);
      // 铜柄尾箍与斧颈箍
      m.paintEllipsoid(p0[0], p0[1], p0[2], 1.35, 1.35, 1.2, mat('copper'), partId.copper, true);
      const hx = lerp(p0[0], p1[0], 0.80), hy = lerp(p0[1], p1[1], 0.80), hz = lerp(p0[2], p1[2], 0.80);
      m.paintEllipsoid(hx, hy, hz, 1.8, 1.8, 1.9, mat('copper'), partId.copper, true);
      // 夸张双弧厚重宽斧刃（沿左右 X 与上下 Z 展开弧面）
      m.fillAABB(-5.6, 6.2, hy - 3.6, hy + 3.6, hz - 4.4, hz + 4.8, (x, y, z, X, Y) => {
        const dx = X - hx, dy = Y - hy, dz = z - hz;
        const distSide = Math.abs(dx);
        const spanZ = 1.6 + distSide * 0.56;
        const arcCut = distSide - 4.8 + (dz * dz) * 0.085;
        if (distSide >= 0.8 && distSide <= 5.4 && Math.abs(dz) <= spanZ && arcCut <= 0.3 && Math.abs(dy) <= 1.25) {
          const isEdge = arcCut >= -0.85;
          m.setRaw(x, y, z, isEdge ? keyToId.edgeHi : mat('steel'), isEdge ? partId.edge : partId.blade);
        }
      });
    } else {
      // 横劈/磨刃态：握柄沿 +Y 伸出，斧头在 +Y 端 (0, 6.8, 4.5)
      m.paintCapsule(0, -7.2, 4.5, 0, 7.6, 4.5, 1.05, 1.18, mat('wood'), partId.haft, true);
      m.paintEllipsoid(0, -7.2, 4.5, 1.35, 1.35, 1.2, mat('copper'), partId.copper, true);
      m.paintEllipsoid(0, 5.4, 4.5, 1.85, 1.85, 1.6, mat('copper'), partId.copper, true);
      // 水平双弧宽刃
      m.fillAABB(-6.6, 6.6, 1.2, 9.6, 2.5, 6.8, (x, y, z, X, Y) => {
        const distSide = Math.abs(X);
        const dy = Y - 5.4;
        const spanY = 1.6 + distSide * 0.52;
        const arcCut = distSide - 5.6 + (dy * dy) * 0.095;
        if (distSide >= 0.9 && distSide <= 6.2 && Math.abs(dy) <= spanY && arcCut <= 0.3 && Math.abs(z - 4.5) <= 1.25) {
          const isEdge = arcCut >= -0.9;
          m.setRaw(x, y, z, isEdge ? keyToId.edgeHi : mat('steel'), isEdge ? partId.edge : partId.blade);
        }
      });
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.2 });
  }

  function buildWhetstone(makeCanvas) {
    const m = new VoxelModel(6, 7, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(-1.2, 0, 1.8, 1.2, 0, 1.8, 1.1, 1.1, mat('stone'), partId.stone, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.0 });
  }

  const Def = {
    id: 'npc_warrior',
    code: '酒5',
    name: '重刃破盾队友',
    tag: '战士队友 · 右肩重斧',
    summary: '露臂赤褐毛领胸甲、鲜红飘尾额带与亮铜护腕，右肩稳稳斜扛双弧宽刃重战斧，重心与坦克完全错开',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 7.8,
    ecoWeight: 1.1,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',    name: '扛斧待命', loop: true,  status: 'done' },
      { id: 'patrol',  name: '沉稳迈步', loop: true,  status: 'done' },
      { id: 'cleave',  name: '破盾横劈', loop: false, duration: 2.0, status: 'done' },
      { id: 'sharpen', name: '磨刃候雇', loop: false, duration: 2.4, status: 'done' }
    ],
    blocks: ['二足沉稳 IK', '两段肌肉臂 FK', '枢轴锁死双态重斧', '局部后飘鲜红额带', '破盾斩痕与磨刃火屑'],
    soulHabit: '右肩扛斧舒展颠肩 → 沉稳迈步额带后飘 → 蓄力破盾横劈炽橘斩弧 / 坐前掏石磨刃迸火屑',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        thigh:     buildLegSeg(makeCanvas, 1.88, 1.58, 4.4),
        shin:      buildLegSeg(makeCanvas, 1.56, 1.40, 4.2),
        boot:      buildBoot(makeCanvas),
        torso:     buildTorso(makeCanvas),
        head:      buildHead(makeCanvas),
        tail1:     buildHeadbandTail(makeCanvas, 2.8),
        tail2:     buildHeadbandTail(makeCanvas, 2.6),
        upperArmL: buildUpperArm(makeCanvas),
        forearmL:  buildForearm(makeCanvas),
        upperArmR: buildUpperArm(makeCanvas),
        forearmR:  buildForearm(makeCanvas),
        axeRest:   buildBattleAxe(makeCanvas, false),
        axeSwing:  buildBattleAxe(makeCanvas, true),
        whetstone: buildWhetstone(makeCanvas)
      };

      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.4, hipY: -0.1, hipZ: 8.6, restX: -2.5, restY: 0.2, group: 0, L1: 4.5, L2: 4.6, bendDir: 1 },
        { id: 'R', hipX:  2.4, hipY: -0.1, hipZ: 8.6, restX:  2.5, restY: 0.2, group: 1, L1: 4.5, L2: 4.6, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 2.4, stepDuration: 0.175, stepHeight: 1.9, strideAnticipation: 0.40 });

      const headYawSp  = new SpringDamper1D(0, 125, 9.2);
      const torsoTwist = new SpringDamper1D(0, 130, 8.6);
      const axeBounce  = new SpringDamper1D(0, 160, 6.4);
      const bodyBounce = new SpringDamper1D(0, 190, 8.8);
      const armLUpSp   = new SpringDamper1D(0, 145, 8.4);
      const armLForeSp = new SpringDamper1D(0, 125, 7.6);
      const armRUpSp   = new SpringDamper1D(0, 145, 8.4);
      const armRForeSp = new SpringDamper1D(0, 125, 7.6);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        prevYaw: opts.homeYaw ?? 0, yawRate: 0,
        walkBlend: 0, stepPhase: 0, stepSign: 1,
        action: 'idle', actionTime: 0,
        tiltX: 0, tiltY: 0,
        sparkCd: 0, slashArcIdx: 0
      };
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: Def,
        cachePrefix: `npc_warrior_${Math.random().toString(36).slice(2, 7)}`,
        parts, partListAssets: Object.values(parts), state, sockets, footContacts: [], scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.yaw = hyaw; state.prevYaw = hyaw; state.z = 0;
          state.vx = 0; state.vy = 0; state.walkBlend = 0; state.yawRate = 0;
          state.action = 'idle'; state.actionTime = 0; state.sparkCd = 0; state.slashArcIdx = 0;
          gait.reset(hx, hy, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco = {}) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = params.springiness ?? 1.0;
          const flex = params.tailFlex ?? 1.0;
          const gFreq = params.gaitFreq ?? 1.0;

          const act = eco.action || (eco.patrol ? 'patrol' : 'idle');
          const actT = eco.actionTime ?? 0;
          if (act !== state.action) {
            state.slashArcIdx = 0;
            state.sparkCd = 0;
          }
          state.action = act;
          state.actionTime = actT;

          const isPatrol = act === 'patrol';
          state.prevYaw = state.yaw;
          Propulsion.multiLegWalk(state, dt, time, { ...params, speed: (params.speed ?? 1.0) * 0.86 }, {
            ...eco, patrol: isPatrol, walkStyle: 'heavy', baseLift: 0
          });
          state.z = 0;
          state.yawRate = clamp(wrapAngle(state.yaw - state.prevYaw) / Math.max(dt, 0.001), -5, 5);

          const spdNow = Math.hypot(state.vx, state.vy);
          state.walkBlend = lerp(state.walkBlend, clamp((spdNow - 1.4) / 6.0, 0, 1), expSmooth(dt, 10));
          state.stepPhase += dt * (2.8 + state.walkBlend * 8.2) * gFreq;

          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 1.05,
            stepHeight: 1.85 * sMul * (0.78 + flex * 0.22),
            stepThreshold: 2.4 * sMul
          });
          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 0.55 * sMul, expSmooth(dt, 12));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 0.55 * sMul, expSmooth(dt, 12));

          const maxFootOff = 3.7 * sMul;
          for (const leg of gait.legs) {
            const [ix, iy] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
            const dx = leg.footX - ix, dy = leg.footY - iy;
            const d = Math.hypot(dx, dy);
            if (d > maxFootOff) {
              leg.footX = ix + (dx / d) * maxFootOff;
              leg.footY = iy + (dy / d) * maxFootOff;
            }
          }

          if (gaitRes.landed.length > 0) {
            state.stepSign *= -1;
            bodyBounce.impulse(6.8 * sp);
            axeBounce.impulse(-11.0 * sp);
            for (const l of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.72 * sMul);
            }
          }
          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.2 * sMul }));

          let tHeadYaw = Math.sin(time * 0.85) * 0.14;
          let tTorsoTw = 0;
          let tArmLUp = -0.35, tArmLFore = -0.12;
          let tArmRUp = -0.58, tArmRFore = -0.22;

          if (act === 'patrol') {
            const sw = Math.sin(state.stepPhase);
            const swLag = Math.sin(state.stepPhase - 0.82);
            tTorsoTw = sw * 0.10;
            tArmLUp = -0.30 + sw * 0.45 * state.walkBlend;
            tArmLFore = -0.10 + swLag * 0.36 * state.walkBlend;
            // 右手稳稳握柄扛斧，随步微颠
            tArmRUp = -0.58 - sw * 0.08;
            tArmRFore = -0.22 - swLag * 0.06;
          } else if (act === 'idle') {
            // 扛斧舒展呼吸、微微晃肩颠斧
            const heft = Math.sin(time * 2.2);
            tTorsoTw = heft * 0.06;
            tArmLUp = -0.36 + heft * 0.08;
            tArmLFore = -0.14 + Math.sin(time * 2.2 - 0.8) * 0.08;
            tArmRUp = -0.56 + heft * 0.08;
            tArmRFore = -0.20 + heft * 0.06;
          } else if (act === 'cleave') {
            // 蓄力半拍 -> 猛然向前横挥大劈（炽橘金色破盾斩痕粒子弧） -> 回扛右肩
            const p = clamp(actT / 2.0, 0, 1);
            if (p < 0.32) {
              const u = smoothstep(0.0, 0.32, p);
              tTorsoTw = lerp(0, -0.78, u);
              tHeadYaw = lerp(0, 0.35, u);
              tArmRUp = lerp(-0.58, -1.15, u);
              tArmRFore = lerp(-0.22, -0.92, u);
              tArmLUp = lerp(-0.35, -0.55, u);
              tArmLFore = lerp(-0.12, -0.68, u);
            } else if (p < 0.60) {
              const u = smoothstep(0.32, 0.58, p);
              tTorsoTw = lerp(-0.78, 0.92, u);
              tHeadYaw = lerp(0.35, -0.25, u);
              tArmRUp = lerp(-1.15, 0.72, u);
              tArmRFore = lerp(-0.92, 0.88, u);
              tArmLUp = lerp(-0.55, 0.58, u);
              tArmLFore = lerp(-0.68, 0.76, u);
              // 沿横劈挥弧连续发射炽橘金色破盾斩痕粒子
              const targetIdx = Math.floor(u * 12);
              while (vfx && state.slashArcIdx < targetIdx) {
                state.slashArcIdx++;
                const arcU = state.slashArcIdx / 12;
                const arcAng = state.yaw + lerp(-1.15, 1.15, arcU);
                const rOut = 12.2 * sMul;
                const sx = state.x - Math.sin(arcAng) * rOut;
                const sy = state.y + Math.cos(arcAng) * rOut;
                const col = state.slashArcIdx % 3 === 0 ? '#fff0a6' : (state.slashArcIdx % 2 === 0 ? '#ff9c2a' : '#ff5a1f');
                vfx.spawnParticle(
                  sx, sy, (11.5 + Math.sin(arcU * Math.PI) * 1.6) * sMul,
                  -Math.sin(arcAng) * 14, Math.cos(arcAng) * 14, 2 + Math.random() * 4,
                  0.34, 1.85, col, true, 4
                );
              }
            } else {
              const u = smoothstep(0.60, 0.96, p);
              tTorsoTw = lerp(0.92, 0, u);
              tHeadYaw = lerp(-0.25, 0, u);
              tArmRUp = lerp(0.72, -0.58, u);
              tArmRFore = lerp(0.88, -0.22, u);
              tArmLUp = lerp(0.58, -0.35, u);
              tArmLFore = lerp(0.76, -0.12, u);
            }
          } else if (act === 'sharpen') {
            // 酒馆候雇动作：战斧横放身前，左手掏磨刀石顺斧刃来回蹭擦迸亮黄火屑
            const p = clamp(actT / 2.4, 0, 1);
            const hold = smoothstep(0.06, 0.18, p) * (1 - smoothstep(0.84, 0.96, p));
            const rub = Math.sin(p * Math.PI * 10);
            tTorsoTw = 0.08 * hold;
            tHeadYaw = -0.12 * hold + rub * 0.06 * hold;
            // 右手稳横持斧
            tArmRUp = lerp(-0.58, 0.25, hold);
            tArmRFore = lerp(-0.22, 0.58, hold);
            // 左手持磨刀石来回蹭刃
            tArmLUp = lerp(-0.35, 0.28 + rub * 0.24, hold);
            tArmLFore = lerp(-0.12, -0.45 + rub * 0.34, hold);
            if (hold > 0.7 && vfx) {
              state.sparkCd -= dt;
              if (state.sparkCd <= 0) {
                state.sparkCd = 0.085;
                const [kx, ky] = localToWorldXY(state.x, state.y, state.yaw, (rub * 2.6) * sMul, 7.6 * sMul);
                for (let i = 0; i < 2; i++) {
                  const a = Math.random() * Math.PI * 2;
                  vfx.spawnParticle(
                    kx, ky, 11.4 * sMul,
                    Math.cos(a) * (9 + Math.random() * 10), Math.sin(a) * (9 + Math.random() * 10), 8 + Math.random() * 8,
                    0.26, 1.1, i === 0 ? '#ffe866' : '#ffad2e', true, 36
                  );
                }
              }
            }
          }

          headYawSp.update(dt, tHeadYaw, 125 * sp, 9.2);
          torsoTwist.update(dt, tTorsoTw, 130 * sp, 8.6);
          armLUpSp.update(dt, tArmLUp, 145 * sp, 8.4);
          armLForeSp.update(dt, tArmLFore, 125 * sp, 7.6);
          armRUpSp.update(dt, tArmRUp, 145 * sp, 8.4);
          armRForeSp.update(dt, tArmRFore, 125 * sp, 7.6);
          bodyBounce.update(dt, 0, 190 * sp, 8.8);
          axeBounce.update(dt, 0, 160 * sp, 6.4);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const tYaw = yw + clamp(torsoTwist.x, -1.05, 1.05);
          const hYaw = tYaw + clamp(headYawSp.x, -0.75, 0.75);

          const breath = Math.sin(state.stepPhase * 0.5) * 0.36 * (1 - state.walkBlend * 0.35);
          const walkBob = Math.abs(Math.sin(state.stepPhase)) * 0.70 * state.walkBlend;
          const bob = clamp(bodyBounce.x * 0.055 + breath + walkBob, -0.35, 1.0) * sMul;
          const axeBob = clamp(axeBounce.x * 0.08, -1.0, 1.2) * sMul;

          // 1. 二足 IK 双腿
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const hx = l.hipWX + state.tiltX;
            const hy = l.hipWY + state.tiltY;
            const hz = l.hipWZ + bob;
            list.push({
              partKey: 'thigh', asset: parts.thigh,
              x: lerp(hx, l.kneeX, 0.30), y: lerp(hy, l.kneeY, 0.30),
              lift: Math.max(0, lerp(hz, l.kneeZ, 0.30) - 2.0 * sMul),
              ro: yw, bias: -0.34, symDeg: 90
            });
            list.push({
              partKey: 'shin', asset: parts.shin,
              x: lerp(l.kneeX, l.footX, 0.48), y: lerp(l.kneeY, l.footY, 0.48),
              lift: Math.max(0, lerp(l.kneeZ, l.footZ + 1.6 * sMul, 0.48) - 2.0 * sMul),
              ro: yw, bias: -0.28, symDeg: 90
            });
            list.push({
              partKey: 'boot', asset: parts.boot,
              x: l.footX, y: l.footY, lift: Math.max(0, l.footZ),
              ro: yw, bias: -0.22
            });
          }

          // 2. 宽肩胸甲躯干
          const tx = state.x + state.tiltX;
          const ty = state.y + state.tiltY;
          list.push({
            partKey: 'torso', asset: parts.torso,
            x: tx, y: ty, lift: 6.2 * sMul + bob, ro: tYaw, bias: 0.16
          });

          // 3. 头部 + 局部后飘鲜红额带短尾（绝不穿脑）
          const headZ = 15.8 * sMul + bob * 1.05;
          list.push({
            partKey: 'head', asset: parts.head,
            x: tx, y: ty, lift: headZ, ro: hYaw, bias: 0.46
          });

          const flutter = Math.sin(state.stepPhase * 1.35) * (0.14 + state.walkBlend * 0.24)
                        + clamp(-state.yawRate * 0.15, -0.38, 0.38);
          const [tb1X, tb1Y] = localToWorldXY(tx, ty, hYaw, -0.9 * sMul, -4.4 * sMul);
          const [tb2X, tb2Y] = localToWorldXY(tx, ty, hYaw,  0.9 * sMul, -4.4 * sMul);
          list.push({
            partKey: 'tail1', asset: parts.tail1,
            x: tb1X, y: tb1Y, lift: headZ + 3.2 * sMul, ro: hYaw + 0.24 + flutter, bias: 0.32
          });
          list.push({
            partKey: 'tail2', asset: parts.tail2,
            x: tb2X, y: tb2Y, lift: headZ + 2.8 * sMul, ro: hYaw - 0.24 + flutter * 0.85, bias: 0.30
          });

          // 4. 两段手臂 FK
          const shZ = 13.8 * sMul + bob;
          const [lShX, lShY] = localToWorldXY(tx, ty, tYaw, -5.0 * sMul, 0.3 * sMul);
          const [rShX, rShY] = localToWorldXY(tx, ty, tYaw,  5.0 * sMul, 0.3 * sMul);

          const lUpYaw = tYaw + armLUpSp.x;
          const lFoYaw = tYaw + armLForeSp.x;
          const rUpYaw = tYaw + armRUpSp.x;
          const rFoYaw = tYaw + armRForeSp.x;

          const [lUpWx, lUpWy] = pivotToWorldXY(lShX, lShY, lUpYaw, 0, -0.4 * sMul);
          const [lElX, lElY] = localToWorldXY(lShX, lShY, lUpYaw, 0, 3.2 * sMul);
          const [lFoWx, lFoWy] = pivotToWorldXY(lElX, lElY, lFoYaw, 0, -0.3 * sMul);
          const [lHdX, lHdY] = localToWorldXY(lElX, lElY, lFoYaw, 0, 3.6 * sMul);

          const [rUpWx, rUpWy] = pivotToWorldXY(rShX, rShY, rUpYaw, 0, -0.4 * sMul);
          const [rElX, rElY] = localToWorldXY(rShX, rShY, rUpYaw, 0, 3.2 * sMul);
          const [rFoWx, rFoWy] = pivotToWorldXY(rElX, rElY, rFoYaw, 0, -0.3 * sMul);
          const [rHdX, rHdY] = localToWorldXY(rElX, rElY, rFoYaw, 0, 3.6 * sMul);

          list.push({ partKey: 'upperArmL', asset: parts.upperArmL, x: lUpWx, y: lUpWy, lift: shZ - 0.8 * sMul, ro: lUpYaw, bias: 0.22 });
          list.push({ partKey: 'forearmL',  asset: parts.forearmL,  x: lFoWx, y: lFoWy, lift: shZ - 1.3 * sMul, ro: lFoYaw, bias: 0.28 });
          list.push({ partKey: 'upperArmR', asset: parts.upperArmR, x: rUpWx, y: rUpWy, lift: shZ - 0.6 * sMul, ro: rUpYaw, bias: 0.24 });
          list.push({ partKey: 'forearmR',  asset: parts.forearmR,  x: rFoWx, y: rFoWy, lift: shZ - 0.4 * sMul, ro: rFoYaw, bias: 0.30 });

          // 5. 锁死右手握柄枢轴的双态重战斧
          const isCleaveActive = state.action === 'cleave' && state.actionTime > 0.16 && state.actionTime < 1.82;
          const isSharpenActive = state.action === 'sharpen' && state.actionTime > 0.14 && state.actionTime < 2.25;

          if (isCleaveActive) {
            const axeYaw = rFoYaw + 0.18;
            const [aWx, aWy] = pivotToWorldXY(rHdX, rHdY, axeYaw, AXE_PIVOT.x * sMul, AXE_PIVOT.y * sMul);
            list.push({
              partKey: 'axeSwing', asset: parts.axeSwing,
              x: aWx, y: aWy, lift: shZ - 2.4 * sMul, ro: axeYaw, bias: 0.52
            });
          } else if (isSharpenActive) {
            // 横置战斧在身前，左手持磨刀石顺刃来回蹭
            const [axX, axY] = localToWorldXY(tx, ty, tYaw, 0.8 * sMul, 6.8 * sMul);
            list.push({
              partKey: 'axeSwing', asset: parts.axeSwing,
              x: axX, y: axY, lift: 8.6 * sMul + bob, ro: tYaw + Math.PI * 0.5, bias: 0.42
            });
            list.push({
              partKey: 'whetstone', asset: parts.whetstone,
              x: lHdX, y: lHdY, lift: 10.8 * sMul + bob, ro: lFoYaw, bias: 0.48
            });
          } else {
            // 常态右肩斜扛重斧：握点锁死右手，大宽刃威风耸立右肩后上方
            const axeYaw = tYaw - 0.14;
            const [aWx, aWy] = pivotToWorldXY(rHdX, rHdY, axeYaw, 0, 2.2 * sMul);
            list.push({
              partKey: 'axeRest', asset: parts.axeRest,
              x: aWx, y: aWy, lift: shZ - 2.8 * sMul + axeBob, ro: axeYaw, bias: 0.38
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id, code: Def.code, name: Def.name, outlineMode: 'actorUnified',
            skin: curSkin.id, footRadius: Def.footRadius, headZ: 24, centerZ: 13,
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
