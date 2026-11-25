'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, lerp, expSmooth, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T00-B 暖壁炉悬赏板与圆木酒桌（室内家具 B，+Y 面向大厅中央）
  //   1. 拆块组合（全部件盒 <= 24×18×26，仅真炉火/火炭进 glowKeys）：
  //      - hearth      (22×16×26)：粗糙青灰石砌壁炉 + 拱形炉膛 + 柴火木段 + 炉壁铜饰
  //      - flameTall   (8×8×10)  ：炉膛主火苗（分层橘/金/暖白芯，进 glowKeys）
  //      - flameSide   (6×6×8)   ：炉膛副火苗（左右复用 2 块错相抖动，进 glowKeys）
  //      - bountyBoard (18×8×20) ：木框工会悬赏板（红/黄/青三色委托纸 + 朱红蜡封点）
  //      - flutterNote (8×4×8)   ：悬赏板右下角微颤委托纸角（随气流轻颤，零拉伸）
  //      - roundTable  (18×18×10)：厚实圆木酒桌（四重对称 symDeg: 90）
  //      - tableProps  (14×14×8) ：切半金黄面包 + 两只冒白沫麦酒杯（欢聚态微震）
  //      - bench       (14×8×8)  ：圆木长凳（左右两张复用同一资产）
  //   2. 动作：
  //      - idle  ：炉火舒缓跳动 + 橘黄火屑缓升 + 任务纸微晃
  //      - lively：炉火更旺 + 火屑加密 + 悬赏纸轻颤加快 + 酒桌杯盘微震
  //   3. 3 套换色皮肤（暖石红毯、古砖翠帐、黑铁赭木），<= 48 色 0 重色 0 禁用字
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      stoneDark:   '#424952',
      stoneMid:    '#67717d',
      stoneHi:     '#929da8',

      sootDark:    '#211d1e',
      sootMid:     '#383032',

      woodDark:    '#3b2113',
      woodMid:     '#643a21',
      woodHi:      '#8f5b37',

      topDark:     '#996436',
      topMid:      '#c48a4f',
      topHi:       '#e6b575',

      logDark:     '#472816',
      logMid:      '#704022',
      logHi:       '#995e35',

      brassDark:   '#8f6014',
      brassMid:    '#d89b24',
      brassHi:     '#fae06b',

      paperRedD:   '#a3262c',
      paperRedM:   '#de4343',
      paperRedH:   '#f77c74',

      paperYelD:   '#b8891d',
      paperYelM:   '#f0c23c',
      paperYelH:   '#fae17d',

      paperBlueD:  '#28729e',
      paperBlueM:  '#49a6d6',
      paperBlueH:  '#8fd4f5',

      waxCrimson:  '#b81424',

      breadCrust:  '#b56a24',
      breadCrumb:  '#f2dfba',
      foamWhite:   '#faf5ea',

      fireMid:     '#f05818',
      fireHot:     '#ffa326',
      fireCore:    '#fff199'
    },
    glowKeys: ['fireMid', 'fireHot', 'fireCore'],
    parts: [
      'stone', 'soot', 'wood', 'tableTop', 'log', 'brass',
      'paperRed', 'paperYel', 'paperBlue', 'wax',
      'bread', 'crumb', 'foam', 'fire'
    ],
    noCrease: [
      ['fire', 'log'], ['fire', 'soot'], ['fire', 'stone'],
      ['paperRed', 'wax'], ['paperYel', 'wax'], ['paperBlue', 'wax'],
      ['bread', 'crumb'], ['wood', 'foam']
    ],
    materials: {
      stone:     ['stoneDark',  'stoneMid',  'stoneHi'],
      wood:      ['woodDark',   'woodMid',   'woodHi'],
      tableTop:  ['topDark',    'topMid',    'topHi'],
      log:       ['logDark',    'logMid',    'logHi'],
      brass:     ['brassDark',  'brassMid',  'brassHi'],
      paperRed:  ['paperRedD',  'paperRedM', 'paperRedH'],
      paperYel:  ['paperYelD',  'paperYelM', 'paperYelH'],
      paperBlue: ['paperBlueD', 'paperBlueM','paperBlueH']
    },
    protectedParts: ['fire', 'wax', 'brass', 'foam', 'crumb']
  });

  const SKINS = [
    {
      id: 'warm_stone', name: '暖石红毯', dot: '#67717d', outline: '#16110e',
      pal: {},
      fx: { sparkA: '#ff9624', sparkB: '#ffe266', smoke: '#bfb6ab' }
    },
    {
      id: 'antique_brick', name: '古砖翠帐', dot: '#9e4738', outline: '#1c100d',
      pal: {
        stoneDark: '#5e2c24', stoneMid: '#94483a', stoneHi: '#c46c56',
        woodDark:  '#301d15', woodMid:  '#523224', woodHi:  '#784c38',
        topDark:   '#25543e', topMid:   '#387d5c', topHi:   '#5eab84'
      },
      fx: { sparkA: '#ff8a24', sparkB: '#ffd95e', smoke: '#c9bcb4' }
    },
    {
      id: 'black_iron', name: '黑铁赭木', dot: '#393e47', outline: '#0e1014',
      pal: {
        stoneDark: '#262a30', stoneMid: '#3e444d', stoneHi: '#626a75',
        woodDark:  '#522316', woodMid:  '#823b24', woodHi:  '#b05838',
        topDark:   '#78381d', topMid:   '#a8532c', topHi:   '#d47846'
      },
      fx: { sparkA: '#ff781c', sparkB: '#ffcf4d', smoke: '#a8adb5' }
    }
  ];

  // 1. 粗糙青灰石砌壁炉（22×16×26）
  function buildHearth(makeCanvas) {
    const m = new VoxelModel(22, 16, 26, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 底部石砌炉台（向前微伸）
    m.fillAABB(-9.5, 9.5, -6.5, 6.8, 0, 2, (x, y, z, X, Y) => {
      if (Math.abs(X) <= 9.2 && Y >= -6.2 && Y <= 6.5) {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    // 炉体主石砌 + 拱形炉膛掏空
    m.fillAABB(-8.5, 8.5, -6.0, 5.2, 2, 14, (x, y, z, X, Y) => {
      const inBox = Math.abs(X) <= 4.6 && Y >= -2.5 && (z <= 8 || (X * X / 21 + (z - 8) * (z - 8) / 14 <= 1.0));
      if (inBox) {
        // 炉膛背墙与底部涂深黑烟灰
        if (Y < -1.4 || z === 2) m.setRaw(x, y, z, z === 2 ? keyToId.sootMid : keyToId.sootDark, partId.soot);
        return;
      }
      const brickSeam = (z % 3 === 0) && ((Math.round(X + z * 2) % 4) === 0);
      m.setRaw(x, y, z, brickSeam ? keyToId.stoneDark : mat('stone'), partId.stone);
    });

    // 壁炉台面厚实木壁炉架（Z=14..15）+ 两个小铜摆件
    m.fillAABB(-9.6, 9.6, -6.2, 6.2, 14, 15, (x, y, z) => {
      m.setRaw(x, y, z, mat('wood'), partId.wood);
    });
    for (const bx of [-6.5, 6.5]) {
      m.fillAABB(bx - 1.0, bx + 1.0, 2.5, 4.5, 16, 18, (x, y, z) => {
        m.setRaw(x, y, z, mat('brass'), partId.brass);
      });
    }

    // 收窄石烟道（Z=16..25）
    m.fillAABB(-5.5, 5.5, -5.5, 2.5, 16, 25, (x, y, z, X, Y) => {
      const shrink = (z - 16) * 0.16;
      if (Math.abs(X) <= 5.2 - shrink && Y >= -5.2 + shrink * 0.4 && Y <= 2.2 - shrink * 0.8) {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    // 炉膛内交叉柴火木段 + 炽热炉炭底床（进 glowKeys）
    m.paintCapsule(-3.2, 1.2, 3.2, 3.2, 2.6, 4.0, 1.05, 1.05, mat('log'), partId.log, true);
    m.paintCapsule(-2.8, 2.8, 3.3, 2.8, 0.8, 4.1, 1.0, 1.0, mat('log'), partId.log, true);
    m.fillAABB(-2.8, 2.8, 0.2, 3.2, 2, 3, (x, y, z, X, Y) => {
      if (Math.hypot(X * 0.7, Y - 1.7) <= 2.2) {
        m.setRaw(x, y, z, (Math.abs(X) < 1.2) ? keyToId.fireHot : keyToId.fireMid, partId.fire);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 9.5, headZ: 25, centerZ: 12 });
  }

  // 2. 炉膛主火苗（8×8×10，全进 glowKeys）
  function buildFlameTall(makeCanvas) {
    const m = new VoxelModel(8, 8, 10, SPEC);
    const { partId, keyToId } = SPEC;
    m.fillAABB(-3.2, 3.2, -3.2, 3.2, 0, 9, (x, y, z, X, Y) => {
      const u = z / 9;
      const rad = 2.6 * (1 - u * 0.85) + Math.sin(u * Math.PI) * 0.6;
      const d = Math.hypot(X, Y);
      if (d <= rad) {
        let k = keyToId.fireMid;
        if (d <= rad * 0.65 && z >= 1 && z <= 6) k = keyToId.fireHot;
        if (d <= rad * 0.36 && z >= 1 && z <= 4) k = keyToId.fireCore;
        m.setRaw(x, y, z, k, partId.fire);
      }
    });
    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 9, centerZ: 4 });
  }

  // 3. 炉膛副火苗（6×6×8，左右复用 2 块，全进 glowKeys）
  function buildFlameSide(makeCanvas) {
    const m = new VoxelModel(6, 6, 8, SPEC);
    const { partId, keyToId } = SPEC;
    m.fillAABB(-2.4, 2.4, -2.4, 2.4, 0, 7, (x, y, z, X, Y) => {
      const u = z / 7;
      const rad = 2.0 * (1 - u * 0.88);
      const d = Math.hypot(X, Y);
      if (d <= rad) {
        const k = (d <= rad * 0.48 && z >= 1 && z <= 4) ? keyToId.fireCore : (z <= 5 ? keyToId.fireHot : keyToId.fireMid);
        m.setRaw(x, y, z, k, partId.fire);
      }
    });
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 7, centerZ: 3 });
  }

  // 4. 木框工会任务悬赏板（18×8×20，钉满红/黄/青三色委托纸 + 朱红蜡封点）
  function buildBountyBoard(makeCanvas) {
    const m = new VoxelModel(18, 8, 20, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 两侧立柱与稳固底座横脚
    for (const sx of [-7.2, 7.2]) {
      m.fillAABB(sx - 1.0, sx + 1.0, -1.2, 1.2, 0, 18, (x, y, z) => {
        m.setRaw(x, y, z, mat('wood'), partId.wood);
      });
      m.fillAABB(sx - 1.1, sx + 1.1, -3.2, 3.2, 0, 1, (x, y, z) => {
        m.setRaw(x, y, z, mat('wood'), partId.wood);
      });
    }
    // 顶部小木檐与底框
    m.fillAABB(-8.4, 8.4, -2.0, 2.2, 17, 19, (x, y, z) => {
      m.setRaw(x, y, z, mat('wood'), partId.wood);
    });
    m.fillAABB(-7.5, 7.5, -1.2, 1.2, 5, 6, (x, y, z) => {
      m.setRaw(x, y, z, mat('wood'), partId.wood);
    });
    // 悬赏板木背板
    m.fillAABB(-6.4, 6.4, -0.8, 0.8, 6, 17, (x, y, z) => {
      m.setRaw(x, y, z, mat('log'), partId.log);
    });

    // 钉在正反面的鲜红、明黄、天青三色委托纸 + 朱红蜡封点
    const posters = [
      { x0: -5.4, x1: -1.6, z0: 11, z1: 16, matName: 'paperRed',  part: partId.paperRed,  wx: -3.5, wz: 15 },
      { x0: -0.8, x1:  3.0, z0: 11, z1: 16, matName: 'paperYel',  part: partId.paperYel,  wx:  1.1, wz: 15 },
      { x0:  2.2, x1:  5.6, z0:  7, z1: 12, matName: 'paperBlue', part: partId.paperBlue, wx:  3.9, wz: 11 },
      { x0: -4.8, x1: -1.2, z0:  7, z1: 10, matName: 'paperYel',  part: partId.paperYel,  wx: -3.0, wz: 9  }
    ];
    for (const p of posters) {
      m.fillAABB(p.x0, p.x1, 0.8, 1.6, p.z0, p.z1, (x, y, z, X) => {
        const isWax = Math.abs(X - p.wx) <= 0.6 && z === p.wz;
        m.setRaw(x, y, z, isWax ? keyToId.waxCrimson : mat(p.matName), isWax ? partId.wax : p.part);
      });
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.0, headZ: 19, centerZ: 10 });
  }

  // 5. 悬赏板微颤委托纸角（8×4×8，随气流轻颤）
  function buildFlutterNote(makeCanvas) {
    const m = new VoxelModel(8, 4, 8, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-2.2, 2.2, -0.5, 0.7, 1, 6, (x, y, z, X) => {
      const isWax = Math.abs(X) <= 0.6 && z === 5;
      m.setRaw(x, y, z, isWax ? keyToId.waxCrimson : mat('paperRed'), isWax ? partId.wax : partId.paperRed);
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5, headZ: 6, centerZ: 3 });
  }

  // 6. 圆木酒桌（18×18×10，四重对称 symDeg: 90）
  function buildRoundTable(makeCanvas) {
    const m = new VoxelModel(18, 18, 10, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 中央厚实十字脚架与粗木墩柱
    m.fillAABB(-5.5, 5.5, -5.5, 5.5, 0, 7, (x, y, z, X, Y) => {
      const isBase = z <= 1 && (Math.abs(X) <= 1.6 || Math.abs(Y) <= 1.6);
      const isStem = Math.hypot(X, Y) <= 2.4;
      if (isBase || isStem) m.setRaw(x, y, z, mat('wood'), partId.wood);
    });
    // 厚实圆木桌面 + 四向亮铜铆钉
    m.fillAABB(-8.5, 8.5, -8.5, 8.5, 7, 9, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      if (r <= 8.1) {
        const isStud = z === 8 && r >= 7.1 && (Math.abs(X) <= 0.8 || Math.abs(Y) <= 0.8);
        m.setRaw(x, y, z, isStud ? keyToId.brassHi : mat('tableTop'), isStud ? partId.brass : partId.tableTop);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.2, headZ: 9, centerZ: 5 });
  }

  // 7. 桌面切半面包与两只泡沫酒杯（14×14×8）
  function buildTableProps(makeCanvas) {
    const m = new VoxelModel(14, 14, 8, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 切半金黄大面包（左前半块露出浅奶白面包瓤）
    m.fillAABB(-4.5, 0.2, -2.5, 2.2, 0, 3, (x, y, z, X, Y) => {
      const d = Math.hypot((X + 2.2) / 2.6, Y / 2.2, z / 3.0);
      if (d <= 1.0 && X <= -0.2) {
        const isCut = X >= -0.9 && z <= 2;
        m.setRaw(x, y, z, isCut ? keyToId.breadCrumb : keyToId.breadCrust, isCut ? partId.crumb : partId.bread);
      }
    });
    // 右侧两只泡沫酒杯
    for (const [mx, my] of [[3.0, -1.6], [2.4, 2.8]]) {
      m.fillAABB(mx - 2.0, mx + 2.0, my - 2.0, my + 2.0, 0, 6, (x, y, z, X, Y) => {
        const r = Math.hypot(X - mx, Y - my);
        if (z <= 4 && r <= 1.65) {
          m.setRaw(x, y, z, (z === 1 || z === 3) ? mat('brass') : mat('wood'), (z === 1 || z === 3) ? partId.brass : partId.wood);
        } else if (z >= 4 && z <= 6 && r <= (z === 6 ? 1.15 : 1.75)) {
          m.setRaw(x, y, z, keyToId.foamWhite, partId.foam);
        }
      });
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 6, centerZ: 3 });
  }

  // 8. 圆木长凳（14×8×8，左右两张复用同一资产！）
  function buildBench(makeCanvas) {
    const m = new VoxelModel(14, 8, 8, SPEC);
    const { mat, partId } = SPEC;
    // 两侧凳腿
    for (const sx of [-4.6, 4.6]) {
      m.fillAABB(sx - 1.0, sx + 1.0, -2.4, 2.4, 0, 4, (x, y, z) => {
        m.setRaw(x, y, z, mat('wood'), partId.wood);
      });
    }
    // 中间拉撑横梁
    m.fillAABB(-4.5, 4.5, -0.7, 0.7, 1, 2, (x, y, z) => {
      m.setRaw(x, y, z, mat('wood'), partId.wood);
    });
    // 厚实长凳面
    m.fillAABB(-6.2, 6.2, -2.8, 2.8, 4, 5, (x, y, z) => {
      m.setRaw(x, y, z, mat('tableTop'), partId.tableTop);
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.2, headZ: 5, centerZ: 3 });
  }

  const Def = {
    id: 'scene_tavern_hearth_board',
    code: 'T00-B',
    name: '暖壁炉悬赏板与圆木酒桌',
    tag: '酒馆室内 · 壁炉与酒桌',
    summary: '粗糙青灰石砌暖壁炉（3 块错相抖动分层火苗 + 上升橘黄火屑）+ 三色委托纸工会悬赏板 + 圆木酒桌、切半面包酒杯与两张复用长凳',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 21,
    ecoWeight: 1.0,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',   name: '暖炉闲憩', loop: true, status: 'done' },
      { id: 'lively', name: '欢聚热闹', loop: true, status: 'done' }
    ],
    blocks: ['石砌壁炉错相火苗', '上升橘黄火屑', '三色蜡封悬赏板', '圆木酒桌与双长凳复用'],
    soulHabit: '暖橘炉火在青灰石膛里舒缓跳动，旁侧悬赏板贴满委托纸，前方酒桌备好面包麦酒静候冒险家归来',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        hearth:      buildHearth(makeCanvas),
        flameTall:   buildFlameTall(makeCanvas),
        flameSide:   buildFlameSide(makeCanvas),
        bountyBoard: buildBountyBoard(makeCanvas),
        flutterNote: buildFlutterNote(makeCanvas),
        roundTable:  buildRoundTable(makeCanvas),
        tableProps:  buildTableProps(makeCanvas),
        bench:       buildBench(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        livelyBlend: 0,
        flamePhase: 0,
        noteFlutter: 0,
        mugShakeX: 0,
        mugShakeZ: 0,
        sparkTimer: 0
      };

      let curSkin = SKINS[0];

      const instance = {
        def: Def,
        parts,
        partListAssets: Object.values(parts),
        state,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of Object.values(parts)) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(x, y, yaw) {
          state.x = x; state.y = y; state.z = 0; state.yaw = yaw;
          state.livelyBlend = 0; state.flamePhase = 0;
          state.noteFlutter = 0; state.mugShakeX = 0; state.mugShakeZ = 0;
          state.sparkTimer = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const isLively = !!(eco && eco.action === 'lively');
          state.livelyBlend = lerp(state.livelyBlend, isLively ? 1 : 0, expSmooth(dt, 6.0));

          const fireRate = lerp(1.0, 1.65, state.livelyBlend) * freq;
          state.flamePhase += dt * fireRate;

          // 悬赏板任务纸角随暖气流轻颤
          const noteAmp = lerp(0.10, 0.22, state.livelyBlend) * clamp(0.75 + sp * 0.25, 0.6, 1.4);
          state.noteFlutter = Math.sin(time * 2.8 * fireRate) * noteAmp + Math.cos(time * 5.1 * fireRate) * noteAmp * 0.35;

          // lively 时酒桌上酒杯轻微震动
          if (state.livelyBlend > 0.05) {
            const beat = Math.pow(Math.max(0, Math.sin(time * 7.5 * freq)), 4);
            state.mugShakeX = Math.sin(time * 26) * 0.28 * beat * state.livelyBlend;
            state.mugShakeZ = 0.38 * beat * state.livelyBlend;
          } else {
            state.mugShakeX = 0;
            state.mugShakeZ = 0;
          }

          // 壁炉炉膛向上飘升橘黄火屑粒子（lively 时火屑加密）
          if (vfx) {
            const sparkInterval = lerp(0.28, 0.11, state.livelyBlend) / freq;
            state.sparkTimer += dt;
            if (state.sparkTimer >= sparkInterval) {
              state.sparkTimer -= sparkInterval;
              const [fxX, fxY] = localToWorldXY(state.x, state.y, state.yaw, -7.5 * sMul, -8.6 * sMul);
              const fx = curSkin.fx || SKINS[0].fx;
              const col = Math.random() > 0.42 ? fx.sparkA : fx.sparkB;
              vfx.spawnParticle(
                fxX + (Math.random() - 0.5) * 4.2 * sMul,
                fxY + (Math.random() - 0.5) * 2.2 * sMul,
                (state.z + 5.2 + Math.random() * 2.2) * sMul,
                (Math.random() - 0.5) * 4.5 * sMul,
                (1.5 + Math.random() * 3.5) * sMul,
                (8.5 + Math.random() * 6.5 + state.livelyBlend * 4.0) * sMul,
                0.55 + Math.random() * 0.45,
                1.05 + Math.random() * 0.45,
                col, true, 1.5
              );
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const x = state.x, y = state.y, z = state.z, yaw = state.yaw;
          const t = state.flamePhase;
          const lv = state.livelyBlend;
          const list = [];

          // 1. 左后方：粗糙青灰石砌壁炉
          const [hx, hy] = localToWorldXY(x, y, yaw, -7.5 * sMul, -10.5 * sMul);
          list.push({
            partKey: 'hearth', asset: parts.hearth,
            x: hx, y: hy, lift: z, ro: yaw, symDeg: 360, bias: -0.35
          });

          // 2. 炉膛内 3 块错相抖动分层火苗（仅位置与转角抖动，零 scaleX/scaleY 拉伸）
          const fLift = 3.2 + lv * 1.1;
          const [f0x, f0y] = localToWorldXY(x, y, yaw, (-7.5 + Math.sin(t * 6.2) * 0.45) * sMul, -8.7 * sMul);
          list.push({
            partKey: 'flame_center', asset: parts.flameTall,
            x: f0x, y: f0y, lift: z + (fLift + Math.sin(t * 8.4) * 0.55) * sMul,
            ro: wrapAngle(yaw + Math.sin(t * 5.2) * 0.25), symDeg: 360, bias: 0.2, noOutline: true
          });

          const [f1x, f1y] = localToWorldXY(x, y, yaw, (-9.4 + Math.cos(t * 7.1) * 0.35) * sMul, -8.5 * sMul);
          list.push({
            partKey: 'flame_left', asset: parts.flameSide,
            x: f1x, y: f1y, lift: z + (fLift - 0.3 + Math.sin(t * 9.3 + 2.1) * 0.5) * sMul,
            ro: wrapAngle(yaw + Math.cos(t * 6.0) * 0.3), symDeg: 360, bias: 0.22, noOutline: true
          });

          const [f2x, f2y] = localToWorldXY(x, y, yaw, (-5.6 + Math.sin(t * 6.8 + 1.4) * 0.35) * sMul, -8.5 * sMul);
          list.push({
            partKey: 'flame_right', asset: parts.flameSide,
            x: f2x, y: f2y, lift: z + (fLift - 0.2 + Math.cos(t * 8.8 + 0.9) * 0.5) * sMul,
            ro: wrapAngle(yaw - Math.sin(t * 6.4) * 0.3), symDeg: 360, bias: 0.22, noOutline: true
          });

          // 3. 右后方：木框工会任务悬赏板（略向大厅中央偏转，正面面向访客）
          const boardYaw = wrapAngle(yaw - 0.22);
          const [bx, by] = localToWorldXY(x, y, yaw, 11.2 * sMul, -9.2 * sMul);
          list.push({
            partKey: 'bountyBoard', asset: parts.bountyBoard,
            x: bx, y: by, lift: z, ro: boardYaw, symDeg: 360, bias: -0.25
          });

          // 4. 悬赏板微颤委托纸角
          const [nx, ny] = localToWorldXY(bx, by, boardYaw, 0.2 * sMul, 1.4 * sMul);
          list.push({
            partKey: 'flutterNote', asset: parts.flutterNote,
            x: nx, y: ny, lift: z + (6.6 + Math.abs(state.noteFlutter) * 0.6) * sMul,
            ro: wrapAngle(boardYaw + state.noteFlutter), symDeg: 360, bias: 0.45
          });

          // 5. 前方中央：圆木酒桌（symDeg: 90）
          const [tx, ty] = localToWorldXY(x, y, yaw, 1.5 * sMul, 10.2 * sMul);
          list.push({
            partKey: 'roundTable', asset: parts.roundTable,
            x: tx, y: ty, lift: z, ro: yaw, symDeg: 90, bias: 0.1
          });

          // 6. 桌面切半面包与泡沫酒杯（欢聚态微震）
          const [px, py] = localToWorldXY(tx, ty, yaw, state.mugShakeX * sMul, 0);
          list.push({
            partKey: 'tableProps', asset: parts.tableProps,
            x: px, y: py, lift: z + (9.0 + state.mugShakeZ) * sMul,
            ro: yaw, symDeg: 360, bias: 0.45
          });

          // 7. 酒桌左右两张复用圆木长凳
          const [b1x, b1y] = localToWorldXY(tx, ty, yaw, -12.6 * sMul, 0.5 * sMul);
          list.push({
            partKey: 'bench_left', asset: parts.bench,
            x: b1x, y: b1y, lift: z, ro: wrapAngle(yaw + Math.PI * 0.5), symDeg: 180, bias: 0.05
          });

          const [b2x, b2y] = localToWorldXY(tx, ty, yaw, 12.6 * sMul, 0.5 * sMul);
          list.push({
            partKey: 'bench_right', asset: parts.bench,
            x: b2x, y: b2y, lift: z, ro: wrapAngle(yaw - Math.PI * 0.5), symDeg: 180, bias: 0.05
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id, code: Def.code, name: Def.name, skin: curSkin.id,
            footRadius: Def.footRadius, blocks: Def.blocks, params: { ...params },
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
