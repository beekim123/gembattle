'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T09 低矮掩体与食物源 · 苔藓倒木与赤果堆（T09 林地落果空坪）
  //
  // 拆件与图集预算（单盒严格 <= 40 格，0 自亮键）：
  //   - logBody         (36×18×14, lift=0, bias=-0.10)：横卧空心粗倒木（剥皮露浅米木芯 + 翠绿厚苔衣）
  //   - mushroomCluster (10×10×9,  lift=3, bias=+0.22)：旁生暖橙小木耳菇簇
  //   - fruitPile       (16×12×9,  lift=0, bias=+0.28)：倒木凹处堆满鲜红饱满 T09 招牌落果
  //   - looseFruit      (6×6×6,    lift=0, bias=-0.15, symDeg: 90)：滚落木边的 2 颗复用熟果
  //
  // 展示动作：
  //   - idle   ：林间静置，偶有一两只金色小果蝇微粒在果堆上空打转
  //   - rustle ：倒木空心微颤，抖出几片落叶与碎果粒
  // =========================================================================

  // 21 色独立色表（严守 <= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 深褐粗糙老树皮
      barkDark:   '#3b2116',
      barkMid:    '#663b26',
      barkHi:     '#965c3e',
      // 剥皮露出的浅米木芯
      coreDark:   '#9e7b52',
      coreMid:    '#cfa978',
      coreHi:     '#f2d6a7',
      // 空心树筒深邃内腔
      hollowDark: '#1c0f0a',
      hollowMid:  '#331c13',
      hollowHi:   '#4f2d1f',
      // 背覆翠绿厚苔衣
      mossDark:   '#1d5426',
      mossMid:    '#378c3d',
      mossHi:     '#70cc56',
      // 旁生暖橙小木耳菇
      fungusDark: '#9e3b14',
      fungusMid:  '#e36b22',
      fungusHi:   '#ffae4a',
      // T09 招牌鲜红赤果
      fruitDark:  '#94161e',
      fruitMid:   '#e62c35',
      fruitHi:    '#ff7866',
      // 果蒂与夹杂嫩叶
      leafDark:   '#2e6122',
      leafMid:    '#539936',
      leafHi:     '#8fd457'
    },
    glowKeys: [],
    parts: ['bark', 'core', 'hollow', 'moss', 'fungus', 'fruit', 'leaf'],
    noCrease: [
      ['bark', 'core'], ['bark', 'hollow'], ['bark', 'moss'],
      ['fruit', 'leaf']
    ],
    materials: {
      bark:   ['barkDark',   'barkMid',   'barkHi'],
      core:   ['coreDark',   'coreMid',   'coreHi'],
      hollow: ['hollowDark', 'hollowMid', 'hollowHi'],
      moss:   ['mossDark',   'mossMid',   'mossHi'],
      fungus: ['fungusDark', 'fungusMid', 'fungusHi'],
      fruit:  ['fruitDark',  'fruitMid',  'fruitHi'],
      leaf:   ['leafDark',   'leafMid',   'leafHi']
    },
    protectedParts: ['fruit', 'fungus']
  });

  // 3 套零重建模换色皮肤（鲜红赤果 / 金黄甜果 / 深紫浆果）
  const SKINS = [
    {
      id: 'scarlet_fruit',
      name: '鲜红赤果',
      dot: '#e62c35',
      outline: '#12160f',
      pal: {},
      fx: {
        fly: '#ffe275',
        leafA: '#539936',
        leafB: '#8fd457',
        fruitA: '#e62c35',
        fruitB: '#ff7866'
      }
    },
    {
      id: 'golden_sweet',
      name: '金黄甜果',
      dot: '#f0b129',
      outline: '#17140d',
      pal: {
        fruitDark: '#a66512',
        fruitMid:  '#ebaa26',
        fruitHi:   '#ffe66e',
        fungusDark:'#8c3d1e',
        fungusMid: '#cc6733',
        fungusHi:  '#f7a663'
      },
      fx: {
        fly: '#fff099',
        leafA: '#539936',
        leafB: '#8fd457',
        fruitA: '#ebaa26',
        fruitB: '#ffe66e'
      }
    },
    {
      id: 'deep_purple_berry',
      name: '深紫浆果',
      dot: '#983ec7',
      outline: '#140f1a',
      pal: {
        barkDark:  '#332429', barkMid: '#594048', barkHi: '#85646e',
        mossDark:  '#1d4f3d', mossMid: '#338564', mossHi: '#64c298',
        fruitDark: '#521973', fruitMid:'#8f38bd', fruitHi:'#d47ef5',
        fungusDark:'#944c16', fungusMid:'#d97b29', fungusHi:'#ffba5c'
      },
      fx: {
        fly: '#ffe685',
        leafA: '#338564',
        leafB: '#64c298',
        fruitA: '#8f38bd',
        fruitB: '#d47ef5'
      }
    }
  ];

  // =========================================================================
  // 1. 横卧空心粗倒木（36×18×14）
  // =========================================================================
  function buildLogBody(makeCanvas) {
    const m = new VoxelModel(36, 18, 14, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-16.8, 16.8, -8.2, 8.2, 0, 13, (x, y, z, X, Y) => {
      // 略带自然弯曲的倒木中轴
      const cy = Math.sin(X * 0.14) * 1.15;
      const cz = 5.4 + Math.cos(X * 0.11) * 0.35;
      const ly = Y - cy;
      const lz = z - cz;
      const ang = Math.atan2(lz, ly);

      // 两端略粗、中段微收；两端斜切出参差断口
      const endCutL = -15.6 + Math.sin(ang * 2) * 1.1;
      const endCutR =  15.6 + Math.cos(ang * 2) * 1.1;
      if (X < endCutL || X > endCutR) return;

      const rOuter = 5.4 + Math.sin(ang * 5 + X * 0.25) * 0.38 + (Math.abs(X) > 12 ? 0.45 : 0);
      const d = Math.hypot(ly, lz);

      // 中段前侧（+Y 侧 X=-6..6）留出一处天然木凹槽供果堆嵌入
      const inNotch = X > -6.5 && X < 5.5 && Y > 1.8 && z > 3.2;
      if (inNotch && d > 3.6) return;

      if (d <= rOuter) {
        // 空心内腔（贯穿两端开口）
        const rInner = 2.75 + Math.sin(X * 0.3) * 0.25;
        if (d < rInner) {
          // 靠近断口掏空，深处涂暗色空心腔壁
          if (Math.abs(X) > 10.5) return;
          m.setRaw(x, y, z, mat('hollow'), partId.hollow);
          return;
        }
        // 断口断面露浅米木芯
        if (X < endCutL + 1.3 || X > endCutR - 1.3) {
          m.setRaw(x, y, z, mat('core'), partId.core);
          return;
        }
        // 中段树皮剥落区露浅米木芯
        const isPeeled = (X > -3.5 && X < 5.8 && z > 4.2 && Y > -1.2) ||
                         (X > -12.0 && X < -7.5 && z > 6.5 && Y < 2.0);
        // 顶部覆厚翠绿苔衣
        const isMoss = z >= 8.6 && d > rOuter - 1.45 && (Math.sin(X * 0.32 + Y * 0.4) > -0.35);
        if (isMoss) {
          m.setRaw(x, y, z, mat('moss'), partId.moss);
        } else if (isPeeled) {
          m.setRaw(x, y, z, mat('core'), partId.core);
        } else {
          m.setRaw(x, y, z, mat('bark'), partId.bark);
        }
      }
    });

    // 倒木右后方一根斜翘短枯枝杈
    m.paintCapsule(7.5, -2.2, 8.2, 11.4, -5.8, 12.6, 1.8, 1.0, mat('bark'), partId.bark, true);
    m.paintEllipsoid(11.4, -5.8, 12.6, 0.95, 0.95, 0.95, mat('core'), partId.core, true);

    // 顶部额外堆出几团饱满厚苔垫
    m.paintEllipsoid(-8.4, -0.8, 10.8, 3.6, 2.6, 1.5, mat('moss'), partId.moss, true);
    m.paintEllipsoid( 2.8, -1.6, 10.5, 3.2, 2.4, 1.4, mat('moss'), partId.moss, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 15.0, headZ: 13, centerZ: 6 });
  }

  // =========================================================================
  // 2. 旁生暖橙小木耳菇簇（10×10×9）
  // =========================================================================
  function buildMushroomCluster(makeCanvas) {
    const m = new VoxelModel(10, 10, 9, SPEC);
    const { mat, partId } = SPEC;
    // 4 片层叠扇形暖橙木耳菇
    const caps = [
      [ 0.0,  0.4, 5.4, 3.6, 3.0, 1.25],
      [-2.2,  1.4, 3.4, 2.7, 2.4, 1.05],
      [ 2.3,  1.2, 3.8, 2.6, 2.3, 1.05],
      [ 0.2,  2.2, 1.8, 2.3, 2.0, 0.95]
    ];
    for (const [cx, cy, cz, rx, ry, rz] of caps) {
      m.paintEllipsoid(cx, cy, cz, rx, ry, rz, mat('fungus'), partId.fungus, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 7, centerZ: 3.5 });
  }

  // =========================================================================
  // 3. 倒木凹处鲜红赤果堆（16×12×9）
  // =========================================================================
  function buildFruitPile(makeCanvas) {
    const m = new VoxelModel(16, 12, 9, SPEC);
    const { mat, partId } = SPEC;
    // 底层垫几片绿叶
    m.paintEllipsoid(0, 0.5, 1.2, 6.8, 4.6, 1.2, mat('leaf'), partId.leaf, true);

    // 9 颗高低错落的饱满熟果堆成小山
    const fruits = [
      [-4.2,  1.4, 2.2, 2.2],
      [-1.0,  2.4, 2.3, 2.3],
      [ 2.6,  1.8, 2.2, 2.2],
      [ 4.8, -0.4, 2.0, 2.0],
      [-3.4, -1.6, 2.5, 2.2],
      [ 0.4, -1.4, 2.6, 2.3],
      [ 3.2, -1.8, 2.3, 2.1],
      [-1.8,  0.2, 4.8, 2.2],
      [ 1.4,  0.4, 4.7, 2.1],
      [-0.2, -0.2, 6.4, 1.9]
    ];
    for (const [fx, fy, fz, r] of fruits) {
      m.paintEllipsoid(fx, fy, fz, r, r, r * 0.92, mat('fruit'), partId.fruit, true);
      m.paintEllipsoid(fx, fy, fz + r * 0.85, 0.8, 0.8, 0.55, mat('leaf'), partId.leaf, true);
    }

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 7.2, headZ: 8, centerZ: 4 });
  }

  // =========================================================================
  // 4. 散落木边的小赤果（6×6×6，复用 2 颗，symDeg: 90）
  // =========================================================================
  function buildLooseFruit(makeCanvas) {
    const m = new VoxelModel(6, 6, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 2.0, 2.15, 2.15, 1.95, mat('fruit'), partId.fruit, true);
    m.paintCapsule(0, 0, 3.6, 0, 0, 4.8, 0.65, 0.48, mat('leaf'), partId.leaf, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 5, centerZ: 2 });
  }

  const LOOSE_FRUITS = [
    { lx:  9.4, ly:  7.8, ro: 0.5 },
    { lx: -9.8, ly:  6.6, ro: 1.9 }
  ];

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t09_fallen_fruit_log',
    code: 'T09',
    name: '苔藓倒木与赤果堆',
    status: 'done',
    defaultHabitat: 'forest',
    tag: 'T09 林地低矮掩体与落果食物源',
    summary: '横卧空心粗倒木（剥皮露浅米木芯 + 背覆翠绿厚苔衣）+ 旁生暖橙小木耳菇簇 + 凹处鲜红饱满赤果堆，直接服务 T09 原住民觅食与林地掩体',
    footRadius: 16.0,
    ecoWeight: 2.8,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',   name: '林间静置',     loop: true,  status: 'done' },
      { id: 'rustle', name: '空心微颤落叶', loop: false, duration: 1.8, status: 'done' }
    ],
    blocks: ['空心剥皮厚苔倒木', '暖橙小木耳菇簇', '鲜红赤果堆与滚落小果'],
    soulHabit: '林间静置时偶有一两只金色小果蝇微粒在赤果堆上空打转；被碰触或觅食翻找时倒木空心微颤并抖出落叶与碎果粒',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        logBody:         buildLogBody(makeCanvas),
        mushroomCluster: buildMushroomCluster(makeCanvas),
        fruitPile:       buildFruitPile(makeCanvas),
        looseFruit:      buildLooseFruit(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        shakeX: 0,
        shakeY: 0,
        flyClock: 0.8,
        lastAction: 'idle',
        rustleFired: 0
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
          state.flyClock = 0.7;
          state.lastAction = 'idle';
          state.rustleFired = 0;
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
            state.rustleFired = 0;
          }

          state.shakeX = 0;
          state.shakeY = 0;

          if (action === 'idle') {
            // 偶有一两只金色小果蝇微粒在果堆上空打转
            state.flyClock -= dt;
            if (state.flyClock <= 0 && vfx) {
              state.flyClock = 1.0 + Math.random() * 0.9;
              const [px, py] = localToWorldXY(state.x, state.y, state.yaw, -0.5 * sMul, 5.2 * sMul);
              const a = time * 2.4 + Math.random() * TAU;
              const r = (2.0 + Math.random() * 3.5) * sMul;
              vfx.spawnParticle(
                px + Math.cos(a) * r,
                py + Math.sin(a) * r,
                (7.5 + Math.random() * 2.5) * sMul,
                -Math.sin(a) * 3.8 * sMul,
                Math.cos(a) * 3.8 * sMul,
                (0.8 + Math.random() * 1.4) * sMul,
                1.05 + Math.random() * 0.45,
                0.95,
                fx.fly,
                false,
                0.8
              );
            }
          } else if (action === 'rustle') {
            const u = clamp(actionTime / 1.8, 0, 1);
            const env = Math.sin(clamp(u / 0.15, 0, 1) * Math.PI * 0.5) * (1 - smoothstep(0.42, 0.92, u));
            state.shakeX = Math.sin(actionTime * 34.0 * gFreq) * env * 0.35 * sMul;
            state.shakeY = Math.cos(actionTime * 28.0 * gFreq) * env * 0.22 * sMul;

            // 分两拍抖出几片落叶与碎果粒
            const beats = [0.14, 0.46];
            while (state.rustleFired < beats.length && actionTime >= beats[state.rustleFired]) {
              if (vfx) {
                const count = state.rustleFired === 0 ? 7 : 5;
                for (let k = 0; k < count; k++) {
                  const a = Math.random() * TAU;
                  const sp = (4.5 + Math.random() * 7.5) * sMul;
                  const ox = (Math.random() - 0.5) * 20.0 * sMul;
                  const oy = (Math.random() - 0.5) * 6.0 * sMul;
                  const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, ox, oy);
                  const isFruitBit = k % 3 === 0;
                  vfx.spawnParticle(
                    wx, wy, (6.5 + Math.random() * 4.5) * sMul,
                    Math.cos(a) * sp, Math.sin(a) * sp, (6.0 + Math.random() * 5.5) * sMul,
                    0.85 + Math.random() * 0.45,
                    isFruitBit ? 1.45 : 1.25,
                    isFruitBit ? (k % 2 === 0 ? fx.fruitA : fx.fruitB) : (k % 2 === 0 ? fx.leafA : fx.leafB),
                    false,
                    isFruitBit ? 36 : 16
                  );
                }
              }
              state.rustleFired++;
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const cx = state.x + state.shakeX;
          const cy = state.y + state.shakeY;
          const list = [];

          // 1. 滚落木边的 2 颗小赤果
          for (let i = 0; i < LOOSE_FRUITS.length; i++) {
            const lf = LOOSE_FRUITS[i];
            const [fx, fy] = localToWorldXY(state.x, state.y, yw, lf.lx * sMul, lf.ly * sMul);
            list.push({
              partKey: 'looseFruit',
              asset: parts.looseFruit,
              x: fx,
              y: fy,
              lift: 0,
              ro: wrapAngle(yw + lf.ro),
              bias: -0.15,
              symDeg: 90
            });
          }

          // 2. 横卧空心粗倒木主体
          list.push({
            partKey: 'logBody',
            asset: parts.logBody,
            x: cx,
            y: cy,
            lift: 0,
            ro: yw,
            bias: -0.10
          });

          // 3. 旁生暖橙小木耳菇簇（紧贴倒木左前侧树皮）
          const [mx, my] = localToWorldXY(cx, cy, yw, -10.8 * sMul, 4.2 * sMul);
          list.push({
            partKey: 'mushroomCluster',
            asset: parts.mushroomCluster,
            x: mx,
            y: my,
            lift: 2.2 * sMul,
            ro: wrapAngle(yw + 0.18),
            bias: 0.22
          });

          // 4. 倒木凹处饱满鲜红赤果堆
          const [px, py] = localToWorldXY(cx, cy, yw, -0.4 * sMul, 5.4 * sMul);
          list.push({
            partKey: 'fruitPile',
            asset: parts.fruitPile,
            x: px,
            y: py,
            lift: 0,
            ro: wrapAngle(yw - 0.08),
            bias: 0.28
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
