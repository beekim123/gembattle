'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T05 极地高大掩体与地标 · 蓝白冰脊裂崖与雪丘（T05 极地冰缝）
  //
  // 视觉三层极脆色阶：
  //   - 雪白覆顶（#d4eaf5 / #edf7fc / #ffffff）
  //   - 饱和冰青棱角切面（#1d7fa3 / #3ab9db / #87ebff）
  //   - 深靛蓝冰裂缝底（#0f2447 / #1d4478 / #3169ab）
  //   - 崖脚冰缝渗出一抹翠绿冰下藻垫（#166945 / #28ab6a / #62e39c）
  //
  // 拆件与图集预算（单块 <= 34 格，0 自亮键）：
  //   - ridgeMain  (28×20×34, lift=0, bias=+0.06)：主斜插尖棱冰晶崖板
  //   - ridgeFlank (22×18×26, lift=0, bias=-0.04)：侧翼裂崖冰板（与主崖留出深靛裂缝）
  //   - iceVeil    (16×12×22, lift=3, bias=+0.18, opacity: 0.78)：半透冰晶切面薄片
  //   - snowMound  (26×22×11, lift=0, bias=-0.12)：底座厚雪丘与浅冰缘
  //   - iceShard   (8×8×9,    lift=0, bias=-0.16, symDeg: 90)：复用底座浅冰碎块 ×4
  //
  // 展示动作：
  //   - idle      ：极地寒风拂过，冰脊顶部偶飘细碎雪雾白粒
  //   - ice_crack ：冰层热胀冷缩发出脆响，两块裂崖微微错动 1 格并迸落碎冰渣与雪粉
  // =========================================================================

  // 15 色独立色表（<= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 纯白松软积雪覆顶
      snowDark:  '#cfe6f2',
      snowMid:   '#ecf7fc',
      snowHi:    '#ffffff',
      // 饱和冰青棱角切面
      iceDark:   '#1a7da1',
      iceMid:    '#38b8db',
      iceHi:     '#85ebff',
      // 深靛蓝冰裂缝底与背寒面
      deepDark:  '#0f2447',
      deepMid:   '#1e467a',
      deepHi:    '#336eb0',
      // 剔透冰晶薄切面
      veilDark:  '#2491b8',
      veilMid:   '#5cd1ed',
      veilHi:    '#b5f4ff',
      // 缝脚翠绿冰下藻垫
      algaeDark: '#166944',
      algaeMid:  '#28ab69',
      algaeHi:   '#63e39b'
    },
    glowKeys: [],
    parts: ['snow', 'ice', 'deep', 'veil', 'algae'],
    noCrease: [
      ['snow', 'ice'], ['ice', 'deep'], ['ice', 'veil']
    ],
    materials: {
      snow:  ['snowDark',  'snowMid',  'snowHi'],
      ice:   ['iceDark',   'iceMid',   'iceHi'],
      deep:  ['deepDark',  'deepMid',  'deepHi'],
      veil:  ['veilDark',  'veilMid',  'veilHi'],
      algae: ['algaeDark', 'algaeMid', 'algaeHi']
    },
    protectedParts: ['algae']
  });

  // 3 套零重建模换色皮肤（冰青雪白 / 深靛极冰 / 朝霞暖冰）
  const SKINS = [
    {
      id: 'ice_cyan_snow',
      name: '冰青雪白',
      dot: '#38b8db',
      outline: '#0d1d33',
      pal: {},
      fx: {
        snowA: '#ffffff',
        snowB: '#dcf2fc',
        shardA: '#38b8db',
        shardB: '#85ebff'
      }
    },
    {
      id: 'deep_indigo_polar',
      name: '深靛极冰',
      dot: '#2b58a8',
      outline: '#081326',
      pal: {
        snowDark:  '#b8d4ed', snowMid: '#dcecf9', snowHi: '#f4faff',
        iceDark:   '#174785', iceMid:  '#2f74c4', iceHi:  '#6fb5f5',
        deepDark:  '#081633', deepMid: '#122c5e', deepHi: '#21498c',
        veilDark:  '#1d5ca3', veilMid: '#4893e0', veilHi: '#9ad0ff',
        algaeDark: '#115946', algaeMid:'#209675', algaeHi:'#54d4ae'
      },
      fx: {
        snowA: '#f4faff',
        snowB: '#b8d4ed',
        shardA: '#2f74c4',
        shardB: '#6fb5f5'
      }
    },
    {
      id: 'dawn_warm_ice',
      name: '朝霞暖冰',
      dot: '#f09d8b',
      outline: '#241826',
      pal: {
        snowDark:  '#e8cfd4', snowMid: '#fae8e6', snowHi: '#fff7f5',
        iceDark:   '#4678a3', iceMid:  '#74a9cc', iceHi:  '#b5dcf0',
        deepDark:  '#242c54', deepMid: '#3c497d', deepHi: '#5f6ea8',
        veilDark:  '#8f6a82', veilMid: '#cf95a0', veilHi: '#ffd0c7',
        algaeDark: '#1e6e58', algaeMid:'#35ad87', algaeHi:'#72e0b6'
      },
      fx: {
        snowA: '#fff7f5',
        snowB: '#ffd0c7',
        shardA: '#74a9cc',
        shardB: '#b5dcf0'
      }
    }
  ];

  // =========================================================================
  // 1. 主斜插尖棱冰晶崖板（28×20×34）
  // =========================================================================
  function buildRidgeMain(makeCanvas) {
    const m = new VoxelModel(28, 20, 34, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-13.2, 13.2, -9.2, 9.2, 0, 33, (x, y, z, X, Y) => {
      const t = z / 33;
      // 随高度向右后方斜插，尖棱收束
      const cx = -1.2 + t * 5.2;
      const cy = -0.6 - t * 2.2;
      const lx = X - cx;
      const ly = Y - cy;

      // 棱角分明的菱形/六边形尖刃横截面
      const rx = (10.2 - t * 8.4) + Math.sin(z * 0.42) * 0.45;
      const ry = (7.2 - t * 5.6) + Math.cos(z * 0.36) * 0.35;
      if (rx <= 0.6 || ry <= 0.6) return;

      // 用折面切角公式（L1 + L2 混合）做出刀劈般锐利冰棱
      const diamond = Math.abs(lx) / rx + Math.abs(ly) / ry;
      const ellip = Math.hypot(lx / rx, ly / ry);
      const metric = diamond * 0.62 + ellip * 0.38;
      if (metric > 1.05) return;

      // 底部一圈深靛蓝冰裂缝底
      if (z <= 5 && (ly > ry * 0.25 || lx < -rx * 0.25)) {
        m.setRaw(x, y, z, mat('deep'), partId.deep);
        return;
      }

      // 顶面与迎风上坡覆厚厚松软纯白积雪
      const snowSlope = z > 24 || (z > 12 && ly < -ry * 0.15 && lx < rx * 0.45 && metric > 0.55);
      // 靠前裂面保留极锐深靛裂槽，其余侧壁露饱和冰青切面
      const deepFace = ly > ry * 0.48 && z < 18 && lx < 1.5;

      if (snowSlope) {
        m.setRaw(x, y, z, mat('snow'), partId.snow);
      } else if (deepFace) {
        m.setRaw(x, y, z, mat('deep'), partId.deep);
      } else {
        m.setRaw(x, y, z, mat('ice'), partId.ice);
      }
    });

    // 崖顶加一簇松软厚积雪脊，增强轮廓辨识
    m.paintEllipsoid(3.4, -2.6, 30.2, 3.6, 2.8, 2.8, mat('snow'), partId.snow, true);
    m.paintEllipsoid(-1.5, -2.4, 21.5, 4.4, 2.6, 2.2, mat('snow'), partId.snow, false);
    // 裂缝底缘露出一小簇翠绿冰下藻垫
    m.paintEllipsoid(-6.2, 4.4, 1.5, 2.8, 1.8, 1.4, mat('algae'), partId.algae, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 12.0, headZ: 33, centerZ: 15 });
  }

  // =========================================================================
  // 2. 侧翼斜插裂崖冰板（22×18×26）
  // =========================================================================
  function buildRidgeFlank(makeCanvas) {
    const m = new VoxelModel(22, 18, 26, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-10.2, 10.2, -8.2, 8.2, 0, 25, (x, y, z, X, Y) => {
      const t = z / 25;
      // 向左前方微倾，与主崖形成鲜明 V 形裂缝轮廓
      const cx = 1.6 - t * 4.8;
      const cy = 0.5 + t * 1.4;
      const lx = X - cx;
      const ly = Y - cy;

      const rx = 8.4 - t * 6.9;
      const ry = 6.2 - t * 4.7;
      if (rx <= 0.6 || ry <= 0.6) return;

      const diamond = Math.abs(lx) / rx + Math.abs(ly) / ry;
      const ellip = Math.hypot(lx / rx, ly / ry);
      const metric = diamond * 0.65 + ellip * 0.35;
      if (metric > 1.04) return;

      if (z <= 4 && lx > 0.2) {
        m.setRaw(x, y, z, mat('deep'), partId.deep);
        return;
      }
      const isSnow = z > 18 || (z > 9 && ly < -ry * 0.1 && lx < rx * 0.2);
      const isDeep = lx > rx * 0.38 && z < 15;
      if (isSnow) {
        m.setRaw(x, y, z, mat('snow'), partId.snow);
      } else if (isDeep) {
        m.setRaw(x, y, z, mat('deep'), partId.deep);
      } else {
        m.setRaw(x, y, z, mat('ice'), partId.ice);
      }
    });

    m.paintEllipsoid(-2.8, 1.6, 22.8, 3.0, 2.4, 2.2, mat('snow'), partId.snow, true);
    m.paintEllipsoid(4.8, 3.2, 1.4, 2.2, 1.6, 1.2, mat('algae'), partId.algae, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 9.5, headZ: 25, centerZ: 12 });
  }

  // =========================================================================
  // 3. 半透冰晶切面薄片（16×12×22，渲染时设 opacity: 0.78）
  // =========================================================================
  function buildIceVeil(makeCanvas) {
    const m = new VoxelModel(16, 12, 22, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-7.2, 7.2, -5.2, 5.2, 0, 21, (x, y, z, X, Y) => {
      const t = z / 21;
      const cx = -0.8 + t * 2.8;
      const lx = X - cx;
      const rx = 5.8 - t * 4.6;
      const ry = 2.6 - t * 1.4;
      if (rx <= 0.5 || ry <= 0.5) return;
      if (Math.abs(lx) / rx + Math.abs(Y) / ry > 1.02) return;
      m.setRaw(x, y, z, mat('veil'), partId.veil);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.0, headZ: 21, centerZ: 10 });
  }

  // =========================================================================
  // 4. 底座厚雪丘与浅冰缘（26×22×11）
  // =========================================================================
  function buildSnowMound(makeCanvas) {
    const m = new VoxelModel(26, 22, 11, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-12.2, 12.2, -10.2, 10.2, 0, 10, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 11.4, Y / 9.2);
      const dome = (1 - r * r) * 8.2 + Math.sin(X * 0.35 + Y * 0.25) * 1.1;
      if (z > dome) return;
      if (z <= 2 && r > 0.74) {
        m.setRaw(x, y, z, mat('ice'), partId.ice);
      } else if (z <= 1 && r > 0.58) {
        m.setRaw(x, y, z, mat('deep'), partId.deep);
      } else {
        m.setRaw(x, y, z, mat('snow'), partId.snow);
      }
    });

    m.paintEllipsoid(-5.4, 3.6, 5.4, 4.8, 3.6, 2.8, mat('snow'), partId.snow, true);
    m.paintEllipsoid( 6.0, -2.5, 4.8, 4.4, 3.4, 2.5, mat('snow'), partId.snow, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 12.0, headZ: 10, centerZ: 4 });
  }

  // =========================================================================
  // 5. 底座浅冰碎块（8×8×9，复用 4 块，symDeg: 90）
  // =========================================================================
  function buildIceShard(makeCanvas) {
    const m = new VoxelModel(8, 8, 9, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-3.4, 3.4, -3.4, 3.4, 0, 8, (x, y, z, X, Y) => {
      const t = z / 8;
      const rad = 3.2 - t * 2.4;
      if (Math.abs(X) + Math.abs(Y) > rad * 1.35) return;
      if (z <= 1) m.setRaw(x, y, z, mat('deep'), partId.deep);
      else if (z >= 6) m.setRaw(x, y, z, mat('snow'), partId.snow);
      else m.setRaw(x, y, z, mat('ice'), partId.ice);
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2, headZ: 8, centerZ: 3 });
  }

  const SHARDS = [
    { lx: -13.5, ly:  7.8, ro: 0.4 },
    { lx:  13.8, ly:  6.4, ro: 1.7 },
    { lx: -11.4, ly: -8.6, ro: 2.5 },
    { lx:  12.2, ly: -7.4, ro: 0.9 }
  ];

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t05_ice_ridge',
    code: 'T05',
    name: '蓝白冰脊裂崖与雪丘',
    status: 'done',
    defaultHabitat: 'iceSea',
    tag: 'T05 极地高大掩体与冰脊地标',
    summary: '斜插耸立的尖棱蓝白冰晶裂崖双板 + 半透冰切面 + 厚雪丘与外圈浅冰碎块，雪白覆顶/冰青切面/深靛裂缝三层锐利分色，缝脚点缀翠绿冰藻',
    footRadius: 16.5,
    ecoWeight: 3.4,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',      name: '寒风飘雪',     loop: true,  status: 'done' },
      { id: 'ice_crack', name: '冰层脆裂错动', loop: false, duration: 2.2, status: 'done' }
    ],
    blocks: ['斜插双板尖棱冰崖', '半透冰晶切面', '厚雪丘与外圈浅冰碎块'],
    soulHabit: '极地寒风拂过时崖顶偶飘细碎雪雾白粒；冰层热胀冷缩时两块裂崖发出脆响并微微错动 1 格，迸落一簇碎冰渣与雪粉',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        ridgeMain:  buildRidgeMain(makeCanvas),
        ridgeFlank: buildRidgeFlank(makeCanvas),
        iceVeil:    buildIceVeil(makeCanvas),
        snowMound:  buildSnowMound(makeCanvas),
        iceShard:   buildIceShard(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        shiftMainX: 0,
        shiftFlankX: 0,
        shudderY: 0,
        snowClock: 0.45,
        lastAction: 'idle',
        crackFired: 0
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
          state.shiftMainX = 0;
          state.shiftFlankX = 0;
          state.shudderY = 0;
          state.snowClock = 0.45;
          state.lastAction = 'idle';
          state.crackFired = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.crackFired = 0;
          }

          state.shiftMainX = 0;
          state.shiftFlankX = 0;
          state.shudderY = 0;

          if (action === 'idle') {
            // 极地寒风拂过，冰脊顶部偶飘细碎雪雾白粒
            state.snowClock -= dt * gFreq;
            if (state.snowClock <= 0 && vfx) {
              state.snowClock = 0.35 + Math.random() * 0.45;
              const ox = (Math.random() - 0.3) * 10.0 * sMul;
              const oy = (Math.random() - 0.5) * 6.0 * sMul;
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, ox, oy);
              const windAng = state.yaw + 0.35;
              vfx.spawnParticle(
                wx, wy, (24.0 + Math.random() * 9.0) * sMul,
                Math.cos(windAng) * (6.0 + Math.random() * 5.0) * sMul,
                Math.sin(windAng) * (6.0 + Math.random() * 5.0) * sMul,
                (-1.2 - Math.random() * 1.8) * sMul,
                0.95 + Math.random() * 0.55,
                0.95 + Math.random() * 0.35,
                Math.random() < 0.65 ? fx.snowA : fx.snowB,
                false,
                2.5
              );
            }
          } else if (action === 'ice_crack') {
            const u = clamp(actionTime / 2.2, 0, 1);
            // 0~0.28 蓄力紧绷微颤；0.28~0.42 脆响错开约 1 格；0.42~0.72 保持错位微震；0.72~1.0 缓稳回落
            let offset = 0;
            let vib = 0;
            if (u < 0.28) {
              vib = Math.sin(actionTime * 48.0 * gFreq) * 0.16 * (u / 0.28);
            } else if (u < 0.42) {
              const k = smoothstep(0.28, 0.42, u);
              offset = k * 1.05;
              vib = Math.sin(actionTime * 56.0 * gFreq) * 0.32 * (1 - k * 0.5);
            } else if (u < 0.74) {
              offset = 1.05;
              vib = Math.sin(actionTime * 34.0 * gFreq) * 0.10 * (1 - (u - 0.42) / 0.32);
            } else {
              const k = smoothstep(0.74, 1.0, u);
              offset = (1 - k) * 1.05;
            }
            state.shiftMainX = (offset * 0.55 + vib) * sMul;
            state.shiftFlankX = (-offset * 0.55 - vib * 0.8) * sMul;
            state.shudderY = Math.cos(actionTime * 42.0 * gFreq) * Math.abs(vib) * 0.6 * sMul;

            // 分两拍迸落碎冰渣与雪粉
            const beats = [0.62, 0.92];
            while (state.crackFired < beats.length && actionTime >= beats[state.crackFired]) {
              if (vfx) {
                const isMainBurst = state.crackFired === 0;
                const count = isMainBurst ? 14 : 9;
                for (let k = 0; k < count; k++) {
                  const a = Math.random() * TAU;
                  const sp = (6.0 + Math.random() * 11.0) * sMul;
                  const ox = (-1.5 + (Math.random() - 0.5) * 6.0) * sMul;
                  const oy = ((Math.random() - 0.5) * 6.0) * sMul;
                  const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, ox, oy);
                  const isShard = k % 2 === 0;
                  vfx.spawnParticle(
                    wx, wy, (10.0 + Math.random() * 16.0) * sMul,
                    Math.cos(a) * sp, Math.sin(a) * sp, (6.5 + Math.random() * 8.0) * sMul,
                    0.65 + Math.random() * 0.45,
                    isShard ? 1.45 : 1.15,
                    isShard ? (k % 4 === 0 ? fx.shardA : fx.shardB) : (k % 3 === 0 ? fx.snowA : fx.snowB),
                    false,
                    isShard ? 42 : 14
                  );
                }
              }
              state.crackFired++;
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const list = [];

          // 1. 外圈复用浅冰碎块 ×4
          for (let i = 0; i < SHARDS.length; i++) {
            const sh = SHARDS[i];
            const [sx, sy] = localToWorldXY(state.x, state.y, yw, sh.lx * sMul, sh.ly * sMul);
            list.push({
              partKey: 'iceShard',
              asset: parts.iceShard,
              x: sx,
              y: sy,
              lift: 0,
              ro: wrapAngle(yw + sh.ro),
              bias: -0.16,
              symDeg: 90
            });
          }

          // 2. 底座厚雪丘
          const [mx, my] = localToWorldXY(state.x, state.y, yw, 0, 1.2 * sMul);
          list.push({
            partKey: 'snowMound',
            asset: parts.snowMound,
            x: mx,
            y: my,
            lift: 0,
            ro: yw,
            bias: -0.12
          });

          // 3. 侧翼裂崖冰板
          const [fx, fy] = localToWorldXY(
            state.x, state.y, yw,
            (-7.2 * sMul) + state.shiftFlankX,
            (2.2 * sMul) + state.shudderY
          );
          list.push({
            partKey: 'ridgeFlank',
            asset: parts.ridgeFlank,
            x: fx,
            y: fy,
            lift: 0,
            ro: wrapAngle(yw - 0.16),
            bias: -0.04
          });

          // 4. 主斜插尖棱冰晶崖板
          const [rx, ry] = localToWorldXY(
            state.x, state.y, yw,
            (3.6 * sMul) + state.shiftMainX,
            (-1.2 * sMul) - state.shudderY * 0.6
          );
          list.push({
            partKey: 'ridgeMain',
            asset: parts.ridgeMain,
            x: rx,
            y: ry,
            lift: 0,
            ro: wrapAngle(yw + 0.08),
            bias: 0.06
          });

          // 5. 半透冰晶切面薄片（贴在主崖前侧棱角，用 opacity 呈现透亮冰切面）
          const [vx, vy] = localToWorldXY(
            state.x, state.y, yw,
            (6.2 * sMul) + state.shiftMainX,
            (4.8 * sMul) - state.shudderY * 0.5
          );
          list.push({
            partKey: 'iceVeil',
            asset: parts.iceVeil,
            x: vx,
            y: vy,
            lift: 2.5 * sMul,
            ro: wrapAngle(yw + 0.14),
            bias: 0.18,
            opacity: 0.78
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
