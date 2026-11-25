'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, hash2i, fbm1 } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { solveIK2D, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 泽6 · 在热水池间点着走的高跷（M26 高跷长腿 / 水面轻点 标杆）
  //
  // 【设计摘要】
  // 1. 俯视清晰度与标志体貌放大：
  //    - 悬空小圆躯（body，16×18×13）高悬在 z ≈ 26~34 格，采用高饱和青蓝/珊瑚橙
  //      （或靛蓝/赭黄、翡翠/金黄）背纹与热泉浅水拉开反差；
  //    - 短颈头端（head / headSip）配明显加粗拉长的亮橙/象牙色吸管嘴基段，再接
  //      2 美术像素粗带暗边的 3D 像素画线吸管（kind: 'line'），低头吸水时一眼可见；
  //    - 4 条高跷长腿用 3D 外展折角 IK（髋 -> 高屈膝 -> 水面落足），每条腿由 2 段
  //      widthArtPx: 2 + outlineColor 的像素画线（上股 + 下胫）与膝/胫/踝三处放大雕琢的
  //      矿壳环节件组成；3 套皮肤对应新矿薄环 / 中矿节 / 老石笋厚壳，无需重建模；
  //    - 地面正下方通过 state.shadowScale 与 4 个 footContacts 清晰标出高度落差与落水点。
  // 2. 步态与动作（patrol / idle / sip）：
  //    - 鹤/长腿蛛式四足严格交替抬步（一次只抬 1 条腿，顺序 BL -> FL -> BR -> FR），
  //      高抬轻点入水，每落一足触发 vfx.addRipple(...) 荡开一圈热水涟漪与水珠；
  //    - 高处圆躯由二阶弹簧（SpringDamper1D）驱动微微晃动与抬步起伏；
  //    - 巡游严格钳制在 maxRadius * 0.78 内，周期性停步俯低身躯把长吸管探近水面吸水，
  //      冒出小水泡与水纹，随后昂首抖落水珠继续慢步。
  // 3. 资产与预算：27 色 0 重色 0 自亮，3 套换色皮肤，严禁常态 scaleX/scaleY 拉伸。
  // =========================================================================

  // 27 色独立色表（<= 48 色、0 重色、eyeGlint 严禁进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 悬空圆躯主背甲（深青蓝高饱和，与热泉浅灰石灰梯田拉开强反差）
      shellDark:   '#0d3f52',
      shellMid:    '#187a94',
      shellHi:     '#4dc7db',
      // 背甲醒目鞍纹与圆斑（暖珊瑚橙）
      spotDark:    '#b03215',
      spotMid:     '#eb5826',
      spotHi:      '#ff9c59',
      // 圆躯腹底与颈领（象牙暖白）
      bellyDark:   '#8c7d6b',
      bellyMid:    '#c9ba9f',
      bellyHi:     '#f2e7d0',
      // 短颈与小头（深青灰）
      neckDark:    '#143542',
      neckMid:     '#255d70',
      neckHi:      '#5299ad',
      // 加粗拉长的亮橙/象牙色吸管嘴基段
      beakDark:    '#bd4412',
      beakMid:     '#f57a22',
      beakHi:      '#ffd578',
      // 膝/踝矿壳环节主色（灰白石灰矿壳）
      crustDark:   '#7a756b',
      crustMid:    '#b8b2a4',
      crustHi:     '#ebe6da',
      // 矿壳沉积纹带（赭黄矿脉）
      mineralDark: '#8c632b',
      mineralMid:  '#c79444',
      mineralHi:   '#f0c878',
      // 躯干底部四肢髋窝座（深古铜褐）
      hipDark:     '#38261c',
      hipMid:      '#5e4130',
      hipHi:       '#8c654d',
      // 锐利 2×2 双眼（不进 glowKeys）
      eyeDark:     '#120e14',
      eyeIris:     '#ffd038',
      eyeGlint:    '#fffaf0'
    },
    glowKeys: [],
    parts: [
      'shell', 'spot', 'belly', 'neck', 'beak',
      'crust', 'mineral', 'hip', 'eye'
    ],
    noCrease: [
      ['shell', 'spot'], ['neck', 'eye'], ['neck', 'beak'],
      ['crust', 'mineral'], ['belly', 'hip']
    ],
    materials: {
      shell:   ['shellDark',   'shellMid',   'shellHi'],
      spot:    ['spotDark',    'spotMid',    'spotHi'],
      belly:   ['bellyDark',   'bellyMid',   'bellyHi'],
      neck:    ['neckDark',    'neckMid',    'neckHi'],
      beak:    ['beakDark',    'beakMid',    'beakHi'],
      crust:   ['crustDark',   'crustMid',   'crustHi'],
      mineral: ['mineralDark', 'mineralMid', 'mineralHi'],
      hip:     ['hipDark',     'hipMid',     'hipHi']
    },
    protectedParts: ['eye', 'beak']
  });

  // 3 套零重建模换色皮肤（分别对应：0 新矿薄环 / 1 中矿节 / 2 老石笋厚壳）
  const SKINS = [
    {
      id: 'shallow_teal_coral',
      name: '浅矿青橙（新矿薄环）',
      dot: '#187a94',
      outline: '#10161c',
      crustTier: 0,
      pal: {},
      line: {
        legUpper: '#3c342e',
        legLower: '#544a42',
        legOutline: '#121014',
        straw: '#ff8a33',
        strawOutline: '#2b1206'
      },
      fx: {
        drop: '#d8f6f8',
        bubble: '#fff3db',
        steam: '#ebe6da'
      }
    },
    {
      id: 'thick_ochre_indigo',
      name: '厚矿赭蓝（中矿节）',
      dot: '#2e4fa6',
      outline: '#12121f',
      crustTier: 1,
      pal: {
        shellDark:   '#18285e', shellMid:   '#2e4fa6', shellHi:   '#6b90f2',
        spotDark:    '#a65214', spotMid:    '#e68322', spotHi:    '#ffc863',
        bellyDark:   '#807668', bellyMid:   '#bdb09b', bellyHi:   '#ebe0ca',
        neckDark:    '#19244a', neckMid:    '#2c4282', neckHi:    '#5c7bc9',
        beakDark:    '#b55d14', beakMid:    '#f29a2e', beakHi:    '#ffe394',
        crustDark:   '#7d6748', crustMid:   '#bf9f6e', crustHi:   '#ebd2a4',
        mineralDark: '#7a451a', mineralMid: '#bd7028', mineralHi: '#f0ab54',
        hipDark:     '#332319', hipMid:     '#573d2c', hipHi:     '#856047',
        eyeIris:     '#66f0e2'
      },
      line: {
        legUpper: '#4a3a2c',
        legLower: '#6e5740',
        legOutline: '#141018',
        straw: '#f5a13b',
        strawOutline: '#291508'
      },
      fx: {
        drop: '#d4f2f7',
        bubble: '#ffe9b8',
        steam: '#e8d7b7'
      }
    },
    {
      id: 'old_stalagmite_jade',
      name: '老笋金碧（老石笋厚壳）',
      dot: '#1b8566',
      outline: '#0e1714',
      crustTier: 2,
      pal: {
        shellDark:   '#0e4738', shellMid:   '#1b8566', shellHi:   '#52d4a5',
        spotDark:    '#9e690e', spotMid:    '#dea01e', spotHi:    '#ffde6b',
        bellyDark:   '#787562', bellyMid:   '#b5b094', bellyHi:   '#e6e0c3',
        neckDark:    '#103b31', neckMid:    '#1e6b56', neckHi:    '#4bb090',
        beakDark:    '#b83d18', beakMid:    '#f26d35', beakHi:    '#ffba7a',
        crustDark:   '#6b6356', crustMid:   '#a89d88', crustHi:   '#e0d6c0',
        mineralDark: '#8a5b24', mineralMid: '#c98c38', mineralHi: '#f2c46d',
        hipDark:     '#362a1d', hipMid:     '#594632', hipHi:     '#876d4f',
        eyeIris:     '#ff8a3d'
      },
      line: {
        legUpper: '#4f463a',
        legLower: '#786c58',
        legOutline: '#0f1713',
        straw: '#ff7d40',
        strawOutline: '#260e08'
      },
      fx: {
        drop: '#d6f7ee',
        bubble: '#fff0c4',
        steam: '#e0d6c0'
      }
    }
  ];

  // =========================================================================
  // 1. 悬空饱满圆躯（body：16×18×13）
  //    圆润饱满的穹顶小身躯，顶部鲜明珊瑚橙鞍纹与双侧圆斑，腹底 4 个清晰髋窝座
  // =========================================================================
  function buildBody(makeCanvas) {
    const m = new VoxelModel(16, 18, 13, SPEC);
    const { mat, partId } = SPEC;

    // 饱满穹顶圆躯（上方高饱和背甲 + 珊瑚橙背斑，下方象牙暖白腹底）
    m.fillAABB(-7.0, 7.0, -7.8, 7.8, 1, 11, (x, y, z, X, Y) => {
      const rx = 6.2;
      const ry = 6.9;
      const rz = 4.9;
      const d = Math.hypot(X / rx, (Y + 0.3) / ry, (z - 6.0) / rz);
      if (d <= 1.0) {
        if (z <= 3) {
          m.setRaw(x, y, z, mat('belly'), partId.belly);
        } else {
          // 醒目背纹：正中纵鞍带 + 左右各 2 枚饱满圆斑（默认 ×4 俯视一眼可辨）
          const centerBand = Math.abs(X) <= 1.7 && Y >= -4.8 && Y <= 4.4 && z >= 8;
          const sideSpotF = Math.hypot(Math.abs(X) - 3.6, Y - 1.6) <= 1.85 && z >= 6;
          const sideSpotB = Math.hypot(Math.abs(X) - 3.4, Y + 2.6) <= 1.75 && z >= 6;
          if (centerBand || sideSpotF || sideSpotB) {
            m.setRaw(x, y, z, mat('spot'), partId.spot);
          } else {
            m.setRaw(x, y, z, mat('shell'), partId.shell);
          }
        }
      }
    });

    // 背脊微隆起装饰棱与尾端小圆翘
    m.paintCapsule(0, -5.6, 8.8, 0, 3.6, 10.6, 1.45, 1.25, mat('spot'), partId.spot, true);
    m.paintEllipsoid(0, -6.4, 5.8, 2.2, 1.8, 1.9, mat('shell'), partId.shell, true);

    // 前胸颈托领环（衔接短颈，避免俯身吸水时颈口脱节）
    m.paintEllipsoid(0, 6.2, 6.0, 3.0, 2.2, 2.6, mat('belly'), partId.belly, true);

    // 腹底 4 个外扩古铜色髋窝座（对应 4 条高跷腿上端起笔）
    const hips = [
      [-4.6,  3.5], [ 4.6,  3.5],
      [-4.6, -3.5], [ 4.6, -3.5]
    ];
    for (const [hx, hy] of hips) {
      m.paintCapsule(hx * 0.65, hy * 0.65, 3.8, hx, hy, 2.1, 1.65, 1.35, mat('hip'), partId.hip, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.5, headZ: 12, centerZ: 6 });
  }

  // =========================================================================
  // 2. 短颈头与加粗拉长吸管基段（常规抬头态 head：12×18×10）
  //    前伸亮橙/象牙吸管嘴基段明显加粗，表面雕 2×2 锐利双眼（0 遮挡）
  // =========================================================================
  function buildHead(makeCanvas, isSipPose) {
    const W = 12, D = 18, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    if (!isSipPose) {
      // 短颈（略向前上方探出）
      m.paintCapsule(0, -4.5, 4.4, 0, -1.2, 5.8, 2.2, 2.0, mat('neck'), partId.neck, true);
      // 饱满小头
      m.paintEllipsoid(0, 0.5, 6.2, 3.2, 3.3, 2.8, mat('neck'), partId.neck, true);
      // 额顶暖橙小冠斑（俯视快速辨识朝向）
      m.paintEllipsoid(0, 0.2, 8.6, 1.7, 2.1, 1.2, mat('spot'), partId.spot, true);
      // 加粗拉长的亮橙吸管嘴基段（从嘴基一直伸到 +Y 端 7.8，远看轮廓极清）
      m.paintCapsule(0, 2.8, 5.4, 0, 7.8, 4.2, 1.45, 0.95, mat('beak'), partId.beak, true);
      // 吸管基段一圈浅色骨环
      m.paintEllipsoid(0, 3.6, 5.3, 1.75, 1.0, 1.65, mat('belly'), partId.belly, true);
    } else {
      // 俯身吸水态：短颈向下弯折、头前倾朝向水面、吸管基段垂直斜插向下
      m.paintCapsule(0, -4.4, 7.6, 0, -0.8, 5.4, 2.15, 2.0, mat('neck'), partId.neck, true);
      m.paintEllipsoid(0, 0.8, 5.0, 3.2, 3.2, 2.7, mat('neck'), partId.neck, true);
      m.paintEllipsoid(0, 0.4, 7.4, 1.8, 2.2, 1.2, mat('spot'), partId.spot, true);
      // 吸管基段朝前下方陡插（衔接垂直探入水面的 kind: 'line' 吸管）
      m.paintCapsule(0, 2.4, 4.2, 0, 5.4, 1.2, 1.45, 0.95, mat('beak'), partId.beak, true);
      m.paintEllipsoid(0, 3.2, 3.4, 1.7, 1.1, 1.55, mat('belly'), partId.belly, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 表面落点精雕 2×2 锐利双眼（eyeGlint 不进 glowKeys，0.6 俯视 0 遮挡）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeZ = isSipPose ? 5 : 6;
    const eyWorld = isSipPose ? 2 : 2;
    const ey = Math.round(hd + eyWorld);
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 2.1);
      // 沿外侧找表面像素，避免被额顶遮挡
      let sx = ex;
      for (let step = 0; step <= 2; step++) {
        const tx = Math.round(hw + s * (3.2 - step));
        if (m.inB(tx, ey, eyeZ) && m.getId(tx, ey, eyeZ)) { sx = tx; break; }
      }
      if (m.inB(sx, ey, eyeZ)) {
        m.setRaw(sx, ey, eyeZ, keyToId.eyeIris, partId.eye);
        m.setRaw(sx, ey, eyeZ + 1, keyToId.eyeGlint, partId.eye);
        if (m.inB(sx, ey + 1, eyeZ)) m.setRaw(sx, ey + 1, eyeZ, keyToId.eyeDark, partId.eye);
        if (m.inB(sx, ey + 1, eyeZ + 1)) m.setRaw(sx, ey + 1, eyeZ + 1, keyToId.eyeIris, partId.eye);
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 10, centerZ: 5 });
  }

  // =========================================================================
  // 3. 膝关节矿壳环节件（3 档年龄厚度：新矿薄环 / 中矿节 / 老石笋厚壳）
  //    放大雕琢的灰白/赭黄一圈圈矿壳环，×4 缩放下辨识度极强
  // =========================================================================
  function buildKneeRing(makeCanvas, tier) {
    const dim = tier === 0 ? 6 : (tier === 1 ? 8 : 10);
    const h = tier === 0 ? 5 : (tier === 1 ? 6 : 8);
    const m = new VoxelModel(dim, dim, h, SPEC);
    const { mat, partId } = SPEC;

    const rBase = tier === 0 ? 2.1 : (tier === 1 ? 2.85 : 3.65);
    const cz = h * 0.5;
    m.fillAABB(-rBase - 0.5, rBase + 0.5, -rBase - 0.5, rBase + 0.5, 0, h - 1, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const ridge = Math.cos(ang * 4) * (tier === 0 ? 0.22 : (tier === 1 ? 0.36 : 0.52));
      const t = z / Math.max(1, h - 1);
      // 环状鼓起轮廓（中厚上下微收，老笋厚壳下缘带锥形垂挂结壳）
      const profile = tier === 2
        ? lerp(0.75, 1.05, Math.sin(t * Math.PI * 0.92 + 0.15))
        : (0.72 + Math.sin(t * Math.PI) * 0.34);
      const r = rBase * profile + ridge;
      if (Math.hypot(X, Y) <= r) {
        // 一圈圈灰白与赭黄矿脉交替层纹
        const isMineralBand = (z % 2 === 1) || (tier >= 1 && z === Math.floor(cz));
        m.setRaw(x, y, z, isMineralBand ? mat('mineral') : mat('crust'), isMineralBand ? partId.mineral : partId.crust);
      }
    });

    if (tier === 2) {
      // 老石笋厚壳：外侧挂出小矿瘤垂滴
      for (let k = 0; k < 4; k++) {
        const a = k * (TAU / 4) + 0.4;
        m.paintCapsule(Math.cos(a) * 2.5, Math.sin(a) * 2.5, 3.6, Math.cos(a) * 2.9, Math.sin(a) * 2.9, 0.7, 1.05, 0.65, mat('crust'), partId.crust, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: rBase, headZ: h - 1, centerZ: cz });
  }

  // =========================================================================
  // 4. 浸水脚踝矿壳套（3 档年龄厚度：薄矿圈 / 双环矿节 / 粗壮石笋脚壳）
  // =========================================================================
  function buildAnkleRing(makeCanvas, tier) {
    const dim = tier === 0 ? 6 : (tier === 1 ? 8 : 10);
    const h = tier === 0 ? 6 : (tier === 1 ? 7 : 9);
    const m = new VoxelModel(dim, dim, h, SPEC);
    const { mat, partId } = SPEC;

    const rBot = tier === 0 ? 2.1 : (tier === 1 ? 2.9 : 3.8);
    const rTop = tier === 0 ? 1.4 : (tier === 1 ? 1.9 : 2.4);

    m.fillAABB(-rBot - 0.5, rBot + 0.5, -rBot - 0.5, rBot + 0.5, 0, h - 1, (x, y, z, X, Y) => {
      const t = z / Math.max(1, h - 1);
      const ang = Math.atan2(Y, X);
      // 阶梯状一圈圈热泉沉积环（越靠近水面越粗，呈现泡久结壳感）
      const ringWave = Math.sin(t * Math.PI * (tier + 2)) * 0.35;
      const bumpy = Math.cos(ang * 4 + z * 0.8) * (0.20 + tier * 0.14);
      const r = lerp(rBot, rTop, t) + ringWave + bumpy;
      if (Math.hypot(X, Y) <= r) {
        const isMineral = (z === 1 || z === 3 || (tier === 2 && z === 5));
        m.setRaw(x, y, z, isMineral ? mat('mineral') : mat('crust'), isMineral ? partId.mineral : partId.crust);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: rBot, headZ: h - 1, centerZ: h * 0.45 });
  }

  // =========================================================================
  // 5. 下胫中段矿壳小环（shinRing：6×6×4，四重对称，突出「一圈圈矿壳」层次）
  // =========================================================================
  function buildShinRing(makeCanvas) {
    const m = new VoxelModel(6, 6, 4, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-2.3, 2.3, -2.3, 2.3, 0, 3, (x, y, z, X, Y) => {
      const r = (z === 1 || z === 2) ? 2.05 : 1.55;
      if (Math.hypot(X, Y) <= r) {
        const isMin = z === 1;
        m.setRaw(x, y, z, isMin ? mat('mineral') : mat('crust'), isMin ? partId.mineral : partId.crust);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.1, headZ: 3, centerZ: 1.5 });
  }

  // =========================================================================
  // 6. 3D 极向量高跷折角 IK（髋 -> 外展高屈膝 -> 水面落足）
  //    用 Gram-Schmidt 将每条腿自身的解剖外展+向上极向量正交分解到「髋->足」弦上，
  //    保证 |K-H| === L1 且 |F-K| === L2 精确无拉伸，膝盖恒向自身象限外上折，
  //    彻底消灭转身/落足偏后时的 180° 翻转奇点与前后腿交叉打架
  // =========================================================================
  function solveStiltLegIK(hx, hy, hz, fx, fy, fz, poleX, poleY, L1, L2, sMul) {
    const dx = fx - hx;
    const dy = fy - hy;
    const dz = fz - hz;
    const rawD = Math.hypot(dx, dy, dz) || 0.001;
    const minD = Math.abs(L1 - L2) + 0.35 * sMul;
    const maxD = L1 + L2 - 0.25 * sMul;
    const d = clamp(rawD, minD, maxD);

    const ux = dx / rawD;
    const uy = dy / rawD;
    const uz = dz / rawD;

    // 期望屈膝方向：沿本腿象限外展 + 适度上拱（鹤/长腿蛛式挺拔折膝）
    const prefX = poleX * 0.84;
    const prefY = poleY * 0.84;
    const prefZ = 0.54;

    // Gram-Schmidt 正交化得到垂直于「髋->足」连线的单位屈膝法向 B
    const dot = prefX * ux + prefY * uy + prefZ * uz;
    let bx = prefX - dot * ux;
    let by = prefY - dot * uy;
    let bz = prefZ - dot * uz;
    const bLen = Math.hypot(bx, by, bz) || 0.001;
    bx /= bLen;
    by /= bLen;
    bz /= bLen;

    const along = (L1 * L1 + d * d - L2 * L2) / (2 * d);
    const perp = Math.sqrt(Math.max(0, L1 * L1 - along * along));

    const kx = hx + ux * along + bx * perp;
    const ky = hy + uy * along + by * perp;
    const kz = Math.max(fz + 4.5 * sMul, hz + uz * along + bz * perp);
    return { kx, ky, kz };
  }

  // =========================================================================
  // 7. Def 注册对象
  // =========================================================================
  const Marsh6Def = {
    id: 'marsh6_stilt_walker',
    code: '泽6',
    name: '在热水池间点着走的高跷',
    status: 'done',
    tag: 'M26 高跷长腿 / 水面轻点 标杆（3D 折角画线 IK + 矿壳环节 + 单腿点水涟漪）',
    summary: '悬空饱满圆躯高立于 z ≈ 26~34 格，4 条高跷长腿以 3D 折角 IK 像素画线串联膝/胫/踝三处矿壳环节（3 套皮肤对应新矿薄环 / 中矿节 / 老石笋厚壳）；鹤式四足单腿依次高抬轻点热水荡开涟漪，周期性停步俯低短颈把亮橙长吸管探入水面吸水冒泡',
    defaultHabitat: 'hotspring',
    footRadius: 13.5,
    ecoWeight: 1.15,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '热泉巡步点水', loop: true, status: 'done' },
      { id: 'idle',   name: '稳立水中待机', loop: true, status: 'done' },
      { id: 'sip',    name: '俯身探管吸水', loop: true, status: 'done' }
    ],
    blocks: [
      '悬空高饱和圆躯与二阶弹簧微晃',
      '3D 外展折角高跷四足 IK（widthArtPx: 2 像素画线）',
      '三档年龄矿壳环节（薄环 / 中矿节 / 老石笋厚壳）',
      '四足严格单腿交替抬步与落足水涟漪',
      '俯身探管吸水冒泡与昂首抖珠'
    ],
    soulHabit: '在热泉梯田间慢悠悠一根根高抬细长高跷腿，轻点入水荡开一圈圈热水涟漪；高处圆身随步态轻晃，隔几步便停稳俯低短颈，把加粗亮橙吸管探进热水里吸食冒泡，随后昂首抖落水珠继续挪步',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        body:       buildBody(makeCanvas),
        head:       buildHead(makeCanvas, false),
        headSip:    buildHead(makeCanvas, true),
        kneeThin:   buildKneeRing(makeCanvas, 0),
        kneeMed:    buildKneeRing(makeCanvas, 1),
        kneeThick:  buildKneeRing(makeCanvas, 2),
        ankleThin:  buildAnkleRing(makeCanvas, 0),
        ankleMed:   buildAnkleRing(makeCanvas, 1),
        ankleThick: buildAnkleRing(makeCanvas, 2),
        shinRing:   buildShinRing(makeCanvas)
      };

      const kneeAssets = [parts.kneeThin, parts.kneeMed, parts.kneeThick];
      const ankleAssets = [parts.ankleThin, parts.ankleMed, parts.ankleThick];

      // 4 条高跷腿拓扑（髋点紧贴圆躯底侧，落足呈宽大稳健四足支撑菱形）
      // 严格单腿四拍交替相位：BL(0.00) -> FL(0.25) -> BR(0.50) -> FR(0.75)
      // 每条腿带独立解剖外展极向量 (poleLX, poleLY)，保证 360° 视角下膝盖永不交叉翻转
      const LEG_CONFIGS = [
        { id: 'BL', order: 0, phaseOff: 0.00, hipX: -4.6, hipY: -3.5, hipZ: 1.8, restX: -13.2, restY: -10.8, poleLX: -0.78, poleLY: -0.62, L1: 16.5, L2: 29.0 },
        { id: 'FL', order: 1, phaseOff: 0.25, hipX: -4.6, hipY:  3.5, hipZ: 1.8, restX: -13.2, restY:  11.2, poleLX: -0.78, poleLY:  0.62, L1: 16.5, L2: 29.0 },
        { id: 'BR', order: 2, phaseOff: 0.50, hipX:  4.6, hipY: -3.5, hipZ: 1.8, restX:  13.2, restY: -10.8, poleLX:  0.78, poleLY: -0.62, L1: 16.5, L2: 29.0 },
        { id: 'FR', order: 3, phaseOff: 0.75, hipX:  4.6, hipY:  3.5, hipZ: 1.8, restX:  13.2, restY:  11.2, poleLX:  0.78, poleLY:  0.62, L1: 16.5, L2: 29.0 }
      ];

      const legs = LEG_CONFIGS.map(cfg => ({
        ...cfg,
        hipWX: cfg.hipX,
        hipWY: cfg.hipY,
        hipWZ: 30.5,
        kneeX: cfg.restX * 1.15,
        kneeY: cfg.restY * 1.15,
        kneeZ: 29.5,
        footX: cfg.restX,
        footY: cfg.restY,
        footZ: 0,
        startX: cfg.restX,
        startY: cfg.restY,
        targetX: cfg.restX,
        targetY: cfg.restY,
        stepping: false,
        isSettling: false,
        stepT: 0,
        stepDur: 0.42,
        stepH: 7.4
      }));

      // 二阶弹簧：高处圆躯高度起伏 + 双轴惯性晃动 + 吸水俯低混合量
      const bodyZSpring = new SpringDamper1D(29.0, 28, 4.6);
      const swayXSpring = new SpringDamper1D(0, 20, 3.2);
      const swayYSpring = new SpringDamper1D(0, 20, 3.2);
      const sipSpring   = new SpringDamper1D(0, 22, 5.2);

      const homeX0 = opts.homeX ?? 0;
      const homeY0 = opts.homeY ?? 0;
      const homeYaw0 = opts.homeYaw ?? 0;

      const state = {
        x: homeX0,
        y: homeY0,
        z: 29.0,
        vx: 0,
        vy: 0,
        yaw: homeYaw0,
        prevYaw: homeYaw0,
        shadowScale: 0.48, // 高悬躯体正下方漫射暗印；4 足落点印由 footContacts 明确标出
        // 巡游/吸水小状态机：'walk' | 'sip_down' | 'sip_hold' | 'sip_up'
        mode: 'walk',
        modeTimer: 0,
        modeDur: 6.2,
        navX: homeX0 + 14,
        navY: homeY0 + 8,
        navSeq: 1,
        gaitPhase: 0,
        nextLegOrder: 0,
        idleTapTimer: 2.2,
        bubbleTimer: 0,
        sipBlend: 0,
        headYawOff: 0,
        bodyRenderX: homeX0,
        bodyRenderY: homeY0,
        bodyRenderZ: 29.0,
        strawBaseX: homeX0,
        strawBaseY: homeY0,
        strawBaseZ: 32.0,
        strawTipX: homeX0,
        strawTipY: homeY0 + 12,
        strawTipZ: 26.0,
        seed: opts.seed ?? 93
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function pickNextTarget(maxR) {
        state.navSeq++;
        const r1 = hash2i(state.navSeq, state.seed, 131);
        const r2 = hash2i(state.navSeq, state.seed, 257);
        const r3 = hash2i(state.navSeq, state.seed, 389);
        const curAng = Math.atan2(state.y, state.x);
        const ang = curAng + (r1 > 0.5 ? 1 : -1) * lerp(1.1, 2.35, r2);
        const rad = lerp(maxR * 0.25, maxR * 0.92, r3);
        state.navX = Math.cos(ang) * rad;
        state.navY = Math.sin(ang) * rad;
      }

      function emitFootRipple(vfx, habitat, wx, wy, sMul, power) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const habFx = (habitat && habitat.fx) || { ringRGB: '150, 220, 220', foamRGB: '240, 250, 248', dustRGB: '210, 200, 186' };
        // 每落一足清晰荡开一圈热水小涟漪
        vfx.addRipple(wx, wy, 1.6 * sMul, (10.5 + power * 3.5) * sMul, 0.78, 1.5);
        if (habitat && !habitat.isWater) {
          vfx.spawnDust(wx, wy, 3, 0.45 * sMul, habFx);
        } else {
          // 轻点水面的 3 颗细小水珠粒子
          for (let k = 0; k < 3; k++) {
            const a = (k / 3) * TAU + Math.random() * 0.7;
            const spd = (3.2 + Math.random() * 4.5) * sMul;
            vfx.spawnParticle(
              wx + (Math.random() - 0.5) * 1.4 * sMul,
              wy + (Math.random() - 0.5) * 1.4 * sMul,
              0.9 * sMul,
              Math.cos(a) * spd,
              Math.sin(a) * spd,
              (5.0 + Math.random() * 4.2) * sMul,
              0.34 + Math.random() * 0.16,
              1.15,
              fx.drop,
              false,
              32
            );
          }
        }
      }

      function emitSipBubbles(vfx, wx, wy, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        vfx.addRipple(wx, wy, 1.1 * sMul, 7.8 * sMul, 0.55, 1.25);
        for (let k = 0; k < 2; k++) {
          const a = Math.random() * TAU;
          const r = (0.8 + Math.random() * 1.8) * sMul;
          vfx.spawnParticle(
            wx + Math.cos(a) * r,
            wy + Math.sin(a) * r,
            1.2 * sMul,
            Math.cos(a) * 1.8 * sMul,
            Math.sin(a) * 1.8 * sMul,
            (4.2 + Math.random() * 3.5) * sMul,
            0.48 + Math.random() * 0.24,
            1.15 + Math.random() * 0.35,
            k === 0 ? fx.bubble : fx.drop,
            false,
            6
          );
        }
      }

      function emitShakeDrops(vfx, wx, wy, wz, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * TAU + Math.random() * 0.4;
          const spd = (6.5 + Math.random() * 6.0) * sMul;
          vfx.spawnParticle(
            wx, wy, wz,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            (3.0 + Math.random() * 4.5) * sMul,
            0.42 + Math.random() * 0.18,
            1.25,
            fx.drop,
            false,
            34
          );
        }
      }

      function updateLegIKAndContacts(sMul) {
        const bx = state.bodyRenderX;
        const by = state.bodyRenderY;
        const bz = state.bodyRenderZ;
        const yw = state.yaw;
        const contacts = [];

        for (let i = 0; i < legs.length; i++) {
          const leg = legs[i];
          const [hx, hy] = localToWorldXY(bx, by, yw, leg.hipX * sMul, leg.hipY * sMul);
          const hz = bz + leg.hipZ * sMul;
          leg.hipWX = hx;
          leg.hipWY = hy;
          leg.hipWZ = hz;

          // 每条腿在机身局部坐标系下的外展极向量转到世界空间
          const [poleX, poleY] = localToWorldXY(0, 0, yw, leg.poleLX, leg.poleLY);
          const ik = solveStiltLegIK(
            hx, hy, hz,
            leg.footX, leg.footY, leg.footZ,
            poleX, poleY,
            leg.L1 * sMul, leg.L2 * sMul, sMul
          );
          leg.kneeX = ik.kx;
          leg.kneeY = ik.ky;
          leg.kneeZ = ik.kz;

          contacts.push({
            x: leg.footX,
            y: leg.footY,
            z: leg.footZ,
            r: (2.3 + curSkin.crustTier * 0.45) * sMul
          });
        }
        instance.footContacts = contacts;
      }

      function startSingleLegStep(leg, tx, ty, dur, height, isSettling) {
        leg.stepping = true;
        leg.isSettling = !!isSettling;
        leg.stepT = 0;
        leg.stepDur = dur;
        leg.stepH = height;
        leg.startX = leg.footX;
        leg.startY = leg.footY;
        leg.targetX = tx;
        leg.targetY = ty;
      }

      const instance = {
        def: Marsh6Def,
        cachePrefix: `marsh6_sw_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        legs,
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
          state.z = 29.0 * sMul;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.prevYaw = homeYaw;
          state.mode = 'walk';
          state.modeTimer = 0;
          state.modeDur = 5.6;
          state.navSeq = 1;
          state.gaitPhase = 0;
          state.nextLegOrder = 0;
          state.idleTapTimer = 2.0;
          state.bubbleTimer = 0;
          state.sipBlend = 0;
          state.headYawOff = 0;
          state.bodyRenderX = homeX;
          state.bodyRenderY = homeY;
          state.bodyRenderZ = 29.0 * sMul;

          bodyZSpring.x = 29.0; bodyZSpring.v = 0;
          swayXSpring.x = 0; swayXSpring.v = 0;
          swayYSpring.x = 0; swayYSpring.v = 0;
          sipSpring.x = 0; sipSpring.v = 0;

          pickNextTarget(34 * sMul);

          for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            const [rx, ry] = localToWorldXY(homeX, homeY, homeYaw, leg.restX * sMul, leg.restY * sMul);
            leg.footX = leg.startX = leg.targetX = rx;
            leg.footY = leg.startY = leg.targetY = ry;
            leg.footZ = 0;
            leg.stepping = false;
            leg.isSettling = false;
            leg.stepT = 0;
          }

          updateLegIKAndContacts(sMul);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));

          const actionId = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const isIdle = actionId === 'idle';
          const isSipDemo = actionId === 'sip';

          // 巡游严格钳制在 maxRadius * 0.78 内（给宽大高跷足步留足边缘安全余量）
          const rawMaxR = (eco && eco.maxRadius) ? eco.maxRadius : 46;
          const patrolR = Math.max(12, rawMaxR * 0.78);

          // 1. 行为模式与吸水节拍推进
          let wantMove = false;
          let sipTarget = 0;
          let headScan = Math.sin(time * 1.1) * 0.16 * flex;

          if (isIdle) {
            state.mode = 'walk';
            state.modeTimer = 0;
            sipTarget = 0;
            wantMove = false;
            const homeYaw = (eco && eco.homeYaw !== undefined) ? eco.homeYaw : homeYaw0;
            state.yaw = wrapAngle(state.yaw + wrapAngle(homeYaw - state.yaw) * expSmooth(dt, 2.5));
          } else if (isSipDemo) {
            state.modeTimer += dt * spdMul;
            const cycle = state.modeTimer % 5.8;
            if (cycle < 0.95) {
              sipTarget = smoothstep(0.0, 0.95, cycle);
              headScan = 0;
            } else if (cycle < 3.55) {
              sipTarget = 1.0;
              headScan = Math.sin(time * 4.5) * 0.05;
              state.bubbleTimer += dt * spdMul;
              if (state.bubbleTimer >= 0.34) {
                state.bubbleTimer = 0;
                emitSipBubbles(vfx, state.strawTipX, state.strawTipY, sMul);
              }
            } else if (cycle < 4.45) {
              const prevU = (cycle - dt * spdMul - 3.55) / 0.90;
              const curU = (cycle - 3.55) / 0.90;
              sipTarget = 1.0 - smoothstep(0, 1, curU);
              headScan = Math.sin(curU * Math.PI * 5.0) * 0.24 * (1 - curU * 0.4);
              if (prevU < 0.22 && curU >= 0.22) {
                emitShakeDrops(vfx, state.strawTipX, state.strawTipY, state.strawTipZ, sMul);
              }
            } else {
              sipTarget = 0;
              headScan = Math.sin(time * 1.6) * 0.14 * flex;
            }
          } else {
            state.modeTimer += dt * spdMul;
            if (state.mode === 'walk') {
              wantMove = true;
              sipTarget = 0;
              if (state.modeTimer >= state.modeDur) {
                state.mode = 'sip_down';
                state.modeTimer = 0;
                state.modeDur = 0.85;
              }
            } else if (state.mode === 'sip_down') {
              wantMove = false;
              sipTarget = smoothstep(0, 1, clamp(state.modeTimer / state.modeDur, 0, 1));
              headScan = 0;
              if (state.modeTimer >= state.modeDur) {
                state.mode = 'sip_hold';
                state.modeTimer = 0;
                state.modeDur = 2.35;
                state.bubbleTimer = 0.2;
              }
            } else if (state.mode === 'sip_hold') {
              wantMove = false;
              sipTarget = 1.0;
              headScan = Math.sin(time * 4.2) * 0.05;
              state.bubbleTimer += dt * spdMul;
              if (state.bubbleTimer >= 0.36) {
                state.bubbleTimer = 0;
                emitSipBubbles(vfx, state.strawTipX, state.strawTipY, sMul);
              }
              if (state.modeTimer >= state.modeDur) {
                state.mode = 'sip_up';
                state.modeTimer = 0;
                state.modeDur = 0.88;
                emitShakeDrops(vfx, state.strawTipX, state.strawTipY, state.strawTipZ, sMul);
              }
            } else {
              wantMove = false;
              const uUp = clamp(state.modeTimer / Math.max(0.01, state.modeDur), 0, 1);
              sipTarget = 1.0 - smoothstep(0, 1, uUp);
              headScan = Math.sin(uUp * Math.PI * 5.0) * 0.22 * (1 - uUp * 0.35);
              if (state.modeTimer >= state.modeDur) {
                state.mode = 'walk';
                state.modeTimer = 0;
                state.modeDur = lerp(5.4, 7.8, hash2i(state.navSeq, state.seed, 509));
                pickNextTarget(patrolR);
              }
            }
          }

          // 2. 巡游位移（从容优雅的鹤步巡游速度 + 步幅匹配防拖腿 + 严格钳制在 patrolR 内）
          if (wantMove) {
            const tx = state.navX + (eco && eco.avoidX ? eco.avoidX * 0.45 : 0);
            const ty = state.navY + (eco && eco.avoidY ? eco.avoidY * 0.45 : 0);
            const dx = tx - state.x;
            const dy = ty - state.y;
            const dist = Math.hypot(dx, dy);

            if (dist < 6.0) {
              pickNextTarget(patrolR);
            }

            const desiredYaw = Math.atan2(-dx, dy);
            const yawDiff = wrapAngle(desiredYaw - state.yaw);
            const maxTurn = 1.25 * (0.7 + spdMul * 0.35);
            state.yaw = wrapAngle(state.yaw + clamp(yawDiff, -maxTurn * dt, maxTurn * dt));

            const align = lerp(0.30, 1.0, smoothstep(-0.3, 0.85, Math.cos(yawDiff)));
            const cruiseSpd = 5.6 * spdMul * align;
            const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);
            const kV = expSmooth(dt, 4.8);
            state.vx = lerp(state.vx, fwdX * cruiseSpd, kV);
            state.vy = lerp(state.vy, fwdY * cruiseSpd, kV);
          } else {
            const kStop = expSmooth(dt, 7.5);
            state.vx = lerp(state.vx, 0, kStop);
            state.vy = lerp(state.vy, 0, kStop);
          }

          state.x += state.vx * dt;
          state.y += state.vy * dt;

          // 严格钳制在 maxRadius * 0.78 内
          const curDist = Math.hypot(state.x, state.y);
          if (curDist > patrolR) {
            const kClamp = patrolR / curDist;
            state.x *= kClamp;
            state.y *= kClamp;
            pickNextTarget(patrolR);
          }

          const moveSpd = Math.hypot(state.vx, state.vy);
          const yawRate = Math.abs(wrapAngle(state.yaw - state.prevYaw)) / Math.max(dt, 0.001);
          state.prevYaw = state.yaw;

          // 3. 位移 + 转向驱动的四拍单腿鹤步步态（duty β = 0.76，同时最多抬 1 条腿）
          //    支撑期足掌钉地零滑冰，摆动期走「先垂直出水 -> 高膝前移 -> 垂直轻点入水」曲线，
          //    每步跨幅严格锁在 ±4.2 格内，前后腿永不拖行、永不交叉
          const isMoving = moveSpd > 0.75 || yawRate > 0.14;
          const strideLen = 8.4 * sMul;
          const swingFrac = 0.24; // < 0.25：严格保证四足依次单腿抬起，间歇 0.01 四足稳立
          const reachHalf = 4.0 * sMul;
          const stepH = 7.6 * sMul;
          const fwdX = -Math.sin(state.yaw), fwdY = Math.cos(state.yaw);

          let swayImpX = 0, swayImpY = 0;
          let stepLiftBoost = 0;

          if (isMoving) {
            const dPhase = ((moveSpd / strideLen) + yawRate * 0.24) * dt * clamp(gFreq, 0.45, 2.0);
            state.gaitPhase = (state.gaitPhase + dPhase) % 1;
            const speedRatio = clamp(moveSpd / 5.6, 0.35, 1.10);

            for (let i = 0; i < legs.length; i++) {
              const leg = legs[i];
              leg.isSettling = false;
              const [ix, iy] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
              const landX = ix + fwdX * reachHalf * speedRatio;
              const landY = iy + fwdY * reachHalf * speedRatio;

              const phi = (state.gaitPhase + leg.phaseOff) % 1;
              if (phi < swingFrac) {
                if (!leg.stepping) {
                  leg.stepping = true;
                  leg.startX = leg.footX;
                  leg.startY = leg.footY;
                }
                const u = clamp(phi / swingFrac, 0, 1);
                leg.stepT = u;
                // 鹤式点水轨迹：先垂直接近离开水面 -> 中段高膝优雅前移 -> 末段垂直轻点入水
                const xyU = smoothstep(0.16, 0.84, u);
                leg.footX = lerp(leg.startX, landX, xyU);
                leg.footY = lerp(leg.startY, landY, xyU);
                const zArc = Math.pow(Math.sin(u * Math.PI), 0.68);
                leg.footZ = zArc * stepH * (0.72 + 0.28 * speedRatio);
                stepLiftBoost = zArc * 0.95;
                swayImpX = -Math.sign(leg.restX) * zArc * 0.85;
                swayImpY = -Math.sign(leg.restY) * zArc * 0.48;
              } else {
                if (leg.stepping) {
                  leg.stepping = false;
                  leg.stepT = 1;
                  leg.footX = landX;
                  leg.footY = landY;
                  leg.footZ = 0;
                  state.nextLegOrder = (leg.order + 1) % 4;
                  emitFootRipple(vfx, habitat, leg.footX, leg.footY, sMul, 1.0);
                  bodyZSpring.impulse(-1.8);
                  swayXSpring.impulse(Math.sign(leg.restX) * 0.72);
                  swayYSpring.impulse(Math.sign(leg.restY) * 0.52);
                } else {
                  leg.footZ = 0;
                }
                // 支撑期钉地 + 最大偏移限幅（5.4 格），彻底消灭极端转弯拖腿
                const dxId = leg.footX - ix, dyId = leg.footY - iy;
                const dId = Math.hypot(dxId, dyId);
                const maxLag = 5.4 * sMul;
                if (dId > maxLag && dId > 0.001) {
                  leg.footX = ix + (dxId / dId) * maxLag;
                  leg.footY = iy + (dyId / dId) * maxLag;
                }
              }
            }
          } else {
            // 停步收脚与待机单腿点水：先平稳放回空中脚，再依次轻抬收回对称站姿
            let activeLeg = null;
            for (let i = 0; i < legs.length; i++) {
              if (legs[i].stepping) { activeLeg = legs[i]; break; }
            }

            if (activeLeg) {
              if (!activeLeg.isSettling) {
                activeLeg.isSettling = true;
                activeLeg.startX = activeLeg.footX;
                activeLeg.startY = activeLeg.footY;
                const [ix, iy] = localToWorldXY(state.x, state.y, state.yaw, activeLeg.restX * sMul, activeLeg.restY * sMul);
                activeLeg.targetX = ix;
                activeLeg.targetY = iy;
                activeLeg.stepDur = 0.34;
                activeLeg.stepH = 5.6 * sMul;
                activeLeg.stepT = clamp(activeLeg.stepT, 0.2, 0.65);
              }
              activeLeg.stepT += dt / Math.max(0.18, activeLeg.stepDur);
              if (activeLeg.stepT >= 1.0) {
                activeLeg.stepping = false;
                activeLeg.isSettling = false;
                activeLeg.stepT = 1.0;
                activeLeg.footX = activeLeg.targetX;
                activeLeg.footY = activeLeg.targetY;
                activeLeg.footZ = 0;
                state.nextLegOrder = (activeLeg.order + 1) % 4;
                emitFootRipple(vfx, habitat, activeLeg.footX, activeLeg.footY, sMul, 0.85);
                bodyZSpring.impulse(-1.4);
              } else {
                const u = activeLeg.stepT;
                const xyU = smoothstep(0.16, 0.84, u);
                activeLeg.footX = lerp(activeLeg.startX, activeLeg.targetX, xyU);
                activeLeg.footY = lerp(activeLeg.startY, activeLeg.targetY, xyU);
                const zArc = Math.pow(Math.sin(u * Math.PI), 0.72);
                activeLeg.footZ = zArc * activeLeg.stepH;
                stepLiftBoost = zArc * 0.65;
                swayImpX = -Math.sign(activeLeg.restX) * zArc * 0.65;
                swayImpY = -Math.sign(activeLeg.restY) * zArc * 0.35;
              }
            } else {
              // 检查是否有足掌偏离理想站姿 > 1.35 格，依次收回稳立
              let worstLeg = null, worstErr = 1.35 * sMul;
              for (let i = 0; i < legs.length; i++) {
                const leg = legs[i];
                const [ix, iy] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
                leg._ix = ix; leg._iy = iy;
                const err = Math.hypot(ix - leg.footX, iy - leg.footY);
                if (err > worstErr) { worstErr = err; worstLeg = leg; }
              }
              if (worstLeg) {
                startSingleLegStep(worstLeg, worstLeg._ix, worstLeg._iy, 0.38, 5.4 * sMul, true);
              } else if (isIdle) {
                // 原地待机偶发单腿轻抬点水，泛起一圈热水涟漪
                state.idleTapTimer -= dt * gFreq;
                if (state.idleTapTimer <= 0) {
                  const tapLeg = legs[state.nextLegOrder % 4];
                  state.idleTapTimer = lerp(2.4, 3.8, hash2i(Math.floor(time * 2), state.seed, 719));
                  const tapOffX = (hash2i(Math.floor(time * 3), state.seed, 811) - 0.5) * 1.4 * sMul;
                  const tapOffY = (hash2i(Math.floor(time * 3), state.seed, 823) - 0.5) * 1.4 * sMul;
                  startSingleLegStep(tapLeg, tapLeg._ix + tapOffX, tapLeg._iy + tapOffY, 0.66, 6.2 * sMul, true);
                }
              }
            }
          }

          // 4. 二阶弹簧驱动悬空圆躯轻晃与高度起伏（严禁常态 scale 拉伸）
          sipSpring.update(dt, sipTarget, 22 * sp, clamp(5.2 * dScale, 2.8, 9.0));
          state.sipBlend = clamp(sipSpring.x, 0, 1);

          // 常规离地 z ≈ 29.0（在 26~34 格区间），俯身吸水时压低至 z ≈ 22.8
          const breathZ = Math.sin(time * 1.85 * gFreq) * 0.78 * flex;
          const gaitBobZ = isMoving ? Math.cos(state.gaitPhase * 4 * TAU) * 0.45 : 0;
          const targetBodyZ = lerp(29.0, 22.8, state.sipBlend) + breathZ + gaitBobZ + stepLiftBoost;
          bodyZSpring.update(dt, targetBodyZ, 28 * sp, clamp(4.6 * dScale, 2.5, 8.5));
          state.z = clamp(bodyZSpring.x, 20.5, 34.5) * sMul;

          // 高处圆躯水平微微晃动（风吹 + 抬腿重心微移）
          const windLx = (Math.sin(time * 1.25) * 0.55 + (fbm1(time * 0.5, state.seed) - 0.5) * 0.75) * flex;
          const windLy = (Math.cos(time * 1.05 + 0.7) * 0.48 + (fbm1(time * 0.45, state.seed + 41) - 0.5) * 0.65) * flex;
          swayXSpring.update(dt, windLx + swayImpX, 20 * sp, clamp(3.2 * dScale, 1.8, 6.8));
          swayYSpring.update(dt, windLy + swayImpY + state.sipBlend * 1.8, 20 * sp, clamp(3.2 * dScale, 1.8, 6.8));

          const [bwx, bwy] = localToWorldXY(state.x, state.y, state.yaw, swayXSpring.x * sMul, swayYSpring.x * sMul);
          state.bodyRenderX = bwx;
          state.bodyRenderY = bwy;
          state.bodyRenderZ = state.z;
          state.headYawOff = lerp(state.headYawOff, headScan, expSmooth(dt, 8.0));

          // 5. 更新 4 条高跷腿 3D IK 与地面 footContacts
          updateLegIKAndContacts(sMul);

          // 6. 解算短颈头与加粗长吸管的 3D 起止点
          const headYaw = wrapAngle(state.yaw + state.headYawOff);
          const headLocalY = lerp(8.0, 9.6, state.sipBlend);
          const headLocalZ = lerp(1.6, -2.8, state.sipBlend);
          const [hwx, hwy] = localToWorldXY(state.bodyRenderX, state.bodyRenderY, state.yaw, 0, headLocalY * sMul);
          const hwz = state.bodyRenderZ + headLocalZ * sMul;
          sockets.setWorld('head', hwx, hwy, hwz, headYaw);

          // 吸管画线起点（紧贴头端亮橙吸管嘴基段末端）
          const baseOffY = lerp(7.2, 5.0, state.sipBlend);
          const baseOffZ = lerp(4.2, 1.6, state.sipBlend);
          const [sbx, sby] = localToWorldXY(hwx, hwy, headYaw, 0, baseOffY * sMul);
          const sbz = hwz + baseOffZ * sMul;

          // 吸管画线终点：巡游时前斜下伸展（一眼可见）；吸水时笔直探入水面（z ≈ 1.2）
          const tipOffY = lerp(15.2, 11.4, state.sipBlend);
          const [stx, sty] = localToWorldXY(hwx, hwy, headYaw, 0, tipOffY * sMul);
          const stz = lerp(sbz - 7.5 * sMul, 1.2 * sMul, smoothstep(0.15, 0.95, state.sipBlend));

          state.strawBaseX = sbx;
          state.strawBaseY = sby;
          state.strawBaseZ = sbz;
          state.strawTipX = stx;
          state.strawTipY = sty;
          state.strawTipZ = stz;
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const isWater = !!(habitat && habitat.isWater);
          const waterLevel = habitat ? (habitat.waterLevel ?? -99) : -99;
          const calcSub = (z) => EnvFeedback.calcSubmerge(z, waterLevel, 4.5, isWater);
          const lineCol = (curSkin && curSkin.line) || SKINS[0].line;
          const tier = curSkin ? (curSkin.crustTier | 0) : 0;
          const kneeAsset = kneeAssets[clamp(tier, 0, 2)];
          const ankleAsset = ankleAssets[clamp(tier, 0, 2)];

          // 1. 4 条高跷长腿：上股画线 + 下胫画线 + 膝矿壳环 + 下胫矿壳环 + 浸水脚踝矿壳套
          for (let i = 0; i < legs.length; i++) {
            const leg = legs[i];
            const legYaw = Math.atan2(-(leg.footX - leg.hipWX), leg.footY - leg.hipWY);

            // 上股杆（髋 -> 高屈膝，widthArtPx: 2 + outlineColor 杜绝断线）
            list.push({
              kind: 'line',
              partKey: `legUpper_${leg.id}`,
              x0: leg.hipWX,
              y0: leg.hipWY,
              z0: leg.hipWZ,
              x1: leg.kneeX,
              y1: leg.kneeY,
              z1: leg.kneeZ,
              sag: -0.35 * sMul,
              segments: 6,
              color: lineCol.legUpper,
              outlineColor: lineCol.legOutline,
              widthArtPx: 2,
              opacity: 1,
              bias: 0.0
            });

            // 下胫杆（高屈膝 -> 水面落足，widthArtPx: 2 + outlineColor）
            list.push({
              kind: 'line',
              partKey: `legLower_${leg.id}`,
              x0: leg.kneeX,
              y0: leg.kneeY,
              z0: leg.kneeZ,
              x1: leg.footX,
              y1: leg.footY,
              z1: leg.footZ + 1.0 * sMul,
              sag: 0,
              segments: 8,
              color: lineCol.legLower,
              outlineColor: lineCol.legOutline,
              widthArtPx: 2,
              opacity: 1,
              bias: 0.0
            });

            // 膝关节矿壳环节件（按皮肤档位切薄环 / 中矿节 / 老石笋厚壳）
            list.push({
              partKey: `kneeRing_${leg.id}`,
              asset: kneeAsset,
              x: leg.kneeX,
              y: leg.kneeY,
              lift: Math.max(0.5 * sMul, leg.kneeZ - (tier + 2.2) * sMul),
              ro: legYaw,
              submerge: calcSub(leg.kneeZ),
              bias: 0.14,
              symDeg: 90
            });

            // 下胫中段矿壳小环（位于腿下段约 34% 高度，突出一圈圈矿壳）
            const shinU = 0.66;
            const shX = lerp(leg.kneeX, leg.footX, shinU);
            const shY = lerp(leg.kneeY, leg.footY, shinU);
            const shZ = lerp(leg.kneeZ, leg.footZ + 1.0 * sMul, shinU);
            list.push({
              partKey: `shinRing_${leg.id}`,
              asset: parts.shinRing,
              x: shX,
              y: shY,
              lift: Math.max(0.4 * sMul, shZ - 1.6 * sMul),
              ro: legYaw,
              submerge: calcSub(shZ),
              bias: 0.12,
              symDeg: 90
            });

            // 浸水脚踝矿壳套（浸在热水中染水色，高抬时清晰滴水）
            list.push({
              partKey: `ankleRing_${leg.id}`,
              asset: ankleAsset,
              x: leg.footX,
              y: leg.footY,
              lift: Math.max(0.0, leg.footZ),
              ro: legYaw,
              submerge: calcSub(leg.footZ + 1.2 * sMul),
              bias: 0.16,
              symDeg: 90
            });
          }

          // 2. 高悬饱满圆躯（z ≈ 26~34）
          list.push({
            partKey: 'body',
            asset: parts.body,
            x: state.bodyRenderX,
            y: state.bodyRenderY,
            lift: state.bodyRenderZ,
            ro: yw,
            submerge: calcSub(state.bodyRenderZ),
            bias: 0.35
          });

          // 3. 短颈小头（常规抬头 / 俯身吸水两档预烘切换，0 拉伸）
          const hPose = sockets.get('head');
          const useSipHead = state.sipBlend > 0.45;
          list.push({
            partKey: useSipHead ? 'headSip' : 'head',
            asset: useSipHead ? parts.headSip : parts.head,
            x: hPose.x,
            y: hPose.y,
            lift: hPose.z,
            ro: hPose.yaw,
            submerge: calcSub(hPose.z),
            bias: 0.55
          });

          // 4. 加粗拉长的亮橙吸管嘴前段（kind: 'line', widthArtPx: 2 + 深暗边）
          list.push({
            kind: 'line',
            partKey: 'proboscisStraw',
            x0: state.strawBaseX,
            y0: state.strawBaseY,
            z0: state.strawBaseZ,
            x1: state.strawTipX,
            y1: state.strawTipY,
            z1: state.strawTipZ,
            sag: state.sipBlend > 0.3 ? 0.35 * sMul : 0.15 * sMul,
            segments: 6,
            color: lineCol.straw,
            outlineColor: lineCol.strawOutline,
            widthArtPx: 2,
            opacity: 1,
            bias: 0.62
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Marsh6Def.id,
            code: Marsh6Def.code,
            name: Marsh6Def.name,
            status: Marsh6Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            footRadius: Marsh6Def.footRadius,
            headZ: 42,
            centerZ: 29,
            blocks: Marsh6Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Marsh6Def);
})(window.PixelWorkshop);
