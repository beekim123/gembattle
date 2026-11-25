'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T21 热泉梯田 · 石灰矿堰三色台阶泉池（scenes/scene_t21_travertine_pool.js）
  //
  // 紧扣 T21 核心生态规矩：洁白多孔石灰矿堰边 + 橙红(#e0742c)/明黄(#c9b23a)/翠绿(#6aa84f)
  // 三层错落浅热水菌毯池 + 顶层泉口持续上升柔和纯白热蒸汽粒。
  //
  // 拆件与图集预算（单盒严格 <= 34 格，严禁常态 scaleX/scaleY 拉伸）：
  //   - tierTop       (22×20×14) ：最上高热阶（白矿堰边 + 橙红 #e0742c 菌毯 + 泉口微亮热泡）
  //   - tierMid       (28×22×10) ：中阶温热池（白矿堰边 + 明黄 #c9b23a 菌毯 + 湛蓝浅水）
  //   - tierBot       (34×24×7)  ：最下微温池（白矿堰边 + 鲜翠绿 #6aa84f 菌毯 + 清澈水池）
  //   - overflowSpout (8×8×9, 复用 ×2) ：阶间垂挂溢流热泉水瀑
  //
  // 22 色 0 重色 0 禁用字，仅顶池泉眼微亮热泡 1 键进 glowKeys
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 洁白多孔石灰矿堰边与垂挂钙化矿壳（3 档）
      limeDark:      '#a69e90',
      limeMid:       '#dcd6c8',
      limeHi:        '#f7f5ee',
      // 矿堰底座浅暖灰岩（3 档）
      rockDark:      '#696257',
      rockMid:       '#8f877a',
      rockHi:        '#b5ada0',
      // 湛蓝清澈热泉水（3 档）
      waterDark:     '#1d6e7a',
      waterMid:      '#2f9aa8',
      waterHi:       '#78dce3',
      // 顶阶饱和橙红菌毯（锚定 #e0742c）
      matOrangeDark: '#a64616',
      matOrangeMid:  '#e0742c',
      matOrangeHi:   '#ff9e52',
      // 中阶明黄菌毯（锚定 #c9b23a）
      matYellowDark: '#8f7b1d',
      matYellowMid:  '#c9b23a',
      matYellowHi:   '#f2df68',
      // 底阶鲜翠绿菌毯（锚定 #6aa84f）
      matGreenDark:  '#3f732d',
      matGreenMid:   '#6aa84f',
      matGreenHi:    '#9cd977',
      // 溢流白沫（3 档）
      foamDark:      '#b8d9d9',
      foamMid:       '#dcf2f0',
      foamHi:        '#ffffff',
      // 顶池泉眼滚泡微亮（仅此 1 键进 glowKeys）
      ventGlow:      '#ffe6b3'
    },
    glowKeys: ['ventGlow'],
    parts: ['lime', 'rock', 'water', 'matOrange', 'matYellow', 'matGreen', 'foam', 'vent'],
    noCrease: [
      ['lime', 'rock'],
      ['water', 'matOrange'],
      ['water', 'matYellow'],
      ['water', 'matGreen'],
      ['water', 'foam'],
      ['water', 'vent']
    ],
    materials: {
      lime:      ['limeDark',      'limeMid',      'limeHi'],
      rock:      ['rockDark',      'rockMid',      'rockHi'],
      water:     ['waterDark',     'waterMid',     'waterHi'],
      matOrange: ['matOrangeDark', 'matOrangeMid', 'matOrangeHi'],
      matYellow: ['matYellowDark', 'matYellowMid', 'matYellowHi'],
      matGreen:  ['matGreenDark',  'matGreenMid',  'matGreenHi'],
      foam:      ['foamDark',      'foamMid',      'foamHi']
    },
    protectedParts: ['vent', 'foam', 'matOrange', 'matYellow', 'matGreen']
  });

  // 3 套零重建模换色皮肤（每套 0 重色 0 禁用字）
  const SKINS = [
    {
      id: 'tri_classic',
      name: '三色经典菌毯',
      dot: '#e0742c',
      outline: '#1a1815',
      pal: {},
      fx: {
        steamA: '#ffffff',
        steamB: '#e8f5f2',
        spray:  '#78dce3'
      }
    },
    {
      id: 'azure_calcite',
      name: '蓝碧钙池',
      dot: '#36c2cf',
      outline: '#111b1f',
      pal: {
        limeDark:      '#9aa8ad', limeMid:      '#d2dfe3', limeHi:      '#f5fafc',
        rockDark:      '#53646b', rockMid:      '#768b94', rockHi:      '#9eb3bd',
        waterDark:     '#125582', waterMid:     '#2289bd', waterHi:     '#68d4f7',
        matOrangeDark: '#1b7a85', matOrangeMid: '#36b5bf', matOrangeHi: '#7eeaf0',
        matYellowDark: '#238275', matYellowMid: '#42b8a3', matYellowHi: '#85ebd3',
        matGreenDark:  '#1d4d8f', matGreenMid:  '#3679c7', matGreenHi:  '#75b5fa',
        ventGlow:      '#d6fbff'
      },
      fx: {
        steamA: '#f5fafc',
        steamB: '#d6f2f7',
        spray:  '#68d4f7'
      }
    },
    {
      id: 'crimson_gold_mineral',
      name: '赤金浓矿',
      dot: '#d94c26',
      outline: '#1c120d',
      pal: {
        limeDark:      '#a88e72', limeMid:      '#dbc3a4', limeHi:      '#f7e9d2',
        rockDark:      '#6e543e', rockMid:      '#967558', rockHi:      '#bd9a7a',
        waterDark:     '#226369', waterMid:     '#388f91', waterHi:     '#78c7c4',
        matOrangeDark: '#8c2214', matOrangeMid: '#d43d22', matOrangeHi: '#ff784d',
        matYellowDark: '#9e6914', matYellowMid: '#de9f26', matYellowHi: '#ffd959',
        matGreenDark:  '#5d7524', matGreenMid:  '#8eb038', matGreenHi:  '#c7e065',
        ventGlow:      '#ffd899'
      },
      fx: {
        steamA: '#fff7eb',
        steamB: '#f2e4d0',
        spray:  '#78c7c4'
      }
    }
  ];

  // 通用弧形石灰矿堰梯田池构建器（每阶外缘刻出白色垂挂钙化矿壳边）
  function buildTerraceTier(makeCanvas, cfg) {
    const { w, d, h, rx, ry, matName, hasVent, notchX } = cfg;
    const m = new VoxelModel(w, d, h, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hw = Math.floor(w * 0.5);
    const hd = Math.floor(d * 0.5);

    m.fillAABB(-hw, hw, -hd, hd, 0, h - 1, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      // 弧形贝壳状天然石灰梯田轮廓
      const scallop = Math.sin(ang * 5 + 0.4) * 0.65 + Math.cos(ang * 3) * 0.45;
      const nx = X / (rx + scallop);
      const ny = Y / (ry + scallop * 0.8);
      const dist = Math.hypot(nx, ny);
      if (dist > 1.0) return;

      const u = z / (h - 1);
      // 底部略收、顶缘外翻形成多孔垂挂钙化矿壳唇边
      const overhang = dist > 0.84 ? (1 - u) * 0.10 : 0;
      const rib = Math.sin(ang * 14) * 0.035;
      if (dist > 0.98 - overhang + rib) return;

      const waterZ = h - 2;
      const isRim = dist >= 0.78;
      // 前缘溢流缺口（+Y 侧）
      const inNotch = Y > 0 && Math.abs(X - notchX) <= 2.3 && z >= waterZ;

      if (z === h - 1) {
        if (isRim && !inNotch) {
          m.setRaw(x, y, z, mat('lime'), partId.lime);
        } else if (inNotch) {
          m.setRaw(x, y, z, mat('foam'), partId.foam);
        }
        return;
      }

      if (z === waterZ && !isRim) {
        // 池面：外圈厚铺本阶对应色菌毯，中央露清澈湛蓝热水
        if (hasVent && Math.hypot(X + 1.0, Y + 1.2) <= 2.1) {
          m.setRaw(x, y, z, keyToId.ventGlow, partId.vent);
        } else if (dist >= 0.40 || ((Math.round(X) + Math.round(Y)) % 3 === 0 && dist >= 0.28)) {
          m.setRaw(x, y, z, mat(matName), partId[matName]);
        } else {
          m.setRaw(x, y, z, mat('water'), partId.water);
        }
        return;
      }

      if (z === waterZ - 1 && !isRim) {
        m.setRaw(x, y, z, mat(matName), partId[matName]);
        return;
      }

      // 外壁钙化矿壳：上层洁白多孔钙化唇，下层浅灰岩基座，带纵向垂挂钙化棱条
      const isCurtain = z >= Math.floor(h * 0.35) || Math.sin(ang * 12) > 0.15;
      m.setRaw(x, y, z, isCurtain ? mat('lime') : mat('rock'), isCurtain ? partId.lime : partId.rock);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rx, ry), headZ: h, centerZ: Math.round(h * 0.5) });
  }

  // 阶间溢流热泉水瀑（8×8×9，复用 ×2）
  function buildOverflowSpout(makeCanvas) {
    const m = new VoxelModel(8, 8, 9, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-3, 3, -3, 3, 0, 8, (x, y, z, X, Y) => {
      const u = z / 8;
      // 抛物线弧形向下垂流的水帘
      const arcY = (1 - u) * 2.2 - 1.0;
      const halfW = lerp(2.2, 1.5, u);
      if (Math.abs(X) <= halfW && Math.abs(Y - arcY) <= 1.15) {
        const isFoam = z <= 1 || z >= 7 || Math.abs(X) > halfW - 0.7;
        m.setRaw(x, y, z, isFoam ? mat('foam') : mat('water'), isFoam ? partId.foam : partId.water);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 9, centerZ: 4 });
  }

  // 三层梯田错落位置（阶梯自后向前层层往下跌落）
  const TOP_LOCAL   = { x: -3.2, y: -6.8, lift: 7.2 };
  const MID_LOCAL   = { x:  1.8, y:  0.4, lift: 3.2 };
  const BOT_LOCAL   = { x:  3.6, y:  8.8, lift: 0.0 };
  const SPOUT1_LOCAL = { x: -1.6, y: -0.6, lift: 8.6 };
  const SPOUT2_LOCAL = { x:  3.2, y:  6.4, lift: 4.0 };

  const Def = {
    id: 'scene_t21_travertine_pool',
    code: 'T21',
    name: '石灰矿堰三色台阶泉池',
    status: 'done',
    defaultHabitat: 'hotspring',
    tag: 'T21 热泉梯田奇观 · 三色菌毯石灰矿堰池',
    summary: '三级错落叠落的洁白多孔石灰矿堰弧形梯田，自上而下依次铺展橙红(#e0742c)、明黄(#c9b23a)、鲜翠绿(#6aa84f)三层浅热水菌毯池，顶池持续升腾柔和纯白热蒸汽粒',
    footRadius: 20.0,
    ecoWeight: 3.8,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '顶阶高热橙红(#e0742c)菌毯石灰池与微亮泉眼',
      '中阶温热明黄(#c9b23a)菌毯池与垂挂矿壳边',
      '底阶微温翠绿(#6aa84f)菌毯池与清澈蓝水',
      '阶间溢流热泉水瀑与袅袅纯白热蒸汽粒'
    ],
    actions: [
      { id: 'idle',        name: '袅袅热汽（三阶静流）',     loop: true,  status: 'done' },
      { id: 'steam_surge', name: '热泉涌流（绵密蒸汽+涟漪）', loop: false, duration: 2.6, status: 'done' }
    ],
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        tierTop: buildTerraceTier(makeCanvas, {
          w: 22, d: 20, h: 12, rx: 9.2, ry: 8.0, matName: 'matOrange', hasVent: true, notchX: 1.2
        }),
        tierMid: buildTerraceTier(makeCanvas, {
          w: 28, d: 22, h: 9, rx: 12.2, ry: 9.2, matName: 'matYellow', hasVent: false, notchX: 1.4
        }),
        tierBot: buildTerraceTier(makeCanvas, {
          w: 34, d: 24, h: 7, rx: 15.0, ry: 10.2, matName: 'matGreen', hasVent: false, notchX: 0.0
        }),
        overflowSpout: buildOverflowSpout(makeCanvas)
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
        spout1Lift: SPOUT1_LOCAL.lift,
        spout2Lift: SPOUT2_LOCAL.lift,
        steamCd: 0,
        rippleCd: 0.9,
        surgeBeat: 0
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
          state.spout1Lift = SPOUT1_LOCAL.lift;
          state.spout2Lift = SPOUT2_LOCAL.lift;
          state.steamCd = 0;
          state.rippleCd = 0.8;
          state.surgeBeat = 0;
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
            state.surgeBeat = 0;
          }
          state.action = action;

          const t = time * freq;
          let surge = 0;
          if (action === 'steam_surge') {
            const u = clamp(actionTime / 2.6, 0, 1);
            surge = smoothstep(0.0, 0.18, u) * (1 - smoothstep(0.68, 1.0, u));
          }

          // 溢流水瀑轻幅起伏（涌流时抖动加快）
          const flowSpeed = 4.2 + surge * 7.5;
          state.spout1Lift = (SPOUT1_LOCAL.lift + Math.sin(t * flowSpeed) * (0.28 + surge * 0.35)) * sMul;
          state.spout2Lift = (SPOUT2_LOCAL.lift + Math.sin(t * flowSpeed + 1.6) * (0.28 + surge * 0.35)) * sMul;

          if (!vfx) return;

          const [topX, topY] = localToWorldXY(state.x, state.y, state.yaw, TOP_LOCAL.x * sMul, TOP_LOCAL.y * sMul);
          const [midX, midY] = localToWorldXY(state.x, state.y, state.yaw, MID_LOCAL.x * sMul, MID_LOCAL.y * sMul);
          const [botX, botY] = localToWorldXY(state.x, state.y, state.yaw, BOT_LOCAL.x * sMul, BOT_LOCAL.y * sMul);

          // 1. 顶层高热池持续上升柔和纯白热蒸汽粒（steam_surge 时成蓬翻卷）
          state.steamCd -= dt;
          const steamInt = action === 'steam_surge' ? 0.065 : 0.22;
          if (state.steamCd <= 0) {
            state.steamCd = steamInt;
            const burst = (action === 'steam_surge' && surge > 0.25) ? 3 : 1;
            for (let i = 0; i < burst; i++) {
              const a = Math.random() * TAU;
              const rr = Math.random() * (4.2 + surge * 2.5) * sMul;
              vfx.spawnParticle(
                topX + Math.cos(a) * rr,
                topY + Math.sin(a) * rr,
                (17.5 + Math.random() * 2.0) * sMul,
                (Math.cos(time * 0.8 + i) * 1.8 + (Math.random() - 0.5) * 1.8) * sMul,
                (Math.sin(time * 0.7 + i) * 1.6 + (Math.random() - 0.5) * 1.8) * sMul,
                (6.5 + Math.random() * 3.5 + surge * 5.2) * sMul,
                1.25 + Math.random() * 0.55,
                (2.0 + surge * 0.8) + Math.random() * 0.7,
                i % 2 === 0 ? fx.steamA : fx.steamB,
                false,
                -0.6
              );
            }
          }

          // 2. 三阶池面热波涟漪
          if (action === 'steam_surge') {
            const beats = [
              { t: 0.18, x: topX, y: topY, r1: 9.5,  sprayZ: 18.0 },
              { t: 0.72, x: midX, y: midY, r1: 12.0, sprayZ: 12.2 },
              { t: 1.28, x: botX, y: botY, r1: 15.5, sprayZ:  6.8 }
            ];
            while (state.surgeBeat < beats.length && actionTime >= beats[state.surgeBeat].t) {
              const b = beats[state.surgeBeat];
              vfx.addRipple(b.x, b.y, 2.2 * sMul, b.r1 * sMul, 1.1, 1.8);
              // 涌流激起几粒晶莹热水珠
              for (let k = 0; k < 5; k++) {
                const a = Math.random() * TAU;
                vfx.spawnParticle(
                  b.x + Math.cos(a) * 2.4 * sMul,
                  b.y + Math.sin(a) * 2.4 * sMul,
                  b.sprayZ * sMul,
                  Math.cos(a) * 3.8 * sMul,
                  Math.sin(a) * 3.8 * sMul,
                  (5.5 + Math.random() * 3.5) * sMul,
                  0.65,
                  1.15,
                  k % 2 === 0 ? fx.spray : fx.steamA,
                  false,
                  22
                );
              }
              state.surgeBeat++;
            }
          } else {
            state.rippleCd -= dt;
            if (state.rippleCd <= 0) {
              state.rippleCd = 1.45 / freq;
              const pick = Math.floor(time) % 3;
              const px = pick === 0 ? topX : (pick === 1 ? midX : botX);
              const py = pick === 0 ? topY : (pick === 1 ? midY : botY);
              vfx.addRipple(px, py, 1.5 * sMul, (7.5 + pick * 2.2) * sMul, 0.95, 1.3);
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;

          const [topX, topY] = localToWorldXY(state.x, state.y, yw, TOP_LOCAL.x * sMul, TOP_LOCAL.y * sMul);
          const [midX, midY] = localToWorldXY(state.x, state.y, yw, MID_LOCAL.x * sMul, MID_LOCAL.y * sMul);
          const [botX, botY] = localToWorldXY(state.x, state.y, yw, BOT_LOCAL.x * sMul, BOT_LOCAL.y * sMul);
          const [sp1X, sp1Y] = localToWorldXY(state.x, state.y, yw, SPOUT1_LOCAL.x * sMul, SPOUT1_LOCAL.y * sMul);
          const [sp2X, sp2Y] = localToWorldXY(state.x, state.y, yw, SPOUT2_LOCAL.x * sMul, SPOUT2_LOCAL.y * sMul);

          return [
            {
              partKey: 'tierBot',
              asset: parts.tierBot,
              x: botX,
              y: botY,
              lift: BOT_LOCAL.lift * sMul,
              ro: yw,
              bias: -0.20
            },
            {
              partKey: 'tierMid',
              asset: parts.tierMid,
              x: midX,
              y: midY,
              lift: MID_LOCAL.lift * sMul,
              ro: wrapAngle(yw + 0.08),
              bias: 0.0
            },
            {
              partKey: 'tierTop',
              asset: parts.tierTop,
              x: topX,
              y: topY,
              lift: TOP_LOCAL.lift * sMul,
              ro: wrapAngle(yw - 0.06),
              bias: 0.15
            },
            {
              partKey: 'overflowSpout',
              asset: parts.overflowSpout,
              x: sp1X,
              y: sp1Y,
              lift: state.spout1Lift,
              ro: yw,
              bias: 0.28
            },
            {
              partKey: 'overflowSpout',
              asset: parts.overflowSpout,
              x: sp2X,
              y: sp2Y,
              lift: state.spout2Lift,
              ro: wrapAngle(yw + 0.12),
              bias: 0.30
            }
          ];
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
