'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, fbm1 } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SpringDamper3D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 地4 · 空心角瞪羚（波斯 Shadhavar · M07 轻盈四足 + 夸大多叉空心树角 + 角上双鸟）
  //
  // 1. 俯视 ×4 清晰度与体貌特征放大：
  //    - 优雅纤细的暖金褐 / 浅米白四足瞪羚：独立胸肩、腰胯、修长颈部、精致瞪羚首、
  //      翘起短尾，4 条轻盈弯膝 IK 腿（矢状面 2-Bone IK + 循环步态，停步自动收脚）。
  //    - 极度夸张放大的象牙白 / 青铜色多叉空心树角（32×20×20，对称共享烘焙）：
  //      主枝分出多叉外展树冠角，角身雕出明显深色音孔纹理与青铜环箍，配弹簧微颤。
  //    - 角杈间停着 2 只高对比鲜蓝 / 明黄小鸟（展翅/收翅两档无损切换），
  //      微风吹过时空心角发出柔和扩散的青白音环（vfx.addRipple + 立体青白音环 + 音符微粒），
  //      两只小鸟跟着节拍蹦跳抖羽。
  //    - 暴露 2 个实时世界坐标 inst.mountSockets（供 地8 花朵或小鸟停靠）。
  // 2. 严守硬线：单怪 37 色（≤ 48 色、0 重色）、零常态 scaleX/scaleY 拉伸、
  //    巡游严格钳制在 maxRadius * 0.80 内、0 禁用字。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 暖金褐瞪羚毛皮主体
      coatDark:     '#8c5523',
      coatMid:      '#c9863e',
      coatHi:       '#f2bd6b',
      // 侧腹深暖褐条纹与背脊纹
      stripeDark:   '#593115',
      stripeMid:    '#824a20',
      stripeHi:     '#ab6935',
      // 浅米白胸腹、颊纹与臀白斑（在深绿草坪上高对比！）
      creamDark:    '#bfaf95',
      creamMid:     '#ede1cc',
      creamHi:      '#fffaf0',
      // 黑亮偶蹄与鼻尖
      hoofDark:     '#17151a',
      hoofMid:      '#302c36',
      hoofHi:       '#524c5c',
      // 温润黑眸与白眼点（eyeGlint 绝不进 glowKeys）
      eyeDark:      '#0e0c12',
      eyeGlint:     '#f5fcff',
      // 极度夸张放大的象牙白空心树角
      hornDark:     '#ada18e',
      hornMid:      '#dfd6c5',
      hornHi:       '#fffcf2',
      // 空心树角青铜环箍与枝节装饰
      bronzeDark:   '#4d5c48',
      bronzeMid:    '#7a9170',
      bronzeHi:     '#b0c9a3',
      // 空心树角明显镂空音孔纹理（深凹孔洞）
      holeDark:     '#1a1e24',
      holeMid:      '#343e47',
      // 角上小鸟 A：鲜亮钴蓝小鸟
      birdADark:    '#14569e',
      birdAMid:     '#2b90f0',
      birdAHi:      '#82d1ff',
      // 角上小鸟 B：明亮金黄小鸟
      birdBDark:    '#b8730b',
      birdBMid:     '#ffbe1f',
      birdBHi:      '#fff278',
      // 小鸟暖橘小喙
      beakMid:      '#f06824',
      // 空心角青白音环（柔和青白）
      chimeOuter:   '#62c9c2',
      chimeMid:     '#a8f2ea',
      chimeCore:    '#ebfffc'
    },
    glowKeys: ['chimeOuter', 'chimeMid', 'chimeCore'],
    parts: [
      'coat', 'stripe', 'cream', 'hoof', 'eye',
      'horn', 'bronze', 'hole',
      'birdA', 'birdB', 'beak', 'chimeRing'
    ],
    noCrease: [
      ['coat', 'stripe'], ['coat', 'cream'], ['coat', 'hoof'],
      ['coat', 'eye'], ['cream', 'eye'], ['cream', 'hoof'],
      ['horn', 'bronze'], ['horn', 'hole'], ['bronze', 'hole'],
      ['birdA', 'beak'], ['birdA', 'eye'], ['birdB', 'beak'], ['birdB', 'eye']
    ],
    materials: {
      coat:   ['coatDark',   'coatMid',   'coatHi'],
      stripe: ['stripeDark', 'stripeMid', 'stripeHi'],
      cream:  ['creamDark',  'creamMid',  'creamHi'],
      hoof:   ['hoofDark',   'hoofMid',   'hoofHi'],
      horn:   ['hornDark',   'hornMid',   'hornHi'],
      bronze: ['bronzeDark', 'bronzeMid', 'bronzeHi'],
      birdA:  ['birdADark',  'birdAMid',  'birdAHi'],
      birdB:  ['birdBDark',  'birdBMid',  'birdBHi']
    },
    protectedParts: ['eye', 'hole', 'beak', 'chimeRing']
  });

  // 3 套零重建模换色皮肤（0 禁用字）
  const SKINS = [
    {
      id: 'golden_ivory',
      name: '金褐象牙角',
      dot: '#d99848',
      outline: '#16120c',
      pal: {},
      fx: {
        chimeA: '#a8f2ea',
        chimeB: '#ebfffc',
        featherA: '#5cb8ff',
        featherB: '#ffe052'
      }
    },
    {
      id: 'cream_bronze',
      name: '雪米青铜角',
      dot: '#ede1cc',
      outline: '#141714',
      pal: {
        coatDark:   '#b09f84', coatMid:   '#e3d5bc', coatHi:   '#fff8eb',
        stripeDark: '#7d5f42', stripeMid: '#ad855e', stripeHi: '#d9b38c',
        creamDark:  '#c7c2b8', creamMid:  '#f0ece4', creamHi:  '#ffffff',
        hornDark:   '#465947', hornMid:   '#728f71', hornHi:   '#acc9a9',
        bronzeDark: '#8c6927', bronzeMid: '#c99c42', bronzeHi: '#fae082',
        birdADark:  '#157a55', birdAMid:  '#2ec78a', birdAHi:  '#8ef7c8',
        birdBDark:  '#b83728', birdBMid:  '#f26449', birdBHi:  '#ffad94',
        chimeOuter: '#5cc49e', chimeMid:  '#a6f2d4', chimeCore: '#ebfff6'
      },
      fx: {
        chimeA: '#a6f2d4',
        chimeB: '#ebfff6',
        featherA: '#42d99b',
        featherB: '#ff8a73'
      }
    },
    {
      id: 'russet_jade',
      name: '赤棕玉白角',
      dot: '#b85a32',
      outline: '#1c100c',
      pal: {
        coatDark:   '#78311a', coatMid:   '#b85430', coatHi:   '#e88358',
        stripeDark: '#471b12', stripeMid: '#702c1e', stripeHi: '#9c4430',
        creamDark:  '#bfad9b', creamMid:  '#eddcc9', creamHi:  '#fff7ed',
        hornDark:   '#7ea39c', hornMid:   '#bce0d8', hornHi:   '#ebfffa',
        bronzeDark: '#875e2b', bronzeMid: '#c48d45', bronzeHi: '#f5c778',
        birdADark:  '#1f679e', birdAMid:  '#42a8eb', birdAHi:  '#9ce0ff',
        birdBDark:  '#bd8213', birdBMid:  '#ffd038', birdBHi:  '#fff699',
        chimeOuter: '#70c4eb', chimeMid:  '#b5ebff', chimeCore: '#f0fcff'
      },
      fx: {
        chimeA: '#b5ebff',
        chimeB: '#f0fcff',
        featherA: '#66c2ff',
        featherB: '#ffdf66'
      }
    }
  ];

  // =========================================================================
  // 1. 优雅纤细的瞪羚胸肩躯干（14×18×13）
  // =========================================================================
  function buildChest(makeCanvas) {
    const W = 14, D = 18, H = 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.0, 6.0, -7.5, 8.0, 1, H - 1, (x, y, z, X, Y) => {
      const dChest = (Math.hypot(X / 4.2, (Y - 1.4) / 6.0, (z - 6.0) / 4.2) - 1.0) * 4.2;
      const dWithers = (Math.hypot(X / 3.6, (Y - 2.8) / 4.4, (z - 8.2) / 3.0) - 1.0) * 3.4;
      const dWaist = (Math.hypot(X / 3.5, (Y + 4.0) / 4.2, (z - 6.2) / 3.5) - 1.0) * 3.4;
      const d = smin(smin(dChest, dWithers, 1.5), dWaist, 1.6);
      if (d > 0) return;

      const isBelly = z < 4.8 && Math.abs(X) < 3.4;
      const isStripe = z >= 4.6 && z <= 6.2 && Math.abs(X) > 2.6 && Y < 4.5;
      if (isBelly) {
        m.setRaw(x, y, z, mat('cream'), partId.cream);
      } else if (isStripe) {
        m.setRaw(x, y, z, mat('stripe'), partId.stripe);
      } else {
        m.setRaw(x, y, z, mat('coat'), partId.coat);
      }
    });

    // 浅米白胸前绒毛（俯视提亮前胸轮廓）
    m.paintEllipsoid(0, 5.2, 5.2, 2.5, 2.0, 2.5, mat('cream'), partId.cream, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.2, headZ: 12, centerZ: 6 });
  }

  // =========================================================================
  // 2. 独立腰胯躯干（13×16×12，枢轴锁在前腰 (0, 4.0)）
  // =========================================================================
  const PELVIS_PIVOT = { x: 0, y: 4.0 };
  function buildPelvis(makeCanvas) {
    const W = 13, D = 16, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5.5, 5.5, -7.2, 6.5, 1, H - 1, (x, y, z, X, Y) => {
      const dWaist = (Math.hypot(X / 3.4, (Y - 2.2) / 4.4, (z - 5.8) / 3.4) - 1.0) * 3.4;
      const dHip   = (Math.hypot(X / 4.3, (Y + 2.4) / 4.8, (z - 6.2) / 3.9) - 1.0) * 3.8;
      const d = smin(dWaist, dHip, 1.5);
      if (d > 0) return;

      const isRumpWhite = Y < -4.2 && z < 8.4;
      const isBelly = z < 4.4 && Math.abs(X) < 3.0;
      const isStripe = z >= 4.4 && z <= 6.0 && Math.abs(X) > 2.7 && Y > -4.2;
      if (isRumpWhite || isBelly) {
        m.setRaw(x, y, z, mat('cream'), partId.cream);
      } else if (isStripe) {
        m.setRaw(x, y, z, mat('stripe'), partId.stripe);
      } else {
        m.setRaw(x, y, z, mat('coat'), partId.coat);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.8, headZ: 11, centerZ: 6 });
  }

  // =========================================================================
  // 3. 修长优雅瞪羚颈（9×11×13，枢轴锁在肩前根部 (0, -2.0)）
  // =========================================================================
  const NECK_PIVOT = { x: 0, y: -2.0 };
  function buildNeck(makeCanvas) {
    const m = new VoxelModel(9, 11, 13, SPEC);
    const { mat, partId } = SPEC;
    // 修长挺拔的羚羊长颈
    m.paintCapsule(0, -1.8, 1.8, 0, 1.6, 10.6, 2.6, 1.95, mat('coat'), partId.coat, true);
    // 颈前浅米白绒毛带
    m.paintCapsule(0, -0.5, 1.6, 0, 2.3, 9.6, 1.75, 1.35, mat('cream'), partId.cream, true);
    // 颈背细深褐脊线
    m.paintCapsule(0, -2.2, 3.6, 0, 0.2, 10.2, 0.85, 0.70, mat('stripe'), partId.stripe, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 12, centerZ: 6 });
  }

  // =========================================================================
  // 4. 精致优雅瞪羚首（11×16×11，枢轴锁在后枕 (0, -3.2)）
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -3.2 };
  function buildHead(makeCanvas) {
    const W = 11, D = 16, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 精致纤细颅骨 + 修长尖吻
    m.paintEllipsoid(0, -0.6, 5.2, 2.8, 3.6, 2.8, mat('coat'), partId.coat, true);
    m.paintCapsule(0, 0.8, 5.0, 0, 5.4, 3.8, 2.1, 1.35, mat('coat'), partId.coat, true);
    // 标志性瞪羚浅米白脸颊纹与下颔
    m.paintCapsule(0, 1.4, 3.8, 0, 5.4, 3.0, 1.7, 1.25, mat('cream'), partId.cream, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.9, 0.4, 4.4, s * 1.3, 4.6, 3.8, 0.85, 0.65, mat('cream'), partId.cream, true);
    }
    // 小黑鼻尖
    m.paintEllipsoid(0, 6.4, 3.9, 0.95, 0.72, 0.72, mat('hoof'), partId.hoof, true);

    // 优雅竖立的尖细双耳
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 2.0, -2.0, 6.4, s * 3.8, -3.6, 9.8, 1.05, 0.52, mat('coat'), partId.coat, true);
      m.paintCapsule(s * 2.2, -1.6, 6.6, s * 3.6, -3.2, 9.4, 0.65, 0.35, mat('cream'), partId.cream, true);
    }

    // 头顶角基座（承接夸张多叉空心树角）
    m.paintEllipsoid(0, -0.4, 7.8, 2.2, 2.0, 1.3, mat('bronze'), partId.bronze, true);

    m.despeckle();
    m.applyArtShading(true);

    // 温润大黑眸 + 亮白眼点（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 1.8);
    const eyeZ = 5;
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 5; step++) {
        const tx = Math.round(hw + s * (3.5 - step));
        const p = m.getPartId(tx, eyeY, eyeZ);
        if (p === partId.coat || p === partId.cream) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 2.2);
      m.setRaw(sx, eyeY,     eyeZ,     keyToId.eyeDark,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ,     keyToId.eyeDark,  partId.eye);
      m.setRaw(sx, eyeY,     eyeZ + 1, keyToId.eyeDark,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 10, centerZ: 5 });
  }

  // =========================================================================
  // 5. 极度夸张放大的多叉空心树角（32×20×20，严格 X 对称 -> 自动半角烘焙！）
  //    象牙白主骨 + 青铜环箍 + 醒目深色空心音孔纹理 + 左右高位停鸟角杈
  // =========================================================================
  const ANTLER_PIVOT = { x: 0, y: 0 };
  // 左右角杈停鸟点（局部坐标，与树角枝梢精准对齐）
  const BIRD_PERCH_L = { x: -10.4, y: -1.8, z: 14.8 };
  const BIRD_PERCH_R = { x:  10.4, y: -1.8, z: 14.8 };

  function buildAntlerCrown(makeCanvas) {
    const W = 32, D = 20, H = 20;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 底部青铜连座（深嵌头顶角基）
    m.paintEllipsoid(0, 0, 1.5, 2.4, 2.2, 1.5, mat('bronze'), partId.bronze, true);

    for (const s of [-1, 1]) {
      // 主角干：从头顶向外上方大幅弧展（夸张放大，宽达 30 格！）
      m.paintCapsule(s * 1.0,  0.0,  1.6, s * 5.6, -1.2,  7.0, 1.75, 1.55, mat('horn'), partId.horn, true);
      m.paintCapsule(s * 5.6, -1.2,  7.0, s * 10.6, -2.0, 13.4, 1.55, 1.25, mat('horn'), partId.horn, true);
      m.paintCapsule(s * 10.6, -2.0, 13.4, s * 13.8, -1.6, 18.2, 1.15, 0.72, mat('horn'), partId.horn, true);

      // 前挑眉叉（向 +Y 前上方分叉，强化立体多叉树冠轮廓）
      m.paintCapsule(s * 4.8, -0.8,  6.2, s * 6.8,  5.6, 11.2, 1.25, 0.78, mat('horn'), partId.horn, true);
      m.paintCapsule(s * 6.4,  3.8,  9.8, s * 9.2,  7.2, 14.8, 0.90, 0.58, mat('horn'), partId.horn, true);

      // 中段内展分叉 + 后扬长叉（形成数十叉般的繁茂空心树角）
      m.paintCapsule(s * 8.0, -1.6, 10.2, s * 4.6, -3.4, 16.4, 1.05, 0.62, mat('horn'), partId.horn, true);
      m.paintCapsule(s * 9.4, -1.8, 12.0, s * 13.2, -6.4, 15.8, 1.02, 0.62, mat('horn'), partId.horn, true);
      // 停鸟小平杈托（在 ±10.4, -1.8, 14.0 形成自然停靠枝台）
      m.paintEllipsoid(s * 10.4, -1.8, 13.8, 1.65, 1.55, 1.05, mat('bronze'), partId.bronze, true);

      // 青铜节环（突出空心管乐器般的精致分段质感）
      m.paintEllipsoid(s * 3.4, -0.6, 4.4, 1.85, 1.85, 0.85, mat('bronze'), partId.bronze, true);
      m.paintEllipsoid(s * 7.8, -1.6, 9.8, 1.65, 1.65, 0.80, mat('bronze'), partId.bronze, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 在主干与粗分叉表面精准点刻醒目的深色镂空音孔纹理（着色后刻绘，俯视清晰锐利！）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const holeSpots = [
      [ 4.6, -1.0,  6.4],
      [ 7.2, -1.4,  9.2],
      [ 9.6, -1.8, 12.2],
      [ 6.2,  3.6,  9.6],
      [11.8, -1.8, 15.8],
      [ 5.6, -2.8, 14.2]
    ];
    for (const s of [-1, 1]) {
      for (const [hx, hy, hz] of holeSpots) {
        const ix = Math.round(hw + s * hx);
        const iy = Math.round(hd + hy);
        const iz = Math.round(hz);
        // 顶部与前侧同时点出深孔，确保俯视与 360° 视角都能清晰看到空心孔洞
        m.setRaw(ix, iy, iz, keyToId.holeDark, partId.hole);
        if (iy + 1 < D) m.setRaw(ix, iy + 1, iz, keyToId.holeMid, partId.hole);
        if (iz + 1 < H) m.setRaw(ix, iy, iz + 1, keyToId.holeDark, partId.hole);
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 14.0, headZ: 19, centerZ: 10 });
  }

  // =========================================================================
  // 6. 纤细弯膝 IK 腿段、偶蹄、翘短尾
  // =========================================================================
  function buildLimbSeg(makeCanvas, rTop, rBot, hLen, creamBot) {
    const S = Math.max(5, Math.ceil(Math.max(rTop, rBot) * 2 + 3));
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    const mk = creamBot ? 'cream' : 'coat';
    const pk = creamBot ? partId.cream : partId.coat;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat(mk), pk, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildHoof(makeCanvas) {
    const m = new VoxelModel(5, 6, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -0.2, 2.4, 0, -0.2, 4.2, 1.15, 1.10, mat('cream'), partId.cream, true);
    m.paintCapsule(0, 0.2, 0.7, 0, 0.0, 2.6, 1.25, 1.05, mat('hoof'), partId.hoof, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.5 });
  }

  const TAIL_PIVOT = { x: 0, y: 2.2 };
  function buildTail(makeCanvas) {
    const m = new VoxelModel(5, 8, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 2.0, 2.4, 0, -1.8, 3.8, 1.1, 0.85, mat('cream'), partId.cream, true);
    m.paintEllipsoid(0, -2.2, 4.0, 1.15, 1.45, 1.05, mat('stripe'), partId.stripe, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.8 });
  }

  // =========================================================================
  // 7. 角杈间停驻的 2 只鲜蓝 / 明黄小鸟（2 档无损切换：rest 收翅 / hop 展翅抖羽）
  // =========================================================================
  function buildPerchBird(makeCanvas, variant, isHop) {
    const W = isHop ? 10 : 7;
    const D = 8;
    const H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const mk = variant === 0 ? 'birdA' : 'birdB';
    const pk = variant === 0 ? partId.birdA : partId.birdB;

    // 圆滚滚小巧鸟身 + 俏皮小尾羽
    m.paintEllipsoid(0, -0.2, 2.8, 2.0, 2.4, 1.9, mat(mk), pk, true);
    m.paintCapsule(0, -1.8, 2.8, 0, -3.5, 4.2, 0.9, 0.55, mat(mk), pk, true);
    // 圆脑袋 + 亮橘小尖喙
    m.paintEllipsoid(0, 1.4, 4.6, 1.65, 1.65, 1.55, mat(mk), pk, true);
    m.paintCapsule(0, 2.6, 4.5, 0, 3.8, 4.4, 0.58, 0.30, keyToId.beakMid, partId.beak, true);

    // 展翅抖羽态：左右展开高对比鲜艳小翅膀
    if (isHop) {
      for (const s of [-1, 1]) {
        m.paintCapsule(s * 1.4, 0.0, 3.2, s * 4.2, -0.6, 5.2, 1.05, 0.65, mat(mk), pk, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);

    // 小黑圆眼
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const ey = Math.round(hd + 2.0);
    for (const s of [-1, 1]) {
      m.setRaw(Math.round(hw + s * 1.5), ey, 5, keyToId.eyeDark, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 2.5, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 8. 柔和扩散青白音环（2 档大小，立体镂空像素环）
  // =========================================================================
  function buildChimeRing(makeCanvas, radius) {
    const S = Math.ceil(radius * 2 + 4);
    const m = new VoxelModel(S, S, 3, SPEC);
    const { partId, keyToId } = SPEC;
    m.fillAABB(-radius - 1, radius + 1, -radius - 1, radius + 1, 0, 2, (x, y, z, X, Y) => {
      if (z !== 1) return;
      const r = Math.hypot(X, Y);
      if (Math.abs(r - radius) <= 0.78) {
        const ang = Math.atan2(Y, X);
        const kId = Math.abs(Math.sin(ang * 3)) > 0.62
          ? keyToId.chimeCore
          : (Math.abs(r - radius) < 0.38 ? keyToId.chimeMid : keyToId.chimeOuter);
        m.setRaw(x, y, z, kId, partId.chimeRing);
      }
    });
    return m.toStripAsset(makeCanvas, { footRadius: radius });
  }

  // =========================================================================
  // 轻盈四足循环步态 + 矢状面 3D 2-Bone IK（复用自 地3 精制方案，调轻盈瞪羚步频）
  // =========================================================================
  function solveSagittalLegIK(hx, hy, hz, fx, fy, fz, ayaw, L1, L2, kneeSign, sMul) {
    const fwdX = -Math.sin(ayaw), fwdY = Math.cos(ayaw);
    const rightX = Math.cos(ayaw), rightY = Math.sin(ayaw);
    const dx = fx - hx, dy = fy - hy;
    const dFwd = dx * fwdX + dy * fwdY;
    const dSide = dx * rightX + dy * rightY;
    const dZ = fz - hz;
    const rawD = Math.hypot(dFwd, dZ) || 0.001;
    const minD = Math.abs(L1 - L2) + 0.15 * sMul;
    const maxD = L1 + L2 - 0.12 * sMul;
    const d = clamp(rawD, minD, maxD);
    const cosA = clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1);
    const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
    const uFwd = dFwd / rawD;
    const uZ = dZ / rawD;
    const along = L1 * cosA;
    const perp = L1 * sinA * kneeSign;
    const kFwd = along * uFwd + perp * (-uZ);
    const kZ = hz + along * uZ + perp * uFwd;
    const kSide = dSide * 0.45;
    return {
      kx: hx + kFwd * fwdX + kSide * rightX,
      ky: hy + kFwd * fwdY + kSide * rightY,
      kz: Math.max(1.4 * sMul, kZ)
    };
  }

  class GazelleCyclicGait {
    constructor(legs) {
      this.phase = 0;
      this.trotBlend = 0;
      this.idleTime = 0;
      this.prevBodyYaw = 0;
      this.hasPrevYaw = false;
      this.legs = legs.map((l, idx) => ({
        ...l,
        index: idx,
        isFront: l.id === 'FL' || l.id === 'FR',
        hipWX: l.hipX, hipWY: l.hipY, hipWZ: l.hipZ,
        footX: l.restX, footY: l.restY, footZ: 0,
        kneeX: l.restX, kneeY: l.restY, kneeZ: l.hipZ * 0.55,
        anchorYaw: 0,
        inSwing: false,
        liftX: l.restX, liftY: l.restY,
        settling: false, settleT: 0, settleStartX: l.restX, settleStartY: l.restY,
        justLanded: false
      }));
    }

    reset(bodyX, bodyY, bodyYaw, sMul = 1.0, legAnchors = null) {
      this.phase = 0;
      this.trotBlend = 0;
      this.idleTime = 0;
      this.prevBodyYaw = bodyYaw;
      this.hasPrevYaw = true;
      for (const leg of this.legs) {
        const anc = (legAnchors && legAnchors[leg.id]) || null;
        const ax = anc ? anc.x : bodyX;
        const ay = anc ? anc.y : bodyY;
        const ayaw = anc ? anc.yaw : bodyYaw;
        const [hx, hy] = localToWorldXY(ax, ay, ayaw, leg.hipX * sMul, leg.hipY * sMul);
        const [rx, ry] = localToWorldXY(ax, ay, ayaw, leg.restX * sMul, leg.restY * sMul);
        leg.hipWX = hx; leg.hipWY = hy;
        leg.footX = leg.liftX = leg.settleStartX = rx;
        leg.footY = leg.liftY = leg.settleStartY = ry;
        leg.footZ = 0;
        leg.anchorYaw = ayaw;
        leg.inSwing = false;
        leg.settling = false;
        leg.settleT = 0;
        leg.justLanded = false;
      }
    }

    update(dt, bodyX, bodyY, bodyZ, bodyYaw, velX, velY, opts = {}) {
      const sMul = opts.scaleMul ?? 1.0;
      const freq = opts.stepFreq ?? 1.0;
      const stepHeight = opts.stepHeight ?? (4.2 * sMul);
      const legAnchors = opts.legAnchors || null;
      const landed = [];

      const yawRate = this.hasPrevYaw ? Math.abs(wrapAngle(bodyYaw - this.prevBodyYaw)) / Math.max(dt, 0.001) : 0;
      this.prevBodyYaw = bodyYaw;
      this.hasPrevYaw = true;

      const moveSpd = Math.hypot(velX, velY);
      const isMoving = moveSpd > 1.2 || yawRate > 0.22;
      if (isMoving) this.idleTime = 0;
      else this.idleTime += dt;

      const targetTrot = smoothstep(5.0, 13.0, moveSpd);
      this.trotBlend = lerp(this.trotBlend, targetTrot, expSmooth(dt, 6.5));

      const strideLen = 11.8 * sMul;
      if (isMoving) {
        const dPhase = ((moveSpd / strideLen) + yawRate * 0.24) * dt * clamp(freq, 0.45, 2.0);
        this.phase = (this.phase + dPhase) % 1;
      }

      const SWING_FRAC = 0.46;
      const reachHalf = 2.9 * sMul;
      const maxBackBehindHip = 3.2 * sMul;
      const maxFootDistFromIdeal = 4.4 * sMul;

      let liftSum = 0, frontLift = 0, rearLift = 0;
      let localRoll = 0, localPitch = 0;
      let settlingAny = this.legs.some(l => l.settling);

      for (const leg of this.legs) {
        leg.justLanded = false;
        const anc = (legAnchors && legAnchors[leg.id]) || null;
        const ax = anc ? anc.x : bodyX;
        const ay = anc ? anc.y : bodyY;
        const az = (anc && anc.z !== undefined) ? anc.z : bodyZ;
        const ayaw = anc ? anc.yaw : bodyYaw;
        leg.anchorYaw = ayaw;

        const [hx, hy] = localToWorldXY(ax, ay, ayaw, leg.hipX * sMul, leg.hipY * sMul);
        const hz = az + leg.hipZ * sMul;
        leg.hipWX = hx; leg.hipWY = hy; leg.hipWZ = hz;

        const [idealX, idealY] = localToWorldXY(ax, ay, ayaw, leg.restX * sMul, leg.restY * sMul);
        const fwdX = -Math.sin(ayaw), fwdY = Math.cos(ayaw);
        const rightX = Math.cos(ayaw), rightY = Math.sin(ayaw);

        if (isMoving) {
          leg.settling = false;
          leg.settleT = 0;
          const off = lerp(leg.walkOff, leg.trotOff, this.trotBlend);
          const phi = (this.phase + off) % 1;
          const wantSwing = phi < SWING_FRAC;
          const speedRatio = clamp(moveSpd / 13.5, 0.25, 1.15);
          const leadDist = reachHalf * speedRatio;
          const landX = idealX + fwdX * leadDist;
          const landY = idealY + fwdY * leadDist;

          if (wantSwing) {
            if (!leg.inSwing) {
              leg.inSwing = true;
              leg.liftX = leg.footX;
              leg.liftY = leg.footY;
            }
            const u = clamp(phi / SWING_FRAC, 0, 1);
            const s = smoothstep(0, 1, u);
            leg.footX = lerp(leg.liftX, landX, s);
            leg.footY = lerp(leg.liftY, landY, s);
            const curStepH = stepHeight * (0.55 + 0.45 * speedRatio);
            leg.footZ = Math.pow(Math.sin(u * Math.PI), 0.72) * curStepH;
            liftSum += leg.footZ;
            if (leg.isFront) frontLift += leg.footZ;
            else rearLift += leg.footZ;
            const w = Math.sin(u * Math.PI);
            localRoll -= Math.sign(leg.restX) * w * 0.24;
            localPitch -= (leg.isFront ? 1 : -1) * w * 0.20;
          } else {
            if (leg.inSwing) {
              leg.inSwing = false;
              leg.footX = landX;
              leg.footY = landY;
              leg.footZ = 0;
              leg.justLanded = true;
              landed.push(leg);
            } else {
              leg.footZ = 0;
            }
            const dxH = leg.footX - hx, dyH = leg.footY - hy;
            const fwdFromHip = dxH * fwdX + dyH * fwdY;
            const sideFromHip = dxH * rightX + dyH * rightY;
            if (fwdFromHip < -maxBackBehindHip) {
              leg.footX = hx - maxBackBehindHip * fwdX + sideFromHip * rightX;
              leg.footY = hy - maxBackBehindHip * fwdY + sideFromHip * rightY;
            }
            const distIdeal = Math.hypot(leg.footX - idealX, leg.footY - idealY);
            if (distIdeal > maxFootDistFromIdeal) {
              const k = maxFootDistFromIdeal / distIdeal;
              leg.footX = idealX + (leg.footX - idealX) * k;
              leg.footY = idealY + (leg.footY - idealY) * k;
            }
          }
        } else {
          if (leg.inSwing) {
            leg.inSwing = false;
            leg.settling = true;
            leg.settleT = 0.25;
            leg.settleStartX = leg.footX;
            leg.settleStartY = leg.footY;
            settlingAny = true;
          }
          const distIdeal = Math.hypot(leg.footX - idealX, leg.footY - idealY);
          if (!leg.settling && !settlingAny && this.idleTime > 0.10 && distIdeal > 1.15 * sMul) {
            leg.settling = true;
            leg.settleT = 0;
            leg.settleStartX = leg.footX;
            leg.settleStartY = leg.footY;
            settlingAny = true;
          }
          if (leg.settling) {
            leg.settleT += dt / 0.16;
            if (leg.settleT >= 1) {
              leg.settling = false;
              leg.settleT = 0;
              leg.footX = idealX;
              leg.footY = idealY;
              leg.footZ = 0;
              leg.justLanded = true;
              landed.push(leg);
            } else {
              const s = smoothstep(0, 1, leg.settleT);
              leg.footX = lerp(leg.settleStartX, idealX, s);
              leg.footY = lerp(leg.settleStartY, idealY, s);
              leg.footZ = Math.sin(leg.settleT * Math.PI) * 1.9 * sMul;
              liftSum += leg.footZ;
            }
          } else {
            leg.footZ = 0;
          }
        }

        const ik = solveSagittalLegIK(
          hx, hy, hz, leg.footX, leg.footY, leg.footZ,
          ayaw, leg.L1 * sMul, leg.L2 * sMul, leg.kneeSign, sMul
        );
        leg.kneeX = ik.kx;
        leg.kneeY = ik.ky;
        leg.kneeZ = ik.kz;
      }

      const [tiltX, tiltY] = localToWorldXY(0, 0, bodyYaw, localRoll, localPitch);
      return { landed, liftSum, frontLift, rearLift, tiltX, tiltY };
    }
  }

  // 2 个对外开放的跨个体停靠挂点（背脊前段 / 后段，供 地8 花朵或小鸟停靠）
  const MOUNT_SOCKET_LAYOUT = [
    { id: 'gazelle_back_front', lx: 0.0, ly:  2.2, zOff: 12.2, r: 4.0 },
    { id: 'gazelle_back_rear',  lx: 0.0, ly: -4.2, zOff: 11.8, r: 4.0 }
  ];

  const Earth4Def = {
    id: 'earth4_shadhavar',
    code: '地4',
    name: '空心角瞪羚',
    status: 'done',
    tag: 'M07 轻盈四足 · 夸大多叉空心树角音环',
    summary: '优雅纤细的暖金褐/浅米白四足瞪羚（弯膝 IK 轻盈步态），头顶极度夸张放大的象牙白/青铜色多叉空心树角（带清晰孔洞纹理），角杈间停着 2 只鲜蓝/明黄小鸟；微风吹过发出柔和青白音环与音符微粒，双鸟跟着蹦跳抖羽，并开放 2 个 mountSockets 供地8花朵或小鸟停靠',
    defaultHabitat: 'forest',
    footRadius: 10.2,
    ecoWeight: 1.1,
    useWaterFoam: true,
    mountHeight: 12.2,
    mountBackOffset: -1.0,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '林间踱步鸣角', loop: true, status: 'done' },
      { id: 'idle',   name: '原地立姿微摆', loop: true, status: 'done' },
      { id: 'chime',  name: '迎风空心角鸣响', loop: true, status: 'done' }
    ],
    blocks: [
      '胸肩/腰胯/长颈/瞪羚首分节骨架',
      '4 足纤细轻盈弯膝 IK 步态',
      '夸大多叉象牙白青铜空心树角（带孔洞纹理）',
      '角杈 2 只鲜蓝/明黄停驻小鸟（随音环蹦跳抖羽）',
      '柔和青白音环与 2 个实时 mountSockets 挂点'
    ],
    soulHabit: '在林地与草甸轻盈踱步吃草；微风吹过夸张的多叉空心树角时，角孔飘出柔和青白音环与音符微粒，停在角杈间的鲜蓝、明黄小鸟立刻欢快蹦跳抖羽',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        chest:          buildChest(makeCanvas),
        pelvis:         buildPelvis(makeCanvas),
        neck:           buildNeck(makeCanvas),
        head:           buildHead(makeCanvas),
        antlerCrown:    buildAntlerCrown(makeCanvas),
        tail:           buildTail(makeCanvas),
        limbUpper:      buildLimbSeg(makeCanvas, 1.55, 1.25, 5.4, false),
        limbKnee:       buildLimbSeg(makeCanvas, 1.22, 1.12, 3.6, false),
        limbLower:      buildLimbSeg(makeCanvas, 1.08, 0.96, 5.6, true),
        hoof:           buildHoof(makeCanvas),
        birdARest:      buildPerchBird(makeCanvas, 0, false),
        birdAHop:       buildPerchBird(makeCanvas, 0, true),
        birdBRest:      buildPerchBird(makeCanvas, 1, false),
        birdBHop:       buildPerchBird(makeCanvas, 1, true),
        chimeRingSmall: buildChimeRing(makeCanvas, 3.4),
        chimeRingLarge: buildChimeRing(makeCanvas, 5.0)
      };

      const gait = new GazelleCyclicGait([
        { id: 'FL', hipX: -3.0, hipY:  3.6, hipZ: 3.4, restX: -3.5, restY:  4.0, L1: 6.4, L2: 6.8, kneeSign: -1, walkOff: 0.25, trotOff: 0.55 },
        { id: 'FR', hipX:  3.0, hipY:  3.6, hipZ: 3.4, restX:  3.5, restY:  4.0, L1: 6.4, L2: 6.8, kneeSign: -1, walkOff: 0.75, trotOff: 0.05 },
        { id: 'BL', hipX: -3.0, hipY: -2.0, hipZ: 3.6, restX: -3.6, restY: -1.8, L1: 6.5, L2: 6.9, kneeSign:  1, walkOff: 0.00, trotOff: 0.00 },
        { id: 'BR', hipX:  3.0, hipY: -2.0, hipZ: 3.6, restX:  3.6, restY: -1.8, L1: 6.5, L2: 6.9, kneeSign:  1, walkOff: 0.50, trotOff: 0.50 }
      ]);

      const spineBendSpring = new SpringDamper1D(0, 78, 7.2);
      const headYawSpring   = new SpringDamper1D(0, 82, 7.0);
      const antlerSwaySpring = new SpringDamper1D(0, 44, 4.6);
      const tailWagSpring   = new SpringDamper1D(0, 92, 5.8);
      const bodyBounce      = new SpringDamper1D(0, 128, 8.0);
      const birdSprings     = [
        new SpringDamper3D(0, 0, 32, 110, 6.8),
        new SpringDamper3D(0, 0, 32, 110, 6.8)
      ];

      // 4 圈青白音环池
      const chimeRings = Array.from({ length: 4 }, (_, i) => ({
        idx: i,
        active: false,
        x: 0, y: 0, z: 30,
        vx: 0, vy: 0, vz: 0,
        t: 0, life: 1.9,
        spin: i * 0.9,
        large: (i & 1) === 1
      }));

      const homeX0 = opts.homeX ?? 0;
      const homeY0 = opts.homeY ?? 0;
      const homeYaw0 = opts.homeYaw ?? 0;
      const seed = opts.seed ?? 44;

      const mountSockets = MOUNT_SOCKET_LAYOUT.map(cfg => ({
        id: cfg.id,
        lx: cfg.lx,
        ly: cfg.ly,
        x: homeX0 + cfg.lx,
        y: homeY0 + cfg.ly,
        z: 8.6 + cfg.zOff,
        yaw: homeYaw0,
        r: cfg.r,
        occupiedBy: null
      }));

      const state = {
        x: homeX0,
        y: homeY0,
        z: 8.6,
        vx: 0,
        vy: 0,
        yaw: homeYaw0,
        prevYaw: homeYaw0,
        pelvisYaw: homeYaw0,
        tiltX: 0,
        tiltY: 0,
        frontBob: 0,
        rearBob: 0,
        chimeActive: false,
        chimePhaseTimer: 2.0,
        chimeCd: 0.25,
        chimeSeq: 0,
        birdHopA: false,
        birdHopB: false,
        seed
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function computeHeadAndAntlerWorld(bx, by, bodyLift, yw, hRel, antlerSway, sMul) {
        const nYaw = wrapAngle(yw + hRel * 0.45);
        const hYaw = wrapAngle(yw + hRel);
        const [njx, njy] = localToWorldXY(bx, by, yw, 0, 4.6 * sMul);
        const [nx, ny] = pivotToWorldXY(njx, njy, nYaw, NECK_PIVOT.x * sMul, NECK_PIVOT.y * sMul);
        const neckLift = bodyLift + 6.4 * sMul;

        const [hjx, hjy] = localToWorldXY(njx, njy, nYaw, 0, 3.2 * sMul);
        const [hx, hy] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
        const headLift = neckLift + 6.8 * sMul;

        const aYaw = wrapAngle(hYaw + clamp(antlerSway, -0.26, 0.26));
        const [ajx, ajy] = localToWorldXY(hx, hy, hYaw, 0, -0.4 * sMul);
        const [ax, ay] = pivotToWorldXY(ajx, ajy, aYaw, ANTLER_PIVOT.x * sMul, ANTLER_PIVOT.y * sMul);
        const antlerLift = headLift + 7.2 * sMul;

        const [pLx, pLy] = localToWorldXY(ax, ay, aYaw, BIRD_PERCH_L.x * sMul, BIRD_PERCH_L.y * sMul);
        const [pRx, pRy] = localToWorldXY(ax, ay, aYaw, BIRD_PERCH_R.x * sMul, BIRD_PERCH_R.y * sMul);
        return {
          nx, ny, nYaw, neckLift,
          hx, hy, hYaw, headLift,
          ax, ay, aYaw, antlerLift,
          perchL: { x: pLx, y: pLy, z: antlerLift + BIRD_PERCH_L.z * sMul },
          perchR: { x: pRx, y: pRy, z: antlerLift + BIRD_PERCH_R.z * sMul }
        };
      }

      function syncMountSockets(bx, by, bodyLift, yw, sMul) {
        for (let i = 0; i < mountSockets.length; i++) {
          const cfg = MOUNT_SOCKET_LAYOUT[i];
          const sl = mountSockets[i];
          const useYaw = i === 1 ? state.pelvisYaw : yw;
          const [wx, wy] = localToWorldXY(bx, by, useYaw, cfg.lx * sMul, cfg.ly * sMul);
          sl.x = wx;
          sl.y = wy;
          sl.z = Math.max(6.0 * sMul, bodyLift + cfg.zOff * sMul);
          sl.yaw = useYaw;
          sl.r = cfg.r * sMul;
        }
      }

      const instance = {
        def: Earth4Def,
        cachePrefix: `earth4_sdv_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        mountSockets,
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
          state.z = 8.6 * sMul;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw ?? 0;
          state.prevYaw = state.yaw;
          state.pelvisYaw = state.yaw;
          state.tiltX = 0;
          state.tiltY = 0;
          state.frontBob = 0;
          state.rearBob = 0;
          state.chimeActive = true;
          state.chimePhaseTimer = 3.2;
          state.chimeCd = 0.22;
          state.chimeSeq = 0;
          state.birdHopA = false;
          state.birdHopB = false;

          spineBendSpring.x = spineBendSpring.v = 0;
          headYawSpring.x = headYawSpring.v = 0;
          antlerSwaySpring.x = antlerSwaySpring.v = 0;
          tailWagSpring.x = tailWagSpring.v = 0;
          bodyBounce.x = bodyBounce.v = 0;

          const [pJointX, pJointY] = localToWorldXY(state.x, state.y, state.yaw, 0, -4.0 * sMul);
          const [px, py] = pivotToWorldXY(pJointX, pJointY, state.pelvisYaw, PELVIS_PIVOT.x * sMul, PELVIS_PIVOT.y * sMul);
          gait.reset(state.x, state.y, state.yaw, sMul, {
            BL: { x: px, y: py, yaw: state.pelvisYaw },
            BR: { x: px, y: py, yaw: state.pelvisYaw }
          });

          const ha = computeHeadAndAntlerWorld(state.x, state.y, state.z, state.yaw, 0, 0, sMul);
          birdSprings[0].reset(ha.perchL.x, ha.perchL.y, ha.perchL.z);
          birdSprings[1].reset(ha.perchR.x, ha.perchR.y, ha.perchR.z);
          for (const cr of chimeRings) cr.active = false;

          for (const sl of mountSockets) sl.occupiedBy = null;
          state._riderCount = 0;
          syncMountSockets(state.x, state.y, state.z, state.yaw, sMul);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));

          const action = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const maxR = (eco && eco.maxRadius) || 46;
          const patrolLimitR = maxR * 0.78;
          const baseLift = 8.6 * sMul;
          const fx = curSkin.fx || SKINS[0].fx;

          // 1. 微风鸣角周期切换
          if (action === 'chime') {
            state.chimeActive = true;
          } else {
            state.chimePhaseTimer -= dt;
            if (state.chimePhaseTimer <= 0) {
              state.chimeActive = !state.chimeActive;
              state.chimePhaseTimer = state.chimeActive ? 3.8 : 2.8;
            }
          }

          // 2. 轻盈四足移动 / 原地迎风立姿
          const prevYaw = state.yaw;
          if (action === 'patrol') {
            Propulsion.multiLegWalk(state, dt, time, { ...params, speed: spdMul * 1.04 }, {
              ...(eco || {}),
              walkStyle: 'stalk',
              baseLift,
              maxRadius: patrolLimitR
            });
          } else {
            const hx = (eco && eco.homeX) ?? homeX0;
            const hy = (eco && eco.homeY) ?? homeY0;
            const hyaw = (eco && eco.homeYaw) ?? homeYaw0;
            Propulsion.walkToPoint(state, hx, hy, dt, params, {
              arriveDist: 2.0 * sMul,
              maxSpeed: 14.0,
              maxTurn: 3.6,
              aimYaw: hyaw + Math.sin(time * 0.65) * 0.20,
              baseLift
            });
          }

          // 硬钳制巡游坐标在 maxRadius * 0.80 内
          const dOrig = Math.hypot(state.x, state.y);
          if (dOrig > patrolLimitR && dOrig > 0.001) {
            state.x *= patrolLimitR / dOrig;
            state.y *= patrolLimitR / dOrig;
          }

          const yawRate = wrapAngle(state.yaw - prevYaw) / Math.max(dt, 0.001);
          state.prevYaw = state.yaw;
          const spineBend = spineBendSpring.update(dt, clamp(-yawRate * 0.14, -0.38, 0.38), 78 * sp, clamp(7.2 * dScale, 3.2, 11.0));
          state.pelvisYaw = wrapAngle(state.yaw + spineBend);

          // 3. 四足弯膝 IK 轻盈步态
          const [pJointPreX, pJointPreY] = localToWorldXY(state.x, state.y, state.yaw, 0, -4.0 * sMul);
          const [pelvisPreX, pelvisPreY] = pivotToWorldXY(pJointPreX, pJointPreY, state.pelvisYaw, PELVIS_PIVOT.x * sMul, PELVIS_PIVOT.y * sMul);
          const pelvisAnchor = { x: pelvisPreX, y: pelvisPreY, z: state.z + 0.2 * sMul, yaw: state.pelvisYaw };

          const gaitRes = gait.update(dt, state.x, state.y, state.z, state.yaw, state.vx, state.vy, {
            scaleMul: sMul,
            legAnchors: { BL: pelvisAnchor, BR: pelvisAnchor },
            stepFreq: freq * 1.12,
            stepHeight: 4.1 * sMul * clamp(flex, 0.7, 1.3)
          });

          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 0.72 * sMul, expSmooth(dt, 11));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 0.72 * sMul, expSmooth(dt, 11));
          state.frontBob = lerp(state.frontBob, clamp(gaitRes.frontLift * 0.18, 0, 1.0), expSmooth(dt, 14));
          state.rearBob  = lerp(state.rearBob,  clamp(gaitRes.rearLift  * 0.18, 0, 1.0), expSmooth(dt, 14));

          if (gaitRes.landed.length > 0) {
            bodyBounce.impulse(-8.5 * sMul);
            for (const leg of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, leg.footX, leg.footY, 0.55 * sMul);
            }
          }
          bodyBounce.update(dt, -gaitRes.liftSum * 0.10, 128 * sp, clamp(8.0 * dScale, 3.4, 12.0));

          // 4. 头部张望、空心树角微风弹簧、短尾摇摆
          const targetHeadYaw = clamp(-yawRate * 0.18, -0.46, 0.46) + Math.sin(time * 1.1 + seed) * 0.22;
          const hRel = headYawSpring.update(dt, targetHeadYaw, 82 * sp, clamp(7.0 * dScale, 3.0, 11.0));
          const windWave = (fbm1(time * 0.65, seed + 17) - 0.5) * 0.24 * flex + (state.chimeActive ? Math.sin(time * 4.8 * freq) * 0.08 : 0);
          const antlerSway = antlerSwaySpring.update(dt, windWave - yawRate * 0.08, 44 * sp, clamp(4.6 * dScale, 2.4, 8.0));
          tailWagSpring.update(dt, Math.sin(time * (state.chimeActive ? 7.8 : 3.2) * freq) * (state.chimeActive ? 0.52 : 0.22) * flex, 92 * sp, clamp(5.8 * dScale, 2.8, 9.8));

          const breathBob = Math.sin(time * 2.2 + seed) * 0.28 * sMul;
          const bodyLift = state.z + clamp(bodyBounce.x * 0.12, -1.6, 1.6) + breathBob;
          const bx = state.x + state.tiltX;
          const by = state.y + state.tiltY;
          const ha = computeHeadAndAntlerWorld(bx, by, bodyLift, state.yaw, hRel, antlerSway, sMul);

          // 5. 角杈 2 只小鸟随青白音环蹦跳抖羽
          const hopWaveA = state.chimeActive ? Math.abs(Math.sin(time * 6.4 * freq)) : 0;
          const hopWaveB = state.chimeActive ? Math.abs(Math.sin(time * 6.4 * freq + 1.55)) : 0;
          state.birdHopA = state.chimeActive && hopWaveA > 0.48;
          state.birdHopB = state.chimeActive && hopWaveB > 0.48;

          birdSprings[0].update(dt, ha.perchL.x, ha.perchL.y, ha.perchL.z + hopWaveA * 2.4 * sMul, 115 * sp, clamp(6.8 * dScale, 3.2, 11.0));
          birdSprings[1].update(dt, ha.perchR.x, ha.perchR.y, ha.perchR.z + hopWaveB * 2.4 * sMul, 115 * sp, clamp(6.8 * dScale, 3.2, 11.0));

          // 6. 微风吹过空心角发出柔和扩散青白音环 + 音符微粒 + 涟漪
          if (state.chimeActive) {
            state.chimeCd -= dt;
            if (state.chimeCd <= 0) {
              state.chimeCd = (action === 'chime' ? 0.42 : 0.62) / Math.max(0.65, freq);
              const cr = chimeRings[state.chimeSeq % chimeRings.length];
              state.chimeSeq++;
              const side = (state.chimeSeq & 1) === 0 ? -1 : 1;
              const emitPt = side < 0 ? ha.perchL : ha.perchR;
              const emitAng = ha.aYaw + side * 0.72 + (Math.random() - 0.5) * 0.4;
              cr.active = true;
              cr.t = 0;
              cr.life = 1.9;
              cr.x = emitPt.x;
              cr.y = emitPt.y;
              cr.z = emitPt.z + 1.5 * sMul;
              cr.vx = Math.cos(emitAng) * 5.6 * sMul;
              cr.vy = Math.sin(emitAng) * 5.6 * sMul;
              cr.vz = (5.8 + (state.chimeSeq & 1) * 1.4) * sMul;
              cr.spin = emitAng;

              if (vfx) {
                vfx.addRipple(state.x, state.y, 4.2 * sMul, 20.5 * sMul, 0.85, 1.5);
                for (let k = 0; k < 3; k++) {
                  const pa = emitAng + (k - 1) * 0.85;
                  vfx.spawnParticle(
                    emitPt.x, emitPt.y, emitPt.z + 2.0 * sMul,
                    Math.cos(pa) * 7.2 * sMul, Math.sin(pa) * 7.2 * sMul, (6.5 + k * 2.0) * sMul,
                    0.95, 1.35, k === 1 ? fx.chimeB : fx.chimeA, true, -2
                  );
                }
              }
            }
          }

          for (const cr of chimeRings) {
            if (!cr.active) continue;
            cr.t += dt;
            if (cr.t >= cr.life) { cr.active = false; continue; }
            cr.x += (cr.vx + Math.sin(time * 4.2 + cr.idx * 1.5) * 2.2 * sMul) * dt;
            cr.y += (cr.vy + Math.cos(time * 3.8 + cr.idx * 1.5) * 2.2 * sMul) * dt;
            cr.z += cr.vz * dt;
            cr.spin = wrapAngle(cr.spin + dt * 1.6);
          }

          // 7. 同步 2 个跨个体停靠挂点 mountSockets 与基础 sockets
          syncMountSockets(bx, by, bodyLift, state.yaw, sMul);
          sockets.setWorld('antlerCenter', ha.ax, ha.ay, ha.antlerLift + 10.0 * sMul, ha.aYaw);
          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.0 * sMul }));
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLevel = habitat ? (habitat.waterLevel ?? -99) : -99;
          const calcSub = (z) => EnvFeedback.calcSubmerge(z, waterLevel, 4.6, isWater);

          const yw = state.yaw;
          const breathBob = Math.sin(state.chimePhaseTimer * 2.2 + state.x * 0.05) * 0.25 * sMul;
          const bodyLift = state.z + clamp(bodyBounce.x * 0.12, -1.6, 1.6) + breathBob;
          const bx = state.x + state.tiltX;
          const by = state.y + state.tiltY;

          // 1. 四足纤细弯膝 IK 腿
          for (const leg of gait.legs) {
            const legYaw = leg.anchorYaw ?? yw;
            const hx = leg.hipWX + state.tiltX;
            const hy = leg.hipWY + state.tiltY;
            const hz = leg.hipWZ;
            const kx = leg.kneeX, ky = leg.kneeY, kz = leg.kneeZ;
            const fx = leg.footX, fy = leg.footY, fz = leg.footZ;

            const segs = [
              { k: 'limbUpper', x: lerp(hx, kx, 0.42), y: lerp(hy, ky, 0.42), z: lerp(hz, kz, 0.42), b: -0.52, sym: 90 },
              { k: 'limbKnee',  x: kx, y: ky, z: kz, b: -0.44, sym: 90 },
              { k: 'limbLower', x: lerp(kx, fx, 0.52), y: lerp(ky, fy, 0.52), z: lerp(kz, fz + 1.5 * sMul, 0.52), b: -0.36, sym: 90 },
              { k: 'hoof',      x: fx, y: fy, z: fz, b: -0.28, sym: 0 }
            ];
            for (const pt of segs) {
              const item = {
                partKey: pt.k,
                asset: parts[pt.k],
                x: pt.x,
                y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === 'hoof' ? 0 : 2.0 * sMul)),
                ro: legYaw,
                bias: pt.b,
                submerge: calcSub(pt.z + 0.8)
              };
              if (pt.sym) item.symDeg = pt.sym;
              list.push(item);
            }
          }

          // 2. 独立腰胯躯干 + 翘起短尾
          const [pJointX, pJointY] = localToWorldXY(bx, by, yw, 0, -4.0 * sMul);
          const [pelvisCX, pelvisCY] = pivotToWorldXY(pJointX, pJointY, state.pelvisYaw, PELVIS_PIVOT.x * sMul, PELVIS_PIVOT.y * sMul);
          list.push({
            partKey: 'pelvis',
            asset: parts.pelvis,
            x: pelvisCX,
            y: pelvisCY,
            lift: bodyLift + 0.2 * sMul + state.rearBob * 0.7,
            ro: state.pelvisYaw,
            bias: 0.16,
            submerge: calcSub(bodyLift + 1.5)
          });

          const tailYaw = wrapAngle(state.pelvisYaw + clamp(tailWagSpring.x, -0.75, 0.75));
          const [tjx, tjy] = localToWorldXY(pelvisCX, pelvisCY, state.pelvisYaw, 0, -6.2 * sMul);
          const [tx, ty] = pivotToWorldXY(tjx, tjy, tailYaw, TAIL_PIVOT.x * sMul, TAIL_PIVOT.y * sMul);
          list.push({
            partKey: 'tail',
            asset: parts.tail,
            x: tx,
            y: ty,
            lift: bodyLift + 5.4 * sMul,
            ro: tailYaw,
            bias: 0.08
          });

          // 3. 优雅胸肩躯干
          list.push({
            partKey: 'chest',
            asset: parts.chest,
            x: bx,
            y: by,
            lift: bodyLift + state.frontBob * 0.7,
            ro: yw,
            bias: 0.40,
            submerge: calcSub(bodyLift + 1.5)
          });

          // 4. 修长颈部 + 精致瞪羚首 + 极度夸张多叉空心树角
          const ha = computeHeadAndAntlerWorld(bx, by, bodyLift, yw, headYawSpring.x, antlerSwaySpring.x, sMul);
          list.push({
            partKey: 'neck',
            asset: parts.neck,
            x: ha.nx,
            y: ha.ny,
            lift: ha.neckLift,
            ro: ha.nYaw,
            bias: 0.65
          });
          list.push({
            partKey: 'head',
            asset: parts.head,
            x: ha.hx,
            y: ha.hy,
            lift: ha.headLift,
            ro: ha.hYaw,
            bias: 0.85
          });
          list.push({
            partKey: 'antlerCrown',
            asset: parts.antlerCrown,
            x: ha.ax,
            y: ha.ay,
            lift: ha.antlerLift,
            ro: ha.aYaw,
            bias: 1.05
          });

          // 5. 角杈间 2 只高对比鲜蓝 / 明黄小鸟（随音环蹦跳抖羽）
          const bAKey = state.birdHopA ? 'birdAHop' : 'birdARest';
          const bBKey = state.birdHopB ? 'birdBHop' : 'birdBRest';
          list.push({
            partKey: bAKey,
            asset: parts[bAKey],
            x: birdSprings[0].x,
            y: birdSprings[0].y,
            lift: Math.max(8.0, birdSprings[0].z - 0.8 * sMul),
            ro: wrapAngle(ha.aYaw + (state.birdHopA ? 0.35 : -0.22)),
            bias: 1.20
          });
          list.push({
            partKey: bBKey,
            asset: parts[bBKey],
            x: birdSprings[1].x,
            y: birdSprings[1].y,
            lift: Math.max(8.0, birdSprings[1].z - 0.8 * sMul),
            ro: wrapAngle(ha.aYaw + (state.birdHopB ? -0.35 : 0.25)),
            bias: 1.20
          });

          // 6. 柔和扩散青白音环（半透明用 opacity）
          for (const cr of chimeRings) {
            if (!cr.active) continue;
            const u = clamp(cr.t / cr.life, 0, 1);
            const fade = smoothstep(0, 0.16, u) * (1 - smoothstep(0.58, 1.0, u));
            if (fade <= 0.04) continue;
            const rKey = cr.large ? 'chimeRingLarge' : 'chimeRingSmall';
            list.push({
              partKey: rKey,
              asset: parts[rKey],
              x: cr.x,
              y: cr.y,
              lift: cr.z,
              ro: cr.spin,
              symDeg: 90,
              opacity: clamp(fade * 0.86, 0.08, 0.86),
              bias: 1.38
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Earth4Def.id,
            code: Earth4Def.code,
            name: Earth4Def.name,
            status: Earth4Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            chimeActive: state.chimeActive,
            mountSocketCount: mountSockets.length,
            footRadius: Earth4Def.footRadius,
            headZ: 40,
            centerZ: 14,
            blocks: Earth4Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(homeX0, homeY0, homeYaw0);
      return instance;
    }
  };

  PW.Creatures.push(Earth4Def);
})(window.PixelWorkshop);
