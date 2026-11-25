'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T10 地标 · 巨型含露花苞（T10 花丛草甸）
  //
  // 拆件与图集预算（单盒严格 <= 24 格，6 片花瓣完全复用 1 套部件！）：
  //   - calyxBase   (24×24×12, lift=0, symDeg: 60)：厚实翠绿 6 瓣萼片底托 + 贴地叶盘
  //   - giantPetal  (12×16×17)：硕大粉白弧形花瓣，共用 1 套部件按 60° 环形排布 6 片
  //   - nectarCore  (12×12×13, symDeg: 90)：中心圆润暖金花蕊蜜囊（仅 nectarGlow 进 glowKeys）
  //   - dewLeaf     (12×10×8)：底部环绕 3 片宽厚托叶（带晶莹露珠，不进 glowKeys）
  //
  // 展示动作：
  //   - idle  ：半合含露、缓缓呼吸微张微合，偶飘金黄花粉
  //   - bloom ：花瓣依次向外舒展盛开，中心金蕊喷吐一蓬缓缓飘散的金黄花粉粒，再缓缓收拢
  // =========================================================================

  // 21 色独立色表（严守 <= 48 色、0 重色，仅花蜜微亮蕊心 nectarGlow 进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 厚实翠绿萼片底托
      calyxDark:  '#175224',
      calyxMid:   '#32913a',
      calyxHi:    '#78d651',
      // 贴地宽厚托叶
      leafDark:   '#1d4a22',
      leafMid:    '#3b8036',
      leafHi:     '#85c74e',
      // 花瓣外层饱和桃粉
      petalODark: '#b83566',
      petalOMid:  '#f26d9c',
      petalOHi:   '#ffbfd6',
      // 花瓣内层柔粉雪白
      petalIDark: '#de81a3',
      petalIMid:  '#ffc9dd',
      petalIHi:   '#fff5f9',
      // 露珠（非自亮，纯清澈青白阶）
      dewDark:    '#57b2c7',
      dewMid:     '#9be4f5',
      dewHi:      '#e6fcff',
      // 花蕊底座与花粉丝
      stamenDark: '#bf6811',
      stamenMid:  '#f2aa24',
      stamenHi:   '#ffe066',
      // 中心暖金蜜囊（仅 nectarGlow 进 glowKeys）
      nectarDark: '#d48415',
      nectarMid:  '#ffbc2b',
      nectarGlow: '#fff38a'
    },
    glowKeys: ['nectarGlow'],
    parts: ['calyx', 'leaf', 'petalO', 'petalI', 'dew', 'stamen', 'nectar'],
    noCrease: [
      ['calyx', 'leaf'], ['petalO', 'petalI'], ['petalO', 'dew'], ['petalI', 'dew'],
      ['stamen', 'nectar']
    ],
    materials: {
      calyx:  ['calyxDark',  'calyxMid',  'calyxHi'],
      leaf:   ['leafDark',   'leafMid',   'leafHi'],
      petalO: ['petalODark', 'petalOMid', 'petalOHi'],
      petalI: ['petalIDark', 'petalIMid', 'petalIHi'],
      dew:    ['dewDark',    'dewMid',    'dewHi'],
      stamen: ['stamenDark', 'stamenMid', 'stamenHi'],
      nectar: ['nectarDark', 'nectarMid', 'nectarGlow']
    },
    protectedParts: ['dew', 'nectar']
  });

  // 3 套换色皮肤（桃粉蜜苞 / 鹅黄朝苞 / 冰青露苞，0 禁用字）
  const SKINS = [
    {
      id: 'peach_nectar',
      name: '桃粉蜜苞',
      dot: '#f26d9c',
      outline: '#171f14',
      pal: {},
      fx: {
        pollenA: '#fff080',
        pollenB: '#ffbc2b',
        dew:     '#9be4f5'
      }
    },
    {
      id: 'butter_morning',
      name: '鹅黄朝苞',
      dot: '#f7ca45',
      outline: '#1f1c11',
      pal: {
        petalODark: '#bf7c19', petalOMid: '#f7c23b', petalOHi: '#ffeb94',
        petalIDark: '#dbad4f', petalIMid: '#ffe69e', petalIHi: '#fffbe6',
        stamenDark: '#b84812', stamenMid: '#ed7d24', stamenHi: '#ffba52',
        nectarDark: '#cc5b14', nectarMid: '#ff9626', nectarGlow: '#ffe070'
      },
      fx: {
        pollenA: '#ffe873',
        pollenB: '#ff9c38',
        dew:     '#b5effa'
      }
    },
    {
      id: 'ice_cyan_dew',
      name: '冰青露苞',
      dot: '#5cd1e8',
      outline: '#101d21',
      pal: {
        calyxDark:  '#154f3c', calyxMid:  '#2b8f6d', calyxHi:  '#6fd6aa',
        petalODark: '#2c7ea1', petalOMid: '#5cc4e6', petalOHi: '#bdf2ff',
        petalIDark: '#6bb0c9', petalIMid: '#c4f2ff', petalIHi: '#f2fdff',
        stamenDark: '#c47b16', stamenMid: '#f7b82e', stamenHi: '#ffeb7a',
        nectarDark: '#d98f18', nectarMid: '#ffc936', nectarGlow: '#fff799'
      },
      fx: {
        pollenA: '#fff594',
        pollenB: '#8ae8ff',
        dew:     '#d4faff'
      }
    }
  ];

  // =========================================================================
  // 1. 厚实翠绿萼片底托（24×24×12，6 重对称 symDeg: 60）
  // =========================================================================
  function buildCalyxBase(makeCanvas) {
    const m = new VoxelModel(24, 24, 12, SPEC);
    const { mat, partId } = SPEC;

    // 底部厚实根座与碗状花托
    m.paintEllipsoid(0, 0, 2.8, 7.6, 7.6, 3.0, mat('leaf'), partId.leaf, true);
    m.paintEllipsoid(0, 0, 5.4, 6.6, 6.6, 3.2, mat('calyx'), partId.calyx, true);

    // 6 片厚实向外翻卷的尖头萼片（严格 60° 旋转对称）
    for (let k = 0; k < 6; k++) {
      const a = k * (TAU / 6);
      const ca = Math.cos(a), sa = Math.sin(a);
      m.paintCapsule(ca * 3.8, sa * 3.8, 3.4, ca * 8.4, sa * 8.4, 7.6, 2.5, 1.5, mat('calyx'), partId.calyx, true);
      m.paintCapsule(ca * 8.4, sa * 8.4, 7.6, ca * 10.6, sa * 10.6, 9.6, 1.3, 0.55, mat('calyx'), partId.calyx, true);
    }

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 10.8, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 2. 硕大粉白花瓣（12×16×17，共用 1 套部件环形排布 6 片）
  //    局部 +Y 指向外侧，-Y 指向花心
  // =========================================================================
  function buildGiantPetal(makeCanvas) {
    const m = new VoxelModel(12, 16, 17, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5.5, 5.5, -7.5, 7.5, 0, 16, (x, y, z, X, Y) => {
      const t = z / 16; // 0=瓣基，1=瓣尖
      // 花瓣沿高度先向外鼓出再向内微抱，形成饱满含露杯状
      const cupY = Math.sin(t * Math.PI * 0.85) * 4.2 - 1.6;
      const halfW = (1.9 + Math.sin(t * Math.PI) * 3.4) * (1 - smoothstep(0.84, 1.0, t) * 0.65);
      const halfThick = 1.45 - Math.abs(t - 0.45) * 0.7;

      const nx = X / Math.max(0.6, halfW);
      const ny = (Y - cupY - nx * nx * 1.15) / Math.max(0.6, halfThick);
      if (nx * nx + ny * ny <= 1.0) {
        // 靠花心内面用柔粉雪白，外弧面用饱和桃粉
        const isInner = (Y - cupY) < 0.25 && t > 0.14;
        if (isInner) {
          m.setRaw(x, y, z, mat('petalI'), partId.petalI);
        } else {
          m.setRaw(x, y, z, mat('petalO'), partId.petalO);
        }
      }
    });

    // 花瓣上缘挂一颗晶莹露珠（非自亮）
    m.paintEllipsoid(1.4, 2.8, 12.8, 1.15, 1.15, 1.35, mat('dew'), partId.dew, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 16, centerZ: 8 });
  }

  // =========================================================================
  // 3. 中心圆润暖金花蕊蜜囊（12×12×13，symDeg: 90，仅 nectarGlow 进 glowKeys）
  // =========================================================================
  function buildNectarCore(makeCanvas) {
    const m = new VoxelModel(12, 12, 13, SPEC);
    const { mat, partId } = SPEC;

    // 底部花粉柱座
    m.paintCapsule(0, 0, 0.5, 0, 0, 5.2, 2.4, 2.0, mat('stamen'), partId.stamen, true);

    // 圆润暖金蜜囊球体
    m.paintEllipsoid(0, 0, 7.6, 3.8, 3.8, 3.6, mat('nectar'), partId.nectar, true);

    // 顶面与四向点缀花蜜微亮蕊心（进入 glowKeys）
    m.paintEllipsoid(0, 0, 9.6, 2.2, 2.2, 1.5, SPEC.keyToId.nectarGlow, partId.nectar, true);

    // 环绕 4 根细短雄蕊柱（90° 对称）
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI * 0.5) + Math.PI * 0.25;
      m.paintCapsule(Math.cos(a) * 2.2, Math.sin(a) * 2.2, 4.4, Math.cos(a) * 4.2, Math.sin(a) * 4.2, 9.2, 0.8, 0.65, mat('stamen'), partId.stamen, true);
      m.paintEllipsoid(Math.cos(a) * 4.2, Math.sin(a) * 4.2, 9.6, 1.05, 1.05, 0.95, mat('nectar'), partId.nectar, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 12, centerZ: 6 });
  }

  // =========================================================================
  // 4. 贴地宽厚托叶（12×10×8，复用 3 片环绕底座）
  // =========================================================================
  function buildDewLeaf(makeCanvas) {
    const m = new VoxelModel(12, 10, 8, SPEC);
    const { mat, partId } = SPEC;

    m.paintCapsule(0, -3.5, 1.4, 0, 3.5, 3.8, 3.0, 1.4, mat('leaf'), partId.leaf, true);
    m.paintEllipsoid(0, 0.2, 2.6, 4.2, 3.8, 1.2, mat('calyx'), partId.calyx, true);
    m.paintEllipsoid(1.2, 1.4, 4.2, 1.1, 1.1, 0.9, mat('dew'), partId.dew, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8, headZ: 6, centerZ: 2.5 });
  }

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t10_giant_bud',
    code: 'T10',
    name: '巨型含露花苞',
    status: 'done',
    defaultHabitat: 'meadow',
    tag: 'T10 草甸采蜜地标 · 绽放吐粉巨花苞',
    summary: '厚实翠绿 6 瓣萼片底托 + 6 片复用硕大粉白花瓣 + 中心微亮暖金花蕊蜜囊，支持呼吸微张与依次舒展盛开喷吐花粉',
    footRadius: 13.0,
    ecoWeight: 2.4,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',  name: '含露微呼吸',   loop: true,  status: 'done' },
      { id: 'bloom', name: '依次盛开吐粉', loop: false, duration: 2.8, status: 'done' }
    ],
    blocks: ['6 瓣翠绿萼片底托', '6 片环形复用巨花瓣', '微亮暖金花蕊蜜囊'],
    soulHabit: '平时半合含露缓缓微张微合，供林间妖精与翅壳虫采蜜；盛开时 6 片花瓣依次向外舒展，中心金蕊喷吐一蓬缓缓飘散的金黄花粉粒',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        calyxBase:  buildCalyxBase(makeCanvas),
        giantPetal: buildGiantPetal(makeCanvas),
        nectarCore: buildNectarCore(makeCanvas),
        dewLeaf:    buildDewLeaf(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        time: 0,
        petalOpens: [0, 0, 0, 0, 0, 0],
        coreLift: 0,
        pollenClock: 1.3,
        lastAction: 'idle',
        bloomBurstStage: 0
      };

      let curSkin = SKINS[0];

      function spawnNectarPollen(vfx, sMul, count, radialSpd, liftSpd) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let i = 0; i < count; i++) {
          const a = (i / Math.max(1, count)) * TAU + (Math.random() - 0.5) * 0.5;
          const r = (1.0 + Math.random() * 2.8) * sMul;
          const sp = (radialSpd * (0.55 + Math.random() * 0.85)) * sMul;
          vfx.spawnParticle(
            state.x + Math.cos(a) * r,
            state.y + Math.sin(a) * r,
            (13.5 + Math.random() * 3.5) * sMul,
            Math.cos(a) * sp,
            Math.sin(a) * sp,
            (liftSpd * (0.65 + Math.random() * 0.65)) * sMul,
            1.6 + Math.random() * 0.85,
            1.2 + Math.random() * 0.4,
            i % 2 === 0 ? fx.pollenA : fx.pollenB,
            true,
            1.6
          );
        }
      }

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
          state.time = 0;
          for (let i = 0; i < 6; i++) state.petalOpens[i] = 0;
          state.coreLift = 0;
          state.pollenClock = 1.2;
          state.lastAction = 'idle';
          state.bloomBurstStage = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          state.time = time * gFreq;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.bloomBurstStage = 0;
          }

          if (action === 'bloom') {
            // 2.8s 周期：0.0~0.95s 6 片花瓣依次向外舒展，0.95~1.75s 盛开吐粉，1.75~2.8s 缓缓收拢
            for (let k = 0; k < 6; k++) {
              const openStart = k * 0.095;
              const openEnd = openStart + 0.46;
              const closeStart = 1.65 + (5 - k) * 0.08;
              const closeEnd = closeStart + 0.65;
              const openT = smoothstep(openStart, openEnd, actionTime);
              const closeT = 1 - smoothstep(closeStart, closeEnd, actionTime);
              const target = openT * closeT;
              state.petalOpens[k] = lerp(state.petalOpens[k], target, clamp(dt * 12, 0, 1));
            }
            const coreEnv = smoothstep(0.25, 0.95, actionTime) * (1 - smoothstep(1.85, 2.70, actionTime));
            state.coreLift = lerp(state.coreLift, coreEnv * 2.8, clamp(dt * 10, 0, 1));

            // 分三波喷吐缓缓飘散的金黄花粉粒
            const burstTimes = [0.68, 1.05, 1.42];
            while (state.bloomBurstStage < burstTimes.length && actionTime >= burstTimes[state.bloomBurstStage]) {
              const count = state.bloomBurstStage === 1 ? 14 : 9;
              spawnNectarPollen(vfx, sMul, count, 4.2, 5.2);
              if (vfx && state.bloomBurstStage === 0) {
                vfx.addRipple(state.x, state.y, 4.0 * sMul, 16.0 * sMul, 0.95, 1.5);
              }
              state.bloomBurstStage++;
            }
          } else {
            // 半合含露缓缓呼吸微张微合
            const breath = (Math.sin(state.time * 1.45) + 1) * 0.5;
            for (let k = 0; k < 6; k++) {
              const localBreath = (Math.sin(state.time * 1.45 - k * 0.35) + 1) * 0.5;
              const target = 0.08 + localBreath * 0.14;
              state.petalOpens[k] = lerp(state.petalOpens[k], target, clamp(dt * 5.5, 0, 1));
            }
            state.coreLift = lerp(state.coreLift, breath * 0.75, clamp(dt * 5.5, 0, 1));

            state.pollenClock -= dt;
            if (state.pollenClock <= 0) {
              state.pollenClock = 1.8 + Math.random() * 1.3;
              spawnNectarPollen(vfx, sMul, 2, 1.8, 2.8);
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const list = [];

          // 1. 底部 3 片宽厚托叶
          for (let i = 0; i < 3; i++) {
            const a = i * (TAU / 3) + 0.52;
            const [lx, ly] = localToWorldXY(state.x, state.y, yw, Math.cos(a) * 9.8 * sMul, Math.sin(a) * 9.8 * sMul);
            list.push({
              partKey: 'dewLeaf',
              asset: parts.dewLeaf,
              x: lx,
              y: ly,
              lift: 0,
              ro: wrapAngle(yw + a - Math.PI * 0.5),
              bias: -0.15
            });
          }

          // 2. 厚实翠绿萼片底托（60° 旋转对称）
          list.push({
            partKey: 'calyxBase',
            asset: parts.calyxBase,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            bias: -0.05,
            symDeg: 60
          });

          // 3. 中心暖金花蕊蜜囊（微亮进 glowKeys）
          list.push({
            partKey: 'nectarCore',
            asset: parts.nectarCore,
            x: state.x,
            y: state.y,
            lift: (6.2 + state.coreLift) * sMul,
            ro: wrapAngle(yw + state.time * 0.18),
            bias: 0.35,
            symDeg: 90
          });

          // 4. 6 片硕大粉白花瓣（共用 1 套 giantPetal 环形排布，展开时径向平移 + 微降 + 微偏转）
          for (let k = 0; k < 6; k++) {
            const open = state.petalOpens[k];
            const a = k * (TAU / 6);
            const r = (4.8 + open * 5.4) * sMul;
            const [px, py] = localToWorldXY(state.x, state.y, yw, Math.cos(a) * r, Math.sin(a) * r);
            const lift = (6.6 - open * 1.65) * sMul;
            const twist = open * 0.14 * (k % 2 === 0 ? 1 : -1);
            list.push({
              partKey: 'giantPetal',
              asset: parts.giantPetal,
              x: px,
              y: py,
              lift,
              ro: wrapAngle(yw + a - Math.PI * 0.5 + twist),
              bias: 0.18 + open * 0.08
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
