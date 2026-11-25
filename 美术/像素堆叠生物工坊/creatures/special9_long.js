'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, fbm1 } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { ChainSolver, SpringDamper1D, SpringDamper3D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 特9 · 东方游龙（腾云戏珠长龙 · v3 精制奇观版，+Y 正前）
  //   1. 威严精雕龙头（2 档无损烘焙：headCalm 闭口巡游 / headPlay 微张口戏珠吐云）：
  //      方正长吻、鼻侧卷须根、立体眉骨、清晰 2x2 金瞳（eyeGlint 绝不进 glowKeys）、
  //      头顶分叉鹿角、脑后多层后飘鬃毛与下颌垂髯，pivotToWorldXY 锁死颈枕枢轴；
  //   2. 双条飘逸龙须：左右吻侧各连 5 节纤细弹簧须链，随龙头转向与吐云翻飞；
  //   3. 20 节修长龙躯（5 级拉长胶囊体复用部件 + 尾尖鬃簇，相邻节重叠约 50% 杜绝串珠），
  //      雕出清晰背脊锯齿鳍鬃、暖金横纹腹甲与体侧鳞片色阶；
  //   4. 4 只五趾短龙爪：前左右爪严格锚定 nodes[3]，后左右爪严格锚定 nodes[12]，
  //      空中抓云微摆，任何盘旋半径下 100% 紧贴龙躯零分离；
  //   5. 悬浮「赤金戏珠」与 5 朵伴生立体「祥云团」：巡游 8 字领飞追逐轻顶，
  //      待机（S 键）进入「盘龙戏珠」闭环——大圆三维环绕、周期吐云托珠旋升回落；
  //      切至水域生境自动半潜潜游并激起破水白沫与涟漪。
  // =========================================================================

  // 严格 39 色、零重色（<= 48 色上限），eyeGlint 严禁进 glowKeys
  const SPEC = createPaletteSpec({
    pal: {
      // 主体青碧龙鳞
      scaleDark:     '#104c47',
      scaleMid:      '#1e8476',
      scaleHi:       '#4cc4ab',
      // 背脊深青鳞甲
      backDark:      '#0a3136',
      backMid:       '#15595e',
      backHi:        '#2f8f8c',
      // 暖金腹甲
      bellyDark:     '#a67c32',
      bellyMid:      '#dfb356',
      bellyHi:       '#f7e094',
      // 腹甲横纹凹槽
      bellyBandDark: '#734d19',
      bellyBandMid:  '#9c6c24',
      bellyBandHi:   '#c7943a',
      // 鬃毛 / 背脊锯齿鳍鬃 / 尾尖鬃簇（赤金流鬃）
      maneDark:      '#8c2b14',
      maneMid:       '#d65222',
      maneHi:        '#ff9e47',
      // 分叉鹿角（象牙暖骨）
      hornDark:      '#7d6b52',
      hornMid:       '#bfb091',
      hornHi:        '#ebe1c8',
      // 飘逸龙须（鎏金淡须）
      whiskerDark:   '#a36a1f',
      whiskerMid:    '#e09e38',
      whiskerHi:     '#ffd675',
      // 五趾利爪（玄骨玉趾）
      clawDark:      '#3d342b',
      clawMid:       '#786b5c',
      clawHi:        '#c2b6a3',
      // 清晰 2x2 金瞳（eyeGlint 严禁进 glowKeys）
      eyeDark:       '#0d1217',
      eyeIris:       '#f5bd27',
      eyeGlint:      '#f5fcff',
      // 微张口内腔与龙舌
      mouthDark:     '#57111a',
      mouthMid:      '#9e2230',
      mouthHi:       '#db4d59',
      // 赤金戏珠外旋环纹
      orbRingDark:   '#8f4610',
      orbRingMid:    '#d97a1c',
      orbRingHi:     '#ffbe4f',
      // 伴生立体如意祥云（月白淡青云身 + 鎏金卷边，42 色零重色）
      cloudDark:     '#8aaec4',
      cloudMid:      '#cde2ed',
      cloudHi:       '#eef7fa',
      cloudTrimDark: '#b3832e',
      cloudTrimMid:  '#e8bc54',
      cloudTrimHi:   '#ffeba1',
      // 仅戏珠珠芯进 glowKeys 自亮
      emissiveMid:   '#ff5e1f',
      emissiveHot:   '#ffb838',
      emissiveCore:  '#fff7c7'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'head', 'back', 'belly', 'bellyBand', 'mane', 'horn',
      'whisker', 'claw', 'eye', 'mouth',
      'orbCore', 'orbRing', 'cloud', 'cloudTrim'
    ],
    noCrease: [
      ['head', 'back'], ['head', 'belly'], ['head', 'eye'], ['head', 'mane'],
      ['head', 'horn'], ['head', 'whisker'], ['head', 'mouth'],
      ['back', 'mane'], ['belly', 'bellyBand'],
      ['orbCore', 'orbRing'], ['cloud', 'cloudTrim']
    ],
    materials: {
      scale:     ['scaleDark',     'scaleMid',     'scaleHi'],
      back:      ['backDark',      'backMid',      'backHi'],
      belly:     ['bellyDark',     'bellyMid',     'bellyHi'],
      bellyBand: ['bellyBandDark', 'bellyBandMid', 'bellyBandHi'],
      mane:      ['maneDark',      'maneMid',      'maneHi'],
      horn:      ['hornDark',      'hornMid',      'hornHi'],
      whisker:   ['whiskerDark',   'whiskerMid',   'whiskerHi'],
      claw:      ['clawDark',      'clawMid',      'clawHi'],
      mouth:     ['mouthDark',     'mouthMid',     'mouthHi'],
      orbRing:   ['orbRingDark',   'orbRingMid',   'orbRingHi'],
      cloud:     ['cloudDark',     'cloudMid',     'cloudHi'],
      cloudTrim: ['cloudTrimDark', 'cloudTrimMid', 'cloudTrimHi']
    },
    protectedParts: ['eye', 'orbCore', 'whisker', 'horn']
  });

  // 4 套零重建模换色皮肤（含各自描边与微粒配色）
  const SKINS = [
    {
      id: 'azure_jade',
      name: '青碧游龙（云海经典）',
      dot: '#249c89',
      outline: '#081a19',
      pal: {},
      fx: {
        cloud:  '#e8f4fa',
        breath: '#d9f7ef',
        orb:    '#ffbe45',
        spark:  '#fff2ad',
        foam:   '#dff5ff'
      }
    },
    {
      id: 'crimson_gold',
      name: '赤金应龙（朱霞款）',
      dot: '#d93829',
      outline: '#1c0808',
      pal: {
        scaleDark:     '#731515', scaleMid:      '#c42d25', scaleHi:      '#f5654e',
        backDark:      '#4d0d12', backMid:       '#8c1b1e', backHi:       '#cc3d35',
        bellyDark:     '#ad7d24', bellyMid:      '#ebba49', bellyHi:      '#ffeb96',
        bellyBandDark: '#7a4b12', bellyBandMid:  '#ad6e1d', bellyBandHi:  '#db9c35',
        maneDark:      '#a6580e', maneMid:       '#ed981f', maneHi:       '#ffe266',
        hornDark:      '#6e573e', hornMid:       '#b89c74', hornHi:       '#f0dec0',
        whiskerDark:   '#b86f14', whiskerMid:    '#f5b133', whiskerHi:    '#fff099',
        clawDark:      '#422b21', clawMid:       '#855d47', clawHi:       '#cfa88c',
        eyeIris:       '#ffe042',
        orbRingDark:   '#9e2c14', orbRingMid:    '#e85a2a', orbRingHi:    '#ffab5c',
        cloudDark:     '#bf7c7a', cloudMid:      '#f0b8ad', cloudHi:      '#fce8e1',
        cloudTrimDark: '#b8761a', cloudTrimMid:  '#f0b438', cloudTrimHi:  '#ffe985',
        emissiveMid:   '#ff4219', emissiveHot:   '#ffa82e', emissiveCore: '#fff6c2'
      },
      fx: {
        cloud:  '#fae0da',
        breath: '#ffd6a6',
        orb:    '#ff8833',
        spark:  '#ffeb8a',
        foam:   '#ffe8dc'
      }
    },
    {
      id: 'frost_snow',
      name: '霜白雪龙（寒峰款）',
      dot: '#8cc9e8',
      outline: '#0d1826',
      pal: {
        scaleDark:     '#6d89a3', scaleMid:      '#b2cde3', scaleHi:      '#ebf5fc',
        backDark:      '#385878', backMid:       '#6490b5', backHi:       '#a3cbe8',
        bellyDark:     '#7a9bb5', bellyMid:      '#bed7eb', bellyHi:      '#f0f9ff',
        bellyBandDark: '#4a6b87', bellyBandMid:  '#7297b5', bellyBandHi:  '#a6c7e0',
        maneDark:      '#1e628c', maneMid:       '#3ea3db', maneHi:       '#99e6ff',
        hornDark:      '#4c6e85', hornMid:       '#89b4cc', hornHi:       '#d6effa',
        whiskerDark:   '#3b7da3', whiskerMid:    '#75c2e6', whiskerHi:    '#ccf2ff',
        clawDark:      '#364a5c', clawMid:       '#69859e', clawHi:       '#b5cde0',
        eyeIris:       '#4ce8ff',
        orbRingDark:   '#24638a', orbRingMid:    '#4ca6d9', orbRingHi:    '#a6e8ff',
        cloudDark:     '#2e5478', cloudMid:      '#4f81ad', cloudHi:      '#8cbde0',
        cloudTrimDark: '#9cbcd4', cloudTrimMid:  '#d4eaf7', cloudTrimHi:  '#f7fcff',
        emissiveMid:   '#29b8ff', emissiveHot:   '#85ebff', emissiveCore: '#ebfdff'
      },
      fx: {
        cloud:  '#e8f6ff',
        breath: '#bdeeff',
        orb:    '#66d9ff',
        spark:  '#e0fbff',
        foam:   '#edf8ff'
      }
    },
    {
      id: 'obsidian_thunder',
      name: '玄墨雷龙（雷云款）',
      dot: '#3f5278',
      outline: '#070912',
      pal: {
        scaleDark:     '#161b29', scaleMid:      '#2b354d', scaleHi:      '#4f6082',
        backDark:      '#0e111c', backMid:       '#1f243b', backHi:       '#3c456b',
        bellyDark:     '#3a536b', bellyMid:      '#6487a6', bellyHi:      '#a6c8e0',
        bellyBandDark: '#203142', bellyBandMid:  '#3a5269', bellyBandHi:  '#607e99',
        maneDark:      '#165c78', maneMid:       '#2aa7cf', maneHi:       '#7df0ff',
        hornDark:      '#4c5569', hornMid:       '#8895ad', hornHi:       '#cdd7e8',
        whiskerDark:   '#217491', whiskerMid:    '#47bfe0', whiskerHi:    '#a8f7ff',
        clawDark:      '#2a2f3d', clawMid:       '#5c657a', clawHi:       '#a3adc2',
        eyeIris:       '#5ef2ff',
        orbRingDark:   '#2c4875', orbRingMid:    '#4d7ec4', orbRingHi:    '#99ccff',
        cloudDark:     '#262c40', cloudMid:      '#454e6e', cloudHi:      '#7480a6',
        cloudTrimDark: '#1c7696', cloudTrimMid:  '#42bee0', cloudTrimHi:  '#a6f2ff',
        emissiveMid:   '#24a8ff', emissiveHot:   '#78e8ff', emissiveCore: '#e6fcff'
      },
      fx: {
        cloud:  '#9ba9c4',
        breath: '#7deaff',
        orb:    '#47c8ff',
        spark:  '#d9fbff',
        foam:   '#c4d9f0'
      }
    }
  ];

  // =========================================================================
  // 1. 威严精雕龙头（2 档无损烘焙：headCalm 闭口巡游 / headPlay 微张口戏珠吐云）
  //    基准盒 16x22x16，颈枕枢轴锁在 (0, -4.2)
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -3.4 };

  function buildDragonHead(makeCanvas, pose) {
    const isPlay = pose === 'play';
    const W = 16, D = 22, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 1. 颈枕承托与颅骨主体（后颈深嵌至 -5.6，与颈节 100% 咬合零分离）
    m.paintCapsule(0, -5.6, 5.4, 0, -1.6, 6.2, 3.15, 3.8, mat('scale'), partId.head, true);
    m.paintEllipsoid(0, -0.4, 6.6, 4.3, 4.2, 3.6, mat('scale'), partId.head, true);

    // 2. 方正长吻（沿 +Y 伸展，上吻宽平带鼻梁脊与微翘鼻尖）
    const snoutLift = isPlay ? 0.65 : 0.0;
    m.fillAABB(-3.8, 3.8, 1.4, 9.2, 2, 11, (x, y, z, X, Y) => {
      const t = clamp((Y - 1.5) / 7.2, 0, 1);
      const halfW = lerp(3.45, 2.35, t) + (t > 0.72 ? 0.35 : 0);
      const topZ = lerp(8.8, 7.6, t) + snoutLift * t + (Math.abs(X) < 1.1 ? 0.45 : 0) + (t > 0.80 ? 0.55 : 0);
      const botZ = (isPlay ? lerp(5.1, 5.6, t) : lerp(4.2, 4.7, t)) + snoutLift * t * 0.5;
      if (Math.abs(X) <= halfW && z >= botZ && z <= topZ) {
        const edge = Math.pow(Math.abs(X) / halfW, 2.4) + Math.pow(Math.abs(z - (topZ + botZ) * 0.5) / Math.max(0.8, (topZ - botZ) * 0.55), 2.4);
        if (edge <= 1.15) {
          const isBridge = z >= topZ - 0.9 && Math.abs(X) <= 1.15;
          m.setRaw(x, y, z, isBridge ? mat('back') : mat('scale'), isBridge ? partId.back : partId.head);
        }
      }
    });

    // 鼻翼卷棱与左右吻侧纤细须根点
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 2.55, 7.2, 6.8 + snoutLift * 0.7, 1.05, 1.25, 1.05, mat('back'), partId.back, true);
      m.paintEllipsoid(s * 2.95, 6.7, 6.1 + snoutLift * 0.6, 0.45, 0.48, 0.45, mat('whisker'), partId.whisker, true);
    }

    // 3. 下颌与口腔（play 态微张口露出深红口腔与微卷龙舌）
    const jawDrop = isPlay ? -1.45 : 0.0;
    m.fillAABB(-3.2, 3.2, 0.8, 8.2, 1, 7, (x, y, z, X, Y) => {
      const t = clamp((Y - 1.0) / 6.8, 0, 1);
      const halfW = lerp(3.0, 1.85, t);
      const jz = lerp(3.8, 4.1, t) + jawDrop * (0.35 + t * 0.65);
      if (Math.abs(X) <= halfW && Math.abs(z - jz) <= 0.95) {
        m.setRaw(x, y, z, z <= jz ? mat('belly') : mat('scale'), z <= jz ? partId.belly : partId.head);
      }
    });
    if (isPlay) {
      // 深红口腔内衬与微翘龙舌
      m.paintEllipsoid(0, 4.2, 4.6, 1.75, 2.6, 1.05, mat('mouth'), partId.mouth, true);
      m.paintCapsule(0, 3.2, 4.1, 0, 6.6, 4.5, 0.95, 0.58, mat('mouth'), partId.mouth, true);
    }

    // 下颌垂髯（前下方微翘）
    m.paintCapsule(0, 5.2, 3.0 + jawDrop * 0.8, 0, 6.2, 1.1 + jawDrop * 0.5, 1.05, 0.58, mat('mane'), partId.mane, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.3, 4.4, 3.1 + jawDrop * 0.7, s * 2.1, 3.6, 1.3 + jawDrop * 0.4, 0.78, 0.48, mat('mane'), partId.mane, true);
    }

    // 4. 立体眉骨（双眼上方威严厚眉弓）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 2.4, 3.4, 8.6, s * 4.2, 0.2, 9.8, 1.08, 0.88, mat('back'), partId.back, true);
      m.paintCapsule(s * 3.8, 0.5, 9.6, s * 4.9, -1.6, 10.2, 0.82, 0.55, mat('mane'), partId.mane, true);
    }

    // 5. 头顶一对分叉清晰鹿角（主干后弯 + 前叉 + 侧叉）
    for (const s of [-1, 1]) {
      // 主干
      m.paintCapsule(s * 1.9, -0.4, 9.4, s * 3.4, -4.4, 12.6, 1.02, 0.78, mat('horn'), partId.horn, true);
      m.paintCapsule(s * 3.4, -4.4, 12.6, s * 4.8, -8.4, 14.5, 0.78, 0.55, mat('horn'), partId.horn, true);
      // 清晰前上分叉
      m.paintCapsule(s * 2.7, -2.5, 11.1, s * 3.1, -0.8, 14.3, 0.72, 0.50, mat('horn'), partId.horn, true);
      // 清晰外侧分叉
      m.paintCapsule(s * 3.8, -5.6, 13.1, s * 6.0, -5.2, 14.6, 0.68, 0.48, mat('horn'), partId.horn, true);
    }

    // 6. 脑后多层后飘鬃毛（顶鬃 + 颊侧飘鬃 + 颈背鬣）
    m.paintCapsule(0, -1.8, 9.6, 0, -7.8, 11.4, 1.35, 0.65, mat('mane'), partId.mane, true);
    for (const s of [-1, 1]) {
      // 上层后飘鬃
      m.paintCapsule(s * 2.2, -2.0, 8.6, s * 4.8, -7.4, 9.8, 1.15, 0.58, mat('mane'), partId.mane, true);
      // 颊侧飘鬃
      m.paintCapsule(s * 3.6, -0.6, 6.2, s * 5.8, -5.8, 6.6, 1.10, 0.55, mat('mane'), partId.mane, true);
      // 颌下侧鬃
      m.paintCapsule(s * 2.8, -1.4, 4.0, s * 4.6, -6.2, 3.8, 0.95, 0.52, mat('mane'), partId.mane, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 7. 清晰 2x2 金瞳（表面落点自动贴合，清除前向遮挡，eyeGlint 严禁进 glowKeys）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.0);
    const eyeZ = 7;
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 6; step++) {
        const gx = Math.round(hw + s * (5.2 - step));
        const p = m.getPartId(gx, eyeY, eyeZ);
        if (p === partId.head || p === partId.back) { sx = gx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 3.6);
      for (const dy of [0, 1]) {
        for (const dz of [0, 1]) {
          const col = (dy === 1 && dz === 1)
            ? keyToId.eyeGlint
            : ((dy === 1 && dz === 0) ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(sx, eyeY + dy, eyeZ + dz, col, partId.eye);
        }
      }
      // 轻清眼外侧前向遮挡，保证 45° 俯视清晰可见
      for (let k = 1; k <= 2; k++) {
        const fy = eyeY + 1 + k;
        if (m.getPartId(sx + s, fy, eyeZ) === partId.head) m.setRaw(sx + s, fy, eyeZ, 0, 0);
        if (m.getPartId(sx + s, fy, eyeZ + 1) === partId.head) m.setRaw(sx + s, fy, eyeZ + 1, 0, 0);
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 15, centerZ: 7 });
  }

  // =========================================================================
  // 2. 双条飘逸龙须部件（严格 1x1 体素纤细丝线，告别粗重感）
  // =========================================================================
  function buildWhiskerSeg(makeCanvas, lenVox, isTip) {
    const W = 3;
    const D = lenVox + 2;
    const H = 3;
    const m = new VoxelModel(W, D, H, SPEC);
    const { partId, keyToId } = SPEC;
    const kMain = isTip ? keyToId.whiskerHi : keyToId.whiskerMid;
    const kEnd  = isTip ? keyToId.whiskerMid : keyToId.whiskerHi;
    for (let y = 1; y <= lenVox; y++) {
      m.setRaw(1, y, 1, (y === lenVox) ? kEnd : kMain, partId.whisker);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 0.6 });
  }

  // =========================================================================
  // 3. 拉长胶囊龙身节（5 级粗细复用部件，杜绝圆球串珠！）
  //    沿 +Y 做长胶囊体，雕出背脊锯齿鳍鬃 + 暖金横纹腹甲 + 体侧鳞片色阶
  // =========================================================================
  function buildBodySegment(makeCanvas, rx, rz, halfLenY, finHeight, isNeck) {
    const W = Math.ceil(rx * 2 + 4);
    const D = Math.ceil((halfLenY + rx * 0.55) * 2 + 4);
    const H = Math.ceil(rz * 2 + finHeight + 4);
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const cz = rz + 0.8;

    // 主体沿 Y 轴拉长胶囊体（截面呈微扁椭圆形，前后两端圆滑衔接）
    const endY = halfLenY;
    m.fillAABB(-rx - 0.8, rx + 0.8, -endY - rx - 0.6, endY + rx + 0.6, 0, Math.ceil(cz + rz + 1.0), (x, y, z, X, Y) => {
      const clampedY = clamp(Y, -endY * 0.52, endY * 0.52);
      const dy = (Y - clampedY) / (rx * 0.88);
      const dx = X / rx;
      const dz = (z - cz) / rz;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 1.0) return;

      // 底部暖金横纹腹甲（隔 2 格一道凹纹）
      const isBelly = z <= cz - rz * 0.34 && Math.abs(X) <= rx * 0.84;
      if (isBelly) {
        const isBand = (Math.abs(Math.round(Y)) % 3 === 0);
        m.setRaw(x, y, z, isBand ? mat('bellyBand') : mat('belly'), isBand ? partId.bellyBand : partId.belly);
        return;
      }
      // 背部深青鳞甲与体侧青碧鳞片交错色阶
      const isBack = z >= cz + rz * 0.42 && Math.abs(X) <= rx * 0.72;
      const scaleCheck = ((Math.round(Y * 0.9) + Math.round(z)) & 1) === 0 && Math.abs(X) > rx * 0.52 && z > cz - 0.4 && z < cz + rz * 0.35;
      if (isBack || scaleCheck) {
        m.setRaw(x, y, z, mat('back'), partId.back);
      } else {
        m.setRaw(x, y, z, mat('scale'), partId.head);
      }
    });

    // 背脊清晰锯齿鳍鬃（前后双齿向 -Y 后掠，连成流动背鳍！）
    const finBaseZ = cz + rz * 0.75;
    m.paintCapsule(0, halfLenY * 0.42, finBaseZ, 0, -halfLenY * 0.25, finBaseZ + finHeight, 0.92, 0.52, mat('mane'), partId.mane, true);
    m.paintCapsule(0, -halfLenY * 0.15, finBaseZ - 0.15, 0, -halfLenY * 0.95, finBaseZ + finHeight * 0.82, 0.85, 0.48, mat('mane'), partId.mane, true);

    // 颈节两侧额外加轻柔护颈侧鬃
    if (isNeck) {
      for (const s of [-1, 1]) {
        m.paintCapsule(s * (rx * 0.78), halfLenY * 0.2, cz + 0.5, s * (rx + 0.9), -halfLenY * 0.7, cz + 0.8, 0.75, 0.45, mat('mane'), partId.mane, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: rx });
  }

  // =========================================================================
  // 4. 尾尖流云鬃簇（第 19 节末梢，收尖龙尾 + 三簇向后舒展鬃毛）
  // =========================================================================
  function buildTailTuft(makeCanvas) {
    const W = 12, D = 16, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 细尾骨收尖
    m.paintCapsule(0, 4.8, 4.2, 0, -2.5, 4.8, 1.85, 0.85, mat('scale'), partId.head, true);
    m.paintCapsule(0, 4.2, 3.0, 0, -1.2, 3.8, 1.35, 0.65, mat('belly'), partId.belly, true);

    // 尾尖饱满三簇流鬃（中长微翘 + 左右分卷）
    m.paintCapsule(0,  0.5, 5.2,  0.0, -6.8, 7.6, 1.45, 0.58, mat('mane'), partId.mane, true);
    m.paintCapsule(0,  1.0, 4.6, -3.4, -5.2, 6.2, 1.15, 0.52, mat('mane'), partId.mane, true);
    m.paintCapsule(0,  1.0, 4.6,  3.4, -5.2, 6.2, 1.15, 0.52, mat('mane'), partId.mane, true);
    m.paintCapsule(0,  2.2, 5.8,  0.0, -3.6, 8.8, 1.05, 0.50, mat('mane'), partId.mane, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0 });
  }

  // =========================================================================
  // 5. 五趾短龙爪（左右独立镜像，短壮肘臂 + 肘后小鬃 + 清晰五趾弯钩）
  //    枢轴位于肩根 (side * -2.2, -1.5)，紧贴龙身第 3 节 / 第 12 节零分离
  // =========================================================================
  function buildDragonClaw(makeCanvas, side) {
    // side = -1 左爪 / +1 右爪
    const W = 12, D = 13, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    const sx = side;
    // 肩根 -> 外展短肘 -> 前伸腕掌
    m.paintCapsule(-sx * 2.0, -1.6, 7.2, sx * 1.0, -0.6, 5.4, 1.65, 1.38, mat('scale'), partId.head, true);
    m.paintCapsule(sx * 1.0, -0.6, 5.4, sx * 1.6, 2.2, 3.2, 1.32, 1.12, mat('scale'), partId.head, true);
    // 肘后飘逸小鬃毛（东方龙特征）
    m.paintCapsule(sx * 1.2, -1.2, 5.4, sx * 2.6, -4.6, 5.8, 0.85, 0.48, mat('mane'), partId.mane, true);
    m.paintCapsule(sx * 1.4, -1.0, 4.6, sx * 2.2, -3.8, 4.2, 0.72, 0.45, mat('mane'), partId.mane, true);

    // 饱满爪掌
    m.paintEllipsoid(sx * 1.7, 2.5, 2.8, 1.45, 1.45, 1.05, mat('back'), partId.back, true);

    // 清晰五趾弯钩利爪（前 3 趾 + 内拇趾 + 后趾）
    const px = sx * 1.7, py = 2.6, pz = 2.6;
    // 前中趾
    m.paintCapsule(px, py + 0.8, pz, px + sx * 0.2, py + 3.4, pz - 1.2, 0.56, 0.36, mat('claw'), partId.claw, true);
    // 前外趾
    m.paintCapsule(px + sx * 0.8, py + 0.4, pz, px + sx * 2.4, py + 2.5, pz - 1.1, 0.54, 0.36, mat('claw'), partId.claw, true);
    // 前内趾
    m.paintCapsule(px - sx * 0.8, py + 0.5, pz, px - sx * 1.8, py + 2.7, pz - 1.1, 0.54, 0.36, mat('claw'), partId.claw, true);
    // 内侧拇趾
    m.paintCapsule(px - sx * 1.0, py - 0.3, pz, px - sx * 2.4, py + 0.3, pz - 1.0, 0.52, 0.36, mat('claw'), partId.claw, true);
    // 后侧小趾
    m.paintCapsule(px + sx * 0.2, py - 0.9, pz, px + sx * 0.8, py - 2.6, pz - 0.9, 0.50, 0.35, mat('claw'), partId.claw, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4 });
  }

  // =========================================================================
  // 6. 交互物 A：悬浮「赤金戏珠」（立体体素圆珠 + 外旋双环纹，仅珠芯进 glowKeys）
  // =========================================================================
  function buildDragonOrb(makeCanvas) {
    const S = 11;
    const m = new VoxelModel(S, S, S, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const cz = 5.0;

    // 自亮圆珠芯（中心最亮 -> 中层暖橘 -> 外层赤金）
    m.fillAABB(-3.2, 3.2, -3.2, 3.2, 2, 8, (x, y, z, X, Y) => {
      const d = Math.hypot(X, Y, z - cz);
      if (d <= 2.75) {
        const kId = d <= 1.25 ? keyToId.emissiveCore : (d <= 2.15 ? keyToId.emissiveHot : keyToId.emissiveMid);
        m.setRaw(x, y, z, kId, partId.orbCore);
      }
    });

    // 外旋立体赤金环纹（倾斜云纹赤金环，随旋转产生灵动立体流转）
    const steps = 28;
    for (let i = 0; i < steps; i++) {
      const a = (i / steps) * TAU;
      const r = 4.15;
      // 环 1：倾角 +32°
      const x1 = Math.cos(a) * r;
      const y1 = Math.sin(a) * r * 0.85;
      const z1 = cz + Math.sin(a) * r * 0.52;
      m.paintEllipsoid(x1, y1, z1, 0.62, 0.62, 0.62, mat('orbRing'), partId.orbRing, true);
      // 环 2：正交反倾半弧点缀
      if (i % 2 === 0) {
        const x2 = Math.cos(a) * r * 0.85;
        const y2 = Math.sin(a) * r;
        const z2 = cz - Math.cos(a) * r * 0.52;
        m.paintEllipsoid(x2, y2, z2, 0.55, 0.55, 0.55, mat('orbRing'), partId.orbRing, false);
      }
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 10, centerZ: 5 });
  }

  // =========================================================================
  // 7. 交互物 B：传统「如意祥云」（饱满如意灵芝云头 + 飘逸长云尾 + 鎏金/彩云卷边）
  //    切片体素 alpha 严格 0 或 255，渲染时通过部件 opacity 表现柔和云感
  // =========================================================================
  function buildCloud(makeCanvas, size) {
    const isBig = size === 'big';
    const W = isBig ? 16 : 12;
    const D = isBig ? 16 : 12;
    const H = isBig ? 9 : 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    if (isBig) {
      // 饱满三瓣如意云头（前宽后收，平托底 + 中高灵芝顶）
      m.paintEllipsoid( 0.0,  2.2, 3.8, 3.6, 2.8, 2.4, mat('cloud'), partId.cloud, true);
      m.paintEllipsoid(-3.8,  1.2, 3.0, 2.6, 2.2, 1.9, mat('cloud'), partId.cloud, true);
      m.paintEllipsoid( 3.8,  1.2, 3.0, 2.5, 2.2, 1.8, mat('cloud'), partId.cloud, true);
      m.paintEllipsoid( 0.0,  3.1, 4.8, 2.3, 2.0, 1.7, mat('cloud'), partId.cloud, true);
      // 传统弯曲飘逸长云尾（沿 -Y 呈 S 弧拉长收尖）
      m.paintCapsule( 0.0,  0.5, 2.8, -1.8, -3.2, 2.6, 2.1, 1.45, mat('cloud'), partId.cloud, true);
      m.paintCapsule(-1.8, -3.2, 2.6,  1.4, -6.5, 2.4, 1.4, 0.72, mat('cloud'), partId.cloud, true);
      // 传统织锦金边/彩云卷缘（沿云头上脊与左右如意卷勾边）
      m.paintCapsule(-4.4,  1.8, 4.4, -1.4,  4.0, 5.7, 0.72, 0.68, mat('cloudTrim'), partId.cloudTrim, true);
      m.paintCapsule( 4.4,  1.8, 4.4,  1.4,  4.0, 5.7, 0.72, 0.68, mat('cloudTrim'), partId.cloudTrim, true);
      m.paintCapsule(-1.4,  4.0, 5.7,  1.4,  4.0, 5.7, 0.72, 0.72, mat('cloudTrim'), partId.cloudTrim, true);
      m.paintCapsule(-1.4, -2.8, 3.8,  1.2, -5.8, 3.2, 0.62, 0.45, mat('cloudTrim'), partId.cloudTrim, true);
      // 平整云底收边
      m.fillAABB(-7.5, 7.5, -7.5, 7.5, 0, 1, (x, y, z) => {
        if (z < 1) m.setRaw(x, y, z, 0, 0);
      });
    } else {
      // 灵巧双瓣如意小祥云 + 细长卷尾 + 卷缘勾边
      m.paintEllipsoid( 0.0,  1.6, 3.0, 2.7, 2.2, 1.8, mat('cloud'), partId.cloud, true);
      m.paintEllipsoid(-2.6,  0.9, 2.4, 1.9, 1.6, 1.4, mat('cloud'), partId.cloud, true);
      m.paintEllipsoid( 2.6,  1.0, 2.4, 1.8, 1.6, 1.4, mat('cloud'), partId.cloud, true);
      m.paintCapsule( 0.0,  0.2, 2.2,  1.2, -3.2, 2.1, 1.35, 0.82, mat('cloud'), partId.cloud, true);
      m.paintCapsule( 1.2, -3.2, 2.1, -0.8, -5.0, 2.0, 0.80, 0.48, mat('cloud'), partId.cloud, true);
      m.paintCapsule(-3.0,  1.4, 3.5,  0.0,  2.9, 4.4, 0.62, 0.58, mat('cloudTrim'), partId.cloudTrim, true);
      m.paintCapsule( 3.0,  1.4, 3.5,  0.0,  2.9, 4.4, 0.62, 0.58, mat('cloudTrim'), partId.cloudTrim, true);
      m.fillAABB(-5.5, 5.5, -5.5, 5.5, 0, 0, (x, y, z) => {
        m.setRaw(x, y, z, 0, 0);
      });
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: isBig ? 6.0 : 4.2 });
  }

  // =========================================================================
  // 8. 生物定义与动力学驱动
  // =========================================================================
  const NUM_NODES = 20;     // 0: 颈枕锚点, 1..18: 18 节龙身, 19: 尾尖鬃簇
  const SEG_LEN = 3.2;      // 配合 halfLenY=3.2~3.6 拉长胶囊体，相邻节重叠 ~48%~52%，零串珠
  const WHISKER_SEGS = 6;   // 每条龙须 6 节 1px 纤细弹簧须链

  // 6 朵「云龙三现」如意祥云：底托(后爪/龙腹) + 托珠 + 前景半掩中段 + 尾卷，仅在摆姿期翻涌，游动即消散
  const CLOUD_SLOTS = [
    { key: 'cloudBig',   role: 'orbBase',   spawnNode: 0,  side:  0, maxOp: 0.84, rotSpd:  0.26, bias:  0.42 },
    { key: 'cloudBig',   role: 'rearBrace', spawnNode: 12, side: -1, maxOp: 0.86, rotSpd: -0.18, bias: -0.55 },
    { key: 'cloudBig',   role: 'bellyBase', spawnNode: 7,  side:  1, maxOp: 0.84, rotSpd:  0.16, bias: -0.58 },
    { key: 'cloudSmall', role: 'veilFront', spawnNode: 5,  side: -1, maxOp: 0.78, rotSpd:  0.24, bias:  0.56 },
    { key: 'cloudSmall', role: 'veilMid',   spawnNode: 10, side:  1, maxOp: 0.76, rotSpd: -0.22, bias:  0.52 },
    { key: 'cloudSmall', role: 'tailTrail', spawnNode: 16, side: -1, maxOp: 0.72, rotSpd:  0.28, bias: -0.35 }
  ];

  const Special9Def = {
    id: 'special9_long',
    code: '特9',
    name: '特9 · 东方游龙',
    status: 'done',
    tag: '腾云戏珠长龙 · 奇观级',
    summary: 'v3 精制奇观：双档威严精雕龙头 + 双条 5 节飘逸龙须 + 20 节拉长胶囊密排龙躯 + 4 只严格锚定五趾龙爪 + 悬浮赤金戏珠与 5 朵立体祥云，巡游 8 字追珠、待机盘龙吐云托珠',
    defaultHabitat: 'sky',
    footRadius: 12.0,
    ecoWeight: 1.55,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '双档精雕龙头与分叉鹿角',
      '双条 5 节弹簧龙须',
      '20 节拉长胶囊密排龙躯',
      '4 只节点锚定五趾龙爪',
      '三维腾云纵波与水域潜游',
      '赤金戏珠与 5 朵伴生祥云'
    ],
    soulHabit: '云海高空腾跃 8 字追逐赤金戏珠，偶发加速轻顶戏珠迸发暖金微粒；原地待机则舒展盘旋护珠，周期昂首微张龙口吐出卷云将龙珠托旋一圈再轻落回位',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        headCalm:    buildDragonHead(makeCanvas, 'calm'),
        headPlay:    buildDragonHead(makeCanvas, 'play'),
        whiskerRoot: buildWhiskerSeg(makeCanvas, 4, false),
        whiskerTip:  buildWhiskerSeg(makeCanvas, 3, true),
        segNeck:     buildBodySegment(makeCanvas, 2.85, 2.70, 3.2, 2.2, true),
        segChest:    buildBodySegment(makeCanvas, 3.40, 3.20, 3.5, 2.4, false),
        segMid:      buildBodySegment(makeCanvas, 3.15, 2.95, 3.4, 2.2, false),
        segRear:     buildBodySegment(makeCanvas, 2.60, 2.45, 3.2, 1.9, false),
        segTail:     buildBodySegment(makeCanvas, 2.05, 1.95, 3.0, 1.5, false),
        tailTuft:    buildTailTuft(makeCanvas),
        clawL:       buildDragonClaw(makeCanvas, -1),
        clawR:       buildDragonClaw(makeCanvas,  1),
        orb:         buildDragonOrb(makeCanvas),
        cloudBig:    buildCloud(makeCanvas, 'big'),
        cloudSmall:  buildCloud(makeCanvas, 'small')
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;

      // 20 节物理拖拽 + 最大转角约束链
      const chain = new ChainSolver(NUM_NODES, SEG_LEN, {
        maxAngle: 0.44,
        waveFreq: 3.4,
        wavePhaseStep: 0.42,
        waveAmp: 0.24
      });

      // 左右两条 5 节纤细龙须弹簧链
      const whiskers = [-1, 1].map((side) => ({
        side,
        nodes: Array.from({ length: WHISKER_SEGS }, (_, j) =>
          new SpringDamper3D(hx0, hy0, 20, 118 - j * 11, 6.8 - j * 0.45)
        )
      }));

      // 5 朵动态伴生祥云（仅在摆姿动作期凝结浮现、随风漂移缓升，恢复游动即消散）
      const clouds = CLOUD_SLOTS.map((c, idx) => ({
        ...c,
        idx,
        x: hx0, y: hy0, z: 14,
        vx: 0, vy: 0, vz: 0.8,
        yaw: hyaw0 + idx * 1.2,
        op: 0.0
      }));

      // 悬浮赤金戏珠状态
      const orb = {
        x: hx0, y: hy0 + 18, z: 22,
        spin: 0,
        liftBoost: 0,
        orbitAng: 0.4
      };

      const headYawSpring = new SpringDamper1D(0, 76, 7.2);
      const orbLiftSpring = new SpringDamper1D(0, 46, 4.8);

      const state = {
        x: hx0, y: hy0, z: 21.0,
        vx: 0, vy: 0, yaw: hyaw0,
        headX: hx0, headY: hy0, headZ: 22.0, headYaw: hyaw0,
        patT: opts.seed ? (opts.seed % 20) : 0,
        idleAng: opts.seed ? (opts.seed % TAU) : 0,
        headPose: 'calm',
        // 巡游摆姿起云 / 待机吐云托珠循环计时
        playTimer: 4.2,
        playStage: 'cruise', // 'cruise' | 'approach' | 'puff' | 'settle'
        poseBlend: 0,
        wasCloudPose: false,
        puffEmitted: false,
        vfxCd: 0,
        waterCd: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      // 5 级粗细复用映射（nodes[1..18]）
      function bodyPartKey(i) {
        if (i <= 2)  return 'segNeck';
        if (i <= 6)  return 'segChest';
        if (i <= 12) return 'segMid';
        if (i <= 15) return 'segRear';
        return 'segTail';
      }

      const instance = {
        def: Special9Def,
        cachePrefix: `sp9_long_${Math.random().toString(36).slice(2, 7)}`,
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

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 21.0;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.headX = hx; state.headY = hy + 10; state.headZ = 22.0; state.headYaw = hyaw;
          state.headPose = 'calm';
          state.playStage = 'cruise';
          state.playTimer = 2.0;
          state.puffEmitted = false;
          headYawSpring.x = headYawSpring.v = 0;
          orbLiftSpring.x = orbLiftSpring.v = 0;

          // 初始化为舒展 S 弧而非笔直僵硬直线
          chain.reset(state.headX, state.headY, state.headZ, hyaw);
          for (let i = 1; i < NUM_NODES; i++) {
            const [wx, wy] = localToWorldXY(state.headX, state.headY, hyaw, Math.sin(i * 0.42) * 5.0, -i * SEG_LEN * 0.94);
            chain.nodes[i].x = wx;
            chain.nodes[i].y = wy;
            chain.nodes[i].z = 20.5 + Math.sin(i * 0.45) * 2.5;
            chain.nodes[i].yaw = hyaw;
          }

          orb.x = hx;
          orb.y = hy + 24;
          orb.z = 22.5;
          orb.spin = 0;

          for (const w of whiskers) {
            const [ax, ay] = localToWorldXY(state.headX, state.headY, hyaw, w.side * 3.4, 10.6);
            for (let j = 0; j < w.nodes.length; j++) {
              const [wx, wy] = localToWorldXY(ax, ay, hyaw, w.side * (1.2 + j * 1.15), -j * 0.9);
              w.nodes[j].reset(wx, wy, state.headZ + 2.0 - j * 0.25);
            }
          }

          state.poseBlend = 0;
          state.wasCloudPose = false;
          for (let i = 0; i < clouds.length; i++) {
            const c = clouds[i];
            c.x = hx; c.y = hy; c.z = 16;
            c.vx = 0; c.vy = 0; c.vz = 0.8;
            c.yaw = hyaw + i * 1.1;
            c.op = 0.0;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const speedMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const actionId = (eco && eco.action) || (eco && eco.patrol === false ? 'idle' : 'patrol');
          const isPatrol = actionId !== 'idle';
          const isWater = !!(habitat && habitat.isWater);
          const maxR = (eco && eco.maxRadius) || 46;
          const homeX = (eco && eco.homeX) || 0;
          const homeY = (eco && eco.homeY) || 0;

          // 生境基础高度与统一纵波频率（龙头与龙身同频同相，彻底消除头身垂向分离）
          const baseLift = (isWater ? 4.2 : 20.8) * sMul;
          const waveFreq = 3.2 * gFreq;
          const waveAmp = (isWater ? 2.4 : 3.8) * sMul;
          const fx = curSkin.fx || SKINS[0].fx;

          // -----------------------------------------------------------------
          // 1. 巡游态（赤金戏珠恒在前领飞 + 游一会摆姿起云） vs 待机态（「盘龙戏珠」闭环）
          // -----------------------------------------------------------------
          state.playTimer -= dt;
          let targetHeadX, targetHeadY, targetHeadZ;

          if (isPatrol) {
            // 周期节奏：自由游动 ~5.2s（无祥云）-> 减速昂首摆姿吐云 ~2.6s（动态祥云翻涌）-> 恢复游动（祥云消散）
            if (state.playStage === 'cruise') {
              state.headPose = 'calm';
              if (state.playTimer <= 0) {
                state.playStage = 'approach';
                state.playTimer = 1.05;
                state.puffEmitted = false;
              }
            } else if (state.playStage === 'approach') {
              state.headPose = 'play';
              if (state.playTimer <= 0) {
                state.playStage = 'puff';
                state.playTimer = 1.55;
              }
            } else if (state.playStage === 'puff') {
              state.headPose = 'play';
              if (!state.puffEmitted) {
                state.puffEmitted = true;
                orbLiftSpring.impulse(20.0 * sp * sMul);
                if (vfx) {
                  for (let k = 0; k < 10; k++) {
                    const a = (k / 10) * TAU + Math.random() * 0.4;
                    const spd = (8 + Math.random() * 12) * sMul;
                    vfx.spawnParticle(
                      orb.x, orb.y, orb.z,
                      Math.cos(a) * spd, Math.sin(a) * spd, (5 + Math.random() * 8) * sMul,
                      0.58 + Math.random() * 0.35, 1.35 + Math.random() * 0.45,
                      k % 2 === 0 ? fx.orb : fx.spark, true, 10
                    );
                  }
                }
              }
              // 摆姿期从龙口向戏珠吹出柔和云絮微粒
              state.vfxCd -= dt;
              if (vfx && state.vfxCd <= 0) {
                state.vfxCd = 0.14;
                const [mx, my] = localToWorldXY(state.headX, state.headY, state.headYaw, 0, 11.5 * sMul);
                vfx.spawnParticle(
                  mx, my, state.headZ + 1.2 * sMul,
                  (orb.x - mx) * 0.9, (orb.y - my) * 0.9, (4 + Math.random() * 4) * sMul,
                  0.55, 1.65, fx.breath, false, -3
                );
              }
              if (state.playTimer <= 0) {
                state.playStage = 'cruise';
                state.playTimer = 5.0 + Math.random() * 1.4;
                state.headPose = 'calm';
              }
            } else {
              state.playStage = 'cruise';
              state.playTimer = 4.6;
            }

            const inPose = (state.playStage === 'approach' || state.playStage === 'puff');
            state.poseBlend = lerp(state.poseBlend, inPose ? 1.0 : 0.0, expSmooth(dt, inPose ? 3.8 : 4.5));
            // 自由巡游：龙头按大 8 字顺滑游动；摆姿期减速盘弧、高昂龙首形成「升龙戏珠」定格感
            const curDistToOrb = Math.hypot(orb.x - state.headX, orb.y - state.headY);
            const leadBoost = curDistToOrb < 22.0 * sMul ? 1.42 : 1.0;
            state.patT += dt * lerp(0.62, 0.14, state.poseBlend) * speedMul * leadBoost;

            const R = Math.min(31.0, maxR * 0.74);
            const t = state.patT;
            // 戏珠沿大 8 字轨迹领飞；摆姿期在龙头前方偏上高悬托旋
            const orbTargetX = homeX + Math.sin(t) * R + ((eco && eco.avoidX) || 0) * 0.35;
            const orbTargetY = homeY + Math.sin(t * 2.0) * (R * 0.54) + Math.cos(t * 0.5) * (R * 0.22) + ((eco && eco.avoidY) || 0) * 0.35;
            const orbTargetZ = baseLift + (Math.sin(t * 2.4) * 3.4 + (isWater ? 4.4 : 2.8) + state.poseBlend * 5.8) * sMul;

            const orbBoost = orbLiftSpring.update(dt, inPose ? 3.5 * sMul : 0, 42 * sp, clamp(4.6 * dScale, 2.2, 9.0));
            const kOrb = expSmooth(dt, 6.2);
            orb.x = lerp(orb.x, orbTargetX, kOrb);
            orb.y = lerp(orb.y, orbTargetY, kOrb);
            orb.z = lerp(orb.z, Math.max(5.0 * sMul, orbTargetZ + orbBoost), kOrb);
            orb.spin = wrapAngle(orb.spin + dt * lerp(1.6, 4.8, state.poseBlend));

            // 龙头以受限角速度顺滑追随前方戏珠；距离过近时自动柔和减速，绝不撞穿戏珠
            const dx = orb.x - state.headX;
            const dy = orb.y - state.headY;
            const dist = Math.hypot(dx, dy) || 0.001;
            const desiredYaw = Math.atan2(-dx, dy);
            const yawDiff = wrapAngle(desiredYaw - state.headYaw);
            const maxTurn = lerp(2.25, 1.55, state.poseBlend) * (0.68 + speedMul * 0.45);
            state.headYaw = wrapAngle(state.headYaw + clamp(yawDiff, -maxTurn * dt, maxTurn * dt));

            // 距离 < 21 格时平滑收速，摆姿期几乎原地缓盘、拉出曲颈昂首与中段高拱的「山」字升龙轮廓
            const followScale = smoothstep(16.5 * sMul, 25.5 * sMul, dist);
            const baseSpd = lerp(21.5, 5.2, state.poseBlend);
            const cruiseSpd = baseSpd * (0.22 + 0.78 * followScale) * speedMul * sMul;
            const fwdX = -Math.sin(state.headYaw);
            const fwdY =  Math.cos(state.headYaw);
            targetHeadX = state.headX + fwdX * cruiseSpd * dt;
            targetHeadY = state.headY + fwdY * cruiseSpd * dt;

            const dFromHome = Math.hypot(targetHeadX - homeX, targetHeadY - homeY);
            if (dFromHome > maxR * 0.90) {
              const pull = (maxR * 0.90) / dFromHome;
              targetHeadX = homeX + (targetHeadX - homeX) * pull;
              targetHeadY = homeY + (targetHeadY - homeY) * pull;
            }
            // 摆姿期龙首高昂 +5.6 格，形成明显升龙定格气势
            targetHeadZ = baseLift + Math.sin(time * waveFreq) * waveAmp + (0.4 + state.poseBlend * 5.6) * sMul;

            state.headX = targetHeadX;
            state.headY = targetHeadY;
            state.headZ = lerp(state.headZ, targetHeadZ, expSmooth(dt, 8.5));
          } else {
            // ---------------------------------------------------------------
            // 原地待机（S 键）：「盘龙戏珠」闭环
            //   龙珠悬浮中央缓慢自转，长龙以舒展大圆三维起伏环绕；
            //   每隔数秒龙头切 headPlay 靠近龙珠吐出一股卷云微粒将龙珠向上托旋一圈再回位
            // ---------------------------------------------------------------
            if (state.playStage === 'cruise') {
              state.headPose = 'calm';
              if (state.playTimer <= 0) {
                state.playStage = 'approach';
                state.playTimer = 0.95;
                state.puffEmitted = false;
              }
            } else if (state.playStage === 'approach') {
              state.headPose = 'play';
              if (state.playTimer <= 0) {
                state.playStage = 'puff';
                state.playTimer = 1.45;
              }
            } else if (state.playStage === 'puff') {
              state.headPose = 'play';
              // 持续吐出卷云微粒托旋龙珠
              state.vfxCd -= dt;
              if (vfx && state.vfxCd <= 0) {
                state.vfxCd = 0.11;
                const [mx, my] = localToWorldXY(state.headX, state.headY, state.headYaw, 0, 12.2 * sMul);
                const toOrbX = orb.x - mx, toOrbY = orb.y - my;
                const dO = Math.hypot(toOrbX, toOrbY) || 1;
                vfx.spawnParticle(
                  mx, my, state.headZ + 1.5 * sMul,
                  (toOrbX / dO) * 14 * sMul + (Math.random() - 0.5) * 4,
                  (toOrbY / dO) * 14 * sMul + (Math.random() - 0.5) * 4,
                  (8 + Math.random() * 6) * sMul,
                  0.62, 1.85 + Math.random() * 0.55,
                  fx.breath, false, -4
                );
                vfx.spawnParticle(
                  orb.x + (Math.random() - 0.5) * 4 * sMul,
                  orb.y + (Math.random() - 0.5) * 4 * sMul,
                  orb.z - 1.5 * sMul,
                  (Math.random() - 0.5) * 8 * sMul,
                  (Math.random() - 0.5) * 8 * sMul,
                  (7 + Math.random() * 6) * sMul,
                  0.52, 1.30,
                  fx.spark, true, 6
                );
              }
              if (state.playTimer <= 0) {
                state.playStage = 'settle';
                state.playTimer = 1.1;
                state.headPose = 'calm';
              }
            } else if (state.playStage === 'settle') {
              state.headPose = 'calm';
              if (state.playTimer <= 0) {
                state.playStage = 'cruise';
                state.playTimer = 3.8;
              }
            }

            // 龙珠：中央悬浮，吐云期被向上托旋一圈（+8 格并画小螺圈），随后轻落回位
            const puffProgress = state.playStage === 'puff' ? clamp(1 - state.playTimer / 1.45, 0, 1) : 0;
            const settleProgress = state.playStage === 'settle' ? clamp(state.playTimer / 1.1, 0, 1) : 0;
            const orbLiftTarget = state.playStage === 'puff'
              ? Math.sin(puffProgress * Math.PI) * 8.5 * sMul
              : (state.playStage === 'settle' ? settleProgress * 2.5 * sMul : 0);
            const orbLift = orbLiftSpring.update(dt, orbLiftTarget, 38 * sp, clamp(4.8 * dScale, 2.4, 9.0));
            const swirlR = state.playStage === 'puff' ? Math.sin(puffProgress * Math.PI) * 3.2 * sMul : 0.9 * sMul;
            orb.orbitAng = wrapAngle(orb.orbitAng + dt * (state.playStage === 'puff' ? 4.4 : 1.1));
            const targetOrbX = homeX + Math.cos(orb.orbitAng) * swirlR;
            const targetOrbY = homeY + Math.sin(orb.orbitAng) * swirlR;
            const targetOrbZ = baseLift + (Math.sin(time * 2.1) * 1.4 + (isWater ? 5.5 : 1.2)) * sMul + orbLift;
            const kO = expSmooth(dt, 6.2);
            orb.x = lerp(orb.x, targetOrbX, kO);
            orb.y = lerp(orb.y, targetOrbY, kO);
            orb.z = lerp(orb.z, Math.max(5.0 * sMul, targetOrbZ), kO);
            orb.spin = wrapAngle(orb.spin + dt * (state.playStage === 'puff' ? 5.2 : 1.35));

            // 长龙：舒展大圆环绕中央戏珠（半径 ~21 格），靠近吐云阶段半径微收至 ~16.5 格
            state.idleAng = wrapAngle(state.idleAng + dt * 0.74 * speedMul);
            const inPlayNear = (state.playStage === 'approach' || state.playStage === 'puff');
            state.poseBlend = lerp(state.poseBlend, inPlayNear ? 1.0 : 0.0, expSmooth(dt, inPlayNear ? 3.8 : 4.5));
            const orbitR = (inPlayNear ? 17.8 : 21.5) * sMul;
            targetHeadX = homeX + Math.cos(state.idleAng) * orbitR;
            targetHeadY = homeY + Math.sin(state.idleAng) * orbitR;
            targetHeadZ = baseLift + Math.sin(time * waveFreq) * waveAmp + (0.5 + state.poseBlend * 4.8) * sMul;

            const kPos = expSmooth(dt, 4.6);
            state.headX = lerp(state.headX, targetHeadX, kPos);
            state.headY = lerp(state.headY, targetHeadY, kPos);
            state.headZ = lerp(state.headZ, targetHeadZ, expSmooth(dt, 8.5));

            // 切线方向 + 略微向圆心龙珠偏首
            const tangentYaw = wrapAngle(state.idleAng); // 对 +Y 正前，逆时针圆切线 (-sin θ, cos θ) 即 yaw = θ
            const toOrbYaw = Math.atan2(-(orb.x - state.headX), orb.y - state.headY);
            const lookBias = inPlayNear ? 0.42 : 0.16;
            const desiredHeadYaw = wrapAngle(tangentYaw + wrapAngle(toOrbYaw - tangentYaw) * lookBias);
            state.headYaw = wrapAngle(state.headYaw + wrapAngle(desiredHeadYaw - state.headYaw) * expSmooth(dt, 5.4));
          }

          // -----------------------------------------------------------------
          // 2. 驱动 20 节 ChainSolver（三维腾云纵波：昂首 -> 颈下弯 -> 中段高拱 -> 尾梢上翘）
          // -----------------------------------------------------------------
          const segLen = SEG_LEN * sMul;
          chain.update(dt, state.headX, state.headY, state.headZ, state.headYaw, time, {
            segLen,
            flexibility: flex,
            maxAngle: 0.42,
            waveFreq,
            waveAmp: 0.22,
            wavePhaseStep: 0.40,
            restAlign: 0.06,
            zFollowSpeed: 9.5,
            zTargetFn: (u, i, t) => {
              const pb = state.poseBlend;
              // 沿龙身向后传播的正弦纵波（摆姿期减缓起伏、强化九龙壁式「山」字高拱升龙轮廓）
              const travelWave = Math.sin(t * waveFreq - i * 0.36) * waveAmp * lerp(1.0, 0.55, pb);
              const neckDip = -Math.sin(clamp(u / 0.30, 0, 1) * Math.PI) * lerp(2.2, 3.8, pb) * sMul;
              const midArch =  Math.sin(clamp((u - 0.24) / 0.52, 0, 1) * Math.PI) * lerp(3.4, 6.2, pb) * sMul;
              const tailUp  =  u > 0.74 ? Math.pow((u - 0.74) / 0.26, 1.4) * lerp(4.2, 5.8, pb) * sMul : 0;
              const headRise = (1.0 - smoothstep(0.0, 0.16, u)) * pb * 5.2 * sMul;
              const minZ = isWater ? -1.4 * sMul : 5.2 * sMul;
              return Math.max(minZ, baseLift + travelWave + neckDip + midArch + tailUp + headRise);
            }
          });

          const nodes = chain.nodes;
          // 逐节垂向步差安全锁：杜绝任何急转或相位跃迁导致的头颈/体节竖向分离
          const maxDz = 1.65 * sMul;
          for (let i = 1; i < NUM_NODES; i++) {
            const dz = nodes[i].z - nodes[i - 1].z;
            if (dz > maxDz) nodes[i].z = nodes[i - 1].z + maxDz;
            else if (dz < -maxDz) nodes[i].z = nodes[i - 1].z - maxDz;
          }

          // 龙头微独立注视戏珠的弹簧偏角（收紧至 +-0.26 弧度，保持颈枕紧实咬合零分离）
          const dxOrb = orb.x - nodes[0].x;
          const dyOrb = orb.y - nodes[0].y;
          const relOrbYaw = clamp(wrapAngle(Math.atan2(-dxOrb, dyOrb) - nodes[0].yaw), -0.26, 0.26);
          headYawSpring.update(dt, relOrbYaw * 0.48, 82 * sp, clamp(7.6 * dScale, 3.2, 12.0));

          // -----------------------------------------------------------------
          // 2b. 赤金戏珠前置领飞与零穿模硬保护（永远稳稳在龙头前方领飞，绝不穿模！）
          // -----------------------------------------------------------------
          const renderHeadYaw = wrapAngle(nodes[0].yaw + headYawSpring.x);
          const [headCenterX, headCenterY] = pivotToWorldXY(
            nodes[0].x, nodes[0].y, renderHeadYaw,
            HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul
          );
          const [snoutX, snoutY] = localToWorldXY(headCenterX, headCenterY, renderHeadYaw, 0, 9.2 * sMul);
          const headFwdX = -Math.sin(renderHeadYaw);
          const headFwdY =  Math.cos(renderHeadYaw);

          if (isPatrol) {
            // 巡游态：确保戏珠永远在龙头正前方半球且距离吻尖 >= 9.0 格（距颈枕 >= 20.5 格）
            const relX = orb.x - nodes[0].x;
            const relY = orb.y - nodes[0].y;
            const alongFwd = relX * headFwdX + relY * headFwdY;
            const minLead = 20.5 * sMul;
            if (alongFwd < minLead) {
              const push = minLead - alongFwd;
              orb.x += headFwdX * push;
              orb.y += headFwdY * push;
            }
            const sdx = orb.x - snoutX, sdy = orb.y - snoutY;
            const sDist = Math.hypot(sdx, sdy) || 0.001;
            const minSnoutGap = 9.0 * sMul;
            if (sDist < minSnoutGap) {
              orb.x = snoutX + (sdx / sDist) * minSnoutGap;
              orb.y = snoutY + (sdy / sDist) * minSnoutGap;
            }
          } else {
            // 待机盘龙态：同样保证吻尖与戏珠间留出清晰呼吸空隙（>= 7.5 格），零穿模
            const sdx = orb.x - snoutX, sdy = orb.y - snoutY;
            const sDist = Math.hypot(sdx, sdy) || 0.001;
            const minIdleGap = 7.5 * sMul;
            if (sDist < minIdleGap) {
              orb.x = snoutX + (sdx / sDist) * minIdleGap;
              orb.y = snoutY + (sdy / sDist) * minIdleGap;
            }
          }

          // -----------------------------------------------------------------
          // 3. 双条 6 节 1px 纤细龙须弹簧链（挂于龙头左右吻侧，随转向与吐云翻飞）
          // -----------------------------------------------------------------
          const isPuffing = state.headPose === 'play';
          for (const w of whiskers) {
            const [ax, ay] = localToWorldXY(headCenterX, headCenterY, renderHeadYaw, w.side * 2.95 * sMul, 6.6 * sMul);
            let px = ax, py = ay, pz = nodes[0].z + 1.5 * sMul;
            const segStep = 1.85 * sMul;

            for (let j = 0; j < w.nodes.length; j++) {
              const nd = w.nodes[j];
              const u = (j + 1) / w.nodes.length;
              const flutter = Math.sin(time * (isPuffing ? 7.6 : 4.4) * gFreq - j * 0.72 + (w.side > 0 ? 1.3 : 0))
                * (0.55 + u * (isPuffing ? 1.95 : 1.25)) * flex * sMul;
              const sideFlare = w.side * (1.35 + u * 0.65) * sMul;
              const backSweep = (-0.95 - u * 0.75) * sMul;
              const [ox, oy] = localToWorldXY(0, 0, renderHeadYaw, sideFlare + flutter * 0.45, backSweep + flutter * 0.35);
              const tx = px + ox;
              const ty = py + oy;
              const tz = pz + (Math.cos(time * 4.0 * gFreq - j * 0.80) * 0.60 * (0.4 + u) + (isPuffing ? 0.35 : -0.10)) * sMul;

              nd.update(dt, tx, ty, tz, nd.stiffness * sp, clamp(nd.damping * dScale, 2.4, 10.5));

              // 严格等弧长防断节约束
              const ddx = nd.x - px, ddy = nd.y - py, ddz = nd.z - pz;
              const d3 = Math.hypot(ddx, ddy, ddz) || 0.001;
              if (d3 > segStep * 1.10 || d3 < segStep * 0.74) {
                const k = clamp(d3, segStep * 0.74, segStep * 1.10) / d3;
                nd.x = px + ddx * k;
                nd.y = py + ddy * k;
                nd.z = pz + ddz * k;
              }
              px = nd.x; py = nd.y; pz = nd.z;
            }
          }

          // -----------------------------------------------------------------
          // 4. 5 朵动态立体祥云团：游动时不出现，摆姿起云时动态翻涌，恢复游动即消散！
          // -----------------------------------------------------------------
          const isCloudPose = !isWater && (state.playStage === 'approach' || state.playStage === 'puff');
          if (isCloudPose && !state.wasCloudPose) {
            // 进入「升龙戏珠」摆姿瞬间：按「云龙三现」构图生成 6 朵如意金边祥云（托珠 + 后爪蹬云 + 龙腹底座 + 前景半掩中段 + 尾卷）
            for (let i = 0; i < clouds.length; i++) {
              const c = clouds[i];
              if (c.role === 'orbBase') {
                c.x = orb.x + (Math.random() - 0.5) * 3 * sMul;
                c.y = orb.y + (Math.random() - 0.5) * 3 * sMul;
                c.z = Math.max(4.0 * sMul, orb.z - 8.5 * sMul);
                c.vx = (Math.random() - 0.5) * 2.2 * sMul;
                c.vy = (Math.random() - 0.5) * 2.2 * sMul;
                c.vz = 2.4 * sMul;
                c.yaw = renderHeadYaw;
              } else if (c.role === 'rearBrace' || c.role === 'bellyBase') {
                // 龙腹与后爪正下方大团如意云底座（托住整条龙的腾空重量感）
                const nd = nodes[c.spawnNode];
                const [sx, sy] = localToWorldXY(nd.x, nd.y, nd.yaw, c.side * 4.2 * sMul, -1.5 * sMul);
                c.x = sx; c.y = sy;
                c.z = Math.max(2.5 * sMul, nd.z - 7.8 * sMul);
                const [dvx, dvy] = localToWorldXY(0, 0, nd.yaw, c.side * 2.8 * sMul, -2.5 * sMul);
                c.vx = dvx; c.vy = dvy; c.vz = 1.1 * sMul;
                c.yaw = nd.yaw;
              } else if (c.role === 'veilFront' || c.role === 'veilMid') {
                // 前景半掩中段躯干，形成「神龙见首不见尾 / 云龙三现」纵深穿插
                const nd = nodes[c.spawnNode];
                const [sx, sy] = localToWorldXY(nd.x, nd.y, nd.yaw, c.side * 5.2 * sMul, 1.2 * sMul);
                c.x = sx; c.y = sy;
                c.z = Math.max(3.5 * sMul, nd.z - 2.2 * sMul);
                const [dvx, dvy] = localToWorldXY(0, 0, nd.yaw, c.side * 3.8 * sMul, -2.0 * sMul);
                c.vx = dvx; c.vy = dvy; c.vz = 1.6 * sMul;
                c.yaw = wrapAngle(nd.yaw + c.side * 0.4);
              } else {
                // 尾段外侧飘逸云尾
                const nd = nodes[c.spawnNode];
                const [sx, sy] = localToWorldXY(nd.x, nd.y, nd.yaw, c.side * 6.5 * sMul, -2.5 * sMul);
                c.x = sx; c.y = sy;
                c.z = Math.max(3.0 * sMul, nd.z - 4.2 * sMul);
                const [dvx, dvy] = localToWorldXY(0, 0, nd.yaw, c.side * 3.2 * sMul, -4.2 * sMul);
                c.vx = dvx; c.vy = dvy; c.vz = 1.3 * sMul;
                c.yaw = nd.yaw;
              }
              c.op = 0.06;
            }
          }
          state.wasCloudPose = isCloudPose;

          const windX = Math.cos(time * 0.28) * 2.4 * sMul;
          const windY = Math.sin(time * 0.24) * 2.0 * sMul;
          for (let i = 0; i < clouds.length; i++) {
            const c = clouds[i];
            if (isCloudPose) {
              // 摆姿期：平滑淡入并向外侧/上方翻涌飘展
              c.op = lerp(c.op, c.maxOp, expSmooth(dt, 4.6));
              c.x += (c.vx + windX) * dt;
              c.y += (c.vy + windY) * dt;
              c.z = Math.max(2.5 * sMul, c.z + c.vz * dt);
              c.vx *= Math.max(0, 1 - dt * 0.55);
              c.vy *= Math.max(0, 1 - dt * 0.55);
              c.yaw = wrapAngle(c.yaw + c.rotSpd * dt);
            } else if (c.op > 0.01) {
              // 恢复自由游动：祥云留在原地随风轻飘并迅速消散归零
              c.op = Math.max(0, c.op - dt * 0.95);
              c.x += (c.vx * 0.6 + windX) * dt;
              c.y += (c.vy * 0.6 + windY) * dt;
              c.z += c.vz * 0.8 * dt;
              c.yaw = wrapAngle(c.yaw + c.rotSpd * 1.4 * dt);
            }
          }

          // 仅在摆姿起云期逸出细碎云絮微粒
          if (vfx && isCloudPose) {
            state.waterCd -= dt;
            if (state.waterCd <= 0) {
              state.waterCd = 0.14;
              const ci = Math.floor(Math.random() * clouds.length);
              const cl = clouds[ci];
              vfx.spawnParticle(
                cl.x + (Math.random() - 0.5) * 5 * sMul,
                cl.y + (Math.random() - 0.5) * 5 * sMul,
                cl.z + (Math.random() - 0.5) * 2 * sMul,
                (Math.random() - 0.5) * 5 * sMul,
                (Math.random() - 0.5) * 5 * sMul,
                (2.0 + Math.random() * 2.8) * sMul,
                0.70 + Math.random() * 0.30, 1.55 + Math.random() * 0.50,
                fx.cloud, false, -2
              );
            }
          }

          // 若切换至水域生境：在龙头与起伏破水节点处激起破水白沫与涟漪
          if (vfx && isWater) {
            state.waterCd -= dt;
            if (state.waterCd <= 0) {
              state.waterCd = 0.16;
              for (const idx of [0, 6, 13]) {
                const nd = nodes[idx];
                if (nd.z > 0.5 * sMul && nd.z < 6.0 * sMul) {
                  EnvFeedback.emitWaterWake(vfx, habitat, nd.x, nd.y, nd.yaw, 5.2 * sMul, 0.8);
                  vfx.spawnSplash(nd.x, nd.y, 2, 0.55, habitat.fx);
                }
              }
            }
          }

          // -----------------------------------------------------------------
          // 5. 全龙包围盒中心锚定（确保 20 节长躯 + 戏珠 360° 绝不裁切）
          // -----------------------------------------------------------------
          let minX = orb.x, maxX = orb.x, minY = orb.y, maxY = orb.y;
          for (let i = 0; i < NUM_NODES; i++) {
            const nd = nodes[i];
            if (nd.x < minX) minX = nd.x;
            if (nd.x > maxX) maxX = nd.x;
            if (nd.y < minY) minY = nd.y;
            if (nd.y > maxY) maxY = nd.y;
          }
          const cx = (minX + maxX) * 0.5;
          const cy = (minY + maxY) * 0.5;
          state.vx = (cx - state.x) / Math.max(dt, 0.001);
          state.vy = (cy - state.y) / Math.max(dt, 0.001);
          state.x = cx;
          state.y = cy;
          state.z = baseLift;
          state.yaw = renderHeadYaw;

          sockets.setLocal('mouth', headCenterX, headCenterY, nodes[0].z, renderHeadYaw, 0, 8.2, 5.0, sMul);
          sockets.setWorld('orb', orb.x, orb.y, orb.z, orb.spin);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const nodes = chain.nodes;
          const isWater = !!(habitat && habitat.isWater);
          const subFn = (z) => isWater ? EnvFeedback.calcSubmerge(z, 3.4 * sMul, 5.6 * sMul, true) : 0;

          // 1. 6 朵「云龙三现」如意金边祥云（底托与前景半掩分层穿插，仅摆姿期出现，游动即消散）
          if (!isWater) {
            for (let i = 0; i < clouds.length; i++) {
              const c = clouds[i];
              if (c.op < 0.04) continue;
              list.push({
                partKey: c.key,
                asset: parts[c.key],
                x: c.x,
                y: c.y,
                lift: Math.max(1.0, c.z),
                ro: c.yaw,
                opacity: c.op,
                bias: c.bias
              });
            }
          }

          // 2. 颈根衔接节 + 18 节拉长胶囊密排龙身（nodes[0] 补桥 + nodes[1..18]，彻底消除头身分离与串珠）
          const [n0x, n0y] = localToWorldXY(nodes[0].x, nodes[0].y, nodes[0].yaw, 0, -0.8 * sMul);
          list.push({
            partKey: 'segNeck',
            asset: parts.segNeck,
            x: n0x,
            y: n0y,
            lift: Math.max(0.2, nodes[0].z - 2.6 * sMul),
            ro: nodes[0].yaw,
            submerge: subFn(nodes[0].z),
            bias: 0.18
          });
          for (let i = 1; i < NUM_NODES - 1; i++) {
            const nd = nodes[i];
            const pk = bodyPartKey(i);
            list.push({
              partKey: pk,
              asset: parts[pk],
              x: nd.x,
              y: nd.y,
              lift: Math.max(0.2, nd.z - 2.6 * sMul),
              ro: nd.yaw,
              submerge: subFn(nd.z),
              bias: 0.16 - i * 0.012
            });
          }

          // 3. 第 19 节尾尖流云鬃簇
          const tailNode = nodes[NUM_NODES - 1];
          const [ttx, tty] = localToWorldXY(tailNode.x, tailNode.y, tailNode.yaw, 0, -1.8 * sMul);
          list.push({
            partKey: 'tailTuft',
            asset: parts.tailTuft,
            x: ttx,
            y: tty,
            lift: Math.max(0.2, tailNode.z - 2.4 * sMul),
            ro: tailNode.yaw,
            submerge: subFn(tailNode.z),
            bias: -0.25
          });

          // 4. 4 只五趾短龙爪（严格锚定 nodes[3] / nodes[12]；摆姿期前爪前探戏珠、后爪向下蹬云！）
          const clawAnchors = [
            { node: nodes[3],  side: -1, key: 'clawL', isFront: true,  phase: 0.0 },
            { node: nodes[3],  side:  1, key: 'clawR', isFront: true,  phase: 1.6 },
            { node: nodes[12], side: -1, key: 'clawL', isFront: false, phase: 3.1 },
            { node: nodes[12], side:  1, key: 'clawR', isFront: false, phase: 4.7 }
          ];
          const tNow = state.patT + state.idleAng;
          const pb = state.poseBlend;
          for (const ca of clawAnchors) {
            const nd = ca.node;
            // 游动期空中抓云微摆；摆姿期前爪向前上方张开探珠，后爪向后下方蹬踏祥云借力
            const gripSwing = Math.sin(tNow * 3.4 + ca.phase) * lerp(0.16, 0.08, pb);
            const poseYawOff = ca.isFront ? (-ca.side * 0.34 * pb) : (ca.side * 0.28 * pb);
            const poseZOff   = ca.isFront ? ( 1.85 * pb * sMul)    : (-1.55 * pb * sMul);
            const poseFwdOff = ca.isFront ? ( 1.15 * pb * sMul)    : (-0.85 * pb * sMul);
            const gripBob = Math.cos(tNow * 3.4 + ca.phase) * 0.55 * sMul;
            const clawYaw = wrapAngle(nd.yaw + ca.side * 0.10 + gripSwing + poseYawOff);
            const [sx, sy] = localToWorldXY(nd.x, nd.y, nd.yaw, ca.side * 3.1 * sMul, 0.5 * sMul + poseFwdOff);
            const [cx, cy] = pivotToWorldXY(sx, sy, clawYaw, -ca.side * 2.0 * sMul, -1.5 * sMul);
            list.push({
              partKey: ca.key,
              asset: parts[ca.key],
              x: cx,
              y: cy,
              lift: Math.max(0.2, nd.z - 5.2 * sMul + gripBob + poseZOff),
              ro: clawYaw,
              submerge: subFn(nd.z - 2.0 * sMul),
              bias: 0.24
            });
          }

          // 5. 威严精雕龙头（pivotToWorldXY 锁死颈枕枢轴，高度与 segNeck 中心严格对齐）
          const hYaw = wrapAngle(nodes[0].yaw + headYawSpring.x);
          const [hx, hy] = pivotToWorldXY(
            nodes[0].x, nodes[0].y, hYaw,
            HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul
          );
          const hKey = state.headPose === 'play' ? 'headPlay' : 'headCalm';
          list.push({
            partKey: hKey,
            asset: parts[hKey],
            x: hx,
            y: hy,
            lift: Math.max(0.4, nodes[0].z - 4.4 * sMul),
            ro: hYaw,
            submerge: subFn(nodes[0].z),
            bias: 0.72
          });

          // 6. 双条 5 节飘逸龙须（沿相邻须节点切线朝向，丝滑连贯）
          for (const w of whiskers) {
            for (let j = 0; j < w.nodes.length; j++) {
              const nd = w.nodes[j];
              const prev = j === 0 ? { x: hx, y: hy } : w.nodes[j - 1];
              const wyaw = Math.atan2(-(prev.x - nd.x), prev.y - nd.y);
              const wKey = j < 2 ? 'whiskerRoot' : 'whiskerTip';
              list.push({
                partKey: wKey,
                asset: parts[wKey],
                x: nd.x,
                y: nd.y,
                lift: Math.max(0.5, nd.z - 1.2 * sMul),
                ro: wyaw,
                submerge: subFn(nd.z),
                bias: 0.78 - j * 0.02
              });
            }
          }

          // 7. 悬浮「赤金戏珠」（仅珠芯自亮）
          list.push({
            partKey: 'orb',
            asset: parts.orb,
            x: orb.x,
            y: orb.y,
            lift: Math.max(1.5, orb.z - 3.8 * sMul),
            ro: orb.spin,
            bias: 0.85
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Special9Def.id,
            code: Special9Def.code,
            name: Special9Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            headPose: state.headPose,
            playStage: state.playStage,
            segmentCount: NUM_NODES,
            segLen: SEG_LEN,
            whiskerSegs: WHISKER_SEGS,
            cloudCount: clouds.length,
            footRadius: Special9Def.footRadius,
            headZ: 26,
            centerZ: 18,
            blocks: Special9Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Special9Def);
})(window.PixelWorkshop);
