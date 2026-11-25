'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, fbm1, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 泽5 · 跟着水温挪的一群（M13 编队群落 · 7 只圆胖果冻小水兽 · 预烘 3 档温色切换）
  //
  // 【体貌与俯视清晰度设计】
  // - 俯视 ×4 放大关键特征色块：
  //   1. 7 只圆胖饱满的果冻状小水兽（body 13×14×10 + 独立摆动圆尾鳍 tail 8×8×6），头顶双圆触角+亮白内核斑；
  //   2. 预烘 3 套鲜明温度分色资产（严禁每帧重刷贴图！）：
  //      - 暖橙红（hot，内圈热泉口 r < maxR * 0.34）
  //      - 明金黄（warm，中圈温水台阶 maxR * 0.34 ~ 0.56）
  //      - 翠碧绿（cool，外圈凉水台阶 r >= maxR * 0.56）
  //      只按每只小兽所处位置半径切换已预烘的资产引用，零帧内重烘开销；
  //   3. 随着群落从热泉内层台阶一路游到中层、外层台阶再折返，先头与后队依次变色，
  //      整群肉眼可见地从橙红一路渐变成金黄、翠绿，观赏性极强！
  // - 预算检查：31 色 <= 48，0 重色，0 禁用字，全部部件单件 <= 14 格，严禁常态拉伸。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 温度档 1：暖橙红（内圈热泉层）
      hotDark:    '#a82814',
      hotMid:     '#f05024',
      hotHi:      '#ff9659',
      hotCore:    '#ffd199',
      hotFinDark: '#871d10',
      hotFinMid:  '#d93c1e',
      hotFinHi:   '#ff7b47',
      // 温度档 2：明金黄（中圈温水层）
      warmDark:   '#a86d0a',
      warmMid:    '#f0b21a',
      warmHi:     '#ffe266',
      warmCore:   '#fff6b8',
      warmFinDark:'#855408',
      warmFinMid: '#d49514',
      warmFinHi:  '#ffd147',
      // 温度档 3：翠碧绿（外圈凉水层）
      coolDark:   '#0f7850',
      coolMid:    '#20bf7a',
      coolHi:     '#6ef0ad',
      coolCore:   '#c7ffe0',
      coolFinDark:'#0a593d',
      coolFinMid: '#179964',
      coolFinHi:  '#52db99',
      // 共用萌态大圆眼（eyeGlint 不进 glowKeys）
      eyeDark:    '#0d1217',
      eyeIris:    '#29384a',
      eyeGlint:   '#f7fcff',
      // 共用果冻顶白泡点
      speckHi:    '#ffffff',
      // 热泉眼矿石小堆（中央温阶参考标志，不随皮肤变化）
      ventDark:   '#5c4338',
      ventMid:    '#8c6854',
      ventHi:     '#c49a7e',
      // 泉眼橙红菌毯边缘
      matDark:    '#94341e',
      matMid:     '#cf582e',
      matHi:      '#f58c4c'
    },
    glowKeys: [],
    parts: [
      'hotBody', 'hotCore', 'hotFin',
      'warmBody', 'warmCore', 'warmFin',
      'coolBody', 'coolCore', 'coolFin',
      'eye', 'speck', 'vent', 'mat'
    ],
    noCrease: [
      ['hotBody', 'hotCore'], ['hotBody', 'speck'], ['hotBody', 'eye'],
      ['warmBody', 'warmCore'], ['warmBody', 'speck'], ['warmBody', 'eye'],
      ['coolBody', 'coolCore'], ['coolBody', 'speck'], ['coolBody', 'eye'],
      ['vent', 'mat']
    ],
    materials: {
      hotBody:  ['hotDark',     'hotMid',     'hotHi'],
      hotFin:   ['hotFinDark',  'hotFinMid',  'hotFinHi'],
      warmBody: ['warmDark',    'warmMid',    'warmHi'],
      warmFin:  ['warmFinDark', 'warmFinMid', 'warmFinHi'],
      coolBody: ['coolDark',    'coolMid',    'coolHi'],
      coolFin:  ['coolFinDark', 'coolFinMid', 'coolFinHi'],
      vent:     ['ventDark',    'ventMid',    'ventHi'],
      mat:      ['matDark',     'matMid',     'matHi']
    },
    protectedParts: ['eye', 'speck', 'hotCore', 'warmCore', 'coolCore']
  });

  // 3 套零重建模换色皮肤（每套保持 3 档温度色带鲜明过渡，0 禁用字，0 重色）
  const SKINS = [
    {
      id: 'thermal_classic',
      name: '橙黄翠阶（热泉经典）',
      dot: '#f05024',
      outline: '#1a1210',
      pal: {},
      fx: { hot: '#ff8a52', warm: '#ffde66', cool: '#66edb0' }
    },
    {
      id: 'coral_cyan',
      name: '朱桃碧青（硫池款）',
      dot: '#e84364',
      outline: '#1f0d17',
      pal: {
        hotDark:     '#9c193a', hotMid:     '#e6375d', hotHi:     '#ff7d97', hotCore:     '#ffc9d4',
        hotFinDark:  '#7a122e', hotFinMid:  '#c7284c', hotFinHi:  '#ff6385',
        warmDark:    '#a8561c', warmMid:    '#eb8c34', warmHi:    '#ffc478', warmCore:    '#ffebd1',
        warmFinDark: '#854214', warmFinMid: '#cf7425', warmFinHi: '#ffad5c',
        coolDark:    '#106882', coolMid:    '#22a8c9', coolHi:    '#75e0f5', coolCore:    '#d1f7ff',
        coolFinDark: '#0b4e66', coolFinMid: '#1888a8', coolFinHi: '#59cbe6'
      },
      fx: { hot: '#ff7d97', warm: '#ffc478', cool: '#75e0f5' }
    },
    {
      id: 'plum_mint',
      name: '莓紫薄荷（矿泉款）',
      dot: '#b83bc7',
      outline: '#170d21',
      pal: {
        hotDark:     '#731982', hotMid:     '#b538c7', hotHi:     '#e87ff5', hotCore:     '#f7ccff',
        hotFinDark:  '#591266', hotFinMid:  '#9928ab', hotFinHi:  '#d966eb',
        warmDark:    '#9e6c14', warmMid:    '#e0a228', warmHi:    '#ffd66b', warmCore:    '#fff2bd',
        warmFinDark: '#7d530d', warmFinMid: '#c2881d', warmFinHi: '#ffc454',
        coolDark:    '#187a66', coolMid:    '#32c2a3', coolHi:    '#82f2d6', coolCore:    '#d4fff2',
        coolFinDark: '#105c4d', coolFinMid: '#24a186', coolFinHi: '#66e0c2'
      },
      fx: { hot: '#e87ff5', warm: '#ffd66b', cool: '#82f2d6' }
    }
  ];

  // =========================================================================
  // 1. 预烘 3 套温度分色圆胖果冻体（13×14×10）+ 独立圆尾鳍（8×8×6）
  //    tier: 'hot' | 'warm' | 'cool'
  // =========================================================================
  function buildJellyBody(makeCanvas, tier) {
    const W = 13, D = 14, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const bodyMat = tier + 'Body';
    const coreKey = tier + 'Core';
    const finMat  = tier + 'Fin';
    const bodyPid = partId[bodyMat];
    const corePid = partId[coreKey];
    const finPid  = partId[finMat];

    // 圆胖饱满的果冻水滴身躯（俯视占比宽大，一眼清晰！）
    m.fillAABB(-5.8, 5.8, -6.2, 6.2, 1, H - 1, (x, y, z, X, Y) => {
      const dMain = (Math.hypot(X / 4.8, (Y - 0.3) / 5.2, (z - 4.4) / 3.9) - 1.0) * 4.2;
      const dCheek = (Math.hypot(X / 5.1, (Y - 1.5) / 3.4, (z - 3.6) / 2.8) - 1.0) * 3.0;
      const d = smin(dMain, dCheek, 1.5);
      if (d > 0 || z < 1) return;

      // 顶部中央露出一片柔和浅亮内核斑，营造果冻透润质感
      const dCore = Math.hypot(X / 2.4, (Y + 0.2) / 2.6);
      if (z >= 7.0 && dCore < 1.0) {
        m.setRaw(x, y, z, keyToId[coreKey], corePid);
      } else {
        m.setRaw(x, y, z, mat(bodyMat), bodyPid);
      }
    });

    // 两侧圆润小胸鳍
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 4.6, 0.2, 3.2, 1.5, 2.0, 1.2, mat(finMat), finPid, true);
    }

    // 头顶一对圆珠触角（区分朝向与萌态轮廓）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.9, 2.6, 7.2, s * 2.5, 3.8, 9.0, 0.95, 0.72, mat(finMat), finPid, true);
      m.paintEllipsoid(s * 2.5, 3.8, 9.0, 0.85, 0.85, 0.75, keyToId[coreKey], corePid, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 顶侧亮白小水泡点 + 前方圆溜黑眼
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    m.setRaw(Math.round(hw - 1.5), Math.round(hd - 1.0), 8, keyToId.speckHi, partId.speck);
    m.setRaw(Math.round(hw + 1.8), Math.round(hd - 2.2), 7, keyToId.speckHi, partId.speck);

    const eyeY = Math.round(hd + 4.2);
    const eyeZ = 5;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 2.4);
      m.setRaw(ex, eyeY, eyeZ, keyToId.eyeDark, partId.eye);
      m.setRaw(ex, eyeY + 1, eyeZ, keyToId.eyeDark, partId.eye);
      m.setRaw(ex, eyeY, eyeZ + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 5.4, headZ: 9, centerZ: 5 });
  }

  const TAIL_PIVOT = { x: 0, y: 2.8, attachY: -4.8 };

  function buildJellyTail(makeCanvas, tier) {
    const W = 8, D = 8, H = 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const finMat = tier + 'Fin';
    const coreKey = tier + 'Core';
    const finPid = partId[finMat];
    const corePid = partId[coreKey];

    m.paintEllipsoid(0, 2.4, 3.0, 1.8, 1.8, 1.5, mat(finMat), finPid, true);
    m.paintEllipsoid(0, -1.0, 3.0, 2.6, 2.4, 1.4, mat(finMat), finPid, true);
    m.paintEllipsoid(0, -2.2, 3.2, 1.3, 1.2, 0.9, keyToId[coreKey], corePid, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 5, centerZ: 3 });
  }

  // =========================================================================
  // 2. 热泉眼矿石小堆（中央温阶泉眼标志，12×12×7）
  // =========================================================================
  function buildHotVent(makeCanvas) {
    const m = new VoxelModel(12, 12, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 2.0, 5.2, 5.0, 2.2, mat('vent'), partId.vent, true);
    m.paintEllipsoid(0, 0, 3.4, 3.8, 3.6, 1.6, mat('mat'), partId.mat, true);
    m.paintEllipsoid(-2.4, 2.0, 3.2, 1.8, 1.6, 1.8, mat('vent'), partId.vent, true);
    m.paintEllipsoid(2.6, -1.8, 3.0, 1.7, 1.6, 1.6, mat('vent'), partId.vent, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.4, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 7 只圆胖果冻小水兽编队槽位（前后拉成长队列，跨温阶游动时形成橙→黄→绿肉眼渐变长龙！）
  // =========================================================================
  const SWARM_PROFILES = [
    { idx: 0, slotX:   0.0, slotY:  12.0, speedMul: 1.05, phase: 0.0, tailFreq: 8.8, seedOff: 11 },
    { idx: 1, slotX:  -8.5, slotY:   5.5, speedMul: 1.00, phase: 0.9, tailFreq: 9.4, seedOff: 23 },
    { idx: 2, slotX:   8.5, slotY:   4.2, speedMul: 1.02, phase: 1.8, tailFreq: 9.1, seedOff: 37 },
    { idx: 3, slotX:  -3.5, slotY:  -2.8, speedMul: 0.98, phase: 2.7, tailFreq: 9.8, seedOff: 53 },
    { idx: 4, slotX:   7.2, slotY:  -6.5, speedMul: 0.96, phase: 3.6, tailFreq: 8.6, seedOff: 71 },
    { idx: 5, slotX: -10.5, slotY:  -9.0, speedMul: 0.94, phase: 4.5, tailFreq: 9.5, seedOff: 89 },
    { idx: 6, slotX:   0.5, slotY: -13.5, speedMul: 0.93, phase: 5.4, tailFreq: 10.1, seedOff: 103 }
  ];

  const Marsh5Def = {
    id: 'marsh5_thermal_swarm',
    code: '泽5',
    status: 'done',
    name: '跟着水温挪的一群',
    tag: 'M13 编队群落 · 7只圆胖果冻小水兽温阶变色',
    summary: '7 只共享资产的圆胖果冻小水兽，预烘 3 套鲜明温度分色资产（暖橙红 / 明金黄 / 翠碧绿）按所处半径分档切换（严禁每帧重刷贴图）；群落跨热泉梯田台阶游动时肉眼可见一路从橙红渐变成金黄、翠绿',
    defaultHabitat: 'hotspring',
    footRadius: 0.5,
    ecoWeight: 0.65,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol',  name: '自由巡游', loop: true,  status: 'done' },
      { id: 'idle',    name: '原地待机', loop: true,  status: 'done' },
      { id: 'migrate', name: '温阶迁徙', loop: false, duration: 5.0, status: 'done' }
    ],
    blocks: [
      '7 只共享贴图圆胖果冻小水兽（双触角 + 透润内核斑 + 摆尾）',
      '预烘 3 档温度分色资产（暖橙红 / 明金黄 / 翠碧绿）零重刷切换',
      '滞回半径分档 + 跨层换色泡泡涟漪反馈',
      '长纵队鱼群迁移轨迹：先头变翠绿、中段明金黄、后队仍橙红'
    ],
    soulHabit: '7 只圆胖果冻小水兽成群排成纵队绕热泉梯田游弋 -> 从内圈热泉口（暖橙红）一路向外圈凉水台阶游去，经过中层台阶逐只变成明金黄、抵达外层化作翠碧绿，停留觅食菌毯后再成群折返由绿返黄回橙红',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      // 一次性预烘全部 3 套温度分色资产，运行时零重刷贴图！
      const parts = {
        bodyHot:  buildJellyBody(makeCanvas, 'hot'),
        tailHot:  buildJellyTail(makeCanvas, 'hot'),
        bodyWarm: buildJellyBody(makeCanvas, 'warm'),
        tailWarm: buildJellyTail(makeCanvas, 'warm'),
        bodyCool: buildJellyBody(makeCanvas, 'cool'),
        tailCool: buildJellyTail(makeCanvas, 'cool'),
        hotVent:  buildHotVent(makeCanvas)
      };

      const recolorAssets = [
        parts.bodyHot, parts.tailHot,
        parts.bodyWarm, parts.tailWarm,
        parts.bodyCool, parts.tailCool
      ];

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;
      const seed = opts.seed ?? 83;

      // 领航中心（在热泉内圈、中圈、外圈周期往返螺旋迁徙）
      const leader = {
        x: hx0 + 10,
        y: hy0,
        yaw: hyaw0,
        ang: 0.2,
        radialPhase: 0.0
      };

      const members = SWARM_PROFILES.map((p) => ({
        ...p,
        x: hx0,
        y: hy0,
        z: 1.6,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        tailPhase: p.phase * 2.0,
        tailYaw: 0,
        tier: 'hot', // 'hot' | 'warm' | 'cool'
        wakeCd: p.idx * 0.08
      }));

      const state = {
        x: hx0,
        y: hy0,
        z: 1.8,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        migrateClock: 0,
        ventSteamCd: 0.4
      };

      const sockets = new SocketTracker();
      const footContacts = Array.from({ length: SWARM_PROFILES.length + 1 }, () => ({ x: hx0, y: hy0, z: 0, r: 5.0 }));
      let curSkin = SKINS[0];

      function clampSafe(x, y, cx, cy, limitR) {
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (d > limitR && d > 0.001) {
          return [cx + (dx / d) * limitR, cy + (dy / d) * limitR];
        }
        return [x, y];
      }

      // 带滞回的半径分档判定（避免临界半径抖动）
      function resolveTempTier(curTier, dist, r1, r2) {
        const hyst = 1.4;
        if (curTier === 'hot') {
          if (dist > r2 + hyst) return 'cool';
          if (dist > r1 + hyst) return 'warm';
          return 'hot';
        }
        if (curTier === 'warm') {
          if (dist < r1 - hyst) return 'hot';
          if (dist > r2 + hyst) return 'cool';
          return 'warm';
        }
        // curTier === 'cool'
        if (dist < r1 - hyst) return 'hot';
        if (dist < r2 - hyst) return 'warm';
        return 'cool';
      }

      const instance = {
        def: Marsh5Def,
        cachePrefix: `marsh5_thermal_swarm_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of recolorAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 1.8;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.migrateClock = 0;
          state.ventSteamCd = 0.4;

          leader.ang = 0.2;
          leader.radialPhase = 0.0;
          leader.x = homeX + 12;
          leader.y = homeY;
          leader.yaw = homeYaw;

          for (let i = 0; i < members.length; i++) {
            const mb = members[i];
            const [mx, my] = localToWorldXY(leader.x, leader.y, leader.yaw, mb.slotX * 0.7, mb.slotY * 0.7);
            mb.x = mx;
            mb.y = my;
            mb.z = 1.6;
            mb.vx = 0;
            mb.vy = 0;
            mb.yaw = leader.yaw;
            mb.tier = i < 2 ? 'hot' : (i < 5 ? 'warm' : 'cool');
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const action = eco && eco.action ? eco.action : (eco && eco.patrol === false ? 'idle' : 'patrol');
          const isIdle = action === 'idle';
          const isMigrate = action === 'migrate';
          const isWater = !!(habitat && habitat.isWater);
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const rawMaxR = (eco && eco.maxRadius) || 48;
          const safeR = rawMaxR * 0.78;
          const fx = curSkin.fx || SKINS[0].fx;

          // 温度台阶半径阈值（内圈暖橙红 / 中圈明金黄 / 外圈翠碧绿）
          const tierR1 = rawMaxR * 0.34;
          const tierR2 = rawMaxR * 0.56;

          // 中央泉眼偶发微弱热气小泡
          state.ventSteamCd -= dt;
          if (vfx && state.ventSteamCd <= 0) {
            state.ventSteamCd = 0.65;
            vfx.spawnParticle(
              homeX + (Math.random() - 0.5) * 4 * sMul,
              homeY + (Math.random() - 0.5) * 4 * sMul,
              3.5 * sMul,
              (Math.random() - 0.5) * 2.5, (Math.random() - 0.5) * 2.5, 6.5 * sMul,
              0.75, 1.15, fx.hot, false, -2
            );
          }

          // 1. 领航点轨迹：在热泉内圈与外圈往返顺滑螺旋往返迁徙
          if (isMigrate) {
            state.migrateClock += dt;
            const u = clamp(state.migrateClock / 5.0, 0, 1);
            // 完整一次内圈(橙红) -> 中圈(金黄) -> 外圈(翠绿) -> 折返
            const radNorm = Math.sin(u * Math.PI);
            const curR = lerp(rawMaxR * 0.22, rawMaxR * 0.72, radNorm);
            leader.ang = wrapAngle(leader.ang + dt * 0.85 * spdMul);
            const tx = homeX + Math.cos(leader.ang) * curR;
            const ty = homeY + Math.sin(leader.ang) * curR;
            const dx = tx - leader.x, dy = ty - leader.y;
            if (Math.hypot(dx, dy) > 0.2) {
              leader.yaw = wrapAngle(leader.yaw + wrapAngle(Math.atan2(-dx, dy) - leader.yaw) * expSmooth(dt, 5.5));
            }
            const kL = expSmooth(dt, 4.8);
            leader.x = lerp(leader.x, tx, kL);
            leader.y = lerp(leader.y, ty, kL);
          } else {
            state.migrateClock = 0;
            if (!isIdle) {
              // 自由巡游：领航半径在 0.20*maxR ~ 0.70*maxR 范围缓慢波浪迁移，持续展示橙->黄->绿变色
              leader.ang = wrapAngle(leader.ang + dt * 0.48 * spdMul);
              leader.radialPhase = (leader.radialPhase + dt * 0.42 * spdMul) % TAU;
              const radWave = 0.5 - 0.5 * Math.cos(leader.radialPhase);
              const curR = lerp(rawMaxR * 0.20, rawMaxR * 0.70, radWave);
              const tx = homeX + Math.cos(leader.ang) * curR;
              const ty = homeY + Math.sin(leader.ang) * curR;
              const dx = tx - leader.x, dy = ty - leader.y;
              if (Math.hypot(dx, dy) > 0.2) {
                leader.yaw = wrapAngle(leader.yaw + wrapAngle(Math.atan2(-dx, dy) - leader.yaw) * expSmooth(dt, 4.8));
              }
              const kL = expSmooth(dt, 3.8);
              leader.x = lerp(leader.x, tx, kL);
              leader.y = lerp(leader.y, ty, kL);
            } else {
              // 待机：沿中温台阶缓缓绕圈微摆，跨过温界时局部几只变色
              leader.ang = wrapAngle(leader.ang + dt * 0.34 * spdMul);
              const curR = lerp(tierR1 * 0.85, tierR2 * 1.15, 0.5 + 0.5 * Math.sin(time * 0.55));
              const tx = homeX + Math.cos(leader.ang) * curR;
              const ty = homeY + Math.sin(leader.ang) * curR;
              const dx = tx - leader.x, dy = ty - leader.y;
              if (Math.hypot(dx, dy) > 0.2) {
                leader.yaw = wrapAngle(leader.yaw + wrapAngle(Math.atan2(-dx, dy) - leader.yaw) * expSmooth(dt, 4.0));
              }
              const kL = expSmooth(dt, 3.2);
              leader.x = lerp(leader.x, tx, kL);
              leader.y = lerp(leader.y, ty, kL);
            }
          }

          // 2. 更新 7 只圆胖果冻小水兽（柔性纵队跟随 + 分离 + 半径分档瞬切预烘温色）
          let sumX = 0, sumY = 0, sumZ = 0;
          for (let i = 0; i < members.length; i++) {
            const mb = members[i];
            const nX = (fbm1(time * 0.55 + mb.phase, seed + mb.seedOff) - 0.5) * 4.5;
            const nY = (fbm1(time * 0.50 + mb.phase, seed + mb.seedOff + 19) - 0.5) * 4.5;
            const slotScale = isIdle ? 0.82 : 1.0;

            const [sx, sy] = localToWorldXY(
              leader.x, leader.y, leader.yaw,
              (mb.slotX * slotScale + nX) * sMul,
              (mb.slotY * slotScale + nY) * sMul
            );

            // 成员间分离 + 避让中央泉眼矿石
            let sepX = 0, sepY = 0;
            for (let j = 0; j < members.length; j++) {
              if (i === j) continue;
              const o = members[j];
              const dx = mb.x - o.x, dy = mb.y - o.y;
              const d = Math.hypot(dx, dy) || 0.001;
              const minD = 9.5 * sMul;
              if (d < minD) {
                const push = (minD - d) * 1.5;
                sepX += (dx / d) * push;
                sepY += (dy / d) * push;
              }
            }
            const vdx = mb.x - homeX, vdy = mb.y - homeY;
            const vDist = Math.hypot(vdx, vdy) || 0.001;
            const minVent = 7.8 * sMul;
            if (vDist < minVent) {
              const push = (minVent - vDist) * 1.8;
              sepX += (vdx / vDist) * push;
              sepY += (vdy / vDist) * push;
            }

            // 脉冲摆尾游泳节律
            mb.tailPhase = (mb.tailPhase + dt * mb.tailFreq * gFreq) % TAU;
            const tWave = Math.sin(mb.tailPhase);
            const burst = 0.88 + Math.pow(Math.abs(tWave), 1.6) * 0.26;

            const [cx, cy] = clampSafe(sx + sepX, sy + sepY, homeX, homeY, safeR);
            const gain = 2.8 * mb.speedMul * burst * (0.75 + spdMul * 0.3);
            const kV = expSmooth(dt, 4.4);
            mb.vx = lerp(mb.vx, (cx - mb.x) * gain, kV);
            mb.vy = lerp(mb.vy, (cy - mb.y) * gain, kV);
            mb.x += mb.vx * dt;
            mb.y += mb.vy * dt;

            // 严格钳制在 maxRadius * 0.80 内
            const [fxPos, fyPos] = clampSafe(mb.x, mb.y, homeX, homeY, rawMaxR * 0.80);
            mb.x = fxPos;
            mb.y = fyPos;

            mb.z = (1.65 + Math.sin(time * 2.8 + mb.phase) * 0.45) * sMul;

            const spd = Math.hypot(mb.vx, mb.vy);
            const velYaw = spd > 1.8 ? Math.atan2(-mb.vx, mb.vy) : leader.yaw;
            mb.yaw = wrapAngle(mb.yaw + wrapAngle(velYaw - mb.yaw) * expSmooth(dt, 5.5));
            mb.tailYaw = tWave * 0.46 * flex;

            // 按当前所处半径分档切换预烘温度色资产（零重刷！）
            const distFromVent = Math.hypot(mb.x - homeX, mb.y - homeY);
            const nextTier = resolveTempTier(mb.tier, distFromVent, tierR1, tierR2);
            if (nextTier !== mb.tier) {
              mb.tier = nextTier;
              if (vfx) {
                const col = fx[nextTier] || fx.warm;
                vfx.addRipple(mb.x, mb.y, 1.8 * sMul, 9.5 * sMul, 0.55, 1.3);
                for (let k = 0; k < 4; k++) {
                  const a = (k / 4) * TAU + mb.phase;
                  vfx.spawnParticle(
                    mb.x, mb.y, mb.z + 3.2 * sMul,
                    Math.cos(a) * 6.5 * sMul, Math.sin(a) * 6.5 * sMul, (6 + k * 1.5) * sMul,
                    0.46, 1.25, col, false, 8
                  );
                }
              }
            }

            // 游泳微尾迹
            mb.wakeCd -= dt;
            if (vfx && isWater && spd > 4.5 && mb.wakeCd <= 0) {
              mb.wakeCd = 0.28 + (i % 3) * 0.04;
              EnvFeedback.emitWaterWake(vfx, habitat, mb.x, mb.y, mb.yaw, 3.8 * sMul, 0.42);
            }

            footContacts[i].x = mb.x;
            footContacts[i].y = mb.y;
            footContacts[i].z = mb.z;
            footContacts[i].r = 5.0 * sMul;

            sumX += mb.x;
            sumY += mb.y;
            sumZ += mb.z;
          }

          footContacts[SWARM_PROFILES.length].x = homeX;
          footContacts[SWARM_PROFILES.length].y = homeY;
          footContacts[SWARM_PROFILES.length].z = 0.4;
          footContacts[SWARM_PROFILES.length].r = 5.4 * sMul;

          state.x = sumX / members.length;
          state.y = sumY / members.length;
          state.z = sumZ / members.length;
          state.yaw = members[0].yaw;
          sockets.setWorld('leadJelly', members[0].x, members[0].y, members[0].z + 4 * sMul, members[0].yaw);
          sockets.setWorld('hotVent', homeX, homeY, 3.5 * sMul, 0);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? habitat.waterLevel : 2.6;

          // 1. 中央热泉眼矿石小堆
          list.push({
            partKey: 'hotVent',
            asset: parts.hotVent,
            x: (state.x * 0) + footContacts[SWARM_PROFILES.length].x,
            y: (state.y * 0) + footContacts[SWARM_PROFILES.length].y,
            lift: 0.5 * sMul,
            ro: 0.2,
            bias: -0.25,
            submerge: isWater ? 0.18 : 0
          });

          // 2. 7 只圆胖果冻小水兽（直接切换预烘的 hot / warm / cool 资产）
          for (let i = 0; i < members.length; i++) {
            const mb = members[i];
            const yw = mb.yaw;
            const sub = isWater
              ? clamp(EnvFeedback.calcSubmerge(mb.z, waterLvl + 0.8 * sMul, 4.2 * sMul, true), 0, 0.35)
              : 0;
            const bodyKey = mb.tier === 'hot' ? 'bodyHot' : (mb.tier === 'warm' ? 'bodyWarm' : 'bodyCool');
            const tailKey = mb.tier === 'hot' ? 'tailHot' : (mb.tier === 'warm' ? 'tailWarm' : 'tailCool');

            // A) 独立摆动圆尾鳍
            const tYaw = wrapAngle(yw + mb.tailYaw);
            const [tjx, tjy] = localToWorldXY(mb.x, mb.y, yw, 0, TAIL_PIVOT.attachY * sMul);
            const [tx, ty] = pivotToWorldXY(tjx, tjy, tYaw, TAIL_PIVOT.x * sMul, TAIL_PIVOT.y * sMul);
            list.push({
              partKey: tailKey,
              asset: parts[tailKey],
              x: tx,
              y: ty,
              lift: Math.max(0.4, mb.z + 0.5 * sMul),
              ro: tYaw,
              bias: -0.05,
              submerge: sub
            });

            // B) 圆胖果冻主体
            list.push({
              partKey: bodyKey,
              asset: parts[bodyKey],
              x: mb.x,
              y: mb.y,
              lift: Math.max(0.4, mb.z),
              ro: yw,
              bias: 0.14,
              submerge: sub
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Marsh5Def.id,
            code: Marsh5Def.code,
            status: Marsh5Def.status,
            name: Marsh5Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            flockCount: members.length,
            tiers: members.map(m => m.tier),
            footRadius: 5.4,
            headZ: 9,
            centerZ: 5,
            blocks: Marsh5Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Marsh5Def);
})(window.PixelWorkshop);
