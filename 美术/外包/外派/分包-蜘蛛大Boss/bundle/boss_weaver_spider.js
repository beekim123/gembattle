'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const {
    TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle,
    localToWorldXY, pivotToWorldXY
  } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { solveIK2D, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 蜘蛛大 Boss · 织茧棘蛛母（boss_weaver_spider）
  //
  // 【结构与技术要点】
  // 1. 色表 30 色（<= 42 / 48，0 重色），glowKeys 仅含丝腺与毒核 3 键，eyeGlint 严格隔离。
  // 2. 部件尺寸全部严格 <= 40 格，8 条高拱长腿共享同一套 3 段对称硬壳腿资产，
  //    3 只裂茧小蛛共享同一套 spiderling 资产，eggSac 与 venomOrb 使用 symDeg=90。
  // 3. 内部实现八足四相交替步态（A 组 L1/R2/L3/R4，B 组 R1/L2/R3/L4，占空比 β=0.56），
  //    逐腿调用 PW.Solvers.solveIK2D 解算高拱膝节，支撑期世界坐标钉地零滑冰。
  // 4. 完整实现 7 个动作状态机（patrol / idle / stagger + 4 大 Boss 技能）与 4 套零重建模换色。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 主甲壳（玄青重甲）
      chitinDark:   '#131722',
      chitinMid:    '#242a38',
      chitinHi:     '#46516b',
      // 高对比猩红背棘纹与棘甲片
      patternDark:  '#7d1620',
      patternMid:   '#d9323a',
      patternHi:    '#ff7878',
      // 腹底暗灰软膜
      bellyDark:    '#1a1d26',
      bellyMid:     '#323746',
      bellyHi:      '#52596e',
      // 硬壳长腿
      limbDark:     '#171b28',
      limbMid:      '#2e3547',
      limbHi:       '#55607c',
      // 节肢亮色关节环
      jointDark:    '#5c282e',
      jointMid:     '#a84248',
      jointHi:      '#e8867c',
      // 骨白/暗金毒螯
      fangDark:     '#6b5e4c',
      fangMid:      '#bfb094',
      fangHi:       '#f5ebd6',
      // 洁白蛛丝与丝茧
      silkDark:     '#8b97a8',
      silkMid:      '#cfd8e6',
      silkHi:       '#f4f8ff',
      // 6 颗赤红复眼（eyeGlint 绝不进 glowKeys）
      eyeDark:      '#4a0810',
      eyeIris:      '#e62230',
      eyeGlint:     '#fff2f2',
      // 丝腺纹与毒囊核（唯一进入 glowKeys 的自亮区）
      emissiveMid:  '#e04826',
      emissiveHot:  '#ff6e40',
      emissiveCore: '#ffd094',
      // 半透毒液球外壳
      venomDark:    '#7a1e18',
      venomMid:     '#cf3d28',
      venomHi:      '#ff8b5c'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'chitin', 'pattern', 'belly', 'limb', 'joint', 'fang', 'silk', 'eye', 'emissive', 'venom'
    ],
    noCrease: [
      ['eye', 'chitin'], ['eye', 'pattern'],
      ['emissive', 'chitin'], ['emissive', 'belly'], ['emissive', 'pattern'], ['emissive', 'venom'],
      ['limb', 'joint'], ['chitin', 'joint'], ['silk', 'emissive']
    ],
    materials: {
      chitin:  ['chitinDark',  'chitinMid',  'chitinHi'],
      pattern: ['patternDark', 'patternMid', 'patternHi'],
      belly:   ['bellyDark',   'bellyMid',   'bellyHi'],
      limb:    ['limbDark',    'limbMid',    'limbHi'],
      joint:   ['jointDark',   'jointMid',   'jointHi'],
      fang:    ['fangDark',    'fangMid',    'fangHi'],
      silk:    ['silkDark',    'silkMid',    'silkHi'],
      venom:   ['venomDark',   'venomMid',   'venomHi']
    },
    protectedParts: ['eye', 'emissive']
  });

  // 4 套零重建模一键换色皮肤
  const SKINS = [
    {
      id: 'crimson_bark',
      name: '玄甲赤纹',
      dot: '#d9323a',
      outline: '#0b0d14',
      pal: {},
      fx: {
        slashA: '#ff4b4b', slashB: '#ff6e40',
        venomA: '#ff6e40', venomB: '#d9323a', venomCore: '#ffd094',
        puddle: '#9c261d', puddleDark: '#59120e', puddleHi: '#ff8a5c',
        silk: '#f4f8ff', silkDim: '#cbd8e8'
      }
    },
    {
      id: 'jade_moss',
      name: '苔绿毒棘',
      dot: '#47c956',
      outline: '#09140e',
      pal: {
        chitinDark:   '#111d16', chitinMid:    '#1c2e24', chitinHi:     '#385745',
        patternDark:  '#216b2b', patternMid:   '#47c956', patternHi:    '#99f28d',
        bellyDark:    '#142119', bellyMid:     '#263b2f', bellyHi:      '#41614f',
        limbDark:     '#132119', limbMid:      '#243b2e', limbHi:       '#446953',
        jointDark:    '#2b5732', jointMid:     '#559c52', jointHi:      '#9de084',
        fangDark:     '#596649', fangMid:      '#a3b888', fangHi:       '#e3f2cc',
        eyeDark:      '#2e4a0c', eyeIris:      '#82e62e', eyeGlint:     '#f2ffde',
        emissiveMid:  '#52cc29', emissiveHot:  '#8cff4a', emissiveCore: '#dcffad',
        venomDark:    '#1e5e22', venomMid:     '#44b83b', venomHi:      '#a4fa78'
      },
      fx: {
        slashA: '#64eb46', slashB: '#8cff4a',
        venomA: '#8cff4a', venomB: '#47c956', venomCore: '#e2ffc2',
        puddle: '#348f2e', puddleDark: '#194a17', puddleHi: '#9eff6b',
        silk: '#f2faf5', silkDim: '#c2dbc8'
      }
    },
    {
      id: 'frost_chitin',
      name: '霜白冰螯',
      dot: '#5ce6ff',
      outline: '#0c1724',
      pal: {
        chitinDark:   '#1a2b3d', chitinMid:    '#2c445c', chitinHi:     '#587da3',
        patternDark:  '#7ea8c4', patternMid:   '#d6f2ff', patternHi:    '#f7fdff',
        bellyDark:    '#182636', bellyMid:     '#2c4157', bellyHi:      '#4f6e8c',
        limbDark:     '#1d3042', limbMid:      '#35526e', limbHi:       '#668eb5',
        jointDark:    '#3c6c8a', jointMid:     '#72b6d9', jointHi:      '#bdeaff',
        fangDark:     '#5c8aa8', fangMid:      '#a8dcf5', fangHi:       '#e8faff',
        eyeDark:      '#0c3c59', eyeIris:      '#2ec4f2', eyeGlint:     '#e8fcff',
        emissiveMid:  '#26b2db', emissiveHot:  '#5ce6ff', emissiveCore: '#c4f8ff',
        venomDark:    '#1b6587', venomMid:     '#3db8e0', venomHi:      '#9ef0ff'
      },
      fx: {
        slashA: '#94ebff', slashB: '#5ce6ff',
        venomA: '#5ce6ff', venomB: '#38a6db', venomCore: '#d6f9ff',
        puddle: '#297fa3', puddleDark: '#124059', puddleHi: '#99f0ff',
        silk: '#f2fbff', silkDim: '#c4e2f0'
      }
    },
    {
      id: 'molten_plate',
      name: '熔岩赤甲',
      dot: '#f07428',
      outline: '#140c0b',
      pal: {
        chitinDark:   '#141114', chitinMid:    '#231f24', chitinHi:     '#473e47',
        patternDark:  '#8f3412', patternMid:   '#f07428', patternHi:    '#ffc266',
        bellyDark:    '#1c1618', bellyMid:     '#33272a', bellyHi:      '#574447',
        limbDark:     '#1a1518', limbMid:      '#2e262b', limbHi:       '#54474e',
        jointDark:    '#6e2e16', jointMid:     '#c45c23', jointHi:      '#ffa44d',
        fangDark:     '#6b4b38', fangMid:      '#c78f5c', fangHi:       '#ffe0a8',
        eyeDark:      '#591a08', eyeIris:      '#ff5917', eyeGlint:     '#fff0cc',
        emissiveMid:  '#e6731c', emissiveHot:  '#ffb838', emissiveCore: '#fff1a8',
        venomDark:    '#78270d', venomMid:     '#db5c18', venomHi:      '#ffb347'
      },
      fx: {
        slashA: '#ff8a30', slashB: '#ffb838',
        venomA: '#ffb838', venomB: '#f07428', venomCore: '#fff0ad',
        puddle: '#a83c14', puddleDark: '#591c09', puddleHi: '#ffba52',
        silk: '#faf2eb', silkDim: '#dbcbc0'
      }
    }
  ];

  // =========================================================================
  // 1. 头胸甲 + 6 颗 0.6 俯视零遮挡赤红复眼（22×20×14）
  // =========================================================================
  function buildCephalothorax(makeCanvas) {
    const W = 22, D = 20, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-9.8, 9.8, -9.2, 9.2, 0, H - 1, (x, y, z, X, Y) => {
      // 扁阔重甲主壳 + 后腰收束 + 前倾无遮挡额缘
      const dCore  = (Math.hypot(X / 8.8, (Y - 0.2) / 7.8, (z - 5.2) / 4.8) - 1.0) * 5.4;
      const dBrow  = (Math.hypot(X / 7.4, (Y - 5.2) / 4.2, (z - 4.4) / 3.2) - 1.0) * 3.6;
      const dWaist = (Math.hypot(X / 4.8, (Y + 6.8) / 3.4, (z - 4.6) / 3.2) - 1.0) * 3.2;
      const d = smin(smin(dCore, dBrow, 1.5), dWaist, 1.4);
      if (d > 0) return;

      // 前额上方特意缓坡压低，保证 6 颗复眼在 0.6 俯视角下零遮挡
      if (Y > 4.2 && z > 8.6 - (Y - 4.2) * 0.45) return;

      // 底部软腹膜、侧壁髋窝护环、背甲猩红 V 纹脊甲
      const isBelly = z <= 2;
      const isHipPad = Math.abs(X) > 6.8 && Y > -4.8 && Y < 5.6 && z >= 3 && z <= 5;
      const vRidge = Math.abs(Math.abs(X) - (2.6 - Y * 0.42)) < 1.35 && Y >= -4.8 && Y <= 2.4 && z >= 8;

      if (isBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (vRidge) {
        m.setRaw(x, y, z, mat('pattern'), partId.pattern);
      } else if (isHipPad) {
        m.setRaw(x, y, z, mat('joint'), partId.joint);
      } else {
        m.setRaw(x, y, z, mat('chitin'), partId.chitin);
      }
    });

    // 后背一对翘起小棘角，增强头胸甲层次
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 3.6, -2.5, 8.8, s * 5.2, -5.2, 11.4, 1.35, 0.55, mat('pattern'), partId.pattern, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 表面精雕 6 颗赤红复眼：2 大居中 + 4 小外弧排（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const paintEyeBlock = (cx, cy, cz, big) => {
      const ix = Math.round(hw + cx);
      const iy = Math.round(hd + cy);
      if (big) {
        for (let dx = 0; dx <= 1; dx++) {
          for (let dy = -1; dy <= 0; dy++) {
            for (let dz = 0; dz <= 1; dz++) {
              const isGlint = (dx === (cx > 0 ? 1 : 0) && dy === 0 && dz === 1);
              const isDark  = (dy === -1 && dz === 0);
              const cid = isGlint ? keyToId.eyeGlint : (isDark ? keyToId.eyeDark : keyToId.eyeIris);
              m.setRaw(ix + dx, iy + dy, cz + dz, cid, partId.eye);
            }
          }
        }
      } else {
        m.setRaw(ix, iy, cz, keyToId.eyeIris, partId.eye);
        m.setRaw(ix, iy - 1, cz, keyToId.eyeDark, partId.eye);
        m.setRaw(ix, iy, cz + 1, keyToId.eyeGlint, partId.eye);
        m.setRaw(ix + (cx > 0 ? -1 : 1), iy, cz, keyToId.eyeIris, partId.eye);
      }
    };

    // 2 颗居中主大眼
    paintEyeBlock(-2.4, 8.2, 6, true);
    paintEyeBlock( 1.4, 8.2, 6, true);
    // 4 颗两侧弧排辅眼
    paintEyeBlock(-4.8, 7.2, 6, false);
    paintEyeBlock( 4.8, 7.2, 6, false);
    paintEyeBlock(-6.8, 5.4, 6, false);
    paintEyeBlock( 6.8, 5.4, 6, false);

    return m.toStripAsset(makeCanvas, { footRadius: 10.2, headZ: 13, centerZ: 6 });
  }

  // =========================================================================
  // 2. 高耸猩红棘纹巨型腹囊（28×30×22，常态 + 丝腺脉冲两档无损共用几何）
  // =========================================================================
  function buildAbdomenPair(makeCanvas) {
    const W = 28, D = 30, H = 22;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-12.6, 12.6, -14.0, 14.2, 0, H - 1, (x, y, z, X, Y) => {
      // 巨型向后上方高耸的主腹囊 + 前端细腰柄深嵌头胸甲
      const tiltZ = 9.2 - Y * 0.22;
      const dMain  = (Math.hypot(X / 11.4, (Y + 1.8) / 11.8, (z - tiltZ) / 8.2) - 1.0) * 8.4;
      const dCrown = (Math.hypot(X / 8.2,  (Y + 4.4) / 8.4,  (z - 14.0) / 5.4) - 1.0) * 5.6;
      const dNeck  = (Math.hypot(X / 4.2,  (Y - 10.8) / 4.2, (z - 4.4) / 3.2) - 1.0) * 3.4;
      const d = smin(smin(dMain, dCrown, 2.2), dNeck, 1.8);
      if (d > 0) return;

      // 3 道深切甲沟增强分段轮廓
      const grooveYs = [4.2, -1.6, -7.2];
      let inGroove = false;
      for (let i = 0; i < grooveYs.length; i++) {
        const gy = grooveYs[i] - Math.abs(X) * 0.16;
        if (Math.abs(Y - gy) < 0.65 && z >= 8) {
          if (z >= 15 && Math.abs(Y - gy) < 0.45) return;
          inGroove = true;
        }
      }

      // 腹底软膜 vs 主甲壳 vs 背脊中央猩红菱纹
      const isBelly = z <= 4;
      const isCenterDiamond = Math.abs(X) + Math.abs(Y + 1.6) * 0.55 < 4.2 && z >= 15;
      if (isBelly) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (inGroove) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (isCenterDiamond) {
        m.setRaw(x, y, z, mat('pattern'), partId.pattern);
      } else {
        m.setRaw(x, y, z, mat('chitin'), partId.chitin);
      }
    });

    // 背部 3 对高耸对称猩红棘刺甲片（俯视清晰勾勒大 Boss 荆棘王冠剪影）
    const spinePairs = [
      { x0: 3.4, y0:  3.6, z0: 13.8, x1: 6.4, y1:  1.4, z1: 18.2, r0: 2.3, r1: 0.72 },
      { x0: 4.4, y0: -1.6, z0: 15.2, x1: 8.6, y1: -4.4, z1: 20.4, r0: 2.6, r1: 0.78 },
      { x0: 3.4, y0: -7.0, z0: 14.4, x1: 6.6, y1: -10.8, z1: 19.0, r0: 2.2, r1: 0.68 }
    ];
    for (const sp of spinePairs) {
      for (const s of [-1, 1]) {
        m.paintCapsule(
          s * sp.x0, sp.y0, sp.z0,
          s * sp.x1, sp.y1, sp.z1,
          sp.r0, sp.r1, mat('pattern'), partId.pattern, true
        );
      }
    }
    // 背脊中轴棘棱
    m.paintCapsule(0, 4.6, 13.6, 0, -9.8, 17.6, 1.55, 0.85, mat('pattern'), partId.pattern, true);

    m.despeckle();
    m.applyArtShading(true);

    // 腹侧丝腺亮纹（唯一进入 glowKeys 的主躯干区域，常态克制、蓄力态脉冲大亮）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const paintGland = (target, bright) => {
      const midKey = bright ? keyToId.emissiveHot : keyToId.emissiveMid;
      const coreKey = bright ? keyToId.emissiveCore : keyToId.emissiveHot;
      const veinPts = [
        [8.4,  2.0, 6], [9.6, -1.2, 7], [9.4, -4.6, 7], [7.8, -8.0, 6],
        [6.2, -10.4, 5], [3.6, -11.8, 5]
      ];
      for (const s of [-1, 1]) {
        for (let i = 0; i < veinPts.length; i++) {
          const [vx, vy, vz] = veinPts[i];
          const gx = Math.round(hw + s * vx);
          const gy = Math.round(hd + vy);
          if (target.inB(gx, gy, vz) && target.getId(gx, gy, vz)) {
            target.setRaw(gx, gy, vz, (i & 1) ? coreKey : midKey, partId.emissive);
            if (target.inB(gx, gy, vz + 1) && target.getId(gx, gy, vz + 1)) {
              target.setRaw(gx, gy, vz + 1, midKey, partId.emissive);
            }
          }
          // 脉冲态同步点亮棘甲根部脉动亮核与侧翼丝脉
          if (bright && i < 4) {
            const sx = Math.round(hw + s * (vx * 0.62));
            const sy = Math.round(hd + vy - 0.5);
            const sz = vz + 8;
            if (target.inB(sx, sy, sz) && target.getId(sx, sy, sz)) {
              target.setRaw(sx, sy, sz, coreKey, partId.emissive);
            }
          }
        }
      }
      if (bright) {
        // 背脊中轴蓄力亮脉
        for (let yOff = -8; yOff <= 3; yOff += 3) {
          const cx = Math.round(hw);
          const cy = Math.round(hd + yOff);
          for (let z = H - 1; z >= 12; z--) {
            if (target.getId(cx, cy, z)) {
              target.setRaw(cx, cy, z, keyToId.emissiveCore, partId.emissive);
              break;
            }
          }
        }
      }
    };

    const mPulse = new VoxelModel(W, D, H, SPEC);
    mPulse.grid.set(m.grid);
    mPulse.parts.set(m.parts);

    paintGland(m, false);
    paintGland(mPulse, true);

    const meta = { footRadius: 13.5, headZ: 21, centerZ: 10 };
    return {
      abdomen: m.toStripAsset(makeCanvas, meta),
      abdomenPulse: mPulse.toStripAsset(makeCanvas, meta)
    };
  }

  // =========================================================================
  // 3. 尾端三瓣纺丝器（10×10×8）
  // =========================================================================
  function buildSpinneret(makeCanvas) {
    const W = 10, D = 10, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 基座环（深嵌腹囊后尾）
    m.paintEllipsoid(0, 2.2, 3.6, 3.0, 2.4, 2.6, mat('joint'), partId.joint, true);
    // 上中瓣 + 左右下瓣共三瓣纺丝喷口（末端带白丝感）
    m.paintCapsule(0, 1.4, 4.4, 0, -3.6, 5.4, 1.5, 0.65, mat('chitin'), partId.chitin, true);
    m.paintEllipsoid(0, -3.8, 5.4, 0.8, 0.9, 0.8, mat('silk'), partId.silk, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.4, 1.4, 3.0, s * 3.1, -3.2, 2.4, 1.35, 0.62, mat('chitin'), partId.chitin, true);
      m.paintEllipsoid(s * 3.3, -3.5, 2.3, 0.78, 0.85, 0.75, mat('silk'), partId.silk, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 7, centerZ: 4 });
  }

  // =========================================================================
  // 4. 偏心枢轴锁死双镰毒螯（8×12×8，枢轴锁死在螯根 (-side*1.4, -4.0)）
  // =========================================================================
  function buildFang(makeCanvas, side) {
    const W = 8, D = 12, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 粗壮玄甲螯基 + 亮红关节环
    m.paintEllipsoid(-side * 1.4, -4.0, 4.2, 1.85, 1.85, 1.85, mat('joint'), partId.joint, true);
    m.paintCapsule(-side * 1.3, -3.8, 4.2, side * 1.2, -0.4, 4.0, 1.75, 1.45, mat('chitin'), partId.chitin, true);
    // 骨白弯镰毒牙，向内猛然勾弯
    m.paintCapsule(side * 1.2, -0.4, 4.0, side * 1.7, 2.6, 3.3, 1.25, 0.92, mat('fang'), partId.fang, true);
    m.paintCapsule(side * 1.7, 2.6, 3.3, -side * 0.7, 5.1, 2.2, 0.90, 0.45, mat('fang'), partId.fang, true);
    // 螯背猩红棘棱
    m.paintCapsule(side * 0.4, -1.6, 5.2, side * 1.6, 1.8, 4.4, 0.62, 0.42, mat('pattern'), partId.pattern, false);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5, headZ: 7, centerZ: 4 });
  }

  // =========================================================================
  // 5. 前探短须肢（5×10×5，左右共享对称体素）
  // =========================================================================
  function buildPalp(makeCanvas) {
    const W = 5, D = 10, H = 5;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, -3.6, 2.4, 1.15, 1.15, 1.15, mat('joint'), partId.joint, true);
    m.paintCapsule(0, -3.4, 2.4, 0, 2.6, 2.3, 1.05, 0.82, mat('limb'), partId.limb, true);
    m.paintEllipsoid(0, 3.3, 2.1, 1.10, 1.30, 0.95, mat('pattern'), partId.pattern, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 4, centerZ: 2 });
  }

  // =========================================================================
  // 6. 8 足共享 3 段硬壳棘刺连杆（全部左右对称，渲染器自动只烘半周）
  //    legFemur (7×14×9) -> legTibia (7×13×13) -> legTarsus (5×11×11)
  //    经 IK 垂直跨度校核：髋(z≈10.5) -> 膝(z≈16.5~19.8) -> 踝(z≈8~10) -> 爪(z=0) 全程高重叠零断缝
  // =========================================================================
  function buildLegFemur(makeCanvas) {
    const W = 7, D = 14, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 髋部关节球（深嵌头胸甲侧壁 1.8 格）
    m.paintEllipsoid(0, -5.2, 1.6, 1.65, 1.65, 1.60, mat('joint'), partId.joint, true);
    // 斜向上高拱基股节
    m.paintCapsule(0, -5.0, 1.7, 0, 5.4, 7.2, 1.62, 1.40, mat('limb'), partId.limb, true);
    // 2 颗背侧猩红锐刺
    m.paintCapsule(0, -0.8, 4.6, 0, -2.0, 7.0, 0.82, 0.42, mat('pattern'), partId.pattern, true);
    m.paintCapsule(0,  2.8, 6.4, 0,  1.8, 8.4, 0.85, 0.42, mat('pattern'), partId.pattern, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 8, centerZ: 4 });
  }

  function buildLegTibia(makeCanvas) {
    const W = 7, D = 13, H = 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 尖刺高拱膝节护甲（俯视角下清晰勾勒荆棘折角）
    m.paintEllipsoid(0, -4.2, 10.6, 1.85, 1.85, 1.75, mat('joint'), partId.joint, true);
    m.paintCapsule(0, -4.2, 10.8, 0, -5.2, 12.4, 0.95, 0.45, mat('pattern'), partId.pattern, true);
    // 胫节长硬壳陡斜向下
    m.paintCapsule(0, -4.0, 10.4, 0, 4.0, 1.6, 1.48, 1.10, mat('limb'), partId.limb, true);
    // 胫节中段猩红装甲棱与踝环
    m.paintCapsule(0, -1.6, 8.4, 0, 1.2, 5.2, 0.85, 0.65, mat('pattern'), partId.pattern, false);
    m.paintEllipsoid(0, 4.0, 1.6, 1.28, 1.28, 1.18, mat('joint'), partId.joint, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2, headZ: 12, centerZ: 6 });
  }

  function buildLegTarsus(makeCanvas) {
    const W = 5, D = 11, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 锐利细长弯跗爪，顶端与胫节踝环高重叠、底端精准钉地 z=0
    m.paintCapsule(0, -3.4, 9.2, 0, 0.8, 3.6, 1.15, 0.86, mat('limb'), partId.limb, true);
    m.paintCapsule(0,  0.8, 3.6, 0, 3.8, 0.5, 0.84, 0.44, mat('fang'), partId.fang, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 10, centerZ: 4 });
  }

  // =========================================================================
  // 7. 技能立体道具：eggSac 丝茧球 / spiderling 小蛛 / venomOrb 毒囊弹
  // =========================================================================
  function buildEggSac(makeCanvas) {
    const W = 11, D = 11, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-4.8, 4.8, -4.8, 4.8, 0, H - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 4.2, Y / 4.2, (z - 4.8) / 4.4);
      if (r > 1.0) return;
      // 洁白丝带缠绕 + 缝隙透出淡红暖核
      const band = Math.abs(Math.sin((X + Y) * 0.75 + z * 0.45)) < 0.28;
      if (band && r > 0.72) {
        m.setRaw(x, y, z, mat('pattern'), partId.pattern);
      } else {
        m.setRaw(x, y, z, mat('silk'), partId.silk);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    // 顶/侧缝隙极少柔亮丝核
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    m.setRaw(Math.round(hw), Math.round(hd), 9, keyToId.emissiveHot, partId.emissive);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 10, centerZ: 5 });
  }

  function buildSpiderling(makeCanvas) {
    const W = 12, D = 13, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 一体化高辨识小蛛：小头胸 + 猩红斑腹囊 + 4 条外张折角小腿 + 2 颗赤红小眼
    m.paintEllipsoid(0,  2.6, 2.6, 2.2, 2.0, 1.7, mat('chitin'), partId.chitin, true);
    m.paintEllipsoid(0, -2.2, 3.6, 3.1, 3.4, 2.5, mat('chitin'), partId.chitin, true);
    m.paintEllipsoid(0, -2.4, 5.4, 1.8, 2.0, 1.1, mat('pattern'), partId.pattern, true);
    for (const s of [-1, 1]) {
      // 前斜腿与后斜腿（高拱折角）
      m.paintCapsule(s * 1.6,  2.2, 2.6, s * 4.4,  4.2, 4.2, 0.75, 0.62, mat('limb'), partId.limb, true);
      m.paintCapsule(s * 4.4,  4.2, 4.2, s * 5.2,  5.0, 0.5, 0.62, 0.45, mat('limb'), partId.limb, true);
      m.paintCapsule(s * 1.8,  0.4, 2.5, s * 4.8, -1.8, 4.4, 0.75, 0.62, mat('limb'), partId.limb, true);
      m.paintCapsule(s * 4.8, -1.8, 4.4, s * 5.2, -4.4, 0.5, 0.62, 0.45, mat('limb'), partId.limb, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    // 2 颗锐利赤红小眼（eyeGlint 不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 1.1);
      const ey = Math.round(hd + 4.2);
      m.setRaw(ex, ey, 3, keyToId.eyeIris, partId.eye);
      m.setRaw(ex, ey, 4, keyToId.eyeGlint, partId.eye);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 5.0, headZ: 7, centerZ: 3 });
  }

  function buildVenomOrb(makeCanvas) {
    const W = 8, D = 8, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-3.5, 3.5, -3.5, 3.5, 0, H - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y, z - 3.5);
      if (r > 3.2) return;
      if (r <= 1.75) {
        m.setRaw(x, y, z, r <= 0.95 ? keyToId.emissiveCore : keyToId.emissiveHot, partId.emissive);
      } else {
        m.setRaw(x, y, z, mat('venom'), partId.venom);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2, headZ: 7, centerZ: 4 });
  }

  // =========================================================================
  // 八足运动学骨架配置（4 对扇形大幅错开，相邻落点间距 >= 11.8 格 > 单步幅）
  // A 组 (group 0): L1, R2, L3, R4 (相位 0)
  // B 组 (group 1): R1, L2, R3, L4 (相位 π / 0.5)
  // =========================================================================
  const OCTO_LEG_SPECS = [
    { id: 'L1', pair: 0, side: -1, group: 0, hipX: -6.2, hipY: 10.6, hipZ: 3.3, restX: -18.2, restY:  19.8, L1: 12.2, L2: 16.8 },
    { id: 'R1', pair: 0, side:  1, group: 1, hipX:  6.2, hipY: 10.6, hipZ: 3.3, restX:  18.2, restY:  19.8, L1: 12.2, L2: 16.8 },
    { id: 'L2', pair: 1, side: -1, group: 1, hipX: -7.0, hipY:  7.6, hipZ: 3.1, restX: -23.4, restY:   8.4, L1: 12.8, L2: 17.6 },
    { id: 'R2', pair: 1, side:  1, group: 0, hipX:  7.0, hipY:  7.6, hipZ: 3.1, restX:  23.4, restY:   8.4, L1: 12.8, L2: 17.6 },
    { id: 'L3', pair: 2, side: -1, group: 0, hipX: -7.0, hipY:  4.6, hipZ: 2.9, restX: -23.4, restY:  -3.6, L1: 13.0, L2: 18.0 },
    { id: 'R3', pair: 2, side:  1, group: 1, hipX:  7.0, hipY:  4.6, hipZ: 2.9, restX:  23.4, restY:  -3.6, L1: 13.0, L2: 18.0 },
    { id: 'L4', pair: 3, side: -1, group: 1, hipX: -6.2, hipY:  1.6, hipZ: 2.7, restX: -18.6, restY: -15.0, L1: 13.8, L2: 19.2 },
    { id: 'R4', pair: 3, side:  1, group: 0, hipX:  6.2, hipY:  1.6, hipZ: 2.7, restX:  18.6, restY: -15.0, L1: 13.8, L2: 19.2 }
  ];

  // =========================================================================
  // 轻量 8 足四相交替步态求解器（占空比 β = 0.56，调用 PW.Solvers.solveIK2D）
  // =========================================================================
  class OctopodGait {
    constructor(specs) {
      this.gaitPhase = 0;
      this.idleTime = 0;
      this.prevYaw = 0;
      this.hasPrevYaw = false;
      this.legs = specs.map((s, index) => ({
        ...s,
        index,
        hipWX: s.hipX,
        hipWY: s.hipY,
        hipWZ: 10.5,
        footX: s.restX,
        footY: s.restY,
        footZ: 0,
        startX: s.restX,
        startY: s.restY,
        kneeX: (s.hipX + s.restX) * 0.5,
        kneeY: (s.hipY + s.restY) * 0.5,
        kneeZ: 17.0,
        stepping: false,
        isSettling: false,
        stepT: 0,
        justLanded: false
      }));
    }

    reset(bx, by, bz, yaw, sMul = 1.0) {
      this.gaitPhase = 0;
      this.idleTime = 0;
      this.prevYaw = yaw;
      this.hasPrevYaw = true;
      for (const leg of this.legs) {
        const [hx, hy] = localToWorldXY(bx, by, yaw, leg.hipX * sMul, leg.hipY * sMul);
        const [rx, ry] = localToWorldXY(bx, by, yaw, leg.restX * sMul, leg.restY * sMul);
        leg.hipWX = hx;
        leg.hipWY = hy;
        leg.hipWZ = bz + leg.hipZ * sMul;
        leg.footX = leg.startX = rx;
        leg.footY = leg.startY = ry;
        leg.footZ = 0;
        leg.stepping = false;
        leg.isSettling = false;
        leg.stepT = 0;
        leg.justLanded = false;
        this._solveLegIK(leg, sMul);
      }
    }

    _solveLegIK(leg, sMul) {
      const dx = leg.footX - leg.hipWX;
      const dy = leg.footY - leg.hipWY;
      const horiz = Math.hypot(dx, dy) || 0.001;
      const ik = solveIK2D(
        0, leg.hipWZ, horiz, leg.footZ,
        leg.L1 * sMul, leg.L2 * sMul, 1
      );
      const ratio = ik.kx / horiz;
      leg.kneeX = leg.hipWX + dx * ratio;
      leg.kneeY = leg.hipWY + dy * ratio;
      leg.kneeZ = Math.max(leg.footZ + 4.0 * sMul, ik.kz);
    }

    update(dt, bx, by, bz, yaw, vx, vy, opts = {}) {
      const sMul = opts.scaleMul ?? 1.0;
      const stepFreq = opts.stepFreq ?? 1.0;
      const stepHeight = (opts.stepHeight ?? 4.0) * sMul;
      const splayMul = opts.splayMul ?? 1.0;
      const overrides = opts.overrides || null;
      const forceCycle = !!opts.forceCycle;
      const landed = [];

      const yawRate = this.hasPrevYaw ? Math.abs(wrapAngle(yaw - this.prevYaw)) / Math.max(dt, 0.001) : 0;
      this.prevYaw = yaw;
      this.hasPrevYaw = true;

      const moveSpd = Math.hypot(vx, vy);
      const isMoving = forceCycle || moveSpd > 0.9 || yawRate > 0.16;
      if (isMoving) this.idleTime = 0;
      else this.idleTime += dt;

      // 占空比 β = 0.56 -> 摆动占比 0.44（交接期 8 足全着地防悬空）
      const swingFrac = 0.44;
      const strideLen = 10.6 * sMul;
      if (isMoving) {
        const effSpd = Math.max(moveSpd, forceCycle ? 12.0 * sMul : 0);
        const dPhase = ((effSpd / strideLen) + yawRate * 0.28) * dt * clamp(stepFreq, 0.45, 2.4);
        this.gaitPhase = (this.gaitPhase + dPhase) % 1;
      }

      const fwdX = -Math.sin(yaw), fwdY = Math.cos(yaw);
      const reachHalf = 3.2 * sMul;
      const maxFromIdeal = 6.4 * sMul;
      const settleThr = 1.25 * sMul;

      // 停步收足时按 A/B 组交替收拢，保证另一组 4 足稳稳撑地
      let activeSettleGroup = -1;
      for (const l of this.legs) {
        if (l.isSettling && l.stepping) { activeSettleGroup = l.group; break; }
      }
      if (!isMoving && this.idleTime > 0.12 && activeSettleGroup < 0) {
        let g0 = 0, g1 = 0;
        for (const l of this.legs) {
          const [ix, iy] = localToWorldXY(bx, by, yaw, l.restX * splayMul * sMul, l.restY * splayMul * sMul);
          const d = Math.hypot(ix - l.footX, iy - l.footY);
          if (l.group === 0) g0 = Math.max(g0, d);
          else g1 = Math.max(g1, d);
        }
        if (g0 > settleThr || g1 > settleThr) activeSettleGroup = g0 >= g1 ? 0 : 1;
      }

      let localRoll = 0;
      let localPitch = 0;

      for (const leg of this.legs) {
        leg.justLanded = false;
        const [hx, hy] = localToWorldXY(bx, by, yaw, leg.hipX * sMul, leg.hipY * sMul);
        leg.hipWX = hx;
        leg.hipWY = hy;
        leg.hipWZ = Math.max(4.5 * sMul, bz + leg.hipZ * sMul);

        const [idealX, idealY] = localToWorldXY(
          bx, by, yaw,
          leg.restX * splayMul * sMul,
          leg.restY * splayMul * sMul
        );

        const ov = overrides && overrides[leg.id];
        if (ov) {
          // 技能动作显式控制单腿（如织网拍地、扑杀高扬前腿、硬直外撇）
          leg.stepping = ov.z > 0.5;
          leg.isSettling = false;
          const [tx, ty] = localToWorldXY(
            bx, by, yaw,
            (leg.restX + (ov.lx || 0)) * splayMul * sMul,
            (leg.restY + (ov.ly || 0)) * splayMul * sMul
          );
          const kOv = expSmooth(dt, ov.snap || 16);
          leg.footX = lerp(leg.footX, tx, kOv);
          leg.footY = lerp(leg.footY, ty, kOv);
          leg.footZ = Math.max(0, lerp(leg.footZ, (ov.z || 0) * sMul, kOv));
          this._solveLegIK(leg, sMul);
          continue;
        }

        if (isMoving) {
          leg.isSettling = false;
          const phi = (this.gaitPhase + (leg.group ? 0.5 : 0)) % 1;
          const wantSwing = phi < swingFrac;
          const speedRatio = clamp(moveSpd / 12.5, 0.35, 1.15);
          const moveDirX = moveSpd > 1.0 ? vx / moveSpd : fwdX;
          const moveDirY = moveSpd > 1.0 ? vy / moveSpd : fwdY;
          const landX = idealX + moveDirX * reachHalf * speedRatio;
          const landY = idealY + moveDirY * reachHalf * speedRatio;

          if (wantSwing) {
            if (!leg.stepping) {
              leg.stepping = true;
              leg.startX = leg.footX;
              leg.startY = leg.footY;
            }
            const u = clamp(phi / swingFrac, 0, 1);
            leg.stepT = u;
            const sm = u * u * (3 - 2 * u);
            leg.footX = lerp(leg.startX, landX, sm);
            leg.footY = lerp(leg.startY, landY, sm);
            leg.footZ = Math.pow(Math.sin(u * Math.PI), 0.82) * stepHeight * (0.72 + 0.28 * speedRatio);
            const w = Math.sin(u * Math.PI);
            localRoll -= leg.side * w * 0.14;
            localPitch -= Math.sign(leg.restY) * w * 0.10;
          } else {
            if (leg.stepping) {
              leg.stepping = false;
              leg.stepT = 1;
              leg.footX = landX;
              leg.footY = landY;
              leg.footZ = 0;
              leg.justLanded = true;
              landed.push(leg);
            } else {
              leg.footZ = 0;
            }
            // 支撑期钉地，同时柔和限制最大偏离防止急转打架
            const dId = Math.hypot(leg.footX - idealX, leg.footY - idealY);
            if (dId > maxFromIdeal && dId > 0.001) {
              const kFix = maxFromIdeal / dId;
              leg.footX = idealX + (leg.footX - idealX) * kFix;
              leg.footY = idealY + (leg.footY - idealY) * kFix;
            }
          }
        } else {
          // 静止/待机：支撑脚牢牢钉地，偏移过大时按 A/B 组交替微抬归位
          if (leg.stepping && !leg.isSettling) {
            leg.isSettling = true;
            leg.stepT = 0.35;
            leg.startX = leg.footX;
            leg.startY = leg.footY;
          }
          const dId = Math.hypot(leg.footX - idealX, leg.footY - idealY);
          if (!leg.stepping && this.idleTime > 0.12 && activeSettleGroup === leg.group && dId > settleThr) {
            leg.stepping = true;
            leg.isSettling = true;
            leg.stepT = 0;
            leg.startX = leg.footX;
            leg.startY = leg.footY;
          }
          if (leg.stepping && leg.isSettling) {
            leg.stepT += dt / 0.16;
            if (leg.stepT >= 1) {
              leg.stepping = false;
              leg.isSettling = false;
              leg.stepT = 1;
              leg.footX = idealX;
              leg.footY = idealY;
              leg.footZ = 0;
              leg.justLanded = true;
              landed.push(leg);
            } else {
              const u = leg.stepT;
              const sm = u * u * (3 - 2 * u);
              leg.footX = lerp(leg.startX, idealX, sm);
              leg.footY = lerp(leg.startY, idealY, sm);
              leg.footZ = Math.sin(u * Math.PI) * stepHeight * 0.55;
            }
          } else {
            leg.footZ = 0;
            // 防止技能位移过大导致静立腿脱节
            if (dId > maxFromIdeal * 1.15 && dId > 0.001) {
              const kFix = (maxFromIdeal * 1.15) / dId;
              leg.footX = idealX + (leg.footX - idealX) * kFix;
              leg.footY = idealY + (leg.footY - idealY) * kFix;
            }
          }
        }

        this._solveLegIK(leg, sMul);
      }

      return { landed, localRoll, localPitch };
    }
  }

  // =========================================================================
  // Boss 资产定义（登记 ID：boss_weaver_spider）
  // =========================================================================
  const BossSpiderDef = {
    id: 'boss_weaver_spider',
    code: 'B01',
    status: 'done',
    name: '织茧棘蛛母',
    tag: '八足高拱 · 裂茧毒雨大首领',
    summary: '玄青重甲头胸 + 6 颗零遮挡赤红复眼 + 偏心锁死双毒螯 + 高耸猩红棘纹巨型腹囊 + 8 条高拱棘刺长腿与 4 大连续技能演出',
    defaultHabitat: 'ruins',
    footRadius: 21.0,
    ecoWeight: 2.6,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol',              name: '八足巡游', loop: true,  status: 'done' },
      { id: 'idle',                name: '原地警戒', loop: true,  status: 'done' },
      { id: 'stagger',             name: '破盾硬直', loop: false, duration: 1.5, status: 'done' },
      { id: 'skill_web_snare',     name: '织网缚阵', loop: false, duration: 2.6, status: 'done' },
      { id: 'skill_fang_lunge',    name: '毒螯扑杀', loop: false, duration: 2.2, status: 'done' },
      { id: 'skill_brood_burst',   name: '裂茧群涌', loop: false, duration: 3.0, status: 'done' },
      { id: 'skill_venom_barrage', name: '棘背毒雨', loop: false, duration: 3.4, status: 'done' }
    ],
    blocks: [
      '八足四相交替步态（A/B 组反相，β=0.56）',
      '高拱棘刺 3 段硬壳复用连杆（solveIK2D）',
      '0.6 俯视 0 遮挡 6 颗赤红复眼与锁死双毒螯',
      '高耸猩红棘纹腹囊与丝腺脉冲切换',
      '4 大连续技能与立体道具（丝茧/小蛛/毒囊弹）'
    ],
    soulHabit: '以八条高拱荆棘长腿稳健巡游古迹领地，警戒时须肢轻点、毒螯咔嗒蓄势，遇敌交替施展织网缚阵、毒螯扑杀、裂茧群涌与棘背毒雨',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const abPair = buildAbdomenPair(makeCanvas);
      const parts = {
        cephalothorax: buildCephalothorax(makeCanvas),
        abdomen:       abPair.abdomen,
        abdomenPulse:  abPair.abdomenPulse,
        spinneret:     buildSpinneret(makeCanvas),
        fangL:         buildFang(makeCanvas, -1),
        fangR:         buildFang(makeCanvas,  1),
        palp:          buildPalp(makeCanvas),
        legFemur:      buildLegFemur(makeCanvas),
        legTibia:      buildLegTibia(makeCanvas),
        legTarsus:     buildLegTarsus(makeCanvas),
        eggSac:        buildEggSac(makeCanvas),
        spiderling:    buildSpiderling(makeCanvas),
        venomOrb:      buildVenomOrb(makeCanvas)
      };

      const allAssets = Object.values(parts);
      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;

      const gait = new OctopodGait(OCTO_LEG_SPECS);
      const fangLSpring = new SpringDamper1D(0, 120, 8.5);
      const fangRSpring = new SpringDamper1D(0, 120, 8.5);
      const palpLSpring = new SpringDamper1D(0, 75, 6.2);
      const palpRSpring = new SpringDamper1D(0, 75, 6.2);

      const state = {
        x: hx0,
        y: hy0,
        z: 7.5,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        turnRate: 0,
        // 动作与局部姿态偏移（全程通过位移与角度驱动，禁用小数 scaleX/scaleY）
        curAction: 'patrol',
        prevActionTime: -1,
        skillOriginX: hx0,
        skillOriginY: hy0,
        skillOriginYaw: hyaw0,
        bodyLiftOff: 0,
        headLiftOff: 0,
        headYawOff: 0,
        abdomenLiftOff: 0,
        abdomenShiftY: 0,
        abdomenJitterX: 0,
        abdomenPulsing: false,
        spinneretSpread: 0,
        // 技能触发器与立体道具实例数组
        webStrandsFired: 0,
        webSlamFired: false,
        lungeSlashFired: false,
        broodSacsFired: 0,
        broodHatched: false,
        venomFired: 0,
        barragePulseCount: 0,
        staggerSparkCd: 0,
        eggSacs: [],
        spiderlings: [],
        venomOrbs: []
      };

      const sockets = new SocketTracker();
      const footContacts = OCTO_LEG_SPECS.map(() => ({ x: 0, y: 0, z: 0, r: 2.3 }));
      let curSkinIdx = 0;
      let curSkin = SKINS[0];

      function clampToArena(px, py, maxR) {
        const d = Math.hypot(px, py);
        if (d > maxR && d > 0.001) return [px * (maxR / d), py * (maxR / d)];
        return [px, py];
      }

      function resetSkillTransient() {
        state.webStrandsFired = 0;
        state.webSlamFired = false;
        state.lungeSlashFired = false;
        state.broodSacsFired = 0;
        state.broodHatched = false;
        state.venomFired = 0;
        state.barragePulseCount = 0;
        state.eggSacs.length = 0;
        state.spiderlings.length = 0;
        state.venomOrbs.length = 0;
      }

      const instance = {
        def: BossSpiderDef,
        cachePrefix: `boss_weaver_spider_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: allAssets,
        state,
        sockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          if (typeof skinIdx !== 'number' || !Number.isFinite(skinIdx)) {
            curSkinIdx = (curSkinIdx + 1) % SKINS.length;
          } else {
            curSkinIdx = ((Math.floor(skinIdx) % SKINS.length) + SKINS.length) % SKINS.length;
          }
          curSkin = SKINS[curSkinIdx];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (let i = 0; i < allAssets.length; i++) {
            recolorAsset(allAssets[i], tbl, SPEC.glowIdSet);
          }
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 7.5;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.turnRate = 0;
          state.curAction = 'patrol';
          state.prevActionTime = -1;
          state.skillOriginX = homeX;
          state.skillOriginY = homeY;
          state.skillOriginYaw = homeYaw;
          state.bodyLiftOff = 0;
          state.headLiftOff = 0;
          state.headYawOff = 0;
          state.abdomenLiftOff = 0;
          state.abdomenShiftY = 0;
          state.abdomenJitterX = 0;
          state.abdomenPulsing = false;
          state.spinneretSpread = 0;
          resetSkillTransient();
          fangLSpring.x = fangLSpring.v = 0;
          fangRSpring.x = fangRSpring.v = 0;
          palpLSpring.x = palpLSpring.v = 0;
          palpRSpring.x = palpRSpring.v = 0;
          gait.reset(homeX, homeY, 7.5, homeYaw, 1.0);
        },

        update(dt, time, params, habitat, vfx, eco) {
          const sMul = clamp(params.scaleMul ?? params.scale ?? 1.0, 0.5, 2.0);
          instance.scaleMul = sMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const sp = clamp(params.springiness ?? params.spring ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const fx = (curSkin && curSkin.fx) || SKINS[0].fx;

          const action = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const actT = Math.max(0, (eco && eco.actionTime) || 0);
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const homeYaw = (eco && eco.homeYaw) ?? 0;
          const maxR = Math.min(44, ((eco && (eco.maxRadius ?? eco.radius)) || 44) * 0.65);

          // 检测动作切换或单次技能重新起播
          if (action !== state.curAction || actT < state.prevActionTime - 0.05) {
            state.curAction = action;
            state.skillOriginX = clamp(state.x, -maxR, maxR);
            state.skillOriginY = clamp(state.y, -maxR, maxR);
            state.skillOriginYaw = state.yaw;
            resetSkillTransient();
          }
          state.prevActionTime = actT;

          // 每帧默认姿态目标值
          const baseBodyZ = 7.5 * sMul;
          let targetBodyOff = 0;
          let targetHeadOff = 0;
          let targetHeadYaw = 0;
          let targetAbOff = 0;
          let targetAbShiftY = 0;
          let targetAbJitterX = 0;
          let targetPulsing = false;
          let targetSpinSpread = 0;
          let targetFangL = -0.10;
          let targetFangR =  0.10;
          let targetPalpL = -0.18;
          let targetPalpR =  0.18;
          let legSplay = 1.0;
          let legOverrides = null;
          let forceGaitCycle = false;

          // -----------------------------------------------------------------
          // 分动作状态机（7 个约定动作完整连续实现）
          // -----------------------------------------------------------------
          if (action === 'patrol') {
            Propulsion.multiLegWalk(state, dt, time, { speed: spdMul * 1.05, gaitFreq: gFreq }, {
              ...(eco || {}),
              patrol: true,
              walkStyle: 'heavy',
              baseLift: baseBodyZ,
              maxRadius: maxR
            });
            const bob = Math.sin(time * 4.4 * gFreq) * 0.45;
            targetBodyOff = bob;
            targetAbOff = Math.sin(time * 4.4 * gFreq - 0.8) * 0.65;
            targetFangL = -0.12 - Math.sin(time * 3.1) * 0.08;
            targetFangR =  0.12 + Math.sin(time * 3.1) * 0.08;
            targetPalpL = -0.18 + Math.sin(time * 5.2 * gFreq) * 0.22;
            targetPalpR =  0.18 - Math.sin(time * 5.2 * gFreq) * 0.22;

          } else if (action === 'idle') {
            // 原地警戒：先平滑归位再 8 足钉地，躯干轻呼吸 ±0.5 格（禁用小数缩放）
            const distHome = Math.hypot(homeX - state.x, homeY - state.y);
            if (distHome > 2.2 * sMul) {
              Propulsion.walkToPoint(state, homeX, homeY, dt, { speed: spdMul, gaitFreq: gFreq }, {
                arriveDist: 1.8 * sMul, maxSpeed: 12.5, maxTurn: 2.4, aimYaw: homeYaw, baseLift: baseBodyZ
              });
            } else {
              const kStop = expSmooth(dt, 8.0);
              state.vx = lerp(state.vx, 0, kStop);
              state.vy = lerp(state.vy, 0, kStop);
              state.x += state.vx * dt;
              state.y += state.vy * dt;
              state.z = lerp(state.z, baseBodyZ, expSmooth(dt, 8.0));
              const aimYaw = homeYaw + Math.sin(time * 0.65) * 0.14;
              state.yaw = wrapAngle(state.yaw + wrapAngle(aimYaw - state.yaw) * expSmooth(dt, 3.6));
            }
            const breath = Math.sin(time * 2.2) * 0.50;
            targetBodyOff = breath;
            targetHeadOff = breath * 0.35;
            targetAbOff = Math.sin(time * 2.2 - 0.55) * 0.55;
            targetPalpL = -0.20 + Math.sin(time * 3.4) * 0.26;
            targetPalpR =  0.20 + Math.sin(time * 3.4 + Math.PI) * 0.26;
            // 周期性毒螯张合咔嗒
            const clackCy = time % 3.2;
            if (clackCy > 2.55 && clackCy < 2.82) {
              targetFangL = -0.44;
              targetFangR =  0.44;
            } else if (clackCy >= 2.82 && clackCy < 2.98) {
              targetFangL =  0.14;
              targetFangR = -0.14;
            }

          } else if (action === 'stagger') {
            // 破盾硬直（1.5s）：后挫下沉 2.5 格、8 足外撇发软、头胸左右轻晃、双螯无力下垂
            const kStop = expSmooth(dt, 9.0);
            state.vx = lerp(state.vx, 0, kStop);
            state.vy = lerp(state.vy, 0, kStop);
            let recoil = 0;
            if (actT < 0.25) {
              recoil = smoothstep(0, 0.25, actT);
            } else if (actT < 1.15) {
              recoil = 1.0;
            } else {
              recoil = 1.0 - smoothstep(1.15, 1.5, actT);
            }
            const [rx, ry] = localToWorldXY(
              state.skillOriginX, state.skillOriginY, state.skillOriginYaw, 0, -4.2 * recoil * sMul
            );
            const [cx, cy] = clampToArena(rx, ry, maxR);
            state.x = lerp(state.x, cx, expSmooth(dt, 14));
            state.y = lerp(state.y, cy, expSmooth(dt, 14));
            state.z = baseBodyZ;

            targetBodyOff = -2.5 * recoil;
            targetHeadOff = -1.2 * recoil;
            targetAbOff = -1.4 * recoil;
            targetHeadYaw = Math.sin(actT * 17.5) * 0.24 * recoil;
            targetFangL = -0.48 * recoil;
            targetFangR =  0.48 * recoil;
            targetPalpL = -0.52 * recoil;
            targetPalpR =  0.52 * recoil;
            legSplay = 1.0 + 0.14 * recoil;

            // 晕眩碎粒
            state.staggerSparkCd -= dt;
            if (vfx && recoil > 0.35 && state.staggerSparkCd <= 0) {
              state.staggerSparkCd = 0.14;
              const [hx, hy] = localToWorldXY(state.x, state.y, state.yaw, 0, 7.5 * sMul);
              const ang = actT * 9.0;
              vfx.spawnParticle(
                hx + Math.cos(ang) * 5.2 * sMul,
                hy + Math.sin(ang) * 5.2 * sMul,
                (baseBodyZ + 11.5 * sMul),
                Math.cos(ang + 1.2) * 5, Math.sin(ang + 1.2) * 5, 6.5,
                0.38, 1.35, fx.venomCore, true, 14
              );
            }

          } else if (action === 'skill_web_snare') {
            // 技能 1：织网缚阵（2.6s）
            // 0.0~0.6s 压低蓄丝 -> 0.6~1.7s 5道白丝粒子束 + 铺蛛网贴地痕迹 -> 1.7~2.6s 前足拍地定网复位
            state.vx *= 0.85;
            state.vy *= 0.85;
            state.z = baseBodyZ;

            if (actT < 0.6) {
              const u = smoothstep(0, 0.6, actT);
              targetBodyOff = -2.2 * u;
              targetAbOff = 2.6 * u;
              targetSpinSpread = u;
              legSplay = 1.0 + 0.09 * u;
              targetPulsing = (Math.floor(actT * 10) & 1) === 0;
              if (vfx && Math.random() < 0.45) {
                const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, 0, -23.0 * sMul);
                const a = Math.random() * TAU;
                const rad = 7.5 * sMul;
                vfx.spawnParticle(
                  sx + Math.cos(a) * rad, sy + Math.sin(a) * rad, baseBodyZ + 12 * sMul,
                  -Math.cos(a) * 18, -Math.sin(a) * 18, 2,
                  0.26, 1.15, fx.silk, true, 0
                );
              }
            } else if (actT < 1.7) {
              targetBodyOff = -2.0;
              targetAbOff = 2.8 + Math.sin(actT * 28) * 0.35;
              targetAbJitterX = Math.sin(actT * 42) * 0.45;
              targetSpinSpread = 1.0;
              targetPulsing = true;
              legSplay = 1.09;
              targetFangL = -0.32;
              targetFangR =  0.32;

              // 连续喷出 5 道 -35° ~ +35° 白丝粒子束并铺蛛网贴地痕迹
              const strandIdx = Math.min(5, Math.floor((actT - 0.6) / 0.20) + 1);
              while (state.webStrandsFired < strandIdx) {
                const idx = state.webStrandsFired;
                state.webStrandsFired++;
                const frac = idx / 4; // 0..1
                const degOff = lerp(-35, 35, frac) * (Math.PI / 180);
                const shootYaw = wrapAngle(state.yaw + degOff);
                const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, 0, -21.5 * sMul);
                const [tx, ty] = localToWorldXY(state.x, state.y, shootYaw, 0, (22 + (idx % 2) * 5) * sMul);
                const [clx, cly] = clampToArena(tx, ty, 60);

                if (vfx) {
                  // 10 颗连珠白丝像素粒子沿抛弧飞向前方
                  for (let k = 0; k < 10; k++) {
                    const f = 0.42 + k * 0.065;
                    const dx = (clx - sx) / 0.42;
                    const dy = (cly - sy) / 0.42;
                    vfx.spawnParticle(
                      lerp(sx, clx, k * 0.04),
                      lerp(sy, cly, k * 0.04),
                      baseBodyZ + (13.0 + (idx % 2) * 1.2) * sMul,
                      dx * f, dy * f, (10 + k * 1.1) * sMul,
                      0.44, 1.35 + (k % 2) * 0.35,
                      (k & 1) ? fx.silk : fx.silkDim, k % 3 === 0, 48
                    );
                  }
                  // 贴地放射状白丝蛛网痕迹
                  vfx.addDecal({
                    kind: 'crack',
                    x: clx, y: cly, yaw: shootYaw,
                    rx: 7.5 * sMul, ry: 7.5 * sMul,
                    life: 5.5, alpha: 0.90,
                    color: fx.silkDim, darkColor: fx.silk
                  });
                  vfx.addRipple(clx, cly, 2.2 * sMul, 11.5 * sMul, 0.55, 1.4);
                }
              }
            } else {
              // 1.7~2.6s：前一对长腿高高抬起狠狠拍地定网，随后平滑回正
              const u = clamp((actT - 1.7) / 0.9, 0, 1);
              let liftFront = 0;
              if (actT < 2.02) {
                liftFront = smoothstep(1.7, 2.02, actT) * 13.5;
                targetBodyOff = lerp(-2.0, 1.4, smoothstep(1.7, 2.02, actT));
                targetHeadOff = 1.6 * smoothstep(1.7, 2.02, actT);
              } else if (actT < 2.20) {
                const slamU = smoothstep(2.02, 2.18, actT);
                liftFront = lerp(13.5, 0, slamU);
                targetBodyOff = lerp(1.4, -1.6, slamU);
                if (!state.webSlamFired && actT >= 2.14) {
                  state.webSlamFired = true;
                  if (vfx) {
                    const [flx, fly] = localToWorldXY(state.x, state.y, state.yaw, -17 * sMul, 22 * sMul);
                    const [frx, fry] = localToWorldXY(state.x, state.y, state.yaw,  17 * sMul, 22 * sMul);
                    const [cx, cy] = localToWorldXY(state.x, state.y, state.yaw, 0, 22 * sMul);
                    vfx.addRipple(cx, cy, 4 * sMul, 24 * sMul, 0.65, 2.0);
                    for (const [px, py] of [[flx, fly], [frx, fry]]) {
                      for (let i = 0; i < 8; i++) {
                        const a = (i / 8) * TAU;
                        vfx.spawnParticle(
                          px, py, 1.2,
                          Math.cos(a) * 16, Math.sin(a) * 16, 8 + Math.random() * 6,
                          0.42, 1.5, fx.silk, false, 32
                        );
                      }
                    }
                  }
                }
              } else {
                const rec = smoothstep(2.20, 2.60, actT);
                targetBodyOff = lerp(-1.6, 0, rec);
                targetAbOff = lerp(1.4, 0, rec);
                legSplay = lerp(1.06, 1.0, rec);
              }
              legOverrides = {
                L1: { lx: -2.0 * (1 - u), ly: 3.5 * (1 - u), z: liftFront, snap: 24 },
                R1: { lx:  2.0 * (1 - u), ly: 3.5 * (1 - u), z: liftFront, snap: 24 }
              };
            }

          } else if (action === 'skill_fang_lunge') {
            // 技能 2：毒螯扑杀（2.2s）
            // 0.0~0.65s 后缩仰身扬前腿 -> 0.65~1.25s 前扑+14格 & 双螯交剪斩击 -> 1.25~2.2s 碎步退回
            state.z = baseBodyZ;
            const syaw = state.skillOriginYaw;

            if (actT < 0.65) {
              const u = smoothstep(0, 0.65, actT);
              const [bx, by] = localToWorldXY(state.skillOriginX, state.skillOriginY, syaw, 0, -3.8 * u * sMul);
              const [cx, cy] = clampToArena(bx, by, maxR);
              state.x = lerp(state.x, cx, expSmooth(dt, 14));
              state.y = lerp(state.y, cy, expSmooth(dt, 14));
              state.vx = 0; state.vy = 0;
              targetBodyOff = -1.2 * u;
              targetHeadOff = 4.4 * u;
              targetAbOff = -1.8 * u;
              targetFangL = -0.62 * u;
              targetFangR =  0.62 * u;
              targetPalpL = -0.45 * u;
              targetPalpR =  0.45 * u;
              targetPulsing = actT > 0.32;
              legOverrides = {
                L1: { lx: -4.0 * u, ly: 3.0 * u, z: 14.5 * u, snap: 18 },
                R1: { lx:  4.0 * u, ly: 3.0 * u, z: 14.5 * u, snap: 18 },
                L2: { lx: -2.2 * u, ly: 2.5 * u, z:  8.0 * u, snap: 16 },
                R2: { lx:  2.2 * u, ly: 2.5 * u, z:  8.0 * u, snap: 16 }
              };
              // 螯尖渗出毒色亮粒（正向运动学真源）
              if (vfx && actT > 0.25 && Math.random() < 0.45) {
                const tip = (Math.random() < 0.5) ? sockets.get('fangTipL') : sockets.get('fangTipR');
                vfx.spawnParticle(
                  tip.x, tip.y, Math.max(2, tip.z),
                  (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, -5,
                  0.32, 1.25, fx.venomA, true, 28
                );
              }
            } else if (actT < 1.25) {
              const u = clamp((actT - 0.65) / 0.28, 0, 1);
              const dash = lerp(-3.8, 14.0, smoothstep(0, 1, u));
              const [lx, ly] = localToWorldXY(state.skillOriginX, state.skillOriginY, syaw, 0, dash * sMul);
              const [cx, cy] = clampToArena(lx, ly, maxR + 8);
              state.vx = (cx - state.x) / Math.max(dt, 0.001);
              state.vy = (cy - state.y) / Math.max(dt, 0.001);
              state.x = cx;
              state.y = cy;

              const hopArc = Math.sin(u * Math.PI) * 3.8;
              targetBodyOff = hopArc - (u >= 0.95 ? 1.4 : 0);
              targetHeadOff = lerp(4.4, -0.8, u);
              targetAbOff = lerp(-1.8, 1.6, u);
              targetPulsing = u < 0.85;

              if (actT < 0.88) {
                targetFangL = -0.64;
                targetFangR =  0.64;
                legOverrides = {
                  L1: { lx: -2.0, ly: 5.5, z: 9.0 * (1 - u), snap: 24 },
                  R1: { lx:  2.0, ly: 5.5, z: 9.0 * (1 - u), snap: 24 }
                };
              } else {
                // 双螯猛然向内交叉劈斩
                targetFangL =  0.34;
                targetFangR = -0.34;
                if (!state.lungeSlashFired) {
                  state.lungeSlashFired = true;
                  fangLSpring.impulse(12.0 * sp);
                  fangRSpring.impulse(-12.0 * sp);
                  if (vfx) {
                    const tl = sockets.get('fangTipL');
                    const tr = sockets.get('fangTipR');
                    const mx = (tl.x + tr.x) * 0.5;
                    const my = (tl.y + tr.y) * 0.5;
                    const mz = Math.max(4, (tl.z + tr.z) * 0.5);
                    vfx.addRipple(mx, my, 4 * sMul, 25 * sMul, 0.58, 2.2);
                    EnvFeedback.emitFootstep(vfx, habitat || { isWater: false, fx: { dustRGB: '180,175,165' } }, state.x, state.y, 1.4);
                    // 沿螯尖世界坐标喷出扇形斩击粒子
                    for (let i = 0; i < 18; i++) {
                      const angOff = lerp(-1.05, 1.05, i / 17);
                      const a = syaw + angOff;
                      const fwdSpd = (18 + Math.random() * 18) * sMul;
                      const [pvx, pvy] = localToWorldXY(0, 0, a, 0, fwdSpd);
                      vfx.spawnParticle(
                        mx + (Math.random() - 0.5) * 3, my + (Math.random() - 0.5) * 3, mz,
                        pvx, pvy, (6 + Math.random() * 10) * sMul,
                        0.32 + Math.random() * 0.16, 1.65 + Math.random() * 0.6,
                        (i % 3 === 0) ? fx.venomCore : ((i & 1) ? fx.slashA : fx.slashB),
                        true, 26
                      );
                    }
                  }
                }
              }
            } else {
              // 1.25~2.2s：8 足碎步快速退回原位
              const u = smoothstep(1.25, 2.15, actT);
              const tx = lerp(state.x, state.skillOriginX, expSmooth(dt, 6.2));
              const ty = lerp(state.y, state.skillOriginY, expSmooth(dt, 6.2));
              state.vx = (tx - state.x) / Math.max(dt, 0.001);
              state.vy = (ty - state.y) / Math.max(dt, 0.001);
              state.x = tx;
              state.y = ty;
              forceGaitCycle = u < 0.88;
              targetFangL = lerp(0.30, -0.10, u);
              targetFangR = lerp(-0.30, 0.10, u);
            }

          } else if (action === 'skill_brood_burst') {
            // 技能 3：裂茧群涌（3.0s）
            // 0.0~0.8s 腹囊剧颤 -> 0.8~1.45s 甩出2枚eggSac抛物线砸地 -> 1.45~2.6s 爆出3只spiderling群涌 -> 2.6~3.0s 收束
            state.vx *= 0.85;
            state.vy *= 0.85;
            state.z = baseBodyZ;

            if (actT < 0.8) {
              const u = smoothstep(0, 0.8, actT);
              targetAbOff = 2.2 * u + Math.sin(actT * 46) * 0.65 * u;
              targetAbJitterX = Math.sin(actT * 52) * 0.75 * u;
              targetSpinSpread = u;
              targetPulsing = (Math.floor(actT * 12) & 1) === 0;
              if (vfx && Math.random() < 0.4) {
                const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, 0, -23 * sMul);
                vfx.spawnParticle(
                  sx + (Math.random() - 0.5) * 6, sy + (Math.random() - 0.5) * 6, baseBodyZ + 12 * sMul,
                  (Math.random() - 0.5) * 10, (Math.random() - 0.5) * 10, 10 + Math.random() * 8,
                  0.35, 1.3, fx.silk, false, 20
                );
              }
            } else if (actT < 1.45) {
              targetAbOff = 2.4 - smoothstep(0.8, 1.45, actT) * 1.4;
              targetSpinSpread = 1.0;
              targetPulsing = actT < 1.15;

              // 左右先后甩出 2 枚立体 eggSac 丝茧球
              const sacSchedule = [
                { t0: 0.80, side: -1, ang: -0.46, dist: 21.5 },
                { t0: 0.96, side:  1, ang:  0.46, dist: 22.0 }
              ];
              while (state.broodSacsFired < sacSchedule.length && actT >= sacSchedule[state.broodSacsFired].t0) {
                const cfg = sacSchedule[state.broodSacsFired];
                state.broodSacsFired++;
                const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, cfg.side * 2.5 * sMul, -22.5 * sMul);
                const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw + cfg.ang, 0, cfg.dist * sMul);
                const [clx, cly] = clampToArena(tx, ty, 58);
                state.eggSacs.push({
                  sx, sy, sz: baseBodyZ + 12.5 * sMul,
                  tx: clx, ty: cly,
                  x: sx, y: sy, z: baseBodyZ + 12.5 * sMul,
                  ro: state.yaw,
                  t0: actT,
                  dur: 0.46,
                  bounced: false,
                  hatched: false
                });
                targetAbShiftY = -1.6;
              }
            } else if (actT < 2.6) {
              // 1.45s 丝茧炸开，钻出 3 只复用 spiderling 小蛛四散冲锋巡游
              if (!state.broodHatched) {
                state.broodHatched = true;
                const origins = state.eggSacs.length >= 2
                  ? [
                      { x: state.eggSacs[0].tx, y: state.eggSacs[0].ty, angOff: -0.52 },
                      { x: (state.eggSacs[0].tx + state.eggSacs[1].tx) * 0.5, y: (state.eggSacs[0].ty + state.eggSacs[1].ty) * 0.5, angOff: 0.02 },
                      { x: state.eggSacs[1].tx, y: state.eggSacs[1].ty, angOff: 0.52 }
                    ]
                  : [
                      { x: state.x - 12, y: state.y + 16, angOff: -0.5 },
                      { x: state.x,      y: state.y + 18, angOff: 0.0 },
                      { x: state.x + 12, y: state.y + 16, angOff: 0.5 }
                    ];

                for (const sac of state.eggSacs) {
                  sac.hatched = true;
                  if (vfx) {
                    vfx.addRipple(sac.tx, sac.ty, 2.5 * sMul, 14 * sMul, 0.5, 1.6);
                    for (let i = 0; i < 10; i++) {
                      const a = (i / 10) * TAU;
                      vfx.spawnParticle(
                        sac.tx, sac.ty, 3.0,
                        Math.cos(a) * 14, Math.sin(a) * 14, 9 + Math.random() * 8,
                        0.45, 1.45, (i & 1) ? fx.silk : fx.venomA, i % 3 === 0, 34
                      );
                    }
                  }
                }
                state.eggSacs.length = 0;

                for (let i = 0; i < 3; i++) {
                  const org = origins[i];
                  const baseYaw = wrapAngle(state.yaw + org.angOff);
                  state.spiderlings.push({
                    x: org.x, y: org.y, z: 0.5,
                    yaw: baseYaw,
                    curveDir: (i === 1) ? 0.9 : (i === 0 ? -1.4 : 1.4),
                    speed: (18 + i * 2.5) * sMul,
                    phase: i * 2.1,
                    dustCd: 0
                  });
                }
              }
            } else {
              // 2.6~3.0s 收束离场
              if (actT >= 2.86 && state.spiderlings.length) {
                if (vfx) {
                  for (const spL of state.spiderlings) {
                    vfx.spawnDust(spL.x, spL.y, 4, 0.7, (habitat && habitat.fx) || { dustRGB: '180,175,165' });
                  }
                }
                state.spiderlings.length = 0;
              }
            }

            // 更新飞行中的丝茧球
            for (const sac of state.eggSacs) {
              const u = clamp((actT - sac.t0) / sac.dur, 0, 1);
              sac.x = lerp(sac.sx, sac.tx, u);
              sac.y = lerp(sac.sy, sac.ty, u);
              const arcZ = lerp(sac.sz, 0, u) + Math.sin(u * Math.PI) * 16.5 * sMul;
              // 落地后弹一下
              if (u >= 1) {
                const bt = clamp((actT - (sac.t0 + sac.dur)) / 0.16, 0, 1);
                sac.z = Math.sin(bt * Math.PI) * 3.2 * sMul;
                if (!sac.bounced) {
                  sac.bounced = true;
                  if (vfx) vfx.addRipple(sac.tx, sac.ty, 2 * sMul, 9 * sMul, 0.36, 1.3);
                }
              } else {
                sac.z = Math.max(0, arcZ);
              }
              sac.ro = wrapAngle(sac.ro + dt * 5.2);
            }

            // 更新 3 只四散冲锋巡游的小蛛
            for (const spL of state.spiderlings) {
              spL.yaw = wrapAngle(spL.yaw + spL.curveDir * dt * 1.15);
              const [nx, ny] = localToWorldXY(spL.x, spL.y, spL.yaw, 0, spL.speed * dt);
              const [cx, cy] = clampToArena(nx, ny, 60);
              spL.x = cx;
              spL.y = cy;
              spL.phase += dt * 18;
              spL.z = Math.abs(Math.sin(spL.phase)) * 1.8 * sMul;
              spL.dustCd -= dt;
              if (vfx && spL.dustCd <= 0) {
                spL.dustCd = 0.20;
                vfx.spawnParticle(
                  spL.x, spL.y, 0.8,
                  (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 4, 4,
                  0.25, 1.0, fx.silkDim, false, 18
                );
              }
            }

          } else if (action === 'skill_venom_barrage') {
            // 技能 4：棘背毒雨（3.4s）
            // 0.0~1.0s 扎地撑起+3格三连脉冲 -> 1.0~2.3s 每0.14s连射8枚抛物线venomOrb -> 2.3~3.0s 连锁爆裂 -> 3.0~3.4s 泄力回稳
            state.vx *= 0.85;
            state.vy *= 0.85;
            state.z = baseBodyZ;

            if (actT < 1.0) {
              const u = smoothstep(0, 0.6, actT);
              targetBodyOff = 3.2 * u;
              targetAbOff = 2.0 * u;
              legSplay = 1.0 - 0.06 * u;
              // 三连亮脉冲蓄力（0.15s / 0.45s / 0.75s）
              const pulseStarts = [0.15, 0.45, 0.75];
              let pulsingNow = false;
              for (let i = 0; i < pulseStarts.length; i++) {
                if (actT >= pulseStarts[i] && actT < pulseStarts[i] + 0.18) pulsingNow = true;
                if (state.barragePulseCount <= i && actT >= pulseStarts[i]) {
                  state.barragePulseCount = i + 1;
                  if (vfx) {
                    const [ax, ay] = localToWorldXY(state.x, state.y, state.yaw, 0, -10 * sMul);
                    vfx.addRipple(ax, ay, 4 * sMul, 20 * sMul, 0.45, 1.6);
                    for (let k = 0; k < 8; k++) {
                      const a = (k / 8) * TAU;
                      vfx.spawnParticle(
                        ax + Math.cos(a) * 14 * sMul, ay + Math.sin(a) * 14 * sMul, 4,
                        -Math.cos(a) * 14, -Math.sin(a) * 14, 18,
                        0.36, 1.35, fx.venomA, true, -6
                      );
                    }
                  }
                }
              }
              targetPulsing = pulsingNow;
            } else if (actT < 3.0) {
              targetBodyOff = 3.2;
              targetAbOff = 1.8 + Math.sin(actT * 24) * 0.45;
              targetPulsing = actT < 2.25;
              legSplay = 0.94;

              // 从 1.0s 起每隔 0.14s 依次从腹背棘缝高抛射出 8 枚立体 venomOrb
              while (state.venomFired < 8 && actT >= 1.0 + state.venomFired * 0.14) {
                const idx = state.venomFired;
                state.venomFired++;
                const side = (idx & 1) ? 1 : -1;
                const spineY = lerp(-3.5, -14.5, (idx % 4) / 3);
                const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, side * 5.2 * sMul, spineY * sMul);
                const fanAng = lerp(-0.82, 0.82, idx / 7);
                const landDist = (19 + (idx % 3) * 6.5) * sMul;
                const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw + fanAng, 0, landDist);
                const [clx, cly] = clampToArena(tx, ty, 62);
                state.venomOrbs.push({
                  sx, sy, sz: baseBodyZ + 18.5 * sMul,
                  tx: clx, ty: cly,
                  x: sx, y: sy, z: baseBodyZ + 18.5 * sMul,
                  peakZ: (26 + (idx % 3) * 4) * sMul,
                  ro: fanAng,
                  t0: actT,
                  dur: 0.84,
                  exploded: false
                });
                if (vfx) {
                  vfx.spawnParticle(sx, sy, baseBodyZ + 19 * sMul, 0, 0, 14, 0.22, 1.5, fx.venomCore, true, 10);
                }
              }
            } else {
              // 3.0~3.4s 泄力回稳
              const rec = smoothstep(3.0, 3.4, actT);
              targetBodyOff = lerp(3.2, 0, rec);
              targetAbOff = lerp(1.8, 0, rec);
              legSplay = lerp(0.94, 1.0, rec);
            }

            // 更新 8 枚抛物线毒囊弹与连锁爆裂腐蚀洼痕
            for (const orb of state.venomOrbs) {
              if (orb.exploded) continue;
              const u = clamp((actT - orb.t0) / orb.dur, 0, 1);
              orb.x = lerp(orb.sx, orb.tx, u);
              orb.y = lerp(orb.sy, orb.ty, u);
              orb.z = Math.max(0, lerp(orb.sz, 0, u) + Math.sin(u * Math.PI) * orb.peakZ);
              orb.ro = wrapAngle(orb.ro + dt * 4.8);
              if (u >= 1) {
                orb.exploded = true;
                if (vfx) {
                  vfx.addRipple(orb.tx, orb.ty, 2.4 * sMul, 14 * sMul, 0.52, 1.7);
                  vfx.addDecal({
                    kind: 'wet',
                    x: orb.tx, y: orb.ty, yaw: orb.ro,
                    rx: 5.8 * sMul, ry: 5.2 * sMul,
                    life: 5.0, alpha: 0.85,
                    color: fx.puddle, darkColor: fx.puddleDark, hiColor: fx.puddleHi
                  });
                  for (let k = 0; k < 9; k++) {
                    const a = (k / 9) * TAU + Math.random() * 0.3;
                    const spd = (7 + Math.random() * 12) * sMul;
                    vfx.spawnParticle(
                      orb.tx, orb.ty, 1.4,
                      Math.cos(a) * spd, Math.sin(a) * spd, (10 + Math.random() * 11) * sMul,
                      0.45 + Math.random() * 0.2, 1.55,
                      (k % 3 === 0) ? fx.venomCore : ((k & 1) ? fx.venomA : fx.venomB),
                      k % 2 === 0, 38
                    );
                  }
                }
              }
            }
          }

          // -----------------------------------------------------------------
          // 平滑收敛躯干姿态与二阶弹簧口器
          // -----------------------------------------------------------------
          const kPose = expSmooth(dt, 14.0);
          state.bodyLiftOff    = lerp(state.bodyLiftOff, targetBodyOff, kPose);
          state.headLiftOff    = lerp(state.headLiftOff, targetHeadOff, kPose);
          state.headYawOff     = lerp(state.headYawOff, targetHeadYaw, kPose);
          state.abdomenLiftOff = lerp(state.abdomenLiftOff, targetAbOff, kPose);
          state.abdomenShiftY  = lerp(state.abdomenShiftY, targetAbShiftY, kPose);
          state.abdomenJitterX = targetAbJitterX;
          state.abdomenPulsing = targetPulsing;
          state.spinneretSpread = lerp(state.spinneretSpread, targetSpinSpread, kPose);

          fangLSpring.update(dt, targetFangL, 125 * sp, clamp(8.5 * dScale, 3.5, 13.0));
          fangRSpring.update(dt, targetFangR, 125 * sp, clamp(8.5 * dScale, 3.5, 13.0));
          palpLSpring.update(dt, targetPalpL, 80 * sp, clamp(6.0 * dScale, 2.8, 10.5));
          palpRSpring.update(dt, targetPalpR, 80 * sp, clamp(6.0 * dScale, 2.8, 10.5));

          // -----------------------------------------------------------------
          // 8 足四相交替步态与高拱 IK 解算
          // -----------------------------------------------------------------
          const effBodyZ = Math.max(4.5 * sMul, baseBodyZ + state.bodyLiftOff * sMul);
          gait.update(dt, state.x, state.y, effBodyZ, state.yaw, state.vx, state.vy, {
            scaleMul: sMul,
            stepFreq: gFreq,
            stepHeight: 4.0,
            splayMul: legSplay,
            overrides: legOverrides,
            forceCycle: forceGaitCycle
          });

          // 落地瞬间极轻扬尘 + 刷新 8 足底接触印
          for (let i = 0; i < gait.legs.length; i++) {
            const leg = gait.legs[i];
            footContacts[i].x = leg.footX;
            footContacts[i].y = leg.footY;
            footContacts[i].z = leg.footZ;
            footContacts[i].r = 2.2 * sMul;
            if (leg.justLanded && vfx && habitat) {
              vfx.spawnDust(leg.footX, leg.footY, 2, 0.45, habitat.fx);
            }
          }

          // -----------------------------------------------------------------
          // 正向运动学单一真源挂点追踪（供毒螯斩击/吐丝/毒雨发射使用）
          // -----------------------------------------------------------------
          const headYaw = wrapAngle(state.yaw + state.headYawOff);
          const headZ = effBodyZ + state.headLiftOff * sMul;
          const [fLJointX, fLJointY] = localToWorldXY(state.x, state.y, headYaw, -4.8 * sMul, 14.8 * sMul);
          const [fRJointX, fRJointY] = localToWorldXY(state.x, state.y, headYaw,  4.8 * sMul, 14.8 * sMul);
          const fangLYaw = wrapAngle(headYaw + clamp(fangLSpring.x, -0.72, 0.55));
          const fangRYaw = wrapAngle(headYaw + clamp(fangRSpring.x, -0.55, 0.72));
          const [tipLX, tipLY] = localToWorldXY(fLJointX, fLJointY, fangLYaw,  0.7 * sMul, 9.0 * sMul);
          const [tipRX, tipRY] = localToWorldXY(fRJointX, fRJointY, fangRYaw, -0.7 * sMul, 9.0 * sMul);
          sockets.setWorld('fangTipL', tipLX, tipLY, headZ + 2.2 * sMul, fangLYaw);
          sockets.setWorld('fangTipR', tipRX, tipRY, headZ + 2.2 * sMul, fangRYaw);
          sockets.setLocal('spinneret', state.x, state.y, effBodyZ + state.abdomenLiftOff * sMul, state.yaw, 0, -23.0, 4.5, sMul);
          sockets.setLocal('abdomenCrown', state.x, state.y, effBodyZ + state.abdomenLiftOff * sMul, state.yaw, 0, -10.5, 19.0, sMul);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? habitat.waterLevel : 2.6;
          const baseBodyZ = 7.5 * sMul;
          const effBodyZ = Math.max(4.5 * sMul, baseBodyZ + state.bodyLiftOff * sMul);
          const yw = state.yaw;
          const headYaw = wrapAngle(yw + state.headYawOff);
          const bodySub = isWater ? EnvFeedback.calcSubmerge(effBodyZ, waterLvl, 6.0, true) * 0.45 : 0;

          // 1. 8 条高拱棘刺长腿（共用 legFemur / legTibia / legTarsus 三段对称资产）
          for (let i = 0; i < gait.legs.length; i++) {
            const leg = gait.legs[i];
            const dx = leg.footX - leg.hipWX;
            const dy = leg.footY - leg.hipWY;
            const legYaw = Math.hypot(dx, dy) > 0.05
              ? Math.atan2(-dx, dy)
              : wrapAngle(yw - leg.side * Math.PI * 0.5);
            const footSub = isWater ? EnvFeedback.calcSubmerge(leg.footZ, waterLvl, 4.5, true) * 0.65 : 0;

            // 大腿基股节（髋部深嵌头胸甲 -> 高拱膝节）
            const fx = lerp(leg.hipWX, leg.kneeX, 0.50);
            const fy = lerp(leg.hipWY, leg.kneeY, 0.50);
            const fz = Math.max(0.5, leg.hipWZ - 1.6 * sMul);
            list.push({
              partKey: 'legFemur',
              asset: parts.legFemur,
              x: fx, y: fy, lift: fz,
              ro: legYaw, symDeg: 360, bias: -0.10, submerge: bodySub * 0.6
            });

            // 胫节（高拱尖刺膝盖 -> 踝环与跗爪高重叠衔接）
            const kx = lerp(leg.kneeX, leg.footX, 0.35);
            const ky = lerp(leg.kneeY, leg.footY, 0.35);
            const kz = Math.max(leg.footZ + 4.2 * sMul, leg.kneeZ - 10.4 * sMul);
            list.push({
              partKey: 'legTibia',
              asset: parts.legTibia,
              x: kx, y: ky, lift: kz,
              ro: legYaw, symDeg: 360, bias: 0.20, submerge: footSub * 0.35
            });

            // 尖跗爪（末端精准钉地 z=0）
            const tx = lerp(leg.kneeX, leg.footX, 0.78);
            const ty = lerp(leg.kneeY, leg.footY, 0.78);
            list.push({
              partKey: 'legTarsus',
              asset: parts.legTarsus,
              x: tx, y: ty, lift: Math.max(0, leg.footZ),
              ro: legYaw, symDeg: 360, bias: -0.25, submerge: footSub
            });
          }

          // 2. 尾端三瓣纺丝器（腹尾挂点 (0, -23.0)）
          const abZ = Math.max(4.0 * sMul, (9.0 + state.bodyLiftOff + state.abdomenLiftOff) * sMul);
          const [spX, spY] = localToWorldXY(
            state.x, state.y, yw,
            state.abdomenJitterX * sMul,
            (-23.0 + state.abdomenShiftY - state.spinneretSpread * 0.8) * sMul
          );
          list.push({
            partKey: 'spinneret',
            asset: parts.spinneret,
            x: spX, y: spY,
            lift: abZ + 2.0 * sMul,
            ro: wrapAngle(yw + Math.sin(state.prevActionTime * 28) * 0.08 * state.spinneretSpread),
            symDeg: 360, bias: 0.05, submerge: 0
          });

          // 3. 高耸巨型猩红棘纹腹囊（常态 / 脉冲丝腺无损切换）
          const [abX, abY] = localToWorldXY(
            state.x, state.y, yw,
            state.abdomenJitterX * sMul,
            (-10.5 + state.abdomenShiftY) * sMul
          );
          const abKey = state.abdomenPulsing ? 'abdomenPulse' : 'abdomen';
          list.push({
            partKey: abKey,
            asset: parts[abKey],
            x: abX, y: abY, lift: abZ,
            ro: yw, symDeg: 360, bias: 0.15, submerge: 0
          });

          // 4. 玄青头胸重甲 + 6 颗赤红复眼
          const headZ = Math.max(4.0 * sMul, effBodyZ + state.headLiftOff * sMul);
          const [hdX, hdY] = localToWorldXY(state.x, state.y, yw, 0, 6.5 * sMul);
          list.push({
            partKey: 'cephalothorax',
            asset: parts.cephalothorax,
            x: hdX, y: hdY, lift: headZ,
            ro: headYaw, symDeg: 360, bias: 0.30, submerge: 0
          });

          // 5. 一对前探短须肢（左右共享 palp 资产）
          const palpList = [
            { s: -1, yawOff: palpLSpring.x },
            { s:  1, yawOff: palpRSpring.x }
          ];
          for (const pl of palpList) {
            const [jx, jy] = localToWorldXY(state.x, state.y, headYaw, pl.s * 7.0 * sMul, 13.5 * sMul);
            const pYaw = wrapAngle(headYaw + clamp(pl.yawOff, -0.65, 0.65));
            const [px, py] = pivotToWorldXY(jx, jy, pYaw, 0, -3.6 * sMul);
            list.push({
              partKey: 'palp',
              asset: parts.palp,
              x: px, y: py, lift: Math.max(1.0, headZ - 0.5 * sMul),
              ro: pYaw, symDeg: 360, bias: 0.40, submerge: 0
            });
          }

          // 6. 一对偏心枢轴锁死大毒螯（pivotToWorldXY 锁死在螯根 (-s*1.4, -4.0)）
          const fangList = [
            { k: 'fangL', s: -1, yawOff: fangLSpring.x },
            { k: 'fangR', s:  1, yawOff: fangRSpring.x }
          ];
          for (const fg of fangList) {
            const [jx, jy] = localToWorldXY(state.x, state.y, headYaw, fg.s * 4.8 * sMul, 14.8 * sMul);
            const fYaw = wrapAngle(headYaw + clamp(fg.yawOff, -0.72, 0.72));
            const [px, py] = pivotToWorldXY(jx, jy, fYaw, -fg.s * 1.4 * sMul, -4.0 * sMul);
            list.push({
              partKey: fg.k,
              asset: parts[fg.k],
              x: px, y: py, lift: Math.max(1.5, headZ + 1.0 * sMul),
              ro: fYaw, symDeg: 360, bias: 0.55, submerge: 0
            });
          }

          // 7. 技能 3 立体道具：飞行/落地丝茧球 eggSac 与 3 只复用小蛛 spiderling
          for (let i = 0; i < state.eggSacs.length; i++) {
            const sac = state.eggSacs[i];
            if (sac.hatched) continue;
            list.push({
              partKey: 'eggSac',
              asset: parts.eggSac,
              x: sac.x, y: sac.y, lift: sac.z,
              ro: sac.ro, symDeg: 90, bias: 0.35, submerge: 0
            });
          }
          for (let i = 0; i < state.spiderlings.length; i++) {
            const spL = state.spiderlings[i];
            list.push({
              partKey: 'spiderling',
              asset: parts.spiderling,
              x: spL.x, y: spL.y, lift: spL.z,
              ro: spL.yaw, symDeg: 360, bias: 0.20, submerge: 0
            });
          }

          // 8. 技能 4 立体道具：8 枚高抛物线半透毒囊弹 venomOrb
          for (let i = 0; i < state.venomOrbs.length; i++) {
            const orb = state.venomOrbs[i];
            if (orb.exploded) continue;
            list.push({
              partKey: 'venomOrb',
              asset: parts.venomOrb,
              x: orb.x, y: orb.y, lift: orb.z,
              ro: orb.ro, symDeg: 90, bias: 0.60, opacity: 0.84, submerge: 0
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: BossSpiderDef.id,
            code: BossSpiderDef.code,
            status: BossSpiderDef.status,
            name: BossSpiderDef.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            action: state.curAction,
            legCount: OCTO_LEG_SPECS.length,
            gaitMode: 'octopod_alternating_4phase',
            paletteCount: SPEC.keys.length,
            footRadius: BossSpiderDef.footRadius,
            headZ: 22,
            centerZ: 11,
            blocks: BossSpiderDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({
              id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h
            }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(BossSpiderDef);
})(window.PixelWorkshop);
