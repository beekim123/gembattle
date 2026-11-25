'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { clamp, lerp, smin, localToWorldXY, expSmooth } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 苔绿哥布林 · 高清锐利 + 骨肉连贯 v3 骨骼化纯生态版（+Y 正前，z=0 贴地）
  // 重点修复腿身分离问题：
  //   1. 大腿上延至 z=10.5 并加粗髋根，躯干基准 lift=4.4 牢牢包裹大腿上段，0 悬空缝隙
  //   2. 收拢双足 restX=±2.4、stepThreshold=1.6、stepHeight=2.6，并限制脚部最大偏移半径，
  //      彻底杜绝急转或疾跑时双腿被甩出躯干外侧造成“身腿分离”
  //   3. 保持 1:1 锐利像素绘制、eyeGlint 不进 glowKeys、警觉快转头抖耳与摆臂甩棒
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      skinDark:    '#2e6126',
      skinMid:     '#5ca339',
      skinHi:      '#9ad459',
      clothDark:   '#5e462d',
      clothMid:    '#8f6c47',
      clothHi:     '#bd966a',
      leatherDark: '#3d2417',
      leatherMid:  '#6e4228',
      leatherHi:   '#9e6540',
      woodDark:    '#4a2e1b',
      woodMid:     '#7d5030',
      woodHi:      '#b0794d',
      metalDark:   '#3a424d',
      metalMid:    '#6c788a',
      metalHi:     '#a6b5c7',
      boneDark:    '#8c8270',
      boneMid:     '#cfc5b2',
      boneHi:      '#f5efe1',
      goldDark:    '#9e6f14',
      goldMid:     '#e3ad24',
      goldHi:      '#ffe36e',
      eyeDark:     '#120f17',
      eyeIris:     '#f5d033',
      eyeGlint:    '#f7fcff',
      emissiveMid: '#ff4d1a',
      emissiveHot: '#ff9e26',
      emissiveCore:'#fff2b8'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'foot', 'leg', 'cloth', 'body', 'strap', 'pack', 'packTrim', 'packGold',
      'head', 'nose', 'mouth', 'eye', 'ear', 'arm', 'weapon', 'stud'
    ],
    noCrease: [
      ['eye', 'head'], ['nose', 'head'], ['mouth', 'head'], ['ear', 'head'],
      ['weapon', 'stud'], ['pack', 'packTrim'], ['pack', 'packGold'], ['leg', 'foot']
    ],
    materials: {
      skin:    ['skinDark',    'skinMid',    'skinHi'],
      cloth:   ['clothDark',   'clothMid',   'clothHi'],
      leather: ['leatherDark', 'leatherMid', 'leatherHi'],
      wood:    ['woodDark',    'woodMid',    'woodHi'],
      metal:   ['metalDark',   'metalMid',   'metalHi'],
      bone:    ['boneDark',    'boneMid',    'boneHi'],
      gold:    ['goldDark',    'goldMid',    'goldHi']
    },
    protectedParts: ['eye', 'mouth']
  });

  const SKINS = [
    { id: 'moss', name: '苔绿林贼', dot: '#6ab83e', outline: '#12100e', pal: {} },
    {
      id: 'ochre', name: '赭红精锐', dot: '#d9452b', outline: '#1a0c0c',
      pal: {
        skinDark:    '#6e1e18', skinMid:    '#b83c28', skinHi:    '#e86e48',
        clothDark:   '#22242b', clothMid:   '#3b3f4a', clothHi:   '#616878',
        leatherDark: '#2b1819', leatherMid: '#4f2a2c', leatherHi: '#7a4446',
        woodDark:    '#361b1b', woodMid:    '#5e2c2a', woodHi:    '#8a443f',
        metalDark:   '#7d161b', metalMid:   '#c7282b', metalHi:   '#f56258',
        eyeIris:     '#ffb829'
      }
    },
    {
      id: 'slate', name: '岩灰矿贼', dot: '#6e8c94', outline: '#101418',
      pal: {
        skinDark:    '#394a4f', skinMid:    '#627c82', skinHi:    '#96b4ba',
        clothDark:   '#6e4b16', clothMid:   '#b07d27', clothHi:   '#e3b14d',
        leatherDark: '#453322', leatherMid: '#73563a', leatherHi: '#a37e58',
        woodDark:    '#47321e', woodMid:    '#785636', woodHi:    '#ab7f55',
        metalDark:   '#576778', metalMid:   '#9ab0c4', metalHi:   '#dceaf5',
        eyeIris:     '#ffd83b'
      }
    },
    {
      id: 'indigo', name: '靛紫巫贼', dot: '#7d6bc4', outline: '#120e1c',
      pal: {
        skinDark:    '#3d3561', skinMid:    '#695e99', skinHi:    '#9f94cf',
        clothDark:   '#1d2452', clothMid:   '#32418a', clothHi:   '#576dc2',
        leatherDark: '#2c203d', leatherMid: '#4e3a6b', leatherHi: '#785d9e',
        woodDark:    '#6b6558', woodMid:    '#a8a08e', woodHi:    '#ded7c5',
        metalDark:   '#1a6b5e', metalMid:   '#2eb398', metalHi:   '#75ebd0',
        eyeIris:     '#4cf2d0'
      }
    }
  ];

  const EAR_PIVOT = { x: 4.5, y: 1.8 };
  const CLUB_PIVOT_Y = 2.0;

  // 1. 真屈膝连贯 IK 双腿（肌肉大腿 / 膝小腿 / 小皮靴，大腿根深嵌腰衣、皮靴踩实地面）
  function buildLegSeg(makeCanvas, rTop, rBot, hLen) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 3);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat('skin'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildBoot(makeCanvas) {
    const m = new VoxelModel(7, 8, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0.0, 2.2, 1.35, 1.35, 1.1, mat('skin'), partId.leg, true);
    m.paintEllipsoid(0, 1.0, 1.2, 1.75, 2.40, 1.25, mat('leather'), partId.foot, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5 });
  }

  function buildTorso(makeCanvas, runMode) {
    const m = new VoxelModel(13, runMode ? 15 : 13, 14, SPEC);
    const { mat, partId } = SPEC;
    const pitch = runMode ? 0.42 : 0.08;
    const cp = Math.cos(-pitch), sp = Math.sin(-pitch);
    m.fillAABB(-5.5, 5.5, -5.5, runMode ? 6.8 : 5.5, 0, 13, (x, y, z, X, Y) => {
      const dy = Y, dz = z - 4.2;
      const ly = dy * cp + dz * sp;
      const lz = 4.2 - dy * sp + dz * cp;
      const dTorso = (Math.hypot(X / 4.6, ly / 4.2, (lz - 7.2) / 4.6) - 1) * 4.2;
      const dNeck  = (Math.hypot(X / 2.7, (ly - 0.6) / 2.6, (lz - 11.4) / 2.2) - 1) * 2.2;
      if (smin(dTorso, dNeck, 1.3) <= 0) m.setRaw(x, y, z, mat('skin'), partId.body);
      const r = Math.hypot(X / 5.0, ly / 4.5);
      const inSkirt   = r <= 1.0 && r >= 0.52 && lz >= 1.2 && lz <= 5.4;
      const frontFlap = Math.abs(X) <= 2.4 && ly >= 2.0 && ly <= 4.7 && lz >= 0.6 && lz <= 4.8;
      const backFlap  = Math.abs(X) <= 2.5 && ly <= -2.0 && ly >= -4.5 && lz >= 0.8 && lz <= 4.6;
      if (inSkirt || frontFlap || backFlap) m.setRaw(x, y, z, mat('cloth'), partId.cloth);
    });
    const lyOff = runMode ? 1.4 : 0.3;
    m.paintCapsule(-3.9, lyOff + 2.6, 10.6, 3.7, lyOff + 2.8, 5.2, 1.05, 1.05, mat('leather'), partId.strap, true);
    m.paintCapsule(-3.7, lyOff - 2.4, 10.2, 3.3, lyOff - 2.8, 5.2, 1.05, 1.05, mat('leather'), partId.strap, true);
    m.paintEllipsoid(0.2, lyOff + 3.8, 8.0, 1.15, 0.9, 1.15, mat('metal'), partId.stud, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: runMode ? 5.5 : 5.0 });
  }

  function buildPack(makeCanvas) {
    const m = new VoxelModel(11, 10, 12, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 5.2, 4.3, 3.4, 4.2, mat('leather'), partId.pack, true);
    m.paintCapsule(-3.2, -1.4, 7.4, 3.2, -1.4, 7.4, 1.05, 1.05, mat('bone'), partId.packTrim, true);
    m.paintEllipsoid(0, -2.8, 7.5, 1.3, 1.1, 1.1, mat('bone'), partId.packTrim, true);
    m.paintEllipsoid(-1.5, -0.6, 9.2, 1.35, 1.25, 1.2, mat('gold'), partId.packGold, true);
    m.paintEllipsoid( 1.6, -0.2, 9.0, 1.25, 1.15, 1.15, mat('gold'), partId.packGold, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5 });
  }

  function buildHead(makeCanvas) {
    const W = 13, D = 17, H = 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hz = 5.6, hy = 0.0;
    m.paintEllipsoid(0, hy, hz, 5.1, 4.9, 4.8, mat('skin'), partId.head, true);
    m.paintCapsule(0, hy + 3.8, hz, 0, hy + 6.9, hz - 1.0, 1.55, 1.05, mat('skin'), partId.nose, true);
    m.fillAABB(-2.8, 2.8, hy + 3.8, hy + 5.6, hz - 3.5, hz - 2.0, (x, y, z, X, Y) => {
      if (Math.abs(X) <= 2.3 && Y >= hy + 4.1 && Y <= hy + 5.0 && z >= Math.round(hz - 3.1) && z <= Math.round(hz - 2.4)) {
        m.setRaw(x, y, z, keyToId.eyeDark, partId.mouth);
      }
    });
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (const s of [-1, 1]) {
      const tx = Math.round(hw + s * 1.8), ty = Math.round(hd + hy + 4.8), tz = Math.round(hz - 2.4);
      m.setRaw(tx, ty, tz, keyToId.boneHi, partId.mouth);
      m.setRaw(tx, ty, tz - 1, keyToId.boneMid, partId.mouth);
    }
    m.despeckle();
    m.applyArtShading(true);

    const eyeZ = Math.round(hz + 1.8);
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 2.6);
      let sy = -1;
      for (let y = D - 2; y >= 1; y--) {
        if (m.getPartId(ex, y, eyeZ) === partId.head) { sy = y; break; }
      }
      if (sy < 0) sy = Math.round(hd + hy + 4.4);
      for (const dx of [0, s]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dx === 0) ? keyToId.eyeGlint : (dx === 0 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(ex + dx, sy, eyeZ + dz, kId, partId.eye);
        }
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 5.2 });
  }

  function buildEar(makeCanvas, side) {
    const m = new VoxelModel(12, 8, 8, SPEC);
    const { mat, partId } = SPEC;
    const rx = -side * EAR_PIVOT.x, ry = EAR_PIVOT.y, rz = 2.4;
    m.paintCapsule(rx, ry, rz, rx + side * 4.4, ry - 1.6, rz + 1.1, 2.0, 1.55, mat('skin'), partId.ear, true);
    m.paintCapsule(rx + side * 4.4, ry - 1.6, rz + 1.1, rx + side * 8.8, ry - 4.0, rz + 2.6, 1.55, 1.22, mat('skin'), partId.ear, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5 });
  }

  function buildArm(makeCanvas, side) {
    const m = new VoxelModel(10, 10, 8, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 5.0, side * 2.6, 2.4, 3.6, 1.45, 1.35, mat('skin'), partId.arm, true);
    m.paintCapsule(side * 2.6, 2.4, 3.6, side * 3.4, 5.0, 4.4, 1.35, 1.25, mat('skin'), partId.arm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5 });
  }

  function buildClub(makeCanvas) {
    const m = new VoxelModel(10, 12, 18, SPEC);
    const { mat, partId } = SPEC;
    const c0 = [0, -CLUB_PIVOT_Y, 2.0];
    const c1 = [1.8, 3.4 - CLUB_PIVOT_Y, 14.4];
    m.paintCapsule(c0[0], c0[1], c0[2], c1[0], c1[1], c1[2], 1.25, 2.08, mat('wood'), partId.weapon, true);
    const mx = lerp(c0[0], c1[0], 0.72), my = lerp(c0[1], c1[1], 0.72), mz = lerp(c0[2], c1[2], 0.72);
    m.paintEllipsoid(mx, my, mz, 2.1, 2.1, 1.35, mat('metal'), partId.stud, true);
    const tx = lerp(c0[0], c1[0], 0.88), ty = lerp(c0[1], c1[1], 0.88), tz = lerp(c0[2], c1[2], 0.88);
    for (const st of [[2.1,0,0.4],[-2.1,0,0.4],[0,2.1,0.4],[0,-2.1,0.4]]) {
      m.paintCapsule(tx, ty, tz, tx + st[0], ty + st[1], tz + st[2], 1.05, 0.85, mat('metal'), partId.stud, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0 });
  }

  const GoblinDef = {
    id: 'goblin_scout',
    name: '苔绿哥布林',
    tag: '双足敏捷碎步',
    summary: 'v3 锐利骨肉连贯版：腿身紧密咬合 + 紧致高频碎步 + 滞后金币包袱 + 摆臂甩棒 + 警觉快转头抖耳',
    defaultHabitat: 'forest',
    footRadius: 7.2,
    ecoWeight: 0.78,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    blocks: ['双态微蹲/前倾躯干', '紧致连贯 2 足 IK', '滞后颠簸金币包袱', '摆臂甩木棒', '警觉快转头抖耳'],
    soulHabit: '原地微蹲警觉快转头抖耳掂棒 → 压低身子紧致高频小碎步窜跑扬尘',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legThigh:  buildLegSeg(makeCanvas, 1.78, 1.50, 3.8),
        legShin:   buildLegSeg(makeCanvas, 1.48, 1.38, 3.6),
        boot:      buildBoot(makeCanvas),
        torso:     buildTorso(makeCanvas, false),
        torsoRun:  buildTorso(makeCanvas, true),
        pack:      buildPack(makeCanvas),
        head:      buildHead(makeCanvas),
        earL:      buildEar(makeCanvas, -1),
        earR:      buildEar(makeCanvas,  1),
        armL:      buildArm(makeCanvas, -1),
        armR:      buildArm(makeCanvas,  1),
        club:      buildClub(makeCanvas)
      };

      // 2 足屈膝窜跑 IK（hipZ=6.8 深嵌腰衣裙摆，bendDir=1 膝盖向前弯）
      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.2, hipY: -0.2, hipZ: 6.8, restX: -2.4, restY: 0.3, group: 0, L1: 3.8, L2: 4.0, bendDir: 1 },
        { id: 'R', hipX:  2.2, hipY: -0.2, hipZ: 6.8, restX:  2.4, restY: 0.3, group: 1, L1: 3.8, L2: 4.0, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 1.9, stepDuration: 0.115, stepHeight: 1.8, strideAnticipation: 0.44 });

      const headLookSpring = new SpringDamper1D(0, 160, 8.2);
      const earLSpring     = new SpringDamper1D(0, 210, 6.4);
      const earRSpring     = new SpringDamper1D(0, 210, 6.4);
      const packBounce     = new SpringDamper1D(0, 140, 5.8);
      const packSway       = new SpringDamper1D(0, 110, 6.0);
      const clubSpring     = new SpringDamper1D(0, 115, 5.8);
      const armSpring      = new SpringDamper1D(0, 150, 7.2);
      const bodyBounce     = new SpringDamper1D(0, 200, 8.4);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        sprintBlend: 0, stepPhase: 0,
        lookTarget: 0, lookTimer: 0.7 + ((opts.seed || 0) % 1.0),
        habitTimer: opts.seed || 0, stepSign: 1, dustCd: 0
      };
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: GoblinDef,
        cachePrefix: `goblin_v3e_${Math.random().toString(36).slice(2, 7)}`,
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
          state.vx = 0; state.vy = 0; state.sprintBlend = 0;
          gait.reset(hx, hy, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = params.springiness ?? 1.0;
          const flex = params.tailFlex ?? 1.0;
          const gFreq = params.gaitFreq ?? 1.0;
          state.habitTimer += dt;

          Propulsion.multiLegWalk(state, dt, time, { ...params, speed: (params.speed ?? 1.0) * 1.25 }, {
            ...eco, walkStyle: 'scurry', baseLift: 0
          });
          state.z = 0;

          const spdNow = Math.hypot(state.vx, state.vy);
          const targetSprint = clamp((spdNow - 2.4) / 7.0, 0, 1);
          state.sprintBlend = lerp(state.sprintBlend, targetSprint, expSmooth(dt, 11.5));
          state.stepPhase += dt * (4.0 + state.sprintBlend * 15.0) * gFreq;

          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 1.65,
            stepHeight: 1.8 * sMul * (0.75 + flex * 0.25),
            stepThreshold: 1.9 * sMul
          });
          state.tiltX = lerp(state.tiltX || 0, gaitRes.tiltX * 0.65 * sMul, expSmooth(dt, 14));
          state.tiltY = lerp(state.tiltY || 0, gaitRes.tiltY * 0.65 * sMul, expSmooth(dt, 14));

          // 温和钳位双脚相对髋部的极限偏移，保护急转不脱臼
          const maxFootOffset = 3.6 * sMul;
          for (const leg of gait.legs) {
            const [idealX, idealY] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
            const dx = leg.footX - idealX, dy = leg.footY - idealY;
            const d = Math.hypot(dx, dy);
            if (d > maxFootOffset) {
              leg.footX = idealX + (dx / d) * maxFootOffset;
              leg.footY = idealY + (dy / d) * maxFootOffset;
            }
          }

          if (gaitRes.landed.length > 0) {
            state.stepSign *= -1;
            bodyBounce.impulse(9.5 * sp);
            packBounce.impulse(-16.0 * sp);
            packSway.impulse(state.stepSign * 9.0 * sp);
            clubSpring.impulse(state.stepSign * 5.8 * sp);
            earLSpring.impulse(-7.0 * sp);
            earRSpring.impulse(7.0 * sp);
            for (const l of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.78 * sMul);
            }
          }

          if (state.sprintBlend > 0.5) {
            state.dustCd -= dt;
            if (state.dustCd <= 0) {
              state.dustCd = 0.09;
              EnvFeedback.emitFootstep(vfx, habitat, state.x, state.y, 0.45 * sMul);
            }
          }

          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.1 * sMul }));

          const moving = state.sprintBlend > 0.35;
          state.lookTimer -= dt;
          if (state.lookTimer <= 0) {
            state.lookTimer = moving ? 0.38 : (0.55 + Math.random() * 1.05);
            if (!moving) {
              const r = Math.random();
              state.lookTarget = r < 0.2 ? 0 : (r < 0.6 ? -0.52 - Math.random() * 0.22 : 0.52 + Math.random() * 0.22);
              if (state.lookTarget < -0.1) earLSpring.impulse(-14.0 * sp);
              else if (state.lookTarget > 0.1) earRSpring.impulse(14.0 * sp);
              clubSpring.impulse((Math.random() - 0.5) * 7.5 * sp);
            } else {
              state.lookTarget = 0;
            }
          }

          headLookSpring.update(dt, moving ? Math.sin(state.stepPhase * 0.5) * 0.14 : state.lookTarget, 160 * sp, 8.2);
          earLSpring.update(dt, moving ? -0.40 + Math.sin(state.stepPhase) * 0.12 : Math.sin(time * 6.5) * 0.16, 210 * sp, 6.4);
          earRSpring.update(dt, moving ?  0.40 - Math.sin(state.stepPhase) * 0.12 : -Math.sin(time * 5.8 + 1.1) * 0.16, 210 * sp, 6.4);

          bodyBounce.update(dt, 0, 200 * sp, 8.4);
          packBounce.update(dt, moving ? -0.4 : 0, 140 * sp, 5.8);
          packSway.update(dt, moving ? Math.sin(state.stepPhase) * 0.22 : Math.sin(time * 2.4) * 0.05, 110 * sp, 6.0);

          const armTarget = moving ? Math.sin(state.stepPhase) * 0.62 : Math.sin(time * 4.2) * 0.20;
          armSpring.update(dt, armTarget, 150 * sp, 7.2);

          const clubTarget = moving ? -0.52 + Math.sin(state.stepPhase - 0.5) * 0.30 : 0.16 + Math.sin(time * 4.8) * 0.26;
          clubSpring.update(dt, clubTarget, 115 * sp, 5.8);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const isRun = state.sprintBlend > 0.38;
          const yw = state.yaw;
          const hYaw = yw + clamp(headLookSpring.x, -0.78, 0.78);

          // 压实垂直弹跳范围 [-0.3, +1.0]，确保腰臀永远严密咬合大腿根部！
          const crouchBreath = Math.sin(state.habitTimer * 3.6) * 0.45 * (1 - state.sprintBlend * 0.5);
          const runBob = Math.abs(Math.sin(state.stepPhase)) * 0.72 * state.sprintBlend;
          const bob = clamp(bodyBounce.x * 0.06 + crouchBreath + runBob, -0.3, 1.05) * sMul;
          const packBob = clamp(packBounce.x * 0.12, -1.5, 2.0) * sMul;
          const packRo = yw + clamp(packSway.x, -0.36, 0.36);

          // 1. 2 条真屈膝 IK 双腿（大腿根深嵌腰衣，膝小腿连贯衔接，皮靴稳踩落点）
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const hx = l.hipWX + (state.tiltX || 0);
            const hy = l.hipWY + (state.tiltY || 0);
            const hz = l.hipWZ + bob;
            const segs = [
              { k: 'legThigh', x: lerp(hx, l.kneeX, 0.25), y: lerp(hy, l.kneeY, 0.25), z: lerp(hz, l.kneeZ, 0.25), b: -0.32, sym: 90 },
              { k: 'legShin',  x: lerp(l.kneeX, l.footX, 0.45), y: lerp(l.kneeY, l.footY, 0.45), z: lerp(l.kneeZ, l.footZ + 1.4 * sMul, 0.45), b: -0.26, sym: 90 },
              { k: 'boot',     x: l.footX, y: l.footY, z: l.footZ, b: -0.20, sym: 0 }
            ];
            for (const pt of segs) {
              const item = {
                partKey: pt.k, asset: parts[pt.k],
                x: pt.x, y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === 'boot' ? 0 : 1.7 * sMul)),
                ro: yw, bias: pt.b
              };
              if (pt.sym) item.symDeg = pt.sym;
              list.push(item);
            }
          }

          // 2. 躯干（叠加二足左右窜跑摇摆 + 深度嵌合大腿根）
          const tId = isRun ? 'torsoRun' : 'torso';
          const [tx, ty] = localToWorldXY(state.x + (state.tiltX || 0), state.y + (state.tiltY || 0), yw, 0, 0.4 * sMul);
          list.push({
            partKey: tId, asset: parts[tId],
            x: tx, y: ty, lift: 4.4 * sMul + bob, ro: yw, bias: 0.15
          });

          // 3. 背后鼓囊皮包袱
          const [pkX, pkY] = localToWorldXY(tx, ty, yw, 0, (isRun ? -5.8 : -6.2) * sMul);
          list.push({
            partKey: 'pack', asset: parts.pack,
            x: pkX, y: pkY, lift: 6.2 * sMul + bob + packBob, ro: packRo, bias: -0.25
          });

          // 4. 头部 + 两侧大尖耳
          const [hx, hy] = localToWorldXY(tx, ty, yw, 0, (isRun ? 2.8 : 1.2) * sMul);
          const headZ = (isRun ? 13.8 : 14.6) * sMul + bob * 1.05;
          list.push({
            partKey: 'head', asset: parts.head,
            x: hx, y: hy, lift: headZ, ro: hYaw, bias: 0.4
          });

          for (const s of [-1, 1]) {
            const [eShX, eShY] = localToWorldXY(hx, hy, hYaw, s * 4.5 * sMul, 0.2 * sMul);
            const eYaw = hYaw + clamp(s < 0 ? earLSpring.x : earRSpring.x, -0.64, 0.64);
            const [eWx, eWy] = localToWorldXY(eShX, eShY, eYaw, s * EAR_PIVOT.x * sMul, -EAR_PIVOT.y * sMul);
            const eKey = s < 0 ? 'earL' : 'earR';
            list.push({
              partKey: eKey, asset: parts[eKey],
              x: eWx, y: eWy, lift: headZ + 3.2 * sMul, ro: eYaw, bias: 0.25
            });
          }

          // 5. 左右臂 + 锁枢轴铁钉木棒
          const shY = (isRun ? 1.6 : 0.2) * sMul;
          const shZ = 9.4 * sMul + bob;
          const [lShX, lShY] = localToWorldXY(tx, ty, yw, -4.4 * sMul, shY);
          const [rShX, rShY] = localToWorldXY(tx, ty, yw,  4.4 * sMul, shY);
          const lArmY = yw + armSpring.x;
          const rArmY = yw - armSpring.x * 0.85;
          const armLBob = Math.max(0, Math.sin(state.stepPhase)) * 1.1 * state.sprintBlend * sMul;
          const armRBob = Math.max(0, -Math.sin(state.stepPhase)) * 1.1 * state.sprintBlend * sMul
                        + Math.sin(state.habitTimer * 4.8) * 0.6 * (1 - state.sprintBlend) * sMul;

          list.push({ partKey: 'armL', asset: parts.armL, x: lShX, y: lShY, lift: shZ + armLBob, ro: lArmY, bias: 0.2 });
          list.push({ partKey: 'armR', asset: parts.armR, x: rShX, y: rShY, lift: shZ + armRBob, ro: rArmY, bias: 0.2 });

          const [rHdX, rHdY] = localToWorldXY(rShX, rShY, rArmY, 3.4 * sMul, 5.0 * sMul);
          const cYaw = rArmY + clubSpring.x;
          const [cWx, cWy] = localToWorldXY(rHdX, rHdY, cYaw, 0, CLUB_PIVOT_Y * sMul);
          list.push({
            partKey: 'club', asset: parts.club,
            x: cWx, y: cWy, lift: shZ + 1.8 * sMul + armRBob, ro: cYaw, bias: 0.35
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: GoblinDef.id, name: GoblinDef.name, outlineMode: 'actorUnified',
            skin: curSkin.id, footRadius: GoblinDef.footRadius, headZ: 26, centerZ: 13,
            blocks: GoblinDef.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(GoblinDef);
})(window.PixelWorkshop);
