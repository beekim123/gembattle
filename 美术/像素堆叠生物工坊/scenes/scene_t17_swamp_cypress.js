'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T17 沼泽泥潭 · 板根枯木桩与冒泡浮萍（scenes/scene_t17_swamp_cypress.js）
  //
  // 拆件与图集预算（单盒严格 <= 32 格，严禁常态 scaleX/scaleY 拉伸）：
  //   - buttressRoot   (32×32×12, submerge: 0.45) ：伞骨状张开的粗壮老沼柏板根（根脚半浸泥水）
  //   - cypressTrunk   (20×20×22, lift: 8)        ：扭曲枯木断桩主干（裂皮 + 苍白断口木芯）
  //   - mossDrape      (8×8×13,   复用 ×3)        ：断木垂挂的灰绿松萝苔须（慢晃）
  //   - swampShrooms   (16×16×11)                 ：桩腰丛生 4 朵紫红明黄斑大沼泽菇（菇斑进 glowKeys）
  //   - duckweedPad    (11×11×3,  复用 ×3, sym90) ：泥水面漂浮的 3 片鲜嫩翠绿厚浮萍垫
  //   - mudVent        (12×12×4,  submerge: 0.35) ：浮萍垫间的间歇冒泡泥气泉口
  //   - gasBubbleSmall (6×6×5,    symDeg: 90)     ：常驻冒出的亮黄绿小沼气泡
  //   - gasBubbleBig   (9×9×8,    symDeg: 90)     ：gas_pop 鼓起炸裂的大泥泡
  //
  // 26 色 0 重色 0 禁用字，仅菇斑与沼气泡微亮进 glowKeys
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 暗褐老沼柏树皮（3 档）
      barkDark:   '#2c1e16',
      barkMid:    '#4d3627',
      barkHi:     '#75543d',
      // 断木苍白木芯（3 档）
      coreDark:   '#78664e',
      coreMid:    '#a89373',
      coreHi:     '#d4be98',
      // 半浸泥水的湿暗泥渍根脚（3 档）
      mudDark:    '#1d261a',
      mudMid:     '#304029',
      mudHi:      '#4a5e3c',
      // 垂坠灰绿松萝苔须（3 档）
      lichenDark: '#475c47',
      lichenMid:  '#6f8c6c',
      lichenHi:   '#9eb896',
      // 饱和紫红沼泽大毒菇伞（3 档）
      shroomDark: '#591642',
      shroomMid:  '#99266b',
      shroomHi:   '#d44896',
      // 毒菇米白菌柄（3 档）
      stalkDark:  '#8f806b',
      stalkMid:   '#c4b499',
      stalkHi:    '#ebdcb9',
      // 鲜嫩亮黄绿厚浮萍垫（3 档）
      padDark:    '#386e24',
      padMid:     '#68b336',
      padHi:      '#a6e34f',
      // 亮绿沼气泡体（3 档）
      bubbleDark: '#4b8f29',
      bubbleMid:  '#84d43b',
      bubbleHi:   '#c7fa6e',
      // 自亮键：明黄菇斑 + 沼气泡微亮芯（2 键进 glowKeys）
      spotGlow:   '#ffe44d',
      bubbleGlow: '#d9ff78'
    },
    glowKeys: ['spotGlow', 'bubbleGlow'],
    parts: ['bark', 'core', 'mud', 'lichen', 'shroom', 'stalk', 'pad', 'bubble', 'spot'],
    noCrease: [
      ['bark', 'mud'],
      ['bark', 'core'],
      ['shroom', 'spot'],
      ['shroom', 'stalk'],
      ['bubble', 'mud']
    ],
    materials: {
      bark:   ['barkDark',   'barkMid',   'barkHi'],
      core:   ['coreDark',   'coreMid',   'coreHi'],
      mud:    ['mudDark',    'mudMid',    'mudHi'],
      lichen: ['lichenDark', 'lichenMid', 'lichenHi'],
      shroom: ['shroomDark', 'shroomMid', 'shroomHi'],
      stalk:  ['stalkDark',  'stalkMid',  'stalkHi'],
      pad:    ['padDark',    'padMid',    'padHi'],
      bubble: ['bubbleDark', 'bubbleMid', 'bubbleHi']
    },
    protectedParts: ['spot', 'shroom', 'bubble']
  });

  // 3 套零重建模换色皮肤（每套 0 重色 0 禁用字）
  const SKINS = [
    {
      id: 'purple_shroom_jade_pad',
      name: '紫菇翠萍',
      dot: '#d44896',
      outline: '#0e1710',
      pal: {},
      fx: {
        mudDropA: '#84d43b',
        mudDropB: '#c7fa6e',
        mistA:    '#a6e34f',
        mistB:    '#d9ff78',
        spore:    '#ffe44d'
      }
    },
    {
      id: 'orange_shroom_gold_pad',
      name: '橙菇黄萍',
      dot: '#f07126',
      outline: '#17120c',
      pal: {
        barkDark:   '#362014', barkMid:   '#5e3922', barkHi:   '#8a5836',
        shroomDark: '#8a2b10', shroomMid: '#d6531c', shroomHi: '#ff8b38',
        spotGlow:   '#fff176',
        padDark:    '#61781c', padMid:    '#9ec22b', padHi:    '#d8eb54',
        bubbleDark: '#6b941e', bubbleMid: '#aad633', bubbleHi: '#e2fa66',
        bubbleGlow: '#f0ff80'
      },
      fx: {
        mudDropA: '#aad633',
        mudDropB: '#e2fa66',
        mistA:    '#d8eb54',
        mistB:    '#f0ff80',
        spore:    '#fff176'
      }
    },
    {
      id: 'cyan_shroom_dry_wood',
      name: '青菇枯木',
      dot: '#2ec7b8',
      outline: '#0d161a',
      pal: {
        barkDark:   '#302c28', barkMid:   '#544d46', barkHi:   '#7d7369',
        coreDark:   '#7d7668', coreMid:   '#ad9f8b', coreHi:   '#d6cab8',
        lichenDark: '#3c5c56', lichenMid: '#5f8f86', lichenHi: '#91c2b8',
        shroomDark: '#12595e', shroomMid: '#1f9999', shroomHi: '#42d9cf',
        spotGlow:   '#b5ff70',
        padDark:    '#23663c', padMid:    '#3ea361', padHi:    '#74d98e',
        bubbleDark: '#2a8756', bubbleMid: '#52cc83', bubbleHi: '#96fab8',
        bubbleGlow: '#bfffcc'
      },
      fx: {
        mudDropA: '#52cc83',
        mudDropB: '#96fab8',
        mistA:    '#74d98e',
        mistB:    '#bfffcc',
        spore:    '#b5ff70'
      }
    }
  ];

  // 1. 伞骨状老沼柏板根底座（32×32×12）
  function buildButtressRoot(makeCanvas) {
    const m = new VoxelModel(32, 32, 12, SPEC);
    const { mat, partId } = SPEC;

    // 中央厚实树根核
    m.paintCapsule(0, 0, 1.0, 0.4, -0.4, 10.5, 6.4, 5.0, mat('bark'), partId.bark, true);

    // 5 条如伞骨般张开的不对称粗壮板根（高脊、根脚半浸泥水）
    const roots = [
      { ang: 0.15,  len: 13.8, r0: 2.8, r1: 1.5, h0: 8.6, h1: 1.6 },
      { ang: 1.38,  len: 12.6, r0: 2.6, r1: 1.4, h0: 7.8, h1: 1.4 },
      { ang: 2.55,  len: 13.4, r0: 2.7, r1: 1.5, h0: 8.2, h1: 1.5 },
      { ang: 3.85,  len: 12.8, r0: 2.5, r1: 1.4, h0: 7.5, h1: 1.4 },
      { ang: 5.15,  len: 13.2, r0: 2.7, r1: 1.5, h0: 8.0, h1: 1.5 }
    ];
    for (const rt of roots) {
      const mx = Math.cos(rt.ang + 0.16) * (rt.len * 0.56);
      const my = Math.sin(rt.ang + 0.16) * (rt.len * 0.56);
      const ex = Math.cos(rt.ang) * rt.len;
      const ey = Math.sin(rt.ang) * rt.len;
      // 板根脊柱从树干腰部斜弧扑入泥水
      m.paintCapsule(0, 0, rt.h0, mx, my, rt.h0 * 0.52, rt.r0, rt.r0 * 0.82, mat('bark'), partId.bark, true);
      m.paintCapsule(mx, my, rt.h0 * 0.52, ex, ey, rt.h1, rt.r0 * 0.82, rt.r1, mat('bark'), partId.bark, true);
      // 板根下方垂直加厚形成薄板状根翼
      m.paintCapsule(mx * 0.72, my * 0.72, 1.5, mx * 0.72, my * 0.72, rt.h0 * 0.45, 1.9, 1.6, mat('bark'), partId.bark, true);
      // 根脚贴水泥渍覆层
      m.paintEllipsoid(ex, ey, 1.2, 2.2, 2.2, 1.3, mat('mud'), partId.mud, false);
    }

    // 底部 0..2 层染湿暗泥渍与苔痕
    m.fillAABB(-15, 15, -15, 15, 0, 2, (x, y, z, X, Y) => {
      if (!m.getId(x, y, z)) return;
      if (z <= 1 || (z === 2 && Math.hypot(X, Y) > 8.5)) {
        m.setRaw(x, y, z, mat('mud'), partId.mud);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 14.2, headZ: 12, centerZ: 5 });
  }

  // 2. 扭曲老沼柏枯木断桩（20×20×22）
  function buildCypressTrunk(makeCanvas) {
    const m = new VoxelModel(20, 20, 22, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-9, 9, -9, 9, 0, 21, (x, y, z, X, Y) => {
      const u = z / 21;
      // 轻微 S 形扭曲
      const cx = Math.sin(u * 3.1) * 1.35 + u * 0.7;
      const cy = Math.cos(u * 2.5) * 1.05 - u * 0.5;
      const lx = X - cx;
      const ly = Y - cy;
      const ang = Math.atan2(ly, lx);
      const r = Math.hypot(lx, ly);

      // 树干向上略收窄，带纵向老树皮棱沟
      const ridge = Math.sin(ang * 6 + u * 2.8) * 0.55;
      const rOuter = lerp(5.4, 3.6, u) + ridge;

      // 顶部参差斜断口（高低差明显）
      const cutZ = 16.5 + Math.sin(ang * 2 + 0.6) * 2.8 + Math.cos(ang * 3) * 1.4;
      if (z > cutZ || r > rOuter) return;

      // 顶部掏空浅腐朽木腔
      const rHollow = 2.0 + (z - 12) * 0.14;
      if (z > 13.5 && r < rHollow) return;

      // 断口边缘露浅米木芯
      if (z > cutZ - 1.4 || (z > 13.0 && r < rHollow + 0.9)) {
        m.setRaw(x, y, z, mat('core'), partId.core);
      } else {
        m.setRaw(x, y, z, mat('bark'), partId.bark);
      }
    });

    // 右上斜伸一截枯断枝杈（挂苔须用）
    m.paintCapsule(2.6, -1.2, 11.5, 7.6, -4.4, 16.4, 1.9, 1.05, mat('bark'), partId.bark, true);
    m.paintEllipsoid(7.6, -4.4, 16.4, 0.95, 0.95, 0.95, mat('core'), partId.core, true);

    // 左侧短枯杈
    m.paintCapsule(-2.8, 1.4, 9.2, -7.2, 3.2, 13.2, 1.7, 0.95, mat('bark'), partId.bark, true);
    m.paintEllipsoid(-7.2, 3.2, 13.2, 0.9, 0.9, 0.9, mat('core'), partId.core, true);

    // 桩肩附生几团灰绿苔衣
    m.paintEllipsoid(-3.2, -1.8, 14.5, 2.2, 2.0, 1.2, mat('lichen'), partId.lichen, true);
    m.paintEllipsoid( 2.8,  1.2, 12.6, 2.0, 1.8, 1.1, mat('lichen'), partId.lichen, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.5, headZ: 21, centerZ: 10 });
  }

  // 3. 垂坠灰绿松萝苔须（8×8×13，复用 ×3）
  function buildMossDrape(makeCanvas) {
    const m = new VoxelModel(8, 8, 13, SPEC);
    const { mat, partId } = SPEC;
    // 顶部苔结 + 3 缕错落长短垂须
    m.paintEllipsoid(0, 0, 11.2, 2.2, 1.9, 1.2, mat('lichen'), partId.lichen, true);
    m.paintCapsule( 0.0,  0.0, 11.2,  0.2,  0.3, 1.2, 1.05, 0.65, mat('lichen'), partId.lichen, true);
    m.paintCapsule(-1.6,  0.5, 10.6, -1.9,  0.8, 3.6, 0.85, 0.55, mat('lichen'), partId.lichen, true);
    m.paintCapsule( 1.5, -0.5, 10.8,  1.8, -0.7, 4.4, 0.85, 0.55, mat('lichen'), partId.lichen, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 12, centerZ: 6 });
  }

  // 4. 桩腰丛生 4 朵明黄斑点紫红大沼泽菇（16×16×11）
  function buildSwampShrooms(makeCanvas) {
    const m = new VoxelModel(16, 16, 11, SPEC);
    const { mat, partId, keyToId } = SPEC;

    const caps = [
      // 主大毒菇
      { x:  0.4, y:  0.6, z: 7.4, r: 4.3, h: 2.4, sx: -0.6, sy: -0.4, sz: 1.4, sr: 1.25 },
      // 左中毒菇
      { x: -4.2, y:  2.2, z: 5.2, r: 3.2, h: 1.9, sx: -3.2, sy:  1.4, sz: 1.2, sr: 1.0 },
      // 右中毒菇
      { x:  4.4, y:  1.8, z: 5.8, r: 3.1, h: 1.9, sx:  3.4, sy:  1.0, sz: 1.4, sr: 1.0 },
      // 前下小毒菇
      { x:  0.6, y:  4.6, z: 3.4, r: 2.4, h: 1.5, sx:  0.4, sy:  3.2, sz: 0.8, sr: 0.85 }
    ];

    for (const c of caps) {
      // 弯茎菌柄
      m.paintCapsule(c.sx, c.sy, c.sz, c.x, c.y, c.z - 0.5, c.sr, c.sr * 0.82, mat('stalk'), partId.stalk, true);
      // 饱满圆拱紫红菌盖
      m.fillAABB(c.x - c.r - 1, c.x + c.r + 1, c.y - c.r - 1, c.y + c.r + 1, c.z - 1, c.z + c.h + 1, (x, y, z, X, Y) => {
        const dx = (X - c.x) / c.r;
        const dy = (Y - c.y) / c.r;
        const dz = (z - c.z) / c.h;
        if (dz < -0.25) return;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 <= 1.0) {
          m.setRaw(x, y, z, mat('shroom'), partId.shroom);
        }
      });
    }

    // 在各朵菌盖顶面精准点上醒目明黄自亮斑点
    const spots = [
      [ 0.4,  0.6, 9], [-1.8,  1.2, 8], [ 2.2, -0.8, 8], [ 0.2, -1.6, 8],
      [-4.2,  2.2, 7], [-5.4,  1.4, 6], [-3.0,  3.2, 6],
      [ 4.4,  1.8, 7], [ 5.6,  1.2, 6], [ 3.4,  2.8, 6],
      [ 0.6,  4.6, 4], [ 1.6,  4.8, 4]
    ];
    for (const [sx, sy, sz] of spots) {
      m.paintEllipsoid(sx, sy, sz, 0.85, 0.85, 0.65, keyToId.spotGlow, partId.spot, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.2, headZ: 10, centerZ: 5 });
  }

  // 5. 鲜嫩翠绿厚浮萍垫（11×11×3，复用 ×3，symDeg: 90）
  function buildDuckweedPad(makeCanvas) {
    const m = new VoxelModel(11, 11, 3, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5, 5, -5, 5, 0, 2, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X, Y);
      // 4 叶聚簇轮廓（四重对称 symDeg: 90）
      const lobe = 4.1 + Math.cos(ang * 4) * 0.85;
      if (z === 0 && r <= lobe) {
        m.setRaw(x, y, z, mat('pad'), partId.pad);
      } else if (z === 1 && r <= lobe - 0.55) {
        m.setRaw(x, y, z, mat('pad'), partId.pad);
      } else if (z === 2 && r <= 2.3 && ((Math.abs(Math.round(X)) + Math.abs(Math.round(Y))) & 1) === 0) {
        m.setRaw(x, y, z, mat('pad'), partId.pad);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.0, headZ: 3, centerZ: 1 });
  }

  // 6. 冒泡泥气泉口（12×12×4，symDeg: 90）
  function buildMudVent(makeCanvas) {
    const m = new VoxelModel(12, 12, 4, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-5, 5, -5, 5, 0, 3, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      // 外圈暗泥堰环 + 中央亮绿沼气水面
      if (r >= 2.8 && r <= 5.2 && z <= (r < 4.2 ? 2 : 1)) {
        m.setRaw(x, y, z, mat('mud'), partId.mud);
      } else if (r < 2.8 && z <= 1) {
        m.setRaw(x, y, z, z === 1 && r < 1.5 ? keyToId.bubbleGlow : mat('bubble'), partId.bubble);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.2, headZ: 3, centerZ: 1 });
  }

  // 7. 亮绿沼气泡（小/大两档预烘，避免常态 scaleX/scaleY 拉伸）
  function buildGasBubble(makeCanvas, isBig) {
    const W = isBig ? 9 : 6;
    const H = isBig ? 8 : 5;
    const r = isBig ? 3.6 : 2.2;
    const cz = isBig ? 3.4 : 2.0;
    const m = new VoxelModel(W, W, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.paintEllipsoid(0, 0, cz, r, r, r * 0.88, mat('bubble'), partId.bubble, true);
    // 顶部一撮微亮气泡芯（进 glowKeys）
    m.paintEllipsoid(0, 0, cz + r * 0.58, r * 0.48, r * 0.48, 0.75, keyToId.bubbleGlow, partId.bubble, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: r, headZ: H, centerZ: cz });
  }

  // 3 缕垂挂苔须挂点（相对枯木桩中心）
  const DRAPES = [
    { lx:  6.4, ly: -3.6, lift: 10.5, phase: 0.0 },
    { lx: -6.2, ly:  2.8, lift:  8.2, phase: 2.1 },
    { lx:  1.4, ly:  4.2, lift: 11.4, phase: 4.0 }
  ];

  // 3 片浮萍垫围着泥气泉漂浮（泥气泉中心在局部 x=14.5, y=6.2）
  const VENT_LOCAL = { x: 14.5, y: 6.2 };
  const DUCKWEEDS = [
    { lx: 19.6, ly:  1.2, ro: 0.4, phase: 0.0 },
    { lx: 17.8, ly: 13.0, ro: 1.7, phase: 1.9 },
    { lx:  7.8, ly: 12.6, ro: 3.1, phase: 3.8 }
  ];

  const Def = {
    id: 'scene_t17_swamp_cypress',
    code: 'T17',
    name: '板根枯木桩与冒泡浮萍',
    status: 'done',
    defaultHabitat: 'swamp',
    tag: 'T17 沼泽泥潭地标 · 毒菇与冒泡浮萍泉',
    summary: '伞骨状粗壮板根老沼柏断桩（半浸泥水）挂垂坠灰绿松萝苔须，桩腰丛生紫红明黄斑大沼泽菇，旁侧泥水面漂着 3 片鲜嫩翠绿浮萍垫与间歇鼓泡炸裂的泥气泉',
    footRadius: 18.0,
    ecoWeight: 3.2,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '半浸泥水伞骨粗板根与扭曲枯木断桩',
      '垂坠灰绿松萝苔须（慢晃）',
      '饱和紫红明黄斑沼泽大毒菇簇',
      '3 片亮黄绿厚浮萍垫与冒泡泥气泉'
    ],
    actions: [
      { id: 'idle',    name: '沼泽冒泡（垂须慢晃+泥泡）', loop: true,  status: 'done' },
      { id: 'gas_pop', name: '大泥泡鼓起炸裂',            loop: false, duration: 2.2, status: 'done' }
    ],
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        buttressRoot:   buildButtressRoot(makeCanvas),
        cypressTrunk:   buildCypressTrunk(makeCanvas),
        mossDrape:      buildMossDrape(makeCanvas),
        swampShrooms:   buildSwampShrooms(makeCanvas),
        duckweedPad:    buildDuckweedPad(makeCanvas),
        mudVent:        buildMudVent(makeCanvas),
        gasBubbleSmall: buildGasBubble(makeCanvas, false),
        gasBubbleBig:   buildGasBubble(makeCanvas, true)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.2;
      let curSkin = SKINS[0];

      const state = {
        x: hx0,
        y: hy0,
        z: 0,
        yaw: hyaw0,
        action: 'idle',
        lastAction: 'idle',
        drapeSway: [0, 0, 0],
        padLift: [0, 0, 0],
        padDriftX: [0, 0, 0],
        padDriftY: [0, 0, 0],
        padRo: [0, 0, 0],
        // 气泡状态：kind 0=无, 1=小泡, 2=大泡
        bubbleKind: 0,
        bubbleLift: -2,
        idlePopClock: 1.4,
        sporeCd: 0.7,
        popFired: false
      };

      const instance = {
        def: Def,
        parts,
        partListAssets: Object.values(parts),
        state,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(x, y, yaw) {
          state.x = x;
          state.y = y;
          state.z = 0;
          state.yaw = yaw;
          state.action = 'idle';
          state.lastAction = 'idle';
          state.bubbleKind = 0;
          state.bubbleLift = -2;
          state.idlePopClock = 1.1;
          state.sporeCd = 0.6;
          state.popFired = false;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.popFired = false;
          }
          state.action = action;

          const t = time * freq;
          const [vx, vy] = localToWorldXY(state.x, state.y, state.yaw, VENT_LOCAL.x * sMul, VENT_LOCAL.y * sMul);

          // 垂须慢晃
          for (let i = 0; i < DRAPES.length; i++) {
            state.drapeSway[i] = Math.sin(t * 1.65 + DRAPES[i].phase) * 0.14;
          }

          // 浮萍基础轻漂
          let popRock = 0;
          if (action === 'gas_pop') {
            const u = clamp(actionTime / 2.2, 0, 1);
            if (u < 0.24) {
              // 蓄气冒出小泡
              state.bubbleKind = 1;
              state.bubbleLift = lerp(-1.5, 1.4, u / 0.24) * sMul;
            } else if (u < 0.50) {
              // 鼓起显眼大泥泡至顶
              const k = (u - 0.24) / 0.26;
              state.bubbleKind = 2;
              state.bubbleLift = lerp(-1.2, 2.2, smoothstep(0, 1, k)) * sMul;
            } else {
              // 啪地炸裂
              state.bubbleKind = 0;
              if (!state.popFired) {
                state.popFired = true;
                if (vfx) {
                  vfx.addRipple(vx, vy, 2.5 * sMul, 16.5 * sMul, 1.15, 2.2);
                  vfx.addRipple(vx, vy, 1.5 * sMul, 11.0 * sMul, 0.78, 1.5);
                  // 喷出黄绿泥珠
                  for (let i = 0; i < 10; i++) {
                    const a = (i / 10) * TAU + Math.random() * 0.4;
                    const sp = (7.5 + Math.random() * 9.0) * sMul;
                    vfx.spawnParticle(
                      vx, vy, 3.2 * sMul,
                      Math.cos(a) * sp, Math.sin(a) * sp, (11.0 + Math.random() * 7.5) * sMul,
                      0.65 + Math.random() * 0.28,
                      1.4 + Math.random() * 0.5,
                      i % 2 === 0 ? fx.mudDropA : fx.mudDropB,
                      i % 3 === 0,
                      38
                    );
                  }
                  // 散逸淡绿毒雾粒
                  for (let i = 0; i < 8; i++) {
                    const a = Math.random() * TAU;
                    const sp = (2.2 + Math.random() * 4.5) * sMul;
                    vfx.spawnParticle(
                      vx + Math.cos(a) * 1.8 * sMul,
                      vy + Math.sin(a) * 1.8 * sMul,
                      4.2 * sMul,
                      Math.cos(a) * sp, Math.sin(a) * sp, (5.5 + Math.random() * 4.5) * sMul,
                      1.15 + Math.random() * 0.45,
                      2.0 + Math.random() * 0.7,
                      i % 2 === 0 ? fx.mistA : fx.mistB,
                      false,
                      -1.2
                    );
                  }
                }
              }
              const post = clamp((u - 0.50) / 0.50, 0, 1);
              popRock = Math.sin(post * Math.PI * 3.0) * (1 - post);
            }
          } else {
            // idle：泥气泉周期咕嘟冒出黄绿沼气泡并荡开泥水涟漪
            const cycle = (t * 0.55) % 1.0;
            if (cycle < 0.58) {
              state.bubbleKind = 1;
              state.bubbleLift = lerp(-1.8, 1.6, smoothstep(0, 1, cycle / 0.58)) * sMul;
            } else {
              state.bubbleKind = 0;
            }

            state.idlePopClock -= dt;
            if (state.idlePopClock <= 0 && vfx) {
              state.idlePopClock = 1.65 / freq;
              vfx.addRipple(vx, vy, 1.8 * sMul, 10.5 * sMul, 0.95, 1.5);
              for (let i = 0; i < 4; i++) {
                const a = Math.random() * TAU;
                vfx.spawnParticle(
                  vx + Math.cos(a) * 1.6 * sMul,
                  vy + Math.sin(a) * 1.6 * sMul,
                  2.4 * sMul,
                  Math.cos(a) * 2.5 * sMul,
                  Math.sin(a) * 2.5 * sMul,
                  (5.5 + Math.random() * 3.5) * sMul,
                  0.85 + Math.random() * 0.35,
                  1.3,
                  i % 2 === 0 ? fx.mistA : fx.mudDropB,
                  i === 0,
                  -0.6
                );
              }
            }
          }

          // 3 片浮萍垫轻漂 + 炸泡晃动
          for (let i = 0; i < DUCKWEEDS.length; i++) {
            const ph = DUCKWEEDS[i].phase;
            const outAngle = Math.atan2(DUCKWEEDS[i].ly - VENT_LOCAL.y, DUCKWEEDS[i].lx - VENT_LOCAL.x);
            state.padLift[i]   = (Math.sin(t * 2.0 + ph) * 0.28 + Math.abs(popRock) * 0.55) * sMul;
            state.padDriftX[i] = (Math.cos(t * 1.1 + ph) * 0.45 + Math.cos(outAngle) * popRock * 1.15) * sMul;
            state.padDriftY[i] = (Math.sin(t * 1.3 + ph) * 0.45 + Math.sin(outAngle) * popRock * 1.15) * sMul;
            state.padRo[i]     = Math.sin(t * 1.2 + ph) * 0.12 + popRock * 0.22;
          }

          // 偶有沼泽菇细孢子飘起
          state.sporeCd -= dt;
          if (state.sporeCd <= 0 && vfx) {
            state.sporeCd = 0.85 + Math.random() * 0.7;
            const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, -2.2 * sMul, 5.4 * sMul);
            vfx.spawnParticle(
              sx + (Math.random() - 0.5) * 4.5 * sMul,
              sy + (Math.random() - 0.5) * 4.5 * sMul,
              (12.5 + Math.random() * 3.0) * sMul,
              (Math.random() - 0.5) * 2.2 * sMul,
              (Math.random() - 0.5) * 2.2 * sMul,
              3.2 * sMul,
              1.1,
              0.95,
              fx.spore,
              true,
              -0.4
            );
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const list = [
            {
              partKey: 'buttressRoot',
              asset: parts.buttressRoot,
              x: state.x,
              y: state.y,
              lift: 0,
              ro: yw,
              submerge: 0.45,
              bias: -0.25
            },
            {
              partKey: 'cypressTrunk',
              asset: parts.cypressTrunk,
              x: state.x,
              y: state.y,
              lift: 7.5 * sMul,
              ro: yw,
              bias: 0.0
            }
          ];

          // 桩腰紫红大沼泽菇簇
          const [mx, my] = localToWorldXY(state.x, state.y, yw, -2.4 * sMul, 5.2 * sMul);
          list.push({
            partKey: 'swampShrooms',
            asset: parts.swampShrooms,
            x: mx,
            y: my,
            lift: 6.8 * sMul,
            ro: wrapAngle(yw + 0.15),
            bias: 0.25
          });

          // 3 缕垂坠灰绿松萝苔须
          for (let i = 0; i < DRAPES.length; i++) {
            const d = DRAPES[i];
            const [dx, dy] = localToWorldXY(state.x, state.y, yw, d.lx * sMul, d.ly * sMul);
            list.push({
              partKey: 'mossDrape',
              asset: parts.mossDrape,
              x: dx,
              y: dy,
              lift: d.lift * sMul,
              ro: wrapAngle(yw + state.drapeSway[i] + i * 0.9),
              bias: 0.18
            });
          }

          // 泥气泉口
          const [vx, vy] = localToWorldXY(state.x, state.y, yw, VENT_LOCAL.x * sMul, VENT_LOCAL.y * sMul);
          list.push({
            partKey: 'mudVent',
            asset: parts.mudVent,
            x: vx,
            y: vy,
            lift: 0,
            ro: yw,
            symDeg: 90,
            submerge: 0.35,
            bias: -0.15
          });

          // 鼓起中的沼气泡
          if (state.bubbleKind === 1) {
            list.push({
              partKey: 'gasBubbleSmall',
              asset: parts.gasBubbleSmall,
              x: vx,
              y: vy,
              lift: state.bubbleLift,
              ro: yw,
              symDeg: 90,
              bias: 0.35
            });
          } else if (state.bubbleKind === 2) {
            list.push({
              partKey: 'gasBubbleBig',
              asset: parts.gasBubbleBig,
              x: vx,
              y: vy,
              lift: state.bubbleLift,
              ro: yw,
              symDeg: 90,
              bias: 0.40
            });
          }

          // 3 片漂浮鲜嫩翠绿浮萍垫
          for (let i = 0; i < DUCKWEEDS.length; i++) {
            const dw = DUCKWEEDS[i];
            const [px, py] = localToWorldXY(
              state.x, state.y, yw,
              dw.lx * sMul + state.padDriftX[i],
              dw.ly * sMul + state.padDriftY[i]
            );
            list.push({
              partKey: 'duckweedPad',
              asset: parts.duckweedPad,
              x: px,
              y: py,
              lift: 0.6 * sMul + state.padLift[i],
              ro: wrapAngle(yw + dw.ro + state.padRo[i]),
              symDeg: 90,
              bias: 0.05
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id,
            code: Def.code,
            name: Def.name,
            status: Def.status,
            skin: curSkin.id,
            action: state.action,
            footRadius: Def.footRadius,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Assets.register(Def, 'scene');
})(window.PixelWorkshop);
