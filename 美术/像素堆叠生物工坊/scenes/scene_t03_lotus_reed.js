'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T03 河湖深潭 · 深潭巨叶睡莲与水草丛（scenes/scene_t03_lotus_reed.js）
  //
  // 拆件与图集预算（单盒严格 <= 40 格，0 自亮键，0 常态拉伸）：
  //   - lotusLeafLarge (26×26×4, 复用 2 片) ：宽厚带缺口饱和翠绿大莲叶 + 叶脉 + 细水珠
  //   - lotusLeafSmall (18×18×4, 复用 2 片) ：偏小带缺口翠绿浮叶 + 卷边水珠
  //   - lotusFlower    (14×14×10, symDeg:90)：中央粉白重瓣大睡莲 + 饱满金黄花蕊
  //   - waterReed      (10×10×14, 复用 4 丛)：水下长摇曳深潭水草（submerge: 0.65 染进潭水）
  //
  // 展示动作：
  //   - idle       ：莲叶随水波极其柔和地错相起伏、水草缓摆，偶泛轻涟漪
  //   - ripple_bob ：大鱼游过般激起连串水面涟漪，睡莲叶上下轻荡、叶心水珠滚落溅起小水花
  // =========================================================================

  // 21 色独立色表（严守 <= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 饱和翠绿大莲叶面（3 档）
      padDark:   '#145c32',
      padMid:    '#25994d',
      padHi:     '#57cf6b',
      // 莲叶卷边与叶脉（3 档）
      veinDark:  '#1d753b',
      veinMid:   '#3db858',
      veinHi:    '#82e87d',
      // 粉白睡莲外瓣（3 档）
      petalDark: '#c45e80',
      petalMid:  '#f29cb8',
      petalHi:   '#ffe6ef',
      // 内层柔白花瓣（3 档）
      innerDark: '#d998ad',
      innerMid:  '#f7cedb',
      innerHi:   '#fff7fa',
      // 饱满金黄花蕊（3 档）
      stamenDark:'#b87714',
      stamenMid: '#f2b824',
      stamenHi:  '#ffeb78',
      // 水下深潭长水草（3 档，配合 submerge: 0.65 染入深碧潭水）
      reedDark:  '#11473c',
      reedMid:   '#1e7a62',
      reedHi:    '#43ad86',
      // 叶缘滚圆细水珠（3 档，不进 glowKeys）
      dewDark:   '#72b8cc',
      dewMid:    '#b3e4f2',
      dewHi:     '#eefcff'
    },
    glowKeys: [],
    parts: ['pad', 'vein', 'petal', 'inner', 'stamen', 'reed', 'dew'],
    noCrease: [
      ['pad', 'vein'],
      ['pad', 'dew'],
      ['petal', 'inner'],
      ['inner', 'stamen']
    ],
    materials: {
      pad:    ['padDark',    'padMid',    'padHi'],
      vein:   ['veinDark',   'veinMid',   'veinHi'],
      petal:  ['petalDark',  'petalMid',  'petalHi'],
      inner:  ['innerDark',  'innerMid',  'innerHi'],
      stamen: ['stamenDark', 'stamenMid', 'stamenHi'],
      reed:   ['reedDark',   'reedMid',   'reedHi'],
      dew:    ['dewDark',    'dewMid',    'dewHi']
    },
    protectedParts: ['stamen', 'dew']
  });

  // 3 套零重建模换色皮肤（粉莲翠叶 / 鹅黄睡莲 / 秋红残荷）
  const SKINS = [
    {
      id: 'pink_emerald',
      name: '粉莲翠叶',
      dot: '#f29cb8',
      outline: '#0b1c17',
      pal: {},
      fx: {
        dropA: '#c4f1f8',
        dropB: '#eefcff',
        petal: '#f29cb8'
      }
    },
    {
      id: 'buttercup_lotus',
      name: '鹅黄睡莲',
      dot: '#f7d659',
      outline: '#0d1c15',
      pal: {
        padDark:    '#12543a', padMid:    '#1f8a5c', padHi:    '#4ec484',
        veinDark:   '#1a6b48', veinMid:   '#35a870', veinHi:   '#75de9f',
        petalDark:  '#c7921e', petalMid:  '#f5cc4c', petalHi:  '#fff29c',
        innerDark:  '#dbb539', innerMid:  '#fae37a', innerHi:  '#fffbd1',
        stamenDark: '#b34b14', stamenMid: '#eb7d23', stamenHi: '#ffba52'
      },
      fx: {
        dropA: '#c4f1f8',
        dropB: '#eefcff',
        petal: '#f5cc4c'
      }
    },
    {
      id: 'autumn_crimson',
      name: '秋红残荷',
      dot: '#cf5736',
      outline: '#1a110e',
      pal: {
        padDark:    '#5e291d', padMid:    '#9c472c', padHi:    '#d47b46',
        veinDark:   '#783c1f', veinMid:   '#ba6832', veinHi:   '#ebb05b',
        petalDark:  '#a83d46', petalMid:  '#de787e', petalHi:  '#f7cfd1',
        innerDark:  '#bf6b6e', innerMid:  '#ebaaab', innerHi:  '#fce8e6',
        stamenDark: '#9e5811', stamenMid: '#db8c21', stamenHi: '#ffd063',
        reedDark:   '#3b4722', reedMid:   '#627532', reedHi:   '#94ab4f'
      },
      fx: {
        dropA: '#c4f1f8',
        dropB: '#eefcff',
        petal: '#de787e'
      }
    }
  ];

  // =========================================================================
  // 1. 宽厚带缺口大莲叶（26×26×4，复用 2 片）
  // =========================================================================
  function buildLotusLeaf(makeCanvas, size, radius, withDew) {
    const m = new VoxelModel(size, size, 4, SPEC);
    const { mat, partId } = SPEC;
    const h = Math.floor(size * 0.5);

    m.fillAABB(-h, h, -h, h, 0, 3, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      // 经典睡莲 V 形缺口（朝向 +X 方向）
      if (Math.abs(ang) < 0.24 && r > 1.4) return;

      const rimWave = radius + Math.sin(ang * 7) * 0.45 + Math.cos(ang * 4) * 0.35;
      if (r > rimWave) return;

      // 底层压实入水厚度（z = 0..1），外缘微微上翘成浅盘（z = 2）
      const isEdge = r > rimWave - 1.75;
      if (z === 0 && r <= rimWave - 0.5) {
        m.setRaw(x, y, z, mat('pad'), partId.pad);
      } else if (z === 1) {
        // 放射状叶脉纹理
        const spoke = Math.abs(Math.sin(ang * 6));
        const isVein = (spoke < 0.14 && r > 1.5 && r < rimWave - 1.2) || r < 1.8;
        m.setRaw(x, y, z, isVein ? mat('vein') : mat('pad'), isVein ? partId.vein : partId.pad);
      } else if (z === 2 && isEdge) {
        m.setRaw(x, y, z, mat('vein'), partId.vein);
      }
    });

    // 叶面点缀 2~3 颗醒目滚圆小水珠（不进 glowKeys）
    if (withDew) {
      m.paintEllipsoid(-radius * 0.38, -radius * 0.26, 2.2, 1.35, 1.35, 0.95, mat('dew'), partId.dew, true);
      m.paintEllipsoid( radius * 0.16,  radius * 0.44, 2.2, 1.15, 1.15, 0.85, mat('dew'), partId.dew, true);
    } else {
      m.paintEllipsoid(-radius * 0.32,  radius * 0.28, 2.2, 1.15, 1.15, 0.85, mat('dew'), partId.dew, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: radius, headZ: 4, centerZ: 1.5 });
  }

  // =========================================================================
  // 2. 中央粉白金蕊大睡莲（14×14×10，四重对称 symDeg: 90）
  // =========================================================================
  function buildLotusFlower(makeCanvas) {
    const m = new VoxelModel(14, 14, 10, SPEC);
    const { mat, partId } = SPEC;

    // 托底绿萼片
    m.paintEllipsoid(0, 0, 1.0, 4.2, 4.2, 1.1, mat('pad'), partId.pad, true);

    // 外层 8 片舒展粉白大花瓣（四重对称）
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * TAU;
      const sx = Math.cos(ang) * 1.8;
      const sy = Math.sin(ang) * 1.8;
      const ex = Math.cos(ang) * 5.4;
      const ey = Math.sin(ang) * 5.4;
      m.paintCapsule(sx, sy, 2.0, ex, ey, 4.2, 1.55, 0.85, mat('petal'), partId.petal, true);
    }

    // 中层 4 片微翘柔白内瓣
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU + Math.PI * 0.25;
      const sx = Math.cos(ang) * 1.2;
      const sy = Math.sin(ang) * 1.2;
      const ex = Math.cos(ang) * 3.6;
      const ey = Math.sin(ang) * 3.6;
      m.paintCapsule(sx, sy, 3.0, ex, ey, 6.6, 1.35, 0.78, mat('inner'), partId.inner, true);
    }

    // 内层 4 片高挺花心瓣
    for (let i = 0; i < 4; i++) {
      const ang = (i / 4) * TAU;
      const ex = Math.cos(ang) * 2.2;
      const ey = Math.sin(ang) * 2.2;
      m.paintCapsule(0, 0, 3.8, ex, ey, 7.6, 1.1, 0.65, mat('inner'), partId.inner, true);
    }

    // 中央饱满金黄花蕊
    m.paintEllipsoid(0, 0, 5.4, 2.0, 2.0, 2.2, mat('stamen'), partId.stamen, true);
    m.paintEllipsoid(0, 0, 7.2, 1.2, 1.2, 1.0, mat('stamen'), partId.stamen, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.8, headZ: 9, centerZ: 4.5 });
  }

  // =========================================================================
  // 3. 水下长摇曳深潭水草（10×10×14，复用 4 丛，配合 submerge: 0.65）
  // =========================================================================
  function buildWaterReed(makeCanvas) {
    const m = new VoxelModel(10, 10, 14, SPEC);
    const { mat, partId } = SPEC;

    // 3 根交错弯曲的带状水草长叶（从水底伸向水面）
    const blades = [
      [0.0,  0.0, 0.5,  2.6,  1.4, 12.2, 1.05, 0.55],
      [-0.8, 0.6, 0.5, -3.0,  2.2, 10.6, 0.95, 0.52],
      [0.8, -0.6, 0.5,  1.8, -3.1,  9.4, 0.95, 0.50]
    ];
    for (const [ax, ay, az, bx, by, bz, r0, r1] of blades) {
      const mx = (ax + bx) * 0.5 + (by - ay) * 0.18;
      const my = (ay + by) * 0.5 - (bx - ax) * 0.18;
      const mz = (az + bz) * 0.55;
      m.paintCapsule(ax, ay, az, mx, my, mz, r0, (r0 + r1) * 0.52, mat('reed'), partId.reed, true);
      m.paintCapsule(mx, my, mz, bx, by, bz, (r0 + r1) * 0.52, r1, mat('reed'), partId.reed, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: 13, centerZ: 6 });
  }

  // 4 片大小错落浮叶布局（复用 2 套圆莲叶资产）
  const PAD_LAYOUT = [
    { key: 'lotusLeafLarge', lx: -2.2, ly:  0.8, ro:  0.42, phase: 0.0,  bias: 0.05 },
    { key: 'lotusLeafLarge', lx: 11.4, ly: -6.2, ro:  2.35, phase: 1.5,  bias: -0.05 },
    { key: 'lotusLeafSmall', lx: -13.6,ly: -8.0, ro: -1.25, phase: 2.8,  bias: -0.08 },
    { key: 'lotusLeafSmall', lx:  8.8, ly: 10.6, ro:  1.15, phase: 4.1,  bias: 0.12 }
  ];

  // 4 丛水下摇曳水草布局（submerge: 0.65 自然染入深碧潭水）
  const REED_LAYOUT = [
    { lx: -15.5, ly:  5.8, ro: 0.3, phase: 0.2 },
    { lx:  15.8, ly:  3.2, ro: 1.8, phase: 1.7 },
    { lx:  -5.4, ly:-14.6, ro: 3.1, phase: 3.0 },
    { lx:   5.2, ly: 14.8, ro: 4.6, phase: 4.4 }
  ];

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t03_lotus_reed',
    code: 'T03',
    name: '深潭巨叶睡莲与水草丛',
    status: 'done',
    defaultHabitat: 'river',
    tag: 'T03 河湖深潭浮叶植物与水草食物源',
    summary: '4 片大小错落的带缺口翠绿大莲叶浮于深潭水面，中央盛放粉白金蕊大睡莲，四周水下隐约摇曳带 submerge 染水色的长水草，叶缘挂着细水珠',
    footRadius: 20.0,
    ecoWeight: 1.6,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',       name: '柔波起伏', loop: true,  status: 'done' },
      { id: 'ripple_bob', name: '鱼游涟漪', loop: false, duration: 2.2, status: 'done' }
    ],
    blocks: ['双规格带缺口翠绿浮莲叶', '中央粉白金蕊大睡莲', '水下摇曳深潭水草丛'],
    soulHabit: '莲叶随深潭微澜错相起伏、水下长草柔摆；大鱼掠过时激起连串同心涟漪，叶心水珠滚落溅起细碎水花',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        lotusLeafLarge: buildLotusLeaf(makeCanvas, 26, 11.2, true),
        lotusLeafSmall: buildLotusLeaf(makeCanvas, 18, 7.6, false),
        lotusFlower:    buildLotusFlower(makeCanvas),
        waterReed:      buildWaterReed(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0.2,
        shadowScale: 0.72,
        t: 0,
        bobAmp: 0,
        bobPhase: 0,
        rippleCd: 1.2,
        lastAction: 'idle',
        waveBeats: 0
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
          state.t = 0;
          state.bobAmp = 0;
          state.bobPhase = 0;
          state.rippleCd = 1.1;
          state.lastAction = 'idle';
          state.waveBeats = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          state.t = time * freq;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.waveBeats = 0;
          }

          if (action === 'idle') {
            state.bobAmp = 0;
            state.rippleCd -= dt;
            if (state.rippleCd <= 0 && vfx) {
              state.rippleCd = 2.1 + Math.random() * 1.4;
              const pad = PAD_LAYOUT[Math.floor(Math.random() * PAD_LAYOUT.length)];
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, pad.lx * sMul, pad.ly * sMul);
              vfx.addRipple(wx, wy, 6.5 * sMul, 19.0 * sMul, 1.65, 1.25);
            }
          } else if (action === 'ripple_bob') {
            const u = clamp(actionTime / 2.2, 0, 1);
            const env = smoothstep(0.0, 0.14, u) * (1 - smoothstep(0.58, 1.0, u));
            state.bobAmp = env;
            state.bobPhase = actionTime * 8.4 * freq;

            // 大鱼掠过水底：连续激起 4 拍扩散涟漪与叶心水珠滚落水花
            const beats = [0.08, 0.36, 0.72, 1.15];
            while (state.waveBeats < beats.length && actionTime >= beats[state.waveBeats]) {
              const idx = state.waveBeats;
              if (vfx) {
                const pad = PAD_LAYOUT[idx % PAD_LAYOUT.length];
                const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, pad.lx * sMul, pad.ly * sMul);
                vfx.addRipple(wx, wy, 4.5 * sMul, (22.0 + idx * 3.0) * sMul, 1.45, 1.65);

                // 叶心水珠滚落溅起细小水花
                const dropCount = idx < 2 ? 6 : 4;
                for (let k = 0; k < dropCount; k++) {
                  const a = Math.random() * TAU;
                  const sp = (4.5 + Math.random() * 8.0) * sMul;
                  vfx.spawnParticle(
                    wx + Math.cos(a) * 3.2 * sMul,
                    wy + Math.sin(a) * 3.2 * sMul,
                    3.6 * sMul,
                    Math.cos(a) * sp,
                    Math.sin(a) * sp,
                    (6.5 + Math.random() * 7.5) * sMul,
                    0.45 + Math.random() * 0.28,
                    1.15 + Math.random() * 0.4,
                    k % 2 === 0 ? fx.dropA : fx.dropB,
                    false,
                    34
                  );
                }
              }
              state.waveBeats++;
            }
          }
        },

        buildPartList(habitat) {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.t;
          const bob = state.bobAmp;
          const bPh = state.bobPhase;
          const wl = (habitat && habitat.isWater) ? (habitat.waterLevel ?? 2.8) : 0.6;
          const list = [];

          // 1. 水下摇曳深潭水草（submerge: 0.65 染进潭水色）
          for (let i = 0; i < REED_LAYOUT.length; i++) {
            const rd = REED_LAYOUT[i];
            const swayX = Math.sin(t * 1.45 + rd.phase) * (0.9 + bob * 1.4);
            const swayY = Math.cos(t * 1.20 + rd.phase) * (0.7 + bob * 1.1);
            const [rx, ry] = localToWorldXY(state.x, state.y, yw, (rd.lx + swayX) * sMul, (rd.ly + swayY) * sMul);
            list.push({
              partKey: 'waterReed',
              asset: parts.waterReed,
              x: rx,
              y: ry,
              lift: Math.max(0, (wl - 6.8) * sMul),
              ro: wrapAngle(yw + rd.ro + Math.sin(t * 1.3 + rd.phase) * (0.22 + bob * 0.35)),
              submerge: 0.65,
              bias: -0.35
            });
          }

          // 2. 4 片错相起伏的带缺口翠绿大莲叶
          for (let i = 0; i < PAD_LAYOUT.length; i++) {
            const pad = PAD_LAYOUT[i];
            const wave = Math.sin(t * 1.85 + pad.phase) * 0.38 + Math.sin(bPh - i * 1.05) * 1.35 * bob;
            const driftX = Math.sin(t * 1.1 + pad.phase) * (0.35 + bob * 0.65);
            const driftY = Math.cos(t * 0.95 + pad.phase) * (0.35 + bob * 0.65);
            const [px, py] = localToWorldXY(state.x, state.y, yw, (pad.lx + driftX) * sMul, (pad.ly + driftY) * sMul);
            list.push({
              partKey: pad.key,
              asset: parts[pad.key],
              x: px,
              y: py,
              lift: Math.max(0.2, (wl - 0.55 + wave) * sMul),
              ro: wrapAngle(yw + pad.ro + Math.sin(t * 0.9 + pad.phase) * (0.06 + bob * 0.14)),
              bias: pad.bias
            });
          }

          // 3. 中央醒目粉白金蕊大睡莲（随主莲叶同步起伏）
          const mainWave = Math.sin(t * 1.85) * 0.38 + Math.sin(bPh) * 1.45 * bob;
          const [fx, fy] = localToWorldXY(state.x, state.y, yw, (-1.8 + Math.sin(t * 1.1) * 0.35) * sMul, (1.0 + Math.cos(t * 0.95) * 0.35) * sMul);
          list.push({
            partKey: 'lotusFlower',
            asset: parts.lotusFlower,
            x: fx,
            y: fy,
            lift: Math.max(1.2, (wl + 0.85 + mainWave) * sMul),
            ro: wrapAngle(yw + 0.35 + Math.sin(t * 0.8) * 0.05),
            symDeg: 90,
            bias: 0.32
          });

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
