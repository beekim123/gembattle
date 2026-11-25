'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T12 · 青苔石槽泉与竹栈桩（scenes/scene_t12_bamboo_stone_shrine.js）
  //
  // 设计立意：
  //   - 避开刻板庭院旧套路，做成异世界林间引水蓄竹水的长条青苔石槽；
  //   - 上方架着会定时蓄满水往下敲击回弹的悬空竹筒引水管（3 档预烘倾角：平蓄/将满/前倾倒水）；
  //   - 旁立两根绑麻绳的粗折竹桩，水柱滴落石槽泛起清澈水涟漪。
  //
  // 拆件与图集预算（单盒严格 <= 40 格）：
  //   - stoneTrough  (34×18×10)：长条凿刻青苔石槽 + 清澈泉水底 + 鹅卵石与槽沿厚苔
  //   - waterSpout   (12×10×18)：后侧高架引水竹管柱与石墩
  //   - chuteFrame   (12×14×14)：双叉绑绳竹支架（架起悬空引水竹筒）
  //   - chuteRest    (22×8×8)  ：悬空引水竹筒（水平蓄水回弹态）
  //   - chuteFill    (22×8×10) ：悬空引水竹筒（蓄水将满微倾态）
  //   - chuteTip     (22×8×13) ：悬空引水竹筒（前倾倾倒水花态）
  //   - bambooStake  (10×10×18, symDeg: 90)：绑麻绳的粗折竹桩（复用 2 根）
  //
  // 展示动作：
  //   - idle      ：细水滴落石槽、周期性清澈涟漪
  //   - tip_clack ：竹筒蓄水渐满、前倾倒出一注水花砸出涟漪，再啪地回弹敲击石沿
  // =========================================================================

  // 26 色独立色表（<= 48 色、0 重色、0 自亮）
  const SPEC = createPaletteSpec({
    pal: {
      // 青灰林间凿刻石槽（3 阶）
      stoneDark: '#3c4547',
      stoneMid:  '#667375',
      stoneHi:   '#99a8a8',
      // 石槽深凹缝与湿石底（2 阶）
      wetDark:   '#242e30',
      wetMid:    '#405254',
      // 鲜润青苔衣（3 阶）
      mossDark:  '#1f5429',
      mossMid:   '#3b8c42',
      mossHi:    '#78cc5c',
      // 清澈竹泉水（3 阶）
      waterDark: '#166e7a',
      waterMid:  '#2eb0ba',
      waterHi:   '#8ce8eb',
      // 水面白沫与亮水线（2 阶，不进 glowKeys）
      foamMid:   '#c4f2f2',
      foamHi:    '#edfafa',
      // 深碧翠竹管与粗折竹桩（3 阶）
      bamDark:   '#124d2c',
      bamMid:    '#258248',
      bamHi:     '#52bf6e',
      // 鲜明象牙黄竹节环（3 阶）
      nodeDark:  '#a39a43',
      nodeMid:   '#dfd672',
      nodeHi:    '#fcf6b8',
      // 竹筒斜切空心浅米内壁（2 阶）
      innerDark: '#8c7e54',
      innerMid:  '#d4c796',
      // 粗麻绳捆扎带（3 阶）
      ropeDark:  '#634423',
      ropeMid:   '#a3753e',
      ropeHi:    '#dbb06b',
      // 槽底暖色鹅卵石（2 阶）
      pebDark:   '#594d42',
      pebMid:    '#8c7b6b'
    },
    glowKeys: [],
    parts: ['stone', 'wet', 'moss', 'water', 'foam', 'bam', 'node', 'inner', 'rope', 'peb'],
    noCrease: [
      ['stone', 'wet'], ['stone', 'moss'], ['water', 'foam'],
      ['bam', 'node'], ['bam', 'inner'], ['bam', 'rope']
    ],
    materials: {
      stone: ['stoneDark', 'stoneMid', 'stoneHi'],
      wet:   ['wetDark',   'wetMid',   'wetMid'],
      moss:  ['mossDark',  'mossMid',  'mossHi'],
      water: ['waterDark', 'waterMid', 'waterHi'],
      foam:  ['foamMid',   'foamHi',   'foamHi'],
      bam:   ['bamDark',   'bamMid',   'bamHi'],
      node:  ['nodeDark',  'nodeMid',  'nodeHi'],
      inner: ['innerDark', 'innerMid', 'innerMid'],
      rope:  ['ropeDark',  'ropeMid',  'ropeHi'],
      peb:   ['pebDark',   'pebMid',   'pebMid']
    },
    protectedParts: ['node', 'foam', 'rope']
  });

  // 3 套零重建模换色皮肤（青石翠竹、暖砂黄竹、深岩枯竹；0 禁用字）
  const SKINS = [
    {
      id: 'moss_stone_jade',
      name: '青石翠竹',
      dot: '#2eb0ba',
      outline: '#0e1717',
      pal: {},
      fx: { waterA: '#2eb0ba', waterB: '#edfafa', spray: '#8ce8eb' }
    },
    {
      id: 'warm_sand_gold',
      name: '暖砂黄竹',
      dot: '#d99e2e',
      outline: '#1f150c',
      pal: {
        stoneDark: '#5e4934', stoneMid: '#967857', stoneHi: '#cca980',
        wetDark:   '#3b2c1e', wetMid:   '#634b34',
        mossDark:  '#396324', mossMid:  '#649e38', mossHi:  '#a5db5e',
        waterDark: '#19786e', waterMid: '#32b8a4', waterHi: '#8cf0dc',
        bamDark:   '#8a5a14', bamMid:   '#cf9223', bamHi:   '#f7cb52',
        nodeDark:  '#75471c', nodeMid:  '#b87837', nodeHi:  '#ebbd7a',
        ropeDark:  '#4d2a16', ropeMid:  '#854c28', ropeHi:  '#bd7d4a'
      },
      fx: { waterA: '#32b8a4', waterB: '#e8faf5', spray: '#8cf0dc' }
    },
    {
      id: 'deep_rock_dry',
      name: '深岩枯竹',
      dot: '#7a7558',
      outline: '#121214',
      pal: {
        stoneDark: '#2a2e33', stoneMid: '#484f57', stoneHi: '#757e87',
        wetDark:   '#1a1d21', wetMid:   '#31373d',
        mossDark:  '#244d42', mossMid:  '#40806e', mossHi:  '#78bd9f',
        waterDark: '#235e78', waterMid: '#4597b5', waterHi: '#9adbf0',
        bamDark:   '#5c5233', bamMid:   '#948655', bamHi:   '#c9bd85',
        nodeDark:  '#695b3d', nodeMid:  '#a69265', nodeHi:  '#dbcaa0',
        ropeDark:  '#595042', ropeMid:  '#8f826d', ropeHi:  '#c7baa3'
      },
      fx: { waterA: '#4597b5', waterB: '#ebf7fc', spray: '#9adbf0' }
    }
  ];

  // =========================================================================
  // 1. 体素建模
  // =========================================================================

  // 1) 长条凿刻青苔石槽（34×18×10，沿 X 轴长条，内盛清澈泉水与鹅卵石）
  function buildStoneTrough(makeCanvas) {
    const m = new VoxelModel(34, 18, 10, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-16.2, 16.2, -8.2, 8.2, 0, 9, (x, y, z, X, Y) => {
      // 外轮廓：圆角长条凿石槽，底部略外张稳抓地面
      const ax = Math.abs(X), ay = Math.abs(Y);
      const flare = z <= 1 ? 0.8 : 0;
      const maxX = 15.2 + flare;
      const maxY = 7.4 + flare;
      const corner = Math.max(0, ax - (maxX - 2.6)) + Math.max(0, ay - (maxY - 2.2));
      if (ax > maxX || ay > maxY || corner > 3.0) return;

      // 槽内空腔（X ∈ [-12.2, 12.2], Y ∈ [-4.6, 4.6], z >= 3）
      const inBasin = (ax < 12.2 && ay < 4.6 && z >= 3);
      if (inBasin) {
        if (z <= 6) {
          // 槽内清澈泉水（水面 z=6 带微亮水线）
          if (z === 6 && Math.hypot(X - 4.0, Y) < 3.4 && Math.hypot(X - 4.0, Y) > 2.2) {
            m.setRaw(x, y, z, mat('foam'), partId.foam);
          } else {
            m.setRaw(x, y, z, mat('water'), partId.water);
          }
        }
        return;
      }

      // 槽壁顶面 z=8..9（局部长厚青苔）
      const isRim = (z >= 8);
      const isMossPatch =
        (X < -6.5 && Y > 3.2 && z >= 5) ||
        (X > 7.5 && Y < -3.5 && z >= 4) ||
        (Math.abs(X + 1.5) < 4.5 && Y < -5.2 && z >= 6) ||
        (isRim && Math.sin(X * 0.55 + Y * 0.7) > 0.58);
      const isWetBase = (z <= 2 && Math.sin(X * 0.4 + Y * 0.5) < 0.2);

      if (isMossPatch) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isWetBase) {
        m.setRaw(x, y, z, mat('wet'), partId.wet);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    // 槽后沿左侧添一块敲击垫石（竹筒回弹啪地敲在这里！）
    m.paintEllipsoid(-11.2, 0, 8.6, 2.4, 3.0, 1.4, mat('wet'), partId.wet, true);
    // 槽边散落两枚鹅卵石
    m.paintEllipsoid(13.8, 5.2, 1.4, 2.2, 1.8, 1.3, mat('peb'), partId.peb, true);
    m.paintEllipsoid(-14.0, -5.8, 1.2, 1.9, 1.7, 1.1, mat('peb'), partId.peb, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 15.8, headZ: 9, centerZ: 5 });
  }

  // 2) 后侧高架引水竹管柱（12×10×18，水从管口细流滴入悬空竹筒）
  function buildWaterSpout(makeCanvas) {
    const m = new VoxelModel(12, 10, 18, SPEC);
    const { mat, partId } = SPEC;

    // 粗立竹柱
    m.paintCapsule(-2.5, 0, 0.5, -2.5, 0, 16.5, 2.35, 2.05, mat('bam'), partId.bam, true);
    m.paintEllipsoid(-2.5, 0, 5.0, 2.6, 2.6, 0.75, mat('node'), partId.node, true);
    m.paintEllipsoid(-2.5, 0, 11.2, 2.45, 2.45, 0.75, mat('node'), partId.node, true);
    // 根部苔石固定墩
    m.paintEllipsoid(-2.5, 0, 1.6, 3.6, 3.6, 1.8, mat('stone'), partId.stone, true);
    m.paintEllipsoid(-1.2, 1.6, 2.6, 1.8, 1.6, 1.2, mat('moss'), partId.moss, true);
    // 横向伸出引水竹嘴（朝 +X 方向伸出滴水）
    m.paintCapsule(-2.5, 0, 14.5, 4.6, 0, 13.8, 1.55, 1.35, mat('bam'), partId.bam, true);
    m.paintEllipsoid(4.8, 0, 13.7, 1.0, 1.0, 0.9, mat('inner'), partId.inner, true);
    // 麻绳交叉捆扎
    m.paintEllipsoid(-2.2, 0, 14.4, 2.5, 2.5, 1.4, mat('rope'), partId.rope, true);
    // 管口微挂一粒清水滴
    m.paintEllipsoid(5.1, 0, 12.6, 0.85, 0.85, 1.0, mat('water'), partId.water, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 17, centerZ: 9 });
  }

  // 3) 双叉绑绳竹支架（10×14×14，左右各一立柱架住悬空竹筒转轴）
  function buildChuteFrame(makeCanvas) {
    const m = new VoxelModel(10, 14, 14, SPEC);
    const { mat, partId } = SPEC;

    for (const s of [-1, 1]) {
      m.paintCapsule(0, s * 4.8, 0.4, 0, s * 4.2, 12.2, 1.65, 1.4, mat('bam'), partId.bam, true);
      m.paintEllipsoid(0, s * 4.5, 5.5, 1.9, 1.9, 0.65, mat('node'), partId.node, true);
      m.paintEllipsoid(0, s * 4.2, 10.6, 1.9, 1.9, 1.1, mat('rope'), partId.rope, true);
    }
    // 细竹横轴
    m.paintCapsule(0, -4.4, 10.6, 0, 4.4, 10.6, 0.85, 0.85, mat('node'), partId.node, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 13, centerZ: 7 });
  }

  // 4) 悬空引水竹筒（3 档倾角：rest=水平后翘 / fill=微倾蓄满 / tip=前倾倒水）
  function buildChutePose(makeCanvas, pose) {
    const H = pose === 'tip' ? 13 : (pose === 'fill' ? 10 : 8);
    const m = new VoxelModel(22, 8, H, SPEC);
    const { mat, partId } = SPEC;

    // 从后尾 (-9.2) 到前斜切口 (+9.4) 的高度差
    const zBack  = pose === 'tip' ? 10.2 : (pose === 'fill' ? 5.6 : 2.8);
    const zFront = pose === 'tip' ? 2.2  : (pose === 'fill' ? 4.2 : 5.4);
    const zMid   = (zBack + zFront) * 0.5;

    // 粗竹筒主体
    m.paintCapsule(-9.0, 0, zBack, 9.2, 0, zFront, 2.35, 2.25, mat('bam'), partId.bam, true);
    // 清晰竹节环（中轴两侧）
    m.paintEllipsoid(-4.2, 0, lerp(zBack, zFront, 0.26), 1.0, 2.6, 2.5, mat('node'), partId.node, true);
    m.paintEllipsoid( 3.8, 0, lerp(zBack, zFront, 0.70), 1.0, 2.55, 2.45, mat('node'), partId.node, true);
    // 中间转轴麻绳缠绕
    m.paintEllipsoid(0, 0, zMid, 1.8, 2.65, 2.55, mat('rope'), partId.rope, true);
    // 前端口斜切露出浅米空心内壁 + 蓄水亮面
    m.paintEllipsoid(8.8, 0, zFront + 0.5, 1.8, 1.5, 1.2, mat('inner'), partId.inner, true);
    if (pose === 'fill' || pose === 'tip') {
      m.paintEllipsoid(9.2, 0, zFront + 0.6, 1.4, 1.25, 1.0, mat('water'), partId.water, true);
    }
    if (pose === 'tip') {
      // 倾倒瞬间筒口悬出一股清亮水舌
      m.paintCapsule(9.2, 0, zFront, 10.2, 0, 0.8, 1.15, 0.85, mat('foam'), partId.foam, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.8, headZ: H - 1, centerZ: Math.round(H * 0.5) });
  }

  // 5) 绑麻绳的粗折竹桩（10×10×18，symDeg: 90，复用 2 根立在石槽旁）
  function buildBambooStake(makeCanvas) {
    const m = new VoxelModel(10, 10, 18, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-4.2, 4.2, -4.2, 4.2, 0, 17, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      // 底部一圈苔石护脚
      if (z <= 2 && r <= 4.1 && r > 2.8) {
        m.setRaw(x, y, z, z === 2 ? mat('moss') : mat('stone'), z === 2 ? partId.moss : partId.stone);
        return;
      }
      // 斜折断面顶部（z=14..17 露出空心浅米内壁）
      if (z >= 15 && r < 1.85) {
        if (z === 15) m.setRaw(x, y, z, mat('inner'), partId.inner);
        return;
      }
      const isRope = (z >= 9 && z <= 11);
      const isNode = (z === 5 || z === 13);
      const rad = isRope ? 3.25 : (isNode ? 3.15 : 2.75);
      if (r > rad) return;
      if (isRope) m.setRaw(x, y, z, mat('rope'), partId.rope);
      else if (isNode) m.setRaw(x, y, z, mat('node'), partId.node);
      else m.setRaw(x, y, z, mat('bam'), partId.bam);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 17, centerZ: 8 });
  }

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t12_bamboo_stone_shrine',
    code: 'T12',
    name: '青苔石槽泉与竹栈桩',
    status: 'done',
    defaultHabitat: 'bamboo',
    tag: 'T12 翠绿竹林 · 引水石槽与竹惊鹿',
    summary: '林间凿刻青苔长条石槽蓄满清澈竹泉，上方悬空架着定时蓄满倾倒回敲的引水竹筒，旁立两根绑麻绳粗折竹桩；水柱滴落与竹筒倾水泛起层层涟漪',
    footRadius: 17.0,
    ecoWeight: 3.5,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',      name: '细水滴泉',     loop: true,  status: 'done' },
      { id: 'tip_clack', name: '蓄满倾倒回敲', loop: false, duration: 2.4, status: 'done' }
    ],
    blocks: ['青苔凿刻长条石槽', '3 档倾角悬空引水竹筒', '双绑绳粗折竹桩与水花涟漪'],
    soulHabit: '林间细水不断从高架竹嘴滴入悬空竹筒并溅落石槽泛起涟漪；蓄满后竹筒前倾倒出一注水花砸出大涟漪，随后啪地回弹敲击石沿',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        stoneTrough: buildStoneTrough(makeCanvas),
        waterSpout:  buildWaterSpout(makeCanvas),
        chuteFrame:  buildChuteFrame(makeCanvas),
        chuteRest:   buildChutePose(makeCanvas, 'rest'),
        chuteFill:   buildChutePose(makeCanvas, 'fill'),
        chuteTip:    buildChutePose(makeCanvas, 'tip'),
        bambooStake: buildBambooStake(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        chutePose: 'chuteRest',
        chuteLiftOff: 0,
        chuteJitterX: 0,
        dripClock: 0.4,
        lastAction: 'idle',
        pourFired: false,
        clackFired: false
      };

      let curSkin = SKINS[0];

      function spawnWaterDrip(vfx, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, -5.5 * sMul, 0);
        vfx.spawnParticle(
          wx, wy, 19.2 * sMul,
          0.6 * sMul, 0, -4.0 * sMul,
          0.52, 1.15, fx.waterB, false, 40
        );
        const [rx, ry] = localToWorldXY(state.x, state.y, state.yaw, 5.2 * sMul, 0);
        vfx.addRipple(rx, ry, 1.5 * sMul, 6.5 * sMul, 0.65, 1.2);
      }

      function spawnPourSplash(vfx, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, 6.2 * sMul, 0);
        for (let i = 0; i < 10; i++) {
          const a = (i / 10) * TAU + (Math.random() - 0.5) * 0.4;
          const spd = (3.5 + Math.random() * 6.5) * sMul;
          vfx.spawnParticle(
            wx + Math.cos(a) * 1.4 * sMul,
            wy + Math.sin(a) * 1.4 * sMul,
            7.2 * sMul,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            (5.5 + Math.random() * 5.5) * sMul,
            0.55 + Math.random() * 0.25,
            1.35,
            i % 2 === 0 ? fx.waterA : fx.waterB,
            false,
            44
          );
        }
        vfx.addRipple(wx, wy, 2.0 * sMul, 11.5 * sMul, 0.85, 1.8);
      }

      function spawnClackMist(vfx, sMul) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, -10.8 * sMul, 0);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          vfx.spawnParticle(
            wx, wy, 9.6 * sMul,
            Math.cos(a) * 4.2 * sMul,
            Math.sin(a) * 4.2 * sMul,
            (4.0 + Math.random() * 3.0) * sMul,
            0.42, 1.1, fx.spray, false, 32
          );
        }
        vfx.addRipple(wx, wy, 1.6 * sMul, 8.2 * sMul, 0.55, 1.5);
      }

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
          state.chutePose = 'chuteRest';
          state.chuteLiftOff = 0;
          state.chuteJitterX = 0;
          state.dripClock = 0.4;
          state.lastAction = 'idle';
          state.pourFired = false;
          state.clackFired = false;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.pourFired = false;
            state.clackFired = false;
          }

          state.chutePose = 'chuteRest';
          state.chuteLiftOff = 0;
          state.chuteJitterX = 0;

          if (action === 'tip_clack') {
            if (actionTime < 0.45) {
              // 蓄水渐满：水平稳态微微下沉
              state.chutePose = 'chuteRest';
              state.chuteLiftOff = -0.35 * (actionTime / 0.45) * sMul;
            } else if (actionTime < 0.88) {
              // 将满微倾颤动
              state.chutePose = 'chuteFill';
              state.chuteLiftOff = -0.6 * sMul;
              state.chuteJitterX = Math.sin(actionTime * 36) * 0.25 * sMul;
            } else if (actionTime < 1.48) {
              // 前倾倒出一注水花砸出涟漪！
              state.chutePose = 'chuteTip';
              state.chuteLiftOff = -1.6 * sMul;
              if (!state.pourFired) {
                state.pourFired = true;
                spawnPourSplash(vfx, sMul);
              }
            } else if (actionTime < 1.62) {
              // 快速回弹途中
              state.chutePose = 'chuteFill';
              state.chuteLiftOff = -0.4 * sMul;
            } else {
              // 啪地回弹敲击石沿 + 高频短震
              state.chutePose = 'chuteRest';
              if (!state.clackFired) {
                state.clackFired = true;
                spawnClackMist(vfx, sMul);
              }
              const post = actionTime - 1.62;
              const env = Math.exp(-post * 9.5);
              state.chuteLiftOff = Math.abs(Math.sin(post * 42)) * 0.65 * env * sMul;
              state.chuteJitterX = Math.sin(post * 52) * 0.42 * env * sMul;
            }
          } else {
            // 常态细水滴落、周期性轻涟漪
            state.dripClock -= dt * gFreq;
            if (state.dripClock <= 0) {
              state.dripClock = 0.72 + Math.random() * 0.45;
              spawnWaterDrip(vfx, sMul);
            }
          }
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;

          // 1. 长条青苔石槽主体
          list.push({
            partKey: 'stoneTrough',
            asset: parts.stoneTrough,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            bias: -0.20
          });

          // 2. 后侧高架引水竹管柱
          const [spX, spY] = localToWorldXY(state.x, state.y, yw, -10.5 * sMul, 0);
          list.push({
            partKey: 'waterSpout',
            asset: parts.waterSpout,
            x: spX,
            y: spY,
            lift: 6.5 * sMul,
            ro: yw,
            bias: 0.25
          });

          // 3. 双叉绑绳竹支架
          const [frX, frY] = localToWorldXY(state.x, state.y, yw, -2.5 * sMul, 0);
          list.push({
            partKey: 'chuteFrame',
            asset: parts.chuteFrame,
            x: frX,
            y: frY,
            lift: 3.0 * sMul,
            ro: yw,
            bias: 0.30
          });

          // 4. 悬空引水竹筒（随蓄水状态切换 3 档预烘倾角）
          const [chX, chY] = localToWorldXY(state.x, state.y, yw, (-1.8 + state.chuteJitterX / Math.max(0.1, sMul)) * sMul, 0);
          list.push({
            partKey: state.chutePose,
            asset: parts[state.chutePose],
            x: chX,
            y: chY,
            lift: (10.2 * sMul) + state.chuteLiftOff,
            ro: yw,
            bias: 0.58
          });

          // 5. 两根旁立的绑麻绳粗折竹桩（复用同一资产，高低错落）
          const [st1X, st1Y] = localToWorldXY(state.x, state.y, yw, 13.5 * sMul, -9.8 * sMul);
          list.push({
            partKey: 'bambooStake',
            asset: parts.bambooStake,
            x: st1X,
            y: st1Y,
            lift: 0,
            ro: wrapAngle(yw + 0.35),
            bias: -0.05,
            symDeg: 90
          });

          const [st2X, st2Y] = localToWorldXY(state.x, state.y, yw, 6.8 * sMul, -11.4 * sMul);
          list.push({
            partKey: 'bambooStake',
            asset: parts.bambooStake,
            x: st2X,
            y: st2Y,
            lift: -3.2 * sMul,
            ro: wrapAngle(yw + 1.55),
            bias: -0.08,
            symDeg: 90
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id,
            code: Def.code,
            name: Def.name,
            status: Def.status,
            skin: curSkin.id,
            footRadius: Def.footRadius,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(Def, 'scene');
})(window.PixelWorkshop);
