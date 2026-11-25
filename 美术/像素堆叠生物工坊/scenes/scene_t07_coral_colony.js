'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T07 浅海环礁 · 活体层叠珊瑚簇
  //
  // 生态规矩落实：环礁本身是活体群体一层层堆出的钙质硬壳，涨潮伸出彩色短触须滤食，
  // 退潮或受惊时整簇触须迅速缩回硬礁壳内，只剩灰白/淡粉多孔礁盘。
  //
  // 拆件与图集预算（单盒严格 <= 40 格，对称件标 symDeg 省贴图）：
  //   - reefBase    (34×34×10, lift=0,  submerge=0.45, symDeg=90)：底层宽大钙质多孔硬礁盘
  //   - reefMid     (26×26×9,  lift=7,  submerge=0.22, symDeg=90)：中层阶梯多孔礁盘
  //   - reefTop     (18×18×8,  lift=14, submerge=0.0,  symDeg=90)：顶层多孔礁盘
  //   - polypLarge  (12×12×12, symDeg=90)：主孔鲜艳亮珊瑚橙/明黄短触须簇（复用 5 处）
  //   - polypSmall  (9×9×10,   symDeg=90)：侧孔玫粉/紫罗兰短触须簇（复用 4 处）
  //   - coralBranch (10×10×12, symDeg=180)：礁盘外沿点缀艳丽分枝小珊瑚（复用 4 处）
  // =========================================================================

  // 27 色独立色表（<= 48 色、0 重色、仅活体触须尖端微亮 tipHi 进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 灰白/淡粉钙质硬礁盘
      shellDark:  '#8a7d84',
      shellMid:   '#cfc4c8',
      shellHi:    '#f5eef0',
      // 淡粉钙质缘边
      pinkDark:   '#b56a7c',
      pinkMid:    '#e69ab0',
      pinkHi:     '#ffd1df',
      // 礁孔深腔（缩壳后清晰可见多孔结构）
      poreDark:   '#2c3442',
      poreMid:    '#475569',
      poreHi:     '#687c94',
      // 亮珊瑚橙短触须主干
      coralDark:  '#c43b1d',
      coralMid:   '#ff6836',
      coralHi:    '#ffa463',
      // 明黄短触须副瓣
      goldDark:   '#c98612',
      goldMid:    '#ffc424',
      goldHi:     '#fff078',
      // 玫粉侧孔短触须
      roseDark:   '#b32058',
      roseMid:    '#f54988',
      roseHi:     '#ff9ec2',
      // 紫罗兰侧枝与礁边撞色
      violetDark: '#5b2ba6',
      violetMid:  '#9254e8',
      violetHi:   '#cca3ff',
      // 触须尖端微亮核（仅 tipHi 进 glowKeys）
      tipDark:    '#e09038',
      tipMid:     '#ffd166',
      tipHi:      '#fff8c4',
      // 礁盘水下青藻边点缀
      kelpDark:   '#146b68',
      kelpMid:    '#25a89c',
      kelpHi:     '#6ce0d2'
    },
    glowKeys: ['tipHi'],
    parts: ['shell', 'pink', 'pore', 'coral', 'gold', 'rose', 'violet', 'tip', 'kelp'],
    noCrease: [
      ['shell', 'pink'], ['shell', 'kelp'],
      ['coral', 'gold'], ['coral', 'tip'], ['gold', 'tip'],
      ['rose', 'violet'], ['rose', 'tip']
    ],
    materials: {
      shell:  ['shellDark',  'shellMid',  'shellHi'],
      pink:   ['pinkDark',   'pinkMid',   'pinkHi'],
      pore:   ['poreDark',   'poreMid',   'poreHi'],
      coral:  ['coralDark',  'coralMid',  'coralHi'],
      gold:   ['goldDark',   'goldMid',   'goldHi'],
      rose:   ['roseDark',   'roseMid',   'roseHi'],
      violet: ['violetDark', 'violetMid', 'violetHi'],
      tip:    ['tipDark',    'tipMid',    'tipHi'],
      kelp:   ['kelpDark',   'kelpMid',   'kelpHi']
    },
    protectedParts: ['tip', 'coral', 'rose', 'gold']
  });

  // 3 套艳丽撞色皮肤（珊瑚橙粉、明黄紫枝、青碧桃瓣）
  const SKINS = [
    {
      id: 'coral_orange_pink',
      name: '珊瑚橙粉',
      dot: '#ff6836',
      outline: '#122230',
      pal: {},
      fx: {
        bubbleA: '#d8fbff',
        bubbleB: '#7eeef5',
        pollen:  '#ffb270'
      }
    },
    {
      id: 'yellow_violet',
      name: '明黄紫枝',
      dot: '#ffc424',
      outline: '#1a1630',
      pal: {
        shellDark:  '#8f8578', shellMid:  '#d9cfc0', shellHi:  '#f7f2e6',
        pinkDark:   '#8a62a8', pinkMid:   '#bc8ee0', pinkHi:   '#e5c7ff',
        coralDark:  '#c78c10', coralMid:  '#ffcf26', coralHi:  '#fff282',
        goldDark:   '#d45818', goldMid:   '#ff8a33', goldHi:   '#ffc77d',
        roseDark:   '#6224b5', roseMid:   '#9e4ef2', roseHi:   '#d4a6ff',
        violetDark: '#b31f6b', violetMid: '#f24e9e', violetHi: '#ff9ece',
        tipDark:    '#d9b02e', tipMid:    '#ffe46b', tipHi:    '#ffffd1'
      },
      fx: {
        bubbleA: '#e8faff',
        bubbleB: '#c8a6ff',
        pollen:  '#ffe166'
      }
    },
    {
      id: 'teal_peach',
      name: '青碧桃瓣',
      dot: '#28d6c4',
      outline: '#0e2429',
      pal: {
        shellDark:  '#788a91', shellMid:  '#bccfd4', shellHi:  '#ebfafc',
        pinkDark:   '#b86375', pinkMid:   '#f296a8', pinkHi:   '#ffd1dc',
        coralDark:  '#118c84', coralMid:  '#28d6c4', coralHi:  '#85fff0',
        goldDark:   '#cc586e', goldMid:   '#ff8aa0', goldHi:   '#ffc9d4',
        roseDark:   '#cf4827', roseMid:   '#ff7e57', roseHi:   '#ffbfa6',
        violetDark: '#c48f18', violetMid: '#ffc938', violetHi: '#fff08a',
        tipDark:    '#40c9bd', tipMid:    '#96fff3', tipHi:    '#e8fffc'
      },
      fx: {
        bubbleA: '#e0fffb',
        bubbleB: '#ffa6ba',
        pollen:  '#85fff0'
      }
    }
  ];

  // =========================================================================
  // 1. 阶梯钙质多孔硬礁盘构建器（90° 四重旋转对称）
  // =========================================================================
  function buildReefDisk(makeCanvas, cfg) {
    const { size, h, outerR, poreRingR, poreRad, hasCenterPore, rimColor } = cfg;
    const m = new VoxelModel(size, size, h, SPEC);
    const { mat, partId } = SPEC;
    const half = size * 0.5 - 0.5;

    m.fillAABB(-half, half, -half, half, 0, h - 1, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      const ang = Math.atan2(Y, X);
      const t = z / Math.max(1, h - 1);
      // 四重对称阶梯花边轮廓（保证 90° 旋转对称）
      const lobe = Math.cos(ang * 4) * 1.45 + Math.cos(ang * 8) * 0.55;
      const taper = 1.0 - Math.pow(t, 1.35) * 0.14;
      const maxR = (outerR + lobe) * taper;

      if (r <= maxR) {
        // 顶面礁孔凹槽检测
        let inPore = false;
        let onPoreRim = false;
        if (hasCenterPore && z >= h - 4) {
          if (r <= poreRad) inPore = true;
          else if (r <= poreRad + 1.45) onPoreRim = true;
        }
        if (poreRingR > 0 && z >= h - 4) {
          for (let k = 0; k < 4; k++) {
            const pa = k * (Math.PI * 0.5) + Math.PI * 0.25;
            const dP = Math.hypot(X - Math.cos(pa) * poreRingR, Y - Math.sin(pa) * poreRingR);
            if (dP <= poreRad) { inPore = true; break; }
            if (dP <= poreRad + 1.35) onPoreRim = true;
          }
        }

        if (inPore) {
          if (z === h - 4) m.setRaw(x, y, z, mat('pore'), partId.pore);
        } else if (onPoreRim) {
          m.setRaw(x, y, z, mat('pink'), partId.pink);
        } else if (z <= 1 && r > maxR - 2.2) {
          m.setRaw(x, y, z, mat('kelp'), partId.kelp);
        } else if (r > maxR - 1.7 && z >= h - 3) {
          m.setRaw(x, y, z, mat(rimColor), partId[rimColor]);
        } else {
          // 礁壁轻微钙质孔洞纹理
          const pit = Math.cos(ang * 12) * Math.sin(z * 1.15);
          if (r > maxR - 1.1 && pit > 0.72 && z > 1 && z < h - 2) {
            m.setRaw(x, y, z, mat('pore'), partId.pore);
          } else {
            m.setRaw(x, y, z, mat('shell'), partId.shell);
          }
        }
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: outerR, headZ: h - 1, centerZ: Math.round(h * 0.5) });
  }

  // =========================================================================
  // 2. 活体短触须簇构建器（可整簇缩进礁孔，90° 旋转对称）
  // =========================================================================
  function buildPolypCluster(makeCanvas, cfg) {
    const { size, h, primaryMat, secondaryMat, armCount, spreadR, tipH } = cfg;
    const m = new VoxelModel(size, size, h, SPEC);
    const { mat, partId } = SPEC;

    // 底部软体肉座（缩壳时藏入礁孔内）
    m.paintEllipsoid(0, 0, 2.2, spreadR * 0.65, spreadR * 0.65, 2.3, mat(primaryMat), partId[primaryMat], true);

    // 中心短触须
    m.paintCapsule(0, 0, 2.4, 0, 0, tipH, 1.35, 0.95, mat(secondaryMat), partId[secondaryMat], true);
    m.paintEllipsoid(0, 0, tipH + 0.5, 1.05, 1.05, 0.95, mat('tip'), partId.tip, true);

    // 4 重对称外张短触须环
    for (let k = 0; k < armCount; k++) {
      const a = (k / armCount) * TAU;
      const midX = Math.cos(a) * (spreadR * 0.55);
      const midY = Math.sin(a) * (spreadR * 0.55);
      const endX = Math.cos(a) * spreadR;
      const endY = Math.sin(a) * spreadR;
      const mk = (k % 2 === 0) ? primaryMat : secondaryMat;
      const topZ = tipH - (k % 2 === 0 ? 0.8 : 1.7);

      m.paintCapsule(0, 0, 2.2, midX, midY, topZ * 0.58, 1.25, 1.05, mat(mk), partId[mk], true);
      m.paintCapsule(midX, midY, topZ * 0.58, endX, endY, topZ, 1.05, 0.78, mat(mk), partId[mk], true);
      m.paintEllipsoid(endX, endY, topZ + 0.4, 0.92, 0.92, 0.85, mat('tip'), partId.tip, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: spreadR + 1.2, headZ: h - 1, centerZ: Math.round(h * 0.5) });
  }

  // =========================================================================
  // 3. 礁盘侧缘艳丽分枝珊瑚小件（10×10×12，复用 4 处）
  // =========================================================================
  function buildCoralBranch(makeCanvas) {
    const m = new VoxelModel(10, 10, 12, SPEC);
    const { mat, partId } = SPEC;
    m.paintCapsule(0, 0, 0.8, 0, 0, 5.2, 1.6, 1.3, mat('violet'), partId.violet, true);
    m.paintCapsule(0, 0, 4.6, 2.8, 1.0, 9.6, 1.25, 0.85, mat('violet'), partId.violet, true);
    m.paintCapsule(0, 0, 4.8, -2.5, -1.2, 10.2, 1.25, 0.85, mat('rose'), partId.rose, true);
    m.paintCapsule(0, 0, 5.2, 0.4, -2.6, 8.8, 1.15, 0.80, mat('gold'), partId.gold, true);
    m.paintEllipsoid(2.8, 1.0, 10.0, 0.85, 0.85, 0.8, mat('pink'), partId.pink, true);
    m.paintEllipsoid(-2.5, -1.2, 10.5, 0.85, 0.85, 0.8, mat('gold'), partId.gold, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 11, centerZ: 5 });
  }

  // 9 处活体触须孔位（1 顶 + 4 中层 + 4 底层）
  const POLYP_SOCKETS = [
    { lx:  0.0, ly:  0.0, baseLift: 19.2, size: 'large', phase: 0.0,  order: 0.00 },
    { lx:  6.4, ly:  6.4, baseLift: 13.0, size: 'large', phase: 0.9,  order: 0.14 },
    { lx: -6.4, ly:  6.4, baseLift: 13.0, size: 'large', phase: 1.8,  order: 0.22 },
    { lx: -6.4, ly: -6.4, baseLift: 13.0, size: 'large', phase: 2.7,  order: 0.30 },
    { lx:  6.4, ly: -6.4, baseLift: 13.0, size: 'large', phase: 3.6,  order: 0.38 },
    { lx: 10.6, ly: 10.6, baseLift:  6.8, size: 'small', phase: 0.5,  order: 0.48 },
    { lx:-10.6, ly: 10.6, baseLift:  6.8, size: 'small', phase: 2.1,  order: 0.56 },
    { lx:-10.6, ly:-10.6, baseLift:  6.8, size: 'small', phase: 3.7,  order: 0.64 },
    { lx: 10.6, ly:-10.6, baseLift:  6.8, size: 'small', phase: 5.1,  order: 0.72 }
  ];

  // 4 处外缘分枝小珊瑚挂点
  const BRANCH_SPOTS = [
    { lx:  13.2, ly:  0.0, lift: 3.5, ro: 0.2 },
    { lx: -13.2, ly:  0.0, lift: 3.5, ro: 3.3 },
    { lx:   0.0, ly: 13.2, lift: 3.5, ro: 1.7 },
    { lx:   0.0, ly:-13.2, lift: 3.5, ro: 4.8 }
  ];

  const Def = {
    id: 'scene_t07_coral_colony',
    code: 'T07',
    name: '活体层叠珊瑚簇',
    status: 'done',
    defaultHabitat: 'reef',
    tag: 'T07 浅海环礁 · 涨伸退缩活体礁盘',
    summary: '3 层阶梯多孔钙质硬礁盘 + 9 簇可伸缩鲜艳短触须群（涨潮错相摇曳滤食、退潮迅速缩进硬壳只剩多孔礁盘）',
    footRadius: 15.5,
    ecoWeight: 3.6,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',         name: '涨潮觅食', loop: true,  status: 'done' },
      { id: 'tide_retract', name: '退潮缩壳', loop: false, duration: 2.8, status: 'done' }
    ],
    blocks: ['3 层多孔钙质硬礁盘', '9 簇可伸缩彩色短触须', '涨潮水泡与退潮缩壳动画'],
    soulHabit: '涨潮时彩色短触须在碧水下随水流错相摇曳、偶冒清透水泡；退潮或受惊时整簇触须迅速缩进硬壳内，停顿一拍后再缓缓绽出',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        reefBase: buildReefDisk(makeCanvas, {
          size: 34, h: 10, outerR: 14.6, poreRingR: 15.0 * 0.707, poreRad: 2.3, hasCenterPore: false, rimColor: 'pink'
        }),
        reefMid: buildReefDisk(makeCanvas, {
          size: 26, h: 9, outerR: 11.2, poreRingR: 9.0 * 0.707, poreRad: 2.4, hasCenterPore: false, rimColor: 'violet'
        }),
        reefTop: buildReefDisk(makeCanvas, {
          size: 18, h: 8, outerR: 7.4, poreRingR: 0, poreRad: 2.6, hasCenterPore: true, rimColor: 'pink'
        }),
        polypLarge: buildPolypCluster(makeCanvas, {
          size: 12, h: 12, primaryMat: 'coral', secondaryMat: 'gold', armCount: 8, spreadR: 4.1, tipH: 9.2
        }),
        polypSmall: buildPolypCluster(makeCanvas, {
          size: 9, h: 10, primaryMat: 'rose', secondaryMat: 'violet', armCount: 4, spreadR: 3.1, tipH: 7.4
        }),
        coralBranch: buildCoralBranch(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        time: 0,
        flex: 1.0,
        gFreq: 1.0,
        retractFactors: POLYP_SOCKETS.map(() => 0), // 0=全伸出, 1=全缩进硬壳
        bubbleClock: 0.7,
        rippleClock: 1.4,
        lastAction: 'idle',
        retractBurstDone: false,
        rebloomBurstDone: false
      };

      let curSkin = SKINS[0];

      function spawnBubble(vfx, sMul, wx, wy, wz, speedUp) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        vfx.spawnParticle(
          wx + (Math.random() - 0.5) * 2.2 * sMul,
          wy + (Math.random() - 0.5) * 2.2 * sMul,
          wz,
          (Math.random() - 0.5) * 3.0 * sMul,
          (Math.random() - 0.5) * 3.0 * sMul,
          (speedUp + Math.random() * 5.0) * sMul,
          1.15 + Math.random() * 0.65,
          1.25 + Math.random() * 0.45,
          Math.random() > 0.4 ? fx.bubbleA : fx.bubbleB,
          false,
          -2.5
        );
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
          state.time = 0;
          for (let i = 0; i < state.retractFactors.length; i++) state.retractFactors[i] = 0;
          state.bubbleClock = 0.6;
          state.rippleClock = 1.2;
          state.lastAction = 'idle';
          state.retractBurstDone = false;
          state.rebloomBurstDone = false;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          state.time = time;
          state.flex = clamp(params.tailFlex ?? 1.0, 0.3, 2.0);
          state.gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);

          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.retractBurstDone = false;
            state.rebloomBurstDone = false;
          }

          if (action === 'tide_retract') {
            // 0~0.42s 迅速刷地缩进硬壳；0.42~1.55s 停顿只剩多孔礁盘；1.55~2.80s 缓缓重新绽出
            for (let i = 0; i < POLYP_SOCKETS.length; i++) {
              const ord = POLYP_SOCKETS[i].order;
              const tIn = clamp((actionTime - ord * 0.14) / 0.24, 0, 1);
              const tOut = clamp((actionTime - 1.55 - ord * 0.45) / 0.65, 0, 1);
              const rVal = smoothstep(0, 1, tIn) * (1 - smoothstep(0, 1, tOut));
              state.retractFactors[i] = rVal;
            }

            if (!state.retractBurstDone && actionTime >= 0.08) {
              state.retractBurstDone = true;
              if (vfx) {
                vfx.addRipple(state.x, state.y, 7.0 * sMul, 20.0 * sMul, 0.9, 1.8);
                for (let k = 0; k < 6; k++) {
                  const a = (k / 6) * TAU;
                  spawnBubble(vfx, sMul, state.x + Math.cos(a) * 6 * sMul, state.y + Math.sin(a) * 6 * sMul, 12 * sMul, 12.0);
                }
              }
            }
            if (!state.rebloomBurstDone && actionTime >= 1.65) {
              state.rebloomBurstDone = true;
              if (vfx) {
                vfx.addRipple(state.x, state.y, 5.0 * sMul, 16.0 * sMul, 1.0, 1.4);
                for (let k = 0; k < 4; k++) {
                  const a = k * 1.57 + 0.4;
                  spawnBubble(vfx, sMul, state.x + Math.cos(a) * 5 * sMul, state.y + Math.sin(a) * 5 * sMul, 16 * sMul, 8.5);
                }
              }
            }
          } else {
            // 涨潮觅食态：触须舒展回位，周期性冒出清透小水泡与轻涟漪
            for (let i = 0; i < state.retractFactors.length; i++) {
              state.retractFactors[i] = lerp(state.retractFactors[i], 0, clamp(dt * 6.0, 0, 1));
            }
            state.bubbleClock -= dt;
            if (state.bubbleClock <= 0) {
              state.bubbleClock = 0.85 + Math.random() * 0.9;
              const idx = Math.floor(Math.random() * POLYP_SOCKETS.length);
              const sk = POLYP_SOCKETS[idx];
              const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, sk.lx * sMul, sk.ly * sMul);
              spawnBubble(vfx, sMul, wx, wy, (sk.baseLift + 6.5) * sMul, 7.5);
            }
            state.rippleClock -= dt;
            if (state.rippleClock <= 0) {
              state.rippleClock = 1.9 + Math.random() * 1.1;
              if (vfx) vfx.addRipple(state.x, state.y, 9.5 * sMul, 18.5 * sMul, 1.25, 1.2);
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.time;
          const flex = state.flex;
          const gFreq = state.gFreq;
          const list = [];

          // 1. 三层阶梯多孔钙质硬礁盘（底层浸水染浅海碧色）
          list.push({
            partKey: 'reefBase',
            asset: parts.reefBase,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            submerge: 0.45,
            bias: -0.40,
            symDeg: 90
          });
          list.push({
            partKey: 'reefMid',
            asset: parts.reefMid,
            x: state.x,
            y: state.y,
            lift: 7.2 * sMul,
            ro: wrapAngle(yw + 0.39),
            submerge: 0.22,
            bias: 0.15,
            symDeg: 90
          });
          list.push({
            partKey: 'reefTop',
            asset: parts.reefTop,
            x: state.x,
            y: state.y,
            lift: 13.8 * sMul,
            ro: yw,
            submerge: 0.0,
            bias: 0.65,
            symDeg: 90
          });

          // 2. 四侧艳丽分枝小珊瑚
          for (let i = 0; i < BRANCH_SPOTS.length; i++) {
            const bs = BRANCH_SPOTS[i];
            const [bx, by] = localToWorldXY(state.x, state.y, yw, bs.lx * sMul, bs.ly * sMul);
            list.push({
              partKey: 'coralBranch',
              asset: parts.coralBranch,
              x: bx,
              y: by,
              lift: bs.lift * sMul,
              ro: wrapAngle(yw + bs.ro),
              submerge: 0.30,
              bias: 0.35,
              symDeg: 180
            });
          }

          // 3. 九簇活体短触须群（随水流错相摇曳 / 退潮整簇缩入礁孔）
          for (let i = 0; i < POLYP_SOCKETS.length; i++) {
            const sk = POLYP_SOCKETS[i];
            const ret = state.retractFactors[i];
            if (ret > 0.96) continue; // 完全缩进硬壳内，仅露多孔礁盘

            const open = 1 - ret;
            const swayAmp = 0.42 * flex * open * sMul;
            const sx = Math.sin(t * 2.1 * gFreq + sk.phase) * swayAmp;
            const sy = Math.cos(t * 1.65 * gFreq + sk.phase * 1.3) * swayAmp * 0.72;
            const bob = Math.sin(t * 2.4 * gFreq + sk.phase) * 0.32 * open * sMul;

            const [px, py] = localToWorldXY(state.x, state.y, yw, sk.lx * sMul, sk.ly * sMul);
            const sinkDrop = ret * 6.8 * sMul;
            const op = ret > 0.62 ? clamp(1 - (ret - 0.62) / 0.34, 0, 1) : 1.0;

            list.push({
              partKey: sk.size === 'large' ? 'polypLarge' : 'polypSmall',
              asset: sk.size === 'large' ? parts.polypLarge : parts.polypSmall,
              x: px + sx,
              y: py + sy,
              lift: Math.max(0.5, sk.baseLift * sMul + bob - sinkDrop),
              ro: wrapAngle(yw + Math.sin(t * 1.5 * gFreq + sk.phase) * 0.16 * open),
              opacity: op,
              submerge: sk.size === 'small' ? 0.20 : 0.0,
              bias: 1.05 + (sk.size === 'large' ? 0.25 : 0.0),
              symDeg: 90
            });
          }

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
