'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // M21 标杆 · 火2 · 滚着走、只在冷石板上舒展的（卷成球滚）
  // -------------------------------------------------------------------------
  // 【顶层可复用配置 M21_CONFIG】
  //   后续所有 M21（卷成球滚）生物可直接复用本套 6 档花纹转位 + 路程换帧 + 急刹弹跳状态机：
  //   - ballFrames / ballRadius     : 6 档预烘滚球（每档沿前滚方向推进 60°，配 symDeg: 180 省贴图）
  //   - rollRadPerGrid              : 路程换帧系数 = 1 / ballRadius（rollAngle += moveDist * rollRadPerGrid）
  //   - cruiseSpeed / brakeDist     : 巡航滚速与进板急刹减速距离
  //   - bounceHeights / bounceDur   : 急刹落地小弹两下（纯 lift 位移，严禁常态 scaleX/scaleY 拉伸）
  //   - uncurlDur / curlDur         : 半卷过渡件（halfCurl）舒展与受惊咔哒卷拢时长
  //   - slabCount / targetRadiusRatio: 自带 3 块冷石板落脚点，全部严格钳制在 maxRadius * 0.78 内
  // =========================================================================
  const M21_CONFIG = {
    ballFrames: 6,               // 6 档花纹转位滚球（ball0 ~ ball5，步进 60°）
    ballDiameter: 20,            // 滚球直径 20 格（规范 18~22 格）
    ballRadius: 9.6,             // 物理滚动半径（格），用于路程换帧 rollDist / radius
    rollRadPerGrid: 1 / 9.6,     // 每行进 1 格推进的弧度（约 0.1042 rad/格，每 10.05 格换 1 档）
    cruiseSpeed: 42.0,           // 高速翻滚巡航速度（格/秒）
    accelRate: 68.0,             // 滚出起步加速度（格/秒²）
    brakeDist: 17.5,             // 距目标冷石板开始急刹的距离（格）
    minBrakeSpeed: 6.5,          // 急刹末段进入停稳弹跳的速度阈值（格/秒）

    bounceHeights: [2.8, 1.2],   // 急刹抵达冷石板后连续小弹两下的峰值高度（格）
    bounceDur: 0.44,             // 两段急刹回弹总时长（秒）
    uncurlDur: 0.34,             // 半卷舒展过渡时长（秒）
    forageDur: [3.2, 4.3],       // 冷石板舒展舔苔时长区间（秒）
    alertDur: 0.62,              // 突然受惊抬头竖耳警戒时长（秒）
    curlDur: 0.28,               // 咔哒卷球过渡时长（秒）
    rollModePauseDur: 0.28,      // roll 演示态急刹弹跳后的短暂停顿（秒）

    slabCount: 3,                // 自带 3 块冷石板落脚点
    slabTopZ: 2.3,               // 立体冷石板顶面承托高度（格）
    slabRadius: 11.2,            // 冷石板地表摆件半径（格）
    targetRadiusRatio: 0.78      // 巡游与冷石板坐标严格钳制上限（maxRadius * 0.78）
  };

  // =========================================================================
  // 1. 色表（26 色 <= 48 色、0 重色、高对比黑红亮橙条纹 + 浅米粉嫩足与冷灰石板青苔）
  //    仅 emissiveMid / emissiveHot / emissiveCore 进 glowKeys；eyeGlint 绝不进 glowKeys
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 深黑曜厚甲片（带冷青灰亮棱，绝非死黑）
      shellDark:    '#191721',
      shellMid:     '#2b2838',
      shellHi:      '#4a455e',
      // 高对比鲜艳亮橙红环带（俯视一眼辨识滚动）
      bandDark:     '#b82914',
      bandMid:      '#f04d1a',
      bandHi:       '#ff822e',
      // 环带中央明黄亮纹（强化翻滚视觉追踪）
      stripeDark:   '#d48817',
      stripeMid:    '#ffbf24',
      stripeHi:     '#fff082',
      // 舒展态浅米白/粉橙色鲜嫩头吻、尖耳与短腿（与黑红硬甲强烈反差）
      softDark:     '#cfa086',
      softMid:      '#f2ccb6',
      softHi:       '#fff1e3',
      // 粉橙耳尖、嫩掌垫与舔苔小舌
      pinkDark:     '#c76258',
      pinkMid:      '#f28c7d',
      pinkHi:       '#ffbfb5',
      // 冷石板清凉灰青岩面（与熔岩火山口深灰红地台拉开冷暖反差）
      slabDark:     '#424c5c',
      slabMid:      '#64738a',
      slabHi:       '#8fa1ba',
      // 冷石板耐热青绿苔
      mossDark:     '#356e3d',
      mossMid:      '#5ca856',
      mossHi:       '#9be070',
      // 锐利圆眼与白眼点（绝不进 glowKeys）
      eyeDark:      '#0c0d14',
      eyeGlint:     '#ffffff',
      // 甲片环缝微热细点（唯一进 glowKeys）
      emissiveMid:  '#e04318',
      emissiveHot:  '#ff7a29',
      emissiveCore: '#ffd966'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: ['shell', 'band', 'stripe', 'soft', 'pink', 'slab', 'moss', 'eye', 'emissive'],
    noCrease: [
      ['shell', 'band'],
      ['band', 'stripe'],
      ['band', 'emissive'],
      ['stripe', 'emissive'],
      ['soft', 'pink'],
      ['soft', 'eye'],
      ['slab', 'moss']
    ],
    materials: {
      shell:  ['shellDark',  'shellMid',  'shellHi'],
      band:   ['bandDark',   'bandMid',   'bandHi'],
      stripe: ['stripeDark', 'stripeMid', 'stripeHi'],
      soft:   ['softDark',   'softMid',   'softHi'],
      pink:   ['pinkDark',   'pinkMid',   'pinkHi'],
      slab:   ['slabDark',   'slabMid',   'slabHi'],
      moss:   ['mossDark',   'mossMid',   'mossHi']
    },
    protectedParts: ['eye', 'emissive', 'pink', 'stripe']
  });

  // 3 套零重建模换色皮肤（每套 26 色 0 重色，0 禁用字）
  const SKINS = [
    {
      id: 'lava_orange_ring',
      name: '熔岩黑橙环',
      dot: '#f04d1a',
      outline: '#0d090f',
      pal: {},
      fx: {
        slabColor: '#64738a',
        slabRim:   '#303845',
        crackTint: '#592014',
        crackDark: '#1c0b08',
        dust:      '#786058',
        sparkHot:  '#ff7a29',
        sparkCore: '#ffd966',
        mossChip:  '#86d463'
      }
    },
    {
      id: 'sulfur_gold_ring',
      name: '硫磺金黑环',
      dot: '#f2b81d',
      outline: '#120e07',
      pal: {
        shellDark:    '#1f1c16', shellMid:    '#363024', shellHi:    '#574e3b',
        bandDark:     '#b5740e', bandMid:     '#eb9e17', bandHi:     '#ffc938',
        stripeDark:   '#ccaa24', stripeMid:   '#f7de48', stripeHi:   '#fff9b0',
        softDark:     '#d4b692', softMid:     '#f5deb8', softHi:     '#fff7e6',
        pinkDark:     '#cc7452', pinkMid:     '#f29c74', pinkHi:     '#ffcbb0',
        slabDark:     '#494f59', slabMid:     '#6e7785', slabHi:     '#98a3b5',
        mossDark:     '#2e6b4f', mossMid:     '#4da377', mossHi:     '#85dbab',
        emissiveMid:  '#d98b14', emissiveHot: '#ffc22b', emissiveCore: '#fff399'
      },
      fx: {
        slabColor: '#6e7785',
        slabRim:   '#363b42',
        crackTint: '#5e4512',
        crackDark: '#211806',
        dust:      '#857558',
        sparkHot:  '#ffc22b',
        sparkCore: '#fff399',
        mossChip:  '#6fd19c'
      }
    },
    {
      id: 'cool_moss_ring',
      name: '冷灰青苔环',
      dot: '#54bd78',
      outline: '#091114',
      pal: {
        shellDark:    '#1d242e', shellMid:    '#313d4d', shellHi:    '#50627a',
        bandDark:     '#257a55', bandMid:     '#3eb57b', bandHi:     '#73e09f',
        stripeDark:   '#7db336', stripeMid:   '#b7eb52', stripeHi:   '#e8ff9e',
        softDark:     '#d9a998', softMid:     '#f7cfc0', softHi:     '#fff3eb',
        pinkDark:     '#cf696b', pinkMid:     '#f59393', pinkHi:     '#ffc7c7',
        slabDark:     '#4f4954', slabMid:     '#736b7a', slabHi:     '#9e94a8',
        mossDark:     '#99482a', mossMid:     '#d16d3b', mossHi:     '#f7a663',
        emissiveMid:  '#2ea86e', emissiveHot: '#5ce095', emissiveCore: '#c7ffad'
      },
      fx: {
        slabColor: '#736b7a',
        slabRim:   '#3b3640',
        crackTint: '#2b473b',
        crackDark: '#101f1a',
        dust:      '#6d7887',
        sparkHot:  '#5ce095',
        sparkCore: '#c7ffad',
        mossChip:  '#ed914e'
      }
    }
  ];

  // =========================================================================
  // 2. 六档花纹转位滚球预烘（ball0 ~ ball5，尺寸 22×22×20，直径 20 格）
  //    每档把球面亮橙红/明黄环带沿前滚方向 (+Y) 绕 X 轴推进 60° (TAU / 6)
  //    球背雕成一圈圈厚甲片 + 高对比宽亮橙明黄环带 + 两侧卷壳螺旋铆点
  // =========================================================================
  function buildRollBall(makeCanvas, frameIdx) {
    const W = 22, D = 22, H = 20;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    const cz = 9.6;
    const R = M21_CONFIG.ballRadius;
    const phase = (frameIdx / M21_CONFIG.ballFrames) * TAU; // 每档推进 60°

    m.fillAABB(-10.5, 10.5, -10.5, 10.5, 0, H - 1, (x, y, z, X, Y) => {
      const dz = z - cz;
      // 球体略微底部接地平整（z=0 不悬浮）
      const dist = Math.hypot(X, Y, dz);

      // 绕横轴 X 的前滚极角：theta=0 正顶，theta=+PI/2 正前(+Y)
      const theta = Math.atan2(Y, dz);
      // 花纹角 u 随 phase 增大向 +Y 前滚方向推进
      const u = wrapAngle(theta - phase);
      const uPos = ((u % TAU) + TAU) % TAU; // [0, TAU)

      // 3 条高对比厚甲环带（相隔 120°，其中 0° 主带最宽、120° 和 240° 副带紧随）
      // 用局部角度距离算出清晰甲片台阶起伏与环带归属
      const d0 = Math.abs(wrapAngle(uPos - 0));
      const d1 = Math.abs(wrapAngle(uPos - TAU / 3));
      const d2 = Math.abs(wrapAngle(uPos - (TAU * 2) / 3));
      const minBandD = Math.min(d0, d1, d2);

      // 甲片浮雕微隆起：黑曜甲片外凸 0.35 格，亮橙环带微微嵌槽，切出清晰圈状硬甲感
      const plateBump = (minBandD > 0.34) ? 0.35 : -0.15;
      // 两侧略微收扁成厚重卷甲轮盘轮廓（保留饱满球感）
      const sideTrim = Math.max(0, Math.abs(X) - R * 0.72) * 0.22;
      const effR = R + plateBump - sideTrim;
      if (dist > effR) return;

      // 球体左右两侧卷壳收口（|X| 靠外处雕出螺旋卷甲盖与随转的亮橙侧铆点）
      if (Math.abs(X) > R * 0.73) {
        const sideAng = wrapAngle(theta - phase);
        const spoke = Math.abs(Math.sin(sideAng * 1.5));
        const rYZ = Math.hypot(Y, dz);
        if (rYZ < 2.5) {
          m.setRaw(x, y, z, mat('band'), partId.band);
        } else if (spoke < 0.28 && rYZ < 5.8) {
          m.setRaw(x, y, z, mat('stripe'), partId.stripe);
        } else {
          m.setRaw(x, y, z, mat('shell'), partId.shell);
        }
        return;
      }

      // 宽亮橙红/明黄主环带（u=0°，最粗最醒目，中心带明黄脊线）
      if (d0 <= 0.38) {
        if (d0 <= 0.14) {
          if (Math.abs(X) <= 2.4 && dist > effR - 1.3) {
            m.setRaw(x, y, z, keyToId.emissiveCore, partId.emissive);
          } else {
            m.setRaw(x, y, z, mat('stripe'), partId.stripe);
          }
        } else if (d0 <= 0.25 && Math.abs(X) <= 3.6 && dist > effR - 1.2) {
          m.setRaw(x, y, z, keyToId.emissiveHot, partId.emissive);
        } else {
          m.setRaw(x, y, z, mat('band'), partId.band);
        }
        return;
      }

      // 两条次级亮橙环带（u=120° 与 240°，带清晰明黄中线）
      if (d1 <= 0.27 || d2 <= 0.27) {
        const dSub = Math.min(d1, d2);
        if (dSub <= 0.10) {
          m.setRaw(x, y, z, mat('stripe'), partId.stripe);
        } else if (dSub <= 0.18 && Math.abs(X) <= 1.8 && dist > effR - 1.2) {
          m.setRaw(x, y, z, keyToId.emissiveMid, partId.emissive);
        } else {
          m.setRaw(x, y, z, mat('band'), partId.band);
        }
        return;
      }

      // 黑曜厚甲片本体：沿背脊中线加细小亮橙甲钉，强化高速翻滚的节拍感
      const midPin = (Math.abs(X) <= 1.1) && (Math.abs(wrapAngle(uPos - Math.PI)) < 0.12 || Math.abs(wrapAngle(uPos - Math.PI / 3)) < 0.10 || Math.abs(wrapAngle(uPos - (Math.PI * 5) / 3)) < 0.10);
      if (midPin && dist > effR - 1.3) {
        m.setRaw(x, y, z, mat('band'), partId.band);
      } else {
        m.setRaw(x, y, z, mat('shell'), partId.shell);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.8, headZ: 19, centerZ: 10 });
  }

  // =========================================================================
  // 3. 半卷过渡件（halfCurl，尺寸 22×24×16）
  //    用于「滚球 <-> 半卷 <-> 舒展」两段自然衔接：背甲半拱，前探浅米吻尖与嫩足
  // =========================================================================
  function buildHalfCurl(makeCanvas) {
    const W = 22, D = 24, H = 16;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 1. 半展开的高拱硬甲壳（保留清晰的黑曜厚甲 + 3 道亮橙/明黄环带）
    m.fillAABB(-9.5, 9.5, -10.0, 9.0, 1, 15, (x, y, z, X, Y) => {
      const cy = -0.8;
      const cz = 6.8;
      const nx = X / 8.8;
      const ny = (Y - cy) / 9.2;
      const nz = (z - cz) / 7.8;
      const d = Math.hypot(nx, ny, nz);
      if (d > 1.0) return;

      // 下前侧挖开空间给刚探出的浅米头吻与短腿
      if (z < 4.5 && Y > 3.2) return;
      if (z < 2.2) {
        m.setRaw(x, y, z, mat('soft'), partId.soft);
        return;
      }

      // 横向三道高对比亮橙/明黄环带
      const bandY = Math.abs(((Y + 11.5) % 5.4) - 2.7);
      if (bandY < 0.95 && z >= 4) {
        if (bandY < 0.36 && Math.abs(X) < 5.5) {
          m.setRaw(x, y, z, mat('stripe'), partId.stripe);
        } else {
          m.setRaw(x, y, z, mat('band'), partId.band);
        }
      } else {
        m.setRaw(x, y, z, mat('shell'), partId.shell);
      }
    });

    // 2. 前端刚探出的浅米白/粉橙色头吻 + 一对微微竖起的小尖耳
    m.paintEllipsoid(0, 7.2, 4.4, 3.8, 3.6, 2.8, mat('soft'), partId.soft, true);
    m.paintEllipsoid(0, 9.8, 3.8, 2.0, 1.8, 1.5, mat('pink'), partId.pink, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 2.5, 6.2, 6.2, s * 4.2, 5.6, 9.2, 1.15, 0.55, mat('soft'), partId.soft, true);
      m.paintCapsule(s * 2.8, 6.4, 6.4, s * 3.9, 6.0, 8.4, 0.65, 0.35, mat('pink'), partId.pink, true);
      // 刚从甲下露出的 4 只浅米嫩小短足
      m.paintEllipsoid(s * 6.4,  4.4, 1.6, 1.9, 1.8, 1.5, mat('soft'), partId.soft, true);
      m.paintEllipsoid(s * 6.4, -3.4, 1.6, 1.9, 1.8, 1.5, mat('soft'), partId.soft, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 刚露出的 2×2 黑圆眼 + 单像素白眼点
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 8.8);
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 2.2);
      m.setRaw(ex, eyeY, 5, keyToId.eyeDark, partId.eye);
      m.setRaw(ex, eyeY, 6, keyToId.eyeGlint, partId.eye);
      m.setRaw(ex - s, eyeY, 5, keyToId.eyeDark, partId.eye);
      m.setRaw(ex - s, eyeY, 6, keyToId.eyeDark, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 9.6, headZ: 15, centerZ: 7 });
  }

  // =========================================================================
  // 4. 舒展态背甲躯干（bodyShell，尺寸 20×24×13）
  //    低伏舒展的穿山甲/犰狳式厚甲背，4 道黑红亮橙明黄环带 + 短厚甲尾 + 浅米嫩腹缘
  // =========================================================================
  function buildBodyShell(makeCanvas) {
    const W = 20, D = 24, H = 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 1. 浅米白/粉橙软腹底垫（舒展态露出一圈柔和亮色腹缘）
    m.paintEllipsoid(0, -0.5, 2.5, 7.2, 8.6, 2.2, mat('soft'), partId.soft, true);

    // 2. 背上一圈圈分节硬甲背壳（黑曜厚甲 + 鲜艳亮橙红/明黄环带）
    m.fillAABB(-9.0, 9.0, -10.5, 8.5, 2, 12, (x, y, z, X, Y) => {
      const nx = X / 8.0;
      const ny = (Y + 0.8) / 8.8;
      const nz = (z - 3.2) / 8.0;
      if (z < 2.6) return;
      const d = Math.hypot(nx, ny, nz);
      if (d > 1.0) return;

      // 沿躯干前后排列 4 道鲜艳环带（与滚球花纹一脉相承）
      const seg = Math.abs(((Y + 12.0) % 4.6) - 2.3);
      if (seg < 0.88 && z >= 4) {
        if (seg < 0.34 && Math.abs(X) < 5.0) {
          if (Math.abs(X) <= 1.4 && z >= 9) {
            m.setRaw(x, y, z, keyToId.emissiveCore, partId.emissive);
          } else {
            m.setRaw(x, y, z, mat('stripe'), partId.stripe);
          }
        } else {
          m.setRaw(x, y, z, mat('band'), partId.band);
        }
      } else {
        m.setRaw(x, y, z, mat('shell'), partId.shell);
      }
    });

    // 3. 后端翘起的短厚甲尾（带亮橙尾环）
    m.paintCapsule(0, -7.2, 4.2, 0, -10.8, 5.2, 3.0, 1.4, mat('shell'), partId.shell, true);
    m.paintEllipsoid(0, -9.2, 5.2, 2.2, 0.9, 1.9, mat('band'), partId.band, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.0, headZ: 12, centerZ: 5 });
  }

  // =========================================================================
  // 5. 舒展态头吻与翘耳（headNormal / headLick，尺寸 14×16×11）
  //    浅米白/粉橙鲜嫩小头 + 一对高高翘起的尖耳 + 锐利 2×2 大圆眼 + 舔苔小粉舌
  // =========================================================================
  const HEAD_PIVOT = { x: 0, y: -3.2 };

  function buildHead(makeCanvas, isLick) {
    const W = 14, D = 16, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    const pitchDrop = isLick ? -1.4 : 0.0;

    // 饱满浅米白圆头 + 往前尖翘的小头吻
    m.paintEllipsoid(0, -1.0, 4.6 + pitchDrop * 0.4, 3.9, 3.8, 3.1, mat('soft'), partId.soft, true);
    m.paintCapsule(0, 0.6, 4.2 + pitchDrop * 0.5, 0, 4.6, 3.6 + pitchDrop, 2.7, 1.4, mat('soft'), partId.soft, true);

    // 头顶护额小黑甲片（衔接背甲）
    m.paintEllipsoid(0, -2.2, 6.8 + pitchDrop * 0.3, 3.1, 2.0, 1.2, mat('shell'), partId.shell, true);
    m.paintEllipsoid(0, -1.6, 7.2 + pitchDrop * 0.3, 2.0, 0.7, 0.8, mat('band'), partId.band, true);

    // 粉橙色俏皮鼻尖
    m.paintEllipsoid(0, 5.4, 3.8 + pitchDrop, 1.2, 1.1, 1.0, mat('pink'), partId.pink, true);

    // 一对高高翘起的尖耳（浅米外耳 + 粉橙内耳，俯视辨识度极高！）
    for (const s of [-1, 1]) {
      m.paintCapsule(
        s * 2.5, -1.6, 6.2 + pitchDrop * 0.3,
        s * 4.8, -2.4, 9.8 + pitchDrop * 0.2,
        1.35, 0.58, mat('soft'), partId.soft, true
      );
      m.paintCapsule(
        s * 2.8, -1.1, 6.4 + pitchDrop * 0.3,
        s * 4.3, -1.6, 8.9 + pitchDrop * 0.2,
        0.75, 0.38, mat('pink'), partId.pink, true
      );
    }

    // 舔苔态：伸出一条鲜艳粉红小舌头贴向冷石板耐热苔
    if (isLick) {
      m.paintCapsule(0, 4.6, 2.2, 0, 7.2, 0.9, 0.95, 0.72, mat('pink'), partId.pink, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 2×2 锐利黑圆眼 + 单像素白眼点（绝不进 glowKeys，0.6 俯视 0 遮挡）
    const hw = W * 0.5 - 0.5;
    const hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.5);
    const eyeZ = isLick ? 4 : 5;
    for (const s of [-1, 1]) {
      const cols = s < 0
        ? [Math.round(hw - 3.0), Math.round(hw - 2.0)]
        : [Math.round(hw + 2.0), Math.round(hw + 3.0)];
      for (let ci = 0; ci < 2; ci++) {
        const ex = cols[ci];
        for (let dz = 0; dz <= 1; dz++) {
          const isGlint = (dz === 1 && ci === 1);
          const colId = isGlint ? keyToId.eyeGlint : keyToId.eyeDark;
          m.setRaw(ex, eyeY,     eyeZ + dz, colId, partId.eye);
          m.setRaw(ex, eyeY - 1, eyeZ + dz, keyToId.eyeDark, partId.eye);
        }
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 10, centerZ: 5 });
  }

  // =========================================================================
  // 6. 舒展态嫩短腿（leg，4 只共享 1 套，尺寸 7×8×6）
  //    浅米白小胖腿 + 粉橙脚掌嫩垫，俯视 ×4 一眼看出从硬甲下伸出的嫩足
  // =========================================================================
  function buildTenderLeg(makeCanvas) {
    const m = new VoxelModel(7, 8, 6, SPEC);
    const { mat, partId } = SPEC;
    // 上半段圆润浅米小腿
    m.paintCapsule(0, -0.8, 3.8, 0, 1.0, 1.5, 1.75, 1.55, mat('soft'), partId.soft, true);
    // 前伸的粉橙嫩脚掌与小趾
    m.paintEllipsoid(0, 2.0, 1.1, 1.65, 1.65, 1.05, mat('pink'), partId.pink, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 5, centerZ: 2 });
  }

  // =========================================================================
  // 7. 自带冷石板落脚点（coldSlab，3 块共享 1 套四重对称资产 symDeg: 90，尺寸 24×24×4）
  //    清凉灰青石板 + 顶面青绿耐热苔簇，与火山口深灰红地面拉开鲜明反差
  // =========================================================================
  function buildColdSlab(makeCanvas) {
    const W = 24, D = 24, H = 4;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const radius = 10.6;

    m.fillAABB(-11.2, 11.2, -11.2, 11.2, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      const ay = Math.abs(Y);
      const ang = Math.atan2(Y, X);
      const lobe = Math.cos(ang * 4);
      const superR = Math.pow(Math.pow(ax, 2.6) + Math.pow(ay, 2.6), 1 / 2.6);
      const zInset = (z === 0) ? 0.6 : ((z === H - 1) ? 1.4 : 0.0);
      const effLim = radius - zInset + lobe * 0.45;

      // 顶层 z=3 只画石板上的耐热青苔簇（四重对称分布，留出中央站脚位）
      if (z === H - 1) {
        const dMoss1 = Math.hypot(ax - 5.2, ay - 3.6);
        const dMoss2 = Math.hypot(ax - 3.6, ay - 5.2);
        const dMoss3 = Math.hypot(ax - 6.8, ay - 1.2);
        if (dMoss1 <= 1.85 || dMoss2 <= 1.65 || dMoss3 <= 1.45) {
          m.setRaw(x, y, z, mat('moss'), partId.moss);
        }
        return;
      }

      if (superR > effLim) return;

      // z=2 石板顶面点缀几片浅青苔基底
      if (z === 2) {
        const dMossA = Math.hypot(ax - 5.2, ay - 3.6);
        const dMossB = Math.hypot(ax - 3.6, ay - 5.2);
        if (dMossA <= 2.25 || dMossB <= 2.05) {
          m.setRaw(x, y, z, mat('moss'), partId.moss);
          return;
        }
      }

      m.setRaw(x, y, z, mat('slab'), partId.slab);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.8, headZ: 3, centerZ: 1 });
  }

  // 舒展态 4 只嫩短腿的局部挂点（左右前后清晰探出背甲两侧）
  const LEG_SLOTS = [
    { side: -1, lx: -6.8, ly:  4.6, baseYaw:  0.42, phase: 0.0 },
    { side:  1, lx:  6.8, ly:  4.6, baseYaw: -0.42, phase: Math.PI },
    { side: -1, lx: -7.0, ly: -3.8, baseYaw:  0.65, phase: Math.PI * 0.7 },
    { side:  1, lx:  7.0, ly: -3.8, baseYaw: -0.65, phase: Math.PI * 1.7 }
  ];

  // =========================================================================
  // 8. 生物定义：火2 · 滚着走、只在冷石板上舒展的（M21 模板标杆）
  // =========================================================================
  const Fire2LavaRollerDef = {
    id: 'fire2_lava_roller',
    code: '火2',
    name: '滚着走、只在冷石板上舒展的',
    status: 'done',
    tag: 'M21 标杆 · 6档转位滚球',
    summary: '黑曜厚甲嵌高对比亮橙红与明黄环带：6 档花纹转位滚球按行进路程换帧高速翻滚，抵达自带的 3 块冷石板后急刹小弹两下、经半卷过渡舒展开，露出浅米粉嫩小短腿与翘耳头吻低头舔耐热苔，受惊后咔哒卷球滚往下一块冷石板',
    defaultHabitat: 'volcano',
    footRadius: 10.2,
    ecoWeight: 0.9,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    m21Config: M21_CONFIG,
    blocks: [
      '6档亮橙明黄环带滚球按路程换帧',
      '急刹减速小弹两下与焦痕尘尾',
      '半卷过渡件平滑衔接卷球与舒展',
      '舒展态浅米粉嫩四短腿与翘耳舔苔',
      '自带3块冷石板耐热苔落脚路线'
    ],
    soulHabit: '火山地面太烫不敢站，平时紧卷成黑红亮橙条纹圆球高速滚行；只在冷石板上才敢急刹弹两下舒展开，探出浅米嫩短腿与翘耳低头舔耐热苔，稍有动静立刻受惊抬头咔哒卷回圆球滚往下一块石板',
    actions: [
      { id: 'patrol', name: '石板间滚行舒展舔苔', loop: true, status: 'done' },
      { id: 'idle',   name: '冷石板舒展呼吸舔苔', loop: true, status: 'done' },
      { id: 'roll',   name: '持续高速翻滚与急刹', loop: true, status: 'done' }
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
        ball0:     buildRollBall(makeCanvas, 0),
        ball1:     buildRollBall(makeCanvas, 1),
        ball2:     buildRollBall(makeCanvas, 2),
        ball3:     buildRollBall(makeCanvas, 3),
        ball4:     buildRollBall(makeCanvas, 4),
        ball5:     buildRollBall(makeCanvas, 5),
        halfCurl:  buildHalfCurl(makeCanvas),
        bodyShell: buildBodyShell(makeCanvas),
        headNorm:  buildHead(makeCanvas, false),
        headLick:  buildHead(makeCanvas, true),
        tenderLeg: buildTenderLeg(makeCanvas),
        coldSlab:  buildColdSlab(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.35;
      const seed0 = opts.seed ?? 53;

      const sockets = new SocketTracker();
      const footContacts = [];
      const headYawSpring = new SpringDamper1D(0, 95, 7.6);
      const bodyRockSpring = new SpringDamper1D(0, 110, 7.2);

      let curSkin = SKINS[0];

      // 自带 3 块冷石板落脚点（全部严格钳制在 maxRadius * 0.78 内）
      const slabs = [
        { x: hx0, y: hy0, yaw: 0.15 },
        { x: hx0 + 24, y: hy0 - 14, yaw: 0.72 },
        { x: hx0 - 22, y: hy0 - 16, yaw: -0.45 }
      ];

      const state = {
        x: hx0,
        y: hy0,
        z: M21_CONFIG.slabTopZ,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        shadowScale: 1.0,

        // 状态机：'roll' -> 'brake' -> 'uncurl' -> 'forage' -> 'alert' -> 'curl' -> 'roll'
        phase: 'forage',
        phaseT: 0,
        phaseDur: 2.2,
        prevAction: 'patrol',

        // 滚球核心状态
        rollAngle: 0,            // 累计滚动弧度（严格按 moveDist / ballRadius 推进）
        ballIdx: 0,              // 当前 0..5 档滚球索引
        rollSpeed: 0,            // 当前前进标量速度
        bounceLift: 0,           // 急刹弹跳高度（纯 lift，零缩放）

        // 石板路线状态
        curSlabIdx: 0,
        targetSlabIdx: 1,
        slabsInited: false,
        lastHomeX: hx0,
        lastHomeY: hy0,
        lastMaxR: 46,
        propsSynced: false,
        seq: 1,

        // 舒展态细节动作
        isLicking: false,
        lickPhase: 0,
        legPhase: 0,
        dustCd: 0,
        decalCd: 0,
        mossCd: 0,
        bounceDustMask: 0
      };

      function clampInSafeDisc(x, y, hx, hy, safeR) {
        const dx = x - hx;
        const dy = y - hy;
        const d = Math.hypot(dx, dy);
        if (d > safeR && d > 1e-4) {
          return [hx + (dx * safeR) / d, hy + (dy * safeR) / d];
        }
        return [x, y];
      }

      function layoutSlabs(hx, hy, maxR, sMul) {
        const safeR = Math.max(12, maxR * M21_CONFIG.targetRadiusRatio);
        // 第 0 块在原点略偏移处，另两块呈大三角展开，确保单段滚行距离饱满且不越界
        const ringR = Math.min(safeR * 0.88, Math.max(22 * sMul, safeR * 0.78));
        const baseAng = 0.38 + (seed0 % 7) * 0.21;
        for (let i = 0; i < M21_CONFIG.slabCount; i++) {
          const ang = baseAng + (i / M21_CONFIG.slabCount) * TAU;
          const rad = (i === 0) ? Math.min(ringR * 0.42, safeR * 0.45) : ringR;
          const rawX = hx + Math.cos(ang) * rad;
          const rawY = hy + Math.sin(ang) * rad;
          const [cx, cy] = clampInSafeDisc(rawX, rawY, hx, hy, safeR * 0.94);
          slabs[i].x = cx;
          slabs[i].y = cy;
          slabs[i].yaw = wrapAngle(ang * 0.6 + i * 0.55);
        }
        state.slabsInited = true;
        state.lastHomeX = hx;
        state.lastHomeY = hy;
        state.lastMaxR = maxR;
      }

      function registerSlabGroundProps(vfx, sMul) {
        if (!vfx) return;
        const fxCol = curSkin.fx || SKINS[0].fx;
        for (let i = 0; i < slabs.length; i++) {
          vfx.addGroundProp({
            kind: 'slab',
            x: slabs[i].x,
            y: slabs[i].y,
            yaw: slabs[i].yaw,
            radius: M21_CONFIG.slabRadius * sMul,
            life: Infinity,
            color: fxCol.slabColor,
            rimColor: fxCol.slabRim
          });
        }
        state.propsSynced = true;
      }

      function spawnRollTrail(vfx, sMul, speedRatio) {
        if (!vfx) return;
        const fxCol = curSkin.fx || SKINS[0].fx;
        const [bx, by] = localToWorldXY(state.x, state.y, state.yaw, (Math.random() - 0.5) * 4.5 * sMul, -6.5 * sMul);
        const backX = Math.sin(state.yaw);
        const backY = -Math.cos(state.yaw);
        const sp = (6 + Math.random() * 10) * sMul * (0.5 + speedRatio * 0.7);
        vfx.spawnParticle(
          bx, by, 1.0 * sMul,
          backX * sp + (Math.random() - 0.5) * 5 * sMul,
          backY * sp + (Math.random() - 0.5) * 5 * sMul,
          (6 + Math.random() * 9) * sMul,
          0.32 + Math.random() * 0.22,
          1.45 + Math.random() * 0.65,
          Math.random() < 0.35 ? fxCol.sparkHot : fxCol.dust,
          Math.random() < 0.22,
          28
        );
      }

      function spawnBrakeBurst(vfx, sMul, power) {
        if (!vfx) return;
        const fxCol = curSkin.fx || SKINS[0].fx;
        const count = power > 0.7 ? 7 : 4;
        for (let i = 0; i < count; i++) {
          const a = (i / count) * TAU + Math.random() * 0.4;
          const spd = (7 + Math.random() * 11) * sMul * power;
          vfx.spawnParticle(
            state.x + Math.cos(a) * 4.2 * sMul,
            state.y + Math.sin(a) * 4.2 * sMul,
            (M21_CONFIG.slabTopZ + 0.6) * sMul,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            (6 + Math.random() * 8) * sMul * power,
            0.34 + Math.random() * 0.18,
            1.35 + Math.random() * 0.45,
            i % 3 === 0 ? fxCol.sparkCore : fxCol.dust,
            i % 3 === 0,
            34
          );
        }
      }

      function spawnMossNibbles(vfx, sMul) {
        if (!vfx) return;
        const fxCol = curSkin.fx || SKINS[0].fx;
        const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, (Math.random() - 0.5) * 3.0 * sMul, 10.5 * sMul);
        for (let i = 0; i < 2; i++) {
          const a = Math.random() * TAU;
          vfx.spawnParticle(
            mx, my, (M21_CONFIG.slabTopZ + 1.0) * sMul,
            Math.cos(a) * 4.5 * sMul,
            Math.sin(a) * 4.5 * sMul,
            (5.0 + Math.random() * 4.5) * sMul,
            0.32 + Math.random() * 0.16,
            1.05,
            fxCol.mossChip,
            false,
            26
          );
        }
      }

      function advanceRollFrames(moveDist, sMul) {
        if (moveDist <= 1e-5) return;
        const effRadius = Math.max(2.0, M21_CONFIG.ballRadius * sMul);
        state.rollAngle += moveDist / effRadius;
        const stepRad = TAU / M21_CONFIG.ballFrames;
        const rawIdx = Math.floor(state.rollAngle / stepRad);
        state.ballIdx = ((rawIdx % M21_CONFIG.ballFrames) + M21_CONFIG.ballFrames) % M21_CONFIG.ballFrames;
      }

      function pickNextSlab() {
        state.seq++;
        const step = (hash2i(state.seq, seed0, 193) > 0.35) ? 1 : 2;
        state.targetSlabIdx = (state.curSlabIdx + step) % slabs.length;
      }

      function enterRoll() {
        pickNextSlab();
        state.phase = 'roll';
        state.phaseT = 0;
        state.phaseDur = 4.5;
        state.rollSpeed = Math.max(state.rollSpeed, 14.0);
        state.bounceLift = 0;
        state.isLicking = false;
        state.bounceDustMask = 0;
      }

      function enterBrake() {
        state.phase = 'brake';
        state.phaseT = 0;
        state.phaseDur = M21_CONFIG.bounceDur;
        state.bounceDustMask = 0;
      }

      function enterUncurl() {
        state.phase = 'uncurl';
        state.phaseT = 0;
        state.phaseDur = M21_CONFIG.uncurlDur;
        state.rollSpeed = 0;
        state.vx = 0;
        state.vy = 0;
        state.bounceLift = 0;
        bodyRockSpring.impulse(9.5);
      }

      function enterForage() {
        state.phase = 'forage';
        state.phaseT = 0;
        state.seq++;
        const [dMin, dMax] = M21_CONFIG.forageDur;
        state.phaseDur = lerp(dMin, dMax, hash2i(state.seq, seed0, 311));
        state.rollSpeed = 0;
        state.vx = 0;
        state.vy = 0;
        state.bounceLift = 0;
        state.isLicking = false;
      }

      function enterAlert() {
        state.phase = 'alert';
        state.phaseT = 0;
        state.phaseDur = M21_CONFIG.alertDur;
        state.isLicking = false;
        bodyRockSpring.impulse(14.0);
        headYawSpring.impulse((Math.random() > 0.5 ? 1 : -1) * 6.5);
      }

      function enterCurl() {
        state.phase = 'curl';
        state.phaseT = 0;
        state.phaseDur = M21_CONFIG.curlDur;
        state.isLicking = false;
        bodyRockSpring.impulse(-12.0);
      }

      const instance = {
        def: Fire2LavaRollerDef,
        cachePrefix: `fire2_lava_roller_${Math.random().toString(36).slice(2, 7)}`,
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
          state.propsSynced = false;
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          layoutSlabs(homeX, homeY, state.lastMaxR || 46, instance.scaleMul);
          state.curSlabIdx = 0;
          state.targetSlabIdx = 1;
          state.x = slabs[0].x;
          state.y = slabs[0].y;
          state.z = M21_CONFIG.slabTopZ * instance.scaleMul;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.shadowScale = 1.0;

          state.phase = 'forage';
          state.phaseT = 0;
          state.phaseDur = 2.0;
          state.rollAngle = 0;
          state.ballIdx = 0;
          state.rollSpeed = 0;
          state.bounceLift = 0;
          state.isLicking = false;
          state.lickPhase = 0;
          state.legPhase = 0;
          state.dustCd = 0;
          state.decalCd = 0;
          state.mossCd = 0;
          state.propsSynced = false;

          headYawSpring.x = 0; headYawSpring.v = 0;
          bodyRockSpring.x = 0; bodyRockSpring.v = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.4, 2.0);

          const hx = (eco && eco.homeX) ?? 0;
          const hy = (eco && eco.homeY) ?? 0;
          const maxR = (eco && eco.maxRadius) || 46;
          const safeR = Math.max(12, maxR * M21_CONFIG.targetRadiusRatio);
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const isIdle = (action === 'idle');
          const isRollOnly = (action === 'roll');

          // 若锚点或地台半径变化，重新布局 3 块冷石板并严格钳制在 maxRadius * 0.78 内
          if (!state.slabsInited
            || Math.hypot(hx - state.lastHomeX, hy - state.lastHomeY) > 1.0
            || Math.abs(maxR - state.lastMaxR) > 1.0) {
            layoutSlabs(hx, hy, maxR, sMul);
            state.propsSynced = false;
          }
          if (vfx && !state.propsSynced) {
            registerSlabGroundProps(vfx, sMul);
          }

          // 响应展示动作切换
          if (action !== state.prevAction) {
            state.prevAction = action;
            if (isIdle) {
              state.curSlabIdx = 0;
              state.x = slabs[0].x;
              state.y = slabs[0].y;
              enterForage();
              state.phaseDur = 999;
            } else if (isRollOnly) {
              enterRoll();
            } else {
              enterForage();
              state.phaseDur = 1.6;
            }
          }

          const slabTop = M21_CONFIG.slabTopZ * sMul;
          let targetHeadYaw = Math.sin(time * 1.4) * 0.14;
          footContacts.length = 0;

          // -----------------------------------------------------------------
          // 1. 动作与状态机推进
          // -----------------------------------------------------------------
          if (isIdle) {
            // 原地待机：安稳舒展在冷石板上呼吸、周期低头舔耐热苔、偶尔警觉抬头张望
            const homeSlab = slabs[state.curSlabIdx] || slabs[0];
            const kPos = expSmooth(dt, 4.5);
            state.x = lerp(state.x, homeSlab.x, kPos);
            state.y = lerp(state.y, homeSlab.y, kPos);
            state.z = slabTop;
            state.phase = 'forage';
            state.rollSpeed = 0;
            state.bounceLift = 0;

            const cyc = (time * 0.24 * gFreq) % 1.0;
            if (cyc < 0.45) {
              // 悠闲呼吸微张望
              state.isLicking = false;
              targetHeadYaw = Math.sin(time * 1.7 * gFreq) * 0.26 * flex;
            } else if (cyc < 0.80) {
              // 低头舔石板耐热苔
              state.isLicking = true;
              state.lickPhase += dt * 7.2 * gFreq;
              targetHeadYaw = Math.sin(state.lickPhase * 0.5) * 0.34 * flex;
              state.mossCd -= dt;
              if (vfx && state.mossCd <= 0) {
                state.mossCd = 0.42;
                spawnMossNibbles(vfx, sMul);
              }
            } else {
              // 警觉抬头竖耳快速左右扫视
              state.isLicking = false;
              const uAlert = (cyc - 0.80) / 0.20;
              targetHeadYaw = Math.sin(uAlert * Math.PI * 2) * 0.58 * flex;
            }

          } else if (state.phase === 'roll') {
            // 高速滚向目标冷石板：严格按路程 rollDist / radius 推进 6 档花纹帧
            const tgt = slabs[state.targetSlabIdx];
            const dx = tgt.x - state.x;
            const dy = tgt.y - state.y;
            const dist = Math.hypot(dx, dy);

            const desiredYaw = Math.atan2(-dx, dy);
            const yawDiff = wrapAngle(desiredYaw - state.yaw);
            const turnRate = 6.2 * spdMul;
            state.yaw = wrapAngle(state.yaw + clamp(yawDiff, -turnRate * dt, turnRate * dt));

            const maxCruise = M21_CONFIG.cruiseSpeed * spdMul * sMul;
            const brakeD = M21_CONFIG.brakeDist * sMul;

            // 临近石板时平滑减速，滚速越慢换帧越慢
            let desiredSpd = maxCruise;
            if (dist < brakeD) {
              const uBrake = clamp(dist / brakeD, 0, 1);
              desiredSpd = lerp(M21_CONFIG.minBrakeSpeed * sMul, maxCruise, smoothstep(0, 1, uBrake));
            }
            const acc = (desiredSpd > state.rollSpeed ? M21_CONFIG.accelRate : M21_CONFIG.accelRate * 1.45) * spdMul * sMul;
            if (state.rollSpeed < desiredSpd) state.rollSpeed = Math.min(desiredSpd, state.rollSpeed + acc * dt);
            else state.rollSpeed = Math.max(desiredSpd, state.rollSpeed - acc * dt);

            const stepDist = Math.min(dist, state.rollSpeed * dt);
            const fwdX = -Math.sin(state.yaw);
            const fwdY =  Math.cos(state.yaw);
            state.vx = fwdX * state.rollSpeed;
            state.vy = fwdY * state.rollSpeed;

            const nx = state.x + fwdX * stepDist;
            const ny = state.y + fwdY * stepDist;
            const [cx, cy] = clampInSafeDisc(nx, ny, hx, hy, safeR);
            const actualMove = Math.hypot(cx - state.x, cy - state.y);
            state.x = cx;
            state.y = cy;

            // 按实际行进路程精确推进 6 档滚球帧
            advanceRollFrames(actualMove, sMul);

            // 滚过地面时略有高低起伏（上冷石板时平滑抬至板面）
            const onTargetU = 1.0 - clamp(dist / (M21_CONFIG.slabRadius * sMul), 0, 1);
            const curSlabD = Math.hypot(state.x - slabs[state.curSlabIdx].x, state.y - slabs[state.curSlabIdx].y);
            const onCurU = 1.0 - clamp(curSlabD / (M21_CONFIG.slabRadius * sMul), 0, 1);
            const surfaceZ = Math.max(onTargetU, onCurU) * slabTop;
            // 高速滚动的极微路面颠簸（纯位移）
            const speedRatio = clamp(state.rollSpeed / Math.max(1, maxCruise), 0, 1);
            const bumpZ = Math.abs(Math.sin(state.rollAngle * 3.0)) * 0.45 * speedRatio * sMul;
            state.z = surfaceZ + bumpZ;
            state.bounceLift = 0;

            // 沿途尘尾与滚压焦痕
            state.dustCd -= dt;
            if (vfx && state.dustCd <= 0 && speedRatio > 0.25) {
              state.dustCd = lerp(0.11, 0.045, speedRatio);
              spawnRollTrail(vfx, sMul, speedRatio);
            }
            state.decalCd -= dt;
            if (vfx && state.decalCd <= 0 && surfaceZ < slabTop * 0.4 && speedRatio > 0.35) {
              state.decalCd = 0.16;
              const fxCol = curSkin.fx || SKINS[0].fx;
              vfx.addDecal({
                kind: 'crack',
                x: state.x,
                y: state.y,
                yaw: state.yaw,
                rx: 4.4 * sMul,
                ry: 5.6 * sMul,
                life: 4.6,
                alpha: 0.62,
                color: fxCol.crackTint,
                darkColor: fxCol.crackDark
              });
            }

            if (dist <= 2.4 * sMul) {
              state.curSlabIdx = state.targetSlabIdx;
              enterBrake();
              spawnBrakeBurst(vfx, sMul, 0.95);
            }

          } else if (state.phase === 'brake') {
            // 抵达冷石板急刹减速 + 小弹两下（纯 lift 位移，零缩放）
            state.phaseT += dt * (0.85 + spdMul * 0.15);
            const u = clamp(state.phaseT / M21_CONFIG.bounceDur, 0, 1);

            // 急刹滑行余速衰减，缓慢再滚过 1 格并慢转停稳
            const tgt = slabs[state.curSlabIdx];
            state.rollSpeed = lerp(state.rollSpeed, 0, expSmooth(dt, 9.5));
            const moveD = state.rollSpeed * dt * (1 - u);
            const fwdX = -Math.sin(state.yaw);
            const fwdY =  Math.cos(state.yaw);
            const prevX = state.x, prevY = state.y;
            state.x = lerp(state.x + fwdX * moveD, tgt.x, expSmooth(dt, 8.0));
            state.y = lerp(state.y + fwdY * moveD, tgt.y, expSmooth(dt, 8.0));
            const actualMove = Math.hypot(state.x - prevX, state.y - prevY);
            advanceRollFrames(actualMove, sMul);

            // 两段清晰回弹抛物线：前 58% 第一大弹（2.8 格），后 42% 第二小弹（1.2 格）
            let bLift = 0;
            if (u < 0.58) {
              const b1 = u / 0.58;
              bLift = Math.sin(b1 * Math.PI) * M21_CONFIG.bounceHeights[0] * sMul;
            } else {
              if ((state.bounceDustMask & 1) === 0) {
                state.bounceDustMask |= 1;
                spawnBrakeBurst(vfx, sMul, 0.55);
              }
              const b2 = (u - 0.58) / 0.42;
              bLift = Math.sin(b2 * Math.PI) * M21_CONFIG.bounceHeights[1] * sMul;
            }
            state.bounceLift = bLift;
            state.z = slabTop + bLift;

            if (u >= 1.0) {
              if (isRollOnly) {
                // roll 演示态：急刹弹跳后短暂停稳立刻再加速滚向下一块石板
                state.phase = 'roll_pause';
                state.phaseT = 0;
                state.phaseDur = M21_CONFIG.rollModePauseDur;
                state.bounceLift = 0;
                state.z = slabTop;
              } else {
                enterUncurl();
              }
            }

          } else if (state.phase === 'roll_pause') {
            state.phaseT += dt * spdMul;
            state.z = slabTop;
            state.bounceLift = 0;
            if (state.phaseT >= state.phaseDur) {
              enterRoll();
            }

          } else if (state.phase === 'uncurl') {
            // 半卷过渡：滚球展开成半卷件，再舒展为完整短腿小兽
            state.phaseT += dt * (0.85 + spdMul * 0.15);
            const u = clamp(state.phaseT / state.phaseDur, 0, 1);
            state.z = slabTop + Math.sin(u * Math.PI) * 0.45 * sMul;
            if (u >= 1.0) {
              enterForage();
            }

          } else if (state.phase === 'forage') {
            // 舒展在冷石板上：伸出浅米粉嫩 4 只小短腿，慢慢转身低头舔石板上的耐热苔
            state.phaseT += dt;
            const u = clamp(state.phaseT / Math.max(0.01, state.phaseDur), 0, 1);
            state.z = slabTop;
            state.bounceLift = 0;

            // 石板上微微挪步找耐热苔
            const homeSlab = slabs[state.curSlabIdx];
            const driftAng = state.yaw + Math.sin(time * 1.1) * 0.5;
            const aimX = homeSlab.x + Math.cos(driftAng) * 2.2 * sMul;
            const aimY = homeSlab.y + Math.sin(driftAng) * 2.2 * sMul;
            const prevX = state.x, prevY = state.y;
            state.x = lerp(state.x, aimX, expSmooth(dt, 1.4));
            state.y = lerp(state.y, aimY, expSmooth(dt, 1.4));
            const stepMove = Math.hypot(state.x - prevX, state.y - prevY);
            state.legPhase = (state.legPhase + (stepMove * 1.2 + dt * 2.6 * gFreq)) % TAU;

            // 舒展节拍：前 20% 张望 -> 中段 65% 低头舔耐热苔 -> 尾段抬头准备受惊
            if (u > 0.18 && u < 0.85) {
              state.isLicking = true;
              state.lickPhase += dt * 7.8 * gFreq;
              targetHeadYaw = Math.sin(state.lickPhase * 0.48) * 0.36 * flex;
              state.mossCd -= dt;
              if (vfx && state.mossCd <= 0) {
                state.mossCd = 0.38;
                spawnMossNibbles(vfx, sMul);
              }
            } else {
              state.isLicking = false;
              targetHeadYaw = Math.sin(time * 2.4) * 0.28 * flex;
            }

            if (state.phaseT >= state.phaseDur) {
              enterAlert();
            }

          } else if (state.phase === 'alert') {
            // 突然受惊警觉：猛地抬头竖耳、快速左右扫视（防赤焰飞龙）
            state.phaseT += dt;
            const u = clamp(state.phaseT / state.phaseDur, 0, 1);
            state.z = slabTop + Math.sin(u * Math.PI) * 0.55 * sMul;
            targetHeadYaw = Math.sin(u * Math.PI * 3.0) * 0.62 * flex;
            if (u >= 1.0) {
              enterCurl();
            }

          } else if (state.phase === 'curl') {
            // 受惊咔哒卷回球：切半卷过渡件 + 小跳蓄力 -> 滚往下一块冷石板
            state.phaseT += dt * (0.9 + spdMul * 0.15);
            const u = clamp(state.phaseT / state.phaseDur, 0, 1);
            state.z = slabTop + Math.sin(u * Math.PI) * 1.65 * sMul;
            if (u >= 1.0) {
              spawnBrakeBurst(vfx, sMul, 0.65);
              enterRoll();
            }
          }

          // 安全边界兜底钳制（任何状态绝不越出 maxRadius * 0.78）
          const [finalX, finalY] = clampInSafeDisc(state.x, state.y, hx, hy, safeR);
          state.x = finalX;
          state.y = finalY;

          // 弹簧平滑更新
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          headYawSpring.update(dt, targetHeadYaw, 96 * sp, clamp(7.4 * dScale, 3.6, 12.0));
          bodyRockSpring.update(dt, 0, 112 * sp, clamp(7.2 * dScale, 3.5, 11.5));

          // 接地印与挂点同步
          if (state.phase === 'forage' || state.phase === 'alert') {
            for (let i = 0; i < LEG_SLOTS.length; i++) {
              const lg = LEG_SLOTS[i];
              const [fx, fy] = localToWorldXY(state.x, state.y, state.yaw, lg.lx * sMul, lg.ly * sMul);
              footContacts.push({ x: fx, y: fy, z: state.z, r: 2.0 * sMul });
            }
          } else {
            footContacts.push({ x: state.x, y: state.y, z: state.z, r: 8.5 * sMul });
          }

          sockets.setWorld('back', state.x, state.y, state.z + 10.5 * sMul, state.yaw);
          sockets.setLocal('head', state.x, state.y, state.z, state.yaw, 0, 8.2, 5.2, sMul);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;

          // 1. 自带 3 块立体冷石板落脚点（四重对称 symDeg: 90，稳压在生物底层）
          for (let i = 0; i < slabs.length; i++) {
            const sb = slabs[i];
            list.push({
              partKey: 'coldSlab',
              asset: parts.coldSlab,
              x: sb.x,
              y: sb.y,
              lift: 0,
              ro: sb.yaw,
              symDeg: 90,
              bias: -4.8
            });
          }

          // 2. 滚球态（roll / brake / roll_pause）：6 档花纹转位滚球，配 symDeg: 180 省贴图
          if (state.phase === 'roll' || state.phase === 'brake' || state.phase === 'roll_pause') {
            const bKey = `ball${state.ballIdx}`;
            list.push({
              partKey: bKey,
              asset: parts[bKey],
              x: state.x,
              y: state.y,
              lift: Math.max(0, state.z),
              ro: yw,
              symDeg: 180,
              bias: 0.40
            });
            return list;
          }

          // 3. 半卷过渡态（uncurl / curl）：1 套半卷过渡件平滑衔接卷球与舒展
          if (state.phase === 'uncurl' || state.phase === 'curl') {
            const rock = clamp(bodyRockSpring.x * 0.03, -0.22, 0.22);
            list.push({
              partKey: 'halfCurl',
              asset: parts.halfCurl,
              x: state.x,
              y: state.y,
              lift: Math.max(0, state.z),
              ro: wrapAngle(yw + rock),
              bias: 0.35
            });
            return list;
          }

          // 4. 舒展态（forage / alert）：背甲躯干 + 4 只浅米粉嫩小短腿 + 翘耳头吻（低头舔苔 / 警觉抬头）
          const breathLift = Math.sin(state.legPhase * 0.9) * 0.32 * sMul;
          const isAlert = (state.phase === 'alert');
          const shiverX = isAlert ? Math.sin(state.phaseT * 46) * 0.35 * sMul : 0;
          const shiverY = isAlert ? Math.cos(state.phaseT * 52) * 0.28 * sMul : 0;
          const bodyX = state.x + shiverX;
          const bodyY = state.y + shiverY;
          const bodyLift = Math.max(0, state.z + breathLift);

          // 4a. 4 只浅米粉嫩小短腿（舒展时外展清晰可见，受惊时略微内收准备卷球）
          const tuck = isAlert ? 0.16 : 0.0;
          for (let i = 0; i < LEG_SLOTS.length; i++) {
            const lg = LEG_SLOTS[i];
            const stepW = state.isLicking ? Math.sin(state.legPhase + lg.phase) * 0.45 : Math.sin(state.legPhase + lg.phase) * 0.22;
            const legLift = Math.max(0, Math.cos(state.legPhase + lg.phase)) * 0.55 * sMul;
            const [lx, ly] = localToWorldXY(
              bodyX, bodyY, yw,
              lg.lx * (1 - tuck) * sMul,
              (lg.ly + stepW) * sMul
            );
            list.push({
              partKey: 'tenderLeg',
              asset: parts.tenderLeg,
              x: lx,
              y: ly,
              lift: Math.max(0, state.z - 0.1 * sMul + legLift),
              ro: wrapAngle(yw + lg.baseYaw + stepW * 0.14),
              bias: -0.25
            });
          }

          // 4b. 硬甲躯干
          list.push({
            partKey: 'bodyShell',
            asset: parts.bodyShell,
            x: bodyX,
            y: bodyY,
            lift: bodyLift,
            ro: wrapAngle(yw + clamp(bodyRockSpring.x * 0.012, -0.12, 0.12)),
            bias: 0.20
          });

          // 4c. 翘耳头吻（pivotToWorldXY 锁死颈部枢轴，舔苔低头前探 / 受惊高抬）
          const hYaw = wrapAngle(yw + clamp(headYawSpring.x, -0.72, 0.72));
          const lickNod = state.isLicking ? (0.5 + 0.5 * Math.sin(state.lickPhase)) : 0;
          const headFwd = (7.2 + lickNod * 1.15 - (isAlert ? 0.5 : 0)) * sMul;
          const headLift = bodyLift + (isAlert ? 1.55 : (state.isLicking ? -0.45 - lickNod * 0.45 : 0.45)) * sMul;
          const [hjx, hjy] = localToWorldXY(bodyX, bodyY, yw, 0, headFwd);
          const [hxP, hyP] = pivotToWorldXY(hjx, hjy, hYaw, HEAD_PIVOT.x * sMul, HEAD_PIVOT.y * sMul);
          const hKey = state.isLicking ? 'headLick' : 'headNorm';

          list.push({
            partKey: hKey,
            asset: parts[hKey],
            x: hxP,
            y: hyP,
            lift: Math.max(0, headLift),
            ro: hYaw,
            bias: 0.55
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Fire2LavaRollerDef.id,
            code: Fire2LavaRollerDef.code,
            name: Fire2LavaRollerDef.name,
            status: Fire2LavaRollerDef.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            phase: state.phase,
            ballIdx: state.ballIdx,
            ballFrames: M21_CONFIG.ballFrames,
            ballDiameter: M21_CONFIG.ballDiameter,
            ballRadius: M21_CONFIG.ballRadius,
            rollRadPerGrid: Number(M21_CONFIG.rollRadPerGrid.toFixed(4)),
            slabCount: slabs.length,
            footRadius: Fire2LavaRollerDef.footRadius,
            headZ: 19,
            centerZ: 10,
            blocks: Fire2LavaRollerDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map((k) => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Fire2LavaRollerDef);
})(window.PixelWorkshop);
