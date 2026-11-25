'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SpringDamper3D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 洞4 · 拼骨幼虫（格陵兰 Tupilak + 石蛾幼虫 · v3 精制纯生态版，+Y 正前）
  //   1. 柔软苍白的肥胖软体幼虫：3 档无损烘焙蠕动体节 + 独立圆头（两对摸索口须 +
  //      一对纯黑无辜大圆眼，eyeGlint 严禁进 glowKeys）+ 前胸 3 对短小爬行足；
  //   2. 核心标志：背后罩着由弯曲白肋骨、半片迷你小兽颅骨、带刺鱼脊骨、断角等
  //      杂乱零碎兽骨拼搭而成的锥形“拼装骨壳”，提供 3 套可轮换/随机的拼装变体；
  //   3. 待机交互物（全立体体素件）：洞底散落 3 块零碎骨渣（小骨节/断牙/碎甲片）+
  //      洞顶滴水；幼虫蠕动寻骨 -> 口须抱起往壳缘蹭贴修补（骨壳咔哒弹簧晃动）->
  //      水滴砸落溅起涟漪 -> 受惊整只缩进骨壳微微发抖 -> 探出半个脑袋左右张望再继续；
  //   4. 零常态小数缩放、零自建整屏画布、严格 <= 48 色与零重色，兼容 idle/patrol 双态。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 柔软苍白软体幼虫
      larvaDark:    '#a89d96',
      larvaMid:     '#dfd6ce',
      larvaHi:      '#faf5ef',
      // 节沟、口须与短小爬行足（浅肉粉褐）
      creaseDark:   '#8f726e',
      creaseMid:    '#c9a69f',
      creaseHi:     '#ebd2cb',
      // 主拼装白骨（弯曲肋骨、小兽颅骨、骨渣主色）
      boneDark:     '#968d7d',
      boneMid:      '#d9d0bd',
      boneHi:       '#f7f2e4',
      // 次级陈旧骨片（带刺鱼脊骨、下颌、肩胛骨，增强拼搭对比）
      boneAltDark:  '#787061',
      boneAltMid:   '#b5ab96',
      boneAltHi:    '#e0d7c3',
      // 断角与深色骨质（螺旋转角、獠牙根、碎甲片）
      hornDark:     '#473d34',
      hornMid:      '#7d6d5c',
      hornHi:       '#b8a48d',
      // 捆扎骨壳的泥丝与韧带筋膜
      bindDark:     '#2e2722',
      bindMid:      '#54473d',
      bindHi:       '#7d6b5c',
      // 壳口深腔与迷你颅骨眼眶孔
      cavityDark:   '#171418',
      // 纯黑无辜大圆眼 + 眼部白点（eyeGlint 严禁进 glowKeys）
      eyeDark:      '#0c0d12',
      eyeGlint:     '#ffffff',
      // 洞顶水滴（清澈冷青水色）
      dropDark:     '#2c6b94',
      dropMid:      '#64b3de',
      dropHi:       '#c7ecff'
    },
    glowKeys: [],
    parts: [
      'larva', 'crease', 'bone', 'boneAlt', 'horn', 'bind', 'cavity', 'eye', 'drop'
    ],
    noCrease: [
      ['larva', 'crease'], ['larva', 'eye'],
      ['bone', 'boneAlt'], ['bone', 'horn'], ['bone', 'bind'],
      ['boneAlt', 'bind'], ['horn', 'bind'], ['bone', 'cavity'], ['bind', 'cavity']
    ],
    materials: {
      larva:   ['larvaDark',   'larvaMid',   'larvaHi'],
      crease:  ['creaseDark',  'creaseMid',  'creaseHi'],
      bone:    ['boneDark',    'boneMid',    'boneHi'],
      boneAlt: ['boneAltDark', 'boneAltMid', 'boneAltHi'],
      horn:    ['hornDark',    'hornMid',    'hornHi'],
      bind:    ['bindDark',    'bindMid',    'bindHi'],
      drop:    ['dropDark',    'dropMid',    'dropHi']
    },
    protectedParts: ['eye', 'cavity']
  });

  // 4 套零重建模换色皮肤（象牙白骨 / 苔藓古骨 / 琥珀化石骨 / 炭黑深岩骨）
  const SKINS = [
    {
      id: 'ivory_bone',
      name: '象牙白骨（溶洞经典）',
      dot: '#e6decb',
      outline: '#141118',
      pal: {},
      fx: {
        boneDust: '#ede4d1',
        boneChip: '#c7baa1',
        splashHi: '#d4f2ff',
        splashMid: '#6ab8e3'
      }
    },
    {
      id: 'moss_ancient',
      name: '苔藓古骨（暗河湿岩款）',
      dot: '#7aa682',
      outline: '#0d1712',
      pal: {
        larvaDark:   '#8c9e94', larvaMid:   '#c7dbd0', larvaHi:   '#eaf5ee',
        creaseDark:  '#647d70', creaseMid:  '#98b5a4', creaseHi:  '#c8ded0',
        boneDark:    '#6e7d6c', boneMid:    '#aebfa8', boneHi:    '#dce8d5',
        boneAltDark: '#4f6351', boneAltMid: '#7f997e', boneAltHi: '#b4ccb0',
        hornDark:    '#2c4232', hornMid:    '#4e7356', hornHi:    '#82ab87',
        bindDark:    '#1d3324', bindMid:    '#385c40', bindHi:    '#5e8a62',
        cavityDark:  '#101a15',
        dropDark:    '#1f6e78', dropMid:    '#4bbcc4', dropHi:    '#bdf7f5'
      },
      fx: {
        boneDust: '#cbe0c5',
        boneChip: '#799978',
        splashHi: '#c4faf7',
        splashMid: '#4ec2c9'
      }
    },
    {
      id: 'amber_fossil',
      name: '琥珀化石骨（矿脉款）',
      dot: '#d99848',
      outline: '#1f1208',
      pal: {
        larvaDark:   '#ad8e6f', larvaMid:   '#e3c7a6', larvaHi:   '#faead4',
        creaseDark:  '#8f603e', creaseMid:  '#c98d5f', creaseHi:  '#edc098',
        boneDark:    '#9c682b', boneMid:    '#d99d4a', boneHi:    '#f7cf86',
        boneAltDark: '#7a491c', boneAltMid: '#b57433', boneAltHi: '#e3a862',
        hornDark:    '#542a12', hornMid:    '#8f4b21', hornHi:    '#cc7d43',
        bindDark:    '#3b2012', bindMid:    '#693b21', bindHi:    '#965c38',
        cavityDark:  '#1c100a',
        dropDark:    '#4f788c', dropMid:    '#88b7cc', dropHi:    '#d9f2fa'
      },
      fx: {
        boneDust: '#f5cf89',
        boneChip: '#c9853c',
        splashHi: '#e0f4fa',
        splashMid: '#8ec0d4'
      }
    },
    {
      id: 'charcoal_rock',
      name: '炭黑深岩骨（玄武洞款）',
      dot: '#5c6373',
      outline: '#090b10',
      pal: {
        larvaDark:   '#8b929e', larvaMid:   '#c4ccd9', larvaHi:   '#e8eef7',
        creaseDark:  '#666c7a', creaseMid:  '#98a0b0', creaseHi:  '#c7cedb',
        boneDark:    '#3d424d', boneMid:    '#687080', boneHi:    '#9da6b8',
        boneAltDark: '#2b2f38', boneAltMid: '#4d5463', boneAltHi: '#7b8496',
        hornDark:    '#1f2229', hornMid:    '#3b414f', hornHi:    '#646d80',
        bindDark:    '#17191f', bindMid:    '#2e323d', bindHi:    '#4b5161',
        cavityDark:  '#0b0c10',
        dropDark:    '#325e8c', dropMid:    '#6ca3db', dropHi:    '#cce6ff'
      },
      fx: {
        boneDust: '#a8b1c4',
        boneChip: '#61697a',
        splashHi: '#d4ebff',
        splashMid: '#70a8e0'
      }
    }
  ];

  // 3 套拼装骨壳变体清单
  const SHELL_VARIANTS = [
    { key: 'shell0', name: '肋骨兽颅壳' },
    { key: 'shell1', name: '鱼脊断角壳' },
    { key: 'shell2', name: '双牙颌骨壳' }
  ];

  // 3 种洞底散落骨渣清单
  const SCRAP_TYPES = [
    { key: 'scrap_knuckle', name: '小骨节' },
    { key: 'scrap_fang',    name: '弯断牙' },
    { key: 'scrap_plate',   name: '碎甲片' }
  ];

  // =========================================================================
  // 1. 柔软苍白软体前身躯节（3 档无损烘焙：retract / normal / stretch）
  //    尺寸 14×18×10，前胸饱满分节，带浅色节沟，零小数拉伸
  // =========================================================================
  function buildLarvaBody(makeCanvas, stage) {
    const isStretch = stage === 'stretch';
    const isRetract = stage === 'retract';
    const W = 14, D = 18, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 3 节肥嫩软体环（从后向前逐节微微收小，蠕动时沿 Y 轴舒展或聚拢）
    const segs = isStretch
      ? [
          { y: -4.6, rx: 4.1, ry: 3.1, rz: 3.2, z: 3.5 },
          { y: -0.4, rx: 3.8, ry: 3.1, rz: 3.1, z: 3.4 },
          { y:  3.8, rx: 3.4, ry: 2.9, rz: 2.9, z: 3.3 }
        ]
      : isRetract
        ? [
            { y: -3.2, rx: 4.7, ry: 2.8, rz: 3.7, z: 3.8 },
            { y: -0.2, rx: 4.5, ry: 2.7, rz: 3.6, z: 3.8 },
            { y:  2.6, rx: 4.0, ry: 2.6, rz: 3.3, z: 3.6 }
          ]
        : [
            { y: -4.0, rx: 4.4, ry: 3.0, rz: 3.5, z: 3.6 },
            { y: -0.4, rx: 4.1, ry: 2.9, rz: 3.4, z: 3.5 },
            { y:  3.0, rx: 3.7, ry: 2.8, rz: 3.1, z: 3.4 }
          ];

    for (let si = 0; si < segs.length; si++) {
      const s = segs[si];
      m.paintEllipsoid(0, s.y, s.z, s.rx, s.ry, s.rz, mat('larva'), partId.larva, true);
    }

    // 软体环衔接处的淡粉节沟环，强化软体幼虫的肥胖蠕动层次
    const grooveYs = isStretch ? [-2.5, 1.7] : (isRetract ? [-1.7, 1.2] : [-2.2, 1.3]);
    for (const gy of grooveYs) {
      m.paintEllipsoid(0, gy, 3.5, 3.6, 0.72, 3.0, mat('crease'), partId.crease, true);
    }

    // 腹部贴地微扁肉垫
    m.paintEllipsoid(0, -0.5, 1.5, 3.3, isStretch ? 6.2 : 4.8, 1.2, mat('crease'), partId.crease, false);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.2, headZ: 8, centerZ: 4 });
  }

  // =========================================================================
  // 2. 独立幼虫圆头（normal 摸索 / carry 抱骨补壳，12×14×10）
  //    枢轴锁在后颈 (0, -2.0)，含两对细小摸索口须 + 一对纯黑无辜大圆眼
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -2.0 };
  function buildLarvaHead(makeCanvas, pose) {
    const isCarry = pose === 'carry';
    const W = 12, D = 14, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 圆润柔软小圆头（略带饱满脸颊与微扁吻部）
    m.paintEllipsoid(0, -0.8, 4.1, 3.6, 3.4, 3.2, mat('larva'), partId.larva, true);
    m.paintEllipsoid(0,  1.0, 3.7, 3.2, 2.7, 2.7, mat('larva'), partId.larva, true);
    // 下颌软垫
    m.paintEllipsoid(0,  1.2, 2.1, 2.4, 2.0, 1.1, mat('crease'), partId.crease, true);

    // 两对细小摸索口须（外侧较长、内侧较短；carry 态向前合拢轻轻抱住小骨渣）
    for (const s of [-1, 1]) {
      if (isCarry) {
        // 合拢向前抱持姿态
        m.paintCapsule(s * 2.1, 2.6, 2.9, s * 1.4, 5.4, 3.4, 0.72, 0.52, mat('crease'), partId.crease, true);
        m.paintCapsule(s * 1.0, 3.0, 2.3, s * 0.7, 5.0, 2.5, 0.62, 0.48, mat('crease'), partId.crease, true);
      } else {
        // 外张微弯摸索姿态
        m.paintCapsule(s * 2.2, 2.4, 2.9, s * 3.8, 4.8, 2.2, 0.72, 0.50, mat('crease'), partId.crease, true);
        m.paintCapsule(s * 1.1, 2.9, 2.4, s * 1.8, 5.1, 1.8, 0.62, 0.46, mat('crease'), partId.crease, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);

    // 一对纯黑无辜大圆眼（2×2 清晰黑眼 + 右上 1px 白点，双层厚防旋转断裂，绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 3.0);
    const eyeZ = 4;
    for (const s of [-1, 1]) {
      const cols = s < 0
        ? [Math.round(hw - 2.4), Math.round(hw - 1.4)]
        : [Math.round(hw + 1.4), Math.round(hw + 2.4)];
      for (let ci = 0; ci < 2; ci++) {
        const ex = cols[ci];
        for (let dz = 0; dz <= 1; dz++) {
          const isGlint = (dz === 1 && ci === 1);
          const colId = isGlint ? keyToId.eyeGlint : keyToId.eyeDark;
          m.setRaw(ex, eyeY,     eyeZ + dz, colId, partId.eye);
          m.setRaw(ex, eyeY - 1, eyeZ + dz, keyToId.eyeDark, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: 9, centerZ: 4 });
  }

  // =========================================================================
  // 3. 前胸短小爬行足（5×5×5，6 只足共享同一立体部件，省图集且左右对称）
  // =========================================================================
  function buildLarvaLeg(makeCanvas) {
    const m = new VoxelModel(5, 5, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 3.2, 0, 0.6, 1.0, 1.05, 0.72, mat('crease'), partId.crease, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.4, headZ: 4, centerZ: 2 });
  }

  // =========================================================================
  // 4. 锥形“拼装骨壳”基础腔体辅助 + 3 套随机拼装骨壳变体（24×26×22，小体型精制基准）
  //    壳体朝 +Y 开口、朝 -Y 逐渐收尖并微微上翘，壳口内部保留清晰暗腔，缩壳零穿模
  // =========================================================================
  function carveBaseConicalShell(m) {
    const { mat, partId, keyToId } = SPEC;
    // 沿 Y 从前端开口 (Y=+7.2) 到尾尖 (Y=-9.8) 搭建略微上翘的锥形捆扎骨筒
    m.fillAABB(-9.5, 9.5, -10.5, 8.0, 1, 18, (x, y, z, X, Y) => {
      // u=0 在前端开口 (+7.2)，u=1 在后端锥尖 (-9.8)
      const u = clamp((7.2 - Y) / 17.0, 0, 1);
      if (Y > 7.4 || Y < -10.2) return;
      // 锥形筒轴线微微上翘，前低后高
      const axisZ = 6.2 + u * 5.4;
      const radX = lerp(7.1, 1.5, Math.pow(u, 0.88));
      const radZ = lerp(6.3, 1.5, Math.pow(u, 0.88));
      const d = Math.hypot(X / radX, (z - axisZ) / radZ);

      // 外壳厚壁（0.62 <= d <= 1.02），底部略微平贴地面
      if (d <= 1.0 && z >= 1.2) {
        // 前端开口挖出真实内腔，使缩壳时清晰可见深暗缝隙
        if (Y > 1.0 && d < 0.66) {
          if (Y < 3.6 && d < 0.58) {
            m.setRaw(x, y, z, keyToId.cavityDark, partId.cavity);
          }
          return;
        }
        // 基础壳体为泥丝/韧带筋膜与斑驳碎骨底衬
        const ribBand = Math.sin(Y * 1.35 + Math.abs(X) * 0.35);
        if (ribBand > 0.45 && d > 0.78) {
          m.setRaw(x, y, z, mat('boneAlt'), partId.boneAlt);
        } else {
          m.setRaw(x, y, z, mat('bind'), partId.bind);
        }
      }
    });
  }

  // 变体 0：肋骨兽颅壳（弯曲白肋骨笼 + 顶扣半片迷你小兽颅骨 + 后插尾椎骨节）
  function buildShellVariant0(makeCanvas) {
    const m = new VoxelModel(24, 26, 22, SPEC);
    const { mat, partId, keyToId } = SPEC;
    carveBaseConicalShell(m);

    // 1. 两侧 3 对弯曲白肋骨（弧形抱紧锥形骨壳，层次立体分明）
    const ribConfigs = [
      { y:  4.6, rX: 7.4, zBot: 3.0, zTop: 12.6 },
      { y:  0.6, rX: 6.5, zBot: 4.0, zTop: 13.4 },
      { y: -3.4, rX: 5.2, zBot: 5.4, zTop: 13.6 }
    ];
    for (const rc of ribConfigs) {
      for (const s of [-1, 1]) {
        m.paintCapsule(s * (rc.rX * 0.78), rc.y, rc.zBot, s * rc.rX, rc.y - 0.5, (rc.zBot + rc.zTop) * 0.52, 1.05, 1.15, mat('bone'), partId.bone, true);
        m.paintCapsule(s * rc.rX, rc.y - 0.5, (rc.zBot + rc.zTop) * 0.52, s * 2.2, rc.y - 1.1, rc.zTop, 1.12, 0.92, mat('bone'), partId.bone, true);
      }
    }

    // 2. 顶部前斜扣着半片迷你小兽颅骨（脑壳圆穹 + 前突吻梁 + 双眼眶暗孔 + 锯齿牙缘）
    m.paintEllipsoid(0.6, 2.2, 14.5, 4.0, 4.4, 3.2, mat('bone'), partId.bone, true);
    m.paintEllipsoid(0.6, 6.2, 13.2, 2.4, 2.8, 2.1, mat('bone'), partId.bone, true);
    // 迷你颅骨深暗眼眶孔与鼻孔
    m.paintEllipsoid(-1.7, 4.4, 14.6, 1.25, 1.35, 1.25, keyToId.cavityDark, partId.cavity, true);
    m.paintEllipsoid( 2.9, 4.2, 14.6, 1.25, 1.35, 1.25, keyToId.cavityDark, partId.cavity, true);
    m.paintEllipsoid( 0.6, 8.2, 13.4, 0.9,  0.8,  0.8,  keyToId.cavityDark, partId.cavity, true);
    // 小兽上颌门齿点缀
    for (const tx of [-0.6, 0.6, 1.8]) {
      m.paintEllipsoid(tx, 7.2, 11.4, 0.55, 0.65, 0.85, mat('bone'), partId.bone, true);
    }

    // 3. 右后侧斜插一小截断角 + 尾尖一串翘起的带刺尾椎骨
    m.paintCapsule(3.4, -4.6, 10.2, 7.6, -7.2, 15.8, 1.35, 0.58, mat('horn'), partId.horn, true);
    for (let vi = 0; vi < 3; vi++) {
      const vy = -6.8 - vi * 1.9;
      const vz = 11.2 + vi * 1.3;
      m.paintEllipsoid(0, vy, vz, 1.5 - vi * 0.25, 1.1, 1.4 - vi * 0.2, mat('boneAlt'), partId.boneAlt, true);
      m.paintCapsule(0, vy, vz + 0.8, 0, vy - 0.8, vz + 3.0 - vi * 0.3, 0.65, 0.42, mat('bone'), partId.bone, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.2, headZ: 18, centerZ: 9 });
  }

  // 变体 1：鱼脊断角壳（背脊纵贯带刺鱼脊骨 + 左侧粗大螺旋断角 + 右侧裂纹骨板与错落肋骨）
  function buildShellVariant1(makeCanvas) {
    const m = new VoxelModel(24, 26, 22, SPEC);
    const { mat, partId } = SPEC;
    carveBaseConicalShell(m);

    // 1. 纵贯背脊的一整条带刺鱼脊骨（主脊柱 + 6 根斜向后翘的尖鱼骨刺）
    m.paintCapsule(0, 6.4, 12.2, 0, -9.2, 14.2, 1.35, 0.95, mat('bone'), partId.bone, true);
    for (let i = 0; i < 6; i++) {
      const sy = 5.4 - i * 2.7;
      const sz = 12.5 + i * 0.35;
      const spineH = 3.8 - Math.abs(i - 2) * 0.38;
      // 背棘刺
      m.paintCapsule(0, sy, sz, 0, sy - 1.5, sz + spineH, 0.82, 0.42, mat('bone'), partId.bone, true);
      // 鱼刺侧肋（交替微错位，呈现杂乱拼搭感）
      const sideX = (i % 2 === 0 ? 1 : -1) * (6.2 - i * 0.65);
      m.paintCapsule(0, sy, sz - 0.5, sideX, sy - 0.4, sz - 4.4, 0.78, 0.62, mat('boneAlt'), partId.boneAlt, true);
    }

    // 2. 左侧粗壮弯曲断角（双段折弧，辨识度极高）
    m.paintCapsule(-4.6, 2.8, 8.6, -8.4, 0.4, 12.8, 1.85, 1.28, mat('horn'), partId.horn, true);
    m.paintCapsule(-8.4, 0.4, 12.8, -6.8, -2.8, 17.6, 1.25, 0.55, mat('horn'), partId.horn, true);

    // 3. 右侧拼贴大块斜肩胛骨板 + 2 根突出白肋骨
    m.paintEllipsoid(5.6, 0.8, 8.2, 2.2, 4.4, 3.8, mat('boneAlt'), partId.boneAlt, true);
    m.paintCapsule(5.8, 5.2, 3.6, 6.8, 4.4, 10.6, 1.05, 0.95, mat('bone'), partId.bone, true);
    m.paintCapsule(4.6, -3.6, 5.2, 6.0, -4.4, 11.4, 0.95, 0.82, mat('bone'), partId.bone, true);

    // 4. 壳口前沿加一圈小碎骨齿
    for (const fx of [-4.2, -1.8, 1.8, 4.2]) {
      m.paintEllipsoid(fx, 7.0, 9.6 - Math.abs(fx) * 0.45, 0.85, 0.95, 0.85, mat('bone'), partId.bone, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.4, headZ: 19, centerZ: 9 });
  }

  // 变体 2：双牙颌骨壳（壳口前沿不对称双弯牙门楣 + 中段斜拼半片兽颌骨 + 交叉肋骨笼）
  function buildShellVariant2(makeCanvas) {
    const m = new VoxelModel(24, 26, 22, SPEC);
    const { mat, partId } = SPEC;
    carveBaseConicalShell(m);

    // 1. 壳口门楣：左右两根不对称弯曲獠牙/断角朝前上方微翘
    m.paintCapsule(-4.8, 5.8, 8.8, -7.2, 8.6, 13.8, 1.45, 0.55, mat('bone'), partId.bone, true);
    m.paintCapsule( 4.6, 5.6, 9.4,  6.4, 7.8, 15.6, 1.55, 0.58, mat('horn'), partId.horn, true);

    // 2. 壳身顶部斜拼半片小兽下颌骨（带一排清晰白锯齿）
    m.paintCapsule(-3.6, 3.4, 13.0, 4.4, -1.6, 14.4, 1.65, 1.45, mat('boneAlt'), partId.boneAlt, true);
    for (let ti = 0; ti < 4; ti++) {
      const u = ti / 3;
      const tx = lerp(-2.6, 3.2, u);
      const ty = lerp(2.8, -0.8, u);
      const tz = lerp(14.5, 15.8, u);
      m.paintCapsule(tx, ty, tz - 0.4, tx + 0.4, ty + 0.6, tz + 1.8, 0.68, 0.42, mat('bone'), partId.bone, true);
    }

    // 3. 两侧交叉拼搭的白肋骨 + 后段迷你关节骨球
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 6.4, 2.8, 3.4, s * 4.8, -2.6, 12.2, 1.05, 0.92, mat('bone'), partId.bone, true);
      m.paintCapsule(s * 5.8, -2.8, 4.6, s * 4.2, 3.2, 12.0, 0.95, 0.85, mat('boneAlt'), partId.boneAlt, true);
    }
    // 尾尖凸出的双头骨节柄
    m.paintCapsule(0, -6.2, 10.6, -1.2, -10.2, 14.6, 1.15, 1.05, mat('bone'), partId.bone, true);
    m.paintEllipsoid(-2.2, -10.6, 15.0, 1.35, 1.25, 1.35, mat('bone'), partId.bone, true);
    m.paintEllipsoid(-0.2, -10.4, 15.4, 1.25, 1.25, 1.25, mat('bone'), partId.bone, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.4, headZ: 18, centerZ: 9 });
  }

  // =========================================================================
  // 5. 待机交互物：洞底散落 3 种立体体素零碎骨渣 + 洞顶水滴
  // =========================================================================
  // 小骨节（8×8×6）
  function buildScrapKnuckle(makeCanvas) {
    const m = new VoxelModel(8, 8, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(-2.2, -0.4, 2.4, 2.2, 0.4, 2.8, 0.92, 0.92, mat('bone'), partId.bone, true);
    m.paintEllipsoid(-2.5, -1.1, 2.5, 1.05, 1.05, 1.05, mat('bone'), partId.bone, true);
    m.paintEllipsoid(-2.5,  0.5, 2.5, 1.05, 1.05, 1.05, mat('bone'), partId.bone, true);
    m.paintEllipsoid( 2.5, -0.5, 2.9, 1.05, 1.05, 1.05, mat('bone'), partId.bone, true);
    m.paintEllipsoid( 2.5,  1.1, 2.9, 1.05, 1.05, 1.05, mat('bone'), partId.bone, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 5, centerZ: 2 });
  }

  // 弯断牙（8×8×6）
  function buildScrapFang(makeCanvas) {
    const m = new VoxelModel(8, 8, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(-2.2, -1.4, 1.8, 0.4, 0.2, 2.6, 1.35, 1.05, mat('horn'), partId.horn, true);
    m.paintCapsule( 0.4,  0.2, 2.6, 2.6, 1.8, 4.2, 1.02, 0.48, mat('bone'), partId.bone, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 5, centerZ: 2 });
  }

  // 碎甲片/带孔骨片（8×8×5）
  function buildScrapPlate(makeCanvas) {
    const m = new VoxelModel(8, 8, 5, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-3.2, 3.2, -3.2, 3.2, 1, 3, (x, y, z, X, Y) => {
      const d = Math.hypot(X / 3.0, Y / 2.5);
      if (d <= 1.0 && Math.hypot(X - 0.8, Y + 0.5) > 0.85) {
        const isEdge = d > 0.72;
        m.setRaw(x, y, z, mat(isEdge ? 'bone' : 'boneAlt'), isEdge ? partId.bone : partId.boneAlt);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 4, centerZ: 2 });
  }

  // 洞顶水滴（6×6×9，四重对称 symDeg=90）
  function buildWaterDrop(makeCanvas) {
    const m = new VoxelModel(6, 6, 9, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 2.8, 2.1, 2.1, 2.3, mat('drop'), partId.drop, true);
    m.paintCapsule(0, 0, 3.6, 0, 0, 7.6, 1.55, 0.48, mat('drop'), partId.drop, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 8, centerZ: 4 });
  }

  // 前胸 3 对短小爬行足相对幼虫前身的锚点布局
  const LEG_LAYOUT = [
    { side: -1, lx: -3.5, ly:  3.0, phase: 0.0 },
    { side:  1, lx:  3.5, ly:  3.0, phase: Math.PI },
    { side: -1, lx: -3.8, ly:  0.6, phase: Math.PI * 0.65 },
    { side:  1, lx:  3.8, ly:  0.6, phase: Math.PI * 1.65 },
    { side: -1, lx: -3.9, ly: -1.8, phase: Math.PI * 1.3 },
    { side:  1, lx:  3.9, ly: -1.8, phase: Math.PI * 0.3 }
  ];

  // =========================================================================
  // 洞4 · 拼骨幼虫 Def
  // =========================================================================
  const Cave4Def = {
    id: 'cave4_tupilak',
    code: '洞4',
    status: 'done',
    name: '洞4 · 拼骨幼虫',
    tag: '拼装骨壳 · 拾骨缩壳',
    summary: 'v3 精制：苍白肥胖软体幼虫 + 3 套杂乱兽骨拼装骨壳变体 + 3 对短小爬行足与摸索口须 + 洞底拾骨补壳与洞顶滴水惊吓缩壳双循环',
    defaultHabitat: 'cave',
    footRadius: 9.2,
    ecoWeight: 0.55,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '3 档软体蠕动伸缩',
      '3 套随机拼装骨壳',
      '二阶弹簧骨壳滞后倾晃',
      '洞底拾骨渣蹭贴补壳',
      '洞顶滴水惊吓缩壳探头'
    ],
    soulHabit: '慢吞吞蠕动爬向洞底零碎骨渣，用口须抱起往骨壳边缘蹭贴修补；一旦洞顶水滴砸在身旁，瞬间整只缩进骨壳发抖，片刻后探出半个脑袋左右张望再爬',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        bodyRetract:   buildLarvaBody(makeCanvas, 'retract'),
        bodyNormal:    buildLarvaBody(makeCanvas, 'normal'),
        bodyStretch:   buildLarvaBody(makeCanvas, 'stretch'),
        headNormal:    buildLarvaHead(makeCanvas, 'normal'),
        headCarry:     buildLarvaHead(makeCanvas, 'carry'),
        larvaLeg:      buildLarvaLeg(makeCanvas),
        shell0:        buildShellVariant0(makeCanvas),
        shell1:        buildShellVariant1(makeCanvas),
        shell2:        buildShellVariant2(makeCanvas),
        scrap_knuckle: buildScrapKnuckle(makeCanvas),
        scrap_fang:    buildScrapFang(makeCanvas),
        scrap_plate:   buildScrapPlate(makeCanvas),
        water_drop:    buildWaterDrop(makeCanvas)
      };

      const shellLagPos   = new SpringDamper3D(opts.homeX ?? 0, opts.homeY ?? 0, 1.4, 96, 8.2);
      const shellYawLag   = new SpringDamper1D(0, 74, 6.4);
      const shellBounce   = new SpringDamper1D(0, 118, 7.6);
      const headYawSpring = new SpringDamper1D(0, 88, 7.2);
      const hideSpring    = new SpringDamper1D(0, 82, 7.8); // 0=完全伸出，1=整只缩进骨壳

      const initShellIdx = typeof opts.shellIdx === 'number'
        ? ((opts.shellIdx % SHELL_VARIANTS.length) + SHELL_VARIANTS.length) % SHELL_VARIANTS.length
        : Math.floor(Math.random() * SHELL_VARIANTS.length);

      // 3 块散落洞底的立体体素零碎骨渣
      const scraps = SCRAP_TYPES.map((st, i) => ({
        idx: i,
        partKey: st.key,
        name: st.name,
        x: 0, y: 0, z: 0,
        yaw: i * 1.9 + 0.4,
        mode: 'ground', // 'ground' | 'carried' | 'consumed' | 'spawning'
        timer: 0,
        dropStartZ: 18
      }));

      // 洞顶滴水对象
      const droplet = {
        active: false,
        x: 0, y: 0, z: 42,
        vz: 0,
        cooldown: 6.2 + Math.random() * 2.4
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        vx: 0, vy: 0,
        yaw: opts.homeYaw ?? 0,
        crawlPhase: 0,
        bodyMorph: 'normal',
        headPose: 'normal',
        shellIdx: initShellIdx,
        shellTimer: 0,
        shellSwitchInterval: opts.shellSwitchInterval ?? 11.5,
        // 完整生态交互状态机：
        // seek(蠕动寻骨) -> pickup(口须抱起) -> patch(往壳缘蹭贴修补)
        // 随时可被洞顶滴水打断 -> hide(缩壳发抖) -> peek(探出半个脑袋左右张望) -> emerge(伸出恢复)
        stage: 'seek',
        stageTimer: 0,
        targetScrapIdx: 0,
        patchImpulsed: false,
        shiverAmp: 0,
        crawlStepAcc: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function placeScrapNear(sc, cx, cy, isIdle, sMul, idxSeed) {
        const ang = wrapAngle((idxSeed * 2.12) + Math.random() * 1.15);
        const minR = isIdle ? 11.5 : 15.0;
        const maxR = isIdle ? 17.5 : 30.0;
        const r = lerp(minR, maxR, Math.random()) * sMul;
        let nx = cx + Math.cos(ang) * r;
        let ny = cy + Math.sin(ang) * r;
        const dMax = isIdle ? 32 * sMul : 42 * sMul;
        const dNow = Math.hypot(nx, ny);
        if (dNow > dMax) { nx *= dMax / dNow; ny *= dMax / dNow; }
        sc.x = nx; sc.y = ny; sc.z = 0;
        sc.yaw = Math.random() * TAU;
        sc.mode = 'ground';
        sc.timer = 0;
      }

      function spawnBoneDust(vfx, wx, wy, wz, count, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU + Math.random() * 0.5;
          const spd = (5 + Math.random() * 9) * sMul;
          vfx.spawnParticle(
            wx + Math.cos(a) * 2.2 * sMul,
            wy + Math.sin(a) * 2.2 * sMul,
            wz,
            Math.cos(a) * spd, Math.sin(a) * spd, (6 + Math.random() * 8) * sMul,
            0.38 + Math.random() * 0.22, 1.2 + Math.random() * 0.5,
            i % 2 === 0 ? fx.boneDust : fx.boneChip, false, 36
          );
        }
      }

      function spawnDropSplash(vfx, wx, wy, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        vfx.addRipple(wx, wy, 2.2 * sMul, 16.5 * sMul, 0.68, 1.6);
        for (let i = 0; i < 9; i++) {
          const a = (i / 9) * TAU + Math.random() * 0.4;
          const spd = (8 + Math.random() * 14) * sMul;
          vfx.spawnParticle(
            wx, wy, 1.2 * sMul,
            Math.cos(a) * spd, Math.sin(a) * spd, (10 + Math.random() * 12) * sMul,
            0.36 + Math.random() * 0.20, 1.25 + Math.random() * 0.45,
            i % 2 === 0 ? fx.splashHi : fx.splashMid, false, 48
          );
        }
      }

      function pickNearestScrap() {
        let best = -1, bestD = 1e9;
        for (let i = 0; i < scraps.length; i++) {
          if (scraps[i].mode !== 'ground') continue;
          const d = Math.hypot(scraps[i].x - state.x, scraps[i].y - state.y);
          if (d < bestD) { bestD = d; best = i; }
        }
        return best;
      }

      const instance = {
        def: Cave4Def,
        cachePrefix: `cave4_tp_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX; state.y = homeY; state.z = 0;
          state.vx = 0; state.vy = 0;
          state.yaw = homeYaw;
          state.crawlPhase = 0;
          state.bodyMorph = 'normal';
          state.headPose = 'normal';
          state.stage = 'seek';
          state.stageTimer = 0;
          state.patchImpulsed = false;
          state.shiverAmp = 0;
          state.shellIdx = (state.shellIdx + 1) % SHELL_VARIANTS.length;
          state.shellTimer = 0;

          const [sx, sy] = localToWorldXY(homeX, homeY, homeYaw, 0, -4.2);
          shellLagPos.reset(sx, sy, 1.4);
          shellYawLag.x = 0; shellYawLag.v = 0;
          shellBounce.x = 0; shellBounce.v = 0;
          headYawSpring.x = 0; headYawSpring.v = 0;
          hideSpring.x = 0; hideSpring.v = 0;

          droplet.active = false;
          droplet.cooldown = 5.5 + Math.random() * 2.0;

          for (let i = 0; i < scraps.length; i++) {
            placeScrapNear(scraps[i], homeX, homeY, true, 1.0, i);
          }
          state.targetScrapIdx = pickNearestScrap();
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const speedMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          // 同时兼容 eco.action === 'idle' 与 eco.patrol === false 判定原地待机
          const isIdle = !eco || eco.action === 'idle' || eco.patrol === false;
          const patrol = !isIdle;
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const maxR = (eco && eco.maxRadius) ?? 44;

          // 工坊演示：每间隔一段时间安全轮换 3 套随机拼装骨壳变体，方便观察全部 3 款造型
          if (state.shellSwitchInterval > 0 && state.stage === 'seek') {
            state.shellTimer += dt;
            if (state.shellTimer >= state.shellSwitchInterval) {
              state.shellTimer -= state.shellSwitchInterval;
              state.shellIdx = (state.shellIdx + 1) % SHELL_VARIANTS.length;
              shellBounce.impulse(16.0 * sp);
              shellYawLag.impulse((Math.random() > 0.5 ? 1 : -1) * 3.8 * sp);
              spawnBoneDust(vfx, shellLagPos.x, shellLagPos.y, 9.0 * sMul, 6, sMul);
            }
          }

          // -----------------------------------------------------------------
          // 1. 洞顶滴水惊吓触发器（每隔数秒一颗立体水滴从高空砸落身旁）
          // -----------------------------------------------------------------
          if (!droplet.active) {
            // 正在缩壳或探头时暂停冷却，避免连续惊吓
            if (state.stage !== 'hide' && state.stage !== 'peek' && state.stage !== 'emerge') {
              droplet.cooldown -= dt;
              if (droplet.cooldown <= 0 && state.stage !== 'patch') {
                droplet.active = true;
                // 落在幼虫侧前方 8~11 格，既有惊吓感又绝不与躯体穿模
                const side = Math.random() > 0.5 ? 1 : -1;
                const [dxW, dyW] = localToWorldXY(state.x, state.y, state.yaw, side * (7.5 + Math.random() * 2.5) * sMul, (6.0 + Math.random() * 3.5) * sMul);
                droplet.x = dxW;
                droplet.y = dyW;
                droplet.z = 44.0 * sMul;
                droplet.vz = -18.0 * sMul;
              }
            }
          } else {
            droplet.vz -= 78.0 * sMul * dt;
            droplet.z += droplet.vz * dt;
            if (droplet.z <= 0.5) {
              droplet.active = false;
              droplet.cooldown = clamp((8.2 + Math.random() * 3.2) / (0.6 + freq * 0.4), 5.2, 13.5);
              spawnDropSplash(vfx, droplet.x, droplet.y, sMul);
              // 如果正在抱骨渣，受惊松口让骨渣掉回原地
              if (state.targetScrapIdx >= 0 && scraps[state.targetScrapIdx].mode === 'carried') {
                const sc = scraps[state.targetScrapIdx];
                sc.mode = 'ground';
                sc.z = 0;
              }
              // 瞬间受惊缩进骨壳
              state.stage = 'hide';
              state.stageTimer = 1.85;
              state.headPose = 'normal';
              state.shiverAmp = 1.0;
              shellBounce.impulse(-22.0 * sp);
              shellYawLag.impulse((Math.random() > 0.5 ? 1 : -1) * 6.5 * sp);
            }
          }

          // -----------------------------------------------------------------
          // 2. 生态状态机与软体蠕动伸缩推进
          // -----------------------------------------------------------------
          let targetHide = 0;       // 0=伸出, 0.52=探出半头, 1.0=完全缩壳
          let targetHeadYaw = Math.sin(time * 1.45) * 0.16;
          let moveIntent = 0;

          if (state.stage === 'hide') {
            state.stageTimer -= dt;
            targetHide = 1.0;
            state.shiverAmp = clamp(state.stageTimer / 1.85, 0.25, 1.0);
            state.vx *= 0.80;
            state.vy *= 0.80;
            if (state.stageTimer <= 0) {
              state.stage = 'peek';
              state.stageTimer = 1.65;
              state.shiverAmp = 0;
            }
          } else if (state.stage === 'peek') {
            state.stageTimer -= dt;
            targetHide = 0.48; // 小心翼翼探出半个脑袋
            // 左看 -> 停顿 -> 右看，确认安全
            const u = 1.0 - clamp(state.stageTimer / 1.65, 0, 1);
            if (u < 0.35) targetHeadYaw = -0.62 * smoothstep(0, 0.35, u);
            else if (u < 0.72) targetHeadYaw = lerp(-0.62, 0.62, smoothstep(0.35, 0.72, u));
            else targetHeadYaw = lerp(0.62, 0, smoothstep(0.72, 1.0, u));
            state.vx *= 0.82;
            state.vy *= 0.82;
            if (state.stageTimer <= 0) {
              state.stage = 'emerge';
              state.stageTimer = 0.52;
              shellBounce.impulse(10.0 * sp);
            }
          } else if (state.stage === 'emerge') {
            state.stageTimer -= dt;
            targetHide = 0.0;
            state.vx *= 0.85;
            state.vy *= 0.85;
            if (state.stageTimer <= 0) {
              state.stage = 'seek';
              state.targetScrapIdx = pickNearestScrap();
            }
          } else if (state.stage === 'seek') {
            state.headPose = 'normal';
            if (state.targetScrapIdx < 0 || scraps[state.targetScrapIdx].mode !== 'ground') {
              state.targetScrapIdx = pickNearestScrap();
            }
            const tsp = state.targetScrapIdx >= 0 ? scraps[state.targetScrapIdx] : null;

            // 原地待机模式下，若骨渣全跑太远则确保离家不远
            if (tsp) {
              const dx = tsp.x - state.x;
              const dy = tsp.y - state.y;
              const dist = Math.hypot(dx, dy);
              const desiredYaw = Math.atan2(-dx, dy);
              const yawDiff = wrapAngle(desiredYaw - state.yaw);
              const maxTurn = (isIdle ? 2.4 : 2.8) * (0.65 + speedMul * 0.4);
              state.yaw = wrapAngle(state.yaw + clamp(yawDiff, -maxTurn * dt, maxTurn * dt));

              // 保持约 9.2 格安全接触距（口须刚好探到骨渣而不穿模）
              const reachDist = 9.2 * sMul;
              if (dist > reachDist) {
                moveIntent = 1.0;
                const align = clamp(Math.cos(yawDiff), 0.12, 1.0);
                // 软体蠕动波：前伸蓄力 -> 收缩前拉的脉冲节奏
                state.crawlPhase = (state.crawlPhase + dt * 4.4 * freq * (0.7 + speedMul * 0.35)) % TAU;
                const wave = Math.sin(state.crawlPhase);
                const pulseMove = Math.pow(Math.max(0, Math.sin(state.crawlPhase - 0.55)), 1.6);
                const baseSpd = (isIdle ? 7.8 : 11.8) * speedMul;
                const spd = baseSpd * (0.32 + pulseMove * 1.18) * align;

                const fwdX = -Math.sin(state.yaw);
                const fwdY =  Math.cos(state.yaw);
                const avoidX = patrol ? ((eco && eco.avoidX) || 0) * 0.35 : 0;
                const avoidY = patrol ? ((eco && eco.avoidY) || 0) * 0.35 : 0;

                const kVel = expSmooth(dt, 6.2);
                state.vx = lerp(state.vx, fwdX * spd + avoidX, kVel);
                state.vy = lerp(state.vy, fwdY * spd + avoidY, kVel);
                state.x += state.vx * dt;
                state.y += state.vy * dt;

                // 活动边界约束（原地待机围绕 homeX/homeY 柔和限幅）
                if (isIdle) {
                  const hdx = state.x - homeX, hdy = state.y - homeY;
                  const hd = Math.hypot(hdx, hdy);
                  const idleCap = 14.0 * sMul;
                  if (hd > idleCap) {
                    state.x = homeX + (hdx / hd) * idleCap;
                    state.y = homeY + (hdy / hd) * idleCap;
                  }
                } else {
                  const curD = Math.hypot(state.x, state.y);
                  if (curD > maxR) {
                    state.x *= maxR / curD;
                    state.y *= maxR / curD;
                  }
                }

                // 3 档无损体素形态切换表达蠕动伸缩
                if (wave > 0.42) state.bodyMorph = 'stretch';
                else if (wave < -0.42) state.bodyMorph = 'retract';
                else state.bodyMorph = 'normal';

                targetHeadYaw = clamp(yawDiff, -0.42, 0.42) + Math.sin(state.crawlPhase) * 0.08;
              } else {
                // 到达骨渣旁，准备用口须轻轻抱起
                state.stage = 'pickup';
                state.stageTimer = 0.68;
                state.headPose = 'carry';
                state.bodyMorph = 'normal';
                tsp.mode = 'carried';
                state.vx *= 0.4;
                state.vy *= 0.4;
              }
            } else {
              state.vx *= 0.85;
              state.vy *= 0.85;
              state.bodyMorph = 'normal';
            }
          } else if (state.stage === 'pickup') {
            state.stageTimer -= dt;
            state.vx *= 0.82;
            state.vy *= 0.82;
            state.bodyMorph = 'stretch';
            state.headPose = 'carry';
            targetHeadYaw = Math.sin(time * 5.0) * 0.14;
            if (state.stageTimer <= 0) {
              state.stage = 'patch';
              state.stageTimer = 0.82;
              state.patchImpulsed = false;
            }
          } else if (state.stage === 'patch') {
            state.stageTimer -= dt;
            state.vx *= 0.82;
            state.vy *= 0.82;
            state.bodyMorph = 'retract';
            state.headPose = 'carry';
            // 侧仰脑袋往背壳前缘蹭贴修补
            targetHeadYaw = 0.45 * Math.sin((1 - state.stageTimer / 0.82) * Math.PI);
            const tsp = state.targetScrapIdx >= 0 ? scraps[state.targetScrapIdx] : null;
            if (!state.patchImpulsed && state.stageTimer <= 0.36) {
              state.patchImpulsed = true;
              // 骨壳发出咔哒二阶弹簧晃动 + 骨屑微粒
              shellBounce.impulse(19.0 * sp);
              shellYawLag.impulse(5.2 * sp * flex);
              spawnBoneDust(vfx, shellLagPos.x, shellLagPos.y, 8.5 * sMul, 7, sMul);
              if (tsp) {
                tsp.mode = 'consumed';
                tsp.timer = 2.0 + Math.random() * 1.2;
              }
            }
            if (state.stageTimer <= 0) {
              state.stage = 'seek';
              state.headPose = 'normal';
              state.bodyMorph = 'normal';
              state.targetScrapIdx = pickNearestScrap();
            }
          }

          // -----------------------------------------------------------------
          // 3. 更新全部 3 块骨渣（抱起抬升、消耗冷却、自然落回洞底复位）
          // -----------------------------------------------------------------
          for (let i = 0; i < scraps.length; i++) {
            const sc = scraps[i];
            if (sc.mode === 'carried') {
              const uLift = state.stage === 'pickup'
                ? smoothstep(0, 1, 1 - state.stageTimer / 0.68)
                : 1.0;
              const uPatch = state.stage === 'patch'
                ? smoothstep(0, 1, 1 - state.stageTimer / 0.82)
                : 0.0;
              // 从口须前方抬起 -> 绕向骨壳前缘蹭贴
              const locX = lerp(0, 3.6, uPatch) * sMul;
              const locY = lerp(9.4, 2.2, uPatch) * sMul;
              const [cxW, cyW] = localToWorldXY(state.x, state.y, state.yaw, locX, locY);
              sc.x = lerp(sc.x, cxW, expSmooth(dt, 11));
              sc.y = lerp(sc.y, cyW, expSmooth(dt, 11));
              sc.z = lerp(0.5, 5.2, uLift) * sMul + uPatch * 3.8 * sMul;
              sc.yaw = wrapAngle(state.yaw + uPatch * 0.9);
            } else if (sc.mode === 'consumed') {
              sc.timer -= dt;
              if (sc.timer <= 0) {
                const anchorX = isIdle ? homeX : state.x;
                const anchorY = isIdle ? homeY : state.y;
                placeScrapNear(sc, anchorX, anchorY, isIdle, sMul, i + Math.floor(time));
                sc.mode = 'spawning';
                sc.timer = 0;
                sc.dropStartZ = 16.0 * sMul;
                sc.z = sc.dropStartZ;
              }
            } else if (sc.mode === 'spawning') {
              sc.timer += dt / 0.52;
              const u = clamp(sc.timer, 0, 1);
              sc.z = lerp(sc.dropStartZ, 0, u * u);
              if (u >= 1) {
                sc.mode = 'ground';
                sc.z = 0;
                if (vfx) vfx.spawnDust(sc.x, sc.y, 3, 0.45, habitat ? habitat.fx : { dustRGB: '150, 152, 168' });
              }
            }
          }

          // -----------------------------------------------------------------
          // 4. 弹簧平滑驱动：缩壳进度、头部张望、骨壳二阶弹簧滞后倾晃
          // -----------------------------------------------------------------
          const hideVal = clamp(
            hideSpring.update(dt, targetHide, 84 * sp, clamp(7.6 * dScale, 3.8, 12.5)),
            0, 1.05
          );
          headYawSpring.update(dt, targetHeadYaw, 92 * sp, clamp(7.4 * dScale, 3.4, 12.0));

          // 蠕动与缩壳带动骨壳微幅上下与前后滞后
          const crawlBob = moveIntent > 0.1 ? Math.sin(state.crawlPhase * 2.0) * 0.65 * sMul : Math.sin(time * 2.4 * freq) * 0.25 * sMul;
          const shellTgtZ = (1.6 - hideVal * 1.15) * sMul + crawlBob;
          const [sTgtX, sTgtY] = localToWorldXY(state.x, state.y, state.yaw, 0, (-4.2 + hideVal * 1.6) * sMul);
          shellLagPos.update(dt, sTgtX, sTgtY, shellTgtZ, 94 * sp, clamp(7.8 * dScale, 3.6, 12.0));

          const shellTargetYawOff = Math.sin(state.crawlPhase) * 0.08 * flex * (1 - hideVal);
          shellYawLag.update(dt, shellTargetYawOff, 76 * sp, clamp(6.0 * dScale, 2.8, 10.5));
          shellBounce.update(dt, 0, 118 * sp, clamp(7.2 * dScale, 3.2, 12.0));

          // 缩壳发抖高频微颤（纯位移，零缩放）
          state.z = 0;

          sockets.setLocal('mouth', state.x, state.y, state.z, state.yaw, 0, 8.6 * (1 - hideVal), 3.4, sMul);
          sockets.setWorld('shell', shellLagPos.x, shellLagPos.y, shellLagPos.z, wrapAngle(state.yaw + shellYawLag.x));
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const hide = clamp(hideSpring.x, 0, 1);
          const envSub = (habitat && habitat.isWater)
            ? EnvFeedback.calcSubmerge(state.z, 1.6 * sMul, 4.6 * sMul, true)
            : 0;

          // 缩壳受惊时的细微高频发抖位移（幅度极小、自然传神）
          const shiverT = state.stage === 'hide' ? state.shiverAmp : 0;
          const shivX = shiverT > 0 ? Math.sin(performance.now() * 0.055) * 0.55 * shiverT * sMul : 0;
          const shivY = shiverT > 0 ? Math.cos(performance.now() * 0.067) * 0.45 * shiverT * sMul : 0;

          // 1. 前胸 3 对短小爬行足（缩壳超过 55% 时完全收进壳内不绘制，零穿模）
          if (hide < 0.55) {
            const legTuck = smoothstep(0.0, 0.55, hide);
            const isMoving = state.stage === 'seek' && Math.hypot(state.vx, state.vy) > 1.2;
            for (let i = 0; i < LEG_LAYOUT.length; i++) {
              const lg = LEG_LAYOUT[i];
              const stepW = isMoving ? Math.sin(state.crawlPhase + lg.phase) : Math.sin(lg.phase) * 0.15;
              const liftW = isMoving ? Math.max(0, Math.cos(state.crawlPhase + lg.phase)) * 1.15 : 0;
              const locX = lg.lx * (1 - legTuck * 0.55) * sMul;
              const locY = (lg.ly + stepW * 1.15 - legTuck * 3.8) * sMul;
              const [lx, ly] = localToWorldXY(state.x, state.y, yw, locX, locY);
              list.push({
                partKey: 'larvaLeg',
                asset: parts.larvaLeg,
                x: lx,
                y: ly,
                lift: Math.max(0, (0.2 + liftW) * sMul),
                ro: wrapAngle(yw + lg.side * 0.25),
                bias: -0.65,
                submerge: envSub
              });
            }
          }

          // 2. 柔软苍白软体前身躯节（缩壳超过 68% 时整只藏入骨壳内腔）
          if (hide < 0.68) {
            const pullBack = hide * 5.8 * sMul;
            const [bx, by] = localToWorldXY(state.x, state.y, yw, 0, (1.6 - pullBack) * sMul);
            const bKey = state.bodyMorph === 'stretch'
              ? 'bodyStretch'
              : (state.bodyMorph === 'retract' ? 'bodyRetract' : 'bodyNormal');
            list.push({
              partKey: bKey,
              asset: parts[bKey],
              x: bx,
              y: by,
              lift: 0.4 * sMul,
              ro: yw,
              bias: -0.10,
              submerge: envSub
            });
          }

          // 3. 独立幼虫圆头（pivotToWorldXY 锁死颈根枢轴；完全缩壳 hide>0.84 时严密藏进骨壳暗缝）
          if (hide < 0.84) {
            const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.75, 0.75));
            const stretchOff = state.bodyMorph === 'stretch' ? 1.1 : (state.bodyMorph === 'retract' ? -0.8 : 0);
            const headForward = lerp(5.4 + stretchOff, -0.6, smoothstep(0, 0.84, hide)) * sMul;
            const [hjx, hjy] = localToWorldXY(state.x, state.y, yw, 0, headForward);
            const [hx, hy] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
            const hKey = state.headPose === 'carry' ? 'headCarry' : 'headNormal';
            list.push({
              partKey: hKey,
              asset: parts[hKey],
              x: hx,
              y: hy,
              lift: (0.8 + (state.stage === 'patch' ? 1.4 : 0)) * sMul,
              ro: hYaw,
              bias: 0.35,
              submerge: envSub
            });
          }

          // 4. 锥形拼装骨壳（3 套随机/轮换变体 + 二阶弹簧滞后倾晃 + 受惊微颤）
          const shellKey = SHELL_VARIANTS[state.shellIdx].key;
          const shellLift = Math.max(0.2, shellLagPos.z + clamp(shellBounce.x * 0.14, -1.2, 2.2) * sMul);
          const shellYaw = wrapAngle(yw + clamp(shellYawLag.x, -0.32, 0.32) + shivX * 0.08);
          list.push({
            partKey: shellKey,
            asset: parts[shellKey],
            x: shellLagPos.x + shivX,
            y: shellLagPos.y + shivY,
            lift: shellLift,
            ro: shellYaw,
            bias: 0.55,
            submerge: envSub * 0.55
          });

          // 5. 待机交互物：洞底散落 3 块立体体素骨渣
          for (let i = 0; i < scraps.length; i++) {
            const sc = scraps[i];
            if (sc.mode === 'consumed') continue;
            const scSub = (habitat && habitat.isWater && sc.z < 1.2)
              ? EnvFeedback.calcSubmerge(sc.z, 1.4 * sMul, 4.0 * sMul, true)
              : 0;
            list.push({
              partKey: sc.partKey,
              asset: parts[sc.partKey],
              x: sc.x,
              y: sc.y,
              lift: sc.z,
              ro: sc.yaw,
              bias: sc.mode === 'carried' ? 0.65 : -0.30,
              submerge: scSub
            });
          }

          // 6. 待机交互物：洞顶下落水滴（半透明用 opacity，symDeg=90 四重对称）
          if (droplet.active) {
            list.push({
              partKey: 'water_drop',
              asset: parts.water_drop,
              x: droplet.x,
              y: droplet.y,
              lift: droplet.z,
              ro: 0,
              symDeg: 90,
              opacity: 0.84,
              bias: 1.20
            });
          }

          return list;
        },

        exportManifest(params) {
          const sh = SHELL_VARIANTS[state.shellIdx] || SHELL_VARIANTS[0];
          return {
            id: Cave4Def.id,
            code: Cave4Def.code,
            status: Cave4Def.status,
            name: Cave4Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            shellVariant: sh.key,
            shellVariantName: sh.name,
            shellPool: SHELL_VARIANTS.map(v => ({ id: v.key, name: v.name })),
            bodyMorph: state.bodyMorph,
            headPose: state.headPose,
            stage: state.stage,
            scrapCount: scraps.length,
            footRadius: Cave4Def.footRadius,
            headZ: 18,
            centerZ: 9,
            blocks: Cave4Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(Cave4Def);
})(window.PixelWorkshop);
