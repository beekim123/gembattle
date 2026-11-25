'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T02 雷云峰顶 · 劈雷焦岩尖塔与雷击苔
  //
  // 生态定位：石头被雷劈裂成双叉尖塔，焦黑裂缝边长满亮翠绿/明黄雷击苔（喂 天8 舔雷击痕！）
  // 拆件与图集预算（单块 <= 34 格，仅电核与电弧芯进 glowKeys，0 常态拉伸）：
  //   - spireBase  (30×28×12, lift=0)：棱角劈裂深灰黑岩基座 + 焦黑裂沟 + 亮翠绿/明黄雷击苔环
  //   - prongLeft  (16×16×26, lift=8)：左叉焦岩尖塔（焦痕内壁长满鲜明雷击苔）
  //   - prongRight (16×16×24, lift=8)：右叉焦岩尖塔（与左叉形成劈裂电隙）
  //   - chargeCore (7×7×7,    symDeg: 90)：双岩尖中间悬浮的自亮微弱电核（进 glowKeys）
  //
  // 展示动作：
  //   - idle             ：双尖偶发 1~2 帧清脆青白静电跳弧
  //   - lightning_strike ：loop: false, duration: 2.2；裂尖电荷蓄满，骤然跳出锯齿亮天青雷电折线 kind: 'line'，
  //                        裂岩震颤并崩出亮青电粒、裂缝雷击苔微亮一闪
  // =========================================================================

  // 18 色独立色表（<= 48 色、0 重色、仅 arcMid/arcHi 进 glowKeys）
  const SPEC = createPaletteSpec({
    pal: {
      // 深铁青/黑灰棱角岩峰（与深灰雷云地台靠极深焦黑裂壁+亮青苔拉开辨识度）
      rockDark:   '#141824',
      rockMid:    '#262e42',
      rockHi:     '#435170',
      // 雷劈焦黑裂缝内壁
      charDark:   '#090b12',
      charMid:    '#161926',
      charHi:     '#292f42',
      // 焦痕边亮翠绿雷击苔
      mossDark:   '#167844',
      mossMid:    '#32c76b',
      mossHi:     '#87fa9c',
      // 雷击苔明黄芽斑（与深铁青焦岩极强对比！）
      lichenDark: '#bd9211',
      lichenMid:  '#f5cf27',
      lichenHi:   '#fff785',
      // 岩峰棱脊浅蓝灰矿脉
      veinDark:   '#3b4e6e',
      veinMid:    '#6280ad',
      veinHi:     '#96bae3',
      // 自亮电核与电弧芯（严格仅 arcMid/arcHi 进 glowKeys）
      arcDark:    '#147eb0',
      arcMid:     '#4ae3ff',
      arcHi:      '#dffcff'
    },
    glowKeys: ['arcMid', 'arcHi'],
    parts: ['rock', 'char', 'moss', 'lichen', 'vein', 'arc'],
    noCrease: [
      ['rock', 'char'],
      ['rock', 'vein'],
      ['char', 'moss'],
      ['moss', 'lichen']
    ],
    materials: {
      rock:   ['rockDark',   'rockMid',   'rockHi'],
      char:   ['charDark',   'charMid',   'charHi'],
      moss:   ['mossDark',   'mossMid',   'mossHi'],
      lichen: ['lichenDark', 'lichenMid', 'lichenHi'],
      vein:   ['veinDark',   'veinMid',   'veinHi'],
      arc:    ['arcDark',    'arcMid',    'arcHi']
    },
    protectedParts: ['moss', 'lichen', 'arc']
  });

  // 3 套换色皮肤（深灰青苔 / 玄铁金苔 / 紫岩靛雷）
  const SKINS = [
    {
      id: 'slate_emerald_moss',
      name: '深灰青苔',
      dot: '#32c76b',
      outline: '#07090f',
      pal: {},
      fx: { arcCore: '#e6feff', arcMid: '#4ae3ff', arcOut: '#125a82', mossSpark: '#87fa9c', yellowSpark: '#fff785' }
    },
    {
      id: 'iron_gold_moss',
      name: '玄铁金苔',
      dot: '#f5be2e',
      outline: '#0c0b09',
      pal: {
        rockDark:   '#17171a', rockMid:   '#2c2d33', rockHi:   '#4d5059',
        charDark:   '#0a0a0d', charMid:   '#1a191f', charHi:   '#2e2d36',
        mossDark:   '#9e680e', mossMid:   '#e6a322', mossHi:   '#ffe066',
        lichenDark: '#6e8c18', lichenMid: '#b5db30', lichenHi: '#eeff85',
        veinDark:   '#524a38', veinMid:   '#857759', veinHi:   '#bfad84',
        arcDark:    '#bf8a15', arcMid:    '#ffda47', arcHi:    '#fffbd4'
      },
      fx: { arcCore: '#fffbd4', arcMid: '#ffda47', arcOut: '#8a550c', mossSpark: '#ffe066', yellowSpark: '#eeff85' }
    },
    {
      id: 'violet_indigo_bolt',
      name: '紫岩靛雷',
      dot: '#7a70ff',
      outline: '#0b0817',
      pal: {
        rockDark:   '#1d1633', rockMid:   '#352959', rockHi:   '#59488a',
        charDark:   '#0f0a1c', charMid:   '#1f1636', charHi:   '#332554',
        mossDark:   '#147d6b', mossMid:   '#2bd4b0', mossHi:   '#82ffdf',
        lichenDark: '#859c16', lichenMid: '#c8eb34', lichenHi: '#f4ff8f',
        veinDark:   '#483c7a', veinMid:   '#7565b8', veinHi:   '#aea0eb',
        arcDark:    '#3b47d6', arcMid:    '#7894ff', arcHi:    '#e3ebff'
      },
      fx: { arcCore: '#e8f0ff', arcMid: '#7894ff', arcOut: '#242e96', mossSpark: '#82ffdf', yellowSpark: '#f4ff8f' }
    }
  ];

  // 1. 棱角劈裂岩峰基座（30×28×12）：中间贯通焦黑雷裂沟，裂沟双侧长满鲜明翠绿/明黄雷击苔
  function buildSpireBase(makeCanvas) {
    const m = new VoxelModel(30, 28, 12, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-14.2, 14.2, -13.2, 13.2, 0, 11, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X * 0.96, Y * 1.04);
      const maxR = lerp(13.2, 8.8, z / 11) * (1.0 + 0.16 * Math.cos(ang * 5 + 0.3) + 0.08 * Math.sin(ang * 3));
      if (r > maxR) return;

      // 贯穿 X=0 附近的一道斜向雷劈焦裂沟
      const cleftCenter = Math.sin(Y * 0.22) * 1.1;
      const distCleft = Math.abs(X - cleftCenter);
      if (distCleft < 1.35 && z >= 4) return;

      // 裂沟内壁焦黑
      if (distCleft < 2.65) {
        m.setRaw(x, y, z, mat('char'), partId.char);
        return;
      }
      // 焦痕外缘一圈高对比亮翠绿/明黄雷击苔（呼应 T02 生态规矩）
      const mossBand = distCleft >= 2.65 && distCleft <= 5.4 && z >= 3 && (Math.sin(Y * 0.55 + z * 0.6) > -0.35);
      if (mossBand) {
        const isYellow = ((Math.round(X * 3 + Y * 5 + z) & 3) === 0);
        m.setRaw(x, y, z, isYellow ? mat('lichen') : mat('moss'), isYellow ? partId.lichen : partId.moss);
        return;
      }
      // 岩基棱线矿脉
      const isVein = r > maxR - 1.4 && (Math.cos(ang * 5 + 0.3) > 0.72) && z >= 2;
      m.setRaw(x, y, z, isVein ? mat('vein') : mat('rock'), isVein ? partId.vein : partId.rock);
    });

    // 额外在焦缝边点缀几团鼓起的翠绿与明黄雷击苔垫
    m.paintEllipsoid(-4.2,  5.6, 8.2, 2.4, 2.2, 1.5, mat('moss'),   partId.moss,   true);
    m.paintEllipsoid( 4.6,  4.2, 8.0, 2.2, 2.0, 1.4, mat('lichen'), partId.lichen, true);
    m.paintEllipsoid(-4.8, -4.8, 8.6, 2.3, 2.0, 1.4, mat('lichen'), partId.lichen, true);
    m.paintEllipsoid( 4.4, -5.2, 8.4, 2.4, 2.2, 1.5, mat('moss'),   partId.moss,   true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 13.5, headZ: 12, centerZ: 6 });
  }

  // 2. 双叉劈裂岩尖生成器（16×16×h，side = -1 左叉 / +1 右叉）
  function buildProng(makeCanvas, side, H) {
    const m = new VoxelModel(16, 16, H, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-7.4, 7.4, -7.4, 7.4, 0, H - 1, (x, y, z, X, Y) => {
      const u = z / (H - 1);
      // 略向外倾的劈裂尖塔中轴，底部宽厚、顶端锐利劈尖
      const leanX = side * u * 2.4;
      const leanY = (side < 0 ? 0.6 : -0.7) * u;
      const lx = X - leanX;
      const ly = Y - leanY;
      // 朝向裂缝的内侧面被雷劈得陡直平削（lx * side < -0.8 削掉）
      const cutPlane = -side * lx;
      const flatCut = lerp(2.2, 0.7, u);
      if (cutPlane > flatCut) return;

      const ang = Math.atan2(ly, lx);
      const r = Math.hypot(lx, ly);
      const maxR = lerp(6.2, 1.15, Math.pow(u, 0.85)) * (1.0 + 0.16 * Math.cos(ang * 4 + side * 0.5));
      if (r > maxR) return;

      // 内侧劈裂断面呈焦黑，裂口边缘长亮翠绿/明黄雷击苔
      if (cutPlane > flatCut - 1.35) {
        const isMossEdge = u > 0.10 && u < 0.78 && Math.abs(ly) > maxR * 0.35;
        if (isMossEdge) {
          const isYellow = ((Math.round(Y * 3 + z * 2) & 3) === 0);
          m.setRaw(x, y, z, isYellow ? mat('lichen') : mat('moss'), isYellow ? partId.lichen : partId.moss);
        } else {
          m.setRaw(x, y, z, mat('char'), partId.char);
        }
        return;
      }
      // 尖端微带青灰引雷矿脉
      if (u > 0.80 && r < maxR * 0.75) {
        m.setRaw(x, y, z, mat('vein'), partId.vein);
      } else {
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      }
    });

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 6.5, headZ: H, centerZ: Math.floor(H * 0.5) });
  }

  // 3. 双岩尖中间悬浮的自亮微弱电核（7×7×7，symDeg: 90，进 glowKeys）
  function buildChargeCore(makeCanvas) {
    const m = new VoxelModel(7, 7, 7, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 3.0, 2.2, 2.2, 2.2, mat('arc'), partId.arc, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5, headZ: 6, centerZ: 3 });
  }

  const Def = {
    id: 'scene_t02_thunder_spire',
    code: 'T02',
    name: '劈雷焦岩尖塔与雷击苔',
    status: 'done',
    defaultHabitat: 'thunderPeak',
    tag: 'T02 雷云峰顶地标与雷击苔源',
    summary: '被雷劈裂成双叉的高耸深灰黑棱角岩尖（基座与左右双叉拆件），焦黑裂缝边鲜明生长着亮翠绿/明黄雷击苔，双岩尖间悬着自亮微弱电核，周期跳跃亮天青锯齿雷电折线',
    footRadius: 14.5,
    ecoWeight: 3.0,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle',             name: '裂尖静电微弧', loop: true,  status: 'done' },
      { id: 'lightning_strike', name: '蓄电雷弧劈裂', loop: false, duration: 2.2, status: 'done' }
    ],
    blocks: [
      '深灰黑劈裂岩基与双叉裂岩尖（单块 <= 30 格）',
      '焦痕边高对比亮翠绿/明黄雷击苔带',
      '双尖悬浮自亮电核与锯齿状亮天青雷电折线'
    ],
    soulHabit: '平时双岩尖间偶发 1~2 帧清脆青白静电跳弧；电荷蓄满时骤然跳出锯齿状亮天青雷电折线，裂岩震颤并崩出亮青电粒、裂缝雷击苔微亮一闪',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        spireBase:  buildSpireBase(makeCanvas),
        prongLeft:  buildProng(makeCanvas, -1, 26),
        prongRight: buildProng(makeCanvas,  1, 24),
        chargeCore: buildChargeCore(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        time: 0,
        idleSparkTimer: 1.4,
        idleSparkLeft: 0,
        strikeStrength: 0,
        chargeLevel: 0,
        shakeX: 0,
        shakeY: 0,
        arcPhase: 0,
        lastAction: 'idle',
        strikeFired: false
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
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(x, y, yaw) {
          state.x = x;
          state.y = y;
          state.z = 0;
          state.yaw = yaw;
          state.time = 0;
          state.idleSparkTimer = 1.1;
          state.idleSparkLeft = 0;
          state.strikeStrength = 0;
          state.chargeLevel = 0;
          state.shakeX = 0;
          state.shakeY = 0;
          state.arcPhase = 0;
          state.lastAction = 'idle';
          state.strikeFired = false;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          state.time = time;
          state.arcPhase += dt * 28.0 * gFreq;
          if (action !== state.lastAction) {
            state.lastAction = action;
            state.strikeFired = false;
          }

          state.shakeX = 0;
          state.shakeY = 0;

          if (action === 'lightning_strike') {
            const u = clamp(actionTime / 2.2, 0, 1);
            if (u < 0.30) {
              // 蓄电阶段：电核微升蓄势，双尖预跳小弧
              state.chargeLevel = smoothstep(0, 0.30, u);
              state.strikeStrength = state.chargeLevel * 0.42;
            } else if (u < 0.72) {
              // 骤然放雷：锯齿强电弧横劈双尖并直冲岩缝，裂岩震颤
              const sU = (u - 0.30) / 0.42;
              state.chargeLevel = 1.0;
              state.strikeStrength = 1.0 - smoothstep(0.68, 1.0, sU) * 0.45;
              const shakeEnv = Math.sin(clamp(sU / 0.2, 0, 1) * Math.PI * 0.5) * (1 - sU * 0.7);
              state.shakeX = Math.sin(actionTime * 54.0) * shakeEnv * 0.65 * sMul;
              state.shakeY = Math.cos(actionTime * 46.0) * shakeEnv * 0.45 * sMul;

              // 雷击瞬间崩出亮青电粒 + 裂缝雷击苔微亮一闪
              if (!state.strikeFired && vfx) {
                state.strikeFired = true;
                const [cxTop, cyTop] = localToWorldXY(state.x, state.y, state.yaw, 0, 0);
                for (let k = 0; k < 14; k++) {
                  const a = Math.random() * TAU;
                  const sp = (10 + Math.random() * 18) * sMul;
                  vfx.spawnParticle(
                    cxTop + (Math.random() - 0.5) * 6 * sMul,
                    cyTop + (Math.random() - 0.5) * 4 * sMul,
                    (26 + Math.random() * 7) * sMul,
                    Math.cos(a) * sp, Math.sin(a) * sp, (6 + Math.random() * 12) * sMul,
                    0.42 + Math.random() * 0.25,
                    k % 3 === 0 ? 1.55 : 1.25,
                    k % 2 === 0 ? fx.arcCore : fx.arcMid,
                    true,
                    22
                  );
                }
                // 裂缝雷击苔微亮一闪（翠绿/明黄微粒沿焦缝闪起）
                for (let m = 0; m < 8; m++) {
                  const [mx, my] = localToWorldXY(
                    state.x, state.y, state.yaw,
                    ((Math.random() - 0.5) * 7.5) * sMul,
                    ((Math.random() - 0.5) * 14.0) * sMul
                  );
                  vfx.spawnParticle(
                    mx, my,
                    (7.0 + Math.random() * 10.0) * sMul,
                    (Math.random() - 0.5) * 3.5 * sMul,
                    (Math.random() - 0.5) * 3.5 * sMul,
                    (3.5 + Math.random() * 4.0) * sMul,
                    0.48 + Math.random() * 0.25,
                    1.2,
                    m % 2 === 0 ? fx.mossSpark : fx.yellowSpark,
                    true,
                    2
                  );
                }
              }
            } else {
              const rU = smoothstep(0.72, 1.0, u);
              state.chargeLevel = 1 - rU;
              state.strikeStrength = (1 - rU) * 0.45;
            }
          } else {
            state.chargeLevel = lerp(state.chargeLevel, 0, clamp(dt * 6.0, 0, 1));
            state.strikeStrength = lerp(state.strikeStrength, 0, clamp(dt * 8.0, 0, 1));

            // 待机：每隔 ~1.7~2.5 秒偶发 1~2 帧清脆青白静电跳弧
            if (state.idleSparkLeft > 0) {
              state.idleSparkLeft = Math.max(0, state.idleSparkLeft - dt);
            } else {
              state.idleSparkTimer -= dt * gFreq;
              if (state.idleSparkTimer <= 0) {
                state.idleSparkTimer = 1.6 + Math.random() * 1.1;
                state.idleSparkLeft = 0.085;
                if (vfx) {
                  const [sx, sy] = localToWorldXY(state.x, state.y, state.yaw, (Math.random() - 0.5) * 5 * sMul, 0);
                  vfx.spawnParticle(
                    sx, sy, (27.5 + Math.random() * 3.5) * sMul,
                    (Math.random() - 0.5) * 10 * sMul, (Math.random() - 0.5) * 10 * sMul,
                    (5 + Math.random() * 5) * sMul,
                    0.28, 1.15, fx.arcCore, true, 16
                  );
                }
              }
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.time;
          const cx = state.x + state.shakeX;
          const cy = state.y + state.shakeY;
          const fx = curSkin.fx || SKINS[0].fx;
          const list = [];

          // 1. 劈裂焦岩基座
          list.push({
            partKey: 'spireBase',
            asset: parts.spireBase,
            x: state.x,
            y: state.y,
            lift: 0,
            ro: yw,
            bias: -0.20
          });

          // 2. 左叉焦岩尖塔
          const [lx, ly] = localToWorldXY(cx, cy, yw, -4.8 * sMul, 0.4 * sMul);
          list.push({
            partKey: 'prongLeft',
            asset: parts.prongLeft,
            x: lx,
            y: ly,
            lift: 7.5 * sMul,
            ro: wrapAngle(yw + 0.05),
            bias: 0.05
          });

          // 3. 右叉焦岩尖塔
          const [rx, ry] = localToWorldXY(cx, cy, yw, 5.0 * sMul, -0.5 * sMul);
          list.push({
            partKey: 'prongRight',
            asset: parts.prongRight,
            x: rx,
            y: ry,
            lift: 7.2 * sMul,
            ro: wrapAngle(yw - 0.06),
            bias: 0.08
          });

          // 4. 双岩尖中间悬浮的自亮电核（进 glowKeys）
          const coreZ = (24.8 + Math.sin(t * 3.2) * 0.9 + state.chargeLevel * 2.2) * sMul;
          const [kx, ky] = localToWorldXY(cx, cy, yw, 0.1 * sMul, 0.0);
          list.push({
            partKey: 'chargeCore',
            asset: parts.chargeCore,
            x: kx,
            y: ky,
            lift: coreZ,
            ro: wrapAngle(t * 1.4),
            symDeg: 90,
            opacity: clamp(0.76 + state.chargeLevel * 0.24, 0.72, 1.0),
            bias: 0.42
          });

          // 5. 瞬时锯齿状亮天青雷电折线（kind: 'line' + jitter）
          const tipL = localToWorldXY(cx, cy, yw, -7.0 * sMul,  1.0 * sMul);
          const tipR = localToWorldXY(cx, cy, yw,  7.2 * sMul, -1.0 * sMul);
          const tipLZ = 32.5 * sMul;
          const tipRZ = 30.5 * sMul;

          if (state.strikeStrength > 0.18) {
            // 主强电弧：左岩尖 <-> 右岩尖
            list.push({
              kind: 'line',
              x0: tipL[0], y0: tipL[1], z0: tipLZ,
              x1: tipR[0], y1: tipR[1], z1: tipRZ,
              widthArtPx: state.strikeStrength > 0.65 ? 2 : 1,
              color: fx.arcCore,
              outlineColor: fx.arcOut,
              opacity: clamp(state.strikeStrength, 0, 1),
              sag: -1.4 * sMul,
              jitter: 2.6 * sMul,
              jitterPhase: state.arcPhase,
              segments: 10,
              bias: 0.85
            });
            // 高峰劈雷：自空中劈向电核再贯入岩缝
            if (state.strikeStrength > 0.55) {
              const [skyX, skyY] = localToWorldXY(cx, cy, yw, (Math.sin(state.arcPhase * 0.7) * 3.0) * sMul, -2.5 * sMul);
              list.push({
                kind: 'line',
                x0: skyX, y0: skyY, z0: 48.0 * sMul,
                x1: kx,   y1: ky,   z1: coreZ,
                widthArtPx: 2,
                color: fx.arcCore,
                outlineColor: fx.arcOut,
                opacity: clamp(state.strikeStrength, 0, 1),
                sag: 0,
                jitter: 3.4 * sMul,
                jitterPhase: state.arcPhase * 1.35 + 1.2,
                segments: 12,
                bias: 0.90
              });
              list.push({
                kind: 'line',
                x0: kx, y0: ky, z0: coreZ,
                x1: state.x, y1: state.y, z1: 8.0 * sMul,
                widthArtPx: 1,
                color: fx.arcMid,
                outlineColor: fx.arcOut,
                opacity: clamp(state.strikeStrength * 0.92, 0, 1),
                sag: 0,
                jitter: 2.0 * sMul,
                jitterPhase: state.arcPhase * 1.15 + 3.7,
                segments: 8,
                bias: 0.88
              });
            }
          } else if (state.idleSparkLeft > 0) {
            // 待机偶发 1~2 帧清脆青白静电跳弧
            list.push({
              kind: 'line',
              x0: tipL[0], y0: tipL[1], z0: tipLZ - 1.5 * sMul,
              x1: tipR[0], y1: tipR[1], z1: tipRZ - 1.2 * sMul,
              widthArtPx: 1,
              color: fx.arcCore,
              outlineColor: fx.arcOut,
              opacity: 0.95,
              sag: -0.8 * sMul,
              jitter: 1.9 * sMul,
              jitterPhase: state.arcPhase,
              segments: 8,
              bias: 0.85
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
