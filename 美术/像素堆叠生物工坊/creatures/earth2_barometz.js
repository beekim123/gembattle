'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, fbm1 } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 地2 · 植物羊（鞑靼植物羊 · M10 扎根弯茎 + 末端小羊啃草）
  //
  // 1. 俯视 ×4 强色差与特征放大：
  //    - 宽大亮翠叶盘（26×26×7，fresh/wilt 两档无损切换）：高明度亮翠叶片配嫩黄叶心，
  //      在深绿草坪上一眼清晰；草啃完后切为暖黄微萎叶盘，休养后恢复鲜绿。
  //    - 粗壮弯曲绿茎（链式 5 节，fresh/wilt 两档）：从叶盘中心拱弯连至小羊腹下，
  //      高重叠无缝衔接，随小羊绕盘画圆啃草自然弯曲伸展。
  //    - 雪白蓬松、放大圆润的毛茸茸小羊（16×20×14）+ 独立双态羊头（抬头/低头啃草）
  //      + 粉红软耳（独立弹簧抖耳）+ 圆蓬小毛尾（欢快摇摆）+ 4 条黑亮小蹄。
  //    - 环绕叶盘生长的 6 簇嫩草（被小羊逐簇啃掉消失，全啃完触发微萎休养再长回）。
  // 2. 严守硬线：单怪 32 色（≤ 48 色、0 重色）、零常态 scaleX/scaleY 拉伸、
  //    扎根原地且小羊绕茎严格在 maxRadius * 0.80 内、0 禁用字。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 宽大亮翠叶盘与鲜绿嫩茎（高明度亮翠，在深草坪上强对比）
      leafDark:   '#1e6b32',
      leafMid:    '#3bb54a',
      leafHi:     '#80eb67',
      // 亮翠叶脉与嫩黄叶心
      veinDark:   '#599926',
      veinMid:    '#98d63e',
      veinHi:     '#d9fa70',
      // 草啃完后微萎的暖黄枯叶与暖黄茎
      wiltDark:   '#806520',
      wiltMid:    '#c29c34',
      wiltHi:     '#f0d465',
      // 根部泥土与草根座
      soilDark:   '#3b281c',
      soilMid:    '#61422e',
      soilHi:     '#8c6247',
      // 雪白蓬松小羊卷毛（高明度雪白，与深绿草坪形成超强反差）
      woolDark:   '#b8c2cc',
      woolMid:    '#e6edf5',
      woolHi:     '#ffffff',
      // 小羊暖米脸面与吻部绒毛
      faceDark:   '#c9a896',
      faceMid:    '#edd0bd',
      faceHi:     '#fff0e3',
      // 粉红软耳与粉嫩小鼻尖
      pinkDark:   '#c45472',
      pinkMid:    '#f285a2',
      pinkHi:     '#ffc2d4',
      // 黑亮小蹄与细腿端
      hoofDark:   '#14151c',
      hoofMid:    '#2a2c38',
      hoofHi:     '#4c5063',
      // 小羊纯黑圆眼与亮白眼点（eyeGlint 绝不进 glowKeys）
      eyeDark:    '#0f0c12',
      eyeGlint:   '#f5fcff',
      // 环绕叶盘的可啃嫩草与小花点缀
      grassDark:  '#247a2f',
      grassMid:   '#4ec94b',
      grassHi:    '#9ef578',
      blossomMid: '#ffdb4d',
      blossomHi:  '#fff7b2'
    },
    glowKeys: [],
    parts: [
      'leaf', 'vein', 'wilt', 'soil',
      'wool', 'face', 'pink', 'hoof', 'eye',
      'grass', 'blossom'
    ],
    noCrease: [
      ['leaf', 'vein'], ['leaf', 'soil'], ['wilt', 'soil'],
      ['wool', 'face'], ['wool', 'pink'], ['face', 'pink'],
      ['face', 'eye'], ['wool', 'hoof'], ['grass', 'blossom']
    ],
    materials: {
      leaf:  ['leafDark',  'leafMid',  'leafHi'],
      vein:  ['veinDark',  'veinMid',  'veinHi'],
      wilt:  ['wiltDark',  'wiltMid',  'wiltHi'],
      soil:  ['soilDark',  'soilMid',  'soilHi'],
      wool:  ['woolDark',  'woolMid',  'woolHi'],
      face:  ['faceDark',  'faceMid',  'faceHi'],
      pink:  ['pinkDark',  'pinkMid',  'pinkHi'],
      hoof:  ['hoofDark',  'hoofMid',  'hoofHi'],
      grass: ['grassDark', 'grassMid', 'grassHi']
    },
    protectedParts: ['eye', 'pink', 'blossom']
  });

  // 3 套零重建模换色皮肤（雪白羊、暖金绒羊、粉花绒羊；0 禁用字）
  const SKINS = [
    {
      id: 'snow_white',
      name: '雪白羊',
      dot: '#ffffff',
      outline: '#121c14',
      pal: {},
      fx: {
        grass: '#70e058',
        leaf:  '#3bb54a',
        wilt:  '#e8c448',
        puff:  '#f2f7fc'
      }
    },
    {
      id: 'warm_gold',
      name: '暖金绒羊',
      dot: '#ffd166',
      outline: '#1f160c',
      pal: {
        woolDark:   '#b88939', woolMid:   '#f0c265', woolHi:   '#fff0b3',
        faceDark:   '#ab7957', faceMid:   '#dba67f', faceHi:   '#fae0c5',
        pinkDark:   '#bf5c43', pinkMid:   '#f08e73', pinkHi:   '#ffc7b5',
        leafDark:   '#286122', leafMid:   '#4ca336', leafHi:   '#8ce05a',
        veinDark:   '#6b9424', veinMid:   '#add13f', veinHi:   '#e8fa78',
        hoofDark:   '#241812', hoofMid:   '#452f23', hoofHi:   '#6e4e3d',
        blossomMid: '#ff8a5c', blossomHi: '#ffd1b8'
      },
      fx: {
        grass: '#80d455',
        leaf:  '#4ca336',
        wilt:  '#e8b948',
        puff:  '#fff0b3'
      }
    },
    {
      id: 'blossom_pink',
      name: '粉花绒羊',
      dot: '#ff9ec2',
      outline: '#1c1018',
      pal: {
        woolDark:   '#b87894', woolMid:   '#f2b3cc', woolHi:   '#ffe8f2',
        faceDark:   '#bd8c94', faceMid:   '#e8bdc4', faceHi:   '#ffedf0',
        pinkDark:   '#a82f5c', pinkMid:   '#e65c8c', pinkHi:   '#ff9ec0',
        leafDark:   '#17634d', leafMid:   '#2ca880', leafHi:   '#6ee8b8',
        veinDark:   '#3f9466', veinMid:   '#78d49c', veinHi:   '#befad4',
        hoofDark:   '#241421', hoofMid:   '#42273e', hoofHi:   '#6b4466',
        blossomMid: '#fff078', blossomHi: '#fffcd4'
      },
      fx: {
        grass: '#59d999',
        leaf:  '#2ca880',
        wilt:  '#e0c460',
        puff:  '#ffe3ee'
      }
    }
  ];

  // =========================================================================
  // 1. 宽大亮翠叶盘（26×26×7，fresh 鲜绿 / wilt 暖黄微萎两档无损切换）
  //    6 片宽大外展莲座状叶片 + 中央厚实茎基座
  // =========================================================================
  function buildLeafDisk(makeCanvas, isWilt) {
    const W = 26, D = 26, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const mainMat = isWilt ? 'wilt' : 'leaf';
    const mainPart = isWilt ? partId.wilt : partId.leaf;
    const veinMat = isWilt ? 'wilt' : 'vein';
    const veinPart = isWilt ? partId.wilt : partId.vein;

    // 扎根泥土小丘与茎基托盘
    m.paintEllipsoid(0, 0, 1.4, 5.2, 5.2, 1.6, mat('soil'), partId.soil, true);
    m.paintEllipsoid(0, 0, 2.8, 3.6, 3.6, 2.0, mat(mainMat), mainPart, true);

    // 6 片宽大亮翠外展叶瓣（微萎态略微下垂收拢）
    const leafCount = 6;
    for (let i = 0; i < leafCount; i++) {
      const ang = (i / leafCount) * TAU + 0.25;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const midR = isWilt ? 6.2 : 6.8;
      const tipR = isWilt ? 10.2 : 11.4;
      const midZ = isWilt ? 2.1 : 3.2;
      const tipZ = isWilt ? 1.1 : 2.3;

      // 宽厚叶片主体（双胶囊叠成宽匙形叶片）
      m.paintCapsule(ca * 2.4, sa * 2.4, 2.2, ca * midR, sa * midR, midZ, 2.4, 3.1, mat(mainMat), mainPart, true);
      m.paintCapsule(ca * midR, sa * midR, midZ, ca * tipR, sa * tipR, tipZ, 2.8, 1.2, mat(mainMat), mainPart, true);

      // 叶片中央醒目嫩黄亮叶脉（在深绿草坪上极大增强层次感）
      m.paintCapsule(ca * 2.2, sa * 2.2, 3.2, ca * (tipR - 1.4), sa * (tipR - 1.4), tipZ + 1.0, 0.95, 0.55, mat(veinMat), veinPart, true);
    }

    // 中央厚实茎领口，保证第 1 节弯曲绿茎深嵌不露缝
    m.paintCapsule(0, 0, 2.2, 0, 0, 5.6, 2.35, 1.95, mat(mainMat), mainPart, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 11.5, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 2. 粗壮弯曲绿茎体素节（7×7×7，fresh / wilt 两档，带小嫩叶芽）
  // =========================================================================
  function buildStemSeg(makeCanvas, isWilt, withBud) {
    const m = new VoxelModel(7, 7, 7, SPEC);
    const { mat, partId } = SPEC;
    const mk = isWilt ? 'wilt' : 'leaf';
    const pk = isWilt ? partId.wilt : partId.leaf;
    const vk = isWilt ? 'wilt' : 'vein';
    const vpk = isWilt ? partId.wilt : partId.vein;

    // 饱满粗壮茎节（高重叠排布无断节）
    m.paintEllipsoid(0, 0, 3.0, 2.15, 2.15, 2.25, mat(mk), pk, true);
    // 顶部亮脉纹
    m.paintEllipsoid(0, 0, 4.4, 1.1, 1.1, 0.75, mat(vk), vpk, true);
    if (withBud) {
      m.paintCapsule(1.2, 0.2, 3.2, 2.8, 0.6, 4.5, 0.85, 0.52, mat(vk), vpk, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.4, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 3. 雪白蓬松、放大圆润的毛茸茸小羊身（16×20×14）
  //    云朵般团簇卷毛轮廓 + 腹底一小圈绿叶萼托（体现「植物长出小羊」的奇幻连接！）
  // =========================================================================
  function buildLambBody(makeCanvas) {
    const W = 16, D = 20, H = 14;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 多团圆润卷毛球融合，雕出蓬松饱满的大羊身
    const puffs = [
      [ 0.0,  0.0, 6.8, 6.2, 7.6, 5.2],
      [-3.8,  2.6, 7.0, 3.8, 4.2, 3.8],
      [ 3.8,  2.6, 7.0, 3.8, 4.2, 3.8],
      [-3.9, -2.8, 6.9, 3.9, 4.2, 3.7],
      [ 3.9, -2.8, 6.9, 3.9, 4.2, 3.7],
      [ 0.0,  5.6, 7.6, 4.6, 3.8, 3.9],
      [ 0.0, -5.6, 7.0, 4.5, 3.8, 3.8],
      [ 0.0,  0.2, 9.6, 4.8, 5.8, 3.1]
    ];

    m.fillAABB(-7.5, 7.5, -9.5, 9.5, 1, H - 1, (x, y, z, X, Y) => {
      let d = 99;
      for (let i = 0; i < puffs.length; i++) {
        const [px, py, pz, rx, ry, rz] = puffs[i];
        const di = (Math.hypot((X - px) / rx, (Y - py) / ry, (z - pz) / rz) - 1.0) * Math.min(rx, ry, rz);
        d = i === 0 ? di : smin(d, di, 1.35);
      }
      // 柔和卷毛起伏
      const curl = Math.sin(X * 1.05 + Y * 0.85) * 0.28 + Math.cos(Y * 1.15 - z * 0.9) * 0.24;
      if (d <= curl) {
        // 腹心正中一小圈翠绿花萼托（绿茎接入小羊肚皮的奇妙植物特征）
        const isCalyx = z <= 3.2 && Math.hypot(X, Y + 0.5) < 3.4;
        m.setRaw(x, y, z, isCalyx ? mat('leaf') : mat('wool'), isCalyx ? partId.leaf : partId.wool);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.4, headZ: 13, centerZ: 7 });
  }

  // =========================================================================
  // 4. 独立小羊头（2 档无损烘焙：up 抬头张望 / graze 低头啃草）
  //    尺寸 12×15×12，枢轴锁在后颈 (0, -3.2)
  //    顶着蓬松雪白额毛、暖米脸颊、粉嫩小鼻、纯黑圆眼 + 亮白眼点
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -3.2 };
  function buildLambHead(makeCanvas, pose) {
    const isGraze = pose === 'graze';
    const W = 12, D = 15, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    const faceZ = isGraze ? 4.4 : 6.0;
    const snoutY = isGraze ? 4.4 : 4.8;
    const snoutZ = isGraze ? 2.6 : 5.2;

    // 颈根毛领（深嵌进羊胸前，低头抬头绝不露缝）
    m.paintEllipsoid(0, -2.6, faceZ + (isGraze ? 1.4 : -0.4), 3.3, 3.0, 3.2, mat('wool'), partId.wool, true);
    // 圆润暖米脸颊 + 俏皮小羊吻
    m.paintEllipsoid(0, 1.2, faceZ, 3.5, 3.8, 3.4, mat('face'), partId.face, true);
    m.paintEllipsoid(0, snoutY, snoutZ, 2.35, 2.2, 2.0, mat('face'), partId.face, true);
    // 粉嫩小鼻尖（俯视超可爱！）
    m.paintEllipsoid(0, snoutY + 1.8, snoutZ + 0.3, 1.15, 0.85, 0.82, mat('pink'), partId.pink, true);

    // 头顶一大蓬雪白卷毛刘海（放大辨识度）
    m.paintEllipsoid(0, -0.2, faceZ + 3.0, 3.8, 3.8, 2.4, mat('wool'), partId.wool, true);
    m.paintEllipsoid(-1.8, 1.0, faceZ + 2.7, 2.1, 2.1, 1.7, mat('wool'), partId.wool, true);
    m.paintEllipsoid( 1.8, 1.0, faceZ + 2.7, 2.1, 2.1, 1.7, mat('wool'), partId.wool, true);

    m.despeckle();
    m.applyArtShading(true);

    // 两侧清晰纯黑大圆眼 + 亮白眼点（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.8);
    const eyeZ = Math.round(faceZ + (isGraze ? -0.3 : 0.4));
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 5; step++) {
        const tx = Math.round(hw + s * (4.2 - step));
        const p = m.getPartId(tx, eyeY, eyeZ);
        if (p === partId.face || p === partId.wool) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 2.8);
      m.setRaw(sx, eyeY,     eyeZ,     keyToId.eyeDark,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ,     keyToId.eyeDark,  partId.eye);
      m.setRaw(sx, eyeY,     eyeZ + 1, keyToId.eyeDark,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 4.4, headZ: 11, centerZ: 6 });
  }

  // =========================================================================
  // 5. 粉红软耳（独立弹簧抖耳）、圆蓬小毛尾、黑亮小蹄、可啃嫩草簇
  // =========================================================================
  const EAR_PIVOT = { x: 0, y: 0 };
  function buildLambEar(makeCanvas) {
    const m = new VoxelModel(7, 7, 5, SPEC);
    const { mat, partId } = SPEC;
    // 外展下垂的粉红软耳（白绒耳根 + 粉嫩大耳片，俯视极清晰！）
    m.paintEllipsoid(0, 0, 2.6, 1.3, 1.3, 1.2, mat('wool'), partId.wool, true);
    m.paintCapsule(0, 0, 2.5, 2.6, -0.4, 1.4, 1.4, 1.15, mat('pink'), partId.pink, true);
    m.paintEllipsoid(2.2, -0.4, 1.5, 1.45, 1.25, 0.95, mat('pink'), partId.pink, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.4 });
  }

  const TAIL_PIVOT = { x: 0, y: 2.2 };
  function buildLambTail(makeCanvas) {
    const m = new VoxelModel(6, 7, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 2.0, 3.0, 0, -1.6, 2.6, 1.6, 2.0, mat('wool'), partId.wool, true);
    m.paintEllipsoid(0, -1.5, 2.8, 2.1, 2.1, 1.9, mat('wool'), partId.wool, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2 });
  }

  function buildLambHoof(makeCanvas) {
    const m = new VoxelModel(5, 5, 6, SPEC);
    const { mat, partId } = SPEC;
    // 上段雪白绒腿根（深嵌羊腹）+ 下段黑亮小蹄
    m.paintCapsule(0, 0, 3.2, 0, 0, 5.2, 1.35, 1.55, mat('wool'), partId.wool, true);
    m.paintCapsule(0, 0, 0.8, 0, 0.2, 3.4, 1.38, 1.18, mat('hoof'), partId.hoof, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.5, headZ: 5, centerZ: 2 });
  }

  function buildGrassTuft(makeCanvas) {
    const m = new VoxelModel(6, 6, 6, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const blades = [
      [ 0.0,  0.0, 5.0],
      [-1.8,  1.2, 4.2],
      [ 1.8,  1.0, 4.0],
      [-1.2, -1.7, 3.8],
      [ 1.6, -1.5, 4.3]
    ];
    for (const [bx, by, bz] of blades) {
      m.paintCapsule(bx * 0.25, by * 0.25, 0.7, bx, by, bz, 0.78, 0.45, mat('grass'), partId.grass, true);
    }
    // 顶部点缀一朵明黄小花，啃掉时超有成就感
    m.paintEllipsoid(0, 0, 4.8, 1.05, 1.05, 0.85, keyToId.blossomMid, partId.blossom, true);
    m.setRaw(3, 3, 5, keyToId.blossomHi, partId.blossom);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 5, centerZ: 2 });
  }

  // 小羊 4 条黑亮小蹄局部排布
  const LAMB_LEGS_CFG = [
    { id: 'FL', lx: -3.2, ly:  3.6, phaseOff: 0.00 },
    { id: 'FR', lx:  3.2, ly:  3.6, phaseOff: 0.50 },
    { id: 'BL', lx: -3.2, ly: -3.6, phaseOff: 0.50 },
    { id: 'BR', lx:  3.2, ly: -3.6, phaseOff: 0.00 }
  ];

  // 环绕叶盘生长的 6 簇嫩草角度
  const TUFT_COUNT = 6;
  const ORBIT_R = 13.8; // 小羊绕叶盘画圆啃草半径（远小于 maxRadius * 0.80）

  const Earth2Def = {
    id: 'earth2_barometz',
    code: '地2',
    name: '植物羊',
    status: 'done',
    tag: 'M10 扎根弯茎 · 雪白小羊绕茎啃草',
    summary: '宽大亮翠叶盘扎根原地，5 节粗壮弯曲绿茎末端连着雪白蓬松、放大圆润的毛茸茸小羊（粉红软耳 + 黑亮小蹄）；小羊绕茎画圆低头啃草、摇尾抖耳，草啃完后茎叶略泛暖黄微萎再恢复鲜绿循环',
    defaultHabitat: 'forest',
    footRadius: 15.0,
    ecoWeight: 0.9,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '绕茎啃草循环', loop: true, status: 'done' },
      { id: 'idle',   name: '原地抬头摇耳', loop: true, status: 'done' },
      { id: 'graze',  name: '专注低头啃草', loop: true, status: 'done' }
    ],
    blocks: [
      '宽大亮翠/暖黄双态扎根叶盘',
      '5 节链式弯曲绿茎（鲜绿/微萎双态）',
      '雪白蓬松放大圆润羊身 + 双态羊头',
      '粉红软耳独立抖动 + 圆蓬小毛尾摇摆',
      '4 条黑亮小蹄绕茎步态 + 6 簇嫩草啃食再生循环'
    ],
    soulHabit: '叶盘扎根原地，雪白小羊顺着弯曲绿茎绕叶盘画圆逐簇啃草，啃草时欢快摇尾抖耳、碎草飞溅；6 簇嫩草全啃完后茎叶略泛暖黄微萎休养，不久嫩草再冒出、茎叶恢复鲜绿开启新一轮循环',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        leafDiskFresh: buildLeafDisk(makeCanvas, false),
        leafDiskWilt:  buildLeafDisk(makeCanvas, true),
        stemSegFresh:  buildStemSeg(makeCanvas, false, false),
        stemBudFresh:  buildStemSeg(makeCanvas, false, true),
        stemSegWilt:   buildStemSeg(makeCanvas, true, false),
        lambBody:      buildLambBody(makeCanvas),
        lambHeadUp:    buildLambHead(makeCanvas, 'up'),
        lambHeadGraze: buildLambHead(makeCanvas, 'graze'),
        lambEar:       buildLambEar(makeCanvas),
        lambTail:      buildLambTail(makeCanvas),
        lambHoof:      buildLambHoof(makeCanvas),
        grassTuft:     buildGrassTuft(makeCanvas)
      };

      const tailWagSpring = new SpringDamper1D(0, 95, 5.4);
      const earTwitchSpring = new SpringDamper1D(0, 115, 6.0);
      const headYawSpring = new SpringDamper1D(0, 72, 6.8);
      const chewBobSpring = new SpringDamper1D(0, 125, 7.2);
      const stemSwaySpring = new SpringDamper1D(0, 34, 4.2);

      const tufts = Array.from({ length: TUFT_COUNT }, (_, i) => ({
        idx: i,
        ang: (i / TUFT_COUNT) * TAU + 0.52,
        eaten: false,
        regrowT: 1.0
      }));

      // 5 节链式弯曲绿茎实时世界节点
      const stemNodes = Array.from({ length: 5 }, () => ({ x: 0, y: 0, z: 3, yaw: 0 }));

      const homeX0 = opts.homeX ?? 0;
      const homeY0 = opts.homeY ?? 0;
      const homeYaw0 = opts.homeYaw ?? 0;
      const seed = opts.seed ?? 22;

      const state = {
        x: homeX0,
        y: homeY0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: homeYaw0,
        // 小羊绕茎状态
        orbitAng: homeYaw0 + 0.52,
        targetTuftIdx: 0,
        lambX: homeX0 + ORBIT_R,
        lambY: homeY0,
        lambZ: 4.4,
        lambYaw: homeYaw0 + Math.PI * 0.5,
        gaitPhase: 0,
        // 生态循环阶段：walk -> graze -> wilt -> recover
        stage: 'graze',
        stageTimer: 1.8,
        isWilt: false,
        headPose: 'graze',
        chewClock: 0,
        earCd: 0.9,
        seed
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function emitGrazeBits(vfx, wx, wy, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        for (let k = 0; k < 5; k++) {
          const a = Math.random() * TAU;
          const spd = (5.0 + Math.random() * 7.5) * sMul;
          vfx.spawnParticle(
            wx + (Math.random() - 0.5) * 2.4 * sMul,
            wy + (Math.random() - 0.5) * 2.4 * sMul,
            2.2 * sMul,
            Math.cos(a) * spd, Math.sin(a) * spd, (5.5 + Math.random() * 5.5) * sMul,
            0.42 + Math.random() * 0.25, 1.2 + Math.random() * 0.4,
            k % 2 === 0 ? fx.grass : fx.leaf, false, 26
          );
        }
      }

      function emitRecoverMist(vfx, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        vfx.addRipple(state.x, state.y, 4.0 * sMul, 18.0 * sMul, 0.75, 1.6);
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * TAU;
          vfx.spawnParticle(
            state.x + Math.cos(a) * 8.5 * sMul,
            state.y + Math.sin(a) * 8.5 * sMul,
            2.5 * sMul,
            Math.cos(a) * 4.5 * sMul, Math.sin(a) * 4.5 * sMul, (6.5 + Math.random() * 4.0) * sMul,
            0.65, 1.35, fx.grass, false, 12
          );
        }
      }

      function updateStemNodes(time, sMul) {
        // 5 节链式弯曲绿茎：从叶盘中心 (state.x, state.y, 3.8) 优雅拱弯连至小羊腹心 (lambX, lambY, lambZ + 1.2)
        const rX = state.x, rY = state.y, rZ = 3.8 * sMul;
        const eX = state.lambX, eY = state.lambY, eZ = state.lambZ + 1.4 * sMul;
        const dx = eX - rX, dy = eY - rY;
        const len = Math.hypot(dx, dy) || 0.01;
        const nx = -dy / len, ny = dx / len;
        const baseYaw = Math.atan2(-dx, dy);
        const sway = stemSwaySpring.x;
        const archH = (state.isWilt ? 2.6 : 5.4) * sMul;

        for (let i = 0; i < stemNodes.length; i++) {
          const u = (i + 0.65) / (stemNodes.length + 0.35);
          const sideCurve = Math.sin(u * Math.PI) * (2.6 + sway * 1.8) * sMul;
          const archZ = Math.sin(u * Math.PI) * archH;
          stemNodes[i].x = lerp(rX, eX, u) + nx * sideCurve;
          stemNodes[i].y = lerp(rY, eY, u) + ny * sideCurve;
          stemNodes[i].z = lerp(rZ, eZ, u) + archZ;
          stemNodes[i].yaw = wrapAngle(baseYaw + Math.cos(u * Math.PI) * 0.25);
        }
      }

      const instance = {
        def: Earth2Def,
        cachePrefix: `earth2_bmz_${Math.random().toString(36).slice(2, 7)}`,
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
          const sMul = instance.scaleMul || 1.0;
          state.x = homeX;
          state.y = homeY;
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw ?? 0;
          state.orbitAng = state.yaw + 0.52;
          state.targetTuftIdx = 0;
          state.stage = 'graze';
          state.stageTimer = 1.6;
          state.isWilt = false;
          state.headPose = 'graze';
          state.gaitPhase = 0;
          state.chewClock = 0;
          state.earCd = 0.8;

          for (const tf of tufts) { tf.eaten = false; tf.regrowT = 1.0; }
          tailWagSpring.x = tailWagSpring.v = 0;
          earTwitchSpring.x = earTwitchSpring.v = 0;
          headYawSpring.x = headYawSpring.v = 0;
          chewBobSpring.x = chewBobSpring.v = 0;
          stemSwaySpring.x = stemSwaySpring.v = 0;

          state.lambX = homeX + Math.cos(state.orbitAng) * ORBIT_R * sMul;
          state.lambY = homeY + Math.sin(state.orbitAng) * ORBIT_R * sMul;
          state.lambZ = 4.4 * sMul;
          state.lambYaw = wrapAngle(state.orbitAng + Math.PI * 0.5);
          updateStemNodes(0, sMul);
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
          const orbitLimit = Math.min(ORBIT_R * sMul, maxR * 0.72);

          // 1. 叶盘永久扎根原地
          Propulsion.rooted(state, dt, time * 0.5, params, {
            ...(eco || {}),
            homeX: (eco && eco.homeX !== undefined) ? eco.homeX : homeX0,
            homeY: (eco && eco.homeY !== undefined) ? eco.homeY : homeY0,
            homeYaw: (eco && eco.homeYaw !== undefined) ? eco.homeYaw : homeYaw0,
            baseLift: 0
          });
          const baseYaw = (eco && eco.homeYaw !== undefined) ? eco.homeYaw : homeYaw0;
          state.yaw = baseYaw;

          // 2. 动作与生态循环状态机
          const isIdle = action === 'idle';
          const forceGraze = action === 'graze';

          if (isIdle) {
            state.isWilt = false;
            state.headPose = 'up';
            const restAng = state.orbitAng;
            const tx = state.x + Math.cos(restAng) * orbitLimit;
            const ty = state.y + Math.sin(restAng) * orbitLimit;
            state.lambX = lerp(state.lambX, tx, expSmooth(dt, 5.0));
            state.lambY = lerp(state.lambY, ty, expSmooth(dt, 5.0));
            state.lambZ = lerp(state.lambZ, 4.5 * sMul, expSmooth(dt, 6.0));
            const lookYaw = wrapAngle(restAng + Math.PI * 0.5 + Math.sin(time * 0.9) * 0.22);
            state.lambYaw = wrapAngle(state.lambYaw + wrapAngle(lookYaw - state.lambYaw) * expSmooth(dt, 4.2));
          } else {
            state.stageTimer -= dt * spdMul;

            if (state.stage === 'walk') {
              state.isWilt = false;
              state.headPose = 'up';
              const targetTf = tufts[state.targetTuftIdx];
              const diff = wrapAngle(targetTf.ang - state.orbitAng);
              const angSpd = 0.85 * spdMul;
              if (Math.abs(diff) <= angSpd * dt * 1.2 || state.stageTimer <= 0) {
                state.orbitAng = targetTf.ang;
                state.stage = 'graze';
                state.stageTimer = 1.95;
                state.chewClock = 0;
              } else {
                const dir = diff >= 0 ? 1 : -1;
                state.orbitAng = wrapAngle(state.orbitAng + dir * angSpd * dt);
                state.gaitPhase = (state.gaitPhase + dt * 2.8 * freq * spdMul) % 1;
                const moveYaw = wrapAngle(state.orbitAng + (dir > 0 ? Math.PI * 0.5 : -Math.PI * 0.5));
                state.lambYaw = wrapAngle(state.lambYaw + wrapAngle(moveYaw - state.lambYaw) * expSmooth(dt, 7.5));
              }
              const tx = state.x + Math.cos(state.orbitAng) * orbitLimit;
              const ty = state.y + Math.sin(state.orbitAng) * orbitLimit;
              state.lambX = lerp(state.lambX, tx, expSmooth(dt, 9.0));
              state.lambY = lerp(state.lambY, ty, expSmooth(dt, 9.0));
              state.lambZ = lerp(state.lambZ, 4.5 * sMul, expSmooth(dt, 8.0));
            } else if (state.stage === 'graze') {
              state.isWilt = false;
              state.headPose = 'graze';
              // 低头朝向外圈嫩草簇大口啃食
              const outYaw = wrapAngle(state.orbitAng - Math.PI * 0.5 + Math.PI * 0.5);
              // 朝向草簇（外侧略偏切线）
              const grazeYaw = wrapAngle(Math.atan2(-Math.cos(state.orbitAng), Math.sin(state.orbitAng)));
              state.lambYaw = wrapAngle(state.lambYaw + wrapAngle(grazeYaw - state.lambYaw) * expSmooth(dt, 6.5));
              const tx = state.x + Math.cos(state.orbitAng) * orbitLimit;
              const ty = state.y + Math.sin(state.orbitAng) * orbitLimit;
              state.lambX = lerp(state.lambX, tx, expSmooth(dt, 7.0));
              state.lambY = lerp(state.lambY, ty, expSmooth(dt, 7.0));
              state.lambZ = lerp(state.lambZ, 4.1 * sMul, expSmooth(dt, 7.0));

              state.chewClock += dt * freq;
              if (state.chewClock >= 0.42) {
                state.chewClock = 0;
                chewBobSpring.impulse(14.0 * sp);
                const [mx, my] = localToWorldXY(state.lambX, state.lambY, state.lambYaw, 0, 10.5 * sMul);
                emitGrazeBits(vfx, mx, my, sMul);
              }

              if (state.stageTimer <= 0) {
                tufts[state.targetTuftIdx].eaten = true;
                tufts[state.targetTuftIdx].regrowT = 0;
                const remaining = tufts.findIndex(t => !t.eaten);
                if (remaining >= 0) {
                  state.targetTuftIdx = (state.targetTuftIdx + 1) % TUFT_COUNT;
                  while (tufts[state.targetTuftIdx].eaten) {
                    state.targetTuftIdx = (state.targetTuftIdx + 1) % TUFT_COUNT;
                  }
                  state.stage = 'walk';
                  state.stageTimer = 3.2;
                } else if (forceGraze) {
                  // 专注啃草演示：立即再生全部草簇继续绕圈啃
                  for (const tf of tufts) { tf.eaten = false; tf.regrowT = 1.0; }
                  state.targetTuftIdx = (state.targetTuftIdx + 1) % TUFT_COUNT;
                  state.stage = 'walk';
                  state.stageTimer = 3.2;
                } else {
                  // 草全啃完 -> 茎叶略泛暖黄微萎休养！
                  state.stage = 'wilt';
                  state.stageTimer = 3.4;
                  state.isWilt = true;
                }
              }
            } else if (state.stage === 'wilt') {
              // 草啃完后茎叶略泛暖黄微萎，小羊微微伏低贴近叶盘歇息
              state.isWilt = true;
              state.headPose = 'up';
              const restR = orbitLimit * 0.84;
              const tx = state.x + Math.cos(state.orbitAng) * restR;
              const ty = state.y + Math.sin(state.orbitAng) * restR;
              state.lambX = lerp(state.lambX, tx, expSmooth(dt, 3.2));
              state.lambY = lerp(state.lambY, ty, expSmooth(dt, 3.2));
              state.lambZ = lerp(state.lambZ, 3.1 * sMul, expSmooth(dt, 4.0));
              if (state.stageTimer <= 0) {
                state.stage = 'recover';
                state.stageTimer = 1.2;
                state.isWilt = false;
                for (const tf of tufts) { tf.eaten = false; tf.regrowT = 1.0; }
                emitRecoverMist(vfx, sMul);
              }
            } else {
              // recover：叶盘与绿茎恢复鲜绿，小羊精神抖擞抬头抖耳再出发
              state.isWilt = false;
              state.headPose = 'up';
              state.lambZ = lerp(state.lambZ, 4.6 * sMul, expSmooth(dt, 6.5));
              if (state.stageTimer <= 0) {
                state.targetTuftIdx = (state.targetTuftIdx + 1) % TUFT_COUNT;
                state.stage = 'walk';
                state.stageTimer = 3.2;
              }
            }
          }

          // 安全钳制小羊位置不超出 maxRadius * 0.80
          const limR = maxR * 0.78;
          const dOrig = Math.hypot(state.lambX, state.lambY);
          if (dOrig > limR && dOrig > 0.001) {
            state.lambX *= limR / dOrig;
            state.lambY *= limR / dOrig;
          }

          // 3. 弹簧更新：摇尾、抖耳、咀嚼点头、弯曲绿茎微摆
          const wagAmp = state.isWilt ? 0.12 : (state.stage === 'graze' ? 0.68 : 0.42);
          const wagFreq = state.stage === 'graze' ? 9.5 : 5.2;
          tailWagSpring.update(dt, Math.sin(time * wagFreq * freq) * wagAmp * flex, 95 * sp, clamp(5.4 * dScale, 2.8, 9.5));

          state.earCd -= dt;
          if (state.earCd <= 0) {
            state.earCd = state.isWilt ? 2.6 : (1.1 + Math.random() * 1.4);
            earTwitchSpring.impulse((Math.random() < 0.5 ? 1 : -1) * (state.isWilt ? 4.5 : 14.0) * sp);
          }
          earTwitchSpring.update(dt, state.isWilt ? -0.35 : 0.05, 115 * sp, clamp(6.0 * dScale, 3.0, 10.0));

          const targetHeadYaw = state.stage === 'graze'
            ? Math.sin(time * 4.2 * freq) * 0.24
            : Math.sin(time * 1.35 + seed) * 0.36;
          headYawSpring.update(dt, targetHeadYaw, 72 * sp, clamp(6.8 * dScale, 3.2, 10.5));
          chewBobSpring.update(dt, 0, 125 * sp, clamp(7.2 * dScale, 3.5, 11.0));
          stemSwaySpring.update(dt, (fbm1(time * 0.48, seed) - 0.5) * 1.4 * flex, 34 * sp, clamp(4.2 * dScale, 2.2, 7.5));

          updateStemNodes(time, sMul);
          sockets.setWorld('lambCenter', state.lambX, state.lambY, state.lambZ + 6.0 * sMul, state.lambYaw);
          instance.footContacts = [
            { x: state.x, y: state.y, z: 0, r: 9.5 * sMul },
            { x: state.lambX, y: state.lambY, z: 0, r: 6.2 * sMul }
          ];
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLevel = habitat ? (habitat.waterLevel ?? -99) : -99;
          const calcSub = (z) => EnvFeedback.calcSubmerge(z, waterLevel, 4.5, isWater);

          // 1. 宽大亮翠叶盘（fresh / wilt 双态无损切换）
          const diskKey = state.isWilt ? 'leafDiskWilt' : 'leafDiskFresh';
          list.push({
            partKey: diskKey,
            asset: parts[diskKey],
            x: state.x,
            y: state.y,
            lift: 0,
            ro: state.yaw,
            bias: -0.60,
            submerge: calcSub(2.0 * sMul)
          });

          // 2. 环绕叶盘的 6 簇嫩草（未啃食的清晰立于草坪外圈）
          const tuftR = (ORBIT_R + 5.2) * sMul;
          for (const tf of tufts) {
            if (tf.eaten) continue;
            const tx = state.x + Math.cos(tf.ang) * tuftR;
            const ty = state.y + Math.sin(tf.ang) * tuftR;
            list.push({
              partKey: 'grassTuft',
              asset: parts.grassTuft,
              x: tx,
              y: ty,
              lift: 0,
              ro: tf.ang,
              symDeg: 90,
              bias: -0.50,
              submerge: calcSub(1.5 * sMul)
            });
          }

          // 3. 5 节链式弯曲绿茎（fresh / wilt 两档）
          for (let i = 0; i < stemNodes.length; i++) {
            const nd = stemNodes[i];
            const pk = state.isWilt ? 'stemSegWilt' : ((i === 1 || i === 3) ? 'stemBudFresh' : 'stemSegFresh');
            list.push({
              partKey: pk,
              asset: parts[pk],
              x: nd.x,
              y: nd.y,
              lift: Math.max(0.5, nd.z - 2.2 * sMul),
              ro: nd.yaw,
              symDeg: pk === 'stemBudFresh' ? 0 : 90,
              bias: -0.18 + i * 0.03,
              submerge: calcSub(nd.z)
            });
          }

          // 4. 小羊 4 条黑亮小蹄（绕茎画圆小步挪动）
          const lyaw = state.lambYaw;
          const isWalking = state.stage === 'walk';
          const stepBob = isWalking ? Math.abs(Math.sin(state.gaitPhase * TAU)) * 0.55 * sMul : 0;
          const bodyLift = state.lambZ + stepBob;

          for (const lc of LAMB_LEGS_CFG) {
            let fwd = 0, footLift = 0;
            if (isWalking) {
              const phi = (state.gaitPhase + lc.phaseOff) % 1;
              if (phi < 0.42) {
                const u = phi / 0.42;
                fwd = lerp(-1.1, 1.1, smoothstep(0, 1, u));
                footLift = Math.sin(u * Math.PI) * 1.45 * sMul;
              } else {
                const u = (phi - 0.42) / 0.58;
                fwd = lerp(1.1, -1.1, u);
              }
            }
            const [fx, fy] = localToWorldXY(state.lambX, state.lambY, lyaw, lc.lx * sMul, (lc.ly + fwd) * sMul);
            list.push({
              partKey: 'lambHoof',
              asset: parts.lambHoof,
              x: fx,
              y: fy,
              lift: Math.max(0, footLift),
              ro: lyaw,
              symDeg: 90,
              bias: -0.05,
              submerge: calcSub(footLift + 1.0 * sMul)
            });
          }

          // 5. 雪白蓬松圆润小羊身
          list.push({
            partKey: 'lambBody',
            asset: parts.lambBody,
            x: state.lambX,
            y: state.lambY,
            lift: bodyLift,
            ro: lyaw,
            bias: 0.40,
            submerge: calcSub(bodyLift + 2.5 * sMul)
          });

          // 6. 圆蓬小毛尾（欢快摇摆）
          const tailYaw = wrapAngle(lyaw + clamp(tailWagSpring.x, -0.85, 0.85));
          const [tjx, tjy] = localToWorldXY(state.lambX, state.lambY, lyaw, 0, -7.8 * sMul);
          const [tx, ty] = pivotToWorldXY(tjx, tjy, tailYaw, TAIL_PIVOT.x * sMul, TAIL_PIVOT.y * sMul);
          list.push({
            partKey: 'lambTail',
            asset: parts.lambTail,
            x: tx,
            y: ty,
            lift: bodyLift + 5.2 * sMul,
            ro: tailYaw,
            bias: 0.25
          });

          // 7. 独立小羊头（抬头 / 低头啃草两档无损切换 + 咀嚼微点）
          const hRel = clamp(headYawSpring.x, -0.62, 0.62);
          const hYaw = wrapAngle(lyaw + hRel);
          const isGrazeHead = state.headPose === 'graze';
          const chewNod = clamp(chewBobSpring.x * 0.08, -0.5, 1.0);
          const [hjx, hjy] = localToWorldXY(state.lambX, state.lambY, lyaw, 0, (7.6 + (isGrazeHead ? 1.0 : 0)) * sMul);
          const [hx, hy] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const headLift = bodyLift + ((isGrazeHead ? 2.4 : 6.4) - chewNod * 1.1) * sMul;
          const headKey = isGrazeHead ? 'lambHeadGraze' : 'lambHeadUp';
          list.push({
            partKey: headKey,
            asset: parts[headKey],
            x: hx,
            y: hy,
            lift: Math.max(0.5, headLift),
            ro: hYaw,
            bias: 0.78
          });

          // 8. 左右粉红软耳（独立弹簧抖耳，俯视醒目）
          const earTwitch = clamp(earTwitchSpring.x * 0.06, -0.45, 0.55);
          for (const s of [-1, 1]) {
            const earYaw = wrapAngle(hYaw + (s > 0 ? 0 : Math.PI) + s * (0.25 + earTwitch));
            const [ejx, ejy] = localToWorldXY(hx, hy, hYaw, s * 3.6 * sMul, -0.4 * sMul);
            const [ex, ey] = pivotToWorldXY(ejx, ejy, earYaw, EAR_PIVOT.x * sMul, EAR_PIVOT.y * sMul);
            list.push({
              partKey: 'lambEar',
              asset: parts.lambEar,
              x: ex,
              y: ey,
              lift: Math.max(1.5, headLift + (isGrazeHead ? 5.6 : 7.0) * sMul),
              ro: earYaw,
              bias: 0.90
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Earth2Def.id,
            code: Earth2Def.code,
            name: Earth2Def.name,
            status: Earth2Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            stage: state.stage,
            isWilt: state.isWilt,
            footRadius: Earth2Def.footRadius,
            headZ: 18,
            centerZ: 8,
            blocks: Earth2Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(homeX0, homeY0, homeYaw0);
      return instance;
    }
  };

  PW.Creatures.push(Earth2Def);
})(window.PixelWorkshop);
