'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { createAmbushCycle, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 树5 · 压竹子弹出去的（M27 趴着不动、突然弹射标杆，+Y 正前，z=0 贴地）
  //   1. 俯视高辨识轮廓与强撞色（绝不融进翠绿竹林地台）：
  //      - 瘦长分节躯干：明黄翠绿 / 暖赭竹节环配深暗节线与象牙腹甲，俯视一眼切出清晰条纹；
  //      - 超长强壮曲折后腿：夸张拉长的外扩股节 + 细长胫节 + 抓爪，蓄力时折叠如弓、弹射时蹬直；
  //      - 笔直硬棍尾：如标枪般笔直的竹节尾棍，尾尖点缀亮橙与象牙白高对比尖端；
  //      - 一对独立转动的亮金警戒大眼：0 遮挡架在头顶两侧，静伏时警惕左右扫视；
  //      - 自带 1 根 4 节可压弯弹直的翠竹竿道具件：随蓄力弯成满弓，松手瞬间啪地弹直并颤抖。
  //   2. 弹射伏击循环（直接调用 core 的 PW.Behaviors.createAmbushCycle）：
  //      - disguise(静伏蓄力)：抱在竹竿半腰压弯竹竿，仅一对大眼偶尔警惕转动；
  //      - tense(压低满蓄)：把竹竿再压深一截、后腿缩紧、尾棍瞄准拉直；
  //      - strike(骤然弹射)：竹竿啪地弹直颤抖，本体如箭直线高速扑向目标点（带高速尘尾）；
  //      - digest(落地急刹)：着陆后四肢撑地滑刹一段激起尘土与刹痕，短暂停顿；
  //      - recover(跳回攀竹)：小步连跳回竹竿旁，纵身重新抱上竹腰压弯竹子；
  //      - relocate(换向瞄准)：绕竹基小跳换一侧方向重新压竹待伏。
  //   3. 性能与清晰度铁律：
  //      - 33 色、0 重色、0 自亮（eyeDot 不进 glowKeys 防发糊）；
  //      - 常态严禁 scaleX/scaleY 拉伸；竹竿中段共享单资产 symDeg=90 省图集；
  //      - 目标点与滑刹终点严格钳制在 maxRadius * 0.80 以内，0 越界 0 NaN。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 主躯干明黄翠绿竹节 3 阶（与深绿竹林高对比拉开）
      bodyDark:     '#7a8c1c',
      bodyMid:      '#c4d633',
      bodyHi:       '#f2f576',
      // 暖赭/琥珀交替竹节环 3 阶
      bandDark:     '#8f4f12',
      bandMid:      '#d98224',
      bandHi:       '#f7bc54',
      // 深暗竹节线与脊纹 2 阶（强明暗切出竹节段）
      nodeDark:     '#1d2412',
      nodeMid:      '#3b4722',
      // 象牙米白腹甲与关节环 3 阶
      bellyDark:    '#9c9273',
      bellyMid:     '#d6cca8',
      bellyHi:      '#f5f0dc',
      // 超长后腿强壮甲壳 3 阶（暖赭亮黄撞色凸显折腿轮廓）
      legDark:      '#733b14',
      legMid:       '#ba6522',
      legHi:        '#eda047',
      // 锐利深褐前爪与后爪 2 阶
      clawDark:     '#2b1c12',
      clawMid:      '#573926',
      // 尾棍亮橙点睛尾尖 3 阶
      tipDark:      '#bd370e',
      tipMid:       '#f2601d',
      tipHi:        '#ffae52',
      // 亮金警戒大眼 4 阶（eyeDot 严禁进 glowKeys）
      eyeRim:       '#261b0e',
      eyeDark:      '#0e1014',
      eyeGold:      '#ffd426',
      eyeDot:       '#fffdf0',
      // 道具：翠竹竿本体 3 阶
      poleDark:     '#124d2c',
      poleMid:      '#26854c',
      poleHi:       '#54bd72',
      // 道具：竹竿淡黄竹节环 3 阶
      poleNodeDark: '#787d3b',
      poleNodeMid:  '#b8bf67',
      poleNodeHi:   '#e6eb9d',
      // 道具：竹梢嫩叶 3 阶
      leafDark:     '#1b6335',
      leafMid:      '#3aa357',
      leafHi:       '#82db7b'
    },
    glowKeys: [],
    parts: [
      'body', 'band', 'node', 'belly', 'leg', 'claw', 'tip', 'eye',
      'pole', 'poleNode', 'leaf'
    ],
    noCrease: [
      ['body', 'band'], ['body', 'belly'], ['body', 'eye'],
      ['band', 'tip'], ['leg', 'claw'], ['pole', 'poleNode'], ['pole', 'leaf']
    ],
    materials: {
      body:     ['bodyDark',     'bodyMid',     'bodyHi'],
      band:     ['bandDark',     'bandMid',     'bandHi'],
      belly:    ['bellyDark',    'bellyMid',    'bellyHi'],
      leg:      ['legDark',      'legMid',      'legHi'],
      tip:      ['tipDark',      'tipMid',      'tipHi'],
      pole:     ['poleDark',     'poleMid',     'poleHi'],
      poleNode: ['poleNodeDark', 'poleNodeMid', 'poleNodeHi'],
      leaf:     ['leafDark',     'leafMid',     'leafHi']
    },
    protectedParts: ['eye', 'node', 'tip', 'claw']
  });

  // 3 套高对比换色皮肤（均 0 重色、0 禁用字）
  const SKINS = [
    {
      id: 'jade_gold',
      name: '翠竹明黄节',
      dot: '#c4d633',
      outline: '#101a0d',
      pal: {},
      fx: { dust: '#c7b88a', leaf: '#74d678', streak: '#f7e97e' }
    },
    {
      id: 'gold_crimson',
      name: '金竹绛纹',
      dot: '#e8a82e',
      outline: '#1f100b',
      pal: {
        bodyDark:     '#996612', bodyMid:     '#e3a62b', bodyHi:     '#ffe073',
        bandDark:     '#5e141c', bandMid:     '#a82433', bandHi:     '#e0535e',
        nodeDark:     '#240c10', nodeMid:     '#471b22',
        bellyDark:    '#a1896d', bellyMid:    '#d9c1a0', bellyHi:    '#f7ead4',
        legDark:      '#6e1c1f', legMid:      '#b83935', legHi:      '#eb7565',
        tipDark:      '#a87f19', tipMid:      '#ebc138', tipHi:      '#fff2a6',
        eyeGold:      '#52f0c8',
        poleDark:     '#1d5444', poleMid:     '#368c71', poleHi:     '#6ac7a5'
      },
      fx: { dust: '#d1b58e', leaf: '#6ac7a5', streak: '#ffd466' }
    },
    {
      id: 'withered_cyan',
      name: '枯竹苍青',
      dot: '#5aa8a3',
      outline: '#121a1c',
      pal: {
        bodyDark:     '#877c5a', bodyMid:     '#c7ba8d', bodyHi:     '#efe6c5',
        bandDark:     '#1e4d52', bandMid:     '#3b868c', bandHi:     '#7ac7c9',
        nodeDark:     '#172426', nodeMid:     '#2e464a',
        bellyDark:    '#7d8a85', bellyMid:    '#b5c4bd', bellyHi:    '#e3ede8',
        legDark:      '#235459', legMid:      '#489499', legHi:      '#8ad4d4',
        tipDark:      '#b52b16', tipMid:      '#eb5528', tipHi:      '#ff9e66',
        eyeGold:      '#ffba26',
        poleDark:     '#574f29', poleMid:     '#8c8248', poleHi:     '#c7bd7b',
        poleNodeDark: '#695736', poleNodeMid: '#a38c5b', poleNodeHi: '#d9c596',
        leafDark:     '#4f5926', leafMid:     '#859445', leafHi:     '#bdcc74'
      },
      fx: { dust: '#bfb493', leaf: '#bdcc74', streak: '#96e3e0' }
    }
  ];

  // =========================================================================
  // 1. 体素建模：瘦长竹节躯干 + 警觉头 + 独立亮金大眼 + 标枪硬棍尾 + 超长折腿 + 翠竹竿
  // =========================================================================

  // 1) 瘦长竹节躯干（10×18×8，明黄翠绿 / 暖赭交替竹节环 + 深暗节线）
  function buildTorso(makeCanvas) {
    const W = 10, D = 18, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-4.2, 4.2, -8.2, 8.2, 1, 7, (x, y, z, X, Y) => {
      // 瘦长流线竹节体：前胸略宽、中腰收细、后胯结实有力
      const u = clamp((Y + 7.5) / 15.0, 0, 1);
      const rx = 2.7 + Math.sin(u * Math.PI) * 0.75 + (u < 0.35 ? 0.55 : 0);
      const rz = 2.4 + Math.sin(u * Math.PI) * 0.45;
      const cz = 3.8 + (u - 0.5) * 0.4;
      const d = Math.hypot(X / rx, (z - cz) / rz);
      if (d > 1.0) return;

      // 3 道鲜明深暗竹节环线（y = -4.2, +0.2, +4.6）
      const nearNode = (Math.abs(Y + 4.2) < 0.75 || Math.abs(Y - 0.2) < 0.75 || Math.abs(Y - 4.6) < 0.75);
      if (nearNode) {
        m.setRaw(x, y, z, z > cz ? keyToId.nodeDark : keyToId.nodeMid, partId.node);
        return;
      }

      // 腹底象牙米白
      if (z < cz - 0.9) {
        m.setRaw(x, y, z, mat('belly'), partId.belly);
        return;
      }

      // 背脊高对比交替竹节环（暖赭与明黄翠绿相间）
      const isWarmBand = (Y > -4.2 && Y < 0.2) || (Y > 4.6);
      m.setRaw(x, y, z, isWarmBand ? mat('band') : mat('body'), isWarmBand ? partId.band : partId.body);
    });

    // 背脊两道醒目象牙节脊点（俯视增清晰度）
    for (const sy of [-6.0, -2.0, 2.4, 6.2]) {
      m.paintEllipsoid(0, sy, 6.4, 1.05, 0.9, 0.65, mat('belly'), partId.belly, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 7, centerZ: 4 });
  }

  // 2) 敏锐尖吻头部（10×12×8，枢轴在颈根 (0, -3.5)）
  const HEAD_PIVOT = { x: 0, y: -3.5 };
  function buildHead(makeCanvas) {
    const W = 10, D = 12, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 颈根暗节领环
    m.paintEllipsoid(0, -3.4, 3.2, 2.3, 1.3, 2.0, keyToId.nodeDark, partId.node, true);
    // 三角敏锐头颅（后宽前尖）
    m.paintEllipsoid(0, -0.6, 3.6, 3.3, 3.2, 2.4, mat('body'), partId.body, true);
    // 尖吻与暗色咬合口器
    m.paintCapsule(0, 1.0, 3.2, 0, 4.8, 2.6, 1.85, 0.85, mat('band'), partId.band, true);
    m.paintCapsule(-1.0, 3.2, 2.3, -0.5, 5.2, 2.1, 0.55, 0.38, keyToId.clawDark, partId.claw, true);
    m.paintCapsule( 1.0, 3.2, 2.3,  0.5, 5.2, 2.1, 0.55, 0.38, keyToId.clawDark, partId.claw, true);
    // 额头亮色竹纹
    m.paintEllipsoid(0, 0.2, 5.6, 1.4, 1.8, 0.6, mat('belly'), partId.belly, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 7, centerZ: 3 });
  }

  // 3) 独立转动亮金警戒大眼（6×6×6，左右共享 1 套资产，0 遮挡高对比大圆眼）
  function buildEyeOrb(makeCanvas) {
    const S = 6;
    const m = new VoxelModel(S, S, S, SPEC);
    const { partId, keyToId } = SPEC;

    // 深色眼眶底座 + 饱满亮金眼球
    m.paintEllipsoid(0, 0, 2.4, 2.1, 2.1, 2.0, keyToId.eyeRim, partId.eye, true);
    m.paintEllipsoid(0, 0.2, 2.8, 1.85, 1.85, 1.75, keyToId.eyeGold, partId.eye, true);

    // 朝 +Y 表面雕刻锐利黑瞳 + 单像素象牙亮点（不进 glowKeys，绝不发糊）
    m.setRaw(2, 4, 3, keyToId.eyeDark, partId.eye);
    m.setRaw(3, 4, 3, keyToId.eyeDark, partId.eye);
    m.setRaw(2, 4, 4, keyToId.eyeDark, partId.eye);
    m.setRaw(3, 4, 4, keyToId.eyeDot,  partId.eye);
    // 顶面也补一颗清晰瞳点，保证高俯角 ×4 缩放一眼看出眼珠朝向！
    m.setRaw(2, 3, 4, keyToId.eyeDark, partId.eye);
    m.setRaw(3, 4, 5, keyToId.eyeDot,  partId.eye);

    m.despeckle();
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 5, centerZ: 3 });
  }

  // 4) 笔直坚硬标枪尾棍（6×24×5，枢轴在尾根 (0, 10.2)，尾尖亮橙+象牙白点睛）
  const TAIL_PIVOT = { x: 0, y: 10.2 };
  function buildTailRod(makeCanvas) {
    const W = 6, D = 24, H = 5;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 笔直坚硬竹节尾棍：从 y=+10.2（尾根）一路伸至 y=-10.6（尾尖）
    m.fillAABB(-2.2, 2.2, -10.8, 10.4, 1, 4, (x, y, z, X, Y) => {
      const u = clamp((10.4 - Y) / 21.2, 0, 1); // 0=尾根, 1=尾尖
      const rad = lerp(1.55, 0.72, u * 0.85);
      // 3 处微凸竹节环
      const isNode = (Math.abs(Y - 5.2) < 0.7 || Math.abs(Y - 0.0) < 0.7 || Math.abs(Y + 5.2) < 0.7);
      const rEff = isNode ? rad + 0.38 : rad;
      const d = Math.hypot(X / rEff, (z - 2.4) / (rEff * 0.92));
      if (d > 1.0) return;

      if (Y < -7.2) {
        // 尾尖标枪头：最末 2 格象牙白 + 亮橙撞色点睛！
        if (Y < -9.2) {
          m.setRaw(x, y, z, keyToId.bellyHi, partId.belly);
        } else {
          m.setRaw(x, y, z, mat('tip'), partId.tip);
        }
      } else if (isNode) {
        m.setRaw(x, y, z, keyToId.nodeDark, partId.node);
      } else {
        const alt = (Y > 0.0 && Y < 5.2) || (Y < -5.2);
        m.setRaw(x, y, z, alt ? mat('band') : mat('body'), alt ? partId.band : partId.body);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 4, centerZ: 2 });
  }

  // 5) 超长强壮后腿股节（9×15×9，左/右独立，枢轴锁在髋根）
  //    局部 +Y 朝膝尖，夸张拉长且外廓饱满，俯视极具弹跳力量感
  const HIND_THIGH_PIVOT = { x: 0, y: -5.4 };
  function buildHindThigh(makeCanvas, side) {
    const W = 9, D = 15, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 强壮外拱股肌：从髋根 (0, -5.4, 2.2) 斜向上冲到高膝点 (side*1.2, +5.8, 6.4)
    m.paintCapsule(0, -5.4, 2.4, side * 0.9, 0.2, 4.8, 2.05, 2.35, mat('leg'), partId.leg, true);
    m.paintCapsule(side * 0.9, 0.2, 4.8, side * 1.1, 5.8, 6.6, 2.20, 1.35, mat('leg'), partId.leg, true);
    // 股节中段醒目深暗节环 + 亮黄侧棱（俯视清楚切出长腿轮廓）
    m.paintEllipsoid(side * 0.8, 0.2, 4.9, 2.4, 0.85, 2.3, keyToId.nodeDark, partId.node, true);
    m.paintCapsule(side * 1.4, -2.6, 4.6, side * 1.6, 3.8, 6.8, 0.72, 0.62, mat('body'), partId.body, true);
    // 膝盖象牙硬护甲
    m.paintEllipsoid(side * 1.1, 6.0, 6.7, 1.55, 1.45, 1.45, mat('belly'), partId.belly, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.8, headZ: 8, centerZ: 4 });
  }

  // 6) 超长后腿胫节（7×14×8，左/右独立，枢轴锁在膝端 (0, 5.2)）
  const HIND_SHIN_PIVOT = { x: 0, y: 5.2 };
  function buildHindShin(makeCanvas, side) {
    const W = 7, D = 14, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 细长弹簧感胫节：从膝端 (0, 5.2, 6.4) 斜下探向踝部 (0, -5.4, 1.2)
    m.paintCapsule(0, 5.2, 6.3, 0, -0.2, 3.8, 1.28, 1.05, mat('body'), partId.body, true);
    m.paintCapsule(0, -0.2, 3.8, 0, -5.4, 1.3, 1.02, 0.85, mat('leg'), partId.leg, true);
    // 胫节暗色节环 + 后缘小锯齿刺
    m.paintEllipsoid(0, 0.0, 3.9, 1.25, 0.75, 1.25, keyToId.nodeDark, partId.node, true);
    m.paintEllipsoid(side * 0.9, -2.5, 2.7, 0.75, 0.65, 0.75, keyToId.clawDark, partId.claw, true);
    m.paintEllipsoid(0, -5.4, 1.4, 1.1, 1.1, 1.0, mat('belly'), partId.belly, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 7, centerZ: 3 });
  }

  // 7) 后足抓爪（7×8×4，左右共享）
  function buildHindFoot(makeCanvas) {
    const W = 7, D = 8, H = 4;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.paintEllipsoid(0, -0.8, 1.3, 1.25, 1.35, 1.05, mat('leg'), partId.leg, true);
    m.paintCapsule(0, -0.4, 1.1,  0.0, 3.2, 0.9, 0.68, 0.45, keyToId.clawDark, partId.claw, true);
    m.paintCapsule(0, -0.4, 1.1, -1.9, 2.2, 0.9, 0.62, 0.42, keyToId.clawDark, partId.claw, true);
    m.paintCapsule(0, -0.4, 1.1,  1.9, 2.2, 0.9, 0.62, 0.42, keyToId.clawDark, partId.claw, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5, headZ: 3, centerZ: 1 });
  }

  // 8) 细长抱竹前臂（7×11×6，左/右独立，枢轴在肩根 (0, -3.6)）
  const FORE_ARM_PIVOT = { x: 0, y: -3.6 };
  function buildForeArm(makeCanvas, side) {
    const W = 7, D = 11, H = 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.paintCapsule(0, -3.6, 3.2, side * 1.0, 0.4, 2.4, 1.15, 0.95, mat('body'), partId.body, true);
    m.paintCapsule(side * 1.0, 0.4, 2.4, side * 0.2, 3.6, 1.5, 0.95, 0.78, mat('band'), partId.band, true);
    // 腕部暗节环 + 内弯抱竹双钩爪
    m.paintEllipsoid(side * 0.7, 0.8, 2.3, 1.15, 0.65, 1.1, keyToId.nodeDark, partId.node, true);
    m.paintCapsule(side * 0.2, 3.4, 1.5, -side * 1.1, 4.7, 1.1, 0.58, 0.36, keyToId.clawDark, partId.claw, true);
    m.paintCapsule(side * 0.6, 3.2, 1.5,  side * 0.8, 4.8, 1.0, 0.52, 0.34, keyToId.clawDark, partId.claw, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.4, headZ: 5, centerZ: 2 });
  }

  // 9) 道具：翠竹竿基座节（10×10×9，symDeg=90，稳扎地面）
  function buildBambooRoot(makeCanvas) {
    const W = 10, D = 10, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-4.2, 4.2, -4.2, 4.2, 0, 8, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const isNode = (z === 7 || z === 1);
      const rad = z === 0 ? 3.55 : (isNode ? 3.05 : 2.55);
      if (r > rad) return;
      m.setRaw(x, y, z, isNode ? mat('poleNode') : mat('pole'), isNode ? partId.poleNode : partId.pole);
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 8, centerZ: 4 });
  }

  // 10) 道具：翠竹竿中段（8×8×8，symDeg=90，3 节共用 1 套资产防爆图集）
  function buildBambooSeg(makeCanvas) {
    const W = 8, D = 8, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-3.5, 3.5, -3.5, 3.5, 0, 7, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const isNode = (z === 6);
      const rad = isNode ? 2.75 : 2.25;
      if (r > rad) return;
      m.setRaw(x, y, z, isNode ? mat('poleNode') : mat('pole'), isNode ? partId.poleNode : partId.pole);
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 7, centerZ: 3 });
  }

  // 11) 道具：翠竹竿梢部与三片摇曳嫩叶（14×14×9）
  function buildBambooTip(makeCanvas) {
    const W = 14, D = 14, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    // 细竹梢节
    m.paintCapsule(0, 0, 0.6, 0, 0, 6.2, 1.85, 1.35, mat('pole'), partId.pole, true);
    m.paintEllipsoid(0, 0, 4.0, 2.2, 2.2, 0.75, mat('poleNode'), partId.poleNode, true);
    // 3 片舒展的细长竹叶（俯视一眼认出翠竹竿梢头）
    m.paintCapsule(0.8,  0.4, 4.6,  5.6,  2.8, 7.6, 0.85, 0.35, mat('leaf'), partId.leaf, true);
    m.paintCapsule(-0.8, 0.6, 5.2, -5.4,  3.2, 8.0, 0.82, 0.35, mat('leaf'), partId.leaf, true);
    m.paintCapsule(0.0, -0.8, 5.4,  0.4, -5.8, 7.4, 0.82, 0.35, mat('leaf'), partId.leaf, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.8, headZ: 8, centerZ: 4 });
  }

  // =========================================================================
  // 2. 生物定义与实例
  // =========================================================================
  const Tree5Def = {
    id: 'tree5_bamboo_launcher',
    code: '树5',
    name: '压竹子弹出去的',
    status: 'done',
    tag: 'M27 标杆 · 压竹弹射伏击',
    summary: '瘦长竹节撞色躯干 + 超长曲折强壮后腿 + 笔直亮橙尖硬棍尾 + 独立转动亮金大眼；抱在自带 4 节翠竹竿半腰压弯蓄力，松手竹竿啪地弹直颤抖，本体如箭直线弹射扑出并滑刹，随后小步跳回再压竹',
    defaultHabitat: 'bamboo',
    footRadius: 7.5,
    ecoWeight: 0.72,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '4 节可压弯弹直翠竹竿道具',
      '超长强壮曲折后腿 + 笔直硬棍尾',
      '独立转动亮金警戒大眼',
      '通用伏击弹射流程（createAmbushCycle）',
      '直线高速弹射 + 尘尾 + 落地急刹滑行'
    ],
    soulHabit: '抱在一根翠竹半腰把竹子压成满弓静伏，仅一对亮金大眼偶尔警惕转动；瞅准时机松手，竹竿啪地弹直颤抖，它像箭一样直线扑出并落地滑刹，再小步跳回重新攀竹压弯',
    actions: [
      { id: 'patrol', name: '压竹伏击全循环（弹射+滑刹+跳回）', loop: true, status: 'done' },
      { id: 'idle',   name: '抱弯竹静伏（警惕转眼）', loop: true, status: 'done' },
      { id: 'launch', name: '高频演示（压弯弹射与急刹）', loop: true, status: 'done' }
    ],
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torso:      buildTorso(makeCanvas),
        head:       buildHead(makeCanvas),
        eyeOrb:     buildEyeOrb(makeCanvas),
        tailRod:    buildTailRod(makeCanvas),
        hindThighL: buildHindThigh(makeCanvas, -1),
        hindThighR: buildHindThigh(makeCanvas,  1),
        hindShinL:  buildHindShin(makeCanvas, -1),
        hindShinR:  buildHindShin(makeCanvas,  1),
        hindFoot:   buildHindFoot(makeCanvas),
        foreArmL:   buildForeArm(makeCanvas, -1),
        foreArmR:   buildForeArm(makeCanvas,  1),
        bambooRoot: buildBambooRoot(makeCanvas),
        bambooSeg:  buildBambooSeg(makeCanvas),
        bambooTip:  buildBambooTip(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.35;
      const seed0 = opts.seed ?? 89;

      // 直接复用 core/behaviors.js 的 PW.Behaviors.createAmbushCycle
      const fsm = createAmbushCycle({
        seed: seed0,
        disguiseDur: [3.2, 5.0],
        tenseDur:    [0.52, 0.72],
        strikeDur:   [0.34, 0.44],
        digestDur:   [0.85, 1.15],
        recoverDur:  [1.75, 2.30],
        relocateDur: [0.95, 1.35],
        relocateEvery: 2
      });

      // 弹簧：竹竿压弯弹直（高刚度低阻尼 -> 松手啪地弹直并高频颤抖！）
      const poleBendSpring = new SpringDamper1D(0.76, 380, 6.4);
      const legCoilSpring  = new SpringDamper1D(1.0,  220, 14.0);
      const armGripSpring  = new SpringDamper1D(1.0,  200, 13.5);
      const headYawSpring  = new SpringDamper1D(0,    160, 11.0);
      const eyeScanSpring  = new SpringDamper1D(0,    190, 12.5);
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const state = {
        x: hx0, y: hy0, z: 10.5,
        vx: 0, vy: 0, yaw: hyaw0,
        mode: 'disguise',
        modeP: 0,
        tremor: 0,
        // 竹竿根部坐标（稳立在安全区，绝不越界）
        poleX: hx0,
        poleY: hy0,
        launchYaw: hyaw0,
        // 弹射起止点与滑刹终点（均严格钳制在 maxRadius * 0.80 内）
        launchStartX: hx0, launchStartY: hy0, launchStartZ: 10.5,
        landX: hx0, landY: hy0,
        brakeX: hx0, brakeY: hy0,
        // 复原跳回起点
        retStartX: hx0, retStartY: hy0,
        // 换向目标角
        relFromYaw: hyaw0,
        relToYaw: hyaw0,
        // 眼珠警惕扫视计时
        eyeCd: 0.9,
        eyeTarget: 0,
        eyeSeq: 1,
        // 粒子与痕迹节流
        trailCd: 0,
        skidCd: 0,
        hopCountPrev: -1,
        // 弹簧输出缓存
        poleBend: 0.76,
        legCoil: 1.0,     // 1=紧缩蓄力, 0=蹬直伸展, 0.45=站姿
        armGrip: 1.0,     // 1=抱紧竹竿, 0=前探扑抓/刹停
        headYaw: 0,
        eyeYawOff: 0,
        prevAction: 'patrol',
        shotSeq: 1
      };

      function clampVec2(x, y, maxLen) {
        const d = Math.hypot(x, y);
        if (d > maxLen && d > 1e-4) {
          return [(x / d) * maxLen, (y / d) * maxLen];
        }
        return [x, y];
      }

      // 计算竹竿在给定弯曲度 bend 下的第 k 节（k=1..3）世界坐标与高度
      // bend > 0 表示朝 -launchYaw 方向（后方）压弯成弧，松手回弹时 bend 会过冲到负值并颤抖！
      function evalPolePoint(kFrac, bendVal, sMul) {
        const dirX = Math.sin(state.launchYaw);   // -fwdX = +sin(yaw)
        const dirY = -Math.cos(state.launchYaw);  // -fwdY = -cos(yaw)
        const maxTheta = 1.08;
        const theta = bendVal * maxTheta;
        const totalH = 22.0 * sMul;
        const s = clamp(kFrac, 0, 1);

        if (Math.abs(theta) < 1e-3) {
          return { x: state.poleX, y: state.poleY, z: totalH * s };
        }
        const R = totalH / theta;
        const a = theta * s;
        const horiz = R * (1 - Math.cos(a));
        const vert = R * Math.sin(a);
        return {
          x: state.poleX + dirX * horiz,
          y: state.poleY + dirY * horiz,
          z: Math.max(0.5, vert)
        };
      }

      // 挑选下一个安全且富有张力的弹射目标点与滑刹终点（严格 <= maxRadius * 0.80）
      function planNextLaunch(maxR, sMul) {
        state.shotSeq++;
        const safeLim = maxR * 0.80;
        const r1 = hash2i(state.shotSeq, seed0, 151);
        const r2 = hash2i(state.shotSeq, seed0, 277);

        // 优先朝向圆台空旷侧弹射，获得清晰的长直线飞行轨迹
        const toCenter = Math.hypot(state.poleX, state.poleY) > 4
          ? Math.atan2(-(0 - state.poleX), 0 - state.poleY)
          : hyaw0;
        const aimYaw = wrapAngle(toCenter + (r1 - 0.5) * 1.35);
        state.launchYaw = aimYaw;

        const fwdX = -Math.sin(aimYaw);
        const fwdY = Math.cos(aimYaw);
        const flyDist = lerp(24.0, 32.0, r2) * clamp(sMul, 0.85, 1.15);
        const skidDist = 6.2 * clamp(sMul, 0.85, 1.15);

        const rawBrakeX = state.poleX + fwdX * (flyDist + skidDist);
        const rawBrakeY = state.poleY + fwdY * (flyDist + skidDist);
        const [bx, by] = clampVec2(rawBrakeX, rawBrakeY, safeLim);

        const totalDx = bx - state.poleX;
        const totalDy = by - state.poleY;
        const totalDist = Math.hypot(totalDx, totalDy);
        const actualSkid = Math.min(skidDist, totalDist * 0.24);
        const landFrac = totalDist > 1e-3 ? clamp((totalDist - actualSkid) / totalDist, 0.65, 0.92) : 0.8;

        state.landX = state.poleX + totalDx * landFrac;
        state.landY = state.poleY + totalDy * landFrac;
        state.brakeX = bx;
        state.brakeY = by;

        if (totalDist > 1.0) {
          state.launchYaw = Math.atan2(-totalDx, totalDy);
        }
      }

      function computePoleAnchor(hx, hy, maxR) {
        // 将竹竿根部安放在安全偏移处，确保后弯不越界、前弹视野拉满
        const poleLim = Math.min(maxR * 0.42, 19.0);
        const baseX = (Math.abs(hx) < 2 && Math.abs(hy) < 2) ? -10.0 : hx;
        const baseY = (Math.abs(hx) < 2 && Math.abs(hy) < 2) ? -8.0 : hy;
        const [px, py] = clampVec2(baseX, baseY, poleLim);
        state.poleX = px;
        state.poleY = py;
      }

      const instance = {
        def: Tree5Def,
        cachePrefix: `tree5_bl_${Math.random().toString(36).slice(2, 7)}`,
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
          const sMul = instance.scaleMul || 1.0;
          computePoleAnchor(hx, hy, 46);
          state.launchYaw = hyaw;
          planNextLaunch(46, sMul);

          poleBendSpring.x = 0.76; poleBendSpring.v = 0;
          legCoilSpring.x  = 1.0;  legCoilSpring.v  = 0;
          armGripSpring.x  = 1.0;  armGripSpring.v  = 0;
          headYawSpring.x  = 0;    headYawSpring.v  = 0;
          eyeScanSpring.x  = 0;    eyeScanSpring.v  = 0;

          const gripPt = evalPolePoint(0.58, 0.76, sMul);
          state.x = gripPt.x;
          state.y = gripPt.y;
          state.z = gripPt.z;
          state.vx = 0; state.vy = 0;
          state.yaw = state.launchYaw;
          state.poleBend = 0.76;
          state.legCoil = 1.0;
          state.armGrip = 1.0;
          state.headYaw = 0;
          state.eyeYawOff = 0;
          state.eyeCd = 0.8;
          state.eyeTarget = 0;
          state.trailCd = 0;
          state.skidCd = 0;
          state.hopCountPrev = -1;

          fsm.reset('disguise');
          state.mode = 'disguise';
          state.modeP = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const speedMul = clamp(params.speed ?? 1.0, 0.35, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const maxR = (eco && eco.maxRadius) || 46;
          const safeLim = maxR * 0.80;

          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const isPatrol = action === 'patrol';
          const isIdle   = action === 'idle';
          const isLaunch = action === 'launch';

          const hxHome = (eco && eco.homeX !== undefined) ? eco.homeX : hx0;
          const hyHome = (eco && eco.homeY !== undefined) ? eco.homeY : hy0;
          computePoleAnchor(hxHome, hyHome, maxR);

          // 动作切换处理
          if (action !== state.prevAction) {
            state.prevAction = action;
            if (isIdle) {
              fsm.forceState('disguise', 12.0);
              state.eyeCd = 0.5;
            } else if (isLaunch) {
              planNextLaunch(maxR, sMul);
              fsm.forceState('tense', 0.52);
            } else {
              planNextLaunch(maxR, sMul);
              fsm.reset('disguise');
            }
          }

          // 推进通用伏击状态机（createAmbushCycle）
          const step = fsm.update(dt, {
            autoTrigger: isPatrol || isLaunch,
            canRelocate: isPatrol,
            speed: speedMul * (isLaunch ? 1.25 : 1.0)
          });

          // launch 高频演示模式：缩短静伏停留，高频展示「压弯 -> 弹射 -> 滑刹 -> 跳回」
          if (isLaunch && fsm.state.mode === 'disguise' && fsm.state.t >= 0.85) {
            fsm.trigger();
          }

          const mode = fsm.state.mode;
          const p = clamp(fsm.state.t / Math.max(0.01, fsm.state.dur), 0, 1);
          const modeChanged = step.changed || mode !== state.mode;
          state.mode = mode;
          state.modeP = p;
          state.tremor = step.tremor;

          const fxPal = (curSkin && curSkin.fx) || SKINS[0].fx;

          // 状态切换一次性事件
          if (modeChanged) {
            if (mode === 'disguise') {
              if (state.prevAction !== 'idle') {
                // 保持当前 launchYaw，准备下一次瞄准
              }
              state.eyeCd = 0.65;
            } else if (mode === 'tense') {
              planNextLaunch(maxR, sMul);
              state.eyeTarget = 0;
            } else if (mode === 'strike') {
              // 松手瞬间！记录起跳点，给竹竿一个猛烈的负向回弹脉冲（啪地弹直并颤抖！）
              const gripNow = evalPolePoint(0.58, state.poleBend, sMul);
              state.launchStartX = gripNow.x;
              state.launchStartY = gripNow.y;
              state.launchStartZ = gripNow.z;
              poleBendSpring.impulse(-19.5 * sp);
              legCoilSpring.impulse(-8.5 * sp);
              state.trailCd = 0;

              if (vfx) {
                const tipPt = evalPolePoint(1.0, state.poleBend, sMul);
                for (let k = 0; k < 6; k++) {
                  const a = state.launchYaw + (k - 2.5) * 0.42;
                  vfx.spawnParticle(
                    tipPt.x, tipPt.y, tipPt.z,
                    -Math.sin(a) * 14 * sMul, Math.cos(a) * 14 * sMul, (6 + k * 1.2) * sMul,
                    0.48, 1.3, k % 2 === 0 ? fxPal.leaf : fxPal.streak, false, 14
                  );
                }
                if (habitat && habitat.fx) {
                  vfx.spawnDust(state.poleX, state.poleY, 6, 0.9 * sMul, habitat.fx);
                }
              }
            } else if (mode === 'digest') {
              // 落地瞬间！激起急刹尘雾
              state.skidCd = 0;
              if (vfx) {
                if (habitat && habitat.fx) {
                  vfx.spawnDust(state.landX, state.landY, 10, 1.25 * sMul, habitat.fx);
                }
                vfx.addDecal({
                  kind: 'skid',
                  x: lerp(state.landX, state.brakeX, 0.5),
                  y: lerp(state.landY, state.brakeY, 0.5),
                  yaw: state.launchYaw,
                  rx: 3.2 * sMul,
                  ry: 6.0 * sMul,
                  life: 6.5,
                  alpha: 0.58
                });
              }
            } else if (mode === 'recover') {
              state.retStartX = state.x;
              state.retStartY = state.y;
              state.hopCountPrev = -1;
            } else if (mode === 'relocate') {
              state.relFromYaw = state.launchYaw;
              state.relToYaw = wrapAngle(state.launchYaw + lerp(1.2, 2.3, hash2i(state.shotSeq + 3, seed0, 509)));
              state.hopCountPrev = -1;
            }
          }

          // -----------------------------------------------------------------
          // 6 态运动学解算
          // -----------------------------------------------------------------
          let targetPoleBend = 0;
          let targetLegCoil = 0.45;
          let targetArmGrip = 0.25;
          let targetHeadYaw = 0;
          let targetEyeYaw = 0;

          const prevX = state.x;
          const prevY = state.y;

          if (mode === 'disguise') {
            // 抱在竹竿半腰压弯静伏，仅一对亮金大眼警惕转动
            targetPoleBend = 0.76 + state.tremor * 0.06;
            targetLegCoil = 0.92;
            targetArmGrip = 1.0;

            state.eyeCd -= dt * speedMul * gFreq;
            if (state.eyeCd <= 0) {
              state.eyeSeq++;
              const rA = hash2i(state.eyeSeq, seed0, 617);
              const rB = hash2i(state.eyeSeq, seed0, 739);
              state.eyeTarget = (rA - 0.5) * 1.45;
              state.eyeCd = lerp(0.55, 1.35, rB);
            }
            targetEyeYaw = state.eyeTarget;
            targetHeadYaw = state.eyeTarget * 0.28;

            const pt = evalPolePoint(0.58, state.poleBend, sMul);
            state.x = pt.x;
            state.y = pt.y;
            state.z = pt.z;
            state.yaw = wrapAngle(state.yaw + wrapAngle(state.launchYaw - state.yaw) * expSmooth(dt, 8.0));
          } else if (mode === 'tense') {
            // 压低满蓄：竹竿弯度拉满到 1.02，后腿缩成满弦，双眼锁死目标，尾棍笔直对准
            const u = smoothstep(0, 1, p);
            targetPoleBend = lerp(0.76, 1.04, u) + Math.sin(time * 48) * 0.025;
            targetLegCoil = 1.0;
            targetArmGrip = 1.0;
            targetHeadYaw = 0;
            targetEyeYaw = 0;

            const pt = evalPolePoint(0.56, state.poleBend, sMul);
            state.x = pt.x;
            state.y = pt.y;
            state.z = pt.z;
            state.yaw = state.launchYaw;
          } else if (mode === 'strike') {
            // 骤然弹射：竹竿目标归 0（弹簧猛弹直+颤抖），本体像箭一样直线高速飞向 landX/landY！
            targetPoleBend = 0;
            targetLegCoil = 0.0; // 后腿完全蹬直拉长
            targetArmGrip = 0.0; // 前臂前伸准备扑抓
            targetHeadYaw = 0;
            targetEyeYaw = 0;

            // 先快后微收的直线弹道，高度划出利落低平箭弧
            const u = Math.pow(p, 0.82);
            const rawX = lerp(state.launchStartX, state.landX, u);
            const rawY = lerp(state.launchStartY, state.landY, u);
            const [cx, cy] = clampVec2(rawX, rawY, safeLim);
            state.x = cx;
            state.y = cy;
            state.z = lerp(state.launchStartZ, 1.2 * sMul, u) + Math.sin(u * Math.PI) * 8.8 * sMul;
            state.yaw = state.launchYaw;

            // 高速飞行尘尾与风迹粒子
            state.trailCd -= dt;
            if (vfx && state.trailCd <= 0) {
              state.trailCd = 0.028;
              const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw, 0, -9.5 * sMul);
              vfx.spawnParticle(
                tx + (Math.random() - 0.5) * 1.6 * sMul,
                ty + (Math.random() - 0.5) * 1.6 * sMul,
                state.z + 1.5 * sMul,
                (Math.random() - 0.5) * 4 * sMul,
                (Math.random() - 0.5) * 4 * sMul,
                2.5 * sMul,
                0.32, 1.35, fxPal.streak, false, 6
              );
              vfx.spawnParticle(
                tx, ty, Math.max(0.5, state.z - 1.0 * sMul),
                (Math.random() - 0.5) * 5 * sMul,
                (Math.random() - 0.5) * 5 * sMul,
                3.0 * sMul,
                0.36, 1.15, fxPal.dust, false, 12
              );
            }
          } else if (mode === 'digest') {
            // 落地急刹滑行一段刹住（前 45% 急刹滑行，后 55% 伏地警觉环视）
            targetPoleBend = 0;
            const slideU = clamp(p / 0.45, 0, 1);
            const slideEase = 1 - Math.pow(1 - slideU, 3);
            const rawX = lerp(state.landX, state.brakeX, slideEase);
            const rawY = lerp(state.landY, state.brakeY, slideEase);
            const [cx, cy] = clampVec2(rawX, rawY, safeLim);
            state.x = cx;
            state.y = cy;
            state.z = 0;
            state.yaw = state.launchYaw;

            if (slideU < 1) {
              targetLegCoil = 0.62;
              targetArmGrip = 0.12;
              targetHeadYaw = 0;
              targetEyeYaw = 0;
              state.skidCd -= dt;
              if (vfx && habitat && habitat.fx && state.skidCd <= 0) {
                state.skidCd = 0.06;
                vfx.spawnDust(state.x, state.y, 4, 0.85 * sMul, habitat.fx);
              }
            } else {
              // 刹稳后左右快扫一眼准备跳回
              const scanU = (p - 0.45) / 0.55;
              targetLegCoil = 0.78;
              targetArmGrip = 0.35;
              targetHeadYaw = Math.sin(scanU * Math.PI * 2) * 0.42;
              targetEyeYaw = Math.sin(scanU * Math.PI * 2) * 0.65;
            }
          } else if (mode === 'recover') {
            // 复原归位：小步连跳回竹竿旁，最后 22% 纵身跃上竹竿半腰并压弯竹子！
            const climbStart = 0.78;
            if (p < climbStart) {
              const hopTotal = 3;
              const uWalk = p / climbStart;
              const hopF = uWalk * hopTotal;
              const hopIdx = Math.floor(hopF);
              const hopLocal = hopF - hopIdx;

              // 目标点停在竹竿基部附近
              const [nearX, nearY] = localToWorldXY(state.poleX, state.poleY, state.launchYaw, 0, 5.0 * sMul);
              const rawX = lerp(state.retStartX, nearX, uWalk);
              const rawY = lerp(state.retStartY, nearY, uWalk);
              const [cx, cy] = clampVec2(rawX, rawY, safeLim);
              state.x = cx;
              state.y = cy;
              state.z = Math.sin(hopLocal * Math.PI) * 5.6 * sMul;

              const backDx = nearX - state.retStartX;
              const backDy = nearY - state.retStartY;
              if (Math.hypot(backDx, backDy) > 0.5) {
                const backYaw = Math.atan2(-backDx, backDy);
                state.yaw = wrapAngle(state.yaw + wrapAngle(backYaw - state.yaw) * expSmooth(dt, 14.0));
              }

              targetPoleBend = 0;
              targetLegCoil = hopLocal < 0.25 ? 0.92 : (hopLocal < 0.72 ? 0.15 : 0.78);
              targetArmGrip = 0.35;
              targetHeadYaw = 0;
              targetEyeYaw = 0;

              if (hopIdx !== state.hopCountPrev) {
                state.hopCountPrev = hopIdx;
                if (vfx && habitat && habitat.fx && hopIdx > 0) {
                  EnvFeedback.emitFootstep(vfx, habitat, state.x, state.y, 0.7 * sMul);
                }
              }
            } else {
              // 跃上竹竿半腰并用体重压弯竹子！
              const uClimb = (p - climbStart) / (1 - climbStart);
              const easeC = smoothstep(0, 1, uClimb);
              targetPoleBend = lerp(0, 0.76, easeC);
              targetLegCoil = lerp(0.25, 0.92, easeC);
              targetArmGrip = lerp(0.5, 1.0, easeC);

              const gripPt = evalPolePoint(0.58, state.poleBend, sMul);
              const [nearX, nearY] = localToWorldXY(state.poleX, state.poleY, state.launchYaw, 0, 5.0 * sMul);
              state.x = lerp(nearX, gripPt.x, easeC);
              state.y = lerp(nearY, gripPt.y, easeC);
              state.z = lerp(0, gripPt.z, easeC) + Math.sin(easeC * Math.PI) * 4.5 * sMul;
              state.yaw = wrapAngle(state.yaw + wrapAngle(state.launchYaw - state.yaw) * expSmooth(dt, 12.0));
            }
          } else if (mode === 'relocate') {
            // 绕竹竿小跳换向瞄准新方向，再重新压弯竹子
            const u = smoothstep(0, 1, p);
            state.launchYaw = wrapAngle(state.relFromYaw + wrapAngle(state.relToYaw - state.relFromYaw) * u);
            targetPoleBend = lerp(0.76, 0.42, Math.sin(u * Math.PI));
            targetLegCoil = 0.82;
            targetArmGrip = 0.95;
            targetHeadYaw = Math.sin(u * Math.PI) * 0.35;
            targetEyeYaw = Math.sin(u * Math.PI) * 0.55;

            const pt = evalPolePoint(0.58, state.poleBend, sMul);
            state.x = pt.x;
            state.y = pt.y;
            state.z = pt.z;
            state.yaw = state.launchYaw;
          }

          // 安全边界硬钳位兜底
          const [clampedX, clampedY] = clampVec2(state.x, state.y, safeLim);
          state.x = clampedX;
          state.y = clampedY;
          state.vx = (state.x - prevX) / Math.max(dt, 0.001);
          state.vy = (state.y - prevY) / Math.max(dt, 0.001);

          // 弹簧推进（竹竿低阻尼高刚度 -> 弹直后清脆颤抖！）
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          state.poleBend  = clamp(poleBendSpring.update(dt, targetPoleBend, 390 * sp, clamp(6.4 * dScale, 3.8, 11.0)), -0.45, 1.20);
          state.legCoil   = clamp(legCoilSpring.update(dt, targetLegCoil, 220 * sp, 14.0), -0.1, 1.15);
          state.armGrip   = clamp(armGripSpring.update(dt, targetArmGrip, 200 * sp, 13.5), 0, 1.1);
          state.headYaw   = clamp(headYawSpring.update(dt, targetHeadYaw, 160 * sp, 11.0), -0.65, 0.65);
          state.eyeYawOff = clamp(eyeScanSpring.update(dt, targetEyeYaw, 190 * sp, 12.5), -0.95, 0.95);

          sockets.setWorld('center', state.x, state.y, state.z + 4.0 * sMul, state.yaw);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const isWater = !!(habitat && habitat.isWater);
          const waterLevel = habitat ? (habitat.waterLevel ?? -99) : -99;
          const calcSub = (z) => EnvFeedback.calcSubmerge(z, waterLevel, 5.0, isWater);

          // -----------------------------------------------------------------
          // 1. 自带 4 节可压弯弹直的翠竹竿道具件（根节 + 3 节共用中段 + 竹梢嫩叶）
          //    随 state.poleBend 弯成弓弧，松手瞬间啪地弹直并颤抖！
          // -----------------------------------------------------------------
          const p0 = evalPolePoint(0.00, state.poleBend, sMul);
          const p1 = evalPolePoint(0.30, state.poleBend, sMul);
          const p2 = evalPolePoint(0.60, state.poleBend, sMul);
          const p3 = evalPolePoint(0.86, state.poleBend, sMul);
          const pTip = evalPolePoint(1.00, state.poleBend, sMul);

          list.push({
            partKey: 'bambooRoot',
            asset: parts.bambooRoot,
            x: p0.x, y: p0.y,
            lift: 0,
            ro: state.launchYaw,
            symDeg: 90,
            submerge: calcSub(1.5 * sMul),
            bias: -0.55
          });
          for (const [idx, pt] of [[1, p1], [2, p2], [3, p3]]) {
            list.push({
              partKey: 'bambooSeg',
              asset: parts.bambooSeg,
              x: pt.x, y: pt.y,
              lift: Math.max(0.2, pt.z - 2.2 * sMul),
              ro: state.launchYaw,
              symDeg: 90,
              submerge: calcSub(pt.z),
              bias: -0.45 + idx * 0.04
            });
          }
          // 竹梢三片嫩叶随竹竿回弹微微摆动
          const tipFlutter = wrapAngle(state.launchYaw + state.poleBend * 0.45);
          list.push({
            partKey: 'bambooTip',
            asset: parts.bambooTip,
            x: pTip.x, y: pTip.y,
            lift: Math.max(1.0, pTip.z - 1.5 * sMul),
            ro: tipFlutter,
            submerge: calcSub(pTip.z),
            bias: -0.25
          });

          // -----------------------------------------------------------------
          // 2. 瘦长竹节躯干（抱竹时贴在竹竿前侧，清晰分离不穿模）
          // -----------------------------------------------------------------
          const onPole = state.armGrip > 0.65 && (state.mode === 'disguise' || state.mode === 'tense' || state.mode === 'relocate');
          const clingOff = onPole ? 3.2 * sMul : 0;
          const [bx, by] = localToWorldXY(state.x, state.y, yw, 0, clingOff);
          const bodyLift = Math.max(2.6 * sMul, state.z + 2.6 * sMul);
          const bodyBias = 0.25;

          list.push({
            partKey: 'torso',
            asset: parts.torso,
            x: bx, y: by,
            lift: bodyLift,
            ro: yw,
            submerge: calcSub(bodyLift + 2.0 * sMul),
            bias: bodyBias
          });

          // -----------------------------------------------------------------
          // 3. 笔直坚硬标枪尾棍（尾尖亮橙/象牙色点睛，pivotToWorldXY 锁死尾根）
          // -----------------------------------------------------------------
          const tailYaw = wrapAngle(yw + (state.mode === 'recover' ? Math.sin(state.modeP * TAU * 3) * 0.14 : 0));
          const [tjx, tjy] = localToWorldXY(bx, by, yw, 0, -7.2 * sMul);
          const [tx, ty] = pivotToWorldXY(tjx, tjy, tailYaw, TAIL_PIVOT.x * sMul, TAIL_PIVOT.y * sMul);
          const tailLift = bodyLift + (state.mode === 'strike' ? 1.8 : 1.2) * sMul;

          list.push({
            partKey: 'tailRod',
            asset: parts.tailRod,
            x: tx, y: ty,
            lift: tailLift,
            ro: tailYaw,
            submerge: calcSub(tailLift),
            bias: bodyBias - 0.15
          });

          // -----------------------------------------------------------------
          // 4. 超长强壮曲折后腿（左/右独立，夸张外扩曲折，俯视一眼看清标志折腿！）
          //    legCoil = 1 紧缩折叠如弓；legCoil = 0 猛蹬拉直拖在身后
          // -----------------------------------------------------------------
          const coil = clamp(state.legCoil, 0, 1);
          for (const side of [-1, 1]) {
            const thighKey = side < 0 ? 'hindThighL' : 'hindThighR';
            const shinKey  = side < 0 ? 'hindShinL'  : 'hindShinR';

            // 髋关节位于后躯两侧
            const [hipX, hipY] = localToWorldXY(bx, by, yw, side * 3.1 * sMul, -4.6 * sMul);
            // 股节外扩角：紧缩蓄力时大幅前折外张（±0.72 rad），弹射蹬直时向后拉直（±2.85 rad）
            const thighRelYaw = side * lerp(2.75, 0.68, coil);
            const thighYaw = wrapAngle(yw + thighRelYaw);
            const [thX, thY] = pivotToWorldXY(hipX, hipY, thighYaw, HIND_THIGH_PIVOT.x * sMul, HIND_THIGH_PIVOT.y * sMul);
            const thighLift = Math.max(0.4, bodyLift - (1.0 - coil * 0.8) * sMul);

            list.push({
              partKey: thighKey,
              asset: parts[thighKey],
              x: thX, y: thY,
              lift: thighLift,
              ro: thighYaw,
              submerge: calcSub(thighLift + 2.0 * sMul),
              bias: bodyBias + 0.18
            });

            // 膝关节世界坐标（沿股节正前 +Y 推 10.8 格）
            const [kneeX, kneeY] = localToWorldXY(hipX, hipY, thighYaw, side * 1.1 * sMul, 10.8 * sMul);
            // 胫节从膝盖向后下折回（紧缩时折回身侧，蹬直时顺股节拉直）
            const shinRelYaw = side * lerp(2.92, 0.22, coil);
            const shinYaw = wrapAngle(yw + shinRelYaw);
            const [shX, shY] = pivotToWorldXY(kneeX, kneeY, shinYaw, HIND_SHIN_PIVOT.x * sMul, HIND_SHIN_PIVOT.y * sMul);
            const shinLift = Math.max(0.2, bodyLift - (2.4 - coil * 0.6) * sMul);

            list.push({
              partKey: shinKey,
              asset: parts[shinKey],
              x: shX, y: shY,
              lift: shinLift,
              ro: shinYaw,
              submerge: calcSub(shinLift + 1.0 * sMul),
              bias: bodyBias + 0.08
            });

            // 后足爪世界坐标（沿胫节 -Y 端 10.2 格）
            const [ftX, ftY] = localToWorldXY(kneeX, kneeY, shinYaw, 0, -10.2 * sMul);
            const footLift = state.mode === 'strike'
              ? Math.max(0.5, bodyLift - 2.6 * sMul)
              : (onPole ? Math.max(0.5, bodyLift - 3.0 * sMul) : Math.max(0, state.z));

            list.push({
              partKey: 'hindFoot',
              asset: parts.hindFoot,
              x: ftX, y: ftY,
              lift: footLift,
              ro: wrapAngle(yw + side * 0.18),
              submerge: calcSub(footLift),
              bias: bodyBias - 0.08
            });
          }

          // -----------------------------------------------------------------
          // 5. 细长抱竹前臂（抱竹时内扣环抱竹竿，弹射/急刹时前伸）
          // -----------------------------------------------------------------
          const grip = clamp(state.armGrip, 0, 1);
          for (const side of [-1, 1]) {
            const armKey = side < 0 ? 'foreArmL' : 'foreArmR';
            const [shX, shY] = localToWorldXY(bx, by, yw, side * 2.8 * sMul, 4.6 * sMul);
            // 抱竹时向内扣抱（-side * 0.55），前扑时朝前外张（+side * 0.25）
            const armYaw = wrapAngle(yw + side * lerp(0.26, -0.58, grip));
            const [ax, ay] = pivotToWorldXY(shX, shY, armYaw, FORE_ARM_PIVOT.x * sMul, FORE_ARM_PIVOT.y * sMul);
            const armLift = Math.max(0.4, bodyLift - 0.8 * sMul);

            list.push({
              partKey: armKey,
              asset: parts[armKey],
              x: ax, y: ay,
              lift: armLift,
              ro: armYaw,
              submerge: calcSub(armLift),
              bias: bodyBias + 0.12
            });
          }

          // -----------------------------------------------------------------
          // 6. 敏锐头部 + 一对独立转动的亮金警戒大眼（0 遮挡俯视点睛）
          // -----------------------------------------------------------------
          const hYaw = wrapAngle(yw + state.headYaw);
          const [hjx, hjy] = localToWorldXY(bx, by, yw, 0, 7.6 * sMul);
          const [hx, hy] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const headLift = bodyLift + 1.4 * sMul;

          list.push({
            partKey: 'head',
            asset: parts.head,
            x: hx, y: hy,
            lift: headLift,
            ro: hYaw,
            submerge: calcSub(headLift + 1.5 * sMul),
            bias: bodyBias + 0.45
          });

          // 一对亮金警戒大眼架于头顶两侧，静伏时独立左右扫视
          const eyeYaw = wrapAngle(hYaw + state.eyeYawOff);
          for (const side of [-1, 1]) {
            const [ex, ey] = localToWorldXY(hx, hy, hYaw, side * 2.5 * sMul, 0.8 * sMul);
            list.push({
              partKey: 'eyeOrb',
              asset: parts.eyeOrb,
              x: ex, y: ey,
              lift: headLift + 4.0 * sMul,
              ro: eyeYaw,
              submerge: calcSub(headLift + 4.5 * sMul),
              bias: bodyBias + 0.72
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Tree5Def.id,
            code: Tree5Def.code,
            name: Tree5Def.name,
            status: Tree5Def.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            mode: state.mode,
            footRadius: Tree5Def.footRadius,
            headZ: 14,
            centerZ: 7,
            blocks: Tree5Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Tree5Def);
})(window.PixelWorkshop);
