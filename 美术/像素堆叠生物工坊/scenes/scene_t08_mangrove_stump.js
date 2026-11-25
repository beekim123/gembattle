'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T08 潮汐滩涂 · 滩涂支柱根与破船肋木
  //
  // 视觉层次：红褐纠缠拱形红树支柱根枯木桩（根脚 submerge: 0.4 浸浅潮水）斜靠着
  // 两根苍白带亮铜钉的弧形旧木船肋骨与褪色赤红撕裂破帆布角，枯木梢挂鱼人骨贝标记串。
  //
  // 拆件与图集预算（单盒严格 <= 40 格，0 自亮键）：
  //   - rootBase       (32×30×14, lift=0,  submerge=0.40)：拱形纠缠红树支柱根脚 + 湿泥藤壶点
  //   - stumpTrunk     (20×20×22, lift=10, submerge=0.0)：红褐枯木主桩与斜伸枯枝梢
  //   - shipRib        (24×10×24, lift=0,  submerge=0.35)：苍白旧木船弧形肋骨 + 亮铜钉（复用 2 根）
  //   - tornSail       (14×8×15,  lift=14)：褪色赤红撕裂破帆布角（随海风猎猎轻摆）
  //   - boneShellCharm (9×9×12,   lift=18, symDeg=180)：枯木梢悬挂的鱼人骨贝标记串
  // =========================================================================

  // 27 色独立色表（<= 48 色、0 重色、glowKeys: []）
  const SPEC = createPaletteSpec({
    pal: {
      // 红褐纠缠红树支柱根
      rootDark:     '#471d12',
      rootMid:      '#823720',
      rootHi:       '#ba5938',
      // 枯木桩干裂心材
      barkDark:     '#382218',
      barkMid:      '#633e2c',
      barkHi:       '#94644b',
      // 苍白搁浅旧船肋木（高对比浅褐旧木）
      ribDark:      '#7d6c56',
      ribMid:       '#bfab8e',
      ribHi:        '#ede0c7',
      // 船肋亮铜钉（拉开探险遗迹金属焦点）
      copperDark:   '#9e4e18',
      copperMid:    '#e6872e',
      copperHi:     '#ffd166',
      // 褪色赤红撕裂破帆布
      sailDark:     '#781d22',
      sailMid:      '#c43b3e',
      sailHi:       '#f27c72',
      // 麻绳绑带
      ropeDark:     '#6e5738',
      ropeMid:      '#ad8d5f',
      ropeHi:       '#dec292',
      // 象牙白骨贝标记
      boneDark:     '#9e9585',
      boneMid:      '#e3dac8',
      boneHi:       '#fffcf2',
      // 粉彩贝壳饰片
      shellDark:    '#a85468',
      shellMid:     '#e6859b',
      shellHi:      '#ffc7d4',
      // 根部湿青苔点缀
      mossDark:     '#1d4a31',
      mossMid:      '#367a4e',
      mossHi:       '#6bb87c'
    },
    glowKeys: [],
    parts: ['root', 'bark', 'rib', 'copper', 'sail', 'rope', 'bone', 'shell', 'moss'],
    noCrease: [
      ['root', 'bark'], ['root', 'moss'], ['bark', 'moss'],
      ['rib', 'copper'], ['sail', 'rope'], ['bone', 'rope'], ['bone', 'shell']
    ],
    materials: {
      root:   ['rootDark',   'rootMid',   'rootHi'],
      bark:   ['barkDark',   'barkMid',   'barkHi'],
      rib:    ['ribDark',    'ribMid',    'ribHi'],
      copper: ['copperDark', 'copperMid', 'copperHi'],
      sail:   ['sailDark',   'sailMid',   'sailHi'],
      rope:   ['ropeDark',   'ropeMid',   'ropeHi'],
      bone:   ['boneDark',   'boneMid',   'boneHi'],
      shell:  ['shellDark',  'shellMid',  'shellHi'],
      moss:   ['mossDark',   'mossMid',   'mossHi']
    },
    protectedParts: ['copper', 'sail', 'bone', 'shell']
  });

  // 3 套换色皮肤（红木赤帆、漂白沉木青帆、黑泥苔根）
  const SKINS = [
    {
      id: 'redwood_crimson_sail',
      name: '红木赤帆',
      dot: '#c43b3e',
      outline: '#1a1210',
      pal: {},
      fx: {
        splashA: '#e8faf5',
        splashB: '#9ed9d2',
        mudBit:  '#6b5a45'
      }
    },
    {
      id: 'bleached_driftwood_teal',
      name: '漂白沉木青帆',
      dot: '#36a8a8',
      outline: '#121c20',
      pal: {
        rootDark:   '#59534b', rootMid:   '#948b7e', rootHi:   '#cfc6b8',
        barkDark:   '#4d4740', barkMid:   '#80786c', barkHi:   '#bab1a2',
        ribDark:    '#827768', ribMid:    '#c7baa6', ribHi:    '#f5eee0',
        sailDark:   '#1a5e66', sailMid:   '#36a8a8', sailHi:   '#8ae8e0',
        shellDark:  '#c46e47', shellMid:  '#f5a476', shellHi:  '#ffd9b8'
      },
      fx: {
        splashA: '#f0ffff',
        splashB: '#8ae8e0',
        mudBit:  '#8a8275'
      }
    },
    {
      id: 'black_mud_moss_root',
      name: '黑泥苔根',
      dot: '#48995a',
      outline: '#0e1410',
      pal: {
        rootDark:   '#241e1b', rootMid:   '#453a33', rootHi:   '#6e5d52',
        barkDark:   '#1c1a18', barkMid:   '#38342f', barkHi:   '#5c554c',
        ribDark:    '#6b5e4c', ribMid:    '#a8967c', ribHi:    '#dbccb4',
        sailDark:   '#6e351a', sailMid:   '#b55b2c', sailHi:   '#eb965e',
        mossDark:   '#1e5c32', mossMid:   '#409c56', mossHi:   '#82db88'
      },
      fx: {
        splashA: '#e6f5ed',
        splashB: '#86c9a2',
        mudBit:  '#423b32'
      }
    }
  ];

  // =========================================================================
  // 1. 拱形纠缠红树支柱根脚（32×30×14，根脚带 submerge: 0.4）
  // =========================================================================
  function buildRootBase(makeCanvas) {
    const m = new VoxelModel(32, 30, 14, SPEC);
    const { mat, partId } = SPEC;

    // 中心根冠结
    m.paintEllipsoid(-2.0, -1.0, 10.5, 5.2, 5.0, 3.6, mat('root'), partId.root, true);

    // 6 条高拱外张的红树支柱根，中间留空洞拱门插入湿泥水
    const arches = [
      { ang: 0.15, rMid: 8.0,  rEnd: 13.5, hMid: 9.2 },
      { ang: 1.25, rMid: 7.6,  rEnd: 12.8, hMid: 8.6 },
      { ang: 2.35, rMid: 8.2,  rEnd: 13.2, hMid: 9.4 },
      { ang: 3.40, rMid: 7.8,  rEnd: 12.6, hMid: 8.8 },
      { ang: 4.50, rMid: 8.4,  rEnd: 13.4, hMid: 9.0 },
      { ang: 5.55, rMid: 7.4,  rEnd: 12.2, hMid: 8.2 }
    ];
    for (let i = 0; i < arches.length; i++) {
      const a = arches[i];
      const cx = -2.0, cy = -1.0;
      const mx = cx + Math.cos(a.ang) * a.rMid;
      const my = cy + Math.sin(a.ang) * a.rMid;
      const ex = cx + Math.cos(a.ang + 0.12) * a.rEnd;
      const ey = cy + Math.sin(a.ang + 0.12) * a.rEnd;
      m.paintCapsule(cx, cy, 11.0, mx, my, a.hMid, 2.2, 1.85, mat('root'), partId.root, true);
      m.paintCapsule(mx, my, a.hMid, ex, ey, 0.8, 1.85, 1.35, mat('root'), partId.root, true);

      // 根拱转折处添一撮湿苔或米白小藤壶
      if (i % 2 === 0) {
        m.paintEllipsoid(mx, my, a.hMid + 1.0, 1.6, 1.5, 1.1, mat('moss'), partId.moss, true);
      } else {
        m.paintEllipsoid(ex * 0.85, ey * 0.85, 3.2, 1.35, 1.35, 1.1, mat('bone'), partId.bone, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 14.5, headZ: 13, centerZ: 6 });
  }

  // =========================================================================
  // 2. 枯木主桩与斜伸枯枝梢（20×20×22）
  // =========================================================================
  function buildStumpTrunk(makeCanvas) {
    const m = new VoxelModel(20, 20, 22, SPEC);
    const { mat, partId } = SPEC;

    // 略倾斜的粗糙枯木桩干
    m.paintCapsule(0, 0, 0.5, -1.2, -0.8, 12.0, 4.4, 3.4, mat('bark'), partId.bark, true);
    m.paintCapsule(-1.2, -0.8, 11.5, -2.2, -1.4, 17.5, 3.2, 2.1, mat('root'), partId.root, true);

    // 断茬斜枝（+X 侧伸出挂骨贝串的主枯枝）
    m.paintCapsule(-1.0, -0.6, 12.8, 6.2, 2.4, 19.6, 1.9, 1.15, mat('root'), partId.root, true);
    // 另一侧短断丫
    m.paintCapsule(-1.5, -1.0, 13.5, -6.4, 3.2, 18.2, 1.7, 1.0, mat('bark'), partId.bark, true);

    // 树腰苔斑与麻绳缠圈
    m.paintEllipsoid(-3.2, 1.2, 7.5, 1.8, 1.6, 2.2, mat('moss'), partId.moss, true);
    m.paintCapsule(3.4, 1.2, 17.0, 5.4, 2.0, 18.8, 1.55, 1.45, mat('rope'), partId.rope, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.5, headZ: 21, centerZ: 10 });
  }

  // =========================================================================
  // 3. 苍白搁浅破船弧形肋骨 + 亮铜钉（24×10×24，复用 2 根）
  // =========================================================================
  function buildShipRib(makeCanvas) {
    const m = new VoxelModel(24, 10, 24, SPEC);
    const { mat, partId } = SPEC;

    // 粗厚弯曲船肋木：从泥里斜插而出，向上弯成月牙弧形
    const pts = [
      [-9.0, 0,  1.2, 2.3],
      [-5.2, 0,  6.4, 2.1],
      [-0.5, 0, 12.2, 1.95],
      [ 4.6, 0, 17.6, 1.75],
      [ 9.2, 0, 21.8, 1.45]
    ];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      m.paintCapsule(a[0], a[1], a[2], b[0], b[1], b[2], a[3], b[3], mat('rib'), partId.rib, true);
    }

    // 横向残存断船板条 + 醒目亮铜钉
    m.paintCapsule(-2.2, -3.2, 10.4, -2.2, 3.2, 10.4, 1.25, 1.25, mat('rib'), partId.rib, true);
    m.paintCapsule( 3.2, -2.8, 16.0,  3.2, 2.8, 16.0, 1.15, 1.15, mat('rib'), partId.rib, true);

    // 4 枚亮铜铆钉（俯视 ×4 清晰跳色）
    m.paintEllipsoid(-5.0, 1.6,  6.8, 0.95, 0.95, 0.95, mat('copper'), partId.copper, true);
    m.paintEllipsoid(-2.2, 2.6, 10.8, 0.95, 0.95, 0.95, mat('copper'), partId.copper, true);
    m.paintEllipsoid( 3.2, 2.2, 16.4, 0.95, 0.95, 0.95, mat('copper'), partId.copper, true);
    m.paintEllipsoid( 7.6, 1.2, 20.4, 0.90, 0.90, 0.90, mat('copper'), partId.copper, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.5, headZ: 23, centerZ: 11 });
  }

  // =========================================================================
  // 4. 褪色赤红撕裂破帆布角（14×8×15）
  // =========================================================================
  function buildTornSail(makeCanvas) {
    const m = new VoxelModel(14, 8, 15, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.5, 6.5, -3.5, 3.5, 0, 14, (x, y, z, X, Y) => {
      // 倒三角撕裂帆布，底边呈锯齿撕口，随 X 微波折
      const u = z / 14;
      const halfW = 1.2 + u * 5.2;
      const waveY = Math.sin(X * 0.55 + z * 0.3) * 1.15;
      const tearCut = (X < -1.2 ? 3.5 : (X > 2.2 ? 5.0 : 1.0)) + Math.sin(X * 1.6) * 1.2;

      if (Math.abs(X) <= halfW && Math.abs(Y - waveY) <= 0.95 && z >= tearCut) {
        if (z >= 12.5) {
          m.setRaw(x, y, z, mat('rope'), partId.rope);
        } else {
          m.setRaw(x, y, z, mat('sail'), partId.sail);
        }
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 6.5, headZ: 14, centerZ: 8 });
  }

  // =========================================================================
  // 5. 枯木梢悬挂鱼人骨贝标记串（9×9×12，symDeg: 180）
  // =========================================================================
  function buildBoneShellCharm(makeCanvas) {
    const m = new VoxelModel(9, 9, 12, SPEC);
    const { mat, partId } = SPEC;

    // 吊绳
    m.paintCapsule(0, 0, 11.2, 0, 0, 2.2, 0.65, 0.60, mat('rope'), partId.rope, true);
    // 横挂白骨片
    m.paintCapsule(-2.8, 0, 7.6, 2.8, 0, 7.6, 1.05, 1.05, mat('bone'), partId.bone, true);
    // 串坠彩贝与小骨珠
    m.paintEllipsoid(0, 0, 5.0, 1.65, 1.35, 1.45, mat('shell'), partId.shell, true);
    m.paintEllipsoid(-2.2, 0, 4.4, 1.1, 1.0, 1.2, mat('bone'), partId.bone, true);
    m.paintEllipsoid( 2.2, 0, 4.4, 1.1, 1.0, 1.2, mat('bone'), partId.bone, true);
    m.paintEllipsoid(0, 0, 1.9, 1.35, 1.25, 1.35, mat('bone'), partId.bone, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 11, centerZ: 6 });
  }

  const Def = {
    id: 'scene_t08_mangrove_stump',
    code: 'T08',
    name: '滩涂支柱根与破船肋木',
    status: 'done',
    defaultHabitat: 'tideflat',
    tag: 'T08 潮汐滩涂 · 红树枯桩与搁浅船肋',
    summary: '根脚浸于浅潮水（submerge: 0.4）的拱形红树支柱根枯木桩，斜靠两根带亮铜钉的苍白破船肋木与褪色赤红破帆布角，枝梢挂鱼人骨贝标记串',
    footRadius: 16.5,
    ecoWeight: 4.0,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',     name: '海风拂帆', loop: true,  status: 'done' },
      { id: 'tide_lap', name: '潮涌拍桩', loop: false, duration: 2.2, status: 'done' }
    ],
    blocks: ['浸水拱形红树支柱根枯木桩', '亮铜钉旧船肋木与撕裂红帆', '枝梢鱼人骨贝串与潮涌溅花'],
    soulHabit: '海风轻吹破帆布角与骨贝串摆动、水面环根轻漪；潮水涌拍木桩时溅起湿泥水花，破帆鼓扬、骨贝串噼啪轻晃',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        rootBase:       buildRootBase(makeCanvas),
        stumpTrunk:     buildStumpTrunk(makeCanvas),
        shipRib:        buildShipRib(makeCanvas),
        tornSail:       buildTornSail(makeCanvas),
        boneShellCharm: buildBoneShellCharm(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        time: 0,
        flex: 1.0,
        gFreq: 1.0,
        surgeImpulse: 0,
        stumpShakeX: 0,
        rippleClock: 1.3,
        lastAction: 'idle',
        lapWave: 0
      };

      let curSkin = SKINS[0];

      function spawnTideSplash(vfx, sMul, power) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU + (Math.random() - 0.5) * 0.35;
          const r = (6.0 + Math.random() * 6.5) * sMul;
          const sp = (6.5 + Math.random() * 9.5) * power * sMul;
          const isMud = i % 3 === 0;
          vfx.spawnParticle(
            state.x + Math.cos(a) * r,
            state.y + Math.sin(a) * r,
            (1.6 + Math.random() * 1.4) * sMul,
            Math.cos(a) * sp,
            Math.sin(a) * sp,
            (9.0 + Math.random() * 9.5) * power * sMul,
            0.55 + Math.random() * 0.35,
            isMud ? 1.55 : (1.35 + Math.random() * 0.45),
            isMud ? fx.mudBit : (i % 2 === 0 ? fx.splashA : fx.splashB),
            false,
            46
          );
        }
        vfx.addRipple(state.x, state.y, 7.5 * sMul, 22.0 * sMul, 0.95, 2.2);
        vfx.addRipple(state.x, state.y, 4.5 * sMul, 15.5 * sMul, 0.72, 1.5);
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
          state.surgeImpulse = 0;
          state.stumpShakeX = 0;
          state.rippleClock = 1.1;
          state.lastAction = 'idle';
          state.lapWave = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          state.time = time;
          state.flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          state.gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);

          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.lapWave = 0;
          }

          state.stumpShakeX = 0;
          state.surgeImpulse = 0;

          if (action === 'tide_lap') {
            // 0.16s 主潮涌拍桩、0.78s 次浪回拍，木桩轻颤、破帆与骨贝串剧烈晃动
            if (state.lapWave === 0 && actionTime >= 0.16) {
              state.lapWave = 1;
              spawnTideSplash(vfx, sMul, 1.25);
            } else if (state.lapWave === 1 && actionTime >= 0.78) {
              state.lapWave = 2;
              spawnTideSplash(vfx, sMul, 0.85);
            }
            const u = clamp(actionTime / 2.2, 0, 1);
            const env = Math.sin(clamp(u / 0.14, 0, 1) * Math.PI * 0.5) * (1 - smoothstep(0.45, 0.98, u));
            state.surgeImpulse = env;
            state.stumpShakeX = Math.sin(actionTime * 28) * 0.35 * env * sMul;
          } else {
            // 常态：水面环根轻漪
            state.rippleClock -= dt;
            if (state.rippleClock <= 0) {
              state.rippleClock = 1.85 + Math.random() * 0.95;
              if (vfx) vfx.addRipple(state.x, state.y, 9.0 * sMul, 18.0 * sMul, 1.35, 1.25);
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.time;
          const flex = state.flex;
          const gFreq = state.gFreq;
          const surge = state.surgeImpulse;
          const list = [];

          // 1. 拱形红树支柱根脚（根脚明确 submerge: 0.4 浸在浅潮水中）
          list.push({
            partKey: 'rootBase',
            asset: parts.rootBase,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            submerge: 0.4,
            bias: -0.45
          });

          // 2. 枯木主桩与斜枝
          const [tx, ty] = localToWorldXY(state.x, state.y, yw, -2.0 * sMul, -1.0 * sMul);
          list.push({
            partKey: 'stumpTrunk',
            asset: parts.stumpTrunk,
            x: tx + state.stumpShakeX,
            y: ty,
            lift: 9.8 * sMul,
            ro: yw,
            bias: 0.10
          });

          // 3. 两根半露泥面的弧形搁浅船肋骨（复用 shipRib，高对比浅褐旧木 + 亮铜钉）
          const [r1x, r1y] = localToWorldXY(state.x, state.y, yw, 5.8 * sMul, 5.4 * sMul);
          list.push({
            partKey: 'shipRib',
            asset: parts.shipRib,
            x: r1x + state.stumpShakeX * 0.6,
            y: r1y,
            lift: 0,
            ro: wrapAngle(yw - 0.45),
            submerge: 0.35,
            bias: 0.40
          });

          const [r2x, r2y] = localToWorldXY(state.x, state.y, yw, 9.6 * sMul, -1.6 * sMul);
          list.push({
            partKey: 'shipRib',
            asset: parts.shipRib,
            x: r2x + state.stumpShakeX * 0.5,
            y: r2y,
            lift: 0,
            ro: wrapAngle(yw - 0.78),
            submerge: 0.38,
            bias: 0.30
          });

          // 4. 挂在船肋与枯木间的褪色赤红破帆布角（海风轻拂 / 潮涌鼓摆）
          const sailWave = Math.sin(t * 2.6 * gFreq) * (0.45 + surge * 0.95) * flex;
          const [sx, sy] = localToWorldXY(state.x, state.y, yw, (8.6 + sailWave) * sMul, (2.4 + sailWave * 0.4) * sMul);
          list.push({
            partKey: 'tornSail',
            asset: parts.tornSail,
            x: sx,
            y: sy,
            lift: (13.2 + Math.cos(t * 2.2 * gFreq) * 0.35) * sMul,
            ro: wrapAngle(yw - 0.60 + Math.sin(t * 2.8 * gFreq) * (0.14 + surge * 0.24) * flex),
            bias: 0.95
          });

          // 5. 枯木梢悬挂的鱼人骨贝标记串（风摆 + 潮涌噼啪晃动）
          const clackFreq = surge > 0.05 ? 11.5 : 2.4;
          const clackAmp = (0.36 + surge * 1.15) * flex;
          const charmSway = Math.sin(t * clackFreq * gFreq) * clackAmp;
          const [cx, cy] = localToWorldXY(state.x, state.y, yw, (4.4 + charmSway) * sMul, (1.6 + charmSway * 0.35) * sMul);
          list.push({
            partKey: 'boneShellCharm',
            asset: parts.boneShellCharm,
            x: cx,
            y: cy,
            lift: 18.2 * sMul,
            ro: wrapAngle(yw + Math.sin(t * clackFreq * gFreq) * (0.16 + surge * 0.42) * flex),
            bias: 1.25,
            symDeg: 180
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
