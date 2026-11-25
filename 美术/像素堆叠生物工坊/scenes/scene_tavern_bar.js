'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { clamp, lerp, smoothstep, expSmooth, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T00-A 酒馆长木吧台与橡木酒桶架（室内家具 A，+Y 面向客人）
  //   1. 拆块组合（全部件盒 <= 36×24×16，零非自亮进 glowKeys）：
  //      - barCounter (36×22×14)：厚实 L 型弧边深橡木吧台 + 浅暖打磨木台面 + 亮金铜脚踏杆
  //      - barrelRack (30×10×8) ：吧台后排酒桶木托架
  //      - oakBarrel  (12×12×14)：铜箍大橡木酒桶（3 只共用 1 套资产，symDeg: 90）
  //      - brassTray  (10×10×5) ：台面亮金铜盘与琥珀酒壶（symDeg: 90）
  //      - aleMug     (8×8×8)   ：冒白沫的麦酒杯（2 只共用 1 套资产）
  //   2. 动作：
  //      - idle ：酒杯泡沫微动、偶有细腻水汽小粒升起
  //      - serve：麦酒杯沿打磨台面轻滑推到吧台前沿并冒出细腻白沫粒
  //   3. 3 套木材换色（暖胡桃木、深烟熏橡木、浅松木），<= 48 色 0 重色 0 禁用字
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      woodDark:   '#3b2113',
      woodMid:    '#643a21',
      woodHi:     '#8e5936',

      topDark:    '#9c6838',
      topMid:     '#c78e52',
      topHi:      '#e8b97a',

      barrelDark: '#4f2c16',
      barrelMid:  '#7d4924',
      barrelHi:   '#ab6d3b',

      brassDark:  '#8f6014',
      brassMid:   '#d89b24',
      brassHi:    '#fae06b',

      mugDark:    '#57341a',
      mugMid:     '#8a552a',
      mugHi:      '#bd7e42',

      aleDark:    '#a85610',
      aleMid:     '#df841c',
      aleHi:      '#f7b643',

      foamDark:   '#d6cbb6',
      foamMid:    '#efe7d8',
      foamHi:     '#fcf9f2',

      ironDark:   '#333840',
      ironMid:    '#545c66',
      ironHi:     '#7b8591',

      clothDark:  '#751b22',
      clothMid:   '#ad2a34',
      clothHi:    '#d94c54'
    },
    glowKeys: [],
    parts: ['barWood', 'barTop', 'panel', 'brass', 'barrel', 'iron', 'mug', 'ale', 'foam', 'cloth'],
    noCrease: [
      ['ale', 'foam'], ['mug', 'foam'], ['mug', 'ale'],
      ['barTop', 'brass']
    ],
    materials: {
      wood:   ['woodDark',   'woodMid',   'woodHi'],
      top:    ['topDark',    'topMid',    'topHi'],
      barrel: ['barrelDark', 'barrelMid', 'barrelHi'],
      brass:  ['brassDark',  'brassMid',  'brassHi'],
      mug:    ['mugDark',    'mugMid',    'mugHi'],
      ale:    ['aleDark',    'aleMid',    'aleHi'],
      foam:   ['foamDark',   'foamMid',   'foamHi'],
      iron:   ['ironDark',   'ironMid',   'ironHi'],
      cloth:  ['clothDark',  'clothMid',  'clothHi']
    },
    protectedParts: ['brass', 'foam', 'ale']
  });

  const SKINS = [
    {
      id: 'walnut', name: '暖胡桃木', dot: '#7d4924', outline: '#1a100a',
      pal: {},
      fx: { foam: '#fcf9f2', mist: '#efe7d8', ale: '#f7b643' }
    },
    {
      id: 'smoked_oak', name: '深烟熏橡木', dot: '#3d2b24', outline: '#120d0c',
      pal: {
        woodDark:   '#241915', woodMid:   '#3d2b24', woodHi:   '#5c443a',
        topDark:    '#7a4e2c', topMid:    '#a66e40', topHi:    '#cf9661',
        barrelDark: '#332018', barrelMid: '#543628', barrelHi: '#7a523e',
        brassDark:  '#7d491c', brassMid:  '#bd7432', brassHi:  '#ebaa5e'
      },
      fx: { foam: '#faf5eb', mist: '#e8dfd0', ale: '#f5ad38' }
    },
    {
      id: 'pale_pine', name: '浅松木', dot: '#cf9b57', outline: '#24180c',
      pal: {
        woodDark:   '#785028', woodMid:   '#ad7840', woodHi:   '#d6a365',
        topDark:    '#bfa06d', topMid:    '#dec392', topHi:    '#f5e2ba',
        barrelDark: '#825629', barrelMid: '#b57e42', barrelHi: '#dbab69',
        clothDark:  '#1f4e45', clothMid:  '#31786a', clothHi:  '#52a694'
      },
      fx: { foam: '#fffdf7', mist: '#f2eadb', ale: '#fac04d' }
    }
  ];

  // 1. 厚实 L 型/弧边深橡木吧台（36×22×14）
  function buildBarCounter(makeCanvas) {
    const m = new VoxelModel(36, 22, 14, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 吧台主体柜箱：横向长台 + 左侧 (-X) 向后 (-Y) 折出的 L 型弧角翼
    m.fillAABB(-16.5, 16.5, -9.5, 8.5, 0, 11, (x, y, z, X, Y) => {
      const inMain = Math.abs(X) <= 15.2 && Y >= -1.2 && Y <= 6.2;
      const inWing = X >= -15.2 && X <= -7.8 && Y >= -8.8 && Y <= 6.2;
      // 弧边圆角裁剪
      const cornerCut = (X > 13.0 && Y > 4.0 && Math.hypot(X - 13.0, Y - 4.0) > 2.3) ||
                        (X < -13.0 && Y > 4.0 && Math.hypot(X + 13.0, Y - 4.0) > 2.3);
      if ((inMain || inWing) && !cornerCut) {
        // 吧台正面嵌板凹槽与立柱分块（强化 Crease AO）
        const isFront = Y >= 5.2 && z >= 2 && z <= 9;
        const isPillar = isFront && ((Math.abs(X) < 1.2) || (Math.abs(Math.abs(X) - 7.5) < 1.1) || Math.abs(X) > 13.5);
        const isInset = isFront && !isPillar && z >= 3 && z <= 8;
        if (isInset && Y > 5.7) return; // 浅凹 1 格形成立体护墙板
        m.setRaw(x, y, z, mat('wood'), isPillar ? partId.panel : partId.barWood);
      }
    });

    // 顶面浅暖打磨厚木台面（比柜体四周微挑 1 格，弧角顺滑）
    m.fillAABB(-17.5, 17.5, -10.2, 9.2, 11, 13, (x, y, z, X, Y) => {
      const inMain = Math.abs(X) <= 16.4 && Y >= -2.2 && Y <= 7.4;
      const inWing = X >= -16.4 && X <= -6.8 && Y >= -9.6 && Y <= 7.4;
      const cornerCut = (X > 13.8 && Y > 4.8 && Math.hypot(X - 13.8, Y - 4.8) > 2.7) ||
                        (X < -13.8 && Y > 4.8 && Math.hypot(X + 13.8, Y - 4.8) > 2.7);
      if ((inMain || inWing) && !cornerCut) {
        const isBevel = z === 13 && (Y > 6.8 || Math.abs(X) > 15.8);
        m.setRaw(x, y, z, isBevel ? keyToId.topHi : mat('top'), partId.barTop);
      }
    });

    // 吧台前下缘亮金铜脚踏杆 + 固定支架
    m.fillAABB(-14.0, 14.0, 7.2, 8.6, 1, 2, (x, y, z, X, Y) => {
      if (z === 1 && Y >= 7.6 && Y <= 8.3) {
        m.setRaw(x, y, z, mat('brass'), partId.brass);
      } else if (z === 1 && Y >= 6.4 && (Math.abs(X) < 0.8 || Math.abs(Math.abs(X) - 10.5) < 0.8)) {
        m.setRaw(x, y, z, keyToId.brassDark, partId.brass);
      }
    });

    // 吧台左翼搭一条绛红擦杯布（增加色彩层次）
    m.fillAABB(-16.8, -14.8, -6.0, -2.5, 7, 13, (x, y, z, X) => {
      if (X <= -15.8 || z === 13) m.setRaw(x, y, z, mat('cloth'), partId.cloth);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 17, headZ: 13, centerZ: 6 });
  }

  // 2. 吧台后排酒桶木托架（30×10×8）
  function buildBarrelRack(makeCanvas) {
    const m = new VoxelModel(30, 10, 8, SPEC);
    const { mat, partId } = SPEC;
    // 左右与中间 4 道托架立脚 + 两条横梁
    for (const rx of [-11.5, -3.8, 3.8, 11.5]) {
      m.fillAABB(rx - 1.1, rx + 1.1, -3.8, 3.8, 0, 5, (x, y, z, X, Y) => {
        const cradle = z >= 4 && Math.abs(Y) < 2.0;
        if (!cradle) m.setRaw(x, y, z, mat('wood'), partId.barWood);
      });
    }
    for (const ry of [-3.0, 3.0]) {
      m.fillAABB(-13.2, 13.2, ry - 0.8, ry + 0.8, 1, 3, (x, y, z) => {
        m.setRaw(x, y, z, mat('wood'), partId.panel);
      });
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 13, headZ: 6, centerZ: 3 });
  }

  // 3. 铜箍大橡木酒桶（12×12×14，四重对称 symDeg: 90，3 只共用 1 套资产！）
  function buildOakBarrel(makeCanvas) {
    const m = new VoxelModel(12, 12, 14, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-5.5, 5.5, -5.5, 5.5, 0, 13, (x, y, z, X, Y) => {
      const u = (z - 6.5) / 6.5;
      const rMax = 4.9 - u * u * 0.95; // 鼓腹酒桶曲线
      const r = Math.hypot(X, Y);
      if (r > rMax) return;
      // 顶部凹陷桶盖
      if (z === 13 && r < rMax - 0.95) return;
      // 上下两道亮金铜箍（突出 0.25 格）
      const isHoop = (z === 3 || z === 4 || z === 9 || z === 10) && r >= rMax - 1.05;
      if (isHoop) {
        m.setRaw(x, y, z, (z === 4 || z === 10) ? keyToId.brassHi : mat('brass'), partId.brass);
        return;
      }
      // 桶板竖缝
      const ang = Math.atan2(Y, X);
      const isStave = r >= rMax - 0.9 && Math.abs(Math.sin(ang * 6)) < 0.14;
      m.setRaw(x, y, z, isStave ? keyToId.barrelDark : mat('barrel'), partId.barrel);
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.0, headZ: 13, centerZ: 6 });
  }

  // 4. 台面亮金铜盘与酒壶（10×10×5，symDeg: 90）
  function buildBrassTray(makeCanvas) {
    const m = new VoxelModel(10, 10, 5, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-4.5, 4.5, -4.5, 4.5, 0, 4, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      if (z === 0 && r <= 4.1) m.setRaw(x, y, z, mat('brass'), partId.brass);
      else if (z === 1 && r <= 4.3 && r >= 3.2) m.setRaw(x, y, z, keyToId.brassHi, partId.brass);
      // 铜盘中央小酒壶
      if (z >= 1 && z <= 3 && r <= 1.7) m.setRaw(x, y, z, mat('iron'), partId.iron);
      if (z === 4 && r <= 0.9) m.setRaw(x, y, z, keyToId.brassHi, partId.brass);
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 4, centerZ: 2 });
  }

  // 5. 冒白沫的麦酒杯（8×8×8，2 只共用 1 套资产）
  function buildAleMug(makeCanvas) {
    const m = new VoxelModel(8, 8, 8, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 木杯身 + 上下铜箍
    m.fillAABB(-3.2, 3.2, -3.2, 3.2, 0, 5, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      if (r <= 2.35) {
        if (z === 1 || z === 4) m.setRaw(x, y, z, mat('brass'), partId.brass);
        else if (z === 5 && r <= 1.65) m.setRaw(x, y, z, mat('ale'), partId.ale);
        else m.setRaw(x, y, z, mat('mug'), partId.mug);
      }
    });
    // 右侧杯把 (+X)
    m.fillAABB(2.0, 3.6, -0.8, 0.8, 1, 4, (x, y, z, X) => {
      if (z === 1 || z === 4 || X >= 2.8) m.setRaw(x, y, z, mat('brass'), partId.brass);
    });
    // 顶部溢出厚白沫（纯亮白/奶白，绝不进 glowKeys）
    m.paintEllipsoid(0, 0, 6.0, 2.3, 2.3, 1.35, mat('foam'), partId.foam, true);
    m.paintEllipsoid(-1.3, 1.3, 5.4, 0.9, 0.9, 1.1, keyToId.foamHi, partId.foam, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.8, headZ: 7, centerZ: 3 });
  }

  const Def = {
    id: 'scene_tavern_bar',
    code: 'T00-A',
    name: '酒馆长木吧台与酒桶架',
    tag: '酒馆室内 · 吧台家具',
    summary: '厚实 L 型弧边橡木吧台（浅暖打磨木台面 + 亮金铜脚踏杆）+ 后排 3 只复用铜箍大橡木酒桶 + 铜盘与可推杯上酒的泡沫麦酒杯',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 18,
    ecoWeight: 1.0,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',  name: '常态营业', loop: true,  status: 'done' },
      { id: 'serve', name: '推杯上酒', loop: false, duration: 2.4, status: 'done' }
    ],
    blocks: ['L型弧边木吧台', '铜箍酒桶3只复用', '泡沫麦酒杯推杯', '台面铜盘酒壶'],
    soulHabit: '酒馆核心长木吧台，麦酒杯泛着细腻白沫，推杯动作沿打磨木面滑向桌沿并带出泡沫微粒',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        barCounter: buildBarCounter(makeCanvas),
        barrelRack: buildBarrelRack(makeCanvas),
        oakBarrel:  buildOakBarrel(makeCanvas),
        brassTray:  buildBrassTray(makeCanvas),
        aleMug:     buildAleMug(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        mugSlideY: 0.2,
        mugSlideX: 5.5,
        mugBob: 0,
        mistTimer: 0,
        foamBurstTimer: 0
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
          state.mugSlideX = 5.5; state.mugSlideY = 0.2;
          state.mugBob = 0; state.mistTimer = 0; state.foamBurstTimer = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const isServe = !!(eco && eco.action === 'serve');
          const aTime = (eco && eco.actionTime) || 0;

          if (isServe) {
            // 0~0.9s 平滑推杯到吧台前沿 -> 0.9~1.9s 停稳微颤冒泡沫 -> 1.9~2.4s 收回
            let u = 0;
            if (aTime < 0.95) {
              u = smoothstep(0, 0.95, aTime);
            } else if (aTime < 1.95) {
              u = 1.0;
            } else {
              u = 1.0 - smoothstep(1.95, 2.4, aTime);
            }
            state.mugSlideX = lerp(4.2, 6.2, u);
            state.mugSlideY = lerp(0.0, 5.2, u);
            const settle = (aTime >= 0.85 && aTime < 1.35) ? Math.sin((aTime - 0.85) * 24) * 0.22 * (1 - (aTime - 0.85) * 2) : 0;
            state.mugBob = Math.max(0, settle);

            // 滑动中与停稳瞬间冒出细腻白沫粒
            if (vfx && aTime > 0.12 && aTime < 1.55) {
              state.foamBurstTimer += dt;
              if (state.foamBurstTimer >= 0.08) {
                state.foamBurstTimer -= 0.08;
                const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, state.mugSlideX * sMul, state.mugSlideY * sMul);
                const fx = curSkin.fx || SKINS[0].fx;
                vfx.spawnParticle(
                  mx + (Math.random() - 0.5) * 2.4 * sMul,
                  my + (Math.random() - 0.5) * 2.4 * sMul,
                  (state.z + 19.6) * sMul,
                  (Math.random() - 0.5) * 5.0 * sMul,
                  (Math.random() - 0.5) * 5.0 * sMul,
                  (4.5 + Math.random() * 4.5) * sMul,
                  0.45 + Math.random() * 0.28,
                  1.15 + Math.random() * 0.55,
                  Math.random() > 0.3 ? fx.foam : fx.mist, false, 9.0
                );
              }
            }
          } else {
            state.mugSlideX = lerp(state.mugSlideX, 5.5, expSmooth(dt, 7.0));
            state.mugSlideY = lerp(state.mugSlideY, 2.2, expSmooth(dt, 7.0));
            state.mugBob = Math.sin(time * 2.6 * freq) * 0.14;
            state.foamBurstTimer = 0;

            // 常态偶有细腻泡沫水汽小粒
            if (vfx) {
              state.mistTimer += dt;
              if (state.mistTimer >= 0.95 / freq) {
                state.mistTimer -= 0.95 / freq;
                const mugChoice = Math.random() > 0.5 ? [state.mugSlideX, state.mugSlideY] : [-4.8, 2.6];
                const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, mugChoice[0] * sMul, mugChoice[1] * sMul);
                const fx = curSkin.fx || SKINS[0].fx;
                vfx.spawnParticle(
                  mx + (Math.random() - 0.5) * 1.8 * sMul,
                  my + (Math.random() - 0.5) * 1.8 * sMul,
                  (state.z + 19.5) * sMul,
                  (Math.random() - 0.5) * 1.4 * sMul,
                  (Math.random() - 0.5) * 1.4 * sMul,
                  (3.2 + Math.random() * 2.2) * sMul,
                  0.65 + Math.random() * 0.35,
                  0.95,
                  fx.mist, false, -0.4
                );
              }
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const x = state.x, y = state.y, z = state.z, yaw = state.yaw;
          const list = [];

          // 1. 后排酒桶木架
          const [rkx, rky] = localToWorldXY(x, y, yaw, 2.0 * sMul, -11.5 * sMul);
          list.push({
            partKey: 'barrelRack', asset: parts.barrelRack,
            x: rkx, y: rky, lift: z, ro: yaw, symDeg: 360, bias: -0.35
          });

          // 2. 后排 3 只铜箍大橡木酒桶（共用同一 oakBarrel 资产，symDeg: 90）
          const barrelSlots = [
            { lx: -6.2, ly: -11.5, lz: 2.5 },
            { lx:  3.0, ly: -11.5, lz: 2.5 },
            { lx: 11.8, ly: -11.5, lz: 2.5 }
          ];
          for (let i = 0; i < barrelSlots.length; i++) {
            const bs = barrelSlots[i];
            const [bx, by] = localToWorldXY(x, y, yaw, bs.lx * sMul, bs.ly * sMul);
            list.push({
              partKey: `barrel_${i}`, asset: parts.oakBarrel,
              x: bx, y: by, lift: z + bs.lz * sMul, ro: yaw, symDeg: 90, bias: -0.2
            });
          }

          // 3. 厚实 L 型弧边橡木吧台
          list.push({
            partKey: 'barCounter', asset: parts.barCounter,
            x, y, lift: z, ro: yaw, symDeg: 360, bias: 0
          });

          // 4. 台面亮金铜盘（偏左侧）
          const [tx, ty] = localToWorldXY(x, y, yaw, -11.2 * sMul, 2.2 * sMul);
          list.push({
            partKey: 'brassTray', asset: parts.brassTray,
            x: tx, y: ty, lift: z + 13.0 * sMul, ro: yaw, symDeg: 90, bias: 0.35
          });

          // 5. 台面两只冒白沫的麦酒杯（共用同一 aleMug 资产；右侧一只执行推杯上酒动作）
          const [m1x, m1y] = localToWorldXY(x, y, yaw, -4.8 * sMul, 2.6 * sMul);
          list.push({
            partKey: 'aleMug_left', asset: parts.aleMug,
            x: m1x, y: m1y, lift: z + (13.0 + state.mugBob * 0.5) * sMul,
            ro: wrapAngle(yaw - 0.35), symDeg: 360, bias: 0.45
          });

          const [m2x, m2y] = localToWorldXY(x, y, yaw, state.mugSlideX * sMul, state.mugSlideY * sMul);
          list.push({
            partKey: 'aleMug_serve', asset: parts.aleMug,
            x: m2x, y: m2y, lift: z + (13.0 + state.mugBob) * sMul,
            ro: wrapAngle(yaw + 0.25), symDeg: 360, bias: 0.55
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
