'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 沙1 · 潜沙红蠕虫（M18 钻地 / 破土拱行标杆，+Y 正前）
  //   1. 外观：中体型粗短鲜红环状体节，首尾对称难分正反，无眼盲口，表皮带湿润肉褶与深环沟；
  //      单怪 20 色、0 重色、零自亮防糊，配套 4 套零重建模换色皮肤；
  //   2. 骨架与防穿模：9 节体节链（ChainSolver），相邻节重叠 ~43.8%，前端/后端复用同一套
  //      对称铲头件；地下节不绘制，破土/钻入处以 3D 沙堆土垄件严密盖住切口，360° 零露缝；
  //   3. 地表痕迹层：潜行时沿路径持续往 core 地表痕迹层写沙垄（mound）+ 扬沙粒子；
  //   4. 状态机：地下潜行（3~8s）→ 弓背拱出一段（1.5~2.5s，露 3~5 节鲜红体节）→ 钻回；
  //      偶发整条跃出沙面抛物线翻滚（0.9~1.3s，落地扬沙）→ 扎回潜行；兼容 patrol / idle / arch / leap。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      bodyDark:   '#8f171b',
      bodyMid:    '#d42c2e',
      bodyHi:     '#f26355',
      ringDark:   '#590c11',
      ringMid:    '#7d141a',
      ringHi:     '#a82428',
      ridgeDark:  '#c74c44',
      ridgeMid:   '#eb8678',
      ridgeHi:    '#fabcb0',
      tipDark:    '#6e1116',
      tipMid:     '#ab2024',
      tipHi:      '#d94a43',
      mouthDark:  '#30070a',
      mouthMid:   '#4d0e14',
      sandDark:   '#875a31',
      sandMid:    '#c99352',
      sandHi:     '#e3b370',
      pebbleDark: '#6b4728',
      pebbleMid:  '#a3713c',
      pebbleHi:   '#f5d69f'
    },
    glowKeys: [],
    parts: ['body', 'ring', 'ridge', 'tip', 'mouth', 'sand', 'pebble'],
    noCrease: [
      ['body', 'ridge'],
      ['body', 'ring'],
      ['tip', 'mouth'],
      ['sand', 'pebble']
    ],
    materials: {
      body:   ['bodyDark',   'bodyMid',   'bodyHi'],
      ring:   ['ringDark',   'ringMid',   'ringHi'],
      ridge:  ['ridgeDark',  'ridgeMid',  'ridgeHi'],
      tip:    ['tipDark',    'tipMid',    'tipHi'],
      sand:   ['sandDark',   'sandMid',   'sandHi'],
      pebble: ['pebbleDark', 'pebbleMid', 'pebbleHi']
    },
    protectedParts: ['mouth', 'ridge']
  });

  const SKINS = [
    {
      id: 'crimson', name: '赤沙经典', dot: '#d42c2e', outline: '#1a0909',
      pal: {}
    },
    {
      id: 'alkali', name: '盐碱苍红', dot: '#c96e72', outline: '#1c1214',
      pal: {
        bodyDark:  '#7d3a3f', bodyMid:  '#bf6369', bodyHi:  '#e69ea0',
        ringDark:  '#4d2128', ringMid:  '#6b3038', ringHi:  '#944b52',
        ridgeDark: '#b37478', ridgeMid: '#dba8a8', ridgeHi: '#f5dedc',
        tipDark:   '#5e2930', tipMid:   '#96484e', tipHi:   '#c4787c',
        mouthDark: '#2b1014', mouthMid: '#451c22',
        sandDark:  '#8f8577', sandMid:  '#cfc6b8', sandHi:  '#ebe5dc',
        pebbleDark:'#6e665c', pebbleMid:'#ada496', pebbleHi:'#f7f3eb'
      }
    },
    {
      id: 'rust', name: '铁锈暗褐', dot: '#943c24', outline: '#140a07',
      pal: {
        bodyDark:  '#521b10', bodyMid:  '#8c341d', bodyHi:  '#bf5a36',
        ringDark:  '#300e08', ringMid:  '#47170d', ringHi:  '#6b2616',
        ridgeDark: '#874229', ridgeMid: '#b86c48', ridgeHi: '#e09e75',
        tipDark:   '#40140b', tipMid:   '#702816', tipHi:   '#9e452a',
        mouthDark: '#1f0805', mouthMid: '#36110a',
        sandDark:  '#6b4426', sandMid:  '#a66f3e', sandHi:  '#cc965e',
        pebbleDark:'#4f301a', pebbleMid:'#85552d', pebbleHi:'#deb07c'
      }
    },
    {
      id: 'ochre', name: '赤陶暖红', dot: '#d65a2b', outline: '#1a0c08',
      pal: {
        bodyDark:  '#8c2b14', bodyMid:  '#d45428', bodyHi:  '#f28c55',
        ringDark:  '#57170a', ringMid:  '#7a2310', ringHi:  '#a63a1c',
        ridgeDark: '#c46a3f', ridgeMid: '#eb9d70', ridgeHi: '#facab0',
        tipDark:   '#6e200e', tipMid:   '#ad3e1c', tipHi:   '#db6b3e',
        mouthDark: '#2e0b05', mouthMid: '#4a150b'
      }
    }
  ];

  // =========================================================================
  // 1. 体素部件建模（全怪仅 5 个轻量资产，多节共享 2 套躯干件 + 1 套对称铲头）
  // =========================================================================

  // 共享主环状体节（粗壮肉环，前后收窄形成深环沟，背脊带湿润反色褶纹）
  function buildRingSegment(makeCanvas, variant = 'main') {
    const isMain = variant === 'main';
    const rx = isMain ? 5.4 : 4.9;
    const ry = isMain ? 5.1 : 4.8;
    const rz = isMain ? 5.0 : 4.6;
    const W = 15, D = 14, H = 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const cz = rz + 0.6;

    m.fillAABB(-rx - 0.8, rx + 0.8, -ry - 0.8, ry + 0.8, 0, Math.ceil(cz + rz + 1.0), (x, y, z, X, Y) => {
      // 环状鼓胀廓线：中间厚实、前后微收出清晰肉褶沟
      const ny = Y / ry;
      const bulge = 1.0 + 0.08 * Math.cos(ny * Math.PI * 1.6);
      const nx = X / (rx * bulge);
      const nz = (z - cz) / (rz * bulge);
      const d2 = nx * nx + ny * ny + nz * nz;
      if (d2 > 1.0) return;

      // 底部微平贴地，减少浮空感
      if (z === 0 && Math.hypot(X, Y) > rx * 0.72) return;

      const absY = Math.abs(Y);
      const isGroove = absY > ry * 0.66 || (!isMain && absY < 0.75);
      // 背脊湿润肉褶：顶部弧面带亮粉湿润细脊
      const isMoistRidge = !isGroove && z >= cz + rz * 0.56 && Math.abs(X) <= rx * 0.48 && absY <= ry * 0.42;
      // 侧腹微环纹
      const isSideCrease = !isGroove && Math.abs(X) > rx * 0.74 && Math.abs(z - cz) < 1.2 && (Math.round(Y + 10) % 2 === 0);

      if (isMoistRidge) {
        m.setRaw(x, y, z, mat('ridge'), partId.ridge);
      } else if (isGroove || isSideCrease) {
        m.setRaw(x, y, z, mat('ring'), partId.ring);
      } else {
        m.setRaw(x, y, z, mat('body'), partId.body);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: rx, headZ: Math.round(cz + rz), centerZ: Math.round(cz) });
  }

  // 对称铲头（前端朝 +Y，后端翻转 180° 复用同一资产，首尾对称难分正反）
  function buildShovelEnd(makeCanvas) {
    const W = 14, D = 16, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const cz = 5.0;

    m.fillAABB(-5.5, 5.5, -5.8, 6.6, 0, 11, (x, y, z, X, Y) => {
      // 从后接环 (-4.8) 到前铲尖 (+6.0) 钝圆收束，前端略扁呈掘沙铲形
      const t = clamp((Y + 4.8) / 10.8, 0, 1);
      const radX = lerp(4.8, 2.2, Math.pow(t, 1.35));
      const radZ = lerp(4.6, 1.75, Math.pow(t, 1.25));
      const zCenter = cz - t * 0.65;
      const nx = X / Math.max(0.9, radX);
      const nz = (z - zCenter) / Math.max(0.8, radZ);
      const ny = Y < -4.8 ? (Y + 4.8) / 1.2 : (Y > 5.2 ? (Y - 5.2) / 1.4 : 0);
      if (nx * nx + nz * nz + ny * ny > 1.0) return;

      // 盲口凹陷（最前端中心一圈暗红褶口，无眼）
      const mouthR = Math.hypot(X, z - (zCenter - 0.1));
      if (Y >= 4.7 && mouthR <= 1.45) {
        m.setRaw(x, y, z, mouthR <= 0.75 ? keyToId.mouthDark : keyToId.mouthMid, partId.mouth);
        return;
      }

      const isCollar = Y < -2.4 && Y > -4.2;
      const isFrontRing = Y > 2.2 && Y < 3.4;
      const isTopWet = !isCollar && !isFrontRing && z >= zCenter + radZ * 0.55 && Math.abs(X) <= radX * 0.45 && Y > -2.0 && Y < 2.2;

      if (isTopWet) {
        m.setRaw(x, y, z, mat('ridge'), partId.ridge);
      } else if (isCollar || isFrontRing) {
        m.setRaw(x, y, z, mat('ring'), partId.ring);
      } else if (Y > 1.8) {
        m.setRaw(x, y, z, mat('tip'), partId.tip);
      } else {
        m.setRaw(x, y, z, mat('body'), partId.body);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8, headZ: 10, centerZ: 5 });
  }

  // 破土/钻入土垄遮口件（堆起的环状沙堆，严密包覆半露体节切口，360° 零露缝）
  function buildSandMound(makeCanvas, large = true) {
    const W = large ? 20 : 15;
    const D = large ? 20 : 15;
    const H = large ? 8 : 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const rMax = large ? 8.6 : 6.2;
    const hMax = large ? 6.2 : 4.4;

    m.fillAABB(-rMax - 0.5, rMax + 0.5, -rMax - 0.5, rMax + 0.5, 0, H - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      // 四重对称沙丘堆边（可按 symDeg: 90 省 4 倍烘焙贴图）
      const rimNoise = Math.cos(ang * 4) * 0.65;
      const effR = r / Math.max(2.0, rMax + rimNoise);
      if (effR > 1.0) return;

      // 大沙堆做微凹环脊，严密兜住从中央钻出的蠕虫；小沙堆做饱满隆起沙包
      let topZ;
      if (large) {
        const ringProfile = Math.cos(clamp((effR - 0.42) / 0.58, -1, 1) * Math.PI * 0.5);
        const centerDip = effR < 0.36 ? (0.36 - effR) * 2.2 : 0;
        topZ = hMax * Math.pow(Math.max(0, ringProfile), 0.85) - centerDip + Math.cos(ang * 4) * 0.35;
      } else {
        topZ = hMax * Math.pow(Math.max(0, 1 - effR * effR), 0.78) + Math.cos(ang * 4) * 0.30;
      }

      if (z <= topZ) {
        const isClod = (z >= topZ - 1.0) && (Math.abs(Math.abs(X) - Math.abs(Y)) < 1.2) && (r > rMax * 0.52);
        m.setRaw(x, y, z, isClod ? mat('pebble') : mat('sand'), isClod ? partId.pebble : partId.sand);
      }
    });

    // 四重对称沙块/土砾点缀
    const cr = large ? 1.2 : 0.95;
    const dClod = large ? 6.4 : 4.4;
    for (const [cx, cy] of [[dClod, 2.2], [-dClod, -2.2], [-2.2, dClod], [2.2, -dClod]]) {
      m.paintEllipsoid(cx, cy, 1.0, cr, cr, cr * 0.78, mat('pebble'), partId.pebble, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: rMax, headZ: Math.round(hMax), centerZ: 2 });
  }

  // =========================================================================
  // 2. 链参数与重叠实测：9 节体节链，节长 9.6 格，节距 5.4 格 → 重叠 43.75%
  // =========================================================================
  const NUM_NODES = 9;
  const SEG_LEN = 5.4;
  const BURROW_Z = -4.2;     // 完全潜入沙下深度（不绘制）
  const SHOW_Z_MIN = -0.8;   // 高于此高度的体节开始绘制

  const Sand1WormDef = {
    id: 'sand1_worm',
    code: '沙1',
    name: '潜沙红蠕虫',
    status: 'done',
    tag: 'M18 标杆 · 钻沙拱行',
    summary: '粗短鲜红环状体节、首尾对称盲口；地下潜行沿路径持续在「地表痕迹层」留沙垄隆起，周期性弓背拱出 3~5 节鲜红体节（沙堆土垄严密盖切口），偶发整条跃沙抛物线翻滚',
    defaultHabitat: 'desert',
    footRadius: 9.5,
    ecoWeight: 1.0,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: ['9 节高重叠体节链', '地表痕迹层沙垄留痕', '土垄严密遮切口', '弓背拱出与整条跃沙', '首尾对称零重建模换色'],
    soulHabit: '平时潜于沙下顺风纹拱出蜿蜒沙垄与扬沙，时不时弓背拱出 3~5 节鲜红环躯再钻回，偶发整条跃出沙面翻滚后扎回沙底',
    actions: [
      { id: 'patrol', name: '自由巡游（潜沙→拱出→跃沙）', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机（微拱探头）', loop: true, status: 'done' },
      { id: 'arch',   name: '弓背拱出展示', loop: true, status: 'done' },
      { id: 'leap',   name: '整条跃沙翻滚', loop: false, duration: 1.5, status: 'done' }
    ],
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        capEnd:     buildShovelEnd(makeCanvas),
        segMain:    buildRingSegment(makeCanvas, 'main'),
        segCrease:  buildRingSegment(makeCanvas, 'crease'),
        moundLarge: buildSandMound(makeCanvas, true),
        moundSmall: buildSandMound(makeCanvas, false)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.35;
      const seed0 = opts.seed ?? 41;

      const chain = new ChainSolver(NUM_NODES, SEG_LEN, {
        maxAngle: 0.44,
        waveFreq: 3.6,
        wavePhaseStep: 0.62,
        waveAmp: 0.24
      });

      const bulgeSpring = new SpringDamper1D(0, 120, 11.0);

      const state = {
        x: hx0, y: hy0, z: 0,
        vx: 0, vy: 0, yaw: hyaw0,
        shadowScale: 0.2,
        // 状态机：'burrow' (3~8s) | 'arch' (1.5~2.5s) | 'leap' (0.9~1.3s)
        mode: 'arch',
        modeT: 0.35,
        modeDur: 2.1,
        seq: 1,
        archCountSinceLeap: 0,
        // 拱出 / 跃沙起止点（供土垄部件精准锁在破土口与钻入口）
        exitX: hx0, exitY: hy0, exitActive: false, exitFade: 0,
        entryX: hx0, entryY: hy0, entryActive: false, entryFade: 0,
        // 潜行导航与痕迹发射节流
        navX: hx0 + 22, navY: hy0 + 10,
        decalCd: 0,
        dustCd: 0,
        leapLanded: false,
        leapStartX: hx0, leapStartY: hy0,
        leapEndX: hx0, leapEndY: hy0,
        leapYaw: hyaw0,
        prevAction: 'patrol'
      };

      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      function pickNextTarget(maxR) {
        state.seq++;
        const r1 = hash2i(state.seq, seed0, 107);
        const r2 = hash2i(state.seq, seed0, 223);
        const curAng = Math.atan2(state.y, state.x);
        const nextAng = curAng + (r1 > 0.5 ? 1 : -1) * lerp(1.2, 2.4, r2);
        const rad = lerp(maxR * 0.34, maxR * 0.76, hash2i(state.seq, seed0, 349));
        state.navX = Math.cos(nextAng) * rad;
        state.navY = Math.sin(nextAng) * rad;
      }

      function clampInDisc(x, y, lim) {
        const d = Math.hypot(x, y);
        if (d > lim && d > 1e-4) return [x * lim / d, y * lim / d];
        return [x, y];
      }

      function seatChainAtEntry(sMul, maxR) {
        const lim = maxR * 0.82;
        const [ex, ey] = clampInDisc(state.entryX, state.entryY, lim);
        const segLen = SEG_LEN * sMul;
        const backX = Math.sin(state.yaw), backY = -Math.cos(state.yaw);
        for (let i = 0; i < NUM_NODES; i++) {
          const n = chain.nodes[i];
          const [nx, ny] = clampInDisc(ex + backX * i * segLen * 0.35, ey + backY * i * segLen * 0.35, lim);
          n.x = nx;
          n.y = ny;
          n.z = BURROW_Z * sMul;
          n.yaw = state.yaw;
        }
        state.x = ex;
        state.y = ey;
      }

      function enterBurrow(sMul, maxR) {
        if (state.mode === 'arch' || state.mode === 'leap') {
          seatChainAtEntry(sMul, maxR);
        }
        state.mode = 'burrow';
        state.modeT = 0;
        state.seq++;
        // 3~8 秒地下潜行（实测取 3.2~6.2 秒兼顾生态观感与演示节奏，落在 3~8 秒规范内）
        state.modeDur = lerp(3.2, 6.2, hash2i(state.seq, seed0, 401));
        state.exitActive = false;
        state.entryActive = false;
      }

      function enterArch(sMul, maxR, vfx, habitat, eco, isSoloLoop) {
        if (state.mode === 'arch' || state.mode === 'leap') {
          seatChainAtEntry(sMul, maxR);
        }
        state.mode = 'arch';
        state.modeT = 0;
        state.seq++;
        // 1.5~2.5 秒弓背拱出
        state.modeDur = lerp(1.75, 2.45, hash2i(state.seq, seed0, 503));
        const safeR = maxR * 0.80;
        // 钻入口位于前方约 19 格（让拱桥稳稳跨出 3~5 节鲜红环躯）
        const span = 19.5 * sMul;
        let sx, sy, ex, ey, aimYaw;
        if (isSoloLoop) {
          // 单独演示「弓背拱出」动作时，在原点附近往返拱出，不向外漂出圆台
          const hx = (eco && eco.homeX) ?? 0;
          const hy = (eco && eco.homeY) ?? 0;
          const baseYaw = (eco && eco.homeYaw) ?? 0.35;
          const flip = (state.seq % 2 === 0) ? Math.PI : 0;
          aimYaw = wrapAngle(baseYaw + flip + (hash2i(state.seq, seed0, 541) - 0.5) * 0.35);
          [sx, sy] = localToWorldXY(hx, hy, aimYaw, 0, -span * 0.5);
          [ex, ey] = localToWorldXY(hx, hy, aimYaw, 0,  span * 0.5);
          [sx, sy] = clampInDisc(sx, sy, safeR);
          [ex, ey] = clampInDisc(ex, ey, safeR);
        } else {
          const head = chain.nodes[0];
          [sx, sy] = clampInDisc(head.x, head.y, safeR);
          aimYaw = state.yaw;
          [ex, ey] = localToWorldXY(sx, sy, aimYaw, 0, span);
          if (Math.hypot(ex, ey) > safeR) {
            aimYaw = wrapAngle(Math.atan2(sx, -sy) + (hash2i(state.seq, seed0, 521) - 0.5) * 0.85);
            [ex, ey] = localToWorldXY(sx, sy, aimYaw, 0, span);
            [ex, ey] = clampInDisc(ex, ey, safeR);
          }
        }
        state.yaw = aimYaw;
        state.exitX = sx;
        state.exitY = sy;
        state.exitActive = true;
        state.exitFade = 1.0;
        state.entryX = ex;
        state.entryY = ey;
        state.entryActive = true;
        state.entryFade = 0;
        if (vfx && habitat && habitat.fx) {
          vfx.spawnDust(state.exitX, state.exitY, 9, 0.95, habitat.fx);
          vfx.addDecal({ kind: 'mound', x: state.exitX, y: state.exitY, yaw: aimYaw, rx: 5.8 * sMul, ry: 6.4 * sMul, life: 8.0 });
        }
      }

      function enterLeap(sMul, maxR, vfx, habitat, isSoloLoop) {
        if (state.mode === 'arch' || state.mode === 'leap') {
          seatChainAtEntry(sMul, maxR);
        }
        state.mode = 'leap';
        state.modeT = 0;
        state.seq++;
        // 0.9~1.3 秒整条跃沙抛物线翻滚
        state.modeDur = lerp(0.95, 1.25, hash2i(state.seq, seed0, 607));
        state.leapLanded = false;
        const safeR = maxR * 0.80;
        const [sx, sy] = clampInDisc(chain.nodes[0].x, chain.nodes[0].y, safeR);
        state.leapStartX = sx;
        state.leapStartY = sy;
        // 朝场地内侧跃出 28~34 格，防止跃出圆台边界
        let aimYaw = state.yaw;
        const distCenter = Math.hypot(sx, sy);
        if (distCenter > maxR * (isSoloLoop ? 0.25 : 0.45)) {
          aimYaw = Math.atan2(sx, -sy) + (hash2i(state.seq, seed0, 709) - 0.5) * 0.85;
        }
        state.leapYaw = aimYaw;
        state.yaw = aimYaw;
        const jumpDist = 30.0 * sMul;
        let [lx, ly] = localToWorldXY(sx, sy, aimYaw, 0, jumpDist);
        [lx, ly] = clampInDisc(lx, ly, maxR * 0.82);
        state.leapEndX = lx;
        state.leapEndY = ly;
        state.exitX = sx;
        state.exitY = sy;
        state.exitActive = true;
        state.exitFade = 1.0;
        state.entryX = lx;
        state.entryY = ly;
        state.entryActive = false;
        state.entryFade = 0;
        if (vfx && habitat && habitat.fx) {
          vfx.spawnDust(state.exitX, state.exitY, 14, 1.25, habitat.fx);
          vfx.addDecal({ kind: 'mound', x: state.exitX, y: state.exitY, yaw: aimYaw, rx: 6.4 * sMul, ry: 7.0 * sMul, life: 9.0 });
        }
      }

      const instance = {
        def: Sand1WormDef,
        cachePrefix: `sand1_worm_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 0;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.shadowScale = 0.25;
          state.mode = 'arch';
          state.modeT = 0.45;
          state.modeDur = 2.15;
          state.archCountSinceLeap = 0;
          state.decalCd = 0;
          state.dustCd = 0;
          state.leapLanded = false;
          chain.reset(hx, hy, BURROW_Z, hyaw);
          // 初始摆出一个清晰的弓背拱出造型，打开工坊/生态页即刻见真身
          const span = 19.5;
          const [ex, ey] = localToWorldXY(hx, hy, hyaw, 0, span);
          state.exitX = hx; state.exitY = hy; state.exitActive = true; state.exitFade = 1.0;
          state.entryX = ex; state.entryY = ey; state.entryActive = true; state.entryFade = 0.7;
          pickNextTarget(42);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const speedMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.4, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const maxR = (eco && eco.maxRadius) || 44;
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const segLen = SEG_LEN * sMul;
          const nodes = chain.nodes;

          // 动作切换响应
          if (action !== state.prevAction) {
            state.prevAction = action;
            if (action === 'leap') {
              enterLeap(sMul, maxR, vfx, habitat, true);
            } else if (action === 'arch' || action === 'patrol') {
              if (state.mode === 'idle') enterArch(sMul, maxR, vfx, habitat, eco, action === 'arch');
              else if (action === 'arch') enterArch(sMul, maxR, vfx, habitat, eco, true);
            }
          }

          footContacts.length = 0;

          // -----------------------------------------------------------------
          // 分支 A：原地待机（idle）—— 在沙堆中微拱探出 3~4 节鲜红体节缓缓蠕动
          // -----------------------------------------------------------------
          if (action === 'idle') {
            state.mode = 'idle';
            const hx = (eco && eco.homeX) ?? 0;
            const hy = (eco && eco.homeY) ?? 0;
            const hyaw = (eco && eco.homeYaw) ?? 0.35;
            state.x = lerp(state.x, hx, expSmooth(dt, 5.5));
            state.y = lerp(state.y, hy, expSmooth(dt, 5.5));
            state.yaw = wrapAngle(state.yaw + wrapAngle(hyaw - state.yaw) * expSmooth(dt, 4.5));
            state.z = 0;
            state.shadowScale = 0.35;

            const span = 18.0 * sMul;
            const [ex, ey] = localToWorldXY(state.x, state.y, state.yaw, 0, -span * 0.48);
            const [nx, ny] = localToWorldXY(state.x, state.y, state.yaw, 0,  span * 0.52);
            state.exitX = ex; state.exitY = ey; state.exitActive = true; state.exitFade = 1.0;
            state.entryX = nx; state.entryY = ny; state.entryActive = true; state.entryFade = 1.0;

            const sway = Math.sin(time * 2.0 * gFreq) * 1.4 * flex * sMul;
            const crawlShift = Math.sin(time * 1.6 * gFreq) * 0.14;
            for (let i = 0; i < NUM_NODES; i++) {
              const u = i / (NUM_NODES - 1);
              // 中间 4 节（i = 2..5）拱在沙面之上，两端稳稳埋入两座沙堆内
              const sPos = lerp(1.18, -0.18, u) + crawlShift;
              const px = lerp(ex, nx, clamp(sPos, -0.3, 1.3));
              const py = lerp(ey, ny, clamp(sPos, -0.3, 1.3));
              const archSin = (sPos > 0 && sPos < 1) ? Math.sin(sPos * Math.PI) : -0.65;
              const sideOff = Math.sin(sPos * Math.PI) * sway;
              const [wx, wy] = localToWorldXY(px, py, state.yaw, sideOff, 0);
              nodes[i].x = wx;
              nodes[i].y = wy;
              nodes[i].z = archSin > 0 ? (archSin * 8.2 * sMul) : BURROW_Z * sMul;
              nodes[i].yaw = state.yaw;
            }
            sockets.setWorld('head', nodes[0].x, nodes[0].y, Math.max(0, nodes[0].z), nodes[0].yaw);
            return;
          }

          // -----------------------------------------------------------------
          // 分支 B：巡游 / 拱出展示 / 跃沙展示 状态机推进
          // -----------------------------------------------------------------
          state.modeT += dt;
          if (state.modeT >= state.modeDur) {
            if (action === 'arch') {
              enterArch(sMul, maxR, vfx, habitat, eco, true);
            } else if (action === 'leap') {
              enterLeap(sMul, maxR, vfx, habitat, true);
            } else if (state.mode === 'burrow') {
              state.archCountSinceLeap++;
              const wantLeap = state.archCountSinceLeap >= 2 && hash2i(state.seq + 3, seed0, 811) < 0.58;
              if (wantLeap) {
                state.archCountSinceLeap = 0;
                enterLeap(sMul, maxR, vfx, habitat, false);
              } else {
                enterArch(sMul, maxR, vfx, habitat, eco, false);
              }
            } else {
              enterBurrow(sMul, maxR);
            }
          }

          const p = clamp(state.modeT / Math.max(0.01, state.modeDur), 0, 1);

          // -----------------------------------------------------------------
          // 状态 1：地下潜行（burrow）—— 体节全隐于沙下，移动隆起沙包 + 地表痕迹层沙垄 + 扬沙
          // -----------------------------------------------------------------
          if (state.mode === 'burrow') {
            state.shadowScale = 0.0;
            const head = nodes[0];
            const tx = state.navX + ((eco && eco.avoidX) || 0) * 0.4;
            const ty = state.navY + ((eco && eco.avoidY) || 0) * 0.4;
            const dx = tx - head.x, dy = ty - head.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 8.5) pickNextTarget(maxR);

            const desiredYaw = Math.atan2(-dx, dy);
            const yawDiff = wrapAngle(desiredYaw - state.yaw);
            const maxTurn = 2.6 * (0.7 + speedMul * 0.35);
            state.yaw = wrapAngle(state.yaw + clamp(yawDiff, -maxTurn * dt, maxTurn * dt));

            // 蠕动推进脉动：一缩一顶往前拱沙
            const pulse = 0.65 + 0.55 * Math.pow(Math.max(0, Math.sin(time * 4.4 * gFreq)), 1.4);
            const spd = 15.5 * speedMul * pulse * sMul;
            const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
            const wiggle = Math.sin(time * 4.4 * gFreq) * 2.2 * flex * sMul;
            const rightX = Math.cos(state.yaw), rightY = Math.sin(state.yaw);

            let nx = head.x + (fwdX * spd + rightX * wiggle) * dt;
            let ny = head.y + (fwdY * spd + rightY * wiggle) * dt;
            const dR = Math.hypot(nx, ny);
            if (dR > maxR * 0.80) {
              nx *= (maxR * 0.80) / dR;
              ny *= (maxR * 0.80) / dR;
              pickNextTarget(maxR);
            }

            chain.update(dt, nx, ny, BURROW_Z * sMul, state.yaw, time, {
              segLen,
              flexibility: flex,
              waveFreq: 4.4 * gFreq,
              waveAmp: 0.20,
              restAlign: 0.12,
              zTargetFn: () => BURROW_Z * sMul
            });

            state.vx = (nx - state.x) / Math.max(dt, 0.001);
            state.vy = (ny - state.y) / Math.max(dt, 0.001);
            state.x = nx;
            state.y = ny;
            state.z = 0;

            bulgeSpring.update(dt, pulse * 0.8, 120 * sp, 11.0);

            // 沿潜行路径持续往「地表痕迹层」写入沙垄隆起（mound）与扬沙粒子
            state.decalCd -= dt;
            if (vfx && state.decalCd <= 0) {
              state.decalCd = clamp(0.11 / speedMul, 0.06, 0.18);
              vfx.addDecal({
                kind: 'mound',
                x: head.x, y: head.y, yaw: state.yaw,
                rx: 4.8 * sMul, ry: 5.8 * sMul,
                life: 7.5, alpha: 0.90
              });
            }
            state.dustCd -= dt;
            if (vfx && habitat && habitat.fx && state.dustCd <= 0) {
              state.dustCd = 0.14;
              vfx.spawnDust(head.x, head.y, 3, 0.65, habitat.fx);
            }
            sockets.setWorld('head', head.x, head.y, 0.5, state.yaw);
            return;
          }

          // -----------------------------------------------------------------
          // 状态 2：弓背拱出一段（arch，1.5~2.5s）—— 沿拱桥滑行，露 3~5 节鲜红环躯
          // -----------------------------------------------------------------
          if (state.mode === 'arch') {
            // 整条蠕虫顺着固定拱桥轨道（exit → entry）从沙下穿出再钻回沙下
            // 拱桥弦长 span ≈ 19.5 格，虫全长 (NUM_NODES-1)*SEG_LEN ≈ 43.2 格
            // 头部沿轨道位置 headS 从 0.05 走到 2.35，让首端先破土、中段拱高、尾端顺滑收进钻入口
            const headS = lerp(0.06, 2.35, smoothstep(0, 1, p));
            const span = Math.max(12, Math.hypot(state.entryX - state.exitX, state.entryY - state.exitY));
            const archYaw = Math.atan2(-(state.entryX - state.exitX), state.entryY - state.exitY);
            state.yaw = archYaw;
            const archPeakZ = 10.6 * sMul;
            const sway = Math.sin(time * 5.2 * gFreq) * 1.15 * flex * sMul;

            // 出洞口和入洞口的沙堆渐显/保持
            state.exitFade = clamp(1 - smoothstep(0.78, 1.0, p), 0, 1);
            state.entryFade = smoothstep(0.18, 0.36, p);

            let anyVisible = false;
            let sumX = 0, sumY = 0, visCount = 0;

            for (let i = 0; i < NUM_NODES; i++) {
              const sNode = headS - (i * segLen) / span;
              const n = nodes[i];
              const sPos = clamp(sNode, -0.05, 1.05);
              const px = lerp(state.exitX, state.entryX, sPos);
              const py = lerp(state.exitY, state.entryY, sPos);
              if (sNode > -0.05 && sNode < 1.05) {
                const uArc = clamp(sNode, 0, 1);
                const h = Math.sin(uArc * Math.PI);
                const lat = h * sway * Math.sin(i * 0.7);
                const [wx, wy] = localToWorldXY(px, py, archYaw, lat, 0);
                n.x = wx;
                n.y = wy;
                n.z = h * archPeakZ;
                n.yaw = archYaw;
                if (n.z > SHOW_Z_MIN) {
                  anyVisible = true;
                  sumX += wx; sumY += wy; visCount++;
                  footContacts.push({ x: wx, y: wy, z: n.z, r: 3.6 * sMul });
                }
              } else {
                n.x = px;
                n.y = py;
                n.z = BURROW_Z * sMul;
                n.yaw = archYaw;
              }
            }

            state.shadowScale = anyVisible ? 0.35 : 0.0;
            state.x = visCount > 0 ? sumX / visCount : lerp(state.exitX, state.entryX, 0.5);
            state.y = visCount > 0 ? sumY / visCount : lerp(state.exitY, state.entryY, 0.5);
            state.z = 0;

            // 入洞口刚被顶穿时喷一次扬沙 + 写沙垄
            state.dustCd -= dt;
            if (vfx && habitat && habitat.fx && state.dustCd <= 0) {
              state.dustCd = 0.22;
              if (p < 0.65) vfx.spawnDust(state.exitX, state.exitY, 2, 0.55, habitat.fx);
              if (p > 0.25) {
                vfx.spawnDust(state.entryX, state.entryY, 3, 0.70, habitat.fx);
                vfx.addDecal({ kind: 'mound', x: state.entryX, y: state.entryY, yaw: archYaw, rx: 5.8 * sMul, ry: 5.8 * sMul, life: 8.5 });
              }
            }
            sockets.setWorld('head', nodes[0].x, nodes[0].y, Math.max(0, nodes[0].z), archYaw);
            return;
          }

          // -----------------------------------------------------------------
          // 状态 3：偶发整条跃出沙面抛物线翻滚（leap，0.9~1.3s）
          // -----------------------------------------------------------------
          if (state.mode === 'leap') {
            const leapSpan = Math.max(16, Math.hypot(state.leapEndX - state.leapStartX, state.leapEndY - state.leapStartY));
            const leapYaw = state.leapYaw;
            state.yaw = leapYaw;
            // 头部沿抛物线轨迹从 0.04 跃到 2.15（整条 9 节在 p≈0.48 时全部腾空翻滚）
            const headS = lerp(0.05, 2.25, p);
            const peakZ = 21.5 * sMul;

            state.exitFade = clamp(1 - smoothstep(0.55, 0.90, p), 0, 1);
            if (p >= 0.50 && !state.leapLanded) {
              state.leapLanded = true;
              state.entryActive = true;
              if (vfx && habitat && habitat.fx) {
                vfx.spawnDust(state.leapEndX, state.leapEndY, 16, 1.35, habitat.fx);
                vfx.addDecal({ kind: 'mound', x: state.leapEndX, y: state.leapEndY, yaw: leapYaw, rx: 7.2 * sMul, ry: 7.2 * sMul, life: 9.5 });
                vfx.addDecal({ kind: 'crack', x: state.leapEndX, y: state.leapEndY, yaw: leapYaw, rx: 6.0 * sMul, ry: 6.0 * sMul, life: 6.5, alpha: 0.45 });
              }
            }
            state.entryFade = state.leapLanded ? smoothstep(0.48, 0.62, p) : 0;

            let sumX = 0, sumY = 0, sumZ = 0, visCount = 0;
            for (let i = 0; i < NUM_NODES; i++) {
              // 腾空时节距略收紧表现空中翻滚卷曲感（不拉伸贴图，纯靠节坐标表现）
              const sNode = headS - (i * segLen * 0.88) / leapSpan;
              const n = nodes[i];
              const sPos = clamp(sNode, -0.04, 1.04);
              const px = lerp(state.leapStartX, state.leapEndX, sPos);
              const py = lerp(state.leapStartY, state.leapEndY, sPos);
              if (sNode > -0.04 && sNode < 1.04) {
                const uArc = clamp(sNode, 0, 1);
                const arcH = Math.sin(uArc * Math.PI);
                // 空中翻滚波浪（正弦侧摆 + 垂直微浪）
                const rollWave = Math.sin(p * Math.PI * 3.0 - i * 0.55) * 2.4 * flex * sMul * arcH;
                const [wx, wy] = localToWorldXY(px, py, leapYaw, rollWave, 0);
                n.x = wx;
                n.y = wy;
                n.z = arcH * peakZ + Math.cos(p * Math.PI * 3.0 - i * 0.55) * 1.4 * sMul * arcH;
                n.yaw = wrapAngle(leapYaw + Math.cos(p * Math.PI * 3.0 - i * 0.55) * 0.16 * arcH);
                if (n.z > SHOW_Z_MIN) {
                  sumX += wx; sumY += wy; sumZ += n.z; visCount++;
                  footContacts.push({ x: wx, y: wy, z: n.z, r: 3.4 * sMul });
                }
              } else {
                n.x = px;
                n.y = py;
                n.z = BURROW_Z * sMul;
                n.yaw = leapYaw;
              }
            }

            state.shadowScale = visCount > 0 ? 0.65 : 0.0;
            state.x = visCount > 0 ? sumX / visCount : lerp(state.leapStartX, state.leapEndX, 0.5);
            state.y = visCount > 0 ? sumY / visCount : lerp(state.leapStartY, state.leapEndY, 0.5);
            state.z = visCount > 0 ? (sumZ / visCount) * 0.45 : 0;
            sockets.setWorld('head', nodes[0].x, nodes[0].y, Math.max(0, nodes[0].z), leapYaw);
          }
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const nodes = chain.nodes;

          // 1. 地下潜行态：不画任何鲜红体节，仅画移动的 3D 沙包隆起（前大后小，沿体节链跟随）
          if (state.mode === 'burrow') {
            const n0 = nodes[0];
            const n2 = nodes[2];
            const n4 = nodes[4];
            const bob = Math.max(0, bulgeSpring.x) * 0.45 * sMul;
            list.push({
              partKey: 'moundLarge', asset: parts.moundLarge,
              x: n0.x, y: n0.y, lift: bob,
              ro: n0.yaw, symDeg: 90, bias: 0.20
            });
            list.push({
              partKey: 'moundSmall', asset: parts.moundSmall,
              x: n2.x, y: n2.y, lift: 0,
              ro: n2.yaw, symDeg: 90, bias: 0.05
            });
            list.push({
              partKey: 'moundSmall', asset: parts.moundSmall,
              x: n4.x, y: n4.y, lift: 0,
              ro: wrapAngle(n4.yaw + 0.78), symDeg: 90, bias: -0.05
            });
            return list;
          }

          // 2. 拱出 / 跃沙 / 原地待机：只绘制露出沙面的体节（z > SHOW_Z_MIN），地下节不画
          for (let i = 0; i < NUM_NODES; i++) {
            const n = nodes[i];
            if (n.z <= SHOW_Z_MIN) continue;

            const isFront = (i === 0);
            const isRear = (i === NUM_NODES - 1);
            let partKey, ro, symDeg;
            if (isFront) {
              partKey = 'capEnd';
              ro = n.yaw;
              symDeg = 360;
            } else if (isRear) {
              // 首尾对称：后端复用同一套铲头资产，翻转 180°
              partKey = 'capEnd';
              ro = wrapAngle(n.yaw + Math.PI);
              symDeg = 360;
            } else {
              partKey = (i % 2 === 1) ? 'segMain' : 'segCrease';
              ro = n.yaw;
              symDeg = 180;
            }

            // 半露的底节（z < 2.8）给强负 bias，确保被破土/钻入土垄部件严密盖住切口；
            // 高拱在空中的体节给强正 bias，360° 旋转下自然压在土垄上方零露缝
            const lift = Math.max(0, n.z);
            const bias = lift < 2.8 * sMul ? -1.2 : (1.35 + Math.min(0.65, lift * 0.03));

            list.push({
              partKey, asset: parts[partKey],
              x: n.x, y: n.y, lift,
              ro, symDeg, bias
            });
          }

          // 3. 破土口与钻入口土垄遮口件（bias = +0.25 严格夹在半露底节 -0.35 与高拱体节 +0.55 之间，360° 零露缝）
          if (state.exitActive && state.exitFade > 0.08) {
            list.push({
              partKey: 'moundLarge', asset: parts.moundLarge,
              x: state.exitX, y: state.exitY, lift: 0,
              ro: state.yaw, symDeg: 90, bias: 0.25
            });
          }
          if (state.entryActive && state.entryFade > 0.08) {
            list.push({
              partKey: 'moundLarge', asset: parts.moundLarge,
              x: state.entryX, y: state.entryY, lift: 0,
              ro: wrapAngle(state.yaw + 0.55), symDeg: 90, bias: 0.25
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sand1WormDef.id, code: Sand1WormDef.code, name: Sand1WormDef.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id, segmentCount: NUM_NODES, segLen: SEG_LEN,
            overlapRatio: 0.4375,
            footRadius: Sand1WormDef.footRadius, headZ: 12, centerZ: 5,
            blocks: Sand1WormDef.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sand1WormDef);
})(window.PixelWorkshop);
