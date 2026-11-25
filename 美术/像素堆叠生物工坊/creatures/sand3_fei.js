'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 沙3 · 枯竭独目牛（《山海经》蜚 · M07 四足重兽 + 长蛇尾 + 地表干裂痕迹）
  //   1. 苍白龟裂陶土牛首 + 额心极大极醒目的亮赤红/金橙独目（俯视 ×4 一眼锁定）；
  //   2. 干裂深褐牛躯（体表深裂沟槽）+ 4 足沉重弯膝 IK 腿；
  //   3. 拖着一条深青长蛇尾（6 节拖拽链，末端分叉骨尾梢），与深褐牛躯、苍白牛首强撞色；
  //   4. 沉重迈步持续往地表痕迹层写入干裂焦纹 vfx.addDecal({ kind: 'crack', ... })
  //      并扬起枯叶尘粒；3 套皮肤，actions 含 patrol / idle / wither。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 干裂深褐牛躯主材
      bodyDark:    '#261a14',
      bodyMid:     '#473124',
      bodyHi:      '#70503b',
      // 躯干龟裂深缝与枯黄干槽
      crackDark:   '#170f0c',
      crackMid:    '#8c6a38',
      crackHi:     '#c79c52',
      // 苍白龟裂陶土牛首（极强撞色）
      clayDark:    '#8c8477',
      clayMid:     '#c9c0b0',
      clayHi:      '#ede6d8',
      // 粗壮玄黑弯曲牛角与重蹄
      hornDark:    '#141216',
      hornMid:     '#2e2930',
      hornHi:      '#544c57',
      // 深青长蛇尾主鳞
      snakeDark:   '#0f2b30',
      snakeMid:    '#1d525c',
      snakeHi:     '#388694',
      // 蛇尾浅青背纹
      snakePatDark:'#164042',
      snakePatMid: '#489e9c',
      snakePatHi:  '#88d4cc',
      // 额心巨大赤红/金橙独目（eyeGlint 严禁进 glowKeys）
      eyeDark:     '#120808',
      eyeRed:      '#e02819',
      eyeOrange:   '#ff951c',
      eyeCore:     '#ffe26e',
      eyeGlint:    '#fffcf5'
    },
    glowKeys: ['eyeRed', 'eyeOrange'],
    parts: [
      'body', 'crack', 'clay', 'horn', 'snake', 'snakePat', 'eye'
    ],
    noCrease: [
      ['body', 'crack'], ['body', 'clay'], ['body', 'horn'],
      ['clay', 'crack'], ['clay', 'horn'], ['clay', 'eye'],
      ['snake', 'snakePat'], ['body', 'snake']
    ],
    materials: {
      body:     ['bodyDark',     'bodyMid',     'bodyHi'],
      crack:    ['crackDark',    'crackMid',    'crackHi'],
      clay:     ['clayDark',     'clayMid',     'clayHi'],
      horn:     ['hornDark',     'hornMid',     'hornHi'],
      snake:    ['snakeDark',    'snakeMid',    'snakeHi'],
      snakePat: ['snakePatDark', 'snakePatMid', 'snakePatHi']
    },
    protectedParts: ['eye', 'crack', 'snakePat']
  });

  // 3 套零重建模换色皮肤
  const SKINS = [
    {
      id: 'parched_clay',
      name: '苍陶赤目（戈壁经典）',
      dot: '#c9c0b0',
      outline: '#120c0a',
      pal: {},
      fx: { crackCol: '#694e2c', crackDark: '#21150e', leaf: '#c79c52', dust: '#a88554', eyePulse: '#ff951c' }
    },
    {
      id: 'salt_drought',
      name: '盐碱裂土（白碱款）',
      dot: '#d9d4c7',
      outline: '#141214',
      pal: {
        bodyDark:    '#3b332d', bodyMid:     '#63564c', bodyHi:      '#918072',
        clayDark:    '#a6a39d', clayMid:     '#dcdad3', clayHi:      '#f7f6f0',
        snakeDark:   '#172b3d', snakeMid:    '#2b5273', snakeHi:     '#4f86b0',
        snakePatDark:'#254a5e', snakePatMid: '#68a6c4', snakePatHi:  '#a8dcf2',
        eyeRed:      '#e83c17', eyeOrange:   '#ffb326'
      },
      fx: { crackCol: '#7d7262', crackDark: '#29231d', leaf: '#d9c58c', dust: '#c9bfb0', eyePulse: '#ffb326' }
    },
    {
      id: 'scorched_earth',
      name: '焦岩铜尾（旱谷款）',
      dot: '#7a3b20',
      outline: '#140908',
      pal: {
        bodyDark:    '#2b1410', bodyMid:     '#54271d', bodyHi:      '#85402e',
        clayDark:    '#9c826e', clayMid:     '#d4b69c', clayHi:      '#f5dfc8',
        snakeDark:   '#143326', snakeMid:    '#256147', snakeHi:     '#449970',
        snakePatDark:'#244f38', snakePatMid: '#66b582', snakePatHi:  '#a6e3b6',
        eyeRed:      '#f21d2b', eyeOrange:   '#ff801f'
      },
      fx: { crackCol: '#61341f', crackDark: '#1f0e09', leaf: '#d9893d', dust: '#b56e43', eyePulse: '#ff801f' }
    }
  ];

  // =========================================================================
  // 1. 干裂深褐牛躯（22×30×18），体表雕出清晰干裂沟纹
  // =========================================================================
  function buildTorso(makeCanvas) {
    const m = new VoxelModel(22, 30, 18, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-10.0, 10.0, -14.0, 14.0, 1, 17, (x, y, z, X, Y) => {
      const dShoulder = (Math.hypot(X / 8.8, (Y - 6.0) / 7.2, (z - 9.8) / 6.4) - 1) * 6.5;
      const dBarrel   = (Math.hypot(X / 8.6, (Y + 0.5) / 8.6, (z - 9.0) / 5.8) - 1) * 6.6;
      const dRump     = (Math.hypot(X / 7.8, (Y + 8.4) / 6.2, (z - 9.2) / 5.6) - 1) * 6.0;
      const dHump     = (Math.hypot(X / 5.2, (Y - 5.2) / 5.0, (z - 14.0) / 3.2) - 1) * 4.0;
      const d = smin(smin(dShoulder, dBarrel, 2.2), smin(dRump, dHump, 2.0), 2.2);
      if (d > 0) return;

      // 龟裂沟槽纹理（交错折线裂隙露出枯黄干缝）
      const waveA = Math.abs(Math.sin(Y * 0.55 + Math.sin(X * 0.65) * 1.1));
      const waveB = Math.abs(Math.sin(X * 0.62 + Math.cos(Y * 0.48) * 1.0));
      const isCrack = z > 5.0 && (waveA < 0.14 || waveB < 0.12);
      if (isCrack) {
        m.setRaw(x, y, z, mat('crack'), partId.crack);
      } else {
        m.setRaw(x, y, z, mat('body'), partId.body);
      }
    });

    // 凸起干裂背脊骨棱
    m.paintCapsule(0, 7.2, 16.0, 0, -9.2, 14.2, 1.35, 1.15, mat('crack'), partId.crack, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 12.8, headZ: 19, centerZ: 9 });
  }

  // =========================================================================
  // 2. 苍白龟裂陶土牛首 + 额心极大极醒目赤红/金橙独目（2 档：norm / wither 怒睁）
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -4.8 };
  function buildHead(makeCanvas, wideEye) {
    const W = 20, D = 20, H = 17;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 深褐粗颈衔接肩胸
    m.paintCapsule(0, -6.2, 5.4, 0, -2.0, 6.2, 4.6, 4.4, mat('body'), partId.body, true);

    // 苍白龟裂陶土宽额牛首（高明度在深褐牛躯与黄沙上都极度醒目）
    m.fillAABB(-6.8, 6.8, -4.6, 8.6, 1, 14, (x, y, z, X, Y) => {
      const dSkull  = (Math.hypot(X / 6.0, (Y - 0.6) / 5.4, (z - 7.8) / 4.8) - 1) * 4.8;
      const dMuzzle = (Math.hypot(X / 4.2, (Y - 5.2) / 3.8, (z - 4.8) / 3.2) - 1) * 3.6;
      if (smin(dSkull, dMuzzle, 1.6) > 0) return;

      // 陶土额面细微龟裂纹（避开中央大独目区域）
      const inEyeZone = Math.abs(X) < 3.6 && Y > 2.5 && z > 6.0 && z < 12.5;
      const isCrack = !inEyeZone && Math.abs(Math.sin(X * 0.75 + z * 0.55)) < 0.11;
      m.setRaw(x, y, z, isCrack ? mat('crack') : mat('clay'), isCrack ? partId.crack : partId.clay);
    });

    // 左右粗壮弯曲玄黑牛角（高挑外展）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 4.6, -1.0, 10.6, s * 8.2, 0.2, 13.2, 1.75, 1.25, mat('horn'), partId.horn, true);
      m.paintCapsule(s * 8.2, 0.2, 13.2, s * 7.6, 2.8, 15.8, 1.20, 0.65, mat('horn'), partId.horn, true);
      // 苍白牛耳
      m.paintCapsule(s * 5.0, -2.4, 8.4, s * 7.4, -3.4, 8.0, 1.25, 0.75, mat('clay'), partId.clay, true);
    }

    // 额心巨大独目隆起眼眶（面向前上方 +Y/+Z，确保俯视 ×4 一眼看见赤红大独目！）
    const eyeR = wideEye ? 3.25 : 2.75;
    m.paintEllipsoid(0, 4.4, 9.6, eyeR + 0.7, 1.6, eyeR + 0.5, mat('crack'), partId.crack, true);

    m.despeckle();
    m.applyArtShading(true);

    // 雕刻极大极醒目的亮赤红/金橙独目（覆盖正面与顶前斜坡，俯视零遮挡！）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (let z = 7; z <= 13; z++) {
      for (let x = Math.floor(hw - 3.5); x <= Math.ceil(hw + 3.5); x++) {
        const X = x - hw;
        const dEye = Math.hypot(X / eyeR, (z - 9.8) / (eyeR * 0.88));
        if (dEye > 1.0) continue;
        // 找最靠前的表面体素
        let sy = -1;
        for (let y = D - 2; y >= 2; y--) {
          if (m.getId(x, y, z)) { sy = y; break; }
        }
        if (sy < 0) continue;
        let kId;
        if (Math.abs(X) <= 0.75 && Math.abs(z - 9.8) <= (wideEye ? 1.6 : 1.3)) {
          kId = keyToId.eyeDark; // 竖瞳
        } else if (dEye < 0.52) {
          kId = keyToId.eyeCore;
        } else if (dEye < 0.78) {
          kId = keyToId.eyeOrange;
        } else {
          kId = keyToId.eyeRed;
        }
        m.setRaw(x, sy, z, kId, partId.eye);
        if (sy + 1 < D) m.setRaw(x, sy + 1, z, kId, partId.eye);
      }
    }
    // 纯白眼点（绝不进 glowKeys）
    const gx = Math.round(hw + 1.2);
    const gz = 11;
    for (let y = D - 2; y >= 2; y--) {
      if (m.getId(gx, y, gz)) {
        m.setRaw(gx, y, gz, keyToId.eyeGlint, partId.eye);
        break;
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 7.2, headZ: 17, centerZ: 8 });
  }

  // =========================================================================
  // 3. 4 条干裂重步 IK 腿 + 玄黑牛蹄
  // =========================================================================
  function buildLegSeg(makeCanvas, rTop, rBot, hLen) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 4);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat('body'), partId.body, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildHoof(makeCanvas) {
    const m = new VoxelModel(9, 10, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -0.3, 1.0, 0, -0.2, 4.0, 2.7, 2.4, mat('body'), partId.body, true);
    m.paintEllipsoid(-1.2, 0.8, 1.4, 1.5, 2.6, 1.3, mat('horn'), partId.horn, true);
    m.paintEllipsoid( 1.2, 0.8, 1.4, 1.5, 2.6, 1.3, mat('horn'), partId.horn, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.1 });
  }

  // =========================================================================
  // 4. 深青长蛇尾节（6 节拖拽链，带浅青背纹 + 末端分叉尾梢）
  // =========================================================================
  function buildSnakeTailSeg(makeCanvas, r0, r1, lenY, banded) {
    const W = Math.max(6, Math.ceil(r0 * 2 + 4));
    const D = Math.max(7, Math.ceil(lenY + r0 * 2 + 2));
    const H = Math.max(6, Math.ceil(r0 * 2 + 4));
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const cy = lenY * 0.5;
    const cz = H * 0.5;
    m.paintCapsule(0, -cy, cz, 0, cy, cz, r1, r0, mat('snake'), partId.snake, true);
    if (banded) {
      m.paintEllipsoid(0, 0, cz + r0 * 0.55, r0 * 0.95, lenY * 0.42, r0 * 0.55, mat('snakePat'), partId.snakePat, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: r0, centerZ: Math.round(cz) });
  }

  function buildSnakeTip(makeCanvas) {
    const m = new VoxelModel(8, 12, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 2.8, 2.6, 0, -4.4, 2.4, 1.45, 0.65, mat('snake'), partId.snake, true);
    m.paintCapsule(0, -2.0, 2.6, -1.8, -5.0, 3.0, 0.72, 0.42, mat('snakePat'), partId.snakePat, true);
    m.paintCapsule(0, -2.0, 2.6,  1.8, -5.0, 3.0, 0.72, 0.42, mat('snakePat'), partId.snakePat, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, centerZ: 3 });
  }

  const TAIL_KEYS = ['tail0', 'tail1', 'tail1', 'tail2', 'tail2', 'tail3'];

  const Sand3Def = {
    id: 'sand3_fei',
    code: '沙3',
    status: 'done',
    name: '枯竭独目牛',
    tag: 'M07 重步枯竭 · 苍白独目 + 深青长蛇尾',
    summary: '苍白龟裂陶土牛首嵌额心亮赤红大独目 + 干裂深褐牛躯 + 6 节深青长蛇尾；沉重迈步持续往地表写入干裂焦纹并吹散枯叶尘粒',
    defaultHabitat: 'desert',
    footRadius: 13.5,
    ecoWeight: 2.2,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' },
      { id: 'wither', name: '枯竭震裂', loop: false, duration: 2.8, status: 'done' }
    ],
    blocks: [
      '苍白龟裂陶土牛首与额心赤红大独目',
      '干裂深褐牛躯与龟裂沟纹',
      '4 足沉重弯膝 IK',
      '6 节深青长蛇尾链',
      '迈步干裂焦纹地表痕迹与枯叶尘粒'
    ],
    soulHabit: '在戈壁沙丘沉重缓行，每一步踩过与长蛇尾拖过的地方地表瞬间写入干裂焦纹并飘起枯叶尘粒；周期性重蹄震地、独目怒睁向四周扩出干裂环纹',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torso:     buildTorso(makeCanvas),
        headNorm:  buildHead(makeCanvas, false),
        headWide:  buildHead(makeCanvas, true),
        legUpper:  buildLegSeg(makeCanvas, 3.0, 2.6, 5.4),
        legLower:  buildLegSeg(makeCanvas, 2.4, 2.2, 5.2),
        hoof:      buildHoof(makeCanvas),
        tail0:     buildSnakeTailSeg(makeCanvas, 2.6, 2.3, 3.4, true),
        tail1:     buildSnakeTailSeg(makeCanvas, 2.3, 2.0, 3.4, false),
        tail2:     buildSnakeTailSeg(makeCanvas, 1.9, 1.65, 3.2, true),
        tail3:     buildSnakeTailSeg(makeCanvas, 1.55, 1.25, 3.0, false),
        tailTip:   buildSnakeTip(makeCanvas)
      };

      const gait = new MultiLegGaitSolver([
        { id: 'FL', hipX: -6.4, hipY:  6.8, hipZ: 3.8, restX: -8.0, restY:  7.4, group: 0, L1: 6.2, L2: 6.6, kneeSign: -1 },
        { id: 'FR', hipX:  6.4, hipY:  6.8, hipZ: 3.8, restX:  8.0, restY:  7.4, group: 1, L1: 6.2, L2: 6.6, kneeSign: -1 },
        { id: 'BL', hipX: -6.4, hipY: -7.8, hipZ: 3.8, restX: -8.0, restY: -7.6, group: 1, L1: 6.2, L2: 6.6, kneeSign:  1 },
        { id: 'BR', hipX:  6.4, hipY: -7.8, hipZ: 3.8, restX:  8.0, restY: -7.6, group: 0, L1: 6.2, L2: 6.6, kneeSign:  1 }
      ], {
        mode: 'walk4',
        stepThreshold: 4.5,
        stepDuration: 0.32,
        stepHeight: 2.3,
        strideAnticipation: 0.42
      });

      // 6 节深青长蛇尾拖拽链（7 个节点：0 臀根 + 1..6 蛇尾节）
      const tailChain = new ChainSolver(7, 3.4, {
        maxAngle: 0.56,
        waveFreq: 3.0,
        wavePhaseStep: 0.58,
        waveAmp: 0.36
      });

      const bodyBounce    = new SpringDamper1D(0, 118, 8.0);
      const headDropSpring = new SpringDamper1D(0, 56, 7.2);
      const headYawSpring  = new SpringDamper1D(0, 50, 7.0);

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 8.4,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        stage: 'walk', // 'walk' | 'wither'
        stageTime: 0,
        witherPulseDone: false,
        decalCd: 0,
        tailDecalCd: 0,
        tiltX: 0,
        tiltY: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function emitCrackDecal(vfx, wx, wy, yaw, rad, sMul) {
        if (!vfx || typeof vfx.addDecal !== 'function') return;
        const fxCol = curSkin.fx || SKINS[0].fx;
        vfx.addDecal({
          kind: 'crack',
          x: wx,
          y: wy,
          yaw,
          rx: rad * sMul,
          ry: rad * 0.92 * sMul,
          life: 9.5,
          alpha: 0.88,
          color: fxCol.crackCol,
          darkColor: fxCol.crackDark
        });
      }

      function emitWitherLeaves(vfx, wx, wy, wz, count, sMul) {
        if (!vfx) return;
        const fxCol = curSkin.fx || SKINS[0].fx;
        for (let k = 0; k < count; k++) {
          const a = Math.random() * TAU;
          const spd = (5.5 + Math.random() * 10.5) * sMul;
          vfx.spawnParticle(
            wx + (Math.random() - 0.5) * 6 * sMul,
            wy + (Math.random() - 0.5) * 6 * sMul,
            wz,
            Math.cos(a) * spd, Math.sin(a) * spd, (5 + Math.random() * 8) * sMul,
            0.65 + Math.random() * 0.35, 1.45 + Math.random() * 0.55,
            k % 2 === 0 ? fxCol.leaf : fxCol.dust, false, 14
          );
        }
      }

      const instance = {
        def: Sand3Def,
        cachePrefix: `sand3_fei_${Math.random().toString(36).slice(2, 7)}`,
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
          state.x = homeX; state.y = homeY; state.z = 8.4;
          state.vx = 0; state.vy = 0; state.yaw = homeYaw;
          state.stage = 'walk';
          state.stageTime = 0;
          state.witherPulseDone = false;
          state.decalCd = 0;
          state.tailDecalCd = 0;
          state.tiltX = 0; state.tiltY = 0;
          bodyBounce.x = bodyBounce.v = 0;
          headDropSpring.x = headDropSpring.v = 0;
          headYawSpring.x = headYawSpring.v = 0;
          gait.reset(homeX, homeY, homeYaw);
          const [tx, ty] = localToWorldXY(homeX, homeY, homeYaw, 0, -12.6);
          tailChain.reset(tx, ty, 3.2, homeYaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const maxR = ((eco && eco.maxRadius) || 44) * 0.80;

          const forceWither = !!(eco && eco.action === 'wither');
          const isIdle = !forceWither && !!(eco && (eco.action === 'idle' || eco.patrol === false));

          state.stageTime += dt;
          if (forceWither && state.stage !== 'wither') {
            state.stage = 'wither';
            state.stageTime = 0;
            state.witherPulseDone = false;
          } else if (state.stage === 'walk') {
            if (!isIdle && state.stageTime >= 6.8) {
              state.stage = 'wither';
              state.stageTime = 0;
              state.witherPulseDone = false;
            } else if (isIdle && state.stageTime >= 3.2) {
              state.stage = 'wither';
              state.stageTime = 0;
              state.witherPulseDone = false;
            }
          } else if (state.stage === 'wither') {
            if (!state.witherPulseDone && state.stageTime >= 0.95) {
              state.witherPulseDone = true;
              bodyBounce.impulse(-16.0 * sMul);
              // 四周放射写入 4 处干裂焦纹并吹散枯叶尘粒
              for (let k = 0; k < 4; k++) {
                const ang = state.yaw + (k * Math.PI * 0.5) + 0.4;
                const cx = state.x + Math.cos(ang) * 11.0 * sMul;
                const cy = state.y + Math.sin(ang) * 11.0 * sMul;
                emitCrackDecal(vfx, cx, cy, ang, 6.2, sMul);
              }
              emitWitherLeaves(vfx, state.x, state.y, 4.5 * sMul, 12, sMul);
            }
            if (!forceWither && state.stageTime >= 2.6) {
              state.stage = 'walk';
              state.stageTime = 0;
            }
          }

          const isWither = state.stage === 'wither';
          const canWalk = !isIdle && !isWither;

          Propulsion.multiLegWalk(state, dt, time, params, {
            ...eco,
            maxRadius: maxR * 0.95,
            walkStyle: 'heavy',
            patrol: canWalk,
            baseLift: 8.4 * sMul,
            pauseFactor: canWalk ? 1.0 : 0
          });

          // 严格钳制在 maxRadius * 0.80 内
          const rNow = Math.hypot(state.x, state.y);
          if (rNow > maxR) {
            const sBack = maxR / rNow;
            state.x *= sBack;
            state.y *= sBack;
          }

          // 4 足沉重弯膝 IK
          const gaitRes = gait.update(dt, state.x, state.y, state.z, state.yaw, state.vx, state.vy, {
            mode: 'walk4',
            scaleMul: sMul,
            stepFreq: freq * 0.85,
            stepHeight: 2.1 * sMul,
            stepThreshold: 4.5 * sMul
          });
          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 1.05 * sMul, expSmooth(dt, 9.0));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 1.05 * sMul, expSmooth(dt, 9.0));

          state.decalCd -= dt;
          if (gaitRes.landed.length > 0) {
            bodyBounce.impulse(-13.0 * sMul);
            for (const leg of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, leg.footX, leg.footY, 1.1 * sMul);
              if (state.decalCd <= 0) {
                state.decalCd = 0.28;
                emitCrackDecal(vfx, leg.footX, leg.footY, state.yaw, 5.2, sMul);
                emitWitherLeaves(vfx, leg.footX, leg.footY, 1.4 * sMul, 4, sMul);
              }
            }
          }

          // 6 节深青长蛇尾拖拽更新 + 尾拖干裂焦纹
          const [tRootX, tRootY] = localToWorldXY(state.x, state.y, state.yaw, 0, -12.6 * sMul);
          tailChain.update(dt, tRootX, tRootY, 3.6 * sMul, state.yaw, time, {
            segLen: 3.4 * sMul,
            flexibility: flex,
            waveFreq: (isWither ? 5.2 : 2.8) * freq,
            waveAmp: isWither ? 0.45 : 0.34,
            restAlign: 0.08,
            zTargetFn: (u) => lerp(3.4, 1.4, u) * sMul
          });

          state.tailDecalCd -= dt;
          if (state.tailDecalCd <= 0 && Math.hypot(state.vx, state.vy) > 1.2) {
            state.tailDecalCd = 0.65;
            const tailMid = tailChain.nodes[4];
            emitCrackDecal(vfx, tailMid.x, tailMid.y, tailMid.yaw, 4.0, sMul);
          }

          bodyBounce.update(dt, -gaitRes.liftSum * 0.12, 118 * sp, clamp(8.0 * dScale, 3.2, 12.5));
          const targetDrop = isWither ? 2.6 : 0.4;
          headDropSpring.update(dt, targetDrop, 56 * sp, clamp(7.2 * dScale, 3.0, 11.0));
          const targetYaw = isWither ? Math.sin(time * 4.6) * 0.22 : Math.sin(time * 1.1) * 0.18;
          headYawSpring.update(dt, targetYaw, 50 * sp, clamp(7.0 * dScale, 3.0, 11.0));

          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 3.4 * sMul }));
          sockets.setLocal('eyeFront', state.x, state.y, state.z, state.yaw, 0, 15.0, 13.0, sMul);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const wl = habitat ? (habitat.waterLevel ?? -99) : -99;
          const yw = state.yaw;
          const bodyLift = state.z + clamp(bodyBounce.x * 0.14, -1.8, 1.6);
          const bx = state.x + state.tiltX;
          const by = state.y + state.tiltY;
          const isWither = state.stage === 'wither';

          // 1. 4 条重步弯膝 IK 腿
          for (const leg of gait.legs) {
            const hx = leg.hipWX + state.tiltX;
            const hy = leg.hipWY + state.tiltY;
            const samples = [
              { k: 'legUpper', x: lerp(hx, leg.kneeX, 0.25), y: lerp(hy, leg.kneeY, 0.25), z: lerp(leg.hipWZ, leg.kneeZ, 0.25), b: -0.52, sym: 90 },
              { k: 'legLower', x: lerp(leg.kneeX, leg.footX, 0.50), y: lerp(leg.kneeY, leg.footY, 0.50), z: lerp(leg.kneeZ, leg.footZ + 1.8 * sMul, 0.50), b: -0.42, sym: 90 },
              { k: 'hoof',     x: leg.footX, y: leg.footY, z: leg.footZ, b: -0.32, sym: 360 }
            ];
            for (const pt of samples) {
              list.push({
                partKey: pt.k,
                asset: parts[pt.k],
                x: pt.x,
                y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === 'hoof' ? 0 : 2.0 * sMul)),
                ro: yw,
                symDeg: pt.sym,
                bias: pt.b,
                submerge: EnvFeedback.calcSubmerge(pt.z + 1.0, wl, 4.2, isWater)
              });
            }
          }

          // 2. 6 节深青长蛇尾链 + 分叉骨尾梢
          for (let i = 1; i < tailChain.nodes.length; i++) {
            const n = tailChain.nodes[i];
            const k = TAIL_KEYS[i - 1] || 'tail3';
            list.push({
              partKey: k,
              asset: parts[k],
              x: n.x,
              y: n.y,
              lift: Math.max(0.3, n.z - 1.2 * sMul),
              ro: n.yaw,
              bias: -0.18 - i * 0.02,
              submerge: EnvFeedback.calcSubmerge(n.z, wl, 3.8, isWater)
            });
          }
          const tip = tailChain.nodes[tailChain.nodes.length - 1];
          const [tx, ty] = localToWorldXY(tip.x, tip.y, tip.yaw, 0, -2.4 * sMul);
          list.push({
            partKey: 'tailTip',
            asset: parts.tailTip,
            x: tx,
            y: ty,
            lift: Math.max(0.3, tip.z - 1.0 * sMul),
            ro: tip.yaw,
            bias: -0.34
          });

          // 3. 干裂深褐牛躯
          list.push({
            partKey: 'torso',
            asset: parts.torso,
            x: bx,
            y: by,
            lift: bodyLift,
            ro: yw,
            bias: 0.32,
            submerge: EnvFeedback.calcSubmerge(bodyLift + 2.0, wl, 4.8, isWater)
          });

          // 4. 苍白龟裂陶土牛首 + 额心极大赤红独目
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.45, 0.45));
          const headDrop = clamp(headDropSpring.x, -0.8, 3.6);
          const [hjx, hjy] = localToWorldXY(bx, by, yw, 0, (12.2 + headDrop * 0.35) * sMul);
          const [hx, hy] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const hKey = isWither ? 'headWide' : 'headNorm';
          list.push({
            partKey: hKey,
            asset: parts[hKey],
            x: hx,
            y: hy,
            lift: bodyLift + (4.8 - headDrop) * sMul,
            ro: hYaw,
            bias: 0.76
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Sand3Def.id,
            code: Sand3Def.code,
            status: Sand3Def.status,
            name: Sand3Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            stage: state.stage,
            footRadius: Sand3Def.footRadius,
            headZ: 22,
            centerZ: 11,
            blocks: Sand3Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Sand3Def);
})(window.PixelWorkshop);
