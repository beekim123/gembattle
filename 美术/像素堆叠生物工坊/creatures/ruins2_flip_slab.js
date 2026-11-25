'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SocketTracker } = PW.Solvers;

  // =========================================================================
  // M38 标杆 · 遗2 · 扁平翻面的（正面苔石板伪装 <-> 4 档丝滑翻面亮出剧毒警戒背）
  // -------------------------------------------------------------------------
  // 【顶层可复用配置 M38_CONFIG】
  //   - slabHalfW / slabHalfL / slabHalfT : 扁平石板半宽 8.2、半长 11.8、半厚 2.2（体素盒 22~24 × 26~28 × 6~16）
  //   - 4 档预烘姿态：faceFlat(0°) -> flip45(48°) -> flip90(90°) -> backFlat(180°)，杜绝翻面闪切
  //   - flipUpLift / flipBackLift         : 受惊弹跳翻面跃高 6.2 格，翻回跃高 5.2 格
  //   - warnHoldDur                       : 亮出剧毒警戒背保持 3.2~3.8 秒并喷吐淡黄毒雾微粒
  //   - targetRadiusRatio                 : 巡游严格钳制在 maxRadius * 0.78 内（硬红线 <= 0.80）
  // =========================================================================
  const M38_CONFIG = {
    slabHalfW: 8.2,
    slabHalfL: 11.8,
    slabHalfT: 2.2,

    // 慢爬伪装参数
    crawlSpeed: 5.2,
    crawlDur: [4.2, 6.2],
    startleDur: 0.24,

    // 翻面与威吓参数
    flipUpDur: 0.46,
    flipUpLift: 6.2,
    warnHoldDur: [3.2, 3.8],
    flipBackDur: 0.52,
    flipBackLift: 5.2,

    // 边界钳制红线（严格 <= maxRadius * 0.80）
    targetRadiusRatio: 0.78,
    hardRadiusRatio: 0.80
  };

  // =========================================================================
  // 1. 调色板（27 色 <= 48 色，0 重色，0 自亮防模糊；正反面极强反差）
  //    正面：青灰古石板 + 遗迹凿刻暗槽 + 鲜绿苔斑 + 暗色软边与锐利警惕小眼
  //    背面：箭毒蛙/火蝾螈级高饱和亮橙黄 + 漆黑粗条斑纹 + 毒腺凸点
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 正面青灰古石板（3 档）
      stoneDark:   '#3b474d',
      stoneMid:    '#576870',
      stoneHi:     '#798d96',
      // 遗迹刻纹浅切棱（3 档）
      bevelDark:   '#6d7f85',
      bevelMid:    '#93a8ae',
      bevelHi:     '#bdd1d6',
      // 深凿石板刻槽（3 档）
      grooveDark:  '#1d262b',
      grooveMid:   '#2c3940',
      grooveHi:    '#405159',
      // 鲜绿活苔斑（3 档）
      mossDark:    '#235c24',
      mossMid:     '#3f9436',
      mossHi:      '#76cc52',
      // 板底暗色软边与小短足（3 档）
      rimDark:     '#21181c',
      rimMid:      '#3b2a30',
      rimHi:       '#5c424b',
      // 前缘一对警惕小眼（3 档，绝不进 glowKeys）
      eyeDark:     '#100d12',
      eyeIris:     '#f2b629',
      eyeGlint:    '#fff9e3',
      // 背面剧毒亮橙黄底色（3 档，极高饱和一眼刺目）
      warnDark:    '#e06200',
      warnMid:     '#ff9d0a',
      warnHi:      '#ffe238',
      // 背面漆黑粗条斑纹（3 档）
      stripeDark:  '#0c0a10',
      stripeMid:   '#181421',
      stripeHi:    '#2b2438',
      // 背面凸起毒腺点（3 档）
      glandDark:   '#c43d00',
      glandMid:    '#ff6a00',
      glandHi:     '#fff27a'
    },
    glowKeys: [],
    parts: ['stone', 'bevel', 'groove', 'moss', 'rim', 'eye', 'warn', 'stripe', 'gland'],
    noCrease: [
      ['stone', 'bevel'],
      ['stone', 'moss'],
      ['bevel', 'moss'],
      ['rim', 'eye'],
      ['stone', 'eye'],
      ['warn', 'stripe'],
      ['warn', 'gland'],
      ['stripe', 'gland']
    ],
    materials: {
      stone:  ['stoneDark',  'stoneMid',  'stoneHi'],
      bevel:  ['bevelDark',  'bevelMid',  'bevelHi'],
      groove: ['grooveDark', 'grooveMid', 'grooveHi'],
      moss:   ['mossDark',   'mossMid',   'mossHi'],
      rim:    ['rimDark',    'rimMid',    'rimHi'],
      warn:   ['warnDark',   'warnMid',   'warnHi'],
      stripe: ['stripeDark', 'stripeMid', 'stripeHi'],
      gland:  ['glandDark',  'glandMid',  'glandHi']
    },
    protectedParts: ['eye', 'warn', 'stripe', 'gland', 'moss']
  });

  // 3 套零重建模换色皮肤（每套 27 色、0 重色、0 禁用字）
  const SKINS = [
    {
      id: 'moss_orange',
      name: '青苔石板×亮橙黑斑',
      dot: '#ff9d0a',
      outline: '#0d1014',
      pal: {},
      fx: {
        mistA: '#ffe866',
        mistB: '#ffab2e',
        dust:  '#8a9690',
        moss:  '#66bd48'
      }
    },
    {
      id: 'sand_crimson',
      name: '暖砂石板×赤红黑斑',
      dot: '#e62229',
      outline: '#170d0a',
      pal: {
        stoneDark:  '#69543e', stoneMid:  '#947858', stoneHi:  '#bd9e78',
        bevelDark:  '#a68d6c', bevelMid:  '#ccb28f', bevelHi:  '#ebd5b5',
        grooveDark: '#3b2c1e', grooveMid: '#543f2b', grooveHi: '#73573c',
        mossDark:   '#595c22', mossMid:   '#878c35', mossHi:   '#b8bf54',
        rimDark:    '#291815', rimMid:    '#472923', rimHi:    '#6b3e35',
        eyeDark:    '#120b0c', eyeIris:   '#ffd038', eyeGlint: '#fff7db',
        warnDark:   '#b80f18', warnMid:   '#f0242b', warnHi:   '#ff6e54',
        stripeDark: '#0d090b', stripeMid: '#1f1519', stripeHi: '#36262c',
        glandDark:  '#8f0814', glandMid:  '#ff3b30', glandHi:  '#ffcf70'
      },
      fx: {
        mistA: '#ff8a73',
        mistB: '#ff4238',
        dust:  '#c7b092',
        moss:  '#a5ad47'
      }
    },
    {
      id: 'slate_indigo',
      name: '暗岩苔板×明黄靛斑',
      dot: '#f5dc1d',
      outline: '#0a0d17',
      pal: {
        stoneDark:  '#242a33', stoneMid:  '#39424f', stoneHi:  '#556273',
        bevelDark:  '#4e5b6b', bevelMid:  '#738499', bevelHi:  '#9cb0c7',
        grooveDark: '#12161c', grooveMid: '#1d232c', grooveHi: '#2c3442',
        mossDark:   '#1a5443', mossMid:   '#2e8a6c', mossHi:   '#5cc79f',
        rimDark:    '#151624', rimMid:    '#282a42', rimHi:    '#414569',
        eyeDark:    '#0b0c14', eyeIris:   '#ff9e24', eyeGlint: '#fffbe6',
        warnDark:   '#d4b400', warnMid:   '#f7de19', warnHi:   '#fff778',
        stripeDark: '#101438', stripeMid: '#1f2866', stripeHi: '#37469c',
        glandDark:  '#a88c00', glandMid:  '#ffe93b', glandHi:  '#d9ff9e'
      },
      fx: {
        mistA: '#f7f279',
        mistB: '#7ea6ff',
        dust:  '#697482',
        moss:  '#4db891'
      }
    }
  ];

  // =========================================================================
  // 2. 共享石板体素采样函数（单套几何严格旋转生成 4 档姿态，绝无形变跳变）
  //    局部石板坐标 (u, v, w)：
  //      u in [-8.2, +8.2]  左右宽（共 ~17 格）
  //      v in [-11.8, +11.8] 前后长（共 ~24 格，+v 为前方）
  //      w in [-2.2, +2.2]  厚（+w 为正面青苔石板，-w 为背面剧毒警戒面）
  // =========================================================================
  function sampleSlabVoxel(u, v, w) {
    const hw = M38_CONFIG.slabHalfW;
    const hl = M38_CONFIG.slabHalfL;
    const ht = M38_CONFIG.slabHalfT;

    const au = Math.abs(u);
    const av = Math.abs(v);

    // 外轮廓：略带古石自然磨损倒角的长方石板（四角切斜角 + 微小自然缺口）
    const cornerCut = (au - (hw - 2.6)) + (av - (hl - 2.8));
    if (au > hw + 0.65 || av > hl + 0.65) return null;
    if (cornerCut > 2.35) return null;

    // 1) 背面毒腺凸点（在 -w 侧向外凸出 0.9 格，强化剧毒颗粒感）
    const glandPts = [
      [-4.8,  7.2], [ 4.8,  7.2],
      [-5.6,  1.2], [ 5.6,  1.2],
      [-4.8, -5.8], [ 4.8, -5.8],
      [ 0.0,  4.2], [ 0.0, -2.6], [ 0.0, -8.4]
    ];
    for (let i = 0; i < glandPts.length; i++) {
      const du = u - glandPts[i][0];
      const dv = v - glandPts[i][1];
      const dw = w - (-ht - 0.15);
      if (du * du / 2.25 + dv * dv / 2.25 + dw * dw / 1.15 <= 1.0) {
        return { kind: 'gland' };
      }
    }

    // 2) 前缘一对警惕小眼（位于 +v 前端斜肩，朝向前上方微探出，俯视 0 遮挡）
    if (v > hl - 2.0 && v < hl + 0.55 && w > -0.7 && w < 1.35) {
      for (const sx of [-1, 1]) {
        const eu = u - sx * 3.4;
        const ev = v - (hl - 0.55);
        const ew = w - 0.35;
        if (Math.abs(eu) <= 1.05 && Math.abs(ev) <= 1.05 && Math.abs(ew) <= 0.95) {
          // 锐利 2×2 眼部色块：外侧亮点、中央瞳孔、下侧琥珀虹膜
          if (ew > 0.25 && eu * sx > 0.05) return { kind: 'eyeGlint' };
          if (ew < -0.15) return { kind: 'eyeIris' };
          return { kind: 'eyeDark' };
        }
      }
    }

    // 3) 板底边缘隐约探出的暗色软边（仅在石板最外缘 0.7 格、中下层露出一点点）
    const isOuterRim = (au > hw - 0.45 || av > hl - 0.45 || cornerCut > 1.75);
    if (isOuterRim && w >= -1.0 && w <= 0.35) {
      return { kind: 'rim' };
    }

    // 主体石板厚盒裁切（顶底略收 0.5 格做切棱）
    const bevelShrink = Math.abs(w) > ht - 0.65 ? 0.55 : 0.0;
    if (au > hw - bevelShrink || av > hl - bevelShrink) return null;
    if (cornerCut > 2.05 - bevelShrink * 1.1) return null;
    if (w > ht || w < -ht) return null;

    // -----------------------------------------------------------------------
    // A. 背面（w <= -0.35）：刺眼亮橙黄 + 漆黑粗条斑纹（剧毒警戒面）
    // -----------------------------------------------------------------------
    if (w <= -0.35) {
      // 最外圈保留 1 格极亮橙黄警戒边，45° 刚一掀开立刻闪出刺眼橙边！
      const nearWarnEdge = (au > hw - 1.7 || av > hl - 1.7 || cornerCut > 0.65);
      if (nearWarnEdge) {
        // 外圈点缀几段漆黑断点斑，增强箭毒蛙对比度
        const edgeDot = (Math.abs(v - 4.0) < 1.3 || Math.abs(v + 4.0) < 1.3) && au > hw - 1.5;
        return { kind: edgeDot ? 'stripe' : 'warn' };
      }

      // 背面粗大漆黑人字折带 + 中央粗黑斑块（在亮橙黄底上形成极强视觉冲击）
      const chev1 = Math.abs((v - 6.6) + au * 0.52) < 1.45;
      const chev2 = Math.abs((v - 0.2) + au * 0.52) < 1.55;
      const chev3 = Math.abs((v + 6.4) + au * 0.52) < 1.45;
      const centerSpot = (au < 2.2 && Math.abs(v - 2.6) < 1.45) || (au < 2.1 && Math.abs(v + 4.4) < 1.35);
      const sideSpot = (au > 3.6 && au < 6.0 && (Math.abs(v - 4.2) < 1.2 || Math.abs(v + 2.4) < 1.2));

      if (chev1 || chev2 || chev3 || centerSpot || sideSpot) {
        return { kind: 'stripe' };
      }
      return { kind: 'warn' };
    }

    // -----------------------------------------------------------------------
    // B. 正面（w > -0.35）：青灰古石板 + 清晰遗迹刻纹 + 鲜绿苔斑
    // -----------------------------------------------------------------------
    // 顶表层（w >= ht - 1.1）：雕刻清晰遗迹回纹与鲜绿苔斑
    if (w >= ht - 1.15) {
      // 1) 鲜绿苔斑（自然非对称分布：左前角、右后角、中缝苔痕）
      const m1 = Math.hypot((u + 4.5) / 3.4, (v - 6.8) / 3.8);
      const m2 = Math.hypot((u - 4.8) / 3.5, (v + 6.2) / 4.2);
      const m3 = Math.hypot((u + 5.2) / 2.4, (v + 1.4) / 2.6);
      const m4 = Math.hypot((u - 3.6) / 2.2, (v - 3.0) / 2.1);
      if (m1 < 1.0 || m2 < 1.0 || m3 < 0.92 || m4 < 0.85) {
        return { kind: 'moss' };
      }

      // 2) 外圈古石切棱框
      if (au > hw - 1.65 || av > hl - 1.65) {
        return { kind: 'bevel' };
      }

      // 3) 遗迹石板清晰几何深槽刻纹（回字外框槽 + 中央菱形与十字古石刻槽）
      const onFrameGroove =
        (Math.abs(au - (hw - 2.6)) < 0.65 && av <= hl - 2.4) ||
        (Math.abs(av - (hl - 2.6)) < 0.65 && au <= hw - 2.4);
      const diamondD = Math.abs(au * 1.15 + av * 0.72 - 5.2);
      const onDiamondGroove = diamondD < 0.68 && au <= 4.8 && av <= 7.2;
      const onCrossGroove =
        (au < 0.62 && av > 1.8 && av < hl - 2.8) ||
        (av < 0.62 && au > 1.6 && au < hw - 2.8);

      if (onFrameGroove || onDiamondGroove || onCrossGroove) {
        return { kind: 'groove' };
      }

      // 4) 刻槽内侧浅切棱亮边（让石板刻纹在俯视 ×4 下极其锐利）
      const nearCenterRel = (au + av * 0.65 < 2.35);
      const nearFrameLip =
        (Math.abs(au - (hw - 3.5)) < 0.55 && av <= hl - 3.2) ||
        (Math.abs(av - (hl - 3.5)) < 0.55 && au <= hw - 3.2);
      if (nearCenterRel || nearFrameLip) {
        return { kind: 'bevel' };
      }

      return { kind: 'stone' };
    }

    // 中层侧壁（-0.35 < w < ht - 1.15）：古石厚板切边 + 侧面微槽
    if (au > hw - 1.2 || av > hl - 1.2) {
      if (Math.abs(v) < 0.8 || Math.abs(u) < 0.8) return { kind: 'groove' };
      return { kind: 'bevel' };
    }
    return { kind: 'stone' };
  }

  function applySampledVoxel(m, x, y, z, hit) {
    const { mat, partId, keyToId } = SPEC;
    switch (hit.kind) {
      case 'stone':    m.setRaw(x, y, z, mat('stone'),     partId.stone);  break;
      case 'bevel':    m.setRaw(x, y, z, mat('bevel'),     partId.bevel);  break;
      case 'groove':   m.setRaw(x, y, z, mat('groove'),    partId.groove); break;
      case 'moss':     m.setRaw(x, y, z, mat('moss'),      partId.moss);   break;
      case 'rim':      m.setRaw(x, y, z, mat('rim'),       partId.rim);    break;
      case 'eyeDark':  m.setRaw(x, y, z, keyToId.eyeDark,  partId.eye);    break;
      case 'eyeIris':  m.setRaw(x, y, z, keyToId.eyeIris,  partId.eye);    break;
      case 'eyeGlint': m.setRaw(x, y, z, keyToId.eyeGlint, partId.eye);    break;
      case 'warn':     m.setRaw(x, y, z, mat('warn'),      partId.warn);   break;
      case 'stripe':   m.setRaw(x, y, z, mat('stripe'),    partId.stripe); break;
      case 'gland':    m.setRaw(x, y, z, mat('gland'),     partId.gland);  break;
    }
  }

  // 构建指定翻滚角 rollRad 的石板姿态资产（绕纵轴 Y 翻转）
  //   0°   -> faceFlat（正面苔石板平趴）
  //   48°  -> flip45（半掀 45°+，正面石板与掀起的刺眼亮橙边同框可见）
  //   90°  -> flip90（竖直侧立 90°，一侧青苔石板、一侧亮橙黑斑毒背）
  //   180° -> backFlat（完全翻面，整面剧毒橙黑斑与毒腺凸点朝天）
  function buildSlabPose(makeCanvas, rollRad, boxW, boxD, boxH, scaleU) {
    const m = new VoxelModel(boxW, boxD, boxH, SPEC);
    const cosR = Math.cos(rollRad);
    const sinR = Math.sin(rollRad);
    const cz = (boxH - 1) * 0.5;
    const uScale = scaleU || 1.0;

    const halfX = (boxW - 1) * 0.5;
    const halfY = (boxD - 1) * 0.5;

    m.fillAABB(-halfX, halfX, -halfY, halfY, 0, boxH - 1, (x, y, z, X, Y) => {
      const dz = z - cz;
      // 逆旋转回石板局部坐标系 (u, v, w)
      const u = (X * cosR + dz * sinR) / uScale;
      const w = -X * sinR + dz * cosR;
      const v = Y;
      const hit = sampleSlabVoxel(u, v, w);
      if (hit) applySampledVoxel(m, x, y, z, hit);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, {
      footRadius: Math.round(Math.max(boxW, boxD) * 0.42),
      headZ: boxH,
      centerZ: Math.round(boxH * 0.5)
    });
  }

  // 共享小短足（4×4×3，四重对称 symDeg: 90）
  // 慢爬态几乎藏在石板底，微幅交替挪步；翻面威吓态微微翘在板边轻颤
  function buildShortFoot(makeCanvas) {
    const W = 4, D = 4, H = 3;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-1.5, 1.5, -1.5, 1.5, 0, H - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      if (z === 0 && r > 1.65) return;
      if (z === 1 && r > 1.35) return;
      if (z === 2 && r > 1.15) return;
      m.setRaw(x, y, z, (z === 0) ? mat('groove') : mat('rim'), (z === 0) ? partId.groove : partId.rim);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.8, headZ: H, centerZ: 1 });
  }

  // 4 条小短足在石板下的局部挂点（靠近四角内收，正面平趴时几乎完全隐藏）
  const FOOT_SLOTS = [
    { lx: -6.2, ly:  7.4, phase: 0.0 },
    { lx:  6.2, ly:  7.4, phase: Math.PI },
    { lx: -6.2, ly: -7.4, phase: Math.PI * 0.9 },
    { lx:  6.2, ly: -7.4, phase: Math.PI * 1.9 }
  ];

  // =========================================================================
  // 3. 生物定义：遗2 · 扁平翻面的（M38 标杆）
  // =========================================================================
  const Ruins2FlipSlabDef = {
    id: 'ruins2_flip_slab',
    code: '遗2',
    name: '扁平翻面的',
    status: 'done',
    tag: 'M38 标杆 · 扁平翻面警戒',
    summary: '平时贴地极慢蠕爬，正面是雕有清晰遗迹刻纹与鲜绿苔斑的青灰石板（边缘仅探出一点暗色软边与一对警惕小眼）；受惊猛地弹起经 4 档预烘姿态（平趴→半掀 45°→侧立 90°→完全翻面）啪嗒落地，亮出箭毒蛙级高饱和亮橙黑斑与毒腺凸点并喷吐淡黄毒雾，威吓 3~4 秒后再丝滑翻回继续慢爬',
    defaultHabitat: 'ruins',
    footRadius: 13.5,
    ecoWeight: 0.85,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    m38Config: M38_CONFIG,
    blocks: [
      '4 档预烘翻面姿态（平趴/半掀45°/侧立90°/翻面毒背）零闪切',
      '正面青灰遗迹刻纹苔石板与一对前缘警惕小眼',
      '背面高饱和亮橙黑条斑纹与凸起毒腺强警戒反差',
      '受惊弹跳翻身啪嗒落地喷吐淡黄毒雾微粒',
      '板底 4 条隐匿小短足贴地慢爬与 3 套生境换色皮肤'
    ],
    soulHabit: '平时趴在遗迹石板缝间贴地极慢蠕爬，正面看着就是一块长满鲜绿苔斑的雕纹古石板，只从边缘露出一对警惕小眼；一旦受惊便猛地弹起翻身啪嗒落地，亮出刺眼的橙黑斑纹与毒腺凸点并散开一圈淡黄毒雾，威吓三四秒后再利落翻回正面继续慢爬',
    actions: [
      { id: 'patrol', name: '伪装巡游（慢爬→受惊翻面威吓→翻回）', loop: true, status: 'done' },
      { id: 'idle',   name: '苔石静伏（伪装微颤）',                 loop: true, status: 'done' },
      { id: 'flip',   name: '翻面演示（4 档丝滑翻面与翻回）',       loop: true, status: 'done' }
    ],
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      // 4 档预烘翻面姿态资产（体素盒严格控制在 24×28×6~16 内，零闪切、零常态拉伸）
      const parts = {
        faceFlat:  buildSlabPose(makeCanvas, 0,                  22, 28,  6, 1.00),
        flip45:    buildSlabPose(makeCanvas, Math.PI * 48 / 180, 20, 28, 16, 0.96),
        flip90:    buildSlabPose(makeCanvas, Math.PI * 0.5,      10, 28, 16, 0.90),
        backFlat:  buildSlabPose(makeCanvas, Math.PI,            22, 28,  6, 1.00),
        shortFoot: buildShortFoot(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.42;
      const seed0 = opts.seed ?? 38;

      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      const state = {
        x: hx0,
        y: hy0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        shadowScale: 0.92,

        // 状态机：'crawl' | 'startle' | 'flip_up' | 'warn_hold' | 'flip_back' | 'idle_wait'
        mode: 'crawl',
        phaseT: 0,
        phaseDur: 5.0,
        poseKey: 'faceFlat',
        lift: 0.35,
        sideShift: 0,
        tremorX: 0,
        tremorY: 0,

        // 导航目标
        targetX: hx0,
        targetY: hy0,
        seq: 1,
        prevAction: 'patrol',

        // 节流与一次性触发标记
        crawlStepPhase: 0,
        landBurstDone: false,
        backBurstDone: false,
        mistCd: 0,
        dustCd: 0,
        idleTremorT: 0,
        idleTremorCd: 2.6
      };

      function clampInSafeDisc(x, y, hx, hy, maxR, ratio) {
        const safeR = Math.max(6, maxR * ratio);
        const dx = x - hx;
        const dy = y - hy;
        const d = Math.hypot(dx, dy);
        if (d > safeR && d > 1e-4) {
          return [hx + (dx * safeR) / d, hy + (dy * safeR) / d];
        }
        return [x, y];
      }

      function pickPatrolTarget(hx, hy, maxR, sMul) {
        const safeR = Math.max(8, maxR * M38_CONFIG.targetRadiusRatio);
        const minDist = Math.min(16 * sMul, safeR * 0.85);
        let bestX = hx;
        let bestY = hy;
        for (let attempt = 0; attempt < 6; attempt++) {
          state.seq++;
          const rA = hash2i(state.seq, seed0, 109 + attempt * 17);
          const rR = hash2i(state.seq, seed0, 233 + attempt * 29);
          const curAng = Math.atan2(state.y - hy, state.x - hx);
          const ang = curAng + lerp(1.15, 5.05, rA);
          const rad = lerp(safeR * 0.25, safeR * 0.95, rR);
          const [cx, cy] = clampInSafeDisc(
            hx + Math.cos(ang) * rad,
            hy + Math.sin(ang) * rad,
            hx, hy, maxR, M38_CONFIG.targetRadiusRatio
          );
          bestX = cx;
          bestY = cy;
          if (Math.hypot(bestX - state.x, bestY - state.y) >= minDist) break;
        }
        state.targetX = bestX;
        state.targetY = bestY;
      }

      // 亮毒背啪嗒落地时喷吐一圈淡黄毒雾微粒（或威吓期间持续飘散少量毒雾）
      function spawnToxicMistRing(vfx, x, y, z, count, sMul, fxCol, burst) {
        if (!vfx) return;
        for (let i = 0; i < count; i++) {
          const a = burst
            ? (i / count) * TAU + (Math.random() - 0.5) * 0.35
            : Math.random() * TAU;
          const rOff = (burst ? lerp(5.5, 9.5, Math.random()) : lerp(2.5, 7.5, Math.random())) * sMul;
          const sp = (burst ? lerp(7.5, 13.5, Math.random()) : lerp(1.8, 4.5, Math.random())) * sMul;
          const vz = (burst ? lerp(4.5, 8.5, Math.random()) : lerp(5.5, 9.5, Math.random())) * sMul;
          const col = (i % 3 === 0) ? fxCol.mistB : fxCol.mistA;
          vfx.spawnParticle(
            x + Math.cos(a) * rOff,
            y + Math.sin(a) * rOff,
            z + (0.8 + Math.random() * 1.4) * sMul,
            Math.cos(a) * sp,
            Math.sin(a) * sp,
            vz,
            burst ? (0.58 + Math.random() * 0.32) : (0.65 + Math.random() * 0.35),
            burst ? (1.65 + Math.random() * 0.55) : (1.30 + Math.random() * 0.45),
            col,
            false,
            burst ? 7.5 : 3.2
          );
        }
      }

      function spawnStoneDust(vfx, x, y, count, sMul, fxCol) {
        if (!vfx) return;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * TAU;
          const sp = lerp(2.5, 6.5, Math.random()) * sMul;
          vfx.spawnParticle(
            x + (Math.random() - 0.5) * 8.0 * sMul,
            y + (Math.random() - 0.5) * 10.0 * sMul,
            0.5 * sMul,
            Math.cos(a) * sp,
            Math.sin(a) * sp,
            lerp(3.0, 6.0, Math.random()) * sMul,
            0.35 + Math.random() * 0.22,
            1.25,
            (i % 2 === 0) ? fxCol.dust : fxCol.moss,
            false,
            18
          );
        }
      }

      const instance = {
        def: Ruins2FlipSlabDef,
        cachePrefix: `ruins2_flip_slab_${Math.random().toString(36).slice(2, 7)}`,
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
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.shadowScale = 0.92;
          state.mode = 'crawl';
          state.phaseT = 0;
          state.phaseDur = 4.8;
          state.poseKey = 'faceFlat';
          state.lift = 0.35;
          state.sideShift = 0;
          state.tremorX = 0;
          state.tremorY = 0;
          state.seq = 1;
          state.targetX = homeX + 18;
          state.targetY = homeY + 12;
          state.crawlStepPhase = 0;
          state.landBurstDone = false;
          state.backBurstDone = false;
          state.mistCd = 0;
          state.dustCd = 0;
          state.idleTremorT = 0;
          state.idleTremorCd = 2.6;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul   = instance.scaleMul;
          const gFreq  = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.35, 2.2);
          const sp     = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const hx     = (eco && eco.homeX) ?? 0;
          const hy     = (eco && eco.homeY) ?? 0;
          const maxR   = (eco && eco.maxRadius) || 46;
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const fxCol  = curSkin.fx || SKINS[0].fx;

          // 动作切换初始化
          if (action !== state.prevAction) {
            state.prevAction = action;
            state.phaseT = 0;
            state.landBurstDone = false;
            state.backBurstDone = false;
            state.sideShift = 0;
            state.tremorX = 0;
            state.tremorY = 0;
            if (action === 'idle') {
              state.mode = 'idle_wait';
              state.poseKey = 'faceFlat';
              state.lift = 0.35 * sMul;
              state.idleTremorT = 0;
              state.idleTremorCd = 2.2;
            } else if (action === 'flip') {
              // 翻面演示：收拢到原点附近并立即展示「静伏 -> 4 档丝滑翻面 -> 亮毒背威吓 -> 翻回」
              const [cx, cy] = clampInSafeDisc(state.x, state.y, hx, hy, maxR, 0.45);
              state.x = cx;
              state.y = cy;
              state.mode = 'crawl';
              state.phaseDur = 1.05;
              state.poseKey = 'faceFlat';
            } else {
              state.mode = 'crawl';
              state.seq++;
              state.phaseDur = lerp(M38_CONFIG.crawlDur[0], M38_CONFIG.crawlDur[1], hash2i(state.seq, seed0, 71));
              pickPatrolTarget(hx, hy, maxR, sMul);
            }
          }

          state.tremorX = 0;
          state.tremorY = 0;

          // -----------------------------------------------------------------
          // 模式 A：idle（正面苔石板伪装静伏，偶发极轻微颤）
          // -----------------------------------------------------------------
          if (action === 'idle') {
            state.mode = 'idle_wait';
            state.poseKey = 'faceFlat';
            state.vx = 0;
            state.vy = 0;
            state.sideShift = 0;
            state.shadowScale = 0.92;

            state.idleTremorCd -= dt * gFreq;
            if (state.idleTremorCd <= 0 && state.idleTremorT <= 0) {
              state.idleTremorT = 0.36;
              state.seq++;
              state.idleTremorCd = lerp(2.8, 4.6, hash2i(state.seq, seed0, 149));
            }
            if (state.idleTremorT > 0) {
              state.idleTremorT = Math.max(0, state.idleTremorT - dt);
              const env = Math.sin((state.idleTremorT / 0.36) * Math.PI);
              state.tremorX = Math.sin(time * 48) * 0.42 * env * sMul;
              state.lift = (0.35 + 0.38 * env) * sMul;
            } else {
              state.lift = 0.35 * sMul;
            }

          // -----------------------------------------------------------------
          // 模式 B：crawl（贴地极慢蠕爬；在 flip 动作里作为翻面前短暂停顿）
          // -----------------------------------------------------------------
          } else if (state.mode === 'crawl') {
            state.phaseT += dt;
            state.poseKey = 'faceFlat';
            state.sideShift = lerp(state.sideShift, 0, expSmooth(dt, 10));
            state.shadowScale = 0.92;

            if (action === 'flip') {
              // 翻面演示态居中轻伏，准备进入下一轮翻面
              state.x = lerp(state.x, hx, expSmooth(dt, 4.0));
              state.y = lerp(state.y, hy, expSmooth(dt, 4.0));
              state.vx = 0;
              state.vy = 0;
              state.lift = 0.35 * sMul;
            } else {
              // 巡游伪装慢爬：贴地极慢蠕动，偶发微停吃苔屑
              const dx = state.targetX - state.x;
              const dy = state.targetY - state.y;
              const dist = Math.hypot(dx, dy);
              if (dist < 6.0 * sMul) {
                pickPatrolTarget(hx, hy, maxR, sMul);
              }
              const ndx = state.targetX - state.x;
              const ndy = state.targetY - state.y;
              const desiredYaw = Math.atan2(-ndx, ndy);
              state.yaw = wrapAngle(state.yaw + wrapAngle(desiredYaw - state.yaw) * expSmooth(dt, 2.2 * spdMul));

              // 蠕动节拍：极慢波浪推爬，正面完全像一块悄悄挪动的苔石板
              state.crawlStepPhase += dt * 4.4 * gFreq * spdMul;
              const wave = 0.55 + 0.45 * Math.sin(state.crawlStepPhase);
              const spd = M38_CONFIG.crawlSpeed * spdMul * wave * sMul;
              const fwdX = -Math.sin(state.yaw);
              const fwdY =  Math.cos(state.yaw);

              const nx = state.x + fwdX * spd * dt;
              const ny = state.y + fwdY * spd * dt;
              const [cx, cy] = clampInSafeDisc(nx, ny, hx, hy, maxR, M38_CONFIG.targetRadiusRatio);
              state.vx = (cx - state.x) / Math.max(dt, 0.001);
              state.vy = (cy - state.y) / Math.max(dt, 0.001);
              state.x = cx;
              state.y = cy;
              state.lift = (0.35 + Math.max(0, Math.sin(state.crawlStepPhase)) * 0.28) * sMul;

              state.dustCd -= dt;
              if (vfx && state.dustCd <= 0) {
                state.dustCd = 0.85;
                spawnStoneDust(vfx, state.x, state.y, 2, sMul, fxCol);
              }
            }

            if (state.phaseT >= state.phaseDur) {
              state.mode = 'startle';
              state.phaseT = 0;
              state.phaseDur = M38_CONFIG.startleDur;
            }

          // -----------------------------------------------------------------
          // 模式 C：startle（受惊蓄力微颤，准备猛地弹跳翻面）
          // -----------------------------------------------------------------
          } else if (state.mode === 'startle') {
            state.phaseT += dt;
            const u = clamp(state.phaseT / Math.max(0.01, state.phaseDur), 0, 1);
            state.poseKey = 'faceFlat';
            state.vx = 0;
            state.vy = 0;
            state.tremorX = Math.sin(time * 68) * (0.65 * (0.4 + 0.6 * u)) * sMul;
            state.tremorY = Math.cos(time * 54) * (0.35 * u) * sMul;
            state.lift = (0.30 - 0.15 * u) * sMul;
            state.shadowScale = 0.94;

            if (state.phaseT >= state.phaseDur) {
              state.mode = 'flip_up';
              state.phaseT = 0;
              state.phaseDur = M38_CONFIG.flipUpDur / clamp(0.75 + 0.25 * sp, 0.6, 1.4);
              state.landBurstDone = false;
              spawnStoneDust(vfx, state.x, state.y, 5, sMul, fxCol);
            }

          // -----------------------------------------------------------------
          // 模式 D：flip_up（弹起跃高 6.2 格，经 faceFlat -> flip45 -> flip90 -> backFlat 啪嗒落地）
          // -----------------------------------------------------------------
          } else if (state.mode === 'flip_up') {
            state.phaseT += dt;
            const u = clamp(state.phaseT / Math.max(0.01, state.phaseDur), 0, 1);
            state.vx = 0;
            state.vy = 0;

            // 4 档丝滑过渡（杜绝闪切）：0~0.14 faceFlat -> 0.14~0.44 flip45 -> 0.44~0.76 flip90 -> 0.76~1.0 backFlat
            if (u < 0.14) {
              state.poseKey = 'faceFlat';
            } else if (u < 0.44) {
              state.poseKey = 'flip45';
            } else if (u < 0.76) {
              state.poseKey = 'flip90';
            } else {
              state.poseKey = 'backFlat';
            }

            // 带重量感的抛物线弹跳弧 + 落地极短微弹（啪嗒感）
            let arcLift = 0;
            if (u < 0.86) {
              const j = u / 0.86;
              arcLift = Math.sin(j * Math.PI) * M38_CONFIG.flipUpLift;
            } else {
              // 0.86~1.0：啪嗒落地微弹收稳
              const b = (u - 0.86) / 0.14;
              arcLift = Math.sin(b * Math.PI) * 0.72;
            }
            state.lift = (0.35 + arcLift) * sMul;
            // 翻身过程沿局部侧向轻微弧移，更有真实翻滚重心感
            state.sideShift = Math.sin(u * Math.PI) * 1.85 * sMul;
            state.shadowScale = lerp(0.92, 0.58, clamp(arcLift / M38_CONFIG.flipUpLift, 0, 1));

            // 啪嗒落地瞬间喷吐一圈淡黄毒雾微粒！
            if (u >= 0.84 && !state.landBurstDone) {
              state.landBurstDone = true;
              spawnToxicMistRing(vfx, state.x, state.y, 1.2 * sMul, 14, sMul, fxCol, true);
              spawnStoneDust(vfx, state.x, state.y, 4, sMul, fxCol);
            }

            if (state.phaseT >= state.phaseDur) {
              state.mode = 'warn_hold';
              state.phaseT = 0;
              state.seq++;
              state.phaseDur = (action === 'flip')
                ? 3.2
                : lerp(M38_CONFIG.warnHoldDur[0], M38_CONFIG.warnHoldDur[1], hash2i(state.seq, seed0, 211));
              state.poseKey = 'backFlat';
              state.lift = 0.40 * sMul;
              state.sideShift = 0;
              state.mistCd = 0.42;
            }

          // -----------------------------------------------------------------
          // 模式 E：warn_hold（完全翻面亮出刺眼橙黑毒背，威吓保持 3.2~3.8 秒）
          // -----------------------------------------------------------------
          } else if (state.mode === 'warn_hold') {
            state.phaseT += dt;
            const u = clamp(state.phaseT / Math.max(0.01, state.phaseDur), 0, 1);
            state.poseKey = 'backFlat';
            state.vx = 0;
            state.vy = 0;
            state.sideShift = 0;
            state.shadowScale = 0.94;

            // 威吓期轻微戒备起伏与偶发微颤（绝不拉伸 scaleX/scaleY）
            const pulse = Math.sin(time * 5.2 * gFreq) * 0.22 * sMul;
            state.lift = (0.42 + Math.max(0, pulse)) * sMul;
            if (u < 0.25 || u > 0.85) {
              state.tremorX = Math.sin(time * 42) * 0.28 * sMul;
            }

            // 持续袅袅飘散淡黄毒雾微粒
            state.mistCd -= dt;
            if (vfx && state.mistCd <= 0) {
              state.mistCd = 0.36;
              spawnToxicMistRing(vfx, state.x, state.y, 1.4 * sMul, 3, sMul, fxCol, false);
            }

            if (state.phaseT >= state.phaseDur) {
              state.mode = 'flip_back';
              state.phaseT = 0;
              state.phaseDur = M38_CONFIG.flipBackDur / clamp(0.75 + 0.25 * sp, 0.6, 1.4);
              state.backBurstDone = false;
            }

          // -----------------------------------------------------------------
          // 模式 F：flip_back（经 backFlat -> flip90 -> flip45 -> faceFlat 翻回正面）
          // -----------------------------------------------------------------
          } else if (state.mode === 'flip_back') {
            state.phaseT += dt;
            const u = clamp(state.phaseT / Math.max(0.01, state.phaseDur), 0, 1);
            state.vx = 0;
            state.vy = 0;

            // 严格逆序 4 档过渡：backFlat -> flip90 -> flip45 -> faceFlat
            if (u < 0.14) {
              state.poseKey = 'backFlat';
            } else if (u < 0.46) {
              state.poseKey = 'flip90';
            } else if (u < 0.78) {
              state.poseKey = 'flip45';
            } else {
              state.poseKey = 'faceFlat';
            }

            let arcLift = 0;
            if (u < 0.88) {
              const j = u / 0.88;
              arcLift = Math.sin(j * Math.PI) * M38_CONFIG.flipBackLift;
            } else {
              const b = (u - 0.88) / 0.12;
              arcLift = Math.sin(b * Math.PI) * 0.45;
            }
            state.lift = (0.35 + arcLift) * sMul;
            state.sideShift = -Math.sin(u * Math.PI) * 1.65 * sMul;
            state.shadowScale = lerp(0.92, 0.62, clamp(arcLift / M38_CONFIG.flipBackLift, 0, 1));

            if (u >= 0.86 && !state.backBurstDone) {
              state.backBurstDone = true;
              spawnStoneDust(vfx, state.x, state.y, 4, sMul, fxCol);
            }

            if (state.phaseT >= state.phaseDur) {
              state.mode = 'crawl';
              state.phaseT = 0;
              state.seq++;
              state.phaseDur = (action === 'flip')
                ? 1.15
                : lerp(M38_CONFIG.crawlDur[0], M38_CONFIG.crawlDur[1], hash2i(state.seq, seed0, 307));
              state.poseKey = 'faceFlat';
              state.lift = 0.35 * sMul;
              state.sideShift = 0;
              if (action === 'patrol') {
                pickPatrolTarget(hx, hy, maxR, sMul);
              }
            }
          }

          // 硬边界钳制兜底（任何动作绝不超过 maxRadius * 0.80）
          const [safeX, safeY] = clampInSafeDisc(state.x, state.y, hx, hy, maxR, M38_CONFIG.hardRadiusRatio);
          state.x = safeX;
          state.y = safeY;
          state.z = 0;

          // 接地印（平趴/翻面稳贴地，半空翻身时缩小并柔和抬高）
          footContacts.length = 0;
          const contactR = (state.poseKey === 'flip90' ? 2.2 : 3.2) * sMul;
          for (let i = 0; i < FOOT_SLOTS.length; i++) {
            const fs = FOOT_SLOTS[i];
            const [fx, fy] = localToWorldXY(state.x, state.y, state.yaw, fs.lx * sMul, fs.ly * sMul);
            footContacts.push({ x: fx, y: fy, z: Math.max(0, state.lift - 0.35 * sMul), r: contactR });
          }

          // 同步顶面挂点
          const topH = (state.poseKey === 'flip45' || state.poseKey === 'flip90') ? 16 : 6;
          sockets.setWorld('back', state.x, state.y, state.lift + topH * sMul, state.yaw);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;

          // 计算含侧向滚转偏置与微颤的本体世界位置
          const [bx, by] = localToWorldXY(
            state.x + state.tremorX,
            state.y + state.tremorY,
            state.yaw,
            state.sideShift,
            0
          );

          // 1. 4 条隐匿小短足（正面慢爬态 bias: -0.75 藏在板底仅微露；翻面威吓态微翘板边轻颤）
          const isBack = (state.poseKey === 'backFlat');
          const isMidFlip = (state.poseKey === 'flip45' || state.poseKey === 'flip90');
          if (!isMidFlip) {
            for (let i = 0; i < FOOT_SLOTS.length; i++) {
              const fs = FOOT_SLOTS[i];
              const stepWave = (state.mode === 'crawl')
                ? Math.sin(state.crawlStepPhase + fs.phase)
                : 0;
              const twitchWave = isBack
                ? Math.sin(state.phaseT * 14.0 + fs.phase * 1.3)
                : 0;

              const lx = (fs.lx + (isBack ? Math.sign(fs.lx) * 0.9 : 0)) * sMul;
              const ly = (fs.ly + (state.mode === 'crawl' ? stepWave * 0.95 : twitchWave * 0.55)) * sMul;
              const [fx, fy] = localToWorldXY(bx, by, state.yaw, lx, ly);

              list.push({
                partKey: 'shortFoot',
                asset: parts.shortFoot,
                x: fx,
                y: fy,
                lift: isBack
                  ? Math.max(0.2, state.lift + (2.6 + Math.abs(twitchWave) * 0.75) * sMul)
                  : Math.max(0.0, (stepWave > 0 ? stepWave * 0.45 : 0) * sMul),
                ro: state.yaw,
                symDeg: 90,
                bias: isBack ? 0.35 : -0.75
              });
            }
          }

          // 2. 主体扁平石板（按当前 4 档姿态精确切换，常态零 scaleX/scaleY 拉伸）
          list.push({
            partKey: state.poseKey,
            asset: parts[state.poseKey],
            x: bx,
            y: by,
            lift: Math.max(0.0, state.lift),
            ro: state.yaw,
            symDeg: 360,
            bias: 0.0
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Ruins2FlipSlabDef.id,
            code: Ruins2FlipSlabDef.code,
            name: Ruins2FlipSlabDef.name,
            status: Ruins2FlipSlabDef.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            mode: state.mode,
            poseKey: state.poseKey,
            footRadius: Ruins2FlipSlabDef.footRadius,
            headZ: 6,
            centerZ: 3,
            blocks: Ruins2FlipSlabDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map((k) => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Ruins2FlipSlabDef);
})(window.PixelWorkshop);
