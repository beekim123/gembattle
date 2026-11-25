'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T18 熔岩火山口 · 黑曜熔岩喷孔与冷石墩（scenes/scene_t18_magma_vent.js）
  //
  // 拆件与图集预算（单盒严格 <= 28 格，严禁常态 scaleX/scaleY 拉伸）：
  //   - obsidianCone (28×28×22)                  ：锯齿棱角黑曜玄武岩小火山锥（侧裂隙透炽热熔岩）
  //   - magmaCore    (12×12×9,  sym90, noOutline)：喷口内壁翻涌熔岩核（脉动升降，进 glowKeys）
  //   - lavaSpurt    (10×10×14, sym90, noOutline)：magma_puff 喷涌瞬间的炽热熔滴柱（进 glowKeys）
  //   - coolSlabLow  (18×16×6)                   ：下层冷却暗青灰平顶石板墩（呼应 火1 遗留石板）
  //   - coolSlabTop  (14×12×6)                   ：上层冷却石板墩 + 顶面醒目金橙耐热苔（呼应 火2 舔苔）
  //
  // 19 色 0 重色 0 禁用字，仅熔岩 4 色进 glowKeys
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 冷硬黑曜玄武岩棱脊（3 档，偏冷紫灰黑拉开熔岩反差）
      basaltDark: '#16141a',
      basaltMid:  '#2c2833',
      basaltHi:   '#4c4759',
      // 火山锥外缘暗焦岩屑（3 档）
      scoriaDark: '#261a18',
      scoriaMid:  '#422d29',
      scoriaHi:   '#63443d',
      // 冷却青灰平顶石板墩（3 档，清晰冷灰蓝）
      slabDark:   '#3b4752',
      slabMid:    '#5d6e7d',
      slabHi:     '#8ca0b0',
      // 石板顶面醒目金橙耐热苔（3 档，绝不进 glowKeys）
      mossDark:   '#b04e10',
      mossMid:    '#e87c1e',
      mossHi:     '#ffc238',
      // 耐热苔边缘干脆暗红芽（3 档）
      budDark:    '#7d2415',
      budMid:     '#ba3b20',
      budHi:      '#eb6538',
      // 炽热熔岩裂纹与翻涌熔核（仅此 4 键进 glowKeys）
      lavaRed:    '#d92616',
      lavaOrange: '#ff6a14',
      lavaYellow: '#ffc424',
      lavaHot:    '#fff4a8'
    },
    glowKeys: ['lavaRed', 'lavaOrange', 'lavaYellow', 'lavaHot'],
    parts: ['basalt', 'scoria', 'slab', 'moss', 'bud', 'lava'],
    noCrease: [
      ['basalt', 'scoria'],
      ['basalt', 'lava'],
      ['slab', 'moss'],
      ['moss', 'bud']
    ],
    materials: {
      basalt: ['basaltDark', 'basaltMid', 'basaltHi'],
      scoria: ['scoriaDark', 'scoriaMid', 'scoriaHi'],
      slab:   ['slabDark',   'slabMid',   'slabHi'],
      moss:   ['mossDark',   'mossMid',   'mossHi'],
      bud:    ['budDark',    'budMid',    'budHi']
    },
    protectedParts: ['lava', 'moss']
  });

  // 3 套零重建模换色皮肤（每套 0 重色 0 禁用字）
  const SKINS = [
    {
      id: 'obsidian_crimson',
      name: '黑曜赤熔',
      dot: '#ff6a14',
      outline: '#120a0d',
      pal: {},
      fx: {
        dropA:  '#ff6a14',
        dropB:  '#ffc424',
        dropC:  '#fff4a8',
        ember:  '#d92616',
        smoke:  '#575059'
      }
    },
    {
      id: 'char_gold_sulfur',
      name: '焦褐金硫',
      dot: '#f5b82e',
      outline: '#17100a',
      pal: {
        basaltDark: '#211814', basaltMid: '#3b2b23', basaltHi: '#5e4639',
        scoriaDark: '#302218', scoriaMid: '#523a27', scoriaHi: '#78573b',
        slabDark:   '#4a473e', slabMid:   '#706b5d', slabHi:   '#9e9884',
        mossDark:   '#9e3416', mossMid:   '#d95826', mossHi:   '#ff9147',
        budDark:    '#6b2114', budMid:    '#a63821', budHi:    '#db5d3b',
        lavaRed:    '#c95e12', lavaOrange:'#f59e1b', lavaYellow:'#ffe047', lavaHot: '#ffffbd'
      },
      fx: {
        dropA:  '#f59e1b',
        dropB:  '#ffe047',
        dropC:  '#ffffbd',
        ember:  '#c95e12',
        smoke:  '#6b6254'
      }
    },
    {
      id: 'violet_blue_flame',
      name: '紫灰蓝焰',
      dot: '#38c7ff',
      outline: '#0d0c1a',
      pal: {
        basaltDark: '#1b1726', basaltMid: '#322b45', basaltHi: '#52486e',
        scoriaDark: '#262133', scoriaMid: '#413954', scoriaHi: '#62577d',
        slabDark:   '#3b4657', slabMid:   '#5c6c85', slabHi:   '#8ba0bd',
        mossDark:   '#a67414', mossMid:   '#e0a624', mossHi:   '#ffe259',
        budDark:    '#7a4b12', budMid:    '#b8741f', budHi:    '#eb9f38',
        lavaRed:    '#1456c9', lavaOrange:'#26a6ff', lavaYellow:'#78ebff', lavaHot: '#e3ffff'
      },
      fx: {
        dropA:  '#26a6ff',
        dropB:  '#78ebff',
        dropC:  '#e3ffff',
        ember:  '#1456c9',
        smoke:  '#58556e'
      }
    }
  ];

  // 1. 锯齿棱角黑曜石小火山锥喷口（28×28×22）
  function buildObsidianCone(makeCanvas) {
    const m = new VoxelModel(28, 28, 22, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-13, 13, -13, 13, 0, 21, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X, Y);
      const u = z / 21;

      // 6 条冷硬锯齿状玄武岩棱脊（角度分明）
      const ridge = Math.abs(Math.sin(ang * 3 + 0.35)) * 2.15 + Math.cos(ang * 5 - 0.5) * 0.75;
      const rOuter = lerp(11.6, 5.2, Math.pow(u, 0.85)) + ridge * (1 - u * 0.38);

      // 顶部锯齿状参差火山口沿
      const rimZ = 17.5 + Math.sin(ang * 4 + 0.4) * 2.2 + Math.cos(ang * 3 - 0.7) * 1.4;
      if (z > rimZ || r > rOuter) return;

      // 火山口深邃内腔（顶部开口 r <= 4.0，向下收束）
      const rCrater = lerp(1.6, 4.1, smoothstep(0.28, 0.92, u));
      if (z >= 7 && r < rCrater) return;

      // 3 条贯穿锥壁的深熔岩裂隙（透出炽热红/橘/亮黄自亮岩浆流）
      const crack1 = Math.abs(Math.sin(ang - 0.55 + u * 0.42));
      const crack2 = Math.abs(Math.sin(ang - 2.65 - u * 0.35));
      const crack3 = Math.abs(Math.sin(ang + 1.55 + u * 0.25));
      const nearCrack = Math.min(crack1, crack2, crack3);

      // 内壁熔岩反衬
      const isInnerWall = z >= 8 && r <= rCrater + 1.15;
      if (isInnerWall) {
        if (z < 12) m.setRaw(x, y, z, keyToId.lavaYellow, partId.lava);
        else if (z < 15.5) m.setRaw(x, y, z, keyToId.lavaOrange, partId.lava);
        else m.setRaw(x, y, z, keyToId.lavaRed, partId.lava);
        return;
      }

      // 外壁深裂隙熔岩脉
      if (nearCrack < 0.085 && z >= 2 && z <= rimZ - 1.0 && r >= rOuter - 1.6) {
        if (nearCrack < 0.032) m.setRaw(x, y, z, keyToId.lavaYellow, partId.lava);
        else if (nearCrack < 0.058) m.setRaw(x, y, z, keyToId.lavaOrange, partId.lava);
        else m.setRaw(x, y, z, keyToId.lavaRed, partId.lava);
        return;
      }

      // 底部外缘掺少量暗焦岩屑
      if (z <= 3 && r > rOuter - 2.2) {
        m.setRaw(x, y, z, mat('scoria'), partId.scoria);
      } else {
        m.setRaw(x, y, z, mat('basalt'), partId.basalt);
      }
    });

    // 底部再添几块棱角黑曜碎岩稳固锥脚
    m.paintEllipsoid(-9.2, -5.8, 2.4, 3.2, 2.5, 2.4, mat('basalt'), partId.basalt, true);
    m.paintEllipsoid(-7.4,  8.6, 2.0, 2.8, 2.4, 2.0, mat('scoria'), partId.scoria, true);
    m.paintEllipsoid( 2.4, -10.2, 2.2, 3.0, 2.3, 2.2, mat('basalt'), partId.basalt, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 13.0, headZ: 21, centerZ: 10 });
  }

  // 2. 喷口翻涌熔岩核（12×12×9，symDeg: 90，进 glowKeys）
  function buildMagmaCore(makeCanvas) {
    const m = new VoxelModel(12, 12, 9, SPEC);
    const { keyToId, partId } = SPEC;

    m.fillAABB(-5, 5, -5, 5, 0, 8, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const maxR = 4.2 - Math.abs(z - 3.5) * 0.52;
      if (r > maxR) return;
      if (r <= 1.6 && z >= 4 && z <= 7) {
        m.setRaw(x, y, z, keyToId.lavaHot, partId.lava);
      } else if (r <= 2.8 && z >= 3) {
        m.setRaw(x, y, z, keyToId.lavaYellow, partId.lava);
      } else if (z >= 1) {
        m.setRaw(x, y, z, keyToId.lavaOrange, partId.lava);
      } else {
        m.setRaw(x, y, z, keyToId.lavaRed, partId.lava);
      }
    });

    m.despeckle();
    return m.toStripAsset(makeCanvas, { footRadius: 4.2, headZ: 8, centerZ: 4 });
  }

  // 3. 喷发炽热熔滴柱（10×10×14，symDeg: 90，magma_puff 峰值显示）
  function buildLavaSpurt(makeCanvas) {
    const m = new VoxelModel(10, 10, 14, SPEC);
    const { keyToId, partId } = SPEC;

    m.fillAABB(-4, 4, -4, 4, 0, 13, (x, y, z, X, Y) => {
      const u = z / 13;
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      // 向上发散再收尖的熔岩喷簇
      const spread = 2.6 * (1 - u * 0.65) + Math.sin(u * Math.PI) * 1.4;
      const lobe = 0.78 + 0.32 * Math.cos(ang * 4 + u * 1.6);
      if (r > spread * lobe) return;
      if (r < 1.2 && u < 0.72) {
        m.setRaw(x, y, z, keyToId.lavaHot, partId.lava);
      } else if (u < 0.8) {
        m.setRaw(x, y, z, keyToId.lavaYellow, partId.lava);
      } else {
        m.setRaw(x, y, z, keyToId.lavaOrange, partId.lava);
      }
    });

    m.despeckle();
    return m.toStripAsset(makeCanvas, { footRadius: 3.5, headZ: 14, centerZ: 6 });
  }

  // 4. 下层冷却暗青灰平顶石板墩（18×16×6，呼应 火1 遗留石板）
  function buildCoolSlabLow(makeCanvas) {
    const m = new VoxelModel(18, 16, 6, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-8, 8, -7, 7, 0, 5, (x, y, z, X, Y) => {
      // 略带多边形切角的厚实冷石板
      const bevel = Math.abs(X) * 0.92 + Math.abs(Y) * 1.02;
      if (Math.abs(X) > 7.6 || Math.abs(Y) > 6.4 || bevel > 11.4) return;
      // 顶层内缩 0.6 格形成硬朗石板倒角
      if (z === 5 && (Math.abs(X) > 7.0 || Math.abs(Y) > 5.8 || bevel > 10.6)) return;
      // 石板顶面刻两条细冷缩裂纹
      if (z === 5 && Math.abs(X - Y * 0.6 - 2.2) < 0.45) return;
      m.setRaw(x, y, z, mat('slab'), partId.slab);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.5, headZ: 6, centerZ: 3 });
  }

  // 5. 上层冷却石板墩 + 顶面醒目金橙耐热苔（14×12×6，呼应 火2 滚球舔苔）
  function buildCoolSlabTop(makeCanvas) {
    const m = new VoxelModel(14, 12, 6, SPEC);
    const { mat, partId } = SPEC;

    // 冷却青灰平顶石板（z = 0..3）
    m.fillAABB(-6, 6, -5, 5, 0, 3, (x, y, z, X, Y) => {
      const bevel = Math.abs(X) * 0.95 + Math.abs(Y) * 1.05;
      if (Math.abs(X) > 5.8 || Math.abs(Y) > 4.8 || bevel > 8.6) return;
      if (z === 3 && bevel > 8.1) return;
      m.setRaw(x, y, z, mat('slab'), partId.slab);
    });

    // 石板顶面贴生一圈饱满金橙色耐热苔（z = 4..5）
    m.fillAABB(-5, 5, -4, 4, 4, 5, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X * 0.88, Y * 1.05);
      const wave = Math.sin(ang * 5 + 0.5) * 0.55;
      // 环状带缺口的厚金橙苔垫
      if (z === 4 && r >= 1.15 && r <= 3.9 + wave) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (z === 5 && r >= 1.65 && r <= 3.1 + wave * 0.6) {
        const isBud = (Math.abs(Math.round(X)) === 2 && Math.abs(Math.round(Y)) === 1);
        m.setRaw(x, y, z, isBud ? mat('bud') : mat('moss'), isBud ? partId.bud : partId.moss);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.5, headZ: 6, centerZ: 3 });
  }

  const SLAB_LOCAL = { x: 14.5, y: 4.5 };

  const Def = {
    id: 'scene_t18_magma_vent',
    code: 'T18',
    name: '黑曜熔岩喷孔与冷石墩',
    status: 'done',
    defaultHabitat: 'volcano',
    tag: 'T18 熔岩火山口地标 · 喷孔与耐热苔冷石板',
    summary: '锯齿棱角深黑曜玄武岩小火山锥（内壁与裂隙透出炽热自亮熔岩流），紧邻两块层叠冷却青灰平顶石板墩并顶着一圈醒目金橙耐热苔，呼应火山口冷石板与滚球兽舔苔生态',
    footRadius: 19.0,
    ecoWeight: 3.6,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '锯齿黑曜玄武岩小火山锥与炽热熔岩裂隙',
      '喷口脉动翻涌自亮熔岩核与喷涌熔滴柱',
      '两块层叠冷却青灰平顶石板墩',
      '石板顶面醒目金橙色耐热苔环'
    ],
    actions: [
      { id: 'idle',       name: '熔岩脉动（火屑+硫烟）',     loop: true,  status: 'done' },
      { id: 'magma_puff', name: '轰鸣喷涌（密集熔滴火屑）', loop: false, duration: 2.2, status: 'done' }
    ],
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        obsidianCone: buildObsidianCone(makeCanvas),
        magmaCore:    buildMagmaCore(makeCanvas),
        lavaSpurt:    buildLavaSpurt(makeCanvas),
        coolSlabLow:  buildCoolSlabLow(makeCanvas),
        coolSlabTop:  buildCoolSlabTop(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.3;
      let curSkin = SKINS[0];

      const state = {
        x: hx0,
        y: hy0,
        z: 0,
        yaw: hyaw0,
        action: 'idle',
        lastAction: 'idle',
        shakeX: 0,
        shakeY: 0,
        coreLift: 11.5,
        coreYaw: hyaw0,
        showSpurt: false,
        spurtLift: 15.0,
        spurtYaw: hyaw0,
        sparkCd: 0,
        smokeCd: 0,
        puffStage: 0
      };

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
          state.action = 'idle';
          state.lastAction = 'idle';
          state.shakeX = 0;
          state.shakeY = 0;
          state.coreLift = 11.5;
          state.coreYaw = yaw;
          state.showSpurt = false;
          state.sparkCd = 0;
          state.smokeCd = 0;
          state.puffStage = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.puffStage = 0;
          }
          state.action = action;

          const t = time * freq;
          state.shakeX = 0;
          state.shakeY = 0;
          state.showSpurt = false;

          let surge = 0;
          if (action === 'magma_puff') {
            const u = clamp(actionTime / 2.2, 0, 1);
            // 0..0.22 蓄压微颤；0.22..0.62 喷涌炽热熔滴；0.62..1.0 回落余烟袅袅
            if (u < 0.22) {
              const r = u / 0.22;
              state.shakeX = Math.sin(actionTime * 42) * r * 0.42 * sMul;
              state.shakeY = Math.cos(actionTime * 37) * r * 0.34 * sMul;
              surge = r * 0.4;
            } else if (u < 0.62) {
              const k = (u - 0.22) / 0.40;
              surge = Math.sin(k * Math.PI);
              state.shakeX = Math.sin(actionTime * 48) * surge * 0.55 * sMul;
              state.shakeY = Math.cos(actionTime * 44) * surge * 0.42 * sMul;
              state.showSpurt = true;
              state.spurtLift = lerp(13.5, 20.5, surge) * sMul;
              state.spurtYaw = state.yaw + actionTime * 3.8;
            } else {
              surge = 0;
            }

            // 分两拍集中喷涌炽热熔滴与火屑粒
            const beats = [0.24, 0.44];
            while (state.puffStage < beats.length && u >= beats[state.puffStage]) {
              if (vfx) {
                const count = state.puffStage === 0 ? 14 : 10;
                for (let i = 0; i < count; i++) {
                  const a = Math.random() * TAU;
                  const sp = (4.0 + Math.random() * 10.5) * sMul;
                  const vz = (18.0 + Math.random() * 14.0) * sMul;
                  const col = i % 3 === 0 ? fx.dropC : (i % 2 === 0 ? fx.dropA : fx.dropB);
                  vfx.spawnParticle(
                    state.x + (Math.random() - 0.5) * 3.5 * sMul,
                    state.y + (Math.random() - 0.5) * 3.5 * sMul,
                    18.5 * sMul,
                    Math.cos(a) * sp,
                    Math.sin(a) * sp,
                    vz,
                    0.85 + Math.random() * 0.42,
                    1.35 + Math.random() * 0.55,
                    col,
                    true,
                    44
                  );
                }
                vfx.addRipple(state.x, state.y, 4.0 * sMul, 16.0 * sMul, 0.9, 1.8);
              }
              state.puffStage++;
            }
          }

          // 喷口熔岩核缓缓明暗脉动（通过高低微移 + 旋转呈现翻涌）
          state.coreLift = (11.8 + Math.sin(t * 2.6) * 0.9 + surge * 3.2) * sMul;
          state.coreYaw  = state.yaw + t * (0.45 + surge * 1.6);

          if (!vfx) return;

          // 常驻橘红火屑缓缓飘升
          state.sparkCd -= dt;
          const sparkInt = action === 'magma_puff' ? 0.08 : 0.28;
          if (state.sparkCd <= 0) {
            state.sparkCd = sparkInt;
            const a = Math.random() * TAU;
            const rr = Math.random() * 3.0 * sMul;
            vfx.spawnParticle(
              state.x + Math.cos(a) * rr,
              state.y + Math.sin(a) * rr,
              17.5 * sMul,
              Math.cos(a) * (1.8 + surge * 4.0) * sMul,
              Math.sin(a) * (1.8 + surge * 4.0) * sMul,
              (8.5 + Math.random() * 5.0 + surge * 7.0) * sMul,
              0.95 + Math.random() * 0.45,
              1.1 + Math.random() * 0.4,
              Math.random() > 0.45 ? fx.dropA : fx.dropB,
              true,
              3.5
            );
          }

          // 暗灰硫烟袅袅上升（喷发后段余烟更密）
          state.smokeCd -= dt;
          const smokeInt = (action === 'magma_puff' && actionTime > 1.1) ? 0.14 : 0.34;
          if (state.smokeCd <= 0) {
            state.smokeCd = smokeInt;
            const a = Math.random() * TAU;
            vfx.spawnParticle(
              state.x + Math.cos(a) * 2.4 * sMul,
              state.y + Math.sin(a) * 2.4 * sMul,
              19.0 * sMul,
              (Math.cos(time * 0.7) * 2.2 + (Math.random() - 0.5) * 1.6) * sMul,
              (Math.sin(time * 0.6) * 1.8 + (Math.random() - 0.5) * 1.6) * sMul,
              (6.2 + Math.random() * 2.5) * sMul,
              1.25 + Math.random() * 0.55,
              2.1 + Math.random() * 0.8,
              fx.smoke,
              false,
              -0.7
            );
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const cx = state.x + state.shakeX;
          const cy = state.y + state.shakeY;

          const list = [
            {
              partKey: 'obsidianCone',
              asset: parts.obsidianCone,
              x: cx,
              y: cy,
              lift: 0,
              ro: yw,
              bias: -0.15
            },
            {
              partKey: 'magmaCore',
              asset: parts.magmaCore,
              x: cx,
              y: cy,
              lift: state.coreLift,
              ro: state.coreYaw,
              symDeg: 90,
              noOutline: true,
              bias: 0.20
            }
          ];

          if (state.showSpurt) {
            list.push({
              partKey: 'lavaSpurt',
              asset: parts.lavaSpurt,
              x: cx,
              y: cy,
              lift: state.spurtLift,
              ro: state.spurtYaw,
              symDeg: 90,
              noOutline: true,
              bias: 0.38
            });
          }

          // 两块层叠冷却暗青灰平顶石板墩（紧挨火山锥右前侧）
          const [sx, sy] = localToWorldXY(state.x, state.y, yw, SLAB_LOCAL.x * sMul, SLAB_LOCAL.y * sMul);
          const [tx, ty] = localToWorldXY(state.x, state.y, yw, (SLAB_LOCAL.x + 1.4) * sMul, (SLAB_LOCAL.y - 1.2) * sMul);
          list.push(
            {
              partKey: 'coolSlabLow',
              asset: parts.coolSlabLow,
              x: sx,
              y: sy,
              lift: 0,
              ro: wrapAngle(yw + 0.22),
              bias: 0.12
            },
            {
              partKey: 'coolSlabTop',
              asset: parts.coolSlabTop,
              x: tx,
              y: ty,
              lift: 4.8 * sMul,
              ro: wrapAngle(yw - 0.14),
              bias: 0.28
            }
          );

          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id,
            code: Def.code,
            name: Def.name,
            status: Def.status,
            skin: curSkin.id,
            action: state.action,
            footRadius: Def.footRadius,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Assets.register(Def, 'scene');
})(window.PixelWorkshop);
