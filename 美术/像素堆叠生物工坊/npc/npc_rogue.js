'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, lerp, smoothstep, localToWorldXY, expSmooth } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, ChainSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // N03 标杆 · 轻甲双刃队友（刺客，+Y 正前，z=0 贴地，站高约 22~23 格）
  //   - 精悍低重心体型：深炭褐贴身皮甲 + 压眉兜帽（锐利亮金眼点）+ 亮铜扣具与腰间钩爪钱袋
  //   - 颈后 5 节鲜红/亮朱砂色长围巾（ChainSolver 拖拽链 + 躯干净空护栏，急转甩出 S 弯零穿模）
  //   - 双手反握两把宽而锐利的高对比亮银弯短刃（锁死双腕枢轴，深钢/银蓝/亮白三档色阶不进 glowKeys）
  //   - 4 套动作：idle / patrol / strike / toss_coin；3 套皮肤
  //   - 严守清晰度铁律：glowKeys 留空、常态 1:1 无缩放、25 色 0 重色、0 禁用字
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      leatherDark: '#241b17',
      leatherMid:  '#42332c',
      leatherHi:   '#6b554a',
      clothDark:   '#2e2928',
      clothMid:    '#4f4745',
      clothHi:     '#786e6a',
      scarfDark:   '#941717',
      scarfMid:    '#e02822',
      scarfHi:     '#ff6347',
      copperDark:  '#824618',
      copperMid:   '#c9752c',
      copperHi:    '#f5a956',
      bladeDark:   '#4a5a6e',
      bladeMid:    '#9eb4cc',
      bladeHi:     '#eef6ff',
      gripDark:    '#362013',
      gripMid:     '#5c3822',
      gripHi:      '#855334',
      goldDark:    '#a67312',
      goldMid:     '#ebb224',
      goldHi:      '#ffe873',
      faceDark:    '#141014',
      eyeIris:     '#f5b822',
      eyeBright:   '#fff4a8',
      hookDark:    '#3b444f'
    },
    glowKeys: [],
    parts: [
      'foot', 'leg', 'cloth', 'body', 'buckle', 'pouch', 'hook',
      'hood', 'face', 'eye', 'scarf', 'arm', 'forearm',
      'bladeGrip', 'blade', 'coin'
    ],
    noCrease: [
      ['eye', 'face'], ['face', 'hood'], ['leg', 'foot'],
      ['blade', 'bladeGrip'], ['body', 'buckle'], ['pouch', 'buckle']
    ],
    materials: {
      leather: ['leatherDark', 'leatherMid', 'leatherHi'],
      cloth:   ['clothDark',   'clothMid',   'clothHi'],
      scarf:   ['scarfDark',   'scarfMid',   'scarfHi'],
      copper:  ['copperDark',  'copperMid',  'copperHi'],
      blade:   ['bladeDark',   'bladeMid',   'bladeHi'],
      grip:    ['gripDark',    'gripMid',    'gripHi'],
      gold:    ['goldDark',    'goldMid',    'goldHi']
    },
    protectedParts: ['eye', 'face']
  });

  const SKINS = [
    {
      id: 'charcoal_scarlet',
      name: '炭皮赤巾',
      dot: '#e02822',
      outline: '#120e0d',
      pal: {}
    },
    {
      id: 'wood_emerald',
      name: '林褐翠巾',
      dot: '#24b573',
      outline: '#0e1410',
      pal: {
        leatherDark: '#261e14', leatherMid: '#4a3a26', leatherHi: '#755e40',
        scarfDark:   '#136b43', scarfMid:   '#24b573', scarfHi:   '#6bf0ae',
        eyeIris:     '#66f2b0', eyeBright:  '#d4ffe8'
      }
    },
    {
      id: 'sand_gold',
      name: '沙灰金巾',
      dot: '#e39a22',
      outline: '#171410',
      pal: {
        leatherDark: '#3d3934', leatherMid: '#666057', leatherHi: '#968e82',
        scarfDark:   '#9e6210', scarfMid:   '#e39a22', scarfHi:   '#ffd25c',
        copperDark:  '#783416', copperMid:  '#bd5726', copperHi:  '#eb8852',
        eyeIris:     '#ff9a2e', eyeBright:  '#ffe1a6'
      }
    }
  ];

  // 反握弯短刃握柄枢轴（握柄在局部 +Y 端，弯刃向 -Y 外侧甩出，锁紧手腕防悬空）
  const BLADE_PIVOT_L = { x:  0.6, y: 2.2 };
  const BLADE_PIVOT_R = { x: -0.6, y: 2.2 };
  const UPPER_PIVOT   = { x: 0.0, y: -1.3 };
  const FORE_PIVOT    = { x: 0.0, y: -1.4 };

  // 1. 轻捷双腿与软底潜行皮靴
  function buildLegSeg(makeCanvas, rTop, rBot, hLen, matName) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 3);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat(matName), partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildBoot(makeCanvas) {
    const m = new VoxelModel(6, 8, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0.0, 2.2, 1.35, 1.35, 1.1, mat('cloth'), partId.leg, true);
    m.paintEllipsoid(0, 1.1, 1.1, 1.60, 2.45, 1.15, mat('grip'), partId.foot, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.3 });
  }

  // 2. 贴身炭褐皮甲躯干（待机轻倾 / 疾跑 26° 低身前倾双态 + 亮铜扣具 + 腰间钩爪钱袋）
  function buildTorso(makeCanvas, runMode) {
    const m = new VoxelModel(12, runMode ? 14 : 12, 12, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const pitch = runMode ? 0.44 : 0.14;
    const cp = Math.cos(-pitch), sp = Math.sin(-pitch);

    m.fillAABB(-5.2, 5.2, -5.2, runMode ? 6.4 : 5.2, 0, 11, (x, y, z, X, Y) => {
      const dy = Y, dz = z - 3.6;
      const ly = dy * cp + dz * sp;
      const lz = 3.6 - dy * sp + dz * cp;
      // 精悍贴身上身（比坦克窄一圈）
      const zNorm = clamp((lz - 2.4) / 7.6, 0, 1);
      const wX = lerp(3.4, 4.3, zNorm);
      const wY = lerp(2.7, 3.2, zNorm);
      const dBody = Math.hypot(X / wX, ly / wY);
      if (lz >= 2.2 && lz <= 9.8 && dBody <= 1.0) {
        m.setRaw(x, y, z, mat('leather'), partId.body);
      }
      // 颈圈鲜红围巾领环（衔接后颈围巾链）
      if (lz >= 9.0 && lz <= 10.6 && Math.hypot(X / 3.3, ly / 3.0) <= 1.0 && Math.hypot(X / 1.8, ly / 1.7) >= 0.65) {
        m.setRaw(x, y, z, mat('scarf'), partId.scarf);
      }
      // 腰间贴身皮衣下摆（包住大腿根防穿帮）
      if (lz >= 0.4 && lz <= 3.0 && Math.hypot(X / 3.9, ly / 3.1) <= 1.0 && Math.hypot(X / 2.2, ly / 1.7) >= 0.55) {
        m.setRaw(x, y, z, mat('cloth'), partId.cloth);
      }
    });

    const yOff = runMode ? 1.5 : 0.4;
    // 胸前斜挎皮带与亮铜扣具
    m.paintCapsule(-3.4, yOff + 2.2, 9.0, 3.2, yOff + 2.4, 3.6, 0.85, 0.85, mat('grip'), partId.pouch, true);
    m.paintEllipsoid(-0.2, yOff + 2.9, 6.4, 1.15, 0.85, 1.15, mat('copper'), partId.buckle, true);
    m.paintEllipsoid( 2.2, yOff + 2.5, 4.4, 0.95, 0.80, 0.95, mat('copper'), partId.buckle, true);

    // 左腰鼓囊钱袋（带金扣）
    m.paintEllipsoid(-3.9, yOff - 0.6, 3.2, 1.45, 1.45, 1.55, mat('grip'), partId.pouch, true);
    m.paintEllipsoid(-4.2, yOff - 0.5, 4.1, 0.85, 0.85, 0.65, mat('gold'), partId.buckle, true);

    // 右腰小钩爪（暗铁爪齿 + 亮铜环）
    m.paintEllipsoid(3.9, yOff - 0.8, 3.4, 1.0, 1.0, 1.0, mat('copper'), partId.buckle, true);
    const hw = m.w * 0.5 - 0.5, hd = m.d * 0.5 - 0.5;
    for (const [dx, dy, dz] of [[4.6, yOff - 1.2, 2.2], [4.2, yOff - 2.0, 2.0], [3.6, yOff - 1.6, 1.8]]) {
      m.setRaw(Math.round(hw + dx), Math.round(hd + dy), Math.round(dz), keyToId.hookDark, partId.hook);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: runMode ? 5.2 : 4.6 });
  }

  // 3. 压眉兜帽头（深炭褐兜帽 + 暗面颊 + 0.6 俯视 0 遮挡锐利亮金眼点）
  function buildHead(makeCanvas) {
    const W = 10, D = 12, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 兜帽外轮廓（略带尖角帽尾向后延展，俯视极有刺客辨识度）
    m.paintEllipsoid(0, 0.0, 4.2, 4.1, 4.2, 3.8, mat('leather'), partId.hood, true);
    m.paintCapsule(0, -1.6, 4.8, 0, -4.4, 3.8, 2.4, 1.2, mat('leather'), partId.hood, true);
    // 帽沿一圈亮铜细饰点
    m.paintEllipsoid(0, 3.4, 6.2, 2.2, 0.8, 0.7, mat('copper'), partId.buckle, true);

    // 正面压眉深暗面部凹槽
    m.fillAABB(-2.8, 2.8, 2.4, 4.6, 1.2, 5.2, (x, y, z, X, Y) => {
      if (Math.abs(X) <= 2.4 && Y >= 2.8 && z >= 1.5 && z <= 4.6) {
        m.setRaw(x, y, z, keyToId.faceDark, partId.face);
      }
    });

    m.despeckle();
    m.applyArtShading(true);

    // 沿表面扫描雕刻锐利亮金双眼（位于帽檐下方凸面，确保 0.6 俯视零遮挡，不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const eyeZ = 4;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.6);
      let sy = -1;
      for (let y = D - 1; y >= 1; y--) {
        if (m.getId(ex, y, eyeZ)) { sy = y; break; }
      }
      if (sy < 0) sy = Math.round(D * 0.5 + 3.0);
      m.setRaw(ex, sy, eyeZ, keyToId.eyeBright, partId.eye);
      m.setRaw(ex + s, sy, eyeZ, keyToId.eyeIris, partId.eye);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.3 });
  }

  // 4. 颈后长围巾分节（鲜红/亮朱砂高对比，逐节变窄变薄，ChainSolver 甩出流畅 S 弯）
  function buildScarfSeg(makeCanvas, wRad, lenY, hThick, isTip) {
    const W = Math.ceil(wRad * 2 + 3);
    const D = Math.ceil(lenY + 4);
    const H = Math.ceil(hThick + 3);
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const y0 = lenY * 0.45;
    const y1 = -lenY * 0.55;
    m.paintCapsule(0, y0, 1.5, 0, y1, 1.3, wRad, isTip ? wRad * 0.55 : wRad * 0.88, mat('scarf'), partId.scarf, true);
    if (isTip) {
      // 围巾尾端加一道亮铜穗边增加飘动辨识
      m.paintEllipsoid(0, y1 - 0.2, 1.3, wRad * 0.65, 0.75, 0.75, mat('copper'), partId.buckle, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(wRad, lenY * 0.5) });
  }

  // 5. 利落两段式手臂
  function buildUpperArm(makeCanvas) {
    const m = new VoxelModel(6, 8, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, UPPER_PIVOT.y, 2.4, 0, UPPER_PIVOT.y + 3.1, 2.2, 1.25, 1.15, mat('leather'), partId.arm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2 });
  }

  function buildForearm(makeCanvas) {
    const m = new VoxelModel(6, 8, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, FORE_PIVOT.y, 2.2, 0, FORE_PIVOT.y + 3.1, 2.3, 1.15, 1.18, mat('cloth'), partId.forearm, true);
    m.paintEllipsoid(0, FORE_PIVOT.y + 2.2, 2.3, 1.32, 0.85, 1.25, mat('copper'), partId.buckle, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.1 });
  }

  // 6. 反握宽刃亮银弯短刃（×4 俯视高辨识：深钢背/银蓝面/亮白刃口三档高对比，握柄锁死手腕）
  function buildCurvedDagger(makeCanvas, side) {
    const m = new VoxelModel(11, 13, 6, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const pv = side < 0 ? BLADE_PIVOT_L : BLADE_PIVOT_R;

    // 握柄与铜护手（精准落在握持枢轴处）
    m.paintCapsule(pv.x, pv.y + 1.4, 2.5, pv.x, pv.y - 1.2, 2.5, 0.88, 0.92, mat('grip'), partId.bladeGrip, true);
    m.paintEllipsoid(pv.x, pv.y - 1.2, 2.5, 1.55, 0.75, 1.15, mat('copper'), partId.buckle, true);

    // 反握向后外侧弯出的宽大弯短刃（确保俯视面积足够宽阔锐利）
    const pA = [pv.x, pv.y - 1.4, 2.5];
    const pB = [pv.x + side * 1.4, pv.y - 4.6, 2.6];
    const pC = [pv.x + side * 3.4, pv.y - 7.4, 2.8];
    m.paintCapsule(pA[0], pA[1], pA[2], pB[0], pB[1], pB[2], 1.25, 1.38, mat('blade'), partId.blade, true);
    m.paintCapsule(pB[0], pB[1], pB[2], pC[0], pC[1], pC[2], 1.32, 0.65, mat('blade'), partId.blade, true);

    m.despeckle();
    m.applyArtShading(true);

    // 手动强化刃口亮白线与刀背深钢线，确保 ×4 俯视下钢刃冷冽明锐（绝不进 glowKeys）
    const hw = m.w * 0.5 - 0.5, hd = m.d * 0.5 - 0.5;
    for (let step = 0; step <= 14; step++) {
      const u = step / 14;
      const bx = u < 0.5 ? lerp(pA[0], pB[0], u * 2) : lerp(pB[0], pC[0], (u - 0.5) * 2);
      const by = u < 0.5 ? lerp(pA[1], pB[1], u * 2) : lerp(pB[1], pC[1], (u - 0.5) * 2);
      const edgeX = Math.round(hw + bx + side * 0.95);
      const spineX = Math.round(hw + bx - side * 0.85);
      const ey = Math.round(hd + by);
      m.setRaw(edgeX, ey, 3, keyToId.bladeHi, partId.blade);
      m.setRaw(edgeX, ey, 2, keyToId.bladeHi, partId.blade);
      m.setRaw(spineX, ey, 2, keyToId.bladeDark, partId.blade);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.5 });
  }

  // 7. 抛接亮金圆币（toss_coin 动作专用）
  function buildCoin(makeCanvas) {
    const m = new VoxelModel(5, 5, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 1.6, 1.55, 1.55, 0.85, mat('gold'), partId.coin, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.6 });
  }

  const Def = {
    id: 'npc_rogue',
    code: 'N03',
    name: '轻甲双刃队友',
    tag: '轻甲高机动双刃',
    summary: '酒馆核心刺客标杆：炭褐兜帽皮甲、亮金双眸、颈后 5 节朱砂长围巾防穿模拖拽链与反握亮银双弯刃，支持突刺劈斩与抛接金币',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 7.0,
    ecoWeight: 0.92,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',      name: '低姿警戒', loop: true,  status: 'done' },
      { id: 'patrol',    name: '疾步折返', loop: true,  status: 'done' },
      { id: 'strike',    name: '双刃突刺', loop: false, duration: 1.8, status: 'done' },
      { id: 'toss_coin', name: '抛接金币', loop: false, duration: 2.4, status: 'done' }
    ],
    blocks: [
      '低重心双态前倾皮甲', '压眉兜帽与亮金眼点', '5节朱砂长围巾防穿模链',
      '锁腕反握高对比双弯刃', '高频折返疾跑步态', '双刃寒弧突刺与抛接金币'
    ],
    soulHabit: '低重心轻晃转刃警戒 → 身体前倾高频折返疾跑甩出赤巾 S 弯 → 突刺交叉寒刃弧 → 酒馆闲适抛接金币',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legThigh:  buildLegSeg(makeCanvas, 1.58, 1.38, 4.3, 'cloth'),
        legShin:   buildLegSeg(makeCanvas, 1.36, 1.22, 4.1, 'leather'),
        boot:      buildBoot(makeCanvas),
        torso:     buildTorso(makeCanvas, false),
        torsoRun:  buildTorso(makeCanvas, true),
        head:      buildHead(makeCanvas),
        scarf0:    buildScarfSeg(makeCanvas, 1.65, 3.2, 1.3, false),
        scarf1:    buildScarfSeg(makeCanvas, 1.50, 3.2, 1.2, false),
        scarf2:    buildScarfSeg(makeCanvas, 1.35, 3.1, 1.1, false),
        scarf3:    buildScarfSeg(makeCanvas, 1.20, 3.0, 1.0, true),
        upperArm:  buildUpperArm(makeCanvas),
        forearm:   buildForearm(makeCanvas),
        bladeL:    buildCurvedDagger(makeCanvas, -1),
        bladeR:    buildCurvedDagger(makeCanvas,  1),
        coin:      buildCoin(makeCanvas)
      };

      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.1, hipY: -0.1, hipZ: 8.2, restX: -2.3, restY: 0.25, group: 0, L1: 4.3, L2: 4.4, bendDir: 1 },
        { id: 'R', hipX:  2.1, hipY: -0.1, hipZ: 8.2, restX:  2.3, restY: 0.25, group: 1, L1: 4.3, L2: 4.4, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 1.9, stepDuration: 0.135, stepHeight: 1.9, strideAnticipation: 0.48 });

      // 5 节点长围巾物理拖拽链（节点 0 锚定在颈后外偏移点，节点 1~4 对应 4 段飘飞赤巾）
      const scarfChain = new ChainSolver(5, 2.75, {
        maxAngle: 0.48,
        waveFreq: 5.2,
        wavePhaseStep: 0.62,
        waveAmp: 0.34
      });

      const bodyBounce  = new SpringDamper1D(0, 195, 8.8);
      const headLook    = new SpringDamper1D(0, 150, 7.8);
      const lArmSpring  = new SpringDamper1D(0, 165, 7.6);
      const lForeSpring = new SpringDamper1D(0, 145, 7.0);
      const rArmSpring  = new SpringDamper1D(0, 165, 7.6);
      const rForeSpring = new SpringDamper1D(0, 145, 7.0);
      const lWristSpin  = new SpringDamper1D(0, 155, 6.8);
      const rWristSpin  = new SpringDamper1D(0, 155, 6.8);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        sprintBlend: 0, stepPhase: 0,
        habitTimer: opts.seed || 0,
        action: 'idle', actionTime: 0,
        strikeSlashDone: false,
        coinCatchDone: false,
        tiltX: 0, tiltY: 0,
        lungeOffset: 0, hopLift: 0
      };
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      // 围巾净空保护：强制所有围巾节点留在肩胸外侧后方净空外侧，急转绝不切穿肩胸！
      function clampScarfClearance(tx, ty, yaw, sMul) {
        const fwdX = -Math.sin(yaw), fwdY = Math.cos(yaw);
        const rightX = Math.cos(yaw), rightY = Math.sin(yaw);
        const nodes = scarfChain.nodes;
        const segLen = 2.75 * sMul;
        const minSideClear = 5.0 * sMul;
        const backPlane = -3.4 * sMul;

        for (let i = 1; i < nodes.length; i++) {
          const cur = nodes[i];
          const prev = nodes[i - 1];
          const rx = cur.x - tx, ry = cur.y - ty;
          const localSide = rx * rightX + ry * rightY;
          const localFwd  = rx * fwdX + ry * fwdY;

          // 如果节点越过背部安全面且闯入肩宽范围内，则沿背面/外侧推出肩胸圆柱
          if (localFwd > backPlane && Math.abs(localSide) < minSideClear) {
            const sideSign = localSide >= 0 ? 1 : -1;
            const pushedSide = Math.abs(localSide) > 2.2 * sMul ? sideSign * minSideClear : localSide;
            const pushedFwd  = Math.abs(localSide) > 2.2 * sMul ? Math.min(localFwd, -1.6 * sMul) : backPlane;
            cur.x = tx + pushedSide * rightX + pushedFwd * fwdX;
            cur.y = ty + pushedSide * rightY + pushedFwd * fwdY;
            // 重建与前一节的精确距离约束并刷新朝向
            const dx = cur.x - prev.x, dy = cur.y - prev.y;
            const d = Math.hypot(dx, dy) || 0.001;
            cur.x = prev.x + (dx / d) * segLen;
            cur.y = prev.y + (dy / d) * segLen;
            cur.yaw = Math.atan2(dy, dx) + Math.PI * 0.5;
          }
        }
      }

      const instance = {
        def: Def,
        cachePrefix: `npc_rogue_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts: [],
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.yaw = hyaw; state.z = 0;
          state.vx = 0; state.vy = 0; state.sprintBlend = 0;
          state.lungeOffset = 0; state.hopLift = 0;
          state.strikeSlashDone = false;
          state.coinCatchDone = false;
          gait.reset(hx, hy, hyaw);
          const [rx, ry] = localToWorldXY(hx, hy, hyaw, 0, -4.4);
          scarfChain.reset(rx, ry, 14.2, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = params.springiness ?? 1.0;
          const flex = params.tailFlex ?? 1.0;
          const gFreq = params.gaitFreq ?? 1.0;
          state.habitTimer += dt;

          const act = (eco && eco.action) ? eco.action : (eco && eco.patrol ? 'patrol' : 'idle');
          const actT = (eco && eco.actionTime != null) ? eco.actionTime : 0;
          if (act !== state.action || actT < state.actionTime - 0.1) {
            state.strikeSlashDone = false;
            state.coinCatchDone = false;
          }
          state.action = act;
          state.actionTime = actT;

          const isPatrol = act === 'patrol';
          Propulsion.multiLegWalk(state, dt, time, { ...params, speed: (params.speed ?? 1.0) * 1.32 }, {
            ...eco, patrol: isPatrol, walkStyle: 'scurry', baseLift: 0
          });
          state.z = 0;

          const spdNow = Math.hypot(state.vx, state.vy);
          const targetSprint = isPatrol ? clamp((spdNow - 2.0) / 7.5, 0, 1) : 0;
          state.sprintBlend = lerp(state.sprintBlend, targetSprint, expSmooth(dt, 12.0));
          state.stepPhase += dt * (4.2 + state.sprintBlend * 14.5) * gFreq;

          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 1.60,
            stepHeight: 1.9 * sMul,
            stepThreshold: 1.9 * sMul
          });
          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 0.60 * sMul, expSmooth(dt, 14));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 0.60 * sMul, expSmooth(dt, 14));

          const maxFootOffset = 3.8 * sMul;
          for (const leg of gait.legs) {
            const [idealX, idealY] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
            const dx = leg.footX - idealX, dy = leg.footY - idealY;
            const d = Math.hypot(dx, dy);
            if (d > maxFootOffset) {
              leg.footX = idealX + (dx / d) * maxFootOffset;
              leg.footY = idealY + (dy / d) * maxFootOffset;
            }
          }

          if (gaitRes.landed.length > 0) {
            bodyBounce.impulse(7.5 * sp);
            for (const l of gaitRes.landed) {
              if (vfx && habitat) EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.52 * sMul);
            }
          }

          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 1.9 * sMul }));

          // 按 4 套动作解算上身/双臂/手腕动作参数
          let headT = Math.sin(time * 1.5) * 0.22;
          let lArmT = -0.32;
          let lForeT = 0.28;
          let rArmT = 0.32;
          let rForeT = -0.28;
          let lWristT = 0.0;
          let rWristT = 0.0;
          let lungeTarget = 0;
          let hopTarget = 0;

          if (act === 'idle') {
            // 低重心警戒待机：左右轻晃 + 双腕交替轻转短刃
            const sway = Math.sin(time * 2.4);
            headT = Math.sin(time * 1.4) * 0.28;
            lArmT = -0.36 + sway * 0.14;
            lForeT = 0.30 - sway * 0.10;
            rArmT = 0.36 + sway * 0.14;
            rForeT = -0.30 - sway * 0.10;
            const twirlCycle = (time * 0.9) % 2.0;
            if (twirlCycle < 0.7) {
              lWristT = Math.sin((twirlCycle / 0.7) * Math.PI) * 1.15;
            } else if (twirlCycle > 1.0 && twirlCycle < 1.7) {
              rWristT = -Math.sin(((twirlCycle - 1.0) / 0.7) * Math.PI) * 1.15;
            }
          } else if (act === 'patrol') {
            // 身体前倾高频疾跑，双臂带滞后向后反掠
            const sw = Math.sin(state.stepPhase) * state.sprintBlend;
            const swLag = Math.sin(state.stepPhase - 0.80) * state.sprintBlend;
            headT = sw * 0.12;
            lArmT = -0.55 + sw * 0.45;
            lForeT = 0.22 + swLag * 0.32;
            rArmT = 0.55 - sw * 0.45;
            rForeT = -0.22 - swLag * 0.32;
            lWristT = -0.22 + swLag * 0.18;
            rWristT = 0.22 - swLag * 0.18;
          } else if (act === 'strike') {
            // 0..0.38s 下蹲蓄势 -> 0.38..0.68s 前突双刃交叉劈出寒刃弧 -> 1.15..1.80s 后跳回稳
            if (actT < 0.38) {
              const u = smoothstep(0.0, 0.38, actT);
              lungeTarget = -1.6 * u;
              lArmT = lerp(-0.32, -1.05, u);
              lForeT = lerp(0.28, 0.45, u);
              rArmT = lerp(0.32, 1.05, u);
              rForeT = lerp(-0.28, -0.45, u);
              lWristT = -0.35 * u;
              rWristT = 0.35 * u;
            } else if (actT < 1.15) {
              const u = smoothstep(0.38, 0.62, actT);
              lungeTarget = lerp(-1.6, 5.4, u);
              lArmT = lerp(-1.05, 0.85, u);
              lForeT = lerp(0.45, -0.30, u);
              rArmT = lerp(1.05, -0.85, u);
              rForeT = lerp(-0.45, 0.30, u);
              lWristT = lerp(-0.35, 0.72, u);
              rWristT = lerp(0.35, -0.72, u);

              if (!state.strikeSlashDone && actT >= 0.46) {
                state.strikeSlashDone = true;
                bodyBounce.impulse(-12.0 * sp);
                if (vfx) {
                  const [fx, fy] = localToWorldXY(state.x, state.y, state.yaw, 0, 8.2 * sMul);
                  // 双刃交叉劈出青白寒刃粒子弧
                  for (let k = 0; k < 14; k++) {
                    const frac = (k / 13) - 0.5;
                    const ang = state.yaw + Math.PI * 0.5 + frac * 1.95;
                    const spd = 18 + (k % 3) * 6;
                    const zOff = (7.5 + (k % 2 === 0 ? frac * 4.0 : -frac * 4.0)) * sMul;
                    vfx.spawnParticle(
                      fx + Math.cos(ang) * 2.0, fy + Math.sin(ang) * 2.0, Math.max(2.0, zOff),
                      Math.cos(ang) * spd, Math.sin(ang) * spd, 2.5 + (k % 3) * 1.5,
                      0.34, 1.75, k % 2 === 0 ? '#b8f2ff' : '#eef8ff', true, 6
                    );
                  }
                }
              }
            } else {
              const u = smoothstep(1.15, 1.80, actT);
              lungeTarget = lerp(5.4, 0.0, u);
              hopTarget = Math.sin(u * Math.PI) * 3.2;
              lArmT = lerp(0.85, -0.32, u);
              lForeT = lerp(-0.30, 0.28, u);
              rArmT = lerp(-0.85, 0.32, u);
              rForeT = lerp(0.30, -0.28, u);
              lWristT = lerp(0.72, 0.0, u);
              rWristT = lerp(-0.72, 0.0, u);
            }
          } else if (act === 'toss_coin') {
            // 酒馆候雇动作：收稳左刃，右手高抛亮金圆币并利落接住
            const env = smoothstep(0.0, 0.30, actT) * (1 - smoothstep(2.05, 2.40, actT));
            const flick = smoothstep(0.28, 0.42, actT) * (1 - smoothstep(0.42, 0.72, actT));
            const catchDip = smoothstep(1.58, 1.70, actT) * (1 - smoothstep(1.70, 1.98, actT));
            headT = -0.18 * env;
            lArmT = lerp(-0.32, -0.68, env);
            lForeT = lerp(0.28, 0.58, env);
            rArmT = lerp(0.32, 0.48 + flick * 0.42 - catchDip * 0.30, env);
            rForeT = lerp(-0.28, 0.25 + flick * 0.35 - catchDip * 0.25, env);
            lWristT = 0.15 * env;
            rWristT = -0.20 * env;

            if (!state.coinCatchDone && actT >= 1.65) {
              state.coinCatchDone = true;
              bodyBounce.impulse(-5.0 * sp);
              if (vfx) {
                const [cx, cy] = localToWorldXY(state.x, state.y, state.yaw, 4.4 * sMul, 4.8 * sMul);
                for (let k = 0; k < 5; k++) {
                  const a = (k / 5) * Math.PI * 2;
                  vfx.spawnParticle(
                    cx, cy, 13.0 * sMul,
                    Math.cos(a) * 6.0, Math.sin(a) * 6.0, 6.5 + k * 1.1,
                    0.34, 1.25, '#ffe873', false, 18
                  );
                }
              }
            }
          }

          state.lungeOffset = lerp(state.lungeOffset, lungeTarget, expSmooth(dt, 16));
          state.hopLift = lerp(state.hopLift, hopTarget, expSmooth(dt, 16));

          bodyBounce.update(dt, 0, 195 * sp, 8.8);
          headLook.update(dt, headT, 150 * sp, 7.8);
          lArmSpring.update(dt, lArmT, 165 * sp, 7.6);
          lForeSpring.update(dt, lForeT, 145 * sp, 7.0);
          rArmSpring.update(dt, rArmT, 165 * sp, 7.6);
          rForeSpring.update(dt, rForeT, 145 * sp, 7.0);
          lWristSpin.update(dt, lWristT, 155 * sp, 6.8);
          rWristSpin.update(dt, rWristT, 155 * sp, 6.8);

          // 更新颈后长围巾 ChainSolver（挂在颈后外偏移点 + 净空保护，高速急转甩出 S 弯零穿模）
          const isRun = state.sprintBlend > 0.36 || (act === 'strike' && actT >= 0.35 && actT <= 1.25);
          const [tx, ty] = localToWorldXY(state.x + state.tiltX, state.y + state.tiltY, state.yaw, 0, state.lungeOffset * sMul);
          const neckBackY = (isRun ? -3.4 : -4.4) * sMul;
          const [scRootX, scRootY] = localToWorldXY(tx, ty, state.yaw, 0, neckBackY);
          const neckZ = ((isRun ? 14.2 : 15.2) + state.hopLift) * sMul;

          scarfChain.update(dt, scRootX, scRootY, neckZ, state.yaw, time, {
            segLen: 2.75 * sMul,
            flexibility: flex * (0.9 + state.sprintBlend * 0.45),
            maxAngle: 0.48,
            waveFreq: 4.8 + state.sprintBlend * 4.5,
            waveAmp: 0.24 + state.sprintBlend * 0.22,
            restAlign: 0.09 + state.sprintBlend * 0.05,
            zTargetFn: (u, idx, tm) => {
              const droop = u * (isRun ? 2.2 : 4.6) * sMul;
              const flutter = Math.sin(tm * (5.0 + state.sprintBlend * 5.0) - idx * 0.9) * (0.45 + u * 0.85) * sMul;
              return Math.max(2.6 * sMul, neckZ - droop + flutter);
            }
          });
          clampScarfClearance(tx, ty, state.yaw, sMul);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const act = state.action;
          const actT = state.actionTime;
          const isRun = state.sprintBlend > 0.36 || (act === 'strike' && actT >= 0.35 && actT <= 1.25);

          const crouchStrike = (act === 'strike' && actT < 0.42) ? -1.4 * smoothstep(0.0, 0.36, actT) : 0;
          const idleSwayX = act === 'idle' ? Math.sin(state.habitTimer * 2.4) * 0.45 : 0;
          const breath = Math.sin(state.habitTimer * 3.2) * 0.34 * (1 - state.sprintBlend * 0.5);
          const runBob = Math.abs(Math.sin(state.stepPhase)) * 0.62 * state.sprintBlend;
          const bob = clamp(bodyBounce.x * 0.05 + breath + runBob + crouchStrike, -1.8, 1.1) * sMul;
          const hopZ = state.hopLift * sMul;

          // 1. 轻捷双腿 IK
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const [fx, fy] = localToWorldXY(l.footX, l.footY, yw, 0, state.lungeOffset * 0.72 * sMul);
            const [hx, hy] = localToWorldXY(l.hipWX + state.tiltX, l.hipWY + state.tiltY, yw, idleSwayX * sMul, state.lungeOffset * sMul);
            const hz = l.hipWZ + bob + hopZ;
            const fz = l.footZ + hopZ;
            const kx = lerp(hx, fx, 0.45);
            const ky = lerp(hy, fy, 0.45);
            const kz = lerp(hz, fz + 1.5 * sMul, 0.48);
            list.push(
              { partKey: 'legThigh', asset: parts.legThigh, x: lerp(hx, kx, 0.35), y: lerp(hy, ky, 0.35), lift: Math.max(0, lerp(hz, kz, 0.35) - 2.0 * sMul), ro: yw, bias: -0.34, symDeg: 90 },
              { partKey: 'legShin',  asset: parts.legShin,  x: lerp(kx, fx, 0.50), y: lerp(ky, fy, 0.50), lift: Math.max(0, lerp(kz, fz + 1.2 * sMul, 0.50) - 1.9 * sMul), ro: yw, bias: -0.28, symDeg: 90 },
              { partKey: 'boot',     asset: parts.boot,     x: fx, y: fy, lift: Math.max(0, fz), ro: yw, bias: -0.22 }
            );
          }

          // 2. 贴身炭褐皮甲躯干（低重心待机 / 前倾疾跑）
          const [tx, ty] = localToWorldXY(state.x + state.tiltX, state.y + state.tiltY, yw, idleSwayX * sMul, state.lungeOffset * sMul);
          const torsoLift = (isRun ? 6.4 : 6.9) * sMul + bob + hopZ;
          const tKey = isRun ? 'torsoRun' : 'torso';
          list.push({
            partKey: tKey, asset: parts[tKey],
            x: tx, y: ty, lift: torsoLift, ro: yw, bias: 0.16
          });

          // 3. 压眉兜帽头（站高约 22.5~23 格，比坦克矮且更低重心）
          const hYaw = yw + clamp(headLook.x, -0.62, 0.62);
          const [hx, hy] = localToWorldXY(tx, ty, yw, 0, (isRun ? 2.1 : 0.7) * sMul);
          const headLift = torsoLift + (isRun ? 8.0 : 8.8) * sMul;
          list.push({
            partKey: 'head', asset: parts.head,
            x: hx, y: hy, lift: headLift, ro: hYaw, bias: 0.44
          });

          // 4. 颈后 4 段飘飞鲜红长围巾（连同颈圈共 5 节，带合理负 bias 防止与躯干肩胸穿模）
          const scarfKeys = ['scarf0', 'scarf1', 'scarf2', 'scarf3'];
          for (let i = 0; i < 4; i++) {
            const n0 = scarfChain.nodes[i];
            const n1 = scarfChain.nodes[i + 1];
            const mx = (n0.x + n1.x) * 0.5;
            const my = (n0.y + n1.y) * 0.5;
            const mz = (n0.z + n1.z) * 0.5;
            list.push({
              partKey: scarfKeys[i],
              asset: parts[scarfKeys[i]],
              x: mx,
              y: my,
              lift: Math.max(1.6 * sMul, mz - 1.2 * sMul),
              ro: n1.yaw,
              bias: -0.34 - i * 0.05
            });
          }

          // 5. 左右两段手臂 + 锁死手腕枢轴的反握双弯刃
          const shY = (isRun ? 1.4 : 0.3) * sMul;
          const armZ = torsoLift + (isRun ? 5.2 : 5.6) * sMul;
          const [lShX, lShY] = localToWorldXY(tx, ty, yw, -4.3 * sMul, shY);
          const [rShX, rShY] = localToWorldXY(tx, ty, yw,  4.3 * sMul, shY);

          const lUpperYaw = yw + lArmSpring.x;
          const [lUWx, lUWy] = localToWorldXY(lShX, lShY, lUpperYaw, -UPPER_PIVOT.x * sMul, -UPPER_PIVOT.y * sMul);
          const [lElbX, lElbY] = localToWorldXY(lShX, lShY, lUpperYaw, 0, 3.1 * sMul);
          const lForeYaw = lUpperYaw + lForeSpring.x;
          const [lFWx, lFWy] = localToWorldXY(lElbX, lElbY, lForeYaw, -FORE_PIVOT.x * sMul, -FORE_PIVOT.y * sMul);
          const [lHandX, lHandY] = localToWorldXY(lElbX, lElbY, lForeYaw, 0, 3.1 * sMul);

          const rUpperYaw = yw + rArmSpring.x;
          const [rUWx, rUWy] = localToWorldXY(rShX, rShY, rUpperYaw, -UPPER_PIVOT.x * sMul, -UPPER_PIVOT.y * sMul);
          const [rElbX, rElbY] = localToWorldXY(rShX, rShY, rUpperYaw, 0, 3.1 * sMul);
          const rForeYaw = rUpperYaw + rForeSpring.x;
          const [rFWx, rFWy] = localToWorldXY(rElbX, rElbY, rForeYaw, -FORE_PIVOT.x * sMul, -FORE_PIVOT.y * sMul);
          const [rHandX, rHandY] = localToWorldXY(rElbX, rElbY, rForeYaw, 0, 3.1 * sMul);

          list.push(
            { partKey: 'upperArmL', asset: parts.upperArm, x: lUWx, y: lUWy, lift: armZ + 0.3 * sMul, ro: lUpperYaw, bias: 0.22 },
            { partKey: 'forearmL',  asset: parts.forearm,  x: lFWx, y: lFWy, lift: armZ - 0.2 * sMul, ro: lForeYaw,  bias: 0.28 },
            { partKey: 'upperArmR', asset: parts.upperArm, x: rUWx, y: rUWy, lift: armZ + 0.3 * sMul, ro: rUpperYaw, bias: 0.22 },
            { partKey: 'forearmR',  asset: parts.forearm,  x: rFWx, y: rFWy, lift: armZ - 0.2 * sMul, ro: rForeYaw,  bias: 0.28 }
          );

          // 左手反握弯短刃（锁死左手腕枢轴）
          const lBladeYaw = lForeYaw + lWristSpin.x;
          const [lBWx, lBWy] = localToWorldXY(lHandX, lHandY, lBladeYaw, -BLADE_PIVOT_L.x * sMul, -BLADE_PIVOT_L.y * sMul);
          list.push({
            partKey: 'bladeL', asset: parts.bladeL,
            x: lBWx, y: lBWy, lift: armZ - 0.4 * sMul, ro: lBladeYaw, bias: 0.38
          });

          // 右手：toss_coin 期间右刃暂收腰后，右手抛接亮金圆币；常态反握右弯刃锁死右手腕
          const inCoinToss = act === 'toss_coin' && actT >= 0.15 && actT <= 2.25;
          if (inCoinToss) {
            const [sheathX, sheathY] = localToWorldXY(tx, ty, yw, 3.4 * sMul, -2.6 * sMul);
            list.push({
              partKey: 'bladeR', asset: parts.bladeR,
              x: sheathX, y: sheathY, lift: torsoLift + 1.0 * sMul, ro: yw + 0.65, bias: -0.12
            });
            // 亮金圆币高高抛起旋转再落回右手
            const tossU = clamp((actT - 0.38) / 1.27, 0, 1);
            const inAir = actT >= 0.38 && actT <= 1.65;
            const coinArc = inAir ? Math.sin(tossU * Math.PI) * 13.5 * sMul : 0;
            const coinSpin = inAir ? (yw + tossU * Math.PI * 10) : rForeYaw;
            list.push({
              partKey: 'coin', asset: parts.coin,
              x: rHandX, y: rHandY,
              lift: armZ + 1.4 * sMul + coinArc,
              ro: coinSpin,
              bias: 0.56
            });
          } else {
            const rBladeYaw = rForeYaw + rWristSpin.x;
            const [rBWx, rBWy] = localToWorldXY(rHandX, rHandY, rBladeYaw, -BLADE_PIVOT_R.x * sMul, -BLADE_PIVOT_R.y * sMul);
            list.push({
              partKey: 'bladeR', asset: parts.bladeR,
              x: rBWx, y: rBWy, lift: armZ - 0.4 * sMul, ro: rBladeYaw, bias: 0.38
            });
          }

          sockets.setWorld('leftHand', lHandX, lHandY, armZ, lForeYaw);
          sockets.setWorld('rightHand', rHandX, rHandY, armZ, rForeYaw);
          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id, code: Def.code, name: Def.name, outlineMode: 'actorUnified',
            skin: curSkin.id, footRadius: Def.footRadius, headZ: 23, centerZ: 11,
            blocks: Def.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(Def, 'npc');
})(window.PixelWorkshop);
