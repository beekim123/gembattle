'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, lerp, smoothstep, localToWorldXY, expSmooth } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // N02 标杆 · 重甲盾卫队友（坦克，+Y 正前，z=0 贴地，站高约 25~26 格）
  //   - 宽厚挺拔体格：宽大钢蓝镶金分块肩甲与胸甲、T 字面缝铁盔 + 鲜红短羽缨
  //   - 左手超大圆角塔盾（深钢蓝盾面 + 粗亮金十字/棱框浮雕）锁死左手腕枢轴
  //   - 右手沉实短柄圆头破盾战锤锁死右手腕枢轴，腰间系红褐厚战裙护片
  //   - 4 套动作：idle / patrol / guard / rest_drink；3 套皮肤
  //   - 严守清晰度铁律：glowKeys 留空、常态 1:1 无缩放、26 色 0 重色、0 禁用字
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      armorDark:   '#1f334a',
      armorMid:    '#37597d',
      armorHi:     '#6b94bd',
      goldDark:    '#9e6c14',
      goldMid:     '#e0a922',
      goldHi:      '#ffdf6b',
      steelDark:   '#36414f',
      steelMid:    '#68788c',
      steelHi:     '#b5c8db',
      plumeDark:   '#87161e',
      plumeMid:    '#d92935',
      plumeHi:     '#ff666b',
      skirtDark:   '#4f1e1a',
      skirtMid:    '#85352c',
      skirtHi:     '#b85648',
      leatherDark: '#382214',
      leatherMid:  '#663f25',
      leatherHi:   '#96613e',
      foamDark:    '#c4b89c',
      foamMid:     '#ebe2cc',
      foamHi:      '#faf7ed',
      visorDark:   '#0f131a',
      visorSlit:   '#1c2430',
      skinDark:    '#a67452',
      skinMid:     '#d49d75',
      skinHi:      '#f0be96'
    },
    glowKeys: [],
    parts: [
      'foot', 'leg', 'skirt', 'body', 'trim', 'belt', 'pauldron',
      'helm', 'visor', 'plume', 'arm', 'forearm',
      'shield', 'shieldTrim', 'hammerGrip', 'hammerHead', 'mug', 'foam'
    ],
    noCrease: [
      ['visor', 'helm'], ['plume', 'helm'], ['leg', 'foot'],
      ['shield', 'shieldTrim'], ['body', 'trim'], ['pauldron', 'trim'],
      ['mug', 'foam'], ['hammerHead', 'trim']
    ],
    materials: {
      armor:   ['armorDark',   'armorMid',   'armorHi'],
      gold:    ['goldDark',    'goldMid',    'goldHi'],
      steel:   ['steelDark',   'steelMid',   'steelHi'],
      plume:   ['plumeDark',   'plumeMid',   'plumeHi'],
      skirt:   ['skirtDark',   'skirtMid',   'skirtHi'],
      leather: ['leatherDark', 'leatherMid', 'leatherHi'],
      foam:    ['foamDark',    'foamMid',    'foamHi'],
      skin:    ['skinDark',    'skinMid',    'skinHi']
    },
    protectedParts: ['visor', 'plume']
  });

  const SKINS = [
    {
      id: 'steel_gold',
      name: '钢蓝金盾',
      dot: '#37597d',
      outline: '#0d141f',
      pal: {}
    },
    {
      id: 'iron_crimson',
      name: '黑铁赤缨',
      dot: '#3a3f4d',
      outline: '#140c0d',
      pal: {
        armorDark: '#20232b', armorMid: '#3a3f4d', armorHi: '#697287',
        goldDark:  '#8c281c', goldMid:  '#cc4533', goldHi:  '#f57a62',
        skirtDark: '#301417', skirtMid: '#5c2026', skirtHi: '#8a353d'
      }
    },
    {
      id: 'bronze_jade',
      name: '古铜翠纹',
      dot: '#805e38',
      outline: '#14110b',
      pal: {
        armorDark: '#4d3720', armorMid: '#805e38', armorHi: '#b58d5e',
        goldDark:  '#196b54', goldMid:  '#2da884', goldHi:  '#6ee0bd',
        plumeDark: '#1c5e4c', plumeMid: '#2fa685', plumeHi: '#6be3be',
        skirtDark: '#362d1e', skirtMid: '#5e4e35', skirtHi: '#8c7653'
      }
    }
  ];

  // 武器与大盾的握持枢轴（局部坐标，摆放时一律用 localToWorldXY(handX, handY, yaw, -px, -py) 锁死手腕）
  const SHIELD_PIVOT = { x: 0.0, y: -1.8 };
  const HAMMER_PIVOT = { x: 0.0, y: -2.0 };
  const MUG_PIVOT    = { x: 0.0, y: -1.4 };
  const UPPER_PIVOT  = { x: 0.0, y: -1.4 };
  const FORE_PIVOT   = { x: 0.0, y: -1.6 };

  // 1. 粗壮重甲双腿（大腿 / 护胫小腿 / 铁靴）
  function buildLegSeg(makeCanvas, rTop, rBot, hLen, matName) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 3);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, mat(matName), partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildBoot(makeCanvas) {
    const m = new VoxelModel(8, 9, 5, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0.0, 2.8, 1.85, 1.85, 1.3, mat('armor'), partId.leg, true);
    m.paintEllipsoid(0, 1.0, 1.3, 2.15, 2.85, 1.45, mat('steel'), partId.foot, true);
    // 靴尖金边护片
    m.fillAABB(-1.6, 1.6, 2.4, 3.8, 0.4, 2.0, (x, y, z, X, Y) => {
      if (Math.abs(X) <= 1.4 && Y >= 2.6 && Y <= 3.7 && z <= 1) {
        m.setRaw(x, y, z, mat('gold'), partId.trim);
      }
    });
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.9 });
  }

  // 2. 宽厚钢蓝镶金胸甲 + 腰间红褐厚战裙护片
  function buildTorso(makeCanvas) {
    const m = new VoxelModel(15, 13, 14, SPEC);
    const { mat, partId } = SPEC;
    // 主胸腹方硬重甲块（比普通人形更宽厚挺拔）
    m.fillAABB(-6.2, 6.2, -4.8, 4.8, 0, 13, (x, y, z, X, Y) => {
      // 上宽下略收的倒梯形重甲躯干
      const zNorm = clamp((z - 3.5) / 8.5, 0, 1);
      const halfW = lerp(4.4, 5.6, zNorm);
      const halfD = lerp(3.4, 4.2, zNorm);
      const ax = Math.abs(X) / halfW;
      const ay = Math.abs(Y) / halfD;
      // 圆角方盒超椭圆，轮廓方硬有力量感
      const sq = Math.pow(ax, 3.2) + Math.pow(ay, 3.2);
      if (z >= 4.2 && z <= 11.8 && sq <= 1.0) {
        m.setRaw(x, y, z, mat('armor'), partId.body);
      }
      // 胸口亮金 V 字领边与纵脊嵌条
      if (z >= 10.6 && z <= 12.0 && sq <= 1.05 && sq >= 0.62) {
        m.setRaw(x, y, z, mat('gold'), partId.trim);
      }
      if (z >= 6.0 && z <= 11.2 && Math.abs(X) <= 0.9 && Y >= halfD * 0.72 && Y <= halfD + 0.5) {
        m.setRaw(x, y, z, mat('gold'), partId.trim);
      }
      // 颈部内衬铁领
      if (z >= 11.5 && z <= 13.0 && Math.hypot(X / 2.6, Y / 2.4) <= 1.0) {
        m.setRaw(x, y, z, mat('steel'), partId.helm);
      }
      // 腰间粗皮带 + 亮金大扣
      if (z >= 4.0 && z <= 5.4 && Math.pow(Math.abs(X) / 5.0, 3.0) + Math.pow(Math.abs(Y) / 3.9, 3.0) <= 1.0) {
        m.setRaw(x, y, z, mat('leather'), partId.belt);
      }
      if (z >= 3.8 && z <= 5.6 && Math.abs(X) <= 1.6 && Y >= 3.2 && Y <= 4.6) {
        m.setRaw(x, y, z, mat('gold'), partId.trim);
      }
      // 腰下红褐厚战裙护片（前/后/两侧分块遮盖髋关节，防露缝）
      if (z >= 0.4 && z <= 4.3) {
        const sW = lerp(5.3, 4.7, z / 4.3);
        const sD = lerp(4.1, 3.7, z / 4.3);
        const sSq = Math.pow(Math.abs(X) / sW, 2.8) + Math.pow(Math.abs(Y) / sD, 2.8);
        if (sSq <= 1.0 && sSq >= 0.42) {
          // 战裙底部一圈亮金镶边
          const isRim = z <= 1.0;
          m.setRaw(x, y, z, isRim ? mat('gold') : mat('skirt'), isRim ? partId.trim : partId.skirt);
        }
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.0 });
  }

  // 3. 独立厚重分块肩甲（钢蓝厚片 + 粗亮金外沿，踏步时可独立微颠）
  function buildPauldron(makeCanvas, side) {
    const m = new VoxelModel(10, 10, 8, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-4.2, 4.2, -4.2, 4.2, 0, 7, (x, y, z, X, Y) => {
      const rx = (X - side * 0.4) / 3.7;
      const ry = Y / 3.7;
      const rz = (z - 3.6) / 3.1;
      const d = Math.pow(Math.abs(rx), 2.6) + Math.pow(Math.abs(ry), 2.6) + Math.pow(Math.abs(rz), 2.4);
      if (d <= 1.0 && z >= 1.2) {
        const isTrim = (z <= 2.2) || (Math.abs(Y) <= 0.8 && z >= 4.8);
        m.setRaw(x, y, z, isTrim ? mat('gold') : mat('armor'), isTrim ? partId.trim : partId.pauldron);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0 });
  }

  // 4. T 字面缝铁盔 + 鲜红短羽缨
  function buildHead(makeCanvas) {
    const W = 11, D = 12, H = 11;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 桶形圆顶铁盔本体（z = 1..7.6）
    m.fillAABB(-4.5, 4.5, -4.8, 4.8, 0, 10, (x, y, z, X, Y) => {
      const rTop = z > 5.5 ? lerp(3.6, 2.4, clamp((z - 5.5) / 2.2, 0, 1)) : 3.65;
      const sq = Math.pow(Math.abs(X) / rTop, 2.6) + Math.pow(Math.abs(Y) / (rTop * 1.04), 2.6);
      if (z >= 1.0 && z <= 7.5 && sq <= 1.0) {
        m.setRaw(x, y, z, mat('steel'), partId.helm);
      }
      // 额箍亮金环带
      if (z >= 5.2 && z <= 6.1 && sq <= 1.08 && sq >= 0.72) {
        m.setRaw(x, y, z, mat('gold'), partId.trim);
      }
      // 护颊钢蓝镶片
      if (z >= 1.2 && z <= 4.4 && Math.abs(X) >= 2.2 && Y >= 1.0 && sq <= 1.02) {
        m.setRaw(x, y, z, mat('armor'), partId.body);
      }
    });
    // 顶盔短羽缨（鲜红短羽，沿中线略向后扬，俯视高对比辨识）
    m.paintCapsule(0, 1.2, 8.2, 0, -2.6, 9.6, 1.35, 1.65, mat('plume'), partId.plume, true);
    m.paintCapsule(0, -2.2, 9.4, 0, -4.2, 8.2, 1.45, 0.95, mat('plume'), partId.plume, true);
    // 羽缨底座金扣
    m.paintEllipsoid(0, 0.2, 7.6, 1.3, 1.8, 0.9, mat('gold'), partId.trim, true);

    m.despeckle();
    m.applyArtShading(true);

    // 沿表面扫描雕刻清晰 T 字面缝（横向眼缝 + 纵向鼻缝，0.6 俯视清晰锐利）
    const hw = W * 0.5 - 0.5;
    for (let ix = -2; ix <= 2; ix++) {
      const vx = Math.round(hw + ix);
      const vz = 4;
      for (let y = D - 1; y >= 1; y--) {
        if (m.getId(vx, y, vz)) {
          m.setRaw(vx, y, vz, keyToId.visorDark, partId.visor);
          if (y > 1) m.setRaw(vx, y - 1, vz, keyToId.visorSlit, partId.visor);
          break;
        }
      }
    }
    const midX = Math.round(hw);
    for (let vz = 2; vz <= 3; vz++) {
      for (let y = D - 1; y >= 1; y--) {
        if (m.getId(midX, y, vz)) {
          m.setRaw(midX, y, vz, keyToId.visorDark, partId.visor);
          break;
        }
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.5 });
  }

  // 5. 两段式重甲手臂（大臂 + 护腕小臂）
  function buildUpperArm(makeCanvas) {
    const m = new VoxelModel(7, 9, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, UPPER_PIVOT.y, 3.0, 0, UPPER_PIVOT.y + 3.4, 2.6, 1.65, 1.50, mat('armor'), partId.arm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.6 });
  }

  function buildForearm(makeCanvas) {
    const m = new VoxelModel(7, 9, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, FORE_PIVOT.y, 2.6, 0, FORE_PIVOT.y + 3.4, 2.8, 1.48, 1.55, mat('steel'), partId.forearm, true);
    m.paintEllipsoid(0, FORE_PIVOT.y + 2.4, 2.8, 1.70, 0.9, 1.65, mat('gold'), partId.trim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5 });
  }

  // 6. 左手超大圆角塔盾（深钢蓝盾面 + 粗亮金十字/棱框浮雕，局部 +Y 为外盾面）
  function buildTowerShield(makeCanvas) {
    const m = new VoxelModel(14, 7, 19, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-5.8, 5.8, -2.5, 2.8, 0, 18, (x, y, z, X, Y) => {
      // 宽大圆角矩形轮廓（底部略收成盾尖弧）
      const bottomTaper = z < 4.5 ? lerp(0.76, 1.0, z / 4.5) : 1.0;
      const halfW = 5.1 * bottomTaper;
      const inRect = Math.abs(X) <= halfW && z >= 1.0 && z <= 17.0;
      if (!inRect) return;
      // 削去四角做硬朗圆角
      const cornerTop = (z > 15.2) && (Math.abs(X) + (z - 15.2) * 1.1 > halfW + 0.6);
      const cornerBot = (z < 2.8) && (Math.abs(X) + (2.8 - z) * 1.1 > halfW + 0.5);
      if (cornerTop || cornerBot) return;

      // 盾身轻微弧面（外凸向 +Y）
      const curve = (1 - (X / 5.5) * (X / 5.5)) * 0.85;
      const yMin = -0.6 + curve * 0.5;
      const yMax = 1.3 + curve;

      if (Y >= yMin && Y <= yMax) {
        const isOuterBorder = Math.abs(X) >= halfW - 1.25 || z <= 2.2 || z >= 15.8;
        const isCross = (Math.abs(X) <= 1.05 && z >= 3.0 && z <= 15.0)
                     || (Math.abs(z - 10.2) <= 1.15 && Math.abs(X) <= halfW - 0.8);
        if (isOuterBorder) {
          m.setRaw(x, y, z, mat('gold'), partId.shieldTrim);
        } else {
          m.setRaw(x, y, z, mat('armor'), partId.shield);
        }
        // 外表面 +1 格亮金棱框与粗十字浮雕
        if ((isCross || isOuterBorder) && Y >= yMax - 0.65) {
          m.setRaw(x, y, z, mat('gold'), partId.shieldTrim);
        }
      }
      // 凸起 1 格的前表面粗亮金十字与中心盾徽
      if (Y > yMax && Y <= yMax + 0.95) {
        const isCross = (Math.abs(X) <= 0.95 && z >= 3.2 && z <= 14.8)
                     || (Math.abs(z - 10.2) <= 1.0 && Math.abs(X) <= halfW - 1.1);
        const isBoss = Math.hypot(X, z - 10.2) <= 2.15;
        if (isCross || isBoss) {
          m.setRaw(x, y, z, mat('gold'), partId.shieldTrim);
        }
      }
    });
    // 内侧皮革握把（精准落在 SHIELD_PIVOT 处）
    m.paintCapsule(0, SHIELD_PIVOT.y, 7.5, 0, SHIELD_PIVOT.y, 11.5, 0.85, 0.85, mat('leather'), partId.belt, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.2 });
  }

  // 7. 右手沉实短柄圆头破盾战锤（握持枢轴锁在 HAMMER_PIVOT）
  function buildWarhammer(makeCanvas) {
    const m = new VoxelModel(11, 13, 15, SPEC);
    const { mat, partId } = SPEC;
    // 短而粗实的皮革包柄（从握点向上前斜伸）
    const p0 = [0, HAMMER_PIVOT.y, 1.8];
    const p1 = [0, HAMMER_PIVOT.y + 4.4, 11.2];
    m.paintCapsule(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], 1.15, 1.25, mat('leather'), partId.hammerGrip, true);
    // 柄尾金配重球
    m.paintEllipsoid(0, HAMMER_PIVOT.y - 0.3, 1.3, 1.45, 1.45, 1.2, mat('gold'), partId.trim, true);
    // 沉实圆头破盾大锤头（横向粗圆柱 + 两端厚亮金撞击箍）
    const hx = 0, hy = p1[1] + 0.6, hz = 11.4;
    m.paintCapsule(hx - 3.2, hy, hz, hx + 3.2, hy, hz, 2.35, 2.35, mat('steel'), partId.hammerHead, true);
    // 锤头两端亮金加强环与中脊金箍
    m.paintEllipsoid(hx - 3.3, hy, hz, 0.95, 2.45, 2.45, mat('gold'), partId.trim, true);
    m.paintEllipsoid(hx + 3.3, hy, hz, 0.95, 2.45, 2.45, mat('gold'), partId.trim, true);
    m.paintEllipsoid(hx, hy, hz, 1.1, 2.55, 2.55, mat('gold'), partId.trim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6 });
  }

  // 8. 酒馆候雇举杯大麦酒杯（rest_drink 动作专用）
  function buildAleMug(makeCanvas) {
    const m = new VoxelModel(7, 8, 8, SPEC);
    const { mat, partId } = SPEC;
    const cy = MUG_PIVOT.y + 1.8;
    m.paintCapsule(0, cy, 1.4, 0, cy, 5.2, 2.1, 2.25, mat('leather'), partId.mug, true);
    // 铜金箍环
    m.paintEllipsoid(0, cy, 2.2, 2.3, 2.3, 0.65, mat('gold'), partId.trim, true);
    m.paintEllipsoid(0, cy, 4.4, 2.4, 2.4, 0.65, mat('gold'), partId.trim, true);
    // 鼓出杯口的绵密麦酒白沫
    m.paintEllipsoid(0, cy, 6.0, 2.2, 2.2, 1.35, mat('foam'), partId.foam, true);
    // 杯柄（对准握持枢轴）
    m.paintCapsule(0, MUG_PIVOT.y, 2.2, 0, MUG_PIVOT.y, 4.6, 0.7, 0.7, mat('gold'), partId.trim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5 });
  }

  const Def = {
    id: 'npc_vanguard',
    code: 'N02',
    name: '重甲盾卫队友',
    tag: '重甲持盾近战',
    summary: '酒馆核心坦克标杆：宽厚钢蓝镶金分块肩胸甲、羽缨铁盔、锁腕超大金徽塔盾与短柄破盾战锤，支持顿盾格挡与酒馆举杯',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 8.6,
    ecoWeight: 1.35,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',       name: '磐石待机', loop: true,  status: 'done' },
      { id: 'patrol',     name: '重甲巡步', loop: true,  status: 'done' },
      { id: 'guard',      name: '顿盾格挡', loop: false, duration: 2.2, status: 'done' },
      { id: 'rest_drink', name: '靠盾举杯', loop: false, duration: 2.5, status: 'done' }
    ],
    blocks: [
      '宽厚重甲胸铠与战裙', '独立微颠双肩甲', 'T字面缝羽缨铁盔',
      '锁腕超大金徽塔盾', '两段滞后手臂+短柄战锤', '顿盾冲击波与靠盾举杯'
    ],
    soulHabit: '稳如磐石深呼吸轻磕盾面 → 沉稳低频重甲迈步 → 顿盾正前格挡迸青金波 → 酒馆靠盾豪爽举杯',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legThigh:  buildLegSeg(makeCanvas, 2.10, 1.82, 4.6, 'armor'),
        legShin:   buildLegSeg(makeCanvas, 1.82, 1.65, 4.4, 'steel'),
        boot:      buildBoot(makeCanvas),
        torso:     buildTorso(makeCanvas),
        pauldronL: buildPauldron(makeCanvas, -1),
        pauldronR: buildPauldron(makeCanvas,  1),
        head:      buildHead(makeCanvas),
        upperArm:  buildUpperArm(makeCanvas),
        forearm:   buildForearm(makeCanvas),
        shield:    buildTowerShield(makeCanvas),
        hammer:    buildWarhammer(makeCanvas),
        mug:       buildAleMug(makeCanvas)
      };

      // 稳健二足重甲 IK（hipZ=9.0 被红褐战裙稳稳包覆，双足微宽站稳）
      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.8, hipY: 0.0, hipZ: 9.0, restX: -3.0, restY: 0.3, group: 0, L1: 4.8, L2: 4.8, bendDir: 1 },
        { id: 'R', hipX:  2.8, hipY: 0.0, hipZ: 9.0, restX:  3.0, restY: 0.3, group: 1, L1: 4.8, L2: 4.8, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 2.3, stepDuration: 0.24, stepHeight: 1.8, strideAnticipation: 0.42 });

      const bodyBounce     = new SpringDamper1D(0, 170, 9.5);
      const pauldronBounce = new SpringDamper1D(0, 130, 6.2);
      const headYawSpring  = new SpringDamper1D(0, 110, 8.5);
      const lArmSpring     = new SpringDamper1D(0, 135, 8.0);
      const lForeSpring    = new SpringDamper1D(0, 115, 7.2);
      const rArmSpring     = new SpringDamper1D(0, 135, 8.0);
      const rForeSpring    = new SpringDamper1D(0, 115, 7.2);
      const shieldRoll     = new SpringDamper1D(0, 140, 8.2);
      const hammerSwing    = new SpringDamper1D(0, 130, 7.4);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        moveBlend: 0, stepPhase: 0,
        habitTimer: opts.seed || 0,
        action: 'idle', actionTime: 0,
        tapTimer: 2.2, tapPhase: 0,
        guardSlamDone: false,
        drinkCheerDone: false,
        tiltX: 0, tiltY: 0
      };
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: Def,
        cachePrefix: `npc_vanguard_${Math.random().toString(36).slice(2, 7)}`,
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
          state.x = hx; state.y = hy; state.yaw = hyaw; state.z = 0;
          state.vx = 0; state.vy = 0; state.moveBlend = 0;
          state.guardSlamDone = false;
          state.drinkCheerDone = false;
          gait.reset(hx, hy, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = params.springiness ?? 1.0;
          const gFreq = params.gaitFreq ?? 1.0;
          state.habitTimer += dt;

          const act = (eco && eco.action) ? eco.action : (eco && eco.patrol ? 'patrol' : 'idle');
          const actT = (eco && eco.actionTime != null) ? eco.actionTime : 0;
          if (act !== state.action || actT < state.actionTime - 0.1) {
            state.guardSlamDone = false;
            state.drinkCheerDone = false;
          }
          state.action = act;
          state.actionTime = actT;

          const isPatrol = act === 'patrol';
          Propulsion.multiLegWalk(state, dt, time, { ...params, speed: (params.speed ?? 1.0) * 0.80 }, {
            ...eco, patrol: isPatrol, walkStyle: 'heavy', baseLift: 0
          });
          state.z = 0;

          const spdNow = Math.hypot(state.vx, state.vy);
          const targetMove = isPatrol ? clamp((spdNow - 1.0) / 6.0, 0, 1) : 0;
          state.moveBlend = lerp(state.moveBlend, targetMove, expSmooth(dt, 9.0));
          state.stepPhase += dt * (2.6 + state.moveBlend * 6.4) * gFreq;

          // 格挡动作双腿错开半蹲稳扎，其它动作走标准二足步态
          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 0.92,
            stepHeight: 1.8 * sMul,
            stepThreshold: 2.3 * sMul
          });
          state.tiltX = lerp(state.tiltX, gaitRes.tiltX * 0.55 * sMul, expSmooth(dt, 11));
          state.tiltY = lerp(state.tiltY, gaitRes.tiltY * 0.55 * sMul, expSmooth(dt, 11));

          // 温和钳位防急转脱胯
          const maxFootOffset = 4.2 * sMul;
          for (const leg of gait.legs) {
            const [idealX, idealY] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
            const dx = leg.footX - idealX, dy = leg.footY - idealY;
            const d = Math.hypot(dx, dy);
            if (d > maxFootOffset) {
              leg.footX = idealX + (dx / d) * maxFootOffset;
              leg.footY = idealY + (dy / d) * maxFootOffset;
            }
          }

          if (gaitRes.landed.length > 0) {
            bodyBounce.impulse(-7.5 * sp);
            pauldronBounce.impulse(12.5 * sp);
            for (const l of gaitRes.landed) {
              if (vfx && habitat) EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.72 * sMul);
            }
          }

          instance.footContacts = gait.legs.map(l => ({ x: l.footX, y: l.footY, z: l.footZ, r: 2.6 * sMul }));

          // 目标骨骼角（按动作分化）
          let headT = Math.sin(time * 0.9) * 0.12;
          let lArmT = -0.25;
          let lForeT = 0.55;
          let rArmT = 0.20;
          let rForeT = -0.25;
          let shieldT = 0.18;
          let hammerT = 0.10;

          if (act === 'idle') {
            // 稳如磐石待机：偶尔右手锤柄轻磕盾面发出小尘粒
            state.tapTimer -= dt;
            if (state.tapTimer <= 0) {
              state.tapTimer = 3.8;
              state.tapPhase = 0.65;
            }
            if (state.tapPhase > 0) {
              const prevTap = state.tapPhase;
              state.tapPhase = Math.max(0, state.tapPhase - dt);
              const u = 1 - state.tapPhase / 0.65;
              const tapPulse = Math.sin(u * Math.PI);
              rArmT = 0.20 + tapPulse * 0.55;
              rForeT = -0.25 - tapPulse * 0.50;
              hammerT = 0.10 - tapPulse * 0.48;
              lArmT = -0.25 + tapPulse * 0.16;
              if (prevTap > 0.34 && state.tapPhase <= 0.34) {
                shieldRoll.impulse(-6.5 * sp);
                pauldronBounce.impulse(5.5 * sp);
                if (vfx) {
                  const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, -1.2 * sMul, 6.2 * sMul);
                  for (let k = 0; k < 4; k++) {
                    const a = (k / 4) * Math.PI * 2 + time;
                    vfx.spawnParticle(
                      sx, sy, 12.5 * sMul,
                      Math.cos(a) * 6.5, Math.sin(a) * 6.5, 4.5 + k * 1.1,
                      0.32, 1.3, k % 2 === 0 ? '#ffdf6b' : '#d6ccb8', false, 20
                    );
                  }
                }
              }
            }
          } else if (act === 'patrol') {
            const sw = Math.sin(state.stepPhase) * state.moveBlend;
            const swLag = Math.sin(state.stepPhase - 0.80) * state.moveBlend;
            headT = sw * 0.08;
            lArmT = -0.20 + sw * 0.24;
            lForeT = 0.52 + swLag * 0.18;
            rArmT = 0.18 - sw * 0.42;
            rForeT = -0.22 - swLag * 0.32;
            shieldT = 0.15 + swLag * 0.10;
            hammerT = 0.08 - swLag * 0.28;
          } else if (act === 'guard') {
            // 0..0.42s 横移大盾至正前并半蹲 -> 0.42..0.55s 顿地迸出青金格挡波 -> 维持 -> 1.75..2.2s 收回
            const pIn = smoothstep(0.0, 0.38, actT);
            const pOut = 1 - smoothstep(1.75, 2.20, actT);
            const env = pIn * pOut;
            headT = -0.05 * env;
            lArmT = lerp(-0.25, 0.62, env);
            lForeT = lerp(0.55, 0.78, env);
            shieldT = lerp(0.18, -0.02, env);
            rArmT = lerp(0.20, -0.45, env);
            rForeT = lerp(-0.25, -0.40, env);
            hammerT = lerp(0.10, 0.35, env);

            if (!state.guardSlamDone && actT >= 0.42) {
              state.guardSlamDone = true;
              bodyBounce.impulse(-16.0 * sp);
              pauldronBounce.impulse(18.0 * sp);
              if (vfx) {
                const [gx, gy] = localToWorldXY(state.x, state.y, state.yaw, 0, 8.6 * sMul);
                if (habitat) EnvFeedback.emitFootstep(vfx, habitat, gx, gy, 1.25 * sMul);
                // 盾前迸出一圈青金格挡冲击波粒
                for (let k = 0; k < 14; k++) {
                  const ang = state.yaw + Math.PI * 0.5 + ((k / 13) - 0.5) * 2.15;
                  const spd = 16 + (k % 3) * 5.5;
                  vfx.spawnParticle(
                    gx, gy, (2.5 + (k % 4) * 2.2) * sMul,
                    Math.cos(ang) * spd, Math.sin(ang) * spd, 4.0 + (k % 3) * 2.5,
                    0.46, 1.9, k % 2 === 0 ? '#5ce6d6' : '#ffdf6b', true, 12
                  );
                }
              }
            }
          } else if (act === 'rest_drink') {
            // 酒馆候雇动作：大盾稳稳靠在腿侧，右手高举麦酒杯豪爽大笑
            const pIn = smoothstep(0.0, 0.42, actT);
            const pOut = 1 - smoothstep(2.05, 2.50, actT);
            const env = pIn * pOut;
            const laugh = Math.sin(actT * 13.5) * env;
            headT = 0.14 * env + laugh * 0.08;
            lArmT = lerp(-0.25, -0.62, env);
            lForeT = lerp(0.55, 0.15, env);
            shieldT = lerp(0.18, 0.55, env);
            rArmT = lerp(0.20, 0.72 + laugh * 0.12, env);
            rForeT = lerp(-0.25, 0.35 + laugh * 0.16, env);
            hammerT = 0.0;
            if (!state.drinkCheerDone && actT >= 0.75) {
              state.drinkCheerDone = true;
              pauldronBounce.impulse(10.0 * sp);
              if (vfx) {
                const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, 6.2 * sMul, 5.4 * sMul);
                for (let k = 0; k < 5; k++) {
                  const a = (k / 5) * Math.PI * 2;
                  vfx.spawnParticle(
                    mx, my, 17.5 * sMul,
                    Math.cos(a) * 5.5, Math.sin(a) * 5.5, 9.0 + k * 1.4,
                    0.42, 1.35, k % 2 === 0 ? '#faf7ed' : '#ffdf6b', false, 26
                  );
                }
              }
            }
          }

          bodyBounce.update(dt, 0, 170 * sp, 9.5);
          pauldronBounce.update(dt, 0, 130 * sp, 6.2);
          headYawSpring.update(dt, headT, 110 * sp, 8.5);
          lArmSpring.update(dt, lArmT, 135 * sp, 8.0);
          lForeSpring.update(dt, lForeT, 115 * sp, 7.2);
          rArmSpring.update(dt, rArmT, 135 * sp, 8.0);
          rForeSpring.update(dt, rForeT, 115 * sp, 7.2);
          shieldRoll.update(dt, shieldT, 140 * sp, 8.2);
          hammerSwing.update(dt, hammerT, 130 * sp, 7.4);
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const act = state.action;
          const actT = state.actionTime;

          const guardEnv = act === 'guard'
            ? smoothstep(0.0, 0.38, actT) * (1 - smoothstep(1.75, 2.20, actT))
            : 0;
          const drinkEnv = act === 'rest_drink'
            ? smoothstep(0.0, 0.42, actT) * (1 - smoothstep(2.05, 2.50, actT))
            : 0;

          const breath = Math.sin(state.habitTimer * 2.1) * 0.38 * (1 - state.moveBlend * 0.5);
          const walkBob = Math.abs(Math.sin(state.stepPhase)) * 0.55 * state.moveBlend;
          const laughBob = drinkEnv * Math.abs(Math.sin(actT * 13.5)) * 0.55;
          const guardDrop = -guardEnv * 1.65;
          const bob = clamp(bodyBounce.x * 0.05 + breath + walkBob + laughBob + guardDrop, -2.0, 1.15) * sMul;
          const pauldronJolt = clamp(pauldronBounce.x * 0.06, -0.7, 1.15) * sMul;

          // 1. 双腿（格挡时双脚自然前后微错稳扎，常态走 IK）
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const isLeft = i === 0;
            let fx = l.footX, fy = l.footY, fz = l.footZ;
            if (guardEnv > 0.01) {
              const [gx, gy] = localToWorldXY(state.x, state.y, yw, (isLeft ? -3.4 : 3.6) * sMul, (isLeft ? 1.8 : -1.5) * sMul);
              fx = lerp(fx, gx, guardEnv);
              fy = lerp(fy, gy, guardEnv);
              fz = lerp(fz, 0, guardEnv);
            }
            const hx = l.hipWX + state.tiltX;
            const hy = l.hipWY + state.tiltY;
            const hz = l.hipWZ + bob;
            const kx = lerp(hx, fx, 0.45);
            const ky = lerp(hy, fy, 0.45);
            const kz = lerp(hz, fz + 1.8 * sMul, 0.50);
            list.push(
              { partKey: 'legThigh', asset: parts.legThigh, x: lerp(hx, kx, 0.35), y: lerp(hy, ky, 0.35), lift: Math.max(0, lerp(hz, kz, 0.35) - 2.2 * sMul), ro: yw, bias: -0.34, symDeg: 90 },
              { partKey: 'legShin',  asset: parts.legShin,  x: lerp(kx, fx, 0.50), y: lerp(ky, fy, 0.50), lift: Math.max(0, lerp(kz, fz + 1.4 * sMul, 0.50) - 2.0 * sMul), ro: yw, bias: -0.28, symDeg: 90 },
              { partKey: 'boot',     asset: parts.boot,     x: fx, y: fy, lift: Math.max(0, fz), ro: yw, bias: -0.22 }
            );
          }

          // 2. 躯干重甲与红褐战裙（稳稳包住髋部）
          const tx = state.x + state.tiltX;
          const ty = state.y + state.tiltY;
          const torsoLift = 6.4 * sMul + bob;
          list.push({
            partKey: 'torso', asset: parts.torso,
            x: tx, y: ty, lift: torsoLift, ro: yw, bias: 0.14
          });

          // 3. 独立厚重双肩甲（随踏步/顿盾微颠）
          const shZ = torsoLift + 7.4 * sMul;
          const [lShX, lShY] = localToWorldXY(tx, ty, yw, -5.8 * sMul, 0.2 * sMul);
          const [rShX, rShY] = localToWorldXY(tx, ty, yw,  5.8 * sMul, 0.2 * sMul);
          list.push(
            { partKey: 'pauldronL', asset: parts.pauldronL, x: lShX, y: lShY, lift: shZ + pauldronJolt, ro: yw, bias: 0.32 },
            { partKey: 'pauldronR', asset: parts.pauldronR, x: rShX, y: rShY, lift: shZ + pauldronJolt * 0.85, ro: yw, bias: 0.32 }
          );

          // 4. T 字面缝铁盔 + 鲜红短羽缨
          const hYaw = yw + clamp(headYawSpring.x, -0.52, 0.52);
          const [hx, hy] = localToWorldXY(tx, ty, yw, 0, 0.4 * sMul);
          const headLift = torsoLift + 9.2 * sMul + pauldronJolt * 0.25;
          list.push({
            partKey: 'head', asset: parts.head,
            x: hx, y: hy, lift: headLift, ro: hYaw, bias: 0.46
          });

          // 5. 左臂两段 FK + 锁腕超大塔盾
          const lUpperYaw = yw + lArmSpring.x;
          const [lUWx, lUWy] = localToWorldXY(lShX, lShY, lUpperYaw, -UPPER_PIVOT.x * sMul, -UPPER_PIVOT.y * sMul);
          const [lElbX, lElbY] = localToWorldXY(lShX, lShY, lUpperYaw, 0, 3.4 * sMul);
          const lForeYaw = lUpperYaw + lForeSpring.x;
          const [lFWx, lFWy] = localToWorldXY(lElbX, lElbY, lForeYaw, -FORE_PIVOT.x * sMul, -FORE_PIVOT.y * sMul);
          const [lHandX, lHandY] = localToWorldXY(lElbX, lElbY, lForeYaw, 0, 3.4 * sMul);

          const armBaseZ = torsoLift + 5.2 * sMul;
          const lHandZ = armBaseZ - guardEnv * 1.4 * sMul - drinkEnv * 2.2 * sMul;
          list.push(
            { partKey: 'upperArmL', asset: parts.upperArm, x: lUWx, y: lUWy, lift: armBaseZ + 0.6 * sMul, ro: lUpperYaw, bias: 0.22 },
            { partKey: 'forearmL',  asset: parts.forearm,  x: lFWx, y: lFWy, lift: lHandZ, ro: lForeYaw, bias: 0.28 }
          );

          // 超大圆角塔盾：常态锁左手腕，顿盾格挡横移正前顿地，靠盾举杯时稳稳靠在左腿外侧
          let shPivotX = lHandX, shPivotY = lHandY;
          let shieldYaw = lForeYaw - Math.PI * 0.5 + shieldRoll.x;
          let shieldLift = Math.max(0.4 * sMul, lHandZ - 6.8 * sMul);

          if (guardEnv > 0.01) {
            const [frontX, frontY] = localToWorldXY(tx, ty, yw, 0, 6.8 * sMul);
            shPivotX = lerp(shPivotX, frontX, guardEnv);
            shPivotY = lerp(shPivotY, frontY, guardEnv);
            shieldYaw = lerp(shieldYaw, yw, guardEnv);
            shieldLift = lerp(shieldLift, 0.5 * sMul, guardEnv);
          } else if (drinkEnv > 0.01) {
            const [restX, restY] = localToWorldXY(tx, ty, yw, -6.8 * sMul, 1.8 * sMul);
            shPivotX = lerp(shPivotX, restX, drinkEnv);
            shPivotY = lerp(shPivotY, restY, drinkEnv);
            shieldYaw = lerp(shieldYaw, yw + Math.PI * 0.44, drinkEnv);
            shieldLift = lerp(shieldLift, 0.3 * sMul, drinkEnv);
          }

          const [shWx, shWy] = localToWorldXY(shPivotX, shPivotY, shieldYaw, -SHIELD_PIVOT.x * sMul, -SHIELD_PIVOT.y * sMul);
          list.push({
            partKey: 'shield', asset: parts.shield,
            x: shWx, y: shWy, lift: shieldLift, ro: shieldYaw, bias: 0.58
          });

          // 6. 右臂两段 FK + 锁腕破盾战锤（rest_drink 时举起大麦酒杯、战锤暂挂腰侧）
          const rUpperYaw = yw + rArmSpring.x;
          const [rUWx, rUWy] = localToWorldXY(rShX, rShY, rUpperYaw, -UPPER_PIVOT.x * sMul, -UPPER_PIVOT.y * sMul);
          const [rElbX, rElbY] = localToWorldXY(rShX, rShY, rUpperYaw, 0, 3.4 * sMul);
          const rForeYaw = rUpperYaw + rForeSpring.x;
          const [rFWx, rFWy] = localToWorldXY(rElbX, rElbY, rForeYaw, -FORE_PIVOT.x * sMul, -FORE_PIVOT.y * sMul);
          const [rHandX, rHandY] = localToWorldXY(rElbX, rElbY, rForeYaw, 0, 3.4 * sMul);

          const rHandZ = armBaseZ + drinkEnv * 4.2 * sMul + (act === 'guard' ? 0.8 * guardEnv * sMul : 0);
          list.push(
            { partKey: 'upperArmR', asset: parts.upperArm, x: rUWx, y: rUWy, lift: armBaseZ + 0.6 * sMul + drinkEnv * 1.4 * sMul, ro: rUpperYaw, bias: 0.22 },
            { partKey: 'forearmR',  asset: parts.forearm,  x: rFWx, y: rFWy, lift: rHandZ, ro: rForeYaw, bias: 0.28 }
          );

          if (drinkEnv > 0.45) {
            // 举杯豪饮：麦酒杯锁死右手腕，战锤稳挂右腰侧
            const mugYaw = rForeYaw;
            const [mWx, mWy] = localToWorldXY(rHandX, rHandY, mugYaw, -MUG_PIVOT.x * sMul, -MUG_PIVOT.y * sMul);
            list.push({
              partKey: 'mug', asset: parts.mug,
              x: mWx, y: mWy, lift: rHandZ + 0.4 * sMul, ro: mugYaw, bias: 0.44
            });
            const [hipX, hipY] = localToWorldXY(tx, ty, yw, 5.4 * sMul, -1.6 * sMul);
            list.push({
              partKey: 'hammer', asset: parts.hammer,
              x: hipX, y: hipY, lift: torsoLift + 1.2 * sMul, ro: yw - 0.55, bias: 0.10
            });
          } else {
            // 常态/巡步/格挡：短柄战锤严格锁死右手腕枢轴
            const hmYaw = rForeYaw + hammerSwing.x;
            const [hmWx, hmWy] = localToWorldXY(rHandX, rHandY, hmYaw, -HAMMER_PIVOT.x * sMul, -HAMMER_PIVOT.y * sMul);
            list.push({
              partKey: 'hammer', asset: parts.hammer,
              x: hmWx, y: hmWy, lift: rHandZ - 0.6 * sMul, ro: hmYaw, bias: 0.42
            });
          }

          sockets.setWorld('leftHand', lHandX, lHandY, lHandZ, lForeYaw);
          sockets.setWorld('rightHand', rHandX, rHandY, rHandZ, rForeYaw);
          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id, code: Def.code, name: Def.name, outlineMode: 'actorUnified',
            skin: curSkin.id, footRadius: Def.footRadius, headZ: 26, centerZ: 13,
            blocks: Def.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(Def, 'npc');
})(window.PixelWorkshop);
