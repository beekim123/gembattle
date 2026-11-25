'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SocketTracker } = PW.Solvers;

  // =========================================================================
  // M35 同类 · 海7 · 一层层浮上去当筏子的（浅海环礁）
  // -------------------------------------------------------------------------
  // 7 块圆扁厚片叠在礁底（仅 3 套八重对称 symDeg: 45 礁片资产 + 1 套小鱼伴游件）：
  //   - 礁石暖灰底盘配外缘放大醒目的亮珊瑚橙 + 嫩绿一圈短触须，跟青碧礁水强对比；
  //   - 涨潮时从上往下一张张浮到水面摊开成几张浮筏（层深浅不同，submerge 染水色层次清晰，
  //     水面偶有环礁小鱼躲在筏边游），退潮再一张张沉回礁底叠好。
  // =========================================================================
  const M35_SEA7_CONFIG = {
    slabCount: 7,
    slabHeight: 4,              // 圆扁厚片层高（4 层体素）
    slabStepZ: 3.4,             // 礁底叠放层间步距
    biasStep: 3.2,              // 叠放期严格递增深度偏置，360° 零穿插
    riseOrder: 'topDown',       // 涨潮浮起顺序：最顶片（6）先浮出，到底片（0）最后浮起
    sinkOrder: 'bottomUp',      // 退潮沉底顺序：底片（0）先落礁底，顶片（6）最后叠回

    stackedDuration: [2.4, 3.4],// 退潮礁底叠放停留时长（秒）
    riseDuration: 1.55,         // 涨潮逐片浮到水面摊开时长（秒）
    raftDuration: [3.6, 4.8],   // 水面摊成浮筏滤食时长（秒）
    sinkDuration: 1.45,         // 退潮逐片沉回礁底叠好时长（秒）
    compactStacked: 1.15,       // raft 演示态礁底停留时长（秒）
    compactRaft: 3.8,           // raft 演示态水面摊筏时长（秒）

    targetRadiusRatio: 0.56,    // 礁底锚点安全半径（给周边摊开的浮筏留足空间）
    partRadiusRatio: 0.79,      // 每张浮筏与小鱼硬钳制半径上限（严格 < 0.80）
    minHopDist: 12.5,           // 退潮换礁位最小位移（格）

    surfaceLift: 12.2,          // 浮到水面的高度基准（与礁底 0~20 形成清晰层次）
    raftSpreadRadius: 15.5,     // 摊成浮筏的环状散布半径（格）
    swayAmp: 0.85               // 礁底水流轻晃幅度（格）
  };

  // 7 块厚片的层级与水面摊筏排布（0 为最底层中心筏，1~6 绕中心摊成六角环筏）
  const LAYER_DEFS = [
    { idx: 0, assetKey: 'raftBase', baseYaw:  0.00, raftAng: 0.00,           raftRad: 0.00, baseSub: 0.96 },
    { idx: 1, assetKey: 'raftBase', baseYaw:  0.34, raftAng: 0.15,           raftRad: 0.98, baseSub: 0.84 },
    { idx: 2, assetKey: 'raftMid',  baseYaw: -0.26, raftAng: 0.15 + TAU / 6, raftRad: 1.02, baseSub: 0.72 },
    { idx: 3, assetKey: 'raftMid',  baseYaw:  0.48, raftAng: 0.15 + TAU / 3, raftRad: 0.94, baseSub: 0.60 },
    { idx: 4, assetKey: 'raftMid',  baseYaw: -0.38, raftAng: 0.15 + TAU / 2, raftRad: 1.04, baseSub: 0.48 },
    { idx: 5, assetKey: 'raftTop',  baseYaw:  0.24, raftAng: 0.15 + TAU * 2 / 3, raftRad: 0.96, baseSub: 0.36 },
    { idx: 6, assetKey: 'raftTop',  baseYaw: -0.44, raftAng: 0.15 + TAU * 5 / 6, raftRad: 0.92, baseSub: 0.22 }
  ];

  // 3 条躲在浮筏边游弋的环礁小鱼配置
  const FISH_DEFS = [
    { raftIdx: 1, phase: 0.0,  dir:  1, orbitR: 10.2, speed: 1.35 },
    { raftIdx: 3, phase: 2.1,  dir: -1, orbitR:  9.4, speed: 1.55 },
    { raftIdx: 5, phase: 4.3,  dir:  1, orbitR:  8.8, speed: 1.25 }
  ];

  // =========================================================================
  // 1. 色表（24 色 <= 48 色、0 重色、高对比分色：暖礁石灰 + 亮珊瑚橙触须 + 嫩绿绒环）
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 暖灰礁石圆盘主体（3 档，跟青碧礁水冷暖分离）
      reefDark:   '#4d453b',
      reefMid:    '#786c5c',
      reefHi:     '#a89882',
      // 礁盘顶面石灰壳脊（3 档）
      shellDark:  '#8f816d',
      shellMid:   '#bfb097',
      shellHi:    '#e6dac3',
      // 叠缝底倒角（3 档）
      seamDark:   '#292520',
      seamMid:    '#3d3730',
      seamHi:     '#574f45',
      // 放大醒目的外圈亮珊瑚橙短触须（3 档，强对比青碧水）
      coralDark:  '#c23b19',
      coralMid:   '#ff6830',
      coralHi:    '#ffad66',
      // 内侧一圈嫩绿滤食绒须（3 档，提亮 ×4 俯视层次）
      frondDark:  '#398a28',
      frondMid:   '#6ed43b',
      frondHi:    '#c2f772',
      // 中心滤食凹口暖赭斑（3 档）
      poreDark:   '#6b442d',
      poreMid:    '#9c6543',
      poreHi:     '#cc8c5e',
      // 躲在筏边的环礁小鱼体色（亮金黄，水面清晰可见）
      fishDark:   '#cc7e14',
      fishMid:    '#ffbe29',
      fishHi:     '#fff4a3',
      // 小鱼尾鳍与条纹（亮白青）
      finDark:    '#8ab8c2',
      finMid:     '#c7ebf2',
      finHi:      '#f2fdff'
    },
    glowKeys: ['coralHi', 'frondHi'],
    parts: ['reef', 'shell', 'seam', 'coral', 'frond', 'pore', 'fish', 'fin'],
    noCrease: [
      ['reef', 'shell'],
      ['reef', 'pore'],
      ['reef', 'frond'],
      ['frond', 'coral'],
      ['shell', 'frond'],
      ['fish', 'fin']
    ],
    materials: {
      reef:  ['reefDark',  'reefMid',  'reefHi'],
      shell: ['shellDark', 'shellMid', 'shellHi'],
      seam:  ['seamDark',  'seamMid',  'seamHi'],
      coral: ['coralDark', 'coralMid', 'coralHi'],
      frond: ['frondDark', 'frondMid', 'frondHi'],
      pore:  ['poreDark',  'poreMid',  'poreHi'],
      fish:  ['fishDark',  'fishMid',  'fishHi'],
      fin:   ['finDark',   'finMid',   'finHi']
    },
    protectedParts: ['coral', 'frond', 'fish']
  });

  // 3 套零重建模换色皮肤（每套 24 色 0 重色，0 禁用字）
  const SKINS = [
    {
      id: 'coral_lime_raft',
      name: '珊瑚橙嫩绿筏',
      dot: '#ff6830',
      outline: '#0d1b21',
      pal: {},
      fx: {
        planktonA: '#ffad66',
        planktonB: '#c2f772',
        bubble:    '#d9fafc'
      }
    },
    {
      id: 'amber_kelp_raft',
      name: '金橙海藻礁筏',
      dot: '#ffaa1d',
      outline: '#121814',
      pal: {
        reefDark:  '#424538', reefMid:  '#696e59', reefHi:  '#94997e',
        shellDark: '#7a7e65', shellMid: '#a8ad8c', shellHi: '#d4d9b6',
        seamDark:  '#24261f', seamMid:  '#36382e', seamHi:  '#4d5042',
        coralDark: '#bd6d0d', coralMid: '#ffaa1d', coralHi: '#ffe073',
        frondDark: '#1c8c78', frondMid: '#36ccae', frondHi: '#8cf7df',
        poreDark:  '#5c4a2a', poreMid:  '#8a7040', poreHi:  '#bd9b5b',
        fishDark:  '#c44123', fishMid:  '#ff6e42', fishHi:  '#ffc09e',
        finDark:   '#9eb8ab', finMid:   '#d4ebe0', finHi:   '#f5fff9'
      },
      fx: {
        planktonA: '#ffe073',
        planktonB: '#8cf7df',
        bubble:    '#e6fff9'
      }
    },
    {
      id: 'rose_sprout_raft',
      name: '赤贝春绿浮筏',
      dot: '#ff5c8a',
      outline: '#171019',
      pal: {
        reefDark:  '#54454a', reefMid:  '#826c74', reefHi:  '#b59aa3',
        shellDark: '#998289', shellMid: '#c9b0b8', shellHi: '#f0dce3',
        seamDark:  '#2e2428', seamMid:  '#45363c', seamHi:  '#614c54',
        coralDark: '#bd2655', coralMid: '#ff5c8a', coralHi: '#ffabbe',
        frondDark: '#479424', frondMid: '#84de40', frondHi: '#d0fa87',
        poreDark:  '#6e3a4b', poreMid:  '#a35a72', poreHi:  '#d4839d',
        fishDark:  '#cc9c16', fishMid:  '#ffd633', fishHi:  '#fff7ab',
        finDark:   '#94b3bf', finMid:   '#cce6f0', finHi:   '#f2fbff'
      },
      fx: {
        planktonA: '#ffabbe',
        planktonB: '#d0fa87',
        bubble:    '#f2fbff'
      }
    }
  ];

  // =========================================================================
  // 2. 三套八重对称礁筏厚片 + 一套环礁小鱼伴游件
  //    - raftBase (34x34x4, 盘径 11.4 + 触须外伸至 15.2)
  //    - raftMid  (30x30x4, 盘径 10.0 + 触须外伸至 13.6)
  //    - raftTop  (26x26x4, 盘径  8.4 + 触须外伸至 11.6)
  //    每片边缘雕出 16 根（八重对称：主须 8 根亮珊瑚橙 + 间须 8 根嫩绿）短触须！
  // =========================================================================
  function buildRaftSlab(makeCanvas, opts) {
    const { boxSize, coreR, tentacleLen } = opts;
    const W = boxSize, D = boxSize, H = M35_SEA7_CONFIG.slabHeight;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const maxR = coreR + tentacleLen;

    m.fillAABB(-maxR - 1, maxR + 1, -maxR - 1, maxR + 1, 0, H - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);

      // 八重对称角距（每 45° 一根粗亮珊瑚橙主触须，半角 22.5° 处一根嫩绿副触须）
      const mainWave = Math.cos(ang * 8);   // +1 在 0°,45°,...；-1 在 22.5°,67.5°,...
      const isMainTip = mainWave > 0.52;
      const isSubTip = mainWave < -0.52;

      // 1) 外缘一圈放大短触须（z = 1, 2 伸出，粗壮醒目，×4 俯视清晰不碎）
      if (r > coreR - 0.8) {
        if (z === 0 || z === H - 1) return;
        const reach = isMainTip
          ? coreR + tentacleLen * (0.72 + 0.28 * mainWave)
          : (isSubTip ? coreR + tentacleLen * (0.64 + 0.26 * (-mainWave)) : 0);
        if (reach > 0 && r <= reach) {
          if (isMainTip) {
            m.setRaw(x, y, z, mat('coral'), partId.coral);
          } else {
            m.setRaw(x, y, z, mat('frond'), partId.frond);
          }
        }
        return;
      }

      // 2) 圆扁厚片本体
      const zInset = (z === 0) ? 1.15 : ((z === H - 1) ? 0.65 : 0.0);
      const bodyLim = coreR - zInset + Math.cos(ang * 8) * 0.35;
      if (r > bodyLim) return;

      if (z === 0) {
        m.setRaw(x, y, z, mat('seam'), partId.seam);
        return;
      }

      const edgeDist = bodyLim - r;

      // 顶面最外一圈：嫩绿 + 珊瑚橙交替环带（与外伸短触须衔接成耀眼花环）
      if (z === H - 1 && edgeDist <= 1.85) {
        if (mainWave >= 0) {
          m.setRaw(x, y, z, mat('coral'), partId.coral);
        } else {
          m.setRaw(x, y, z, mat('frond'), partId.frond);
        }
        return;
      }

      // 顶面石灰壳环脊
      if (z === H - 1 && edgeDist > 1.85 && edgeDist <= 3.35) {
        m.setRaw(x, y, z, mat('shell'), partId.shell);
        return;
      }

      // 中心暖赭滤食凹口
      if (z === H - 1 && r <= 2.6) {
        m.setRaw(x, y, z, mat('pore'), partId.pore);
        return;
      }

      // 主体礁石圆盘
      if (z === H - 1 && Math.cos(ang * 8) > 0.35 && r > 3.2) {
        m.setRaw(x, y, z, mat('shell'), partId.shell);
      } else {
        m.setRaw(x, y, z, mat('reef'), partId.reef);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, {
      footRadius: maxR,
      headZ: H,
      centerZ: Math.round(H * 0.5)
    });
  }

  function buildReefFish(makeCanvas) {
    const m = new VoxelModel(10, 8, 4, SPEC);
    const { mat, partId } = SPEC;
    // 朝 +Y 方向游的小环礁鱼（金黄鱼身 + 白青尾鳍与背条）
    m.fillAABB(-3, 3, -4.5, 4.5, 0, 3, (x, y, z, X, Y) => {
      if (Y >= -1.5 && Y <= 3.5) {
        const halfW = 1.65 * Math.sin(clamp((Y + 1.5) / 5.0, 0, 1) * Math.PI);
        const halfH = 1.25 * Math.sin(clamp((Y + 1.5) / 5.0, 0, 1) * Math.PI);
        if (Math.abs(X) <= halfW && Math.abs(z - 1.5) <= halfH) {
          const isStripe = (Math.abs(Y - 0.5) < 0.7);
          m.setRaw(x, y, z, mat(isStripe ? 'fin' : 'fish'), partId[isStripe ? 'fin' : 'fish']);
        }
      } else if (Y < -1.5 && Y >= -4.2) {
        const tailSpread = lerp(0.5, 1.9, clamp((-1.5 - Y) / 2.7, 0, 1));
        if (Math.abs(X) <= tailSpread && z >= 1 && z <= 2) {
          m.setRaw(x, y, z, mat('fin'), partId.fin);
        }
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5, headZ: 4, centerZ: 2 });
  }

  // =========================================================================
  // 3. 生物定义：海7 · 一层层浮上去当筏子的
  // =========================================================================
  const Sea7RaftStackDef = {
    id: 'sea7_raft_stack',
    code: '海7',
    name: '一层层浮上去当筏子的',
    status: 'done',
    tag: 'M35 层叠拆拼 · 潮汐浮筏',
    summary: '7 块圆扁礁石厚片叠在礁底（仅 3 套八重对称礁盘资产 + 1 套伴游环礁小鱼）：片缘雕出亮珊瑚橙与嫩绿短触须，涨潮时从上往下一张张浮到水面摊成浮筏滤食并吸引小鱼躲在筏边游，退潮再一张张沉回礁底叠好，深浅水色分层清晰',
    defaultHabitat: 'reef',
    footRadius: 16.0,
    ecoWeight: 1.3,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    m35Config: M35_SEA7_CONFIG,
    blocks: [
      '7块圆扁礁片复用3套八重对称(symDeg 45)资产',
      '片缘亮珊瑚橙+嫩绿双圈短触须强对比青碧礁水',
      '按水深分档 submerge 染水色清晰呈现叠层深浅',
      '涨潮自上而下浮出水面摊成六角浮筏群并伴游环礁小鱼',
      '退潮自下而上逐张沉回礁底叠好'
    ],
    soulHabit: '退潮时七块圆扁厚片一层层叠着趴在礁底，越往底层水色越深；涨潮时最顶片率先浮出水面，接着下面各片一张张浮起并向四周摊开成一簇浮筏，挥动外缘的亮珊瑚橙与嫩绿短触须滤食浮游小东西，环礁小鱼则躲在筏边自在游弋；退潮前再一张张沉回礁底叠好',
    actions: [
      { id: 'patrol', name: '潮汐浮沉（换礁摊筏）', loop: true, status: 'done' },
      { id: 'idle',   name: '礁底叠放（水流微晃）', loop: true, status: 'done' },
      { id: 'raft',   name: '原地摊筏与小鱼伴游',   loop: true, status: 'done' }
    ],
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        raftBase: buildRaftSlab(makeCanvas, { boxSize: 34, coreR: 11.4, tentacleLen: 3.8 }),
        raftMid:  buildRaftSlab(makeCanvas, { boxSize: 30, coreR: 10.0, tentacleLen: 3.5 }),
        raftTop:  buildRaftSlab(makeCanvas, { boxSize: 26, coreR:  8.5, tentacleLen: 3.1 }),
        reefFish: buildReefFish(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.3;
      const seed0 = opts.seed ?? 137;

      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      const slabs = LAYER_DEFS.map((ld) => ({
        idx: ld.idx,
        assetKey: ld.assetKey,
        baseYaw: ld.baseYaw,
        raftAng: ld.raftAng,
        raftRad: ld.raftRad,
        baseSub: ld.baseSub,
        visible: true,
        x: hx0,
        y: hy0,
        lift: ld.idx * M35_SEA7_CONFIG.slabStepZ,
        ro: wrapAngle(hyaw0 + ld.baseYaw),
        submerge: ld.baseSub,
        bias: ld.idx * M35_SEA7_CONFIG.biasStep
      }));

      const fishes = FISH_DEFS.map((fd) => ({
        raftIdx: fd.raftIdx,
        phase: fd.phase,
        dir: fd.dir,
        orbitR: fd.orbitR,
        speed: fd.speed,
        visible: false,
        x: hx0,
        y: hy0,
        lift: 9.0,
        ro: 0,
        submerge: 0.28,
        bias: 1.5
      }));

      const state = {
        x: hx0,
        y: hy0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        shadowScale: 1.0,

        // 状态机：'stacked' -> 'rise' -> 'raft' -> 'sink' -> 'stacked'
        phase: 'stacked',
        phaseT: 0,
        phaseDur: 2.6,
        seq: 1,
        prevAction: 'patrol',

        originX: hx0,
        originY: hy0,
        targetX: hx0,
        targetY: hy0,
        targetYaw: hyaw0,

        surfacedMask: 0,
        sunkMask: 0,
        fxCd: 0
      };

      function clampInDisc(x, y, hx, hy, safeR) {
        const dx = x - hx;
        const dy = y - hy;
        const d = Math.hypot(dx, dy);
        if (d > safeR && d > 1e-4) {
          return [hx + (dx * safeR) / d, hy + (dy * safeR) / d];
        }
        return [x, y];
      }

      function pickNextReefSpot(hx, hy, maxR, sMul, stayInPlace) {
        state.originX = state.x;
        state.originY = state.y;
        if (stayInPlace) {
          state.targetX = hx;
          state.targetY = hy;
          state.targetYaw = state.yaw;
          return;
        }
        const safeR = Math.max(7, maxR * M35_SEA7_CONFIG.targetRadiusRatio);
        const minDist = Math.min(M35_SEA7_CONFIG.minHopDist * sMul, safeR * 1.15);
        let bestX = hx, bestY = hy;

        for (let attempt = 0; attempt < 6; attempt++) {
          state.seq++;
          const rAng = hash2i(state.seq, seed0, 173 + attempt * 17);
          const rRad = hash2i(state.seq, seed0, 311 + attempt * 23);
          const curAng = Math.atan2(state.y - hy, state.x - hx);
          const ang = curAng + lerp(1.5, 4.7, rAng);
          const rad = lerp(safeR * 0.25, safeR * 0.95, rRad);
          const [cx, cy] = clampInDisc(hx + Math.cos(ang) * rad, hy + Math.sin(ang) * rad, hx, hy, safeR);
          bestX = cx;
          bestY = cy;
          if (Math.hypot(bestX - state.x, bestY - state.y) >= minDist) break;
        }

        state.targetX = bestX;
        state.targetY = bestY;
        state.targetYaw = wrapAngle(state.yaw + lerp(-0.7, 0.7, hash2i(state.seq, seed0, 443)));
      }

      function spawnWaterBubbles(vfx, x, y, z, count, spreadR, sMul, fxCol) {
        if (!vfx) return;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * TAU;
          const r = Math.random() * spreadR * sMul;
          vfx.spawnParticle(
            x + Math.cos(a) * r,
            y + Math.sin(a) * r,
            Math.max(1.0, z),
            Math.cos(a) * 2.5 * sMul,
            Math.sin(a) * 2.5 * sMul,
            (4.0 + Math.random() * 4.5) * sMul,
            0.55 + Math.random() * 0.35,
            1.1 + Math.random() * 0.4,
            (i % 3 === 0) ? fxCol.bubble : ((i % 2 === 0) ? fxCol.planktonA : fxCol.planktonB),
            false,
            -2.0
          );
        }
      }

      function enterStacked(isCompact) {
        state.phase = 'stacked';
        state.phaseT = 0;
        state.seq++;
        if (isCompact) {
          state.phaseDur = M35_SEA7_CONFIG.compactStacked;
        } else {
          const [dMin, dMax] = M35_SEA7_CONFIG.stackedDuration;
          state.phaseDur = lerp(dMin, dMax, hash2i(state.seq, seed0, 521));
        }
      }

      function enterRise(hx, hy, maxR, sMul, stayInPlace) {
        state.phase = 'rise';
        state.phaseT = 0;
        state.phaseDur = M35_SEA7_CONFIG.riseDuration;
        state.surfacedMask = 0;
        pickNextReefSpot(hx, hy, maxR, sMul, stayInPlace);
      }

      function enterRaft(isCompact) {
        state.phase = 'raft';
        state.phaseT = 0;
        state.seq++;
        if (isCompact) {
          state.phaseDur = M35_SEA7_CONFIG.compactRaft;
        } else {
          const [dMin, dMax] = M35_SEA7_CONFIG.raftDuration;
          state.phaseDur = lerp(dMin, dMax, hash2i(state.seq, seed0, 641));
        }
      }

      function enterSink() {
        state.phase = 'sink';
        state.phaseT = 0;
        state.phaseDur = M35_SEA7_CONFIG.sinkDuration;
        state.sunkMask = 0;
      }

      function raftSlotPos(i, centerX, centerY, yaw, spreadR, hx, hy, partSafeR) {
        const sl = slabs[i];
        if (sl.raftRad <= 0.01) {
          return clampInDisc(centerX, centerY, hx, hy, partSafeR);
        }
        const a = yaw + sl.raftAng;
        const r = spreadR * sl.raftRad;
        return clampInDisc(centerX + Math.cos(a) * r, centerY + Math.sin(a) * r, hx, hy, partSafeR);
      }

      const instance = {
        def: Sea7RaftStackDef,
        cachePrefix: `sea7_raft_stack_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.shadowScale = 1.0;
          state.phase = 'stacked';
          state.phaseT = 0;
          state.phaseDur = 2.4;
          state.seq = 1;
          state.originX = homeX;
          state.originY = homeY;
          state.targetX = homeX;
          state.targetY = homeY;
          state.targetYaw = homeYaw;
          state.surfacedMask = 0;
          state.sunkMask = 0;
          state.fxCd = 0;

          for (let i = 0; i < slabs.length; i++) {
            const sl = slabs[i];
            sl.visible = true;
            sl.x = homeX;
            sl.y = homeY;
            sl.lift = i * M35_SEA7_CONFIG.slabStepZ;
            sl.ro = wrapAngle(homeYaw + sl.baseYaw);
            sl.submerge = sl.baseSub;
            sl.bias = i * M35_SEA7_CONFIG.biasStep;
          }
          for (const f of fishes) {
            f.visible = false;
            f.x = homeX;
            f.y = homeY;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.4, 2.0);
          const hx = (eco && eco.homeX) ?? 0;
          const hy = (eco && eco.homeY) ?? 0;
          const maxR = (eco && eco.maxRadius) || 46;
          const partSafeR = Math.max(8, maxR * M35_SEA7_CONFIG.partRadiusRatio);
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const isIdle = (action === 'idle');
          const isRaftDemo = (action === 'raft');
          const fxCol = curSkin.fx || SKINS[0].fx;

          if (action !== state.prevAction) {
            state.prevAction = action;
            if (isIdle) {
              state.phase = 'stacked';
              state.phaseT = 0;
              state.phaseDur = 999;
            } else if (isRaftDemo) {
              enterRise(hx, hy, maxR, sMul, true);
            } else if (state.phase === 'stacked' && state.phaseDur > 10) {
              enterStacked(false);
            }
          }

          // 1. 潮汐状态机推进
          const stepDt = dt * (state.phase === 'stacked' ? 1.0 : spdMul);
          state.phaseT += stepDt;

          if (!isIdle && state.phaseT >= state.phaseDur) {
            if (state.phase === 'stacked') {
              enterRise(hx, hy, maxR, sMul, isRaftDemo);
            } else if (state.phase === 'rise') {
              enterRaft(isRaftDemo);
            } else if (state.phase === 'raft') {
              enterSink();
            } else if (state.phase === 'sink') {
              state.x = state.targetX;
              state.y = state.targetY;
              state.yaw = state.targetYaw;
              enterStacked(isRaftDemo);
            }
          }

          // 2. 7 块厚片与 3 条环礁小鱼运动解算
          const N = M35_SEA7_CONFIG.slabCount;
          const stepZ = M35_SEA7_CONFIG.slabStepZ * sMul;
          const surfZ = M35_SEA7_CONFIG.surfaceLift * sMul;
          const spreadR = Math.min(M35_SEA7_CONFIG.raftSpreadRadius * sMul, partSafeR * 0.56);
          const p = clamp(state.phaseT / Math.max(0.01, state.phaseDur), 0, 1);

          footContacts.length = 0;
          let fishActivity = 0;

          if (state.phase === 'stacked') {
            if (isIdle) {
              const kHome = expSmooth(dt, 3.0);
              state.x = lerp(state.x, hx, kHome);
              state.y = lerp(state.y, hy, kHome);
            }
            const [cx, cy] = clampInDisc(state.x, state.y, hx, hy, partSafeR);
            state.x = cx;
            state.y = cy;
            state.shadowScale = 1.0;

            const sway = M35_SEA7_CONFIG.swayAmp * flex * sMul;
            let prevLift = -1;

            for (let i = 0; i < N; i++) {
              const sl = slabs[i];
              const ph = time * 1.65 * gFreq - i * 0.65;
              const ox = Math.sin(ph) * sway * (0.35 + i * 0.11);
              const oy = Math.cos(ph * 0.8 + i) * sway * 0.7 * (0.35 + i * 0.11);
              const rawLift = i * stepZ + (0.5 + 0.5 * Math.sin(ph)) * 0.25 * sMul;
              const safeLift = (i === 0) ? Math.max(0, rawLift) : Math.max(rawLift, prevLift + 0.55 * sMul);
              const [sx, sy] = clampInDisc(state.x + ox, state.y + oy, hx, hy, partSafeR);

              sl.visible = true;
              sl.x = sx;
              sl.y = sy;
              sl.lift = safeLift;
              sl.ro = wrapAngle(state.yaw + sl.baseYaw + Math.sin(ph * 0.55) * 0.04 * flex);
              sl.submerge = sl.baseSub; // 礁底按层深浅染水色，最底层最深，最顶层较浅
              sl.bias = i * M35_SEA7_CONFIG.biasStep;
              prevLift = safeLift;
            }
            footContacts.push({ x: state.x, y: state.y, z: 0, r: 15.0 * sMul });

          } else if (state.phase === 'rise') {
            // 涨潮：自上而下（i = 6 -> 0）一张张浮到水面并向四周摊成浮筏
            const stagger = 0.095;
            const perSpan = Math.max(0.32, 1.0 - (N - 1) * stagger);
            const raftCenterX = lerp(state.originX, state.targetX, 0.5 * smoothstep(0, 1, p));
            const raftCenterY = lerp(state.originY, state.targetY, 0.5 * smoothstep(0, 1, p));
            let prevLift = -1;

            for (let i = 0; i < N; i++) {
              const sl = slabs[i];
              const orderIdx = N - 1 - i; // 顶片最先浮出
              const u = clamp((p - orderIdx * stagger) / perSpan, 0, 1);
              const e = smoothstep(0, 1, u);

              const [dstX, dstY] = raftSlotPos(i, raftCenterX, raftCenterY, state.yaw, spreadR, hx, hy, partSafeR);
              const [sx, sy] = clampInDisc(lerp(state.originX, dstX, e), lerp(state.originY, dstY, e), hx, hy, partSafeR);

              // 刚浮出水面时荡开涟漪与气泡
              const bit = 1 << i;
              if (u >= 0.65 && !(state.surfacedMask & bit)) {
                state.surfacedMask |= bit;
                if (vfx) {
                  vfx.addRipple(sx, sy, 3.5 * sMul, 15.0 * sMul, 0.62, 1.5);
                  spawnWaterBubbles(vfx, sx, sy, surfZ, 2, 6.0, sMul, fxCol);
                }
              }

              const startZ = i * stepZ;
              // 浮到水面后按层留微弱高度差（0.35 格阶梯），摊开不重叠也零穿插
              const endZ = surfZ + i * 0.32 * sMul + Math.sin(time * 2.2 + i * 1.1) * 0.45 * sMul;
              const rawLift = lerp(startZ, endZ, e);
              const safeLift = (u < 0.25 && prevLift >= 0) ? Math.max(rawLift, prevLift + 0.5 * sMul) : rawLift;

              sl.visible = true;
              sl.x = sx;
              sl.y = sy;
              sl.lift = safeLift;
              sl.ro = wrapAngle(state.yaw + sl.baseYaw + e * 0.65 * (i % 2 === 0 ? 1 : -1));
              // 随上浮深度变浅，submerge 平滑淡至水面浅浸（0.02~0.14）
              sl.submerge = lerp(sl.baseSub, (i === 0 ? 0.14 : 0.04), e);
              sl.bias = lerp(i * M35_SEA7_CONFIG.biasStep, 1.2 + i * 0.35, e);
              prevLift = safeLift;
            }
            state.shadowScale = lerp(1.0, 0.55, p);
            fishActivity = smoothstep(0.45, 1.0, p);

          } else if (state.phase === 'raft') {
            // 水面摊筏滤食：7 张筏随轻波缓缓浮动旋转，小鱼躲在筏边游弋
            const e = smoothstep(0, 1, p);
            const raftCenterX = lerp(state.originX, state.targetX, lerp(0.5, 1.0, e));
            const raftCenterY = lerp(state.originY, state.targetY, lerp(0.5, 1.0, e));
            const driftYaw = lerp(state.yaw, state.targetYaw, e);
            state.x = raftCenterX;
            state.y = raftCenterY;
            state.shadowScale = 0.52;
            fishActivity = 1.0;

            for (let i = 0; i < N; i++) {
              const sl = slabs[i];
              const [baseX, baseY] = raftSlotPos(i, raftCenterX, raftCenterY, driftYaw + time * 0.12 * gFreq, spreadR, hx, hy, partSafeR);
              const bobX = Math.sin(time * 1.45 * gFreq + i * 1.3) * 1.1 * sMul;
              const bobY = Math.cos(time * 1.25 * gFreq + i * 1.7) * 1.1 * sMul;
              const [sx, sy] = clampInDisc(baseX + bobX, baseY + bobY, hx, hy, partSafeR);

              sl.visible = true;
              sl.x = sx;
              sl.y = sy;
              sl.lift = surfZ + i * 0.32 * sMul + Math.sin(time * 2.4 * gFreq + i * 1.1) * 0.55 * sMul;
              sl.ro = wrapAngle(driftYaw + sl.baseYaw + time * 0.32 * (i % 2 === 0 ? 1 : -1) * gFreq);
              // 中心筏略微吃水深一点，外圈筏轻浮水面，水色层次清晰
              sl.submerge = (i === 0) ? 0.14 : ((i % 2 === 0) ? 0.04 : 0.09);
              sl.bias = 1.2 + i * 0.35;
            }

            // 滤食浮游微粒与水面轻涟漪
            state.fxCd -= dt;
            if (vfx && state.fxCd <= 0) {
              state.fxCd = 0.42;
              const pick = Math.floor((time * 4.3) % N);
              const sl = slabs[pick];
              vfx.addRipple(sl.x, sl.y, 6.0 * sMul, 15.5 * sMul, 0.72, 1.1);
              spawnWaterBubbles(vfx, sl.x, sl.y, sl.lift + 1.0 * sMul, 2, 8.5, sMul, fxCol);
            }

          } else if (state.phase === 'sink') {
            // 退潮：自下而上（i = 0 -> 6）一张张向新礁位聚拢并沉回礁底叠好，严格零穿插
            const stagger = 0.095;
            const perSpan = Math.max(0.32, 1.0 - (N - 1) * stagger);
            let prevLift = -1;

            for (let i = 0; i < N; i++) {
              const sl = slabs[i];
              const u = clamp((p - i * stagger) / perSpan, 0, 1); // 底片 0 最先沉回礁底
              const e = smoothstep(0, 1, u);

              const [srcX, srcY] = raftSlotPos(i, state.targetX, state.targetY, state.targetYaw + time * 0.08, spreadR, hx, hy, partSafeR);
              const [sx, sy] = clampInDisc(lerp(srcX, state.targetX, e), lerp(srcY, state.targetY, e), hx, hy, partSafeR);

              const bit = 1 << i;
              if (u >= 0.18 && !(state.sunkMask & bit)) {
                state.sunkMask |= bit;
                if (vfx) {
                  vfx.addRipple(sx, sy, 4.0 * sMul, 14.0 * sMul, 0.55, 1.2);
                  spawnWaterBubbles(vfx, sx, sy, surfZ - 1.5 * sMul, 2, 5.5, sMul, fxCol);
                }
              }

              const startZ = surfZ + i * 0.32 * sMul;
              const endZ = i * stepZ;
              const rawLift = lerp(startZ, endZ, e);
              const safeLift = (e > 0.65 && prevLift >= 0) ? Math.max(rawLift, prevLift + 0.55 * sMul) : rawLift;

              sl.visible = true;
              sl.x = sx;
              sl.y = sy;
              sl.lift = safeLift;
              sl.ro = wrapAngle(state.targetYaw + sl.baseYaw + (1 - e) * 0.45 * (i % 2 === 0 ? 1 : -1));
              sl.submerge = lerp((i === 0 ? 0.14 : 0.06), sl.baseSub, e);
              sl.bias = lerp(1.2 + i * 0.35, i * M35_SEA7_CONFIG.biasStep, e);
              prevLift = safeLift;
            }
            state.shadowScale = lerp(0.55, 1.0, p);
            fishActivity = 1.0 - smoothstep(0.0, 0.55, p);
          }

          // 3. 环礁小鱼绕浮筏边缘游弋（涨潮摊筏期显身，退潮沉底期潜隐）
          for (let k = 0; k < fishes.length; k++) {
            const f = fishes[k];
            if (fishActivity <= 0.04) {
              f.visible = false;
              continue;
            }
            const host = slabs[f.raftIdx];
            const ang = f.phase + time * f.speed * f.dir * gFreq;
            const r = f.orbitR * sMul * lerp(0.75, 1.0, fishActivity);
            const [fx, fy] = clampInDisc(host.x + Math.cos(ang) * r, host.y + Math.sin(ang) * r, hx, hy, partSafeR);
            const tangent = ang + (f.dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5);

            f.visible = true;
            f.x = fx;
            f.y = fy;
            f.lift = lerp(surfZ - 3.2 * sMul, surfZ - 0.6 * sMul, fishActivity) + Math.sin(time * 3.8 + k * 2.0) * 0.45 * sMul;
            f.ro = wrapAngle(tangent - Math.PI * 0.5 + Math.sin(time * 9.0 + k) * 0.16);
            f.submerge = lerp(0.82, 0.22, fishActivity);
            f.bias = 2.6;
          }

          // 挂点同步
          const topSl = slabs[N - 1];
          sockets.setWorld('crown', topSl.x, topSl.y, topSl.lift + M35_SEA7_CONFIG.slabHeight * sMul, state.yaw);
        },

        buildPartList() {
          const list = [];
          for (let i = 0; i < slabs.length; i++) {
            const sl = slabs[i];
            if (!sl.visible) continue;
            list.push({
              partKey: sl.assetKey,
              asset: parts[sl.assetKey],
              x: sl.x,
              y: sl.y,
              lift: sl.lift,
              ro: sl.ro,
              submerge: sl.submerge,
              symDeg: 45,
              bias: sl.bias
            });
          }
          for (let k = 0; k < fishes.length; k++) {
            const f = fishes[k];
            if (!f.visible) continue;
            list.push({
              partKey: 'reefFish',
              asset: parts.reefFish,
              x: f.x,
              y: f.y,
              lift: f.lift,
              ro: f.ro,
              submerge: f.submerge,
              bias: f.bias
            });
          }
          return list;
        },

        exportManifest(params) {
          return {
            id: Sea7RaftStackDef.id,
            code: Sea7RaftStackDef.code,
            name: Sea7RaftStackDef.name,
            status: Sea7RaftStackDef.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            phase: state.phase,
            slabCount: M35_SEA7_CONFIG.slabCount,
            slabStepZ: M35_SEA7_CONFIG.slabStepZ,
            biasStep: M35_SEA7_CONFIG.biasStep,
            footRadius: Sea7RaftStackDef.footRadius,
            headZ: Math.round((M35_SEA7_CONFIG.slabCount - 1) * M35_SEA7_CONFIG.slabStepZ + M35_SEA7_CONFIG.slabHeight),
            centerZ: Math.round(((M35_SEA7_CONFIG.slabCount - 1) * M35_SEA7_CONFIG.slabStepZ) * 0.5),
            blocks: Sea7RaftStackDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map((k) => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sea7RaftStackDef);
})(window.PixelWorkshop);
