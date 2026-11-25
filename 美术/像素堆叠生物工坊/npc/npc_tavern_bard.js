'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { MultiLegGaitSolver, SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion, EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 酒7 · 弹琴吟游乐手（酒馆氛围客座 NPC，+Y 正前，z=0 贴地）
  // 俯视高辨识特征：
  //   1. 酒红镶暖金花边短披风 + 宽檐羽帽（插一根长长的明黄大尾羽）+ 浅米泡泡袖衬衫
  //   2. 超大浅米木梨形大肚鲁特琴（琴颈与弦轸清晰可见），站桩时脚旁放装金币的倒扣讨赏小帽
  //   3. 两段手臂 FK 滞后随动 + 二足 IK 稳步 + 轻弹打拍 / 欢快弹唱飘音符 / 脱帽躬身致谢 / 桌间走唱
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      skinDark:    '#cf987d',
      skinMid:     '#f2c8b0',
      skinHi:      '#ffe7d6',
      hairDark:    '#4a2a19',
      hairMid:     '#7a482c',
      hairHi:      '#ab6c46',
      shirtDark:   '#b8ab96',
      shirtMid:    '#e6dac5',
      shirtHi:     '#faf4e6',
      cloakDark:   '#591422',
      cloakMid:    '#94243b',
      cloakHi:     '#c73c56',
      goldDark:    '#9c6e16',
      goldMid:     '#e0a92b',
      goldHi:      '#ffe066',
      hatDark:     '#47111e',
      hatMid:      '#7d1e33',
      hatHi:       '#b0304c',
      featherDark: '#bd8413',
      featherMid:  '#f2be24',
      featherHi:   '#fff07a',
      pantsDark:   '#26202e',
      pantsMid:    '#40374d',
      pantsHi:     '#635775',
      woodDark:    '#966d42',
      woodMid:     '#cfa16b',
      woodHi:      '#f0cca0',
      luteDark:    '#382216',
      luteMid:     '#613d29',
      luteHi:      '#8c5c40',
      eyeDark:     '#14121c',
      eyeIris:     '#3a7d8c',
      eyeGlint:    '#f5fbff'
    },
    glowKeys: [],
    parts: [
      'foot', 'leg', 'pants', 'shirt', 'cloak', 'goldTrim', 'cape',
      'head', 'hair', 'eye', 'mouth', 'hat', 'hatBand', 'feather',
      'upperArm', 'forearm', 'luteBody', 'luteNeck', 'luteDetail',
      'tipHat', 'coin'
    ],
    noCrease: [
      ['eye', 'head'], ['mouth', 'head'], ['hair', 'head'],
      ['hat', 'hatBand'], ['hat', 'feather'], ['hatBand', 'feather'],
      ['cloak', 'goldTrim'], ['cape', 'goldTrim'],
      ['luteBody', 'luteDetail'], ['luteNeck', 'luteDetail'],
      ['tipHat', 'coin'], ['leg', 'foot']
    ],
    materials: {
      skin:    ['skinDark',    'skinMid',    'skinHi'],
      hair:    ['hairDark',    'hairMid',    'hairHi'],
      shirt:   ['shirtDark',   'shirtMid',   'shirtHi'],
      cloak:   ['cloakDark',   'cloakMid',   'cloakHi'],
      gold:    ['goldDark',    'goldMid',    'goldHi'],
      hat:     ['hatDark',     'hatMid',     'hatHi'],
      feather: ['featherDark', 'featherMid', 'featherHi'],
      pants:   ['pantsDark',   'pantsMid',   'pantsHi'],
      wood:    ['woodDark',    'woodMid',    'woodHi'],
      lute:    ['luteDark',    'luteMid',    'luteHi']
    },
    protectedParts: ['eye', 'mouth', 'coin']
  });

  const SKINS = [
    {
      id: 'wine_gold', name: '酒红金羽', dot: '#c73c56', outline: '#160d12',
      pal: {},
      fx: { noteA: '#ffe066', noteB: '#52ebe0', noteC: '#ffb84d' }
    },
    {
      id: 'peacock_blue', name: '孔雀蓝羽', dot: '#23829e', outline: '#0c161e',
      pal: {
        cloakDark:   '#103d52', cloakMid:    '#1d6b8a', cloakHi:     '#359ec2',
        hatDark:     '#0c3042', hatMid:      '#175773', hatHi:       '#2b88ad',
        featherDark: '#1b857a', featherMid:  '#32c7b3', featherHi:   '#8cf7e3',
        pantsDark:   '#1d2436', pantsMid:    '#323e59', pantsHi:     '#52648a',
        woodDark:    '#8c5a38', woodMid:     '#c4885a', woodHi:      '#e8b689',
        eyeIris:     '#d99326'
      },
      fx: { noteA: '#8cf7e3', noteB: '#ffe066', noteC: '#4dc9ff' }
    },
    {
      id: 'apricot_cyan', name: '暖杏青羽', dot: '#e0894c', outline: '#1a110c',
      pal: {
        cloakDark:   '#8c4522', cloakMid:    '#cc6d39', cloakHi:     '#f29d63',
        hatDark:     '#733719', hatMid:      '#b05b2e', hatHi:       '#de8550',
        featherDark: '#1a7d6b', featherMid:  '#34bf9e', featherHi:   '#8ff5d4',
        pantsDark:   '#2e2824', pantsMid:    '#4d433c', pantsHi:     '#73655b',
        goldDark:    '#8f6014', goldMid:     '#d49828', goldHi:      '#fad45c',
        eyeIris:     '#2e997e'
      },
      fx: { noteA: '#8ff5d4', noteB: '#fad45c', noteC: '#ff9e66' }
    }
  ];

  // 1. 双足分段（大腿、小腿、尖头轻皮靴）
  function buildLegSeg(makeCanvas, rTop, rBot, hLen) {
    const S = Math.ceil(Math.max(rTop, rBot) * 2 + 3);
    const H = Math.ceil(hLen + 3);
    const m = new VoxelModel(S, S, H, SPEC);
    m.paintCapsule(0, 0, 1.0, 0, 0, H - 1.0, rBot, rTop, SPEC.mat('pants'), SPEC.partId.leg, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: Math.max(rTop, rBot) });
  }

  function buildBoot(makeCanvas) {
    const m = new VoxelModel(7, 9, 4, SPEC);
    const { mat, partId } = SPEC;
    m.paintEllipsoid(0, 0.0, 2.3, 1.35, 1.35, 1.0, mat('pants'), partId.leg, true);
    m.paintEllipsoid(0, 1.1, 1.1, 1.55, 2.55, 1.15, mat('lute'), partId.foot, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5 });
  }

  // 2. 俏皮修长乐手上身（浅米衬衫领 + 酒红紧身马甲 + 暖金镶边腰带）
  function buildTorso(makeCanvas) {
    const m = new VoxelModel(12, 11, 13, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-4.6, 4.6, -4.0, 4.0, 0, 12, (x, y, z, X, Y) => {
      const dWaist = (Math.hypot(X / 3.6, Y / 3.0, (z - 3.6) / 3.4) - 1) * 3.0;
      const dChest = (Math.hypot(X / 4.2, Y / 3.3, (z - 7.8) / 3.6) - 1) * 3.2;
      const dNeck  = (Math.hypot(X / 1.9, (Y - 0.1) / 1.9, (z - 11.2) / 1.8) - 1) * 1.8;
      const d = smin(smin(dWaist, dChest, 1.1), dNeck, 0.9);
      if (d > 0) return;
      if (z >= 10.2) {
        m.setRaw(x, y, z, mat('skin'), partId.shirt);
      } else if (z >= 9.0 && Math.abs(X) <= 2.3 && Y > 0.2) {
        m.setRaw(x, y, z, mat('shirt'), partId.shirt);
      } else if (z >= 2.8 && z <= 4.1) {
        const isBuckle = Math.abs(X) <= 1.2 && Y > 2.0;
        m.setRaw(x, y, z, isBuckle ? mat('gold') : mat('lute'), isBuckle ? partId.goldTrim : partId.pants);
      } else if (z < 2.8) {
        const isTrim = z <= 1.3;
        m.setRaw(x, y, z, isTrim ? mat('gold') : mat('cloak'), isTrim ? partId.goldTrim : partId.cloak);
      } else {
        // 胸前浅米衬衫 V 领 + 酒红马甲镶暖金滚边
        const isVShirt = Y > 1.5 && Math.abs(X) <= lerp(0.5, 2.0, clamp((z - 4.4) / 5.0, 0, 1));
        const isGoldEdge = Y > 1.2 && !isVShirt && Math.abs(X) <= lerp(1.4, 2.9, clamp((z - 4.4) / 5.0, 0, 1));
        if (isVShirt) m.setRaw(x, y, z, mat('shirt'), partId.shirt);
        else if (isGoldEdge) m.setRaw(x, y, z, mat('gold'), partId.goldTrim);
        else m.setRaw(x, y, z, mat('cloak'), partId.cloak);
      }
    });
    // 左肩搭扣披风短肩片
    m.paintEllipsoid(-3.2, -0.4, 9.4, 2.3, 2.4, 1.5, mat('cloak'), partId.cape, true);
    m.paintEllipsoid( 3.2, -0.4, 9.4, 2.3, 2.4, 1.5, mat('cloak'), partId.cape, true);
    m.paintEllipsoid(0, 2.5, 9.2, 1.2, 0.9, 0.9, mat('gold'), partId.goldTrim, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5 });
  }

  // 3. 酒红镶暖金花边短披风（拆上/下两节，局部坐标系随动绝不切穿背部）
  function buildCapeSeg(makeCanvas, isLower) {
    const W = isLower ? 12 : 11, D = 7, H = isLower ? 7 : 7;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId } = SPEC;
    const hw = isLower ? 4.8 : 4.2;
    m.fillAABB(-hw, hw, -2.5, 2.0, 0, H - 1, (x, y, z, X, Y) => {
      const t = z / (H - 1);
      const wSpan = lerp(hw, hw * 0.78, t);
      const curveY = -0.35 * (X * X) / (wSpan * wSpan) - (1 - t) * 1.1;
      if (Math.abs(X) <= wSpan && Math.abs(Y - curveY) <= 1.05) {
        const isTrim = (isLower && z <= 1) || Math.abs(X) >= wSpan - 0.95;
        m.setRaw(x, y, z, isTrim ? mat('gold') : mat('cloak'), isTrim ? partId.goldTrim : partId.cape);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2 });
  }

  // 4. 乐手头部（11×11×10，清晰 2×2 笑眼 + 栗色卷发 + 微笑）
  function buildHead(makeCanvas) {
    const W = 11, D = 11, H = 10;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hz = 4.6, hy = 0.2;
    m.paintEllipsoid(0, hy, hz, 4.1, 4.0, 3.9, mat('skin'), partId.head, true);
    // 栗色后发与两鬓微卷（留足额前净空，0.6 俯视绝不压眼）
    m.fillAABB(-4.6, 4.6, -4.6, 4.2, 0, 9, (x, y, z, X, Y) => {
      const dHair = Math.hypot(X / 4.45, (Y + 0.3) / 4.35, (z - (hz + 0.4)) / 4.1);
      if (dHair <= 1.0) {
        if (Y <= 0.2 && z >= 1.8) { m.setRaw(x, y, z, mat('hair'), partId.hair); return; }
        if (Math.abs(X) >= 3.2 && Y <= 1.8 && z >= 2.2) { m.setRaw(x, y, z, mat('hair'), partId.hair); return; }
        if (z >= hz + 2.4 && Y <= 2.9) { m.setRaw(x, y, z, mat('hair'), partId.hair); return; }
      }
    });
    // 小鼻子与微扬嘴角
    m.paintEllipsoid(0, hy + 4.1, hz - 0.4, 0.8, 0.7, 0.7, mat('skin'), partId.head, true);
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    for (const mx of [-1, 0, 1]) {
      m.setRaw(Math.round(hw + mx), Math.round(hd + hy + 3.8), Math.round(hz - 1.9), keyToId.cloakMid, partId.mouth);
    }
    m.despeckle();
    m.applyArtShading(true);

    // 清晰 2×2 双眼（eyeGlint 绝不进 glowKeys）
    const eyeZ = Math.round(hz + 0.1);
    for (const s of [-1, 1]) {
      const xIn = Math.round(hw + s * 1.4), xOut = Math.round(hw + s * 2.4);
      for (const ex of [xIn, xOut]) {
        let sy = -1;
        for (let y = D - 1; y >= Math.round(hd); y--) {
          if (m.getPartId(ex, y, eyeZ) === partId.head) { sy = y; break; }
        }
        if (sy < 0) continue;
        for (const dz of [0, 1]) {
          const isOut = ex === xOut;
          const kId = (dz === 1 && !isOut) ? keyToId.eyeGlint : (dz === 1 ? keyToId.eyeDark : keyToId.eyeIris);
          m.setRaw(ex, sy, eyeZ + dz, kId, partId.eye);
        }
      }
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.2 });
  }

  // 5. 宽檐羽毛软帽（独立部件，支持行礼时右手摘下优雅挥帽！插一根超长明黄大尾羽）
  function buildHat(makeCanvas) {
    const m = new VoxelModel(16, 17, 13, SPEC);
    const { mat, partId } = SPEC;
    // 俏皮微斜宽檐帽沿
    m.fillAABB(-6.8, 6.8, -6.8, 6.8, 1, 4, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 6.3, (Y - 0.3) / 6.6);
      const tiltZ = 2.0 + X * 0.12 + Y * 0.08;
      if (r <= 1.0 && Math.abs(z - tiltZ) <= 0.95) {
        const isEdge = r >= 0.84;
        m.setRaw(x, y, z, isEdge ? mat('gold') : mat('hat'), isEdge ? partId.hatBand : partId.hat);
      }
    });
    // 软帽顶 + 暖金帽带
    m.paintEllipsoid(0, -0.3, 4.5, 4.1, 4.3, 2.9, mat('hat'), partId.hat, true);
    m.paintCapsule(-1.0, -1.0, 5.8, -2.6, -2.8, 6.8, 2.3, 1.5, mat('hat'), partId.hat, true);
    m.fillAABB(-4.5, 4.5, -4.5, 4.5, 3, 4, (x, y, z, X, Y) => {
      const r = Math.hypot(X / 4.2, (Y + 0.2) / 4.3);
      if (r <= 1.04 && r >= 0.78 && z === 3) m.setRaw(x, y, z, mat('gold'), partId.hatBand);
    });
    // 长长的明黄大尾羽（从帽右侧斜向后上方优雅舒展，俯视极抢眼！）
    m.paintCapsule(3.2, 0.8, 4.4, 5.2, -1.8, 8.2, 1.35, 1.55, mat('feather'), partId.feather, true);
    m.paintCapsule(5.2, -1.8, 8.2, 5.6, -5.6, 10.6, 1.55, 1.15, mat('feather'), partId.feather, true);
    m.paintCapsule(5.6, -5.6, 10.6, 4.6, -7.4, 11.4, 1.1, 0.75, mat('feather'), partId.feather, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.2 });
  }

  // 6. 两段手臂（大臂蓬松浅米泡泡袖 + 小臂收口袖与手掌）
  function buildUpperArm(makeCanvas) {
    const m = new VoxelModel(7, 8, 7, SPEC);
    const { mat, partId } = SPEC;
    // 局部枢轴在 (0, -1.6, 4.2)，沿 +Y 伸出至 (0, 2.2, 2.8)
    m.paintEllipsoid(0, -0.2, 3.8, 2.0, 2.2, 2.0, mat('shirt'), partId.upperArm, true);
    m.paintCapsule(0, -1.4, 4.0, 0, 2.2, 2.6, 1.65, 1.25, mat('shirt'), partId.upperArm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.2 });
  }

  function buildForearm(makeCanvas) {
    const m = new VoxelModel(6, 9, 6, SPEC);
    const { mat, partId } = SPEC;
    // 局部枢轴在 (0, -2.0, 2.6)，沿 +Y 伸出至手端 (0, 2.6, 2.6)
    m.paintCapsule(0, -2.0, 2.6, 0, 0.8, 2.6, 1.22, 1.05, mat('shirt'), partId.forearm, true);
    m.paintEllipsoid(0, 1.2, 2.6, 1.18, 0.7, 1.18, mat('gold'), partId.goldTrim, true);
    m.paintEllipsoid(0, 2.5, 2.6, 1.12, 1.25, 1.12, mat('skin'), partId.forearm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 1.8 });
  }

  // 7. 超大浅米木梨形大肚鲁特琴（怀里斜抱，琴颈与弦轸清晰可见）
  function buildLute(makeCanvas) {
    const m = new VoxelModel(18, 12, 13, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 梨形大肚共鸣箱在右侧 (+X)，长琴颈斜向左上方 (-X, +Z)
    m.paintEllipsoid(2.6, 0.0, 4.6, 4.3, 2.9, 3.8, mat('wood'), partId.luteBody, true);
    m.paintEllipsoid(-0.6, 0.0, 5.2, 2.6, 2.2, 2.6, mat('wood'), partId.luteBody, true);
    // 音孔与琴桥（正面 +Y 清晰雕出）
    m.paintEllipsoid(2.0, 2.4, 4.8, 1.45, 0.9, 1.45, mat('lute'), partId.luteDetail, true);
    m.paintCapsule(3.6, 2.6, 3.8, 4.8, 2.6, 5.4, 0.6, 0.6, mat('lute'), partId.luteDetail, true);
    // 长琴颈（从梨尖斜向左上方伸出）
    m.paintCapsule(-1.2, 0.6, 5.5, -6.2, 1.0, 8.6, 1.05, 0.85, mat('lute'), partId.luteNeck, true);
    // 折角琴头与清晰弦轸（4 颗亮金弦轸）
    m.paintCapsule(-6.2, 1.0, 8.6, -7.8, 0.2, 9.6, 0.95, 0.85, mat('lute'), partId.luteNeck, true);
    m.paintEllipsoid(-6.6, 1.2, 10.2, 0.65, 0.65, 0.75, mat('gold'), partId.luteDetail, true);
    m.paintEllipsoid(-7.5, 0.6, 10.7, 0.65, 0.65, 0.75, mat('gold'), partId.luteDetail, true);
    m.paintEllipsoid(-6.8, 0.8, 7.6, 0.65, 0.65, 0.75, mat('gold'), partId.luteDetail, true);
    m.despeckle();
    m.applyArtShading(true);
    // 正面细弦高亮点缀
    const hw = m.w * 0.5 - 0.5, hd = m.d * 0.5 - 0.5;
    for (let s = 0; s < 5; s++) {
      const sx = Math.round(hw + lerp(3.4, -5.2, s / 4));
      const sz = Math.round(lerp(4.6, 8.2, s / 4));
      const sy = Math.round(hd + (s < 2 ? 2.8 : 1.8));
      if (m.inB(sx, sy, sz)) m.setRaw(sx, sy, sz, keyToId.goldHi, partId.luteDetail);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 5.5 });
  }

  // 8. 脚边倒扣讨赏小帽（帽底朝下、帽口朝上装了几枚明黄金币）
  function buildTipHat(makeCanvas) {
    const m = new VoxelModel(11, 11, 6, SPEC);
    const { mat, partId } = SPEC;
    // 宽帽沿贴地
    m.fillAABB(-4.6, 4.6, -4.6, 4.6, 0, 2, (x, y, z, X, Y) => {
      const r = Math.hypot(X, Y);
      if (z === 1 && r <= 4.3 && r >= 2.2) {
        m.setRaw(x, y, z, r >= 3.7 ? mat('gold') : mat('hat'), r >= 3.7 ? partId.goldTrim : partId.tipHat);
      }
      if (z >= 0 && z <= 3 && r <= 2.9 && (z === 0 || r >= 1.8)) {
        m.setRaw(x, y, z, mat('hat'), partId.tipHat);
      }
    });
    // 帽窝里闪烁的几枚金币（不进 glowKeys，纯明金三阶色阶）
    m.paintEllipsoid(-0.8,  0.5, 2.3, 1.05, 1.05, 0.75, mat('gold'), partId.coin, true);
    m.paintEllipsoid( 0.9, -0.4, 2.5, 1.00, 1.00, 0.75, mat('gold'), partId.coin, true);
    m.paintEllipsoid( 0.1,  0.2, 3.1, 0.95, 0.95, 0.70, mat('gold'), partId.coin, true);
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 4.2 });
  }

  const BardDef = {
    id: 'npc_tavern_bard',
    code: '酒7',
    name: '弹琴吟游乐手',
    tag: '酒馆氛围 · 鲁特琴吟唱',
    summary: '俏皮修长乐手：酒红金边羽帽短披风 + 超大浅米梨形鲁特琴 + 脚边金币讨赏小帽 + 轻弹/欢快弹唱/脱帽致谢/桌间走唱',
    defaultHabitat: 'tavern',
    status: 'done',
    footRadius: 6.6,
    ecoWeight: 0.85,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: ['24格人类头身比', '二足IK防脱胯', '两段手臂FK滞后随动', '可摘宽檐大羽帽', '梨形大肚鲁特琴', '脚边金币讨赏帽'],
    soulHabit: '站桩时脚踩拍子轻弹鲁特琴、兴起欢快弹唱飘起音符，还能摘下大羽帽优雅躬身致谢',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },
    actions: [
      { id: 'idle',   name: '轻弹打拍', loop: true,  status: 'done' },
      { id: 'play',   name: '欢快弹唱', loop: false, duration: 2.8, status: 'done' },
      { id: 'bow',    name: '脱帽致谢', loop: false, duration: 2.2, status: 'done' },
      { id: 'patrol', name: '桌间走唱', loop: true,  status: 'done' }
    ],

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legThigh:  buildLegSeg(makeCanvas, 1.65, 1.38, 4.2),
        legShin:   buildLegSeg(makeCanvas, 1.35, 1.22, 4.2),
        boot:      buildBoot(makeCanvas),
        torso:     buildTorso(makeCanvas),
        capeUp:    buildCapeSeg(makeCanvas, false),
        capeLo:    buildCapeSeg(makeCanvas, true),
        head:      buildHead(makeCanvas),
        hat:       buildHat(makeCanvas),
        upperArmL: buildUpperArm(makeCanvas),
        forearmL:  buildForearm(makeCanvas),
        upperArmR: buildUpperArm(makeCanvas),
        forearmR:  buildForearm(makeCanvas),
        lute:      buildLute(makeCanvas),
        tipHat:    buildTipHat(makeCanvas)
      };

      const gait = new MultiLegGaitSolver([
        { id: 'L', hipX: -2.1, hipY: -0.1, hipZ: 7.6, restX: -2.3, restY: 0.2, group: 0, L1: 4.2, L2: 4.2, bendDir: 1 },
        { id: 'R', hipX:  2.1, hipY: -0.1, hipZ: 7.6, restX:  2.3, restY: 0.2, group: 1, L1: 4.2, L2: 4.2, bendDir: 1 }
      ], { mode: 'biped', stepThreshold: 1.85, stepDuration: 0.16, stepHeight: 2.2, strideAnticipation: 0.42 });

      const headSpring = new SpringDamper1D(0, 120, 8.2);
      const hatSpring  = new SpringDamper1D(0, 95, 6.2);
      const capeSpring = new SpringDamper1D(0, 80, 5.8);
      const bodyBounce = new SpringDamper1D(0, 180, 9.0);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        walkBlend: 0, stepPhase: 0,
        tiltX: 0, tiltY: 0,
        swayX: 0, swayYaw: 0,
        bowAmt: 0, hatOffAmt: 0,
        strumPhase: 0, tapLift: 0,
        noteCd: 0, curAction: 'idle', actionTime: 0,
        showTipHat: true,
        tipX: (opts.homeX ?? 0) + 7.2, tipY: (opts.homeY ?? 0) + 5.2
      };
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: BardDef,
        cachePrefix: `npc_bard_${Math.random().toString(36).slice(2, 7)}`,
        parts, partListAssets: Object.values(parts), state, sockets, footContacts: [], scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.yaw = hyaw; state.z = 0;
          state.vx = 0; state.vy = 0; state.walkBlend = 0;
          state.bowAmt = 0; state.hatOffAmt = 0;
          const [tx, ty] = localToWorldXY(hx, hy, hyaw, 6.8, 5.4);
          state.tipX = tx; state.tipY = ty;
          gait.reset(hx, hy, hyaw);
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.4, 2.0);
          const fx = curSkin.fx || SKINS[0].fx;

          // 读取工坊当前动作（兼容旧 eco.patrol）
          let act = (eco && eco.action) ? eco.action : (eco && eco.patrol ? 'patrol' : 'idle');
          const actT = (eco && eco.actionTime) || 0;
          state.curAction = act;
          state.actionTime = actT;

          const isPatrol = act === 'patrol';
          const isPlay   = act === 'play';
          const isBow    = act === 'bow';

          if (isPatrol) {
            Propulsion.multiLegWalk(state, dt, time, { ...params, speed: (params.speed ?? 1.0) * 0.92 }, {
              ...eco, patrol: true, walkStyle: 'scurry', baseLift: 0
            });
          } else {
            Propulsion.multiLegWalk(state, dt, time, params, {
              ...eco, patrol: false, baseLift: 0
            });
          }
          state.z = 0;

          const spdNow = Math.hypot(state.vx, state.vy);
          state.walkBlend = lerp(state.walkBlend, isPatrol ? clamp(spdNow / 8.5, 0, 1) : 0, expSmooth(dt, 10));
          state.stepPhase += dt * (3.2 + state.walkBlend * 9.5) * gFreq;

          const gaitRes = gait.update(dt, state.x, state.y, 0, state.yaw, state.vx, state.vy, {
            mode: 'biped',
            scaleMul: sMul,
            stepFreq: gFreq * 1.15,
            stepHeight: 2.2 * sMul,
            stepThreshold: 1.85 * sMul
          });
          state.tiltX = lerp(state.tiltX || 0, gaitRes.tiltX * 0.55 * sMul, expSmooth(dt, 12));
          state.tiltY = lerp(state.tiltY || 0, gaitRes.tiltY * 0.55 * sMul, expSmooth(dt, 12));

          // 防急转脱胯
          const maxFootOffset = 3.5 * sMul;
          for (const leg of gait.legs) {
            const [idealX, idealY] = localToWorldXY(state.x, state.y, state.yaw, leg.restX * sMul, leg.restY * sMul);
            const dx = leg.footX - idealX, dy = leg.footY - idealY;
            const d = Math.hypot(dx, dy);
            if (d > maxFootOffset) {
              leg.footX = idealX + (dx / d) * maxFootOffset;
              leg.footY = idealY + (dy / d) * maxFootOffset;
            }
          }

          if (gaitRes.landed.length > 0) {
            bodyBounce.impulse(5.5 * sp);
            capeSpring.impulse((Math.random() - 0.5) * 4.5 * sp);
            for (const l of gaitRes.landed) {
              EnvFeedback.emitFootstep(vfx, habitat, l.footX, l.footY, 0.45 * sMul);
            }
          }

          // 站桩时脚旁放讨赏小帽，巡游时收起
          state.showTipHat = !isPatrol;
          if (!isPatrol) {
            const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw, 6.8 * sMul, 5.4 * sMul);
            state.tipX = lerp(state.tipX, tx, expSmooth(dt, 8));
            state.tipY = lerp(state.tipY, ty, expSmooth(dt, 8));
          }

          // 各动作节奏与身体摆动
          let tgtSwayX = 0, tgtSwayYaw = 0, tgtHeadYaw = 0, tgtBow = 0, tgtHatOff = 0;
          let strumRate = 4.6 * gFreq;

          if (isPlay) {
            const u = clamp(actT / 2.8, 0, 1);
            const env = Math.sin(u * Math.PI);
            strumRate = 12.5 * gFreq;
            tgtSwayX = Math.sin(time * 5.2 * gFreq) * 1.45 * env;
            tgtSwayYaw = Math.sin(time * 5.2 * gFreq) * 0.34 * env;
            tgtHeadYaw = Math.sin(time * 5.2 * gFreq - 0.55) * 0.28 * env;
            state.tapLift = Math.max(0, Math.sin(time * 8.4 * gFreq)) * 1.35 * env;

            // 飘起暖金与亮青色音符微粒
            state.noteCd -= dt;
            if (vfx && state.noteCd <= 0 && u > 0.08 && u < 0.92) {
              state.noteCd = 0.14;
              const [nx, ny] = localToWorldXY(state.x, state.y, state.yaw + tgtSwayYaw,
                (Math.random() - 0.5) * 7.0 * sMul, (3.2 + Math.random() * 2.5) * sMul);
              const colPick = Math.random();
              const col = colPick < 0.48 ? fx.noteA : (colPick < 0.85 ? fx.noteB : fx.noteC);
              vfx.spawnParticle(
                nx, ny, (13.5 + Math.random() * 3.5) * sMul,
                (Math.random() - 0.5) * 5.5, (Math.random() - 0.5) * 5.5, 9.5 + Math.random() * 4.5,
                0.95 + Math.random() * 0.35, 1.35 + Math.random() * 0.45,
                col, true, -2.5
              );
            }
          } else if (isBow) {
            const u = clamp(actT / 2.2, 0, 1);
            // 0..0.28 摘帽 -> 0.28..0.72 躬身致谢 -> 0.72..1.0 起身戴回
            tgtHatOff = smoothstep(0.05, 0.26, u) * (1 - smoothstep(0.76, 0.96, u));
            tgtBow    = smoothstep(0.20, 0.44, u) * (1 - smoothstep(0.66, 0.88, u));
            tgtSwayYaw = -0.14 * tgtBow;
            tgtHeadYaw = 0.12 * tgtBow;
            strumRate = 1.2;
            state.tapLift = 0;
          } else if (isPatrol) {
            strumRate = 6.2 * gFreq;
            tgtSwayYaw = Math.sin(state.stepPhase) * 0.10 * state.walkBlend;
            tgtHeadYaw = Math.sin(time * 2.2) * 0.18;
            state.tapLift = 0;
            state.noteCd -= dt;
            if (vfx && state.noteCd <= 0 && state.walkBlend > 0.3) {
              state.noteCd = 0.65;
              const [nx, ny] = localToWorldXY(state.x, state.y, state.yaw, 1.5 * sMul, 4.0 * sMul);
              vfx.spawnParticle(
                nx, ny, 14.5 * sMul,
                (Math.random() - 0.5) * 3.5, (Math.random() - 0.5) * 3.5, 7.5,
                0.75, 1.15, Math.random() < 0.5 ? fx.noteA : fx.noteB, true, -1.5
              );
            }
          } else {
            // idle：左脚有节奏轻点地、右手慢拨琴弦、帽羽随拍轻晃
            strumRate = 4.4 * gFreq;
            tgtSwayX = Math.sin(time * 2.4 * gFreq) * 0.42;
            tgtSwayYaw = Math.sin(time * 2.4 * gFreq) * 0.10;
            tgtHeadYaw = Math.sin(time * 1.4) * 0.22;
            state.tapLift = Math.pow(Math.max(0, Math.sin(time * 4.8 * gFreq)), 2.0) * 1.15;
          }

          state.strumPhase += dt * strumRate;
          state.swayX   = lerp(state.swayX,   tgtSwayX,   expSmooth(dt, 9.5));
          state.swayYaw = lerp(state.swayYaw, tgtSwayYaw, expSmooth(dt, 9.5));
          state.bowAmt  = lerp(state.bowAmt,  tgtBow,     expSmooth(dt, 10.5));
          state.hatOffAmt = lerp(state.hatOffAmt, tgtHatOff, expSmooth(dt, 11.5));

          headSpring.update(dt, tgtHeadYaw, 120 * sp, 8.2);
          hatSpring.update(dt, Math.sin(state.strumPhase * 0.5 - 0.6) * (isPlay ? 0.24 : 0.11) * flex, 95 * sp, 6.2);
          capeSpring.update(dt, (isPatrol ? Math.sin(state.stepPhase) * 0.22 : state.swayYaw * 0.85) * flex, 80 * sp, 5.8);
          bodyBounce.update(dt, 0, 180 * sp, 9.0);

          instance.footContacts = gait.legs.map((l, idx) => ({
            x: l.footX, y: l.footY, z: l.footZ + (idx === 0 ? state.tapLift : 0), r: 2.0 * sMul
          }));
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const bodyYaw = yw + state.swayYaw;
          const hYaw = bodyYaw + clamp(headSpring.x, -0.55, 0.55);

          const breath = Math.sin(state.strumPhase * 0.5) * 0.35;
          const walkBob = Math.abs(Math.sin(state.stepPhase)) * 0.65 * state.walkBlend;
          const bowDip = state.bowAmt * 2.4;
          const bob = clamp(bodyBounce.x * 0.05 + breath + walkBob - bowDip * 0.35, -1.6, 1.1) * sMul;

          // 1. 脚边倒扣讨赏小帽（站桩时摆在右前方地面）
          if (state.showTipHat) {
            list.push({
              partKey: 'tipHat', asset: parts.tipHat,
              x: state.tipX, y: state.tipY, lift: 0, ro: yw + 0.45, bias: -0.1
            });
          }

          // 2. 二足 IK 双腿（左脚待机/弹唱时随节拍轻点地）
          for (let i = 0; i < gait.legs.length; i++) {
            const l = gait.legs[i];
            const extraTap = (i === 0 && state.walkBlend < 0.15) ? state.tapLift * sMul : 0;
            const fz = l.footZ + extraTap;
            const hx = l.hipWX + (state.tiltX || 0);
            const hy = l.hipWY + (state.tiltY || 0);
            const hz = l.hipWZ + bob * 0.5;
            const segs = [
              { k: 'legThigh', x: lerp(hx, l.kneeX, 0.30), y: lerp(hy, l.kneeY, 0.30), z: lerp(hz, l.kneeZ, 0.30), b: -0.34, sym: 90 },
              { k: 'legShin',  x: lerp(l.kneeX, l.footX, 0.48), y: lerp(l.kneeY, l.footY, 0.48), z: lerp(l.kneeZ, fz + 1.5 * sMul, 0.48), b: -0.26, sym: 90 },
              { k: 'boot',     x: l.footX, y: l.footY, z: fz, b: -0.18, sym: 0 }
            ];
            for (const pt of segs) {
              const item = {
                partKey: pt.k, asset: parts[pt.k],
                x: pt.x, y: pt.y,
                lift: Math.max(0, pt.z - (pt.k === 'boot' ? 0 : 1.9 * sMul)),
                ro: yw, bias: pt.b
              };
              if (pt.sym) item.symDeg = pt.sym;
              list.push(item);
            }
          }

          // 3. 躯干（深嵌大腿根，躬身时略向前探）
          const [tx, ty] = localToWorldXY(
            state.x + (state.tiltX || 0), state.y + (state.tiltY || 0),
            yw, state.swayX * sMul, (0.2 + state.bowAmt * 1.8) * sMul
          );
          const torsoLift = 5.8 * sMul + bob;
          list.push({
            partKey: 'torso', asset: parts.torso,
            x: tx, y: ty, lift: torsoLift, ro: bodyYaw, bias: 0.15
          });

          // 4. 酒红金边短披风（上/下两节，局部后方偏移防穿模）
          const capeLag = clamp(capeSpring.x, -0.35, 0.35);
          const [cuX, cuY] = localToWorldXY(tx, ty, bodyYaw, 0, (-2.8 - state.bowAmt * 0.6) * sMul);
          list.push({
            partKey: 'capeUp', asset: parts.capeUp,
            x: cuX, y: cuY, lift: torsoLift + 3.6 * sMul, ro: bodyYaw + capeLag * 0.5, bias: -0.18
          });
          const [clX, clY] = localToWorldXY(tx, ty, bodyYaw + capeLag, 0, (-4.2 - state.walkBlend * 1.1) * sMul);
          list.push({
            partKey: 'capeLo', asset: parts.capeLo,
            x: clX, y: clY, lift: torsoLift + 0.2 * sMul, ro: bodyYaw + capeLag, bias: -0.24
          });

          // 5. 头部
          const [hdX, hdY] = localToWorldXY(tx, ty, bodyYaw, 0, (0.3 + state.bowAmt * 2.2) * sMul);
          const headZ = torsoLift + (10.6 - state.bowAmt * 2.1) * sMul;
          list.push({
            partKey: 'head', asset: parts.head,
            x: hdX, y: hdY, lift: headZ, ro: hYaw, bias: 0.42
          });

          // 6. 两段手臂 FK（大臂引领 + 小臂滞后 0.75 rad 随动）
          const shZ = torsoLift + 7.2 * sMul;
          const [lShX, lShY] = localToWorldXY(tx, ty, bodyYaw, -4.1 * sMul, 0.2 * sMul);
          const [rShX, rShY] = localToWorldXY(tx, ty, bodyYaw,  4.1 * sMul, 0.2 * sMul);

          // 左臂：托住琴颈；行礼时抱稳鲁特琴在身侧
          const lUpperAng = bodyYaw - 0.55 - state.bowAmt * 0.35 + Math.sin(state.strumPhase * 0.5) * 0.08;
          const lForeAng  = lUpperAng + 0.68 + Math.sin(state.strumPhase * 0.5 - 0.75) * 0.10;
          const [lUpWx, lUpWy] = localToWorldXY(lShX, lShY, lUpperAng, 0, 1.6 * sMul);
          const [lElX, lElY]   = localToWorldXY(lShX, lShY, lUpperAng, 0, 3.6 * sMul);
          const [lFoWx, lFoWy] = localToWorldXY(lElX, lElY, lForeAng,  0, 2.0 * sMul);
          const [lHdX, lHdY]   = localToWorldXY(lElX, lElY, lForeAng,  0, 4.2 * sMul);
          const lElbowZ = shZ - 1.2 * sMul;

          list.push({ partKey: 'upperArmL', asset: parts.upperArmL, x: lUpWx, y: lUpWy, lift: shZ - 2.6 * sMul, ro: lUpperAng, bias: 0.22 });
          list.push({ partKey: 'forearmL',  asset: parts.forearmL,  x: lFoWx, y: lFoWy, lift: lElbowZ - 1.6 * sMul, ro: lForeAng, bias: 0.28 });

          // 右臂：拨弦扫琴；行礼时抬手摘帽并优雅向外挥展
          const strumAmp = state.curAction === 'play' ? 0.38 : (state.curAction === 'patrol' ? 0.22 : 0.18);
          const rStrumUp = Math.sin(state.strumPhase) * strumAmp;
          const rStrumFo = Math.sin(state.strumPhase - 0.75) * strumAmp * 1.25;
          const rUpperAng = bodyYaw + lerp(0.52 + rStrumUp, -0.85, state.hatOffAmt);
          const rForeAng  = rUpperAng + lerp(-0.78 + rStrumFo, -0.35 - state.bowAmt * 0.45, state.hatOffAmt);
          const rLiftZ = (Math.sin(state.strumPhase - 0.75) * (state.curAction === 'play' ? 1.1 : 0.45) * (1 - state.hatOffAmt)
                        + state.hatOffAmt * (1 - state.bowAmt) * 3.8 - state.bowAmt * 2.2) * sMul;

          const [rUpWx, rUpWy] = localToWorldXY(rShX, rShY, rUpperAng, 0, 1.6 * sMul);
          const [rElX, rElY]   = localToWorldXY(rShX, rShY, rUpperAng, 0, 3.6 * sMul);
          const [rFoWx, rFoWy] = localToWorldXY(rElX, rElY, rForeAng,  0, 2.0 * sMul);
          const [rHdX, rHdY]   = localToWorldXY(rElX, rElY, rForeAng,  0, 4.4 * sMul);

          list.push({ partKey: 'upperArmR', asset: parts.upperArmR, x: rUpWx, y: rUpWy, lift: shZ - 2.6 * sMul + rLiftZ * 0.4, ro: rUpperAng, bias: 0.24 });
          list.push({ partKey: 'forearmR',  asset: parts.forearmR,  x: rFoWx, y: rFoWy, lift: shZ - 2.8 * sMul + rLiftZ, ro: rForeAng, bias: 0.34 });

          // 7. 宽檐大羽帽（常态戴在头顶随拍轻晃；行礼时跟随右手优雅挥下致谢）
          const hatOnYaw = hYaw + clamp(hatSpring.x, -0.32, 0.32);
          const [hatOnX, hatOnY] = localToWorldXY(hdX, hdY, hYaw, 0, -0.2 * sMul);
          const hatOnZ = headZ + 6.4 * sMul;

          const [hatHandX, hatHandY] = localToWorldXY(rHdX, rHdY, rForeAng, 1.8 * sMul, 2.0 * sMul);
          const hatHandZ = Math.max(2.0 * sMul, shZ - 1.5 * sMul + rLiftZ - state.bowAmt * 2.4 * sMul);
          const hatHandYaw = rForeAng + 0.55;

          const hatX = lerp(hatOnX, hatHandX, state.hatOffAmt);
          const hatY = lerp(hatOnY, hatHandY, state.hatOffAmt);
          const hatZ = lerp(hatOnZ, hatHandZ, state.hatOffAmt);
          const hatRo = hatOnYaw + wrapAngle(hatHandYaw - hatOnYaw) * state.hatOffAmt;
          list.push({
            partKey: 'hat', asset: parts.hat,
            x: hatX, y: hatY, lift: hatZ, ro: hatRo, bias: 0.58
          });

          // 8. 超大浅米木梨形鲁特琴（平时横斜抱在胸前，行礼时由左手稳稳抱在身侧）
          const [ltChestX, ltChestY] = localToWorldXY(tx, ty, bodyYaw, -0.4 * sMul, 4.0 * sMul);
          const [ltSideX, ltSideY]   = localToWorldXY(lHdX, lHdY, bodyYaw, -2.0 * sMul, -0.5 * sMul);
          const ltX = lerp(ltChestX, ltSideX, state.bowAmt);
          const ltY = lerp(ltChestY, ltSideY, state.bowAmt);
          const ltZ = torsoLift + (1.8 + Math.sin(state.strumPhase) * 0.25 * (1 - state.bowAmt) - state.bowAmt * 1.0) * sMul;
          const ltRo = bodyYaw + lerp(0.08 + Math.sin(state.strumPhase * 0.5) * 0.06, -0.58, state.bowAmt);
          list.push({
            partKey: 'lute', asset: parts.lute,
            x: ltX, y: ltY, lift: ltZ, ro: ltRo, bias: 0.32
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: BardDef.id, code: BardDef.code, name: BardDef.name, outlineMode: 'actorUnified',
            skin: curSkin.id, footRadius: BardDef.footRadius, headZ: 26, centerZ: 13,
            blocks: BardDef.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(BardDef, 'npc');
})(window.PixelWorkshop);
