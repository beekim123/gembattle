'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { solveSagittalLegIK, ChainSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 洞3 · 单腿雷牛（《山海经》夔 · M11 单足重击弹跳模板 · v3 精制纯生态版）
  // -------------------------------------------------------------------------
  // 【前置调研与工程预算】
  // 1. 生物原型与运动学调研：
  //    - 出自《山海经·大荒东经》：「状如牛，苍身而无角，一足，出入水则必风雨，其声如雷」。
  //    - 采用动画十二原则中的 Anticipation（屈膝前倾预备）、Arcs（抛物线腾空弧）、
  //      Follow-through（落地重击缓冲 + 耳尾惯性甩动）与 SLIP 单足重心落点模型：
  //      严禁用小数 scaleX/scaleY 压扁整只，改用 3 档无损烘焙躯干（torsoCalm /
  //      torsoCrouch / torsoLeap）配合矢状面 2-Bone IK（solveSagittalLegIK）真实屈膝，
  //      水平位移仅发生在腾空相，着地 4 阶段重蹄钉地零滑步。
  // 2. 三维几何坐标预算（单件 <= 40 格，色表 30 色 <= 48 色，零重色）：
  //    - 主躯干 torsoCalm/Crouch/Leap : 24×30×18，宽肩厚背无角壮牛，腹底正中厚肌座承接独腿；
  //    - 独立牛首 headCalm/Sniff/Flap : 18×22×16，枢轴 HEAD_PIVOT(0, -5.2) 深嵌前胸 >= 4 格；
  //    - 中置粗壮独腿 4 节高重叠衔接 : 髋点 (0, -0.8, bz+4.8) 深嵌腹底，大腿(12×12×9)、
  //      弯膝(11×11×7)、小腿(10×10×8)、宽大重蹄(13×14×6)，相邻节重叠率 >= 55%，0 断层；
  //    - 短壮甩尾 3 节 ChainSolver    : 挂点臀后 (0, -12.6, bz+8.6)，落地惯性大幅甩动；
  //    - 伴生交互物（溶洞石笋碎块）   : shardLarge(10×10×10) / shardSmall(8×8×8) / shardBitten(8×8×6)。
  // 3. 现有内核盘点：
  //    - 直接复用 PW.Math / PW.Voxel / PW.Solvers / PW.Behaviors.EnvFeedback；
  //    - 本脚本内自建 5 阶段单足重击弹跳状态机与高空震落石笋碎块弹跳啃食池，不改动 core/。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 主体青灰牛皮（3 档）
      hideDark:     '#3b4754',
      hideMid:      '#5b6d7e',
      hideHi:       '#889db0',
      // 宽背厚肩深岩青（3 档）
      backDark:     '#242e3b',
      backMid:      '#3c4c61',
      backHi:       '#62768f',
      // 胸腹与耳内浅灰（3 档）
      bellyDark:    '#6c7c8c',
      bellyMid:     '#96a8b8',
      bellyHi:      '#c5d4e0',
      // 宽厚牛吻深灰（3 档）
      snoutDark:    '#252c36',
      snoutMid:     '#3f4a59',
      snoutHi:      '#647285',
      // 古铜鼻环（3 档）
      ringDark:     '#734e1d',
      ringMid:      '#b88235',
      ringHi:       '#ebbb65',
      // 岩黑重蹄与膝甲（3 档）
      hoofDark:     '#1d2028',
      hoofMid:      '#353b47',
      hoofHi:       '#5a6373',
      // 独立锐利双眼（eyeGlint 严禁进 glowKeys）
      eyeDark:      '#10141c',
      eyeIris:      '#5ce0f0',
      eyeGlint:     '#f4feff',
      // 溶洞石笋青灰岩基（3 档）
      rockDark:     '#2b3340',
      rockMid:      '#495569',
      rockHi:       '#75859c',
      // 碎块镶嵌矿晶青玉（3 档）
      crystalDark:  '#1d6e78',
      crystalMid:   '#38b0bf',
      crystalHi:    '#8ce8f2',
      // 仅雷纹与矿晶核进 glowKeys（3 档）
      emissiveMid:  '#42d8f5',
      emissiveHot:  '#9ef2ff',
      emissiveCore: '#eefdff'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'torso', 'back', 'belly', 'snout', 'ring', 'eye',
      'leg', 'knee', 'hoof', 'rune', 'tail', 'rock', 'crystal', 'crystalCore'
    ],
    noCrease: [
      ['torso', 'back'], ['torso', 'belly'], ['torso', 'snout'],
      ['snout', 'ring'], ['torso', 'eye'],
      ['leg', 'knee'], ['leg', 'hoof'], ['leg', 'rune'], ['knee', 'hoof'],
      ['rock', 'crystal'], ['crystal', 'crystalCore']
    ],
    materials: {
      hide:    ['hideDark',    'hideMid',    'hideHi'],
      back:    ['backDark',    'backMid',    'backHi'],
      belly:   ['bellyDark',   'bellyMid',   'bellyHi'],
      snout:   ['snoutDark',   'snoutMid',   'snoutHi'],
      ring:    ['ringDark',    'ringMid',    'ringHi'],
      hoof:    ['hoofDark',    'hoofMid',    'hoofHi'],
      rock:    ['rockDark',    'rockMid',    'rockHi'],
      crystal: ['crystalDark', 'crystalMid', 'crystalHi']
    },
    protectedParts: ['eye', 'ring', 'rune', 'crystalCore']
  });

  // 4 套零重建模换色皮肤（0 禁用字）
  const SKINS = [
    {
      id: 'azure_rock',
      name: '青岩雷牛（溶洞经典）',
      dot: '#5b6d7e',
      outline: '#0d131a',
      pal: {},
      fx: {
        dust:  '#788799',
        wave:  '#8ce8f5',
        spark: '#c4f8ff',
        crumb: '#59b9c7'
      }
    },
    {
      id: 'iron_volt',
      name: '玄铁电牛（深岩款）',
      dot: '#2f3a4a',
      outline: '#090c12',
      pal: {
        hideDark:     '#1d232e', hideMid:     '#313b4d', hideHi:     '#526078',
        backDark:     '#121721', backMid:     '#222a38', backHi:     '#3e4b61',
        bellyDark:    '#3f4a5c', bellyMid:    '#5e6e85', bellyHi:    '#8a9cb5',
        ringDark:     '#5e5430', ringMid:     '#9e8e52', ringHi:     '#d9c77e',
        eyeIris:      '#7ab4ff',
        crystalDark:  '#244899', crystalMid:  '#427cf0', crystalHi:  '#94bdff',
        emissiveMid:  '#5294ff', emissiveHot: '#a6ccff', emissiveCore:'#edf5ff'
      },
      fx: {
        dust:  '#546073',
        wave:  '#7db4ff',
        spark: '#cfe4ff',
        crumb: '#4f86eb'
      }
    },
    {
      id: 'bronze_ore',
      name: '苍铜矿牛（晶洞款）',
      dot: '#4d8274',
      outline: '#0e1714',
      pal: {
        hideDark:     '#2b4a43', hideMid:     '#467368', hideHi:     '#71a396',
        backDark:     '#1c332e', backMid:     '#30544b', backHi:     '#528075',
        bellyDark:    '#5e786c', bellyMid:    '#8aa698', bellyHi:    '#bcd4c8',
        snoutDark:    '#26302d', snoutMid:    '#3f4f4a', snoutHi:    '#627871',
        ringDark:     '#804820', ringMid:     '#cc7738', ringHi:     '#ffae66',
        eyeIris:      '#ffd059',
        crystalDark:  '#8c5b18', crystalMid:  '#db942c', crystalHi:  '#ffd978',
        emissiveMid:  '#f0b238', emissiveHot: '#ffe182', emissiveCore:'#fffbe3'
      },
      fx: {
        dust:  '#6b857b',
        wave:  '#f2c968',
        spark: '#fff0b3',
        crumb: '#d99834'
      }
    },
    {
      id: 'frost_slate',
      name: '霜灰岩牛（寒洞款）',
      dot: '#9bb3c7',
      outline: '#101824',
      pal: {
        hideDark:     '#687d91', hideMid:     '#93abc2', hideHi:     '#c7daeb',
        backDark:     '#485c70', backMid:     '#6f879e', backHi:     '#9eb6cc',
        bellyDark:    '#8fa3b5', bellyMid:    '#bccddb', bellyHi:    '#e6f0f7',
        snoutDark:    '#435261', snoutMid:    '#64788c', snoutHi:    '#8ea3b8',
        hoofDark:     '#2b3542', hoofMid:     '#465466', hoofHi:     '#6d7f96',
        eyeIris:      '#54e6c9',
        rockDark:     '#485869', rockMid:     '#6e8296', rockHi:     '#9fb3c7',
        crystalDark:  '#247a9c', crystalMid:  '#4ac2eb', crystalHi:  '#a8ecff',
        emissiveMid:  '#61d8ff', emissiveHot: '#b5f0ff', emissiveCore:'#f2fcff'
      },
      fx: {
        dust:  '#9eb2c4',
        wave:  '#9cebff',
        spark: '#e0f9ff',
        crumb: '#61c8eb'
      }
    }
  ];

  // =========================================================================
  // 1. 浑圆厚重无角壮牛躯干（3 档无损烘焙：calm 平衡 / crouch 屈膝蓄力 / leap 昂胸腾空）
  //    尺寸 24×30×18：宽背厚肩、饱满胸腔、正腹厚实独腿肌座、微亮雷纹肩印
  // =========================================================================
  function buildTorso(makeCanvas, stage) {
    const isCrouch = stage === 'crouch';
    const isLeap   = stage === 'leap';
    const W = 24, D = 30, H = 18;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 通过无损体素造型表达蓄力前倾与腾空昂胸，零小数缩放
    const chestY    = isCrouch ? 5.6  : (isLeap ? 6.0  : 5.0);
    const chestZ    = isCrouch ? 7.6  : (isLeap ? 9.8  : 8.8);
    const shoulderZ = isCrouch ? 11.2 : (isLeap ? 12.8 : 12.0);
    const rumpZ     = isCrouch ? 9.2  : (isLeap ? 7.8  : 8.8);
    const neckZ     = isCrouch ? 8.2  : (isLeap ? 11.2 : 9.8);

    m.fillAABB(-10.8, 10.8, -13.8, 13.8, 1, 16, (x, y, z, X, Y) => {
      // 厚实宽牛肩 + 浑圆胸桶 + 敦实后臀 + 粗短厚颈根 + 腹底正中独腿肌座
      const dChest    = (Math.hypot(X / 8.8, (Y - chestY) / 7.8, (z - chestZ) / 6.1) - 1.0) * 6.5;
      const dShoulder = (Math.hypot(X / 8.0, (Y - (chestY - 1.0)) / 6.8, (z - shoulderZ) / 4.4) - 1.0) * 5.0;
      const dBarrel   = (Math.hypot(X / 9.2, (Y + 0.8) / 9.6, (z - (isCrouch ? 8.2 : 8.5)) / 5.8) - 1.0) * 6.6;
      const dRump     = (Math.hypot(X / 8.0, (Y + 7.4) / 6.0, (z - rumpZ) / 5.2) - 1.0) * 5.2;
      const dNeckBase = (Math.hypot(X / 5.4, (Y - 10.6) / 4.2, (z - neckZ) / 4.5) - 1.0) * 4.2;
      const dHipPad   = (Math.hypot(X / 5.4, (Y + 0.8) / 5.6, (z - 3.6) / 3.4) - 1.0) * 3.8;

      const dBody = smin(smin(dChest, dShoulder, 2.2), smin(dBarrel, dRump, 2.4), 2.4);
      const d = smin(smin(dBody, dNeckBase, 2.0), dHipPad, 1.8);
      if (d > 0) return;

      const isBackRidge = z >= (isCrouch ? 11.2 : 11.8) - Math.abs(X) * 0.32 && Math.abs(X) < 5.6;
      const isBelly     = z < 5.4 && Math.abs(X) < 5.4 && Y > -7.5;
      // 两侧肩部对称细雷纹（仅极少像素自亮，突出“雷牛”辨识点）
      const isShoulderRune = Math.abs(X) > 7.6 && Math.abs(Y - (chestY - 0.8)) < 2.2 &&
        Math.abs(z - (chestZ + 1.0) - (Y - (chestY - 0.8)) * 0.55) < 0.72;

      if (isShoulderRune) {
        m.setRaw(x, y, z, keyToId.emissiveMid, partId.rune);
      } else if (isBackRidge) {
        m.setRaw(x, y, z, mat('back'), partId.back);
      } else if (isBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else {
        m.setRaw(x, y, z, mat('hide'), partId.torso);
      }
    });

    // 背脊宽厚肌肉棱（突出壮牛肩峰）
    m.paintCapsule(0, chestY + 1.8, shoulderZ + 2.4, 0, -6.4, rumpZ + 2.6, 2.4, 1.8, mat('back'), partId.back, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 12.0, headZ: 17, centerZ: 9 });
  }

  // =========================================================================
  // 2. 独立无角大牛首（3 档无损烘焙：calm 常态 / sniff 低头嗅探啃食 / flap 落地甩耳）
  //    尺寸 18×22×16，枢轴锁在后颈根部 (0, -5.2)
  //    严格遵循《山海经》夔「无角」特征：宽圆厚额、短立耳、方形厚牛吻、古铜鼻环、2×2 锐利双眼
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -5.2 };
  function buildHead(makeCanvas, pose) {
    const isSniff = pose === 'sniff';
    const isFlap  = pose === 'flap';
    const W = 18, D = 22, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    const headZ  = isSniff ? 5.6 : 7.8;
    const snoutZ = isSniff ? 3.2 : 5.6;
    const snoutY = isSniff ? 6.4 : 5.8;

    // 粗短厚颈深嵌躯干前胸
    m.paintCapsule(0, -5.4, isSniff ? 6.8 : 5.4, 0, -0.6, headZ, 4.4, 4.8, mat('hide'), partId.torso, true);
    // 宽阔浑圆无角牛额（饱满无角，额心微隆厚毛顶）
    m.paintEllipsoid(0, 0.2, headZ + 0.4, 5.4, 5.2, 4.4, mat('hide'), partId.torso, true);
    m.paintEllipsoid(0, -0.4, headZ + 3.4, 4.2, 4.0, 2.1, mat('back'), partId.back, true);
    // 额心一道微小青白雷印（呼应雷牛题材）
    m.paintEllipsoid(0, 3.4, headZ + 3.0, 0.75, 1.35, 0.65, keyToId.emissiveMid, partId.rune, true);

    // 宽厚方形牛吻（朝 +Y 突出，低头啃食态微张下颌）
    m.paintEllipsoid(0, snoutY, snoutZ, 4.1, 4.0, 3.0, mat('snout'), partId.snout, true);
    m.paintEllipsoid(0, snoutY + 2.3, snoutZ - 0.4, 3.5, 1.8, 2.3, mat('snout'), partId.snout, true);
    // 下颌浅绒（sniff 啃食态下颌微张开）
    m.paintEllipsoid(0, snoutY - 1.0, snoutZ - (isSniff ? 2.4 : 1.9), 2.9, 3.2, 1.4, mat('belly'), partId.belly, true);

    // 清晰古铜鼻环（横挂鼻端下缘）
    m.paintCapsule(-2.3, snoutY + 2.6, snoutZ - 1.3, 0, snoutY + 3.7, snoutZ - 2.1, 0.78, 0.85, mat('ring'), partId.ring, true);
    m.paintCapsule( 2.3, snoutY + 2.6, snoutZ - 1.3, 0, snoutY + 3.7, snoutZ - 2.1, 0.78, 0.85, mat('ring'), partId.ring, true);
    // 左右鼻孔微凹深色点缀
    m.paintEllipsoid(-1.7, snoutY + 3.6, snoutZ + 0.5, 0.78, 0.65, 0.75, keyToId.snoutDark, partId.snout, true);
    m.paintEllipsoid( 1.7, snoutY + 3.6, snoutZ + 0.5, 0.78, 0.65, 0.75, keyToId.snoutDark, partId.snout, true);

    // 一对短壮牛耳（flap 落地惯性态明显向外下甩，sniff 态前倾专注）
    const earOutX = isFlap ? 8.2 : 7.4;
    const earY    = isSniff ? 0.6 : (isFlap ? -2.2 : -1.2);
    const earTipZ = isFlap ? (headZ + 0.6) : (isSniff ? headZ + 3.4 : headZ + 4.4);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 4.2, -0.8, headZ + 1.8, s * earOutX, earY, earTipZ, 1.65, 0.85, mat('hide'), partId.torso, true);
      m.paintCapsule(s * 4.7, -0.2, headZ + 1.6, s * (earOutX - 0.7), earY + 0.5, earTipZ - 0.5, 0.9, 0.48, mat('belly'), partId.belly, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 表面落点 2×2 锐利牛眼（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 3.0);
    const eyeZ = Math.round(headZ + 0.8);
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 7; step++) {
        const tx = Math.round(hw + s * (6.2 - step));
        const p = m.getPartId(tx, eyeY, eyeZ);
        if (p === partId.torso || p === partId.snout) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 4.6);
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const kId = (dz === 1 && dy === 1)
            ? keyToId.eyeGlint
            : (dy === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(sx, eyeY + dy - 1, eyeZ + dz, kId, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 5.8, headZ: 15, centerZ: 8 });
  }

  // =========================================================================
  // 3. 正腹中置极其粗壮的独腿（4 段高重叠连续衔接：大腿 / 弯膝 / 小腿 / 宽大重蹄）
  //    全部严格 <= 14 格，相邻节重叠率 >= 55%，屈膝下压绝不脱节
  // =========================================================================
  function buildMonoThigh(makeCanvas) {
    const m = new VoxelModel(12, 12, 9, SPEC);
    const { mat, partId } = SPEC;
    // 上宽下略收的强健大腿肌柱，顶部深嵌躯干腹底
    m.paintCapsule(0, 0, 1.3, 0, 0, 7.6, 3.45, 4.15, mat('hide'), partId.leg, true);
    m.paintEllipsoid(0, 1.0, 5.2, 3.4, 3.6, 2.8, mat('back'), partId.back, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, centerZ: 4 });
  }

  function buildMonoKnee(makeCanvas) {
    const m = new VoxelModel(11, 11, 7, SPEC);
    const { mat, partId } = SPEC;
    // 饱满弯膝关节 + 前膝岩甲骨棱（蓄力屈膝时朝 +Y 凸出，极具力量感）
    m.paintEllipsoid(0, 0, 3.4, 3.45, 3.55, 2.95, mat('hide'), partId.leg, true);
    m.paintEllipsoid(0, 2.2, 3.6, 2.35, 1.85, 2.15, mat('hoof'), partId.knee, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, centerZ: 3 });
  }

  function buildMonoShin(makeCanvas) {
    const m = new VoxelModel(10, 10, 8, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 粗壮柱状小腿 + 中段一圈青白微亮雷纹脚环
    m.paintCapsule(0, 0, 1.2, 0, 0, 6.8, 2.95, 3.25, mat('hide'), partId.leg, true);
    m.fillAABB(-3.6, 3.6, -3.6, 3.6, 3, 4, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      if (r >= 2.55 && r <= 3.25 && z === 3) {
        m.setRaw(x, y, z, keyToId.emissiveMid, partId.rune);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.3, centerZ: 4 });
  }

  function buildMonoHoof(makeCanvas) {
    const m = new VoxelModel(13, 14, 6, SPEC);
    const { mat, partId } = SPEC;
    // 宽大稳固的厚重分瓣单蹄（落地支撑面积大，视觉上单足站立极其扎实）
    m.paintEllipsoid(0, 0.0, 2.1, 4.15, 4.35, 2.05, mat('hoof'), partId.hoof, true);
    m.paintEllipsoid(-1.75, 2.8, 1.65, 1.75, 2.25, 1.55, mat('hoof'), partId.hoof, true);
    m.paintEllipsoid( 1.75, 2.8, 1.65, 1.75, 2.25, 1.55, mat('hoof'), partId.hoof, true);
    // 蹄冠上缘厚皮衔接小腿
    m.paintEllipsoid(0, -0.3, 4.1, 3.25, 3.35, 1.45, mat('back'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8, centerZ: 3 });
  }

  // =========================================================================
  // 4. 短壮甩尾（3 节 ChainSolver，重蹄砸地时惯性大幅甩动）
  // =========================================================================
  function buildTailSeg(makeCanvas, r, hLen, isTuft) {
    const S = Math.max(6, Math.ceil(r * 2 + 4));
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    if (isTuft) {
      m.paintEllipsoid(0, 0, H * 0.48, r * 1.25, r * 1.35, H * 0.44, mat('back'), partId.tail, true);
      m.paintEllipsoid(0, 0.2, H * 0.72, r * 0.85, r * 0.85, H * 0.25, mat('hide'), partId.tail, true);
    } else {
      m.paintCapsule(0, 0, 1.1, 0, 0, H - 1.1, r * 0.88, r, mat('back'), partId.tail, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: r });
  }

  // =========================================================================
  // 5. 待机与巡游伴生交互物：溶洞震落的立体青灰矿晶石笋碎块（3 档）
  //    shardLarge 完整大块 / shardSmall 完整小块 / shardBitten 被啃残块
  // =========================================================================
  function buildStalagmiteShard(makeCanvas, kind) {
    const isLarge  = kind === 'large';
    const isBitten = kind === 'bitten';
    const S = isLarge ? 10 : 8;
    const H = isLarge ? 10 : (isBitten ? 6 : 8);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    const baseR = isLarge ? 3.5 : 2.7;
    const topZ  = isLarge ? 8.2 : (isBitten ? 4.2 : 6.4);

    // 底部青灰多棱石笋岩块
    m.fillAABB(-baseR - 0.5, baseR + 0.5, -baseR - 0.5, baseR + 0.5, 1, Math.ceil(topZ), (x, y, z, X, Y) => {
      const u = clamp((z - 1) / Math.max(1, topZ - 1), 0, 1);
      const rLimit = lerp(baseR, isBitten ? 1.5 : 0.75, Math.pow(u, 0.85));
      // 略带多面体棱角的岩块截面
      const facet = 1 + 0.14 * Math.cos(Math.atan2(Y, X) * 3 + 0.5);
      if (Math.hypot(X, Y) <= rLimit * facet) {
        if (isBitten && X > 0.6 && z > 2.2) return; // 啃掉一角的缺口
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      }
    });

    // 镶嵌在石笋侧面的青白矿晶棱（高辨识度，吸引雷牛啃食）
    if (!isBitten) {
      m.paintCapsule(-1.2, 1.3, 2.2, -2.0, 2.1, isLarge ? 6.6 : 5.2, 1.15, 0.62, mat('crystal'), partId.crystal, true);
      m.paintCapsule( 1.4, -0.8, 2.0,  2.0, -1.2, isLarge ? 5.6 : 4.4, 0.95, 0.55, mat('crystal'), partId.crystal, true);
      // 晶棱顶端极小自亮核
      m.paintEllipsoid(-1.8, 1.9, isLarge ? 6.2 : 4.9, 0.65, 0.65, 0.75, keyToId.emissiveHot, partId.crystalCore, true);
    } else {
      m.paintCapsule(-1.0, 1.0, 1.8, -1.5, 1.5, 3.8, 0.85, 0.52, mat('crystal'), partId.crystal, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: baseR + 0.4, headZ: H - 1, centerZ: Math.round(H * 0.45) });
  }

  // 常驻场地周遭的 2 块环境石笋碎块（距中心安全错开）
  const AMBIENT_SHARDS = [
    { key: 'shardLarge', lx: -21.0, ly:  14.0, yaw:  0.65 },
    { key: 'shardSmall', lx:  22.0, ly: -13.5, yaw: -1.45 }
  ];

  // =========================================================================
  // 生物定义：洞3 · 单腿雷牛
  // =========================================================================
  const Cave3Def = {
    id: 'cave3_kui',
    code: '洞3',
    name: '洞3 · 单腿雷牛',
    status: 'done',
    tag: 'M11 单足重击弹跳 · 震落石笋啃食',
    summary: 'v3 精制：《山海经》夔单腿雷牛，青灰浑圆无角壮牛 + 正腹中置粗壮独腿 IK 屈膝弹跳 + 重蹄震落石笋碎块连蹦凑近啃食循环',
    defaultHabitat: 'cave',
    footRadius: 11.5,
    ecoWeight: 1.5,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '无角青灰浑圆壮牛躯干（3档无损姿态）',
      '正腹中置粗壮独腿（4段高重叠IK屈膝）',
      '5阶段刚性重兽单足弹跳（零滑步）',
      '重蹄砸地震荡波与耳尾惯性甩动',
      '高空震落立体石笋碎块连蹦啃食循环'
    ],
    soulHabit: '单腿定立微晃 -> 屈膝蓄力前倾 -> 单足爆发抛物线跃起 -> 重蹄砸地激起环形岩尘与青白声波环，周期性震落高空石笋碎块 -> 单腿咚咚连蹦两小步凑近，低头嗅探咔嚓啃食后原地轻跳继续巡游',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torsoCalm:   buildTorso(makeCanvas, 'calm'),
        torsoCrouch: buildTorso(makeCanvas, 'crouch'),
        torsoLeap:   buildTorso(makeCanvas, 'leap'),
        headCalm:    buildHead(makeCanvas, 'calm'),
        headSniff:   buildHead(makeCanvas, 'sniff'),
        headFlap:    buildHead(makeCanvas, 'flap'),
        legThigh:    buildMonoThigh(makeCanvas),
        legKnee:     buildMonoKnee(makeCanvas),
        legShin:     buildMonoShin(makeCanvas),
        hoof:        buildMonoHoof(makeCanvas),
        tailBase:    buildTailSeg(makeCanvas, 1.65, 3.8, false),
        tailMid:     buildTailSeg(makeCanvas, 1.42, 3.6, false),
        tailTuft:    buildTailSeg(makeCanvas, 1.75, 4.2, true),
        shardLarge:  buildStalagmiteShard(makeCanvas, 'large'),
        shardSmall:  buildStalagmiteShard(makeCanvas, 'small'),
        shardBitten: buildStalagmiteShard(makeCanvas, 'bitten')
      };

      const tailChain = new ChainSolver(3, 2.2, {
        maxAngle: 0.56,
        waveFreq: 4.5,
        wavePhaseStep: 0.72,
        waveAmp: 0.30
      });

      // 二阶弹簧：控制单足重心上下缓冲与头部/平衡微晃
      const bodyZSpring   = new SpringDamper1D(11.4, 108, 9.2);
      const balanceSpring = new SpringDamper1D(0, 68, 5.4);
      const headYawSpring = new SpringDamper1D(0, 118, 7.8);
      const headZSpring   = new SpringDamper1D(6.8, 95, 8.2);

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      // 常驻石笋碎块 + 周期性高空震落的可啃食新碎块
      const ambientShards = AMBIENT_SHARDS.map((s) => ({
        key: s.key,
        lx: s.lx,
        ly: s.ly,
        x: (opts.homeX ?? 0) + s.lx,
        y: (opts.homeY ?? 0) + s.ly,
        z: 0.4,
        yaw: s.yaw
      }));

      // 震落石笋碎块对象（状态：none -> falling -> bounce1 -> bounce2 -> resting -> bitten -> none）
      const dropShard = {
        active: false,
        phase: 'none',
        x: 0, y: 0, z: 0,
        vx: 0, vy: 0, vz: 0,
        yaw: 0.4,
        bounces: 0,
        bitten: false,
        key: 'shardLarge'
      };

      // 独腿实时 IK 节点坐标（供 buildPartList 与接地印直接使用）
      const legState = {
        hipX: 0, hipY: 0, hipZ: 15.8,
        kneeX: 0, kneeY: 0.8, kneeZ: 9.2,
        footX: 0, footY: 0, footZ: 0
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 11.4,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        targetYaw: opts.homeYaw ?? 0,

        // 5 阶段刚性重兽单足跳步机：
        //   'balance' | 'crouch' | 'leap' | 'impact' | 'recover' | 'sniff' | 'munch'
        hopPhase: 'balance',
        phaseT: 0,
        phaseDur: 0.55,
        hopCount: 0,
        hopStartX: opts.homeX ?? 0,
        hopStartY: opts.homeY ?? 0,
        hopEndX: opts.homeX ?? 0,
        hopEndY: opts.homeY ?? 0,
        hopHeight: 11.5,
        isHappyHop: false,

        // 高层生态意图：'patrol' | 'approach' | 'eat' | 'celebrate'
        intent: 'patrol',
        approachHopsLeft: 0,
        patrolSeq: 1,
        munchCd: 0,

        torsoPose: 'calm',
        headPose: 'calm',
        earFlapTimer: 0,
        footLift: 0,
        seed: opts.seed ?? 29
      };

      function pickNextPatrolTarget(hx, hy, maxR, sMul, isIdle) {
        state.patrolSeq++;
        if (isIdle) {
          // 待机模式：在 home 周围极小半径内稳健小跳或原地轻跳
          const ang = state.patrolSeq * 2.15 + state.seed;
          const r = 4.5 * sMul;
          return { x: hx + Math.cos(ang) * r, y: hy + Math.sin(ang) * r, hopH: 8.5 * sMul };
        }
        // 巡游模式：选一个自然折返的溶洞落点，单跳步距 14~21 格
        const curAng = Math.atan2(state.y - hy, state.x - hx);
        const turn = ((state.patrolSeq % 2 === 0) ? 1 : -1) * (0.85 + ((state.patrolSeq * 37) % 100) / 100 * 1.15);
        const candAng = curAng + turn;
        const stepDist = (14.5 + ((state.patrolSeq * 53) % 100) / 100 * 6.5) * sMul;
        let tx = state.x + Math.cos(candAng) * stepDist;
        let ty = state.y + Math.sin(candAng) * stepDist;
        const dCenter = Math.hypot(tx - hx, ty - hy);
        const safeR = Math.max(18, maxR - 9 * sMul);
        if (dCenter > safeR) {
          const pullAng = Math.atan2(hy - state.y, hx - state.x) + (((state.patrolSeq % 3) - 1) * 0.45);
          tx = state.x + Math.cos(pullAng) * stepDist;
          ty = state.y + Math.sin(pullAng) * stepDist;
        }
        return { x: tx, y: ty, hopH: 12.2 * sMul };
      }

      function spawnFallingShard(hx, hy, maxR, sMul, isIdle) {
        // 在雷牛正前方偏侧 16~22 格处高空震落新石笋碎块（避免直接砸头穿模）
        const sideOff = ((state.hopCount % 2 === 0) ? 1 : -1) * (0.28 + ((state.hopCount * 19) % 10) * 0.03);
        const dropYaw = state.yaw + sideOff;
        const dist = (isIdle ? 15.5 : 19.5) * sMul;
        let dx = state.x - Math.sin(dropYaw) * dist;
        let dy = state.y + Math.cos(dropYaw) * dist;
        // 限制在平台安全范围内
        const dC = Math.hypot(dx - hx, dy - hy);
        const limR = Math.max(16, maxR - 10 * sMul);
        if (dC > limR) {
          dx = hx + (dx - hx) * (limR / dC);
          dy = hy + (dy - hy) * (limR / dC);
        }
        dropShard.active = true;
        dropShard.phase = 'falling';
        dropShard.x = dx;
        dropShard.y = dy;
        dropShard.z = 44.0 * sMul;
        dropShard.vx = 0;
        dropShard.vy = 0;
        dropShard.vz = -8.0 * sMul;
        dropShard.yaw = (state.hopCount * 1.3) % TAU;
        dropShard.bounces = 0;
        dropShard.bitten = false;
        dropShard.key = (state.hopCount % 3 === 0) ? 'shardSmall' : 'shardLarge';
      }

      function emitThunderImpact(vfx, habitat, x, y, power, sMul, fxCol) {
        if (!vfx) return;
        // 1. 环形岩尘粒子（外扩喷散）
        const dustCount = Math.round(11 * power);
        for (let i = 0; i < dustCount; i++) {
          const a = (i / dustCount) * TAU + Math.random() * 0.3;
          const sp = (9 + Math.random() * 14) * power * sMul;
          vfx.spawnParticle(
            x + Math.cos(a) * 3.8 * sMul,
            y + Math.sin(a) * 3.8 * sMul,
            0.9 * sMul,
            Math.cos(a) * sp, Math.sin(a) * sp, (6.5 + Math.random() * 7.5) * power * sMul,
            0.46 + Math.random() * 0.24, 1.75 + Math.random() * 0.9,
            i % 3 === 0 ? fxCol.wave : fxCol.dust, i % 4 === 0, 26
          );
        }
        // 2. 青白声波双环（贴地快速扩散）
        vfx.addRipple(x, y, 4.2 * sMul, 24.0 * power * sMul, 0.62, 2.2);
        vfx.addRipple(x, y, 2.5 * sMul, 15.5 * power * sMul, 0.44, 1.5);
        // 3. 兼容生境默认足迹扬尘/微溅
        EnvFeedback.emitFootstep(vfx, habitat, x, y, 0.85 * power * sMul);
      }

      const instance = {
        def: Cave3Def,
        cachePrefix: `cave3_kui_${Math.random().toString(36).slice(2, 7)}`,
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
          state.x = homeX;
          state.y = homeY;
          state.z = 11.4;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.targetYaw = homeYaw;
          state.hopPhase = 'balance';
          state.phaseT = 0;
          state.phaseDur = 0.55;
          state.hopCount = 0;
          state.hopStartX = state.hopEndX = homeX;
          state.hopStartY = state.hopEndY = homeY;
          state.hopHeight = 11.5;
          state.isHappyHop = false;
          state.intent = 'patrol';
          state.approachHopsLeft = 0;
          state.torsoPose = 'calm';
          state.headPose = 'calm';
          state.earFlapTimer = 0;
          state.footLift = 0;

          bodyZSpring.x = 11.4; bodyZSpring.v = 0;
          balanceSpring.x = 0;  balanceSpring.v = 0;
          headYawSpring.x = 0;  headYawSpring.v = 0;
          headZSpring.x = 6.8;  headZSpring.v = 0;

          dropShard.active = false;
          dropShard.phase = 'none';

          for (const s of ambientShards) {
            s.x = homeX + s.lx;
            s.y = homeY + s.ly;
            s.z = 0.4;
          }

          const [tx, ty] = localToWorldXY(homeX, homeY, homeYaw, 0, -11.4);
          tailChain.reset(tx, ty, 19.6, homeYaw);

          legState.hipX = homeX; legState.hipY = homeY; legState.hipZ = 16.0;
          legState.kneeX = homeX; legState.kneeY = homeY + 0.8; legState.kneeZ = 9.2;
          legState.footX = homeX; legState.footY = homeY; legState.footZ = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul   = instance.scaleMul;
          const sp     = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq  = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const flex   = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const isIdle = !!(eco && (eco.action === 'idle' || eco.patrol === false));
          const hx     = (eco && eco.homeX) || 0;
          const hy     = (eco && eco.homeY) || 0;
          const maxR   = (eco && eco.maxRadius) || 46;
          const fxCol  = curSkin.fx || SKINS[0].fx;

          // 更新 2 块常驻石笋碎块坐标
          for (const s of ambientShards) {
            s.x = hx + s.lx * sMul;
            s.y = hy + s.ly * sMul;
            s.z = 0.35 * sMul;
          }

          // -----------------------------------------------------------------
          // 1. 更新高空震落的石笋碎块物理（高空坠落 -> 啪地弹跳 2 下 -> 静置待啃）
          // -----------------------------------------------------------------
          if (dropShard.active && (dropShard.phase === 'falling' || dropShard.phase === 'bounce1' || dropShard.phase === 'bounce2')) {
            dropShard.vz -= 128.0 * sMul * dt;
            dropShard.x += dropShard.vx * dt;
            dropShard.y += dropShard.vy * dt;
            dropShard.z += dropShard.vz * dt;
            if (dropShard.z <= 0.4 * sMul) {
              dropShard.z = 0.4 * sMul;
              dropShard.bounces++;
              if (dropShard.bounces === 1) {
                // 第一下重砸弹起
                dropShard.phase = 'bounce1';
                dropShard.vz = 26.0 * sMul;
                const pushAng = dropShard.yaw;
                dropShard.vx = Math.cos(pushAng) * 4.5 * sMul;
                dropShard.vy = Math.sin(pushAng) * 4.5 * sMul;
                if (vfx) {
                  vfx.addRipple(dropShard.x, dropShard.y, 1.5 * sMul, 11.0 * sMul, 0.45, 1.4);
                  for (let k = 0; k < 6; k++) {
                    const a = (k / 6) * TAU + Math.random() * 0.4;
                    vfx.spawnParticle(
                      dropShard.x, dropShard.y, 1.2 * sMul,
                      Math.cos(a) * 8 * sMul, Math.sin(a) * 8 * sMul, (6 + Math.random() * 5) * sMul,
                      0.38, 1.35, k % 2 === 0 ? fxCol.crumb : fxCol.dust, k === 0, 28
                    );
                  }
                }
              } else if (dropShard.bounces === 2) {
                // 第二下轻弹
                dropShard.phase = 'bounce2';
                dropShard.vz = 13.5 * sMul;
                dropShard.vx *= 0.45;
                dropShard.vy *= 0.45;
                if (vfx) {
                  vfx.addRipple(dropShard.x, dropShard.y, 1.0 * sMul, 6.5 * sMul, 0.35, 1.0);
                }
              } else {
                // 稳稳停在地面，吸引雷牛凑近啃食
                dropShard.phase = 'resting';
                dropShard.vx = 0;
                dropShard.vy = 0;
                dropShard.vz = 0;
              }
            }
          }

          // -----------------------------------------------------------------
          // 2. 5 阶段刚性重兽单足跳步机 + 石笋碎块嗅探啃食循环
          //    balance -> crouch -> leap -> impact -> recover（零滑步漂移）
          // -----------------------------------------------------------------
          const rate = clamp(gFreq * (0.65 + spdMul * 0.35), 0.45, 2.2);
          state.phaseT += dt * rate;
          if (state.earFlapTimer > 0) state.earFlapTimer = Math.max(0, state.earFlapTimer - dt);

          const standZ  = 11.4 * sMul;
          const crouchZ = 6.9 * sMul;
          let targetBodyZ  = standZ;
          let targetHeadZ  = 6.8 * sMul;
          let targetHeadYaw = Math.sin(time * 1.45) * 0.14;
          let footLiftNow  = 0;

          if (state.hopPhase === 'balance') {
            // 阶段 1：定立平衡微晃（重蹄钉地，呼吸与重心微摆）
            state.vx = 0; state.vy = 0;
            state.torsoPose = 'calm';
            state.headPose  = state.earFlapTimer > 0 ? 'flap' : 'calm';
            targetBodyZ = standZ + Math.sin(time * 3.1) * 0.38 * sMul;
            balanceSpring.update(dt, Math.sin(time * 2.2) * 0.65, 62 * sp, clamp(5.2 * dScale, 2.6, 9.5));

            if (state.phaseT >= state.phaseDur) {
              // 若地面已有落稳的石笋碎块，转入连蹦两小步凑近意图
              if (dropShard.active && dropShard.phase === 'resting' && state.intent === 'patrol') {
                state.intent = 'approach';
                state.approachHopsLeft = 2;
              }

              // 规划下一跳落点与目标朝向
              state.hopStartX = state.x;
              state.hopStartY = state.y;
              state.isHappyHop = false;

              if (state.intent === 'celebrate') {
                // 啃完满意地原地轻跳一下
                state.hopEndX = state.x;
                state.hopEndY = state.y;
                state.hopHeight = 8.4 * sMul;
                state.targetYaw = state.yaw;
                state.isHappyHop = true;
              } else if (state.intent === 'approach' && dropShard.active) {
                // 单腿咚、咚连蹦两小步凑近碎块（停在碎块前 ~13.5 格，嘴吻刚好够到碎块零穿模）
                const dxS = dropShard.x - state.x;
                const dyS = dropShard.y - state.y;
                const distS = Math.hypot(dxS, dyS) || 0.001;
                const stopDist = 13.8 * sMul;
                state.targetYaw = Math.atan2(-dxS, dyS);
                const remain = Math.max(0, distS - stopDist);
                const hopStep = state.approachHopsLeft > 1 ? remain * 0.55 : remain;
                state.hopEndX = state.x + (dxS / distS) * hopStep;
                state.hopEndY = state.y + (dyS / distS) * hopStep;
                state.hopHeight = 7.6 * sMul;
              } else {
                const nxt = pickNextPatrolTarget(hx, hy, maxR, sMul, isIdle);
                state.hopEndX = nxt.x;
                state.hopEndY = nxt.y;
                state.hopHeight = nxt.hopH;
                const dxP = state.hopEndX - state.x;
                const dyP = state.hopEndY - state.y;
                if (Math.hypot(dxP, dyP) > 1.5) {
                  state.targetYaw = Math.atan2(-dxP, dyP);
                }
              }

              state.hopPhase = 'crouch';
              state.phaseT = 0;
              state.phaseDur = state.isHappyHop ? 0.24 : 0.34;
            }
          } else if (state.hopPhase === 'crouch') {
            // 阶段 2：屈膝蓄力前倾（躯干切 torsoCrouch，膝关节前折下压，原地对准方向）
            const u = clamp(state.phaseT / Math.max(0.05, state.phaseDur), 0, 1);
            const ease = smoothstep(0, 1, u);
            state.vx = 0; state.vy = 0;
            state.torsoPose = 'crouch';
            state.headPose  = 'calm';
            targetBodyZ = lerp(standZ, crouchZ, ease);
            targetHeadZ = lerp(6.8, 5.4, ease) * sMul;
            // 起跳前在原地稳稳对准目标朝向，绝不滑步
            state.yaw = wrapAngle(state.yaw + wrapAngle(state.targetYaw - state.yaw) * expSmooth(dt, 11.0));
            balanceSpring.update(dt, 1.35 * ease, 88 * sp, clamp(6.5 * dScale, 3.0, 10.0));

            if (u >= 1) {
              state.hopPhase = 'leap';
              state.phaseT = 0;
              state.phaseDur = state.isHappyHop ? 0.36 : (state.intent === 'approach' ? 0.38 : 0.48);
              bodyZSpring.impulse(32.0 * sp * sMul);
              // 起跳蹬地微扬尘
              if (vfx) {
                vfx.spawnDust(state.x, state.y, 4, 0.55 * sMul, habitat ? habitat.fx : { dustRGB: '146,148,168' });
              }
            }
          } else if (state.hopPhase === 'leap') {
            // 阶段 3：单足爆发抛物线跃起（唯一发生水平位移的阶段，空中微前倾收蹄）
            const u = clamp(state.phaseT / Math.max(0.05, state.phaseDur), 0, 1);
            const prevX = state.x, prevY = state.y;
            state.x = lerp(state.hopStartX, state.hopEndX, u);
            state.y = lerp(state.hopStartY, state.hopEndY, u);
            state.vx = (state.x - prevX) / Math.max(dt, 0.001);
            state.vy = (state.y - prevY) / Math.max(dt, 0.001);
            // 起跳初段微调收齐朝向
            state.yaw = wrapAngle(state.yaw + wrapAngle(state.targetYaw - state.yaw) * expSmooth(dt, 9.0));

            const arc = 4.0 * u * (1.0 - u); // 标准抛物线 [0 -> 1 -> 0]
            state.torsoPose = 'leap';
            state.headPose  = 'calm';
            footLiftNow = arc * state.hopHeight;
            // 空中略收蹄（独腿微屈蓄势，不僵硬直棍）
            targetBodyZ = standZ + footLiftNow - Math.sin(u * Math.PI) * 1.4 * sMul;
            targetHeadZ = 7.4 * sMul;
            balanceSpring.update(dt, 0.85 * Math.cos(u * Math.PI), 75 * sp, clamp(6.0 * dScale, 3.0, 10.0));

            if (u >= 1) {
              // 落地重击！切入 impact 缓冲相
              state.x = state.hopEndX;
              state.y = state.hopEndY;
              state.vx = 0; state.vy = 0;
              state.hopPhase = 'impact';
              state.phaseT = 0;
              state.phaseDur = state.isHappyHop ? 0.24 : 0.34;
              state.earFlapTimer = 0.42;
              state.hopCount++;

              const impactPower = state.isHappyHop ? 0.72 : (state.intent === 'approach' ? 0.85 : 1.15);
              bodyZSpring.impulse(-38.0 * impactPower * sp * sMul);
              headZSpring.impulse(-16.0 * impactPower * sp * sMul);
              // 尾部落地惯性甩动
              const tailSide = (state.hopCount % 2 === 0 ? 1 : -1) * 0.85;
              headYawSpring.impulse(tailSide * 3.8 * sp);

              emitThunderImpact(vfx, habitat, state.x, state.y, impactPower, sMul, fxCol);

              // 巡游/待机每跳满 2~3 次重蹄砸地，周期性从上方高空震落一颗新石笋碎块
              if (state.intent === 'patrol' && !dropShard.active && state.hopCount >= 2) {
                state.hopCount = 0;
                spawnFallingShard(hx, hy, maxR, sMul, isIdle);
              }
            }
          } else if (state.hopPhase === 'impact') {
            // 阶段 4：重蹄砸地缓冲（躯干切 torsoCrouch，髋下压 + 耳尾惯性甩动）
            const u = clamp(state.phaseT / Math.max(0.05, state.phaseDur), 0, 1);
            state.vx = 0; state.vy = 0;
            state.torsoPose = u < 0.72 ? 'crouch' : 'calm';
            state.headPose  = 'flap';
            targetBodyZ = lerp(crouchZ + 0.5 * sMul, standZ - 0.6 * sMul, smoothstep(0.15, 1.0, u));
            targetHeadZ = lerp(5.0, 6.6, u) * sMul;
            balanceSpring.update(dt, -0.95 * (1 - u), 92 * sp, clamp(5.8 * dScale, 2.8, 10.0));

            if (u >= 1) {
              state.hopPhase = 'recover';
              state.phaseT = 0;
              state.phaseDur = state.isHappyHop ? 0.35 : 0.36;
            }
          } else if (state.hopPhase === 'recover') {
            // 阶段 5：稳住平衡（切回 torsoCalm，决定继续巡游或低头啃食石笋碎块）
            const u = clamp(state.phaseT / Math.max(0.05, state.phaseDur), 0, 1);
            state.vx = 0; state.vy = 0;
            state.torsoPose = 'calm';
            state.headPose  = state.earFlapTimer > 0 ? 'flap' : 'calm';
            targetBodyZ = standZ;
            balanceSpring.update(dt, 0, 72 * sp, clamp(5.6 * dScale, 2.8, 10.0));

            if (u >= 1) {
              if (state.intent === 'celebrate') {
                // 满意轻跳完毕，恢复自由巡游
                state.intent = 'patrol';
                state.hopPhase = 'balance';
                state.phaseT = 0;
                state.phaseDur = isIdle ? 0.95 : 0.60;
              } else if (state.intent === 'approach') {
                state.approachHopsLeft--;
                const dToShard = dropShard.active ? Math.hypot(dropShard.x - state.x, dropShard.y - state.y) : 99;
                if (state.approachHopsLeft <= 0 || dToShard <= 15.8 * sMul) {
                  // 凑近到位，开始低头嗅探石笋碎块
                  state.intent = 'eat';
                  state.hopPhase = 'sniff';
                  state.phaseT = 0;
                  state.phaseDur = 0.85;
                } else {
                  state.hopPhase = 'balance';
                  state.phaseT = 0;
                  state.phaseDur = 0.22;
                }
              } else {
                state.hopPhase = 'balance';
                state.phaseT = 0;
                state.phaseDur = isIdle ? 1.05 : 0.52;
              }
            }
          } else if (state.hopPhase === 'sniff') {
            // 交互相 A：低头凑近嗅探石笋碎块（单足稳立微前倾，头左右轻嗅）
            const u = clamp(state.phaseT / Math.max(0.05, state.phaseDur), 0, 1);
            state.vx = 0; state.vy = 0;
            state.torsoPose = 'crouch';
            state.headPose  = 'sniff';
            if (dropShard.active) {
              const aim = Math.atan2(-(dropShard.x - state.x), dropShard.y - state.y);
              state.yaw = wrapAngle(state.yaw + wrapAngle(aim - state.yaw) * expSmooth(dt, 8.0));
            }
            targetBodyZ   = lerp(standZ, 9.2 * sMul, smoothstep(0, 0.4, u));
            targetHeadZ   = 2.6 * sMul + Math.sin(time * 9.5) * 0.45 * sMul;
            targetHeadYaw = Math.sin(time * 7.2) * 0.22;
            balanceSpring.update(dt, 1.15, 70 * sp, clamp(6.0 * dScale, 3.0, 10.0));

            if (u >= 1) {
              state.hopPhase = 'munch';
              state.phaseT = 0;
              state.phaseDur = 1.25;
              state.munchCd = 0;
            }
          } else if (state.hopPhase === 'munch') {
            // 交互相 B：咔嚓啃食石笋碎块（爆出青灰矿屑与晶屑，碎块变残块后吃完）
            const u = clamp(state.phaseT / Math.max(0.05, state.phaseDur), 0, 1);
            state.vx = 0; state.vy = 0;
            state.torsoPose = 'crouch';
            state.headPose  = 'sniff';
            const chomp = Math.abs(Math.sin(u * Math.PI * 4.0));
            targetBodyZ   = 9.2 * sMul - chomp * 0.45 * sMul;
            targetHeadZ   = (2.2 + chomp * 1.35) * sMul;
            targetHeadYaw = Math.sin(u * Math.PI * 6.0) * 0.14;
            balanceSpring.update(dt, 1.2, 75 * sp, clamp(6.0 * dScale, 3.0, 10.0));

            // 啃到一半时碎块切换为被啃缺角的 shardBitten
            if (u >= 0.42 && dropShard.active && !dropShard.bitten) {
              dropShard.bitten = true;
              dropShard.key = 'shardBitten';
            }

            // 周期性爆出矿屑与晶屑微粒
            state.munchCd -= dt;
            if (state.munchCd <= 0 && dropShard.active && vfx) {
              state.munchCd = 0.22;
              for (let k = 0; k < 5; k++) {
                const a = Math.random() * TAU;
                const spd = (6 + Math.random() * 10) * sMul;
                vfx.spawnParticle(
                  dropShard.x + (Math.random() - 0.5) * 2.5 * sMul,
                  dropShard.y + (Math.random() - 0.5) * 2.5 * sMul,
                  3.2 * sMul,
                  Math.cos(a) * spd, Math.sin(a) * spd, (8 + Math.random() * 8) * sMul,
                  0.42 + Math.random() * 0.18, 1.45,
                  k % 2 === 0 ? fxCol.crumb : fxCol.spark, k === 0, 32
                );
              }
            }

            if (u >= 1) {
              // 啃食完毕！碎块消失，切入满意原地轻跳
              dropShard.active = false;
              dropShard.phase = 'none';
              state.intent = 'celebrate';
              state.hopPhase = 'balance';
              state.phaseT = 0;
              state.phaseDur = 0.26;
            }
          }

          // 弹簧平滑更新躯干高度、头高与头转角
          state.z = bodyZSpring.update(dt, targetBodyZ, 108 * sp, clamp(9.2 * dScale, 4.2, 14.0));
          state.z = Math.max(6.2 * sMul, state.z);
          state.footLift = footLiftNow;
          headZSpring.update(dt, targetHeadZ, 96 * sp, clamp(8.2 * dScale, 3.8, 13.0));
          headYawSpring.update(dt, targetHeadYaw, 118 * sp, clamp(7.8 * dScale, 3.5, 12.5));

          // -----------------------------------------------------------------
          // 3. 正腹中置独腿矢状面 2-Bone IK 解算（100% 重心落点对齐，零脱节）
          // -----------------------------------------------------------------
          const balFwd = clamp(balanceSpring.x, -1.6, 1.8) * sMul;
          const [bx, by] = localToWorldXY(state.x, state.y, state.yaw, 0, balFwd * 0.55);
          const [hipWX, hipWY] = localToWorldXY(bx, by, state.yaw, 0, -0.8 * sMul);
          const hipWZ = state.z + 4.8 * sMul;

          // 腾空相重蹄略向腹下微收，着地相重蹄严密钉在重心落点
          const footBack = state.hopPhase === 'leap' ? -1.2 * sMul : 0;
          const [footWX, footWY] = localToWorldXY(state.x, state.y, state.yaw, 0, footBack);
          const footWZ = Math.max(0, state.footLift);

          // 矢状面 2-Bone IK：kneeSign = +1 让膝盖朝 +Y 正前方自然屈折
          const ik = solveSagittalLegIK(
            hipWX, hipWY, hipWZ,
            footWX, footWY, footWZ + 2.4 * sMul,
            state.yaw,
            6.2 * sMul, 6.4 * sMul,
            1, sMul
          );
          legState.hipX = hipWX; legState.hipY = hipWY; legState.hipZ = hipWZ;
          legState.kneeX = ik.kx; legState.kneeY = ik.ky; legState.kneeZ = Math.max(footWZ + 3.2 * sMul, ik.kz);
          legState.footX = footWX; legState.footY = footWY; legState.footZ = footWZ;

          instance.footContacts = [{ x: footWX, y: footWY, z: footWZ, r: 4.8 * sMul }];

          // -----------------------------------------------------------------
          // 4. 短壮牛尾 ChainSolver（落地砸地时惯性大幅甩动）
          // -----------------------------------------------------------------
          const [tailRootX, tailRootY] = localToWorldXY(bx, by, state.yaw, 0, -11.4 * sMul);
          const tailAmp = (state.hopPhase === 'impact' || state.earFlapTimer > 0) ? 0.78 : (state.hopPhase === 'leap' ? 0.45 : 0.20);
          const tailFreq = (state.hopPhase === 'impact' || state.earFlapTimer > 0) ? 12.5 : 4.2;
          tailChain.update(dt, tailRootX, tailRootY, state.z + 8.4 * sMul, state.yaw, time, {
            segLen: 2.2 * sMul,
            flexibility: flex,
            waveFreq: tailFreq,
            waveAmp: tailAmp,
            zTargetFn: (u) => Math.max(2.6 * sMul, state.z + (8.4 - u * 3.0 + (state.hopPhase === 'impact' ? u * 2.4 : 0)) * sMul)
          });

          // 更新挂点追踪
          sockets.setWorld('hoof', footWX, footWY, footWZ, state.yaw);
          sockets.setWorld('hip', hipWX, hipWY, hipWZ, state.yaw);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = habitat && habitat.isWater;
          const yw = state.yaw;
          const balFwd = clamp(balanceSpring.x, -1.6, 1.8) * sMul;
          const [bx, by] = localToWorldXY(state.x, state.y, yw, 0, balFwd * 0.55);
          const bz = state.z;

          // 1. 常驻溶洞石笋碎块（2 块立体体素件）
          for (const s of ambientShards) {
            list.push({
              partKey: s.key,
              asset: parts[s.key],
              x: s.x,
              y: s.y,
              lift: Math.max(0.2, s.z),
              ro: s.yaw,
              bias: -0.60
            });
          }

          // 2. 高空震落的可啃食新石笋碎块
          if (dropShard.active) {
            list.push({
              partKey: dropShard.key,
              asset: parts[dropShard.key],
              x: dropShard.x,
              y: dropShard.y,
              lift: Math.max(0.2, dropShard.z),
              ro: dropShard.yaw,
              bias: -0.45
            });
          }

          // 3. 正腹中置粗壮独腿（宽大重蹄 -> 小腿 -> 弯膝 -> 大腿，4 段高重叠连续衔接）
          //    独腿始终位于腹底下方，给足负 bias 保证任何俯视角度与腾空屈膝下躯干稳盖大腿与膝盖
          const hoofSub = isWater ? EnvFeedback.calcSubmerge(legState.footZ + 0.6, 1.2, 3.0, true) * 0.42 : 0;
          list.push({
            partKey: 'hoof',
            asset: parts.hoof,
            x: legState.footX,
            y: legState.footY,
            lift: Math.max(0, legState.footZ),
            ro: yw,
            bias: -4.2,
            submerge: hoofSub
          });
          list.push({
            partKey: 'legShin',
            asset: parts.legShin,
            x: lerp(legState.footX, legState.kneeX, 0.50),
            y: lerp(legState.footY, legState.kneeY, 0.50),
            lift: Math.max(1.2 * sMul, lerp(legState.footZ + 2.2 * sMul, legState.kneeZ, 0.46) - 2.6 * sMul),
            ro: yw,
            symDeg: 90,
            bias: -4.5
          });
          list.push({
            partKey: 'legKnee',
            asset: parts.legKnee,
            x: legState.kneeX,
            y: legState.kneeY,
            lift: Math.max(2.0 * sMul, legState.kneeZ - 2.6 * sMul),
            ro: yw,
            bias: -4.8
          });
          list.push({
            partKey: 'legThigh',
            asset: parts.legThigh,
            x: lerp(legState.kneeX, legState.hipX, 0.58),
            y: lerp(legState.kneeY, legState.hipY, 0.58),
            lift: Math.max(3.2 * sMul, lerp(legState.kneeZ, legState.hipZ, 0.56) - 3.6 * sMul),
            ro: yw,
            symDeg: 90,
            bias: -5.2
          });

          // 4. 短壮甩尾（3 节连续衔接，臀根深嵌）
          const tailKeys = ['tailBase', 'tailMid', 'tailTuft'];
          for (let i = 0; i < tailChain.nodes.length; i++) {
            const nd = tailChain.nodes[i];
            list.push({
              partKey: tailKeys[i],
              asset: parts[tailKeys[i]],
              x: nd.x,
              y: nd.y,
              lift: Math.max(1.0 * sMul, nd.z - 1.8 * sMul),
              ro: nd.yaw,
              symDeg: 90,
              bias: -0.32 - i * 0.04
            });
          }

          // 5. 浑圆厚重无角壮牛主躯干（3 档无损烘焙，零小数缩放）
          const tKey = state.torsoPose === 'crouch'
            ? 'torsoCrouch'
            : (state.torsoPose === 'leap' ? 'torsoLeap' : 'torsoCalm');
          list.push({
            partKey: tKey,
            asset: parts[tKey],
            x: bx,
            y: by,
            lift: Math.max(2.0 * sMul, bz),
            ro: yw,
            bias: 0.35
          });

          // 6. 独立无角大牛首（pivotToWorldXY 锁死后颈枢轴，深嵌前胸永不分离）
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.68, 0.68));
          const neckFwd = (state.torsoPose === 'crouch' ? 11.4 : 10.8) * sMul;
          const [hjx, hjy] = localToWorldXY(bx, by, yw, 0, neckFwd);
          const [hxPos, hyPos] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const hKey = state.headPose === 'sniff'
            ? 'headSniff'
            : (state.headPose === 'flap' ? 'headFlap' : 'headCalm');
          list.push({
            partKey: hKey,
            asset: parts[hKey],
            x: hxPos,
            y: hyPos,
            lift: Math.max(1.8 * sMul, bz + headZSpring.x - 1.2 * sMul),
            ro: hYaw,
            bias: 0.80
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Cave3Def.id,
            code: Cave3Def.code,
            name: Cave3Def.name,
            status: Cave3Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            hopPhase: state.hopPhase,
            intent: state.intent,
            torsoPose: state.torsoPose,
            headPose: state.headPose,
            footRadius: Cave3Def.footRadius,
            headZ: 28,
            centerZ: 16,
            blocks: Cave3Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map((k) => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Cave3Def);
})(window.PixelWorkshop);
