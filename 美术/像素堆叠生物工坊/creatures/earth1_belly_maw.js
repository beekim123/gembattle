'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { clamp, lerp, smoothstep, smin, localToWorldXY, expSmooth } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SpringDamper3D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 地1 · 肚嘴巨兽（v3 精制重做版 · 亚马逊 Mapinguari 大地懒巨兽，+Y 正前，z=0 贴地）
  //   1. 忠实还原原型设定：浓密赤红披肩长毛的大地懒巨兽、独立四处张望的小头、肚皮正中
  //      竖裂巨嘴（交错白獠牙 + 炽热口腔深核），以及传说标志性的「反脚掌大爪」（圆厚脚跟朝前、
  //      三根弯曲大地懒巨爪朝后反扣，用来迷惑追踪脚印）；
  //   2. 四足沉稳巡游 ↔ 停步人立俯身扒拉落果双姿：4 档无损躯干（四足闭/半张/大张 + 人立昂身），
  //      大张肚嘴时吸入发酵果雾与落叶微粒，合嘴震地抖落满身长毛；
  //   3. 严守防糊清晰度规范：eyeGlint 绝不进 glowKeys、零小数缩放、4 足弯膝 IK + 护毛腕套。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      hideDark:     '#362720',
      hideMid:      '#594135',
      hideHi:       '#876552',
      furDeep:      '#421210',
      furDark:      '#691d17',
      furMid:       '#a83225',
      furHi:        '#de5b43',
      bellyDark:    '#63242b',
      bellyMid:     '#a63f48',
      bellyHi:      '#db7278',
      fangDark:     '#998e7d',
      fangMid:      '#d9cfbc',
      fangHi:       '#f7f1e3',
      pawDark:      '#211d24',
      pawMid:       '#3e3845',
      pawHi:        '#6b6475',
      eyeDark:      '#120e14',
      eyeIris:      '#f0b83a',
      eyeGlint:     '#f7feff',
      emissiveMid:  '#d94a1e',
      emissiveHot:  '#ff8a2b',
      emissiveCore: '#fff2b0'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'torso', 'fur', 'mane', 'belly', 'fang', 'mawCore',
      'neck', 'head', 'snout', 'eye', 'leg', 'cuff', 'paw', 'claw'
    ],
    noCrease: [
      ['eye', 'head'], ['head', 'snout'], ['belly', 'fang'], ['belly', 'mawCore'],
      ['torso', 'fur'], ['fur', 'mane'], ['leg', 'cuff'], ['leg', 'paw'], ['paw', 'claw']
    ],
    materials: {
      hide:  ['hideDark',  'hideMid',  'hideHi'],
      fur:   ['furDark',   'furMid',   'furHi'],
      mane:  ['furDeep',   'furDark',  'furMid'],
      belly: ['bellyDark', 'bellyMid', 'bellyHi'],
      fang:  ['fangDark',  'fangMid',  'fangHi'],
      paw:   ['pawDark',   'pawMid',   'pawHi']
    },
    protectedParts: ['eye', 'fang', 'mawCore']
  });

  const SKINS = [
    {
      id: 'ochre', name: '赤毛地懒（雨林经典）', dot: '#b8382a', outline: '#140c0a', pal: {},
      fx: { fruit: '#e66c3c', leaf: '#6ea84f' }
    },
    {
      id: 'moss', name: '苔绿林毛（古林款）', dot: '#3d8c52', outline: '#0b140d',
      pal: {
        hideDark: '#263024', hideMid: '#40523b', hideHi: '#657a5b',
        furDeep: '#14331f', furDark: '#1f4f30', furMid: '#367d4b', furHi: '#62ad6f',
        bellyDark: '#593832', bellyMid: '#8f5a4f', bellyHi: '#c78c7a',
        emissiveMid: '#68b82e', emissiveHot: '#b5f246', emissiveCore: '#f2ffba'
      },
      fx: { fruit: '#b5f246', leaf: '#5ea86b' }
    },
    {
      id: 'frost', name: '霜灰雪毛（雪原款）', dot: '#8eaec9', outline: '#0c121a',
      pal: {
        hideDark: '#2b3542', hideMid: '#4b5a6e', hideHi: '#788ca3',
        furDeep: '#485769', furDark: '#697a8f', furMid: '#a4b6cc', furHi: '#dce8f5',
        bellyDark: '#57425c', bellyMid: '#8c6991', bellyHi: '#c29ac7',
        emissiveMid: '#2b8ce6', emissiveHot: '#6ed4ff', emissiveCore: '#e0faff'
      },
      fx: { fruit: '#6ed4ff', leaf: '#a4b6cc' }
    },
    {
      id: 'volcano', name: '黑曜熔毛（火山款）', dot: '#e04826', outline: '#140a0c',
      pal: {
        hideDark: '#211a1c', hideMid: '#3b2e31', hideHi: '#5e4b4f',
        furDeep: '#2e0c0d', furDark: '#521414', furMid: '#8f241d', furHi: '#d1402a',
        bellyDark: '#612224', bellyMid: '#a13835', bellyHi: '#db6458',
        emissiveMid: '#e63214', emissiveHot: '#ff701c', emissiveCore: '#ffe880'
      },
      fx: { fruit: '#ff701c', leaf: '#c73c28' }
    }
  ];

  // 1. 4 档高精大地懒躯干（closed / half / wide / stand，无损切换）
  function buildTorso(makeCanvas, stage) {
    const isStand = stage === 'stand';
    const W = 26, D = isStand ? 24 : 28, H = isStand ? 24 : 21;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const halfW = (stage === 'wide' || isStand) ? 4.8 : (stage === 'half' ? 2.8 : 1.15);
    const mawLo = isStand ? 4.2 : (stage === 'wide' ? 2.6 : (stage === 'half' ? 3.4 : 4.2));
    const mawHi = isStand ? 16.4 : (stage === 'wide' ? 14.0 : (stage === 'half' ? 12.6 : 11.2));
    const mawFrontY = isStand ? 3.2 : 4.6;

    m.fillAABB(-11.5, 11.5, -12.5, 12.5, 1, H - 2, (x, y, z, X, Y) => {
      let d;
      if (isStand) {
        // 人立巨兽：下半身粗壮压实，胸腹挺起，浓密赤红肩背披毛
        const dPelvis = (Math.hypot(X / 9.8, (Y + 1.0) / 8.8, (z - 7.0) / 6.5) - 1) * 6.5;
        const dChest  = (Math.hypot(X / 8.8, (Y - 0.5) / 7.8, (z - 14.2) / 6.8) - 1) * 6.2;
        const dHump   = (Math.hypot(X / 7.2, (Y + 3.2) / 6.2, (z - 18.0) / 4.2) - 1) * 4.8;
        d = smin(smin(dPelvis, dChest, 2.4), dHump, 2.0);
      } else {
        // 四足大地懒：厚实宽腹 + 高耸肩峰 + 浑圆后臀
        const dBody = (Math.hypot(X / 9.8, Y / 10.8, (z - 9.2) / 7.2) - 1) * 7.2;
        const dHump = (Math.hypot(X / 7.8, (Y - 2.2) / 7.2, (z - 14.4) / 4.6) - 1) * 5.2;
        const dRump = (Math.hypot(X / 8.4, (Y + 5.2) / 6.4, (z - 11.2) / 5.4) - 1) * 5.2;
        d = smin(smin(dBody, dHump, 2.4), dRump, 2.2);
      }
      if (d > 0) return;

      // 肚皮正中竖裂巨嘴（沿 Z 轴纵向裂开）
      const inMawFront = Y > mawFrontY && Math.abs(X) <= halfW + 1.6 && z >= mawLo && z <= mawHi;
      if (inMawFront) {
        const innerCavity = Y > mawFrontY + 1.5 && Math.abs(X) <= Math.max(0.5, halfW - 0.6) && z > mawLo + 0.9 && z < mawHi - 0.9;
        if (innerCavity && stage !== 'closed') {
          if (Y < mawFrontY + 3.4) {
            m.setRaw(x, y, z, (stage === 'wide' || isStand) ? keyToId.emissiveHot : keyToId.emissiveMid, partId.mawCore);
          }
          return;
        }
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else {
        // 分层长毛披肩：肩背深红厚毛 + 侧身锯齿状毛缘
        const furEdge = (isStand ? 12.5 : 10.2) + Math.sin(X * 0.9 + Y * 0.7) * 1.4;
        const isMane = z > furEdge + 3.2 || (Y < -4.2 && z > furEdge - 1.0);
        const isFur = z > furEdge || (Y < -5.5 && z > 5.5);
        m.setRaw(x, y, z, isMane ? mat('mane') : (isFur ? mat('fur') : mat('hide')), isMane ? partId.mane : (isFur ? partId.fur : partId.torso));
      }
    });

    // 竖裂左右双排交错白獠牙
    const fangZs = isStand
      ? [5.8, 8.2, 10.6, 13.0, 15.0]
      : (stage === 'wide' ? [4.2, 6.6, 9.0, 11.4, 13.2] : (stage === 'half' ? [5.0, 7.6, 10.2] : [6.0, 8.8]));
    const fangY = isStand ? 7.6 : 9.6;
    for (let i = 0; i < fangZs.length; i++) {
      const fz = fangZs[i];
      for (const s of [-1, 1]) {
        const fx = s * (halfW + 0.35);
        const inward = stage === 'closed' ? 0.55 : (stage === 'half' ? 1.35 : 1.9);
        m.paintCapsule(fx, fangY, fz, fx - s * inward, fangY + 0.9, fz + (i & 1 ? 0.35 : -0.35), 0.96, 0.60, mat('fang'), partId.fang, true);
      }
    }

    // 炽热口腔深核
    if (stage !== 'closed') {
      const cr = (stage === 'wide' || isStand) ? 2.6 : 1.6;
      const czCore = isStand ? 10.2 : 8.2;
      const cyCore = isStand ? 5.2 : 6.8;
      m.paintEllipsoid(0, cyCore, czCore, cr, 1.5, cr * 1.45, keyToId.emissiveMid, partId.mawCore, true);
      if (stage === 'wide' || isStand) {
        m.paintEllipsoid(0, cyCore + 0.6, czCore, 1.4, 1.0, 2.2, keyToId.emissiveCore, partId.mawCore, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 13.0, headZ: 28, centerZ: 13 });
  }

  // 2. 独立大地懒小头（12×14×10：圆吻鼻梁 + 蓬松赤红冠毛 + 短耳 + 2×2 锐利双眼）
  function buildHead(makeCanvas) {
    const W = 12, D = 14, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.paintEllipsoid(0, -0.6, 4.4, 3.8, 4.0, 3.4, mat('fur'), partId.head, true);
    m.paintEllipsoid(0, -1.6, 6.4, 3.2, 3.4, 2.2, mat('mane'), partId.mane, true);
    m.paintEllipsoid(0,  3.4, 3.8, 2.4, 2.6, 2.0, mat('hide'), partId.snout, true);
    m.paintEllipsoid(0,  5.2, 4.1, 1.35, 1.0, 1.05, mat('paw'), partId.snout, true);
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 3.3, -1.4, 6.5, 1.15, 1.05, 1.55, mat('fur'), partId.head, true);
    }
    m.despeckle();
    m.applyArtShading(true);

    // 表面落点 2×2 锐利双眼（eyeGlint 不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeZ = 5, eyeY = Math.round(hd + 2.3);
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 6; step++) {
        const x = Math.round(hw + s * (4.4 - step));
        const p = m.getPartId(x, eyeY, eyeZ);
        if (p === partId.head || p === partId.snout) { sx = x; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 2.5);
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dy === 1) ? keyToId.eyeGlint : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
        }
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.0 });
  }

  function buildNeck(makeCanvas) {
    const m = new VoxelModel(11, 11, 8, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -1.6, 1.2, 0, 1.8, 5.6, 3.4, 2.7, mat('fur'), partId.neck, true);
    m.paintEllipsoid(0, -1.8, 3.2, 3.6, 2.6, 2.4, mat('mane'), partId.mane, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4 });
  }

  // 3. 粗壮带护毛的弯膝四肢 + 清晰雕琢的「反脚掌大爪」（严格锁死在肩髋 IK 线上，永不分离）
  function buildLimbSeg(makeCanvas, r, hLen, withFurCuff = false) {
    const S = Math.ceil(r * 2 + 5);
    const H = Math.ceil(hLen + 4);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.3, 0, 0, H - 1.3, r, r * 0.90, mat('hide'), partId.leg, true);
    if (withFurCuff) {
      m.paintEllipsoid(0, -0.4, H - 2.2, r * 1.22, r * 1.22, 1.9, mat('fur'), partId.cuff, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: r });
  }

  // 精雕反脚掌大爪：前方圆润厚实脚跟垫（+Y），后方三根弯曲镰状大地懒白爪（-Y）
  function buildReversedPaw(makeCanvas) {
    const m = new VoxelModel(10, 14, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0,  2.2, 2.0, 2.8, 3.0, 1.8, mat('paw'),  partId.paw, true);
    m.paintEllipsoid(0,  1.2, 4.0, 2.3, 2.4, 1.7, mat('hide'), partId.leg, true);
    m.paintEllipsoid(0,  0.4, 3.4, 2.8, 2.4, 1.2, mat('fur'),  partId.cuff, true);
    for (const cx of [-2.0, 0, 2.0]) {
      m.paintCapsule(cx, -0.4, 2.0, cx * 1.12, -3.4, 1.5, 0.98, 0.78, mat('fang'), partId.claw, true);
      m.paintCapsule(cx * 1.12, -3.4, 1.5, cx * 1.18, -5.6, 0.9, 0.78, 0.50, mat('fang'), partId.claw, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4 });
  }

  function buildFurTuft(makeCanvas, size) {
    const S = Math.ceil(size * 2 + 4);
    const H = Math.ceil(size * 2.3 + 4);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.4, 0, -0.9, H - 1.8, size * 0.70, size * 1.08, mat('fur'), partId.fur, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: size });
  }

  const Earth1Def = {
    id: 'earth1_belly_maw',
    name: '地1 · 肚嘴巨兽',
    tag: '四足/人立双姿 · 反爪重兽',
    summary: 'v3 精制重做：亚马逊 Mapinguari 大地懒巨兽，独立小头 + 4 档竖裂肚嘴与人立双姿 + 护毛四足 IK + 标志性反脚掌大爪',
    defaultHabitat: 'forest',
    footRadius: 13.5,
    ecoWeight: 1.9,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    blocks: ['四足/人立双姿切换', '4 档竖裂肚嘴与獠牙', '独立张望大地懒小头', '弯膝 IK 与反脚掌大爪', '两级赤红长毛弹簧'],
    soulHabit: '四足沉稳巡游小头四处张望 → 停步人立昂身张开竖裂肚嘴深吸落果 → 落掌震地抖毛',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torsoClosed: buildTorso(makeCanvas, 'closed'),
        torsoHalf:   buildTorso(makeCanvas, 'half'),
        torsoWide:   buildTorso(makeCanvas, 'wide'),
        torsoStand:  buildTorso(makeCanvas, 'stand'),
        neck:        buildNeck(makeCanvas),
        head:        buildHead(makeCanvas),
        limbThigh:   buildLimbSeg(makeCanvas, 3.10, 5.8, true),
        limbKnee:    buildLimbSeg(makeCanvas, 2.75, 4.8, false),
        limbShin:    buildLimbSeg(makeCanvas, 2.45, 5.4, false),
        pawBack:     buildReversedPaw(makeCanvas),
        furBig:      buildFurTuft(makeCanvas, 3.05),
        furTip:      buildFurTuft(makeCanvas, 2.15)
      };

      const gait = new MultiLegGaitSolver([
        { id: 'FL', hipX: -7.2, hipY:  6.0, hipZ: 3.6, restX: -9.2, restY:  7.0, group: 0, L1: 7.0, L2: 7.4, kneeSign: -1 },
        { id: 'FR', hipX:  7.2, hipY:  6.0, hipZ: 3.6, restX:  9.2, restY:  7.0, group: 1, L1: 7.0, L2: 7.4, kneeSign: -1 },
        { id: 'BL', hipX: -7.4, hipY: -6.4, hipZ: 3.6, restX: -9.4, restY: -6.2, group: 1, L1: 7.0, L2: 7.4, kneeSign:  1 },
        { id: 'BR', hipX:  7.4, hipY: -6.4, hipZ: 3.6, restX:  9.4, restY: -6.2, group: 0, L1: 7.0, L2: 7.4, kneeSign:  1 }
      ], {
        mode: 'walk4',
        stepThreshold: 4.6,
        stepDuration: 0.28,
        stepHeight: 3.2,
        strideAnticipation: 0.46
      });

      const furTufts = [
        { lx: -7.0, ly:  4.6, lz: 13.8, root: new SpringDamper3D(0, 0, 19, 100, 6.8), tip: new SpringDamper3D(0, 0, 16, 58, 4.4) },
        { lx:  7.0, ly:  4.6, lz: 13.8, root: new SpringDamper3D(0, 0, 19, 100, 6.8), tip: new SpringDamper3D(0, 0, 16, 58, 4.4) },
        { lx: -7.6, ly: -1.8, lz: 12.8, root: new SpringDamper3D(0, 0, 18,  92, 6.2), tip: new SpringDamper3D(0, 0, 15, 52, 4.2) },
        { lx:  7.6, ly: -1.8, lz: 12.8, root: new SpringDamper3D(0, 0, 18,  92, 6.2), tip: new SpringDamper3D(0, 0, 15, 52, 4.2) },
        { lx: -5.8, ly: -7.4, lz: 11.4, root: new SpringDamper3D(0, 0, 17,  84, 5.8), tip: new SpringDamper3D(0, 0, 14, 46, 4.0) },
        { lx:  5.8, ly: -7.4, lz: 11.4, root: new SpringDamper3D(0, 0, 17,  84, 5.8), tip: new SpringDamper3D(0, 0, 14, 46, 4.0) }
      ];

      const headLookSpring = new SpringDamper1D(0, 52, 6.6);
      const mawSpring      = new SpringDamper1D(0, 56, 7.2);
      const standSpring    = new SpringDamper1D(0, 42, 6.8);
      const bodyBounce     = new SpringDamper1D(0, 120, 7.6);

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 9.2,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        habitTimer: opts.seed ? (opts.seed % 10.5) : 0,
        mawStage: 'closed',
        standBlend: 0,
        crouch: 0,
        tiltX: 0,
        tiltY: 0,
        lookTarget: 0,
        lookTimer: 1.4,
        inhaleCd: 0,
        snapped: false
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: Earth1Def,
        cachePrefix: `earth1_v3r_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts: [],
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX; state.y = homeY; state.yaw = homeYaw;
          state.z = 9.2; state.vx = 0; state.vy = 0;
          state.mawStage = 'closed'; state.standBlend = 0;
          gait.reset(state.x, state.y, state.yaw);
          for (const f of furTufts) {
            const [fx, fy] = localToWorldXY(state.x, state.y, state.yaw, f.lx, f.ly);
            f.root.reset(fx, fy, state.z + f.lz);
            f.tip.reset(fx, fy, state.z + f.lz - 2.8);
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = params.springiness ?? 1.0;
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));

          // 10.5s 生态循环：0..4.5s 四足沉稳巡游 → 4.5..8.4s 停步人立昂身张开竖裂肚嘴深吸落果 → 8.4..10.5s 落掌震地抖毛恢复
          state.habitTimer = (state.habitTimer + dt) % 10.5;
          const ht = state.habitTimer;
          const pauseBlend  = smoothstep(4.3, 5.0, ht) * (1 - smoothstep(8.7, 9.4, ht));
          const standTarget = smoothstep(4.8, 5.7, ht) * (1 - smoothstep(7.9, 8.6, ht));
          const inhaleBlend = smoothstep(5.0, 5.9, ht) * (1 - smoothstep(8.0, 8.5, ht));
          const snapZone    = ht >= 8.35 && ht < 8.85;
          if (!snapZone) state.snapped = false;

          state.standBlend = clamp(standSpring.update(dt, standTarget, 42 * sp, clamp(6.8 * dScale, 3.0, 11.0)), 0, 1.05);
          const mawVal = clamp(mawSpring.update(dt, inhaleBlend, 58 * sp, clamp(7.2 * dScale, 3.0, 11.5)), 0, 1.15);
          state.mawStage = state.standBlend > 0.56 ? 'stand' : (mawVal > 0.65 ? 'wide' : (mawVal > 0.28 ? 'half' : 'closed'));

          state.crouch = lerp(state.crouch, (snapZone ? 1.8 : -state.standBlend * 2.2) * sMul, expSmooth(dt, 9.5));

          Propulsion.multiLegWalk(state, dt, time, params, {
            ...eco,
            walkStyle: 'heavy',
            baseLift: 9.2 * sMul,
            pauseFactor: clamp(1 - pauseBlend, 0, 1)
          });

          const gaitRes = gait.update(dt, state.x, state.y, state.z - state.crouch, state.yaw, state.vx, state.vy, {
            mode: 'walk4',
            scaleMul: sMul,
            stepFreq: params.gaitFreq ?? 1.0,
            stepHeight: 2.5 * sMul * (0.75 + (params.tailFlex ?? 1.0) * 0.25),
            stepThreshold: 4.8 * sMul
          });

          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 1.45 * sMul, expSmooth(dt, 10));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 1.45 * sMul, expSmooth(dt, 10));

          if (gaitRes.landed.length > 0) {
            bodyBounce.impulse(-16.0 * sMul);
            for (const leg of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, leg.footX, leg.footY, 1.25 * sMul);
            }
            for (const f of furTufts) {
              f.root.impulse(0, 0, -24 * sMul);
              f.tip.impulse((Math.random() - 0.5) * 14, (Math.random() - 0.5) * 14, -30 * sMul);
            }
          }

          state.lookTimer -= dt;
          if (state.lookTimer <= 0) {
            state.lookTimer = 1.2 + Math.random() * 1.4;
            const r = Math.random();
            state.lookTarget = r < 0.22 ? 0 : (r < 0.61 ? -0.60 - Math.random() * 0.18 : 0.60 + Math.random() * 0.18);
          }
          headLookSpring.update(dt, state.lookTarget, 48 * sp, clamp(6.6 * dScale, 3.0, 10.5));
          bodyBounce.update(dt, -gaitRes.liftSum * 0.14, 118 * sp, clamp(7.4 * dScale, 3.0, 12.0));

          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 3.6 * sMul }));
          sockets.setLocal('bellyMaw', state.x, state.y, state.z - state.crouch, state.yaw, 0, 9.6, 8.2 + state.standBlend * 2.5, sMul);

          state.inhaleCd -= dt;
          if (mawVal > 0.42 && state.inhaleCd <= 0) {
            state.inhaleCd = 0.075;
            const mp = sockets.get('bellyMaw');
            const [sx, sy] = localToWorldXY(mp.x, mp.y, state.yaw, (Math.random() - 0.5) * 18, 13 + Math.random() * 11);
            const sz = 1.6 + Math.random() * 8.0;
            const col = Math.random() < 0.55
              ? (curSkin.fx ? curSkin.fx.fruit : '#e66c3c')
              : (curSkin.fx ? curSkin.fx.leaf : '#6ea84f');
            vfx.spawnParticle(
              sx, sy, sz,
              (mp.x - sx) * 2.7, (mp.y - sy) * 2.7, (mp.z - sz) * 2.7,
              0.44, 1.6, col, false, 0
            );
          }

          if (snapZone && !state.snapped) {
            state.snapped = true;
            bodyBounce.impulse(-30.0 * sMul);
            for (const f of furTufts) {
              f.root.impulse(0, 0, -36 * sMul);
              f.tip.impulse((Math.random() - 0.5) * 30, (Math.random() - 0.5) * 30, -46 * sMul);
            }
            vfx.addRipple(state.x, state.y, 6, 30 * sMul, 0.58, 2.5);
            EnvFeedback.emitFootstep(vfx, habitat, state.x, state.y, 2.0 * sMul);
          }

          const bodyLift = state.z - state.crouch + clamp(bodyBounce.x * 0.14, -2.4, 2.2);
          for (const f of furTufts) {
            const [tx, ty] = localToWorldXY(state.x + state.tiltX, state.y + state.tiltY, state.yaw, f.lx * sMul, (f.ly - state.standBlend * 1.4) * sMul);
            const tz = bodyLift + (f.lz + state.standBlend * 3.4) * sMul;
            f.root.update(dt, tx, ty, tz, f.root.stiffness * sp, clamp(f.root.damping * dScale, 2.4, 11.5));
            const [tipX, tipY] = localToWorldXY(f.root.x, f.root.y, state.yaw, Math.sign(f.lx) * 1.5 * sMul, -1.3 * sMul);
            f.tip.update(dt, tipX, tipY, f.root.z - 2.8 * sMul, f.tip.stiffness * sp, clamp(f.tip.damping * dScale, 2.0, 10.5));
          }
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = habitat.isWater;
          const yw = state.yaw;
          const sb = state.standBlend;
          const breathBob = Math.sin(state.habitTimer * 2.4) * 0.55 * sMul;
          const bodyLift = state.z - state.crouch + clamp(bodyBounce.x * 0.14, -2.4, 2.2) + breathBob;
          const bx = state.x + state.tiltX;
          const by = state.y + state.tiltY;

          for (const leg of gait.legs) {
            const isFront = leg.id === 'FL' || leg.id === 'FR';
            const sideSign = (leg.id === 'FL' || leg.id === 'BL') ? -1 : 1;
            // 人立昂身时前肢高举扒拉，后肢稳稳踏地支撑！
            const frontLiftZ = isFront ? sb * (9.2 + Math.sin(state.habitTimer * 7.5 + sideSign) * 1.4) * sMul : 0;
            const [fOffX, fOffY] = isFront && sb > 0.05
              ? localToWorldXY(0, 0, yw, sideSign * sb * 1.6 * sMul, sb * 2.4 * sMul)
              : [0, 0];

            const hx = leg.hipWX + state.tiltX;
            const hy = leg.hipWY + state.tiltY;
            const hz = leg.hipWZ + frontLiftZ * 0.35;
            const fx = leg.footX + fOffX;
            const fy = leg.footY + fOffY;
            const fz = leg.footZ + frontLiftZ;
            const kx = leg.kneeX + fOffX * 0.55;
            const ky = leg.kneeY + fOffY * 0.55;
            const kz = leg.kneeZ + frontLiftZ * 0.65;

            const samples = [
              { k: 'limbThigh', x: lerp(hx, kx, 0.24), y: lerp(hy, ky, 0.24), z: lerp(hz, kz, 0.24), b: -0.55 },
              { k: 'limbKnee',  x: kx, y: ky, z: kz, b: -0.45 },
              { k: 'limbShin',  x: lerp(kx, fx, 0.54), y: lerp(ky, fy, 0.54), z: lerp(kz, fz + 2.1 * sMul, 0.54), b: -0.40 },
              { k: 'pawBack',   x: fx, y: fy, z: fz, b: isFront && sb > 0.4 ? 0.55 : -0.30 }
            ];
            for (const pt of samples) {
              list.push({
                partKey: pt.k, asset: parts[pt.k],
                x: pt.x, y: pt.y, lift: Math.max(0, pt.z - (pt.k === 'pawBack' ? 0 : 2.2 * sMul)),
                ro: yw, bias: pt.b,
                submerge: EnvFeedback.calcSubmerge(pt.z + 1.0, habitat.waterLevel, 4.6, isWater)
              });
            }
          }

          const tKey = state.mawStage === 'stand'
            ? 'torsoStand'
            : (state.mawStage === 'wide' ? 'torsoWide' : (state.mawStage === 'half' ? 'torsoHalf' : 'torsoClosed'));
          list.push({
            partKey: tKey, asset: parts[tKey],
            x: bx, y: by, lift: bodyLift,
            ro: yw, bias: 0.45,
            submerge: EnvFeedback.calcSubmerge(bodyLift + 2.0, habitat.waterLevel, 5.0, isWater)
          });

          const hRel = clamp(headLookSpring.x, -0.78, 0.78);
          const nYaw = yw + hRel * 0.35;
          const hYaw = yw + hRel;
          const [nx, ny] = localToWorldXY(bx, by, yw, 0, lerp(8.0, 3.8, sb) * sMul);
          const neckZ = bodyLift + lerp(14.8, 19.6, sb) * sMul;
          list.push({
            partKey: 'neck', asset: parts.neck,
            x: nx, y: ny, lift: neckZ,
            ro: nYaw, bias: 0.65
          });
          const [hx, hy] = localToWorldXY(nx, ny, nYaw, 0, 3.2 * sMul);
          list.push({
            partKey: 'head', asset: parts.head,
            x: hx, y: hy, lift: neckZ + 3.0 * sMul,
            ro: hYaw, bias: 0.88
          });

          for (const f of furTufts) {
            list.push({
              partKey: 'furBig', asset: parts.furBig,
              x: f.root.x, y: f.root.y, lift: f.root.z - 2.0 * sMul,
              ro: yw, symDeg: 90, bias: 0.72
            });
            list.push({
              partKey: 'furTip', asset: parts.furTip,
              x: f.tip.x, y: f.tip.y, lift: f.tip.z - 1.8 * sMul,
              ro: yw, symDeg: 90, bias: 0.78
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Earth1Def.id, name: Earth1Def.name, outlineMode: 'actorUnified',
            skin: curSkin.id, mawStage: state.mawStage, reversedPaws: true,
            footRadius: Earth1Def.footRadius, headZ: 32, centerZ: 15,
            blocks: Earth1Def.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Earth1Def);
})(window.PixelWorkshop);
