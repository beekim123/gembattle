'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // M15 · 陆行八爪（潮汐滩涂多触手攀爬软体 · 辐射对称多触手标杆 · v3 精制）
  //
  // 【前置调研与三维坐标预算记录】
  // 1. 生物原型与运动学调研：
  //    - 原型参考潮间带可短距陆行的章鱼（如 Abdopus aculeatus、Octopus vulgaris）：
  //      无固定前后躯干骨架，柔软饱满的圆顶头囊（Mantle）坐落于辐射状口膜基盘上方，
  //      8 条柔韧触手按 45° 均布于基盘四周（±22.5°、±67.5°、±112.5°、±157.5°），
  //      双眼生于头囊前侧微凸眼丘上，带标志性横向一字瞳孔，可独立转动扫视目标；
  //    - 区别于鱼尾跟随拖拽，本脚本自建带相邻节最大转角约束的 3D FABRIK 触手求解器
  //      （solveTentacleFABRIK，3 次迭代，相邻节水平夹角上限 0.54 rad ≈ 31° 防折死角与面条乱甩），
  //      驱动真实「探手抓地（probe）-> 发力拉身（pull）-> 停顿观察（observe）」脉冲蠕爬：
  //      前方 2~3 条触手先抬弧前探并把尖端锚死在世界坐标浅滩上 -> 身体沿前锚点合力方向拉近并伴随
  //      软体呼吸微伏 -> 后方触手卷曲离地跟进补位 -> 停步时 8 条触手自然舒展盘绕四周、尖端轻卷。
  // 2. 三维几何坐标预算表（单部件严格 <= 40 格，总展开体宽 ~36 格，色表 34 色 <= 48）：
  //    - mantleRest / mantleBreath（2 档无损烘焙饱满圆顶头囊 + 口膜基盘）：18×19×16，
  //      口膜底盘半径 6.8 格，世界 Z=[2.2, 17.5]，头囊带高对比斑点/环纹；
  //    - eyeL / eyeR（2 只独立可转动横瞳大眼）：6×6×6，挂点 (±3.5, +4.3, +6.6) 深嵌前额眼丘 1.8 格，
  //      eyeGlint 严禁进 glowKeys；
  //    - armSeg0 ~ armSeg4（5 节左右对称渐变柔韧触手，8 条触手共用贴图，渲染器仅烘 0~180°）：
  //      节距 segLen = 2.65 格，总臂展 13.25 格；起点挂点半径 3.8 格（深嵌 6.8 格口膜内 3.0 格 = 100% 嵌入）；
  //      胶囊长度 5.6 / 5.4 / 5.0 / 5.0 / 4.6 格，相邻重叠率 47% ~ 53% >= 45% 防串珠，内侧带浅色吸盘；
  //    - 滩涂伴生交互物（3 枚立体彩壳海螺与圆贝，独立注册进 parts，不随本体换色）：
  //      conchSpiral（彩纹螺旋海螺 9×11×7）、scallopShell（珊瑚粉圆扇贝 10×9×5）、turbanShell（碧斑圆螺 9×9×7）。
  // 3. 现有内核盘点：
  //    - 直接复用 core/voxel.js、core/solvers.js（SpringDamper1D / SocketTracker）、
  //      core/behaviors.js（EnvFeedback）与 core/renderer.js；
  //    - 在本脚本内独立实现 3D FABRIK 转角约束求解器与脉冲拉拽步态状态机，零改动 core/。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 主体肉质头囊与触手背侧（默认：珊瑚橘斑 · 滩涂经典）
      bodyDark:    '#9c381f',
      bodyMid:     '#df6238',
      bodyHi:      '#ff9461',
      // 头囊与触手高对比斑点 / 环纹（蓝环款会切成高对比电蓝环）
      spotDark:    '#5e1d14',
      spotMid:     '#8f2d1e',
      spotHi:      '#c44a31',
      // 斑点亮芯 / 细环点缀（默认暖杏亮斑，蓝环款为亮青环芯）
      ringDark:    '#d98b59',
      ringMid:     '#f5ba84',
      ringHi:      '#ffe2bd',
      // 触手腹侧柔软浅肌
      bellyDark:   '#b86d52',
      bellyMid:    '#e6a385',
      bellyHi:     '#ffd2ba',
      // 内侧吸盘点缀（高辨识浅米吸盘粒）
      suckerDark:  '#c7a691',
      suckerMid:   '#f0d6c2',
      suckerHi:    '#fff3e6',
      // 横瞳大眼（eyeGlint 严禁进 glowKeys）
      eyeLidDark:  '#8a301a',
      eyeLidMid:   '#c9532e',
      eyeLidHi:    '#f28352',
      eyeSclera:   '#f7e4b5',
      eyeIris:     '#d99b38',
      eyePupil:    '#100d12',
      eyeGlint:    '#fffbf0',
      // 伴生交互物 1：彩纹螺旋海螺（不随皮肤换色）
      conchDark:   '#a34b3b',
      conchMid:    '#e07a5f',
      conchHi:     '#f7b799',
      conchStripe: '#fff0d9',
      // 伴生交互物 2：圆扇贝（不随皮肤换色）
      scallopDark: '#9e536d',
      scallopMid:  '#d9809c',
      scallopHi:   '#fabcd0',
      // 伴生交互物 3：碧斑圆螺（不随皮肤换色）
      turbanDark:  '#246966',
      turbanMid:   '#46a399',
      turbanHi:    '#8ce0d2',
      shellCore:   '#2b1b1d'
    },
    glowKeys: [],
    parts: [
      'body', 'spot', 'ring', 'belly', 'sucker', 'eyelid', 'eye',
      'conch', 'scallop', 'turban'
    ],
    noCrease: [
      ['body', 'spot'], ['body', 'ring'], ['body', 'belly'],
      ['body', 'eyelid'], ['belly', 'sucker'], ['spot', 'ring'],
      ['eyelid', 'eye']
    ],
    materials: {
      body:    ['bodyDark',    'bodyMid',    'bodyHi'],
      spot:    ['spotDark',    'spotMid',    'spotHi'],
      ring:    ['ringDark',    'ringMid',    'ringHi'],
      belly:   ['bellyDark',   'bellyMid',   'bellyHi'],
      sucker:  ['suckerDark',  'suckerMid',  'suckerHi'],
      eyelid:  ['eyeLidDark',  'eyeLidMid',  'eyeLidHi'],
      conch:   ['conchDark',   'conchMid',   'conchHi'],
      scallop: ['scallopDark', 'scallopMid', 'scallopHi'],
      turban:  ['turbanDark',  'turbanMid',  'turbanHi']
    },
    protectedParts: ['eye']
  });

  // 4 套零重建模换色皮肤（严守用词规范）
  const SKINS = [
    {
      id: 'coral_orange',
      name: '珊瑚橘斑（滩涂经典）',
      dot: '#df6238',
      outline: '#210e0a',
      pal: {},
      fx: { dropA: '#e8f8f5', dropB: '#8fd9d4', ringRGB: '146, 224, 218' }
    },
    {
      id: 'blue_ring',
      name: '蓝环海靛（浅礁款）',
      dot: '#2b5e8f',
      outline: '#091524',
      pal: {
        bodyDark:   '#1e3f66', bodyMid:   '#35689c', bodyHi:   '#629cd1',
        spotDark:   '#0f2038', spotMid:   '#1a3559', spotHi:   '#295182',
        ringDark:   '#29a8d9', ringMid:   '#5ce1ff', ringHi:   '#c7f8ff',
        bellyDark:  '#5c7994', bellyMid:  '#8eb0cc', bellyHi:  '#c7e0f2',
        suckerDark: '#87a2b8', suckerMid: '#c4dced', suckerHi: '#ebf6ff',
        eyeLidDark: '#193557', eyeLidMid: '#2c5887', eyeLidHi: '#5287bd',
        eyeSclera:  '#f5e8a6', eyeIris:   '#d4a92c'
      },
      fx: { dropA: '#e8faff', dropB: '#7ad8f5', ringRGB: '112, 222, 248' }
    },
    {
      id: 'ink_violet',
      name: '墨紫暗斑（深潭款）',
      dot: '#5c3473',
      outline: '#12081a',
      pal: {
        bodyDark:   '#341b47', bodyMid:   '#5c3478', bodyHi:   '#8c5cab',
        spotDark:   '#1c0d29', spotMid:   '#2f1742', spotHi:   '#4a2666',
        ringDark:   '#8c5385', ringMid:   '#c484ba', ringHi:   '#f0c2e8',
        bellyDark:  '#694b78', bellyMid:  '#9977a8', bellyHi:  '#cfb3db',
        suckerDark: '#8c7896', suckerMid: '#c2aecb', suckerHi: '#ebe0f0',
        eyeLidDark: '#2b163b', eyeLidMid: '#4c2a66', eyeLidHi: '#7a4d96',
        eyeSclera:  '#f7dfa8', eyeIris:   '#de8d3c'
      },
      fx: { dropA: '#f0e8fa', dropB: '#b599d9', ringRGB: '176, 152, 222' }
    },
    {
      id: 'pale_jade',
      name: '苍白浅碧（溶洞水滩款）',
      dot: '#8ec7ba',
      outline: '#122422',
      pal: {
        bodyDark:   '#56827c', bodyMid:   '#8cc2b8', bodyHi:   '#c4ebe2',
        spotDark:   '#2d5452', spotMid:   '#467874', spotHi:   '#6ea39e',
        ringDark:   '#99bfb0', ringMid:   '#cfe8dc', ringHi:   '#f2fcf7',
        bellyDark:  '#859e99', bellyMid:  '#b8cfc9', bellyHi:  '#e4f2ee',
        suckerDark: '#a3b5b0', suckerMid: '#d5e3de', suckerHi: '#f4faf8',
        eyeLidDark: '#476e69', eyeLidMid: '#76ab9f', eyeLidHi: '#add9cf',
        eyeSclera:  '#faf0c8', eyeIris:   '#c9a24b'
      },
      fx: { dropA: '#eefcf8', dropB: '#9fe0d2', ringRGB: '150, 232, 214' }
    }
  ];

  // =========================================================================
  // 1. 饱满圆顶肉质头囊 + 辐射口膜基盘（2 档无损烘焙呼吸：rest / breath，18×19×16）
  //    正面 +Y，口膜底盘半径 6.8 格深覆 8 条触手根部，头囊微向后仰，带高对比斑点与亮环
  // =========================================================================
  function buildMantle(makeCanvas, isBreath) {
    const W = 18, D = 19, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    const domeRx = isBreath ? 7.2 : 6.7;
    const domeRy = isBreath ? 7.6 : 7.2;
    const domeRz = isBreath ? 5.2 : 5.7;
    const domeCz = isBreath ? 8.1 : 8.7;

    // 9 处对称与自然错落的高对比斑点与亮环中心（覆盖头囊顶冠、前额侧与侧背，45° 各角度清晰可见）
    const spots = [
      { x:  0.0, y:  0.6, z: 13.6, r: 2.55 },
      { x: -4.0, y:  1.6, z: 11.0, r: 2.25 },
      { x:  4.0, y:  1.6, z: 11.0, r: 2.25 },
      { x:  0.0, y: -4.4, z: 12.4, r: 2.45 },
      { x: -4.8, y: -2.0, z: 10.2, r: 2.35 },
      { x:  4.8, y: -2.0, z: 10.2, r: 2.35 },
      { x: -3.2, y: -5.4, z:  8.0, r: 2.00 },
      { x:  3.2, y: -5.4, z:  8.0, r: 2.00 },
      { x:  0.0, y:  3.4, z: 10.6, r: 1.80 }
    ];

    m.fillAABB(-8.5, 8.5, -9.0, 8.8, 0, H - 1, (x, y, z, X, Y) => {
      // 1) 辐射口膜底盘（圆润软裙，把 8 条触手根部 100% 嵌进内部）
      const ang = Math.atan2(Y, X);
      const webScallop = 1.0 + Math.cos(ang * 8) * 0.05;
      const dWeb = (Math.hypot(X / (6.85 * webScallop), Y / (6.85 * webScallop), (z - 2.6) / 2.8) - 1.0) * 3.8;

      // 2) 柔软颈收束过渡带
      const dNeck = (Math.hypot(X / 5.4, (Y - 0.3) / 5.5, (z - 5.2) / 2.6) - 1.0) * 3.5;

      // 3) 饱满微后仰圆顶头囊（主视觉剪影）
      const yShift = (z - 7.0) * -0.18; // 越高越微微后倾，呈现真实章鱼软囊垂坠感
      const dDome = (Math.hypot(X / domeRx, (Y + 1.15 - yShift) / domeRy, (z - domeCz) / domeRz) - 1.0) * 5.6;

      // 4) 前额左右双微凸眼丘基座（承托两只可转动横瞳大眼）
      const dBrowL = (Math.hypot((X + 3.4) / 2.6, (Y - 3.9) / 2.4, (z - 6.6) / 2.5) - 1.0) * 2.4;
      const dBrowR = (Math.hypot((X - 3.4) / 2.6, (Y - 3.9) / 2.4, (z - 6.6) / 2.5) - 1.0) * 2.4;

      let d = smin(smin(dWeb, dNeck, 1.5), dDome, 1.9);
      d = smin(d, smin(dBrowL, dBrowR, 0.8), 1.1);
      if (d > 0) return;

      // 底部软腹肌着色
      if (z <= 1) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
        return;
      }

      // 头囊高对比斑点与亮环纹路
      let useRing = false;
      let useSpot = false;
      if (z >= 5) {
        for (let i = 0; i < spots.length; i++) {
          const sp = spots[i];
          const ds = Math.hypot(X - sp.x, Y - sp.y, (z - sp.z) * 1.1);
          if (ds < sp.r * 0.56) {
            useRing = true;
            break;
          } else if (ds < sp.r) {
            useSpot = true;
          }
        }
      }

      if (useRing) {
        m.setRaw(x, y, z, mat('ring'), partId.ring);
      } else if (useSpot) {
        m.setRaw(x, y, z, mat('spot'), partId.spot);
      } else if (z <= 2 && Math.hypot(X, Y) > 4.6) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else {
        m.setRaw(x, y, z, mat('body'), partId.body);
      }
    });

    // 侧后方小呼吸漏斗管（Siphon，增加软体海洋生物解剖质感）
    m.paintCapsule(4.6, -2.0, 3.8, 6.4, -3.2, 4.3, 1.15, 0.78, mat('belly'), partId.belly, false);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.4, headZ: 15, centerZ: 7 });
  }

  // =========================================================================
  // 2. 独立可转动横瞳大眼（6×6×6，正面 +Y，eyeGlint 严禁进 glowKeys）
  // =========================================================================
  function buildEye(makeCanvas) {
    const W = 6, D = 6, H = 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 饱满眼睑肉球
    m.paintEllipsoid(0, -0.3, 2.6, 2.35, 2.35, 2.30, mat('eyelid'), partId.eyelid, true);
    m.despeckle();
    m.applyArtShading(true);

    // 刻画正面 +Y 琥珀虹膜 + 标志性章鱼一字横瞳 + 清晰亮斑（不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const fy = Math.round(hd + 1.8);
    const cx = Math.round(hw);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const z = 3 + dz;
        let kId = keyToId.eyeSclera;
        if (dz === 0) kId = keyToId.eyePupil;         // 横向一字瞳孔
        else if (Math.abs(dx) === 1) kId = keyToId.eyeIris;
        if (dx === -1 && dz === 1) kId = keyToId.eyeGlint;
        m.setRaw(cx + dx, fy, z, kId, partId.eye);
      }
    }
    // 两侧眼角延伸 1 格虹膜增强大眼圆润感
    m.setRaw(cx - 2, fy - 1, 3, keyToId.eyeIris, partId.eye);
    m.setRaw(cx + 2, fy - 1, 3, keyToId.eyeIris, partId.eye);

    return m.toStripAsset(makeCanvas, { footRadius: 2.3, headZ: 5, centerZ: 3 });
  }

  // =========================================================================
  // 3. 柔韧渐变触手节段（5 档由粗到细，全部左右对称沿 +Y 指向尖端，渲染器只烘 0~180°）
  //    节距 2.65 格，胶囊长 4.6~5.6 格（重叠率 47%~53% 防串珠），腹侧与两侧带浅色吸盘粒
  // =========================================================================
  function buildArmSeg(makeCanvas, cfg) {
    const { W, D, H, y0, y1, r0, r1, z0, z1, hasSpot, suckerCount } = cfg;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 1) 主体柔韧触手胶囊（背侧主肌）
    m.paintCapsule(0, y0, z0, 0, y1, z1, r0, r1, mat('body'), partId.body, true);

    // 2) 腹侧浅色软肌
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (let z = 0; z < H; z++) {
      for (let y = 0; y < D; y++) {
        for (let x = 0; x < W; x++) {
          if (!m.getId(x, y, z)) continue;
          const Y = y - hd;
          const u = clamp((Y - y0) / Math.max(0.1, y1 - y0), 0, 1);
          const zMid = lerp(z0, z1, u);
          if (z < zMid - 0.35) {
            m.setRaw(x, y, z, mat('belly'), partId.belly);
          } else if (hasSpot && z >= zMid + 0.55 && Math.abs(x - hw) <= 0.8 && Math.abs(Y) <= 0.95) {
            m.setRaw(x, y, z, mat('spot'), partId.spot);
          }
        }
      }
    }

    // 3) 触手腹侧边缘双排浅色吸盘点缀（左右对称，保持 sym=true 节省图集）
    for (let s = 0; s < suckerCount; s++) {
      const u = suckerCount === 1 ? 0.5 : (0.22 + (s / (suckerCount - 1)) * 0.56);
      const sy = lerp(y0, y1, u);
      const sr = lerp(r0, r1, u);
      const sz = Math.max(0.6, lerp(z0, z1, u) - sr * 0.55);
      const sxOff = Math.max(0.65, sr * 0.62);
      const suR = Math.max(0.55, sr * 0.38);
      m.paintEllipsoid(-sxOff, sy, sz, suR, suR, suR * 0.85, mat('sucker'), partId.sucker, true);
      m.paintEllipsoid( sxOff, sy, sz, suR, suR, suR * 0.85, mat('sucker'), partId.sucker, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(r0, 1.4), headZ: H, centerZ: Math.round(H * 0.5) });
  }

  // =========================================================================
  // 4. 伴生交互物：滩涂 3 枚立体体素彩壳海螺与圆贝（独立注册进 parts）
  // =========================================================================
  function buildConchSpiral(makeCanvas) {
    const W = 9, D = 11, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 螺旋渐尖海螺体（后尖前阔）
    m.paintCapsule(0, -4.0, 2.2, 0,  0.4, 3.2, 0.85, 2.85, mat('conch'), partId.conch, true);
    m.paintEllipsoid(0, 1.5, 3.0, 3.1, 2.8, 2.6, mat('conch'), partId.conch, true);
    // 螺口微翘外唇
    m.paintCapsule(1.6, 2.6, 2.5, 2.4, 3.8, 2.2, 1.0, 0.75, mat('conch'), partId.conch, true);

    m.despeckle();
    m.applyArtShading(true);

    // 彩壳暖白螺旋条纹 + 螺口暗腔
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (let z = 2; z < H; z++) {
      for (let y = 0; y < D; y++) {
        for (let x = 0; x < W; x++) {
          if (!m.getId(x, y, z)) continue;
          const X = x - hw, Y = y - hd;
          const spiralBand = Math.sin((Y * 1.45) + X * 0.55);
          if (spiralBand > 0.62 && z >= 3) {
            m.setRaw(x, y, z, keyToId.conchStripe, partId.conch);
          }
        }
      }
    }
    m.setRaw(Math.round(hw + 0.5), Math.round(hd + 3.4), 2, keyToId.shellCore, partId.conch);
    m.setRaw(Math.round(hw + 1.2), Math.round(hd + 3.2), 3, keyToId.shellCore, partId.conch);

    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 6, centerZ: 3 });
  }

  function buildScallopShell(makeCanvas) {
    const W = 10, D = 9, H = 5;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-4.5, 4.5, -4.0, 4.0, 0, H - 1, (x, y, z, X, Y) => {
      // 扇形双壳（后铰合部窄，前缘宽圆带放射肋纹）
      const u = clamp((Y + 3.2) / 6.6, 0, 1);
      const halfW = lerp(1.6, 4.2, Math.pow(u, 0.68));
      if (Math.abs(X) > halfW || Y < -3.4 || Y > 3.6) return;
      const edgeR = Math.hypot(X / (halfW + 0.35), (Y - 0.2) / 3.6);
      if (edgeR > 1.0) return;
      const rib = Math.cos(Math.atan2(X, Y + 4.2) * 14) * 0.35;
      const maxZ = 1.1 + (1 - edgeR * 0.72) * 2.5 + rib;
      if (z > maxZ) return;
      m.setRaw(x, y, z, mat('scallop'), partId.scallop);
    });
    m.despeckle();
    m.applyArtShading(true);
    // 扇贝顶放射白肋点缀
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (const rx of [-2, 0, 2]) {
      m.setRaw(Math.round(hw + rx), Math.round(hd + 1.2), 3, keyToId.conchStripe, partId.scallop);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 4, centerZ: 2 });
  }

  function buildTurbanShell(makeCanvas) {
    const W = 9, D = 9, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 圆润碧壳海螺（主螺室 + 顶部旋尖）
    m.paintEllipsoid(0, 0.2, 2.5, 3.2, 3.2, 2.4, mat('turban'), partId.turban, true);
    m.paintEllipsoid(-0.5, -0.6, 4.4, 2.0, 2.0, 1.5, mat('turban'), partId.turban, true);
    m.paintEllipsoid(-0.8, -0.8, 5.4, 1.0, 1.0, 0.9, mat('turban'), partId.turban, true);
    m.despeckle();
    m.applyArtShading(true);
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    // 珍珠白斑点缀
    m.setRaw(Math.round(hw + 1.5), Math.round(hd + 1.0), 4, keyToId.conchStripe, partId.turban);
    m.setRaw(Math.round(hw - 1.6), Math.round(hd + 0.8), 4, keyToId.conchStripe, partId.turban);
    m.setRaw(Math.round(hw + 0.2), Math.round(hd - 1.5), 5, keyToId.conchStripe, partId.turban);
    m.setRaw(Math.round(hw + 2.2), Math.round(hd + 1.8), 2, keyToId.shellCore, partId.turban);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 5. 辐射对称 8 触手配置 + 带转角约束的 3D FABRIK 求解器
  //    8 条触手沿口膜基盘每 45° 均布，前对夹住双眼（±22.5°），绝不挡脸
  // =========================================================================
  const ARM_COUNT = 8;
  const SEG_COUNT = 5;           // 5 节（6 个节点）
  const NODE_COUNT = SEG_COUNT + 1;
  const BASE_SEG_LEN = 2.65;     // 总臂展 13.25 格，展开跨度 ~36 格
  const ROOT_RADIUS = 3.85;      // 深嵌 6.85 格口膜基盘内 3.0 格（100% 嵌入防分离）
  const MAX_JOINT_ANG = 0.54;    // 相邻节最大水平折角 ~31°，杜绝锐角死折或面条甩动

  // 基准辐射方位角（相对本体正面 +Y，0 弧度为正前 +Y，逆时针/顺时针对称分布）
  const ARM_SPECS = [
    { id: 0, localAng: -0.39, curlSign: -1, phase: 0.0 },  // 前左
    { id: 1, localAng:  0.39, curlSign:  1, phase: 0.9 },  // 前右
    { id: 2, localAng: -1.18, curlSign: -1, phase: 1.8 },  // 侧前左
    { id: 3, localAng:  1.18, curlSign:  1, phase: 2.7 },  // 侧前右
    { id: 4, localAng: -1.96, curlSign:  1, phase: 3.6 },  // 侧后左
    { id: 5, localAng:  1.96, curlSign: -1, phase: 4.5 },  // 侧后右
    { id: 6, localAng: -2.75, curlSign:  1, phase: 5.3 },  // 后左
    { id: 7, localAng:  2.75, curlSign: -1, phase: 6.1 }   // 后右
  ];

  // 带相邻节最大转角限制的 3D FABRIK 触手求解器
  function solveTentacleFABRIK(nodes, rootX, rootY, rootZ, rootDirAng, tgtX, tgtY, tgtZ, segLen, opts) {
    const n = nodes.length;
    const archH = opts.archH || 0;
    const curlBias = opts.curlBias || 0;
    const maxAng = opts.maxAng || MAX_JOINT_ANG;
    const floorZ = opts.floorZ ?? 0.25;

    // 限制目标在最大臂展之内（留 4% 柔韧余量，不拉成死直棍）
    const totalLen = (n - 1) * segLen;
    let dxT = tgtX - rootX, dyT = tgtY - rootY, dzT = tgtZ - rootZ;
    const dT = Math.hypot(dxT, dyT, dzT) || 0.001;
    const maxReach = totalLen * 0.96;
    let goalX = tgtX, goalY = tgtY, goalZ = tgtZ;
    if (dT > maxReach) {
      const k = maxReach / dT;
      goalX = rootX + dxT * k;
      goalY = rootY + dyT * k;
      goalZ = rootZ + dzT * k;
    }

    // 预注入自然弓背拱高与优雅侧卷趋势，避免共线奇点
    const dirX = Math.cos(rootDirAng), dirY = Math.sin(rootDirAng);
    const perpX = -dirY, perpY = dirX;
    nodes[0].x = rootX; nodes[0].y = rootY; nodes[0].z = rootZ;
    for (let i = 1; i < n; i++) {
      const u = i / (n - 1);
      const midArch = Math.sin(u * Math.PI);
      // 柔和向目标插值，保留上一帧连续姿态防抽搐
      const guideX = lerp(rootX, goalX, u) + perpX * midArch * curlBias;
      const guideY = lerp(rootY, goalY, u) + perpY * midArch * curlBias;
      const guideZ = Math.max(floorZ, lerp(rootZ, goalZ, u) + midArch * archH);
      nodes[i].x = lerp(nodes[i].x, guideX, 0.32);
      nodes[i].y = lerp(nodes[i].y, guideY, 0.32);
      nodes[i].z = lerp(nodes[i].z, guideZ, 0.35);
    }

    // 3 轮 FABRIK 迭代（Backward 从尖端往根部拉 + Forward 从根部锁定并施加强转角约束）
    for (let iter = 0; iter < 3; iter++) {
      // Backward
      nodes[n - 1].x = goalX;
      nodes[n - 1].y = goalY;
      nodes[n - 1].z = goalZ;
      for (let i = n - 2; i >= 0; i--) {
        const cur = nodes[i], nxt = nodes[i + 1];
        let vx = cur.x - nxt.x, vy = cur.y - nxt.y, vz = cur.z - nxt.z;
        const d = Math.hypot(vx, vy, vz) || 0.001;
        cur.x = nxt.x + (vx / d) * segLen;
        cur.y = nxt.y + (vy / d) * segLen;
        cur.z = Math.max(floorZ, nxt.z + (vz / d) * segLen);
      }

      // Forward + 相邻节最大转角限制
      nodes[0].x = rootX;
      nodes[0].y = rootY;
      nodes[0].z = rootZ;
      let prevAng = rootDirAng;
      for (let i = 1; i < n; i++) {
        const prev = nodes[i - 1], cur = nodes[i];
        let vx = cur.x - prev.x, vy = cur.y - prev.y, vz = cur.z - prev.z;
        const hDist = Math.hypot(vx, vy);
        let segAng = hDist > 0.02 ? Math.atan2(vy, vx) : prevAng;

        // 根节相对辐射角允许稍宽转角（0.85 rad），中后节严守 maxAng 防折成死角
        const lim = i === 1 ? Math.max(maxAng * 1.45, 0.78) : maxAng;
        const rel = wrapAngle(segAng - prevAng);
        segAng = prevAng + clamp(rel, -lim, lim);

        // 限制 Z 坡度在合理柔韧区间内（不垂直插地或突兀折断）
        const maxDz = segLen * 0.78;
        const clampedDz = clamp(vz, -maxDz, maxDz);
        const horizLen = Math.sqrt(Math.max(0.04, segLen * segLen - clampedDz * clampedDz));

        cur.x = prev.x + Math.cos(segAng) * horizLen;
        cur.y = prev.y + Math.sin(segAng) * horizLen;
        cur.z = Math.max(floorZ, prev.z + clampedDz);
        prevAng = segAng;
      }
    }
  }

  // 滩涂上 3 枚彩壳螺贝默认布局
  const SHELL_LAYOUT = [
    { partKey: 'conchSpiral',  x:  15.5, y:  14.5, yaw:  0.45, restZ: 0.35 },
    { partKey: 'scallopShell', x: -18.5, y:  11.0, yaw: -0.95, restZ: 0.25 },
    { partKey: 'turbanShell',  x:   6.0, y: -19.5, yaw:  1.85, restZ: 0.30 }
  ];

  const Special11Def = {
    id: 'special11_octo',
    code: 'M15',
    status: 'done',
    name: 'M15 · 陆行八爪',
    tag: '辐射8触手抓地攀爬 · 卷螺玩耍',
    summary: 'v3 精制（M15 标杆）：饱满圆顶肉质头囊 + 2 只独立转动横瞳大眼 + 8 条 5 节辐射柔韧触手（带转角约束 3D FABRIK 主动探手锚地拉拽推进）+ 滩涂 3 枚彩壳海螺圆贝卷起端详交互',
    defaultHabitat: 'tideflat',
    footRadius: 11.2,
    ecoWeight: 1.2,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '辐射对称 8 触手主动探手抓地与发力拉身步态',
      '带最大转角限制的 3D FABRIK 柔韧多节触手求解器',
      '饱满圆顶头囊 2 档软体呼吸与独立转动横瞳大眼',
      '滩涂 3 枚立体彩壳海螺与圆贝卷起端详循环'
    ],
    soulHabit: '前方 2~3 条触手轮流前探锚定浅滩 -> 身体随拉拽脉冲前挪并软体微伏 -> 爬近彩壳海螺停稳，单条前触手高重叠卷起海螺举到眼旁左右端详溅出水珠，片刻放回激起涟漪换下一枚继续玩耍',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        mantleRest:   buildMantle(makeCanvas, false),
        mantleBreath: buildMantle(makeCanvas, true),
        eyeL:         buildEye(makeCanvas),
        eyeR:         buildEye(makeCanvas),
        armSeg0: buildArmSeg(makeCanvas, { W: 8, D: 9, H: 7, y0: -2.8, y1: 2.8, r0: 2.25, r1: 1.92, z0: 2.8, z1: 2.6, hasSpot: true,  suckerCount: 2 }),
        armSeg1: buildArmSeg(makeCanvas, { W: 7, D: 9, H: 6, y0: -2.7, y1: 2.7, r0: 1.92, r1: 1.60, z0: 2.5, z1: 2.3, hasSpot: true,  suckerCount: 2 }),
        armSeg2: buildArmSeg(makeCanvas, { W: 6, D: 8, H: 6, y0: -2.5, y1: 2.5, r0: 1.60, r1: 1.30, z0: 2.2, z1: 2.0, hasSpot: false, suckerCount: 2 }),
        armSeg3: buildArmSeg(makeCanvas, { W: 5, D: 8, H: 5, y0: -2.5, y1: 2.5, r0: 1.30, r1: 0.98, z0: 1.9, z1: 1.8, hasSpot: false, suckerCount: 2 }),
        armSeg4: buildArmSeg(makeCanvas, { W: 5, D: 7, H: 5, y0: -2.3, y1: 2.3, r0: 0.98, r1: 0.62, z0: 1.6, z1: 2.1, hasSpot: false, suckerCount: 1 }),
        conchSpiral:  buildConchSpiral(makeCanvas),
        scallopShell: buildScallopShell(makeCanvas),
        turbanShell:  buildTurbanShell(makeCanvas)
      };

      const armSegKeys = ['armSeg0', 'armSeg1', 'armSeg2', 'armSeg3', 'armSeg4'];

      // 螺贝保留多彩原生配色，八爪本体支持 4 套皮肤零重建模换色
      const octoRecolorAssets = Object.keys(parts)
        .filter(k => k !== 'conchSpiral' && k !== 'scallopShell' && k !== 'turbanShell')
        .map(k => parts[k]);

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;

      // 8 条触手运行时状态（含世界锚点、步态阶段与 6 节点 FABRIK 链）
      const arms = ARM_SPECS.map((sp) => ({
        ...sp,
        // 'grounded' 锚定地面 | 'reach' 前探抬臂 | 'follow' 后臂卷曲跟进 | 'grab' 卷螺互动
        role: 'grounded',
        stepT: 1,
        stepDur: 0.42,
        startX: 0, startY: 0, startZ: 0.25,
        anchorX: 0, anchorY: 0, anchorZ: 0.25,
        tipX: 0, tipY: 0, tipZ: 0.25,
        liftArc: 0,
        nodes: Array.from({ length: NODE_COUNT }, () => ({ x: 0, y: 0, z: 1.0 }))
      }));

      // 3 枚滩涂立体彩壳螺贝状态
      const shells = SHELL_LAYOUT.map((cfg, idx) => ({
        idx,
        partKey: cfg.partKey,
        homeX: hx0 + cfg.x,
        homeY: hy0 + cfg.y,
        x: hx0 + cfg.x,
        y: hy0 + cfg.y,
        z: cfg.restZ,
        restZ: cfg.restZ,
        yaw: cfg.yaw,
        baseYaw: cfg.yaw,
        held: false
      }));

      const mantleDipSpring = new SpringDamper1D(0, 82, 7.2);
      const eyeLYawSpring   = new SpringDamper1D(0, 75, 6.8);
      const eyeRYawSpring   = new SpringDamper1D(0, 75, 6.8);

      const state = {
        x: hx0,
        y: hy0,
        z: 2.3,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        // 顶层生态状态机：
        // 'crawl'（脉冲抓地攀爬前往螺贝）| 'play'（单触手卷螺举起端详放回）| 'idleCalm'（待机舒展呼吸）
        mode: 'crawl',
        modeTimer: 0,
        // 脉冲攀爬子周期：'probe'（前手前探锚地）-> 'pull'（拉身前挪）-> 'observe'（停顿观察）
        crawlPhase: 'probe',
        crawlTimer: 0,
        pullOriginX: hx0,
        pullOriginY: hy0,
        pullTargetX: hx0,
        pullTargetY: hy0,
        // 玩螺贝子阶段：'reach' -> 'lift' -> 'examine' -> 'place' -> 'rest'
        playSub: 'reach',
        playTimer: 0,
        targetShellIdx: 0,
        grabArmIdx: 0,
        dripCd: 0,
        breathCompressed: false
      };

      const sockets = new SocketTracker();
      const footContacts = ARM_SPECS.map(() => ({ x: 0, y: 0, z: 0, r: 1.4 }));
      let curSkin = SKINS[0];

      // 计算触手在静止舒展态下的理想世界落点（自然盘绕身体四周）
      function calcRestTip(arm, bx, by, byaw, sMul, reachRatio = 0.84) {
        const worldAng = byaw + Math.PI * 0.5 + arm.localAng;
        const r = (ROOT_RADIUS + SEG_COUNT * BASE_SEG_LEN * reachRatio) * sMul;
        return [bx + Math.cos(worldAng) * r, by + Math.sin(worldAng) * r];
      }

      // 将 8 条触手重置为自然舒展盘绕姿态
      function resetArms(bx, by, bz, byaw, sMul) {
        const segLen = BASE_SEG_LEN * sMul;
        for (let i = 0; i < ARM_COUNT; i++) {
          const arm = arms[i];
          const wAng = byaw + Math.PI * 0.5 + arm.localAng;
          const rx = bx + Math.cos(wAng) * ROOT_RADIUS * sMul;
          const ry = by + Math.sin(wAng) * ROOT_RADIUS * sMul;
          const rz = bz + 1.0 * sMul;
          const [tx, ty] = calcRestTip(arm, bx, by, byaw, sMul, 0.82);
          arm.role = 'grounded';
          arm.stepT = 1;
          arm.startX = arm.anchorX = arm.tipX = tx;
          arm.startY = arm.anchorY = arm.tipY = ty;
          arm.startZ = arm.anchorZ = arm.tipZ = 0.25;
          arm.liftArc = 0;
          for (let j = 0; j < NODE_COUNT; j++) {
            const u = j / (NODE_COUNT - 1);
            arm.nodes[j].x = lerp(rx, tx, u);
            arm.nodes[j].y = lerp(ry, ty, u);
            arm.nodes[j].z = lerp(rz, 0.25, u);
          }
          solveTentacleFABRIK(arm.nodes, rx, ry, rz, wAng, tx, ty, 0.25, segLen, {
            archH: 0.9 * sMul,
            curlBias: arm.curlSign * 1.45 * sMul,
            floorZ: 0.25
          });
        }
      }

      // 安排一次脉冲攀爬的前探抓地（挑前方 2~3 条触手前伸锚定浅滩）
      function beginCrawlProbe(moveDirX, moveDirY, sMul, gFreq, spdMul) {
        state.crawlPhase = 'probe';
        state.crawlTimer = 0;
        const scored = [];
        for (let i = 0; i < ARM_COUNT; i++) {
          const arm = arms[i];
          const wAng = state.yaw + Math.PI * 0.5 + arm.localAng;
          const dot = Math.cos(wAng) * moveDirX + Math.sin(wAng) * moveDirY;
          scored.push({ arm, dot, wAng });
        }
        scored.sort((a, b) => b.dot - a.dot);

        // 最朝向目标的 3 条触手作为前探抓地手，轮流错相伸向目标前方
        const pullStep = clamp(6.8 * spdMul, 4.4, 9.2) * sMul;
        const probeDur = clamp(0.46 / Math.sqrt(gFreq), 0.28, 0.65);

        for (let k = 0; k < scored.length; k++) {
          const { arm, wAng } = scored[k];
          if (k < 3) {
            arm.role = 'reach';
            arm.stepT = -k * 0.14; // 错相前探，告别机械齐步
            arm.stepDur = probeDur;
            arm.startX = arm.tipX;
            arm.startY = arm.tipY;
            arm.startZ = arm.tipZ;
            const spread = (k === 0 ? 0 : (k === 1 ? -1 : 1)) * 0.36;
            const reachAng = Math.atan2(moveDirY, moveDirX) + spread;
            const reachDist = (ROOT_RADIUS + SEG_COUNT * BASE_SEG_LEN * 0.90) * sMul;
            arm.anchorX = state.x + Math.cos(reachAng) * reachDist;
            arm.anchorY = state.y + Math.sin(reachAng) * reachDist;
            arm.anchorZ = 0.25;
            arm.liftArc = 2.4 * sMul;
          } else {
            // 其余触手先稳稳抓地支撑，等拉身后再由后臂跟进
            arm.role = 'grounded';
            arm.stepT = 1;
            arm.anchorX = arm.tipX;
            arm.anchorY = arm.tipY;
            arm.anchorZ = 0.25;
            arm.liftArc = 0;
          }
        }

        state.pullOriginX = state.x;
        state.pullOriginY = state.y;
        state.pullTargetX = state.x + moveDirX * pullStep;
        state.pullTargetY = state.y + moveDirY * pullStep;
      }

      // 拉身阶段开始时，安排后方滞后触手卷曲离地跟进
      function triggerRearFollow(moveDirX, moveDirY, sMul, gFreq) {
        const followDur = clamp(0.48 / Math.sqrt(gFreq), 0.30, 0.68);
        let delayIdx = 0;
        for (let i = 0; i < ARM_COUNT; i++) {
          const arm = arms[i];
          if (arm.role === 'reach') {
            // 前手保持锚死在世界坐标浅滩上发力拉拽身体！
            arm.role = 'grounded';
            arm.stepT = 1;
            arm.tipX = arm.anchorX;
            arm.tipY = arm.anchorY;
            arm.tipZ = 0.25;
            continue;
          }
          const [idealX, idealY] = calcRestTip(arm, state.pullTargetX, state.pullTargetY, state.yaw, sMul, 0.80);
          const lag = Math.hypot(idealX - arm.tipX, idealY - arm.tipY);
          if (lag > 3.6 * sMul) {
            arm.role = 'follow';
            arm.stepT = -delayIdx * 0.12;
            arm.stepDur = followDur;
            arm.startX = arm.tipX;
            arm.startY = arm.tipY;
            arm.startZ = arm.tipZ;
            arm.anchorX = idealX;
            arm.anchorY = idealY;
            arm.anchorZ = 0.25;
            arm.liftArc = 1.9 * sMul;
            delayIdx++;
          }
        }
      }

      // 挑选最靠近目标螺贝的 1 条前触手（0 号前左 或 1 号前右）
      function pickGrabArm(shell) {
        let bestIdx = 0;
        let bestD = Infinity;
        for (const idx of [0, 1]) {
          const arm = arms[idx];
          const wAng = state.yaw + Math.PI * 0.5 + arm.localAng;
          const rx = state.x + Math.cos(wAng) * ROOT_RADIUS;
          const ry = state.y + Math.sin(wAng) * ROOT_RADIUS;
          const d = Math.hypot(shell.x - rx, shell.y - ry);
          if (d < bestD) { bestD = d; bestIdx = idx; }
        }
        return bestIdx;
      }

      const instance = {
        def: Special11Def,
        cachePrefix: `special11_octo_${Math.random().toString(36).slice(2, 7)}`,
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
          for (const a of octoRecolorAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 2.3;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.mode = 'crawl';
          state.modeTimer = 0;
          state.crawlPhase = 'observe';
          state.crawlTimer = 0;
          state.playSub = 'reach';
          state.playTimer = 0;
          state.targetShellIdx = 0;
          state.grabArmIdx = 0;
          state.dripCd = 0;
          state.breathCompressed = false;

          for (let i = 0; i < shells.length; i++) {
            const sh = shells[i];
            sh.homeX = homeX + SHELL_LAYOUT[i].x;
            sh.homeY = homeY + SHELL_LAYOUT[i].y;
            sh.x = sh.homeX;
            sh.y = sh.homeY;
            sh.z = sh.restZ;
            sh.yaw = sh.baseYaw;
            sh.held = false;
          }

          mantleDipSpring.x = mantleDipSpring.v = 0;
          eyeLYawSpring.x = eyeLYawSpring.v = 0;
          eyeRYawSpring.x = eyeRYawSpring.v = 0;

          resetArms(homeX, homeY, state.z, homeYaw, 1.0);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex  = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp    = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const isIdle = !!(eco && (eco.action === 'idle' || eco.patrol === false));
          const isWater = !!(habitat && habitat.isWater);
          const fx = curSkin.fx || SKINS[0].fx;
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const homeYaw = (eco && eco.homeYaw) ?? 0;
          const segLen = BASE_SEG_LEN * sMul;
          const baseZ = 2.35 * sMul;

          // -----------------------------------------------------------------
          // 1. 螺贝归位协调：待机时将 0 号海螺与 1 号扇贝稳妥置于身前左右 10.5 格方便单手卷起端详
          // -----------------------------------------------------------------
          for (let i = 0; i < shells.length; i++) {
            const sh = shells[i];
            let tgtX = homeX + SHELL_LAYOUT[i].x * sMul;
            let tgtY = homeY + SHELL_LAYOUT[i].y * sMul;
            if (isIdle && i === 0) {
              const [ix, iy] = localToWorldXY(homeX, homeY, homeYaw, 6.4 * sMul, 13.8 * sMul);
              tgtX = ix; tgtY = iy;
            } else if (isIdle && i === 1) {
              const [ix, iy] = localToWorldXY(homeX, homeY, homeYaw, -7.6 * sMul, 13.0 * sMul);
              tgtX = ix; tgtY = iy;
            }
            sh.homeX = lerp(sh.homeX, tgtX, expSmooth(dt, 2.5));
            sh.homeY = lerp(sh.homeY, tgtY, expSmooth(dt, 2.5));
            if (!sh.held) {
              sh.x = lerp(sh.x, sh.homeX, expSmooth(dt, 4.5));
              sh.y = lerp(sh.y, sh.homeY, expSmooth(dt, 4.5));
              sh.z = lerp(sh.z, sh.restZ * sMul, expSmooth(dt, 7.0));
              sh.yaw = lerp(sh.yaw, sh.baseYaw, expSmooth(dt, 4.0));
            }
          }

          // -----------------------------------------------------------------
          // 2. 生态主状态机：巡游（脉冲攀爬寻螺 -> 卷螺端详）& 待机（舒展盘绕 -> 轮流玩两枚前壳）
          // -----------------------------------------------------------------
          state.modeTimer += dt;
          const tgtShell = shells[state.targetShellIdx % shells.length];

          if (isIdle) {
            // 原地待机：柔和停回原位，在「舒展静伏观察」与「卷螺端详」间优雅循环
            const dHome = Math.hypot(homeX - state.x, homeY - state.y);
            if (dHome > 0.4 * sMul) {
              const kH = expSmooth(dt, 3.8);
              state.x = lerp(state.x, homeX, kH);
              state.y = lerp(state.y, homeY, kH);
            }
            state.vx = 0; state.vy = 0;
            const aimIdle = state.mode === 'play'
              ? Math.atan2(-(tgtShell.homeX - state.x), tgtShell.homeY - state.y)
              : homeYaw + Math.sin(time * 0.65) * 0.14;
            state.yaw += wrapAngle(aimIdle - state.yaw) * expSmooth(dt, 3.2);

            if (state.mode !== 'idleCalm' && state.mode !== 'play') {
              state.mode = 'idleCalm';
              state.modeTimer = 0;
              state.targetShellIdx = 0;
            }
            if (state.mode === 'idleCalm' && state.modeTimer >= 2.1) {
              state.mode = 'play';
              state.modeTimer = 0;
              state.playSub = 'reach';
              state.playTimer = 0;
              state.grabArmIdx = pickGrabArm(shells[state.targetShellIdx % 2]);
            }
          } else {
            // 自由巡游模式
            if (state.mode === 'idleCalm') {
              state.mode = 'crawl';
              state.modeTimer = 0;
              state.crawlPhase = 'observe';
              state.crawlTimer = 0.25;
            }

            if (state.mode === 'crawl') {
              const toSX = tgtShell.homeX - state.x;
              const toSY = tgtShell.homeY - state.y;
              const distToShell = Math.hypot(toSX, toSY) || 0.001;
              const standOff = 10.6 * sMul;
              const dirX = toSX / distToShell;
              const dirY = toSY / distToShell;
              const desiredYaw = Math.atan2(-toSX, toSY);

              // 缓慢柔和转头对准目标海螺
              state.yaw += wrapAngle(desiredYaw - state.yaw) * expSmooth(dt, 2.4 * spdMul);

              state.crawlTimer += dt;
              if (distToShell <= standOff + 1.8 * sMul && state.crawlPhase !== 'pull') {
                // 爬近海螺停稳 -> 进入单触手卷螺端详交互
                state.vx = 0; state.vy = 0;
                state.mode = 'play';
                state.modeTimer = 0;
                state.playSub = 'reach';
                state.playTimer = 0;
                state.grabArmIdx = pickGrabArm(tgtShell);
              } else if (state.crawlPhase === 'observe') {
                state.vx = lerp(state.vx, 0, expSmooth(dt, 7.5));
                state.vy = lerp(state.vy, 0, expSmooth(dt, 7.5));
                const obsDur = clamp(0.55 / Math.sqrt(gFreq), 0.32, 0.85);
                if (state.crawlTimer >= obsDur) {
                  beginCrawlProbe(dirX, dirY, sMul, gFreq, spdMul);
                }
              } else if (state.crawlPhase === 'probe') {
                // 前探阶段：身体微伏蓄力不动，等前 2~3 条触手落地锚死
                state.vx = lerp(state.vx, 0, expSmooth(dt, 8.0));
                state.vy = lerp(state.vy, 0, expSmooth(dt, 8.0));
                const probeWait = clamp(0.62 / Math.sqrt(gFreq), 0.36, 0.88);
                if (state.crawlTimer >= probeWait) {
                  state.crawlPhase = 'pull';
                  state.crawlTimer = 0;
                  mantleDipSpring.impulse(-7.2 * sp); // 发力拉身瞬间头囊柔和下压呼吸
                  triggerRearFollow(dirX, dirY, sMul, gFreq);
                }
              } else if (state.crawlPhase === 'pull') {
                // 发力拉身阶段：身体沿着已锚定的前触手方向脉冲滑拉前进
                const pullDur = clamp(0.66 / Math.sqrt(gFreq), 0.38, 0.92);
                const u = clamp(state.crawlTimer / pullDur, 0, 1);
                const ease = u * u * (3 - 2 * u);
                const prevX = state.x, prevY = state.y;
                state.x = lerp(state.pullOriginX, state.pullTargetX, ease);
                state.y = lerp(state.pullOriginY, state.pullTargetY, ease);
                state.vx = (state.x - prevX) / Math.max(dt, 0.001);
                state.vy = (state.y - prevY) / Math.max(dt, 0.001);

                // 软边界约束防止越出地台
                const maxR = ((eco && eco.maxRadius) || 42) * 0.92;
                const dC = Math.hypot(state.x, state.y);
                if (dC > maxR) { state.x *= maxR / dC; state.y *= maxR / dC; }

                if (u >= 1) {
                  state.crawlPhase = 'observe';
                  state.crawlTimer = 0;
                  state.vx = 0; state.vy = 0;
                }
              }
            }
          }

          // -----------------------------------------------------------------
          // 3. 单触手卷起海螺/圆贝端详交互状态机（巡游与待机共用，完整闭环）
          //    reach(0.68s) -> lift(0.60s) -> examine(2.25s) -> place(0.72s) -> rest(0.55s)
          // -----------------------------------------------------------------
          const activeShell = shells[(isIdle ? (state.targetShellIdx % 2) : state.targetShellIdx) % shells.length];
          let eyeLookX = state.x - Math.sin(state.yaw) * 14 * sMul;
          let eyeLookY = state.y + Math.cos(state.yaw) * 14 * sMul;

          if (state.mode === 'play') {
            state.vx = 0; state.vy = 0;
            state.playTimer += dt;
            const grabArm = arms[state.grabArmIdx];
            grabArm.role = 'grab';

            // 面向正在端详的海螺
            const aimS = Math.atan2(-(activeShell.homeX - state.x), activeShell.homeY - state.y);
            state.yaw += wrapAngle(aimS - state.yaw) * expSmooth(dt, 4.2);

            // 眼旁端详悬浮位（身前偏前手外侧，举到眼旁不遮挡双眼，方便左右端详）
            const sideBias = state.grabArmIdx === 0 ? -4.8 : 4.8;
            const [holdBaseX, holdBaseY] = localToWorldXY(state.x, state.y, state.yaw, sideBias * sMul, 10.6 * sMul);
            const holdBaseZ = (9.4 + Math.sin(time * 2.8) * 0.35) * sMul;

            if (state.playSub === 'reach') {
              const u = clamp(state.playTimer / 0.68, 0, 1);
              const s = u * u * (3 - 2 * u);
              grabArm.tipX = lerp(grabArm.anchorX, activeShell.homeX, s);
              grabArm.tipY = lerp(grabArm.anchorY, activeShell.homeY, s);
              grabArm.tipZ = lerp(0.25, activeShell.restZ + 0.8 * sMul, s) + Math.sin(u * Math.PI) * 2.6 * sMul;
              eyeLookX = activeShell.x; eyeLookY = activeShell.y;
              if (u >= 1) {
                state.playSub = 'lift';
                state.playTimer = 0;
                activeShell.held = true;
                // 离水卷起瞬间溅起几滴水珠 + 小涟漪
                if (vfx && isWater) {
                  vfx.addRipple(activeShell.x, activeShell.y, 1.8 * sMul, 10.5 * sMul, 0.58, 1.4);
                  vfx.spawnSplash(activeShell.x, activeShell.y, 5, 0.55 * sMul, habitat.fx);
                }
              }
            } else if (state.playSub === 'lift') {
              const u = clamp(state.playTimer / 0.60, 0, 1);
              const s = u * u * (3 - 2 * u);
              const px = lerp(activeShell.homeX, holdBaseX, s);
              const py = lerp(activeShell.homeY, holdBaseY, s);
              const pz = lerp(activeShell.restZ * sMul, holdBaseZ, s) + Math.sin(u * Math.PI) * 1.4 * sMul;
              grabArm.tipX = px; grabArm.tipY = py; grabArm.tipZ = pz;
              activeShell.x = px; activeShell.y = py; activeShell.z = pz;
              activeShell.yaw = lerp(activeShell.baseYaw, state.yaw + 0.4, s);
              eyeLookX = px; eyeLookY = py;
              if (u >= 1) {
                state.playSub = 'examine';
                state.playTimer = 0;
                state.dripCd = 0.25;
                mantleDipSpring.impulse(4.5 * sp);
              }
            } else if (state.playSub === 'examine') {
              const u = clamp(state.playTimer / 2.25, 0, 1);
              // 举到眼旁左右轻晃端详
              const sway = Math.sin(state.playTimer * 3.6) * 2.4 * sMul;
              const [sx, sy] = localToWorldXY(holdBaseX, holdBaseY, state.yaw, sway, Math.cos(state.playTimer * 2.2) * 0.6 * sMul);
              const sz = holdBaseZ + Math.sin(state.playTimer * 4.4) * 0.55 * sMul;
              grabArm.tipX = sx; grabArm.tipY = sy; grabArm.tipZ = sz;
              activeShell.x = sx; activeShell.y = sy; activeShell.z = sz;
              activeShell.yaw = state.yaw + Math.sin(state.playTimer * 3.2) * 0.65;
              eyeLookX = sx; eyeLookY = sy;

              // 端详晃动时偶发滴落晶莹水珠
              state.dripCd -= dt;
              if (vfx && state.dripCd <= 0) {
                state.dripCd = 0.42;
                vfx.spawnParticle(
                  sx + (Math.random() - 0.5) * 1.6 * sMul,
                  sy + (Math.random() - 0.5) * 1.6 * sMul,
                  sz - 0.8 * sMul,
                  (Math.random() - 0.5) * 3.5, (Math.random() - 0.5) * 3.5, 2.0,
                  0.45, 1.15, (Math.random() > 0.5 ? fx.dropA : fx.dropB), false, 38
                );
              }

              if (u >= 1) {
                state.playSub = 'place';
                state.playTimer = 0;
              }
            } else if (state.playSub === 'place') {
              const u = clamp(state.playTimer / 0.72, 0, 1);
              const s = u * u * (3 - 2 * u);
              const px = lerp(holdBaseX, activeShell.homeX, s);
              const py = lerp(holdBaseY, activeShell.homeY, s);
              const pz = lerp(holdBaseZ, activeShell.restZ * sMul, s) + Math.sin(u * Math.PI) * 1.1 * sMul;
              grabArm.tipX = px; grabArm.tipY = py; grabArm.tipZ = pz;
              activeShell.x = px; activeShell.y = py; activeShell.z = pz;
              activeShell.yaw = lerp(activeShell.yaw, activeShell.baseYaw, s);
              eyeLookX = px; eyeLookY = py;

              if (u >= 1) {
                activeShell.held = false;
                activeShell.x = activeShell.homeX;
                activeShell.y = activeShell.homeY;
                activeShell.z = activeShell.restZ * sMul;
                // 放回浅滩激起清晰涟漪与小水花
                if (vfx && isWater) {
                  vfx.addRipple(activeShell.x, activeShell.y, 2.0 * sMul, 14.5 * sMul, 0.72, 1.6);
                  vfx.spawnSplash(activeShell.x, activeShell.y, 6, 0.52 * sMul, habitat.fx);
                }
                state.playSub = 'rest';
                state.playTimer = 0;
                const [rx, ry] = calcRestTip(grabArm, state.x, state.y, state.yaw, sMul, 0.82);
                grabArm.startX = grabArm.tipX; grabArm.startY = grabArm.tipY; grabArm.startZ = grabArm.tipZ;
                grabArm.anchorX = rx; grabArm.anchorY = ry; grabArm.anchorZ = 0.25;
              }
            } else {
              // rest：触手优雅收回浅滩盘绕
              const u = clamp(state.playTimer / 0.55, 0, 1);
              const s = u * u * (3 - 2 * u);
              grabArm.tipX = lerp(grabArm.startX, grabArm.anchorX, s);
              grabArm.tipY = lerp(grabArm.startY, grabArm.anchorY, s);
              grabArm.tipZ = lerp(grabArm.startZ, 0.25, s) + Math.sin(u * Math.PI) * 1.4 * sMul;
              if (u >= 1) {
                grabArm.role = 'grounded';
                grabArm.stepT = 1;
                if (isIdle) {
                  state.targetShellIdx = (state.targetShellIdx + 1) % 2;
                  state.mode = 'idleCalm';
                  state.modeTimer = 0;
                } else {
                  state.targetShellIdx = (state.targetShellIdx + 1) % shells.length;
                  state.mode = 'crawl';
                  state.modeTimer = 0;
                  state.crawlPhase = 'observe';
                  state.crawlTimer = 0.15;
                }
              }
            }
          }

          // -----------------------------------------------------------------
          // 4. 更新全部 8 条触手目标点与带转角约束的 3D FABRIK 骨架链
          // -----------------------------------------------------------------
          const isResting = (state.mode === 'idleCalm' || state.mode === 'play' || state.crawlPhase === 'observe');
          for (let i = 0; i < ARM_COUNT; i++) {
            const arm = arms[i];
            const wAng = state.yaw + Math.PI * 0.5 + arm.localAng;
            const rootX = state.x + Math.cos(wAng) * ROOT_RADIUS * sMul;
            const rootY = state.y + Math.sin(wAng) * ROOT_RADIUS * sMul;
            const rootZ = state.z + 1.15 * sMul;

            if (arm.role === 'reach' || arm.role === 'follow') {
              arm.stepT += dt / Math.max(0.18, arm.stepDur);
              if (arm.stepT <= 0) {
                arm.tipX = arm.startX; arm.tipY = arm.startY; arm.tipZ = arm.startZ;
              } else if (arm.stepT >= 1) {
                arm.stepT = 1;
                arm.tipX = arm.anchorX;
                arm.tipY = arm.anchorY;
                arm.tipZ = 0.25;
                if (arm.role === 'reach' && vfx && isWater) {
                  vfx.addRipple(arm.tipX, arm.tipY, 1.0 * sMul, 6.2 * sMul, 0.45, 1.1);
                }
                arm.role = 'grounded';
              } else {
                const u = arm.stepT;
                const s = u * u * (3 - 2 * u);
                arm.tipX = lerp(arm.startX, arm.anchorX, s);
                arm.tipY = lerp(arm.startY, arm.anchorY, s);
                arm.tipZ = 0.25 + Math.sin(u * Math.PI) * arm.liftArc;
              }
            } else if (arm.role === 'grounded') {
              // 停步或待机时，若触手偏离理想舒展位太远则轻柔微调，并伴随柔和尖端卷动
              const [idealX, idealY] = calcRestTip(arm, state.x, state.y, state.yaw, sMul, 0.82);
              const distFromRoot = Math.hypot(arm.anchorX - rootX, arm.anchorY - rootY);
              if (isResting) {
                const kRelax = expSmooth(dt, 2.2);
                arm.anchorX = lerp(arm.anchorX, idealX, kRelax);
                arm.anchorY = lerp(arm.anchorY, idealY, kRelax);
              } else if (distFromRoot > SEG_COUNT * segLen * 1.04) {
                arm.anchorX = lerp(arm.anchorX, idealX, expSmooth(dt, 6.5));
                arm.anchorY = lerp(arm.anchorY, idealY, expSmooth(dt, 6.5));
              }
              const curlWave = Math.sin(time * 2.1 * gFreq + arm.phase) * 0.95 * flex * sMul;
              const perpX = -Math.sin(wAng), perpY = Math.cos(wAng);
              arm.tipX = arm.anchorX + perpX * curlWave * (isResting ? 1.0 : 0.22);
              arm.tipY = arm.anchorY + perpY * curlWave * (isResting ? 1.0 : 0.22);
              arm.tipZ = 0.25 + (isResting ? Math.max(0, Math.sin(time * 2.4 + arm.phase)) * 0.65 * sMul : 0);
            }

            // FABRIK 参数：抓取时略微抬拱增强立体弧线，地面锚定时贴滩涂柔和外卷
            const isGrab = arm.role === 'grab';
            const isAir = arm.role === 'reach' || arm.role === 'follow';
            const archH = isGrab
              ? 2.2 * sMul
              : (isAir ? 2.0 * sMul : (0.75 + Math.sin(time * 1.8 + arm.phase) * 0.25) * sMul);
            const curlBias = isGrab
              ? arm.curlSign * 1.8 * sMul
              : arm.curlSign * (1.55 + Math.sin(time * 1.7 * gFreq + arm.phase) * 0.45 * flex) * sMul;

            solveTentacleFABRIK(
              arm.nodes, rootX, rootY, rootZ, wAng,
              arm.tipX, arm.tipY, arm.tipZ, segLen,
              { archH, curlBias, maxAng: MAX_JOINT_ANG, floorZ: 0.25 }
            );

            footContacts[i].x = arm.nodes[NODE_COUNT - 1].x;
            footContacts[i].y = arm.nodes[NODE_COUNT - 1].y;
            footContacts[i].z = arm.nodes[NODE_COUNT - 1].z;
            footContacts[i].r = 1.45 * sMul;
          }

          // -----------------------------------------------------------------
          // 5. 软体头囊呼吸微伏与两只横瞳大眼独立转动追踪
          // -----------------------------------------------------------------
          const breathWave = Math.sin(time * 2.2 * gFreq);
          const pullDip = (state.mode === 'crawl' && state.crawlPhase === 'pull') ? -0.65 : 0;
          mantleDipSpring.update(dt, pullDip + breathWave * 0.35, 80 * sp, clamp(7.2 * dScale, 3.0, 12.0));
          state.z = Math.max(1.5 * sMul, baseZ + mantleDipSpring.x * sMul);
          state.breathCompressed = (state.mode === 'crawl' && state.crawlPhase === 'pull') || (breathWave < -0.35);

          // 左右双眼独立计算看向目标（海螺或前方扫描方向）的局部偏转角
          const scanOff = Math.sin(time * 1.35) * 0.24;
          const lookYaw = Math.atan2(-(eyeLookX - state.x), eyeLookY - state.y);
          const relLook = clamp(wrapAngle(lookYaw - state.yaw), -0.58, 0.58);
          eyeLYawSpring.update(dt, clamp(relLook + (state.mode === 'play' ? 0.10 : scanOff), -0.62, 0.62), 75 * sp, clamp(6.8 * dScale, 2.8, 11.0));
          eyeRYawSpring.update(dt, clamp(relLook + (state.mode === 'play' ? -0.10 : scanOff * 0.72 + Math.cos(time * 1.1) * 0.10), -0.62, 0.62), 75 * sp, clamp(6.8 * dScale, 2.8, 11.0));

          sockets.setLocal('mantle', state.x, state.y, state.z, state.yaw, 0, 0, 8.5, sMul);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? habitat.waterLevel : 2.0;
          const yw = state.yaw;

          // 1. 8 条 5 节辐射柔韧触手（高重叠胶囊沿 FABRIK 节点精准摆放）
          for (let i = 0; i < ARM_COUNT; i++) {
            const arm = arms[i];
            for (let s = 0; s < SEG_COUNT; s++) {
              const p0 = arm.nodes[s];
              const p1 = arm.nodes[s + 1];
              const cx = (p0.x + p1.x) * 0.5;
              const cy = (p0.y + p1.y) * 0.5;
              const cz = Math.max(0.0, (p0.z + p1.z) * 0.5 - 1.35 * sMul);
              const dx = p1.x - p0.x, dy = p1.y - p0.y;
              const segYaw = Math.hypot(dx, dy) > 0.01 ? Math.atan2(-dx, dy) : (yw + arm.localAng);
              const segSub = isWater ? clamp(EnvFeedback.calcSubmerge(cz + 0.6 * sMul, waterLvl, 3.6, true), 0, 0.45) : 0;

              list.push({
                partKey: armSegKeys[s],
                asset: parts[armSegKeys[s]],
                x: cx,
                y: cy,
                lift: cz,
                ro: segYaw,
                bias: -0.18 + s * 0.03 + (arm.role === 'grab' ? 0.42 : 0),
                submerge: segSub
              });
            }
          }

          // 2. 饱满圆顶肉质头囊（2 档无损烘焙呼吸过渡，禁止任何小数 scaleX/scaleY）
          const mantleKey = state.breathCompressed ? 'mantleBreath' : 'mantleRest';
          const bodySub = isWater ? clamp(EnvFeedback.calcSubmerge(state.z, waterLvl, 4.2, true), 0, 0.22) : 0;
          list.push({
            partKey: mantleKey,
            asset: parts[mantleKey],
            x: state.x,
            y: state.y,
            lift: state.z,
            ro: yw,
            bias: 0.25,
            submerge: bodySub
          });

          // 3. 两只独立可转动横瞳大眼（深嵌前额眼丘 1.8 格）
          const eyeZ = state.z + (state.breathCompressed ? 6.1 : 6.5) * sMul;
          const [exL, eyL] = localToWorldXY(state.x, state.y, yw, -3.45 * sMul, 4.35 * sMul);
          const [exR, eyR] = localToWorldXY(state.x, state.y, yw,  3.45 * sMul, 4.35 * sMul);
          list.push({
            partKey: 'eyeL',
            asset: parts.eyeL,
            x: exL,
            y: eyL,
            lift: eyeZ,
            ro: wrapAngle(yw + eyeLYawSpring.x),
            bias: 0.58,
            submerge: 0
          });
          list.push({
            partKey: 'eyeR',
            asset: parts.eyeR,
            x: exR,
            y: eyR,
            lift: eyeZ,
            ro: wrapAngle(yw + eyeRYawSpring.x),
            bias: 0.58,
            submerge: 0
          });

          // 4. 滩涂伴生交互物：3 枚立体彩壳海螺与圆贝
          for (let i = 0; i < shells.length; i++) {
            const sh = shells[i];
            const shSub = (!sh.held && isWater)
              ? clamp(EnvFeedback.calcSubmerge(sh.z + 0.5 * sMul, waterLvl, 3.4, true), 0, 0.36)
              : 0;
            list.push({
              partKey: sh.partKey,
              asset: parts[sh.partKey],
              x: sh.x,
              y: sh.y,
              lift: Math.max(0.1, sh.z),
              ro: sh.yaw,
              bias: sh.held ? 0.95 : 0.12,
              submerge: shSub
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Special11Def.id,
            code: Special11Def.code,
            status: Special11Def.status,
            name: Special11Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            mode: state.mode,
            crawlPhase: state.crawlPhase,
            armCount: ARM_COUNT,
            segCount: SEG_COUNT,
            shellCount: shells.length,
            footRadius: Special11Def.footRadius,
            headZ: 17,
            centerZ: 8,
            blocks: Special11Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Special11Def);
})(window.PixelWorkshop);
