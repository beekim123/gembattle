'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 地7 · 合起来像花的翅壳（M29 翅壳开合 / 陆空切换 标杆 · 精制版）
  //
  // 【结构与俯视清晰度设计】
  // 1. 伪装花苞态（地面六足爬行 / 待机）：
  //    - 两片放大华丽的花瓣翅壳（各 16×24×12）沿机身中线严密合拢，合体呈饱满半开花苞，
  //      表面带清晰放射花瓣脉纹、花心浅晕与暗绿萼片边；
  //    - 6 条深色灵巧细足（2 段高重叠连杆，共用 2 套对称资产）以三角步态贴地波浪爬行，
  //      偶停低头采蜜。
  // 2. 掀壳起飞态（陆空切换 / 盘旋撒粉）：
  //    - 停步瞬间两片花瓣翅壳绕肩背竖轴咔哒水平向外张开（各 ±64°），
  //      立刻露出底下明黄沾满花粉的绒毛胖身子（16×22×12）与 4 片高速振动、
  //      清亮浅青/浅金半透明膜翅（2 档振翅角切换 + 高频水平扫掠），
  //      轻盈拔高离地 z ≈ 16~24 格在草甸上空盘旋飞舞并沿途飘洒亮黄花粉微粒；
  //    - 6 条深色细足在空中自然收垂腹下随气流微晃；落地时缓缓降落、膜翅收隐、
  //      两片花瓣翅壳咔哒合回花苞态。
  // 3. 性能与画质守则：
  //    - 33 色 <= 48、0 重色、glowKeys 置空（零模糊柔晕，俯视锐利）；
  //    - 常态严禁 scaleX / scaleY 拉伸；巡游严格钳制在 maxRadius * 0.80 内。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 花瓣翅壳主色（默认：绛红山茶）
      petalDark:   '#8c1438',
      petalMid:    '#d9265c',
      petalHi:     '#ff6b98',
      // 花瓣放射脉纹（高对比深酒红/浅玫红）
      veinDark:    '#590822',
      veinMid:     '#a31642',
      veinHi:      '#ff9ec0',
      // 花瓣浅晕尖端与花心
      tipDark:     '#d65c80',
      tipMid:      '#ff9eb8',
      tipHi:       '#ffe0eb',
      // 翅壳前缘与前胸暗绿萼片边
      sepalDark:   '#1b3d24',
      sepalMid:    '#2e693b',
      sepalHi:     '#529c58',
      // 掀壳露出的明黄绒毛胖身子（强反差内躯）
      fuzzDark:    '#b87d0e',
      fuzzMid:     '#f2b824',
      fuzzHi:      '#ffe46b',
      // 身上沾满的亮黄花粉团块
      pollenDark:  '#d9a416',
      pollenMid:   '#ffd838',
      pollenHi:    '#fff59e',
      // 胖腹绒毛深褐环纹
      stripeDark:  '#3b2410',
      stripeMid:   '#633e1c',
      stripeHi:    '#8f5d2c',
      // 清亮浅青半透明膜翅（渲染层配合 opacity）
      wingDark:    '#6ac4bd',
      wingMid:     '#a8ede6',
      wingHi:      '#e2fffc',
      // 膜翅前缘翅脉
      wingRimDark: '#4d9c96',
      wingRimMid:  '#82d6ce',
      wingRimHi:   '#c4faf5',
      // 6 条深色灵巧细足、触角与口器
      legDark:     '#1c1824',
      legMid:      '#362e42',
      legHi:       '#5c506e',
      // 乌黑锐利复眼（不进 glowKeys）
      eyeDark:     '#0b0c12',
      eyeIris:     '#242938',
      eyeGlint:    '#f2f7ff'
    },
    glowKeys: [],
    parts: [
      'petal', 'vein', 'tip', 'sepal', 'fuzz', 'pollen', 'stripe',
      'wing', 'wingRim', 'leg', 'eye'
    ],
    noCrease: [
      ['petal', 'vein'], ['petal', 'tip'], ['petal', 'sepal'],
      ['fuzz', 'pollen'], ['fuzz', 'stripe'], ['fuzz', 'sepal'],
      ['wing', 'wingRim'], ['leg', 'eye'], ['sepal', 'eye'], ['fuzz', 'eye']
    ],
    materials: {
      petal:   ['petalDark',   'petalMid',   'petalHi'],
      vein:    ['veinDark',    'veinMid',    'veinHi'],
      tip:     ['tipDark',     'tipMid',     'tipHi'],
      sepal:   ['sepalDark',   'sepalMid',   'sepalHi'],
      fuzz:    ['fuzzDark',    'fuzzMid',    'fuzzHi'],
      pollen:  ['pollenDark',  'pollenMid',  'pollenHi'],
      stripe:  ['stripeDark',  'stripeMid',  'stripeHi'],
      wing:    ['wingDark',    'wingMid',    'wingHi'],
      wingRim: ['wingRimDark', 'wingRimMid', 'wingRimHi'],
      leg:     ['legDark',     'legMid',     'legHi']
    },
    protectedParts: ['eye']
  });

  // 4 套高辨识花色皮肤（0 重色、0 禁用字）
  const SKINS = [
    {
      id: 'camellia',
      name: '绛红山茶',
      dot: '#d9265c',
      outline: '#1a0810',
      pal: {},
      fx: { pollenA: '#ffd838', pollenB: '#fff59e', pollenC: '#ff9eb8' }
    },
    {
      id: 'sunflower',
      name: '向日金瓣',
      dot: '#eb7a18',
      outline: '#1f1006',
      pal: {
        petalDark:   '#a63f08', petalMid:   '#eb7a18', petalHi:   '#ffb845',
        veinDark:    '#6e2204', veinMid:    '#ba4c0d', veinHi:    '#ffd178',
        tipDark:     '#d47b19', tipMid:     '#ffc547', tipHi:     '#fff0a6',
        sepalDark:   '#1a4220', sepalMid:   '#2e7334', sepalHi:   '#56ad52',
        fuzzDark:    '#c49112', fuzzMid:    '#f7cb28', fuzzHi:    '#ffed7a',
        pollenDark:  '#d9a918', pollenMid:  '#ffe142', pollenHi:  '#fff7b2',
        stripeDark:  '#3d200c', stripeMid:  '#693816', stripeHi:  '#965624',
        wingDark:    '#8cc79e', wingMid:    '#c9f2ce', wingHi:    '#edffef',
        wingRimDark: '#69a67d', wingRimMid: '#9edeae', wingRimHi: '#d4fae0'
      },
      fx: { pollenA: '#ffe142', pollenB: '#fff7b2', pollenC: '#ffb845' }
    },
    {
      id: 'bellflower',
      name: '靛蓝风铃',
      dot: '#3658d9',
      outline: '#0c1026',
      pal: {
        petalDark:   '#1e2e85', petalMid:   '#3658d9', petalHi:   '#789cff',
        veinDark:    '#121c59', veinMid:    '#2842ad', veinHi:    '#a3bdff',
        tipDark:     '#4c73e0', tipMid:     '#8cb3ff', tipHi:     '#d6e6ff',
        sepalDark:   '#153b34', sepalMid:   '#25695c', sepalHi:   '#48a38f',
        fuzzDark:    '#bf8a0f', fuzzMid:    '#f5c425', fuzzHi:    '#ffea73',
        pollenDark:  '#d9ab16', pollenMid:  '#ffe03d', pollenHi:  '#fff6a8',
        stripeDark:  '#2e2112', stripeMid:  '#543c20', stripeHi:  '#805c32',
        wingDark:    '#75c7db', wingMid:    '#b5effa', wingHi:    '#e8fcff',
        wingRimDark: '#52a3b8', wingRimMid: '#8cd9eb', wingRimHi: '#ccf6ff'
      },
      fx: { pollenA: '#ffe03d', pollenB: '#fff6a8', pollenC: '#8cb3ff' }
    },
    {
      id: 'sakura',
      name: '樱粉紫心',
      dot: '#f078a8',
      outline: '#210c19',
      pal: {
        petalDark:   '#b84678', petalMid:   '#f078a8', petalHi:   '#ffb5d2',
        veinDark:    '#5e1d54', veinMid:    '#943282', veinHi:    '#d97cc6',
        tipDark:     '#d66b9b', tipMid:     '#ffa3c8', tipHi:     '#ffe3ef',
        sepalDark:   '#1e3d28', sepalMid:   '#346b44', sepalHi:   '#5ca16c',
        fuzzDark:    '#c28b15', fuzzMid:    '#f7c834', fuzzHi:    '#ffec82',
        pollenDark:  '#d9aa1e', pollenMid:  '#ffe24a', pollenHi:  '#fff7b8',
        stripeDark:  '#42251d', stripeMid:  '#6e3f32', stripeHi:  '#9c5d4c',
        wingDark:    '#82c7c2', wingMid:    '#bcf0eb', wingHi:    '#ebfffd',
        wingRimDark: '#5ea39e', wingRimMid: '#94dbd4', wingRimHi: '#d1faf6'
      },
      fx: { pollenA: '#ffe24a', pollenB: '#fff7b8', pollenC: '#ffb5d2' }
    }
  ];

  // =========================================================================
  // 1. 强反差内躯：明黄沾满花粉的绒毛胖身子 + 暗绿前胸萼片领（16×22×12）
  //    合壳时大部被花瓣翅壳遮住，开壳瞬间露出毛茸茸的明黄胖腹与花粉团块！
  // =========================================================================
  function buildBody(makeCanvas) {
    const W = 16, D = 22, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-7.0, 7.0, -10.0, 9.5, 0, H - 1, (x, y, z, X, Y) => {
      // 饱满圆润绒毛胖腹（中心偏后）
      const dAbd = (Math.hypot(X / 6.0, (Y + 2.2) / 7.2, (z - 5.2) / 4.3) - 1.0) * 4.8;
      // 浑圆中胸（承接翅壳与膜翅根部）
      const dTh  = (Math.hypot(X / 5.2, (Y - 3.8) / 4.2, (z - 5.4) / 3.8) - 1.0) * 4.0;
      // 前胸暗绿萼片托领（与两片花瓣翅壳前缘无缝衔接成花托）
      const dCol = (Math.hypot(X / 4.8, (Y - 6.8) / 2.6, (z - 5.2) / 3.2) - 1.0) * 3.0;

      const d = smin(smin(dAbd, dTh, 1.6), dCol, 1.2);
      if (d > 0 || z < 1) return;

      // 前胸萼片领口用暗绿萼片色
      if (Y >= 5.2) {
        m.setRaw(x, y, z, mat('sepal'), partId.sepal);
        return;
      }

      // 腹部深褐绒毛横纹（让明黄胖腹更有昆虫节段立体感）
      const onStripe = (Y < 1.2 && Y > -7.2) && (Math.abs((Y + 0.8) % 3.2) < 0.72) && z >= 3;
      // 腹部背侧沾满饱满亮黄花粉团块
      const pollenBlob =
        Math.hypot(X + 2.2, Y + 1.8, z - 8.4) < 2.2 ||
        Math.hypot(X - 2.4, Y + 3.4, z - 8.2) < 2.1 ||
        Math.hypot(X + 0.5, Y + 5.4, z - 7.8) < 2.3 ||
        Math.hypot(X - 1.8, Y - 2.4, z - 8.2) < 1.9;

      if (pollenBlob && z >= 6) {
        m.setRaw(x, y, z, mat('pollen'), partId.pollen);
      } else if (onStripe) {
        m.setRaw(x, y, z, mat('stripe'), partId.stripe);
      } else {
        m.setRaw(x, y, z, mat('fuzz'), partId.fuzz);
      }
    });

    // 尾部绒毛小簇 + 背侧花粉毛簇
    m.paintEllipsoid(0, -8.8, 4.6, 2.4, 2.2, 2.0, mat('pollen'), partId.pollen, true);
    m.paintEllipsoid(-3.4, -1.6, 6.2, 1.7, 1.9, 1.5, mat('pollen'), partId.pollen, false);
    m.paintEllipsoid( 3.4, -2.2, 6.2, 1.7, 1.9, 1.5, mat('pollen'), partId.pollen, false);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.5, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 2. 灵巧花虫小头 + 2×2 锐利复眼 + 羽状短触角 + 采蜜卷吸管（12×12×10）
  // =========================================================================
  function buildHead(makeCanvas) {
    const W = 12, D = 12, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 圆润深绿/毛绒头部（前额带一小撮亮黄花粉额毛）
    m.paintEllipsoid(0, 0.2, 4.4, 3.4, 3.2, 2.9, mat('sepal'), partId.sepal, true);
    m.paintEllipsoid(0, 0.4, 6.4, 2.4, 2.0, 1.5, mat('fuzz'), partId.fuzz, true);
    // 前伸小巧卷吸管口器（低头采蜜时朝前探出）
    m.paintCapsule(0, 2.6, 3.0, 0, 4.8, 1.8, 0.85, 0.55, mat('leg'), partId.leg, true);
    // 左右一对微翘棒状触角（末端沾一点花粉亮黄）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.4, 2.2, 5.8, s * 3.4, 4.5, 7.8, 0.65, 0.52, mat('leg'), partId.leg, true);
      m.paintEllipsoid(s * 3.6, 4.7, 8.0, 0.85, 0.85, 0.85, mat('pollen'), partId.pollen, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 0.6 俯视 0 遮挡 2×2 乌黑锐利复眼（eyeGlint 绝不进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 2.4);
      const ey = Math.round(hd + 2.3);
      for (const dx of [0, s]) {
        for (const dz of [0, 1]) {
          const isGlint = (dx === 0 && dz === 1);
          const col = isGlint ? keyToId.eyeGlint : (dz === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(ex + dx, ey, 4 + dz, col, partId.eye);
          m.setRaw(ex + dx, ey - 1, 5, keyToId.eyeDark, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 3.5, headZ: 9, centerZ: 4 });
  }

  // =========================================================================
  // 3. 两片放大华丽的花瓣翅壳（各 16×24×12）
  //    枢轴锁在局部 ( -side * 3.6, +7.6 )，挂于机身肩背 ( side * 2.2, +5.2 )：
  //    - 合拢（openRad = 0）时：两片内缘在 X=0 严密贴合成饱满半开花苞；
  //      外缘做成双层叠瓣微翘弧线，前缘包裹暗绿萼片边，壳面刻出清晰放射花瓣脉纹与浅亮花瓣尖！
  //    - 起飞时：左壳 ro = yaw - openRad，右壳 ro = yaw + openRad（openRad ≈ 1.12 rad ≈ 64°），
  //      两片翅壳绕肩背竖轴咔哒水平向外张开，瞬间亮出底下明黄胖腹和 4 片膜翅！
  // =========================================================================
  const ELYTRA_PIVOT = { x: 3.6, y: 7.6 };

  function buildElytra(makeCanvas, side) {
    const W = 16, D = 24, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 枢轴在局部 (-side * 3.6, +7.6)
    // 当合拢挂在 (side * 2.2, +5.2) 时，部件中心位于机身局部 (side * 5.8, -2.4)
    // 因此机身中线 X_body = 0 对应部件局部 X_local = -side * 5.8
    const midLineX = -side * 5.8;

    m.fillAABB(-7.5, 7.5, -11.2, 10.2, 0, H - 1, (x, y, z, X, Y) => {
      // 转换到以机身对称轴为参考的横坐标 u >= 0（向外扩展）
      const u = (X - midLineX) * side;
      if (u < -0.35 || u > 12.2) return;

      // 从前缘（Y ≈ +8.8）到花瓣尾尖（Y ≈ -10.5）的花苞轮廓
      const tLen = clamp((8.8 - Y) / 19.2, 0, 1);
      // 丰腴半开花苞宽包络：中段鼓胀宽大（半宽 ~10.8，双瓣合体总宽 ~21.6 格！），外缘带波浪花瓣凹口
      const petalNotch = 1.0 + Math.sin(tLen * Math.PI * 2.4 - 0.5) * 0.08;
      const maxU = (1.6 + Math.sin(Math.pow(tLen, 0.72) * Math.PI) * 9.2) * petalNotch;
      if (u > maxU) return;

      // 穹顶状弧形花瓣外壳（中心拱起、边缘微翘，内部中空以便严密罩在明黄胖腹上方）
      const fracU = clamp(u / Math.max(1.2, maxU), 0, 1);
      const dome = Math.sqrt(Math.max(0, 1 - fracU * fracU * 0.82)) * Math.sin(clamp(tLen * 0.92 + 0.08, 0, 1) * Math.PI);
      const curlUp = Math.pow(fracU, 2.4) * 1.6 + Math.pow(tLen, 2.6) * 2.2;
      const surfZ = 3.2 + dome * 6.8 + curlUp;
      const thick = 2.05 - fracU * 0.45;
      if (z > surfZ || z < surfZ - thick) return;
      if (z < 1) return;

      // 1) 前缘暗绿萼片托边（合拢时像花朵底部的萼片）
      const isSepal = tLen < 0.24 && (tLen < 0.16 + Math.sin(fracU * Math.PI * 2.0) * 0.06);
      // 2) 清晰放射状花瓣脉纹（从前缘花心向尾尖与外缘散开 3 条脉）
      const rayAng = Math.atan2(u + 0.6, Math.max(0.5, 9.2 - Y));
      const veinWave = Math.abs(Math.sin(rayAng * 6.2));
      const isVein = !isSepal && tLen > 0.16 && tLen < 0.90 && (veinWave < 0.14 || (u < 1.15 && tLen > 0.22));
      // 3) 花瓣尾尖与外缘亮晕（俯视花朵层次一眼鲜明）
      const isTip = !isSepal && (tLen > 0.76 || fracU > 0.80);

      if (isSepal) {
        m.setRaw(x, y, z, mat('sepal'), partId.sepal);
      } else if (isVein) {
        m.setRaw(x, y, z, mat('vein'), partId.vein);
      } else if (isTip) {
        m.setRaw(x, y, z, mat('tip'), partId.tip);
      } else {
        m.setRaw(x, y, z, mat('petal'), partId.petal);
      }
    });

    // 枢轴关节实心萼片铆钉（确保开壳旋转 64° 时肩背零断缝）
    m.paintEllipsoid(-side * ELYTRA_PIVOT.x, ELYTRA_PIVOT.y, 4.6, 1.9, 1.9, 1.7, mat('sepal'), partId.sepal, true);
    // 花瓣内侧前缘加一瓣小卷心花瓣（合拢时像半开花心）
    m.paintEllipsoid(-side * 4.4, 3.6, 8.6, 1.6, 2.5, 1.3, mat('tip'), partId.tip, false);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.2, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 4. 四片清亮浅青/浅金半透明膜翅（前对 18×12×10 / 后对 14×10×8）
  //    每片预烘 2 档振翅倾角（up 上扬 / down 下压），飞行时高频交替 + 水平扫掠，
  //    渲染层配合 opacity = 0.66，清亮通透！
  // =========================================================================
  const MWING_F_PIVOT = { x: 6.4, y: 1.6 };
  const MWING_H_PIVOT = { x: 4.8, y: 1.2 };

  function buildMembraneWing(makeCanvas, side, isFront, isUp) {
    const W = isFront ? 18 : 14;
    const D = isFront ? 12 : 10;
    const H = isFront ? 10 : 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const pv = isFront ? MWING_F_PIVOT : MWING_H_PIVOT;
    const rootX = -side * pv.x;
    const rootY = pv.y;
    const rootZ = isUp ? 3.2 : 5.4;
    const len = isFront ? 13.4 : 9.8;
    const sweepBack = isFront ? 0.24 : 0.56;
    const slopeZ = isUp ? 0.34 : -0.26;
    const maxChord = isFront ? 3.6 : 2.9;

    m.fillAABB(-W * 0.5 + 0.5, W * 0.5 - 0.5, -D * 0.5 + 0.5, D * 0.5 - 0.5, 0, H - 1, (x, y, z, X, Y) => {
      const dx = (X - rootX) * side;
      if (dx < -0.6 || dx > len) return;
      const u = clamp(dx / len, 0, 1);
      // 翼弦中心线（略向后掠）
      const cy = rootY - dx * sweepBack;
      const dy = Y - cy;
      // 椭圆形昆虫膜翅包络
      const halfChord = 0.9 + Math.sin(Math.pow(u, 0.65) * Math.PI) * maxChord;
      if (dy > halfChord * 0.62 || dy < -halfChord) return;
      // 薄片膜翅高度随展向线性抬升/下压（2 档振翅角切换）
      const wz = rootZ + dx * slopeZ;
      if (Math.abs(z - wz) > 0.78) return;

      // 前缘翅脉与斜向分叉细脉
      const isFrontRim = (dy > halfChord * 0.28) || u < 0.14;
      const isCrossVein = (Math.abs(Math.sin(u * Math.PI * 3.0)) < 0.12 && dy < 0.2);
      if (isFrontRim || isCrossVein) {
        m.setRaw(x, y, z, mat('wingRim'), partId.wingRim);
      } else {
        m.setRaw(x, y, z, mat('wing'), partId.wing);
      }
    });

    // 翅根微球锁枢轴
    m.paintEllipsoid(rootX, rootY, rootZ, 1.1, 1.1, 1.1, mat('wingRim'), partId.wingRim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: isFront ? 6.0 : 4.5, headZ: H, centerZ: H * 0.5 });
  }

  // =========================================================================
  // 5. 6 条深色灵巧细足（2 段高重叠对称连杆，6 条腿共用 2 个轻资产）
  // =========================================================================
  function buildLegUpper(makeCanvas) {
    const m = new VoxelModel(5, 8, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, -2.2, 2.0, 1.05, 1.05, 1.0, mat('leg'), partId.leg, true);
    m.paintCapsule(0, -2.0, 2.0, 0, 2.2, 4.0, 0.95, 0.85, mat('leg'), partId.leg, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.8, headZ: 5, centerZ: 2.5 });
  }

  function buildLegLower(makeCanvas) {
    const m = new VoxelModel(5, 7, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, -1.5, 4.8, 1.0, 1.0, 0.95, mat('leg'), partId.leg, true);
    m.paintCapsule(0, -1.4, 4.6, 0, 1.6, 0.6, 0.82, 0.52, mat('leg'), partId.leg, true);
    // 足尖沾一点微黄花粉点缀
    m.paintEllipsoid(0, 1.7, 0.6, 0.62, 0.62, 0.55, mat('pollen'), partId.pollen, false);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.5, headZ: 6, centerZ: 2.5 });
  }

  // 6 足三角步态挂点（L1+R2+L3 为 0 组，R1+L2+R3 为 1 组）
  const HEX_LEG_SPECS = [
    { id: 'L1', side: -1, tripodGroup: 0, hipX: -4.2, hipY:  4.2, hipZ: 3.4, restX: -9.8,  restY:  7.8, L1: 4.4, L2: 5.0, bendDir: 1 },
    { id: 'R1', side:  1, tripodGroup: 1, hipX:  4.2, hipY:  4.2, hipZ: 3.4, restX:  9.8,  restY:  7.8, L1: 4.4, L2: 5.0, bendDir: 1 },
    { id: 'L2', side: -1, tripodGroup: 1, hipX: -4.8, hipY: -0.6, hipZ: 3.3, restX: -10.8, restY: -0.6, L1: 4.6, L2: 5.2, bendDir: 1 },
    { id: 'R2', side:  1, tripodGroup: 0, hipX:  4.8, hipY: -0.6, hipZ: 3.3, restX:  10.8, restY: -0.6, L1: 4.6, L2: 5.2, bendDir: 1 },
    { id: 'L3', side: -1, tripodGroup: 0, hipX: -4.2, hipY: -5.4, hipZ: 3.2, restX: -9.6,  restY: -8.6, L1: 4.4, L2: 5.0, bendDir: 1 },
    { id: 'R3', side:  1, tripodGroup: 1, hipX:  4.2, hipY: -5.4, hipZ: 3.2, restX:  9.6,  restY: -8.6, L1: 4.4, L2: 5.0, bendDir: 1 }
  ];

  const Earth7Def = {
    id: 'earth7_petal_elytra',
    code: '地7',
    status: 'done',
    name: '合起来像花的翅壳',
    tag: '翅壳开合 · 陆空切换 · 传粉撒粉',
    summary: 'M29 轻机制标杆：合拢时两片放大花瓣翅壳呈半开花苞、六足波浪爬行偶停采蜜；起飞瞬间两片花瓣翅壳绕竖轴咔哒水平向外张开，露出明黄花粉绒毛胖腹与四片高频半透明膜翅，拔高盘旋并飘洒花粉',
    defaultHabitat: 'meadow',
    footRadius: 9.8,
    ecoWeight: 0.72,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol',  name: '自由巡游（爬行↔起飞撒粉）', loop: true, status: 'done' },
      { id: 'idle',    name: '原地待机（花苞合拢微掀）',   loop: true, status: 'done' },
      { id: 'takeoff', name: '开壳振翅（高频起降演示）',   loop: true, status: 'done' }
    ],
    blocks: [
      '两片放大花瓣翅壳（放射脉纹 + 暗绿萼片边）',
      '绕肩背竖轴咔哒水平张开（±64° 弹簧过冲）',
      '明黄沾满花粉的绒毛胖身子强反差内躯',
      '四片高频 2 档振翅角半透明膜翅',
      '地面 6 足三角步态爬行 ↔ 空中盘旋撒粉陆空切换'
    ],
    soulHabit: '花丛草甸上合拢花瓣翅壳假装走动的小花，六足波浪爬行偶停低头采蜜 -> 咔哒掀开翅壳露出明黄绒毛躯干与四片高频膜翅，轻盈拔高盘旋沿途飘洒亮黄花粉 -> 缓缓落地收翅咔哒合回花苞态',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        body:      buildBody(makeCanvas),
        head:      buildHead(makeCanvas),
        elytraL:   buildElytra(makeCanvas, -1),
        elytraR:   buildElytra(makeCanvas,  1),
        wingFLU:   buildMembraneWing(makeCanvas, -1, true,  true),
        wingFLD:   buildMembraneWing(makeCanvas, -1, true,  false),
        wingFRU:   buildMembraneWing(makeCanvas,  1, true,  true),
        wingFRD:   buildMembraneWing(makeCanvas,  1, true,  false),
        wingHLU:   buildMembraneWing(makeCanvas, -1, false, true),
        wingHLD:   buildMembraneWing(makeCanvas, -1, false, false),
        wingHRU:   buildMembraneWing(makeCanvas,  1, false, true),
        wingHRD:   buildMembraneWing(makeCanvas,  1, false, false),
        legUpper:  buildLegUpper(makeCanvas),
        legLower:  buildLegLower(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;

      const gait = new MultiLegGaitSolver(HEX_LEG_SPECS, {
        mode: 'tripod',
        stepThreshold: 3.1,
        stepDuration: 0.21,
        stepHeight: 1.85,
        settleDelay: 0.12,
        settleThreshold: 0.75
      });

      // 翅壳开合弹簧（高刚度打出清脆「咔哒」开合感）
      const elytraSpring = new SpringDamper1D(0, 210, 14.5);
      const headYawSpring = new SpringDamper1D(0, 88, 7.5);
      const headDipSpring = new SpringDamper1D(0, 96, 8.2);

      const state = {
        x: hx0,
        y: hy0,
        z: 2.6,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        turnRate: 0,
        // 陆空切换状态机：crawl -> sip -> open -> fly -> land -> crawl
        mode: 'crawl',
        modeTimer: 0,
        lastAction: 'patrol',
        flyPhase: opts.seed ? (opts.seed % TAU) : 0.4,
        flyCenterX: hx0,
        flyCenterY: hy0,
        flyDir: 1,
        wingPhase: 0,
        wingUpState: true,
        wingSweepF: 0,
        wingSweepH: 0,
        elytraOpen: 0,
        airBlend: 0,
        pollenCd: 0,
        sipBurstDone: false,
        openBurstDone: false,
        idleBreatheCd: 2.4,
        idlePeekTimer: 0
      };

      const sockets = new SocketTracker();
      const footContacts = HEX_LEG_SPECS.map(() => ({ x: 0, y: 0, z: 0, r: 1.4 }));
      let curSkin = SKINS[0];

      function clampToArena(maxR) {
        const limit = Math.max(8, maxR * 0.80);
        const d = Math.hypot(state.x, state.y);
        if (d > limit) {
          const inv = limit / d;
          state.x *= inv;
          state.y *= inv;
        }
      }

      const instance = {
        def: Earth7Def,
        cachePrefix: `earth7_petal_elytra_${Math.random().toString(36).slice(2, 7)}`,
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
          state.z = 2.6;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.turnRate = 0;
          state.mode = 'crawl';
          state.modeTimer = 0;
          state.flyCenterX = homeX;
          state.flyCenterY = homeY;
          state.wingPhase = 0;
          state.wingUpState = true;
          state.elytraOpen = 0;
          state.airBlend = 0;
          state.pollenCd = 0;
          state.sipBurstDone = false;
          state.openBurstDone = false;
          state.idleBreatheCd = 2.4;
          state.idlePeekTimer = 0;

          elytraSpring.x = elytraSpring.v = 0;
          headYawSpring.x = headYawSpring.v = 0;
          headDipSpring.x = headDipSpring.v = 0;

          gait.reset(homeX, homeY, homeYaw, 1.0);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex  = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          const sp    = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const fx = curSkin.fx || SKINS[0].fx;

          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const homeYaw = (eco && eco.homeYaw) ?? 0;
          const rawMaxR = (eco && eco.maxRadius) || 46;
          const safeMaxR = Math.max(10, rawMaxR * 0.80);
          const groundLift = 2.6 * sMul;

          // 解析当前展示动作：patrol / idle / takeoff
          let action = 'patrol';
          if (eco) {
            if (eco.action === 'idle' || (eco.action === undefined && eco.patrol === false)) {
              action = 'idle';
            } else if (eco.action === 'takeoff') {
              action = 'takeoff';
            }
          }
          if (action !== state.lastAction) {
            state.lastAction = action;
            state.modeTimer = 0;
            state.openBurstDone = false;
            state.sipBurstDone = false;
            if (action === 'takeoff') {
              state.mode = 'open';
            } else if (action === 'idle') {
              state.mode = state.z > groundLift + 2.0 ? 'land' : 'idle';
            } else {
              state.mode = 'crawl';
            }
          }

          state.modeTimer += dt;
          let targetElytra = 0;   // 0 = 花苞合拢, 1 = 水平张开 ±64°
          let targetHeadYaw = Math.sin(time * 1.4) * 0.16;
          let targetHeadDip = 0;
          let wingBuzz = 0;

          // -----------------------------------------------------------------
          // 1. 动作与陆空切换状态机
          // -----------------------------------------------------------------
          if (action === 'idle') {
            // 原地待机：落地合壳成花苞，微颤偶微掀透气
            if (state.mode === 'land') {
              state.z = lerp(state.z, groundLift, expSmooth(dt, 6.0));
              state.vx = lerp(state.vx, 0, expSmooth(dt, 7.0));
              state.vy = lerp(state.vy, 0, expSmooth(dt, 7.0));
              targetElytra = state.z > groundLift + 2.5 ? 0.85 : 0;
              wingBuzz = state.z > groundLift + 2.5 ? 0.75 : 0;
              if (state.z <= groundLift + 0.35 || state.modeTimer > 1.2) {
                state.z = groundLift;
                state.mode = 'idle';
                state.modeTimer = 0;
              }
            } else {
              Propulsion.walkToPoint(state, homeX, homeY, dt, { speed: spdMul * 0.7, gaitFreq: gFreq }, {
                arriveDist: 1.4 * sMul,
                maxSpeed: 10.0,
                maxTurn: 2.8,
                aimYaw: homeYaw + Math.sin(time * 0.7) * 0.14,
                baseLift: groundLift
              });
              state.idleBreatheCd -= dt;
              if (state.idleBreatheCd <= 0 && state.idlePeekTimer <= 0) {
                state.idlePeekTimer = 0.78;
                state.idleBreatheCd = 3.2;
                elytraSpring.impulse(2.8 * sp);
              }
              if (state.idlePeekTimer > 0) {
                state.idlePeekTimer -= dt;
                const u = clamp(1 - state.idlePeekTimer / 0.78, 0, 1);
                targetElytra = Math.sin(u * Math.PI) * 0.26;
              } else {
                // 花苞合拢轻微呼吸微颤
                targetElytra = Math.max(0, Math.sin(time * 4.2) * 0.025);
              }
              targetHeadYaw = Math.sin(time * 1.1) * 0.24;
            }
          } else if (action === 'takeoff') {
            // 高频演示：咔哒开壳 -> 振翅拔高悬停小盘旋撒粉 -> 落回咔哒合壳 -> 短停再起
            if (state.mode === 'ground_wait') {
              const kStop = expSmooth(dt, 9.0);
              state.vx = lerp(state.vx, 0, kStop);
              state.vy = lerp(state.vy, 0, kStop);
              state.z = lerp(state.z, groundLift, expSmooth(dt, 8.0));
              targetElytra = 0;
              targetHeadDip = -0.7 * Math.sin(clamp(state.modeTimer / 0.9, 0, 1) * Math.PI);
              if (state.modeTimer >= 0.95) {
                state.mode = 'open';
                state.modeTimer = 0;
                state.openBurstDone = false;
                elytraSpring.impulse(7.2 * sp);
              }
            } else if (state.mode === 'open') {
              const kStop = expSmooth(dt, 10.0);
              state.vx = lerp(state.vx, 0, kStop);
              state.vy = lerp(state.vy, 0, kStop);
              state.z = lerp(state.z, groundLift + 1.2 * sMul, expSmooth(dt, 8.0));
              targetElytra = 1.0;
              wingBuzz = smoothstep(0.10, 0.36, state.modeTimer);
              if (!state.openBurstDone && state.modeTimer >= 0.14) {
                state.openBurstDone = true;
                spawnPollenBurst(vfx, state.x, state.y, state.z + 6 * sMul, 8, sMul, fx);
              }
              if (state.modeTimer >= 0.42) {
                state.mode = 'fly';
                state.modeTimer = 0;
                state.flyDir = -state.flyDir;
              }
            } else if (state.mode === 'fly') {
              targetElytra = 1.0;
              wingBuzz = 1.0;
              const flyDur = 2.9;
              const u = clamp(state.modeTimer / flyDur, 0, 1);
              const altEnv = Math.sin(u * Math.PI);
              const tgtZ = (17.5 + altEnv * 5.2 + Math.sin(time * 5.2 * gFreq) * 1.1) * sMul;
              state.flyPhase += dt * 1.65 * spdMul * state.flyDir;
              const rx = Math.min(14.0 * sMul, safeMaxR * 0.48);
              const ry = Math.min(11.0 * sMul, safeMaxR * 0.40);
              const tx = homeX + Math.sin(state.flyPhase) * rx;
              const ty = homeY + Math.sin(state.flyPhase * 2.0) * ry;
              const kF = expSmooth(dt, 6.2);
              const nx = lerp(state.x, tx, kF);
              const ny = lerp(state.y, ty, kF);
              state.vx = (nx - state.x) / Math.max(dt, 0.001);
              state.vy = (ny - state.y) / Math.max(dt, 0.001);
              state.x = nx;
              state.y = ny;
              state.z = lerp(state.z, tgtZ, expSmooth(dt, 5.2));
              const spd = Math.hypot(state.vx, state.vy);
              if (spd > 1.5) {
                const aim = Math.atan2(-state.vx, state.vy);
                state.yaw = wrapAngle(state.yaw + wrapAngle(aim - state.yaw) * expSmooth(dt, 7.5));
              }
              emitFlightPollen(dt, vfx, state, sMul, fx, 0.075);
              if (state.modeTimer >= flyDur) {
                state.mode = 'land';
                state.modeTimer = 0;
              }
            } else {
              // land：降落回原点并咔哒合壳
              const landDur = 0.95;
              const u = clamp(state.modeTimer / landDur, 0, 1);
              const kStop = expSmooth(dt, 6.5);
              state.vx = lerp(state.vx, 0, kStop);
              state.vy = lerp(state.vy, 0, kStop);
              state.x += state.vx * dt;
              state.y += state.vy * dt;
              state.z = lerp(state.z, groundLift, expSmooth(dt, 5.8));
              targetElytra = u < 0.62 ? 1.0 : 0.0;
              wingBuzz = u < 0.56 ? (1.0 - u) : 0;
              if (u >= 0.62 && state.elytraOpen > 0.45) {
                elytraSpring.impulse(-6.5 * sp);
              }
              if (state.modeTimer >= landDur) {
                state.z = groundLift;
                state.mode = 'ground_wait';
                state.modeTimer = 0;
              }
            }
          } else {
            // patrol 自由巡游完整循环：
            // crawl（地面六足爬行）-> sip（停步低头采蜜）-> open（咔哒开壳）-> fly（拔高盘旋撒粉）-> land（落地合壳）
            if (state.mode === 'crawl') {
              targetElytra = 0;
              Propulsion.multiLegWalk(state, dt, time, { speed: spdMul * 0.88, gaitFreq: gFreq }, {
                ...(eco || {}),
                patrol: true,
                walkStyle: 'scurry',
                baseLift: groundLift,
                maxRadius: safeMaxR
              });
              if (state.modeTimer >= 4.2) {
                state.mode = 'sip';
                state.modeTimer = 0;
                state.sipBurstDone = false;
              }
            } else if (state.mode === 'sip') {
              const kStop = expSmooth(dt, 9.5);
              state.vx = lerp(state.vx, 0, kStop);
              state.vy = lerp(state.vy, 0, kStop);
              state.x += state.vx * dt;
              state.y += state.vy * dt;
              state.z = lerp(state.z, groundLift, expSmooth(dt, 8.0));
              targetElytra = Math.max(0, Math.sin(time * 5.0) * 0.03);
              // 低头采蜜：头部轻压微抖，偶冒花蜜花粉
              const sipWave = Math.sin(clamp(state.modeTimer / 1.5, 0, 1) * Math.PI);
              targetHeadDip = -1.65 * sipWave;
              targetHeadYaw = Math.sin(time * 6.5) * 0.14;
              if (!state.sipBurstDone && state.modeTimer >= 0.65) {
                state.sipBurstDone = true;
                const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, 0, 9.2 * sMul);
                spawnPollenBurst(vfx, mx, my, state.z + 3.5 * sMul, 3, sMul, fx);
              }
              if (state.modeTimer >= 1.55) {
                state.mode = 'open';
                state.modeTimer = 0;
                state.openBurstDone = false;
                elytraSpring.impulse(7.6 * sp);
              }
            } else if (state.mode === 'open') {
              const kStop = expSmooth(dt, 10.5);
              state.vx = lerp(state.vx, 0, kStop);
              state.vy = lerp(state.vy, 0, kStop);
              state.z = lerp(state.z, groundLift + 1.4 * sMul, expSmooth(dt, 8.0));
              targetElytra = 1.0;
              wingBuzz = smoothstep(0.08, 0.38, state.modeTimer);
              if (!state.openBurstDone && state.modeTimer >= 0.14) {
                state.openBurstDone = true;
                spawnPollenBurst(vfx, state.x, state.y, state.z + 6 * sMul, 9, sMul, fx);
              }
              if (state.modeTimer >= 0.48) {
                state.mode = 'fly';
                state.modeTimer = 0;
                state.flyDir = -state.flyDir;
                state.flyCenterX = clamp(state.x * 0.35, -safeMaxR * 0.3, safeMaxR * 0.3);
                state.flyCenterY = clamp(state.y * 0.35, -safeMaxR * 0.3, safeMaxR * 0.3);
              }
            } else if (state.mode === 'fly') {
              targetElytra = 1.0;
              wingBuzz = 1.0;
              const flyDur = 5.6;
              const u = clamp(state.modeTimer / flyDur, 0, 1);
              // 离地高度 z ≈ 16~24 格，平滑拔高并在草甸上空轻盈盘旋
              const climbEnv = smoothstep(0, 0.18, u) * (1 - smoothstep(0.84, 1.0, u) * 0.25);
              const cruiseZ = 16.5 + climbEnv * 5.8 + Math.sin(time * 4.4 * gFreq) * 1.4;
              state.flyPhase += dt * 1.18 * spdMul * state.flyDir;

              const rx = Math.min(24.0 * sMul, safeMaxR * 0.72);
              const ry = Math.min(18.0 * sMul, safeMaxR * 0.62);
              let tx = state.flyCenterX + Math.sin(state.flyPhase) * rx + ((eco && eco.avoidX) || 0) * 0.3;
              let ty = state.flyCenterY + Math.sin(state.flyPhase * 2.0) * ry + ((eco && eco.avoidY) || 0) * 0.3;
              const td = Math.hypot(tx, ty);
              if (td > safeMaxR * 0.92) {
                tx *= (safeMaxR * 0.92) / td;
                ty *= (safeMaxR * 0.92) / td;
              }

              const kF = expSmooth(dt, 4.6);
              const nx = lerp(state.x, tx, kF);
              const ny = lerp(state.y, ty, kF);
              state.vx = (nx - state.x) / Math.max(dt, 0.001);
              state.vy = (ny - state.y) / Math.max(dt, 0.001);
              state.x = nx;
              state.y = ny;
              state.z = lerp(state.z, cruiseZ * sMul, expSmooth(dt, 4.8));

              const spd = Math.hypot(state.vx, state.vy);
              if (spd > 1.8) {
                const aim = Math.atan2(-state.vx, state.vy);
                const diff = wrapAngle(aim - state.yaw);
                const step = diff * expSmooth(dt, 6.5);
                state.yaw = wrapAngle(state.yaw + step);
                state.turnRate = step / Math.max(dt, 0.001);
              }
              targetHeadYaw = clamp(-state.turnRate * 0.2, -0.28, 0.28);

              // 沿途持续飘洒亮黄花粉微粒
              emitFlightPollen(dt, vfx, state, sMul, fx, 0.085);

              if (state.modeTimer >= flyDur) {
                state.mode = 'land';
                state.modeTimer = 0;
              }
            } else {
              // land：缓缓降落地面、膜翅收隐、两片花瓣翅壳咔哒合回花苞态
              const landDur = 1.15;
              const u = clamp(state.modeTimer / landDur, 0, 1);
              const kStop = expSmooth(dt, 5.5);
              state.vx = lerp(state.vx, 0, kStop);
              state.vy = lerp(state.vy, 0, kStop);
              state.x += state.vx * dt;
              state.y += state.vy * dt;
              state.z = lerp(state.z, groundLift, expSmooth(dt, 5.2));
              targetElytra = u < 0.64 ? 1.0 : 0.0;
              wingBuzz = u < 0.58 ? (1.0 - u) * 0.9 : 0;
              if (u >= 0.64 && state.elytraOpen > 0.45) {
                elytraSpring.impulse(-6.8 * sp);
              }
              if (state.modeTimer >= landDur) {
                state.z = groundLift;
                state.mode = 'crawl';
                state.modeTimer = 0;
              }
            }
          }

          // 严格钳制在 maxRadius * 0.80 内
          clampToArena(rawMaxR);

          // -----------------------------------------------------------------
          // 2. 弹簧驱动：翅壳咔哒开合、头部环顾/低头采蜜、膜翅高频 2 档振翅
          // -----------------------------------------------------------------
          elytraSpring.update(dt, targetElytra, 215 * sp, clamp(14.0 * dScale, 6.5, 22.0));
          state.elytraOpen = clamp(elytraSpring.x, 0, 1.15);

          headYawSpring.update(dt, targetHeadYaw, 88 * sp, clamp(7.5 * dScale, 3.2, 12.0));
          headDipSpring.update(dt, targetHeadDip, 96 * sp, clamp(8.2 * dScale, 3.5, 13.0));

          const targetAir = smoothstep(groundLift + 1.2 * sMul, groundLift + 6.0 * sMul, state.z);
          state.airBlend = lerp(state.airBlend, targetAir, expSmooth(dt, 10.0));

          // 高频震颤膜翅：2 档振翅角切换（wingUpState）+ 水平微幅高频扫掠
          const buzzFreq = (28.0 + wingBuzz * 12.0) * gFreq;
          if (wingBuzz > 0.05 || state.elytraOpen > 0.35) {
            state.wingPhase += dt * buzzFreq;
            const s1 = Math.sin(state.wingPhase);
            const s2 = Math.sin(state.wingPhase - 0.65);
            state.wingUpState = s1 >= 0;
            state.wingSweepF = s1 * 0.28 * flex;
            state.wingSweepH = s2 * 0.24 * flex;
          } else {
            state.wingSweepF = 0;
            state.wingSweepH = 0;
          }

          // -----------------------------------------------------------------
          // 3. 地面 6 足三角步态解算（离地后自动收垂于腹下）
          // -----------------------------------------------------------------
          gait.update(dt, state.x, state.y, groundLift, state.yaw, state.vx * (1 - state.airBlend), state.vy * (1 - state.airBlend), {
            scaleMul: sMul,
            mode: 'tripod',
            stepFreq: gFreq * 1.15,
            stepHeight: 1.85 * sMul,
            stepThreshold: 3.1 * sMul,
            settleThreshold: 0.75 * sMul
          });

          for (let i = 0; i < gait.legs.length; i++) {
            const leg = gait.legs[i];
            footContacts[i].x = leg.footX;
            footContacts[i].y = leg.footY;
            footContacts[i].z = state.airBlend > 0.25 ? state.z : leg.footZ;
            footContacts[i].r = 1.4 * sMul;
          }

          sockets.setLocal('head', state.x, state.y, state.z, state.yaw, 0, 8.2, 6.2, sMul);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const isWater = !!(habitat && habitat.isWater);
          const waterLvl = habitat ? habitat.waterLevel : 2.6;
          const sub = isWater ? EnvFeedback.calcSubmerge(state.z, waterLvl, 4.8, true) : 0;
          const air = state.airBlend;
          const openNorm = clamp(state.elytraOpen, 0, 1.15);

          // 1. 6 条深色灵巧细足（地面按三角步态踩地，升空后自然向腹下轻收并随气流微晃）
          for (let i = 0; i < gait.legs.length; i++) {
            const leg = gait.legs[i];
            const spec = HEX_LEG_SPECS[i];
            const [hipWX, hipWY] = localToWorldXY(state.x, state.y, yw, spec.hipX * sMul, spec.hipY * sMul);
            const hipWZ = state.z + spec.hipZ * sMul;

            // 空中收足目标点（向腹侧微拢并下垂，俯视清晰可见 6 条深色细足）
            const airSway = Math.sin(state.wingPhase * 0.22 + i * 1.3) * 0.65 * sMul;
            const [tuckFX, tuckFY] = localToWorldXY(
              state.x, state.y, yw,
              spec.side * (Math.abs(spec.restX) * 0.78) * sMul,
              (spec.restY * 0.72 - 1.2) * sMul + airSway
            );
            const tuckFZ = Math.max(0.5, state.z - 2.2 * sMul);

            const fx = lerp(leg.footX, tuckFX, air);
            const fy = lerp(leg.footY, tuckFY, air);
            const fz = lerp(leg.footZ, tuckFZ, air);

            const kx = lerp(leg.kneeX, lerp(hipWX, tuckFX, 0.52), air);
            const ky = lerp(leg.kneeY, lerp(hipWY, tuckFY, 0.52), air);
            const kz = lerp(leg.kneeZ, state.z + 1.4 * sMul, air);

            const dx = fx - hipWX;
            const dy = fy - hipWY;
            const legYaw = Math.hypot(dx, dy) > 0.05 ? Math.atan2(-dx, dy) : wrapAngle(yw - spec.side * Math.PI * 0.5);

            list.push({
              partKey: 'legUpper',
              asset: parts.legUpper,
              x: lerp(hipWX, kx, 0.45),
              y: lerp(hipWY, ky, 0.45),
              lift: Math.max(0.1, Math.min(hipWZ, kz) - 1.2 * sMul),
              ro: legYaw,
              bias: -0.45,
              submerge: sub
            });

            list.push({
              partKey: 'legLower',
              asset: parts.legLower,
              x: lerp(kx, fx, 0.62),
              y: lerp(ky, fy, 0.62),
              lift: Math.max(0, fz),
              ro: legYaw,
              bias: -0.35,
              submerge: sub
            });
          }

          // 2. 明黄沾满花粉的绒毛胖身子（内躯）
          list.push({
            partKey: 'body',
            asset: parts.body,
            x: state.x,
            y: state.y,
            lift: Math.max(0.5, state.z),
            ro: yw,
            bias: 0.05,
            submerge: sub
          });

          // 3. 独立小头 + 触角 + 采蜜吸管
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.45, 0.45));
          const [hdX, hdY] = localToWorldXY(state.x, state.y, yw, 0, (8.2 + headDipSpring.x * 0.35) * sMul);
          list.push({
            partKey: 'head',
            asset: parts.head,
            x: hdX,
            y: hdY,
            lift: Math.max(0.6, state.z + (1.4 + headDipSpring.x) * sMul),
            ro: hYaw,
            bias: 0.38,
            submerge: sub * 0.6
          });

          // 4. 四片高频震颤、清亮半透明膜翅（开壳 > 0.24 时展开显现，合壳完全收隐）
          if (openNorm > 0.24) {
            const wingVis = smoothstep(0.24, 0.58, openNorm);
            const wingOpacity = 0.66 * wingVis;
            const up = state.wingUpState;

            for (const s of [-1, 1]) {
              // 前膜翅
              const [fjx, fjy] = localToWorldXY(state.x, state.y, yw, s * 2.4 * sMul, 3.0 * sMul);
              const fYaw = wrapAngle(yw + s * (0.10 + state.wingSweepF));
              const [fwx, fwy] = pivotToWorldXY(fjx, fjy, fYaw, -s * MWING_F_PIVOT.x * sMul, MWING_F_PIVOT.y * sMul);
              const fKey = s < 0 ? (up ? 'wingFLU' : 'wingFLD') : (up ? 'wingFRU' : 'wingFRD');
              list.push({
                partKey: fKey,
                asset: parts[fKey],
                x: fwx,
                y: fwy,
                lift: Math.max(1.0, state.z + 5.6 * sMul),
                ro: fYaw,
                bias: 0.42,
                opacity: wingOpacity,
                submerge: 0
              });

              // 后膜翅（与前膜翅微错相切换，高频视觉更丰满）
              const [hjx, hjy] = localToWorldXY(state.x, state.y, yw, s * 2.2 * sMul, 0.4 * sMul);
              const hYaw = wrapAngle(yw + s * (-0.18 + state.wingSweepH));
              const [hwx, hwy] = pivotToWorldXY(hjx, hjy, hYaw, -s * MWING_H_PIVOT.x * sMul, MWING_H_PIVOT.y * sMul);
              const hUp = !up;
              const hKey = s < 0 ? (hUp ? 'wingHLU' : 'wingHLD') : (hUp ? 'wingHRU' : 'wingHRD');
              list.push({
                partKey: hKey,
                asset: parts[hKey],
                x: hwx,
                y: hwy,
                lift: Math.max(0.8, state.z + 4.4 * sMul),
                ro: hYaw,
                bias: 0.34,
                opacity: wingOpacity * 0.94,
                submerge: 0
              });
            }
          }

          // 5. 两片放大华丽的花瓣翅壳（绕肩背竖轴水平向外张开 ±64°）
          const maxOpenRad = 1.12; // ~64.2°
          const openRad = openNorm * maxOpenRad;
          const elytraLift = state.z + (1.6 + openNorm * 1.9) * sMul;

          for (const s of [-1, 1]) {
            const [jx, jy] = localToWorldXY(state.x, state.y, yw, s * 2.2 * sMul, 5.2 * sMul);
            // 左壳(s=-1)向 -X 张开需要 ro = yaw - openRad；右壳(s=+1)向 +X 张开需要 ro = yaw + openRad
            const eYaw = wrapAngle(yw + s * openRad);
            const [ex, ey] = pivotToWorldXY(jx, jy, eYaw, -s * ELYTRA_PIVOT.x * sMul, ELYTRA_PIVOT.y * sMul);
            const eKey = s < 0 ? 'elytraL' : 'elytraR';
            list.push({
              partKey: eKey,
              asset: parts[eKey],
              x: ex,
              y: ey,
              lift: Math.max(0.8, elytraLift),
              ro: eYaw,
              bias: 0.72,
              submerge: sub * 0.35
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Earth7Def.id,
            code: Earth7Def.code,
            status: Earth7Def.status,
            name: Earth7Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            mode: state.mode,
            elytraOpen: Number(state.elytraOpen.toFixed(3)),
            legCount: HEX_LEG_SPECS.length,
            footRadius: Earth7Def.footRadius,
            headZ: 14,
            centerZ: 7,
            blocks: Earth7Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  function spawnPollenBurst(vfx, x, y, z, count, sMul, fx) {
    if (!vfx) return;
    for (let i = 0; i < count; i++) {
      const a = (i / Math.max(1, count)) * TAU + Math.random() * 0.5;
      const spd = (5 + Math.random() * 10) * sMul;
      const col = (i % 3 === 0) ? fx.pollenB : ((i % 3 === 1) ? fx.pollenA : fx.pollenC);
      vfx.spawnParticle(
        x + (Math.random() - 0.5) * 4 * sMul,
        y + (Math.random() - 0.5) * 4 * sMul,
        z + (Math.random() - 0.5) * 2 * sMul,
        Math.cos(a) * spd,
        Math.sin(a) * spd,
        (4 + Math.random() * 7) * sMul,
        0.55 + Math.random() * 0.28,
        1.15 + Math.random() * 0.45,
        col,
        false,
        10
      );
    }
  }

  function emitFlightPollen(dt, vfx, state, sMul, fx, interval) {
    if (!vfx) return;
    state.pollenCd -= dt;
    if (state.pollenCd > 0) return;
    state.pollenCd = interval;
    vfx.spawnParticle(
      state.x + (Math.random() - 0.5) * 6 * sMul,
      state.y + (Math.random() - 0.5) * 6 * sMul,
      state.z + (2 + Math.random() * 4) * sMul,
      (Math.random() - 0.5) * 6 * sMul,
      (Math.random() - 0.5) * 6 * sMul,
      -2.0 - Math.random() * 3.5,
      0.72 + Math.random() * 0.35,
      1.15 + Math.random() * 0.4,
      Math.random() < 0.65 ? fx.pollenA : fx.pollenB,
      false,
      6
    );
  }

  PW.Creatures.push(Earth7Def);
})(window.PixelWorkshop);
