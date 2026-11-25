'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, fbm1, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 海4 · 文鳐鱼群（《山海经》白首赤喙翅鲤群 · M13 集群协同编队标杆 · v3 精制）
  //
  // 【前置调研与三维坐标预算记录】
  // 1. 生物原型与运动学调研：
  //    - 外形源自《山海经》文鳐鱼（状如鲤鱼，鱼身鸟翼，青纹白首赤喙）与飞鱼科（Exocoetidae）
  //      流线纺锤体态及高展弦比鸟翼；真实飞鱼出水面时以约 30°~35° 冲破水层，随后在海面上空
  //      地效区展开刚性长翼以平缓弧线高速滑翔，入水前收翼扎入水下恢复摆尾脉冲游动；
  //    - 2D 俯视结构化个体化集群（Individualized V-Formation Boids）：摒弃死板同步克隆，
  //      5 只成员各自拥有独立外观体型（领头冠羽大鲤 / 双纹成鱼 / 灵巧小鱼）、独立速度性格、
  //      独立噪声偏移、独立脉冲摆尾节律与独立破水高度；通过「柔和领航牵引 + 邻居高对齐 +
  //      椭圆分离半径」呈现转弯时外侧兜弧、后队甩尾追赶的鲜活生态鱼群感；
  //    - 错相破水滑翔：领头鱼加速发力，5 只按 0.09~0.14s 微扰错相依次破水（起飞拍水 wingFlap ->
  //      高空展翼滑翔 wingGlide -> 收翼扎水 wingFold），小鱼半空还会轻拍一次翼维持滑翔弧。
  // 2. 三维几何坐标预算表（单件 <= 20 格，严格 <= 40 格，色表 35 色 <= 48）：
  //    - fishBodyLead（0 号领头大鲤，带朱红小头冠与短须）：11×20×11；
  //    - fishBodyA / fishBodyB（1/2 号成鱼，粗斜条纹 vs 细密鳞点花纹）：10×18×10；
  //    - fishBodySmall（3/4 号后翼灵巧小鱼，原生体素缩一档零小数缩放）：9×15×9；
  //    - tailFinLead / tailFin / tailFinSmall（飘带长叉尾 / 标准叉尾 / 轻快小尾）：8×12×10 / 8×10×9 / 7×8×8；
  //    - 成鱼三档鸟翼（wingFold/Glide/Flap L&R）：8×14×8 / 18×12×8 / 16×12×12；
  //    - 小鱼三档鸟翼（wingFoldSmall/GlideSmall/FlapSmall L&R）：7×11×7 / 14×10×7 / 13×10×10；
  //    - kelpBall（中央立体碧绿海藻球）：16×16×12；planktonA/B（浮游亮粒 ×5）：5×5×5。
  // 3. 现有内核复用：
  //    - 零修改 core/；全部部件规范注册进 parts 支持 PW.Assets.spawn 共享贴图。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 洁白圆首（青白调）
      headDark:        '#b4c6d4',
      headMid:         '#e4eff5',
      headHi:          '#fbfdff',
      // 鲜红尖喙与头鱼朱红冠饰
      beakDark:        '#941c24',
      beakMid:         '#df3438',
      beakHi:          '#ff786b',
      // 鲤鱼躯干底色（浅青银白）
      bodyDark:        '#6e9ab0',
      bodyMid:         '#a9d0e0',
      bodyHi:          '#dcf2fa',
      // 苍青条纹与背脊（文鳐苍文）
      stripeDark:      '#133c59',
      stripeMid:       '#22668f',
      stripeHi:        '#499ec4',
      // 鱼腹柔白
      bellyDark:       '#9eb2bd',
      bellyMid:        '#cfdce3',
      bellyHi:         '#eef5f8',
      // 鸟翼前缘覆羽
      wingCovDark:     '#8ea8ba',
      wingCovMid:      '#c5dbe8',
      wingCovHi:       '#f2f9fc',
      // 鸟翼主飞羽（青碧飞羽）
      wingFthDark:     '#174a66',
      wingFthMid:      '#2c7ea6',
      wingFthHi:       '#62b9db',
      // 翼尖与尾鳍饰边（暖珊瑚红点缀）
      wingTipDark:     '#9c3234',
      wingTipMid:      '#d9574e',
      wingTipHi:       '#ff9782',
      // 锐利圆眼（eyeGlint 严禁进 glowKeys）
      eyeDark:         '#0b111a',
      eyeIris:         '#f0b429',
      eyeGlint:        '#f7fcff',
      // 碧绿海藻球主叶（不随鱼群换色）
      kelpDark:        '#144d38',
      kelpMid:         '#23805c',
      kelpHi:          '#48b882',
      // 海藻球嫩绿芽尖
      kelpTipDark:     '#357d4a',
      kelpTipMid:      '#62b869',
      kelpTipHi:       '#a2e68c',
      // 浮游亮粒微亮芯（仅此 2 色进 glowKeys）
      emissiveMid:     '#68e6d8',
      emissiveCore:    '#e6fff9'
    },
    glowKeys: ['emissiveMid', 'emissiveCore'],
    parts: [
      'head', 'beak', 'body', 'stripe', 'belly',
      'wingCov', 'wingFth', 'wingTip', 'eye',
      'kelp', 'kelpTip', 'plankton'
    ],
    noCrease: [
      ['head', 'body'], ['head', 'belly'], ['head', 'eye'], ['head', 'beak'],
      ['body', 'stripe'], ['body', 'belly'],
      ['wingCov', 'wingFth'], ['wingFth', 'wingTip'],
      ['kelp', 'kelpTip']
    ],
    materials: {
      head:    ['headDark',    'headMid',    'headHi'],
      beak:    ['beakDark',    'beakMid',    'beakHi'],
      body:    ['bodyDark',    'bodyMid',    'bodyHi'],
      stripe:  ['stripeDark',  'stripeMid',  'stripeHi'],
      belly:   ['bellyDark',   'bellyMid',   'bellyHi'],
      wingCov: ['wingCovDark', 'wingCovMid', 'wingCovHi'],
      wingFth: ['wingFthDark', 'wingFthMid', 'wingFthHi'],
      wingTip: ['wingTipDark', 'wingTipMid', 'wingTipHi'],
      kelp:    ['kelpDark',    'kelpMid',    'kelpHi'],
      kelpTip: ['kelpTipDark', 'kelpTipMid', 'kelpTipHi']
    },
    protectedParts: ['eye', 'beak', 'plankton']
  });

  // 4 套零重建模换色皮肤（无任何禁用字）
  const SKINS = [
    {
      id: 'azure_white',
      name: '青纹白首（远洋经典）',
      dot: '#2c7ea6',
      outline: '#091826',
      pal: {},
      fx: {
        foamA: '#eefaff',
        foamB: '#9ee3fa',
        mote:  '#7ef2e3'
      }
    },
    {
      id: 'crimson_gold',
      name: '赤鲤金翼（暖海款）',
      dot: '#d94836',
      outline: '#210c0a',
      pal: {
        headDark:    '#c9b3a3', headMid:    '#f2e3d5', headHi:    '#fffaf2',
        beakDark:    '#8c1818', beakMid:    '#d92b24', beakHi:    '#ff6b52',
        bodyDark:    '#8f261e', bodyMid:    '#d64733', bodyHi:    '#ff8261',
        stripeDark:  '#591414', stripeMid:  '#9e221b', stripeHi:  '#db4835',
        bellyDark:   '#b89274', bellyMid:   '#ebd0b2', bellyHi:   '#fff1db',
        wingCovDark: '#b3761b', wingCovMid: '#eba934', wingCovHi: '#ffe07d',
        wingFthDark: '#994b14', wingFthMid: '#de7c26', wingFthHi: '#ffba52',
        wingTipDark: '#871d1d', wingTipMid: '#cc352b', wingTipHi: '#ff745c',
        eyeIris:     '#ffe159'
      },
      fx: {
        foamA: '#fff7eb',
        foamB: '#ffd49c',
        mote:  '#ffe28a'
      }
    },
    {
      id: 'indigo_silver',
      name: '靛蓝银翼（寒海款）',
      dot: '#344c94',
      outline: '#0a0f24',
      pal: {
        headDark:    '#9eb0c9', headMid:    '#d4e2f2', headHi:    '#f5faff',
        beakDark:    '#871e32', beakMid:    '#cc334c', beakHi:    '#ff7084',
        bodyDark:    '#1f2d5e', bodyMid:    '#385199', bodyHi:    '#6c8ad4',
        stripeDark:  '#12193b', stripeMid:  '#22306b', stripeHi:  '#445ba8',
        bellyDark:   '#8092ad', bellyMid:   '#bacbe0', bellyHi:   '#e8f2fc',
        wingCovDark: '#7a8ea8', wingCovMid: '#b8cbe0', wingCovHi: '#edf6ff',
        wingFthDark: '#475e82', wingFthMid: '#7d9bc2', wingFthHi: '#c4dbf2',
        wingTipDark: '#26386e', wingTipMid: '#4664b3', wingTipHi: '#85a8f2',
        eyeIris:     '#8ce0ff'
      },
      fx: {
        foamA: '#edf6ff',
        foamB: '#a8ccf5',
        mote:  '#9ce6ff'
      }
    },
    {
      id: 'jade_white',
      name: '翡翠玉首（浅礁款）',
      dot: '#2ea884',
      outline: '#081c17',
      pal: {
        headDark:    '#9ec9ba', headMid:    '#d6f2e8', headHi:    '#f4fffb',
        beakDark:    '#a32c24', beakMid:    '#e64c3c', beakHi:    '#ff8e78',
        bodyDark:    '#186b58', bodyMid:    '#2ea884', bodyHi:    '#6ee0b8',
        stripeDark:  '#0e453b', stripeMid:  '#1c7863', stripeHi:  '#42b596',
        bellyDark:   '#92bfb0', bellyMid:   '#c9ebe0', bellyHi:   '#edfcf7',
        wingCovDark: '#72b8a4', wingCovMid: '#b0e8d6', wingCovHi: '#e6fff7',
        wingFthDark: '#16635c', wingFthMid: '#2ca393', wingFthHi: '#6ce0cc',
        wingTipDark: '#9e6c1c', wingTipMid: '#de9f33', wingTipHi: '#ffd978',
        eyeIris:     '#ffd152'
      },
      fx: {
        foamA: '#ebfff8',
        foamB: '#94ebd4',
        mote:  '#a8ffe3'
      }
    }
  ];

  // =========================================================================
  // 1. 个体化鱼身建模：领头冠羽大鲤 / 粗纹成鱼 A / 碎斑成鱼 B / 灵巧小鱼 Small
  //    每种都是独立体素尺寸与花纹细节，告别复制粘贴模板感！
  // =========================================================================
  function buildFishBodyVariant(makeCanvas, variant) {
    const isLead = variant === 'lead';
    const isSmall = variant === 'small';
    const isSpot = variant === 'spot';

    const W = isLead ? 11 : (isSmall ? 9 : 10);
    const D = isLead ? 20 : (isSmall ? 15 : 18);
    const H = isLead ? 11 : (isSmall ? 9 : 10);
    const sc = isLead ? 1.09 : (isSmall ? 0.84 : 1.0);
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-5.2, 5.2, -9.5, 9.5, 0, H - 1, (x, y, z, X, Y) => {
      const lx = X / sc, ly = Y / sc, lz = z / sc;
      const dHead = (Math.hypot(lx / 3.4, (ly - 3.6) / 3.1, (lz - 5.1) / 3.2) - 1.0) * 3.0;
      const dMid  = (Math.hypot(lx / 3.7, (ly + 0.6) / 5.4, (lz - 5.0) / 3.5) - 1.0) * 3.6;
      const dTail = (Math.hypot(lx / 2.1, (ly + 5.6) / 3.2, (lz - 4.8) / 2.4) - 1.0) * 2.4;

      const d = smin(smin(dHead, dMid, 1.4), dTail, 1.3);
      if (d > 0) return;
      if (z < 1) return;

      // 洁白圆首范围（领头鱼白首更饱满，小鱼圆头占比稍大显灵动）
      const headCut = isSmall ? 1.5 : 2.0;
      if (ly >= headCut + Math.abs(lx) * 0.16) {
        m.setRaw(x, y, z, mat('head'), partId.head);
      } else if (lz <= 3.0 && Math.abs(lx) < 2.6) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
      } else if (isSpot) {
        // 成鱼 B：青背脊 + 交错斜向碎斑纹（区别于成鱼 A 的三道粗横带）
        const spot = Math.sin(ly * 1.9 + lx * 1.5) * Math.cos(ly * 1.1 - lx * 1.8);
        const onRidge = lz >= 6.8 && Math.abs(lx) <= 1.5;
        if (onRidge || (lz >= 4.2 && spot > 0.28)) {
          m.setRaw(x, y, z, mat('stripe'), partId.stripe);
        } else {
          m.setRaw(x, y, z, mat('body'), partId.body);
        }
      } else if (isSmall) {
        // 小鱼：双道清秀青带 + 浅青尾柄，清新轻快
        const band = Math.sin((ly + Math.abs(lx) * 0.4) * 1.15);
        const onRidge = lz >= 6.9 && Math.abs(lx) <= 1.1;
        if (onRidge || (lz >= 4.5 && band > 0.35)) {
          m.setRaw(x, y, z, mat('stripe'), partId.stripe);
        } else {
          m.setRaw(x, y, z, mat('body'), partId.body);
        }
      } else {
        // 领头鱼 & 成鱼 A：清晰人字形三道苍青条纹
        const band = Math.sin((ly + Math.abs(lx) * 0.55) * 1.45);
        const onRidge = lz >= 7.0 && Math.abs(lx) <= 1.3;
        if (onRidge || (lz >= 4.0 && band > 0.25)) {
          m.setRaw(x, y, z, mat('stripe'), partId.stripe);
        } else {
          m.setRaw(x, y, z, mat('body'), partId.body);
        }
      }
    });

    // 鲜红尖喙（深嵌白首，领头鱼喙更修长锐利，小鱼短俏）
    const beakTipY = isLead ? 9.1 : (isSmall ? 6.9 : 8.2);
    m.paintCapsule(0, 4.6 * sc, 5.2 * sc, 0, beakTipY, 4.8 * sc, 1.32 * sc, 0.44 * sc, mat('beak'), partId.beak, true);
    m.paintCapsule(0, 5.1 * sc, 4.5 * sc, 0, beakTipY - 0.6, 4.3 * sc, 1.02 * sc, 0.38 * sc, mat('beak'), partId.beak, true);

    // 领头大鲤专属辨识特征：头顶一簇朱红后掠冠羽 + 颌下短鲤须 + 高耸背鳍
    if (isLead) {
      m.paintCapsule(0, 3.6, 8.2, 0, 0.6, 10.2, 0.95, 0.52, mat('beak'), partId.beak, true);
      for (const s of [-1, 1]) {
        m.paintCapsule(s * 1.1, 3.2, 7.9, s * 2.1, 1.2, 9.4, 0.68, 0.42, mat('wingTip'), partId.wingTip, true);
        // 短鲤须
        m.paintCapsule(s * 2.0, 5.8, 4.2, s * 3.8, 4.4, 3.4, 0.52, 0.35, mat('wingTip'), partId.wingTip, true);
      }
      m.paintFinTri([0, 0.8, 8.2], [0, -5.0, 7.6], [0, -2.2, 10.4], 0.62, mat('stripe'), partId.stripe, true);
      m.paintEllipsoid(0, -2.3, 10.1, 0.65, 0.9, 0.65, mat('wingTip'), partId.wingTip, true);
    } else {
      m.paintFinTri([0, 0.6 * sc, 7.6 * sc], [0, -4.4 * sc, 7.2 * sc], [0, -2.2 * sc, 9.2 * sc], 0.56 * sc, mat('stripe'), partId.stripe, true);
    }

    // 胸侧翼肩座（确保三档翼根 100% 嵌进鱼肩，零脱节）
    for (const s of [-1, 1]) {
      m.paintEllipsoid(s * 2.5 * sc, 0.8 * sc, 5.3 * sc, 1.42 * sc, 1.95 * sc, 1.42 * sc, mat('wingCov'), partId.wingCov, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 锐利圆眼（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 3.8 * sc);
    const eyeZ = Math.round(5.0 * sc);
    for (const s of [-1, 1]) {
      let sx = -1;
      for (let step = 0; step < 4; step++) {
        const tx = Math.round(hw + s * (3.7 * sc - step));
        if (m.getId(tx, eyeY, eyeZ)) { sx = tx; break; }
      }
      if (sx < 0) sx = Math.round(hw + s * 2.7 * sc);
      m.setRaw(sx, eyeY,     eyeZ,     keyToId.eyeIris,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ,     keyToId.eyeDark,  partId.eye);
      m.setRaw(sx, eyeY,     eyeZ + 1, keyToId.eyeDark,  partId.eye);
      m.setRaw(sx, eyeY + 1, eyeZ + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 4.5 * sc, headZ: H - 1, centerZ: Math.round(H * 0.5) });
  }

  // =========================================================================
  // 2. 个体化独立叉尾鳍（领头长飘尾 / 标准叉尾 / 小鱼轻快尾）
  // =========================================================================
  const TAIL_PIVOTS = {
    lead:  { x: 0, y: 4.2, attachY: -6.9 },
    std:   { x: 0, y: 3.4, attachY: -6.4 },
    small: { x: 0, y: 2.7, attachY: -5.3 }
  };

  function buildTailFinVariant(makeCanvas, variant) {
    const isLead = variant === 'lead';
    const isSmall = variant === 'small';
    const W = isSmall ? 7 : 8;
    const D = isLead ? 12 : (isSmall ? 8 : 10);
    const H = isLead ? 10 : (isSmall ? 8 : 9);
    const sc = isLead ? 1.12 : (isSmall ? 0.82 : 1.0);
    const pivY = TAIL_PIVOTS[variant].y;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.paintEllipsoid(0, pivY - 0.4, 4.4 * sc, 1.7 * sc, 1.8 * sc, 1.8 * sc, mat('body'), partId.body, true);
    const tipY = isLead ? -4.8 : (isSmall ? -2.9 : -3.6);
    m.paintFinTri([0, pivY - 0.5, 4.6 * sc], [0, tipY, (H - 1.2)], [0, tipY * 0.45, 4.8 * sc], 0.7 * sc, mat('wingFth'), partId.wingFth, true);
    m.paintFinTri([0, pivY - 0.5, 4.2 * sc], [0, tipY, 1.2],       [0, tipY * 0.45, 4.0 * sc], 0.7 * sc, mat('wingFth'), partId.wingFth, true);

    for (const s of [-1, 1]) {
      m.paintCapsule(0, pivY - 1.0, 4.5 * sc, s * 2.2 * sc, tipY + 0.2, 5.2 * sc, 0.82 * sc, 0.46 * sc, mat('wingFth'), partId.wingFth, false);
      m.paintEllipsoid(s * 2.2 * sc, tipY + 0.1, 5.3 * sc, 0.76 * sc, 0.84 * sc, 0.82 * sc, mat('wingTip'), partId.wingTip, true);
    }
    m.paintEllipsoid(0, tipY, H - 1.4, 0.72 * sc, 0.84 * sc, 0.8 * sc, mat('wingTip'), partId.wingTip, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2 * sc, headZ: H - 1, centerZ: Math.round(H * 0.5) });
  }

  // =========================================================================
  // 3. 三档无损鸟翼（成鱼规格 + 小鱼轻灵规格，彻底零小数拉伸！）
  // =========================================================================
  const WING_PIVOT_STD = {
    fold:  { x: 1.2, y: 3.4, attachX: 2.4, attachY: 0.8 },
    glide: { x: 6.6, y: 1.0, attachX: 2.4, attachY: 0.8 },
    flap:  { x: 5.6, y: 1.0, attachX: 2.4, attachY: 0.8 }
  };
  const WING_PIVOT_SMALL = {
    fold:  { x: 1.0, y: 2.7, attachX: 2.0, attachY: 0.6 },
    glide: { x: 5.2, y: 0.8, attachX: 2.0, attachY: 0.6 },
    flap:  { x: 4.5, y: 0.8, attachX: 2.0, attachY: 0.6 }
  };

  function buildWingFold(makeCanvas, side, isSmall) {
    const sc = isSmall ? 0.80 : 1.0;
    const W = isSmall ? 7 : 8, D = isSmall ? 11 : 14, H = isSmall ? 7 : 8;
    const piv = isSmall ? WING_PIVOT_SMALL.fold : WING_PIVOT_STD.fold;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const px = -side * piv.x, py = piv.y;

    m.paintEllipsoid(px, py, 3.8 * sc, 1.55 * sc, 2.0 * sc, 1.45 * sc, mat('wingCov'), partId.wingCov, true);
    m.paintCapsule(px, py, 3.8 * sc, side * 1.4 * sc, -1.2 * sc, 4.0 * sc, 1.35 * sc, 1.05 * sc, mat('wingCov'), partId.wingCov, true);
    m.paintCapsule(side * 1.2 * sc, -0.4 * sc, 3.8 * sc, side * 1.9 * sc, -5.6 * sc, 3.6 * sc, 1.15 * sc, 0.62 * sc, mat('wingFth'), partId.wingFth, true);
    m.paintFinTri([px, py - 0.6 * sc, 3.8 * sc], [side * 2.2 * sc, -1.8 * sc, 4.2 * sc], [side * 1.2 * sc, -6.0 * sc, 3.4 * sc], 0.65 * sc, mat('wingFth'), partId.wingFth, false);
    m.paintEllipsoid(side * 1.7 * sc, -5.8 * sc, 3.5 * sc, 0.72 * sc, 0.95 * sc, 0.68 * sc, mat('wingTip'), partId.wingTip, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6 * sc, headZ: H - 1, centerZ: Math.round(H * 0.5) });
  }

  function buildWingGlide(makeCanvas, side, isSmall) {
    const sc = isSmall ? 0.78 : 1.0;
    const W = isSmall ? 14 : 18, D = isSmall ? 10 : 12, H = isSmall ? 7 : 8;
    const piv = isSmall ? WING_PIVOT_SMALL.glide : WING_PIVOT_STD.glide;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const rx = -side * piv.x, ry = piv.y;

    m.paintEllipsoid(rx, ry, 3.4 * sc, 1.9 * sc, 2.1 * sc, 1.55 * sc, mat('wingCov'), partId.wingCov, true);
    m.paintCapsule(rx, ry + 0.6 * sc, 3.5 * sc, side * 1.2 * sc, ry + 1.8 * sc, 4.4 * sc, 1.45 * sc, 1.15 * sc, mat('wingCov'), partId.wingCov, true);
    m.paintCapsule(side * 1.2 * sc, ry + 1.8 * sc, 4.4 * sc, side * 7.8 * sc, ry - 0.2 * sc, 5.2 * sc, 1.15 * sc, 0.62 * sc, mat('wingCov'), partId.wingCov, true);

    m.paintFinTri([rx, ry + 0.4 * sc, 3.4 * sc], [side * 1.8 * sc, ry + 1.6 * sc, 4.2 * sc], [side * 0.2 * sc, ry - 4.2 * sc, 3.6 * sc], 0.72 * sc, mat('wingFth'), partId.wingFth, false);
    m.paintFinTri([side * 1.4 * sc, ry + 1.6 * sc, 4.2 * sc], [side * 7.8 * sc, ry - 0.2 * sc, 5.0 * sc], [side * 0.2 * sc, ry - 4.2 * sc, 3.6 * sc], 0.68 * sc, mat('wingFth'), partId.wingFth, false);
    m.paintFinTri([side * 0.2 * sc, ry - 4.2 * sc, 3.6 * sc], [side * 7.6 * sc, ry - 0.4 * sc, 4.9 * sc], [side * 5.2 * sc, ry - 4.6 * sc, 4.2 * sc], 0.62 * sc, mat('wingFth'), partId.wingFth, false);

    const tips = [
      { ax: side * 5.2 * sc, ay: ry + 0.4 * sc, az: 4.8 * sc, bx: side * 8.4 * sc, by: ry - 0.4 * sc, bz: 5.5 * sc },
      { ax: side * 4.4 * sc, ay: ry - 1.4 * sc, az: 4.4 * sc, bx: side * 7.6 * sc, by: ry - 2.6 * sc, bz: 4.9 * sc },
      { ax: side * 3.2 * sc, ay: ry - 2.8 * sc, az: 4.0 * sc, bx: side * 6.0 * sc, by: ry - 4.6 * sc, bz: 4.3 * sc }
    ];
    for (const tp of tips) {
      m.paintCapsule(tp.ax, tp.ay, tp.az, tp.bx, tp.by, tp.bz, 0.72 * sc, 0.46 * sc, mat('wingTip'), partId.wingTip, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.5 * sc, headZ: H - 1, centerZ: Math.round(H * 0.5) });
  }

  function buildWingFlap(makeCanvas, side, isSmall) {
    const sc = isSmall ? 0.80 : 1.0;
    const W = isSmall ? 13 : 16, D = isSmall ? 10 : 12, H = isSmall ? 10 : 12;
    const piv = isSmall ? WING_PIVOT_SMALL.flap : WING_PIVOT_STD.flap;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const rx = -side * piv.x, ry = piv.y;

    m.paintEllipsoid(rx, ry, 5.2 * sc, 1.85 * sc, 2.0 * sc, 1.55 * sc, mat('wingCov'), partId.wingCov, true);
    m.paintCapsule(rx, ry + 0.4 * sc, 5.4 * sc, side * 0.6 * sc, ry + 1.6 * sc, 8.6 * sc, 1.42 * sc, 1.15 * sc, mat('wingCov'), partId.wingCov, true);
    m.paintCapsule(side * 0.6 * sc, ry + 1.6 * sc, 8.6 * sc, side * 6.4 * sc, ry - 1.0 * sc, 3.2 * sc, 1.12 * sc, 0.62 * sc, mat('wingCov'), partId.wingCov, true);

    m.paintFinTri([rx, ry + 0.2 * sc, 5.2 * sc], [side * 0.6 * sc, ry + 1.5 * sc, 8.5 * sc], [0, ry - 4.0 * sc, 4.6 * sc], 0.72 * sc, mat('wingFth'), partId.wingFth, false);
    m.paintFinTri([side * 0.6 * sc, ry + 1.5 * sc, 8.5 * sc], [side * 6.4 * sc, ry - 1.0 * sc, 3.2 * sc], [0, ry - 4.0 * sc, 4.6 * sc], 0.68 * sc, mat('wingFth'), partId.wingFth, false);
    m.paintFinTri([0, ry - 4.0 * sc, 4.6 * sc], [side * 6.4 * sc, ry - 1.0 * sc, 3.2 * sc], [side * 4.4 * sc, ry - 4.6 * sc, 2.2 * sc], 0.62 * sc, mat('wingFth'), partId.wingFth, false);

    m.paintCapsule(side * 4.2 * sc, ry - 0.6 * sc, 5.2 * sc, side * 7.0 * sc, ry - 1.2 * sc, 2.4 * sc, 0.72 * sc, 0.48 * sc, mat('wingTip'), partId.wingTip, true);
    m.paintCapsule(side * 3.0 * sc, ry - 2.6 * sc, 4.0 * sc, side * 5.4 * sc, ry - 4.2 * sc, 1.8 * sc, 0.68 * sc, 0.45 * sc, mat('wingTip'), partId.wingTip, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.8 * sc, headZ: H - 2, centerZ: Math.round(H * 0.5) });
  }

  // =========================================================================
  // 4. 待机交互物：碧绿立体海藻球（16×16×12）+ 浮游亮粒（5×5×5）
  // =========================================================================
  function buildKelpBall(makeCanvas) {
    const W = 16, D = 16, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.paintEllipsoid(0, 0, 4.2, 4.8, 4.8, 3.2, mat('kelp'), partId.kelp, true);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + 0.22;
      const rMid = 4.6 + (i % 2) * 1.1;
      const rTip = 6.2 + (i % 2) * 0.9;
      const zMid = 5.4 + (i % 3) * 0.9;
      const zTip = 3.8 + ((i + 1) % 3) * 1.2;
      const mx = Math.cos(a) * rMid, my = Math.sin(a) * rMid;
      const tx = Math.cos(a + 0.18) * rTip, ty = Math.sin(a + 0.18) * rTip;
      m.paintCapsule(Math.cos(a) * 1.8, Math.sin(a) * 1.8, 3.8, mx, my, zMid, 1.75, 1.35, mat('kelp'), partId.kelp, true);
      m.paintCapsule(mx, my, zMid, tx, ty, zTip, 1.25, 0.72, mat('kelpTip'), partId.kelpTip, true);
    }
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * TAU + 0.6;
      m.paintCapsule(Math.cos(a) * 1.1, Math.sin(a) * 1.1, 6.4, Math.cos(a) * 2.2, Math.sin(a) * 2.2, 9.8, 1.15, 0.65, mat('kelpTip'), partId.kelpTip, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.4, headZ: 10, centerZ: 4 });
  }

  function buildPlanktonMote(makeCanvas, bright) {
    const W = 5, D = 5, H = 5;
    const m = new VoxelModel(W, D, H, SPEC);
    const { partId, keyToId } = SPEC;
    m.paintEllipsoid(0, 0, 2.0, 1.25, 1.25, 1.15, keyToId.emissiveMid, partId.plankton, true);
    m.setRaw(2, 2, 2, keyToId.emissiveCore, partId.plankton);
    if (bright) m.setRaw(2, 2, 3, keyToId.emissiveCore, partId.plankton);
    return m.toStripAsset(makeCanvas, { footRadius: 1.5, headZ: 4, centerZ: 2 });
  }

  // =========================================================================
  // 5 只独立文鳐鱼成员档案（外观体型 + 编队槽位 + 速度/转向/摆尾/滑翔/待机性格）
  //   告别克隆体：每只鱼有独立体素身形、独立游速与噪声漫游、独立跃水高度与补拍习惯！
  // =========================================================================
  const MEMBER_PROFILES = [
    {
      idx: 0, role: 'lead',
      bodyKey: 'fishBodyLead', tailKey: 'tailFinLead', tailCfg: 'lead', wingSize: 'std',
      slotX:   0.0, slotY:  12.5, baseDelay: 0.00,
      speedMul: 1.04, turnRate: 3.4, followGain: 3.6, wanderAmp: 2.2, wanderSeed: 101,
      tailFreqMul: 0.92, phase: 0.00, bobAmp: 0.50,
      peakH: 19.6, idlePeakH: 14.5, flightDurMul: 1.08, midFlap: false,
      idleR: 21.0, idleSpd: 0.66, idleDir: 1, idleAng0: 0.20, footR: 4.8
    },
    {
      idx: 1, role: 'wingL1',
      bodyKey: 'fishBodyA', tailKey: 'tailFin', tailCfg: 'std', wingSize: 'std',
      slotX: -17.8, slotY:  -3.2, baseDelay: 0.10,
      speedMul: 0.98, turnRate: 3.9, followGain: 2.8, wanderAmp: 3.6, wanderSeed: 211,
      tailFreqMul: 1.02, phase: 1.35, bobAmp: 0.62,
      peakH: 16.8, idlePeakH: 12.6, flightDurMul: 1.00, midFlap: false,
      idleR: 16.5, idleSpd: 0.78, idleDir: 1, idleAng0: 1.65, footR: 4.1
    },
    {
      idx: 2, role: 'wingR1',
      bodyKey: 'fishBodyB', tailKey: 'tailFin', tailCfg: 'std', wingSize: 'std',
      slotX:  18.2, slotY:  -4.6, baseDelay: 0.21,
      speedMul: 1.02, turnRate: 3.7, followGain: 2.7, wanderAmp: 3.9, wanderSeed: 307,
      tailFreqMul: 0.97, phase: 2.55, bobAmp: 0.66,
      peakH: 17.5, idlePeakH: 13.4, flightDurMul: 1.03, midFlap: false,
      idleR: 24.5, idleSpd: 0.58, idleDir: 1, idleAng0: 2.85, footR: 4.1
    },
    {
      idx: 3, role: 'youngL2',
      bodyKey: 'fishBodySmall', tailKey: 'tailFinSmall', tailCfg: 'small', wingSize: 'small',
      slotX: -31.5, slotY: -19.2, baseDelay: 0.31,
      speedMul: 1.07, turnRate: 4.6, followGain: 2.4, wanderAmp: 4.8, wanderSeed: 419,
      tailFreqMul: 1.18, phase: 3.80, bobAmp: 0.72,
      peakH: 14.2, idlePeakH: 11.2, flightDurMul: 0.94, midFlap: true,
      idleR: 18.8, idleSpd: 0.86, idleDir: 1, idleAng0: 4.15, footR: 3.5
    },
    {
      idx: 4, role: 'youngR2',
      bodyKey: 'fishBodySmall', tailKey: 'tailFinSmall', tailCfg: 'small', wingSize: 'small',
      slotX:  32.0, slotY: -20.6, baseDelay: 0.43,
      speedMul: 0.95, turnRate: 4.4, followGain: 2.3, wanderAmp: 5.1, wanderSeed: 523,
      tailFreqMul: 1.14, phase: 5.05, bobAmp: 0.74,
      peakH: 15.0, idlePeakH: 11.8, flightDurMul: 0.96, midFlap: true,
      idleR: 26.8, idleSpd: 0.70, idleDir: 1, idleAng0: 5.35, footR: 3.5
    }
  ];

  // 5 颗环绕碧绿海藻球漂浮的浮游亮粒预设
  const PLANKTON_PRESETS = [
    { key: 'planktonA', ang: 0.30, rad: 10.5, zOff: 3.4, spd:  0.48, phase: 0.2 },
    { key: 'planktonB', ang: 1.55, rad: 12.4, zOff: 4.6, spd: -0.42, phase: 1.4 },
    { key: 'planktonA', ang: 2.80, rad:  9.8, zOff: 2.9, spd:  0.54, phase: 2.7 },
    { key: 'planktonB', ang: 4.10, rad: 13.0, zOff: 4.1, spd: -0.38, phase: 3.9 },
    { key: 'planktonA', ang: 5.35, rad: 11.2, zOff: 3.6, spd:  0.45, phase: 5.1 }
  ];

  const Sea4Def = {
    id: 'sea4_wenyao',
    code: '海4',
    status: 'done',
    name: '海4 · 文鳐鱼群',
    tag: '集群协同编队 · 5只独立个体破水滑翔',
    summary: 'v3 精制（M13 集群标杆）：单脚本驱动 5 只形态与性格各异的白首赤喙翅鲤（朱冠领头大鲤 / 双纹成鱼 / 灵巧小鱼），各自独立游动与错相破水展翼滑翔，待机绕碧绿海藻球各循轨道啄食浮游亮粒',
    defaultHabitat: 'openSea',
    footRadius: 0.5, // 主坐标不画多余大圆印，由 footContacts 为 5 只鱼 + 海藻球各自独立绘制暗印
    ecoWeight: 0.9,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true, status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true, status: 'done' }
    ],
    blocks: [
      '5 只独立个体形态（朱冠头鱼 / 双纹成鱼 / 灵巧小鱼）',
      '柔性领航 + 独立速度噪声 + 椭圆分离生态编队',
      '成鱼/小鱼两档体型三姿无损鸟翼（收翼 / 拍水 / 滑翔）',
      '0.09~0.14s 微扰错相破水抛物线与 submerge 同步',
      '碧绿海藻球 + 浮游亮粒独立轮流啄食与低空齐跃'
    ],
    soulHabit: '朱冠领头大鲤率双纹成鱼与灵巧小鱼在水下各自摆尾潜游、转弯时外侧兜弧后队甩尾追赶 -> 领头鱼加速破浪，5 只按错相依次拍水冲出海面展翼滑翔（高低错落、小鱼半空轻补拍）再依次扎水溅花；待机时各自绕碧绿海藻球自由游弋轮流啄食微粒',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        // 4 种个体化鱼身 + 3 种个体化叉尾鳍
        fishBodyLead:    buildFishBodyVariant(makeCanvas, 'lead'),
        fishBodyA:       buildFishBodyVariant(makeCanvas, 'stripe'),
        fishBodyB:       buildFishBodyVariant(makeCanvas, 'spot'),
        fishBodySmall:   buildFishBodyVariant(makeCanvas, 'small'),
        tailFinLead:     buildTailFinVariant(makeCanvas, 'lead'),
        tailFin:         buildTailFinVariant(makeCanvas, 'std'),
        tailFinSmall:    buildTailFinVariant(makeCanvas, 'small'),
        // 成鱼三档无损鸟翼
        wingFoldL:       buildWingFold(makeCanvas, -1, false),
        wingFoldR:       buildWingFold(makeCanvas,  1, false),
        wingGlideL:      buildWingGlide(makeCanvas, -1, false),
        wingGlideR:      buildWingGlide(makeCanvas,  1, false),
        wingFlapL:       buildWingFlap(makeCanvas, -1, false),
        wingFlapR:       buildWingFlap(makeCanvas,  1, false),
        // 后翼小鱼轻灵三档鸟翼（原生体素尺寸，零小数缩放）
        wingFoldSmallL:  buildWingFold(makeCanvas, -1, true),
        wingFoldSmallR:  buildWingFold(makeCanvas,  1, true),
        wingGlideSmallL: buildWingGlide(makeCanvas, -1, true),
        wingGlideSmallR: buildWingGlide(makeCanvas,  1, true),
        wingFlapSmallL:  buildWingFlap(makeCanvas, -1, true),
        wingFlapSmallR:  buildWingFlap(makeCanvas,  1, true),
        // 待机交互物：碧绿海藻球 + 浮游亮粒
        kelpBall:        buildKelpBall(makeCanvas),
        planktonA:       buildPlanktonMote(makeCanvas, true),
        planktonB:       buildPlanktonMote(makeCanvas, false)
      };

      // 海藻球与浮游亮粒保持自然碧绿与清亮微粒色，全部鱼体部件随 4 套皮肤换色
      const fishRecolorAssets = Object.keys(parts)
        .filter(k => k !== 'kelpBall' && !k.startsWith('plankton'))
        .map(k => parts[k]);

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;
      const seed = opts.seed ?? 29;

      // 领航点状态（驱动鱼群大弧线巡游）
      const leader = {
        x: hx0,
        y: hy0,
        yaw: hyaw0,
        orbitAng: 0.4,
        orbitDir: 1
      };

      // 5 只鱼群独立个体运动状态
      const members = MEMBER_PROFILES.map((prof) => ({
        ...prof,
        x: hx0,
        y: hy0,
        z: 1.8,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        tailPhase: prof.phase * 2.0,
        tailYaw: 0,
        wingPose: 'fold', // 'fold' | 'flap' | 'glide'
        delay: prof.baseDelay,
        glideYawBias: 0,
        inAir: false,
        breached: false,
        splashed: false,
        wakeCd: prof.idx * 0.08,
        glideTrailCd: 0,
        idleAng: prof.idleAng0,
        peckAmt: 0,
        peckTargetX: hx0,
        peckTargetY: hy0
      }));

      // 场地中央碧绿海藻球 + 5 颗浮游亮粒
      const kelp = {
        x: hx0,
        y: hy0,
        z: 1.6,
        yaw: 0.3,
        shake: new SpringDamper1D(0, 72, 5.2)
      };

      const planktons = PLANKTON_PRESETS.map((p, i) => ({
        idx: i,
        partKey: p.key,
        ang: p.ang,
        rad: p.rad,
        zOff: p.zOff,
        spd: p.spd,
        phase: p.phase,
        x: hx0,
        y: hy0,
        z: 3.5,
        eatenTimer: 0
      }));

      const state = {
        x: hx0,
        y: hy0,
        z: 2.0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        flockMode: 'swim',
        modeTimer: 2.0,
        swimDuration: 4.8,
        glideSeq: 1,
        idleGlideActive: false,
        idleGlideTimer: 0,
        idleCycleTimer: 2.0,
        peckCd: 0.8
      };

      const sockets = new SocketTracker();
      const footContacts = Array.from({ length: MEMBER_PROFILES.length + 1 }, () => ({ x: hx0, y: hy0, z: 0, r: 4.2 }));
      let curSkin = SKINS[0];

      // 每次起飞为 5 只个体微扰错相延迟与滑翔侧弧，避免每次齐飞像复制回放
      function rollFlightVariation() {
        state.glideSeq++;
        for (let i = 0; i < members.length; i++) {
          const mb = members[i];
          const j1 = hash2i(state.glideSeq, i + 1, seed + 17) - 0.5;
          const j2 = hash2i(state.glideSeq, i + 1, seed + 83) - 0.5;
          mb.delay = i === 0 ? 0 : Math.max(0.08, mb.baseDelay + j1 * 0.05);
          mb.glideYawBias = j2 * 0.24;
          mb.breached = false;
          mb.splashed = false;
        }
      }

      const instance = {
        def: Sea4Def,
        cachePrefix: `sea4_wenyao_${Math.random().toString(36).slice(2, 7)}`,
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
          for (const a of fishRecolorAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 2.0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.flockMode = 'swim';
          state.modeTimer = 2.2;
          state.glideSeq = 1;
          state.idleGlideActive = false;
          state.idleGlideTimer = 0;
          state.idleCycleTimer = 2.0;
          state.peckCd = 0.8;

          leader.x = homeX;
          leader.y = homeY + 26;
          leader.yaw = homeYaw;
          leader.orbitAng = 0.4;

          kelp.x = homeX;
          kelp.y = homeY;
          kelp.z = 1.6;
          kelp.yaw = 0.3;
          kelp.shake.x = kelp.shake.v = 0;

          for (let i = 0; i < members.length; i++) {
            const mb = members[i];
            const [mx, my] = localToWorldXY(leader.x, leader.y, leader.yaw, mb.slotX, mb.slotY);
            mb.x = mx;
            mb.y = my;
            mb.z = 1.8;
            mb.vx = 0;
            mb.vy = 0;
            mb.yaw = leader.yaw;
            mb.wingPose = 'fold';
            mb.inAir = false;
            mb.breached = false;
            mb.splashed = false;
            mb.idleAng = mb.idleAng0;
            mb.peckAmt = 0;
          }

          for (let i = 0; i < planktons.length; i++) {
            const pk = planktons[i];
            pk.ang = PLANKTON_PRESETS[i].ang;
            pk.x = homeX + Math.cos(pk.ang) * pk.rad;
            pk.y = homeY + Math.sin(pk.ang) * pk.rad;
            pk.z = pk.zOff;
            pk.eatenTimer = 0;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const isIdle = !!(eco && (eco.action === 'idle' || eco.patrol === false));
          const isWater = !!(habitat && habitat.isWater);
          const fx = curSkin.fx || SKINS[0].fx;
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const maxR = ((eco && eco.maxRadius) || 48) * clamp(sMul, 0.85, 1.15);

          // -----------------------------------------------------------------
          // 1. 中央碧绿海藻球与 5 颗浮游亮粒随波微浮
          // -----------------------------------------------------------------
          const shakeVal = kelp.shake.update(dt, 0, 72 * sp, 5.2);
          kelp.x = homeX + Math.sin(time * 0.72) * 0.55 * sMul + shakeVal * 0.65 * sMul;
          kelp.y = homeY + Math.cos(time * 0.64) * 0.55 * sMul;
          kelp.z = (1.55 + Math.sin(time * 1.65) * 0.25) * sMul;
          kelp.yaw = wrapAngle(kelp.yaw + dt * 0.16);

          for (let i = 0; i < planktons.length; i++) {
            const pk = planktons[i];
            pk.ang = wrapAngle(pk.ang + dt * pk.spd * (0.75 + gFreq * 0.25));
            if (pk.eatenTimer > 0) {
              pk.eatenTimer -= dt;
              continue;
            }
            const r = (pk.rad + Math.sin(time * 1.4 + pk.phase) * 1.4) * sMul;
            pk.x = kelp.x + Math.cos(pk.ang) * r;
            pk.y = kelp.y + Math.sin(pk.ang) * r;
            pk.z = (pk.zOff + Math.sin(time * 2.2 + pk.phase) * 0.65) * sMul;
          }

          // -----------------------------------------------------------------
          // 2. 双态控制：巡游（柔性 V 阵潜游 <-> 个体错相破水滑翔）
          //              待机（各自独立轨道绕藻啄食 <-> 周期齐跃低空滑翔）
          // -----------------------------------------------------------------
          const baseFlightDur = clamp(2.05 / Math.pow(spdMul, 0.35), 1.45, 2.75);
          const maxStaggerSpan = 0.50 + baseFlightDur * 1.10;

          if (!isIdle) {
            state.idleGlideActive = false;
            state.modeTimer += dt;
            if (state.flockMode === 'swim' && state.modeTimer >= state.swimDuration / Math.max(0.5, spdMul * 0.85)) {
              state.flockMode = 'glide';
              state.modeTimer = 0;
              rollFlightVariation();
            } else if (state.flockMode === 'glide' && state.modeTimer >= maxStaggerSpan + 0.25) {
              state.flockMode = 'swim';
              state.modeTimer = 0;
              for (const mb of members) { mb.breached = false; mb.splashed = false; }
            }

            const isGlidePhase = state.flockMode === 'glide';
            const speedBoost = isGlidePhase ? 1.50 : 1.0;
            leader.orbitAng = wrapAngle(leader.orbitAng + dt * 0.54 * spdMul * speedBoost * leader.orbitDir);
            const radWave = Math.sin(leader.orbitAng * 2.0 + seed * 0.1) * 5.8 + (fbm1(time * 0.26, seed) - 0.5) * 5.2;
            const curRad = clamp((28.5 + radWave) * sMul, 20.0 * sMul, maxR - 8.5 * sMul);
            const targetLX = homeX + Math.cos(leader.orbitAng) * curRad;
            const targetLY = homeY + Math.sin(leader.orbitAng) * curRad;
            const ldx = targetLX - leader.x;
            const ldy = targetLY - leader.y;
            const desiredLYaw = Math.hypot(ldx, ldy) > 0.2 ? Math.atan2(-ldx, ldy) : wrapAngle(leader.orbitAng + Math.PI * 0.5);
            leader.yaw = wrapAngle(leader.yaw + wrapAngle(desiredLYaw - leader.yaw) * expSmooth(dt, 5.2));
            const kL = expSmooth(dt, isGlidePhase ? 5.2 : 3.6);
            leader.x = lerp(leader.x, targetLX, kL);
            leader.y = lerp(leader.y, targetLY, kL);
          } else {
            state.flockMode = 'swim';
            state.idleCycleTimer += dt;
            if (!state.idleGlideActive && state.idleCycleTimer >= 5.0) {
              state.idleGlideActive = true;
              state.idleGlideTimer = 0;
              state.idleCycleTimer = 0;
              rollFlightVariation();
            }
            if (state.idleGlideActive) {
              state.idleGlideTimer += dt;
              if (state.idleGlideTimer >= maxStaggerSpan + 0.15) {
                state.idleGlideActive = false;
                state.idleGlideTimer = 0;
              }
            }

            // 待机独立轮流啄食：哪条鱼离浮游亮粒近，就由那条鱼主动探身轻啄
            state.peckCd -= dt;
            if (!state.idleGlideActive && state.peckCd <= 0) {
              state.peckCd = 0.95 + Math.random() * 0.55;
              let bestPk = null, bestMb = null, bestD = 1e9;
              for (const pk of planktons) {
                if (pk.eatenTimer > 0) continue;
                for (const mb of members) {
                  if (mb.peckAmt > 0.1) continue;
                  const d = Math.hypot(pk.x - mb.x, pk.y - mb.y);
                  if (d < bestD) { bestD = d; bestPk = pk; bestMb = mb; }
                }
              }
              if (bestPk && bestMb && bestD < 20 * sMul) {
                bestMb.peckAmt = 1.0;
                bestMb.peckTargetX = bestPk.x;
                bestMb.peckTargetY = bestPk.y;
                bestPk.eatenTimer = 2.6;
                kelp.shake.impulse(4.8 * sp);
                if (vfx) {
                  vfx.addRipple(bestPk.x, bestPk.y, 1.2 * sMul, 7.5 * sMul, 0.55, 1.2);
                  for (let k = 0; k < 6; k++) {
                    const a = (k / 6) * TAU + Math.random() * 0.4;
                    vfx.spawnParticle(
                      bestPk.x, bestPk.y, bestPk.z,
                      Math.cos(a) * 9 * sMul, Math.sin(a) * 9 * sMul, (5 + Math.random() * 7) * sMul,
                      0.42, 1.1, fx.mote, true, 14
                    );
                  }
                }
              }
            }
          }

          // -----------------------------------------------------------------
          // 3. 5 只独立个体解算（独立脉冲摆尾 + 独立噪声漫游 + 邻体对齐 + 椭圆分离）
          // -----------------------------------------------------------------
          let sumX = 0, sumY = 0, sumZ = 0;
          const activeGlide = isIdle ? state.idleGlideActive : (state.flockMode === 'glide');
          const glideClock = isIdle ? state.idleGlideTimer : state.modeTimer;

          for (let i = 0; i < members.length; i++) {
            const mb = members[i];
            mb.peckAmt = Math.max(0, mb.peckAmt - dt * 2.2);

            const myFlightDur = baseFlightDur * mb.flightDurMul;
            let uFlight = -1;
            if (activeGlide) {
              const localT = glideClock - mb.delay;
              if (localT >= 0 && localT <= myFlightDur) {
                uFlight = localT / myFlightDur;
              }
            }

            // A) 个体目标点：巡游用柔性槽位 + 独立低频噪声漫游；待机各自不同半径/不同游速绕藻
            let tgtX, tgtY, idealYaw;
            const wNoiseX = (fbm1(time * 0.58 + mb.phase, mb.wanderSeed) - 0.5) * 2.0 * mb.wanderAmp;
            const wNoiseY = (fbm1(time * 0.52 + mb.phase, mb.wanderSeed + 31) - 0.5) * 2.0 * mb.wanderAmp;

            if (!isIdle) {
              const spreadMul = uFlight >= 0 ? 1.14 : 1.0;
              const [sx, sy] = localToWorldXY(
                leader.x, leader.y, leader.yaw,
                (mb.slotX * spreadMul + wNoiseX) * sMul,
                (mb.slotY * spreadMul + wNoiseY) * sMul
              );
              tgtX = sx;
              tgtY = sy;
              idealYaw = wrapAngle(leader.yaw + (uFlight >= 0 ? mb.glideYawBias * Math.sin(uFlight * Math.PI) : 0));
            } else {
              // 待机：每条鱼按自己的半径与速度游动，主动探身啄食微粒时向微粒偏航
              const boostIdle = uFlight >= 0 ? 1.48 : 1.0;
              mb.idleAng = wrapAngle(mb.idleAng + dt * mb.idleSpd * spdMul * boostIdle * mb.idleDir);
              const rBob = Math.sin(time * 1.3 + mb.phase) * 2.2;
              const curIdleR = (mb.idleR + (uFlight >= 0 ? 2.5 : 0) + rBob) * sMul;
              const orbX = kelp.x + Math.cos(mb.idleAng) * curIdleR;
              const orbY = kelp.y + Math.sin(mb.idleAng) * curIdleR;
              tgtX = lerp(orbX, mb.peckTargetX, mb.peckAmt * 0.65);
              tgtY = lerp(orbY, mb.peckTargetY, mb.peckAmt * 0.65);
              const tanX = -Math.sin(mb.idleAng) * mb.idleDir;
              const tanY =  Math.cos(mb.idleAng) * mb.idleDir;
              idealYaw = Math.atan2(-tanX, tanY);
            }

            // B) 椭圆分离斥力 + 局部邻体平均航向对齐（真实 Boids 协同）
            const sepLat = (mb.wingPose === 'fold' ? 12.8 : 20.5) * sMul;
            const sepLng = 15.0 * sMul;
            let sepX = 0, sepY = 0;
            let alignSin = 0, alignCos = 0, alignCnt = 0;
            const fwdX = -Math.sin(mb.yaw), fwdY = Math.cos(mb.yaw);
            const rgtX =  Math.cos(mb.yaw), rgtY = Math.sin(mb.yaw);

            for (let j = 0; j < members.length; j++) {
              if (i === j) continue;
              const other = members[j];
              const dx = mb.x - other.x;
              const dy = mb.y - other.y;
              const dist = Math.hypot(dx, dy) || 0.001;
              if (dist < 38 * sMul) {
                alignSin += Math.sin(other.yaw);
                alignCos += Math.cos(other.yaw);
                alignCnt++;
              }
              const dLat = dx * rgtX + dy * rgtY;
              const dLng = dx * fwdX + dy * fwdY;
              const ellipD = Math.hypot(dLat / sepLat, dLng / sepLng);
              if (ellipD < 1.0 && ellipD > 0.001) {
                const push = (1.0 - ellipD) * 18.0 * sMul;
                sepX += (dx / dist) * push;
                sepY += (dy / dist) * push;
              }
            }

            // 避让中央海藻球核心，防止穿模
            const kdx = mb.x - kelp.x, kdy = mb.y - kelp.y;
            const kDist = Math.hypot(kdx, kdy) || 0.001;
            const minKelpDist = (uFlight >= 0 ? 9.5 : 12.5) * sMul;
            if (kDist < minKelpDist) {
              const kPush = (minKelpDist - kDist) * 1.7;
              sepX += (kdx / kDist) * kPush;
              sepY += (kdy / kDist) * kPush;
            }

            // C) 独立脉冲摆尾推进（Burst-and-Glide）：每条鱼有独立摆尾相位，游速自带一蹿一滑的活鱼呼吸感
            const tailFreq = (mb.inAir ? 4.0 : 9.8) * mb.tailFreqMul * gFreq;
            mb.tailPhase = (mb.tailPhase + dt * tailFreq) % TAU;
            const tailWave = Math.sin(mb.tailPhase);
            const burstFactor = mb.inAir ? 1.0 : (0.86 + Math.pow(Math.abs(tailWave), 1.8) * 0.30);

            const toX = (tgtX + sepX) - mb.x;
            const toY = (tgtY + sepY) - mb.y;
            const gain = (uFlight >= 0 ? mb.followGain * 1.45 : mb.followGain) * mb.speedMul * burstFactor;
            const desVx = toX * gain;
            const desVy = toY * gain;
            // 柔和惯性插值：让每条鱼转弯有各自甩尾弧度，而非生硬锁死槽位
            const kV = expSmooth(dt, uFlight >= 0 ? 6.2 : 4.2);
            mb.vx = lerp(mb.vx, desVx, kV);
            mb.vy = lerp(mb.vy, desVy, kV);
            mb.x += mb.vx * dt;
            mb.y += mb.vy * dt;

            // 航向融合：自身速度方向 + 邻体平均航向 + 理想方向，并受个体最大转向角速度约束
            const spd = Math.hypot(mb.vx, mb.vy);
            const velYaw = spd > 2.2 ? Math.atan2(-mb.vx, mb.vy) : idealYaw;
            const neighborYaw = alignCnt > 0 ? Math.atan2(alignSin, alignCos) : idealYaw;
            const blendYaw = wrapAngle(velYaw + wrapAngle(neighborYaw - velYaw) * 0.25 + wrapAngle(idealYaw - velYaw) * 0.18);
            const maxStep = mb.turnRate * (uFlight >= 0 ? 1.45 : 1.0) * dt;
            mb.yaw = wrapAngle(mb.yaw + clamp(wrapAngle(blendYaw - mb.yaw), -maxStep, maxStep));

            // D) 高度 Z 抛物线 + 三档翼姿切换（小鱼半空轻补拍一次翼！）+ 破水/入水连环水花
            const swimZ = (1.75 + Math.sin(time * 3.0 * mb.tailFreqMul * gFreq + mb.phase) * mb.bobAmp) * sMul;
            if (uFlight >= 0) {
              mb.inAir = true;
              const peakH = (isIdle ? mb.idlePeakH : mb.peakH) * sMul;
              const arc = Math.pow(Math.sin(uFlight * Math.PI), 0.62);
              mb.z = lerp(swimZ, swimZ + peakH, arc);

              if (uFlight < 0.18) {
                mb.wingPose = 'flap';
              } else if (mb.midFlap && uFlight > 0.48 && uFlight < 0.58) {
                // 后翼小鱼在滑翔中段轻快补拍一下翅膀，凸显个体灵动感
                mb.wingPose = 'flap';
              } else if (uFlight < 0.85) {
                mb.wingPose = 'glide';
              } else {
                mb.wingPose = 'fold';
              }

              if (!mb.breached && uFlight >= 0.02) {
                mb.breached = true;
                if (vfx && isWater) {
                  vfx.addRipple(mb.x, mb.y, 2.0 * sMul, (mb.role === 'lead' ? 16.5 : 13.5) * sMul, 0.72, 1.7);
                  vfx.spawnSplash(mb.x, mb.y, mb.role === 'lead' ? 9 : 6, (mb.role === 'lead' ? 1.1 : 0.85) * sMul, habitat.fx);
                }
              }

              mb.glideTrailCd -= dt;
              if (vfx && mb.wingPose === 'glide' && mb.glideTrailCd <= 0) {
                mb.glideTrailCd = 0.17;
                const spanW = (mb.wingSize === 'small' ? 10.5 : 13.5) * sMul;
                for (const s of [-1, 1]) {
                  const [tx, ty] = localToWorldXY(mb.x, mb.y, mb.yaw, s * spanW, -1.5 * sMul);
                  vfx.spawnParticle(
                    tx, ty, mb.z + 4.6 * sMul,
                    -mb.vx * 0.12, -mb.vy * 0.12, -1.5,
                    0.34, 0.85, fx.foamB, false, 0
                  );
                }
              }

              if (!mb.splashed && uFlight >= 0.93) {
                mb.splashed = true;
                if (vfx && isWater) {
                  vfx.addRipple(mb.x, mb.y, 2.0 * sMul, 15.5 * sMul, 0.78, 1.8);
                  vfx.spawnSplash(mb.x, mb.y, 7, 1.0 * sMul, habitat.fx);
                }
              }
            } else {
              mb.inAir = false;
              mb.wingPose = 'fold';
              mb.z = lerp(mb.z, swimZ, expSmooth(dt, 9.5));

              mb.wakeCd -= dt;
              if (vfx && isWater && spd > 4.0 && mb.wakeCd <= 0) {
                mb.wakeCd = 0.21 + (i % 3) * 0.03;
                EnvFeedback.emitWaterWake(vfx, habitat, mb.x, mb.y, mb.yaw, (mb.wingSize === 'small' ? 3.4 : 4.4) * sMul, 0.52);
              }
            }

            mb.tailYaw = tailWave * (mb.inAir ? 0.12 : 0.50) * flex;

            // 独立水面暗印（高度越高暗印越小越淡，直观强化破水滞空感）
            footContacts[i].x = mb.x + mb.z * 0.16;
            footContacts[i].y = mb.y - mb.z * 0.16;
            footContacts[i].z = mb.z;
            footContacts[i].r = (mb.wingPose === 'glide' ? mb.footR * 1.32 : mb.footR) * sMul;

            sumX += mb.x;
            sumY += mb.y;
            sumZ += mb.z;
          }

          // 海藻球底座暗印
          footContacts[MEMBER_PROFILES.length].x = kelp.x;
          footContacts[MEMBER_PROFILES.length].y = kelp.y;
          footContacts[MEMBER_PROFILES.length].z = 0.5;
          footContacts[MEMBER_PROFILES.length].r = 6.2 * sMul;

          state.x = sumX / members.length;
          state.y = sumY / members.length;
          state.z = sumZ / members.length;
          state.yaw = members[0].yaw;
          sockets.setWorld('leadFish', members[0].x, members[0].y, members[0].z + 5 * sMul, members[0].yaw);
          sockets.setWorld('kelpBall', kelp.x, kelp.y, kelp.z + 4 * sMul, kelp.yaw);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? habitat.waterLevel : 3.0;

          // 1. 中央碧绿海藻球 + 5 颗浮游亮粒
          list.push({
            partKey: 'kelpBall',
            asset: parts.kelpBall,
            x: kelp.x,
            y: kelp.y,
            lift: Math.max(0.4, kelp.z),
            ro: kelp.yaw,
            bias: -0.10,
            submerge: isWater ? 0.18 : 0
          });

          for (let i = 0; i < planktons.length; i++) {
            const pk = planktons[i];
            if (pk.eatenTimer > 0) continue;
            list.push({
              partKey: pk.partKey,
              asset: parts[pk.partKey],
              x: pk.x,
              y: pk.y,
              lift: Math.max(1.0, pk.z),
              ro: pk.ang,
              symDeg: 90,
              bias: 0.35,
              submerge: 0
            });
          }

          // 2. 5 只独立个体文鳐鱼（各自对应的体型、花纹、叉尾与翼型部件）
          for (let i = 0; i < members.length; i++) {
            const mb = members[i];
            const yw = mb.yaw;
            const sub = isWater
              ? clamp(EnvFeedback.calcSubmerge(mb.z, waterLvl + 1.4 * sMul, 4.2 * sMul, true), 0, 0.72)
              : 0;
            const airBias = mb.inAir ? 0.85 : 0.0;
            const isSmall = mb.wingSize === 'small';

            // A) 独立摆动叉尾鳍
            const tPiv = TAIL_PIVOTS[mb.tailCfg];
            const tYaw = wrapAngle(yw + mb.tailYaw);
            const [tjx, tjy] = localToWorldXY(mb.x, mb.y, yw, 0, tPiv.attachY * sMul);
            const [tx, ty] = pivotToWorldXY(tjx, tjy, tYaw, tPiv.x * sMul, tPiv.y * sMul);
            list.push({
              partKey: mb.tailKey,
              asset: parts[mb.tailKey],
              x: tx,
              y: ty,
              lift: Math.max(0.4, mb.z + (isSmall ? 0.2 : 0.4) * sMul),
              ro: tYaw,
              bias: airBias - 0.12,
              submerge: sub
            });

            // B) 左右三档无损鸟翼（按成鱼/小鱼规格各自锁死肩部枢轴，零小数拉伸）
            const pKey = mb.wingPose === 'glide' ? 'glide' : (mb.wingPose === 'flap' ? 'flap' : 'fold');
            const piv = (isSmall ? WING_PIVOT_SMALL : WING_PIVOT_STD)[pKey];
            const wingLiftOff = (pKey === 'flap' ? 0.2 : (pKey === 'glide' ? 1.7 : 1.1)) * (isSmall ? 0.82 : 1.0) * sMul;
            const lKey = isSmall
              ? (pKey === 'glide' ? 'wingGlideSmallL' : (pKey === 'flap' ? 'wingFlapSmallL' : 'wingFoldSmallL'))
              : (pKey === 'glide' ? 'wingGlideL' : (pKey === 'flap' ? 'wingFlapL' : 'wingFoldL'));
            const rKey = isSmall
              ? (pKey === 'glide' ? 'wingGlideSmallR' : (pKey === 'flap' ? 'wingFlapSmallR' : 'wingFoldSmallR'))
              : (pKey === 'glide' ? 'wingGlideR' : (pKey === 'flap' ? 'wingFlapR' : 'wingFoldR'));

            const [ljx, ljy] = localToWorldXY(mb.x, mb.y, yw, -piv.attachX * sMul, piv.attachY * sMul);
            const [lx, ly] = pivotToWorldXY(ljx, ljy, yw, piv.x * sMul, piv.y * sMul);
            list.push({
              partKey: lKey,
              asset: parts[lKey],
              x: lx,
              y: ly,
              lift: Math.max(0.4, mb.z + wingLiftOff),
              ro: yw,
              bias: airBias + 0.06,
              submerge: sub
            });

            const [rjx, rjy] = localToWorldXY(mb.x, mb.y, yw, piv.attachX * sMul, piv.attachY * sMul);
            const [rx, ry] = pivotToWorldXY(rjx, rjy, yw, -piv.x * sMul, piv.y * sMul);
            list.push({
              partKey: rKey,
              asset: parts[rKey],
              x: rx,
              y: ry,
              lift: Math.max(0.4, mb.z + wingLiftOff),
              ro: yw,
              bias: airBias + 0.06,
              submerge: sub
            });

            // C) 个体鱼身
            list.push({
              partKey: mb.bodyKey,
              asset: parts[mb.bodyKey],
              x: mb.x,
              y: mb.y,
              lift: Math.max(0.4, mb.z),
              ro: yw,
              bias: airBias + 0.16,
              submerge: sub
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sea4Def.id,
            code: Sea4Def.code,
            status: Sea4Def.status,
            name: Sea4Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            flockCount: members.length,
            flockMode: state.flockMode,
            planktonCount: planktons.length,
            footRadius: 4.5,
            headZ: 11,
            centerZ: 5,
            blocks: Sea4Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sea4Def);
})(window.PixelWorkshop);
