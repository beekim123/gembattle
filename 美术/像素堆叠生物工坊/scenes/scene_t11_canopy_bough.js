'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T11 核心地貌 · 巨木苔皮横枝与空中积水洼（T11 巨木树冠）
  //
  // 精准还原 T11 规矩「树冠厚到能走，树冠上有自己的一层土和水洼」：
  // 拆件与图集预算（横枝拆为 2 块无缝拼合，单块严格 <= 34 格）：
  //   - boughWest    (32×26×18)：左段粗壮赤褐横枝 + 覆厚翠苔与深棕落叶腐土层 + 池西沿
  //   - boughEast    (32×26×18)：右段粗壮赤褐横枝 + 凹陷处澄碧高空雨水洼 + 鲜绿苔垫
  //   - puddleRipple (14×14×2, symDeg: 90, noOutline: true)：水面细微涟漪薄片
  //   - vineStrand   (6×6×16)：枝沿垂下的细绿挂藤，复用 4 束随高空林风飘荡
  //
  // 展示动作：
  //   - idle      ：高空微风吹拂垂藤轻晃、小水洼偶泛一圈水波
  //   - rain_drip ：树梢滴落水珠砸进树洼激起连续涟漪与细水花粒
  // =========================================================================

  // 21 色独立色表（严守 <= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 暖赤褐粗树皮
      barkDark:  '#421f14',
      barkMid:   '#783a23',
      barkHi:    '#ad5b3a',
      // 树皮深裂纹
      fissDark:  '#26100a',
      fissMid:   '#4c2316',
      fissHi:    '#733a25',
      // 树冠落叶腐土层
      soilDark:  '#2e2117',
      soilMid:   '#543e2b',
      soilHi:    '#826142',
      // 枝面厚翠苔
      mossDark:  '#195727',
      mossMid:   '#35943e',
      mossHi:    '#7ad957',
      // 澄碧空中水洼
      waterDark: '#13657d',
      waterMid:  '#28a8bf',
      waterHi:   '#7ee8fa',
      // 水面亮涟漪与细沫
      foamDark:  '#9ce3ed',
      foamMid:   '#d2f7fc',
      foamHi:    '#f2feff',
      // 垂坠鲜绿挂藤
      vineDark:  '#1d6326',
      vineMid:   '#44b043',
      vineHi:    '#96e861'
    },
    glowKeys: [],
    parts: ['bark', 'fiss', 'soil', 'moss', 'water', 'foam', 'vine'],
    noCrease: [
      ['bark', 'fiss'], ['bark', 'soil'], ['bark', 'moss'], ['soil', 'moss'],
      ['water', 'foam'], ['moss', 'vine']
    ],
    materials: {
      bark:  ['barkDark',  'barkMid',  'barkHi'],
      fiss:  ['fissDark',  'fissMid',  'fissHi'],
      soil:  ['soilDark',  'soilMid',  'soilHi'],
      moss:  ['mossDark',  'mossMid',  'mossHi'],
      water: ['waterDark', 'waterMid', 'waterHi'],
      foam:  ['foamDark',  'foamMid',  'foamHi'],
      vine:  ['vineDark',  'vineMid',  'vineHi']
    },
    protectedParts: ['water', 'foam', 'vine']
  });

  // 3 套换色皮肤（苍褐翠苔 / 老红杉皮 / 雾青古枝，0 禁用字）
  const SKINS = [
    {
      id: 'brown_moss',
      name: '苍褐翠苔',
      dot: '#28a8bf',
      outline: '#121c14',
      pal: {},
      fx: {
        drop:   '#8ef0ff',
        splash: '#d2f7fc',
        leaf:   '#7ad957'
      }
    },
    {
      id: 'old_redwood',
      name: '老红杉皮',
      dot: '#a83c24',
      outline: '#1f100c',
      pal: {
        barkDark:  '#4d1b14', barkMid:  '#8a3423', barkHi:  '#c4563b',
        fissDark:  '#2e0e0a', fissMid:  '#591e14', fissHi:  '#853322',
        mossDark:  '#2e6122', mossMid:  '#5ea334', mossHi:  '#aee352',
        waterDark: '#165a8a', waterMid: '#2e98d6', waterHi: '#85dbff'
      },
      fx: {
        drop:   '#85dbff',
        splash: '#d9f5ff',
        leaf:   '#aee352'
      }
    },
    {
      id: 'mist_ancient',
      name: '雾青古枝',
      dot: '#5c828a',
      outline: '#10181c',
      pal: {
        barkDark:  '#2c393d', barkMid:  '#51666b', barkHi:  '#7c979c',
        fissDark:  '#1a2224', fissMid:  '#354447', fissHi:  '#53676b',
        soilDark:  '#29302b', soilMid:  '#49544c', soilHi:  '#707d73',
        mossDark:  '#18574b', mossMid:  '#2f967f', mossHi:  '#72d9bc',
        waterDark: '#157075', waterMid: '#30b8b5', waterHi: '#8ef5ec',
        vineDark:  '#1c6352', vineMid:  '#3db08f', vineHi:  '#8ce8c8'
      },
      fx: {
        drop:   '#8ef5ec',
        splash: '#dbfffc',
        leaf:   '#72d9bc'
      }
    }
  ];

  // 共用横枝形体函数（把整根 52 格粗横枝精准切分为西/东两块 32×26×18 拼合）
  function buildBoughHalf(makeCanvas, side) {
    const m = new VoxelModel(32, 26, 18, SPEC);
    const { mat, partId } = SPEC;
    const xShift = side === 'west' ? -11.5 : 11.5;

    m.fillAABB(-15.5, 15.5, -12.5, 12.5, 0, 17, (x, y, z, X, Y) => {
      const gx = X + xShift; // 全局横枝 X 坐标 [-27, +27]
      // 西块覆盖 gx <= 1.2，东块覆盖 gx >= -1.2（交界处重叠 2.4 格确保零缝隙）
      if (side === 'west' && gx > 1.2) return;
      if (side === 'east' && gx < -1.2) return;

      // 粗横枝微微蜿蜒隆起
      const cy = Math.sin(gx * 0.085) * 2.1;
      const cz = 6.2 + Math.cos(gx * 0.07) * 1.2;
      const ly = Y - cy;
      const lz = z - cz;

      // 两端自然粗壮收束（像树冠桥段两端继续伸入雾林）
      const endFade = 1 - smoothstep(19.0, 26.5, Math.abs(gx)) * 0.28;
      const rx = 10.6 * endFade + Math.sin(gx * 0.22 + z * 0.35) * 0.55;
      const rz = 6.8 * endFade + Math.cos(Y * 0.28) * 0.35;

      // 顶部修平形成可行走的宽阔树冠桥面（z <= 12.8）
      const ell = (ly * ly) / (rx * rx) + (lz * lz) / (rz * rz);
      if (ell > 1.0 || z > 13.8) return;

      // 高空雨水洼凹陷区（集中在 gx = 3.5, gy = 0.2 附近，椭圆形水洼 14×11 格）
      const pdx = (gx - 3.6) / 7.8;
      const pdy = (Y - cy - 0.3) / 5.4;
      const pd2 = pdx * pdx + pdy * pdy;

      // 水洼表面 z = 11，上方挖空蓄水
      if (pd2 < 1.0 && z >= 10) {
        if (z > 11) return;
        if (z === 11) {
          // 靠近水洼边缘点缀一圈清浅水沫亮边
          if (pd2 > 0.72) {
            m.setRaw(x, y, z, mat('foam'), partId.foam);
          } else {
            m.setRaw(x, y, z, mat('water'), partId.water);
          }
          return;
        }
        // z === 10：澄碧水体层
        m.setRaw(x, y, z, mat('water'), partId.water);
        return;
      }

      // 树冠桥面顶层：覆一层深棕落叶土 + 厚翠绿苔藓
      const topHeight = cz + rz * Math.sqrt(Math.max(0, 1 - (ly * ly) / (rx * rx)));
      const nearTop = z >= topHeight - 2.4;

      if (nearTop && z >= 9) {
        // 水洼周边 1.35 倍范围一圈湿润深棕腐土 + 鲜绿厚苔交错
        const mossNoise = Math.sin(gx * 0.34 + Y * 0.42) + Math.cos(gx * 0.19 - Y * 0.27) * 0.6;
        if (pd2 >= 1.0 && pd2 < 1.48 && mossNoise < 0.25) {
          m.setRaw(x, y, z, mat('soil'), partId.soil);
        } else if (mossNoise > -0.25) {
          m.setRaw(x, y, z, mat('moss'), partId.moss);
        } else {
          m.setRaw(x, y, z, mat('soil'), partId.soil);
        }
        return;
      }

      // 树皮深裂纹与暖赤褐粗树皮
      const fissure = Math.sin(gx * 0.28 + z * 0.65 + Math.sin(Y * 0.3) * 1.2);
      if (fissure < -0.52) {
        m.setRaw(x, y, z, mat('fiss'), partId.fiss);
      } else {
        m.setRaw(x, y, z, mat('bark'), partId.bark);
      }
    });

    // 额外在桥面边缘堆几簇饱满翠苔垫与小分叉树瘤
    if (side === 'west') {
      m.paintEllipsoid(-5.2, -3.5, 13.6, 4.4, 3.4, 1.8, mat('moss'), partId.moss, true);
      m.paintEllipsoid( 2.8,  5.6, 13.0, 3.6, 2.8, 1.5, mat('moss'), partId.moss, true);
      // 西后侧一根粗短断杈
      m.paintCapsule(-8.0, -7.2, 7.5, -12.6, -10.8, 12.2, 2.6, 1.5, mat('bark'), partId.bark, true);
      m.paintEllipsoid(-12.6, -10.8, 12.6, 2.0, 2.0, 1.2, mat('moss'), partId.moss, true);
    } else {
      m.paintEllipsoid( 7.6, -4.4, 13.4, 3.8, 3.0, 1.6, mat('moss'), partId.moss, true);
      m.paintEllipsoid( 5.8,  5.8, 12.8, 3.4, 2.6, 1.5, mat('moss'), partId.moss, true);
      // 东前侧树瘤
      m.paintEllipsoid( 9.5,  8.6, 7.4, 2.5, 2.0, 2.4, mat('bark'), partId.bark, true);
    }

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 15.0, headZ: 16, centerZ: 7 });
  }

  // =========================================================================
  // 2. 水面细微涟漪薄片（14×14×2，symDeg: 90，不描边）
  // =========================================================================
  function buildPuddleRipple(makeCanvas) {
    const m = new VoxelModel(14, 14, 2, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-6.5, 6.5, -6.5, 6.5, 0, 1, (x, y, z, X, Y) => {
      if (z !== 0) return;
      const r = Math.hypot(X * 0.92, Y * 1.18);
      if ((r > 2.2 && r < 3.1) || (r > 4.6 && r < 5.3)) {
        const ang = Math.atan2(Y, X);
        if (Math.cos(ang * 4) > -0.35) {
          m.setRaw(x, y, z, mat('foam'), partId.foam);
        }
      }
    });
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 5.5, headZ: 2, centerZ: 1 });
  }

  // =========================================================================
  // 3. 垂坠鲜绿挂藤（6×6×16，复用 4 束挂在枝沿）
  // =========================================================================
  function buildVineStrand(makeCanvas) {
    const m = new VoxelModel(6, 6, 16, SPEC);
    const { mat, partId } = SPEC;
    // 自上而下蜿蜒垂落的细藤 + 3 对小叶节
    m.paintCapsule(0, 0, 15.0,  0.5,  0.4, 9.5, 1.05, 0.85, mat('vine'), partId.vine, true);
    m.paintCapsule(0.5, 0.4, 9.5, -0.4, 0.2, 4.0, 0.85, 0.65, mat('vine'), partId.vine, true);
    m.paintCapsule(-0.4, 0.2, 4.0, 0.2, -0.3, 0.6, 0.65, 0.40, mat('vine'), partId.vine, true);

    m.paintEllipsoid( 1.5, 0.4, 11.4, 1.2, 0.9, 0.9, mat('moss'), partId.moss, true);
    m.paintEllipsoid(-1.4, 0.2,  7.2, 1.1, 0.9, 0.85, mat('vine'), partId.vine, true);
    m.paintEllipsoid( 1.2, -0.2, 3.4, 1.0, 0.8, 0.8, mat('vine'), partId.vine, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2, headZ: 15, centerZ: 8 });
  }

  // 4 束挂藤在横枝沿的挂点
  const VINE_ANCHORS = [
    { lx: -17.5, ly:  9.8, lift: 0.0, roOff: 0.2, phase: 0.0 },
    { lx:  -5.5, ly: 10.6, lift: 0.4, roOff: 1.4, phase: 1.1 },
    { lx:   9.2, ly: 10.2, lift: 0.2, roOff: 2.5, phase: 2.3 },
    { lx:  18.5, ly: -8.6, lift: 0.8, roOff: 0.8, phase: 3.4 }
  ];

  // =========================================================================
  // Def 资产定义
  // =========================================================================
  const Def = {
    id: 'scene_t11_canopy_bough',
    code: 'T11',
    name: '巨木苔皮横枝与水洼',
    status: 'done',
    defaultHabitat: 'canopy',
    tag: 'T11 树冠可通行桥段 · 空中腐土与雨水洼',
    summary: '2 块 <= 32 格粗赤褐横枝无缝拼合，枝面覆厚翠苔与落叶腐土，凹处蓄一汪澄碧高空雨水洼，枝沿垂 4 束随风轻晃挂藤',
    footRadius: 22.0,
    ecoWeight: 4.5,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',      name: '高空林风微澜', loop: true,  status: 'done' },
      { id: 'rain_drip', name: '树梢滴水激涟', loop: false, duration: 2.4, status: 'done' }
    ],
    blocks: ['双块无缝拼合巨木横枝', '树冠厚苔土与澄碧水洼', '4 束高空风摆垂藤'],
    soulHabit: '高空微风吹拂枝沿垂藤轻晃、小水洼偶泛一圈水波；树梢水珠滴落砸进树洼时激起连续扩散涟漪与晶莹细水花粒',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        boughWest:    buildBoughHalf(makeCanvas, 'west'),
        boughEast:    buildBoughHalf(makeCanvas, 'east'),
        puddleRipple: buildPuddleRipple(makeCanvas),
        vineStrand:   buildVineStrand(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        time: 0,
        ripplePulse: 0,
        windBoost: 0,
        idleRippleClock: 1.6,
        lastAction: 'idle',
        dripStage: 0,
        splashStage: 0
      };

      let curSkin = SKINS[0];

      function puddleWorldXY(sMul) {
        return localToWorldXY(state.x, state.y, state.yaw, 3.6 * sMul, 0.3 * sMul);
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
          state.ripplePulse = 0;
          state.windBoost = 0;
          state.idleRippleClock = 1.4;
          state.lastAction = 'idle';
          state.dripStage = 0;
          state.splashStage = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;
          state.time = time * gFreq;

          if (action !== state.lastAction) {
            state.lastAction = action;
            state.dripStage = 0;
            state.splashStage = 0;
          }

          state.ripplePulse = Math.max(0, state.ripplePulse - dt * 1.8);
          state.windBoost = Math.max(0, state.windBoost - dt * 1.4);

          if (action === 'rain_drip') {
            // 3 颗水珠依次从树梢滴落（0.08s, 0.62s, 1.18s），0.36s 后砸中水面激起涟漪与水花
            const dropTimes = [0.08, 0.62, 1.18];
            const hitTimes  = [0.44, 0.98, 1.54];
            const [px, py] = puddleWorldXY(sMul);

            while (state.dripStage < dropTimes.length && actionTime >= dropTimes[state.dripStage]) {
              if (vfx) {
                const ox = (state.dripStage - 1) * 2.1 * sMul;
                const oy = (state.dripStage % 2 === 0 ? -1.0 : 1.1) * sMul;
                vfx.spawnParticle(
                  px + ox, py + oy, 30.0 * sMul,
                  0, 0, -28.0 * sMul,
                  0.42, 1.45, fx.drop, false, 60
                );
              }
              state.dripStage++;
            }

            while (state.splashStage < hitTimes.length && actionTime >= hitTimes[state.splashStage]) {
              state.ripplePulse = 1.0;
              state.windBoost = 0.85;
              if (vfx) {
                const ox = (state.splashStage - 1) * 2.1 * sMul;
                const oy = (state.splashStage % 2 === 0 ? -1.0 : 1.1) * sMul;
                vfx.addRipple(px + ox, py + oy, 1.5 * sMul, 8.8 * sMul, 0.85, 1.4);
                for (let k = 0; k < 7; k++) {
                  const a = (k / 7) * TAU + Math.random() * 0.4;
                  const sp = (3.0 + Math.random() * 4.5) * sMul;
                  vfx.spawnParticle(
                    px + ox, py + oy, 11.8 * sMul,
                    Math.cos(a) * sp, Math.sin(a) * sp, (6.5 + Math.random() * 4.5) * sMul,
                    0.55 + Math.random() * 0.25,
                    1.15,
                    k % 2 === 0 ? fx.splash : fx.drop,
                    false,
                    38
                  );
                }
              }
              state.splashStage++;
            }
          } else {
            // 常态偶泛一圈细微水波
            state.idleRippleClock -= dt;
            if (state.idleRippleClock <= 0) {
              state.idleRippleClock = 2.2 + Math.random() * 1.4;
              state.ripplePulse = 0.55;
              if (vfx) {
                const [px, py] = puddleWorldXY(sMul);
                vfx.addRipple(px, py, 1.4 * sMul, 6.8 * sMul, 1.05, 1.1);
              }
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.time;
          const list = [];

          // 1. 西/东两块巨木横枝无缝拼合
          const [wx, wy] = localToWorldXY(state.x, state.y, yw, -11.5 * sMul, 0);
          list.push({
            partKey: 'boughWest',
            asset: parts.boughWest,
            x: wx,
            y: wy,
            lift: 0,
            ro: yw,
            bias: -0.10
          });

          const [ex, ey] = localToWorldXY(state.x, state.y, yw, 11.5 * sMul, 0);
          list.push({
            partKey: 'boughEast',
            asset: parts.boughEast,
            x: ex,
            y: ey,
            lift: 0,
            ro: yw,
            bias: -0.08
          });

          // 2. 水面细微涟漪薄片（不描边，随水波脉动微浮微转）
          const [px, py] = localToWorldXY(state.x, state.y, yw, 3.6 * sMul, 0.3 * sMul);
          const ripOp = clamp(0.32 + state.ripplePulse * 0.52 + Math.sin(t * 2.2) * 0.12, 0.20, 0.92);
          list.push({
            partKey: 'puddleRipple',
            asset: parts.puddleRipple,
            x: px,
            y: py,
            lift: (11.6 + state.ripplePulse * 0.25) * sMul,
            ro: wrapAngle(yw + t * 0.22 + state.ripplePulse * 0.4),
            opacity: ripOp,
            noOutline: true,
            bias: 0.45,
            symDeg: 90
          });

          // 3. 4 束枝沿挂藤随高空林风错相飘荡
          const windAmp = (0.72 + state.windBoost * 0.65) * sMul;
          for (let i = 0; i < VINE_ANCHORS.length; i++) {
            const va = VINE_ANCHORS[i];
            const swayX = Math.sin(t * 1.9 + va.phase) * windAmp;
            const swayY = Math.cos(t * 1.45 + va.phase) * windAmp * 0.45;
            const [vx, vy] = localToWorldXY(state.x, state.y, yw, va.lx * sMul + swayX, va.ly * sMul + swayY);
            list.push({
              partKey: 'vineStrand',
              asset: parts.vineStrand,
              x: vx,
              y: vy,
              lift: va.lift * sMul,
              ro: wrapAngle(yw + va.roOff + Math.sin(t * 1.9 + va.phase) * 0.28),
              bias: va.ly > 0 ? 0.55 : -0.25
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
