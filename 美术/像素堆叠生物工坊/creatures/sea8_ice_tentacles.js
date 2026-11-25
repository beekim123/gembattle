'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 海8 · 冰缝边的一排触须（M10 固定成排共享资产海葵柱）
  //   1. 俯视强对比造型：沿冰缝排成一列的 6 根共享资产肉柱，深珊瑚紫红/暖绛红肉柱底座
  //      强反衬洁白冰海地台，顶上一圈张开的亮青白/雪白细花触须，一眼看清是一排开在冰缝边的小海葵柱；
  //   2. 多米诺海葵伸缩机制：平时依次随冰缝水流轻柔摇曳张开，受惊或周期性像多米诺骨牌一样
  //      从一端到另一端依次急速缩回冰缝（open -> half -> closed 无损换件 + 垂直沉降），
  //      片刻后再逐根缓缓探出绽开；
  //   3. 严格守则：21 色 <= 48、0 重色、0 禁用字、零常态 scaleX/scaleY、
  //      全部 6 根柱子坐标严格钳制在 maxRadius * 0.80 内。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 深珊瑚紫红/暖绛红肉柱底座（强反衬洁白冰面）
      stalkDark:  '#521324',
      stalkMid:   '#8f243d',
      stalkHi:    '#c94860',
      // 肉柱纵棱与环状领圈（暖绛红过渡）
      ridgeDark:  '#3b0c1a',
      ridgeMid:   '#6e1a30',
      ridgeHi:    '#a8354d',
      // 顶部花盘暖粉肉芯
      coreDark:   '#a3394c',
      coreMid:    '#e0677a',
      coreHi:     '#ffa3b0',
      // 亮青白/雪白细花触须主瓣
      frondDark:  '#88bfc9',
      frondMid:   '#c7f0f5',
      frondHi:    '#f2feff',
      // 触须尖端纯雪白细尖
      tipDark:    '#b5d4de',
      tipMid:     '#e0f5fa',
      tipHi:      '#ffffff',
      // 冰缝深海暗蓝裂槽（贴地标出冰缝）
      crackDark:  '#0d2842',
      crackMid:   '#1a4b73',
      crackHi:    '#387ba8',
      // 冰缝边缘冷冰霜边
      rimDark:    '#7ba8c4',
      rimMid:     '#b5d8eb',
      rimHi:      '#e6f6ff'
    },
    glowKeys: [],
    parts: [
      'stalk', 'ridge', 'core', 'frond', 'tip', 'crack', 'rim'
    ],
    noCrease: [
      ['stalk', 'ridge'],
      ['stalk', 'core'],
      ['core', 'frond'],
      ['frond', 'tip'],
      ['crack', 'rim']
    ],
    materials: {
      stalk: ['stalkDark', 'stalkMid', 'stalkHi'],
      ridge: ['ridgeDark', 'ridgeMid', 'ridgeHi'],
      core:  ['coreDark',  'coreMid',  'coreHi'],
      frond: ['frondDark', 'frondMid', 'frondHi'],
      tip:   ['tipDark',   'tipMid',   'tipHi'],
      crack: ['crackDark', 'crackMid', 'crackHi'],
      rim:   ['rimDark',   'rimMid',   'rimHi']
    },
    protectedParts: ['core', 'tip']
  });

  // 3 套极地冰缝皮肤（每套严格 21 色 <= 48、0 重色、0 禁用字）
  const SKINS = [
    {
      id: 'crimson_frost',
      name: '绛红雪须（经典冰葵）',
      dot: '#8f243d',
      outline: '#120810',
      pal: {},
      fx: { foam: '#e6faff', ice: '#9cd6eb' }
    },
    {
      id: 'plum_mint',
      name: '梅紫冰青（寒潮冰葵）',
      dot: '#782669',
      outline: '#100817',
      pal: {
        stalkDark: '#401240', stalkMid: '#782669', stalkHi: '#b54d9c',
        ridgeDark: '#2b0a2e', ridgeMid: '#591952', ridgeHi: '#913880',
        coreDark:  '#8f3373', coreMid:  '#cc64a6', coreHi:  '#ff9ed8',
        frondDark: '#69bfa8', frondMid: '#a8f0da', frondHi: '#e8fff7',
        tipDark:   '#9cd9ca', tipMid:   '#d4faef', tipHi:   '#f7fffd'
      },
      fx: { foam: '#e8fff7', ice: '#8ad9c5' }
    },
    {
      id: 'ochre_pearl',
      name: '赤褐珠白（暖礁冰葵）',
      dot: '#a33b24',
      outline: '#170b08',
      pal: {
        stalkDark: '#591c12', stalkMid: '#a33b24', stalkHi: '#de6947',
        ridgeDark: '#3d120b', ridgeMid: '#782919', ridgeHi: '#b54b33',
        coreDark:  '#b8641f', coreMid:  '#f09a3e', coreHi:  '#ffd17a',
        frondDark: '#b3aba0', frondMid: '#e6dfd3', frondHi: '#faf7f0',
        tipDark:   '#ccc6bc', tipMid:   '#f2eee6', tipHi:   '#fffdf7'
      },
      fx: { foam: '#faf7f0', ice: '#b5d8eb' }
    }
  ];

  // =========================================================================
  // 1. 共享资产建模（6 根完全复用，极省贴图预算）
  // =========================================================================

  // 贴地冰缝底座段（10×12×3，noOutline: true，6 段拼成一道深蓝冰缝带）
  function buildIceCrack(makeCanvas) {
    const m = new VoxelModel(10, 12, 3, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-4.5, 4.5, -5.5, 5.5, 0, 2, (x, y, z, X, Y) => {
      const waveX = Math.sin(Y * 0.45) * 0.7;
      const dx = Math.abs(X - waveX);
      if (z === 0) {
        if (dx <= 2.3) m.setRaw(x, y, z, mat('crack'), partId.crack);
        else if (dx <= 3.9) m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else if (z === 1) {
        if (dx > 2.2 && dx <= 3.6 && Math.abs(Y) <= 4.6) {
          m.setRaw(x, y, z, mat('rim'), partId.rim);
        }
      }
    });
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 2, centerZ: 1 });
  }

  // 深珊瑚紫红/暖绛红肉柱底座（10×10×10，半埋冰缝的短粗圆肉柱，带纵棱与顶领）
  function buildStalkBody(makeCanvas) {
    const m = new VoxelModel(10, 10, 10, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-4.5, 4.5, -4.5, 4.5, 0, 9, (x, y, z, X, Y) => {
      const t = z / 9;
      const ang = Math.atan2(Y, X);
      const rib = Math.cos(ang * 6) * 0.28;
      // 底座略粗稳扎冰缝，中腰微收，顶领微扩托起花冠
      const baseR = lerp(3.7, 3.0, Math.sin(t * Math.PI * 0.85)) + (t > 0.78 ? 0.45 : 0) + rib;
      const r = Math.hypot(X, Y);
      if (r <= baseR) {
        const isRidge = Math.cos(ang * 6) < -0.45 || z <= 1;
        const isCoreTop = z >= 8 && r <= 2.1;
        if (isCoreTop) {
          m.setRaw(x, y, z, mat('core'), partId.core);
        } else if (isRidge) {
          m.setRaw(x, y, z, mat('ridge'), partId.ridge);
        } else {
          m.setRaw(x, y, z, mat('stalk'), partId.stalk);
        }
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 9, centerZ: 4 });
  }

  // 全张开的亮青白/雪白细花触须冠（15×15×9，8 瓣放射外翻细触须 + 暖粉花芯）
  function buildCrownOpen(makeCanvas) {
    const m = new VoxelModel(15, 15, 9, SPEC);
    const { mat, partId } = SPEC;

    // 中央暖粉小口盘
    m.paintEllipsoid(0, 0, 2.2, 2.5, 2.5, 1.8, mat('core'), partId.core, true);

    // 8 根向外优雅舒展的亮青白/雪白细花触须
    const count = 8;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      const liftVar = (i % 2 === 0) ? 0.6 : -0.3;
      // 内段：亮青白主须
      m.paintCapsule(
        ca * 1.6, sa * 1.6, 2.2,
        ca * 4.4, sa * 4.4, 4.6 + liftVar,
        0.95, 0.78, mat('frond'), partId.frond, true
      );
      // 外段：雪白细尖微微上翘
      m.paintCapsule(
        ca * 4.4, sa * 4.4, 4.6 + liftVar,
        ca * 6.3, sa * 6.3, 6.2 + liftVar,
        0.74, 0.50, mat('tip'), partId.tip, true
      );
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.5, headZ: 8, centerZ: 4 });
  }

  // 半合拢过渡触须冠（11×11×9，缩回与探出时的自然过渡态）
  function buildCrownHalf(makeCanvas) {
    const m = new VoxelModel(11, 11, 9, SPEC);
    const { mat, partId } = SPEC;

    m.paintEllipsoid(0, 0, 2.0, 2.2, 2.2, 1.6, mat('core'), partId.core, true);
    const count = 8;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const ca = Math.cos(a), sa = Math.sin(a);
      m.paintCapsule(
        ca * 1.4, sa * 1.4, 2.0,
        ca * 3.1, sa * 3.1, 5.2,
        0.90, 0.72, mat('frond'), partId.frond, true
      );
      m.paintCapsule(
        ca * 3.1, sa * 3.1, 5.2,
        ca * 3.6, sa * 3.6, 7.6,
        0.68, 0.48, mat('tip'), partId.tip, true
      );
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 8, centerZ: 4 });
  }

  // 紧缩花苞触须头（8×8×7，急速缩回冰缝前的紧收态）
  function buildCrownClosed(makeCanvas) {
    const m = new VoxelModel(8, 8, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 2.2, 2.7, 2.7, 2.4, mat('stalk'), partId.stalk, true);
    m.paintEllipsoid(0, 0, 4.4, 2.0, 2.0, 1.8, mat('frond'), partId.frond, true);
    m.paintEllipsoid(0, 0, 5.8, 1.2, 1.2, 1.0, mat('tip'), partId.tip, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 2. 生物定义（海8 · 冰缝边的一排触须）
  // =========================================================================
  const POLYP_COUNT = 6;

  const Sea8Def = {
    id: 'sea8_ice_tentacles',
    code: '海8',
    name: '冰缝边的一排触须',
    status: 'done',
    tag: 'M10 固定成排海葵柱 · 多米诺缩回波',
    summary: '沿冰缝排成一列的 6 根共享资产肉柱：深珊瑚紫红/暖绛红肉柱底座反衬洁白冰面，顶上一圈张开的亮青白/雪白细花触须；平时依次随冰缝水流轻柔摇曳张开，受惊或周期性像多米诺骨牌一样从一端到另一端依次急速缩回冰缝，片刻后再逐根缓缓探出绽开',
    defaultHabitat: 'iceSea',
    footRadius: 0.5, // 由 footContacts 分别绘制 6 根肉柱的精准接地印
    ecoWeight: 0.85,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol',      name: '水流摇曳与多米诺缩回', loop: true, status: 'done' },
      { id: 'idle',        name: '全排绽开轻柔摇曳', loop: true, status: 'done' },
      { id: 'retractWave', name: '高频多米诺骨牌缩回演示', loop: true, status: 'done' }
    ],
    blocks: [
      '6 根共享资产肉柱沿冰缝成排布局',
      '深珊瑚紫红肉柱 + 亮青白雪白细花触须强对比',
      '三档无损触须冠换件（全开 / 半合 / 紧缩）',
      '双向交替多米诺骨牌急速缩回与逐根绽开波'
    ],
    soulHabit: '六根深绛红肉柱沿着极地冰缝排成一列，顶上雪白细花触须随水流轻柔摇曳；每隔片刻像一串开关被按下般从一端到另一端依次急速缩回冰缝，静伏片刻后再逐根缓缓探出绽开',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        iceCrack:    buildIceCrack(makeCanvas),
        stalkBody:   buildStalkBody(makeCanvas),
        crownOpen:   buildCrownOpen(makeCanvas),
        crownHalf:   buildCrownHalf(makeCanvas),
        crownClosed: buildCrownClosed(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.35;

      // 6 根独立驱动、共享资产的冰缝肉柱状态
      const polyps = Array.from({ length: POLYP_COUNT }, (_, idx) => ({
        idx,
        wx: hx0,
        wy: hy0,
        ext: 1.0,        // 1.0 = 全探出张开，0.0 = 缩进冰缝
        spring: new SpringDamper1D(1.0, 140, 12.0),
        wasRetracted: false,
        rippleDone: false
      }));

      const sockets = new SocketTracker();
      const footContacts = Array.from({ length: POLYP_COUNT }, () => ({ x: hx0, y: hy0, z: 0, r: 4.5 }));
      let curSkin = SKINS[0];

      const state = {
        x: hx0, y: hy0, z: 0,
        vx: 0, vy: 0, yaw: hyaw0,
        // 'open' | 'retracting' | 'hidden' | 'emerging'
        wavePhase: 'open',
        waveTimer: 0,
        waveDur: 4.2,
        waveDir: 1, // +1 从 0->5，-1 从 5->0，双向交替更有活物感
        simTime: 0,
        lastSpacing: 9.2
      };

      function layoutRow(sMul, boundR) {
        // 沿冰缝排成一列，微带自然弯曲，且两端绝对钳制在 boundR 内
        const idealSpan = (POLYP_COUNT - 1) * 9.2 * sMul;
        const maxSpan = Math.max(18.0, (boundR - 5.0 * sMul) * 1.9);
        const span = Math.min(idealSpan, maxSpan);
        const step = span / (POLYP_COUNT - 1);
        state.lastSpacing = step;

        for (let i = 0; i < POLYP_COUNT; i++) {
          const offset = (i - (POLYP_COUNT - 1) * 0.5) * step;
          // 轻微 S 弧冰缝走向，告别生硬直线
          const curveX = Math.sin((i / (POLYP_COUNT - 1)) * Math.PI) * 2.4 * sMul;
          let [px, py] = localToWorldXY(state.x, state.y, state.yaw, curveX, offset);
          const d = Math.hypot(px, py);
          if (d > boundR && d > 0.0001) {
            px *= boundR / d;
            py *= boundR / d;
          }
          polyps[i].wx = px;
          polyps[i].wy = py;
        }
      }

      const instance = {
        def: Sea8Def,
        cachePrefix: `sea8_tentacles_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 0;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.wavePhase = 'open';
          state.waveTimer = 0;
          state.waveDur = 3.8;
          state.waveDir = 1;
          for (const p of polyps) {
            p.ext = 1.0;
            p.spring.x = 1.0;
            p.spring.v = 0;
            p.wasRetracted = false;
            p.rippleDone = false;
          }
          layoutRow(1.0, 36.0);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          state.simTime = time;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const isIdle = action === 'idle';
          const isWaveDemo = action === 'retractWave';

          const rawMaxR = (eco && eco.maxRadius) || 46;
          const boundR = rawMaxR * 0.80;

          // 固定锚定在冰缝中心（确保整排两端都留足 boundR 空间）
          const hx = clamp((eco && eco.homeX) ?? 0, -boundR * 0.25, boundR * 0.25);
          const hy = clamp((eco && eco.homeY) ?? 0, -boundR * 0.25, boundR * 0.25);
          const hyaw = (eco && eco.homeYaw) ?? 0.35;
          state.x = lerp(state.x, hx, expSmooth(dt, 6.0));
          state.y = lerp(state.y, hy, expSmooth(dt, 6.0));
          state.yaw = hyaw;
          layoutRow(sMul, boundR);

          const fx = curSkin.fx || SKINS[0].fx;

          // -----------------------------------------------------------------
          // 状态机：open(水流摇曳) -> retracting(多米诺急速缩回) -> hidden -> emerging(逐根缓缓探出)
          // -----------------------------------------------------------------
          if (isIdle) {
            state.wavePhase = 'open';
            state.waveTimer = 0;
          } else {
            state.waveTimer += dt * clamp(spdMul, 0.6, 1.8);
            if (state.waveTimer >= state.waveDur) {
              state.waveTimer = 0;
              if (state.wavePhase === 'open') {
                state.wavePhase = 'retracting';
                state.waveDur = isWaveDemo ? 1.15 : 1.35;
                for (const p of polyps) p.rippleDone = false;
              } else if (state.wavePhase === 'retracting') {
                state.wavePhase = 'hidden';
                state.waveDur = isWaveDemo ? 0.85 : 1.55;
              } else if (state.wavePhase === 'hidden') {
                state.wavePhase = 'emerging';
                state.waveDur = isWaveDemo ? 1.65 : 2.25;
                for (const p of polyps) p.rippleDone = false;
              } else {
                state.wavePhase = 'open';
                state.waveDur = isWaveDemo ? 1.45 : 4.2;
                state.waveDir = -state.waveDir; // 下次从另一端触发多米诺
              }
            }
          }

          // 逐根计算目标伸展度（ext: 1.0 全张开 -> 0.0 缩回冰缝）
          for (let i = 0; i < POLYP_COUNT; i++) {
            const p = polyps[i];
            const order = state.waveDir > 0 ? i : (POLYP_COUNT - 1 - i);
            let targetExt = 1.0;
            let kSpring = 110 * sp;
            let dSpring = 12.0;

            if (state.wavePhase === 'open') {
              targetExt = 1.0;
            } else if (state.wavePhase === 'retracting') {
              // 多米诺骨牌：每根间隔 0.13s 依次急速缩回冰缝！
              const delay = order * 0.13;
              if (state.waveTimer >= delay) {
                targetExt = 0.0;
                kSpring = 260 * sp; // 急速缩回，干脆利落像开关被按下
                dSpring = 18.0;
                if (!p.rippleDone && vfx) {
                  p.rippleDone = true;
                  vfx.addRipple(p.wx, p.wy, 1.6 * sMul, 8.8 * sMul, 0.55, 1.4);
                  vfx.spawnParticle(
                    p.wx, p.wy, 3.2 * sMul,
                    (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, 7.5 * sMul,
                    0.42, 1.15, fx.foam, false, 24
                  );
                }
              }
            } else if (state.wavePhase === 'hidden') {
              targetExt = 0.0;
              kSpring = 180 * sp;
              dSpring = 15.0;
            } else if (state.wavePhase === 'emerging') {
              // 逐根缓缓探出绽开（比缩回柔和缓慢）
              const delay = order * 0.24;
              if (state.waveTimer >= delay) {
                targetExt = 1.0;
                kSpring = 52 * sp;
                dSpring = 8.8;
                if (!p.rippleDone && vfx) {
                  p.rippleDone = true;
                  vfx.addRipple(p.wx, p.wy, 1.2 * sMul, 6.5 * sMul, 0.45, 1.1);
                }
              } else {
                targetExt = 0.0;
              }
            }

            p.ext = clamp(p.spring.update(dt, targetExt, kSpring, dSpring), 0.0, 1.08);
            footContacts[i].x = p.wx;
            footContacts[i].y = p.wy;
            footContacts[i].z = 0;
            footContacts[i].r = lerp(2.8, 4.4, clamp(p.ext, 0, 1)) * sMul;
          }

          sockets.setWorld('center', state.x, state.y, 6.0 * sMul, state.yaw);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const tNow = state.simTime || 0;

          for (let i = 0; i < POLYP_COUNT; i++) {
            const p = polyps[i];
            const ext = clamp(p.ext, 0, 1.05);

            // 1. 贴地冰缝底座段（noOutline: true，整排拼成一道清晰深蓝冰缝）
            list.push({
              partKey: 'iceCrack',
              asset: parts.iceCrack,
              x: p.wx,
              y: p.wy,
              lift: 0,
              ro: yw,
              symDeg: 180,
              bias: -0.65,
              noOutline: true
            });

            // 随冰缝水流轻柔摇曳（相位沿整排顺次传递）
            const flowPhase = tNow * 2.1 + i * 0.72;
            const swayAmp = smoothstep(0.35, 1.0, ext);
            const swayLat = Math.sin(flowPhase) * 0.85 * swayAmp * sMul;
            const swayYaw = Math.cos(flowPhase * 0.85) * 0.24 * swayAmp;
            const [sx, sy] = localToWorldXY(p.wx, p.wy, yw, swayLat, 0);

            // 2. 深珊瑚紫红/暖绛红肉柱底座（缩回时沉入冰缝只露一丁点暗红顶圈）
            if (ext > 0.06) {
              const stalkLift = lerp(-3.2, 0.2, smoothstep(0.06, 0.85, ext)) * sMul;
              list.push({
                partKey: 'stalkBody',
                asset: parts.stalkBody,
                x: lerp(p.wx, sx, 0.45),
                y: lerp(p.wy, sy, 0.45),
                lift: Math.max(0, stalkLift),
                ro: wrapAngle(yw + i * 0.55 + swayYaw * 0.35),
                bias: 0.10 + i * 0.01
              });
            }

            // 3. 顶上亮青白/雪白细花触须冠（三档无损换件：全开 / 半合 / 紧缩，零拉伸！）
            if (ext > 0.14) {
              let crownKey = 'crownOpen';
              if (ext < 0.42) crownKey = 'crownClosed';
              else if (ext < 0.76) crownKey = 'crownHalf';

              const crownLift = lerp(1.0, 7.6, smoothstep(0.14, 0.96, ext)) * sMul;
              list.push({
                partKey: crownKey,
                asset: parts[crownKey],
                x: sx,
                y: sy,
                lift: Math.max(0.2, crownLift),
                ro: wrapAngle(yw + i * 0.48 + swayYaw),
                bias: 0.45 + i * 0.01
              });
            }
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sea8Def.id,
            code: Sea8Def.code,
            name: Sea8Def.name,
            status: Sea8Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            polypCount: POLYP_COUNT,
            footRadius: 24.0,
            headZ: 16,
            centerZ: 7,
            blocks: Sea8Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sea8Def);
})(window.PixelWorkshop);
