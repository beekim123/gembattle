'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { createAmbushCycle } = PW.Behaviors;

  // =========================================================================
  // 沙6 · 假水洼（M19 装成静物 / 折起再展开标杆，+Y 正前）
  //   1. 外观：中体型（平摊宽 46~50 格、高 3~4 格），摊在沙丘上的大片薄身子；
  //      背上像浅水洼（中心深青、中环浅青、外圈湿沙边），四周 8 片共享资产的卷边
  //      微错位拼出自然不规则水洼轮廓，卷边背面为粗糙沙褐色厚皮；
  //      边缘下藏着一圈短钩与 2 根可伸出张望的细眼柄；29 色、0 重色、0 自亮。
  //   2. 防爆贴图规矩：
  //      - 伪装底盘做成八角对称薄盘（30×30×4），设 symDeg: 45 省 8 倍贴图；
  //      - 水面波纹全部走 vfx.addRipple 叠绘，绝不为大盘预烘多档全尺寸体素；
  //      - 8 片卷边共享 1 套 3 档姿态资产（flapFlat / flapHalf / flapClosed），
  //        靠 lift + ro 抬起合拢成沙褐圆包，不靠翻转、常态零 scaleX/scaleY 拉伸；
  //      - 钩圈与眼柄展开前用强负 bias（-2.2 / -1.8）藏于伪装面下，张望或出手时露出。
  //   3. 行为循环：直接调用 core 的 PW.Behaviors.createAmbushCycle（6 态完整闭环），
  //      patrol 自带极简「来喝水的小动物」配角走近低头喝水 -> 踩边触发 -> 合拢包住 ->
  //      包里鼓动 -> 缓慢摊平 -> 满 2 轮极慢挪位（严格钳制在 maxRadius * 0.78 内）。
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 伪装水面 4 阶（深青 -> 浅青 -> 浅边 -> 细浪白点）
      waterDeep:    '#145b6e',
      waterMid:     '#258fa3',
      waterShallow: '#5cc8d4',
      waterFoam:    '#bceef2',
      // 外圈湿沙边 3 阶
      wetDark:      '#734c26',
      wetMid:       '#9c6c38',
      wetHi:        '#ba864a',
      // 卷边背面粗糙沙褐皮 3 阶 + 粗皮脊 3 阶
      hideDark:     '#54371d',
      hideMid:      '#825932',
      hideHi:       '#ad7d4c',
      ridgeDark:    '#3d2614',
      ridgeMid:     '#694524',
      ridgeHi:      '#94683b',
      // 内侧暗肉与短钩 5 阶
      fleshDark:    '#4a1a1d',
      fleshMid:     '#7a2b30',
      hookDark:     '#8c7b63',
      hookMid:      '#c7b89c',
      hookHi:       '#ede3cc',
      // 细眼柄与锐利双眼 5 阶（eyeGlint 不进 glowKeys 防发糊）
      stalkDark:    '#5e462d',
      stalkMid:     '#8f6e48',
      eyeDark:      '#14110f',
      eyeIris:      '#e8a825',
      eyeGlint:     '#fff8e6',
      // 演示配角：来喝水的沙地小动物 6 阶
      preyDark:     '#8a6c4d',
      preyMid:      '#c4a278',
      preyHi:       '#e8cfa6',
      preyEar:      '#d69482',
      preyBelly:    '#f5ebd6',
      preyNose:     '#3b2522'
    },
    glowKeys: [],
    parts: ['water', 'wet', 'hide', 'ridge', 'flesh', 'hook', 'stalk', 'eye', 'preyBody', 'preyEar', 'preyDetail'],
    noCrease: [
      ['water', 'wet'],
      ['hide', 'ridge'],
      ['stalk', 'eye'],
      ['flesh', 'hook'],
      ['preyBody', 'preyEar'],
      ['preyBody', 'preyDetail']
    ],
    materials: {
      water:    ['waterDeep', 'waterMid', 'waterShallow'],
      wet:      ['wetDark',   'wetMid',   'wetHi'],
      hide:     ['hideDark',  'hideMid',  'hideHi'],
      ridge:    ['ridgeDark', 'ridgeMid', 'ridgeHi'],
      hook:     ['hookDark',  'hookMid',  'hookHi'],
      stalk:    ['stalkDark', 'stalkMid', 'hideHi'],
      preyBody: ['preyDark',  'preyMid',  'preyHi']
    },
    protectedParts: ['eye', 'hook', 'preyDetail']
  });

  const SKINS = [
    {
      id: 'desert_teal', name: '戈壁浅碧水洼', dot: '#258fa3', outline: '#1a140d',
      pal: {}
    },
    {
      id: 'oasis_deep', name: '绿洲深潭色', dot: '#197566', outline: '#0e1713',
      pal: {
        waterDeep:    '#0c4540',
        waterMid:     '#197566',
        waterShallow: '#46b09c',
        waterFoam:    '#a8e8d8',
        wetDark:      '#4d3b24',
        wetMid:       '#6e5636',
        wetHi:        '#8f734b',
        hideDark:     '#3b311d',
        hideMid:      '#5e4f30',
        hideHi:       '#857249',
        ridgeDark:    '#292113',
        ridgeMid:     '#4a3e24',
        ridgeHi:      '#6e5d3a'
      }
    },
    {
      id: 'salt_pink', name: '盐湖粉红伪装洼', dot: '#cf6b84', outline: '#24151a',
      pal: {
        waterDeep:    '#993d56',
        waterMid:     '#cf6b84',
        waterShallow: '#eb9fb0',
        waterFoam:    '#fce0e6',
        wetDark:      '#999085',
        wetMid:       '#c7bfb4',
        wetHi:        '#ebe5dc',
        hideDark:     '#6b615a',
        hideMid:      '#94887f',
        hideHi:       '#bdb2a8',
        ridgeDark:    '#4f4640',
        ridgeMid:     '#786d65',
        ridgeHi:      '#a1968c'
      }
    }
  ];

  // =========================================================================
  // 1. 体素建模（底盘八角对称 symDeg=45；8 片卷边共享 3 档姿态；短钩/眼柄/配角轻量）
  // =========================================================================

  // 1) 伪装水面底盘（30×30×4，严格八角对称 symDeg: 45，极薄 3 层）
  function buildPoolDisc(makeCanvas) {
    const W = 30, D = 30, H = 4;
    const m = new VoxelModel(W, D, H, SPEC);
    const { partId, keyToId } = SPEC;
    const rMax = 13.8;

    m.fillAABB(-rMax - 0.5, rMax + 0.5, -rMax - 0.5, rMax + 0.5, 0, 2, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      // 8 重对称微起伏边，配合 symDeg=45 省贴图
      const edgeR = rMax + Math.cos(ang * 8) * 0.45;
      if (r > edgeR) return;
      if (z === 2 && r > edgeR - 1.1) return;

      // z=0 底层偏深作贴地暗衬，z=1..2 呈现中间深青、外环浅青的浅水色带
      if (z === 0 && r > edgeR - 1.8) {
        m.setRaw(x, y, z, keyToId.wetDark, partId.wet);
        return;
      }

      if (r <= 6.2) {
        // 中心深青水心（8 重对称微亮点）
        const isSpec = z === 2 && Math.abs(r - 3.6) < 0.65 && Math.cos(ang * 8) > 0.78;
        m.setRaw(x, y, z, isSpec ? keyToId.waterMid : keyToId.waterDeep, partId.water);
      } else if (r <= 10.6) {
        const isRing = z === 2 && Math.abs(r - 8.4) < 0.55 && Math.cos(ang * 8) > 0.72;
        m.setRaw(x, y, z, isRing ? keyToId.waterShallow : keyToId.waterMid, partId.water);
      } else {
        const isFoam = z === 1 && Math.abs(r - 12.1) < 0.55 && Math.cos(ang * 8) > 0.85;
        m.setRaw(x, y, z, isFoam ? keyToId.waterFoam : keyToId.waterShallow, partId.water);
      }
    });

    m.despeckle();
    return m.toStripAsset(makeCanvas, { footRadius: 14.0, headZ: 3, centerZ: 1 });
  }

  // 2) 共享卷边 3 档姿态：平摊（flat）/ 半卷（half）/ 全卷（closed）
  //    局部 +Y 朝外（远离水洼中心），-Y 朝内（枢轴关节位于局部 (0, hingeY)）
  function buildFlapFlat(makeCanvas) {
    const W = 18, D = 16, H = 4;
    const m = new VoxelModel(W, D, H, SPEC);
    const { partId, keyToId } = SPEC;

    m.fillAABB(-8.4, 8.4, -6.5, 7.6, 0, 2, (x, y, z, X, Y) => {
      // 扇形外缘：内侧收窄、外侧略展成圆润水洼瓣缘
      const u = clamp((Y + 6.0) / 13.2, 0, 1);
      const halfW = lerp(4.8, 7.6, Math.pow(u, 0.7)) * Math.sin(clamp(1 - Math.pow(Math.max(0, u - 0.58) / 0.42, 2), 0, 1) * Math.PI * 0.5);
      if (Math.abs(X) > halfW + 0.35) return;
      const lobeTip = 6.8 - Math.pow(X / 8.0, 2) * 3.4;
      if (Y < -5.8 || Y > lobeTip) return;
      if (z === 2 && (Y > lobeTip - 1.6 || Math.abs(X) > halfW - 0.9)) return;

      // 最底层外缘暗藏粗糙沙褐皮，上面两层伪装成浅青水边 + 外圈湿沙色
      if (z === 0 && Y > lobeTip - 2.6) {
        m.setRaw(x, y, z, keyToId.hideDark, partId.hide);
      } else if (Y > lobeTip - 3.0 || Math.abs(X) > halfW - 1.1) {
        const wetKey = z >= 1 ? (Y > lobeTip - 1.6 ? keyToId.wetHi : keyToId.wetMid) : keyToId.wetDark;
        m.setRaw(x, y, z, wetKey, partId.wet);
      } else if (Y > -0.5) {
        const isFoam = z === 2 && Math.abs(Y - 2.2) < 0.7 && Math.abs(X) < 2.2;
        m.setRaw(x, y, z, isFoam ? keyToId.waterFoam : keyToId.waterShallow, partId.water);
      } else {
        m.setRaw(x, y, z, keyToId.waterMid, partId.water);
      }
    });

    m.despeckle();
    return m.toStripAsset(makeCanvas, { footRadius: 7.4, headZ: 3, centerZ: 1 });
  }

  function buildFlapHalf(makeCanvas) {
    const W = 16, D = 14, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 45° 向上卷起的弧形边瓣：外底面露出粗糙沙褐皮，内凹面残留浅青水膜与暗红肉边
    m.fillAABB(-7.4, 7.4, -5.8, 5.8, 0, 7, (x, y, z, X, Y) => {
      const u = clamp((Y + 4.8) / 9.8, 0, 1);
      const archZ = 0.6 + Math.pow(u, 1.15) * 5.6;
      const halfW = lerp(5.2, 6.6, Math.sin(u * Math.PI * 0.85));
      if (Math.abs(X) > halfW) return;
      const dz = z - archZ;
      if (dz < -1.35 || dz > 1.35) return;

      // 外侧/底面（dz <= 0.1 或外缘）显示沙褐色粗糙厚皮 + 凸脊
      if (dz <= 0.15 || u > 0.78) {
        const isRidge = (Math.abs(X) < 1.2 || Math.abs(Math.abs(X) - 3.6) < 0.9) && u > 0.25 && u < 0.88;
        m.setRaw(x, y, z, isRidge ? mat('ridge') : mat('hide'), isRidge ? partId.ridge : partId.hide);
      } else if (u < 0.25) {
        m.setRaw(x, y, z, keyToId.fleshMid, partId.flesh);
      } else {
        m.setRaw(x, y, z, u > 0.55 ? keyToId.waterShallow : keyToId.waterMid, partId.water);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.5, headZ: 7, centerZ: 3 });
  }

  function buildFlapClosed(makeCanvas) {
    const W = 16, D = 14, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 全卷合拢态：外墙竖起并在顶缘向内（-Y）弯拱扣合，8 片拼成浑圆粗糙沙褐圆包
    m.fillAABB(-7.4, 7.4, -6.0, 5.2, 0, 10, (x, y, z, X, Y) => {
      const hz = clamp(z / 9.6, 0, 1);
      // 随高度从外缘 (+3.4) 弯拱收向中心 (-4.6)
      const curveY = 3.2 - Math.pow(hz, 1.55) * 7.8;
      const dy = Y - curveY;
      if (dy < -1.8 || dy > 1.7) return;
      // 越往顶缘越收窄成穹顶瓣尖，8 片合拢不穿插
      const halfW = lerp(6.4, 2.2, Math.pow(hz, 1.25));
      if (Math.abs(X) > halfW) return;

      // 背面/顶面全部是粗糙沙褐厚皮与纵向皮脊，内壁极低处留一点暗肉
      if (dy < -0.9 && hz < 0.38) {
        m.setRaw(x, y, z, keyToId.fleshDark, partId.flesh);
      } else {
        const isRidge = (Math.abs(X) < 1.1 || (hz < 0.65 && Math.abs(Math.abs(X) - 3.4) < 0.9)) && dy > 0.1;
        const isSandSpeck = hz > 0.68 && Math.abs(X) < 1.6 && dy > 0.25 && ((Math.round(z) & 1) === 0);
        if (isSandSpeck) {
          m.setRaw(x, y, z, keyToId.wetHi, partId.wet);
        } else {
          m.setRaw(x, y, z, isRidge ? mat('ridge') : mat('hide'), isRidge ? partId.ridge : partId.hide);
        }
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.2, headZ: 10, centerZ: 5 });
  }

  // 3) 合拢期中央鼓动顶盖（16×16×10，symDeg: 45，填实 8 片合拢顶缝并在吞咽期鼓动）
  function buildDigestBulge(makeCanvas) {
    const W = 16, D = 16, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.8, 6.8, -6.8, 6.8, 1, 9, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const rx = 6.2 + Math.cos(ang * 8) * 0.35;
      const d = Math.hypot(r / rx, (z - 3.6) / 5.2);
      if (d <= 1.0 && z >= 2) {
        const isSeam = Math.abs(Math.cos(ang * 4)) > 0.92 && z >= 5;
        m.setRaw(x, y, z, isSeam ? mat('ridge') : mat('hide'), isSeam ? partId.ridge : partId.hide);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.4, headZ: 9, centerZ: 5 });
  }

  // 4) 藏在边缘下的短钩簇（10×10×6，8 处共享 1 套资产，钩尖朝内 -Y 扣捕猎物）
  function buildHookCluster(makeCanvas) {
    const W = 10, D = 10, H = 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 暗肉底座
    m.paintEllipsoid(0, 1.4, 1.2, 3.2, 1.8, 1.1, keyToId.fleshMid, partId.flesh, true);
    // 3 根向内微弯的骨色短钩
    for (const [ox, hTop] of [[-2.1, 4.2], [0.0, 4.9], [2.1, 4.2]]) {
      m.paintCapsule(ox, 1.8, 1.2, ox * 0.85, 0.2, hTop, 0.85, 0.62, mat('hook'), partId.hook, true);
      m.paintCapsule(ox * 0.85, 0.2, hTop, ox * 0.72, -2.0, hTop - 0.7, 0.62, 0.42, mat('hook'), partId.hook, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 5, centerZ: 2 });
  }

  // 5) 细眼柄（8×8×10，2 根共享 1 套资产，顶上 2×2 锐利单眼，非自亮防发糊）
  function buildEyeStalk(makeCanvas) {
    const W = 8, D = 8, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 细长微前倾的眼柄
    m.paintCapsule(0, -0.6, 0.5, 0, 0.6, 6.2, 1.05, 0.82, mat('stalk'), partId.stalk, true);
    // 顶部眼球囊
    m.paintEllipsoid(0, 0.8, 7.2, 1.75, 1.75, 1.65, mat('stalk'), partId.stalk, true);
    m.despeckle();
    m.applyArtShading(true);

    // 朝 +Y 表面雕刻 2×2 锐利眼（瞳孔 + 琥珀虹膜 + 右上 1px 亮点，0 遮挡）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const ey = Math.round(hd + 2.1);
    const xL = Math.round(hw - 0.5);
    const xR = Math.round(hw + 0.5);
    m.setRaw(xL, ey, 7, keyToId.eyeIris,  partId.eye);
    m.setRaw(xR, ey, 7, keyToId.eyeDark,  partId.eye);
    m.setRaw(xL, ey, 8, keyToId.eyeDark,  partId.eye);
    m.setRaw(xR, ey, 8, keyToId.eyeGlint, partId.eye);

    return m.toStripAsset(makeCanvas, { footRadius: 1.8, headZ: 9, centerZ: 5 });
  }

  // 6) 演示配角：来喝水的沙漠小跳鼠/沙兔（极简 2 件：身躯 10×12×8 + 头耳 8×10×8）
  function buildPreyBody(makeCanvas) {
    const W = 10, D = 12, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 圆润米褐小身子 + 浅白小腹 + 小短尾球 + 4 只小脚垫
    m.paintEllipsoid(0, -0.4, 3.2, 2.8, 3.8, 2.5, mat('preyBody'), partId.preyBody, true);
    m.paintEllipsoid(0, -0.2, 1.5, 2.0, 2.8, 1.1, keyToId.preyBelly, partId.preyDetail, true);
    m.paintEllipsoid(0, -4.2, 2.4, 1.15, 1.15, 1.15, keyToId.preyBelly, partId.preyDetail, true);
    for (const [fx, fy] of [[-1.8, 2.0], [1.8, 2.0], [-2.0, -2.2], [2.0, -2.2]]) {
      m.paintEllipsoid(fx, fy, 0.8, 0.9, 1.1, 0.85, keyToId.preyDark, partId.preyBody, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.4, headZ: 6, centerZ: 3 });
  }

  function buildPreyHead(makeCanvas) {
    const W = 8, D = 10, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 小脑袋 + 粉褐长耳朵 + 小黑鼻尖
    m.paintEllipsoid(0, 0.6, 2.6, 2.2, 2.5, 2.0, mat('preyBody'), partId.preyBody, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.1, -0.4, 4.0, s * 1.7, -1.6, 6.8, 0.82, 0.62, mat('preyBody'), partId.preyEar, true);
      m.paintCapsule(s * 1.1, -0.1, 4.2, s * 1.5, -1.0, 6.2, 0.48, 0.36, keyToId.preyEar, partId.preyDetail, true);
    }
    m.despeckle();
    m.applyArtShading(true);

    // 双眼 + 小黑鼻尖
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    m.setRaw(Math.round(hw - 1.8), Math.round(hd + 1.8), 3, keyToId.eyeDark,  partId.preyDetail);
    m.setRaw(Math.round(hw + 1.8), Math.round(hd + 1.8), 3, keyToId.eyeDark,  partId.preyDetail);
    m.setRaw(Math.round(hw),       Math.round(hd + 3.0), 2, keyToId.preyNose, partId.preyDetail);

    return m.toStripAsset(makeCanvas, { footRadius: 2.4, headZ: 7, centerZ: 3 });
  }

  // =========================================================================
  // 2. 8 片卷边微错位配置（用共享资产造出自然不规则水洼轮廓，总宽 46~50 格）
  // =========================================================================
  const NUM_FLAPS = 8;
  const FLAP_STAGGER = [
    { angOff:  0.03, rOff:  1.1, phase: 0.0 },
    { angOff: -0.05, rOff: -0.9, phase: 0.8 },
    { angOff:  0.04, rOff:  1.4, phase: 1.7 },
    { angOff: -0.03, rOff: -0.6, phase: 2.5 },
    { angOff:  0.05, rOff:  0.8, phase: 3.3 },
    { angOff: -0.04, rOff: -1.1, phase: 4.1 },
    { angOff:  0.02, rOff:  1.2, phase: 5.0 },
    { angOff: -0.02, rOff: -0.7, phase: 5.8 }
  ];

  // =========================================================================
  // 3. 生物定义与实例
  // =========================================================================
  const Sand6MiragePoolDef = {
    id: 'sand6_mirage_pool',
    code: '沙6',
    name: '假水洼',
    status: 'done',
    tag: 'M19 标杆 · 静物伏击',
    summary: '摊在沙丘上的薄身伪装体，背呈深浅青水色并自泛涟漪；8 片共享资产卷边微错位拼出不规则水洼，底藏短钩圈与 2 根探望细眼柄；渴兽踩边即 0.3 秒卷合为沙褐圆包、鼓动消化再缓摊复原',
    defaultHabitat: 'desert',
    footRadius: 21.0,
    ecoWeight: 1.15,
    useWaterFoam: false,
    noHost: true,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '八角对称伪装底盘（symDeg=45）',
      '8 片共享 3 档卷边枢轴合拢',
      '负 bias 隐匿钩圈与双细眼柄',
      '通用 6 态伏击状态机（createAmbushCycle）',
      '自带喝水小动物伏击演绎'
    ],
    soulHabit: '整日摊平沙丘装作浅碧水洼并自泛涟漪，偶探细眼柄张望；渴兽低头踩边即 8 瓣齐卷合成沙褐圆包，鼓动消化后缓摊复原，久无猎物则极慢挪位换地',
    actions: [
      { id: 'patrol', name: '伏击全循环（含喝水小动物）', loop: true, status: 'done' },
      { id: 'idle',   name: '伪装静伏（微颤+眼柄张望）', loop: true, status: 'done' },
      { id: 'strike', name: '快速卷包演示（出手+复原）', loop: true, status: 'done' }
    ],
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        poolDisc:    buildPoolDisc(makeCanvas),
        flapFlat:    buildFlapFlat(makeCanvas),
        flapHalf:    buildFlapHalf(makeCanvas),
        flapClosed:  buildFlapClosed(makeCanvas),
        digestBulge: buildDigestBulge(makeCanvas),
        hookCluster: buildHookCluster(makeCanvas),
        eyeStalk:    buildEyeStalk(makeCanvas),
        preyBody:    buildPreyBody(makeCanvas),
        preyHead:    buildPreyHead(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.28;
      const seed0 = opts.seed ?? 67;

      const fsm = createAmbushCycle({
        seed: seed0,
        disguiseDur: [8, 14],
        tenseDur: [0.32, 0.55],
        strikeDur: [0.25, 0.40],
        digestDur: [1.5, 2.2],
        recoverDur: [3.0, 4.5],
        relocateDur: [2.6, 3.8],
        relocateEvery: 2
      });

      const curlSpring = new SpringDamper1D(0, 180, 14.0);
      const bulgeSpring = new SpringDamper1D(0, 150, 10.5);
      const eyeSpring = new SpringDamper1D(0, 130, 12.0);
      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      const state = {
        x: hx0, y: hy0, z: 0,
        vx: 0, vy: 0, yaw: hyaw0,
        shadowScale: 0.45,
        mode: 'disguise',
        modeP: 0,
        curl: 0,          // 0=平摊伪装, 0.5=半卷, 1=全卷沙褐圆包
        hookExtend: 0,    // 0=全藏负bias, 1=翻出扣捕
        eyePeek: 0,       // 0=全藏负bias, 1=探出张望
        eyeAimL: 0,
        eyeAimR: 0,
        digestPulse: 0,
        tremor: 0,
        // 挪位起止点
        relStartX: hx0, relStartY: hy0,
        relEndX: hx0,   relEndY: hy0,
        relSeq: 1,
        // 涟漪与痕迹节流
        rippleCd: 0.9,
        decalCd: 0,
        dustCd: 0,
        // 眼柄自主张望计时
        peekCd: 2.2,
        peekT: -1,
        peekDur: 1.55,
        // 演示配角：来喝水的小动物
        prey: {
          active: false,
          phase: 'wait',  // 'wait' | 'approach' | 'drink' | 'step' | 'trapped' | 'gone'
          t: 0,
          ang: 0.7,
          dist: 34,
          x: hx0 + 26,
          y: hy0 + 18,
          z: 0,
          yaw: 0,
          headDip: 0,
          hopZ: 0,
          seq: 1
        },
        prevAction: 'patrol',
        strikeWaitT: 0
      };

      function clampVec2(x, y, maxLen) {
        const d = Math.hypot(x, y);
        if (d > maxLen && d > 1e-4) {
          return [(x / d) * maxLen, (y / d) * maxLen];
        }
        return [x, y];
      }

      // 计算安全圆心上限：既严格满足 <= maxRadius * 0.78，又保证最外缘卷边坐标 <= maxRadius
      function safeCenterLimit(maxR, sMul) {
        const flapReach = 18.2 * sMul;
        return Math.min(maxR * 0.78, Math.max(3.5, maxR - flapReach));
      }

      function initPreyForDisguise(maxR, sMul) {
        const pr = state.prey;
        pr.seq++;
        const r1 = hash2i(pr.seq, seed0, 131);
        const r2 = hash2i(pr.seq, seed0, 257);
        // 优先从远离圆台边缘、空间较宽的一侧走来
        const toCenter = Math.atan2(-state.y, -state.x);
        const baseAng = Math.hypot(state.x, state.y) > 6
          ? toCenter + (r1 - 0.5) * 1.65
          : r1 * TAU;
        pr.ang = wrapAngle(baseAng);
        // 起始距水洼中心约 27~31 格，同时严格钳制在 maxR * 0.92 内
        const startDist = Math.min(30.0 * sMul, Math.max(20.0 * sMul, maxR * 0.85));
        const rawX = state.x + Math.cos(pr.ang) * startDist;
        const rawY = state.y + Math.sin(pr.ang) * startDist;
        const [cx, cy] = clampVec2(rawX, rawY, maxR * 0.90);
        pr.x = cx;
        pr.y = cy;
        pr.z = 0;
        pr.dist = Math.hypot(cx - state.x, cy - state.y);
        pr.yaw = Math.atan2(-(state.x - cx), state.y - cy);
        pr.headDip = 0;
        pr.hopZ = 0;
        pr.phase = 'wait';
        pr.t = 0;
        pr.active = true;
        pr.waitDur = lerp(1.35, 2.05, r2);
      }

      function pickRelocateTarget(maxR, sMul) {
        state.relSeq++;
        const lim = safeCenterLimit(maxR, sMul);
        const r1 = hash2i(state.relSeq, seed0, 419);
        const r2 = hash2i(state.relSeq, seed0, 563);
        const curAng = Math.atan2(state.y, state.x);
        const nextAng = curAng + (r1 > 0.5 ? 1 : -1) * lerp(1.3, 2.5, r2);
        const rad = lerp(lim * 0.35, lim * 0.92, hash2i(state.relSeq, seed0, 683));
        const [tx, ty] = clampVec2(Math.cos(nextAng) * rad, Math.sin(nextAng) * rad, lim);
        state.relStartX = state.x;
        state.relStartY = state.y;
        state.relEndX = tx;
        state.relEndY = ty;
      }

      const instance = {
        def: Sand6MiragePoolDef,
        cachePrefix: `sand6_pool_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 0;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.shadowScale = 0.45;
          state.curl = 0;
          state.hookExtend = 0;
          state.eyePeek = 0;
          state.digestPulse = 0;
          state.tremor = 0;
          state.rippleCd = 0.5;
          state.decalCd = 0;
          state.dustCd = 0;
          state.peekCd = 1.6;
          state.peekT = -1;
          state.strikeWaitT = 0;
          curlSpring.x = 0; curlSpring.v = 0;
          bulgeSpring.x = 0; bulgeSpring.v = 0;
          eyeSpring.x = 0; eyeSpring.v = 0;
          fsm.reset('disguise');
          state.mode = 'disguise';
          state.modeP = 0;
          initPreyForDisguise(46, 1.0);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const speedMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const maxR = (eco && eco.maxRadius) || 46;
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const cLim = safeCenterLimit(maxR, sMul);

          // 动作切换响应
          if (action !== state.prevAction) {
            state.prevAction = action;
            if (action === 'idle') {
              fsm.forceState('disguise', 12.0);
              state.prey.active = false;
              state.peekCd = 1.1;
              state.peekT = -1;
            } else if (action === 'strike') {
              fsm.forceState('tense', 0.36);
              state.prey.active = false;
              state.strikeWaitT = 0;
            } else {
              fsm.reset('disguise');
              initPreyForDisguise(maxR, sMul);
            }
          }

          // 推进通用伏击状态机
          const isPatrol = action === 'patrol';
          const isIdle   = action === 'idle';
          const isStrike = action === 'strike';

          const step = fsm.update(dt, {
            autoTrigger: isPatrol || isStrike,
            canRelocate: isPatrol,
            speed: speedMul
          });

          // strike 演示模式：缩短 disguise 停留，让观众循环看「绷紧 -> 迅速卷包 -> 鼓动 -> 缓摊」
          if (isStrike && step.mode === 'disguise' && step.t >= 1.55) {
            fsm.trigger();
          }

          const mode = fsm.state.mode;
          const p = clamp(fsm.state.t / Math.max(0.01, fsm.state.dur), 0, 1);
          const modeChanged = step.changed || mode !== state.mode;
          state.mode = mode;
          state.modeP = p;
          state.tremor = step.tremor;

          // 状态切换瞬间触发一次性环境反馈
          if (modeChanged) {
            if (mode === 'disguise') {
              state.peekCd = lerp(1.4, 2.8, hash2i(step.seq, seed0, 311));
              state.peekT = -1;
              if (isPatrol) {
                initPreyForDisguise(maxR, sMul);
              } else {
                state.prey.active = false;
              }
            } else if (mode === 'tense') {
              if (vfx) {
                vfx.addRipple(state.x, state.y, 4 * sMul, 20 * sMul, 0.55, 1.8);
                if (habitat && habitat.fx) {
                  vfx.spawnDust(state.x, state.y, 8, 0.85, habitat.fx);
                }
              }
            } else if (mode === 'strike') {
              curlSpring.impulse(5.5 * sp);
              if (vfx) {
                vfx.addRipple(state.x, state.y, 6 * sMul, 26 * sMul, 0.68, 2.2);
                vfx.addDecal({
                  kind: 'mound', x: state.x, y: state.y, yaw: state.yaw,
                  rx: 15.5 * sMul, ry: 15.5 * sMul, life: 7.5, alpha: 0.72
                });
                if (habitat && habitat.fx) {
                  for (let k = 0; k < 4; k++) {
                    const a = state.yaw + k * (TAU / 4);
                    vfx.spawnDust(
                      state.x + Math.cos(a) * 14 * sMul,
                      state.y + Math.sin(a) * 14 * sMul,
                      5, 1.05, habitat.fx
                    );
                  }
                }
              }
            } else if (mode === 'digest') {
              bulgeSpring.impulse(3.6 * sp);
              state.prey.phase = 'gone';
              state.prey.active = false;
            } else if (mode === 'recover') {
              if (vfx) {
                vfx.addDecal({
                  kind: 'wet', x: state.x, y: state.y, yaw: state.yaw,
                  rx: 14.0 * sMul, ry: 14.0 * sMul, life: 6.5, alpha: 0.45
                });
              }
            } else if (mode === 'relocate') {
              state.prey.active = false;
              pickRelocateTarget(maxR, sMul);
            }
          }

          // -----------------------------------------------------------------
          // 演示配角「来喝水的小动物」更新（仅 patrol 模式的 disguise / tense / strike）
          // -----------------------------------------------------------------
          const pr = state.prey;
          if (isPatrol && pr.active) {
            pr.t += dt * speedMul;
            if (mode === 'disguise') {
              if (pr.phase === 'wait') {
                pr.hopZ = 0;
                pr.headDip = 0;
                if (pr.t >= pr.waitDur) {
                  pr.phase = 'approach';
                  pr.t = 0;
                }
              } else if (pr.phase === 'approach') {
                // 轻快碎步小跳接近假水洼外缘（目标距中心 17.5 格）
                const tgtDist = 17.5 * sMul;
                const dx = state.x - pr.x;
                const dy = state.y - pr.y;
                const dist = Math.hypot(dx, dy);
                if (dist <= tgtDist + 0.8) {
                  pr.phase = 'drink';
                  pr.t = 0;
                  pr.hopZ = 0;
                } else {
                  const hopWave = Math.abs(Math.sin(time * 9.5 * gFreq));
                  const stepSpd = (7.2 + hopWave * 4.8) * speedMul * sMul;
                  const nx = pr.x + (dx / Math.max(dist, 0.01)) * stepSpd * dt;
                  const ny = pr.y + (dy / Math.max(dist, 0.01)) * stepSpd * dt;
                  const [cx, cy] = clampVec2(nx, ny, maxR * 0.92);
                  pr.x = cx;
                  pr.y = cy;
                  pr.yaw = Math.atan2(-dx, dy);
                  pr.hopZ = hopWave * 1.9 * sMul;
                }
              } else if (pr.phase === 'drink') {
                // 在水洼边停步低头舔水，荡开细小涟漪
                pr.hopZ = 0;
                const dipWave = smoothstep(0, 0.25, pr.t) * (0.75 + 0.25 * Math.sin(pr.t * 7.5));
                pr.headDip = dipWave;
                if (vfx && Math.floor(pr.t * 2.2) !== Math.floor((pr.t - dt * speedMul) * 2.2)) {
                  const [mx, my] = localToWorldXY(pr.x, pr.y, pr.yaw, 0, 4.2 * sMul);
                  vfx.addRipple(mx, my, 1.5 * sMul, 8.5 * sMul, 0.72, 1.1);
                }
                if (pr.t >= 1.25) {
                  pr.phase = 'step';
                  pr.t = 0;
                }
              } else if (pr.phase === 'step') {
                // 再往前踩上一小步进浅水区 -> 踩中触发 fsm.trigger()！
                pr.headDip = lerp(pr.headDip, 0.2, expSmooth(dt, 10));
                const dx = state.x - pr.x;
                const dy = state.y - pr.y;
                const dist = Math.hypot(dx, dy);
                const stepSpd = 8.2 * speedMul * sMul;
                const nx = pr.x + (dx / Math.max(dist, 0.01)) * stepSpd * dt;
                const ny = pr.y + (dy / Math.max(dist, 0.01)) * stepSpd * dt;
                pr.x = nx;
                pr.y = ny;
                pr.yaw = Math.atan2(-dx, dy);
                pr.hopZ = Math.abs(Math.sin(pr.t * 10)) * 1.1 * sMul;
                if (dist <= 11.2 * sMul || pr.t >= 1.1) {
                  pr.phase = 'trapped';
                  pr.t = 0;
                  fsm.trigger();
                }
              }
            } else if (mode === 'tense') {
              // 察觉不对惊跳一下
              pr.headDip = 0;
              pr.hopZ = Math.sin(p * Math.PI) * 3.4 * sMul;
              pr.yaw = wrapAngle(pr.yaw + dt * 5.2);
            } else if (mode === 'strike') {
              // 被卷边拉向中心并合拢包住
              const kPull = expSmooth(dt, 14);
              pr.x = lerp(pr.x, state.x, kPull);
              pr.y = lerp(pr.y, state.y, kPull);
              pr.hopZ = (1 - p) * 1.8 * sMul;
              if (p > 0.62) {
                pr.active = false;
                pr.phase = 'gone';
              }
            } else {
              pr.active = false;
            }
          }

          // -----------------------------------------------------------------
          // 6 态姿态目标量计算（绝不用 scaleX/scaleY 拉伸，纯靠 3 档姿态 + lift + 径向收放）
          // -----------------------------------------------------------------
          let targetCurl = 0;
          let targetHook = 0;
          let targetEye = 0;
          let targetBulge = 0;

          if (mode === 'disguise') {
            targetCurl = state.tremor * 0.14;
            targetHook = 0;
            targetBulge = 0;
            state.shadowScale = 0.35;

            // 原地待机或 strike 演示时柔和回正到原点附近
            if (isIdle || isStrike) {
              const hx = (eco && eco.homeX) ?? 0;
              const hy = (eco && eco.homeY) ?? 0;
              const [cx, cy] = clampVec2(lerp(state.x, hx, expSmooth(dt, 3.2)), lerp(state.y, hy, expSmooth(dt, 3.2)), cLim);
              state.x = cx;
              state.y = cy;
            }

            // 细眼柄偶发探出张望（idle 中更频繁；patrol 中小动物走近前会探头偷看一眼）
            state.peekCd -= dt * speedMul;
            const preyNearby = isPatrol && pr.active && (pr.phase === 'approach' || pr.phase === 'drink');
            if (preyNearby && state.peekT < 0 && state.peekCd < 0.8) {
              state.peekT = 0;
              state.peekDur = 1.2;
            } else if (state.peekCd <= 0 && state.peekT < 0) {
              state.peekT = 0;
              state.peekDur = isIdle ? 1.85 : 1.35;
            }
            if (state.peekT >= 0) {
              state.peekT += dt * speedMul;
              if (state.peekT >= state.peekDur) {
                state.peekT = -1;
                state.peekCd = isIdle
                  ? lerp(1.6, 2.8, hash2i(Math.floor(time * 2) + 5, seed0, 727))
                  : lerp(2.8, 4.6, hash2i(Math.floor(time * 2) + 9, seed0, 733));
              } else {
                const uPeek = state.peekT / state.peekDur;
                targetEye = smoothstep(0, 0.22, uPeek) * (1 - smoothstep(0.75, 1.0, uPeek));
              }
            }

            // 水面波纹（VFX 涟漪叠绘，绝不烘多档大盘体素！）
            state.rippleCd -= dt * speedMul;
            if (vfx && state.rippleCd <= 0) {
              state.rippleCd = lerp(1.15, 2.15, hash2i(Math.floor(time * 5) + 1, seed0, 821));
              const roA = hash2i(Math.floor(time * 7), seed0, 829) * TAU;
              const roR = hash2i(Math.floor(time * 7), seed0, 839) * 5.2 * sMul;
              vfx.addRipple(
                state.x + Math.cos(roA) * roR,
                state.y + Math.sin(roA) * roR,
                2.2 * sMul, 13.5 * sMul, 1.25, 1.25
              );
            }
          } else if (mode === 'tense') {
            // 察觉绷紧（0.32~0.55s）：外缘微微上翘抖动，短钩初露
            targetCurl = lerp(0.18, 0.42, smoothstep(0, 1, p)) + Math.sin(time * 42) * 0.04;
            targetHook = smoothstep(0.1, 0.9, p);
            targetEye = 0;
            targetBulge = 0;
            state.shadowScale = 0.50;
          } else if (mode === 'strike') {
            // 迅速出手（0.25~0.40s）：8 片卷边疾速抬起并向中心扣合成沙褐圆包
            const snap = smoothstep(0, 0.85, p);
            targetCurl = lerp(0.42, 1.0, snap);
            targetHook = 1.0 - smoothstep(0.55, 1.0, p);
            targetEye = 0;
            targetBulge = smoothstep(0.45, 1.0, p) * 0.85;
            state.shadowScale = lerp(0.50, 0.72, snap);
          } else if (mode === 'digest') {
            // 吞下鼓动（1.5~2.2s）：保持沙褐圆包，包内节律性鼓动
            const heave = Math.sin(p * Math.PI * 5.0) * Math.sin(p * Math.PI);
            targetCurl = 1.0 - Math.max(0, heave) * 0.06;
            targetHook = 0;
            targetEye = 0;
            targetBulge = 0.92 + heave * 0.42;
            state.shadowScale = 0.72;
            state.dustCd -= dt;
            if (vfx && habitat && habitat.fx && state.dustCd <= 0 && Math.abs(heave) > 0.55) {
              state.dustCd = 0.35;
              vfx.spawnDust(state.x, state.y, 3, 0.55, habitat.fx);
            }
          } else if (mode === 'recover') {
            // 缓慢摊平（3.0~4.5s，破绽期）：先慢后匀松开圆包，眼柄中途探出扫视再缩回
            const openU = smoothstep(0, 1, p);
            targetCurl = 1.0 - openU;
            targetHook = Math.sin(clamp((p - 0.12) / 0.55, 0, 1) * Math.PI) * 0.65;
            targetEye = p > 0.42 && p < 0.86
              ? Math.sin(((p - 0.42) / 0.44) * Math.PI) * 0.85
              : 0;
            targetBulge = (1 - smoothstep(0, 0.35, p)) * 0.75;
            state.shadowScale = lerp(0.72, 0.35, openU);
          } else if (mode === 'relocate') {
            // 极慢挪位（2.6~3.8s）：微蜷外缘像一片流沙缓缓滑移到新点，严格钳制在 maxRadius * 0.78 内
            const u = smoothstep(0, 1, p);
            const creepWave = Math.sin(p * Math.PI * 6.0 * gFreq);
            const rawX = lerp(state.relStartX, state.relEndX, u);
            const rawY = lerp(state.relStartY, state.relEndY, u);
            const [cx, cy] = clampVec2(rawX, rawY, cLim);
            state.vx = (cx - state.x) / Math.max(dt, 0.001);
            state.vy = (cy - state.y) / Math.max(dt, 0.001);
            state.x = cx;
            state.y = cy;
            const moveDx = state.relEndX - state.relStartX;
            const moveDy = state.relEndY - state.relStartY;
            if (Math.hypot(moveDx, moveDy) > 0.5) {
              const aimYaw = Math.atan2(-moveDx, moveDy);
              state.yaw = wrapAngle(state.yaw + wrapAngle(aimYaw - state.yaw) * expSmooth(dt, 2.2));
            }
            targetCurl = 0.22 + 0.08 * Math.abs(creepWave);
            targetHook = 0;
            targetEye = 0.32 * Math.sin(p * Math.PI);
            targetBulge = 0;
            state.shadowScale = 0.42;

            state.decalCd -= dt;
            if (vfx && state.decalCd <= 0) {
              state.decalCd = 0.28;
              vfx.addDecal({
                kind: 'mound', x: state.x, y: state.y, yaw: state.yaw,
                rx: 12.5 * sMul, ry: 11.0 * sMul, life: 6.0, alpha: 0.52
              });
            }
            state.dustCd -= dt;
            if (vfx && habitat && habitat.fx && state.dustCd <= 0) {
              state.dustCd = 0.26;
              vfx.spawnDust(state.x, state.y, 2, 0.45, habitat.fx);
            }
          }

          // 安全边界兜底：任何动作下圆心永不越界
          const [safeX, safeY] = clampVec2(state.x, state.y, cLim);
          state.x = safeX;
          state.y = safeY;
          state.z = 0;

          // 二阶弹簧推进平滑过渡
          state.curl = clamp(curlSpring.update(dt, targetCurl, 185 * sp, 14.5), 0, 1.08);
          state.digestPulse = clamp(bulgeSpring.update(dt, targetBulge, 145 * sp, 10.0), 0, 1.45);
          state.eyePeek = clamp(eyeSpring.update(dt, targetEye, 130 * sp, 12.0), 0, 1.05);
          state.hookExtend = lerp(state.hookExtend, targetHook, expSmooth(dt, 16));

          // 眼柄朝向：有小动物时两眼盯向猎物，否则各自缓慢左右张望
          if (isPatrol && pr.active) {
            const lookYaw = Math.atan2(-(pr.x - state.x), pr.y - state.y);
            state.eyeAimL = wrapAngle(lookYaw - 0.14);
            state.eyeAimR = wrapAngle(lookYaw + 0.14);
          } else {
            state.eyeAimL = wrapAngle(state.yaw - 0.45 + Math.sin(time * 2.1 * gFreq) * 0.55);
            state.eyeAimR = wrapAngle(state.yaw + 0.45 + Math.cos(time * 1.8 * gFreq) * 0.55);
          }

          sockets.setWorld('center', state.x, state.y, state.curl * 6.0 * sMul, state.yaw);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const curl = clamp(state.curl, 0, 1);

          // 1. 伪装底盘（八角对称 symDeg: 45）
          //    平摊时完整铺开；合拢成沙褐圆包后留在圆包底心（强负 bias 被 8 片沙褐卷边严密遮住）
          const discBias = curl > 0.65 ? -2.8 : -0.4;
          list.push({
            partKey: 'poolDisc',
            asset: parts.poolDisc,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: state.yaw,
            symDeg: 45,
            bias: discBias
          });

          // 2. 8 片共享资产卷边（按 curl 切换 3 档姿态：平摊 / 半卷 / 全卷，靠 lift + 径向收拢合成圆包）
          const flapKey = curl < 0.28 ? 'flapFlat' : (curl < 0.68 ? 'flapHalf' : 'flapClosed');
          const flapAsset = parts[flapKey];
          const baseHingeR = lerp(16.2, 6.9, smoothstep(0, 1, curl));
          const breatheR = state.mode === 'digest' ? (state.digestPulse - 0.9) * 1.15 : 0;

          for (let k = 0; k < NUM_FLAPS; k++) {
            const stg = FLAP_STAGGER[k];
            const ang = wrapAngle(state.yaw + k * (TAU / NUM_FLAPS) + stg.angOff * (1 - curl * 0.75));
            // 错位幅度在平摊态造出不规则水洼轮廓，合拢态自动收敛齐整
            const rJitter = stg.rOff * (1 - curl * 0.85);
            const r = (baseHingeR + rJitter + breatheR) * sMul;
            // 沿外法向 (ro = ang) 锁枢轴偏移摆放（局部 +Y 朝外）
            const [fx, fy] = localToWorldXY(state.x, state.y, ang, 0, r);
            // 伪装态微颤 + 卷起抬升 lift（不翻转、不拉伸）
            const tremorLift = state.tremor * Math.sin(stg.phase + state.modeP * 12) * 0.45 * sMul;
            const curlLift = (flapKey === 'flapFlat' ? 0 : (flapKey === 'flapHalf' ? 1.1 : 1.6)) * sMul
              + Math.max(0, curl - 0.28) * 1.2 * sMul;
            const flapBias = flapKey === 'flapClosed' ? 0.55 : (flapKey === 'flapHalf' ? 0.25 : -0.10);

            list.push({
              partKey: flapKey,
              asset: flapAsset,
              x: fx,
              y: fy,
              lift: Math.max(0, curlLift + tremorLift),
              ro: ang,
              symDeg: 360,
              bias: flapBias
            });
          }

          // 3. 藏在边缘下的 8 组短钩圈（展开前强负 bias = -2.2 严密藏于伪装面下，出手时才露出）
          const hookVis = state.hookExtend > 0.08;
          const hookR = lerp(10.2, 11.8, state.hookExtend) * (1 - curl * 0.30) * sMul;
          const hookLift = hookVis ? (0.4 + state.hookExtend * 2.4) * sMul : 0;
          const hookBias = hookVis ? (curl > 0.72 ? -0.6 : 0.85) : -2.2;
          for (let k = 0; k < NUM_FLAPS; k++) {
            const ang = wrapAngle(state.yaw + k * (TAU / NUM_FLAPS) + (TAU / 16));
            const [hx, hy] = localToWorldXY(state.x, state.y, ang, 0, hookR);
            list.push({
              partKey: 'hookCluster',
              asset: parts.hookCluster,
              x: hx,
              y: hy,
              lift: hookLift,
              ro: ang,
              symDeg: 360,
              bias: hookBias
            });
          }

          // 4. 2 根可伸出张望的细眼柄（平时强负 bias = -1.8 藏于伪装面下，张望时抬升露出并独立转动）
          const eyeOut = state.eyePeek > 0.12;
          const eyeLift = eyeOut ? (0.8 + state.eyePeek * 3.6) * sMul : 0;
          const eyeBias = eyeOut ? 1.45 : -1.8;
          for (const [side, aim] of [[-1, state.eyeAimL], [1, state.eyeAimR]]) {
            const [ex, ey] = localToWorldXY(state.x, state.y, state.yaw, side * 4.4 * sMul, 3.2 * sMul);
            list.push({
              partKey: 'eyeStalk',
              asset: parts.eyeStalk,
              x: ex,
              y: ey,
              lift: eyeLift,
              ro: aim,
              symDeg: 360,
              bias: eyeBias
            });
          }

          // 5. 合拢吞咽期的中央鼓动包盖（symDeg: 45，填实 8 瓣顶缝并随消化节奏鼓动）
          if (curl > 0.58 && state.digestPulse > 0.08) {
            const bulgeLift = (1.8 + state.digestPulse * 2.4) * sMul;
            list.push({
              partKey: 'digestBulge',
              asset: parts.digestBulge,
              x: state.x,
              y: state.y,
              lift: bulgeLift,
              ro: state.yaw,
              symDeg: 45,
              bias: 0.95
            });
          }

          // 6. 演示配角：来喝水的小动物（仅 patrol 接近/低头/惊跳/被包瞬间显示）
          const pr = state.prey;
          if (pr.active) {
            const bodyLift = pr.hopZ;
            const headFwd = (3.4 + pr.headDip * 1.1) * sMul;
            const headLift = Math.max(0.2, bodyLift + (2.4 - pr.headDip * 1.7) * sMul);
            const [phx, phy] = localToWorldXY(pr.x, pr.y, pr.yaw, 0, headFwd);
            const preyBias = state.mode === 'strike' ? 0.15 : 1.15;

            list.push({
              partKey: 'preyBody',
              asset: parts.preyBody,
              x: pr.x,
              y: pr.y,
              lift: bodyLift,
              ro: pr.yaw,
              symDeg: 360,
              bias: preyBias
            });
            list.push({
              partKey: 'preyHead',
              asset: parts.preyHead,
              x: phx,
              y: phy,
              lift: headLift,
              ro: pr.yaw,
              symDeg: 360,
              bias: preyBias + 0.25
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Sand6MiragePoolDef.id,
            code: Sand6MiragePoolDef.code,
            name: Sand6MiragePoolDef.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            flapCount: NUM_FLAPS,
            footRadius: Sand6MiragePoolDef.footRadius,
            headZ: 10,
            centerZ: 3,
            blocks: Sand6MiragePoolDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sand6MiragePoolDef);
})(window.PixelWorkshop);
