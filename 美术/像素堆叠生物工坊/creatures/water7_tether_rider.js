'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SocketTracker } = PW.Solvers;
  const { EnvFeedback, MountSystem, notifyHostDisturb } = PW.Behaviors;

  // =========================================================================
  // 水7 · 拴在大鱼身上的（M36 寄生挂点 + kind: 'line' 像素画线，+Y 正前，z=0 贴地）
  //   1. 俯视 ×4 体貌特征放大：
  //      - 拳头大圆胖亮橙红/明黄斑纹小身子（两档资产：riderClosed 闭口拖行 / riderGulp 大口吞碎渣）；
  //      - 一根极醒目的亮粉白长肉绳（调用 core/renderer.js 的 kind: 'line'，widthArtPx: 2 粗、
  //        带暗红描边与实时下垂弧 sag + 绷直微颤 jitter）；
  //      - 末端放大显眼的暗红吸盘头（suckerHead），咬在宿主鳍根/尾侧一眼可见；
  //   2. 双态运行：
  //      - 多怪同台：自动调用 MountSystem 搜寻水域大宿主（优先 水5、水4、水3、海1），
  //        吸盘咬住宿主鳍根/尾侧，正 state.sortBias 防埋没，本体拖在后方随波划出优美弧线接吃碎渣；
  //      - 独台预览：自带极简潜游大鱼尾鳍配角（soloFishBody + soloFishTail）牵引演示拖行画弧；
  //   3. 30 色 0 重色 0 自亮、3 套皮肤、严禁常态 scaleX/scaleY 拉伸、坐标钳制在 maxRadius * 0.80 内。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 圆胖小身子亮橙红主色（3 档，水域背景下极醒目）
      bodyDark:      '#a82c13',
      bodyMid:       '#eb5424',
      bodyHi:        '#ff8a47',
      // 明黄醒目斑纹与背脊点（3 档）
      spotDark:      '#ba8414',
      spotMid:       '#f5c42f',
      spotHi:        '#fff082',
      // 柔和暖白腹底（3 档）
      bellyDark:     '#b59f88',
      bellyMid:      '#e8d5be',
      bellyHi:       '#fff5e8',
      // 大口吞渣粉红口腔（3 档）
      mouthDark:     '#7d182b',
      mouthMid:      '#c73651',
      mouthHi:       '#ff7d95',
      // 末端放大显眼的暗红吸盘头（3 档）
      suckerDark:    '#4a0b15',
      suckerMid:     '#851627',
      suckerHi:      '#bf2c40',
      // 吸盘头亮粉凸边环（3 档，强化俯视辨识）
      suckerRimDark: '#9e4456',
      suckerRimMid:  '#de7c90',
      suckerRimHi:   '#ffc7d3',
      // 圆亮小眼（不进 glowKeys）
      eyeDark:       '#120c10',
      eyeIris:       '#2b2229',
      eyeGlint:      '#faf7f2',
      // 独台极简潜游大鱼配角深青蓝（3 档，沉稳衬托主角）
      fishDark:      '#193447',
      fishMid:       '#2c5773',
      fishHi:        '#497d9c',
      // 独台大鱼尾鳍与背鳍青灰（3 档）
      fishFinDark:   '#1e4254',
      fishFinMid:    '#386d85',
      fishFinHi:     '#63a0b8',
      // 独台大鱼浅灰腹底（3 档）
      fishBellyDark: '#698594',
      fishBellyMid:  '#9eb7c4',
      fishBellyHi:   '#cfe2eb'
    },
    glowKeys: [],
    parts: [
      'body', 'spot', 'belly', 'mouth', 'sucker', 'suckerRim', 'eye',
      'fish', 'fishFin', 'fishBelly'
    ],
    noCrease: [
      ['body', 'spot'], ['body', 'belly'], ['body', 'mouth'], ['body', 'eye'],
      ['sucker', 'suckerRim'],
      ['fish', 'fishFin'], ['fish', 'fishBelly']
    ],
    materials: {
      body:      ['bodyDark',      'bodyMid',      'bodyHi'],
      spot:      ['spotDark',      'spotMid',      'spotHi'],
      belly:     ['bellyDark',     'bellyMid',     'bellyHi'],
      mouth:     ['mouthDark',     'mouthMid',     'mouthHi'],
      sucker:    ['suckerDark',    'suckerMid',    'suckerHi'],
      suckerRim: ['suckerRimDark', 'suckerRimMid', 'suckerRimHi'],
      fish:      ['fishDark',      'fishMid',      'fishHi'],
      fishFin:   ['fishFinDark',   'fishFinMid',   'fishFinHi'],
      fishBelly: ['fishBellyDark', 'fishBellyMid', 'fishBellyHi']
    },
    protectedParts: ['eye', 'sucker', 'mouth']
  });

  // 3 套零重建模换色皮肤（0 重色，0 禁用字）
  const SKINS = [
    {
      id: 'coral_amber',
      name: '橙红黄斑（深潭经典）',
      dot: '#eb5424',
      outline: '#1f0b08',
      pal: {},
      line: { main: '#ffd6e0', outline: '#4a0d1b' },
      fx: { crumbA: '#ffe599', crumbB: '#ff9c78', splash: '#d9f2ff' }
    },
    {
      id: 'crimson_gold',
      name: '朱红金纹（急流款）',
      dot: '#db2b39',
      outline: '#1f070c',
      pal: {
        bodyDark:      '#8f1422', bodyMid:      '#db2b39', bodyHi:      '#ff696e',
        spotDark:      '#b86b14', spotMid:      '#f5a42c', spotHi:      '#ffe175',
        suckerDark:    '#3b091c', suckerMid:    '#6e1535', suckerHi:    '#a82853',
        suckerRimDark: '#8c3d5c', suckerRimMid: '#cf7295', suckerRimHi: '#ffbfd6'
      },
      line: { main: '#ffe0e8', outline: '#3b091a' },
      fx: { crumbA: '#ffe175', crumbB: '#ff8a96', splash: '#d6f0ff' }
    },
    {
      id: 'tangerine_cream',
      name: '蜜橘奶斑（浅滩款）',
      dot: '#f08c24',
      outline: '#211106',
      pal: {
        bodyDark:      '#a65311', bodyMid:      '#f08c24', bodyHi:      '#ffc25c',
        spotDark:      '#ad9d82', spotMid:      '#e6d7bd', spotHi:      '#fff8e8',
        suckerDark:    '#541313', suckerMid:    '#912420', suckerHi:    '#cc443d',
        suckerRimDark: '#a6504b', suckerRimMid: '#e38a84', suckerRimHi: '#ffccc7'
      },
      line: { main: '#ffdfe6', outline: '#4f1218' },
      fx: { crumbA: '#fff8e8', crumbB: '#ffc25c', splash: '#dcf5ff' }
    }
  ];

  // =========================================================================
  // 1. 拳头大圆胖小身子：闭口拖行态（riderClosed）与大口吞碎渣态（riderGulp）
  // =========================================================================
  function buildRiderBody(makeCanvas, gulping) {
    const W = gulping ? 12 : 11;
    const D = gulping ? 13 : 12;
    const H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 饱满圆胖鱼团身（亮橙红底 + 醒目明黄粗斑 + 浅暖白腹）
    m.fillAABB(-5.5, 5.5, -5.8, 5.8, 1, 8, (x, y, z, X, Y) => {
      const rx = gulping ? 4.8 : 4.4;
      const ry = gulping ? 5.2 : 4.8;
      const rz = 3.5;
      const d = Math.hypot(X / rx, Y / ry, (z - 4.3) / rz);
      if (d > 1.0) return;

      // 背上两条醒目明黄横弧斑 + 背顶圆斑
      const onSpot1 = z >= 5 && Math.abs(Y - 1.0) <= 1.25;
      const onSpot2 = z >= 5 && Math.abs(Y + 2.2) <= 1.15;
      const onBelly = z <= 2.4 && Math.abs(X) < 3.2;
      if (onSpot1 || onSpot2) {
        m.setRaw(x, y, z, mat('spot'), partId.spot);
      } else if (onBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else {
        m.setRaw(x, y, z, mat('body'), partId.body);
      }
    });

    // 前端肉绳衔接嘴/大口吞渣结构（+Y 正前朝向大鱼方向）
    if (gulping) {
      // 张大圆口露出粉红口腔，接吃碎渣极有喜感
      m.paintEllipsoid(0, 4.9, 4.3, 3.0, 1.8, 2.3, mat('body'), partId.body, true);
      m.paintEllipsoid(0, 5.5, 4.3, 2.1, 1.3, 1.5, mat('mouth'), partId.mouth, true);
    } else {
      m.paintEllipsoid(0, 4.5, 4.3, 1.8, 1.4, 1.5, mat('mouth'), partId.mouth, true);
    }

    // 两侧一对圆俏明黄小胸鳍 + 后方小短尾舵
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 3.6, 0.2, 4.0, s * 5.2, -1.6, 4.4, 1.05, 0.72, mat('spot'), partId.spot, true);
    }
    m.paintCapsule(0, -4.0, 4.4, 0, -5.6, 4.8, 1.15, 0.72, mat('spot'), partId.spot, true);
    // 顶部短小背鳍点缀
    m.paintCapsule(0, 0.5, 7.2, 0, -2.0, 7.8, 0.85, 0.65, mat('spot'), partId.spot, true);

    m.despeckle();
    m.applyArtShading(true);

    // 侧前一对大圆眼（俯视清晰可爱）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + (gulping ? 2.8 : 2.6));
    const eyeZ = 6;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 2.5);
      m.setRaw(ex, eyeY, eyeZ, keyToId.eyeDark, partId.eye);
      if (eyeY + 1 < D) m.setRaw(ex, eyeY + 1, eyeZ, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 4.8, headZ: 8, centerZ: 4 });
  }

  // =========================================================================
  // 2. 末端放大显眼的暗红吸盘头（suckerHead：9×9×7，咬在宿主鳍根/尾侧一眼看见）
  // =========================================================================
  function buildSuckerHead(makeCanvas) {
    const m = new VoxelModel(9, 9, 7, SPEC);
    const { mat, partId } = SPEC;

    // 宽厚圆盘暗红吸盘本体（俯视轮廓大而醒目）
    m.fillAABB(-4.2, 4.2, -4.2, 4.2, 1, 5, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const maxR = z <= 2 ? 3.9 : (z <= 4 ? 3.3 : 2.2);
      if (r <= maxR) {
        const isRim = r >= maxR - 1.1 && z <= 3;
        m.setRaw(x, y, z, isRim ? mat('suckerRim') : mat('sucker'), isRim ? partId.suckerRim : partId.sucker);
      }
    });

    // 吸盘背顶中心饱满鼓包与肉绳接口环
    m.paintEllipsoid(0, 0, 4.6, 2.1, 2.1, 1.6, mat('sucker'), partId.sucker, true);
    m.paintEllipsoid(0, -1.6, 4.2, 1.35, 1.45, 1.2, mat('suckerRim'), partId.suckerRim, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.9, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 3. 独台预览用：极简潜游大鱼尾鳍配角（soloFishBody + soloFishTail）
  //    仅在场上无其他宿主时出现，沉稳青蓝衬托亮橙红水7与亮粉白肉绳
  // =========================================================================
  const SOLO_TAIL_PIVOT = { x: 0, y: 5.2, attachY: -10.8 };

  function buildSoloFishBody(makeCanvas) {
    const m = new VoxelModel(18, 28, 12, SPEC);
    const { mat, partId } = SPEC;

    // 流线厚实大鱼身
    m.fillAABB(-8.5, 8.5, -13.5, 13.5, 1, 10, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 5.6, Y / 12.2, (z - 5.2) / 4.4);
      if (d > 1.0) return;
      if (z <= 2.6 && Math.abs(X) < 3.8) {
        m.setRaw(x, y, z, mat('fishBelly'), partId.fishBelly);
      } else {
        m.setRaw(x, y, z, mat('fish'), partId.fish);
      }
    });

    // 两侧宽大长胸鳍（吸盘咬住鳍根处！）
    for (const s of [-1, 1]) {
      m.paintFinTri(
        [s * 4.4,  2.8, 4.8],
        [s * 8.4, -2.5, 4.4],
        [s * 4.2, -4.6, 4.6],
        0.95, mat('fishFin'), partId.fishFin, true
      );
    }

    // 背脊长鳍
    m.paintFinTri([0, 4.5, 8.8], [0, -7.8, 8.2], [0, -3.5, 11.2], 0.85, mat('fishFin'), partId.fishFin, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.2, headZ: 11, centerZ: 5 });
  }

  function buildSoloFishTail(makeCanvas) {
    const m = new VoxelModel(10, 14, 11, SPEC);
    const { mat, partId } = SPEC;
    const py = SOLO_TAIL_PIVOT.y;

    m.paintEllipsoid(0, py - 0.8, 5.2, 2.2, 2.4, 2.4, mat('fish'), partId.fish, true);
    m.paintFinTri([0, py - 1.2, 5.4], [0, -6.0, 9.8], [0, -3.2, 5.4], 0.85, mat('fishFin'), partId.fishFin, true);
    m.paintFinTri([0, py - 1.2, 5.0], [0, -6.0, 1.2], [0, -3.2, 5.0], 0.85, mat('fishFin'), partId.fishFin, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 10, centerZ: 5 });
  }

  // =========================================================================
  // 生物定义与拖行画弧状态机
  // =========================================================================
  const ROPE_LEN_BASE = 21.0;

  const Water7Def = {
    id: 'water7_tether_rider',
    code: '水7',
    name: '拴在大鱼身上的',
    status: 'done',
    noHost: true,
    tag: 'M36 寄生挂点 · kind: line 2px 亮粉白肉绳 · 拖行画弧',
    summary: '拳头大圆胖亮橙红/明黄斑纹小身子配大口吞碎渣，拖一根 2px 粗亮粉白长肉绳与末端放大暗红吸盘头；多怪同台自动咬住大鱼/水域大宿主鳍根尾侧，随波拖行划出优美弧线接吃碎渣；独台自带潜游大鱼配角演示拖行画弧',
    defaultHabitat: 'river',
    footRadius: 0.5,
    ecoWeight: 0.35,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      'MountSystem 搜寻水域大宿主（优先 水5 / 水4 / 水3 / 海1）',
      'core/renderer.js kind: line 2px 粗暗边亮粉白肉绳与下垂弧 sag',
      '放大显眼的暗红吸盘头咬住鳍根/尾侧 + 正 sortBias 防埋没',
      '风筝线式物理拖行画弧 + 大口吞渣两档姿态切换',
      '独台潜游大鱼尾鳍配角演示加速甩弧与水花'
    ],
    soulHabit: '用末端暗红大吸盘牢牢咬住长鳍大鱼等水域大家伙的鳍根尾侧，亮粉白长肉绳绷成优美弧线，圆胖小身子拖在后方随波划弧，大鱼咬碎猎物时张大口接吃飘来的碎渣',
    actions: [
      { id: 'patrol', name: '拖行画弧巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '随波轻荡待机', loop: true, status: 'done' },
      { id: 'tow',    name: '绷绳甩弧吞渣', loop: true, status: 'done' }
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
        riderClosed:  buildRiderBody(makeCanvas, false),
        riderGulp:    buildRiderBody(makeCanvas, true),
        suckerHead:   buildSuckerHead(makeCanvas),
        soloFishBody: buildSoloFishBody(makeCanvas),
        soloFishTail: buildSoloFishTail(makeCanvas)
      };

      const riderRecolorAssets = [parts.riderClosed, parts.riderGulp, parts.suckerHead];
      const riderId = `water7_tr_${Math.random().toString(36).slice(2, 7)}`;
      const sockets = new SocketTracker();
      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;

      // 独台潜游大鱼配角状态
      const soloFish = {
        x: hx0,
        y: hy0 + 10,
        z: 2.0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        orbitAng: 0.35,
        tailPhase: 0,
        tailYaw: 0,
        surgeTimer: 0,
        surgeActive: false
      };

      // 吸盘头与水7本体实时状态
      const state = {
        x: hx0,
        y: hy0 - 12,
        z: 2.2,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        shadowScale: 0,
        sortBias: 0,
        hasHostEnv: false,
        host: null,
        slot: null,
        lastHost: null,
        mode: 'tethered', // 'seek' | 'approach' | 'tethered'
        modeT: 0,
        attachSide: 1,
        // 吸盘头世界坐标
        suckerX: hx0,
        suckerY: hy0 + 6,
        suckerZ: 5.0,
        suckerYaw: hyaw0,
        // 肉绳物理参数
        lineSag: 2.6,
        lineJitter: 0.04,
        jitterPhase: 0,
        ropeTension: 0.4,
        // 张大口接吃碎渣计时
        gulpTimer: 0,
        crumbCd: 0.65,
        wakeCd: 0.15,
        disturbCd: 1.5
      };

      const footContacts = [
        { x: hx0, y: hy0, z: 2.0, r: 4.5 }, // 水7本体水面暗印
        { x: hx0, y: hy0, z: 2.0, r: 8.8 }  // 独台大鱼水面暗印（同台时置 0）
      ];

      let curSkin = SKINS[0];

      function clampToArena(px, py, maxR) {
        const d = Math.hypot(px, py);
        if (d > maxR && d > 0.001) {
          const k = maxR / d;
          return [px * k, py * k];
        }
        return [px, py];
      }

      function releaseCurrentHost(allActors, rememberLast) {
        if (rememberLast && state.host) state.lastHost = state.host;
        if (allActors && allActors.length) {
          MountSystem.releaseMount(riderId, allActors);
        } else if (state.slot && state.slot.occupiedBy === riderId) {
          state.slot.occupiedBy = null;
        }
        state.host = null;
        state.slot = null;
        state.sortBias = 0;
      }

      function emitFoodCrumbs(vfx, sx, sy, sz, rx, ry, rz, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const dx = rx - sx, dy = ry - sy;
        const dist = Math.hypot(dx, dy) || 1;
        for (let k = 0; k < 4; k++) {
          const spread = (Math.random() - 0.5) * 6.0 * sMul;
          const vx = (dx / dist) * (14 + Math.random() * 8) * sMul + spread;
          const vy = (dy / dist) * (14 + Math.random() * 8) * sMul + spread;
          vfx.spawnParticle(
            sx + (Math.random() - 0.5) * 3.0 * sMul,
            sy + (Math.random() - 0.5) * 3.0 * sMul,
            Math.max(1.5, sz + 1.5 * sMul),
            vx, vy, (3.5 + Math.random() * 4.5) * sMul,
            0.52 + Math.random() * 0.25,
            1.25 + Math.random() * 0.35,
            k % 2 === 0 ? fx.crumbA : fx.crumbB,
            false,
            10
          );
        }
      }

      // 风筝线式拖行物理更新：吸盘锚定在 (ax, ay, az)，本体在后方随波划出优美弧线
      function stepTetherPhysics(dt, time, ax, ay, az, hostYaw, hostVx, hostVy, isBoost, isIdle, gFreq, flex, sMul, maxR, vfx, habitat) {
        const ropeLen = ROPE_LEN_BASE * sMul;
        const hostSpd = Math.hypot(hostVx, hostVy);

        // 理想拖尾方向在宿主正后方 + 随波左右摆弧（类似水面风筝/拖水滑板）
        const backDirX = Math.sin(hostYaw);
        const backDirY = -Math.cos(hostYaw);
        const sideDirX = Math.cos(hostYaw);
        const sideDirY = Math.sin(hostYaw);

        const swingFreq = (isBoost ? 3.2 : (isIdle ? 1.5 : 2.2)) * gFreq;
        const swingAmp = (isBoost ? 13.5 : (isIdle ? 6.5 : 9.8)) * flex * sMul;
        const swingWave = Math.sin(time * swingFreq + 0.6);

        const idealDist = isIdle ? ropeLen * 0.78 : (isBoost ? ropeLen * 0.99 : ropeLen * 0.90);
        const tgtX = ax + backDirX * idealDist + sideDirX * swingWave * swingAmp;
        const tgtY = ay + backDirY * idealDist + sideDirY * swingWave * swingAmp;

        // 柔性流体跟随 + 绳长硬约束（保证永不断绳也永不穿进宿主）
        const followRate = isBoost ? 4.4 : (isIdle ? 2.4 : 3.2);
        const kFollow = expSmooth(dt, followRate);
        const nx = lerp(state.x, tgtX, kFollow);
        const ny = lerp(state.y, tgtY, kFollow);
        state.vx = (nx - state.x) / Math.max(dt, 0.004);
        state.vy = (ny - state.y) / Math.max(dt, 0.004);
        state.x = nx;
        state.y = ny;

        // 距离约束：既保持最小间距避免撞宿主，又不超出绳长
        let rdx = state.x - ax;
        let rdy = state.y - ay;
        let rDist = Math.hypot(rdx, rdy);
        const minLen = 8.5 * sMul;
        if (rDist < 0.01) {
          rdx = backDirX; rdy = backDirY; rDist = 1;
        }
        if (rDist > ropeLen) {
          const pull = ropeLen / rDist;
          state.x = ax + rdx * pull;
          state.y = ay + rdy * pull;
          rDist = ropeLen;
        } else if (rDist < minLen) {
          const push = minLen / rDist;
          state.x = ax + rdx * push;
          state.y = ay + rdy * push;
          rDist = minLen;
        }

        // 严格钳制在 maxRadius * 0.80 平台安全区内
        const [clX, clY] = clampToArena(state.x, state.y, maxR);
        state.x = clX;
        state.y = clY;

        // 高度随波轻浮，大鱼跃水或高速甩弧时本体也被拽高贴浪滑行
        const tautness = clamp((rDist - ropeLen * 0.65) / Math.max(1, ropeLen * 0.35), 0, 1);
        state.ropeTension = clamp(tautness * 0.75 + clamp(hostSpd / 28, 0, 1) * 0.35 + (isBoost ? 0.25 : 0), 0, 1);
        const targetZ = (2.1 + Math.sin(time * 3.4 * gFreq) * 0.55 + (isBoost ? 2.4 : 0) + Math.max(0, az - 5.5) * 0.55) * sMul;
        state.z = lerp(state.z, targetZ, expSmooth(dt, 7.5));

        // 朝向始终微对着吸盘/来渣方向，方便大口接吃碎渣
        const lookX = ax - state.x;
        const lookY = ay - state.y;
        const desiredYaw = Math.hypot(lookX, lookY) > 0.3 ? Math.atan2(-lookX, lookY) : hostYaw;
        state.yaw = wrapAngle(state.yaw + wrapAngle(desiredYaw - state.yaw) * expSmooth(dt, 8.5));

        // 肉绳下垂弧 sag 与绷直微颤 jitter
        const targetSag = lerp(3.4, 0.25, state.ropeTension) * sMul;
        const targetJitter = state.ropeTension > 0.78 ? (0.14 + (state.ropeTension - 0.78) * 0.8) : 0.03;
        state.lineSag = lerp(state.lineSag, targetSag, expSmooth(dt, 10));
        state.lineJitter = lerp(state.lineJitter, targetJitter, expSmooth(dt, 10));
        state.jitterPhase = (state.jitterPhase + dt * (state.ropeTension > 0.75 ? 34 : 12)) % (TAU * 16);

        // 周期大鱼散落碎渣 -> 水7张大口接吃
        state.crumbCd -= dt;
        if (state.crumbCd <= 0) {
          state.crumbCd = isBoost ? 1.15 : (isIdle ? 2.6 : 1.85);
          state.gulpTimer = 0.72;
          emitFoodCrumbs(vfx, ax, ay, az, state.x, state.y, state.z, sMul);
        }
        if (state.gulpTimer > 0) state.gulpTimer = Math.max(0, state.gulpTimer - dt);

        // 拖行水面尾波涟漪
        state.wakeCd -= dt;
        const riderSpd = Math.hypot(state.vx, state.vy);
        if (vfx && habitat && habitat.isWater && state.wakeCd <= 0 && (riderSpd > 3.5 || isBoost)) {
          state.wakeCd = isBoost ? 0.14 : 0.24;
          EnvFeedback.emitWaterWake(vfx, habitat, state.x, state.y, state.yaw, 3.8 * sMul, isBoost ? 0.85 : 0.5);
        }
      }

      const instance = {
        def: Water7Def,
        cachePrefix: riderId,
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
          for (const a of riderRecolorAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          releaseCurrentHost(null, false);
          state.x = homeX;
          state.y = homeY - 14;
          state.z = 2.2;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.shadowScale = 0;
          state.sortBias = 0;
          state.hasHostEnv = false;
          state.lastHost = null;
          state.mode = 'tethered';
          state.modeT = 0;
          state.attachSide = 1;
          state.suckerX = homeX + 4;
          state.suckerY = homeY + 6;
          state.suckerZ = 5.2;
          state.suckerYaw = homeYaw;
          state.lineSag = 2.4;
          state.lineJitter = 0.04;
          state.jitterPhase = 0;
          state.ropeTension = 0.45;
          state.gulpTimer = 0;
          state.crumbCd = 0.7;
          state.wakeCd = 0.15;
          state.disturbCd = 1.6;

          soloFish.x = homeX;
          soloFish.y = homeY + 8;
          soloFish.z = 2.0;
          soloFish.vx = 0;
          soloFish.vy = 0;
          soloFish.yaw = homeYaw;
          soloFish.orbitAng = 0.35;
          soloFish.tailPhase = 0;
          soloFish.tailYaw = 0;
          soloFish.surgeTimer = 1.8;
          soloFish.surgeActive = false;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const speedMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const action = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const isIdle = action === 'idle';
          const isTowDemo = action === 'tow';
          const allActors = (eco && Array.isArray(eco.allActors)) ? eco.allActors : [];
          const selfRef = (eco && eco.self) || instance;
          const maxR = ((eco && eco.maxRadius) || 48) * 0.80;

          // 探测水域大宿主（优先 水5 / 水4 / 水3 / 海1）
          let hostAvailable = false;
          if (state.host && allActors.includes(state.host)) {
            hostAvailable = true;
          } else {
            const probe = MountSystem.findMountHost(selfRef, allActors, {
              riderId,
              preferredCodes: ['水5', '水4', '水3', '海1'],
              minFootRadius: 7
            });
            hostAvailable = !!probe;
          }

          if (state.host && !allActors.includes(state.host)) {
            releaseCurrentHost(allActors, false);
            if (hostAvailable) {
              state.mode = 'seek';
              state.modeT = 0;
            }
          }

          if (hostAvailable && !state.hasHostEnv) {
            state.hasHostEnv = true;
            state.mode = 'seek';
            state.modeT = 0;
          } else if (!hostAvailable && state.hasHostEnv) {
            releaseCurrentHost(allActors, false);
            state.hasHostEnv = false;
            state.mode = 'tethered';
            state.modeT = 0;
          }

          state.modeT += dt * speedMul;
          state.disturbCd -= dt;

          // =================================================================
          // 分支 A：多怪同台模式（咬住宿主鳍根/尾侧 + 后方长肉绳拖行画弧）
          // =================================================================
          if (state.hasHostEnv) {
            if (state.mode === 'seek') {
              state.sortBias = 0;
              const found = MountSystem.findMountHost(selfRef, allActors, {
                riderId,
                preferredCodes: ['水5', '水4', '水3', '海1'],
                minFootRadius: 7
              });
              if (found && MountSystem.claimMount(riderId, found.host, found.slot)) {
                state.host = found.host;
                state.slot = found.slot;
                state.attachSide = (hash2i(Math.floor(time * 10), 17, 43) > 0.5) ? 1 : -1;
                state.mode = 'tethered';
                state.modeT = 0;
                notifyHostDisturb(state.host, riderId, 0.5);
              } else {
                // 原地轻浮等待宿主
                const [clX, clY] = clampToArena(state.x, state.y, maxR);
                state.x = clX;
                state.y = clY;
                state.z = (2.0 + Math.sin(time * 3.0) * 0.5) * sMul;
                state.suckerX = state.x - Math.sin(state.yaw) * 6.0 * sMul;
                state.suckerY = state.y + Math.cos(state.yaw) * 6.0 * sMul;
                state.suckerZ = state.z + 1.0 * sMul;
                state.suckerYaw = state.yaw;
              }
            } else {
              const hostFootR = (state.host.def.footRadius || 12) * (state.host.scaleMul || 1);
              // 吸盘咬住宿主鳍根/尾侧位置
              const finOff = {
                lx: state.attachSide * clamp(hostFootR * 0.42, 4.2, 8.2),
                ly: -clamp(hostFootR * 0.46, 4.5, 9.0),
                lz: 0.9
              };
              const pose = MountSystem.getMountWorldPose(state.host, state.slot, finOff);
              if (!pose || !pose.alive) {
                releaseCurrentHost(allActors, true);
                state.mode = 'seek';
                state.modeT = 0;
              } else {
                state.sortBias = Math.max(hostFootR * 1.15, 16);
                const [ax, ay] = clampToArena(pose.x, pose.y, maxR);
                state.suckerX = ax;
                state.suckerY = ay;
                state.suckerZ = Math.max(1.8 * sMul, pose.z);
                state.suckerYaw = pose.yaw;

                const hvx = state.host.state.vx || 0;
                const hvy = state.host.state.vy || 0;
                const hostSpd = Math.hypot(hvx, hvy);
                const isBoost = isTowDemo || hostSpd > 14 || (state.host.state.z || 0) > 4.5;

                stepTetherPhysics(
                  dt, time, state.suckerX, state.suckerY, state.suckerZ,
                  pose.yaw, hvx, hvy, isBoost, isIdle,
                  gFreq, flex, sMul, maxR, vfx, habitat
                );

                if (state.disturbCd <= 0) {
                  state.disturbCd = 2.6;
                  notifyHostDisturb(state.host, riderId, 0.35);
                }
              }
            }

            footContacts[0].x = state.x;
            footContacts[0].y = state.y;
            footContacts[0].z = state.z;
            footContacts[0].r = 4.6 * sMul;
            footContacts[1].r = 0;
          } else {
            // ===============================================================
            // 分支 B：独台预览模式（极简潜游大鱼尾鳍配角牵引演示拖行画弧）
            // ===============================================================
            state.sortBias = 0;
            const homeX = (eco && eco.homeX !== undefined) ? eco.homeX : hx0;
            const homeY = (eco && eco.homeY !== undefined) ? eco.homeY : hy0;

            soloFish.surgeTimer += dt * speedMul;
            const surgeCycle = isTowDemo ? 3.2 : 5.4;
            const surgeWindow = isTowDemo ? 1.8 : 1.5;
            const cyclePos = soloFish.surgeTimer % surgeCycle;
            soloFish.surgeActive = !isIdle && cyclePos < surgeWindow;

            const orbitSpd = (isIdle ? 0.36 : (soloFish.surgeActive ? 1.05 : 0.64)) * speedMul;
            soloFish.orbitAng = wrapAngle(soloFish.orbitAng + dt * orbitSpd);

            // 8 字弯弧轨迹，把大鱼转弯甩出长肉绳弧线的美感拉满
            const rx = Math.min(maxR * 0.72, 24.0 * sMul);
            const ry = Math.min(maxR * 0.56, 17.5 * sMul);
            const rawFx = homeX + Math.cos(soloFish.orbitAng) * rx;
            const rawFy = homeY + Math.sin(soloFish.orbitAng * 2.0) * ry * 0.62 + Math.sin(soloFish.orbitAng) * ry * 0.45;
            const [clFx, clFy] = clampToArena(rawFx, rawFy, maxR * 0.88);

            const prevFx = soloFish.x, prevFy = soloFish.y;
            const kFish = expSmooth(dt, soloFish.surgeActive ? 6.5 : 4.2);
            soloFish.x = lerp(soloFish.x, clFx, kFish);
            soloFish.y = lerp(soloFish.y, clFy, kFish);
            soloFish.vx = (soloFish.x - prevFx) / Math.max(dt, 0.004);
            soloFish.vy = (soloFish.y - prevFy) / Math.max(dt, 0.004);

            const fSpd = Math.hypot(soloFish.vx, soloFish.vy);
            if (fSpd > 0.6) {
              const fyaw = Math.atan2(-soloFish.vx, soloFish.vy);
              soloFish.yaw = wrapAngle(soloFish.yaw + wrapAngle(fyaw - soloFish.yaw) * expSmooth(dt, 7.5));
            }

            // 加速冲刺时大鱼微跃破水，拽紧肉绳甩出弧线
            const leapArc = soloFish.surgeActive ? Math.sin((cyclePos / surgeWindow) * Math.PI) * 4.4 : 0;
            soloFish.z = (1.8 + Math.sin(time * 2.2) * 0.45 + leapArc) * sMul;
            soloFish.tailPhase = (soloFish.tailPhase + dt * (soloFish.surgeActive ? 11.5 : 6.4) * gFreq) % TAU;
            soloFish.tailYaw = Math.sin(soloFish.tailPhase) * (soloFish.surgeActive ? 0.52 : 0.34) * flex;

            // 吸盘头牢牢咬在独台大鱼右侧鳍根/尾侧
            const [sx, sy] = localToWorldXY(soloFish.x, soloFish.y, soloFish.yaw, 5.2 * sMul, -4.4 * sMul);
            const [clSx, clSy] = clampToArena(sx, sy, maxR);
            state.suckerX = clSx;
            state.suckerY = clSy;
            state.suckerZ = soloFish.z + 5.2 * sMul;
            state.suckerYaw = soloFish.yaw;

            stepTetherPhysics(
              dt, time, state.suckerX, state.suckerY, state.suckerZ,
              soloFish.yaw, soloFish.vx, soloFish.vy, soloFish.surgeActive, isIdle,
              gFreq, flex, sMul, maxR, vfx, habitat
            );

            footContacts[0].x = state.x;
            footContacts[0].y = state.y;
            footContacts[0].z = state.z;
            footContacts[0].r = 4.6 * sMul;

            footContacts[1].x = soloFish.x;
            footContacts[1].y = soloFish.y;
            footContacts[1].z = soloFish.z;
            footContacts[1].r = 8.8 * sMul;
          }

          sockets.setWorld('sucker', state.suckerX, state.suckerY, state.suckerZ, state.suckerYaw);
          sockets.setWorld('rider', state.x, state.y, state.z + 4.5 * sMul, state.yaw);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? (habitat.waterLevel ?? 2.6) : 2.6;
          const lineColors = (curSkin && curSkin.line) || SKINS[0].line;

          // 1. 独台模式：先画极简潜游大鱼配角（主体 + 独立摆动叉尾）
          if (!state.hasHostEnv) {
            const fishSub = isWater
              ? clamp(EnvFeedback.calcSubmerge(soloFish.z, waterLvl + 1.5 * sMul, 4.5 * sMul, true), 0, 0.55)
              : 0;
            const tYaw = wrapAngle(soloFish.yaw + soloFish.tailYaw);
            const [tjx, tjy] = localToWorldXY(soloFish.x, soloFish.y, soloFish.yaw, 0, SOLO_TAIL_PIVOT.attachY * sMul);
            const [tx, ty] = pivotToWorldXY(tjx, tjy, tYaw, SOLO_TAIL_PIVOT.x * sMul, SOLO_TAIL_PIVOT.y * sMul);

            list.push({
              partKey: 'soloFishTail',
              asset: parts.soloFishTail,
              x: tx,
              y: ty,
              lift: Math.max(0.4, soloFish.z + 0.3 * sMul),
              ro: tYaw,
              bias: -0.35,
              submerge: fishSub
            });
            list.push({
              partKey: 'soloFishBody',
              asset: parts.soloFishBody,
              x: soloFish.x,
              y: soloFish.y,
              lift: Math.max(0.4, soloFish.z),
              ro: soloFish.yaw,
              bias: -0.20,
              submerge: fishSub
            });
          }

          // 2. 末端放大显眼的暗红吸盘头（咬在宿主鳍根/尾侧，高 bias 绝不埋没）
          list.push({
            partKey: 'suckerHead',
            asset: parts.suckerHead,
            x: state.suckerX,
            y: state.suckerY,
            lift: Math.max(0.6, state.suckerZ),
            ro: state.suckerYaw,
            bias: state.hasHostEnv ? 2.15 : 1.55,
            submerge: 0
          });

          // 3. 极醒目的 2px 粗亮粉白长肉绳（带暗红描边与下垂弧 sag，直接走 kind: 'line'）
          const [mouthX, mouthY] = localToWorldXY(state.x, state.y, state.yaw, 0, 4.2 * sMul);
          list.push({
            kind: 'line',
            partKey: 'tetherCord',
            x0: state.suckerX,
            y0: state.suckerY,
            z0: Math.max(1.2, state.suckerZ + 2.8 * sMul),
            x1: mouthX,
            y1: mouthY,
            z1: Math.max(1.2, state.z + 4.3 * sMul),
            sag: state.lineSag,
            jitter: state.lineJitter,
            jitterPhase: state.jitterPhase,
            segments: 14,
            color: lineColors.main,
            outlineColor: lineColors.outline,
            widthArtPx: 2,
            opacity: 0.98,
            bias: state.hasHostEnv ? 1.85 : 1.35
          });

          // 4. 拳头大圆胖亮橙红/明黄斑纹小身子（闭口拖行 / 大口吞渣两档无损切换）
          const isGulping = state.gulpTimer > 0;
          const bodyKey = isGulping ? 'riderGulp' : 'riderClosed';
          const riderSub = isWater
            ? clamp(EnvFeedback.calcSubmerge(state.z, waterLvl + 0.6 * sMul, 4.2 * sMul, true), 0, 0.35)
            : 0;
          list.push({
            partKey: bodyKey,
            asset: parts[bodyKey],
            x: state.x,
            y: state.y,
            lift: Math.max(0.5, state.z),
            ro: state.yaw,
            bias: state.hasHostEnv ? 2.05 : 1.45,
            submerge: riderSub
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Water7Def.id,
            code: Water7Def.code,
            name: Water7Def.name,
            template: 'M36',
            noHost: true,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            mode: state.mode,
            hasHostEnv: state.hasHostEnv,
            footRadius: 4.8,
            headZ: 11,
            centerZ: 5,
            blocks: Water7Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Water7Def);
})(window.PixelWorkshop);
