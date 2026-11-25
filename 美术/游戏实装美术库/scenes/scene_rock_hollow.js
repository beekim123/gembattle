'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // S03 标杆 · 藏物树洞与歇脚石碑（T09 林地落果空坪）
  //
  // 拆件与图集预算（单盒严格 <= 40 格，仅石碑微亮符核进 glowKeys）：
  //   - stump     (26×26×22, lift=0, bias=-0.15)：斜断粗老树桩 + 深邃暗褐树洞 + 青藤与小黄菇
  //   - treasure  (8×8×8,    lift=6, bias=+0.25)：洞内金色宝物/卷轴角（独立件，支持探颤与微弹）
  //   - stele     (16×14×26, lift=0, bias=+0.05)：灰白刻纹苔藓歇脚石碑
  //   - runeGem   (6×6×7,    lift=12, bias=+0.45)：碑心微亮青金符石（独立自亮件，支持脉动）
  //   - stepStone (10×9×4,   lift=0, bias=-0.35, symDeg: 180)：碑前 2 块复用踏脚石
  //
  // 展示动作：
  //   - idle      ：常态融入林地，偶从树洞逸出 1 粒极淡提示小亮点
  //   - near_hint ：走近感应态，洞内藏物轻颤、碑心符石明暗脉动并升起暖金与青色微粒
  //   - activate  ：互动开启/歇脚触发，树洞弹出金币与微粒、石碑涌出柔和青绿回心微粒环
  // =========================================================================

  // 29 色独立色表（严守 <= 48 色、0 重色，仅 runeMid / runeCore 进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 粗大老树桩外皮
      barkDark:   '#382117',
      barkMid:    '#613a27',
      barkHi:     '#8f5a3e',
      // 斜断木芯年轮
      woodDark:   '#7d5a38',
      woodMid:    '#b58958',
      woodHi:     '#e0ba84',
      // 树洞深邃内壁
      cavDark:    '#170d09',
      cavMid:     '#2b1912',
      cavHi:      '#45291e',
      // 青藤与苔藓
      vineDark:   '#1e4f28',
      vineMid:    '#37823d',
      vineHi:     '#68bf58',
      // 树洞边缘小黄菇
      shroomDark: '#ad6d17',
      shroomMid:  '#e8a72e',
      shroomHi:   '#ffe06b',
      // 洞内金色宝物/卷轴角（绝不进 glowKeys）
      goldDark:   '#9e6514',
      goldMid:    '#de9f28',
      goldHi:     '#ffd866',
      // 卷轴绛红束带
      ribbonDark: '#7a1922',
      ribbonMid:  '#bf2e3a',
      ribbonHi:   '#f2666b',
      // 灰白苔藓歇脚石碑
      stoneDark:  '#5c6c73',
      stoneMid:   '#95a8ad',
      stoneHi:    '#d2e0e0',
      // 碑面刻纹深槽
      carveDark:  '#3a484f',
      carveMid:   '#596b73',
      carveHi:    '#7e949c',
      // 碑心微亮青金符石（仅这两键进 glowKeys）
      runeMid:    '#48d4bd',
      runeCore:   '#b8fff0'
    },
    glowKeys: ['runeMid', 'runeCore'],
    parts: [
      'bark', 'wood', 'cav', 'vine', 'shroom',
      'gold', 'ribbon', 'stone', 'carve', 'rune'
    ],
    noCrease: [
      ['bark', 'wood'], ['bark', 'cav'], ['bark', 'vine'],
      ['stone', 'carve'], ['stone', 'vine'], ['gold', 'ribbon']
    ],
    materials: {
      bark:   ['barkDark',   'barkMid',   'barkHi'],
      wood:   ['woodDark',   'woodMid',   'woodHi'],
      cav:    ['cavDark',    'cavMid',    'cavHi'],
      vine:   ['vineDark',   'vineMid',   'vineHi'],
      shroom: ['shroomDark', 'shroomMid', 'shroomHi'],
      gold:   ['goldDark',   'goldMid',   'goldHi'],
      ribbon: ['ribbonDark', 'ribbonMid', 'ribbonHi'],
      stone:  ['stoneDark',  'stoneMid',  'stoneHi'],
      carve:  ['carveDark',  'carveMid',  'carveHi']
    },
    protectedParts: ['rune', 'shroom', 'ribbon']
  });

  // 3 套零重建模换色皮肤（0 禁用字）
  const SKINS = [
    {
      id: 'moss_forest_stele',
      name: '青苔林碑',
      dot: '#48d4bd',
      outline: '#101614',
      pal: {},
      fx: {
        hint: '#ffe073',
        goldA: '#de9f28',
        goldB: '#ffe27a',
        runeA: '#48d4bd',
        runeB: '#9efae5',
        heal: '#6be39b'
      }
    },
    {
      id: 'autumn_stump',
      name: '赤秋枯桩',
      dot: '#e3762b',
      outline: '#1a110c',
      pal: {
        barkDark:  '#422015', barkMid:  '#733b26', barkHi:  '#a65c3c',
        woodDark:  '#8a5d34', woodMid:  '#c48d52', woodHi:  '#edc082',
        vineDark:  '#7a2818', vineMid:  '#bd4624', vineHi:  '#f07d3c',
        shroomDark:'#9c4816', shroomMid:'#db7625', shroomHi:'#ffba4f',
        stoneDark: '#69625a', stoneMid: '#a3998c', stoneHi: '#ded4c5',
        carveDark: '#47413b', carveMid: '#6e655c', carveHi: '#94887c',
        runeMid:   '#f0b23c', runeCore: '#fff0a8'
      },
      fx: {
        hint: '#ffe38a',
        goldA: '#e8a22a',
        goldB: '#ffe680',
        runeA: '#f0b23c',
        runeB: '#fff0a8',
        heal: '#f5c764'
      }
    },
    {
      id: 'ancient_relic_teal',
      name: '遗迹古青',
      dot: '#5aa6b8',
      outline: '#0d151a',
      pal: {
        barkDark:  '#2c2a2e', barkMid:  '#4d4952', barkHi:  '#75707d',
        woodDark:  '#5c5850', woodMid:  '#8c877b', woodHi:  '#bab4a4',
        vineDark:  '#1d4f4a', vineMid:  '#318278', vineHi:  '#5cc4b4',
        shroomDark:'#2b736e', shroomMid:'#4eb3a8', shroomHi:'#91ede0',
        stoneDark: '#465e6b', stoneMid: '#7395a6', stoneHi: '#b0d0de',
        carveDark: '#293b45', carveMid: '#435e6b', carveHi: '#628596',
        runeMid:   '#5cd4ff', runeCore: '#d4f7ff'
      },
      fx: {
        hint: '#a8f0ff',
        goldA: '#e0ab36',
        goldB: '#ffe280',
        runeA: '#5cd4ff',
        runeB: '#d4f7ff',
        heal: '#78e6d4'
      }
    }
  ];

  // =========================================================================
  // 1. 粗大斜断老树桩主体（26×26×22）
  //    正面（+Y 侧）树腰挖出深邃暗褐树洞口，边缘缠青藤与一簇小黄菇
  // =========================================================================
  function buildStump(makeCanvas) {
    const m = new VoxelModel(26, 26, 22, SPEC);
    const { mat, partId } = SPEC;

    // 树桩本体 + 斜断切面（-Y 侧高至 z=20，+Y 侧略低至 z=15）
    m.fillAABB(-11.5, 11.5, -11.5, 11.5, 0, 21, (x, y, z, X, Y) => {
      const topZ = 17.6 - Y * 0.28 + Math.sin(X * 0.45) * 0.6;
      if (z > topZ) return;

      const t = clamp(z / 18, 0, 1);
      const ang = Math.atan2(Y, X);
      const botFlare = Math.pow(1 - smoothstep(0.0, 0.42, t), 1.4) * 3.2;
      const ridge = Math.sin(ang * 6) * 0.58 + Math.cos(ang * 3 + 0.5) * 0.32;
      const rOuter = 6.8 + botFlare + ridge;
      const d = Math.hypot(X, Y);

      if (d <= rOuter) {
        // 树洞挖槽（正面 +Y 侧，z=4..12）：外口宽 4.2、深挖入树腰
        const inHollow = Y > 1.0 && Math.hypot(X / 3.6, (z - 7.8) / 4.2) < 1.0;
        if (inHollow) {
          // 留出最深处内壁（Y 靠近 1.0..2.4 处画深邃洞壁，前面掏空）
          if (Y < 2.6 || Math.hypot(X / 3.6, (z - 7.8) / 4.2) > 0.78) {
            m.setRaw(x, y, z, mat('cav'), partId.cav);
          }
          return;
        }
        // 斜断顶部露出年轮木芯
        if (z >= topZ - 1.5 && d < rOuter - 1.1) {
          m.setRaw(x, y, z, mat('wood'), partId.wood);
        } else {
          m.setRaw(x, y, z, mat('bark'), partId.bark);
        }
      }
    });

    // 4 条扎实抓地老树根
    const rootAngs = [0.55, 2.15, 3.65, 5.15];
    for (let i = 0; i < rootAngs.length; i++) {
      const a = rootAngs[i];
      m.paintCapsule(
        Math.cos(a) * 5.8, Math.sin(a) * 5.8, 4.4,
        Math.cos(a) * 11.2, Math.sin(a) * 11.2, 1.0,
        2.3, 1.05, mat('bark'), partId.bark, true
      );
    }

    // 缠绕树洞边缘与桩顶的青藤
    m.paintCapsule(-5.8, 3.6, 1.8, -4.6, 6.2, 9.2, 1.1, 0.95, mat('vine'), partId.vine, true);
    m.paintCapsule(-4.6, 6.2, 9.2, 0.8, 5.6, 13.4, 0.95, 0.85, mat('vine'), partId.vine, true);
    m.paintCapsule(0.8, 5.6, 13.4, 5.2, 3.4, 15.8, 0.9, 0.75, mat('vine'), partId.vine, true);
    m.paintEllipsoid(-5.4, -3.6, 16.4, 2.4, 2.2, 1.5, mat('vine'), partId.vine, true);

    // 树洞右侧与根边的一簇鲜亮小黄菇
    const shrooms = [
      [5.4, 5.4, 3.2, 1.9, 1.2],
      [7.0, 4.2, 2.2, 1.4, 0.95],
      [4.5, 6.6, 1.9, 1.3, 0.90]
    ];
    for (const [sx, sy, sz, sr, sh] of shrooms) {
      m.paintCapsule(sx, sy, 0.6, sx, sy, sz, 0.65, 0.55, mat('wood'), partId.wood, true);
      m.paintEllipsoid(sx, sy, sz + 0.4, sr, sr, sh, mat('shroom'), partId.shroom, true);
    }

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 11.2, headZ: 21, centerZ: 10 });
  }

  // =========================================================================
  // 2. 洞内金色宝物与卷轴角（8×8×8，独立件，便于走近探颤与开启微弹）
  // =========================================================================
  function buildTreasure(makeCanvas) {
    const m = new VoxelModel(8, 8, 8, SPEC);
    const { mat, partId } = SPEC;
    // 金色宝囊/宝箱角
    m.paintEllipsoid(-0.8, 0.2, 2.6, 2.4, 2.2, 2.1, mat('gold'), partId.gold, true);
    // 斜露出的金色卷轴筒 + 绛红束带
    m.paintCapsule(0.6, -1.0, 2.8, 2.0, 2.4, 4.6, 1.35, 1.35, mat('gold'), partId.gold, true);
    m.paintEllipsoid(1.3, 0.7, 3.7, 1.55, 1.0, 1.55, mat('ribbon'), partId.ribbon, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 3. 灰白苔藓刻纹歇脚石碑（16×14×26）
  // =========================================================================
  function buildStele(makeCanvas) {
    const m = new VoxelModel(16, 14, 26, SPEC);
    const { mat, partId } = SPEC;

    // 宽厚石座（z=0..4）
    m.fillAABB(-6.8, 6.8, -5.2, 5.2, 0, 4, (x, y, z, X, Y) => {
      const shrink = z * 0.22;
      if (Math.abs(X) <= 6.5 - shrink && Math.abs(Y) <= 4.8 - shrink) {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    // 略微收尖的古朴石碑主体（z=4..24），带柔和圆弧顶与刻纹深槽
    m.fillAABB(-5.8, 5.8, -3.8, 3.8, 4, 24, (x, y, z, X, Y) => {
      const t = (z - 4) / 20;
      const wLim = lerp(5.2, 3.8, t) - (t > 0.82 ? Math.pow((t - 0.82) / 0.18, 2) * 2.4 : 0);
      const dLim = lerp(3.2, 2.4, t);
      if (Math.abs(X) <= wLim && Math.abs(Y) <= dLim) {
        // 碑心正中留出镶嵌青金符石的凹槽
        const inSocket = Y > 0.8 && Math.hypot(X / 2.0, (z - 14.5) / 2.6) < 1.0;
        if (inSocket) {
          m.setRaw(x, y, z, mat('carve'), partId.carve);
          return;
        }
        // 正反面柔和几何刻纹槽
        const isCarve = Math.abs(Y) > dLim - 0.9 && (
          (Math.abs(Math.abs(X) - (wLim - 1.2)) < 0.7 && z > 6 && z < 21) ||
          (Math.abs(z - 8) < 0.65 && Math.abs(X) < wLim - 1.0) ||
          (Math.abs(z - 19.5) < 0.65 && Math.abs(X) < wLim - 1.2)
        );
        m.setRaw(x, y, z, isCarve ? mat('carve') : mat('stone'), isCarve ? partId.carve : partId.stone);
      }
    });

    // 碑顶与碑肩自然垂挂的林地青苔
    m.paintEllipsoid(-2.4, 0.2, 22.8, 2.4, 2.2, 1.5, mat('vine'), partId.vine, true);
    m.paintEllipsoid(3.4, -1.2, 18.6, 1.8, 1.8, 1.4, mat('vine'), partId.vine, true);
    m.paintEllipsoid(-4.8, 2.2, 3.6, 2.0, 1.8, 1.4, mat('vine'), partId.vine, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 6.8, headZ: 25, centerZ: 12 });
  }

  // =========================================================================
  // 4. 碑心微亮青金符石（6×6×7，仅此件含 glowKeys，独立控 opacity 实现脉动）
  // =========================================================================
  function buildRuneGem(makeCanvas) {
    const m = new VoxelModel(6, 6, 7, SPEC);
    const { keyToId, partId } = SPEC;
    m.fillAABB(-2.5, 2.5, -2.5, 2.5, 0, 6, (x, y, z, X, Y) => {
      const d = Math.abs(X) / 2.0 + Math.abs(Y) / 1.8 + Math.abs(z - 3.0) / 2.8;
      if (d <= 1.0) {
        const isCore = d <= 0.56;
        m.setRaw(x, y, z, isCore ? keyToId.runeCore : keyToId.runeMid, partId.rune);
      }
    });
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 6, centerZ: 3 });
  }

  // =========================================================================
  // 5. 碑前踏脚石（10×9×4，复用 2 块，symDeg: 180）
  // =========================================================================
  function buildStepStone(makeCanvas) {
    const m = new VoxelModel(10, 9, 4, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-4.5, 4.5, -4.0, 4.0, 0, 3, (x, y, z, X, Y) => {
      const shrink = z * 0.25;
      const d = Math.hypot(X / (4.3 - shrink), Y / (3.6 - shrink));
      if (d <= 1.0) {
        const isMoss = d > 0.72 && Y < -0.5 && z >= 1;
        m.setRaw(x, y, z, isMoss ? mat('vine') : mat('stone'), isMoss ? partId.vine : partId.stone);
      }
    });
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 3, centerZ: 1.5 });
  }

  // 组合局部坐标布局（树桩在左前，石碑在右后，两块踏脚石铺在碑前）
  const LAYOUT = {
    stump:     { lx: -6.8, ly:  1.4, ro:  0.18 },
    treasure:  { lx: -6.2, ly:  6.4, z:   5.2  },
    stele:     { lx:  8.4, ly: -3.2, ro: -0.24 },
    runeLocal: { lx:  0.0, ly:  2.3, z:  11.6  },
    steps: [
      { lx:  6.2, ly:  5.8, ro: -0.20 },
      { lx: 11.4, ly: 10.2, ro:  0.15 }
    ]
  };

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_rock_hollow',
    code: 'S03',
    name: '藏物树洞与歇脚石碑',
    status: 'done',
    defaultHabitat: 'forest',
    tag: 'S03 标杆 · 藏物树洞与歇脚石碑',
    summary: '斜断老树桩（含深邃暗褐树洞、洞内金色藏物、青藤与小黄菇）+ 灰白刻纹苔藓歇脚石碑（微亮青金符石）+ 碑前双踏脚石，支持常态 / 走近感应 / 互动开启三态切换',
    footRadius: 15.0,
    ecoWeight: 3.5,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',      name: '常态融入林地',   loop: true,  status: 'done' },
      { id: 'near_hint', name: '走近感应态',     loop: true,  status: 'done' },
      { id: 'activate',  name: '互动开启与歇脚', loop: false, duration: 2.4, status: 'done' }
    ],
    blocks: ['斜断老树桩与深邃树洞', '洞内可动藏物与小黄菇', '刻纹苔藓石碑与青金符核', '三态探索互动反馈'],
    soulHabit: '常态下安静融入林地仅偶从树洞逸出极淡提示亮点；走近时洞中藏物轻颤、碑心符石明暗脉动；互动触发后树洞弹出金币微粒、石碑涌出柔和青绿回心微粒环',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        stump:     buildStump(makeCanvas),
        treasure:  buildTreasure(makeCanvas),
        stele:     buildStele(makeCanvas),
        runeGem:   buildRuneGem(makeCanvas),
        stepStone: buildStepStone(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        runeOpacity: 0.48,
        treasureOffX: 0,
        treasureOffY: 0,
        treasureLiftAdd: 0,
        hintClock: 1.4,
        nearClock: 0.2,
        lastAction: 'idle',
        activatePhase: 0
      };

      let curSkin = SKINS[0];

      function worldHollowPos(sMul) {
        return localToWorldXY(state.x, state.y, state.yaw, LAYOUT.treasure.lx * sMul, (LAYOUT.treasure.ly + 1.2) * sMul);
      }

      function worldStelePos(sMul) {
        return localToWorldXY(state.x, state.y, state.yaw, LAYOUT.stele.lx * sMul, LAYOUT.stele.ly * sMul);
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
          state.runeOpacity = 0.48;
          state.treasureOffX = 0;
          state.treasureOffY = 0;
          state.treasureLiftAdd = 0;
          state.hintClock = 1.2;
          state.nearClock = 0.15;
          state.lastAction = 'idle';
          state.activatePhase = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.activatePhase = 0;
          }

          state.treasureOffX = 0;
          state.treasureOffY = 0;
          state.treasureLiftAdd = 0;

          if (action === 'idle') {
            state.runeOpacity = 0.44 + Math.sin(time * 1.4) * 0.08;
            // 偶从树洞逸出 1 粒极淡提示小亮点（呼应 7.1 远远能看到一点迹象）
            state.hintClock -= dt;
            if (state.hintClock <= 0 && vfx) {
              state.hintClock = 2.1 + Math.random() * 1.3;
              const [hx, hy] = worldHollowPos(sMul);
              vfx.spawnParticle(
                hx + (Math.random() - 0.5) * 2.0 * sMul,
                hy + (Math.random() - 0.5) * 1.5 * sMul,
                8.5 * sMul,
                (Math.random() - 0.5) * 1.4 * sMul,
                (Math.random() - 0.5) * 1.4 * sMul,
                4.8 * sMul,
                1.25,
                1.15,
                fx.hint,
                true,
                -1.2
              );
            }
          } else if (action === 'near_hint') {
            // 洞内藏物轻轻探颤（严格小幅水平位移，零小数缩放）
            state.treasureOffX = Math.sin(time * 11.0 * gFreq) * 0.30 * sMul;
            state.treasureOffY = (0.45 + Math.sin(time * 4.2 * gFreq) * 0.25) * sMul;
            state.treasureLiftAdd = Math.max(0, Math.sin(time * 5.5 * gFreq)) * 0.35 * sMul;
            // 石碑青金符石明暗脉动
            state.runeOpacity = 0.42 + (0.5 + 0.5 * Math.sin(time * 4.4 * gFreq)) * 0.58;

            state.nearClock -= dt;
            if (state.nearClock <= 0 && vfx) {
              state.nearClock = 0.26;
              const [hx, hy] = worldHollowPos(sMul);
              const [sx, sy] = worldStelePos(sMul);
              // 暖金藏物微粒
              vfx.spawnParticle(
                hx + (Math.random() - 0.5) * 3.0 * sMul,
                hy + (Math.random() - 0.5) * 2.5 * sMul,
                8.0 * sMul,
                (Math.random() - 0.5) * 2.5 * sMul,
                (Math.random() - 0.5) * 2.5 * sMul,
                7.2 * sMul,
                0.95,
                1.25,
                fx.goldB,
                true,
                -2.0
              );
              // 石碑周围环绕升起青色微粒
              const a = time * 2.6 + Math.random() * 0.6;
              const r = 6.2 * sMul;
              vfx.spawnParticle(
                sx + Math.cos(a) * r,
                sy + Math.sin(a) * r,
                4.5 * sMul,
                -Math.sin(a) * 2.2 * sMul,
                Math.cos(a) * 2.2 * sMul,
                8.5 * sMul,
                1.05,
                1.30,
                fx.runeA,
                true,
                -1.8
              );
            }
          } else if (action === 'activate') {
            const u = clamp(actionTime / 2.4, 0, 1);
            const pop = Math.sin(clamp(u / 0.28, 0, 1) * Math.PI);
            state.treasureOffY = pop * 1.6 * sMul;
            state.treasureLiftAdd = pop * 1.4 * sMul;
            state.runeOpacity = clamp(0.55 + Math.sin(clamp(u / 0.65, 0, 1) * Math.PI) * 0.45, 0.45, 1.0);

            // 阶段 0（t >= 0.12s）：树洞弹出一小簇金币与微粒
            if (state.activatePhase === 0 && actionTime >= 0.12 && vfx) {
              state.activatePhase = 1;
              const [hx, hy] = worldHollowPos(sMul);
              for (let k = 0; k < 10; k++) {
                const a = (k / 10) * TAU + Math.random() * 0.35;
                const sp = (6.0 + Math.random() * 8.5) * sMul;
                vfx.spawnParticle(
                  hx, hy, 8.2 * sMul,
                  Math.cos(a) * sp, Math.sin(a) * sp, (11.0 + Math.random() * 8.0) * sMul,
                  0.85 + Math.random() * 0.35,
                  1.55 + Math.random() * 0.35,
                  k % 2 === 0 ? fx.goldA : fx.goldB,
                  k % 3 === 0,
                  42
                );
              }
            }

            // 阶段 1（t >= 0.35s）：石碑涌出柔和青绿回心微粒环 + 地面扩散涟漪
            if (state.activatePhase === 1 && actionTime >= 0.35 && vfx) {
              state.activatePhase = 2;
              const [sx, sy] = worldStelePos(sMul);
              vfx.addRipple(sx, sy, 3.0 * sMul, 19.5 * sMul, 0.95, 2.0);
              vfx.addRipple(sx, sy, 1.5 * sMul, 13.0 * sMul, 0.72, 1.4);
              for (let k = 0; k < 14; k++) {
                const a = (k / 14) * TAU;
                const r = 5.5 * sMul;
                vfx.spawnParticle(
                  sx + Math.cos(a) * r,
                  sy + Math.sin(a) * r,
                  6.0 * sMul,
                  Math.cos(a) * 5.2 * sMul,
                  Math.sin(a) * 5.2 * sMul,
                  (9.5 + (k % 3) * 2.5) * sMul,
                  1.15 + Math.random() * 0.30,
                  1.45,
                  k % 2 === 0 ? fx.heal : fx.runeB,
                  true,
                  -1.5
                );
              }
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const list = [];

          // 1. 碑前 2 块踏脚石（复用同一部件）
          for (let i = 0; i < LAYOUT.steps.length; i++) {
            const st = LAYOUT.steps[i];
            const [px, py] = localToWorldXY(state.x, state.y, yw, st.lx * sMul, st.ly * sMul);
            list.push({
              partKey: 'stepStone',
              asset: parts.stepStone,
              x: px,
              y: py,
              lift: 0,
              ro: wrapAngle(yw + st.ro),
              bias: -0.35,
              symDeg: 180
            });
          }

          // 2. 斜断老树桩主体
          const [stx, sty] = localToWorldXY(state.x, state.y, yw, LAYOUT.stump.lx * sMul, LAYOUT.stump.ly * sMul);
          list.push({
            partKey: 'stump',
            asset: parts.stump,
            x: stx,
            y: sty,
            lift: 0,
            ro: wrapAngle(yw + LAYOUT.stump.ro),
            bias: -0.15
          });

          // 3. 洞内金色宝物与卷轴角
          const [tx, ty] = localToWorldXY(
            state.x, state.y, yw,
            LAYOUT.treasure.lx * sMul + state.treasureOffX,
            LAYOUT.treasure.ly * sMul + state.treasureOffY
          );
          list.push({
            partKey: 'treasure',
            asset: parts.treasure,
            x: tx,
            y: ty,
            lift: (LAYOUT.treasure.z * sMul) + state.treasureLiftAdd,
            ro: wrapAngle(yw + LAYOUT.stump.ro),
            bias: 0.25
          });

          // 4. 灰白刻纹苔藓歇脚石碑
          const steleYaw = wrapAngle(yw + LAYOUT.stele.ro);
          const [bx, by] = localToWorldXY(state.x, state.y, yw, LAYOUT.stele.lx * sMul, LAYOUT.stele.ly * sMul);
          list.push({
            partKey: 'stele',
            asset: parts.stele,
            x: bx,
            y: by,
            lift: 0,
            ro: steleYaw,
            bias: 0.05
          });

          // 5. 碑心微亮青金符石（独立自亮件，通过 opacity 表达明暗脉动）
          const [rx, ry] = localToWorldXY(bx, by, steleYaw, LAYOUT.runeLocal.lx * sMul, LAYOUT.runeLocal.ly * sMul);
          list.push({
            partKey: 'runeGem',
            asset: parts.runeGem,
            x: rx,
            y: ry,
            lift: LAYOUT.runeLocal.z * sMul,
            ro: steleYaw,
            opacity: state.runeOpacity,
            bias: 0.45
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
