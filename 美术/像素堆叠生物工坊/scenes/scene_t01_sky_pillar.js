'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // T01 高空云海 · 浮空风蚀碎岩与风标
  //
  // 拆件与图集预算（单盒严格 <= 40 格，0 自亮键，0 常态拉伸）：
  //   - rockMain    (26×24×18, lift=5)：凌空缓浮的浅青灰风蚀主岩（底锥削尖、顶面风蚀槽）
  //   - shardBig    (9×8×7,    复用 ×2)：绕岩缓转的浮空大碎石
  //   - shardSmall  (6×6×6,    symDeg: 90)：绕岩缓转的浮空小碎石
  //   - windPole    (8×8×26,   lift=19)：插在主岩顶的冒险家粗木风向竿（带金属箍环与顶帽）
  //   - ribbonWide  (10×5×6,   复用 ×2)：竿顶系着的鲜橘红长布风带前两节（金边条纹）
  //   - ribbonTail  (9×4×5,    复用 ×2)：长布风带后两节（燕尾收尖，水平波浪舒展）
  //
  // 展示动作：
  //   - idle ：岩块微幅悬浮、碎石慢速公转、鲜橘红风带水平波浪飘动
  //   - gale ：loop: false, duration: 2.2；狂风来袭——红风带剧烈疾振、碎石绕岩加速微偏、气流白线粒横掠
  // =========================================================================

  // 18 色独立色表（<= 48 色、0 重色、0 自亮键）
  const SPEC = createPaletteSpec({
    pal: {
      // 浅青灰风蚀主岩（与浅蓝云海地台靠深青灰暗面拉开清晰体积）
      rockDark:   '#3b5163',
      rockMid:    '#627e94',
      rockHi:     '#96b2c7',
      // 风蚀浅白垩层纹与岩脊
      chalkDark:  '#a0b7c4',
      chalkMid:   '#c9dce6',
      chalkHi:    '#eef6fa',
      // 粗木风向竿
      woodDark:   '#4d2f1e',
      woodMid:    '#7d5034',
      woodHi:     '#b37c54',
      // 竿身铁环与锚钉
      metalDark:  '#3d434a',
      metalMid:   '#6d7680',
      metalHi:    '#a8b3bd',
      // 鲜橘红长布风带（高空极高辨识度标色！）
      clothDark:  '#a62712',
      clothMid:   '#eb4b1e',
      clothHi:    '#ff8447',
      // 风带金黄镶边条纹
      trimDark:   '#ba7c12',
      trimMid:    '#f2ba30',
      trimHi:     '#ffea82'
    },
    glowKeys: [],
    parts: ['rock', 'chalk', 'wood', 'metal', 'cloth', 'trim'],
    noCrease: [
      ['rock', 'chalk'],
      ['wood', 'metal'],
      ['cloth', 'trim']
    ],
    materials: {
      rock:  ['rockDark',  'rockMid',  'rockHi'],
      chalk: ['chalkDark', 'chalkMid', 'chalkHi'],
      wood:  ['woodDark',  'woodMid',  'woodHi'],
      metal: ['metalDark', 'metalMid', 'metalHi'],
      cloth: ['clothDark', 'clothMid', 'clothHi'],
      trim:  ['trimDark',  'trimMid',  'trimHi']
    },
    protectedParts: ['cloth', 'trim', 'metal']
  });

  // 3 套换色皮肤（晴岩赤带 / 暖砂青带 / 白垩金带）
  const SKINS = [
    {
      id: 'clear_rock_crimson',
      name: '晴岩赤带',
      dot: '#eb4b1e',
      outline: '#16212e',
      pal: {},
      fx: { windLine: '#eef7ff', windOut: '#7ba7cc', dust: '#c9dce6' }
    },
    {
      id: 'warm_sand_teal',
      name: '暖砂青带',
      dot: '#20b5a8',
      outline: '#241a14',
      pal: {
        rockDark:  '#6b4d38', rockMid:  '#9e7657', rockHi:  '#cc9f7a',
        chalkDark: '#ba9a7d', chalkMid: '#dec3a6', chalkHi: '#f7e7d2',
        woodDark:  '#3d271c', woodMid:  '#664432', woodHi:  '#966c54',
        clothDark: '#0f6e6a', clothMid: '#20b5a8', clothHi: '#6ee8d8',
        trimDark:  '#bfa36f', trimMid:  '#edd8a6', trimHi:  '#fff6db'
      },
      fx: { windLine: '#f7f2e8', windOut: '#a89378', dust: '#dec3a6' }
    },
    {
      id: 'chalk_rock_gold',
      name: '白垩金带',
      dot: '#eba820',
      outline: '#1f2630',
      pal: {
        rockDark:  '#6c7882', rockMid:  '#9aa7b3', rockHi:  '#cad6e0',
        chalkDark: '#b8c5cf', chalkMid: '#dde8f0', chalkHi: '#f7fbff',
        woodDark:  '#523526', woodMid:  '#855a41', woodHi:  '#ba8766',
        clothDark: '#b36b0e', clothMid: '#eba820', clothHi: '#ffe266',
        trimDark:  '#941c1c', trimMid:  '#db3935', trimHi:  '#ff7a6b'
      },
      fx: { windLine: '#ffffff', windOut: '#8da6bd', dust: '#dde8f0' }
    }
  ];

  // 1. 凌空浮空风蚀主岩（26×24×18）：倒锥浮岛造型 + 横向风蚀刻槽
  function buildRockMain(makeCanvas) {
    const m = new VoxelModel(26, 24, 18, SPEC);
    const { mat, partId } = SPEC;

    m.fillAABB(-12.2, 12.2, -11.2, 11.2, 0, 17, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X * 0.96, Y * 1.04);
      // 底部收尖成悬空岩锥，上段宽厚平稳可插竿
      const zNorm = z / 17;
      let maxR;
      if (z < 11) {
        maxR = lerp(1.6, 10.6, Math.pow(z / 11, 0.72));
      } else {
        maxR = lerp(10.6, 8.2, (z - 11) / 6);
      }
      // 棱角分面与横向风蚀凹槽
      const facet = 1.0 + 0.14 * Math.cos(ang * 5 + 0.4) + 0.08 * Math.sin(ang * 3 - z * 0.15);
      const windGroove = (z === 7 || z === 8 || z === 12) ? 0.88 : 1.0;
      if (r > maxR * facet * windGroove) return;
      // 顶面轻微台阶起伏
      if (z === 17 && (r > 5.8 || X < -1.5)) return;

      const isChalkBand = (z >= 14 && z <= 16 && r > maxR * facet * 0.62)
        || (z === 9 && Math.sin(ang * 4) > 0.1)
        || (z >= 15 && Math.abs(X) < 4.5 && Math.abs(Y) < 4.5);
      if (isChalkBand) {
        m.setRaw(x, y, z, mat('chalk'), partId.chalk);
      } else {
        m.setRaw(x, y, z, mat('rock'), partId.rock);
      }
    });

    // 插竿岩座加固石墩
    m.paintEllipsoid(0, 0, 16.0, 3.6, 3.4, 2.0, mat('rock'), partId.rock, true);

    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 11.2, headZ: 18, centerZ: 9 });
  }

  // 2. 环绕浮空大碎石（9×8×7，复用 ×2）
  function buildShardBig(makeCanvas) {
    const m = new VoxelModel(9, 8, 7, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-4.0, 4.0, -3.5, 3.5, 0, 6, (x, y, z, X, Y) => {
      const ang = Math.atan2(Y, X);
      const r = Math.hypot(X * 0.92, Y * 1.10);
      const prof = z < 3 ? lerp(1.0, 3.3, z / 3) : lerp(3.3, 1.8, (z - 3) / 3);
      if (r > prof * (1.0 + 0.16 * Math.cos(ang * 3))) return;
      m.setRaw(x, y, z, z >= 4 ? mat('chalk') : mat('rock'), z >= 4 ? partId.chalk : partId.rock);
    });
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 3.6, headZ: 7, centerZ: 3 });
  }

  // 3. 环绕浮空小碎石（6×6×6，symDeg: 90）
  function buildShardSmall(makeCanvas) {
    const m = new VoxelModel(6, 6, 6, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0, 2.8, 2.1, 2.1, 2.4, mat('rock'), partId.rock, true);
    m.paintEllipsoid(0, 0, 4.5, 1.4, 1.4, 1.1, mat('chalk'), partId.chalk, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.3, headZ: 6, centerZ: 3 });
  }

  // 4. 冒险家粗木风向竿（8×8×26）：插在主岩顶，带铁箍环、短横木与圆顶球
  function buildWindPole(makeCanvas) {
    const m = new VoxelModel(8, 8, 26, SPEC);
    const { mat, partId } = SPEC;
    // 主木竿（底部微粗、向上略收）
    m.paintCapsule(0, 0, 0.5, 0, 0, 23.0, 1.75, 1.25, mat('wood'), partId.wood, true);
    // 底部与中段加固铁箍
    m.paintEllipsoid(0, 0, 2.2, 2.3, 2.3, 1.2, mat('metal'), partId.metal, true);
    m.paintEllipsoid(0, 0, 11.0, 1.9, 1.9, 0.95, mat('metal'), partId.metal, true);
    // 竿顶风带系环与金属顶帽
    m.paintEllipsoid(0, 0, 20.5, 2.1, 2.1, 1.0, mat('metal'), partId.metal, true);
    m.paintEllipsoid(0, 0, 24.0, 1.85, 1.85, 1.6, mat('trim'), partId.trim, true);
    // 竿侧一小截指风短横栓
    m.paintCapsule(-2.8, 0, 17.0, 2.8, 0, 17.0, 0.72, 0.72, mat('wood'), partId.wood, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0, headZ: 26, centerZ: 12 });
  }

  // 5. 长布风带前段（10×5×6，沿 +X 舒展，复用 2 节）
  function buildRibbonWide(makeCanvas) {
    const m = new VoxelModel(10, 5, 6, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-4.5, 4.5, -1.5, 1.5, 0, 5, (x, y, z, X, Y) => {
      const waveY = Math.sin(X * 0.55) * 0.55;
      if (Math.abs(Y - waveY) > 0.92) return;
      if (z < 1 || z > 4) return;
      const isTrim = z === 4 || (Math.abs(X) < 1.2 && z === 1);
      m.setRaw(x, y, z, isTrim ? mat('trim') : mat('cloth'), isTrim ? partId.trim : partId.cloth);
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 6, centerZ: 3 });
  }

  // 6. 长布风带后段（9×4×5，略收窄带燕尾尖，复用 2 节）
  function buildRibbonTail(makeCanvas) {
    const m = new VoxelModel(9, 4, 5, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-4.0, 4.0, -1.4, 1.4, 0, 4, (x, y, z, X, Y) => {
      const waveY = Math.sin(X * 0.65) * 0.55;
      if (Math.abs(Y - waveY) > 0.85) return;
      const u = (X + 4.0) / 8.0;
      const zMin = u > 0.65 ? 1 : 1;
      const zMax = u > 0.72 ? 2 : 3;
      if (z < zMin || z > zMax) return;
      const isTrim = z === 3 && u < 0.70;
      m.setRaw(x, y, z, isTrim ? mat('trim') : mat('cloth'), isTrim ? partId.trim : partId.cloth);
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 5, centerZ: 2 });
  }

  // 3 块环绕小碎石公转配置
  const SHARDS = [
    { key: 'shardBig',   r: 15.6, zBase: 10.5, omega: 0.58, ph0: 0.4, bobAmp: 1.1 },
    { key: 'shardBig',   r: 14.2, zBase:  6.8, omega: 0.72, ph0: 2.6, bobAmp: 0.9 },
    { key: 'shardSmall', r: 16.8, zBase: 14.2, omega: 0.92, ph0: 4.5, bobAmp: 1.3 }
  ];

  const Def = {
    id: 'scene_t01_sky_pillar',
    code: 'T01',
    name: '浮空风蚀碎岩与风标',
    status: 'done',
    defaultHabitat: 'sky',
    tag: 'T01 高空云海风标地标 · 浮空岩',
    summary: '凌空缓浮的浅青灰风蚀主岩 + 环绕公转的 3 块小碎石 + 插在岩顶的粗木风向竿与 4 节鲜橘红长布风带，随高空强风猎猎舒展',
    footRadius: 15.0,
    ecoWeight: 2.2,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle', name: '浮岩微悬红带飘', loop: true,  status: 'done' },
      { id: 'gale', name: '高空狂风疾振',   loop: false, duration: 2.2, status: 'done' }
    ],
    blocks: [
      '凌空风蚀浅青灰主岩（倒锥浮岛）',
      '3 块绕岩缓转浮空小碎石',
      '冒险家粗木风向竿与 4 节水平波浪红风带'
    ],
    soulHabit: '主岩与 3 块碎石在高空气流中静静悬浮公转，顶竿系着的鲜橘红长布风带随风水平波浪舒展；狂风骤起时红带剧烈疾振、碎石加速微偏，白色气流线粒横掠过岩柱',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        rockMain:   buildRockMain(makeCanvas),
        shardBig:   buildShardBig(makeCanvas),
        shardSmall: buildShardSmall(makeCanvas),
        windPole:   buildWindPole(makeCanvas),
        ribbonWide: buildRibbonWide(makeCanvas),
        ribbonTail: buildRibbonTail(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        time: 0,
        rockBob: 0,
        galeStrength: 0,
        wavePhase: 0,
        shardAng: SHARDS.map(s => s.ph0),
        gustCd: 0.12,
        lastAction: 'idle'
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
          state.rockBob = 0;
          state.galeStrength = 0;
          state.wavePhase = 0;
          state.shardAng = SHARDS.map(s => s.ph0);
          state.gustCd = 0.12;
          state.lastAction = 'idle';
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const action = (eco && eco.action) || 'idle';
          const actionTime = (eco && eco.actionTime) || 0;
          const fx = curSkin.fx || SKINS[0].fx;

          state.time = time;
          if (action !== state.lastAction) {
            state.lastAction = action;
            state.gustCd = 0.05;
          }

          let targetGale = 0;
          if (action === 'gale') {
            const u = clamp(actionTime / 2.2, 0, 1);
            targetGale = smoothstep(0.0, 0.16, u) * (1 - smoothstep(0.68, 1.0, u));
          }
          state.galeStrength = lerp(state.galeStrength, targetGale, clamp(dt * 8.5, 0, 1));

          // 主岩微幅悬浮
          state.rockBob = Math.sin(time * 1.45 * gFreq) * 1.25 + state.galeStrength * Math.sin(time * 12.0) * 0.35;
          state.z = Math.max(0, (4.5 + state.rockBob) * sMul);

          // 红风带行波相位推进（狂风时剧烈疾振）
          const waveSpeed = lerp(5.4, 17.5, state.galeStrength) * gFreq;
          state.wavePhase += dt * waveSpeed;

          // 碎石公转加速
          const orbitMul = lerp(1.0, 2.85, state.galeStrength) * gFreq;
          for (let i = 0; i < SHARDS.length; i++) {
            state.shardAng[i] = wrapAngle(state.shardAng[i] + dt * SHARDS[i].omega * orbitMul);
          }

          // 狂风来袭时横掠白色气流线粒与风沙尘点
          if (vfx && state.galeStrength > 0.15) {
            state.gustCd -= dt;
            if (state.gustCd <= 0) {
              state.gustCd = 0.075;
              const [wx, wy] = localToWorldXY(
                state.x, state.y, state.yaw,
                (-22.0 + Math.random() * 6.0) * sMul,
                ((Math.random() - 0.5) * 24.0) * sMul
              );
              const [vx, vy] = localToWorldXY(0, 0, state.yaw, (34 + Math.random() * 18) * sMul, (Math.random() - 0.5) * 4.0 * sMul);
              vfx.spawnParticle(
                wx, wy,
                (10.0 + Math.random() * 28.0) * sMul,
                vx, vy,
                (Math.random() - 0.35) * 3.0 * sMul,
                0.55 + Math.random() * 0.25,
                Math.random() < 0.7 ? 1.2 : 0.9,
                Math.random() < 0.75 ? fx.windLine : fx.dust,
                false,
                0
              );
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const t = state.time;
          const cx = state.x;
          const cy = state.y;
          const gale = state.galeStrength;
          const rockLift = (4.8 + state.rockBob) * sMul;
          const fx = curSkin.fx || SKINS[0].fx;
          const list = [];

          // 1. 浮空风蚀主岩
          list.push({
            partKey: 'rockMain',
            asset: parts.rockMain,
            x: cx,
            y: cy,
            lift: Math.max(0.5, rockLift),
            ro: yw,
            bias: 0.0
          });

          // 2. 绕岩公转的 3 块小碎石（狂风时顺 +X 风向略微偏移）
          const windPush = gale * 3.8;
          for (let i = 0; i < SHARDS.length; i++) {
            const sh = SHARDS[i];
            const ang = state.shardAng[i];
            const lx = Math.cos(ang) * sh.r + windPush;
            const ly = Math.sin(ang) * sh.r * 0.88;
            const [sx, sy] = localToWorldXY(cx, cy, yw, lx * sMul, ly * sMul);
            const sz = sh.zBase + Math.sin(t * 2.1 + sh.ph0) * sh.bobAmp + state.rockBob * 0.45;
            list.push({
              partKey: `${sh.key}_${i}`,
              asset: parts[sh.key],
              x: sx,
              y: sy,
              lift: Math.max(0.8, sz * sMul),
              ro: wrapAngle(yw + ang * 1.4),
              symDeg: sh.key === 'shardSmall' ? 90 : 360,
              bias: 0.08
            });
          }

          // 3. 插在主岩顶的粗木风向竿
          const [px, py] = localToWorldXY(cx, cy, yw, 0.2 * sMul, -0.2 * sMul);
          const poleBaseZ = rockLift + 15.2 * sMul;
          list.push({
            partKey: 'windPole',
            asset: parts.windPole,
            x: px,
            y: py,
            lift: poleBaseZ,
            ro: yw,
            bias: 0.25
          });

          // 4. 竿顶 4 节鲜橘红长布风带（沿 +X 水平波浪舒展，狂风时高频大幅疾振）
          const segKeys = ['ribbonWide', 'ribbonWide', 'ribbonTail', 'ribbonTail'];
          const segStep = 6.2;
          const anchorZ = poleBaseZ + 18.8 * sMul;
          const ampY = lerp(1.35, 3.15, gale);
          const ampZ = lerp(0.55, 1.45, gale);
          let prevLx = 1.6;
          let prevLy = 0.0;
          for (let i = 0; i < segKeys.length; i++) {
            const u = (i + 1) / segKeys.length;
            const ph = state.wavePhase - i * 1.05;
            const curLx = 1.6 + (i + 0.5) * segStep;
            const curLy = Math.sin(ph) * ampY * u;
            const curLz = anchorZ + Math.cos(ph * 1.15) * ampZ * u * sMul;
            const dx = curLx - prevLx;
            const dy = curLy - prevLy;
            const localAng = Math.atan2(dy, dx);
            const [rx, ry] = localToWorldXY(px, py, yw, curLx * sMul, curLy * sMul);
            list.push({
              partKey: `ribbon_${i}`,
              asset: parts[segKeys[i]],
              x: rx,
              y: ry,
              lift: curLz,
              ro: wrapAngle(yw + localAng),
              bias: 0.40 + i * 0.04
            });
            prevLx = curLx;
            prevLy = curLy;
          }

          // 5. 狂风动作期间横掠过岩柱的 2 道清晰白色气流线（kind: 'line'）
          if (gale > 0.22) {
            for (let k = 0; k < 2; k++) {
              const prog = ((t * 2.2 + k * 0.5) % 1.0);
              const xStart = lerp(-24, 6, prog);
              const xEnd = xStart + 16;
              const yOff = (k === 0 ? -9.5 : 8.5);
              const zLine = (k === 0 ? 28.0 : 15.5) * sMul;
              const [x0, y0] = localToWorldXY(cx, cy, yw, xStart * sMul, yOff * sMul);
              const [x1, y1] = localToWorldXY(cx, cy, yw, xEnd * sMul, (yOff + Math.sin(t * 9 + k) * 1.4) * sMul);
              list.push({
                kind: 'line',
                x0, y0, z0: zLine,
                x1, y1, z1: zLine + Math.sin(t * 7 + k) * 1.2 * sMul,
                widthArtPx: 1,
                color: fx.windLine,
                opacity: clamp(gale * (1 - Math.abs(prog - 0.5) * 1.8), 0, 0.85),
                noOutline: true,
                segments: 6,
                jitter: 0.45 * sMul,
                jitterPhase: t * 14 + k * 2.1,
                bias: 0.72
              });
            }
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
