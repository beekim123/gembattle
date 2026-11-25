'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, hash2i, fbm1 } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 天6 · 装成一团云的（M20 垂吊同类 · 照 tree1_hanging_sac.js 改写）
  //
  // 【设计摘要】
  // 1. 俯视高对比外观（默认 ×4 缩放不与高空云海融糊）：
  //    - 高空漂浮的蓬松云团伞体（cloudDome + 4 团环绕微晃副云瓣 cloudPuff）：
  //      外层洁白蓬松，但云瓣缝隙与内腹（cloudSkirt）带醒目浅紫与珊瑚粉暗纹，
  //      与蓝白高空云海地台拉开明显色相与明暗对比；
  //    - 伞底用 core/renderer.js 的 kind: 'line' 垂下 11 根清晰细丝（内外两圈），
  //      每根丝挂着亮青色反色小水珠小件（dewBead，4×4×4 四重对称共享资产）；
  // 2. 状态机（patrol / idle / retract）：
  //    - drift（高空慢漂诱捕）：云团在 maxRadius * 0.80 内轻柔漂浮，11 根黏丝随气流轻摆；
  //    - tense（触丝蓄势）：黏丝预颤绷紧，伞体微沉；
  //    - retract（齐收甩珠）：11 根黏丝同时急速往上一收并高频微颤，甩开一圈亮青水珠粒子；
  //    - digest（收拢停顿）：云团微晃消化；
  //    - release（缓放垂丝）：11 根黏丝重新垂放回原长。
  // 3. 资产与预算：4 个共享部件，27 色 0 重色 0 自亮，3 套零重建模换色皮肤，0 禁用字。
  // =========================================================================

  // 27 色独立色表（<= 48 色、0 重色、0 自亮）
  const SPEC = createPaletteSpec({
    pal: {
      // 外层洁白蓬松云冠
      cloudDark:   '#b6c4db',
      cloudMid:    '#e4ecf7',
      cloudHi:     '#ffffff',
      // 云瓣边缘冷蓝灰暗面（勾勒蓬松体积，防止与浅色云海混在一起）
      rimDark:     '#7082a6',
      rimMid:      '#96a9cc',
      rimHi:       '#c5d4eb',
      // 内腹与云缝醒目浅紫暗纹
      violetDark:  '#573475',
      violetMid:   '#8b58b0',
      violetHi:    '#c491e6',
      // 内腹珊瑚粉捕食腔与脉纹
      coralDark:   '#8f2948',
      coralMid:    '#d94c70',
      coralHi:     '#ff8aa6',
      // 伞底垂丝腺口深梅红环
      glandDark:   '#4d172e',
      glandMid:    '#822649',
      glandHi:     '#bd4871',
      // 云冠顶部细微粉紫孢子绒点
      velvetDark:  '#78456c',
      velvetMid:   '#b06fa0',
      velvetHi:    '#e0a8d2',
      // 亮青色反色小水珠（强对比核心标志小件）
      dewDark:     '#0c7f99',
      dewMid:      '#1fd4eb',
      dewHi:       '#a6f9ff',
      // 水珠高对比亮斑与内芯
      beadCore:    '#084e66',
      beadEdge:    '#5eeeff',
      beadTip:     '#e0feff',
      // 伞体边缘藏匿的暗紫感知点（不进 glowKeys）
      poreDark:    '#2a1638',
      poreMid:     '#5e2c7a',
      poreHi:      '#a65cc9'
    },
    glowKeys: [],
    parts: [
      'cloud', 'rim', 'violet', 'coral', 'gland',
      'velvet', 'dew', 'bead', 'pore'
    ],
    noCrease: [
      ['cloud', 'rim'],
      ['cloud', 'velvet'],
      ['violet', 'coral'],
      ['coral', 'gland'],
      ['violet', 'pore'],
      ['dew', 'bead']
    ],
    materials: {
      cloud:  ['cloudDark',  'cloudMid',  'cloudHi'],
      rim:    ['rimDark',    'rimMid',    'rimHi'],
      violet: ['violetDark', 'violetMid', 'violetHi'],
      coral:  ['coralDark',  'coralMid',  'coralHi'],
      gland:  ['glandDark',  'glandMid',  'glandHi'],
      velvet: ['velvetDark', 'velvetMid', 'velvetHi'],
      dew:    ['dewDark',    'dewMid',    'dewHi'],
      bead:   ['beadCore',   'beadEdge',  'beadTip'],
      pore:   ['poreDark',   'poreMid',   'poreHi']
    },
    protectedParts: ['coral', 'dew', 'bead']
  });

  // 3 套零重建模换色皮肤（粉腹白云 / 暮霞紫云 / 绯心晴云）
  const SKINS = [
    {
      id: 'coral_cloud',
      name: '粉腹白云（高空经典）',
      dot: '#d94c70',
      outline: '#1d152b',
      pal: {},
      line: {
        main: '#24d9ed',
        mainOutline: '#1c2640',
        inner: '#eb6c8f'
      },
      fx: {
        dewA: '#1fd4eb',
        dewB: '#a6f9ff',
        mist: '#f2f7ff',
        coral: '#ff8aa6'
      }
    },
    {
      id: 'berry_dusk',
      name: '暮霞紫云（莓腹款）',
      dot: '#8c3ec4',
      outline: '#1a1126',
      pal: {
        cloudDark:  '#d4bdd1', cloudMid:  '#f2e4f0', cloudHi:  '#fff7fc',
        rimDark:    '#82668c', rimMid:    '#ad8fb8', rimHi:    '#d8c1e0',
        violetDark: '#471d70', violetMid: '#7c3ab5', violetHi: '#b978ed',
        coralDark:  '#9c2450', coralMid:  '#e0437c', coralHi:  '#ff85b3',
        glandDark:  '#42122c', glandMid:  '#75214e', glandHi:  '#b54380',
        velvetDark: '#7d3b6a', velvetMid: '#ba639f', velvetHi: '#ed9fd5',
        dewDark:    '#0f8556', dewMid:    '#29d98f', dewHi:    '#adffdb',
        beadCore:   '#095437', beadEdge:  '#66f2b5', beadTip:  '#e3fff2',
        poreDark:   '#261036', poreMid:   '#592478', poreHi:   '#9e54c4'
      },
      line: {
        main: '#29d98f',
        mainOutline: '#142e24',
        inner: '#e06395'
      },
      fx: {
        dewA: '#29d98f',
        dewB: '#adffdb',
        mist: '#faeef7',
        coral: '#ff85b3'
      }
    },
    {
      id: 'amber_mist',
      name: '绯心晴云（金珠款）',
      dot: '#eb6434',
      outline: '#241512',
      pal: {
        cloudDark:  '#bfd1cc', cloudMid:  '#e5f0ed', cloudHi:  '#f9fffd',
        rimDark:    '#6c8a85', rimMid:    '#92b3ad', rimHi:    '#c0d9d4',
        violetDark: '#73294d', violetMid: '#b54578', violetHi: '#eb81b0',
        coralDark:  '#9e3416', coralMid:  '#eb6434', coralHi:  '#ffa473',
        glandDark:  '#571d10', glandMid:  '#8f321c', glandHi:  '#c95838',
        velvetDark: '#874838', velvetMid: '#c2715b', velvetHi: '#f0a892',
        dewDark:    '#a66c08', dewMid:    '#f5be27', dewHi:    '#fff09c',
        beadCore:   '#6b4305', beadEdge:  '#ffd95e', beadTip:  '#fffbe0',
        poreDark:   '#36141e', poreMid:   '#6e273d', poreHi:   '#b34d6c'
      },
      line: {
        main: '#f5be27',
        mainOutline: '#382509',
        inner: '#eb6434'
      },
      fx: {
        dewA: '#f5be27',
        dewB: '#fff09c',
        mist: '#f0faf7',
        coral: '#ffa473'
      }
    }
  ];

  // 11 根垂丝锚点布局（外圈 7 根 + 内圈 4 根，长度错落便于俯视清晰辨认每根丝与水珠）
  const SILK_LAYOUT = [
    { ring: 1, x:  7.8, y:  0.0, len: 21.5, phase: 0.0, beadU: [0.56, 0.96] },
    { ring: 1, x:  4.9, y:  6.1, len: 23.0, phase: 0.9, beadU: [0.62, 0.97] },
    { ring: 1, x: -1.7, y:  7.6, len: 20.5, phase: 1.8, beadU: [0.52, 0.96] },
    { ring: 1, x: -7.0, y:  3.4, len: 22.4, phase: 2.7, beadU: [0.58, 0.97] },
    { ring: 1, x: -7.0, y: -3.4, len: 20.8, phase: 3.6, beadU: [0.50, 0.96] },
    { ring: 1, x: -1.7, y: -7.6, len: 22.8, phase: 4.5, beadU: [0.60, 0.97] },
    { ring: 1, x:  4.9, y: -6.1, len: 21.2, phase: 5.4, beadU: [0.54, 0.96] },
    { ring: 0, x:  3.4, y:  2.2, len: 24.5, phase: 0.5, beadU: [0.46, 0.96] },
    { ring: 0, x: -2.2, y:  3.4, len: 23.6, phase: 2.1, beadU: [0.48, 0.96] },
    { ring: 0, x: -3.4, y: -2.2, len: 24.8, phase: 3.7, beadU: [0.44, 0.96] },
    { ring: 0, x:  2.2, y: -3.4, len: 23.8, phase: 5.2, beadU: [0.50, 0.96] }
  ];

  // =========================================================================
  // 1. 蓬松云团主伞冠（cloudDome：26×26×14，四重对称省图集）
  //    外层洁白蓬松云瓣，底部边缘与云瓣凹缝露出醒目浅紫与珊瑚粉暗纹
  // =========================================================================
  function buildCloudDome(makeCanvas) {
    const m = new VoxelModel(26, 26, 14, SPEC);
    const { mat, partId } = SPEC;

    const lobes = [
      [ 0.0,  0.0, 7.2, 8.6, 8.6, 5.2],
      [ 6.8,  0.0, 5.4, 5.4, 5.4, 4.0],
      [-6.8,  0.0, 5.4, 5.4, 5.4, 4.0],
      [ 0.0,  6.8, 5.4, 5.4, 5.4, 4.0],
      [ 0.0, -6.8, 5.4, 5.4, 5.4, 4.0],
      [ 4.8,  4.8, 5.0, 4.4, 4.4, 3.6],
      [-4.8,  4.8, 5.0, 4.4, 4.4, 3.6],
      [ 4.8, -4.8, 5.0, 4.4, 4.4, 3.6],
      [-4.8, -4.8, 5.0, 4.4, 4.4, 3.6]
    ];

    m.fillAABB(-12.5, 12.5, -12.5, 12.5, 1, 13, (x, y, z, X, Y) => {
      let bestD = 99;
      for (let i = 0; i < lobes.length; i++) {
        const [lx, ly, lz, rx, ry, rz] = lobes[i];
        const d = (Math.hypot((X - lx) / rx, (Y - ly) / ry, (z - lz) / rz) - 1.0) * Math.min(rx, ry, rz);
        if (d < bestD) bestD = d;
      }
      if (bestD > 0.12) return;

      const rad = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const seamWave = Math.cos(ang * 4);

      // 底层 z=1..3：醒目浅紫/珊瑚粉内腹边纹（俯视 0.6 倾角下形成清晰高对比底缘）
      if (z <= 3) {
        if (rad < 7.2) {
          m.setRaw(x, y, z, mat('coral'), partId.coral);
        } else {
          m.setRaw(x, y, z, mat('violet'), partId.violet);
        }
        return;
      }

      // 云瓣交界凹缝（z=4..8）：透出浅紫与珊瑚粉暗纹，让云团一眼看出是活体捕食伞
      if (z <= 8 && rad > 5.0 && rad < 9.5 && seamWave < -0.45) {
        m.setRaw(x, y, z, z <= 5 ? mat('coral') : mat('violet'), z <= 5 ? partId.coral : partId.violet);
        return;
      }

      // 顶部中央点缀一圈细微粉紫孢子绒脉（打破纯白平涂，增强俯视辨识度）
      if (z >= 10 && rad > 3.2 && rad < 6.4 && Math.abs(seamWave) > 0.72) {
        m.setRaw(x, y, z, mat('velvet'), partId.velvet);
        return;
      }

      // 外圈下沿带冷蓝灰云脊暗面，顶面保持洁白蓬松
      if (z <= 5 && rad > 9.2) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else {
        m.setRaw(x, y, z, mat('cloud'), partId.cloud);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 11.5, headZ: 13, centerZ: 7 });
  }

  // =========================================================================
  // 2. 伞底浅紫/珊瑚粉暗纹腹腔与垂丝腺裙（cloudSkirt：20×20×8，四重对称）
  // =========================================================================
  function buildCloudSkirt(makeCanvas) {
    const m = new VoxelModel(20, 20, 8, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-9.5, 9.5, -9.5, 9.5, 0, 7, (x, y, z, X, Y) => {
      const t = z / 7;
      const rad = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const frill = Math.cos(ang * 8) * 0.65;
      const rOuter = lerp(8.4, 6.8, t) + frill * (1 - t * 0.5);
      const rInner = z <= 2 ? 3.2 : 0;
      if (rad > rOuter || rad < rInner) return;

      if (rad < 4.8 && z <= 4) {
        m.setRaw(x, y, z, mat('gland'), partId.gland);
      } else if (frill > 0.25 && rad > 5.8) {
        m.setRaw(x, y, z, mat('coral'), partId.coral);
      } else if (rad > rOuter - 1.5 && z <= 2) {
        m.setRaw(x, y, z, mat('pore'), partId.pore);
      } else {
        m.setRaw(x, y, z, mat('violet'), partId.violet);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.8, headZ: 7, centerZ: 3 });
  }

  // =========================================================================
  // 3. 环绕副云瓣（cloudPuff：10×10×8，四重对称共享资产）
  // =========================================================================
  function buildCloudPuff(makeCanvas) {
    const m = new VoxelModel(10, 10, 8, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-4.5, 4.5, -4.5, 4.5, 0, 7, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 4.2, Y / 4.2, (z - 3.6) / 3.4);
      if (d > 1.0) return;
      if (z <= 1) {
        m.setRaw(x, y, z, mat('violet'), partId.violet);
      } else if (z === 2 && Math.hypot(X, Y) > 2.6) {
        m.setRaw(x, y, z, mat('rim'), partId.rim);
      } else {
        m.setRaw(x, y, z, mat('cloud'), partId.cloud);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 7, centerZ: 3 });
  }

  // =========================================================================
  // 4. 亮青色反色小水珠小件（dewBead：4×4×4，四重对称极轻小件）
  // =========================================================================
  function buildDewBead(makeCanvas) {
    const m = new VoxelModel(4, 4, 4, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.paintEllipsoid(0, 0, 1.7, 1.35, 1.35, 1.55, mat('dew'), partId.dew, true);
    m.setRaw(1, 1, 3, keyToId.beadTip, partId.bead);
    m.setRaw(2, 2, 3, keyToId.beadEdge, partId.bead);
    m.setRaw(1, 2, 0, keyToId.beadCore, partId.bead);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 1.4, headZ: 3, centerZ: 1.5 });
  }

  // =========================================================================
  // Def 注册对象
  // =========================================================================
  const Sky6CloudSnareDef = {
    id: 'sky6_cloud_snare',
    code: '天6',
    name: '装成一团云的',
    status: 'done',
    tag: 'M20 垂吊同类 · 假云伞体 + 11 根挂珠黏丝齐收',
    summary: '高空漂浮的蓬松白云伞体，外层洁白、内腹带醒目浅紫与珊瑚粉暗纹防跟云海融糊；底下垂下 11 根像素对齐深度排序细丝，每根挂着亮青色反色小水珠；周期性所有黏丝同时急速往上一收并甩开水珠粒子',
    defaultHabitat: 'sky',
    footRadius: 12.5,
    ecoWeight: 1.1,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol',  name: '高空漂浮伏击', loop: true, status: 'done' },
      { id: 'idle',    name: '云海悬停待机', loop: true, status: 'done' },
      { id: 'retract', name: '黏丝齐收甩珠', loop: true, status: 'done' }
    ],
    blocks: [
      '洁白蓬松云团与浅紫珊瑚粉高对比内腹',
      '4 团错相浮晃副云瓣',
      '11 根像素对齐深度排序垂吊黏丝',
      '亮青色反色小水珠共享小件',
      '全丝齐收高频微颤与甩珠粒子爆发'
    ],
    soulHabit: '混在高空云海里缓缓漂浮，外层看着是一小朵蓬松白云，内腹却藏着浅紫与珊瑚粉暗纹，底下垂着十一根挂满亮青小水珠的细丝；一旦觉察底下来了动静，所有黏丝同时急速往上一收、把满丝水珠刷地甩开',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        cloudDome:  buildCloudDome(makeCanvas),
        cloudSkirt: buildCloudSkirt(makeCanvas),
        cloudPuff:  buildCloudPuff(makeCanvas),
        dewBead:    buildDewBead(makeCanvas)
      };

      const liftRecoil = new SpringDamper1D(0, 48, 5.0);
      const swayX = new SpringDamper1D(0, 14, 2.4);
      const swayY = new SpringDamper1D(0, 14, 2.4);

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.25;
      const seed0 = opts.seed ?? 66;

      const state = {
        x: hx0,
        y: hy0,
        z: 27.5,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        shadowScale: 0.56,
        // 状态机：'drift' | 'tense' | 'retract' | 'digest' | 'release'
        stage: 'drift',
        stageTimer: 2.0,
        stageDur: 4.8,
        seq: 1,
        retractFactor: 0, // 0=完全垂放, 1=急速收紧
        lineSag: 1.4,
        lineJitter: 0.04,
        jitterPhase: 0,
        navX: hx0 + 16,
        navY: hy0 - 12,
        cloudLift: 27.5,
        prevAction: 'patrol',
        flungBeads: false,
        simTime: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function clampInSafeDisc(x, y, maxR) {
        const lim = maxR * 0.80;
        const d = Math.hypot(x, y);
        if (d > lim && d > 1e-4) {
          return [x * lim / d, y * lim / d];
        }
        return [x, y];
      }

      function pickNavTarget(maxR) {
        state.seq++;
        const r1 = hash2i(state.seq, seed0, 131);
        const r2 = hash2i(state.seq, seed0, 263);
        const ang = Math.atan2(state.y, state.x) + (r1 > 0.5 ? 1 : -1) * lerp(1.1, 2.4, r2);
        const rad = lerp(maxR * 0.22, maxR * 0.72, hash2i(state.seq, seed0, 389));
        state.navX = Math.cos(ang) * rad;
        state.navY = Math.sin(ang) * rad;
      }

      function flingDewParticles(vfx, sMul) {
        if (!vfx || typeof vfx.spawnParticle !== 'function') return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let i = 0; i < SILK_LAYOUT.length; i++) {
          const s = SILK_LAYOUT[i];
          const [ax, ay] = localToWorldXY(state.x, state.y, state.yaw, s.x * sMul, s.y * sMul);
          const outAng = Math.atan2(ay - state.y, ax - state.x) + (hash2i(state.seq + i, seed0, 521) - 0.5) * 0.7;
          const spd = (10.5 + hash2i(state.seq + i, seed0, 619) * 11.0) * sMul;
          const wz = Math.max(4.0 * sMul, state.cloudLift - s.len * 0.48 * sMul);
          vfx.spawnParticle(
            ax, ay, wz,
            Math.cos(outAng) * spd,
            Math.sin(outAng) * spd,
            (4.5 + hash2i(state.seq + i, seed0, 733) * 6.5) * sMul,
            0.52 + hash2i(state.seq + i, seed0, 829) * 0.28,
            1.45,
            i % 2 === 0 ? fx.dewA : fx.dewB,
            false,
            26
          );
          if (i % 3 === 0) {
            vfx.spawnParticle(
              ax, ay, state.cloudLift - 2.0 * sMul,
              Math.cos(outAng) * spd * 0.55,
              Math.sin(outAng) * spd * 0.55,
              (2.0 + hash2i(state.seq + i, seed0, 907) * 3.0) * sMul,
              0.46,
              1.25,
              fx.coral,
              false,
              14
            );
          }
        }
      }

      function enterStage(next, isRetractDemo, vfx, sMul) {
        state.stage = next;
        state.stageTimer = 0;
        state.seq++;
        const r = hash2i(state.seq, seed0, 173);
        if (next === 'drift') {
          state.stageDur = isRetractDemo ? lerp(1.4, 1.8, r) : lerp(4.2, 6.0, r);
          state.flungBeads = false;
        } else if (next === 'tense') {
          state.stageDur = 0.34;
          liftRecoil.impulse(-4.5);
        } else if (next === 'retract') {
          state.stageDur = 0.46;
          state.flungBeads = false;
          liftRecoil.impulse(12.5);
          swayX.impulse((state.seq % 2 === 0 ? 1 : -1) * 0.45);
          swayY.impulse((state.seq % 3 === 0 ? 1 : -1) * 0.32);
        } else if (next === 'digest') {
          state.stageDur = isRetractDemo ? 0.55 : 0.90;
        } else if (next === 'release') {
          state.stageDur = 1.05;
          liftRecoil.impulse(-3.2);
        }
        if (next === 'retract' && !state.flungBeads) {
          state.flungBeads = true;
          flingDewParticles(vfx, sMul);
        }
      }

      const instance = {
        def: Sky6CloudSnareDef,
        cachePrefix: `sky6_cs_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts: [],
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          const sMul = instance.scaleMul || 1.0;
          state.x = homeX;
          state.y = homeY;
          state.z = 27.5 * sMul;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.stage = 'drift';
          state.stageTimer = 2.4;
          state.stageDur = 4.6;
          state.seq = 1;
          state.retractFactor = 0;
          state.lineSag = 1.4 * sMul;
          state.lineJitter = 0.04;
          state.jitterPhase = 0;
          state.cloudLift = 27.5 * sMul;
          state.prevAction = 'patrol';
          state.flungBeads = false;
          state.simTime = 0;

          liftRecoil.x = 0; liftRecoil.v = 0;
          swayX.x = 0.08; swayX.v = 0;
          swayY.x = -0.06; swayY.v = 0;

          pickNavTarget(44);
          instance.footContacts = [{ x: homeX, y: homeY, z: 0, r: 9.5 * sMul }];
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const maxR = (eco && eco.maxRadius) || 44;
          const homeX = (eco && eco.homeX) ?? hx0;
          const homeY = (eco && eco.homeY) ?? hy0;
          const homeYaw = (eco && eco.homeYaw) ?? hyaw0;
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const isIdle = action === 'idle';
          const isRetractDemo = action === 'retract';

          state.simTime = time;

          if (action !== state.prevAction) {
            state.prevAction = action;
            if (action === 'retract') {
              enterStage('tense', true, vfx, sMul);
            } else if (action === 'idle') {
              state.stage = 'drift';
              state.stageTimer = 0;
              state.stageDur = 5.0;
            }
          }

          // 1. 高空云团水平缓慢漂浮（严格钳制在 maxRadius * 0.80 内）
          if (isIdle) {
            state.x = lerp(state.x, homeX, expSmooth(dt, 2.8));
            state.y = lerp(state.y, homeY, expSmooth(dt, 2.8));
            state.yaw = wrapAngle(state.yaw + wrapAngle(homeYaw - state.yaw) * expSmooth(dt, 2.4));
            state.vx = 0;
            state.vy = 0;
          } else {
            const tx = state.navX + ((eco && eco.avoidX) || 0) * 0.28;
            const ty = state.navY + ((eco && eco.avoidY) || 0) * 0.28;
            const dx = tx - state.x;
            const dy = ty - state.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 7.0 * sMul) pickNavTarget(maxR);

            const desiredYaw = Math.atan2(-dx, dy);
            const yawDiff = wrapAngle(desiredYaw - state.yaw);
            state.yaw = wrapAngle(state.yaw + clamp(yawDiff, -0.75 * dt, 0.75 * dt));

            const driftSpd = (state.stage === 'retract' || state.stage === 'tense' ? 2.2 : 6.4) * spdMul * sMul;
            const nxDir = dist > 1e-3 ? dx / dist : 0;
            const nyDir = dist > 1e-3 ? dy / dist : 0;
            const kVel = expSmooth(dt, 2.6);
            state.vx = lerp(state.vx, nxDir * driftSpd, kVel);
            state.vy = lerp(state.vy, nyDir * driftSpd, kVel);

            let nx = state.x + state.vx * dt;
            let ny = state.y + state.vy * dt;
            if (Math.hypot(nx, ny) > maxR * 0.80) {
              [nx, ny] = clampInSafeDisc(nx, ny, maxR);
              pickNavTarget(maxR);
            }
            state.x = nx;
            state.y = ny;
          }

          // 2. 伞体垂直浮沉 + 回弹弹簧
          liftRecoil.update(dt, 0, 48 * sp, clamp(5.0 * dScale, 2.5, 9.0));
          const bob = Math.sin(time * 1.45 * gFreq) * 1.35 + Math.cos(time * 0.82 * gFreq) * 0.55;
          state.cloudLift = clamp((27.5 + bob + liftRecoil.x * 0.24) * sMul, 20.0 * sMul, 35.0 * sMul);
          state.z = state.cloudLift;

          // 3. 气流摆角弹簧
          const gustX = (Math.sin(time * 1.15 * gFreq) * 0.22 + (fbm1(time * 0.42, seed0) - 0.5) * 0.24) * flex;
          const gustY = (Math.cos(time * 0.96 * gFreq + 0.8) * 0.18 + (fbm1(time * 0.37, seed0 + 41) - 0.5) * 0.20) * flex;
          swayX.update(dt, gustX - clamp(state.vx * 0.035, -0.28, 0.28), 14 * sp, clamp(2.4 * dScale, 1.4, 5.5));
          swayY.update(dt, gustY - clamp(state.vy * 0.035, -0.28, 0.28), 14 * sp, clamp(2.4 * dScale, 1.4, 5.5));

          // 4. 黏丝齐收状态机
          state.stageTimer += dt * spdMul;
          const u = clamp(state.stageTimer / Math.max(0.01, state.stageDur), 0, 1);

          let targetRetract = 0;
          let targetSag = 1.45 * sMul;
          let targetJitter = 0.04;

          if (state.stage === 'drift') {
            targetRetract = 0;
            targetSag = (1.35 + Math.hypot(swayX.x, swayY.x) * 2.0) * sMul;
            targetJitter = 0.035;
            if (!isIdle && state.stageTimer >= state.stageDur) {
              enterStage('tense', isRetractDemo, vfx, sMul);
            }
          } else if (state.stage === 'tense') {
            targetRetract = lerp(0, 0.14, smoothstep(0, 1, u));
            targetSag = lerp(1.3, 0.2, u) * sMul;
            targetJitter = lerp(0.08, 0.32, u);
            if (state.stageTimer >= state.stageDur) {
              enterStage('retract', isRetractDemo, vfx, sMul);
            }
          } else if (state.stage === 'retract') {
            // 急速齐收：0.46s 内将所有 11 根黏丝同步猛抽至 76% 收缩态，带高频绷直抖动
            targetRetract = lerp(0.14, 0.78, smoothstep(0, 0.72, u));
            targetSag = 0.0;
            targetJitter = 0.30 + Math.sin(u * Math.PI) * 0.34;
            if (state.stageTimer >= state.stageDur) {
              enterStage('digest', isRetractDemo, vfx, sMul);
            }
          } else if (state.stage === 'digest') {
            targetRetract = 0.76 + Math.sin(u * Math.PI * 2) * 0.04;
            targetSag = 0.2 * sMul;
            targetJitter = 0.09;
            if (state.stageTimer >= state.stageDur) {
              enterStage('release', isRetractDemo, vfx, sMul);
            }
          } else if (state.stage === 'release') {
            targetRetract = lerp(0.76, 0.0, smoothstep(0, 1, u));
            targetSag = lerp(0.2, 1.45, smoothstep(0, 1, u)) * sMul;
            targetJitter = lerp(0.12, 0.04, u);
            if (state.stageTimer >= state.stageDur) {
              enterStage('drift', isRetractDemo, vfx, sMul);
            }
          }

          const kRet = expSmooth(dt, state.stage === 'retract' ? 24.0 : 11.0);
          state.retractFactor = lerp(state.retractFactor, targetRetract, kRet);
          state.lineSag = lerp(state.lineSag, targetSag, expSmooth(dt, 14.0));
          state.lineJitter = lerp(state.lineJitter, targetJitter, expSmooth(dt, 14.0));
          const jitFreq = state.stage === 'retract' ? 54.0 : (state.stage === 'tense' ? 38.0 : 12.0);
          state.jitterPhase = (state.jitterPhase + dt * jitFreq) % (TAU * 16);

          sockets.setWorld('canopyTop', state.x, state.y, state.cloudLift + 13.0 * sMul, state.yaw);
          instance.footContacts = [{ x: state.x, y: state.y, z: Math.max(2.0 * sMul, state.cloudLift * 0.22), r: 10.0 * sMul }];
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.simTime;
          const isWater = !!(habitat && habitat.isWater);
          const waterLevel = habitat ? (habitat.waterLevel ?? -99) : -99;
          const calcSub = (z) => EnvFeedback.calcSubmerge(z, waterLevel, 5.0, isWater);
          const lineCol = (curSkin && curSkin.line) || SKINS[0].line;

          // 1. 11 根像素对齐深度排序黏丝（kind: 'line'）+ 每根丝上的亮青色反色小水珠
          for (let i = 0; i < SILK_LAYOUT.length; i++) {
            const s = SILK_LAYOUT[i];
            const [ax, ay] = localToWorldXY(state.x, state.y, yw, s.x * sMul, s.y * sMul);
            const az = state.cloudLift + (s.ring === 0 ? 1.2 : 1.8) * sMul;

            const curLen = s.len * lerp(1.0, 0.24, state.retractFactor) * sMul;
            const localWindX = (swayX.x * 8.5 + Math.sin(t * 1.8 + s.phase) * 1.4) * (1 - state.retractFactor * 0.72) * sMul;
            const localWindY = (swayY.x * 8.5 + Math.cos(t * 1.5 + s.phase * 1.3) * 1.4) * (1 - state.retractFactor * 0.72) * sMul;

            const bx = ax + localWindX;
            const by = ay + localWindY;
            const bz = Math.max(1.2 * sMul, az - curLen);

            list.push({
              kind: 'line',
              partKey: `silk_${i}`,
              x0: ax,
              y0: ay,
              z0: az,
              x1: bx,
              y1: by,
              z1: bz,
              sag: state.lineSag * (s.ring === 1 ? 1.0 : 0.78),
              jitter: state.lineJitter,
              jitterPhase: state.jitterPhase + s.phase,
              segments: 9,
              color: s.ring === 1 ? lineCol.main : lineCol.inner,
              outlineColor: lineCol.mainOutline,
              widthArtPx: 1,
              opacity: 0.94,
              bias: -0.20 + s.ring * 0.05
            });

            // 挂在丝上的亮青色反色小水珠小件（收缩过半时隐去中段珠保留尾珠，防堆叠糊团）
            for (let bi = 0; bi < s.beadU.length; bi++) {
              const bu = s.beadU[bi];
              if (bi === 0 && state.retractFactor > 0.55) continue;
              const dx = lerp(ax, bx, bu);
              const dy = lerp(ay, by, bu);
              const dz = lerp(az, bz, bu) - 4 * bu * (1 - bu) * state.lineSag * 0.75 - 1.0 * sMul;
              list.push({
                partKey: 'dewBead',
                asset: parts.dewBead,
                x: dx,
                y: dy,
                lift: Math.max(0.8 * sMul, dz),
                ro: yw,
                opacity: 0.95,
                submerge: calcSub(dz),
                bias: 0.05,
                symDeg: 90
              });
            }
          }

          // 2. 伞底浅紫/珊瑚粉暗纹内腹裙环（高对比防与云海融成一片）
          list.push({
            partKey: 'cloudSkirt',
            asset: parts.cloudSkirt,
            x: state.x,
            y: state.y,
            lift: state.cloudLift - 1.4 * sMul,
            ro: wrapAngle(yw + 0.18),
            submerge: calcSub(state.cloudLift - 1.4 * sMul),
            bias: 0.35,
            symDeg: 90
          });

          // 3. 蓬松白云主伞冠
          list.push({
            partKey: 'cloudDome',
            asset: parts.cloudDome,
            x: state.x,
            y: state.y,
            lift: state.cloudLift + 2.2 * sMul,
            ro: yw,
            submerge: calcSub(state.cloudLift + 2.2 * sMul),
            bias: 0.85,
            symDeg: 90
          });

          // 4. 4 团环绕主冠边缘错相浮晃的蓬松副云瓣（纯位移呼吸，严禁 scale）
          for (let k = 0; k < 4; k++) {
            const baseA = k * (TAU / 4) + 0.78;
            const breatheR = (10.4 + Math.sin(t * 1.9 + k * 1.57) * 0.65 - state.retractFactor * 0.9) * sMul;
            const [px, py] = localToWorldXY(state.x, state.y, yw, Math.cos(baseA) * breatheR, Math.sin(baseA) * breatheR);
            const pz = state.cloudLift + (3.2 + Math.cos(t * 2.1 + k * 1.57) * 0.75) * sMul;
            list.push({
              partKey: 'cloudPuff',
              asset: parts.cloudPuff,
              x: px,
              y: py,
              lift: pz,
              ro: wrapAngle(yw + baseA),
              submerge: calcSub(pz),
              bias: 0.65,
              symDeg: 90
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sky6CloudSnareDef.id,
            code: Sky6CloudSnareDef.code,
            name: Sky6CloudSnareDef.name,
            status: Sky6CloudSnareDef.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            stage: state.stage,
            silkCount: SILK_LAYOUT.length,
            footRadius: Sky6CloudSnareDef.footRadius,
            headZ: 40,
            centerZ: 24,
            blocks: Sky6CloudSnareDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sky6CloudSnareDef);
})(window.PixelWorkshop);
