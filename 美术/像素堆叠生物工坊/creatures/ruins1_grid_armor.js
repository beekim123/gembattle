'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SocketTracker } = PW.Solvers;

  // =========================================================================
  // M34 标杆 · 遗1 · 方甲咔哒对位的（刚性分节、一顿一顿地动）
  // -------------------------------------------------------------------------
  // 【顶层可复用配置 M34_CONFIG】
  //   供后续 M34 模板生物（如 树6 · 一节节咔哒伸高的）复用棘轮顿挫节拍与对位红线：
  //   - tileBox / tilePitch / gapWidth : 单块方甲 11x11x6，九宫格距 13.5（深缝 2.5 格，总宽 38.0 格）
  //   - stepDist                       : 单步前进步幅 6.0 格（约半块方甲，全程零重叠穿插）
  //   - beatMoveDur / beatHoldDur      : 三拍每拍「急速咔哒位移 + 0.16~0.18s 硬停顿锁位」
  //   - turnStepDeg / turnMoveDur / turnHoldDur : 45° 一顿一顿咔哒转向
  //   - targetRadiusRatio              : 巡游与演示严格钳制在 maxRadius * 0.78 内
  // =========================================================================
  const M34_CONFIG = {
    tileBox: 11,
    tileHeight: 6,
    tilePitch: 13.5,               // 相邻方甲中心距（13.5 - 11 = 2.5 格清晰深缝；总宽 38.0 格）
    baseTileLift: 2.35,            // 方甲基准离地高度（下方露出短腿与肉垫）
    centerLiftExtra: 0.45,         // 中心主甲略高于四周，突出主核层次
    stepDist: 6.0,                 // 单步位移 6.0 格（约半块方甲）

    // 三拍棘轮步态时长（秒）：拍1错开(前排) -> 拍2挪移(中排) -> 拍3对齐(后排)
    beatMoveDur: [0.24, 0.24, 0.24],
    beatHoldDur: [0.16, 0.16, 0.18], // 每拍末尾硬停顿（0.16~0.18s，停顿占比 ~41%）
    beatLiftAmp: [1.35, 1.25, 1.15], // 错开/挪移/对齐各排微抬高度（格）
    clickOvershoot: 0.32,          // 棘轮咔哒到位瞬间极短过冲回弹（格）

    // 咔哒式顿挫转向参数（每次 45° 一顿一顿转正）
    turnStepRad: Math.PI / 4,      // 45° 单拍转角
    turnMoveDur: 0.18,
    turnHoldDur: 0.15,
    turnSpreadExtra: 0.85,         // 转向瞬间外圈 8 块微扩量（格），更显机械棘轮分节感

    // 偶发停下舔矿参数
    lickDur: 1.75,
    lickEverySteps: [3, 5],

    // 边界钳制红线
    targetRadiusRatio: 0.78
  };

  // 3×3 九宫格静态拓扑（col: -1左/0中/+1右, row: -1后/0中/+1前）
  // 仅复用 3 套方甲资产：tileCenter(1) + tileEdge(4) + tileCorner(4)
  const GRID_SLOTS = [
    { idx: 0, col: -1, row:  1, assetKey: 'tileCorner', isFront: true,  isCenter: false },
    { idx: 1, col:  0, row:  1, assetKey: 'tileEdge',   isFront: true,  isCenter: false },
    { idx: 2, col:  1, row:  1, assetKey: 'tileCorner', isFront: true,  isCenter: false },
    { idx: 3, col: -1, row:  0, assetKey: 'tileEdge',   isFront: false, isCenter: false },
    { idx: 4, col:  0, row:  0, assetKey: 'tileCenter', isFront: false, isCenter: true  },
    { idx: 5, col:  1, row:  0, assetKey: 'tileEdge',   isFront: false, isCenter: false },
    { idx: 6, col: -1, row: -1, assetKey: 'tileCorner', isFront: false, isCenter: false },
    { idx: 7, col:  0, row: -1, assetKey: 'tileEdge',   isFront: false, isCenter: false },
    { idx: 8, col:  1, row: -1, assetKey: 'tileCorner', isFront: false, isCenter: false }
  ];

  // idle 原地校验轮序（从外圈顺时针逐块咔哒微震再到中心主甲）
  const IDLE_CHECK_ORDER = [0, 1, 2, 5, 8, 7, 6, 3, 4];

  // =========================================================================
  // 1. 调色板（27 色 <= 48 色，0 重色，高对比防与青灰遗迹石板融糊）
  //    仅中心主甲琥珀橙活体矿核 3 档进 glowKeys，绝不把非自亮细节放进 glowKeys
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      // 深玄青石甲主体（3 档，明显深于遗迹中灰石板）
      stoneDark:    '#1a2226',
      stoneMid:     '#2c3940',
      stoneHi:      '#455861',
      // 浅象牙石切棱外框（3 档，九宫每块边缘锐利跳出）
      bevelDark:    '#7d948f',
      bevelMid:     '#adc7c0',
      bevelHi:      '#dcf0ea',
      // 深凿刻槽与底暗缘（3 档）
      grooveDark:   '#0f1417',
      grooveMid:    '#1b2429',
      grooveHi:     '#2b3840',
      // 古青铜高对比镶纹（3 档）
      bronzeDark:   '#785118',
      bronzeMid:    '#bf882a',
      bronzeHi:     '#f5ca5b',
      // 翠绿矿脉刻纹（3 档）
      jadeDark:     '#12694b',
      jadeMid:      '#22b07c',
      jadeHi:       '#66f0be',
      // 错开闪露的暖橙/暗绛活体短腿与肉垫（3 档，冷石甲下的强暖撞色）
      fleshDark:    '#57191d',
      fleshMid:     '#9e3025',
      fleshHi:      '#e66a35',
      // 前排甲片前缘舔矿唇纹与软须（3 档）
      lipDark:      '#6e2127',
      lipMid:       '#ba3e32',
      lipHi:        '#f58349',
      // 角甲细微遗迹青苔点缀（3 档）
      mossDark:     '#2b5726',
      mossMid:      '#4b8c3d',
      mossHi:       '#82c75f',
      // 中心第 5 块主甲琥珀橙活体矿核（唯一进 glowKeys，3 档）
      coreMid:      '#de6012',
      coreHot:      '#ff9d26',
      coreBright:   '#fff08c'
    },
    glowKeys: ['coreMid', 'coreHot', 'coreBright'],
    parts: ['stone', 'bevel', 'groove', 'bronze', 'jade', 'flesh', 'lip', 'moss', 'coreGlow'],
    noCrease: [
      ['stone', 'bevel'],
      ['stone', 'bronze'],
      ['stone', 'jade'],
      ['bevel', 'bronze'],
      ['bevel', 'jade'],
      ['bronze', 'jade'],
      ['jade', 'coreGlow'],
      ['bronze', 'coreGlow'],
      ['stone', 'moss'],
      ['flesh', 'lip']
    ],
    materials: {
      stone:  ['stoneDark',  'stoneMid',  'stoneHi'],
      bevel:  ['bevelDark',  'bevelMid',  'bevelHi'],
      groove: ['grooveDark', 'grooveMid', 'grooveHi'],
      bronze: ['bronzeDark', 'bronzeMid', 'bronzeHi'],
      jade:   ['jadeDark',   'jadeMid',   'jadeHi'],
      flesh:  ['fleshDark',  'fleshMid',  'fleshHi'],
      lip:    ['lipDark',    'lipMid',    'lipHi'],
      moss:   ['mossDark',   'mossMid',   'mossHi']
    },
    protectedParts: ['coreGlow', 'bronze', 'jade', 'flesh', 'lip']
  });

  // 3 套零重建模换色皮肤（0 禁用字，每套 27 色 0 重色）
  const SKINS = [
    {
      id: 'moss_stele',
      name: '苔碑碧纹',
      dot: '#22b07c',
      outline: '#0b1014',
      pal: {},
      fx: {
        dryColor: '#9aa39c',
        dryDark:  '#4d544f',
        dust:     '#b5bfb6',
        mineral:  '#66f0be',
        coreTint: '#ff9d26'
      }
    },
    {
      id: 'warm_amber',
      name: '暖砂琥珀纹',
      dot: '#d98434',
      outline: '#140d08',
      pal: {
        stoneDark:  '#362319', stoneMid:  '#573928', stoneHi:  '#7d543c',
        bevelDark:  '#9c7f62', bevelMid:  '#cca984', bevelHi:  '#f2d8b6',
        grooveDark: '#1f130d', grooveMid: '#332016', grooveHi: '#4a3022',
        bronzeDark: '#854614', bronzeMid: '#cc7121', bronzeHi: '#ffa84a',
        jadeDark:   '#175966', jadeMid:   '#2891a3', jadeHi:   '#6ad6e6',
        fleshDark:  '#1d3b4d', fleshMid:  '#2e6480', fleshHi:  '#559ec2',
        lipDark:    '#254a5e', lipMid:    '#3c7a99', lipHi:    '#74b8d9',
        mossDark:   '#595224', mossMid:   '#8a7f38', mossHi:   '#bfb55e',
        coreMid:    '#1fa88e', coreHot:   '#4ce6c2', coreBright:'#c7fff0'
      },
      fx: {
        dryColor: '#baa893',
        dryDark:  '#635443',
        dust:     '#d4c1a7',
        mineral:  '#6ad6e6',
        coreTint: '#4ce6c2'
      }
    },
    {
      id: 'obsidian_gold',
      name: '黑曜金脉纹',
      dot: '#ebba44',
      outline: '#09090d',
      pal: {
        stoneDark:  '#15151f', stoneMid:  '#242536', stoneHi:  '#3b3d57',
        bevelDark:  '#6b7085', bevelMid:  '#9aa1bd', bevelHi:  '#cfd6f0',
        grooveDark: '#0b0b12', grooveMid: '#171724', grooveHi: '#26273b',
        bronzeDark: '#8c6314', bronzeMid: '#d9a126', bronzeHi: '#ffe066',
        jadeDark:   '#294a85', jadeMid:   '#4476cc', jadeHi:   '#80b2ff',
        fleshDark:  '#631826', fleshMid:  '#ad283e', fleshHi:  '#f0596d',
        lipDark:    '#7d1e2f', lipMid:    '#cc374d', lipHi:    '#ff7888',
        mossDark:   '#2d4554', mossMid:   '#496f85', mossHi:   '#78a7bf',
        coreMid:    '#e65319', coreHot:   '#ff8c2e', coreBright:'#ffe891'
      },
      fx: {
        dryColor: '#999da8',
        dryDark:  '#4a4d59',
        dust:     '#b5bac7',
        mineral:  '#80b2ff',
        coreTint: '#ff8c2e'
      }
    }
  ];

  // =========================================================================
  // 2. 共享体素资产建模
  //    - 3 套 11×11×6 四重对称小方甲（symDeg: 90）：tileCenter / tileEdge / tileCorner
  //    - 1 套 5×5×5 四重对称短腿小件（symDeg: 90）：shortLeg
  //    - 1 套 9×4×4 左右对称前缘舔矿唇纹件：frontLip
  // =========================================================================
  function buildGridTile(makeCanvas, variant) {
    const W = M34_CONFIG.tileBox;
    const D = M34_CONFIG.tileBox;
    const H = M34_CONFIG.tileHeight;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 11×11 中心在索引 (5, 5)，fillAABB 中 X = x - 5, Y = y - 5，范围 [-5, +5]
    m.fillAABB(-5, 5, -5, 5, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.round(Math.abs(X));
      const ay = Math.round(Math.abs(Y));
      const maxA = Math.max(ax, ay);
      const minA = Math.min(ax, ay);

      // z = 0：内收 1 格的深色底托，凸显方甲下方缝隙与立体厚度
      if (z === 0) {
        if (maxA > 4 || (ax === 4 && ay === 4)) return;
        m.setRaw(x, y, z, mat('groove'), partId.groove);
        return;
      }

      // 实体外廓：11×11 刚性方正甲片，仅极四角做 1px 倒角防边缘钝糊
      if (ax === 5 && ay === 5) return;
      if (z === H - 1 && ax + ay >= 9) return;

      // 侧壁中线 1 格棘轮卡槽（让侧面也清晰有分节咬合感）
      const isSideNotch = (maxA === 5 && minA === 0 && z >= 2 && z <= 4);
      if (isSideNotch) {
        m.setRaw(x, y, z, mat('bronze'), partId.bronze);
        return;
      }

      // 顶面（z === H - 1）与次顶层镶嵌（z === H - 2 外棱）
      if (z === H - 1) {
        // 统一高对比浅象牙石外框（让九宫每一块在青灰地台上边界极度分明）
        if (maxA === 5) {
          if (minA <= 1 && variant === 'edge') {
            m.setRaw(x, y, z, mat('jade'), partId.jade);
          } else if (minA >= 3 && variant === 'corner') {
            m.setRaw(x, y, z, mat('bronze'), partId.bronze);
          } else {
            m.setRaw(x, y, z, mat('bevel'), partId.bevel);
          }
          return;
        }

        if (variant === 'center') {
          // 正中第 5 块主甲：醒目琥珀橙活体矿核 + 青铜卡爪 + 翠绿矿脉环
          if (maxA <= 1) {
            if (ax === 0 && ay === 0) {
              m.setRaw(x, y, z, keyToId.coreBright, partId.coreGlow);
            } else if (minA === 0) {
              m.setRaw(x, y, z, keyToId.coreHot, partId.coreGlow);
            } else {
              m.setRaw(x, y, z, keyToId.coreMid, partId.coreGlow);
            }
            return;
          }
          // 矿核外围四向青铜卡扣 + 翠绿矿环
          if (maxA === 2) {
            if (minA === 0) {
              m.setRaw(x, y, z, mat('bronze'), partId.bronze);
            } else {
              m.setRaw(x, y, z, mat('jade'), partId.jade);
            }
            return;
          }
          if (maxA === 3) {
            if (minA === 3) {
              m.setRaw(x, y, z, mat('bronze'), partId.bronze);
            } else if (minA <= 1) {
              m.setRaw(x, y, z, mat('jade'), partId.jade);
            } else {
              m.setRaw(x, y, z, mat('groove'), partId.groove);
            }
            return;
          }
          // maxA === 4：四角青铜铆扣，其余深玄青底
          if (minA >= 3) {
            m.setRaw(x, y, z, mat('bronze'), partId.bronze);
          } else if (minA === 0) {
            m.setRaw(x, y, z, mat('jade'), partId.jade);
          } else {
            m.setRaw(x, y, z, mat('stone'), partId.stone);
          }
          return;
        }

        if (variant === 'edge') {
          // 4 块边甲：十字翠绿矿脉通道 + 回字青铜框纹
          if (minA === 0 && maxA <= 4) {
            m.setRaw(x, y, z, mat('jade'), partId.jade);
            return;
          }
          if (maxA === 3 && minA <= 3) {
            m.setRaw(x, y, z, mat('bronze'), partId.bronze);
            return;
          }
          if (maxA === 1 && minA === 1) {
            m.setRaw(x, y, z, mat('bronze'), partId.bronze);
            return;
          }
          if (maxA === 4 && minA === 2) {
            m.setRaw(x, y, z, mat('moss'), partId.moss);
            return;
          }
          if (maxA === 2 && minA === 2) {
            m.setRaw(x, y, z, mat('groove'), partId.groove);
            return;
          }
          m.setRaw(x, y, z, mat('stone'), partId.stone);
          return;
        }

        // variant === 'corner'：4 块角甲，对角青铜折纹 + 翠绿四角矿点 + 微苔
        if (ax === ay && maxA <= 3) {
          m.setRaw(x, y, z, (maxA <= 1) ? mat('jade') : mat('bronze'), (maxA <= 1) ? partId.jade : partId.bronze);
          return;
        }
        if ((maxA === 3 && minA === 0) || (maxA === 2 && minA === 0)) {
          m.setRaw(x, y, z, mat('jade'), partId.jade);
          return;
        }
        if (maxA === 4 && minA >= 3) {
          m.setRaw(x, y, z, mat('bronze'), partId.bronze);
          return;
        }
        if (maxA === 4 && minA === 1) {
          m.setRaw(x, y, z, mat('moss'), partId.moss);
          return;
        }
        if (maxA === 3 && minA === 1) {
          m.setRaw(x, y, z, mat('groove'), partId.groove);
          return;
        }
        m.setRaw(x, y, z, mat('stone'), partId.stone);
        return;
      }

      // 侧壁（z = 1..4）：顶部 1 层外圈浅切棱 + 下层深玄青碑石 + 底部微暗槽
      if (z === H - 2 && maxA === 5) {
        m.setRaw(x, y, z, mat('bevel'), partId.bevel);
      } else if (z === 1 && maxA === 5) {
        m.setRaw(x, y, z, mat('groove'), partId.groove);
      } else if (variant === 'center' && z === H - 2 && maxA <= 1) {
        m.setRaw(x, y, z, keyToId.coreMid, partId.coreGlow);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: H, centerZ: Math.round(H * 0.5) });
  }

  // 共享活体短腿小件（5×5×5，四重对称 symDeg: 90）
  // 错位平移时在深缝下方闪出鲜明的暖橙/暗绛色肉垫与短足，证明它是活体生物
  function buildShortLeg(makeCanvas) {
    const W = 5, D = 5, H = 5;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-2, 2, -2, 2, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.round(Math.abs(X));
      const ay = Math.round(Math.abs(Y));
      const maxA = Math.max(ax, ay);

      if (z <= 1) {
        // 脚底宽肉垫（圆角 5×5）
        if (ax === 2 && ay === 2) return;
        m.setRaw(x, y, z, (z === 0 && maxA === 2) ? mat('groove') : mat('flesh'), (z === 0 && maxA === 2) ? partId.groove : partId.flesh);
        return;
      }
      if (z === 2 || z === 3) {
        // 粗壮短腿柱（3×3）
        if (maxA > 1) return;
        m.setRaw(x, y, z, mat('flesh'), partId.flesh);
        return;
      }
      // z === 4：顶部亮暖橙关节垫（方甲错开微抬时最易从缝隙边缘闪现）
      if (ax + ay > 2) return;
      m.setRaw(x, y, z, mat('lip'), partId.lip);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.3, headZ: H, centerZ: 2 });
  }

  // 前排 3 块甲片前缘共享舔矿唇纹件（9×4×4，左右对称）
  // 朝向 +Y（前进方向），带圆润暖橙/暗绛软唇与双侧翠绿感矿须，一眼分清前后朝向
  function buildFrontLip(makeCanvas) {
    const W = 9, D = 4, H = 4;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-4, 4, -2, 2, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X);
      // 后端（Y <= 0）宽 7 格嵌合甲片前缘，前端（Y > 0）收弧成舔矿唇瓣
      if (Y < -1.1 || Y > 1.6) return;
      if (ax > 3.6) return;
      if (Y > 0.6 && ax > 2.6) return;
      if (z === 3 && (Y > 0.4 || ax > 2.8)) return;

      // 前端两侧一对翠绿感矿短须点
      if (z === 1 && Y > 0.6 && ax >= 1.5 && ax <= 2.5) {
        m.setRaw(x, y, z, mat('jade'), partId.jade);
        return;
      }
      // 顶缘古铜小护眉
      if (z === 3 && ax <= 2.4 && Y <= 0.4) {
        m.setRaw(x, y, z, mat('bronze'), partId.bronze);
        return;
      }
      // 居中舔矿唇纹（暖橙/暗绛软肉唇瓣）
      if (z === 0 && ax < 0.6 && Y > 0.2) {
        m.setRaw(x, y, z, mat('groove'), partId.groove);
        return;
      }
      m.setRaw(x, y, z, mat('lip'), partId.lip);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: H, centerZ: 2 });
  }

  // 棘轮顿挫曲线：急速前推并在末尾带极短咔哒过冲，然后进入硬停顿锁死在 1.0
  function evalRatchetStep(u) {
    if (u <= 0) return 0;
    if (u >= 1) return 1;
    if (u < 0.82) {
      const t = u / 0.82;
      // 陡峭起步 + 迅捷收尾（S 曲线偏快）
      return t * t * (3 - 2 * t);
    }
    // 0.82 ~ 1.0：极短棘轮卡扣过冲回弹后死锁在 1.0
    const k = (u - 0.82) / 0.18;
    return 1.0 + Math.sin(k * Math.PI) * 0.055 * (1 - k);
  }

  // =========================================================================
  // 3. 生物定义：遗1 · 方甲咔哒对位的（M34 模板标杆）
  // =========================================================================
  const Ruins1GridArmorDef = {
    id: 'ruins1_grid_armor',
    code: '遗1',
    name: '方甲咔哒对位的',
    status: 'done',
    tag: 'M34 标杆 · 刚性分节棘轮对位',
    summary: '九块高对比刻纹方甲排成 3×3 九宫格（仅复用主甲/边甲/角甲 3 套四重对称资产 + 1 套活体短腿 + 1 套前缘舔矿唇），行走采用三拍棘轮顿挫（前排错开 → 中排挪移 → 后排对齐，每拍硬停顿 0.16~0.18s）与 45° 咔哒转向，错开瞬间闪露下方暖橙短腿，走过石板留干纹并偶发停下舔矿',
    defaultHabitat: 'ruins',
    footRadius: 19.5,
    ecoWeight: 1.5,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    m34Config: M34_CONFIG,
    blocks: [
      '3×3九宫深缝方甲复用3套四重对称小甲资产',
      '中心琥珀活体矿核与高对比青铜翠绿矿脉刻纹',
      '三拍棘轮步态（错开→挪移→对齐）每拍硬停顿锁位',
      '45°一顿一顿咔哒转向与错位闪露暖橙活体短腿',
      '前排舔矿唇纹分清前后并沿途留石缝干纹'
    ],
    soulHabit: '九块刻满青铜与翠绿矿脉的玄青方甲排成整齐三乘三，平时严丝合缝像遗迹古碑，走起路来先是前排三块咔哒往前错开半格、露出底下暖橙短腿，停顿一拍后中排与琥珀主甲咔哒跟进，再停顿一拍后排三块咔哒收拢对齐；转弯也是四十五度一顿一顿咔哒转正，沿途低头舔干石缝矿水留下一道道浅灰干纹',
    actions: [
      { id: 'patrol',  name: '自由巡游（三拍棘轮+舔矿）', loop: true, status: 'done' },
      { id: 'idle',    name: '原地待机（九宫轮震校验）',  loop: true, status: 'done' },
      { id: 'ratchet', name: '棘轮演示（三拍步+90°顿转）', loop: true, status: 'done' }
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
        tileCenter: buildGridTile(makeCanvas, 'center'),
        tileEdge:   buildGridTile(makeCanvas, 'edge'),
        tileCorner: buildGridTile(makeCanvas, 'corner'),
        shortLeg:   buildShortLeg(makeCanvas),
        frontLip:   buildFrontLip(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.35;
      const seed0 = opts.seed ?? 61;

      const sockets = new SocketTracker();
      const footContacts = [];
      let curSkin = SKINS[0];

      // 9 块方甲与 9 条短腿的实时世界姿态
      const tiles = GRID_SLOTS.map((s) => ({
        idx: s.idx,
        col: s.col,
        row: s.row,
        assetKey: s.assetKey,
        isFront: s.isFront,
        isCenter: s.isCenter,
        x: hx0,
        y: hy0,
        lift: M34_CONFIG.baseTileLift + (s.isCenter ? M34_CONFIG.centerLiftExtra : 0),
        ro: hyaw0,
        legX: hx0,
        legY: hy0,
        legLift: 0,
        lipX: hx0,
        lipY: hy0,
        lipLift: 1.8
      }));

      const state = {
        x: hx0,
        y: hy0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        shadowScale: 1.0,

        // 状态机：'walk_b1' | 'walk_b2' | 'walk_b3' | 'turn_click' | 'lick' | 'idle_check'
        mode: 'walk_b1',
        phaseT: 0,
        prevAction: 'patrol',
        seq: 1,

        // 巡游导航目标（严格钳制在 maxRadius * 0.78 内）
        targetX: hx0,
        targetY: hy0,
        stepsSinceLick: 0,
        nextLickSteps: 4,

        // 顿挫转向状态
        turnStartYaw: hyaw0,
        turnEndYaw: hyaw0,
        turnDir: 1,
        turnPendingClicks: 0,

        // 紧凑 ratchet 演示态方框计数
        demoStepsLeft: 2,
        demoTurnClicksLeft: 0,

        // idle 轮流轻震校验索引
        idleCheckStep: 0,
        idleCheckT: 0,

        // 痕迹与尘粒防重复触发标记
        beatDecalDone: false,
        lickDecalDone: false,
        lickDustCd: 0
      };

      function clampInSafeDisc(x, y, hx, hy, maxR) {
        const safeR = Math.max(8, maxR * M34_CONFIG.targetRadiusRatio);
        const dx = x - hx;
        const dy = y - hy;
        const d = Math.hypot(dx, dy);
        if (d > safeR && d > 1e-4) {
          return [hx + (dx * safeR) / d, hy + (dy * safeR) / d];
        }
        return [x, y];
      }

      function pickPatrolTarget(hx, hy, maxR, sMul) {
        const safeR = Math.max(10, maxR * M34_CONFIG.targetRadiusRatio);
        const minDist = Math.min(18 * sMul, safeR * 0.9);
        let bestX = hx, bestY = hy;
        for (let attempt = 0; attempt < 6; attempt++) {
          state.seq++;
          const rA = hash2i(state.seq, seed0, 107 + attempt * 19);
          const rR = hash2i(state.seq, seed0, 229 + attempt * 23);
          const curAng = Math.atan2(state.y - hy, state.x - hx);
          const ang = curAng + lerp(1.35, 4.90, rA);
          const rad = lerp(safeR * 0.25, safeR * 0.94, rR);
          const [cx, cy] = clampInSafeDisc(hx + Math.cos(ang) * rad, hy + Math.sin(ang) * rad, hx, hy, maxR);
          bestX = cx;
          bestY = cy;
          if (Math.hypot(bestX - state.x, bestY - state.y) >= minDist) break;
        }
        state.targetX = bestX;
        state.targetY = bestY;
      }

      function spawnMineralDust(vfx, x, y, z, count, sMul, fxCol, withMineral) {
        if (!vfx) return;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * TAU;
          const sp = (3.0 + Math.random() * 6.0) * sMul;
          const isMin = withMineral && (i % 2 === 0);
          vfx.spawnParticle(
            x + (Math.random() - 0.5) * 6.0 * sMul,
            y + (Math.random() - 0.5) * 6.0 * sMul,
            z + Math.random() * 1.2 * sMul,
            Math.cos(a) * sp,
            Math.sin(a) * sp,
            (4.5 + Math.random() * 5.5) * sMul,
            0.36 + Math.random() * 0.24,
            isMin ? 1.15 : 1.35,
            isMin ? fxCol.mineral : fxCol.dust,
            false,
            22
          );
        }
      }

      function emitDryTrackDecal(vfx, wx, wy, yaw, sMul, fxCol, scale) {
        if (!vfx) return;
        vfx.addDecal({
          kind: 'crack',
          x: wx,
          y: wy,
          yaw,
          rx: 5.2 * sMul * scale,
          ry: 7.4 * sMul * scale,
          life: 9.5,
          alpha: 0.72,
          color: fxCol.dryColor,
          darkColor: fxCol.dryDark
        });
      }

      function startTurnClick(deltaYaw) {
        const stepMax = M34_CONFIG.turnStepRad; // 45°
        const absD = Math.abs(deltaYaw);
        const dir = deltaYaw >= 0 ? 1 : -1;
        // 每次咔哒转 30°~45°；若剩余角大于 45° 则取整 45°，否则直接转正剩余角
        const clickAng = absD > stepMax ? stepMax : absD;
        state.mode = 'turn_click';
        state.phaseT = 0;
        state.turnStartYaw = state.yaw;
        state.turnEndYaw = wrapAngle(state.yaw + dir * clickAng);
        state.turnDir = dir;
        state.beatDecalDone = false;
      }

      function syncAlignedTiles(sMul, pitchExtra, checkIdx, checkLift) {
        const pitch = (M34_CONFIG.tilePitch + pitchExtra) * sMul;
        const baseZ = M34_CONFIG.baseTileLift * sMul;
        const centerExtra = M34_CONFIG.centerLiftExtra * sMul;

        for (let i = 0; i < tiles.length; i++) {
          const t = tiles[i];
          const lx = t.col * pitch;
          const ly = t.row * pitch;
          const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, lx, ly);
          const extraZ = (i === checkIdx) ? checkLift : 0;
          t.x = wx;
          t.y = wy;
          t.lift = baseZ + (t.isCenter ? centerExtra : 0) + extraZ;
          t.ro = state.yaw;

          // 对齐态短腿收拢在方甲正下方
          t.legX = wx;
          t.legY = wy;
          t.legLift = 0.05 * sMul;

          if (t.isFront) {
            const [flx, fly] = localToWorldXY(wx, wy, state.yaw, 0, 5.4 * sMul);
            t.lipX = flx;
            t.lipY = fly;
            t.lipLift = Math.max(0.5 * sMul, t.lift - 0.65 * sMul);
          }
        }
      }

      const instance = {
        def: Ruins1GridArmorDef,
        cachePrefix: `ruins1_grid_armor_${Math.random().toString(36).slice(2, 7)}`,
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
          state.shadowScale = 1.0;
          state.mode = 'walk_b1';
          state.phaseT = 0;
          state.seq = 1;
          state.targetX = homeX + 22;
          state.targetY = homeY + 12;
          state.stepsSinceLick = 0;
          state.nextLickSteps = 4;
          state.turnStartYaw = homeYaw;
          state.turnEndYaw = homeYaw;
          state.turnDir = 1;
          state.turnPendingClicks = 0;
          state.demoStepsLeft = 2;
          state.demoTurnClicksLeft = 0;
          state.idleCheckStep = 0;
          state.idleCheckT = 0;
          state.beatDecalDone = false;
          state.lickDecalDone = false;
          state.lickDustCd = 0;
          syncAlignedTiles(instance.scaleMul, 0, -1, 0);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul   = instance.scaleMul;
          const gFreq  = clamp(params.gaitFreq ?? 1.0, 0.45, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.45, 2.2);
          const flex   = clamp(params.tailFlex ?? 1.0, 0.4, 2.0);
          const tempo  = clamp(gFreq * (0.65 + 0.35 * spdMul), 0.4, 2.6);
          const hx     = (eco && eco.homeX) ?? 0;
          const hy     = (eco && eco.homeY) ?? 0;
          const maxR   = (eco && eco.maxRadius) || 46;
          const action = (eco && eco.action) || ((eco && eco.patrol === false) ? 'idle' : 'patrol');
          const fxCol  = curSkin.fx || SKINS[0].fx;

          // 动作切换初始化
          if (action !== state.prevAction) {
            state.prevAction = action;
            state.phaseT = 0;
            state.beatDecalDone = false;
            state.lickDecalDone = false;
            if (action === 'idle') {
              state.mode = 'idle_check';
              state.idleCheckStep = 0;
              state.idleCheckT = 0;
            } else if (action === 'ratchet') {
              // 紧凑演示：将中心收回到原点附近并从拍 1 开始演示「2 步三拍 + 90° 两拍顿转」
              const [cx, cy] = clampInSafeDisc(state.x, state.y, hx, hy, maxR * 0.55);
              state.x = cx;
              state.y = cy;
              state.mode = 'walk_b1';
              state.demoStepsLeft = 2;
              state.demoTurnClicksLeft = 0;
            } else {
              state.mode = 'walk_b1';
              pickPatrolTarget(hx, hy, maxR, sMul);
            }
          }

          const pitch = M34_CONFIG.tilePitch * sMul;
          const stepDist = M34_CONFIG.stepDist * sMul;
          const baseZ = M34_CONFIG.baseTileLift * sMul;
          const centerExtra = M34_CONFIG.centerLiftExtra * sMul;

          // -----------------------------------------------------------------
          // 模式 A：idle（九块严密合缝，按序轮流咔哒微抬轻震校验）
          // -----------------------------------------------------------------
          if (action === 'idle') {
            state.mode = 'idle_check';
            state.idleCheckT += dt * gFreq;
            const checkCycle = 0.46; // 0.16s 咔哒微抬落位 + 0.30s 硬停顿
            if (state.idleCheckT >= checkCycle) {
              state.idleCheckT -= checkCycle;
              state.idleCheckStep = (state.idleCheckStep + 1) % IDLE_CHECK_ORDER.length;
            }
            const activeSlot = IDLE_CHECK_ORDER[state.idleCheckStep];
            const moveWindow = 0.16;
            let checkLift = 0;
            if (state.idleCheckT < moveWindow) {
              const u = state.idleCheckT / moveWindow;
              checkLift = Math.sin(u * Math.PI) * 0.88 * flex * sMul;
            }
            syncAlignedTiles(sMul, 0, activeSlot, checkLift);
            state.vx = 0;
            state.vy = 0;

          // -----------------------------------------------------------------
          // 模式 B：lick（停下舔干石缝矿水，前排压低 + 前缘唇纹微幅伸缩）
          // -----------------------------------------------------------------
          } else if (state.mode === 'lick') {
            state.phaseT += dt;
            const u = clamp(state.phaseT / M34_CONFIG.lickDur, 0, 1);
            // 前排 3 块前倾压低舔矿，唇纹来回轻舔
            const dip = Math.sin(smoothstep(0, 0.22, u) * Math.PI * 0.5) * (1 - smoothstep(0.78, 1.0, u));
            const lickPulse = Math.sin(time * 18.0) * 0.65 * dip * sMul;

            if (!state.lickDecalDone && u >= 0.42) {
              state.lickDecalDone = true;
              const [dxW, dyW] = localToWorldXY(state.x, state.y, state.yaw, 0, pitch + 6.5 * sMul);
              emitDryTrackDecal(vfx, dxW, dyW, state.yaw, sMul, fxCol, 1.15);
              spawnMineralDust(vfx, dxW, dyW, 0.9 * sMul, 5, sMul, fxCol, true);
            }
            state.lickDustCd -= dt;
            if (vfx && dip > 0.4 && state.lickDustCd <= 0) {
              state.lickDustCd = 0.32;
              const [dxW, dyW] = localToWorldXY(state.x, state.y, state.yaw, 0, pitch + 6.2 * sMul);
              spawnMineralDust(vfx, dxW, dyW, 0.7 * sMul, 2, sMul, fxCol, true);
            }

            for (let i = 0; i < tiles.length; i++) {
              const t = tiles[i];
              const lx = t.col * pitch;
              const ly = t.row * pitch + (t.isFront ? dip * 0.9 * sMul : 0);
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, lx, ly);
              t.x = wx;
              t.y = wy;
              t.lift = baseZ + (t.isCenter ? centerExtra : 0) - (t.isFront ? dip * 1.15 * sMul : 0);
              t.ro = state.yaw;
              t.legX = wx;
              t.legY = wy;
              t.legLift = 0.04 * sMul;
              if (t.isFront) {
                const [flx, fly] = localToWorldXY(wx, wy, state.yaw, 0, (5.4 + dip * 1.1) * sMul + lickPulse);
                t.lipX = flx;
                t.lipY = fly;
                t.lipLift = Math.max(0.25 * sMul, t.lift - 0.85 * sMul);
              }
            }

            state.vx = 0;
            state.vy = 0;
            if (state.phaseT >= M34_CONFIG.lickDur) {
              state.phaseT = 0;
              state.lickDecalDone = false;
              state.mode = 'walk_b1';
            }

          // -----------------------------------------------------------------
          // 模式 C：turn_click（45° 一顿一顿咔哒转向 + 硬停顿锁位）
          // -----------------------------------------------------------------
          } else if (state.mode === 'turn_click') {
            state.phaseT += dt * tempo;
            const moveD = M34_CONFIG.turnMoveDur;
            const holdD = M34_CONFIG.turnHoldDur;
            const totalD = moveD + holdD;
            const inMove = state.phaseT < moveD;
            const uMove = clamp(state.phaseT / moveD, 0, 1);
            const rMove = evalRatchetStep(uMove);

            const curYaw = wrapAngle(state.turnStartYaw + wrapAngle(state.turnEndYaw - state.turnStartYaw) * rMove);
            state.yaw = curYaw;

            // 转向瞬间外圈 8 块微扩并微抬，露出下方暖橙短腿交叉挪步；硬停顿段咔哒合缝锁死
            const swingArc = inMove ? Math.sin(uMove * Math.PI) : 0;
            const spreadAdd = swingArc * M34_CONFIG.turnSpreadExtra * sMul;
            const turnLift = swingArc * 1.05 * sMul;

            if (!inMove && !state.beatDecalDone) {
              state.beatDecalDone = true;
              spawnMineralDust(vfx, state.x, state.y, 0.8 * sMul, 3, sMul, fxCol, false);
            }

            for (let i = 0; i < tiles.length; i++) {
              const t = tiles[i];
              const isOuter = !t.isCenter;
              const lx = t.col * (pitch + (isOuter ? spreadAdd : 0));
              const ly = t.row * (pitch + (isOuter ? spreadAdd : 0));
              const [wx, wy] = localToWorldXY(state.x, state.y, curYaw, lx, ly);
              t.x = wx;
              t.y = wy;
              t.lift = baseZ + (t.isCenter ? centerExtra : 0) + (isOuter ? turnLift : 0);
              t.ro = curYaw;

              // 短腿沿切向微微迈出，让缝隙下方闪出暖橙短足
              const tangX = -t.row * state.turnDir * swingArc * 2.1 * sMul;
              const tangY =  t.col * state.turnDir * swingArc * 2.1 * sMul;
              const [lgX, lgY] = localToWorldXY(wx, wy, curYaw, tangX, tangY);
              t.legX = lgX;
              t.legY = lgY;
              t.legLift = (isOuter ? swingArc * 0.75 * sMul : 0.05 * sMul);

              if (t.isFront) {
                const [flx, fly] = localToWorldXY(wx, wy, curYaw, 0, 5.4 * sMul);
                t.lipX = flx;
                t.lipY = fly;
                t.lipLift = Math.max(0.5 * sMul, t.lift - 0.65 * sMul);
              }
            }

            state.vx = 0;
            state.vy = 0;

            if (state.phaseT >= totalD) {
              state.yaw = state.turnEndYaw;
              state.phaseT = 0;
              state.beatDecalDone = false;

              if (action === 'ratchet') {
                if (state.demoTurnClicksLeft > 1) {
                  state.demoTurnClicksLeft--;
                  startTurnClick(M34_CONFIG.turnStepRad);
                } else {
                  state.demoTurnClicksLeft = 0;
                  state.demoStepsLeft = 2;
                  state.mode = 'walk_b1';
                }
              } else {
                const dx = state.targetX - state.x;
                const dy = state.targetY - state.y;
                const desiredYaw = Math.atan2(-dx, dy);
                const remYaw = wrapAngle(desiredYaw - state.yaw);
                if (Math.abs(remYaw) > 0.30) {
                  startTurnClick(remYaw);
                } else {
                  state.mode = 'walk_b1';
                }
              }
            }

          // -----------------------------------------------------------------
          // 模式 D：三拍棘轮行走（walk_b1 错开 -> walk_b2 挪移 -> walk_b3 对齐）
          // -----------------------------------------------------------------
          } else {
            const beatIdx = (state.mode === 'walk_b1') ? 0 : ((state.mode === 'walk_b2') ? 1 : 2);
            const moveD = M34_CONFIG.beatMoveDur[beatIdx];
            const holdD = M34_CONFIG.beatHoldDur[beatIdx];
            const totalD = moveD + holdD;

            state.phaseT += dt * tempo;
            const inMove = state.phaseT < moveD;
            const uMove = clamp(state.phaseT / moveD, 0, 1);
            const rMove = evalRatchetStep(uMove);
            const liftArc = inMove ? Math.sin(uMove * Math.PI) : 0;

            // 三排相对当前步起始锚点的前移进度（单调满足 front >= mid >= back，数学保证 0 重叠）
            const uFront = (beatIdx === 0) ? rMove : 1.0;
            const uMid   = (beatIdx === 0) ? 0.0   : ((beatIdx === 1) ? rMove : 1.0);
            const uBack  = (beatIdx < 2)   ? 0.0   : rMove;

            const activeRow = (beatIdx === 0) ? 1 : ((beatIdx === 1) ? 0 : -1);
            const activeLift = liftArc * M34_CONFIG.beatLiftAmp[beatIdx] * sMul;

            // 硬停顿锁位瞬间（咔哒落位）触发少量矿尘；拍 3 收拢归位时写入地表浅灰干纹
            if (!inMove && !state.beatDecalDone) {
              state.beatDecalDone = true;
              if (beatIdx === 2) {
                const [trackX, trackY] = localToWorldXY(state.x, state.y, state.yaw, 0, -pitch * 0.35);
                emitDryTrackDecal(vfx, trackX, trackY, state.yaw, sMul, fxCol, 1.0);
                spawnMineralDust(vfx, trackX, trackY, 0.8 * sMul, 4, sMul, fxCol, true);
              } else {
                const [rowX, rowY] = localToWorldXY(state.x, state.y, state.yaw, 0, activeRow * pitch + stepDist);
                spawnMineralDust(vfx, rowX, rowY, 0.7 * sMul, 2, sMul, fxCol, false);
              }
            }

            // 推进 9 块方甲、9 条短腿与前排 3 个舔矿唇
            for (let i = 0; i < tiles.length; i++) {
              const t = tiles[i];
              const rowU = (t.row === 1) ? uFront : ((t.row === 0) ? uMid : uBack);
              const isMovingRow = (t.row === activeRow);

              // 方甲世界坐标：沿本地 +Y 咔哒滑出 stepDist
              const lx = t.col * pitch;
              const ly = t.row * pitch + rowU * stepDist;
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, lx, ly);
              t.x = wx;
              t.y = wy;
              t.lift = baseZ + (t.isCenter ? centerExtra : 0) + (isMovingRow ? activeLift : 0);
              t.ro = state.yaw;

              // 错开瞬间下方对比色短腿主动探向缝隙/迈步方向，视觉上清晰闪现暖橙肉垫！
              const legStrideY = isMovingRow
                ? (inMove ? (2.35 * Math.sin(uMove * Math.PI) * sMul) : (0.65 * sMul))
                : ((beatIdx === 0 && t.row === 0) || (beatIdx === 1 && t.row === -1) ? 1.45 * sMul : 0);
              const legOutX = isMovingRow && inMove ? (t.col * 1.15 * liftArc * sMul) : 0;
              const [lgX, lgY] = localToWorldXY(wx, wy, state.yaw, legOutX, legStrideY);
              t.legX = lgX;
              t.legY = lgY;
              t.legLift = isMovingRow ? (liftArc * 0.95 * sMul) : 0.05 * sMul;

              if (t.isFront) {
                const [flx, fly] = localToWorldXY(wx, wy, state.yaw, 0, 5.4 * sMul);
                t.lipX = flx;
                t.lipY = fly;
                t.lipLift = Math.max(0.5 * sMul, t.lift - 0.65 * sMul);
              }
            }

            const fwdX = -Math.sin(state.yaw);
            const fwdY =  Math.cos(state.yaw);
            const instSpeed = (inMove && beatIdx === 1) ? (stepDist / moveD) * tempo : 0;
            state.vx = fwdX * instSpeed;
            state.vy = fwdY * instSpeed;

            // 拍结束流转
            if (state.phaseT >= totalD) {
              state.phaseT = 0;
              state.beatDecalDone = false;

              if (beatIdx === 0) {
                state.mode = 'walk_b2';
              } else if (beatIdx === 1) {
                state.mode = 'walk_b3';
              } else {
                // 拍 3 对齐完成：将主体世界锚点一次性前推 stepDist，严格钳制在安全半径内
                const nextX = state.x + fwdX * stepDist;
                const nextY = state.y + fwdY * stepDist;
                const [clampedX, clampedY] = clampInSafeDisc(nextX, nextY, hx, hy, maxR);
                const hitEdge = (Math.hypot(clampedX - nextX, clampedY - nextY) > 0.25);
                state.x = clampedX;
                state.y = clampedY;

                // 重置完锚点后立即同步对齐位置，保证无单帧跳变
                syncAlignedTiles(sMul, 0, -1, 0);

                if (action === 'ratchet') {
                  state.demoStepsLeft--;
                  if (state.demoStepsLeft <= 0 || hitEdge) {
                    // 演示态：每走 2 步后分两拍 45° 咔哒右转 90°
                    state.demoTurnClicksLeft = 2;
                    startTurnClick(M34_CONFIG.turnStepRad);
                  } else {
                    state.mode = 'walk_b1';
                  }
                } else {
                  state.stepsSinceLick++;
                  const dx = state.targetX - state.x;
                  const dy = state.targetY - state.y;
                  const distToTarget = Math.hypot(dx, dy);

                  if (hitEdge || distToTarget < 10.5 * sMul) {
                    pickPatrolTarget(hx, hy, maxR, sMul);
                  }

                  // 偶发停下舔矿
                  if (state.stepsSinceLick >= state.nextLickSteps) {
                    state.stepsSinceLick = 0;
                    state.seq++;
                    const [lMin, lMax] = M34_CONFIG.lickEverySteps;
                    state.nextLickSteps = lMin + Math.floor(hash2i(state.seq, seed0, 311) * (lMax - lMin + 1));
                    state.mode = 'lick';
                    state.phaseT = 0;
                    state.lickDecalDone = false;
                  } else {
                    const ndx = state.targetX - state.x;
                    const ndy = state.targetY - state.y;
                    const desiredYaw = Math.atan2(-ndx, ndy);
                    const remYaw = wrapAngle(desiredYaw - state.yaw);
                    if (Math.abs(remYaw) > 0.36) {
                      startTurnClick(remYaw);
                    } else {
                      state.mode = 'walk_b1';
                    }
                  }
                }
              }
            }
          }

          // 接地印（仅取四角 + 中心 5 个代表点，干净贴地不杂乱）
          footContacts.length = 0;
          const contactIdx = [0, 2, 4, 6, 8];
          for (let ci = 0; ci < contactIdx.length; ci++) {
            const t = tiles[contactIdx[ci]];
            footContacts.push({ x: t.legX, y: t.legY, z: t.legLift, r: 3.1 * sMul });
          }

          // 同步中心主甲顶面挂点
          const cTile = tiles[4];
          sockets.setWorld('core', cTile.x, cTile.y, cTile.lift + M34_CONFIG.tileHeight * sMul, state.yaw);
        },

        buildPartList() {
          const list = [];

          // 1. 9 条共享活体短腿（bias: -0.6，位于方甲下方，错开时从九宫深缝闪现暖橙肉垫）
          for (let i = 0; i < tiles.length; i++) {
            const t = tiles[i];
            list.push({
              partKey: 'shortLeg',
              asset: parts.shortLeg,
              x: t.legX,
              y: t.legY,
              lift: Math.max(0.0, t.legLift),
              ro: t.ro,
              symDeg: 90,
              bias: -0.6
            });
          }

          // 2. 9 块方甲（仅复用 tileCenter / tileEdge / tileCorner 3 套四重对称资产，symDeg: 90）
          for (let i = 0; i < tiles.length; i++) {
            const t = tiles[i];
            list.push({
              partKey: t.assetKey,
              asset: parts[t.assetKey],
              x: t.x,
              y: t.y,
              lift: Math.max(0.5, t.lift),
              ro: t.ro,
              symDeg: 90,
              bias: t.isCenter ? 0.15 : 0.0
            });
          }

          // 3. 前排 3 块甲片前缘共享舔矿唇纹件（一眼分清前后朝向）
          for (let i = 0; i < tiles.length; i++) {
            const t = tiles[i];
            if (!t.isFront) continue;
            list.push({
              partKey: 'frontLip',
              asset: parts.frontLip,
              x: t.lipX,
              y: t.lipY,
              lift: Math.max(0.2, t.lipLift),
              ro: t.ro,
              symDeg: 360,
              bias: 0.25
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Ruins1GridArmorDef.id,
            code: Ruins1GridArmorDef.code,
            name: Ruins1GridArmorDef.name,
            status: Ruins1GridArmorDef.status,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            mode: state.mode,
            tilePitch: M34_CONFIG.tilePitch,
            stepDist: M34_CONFIG.stepDist,
            footRadius: Ruins1GridArmorDef.footRadius,
            headZ: Math.round(M34_CONFIG.baseTileLift + M34_CONFIG.centerLiftExtra + M34_CONFIG.tileHeight),
            centerZ: Math.round(M34_CONFIG.baseTileLift + M34_CONFIG.tileHeight * 0.5),
            blocks: Ruins1GridArmorDef.blocks,
            params: { ...params },
            parts: Object.keys(parts).map((k) => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Ruins1GridArmorDef);
})(window.PixelWorkshop);
