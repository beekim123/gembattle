'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { solveIK2D, SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 沙8 · 敲开盐壳的大螯（M09 横行变体标杆：90° 侧向六足横行 + 极端不对称双螯）
  //
  // 【结构与坐标预算】
  //   - 正面朝向 +Y（眼柄、口器、双螯朝前警戒），实际移动始终垂直于朝向（±90° 横蹿）；
  //   - 扁宽六棱盐壳硬甲 carapace（22×16×10）+ 深暗红甲缝与甲裙；
  //   - 右侧巨型盐晶锤螯：hammerArm（10×12×9）+ hammerHead（15×17×12，宽度近半个身子）；
  //   - 左侧细长精巧镊螯：tweezerArm（7×11×7）+ tweezerTip（7×12×6）；
  //   - 双侧独立眼柄 eyeStalk（5×6×7，亮黑眼珠 + 锐利反色，零自亮防糊）；
  //   - 6 条深珊瑚红三段硬壳步足（legCoxaFemur 6×9×7 / legKneeTibia 6×9×8 / legTarsus 5×8×7）；
  //   - 夹虫演示小件 brineBug（5×6×4，鲜红盐水小虫）；
  //   - 含巨螯总跨度约 41~44 格；调色板 33 色（<= 48 色）、0 重色、0 自亮、0 常态缩放拉伸。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 粉白厚盐壳背甲（带微粉暖调，避免惨白融入盐湖）
      shellDark:   '#b8949e',
      shellMid:    '#e6cdd3',
      shellHi:     '#faf0f2',
      // 背甲结晶盐棱与锤头白晶镶边
      crystalDark: '#9cb0bd',
      crystalMid:  '#d4e5ed',
      crystalHi:   '#f5fcff',
      // 深暗红 / 紫褐甲缝与腹底护裙（在白色盐湖上切出清晰轮廓）
      seamDark:    '#3b1522',
      seamMid:     '#632539',
      seamHi:      '#8f3d56',
      // 巨型锤螯主壳（高饱和深珊瑚玫红）
      hammerDark:  '#8a1c3b',
      hammerMid:   '#cf345d',
      hammerHi:    '#f56e8f',
      // 重锤打击面（高对比亮玫红 / 珊瑚橙，砸壳瞬间极具辨识度）
      strikeDark:  '#c4322b',
      strikeMid:   '#f25c49',
      strikeHi:    '#ff9b73',
      // 深珊瑚红步足与细长镊螯主甲
      limbDark:    '#6e1a2e',
      limbMid:     '#ab2e49',
      limbHi:      '#db5c74',
      // 步足与螯臂关节软膜（暗紫褐高对比分节）
      jointDark:   '#2c1421',
      jointMid:    '#4f243b',
      jointHi:     '#7d4261',
      // 镊螯内刃与步足爪尖（粉白钙化硬尖）
      tipDark:     '#9e737c',
      tipMid:      '#d6aeb6',
      tipHi:       '#f7e4e8',
      // 口器凹槽（受保护不加暗缝）
      mouthDark:   '#260c14',
      mouthMid:    '#4d1b2a',
      mouthHi:     '#752d42',
      // 眼柄亮黑眼珠（严禁放进 glowKeys）
      eyeDark:     '#09070d',
      eyeIris:     '#241c30',
      eyeSpec:     '#eef8ff',
      // 盐壳下蹦出的鲜红小虫
      bugDark:     '#8c0f1b',
      bugMid:      '#d92133',
      bugHi:       '#ff6b78'
    },
    glowKeys: [],
    parts: [
      'shell', 'crystal', 'seam', 'hammer', 'strike',
      'limb', 'joint', 'tip', 'mouth', 'eye', 'bug'
    ],
    noCrease: [
      ['shell', 'crystal'],
      ['shell', 'seam'],
      ['hammer', 'strike'],
      ['hammer', 'crystal'],
      ['limb', 'joint'],
      ['limb', 'tip'],
      ['shell', 'mouth'],
      ['limb', 'eye'],
      ['joint', 'eye']
    ],
    materials: {
      shell:   ['shellDark',   'shellMid',   'shellHi'],
      crystal: ['crystalDark', 'crystalMid', 'crystalHi'],
      seam:    ['seamDark',    'seamMid',    'seamHi'],
      hammer:  ['hammerDark',  'hammerMid',  'hammerHi'],
      strike:  ['strikeDark',  'strikeMid',  'strikeHi'],
      limb:    ['limbDark',    'limbMid',    'limbHi'],
      joint:   ['jointDark',   'jointMid',   'jointHi'],
      tip:     ['tipDark',     'tipMid',     'tipHi'],
      mouth:   ['mouthDark',   'mouthMid',   'mouthHi'],
      bug:     ['bugDark',     'bugMid',     'bugHi']
    },
    protectedParts: ['eye', 'mouth']
  });

  // 3 套零重建模换色皮肤（高对比轮廓，均适配白色盐壳湖）
  const SKINS = [
    {
      id: 'rose_hammer',
      name: '粉盐玫红锤（经典）',
      dot: '#cf345d',
      outline: '#1f0b14',
      pal: {},
      fx: {
        crackColor: '#a89691',
        crackDark:  '#3a1e28',
        wetColor:   '#e87a98',
        wetDark:    '#b84b6b',
        wetHi:      '#ffd4e0',
        saltA:      '#faf5f2',
        saltB:      '#dfd2ce',
        bugA:       '#e62236',
        bugB:       '#ff6673'
      }
    },
    {
      id: 'amethyst_hammer',
      name: '白晶绛紫锤（盐礁款）',
      dot: '#7d2a8c',
      outline: '#170a21',
      pal: {
        shellDark:   '#9aa4b5', shellMid:   '#ced8e6', shellHi:   '#f2f7fc',
        crystalDark: '#7b8eb8', crystalMid: '#b5c8eb', crystalHi: '#e8f1ff',
        seamDark:    '#28143b', seamMid:    '#4b246b', seamHi:    '#74409c',
        hammerDark:  '#58196e', hammerMid:  '#8f2ea8', hammerHi:  '#c663de',
        strikeDark:  '#941b59', strikeMid:  '#d43782', strikeHi:  '#ff7ab8',
        limbDark:    '#431654', limbMid:    '#702887', limbHi:    '#a152ba',
        jointDark:   '#21102e', jointMid:   '#3e2054', jointHi:   '#663e85',
        tipDark:     '#807094', tipMid:     '#b8a8cc', tipHi:     '#ebe2f5',
        mouthDark:   '#1c0a26', mouthMid:   '#3b184d', mouthHi:   '#5e2c75'
      },
      fx: {
        crackColor: '#9c98a8',
        crackDark:  '#2e1c3b',
        wetColor:   '#e87a98',
        wetDark:    '#ad4978',
        wetHi:      '#ffd6ea',
        saltA:      '#f5f8fc',
        saltB:      '#ccd6e6',
        bugA:       '#e82538',
        bugB:       '#ff6b7a'
      }
    },
    {
      id: 'ochre_hammer',
      name: '赭卤金橙锤（浓卤款）',
      dot: '#d9661e',
      outline: '#21100a',
      pal: {
        shellDark:   '#b5927a', shellMid:   '#e3c6b1', shellHi:   '#faece1',
        crystalDark: '#a69883', crystalMid: '#d9ccb4', crystalHi: '#f7f1e1',
        seamDark:    '#421c10', seamMid:    '#6e301b', seamHi:    '#9c4c30',
        hammerDark:  '#943510', hammerMid:  '#d6591e', hammerHi:  '#fa8c48',
        strikeDark:  '#bd4b0d', strikeMid:  '#f07d1a', strikeHi:  '#ffba4a',
        limbDark:    '#702412', limbMid:    '#ad3d21', limbHi:    '#db6b48',
        jointDark:   '#33170d', jointMid:   '#592c1b', jointHi:   '#854a32',
        tipDark:     '#9e826c', tipMid:     '#d4ba9e', tipHi:     '#f5e7d5',
        mouthDark:   '#2b1008', mouthMid:   '#522112', mouthHi:   '#7a3620'
      },
      fx: {
        crackColor: '#ad9a8c',
        crackDark:  '#3d2116',
        wetColor:   '#e87a98',
        wetDark:    '#bd526d',
        wetHi:      '#ffd9e0',
        saltA:      '#faf4eb',
        saltB:      '#dfd1bf',
        bugA:       '#e62030',
        bugB:       '#ff6470'
      }
    }
  ];

  // =========================================================================
  // 1. 扁宽盐壳硬甲背甲（22×16×10，严格左右对称省半数缓存）
  //    带结晶菱面、深暗红甲缝与锯齿侧棘，正面 +Y 带口器凹槽
  // =========================================================================
  function buildCarapace(makeCanvas) {
    const W = 22, D = 16, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-10.5, 10.5, -7.5, 7.5, 0, H - 1, (x, y, z, X, Y) => {
      const absX = Math.abs(X);
      // 六棱扁宽硬甲轮廓（宽 20.5、长 14.0，棱角分明区别于圆螃蟹）
      const ax = absX / 10.0;
      const ay = Math.abs(Y + 0.3) / 6.6;
      const hex = Math.max(ax * 0.88 + ay * 0.48, ay * 0.96, Math.hypot(ax, ay) * 0.92);
      const archZ = (z - 4.0) / 4.2;
      const d = Math.hypot(hex, archZ * 0.92) - 1.0;
      if (d > 0 || z < 1) return;

      // 前缘正中口器凹槽（用于接应左镊螯送来的鲜红小虫）
      if (Y > 4.4 && absX <= 2.3 && z >= 1 && z <= 4) {
        m.setRaw(x, y, z, mat('mouth'), partId.mouth);
        return;
      }

      // 底部厚重深暗红甲裙（遮护步足髋关节并在白色盐湖上压出重轮廓）
      if (z <= 2 || hex > 0.86) {
        m.setRaw(x, y, z, mat('seam'), partId.seam);
        return;
      }

      // 背甲结晶几何甲缝：一条中纵沟 + 两条斜向菱形甲缝
      const diagSeam = Math.abs(Math.abs(Y - 0.6) - absX * 0.42) < 0.58 && absX > 1.8 && absX < 8.4;
      const centerSeam = absX < 0.55 && Y > -4.8 && Y < 4.5 && z >= 6;
      const rearSeam = Math.abs(Y + 3.2 - absX * 0.12) < 0.55 && absX < 7.2;

      if (z >= 5 && (diagSeam || centerSeam || rearSeam)) {
        m.setRaw(x, y, z, mat('seam'), partId.seam);
      } else if (z >= 7 && (absX > 2.2 && absX < 6.4 && Math.abs(Y - 0.2) < 2.4)) {
        // 背甲顶面两块微凸白盐晶菱面
        m.setRaw(x, y, z, mat('crystal'), partId.crystal);
      } else {
        m.setRaw(x, y, z, mat('shell'), partId.shell);
      }
    });

    // 背甲两侧结晶锯齿盐棘 + 后缘双盐棱（左右对称）
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 7.8,  2.8, 4.4, s * 10.2,  3.8, 5.2, 1.15, 0.55, mat('seam'), partId.seam, true);
      m.paintCapsule(s * 8.4, -0.4, 4.4, s * 10.6, -0.8, 5.0, 1.10, 0.55, mat('crystal'), partId.crystal, true);
      m.paintCapsule(s * 6.8, -4.0, 4.0, s * 8.8,  -5.4, 4.6, 1.05, 0.55, mat('seam'), partId.seam, true);
      // 背甲顶面成对斜向结晶盐脊
      m.paintCapsule(s * 2.2, 2.2, 7.6, s * 5.4, -1.6, 7.2, 1.15, 0.75, mat('crystal'), partId.crystal, true);
    }
    // 中央盐晶顶棱
    m.paintCapsule(0, -1.2, 7.8, 0, -4.4, 6.8, 1.25, 0.72, mat('crystal'), partId.crystal, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.5, headZ: 10, centerZ: 4 });
  }

  // =========================================================================
  // 2. 独立眼柄 + 亮黑眼珠（5×6×7，左右对称复用，枢轴锁在根部 (0, -1.5)）
  // =========================================================================
  const EYE_PIVOT = { x: 0, y: -1.5 };
  function buildEyeStalk(makeCanvas) {
    const W = 5, D = 6, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 深红短眼柄斜上前伸
    m.paintCapsule(0, -1.5, 1.2, 0, 0.9, 4.2, 0.95, 0.82, mat('limb'), partId.limb, true);
    m.paintEllipsoid(0, -1.5, 1.3, 1.05, 1.05, 0.95, mat('joint'), partId.joint, false);

    m.despeckle();
    m.applyArtShading(true);

    // 末端 2×2 亮黑复眼珠 + 单像素锐利反色（eyeSpec 严禁进 glowKeys）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const cx = Math.round(hw), cy = Math.round(hd + 1.2);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = 0; dy <= 1; dy++) {
        for (let dz = 4; dz <= 6; dz++) {
          if (Math.abs(dx) === 1 && dz === 6) continue;
          const isSpec = (dx === 0 && dy === 1 && dz === 6);
          const isIris = (dy === 1 && dz === 5);
          const kid = isSpec ? keyToId.eyeSpec : (isIris ? keyToId.eyeIris : keyToId.eyeDark);
          m.setRaw(cx + dx, cy + dy, dz, kid, partId.eye);
        }
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 1.8, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 3. 巨型盐晶锤螯（右螯）：分粗壮螯臂 hammerArm + 巨大钝方盐晶锤头 hammerHead
  // =========================================================================
  const HAMMER_ARM_PIVOT  = { x: -2.0, y: -3.4 };
  const HAMMER_HEAD_PIVOT = { x: -2.2, y: -5.4 };

  function buildHammerArm(makeCanvas) {
    const W = 10, D = 12, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    // 肩部深暗关节球（深嵌右前甲缘）
    m.paintEllipsoid(-2.0, -3.4, 3.6, 2.0, 2.0, 1.9, mat('joint'), partId.joint, true);
    // 粗壮右螯臂（向外前拱起，承托沉重锤头）
    m.paintCapsule(-1.8, -3.2, 3.6, 1.4, 0.8, 4.6, 2.25, 2.55, mat('limb'), partId.limb, true);
    m.paintCapsule(1.4, 0.8, 4.6, 0.6, 4.0, 4.2, 2.45, 2.25, mat('hammer'), partId.hammer, true);
    // 外侧护甲盐晶棱
    m.paintCapsule(2.6, -0.4, 5.6, 2.4, 3.4, 5.8, 1.05, 0.85, mat('crystal'), partId.crystal, false);
    m.paintEllipsoid(0.6, 4.2, 4.2, 1.85, 1.85, 1.75, mat('joint'), partId.joint, false);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 8, centerZ: 4 });
  }

  function buildHammerHead(makeCanvas) {
    // 宽度 15、长度 17、高度 12 —— 接近半个身子宽的巨大钝方盐晶锤头！
    const W = 15, D = 17, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-6.8, 6.8, -7.8, 7.8, 0, H - 1, (x, y, z, X, Y) => {
      // 1) 腕部厚实连接柄（[-2.2, -5.4] 附近）
      const dWrist = (Math.hypot((X + 2.0) / 2.8, (Y + 5.2) / 3.0, (z - 4.4) / 2.8) - 1.0) * 3.0;

      // 2) 主体钝方重锤块（厚重、方正、外端略膨大）
      const bx = Math.abs(X - 0.5) / 5.4;
      const by = Math.abs(Y - 1.0) / 6.0;
      const bz = Math.abs(z - 5.2) / 4.2;
      // 用高次范数造出厚重钝方锤感
      const dBlock = (Math.pow(bx * bx * bx * bx + by * by * by * by + bz * bz * bz * bz, 0.25) - 1.0) * 4.8;

      // 3) 前端膨大重锤打击面（Y > 4.2，宽厚方平）
      const sx = Math.abs(X - 0.6) / 6.0;
      const sy = Math.abs(Y - 5.2) / 2.4;
      const sz = Math.abs(z - 4.8) / 4.4;
      const dFace = (Math.pow(sx * sx * sx * sx + sy * sy * sy * sy + sz * sz * sz * sz, 0.25) - 1.0) * 3.2;

      const d = smin(smin(dWrist, dBlock, 1.4), dFace, 1.2);
      if (d > 0 || z < 1) return;

      // 材质分区：
      // - 亮玫红 / 珊瑚橙重锤打击面（前额与下沿砸击区）
      if (Y >= 3.2 || (Y >= 1.5 && z <= 3)) {
        // 打击面外沿留 1 格结晶白边，强化俯视边界
        if (z >= 8 && Math.abs(X - 0.5) < 3.6 && Y < 5.8) {
          m.setRaw(x, y, z, mat('crystal'), partId.crystal);
        } else {
          m.setRaw(x, y, z, mat('strike'), partId.strike);
        }
        return;
      }
      // - 腕关节暗紫褐软膜
      if (Y < -4.2 && X < 0.2) {
        m.setRaw(x, y, z, mat('joint'), partId.joint);
        return;
      }
      // - 锤背与外棱镶嵌厚重白盐晶棱
      const onCrystalRidge = (z >= 8 && Math.abs(X - 0.8) < 2.6 && Y > -2.5) ||
                             (X >= 4.4 && z >= 5 && Y > -2.0 && Y < 3.4);
      if (onCrystalRidge) {
        m.setRaw(x, y, z, mat('crystal'), partId.crystal);
      } else if (z <= 2) {
        m.setRaw(x, y, z, mat('seam'), partId.seam);
      } else {
        m.setRaw(x, y, z, mat('hammer'), partId.hammer);
      }
    });

    // 锤背突出 3 簇结晶盐棱（一眼看出“盐晶重锤”）
    m.paintCapsule(0.8, 1.4, 8.6, 1.4, 2.2, 10.8, 1.55, 0.85, mat('crystal'), partId.crystal, true);
    m.paintCapsule(3.6, -0.6, 7.6, 5.2, -0.2, 9.6, 1.25, 0.65, mat('crystal'), partId.crystal, true);
    m.paintCapsule(-2.2, 0.6, 7.8, -3.2, 1.4, 9.4, 1.15, 0.60, mat('crystal'), partId.crystal, true);

    // 内侧短粗辅助指（保留甲壳螯结构特征，但远小于巨大重锤主头）
    m.paintCapsule(-3.4, -1.6, 3.6, -5.0, 2.6, 3.4, 1.35, 0.85, mat('limb'), partId.limb, true);
    m.paintCapsule(-5.0, 2.6, 3.4, -3.6, 5.2, 3.2, 0.85, 0.55, mat('tip'), partId.tip, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 7.4, headZ: 11, centerZ: 5 });
  }

  // =========================================================================
  // 4. 细长精巧镊螯（左螯）：tweezerArm + tweezerTip（与巨型右锤形成极端不对称）
  // =========================================================================
  const TWEEZER_ARM_PIVOT = { x: 1.0, y: -3.6 };
  const TWEEZER_TIP_PIVOT = { x: 0.0, y: -4.6 };

  function buildTweezerArm(makeCanvas) {
    const W = 7, D = 11, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(1.0, -3.6, 3.0, 1.35, 1.35, 1.3, mat('joint'), partId.joint, true);
    m.paintCapsule(1.0, -3.4, 3.0, -0.8, 0.2, 3.4, 1.25, 1.05, mat('limb'), partId.limb, true);
    m.paintCapsule(-0.8, 0.2, 3.4, 0.0, 3.8, 3.2, 1.05, 0.92, mat('limb'), partId.limb, true);
    m.paintEllipsoid(0.0, 3.8, 3.2, 1.05, 1.05, 1.0, mat('joint'), partId.joint, false);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5, headZ: 6, centerZ: 3 });
  }

  function buildTweezerTip(makeCanvas, closed) {
    const W = 7, D = 12, H = 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const spread = closed ? 0.65 : 1.75;
    // 纤细镊掌
    m.paintCapsule(0, -4.6, 2.8, 0, -1.2, 2.8, 1.05, 1.15, mat('limb'), partId.limb, true);
    // 细长双指镊尖（深珊瑚红外侧 + 粉白精巧内刃）
    m.paintCapsule(-0.6, -1.2, 2.8, -spread, 3.8, 2.4, 0.78, 0.45, mat('limb'), partId.limb, true);
    m.paintCapsule( 0.6, -1.2, 2.8,  spread, 3.8, 2.4, 0.78, 0.45, mat('limb'), partId.limb, true);
    m.paintCapsule(-spread, 3.4, 2.4, -spread * 0.45, 5.2, 2.1, 0.46, 0.35, mat('tip'), partId.tip, true);
    m.paintCapsule( spread, 3.4, 2.4,  spread * 0.45, 5.2, 2.1, 0.46, 0.35, mat('tip'), partId.tip, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 5, centerZ: 3 });
  }

  // =========================================================================
  // 5. 6 条深珊瑚红三段硬壳步足（全部左右对称，沿 +Y 指向足尖）
  // =========================================================================
  function buildLegCoxaFemur(makeCanvas) {
    const W = 6, D = 9, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, -3.0, 2.2, 1.35, 1.35, 1.25, mat('joint'), partId.joint, true);
    m.paintCapsule(0, -2.8, 2.2, 0, 2.8, 4.8, 1.35, 1.18, mat('limb'), partId.limb, true);
    // 腿背细盐晶亮棱，俯视极清晰
    m.paintCapsule(0, -1.8, 3.1, 0, 2.6, 5.4, 0.58, 0.52, mat('tip'), partId.tip, false);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 6, centerZ: 3 });
  }

  function buildLegKneeTibia(makeCanvas) {
    const W = 6, D = 9, H = 8;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, -2.2, 5.4, 1.45, 1.45, 1.35, mat('joint'), partId.joint, true);
    m.paintCapsule(0, -2.0, 5.2, 0, 2.4, 1.8, 1.18, 0.96, mat('limb'), partId.limb, true);
    m.paintEllipsoid(0, 2.3, 1.8, 1.0, 1.0, 0.95, mat('joint'), partId.joint, false);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 7, centerZ: 3 });
  }

  function buildLegTarsus(makeCanvas) {
    const W = 5, D = 8, H = 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -1.6, 4.4, 0, 0.6, 2.0, 0.96, 0.72, mat('limb'), partId.limb, true);
    m.paintCapsule(0, 0.5, 2.0, 0, 2.0, 0.5, 0.72, 0.42, mat('tip'), partId.tip, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.6, headZ: 6, centerZ: 2 });
  }

  // =========================================================================
  // 6. 盐壳下鲜红小虫（5×6×4，左镊螯夹起送口时在镊尖短暂可见）
  // =========================================================================
  function buildBrineBug(makeCanvas) {
    const W = 5, D = 6, H = 4;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, -1.6, 1.8, 0, 1.6, 1.8, 0.95, 0.85, mat('bug'), partId.bug, true);
    m.paintEllipsoid(0, 0, 2.2, 1.1, 1.4, 0.95, mat('bug'), partId.bug, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.4, headZ: 3, centerZ: 2 });
  }

  // =========================================================================
  // 7. 专用 90° 侧向六足横行步态求解器（左右两组波浪交替扒地横移）
  //    - 0 组：L1 + R2 + L3，1 组：R1 + L2 + R3（180° 反相）
  //    - 同组内前/中/后带微小相位错落（0.00 / 0.08 / 0.16），模拟招潮蟹波浪横蹿
  //    - 落点前探严格沿实时横行速度方向（垂直于 yaw），支撑期钉地零滑冰
  // =========================================================================
  const SIDE_LEG_SPECS = [
    { id: 'L1', side: -1, group: 0, waveOff: 0.00, hipX: -8.0, hipY:  2.4, hipZ: 3.4, restX: -14.8, restY:  6.4, L1: 5.4, L2: 6.2 },
    { id: 'R1', side:  1, group: 1, waveOff: 0.00, hipX:  8.0, hipY:  2.4, hipZ: 3.4, restX:  14.8, restY:  6.4, L1: 5.4, L2: 6.2 },
    { id: 'L2', side: -1, group: 1, waveOff: 0.08, hipX: -8.6, hipY: -1.2, hipZ: 3.3, restX: -16.0, restY: -1.2, L1: 5.6, L2: 6.4 },
    { id: 'R2', side:  1, group: 0, waveOff: 0.08, hipX:  8.6, hipY: -1.2, hipZ: 3.3, restX:  16.0, restY: -1.2, L1: 5.6, L2: 6.4 },
    { id: 'L3', side: -1, group: 0, waveOff: 0.16, hipX: -7.6, hipY: -4.6, hipZ: 3.2, restX: -14.2, restY: -8.4, L1: 5.4, L2: 6.2 },
    { id: 'R3', side:  1, group: 1, waveOff: 0.16, hipX:  7.6, hipY: -4.6, hipZ: 3.2, restX:  14.2, restY: -8.4, L1: 5.4, L2: 6.2 }
  ];

  class SidewaysHexGait {
    constructor(specs) {
      this.gaitPhase = 0;
      this.idleTime = 0;
      this.legs = specs.map((s, idx) => ({
        ...s,
        index: idx,
        phaseOff: (s.group ? 0.50 : 0.00) + s.waveOff,
        footX: s.restX,
        footY: s.restY,
        footZ: 0,
        startX: s.restX,
        startY: s.restY,
        stepping: false,
        stepT: 0,
        isSettling: false,
        hipWX: s.hipX,
        hipWY: s.hipY,
        hipWZ: s.hipZ,
        kneeX: s.restX,
        kneeY: s.restY,
        kneeZ: 4.0,
        justLanded: false
      }));
    }

    reset(bx, by, byaw, sMul = 1.0) {
      this.gaitPhase = 0;
      this.idleTime = 0;
      for (const leg of this.legs) {
        const [rx, ry] = localToWorldXY(bx, by, byaw, leg.restX * sMul, leg.restY * sMul);
        const [hx, hy] = localToWorldXY(bx, by, byaw, leg.hipX * sMul, leg.hipY * sMul);
        leg.hipWX = hx; leg.hipWY = hy; leg.hipWZ = leg.hipZ * sMul;
        leg.footX = leg.startX = rx;
        leg.footY = leg.startY = ry;
        leg.footZ = 0;
        leg.stepping = false;
        leg.stepT = 0;
        leg.isSettling = false;
        leg.justLanded = false;
      }
    }

    update(dt, bx, by, bz, byaw, vx, vy, yawRate, opts = {}) {
      const sMul = opts.scaleMul ?? 1.0;
      const stepFreq = opts.stepFreq ?? 1.0;
      const stepHeight = (opts.stepHeight ?? 2.2) * sMul;
      const moveSpd = Math.hypot(vx, vy);
      const isMoving = moveSpd > 1.2 || Math.abs(yawRate) > 0.25;
      const landed = [];

      if (isMoving) this.idleTime = 0;
      else this.idleTime += dt;

      // 横行步频：速度越快扒地越疾，单步跨距约 6.4 格
      const strideLen = 6.4 * sMul;
      if (isMoving) {
        const dPhase = ((moveSpd / strideLen) + Math.abs(yawRate) * 0.28) * dt * clamp(stepFreq, 0.45, 2.2);
        this.gaitPhase = (this.gaitPhase + dPhase) % 1;
      }

      const swingFrac = 0.44; // 占空比 0.56，保证交接瞬间双组同时着地不浮空
      const reachHalf = 2.6 * sMul;
      const maxFromIdeal = 3.8 * sMul;
      const settleThr = 0.75 * sMul;
      const moveDirX = moveSpd > 0.2 ? vx / moveSpd : Math.cos(byaw);
      const moveDirY = moveSpd > 0.2 ? vy / moveSpd : Math.sin(byaw);
      const speedRatio = clamp(moveSpd / 16.0, 0.28, 1.12);

      // 停步收足时按组收拢
      let activeSettleGroup = -1;
      for (const l of this.legs) {
        if (l.isSettling && l.stepping) { activeSettleGroup = l.group; break; }
      }
      if (!isMoving && this.idleTime > 0.12 && activeSettleGroup < 0) {
        let g0 = 0, g1 = 0;
        for (const l of this.legs) {
          const [ix, iy] = localToWorldXY(bx, by, byaw, l.restX * sMul, l.restY * sMul);
          const d = Math.hypot(ix - l.footX, iy - l.footY);
          if (l.group === 0) g0 = Math.max(g0, d);
          else g1 = Math.max(g1, d);
        }
        if (g0 > settleThr || g1 > settleThr) activeSettleGroup = g0 >= g1 ? 0 : 1;
      }

      let rollSum = 0;
      let liftSum = 0;

      for (const leg of this.legs) {
        leg.justLanded = false;
        const [hx, hy] = localToWorldXY(bx, by, byaw, leg.hipX * sMul, leg.hipY * sMul);
        const hz = bz + leg.hipZ * sMul;
        leg.hipWX = hx; leg.hipWY = hy; leg.hipWZ = hz;

        const [idealX, idealY] = localToWorldXY(bx, by, byaw, leg.restX * sMul, leg.restY * sMul);

        if (isMoving) {
          leg.isSettling = false;
          const phi = (this.gaitPhase + leg.phaseOff) % 1;
          const wantSwing = phi < swingFrac;
          // 关键：落点前探严格沿着实时侧向横行速度方向！
          const landX = idealX + moveDirX * reachHalf * speedRatio;
          const landY = idealY + moveDirY * reachHalf * speedRatio;

          if (wantSwing) {
            if (!leg.stepping) {
              leg.stepping = true;
              leg.startX = leg.footX;
              leg.startY = leg.footY;
            }
            const u = clamp(phi / swingFrac, 0, 1);
            leg.stepT = u;
            const s = u * u * (3 - 2 * u);
            leg.footX = lerp(leg.startX, landX, s);
            leg.footY = lerp(leg.startY, landY, s);
            leg.footZ = Math.pow(Math.sin(u * Math.PI), 0.82) * stepHeight * (0.65 + 0.35 * speedRatio);
            liftSum += leg.footZ;
            rollSum -= leg.side * Math.sin(u * Math.PI) * 0.28;
          } else {
            if (leg.stepping) {
              leg.stepping = false;
              leg.stepT = 1;
              leg.footX = landX;
              leg.footY = landY;
              leg.footZ = 0;
              leg.justLanded = true;
              landed.push(leg);
            } else {
              leg.footZ = 0;
            }
            // 支撑期钉地并限制最大偏离防交叉
            const dId = Math.hypot(leg.footX - idealX, leg.footY - idealY);
            if (dId > maxFromIdeal && dId > 0.001) {
              const k = maxFromIdeal / dId;
              leg.footX = idealX + (leg.footX - idealX) * k;
              leg.footY = idealY + (leg.footY - idealY) * k;
            }
          }
        } else {
          if (leg.stepping && !leg.isSettling) {
            leg.isSettling = true;
            leg.stepT = 0.25;
            leg.startX = leg.footX;
            leg.startY = leg.footY;
          }
          const dId = Math.hypot(leg.footX - idealX, leg.footY - idealY);
          if (!leg.stepping && this.idleTime > 0.12 && activeSettleGroup === leg.group && dId > settleThr) {
            leg.stepping = true;
            leg.isSettling = true;
            leg.stepT = 0;
            leg.startX = leg.footX;
            leg.startY = leg.footY;
          }
          if (leg.stepping && leg.isSettling) {
            leg.stepT += dt / 0.15;
            if (leg.stepT >= 1) {
              leg.stepping = false;
              leg.isSettling = false;
              leg.stepT = 1;
              leg.footX = idealX;
              leg.footY = idealY;
              leg.footZ = 0;
              leg.justLanded = true;
              landed.push(leg);
            } else {
              const u = leg.stepT;
              const s = u * u * (3 - 2 * u);
              leg.footX = lerp(leg.startX, idealX, s);
              leg.footY = lerp(leg.startY, idealY, s);
              leg.footZ = Math.sin(u * Math.PI) * stepHeight * 0.55;
            }
          } else {
            leg.footZ = 0;
          }
        }

        // 2-Bone 高拱折角膝盖 IK
        const dx = leg.footX - leg.hipWX;
        const dy = leg.footY - leg.hipWY;
        const horiz = Math.hypot(dx, dy) || 0.001;
        const ik = solveIK2D(0, leg.hipWZ, horiz, leg.footZ, leg.L1 * sMul, leg.L2 * sMul, 1);
        const ratio = ik.kx / horiz;
        leg.kneeX = leg.hipWX + dx * ratio;
        leg.kneeY = leg.hipWY + dy * ratio;
        leg.kneeZ = Math.max(1.2 * sMul, ik.kz);
      }

      return { landed, rollSum, liftSum };
    }
  }

  // =========================================================================
  // 8. 节奏与行为常量（用于 M09 横行变体标杆红线）
  // =========================================================================
  const SIDE_SPEED     = 17.5;  // 90° 横行基准移速（格/秒）
  const LISTEN_DUR     = 0.78;  // 急停贴壳倾听时长（秒，落在 0.6~1.0s）
  const WINDUP_DUR     = 0.56;  // 巨型锤螯高扬蓄力时长（秒）
  const STRIKE_DUR     = 0.30;  // 重锤砸壳下落与震动回弹时长（秒）
  const PICK_COUNT     = 3;     // 砸开后左镊螯连续夹虫次数
  const PICK_ONE_DUR   = 0.64;  // 单次夹虫送口时长（秒）
  const PICK_TOTAL_DUR = PICK_COUNT * PICK_ONE_DUR; // 1.92s

  const Sand8HammerClawDef = {
    id: 'sand8_hammer_claw',
    code: '沙8',
    name: '敲开盐壳的大螯',
    status: 'done',
    tag: 'M09 横行变体 · 巨锤砸盐壳 + 镊螯夹虫',
    summary: '中体型盐壳湖横行甲壳兽：扁宽六棱粉白盐壳硬甲配深暗红甲缝、6 条深珊瑚红步足 90° 侧向波浪横蹿、右螯极度放大成亮玫红盐晶重锤、左螯细长如镊；横行停步贴壳倾听，举锤重砸裂开盐洞渗出粉红盐水并夹食蹦出的鲜红小虫',
    defaultHabitat: 'saltlake',
    footRadius: 14.5,
    ecoWeight: 1.25,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '90° 侧向六足波浪横行步态（移动严格垂直于朝向）',
      '极端不对称双螯（巨型盐晶重锤右螯 + 细长双指左镊螯）',
      '听壳 → 举锤蓄力 → 重砸裂洞渗粉红盐水 → 3 连镊螯夹虫',
      '地表痕迹层 crack 裂洞 + #e87a98 粉红 wet 盐水双层留痕',
      '独立转动亮黑眼柄与 3 套高对比盐壳换色皮肤'
    ],
    soulHabit: '朝向始终侧对警戒，六足波浪交替以 90° 侧向横蹿；突然急停压低身子贴壳倾听，巨型右锤螯高高扬起蓄力后猛然砸碎盐壳，地表裂出碎洞并渗出粉红盐水、蹦出鲜红小虫，细长左镊螯迅速探进洞里连续 3 次精准夹虫送口，再横行换往下一处',
    actions: [
      { id: 'patrol', name: '自由巡游（横行 → 听壳 → 砸洞 → 夹虫）', loop: true,  status: 'done' },
      { id: 'idle',   name: '原地待机（警戒横摆 + 举锤威吓 + 转眼）',  loop: true,  status: 'done' },
      { id: 'smash',  name: '抡锤砸壳（连续演示蓄力砸洞与镊螯夹虫）',  loop: false, duration: 6.2, status: 'done' }
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
        carapace:         buildCarapace(makeCanvas),
        eyeStalk:         buildEyeStalk(makeCanvas),
        hammerArm:        buildHammerArm(makeCanvas),
        hammerHead:       buildHammerHead(makeCanvas),
        tweezerArm:       buildTweezerArm(makeCanvas),
        tweezerTipOpen:   buildTweezerTip(makeCanvas, false),
        tweezerTipClosed: buildTweezerTip(makeCanvas, true),
        legCoxaFemur:     buildLegCoxaFemur(makeCanvas),
        legKneeTibia:     buildLegKneeTibia(makeCanvas),
        legTarsus:        buildLegTarsus(makeCanvas),
        brineBug:         buildBrineBug(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.25;
      const seed0 = opts.seed ?? 88;

      const gait = new SidewaysHexGait(SIDE_LEG_SPECS);
      const footContacts = SIDE_LEG_SPECS.map(() => ({ x: 0, y: 0, z: 0, r: 1.8 }));

      // 弹簧阻尼器：机身高度、巨锤配重晃动、锤举高、锤臂角、锤头角、镊螯探出、双侧眼柄转角
      const bodyLiftSp   = new SpringDamper1D(3.2, 130, 13.0);
      const bodySwaySp   = new SpringDamper1D(0.0, 95, 8.5);
      const hammerLiftSp = new SpringDamper1D(0.0, 150, 12.0);
      const hammerArmSp  = new SpringDamper1D(0.0, 125, 10.5);
      const hammerHeadSp = new SpringDamper1D(0.0, 135, 10.0);
      const hammerSwaySp = new SpringDamper1D(0.0, 82, 6.8);
      const tweezerArmSp = new SpringDamper1D(0.0, 140, 11.5);
      const tweezerTipSp = new SpringDamper1D(0.0, 160, 12.5);
      const tweezerExtSp = new SpringDamper1D(0.0, 150, 12.0);
      const eyeLSp       = new SpringDamper1D(0.0, 75, 7.5);
      const eyeRSp       = new SpringDamper1D(0.0, 75, 7.5);

      const state = {
        x: hx0,
        y: hy0,
        z: 3.2,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        yawRate: 0,
        sideDir: 1, // +1 沿右侧横行，-1 沿左侧横行（移动方向始终垂直于 yaw）
        shadowScale: 0.96,
        // 状态机：scuttle | listen | windup | strike | pick | idle
        stage: 'scuttle',
        stageT: 0,
        stageDur: 3.0,
        seq: 1,
        navX: hx0 + 20,
        navY: hy0 + 4,
        strikeDone: false,
        holeX: hx0,
        holeY: hy0,
        pickIdx: 0,
        bugCarry: false,
        tweezerClosed: false,
        smashCyclesLeft: 0,
        prevAction: 'patrol',
        dustCd: 0
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      function clampSafeDisc(x, y, maxR) {
        const lim = maxR * 0.78;
        const d = Math.hypot(x, y);
        if (d > lim && d > 1e-4) {
          return [x * lim / d, y * lim / d];
        }
        return [x, y];
      }

      function pickNextScuttleTarget(maxR) {
        state.seq++;
        const r1 = hash2i(state.seq, seed0, 131);
        const r2 = hash2i(state.seq, seed0, 257);
        const r3 = hash2i(state.seq, seed0, 389);
        // 交替或随机切换左右横行方向
        state.sideDir = r1 > 0.45 ? -state.sideDir : state.sideDir;
        const curAng = Math.atan2(state.y, state.x);
        const nextAng = curAng + (state.sideDir > 0 ? 1 : -1) * lerp(1.05, 2.25, r2);
        const rad = lerp(maxR * 0.24, maxR * 0.68, r3);
        state.navX = Math.cos(nextAng) * rad;
        state.navY = Math.sin(nextAng) * rad;
      }

      function getHammerImpactWorld(sMul) {
        return localToWorldXY(state.x, state.y, state.yaw, 9.5 * sMul, 11.8 * sMul);
      }

      function emitSmashImpact(vfx, sMul) {
        const [ix, iy] = getHammerImpactWorld(sMul);
        state.holeX = ix;
        state.holeY = iy;
        const fx = curSkin.fx || SKINS[0].fx;

        if (vfx) {
          // 1) 地表碎裂盐洞（crack）
          if (typeof vfx.addDecal === 'function') {
            vfx.addDecal({
              kind: 'crack',
              x: ix,
              y: iy,
              yaw: state.yaw + (hash2i(state.seq, seed0, 503) - 0.5) * 1.2,
              rx: 6.2 * sMul,
              ry: 5.2 * sMul,
              life: 16.0,
              alpha: 0.92,
              color: fx.crackColor,
              darkColor: fx.crackDark
            });
            // 2) 渗出的粉红色浓盐水湿痕（wet，#e87a98）
            vfx.addDecal({
              kind: 'wet',
              x: ix,
              y: iy,
              yaw: state.yaw,
              rx: 8.8 * sMul,
              ry: 7.4 * sMul,
              life: 15.0,
              alpha: 0.88,
              color: fx.wetColor,
              darkColor: fx.wetDark,
              hiColor: fx.wetHi
            });
          }

          // 3) 盐水震荡涟漪
          if (typeof vfx.addRipple === 'function') {
            vfx.addRipple(ix, iy, 2.6 * sMul, 16.5 * sMul, 0.72, 1.9);
          }

          // 4) 飞溅的白色碎盐粒（12 颗）
          if (typeof vfx.spawnParticle === 'function') {
            for (let i = 0; i < 12; i++) {
              const a = (i / 12) * TAU + hash2i(state.seq + i, seed0, 607) * 0.45;
              const spd = (8 + hash2i(state.seq + i, seed0, 701) * 14) * sMul;
              vfx.spawnParticle(
                ix + Math.cos(a) * 2.0 * sMul,
                iy + Math.sin(a) * 2.0 * sMul,
                1.6 * sMul,
                Math.cos(a) * spd,
                Math.sin(a) * spd,
                (10 + hash2i(state.seq + i, seed0, 787) * 12) * sMul,
                0.42 + hash2i(state.seq + i, seed0, 853) * 0.24,
                1.25 + (i % 2) * 0.45,
                (i & 1) ? fx.saltA : fx.saltB,
                false,
                46
              );
            }
            // 5) 洞里蹦出的鲜红盐水小虫粒子（4 只）
            for (let b = 0; b < 4; b++) {
              const a = (b / 4) * TAU + 0.55;
              const spd = (4.5 + hash2i(state.seq + b, seed0, 919) * 6.0) * sMul;
              vfx.spawnParticle(
                ix + Math.cos(a) * 1.4 * sMul,
                iy + Math.sin(a) * 1.4 * sMul,
                1.4 * sMul,
                Math.cos(a) * spd,
                Math.sin(a) * spd,
                (12 + b * 2.2) * sMul,
                0.68 + b * 0.08,
                1.65,
                (b & 1) ? fx.bugA : fx.bugB,
                false,
                38
              );
            }
          }
        }

        // 重锤砸地反震脉冲
        bodyLiftSp.impulse(-16.0);
        hammerLiftSp.impulse(-22.0);
        hammerSwaySp.impulse(5.5);
      }

      function enterStage(nextStage, maxR) {
        state.stage = nextStage;
        state.stageT = 0;
        if (nextStage === 'scuttle') {
          state.seq++;
          state.stageDur = lerp(2.6, 4.1, hash2i(state.seq, seed0, 443));
          pickNextScuttleTarget(maxR);
        } else if (nextStage === 'listen') {
          state.stageDur = LISTEN_DUR;
        } else if (nextStage === 'windup') {
          state.stageDur = WINDUP_DUR;
          state.strikeDone = false;
        } else if (nextStage === 'strike') {
          state.stageDur = STRIKE_DUR;
          state.strikeDone = false;
        } else if (nextStage === 'pick') {
          state.stageDur = PICK_TOTAL_DUR;
          state.pickIdx = 0;
          state.bugCarry = false;
          state.tweezerClosed = false;
        }
      }

      const instance = {
        def: Sand8HammerClawDef,
        cachePrefix: `sand8_claw_${Math.random().toString(36).slice(2, 7)}`,
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

        reset(hx, hy, hyaw) {
          state.x = hx;
          state.y = hy;
          state.z = 3.2;
          state.vx = 0;
          state.vy = 0;
          state.yaw = hyaw;
          state.yawRate = 0;
          state.sideDir = 1;
          state.stage = 'scuttle';
          state.stageT = 0;
          state.stageDur = 2.8;
          state.strikeDone = false;
          state.holeX = hx;
          state.holeY = hy;
          state.pickIdx = 0;
          state.bugCarry = false;
          state.tweezerClosed = false;
          state.smashCyclesLeft = 0;
          state.prevAction = 'patrol';
          state.dustCd = 0;

          bodyLiftSp.x = 3.2; bodyLiftSp.v = 0;
          bodySwaySp.x = 0;   bodySwaySp.v = 0;
          hammerLiftSp.x = 0; hammerLiftSp.v = 0;
          hammerArmSp.x = 0;  hammerArmSp.v = 0;
          hammerHeadSp.x = 0; hammerHeadSp.v = 0;
          hammerSwaySp.x = 0; hammerSwaySp.v = 0;
          tweezerArmSp.x = 0; tweezerArmSp.v = 0;
          tweezerTipSp.x = 0; tweezerTipSp.v = 0;
          tweezerExtSp.x = 0; tweezerExtSp.v = 0;
          eyeLSp.x = 0;       eyeLSp.v = 0;
          eyeRSp.x = 0;       eyeRSp.v = 0;

          pickNextScuttleTarget(44);
          gait.reset(hx, hy, hyaw, 1.0);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.35, 2.0);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const speedMul = clamp(params.speed ?? 1.0, 0.35, 2.2);
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const maxR = (eco && eco.maxRadius) || 44;
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const homeYaw = (eco && eco.homeYaw) ?? hyaw0;
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');

          // 动作切换
          if (action !== state.prevAction) {
            state.prevAction = action;
            if (action === 'smash') {
              state.smashCyclesLeft = 2;
              enterStage('listen', maxR);
              state.stageDur = 0.45;
            } else if (action === 'idle') {
              state.stage = 'idle';
              state.stageT = 0;
              state.bugCarry = false;
            } else {
              enterStage('scuttle', maxR);
            }
          }

          let rawYawRate = 0;
          let targetBodyLift = 3.2 * sMul;
          let targetBodySway = 0;
          let targetHammerLift = 0.8 * sMul;
          let targetHammerArmYaw = -0.18;
          let targetHammerHeadYaw = 0.16;
          let targetHammerSway = 0;
          let targetTweezerArmYaw = 0.22;
          let targetTweezerTipYaw = -0.18;
          let targetTweezerExt = 0.0;
          let targetEyeL = Math.sin(time * 1.4) * 0.25;
          let targetEyeR = Math.cos(time * 1.2 + 0.7) * 0.25;
          state.bugCarry = false;
          state.tweezerClosed = false;

          // -----------------------------------------------------------------
          // 分支 A：原地待机（警戒横摆 + 巨螯微举威吓 + 眼柄转动）
          // -----------------------------------------------------------------
          if (action === 'idle') {
            state.stage = 'idle';
            state.stageT += dt;
            // 原地微幅侧向警戒横摆（始终保持移动垂直于朝向）
            const toHomeX = homeX - state.x;
            const toHomeY = homeY - state.y;
            const rightX = Math.cos(state.yaw);
            const rightY = Math.sin(state.yaw);
            const homeSideProj = toHomeX * rightX + toHomeY * rightY;
            const swayCmd = clamp(homeSideProj * 1.4, -5.0, 5.0) + Math.sin(time * 1.35) * 1.6;
            state.vx = rightX * swayCmd * 0.25;
            state.vy = rightY * swayCmd * 0.25;
            state.x = lerp(state.x, homeX + rightX * Math.sin(time * 1.15) * 1.8 * sMul, expSmooth(dt, 3.2));
            state.y = lerp(state.y, homeY + rightY * Math.sin(time * 1.15) * 1.8 * sMul, expSmooth(dt, 3.2));

            const yd = wrapAngle(homeYaw - state.yaw);
            const turnStep = yd * expSmooth(dt, 3.5);
            state.yaw = wrapAngle(state.yaw + turnStep);
            rawYawRate = turnStep / Math.max(dt, 0.001);

            // 周期性举起巨大右锤螯威吓（每 4.6 秒高举威吓 1.4 秒）
            const threatCy = state.stageT % 4.6;
            const threat = threatCy > 2.4 && threatCy < 3.9
              ? Math.sin(((threatCy - 2.4) / 1.5) * Math.PI)
              : 0;

            targetBodyLift = (3.1 + Math.sin(time * 2.2) * 0.25 + threat * 0.55) * sMul;
            targetBodySway = Math.sin(time * 1.15) * 0.85 * sMul;
            targetHammerLift = (1.1 + threat * 4.2 + Math.sin(time * 2.4) * 0.35) * sMul;
            targetHammerArmYaw = -0.22 - threat * 0.38 + Math.sin(time * 1.8) * 0.08;
            targetHammerHeadYaw = 0.20 + threat * 0.28;
            targetHammerSway = Math.sin(time * 2.1) * 0.16;

            targetTweezerArmYaw = 0.26 + Math.sin(time * 2.6) * 0.14;
            targetTweezerTipYaw = -0.22 - Math.sin(time * 2.6) * 0.12;
            state.tweezerClosed = Math.sin(time * 3.8) > 0.35;

            // 双眼柄独立左右转动警戒
            targetEyeL = Math.sin(time * 1.9) * 0.52;
            targetEyeR = Math.sin(time * 1.5 + 1.4) * 0.52;
          }
          // -----------------------------------------------------------------
          // 分支 B：巡游与砸壳循环（patrol / smash）
          // -----------------------------------------------------------------
          else {
            state.stageT += dt;

            if (state.stage === 'scuttle') {
              // 90° 侧向横行：实际移动矢量严格沿 sideDir * right = sideDir * (cos(yaw), sin(yaw))
              const tx = state.navX + ((eco && eco.avoidX) || 0) * 0.25;
              const ty = state.navY + ((eco && eco.avoidY) || 0) * 0.25;
              const dx = tx - state.x;
              const dy = ty - state.y;
              const dist = Math.hypot(dx, dy);

              // 目标移动方向角 moveAng；为了使 sideDir * right 对准 moveAng：
              const moveAng = Math.atan2(dy, dx);
              const desiredYaw = state.sideDir > 0 ? moveAng : wrapAngle(moveAng + Math.PI);
              const yawDiff = wrapAngle(desiredYaw - state.yaw);
              const maxTurn = 2.4 * (0.7 + speedMul * 0.3);
              const turnDelta = clamp(yawDiff, -maxTurn * dt, maxTurn * dt);
              state.yaw = wrapAngle(state.yaw + turnDelta);
              rawYawRate = turnDelta / Math.max(dt, 0.001);

              // 严格垂直于朝向 yaw 的横行单位向量
              const moveDirX = Math.cos(state.yaw) * state.sideDir;
              const moveDirY = Math.sin(state.yaw) * state.sideDir;
              // 对齐越好横蹿越快，带轻快节肢步频脉动
              const align = clamp(Math.cos(yawDiff), 0.35, 1.0);
              const pulse = 0.88 + 0.12 * Math.sin(gait.gaitPhase * TAU * 2);
              const spd = SIDE_SPEED * speedMul * align * pulse * sMul;

              state.vx = moveDirX * spd;
              state.vy = moveDirY * spd;
              let nx = state.x + state.vx * dt;
              let ny = state.y + state.vy * dt;

              const safeLim = maxR * 0.78;
              if (Math.hypot(nx, ny) > safeLim) {
                [nx, ny] = clampSafeDisc(nx, ny, maxR);
                // 到达安全边缘立即急停倾听砸壳
                enterStage('listen', maxR);
              }
              state.x = nx;
              state.y = ny;

              // 横行时带小幅重心倾斜与巨型右锤螯配重微晃
              const phaseSin = Math.sin(gait.gaitPhase * TAU);
              targetBodyLift = (3.35 + Math.abs(phaseSin) * 0.38) * sMul;
              targetBodySway = -state.sideDir * 0.85 * sMul + phaseSin * 0.45 * sMul;
              targetHammerLift = (1.35 + Math.sin(gait.gaitPhase * TAU + 0.6) * 0.55) * sMul;
              targetHammerArmYaw = -0.24 - state.sideDir * 0.14;
              targetHammerHeadYaw = 0.18 + Math.sin(gait.gaitPhase * TAU + 0.9) * 0.14 * flex;
              targetHammerSway = -state.sideDir * 0.22 + phaseSin * 0.12;
              targetTweezerArmYaw = 0.24 + state.sideDir * 0.10;
              targetTweezerTipYaw = -0.18;

              // 眼柄朝横行侧微斜观察
              targetEyeL = -state.sideDir * 0.38;
              targetEyeR = -state.sideDir * 0.32;

              // 横蹿扬起细微白盐尘
              state.dustCd -= dt;
              if (vfx && typeof vfx.spawnParticle === 'function' && state.dustCd <= 0 && spd > 6.0) {
                state.dustCd = 0.22;
                const fx = curSkin.fx || SKINS[0].fx;
                vfx.spawnParticle(
                  state.x - moveDirX * 8.0 * sMul + (Math.random() - 0.5) * 4 * sMul,
                  state.y - moveDirY * 8.0 * sMul + (Math.random() - 0.5) * 4 * sMul,
                  0.8 * sMul,
                  -moveDirX * 3.5 * sMul,
                  -moveDirY * 3.5 * sMul,
                  4.5 * sMul,
                  0.34,
                  1.1,
                  fx.saltB,
                  false,
                  22
                );
              }

              if (dist < 6.0 * sMul || state.stageT >= state.stageDur) {
                // 急停惯性：巨锤顺势微晃一下
                hammerSwaySp.impulse(state.sideDir * 3.6 * sp);
                enterStage('listen', maxR);
              }
            } else if (state.stage === 'listen') {
              // 急停压低身子贴壳倾听（0.6~1.0s）
              state.vx = 0;
              state.vy = 0;
              const u = clamp(state.stageT / Math.max(0.1, state.stageDur), 0, 1);
              const crouch = smoothstep(0, 0.35, u);
              targetBodyLift = lerp(3.2, 2.0, crouch) * sMul;
              targetBodySway = Math.sin(u * Math.PI * 3) * 0.18 * sMul;
              // 锤螯微收压低，细镊螯贴近地面感受盐壳下动静
              targetHammerLift = lerp(1.0, 0.35, crouch) * sMul;
              targetHammerArmYaw = -0.10;
              targetHammerHeadYaw = 0.24;
              targetTweezerArmYaw = 0.08;
              targetTweezerTipYaw = -0.05;
              targetTweezerExt = 0.25 * crouch;
              // 眼柄定格低垂聚焦前方盐壳
              targetEyeL = 0.16;
              targetEyeR = -0.16;

              if (state.stageT >= state.stageDur) {
                enterStage('windup', maxR);
              }
            } else if (state.stage === 'windup') {
              // 巨大右锤螯高高扬起蓄力（lift 抬高 + 关节后旋 + 机身微倾配重）
              state.vx = 0;
              state.vy = 0;
              const u = clamp(state.stageT / Math.max(0.08, state.stageDur), 0, 1);
              const e = smoothstep(0, 1, u);
              targetBodyLift = lerp(2.0, 3.6, e) * sMul;
              targetBodySway = -1.6 * e * sMul; // 身体向左侧压低配重
              targetHammerLift = lerp(0.4, 9.6, e) * sMul;
              targetHammerArmYaw = lerp(-0.10, -0.78, e);
              targetHammerHeadYaw = lerp(0.24, -0.45, e);
              targetHammerSway = -0.35 * e;
              targetTweezerArmYaw = lerp(0.08, 0.55, e);
              targetTweezerTipYaw = -0.35 * e;
              targetEyeL = 0.32 * e;
              targetEyeR = -0.22 * e;

              if (state.stageT >= state.stageDur) {
                enterStage('strike', maxR);
              }
            } else if (state.stage === 'strike') {
              // 猛然重重砸下！落地瞬间写入 crack 裂洞 + 粉红 #e87a98 wet 盐水 + 碎盐与红虫粒子
              state.vx = 0;
              state.vy = 0;
              const u = clamp(state.stageT / Math.max(0.08, state.stageDur), 0, 1);
              if (u < 0.45) {
                const downT = Math.pow(u / 0.45, 2.2);
                targetBodyLift = lerp(3.6, 1.9, downT) * sMul;
                targetBodySway = lerp(-1.6, 1.2, downT) * sMul;
                targetHammerLift = lerp(9.6, 0.0, downT) * sMul;
                targetHammerArmYaw = lerp(-0.78, 0.14, downT);
                targetHammerHeadYaw = lerp(-0.45, 0.42, downT);
              } else {
                if (!state.strikeDone) {
                  state.strikeDone = true;
                  emitSmashImpact(vfx, sMul);
                }
                const rec = smoothstep(0.45, 1.0, u);
                targetBodyLift = lerp(1.9, 2.7, rec) * sMul;
                targetBodySway = lerp(1.2, 0.2, rec) * sMul;
                targetHammerLift = lerp(0.0, 1.4, rec) * sMul;
                targetHammerArmYaw = lerp(0.14, -0.26, rec);
                targetHammerHeadYaw = lerp(0.42, 0.18, rec);
              }
              targetTweezerArmYaw = 0.42;
              targetTweezerTipYaw = -0.20;
              targetEyeL = -0.25;
              targetEyeR = -0.28;

              if (state.stageT >= state.stageDur) {
                enterStage('pick', maxR);
              }
            } else if (state.stage === 'pick') {
              // 细长左镊螯迅速探进砸开的盐洞，连续 3 次精准夹起鲜红小虫送往口器！
              state.vx = 0;
              state.vy = 0;
              const cycleIdx = Math.min(PICK_COUNT - 1, Math.floor(state.stageT / PICK_ONE_DUR));
              const localU = clamp((state.stageT - cycleIdx * PICK_ONE_DUR) / PICK_ONE_DUR, 0, 1);

              // 右大锤让开一点位置，稳稳压在右侧配重
              targetBodyLift = (2.6 + Math.sin(localU * Math.PI) * 0.25) * sMul;
              targetBodySway = 0.55 * sMul;
              targetHammerLift = 1.6 * sMul;
              targetHammerArmYaw = -0.46;
              targetHammerHeadYaw = 0.06;

              if (localU < 0.36) {
                // 1) 细长左镊螯张开探入右侧碎裂盐洞
                const t = smoothstep(0, 0.36, localU);
                targetTweezerArmYaw = lerp(0.28, -0.68, t);
                targetTweezerTipYaw = lerp(-0.18, -0.36, t);
                targetTweezerExt = lerp(0.1, 1.0, t);
                state.tweezerClosed = false;
                state.bugCarry = false;
              } else if (localU < 0.52) {
                // 2) 精准夹住鲜红小虫（双指闭合 + 轻微水珠飞溅）
                targetTweezerArmYaw = -0.68;
                targetTweezerTipYaw = -0.34;
                targetTweezerExt = 1.0;
                state.tweezerClosed = true;
                state.bugCarry = true;
                if (state.pickIdx === cycleIdx) {
                  state.pickIdx = cycleIdx + 1;
                  if (vfx && typeof vfx.spawnParticle === 'function') {
                    const fx = curSkin.fx || SKINS[0].fx;
                    vfx.spawnParticle(
                      state.holeX, state.holeY, 1.2 * sMul,
                      (Math.random() - 0.5) * 6 * sMul,
                      (Math.random() - 0.5) * 6 * sMul,
                      8.5 * sMul, 0.32, 1.15, fx.wetColor, false, 36
                    );
                  }
                }
              } else if (localU < 0.84) {
                // 3) 夹着鲜红小虫迅速收回送往正中口器
                const t = smoothstep(0.52, 0.84, localU);
                targetTweezerArmYaw = lerp(-0.68, -0.15, t);
                targetTweezerTipYaw = lerp(-0.34, -0.82, t);
                targetTweezerExt = lerp(1.0, -0.18, t);
                state.tweezerClosed = true;
                state.bugCarry = true;
              } else {
                // 4) 口器吞下，镊螯张开准备下一口
                const t = smoothstep(0.84, 1.0, localU);
                targetTweezerArmYaw = lerp(-0.15, 0.18, t);
                targetTweezerTipYaw = lerp(-0.82, -0.22, t);
                targetTweezerExt = lerp(-0.18, 0.1, t);
                state.tweezerClosed = false;
                state.bugCarry = false;
              }

              // 双眼盯着盐洞与口器
              targetEyeL = -0.32;
              targetEyeR = -0.18;

              if (state.stageT >= state.stageDur) {
                if (action === 'smash') {
                  state.smashCyclesLeft--;
                  if (state.smashCyclesLeft > 0) {
                    enterStage('windup', maxR);
                  } else {
                    state.smashCyclesLeft = 2;
                    enterStage('listen', maxR);
                    state.stageDur = 0.55;
                  }
                } else {
                  enterStage('scuttle', maxR);
                }
              }
            }
          }

          // 安全半径钳制（严格 <= maxRadius * 0.78）
          if (action !== 'idle') {
            const [cx, cy] = clampSafeDisc(state.x, state.y, maxR);
            state.x = cx;
            state.y = cy;
          }

          state.yawRate = lerp(state.yawRate, clamp(rawYawRate, -3.0, 3.0), expSmooth(dt, 8.0));

          // 弹簧平滑驱动
          bodyLiftSp.update(dt, targetBodyLift, 130 * sp, clamp(13.0 * dScale, 6.0, 20.0));
          bodySwaySp.update(dt, targetBodySway, 95 * sp, clamp(8.5 * dScale, 4.0, 14.0));
          hammerLiftSp.update(dt, targetHammerLift, 165 * sp, clamp(12.5 * dScale, 6.0, 20.0));
          hammerArmSp.update(dt, targetHammerArmYaw, 135 * sp, clamp(11.0 * dScale, 5.0, 18.0));
          hammerHeadSp.update(dt, targetHammerHeadYaw, 145 * sp, clamp(10.5 * dScale, 5.0, 18.0));
          hammerSwaySp.update(dt, targetHammerSway, 85 * sp, clamp(7.0 * dScale, 3.5, 13.0));
          tweezerArmSp.update(dt, targetTweezerArmYaw, 155 * sp, clamp(12.0 * dScale, 5.5, 19.0));
          tweezerTipSp.update(dt, targetTweezerTipYaw, 170 * sp, clamp(13.0 * dScale, 6.0, 20.0));
          tweezerExtSp.update(dt, targetTweezerExt, 160 * sp, clamp(12.5 * dScale, 5.5, 19.0));
          eyeLSp.update(dt, targetEyeL, 78 * sp, clamp(7.8 * dScale, 3.8, 13.0));
          eyeRSp.update(dt, targetEyeR, 78 * sp, clamp(7.8 * dScale, 3.8, 13.0));

          state.z = Math.max(1.6 * sMul, bodyLiftSp.x);

          // 6 足侧向横行步态更新
          gait.update(dt, state.x, state.y, state.z, state.yaw, state.vx, state.vy, state.yawRate, {
            scaleMul: sMul,
            stepFreq: gFreq,
            stepHeight: 2.2
          });

          for (let i = 0; i < gait.legs.length; i++) {
            const leg = gait.legs[i];
            footContacts[i].x = leg.footX;
            footContacts[i].y = leg.footY;
            footContacts[i].z = leg.footZ;
            footContacts[i].r = 1.75 * sMul;
          }

          sockets.setLocal('back', state.x, state.y, state.z, state.yaw, 0, -0.5, 8.2, sMul);
          sockets.setLocal('hammerTip', state.x, state.y, state.z, state.yaw, 11.5, 11.5, 4.0 + hammerLiftSp.x, sMul);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const swayX = clamp(bodySwaySp.x, -2.5 * sMul, 2.5 * sMul);
          const [bodyWX, bodyWY] = localToWorldXY(state.x, state.y, yw, swayX, 0);
          const bodyZ = state.z;

          // 1. 6 条深珊瑚红三段硬壳步足（每条由基腿节 + 膝胫节 + 尖跗节沿真实髋->膝->足连线衔接）
          for (let i = 0; i < gait.legs.length; i++) {
            const leg = gait.legs[i];
            const dx = leg.footX - leg.hipWX;
            const dy = leg.footY - leg.hipWY;
            const legYaw = Math.hypot(dx, dy) > 0.05 ? Math.atan2(-dx, dy) : wrapAngle(yw - leg.side * Math.PI * 0.5);

            // 基节 + 腿节
            const cfx = lerp(leg.hipWX, leg.kneeX, 0.44);
            const cfy = lerp(leg.hipWY, leg.kneeY, 0.44);
            const cfz = Math.min(leg.hipWZ, leg.kneeZ) - 1.5 * sMul;
            list.push({
              partKey: 'legCoxaFemur',
              asset: parts.legCoxaFemur,
              x: cfx,
              y: cfy,
              lift: Math.max(0.2, cfz),
              ro: legYaw,
              bias: -0.35
            });

            // 膝护甲 + 胫节
            const ktx = lerp(leg.kneeX, leg.footX, 0.34);
            const kty = lerp(leg.kneeY, leg.footY, 0.34);
            const ktz = leg.footZ + Math.max(0, leg.kneeZ - leg.footZ) * 0.22;
            list.push({
              partKey: 'legKneeTibia',
              asset: parts.legKneeTibia,
              x: ktx,
              y: kty,
              lift: Math.max(0.2, ktz),
              ro: legYaw,
              bias: -0.25
            });

            // 尖跗节（精准贴盐壳）
            const tx = lerp(leg.kneeX, leg.footX, 0.78);
            const ty = lerp(leg.kneeY, leg.footY, 0.78);
            list.push({
              partKey: 'legTarsus',
              asset: parts.legTarsus,
              x: tx,
              y: ty,
              lift: Math.max(0, leg.footZ),
              ro: legYaw,
              bias: -0.15
            });
          }

          // 2. 扁宽六棱盐壳硬甲主躯干
          list.push({
            partKey: 'carapace',
            asset: parts.carapace,
            x: bodyWX,
            y: bodyWY,
            lift: Math.max(0.6, bodyZ),
            ro: yw,
            bias: 0.20
          });

          // 3. 双侧独立眼柄（亮黑眼珠 + 单像素锐利反色）
          const eyeDefs = [
            { side: -1, yawOff: eyeLSp.x },
            { side:  1, yawOff: eyeRSp.x }
          ];
          for (const ed of eyeDefs) {
            const [ejx, ejy] = localToWorldXY(bodyWX, bodyWY, yw, ed.side * 4.2 * sMul, 6.2 * sMul);
            const eYaw = wrapAngle(yw + clamp(ed.yawOff, -0.75, 0.75));
            const [ex, ey] = pivotToWorldXY(ejx, ejy, eYaw, EYE_PIVOT.x * sMul, EYE_PIVOT.y * sMul);
            list.push({
              partKey: 'eyeStalk',
              asset: parts.eyeStalk,
              x: ex,
              y: ey,
              lift: Math.max(1.2, bodyZ + 5.2 * sMul),
              ro: eYaw,
              bias: 0.55
            });
          }

          // 4. 左侧细长精巧镊螯（tweezerArm + tweezerTip，夹虫时带起鲜红小虫）
          const extOff = clamp(tweezerExtSp.x, -0.3, 1.2);
          const [tShX, tShY] = localToWorldXY(bodyWX, bodyWY, yw, (-8.0 + extOff * 1.4) * sMul, (4.2 + extOff * 2.2) * sMul);
          const tArmYaw = wrapAngle(yw + clamp(tweezerArmSp.x, -0.95, 0.85));
          const [tArmCX, tArmCY] = pivotToWorldXY(tShX, tShY, tArmYaw, TWEEZER_ARM_PIVOT.x * sMul, TWEEZER_ARM_PIVOT.y * sMul);
          const tArmZ = Math.max(0.8, bodyZ + (1.2 - extOff * 0.9) * sMul);
          list.push({
            partKey: 'tweezerArm',
            asset: parts.tweezerArm,
            x: tArmCX,
            y: tArmCY,
            lift: tArmZ,
            ro: tArmYaw,
            bias: 0.30
          });

          // 镊螯腕关节 -> 细长双指镊尖
          const [tWrX, tWrY] = localToWorldXY(tArmCX, tArmCY, tArmYaw, 0.0, 3.8 * sMul);
          const tTipYaw = wrapAngle(tArmYaw + clamp(tweezerTipSp.x, -1.05, 0.85));
          const [tTipCX, tTipCY] = pivotToWorldXY(tWrX, tWrY, tTipYaw, TWEEZER_TIP_PIVOT.x * sMul, TWEEZER_TIP_PIVOT.y * sMul);
          const tTipZ = Math.max(0.4, tArmZ - extOff * 1.1 * sMul);
          const tipKey = state.tweezerClosed ? 'tweezerTipClosed' : 'tweezerTipOpen';
          list.push({
            partKey: tipKey,
            asset: parts[tipKey],
            x: tTipCX,
            y: tTipCY,
            lift: tTipZ,
            ro: tTipYaw,
            bias: 0.42
          });

          // 夹虫送口期间，在左镊尖呈现高对比鲜红盐水小虫
          if (state.bugCarry) {
            const [bx, by] = localToWorldXY(tTipCX, tTipCY, tTipYaw, 0, 4.5 * sMul);
            list.push({
              partKey: 'brineBug',
              asset: parts.brineBug,
              x: bx,
              y: by,
              lift: Math.max(0.6, tTipZ + 1.4 * sMul),
              ro: wrapAngle(tTipYaw + 0.6),
              bias: 0.62
            });
          }

          // 5. 右侧巨型盐晶锤螯（hammerArm + hammerHead，放大至近半身宽！）
          const hLift = Math.max(0, hammerLiftSp.x);
          const hSway = clamp(hammerSwaySp.x, -0.55, 0.55);
          const [hShX, hShY] = localToWorldXY(bodyWX, bodyWY, yw, 8.2 * sMul, 3.8 * sMul);
          const hArmYaw = wrapAngle(yw + clamp(hammerArmSp.x + hSway * 0.5, -1.15, 0.65));
          const [hArmCX, hArmCY] = pivotToWorldXY(hShX, hShY, hArmYaw, HAMMER_ARM_PIVOT.x * sMul, HAMMER_ARM_PIVOT.y * sMul);
          const hArmZ = Math.max(0.6, bodyZ + 0.6 * sMul + hLift * 0.45);
          list.push({
            partKey: 'hammerArm',
            asset: parts.hammerArm,
            x: hArmCX,
            y: hArmCY,
            lift: hArmZ,
            ro: hArmYaw,
            bias: 0.36
          });

          // 锤螯腕关节 -> 巨型盐晶钝方锤头
          const [hWrX, hWrY] = localToWorldXY(hArmCX, hArmCY, hArmYaw, 0.6 * sMul, 4.2 * sMul);
          const hHeadYaw = wrapAngle(hArmYaw + clamp(hammerHeadSp.x + hSway * 0.65, -0.95, 0.85));
          const [hHeadCX, hHeadCY] = pivotToWorldXY(hWrX, hWrY, hHeadYaw, HAMMER_HEAD_PIVOT.x * sMul, HAMMER_HEAD_PIVOT.y * sMul);
          const hHeadZ = Math.max(0.0, bodyZ - 0.5 * sMul + hLift);
          list.push({
            partKey: 'hammerHead',
            asset: parts.hammerHead,
            x: hHeadCX,
            y: hHeadCY,
            lift: hHeadZ,
            ro: hHeadYaw,
            bias: 0.68
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Sand8HammerClawDef.id,
            code: Sand8HammerClawDef.code,
            status: Sand8HammerClawDef.status,
            name: Sand8HammerClawDef.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            stage: state.stage,
            legCount: SIDE_LEG_SPECS.length,
            gaitMode: 'sideways_hex_90deg',
            sideSpeed: SIDE_SPEED,
            listenDur: LISTEN_DUR,
            windupDur: WINDUP_DUR,
            strikeDur: STRIKE_DUR,
            pickTotalDur: PICK_TOTAL_DUR,
            footRadius: Sand8HammerClawDef.footRadius,
            headZ: 12,
            centerZ: 5,
            blocks: Sand8HammerClawDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Sand8HammerClawDef);
})(window.PixelWorkshop);
