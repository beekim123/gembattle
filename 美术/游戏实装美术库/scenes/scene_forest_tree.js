'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // S01 标杆 · 林间落果古树（T09 林地落果空坪）
  //
  // 拆件与图集预算（单盒严格 <= 40 格，对称树冠标 symDeg: 90 省 75% 贴图）：
  //   - trunk       (26×26×32, lift=0,  bias=-0.20)：盘根错节粗树干，外张板根、节疤与青苔
  //   - canopyLow   (36×36×15, lift=22, bias=+1.40, symDeg: 90)：下层宽大叶冠 + 鲜红熟果
  //   - canopyMid   (32×32×14, lift=31, bias=+2.20, symDeg: 90)：中层饱满叶冠 + 鲜红熟果
  //   - canopyTop   (22×22×11, lift=39, bias=+3.00, symDeg: 90)：顶层嫩绿冠蓬 + 顶果
  //   - fallenFruit (6×6×6,    lift=0,  bias=-0.10, symDeg: 90)：树下草地 3 颗复用落果件
  //
  // 展示动作：
  //   - idle        ：林风轻拂（三层树冠错相极轻水平位移 ±0.35 格，偶飘 1~2 片绿叶）
  //   - fade_canopy ：半透遮挡演示（树冠平滑降至 opacity: 0.36，露出完整树干与树根）
  //   - shake_drop  ：摇树落果（呼应 T09 规矩与 地6 摇树，高频微震并落下 5~6 颗赤红熟果）
  // =========================================================================

  // 24 色独立色表（严守 <= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 深红褐老树皮（跳脱出 forest 绿底）
      barkDark:   '#3b2016',
      barkMid:    '#663925',
      barkHi:     '#96583c',
      // 树皮深裂纹与树疤内凹
      fissDark:   '#24120c',
      fissMid:    '#472619',
      fissHi:     '#6e3e29',
      // 树根与树腰厚青苔
      mossDark:   '#204d26',
      mossMid:    '#387d39',
      mossHi:     '#66b352',
      // 下层与中层浓翠叶冠
      leafDark:   '#175229',
      leafMid:    '#2c873c',
      leafHi:     '#5cc251',
      // 顶层亮黄绿嫩叶冠
      crownDark:  '#3a7a26',
      crownMid:   '#6cb83b',
      crownHi:    '#b3eb5e',
      // 醒目鲜红熟果（T09 标志落果）
      fruitDark:  '#94161e',
      fruitMid:   '#e32b34',
      fruitHi:    '#ff7561',
      // 果蒂与小叶芽
      stemDark:   '#36591d',
      stemMid:    '#5d912f',
      stemHi:     '#9bd44c',
      // 枯根土砾过渡色
      rootDark:   '#2e1a12',
      rootMid:    '#543222',
      rootHi:     '#7d4d35'
    },
    glowKeys: [],
    parts: ['bark', 'fiss', 'moss', 'leaf', 'crown', 'fruit', 'stem', 'root'],
    noCrease: [
      ['bark', 'fiss'], ['bark', 'root'], ['bark', 'moss'],
      ['root', 'moss'], ['leaf', 'crown'], ['leaf', 'moss'],
      ['fruit', 'stem']
    ],
    materials: {
      bark:  ['barkDark',  'barkMid',  'barkHi'],
      fiss:  ['fissDark',  'fissMid',  'fissHi'],
      moss:  ['mossDark',  'mossMid',  'mossHi'],
      leaf:  ['leafDark',  'leafMid',  'leafHi'],
      crown: ['crownDark', 'crownMid', 'crownHi'],
      fruit: ['fruitDark', 'fruitMid', 'fruitHi'],
      stem:  ['stemDark',  'stemMid',  'stemHi'],
      root:  ['rootDark',  'rootMid',  'rootHi']
    },
    protectedParts: ['fruit', 'stem']
  });

  // 3 套零重建模换色皮肤（0 禁用字）
  const SKINS = [
    {
      id: 'summer_emerald',
      name: '盛夏翠果',
      dot: '#e32b34',
      outline: '#10170f',
      pal: {},
      fx: {
        leafA: '#2c873c',
        leafB: '#b3eb5e',
        fruitA: '#e32b34',
        fruitB: '#ff7561'
      }
    },
    {
      id: 'autumn_maple',
      name: '金秋暖枫',
      dot: '#e87a24',
      outline: '#1c100a',
      pal: {
        barkDark:  '#422217', barkMid:  '#733e28', barkHi:  '#a66040',
        mossDark:  '#664c1a', mossMid:  '#9c782c', mossHi:  '#d9b14c',
        leafDark:  '#8f2718', leafMid:  '#d44b22', leafHi:  '#fa8738',
        crownDark: '#b85118', crownMid: '#ed8a26', crownHi: '#ffd04f',
        fruitDark: '#821426', fruitMid: '#cc293e', fruitHi: '#ff6e7a',
        stemDark:  '#634419', stemMid:  '#996d28', stemHi:  '#cfa048'
      },
      fx: {
        leafA: '#d44b22',
        leafB: '#ffd04f',
        fruitA: '#cc293e',
        fruitB: '#ff8a5c'
      }
    },
    {
      id: 'spring_blossom',
      name: '春芽花树',
      dot: '#f285a8',
      outline: '#1a1216',
      pal: {
        barkDark:  '#402824', barkMid:  '#6b4740', barkHi:  '#9c6e64',
        mossDark:  '#2e6333', mossMid:  '#509c4d', mossHi:  '#87d672',
        leafDark:  '#437d36', leafMid:  '#75bd52', leafHi:  '#b4ed7b',
        crownDark: '#b85378', crownMid: '#eb83a6', crownHi: '#ffc7da',
        fruitDark: '#b5284c', fruitMid: '#f05478', fruitHi: '#ffa6ba',
        stemDark:  '#3f6e29', stemMid:  '#6ca844', stemHi:  '#a8e06c'
      },
      fx: {
        leafA: '#eb83a6',
        leafB: '#ffc7da',
        fruitA: '#f05478',
        fruitB: '#ffa6ba'
      }
    }
  ];

  // =========================================================================
  // 1. 盘根错节粗树干（26×26×32）
  // =========================================================================
  function buildTrunk(makeCanvas) {
    const m = new VoxelModel(26, 26, 32, SPEC);
    const { mat, partId } = SPEC;

    // 主树干（z=0..29）：底部宽阔外张、腰身微微扭转、顶部三叉托冠
    m.fillAABB(-11.5, 11.5, -11.5, 11.5, 0, 29, (x, y, z, X, Y) => {
      const t = z / 29;
      const cx = Math.sin(t * Math.PI * 1.1) * 0.9;
      const cy = Math.cos(t * Math.PI * 0.9) * 0.6 - 0.2;
      const lx = X - cx;
      const ly = Y - cy;
      const ang = Math.atan2(ly, lx);

      const botFlare = Math.pow(1 - smoothstep(0.0, 0.34, t), 1.5) * 3.4;
      const topFlare = smoothstep(0.70, 1.0, t) * 2.2;
      const ridge = Math.sin(ang * 6 + t * 2.6) * 0.65 + Math.sin(ang * 3 - t * 1.4) * 0.35;
      const rCore = 4.6 + botFlare + topFlare + ridge;
      const d = Math.hypot(lx, ly);

      if (d <= rCore) {
        const fissure = Math.sin(ang * 6 + t * 2.6);
        const isMoss = t > 0.14 && t < 0.72 && ang > 1.25 && ang < 2.55 && d > rCore - 0.9;
        if (isMoss) {
          m.setRaw(x, y, z, mat('moss'), partId.moss);
        } else if (fissure < -0.48) {
          m.setRaw(x, y, z, mat('fiss'), partId.fiss);
        } else {
          m.setRaw(x, y, z, mat('bark'), partId.bark);
        }
      }
    });

    // 5 条外张盘根扎实抓地
    const rootAngs = [0.25, 1.52, 2.78, 4.02, 5.30];
    for (let i = 0; i < rootAngs.length; i++) {
      const a0 = rootAngs[i];
      const a1 = a0 + (i % 2 === 0 ? 0.18 : -0.16);
      const p0x = Math.cos(a0) * 4.5, p0y = Math.sin(a0) * 4.5;
      const p1x = Math.cos(a1) * 8.6, p1y = Math.sin(a1) * 8.6;
      const p2x = Math.cos(a1) * 11.4, p2y = Math.sin(a1) * 11.4;
      m.paintCapsule(p0x, p0y, 6.2, p1x, p1y, 2.6, 2.6, 1.9, mat('root'), partId.root, true);
      m.paintCapsule(p1x, p1y, 2.6, p2x, p2y, 0.9, 1.8, 0.95, mat('bark'), partId.bark, true);

      // 根谷厚青苔垫
      const ma = a0 + 0.62;
      m.paintEllipsoid(Math.cos(ma) * 6.8, Math.sin(ma) * 6.8, 1.8, 2.1, 2.0, 1.3, mat('moss'), partId.moss, true);
    }

    // 树身节疤与老树瘤（+Y 与 -X 侧）
    m.paintEllipsoid(1.0, 4.9, 13.5, 2.2, 1.7, 2.5, mat('bark'), partId.bark, true);
    m.paintEllipsoid(1.0, 5.8, 13.5, 1.15, 0.95, 1.45, mat('fiss'), partId.fiss, true);
    m.paintEllipsoid(-4.2, -1.8, 18.5, 1.9, 1.8, 2.1, mat('moss'), partId.moss, true);

    // 顶部四向粗托枝（伸入树冠底部，半透树冠时清晰可见分叉枝干！）
    const forkAngs = [0.4, 1.95, 3.55, 5.10];
    for (let i = 0; i < forkAngs.length; i++) {
      const a = forkAngs[i];
      m.paintCapsule(
        0, 0, 22.5,
        Math.cos(a) * 8.2, Math.sin(a) * 8.2, 30.2,
        2.5, 1.4, mat('bark'), partId.bark, true
      );
    }

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 11.8, headZ: 31, centerZ: 15 });
  }

  // =========================================================================
  // 2. 分层叶冠构建器（4 重旋转对称，配合 symDeg: 90 省 75% 烘焙图集）
  // =========================================================================
  function buildCanopyTier(makeCanvas, cfg) {
    const { size, h, coreR, lobeR, lobeDist, crownStartZ, fruitRings } = cfg;
    const m = new VoxelModel(size, size, h, SPEC);
    const { mat, partId } = SPEC;
    const half = size * 0.5 - 0.5;
    const midZ = h * 0.48;

    // 4 重对称团簇（中心 + 4 主叶蓬 + 4 对角叶蓬 + 顶蓬）
    const puffs = [
      [0, 0, midZ, coreR, coreR, h * 0.46]
    ];
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI * 0.5);
      puffs.push([Math.cos(a) * lobeDist, Math.sin(a) * lobeDist, midZ - 0.5, lobeR, lobeR, h * 0.40]);
      const a2 = a + Math.PI * 0.25;
      puffs.push([Math.cos(a2) * (lobeDist * 0.88), Math.sin(a2) * (lobeDist * 0.88), midZ + 0.3, lobeR * 0.86, lobeR * 0.86, h * 0.37]);
    }
    puffs.push([0, 0, h * 0.68, coreR * 0.72, coreR * 0.72, h * 0.30]);

    m.fillAABB(-half, half, -half, half, 0, h - 1, (x, y, z, X, Y) => {
      let bestD = 99;
      for (let i = 0; i < puffs.length; i++) {
        const [px, py, pz, rx, ry, rz] = puffs[i];
        const d = (Math.hypot((X - px) / rx, (Y - py) / ry, (z - pz) / rz) - 1.0) * Math.min(rx, ry, rz);
        if (d < bestD) bestD = d;
      }
      // 4 重对称起伏叶缘：用 r 与 cos(4*ang) 严格保持 90° 旋转对称
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const bumpy = Math.cos(ang * 4) * 0.42 + Math.sin(r * 0.75 + z * 0.65) * 0.36;
      if (bestD <= bumpy) {
        let mk = 'leaf';
        if (z <= 2) mk = 'moss';
        else if (z >= crownStartZ) mk = 'crown';
        m.setRaw(x, y, z, mat(mk), partId[mk]);
      }
    });

    // 醒目鲜红熟果点缀（4 重对称排布，俯视 ×4 清晰跳色）
    for (const fr of fruitRings) {
      for (let k = 0; k < 4; k++) {
        const a = fr.angOff + k * (Math.PI * 0.5);
        const fx = Math.cos(a) * fr.r;
        const fy = Math.sin(a) * fr.r;
        m.paintEllipsoid(fx, fy, fr.z, fr.rad, fr.rad, fr.rad * 0.95, mat('fruit'), partId.fruit, true);
        m.paintEllipsoid(fx, fy, fr.z + fr.rad * 0.85, 0.85, 0.85, 0.65, mat('stem'), partId.stem, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: size * 0.44, headZ: h - 1, centerZ: Math.round(h * 0.5) });
  }

  // =========================================================================
  // 3. 树下小落果件（6×6×6，复用 3 颗，symDeg: 90）
  // =========================================================================
  function buildFallenFruit(makeCanvas) {
    const m = new VoxelModel(6, 6, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 2.0, 2.15, 2.15, 1.95, mat('fruit'), partId.fruit, true);
    m.paintCapsule(0, 0, 3.6, 0, 0, 4.9, 0.65, 0.50, mat('stem'), partId.stem, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 5, centerZ: 2 });
  }

  // 树下 3 颗散落熟果的局部坐标
  const GROUND_FRUITS = [
    { lx:  9.2, ly:  6.4, ro: 0.2 },
    { lx: -8.6, ly:  7.8, ro: 1.4 },
    { lx:  3.4, ly: -10.2, ro: 2.6 }
  ];

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_forest_tree',
    code: 'S01',
    name: '林间落果古树',
    status: 'done',
    defaultHabitat: 'forest',
    tag: 'S01 标杆 · 分层可半透树冠乔木',
    summary: '盘根粗树干 + 3 层 90° 对称叶冠拆件（支持半透虚化树冠、保留完整树干与树根）+ 摇树掉果粒子与树下散落红果',
    footRadius: 13.5,
    ecoWeight: 4.0,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',        name: '林风轻拂',     loop: true,  status: 'done' },
      { id: 'fade_canopy', name: '半透遮挡演示', loop: true,  status: 'done' },
      { id: 'shake_drop',  name: '摇树落果',     loop: false, duration: 2.2, status: 'done' }
    ],
    blocks: ['盘根错节粗树干', '3 层 90° 对称可半透树冠', '摇树落果粒子与微弹'],
    soulHabit: '林风轻拂三层树冠错相微摆并偶落绿叶；主角走入树下时仅树冠淡至半透露出树干；被摇动时树冠高频微颤并哗啦掉下一阵鲜红熟果',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        trunk: buildTrunk(makeCanvas),
        canopyLow: buildCanopyTier(makeCanvas, {
          size: 36, h: 15, coreR: 11.4, lobeR: 8.2, lobeDist: 9.2, crownStartZ: 10,
          fruitRings: [
            { r: 13.2, z: 7.4, rad: 1.75, angOff: 0.35 },
            { r: 10.6, z: 11.4, rad: 1.65, angOff: 1.10 }
          ]
        }),
        canopyMid: buildCanopyTier(makeCanvas, {
          size: 32, h: 14, coreR: 9.8, lobeR: 7.2, lobeDist: 7.8, crownStartZ: 8,
          fruitRings: [
            { r: 11.2, z: 7.2, rad: 1.70, angOff: 0.72 },
            { r: 7.6,  z: 10.6, rad: 1.55, angOff: 0.15 }
          ]
        }),
        canopyTop: buildCanopyTier(makeCanvas, {
          size: 22, h: 11, coreR: 6.8, lobeR: 4.8, lobeDist: 5.0, crownStartZ: 4,
          fruitRings: [
            { r: 5.8, z: 7.2, rad: 1.55, angOff: 0.45 }
          ]
        }),
        fallenFruit: buildFallenFruit(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        canopyOpacity: 1.0,
        swayLowX: 0, swayLowY: 0,
        swayMidX: 0, swayMidY: 0,
        swayTopX: 0, swayTopY: 0,
        trunkShakeX: 0, trunkShakeY: 0,
        leafClock: 0.9,
        lastAction: 'idle',
        dropFired: 0
      };

      let curSkin = SKINS[0];

      function spawnLeaf(vfx, sMul, burst) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const a = Math.random() * TAU;
        const r = (4.0 + Math.random() * 11.5) * sMul;
        const wx = state.x + Math.cos(a) * r;
        const wy = state.y + Math.sin(a) * r;
        const wz = (24.0 + Math.random() * 18.0) * sMul;
        const drift = burst ? 7.5 : 3.2;
        vfx.spawnParticle(
          wx, wy, wz,
          (Math.random() - 0.5) * drift * sMul + 1.8 * sMul,
          (Math.random() - 0.5) * drift * sMul,
          (burst ? -3.0 : -1.5) * sMul,
          1.5 + Math.random() * 0.9,
          1.35 + Math.random() * 0.45,
          Math.random() > 0.45 ? fx.leafA : fx.leafB,
          false,
          7.5
        );
      }

      function spawnFallingFruit(vfx, sMul, idx) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const a = (idx / 6) * TAU + (Math.random() - 0.5) * 0.45;
        const r = (7.0 + Math.random() * 7.5) * sMul;
        const wx = state.x + Math.cos(a) * r;
        const wy = state.y + Math.sin(a) * r;
        const wz = (28.0 + Math.random() * 12.0) * sMul;
        const outSpd = (3.5 + Math.random() * 4.5) * sMul;
        vfx.spawnParticle(
          wx, wy, wz,
          Math.cos(a) * outSpd,
          Math.sin(a) * outSpd,
          (3.0 + Math.random() * 4.0) * sMul,
          1.35 + Math.random() * 0.35,
          1.95 + Math.random() * 0.35,
          idx % 2 === 0 ? fx.fruitA : fx.fruitB,
          false,
          52
        );
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
          state.canopyOpacity = 1.0;
          state.swayLowX = state.swayLowY = 0;
          state.swayMidX = state.swayMidY = 0;
          state.swayTopX = state.swayTopY = 0;
          state.trunkShakeX = state.trunkShakeY = 0;
          state.leafClock = 0.8;
          state.lastAction = 'idle';
          state.dropFired = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.dropFired = 0;
          }

          // 1. 树冠半透遮挡控制（仅树冠降 opacity 至 0.36，树干与树根始终保持 1.0）
          const targetOp = action === 'fade_canopy' ? 0.36 : 1.0;
          state.canopyOpacity = lerp(state.canopyOpacity, targetOp, clamp(dt * 6.5, 0, 1));

          // 2. 林风错相极轻水平位移（严格控制在 ±0.35 格以内，严禁小数 scaleX/Y）
          const wAmp = 0.32 * clamp(flex, 0.5, 1.1) * sMul;
          state.swayLowX = Math.sin(time * 1.15 * gFreq) * wAmp * 0.65;
          state.swayLowY = Math.cos(time * 0.90 * gFreq) * wAmp * 0.35;
          state.swayMidX = Math.sin(time * 1.15 * gFreq - 0.85) * wAmp * 0.88;
          state.swayMidY = Math.cos(time * 0.90 * gFreq - 0.70) * wAmp * 0.48;
          state.swayTopX = Math.sin(time * 1.15 * gFreq - 1.65) * wAmp * 1.05;
          state.swayTopY = Math.cos(time * 0.90 * gFreq - 1.40) * wAmp * 0.58;
          state.trunkShakeX = 0;
          state.trunkShakeY = 0;

          // 3. 动作专属反馈
          if (action === 'shake_drop') {
            const u = clamp(actionTime / 2.2, 0, 1);
            const env = Math.sin(clamp(u / 0.14, 0, 1) * Math.PI * 0.5) * (1 - smoothstep(0.55, 0.96, u));
            const tremor = Math.sin(actionTime * 36.0 * gFreq) * env;
            const tremorY = Math.cos(actionTime * 29.0 * gFreq) * env * 0.45;
            state.trunkShakeX = tremor * 0.42 * sMul;
            state.trunkShakeY = tremorY * 0.25 * sMul;
            state.swayLowX += tremor * 0.75 * sMul;
            state.swayMidX += Math.sin(actionTime * 36.0 * gFreq - 0.5) * env * 0.95 * sMul;
            state.swayTopX += Math.sin(actionTime * 36.0 * gFreq - 1.0) * env * 1.15 * sMul;

            // 在 0.18s ~ 1.15s 之间分批落下 6 颗赤红熟果与一阵绿叶
            const dropSchedule = [0.18, 0.34, 0.52, 0.70, 0.88, 1.08];
            while (state.dropFired < dropSchedule.length && actionTime >= dropSchedule[state.dropFired]) {
              spawnFallingFruit(vfx, sMul, state.dropFired);
              spawnLeaf(vfx, sMul, true);
              if (state.dropFired % 2 === 0) spawnLeaf(vfx, sMul, true);
              if (vfx && state.dropFired === 0) {
                vfx.addRipple(state.x, state.y, 4.0 * sMul, 16.0 * sMul, 0.65, 1.6);
              }
              state.dropFired++;
            }
          } else {
            // 常态与半透态偶有一两片绿叶轻飘落下
            state.leafClock -= dt;
            if (state.leafClock <= 0) {
              state.leafClock = 1.6 + Math.random() * 1.4;
              spawnLeaf(vfx, sMul, false);
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const op = state.canopyOpacity;
          const list = [];

          // 1. 树下散落的 3 颗鲜红落果（复用同一小件）
          for (let i = 0; i < GROUND_FRUITS.length; i++) {
            const gf = GROUND_FRUITS[i];
            const [fx, fy] = localToWorldXY(state.x, state.y, yw, gf.lx * sMul, gf.ly * sMul);
            list.push({
              partKey: 'fallenFruit',
              asset: parts.fallenFruit,
              x: fx,
              y: fy,
              lift: 0,
              ro: wrapAngle(yw + gf.ro),
              bias: -0.10,
              symDeg: 90
            });
          }

          // 2. 盘根错节粗树干（始终保持不透明 1.0）
          list.push({
            partKey: 'trunk',
            asset: parts.trunk,
            x: state.x + state.trunkShakeX,
            y: state.y + state.trunkShakeY,
            lift: 0,
            ro: yw,
            opacity: 1.0,
            bias: -0.20
          });

          // 3. 三层错落叠放叶冠（独立下调 opacity，均标 symDeg: 90 省贴图）
          list.push({
            partKey: 'canopyLow',
            asset: parts.canopyLow,
            x: state.x + state.swayLowX,
            y: state.y + state.swayLowY,
            lift: 22.0 * sMul,
            ro: yw,
            opacity: op,
            bias: 1.40,
            symDeg: 90
          });

          list.push({
            partKey: 'canopyMid',
            asset: parts.canopyMid,
            x: state.x + state.swayMidX,
            y: state.y + state.swayMidY,
            lift: 31.0 * sMul,
            ro: wrapAngle(yw + 0.39),
            opacity: op,
            bias: 2.20,
            symDeg: 90
          });

          list.push({
            partKey: 'canopyTop',
            asset: parts.canopyTop,
            x: state.x + state.swayTopX,
            y: state.y + state.swayTopY,
            lift: 39.0 * sMul,
            ro: wrapAngle(yw + 0.78),
            opacity: op,
            bias: 3.00,
            symDeg: 90
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
