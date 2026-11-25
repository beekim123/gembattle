'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T03 河湖深潭 · 深潭涌温水苔岩（scenes/scene_t03_warm_vent_rock.js）
  //
  // 紧扣 T03「下层是从地下渗上来的带矿温水」规矩：
  //   - submergedBase (34×32×10, submerge: 0.58)：水下宽大青灰岩基，自然染进深碧潭水
  //   - rockMound     (28×26×18)                ：半浸裂岩墩，岩缝深处微露淡橙黄矿水眼（进 glowKeys）
  //   - mossCap       (24×22×9)                 ：顶部厚实鲜翠水苔垫，与深青岩形成强对比
  //   - bubbleTuft    (8×8×6, symDeg: 90)       ：岩缝口翻涌上浮的暖白温水泡簇
  //
  // 展示动作：
  //   - idle       ：间隔冒出细密温水泡、轻柔水雾粒与同心涟漪
  //   - warm_surge ：地下温水涌动增强，岩缝成串翻涌大量白气泡与浅青矿粒、水面连泛多圈涟漪
  // =========================================================================

  // 20 色独立色表（严守 <= 48 色、0 重色；仅微温矿核 2 色进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 深青灰裂岩主体（3 档）
      rockDark:    '#25333d',
      rockMid:     '#3f5463',
      rockHi:      '#688394',
      // 岩缝湿润矿渍壁（3 档）
      crustDark:   '#3b5c5e',
      crustMid:    '#5d9491',
      crustHi:     '#9bd4cc',
      // 顶部厚实鲜翠水苔（3 档）
      mossDark:    '#18592b',
      mossMid:     '#2fa346',
      mossHi:      '#6be065',
      // 苔间嫩芽点缀（3 档）
      sproutDark:  '#427a27',
      sproutMid:   '#74bd3c',
      sproutHi:    '#b6ed68',
      // 温水暖白气泡簇（3 档，不进 glowKeys）
      foamDark:    '#8dc4cf',
      foamMid:     '#c7edf2',
      foamHi:      '#f5feff',
      // 岩缝内温矿水（3 档，非自亮过渡）
      mineralDark: '#8c531b',
      mineralMid:  '#c97f2c',
      mineralHi:   '#f2b652',
      // 岩缝深处微温矿水眼（仅此 2 键进 glowKeys）
      ventWarm:    '#f5a83d',
      ventCore:    '#fff0a6'
    },
    glowKeys: ['ventWarm', 'ventCore'],
    parts: ['rock', 'crust', 'moss', 'sprout', 'foam', 'mineral', 'vent'],
    noCrease: [
      ['rock', 'crust'],
      ['rock', 'moss'],
      ['moss', 'sprout'],
      ['mineral', 'vent'],
      ['crust', 'mineral']
    ],
    materials: {
      rock:    ['rockDark',    'rockMid',    'rockHi'],
      crust:   ['crustDark',   'crustMid',   'crustHi'],
      moss:    ['mossDark',    'mossMid',    'mossHi'],
      sprout:  ['sproutDark',  'sproutMid',  'sproutHi'],
      foam:    ['foamDark',    'foamMid',    'foamHi'],
      mineral: ['mineralDark', 'mineralMid', 'mineralHi']
    },
    protectedParts: ['vent', 'foam', 'sprout']
  });

  // 3 套零重建模换色皮肤（翠苔碧矿 / 暖褐金矿 / 苍岩青矿）
  const SKINS = [
    {
      id: 'emerald_jade_vent',
      name: '翠苔碧矿',
      dot: '#2fa346',
      outline: '#0a161c',
      pal: {},
      fx: {
        bubbleA: '#e8fcff',
        bubbleB: '#b8edf5',
        mineral: '#7ce3d6',
        mist:    '#d8f5f7',
        warmBit: '#ffd478'
      }
    },
    {
      id: 'warm_ochre_gold',
      name: '暖褐金矿',
      dot: '#d99330',
      outline: '#17110d',
      pal: {
        rockDark:    '#382c24', rockMid:    '#5c493b', rockHi:    '#8a715e',
        crustDark:   '#6b4e2b', crustMid:   '#a37a43', crustHi:   '#d9b06a',
        mossDark:    '#4d591f', mossMid:    '#82942c', mossHi:    '#bdd154',
        sproutDark:  '#696e21', sproutMid:  '#a1a832', sproutHi:  '#dbe060',
        mineralDark: '#944a14', mineralMid: '#d67820', mineralHi: '#ffb347',
        ventWarm:    '#ff9d2e', ventCore:   '#fff3ad'
      },
      fx: {
        bubbleA: '#fff8e8',
        bubbleB: '#fae4bc',
        mineral: '#f5be58',
        mist:    '#f2ebd8',
        warmBit: '#ffe082'
      }
    },
    {
      id: 'pale_slate_aqua',
      name: '苍岩青矿',
      dot: '#5cd1c5',
      outline: '#0b181f',
      pal: {
        rockDark:    '#303e47', rockMid:    '#526875', rockHi:    '#829ead',
        crustDark:   '#28666e', crustMid:   '#45a3ad', crustHi:   '#8ae0e6',
        mossDark:    '#1d5e50', mossMid:    '#329c82', mossHi:    '#6fd9b9',
        sproutDark:  '#2e7a67', sproutMid:  '#54bd9f', sproutHi:  '#92ebd0',
        mineralDark: '#1c787a', mineralMid: '#30b8b5', mineralHi: '#7ef0e8',
        ventWarm:    '#3de6d5', ventCore:   '#d6fffb'
      },
      fx: {
        bubbleA: '#e8ffff',
        bubbleB: '#b0f2f5',
        mineral: '#5cebe0',
        mist:    '#d4f4f7',
        warmBit: '#8ef7ed'
      }
    }
  ];

  // =========================================================================
  // 1. 水下深青灰裂岩底座（34×32×10，配合 submerge: 0.58）
  // =========================================================================
  function buildSubmergedBase(makeCanvas) {
    const m = new VoxelModel(34, 32, 10, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-16, 16, -15, 15, 0, 9, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X * 0.96, Y * 1.04);
      const maxR = (14.6 - z * 0.42) + Math.sin(ang * 5 + 0.6) * 1.6 + Math.cos(ang * 3) * 1.2;
      if (r > maxR) return;
      // 靠前侧裂开一条水下矿水道
      const inChannel = Y > 0.5 && Math.abs(X - Math.sin(Y * 0.2) * 1.4) < 2.2 && z > 2;
      if (inChannel) return;
      const nearChannel = Y > -1.0 && Math.abs(X - Math.sin(Y * 0.2) * 1.4) < 3.6 && z >= 3;
      m.setRaw(x, y, z, nearChannel ? mat('crust') : mat('rock'), nearChannel ? partId.crust : partId.rock);
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 15.5, headZ: 10, centerZ: 4 });
  }

  // =========================================================================
  // 2. 半浸深青灰裂岩墩 + 淡橙黄矿水眼（28×26×18）
  // =========================================================================
  function buildRockMound(makeCanvas) {
    const m = new VoxelModel(28, 26, 18, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-13, 13, -12, 12, 0, 17, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const tZ = z / 17;
      const r = Math.hypot(X * 0.95, Y * 1.05);
      const ridge = Math.sin(ang * 4 + z * 0.12) * 1.4 + Math.cos(ang * 6 - 0.5) * 0.85;
      const maxR = (11.6 - tZ * 4.4) + ridge * (1 - tZ * 0.35);
      if (r > maxR) return;

      // 从正面偏中斜切出深邃温水裂隙（Y > -2.5）
      const crackX = Math.sin(Y * 0.25 + z * 0.1) * 1.1;
      const crackW = 2.05 - tZ * 0.45;
      const inCrack = Y > -2.6 && Math.abs(X - crackX) < crackW && z >= 2 && z <= 13;

      if (inCrack) {
        // 岩缝深处微露淡橙黄矿水眼（仅核心极小区域进 glowKeys）
        const eyeDist = Math.hypot(X - crackX, (Y - 1.2) * 0.75, (z - 5.2) * 0.85);
        if (eyeDist <= 1.75) {
          m.setRaw(x, y, z, keyToId.ventCore, partId.vent);
          return;
        }
        if (eyeDist <= 2.95 && Y < 4.5) {
          m.setRaw(x, y, z, keyToId.ventWarm, partId.vent);
          return;
        }
        // 外侧挖空形成立体岩缝深槽
        if (Y > 2.2 && z > 3) return;
        m.setRaw(x, y, z, mat('mineral'), partId.mineral);
        return;
      }

      // 裂隙边缘析出浅青矿渍
      const isCrust = Y > -3.5 && Math.abs(X - crackX) < crackW + 1.6 && z >= 1 && z <= 14;
      m.setRaw(x, y, z, isCrust ? mat('crust') : mat('rock'), isCrust ? partId.crust : partId.rock);
    });

    // 左右两块翘起的天然岩肩增强轮廓辨识度
    m.paintEllipsoid(-6.8, -2.5, 11.5, 4.0, 3.6, 4.2, mat('rock'), partId.rock, true);
    m.paintEllipsoid( 6.4, -1.8, 10.2, 3.6, 3.4, 3.6, mat('rock'), partId.rock, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 12.5, headZ: 17, centerZ: 8 });
  }

  // =========================================================================
  // 3. 顶部厚实鲜翠水苔垫（24×22×9）
  // =========================================================================
  function buildMossCap(makeCanvas) {
    const m = new VoxelModel(24, 22, 9, SPEC);
    const { mat, partId } = SPEC;

    // 主苔冠与垂挂岩肩的厚苔块
    m.paintEllipsoid( 0.0, -2.6, 4.2, 7.6, 5.8, 3.2, mat('moss'), partId.moss, true);
    m.paintEllipsoid(-6.2, -1.8, 3.0, 4.2, 3.6, 2.5, mat('moss'), partId.moss, true);
    m.paintEllipsoid( 5.8, -1.2, 2.4, 3.8, 3.4, 2.2, mat('moss'), partId.moss, true);
    m.paintEllipsoid(-3.4,  2.8, 1.8, 3.0, 2.4, 1.6, mat('moss'), partId.moss, true);
    m.paintEllipsoid( 4.2,  2.6, 1.5, 2.6, 2.2, 1.4, mat('moss'), partId.moss, true);

    // 顶部点缀几簇鲜亮嫩草芽
    const tufts = [
      [-3.5, -3.2, 6.2, -4.6, -3.8, 8.2],
      [ 1.2, -4.0, 6.5,  1.8, -4.6, 8.4],
      [ 5.4, -1.6, 4.2,  6.5, -1.2, 6.4]
    ];
    for (const [ax, ay, az, bx, by, bz] of tufts) {
      m.paintCapsule(ax, ay, az, bx, by, bz, 0.9, 0.55, mat('sprout'), partId.sprout, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.5, headZ: 9, centerZ: 4 });
  }

  // =========================================================================
  // 4. 岩缝口翻涌暖白气泡簇（8×8×6，symDeg: 90）
  // =========================================================================
  function buildBubbleTuft(makeCanvas) {
    const m = new VoxelModel(8, 8, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid( 0.0,  0.0, 2.0, 2.1, 2.1, 1.8, mat('foam'), partId.foam, true);
    m.paintEllipsoid( 1.9,  1.2, 1.6, 1.2, 1.2, 1.1, mat('foam'), partId.foam, true);
    m.paintEllipsoid(-1.9, -1.2, 1.6, 1.2, 1.2, 1.1, mat('foam'), partId.foam, true);
    m.paintEllipsoid(-1.2,  1.9, 2.6, 1.1, 1.1, 1.0, mat('foam'), partId.foam, true);
    m.paintEllipsoid( 1.2, -1.9, 2.6, 1.1, 1.1, 1.0, mat('foam'), partId.foam, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 5, centerZ: 2 });
  }

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t03_warm_vent_rock',
    code: 'T03',
    name: '深潭涌温水苔岩',
    status: 'done',
    defaultHabitat: 'river',
    tag: 'T03 河湖深潭地下温水矿眼地貌',
    summary: '半浸深潭的深青灰裂岩墩，岩缝深处微露淡橙黄自亮矿水眼，顶部覆满厚实鲜翠水苔，岩缝间不断冒出咕嘟上浮的暖白温水气泡并荡开同心涟漪',
    footRadius: 17.5,
    ecoWeight: 3.2,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',       name: '温泉轻涌', loop: true,  status: 'done' },
      { id: 'warm_surge', name: '地矿强涌', loop: false, duration: 2.4, status: 'done' }
    ],
    blocks: ['浸水青灰裂岩基座', '微温矿眼裂岩墩', '鲜翠厚水苔顶冠', '咕嘟暖白温水泡'],
    soulHabit: '平时岩缝间隔冒出细密温水泡与轻柔水雾；地下温水强涌时成串翻涌大量白气泡与浅青矿粒，水面连泛多圈涟漪',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        submergedBase: buildSubmergedBase(makeCanvas),
        rockMound:     buildRockMound(makeCanvas),
        mossCap:       buildMossCap(makeCanvas),
        bubbleTuft:    buildBubbleTuft(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0.15,
        shadowScale: 0.9,
        t: 0,
        surgeEnv: 0,
        bubbleCd: 0.2,
        mistCd: 0.45,
        rippleCd: 0.7,
        lastAction: 'idle',
        surgeRipples: 0
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
          state.surgeEnv = 0;
          state.bubbleCd = 0.2;
          state.mistCd = 0.45;
          state.rippleCd = 0.7;
          state.lastAction = 'idle';
          state.surgeRipples = 0;
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
            state.surgeRipples = 0;
          }

          let surge = 0;
          if (action === 'warm_surge') {
            const u = clamp(actionTime / 2.4, 0, 1);
            surge = smoothstep(0.0, 0.16, u) * (1 - smoothstep(0.68, 1.0, u));
          }
          state.surgeEnv = surge;

          if (!vfx) return;

          // 岩缝出水口世界坐标
          const [vx, vy] = localToWorldXY(state.x, state.y, state.yaw, 0.2 * sMul, 5.8 * sMul);

          // 1. 持续冒出的暖白温水泡与浅青矿粒
          state.bubbleCd -= dt;
          const bubbleInterval = surge > 0.15 ? 0.055 : 0.24;
          if (state.bubbleCd <= 0) {
            state.bubbleCd = bubbleInterval;
            const count = surge > 0.35 ? 3 : 1;
            for (let i = 0; i < count; i++) {
              const a = Math.random() * TAU;
              const rr = (0.8 + Math.random() * (2.6 + surge * 2.2)) * sMul;
              const isMineral = surge > 0.2 && (i === 2 || Math.random() < 0.38);
              vfx.spawnParticle(
                vx + Math.cos(a) * rr,
                vy + Math.sin(a) * rr,
                (3.0 + Math.random() * 2.4) * sMul,
                Math.cos(a) * (1.2 + surge * 3.8) * sMul,
                Math.sin(a) * (1.2 + surge * 3.8) * sMul,
                (7.5 + Math.random() * 5.0 + surge * 8.5) * sMul,
                0.75 + Math.random() * 0.45,
                isMineral ? 1.2 : (1.35 + Math.random() * 0.65),
                isMineral ? fx.mineral : (i % 2 === 0 ? fx.bubbleA : fx.bubbleB),
                isMineral,
                1.5
              );
            }
          }

          // 2. 轻柔温水水雾粒
          state.mistCd -= dt;
          if (state.mistCd <= 0) {
            state.mistCd = surge > 0.2 ? 0.18 : 0.46;
            const a = Math.random() * TAU;
            vfx.spawnParticle(
              vx + Math.cos(a) * 2.5 * sMul,
              vy + Math.sin(a) * 2.5 * sMul,
              (5.5 + Math.random() * 2.5) * sMul,
              Math.cos(time * 0.9) * 1.8 * sMul,
              Math.sin(time * 0.7) * 1.4 * sMul,
              (5.0 + surge * 3.5) * sMul,
              1.1 + Math.random() * 0.45,
              1.8 + Math.random() * 0.6,
              fx.mist,
              false,
              -0.6
            );
          }

          // 3. 同心水面涟漪
          if (action === 'idle') {
            state.rippleCd -= dt;
            if (state.rippleCd <= 0) {
              state.rippleCd = 1.25 + Math.random() * 0.6;
              vfx.addRipple(vx, vy, 3.2 * sMul, 16.5 * sMul, 1.35, 1.35);
            }
          } else if (action === 'warm_surge') {
            const beats = [0.10, 0.45, 0.85, 1.25, 1.65];
            while (state.surgeRipples < beats.length && actionTime >= beats[state.surgeRipples]) {
              vfx.addRipple(vx, vy, 3.5 * sMul, (22.0 + state.surgeRipples * 2.2) * sMul, 1.4, 1.75);
              // 伴随微暖矿点上浮
              vfx.spawnParticle(
                vx, vy, 4.5 * sMul,
                (Math.random() - 0.5) * 4.0 * sMul,
                (Math.random() - 0.5) * 4.0 * sMul,
                12.5 * sMul,
                0.75, 1.35, fx.warmBit, true, 3.0
              );
              state.surgeRipples++;
            }
          }
        },

        buildPartList(habitat) {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.t;
          const surge = state.surgeEnv;
          const wl = (habitat && habitat.isWater) ? (habitat.waterLevel ?? 2.8) : 0.8;
          const list = [];

          // 1. 水下裂岩基座（submerge: 0.58 染入深碧潭水）
          list.push({
            partKey: 'submergedBase',
            asset: parts.submergedBase,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            submerge: 0.58,
            bias: -0.35
          });

          // 2. 半浸深青灰裂岩墩 + 淡橙黄矿水眼
          list.push({
            partKey: 'rockMound',
            asset: parts.rockMound,
            x: state.x,
            y: state.y,
            lift: 1.5 * sMul,
            ro: yw,
            bias: 0.0
          });

          // 3. 顶部厚实鲜翠水苔垫
          list.push({
            partKey: 'mossCap',
            asset: parts.mossCap,
            x: state.x,
            y: state.y,
            lift: 13.0 * sMul,
            ro: yw,
            bias: 0.18
          });

          // 4. 岩缝口咕嘟上浮的暖白温水泡簇
          const [bx, by] = localToWorldXY(state.x, state.y, yw, 0.2 * sMul, 6.0 * sMul);
          const bubLift = wl + 0.15 + Math.sin(t * (4.2 + surge * 4.5)) * (0.65 + surge * 1.35) + surge * 1.4;
          list.push({
            partKey: 'bubbleTuft',
            asset: parts.bubbleTuft,
            x: bx + Math.sin(t * 5.2) * 0.4 * sMul,
            y: by + Math.cos(t * 4.6) * 0.4 * sMul,
            lift: Math.max(1.2, bubLift * sMul),
            ro: wrapAngle(yw + t * (0.9 + surge * 1.6)),
            symDeg: 90,
            noOutline: true,
            bias: 0.35
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
