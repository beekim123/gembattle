'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T21 热泉梯田 · 热泉钙化矿柱与滚沸泉眼（scenes/scene_t21_mineral_chimney.js）
  //
  // 拆件与图集预算（单盒严格 <= 28 格，严禁常态 scaleX/scaleY 拉伸）：
  //   - chimneyCluster (24×24×28)                  ：层环状洁白/米黄钙化矿柱簇（呼应 泽6 矿壳材质）
  //   - springBasin    (22×22×7,  submerge: 0.25)  ：凹陷深青碧滚沸泉眼与白矿堰口
  //   - boilFoam       (12×12×6,  sym90, noOutline)：泉口翻滚的密集白沫团
  //   - geyserPlume    (10×10×24, sym90, noOutline)：周期与 geyser_spurt 喷涌的清白热汽水柱
  //
  // 19 色 0 重色 0 禁用字，仅滚沸泉眼微亮泡 1 键进 glowKeys
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 洁白钙化矿柱主体（3 档，与 泽6 高跷腿矿壳同材质）
      calcDark:  '#a89f8e',
      calcMid:   '#ded6c5',
      calcHi:    '#faf7ef',
      // 米黄沉积矿环纹（3 档）
      ringDark:  '#998463',
      ringMid:   '#ccb489',
      ringHi:    '#f2dfb6',
      // 柱基暖赭矿渍（3 档）
      ochreDark: '#7d4b24',
      ochreMid:  '#b87339',
      ochreHi:   '#e39e59',
      // 泉眼深青碧滚沸池水（3 档）
      poolDark:  '#0e4f5c',
      poolMid:   '#1c8696',
      poolHi:    '#57d0db',
      // 泉口密集翻滚白沫（3 档）
      foamDark:  '#b0d4d6',
      foamMid:   '#daf2f2',
      foamHi:    '#ffffff',
      // 水柱清透浅碧芯（3 档）
      jetDark:   '#4aaeb8',
      jetMid:    '#8ce3e8',
      jetHi:     '#d4fafc',
      // 泉眼滚沸微亮泡（仅此 1 键进 glowKeys）
      boilGlow:  '#b8fff7'
    },
    glowKeys: ['boilGlow'],
    parts: ['calc', 'ring', 'ochre', 'pool', 'foam', 'jet', 'boil'],
    noCrease: [
      ['calc', 'ring'],
      ['calc', 'ochre'],
      ['pool', 'foam'],
      ['pool', 'boil'],
      ['jet', 'foam']
    ],
    materials: {
      calc:  ['calcDark',  'calcMid',  'calcHi'],
      ring:  ['ringDark',  'ringMid',  'ringHi'],
      ochre: ['ochreDark', 'ochreMid', 'ochreHi'],
      pool:  ['poolDark',  'poolMid',  'poolHi'],
      foam:  ['foamDark',  'foamMid',  'foamHi'],
      jet:   ['jetDark',   'jetMid',   'jetHi']
    },
    protectedParts: ['boil', 'foam', 'jet']
  });

  // 3 套零重建模换色皮肤（每套 0 重色 0 禁用字）
  const SKINS = [
    {
      id: 'snow_calcite',
      name: '雪白钙柱',
      dot: '#faf7ef',
      outline: '#141a1c',
      pal: {},
      fx: {
        steamA: '#ffffff',
        steamB: '#dcf5f5',
        dropA:  '#8ce3e8',
        dropB:  '#57d0db'
      }
    },
    {
      id: 'warm_ochre_sulfur',
      name: '暖赭硫柱',
      dot: '#d99a45',
      outline: '#1c140e',
      pal: {
        calcDark:  '#9c7d56', calcMid:  '#cfb07e', calcHi:  '#f2dcad',
        ringDark:  '#8c5b28', ringMid:  '#c48841', ringHi:  '#f0bd6e',
        ochreDark: '#6e3418', ochreMid: '#a85124', ochreHi: '#db7c3d',
        poolDark:  '#1d5952', poolMid:  '#2e9182', poolHi:  '#6ed4be',
        jetDark:   '#5ca89a', jetMid:   '#9ce0d2', jetHi:   '#dcfaf2',
        boilGlow:  '#ffe9a8'
      },
      fx: {
        steamA: '#fff8e8',
        steamB: '#e8f5ec',
        dropA:  '#9ce0d2',
        dropB:  '#6ed4be'
      }
    },
    {
      id: 'blue_grey_jade',
      name: '青灰玉柱',
      dot: '#72a8b5',
      outline: '#0e161c',
      pal: {
        calcDark:  '#5d747d', calcMid:  '#8ca5b0', calcHi:  '#c7dbe3',
        ringDark:  '#466673', ringMid:  '#6c96a6', ringHi:  '#a1cad9',
        ochreDark: '#364d59', ochreMid: '#547382', ochreHi: '#7da2b3',
        poolDark:  '#0f3b6e', poolMid:  '#1e6cb3', poolHi:  '#5cb8f5',
        jetDark:   '#3b8ec4', jetMid:   '#7cd0fa', jetHi:   '#ccf0ff',
        boilGlow:  '#b3e8ff'
      },
      fx: {
        steamA: '#eef9ff',
        steamB: '#cceeff',
        dropA:  '#7cd0fa',
        dropB:  '#5cb8f5'
      }
    }
  ];

  // 1. 层环状洁白/米黄钙化矿柱簇（24×24×28）
  function buildChimneyCluster(makeCanvas) {
    const m = new VoxelModel(24, 24, 28, SPEC);
    const { mat, partId } = SPEC;

    // 3 根高低错落的层环钙化矿柱（主柱 + 侧中柱 + 矮壮柱）
    const pillars = [
      { cx: -1.5, cy: -1.5, h: 27, rBot: 5.8, rTop: 2.3, hollow: true },
      { cx:  5.4, cy: -4.2, h: 19, rBot: 4.4, rTop: 1.9, hollow: true },
      { cx: -6.2, cy:  4.4, h: 13, rBot: 4.0, rTop: 2.0, hollow: false }
    ];

    for (const p of pillars) {
      m.fillAABB(p.cx - p.rBot - 2, p.cx + p.rBot + 2, p.cy - p.rBot - 2, p.cy + p.rBot + 2, 0, p.h, (x, y, z, X, Y) => {
        const u = z / p.h;
        const lx = X - p.cx;
        const ly = Y - p.cy;
        const r = Math.hypot(lx, ly);
        // 一圈圈向外微凸的沉积钙化环肋（每 3~4 格一环）
        const ringBulge = Math.sin(z * 1.65) * 0.65;
        const rOuter = lerp(p.rBot, p.rTop, Math.pow(u, 0.88)) + ringBulge;
        if (r > rOuter) return;

        // 柱顶保留细窄喷汽孔
        if (p.hollow && z >= p.h - 4 && r < 1.15) return;

        // 分层着色：底部暖赭矿渍 + 环凸米黄矿环 + 洁白钙化主壳
        if (z <= 3 && r > rOuter - 1.6) {
          m.setRaw(x, y, z, mat('ochre'), partId.ochre);
        } else if (ringBulge > 0.22) {
          m.setRaw(x, y, z, mat('ring'), partId.ring);
        } else {
          m.setRaw(x, y, z, mat('calc'), partId.calc);
        }
      });
    }

    // 底部矿台连成一体
    m.paintEllipsoid(-0.6, -0.4, 1.4, 9.8, 8.6, 1.8, mat('calc'), partId.calc, false);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.5, headZ: 28, centerZ: 12 });
  }

  // 2. 凹陷深青碧滚沸泉眼（22×22×7）
  function buildSpringBasin(makeCanvas) {
    const m = new VoxelModel(22, 22, 7, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-10, 10, -10, 10, 0, 6, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X, Y);
      const wave = Math.sin(ang * 5 + 0.6) * 0.65;
      const rOuter = 9.4 + wave;
      if (r > rOuter) return;

      const rInner = 5.4 + wave * 0.4;
      if (r >= rInner) {
        // 多孔白色钙化泉堰围边（高低起伏）
        const rimTop = 4.6 + Math.cos(ang * 4) * 0.9;
        if (z > rimTop) return;
        const isOchre = z <= 1 && r > rOuter - 1.6;
        const isRing = z === 3 && Math.sin(ang * 6) > 0.1;
        m.setRaw(x, y, z, isOchre ? mat('ochre') : (isRing ? mat('ring') : mat('calc')),
                 isOchre ? partId.ochre : (isRing ? partId.ring : partId.calc));
      } else if (z <= 2) {
        // 凹陷深青碧滚沸池水 + 中心微亮热泡 + 边缘白沫
        if (z === 2 && r <= 2.1) {
          m.setRaw(x, y, z, keyToId.boilGlow, partId.boil);
        } else if (z === 2 && r >= rInner - 1.2) {
          m.setRaw(x, y, z, mat('foam'), partId.foam);
        } else {
          m.setRaw(x, y, z, mat('pool'), partId.pool);
        }
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 10.0, headZ: 6, centerZ: 3 });
  }

  // 3. 泉口翻滚密集白沫团（12×12×6，symDeg: 90）
  function buildBoilFoam(makeCanvas) {
    const m = new VoxelModel(12, 12, 6, SPEC);
    const { mat, partId, keyToId } = SPEC;

    m.fillAABB(-5, 5, -5, 5, 0, 5, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X, Y);
      const lobe = 3.8 + Math.cos(ang * 4) * 0.85 - z * 0.48;
      if (r > lobe) return;
      if (r < 1.3 && z >= 2 && z <= 3) {
        m.setRaw(x, y, z, keyToId.boilGlow, partId.boil);
      } else {
        m.setRaw(x, y, z, mat('foam'), partId.foam);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 5, centerZ: 2 });
  }

  // 4. 细长清白热汽水柱（10×10×24，symDeg: 90）
  function buildGeyserPlume(makeCanvas) {
    const m = new VoxelModel(10, 10, 24, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-4, 4, -4, 4, 0, 23, (x, y, z, X, Y) => {
      const u = z / 23;
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X, Y);
      // 细长水柱顶微散成白沫花冠
      const baseR = u < 0.72 ? lerp(2.0, 1.5, u / 0.72) : lerp(1.5, 3.6, (u - 0.72) / 0.28) * (1 - Math.max(0, u - 0.88) * 5.2);
      const wave = 0.84 + 0.22 * Math.cos(ang * 4 + u * 2.4);
      if (r > baseR * wave) return;
      const isFoam = u > 0.68 || r > baseR * 0.65;
      m.setRaw(x, y, z, isFoam ? mat('foam') : mat('jet'), isFoam ? partId.foam : partId.jet);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5, headZ: 24, centerZ: 12 });
  }

  const CHIMNEY_LOCAL = { x: -7.5, y: -3.2 };
  const BASIN_LOCAL   = { x:  9.2, y:  3.8 };

  const Def = {
    id: 'scene_t21_mineral_chimney',
    code: 'T21',
    name: '热泉钙化矿柱与滚沸泉眼',
    status: 'done',
    defaultHabitat: 'hotspring',
    tag: 'T21 热泉梯田地标 · 钙化矿柱与喷涌泉眼',
    summary: '层环状洁白/米黄钙化矿柱簇（与泽6高跷腿矿壳同材质呼应），旁侧凹陷深青碧滚沸泉眼翻着密集白沫并周期喷出清白热汽水柱',
    footRadius: 19.5,
    ecoWeight: 3.5,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '层环状洁白/米黄钙化矿柱簇',
      '凹陷深青碧滚沸泉眼与多孔白矿堰',
      '泉口翻滚密集白沫与微亮热泡',
      '周期喷涌的清白热汽水柱与水雾粒'
    ],
    actions: [
      { id: 'idle',         name: '滚沸翻沫（白汽慢升）',       loop: true,  status: 'done' },
      { id: 'geyser_spurt', name: '蓄压喷泉（高水柱+大涟漪）', loop: false, duration: 2.4, status: 'done' }
    ],
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        chimneyCluster: buildChimneyCluster(makeCanvas),
        springBasin:    buildSpringBasin(makeCanvas),
        boilFoam:       buildBoilFoam(makeCanvas),
        geyserPlume:    buildGeyserPlume(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.25;
      let curSkin = SKINS[0];

      const state = {
        x: hx0,
        y: hy0,
        z: 0,
        yaw: hyaw0,
        action: 'idle',
        lastAction: 'idle',
        foamLift: 2.2,
        foamYaw: hyaw0,
        showPlume: false,
        plumeLift: -16,
        plumeYaw: hyaw0,
        steamCd: 0,
        boilCd: 0,
        spurtStage: 0
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
          state.foamLift = 2.2;
          state.foamYaw = yaw;
          state.showPlume = false;
          state.plumeLift = -16;
          state.steamCd = 0;
          state.boilCd = 0;
          state.spurtStage = 0;
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
            state.spurtStage = 0;
          }
          state.action = action;

          const t = time * freq;
          const [bx, by] = localToWorldXY(state.x, state.y, state.yaw, BASIN_LOCAL.x * sMul, BASIN_LOCAL.y * sMul);
          const [cx, cy] = localToWorldXY(state.x, state.y, state.yaw, CHIMNEY_LOCAL.x * sMul, CHIMNEY_LOCAL.y * sMul);

          state.showPlume = false;
          let boilBoost = 0;

          if (action === 'geyser_spurt') {
            const u = clamp(actionTime / 2.4, 0, 1);
            if (u < 0.23) {
              // 蓄压半拍：白沫剧烈翻涌
              boilBoost = u / 0.23;
            } else if (u < 0.72) {
              // 喷出高高清白热水柱
              const k = (u - 0.23) / 0.49;
              const env = Math.sin(k * Math.PI);
              boilBoost = 1.0;
              state.showPlume = true;
              state.plumeLift = lerp(-6.0, 6.5, smoothstep(0, 1, env)) * sMul;
              state.plumeYaw = state.yaw + actionTime * 4.5;

              if (state.spurtStage === 0 && vfx) {
                state.spurtStage = 1;
                vfx.addRipple(bx, by, 2.5 * sMul, 14.5 * sMul, 1.0, 1.8);
                for (let i = 0; i < 16; i++) {
                  const a = Math.random() * TAU;
                  const sp = (3.5 + Math.random() * 8.5) * sMul;
                  vfx.spawnParticle(
                    bx + (Math.random() - 0.5) * 2.2 * sMul,
                    by + (Math.random() - 0.5) * 2.2 * sMul,
                    12.0 * sMul,
                    Math.cos(a) * sp,
                    Math.sin(a) * sp,
                    (20.0 + Math.random() * 14.0) * sMul,
                    0.95 + Math.random() * 0.4,
                    1.4 + Math.random() * 0.55,
                    i % 2 === 0 ? fx.steamA : fx.dropA,
                    false,
                    38
                  );
                }
              }
            } else {
              // 落回水池荡起层层大涟漪
              if (state.spurtStage < 2 && vfx) {
                state.spurtStage = 2;
                vfx.addRipple(bx, by, 3.0 * sMul, 18.5 * sMul, 1.25, 2.2);
                vfx.addRipple(bx, by, 1.8 * sMul, 12.5 * sMul, 0.85, 1.6);
              }
            }
          } else {
            // idle：周期性小幅喷出一股细长热汽水柱（每 ~4.5s 短暂露顶）
            const cyc = (t * 0.22) % 1.0;
            if (cyc > 0.74 && cyc < 0.94) {
              const k = (cyc - 0.74) / 0.20;
              const env = Math.sin(k * Math.PI);
              state.showPlume = true;
              state.plumeLift = lerp(-12.0, -2.5, env) * sMul;
              state.plumeYaw = state.yaw + t * 2.8;
              boilBoost = env * 0.5;
            }
          }

          // 泉口白沫翻滚
          state.foamLift = (2.1 + Math.sin(t * (7.5 + boilBoost * 6.0)) * (0.42 + boilBoost * 0.55)) * sMul;
          state.foamYaw  = state.yaw + t * (1.2 + boilBoost * 2.2);

          if (!vfx) return;

          // 1. 泉眼与主矿柱顶袅袅白汽
          state.steamCd -= dt;
          const steamInt = action === 'geyser_spurt' ? 0.06 : 0.20;
          if (state.steamCd <= 0) {
            state.steamCd = steamInt;
            const a = Math.random() * TAU;
            const fromChimney = Math.random() < 0.30;
            const sx = fromChimney ? cx : bx + Math.cos(a) * 2.6 * sMul;
            const sy = fromChimney ? cy : by + Math.sin(a) * 2.6 * sMul;
            const sz = (fromChimney ? 26.5 : 5.5 + boilBoost * 5.0) * sMul;
            vfx.spawnParticle(
              sx, sy, sz,
              (Math.cos(time * 0.8) * 1.8 + (Math.random() - 0.5) * 1.6) * sMul,
              (Math.sin(time * 0.7) * 1.6 + (Math.random() - 0.5) * 1.6) * sMul,
              (6.8 + Math.random() * 3.8 + boilBoost * 6.0) * sMul,
              1.15 + Math.random() * 0.45,
              (1.9 + boilBoost * 0.7) + Math.random() * 0.6,
              Math.random() > 0.4 ? fx.steamA : fx.steamB,
              false,
              -0.7
            );
          }

          // 2. 泉眼咕嘟翻沫水珠与小涟漪
          state.boilCd -= dt;
          const boilInt = action === 'geyser_spurt' ? 0.14 : 0.48;
          if (state.boilCd <= 0) {
            state.boilCd = boilInt;
            const a = Math.random() * TAU;
            vfx.spawnParticle(
              bx + Math.cos(a) * 2.2 * sMul,
              by + Math.sin(a) * 2.2 * sMul,
              4.2 * sMul,
              Math.cos(a) * 2.6 * sMul,
              Math.sin(a) * 2.6 * sMul,
              (7.5 + Math.random() * 4.0) * sMul,
              0.55 + Math.random() * 0.25,
              1.15,
              Math.random() > 0.5 ? fx.dropA : fx.dropB,
              false,
              28
            );
            if (Math.random() < 0.45) {
              vfx.addRipple(bx, by, 1.8 * sMul, 8.2 * sMul, 0.85, 1.3);
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const [cx, cy] = localToWorldXY(state.x, state.y, yw, CHIMNEY_LOCAL.x * sMul, CHIMNEY_LOCAL.y * sMul);
          const [bx, by] = localToWorldXY(state.x, state.y, yw, BASIN_LOCAL.x * sMul, BASIN_LOCAL.y * sMul);

          const list = [
            {
              partKey: 'chimneyCluster',
              asset: parts.chimneyCluster,
              x: cx,
              y: cy,
              lift: 0,
              ro: yw,
              bias: -0.10
            },
            {
              partKey: 'springBasin',
              asset: parts.springBasin,
              x: bx,
              y: by,
              lift: 0,
              ro: wrapAngle(yw + 0.18),
              submerge: 0.25,
              bias: 0.05
            },
            {
              partKey: 'boilFoam',
              asset: parts.boilFoam,
              x: bx,
              y: by,
              lift: state.foamLift,
              ro: state.foamYaw,
              symDeg: 90,
              noOutline: true,
              bias: 0.24
            }
          ];

          if (state.showPlume) {
            list.push({
              partKey: 'geyserPlume',
              asset: parts.geyserPlume,
              x: bx,
              y: by,
              lift: state.plumeLift,
              ro: state.plumeYaw,
              symDeg: 90,
              noOutline: true,
              bias: 0.36
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
