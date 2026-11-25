'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { clamp, lerp, smoothstep, smin, localToWorldXY, pivotToWorldXY, expSmooth } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 水3 · 一头十身鱼（v3 高精锐利骨骼化纯生态版，+Y 正前）
  // 严格遵循防糊与精制标杆：
  //   1. eyeGlint 严禁进 glowKeys（仅额心与尾核使用 emissiveMid/Hot/Core）
  //   2. 常态 1:1 像素无损绘制（彻底取消小数 scaleX/scaleY 拉伸，呼吸由骨骼起伏与胸鳍驱动）
  //   3. 24×26×16 高精鱼头：宽吻、独立鳃盖暗缝、双颌须、赤色棘冠、2×2 表面零遮挡锐利双眼
  //   4. 10 条独立修长鱼身沿后缘弧形摊开（±9.0 格），9 节细长渐变 + 双叶尾尖，根根分明不粘连
  //   5. smoothstep + 弹簧连续驱动「折扇张合搅泥觅食 ↔ 聚尾蓄力冲刺」，零硬开关跳变
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      bodyDark:     '#123b4a',
      bodyMid:      '#22768a',
      bodyHi:       '#5ec8cc',
      scaleAccent:  '#359ba8',
      gillDark:     '#163040',
      gillMid:      '#285c73',
      gillHi:       '#539ab0',
      bellyDark:    '#8fa8a4',
      bellyMid:     '#c7ddd8',
      bellyHi:      '#edf7f4',
      finDark:      '#1a5875',
      finMid:       '#3d99b8',
      finHi:        '#94e2f0',
      crestDark:    '#7d2022',
      crestMid:     '#cf3f36',
      crestHi:      '#f57a5b',
      barbelDark:   '#8a4224',
      barbelMid:    '#d47b44',
      barbelHi:     '#f7bb74',
      mouthDeep:    '#0c1820',
      eyeDark:      '#0b1018',
      eyeIris:      '#f2be38',
      eyeGlint:     '#f9feff',
      emissiveMid:  '#24c4c4',
      emissiveHot:  '#7ef2e8',
      emissiveCore: '#ebfffd'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'head', 'snout', 'belly', 'gill', 'crest', 'barbel', 'mouth',
      'eye', 'core', 'pecFin', 'finRay', 'seg', 'segBelly', 'dorsal', 'tailTip'
    ],
    noCrease: [
      ['eye', 'head'], ['eye', 'snout'], ['core', 'head'],
      ['head', 'snout'], ['head', 'belly'], ['barbel', 'snout'],
      ['mouth', 'snout'], ['seg', 'segBelly'], ['seg', 'dorsal'],
      ['pecFin', 'finRay'], ['tailTip', 'finRay']
    ],
    materials: {
      body:   ['bodyDark',   'bodyMid',   'bodyHi'],
      gill:   ['gillDark',   'gillMid',   'gillHi'],
      belly:  ['bellyDark',  'bellyMid',  'bellyHi'],
      fin:    ['finDark',    'finMid',    'finHi'],
      crest:  ['crestDark',  'crestMid',  'crestHi'],
      barbel: ['barbelDark', 'barbelMid', 'barbelHi']
    },
    protectedParts: ['eye', 'core', 'barbel']
  });

  const SKINS = [
    {
      id: 'jade', name: '碧溪青鳞', dot: '#28a8b8', outline: '#071722', pal: {},
      fx: { mud: '#6e6556', spark: '#7ef2e8' }
    },
    {
      id: 'koi', name: '锦鲤朱白', dot: '#e85a4a', outline: '#1c0c10',
      pal: {
        bodyDark: '#9e2e24', bodyMid: '#e0503e', bodyHi: '#ff9678', scaleAccent: '#f27457',
        gillDark: '#7a221c', gillMid: '#bd3b2d', gillHi: '#eb6e52',
        bellyDark: '#b8b0a4', bellyMid: '#ebe4d8', bellyHi: '#fffcf5',
        finDark: '#a67b58', finMid: '#e3be94', finHi: '#fff0d6',
        crestDark: '#6e1616', crestMid: '#c42b24', crestHi: '#ff664d',
        barbelDark: '#963b1e', barbelMid: '#de783c', barbelHi: '#ffbe73',
        emissiveMid: '#eb7238', emissiveHot: '#ffb366', emissiveCore: '#fff6de'
      },
      fx: { mud: '#7a6958', spark: '#ffb366' }
    },
    {
      id: 'ink', name: '玄墨金纹', dot: '#d9a441', outline: '#080b12',
      pal: {
        bodyDark: '#19202e', bodyMid: '#2e3a52', bodyHi: '#5a6c8c', scaleAccent: '#425270',
        gillDark: '#121824', gillMid: '#243045', gillHi: '#475978',
        bellyDark: '#696256', bellyMid: '#a39884', bellyHi: '#dbd1bd',
        finDark: '#7d5618', finMid: '#cf952b', finHi: '#ffe07d',
        crestDark: '#8c4b14', crestMid: '#db8228', crestHi: '#ffc86e',
        barbelDark: '#7a4d16', barbelMid: '#c78828', barbelHi: '#f7ca65',
        eyeIris: '#eb4d38',
        emissiveMid: '#e09e24', emissiveHot: '#ffd966', emissiveCore: '#fffbe0'
      },
      fx: { mud: '#595550', spark: '#ffd966' }
    },
    {
      id: 'coral', name: '珊瑚赤金', dot: '#ec6b78', outline: '#1e0a12',
      pal: {
        bodyDark: '#752236', bodyMid: '#c24258', bodyHi: '#f07c86', scaleAccent: '#db5c6e',
        gillDark: '#5e1a2c', gillMid: '#a13148', gillHi: '#d96272',
        bellyDark: '#b3897a', bellyMid: '#e3bba8', bellyHi: '#fce5d4',
        finDark: '#91384c', finMid: '#d96c78', finHi: '#ffb0a8',
        crestDark: '#8c5014', crestMid: '#db8e26', crestHi: '#ffd25c',
        barbelDark: '#945616', barbelMid: '#e0982e', barbelHi: '#ffdf78',
        eyeIris: '#38c7b8',
        emissiveMid: '#f09e38', emissiveHot: '#ffd97a', emissiveCore: '#fffce3'
      },
      fx: { mud: '#7d645a', spark: '#ffd97a' }
    }
  ];

  // 1. 高精饱满大鱼头（24×26×16：宽吻 + 独立鳃盖暗缝 + 双颌须 + 赤色棘冠 + 2×2 表面锐利双眼）
  function buildHead(makeCanvas) {
    const W = 24, D = 26, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-10.5, 10.5, -10.5, 11.5, 1, 13, (x, y, z, X, Y) => {
      const dMain  = (Math.hypot(X / 8.0, (Y - 0.6) / 8.8, (z - 6.6) / 5.0) - 1) * 5.2;
      const dSnout = (Math.hypot(X / 5.4, (Y - 6.4) / 4.4, (z - 5.8) / 3.6) - 1) * 3.8;
      // 后缘宽弧肩脊，平稳承接 ±9 格摊开的 10 条鱼身根部
      const dRear  = (Math.hypot(X / 9.8, (Y + 4.8) / 4.2, (z - 6.0) / 4.0) - 1) * 4.2;
      const d = smin(smin(dMain, dSnout, 2.0), dRear, 2.2);
      if (d <= 0) {
        const isBelly = z < 4.2 && Math.abs(X) < 6.8;
        const isSnout = !isBelly && Y > 5.4;
        const isScale = !isBelly && z >= 8 && ((Math.round(X * 0.7 + Y * 0.7) & 1) === 0) && d > -1.3;
        m.setRaw(
          x, y, z,
          isBelly ? mat('belly') : (isScale ? keyToId.scaleAccent : mat('body')),
          isBelly ? partId.belly : (isSnout ? partId.snout : partId.head)
        );
      }
    });

    // 吻端上唇收棱与深暗口缝
    m.paintCapsule(-3.4, 9.6, 5.8, 3.4, 9.6, 5.8, 1.35, 1.35, mat('body'), partId.snout, true);
    m.paintCapsule(-3.0, 10.0, 4.0, 3.0, 10.0, 4.0, 1.0, 1.0, keyToId.mouthDeep, partId.mouth, true);

    // 左右立体鳃盖（独立 gill partId 切出清晰结构暗缝）
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 7.4, -1.2, 6.4, 2.1, 4.2, 3.8, mat('gill'), partId.gill, true);
      m.paintCapsule(s * 8.6, -4.4, 4.4, s * 8.4, -5.0, 8.8, 1.05, 0.95, mat('gill'), partId.gill, true);
    }

    // 左右双颌须（外后舒展，增强东方异鱼辨识度）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 4.6, 7.6, 4.8, s * 8.0, 6.2, 4.4, 0.95, 0.72, mat('barbel'), partId.barbel, true);
      m.paintCapsule(s * 8.0, 6.2, 4.4, s * 10.0, 3.0, 4.0, 0.72, 0.55, mat('barbel'), partId.barbel, true);
      m.paintCapsule(s * 3.8, 8.8, 5.4, s * 6.2, 9.6, 5.0, 0.68, 0.52, mat('barbel'), partId.barbel, true);
    }

    // 头顶赤色棘冠（三角鳍膜 + 三根硬棘层次）
    m.paintFinTri([0, 4.4, 10.6], [0, -2.4, 14.8], [0, -6.8, 9.8], 0.95, mat('crest'), partId.crest, true);
    m.paintCapsule(0, 3.6, 10.8, 0, -0.8, 14.6, 0.9, 0.6, mat('crest'), partId.crest, true);
    m.paintCapsule(0, 0.2, 10.6, 0, -3.4, 13.8, 0.85, 0.55, mat('crest'), partId.crest, true);

    // 额心自亮鳞珠（仅此使用 glowKeys）
    m.paintEllipsoid(0, 5.4, 10.2, 1.65, 1.65, 1.1, keyToId.emissiveMid, partId.core, true);
    m.paintEllipsoid(0, 5.6, 10.7, 1.05, 1.05, 0.85, keyToId.emissiveHot, partId.core, true);
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    m.setRaw(Math.round(hw), Math.round(hd + 5.8), 11, keyToId.emissiveCore, partId.core);

    m.despeckle();
    m.applyArtShading(true);

    // 后置表面落点 2×2 锐利鱼眼（0.6 俯视严格 0 遮挡，eyeGlint 绝不进 glowKeys）
    const eyeZ = 8;
    const eyeY = Math.round(hd + 5.8);
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 8; step++) {
        const x = Math.round(hw + s * (8.5 - step));
        const p = m.getPartId(x, eyeY, eyeZ);
        if (p === partId.head || p === partId.snout) { sx = x; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 5.2);
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dy === 1)
            ? keyToId.eyeGlint
            : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
          // 内嵌 1 格防斜视角漏色
          m.setRaw(sx - s, eyeY + dy - 1, eyeZ + dz, kId === keyToId.eyeGlint ? keyToId.eyeIris : kId, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 9.8, headZ: 16, centerZ: 7 });
  }

  // 2. 独立曲面划水胸鳍（带赤色前缘硬棘与放射鳍丝，枢轴锁于 (0, 0)）
  const PEC_PIVOT = { x: 4.5, y: 3.2 };
  function buildPecFin(makeCanvas, side) {
    const m = new VoxelModel(15, 15, 9, SPEC);
    const { mat, partId } = SPEC;
    const rx = -side * PEC_PIVOT.x, ry = PEC_PIVOT.y, rz = 4.2;
    const pRoot = [rx, ry, rz];
    const pTip  = [rx + side * 8.6, ry - 2.4, rz + 1.2];
    const pMid  = [rx + side * 5.6, ry - 7.8, rz - 0.8];
    const pBack = [rx + side * 0.8, ry - 5.6, rz - 0.8];

    m.paintFinTri(pRoot, pTip, pMid, 0.92, mat('fin'), partId.pecFin, false);
    m.paintFinTri(pRoot, pMid, pBack, 0.85, mat('fin'), partId.pecFin, false);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pTip[0], pTip[1], pTip[2], 1.1, 0.72, mat('crest'), partId.finRay, true);
    m.paintCapsule(pRoot[0], pRoot[1], pRoot[2], pMid[0], pMid[1], pMid[2], 0.72, 0.52, mat('fin'), partId.finRay, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0 });
  }

  // 3. 修长纤细雄鱼体节（5 档渐变 r = 2.25 -> 1.15，10 条并行根根分明不糊团）
  function buildBodySeg(makeCanvas, radius, withDorsal, withGem) {
    const S = Math.ceil(radius * 2 + 5);
    const D = Math.ceil(radius * 2.6 + 5);
    const H = Math.ceil(radius * 2 + (withDorsal ? 5 : 3));
    const m = new VoxelModel(S, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const cz = radius + 0.9;

    m.fillAABB(-radius - 0.6, radius + 0.6, -radius * 1.35 - 0.6, radius * 1.35 + 0.6, 0, H - 1, (x, y, z, X, Y) => {
      const d = Math.hypot(X / radius, Y / (radius * 1.32), (z - cz) / (radius * 0.92));
      if (d <= 1.0) {
        const isBelly = z < cz - radius * 0.42;
        const isStripe = !isBelly && Math.abs(z - cz) <= 0.65 && Math.abs(X) > radius * 0.55;
        m.setRaw(
          x, y, z,
          isBelly ? mat('belly') : (isStripe ? keyToId.scaleAccent : mat('body')),
          isBelly ? partId.segBelly : partId.seg
        );
      }
    });

    if (withDorsal) {
      m.paintFinTri(
        [0, radius * 0.85, cz + radius * 0.65],
        [0, -radius * 0.35, cz + radius + 2.1],
        [0, -radius * 0.95, cz + radius * 0.3],
        0.65, mat('crest'), partId.dorsal, false
      );
    }

    if (withGem) {
      const hw = S * 0.5 - 0.5, hd = D * 0.5 - 0.5;
      m.setRaw(Math.round(hw), Math.round(hd), Math.min(H - 1, Math.round(cz + radius * 0.8)), keyToId.emissiveMid, partId.core);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: radius });
  }

  // 4. 锐利双叶分叉尾尖（枢轴锁在 y = +3.2）
  const TAIL_TIP_PIVOT_Y = 3.2;
  function buildTailTip(makeCanvas) {
    const m = new VoxelModel(11, 13, 9, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const ry = TAIL_TIP_PIVOT_Y, cz = 4.0;
    const pRoot = [0, ry, cz];

    m.paintCapsule(0, ry, cz, 0, ry - 3.2, cz, 1.08, 0.82, mat('body'), partId.seg, true);
    m.paintFinTri(pRoot, [-3.6, ry - 7.8, cz + 1.4], [0, ry - 4.4, cz - 0.2], 0.78, mat('fin'), partId.tailTip, false);
    m.paintFinTri(pRoot, [ 3.6, ry - 7.8, cz + 1.4], [0, ry - 4.4, cz - 0.2], 0.78, mat('fin'), partId.tailTip, false);
    m.paintCapsule(0, ry - 0.4, cz, -3.2, ry - 7.2, cz + 1.2, 0.72, 0.52, mat('crest'), partId.finRay, true);
    m.paintCapsule(0, ry - 0.4, cz,  3.2, ry - 7.2, cz + 1.2, 0.72, 0.52, mat('crest'), partId.finRay, true);
    m.setRaw(5, Math.round(6 + ry - 3.6), Math.round(cz + 0.5), keyToId.emissiveHot, partId.core);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0 });
  }

  const TAIL_COUNT = 10;
  const SEG_PER_TAIL = 9; // 9 节修长鱼身 + 1 双叶尾尖

  const Water3Def = {
    id: 'water3_ten_tail',
    name: '水3 · 一头十身鱼',
    tag: '水生十尾流体链',
    summary: 'v3 锐利精制：24×26 高精鱼头（鳃盖暗缝+双颌须+2×2双眼）+ 10 条摊开修长雄鱼身 + 折扇搅泥冲刺',
    defaultHabitat: 'river',
    footRadius: 9.8,
    ecoWeight: 1.15,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    blocks: ['高精鱼头与鳃盖', '10 根摊开拖拽鱼链', '双叶锁枢轴尾尖', '独立划水胸鳍', '折扇搅泥与冲刺'],
    soulHabit: '10 条鱼身折扇舒展搅泥觅食 ↔ 平滑聚尾蓄力破水冲刺',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        head:    buildHead(makeCanvas),
        pecFinL: buildPecFin(makeCanvas, -1),
        pecFinR: buildPecFin(makeCanvas,  1),
        segA:    buildBodySeg(makeCanvas, 2.25, true,  false),
        segB:    buildBodySeg(makeCanvas, 1.95, true,  false),
        segC:    buildBodySeg(makeCanvas, 1.65, false, false),
        segD:    buildBodySeg(makeCanvas, 1.38, false, true),
        segE:    buildBodySeg(makeCanvas, 1.15, false, false),
        tailTip: buildTailTip(makeCanvas)
      };

      // 10 条鱼身根部沿鱼头后缘弧形充分摊开（±9.0 格），外侧略微后收，确保 10 条清晰分离
      const chains = [];
      for (let tIdx = 0; tIdx < TAIL_COUNT; tIdx++) {
        const u = tIdx / (TAIL_COUNT - 1) - 0.5; // -0.5 .. +0.5
        const absU = Math.abs(u);
        const segLen = lerp(2.55, 2.25, absU * 2);
        const ch = new ChainSolver(SEG_PER_TAIL, segLen, {
          maxAngle: 0.46,
          waveFreq: 4.4,
          wavePhaseStep: 0.56,
          waveAmp: 0.44
        });
        ch.fanBase  = u * 1.78;                  // 舒展时扇面张角清晰分开
        ch.rootOffX = u * 18.0;                  // 覆盖 -9.0 .. +9.0 格
        ch.rootOffY = -5.6 - absU * absU * 6.4;  // 弧形后收贴合鱼头后缘
        ch.phaseOff = tIdx * 0.72;               // 相位错开呈现涟漪波浪
        chains.push(ch);
      }

      const finSpringL = new SpringDamper1D(0, 115, 8.2);
      const finSpringR = new SpringDamper1D(0, 115, 8.2);
      const fanSpring  = new SpringDamper1D(1.0, 46, 7.2);
      const surgeSpring = new SpringDamper1D(0.0, 52, 7.5);

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 1.8,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        phase: 0,
        thrustPulse: 0,
        turnRate: 0,
        wakeCd: 0,
        mudCd: 0,
        habitTimer: opts.seed ? (opts.seed % 9) : 0,
        fanOpen: 1.0,
        surgePower: 0.0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: Water3Def,
        cachePrefix: `water3_v3_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
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
          state.vx = 0; state.vy = 0;
          state.fanOpen = 1.0; state.surgePower = 0.0;
          for (const ch of chains) {
            const [rx, ry] = localToWorldXY(state.x, state.y, state.yaw, ch.rootOffX, ch.rootOffY);
            ch.reset(rx, ry, state.z + 2.2, state.yaw + ch.fanBase);
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const flex = params.tailFlex ?? 1.0;
          const sp = params.springiness ?? 1.0;

          // 平滑连续习性循环（9.6s 周期，无硬布尔跳变）：
          // 0~5.4s 折扇舒展搅泥觅食 -> 5.4~6.8s 平滑聚尾蓄力 -> 6.8~8.2s 破水冲刺 -> 8.2~9.6s 舒展滑行
          state.habitTimer = (state.habitTimer + dt) % 9.6;
          const ht = state.habitTimer;
          const gatherBlend = smoothstep(5.2, 6.4, ht) * (1 - smoothstep(8.0, 9.2, ht));
          const surgeBlend  = smoothstep(6.5, 7.1, ht) * (1 - smoothstep(7.9, 8.7, ht));

          const damp = clamp(7.2 / Math.sqrt(Math.max(0.35, sp)), 3.2, 11.5);
          state.fanOpen    = clamp(fanSpring.update(dt, lerp(1.0, 0.34, gatherBlend), 46 * sp, damp), 0.28, 1.12);
          state.surgePower = clamp(surgeSpring.update(dt, surgeBlend, 56 * sp, damp), 0, 1.15);

          Propulsion.pulseSwim(state, dt, time, params, {
            ...eco,
            burstBoost: 1.0 + state.surgePower * 0.56,
            baseLift: habitat.isWater ? 1.8 : 5.4
          });

          // 独立胸鳍划水（二阶弹簧，转弯时外侧鳍幅更大）
          const finFreq = (params.gaitFreq ?? 1.0) * lerp(4.2, 7.6, state.surgePower);
          const finAmp  = lerp(0.42, 0.62, state.surgePower);
          const finTgtL = Math.sin(time * finFreq) * finAmp + clamp(state.turnRate * 0.14, -0.35, 0.35);
          const finTgtR = Math.sin(time * finFreq + 0.45) * finAmp - clamp(state.turnRate * 0.14, -0.35, 0.35);
          finSpringL.update(dt, finTgtL, 110 * sp, damp);
          finSpringR.update(dt, finTgtR, 110 * sp, damp);

          sockets.setLocal('mouth', state.x, state.y, state.z, state.yaw, 0, 9.8, 4.8, sMul);

          // 10 条修长鱼身链式更新（根部随 fanOpen 在 ±9.0 ↔ ±4.8 之间平滑收放）
          const waveFreq = (params.gaitFreq ?? 1.0) * lerp(4.2, 7.2, state.surgePower);
          const rootSpread = lerp(0.54, 1.0, state.fanOpen);
          for (let tIdx = 0; tIdx < TAIL_COUNT; tIdx++) {
            const ch = chains[tIdx];
            const spreadAng = ch.fanBase * state.fanOpen;
            const [rx, ry] = localToWorldXY(
              state.x, state.y, state.yaw,
              ch.rootOffX * rootSpread * sMul,
              ch.rootOffY * sMul
            );
            ch.update(dt, rx, ry, state.z + 2.4 * sMul, state.yaw, time, {
              segLen: ch.segLen * sMul,
              flexibility: flex,
              maxAngle: 0.46,
              waveFreq,
              waveAmp: lerp(0.28, 0.52, state.fanOpen),
              fanAngle: spreadAng,
              phaseOffset: ch.phaseOff,
              restAlign: lerp(0.18, 0.08, state.fanOpen),
              zTargetFn: (u) => {
                const waveZ = Math.sin(time * waveFreq * 0.78 - u * 3.8 + ch.phaseOff) * 1.4 * flex * sMul;
                return Math.max(habitat.isWater ? -0.8 : 1.6, state.z + (2.3 - u * 1.4) * sMul + waveZ);
              }
            });
          }

          // 破水尾迹与冲刺气泡
          state.wakeCd -= dt;
          if (state.wakeCd <= 0 && (Math.hypot(state.vx, state.vy) > 3.8 || state.thrustPulse > 0.25)) {
            state.wakeCd = lerp(0.11, 0.055, state.surgePower);
            EnvFeedback.emitWaterWake(
              vfx, habitat, state.x, state.y, state.yaw,
              (9.2 + state.thrustPulse * 4.6 + state.surgePower * 3.0) * sMul,
              clamp(state.thrustPulse + state.surgePower * 0.4, 0, 1)
            );
          }

          // 折扇搅泥微粒 / 冲刺水泡
          state.mudCd -= dt;
          if (state.mudCd <= 0) {
            if (state.surgePower > 0.35) {
              state.mudCd = 0.09;
              const mp = sockets.get('mouth');
              vfx.spawnParticle(
                mp.x, mp.y, mp.z,
                (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 8 + Math.random() * 5,
                0.52, 1.4, curSkin.fx ? curSkin.fx.spark : '#7ef2e8', true, -4
              );
            } else if (state.fanOpen > 0.82 && habitat.isWater) {
              state.mudCd = 0.22;
              const pickTail = chains[Math.floor(Math.random() * TAIL_COUNT)];
              const nd = pickTail.nodes[pickTail.nodes.length - 1];
              vfx.spawnParticle(
                nd.x, nd.y, Math.max(0.5, nd.z),
                (Math.random() - 0.5) * 5, (Math.random() - 0.5) * 5, 3.5 + Math.random() * 3.0,
                0.65, 1.3, curSkin.fx ? curSkin.fx.mud : '#6e6556', false, -5
              );
            }
          }
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = habitat.isWater;
          // 常态严守 1:1 像素无损绘制：呼吸与脉冲律动由骨骼微浮与头偏摆体现
          const headBob = Math.sin(state.phase * 0.9) * 0.65 * sMul;
          const headYaw = state.yaw + Math.sin(state.phase) * 0.085;

          // 1. 左右独立划水胸鳍（锁死枢轴于鳃盖后下侧）
          for (const s of [-1, 1]) {
            const [shX, shY] = localToWorldXY(state.x, state.y, headYaw, s * 7.2 * sMul, -1.6 * sMul);
            const fYaw = headYaw + (s < 0 ? finSpringL.x : -finSpringR.x);
            const [wx, wy] = pivotToWorldXY(shX, shY, fYaw, -s * PEC_PIVOT.x * sMul, PEC_PIVOT.y * sMul);
            list.push({
              partKey: s < 0 ? 'pecFinL' : 'pecFinR',
              asset: s < 0 ? parts.pecFinL : parts.pecFinR,
              x: wx, y: wy, lift: state.z + 1.6 * sMul + headBob * 0.6,
              ro: fYaw, bias: 0.35,
              submerge: EnvFeedback.calcSubmerge(state.z + 2.0, habitat.waterLevel, 5.0, isWater)
            });
          }

          // 2. 高精大鱼头（零小数缩放）
          list.push({
            partKey: 'head', asset: parts.head,
            x: state.x, y: state.y, lift: state.z + headBob,
            ro: headYaw, bias: 0.9,
            submerge: EnvFeedback.calcSubmerge(state.z + 2.6, habitat.waterLevel, 5.0, isWater)
          });

          // 3. 10 条 9 节渐变修长鱼身 + 锁枢轴双叶尾尖
          const segKeys = ['segA', 'segA', 'segB', 'segB', 'segC', 'segC', 'segD', 'segE'];
          for (let tIdx = 0; tIdx < TAIL_COUNT; tIdx++) {
            const nodes = chains[tIdx].nodes;
            for (let i = 1; i < nodes.length; i++) {
              const n = nodes[i];
              const pKey = segKeys[Math.min(i - 1, segKeys.length - 1)];
              list.push({
                partKey: pKey, asset: parts[pKey],
                x: n.x, y: n.y, lift: n.z - 1.8 * sMul, ro: n.yaw,
                bias: i === 1 ? -0.45 : -0.05 * i,
                submerge: EnvFeedback.calcSubmerge(n.z, habitat.waterLevel, 4.8, isWater)
              });
            }
            const tip = nodes[nodes.length - 1];
            const [fx, fy] = pivotToWorldXY(tip.x, tip.y, tip.yaw, 0, TAIL_TIP_PIVOT_Y * sMul);
            list.push({
              partKey: 'tailTip', asset: parts.tailTip,
              x: fx, y: fy, lift: tip.z - 2.2 * sMul, ro: tip.yaw, bias: -0.4,
              submerge: EnvFeedback.calcSubmerge(tip.z, habitat.waterLevel, 4.8, isWater)
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Water3Def.id, name: Water3Def.name, outlineMode: 'actorUnified',
            skin: curSkin.id, footRadius: Water3Def.footRadius, headZ: 16, centerZ: 7,
            blocks: Water3Def.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Water3Def);
})(window.PixelWorkshop);
