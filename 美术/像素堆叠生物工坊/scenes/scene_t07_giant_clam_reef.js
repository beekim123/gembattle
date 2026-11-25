'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T07 浅海环礁 · 环礁拱岩与巨贝群
  //
  // 拆件与图集预算（单盒严格 <= 40 格，重复小件复用）：
  //   - reefArch    (38×24×28, lift=0, submerge=0.32)：半露海面的多孔灰白珊瑚礁石小拱门
  //   - clamLower   (22×18×10, lift=0, submerge=0.38)：波浪纹巨型砗磲下壳 + 湛蓝紫青肥厚贝唇
  //   - clamUpper   (22×18×9,  lift=6~8)：波浪纹巨型砗磲上盖（独立分件，可呼吸微张与啪地合拢）
  //   - pearlCore   (7×7×7,    symDeg=90)：壳心温润珍珠核（仅 pearlHi 进 glowKeys）
  //   - seaUrchin   (8×8×7,    symDeg=90)：鲜红海胆（复用 2 枚）
  //   - spiralConch (9×7×7)：螺旋彩螺（复用 2 枚）
  // =========================================================================

  // 27 色独立色表（<= 48 色、0 重色、仅珍珠核亮心 pearlHi 进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 多孔灰白珊瑚礁拱岩
      rockDark:   '#5c6c78',
      rockMid:    '#9eb0ba',
      rockHi:     '#dce8ed',
      // 礁岩孔洞暗隙
      poreDark:   '#283847',
      poreMid:    '#3f576b',
      poreHi:     '#5f7e94',
      // 礁岩附生亮珊瑚橙/明黄斑
      accentDark: '#c94320',
      accentMid:  '#ff7338',
      accentHi:   '#ffbe59',
      // 巨贝波浪纹珠白外壳
      clamDark:   '#8f8780',
      clamMid:    '#d9d1c7',
      clamHi:     '#faf6f0',
      // 巨贝鲜明湛蓝/紫青肥厚贝唇
      mantleDark: '#1c2b8f',
      mantleMid:  '#2e6bff',
      mantleHi:   '#6ce0ff',
      // 贝唇紫青斑纹缘
      lipDark:    '#562499',
      lipMid:     '#8e47e6',
      lipHi:      '#d29eff',
      // 温润珍珠核（仅 pearlHi 进 glowKeys）
      pearlDark:  '#b8c8d6',
      pearlMid:   '#e6f4fa',
      pearlHi:    '#ffffff',
      // 鲜红海胆
      urchinDark: '#7a1222',
      urchinMid:  '#d92638',
      urchinHi:   '#ff6e6e',
      // 螺旋彩螺（明黄桃粉撞色）
      conchDark:  '#b84674',
      conchMid:   '#f57cb0',
      conchHi:    '#ffe380'
    },
    glowKeys: ['pearlHi'],
    parts: ['rock', 'pore', 'accent', 'clam', 'mantle', 'lip', 'pearl', 'urchin', 'conch'],
    noCrease: [
      ['rock', 'pore'], ['rock', 'accent'],
      ['clam', 'mantle'], ['mantle', 'lip'], ['mantle', 'pearl']
    ],
    materials: {
      rock:   ['rockDark',   'rockMid',   'rockHi'],
      pore:   ['poreDark',   'poreMid',   'poreHi'],
      accent: ['accentDark', 'accentMid', 'accentHi'],
      clam:   ['clamDark',   'clamMid',   'clamHi'],
      mantle: ['mantleDark', 'mantleMid', 'mantleHi'],
      lip:    ['lipDark',    'lipMid',    'lipHi'],
      pearl:  ['pearlDark',  'pearlMid',  'pearlHi'],
      urchin: ['urchinDark', 'urchinMid', 'urchinHi'],
      conch:  ['conchDark',  'conchMid',  'conchHi']
    },
    protectedParts: ['pearl', 'mantle', 'lip', 'urchin', 'conch']
  });

  // 3 套换色皮肤（湛蓝巨贝、绯紫巨贝、金唇白贝）
  const SKINS = [
    {
      id: 'cobalt_clam',
      name: '湛蓝巨贝',
      dot: '#2e6bff',
      outline: '#0d2030',
      pal: {},
      fx: {
        bubbleA: '#e0fbff',
        bubbleB: '#7ae8ff',
        foam:    '#ffffff'
      }
    },
    {
      id: 'crimson_violet_clam',
      name: '绯紫巨贝',
      dot: '#e03688',
      outline: '#1f1229',
      pal: {
        clamDark:   '#947d89', clamMid:   '#dec8d3', clamHi:   '#fff0f7',
        mantleDark: '#7a1654', mantleMid: '#e03688', mantleHi: '#ff96ca',
        lipDark:    '#4b1d8c', lipMid:    '#8a45e6', lipHi:    '#d9adff',
        pearlDark:  '#d4b6c8', pearlMid:  '#fae6f2', pearlHi:  '#fff7fc',
        urchinDark: '#b36b0e', urchinMid: '#f2b224', urchinHi: '#fff080',
        conchDark:  '#1d7d8c', conchMid:  '#3ec9d6', conchHi:  '#a8fff7'
      },
      fx: {
        bubbleA: '#ffe8f5',
        bubbleB: '#c8a6ff',
        foam:    '#fff7fc'
      }
    },
    {
      id: 'golden_lip_clam',
      name: '金唇白贝',
      dot: '#ffbf24',
      outline: '#162124',
      pal: {
        rockDark:   '#696e68', rockMid:   '#adb3a8', rockHi:   '#e8ede2',
        clamDark:   '#9c927d', clamMid:   '#e6dcc8', clamHi:   '#fffaf0',
        mantleDark: '#b56e0d', mantleMid: '#ffbf24', mantleHi: '#fff085',
        lipDark:    '#bf3f1d', lipMid:    '#ff7b47', lipHi:    '#ffc499',
        pearlDark:  '#8ec9c4', pearlMid:  '#c8f7f2', pearlHi:  '#f0fffd',
        urchinDark: '#59208c', urchinMid: '#9a47e6', urchinHi: '#d8a6ff',
        conchDark:  '#c94322', conchMid:  '#ff7a45', conchHi:  '#ffd17a'
      },
      fx: {
        bubbleA: '#f0fffc',
        bubbleB: '#ffe999',
        foam:    '#fffcf0'
      }
    }
  ];

  // =========================================================================
  // 1. 半露海面的多孔灰白珊瑚礁石小拱门（38×24×28）
  // =========================================================================
  function buildReefArch(makeCanvas) {
    const m = new VoxelModel(38, 24, 28, SPEC);
    const { mat, partId } = SPEC;

    // 左粗礁柱 + 右礁柱 + 拱桥横跨（中央下方留出清澈浅水拱洞）
    m.fillAABB(-18.5, 18.5, -11.5, 11.5, 0, 27, (x, y, z, X, Y) => {
      // 拱门中心通道 (X in [-7.5, 7.5], z < 14) 镂空成天然礁拱
      const archCurve = 14.5 - (X * X) * 0.085;
      const inHole = Math.abs(X) < 8.5 && z < archCurve && z >= 0;

      // 左柱中心 (-12, -1)，右柱中心 (+12.5, +1)，拱顶 (X=0, z=20.5)
      const dLeft = Math.hypot((X + 12.2) / 6.2, (Y + 0.8) / 6.8);
      const dRight = Math.hypot((X - 12.4) / 5.8, (Y - 0.8) / 6.4);
      const archZ = 19.5 - (X * X) * 0.045;
      const dSpan = Math.hypot((Y - X * 0.06) / 5.4, (z - archZ) / 4.8);

      const taperL = 1.0 - smoothstep(0, 22, z) * 0.26;
      const taperR = 1.0 - smoothstep(0, 21, z) * 0.24;
      const rough = Math.sin(X * 0.55 + z * 0.4) * 0.10 + Math.cos(Y * 0.65 - z * 0.35) * 0.08;

      const hitLeft = z < 23 && dLeft <= taperL + rough;
      const hitRight = z < 22 && dRight <= taperR + rough;
      const hitSpan = Math.abs(X) <= 14.5 && z >= 12 && dSpan <= 1.0 + rough;

      if ((hitLeft || hitRight || hitSpan) && !inHole) {
        const poreNoise = Math.sin(X * 1.15) * Math.cos(Y * 1.2) * Math.sin(z * 1.05);
        if (poreNoise > 0.62 && z > 2 && z < 24) {
          m.setRaw(x, y, z, mat('pore'), partId.pore);
        } else {
          m.setRaw(x, y, z, mat('rock'), partId.rock);
        }
      }
    });

    // 礁石拱顶与柱腰点缀亮珊瑚橙/明黄活珊瑚斑，拉高 T07 缤纷度
    m.paintEllipsoid(-13.5, 4.2, 8.5, 2.8, 2.4, 2.2, mat('accent'), partId.accent, true);
    m.paintEllipsoid(13.2, -3.8, 10.0, 2.5, 2.4, 2.3, mat('accent'), partId.accent, true);
    m.paintEllipsoid(-3.2, 2.8, 22.8, 3.2, 2.5, 2.0, mat('accent'), partId.accent, true);
    m.paintEllipsoid(5.0, -2.2, 21.5, 2.4, 2.2, 1.8, mat('lip'), partId.lip, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 17.0, headZ: 27, centerZ: 13 });
  }

  // =========================================================================
  // 2. 巨型砗磲下壳与湛蓝紫青肥厚贝唇（22×18×10）
  // =========================================================================
  function buildClamLower(makeCanvas) {
    const m = new VoxelModel(22, 18, 10, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-10.5, 10.5, -8.5, 8.5, 0, 9, (x, y, z, X, Y) => {
      // 扇形波浪纹贝壳轮廓：铰链在 -Y 侧，开口波浪缘在 +Y 侧
      const ang = Math.atan2(Y + 3.5, X);
      const flute = Math.sin(ang * 7.0) * 1.15;
      const rx = 9.4 + flute * 0.45;
      const ry = 7.4 + flute * 0.55;
      const d = Math.hypot(X / rx, Y / ry);
      const bowl = smoothstep(0, 7, z);

      if (z <= 6 && d <= 0.65 + bowl * 0.35) {
        // 内部挖空成贝腔
        const inner = z >= 3 && d < 0.74;
        if (!inner) {
          m.setRaw(x, y, z, mat('clam'), partId.clam);
        }
      }

      // 肥厚波浪状湛蓝/紫青贝唇铺满下壳边缘与内腔
      if (z >= 4 && z <= 8 && d <= 0.88 && Y > -5.5) {
        const waveZ = 6.4 + Math.sin(ang * 7.0) * 1.1;
        if (z <= waveZ && (d >= 0.42 || z <= 5)) {
          const isEdge = d > 0.70 || Math.sin(ang * 14.0) > 0.55;
          m.setRaw(x, y, z, mat(isEdge ? 'lip' : 'mantle'), partId[isEdge ? 'lip' : 'mantle']);
        }
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.2, headZ: 9, centerZ: 4 });
  }

  // =========================================================================
  // 3. 巨型砗磲上壳盖（22×18×9，独立分件）
  // =========================================================================
  function buildClamUpper(makeCanvas) {
    const m = new VoxelModel(22, 18, 9, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-10.5, 10.5, -8.5, 8.5, 0, 8, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y + 3.5, X);
      const flute = Math.sin(ang * 7.0) * 1.15;
      const rx = 9.4 + flute * 0.45;
      const ry = 7.4 + flute * 0.55;
      const d = Math.hypot(X / rx, Y / ry);

      // 穹顶状波浪外壳，底部波浪口缘与下壳咬合
      const dome = Math.sqrt(Math.max(0, 1.0 - d * d)) * 6.8 + Math.sin(ang * 7.0) * 0.65;
      if (d <= 1.0 && z <= dome + 1.4 && z >= Math.max(0, dome - 2.6)) {
        if (z <= 1 && d > 0.68 && Y > -4.5) {
          m.setRaw(x, y, z, mat('mantle'), partId.mantle);
        } else {
          m.setRaw(x, y, z, mat('clam'), partId.clam);
        }
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.2, headZ: 8, centerZ: 4 });
  }

  // =========================================================================
  // 4. 壳心温润珍珠核（7×7×7，symDeg: 90）
  // =========================================================================
  function buildPearlCore(makeCanvas) {
    const m = new VoxelModel(7, 7, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 2.8, 2.55, 2.55, 2.55, mat('pearl'), partId.pearl, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.6, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 5. 鲜红海胆（8×8×7，复用 2 枚，symDeg: 90）
  // =========================================================================
  function buildSeaUrchin(makeCanvas) {
    const m = new VoxelModel(8, 8, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 2.2, 2.2, 2.2, 1.9, mat('urchin'), partId.urchin, true);
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * TAU;
      m.paintCapsule(0, 0, 2.2, Math.cos(a) * 3.5, Math.sin(a) * 3.5, 3.6, 0.7, 0.45, mat('urchin'), partId.urchin, true);
    }
    m.paintCapsule(0, 0, 2.4, 0, 0, 5.8, 0.8, 0.45, mat('urchin'), partId.urchin, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 6. 螺旋彩螺（9×7×7，复用 2 枚）
  // =========================================================================
  function buildSpiralConch(makeCanvas) {
    const m = new VoxelModel(9, 7, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(-1.4, 0, 2.4, 2.6, 2.3, 2.2, mat('conch'), partId.conch, true);
    m.paintEllipsoid(1.2, 0.2, 2.5, 1.9, 1.65, 1.65, mat('accent'), partId.accent, true);
    m.paintEllipsoid(2.9, 0.3, 2.6, 1.2, 1.05, 1.05, mat('conch'), partId.conch, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: 6, centerZ: 3 });
  }

  // 周边小点缀布局（2 枚鲜红海胆 + 2 枚螺旋彩螺）
  const URCHINS = [
    { lx: -12.5, ly:  9.2, ro: 0.3 },
    { lx:  13.8, ly:  7.8, ro: 1.9 }
  ];
  const CONCHS = [
    { lx:  11.4, ly: -9.0, ro: 0.7 },
    { lx: -10.8, ly: -8.6, ro: 2.5 }
  ];

  const Def = {
    id: 'scene_t07_giant_clam_reef',
    code: 'T07',
    name: '环礁拱岩与巨贝群',
    status: 'done',
    defaultHabitat: 'reef',
    tag: 'T07 浅海环礁 · 多孔礁拱与巨型砗磲',
    summary: '半露海面的多孔灰白珊瑚礁小拱门，拱边浅水坐落上下分件波浪纹巨型砗磲（湛蓝紫青肥厚贝唇 + 温润珍珠核），旁缀鲜红海胆与螺旋彩螺',
    footRadius: 17.5,
    ecoWeight: 4.2,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',      name: '微张吐泡', loop: true,  status: 'done' },
      { id: 'clam_snap', name: '受惊合壳', loop: false, duration: 2.2, status: 'done' }
    ],
    blocks: ['多孔灰白珊瑚礁石小拱门', '上下分件巨型砗磲与温润珍珠核', '受惊合拢喷泡与鲜红海胆彩螺'],
    soulHabit: '巨型砗磲在浅海拱岩边微张呼吸、定时吐出晶莹上升水泡；受惊时啪地合拢壳盖喷出一股白泡沫水柱，随后慢慢重新微张',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        reefArch:    buildReefArch(makeCanvas),
        clamLower:   buildClamLower(makeCanvas),
        clamUpper:   buildClamUpper(makeCanvas),
        pearlCore:   buildPearlCore(makeCanvas),
        seaUrchin:   buildSeaUrchin(makeCanvas),
        spiralConch: buildSpiralConch(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        lidOpen: 0.72,      // 0=完全合拢, 1=最大微张
        clamShakeX: 0,
        clamShakeY: 0,
        bubbleClock: 1.1,
        lastAction: 'idle',
        snapBurstDone: false
      };

      let curSkin = SKINS[0];

      function clamWorldPos(sMul) {
        return localToWorldXY(state.x, state.y, state.yaw, 2.2 * sMul, 6.2 * sMul);
      }

      function spawnClamBubbles(vfx, sMul, count, jetPower) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const [cx, cy] = clamWorldPos(sMul);
        for (let i = 0; i < count; i++) {
          const a = Math.random() * TAU;
          const spread = (jetPower > 1.2 ? 6.5 : 2.6) * sMul;
          vfx.spawnParticle(
            cx + (Math.random() - 0.5) * 3.0 * sMul,
            cy + (Math.random() - 0.5) * 2.5 * sMul,
            (8.0 + Math.random() * 2.5) * sMul,
            Math.cos(a) * spread,
            Math.sin(a) * spread,
            (9.5 + Math.random() * 9.0) * jetPower * sMul,
            0.95 + Math.random() * 0.65,
            (jetPower > 1.2 ? 1.65 : 1.35) + Math.random() * 0.45,
            i % 3 === 0 ? fx.foam : (i % 2 === 0 ? fx.bubbleA : fx.bubbleB),
            false,
            jetPower > 1.2 ? 18 : -2.0
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
          state.lidOpen = 0.72;
          state.clamShakeX = state.clamShakeY = 0;
          state.bubbleClock = 1.0;
          state.lastAction = 'idle';
          state.snapBurstDone = false;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.snapBurstDone = false;
          }

          state.clamShakeX = 0;
          state.clamShakeY = 0;

          if (action === 'clam_snap') {
            // 0~0.18s 啪地迅速合拢喷泡沫水柱；0.18~1.15s 紧闭；1.15~2.20s 缓缓重新微张
            if (actionTime < 0.18) {
              const u = smoothstep(0, 1, actionTime / 0.18);
              state.lidOpen = lerp(0.75, 0.0, u);
            } else if (actionTime < 1.15) {
              state.lidOpen = 0.0;
              if (actionTime < 0.36) {
                const decay = 1 - (actionTime - 0.18) / 0.18;
                state.clamShakeX = Math.sin(actionTime * 75) * 0.55 * decay * sMul;
                state.clamShakeY = Math.cos(actionTime * 68) * 0.35 * decay * sMul;
              }
            } else {
              const u = smoothstep(0, 1, (actionTime - 1.15) / 1.05);
              state.lidOpen = lerp(0.0, 0.72, u);
            }

            if (!state.snapBurstDone && actionTime >= 0.14) {
              state.snapBurstDone = true;
              const [cx, cy] = clamWorldPos(sMul);
              spawnClamBubbles(vfx, sMul, 14, 1.85);
              if (vfx) {
                vfx.addRipple(cx, cy, 5.0 * sMul, 21.0 * sMul, 0.85, 2.2);
                vfx.addRipple(cx, cy, 2.5 * sMul, 13.0 * sMul, 0.65, 1.5);
              }
            }
          } else {
            // 常态微张呼吸 + 定时吐出 2~3 颗晶莹上升水泡
            const targetOpen = 0.68 + Math.sin(time * 1.45 * gFreq) * 0.24;
            state.lidOpen = lerp(state.lidOpen, targetOpen, clamp(dt * 5.0, 0, 1));

            state.bubbleClock -= dt;
            if (state.bubbleClock <= 0) {
              state.bubbleClock = 1.65 + Math.random() * 0.95;
              const count = Math.random() > 0.45 ? 3 : 2;
              spawnClamBubbles(vfx, sMul, count, 0.95);
              if (vfx) {
                const [cx, cy] = clamWorldPos(sMul);
                vfx.addRipple(cx, cy, 4.5 * sMul, 14.0 * sMul, 1.15, 1.2);
              }
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const open = state.lidOpen;
          const list = [];

          // 1. 多孔灰白珊瑚礁石小拱门（偏后方 -Y）
          const [ax, ay] = localToWorldXY(state.x, state.y, yw, 0, -4.6 * sMul);
          list.push({
            partKey: 'reefArch',
            asset: parts.reefArch,
            x: ax,
            y: ay,
            lift: 0,
            ro: yw,
            submerge: 0.32,
            bias: -0.55
          });

          // 2. 巨型砗磲下壳（拱边浅水 +Y）
          const [cx, cy] = localToWorldXY(state.x, state.y, yw, 2.2 * sMul, 6.2 * sMul);
          list.push({
            partKey: 'clamLower',
            asset: parts.clamLower,
            x: cx + state.clamShakeX,
            y: cy + state.clamShakeY,
            lift: 0,
            ro: wrapAngle(yw + 0.22),
            submerge: 0.38,
            bias: 0.20
          });

          // 3. 温润珍珠核（壳心，合拢时隐入贝壳内）
          if (open > 0.14) {
            list.push({
              partKey: 'pearlCore',
              asset: parts.pearlCore,
              x: cx + state.clamShakeX,
              y: cy + state.clamShakeY,
              lift: (4.4 + open * 1.1) * sMul,
              ro: yw,
              opacity: clamp((open - 0.14) / 0.22, 0, 1),
              bias: 0.45,
              symDeg: 90
            });
          }

          // 4. 巨型砗磲上壳盖（呼吸微张 / 啪地合拢，向铰链侧微退并上抬）
          const clamYaw = wrapAngle(yw + 0.22);
          const [ux, uy] = localToWorldXY(cx, cy, clamYaw, 0, -open * 2.1 * sMul);
          list.push({
            partKey: 'clamUpper',
            asset: parts.clamUpper,
            x: ux + state.clamShakeX,
            y: uy + state.clamShakeY,
            lift: (4.2 + open * 3.8) * sMul,
            ro: clamYaw,
            submerge: open < 0.15 ? 0.18 : 0.0,
            bias: 0.85
          });

          // 5. 鲜红海胆（复用 2 枚）
          for (let i = 0; i < URCHINS.length; i++) {
            const u = URCHINS[i];
            const [ex, ey] = localToWorldXY(state.x, state.y, yw, u.lx * sMul, u.ly * sMul);
            list.push({
              partKey: 'seaUrchin',
              asset: parts.seaUrchin,
              x: ex,
              y: ey,
              lift: 0,
              ro: wrapAngle(yw + u.ro),
              submerge: 0.35,
              bias: 0.10,
              symDeg: 90
            });
          }

          // 6. 螺旋彩螺（复用 2 枚）
          for (let i = 0; i < CONCHS.length; i++) {
            const c = CONCHS[i];
            const [ex, ey] = localToWorldXY(state.x, state.y, yw, c.lx * sMul, c.ly * sMul);
            list.push({
              partKey: 'spiralConch',
              asset: parts.spiralConch,
              x: ex,
              y: ey,
              lift: 0,
              ro: wrapAngle(yw + c.ro),
              submerge: 0.32,
              bias: 0.05
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
