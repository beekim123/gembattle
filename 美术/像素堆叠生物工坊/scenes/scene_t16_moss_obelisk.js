'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T16 · 刻纹古石碑与温水苔池（scenes/scene_t16_moss_obelisk.js）
  // -------------------------------------------------------------------------
  // 呼应 T16（苔藓古石遗迹）与遗1 方甲（回字/九宫几何古纹）：
  // 拆件与图集预算（单盒严格 <= 32 格，仅唤醒自亮刻纹 2 键进 glowKeys）：
  //   1. mossPool    (32×30×6)           : 碑座石槽小池 + 渗满清碧矿温水 + 池沿石缝亮苔
  //   2. obeliskBody (14×14×32)          : 微微倾斜、顶部崩缺一角的厚重四角刻纹古石碑
  //   3. glyphLow    (12×12×8)           : 石碑下段回字几何自亮纹（支持自下而上依次点亮）
  //   4. glyphMid    (11×11×8)           : 石碑中段九宫几何自亮纹
  //   5. glyphTop    (10×10×8)           : 石碑上段顶环几何自亮纹
  //   6. cornerChip  (7×7×5)             : 碑顶崩缺跌落在池边的残石角
  // 严禁常态 scaleX/scaleY 拉伸；20 色 0 重色 0 禁用字
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 厚重古石碑青灰岩（3 档）
      stoneDark:  '#3a474c',
      stoneMid:   '#607278',
      stoneHi:    '#93a8ad',
      // 崩缺断茬与石沿浅切面（3 档）
      rimDark:    '#6c7e82',
      rimMid:     '#9eb3b5',
      rimHi:      '#d4e3e3',
      // 回字/九宫几何深槽（3 档）
      carveDark:  '#1d2629',
      carveMid:   '#2f3d42',
      carveHi:    '#485c63',
      // 石缝亮绿苔衣（3 档）
      mossDark:   '#24662c',
      mossMid:    '#42b04b',
      mossHi:     '#85eb78',
      // 碑座石槽清碧矿温水（3 档）
      poolDark:   '#176e73',
      poolMid:    '#32b8b3',
      poolHi:     '#8cf2e6',
      // 池底浅砾石（3 档）
      pebbleDark: '#475759',
      pebbleMid:  '#6f8587',
      pebbleHi:   '#9eb5b5',
      // 仅几何刻纹唤醒自亮核进 glowKeys（2 键，温润青金）
      glyphMid:   '#5ce6b8',
      glyphCore:  '#f2ffba'
    },
    glowKeys: ['glyphMid', 'glyphCore'],
    parts: ['stone', 'rim', 'carve', 'moss', 'pool', 'pebble', 'glyph'],
    noCrease: [
      ['stone', 'rim'],
      ['stone', 'carve'],
      ['stone', 'moss'],
      ['stone', 'pool'],
      ['pool', 'moss'],
      ['pool', 'pebble'],
      ['stone', 'glyph'],
      ['carve', 'glyph']
    ],
    materials: {
      stone:  ['stoneDark',  'stoneMid',  'stoneHi'],
      rim:    ['rimDark',    'rimMid',    'rimHi'],
      carve:  ['carveDark',  'carveMid',  'carveHi'],
      moss:   ['mossDark',   'mossMid',   'mossHi'],
      pool:   ['poolDark',   'poolMid',   'poolHi'],
      pebble: ['pebbleDark', 'pebbleMid', 'pebbleHi']
    },
    protectedParts: ['glyph', 'pool', 'moss']
  });

  // 3 套零重建模换色皮肤（每套 20 色 0 重色 0 禁用字）
  const SKINS = [
    {
      id: 'ancient_teal_moss',
      name: '古青翠苔',
      dot: '#32b8b3',
      outline: '#0d1617',
      pal: {},
      fx: {
        steam:  '#e8f7f5',
        glyphA: '#5ce6b8',
        glyphB: '#f2ffba',
        water:  '#6ae6dc'
      }
    },
    {
      id: 'pale_blue_glyph',
      name: '苍白蓝纹',
      dot: '#6cbcf5',
      outline: '#10151f',
      pal: {
        stoneDark:  '#616a75', stoneMid: '#96a2b0', stoneHi: '#cfd9e6',
        rimDark:    '#828e9c', rimMid:   '#b6c3d1', rimHi:   '#ebf2fa',
        carveDark:  '#323a45', carveMid: '#4c5869', carveHi: '#6b7b91',
        mossDark:   '#2c5c69', mossMid:  '#4996a8', mossHi:  '#86d4e3',
        poolDark:   '#1e628f', poolMid:  '#42a3db', poolHi:  '#9ce0ff',
        pebbleDark: '#576878', pebbleMid:'#8599ad', pebbleHi:'#b9cbe0',
        glyphMid:   '#59c2ff', glyphCore:'#e0f7ff'
      },
      fx: {
        steam:  '#edf5ff',
        glyphA: '#59c2ff',
        glyphB: '#e0f7ff',
        water:  '#8ad4ff'
      }
    },
    {
      id: 'ochre_gold_glyph',
      name: '赭石金纹',
      dot: '#db9a3b',
      outline: '#1c130c',
      pal: {
        stoneDark:  '#5c3b27', stoneMid: '#8f5d3e', stoneHi: '#c48760',
        rimDark:    '#82583d', rimMid:   '#b88360', rimHi:   '#e8ba97',
        carveDark:  '#301d12', carveMid: '#4d2f1d', carveHi: '#70462c',
        mossDark:   '#4b5e22', mossMid:  '#7c9c38', mossHi:  '#bad968',
        poolDark:   '#1c706b', poolMid:  '#38b5aa', poolHi:  '#92ede2',
        pebbleDark: '#635342', pebbleMid:'#947f67', pebbleHi:'#c7b297',
        glyphMid:   '#ffbe3d', glyphCore:'#fff4b8'
      },
      fx: {
        steam:  '#f7f2e6',
        glyphA: '#ffbe3d',
        glyphB: '#fff4b8',
        water:  '#80e3d6'
      }
    }
  ];

  // 1. 碑座石槽温水苔池（32×30×6）
  function buildMossPool(makeCanvas) {
    const m = new VoxelModel(32, 30, 6, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-15, 15, -14, 14, 0, 5, (x, y, z, X, Y) => {
      // 八角略不规则古石槽外缘
      const ax = Math.abs(X), ay = Math.abs(Y);
      const octD = Math.max(ax / 14.5, ay / 13.5, (ax + ay) / 21.0);
      if (octD > 1.0) return;

      // 槽内水面区域（z=2..4 铺满清碧矿温水，z=5 仅留外圈石沿）
      const inBasin = octD < 0.78;
      if (inBasin) {
        if (z <= 1) {
          m.setRaw(x, y, z, mat('pebble'), partId.pebble);
        } else if (z <= 4) {
          // 中央碑座承台留石墩（z=0..4, |X|<=5.2, |Y|<=5.2）
          if (ax <= 5.2 && ay <= 5.2) {
            m.setRaw(x, y, z, (ax > 4.2 || ay > 4.2) ? mat('moss') : mat('stone'), (ax > 4.2 || ay > 4.2) ? partId.moss : partId.stone);
          } else {
            m.setRaw(x, y, z, mat('pool'), partId.pool);
          }
        }
        return;
      }

      // 外圈石沿：在右前与左后做自然缺口与青苔缝
      const isNotch = (z >= 4 && X > 8.0 && Math.abs(Y - 4.0) < 2.2);
      if (isNotch) return;

      const isCrackMoss = (
        (Math.abs(X - Y * 0.8) < 1.2 && z >= 2) ||
        (Math.abs(X + Y * 0.9) < 1.1 && z >= 3) ||
        (z === 5 && octD < 0.88 && Math.sin(X * 0.5 + Y * 0.4) > 0.15)
      );
      if (isCrackMoss) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (z === 5 && octD >= 0.88) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 15.2, headZ: 6, centerZ: 3 });
  }

  // 2. 微微倾斜、顶部崩缺一角的厚重四角刻纹古石碑（14×14×32）
  function buildObeliskBody(makeCanvas) {
    const m = new VoxelModel(14, 14, 32, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6, 6, -6, 6, 0, 31, (x, y, z, X, Y) => {
      const t = z / 31;
      // 约 5~6° 微微自然倾斜（顶部向 +X, -Y 偏约 1.8 格）
      const cx = t * 1.75;
      const cy = -t * 0.85;
      const dx = X - cx;
      const dy = Y - cy;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);

      // 碑身略收尖，顶部尖帽在 z=27..31 急速收束
      const halfW = t > 0.84 ? lerp(3.6, 1.0, (t - 0.84) / 0.16) : lerp(4.7, 3.6, t);
      if (ax > halfW || ay > halfW) return;
      // 切去极角增加古石厚重倒角
      if (ax > halfW - 0.65 && ay > halfW - 0.65) return;

      // 顶部右前角明显崩缺一角（z >= 22, dx > 0.6, dy > 0.2）
      if (z >= 22 && dx + dy * 0.8 + (z - 22) * 0.35 > 3.6 && dx > 0.4) return;

      const onFace = (ax >= halfW - 0.9 || ay >= halfW - 0.9);
      // 遗1 同源回字 / 九宫几何古纹（分下/中/上三段）
      const uCoord = ax >= halfW - 0.9 ? Math.abs(dy) : Math.abs(dx);
      const isLowGrid = (z >= 4 && z <= 10) && (
        Math.abs(uCoord - 2.2) < 0.55 || z === 4 || z === 10 || (z === 7 && uCoord < 1.2)
      );
      const isMidGrid = (z >= 13 && z <= 19) && (
        Math.abs(uCoord - 1.9) < 0.55 || Math.abs(uCoord - 0.0) < 0.55 || z === 13 || z === 16 || z === 19
      );
      const isTopGrid = (z >= 21 && z <= 25) && (
        Math.abs(uCoord - 1.6) < 0.55 || z === 21 || z === 25
      );
      const isCarve = onFace && (isLowGrid || isMidGrid || isTopGrid);

      // 石缝亮绿苔：从底部与裂缝蔓延上去
      const isMoss = onFace && (
        (z <= 5 && (dx < -1.2 || dy > 1.5)) ||
        (z >= 10 && z <= 13 && dx < -1.8) ||
        (z >= 20 && z <= 23 && dy < -1.6)
      );
      const isBreakChip = (z >= 21 && dx > 0.1 && dx + dy * 0.8 + (z - 22) * 0.35 > 2.6);

      if (isMoss) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isCarve) {
        m.setRaw(x, y, z, mat('carve'), partId.carve);
      } else if (isBreakChip || z >= 29) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 6.2, headZ: 32, centerZ: 15 });
  }

  // 3. 三段独立几何自亮刻纹（下/中/上，分别控 opacity 实现自下而上依次泛起）
  function buildGlyphBand(makeCanvas, W, D, H, halfW, tiltOffX, tiltOffY, mode) {
    const m = new VoxelModel(W, D, H, SPEC);
    const { keyToId, partId } = SPEC;

    m.fillAABB(-(W >> 1), (W >> 1), -(D >> 1), (D >> 1), 0, H - 1, (x, y, z, X, Y) => {
      const dx = X - tiltOffX;
      const dy = Y - tiltOffY;
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const onRim = (
        (Math.abs(ax - halfW) <= 0.65 && ay <= halfW - 0.6) ||
        (Math.abs(ay - halfW) <= 0.65 && ax <= halfW - 0.6)
      );
      if (!onRim) return;

      const u = Math.abs(ax - halfW) <= 0.65 ? ay : ax;
      let hit = false;
      let isCore = false;
      if (mode === 'low') {
        // 回字纹
        hit = (z === 1 || z === H - 2 || Math.abs(u - (halfW - 1.8)) < 0.55 || (z === (H >> 1) && u < 1.1));
        isCore = (z === (H >> 1) && u < 1.1);
      } else if (mode === 'mid') {
        // 九宫纹
        hit = (z === 1 || z === (H >> 1) || z === H - 2 || Math.abs(u - 1.7) < 0.55 || u < 0.55);
        isCore = (z === (H >> 1) && u < 0.65);
      } else {
        // 顶环纹（避开右上崩缺角）
        if (dx > 0.5 && dy > 0.2 && z >= 3) return;
        hit = (z === 1 || z === H - 2 || Math.abs(u - 1.5) < 0.55);
        isCore = (z === H - 2 && u < 1.8);
      }
      if (hit) {
        m.setRaw(x, y, z, isCore ? keyToId.glyphCore : keyToId.glyphMid, partId.glyph);
      }
    });

    return m.toStripAsset(makeCanvas, { footRadius: halfW + 1.0, headZ: H, centerZ: H * 0.5 });
  }

  // 4. 碑顶崩缺掉落在池边的小残石角（7×7×5）
  function buildCornerChip(makeCanvas) {
    const m = new VoxelModel(7, 7, 5, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-3, 3, -3, 3, 0, 4, (x, y, z, X, Y) => {
      const topZ = 3.8 - X * 0.45 - Y * 0.3;
      if (z > topZ) return;
      if (Math.hypot(X / 2.8, Y / 2.5) > 1.0) return;
      const isMoss = (X < -0.8 && z >= 1);
      const isRim = (z >= topZ - 0.8);
      m.setRaw(x, y, z, isMoss ? mat('moss') : (isRim ? mat('rim') : mat('stone')), isMoss ? partId.moss : (isRim ? partId.rim : partId.stone));
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2, headZ: 5, centerZ: 2 });
  }

  const Def = {
    id: 'scene_t16_moss_obelisk',
    code: 'T16',
    name: '刻纹古石碑与温水苔池',
    status: 'done',
    defaultHabitat: 'ruins',
    tag: 'T16 苔藓古石遗迹 · 刻纹古石碑与温水苔池',
    summary: '微微倾斜、顶部崩缺一角的厚重四角刻纹古石碑（碑身刻遗1同源回字/九宫几何古纹与亮绿石缝苔），碑座围着渗满清碧矿温水的石槽小池；支持温水缓冒微雾待机与刻纹自下而上依次唤醒演出及 3 套换色皮肤',
    footRadius: 15.8,
    ecoWeight: 3.5,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',         name: '温水缓雾与古纹沉静', loop: true,  status: 'done' },
      { id: 'awaken_glyph', name: '古纹自下而上唤醒',   loop: false, duration: 2.4, status: 'done' }
    ],
    blocks: [
      '微微倾斜且顶部崩缺一角的四角刻纹古石碑',
      '遗1 同源回字/九宫几何古纹 + 三段独立自亮刻纹层',
      '碑座八角古石槽温水池（清碧矿温水 + 亮绿石缝苔）',
      '温水池面缓升细薄白温气 + 唤醒时池面涟漪与矿粒升腾'
    ],
    soulHabit: '常态下温水石槽缓缓升腾细薄白温气、碑身古纹沉静；唤醒时回字与九宫刻纹自下而上依次泛起温润青金自亮，池面荡开一圈清亮涟漪并升起矿粒',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        mossPool:    buildMossPool(makeCanvas),
        obeliskBody: buildObeliskBody(makeCanvas),
        glyphLow:    buildGlyphBand(makeCanvas, 12, 12, 8, 4.6, 0.4, -0.2, 'low'),
        glyphMid:    buildGlyphBand(makeCanvas, 11, 11, 8, 4.2, 0.9, -0.45, 'mid'),
        glyphTop:    buildGlyphBand(makeCanvas, 10, 10, 7, 3.8, 1.35, -0.65, 'top'),
        cornerChip:  buildCornerChip(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0.16,
        glyphOps: [0.16, 0.14, 0.12],
        steamCd: 0.45,
        lastAction: 'idle',
        awakenStage: 0
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
          state.glyphOps = [0.16, 0.14, 0.12];
          state.steamCd = 0.45;
          state.lastAction = 'idle';
          state.awakenStage = 0;
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
            state.awakenStage = 0;
          }

          // 温水池面常态与唤醒态均缓缓升腾细薄白温气
          state.steamCd -= dt;
          const steamInterval = (action === 'awaken_glyph' ? 0.22 : 0.48) / freq;
          if (state.steamCd <= 0 && vfx) {
            state.steamCd = steamInterval + Math.random() * 0.22;
            const ang = Math.random() * TAU;
            const r = (5.8 + Math.random() * 4.2) * sMul;
            const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, Math.cos(ang) * r, Math.sin(ang) * r);
            vfx.spawnParticle(
              sx, sy, 4.4 * sMul,
              (Math.random() - 0.5) * 1.2 * sMul,
              (Math.random() - 0.5) * 1.2 * sMul,
              (4.2 + Math.random() * 2.4) * sMul,
              1.35 + Math.random() * 0.45,
              1.35 + Math.random() * 0.35,
              fx.steam,
              false,
              -0.9
            );
          }

          if (action === 'idle') {
            // 古纹沉静，仅有极微弱呼吸感
            const b = 0.14 + Math.sin(time * 1.3 * freq) * 0.04;
            state.glyphOps[0] = b + 0.02;
            state.glyphOps[1] = b;
            state.glyphOps[2] = Math.max(0.08, b - 0.02);
          } else if (action === 'awaken_glyph') {
            const u = clamp(actionTime / 2.4, 0, 1);
            // 自下而上三段依次泛起温润青金自亮，尾段平滑回落
            const fadeOut = 1 - smoothstep(0.76, 1.0, u);
            const band0 = smoothstep(0.04, 0.22, u) * fadeOut;
            const band1 = smoothstep(0.24, 0.44, u) * fadeOut;
            const band2 = smoothstep(0.44, 0.64, u) * fadeOut;
            state.glyphOps[0] = clamp(0.16 + band0 * 0.84, 0.14, 1.0);
            state.glyphOps[1] = clamp(0.14 + band1 * 0.86, 0.12, 1.0);
            state.glyphOps[2] = clamp(0.12 + band2 * 0.88, 0.10, 1.0);

            // 阶段 0（下段亮起）：池面荡开一圈涟漪
            if (state.awakenStage === 0 && u >= 0.12 && vfx) {
              state.awakenStage = 1;
              vfx.addRipple(state.x, state.y, 5.5 * sMul, 18.5 * sMul, 1.05, 1.9);
              vfx.addRipple(state.x, state.y, 4.0 * sMul, 13.0 * sMul, 0.78, 1.4);
            }

            // 阶段 1（中上段亮起）：碑周与池面升起温润青金矿粒
            if (state.awakenStage === 1 && u >= 0.42 && vfx) {
              state.awakenStage = 2;
              for (let k = 0; k < 14; k++) {
                const a = (k / 14) * TAU;
                const r = (5.0 + (k % 3) * 2.2) * sMul;
                const [px, py] = localToWorldXY(state.x, state.y, state.yaw, Math.cos(a) * r, Math.sin(a) * r);
                vfx.spawnParticle(
                  px, py, (6.0 + (k % 4) * 4.5) * sMul,
                  -Math.sin(a) * 2.4 * sMul, Math.cos(a) * 2.4 * sMul, (7.5 + Math.random() * 4.5) * sMul,
                  1.25 + Math.random() * 0.35,
                  1.35 + Math.random() * 0.35,
                  k % 2 === 0 ? fx.glyphA : fx.glyphB,
                  true,
                  -1.5
                );
              }
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const list = [];

          // 1. 碑座石槽温水苔池
          list.push({
            partKey: 'mossPool',
            asset: parts.mossPool,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            bias: -0.35
          });

          // 2. 池边跌落的碑顶残石角
          const [cx, cy] = localToWorldXY(state.x, state.y, yw, 10.6 * sMul, 6.4 * sMul);
          list.push({
            partKey: 'cornerChip',
            asset: parts.cornerChip,
            x: cx,
            y: cy,
            lift: 0.5 * sMul,
            ro: wrapAngle(yw + 0.52),
            bias: -0.10
          });

          // 3. 微微倾斜的刻纹古石碑主体
          list.push({
            partKey: 'obeliskBody',
            asset: parts.obeliskBody,
            x: state.x,
            y: state.y,
            lift: 3.5 * sMul,
            ro: yw,
            bias: 0.08
          });

          // 4. 三段独立几何自亮刻纹（下/中/上依次点亮）
          list.push({
            partKey: 'glyphLow',
            asset: parts.glyphLow,
            x: state.x,
            y: state.y,
            lift: 6.5 * sMul,
            ro: yw,
            opacity: state.glyphOps[0],
            bias: 0.32
          });
          list.push({
            partKey: 'glyphMid',
            asset: parts.glyphMid,
            x: state.x,
            y: state.y,
            lift: 15.5 * sMul,
            ro: yw,
            opacity: state.glyphOps[1],
            bias: 0.34
          });
          list.push({
            partKey: 'glyphTop',
            asset: parts.glyphTop,
            x: state.x,
            y: state.y,
            lift: 23.5 * sMul,
            ro: yw,
            opacity: state.glyphOps[2],
            bias: 0.36
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
