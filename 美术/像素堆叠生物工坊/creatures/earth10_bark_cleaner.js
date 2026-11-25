'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SocketTracker } = PW.Solvers;
  const { EnvFeedback, MountSystem, notifyHostDisturb } = PW.Behaviors;

  // =========================================================================
  // 地10 · 给大家伙啃死皮的（M36 寄生挂点 + M13 共享贴图群落，+Y 正前，z=0 贴地）
  //   1. 俯视 ×4 清晰度强化：5 只共享贴图的扁树皮片小兽，暖琥珀橙与浅米白皮纹
  //      搭配深褐背脊棱与亮象牙色横扁小刮刀嘴，在红毛 地1 或灰甲 沙4 背上一眼醒目；
  //   2. 仅建 3 个共享体素部件（cleanerWalk / cleanerScrape / 独台倒木 fallenLog），
  //      5 只完全共享贴图，靠两档姿态切换做出刮刀来回推刮节奏，严禁常态 scaleX/scaleY 拉伸；
  //   3. 双态运行：
  //      - 多怪同台：自动调用 MountSystem 搜寻大型宿主（优先 地1、沙4、沙2），
  //        设正 state.sortBias 稳压宿主背顶，5 只排成一排来回刮死皮并飘出细皮屑粒子；
  //        宿主一停下或刮满一轮，5 只按序排队下地换下一只宿主；
  //      - 独台预览：自带林地倒木/背甲载体演示 5 只排成一排爬行刮啃、排队下地绕圈再登木；
  //   4. 27 色 0 重色 0 自亮、3 套皮肤、坐标严格钳制在 maxRadius * 0.80 内。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 小兽暖琥珀橙主皮（3 档）
      barkDark:   '#a34b14',
      barkMid:    '#e07a24',
      barkHi:     '#ffad42',
      // 浅米白树皮斑纹（3 档，提亮背片轮廓）
      creamDark:  '#b5a689',
      creamMid:   '#e6dac1',
      creamHi:    '#fff8e6',
      // 深褐背脊棱纹（3 档，与亮橙/米白强对比）
      ridgeDark:  '#2e1b10',
      ridgeMid:   '#54331f',
      ridgeHi:    '#7d5033',
      // 亮色横扁小刮刀嘴（3 档，俯视一眼辨认）
      bladeDark:  '#b3912b',
      bladeMid:   '#ebd052',
      bladeHi:    '#fff6a6',
      // 腹底吸盘短足（3 档）
      padDark:    '#8c5347',
      padMid:     '#c78070',
      padHi:      '#f0b2a1',
      // 醒目小圆眼（不进 glowKeys）
      eyeDark:    '#140e0a',
      eyeIris:    '#38281c',
      eyeGlint:   '#f7f3eb',
      // 独台倒木暗褐树皮（3 档，低明度衬托 5 只小兽）
      logDark:    '#291f18',
      logMid:     '#473528',
      logHi:      '#69503d',
      // 倒木顶面待刮死皮斑（3 档）
      scurfDark:  '#665b4c',
      scurfMid:   '#948671',
      scurfHi:    '#bfb199',
      // 倒木边沿林地青苔（3 档）
      mossDark:   '#1e3d21',
      mossMid:    '#366637',
      mossHi:     '#5c9452'
    },
    glowKeys: [],
    parts: [
      'bark', 'cream', 'ridge', 'blade', 'pad', 'eye', 'log', 'scurf', 'moss'
    ],
    noCrease: [
      ['bark', 'cream'], ['bark', 'ridge'], ['cream', 'ridge'],
      ['bark', 'blade'], ['bark', 'pad'], ['bark', 'eye'],
      ['log', 'scurf'], ['log', 'moss']
    ],
    materials: {
      bark:  ['barkDark',  'barkMid',  'barkHi'],
      cream: ['creamDark', 'creamMid', 'creamHi'],
      ridge: ['ridgeDark', 'ridgeMid', 'ridgeHi'],
      blade: ['bladeDark', 'bladeMid', 'bladeHi'],
      pad:   ['padDark',   'padMid',   'padHi'],
      log:   ['logDark',   'logMid',   'logHi'],
      scurf: ['scurfDark', 'scurfMid', 'scurfHi'],
      moss:  ['mossDark',  'mossMid',  'mossHi']
    },
    protectedParts: ['blade', 'eye']
  });

  // 3 套零重建模换色皮肤（均保 0 重色）
  const SKINS = [
    {
      id: 'amber_bark',
      name: '琥珀树皮（林地经典）',
      dot: '#e07a24',
      outline: '#1a0f08',
      pal: {},
      fx: { flakeA: '#fff8e6', flakeB: '#e6dac1', dust: '#8a6b4f' }
    },
    {
      id: 'ochre_sand',
      name: '沙黄干片（戈壁款）',
      dot: '#e3b23c',
      outline: '#1c1509',
      pal: {
        barkDark:  '#9e7319', barkMid:  '#deac33', barkHi:  '#ffdc70',
        creamDark: '#b8ac98', creamMid: '#ebe1ce', creamHi: '#fff9ed',
        ridgeDark: '#3d2a17', ridgeMid: '#6b4a29', ridgeHi: '#966c40',
        bladeDark: '#a83c24', bladeMid: '#e66440', bladeHi: '#ffa680',
        padDark:   '#785947', padMid:   '#ad866e', padHi:   '#deb79e'
      },
      fx: { flakeA: '#fff9ed', flakeB: '#ffdc70', dust: '#a68c65' }
    },
    {
      id: 'lichen_jade',
      name: '青苔皮片（苔原款）',
      dot: '#82c44b',
      outline: '#0d1a0e',
      pal: {
        barkDark:  '#427a24', barkMid:  '#78bd3e', barkHi:  '#b2eb73',
        creamDark: '#9cb096', creamMid: '#d5e6cc', creamHi: '#f4ffed',
        ridgeDark: '#1b361e', ridgeMid: '#315c34', ridgeHi: '#4e8550',
        bladeDark: '#b88318', bladeMid: '#f2bd38', bladeHi: '#ffea80',
        padDark:   '#6b6149', padMid:   '#a19473', padHi:   '#d4c7a3'
      },
      fx: { flakeA: '#f4ffed', flakeB: '#d5e6cc', dust: '#69785c' }
    }
  ];

  // =========================================================================
  // 1. 扁树皮片小兽两档共享资产：舒展爬行态（cleanerWalk）与前俯刮皮态（cleanerScrape）
  // =========================================================================
  function buildBarkCleaner(makeCanvas, scraping) {
    const W = 12, D = scraping ? 15 : 14, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 扁平宽阔的干树皮片背甲（边缘略锯齿，俯视轮廓利落醒目）
    m.fillAABB(-5.5, 5.5, -6.0, 5.5, 1, 5, (x, y, z, X, Y) => {
      const yShift = scraping ? -0.4 : 0.0;
      const ly = Y - yShift;
      const arch = scraping ? 0.45 : 0.0;
      const rx = lerp(4.7, 3.3, clamp((z - 1) / 4, 0, 1)) + Math.sin(ly * 1.1) * 0.25;
      const ry = lerp(5.2, 4.0, clamp((z - 1) / 4, 0, 1));
      const rz = 2.6 + arch;
      const d = Math.hypot(X / rx, ly / ry, (z - 2.3) / rz);
      if (d > 1.0) return;

      // 背脊深褐棱纹 + 浅米白树皮条斑 + 暖琥珀橙主底
      const onCenterRidge = Math.abs(X) <= 1.05 && z >= 3;
      const onSideBand = Math.abs(Math.abs(X) - 2.6) <= 0.85 && z >= 2 && Math.abs(ly) < 3.6;
      const onCreamStripe = (Math.abs(ly - 1.6) <= 1.05 || Math.abs(ly + 2.1) <= 1.0) && Math.abs(X) > 1.0 && z >= 2;
      if (onCenterRidge || onSideBand) {
        m.setRaw(x, y, z, mat('ridge'), partId.ridge);
      } else if (onCreamStripe) {
        m.setRaw(x, y, z, mat('cream'), partId.cream);
      } else {
        m.setRaw(x, y, z, mat('bark'), partId.bark);
      }
    });

    // 前端亮色横扁小刮刀嘴（刮皮态向前伸长 1.5 格并略贴低，俯视 ×4 一眼识别）
    const bladeY0 = scraping ? 4.2 : 3.6;
    const bladeY1 = scraping ? 6.8 : 5.4;
    const bladeZ  = scraping ? 1.5 : 2.1;
    m.paintCapsule(-2.4, bladeY0, bladeZ + 0.3, -2.6, bladeY1, bladeZ, 0.95, 0.72, mat('blade'), partId.blade, true);
    m.paintCapsule( 2.4, bladeY0, bladeZ + 0.3,  2.6, bladeY1, bladeZ, 0.95, 0.72, mat('blade'), partId.blade, true);
    m.paintCapsule(-2.5, bladeY1 - 0.3, bladeZ, 2.5, bladeY1 - 0.3, bladeZ, 0.95, 0.95, mat('blade'), partId.blade, true);
    m.paintEllipsoid(0, bladeY0 + 0.4, bladeZ + 0.5, 2.2, 1.3, 0.9, mat('blade'), partId.blade, true);

    // 底部 4 只外露浅肉粉小吸盘足（抓牢宿主背皮）
    const legShift = scraping ? -0.5 : 0.4;
    const feet = [
      [-3.8,  2.2 + legShift], [ 3.8,  2.2 + legShift],
      [-3.7, -2.5 - legShift * 0.5], [ 3.7, -2.5 - legShift * 0.5]
    ];
    for (const [fx, fy] of feet) {
      m.paintEllipsoid(fx, fy, 0.9, 1.25, 1.25, 0.85, mat('pad'), partId.pad, true);
    }

    // 尾端小树皮翘片
    m.paintEllipsoid(0, -5.2, 2.3, 2.0, 1.2, 0.9, mat('cream'), partId.cream, true);

    m.despeckle();
    m.applyArtShading(true);

    // 头前一对清晰小圆眼（落在背甲前缘上方，俯视可见）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + (scraping ? 2.6 : 2.4));
    const eyeZ = scraping ? 4 : 4;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 2.1);
      m.setRaw(ex, eyeY, eyeZ, keyToId.eyeDark, partId.eye);
      if (eyeY + 1 < D) m.setRaw(ex, eyeY + 1, eyeZ, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 4.4, headZ: H - 1, centerZ: 3 });
  }

  // =========================================================================
  // 2. 独台预览载体：林地倒木 / 宽背甲（28×16×12，仅在无其他宿主时出现）
  // =========================================================================
  function buildFallenLog(makeCanvas) {
    const m = new VoxelModel(28, 16, 12, SPEC);
    const { mat, partId } = SPEC;

    // 粗壮横倒老木主体（沿 X 轴排开，宽阔顶面供 5 只小兽排成一排刮啃）
    m.fillAABB(-13.2, 13.2, -7.2, 7.2, 0, 10, (x, y, z, X, Y) => {
      const taper = 1.0 - Math.abs(X) * 0.012;
      const ry = 6.2 * taper;
      const rz = 5.0 * taper;
      const ridge = Math.sin(Y * 0.95 + X * 0.25) * 0.35;
      const d = Math.hypot(Y / (ry + ridge), (z - 4.6) / rz);
      if (d <= 1.0 && z >= 0) {
        // 顶面散落浅灰褐待刮死皮斑块
        const isScurf = z >= 8 && Math.abs(Y) < 3.6 && Math.sin(X * 0.75 + Y * 0.6) > -0.05;
        m.setRaw(x, y, z, isScurf ? mat('scurf') : mat('log'), isScurf ? partId.scurf : partId.log);
      }
    });

    // 倒木底侧稳固抓地木根与断枝杈
    m.paintCapsule(-10.5,  3.5, 2.2, -12.6,  6.2, 1.0, 1.8, 1.1, mat('log'), partId.log, true);
    m.paintCapsule( 10.2, -3.4, 2.2,  12.4, -6.0, 1.0, 1.7, 1.0, mat('log'), partId.log, true);

    // 两侧边缘点缀深绿青苔垫
    const mossSpots = [
      [-8.5, -4.6, 5.2, 2.6, 1.8, 1.5],
      [ 7.8,  4.4, 5.4, 2.8, 1.8, 1.5],
      [ 0.5, -5.2, 4.6, 3.0, 1.6, 1.4],
      [-2.4,  5.0, 4.8, 2.5, 1.6, 1.4]
    ];
    for (const [mx, my, mz, rx, ry, rz] of mossSpots) {
      m.paintEllipsoid(mx, my, mz, rx, ry, rz, mat('moss'), partId.moss, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 11.5, headZ: 10, centerZ: 5 });
  }

  // =========================================================================
  // 5 只小兽队列档案
  // =========================================================================
  const CLEANER_COUNT = 5;
  const LOG_TOP_Z = 9.3;

  const Earth10Def = {
    id: 'earth10_bark_cleaner',
    code: '地10',
    name: '给大家伙啃死皮的',
    status: 'done',
    noHost: true,
    tag: 'M36 寄生挂点 · M13 共享贴图群落 · 5 只排成一排刮死皮',
    summary: '5 只暖琥珀橙/浅米白扁树皮片小兽，嘴如亮色小刮刀；多怪同台时自动调用 MountSystem 成群挂上大型宿主背顶排成一排来回刮死皮，宿主停步即排队下地换下一只；独台自带林地倒木演示排队刮啃与绕圈换位',
    defaultHabitat: 'forest',
    footRadius: 0.5,
    ecoWeight: 0.35,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      'MountSystem 优先挂上大型宿主（地1 / 沙4 / 沙2）',
      '5 只共享贴图群落 + 两档刮皮姿态零拉伸切换',
      '正 sortBias 稳压宿主背顶不埋没',
      '宿主停步触发 5 只按序排队下地换下一只宿主',
      '独台林地倒木载体演示排队爬行刮啃与皮屑粒子'
    ],
    soulHabit: '成群趴在肚嘴巨兽、弯角犀或吞铁兽背上，排成一排用亮色小刮刀嘴来回刮死皮、飘出细皮屑；大家伙一停下就按顺序排队下地，小步快跑爬向下一只大家伙',
    actions: [
      { id: 'patrol', name: '成群刮皮轮替', loop: true, status: 'done' },
      { id: 'idle',   name: '排成一排刮啃', loop: true, status: 'done' },
      { id: 'groom',  name: '排队下地换宿', loop: true, status: 'done' }
    ],
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        cleanerWalk:   buildBarkCleaner(makeCanvas, false),
        cleanerScrape: buildBarkCleaner(makeCanvas, true),
        fallenLog:     buildFallenLog(makeCanvas)
      };

      const cleanerRecolorAssets = [parts.cleanerWalk, parts.cleanerScrape];
      const riderId = `earth10_bc_${Math.random().toString(36).slice(2, 7)}`;
      const sockets = new SocketTracker();
      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;

      // 5 只独立小兽状态（共享同一套体素贴图）
      const cleaners = Array.from({ length: CLEANER_COUNT }, (_, i) => ({
        idx: i,
        x: hx0 + (i - 2) * 5.2,
        y: hy0,
        z: LOG_TOP_Z,
        yaw: hyaw0,
        phase: i * 1.15,
        scraping: false,
        flakeCd: 0.25 + i * 0.14,
        // 排队下地/登背时的局部起终点
        stepStartX: hx0,
        stepStartY: hy0,
        stepStartZ: LOG_TOP_Z,
        stepEndX: hx0,
        stepEndY: hy0,
        stepEndZ: 0
      }));

      const footContacts = Array.from({ length: CLEANER_COUNT + 1 }, () => ({
        x: hx0, y: hy0, z: 0, r: 3.2
      }));

      const state = {
        x: hx0,
        y: hy0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        shadowScale: 0,
        sortBias: 0,
        hasHostEnv: false,
        host: null,
        slot: null,
        lastHost: null,
        // 状态机：seek | approach | scrape | dismount | soloLoop
        mode: 'scrape',
        modeT: 0,
        cycleSeq: 1,
        hostStopTimer: 0,
        disturbCd: 0,
        dismountSide: 1,
        groundDestX: hx0,
        groundDestY: hy0
      };

      let curSkin = SKINS[0];

      function clampToArena(px, py, maxR) {
        const d = Math.hypot(px, py);
        if (d > maxR && d > 0.001) {
          const k = maxR / d;
          return [px * k, py * k];
        }
        return [px, py];
      }

      function releaseCurrentHost(allActors, rememberLast) {
        if (rememberLast && state.host) state.lastHost = state.host;
        if (allActors && allActors.length) {
          MountSystem.releaseMount(riderId, allActors);
        } else if (state.slot && state.slot.occupiedBy === riderId) {
          state.slot.occupiedBy = null;
        }
        state.host = null;
        state.slot = null;
        state.sortBias = 0;
      }

      function enterMode(nextMode) {
        state.mode = nextMode;
        state.modeT = 0;
        state.hostStopTimer = 0;
      }

      function emitFlake(vfx, x, y, z, yaw, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let k = 0; k < 2; k++) {
          const a = yaw + (Math.random() - 0.5) * 2.2;
          const spd = (4.5 + Math.random() * 6.5) * sMul;
          vfx.spawnParticle(
            x + (Math.random() - 0.5) * 2.0 * sMul,
            y + (Math.random() - 0.5) * 2.0 * sMul,
            z + 2.4 * sMul,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            (4.0 + Math.random() * 5.0) * sMul,
            0.48 + Math.random() * 0.28,
            1.15 + Math.random() * 0.35,
            k === 0 ? fx.flakeA : fx.flakeB,
            false,
            18
          );
        }
      }

      // 计算第 i 只小兽在宿主背上的排队位姿（沿宿主背脊排成一排，带左右错落与来回刮动）
      function getHostSlotPose(pose, i, time, gFreq, flex, sMul, hostFootR) {
        const span = clamp(hostFootR * 0.95, 10.5, 17.5);
        const u = (i / (CLEANER_COUNT - 1)) - 0.5; // -0.5 .. +0.5
        const lyBase = -u * span * sMul;
        const scrapPhase = time * 5.6 * gFreq + i * 0.95;
        const scrapeWave = Math.sin(scrapPhase);
        const sideJitter = ((i % 2 === 0 ? 1 : -1) * 1.15 + scrapeWave * 1.45 * flex) * sMul;
        const fwdPush = Math.cos(scrapPhase) * 0.85 * sMul;
        const [wx, wy] = localToWorldXY(pose.x, pose.y, pose.yaw, sideJitter, lyBase + fwdPush);
        const wz = pose.z + 1.35 * sMul + Math.abs(scrapeWave) * 0.32 * sMul;
        // 面向宿主背脊斜向刮啃
        const wyaw = wrapAngle(pose.yaw + (i % 2 === 0 ? -0.42 : 0.42) + scrapeWave * 0.24 * flex);
        return { x: wx, y: wy, z: wz, yaw: wyaw, isScraping: scrapeWave > 0.15 };
      }

      // 计算第 i 只小兽在独台倒木顶面的排队位姿
      function getLogSlotPose(homeX, homeY, homeYaw, i, time, gFreq, flex, sMul) {
        const lxBase = (i - 2) * 4.9 * sMul;
        const scrapPhase = time * 5.4 * gFreq + i * 0.92;
        const scrapeWave = Math.sin(scrapPhase);
        const lyOff = ((i % 2 === 0 ? -1.1 : 1.1) + scrapeWave * 1.4 * flex) * sMul;
        const [wx, wy] = localToWorldXY(homeX, homeY, homeYaw, lxBase + Math.cos(scrapPhase) * 0.55 * sMul, lyOff);
        const wz = (LOG_TOP_Z + Math.abs(scrapeWave) * 0.30) * sMul;
        const wyaw = wrapAngle(homeYaw + (i % 2 === 0 ? 0.15 : Math.PI - 0.15) + scrapeWave * 0.25 * flex);
        return { x: wx, y: wy, z: wz, yaw: wyaw, isScraping: scrapeWave > 0.15 };
      }

      const instance = {
        def: Earth10Def,
        cachePrefix: riderId,
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
          for (const a of cleanerRecolorAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          releaseCurrentHost(null, false);
          state.x = homeX;
          state.y = homeY;
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.shadowScale = 0;
          state.sortBias = 0;
          state.hasHostEnv = false;
          state.lastHost = null;
          state.mode = 'scrape';
          state.modeT = 0;
          state.cycleSeq = 1;
          state.hostStopTimer = 0;
          state.disturbCd = 0;
          state.dismountSide = 1;
          state.groundDestX = homeX;
          state.groundDestY = homeY;

          for (let i = 0; i < CLEANER_COUNT; i++) {
            const c = cleaners[i];
            const [cx, cy] = localToWorldXY(homeX, homeY, homeYaw, (i - 2) * 4.9, 0);
            c.x = cx;
            c.y = cy;
            c.z = LOG_TOP_Z;
            c.yaw = homeYaw;
            c.scraping = false;
            c.flakeCd = 0.22 + i * 0.12;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const speedMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const action = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const allActors = (eco && Array.isArray(eco.allActors)) ? eco.allActors : [];
          const selfRef = (eco && eco.self) || instance;
          const maxR = ((eco && eco.maxRadius) || 48) * 0.80;

          // 探测同台是否存在大型宿主（优先 地1 / 沙4 / 沙2）
          let hostAvailable = false;
          if (state.host && allActors.includes(state.host)) {
            hostAvailable = true;
          } else {
            const probe = MountSystem.findMountHost(selfRef, allActors, {
              riderId,
              preferredCodes: ['地1', '沙4', '沙2'],
              minFootRadius: 7
            });
            hostAvailable = !!probe;
          }

          if (state.host && !allActors.includes(state.host)) {
            releaseCurrentHost(allActors, false);
            if (hostAvailable) enterMode('seek');
          }

          if (hostAvailable && !state.hasHostEnv) {
            state.hasHostEnv = true;
            state.lastHost = null;
            enterMode('seek');
          } else if (!hostAvailable && state.hasHostEnv) {
            releaseCurrentHost(allActors, false);
            state.hasHostEnv = false;
            enterMode('scrape');
          }

          state.modeT += dt * speedMul;
          state.disturbCd -= dt;

          // =================================================================
          // 分支 A：多怪同台模式（MountSystem 挂载大型宿主 + 宿主停步排队下地换宿）
          // =================================================================
          if (state.hasHostEnv) {
            const isGroomDemo = action === 'groom';
            const minScrapeDur = isGroomDemo ? 2.4 : 4.2;
            const maxScrapeDur = isGroomDemo ? 3.8 : 8.5;

            if (state.mode === 'seek') {
              state.sortBias = 0;
              state.z = lerp(state.z, 0, expSmooth(dt, 10));
              let found = MountSystem.findMountHost(selfRef, allActors, {
                riderId,
                preferredCodes: ['地1', '沙4', '沙2'],
                excludeHost: state.lastHost,
                minFootRadius: 7
              });
              if (!found && state.modeT >= 0.55) {
                found = MountSystem.findMountHost(selfRef, allActors, {
                  riderId,
                  preferredCodes: ['地1', '沙4', '沙2'],
                  excludeHost: null,
                  minFootRadius: 7
                });
              }
              if (found && MountSystem.claimMount(riderId, found.host, found.slot)) {
                state.host = found.host;
                state.slot = found.slot;
                state.cycleSeq++;
                enterMode('approach');
                for (let i = 0; i < CLEANER_COUNT; i++) {
                  cleaners[i].stepStartX = cleaners[i].x;
                  cleaners[i].stepStartY = cleaners[i].y;
                  cleaners[i].stepStartZ = cleaners[i].z;
                }
              } else {
                // 地面短暂停留整理队列
                for (let i = 0; i < CLEANER_COUNT; i++) {
                  const c = cleaners[i];
                  c.z = lerp(c.z, 0.2, expSmooth(dt, 10));
                  c.scraping = false;
                  const [cx, cy] = clampToArena(c.x, c.y, maxR);
                  c.x = cx; c.y = cy;
                }
              }
            } else if (state.mode === 'approach') {
              const offsetLocal = (state.slot && state.slot.auto) ? { lx: 0, ly: 0, lz: 1.4 } : null;
              const pose = MountSystem.getMountWorldPose(state.host, state.slot, offsetLocal);
              if (!pose || !pose.alive) {
                releaseCurrentHost(allActors, false);
                enterMode('seek');
              } else {
                const hostFootR = (state.host.def.footRadius || 12) * (state.host.scaleMul || 1);
                state.sortBias = Math.max(hostFootR * 1.25, 18);
                let allArrived = true;
                for (let i = 0; i < CLEANER_COUNT; i++) {
                  const c = cleaners[i];
                  const tgt = getHostSlotPose(pose, i, time, gFreq, flex, sMul, hostFootR);
                  const delay = i * 0.16;
                  const localT = Math.max(0, state.modeT - delay);
                  const dur = 0.85;
                  const u = clamp(localT / dur, 0, 1);
                  const s = u * u * (3 - 2 * u);
                  const nx = lerp(c.stepStartX, tgt.x, s);
                  const ny = lerp(c.stepStartY, tgt.y, s);
                  const nz = lerp(c.stepStartZ, tgt.z, s) + Math.sin(u * Math.PI) * 5.2 * sMul;
                  const dx = tgt.x - c.x, dy = tgt.y - c.y;
                  if (Math.hypot(dx, dy) > 0.3) {
                    c.yaw = wrapAngle(Math.atan2(-dx, dy));
                  }
                  const [clx, cly] = clampToArena(nx, ny, maxR);
                  c.x = clx;
                  c.y = cly;
                  c.z = Math.max(0, nz);
                  c.scraping = false;
                  if (u < 1) allArrived = false;
                }
                const [sx, sy] = clampToArena(pose.x, pose.y, maxR);
                state.x = sx;
                state.y = sy;
                state.z = pose.z;
                state.yaw = pose.yaw;
                if (allArrived) {
                  notifyHostDisturb(state.host, riderId, 0.55);
                  enterMode('scrape');
                }
              }
            } else if (state.mode === 'scrape') {
              const offsetLocal = (state.slot && state.slot.auto) ? { lx: 0, ly: 0, lz: 1.4 } : null;
              const pose = MountSystem.getMountWorldPose(state.host, state.slot, offsetLocal);
              if (!pose || !pose.alive) {
                releaseCurrentHost(allActors, true);
                enterMode('seek');
              } else {
                const hostFootR = (state.host.def.footRadius || 12) * (state.host.scaleMul || 1);
                state.sortBias = Math.max(hostFootR * 1.25, 18);
                const [sx, sy] = clampToArena(pose.x, pose.y, maxR);
                state.x = sx;
                state.y = sy;
                state.z = pose.z;
                state.yaw = pose.yaw;
                state.vx = state.host.state.vx || 0;
                state.vy = state.host.state.vy || 0;

                for (let i = 0; i < CLEANER_COUNT; i++) {
                  const c = cleaners[i];
                  const tgt = getHostSlotPose(pose, i, time, gFreq, flex, sMul, hostFootR);
                  const [cx, cy] = clampToArena(tgt.x, tgt.y, maxR);
                  c.x = cx;
                  c.y = cy;
                  c.z = tgt.z;
                  c.yaw = tgt.yaw;
                  c.scraping = tgt.isScraping;
                  c.flakeCd -= dt * gFreq;
                  if (c.flakeCd <= 0) {
                    c.flakeCd = 0.36 + hash2i(state.cycleSeq + i, Math.floor(time * 2), 91) * 0.32;
                    emitFlake(vfx, c.x, c.y, c.z, c.yaw, sMul);
                  }
                }

                if (state.disturbCd <= 0) {
                  state.disturbCd = 2.2;
                  notifyHostDisturb(state.host, riderId, 0.45);
                }

                // 检测宿主停步，触发 5 只排队下地换下一只宿主
                const hostSpd = Math.hypot(state.vx, state.vy);
                if (hostSpd < 2.6) state.hostStopTimer += dt;
                else state.hostStopTimer = Math.max(0, state.hostStopTimer - dt * 2);

                const shouldDismount = action !== 'idle' && (
                  (state.modeT >= minScrapeDur && state.hostStopTimer >= 0.45) ||
                  state.modeT >= maxScrapeDur
                );

                if (shouldDismount) {
                  state.dismountSide = (state.cycleSeq & 1) ? 1 : -1;
                  const sideAng = pose.yaw + state.dismountSide * (Math.PI * 0.5);
                  const dropDist = Math.max(hostFootR + 6.5, 15.0) * sMul;
                  for (let i = 0; i < CLEANER_COUNT; i++) {
                    const c = cleaners[i];
                    c.stepStartX = c.x;
                    c.stepStartY = c.y;
                    c.stepStartZ = c.z;
                    const lineOff = (i - 2) * 5.0 * sMul;
                    const [gx, gy] = clampToArena(
                      pose.x + Math.cos(sideAng) * dropDist - Math.sin(pose.yaw) * lineOff,
                      pose.y + Math.sin(sideAng) * dropDist + Math.cos(pose.yaw) * lineOff,
                      maxR
                    );
                    c.stepEndX = gx;
                    c.stepEndY = gy;
                    c.stepEndZ = 0.2;
                  }
                  releaseCurrentHost(allActors, true);
                  enterMode('dismount');
                }
              }
            } else if (state.mode === 'dismount') {
              // 5 只按顺序依次排队下地，落地后成纵队小步挪动准备换下一只宿主
              state.sortBias = 0;
              let sumX = 0, sumY = 0;
              const totalDur = 0.72 + (CLEANER_COUNT - 1) * 0.22 + 0.55;
              for (let i = 0; i < CLEANER_COUNT; i++) {
                const c = cleaners[i];
                const delay = i * 0.22;
                const localT = Math.max(0, state.modeT - delay);
                const fallDur = 0.65;
                const u = clamp(localT / fallDur, 0, 1);
                const s = u * u * (3 - 2 * u);
                const nx = lerp(c.stepStartX, c.stepEndX, s);
                const ny = lerp(c.stepStartY, c.stepEndY, s);
                const nz = lerp(c.stepStartZ, 0.2, u * u) + Math.sin(u * Math.PI) * 3.8 * sMul;
                const dx = c.stepEndX - c.stepStartX, dy = c.stepEndY - c.stepStartY;
                if (Math.hypot(dx, dy) > 0.2) {
                  c.yaw = wrapAngle(Math.atan2(-dx, dy) + Math.sin(time * 10 + i) * 0.14);
                }
                const [clx, cly] = clampToArena(nx, ny, maxR);
                c.x = clx;
                c.y = cly;
                c.z = Math.max(0, nz);
                c.scraping = false;
                sumX += c.x;
                sumY += c.y;
              }
              state.x = sumX / CLEANER_COUNT;
              state.y = sumY / CLEANER_COUNT;
              state.z = 0.5;
              if (state.modeT >= totalDur) {
                enterMode('seek');
              }
            } else {
              enterMode('seek');
            }
          } else {
            // ===============================================================
            // 分支 B：独台预览模式（自带林地倒木载体，演示排成一排刮啃 & 排队下地绕圈换位）
            // ===============================================================
            const homeX = (eco && eco.homeX !== undefined) ? eco.homeX : hx0;
            const homeY = (eco && eco.homeY !== undefined) ? eco.homeY : hy0;
            const homeYaw = (eco && eco.homeYaw !== undefined) ? eco.homeYaw : hyaw0;
            const [clHomeX, clHomeY] = clampToArena(homeX, homeY, maxR);
            state.x = clHomeX;
            state.y = clHomeY;
            state.z = 0;
            state.vx = 0;
            state.vy = 0;
            state.yaw = homeYaw;
            state.sortBias = 0;

            const isGroomDemo = action === 'groom';
            const scrapeDur = isGroomDemo ? 2.6 : 5.2;
            const paradeDur = isGroomDemo ? 3.4 : 4.2;

            if (action === 'idle') {
              state.mode = 'scrape';
              state.modeT = 0;
            }

            if (state.mode !== 'scrape' && state.mode !== 'soloLoop') {
              enterMode('scrape');
            }

            if (state.mode === 'scrape') {
              for (let i = 0; i < CLEANER_COUNT; i++) {
                const c = cleaners[i];
                const tgt = getLogSlotPose(clHomeX, clHomeY, homeYaw, i, time, gFreq, flex, sMul);
                const [cx, cy] = clampToArena(tgt.x, tgt.y, maxR);
                c.x = lerp(c.x, cx, expSmooth(dt, 11));
                c.y = lerp(c.y, cy, expSmooth(dt, 11));
                c.z = lerp(c.z, tgt.z, expSmooth(dt, 11));
                c.yaw = wrapAngle(c.yaw + wrapAngle(tgt.yaw - c.yaw) * expSmooth(dt, 10));
                c.scraping = tgt.isScraping;

                c.flakeCd -= dt * gFreq;
                if (c.flakeCd <= 0) {
                  c.flakeCd = 0.34 + hash2i(i + 7, Math.floor(time * 2), 67) * 0.30;
                  emitFlake(vfx, c.x, c.y, c.z, c.yaw, sMul);
                }
              }

              if (action !== 'idle' && state.modeT >= scrapeDur) {
                state.cycleSeq++;
                enterMode('soloLoop');
              }
            } else {
              // 独台排队下地绕半圈再从另一端爬回倒木背脊
              const totalT = paradeDur;
              for (let i = 0; i < CLEANER_COUNT; i++) {
                const c = cleaners[i];
                const stagger = i * 0.14;
                const u = clamp((state.modeT - stagger) / Math.max(0.5, totalT - 0.65), 0, 1);
                let lx, ly, lz, lYaw;
                const dir = (state.cycleSeq & 1) ? 1 : -1;

                if (u < 0.25) {
                  // 1. 按序从倒木前侧滑下落地
                  const v = smoothstep(0, 1, u / 0.25);
                  lx = lerp((i - 2) * 4.9, 13.5 * dir, v);
                  ly = lerp(0, 10.8 * dir, v);
                  lz = lerp(LOG_TOP_Z, 0.25, v * v) + Math.sin(v * Math.PI) * 2.2;
                  lYaw = Math.atan2(-(13.5 * dir - (i - 2) * 4.9), 10.8 * dir);
                } else if (u < 0.75) {
                  // 2. 地面成纵队绕过倒木底侧小跑
                  const v = (u - 0.25) / 0.50;
                  const ang = lerp(0.15, Math.PI - 0.15, v);
                  lx = Math.cos(ang) * 14.2 * dir;
                  ly = (10.8 + Math.sin(ang) * 4.2) * dir;
                  lz = 0.25 + Math.abs(Math.sin(time * 12 * gFreq + i)) * 0.65;
                  const tx = -Math.sin(ang) * 14.2 * dir;
                  const ty = Math.cos(ang) * 4.2 * dir;
                  lYaw = Math.atan2(-tx, ty);
                } else {
                  // 3. 从另一端排队重新爬上倒木背脊
                  const v = smoothstep(0, 1, (u - 0.75) / 0.25);
                  const startX = -13.5 * dir;
                  const startY = 10.8 * dir;
                  const endX = (i - 2) * 4.9;
                  const endY = 0;
                  lx = lerp(startX, endX, v);
                  ly = lerp(startY, endY, v);
                  lz = lerp(0.25, LOG_TOP_Z, v) + Math.sin(v * Math.PI) * 2.4;
                  lYaw = Math.atan2(-(endX - startX), endY - startY);
                }

                const [wx, wy] = localToWorldXY(clHomeX, clHomeY, homeYaw, lx * sMul, ly * sMul);
                const [cx, cy] = clampToArena(wx, wy, maxR);
                c.x = cx;
                c.y = cy;
                c.z = Math.max(0, lz * sMul);
                c.yaw = wrapAngle(homeYaw + lYaw);
                c.scraping = false;
              }

              if (state.modeT >= totalT) {
                enterMode('scrape');
              }
            }
          }

          // 更新独立落地暗印（5 只小兽 + 独台倒木）
          for (let i = 0; i < CLEANER_COUNT; i++) {
            const c = cleaners[i];
            footContacts[i].x = c.x;
            footContacts[i].y = c.y;
            footContacts[i].z = c.z;
            footContacts[i].r = (state.hasHostEnv && state.mode === 'scrape') ? 0 : 3.2 * sMul;
          }
          footContacts[CLEANER_COUNT].x = state.x;
          footContacts[CLEANER_COUNT].y = state.y;
          footContacts[CLEANER_COUNT].z = 0;
          footContacts[CLEANER_COUNT].r = state.hasHostEnv ? 0 : 11.2 * sMul;

          sockets.setWorld('center', state.x, state.y, state.z + 6 * sMul, state.yaw);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? (habitat.waterLevel ?? -99) : -99;

          // 独台预览模式先放林地倒木载体
          if (!state.hasHostEnv) {
            list.push({
              partKey: 'fallenLog',
              asset: parts.fallenLog,
              x: state.x,
              y: state.y,
              lift: 0,
              ro: state.yaw,
              bias: -0.45,
              submerge: EnvFeedback.calcSubmerge(1.2, waterLvl, 4.8, isWater)
            });
          }

          // 5 只共享贴图的扁树皮片小兽（稳压宿主背顶 / 倒木顶面）
          for (let i = 0; i < CLEANER_COUNT; i++) {
            const c = cleaners[i];
            const key = c.scraping ? 'cleanerScrape' : 'cleanerWalk';
            list.push({
              partKey: key,
              asset: parts[key],
              x: c.x,
              y: c.y,
              lift: Math.max(0, c.z),
              ro: c.yaw,
              bias: state.hasHostEnv ? (1.95 + i * 0.03) : (1.15 + i * 0.03),
              submerge: EnvFeedback.calcSubmerge(c.z + 1.0, waterLvl, 4.0, isWater)
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Earth10Def.id,
            code: Earth10Def.code,
            name: Earth10Def.name,
            template: 'M36',
            noHost: true,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            flockCount: CLEANER_COUNT,
            mode: state.mode,
            hasHostEnv: state.hasHostEnv,
            footRadius: 4.4,
            headZ: 16,
            centerZ: 8,
            blocks: Earth10Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Earth10Def);
})(window.PixelWorkshop);
