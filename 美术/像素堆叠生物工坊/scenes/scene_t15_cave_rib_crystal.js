'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T15 · 暗河矿脉晶柱与碎砾堆（scenes/scene_t15_cave_rib_crystal.js）
  // -------------------------------------------------------------------------
  // 呼应 T15（地下暗河溶洞）与洞4 拼骨幼虫（捡骨渣补壳）：
  // 拆件与图集预算（单盒严格 <= 30 格，底座半浸暗河 submerge: 0.45）：
  //   1. wetBase      (30×28×10, submerge: 0.45) : 半浸暗河水的深色湿岩基座 + 浅蓝灰水线
  //   2. crystalMain  (12×12×30)                 : 主斜刺粗多棱石英矿晶柱
  //   3. crystalSide  (10×10×22)                 : 中斜向矿晶柱（复用 2 根不同朝向）
  //   4. crystalSmall (8×8×15)                   : 矮尖副矿晶柱（复用 2 根，共 5 根晶簇）
  //   5. crystalCore  (6×6×15, symDeg: 90)       : 晶柱微亮核心（仅此件进 glowKeys，支持依次共振）
  //   6. gravelBones  (16×14×6)                  : 浅灰碎石渣与零碎象牙白骨片（呼应洞4补壳）
  // 严禁常态 scaleX/scaleY 拉伸；20 色 0 重色 0 禁用字
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 深色湿润溶洞基岩（3 档）
      rockDark:     '#212736',
      rockMid:      '#374157',
      rockHi:       '#5a6987',
      // 湿岩浅蓝灰切棱与水线（3 档）
      rimDark:      '#4f6482',
      rimMid:       '#7896bd',
      rimHi:        '#b0cef0',
      // 饱和亮天蓝/冰青石英矿晶外壳（3 档，强对比提亮暗洞）
      crysDark:     '#1b78a8',
      crysMid:      '#45bfe8',
      crysHi:       '#9ceeff',
      // 晶柱多棱切面亮边（3 档）
      facetDark:    '#2c9ac9',
      facetMid:     '#70d7f5',
      facetHi:      '#cef7ff',
      // 岩脚浅灰碎石渣（3 档）
      gravelDark:   '#596270',
      gravelMid:    '#8894a6',
      gravelHi:     '#bec8d6',
      // 零碎象牙白骨片（3 档，呼应洞4拼骨幼虫补壳）
      boneDark:     '#968d7b',
      boneMid:      '#cfc6b2',
      boneHi:       '#f5efe0',
      // 仅晶柱核心微亮进 glowKeys（2 键）
      crysGlowMid:  '#6be4ff',
      crysGlowCore: '#e6fcff'
    },
    glowKeys: ['crysGlowMid', 'crysGlowCore'],
    parts: ['rock', 'rim', 'crys', 'facet', 'gravel', 'bone', 'crysGlow'],
    noCrease: [
      ['rock', 'rim'],
      ['crys', 'facet'],
      ['crys', 'crysGlow'],
      ['facet', 'crysGlow'],
      ['rock', 'gravel'],
      ['gravel', 'bone']
    ],
    materials: {
      rock:   ['rockDark',   'rockMid',   'rockHi'],
      rim:    ['rimDark',    'rimMid',    'rimHi'],
      crys:   ['crysDark',   'crysMid',   'crysHi'],
      facet:  ['facetDark',  'facetMid',  'facetHi'],
      gravel: ['gravelDark', 'gravelMid', 'gravelHi'],
      bone:   ['boneDark',   'boneMid',   'boneHi']
    },
    protectedParts: ['crysGlow', 'facet', 'bone']
  });

  // 3 套换色皮肤（每套 20 色 0 重色 0 禁用字）
  const SKINS = [
    {
      id: 'ice_blue_vein',
      name: '冰蓝矿脉',
      dot: '#45bfe8',
      outline: '#0b131f',
      pal: {},
      fx: {
        dustA: '#70e2ff',
        dustB: '#e8fdff',
        water: '#88c8eb'
      }
    },
    {
      id: 'amethyst_dark_rock',
      name: '紫晶暗岩',
      dot: '#a86bf5',
      outline: '#130b1f',
      pal: {
        rockDark:     '#241e33', rockMid:   '#3b3252', rockHi:   '#625482',
        rimDark:      '#5d507d', rimMid:    '#8a7ab3', rimHi:    '#bfb2e6',
        crysDark:     '#5f2ba3', crysMid:   '#9a5ce6', crysHi:   '#d4adff',
        facetDark:    '#7a40c4', facetMid:  '#b882fa', facetHi:  '#ebd9ff',
        gravelDark:   '#5d586e', gravelMid: '#8d87a3', gravelHi: '#c3bed6',
        crysGlowMid:  '#bd85ff', crysGlowCore: '#f4e8ff'
      },
      fx: {
        dustA: '#bd85ff',
        dustB: '#f4e8ff',
        water: '#a896e0'
      }
    },
    {
      id: 'jade_mineral_vein',
      name: '翠碧玉脉',
      dot: '#36c993',
      outline: '#0a1a15',
      pal: {
        rockDark:     '#1e2e2b', rockMid:   '#324d48', rockHi:   '#527a72',
        rimDark:      '#48736a', rimMid:    '#6ea69a', rimHi:    '#a8dbcf',
        crysDark:     '#147a57', crysMid:   '#2ec48f', crysHi:   '#80f2c4',
        facetDark:    '#1f9c70', facetMid:  '#58dea9', facetHi:  '#c4ffe6',
        gravelDark:   '#546963', gravelMid: '#829c94', gravelHi: '#b8cfc7',
        crysGlowMid:  '#52f0b4', crysGlowCore: '#dcfff0'
      },
      fx: {
        dustA: '#52f0b4',
        dustB: '#dcfff0',
        water: '#7cd9c2'
      }
    }
  ];

  // 1. 半浸暗河水的深色湿岩基座（30×28×10）
  function buildWetBase(makeCanvas) {
    const m = new VoxelModel(30, 28, 10, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-14, 14, -13, 13, 0, 9, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const crag = Math.sin(ang * 4 + 0.5) * 1.5 + Math.cos(ang * 3 - 0.8) * 1.2;
      const t = z / 9;
      const rx = 12.2 - t * 2.8 + crag * 0.6;
      const ry = 11.0 - t * 2.5 + crag * 0.5;
      const d = Math.hypot(X / rx, Y / ry);
      if (d > 1.0) return;

      // 岩台棱边浅蓝灰湿润水线（z = 3..4 与顶缘 z = 8..9）
      const isWaterLine = (z === 3 || z === 4) && d > 0.80;
      const isTopRim = (z >= 8 && d > 0.65);
      if (isWaterLine || isTopRim) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else {
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 14.0, headZ: 10, centerZ: 4 });
  }

  // 2. 斜刺多棱石英矿晶柱构建器（六棱柱削尖晶顶 + 清晰亮棱面）
  function buildCrystalPrism(makeCanvas, W, D, H, radius, leanX, leanY) {
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-(W >> 1), (W >> 1), -(D >> 1), (D >> 1), 0, H - 1, (x, y, z, X, Y) => {
      const t = z / Math.max(1, H - 1);
      const cx = leanX * t;
      const cy = leanY * t;
      const dx = X - cx;
      const dy = Y - cy;

      // 六边形棱柱距离度量（清晰棱角感）
      const ax = Math.abs(dx);
      const ay = Math.abs(dy);
      const hexDist = Math.max(ax, ax * 0.5 + ay * 0.866);

      // 上端 25% 锐利削尖为棱锥晶尖
      const tipScale = t > 0.72 ? clamp((1 - t) / 0.28, 0.08, 1.0) : lerp(1.0, 0.88, t);
      const rLim = radius * tipScale;
      if (hexDist > rLim) return;

      // 亮棱面与晶尖切面
      const isFacetEdge = (hexDist > rLim - 0.85 && (dx - dy > -0.3)) || (t > 0.78);
      m.setRaw(x, y, z, isFacetEdge ? mat('facet') : mat('crys'), isFacetEdge ? partId.facet : partId.crys);
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: radius + Math.hypot(leanX, leanY) * 0.5, headZ: H, centerZ: H * 0.45 });
  }

  // 3. 晶柱核心微亮件（6×6×15，symDeg: 90，仅此件进 glowKeys）
  function buildCrystalCore(makeCanvas) {
    const m = new VoxelModel(6, 6, 15, SPEC);
    const { keyToId, partId } = SPEC;

    m.fillAABB(-2, 2, -2, 2, 0, 14, (x, y, z, X, Y) => {
      const t = z / 14;
      const r = Math.hypot(X, Y);
      const maxR = t > 0.75 ? lerp(1.6, 0.4, (t - 0.75) / 0.25) : 1.65;
      if (r <= maxR) {
        const isCenter = r <= 0.85 && z >= 3 && z <= 12;
        m.setRaw(x, y, z, isCenter ? keyToId.crysGlowCore : keyToId.crysGlowMid, partId.crysGlow);
      }
    });

    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 15, centerZ: 7 });
  }

  // 4. 岩脚浅灰碎石渣与零碎白骨片（16×14×6，呼应洞4拼骨幼虫补壳）
  function buildGravelBones(makeCanvas) {
    const m = new VoxelModel(16, 14, 6, SPEC);
    const { mat, partId } = SPEC;

    // 浅灰碎石渣堆
    const rocks = [
      [-4.2, -1.8, 1.4, 2.6, 2.2, 1.5],
      [ 1.8, -2.6, 1.2, 2.2, 1.9, 1.3],
      [-1.5,  2.4, 1.5, 2.8, 2.1, 1.6],
      [ 4.6,  1.2, 1.1, 2.0, 1.7, 1.2],
      [-5.6,  2.8, 0.9, 1.6, 1.4, 1.0],
      [ 0.2,  0.0, 1.3, 2.4, 2.0, 1.3]
    ];
    for (const [rx, ry, rz, a, b, c] of rocks) {
      m.paintEllipsoid(rx, ry, rz, a, b, c, mat('gravel'), partId.gravel, true);
    }

    // 3 块高对比象牙白零碎骨片（小肋骨弧、骨节与扁骨片）
    m.paintCapsule(-3.5, 1.6, 2.5, 1.5, 3.2, 3.0, 0.95, 0.78, mat('bone'), partId.bone, true);
    m.paintEllipsoid(-3.6, 1.5, 2.5, 1.25, 1.1, 0.95, mat('bone'), partId.bone, true);
    m.paintCapsule(2.6, -2.4, 2.1, 5.4, -0.4, 2.6, 0.85, 0.72, mat('bone'), partId.bone, true);
    m.paintEllipsoid(-1.2, -2.6, 2.2, 1.7, 1.1, 0.85, mat('bone'), partId.bone, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 7.5, headZ: 6, centerZ: 2.5 });
  }

  // 5 根斜刺簇生石英矿晶柱布局（1 主 + 2 中 + 2 小）
  const CRYSTALS = [
    { kind: 'main',  lx: -1.2, ly: -1.6, lift: 5.5, ro:  0.25, coreLift: 13.5, tipZ: 34.5, order: 0 },
    { kind: 'side',  lx:  5.2, ly: -2.4, lift: 5.0, ro: -0.65, coreLift: 10.5, tipZ: 26.5, order: 1 },
    { kind: 'side',  lx: -6.2, ly:  0.8, lift: 4.8, ro:  1.85, coreLift: 10.0, tipZ: 25.5, order: 2 },
    { kind: 'small', lx:  2.8, ly:  4.6, lift: 4.5, ro: -2.10, coreLift:  7.5, tipZ: 19.0, order: 3 },
    { kind: 'small', lx: -4.2, ly: -5.4, lift: 4.5, ro:  2.75, coreLift:  7.2, tipZ: 18.5, order: 4 }
  ];

  const Def = {
    id: 'scene_t15_cave_rib_crystal',
    code: 'T15',
    name: '暗河矿脉晶柱与碎砾堆',
    status: 'done',
    defaultHabitat: 'cave',
    tag: 'T15 地下暗河溶洞 · 暗河矿脉晶柱与碎砾堆',
    summary: '半浸暗河水（submerge: 0.45）的湿岩基座中斜刺簇生 5 根亮天蓝/冰青多棱石英矿晶柱，岩脚散落浅灰碎石渣与零碎白骨片（呼应洞4拼骨幼虫补壳）；支持晶柱脉动待机与溶洞回响共振演出及 3 套换色皮肤',
    footRadius: 15.5,
    ecoWeight: 3.4,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',     name: '晶柱脉动与暗河轻拂', loop: true,  status: 'done' },
      { id: 'resonate', name: '溶洞回响依次共振',   loop: false, duration: 2.2, status: 'done' }
    ],
    blocks: [
      '半浸暗河水的深色湿岩基座（submerge: 0.45）',
      '5 根斜刺多棱饱和天蓝石英矿晶柱（复用中/小晶柱省图集）',
      '独立晶柱亮核进 glowKeys，支持回响共振依次脉冲',
      '岩脚浅灰碎石渣与象牙白骨片呼应洞4补壳生态'
    ],
    soulHabit: '常态下晶柱核心微弱脉动、暗河水纹轻拂基岩；回响共振时 5 根晶簇依次亮起脉冲，荡开水面回响涟漪并升起数粒清澈蓝白微尘',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        wetBase:      buildWetBase(makeCanvas),
        crystalMain:  buildCrystalPrism(makeCanvas, 12, 12, 30, 3.6,  2.2, -1.5),
        crystalSide:  buildCrystalPrism(makeCanvas, 10, 10, 22, 2.9,  2.5,  1.2),
        crystalSmall: buildCrystalPrism(makeCanvas, 8,  8,  15, 2.3,  1.8, -1.0),
        crystalCore:  buildCrystalCore(makeCanvas),
        gravelBones:  buildGravelBones(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? -0.18,
        coreOps: [0.55, 0.55, 0.55, 0.55, 0.55],
        waterRippleCd: 1.1,
        lastAction: 'idle',
        resonateStep: 0
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
          state.coreOps = [0.55, 0.55, 0.55, 0.55, 0.55];
          state.waterRippleCd = 1.1;
          state.lastAction = 'idle';
          state.resonateStep = 0;
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
            state.resonateStep = 0;
          }

          if (action === 'idle') {
            for (let i = 0; i < CRYSTALS.length; i++) {
              state.coreOps[i] = 0.42 + (0.5 + 0.5 * Math.sin(time * 2.0 * freq + i * 1.15)) * 0.36;
            }
            // 暗河水纹轻拂基岩
            state.waterRippleCd -= dt;
            if (state.waterRippleCd <= 0 && vfx) {
              state.waterRippleCd = (1.85 + Math.random() * 0.7) / freq;
              const ang = Math.random() * TAU;
              const rx = state.x + Math.cos(ang) * 9.5 * sMul;
              const ry = state.y + Math.sin(ang) * 8.5 * sMul;
              vfx.addRipple(rx, ry, 2.5 * sMul, 14.5 * sMul, 1.1, 1.2);
            }
          } else if (action === 'resonate') {
            const u = clamp(actionTime / 2.2, 0, 1);
            // 5 根晶柱依次亮起脉冲（波峰自 0 扫至 4）
            for (let i = 0; i < CRYSTALS.length; i++) {
              const peakU = 0.12 + i * 0.13;
              const dist = Math.abs(u - peakU);
              const pulse = Math.exp(-(dist * dist) / 0.018);
              state.coreOps[i] = clamp(0.45 + pulse * 0.55, 0.45, 1.0);

              if (state.resonateStep <= i && u >= peakU && vfx) {
                state.resonateStep = i + 1;
                const cr = CRYSTALS[i];
                const [cx, cy] = localToWorldXY(state.x, state.y, state.yaw, cr.lx * sMul, cr.ly * sMul);
                if (i === 0 || i === 2) {
                  vfx.addRipple(state.x, state.y, 4.5 * sMul, (20.0 + i * 2.5) * sMul, 1.05, 1.8);
                }
                // 晶尖升起清澈蓝白微尘
                for (let k = 0; k < 4; k++) {
                  const a = (k / 4) * TAU + Math.random() * 0.6;
                  vfx.spawnParticle(
                    cx + Math.cos(a) * 2.2 * sMul,
                    cy + Math.sin(a) * 2.2 * sMul,
                    (cr.tipZ - 2.5) * sMul,
                    Math.cos(a) * 2.4 * sMul, Math.sin(a) * 2.4 * sMul, (7.5 + Math.random() * 4.5) * sMul,
                    1.15 + Math.random() * 0.35,
                    1.25 + Math.random() * 0.35,
                    k % 2 === 0 ? fx.dustA : fx.dustB,
                    true,
                    -1.4
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

          // 1. 半浸暗河水的湿岩基座（带 submerge: 0.45）
          list.push({
            partKey: 'wetBase',
            asset: parts.wetBase,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            submerge: 0.45,
            bias: -0.35
          });

          // 2. 岩脚浅灰碎石渣与零碎白骨片
          const [gx, gy] = localToWorldXY(state.x, state.y, yw, 5.8 * sMul, 8.2 * sMul);
          list.push({
            partKey: 'gravelBones',
            asset: parts.gravelBones,
            x: gx,
            y: gy,
            lift: 0.5 * sMul,
            ro: wrapAngle(yw + 0.32),
            submerge: 0.22,
            bias: -0.15
          });

          // 3. 5 根斜刺多棱石英矿晶柱 + 各自独立亮核
          const mapAsset = {
            main:  parts.crystalMain,
            side:  parts.crystalSide,
            small: parts.crystalSmall
          };
          for (let i = 0; i < CRYSTALS.length; i++) {
            const cr = CRYSTALS[i];
            const [cx, cy] = localToWorldXY(state.x, state.y, yw, cr.lx * sMul, cr.ly * sMul);
            const rAng = wrapAngle(yw + cr.ro);
            list.push({
              partKey: `crystal_${i}`,
              asset: mapAsset[cr.kind],
              x: cx,
              y: cy,
              lift: cr.lift * sMul,
              ro: rAng,
              bias: cr.kind === 'main' ? 0.12 : 0.04
            });
            list.push({
              partKey: `crystalCore_${i}`,
              asset: parts.crystalCore,
              x: cx,
              y: cy,
              lift: cr.coreLift * sMul,
              ro: rAng,
              symDeg: 90,
              opacity: state.coreOps[i],
              bias: 0.28
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
