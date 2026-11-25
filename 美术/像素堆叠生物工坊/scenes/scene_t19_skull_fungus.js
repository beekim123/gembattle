'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T19 · 残椎骨堆与淡青腐菌丛（scenes/scene_t19_skull_fungus.js）
  //
  // 生态呼应（文档/生态设计数据.js T19 carcass）：
  //   - 半埋黑褐腐土中的 3 节巨大空心脊椎骨环（清晰圆骨孔供 地9 骨群钻进躲藏）；
  //   - 骨环缝隙里簇生饱满淡青色自亮腐菌菇群（仅伞底菌褶核 gillCore 进 glowKeys）；
  //   - 顶部盘旋几粒极小飞虫微粒（呼应生态食物网：喂 特2 洞窟翼蝠！）。
  //
  // 拆件与图集预算（单盒严格 <= 34 格）：
  //   - humusMound     (34×26×6) ：黑褐腐土半埋底座 + 散落碎骨碴与暗苔
  //   - vertebraLarge  (20×18×16)：巨大空心脊椎骨环（贯通大圆骨孔 + 背棘翼突）
  //   - vertebraSmall  (16×14×13)：斜倚半埋次级脊椎骨环（复用 2 节错角摆放）
  //   - fungusClusterA (14×14×12)：主大伞淡青腐菌丛（仅伞底菌褶核进 glowKeys）
  //   - fungusClusterB (10×10×9, symDeg: 90)：侧翼中小型腐菌菇簇（复用 2 簇）
  //   - flyDot         (3×3×3,   symDeg: 90, noOutline: true)：顶部绕飞的小飞虫微粒件
  //
  // 展示动作：
  //   - idle        ：飞虫微粒在骨缝上空绕飞、菌群微微呼吸
  //   - puff_spores ：大菌伞微颤喷出一股淡青孢子云粒
  // =========================================================================

  // 23 色独立色表（<= 48 色、0 重色、仅 gillCore 进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 黑褐腐土底墩（3 阶）
      soilDark:  '#1e150f',
      soilMid:   '#36261b',
      soilHi:    '#543d2b',
      // 象牙白巨蛇脊椎骨（3 阶）
      boneDark:  '#998f7c',
      boneMid:   '#d6ccb8',
      boneHi:    '#f5efe0',
      // 骨缝与椎孔暗褐深槽（3 阶）
      crackDark: '#2e2119',
      crackMid:  '#523c2e',
      crackHi:   '#7a5d48',
      // 淡青腐菌饱满伞盖（3 阶）
      capDark:   '#1e635c',
      capMid:    '#3cb0a1',
      capHi:     '#82ebd8',
      // 菌伞边缘浅斑（2 阶）
      spotMid:   '#aef7e8',
      spotHi:    '#dcfcf5',
      // 浅米菌柄（3 阶）
      stemDark:  '#857e68',
      stemMid:   '#bfb79b',
      stemHi:    '#ebe4cb',
      // 伞底自亮菌褶核（唯一自亮键，进 glowKeys）
      gillCore:  '#9effef',
      // 骨边微苔与腐膜（3 阶）
      mossDark:  '#244034',
      mossMid:   '#3d6b57',
      mossHi:    '#68a388',
      // 顶部绕飞小飞虫（2 阶，不进 glowKeys）
      flyDark:   '#241f1c',
      flyMid:    '#6e6252'
    },
    glowKeys: ['gillCore'],
    parts: ['soil', 'bone', 'crack', 'cap', 'spot', 'stem', 'gill', 'moss', 'fly'],
    noCrease: [
      ['bone', 'crack'], ['soil', 'moss'], ['cap', 'spot'],
      ['cap', 'gill'], ['stem', 'gill']
    ],
    materials: {
      soil:  ['soilDark',  'soilMid',  'soilHi'],
      bone:  ['boneDark',  'boneMid',  'boneHi'],
      crack: ['crackDark', 'crackMid', 'crackHi'],
      cap:   ['capDark',   'capMid',   'capHi'],
      spot:  ['spotMid',   'spotHi',   'spotHi'],
      stem:  ['stemDark',  'stemMid',  'stemHi'],
      gill:  ['gillCore',  'gillCore', 'gillCore'],
      moss:  ['mossDark',  'mossMid',  'mossHi'],
      fly:   ['flyDark',   'flyMid',   'flyMid']
    },
    protectedParts: ['crack', 'gill', 'spot', 'fly']
  });

  // 3 套零重建模换色皮肤（淡青腐菌、赭红肉菇、惨白风化骨；0 禁用字）
  const SKINS = [
    {
      id: 'cyan_rot_fungus',
      name: '淡青腐菌',
      dot: '#3cb0a1',
      outline: '#0f1716',
      pal: {},
      fx: { sporeA: '#82ebd8', sporeB: '#dcfcf5', fly: '#8f816b' }
    },
    {
      id: 'ochre_flesh_shroom',
      name: '赭红肉菇',
      dot: '#cc5233',
      outline: '#1c0f0c',
      pal: {
        boneDark:  '#a68f74', boneMid:  '#dec7a4', boneHi:  '#f7ead0',
        crackDark: '#471b16', crackMid: '#783228', crackHi: '#a84e3e',
        capDark:   '#782018', capMid:   '#c7432a', capHi:   '#f58356',
        spotMid:   '#f7b279', spotHi:   '#ffe1ba',
        stemDark:  '#8c6a54', stemMid:  '#c79e81', stemHi:  '#f0cfb4',
        gillCore:  '#ffaa70',
        mossDark:  '#4a2b1c', mossMid:  '#7a4b32', mossHi:  '#ad7350'
      },
      fx: { sporeA: '#f58356', sporeB: '#ffe1ba', fly: '#997c65' }
    },
    {
      id: 'bleached_weathered_bone',
      name: '惨白风化骨',
      dot: '#e3e8eb',
      outline: '#15181c',
      pal: {
        soilDark:  '#242221', soilMid:  '#3d3937', soilHi:  '#5c5652',
        boneDark:  '#a8afb5', boneMid:  '#dde3e8', boneHi:  '#fafdff',
        crackDark: '#3c434a', crackMid: '#636d78', crackHi: '#8f9ba6',
        capDark:   '#3b6375', capMid:   '#6ea4bd', capHi:   '#b5e0f2',
        spotMid:   '#d4f1fc', spotHi:   '#f2fbff',
        stemDark:  '#8b969c', stemMid:  '#c2ced4', stemHi:  '#e8f1f5',
        gillCore:  '#c7f2ff',
        mossDark:  '#324a4f', mossMid:  '#537880', mossHi:  '#85b0b8'
      },
      fx: { sporeA: '#b5e0f2', sporeB: '#f2fbff', fly: '#8f9ba6' }
    }
  ];

  // =========================================================================
  // 1. 体素建模
  // =========================================================================

  // 1) 黑褐腐土半埋底座（34×26×6）
  function buildHumusMound(makeCanvas) {
    const m = new VoxelModel(34, 26, 6, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-16.2, 16.2, -12.2, 12.2, 0, 5, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const bump = Math.sin(ang * 5) * 0.9 + Math.cos(ang * 3) * 0.6;
      const rx = 14.8 - z * 1.15 + bump;
      const ry = 10.8 - z * 0.85 + bump * 0.7;
      const d = Math.hypot(X / Math.max(1, rx), Y / Math.max(1, ry));
      if (d > 1.0) return;
      const isMoss = z >= 3 && Math.sin(X * 0.35 + Y * 0.45) > 0.48;
      m.setRaw(x, y, z, isMoss ? mat('moss') : mat('soil'), isMoss ? partId.moss : partId.soil);
    });

    // 腐土边点缀两块露土碎骨碴
    m.paintCapsule(-11.5, 5.2, 2.2, -8.2, 6.8, 2.6, 1.15, 0.85, mat('bone'), partId.bone, true);
    m.paintCapsule( 10.8, -5.6, 2.0, 13.4, -3.5, 2.4, 1.05, 0.80, mat('bone'), partId.bone, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 15.5, headZ: 5, centerZ: 3 });
  }

  // 2) 巨大空心脊椎骨环（20×18×16 或 16×14×13，清晰贯通大圆骨孔供 地9 骨群钻藏！）
  function buildVertebraRing(makeCanvas, isLarge) {
    const W = isLarge ? 20 : 16;
    const D = isLarge ? 18 : 14;
    const H = isLarge ? 16 : 13;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;

    const halfW = W * 0.5 - 1.2;
    const halfD = D * 0.5 - 1.2;
    const ringZ = isLarge ? 7.4 : 6.0;
    const outerR = isLarge ? 6.8 : 5.4;
    const holeR  = isLarge ? 3.5 : 2.6; // 清晰宽敞的圆骨孔！
    const halfThickY = isLarge ? 5.2 : 4.0;

    // 主空心椎体骨环（圆孔沿 Y 轴贯通，俯视与侧视均能一眼看穿空心骨孔）
    m.fillAABB(-halfW, halfW, -halfD, halfD, 1, H - 2, (x, y, z, X, Y) => {
      const ay = Math.abs(Y);
      if (ay > halfThickY) return;
      const rRing = Math.hypot(X, z - ringZ);
      // 骨环两端略外翻呈脊椎关节盘
      const flare = smoothstep(halfThickY * 0.5, halfThickY, ay) * 0.9;
      if (rRing > outerR + flare || rRing < holeR) return;

      const isInnerWall = rRing < holeR + 1.15;
      const isCrack = (Math.abs(Y) < 0.75 && z > ringZ + 1.5) || (Math.abs(X) < 0.75 && z < ringZ - 2.0);
      if (isInnerWall || isCrack) {
        m.setRaw(x, y, z, mat('crack'), partId.crack);
      } else {
        m.setRaw(x, y, z, mat('bone'), partId.bone);
      }
    });

    // 顶部粗壮背棘 + 左右斜出横突（一眼辨识为巨蛇脊椎骨！）
    const topZ = isLarge ? 14.4 : 11.6;
    m.paintCapsule(0, -1.2, ringZ + outerR - 1.0, 0, -2.6, topZ, isLarge ? 1.8 : 1.45, 1.0, mat('bone'), partId.bone, true);
    for (const s of [-1, 1]) {
      m.paintCapsule(
        s * (outerR - 0.8), 0, ringZ - 0.6,
        s * (halfW - 0.4), -1.4, ringZ + 1.4,
        isLarge ? 1.75 : 1.35, 0.95, mat('bone'), partId.bone, true
      );
    }

    // 椎体底座微附暗苔
    m.paintEllipsoid(0, 2.2, 2.0, outerR * 0.65, 2.6, 1.4, mat('moss'), partId.moss, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: halfW, headZ: H - 1, centerZ: Math.round(H * 0.5) });
  }

  // 3) 淡青自亮腐菌丛（大簇 14×14×12 / 侧簇 10×10×9，仅伞底菌褶核 gillCore 进 glowKeys）
  function buildFungusCluster(makeCanvas, isMain) {
    const W = isMain ? 14 : 10;
    const D = isMain ? 14 : 10;
    const H = isMain ? 12 : 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    const shrooms = isMain
      ? [
          { x:  0.0, y:  0.0, h: 9.2, capR: 4.5, capH: 2.6 },
          { x: -3.8, y:  2.4, h: 6.4, capR: 2.9, capH: 1.9 },
          { x:  3.6, y: -2.2, h: 5.8, capR: 2.7, capH: 1.8 }
        ]
      : [
          { x:  0.0, y:  0.0, h: 6.6, capR: 3.3, capH: 2.0 },
          { x: -2.2, y:  1.8, h: 4.4, capR: 2.0, capH: 1.4 },
          { x:  2.2, y: -1.8, h: 4.4, capR: 2.0, capH: 1.4 }
        ];

    for (const sh of shrooms) {
      // 浅米菌柄
      m.paintCapsule(sh.x, sh.y, 0.6, sh.x, sh.y, sh.h - 1.0, sh.capR * 0.34, sh.capR * 0.28, mat('stem'), partId.stem, true);
      // 伞底自亮菌褶核（仅这一层进 glowKeys，发出淡淡青色微亮）
      m.paintEllipsoid(sh.x, sh.y, sh.h - 1.0, sh.capR * 0.72, sh.capR * 0.72, 0.75, keyToId.gillCore, partId.gill, true);
      // 饱满圆润淡青菌伞盖
      m.paintEllipsoid(sh.x, sh.y, sh.h + 0.2, sh.capR, sh.capR, sh.capH, mat('cap'), partId.cap, true);
      // 伞顶浅青亮斑点缀（不进 glowKeys，俯视层次分明）
      m.paintEllipsoid(sh.x + sh.capR * 0.32, sh.y - sh.capR * 0.24, sh.h + sh.capH * 0.68, sh.capR * 0.28, sh.capR * 0.28, 0.65, mat('spot'), partId.spot, true);
      m.paintEllipsoid(sh.x - sh.capR * 0.35, sh.y + sh.capR * 0.28, sh.h + sh.capH * 0.58, sh.capR * 0.22, sh.capR * 0.22, 0.55, mat('spot'), partId.spot, true);
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: W * 0.44, headZ: H - 1, centerZ: Math.round(H * 0.5) });
  }

  // 4) 顶部绕飞小飞虫微粒件（3×3×3，symDeg: 90，noOutline: true，喂 特2 洞窟翼蝠）
  function buildFlyDot(makeCanvas) {
    const m = new VoxelModel(3, 3, 3, SPEC);
    const { keyToId, partId } = SPEC;
    m.setRaw(1, 1, 1, keyToId.flyDark, partId.fly);
    m.setRaw(0, 1, 1, keyToId.flyMid, partId.fly);
    m.setRaw(2, 1, 1, keyToId.flyMid, partId.fly);
    return m.toStripAsset(makeCanvas, { footRadius: 1.5, headZ: 2, centerZ: 1 });
  }

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t19_skull_fungus',
    code: 'T19',
    name: '残椎骨堆与淡青腐菌丛',
    status: 'done',
    defaultHabitat: 'carcass',
    tag: 'T19 巨兽遗骸 · 空心残椎与自亮腐菌',
    summary: '半埋黑褐腐土中的 3 节巨大空心脊椎骨环（留有可供 地9 骨群躲藏的圆骨孔），缝隙簇生饱满淡青自亮腐菌菇群，顶部盘旋几粒极小飞虫微粒供 特2 捕食',
    footRadius: 16.5,
    ecoWeight: 3.5,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',        name: '腐菌微息与飞虫绕飞', loop: true,  status: 'done' },
      { id: 'puff_spores', name: '菌伞喷孢',           loop: false, duration: 2.2, status: 'done' }
    ],
    blocks: ['3 节空心脊椎骨环', '淡青自亮腐菌菇群', '顶部绕飞飞虫与喷孢云粒'],
    soulHabit: '几粒小飞虫在半埋空心残椎骨缝间不停绕飞，淡青腐菌随呼吸微微起伏；受扰时大菌伞微颤喷出一股淡青孢子云粒',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        humusMound:     buildHumusMound(makeCanvas),
        vertebraLarge:  buildVertebraRing(makeCanvas, true),
        vertebraSmall:  buildVertebraRing(makeCanvas, false),
        fungusClusterA: buildFungusCluster(makeCanvas, true),
        fungusClusterB: buildFungusCluster(makeCanvas, false),
        flyDot:         buildFlyDot(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        time: 0,
        capBreathZ: 0,
        capTremorX: 0,
        flyScatter: 0,
        idleMoteClock: 1.0,
        lastAction: 'idle',
        puffFired: 0
      };

      let curSkin = SKINS[0];

      function spawnSporePuff(vfx, sMul, burst) {
        if (!vfx) return;
        const fx = curSkin.fx || SKINS[0].fx;
        const count = burst ? 9 : 1;
        for (let i = 0; i < count; i++) {
          const a = Math.random() * TAU;
          const spd = (burst ? (4.5 + Math.random() * 7.5) : 1.8) * sMul;
          const [wx, wy] = localToWorldXY(state.x, state.y, state.yaw, 2.5 * sMul, 1.5 * sMul);
          vfx.spawnParticle(
            wx + Math.cos(a) * 2.5 * sMul,
            wy + Math.sin(a) * 2.5 * sMul,
            (11.5 + Math.random() * 2.5) * sMul,
            Math.cos(a) * spd,
            Math.sin(a) * spd,
            (burst ? (6.5 + Math.random() * 5.0) : 2.2) * sMul,
            burst ? (1.15 + Math.random() * 0.55) : 1.5,
            burst ? (1.35 + Math.random() * 0.35) : 1.0,
            i % 2 === 0 ? fx.sporeA : fx.sporeB,
            true,
            burst ? 3.5 : -1.0
          );
        }
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
          state.capBreathZ = 0;
          state.capTremorX = 0;
          state.flyScatter = 0;
          state.idleMoteClock = 1.0;
          state.lastAction = 'idle';
          state.puffFired = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          state.time = time * gFreq;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.puffFired = 0;
          }

          if (action === 'puff_spores') {
            // 0..0.45s 菌伞微颤蓄力 -> 0.45s & 0.85s 喷出两股淡青孢子云粒 -> 飞虫短促散开
            const u = clamp(actionTime / 2.2, 0, 1);
            const shiverEnv = Math.sin(clamp(u / 0.55, 0, 1) * Math.PI);
            state.capTremorX = Math.sin(actionTime * 44.0 * gFreq) * 0.48 * shiverEnv * sMul;
            state.capBreathZ = Math.sin(u * Math.PI) * 0.55 * sMul;
            state.flyScatter = Math.sin(clamp((actionTime - 0.35) / 1.4, 0, 1) * Math.PI) * 5.2 * sMul;

            const puffTimes = [0.42, 0.86];
            while (state.puffFired < puffTimes.length && actionTime >= puffTimes[state.puffFired]) {
              spawnSporePuff(vfx, sMul, true);
              state.puffFired++;
            }
          } else {
            state.capTremorX = 0;
            state.capBreathZ = Math.sin(time * 2.1 * gFreq) * 0.24 * sMul;
            state.flyScatter = lerp(state.flyScatter, 0, clamp(dt * 5.0, 0, 1));

            state.idleMoteClock -= dt;
            if (state.idleMoteClock <= 0) {
              state.idleMoteClock = 1.4 + Math.random() * 1.1;
              spawnSporePuff(vfx, sMul, false);
            }
          }
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.time;

          // 1. 黑褐腐土半埋底座
          list.push({
            partKey: 'humusMound',
            asset: parts.humusMound,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            bias: -0.45
          });

          // 2. 3 节半埋空心脊椎骨环（错角斜倚，留出清晰圆骨孔给 地9 骨群躲藏）
          const [v1x, v1y] = localToWorldXY(state.x, state.y, yw, -3.6 * sMul, -1.2 * sMul);
          list.push({
            partKey: 'vertebraLarge',
            asset: parts.vertebraLarge,
            x: v1x, y: v1y,
            lift: 1.0 * sMul,
            ro: wrapAngle(yw + 0.28),
            bias: 0.10
          });

          const [v2x, v2y] = localToWorldXY(state.x, state.y, yw, 8.2 * sMul, -4.4 * sMul);
          list.push({
            partKey: 'vertebraSmall',
            asset: parts.vertebraSmall,
            x: v2x, y: v2y,
            lift: 0.4 * sMul,
            ro: wrapAngle(yw - 0.62),
            bias: 0.02
          });

          const [v3x, v3y] = localToWorldXY(state.x, state.y, yw, -10.2 * sMul, 5.4 * sMul);
          list.push({
            partKey: 'vertebraSmall',
            asset: parts.vertebraSmall,
            x: v3x, y: v3y,
            lift: -1.4 * sMul,
            ro: wrapAngle(yw + 1.18),
            bias: -0.04
          });

          // 3. 骨环缝隙簇生的淡青自亮腐菌菇群（1 大主簇 + 2 侧簇）
          const [fAx, fAy] = localToWorldXY(state.x, state.y, yw, 3.2 * sMul, 3.2 * sMul);
          list.push({
            partKey: 'fungusClusterA',
            asset: parts.fungusClusterA,
            x: fAx + state.capTremorX,
            y: fAy,
            lift: Math.max(0.8 * sMul, 2.2 * sMul + state.capBreathZ),
            ro: wrapAngle(yw + 0.15),
            bias: 0.42
          });

          const [fB1x, fB1y] = localToWorldXY(state.x, state.y, yw, -8.5 * sMul, -5.8 * sMul);
          list.push({
            partKey: 'fungusClusterB',
            asset: parts.fungusClusterB,
            x: fB1x + state.capTremorX * 0.6,
            y: fB1y,
            lift: Math.max(0.5 * sMul, 1.6 * sMul + state.capBreathZ * 0.7),
            ro: wrapAngle(yw + 0.8),
            bias: 0.30,
            symDeg: 90
          });

          const [fB2x, fB2y] = localToWorldXY(state.x, state.y, yw, 9.6 * sMul, 4.8 * sMul);
          list.push({
            partKey: 'fungusClusterB',
            asset: parts.fungusClusterB,
            x: fB2x - state.capTremorX * 0.5,
            y: fB2y,
            lift: Math.max(0.4 * sMul, 1.4 * sMul - state.capBreathZ * 0.6),
            ro: wrapAngle(yw + 2.1),
            bias: 0.28,
            symDeg: 90
          });

          // 4. 顶部绕飞的 4 粒极小飞虫微粒（noOutline: true，喂 特2 洞窟翼蝠）
          const flies = [
            { r: 5.5, spd:  2.4, ph: 0.0, zBase: 17.5, zAmp: 1.6 },
            { r: 7.2, spd: -2.0, ph: 1.9, zBase: 19.2, zAmp: 1.9 },
            { r: 4.2, spd:  3.1, ph: 3.7, zBase: 15.8, zAmp: 1.3 },
            { r: 8.6, spd:  1.7, ph: 5.1, zBase: 18.4, zAmp: 1.5 }
          ];
          for (let i = 0; i < flies.length; i++) {
            const fl = flies[i];
            const ang = t * fl.spd + fl.ph;
            const rad = fl.r * sMul + state.flyScatter;
            const [fx, fy] = localToWorldXY(state.x, state.y, yw, Math.cos(ang) * rad, Math.sin(ang * 1.35) * rad * 0.78);
            const fz = (fl.zBase + Math.sin(t * 3.8 + fl.ph) * fl.zAmp) * sMul + state.flyScatter * 0.5;
            list.push({
              partKey: 'flyDot',
              asset: parts.flyDot,
              x: fx, y: fy,
              lift: fz,
              ro: ang,
              noOutline: true,
              bias: 2.2 + i * 0.05,
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
