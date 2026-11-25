'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 天8 · 舔雷击痕的（M22 腹足滑行同类 · 照 sand7_salt_slug.js 改写）
  //
  // 【设计摘要】
  // 1. 成串排线与俯视高对比（默认 ×4 缩放与深灰雷云岩峰强对比）：
  //    - 4 只扁长贴地腹足生物成串排成一条线，全部共享同一套轻量节件资产
  //      （slugFront / slugMid / slugRear + glassPlate + antenna，省贴图预算）；
  //    - 每只背上排一列 3 片高对比亮电蓝/明青半透明玻璃硬片（opacity: 0.86），
  //      内部透出细密导电脉纹，在深灰雷云岩峰上极其醒目；
  //    - 前端两对（4 根）明黄弹簧短触角（外对略长、内对略短），由 SpringDamper1D 驱动；
  // 2. 生态动作（patrol / idle / parade）：
  //    - 领头个体在雷云峰顶 maxRadius * 0.80 内沿蜿蜒折线滑行，后 3 只精确沿历史轨迹
  //      排成一串紧随，各自带独立相位差的腹足顺行波（纯位移平推，严禁 scale）；
  //    - 滑行途中持续写入焦裂雷击痕 vfx.addDecal({ kind: 'crack', ... }) 与舔过后的亮青痕，
  //      周期性整串停下低头舔焦痕边的雷击苔，玻璃背片微颤并溅出电蓝苔屑。
  // 3. 资产与预算：5 个共享小件，26 色 0 重色 0 自亮，3 套换色皮肤，0 禁用字。
  // =========================================================================

  // 26 色独立色表（<= 48 色、0 重色、0 自亮）
  const SPEC = createPaletteSpec({
    pal: {
      // 扁长软体腹足主体（深青炭蓝，衬托亮电蓝玻璃片与明黄触角）
      bodyDark:    '#182336',
      bodyMid:     '#283c5c',
      bodyHi:      '#42608c',
      // 腹足侧裙边（偏亮青灰，保证在深灰岩石上轮廓分明）
      skirtDark:   '#395b7d',
      skirtMid:    '#5c8bb5',
      skirtHi:     '#96c5eb',
      // 节间软体褶沟
      foldDark:    '#101826',
      foldMid:     '#1d2c45',
      foldHi:      '#30466b',
      // 背部承托玻璃片的暗蓝肉脊
      ridgeDark:   '#133554',
      ridgeMid:    '#1f5c8a',
      ridgeHi:     '#388ec4',
      // 高对比亮电蓝 / 明青半透明玻璃硬片主体
      glassDark:   '#0a9cc7',
      glassMid:    '#29e3ff',
      glassHi:     '#b8fcff',
      // 玻璃片内部细纹与晶棱（半透内构特征）
      veinDark:    '#085980',
      veinMid:     '#0f8eb8',
      veinHi:      '#7af0ff',
      // 前端两对明黄弹簧短触角（高对比撞色）
      antDark:     '#b57c07',
      antMid:      '#f5c418',
      antHi:       '#fff282',
      // 触角末端微橙感苔球
      tipDark:     '#c75b0e',
      tipMid:      '#ff922b',
      tipHi:       '#ffd48a',
      // 舔苔吻唇凹褶
      mouthDark:   '#241830',
      mouthMid:    '#4b3263'
    },
    glowKeys: [],
    parts: [
      'body', 'skirt', 'fold', 'ridge',
      'glass', 'vein', 'ant', 'tip', 'mouth'
    ],
    noCrease: [
      ['body', 'skirt'],
      ['body', 'fold'],
      ['body', 'mouth'],
      ['glass', 'vein'],
      ['ant', 'tip']
    ],
    materials: {
      body:  ['bodyDark',  'bodyMid',  'bodyHi'],
      skirt: ['skirtDark', 'skirtMid', 'skirtHi'],
      fold:  ['foldDark',  'foldMid',  'foldHi'],
      ridge: ['ridgeDark', 'ridgeMid', 'ridgeHi'],
      glass: ['glassDark', 'glassMid', 'glassHi'],
      vein:  ['veinDark',  'veinMid',  'veinHi'],
      ant:   ['antDark',   'antMid',   'antHi'],
      tip:   ['tipDark',   'tipMid',   'tipHi']
    },
    protectedParts: ['glass', 'vein', 'ant', 'tip', 'mouth']
  });

  // 3 套零重建模换色皮肤（电蓝琉璃 / 琥珀晶背 / 翠青晶甲）
  const SKINS = [
    {
      id: 'volt_glass',
      name: '电蓝琉璃（雷峰经典）',
      dot: '#29e3ff',
      outline: '#0a101c',
      pal: {},
      fx: {
        crackColor: '#24d8f2',
        crackDark:  '#121926',
        mossChip:   '#78f7ff',
        sparkDust:  '#ffe052'
      }
    },
    {
      id: 'amber_quartz',
      name: '琥珀晶背（赤雷款）',
      dot: '#ffaa2b',
      outline: '#1a0f0a',
      pal: {
        bodyDark:  '#2e1b24', bodyMid:  '#4d2c3b', bodyHi:  '#75445a',
        skirtDark: '#6e404d', skirtMid: '#a36475', skirtHi: '#d99aad',
        foldDark:  '#1c1017', foldMid:  '#331d29', foldHi:  '#4f2e40',
        ridgeDark: '#572a18', ridgeMid: '#8f4726', ridgeHi: '#c96f3c',
        glassDark: '#c45b0a', glassMid: '#ffaa2b', glassHi: '#ffeb99',
        veinDark:  '#823208', veinMid:  '#c95814', veinHi:  '#ffd06b',
        antDark:   '#0c8299', antMid:   '#24d8f2', antHi:   '#b5fbff',
        tipDark:   '#10608a', tipMid:   '#47b3ff', tipHi:   '#bfe8ff',
        mouthDark: '#26121b', mouthMid: '#4f2738'
      },
      fx: {
        crackColor: '#ffaa2b',
        crackDark:  '#1f120c',
        mossChip:   '#ffe28a',
        sparkDust:  '#5eeeff'
      }
    },
    {
      id: 'jade_prism',
      name: '翠青晶甲（冷苔款）',
      dot: '#36f0a5',
      outline: '#091713',
      pal: {
        bodyDark:  '#162b26', bodyMid:  '#244a41', bodyHi:  '#397365',
        skirtDark: '#366b5e', skirtMid: '#56a18d', skirtHi: '#8ed9c5',
        foldDark:  '#0e1c18', foldMid:  '#19332c', foldHi:  '#2a5247',
        ridgeDark: '#124a38', ridgeMid: '#1d7a5b', ridgeHi: '#34b588',
        glassDark: '#0fa66b', glassMid: '#36f0a5', glassHi: '#c2ffea',
        veinDark:  '#096b45', veinMid:  '#14a86e', veinHi:  '#7dfad0',
        antDark:   '#b84e0d', antMid:   '#ff852b', antHi:   '#ffd694',
        tipDark:   '#9e2c14', tipMid:   '#f25738', tipHi:   '#ffab96',
        mouthDark: '#172420', mouthMid: '#314f46'
      },
      fx: {
        crackColor: '#36f0a5',
        crackDark:  '#0d1c17',
        mossChip:   '#a3ffe0',
        sparkDust:  '#ff9f4a'
      }
    }
  ];

  // =========================================================================
  // 1. 扁长腹足 3 节共享资产（每只单长 ~16 格，4 只成串总长达 ~66 格）
  // =========================================================================
  function buildSlugSegment(makeCanvas, role) {
    const cfg = {
      front: { W: 12, D: 8, H: 5, rx: 4.2, ry: 3.4, skirtW: 5.1 },
      mid:   { W: 12, D: 8, H: 5, rx: 4.5, ry: 3.6, skirtW: 5.4 },
      rear:  { W: 10, D: 8, H: 4, rx: 3.6, ry: 3.5, skirtW: 4.4 }
    }[role];

    const m = new VoxelModel(cfg.W, cfg.D, cfg.H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-cfg.skirtW - 0.5, cfg.skirtW + 0.5, -cfg.ry - 0.5, cfg.ry + 0.5, 0, cfg.H - 1, (x, y, z, X, Y) => {
      const absX = Math.abs(X);
      let taper = 1.0;
      if (role === 'front' && Y > 0) taper = lerp(1.0, 0.68, clamp(Y / cfg.ry, 0, 1));
      if (role === 'rear' && Y < 0) taper = lerp(1.0, 0.34, clamp(-Y / cfg.ry, 0, 1));

      const ny = Y / cfg.ry;
      if (Math.abs(ny) > 1.0) return;

      // 底部宽扁侧裙边（z = 0..1）：浅青灰亮边防与深灰岩峰融合
      const skirtLim = cfg.skirtW * taper + Math.cos(Y * 1.4) * 0.35;
      const skirtD = Math.hypot(absX / Math.max(1.4, skirtLim), ny);
      if (z <= 1 && skirtD <= 1.0) {
        m.setRaw(x, y, z, skirtD > 0.68 ? mat('skirt') : mat('body'), skirtD > 0.68 ? partId.skirt : partId.body);
        return;
      }

      // 扁平拱背肉体
      const nx = absX / Math.max(1.2, cfg.rx * taper);
      const nz = (z - 1.2) / Math.max(1.4, cfg.H - 1.8);
      if (nx * nx + ny * ny * 0.9 + nz * nz <= 1.0 && z >= 1) {
        if (role === 'front' && Y >= cfg.ry * 0.55 && absX <= 1.5 && z <= 2) {
          m.setRaw(x, y, z, z === 1 ? keyToId.mouthDark : keyToId.mouthMid, partId.mouth);
          return;
        }
        if (z >= cfg.H - 2 && nx < 0.65) {
          m.setRaw(x, y, z, mat('ridge'), partId.ridge);
        } else if (Math.abs(Y) > cfg.ry * 0.68 && z <= 2) {
          m.setRaw(x, y, z, mat('fold'), partId.fold);
        } else {
          m.setRaw(x, y, z, mat('body'), partId.body);
        }
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: cfg.skirtW, headZ: cfg.H, centerZ: 2 });
  }

  // =========================================================================
  // 2. 高对比亮电蓝 / 明青半透明玻璃硬片（glassPlate：10×6×5，左右对称）
  //    每只背上排 3 片，内部透出细密纵纹，与深灰雷云岩峰形成强烈反差
  // =========================================================================
  function buildGlassPlate(makeCanvas) {
    const m = new VoxelModel(10, 6, 5, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-4.5, 4.5, -2.5, 2.5, 0, 4, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      const ay = Math.abs(Y);
      const topShrink = lerp(1.0, 0.72, z / 4);
      // 略带六边形折角的玻璃硬片，边缘锐利
      const hex = Math.max(ax / 4.2 + ay / 3.4, ay / 2.2);
      if (hex > topShrink) return;

      // 内部细密导电纹（正中纵纹 + 两侧斜纹）
      const isVein = (ax < 0.65 && z >= 1 && z <= 3) || (Math.abs(ax - 2.1) < 0.55 && ay < 1.2 && z === 2);
      if (isVein) {
        m.setRaw(x, y, z, mat('vein'), partId.vein);
      } else {
        m.setRaw(x, y, z, mat('glass'), partId.glass);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 4, centerZ: 2 });
  }

  // =========================================================================
  // 3. 明黄弹簧短触角（antenna：4×7×4，枢轴锁在根部 (0, -2.4)）
  //    每只前端挂两对（共 4 根）明黄短触角
  // =========================================================================
  const ANT_PIVOT = { x: 0, y: -2.4 };
  function buildAntenna(makeCanvas) {
    const m = new VoxelModel(4, 7, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -2.4, 1.3, 0, 1.8, 2.3, 0.95, 0.72, mat('ant'), partId.ant, true);
    m.paintEllipsoid(0, 2.5, 2.5, 0.95, 0.95, 0.9, mat('tip'), partId.tip, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.8, headZ: 3, centerZ: 1.5 });
  }

  // =========================================================================
  // 队列与行波参数常量
  // =========================================================================
  const TRAIN_COUNT = 4;               // 4 只成串排成一条线
  const TRAIN_SPACING = 17.5;          // 相邻个体中心间距（格）
  const SEG_Y = [4.6, 0.0, -4.6];      // 单只 3 节局部 Y
  const PLATE_Y = [4.2, -0.3, -4.6];   // 单只背上 3 片玻璃硬片局部 Y
  const CRACK_STEP = 5.4;              // 焦裂雷击痕写入间距（格）
  const CRACK_LIFE = 12.0;             // 焦痕留存时长（秒）

  const Sky8BoltLickerDef = {
    id: 'sky8_bolt_licker',
    code: '天8',
    name: '舔雷击痕的',
    status: 'done',
    tag: 'M22 同类 · 4 只成串腹足滑行 + 焦裂雷击痕',
    summary: '4 只成串排成一条线的扁长腹足生物（共享轻节件），背上一排高对比亮电蓝/明青半透明玻璃硬片，前端两对明黄弹簧短触角；沿地面焦裂雷击痕成串滑行舔苔，周期性依次停下低头舔苔并微颤玻璃背片',
    defaultHabitat: 'thunderPeak',
    footRadius: 16.5,
    ecoWeight: 1.1,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '成串巡游舔苔', loop: true, status: 'done' },
      { id: 'idle',   name: '成串原地待机', loop: true, status: 'done' },
      { id: 'parade', name: '焦痕排线滑行', loop: true, status: 'done' }
    ],
    blocks: [
      '4 只共享节件成串沿轨迹排线滑行',
      '每只背上 3 片亮电蓝半透明玻璃硬片',
      '前端两对明黄弹簧短触角',
      '地表焦裂雷击痕与亮青舔痕写入',
      '腹足顺行波与成串轮流低头舔苔'
    ],
    soulHabit: '三四只扁长身子排成一条线，背上透亮的电蓝玻璃片在深灰雷云岩峰上格外扎眼，头前两对明黄短触角一路探着地面新劈出的焦裂雷击痕成串滑行，停下来依次低头舔食焦痕边的雷击苔',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        slugFront:  buildSlugSegment(makeCanvas, 'front'),
        slugMid:    buildSlugSegment(makeCanvas, 'mid'),
        slugRear:   buildSlugSegment(makeCanvas, 'rear'),
        glassPlate: buildGlassPlate(makeCanvas),
        antenna:    buildAntenna(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.4;
      const seed0 = opts.seed ?? 88;

      const antExtSp = new SpringDamper1D(1.0, 125, 11.5);
      const plateShiverSp = new SpringDamper1D(0, 130, 9.2);
      const lickSp = new SpringDamper1D(0, 92, 10.0);

      // 4 只成串个体的实时世界位姿
      const train = [];
      for (let i = 0; i < TRAIN_COUNT; i++) {
        train.push({
          idx: i,
          x: hx0,
          y: hy0,
          yaw: hyaw0,
          wavePhase: i * 1.35,
          lick: 0
        });
      }

      // 轨迹点历史（供后 3 只精准沿领头个体的雷击痕路径排成一条线跟随）
      const trail = [];

      const state = {
        x: hx0,
        y: hy0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        shadowScale: 0.72,
        stage: 'glide', // 'glide' | 'lick' | 'idle'
        stageT: 0,
        stageDur: 7.5,
        seq: 1,
        navX: hx0 + 20,
        navY: hy0 + 12,
        decalAcc: 0,
        decalCd: 0,
        lastDecalX: hx0,
        lastDecalY: hy0,
        lickShiverDone: false,
        prevAction: 'patrol',
        paradeAngle: 0,
        simTime: 0
      };

      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      function clampInSafeDisc(x, y, maxR) {
        const lim = maxR * 0.80;
        const d = Math.hypot(x, y);
        if (d > lim && d > 1e-4) {
          return [x * lim / d, y * lim / d];
        }
        return [x, y];
      }

      function initTrailLine(hx, hy, yaw, sMul, maxR) {
        trail.length = 0;
        const fwdX = -Math.sin(yaw);
        const fwdY =  Math.cos(yaw);
        const totalBack = TRAIN_SPACING * (TRAIN_COUNT + 0.5) * sMul;
        const steps = 64;
        for (let i = 0; i <= steps; i++) {
          const dist = (i / steps) * totalBack;
          const [cx, cy] = clampInSafeDisc(hx - fwdX * dist, hy - fwdY * dist, maxR);
          trail.push({ x: cx, y: cy, yaw });
        }
      }

      function pushTrailHead(x, y, yaw) {
        if (trail.length === 0) {
          trail.unshift({ x, y, yaw });
          return;
        }
        const d = Math.hypot(x - trail[0].x, y - trail[0].y);
        if (d >= 1.1) {
          trail.unshift({ x, y, yaw });
          if (trail.length > 180) trail.length = 180;
        } else {
          trail[0].x = x;
          trail[0].y = y;
          trail[0].yaw = yaw;
        }
      }

      function sampleTrailAtDist(targetDist) {
        if (trail.length === 0) return { x: state.x, y: state.y, yaw: state.yaw };
        let acc = 0;
        for (let i = 0; i < trail.length - 1; i++) {
          const a = trail[i];
          const b = trail[i + 1];
          const seg = Math.hypot(b.x - a.x, b.y - a.y);
          if (seg < 1e-4) continue;
          if (acc + seg >= targetDist) {
            const t = (targetDist - acc) / seg;
            return {
              x: lerp(a.x, b.x, t),
              y: lerp(a.y, b.y, t),
              yaw: wrapAngle(a.yaw + wrapAngle(b.yaw - a.yaw) * t)
            };
          }
          acc += seg;
        }
        const last = trail[trail.length - 1];
        return { x: last.x, y: last.y, yaw: last.yaw };
      }

      function syncTrainFromTrail(sMul, maxR) {
        train[0].x = state.x;
        train[0].y = state.y;
        train[0].yaw = state.yaw;
        for (let i = 1; i < TRAIN_COUNT; i++) {
          const smp = sampleTrailAtDist(i * TRAIN_SPACING * sMul);
          const [cx, cy] = clampInSafeDisc(smp.x, smp.y, maxR);
          train[i].x = cx;
          train[i].y = cy;
          train[i].yaw = smp.yaw;
        }
      }

      function pickNextTarget(maxR) {
        state.seq++;
        const r1 = hash2i(state.seq, seed0, 149);
        const r2 = hash2i(state.seq, seed0, 277);
        const r3 = hash2i(state.seq, seed0, 397);
        const curAng = Math.atan2(state.y, state.x);
        const ang = curAng + (r1 > 0.5 ? 1 : -1) * lerp(1.1, 2.2, r2);
        const rad = lerp(maxR * 0.30, maxR * 0.72, r3);
        state.navX = Math.cos(ang) * rad;
        state.navY = Math.sin(ang) * rad;
      }

      function emitBoltCrack(vfx, wx, wy, yaw, sMul) {
        if (!vfx || typeof vfx.addDecal !== 'function') return;
        const fx = curSkin.fx || SKINS[0].fx;
        vfx.addDecal({
          kind: 'crack',
          x: wx,
          y: wy,
          yaw,
          rx: 5.4 * sMul,
          ry: 7.2 * sMul,
          life: CRACK_LIFE,
          alpha: 0.86,
          color: fx.crackColor,
          darkColor: fx.crackDark
        });
      }

      function spawnMossSparks(vfx, wx, wy, count, sMul) {
        if (!vfx || typeof vfx.spawnParticle !== 'function') return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU + hash2i(state.seq + i, seed0, 541) * 0.8;
          const spd = (4.0 + hash2i(state.seq + i, seed0, 647) * 6.5) * sMul;
          vfx.spawnParticle(
            wx + Math.cos(a) * 3.0 * sMul,
            wy + Math.sin(a) * 3.0 * sMul,
            3.2 * sMul,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            (4.0 + hash2i(state.seq + i, seed0, 757) * 5.0) * sMul,
            0.38 + hash2i(state.seq + i, seed0, 853) * 0.20,
            1.25,
            i % 2 === 0 ? fx.mossChip : fx.sparkDust,
            false,
            28
          );
        }
      }

      const instance = {
        def: Sky8BoltLickerDef,
        cachePrefix: `sky8_bl_${Math.random().toString(36).slice(2, 7)}`,
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
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          const sMul = instance.scaleMul || 1.0;
          state.x = hx;
          state.y = hy;
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = hyaw;
          state.stage = 'glide';
          state.stageT = 0;
          state.stageDur = 6.8;
          state.seq = 1;
          state.decalAcc = 0;
          state.decalCd = 0;
          state.lastDecalX = hx;
          state.lastDecalY = hy;
          state.lickShiverDone = false;
          state.prevAction = 'patrol';
          state.paradeAngle = 0;
          state.simTime = 0;

          antExtSp.x = 1.0; antExtSp.v = 0;
          plateShiverSp.x = 0; plateShiverSp.v = 0;
          lickSp.x = 0; lickSp.v = 0;

          initTrailLine(hx, hy, hyaw, sMul, 44);
          syncTrainFromTrail(sMul, 44);
          pickNextTarget(44);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.35, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const maxR = (eco && eco.maxRadius) || 44;
          const homeX = (eco && eco.homeX) ?? hx0;
          const homeY = (eco && eco.homeY) ?? hy0;
          const homeYaw = (eco && eco.homeYaw) ?? hyaw0;
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');

          state.simTime = time;

          if (action !== state.prevAction) {
            state.prevAction = action;
            state.stageT = 0;
            if (action === 'idle') {
              state.stage = 'idle';
            } else {
              state.stage = 'glide';
              state.stageDur = action === 'parade' ? 999 : 7.0;
            }
          }

          let moveSpd = 0;
          let targetLick = 0;
          let targetAntExt = 1.0;

          if (action === 'idle') {
            state.stage = 'idle';
            state.x = lerp(state.x, homeX, expSmooth(dt, 4.0));
            state.y = lerp(state.y, homeY, expSmooth(dt, 4.0));
            state.yaw = wrapAngle(state.yaw + wrapAngle(homeYaw - state.yaw) * expSmooth(dt, 3.6));
            state.vx = 0;
            state.vy = 0;
            // 原地成串排直微动
            for (let i = 0; i < TRAIN_COUNT; i++) {
              train[i].wavePhase = (train[i].wavePhase + dt * 2.0 * gFreq) % TAU;
            }
            const cyc = (time % 7.2);
            if (cyc > 4.6 && cyc < 6.4) {
              targetLick = Math.sin(((cyc - 4.6) / 1.8) * Math.PI);
              targetAntExt = 0.78;
            }
          } else if (action === 'parade') {
            // 焦痕排线演示：沿平稳大环 + 微 S 蛇形连续成串滑行并密集留下焦裂雷击痕
            state.stage = 'glide';
            state.paradeAngle += dt * 0.42 * spdMul;
            const ringR = maxR * 0.56;
            const wobble = Math.sin(state.paradeAngle * 3.0) * (maxR * 0.14);
            const goalX = Math.cos(state.paradeAngle) * (ringR + wobble);
            const goalY = Math.sin(state.paradeAngle) * (ringR + wobble);
            const dx = goalX - state.x;
            const dy = goalY - state.y;
            const desiredYaw = Math.atan2(-dx, dy);
            const yawDiff = wrapAngle(desiredYaw - state.yaw);
            state.yaw = wrapAngle(state.yaw + clamp(yawDiff, -2.4 * dt, 2.4 * dt));

            moveSpd = 12.6 * spdMul * sMul;
            const fwdX = -Math.sin(state.yaw);
            const fwdY =  Math.cos(state.yaw);
            state.vx = lerp(state.vx, fwdX * moveSpd, expSmooth(dt, 6.5));
            state.vy = lerp(state.vy, fwdY * moveSpd, expSmooth(dt, 6.5));
            const [nx, ny] = clampInSafeDisc(state.x + state.vx * dt, state.y + state.vy * dt, maxR);
            state.x = nx;
            state.y = ny;
            pushTrailHead(state.x, state.y, state.yaw);
            syncTrainFromTrail(sMul, maxR);

            for (let i = 0; i < TRAIN_COUNT; i++) {
              train[i].wavePhase = (train[i].wavePhase + dt * 5.8 * gFreq * spdMul) % TAU;
            }

            // 沿焦痕高频写入焦裂雷击痕
            const dStep = Math.hypot(state.x - state.lastDecalX, state.y - state.lastDecalY);
            state.decalAcc += dStep;
            state.decalCd -= dt;
            if (state.decalAcc >= CRACK_STEP * 0.82 * sMul || state.decalCd <= 0) {
              state.decalAcc = 0;
              state.decalCd = 0.42;
              state.lastDecalX = state.x;
              state.lastDecalY = state.y;
              const [fx, fy] = localToWorldXY(state.x, state.y, state.yaw, 0, 5.2 * sMul);
              emitBoltCrack(vfx, fx, fy, state.yaw, sMul);
            }
          } else {
            // patrol：自由成串滑行舔焦痕 ↔ 停下依次低头舔雷击苔
            state.stageT += dt;
            if (state.stage === 'glide') {
              const tx = state.navX + ((eco && eco.avoidX) || 0) * 0.25;
              const ty = state.navY + ((eco && eco.avoidY) || 0) * 0.25;
              const dx = tx - state.x;
              const dy = ty - state.y;
              if (Math.hypot(dx, dy) < 8.0 * sMul) pickNextTarget(maxR);

              const desiredYaw = Math.atan2(-dx, dy);
              const yawDiff = wrapAngle(desiredYaw - state.yaw);
              state.yaw = wrapAngle(state.yaw + clamp(yawDiff, -1.85 * dt, 1.85 * dt));

              const align = clamp(Math.cos(yawDiff), 0.25, 1.0);
              moveSpd = 11.2 * spdMul * align * sMul;
              const fwdX = -Math.sin(state.yaw);
              const fwdY =  Math.cos(state.yaw);
              state.vx = lerp(state.vx, fwdX * moveSpd, expSmooth(dt, 6.0));
              state.vy = lerp(state.vy, fwdY * moveSpd, expSmooth(dt, 6.0));

              let nx = state.x + state.vx * dt;
              let ny = state.y + state.vy * dt;
              if (Math.hypot(nx, ny) > maxR * 0.80) {
                [nx, ny] = clampInSafeDisc(nx, ny, maxR);
                pickNextTarget(maxR);
              }
              state.x = nx;
              state.y = ny;

              pushTrailHead(state.x, state.y, state.yaw);
              syncTrainFromTrail(sMul, maxR);

              for (let i = 0; i < TRAIN_COUNT; i++) {
                train[i].wavePhase = (train[i].wavePhase + dt * 5.2 * gFreq * spdMul) % TAU;
              }

              // 沿领头前方与队尾持续写焦裂雷击痕
              const dStep = Math.hypot(state.x - state.lastDecalX, state.y - state.lastDecalY);
              state.decalAcc += dStep;
              state.decalCd -= dt;
              if (state.decalAcc >= CRACK_STEP * sMul || state.decalCd <= 0) {
                state.decalAcc = 0;
                state.decalCd = clamp(0.50 / spdMul, 0.26, 0.65);
                state.lastDecalX = state.x;
                state.lastDecalY = state.y;
                const [fx, fy] = localToWorldXY(state.x, state.y, state.yaw, 0, 5.0 * sMul);
                emitBoltCrack(vfx, fx, fy, state.yaw, sMul);
              }

              if (state.stageT >= state.stageDur) {
                state.stage = 'lick';
                state.stageT = 0;
                state.stageDur = lerp(2.2, 3.0, hash2i(state.seq + 5, seed0, 487));
                state.lickShiverDone = false;
                const [fx, fy] = localToWorldXY(state.x, state.y, state.yaw, 0, 5.5 * sMul);
                emitBoltCrack(vfx, fx, fy, state.yaw, sMul);
              }
            } else {
              // 停下依次低头舔雷击苔，玻璃背片微颤蹦苔屑
              state.vx *= 0.80;
              state.vy *= 0.80;
              const u = clamp(state.stageT / Math.max(0.1, state.stageDur), 0, 1);
              targetLick = Math.sin(u * Math.PI);
              targetAntExt = 0.78;
              for (let i = 0; i < TRAIN_COUNT; i++) {
                train[i].wavePhase = (train[i].wavePhase + dt * 1.8 * gFreq) % TAU;
              }
              if (!state.lickShiverDone && u >= 0.44) {
                state.lickShiverDone = true;
                plateShiverSp.impulse(14.0 * sp);
                for (let i = 0; i < TRAIN_COUNT; i++) {
                  spawnMossSparks(vfx, train[i].x, train[i].y, 3, sMul);
                }
              }
              if (state.stageT >= state.stageDur) {
                state.stage = 'glide';
                state.stageT = 0;
                state.seq++;
                state.stageDur = lerp(6.0, 9.0, hash2i(state.seq, seed0, 431));
              }
            }
          }

          // 安全位置钳制
          if (action !== 'idle') {
            const [cx, cy] = clampInSafeDisc(state.x, state.y, maxR);
            state.x = cx;
            state.y = cy;
          }
          state.z = 0;

          antExtSp.update(dt, targetAntExt, 125 * sp, clamp(11.5 * dScale, 5.0, 18.0));
          plateShiverSp.update(dt, 0, 130 * sp, clamp(9.2 * dScale, 4.0, 15.0));
          lickSp.update(dt, targetLick, 92 * sp, clamp(10.0 * dScale, 4.5, 15.0));

          // 每只接地印
          footContacts.length = 0;
          for (let i = 0; i < TRAIN_COUNT; i++) {
            footContacts.push({ x: train[i].x, y: train[i].y, z: 0, r: 5.0 * sMul });
          }
          sockets.setLocal('head', state.x, state.y, 0, state.yaw, 0, 7.5, 3.0, sMul);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const t = state.simTime;
          const baseLick = clamp(lickSp.x, 0, 1);
          const antExt = clamp(antExtSp.x, 0.25, 1.08);
          const plateVib = clamp(plateShiverSp.x * 0.12, -0.6, 1.2) * sMul;
          const isMoving = state.stage === 'glide' && Math.hypot(state.vx, state.vy) > 1.0;
          const waveGain = isMoving ? 1.0 : 0.28;

          const segKeys = ['slugFront', 'slugMid', 'slugRear'];

          for (let uIdx = 0; uIdx < TRAIN_COUNT; uIdx++) {
            const unit = train[uIdx];
            const ux = unit.x;
            const uy = unit.y;
            const uyaw = unit.yaw;
            const unitLick = baseLick * (0.75 + 0.25 * Math.sin(t * 7.0 + uIdx * 1.1));

            // 1. 单只 3 块腹足顺行波节（严禁 scale，纯位移纵向平推+微拱）
            let frontY = SEG_Y[0];
            let frontLift = 0;
            for (let si = 0; si < 3; si++) {
              const phi = unit.wavePhase - (2 - si) * 1.15;
              const longOff = Math.sin(phi) * 0.68 * waveGain;
              const liftOff = Math.max(0, Math.cos(phi)) * 0.55 * waveGain;
              const locY = (SEG_Y[si] + longOff + (si === 0 ? unitLick * 0.7 : 0)) * sMul;
              const lift = Math.max(0, (liftOff - (si === 0 ? unitLick * 0.25 : 0)) * sMul);
              const [wx, wy] = localToWorldXY(ux, uy, uyaw, 0, locY);

              if (si === 0) {
                frontY = SEG_Y[0] + longOff + unitLick * 0.7;
                frontLift = lift;
              }

              list.push({
                partKey: segKeys[si],
                asset: parts[segKeys[si]],
                x: wx,
                y: wy,
                lift,
                ro: uyaw,
                symDeg: si === 1 ? 180 : 360,
                bias: -0.25 + (2 - si) * 0.04
              });
            }

            // 2. 背上一排 3 片高对比亮电蓝/明青半透明玻璃硬片（opacity: 0.86）
            for (let pi = 0; pi < 3; pi++) {
              const phi = unit.wavePhase - (2 - pi) * 1.15;
              const pLift = (3.4 + Math.max(0, Math.cos(phi)) * 0.48 * waveGain) * sMul + plateVib * (pi === 1 ? 1.1 : 0.75);
              const [px, py] = localToWorldXY(ux, uy, uyaw, 0, PLATE_Y[pi] * sMul);
              list.push({
                partKey: 'glassPlate',
                asset: parts.glassPlate,
                x: px,
                y: py,
                lift: Math.max(2.6 * sMul, pLift),
                ro: uyaw,
                opacity: 0.86,
                symDeg: 180,
                bias: 3.6 + (2 - pi) * 0.12
              });
            }

            // 3. 前端两对（4 根）明黄弹簧短触角（外对略宽外张、内对略前探）
            const pairs = [
              { side: -1, ox: -2.6, oy: 2.8, baseYaw:  0.46, waveFreq: 3.6, liftAdd: 2.2 },
              { side:  1, ox:  2.6, oy: 2.8, baseYaw: -0.46, waveFreq: 3.4, liftAdd: 2.2 },
              { side: -1, ox: -1.1, oy: 3.6, baseYaw:  0.16, waveFreq: 4.8, liftAdd: 2.7 },
              { side:  1, ox:  1.1, oy: 3.6, baseYaw: -0.16, waveFreq: 4.5, liftAdd: 2.7 }
            ];
            for (let ai = 0; ai < pairs.length; ai++) {
              const p = pairs[ai];
              const wag = Math.sin(t * p.waveFreq + uIdx * 1.4 + ai * 0.9) * (0.20 + unitLick * 0.18);
              const aYaw = wrapAngle(uyaw + p.baseYaw + wag);
              const [jx, jy] = localToWorldXY(ux, uy, uyaw, p.ox * sMul, (frontY + p.oy * antExt) * sMul);
              const [ax, ay] = pivotToWorldXY(jx, jy, aYaw, ANT_PIVOT.x * sMul, ANT_PIVOT.y * sMul);
              list.push({
                partKey: 'antenna',
                asset: parts.antenna,
                x: ax,
                y: ay,
                lift: Math.max(0.4 * sMul, frontLift + (p.liftAdd - unitLick * 0.8) * sMul),
                ro: aYaw,
                bias: 0.55
              });
            }
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sky8BoltLickerDef.id,
            code: Sky8BoltLickerDef.code,
            name: Sky8BoltLickerDef.name,
            status: Sky8BoltLickerDef.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            trainCount: TRAIN_COUNT,
            stage: state.stage,
            footRadius: Sky8BoltLickerDef.footRadius,
            headZ: 9,
            centerZ: 4,
            blocks: Sky8BoltLickerDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sky8BoltLickerDef);
})(window.PixelWorkshop);
