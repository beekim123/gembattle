'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T02 雷云峰顶 · 雷纹焦裂石堆与风生孢子簇
  //
  // 生态定位：被雷震碎堆叠的扁棱峰顶石板（放射焦纹 + 嫩黄雷击苔点），石缝里卡着 天7 散落的明黄风生小种簇与硬茎风草
  // 拆件与图集预算（单盒严格 <= 40 格，仅静电蓝点进 glowKeys，0 常态拉伸）：
  //   - slabBase  (28×26×9, lift=0)：下层震裂扁棱峰顶石板堆（顶面刻放射深黑焦纹与嫩黄雷击苔点）
  //   - slabTop   (18×16×8, lift=6)：上层错叠倾斜扁石板（棱角分明、焦纹延续）
  //   - windTuft  (9×9×10,  复用 ×3)：石缝硬茎风草与明黄风生小种簇（高频风颤）
  //   - sparkNode (4×4×4,   symDeg: 90, noOutline: true)：石缝偶冒的微小自亮静电蓝点（进 glowKeys）
  //
  // 展示动作：
  //   - idle        ：风草快颤、石缝偶冒微小静电蓝点
  //   - spark_burst ：loop: false, duration: 1.8；石堆间噼啪跳出数粒亮青电花并吹起几粒金黄风种
  // =========================================================================

  // 18 色独立色表（<= 48 色、0 重色、仅 sparkMid/sparkHi 进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 暗青扁棱峰顶石板
      slabDark:  '#18202e',
      slabMid:   '#2f3d54',
      slabHi:    '#566b8c',
      // 放射状深黑雷焦纹
      scorchDark:'#0a0c12',
      scorchMid: '#171b26',
      scorchHi:  '#2b3142',
      // 嫩黄雷击苔点（与暗青石板高对比）
      mossDark:  '#27874b',
      mossMid:   '#4cd476',
      mossHi:    '#a1f7ac',
      // 石缝硬茎风草
      grassDark: '#1e5c45',
      grassMid:  '#39996d',
      grassHi:   '#78d99e',
      // 天7 散落明黄风生小种簇
      seedDark:  '#c7800e',
      seedMid:   '#ffbe24',
      seedHi:    '#fff380',
      // 石缝静电蓝点（仅 sparkMid/sparkHi 进 glowKeys）
      sparkDark: '#1582b8',
      sparkMid:  '#4ce0ff',
      sparkHi:   '#e0fcff'
    },
    glowKeys: ['sparkMid', 'sparkHi'],
    parts: ['slab', 'scorch', 'moss', 'grass', 'seed', 'spark'],
    noCrease: [
      ['slab', 'scorch'],
      ['slab', 'moss'],
      ['grass', 'seed']
    ],
    materials: {
      slab:   ['slabDark',   'slabMid',   'slabHi'],
      scorch: ['scorchDark', 'scorchMid', 'scorchHi'],
      moss:   ['mossDark',   'mossMid',   'mossHi'],
      grass:  ['grassDark',  'grassMid',  'grassHi'],
      seed:   ['seedDark',   'seedMid',   'seedHi'],
      spark:  ['sparkDark',  'sparkMid',  'sparkHi']
    },
    protectedParts: ['seed', 'moss', 'spark']
  });

  // 3 套换色皮肤（暗青焦石 / 铜褐雷石 / 霜灰风石）
  const SKINS = [
    {
      id: 'dark_cyan_scorch',
      name: '暗青焦石',
      dot: '#4ce0ff',
      outline: '#080b12',
      pal: {},
      fx: { sparkCore: '#e6feff', sparkMid: '#4ce0ff', sparkOut: '#135c85', seedA: '#ffbe24', seedB: '#fff380' }
    },
    {
      id: 'copper_brown_thunder',
      name: '铜褐雷石',
      dot: '#d9843b',
      outline: '#140c08',
      pal: {
        slabDark:   '#2e1e18', slabMid:   '#54392d', slabHi:   '#855e4c',
        scorchDark: '#120b09', scorchMid: '#241612', scorchHi: '#3d2720',
        mossDark:   '#6b871e', mossMid:   '#a8cc35', mossHi:   '#e6fa82',
        grassDark:  '#426626', grassMid:  '#6da33e', grassHi:  '#a8de6f',
        seedDark:   '#c75b12', seedMid:   '#ff912b', seedHi:   '#ffd87d',
        sparkDark:  '#1c8eb8', sparkMid:  '#66e6ff', sparkHi:  '#ebfdff'
      },
      fx: { sparkCore: '#ebfdff', sparkMid: '#66e6ff', sparkOut: '#166382', seedA: '#ff912b', seedB: '#ffd87d' }
    },
    {
      id: 'frost_slate_wind',
      name: '霜灰风石',
      dot: '#8ea8c7',
      outline: '#0d121c',
      pal: {
        slabDark:   '#364152', slabMid:   '#5c6d85', slabHi:   '#8fa4bf',
        scorchDark: '#131721', scorchMid: '#252c3d', scorchHi: '#3d4861',
        mossDark:   '#1e8068', mossMid:   '#3fd1a8', mossHi:   '#99ffe0',
        grassDark:  '#2a6963', grassMid:  '#4ba69c', grassHi:  '#8ce0d4',
        seedDark:   '#9eb314', seedMid:   '#dff235', seedHi:   '#fcff94',
        sparkDark:  '#4d52d6', sparkMid:  '#8c96ff', sparkHi:  '#ebeeff'
      },
      fx: { sparkCore: '#ebeeff', sparkMid: '#8c96ff', sparkOut: '#2b3296', seedA: '#dff235', seedB: '#fcff94' }
    }
  ];

  // 1. 下层震裂扁棱峰顶石板堆（28×26×9）：俯视清晰多边形扁石板 + 放射焦纹 + 嫩黄/翠绿雷击苔点
  function buildSlabBase(makeCanvas) {
    const m = new VoxelModel(28, 26, 9, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-13.2, 13.2, -12.2, 12.2, 0, 8, (x, y, z, X, Y) => {
      // 两块错叠扁石板拼出棱角轮廓
      const ang1 = Math.atan2(Y + 1.2, X - 1.5);
      const r1 = Math.hypot((X - 1.5) * 0.92, (Y + 1.2) * 1.05);
      const maxR1 = lerp(11.6, 10.0, z / 8) * (1.0 + 0.14 * Math.cos(ang1 * 5 + 0.6));
      const inSlab1 = z <= 6 && r1 <= maxR1;

      const ang2 = Math.atan2(Y - 2.6, X + 3.4);
      const r2 = Math.hypot((X + 3.4) * 1.04, (Y - 2.6) * 0.95);
      const maxR2 = lerp(9.4, 7.8, z / 8) * (1.0 + 0.15 * Math.cos(ang2 * 4 - 0.3));
      const inSlab2 = z <= 7 && r2 <= maxR2;

      if (!inSlab1 && !inSlab2) return;

      // 顶面 5 道放射状深黑雷焦纹（俯视一眼可读！）
      const rCenter = Math.hypot(X, Y);
      const angC = Math.atan2(Y, X);
      const rayWave = Math.abs(Math.sin(angC * 2.5 + rCenter * 0.14));
      const isScorch = z >= 5 && rCenter > 1.2 && rayWave < 0.17;
      // 焦纹旁嫩黄/亮翠绿雷击苔点
      const isMossDot = z >= 5 && rCenter > 3.0 && rayWave >= 0.17 && rayWave < 0.31 && (((Math.round(X * 2 + Y * 3)) & 3) === 0);

      if (isScorch) {
        m.setRaw(x, y, z, mat('scorch'), partId.scorch);
      } else if (isMossDot) {
        const useYellow = ((Math.round(X + Y) & 1) === 0);
        m.setRaw(x, y, z, useYellow ? mat('seed') : mat('moss'), useYellow ? partId.seed : partId.moss);
      } else {
        m.setRaw(x, y, z, mat('slab'), partId.slab);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 12.8, headZ: 9, centerZ: 4 });
  }

  // 2. 上层错叠扁棱盖石（18×16×8）
  function buildSlabTop(makeCanvas) {
    const m = new VoxelModel(18, 16, 8, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-8.4, 8.4, -7.4, 7.4, 0, 7, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X * 0.94, Y * 1.08);
      const maxR = lerp(7.8, 6.2, z / 7) * (1.0 + 0.16 * Math.cos(ang * 4 + 0.4));
      if (r > maxR) return;
      if (z === 7 && r > 4.6) return;

      const rayWave = Math.abs(Math.sin(ang * 2.0 + r * 0.18));
      const isScorch = z >= 4 && rayWave < 0.19;
      const isMoss = z >= 4 && rayWave >= 0.19 && rayWave < 0.34 && r > 2.2 && ((Math.round(X * 3 + Y) & 3) === 0);
      if (isScorch) {
        m.setRaw(x, y, z, mat('scorch'), partId.scorch);
      } else if (isMoss) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else {
        m.setRaw(x, y, z, mat('slab'), partId.slab);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 8.0, headZ: 8, centerZ: 4 });
  }

  // 3. 石缝硬茎风草与明黄风生小种簇（9×9×10，复用 ×3）
  function buildWindTuft(makeCanvas) {
    const m = new VoxelModel(9, 9, 10, SPEC);
    const { mat, partId } = SPEC;
    // 4 根略斜外展的硬茎风草
    m.paintCapsule(0, 0, 0.5, -2.4,  1.6, 7.2, 0.78, 0.48, mat('grass'), partId.grass, true);
    m.paintCapsule(0, 0, 0.5,  2.6,  1.2, 6.8, 0.78, 0.48, mat('grass'), partId.grass, true);
    m.paintCapsule(0, 0, 0.5, -1.2, -2.6, 7.6, 0.75, 0.45, mat('grass'), partId.grass, true);
    m.paintCapsule(0, 0, 0.5,  1.6, -2.0, 6.2, 0.72, 0.45, mat('grass'), partId.grass, true);
    // 顶部卡着的 3 颗饱满明黄风生小种球（俯视高对比！）
    m.paintEllipsoid(-2.2,  1.4, 7.6, 1.45, 1.45, 1.35, mat('seed'), partId.seed, true);
    m.paintEllipsoid( 2.4,  1.0, 7.2, 1.35, 1.35, 1.25, mat('seed'), partId.seed, true);
    m.paintEllipsoid(-0.8, -2.2, 8.0, 1.50, 1.50, 1.40, mat('seed'), partId.seed, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: 10, centerZ: 5 });
  }

  // 4. 石缝自亮静电蓝点（4×4×4，symDeg: 90，noOutline: true）
  function buildSparkNode(makeCanvas) {
    const m = new VoxelModel(4, 4, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 1.5, 1.35, 1.35, 1.35, mat('spark'), partId.spark, true);
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.5, headZ: 4, centerZ: 2 });
  }

  const WIND_TUFTS = [
    { lx: -6.2, ly:  5.4, z: 5.5, ro: 0.35, ph: 0.0, bias: 0.35 },
    { lx:  6.8, ly:  3.2, z: 5.0, ro: 2.15, ph: 1.9, bias: 0.32 },
    { lx: -1.4, ly: -6.8, z: 6.0, ro: 4.05, ph: 3.7, bias: 0.28 }
  ];

  const Def = {
    id: 'scene_t02_charged_cairn',
    code: 'T02',
    name: '雷纹焦裂石堆与风生孢子簇',
    status: 'done',
    defaultHabitat: 'thunderPeak',
    tag: 'T02 雷云峰顶可铺设石堆与风种簇',
    summary: '雷震堆叠的扁棱峰顶石板（板面刻放射深黑焦纹与嫩黄雷击苔点），石缝里卡着 3 簇 天7 散落的明黄风生小种与硬茎风草，俯视辨识度高且轻巧易铺设',
    footRadius: 13.5,
    ecoWeight: 1.8,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',        name: '风草快颤静电点', loop: true,  status: 'done' },
      { id: 'spark_burst', name: '电花噼啪吹风种', loop: false, duration: 1.8, status: 'done' }
    ],
    blocks: [
      '两层错叠扁棱雷纹焦裂石板',
      '3 簇石缝硬茎风草与明黄风生小种簇',
      '石缝自亮静电蓝点与噼啪短电花'
    ],
    soulHabit: '峰顶强风吹得石缝风草快速颤动，石缝间偶冒微小静电蓝点；静电积聚释放时石堆间噼啪跳出数粒亮青电花，并吹起几粒金黄风生小种随风飘散',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        slabBase:  buildSlabBase(makeCanvas),
        slabTop:   buildSlabTop(makeCanvas),
        windTuft:  buildWindTuft(makeCanvas),
        sparkNode: buildSparkNode(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        time: 0,
        sparkBlink: 0,
        sparkSlot: 0,
        blinkCd: 0.9,
        burstStrength: 0,
        burstStep: 0,
        lastAction: 'idle'
      };

      let curSkin = SKINS[0];

      const instance = {
        def: Def,
        parts,
        partListAssets: Object.values(parts),
        state,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
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
          state.sparkBlink = 0;
          state.sparkSlot = 0;
          state.blinkCd = 0.85;
          state.burstStrength = 0;
          state.burstStep = 0;
          state.lastAction = 'idle';
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          state.time = time;
          if (action !== state.lastAction) {
            state.lastAction = action;
            state.burstStep = 0;
          }

          if (action === 'spark_burst') {
            const u = clamp(actionTime / 1.8, 0, 1);
            state.burstStrength = smoothstep(0.0, 0.14, u) * (1 - smoothstep(0.55, 1.0, u));
            state.sparkBlink = state.burstStrength;

            // 分 3 拍噼啪跳出亮青电花 + 吹起金黄风种
            const beats = [0.12, 0.42, 0.78];
            while (state.burstStep < beats.length && actionTime >= beats[state.burstStep]) {
              if (vfx) {
                // 亮青电花粒
                for (let k = 0; k < 6; k++) {
                  const a = Math.random() * TAU;
                  const sp = (8 + Math.random() * 14) * sMul;
                  const [sx, sy] = localToWorldXY(
                    state.x, state.y, state.yaw,
                    ((Math.random() - 0.5) * 10.0) * sMul,
                    ((Math.random() - 0.5) * 9.0) * sMul
                  );
                  vfx.spawnParticle(
                    sx, sy, (7.5 + Math.random() * 4.5) * sMul,
                    Math.cos(a) * sp, Math.sin(a) * sp, (7 + Math.random() * 9) * sMul,
                    0.34 + Math.random() * 0.22,
                    1.25,
                    k % 2 === 0 ? fx.sparkCore : fx.sparkMid,
                    true,
                    24
                  );
                }
                // 吹起的金黄风生小种
                for (let s = 0; s < 4; s++) {
                  const wt = WIND_TUFTS[(s + state.burstStep) % WIND_TUFTS.length];
                  const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, wt.lx * sMul, wt.ly * sMul);
                  const a = Math.random() * TAU;
                  vfx.spawnParticle(
                    wx, wy, (wt.z + 6.5) * sMul,
                    (5.5 + Math.cos(a) * 5.0) * sMul,
                    Math.sin(a) * 4.2 * sMul,
                    (6.5 + Math.random() * 5.5) * sMul,
                    1.05 + Math.random() * 0.45,
                    1.30,
                    s % 2 === 0 ? fx.seedA : fx.seedB,
                    false,
                    4.0
                  );
                }
              }
              state.burstStep++;
            }
          } else {
            state.burstStrength = lerp(state.burstStrength, 0, clamp(dt * 8.0, 0, 1));
            // 待机：石缝偶冒微小静电蓝点
            if (state.sparkBlink > 0) {
              state.sparkBlink = Math.max(0, state.sparkBlink - dt * 3.8);
            } else {
              state.blinkCd -= dt * gFreq;
              if (state.blinkCd <= 0) {
                state.blinkCd = 0.85 + Math.random() * 0.95;
                state.sparkBlink = 1.0;
                state.sparkSlot = (state.sparkSlot + 1) % 3;
                if (vfx) {
                  const [px, py] = localToWorldXY(
                    state.x, state.y, state.yaw,
                    ((Math.random() - 0.5) * 9.0) * sMul,
                    ((Math.random() - 0.5) * 8.0) * sMul
                  );
                  vfx.spawnParticle(
                    px, py, (7.0 + Math.random() * 3.5) * sMul,
                    (Math.random() - 0.5) * 5.0 * sMul,
                    (Math.random() - 0.5) * 5.0 * sMul,
                    (4.0 + Math.random() * 4.0) * sMul,
                    0.30, 1.0, fx.sparkMid, true, 12
                  );
                }
              }
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.time;
          const cx = state.x;
          const cy = state.y;
          const fx = curSkin.fx || SKINS[0].fx;
          const list = [];

          // 1. 下层雷纹焦裂扁石板堆
          list.push({
            partKey: 'slabBase',
            asset: parts.slabBase,
            x: cx,
            y: cy,
            lift: 0,
            ro: yw,
            bias: -0.22
          });

          // 2. 上层错叠盖石板
          const [tx, ty] = localToWorldXY(cx, cy, yw, -1.6 * sMul, -1.0 * sMul);
          list.push({
            partKey: 'slabTop',
            asset: parts.slabTop,
            x: tx,
            y: ty,
            lift: 5.8 * sMul,
            ro: wrapAngle(yw + 0.24),
            bias: 0.05
          });

          // 3. 石缝 3 簇硬茎风草与明黄风生小种（强风快颤）
          const vibBoost = 1.0 + state.burstStrength * 1.8;
          for (let i = 0; i < WIND_TUFTS.length; i++) {
            const wt = WIND_TUFTS[i];
            const flutter = Math.sin(t * 14.5 + wt.ph) * 0.22 * vibBoost;
            const rotVib = Math.cos(t * 16.0 + wt.ph) * 0.14 * vibBoost;
            const [wx, wy] = localToWorldXY(cx, cy, yw, (wt.lx + flutter) * sMul, (wt.ly + flutter * 0.6) * sMul);
            list.push({
              partKey: `windTuft_${i}`,
              asset: parts.windTuft,
              x: wx,
              y: wy,
              lift: wt.z * sMul,
              ro: wrapAngle(yw + wt.ro + rotVib),
              bias: wt.bias
            });
          }

          // 4. 石缝偶冒的微小自亮静电蓝点（noOutline: true）
          if (state.sparkBlink > 0.15) {
            const sparkOffsets = [
              [-3.8,  2.6, 8.8],
              [ 4.2, -1.8, 7.6],
              [ 0.6,  4.4, 7.8]
            ];
            const spPos = sparkOffsets[state.sparkSlot % sparkOffsets.length];
            const [sx, sy] = localToWorldXY(cx, cy, yw, spPos[0] * sMul, spPos[1] * sMul);
            list.push({
              partKey: 'sparkNode',
              asset: parts.sparkNode,
              x: sx,
              y: sy,
              lift: (spPos[2] + (1 - state.sparkBlink) * 1.4) * sMul,
              ro: wrapAngle(t * 4.0),
              symDeg: 90,
              opacity: clamp(state.sparkBlink, 0.2, 1.0),
              noOutline: true,
              bias: 0.65
            });
          }

          // 5. spark_burst 期间石板裂缝间噼啪跳动的短电花折线
          if (state.burstStrength > 0.25) {
            const [a0x, a0y] = localToWorldXY(cx, cy, yw, -6.5 * sMul,  2.5 * sMul);
            const [a1x, a1y] = localToWorldXY(cx, cy, yw,  6.2 * sMul, -2.0 * sMul);
            list.push({
              kind: 'line',
              x0: a0x, y0: a0y, z0: 9.5 * sMul,
              x1: a1x, y1: a1y, z1: 11.0 * sMul,
              widthArtPx: 1,
              color: fx.sparkCore,
              outlineColor: fx.sparkOut,
              opacity: clamp(state.burstStrength, 0, 1),
              sag: -1.5 * sMul,
              jitter: 1.8 * sMul,
              jitterPhase: t * 32.0,
              segments: 8,
              bias: 0.78
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
