'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // B03 标杆 · 层间探索出口高耸石门（buildings/building_stone_gate.js）
  // -------------------------------------------------------------------------
  // 总高约 44 格，严格拆块保证每块 <= 34 格（左右石柱与双扇石门均复用同一套资产）：
  //   1. gateStep    (34×18×5,  symDeg: 180) : 阶梯石门槛与石门滑槽
  //   2. stonePillar (12×12×32, symDeg: 90)  : 对称粗方石柱（左右复用 + 苔藓浮雕）
  //   3. archLintel  (34×14×15, symDeg: 360) : 厚重拱形顶门楣（抬升至 z=29，总高 44 格）
  //   4. prismDim    (18×8×9,   symDeg: 360) : 沉睡暗槽三色棱晶（idle 态微暗）
  //   5. prismLit    (18×8×9,   symDeg: 360) : 激活自亮红绿蓝三色棱晶核（仅此进 glowKeys）
  //   6. gateDoor    (12×6×26,  symDeg: 360) : 独立雕纹厚重石门板（左右复用，可滑开推开）
  // 严禁常态 scaleX/scaleY 拉伸；仅棱晶/铭文亮核 4 色进 glowKeys；22 色 0 重色 0 禁用字
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 古石门主体花岗岩（3 档）
      stoneDark:  '#353e42',
      stoneMid:   '#556369',
      stoneHi:    '#82949c',
      // 浅切棱框与拱顶楔石（3 档）
      trimDark:   '#68757a',
      trimMid:    '#98a8ad',
      trimHi:     '#cad9de',
      // 深凿门缝与浮雕槽（3 档）
      grooveDark: '#1c2226',
      grooveMid:  '#2e383d',
      grooveHi:   '#46545c',
      // 古青铜门框包边与铆件（3 档，不进 glowKeys）
      bronzeDark: '#6b4c1d',
      bronzeMid:  '#a87a32',
      bronzeHi:   '#e0b458',
      // 攀附青苔浮雕（3 档）
      mossDark:   '#26542c',
      mossMid:    '#408543',
      mossHi:     '#75bf69',
      // 沉睡态未激活暗晶（3 档，不进 glowKeys）
      dimGemDark: '#262d36',
      dimGemMid:  '#3f4a59',
      dimGemHi:   '#617287',
      // 激活态红绿蓝三色棱晶与铭文亮核（仅此 4 键进 glowKeys）
      prismRed:   '#ff4252',
      prismGreen: '#33e685',
      prismBlue:  '#42a8ff',
      runeCore:   '#b8fff0'
    },
    glowKeys: ['prismRed', 'prismGreen', 'prismBlue', 'runeCore'],
    parts: ['stone', 'trim', 'groove', 'bronze', 'moss', 'dimGem', 'prism'],
    noCrease: [
      ['stone', 'trim'],
      ['stone', 'moss'],
      ['stone', 'bronze'],
      ['trim', 'bronze'],
      ['stone', 'prism'],
      ['trim', 'prism'],
      ['groove', 'prism']
    ],
    materials: {
      stone:  ['stoneDark',  'stoneMid',  'stoneHi'],
      trim:   ['trimDark',   'trimMid',   'trimHi'],
      groove: ['grooveDark', 'grooveMid', 'grooveHi'],
      bronze: ['bronzeDark', 'bronzeMid', 'bronzeHi'],
      moss:   ['mossDark',   'mossMid',   'mossHi'],
      dimGem: ['dimGemDark', 'dimGemMid', 'dimGemHi']
    },
    protectedParts: ['prism', 'bronze']
  });

  // 3 套零重建模换色皮肤（每套 22 色 0 重色 0 禁用字）
  const SKINS = [
    {
      id: 'forest_moss',
      name: '林地青苔石门',
      dot: '#556369',
      outline: '#0e1417',
      pal: {},
      fx: {
        dust:    '#9aa6a3',
        portalA: '#4ce6c2',
        portalB: '#ffdf78'
      }
    },
    {
      id: 'redrock_sand',
      name: '红岩沙城石门',
      dot: '#b8623d',
      outline: '#1c0f0a',
      pal: {
        stoneDark:  '#5c2d1e', stoneMid:  '#944c32', stoneHi:  '#cc734e',
        trimDark:   '#8f5e38', trimMid:   '#c78d58', trimHi:   '#f2c288',
        grooveDark: '#33170f', grooveMid: '#4f2418', grooveHi: '#733826',
        bronzeDark: '#235954', bronzeMid: '#378c82', bronzeHi: '#6ad1c3',
        mossDark:   '#6e6126', mossMid:   '#a6923c', mossHi:   '#d9c66a',
        dimGemDark: '#3d2824', dimGemMid: '#5e3f38', dimGemHi: '#875f55'
      },
      fx: {
        dust:    '#d4a87d',
        portalA: '#5ce6d0',
        portalB: '#ffd466'
      }
    },
    {
      id: 'obsidian_volcano',
      name: '黑曜火山石门',
      dot: '#303242',
      outline: '#09090e',
      pal: {
        stoneDark:  '#181924', stoneMid:  '#2c2e40', stoneHi:  '#484c66',
        trimDark:   '#44485e', trimMid:   '#6a708f', trimHi:   '#9ea6c7',
        grooveDark: '#0d0d14', grooveMid: '#1a1b29', grooveHi: '#2c2e42',
        bronzeDark: '#823b18', bronzeMid: '#cc6025', bronzeHi: '#ff9d4d',
        mossDark:   '#4d2621', mossMid:   '#7d3d32', mossHi:   '#b55d4a',
        dimGemDark: '#202230', dimGemMid: '#34384f', dimGemHi: '#515778'
      },
      fx: {
        dust:    '#7e8296',
        portalA: '#52e0ff',
        portalB: '#ffb84d'
      }
    }
  ];

  // 1. 阶梯石门槛与石门滑槽（34×18×5，对称 symDeg: 180）
  function buildGateStep(makeCanvas) {
    const W = 34, D = 18, H = 5;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-16, 16, -8, 8, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X), ay = Math.abs(Y);
      if (ax > 16.2 || ay > 8.2) return;
      // 阶梯收进：z=0..1 全宽踏步，z=2..3 内收踏阶，z=4 门槛主台面
      if (z >= 2 && ay > 6.2) return;
      if (z === 4 && ay > 4.4) return;

      // 中央石门滑槽（z=4, |Y|<=1.4, |X|<=13.5 凹下深槽）
      if (z === 4 && ay <= 1.3 && ax <= 13.5) {
        m.setRaw(x, y, z, mat('groove'), partId.groove);
        return;
      }
      // 门槛外缘浅石切棱
      const isEdge = (z === 1 && ay >= 7.0) || (z === 3 && ay >= 5.2) || (ax >= 15.0 && z <= 3);
      const isMoss = (z === 1 && ax >= 12.5 && ay >= 6.5);
      if (isMoss) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isEdge) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 17.5, headZ: H, centerZ: 2 });
  }

  // 2. 对称粗方石柱（12×12×32，严守 <= 34 格，左右复用同一资产 + 苔藓浮雕）
  function buildStonePillar(makeCanvas) {
    const W = 12, D = 12, H = 32;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5, 5, -5, 5, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(Math.round(X));
      const ay = Math.abs(Math.round(Y));
      const maxA = Math.max(ax, ay);
      const minA = Math.min(ax, ay);

      // 底部柱础（z = 0..4）与顶部柱头（z = 27..31）宽 11×11，柱身（z = 5..26）收为 9×9
      const limit = (z <= 4 || z >= 27) ? 5 : 4;
      if (maxA > limit) return;
      if (ax === limit && ay === limit && z >= 5 && z <= 26) return;

      // 柱础与柱头浅切棱
      if (z === 4 || z === 27 || z === 31) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
        return;
      }
      // 两道古青铜箍环（z = 11、z = 21）
      if ((z === 11 || z === 21) && maxA === limit) {
        m.setRaw(x, y, z, mat('bronze'), partId.bronze);
        return;
      }
      // 柱身四面竖向凹槽浮雕
      if (z >= 6 && z <= 25 && maxA === limit && minA === 0) {
        m.setRaw(x, y, z, mat('groove'), partId.groove);
        return;
      }
      // 对称角落青苔浮雕点缀
      if (maxA === limit && minA >= 2 && ((z >= 1 && z <= 3) || (z >= 23 && z <= 26) || (z >= 14 && z <= 16))) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
        return;
      }
      m.setRaw(x, y, z, mat('stone'), partId.stone);
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.5, headZ: H, centerZ: 16 });
  }

  // 3. 厚重拱形顶门楣（34×14×15，严守 <= 34 格，中央预留三色棱晶凹槽）
  function buildArchLintel(makeCanvas) {
    const W = 34, D = 14, H = 15;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-16, 16, -6, 6, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X), ay = Math.abs(Y);
      if (ax > 16.4 || ay > 5.8) return;

      // 阶梯状庄严拱顶外廓（中央高至 z=14，两侧逐级收至 z=9）
      const topLimit = ax <= 7.5 ? 14 : (ax <= 12.5 ? 12 : 10);
      if (z > topLimit) return;

      // 底部拱门洞口圆弧挖空（|X| < 9.5 时底部抬拱）
      if (ax < 9.2) {
        const archBot = Math.sqrt(Math.max(0, 1 - (ax / 9.2) * (ax / 9.2))) * 3.8;
        if (z < archBot) return;
      }

      // 中央前后双面三色棱晶镶嵌凹槽（|X|<=7.2, z=5..10, |Y|>=3.6 挖空留给棱晶部件）
      if (ax <= 7.2 && z >= 5 && z <= 10 && ay >= 3.6) {
        if (ay < 4.5) m.setRaw(x, y, z, mat('groove'), partId.groove);
        return;
      }

      // 拱眉外框切棱与顶冠青铜镶纹
      const isCrown = (z === topLimit) || (z === topLimit - 1 && ay >= 4.6);
      const isBronze = (Math.abs(ax - 8.2) <= 0.8 && z >= 4 && z <= 11) || (ax <= 2.2 && z === topLimit);
      const isMoss = (ax >= 11.5 && z >= topLimit - 2 && ay >= 3.5);
      if (isBronze) {
        m.setRaw(x, y, z, mat('bronze'), partId.bronze);
      } else if (isMoss) {
        m.setRaw(x, y, z, mat('moss'), partId.moss);
      } else if (isCrown) {
        m.setRaw(x, y, z, mat('trim'), partId.trim);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 17.0, headZ: H, centerZ: 7 });
  }

  // 4. 顶门楣三色棱晶凹槽件（18×12×9，分沉睡暗槽与激活自亮两套）
  function buildPrismCluster(makeCanvas, isLit) {
    const W = 18, D = 12, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 左红 / 中绿 / 右蓝 三颗菱形棱晶（前后双面突出，俯视 360° 均清晰可见）
    const prisms = [
      { cx: -5.0, cz: 4.0, r: 2.0, glowKey: 'prismRed' },
      { cx:  0.0, cz: 4.6, r: 2.3, glowKey: 'prismGreen' },
      { cx:  5.0, cz: 4.0, r: 2.0, glowKey: 'prismBlue' }
    ];

    for (const p of prisms) {
      for (const sideY of [-4.6, 4.6]) {
        m.fillAABB(p.cx - 3, p.cx + 3, sideY - 2, sideY + 2, 0, H - 1, (x, y, z, X, Y) => {
          const dx = Math.abs(X - p.cx);
          const dy = Math.abs(Y - sideY);
          const dz = Math.abs(z - p.cz);
          if (dx / p.r + dz / (p.r * 1.25) + dy / 1.6 > 1.0) return;

          if (isLit) {
            const isCore = (dx <= 0.65 && dz <= 0.85);
            m.setRaw(x, y, z, isCore ? keyToId.runeCore : keyToId[p.glowKey], partId.prism);
          } else {
            m.setRaw(x, y, z, mat('dimGem'), partId.dimGem);
          }
        });
      }
    }

    // 激活态附加连接三颗棱晶的横向自亮铭文细线
    if (isLit) {
      for (const sideY of [-4.5, 4.5]) {
        m.fillAABB(-6, 6, sideY - 1, sideY + 1, 3, 5, (x, y, z, X, Y) => {
          if (Math.abs(Y - sideY) <= 0.6 && z === 4 && Math.abs(X) <= 5.2) {
            if (!m.getId(x, y, z)) m.setRaw(x, y, z, keyToId.runeCore, partId.prism);
          }
        });
      }
    }

    m.despeckle();
    if (!isLit) m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.5, headZ: H, centerZ: 4 });
  }

  // 5. 独立雕纹厚重石门板（12×6×26，严守 <= 34 格，左右两扇复用同一资产）
  function buildGateDoor(makeCanvas) {
    const W = 12, D = 6, H = 26;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-5, 5, -2, 2, 0, H - 1, (x, y, z, X, Y) => {
      const ax = Math.abs(X), ay = Math.abs(Y);
      if (ax > 5.4 || ay > 2.2) return;

      // 外圈青铜厚门框与中横铜带
      const isFrame = (ax >= 4.4) || (z <= 1) || (z >= H - 2) || (z >= 12 && z <= 13);
      // 门面几何凹雕回字纹
      const isGroove = (ay >= 1.4 && ax >= 2.0 && ax <= 3.2 && ((z >= 4 && z <= 10) || (z >= 15 && z <= 22)));
      // 门环扣（居中偏内侧）
      const isRing = (ay >= 1.4 && ax <= 1.2 && z >= 11 && z <= 14);

      if (isRing) {
        m.setRaw(x, y, z, mat('bronze'), partId.bronze);
      } else if (isFrame) {
        m.setRaw(x, y, z, (z === 12 || z === 13 || ax >= 4.8) ? mat('bronze') : mat('trim'), (z === 12 || z === 13 || ax >= 4.8) ? partId.bronze : partId.trim);
      } else if (isGroove) {
        m.setRaw(x, y, z, mat('groove'), partId.groove);
      } else {
        m.setRaw(x, y, z, mat('stone'), partId.stone);
      }
    });

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.0, headZ: H, centerZ: 13 });
  }

  // =========================================================================
  // 资产定义：B03 层间探索出口石门（注册为 'building'）
  // =========================================================================
  const BuildingStoneGateDef = {
    id: 'building_stone_gate',
    code: 'B03',
    name: '层间探索出口石门',
    status: 'done',
    tag: 'B03 标杆 · 层间出口高耸石门',
    summary: '总高 44 格、单块严守 <=34 格的庄严石门：左右复用粗方石柱、拱形顶门楣（中央镶红绿蓝三色棱晶槽）、左右复用可滑推雕纹石门板与石阶；支持沉睡关闭、棱晶自亮推门扬尘与持续开启三态及 3 套换色皮肤',
    defaultHabitat: 'ruins',
    footRadius: 23.5,
    ecoWeight: 2.4,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: [
      '左右复用 12×12×32 粗方石柱（苔藓浮雕与青铜箍环）',
      '34×14×15 拱形顶门楣抬升拼出 44 格俯视纵深高度',
      '中央红绿蓝三色棱晶凹槽（仅激活亮核进 glowKeys）',
      '左右复用 12×6×26 独立雕纹石门板滑开/推开 + 石屑扬尘',
      '林地青苔 / 红岩沙城 / 黑曜火山 3 套换色皮肤'
    ],
    actions: [
      { id: 'idle',        name: '沉睡关闭（门紧闭+暗槽）', loop: true,  status: 'done' },
      { id: 'unlock_open', name: '解锁开启（棱晶亮+推门）', loop: false, duration: 3.0, status: 'done' },
      { id: 'opened',      name: '开启通行（敞开+青金粒）', loop: true,  status: 'done' }
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
        gateStep:    buildGateStep(makeCanvas),
        stonePillar: buildStonePillar(makeCanvas),
        archLintel:  buildArchLintel(makeCanvas),
        prismDim:    buildPrismCluster(makeCanvas, false),
        prismLit:    buildPrismCluster(makeCanvas, true),
        gateDoor:    buildGateDoor(makeCanvas)
      };

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0.22;
      let curSkin = SKINS[0];

      const state = {
        x: hx0,
        y: hy0,
        z: 0,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        shadowScale: 1.0,
        action: 'idle',
        openFactor: 0, // 0 = 紧闭, 1 = 全开
        isLit: false,
        rumbleX: 0,
        dustCd: 0,
        portalCd: 0
      };

      const instance = {
        def: BuildingStoneGateDef,
        cachePrefix: `building_stone_gate_${Math.random().toString(36).slice(2, 7)}`,
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

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 0;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.openFactor = 0;
          state.isLit = false;
          state.rumbleX = 0;
          state.dustCd = 0;
          state.portalCd = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          state.action = action;
          state.rumbleX = 0;

          if (action === 'idle') {
            state.openFactor = 0;
            state.isLit = false;
          } else if (action === 'opened') {
            state.openFactor = 1;
            state.isLit = true;
          } else if (action === 'unlock_open') {
            // 3.0 秒解锁演出：0~0.45s 顶槽棱晶骤亮 -> 0.45~2.35s 双扇石门震颤推开并扬尘 -> 2.35~3.0s 敞开通畅
            const u = clamp(actionTime / 3.0, 0, 1);
            state.isLit = (u >= 0.08);
            const slideU = smoothstep(0.15, 0.78, u);
            state.openFactor = slideU;

            const isSliding = (u > 0.15 && u < 0.78);
            if (isSliding) {
              state.rumbleX = Math.sin(time * 42.0 * freq) * 0.45 * sMul;
              state.dustCd -= dt;
              if (vfx && state.dustCd <= 0) {
                state.dustCd = 0.09;
                for (const side of [-1, 1]) {
                  const doorLx = side * (5.6 + slideU * 6.8) * sMul;
                  const [dx, dy] = localToWorldXY(state.x, state.y, state.yaw, doorLx, 0);
                  vfx.spawnParticle(
                    dx + (Math.random() - 0.5) * 3.0 * sMul,
                    dy + (Math.random() - 0.5) * 3.0 * sMul,
                    3.2 * sMul,
                    (Math.random() - 0.5) * 7.5 * sMul,
                    (Math.random() - 0.5) * 7.5 * sMul,
                    (5.0 + Math.random() * 6.0) * sMul,
                    0.55 + Math.random() * 0.25,
                    1.5 + Math.random() * 0.7,
                    fx.dust,
                    false,
                    22
                  );
                }
              }
            }
          }

          // 门扇开启超过 35% 时，门洞内持续涌出柔和青金通行微粒
          if (vfx && state.openFactor > 0.35) {
            state.portalCd -= dt;
            const interval = (action === 'unlock_open') ? 0.075 : 0.14;
            if (state.portalCd <= 0) {
              state.portalCd = interval;
              const rx = (Math.random() - 0.5) * 14.0 * state.openFactor * sMul;
              const ry = (Math.random() - 0.5) * 4.5 * sMul;
              const [px, py] = localToWorldXY(state.x, state.y, state.yaw, rx, ry);
              const useGold = Math.random() > 0.55;
              vfx.spawnParticle(
                px, py, (4.5 + Math.random() * 18.0) * sMul,
                (Math.random() - 0.5) * 2.2 * sMul,
                (3.0 + Math.random() * 3.5) * sMul,
                (4.5 + Math.random() * 5.5) * sMul,
                0.95 + Math.random() * 0.45,
                1.1 + Math.random() * 0.45,
                useGold ? fx.portalB : fx.portalA,
                true,
                -1.2
              );
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const [lpX, lpY] = localToWorldXY(state.x, state.y, state.yaw, -13.5 * sMul, 0);
          const [rpX, rpY] = localToWorldXY(state.x, state.y, state.yaw,  13.5 * sMul, 0);

          // 双扇石门：闭合时贴合在 lx = ±5.5，开启时向两侧滑出并略微向内推开
          const slideDist = state.openFactor * 7.0 * sMul;
          const swingInY = -state.openFactor * 3.2 * sMul;
          const swingAng = state.openFactor * 0.34;

          const [ldX, ldY] = localToWorldXY(state.x, state.y, state.yaw, -5.5 * sMul - slideDist + state.rumbleX, swingInY);
          const [rdX, rdY] = localToWorldXY(state.x, state.y, state.yaw,  5.5 * sMul + slideDist - state.rumbleX, swingInY);

          const list = [
            {
              partKey: 'gateStep',
              asset: parts.gateStep,
              x: state.x,
              y: state.y,
              lift: 0,
              ro: state.yaw,
              symDeg: 180,
              bias: -0.40
            },
            {
              partKey: 'gateDoorL',
              asset: parts.gateDoor,
              x: ldX,
              y: ldY,
              lift: 3.6 * sMul,
              ro: state.yaw - swingAng,
              symDeg: 360,
              bias: -0.10
            },
            {
              partKey: 'gateDoorR',
              asset: parts.gateDoor,
              x: rdX,
              y: rdY,
              lift: 3.6 * sMul,
              ro: state.yaw + Math.PI + swingAng,
              symDeg: 360,
              bias: -0.10
            },
            {
              partKey: 'stonePillarL',
              asset: parts.stonePillar,
              x: lpX,
              y: lpY,
              lift: 2.2 * sMul,
              ro: state.yaw,
              symDeg: 90,
              bias: 0.15
            },
            {
              partKey: 'stonePillarR',
              asset: parts.stonePillar,
              x: rpX,
              y: rpY,
              lift: 2.2 * sMul,
              ro: state.yaw,
              symDeg: 90,
              bias: 0.15
            },
            {
              partKey: 'archLintel',
              asset: parts.archLintel,
              x: state.x,
              y: state.y,
              lift: 29.0 * sMul,
              ro: state.yaw,
              symDeg: 360,
              bias: 0.35
            },
            {
              partKey: state.isLit ? 'prismLit' : 'prismDim',
              asset: state.isLit ? parts.prismLit : parts.prismDim,
              x: state.x,
              y: state.y,
              lift: 32.5 * sMul,
              ro: state.yaw,
              symDeg: 360,
              bias: 0.45
            }
          ];

          return list;
        },

        exportManifest(params) {
          return {
            id: BuildingStoneGateDef.id,
            code: BuildingStoneGateDef.code,
            name: BuildingStoneGateDef.name,
            status: BuildingStoneGateDef.status,
            skin: curSkin.id,
            action: state.action,
            openFactor: Number(state.openFactor.toFixed(2)),
            footRadius: BuildingStoneGateDef.footRadius,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Assets.register(BuildingStoneGateDef, 'building');
})(window.PixelWorkshop);
