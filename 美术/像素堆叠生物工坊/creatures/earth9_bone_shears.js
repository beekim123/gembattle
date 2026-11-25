'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY, hash2i } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;

  // =========================================================================
  // 地9 · 啃骨头的一群（M13 编队群落 · 6 只骨白圆壳大剪刀嘴小兽 + 带缝巨骨）
  //
  // 【体貌与俯视清晰度设计】
  // - 俯视 ×4 放大关键特征色块：
  //   1. 骨白圆壳小兽（bodyShell 12×13×9）：高对比骨白圆甲 + 节纹骨脊，在遗骸深地面极为醒目；
  //   2. 极度放大横向大剪刀嘴（shearBladeL/R 10×11×6）：亮黑褐主刃 + 暗红锯齿镶边 + 象牙白内刃线，
  //      绕前端双枢轴高频横向咔咔交错开合，在深地与白骨上一眼看得出咔咔剪骨头；
  //   3. 自带 1 根带缝巨骨道具件（giantBone 34×14×10）：两端大骨节 + 清晰深色骨缝 + 残余暗红肉筋；
  //   4. 6 只成群轮流爬上巨骨顶面与骨缝两侧齐剪，每次合剪弹出白骨屑粒子，偶发受惊钻向骨缝躲藏。
  // - 预算检查：27 色 <= 48，0 重色，0 禁用字，全部部件单件 <= 34 格，严禁常态拉伸。
  // =========================================================================

  const SPEC = createPaletteSpec({
    pal: {
      // 小兽骨白圆壳（明亮高对比骨白）
      shellDark:  '#a89f91',
      shellMid:   '#dcd5c7',
      shellHi:    '#f7f3eb',
      // 壳背节纹与短足（暖灰褐）
      ridgeDark:  '#595047',
      ridgeMid:   '#85796d',
      ridgeHi:    '#b3a698',
      // 超大剪刀嘴主刃（亮黑褐，在白骨上对比极强）
      bladeDark:  '#1a1312',
      bladeMid:   '#3b2a26',
      bladeHi:    '#6b4e45',
      // 剪刀嘴外缘暗红镶边（醒目锯齿红边）
      trimDark:   '#6b1419',
      trimMid:    '#ad2429',
      trimHi:     '#e04843',
      // 剪刀内刃亮白锋线
      edgeHi:     '#ede7dc',
      // 小兽圆眼（亮琥珀，不进 glowKeys）
      eyeDark:    '#120d0c',
      eyeIris:    '#eb9f26',
      eyeGlint:   '#fffaf0',
      // 巨骨道具主色（陈旧巨兽白骨，不随皮肤大变）
      boneDark:   '#877e71',
      boneMid:    '#bfb6a6',
      boneHi:     '#ebe3d5',
      // 巨骨深裂骨缝（深暗褐）
      crackDark:  '#211a18',
      crackMid:   '#3d312d',
      // 巨骨残余暗红肉丝
      fleshDark:  '#541c1f',
      fleshMid:   '#872f32',
      fleshHi:    '#b84d4d',
      // 骨屑飞沫色
      chipA:      '#faf5eb',
      chipB:      '#d4cbb8'
    },
    glowKeys: [],
    parts: ['shell', 'ridge', 'blade', 'trim', 'edge', 'eye', 'bone', 'crack', 'flesh'],
    noCrease: [
      ['shell', 'ridge'], ['shell', 'eye'],
      ['blade', 'trim'], ['blade', 'edge'],
      ['bone', 'crack'], ['bone', 'flesh']
    ],
    materials: {
      shell: ['shellDark', 'shellMid', 'shellHi'],
      ridge: ['ridgeDark', 'ridgeMid', 'ridgeHi'],
      blade: ['bladeDark', 'bladeMid', 'bladeHi'],
      trim:  ['trimDark',  'trimMid',  'trimHi'],
      bone:  ['boneDark',  'boneMid',  'boneHi'],
      flesh: ['fleshDark', 'fleshMid', 'fleshHi']
    },
    protectedParts: ['eye', 'edge', 'crack']
  });

  // 3 套零重建模换色皮肤（0 禁用字，0 重色）
  const SKINS = [
    {
      id: 'ivory_shears',
      name: '白骨黑剪（遗骸经典）',
      dot: '#dcd5c7',
      outline: '#171110',
      pal: {},
      fx: { chipA: '#faf5eb', chipB: '#cfc5b0', meat: '#a83636' }
    },
    {
      id: 'amber_fossil',
      name: '陈骨赤剪（古骸款）',
      dot: '#d9b98b',
      outline: '#21140d',
      pal: {
        shellDark: '#9e815b', shellMid: '#d4b587', shellHi: '#f5e2bf',
        ridgeDark: '#5e462d', ridgeMid: '#8c6b47', ridgeHi: '#ba956a',
        bladeDark: '#26140f', bladeMid: '#52291c', bladeHi: '#854630',
        trimDark:  '#7d2412', trimMid:  '#c73e1c', trimHi:  '#f26c44',
        eyeIris:   '#ffd24d'
      },
      fx: { chipA: '#f7e7c8', chipB: '#c9ad7f', meat: '#bd452b' }
    },
    {
      id: 'ash_carapace',
      name: '灰骨墨剪（深坑款）',
      dot: '#a8b0ba',
      outline: '#10121a',
      pal: {
        shellDark: '#7a828c', shellMid: '#b5bec9', shellHi: '#e6ecf2',
        ridgeDark: '#424954', ridgeMid: '#687382', ridgeHi: '#95a1b0',
        bladeDark: '#14151f', bladeMid: '#2c3045', bladeHi: '#525978',
        trimDark:  '#631736', trimMid:  '#a32656', trimHi:  '#db4d81',
        eyeIris:   '#8ce0d4'
      },
      fx: { chipA: '#e8eef5', chipB: '#adb7c4', meat: '#9c2d50' }
    }
  ];

  // =========================================================================
  // 1. 骨白圆壳小兽躯干（12×13×9，两档步足姿态：strideA / strideB）
  // =========================================================================
  function buildBodyShell(makeCanvas, strideFlip) {
    const W = 12, D = 13, H = 9;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 饱满圆润骨白甲壳
    m.fillAABB(-5.0, 5.0, -5.8, 5.2, 1, H - 1, (x, y, z, X, Y) => {
      const dDome = (Math.hypot(X / 4.2, (Y + 0.4) / 4.9, (z - 3.6) / 3.9) - 1.0) * 3.8;
      if (dDome > 0 || z < 2) return;
      // 横向潮虫式骨壳节纹
      const rib = Math.abs(Math.sin((Y + 0.5) * 1.45));
      if (z >= 5.2 && rib < 0.22 && Y < 2.2) {
        m.setRaw(x, y, z, mat('ridge'), partId.ridge);
      } else {
        m.setRaw(x, y, z, mat('shell'), partId.shell);
      }
    });

    // 前端剪刀嘴基座（深暗褐关节丘，与大剪刀无缝咬合）
    m.paintEllipsoid(0, 3.8, 3.6, 2.8, 1.8, 1.8, mat('blade'), partId.blade, true);

    // 尾部两根小骨刺
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 1.4, -4.4, 3.2, s * 2.2, -5.8, 2.6, 0.72, 0.45, mat('ridge'), partId.ridge, true);
    }

    // 两侧 3 对小短足（两档交错步态，爬行像潮虫蚂蚁）
    const legYs = [1.8, -0.8, -3.2];
    for (let k = 0; k < 3; k++) {
      for (const s of [-1, 1]) {
        const phase = ((k + (s > 0 ? 1 : 0)) % 2 === 0) ? strideFlip : -strideFlip;
        const ly = legYs[k] + phase * 0.85;
        const lz = phase > 0 ? 1.8 : 1.0;
        m.paintCapsule(s * 3.2, legYs[k], 2.4, s * 5.2, ly, lz, 0.82, 0.55, mat('ridge'), partId.ridge, true);
      }
    }

    m.despeckle();
    m.applyArtShading(true);

    // 前端两侧亮琥珀小眼
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const eyeY = Math.round(hd + 2.8);
    const eyeZ = 5;
    for (const s of [-1, 1]) {
      const ex = Math.round(hw + s * 2.6);
      m.setRaw(ex, eyeY, eyeZ, keyToId.eyeIris, partId.eye);
      m.setRaw(ex, eyeY + 1, eyeZ, keyToId.eyeDark, partId.eye);
      m.setRaw(ex, eyeY, eyeZ + 1, keyToId.eyeGlint, partId.eye);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 5.0, headZ: 8, centerZ: 4 });
  }

  // =========================================================================
  // 2. 极度放大的横向大剪刀嘴硬片（左/右独立旋转开合，亮黑褐 + 暗红镶边 + 白刃线）
  // =========================================================================
  const SHEAR_PIVOT = { x: 1.5, y: -3.2, attachX: 1.7, attachY: 4.1 };

  function buildShearBlade(makeCanvas, side) {
    const W = 10, D = 11, H = 6;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 枢轴位于底座偏内后侧，整片大剪刀向前弯曲内勾形成巨型剪刀钳！
    const rx = -side * SHEAR_PIVOT.x;
    const ry = SHEAR_PIVOT.y;

    // 粗壮亮黑褐剪刀主刃（前弯内勾）
    m.paintCapsule(rx, ry, 2.8, side * 3.2, 0.8, 3.0, 1.85, 1.55, mat('blade'), partId.blade, true);
    m.paintCapsule(side * 3.2, 0.8, 3.0, side * 0.4, 4.4, 2.8, 1.45, 0.72, mat('blade'), partId.blade, true);
    m.paintFinTri([rx, ry + 0.4, 2.8], [side * 3.6, 0.8, 3.2], [side * 0.2, 4.6, 2.8], 0.95, mat('blade'), partId.blade, false);

    // 外缘醒目暗红镶边（在白骨和暗地上形成高辨识度红黑轮廓）
    m.paintCapsule(rx + side * 0.9, ry + 0.4, 3.4, side * 4.0, 0.9, 3.6, 0.92, 0.78, mat('trim'), partId.trim, true);
    m.paintCapsule(side * 4.0, 0.9, 3.6, side * 1.4, 4.4, 3.4, 0.82, 0.55, mat('trim'), partId.trim, true);

    m.despeckle();
    m.applyArtShading(true);

    // 内侧剪刃白亮锋线（锯齿亮锋，咔咔开合极其显眼）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const teeth = [
      [side * 1.2, 0.6],
      [side * 1.6, 2.2],
      [side * 0.8, 3.5]
    ];
    for (const [tx, ty] of teeth) {
      const gx = Math.round(hw + tx);
      const gy = Math.round(hd + ty);
      m.setRaw(gx, gy, 3, keyToId.edgeHi, partId.edge);
      m.setRaw(gx, gy, 4, keyToId.edgeHi, partId.edge);
    }

    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 5, centerZ: 3 });
  }

  // =========================================================================
  // 3. 自带带缝巨骨道具件（34×14×10）：双端大骨节 + 深色骨缝 + 残余肉丝
  // =========================================================================
  function buildGiantBone(makeCanvas) {
    const W = 34, D = 14, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;

    // 巨骨中段骨干（横向放置，略带自然弧度）
    m.paintCapsule(-11.5, 0.0, 4.2, 11.5, 0.0, 4.2, 3.2, 3.2, mat('bone'), partId.bone, true);
    // 左端双圆骨节
    m.paintEllipsoid(-12.8,  2.8, 4.6, 3.4, 3.2, 3.4, mat('bone'), partId.bone, true);
    m.paintEllipsoid(-12.6, -2.8, 4.4, 3.4, 3.2, 3.2, mat('bone'), partId.bone, true);
    // 右端双圆骨节
    m.paintEllipsoid( 12.8,  2.8, 4.6, 3.4, 3.2, 3.4, mat('bone'), partId.bone, true);
    m.paintEllipsoid( 12.6, -2.8, 4.4, 3.4, 3.2, 3.2, mat('bone'), partId.bone, true);

    // 骨干上残余的暗红肉筋斑（小兽围啃的对象）
    m.paintEllipsoid(-4.2, 2.2, 6.2, 2.6, 1.5, 1.2, mat('flesh'), partId.flesh, true);
    m.paintEllipsoid( 5.0, -2.0, 6.0, 2.4, 1.4, 1.2, mat('flesh'), partId.flesh, true);
    m.paintEllipsoid( 0.6, 0.5, 6.8, 1.8, 1.2, 1.0, mat('flesh'), partId.flesh, true);

    m.despeckle();
    m.applyArtShading(true);

    // 刻出清晰深色骨缝（供受惊时小兽钻近躲藏，俯视清晰可见）
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (let xOff = -7; xOff <= 7; xOff++) {
      const gx = Math.round(hw + xOff);
      const gy = Math.round(hd + Math.sin(xOff * 0.42) * 1.1);
      for (let z = 5; z <= 8; z++) {
        if (m.getId(gx, gy, z)) {
          m.setRaw(gx, gy, z, z >= 7 ? keyToId.crackDark : keyToId.crackMid, partId.crack);
        }
      }
    }
    // 两侧深骨洞入口（受惊钻缝处）
    for (const bx of [-6, 6]) {
      const gx = Math.round(hw + bx);
      for (let dy = -1; dy <= 1; dy++) {
        m.setRaw(gx, Math.round(hd + 3 + dy), 3, keyToId.crackDark, partId.crack);
        m.setRaw(gx, Math.round(hd - 3 + dy), 3, keyToId.crackDark, partId.crack);
      }
    }

    return m.toStripAsset(makeCanvas, { footRadius: 14.5, headZ: 9, centerZ: 4 });
  }

  // =========================================================================
  // 6 只啃骨小兽成员档案（骨顶 2 只 + 骨侧 4 只，轮流爬骨与外圈巡游）
  // =========================================================================
  const SHEARER_PROFILES = [
    { idx: 0, onBone: true,  gnawLX: -4.5, gnawLY:  0.6, gnawZ: 7.4, gnawYaw:  0.2, patrolR: 20.5, patrolSpd: 0.72, ang0: 0.3, snipFreq: 13.5, phase: 0.0 },
    { idx: 1, onBone: true,  gnawLX:  4.8, gnawLY: -0.4, gnawZ: 7.4, gnawYaw: -2.8, patrolR: 24.0, patrolSpd: 0.66, ang0: 1.4, snipFreq: 12.8, phase: 1.1 },
    { idx: 2, onBone: false, gnawLX: -7.5, gnawLY:  6.4, gnawZ: 0.6, gnawYaw:  Math.PI, patrolR: 27.5, patrolSpd: 0.62, ang0: 2.5, snipFreq: 14.2, phase: 2.2 },
    { idx: 3, onBone: false, gnawLX:  2.2, gnawLY:  6.2, gnawZ: 0.6, gnawYaw:  Math.PI, patrolR: 22.0, patrolSpd: 0.76, ang0: 3.6, snipFreq: 13.0, phase: 3.3 },
    { idx: 4, onBone: false, gnawLX:  8.0, gnawLY: -6.4, gnawZ: 0.6, gnawYaw:  0.0, patrolR: 29.0, patrolSpd: 0.58, ang0: 4.7, snipFreq: 13.8, phase: 4.4 },
    { idx: 5, onBone: false, gnawLX: -2.4, gnawLY: -6.2, gnawZ: 0.6, gnawYaw:  0.0, patrolR: 25.5, patrolSpd: 0.69, ang0: 5.6, snipFreq: 12.4, phase: 5.5 }
  ];

  const Earth9Def = {
    id: 'earth9_bone_shears',
    code: '地9',
    status: 'done',
    name: '啃骨头的一群',
    tag: 'M13 编队群落 · 6只大剪刀嘴齐啃带缝巨骨',
    summary: '6 只共享资产的骨白圆壳小兽，前端一对极度放大的亮黑褐暗红镶边横向大剪刀嘴；自带 1 根带缝巨骨道具件，成群爬上骨脊与骨侧咔咔齐剪飞出白骨屑，偶发受惊缩向骨缝',
    defaultHabitat: 'carcass',
    footRadius: 0.5,
    ecoWeight: 0.7,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'patrol', name: '自由巡游', loop: true,  status: 'done' },
      { id: 'idle',   name: '原地待机', loop: true,  status: 'done' },
      { id: 'gnaw',   name: '齐剪巨骨', loop: false, duration: 3.8, status: 'done' }
    ],
    blocks: [
      '6 只共享贴图骨白圆壳小兽 + 两档潮虫步足交替',
      '极度放大亮黑褐/暗红镶边横向大剪刀嘴（双枢轴高频开合）',
      '自带 34 格带缝巨骨道具件（骨节 + 深裂骨缝 + 残余肉筋）',
      '成群爬骨齐剪飞白骨屑 + 周期性受惊缩缝再探头'
    ],
    soulHabit: '6 只骨白圆壳小兽如蚂蚁潮虫般围着带缝巨骨成群爬行 -> 纷纷爬上骨脊与骨缝两侧，亮黑褐暗红边大剪刀嘴齐刷刷咔咔合剪、骨屑四溅 -> 偶有动静便齐齐贴进骨缝缩壳躲片刻，随即再度涌出啃剔',
    defaultParams: {
      gaitFreq: 1.0,
      tailFlex: 1.0,
      springiness: 1.0,
      speed: 1.0,
      scaleMul: 1.0
    },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        bodyA:       buildBodyShell(makeCanvas,  1),
        bodyB:       buildBodyShell(makeCanvas, -1),
        shearBladeL: buildShearBlade(makeCanvas, -1),
        shearBladeR: buildShearBlade(makeCanvas,  1),
        giantBone:   buildGiantBone(makeCanvas)
      };

      const recolorAssets = [parts.bodyA, parts.bodyB, parts.shearBladeL, parts.shearBladeR];

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const hyaw0 = opts.homeYaw ?? 0;
      const seed = opts.seed ?? 67;

      const bone = {
        x: hx0,
        y: hy0,
        z: 0.5,
        yaw: 0.28,
        shake: new SpringDamper1D(0, 110, 7.5)
      };

      const members = SHEARER_PROFILES.map((p) => ({
        ...p,
        x: hx0,
        y: hy0,
        z: 0.6,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        ang: p.ang0,
        stridePhase: p.phase * 2.0,
        snipPhase: p.phase * 1.5,
        shearOpen: 0.35,
        prevSnipSign: 1,
        chipCd: 0.15 * p.idx
      }));

      const state = {
        x: hx0,
        y: hy0,
        z: 1.2,
        vx: 0,
        vy: 0,
        yaw: hyaw0,
        swarmPhase: 'gnaw', // 'gnaw' | 'forage' | 'hide'
        phaseTimer: 0
      };

      const sockets = new SocketTracker();
      const footContacts = Array.from({ length: SHEARER_PROFILES.length + 1 }, () => ({ x: hx0, y: hy0, z: 0, r: 4.5 }));
      let curSkin = SKINS[0];

      function clampSafe(x, y, cx, cy, limitR) {
        const dx = x - cx, dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (d > limitR && d > 0.001) {
          return [cx + (dx / d) * limitR, cy + (dy / d) * limitR];
        }
        return [x, y];
      }

      const instance = {
        def: Earth9Def,
        cachePrefix: `earth9_bone_shears_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        footContacts,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(skinIdx) {
          curSkin = SKINS[((skinIdx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of recolorAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(homeX, homeY, homeYaw) {
          state.x = homeX;
          state.y = homeY;
          state.z = 1.2;
          state.vx = 0;
          state.vy = 0;
          state.yaw = homeYaw;
          state.swarmPhase = 'gnaw';
          state.phaseTimer = 0;

          bone.x = homeX;
          bone.y = homeY;
          bone.z = 0.5;
          bone.yaw = 0.28;
          bone.shake.x = bone.shake.v = 0;

          for (let i = 0; i < members.length; i++) {
            const mb = members[i];
            const [gx, gy] = localToWorldXY(bone.x, bone.y, bone.yaw, mb.gnawLX, mb.gnawLY);
            mb.x = gx;
            mb.y = gy;
            mb.z = mb.gnawZ;
            mb.vx = 0;
            mb.vy = 0;
            mb.yaw = wrapAngle(bone.yaw + mb.gnawYaw);
            mb.ang = mb.ang0;
            mb.shearOpen = 0.35;
          }
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const spdMul = clamp(params.speed ?? 1.0, 0.3, 2.2);
          const action = eco && eco.action ? eco.action : (eco && eco.patrol === false ? 'idle' : 'patrol');
          const isIdle = action === 'idle';
          const isGnawAction = action === 'gnaw';
          const homeX = (eco && eco.homeX) ?? 0;
          const homeY = (eco && eco.homeY) ?? 0;
          const rawMaxR = (eco && eco.maxRadius) || 48;
          const safeR = rawMaxR * 0.78;
          const fx = curSkin.fx || SKINS[0].fx;

          // 巨骨微震弹簧（被齐剪时微微颤动）
          const shakeVal = bone.shake.update(dt, 0, 110 * sp, 7.5);
          bone.x = homeX + shakeVal * 0.35 * sMul;
          bone.y = homeY;
          bone.z = 0.5 * sMul;

          // 巡游三态循环：成群啃骨(4.6s) -> 外圈成群爬巡(3.8s) -> 偶发受惊贴骨缝(1.8s)
          if (isGnawAction) {
            state.swarmPhase = 'gnaw';
          } else if (isIdle) {
            state.swarmPhase = 'gnaw';
          } else {
            state.phaseTimer += dt * (0.7 + spdMul * 0.3);
            if (state.swarmPhase === 'gnaw' && state.phaseTimer >= 4.6) {
              state.swarmPhase = 'forage';
              state.phaseTimer = 0;
            } else if (state.swarmPhase === 'forage' && state.phaseTimer >= 3.8) {
              state.swarmPhase = 'hide';
              state.phaseTimer = 0;
            } else if (state.swarmPhase === 'hide' && state.phaseTimer >= 1.8) {
              state.swarmPhase = 'gnaw';
              state.phaseTimer = 0;
            }
          }

          let sumX = 0, sumY = 0, sumZ = 0;
          const mode = state.swarmPhase;

          for (let i = 0; i < members.length; i++) {
            const mb = members[i];
            mb.chipCd = Math.max(0, mb.chipCd - dt);

            let tgtX, tgtY, tgtZ, idealYaw;
            let activeSnip = false;

            if (mode === 'gnaw') {
              // 爬上巨骨顶面与骨缝两侧，齐刷刷对着骨头咔咔剪
              const wiggleX = Math.sin(time * 2.2 + mb.phase) * 0.9;
              const wiggleY = Math.cos(time * 1.9 + mb.phase) * 0.6;
              const [gx, gy] = localToWorldXY(
                bone.x, bone.y, bone.yaw,
                (mb.gnawLX + wiggleX) * sMul,
                (mb.gnawLY + wiggleY) * sMul
              );
              tgtX = gx;
              tgtY = gy;
              tgtZ = mb.gnawZ * sMul;
              idealYaw = wrapAngle(bone.yaw + mb.gnawYaw + Math.sin(time * 3.0 + mb.phase) * 0.14);
              activeSnip = Math.hypot(tgtX - mb.x, tgtY - mb.y) < 5.5 * sMul;
            } else if (mode === 'hide') {
              // 受惊缩进骨缝边（紧贴巨骨中心裂隙收拢剪刀）
              const hideLX = (i % 2 === 0 ? -5.8 : 5.8) + (i - 2.5) * 0.7;
              const hideLY = (i < 3 ? 3.2 : -3.2);
              const [hx, hy] = localToWorldXY(bone.x, bone.y, bone.yaw, hideLX * sMul, hideLY * sMul);
              tgtX = hx;
              tgtY = hy;
              tgtZ = 0.6 * sMul;
              idealYaw = wrapAngle(bone.yaw + (hideLY > 0 ? Math.PI : 0));
              activeSnip = false;
            } else {
              // 外圈成群结队蚁行巡游（沿巨骨外围快速碎步兜圈寻找下一段骨节）
              mb.ang = wrapAngle(mb.ang + dt * mb.patrolSpd * spdMul * 1.15);
              const r = clamp((mb.patrolR + Math.sin(time * 2.0 + mb.phase) * 2.5) * sMul, 16.0 * sMul, safeR);
              tgtX = homeX + Math.cos(mb.ang) * r;
              tgtY = homeY + Math.sin(mb.ang) * r;
              tgtZ = 0.6 * sMul;
              const tanX = -Math.sin(mb.ang), tanY = Math.cos(mb.ang);
              idealYaw = Math.atan2(-tanX, tanY);
              activeSnip = false;
            }

            // 成员间分离，防止堆叠穿模
            let sepX = 0, sepY = 0;
            for (let j = 0; j < members.length; j++) {
              if (i === j) continue;
              const o = members[j];
              const dx = mb.x - o.x, dy = mb.y - o.y;
              const d = Math.hypot(dx, dy) || 0.001;
              const minSep = (mode === 'hide' ? 6.2 : 8.5) * sMul;
              if (d < minSep) {
                const push = (minSep - d) * 1.6;
                sepX += (dx / d) * push;
                sepY += (dy / d) * push;
              }
            }

            const [cx, cy] = clampSafe(tgtX + sepX, tgtY + sepY, homeX, homeY, safeR);
            const kMove = expSmooth(dt, mode === 'hide' ? 7.5 : 5.4);
            const nx = lerp(mb.x, cx, kMove);
            const ny = lerp(mb.y, cy, kMove);
            mb.vx = (nx - mb.x) / Math.max(dt, 0.001);
            mb.vy = (ny - mb.y) / Math.max(dt, 0.001);
            mb.x = nx;
            mb.y = ny;
            const [fxPos, fyPos] = clampSafe(mb.x, mb.y, homeX, homeY, rawMaxR * 0.80);
            mb.x = fxPos;
            mb.y = fyPos;

            mb.z = lerp(mb.z, tgtZ, expSmooth(dt, 7.0));

            const spd = Math.hypot(mb.vx, mb.vy);
            const desiredYaw = spd > 3.2 ? Math.atan2(-mb.vx, mb.vy) : idealYaw;
            mb.yaw = wrapAngle(mb.yaw + wrapAngle(desiredYaw - mb.yaw) * expSmooth(dt, 8.5));

            // 潮虫碎步交替相位
            mb.stridePhase = (mb.stridePhase + dt * (spd > 1.5 ? 14.0 : 4.0) * gFreq) % TAU;

            // 大剪刀嘴咔咔高频开合（gnaw 态齐剪飞出白骨屑！）
            const snipSpd = (activeSnip ? (isGnawAction ? 1.35 : 1.0) : (mode === 'hide' ? 0.15 : 0.45)) * mb.snipFreq * gFreq;
            mb.snipPhase = (mb.snipPhase + dt * snipSpd) % TAU;
            const snipWave = Math.sin(mb.snipPhase);
            // 咔咔剪动波形：快速合拢停顿感，视觉极清脆
            mb.shearOpen = mode === 'hide'
              ? 0.04
              : (activeSnip ? (0.04 + Math.pow(Math.max(0, snipWave), 1.4) * 0.62) : (0.18 + Math.max(0, snipWave) * 0.24));

            // 合剪瞬间触发白骨屑粒子 + 巨骨微颤
            const curSign = snipWave >= 0 ? 1 : -1;
            if (activeSnip && mb.prevSnipSign > 0 && curSign < 0 && mb.chipCd <= 0) {
              mb.chipCd = 0.22;
              bone.shake.impulse(2.6 * sp * (i % 2 === 0 ? 1 : -1));
              if (vfx) {
                const [mx, my] = localToWorldXY(mb.x, mb.y, mb.yaw, 0, 7.2 * sMul);
                const chipCount = isGnawAction ? 5 : 3;
                for (let k = 0; k < chipCount; k++) {
                  const a = hash2i(i + k * 7, Math.floor(time * 20), seed + 31) * TAU;
                  const spdP = (7 + (k % 3) * 4) * sMul;
                  const col = k % 2 === 0 ? fx.chipA : fx.chipB;
                  vfx.spawnParticle(
                    mx, my, mb.z + 3.2 * sMul,
                    Math.cos(a) * spdP, Math.sin(a) * spdP, (9 + (k % 3) * 4) * sMul,
                    0.46, 1.25, col, false, 30
                  );
                }
              }
            }
            mb.prevSnipSign = curSign;

            footContacts[i].x = mb.x;
            footContacts[i].y = mb.y;
            footContacts[i].z = mb.z;
            footContacts[i].r = 4.6 * sMul;

            sumX += mb.x;
            sumY += mb.y;
            sumZ += mb.z;
          }

          // 巨骨底座接地印
          footContacts[SHEARER_PROFILES.length].x = bone.x;
          footContacts[SHEARER_PROFILES.length].y = bone.y;
          footContacts[SHEARER_PROFILES.length].z = 0.4;
          footContacts[SHEARER_PROFILES.length].r = 12.5 * sMul;

          state.x = sumX / members.length;
          state.y = sumY / members.length;
          state.z = sumZ / members.length;
          state.yaw = members[0].yaw;
          sockets.setWorld('giantBone', bone.x, bone.y, bone.z + 5 * sMul, bone.yaw);
          sockets.setWorld('leadShearer', members[0].x, members[0].y, members[0].z + 4 * sMul, members[0].yaw);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;

          // 1. 中央带缝巨骨道具件
          list.push({
            partKey: 'giantBone',
            asset: parts.giantBone,
            x: bone.x,
            y: bone.y,
            lift: Math.max(0.4, bone.z),
            ro: bone.yaw,
            bias: -0.35,
            submerge: 0
          });

          // 2. 6 只大剪刀嘴骨白小兽
          for (let i = 0; i < members.length; i++) {
            const mb = members[i];
            const yw = mb.yaw;
            const onTopBias = mb.z > 3.0 * sMul ? 1.25 : 0.15;
            const bodyKey = Math.sin(mb.stridePhase) >= 0 ? 'bodyA' : 'bodyB';

            // A) 骨白圆壳躯干
            list.push({
              partKey: bodyKey,
              asset: parts[bodyKey],
              x: mb.x,
              y: mb.y,
              lift: Math.max(0.5, mb.z),
              ro: yw,
              bias: onTopBias,
              submerge: 0
            });

            // B) 极度放大的左/右横向大剪刀嘴硬片（绕前端双枢轴咔咔横向开合）
            const openAng = mb.shearOpen;
            const lYaw = wrapAngle(yw + openAng);
            const rYaw = wrapAngle(yw - openAng);

            const [ljx, ljy] = localToWorldXY(mb.x, mb.y, yw, -SHEAR_PIVOT.attachX * sMul, SHEAR_PIVOT.attachY * sMul);
            const [lx, ly] = pivotToWorldXY(ljx, ljy, lYaw, SHEAR_PIVOT.x * sMul, SHEAR_PIVOT.y * sMul);
            list.push({
              partKey: 'shearBladeL',
              asset: parts.shearBladeL,
              x: lx,
              y: ly,
              lift: Math.max(0.5, mb.z + 1.2 * sMul),
              ro: lYaw,
              bias: onTopBias + 0.18,
              submerge: 0
            });

            const [rjx, rjy] = localToWorldXY(mb.x, mb.y, yw, SHEAR_PIVOT.attachX * sMul, SHEAR_PIVOT.attachY * sMul);
            const [rx, ry] = pivotToWorldXY(rjx, rjy, rYaw, -SHEAR_PIVOT.x * sMul, SHEAR_PIVOT.y * sMul);
            list.push({
              partKey: 'shearBladeR',
              asset: parts.shearBladeR,
              x: rx,
              y: ry,
              lift: Math.max(0.5, mb.z + 1.4 * sMul),
              ro: rYaw,
              bias: onTopBias + 0.22,
              submerge: 0
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: Earth9Def.id,
            code: Earth9Def.code,
            status: Earth9Def.status,
            name: Earth9Def.name,
            outlineMode: 'actorUnified',
            skin: curSkin.id,
            flockCount: members.length,
            swarmPhase: state.swarmPhase,
            footRadius: 5.0,
            headZ: 9,
            centerZ: 4,
            blocks: Earth9Def.blocks,
            params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(hx0, hy0, hyaw0);
      return instance;
    }
  };

  PW.Creatures.push(Earth9Def);
})(window.PixelWorkshop);
