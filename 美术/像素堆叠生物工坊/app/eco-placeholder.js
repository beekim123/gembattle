'use strict';
// =============================================================================
// 生态占位体素生物工厂（给还没做模型的生物上台用）
//   - 按体型（小 / 中 / 大）+ 生态位主色 + 模板轮廓，生成极简像素堆叠体素块；
//   - 同「体型 × 形态 × 生态位」共享同一份 VoxelModel，全部未做生物共用不到 0.5MB 贴图；
//   - 复用工坊的 StackRenderer / Behaviors，支持巡游和原地待机；
//   - 以后某个生物做好真模型后，由生态页按 impl / code 自动替换，这里零耦合。
// =============================================================================
window.EcoPlaceholder = (function () {
  const PW = window.PixelWorkshop;
  const { clamp, lerp } = PW.Math;
  const { createPaletteSpec, VoxelModel } = PW.Voxel;
  const { Propulsion } = PW.Behaviors;

  // 生态位 3 档色阶（明 / 中 / 暗 + 边线 + 点缀）
  const NICHE_PAL = {
    '吃草':     { dark: '#35662a', mid: '#5b9a48', hi: '#9cd17e', acc: '#dcf5c4', out: '#152b12' },
    '追猎':     { dark: '#7a2018', mid: '#c0392b', hi: '#ec7968', acc: '#ffd6cc', out: '#2d0c09' },
    '伏击':     { dark: '#54246b', mid: '#8e44ad', hi: '#c284de', acc: '#efd8fa', out: '#210d2b' },
    '分解':     { dark: '#4c3621', mid: '#7a5a3a', hi: '#b08b64', acc: '#e3cfb4', out: '#21170d' },
    '寄生清洁': { dark: '#883400', mid: '#d35400', hi: '#f2954e', acc: '#ffdfc2', out: '#301300' },
    '传粉播种': { dark: '#87630a', mid: '#d4a017', hi: '#f2cf5c', acc: '#fff2bd', out: '#2e2104' },
    '改地形':   { dark: '#1a4c4d', mid: '#2c7a7b', hi: '#64b5b5', acc: '#c5eeee', out: '#0b2223' },
    '驮着共生': { dark: '#184285', mid: '#2b6fd6', hi: '#71a8f2', acc: '#cfe3ff', out: '#0b1c38' }
  };

  // 按体型字符串归档
  function parseSize(sizeStr) {
    const s = String(sizeStr || '');
    if (s.includes('大') && !s.includes('小')) return 'L';
    if (s.includes('铺开') || s.includes('很长')) return 'L';
    if (s.includes('小') && !s.includes('中') && !s.includes('大')) return 'S';
    return 'M';
  }

  // 按模板分 6 种一眼能看出动法的极简轮廓
  function shapeForTpl(tpl) {
    if (tpl === 'M01' || tpl === 'M02' || tpl === 'M28' || tpl === 'M29') return 'fly';
    if (tpl === 'M03' || tpl === 'M04' || tpl === 'M18' || tpl === 'M22' || tpl === 'M23') return 'long';
    if (tpl === 'M19' || tpl === 'M37' || tpl === 'M38' || tpl === 'M33') return 'flat';
    if (tpl === 'M26' || tpl === 'M25') return 'tall';
    if (tpl === 'M35' || tpl === 'M10' || tpl === 'M30' || tpl === 'M32' || tpl === 'M34') return 'stack';
    return 'cube';
  }

  // 共享资产缓存（按 niche|size|shape 复用）
  const assetCache = new Map();

  function getSharedAssets(nicheId, sizeKey, shape, makeCanvas) {
    const key = `${nicheId}|${sizeKey}|${shape}`;
    if (assetCache.has(key)) return assetCache.get(key);

    const p = NICHE_PAL[nicheId] || NICHE_PAL['吃草'];
    const spec = createPaletteSpec({
      pal: {
        bodyDark: p.dark,
        bodyMid: p.mid,
        bodyHi: p.hi,
        accDark: '#8b93a0',
        accMid: p.acc,
        accHi: '#ffffff',
        eyeDark: '#161c26',
        eyeHi: '#ffffff'
      },
      glowKeys: [],
      parts: ['body', 'acc', 'eye'],
      noCrease: [['eye', 'body'], ['acc', 'body']],
      materials: {
        body: ['bodyDark', 'bodyMid', 'bodyHi'],
        acc: ['accDark', 'accMid', 'accHi']
      },
      protectedParts: ['eye']
    });
    const mBody = spec.mat('body');
    const mAcc = spec.mat('acc');
    const kEye = spec.keyToId.eyeDark;
    const kWhite = spec.keyToId.eyeHi;
    const pBody = spec.partId.body;
    const pAcc = spec.partId.acc;
    const pEye = spec.partId.eye;

    const sc = sizeKey === 'S' ? 0.72 : (sizeKey === 'L' ? 1.38 : 1.0);
    let W, D, H;
    if (shape === 'flat') {
      W = Math.round(24 * sc); D = Math.round(24 * sc); H = Math.max(5, Math.round(6 * sc));
    } else if (shape === 'long') {
      W = Math.round(14 * sc); D = Math.round(26 * sc); H = Math.round(12 * sc);
    } else if (shape === 'fly') {
      W = Math.round(26 * sc); D = Math.round(16 * sc); H = Math.round(10 * sc);
    } else if (shape === 'tall') {
      W = Math.round(14 * sc); D = Math.round(14 * sc); H = Math.round(24 * sc);
    } else if (shape === 'stack') {
      W = Math.round(18 * sc); D = Math.round(18 * sc); H = Math.round(20 * sc);
    } else {
      W = Math.round(16 * sc); D = Math.round(18 * sc); H = Math.round(15 * sc);
    }
    W = clamp(W, 10, 34); D = clamp(D, 10, 34); H = clamp(H, 5, 28);

    const m = new VoxelModel(W, D, H, spec);
    const rx = W * 0.42, ry = D * 0.42, rz = H * 0.44;

    if (shape === 'flat') {
      m.paintEllipsoid(0, 0, H * 0.42, rx, ry, rz, mBody, pBody);
      m.paintEllipsoid(0, 0, H * 0.76, rx * 0.56, ry * 0.56, Math.max(1.2, rz * 0.35), mAcc, pAcc);
    } else if (shape === 'long') {
      m.paintCapsule(0, -ry * 0.72, rz * 0.85, 0, ry * 0.72, rz * 0.92, rx * 0.82, rx * 0.92, mBody, pBody);
      m.paintEllipsoid(0, ry * 0.12, H * 0.72, rx * 0.48, ry * 0.45, rz * 0.32, mAcc, pAcc);
    } else if (shape === 'fly') {
      m.paintEllipsoid(0, 0, H * 0.48, rx * 0.48, ry * 0.78, rz * 0.82, mBody, pBody);
      m.paintCapsule(-rx * 0.92, -ry * 0.08, H * 0.54, rx * 0.92, -ry * 0.08, H * 0.54, 2.2 * sc, 2.2 * sc, mAcc, pAcc);
    } else if (shape === 'tall') {
      // 底座小脚 + 细立柱 + 高处圆身
      const legR = Math.max(1.1, 1.3 * sc);
      const off = rx * 0.55;
      m.paintCapsule(-off, -off, 0, -off * 0.45, -off * 0.45, H * 0.65, legR, legR, mAcc, pAcc);
      m.paintCapsule( off, -off, 0,  off * 0.45, -off * 0.45, H * 0.65, legR, legR, mAcc, pAcc);
      m.paintCapsule(-off,  off, 0, -off * 0.45,  off * 0.45, H * 0.65, legR, legR, mAcc, pAcc);
      m.paintCapsule( off,  off, 0,  off * 0.45,  off * 0.45, H * 0.65, legR, legR, mAcc, pAcc);
      m.paintEllipsoid(0, 0, H * 0.74, rx * 0.88, ry * 0.88, H * 0.24, mBody, pBody);
    } else if (shape === 'stack') {
      // 3 层错落方台，一眼看得出层叠/构筑特征
      for (let lv = 0; lv < 3; lv++) {
        const z0 = Math.round((lv * H) / 3);
        const z1 = Math.max(z0 + 2, Math.round(((lv + 0.76) * H) / 3));
        const r = rx * (1.0 - lv * 0.14);
        m.fillAABB(-r, r, -r, r, z0, z1, (x, y, z) => {
          m.setRaw(x, y, z, lv === 1 ? mAcc : mBody, lv === 1 ? pAcc : pBody);
        });
      }
    } else {
      // 圆润带切角体素方块
      m.fillAABB(-rx, rx, -ry, ry, 0, H - 1, (x, y, z, X, Y) => {
        const ax = Math.abs(X) / rx, ay = Math.abs(Y) / ry, az = Math.abs(z - H * 0.48) / (H * 0.52);
        if (ax * ax * ax + ay * ay * ay + az * az * az <= 1.15) {
          m.setRaw(x, y, z, z > H * 0.74 ? mAcc : mBody, z > H * 0.74 ? pAcc : pBody);
        }
      });
    }

    // 朝前 (+Y) 点一对极简豆豆眼，方便辨认朝向
    if (shape !== 'flat' && shape !== 'stack') {
      const eyeZ = clamp(Math.round(shape === 'tall' ? H * 0.74 : H * 0.58), 1, H - 2);
      const eyeY = clamp(Math.round(D * 0.5 + ry * 0.72), 0, D - 1);
      const dx = Math.max(1, Math.round(rx * 0.34));
      const cx = Math.floor(W * 0.5);
      m.setRaw(cx - dx, eyeY, eyeZ, kEye, pEye);
      m.setRaw(cx + dx, eyeY, eyeZ, kEye, pEye);
      if (eyeZ + 1 < H) {
        m.setRaw(cx - dx, eyeY, eyeZ + 1, kWhite, pEye);
        m.setRaw(cx + dx, eyeY, eyeZ + 1, kWhite, pEye);
      }
    }

    m.despeckle();
    m.applyArtShading(true);
    const asset = m.toStripAsset(makeCanvas, {
      footRadius: Math.max(5, Math.min(W, D) * 0.36),
      headZ: H + 3
    });
    const entry = {
      asset,
      outline: p.out,
      footRadius: Math.max(5.5, Math.min(W, D) * 0.38),
      headZ: H + 4,
      symDeg: (shape === 'flat' || shape === 'stack') ? 90 : 360
    };
    assetCache.set(key, entry);
    return entry;
  }

  // 为一条 EcoDesign 生物数据构造可直接进 StackRenderer 的占位实例
  function createPlaceholderActor(c, makeCanvas) {
    const nicheId = (c.niche && c.niche[0]) || '吃草';
    const sizeKey = parseSize(c.size);
    const shape = shapeForTpl(c.tpl);
    const shared = getSharedAssets(nicheId, sizeKey, shape, makeCanvas);

    const isFly = shape === 'fly';
    const isSwim = c.tpl === 'M03' || c.tpl === 'M33';
    const isRooted = c.tpl === 'M10' || c.tpl === 'M19' || c.tpl === 'M37';
    const baseLift = isFly ? 14 : (isSwim ? 1.5 : 0);

    const def = {
      id: '__placeholder_' + c.code,
      code: c.code,
      name: c.name,
      isPlaceholder: true,
      footRadius: shared.footRadius,
      ecoWeight: sizeKey === 'L' ? 1.5 : (sizeKey === 'S' ? 0.65 : 1.0),
      useWaterFoam: isSwim || (!isFly && !isRooted),
      actions: [
        { id: 'patrol', name: '自由巡游', loop: true, status: 'draft' },
        { id: 'idle', name: '原地待机', loop: true, status: 'draft' }
      ]
    };

    const state = { x: 0, y: 0, z: baseLift, vx: 0, vy: 0, yaw: 0, phase: 0 };
    const inst = {
      def,
      ecoCode: c.code,
      isPlaceholder: true,
      parts: { body: shared.asset },
      curSkin: { id: nicheId, name: nicheId, outline: shared.outline },
      state,
      scaleMul: 1.0,
      action: 'patrol',
      actionTime: 0,
      headZ: shared.headZ,
      reset(x = 0, y = 0, yaw = 0) {
        state.x = x; state.y = y; state.z = baseLift;
        state.vx = 0; state.vy = 0; state.yaw = yaw;
        state.navX = undefined; state.navPause = 0;
      },
      update(dt, time, params, habitat, vfx, eco) {
        const patrol = eco.patrol !== false;
        if (isRooted) {
          Propulsion.rooted(state, dt, time, params, { ...eco, baseLift: 0 });
          state.z = Math.sin(time * 2.4 + (eco.seed || 0)) * 0.45 + 0.45;
        } else if (isFly) {
          Propulsion.windDrift(state, dt, time, params, { ...eco, baseLift });
        } else if (isSwim && habitat && habitat.isWater) {
          Propulsion.pulseSwim(state, dt, time, params, { ...eco, baseLift: 1.2 });
        } else {
          const style = sizeKey === 'L' ? 'heavy' : (sizeKey === 'S' ? 'scurry' : 'default');
          Propulsion.multiLegWalk(state, dt, time, params, { ...eco, walkStyle: style, baseLift: 0 });
          const spd = Math.hypot(state.vx, state.vy);
          state.z = patrol ? Math.abs(Math.sin(time * (sizeKey === 'S' ? 9 : 6) + (eco.seed || 0))) * clamp(spd * 0.14, 0, 2.8) : Math.sin(time * 2.2 + (eco.seed || 0)) * 0.35 + 0.35;
        }
      },
      buildPartList(habitat) {
        const sub = (habitat && habitat.isWater && !isFly && state.z < (habitat.waterLevel || 2))
          ? clamp(((habitat.waterLevel || 2) - state.z) / 5.5, 0, 0.7)
          : 0;
        return [{
          asset: shared.asset,
          x: state.x,
          y: state.y,
          lift: Math.max(0, state.z),
          ro: state.yaw,
          bias: 0,
          opacity: 1,
          submerge: sub,
          symDeg: shared.symDeg
        }];
      }
    };
    return inst;
  }

  return { createPlaceholderActor, NICHE_PAL, parseSize, shapeForTpl };
})();
