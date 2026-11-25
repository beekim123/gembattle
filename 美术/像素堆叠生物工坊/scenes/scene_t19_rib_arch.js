'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T19 · 巨兽跨台白骨肋拱（scenes/scene_t19_rib_arch.js）
  //
  // 生态呼应（文档/生态设计数据.js T19 carcass）：
  //   - 吞天长蛇死后尸骨，黑褐腐土 + 跨台白骨肋拱 + 淡青菌斑；
  //   - 拱心下方留出宽敞通道（宽约 24 格、净高约 13 格），与 地5（earth5_rib_crawler）
  //     及 地9（earth9_bone_shears）比例严丝合缝合拍；
  //   - 3 套换皮严格对应遗骸年头：枯骨生苔期 / 新鲜残肉期 / 覆菌古骨期！
  //
  // 拆件与图集预算（每块严格 <= 34 格，左右对称复用省贴图）：
  //   - ribBaseMound (12×12×13)：黑褐腐土墩 + 斜插粗骨根 + 残皮碎块 + 软菌斑（复用 6 次）
  //   - ribArchSpan  (10×32×13)：高耸弯曲巨兽白骨肋拱穹顶 + 暗褐骨缝（复用 3 次）
  //   - fungusPatch  (10×10×6, symDeg: 90)：骨根淡青软菌簇 + 微亮孢子核（仅 sporeCore 进 glowKeys）
  //   - boneShard    (8×8×5,   symDeg: 90)：散落腐土边的碎骨片与残皮块
  //
  // 展示动作：
  //   - idle        ：苍凉静立，骨缝间偶飘起几缕极淡青灰孢子烟
  //   - spore_drift ：骨根淡青菌斑脉动，从拱下散出一团微亮青白孢子粒
  // =========================================================================

  // 23 色独立色表（<= 48 色、0 重色、仅 sporeCore 进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 巨兽象牙白/浅灰白骨（3 阶，与黑褐腐土强明暗反差）
      boneDark:   '#9c927f',
      boneMid:    '#d9d0bc',
      boneHi:     '#f7f2e4',
      // 暗褐骨缝与风化裂纹（3 阶）
      crackDark:  '#36271d',
      crackMid:   '#5c4534',
      crackHi:    '#85674f',
      // 黑褐腐土墩（3 阶）
      soilDark:   '#1f1610',
      soilMid:    '#38281c',
      soilHi:     '#57402d',
      // 残皮与筋膜碎块（3 阶，在「新鲜残肉期」高亮为暗红褐残肉）
      fleshDark:  '#4a221f',
      fleshMid:   '#7d3b34',
      fleshHi:    '#b06054',
      // 骨根淡青软菌毯（3 阶）
      fungDark:   '#245954',
      fungMid:    '#439c90',
      fungHi:     '#84decb',
      // 软菌伞沿浅青边（3 阶）
      rimDark:    '#347870',
      rimMid:     '#63bfae',
      rimHi:      '#b0f2e2',
      // 腐菌微亮孢子核（唯一自亮键，进 glowKeys）
      sporeCore:  '#a6fff0',
      // 潮湿暗苔过渡（3 阶）
      mossDark:   '#253b2e',
      mossMid:    '#3d614a',
      mossHi:     '#649473',
      // 骨髓孔深暗槽（1 阶）
      marrowDark: '#261b17'
    },
    glowKeys: ['sporeCore'],
    parts: ['bone', 'crack', 'soil', 'flesh', 'fung', 'rim', 'spore', 'moss', 'marrow'],
    noCrease: [
      ['bone', 'crack'], ['bone', 'marrow'], ['soil', 'moss'],
      ['fung', 'rim'], ['fung', 'spore'], ['rim', 'spore'], ['flesh', 'soil']
    ],
    materials: {
      bone:   ['boneDark',   'boneMid',   'boneHi'],
      crack:  ['crackDark',  'crackMid',  'crackHi'],
      soil:   ['soilDark',   'soilMid',   'soilHi'],
      flesh:  ['fleshDark',  'fleshMid',  'fleshHi'],
      fung:   ['fungDark',   'fungMid',   'fungHi'],
      rim:    ['rimDark',    'rimMid',    'rimHi'],
      spore:  ['sporeCore',  'sporeCore', 'sporeCore'],
      moss:   ['mossDark',   'mossMid',   'mossHi'],
      marrow: ['marrowDark', 'marrowDark', 'marrowDark']
    },
    protectedParts: ['crack', 'spore', 'flesh']
  });

  // 3 套年头换皮（精准落实生态原案：枯骨生苔期 / 新鲜残肉期 / 覆菌古骨期；0 禁用字）
  const SKINS = [
    {
      id: 'bone_moss_stage',
      name: '枯骨生苔期',
      dot: '#d9d0bc',
      outline: '#17120e',
      pal: {},
      fx: { sporeA: '#84decb', sporeB: '#d9fff8', mist: '#9ab3ad' }
    },
    {
      id: 'fresh_flesh_stage',
      name: '新鲜残肉期',
      dot: '#a8292d',
      outline: '#1c0c0d',
      pal: {
        boneDark:   '#b09980', boneMid:  '#e3cfa8', boneHi:  '#faf0d4',
        crackDark:  '#4d1419', crackMid: '#82232a', crackHi: '#b53f43',
        fleshDark:  '#5c1118', fleshMid: '#a8222b', fleshHi: '#e05355',
        fungDark:   '#6e2226', fungMid:  '#ad3c39', fungHi:  '#db7063',
        rimDark:    '#7d3528', rimMid:   '#bd5d46', rimHi:   '#eb9b7d',
        sporeCore:  '#ffad94',
        mossDark:   '#471d1a', mossMid:  '#78342d', mossHi:  '#a85247'
      },
      fx: { sporeA: '#db7063', sporeB: '#ffd4c2', mist: '#a36b65' }
    },
    {
      id: 'ancient_fungus_stage',
      name: '覆菌古骨期',
      dot: '#48c2ad',
      outline: '#0c1716',
      pal: {
        boneDark:   '#687875', boneMid:  '#9eb0ab', boneHi:  '#cfdcd8',
        crackDark:  '#243836', crackMid: '#3d5e59', crackHi: '#628c84',
        fleshDark:  '#1d4f49', fleshMid: '#34877c', fleshHi: '#68c9b8',
        fungDark:   '#1a6b62', fungMid:  '#32baaa', fungHi:  '#7ef5df',
        rimDark:    '#298f82', rimMid:   '#54dec9', rimHi:   '#b8fff2',
        sporeCore:  '#b8fff6',
        mossDark:   '#1e5446', mossMid:  '#388f75', mossHi:  '#74d4b1'
      },
      fx: { sporeA: '#54dec9', sporeB: '#d6fff9', mist: '#7eb5ab' }
    }
  ];

  // =========================================================================
  // 1. 体素建模（单盒严格 <= 32 格，对称复用）
  // =========================================================================

  // 1) 腐土骨根墩（12×12×13，左右南北 6 处复用）
  function buildRibBaseMound(makeCanvas) {
    const m = new VoxelModel(12, 12, 13, SPEC);
    const { mat, partId } = SPEC;

    // 黑褐腐土墩底座
    m.fillAABB(-5.5, 5.5, -5.5, 5.5, 0, 4, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const rad = lerp(5.4, 3.2, z / 4.2) + Math.sin(Math.atan2(Y, X) * 4) * 0.45;
      if (r > rad) return;
      const isMoss = z >= 2 && Y > 1.2 && r > 2.5;
      m.setRaw(x, y, z, isMoss ? mat('moss') : mat('soil'), isMoss ? partId.moss : partId.soil);
    });

    // 斜插而出的粗壮巨兽白骨肋根（向上微微内收承接拱穹）
    m.paintCapsule(0, -1.2, 1.4, 0, 1.4, 11.8, 3.1, 2.35, mat('bone'), partId.bone, true);
    // 暗褐骨缝切痕（增强白骨立体棱感）
    m.paintCapsule(-2.2, -0.4, 3.8, -1.7, 0.8, 9.6, 0.72, 0.58, mat('crack'), partId.crack, true);
    m.paintCapsule( 2.2, -0.4, 3.8,  1.7, 0.8, 9.6, 0.72, 0.58, mat('crack'), partId.crack, true);
    // 根部缠附的残皮筋膜碎块
    m.paintEllipsoid(2.3, -1.6, 4.0, 1.8, 1.5, 2.2, mat('flesh'), partId.flesh, true);
    m.paintEllipsoid(-2.1, 1.8, 3.2, 1.6, 1.4, 1.7, mat('flesh'), partId.flesh, true);
    // 骨根内侧淡青软菌斑 + 微亮孢子核
    m.paintEllipsoid(0, 2.8, 3.4, 2.3, 1.7, 1.5, mat('fung'), partId.fung, true);
    m.paintEllipsoid(0, 3.3, 4.0, 1.2, 0.9, 0.9, mat('rim'), partId.rim, true);
    m.setRaw(6, 9, 4, SPEC.keyToId.sporeCore, partId.spore);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 12, centerZ: 6 });
  }

  // 2) 高耸白骨肋拱穹顶（10×32×13，沿 Y 轴大跨距横跨南北骨根，拱腹留足净空给 地5 穿行！）
  function buildRibArchSpan(makeCanvas) {
    const m = new VoxelModel(10, 32, 13, SPEC);
    const { mat, partId } = SPEC;

    const steps = 22;
    for (let i = 0; i < steps; i++) {
      const u0 = i / steps;
      const u1 = (i + 1) / steps;
      const y0 = lerp(-14.2, 14.2, u0);
      const y1 = lerp(-14.2, 14.2, u1);
      // 高耸厚重门拱弧线（两端贴合骨根 z=1.0，拱心拔高至 z=10.4）
      const z0 = 1.0 + Math.sin(u0 * Math.PI) * 9.4;
      const z1 = 1.0 + Math.sin(u1 * Math.PI) * 9.4;
      const x0 = Math.sin(u0 * Math.PI) * 1.6;
      const x1 = Math.sin(u1 * Math.PI) * 1.6;
      // 两端粗壮 2.35，拱顶收紧至 1.85，呈天然巨兽肋骨截面
      const r0 = lerp(2.35, 1.80, Math.sin(u0 * Math.PI));
      const r1 = lerp(2.35, 1.80, Math.sin(u1 * Math.PI));
      m.paintCapsule(x0, y0, z0, x1, y1, z1, r0, r1, mat('bone'), partId.bone, true);
    }

    // 肋拱侧面雕刻暗褐风化骨缝 + 骨节棱脊
    for (const uMark of [0.22, 0.50, 0.78]) {
      const ym = lerp(-14.2, 14.2, uMark);
      const zm = 1.0 + Math.sin(uMark * Math.PI) * 9.4;
      const xm = Math.sin(uMark * Math.PI) * 1.6;
      m.paintEllipsoid(xm, ym, zm, 2.25, 0.85, 2.15, mat('crack'), partId.crack, true);
    }

    // 拱腰挂附两片残皮筋膜 + 淡青软菌斑
    m.paintEllipsoid(1.5, -8.5, 6.2, 1.5, 2.2, 1.4, mat('flesh'), partId.flesh, true);
    m.paintEllipsoid(1.6,  8.5, 6.2, 1.4, 2.0, 1.3, mat('fung'), partId.fung, true);
    m.paintEllipsoid(1.8,  8.5, 6.6, 0.9, 1.1, 0.8, mat('rim'), partId.rim, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 14.5, headZ: 12, centerZ: 6 });
  }

  // 3) 骨根淡青软菌簇（10×10×6，symDeg: 90，含微亮孢子核）
  function buildFungusPatch(makeCanvas) {
    const m = new VoxelModel(10, 10, 6, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 底部腐土与软菌座
    m.paintEllipsoid(0, 0, 1.2, 4.1, 4.1, 1.2, mat('soil'), partId.soil, true);
    m.paintEllipsoid(0, 0, 2.4, 3.5, 3.5, 1.4, mat('fung'), partId.fung, true);
    m.paintEllipsoid(0, 0, 3.6, 2.6, 2.6, 1.1, mat('rim'), partId.rim, true);

    // 4 重对称小菌苞 + 微亮孢子核
    for (let k = 0; k < 4; k++) {
      const a = k * (Math.PI * 0.5) + 0.4;
      m.paintEllipsoid(Math.cos(a) * 2.5, Math.sin(a) * 2.5, 3.0, 1.3, 1.3, 1.2, mat('fung'), partId.fung, true);
    }
    m.setRaw(4, 4, 4, keyToId.sporeCore, partId.spore);
    m.setRaw(5, 5, 4, keyToId.sporeCore, partId.spore);
    m.setRaw(4, 5, 4, keyToId.sporeCore, partId.spore);
    m.setRaw(5, 4, 4, keyToId.sporeCore, partId.spore);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 5, centerZ: 3 });
  }

  // 4) 腐土边碎骨与残皮块（8×8×5，symDeg: 90）
  function buildBoneShard(makeCanvas) {
    const m = new VoxelModel(8, 8, 5, SPEC);
    const { mat, partId } = SPEC;

    m.paintEllipsoid(0, 0, 1.0, 3.2, 2.8, 1.1, mat('soil'), partId.soil, true);
    m.paintCapsule(-2.2, -0.8, 1.8, 2.2, 0.8, 2.4, 1.1, 0.85, mat('bone'), partId.bone, true);
    m.paintEllipsoid(0, 0, 2.0, 0.8, 0.8, 0.7, mat('marrow'), partId.marrow, true);
    m.paintEllipsoid(-1.4, 1.6, 1.6, 1.1, 1.0, 0.9, mat('flesh'), partId.flesh, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2, headZ: 4, centerZ: 2 });
  }

  // 3 根巨兽肋拱排布（沿 X 轴错开成宏伟骨门走廊，拱腹净宽 24 格、净高 13 格）
  const RIB_ARCHES = [
    { lx: -13.0, ly:  0.0, spanLift: 10.2, yawOff:  0.06 },
    { lx:   0.0, ly:  0.0, spanLift: 11.6, yawOff:  0.00 },
    { lx:  13.0, ly:  0.0, spanLift: 10.2, yawOff: -0.06 }
  ];
  const PILLAR_HALF_Y = 14.0;

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t19_rib_arch',
    code: 'T19',
    name: '巨兽跨台白骨肋拱',
    status: 'done',
    defaultHabitat: 'carcass',
    tag: 'T19 巨兽遗骸 · 肉/菌/骨三档换皮肋拱',
    summary: '3 根粗壮弯曲的巨蛇白骨肋条呈门拱状斜插在黑褐腐土墩上（复用对称弧骨拆件，单块 <= 32 格），拱心留出宽敞穿行净空供 地5 与 地9 穿行，3 套换皮精准对应遗骸年头',
    footRadius: 18.5,
    ecoWeight: 5.0,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',        name: '苍凉静立',     loop: true,  status: 'done' },
      { id: 'spore_drift', name: '菌斑孢子飘散', loop: false, duration: 2.6, status: 'done' }
    ],
    blocks: ['3 根对称复用巨兽白骨肋拱', '宽敞拱腹穿行净空', '枯骨/残肉/覆菌三档年头换皮'],
    soulHabit: '黑褐腐土上斜插三道苍凉白骨门拱，骨缝间偶飘起几缕极淡青灰孢子烟；菌斑脉动时从拱下散出一团微亮青白孢子粒',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        ribBaseMound: buildRibBaseMound(makeCanvas),
        ribArchSpan:  buildRibArchSpan(makeCanvas),
        fungusPatch:  buildFungusPatch(makeCanvas),
        boneShard:    buildBoneShard(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        fungusPulseZ: 0,
        idleSmokeClock: 0.7,
        lastAction: 'idle',
        driftWavesFired: 0
      };

      let curSkin = SKINS[0];

      function spawnSporeMote(vfx, sMul, dense) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const rx = (Math.random() - 0.5) * 26.0 * sMul;
        const ry = (Math.random() - 0.5) * 24.0 * sMul;
        const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, rx, ry);
        const wz = (dense ? (2.5 + Math.random() * 6.0) : (6.0 + Math.random() * 10.0)) * sMul;
        vfx.spawnParticle(
          wx, wy, wz,
          (Math.random() - 0.5) * (dense ? 7.5 : 2.5) * sMul,
          (Math.random() - 0.5) * (dense ? 7.5 : 2.5) * sMul,
          (dense ? (4.0 + Math.random() * 4.5) : (1.8 + Math.random() * 2.0)) * sMul,
          dense ? (1.4 + Math.random() * 0.7) : (1.8 + Math.random() * 0.8),
          dense ? (1.35 + Math.random() * 0.35) : 1.05,
          dense ? (Math.random() > 0.4 ? fx.sporeA : fx.sporeB) : fx.mist,
          dense,
          dense ? -1.8 : -0.8
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
          state.fungusPulseZ = 0;
          state.idleSmokeClock = 0.7;
          state.lastAction = 'idle';
          state.driftWavesFired = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.driftWavesFired = 0;
          }

          if (action === 'spore_drift') {
            // 菌斑脉动（极轻垂直微伏，严禁 scaleX/Y）+ 分 5 波从拱下散出青白孢子粒
            const u = clamp(actionTime / 2.6, 0, 1);
            const env = Math.sin(u * Math.PI);
            state.fungusPulseZ = Math.abs(Math.sin(actionTime * 7.5 * gFreq)) * 0.55 * env * sMul;

            const waveTimes = [0.20, 0.52, 0.90, 1.32, 1.78];
            while (state.driftWavesFired < waveTimes.length && actionTime >= waveTimes[state.driftWavesFired]) {
              for (let k = 0; k < 5; k++) spawnSporeMote(vfx, sMul, true);
              state.driftWavesFired++;
            }
          } else {
            state.fungusPulseZ = Math.sin(time * 1.6 * gFreq) * 0.14 * sMul;
            state.idleSmokeClock -= dt;
            if (state.idleSmokeClock <= 0) {
              state.idleSmokeClock = 1.1 + Math.random() * 1.0;
              spawnSporeMote(vfx, sMul, false);
            }
          }
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;

          // 1. 3 道白骨肋拱（南北对称腐土骨根墩 + 高耸拱顶，拱心留足穿行净空）
          for (let i = 0; i < RIB_ARCHES.length; i++) {
            const rb = RIB_ARCHES[i];
            const rYaw = wrapAngle(yw + rb.yawOff);
            const [cx, cy] = localToWorldXY(state.x, state.y, yw, rb.lx * sMul, rb.ly * sMul);
            const [nx, ny] = localToWorldXY(cx, cy, rYaw, 0,  PILLAR_HALF_Y * sMul);
            const [sx, sy] = localToWorldXY(cx, cy, rYaw, 0, -PILLAR_HALF_Y * sMul);

            // 南北腐土骨根墩（真实 3D 排序，让穿行生物从两根中间经过）
            list.push({
              partKey: 'ribBaseMound',
              asset: parts.ribBaseMound,
              x: nx, y: ny, lift: 0,
              ro: wrapAngle(rYaw + Math.PI),
              bias: -0.10 + i * 0.02
            });
            list.push({
              partKey: 'ribBaseMound',
              asset: parts.ribBaseMound,
              x: sx, y: sy, lift: 0,
              ro: rYaw,
              bias: -0.10 + i * 0.02
            });

            // 高耸弯曲白骨拱顶（lift 高悬于通道上方，留足净空给 地5 穿行）
            list.push({
              partKey: 'ribArchSpan',
              asset: parts.ribArchSpan,
              x: cx, y: cy,
              lift: rb.spanLift * sMul,
              ro: rYaw,
              bias: 4.5 + i * 0.15
            });
          }

          // 2. 骨根内侧 4 处淡青软菌簇（含微亮孢子核，随 spore_drift 轻脉动）
          const fungusSpots = [
            { lx: -6.8, ly:  11.8, ro: 0.4 },
            { lx:  6.8, ly: -11.8, ro: 1.9 },
            { lx: -7.2, ly: -12.4, ro: 2.8 },
            { lx:  7.4, ly:  12.2, ro: 0.9 }
          ];
          for (let i = 0; i < fungusSpots.length; i++) {
            const fs = fungusSpots[i];
            const [fx, fy] = localToWorldXY(state.x, state.y, yw, fs.lx * sMul, fs.ly * sMul);
            list.push({
              partKey: 'fungusPatch',
              asset: parts.fungusPatch,
              x: fx, y: fy,
              lift: Math.max(0, state.fungusPulseZ),
              ro: wrapAngle(yw + fs.ro),
              bias: -0.25,
              symDeg: 90
            });
          }

          // 3. 腐土外侧 2 处散落碎骨片
          const shardSpots = [
            { lx: -17.5, ly:  6.5, ro: 0.7 },
            { lx:  17.2, ly: -7.2, ro: 2.2 }
          ];
          for (let i = 0; i < shardSpots.length; i++) {
            const sh = shardSpots[i];
            const [bx, by] = localToWorldXY(state.x, state.y, yw, sh.lx * sMul, sh.ly * sMul);
            list.push({
              partKey: 'boneShard',
              asset: parts.boneShard,
              x: bx, y: by,
              lift: 0,
              ro: wrapAngle(yw + sh.ro),
              bias: -0.35,
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
