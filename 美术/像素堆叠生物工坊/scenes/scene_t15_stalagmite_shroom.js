'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T15 · 溶洞石笋群与自亮青菇簇（scenes/scene_t15_stalagmite_shroom.js）
  // -------------------------------------------------------------------------
  // 呼应 T15（地下暗河溶洞）生态规矩：无日头、石笋掉碎屑、暗河与腐菌蘑菇。
  // 拆件与图集预算（单盒严格 <= 34 格，仅菌褶/伞心亮核 2 键进 glowKeys）：
  //   1. baseRock   (28×26×8)             : 湿滑青灰溶洞岩基座 + 浅蓝灰湿润水沿
  //   2. stalagTall (14×14×34)            : 主高石笋（碳酸钙竖棱湿纹 + 浅蓝灰顶切面）
  //   3. stalagMid  (12×12×24)            : 中等侧石笋（略倾错落 + 碳酸钙湿纹）
  //   4. stalagLow  (10×10×16)            : 矮粗副石笋（基部钙化湿面）
  //   5. shroomCap  (10×10×9, symDeg: 90) : 肥厚伞盖亮青碧溶洞菌菇簇（复用 4 簇绕基部）
  //   6. shroomGlow (8×8×6,   symDeg: 90) : 菌褶与伞心自亮核（独立控 opacity 实现呼吸）
  // 严禁常态 scaleX/scaleY 拉伸；20 色 0 重色 0 禁用字
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 深青灰湿滑溶洞岩身（3 档）
      rockDark:       '#2b3447',
      rockMid:        '#44526e',
      rockHi:         '#6a7da1',
      // 碳酸钙竖棱与顶缘明晰浅蓝灰湿润切面（3 档，强对比防糊）
      calcDark:       '#627694',
      calcMid:        '#8da6c7',
      calcHi:         '#c2daf5',
      // 湿润水渍与基部暗河沿（3 档）
      wetDark:        '#1d2c42',
      wetMid:         '#2f4b6e',
      wetHi:          '#5985b3',
      // 菌菇肥厚伞盖外皮（3 档，高饱和亮青碧提亮暗洞）
      capDark:        '#176b6b',
      capMid:         '#28b3ad',
      capHi:          '#66ebe0',
      // 菌菇粗白青菌柄（3 档）
      stemDark:       '#5d7a7d',
      stemMid:        '#94b8ba',
      stemHi:         '#d0ebe8',
      // 钙石碎屑与浅苔点（3 档）
      crumbDark:      '#727e8c',
      crumbMid:       '#a3b0bf',
      crumbHi:        '#dae4f0',
      // 仅菌褶/伞心亮核进 glowKeys（2 键）
      shroomGlowMid:  '#42f2df',
      shroomGlowCore: '#d4fff9'
    },
    glowKeys: ['shroomGlowMid', 'shroomGlowCore'],
    parts: ['rock', 'calc', 'wet', 'cap', 'stem', 'crumb', 'shroomGlow'],
    noCrease: [
      ['rock', 'calc'],
      ['rock', 'wet'],
      ['cap', 'stem'],
      ['cap', 'shroomGlow'],
      ['stem', 'shroomGlow'],
      ['rock', 'crumb']
    ],
    materials: {
      rock:  ['rockDark',  'rockMid',  'rockHi'],
      calc:  ['calcDark',  'calcMid',  'calcHi'],
      wet:   ['wetDark',   'wetMid',   'wetHi'],
      cap:   ['capDark',   'capMid',   'capHi'],
      stem:  ['stemDark',  'stemMid',  'stemHi'],
      crumb: ['crumbDark', 'crumbMid', 'crumbHi']
    },
    protectedParts: ['shroomGlow', 'cap']
  });

  // 3 套换色皮肤（每套 20 色 0 重色 0 禁用字）
  const SKINS = [
    {
      id: 'cyan_shroom_stalag',
      name: '青碧菌笋',
      dot: '#28b3ad',
      outline: '#0c121c',
      pal: {},
      fx: {
        drop:   '#8ce0ff',
        sporeA: '#42f2df',
        sporeB: '#c4fff7',
        debris: '#c6d4e6'
      }
    },
    {
      id: 'indigo_crystal_shroom',
      name: '靛紫晶菇',
      dot: '#8f6bf0',
      outline: '#110d1f',
      pal: {
        rockDark:       '#2a2642', rockMid:  '#46406b', rockHi:  '#6f689e',
        calcDark:       '#6b6491', calcMid:  '#9890c4', calcHi:  '#cdc7f2',
        wetDark:        '#1d2140', wetMid:   '#323b6e', wetHi:   '#5e6cb0',
        capDark:        '#4a2b87', capMid:   '#7e52d6', capHi:   '#ba94ff',
        stemDark:       '#696285', stemMid:  '#a199bf', stemHi:  '#dcd6f0',
        crumbDark:      '#74708a', crumbMid: '#a7a2bd', crumbHi: '#dbd7eb',
        shroomGlowMid:  '#a678ff', shroomGlowCore: '#ece0ff'
      },
      fx: {
        drop:   '#a8c4ff',
        sporeA: '#a678ff',
        sporeB: '#e6d4ff',
        debris: '#d0cce6'
      }
    },
    {
      id: 'warm_gold_moss_stalag',
      name: '暖金苔笋',
      dot: '#e0a938',
      outline: '#17140d',
      pal: {
        rockDark:       '#38342d', rockMid:  '#595247', rockHi:  '#857c6c',
        calcDark:       '#78705e', calcMid:  '#ada38c', calcHi:  '#e0d7c3',
        wetDark:        '#243330', wetMid:   '#3b5751', wetHi:   '#68948a',
        capDark:        '#8c5a18', capMid:   '#d69429', capHi:   '#ffd266',
        stemDark:       '#786e5a', stemMid:  '#b0a489', stemHi:  '#e8dec8',
        crumbDark:      '#7d776a', crumbMid: '#b0a997', crumbHi: '#e3ddd0',
        shroomGlowMid:  '#ffbd42', shroomGlowCore: '#fff2ba'
      },
      fx: {
        drop:   '#9ee0d8',
        sporeA: '#ffbd42',
        sporeB: '#fff0b0',
        debris: '#ded6c5'
      }
    }
  ];

  // 1. 湿润溶洞岩基座（28×26×8）
  function buildBaseRock(makeCanvas) {
    const m = new VoxelModel(28, 26, 8, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-13, 13, -12, 12, 0, 7, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const lobe = Math.sin(ang * 3 + 0.6) * 1.4 + Math.cos(ang * 5 - 0.4) * 0.9;
      const t = z / 7;
      const rx = 11.4 - t * 2.2 + lobe * 0.65;
      const ry = 10.2 - t * 2.0 + lobe * 0.55;
      const d = Math.hypot(X / rx, Y / ry);
      if (d > 1.0) return;

      // 岩台顶部边缘留明晰湿润浅蓝灰钙化边，局部带浅水洼反色
      if (z >= 6 && d > 0.68 && d < 0.92) {
        m.setRaw(x, y, z, mat('calc'), partId.calc);
      } else if (z <= 2 && d > 0.78) {
        m.setRaw(x, y, z, mat('wet'), partId.wet);
      } else if (z === 7 && Math.hypot(X - 3.5, Y - 3.2) < 3.4) {
        m.setRaw(x, y, z, mat('wet'), partId.wet);
      } else {
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      }
    });

    // 岩基边散落几块浅灰钙石小碎块
    m.paintEllipsoid(8.2, 5.4, 2.2, 1.9, 1.5, 1.2, mat('crumb'), partId.crumb, true);
    m.paintEllipsoid(-8.5, 4.6, 2.0, 1.6, 1.4, 1.1, mat('crumb'), partId.crumb, true);
    m.paintEllipsoid(2.2, -8.4, 2.1, 1.8, 1.3, 1.0, mat('crumb'), partId.crumb, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 13.0, headZ: 8, centerZ: 3 });
  }

  // 2. 通用圆锥石笋构建器（碳酸钙竖棱湿纹 + 明晰浅蓝灰顶切面）
  function buildStalagmite(makeCanvas, W, D, H, baseR, leanX, leanY, ridgeCount) {
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-(W >> 1), (W >> 1), -(D >> 1), (D >> 1), 0, H - 1, (x, y, z, X, Y) => {
      const t = z / Math.max(1, H - 1);
      const cx = leanX * t * t;
      const cy = leanY * t * t;
      const dx = X - cx;
      const dy = Y - cy;
      const ang = Math.atan2(dy, dx);

      // 碳酸钙竖棱 + 阶梯式水滴钙化环
      const flute = Math.sin(ang * ridgeCount + t * 1.4) * 0.55 * (1 - t * 0.55);
      const stepRing = Math.sin(t * Math.PI * 5) * 0.25 * (1 - t * 0.5);
      const r = lerp(baseR, 0.95, Math.pow(t, 0.88)) + flute + stepRing;
      const dist = Math.hypot(dx, dy);
      if (dist > r) return;

      // 顶缘留明晰浅蓝灰湿润切面 + 竖棱外脊亮钙纹
      const isTopWet = (t >= 0.78) || (t >= 0.62 && dx - dy > -0.4);
      const isRidge = (flute > 0.26 && dist > r - 1.15);
      const isWetStreak = (z < H * 0.32 && dist > r - 0.9 && Math.sin(ang * 3) > 0.35);

      if (isTopWet || isRidge) {
        m.setRaw(x, y, z, mat('calc'), partId.calc);
      } else if (isWetStreak) {
        m.setRaw(x, y, z, mat('wet'), partId.wet);
      } else {
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: baseR + 1.0, headZ: H, centerZ: H * 0.45 });
  }

  // 3. 肥厚伞盖亮青碧溶洞菌菇簇（10×10×9，symDeg: 90，不含 glowKeys）
  function buildShroomCap(makeCanvas) {
    const m = new VoxelModel(10, 10, 9, SPEC);
    const { mat, partId } = SPEC;

    // 主大蘑菇（居中）+ 2 朵饱满小侧菇
    // 主菇柄
    m.paintCapsule(0, 0, 0.5, 0, 0, 5.2, 1.35, 1.05, mat('stem'), partId.stem, true);
    // 主菇肥厚圆顶伞盖（底部留凹槽给自亮菌褶核）
    m.fillAABB(-4, 4, -4, 4, 4, 8, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 3.6, Y / 3.6);
      const dz = (z - 5.2) / 3.0;
      if (d * d + dz * dz <= 1.0 && z >= 5) {
        m.setRaw(x, y, z, mat('cap'), partId.cap);
      }
    });

    // 侧小菇 1
    m.paintCapsule(2.6, 1.8, 0.4, 2.8, 2.0, 3.2, 0.85, 0.72, mat('stem'), partId.stem, true);
    m.paintEllipsoid(2.8, 2.0, 3.7, 2.0, 2.0, 1.25, mat('cap'), partId.cap, true);

    // 侧小菇 2
    m.paintCapsule(-2.4, -2.0, 0.4, -2.6, -2.2, 2.8, 0.8, 0.68, mat('stem'), partId.stem, true);
    m.paintEllipsoid(-2.6, -2.2, 3.3, 1.85, 1.85, 1.15, mat('cap'), partId.cap, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 9, centerZ: 4.5 });
  }

  // 4. 菌褶与伞心自亮核（8×8×6，symDeg: 90，仅此件进 glowKeys）
  function buildShroomGlow(makeCanvas) {
    const m = new VoxelModel(8, 8, 6, SPEC);
    const { keyToId, partId } = SPEC;

    // 伞底菌褶自亮环 + 伞心小亮核（俯视与斜视均清晰可辨）
    m.fillAABB(-3, 3, -3, 3, 0, 5, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      // 伞底菌褶自亮圈（z = 1..2）
      if ((z === 1 || z === 2) && r >= 1.1 && r <= 3.0) {
        m.setRaw(x, y, z, r <= 2.1 ? keyToId.shroomGlowCore : keyToId.shroomGlowMid, partId.shroomGlow);
      }
      // 伞顶中心小亮斑（z = 5, 俯视一眼提亮暗洞）
      if (z === 5 && r <= 1.5) {
        m.setRaw(x, y, z, r <= 0.85 ? keyToId.shroomGlowCore : keyToId.shroomGlowMid, partId.shroomGlow);
      }
    });

    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 6, centerZ: 3 });
  }

  // 局部布局：3 根高低错落石笋 + 4 簇绕基部青菇
  const STALAGS = [
    { key: 'tall', lx: -2.4, ly: -2.2, lift: 4.5, ro:  0.15, tipZ: 38.0 },
    { key: 'mid',  lx:  5.6, ly: -1.4, lift: 4.0, ro: -0.42, tipZ: 27.5 },
    { key: 'low',  lx: -5.8, ly:  4.2, lift: 3.5, ro:  0.85, tipZ: 19.0 }
  ];

  const SHROOMS = [
    { lx:  2.2, ly:  6.4, lift: 4.2, ro:  0.25, phase: 0.0 },
    { lx:  8.4, ly:  3.2, lift: 3.2, ro:  1.45, phase: 1.5 },
    { lx: -8.6, ly: -1.8, lift: 3.4, ro:  2.75, phase: 3.1 },
    { lx:  0.4, ly: -7.8, lift: 3.6, ro:  4.20, phase: 4.6 }
  ];

  const Def = {
    id: 'scene_t15_stalagmite_shroom',
    code: 'T15',
    name: '溶洞石笋群与自亮青菇',
    status: 'done',
    defaultHabitat: 'cave',
    tag: 'T15 地下暗河溶洞 · 溶洞石笋群与自亮青菇',
    summary: '3 根高低错落的湿滑青灰碳酸钙石笋（顶缘浅蓝灰湿润切面），基部环绕 4 簇肥厚亮青碧自亮溶洞菌菇（洞3/洞4 主食）；支持滴水涟漪待机与模拟震落碎屑演出及 3 套换色皮肤',
    footRadius: 14.5,
    ecoWeight: 3.2,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',         name: '滴水涟漪与青菇呼吸', loop: true,  status: 'done' },
      { id: 'shake_debris', name: '石笋震落钙屑与菌孢', loop: false, duration: 2.2, status: 'done' }
    ],
    blocks: [
      '3 根粗细高矮错落的碳酸钙竖棱石笋',
      '浅蓝灰湿润顶切面提亮深暗溶洞地台',
      '4 簇复用肥厚亮青碧菌菇（仅菌褶/伞心亮核进 glowKeys）',
      '笋尖周期滴水激起涟漪 + 震落钙石碎屑与菌孢'
    ],
    soulHabit: '常态下主石笋尖规律滴落水珠激起清亮水涟漪、基部青菇缓缓微亮呼吸；受到震动时石笋高频轻震，从顶部抖落灰白钙石碎屑粒并扬起亮青色菌孢',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        baseRock:   buildBaseRock(makeCanvas),
        stalagTall: buildStalagmite(makeCanvas, 14, 14, 34, 5.4,  1.2, -0.8, 6),
        stalagMid:  buildStalagmite(makeCanvas, 12, 12, 24, 4.5, -1.0,  0.9, 5),
        stalagLow:  buildStalagmite(makeCanvas, 10, 10, 16, 3.8, -0.6, -0.7, 5),
        shroomCap:  buildShroomCap(makeCanvas),
        shroomGlow: buildShroomGlow(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0.2,
        shakeX: 0,
        shakeY: 0,
        dripCd: 0.7,
        splashDelay: -1,
        splashX: 0,
        splashY: 0,
        lastAction: 'idle',
        shakeBurstDone: 0,
        glowBreath: 0.78
      };

      let curSkin = SKINS[0];

      const instance = {
        def: Def,
        parts,
        partListAssets: Object.values(parts),
        state,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(x, y, yaw) {
          state.x = x;
          state.y = y;
          state.z = 0;
          state.yaw = yaw;
          state.shakeX = 0;
          state.shakeY = 0;
          state.dripCd = 0.7;
          state.splashDelay = -1;
          state.lastAction = 'idle';
          state.shakeBurstDone = 0;
          state.glowBreath = 0.78;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.shakeBurstDone = 0;
          }

          state.shakeX = 0;
          state.shakeY = 0;
          state.glowBreath = 0.58 + (0.5 + 0.5 * Math.sin(time * 2.1 * freq)) * 0.42;

          // 处理延迟落地水珠的涟漪与水花
          if (state.splashDelay > 0) {
            state.splashDelay -= dt;
            if (state.splashDelay <= 0 && vfx) {
              vfx.addRipple(state.splashX, state.splashY, 1.2 * sMul, 11.5 * sMul, 0.78, 1.5);
              for (let k = 0; k < 3; k++) {
                const a = (k / 3) * TAU + Math.random() * 0.8;
                vfx.spawnParticle(
                  state.splashX, state.splashY, 2.2 * sMul,
                  Math.cos(a) * 3.5 * sMul, Math.sin(a) * 3.5 * sMul, 6.0 * sMul,
                  0.38, 1.05, fx.drop, false, 34
                );
              }
            }
          }

          if (action === 'idle') {
            // 主石笋尖定时滴落水珠
            state.dripCd -= dt;
            if (state.dripCd <= 0 && vfx) {
              state.dripCd = (1.55 + Math.random() * 0.65) / freq;
              const useTall = Math.random() > 0.35;
              const src = useTall ? STALAGS[0] : STALAGS[1];
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, (src.lx + (useTall ? 1.0 : -0.8)) * sMul, (src.ly + 0.4) * sMul);
              vfx.spawnParticle(
                wx, wy, src.tipZ * sMul,
                0, 0, -2.0 * sMul,
                0.55, 1.25, fx.drop, true, 52
              );
              state.splashX = wx;
              state.splashY = wy;
              state.splashDelay = 0.50;
            }
          } else if (action === 'shake_debris') {
            const u = clamp(actionTime / 2.2, 0, 1);
            // 0~0.55 阶段高频轻震（严格位移，零缩放）
            const amp = Math.sin(clamp(u / 0.55, 0, 1) * Math.PI) * 0.48 * sMul;
            state.shakeX = Math.sin(time * 48.0 * freq) * amp;
            state.shakeY = Math.cos(time * 39.0 * freq) * amp * 0.7;
            state.glowBreath = clamp(0.70 + Math.sin(u * Math.PI) * 0.30, 0.55, 1.0);

            // 分两批从石笋顶部抖落钙石碎屑与青色菌孢
            if (state.shakeBurstDone === 0 && actionTime >= 0.14 && vfx) {
              state.shakeBurstDone = 1;
              for (let i = 0; i < 2; i++) {
                const src = STALAGS[i];
                const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, src.lx * sMul, src.ly * sMul);
                for (let k = 0; k < 5; k++) {
                  const a = (k / 5) * TAU + Math.random() * 0.6;
                  const sp = (4.0 + Math.random() * 6.5) * sMul;
                  vfx.spawnParticle(
                    sx + Math.cos(a) * 1.6 * sMul,
                    sy + Math.sin(a) * 1.6 * sMul,
                    (src.tipZ - 2.0 - Math.random() * 6.0) * sMul,
                    Math.cos(a) * sp, Math.sin(a) * sp, (2.5 + Math.random() * 4.5) * sMul,
                    0.85 + Math.random() * 0.35,
                    1.5 + Math.random() * 0.55,
                    fx.debris,
                    false,
                    48
                  );
                }
              }
            }

            if (state.shakeBurstDone === 1 && actionTime >= 0.45 && vfx) {
              state.shakeBurstDone = 2;
              vfx.addRipple(state.x, state.y, 4.0 * sMul, 18.0 * sMul, 0.9, 1.8);
              // 基部青菇受震抖出一圈青色自亮菌孢缓缓升起
              for (let i = 0; i < SHROOMS.length; i++) {
                const sh = SHROOMS[i];
                const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, sh.lx * sMul, sh.ly * sMul);
                for (let k = 0; k < 3; k++) {
                  const a = Math.random() * TAU;
                  vfx.spawnParticle(
                    mx + Math.cos(a) * 2.0 * sMul,
                    my + Math.sin(a) * 2.0 * sMul,
                    9.0 * sMul,
                    Math.cos(a) * 2.6 * sMul, Math.sin(a) * 2.6 * sMul, (6.5 + Math.random() * 4.5) * sMul,
                    1.25 + Math.random() * 0.4,
                    1.25 + Math.random() * 0.3,
                    k % 2 === 0 ? fx.sporeA : fx.sporeB,
                    true,
                    -1.6
                  );
                }
              }
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const list = [];

          // 1. 湿润溶洞岩基座
          list.push({
            partKey: 'baseRock',
            asset: parts.baseRock,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            bias: -0.35
          });

          // 2. 三根高低错落石笋
          const assetMap = {
            tall: parts.stalagTall,
            mid:  parts.stalagMid,
            low:  parts.stalagLow
          };
          for (let i = 0; i < STALAGS.length; i++) {
            const st = STALAGS[i];
            const shakeScale = i === 0 ? 1.0 : (i === 1 ? 0.75 : 0.5);
            const [sx, sy] = localToWorldXY(
              state.x, state.y, yw,
              st.lx * sMul + state.shakeX * shakeScale,
              st.ly * sMul + state.shakeY * shakeScale
            );
            list.push({
              partKey: `stalag_${st.key}`,
              asset: assetMap[st.key],
              x: sx,
              y: sy,
              lift: st.lift * sMul,
              ro: wrapAngle(yw + st.ro),
              bias: i === 0 ? 0.05 : -0.05
            });
          }

          // 3. 绕基部 4 簇复用肥厚亮青碧菌菇 + 独立自亮核
          for (let i = 0; i < SHROOMS.length; i++) {
            const sh = SHROOMS[i];
            const [mx, my] = localToWorldXY(state.x, state.y, yw, sh.lx * sMul, sh.ly * sMul);
            const rAng = wrapAngle(yw + sh.ro);
            list.push({
              partKey: `shroomCap_${i}`,
              asset: parts.shroomCap,
              x: mx,
              y: my,
              lift: sh.lift * sMul,
              ro: rAng,
              symDeg: 90,
              bias: 0.15
            });
            const localOp = clamp(state.glowBreath - 0.12 + 0.12 * Math.sin(sh.phase + state.glowBreath * 4.0), 0.45, 1.0);
            list.push({
              partKey: `shroomGlow_${i}`,
              asset: parts.shroomGlow,
              x: mx,
              y: my,
              lift: (sh.lift + 3.2) * sMul,
              ro: rAng,
              symDeg: 90,
              opacity: localOp,
              bias: 0.32
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id,
            code: Def.code,
            name: Def.name,
            status: Def.status,
            skin: curSkin.id,
            footRadius: Def.footRadius,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(Def, 'scene');
})(window.PixelWorkshop);
