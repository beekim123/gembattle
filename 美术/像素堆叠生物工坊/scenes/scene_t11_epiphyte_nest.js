'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D } = PW.Solvers;

  // =========================================================================
  // T11 生态点缀 · 树冠附生蕨簇与垂果枝（T11 巨木树冠）
  //
  // 拆件与图集预算（单盒严格 <= 34 格，0 自亮键）：
  //   - forkBough    (34×22×20)：斜伸出树冠的暖赤褐粗分杈枝条（含鸟群可栖息枝面 + 翠苔）
  //   - birdNestFern (22×22×14, symDeg: 90)：枝杈间辐射展开的亮嫩绿巨型鸟巢蕨
  //   - orchidBloom  (12×12×10)：附生橘红兰花，复用 2 簇点缀蕨簇侧边
  //   - hangingFruit (10×10×13, symDeg: 90)：枝梢下垂的两枚圆鼓鼓未熟垂果（复用 1 套）
  //
  // 展示动作：
  //   - idle ：枝梢垂果像钟摆般轻晃、蕨叶随风微颤
  //   - gust ：一阵高空阵风吹过，垂果大幅摆荡、撒落数片嫩叶微粒
  // =========================================================================

  // 21 色独立色表（严守 <= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 暖赤褐分杈树皮
      barkDark:     '#422015',
      barkMid:      '#753c25',
      barkHi:       '#ab5e3c',
      // 枝面青苔
      mossDark:     '#1b5426',
      mossMid:      '#368c3c',
      mossHi:       '#70c752',
      // 辐射展开亮嫩绿巨型鸟巢蕨
      fernDark:     '#266e23',
      fernMid:      '#58b837',
      fernHi:       '#b5f059',
      // 鸟巢蕨深棕绒心
      fernCoreDark: '#362314',
      fernCoreMid:  '#614126',
      fernCoreHi:   '#91663d',
      // 附生高饱和橘红兰花
      orchidDark:   '#b52a16',
      orchidMid:    '#f55d28',
      orchidHi:     '#ffb24a',
      // 圆鼓鼓未熟青黄垂果
      fruitDark:    '#3f7021',
      fruitMid:     '#8cc73c',
      fruitHi:      '#e4f266',
      // 垂果果蒂与红晕尖端
      fruitTipDark: '#8c241f',
      fruitTipMid:  '#d94a38',
      fruitTipHi:   '#ff8d69'
    },
    glowKeys: [],
    parts: ['bark', 'moss', 'fern', 'fernCore', 'orchid', 'fruit', 'fruitTip'],
    noCrease: [
      ['bark', 'moss'], ['fern', 'fernCore'], ['fruit', 'fruitTip']
    ],
    materials: {
      bark:     ['barkDark',     'barkMid',     'barkHi'],
      moss:     ['mossDark',     'mossMid',     'mossHi'],
      fern:     ['fernDark',     'fernMid',     'fernHi'],
      fernCore: ['fernCoreDark', 'fernCoreMid', 'fernCoreHi'],
      orchid:   ['orchidDark',   'orchidMid',   'orchidHi'],
      fruit:    ['fruitDark',    'fruitMid',    'fruitHi'],
      fruitTip: ['fruitTipDark', 'fruitTipMid', 'fruitTipHi']
    },
    protectedParts: ['orchid', 'fruit', 'fruitTip']
  });

  // 3 套换色皮肤（翠蕨橘兰 / 金蕨绯果 / 青蕨白花，0 禁用字）
  const SKINS = [
    {
      id: 'jade_fern_orchid',
      name: '翠蕨橘兰',
      dot: '#f55d28',
      outline: '#141e12',
      pal: {},
      fx: {
        leafA:  '#58b837',
        leafB:  '#b5f059',
        petal:  '#f55d28'
      }
    },
    {
      id: 'gold_fern_crimson',
      name: '金蕨绯果',
      dot: '#e63946',
      outline: '#1f150f',
      pal: {
        fernDark:     '#786016', fernMid:     '#c7a228', fernHi:     '#ffe869',
        orchidDark:   '#8c246c', orchidMid:   '#d44da6', orchidHi:   '#ffa8df',
        fruitDark:    '#8c1824', fruitMid:    '#de3545', fruitHi:    '#ff828c',
        fruitTipDark: '#5e1424', fruitTipMid: '#a3263e', fruitTipHi: '#e66378'
      },
      fx: {
        leafA:  '#c7a228',
        leafB:  '#ffe869',
        petal:  '#d44da6'
      }
    },
    {
      id: 'cyan_fern_white',
      name: '青蕨白花',
      dot: '#5cd4b8',
      outline: '#101d1c',
      pal: {
        barkDark:     '#362a28', barkMid:     '#614c48', barkHi:     '#8f726c',
        mossDark:     '#18574a', mossMid:     '#2e947d', mossHi:     '#6ed9be',
        fernDark:     '#1b6e5e', fernMid:     '#3cb89c', fernHi:     '#96f2d8',
        orchidDark:   '#b5bdc4', orchidMid:   '#ebf0f5', orchidHi:   '#ffffff',
        fruitDark:    '#a67314', fruitMid:    '#ebb52d', fruitHi:    '#ffeb82',
        fruitTipDark: '#9e4c14', fruitTipMid: '#de7c26', fruitTipHi: '#ffba5c'
      },
      fx: {
        leafA:  '#3cb89c',
        leafB:  '#96f2d8',
        petal:  '#f2f7fa'
      }
    }
  ];

  // =========================================================================
  // 1. 斜伸粗分杈枝条（34×22×20）
  // =========================================================================
  function buildForkBough(makeCanvas) {
    const m = new VoxelModel(34, 22, 20, SPEC);
    const { mat, partId } = SPEC;

    // 粗大底座与主干斜向伸出（从 -X 根基斜挑向 +X）
    m.paintCapsule(-14.5, -0.5, 2.8, -3.5, 0.0, 8.8, 4.6, 3.6, mat('bark'), partId.bark, true);
    m.paintCapsule(-3.5, 0.0, 8.8, 4.5, 0.5, 12.2, 3.5, 2.7, mat('bark'), partId.bark, true);

    // 上前分叉枝梢（挂 1 号垂果，也供鸟群栖息）
    m.paintCapsule(2.0, 0.4, 11.4, 13.8, 6.2, 16.2, 2.4, 1.35, mat('bark'), partId.bark, true);
    // 下后分叉枝梢（挂 2 号垂果）
    m.paintCapsule(1.5, -0.2, 11.2, 12.6, -6.8, 15.0, 2.3, 1.30, mat('bark'), partId.bark, true);
    // 根部抓地短板根
    m.paintCapsule(-13.2, -1.0, 3.2, -15.2,  5.6, 1.0, 2.6, 1.4, mat('bark'), partId.bark, true);
    m.paintCapsule(-13.2, -1.0, 3.2, -14.8, -6.2, 1.0, 2.5, 1.4, mat('bark'), partId.bark, true);

    // 枝面铺厚翠苔
    m.paintEllipsoid(-9.5, 0.0, 7.6, 4.5, 3.2, 1.6, mat('moss'), partId.moss, true);
    m.paintEllipsoid(-1.5, 0.2, 11.4, 4.0, 3.0, 1.6, mat('moss'), partId.moss, true);
    m.paintEllipsoid( 6.8, 3.0, 14.5, 2.6, 2.0, 1.2, mat('moss'), partId.moss, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 14.5, headZ: 19, centerZ: 9 });
  }

  // =========================================================================
  // 2. 辐射展开巨型鸟巢蕨（22×22×14，4 重对称 symDeg: 90）
  // =========================================================================
  function buildBirdNestFern(makeCanvas) {
    const m = new VoxelModel(22, 22, 14, SPEC);
    const { mat, partId } = SPEC;

    // 中心深棕鸟巢蕨心
    m.paintEllipsoid(0, 0, 2.4, 3.2, 3.2, 2.2, mat('fernCore'), partId.fernCore, true);

    // 8 片辐射舒展宽大亮嫩绿蕨叶（4 主外叶 + 4 较翘内叶，严格 90° 对称）
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI * 0.5);
      const ca = Math.cos(a), sa = Math.sin(a);
      m.paintCapsule(ca * 1.8, sa * 1.8, 2.2, ca * 6.4, sa * 6.4, 7.2, 2.2, 1.8, mat('fern'), partId.fern, true);
      m.paintCapsule(ca * 6.4, sa * 6.4, 7.2, ca * 9.8, sa * 9.8, 9.0, 1.7, 0.75, mat('fern'), partId.fern, true);

      const a2 = a + Math.PI * 0.25;
      const c2 = Math.cos(a2), s2 = Math.sin(a2);
      m.paintCapsule(c2 * 1.5, s2 * 1.5, 2.6, c2 * 5.2, s2 * 5.2, 8.8, 1.9, 1.45, mat('fern'), partId.fern, true);
      m.paintCapsule(c2 * 5.2, s2 * 5.2, 8.8, c2 * 7.8, s2 * 7.8, 12.0, 1.35, 0.65, mat('fern'), partId.fern, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.8, headZ: 13, centerZ: 6 });
  }

  // =========================================================================
  // 3. 附生橘红兰花簇（12×12×10，复用 2 簇）
  // =========================================================================
  function buildOrchidBloom(makeCanvas) {
    const m = new VoxelModel(12, 12, 10, SPEC);
    const { mat, partId } = SPEC;

    // 细弯花梗 + 两朵盛放橘红兰花
    m.paintCapsule(0, -1.5, 0.6, 0.5, 1.2, 6.2, 0.9, 0.7, mat('moss'), partId.moss, true);
    const blooms = [
      [ 1.2,  1.8, 6.8, 2.3],
      [-2.0,  0.4, 4.6, 1.9]
    ];
    for (const [bx, by, bz, r] of blooms) {
      for (let k = 0; k < 3; k++) {
        const a = k * (TAU / 3) + 0.3;
        m.paintEllipsoid(bx + Math.cos(a) * r * 0.85, by + Math.sin(a) * r * 0.85, bz, r * 0.85, r * 0.75, 1.1, mat('orchid'), partId.orchid, true);
      }
      m.paintEllipsoid(bx, by, bz + 0.7, 1.1, 1.1, 0.95, mat('fruit'), partId.fruit, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 9, centerZ: 4.5 });
  }

  // =========================================================================
  // 4. 圆鼓鼓未熟垂果（10×10×13，symDeg: 90，复用 2 枚挂在枝梢下）
  // =========================================================================
  function buildHangingFruit(makeCanvas) {
    const m = new VoxelModel(10, 10, 13, SPEC);
    const { mat, partId } = SPEC;

    // 顶部短果柄（衔接枝梢）
    m.paintCapsule(0, 0, 8.6, 0, 0, 12.2, 0.9, 0.75, mat('bark'), partId.bark, true);
    // 圆鼓鼓饱满果囊
    m.paintEllipsoid(0, 0, 5.2, 3.8, 3.8, 4.2, mat('fruit'), partId.fruit, true);
    // 底部红晕微尖果蒂
    m.paintEllipsoid(0, 0, 1.4, 1.9, 1.9, 1.5, mat('fruitTip'), partId.fruitTip, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 12, centerZ: 6 });
  }

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t11_epiphyte_nest',
    code: 'T11',
    name: '树冠附生蕨簇与垂果枝',
    status: 'done',
    defaultHabitat: 'canopy',
    tag: 'T11 树冠附生植被 · 鸟巢蕨与钟摆垂果',
    summary: '斜伸粗分杈枝条 + 亮嫩绿巨型鸟巢蕨 + 2 簇橘红兰花 + 2 枚枝梢钟摆未熟垂果，支持高空阵风摆荡与落叶微粒',
    footRadius: 15.5,
    ecoWeight: 2.2,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle', name: '垂果轻晃微颤', loop: true,  status: 'done' },
      { id: 'gust', name: '高空阵风摆荡', loop: false, duration: 2.0, status: 'done' }
    ],
    blocks: ['斜伸粗分杈枝条', '辐射亮嫩绿巨型鸟巢蕨', '附生橘红兰花与钟摆垂果'],
    soulHabit: '枝梢两枚圆鼓鼓的未熟垂果像钟摆般轻晃、蕨叶随高空林风微颤；阵风吹过时垂果大幅摆荡并撒落数片嫩叶与花瓣微粒',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        forkBough:    buildForkBough(makeCanvas),
        birdNestFern: buildBirdNestFern(makeCanvas),
        orchidBloom:  buildOrchidBloom(makeCanvas),
        hangingFruit: buildHangingFruit(makeCanvas)
      };

      const pendSpringA = new SpringDamper1D(0, 38, 3.2);
      const pendSpringB = new SpringDamper1D(0, 34, 3.0);

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        time: 0,
        pendA: 0,
        pendB: 0,
        fernTremor: 0,
        lastAction: 'idle',
        gustFired: 0
      };

      let curSkin = SKINS[0];

      function spawnGustLeaves(vfx, sMul, count) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let i = 0; i < count; i++) {
          const [wx, wy] = localToWorldXY(
            state.x, state.y, state.yaw,
            (-2.0 + Math.random() * 14.0) * sMul,
            (-6.0 + Math.random() * 12.0) * sMul
          );
          const isPetal = i % 3 === 0;
          vfx.spawnParticle(
            wx, wy, (12.0 + Math.random() * 9.0) * sMul,
            (6.5 + Math.random() * 5.5) * sMul,
            (-2.5 + Math.random() * 5.0) * sMul,
            (-1.5 + Math.random() * 3.5) * sMul,
            1.35 + Math.random() * 0.65,
            isPetal ? 1.35 : 1.45,
            isPetal ? fx.petal : (i % 2 === 0 ? fx.leafA : fx.leafB),
            false,
            9.5
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
          state.pendA = 0;
          state.pendB = 0;
          state.fernTremor = 0;
          state.lastAction = 'idle';
          state.gustFired = 0;
          pendSpringA.x = pendSpringA.v = 0;
          pendSpringB.x = pendSpringB.v = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const springiness = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          state.time = time * gFreq;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.gustFired = 0;
          }

          const stiffA = 36 * springiness;
          const stiffB = 31 * springiness;
          const damp = clamp(3.1 / Math.sqrt(springiness), 1.8, 5.5);

          if (action === 'gust') {
            const u = clamp(actionTime / 2.0, 0, 1);
            const gustForce = Math.sin(clamp(u / 0.25, 0, 1) * Math.PI) * 1.45;
            state.fernTremor = (1 - smoothstep(0.35, 0.95, u)) * 1.0;

            const beats = [0.06, 0.42];
            while (state.gustFired < beats.length && actionTime >= beats[state.gustFired]) {
              pendSpringA.impulse(state.gustFired === 0 ? 10.5 : -6.2);
              pendSpringB.impulse(state.gustFired === 0 ? 9.2 : -5.5);
              spawnGustLeaves(vfx, sMul, state.gustFired === 0 ? 8 : 5);
              state.gustFired++;
            }

            state.pendA = clamp(pendSpringA.update(dt, gustForce, stiffA, damp), -2.4, 2.4);
            state.pendB = clamp(pendSpringB.update(dt, gustForce * 0.9, stiffB, damp), -2.4, 2.4);
          } else {
            // 常态像钟摆般轻晃
            const idleTargetA = Math.sin(state.time * 1.75) * 0.45;
            const idleTargetB = Math.sin(state.time * 1.62 + 1.35) * 0.42;
            state.pendA = clamp(pendSpringA.update(dt, idleTargetA, stiffA, damp + 1.2), -1.2, 1.2);
            state.pendB = clamp(pendSpringB.update(dt, idleTargetB, stiffB, damp + 1.2), -1.2, 1.2);
            state.fernTremor = Math.max(0, state.fernTremor - dt * 2.4);
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.time;
          const flex = 0.26 + state.fernTremor * 0.55;
          const list = [];

          // 1. 斜伸粗分杈枝条
          list.push({
            partKey: 'forkBough',
            asset: parts.forkBough,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            bias: -0.10
          });

          // 2. 枝杈间的亮嫩绿巨型鸟巢蕨（随风微颤）
          const fernSwayX = Math.sin(t * 2.6) * flex;
          const fernSwayY = Math.cos(t * 2.1) * flex * 0.6;
          const [fx, fy] = localToWorldXY(state.x, state.y, yw, (-1.8 + fernSwayX) * sMul, (0.2 + fernSwayY) * sMul);
          list.push({
            partKey: 'birdNestFern',
            asset: parts.birdNestFern,
            x: fx,
            y: fy,
            lift: 10.6 * sMul,
            ro: wrapAngle(yw + Math.sin(t * 2.2) * (0.04 + state.fernTremor * 0.14)),
            bias: 0.35,
            symDeg: 90
          });

          // 3. 2 簇附生橘红兰花（点缀在鸟巢蕨前后侧）
          const orchids = [
            { lx: -6.2, ly:  3.6, lift: 8.6, ro: 0.35, ph: 0.0 },
            { lx:  3.4, ly: -3.4, lift: 11.4, ro: 2.25, ph: 1.5 }
          ];
          for (let i = 0; i < orchids.length; i++) {
            const oc = orchids[i];
            const ox = Math.sin(t * 2.8 + oc.ph) * flex * 0.8;
            const [wx, wy] = localToWorldXY(state.x, state.y, yw, (oc.lx + ox) * sMul, oc.ly * sMul);
            list.push({
              partKey: 'orchidBloom',
              asset: parts.orchidBloom,
              x: wx,
              y: wy,
              lift: oc.lift * sMul,
              ro: wrapAngle(yw + oc.ro + ox * 0.15),
              bias: 0.48
            });
          }

          // 4. 2 枚枝梢下垂的未熟垂果（钟摆式水平摆动 + 弧线微升）
          const fruits = [
            { lx: 13.4, ly:  6.2, topLift: 4.4, pend: state.pendA, bias: 0.55 },
            { lx: 12.2, ly: -6.8, topLift: 3.4, pend: state.pendB, bias: 0.22 }
          ];
          for (let i = 0; i < fruits.length; i++) {
            const fr = fruits[i];
            const swingX = fr.pend * 2.1;
            const swingY = fr.pend * 0.75;
            const arcUp = Math.min(1.8, fr.pend * fr.pend * 0.55);
            const [wx, wy] = localToWorldXY(state.x, state.y, yw, (fr.lx + swingX) * sMul, (fr.ly + swingY) * sMul);
            list.push({
              partKey: 'hangingFruit',
              asset: parts.hangingFruit,
              x: wx,
              y: wy,
              lift: (fr.topLift + arcUp) * sMul,
              ro: wrapAngle(yw + fr.pend * 0.35),
              bias: fr.bias,
              symDeg: 90
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
