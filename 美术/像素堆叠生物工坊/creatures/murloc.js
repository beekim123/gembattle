'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { TAU, clamp, lerp, smoothstep, smin, expSmooth, wrapAngle, localToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { EnvFeedback } = PW.Behaviors;

  // =========================================================================
  // 特5 · 滩涂鱼人战士（v3 标杆重做版，+Y 正前，z=0 贴地）
  // 严格复用已验证的 v3 滩涂鱼人 12 部件精制比例、贝壳海草盾与海兽骨叉：
  //   1. 完整两栖战士体型：屈膝粗腿+宽大三趾扇形蹼足(10×12×12)、微驼背花纹躯干+三枚锯齿背鳍(16×18×22)、
  //      锁枢轴粗短两栖尾(8×12×10)、常规/鼓腮双态扁圆蛙鱼头（三道鳃裂+阔嘴四尖牙+外凸大圆鱼眼）、
  //      健壮双臂 + 左手绑海草扇形贝壳小盾(11×10×13) + 右手海兽骨叉与自亮水珠饰坠
  //   2. 防糊红线：eyeGlint 严禁进 glowKeys，常态全程 1:1 整数像素绘制（零小数缩放）
  //   3. 4 套滩涂色系：浅海青绿 / 橙红斑纹 / 深蓝墨黑 / 金黄锦鲤（稀有首领）
  //   4. 真实两栖双生态：滩涂鼓腮警戒 ↔ 4 阶段蛙跳巡滩踩水激起水花与涟漪
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      skinDark:     '#135856',
      skinMid:      '#22998e',
      skinHi:       '#60d4c2',
      spotDark:     '#0d3e42',
      spotMid:      '#18726d',
      spotHi:       '#38aba0',
      bellyDark:    '#b5a37a',
      bellyMid:     '#e6d9b3',
      bellyHi:      '#faf2da',
      finDark:      '#9c3218',
      finMid:       '#e35a24',
      finHi:        '#ff9952',
      finEdgeMid:   '#c93f16',
      finEdgeHi:    '#ffb86b',
      gillDark:     '#5c1a24',
      gillMid:      '#a62d3d',
      eyeDark:      '#0f141c',
      eyeIris:      '#f5d042',
      eyeGlint:     '#f8fdff',
      boneDark:     '#8c8270',
      boneMid:      '#d6ccb8',
      boneHi:       '#f5f0e1',
      shellDark:    '#785a4a',
      shellMid:     '#c29980',
      shellHi:      '#ebd2be',
      weedDark:     '#1d4a26',
      weedMid:      '#357d3e',
      weedHi:       '#69b55e',
      emissiveMid:  '#30c8f2',
      emissiveCore: '#dcfaff'
    },
    glowKeys: ['emissiveMid', 'emissiveCore'],
    parts: [
      'torso', 'belly', 'tail', 'head', 'jaw', 'teeth', 'gill', 'eye',
      'dorsalFin', 'leg', 'foot', 'arm', 'shield', 'seaweed', 'trident', 'charm'
    ],
    noCrease: [
      ['eye', 'head'], ['head', 'torso'], ['torso', 'tail'], ['torso', 'leg'], ['leg', 'foot'],
      ['torso', 'arm'], ['teeth', 'jaw'], ['teeth', 'head'],
      ['trident', 'charm'], ['trident', 'seaweed'], ['shield', 'seaweed']
    ],
    materials: {
      skin:    ['skinDark',   'skinMid',    'skinHi'],
      spot:    ['spotDark',   'spotMid',    'spotHi'],
      belly:   ['bellyDark',  'bellyMid',   'bellyHi'],
      fin:     ['finDark',    'finMid',     'finHi'],
      finEdge: ['finDark',    'finEdgeMid', 'finEdgeHi'],
      gill:    ['gillDark',   'gillMid',    'gillMid'],
      bone:    ['boneDark',   'boneMid',    'boneHi'],
      shell:   ['shellDark',  'shellMid',   'shellHi'],
      weed:    ['weedDark',   'weedMid',    'weedHi']
    },
    protectedParts: ['eye', 'teeth', 'charm']
  });

  const SKINS = [
    {
      id: 'teal', name: '浅海青绿（经典滩涂）', dot: '#22998e', outline: '#0c151a',
      pal: {},
      fx: { core: '#dcfaff', hot: '#7ae8ff', mid: '#2bb8e8' }
    },
    {
      id: 'coral', name: '橙红斑纹（礁岩斗士）', dot: '#e05226', outline: '#1a0e0c',
      pal: {
        skinDark: '#8c2814', skinMid: '#de5228', skinHi: '#ff8e52',
        spotDark: '#57150d', spotMid: '#962216', spotHi: '#c43b24',
        bellyDark: '#b88d5c', bellyMid: '#ebd09b', bellyHi: '#fff0cc',
        finDark: '#a66d0c', finMid: '#f0b624', finHi: '#ffe66e',
        finEdgeMid: '#d98914', finEdgeHi: '#fff29c',
        eyeIris: '#7ef2ff',
        shellDark: '#5e1e1c', shellMid: '#9e362c', shellHi: '#d46855',
        weedDark: '#2c4a1d', weedMid: '#517a2c', weedHi: '#85b04a',
        emissiveMid: '#ff7a29', emissiveCore: '#fff2c2'
      },
      fx: { core: '#fff2c2', hot: '#ffb84d', mid: '#ff6e26' }
    },
    {
      id: 'abyss', name: '深蓝墨黑（深水猎手）', dot: '#285296', outline: '#080e18',
      pal: {
        skinDark: '#121b30', skinMid: '#243c6e', skinHi: '#426aa8',
        spotDark: '#0b0e18', spotMid: '#172036', spotHi: '#2a3a5c',
        bellyDark: '#4f627a', bellyMid: '#7c96b3', bellyHi: '#b0cae3',
        finDark: '#0d6e62', finMid: '#1ec4a8', finHi: '#6bf5d6',
        finEdgeMid: '#159c87', finEdgeHi: '#9effe8',
        eyeIris: '#ffe838',
        boneDark: '#485463', boneMid: '#7d8fa3', boneHi: '#bfd0e0',
        shellDark: '#233245', shellMid: '#3f5875', shellHi: '#6c8cad',
        weedDark: '#123836', weedMid: '#1e635b', weedHi: '#3d998a',
        emissiveMid: '#26f0d0', emissiveCore: '#d9fff8'
      },
      fx: { core: '#d9fff8', hot: '#6bf5d6', mid: '#2a72d4' }
    },
    {
      id: 'koi', name: '金黄锦鲤（稀有首领）', dot: '#f2b824', outline: '#1a1208',
      pal: {
        skinDark: '#a86e0c', skinMid: '#f0b624', skinHi: '#ffe066',
        spotDark: '#8a1e12', spotMid: '#d9381e', spotHi: '#ff6642',
        bellyDark: '#bfa67a', bellyMid: '#f0e2c2', bellyHi: '#fff9eb',
        finDark: '#a6b5c4', finMid: '#e1eaf2', finHi: '#ffffff',
        finEdgeMid: '#d4311c', finEdgeHi: '#ff5d42',
        eyeIris: '#26d4f2',
        boneDark: '#997a36', boneMid: '#e3c059', boneHi: '#fff0a8',
        shellDark: '#8c6216', shellMid: '#d9a429', shellHi: '#ffe278',
        weedDark: '#1f5432', weedMid: '#368a50', weedHi: '#6cc47c',
        emissiveMid: '#ffbe38', emissiveCore: '#fffce0'
      },
      fx: { core: '#fffce0', hot: '#ffd966', mid: '#ff8a47' }
    }
  ];

  // 1. 屈膝粗腿 + 宽大三趾扇形蹼足（10×12×12，z=0 贴地）
  function buildMurlocLegPart(makeCanvas, side) {
    const m = new VoxelModel(10, 12, 12, SPEC);
    const { mat, partId } = SPEC;
    const s = side;
    m.paintCapsule(0, -1.6, 9.6, s * 1.4, 0.8, 5.4, 2.15, 1.80, mat('skin'), partId.leg, true);
    m.paintCapsule(s * 1.4, 0.8, 5.4, s * 0.4, 0.2, 1.4, 1.75, 1.42, mat('skin'), partId.leg, true);
    const heelY = -1.4;
    m.fillAABB(-3.2, 3.2, heelY - 0.4, 5.6, 0, 2, (x, y, z, X, Y) => {
      if (z > 1) return;
      const dy = Y - heelY;
      if (dy < 0 || dy > 6.4) return;
      const u = dy / 6.4, cx = s * 0.4 * u, halfW = lerp(1.5, 2.75, u);
      if (Math.abs(X - cx) <= halfW && dy <= 5.4 + Math.cos(((X - cx) / halfW) * Math.PI * 1.5) * 0.72) {
        m.setRaw(x, y, z, z === 0 ? mat('skin') : mat('spot'), partId.foot);
      }
    });
    for (const [tx, ty] of [[s * 2.4, 4.4], [s * 0.4, 5.2], [-s * 1.6, 4.4]]) {
      m.paintCapsule(s * 0.4, -0.2, 1.0, tx, ty, 0.8, 1.12, 0.95, mat('skin'), partId.foot, true);
    }
    m.despeckle();
    m.applyArtShading(false);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5 });
  }

  // 2. 微驼背壮实花纹躯干 + 浅色软肚皮 + 3 枚锯齿脊背鳍（16×18×22）
  function buildMurlocTorsoPart(makeCanvas) {
    const m = new VoxelModel(16, 18, 22, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-6.8, 6.8, -8.5, 5.5, 0, 16, (x, y, z, X, Y) => {
      const dTorso = (Math.hypot(X / 6.2, (Y + 1.0) / 5.7, (z - 6.4) / 5.8) - 1) * 5.8;
      const dHunch = (Math.hypot(X / 5.5, (Y + 2.2) / 5.0, (z - 10.6) / 4.2) - 1) * 4.2;
      if (smin(dTorso, dHunch, 1.8) <= 0) {
        const isBelly = Y > 0.2 && z >= 1.2 && z <= 10.2 && Math.abs(X) < 4.5;
        const spotA = Math.hypot((X - 3.2) / 3.6, (Y + 0.2) / 4.0, (z - 9.4) / 3.4) <= 1.0;
        const spotC = Math.hypot((X + 3.4) / 3.0, (Y + 3.4) / 3.4, (z - 5.4) / 2.8) <= 1.0;
        const val = isBelly ? mat('belly') : ((spotA || spotC) ? mat('spot') : mat('skin'));
        m.setRaw(x, y, z, val, isBelly ? partId.belly : partId.torso);
      }
    });
    const finSpine = [
      [-2.4, 14.8, -4.6, 20.4, 1.38, 1.06],
      [-5.2, 12.0, -7.8, 17.6, 1.32, 1.05],
      [-7.4,  8.6, -9.8, 13.4, 1.25, 1.04]
    ];
    for (const sp of finSpine) {
      const my = lerp(sp[0], sp[2], 0.62), mz = lerp(sp[1], sp[3], 0.62);
      m.paintCapsule(0, sp[0], sp[1], 0, my, mz, sp[4], 1.12, mat('fin'), partId.dorsalFin, true);
      m.paintCapsule(0, my, mz, 0, sp[2], sp[3], 1.12, sp[5], mat('finEdge'), partId.dorsalFin, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.5 });
  }

  // 3. 粗短两栖尾 + 尾背鳍棘（尾根枢轴锁在后臀）
  const MURLOC_TAIL_PIVOT_Y = 4.2;
  function buildMurlocTailPart(makeCanvas) {
    const m = new VoxelModel(8, 12, 10, SPEC);
    const { mat, partId } = SPEC;
    const ry = MURLOC_TAIL_PIVOT_Y;
    m.paintCapsule(0, ry, 4.0, 0, ry - 3.6, 3.0, 2.75, 2.05, mat('skin'), partId.tail, true);
    m.paintCapsule(0, ry - 3.6, 3.0, 0, ry - 6.8, 2.2, 2.05, 1.35, mat('skin'), partId.tail, true);
    m.paintCapsule(0, ry - 3.4, 4.6, 0, ry - 6.0, 8.2, 1.18, 1.02, mat('fin'), partId.dorsalFin, true);
    m.paintCapsule(0, ry - 5.2, 7.0, 0, ry - 6.4, 8.8, 1.05, 0.95, mat('finEdge'), partId.dorsalFin, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5 });
  }

  // 4. 扁圆蛙鱼头（18×18×18，常规阔嘴尖牙 / 鼓腮双态 + 3 道分层鳃裂 + 外凸大圆鱼眼）
  function buildMurlocHeadPart(makeCanvas, puff = false) {
    const W = 18, D = 18, H = 18;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const puffX = puff ? 1.85 : 0, puffY = puff ? 1.15 : 0;
    const hz = 5.4, hy = 0.2;

    m.fillAABB(-8.4, 8.4, -5.8, 8.2, 0.5, 10.8, (x, y, z, X, Y) => {
      let dHead = (Math.hypot(X / (6.3 + puffX * 0.45), (Y - hy) / (5.5 + puffY * 0.35), (z - hz) / 4.2) - 1) * 4.2;
      if (puff) {
        const dCL = (Math.hypot((X + 5.2) / 3.1, (Y - (hy + 2.0)) / 3.0, (z - (hz - 0.8)) / 2.6) - 1) * 2.6;
        const dCR = (Math.hypot((X - 5.2) / 3.1, (Y - (hy + 2.0)) / 3.0, (z - (hz - 0.8)) / 2.6) - 1) * 2.6;
        dHead = smin(dHead, Math.min(dCL, dCR), 1.4);
      }
      if (dHead <= 0) {
        const spotB = Math.hypot((X + 2.6) / 3.4, (Y - (hy + 1.2)) / 3.6, (z - (hz + 1.2)) / 2.7) <= 1.0;
        m.setRaw(x, y, z, spotB ? mat('spot') : mat('skin'), partId.head);
      }
    });

    if (!puff) {
      m.paintEllipsoid(0, hy + 4.0, hz - 0.3, 5.2, 2.8, 1.35, mat('skin'), partId.head, true);
      m.paintEllipsoid(0, hy + 3.6, hz - 3.2, 4.7, 2.6, 1.25, mat('belly'), partId.jaw, true);
      m.fillAABB(-3.8, 3.8, hy + 3.4, hy + 6.0, hz - 2.4, hz - 1.0, (x, y, z, X, Y) => {
        if (Math.abs(X) <= 3.6 && Y >= hy + 3.6 && Y <= hy + 5.8 && z >= Math.round(hz - 2.2) && z <= Math.round(hz - 1.3)) {
          m.setRaw(x, y, z, keyToId.gillDark, partId.jaw);
        }
      });
      const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5, tz = Math.round(hz - 1.8);
      for (const tx of [-3.2, -1.2, 1.2, 3.2]) {
        const ix = Math.round(hw + tx), iy = Math.round(hd + hy + 5.9 - Math.abs(tx) * 0.25);
        m.setRaw(ix, iy, tz, keyToId.boneHi, partId.teeth);
        m.setRaw(ix, iy, tz + 1, keyToId.boneHi, partId.teeth);
      }
    } else {
      m.paintEllipsoid(0, hy + 5.2, hz - 1.4, 2.6, 2.2, 1.8, mat('skin'), partId.jaw, true);
      m.fillAABB(-1.2, 1.2, hy + 6.4, hy + 7.8, hz - 2.2, hz - 0.6, (x, y, z, X, Y) => {
        if (Math.hypot(X, z - (hz - 1.4)) <= 1.15 && Y >= hy + 6.6 && Y <= hy + 7.5) {
          m.setRaw(x, y, z, keyToId.emissiveCore, partId.charm);
        }
      });
    }

    for (const s of [-1, 1]) {
      const gx = s * (5.9 + puffX * 0.55);
      for (let gi = 0; gi < 3; gi++) {
        m.paintCapsule(gx, hy - 0.4 - gi * 1.4, hz - 2.8 + gi * 0.35, gx + s * 0.5, hy - 0.7 - gi * 1.4, hz - 0.4 + gi * 0.35, 0.85, 0.75, mat('gill'), partId.gill, true);
      }
    }

    for (const sp of [[hy - 0.6, hz + 3.6, hy - 1.2, hz + 8.4, 1.35, 1.05], [hy - 3.6, hz + 3.0, hy - 5.0, hz + 9.8, 1.40, 1.08]]) {
      const my = lerp(sp[0], sp[2], 0.62), mz = lerp(sp[1], sp[3], 0.62);
      m.paintCapsule(0, sp[0], sp[1], 0, my, mz, sp[4], 1.12, mat('fin'), partId.dorsalFin, true);
      m.paintCapsule(0, my, mz, 0, sp[2], sp[3], 1.12, sp[5], mat('finEdge'), partId.dorsalFin, true);
    }

    m.despeckle();
    m.applyArtShading(true);

    // 外凸大圆鱼眼（Z∈[hz+2.0, hz+5.5]，+Y 与 0.6 俯视严格 0 遮挡，eyeGlint 绝不进 glowKeys）
    const eyeZ = hz + 3.6, eyeY = hy + 3.9 + puffY * 0.35;
    for (const s of [-1, 1]) {
      const ex = s * (4.6 + puffX * 0.25);
      m.fillAABB(ex - 2.4, ex + 2.4, eyeY - 2.3, eyeY + 2.3, eyeZ - 2.2, eyeZ + 2.3, (x, y, z, X, Y) => {
        const dx = (X - ex) / 2.05, dy = (Y - eyeY) / 2.05, dz = (z - eyeZ) / 1.95;
        if (dx * dx + dy * dy + dz * dz <= 1.0) {
          let col = keyToId.eyeIris;
          if (Y >= eyeY + 0.65 && Math.hypot(X - (ex + s * 0.35), z - eyeZ) <= 1.18) col = keyToId.eyeDark;
          if (Y >= eyeY + 0.85 && z >= eyeZ + 0.65 && Math.abs(X - (ex + s * 0.55)) <= 0.75) col = keyToId.eyeGlint;
          m.setRaw(x, y, z, col, partId.eye);
        }
      });
    }
    return m.toStripAsset(makeCanvas, { footRadius: puff ? 7.2 : 6.5 });
  }

  // 5. 健壮双臂（10×10×8）
  function buildMurlocArmPart(makeCanvas, side) {
    const m = new VoxelModel(10, 10, 8, SPEC);
    const { mat, partId } = SPEC;
    const s = side;
    m.paintCapsule(0, 0, 5.0, s * 3.0, 1.6, 3.0, 1.75, 1.5, mat('skin'), partId.arm, true);
    m.paintCapsule(s * 3.0, 1.6, 3.0, s * 4.4, 4.2, 3.8, 1.5, 1.35, mat('skin'), partId.arm, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.0 });
  }

  // 6. 绑海草扇形贝壳小盾（11×10×13，锁在左前臂）
  function buildMurlocShieldPart(makeCanvas) {
    const m = new VoxelModel(11, 10, 13, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-4.8, 4.4, -4.2, 4.2, 0.5, 12.2, (x, y, z, X, Y) => {
      const lz = z - 6.0;
      const distPlane = X * (-0.52) + Y * 0.85;
      const u = X * 0.85 + Y * 0.52, v = lz;
      const ang = Math.atan2(u, v + 4.6), rad = Math.hypot(u, v + 4.6);
      if (Math.abs(ang) <= 0.82 && rad >= 1.2 && rad <= 9.8) {
        if (rad <= 9.0 + Math.cos(ang * 9) * 0.72) {
          const ridge = Math.cos(ang * 9) * 0.38, thick = 1.20 + (rad < 3.0 ? 0.3 : 0);
          if (Math.abs(distPlane - ridge) <= thick) {
            const isStrap = Math.abs(v + u * 0.42 - 0.6) <= 0.95;
            m.setRaw(x, y, z, isStrap ? mat('weed') : mat('shell'), isStrap ? partId.seaweed : partId.shield);
          }
        }
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5 });
  }

  // 7. 海兽骨叉 + 自亮水珠饰坠（握柄枢轴锁在右手）
  const MURLOC_TRIDENT_PIVOT_Y = 2.0;
  function buildMurlocTridentPart(makeCanvas, style = 'hold') {
    const { mat, partId, keyToId } = SPEC;
    if (style === 'thrust') {
      const m = new VoxelModel(12, 34, 12, SPEC);
      const py = -MURLOC_TRIDENT_PIVOT_Y;
      m.paintCapsule(0, py - 11.0, 5.5, 0, py + 10.2, 5.5, 1.20, 1.24, mat('bone'), partId.trident, true);
      m.paintEllipsoid(0, py + 8.8, 5.5, 1.8, 1.8, 1.8, mat('weed'), partId.seaweed, true);
      m.paintEllipsoid(0, py + 8.8, 7.2, 1.1, 1.1, 1.0, keyToId.emissiveMid, partId.charm, true);
      m.setRaw(6, Math.round(16.5 + py + 8.8), 7, keyToId.emissiveCore, partId.charm);
      m.paintCapsule(-3.2, py + 10.2, 5.5, 3.2, py + 10.2, 5.5, 1.2, 1.2, mat('bone'), partId.trident, true);
      m.paintCapsule(0,    py + 10.2, 5.5, 0,   py + 18.0, 5.5, 1.24, 1.08, mat('bone'), partId.trident, true);
      m.paintCapsule(-3.2, py + 10.2, 5.5, -3.4, py + 16.0, 5.5, 1.12, 1.06, mat('bone'), partId.trident, true);
      m.paintCapsule( 3.2, py + 10.2, 5.5,  3.4, py + 16.0, 5.5, 1.12, 1.06, mat('bone'), partId.trident, true);
      m.despeckle();
      m.applyArtShading(true);
      return m.toStripAsset(makeCanvas, { footRadius: 4.5 });
    }
    const isSlam = style === 'slam';
    const m = new VoxelModel(12, 18, 34, SPEC);
    const sy0 = -5.5 - MURLOC_TRIDENT_PIVOT_Y, sz0 = isSlam ? 4.5 : 1.5;
    const sy1 =  4.5 - MURLOC_TRIDENT_PIVOT_Y, sz1 = isSlam ? 25.0 : 23.0;
    m.paintCapsule(0, sy0, sz0, 0.8, sy1, sz1, 1.18, 1.24, mat('bone'), partId.trident, true);
    const nx = 0.7, ny = lerp(sy0, sy1, 0.92), nz = lerp(sz0, sz1, 0.92);
    m.paintEllipsoid(nx, ny, nz, 1.75, 1.75, 1.65, mat('weed'), partId.seaweed, true);
    m.paintEllipsoid(nx + 1.2, ny + 0.8, nz - 0.7, 1.05, 1.05, 1.05, keyToId.emissiveMid, partId.charm, true);
    m.setRaw(Math.round(5.5 + nx + 1.3), Math.round(8.5 + ny + 0.9), Math.round(nz - 0.5), keyToId.emissiveCore, partId.charm);
    const bL = [0.8 - 3.1, sy1 + 0.6, sz1 + 0.2], bR = [0.8 + 3.1, sy1 - 0.6, sz1 - 0.2];
    m.paintCapsule(bL[0], bL[1], bL[2], bR[0], bR[1], bR[2], 1.18, 1.18, mat('bone'), partId.trident, true);
    m.paintCapsule(0.8, sy1, sz1, 1.0, sy1 + 3.2, Math.min(32.5, sz1 + 8.4), 1.22, 1.06, mat('bone'), partId.trident, true);
    m.paintCapsule(bL[0], bL[1], bL[2], bL[0] - 0.4, bL[1] + 2.4, Math.min(31.5, bL[2] + 6.2), 1.14, 1.05, mat('bone'), partId.trident, true);
    m.paintCapsule(bR[0], bR[1], bR[2], bR[0] + 0.4, bR[1] + 2.2, Math.min(31.3, bR[2] + 6.0), 1.14, 1.05, mat('bone'), partId.trident, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.5 });
  }

  const HOP_RING = [
    { x:  24, y: -18 }, { x:  32, y:  10 }, { x:  18, y:  24 },
    { x: -20, y:  22 }, { x: -32, y:   4 }, { x: -22, y: -22 }, { x: 0, y: -26 }
  ];

  const MurlocDef = {
    id: 'murloc_tide',
    name: '滩涂鱼人',
    tag: '两栖蛙跳 · 骨叉贝盾',
    summary: 'v3 标杆重做：12 部件完整两栖战士（三趾蹼足+花纹锯齿背鳍+双态鼓腮鱼头+绑海草贝壳小盾+自亮水珠海兽骨叉）与 4 阶段蛙跳巡滩',
    defaultHabitat: 'tideflat',
    footRadius: 10.0,
    ecoWeight: 0.88,
    useWaterFoam: true,
    spec: SPEC,
    skins: SKINS,
    blocks: ['三趾扇形蹼足双腿', '花纹躯干与锯齿背鳍', '常规/鼓腮双态鱼头', '海草贝壳小盾', '海兽骨叉与4段蛙跳'],
    soulHabit: '滩涂低蹲鼓腮警戒张望 ↔ 深蹲蓄力、蹼足蹬跃、踩水溅浪四阶段蛙跳巡滩',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        legL:          buildMurlocLegPart(makeCanvas, -1),
        legR:          buildMurlocLegPart(makeCanvas,  1),
        torso:         buildMurlocTorsoPart(makeCanvas),
        tail:          buildMurlocTailPart(makeCanvas),
        head:          buildMurlocHeadPart(makeCanvas, false),
        headPuff:      buildMurlocHeadPart(makeCanvas, true),
        armL:          buildMurlocArmPart(makeCanvas, -1),
        armR:          buildMurlocArmPart(makeCanvas,  1),
        shield:        buildMurlocShieldPart(makeCanvas),
        tridentHold:   buildMurlocTridentPart(makeCanvas, 'hold'),
        tridentThrust: buildMurlocTridentPart(makeCanvas, 'thrust'),
        tridentSlam:   buildMurlocTridentPart(makeCanvas, 'slam')
      };

      const headSpring = new SpringDamper1D(0, 92, 8.2);
      const tailSpring = new SpringDamper1D(0, 96, 6.8);

      const hx0 = opts.homeX ?? 0;
      const hy0 = opts.homeY ?? 0;
      const state = {
        x: hx0, y: hy0, z: 0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        crouchZ: 0,
        stepPhase: 0, stepAmp: 0.7,
        puffHead: false,
        armLYaw: 0, armLZ: 0,
        armRYaw: 0, armRZ: 0,
        tridentYaw: 0,
        hopIdx: Math.abs(Math.floor(opts.seed || 0)) % HOP_RING.length,
        hopTimer: 0,
        hopFromX: hx0, hopFromY: hy0,
        hopToX: HOP_RING[0].x, hopToY: HOP_RING[0].y,
        hopLanded: false
      };

      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: MurlocDef,
        cachePrefix: `murloc_v3b_${Math.random().toString(36).slice(2, 7)}`,
        parts,
        partListAssets: Object.values(parts),
        state,
        sockets,
        scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.z = 0;
          state.vx = 0; state.vy = 0; state.yaw = hyaw;
          state.crouchZ = 0; state.puffHead = false;
          state.hopTimer = 0; state.hopFromX = hx; state.hopFromY = hy;
          const wp = HOP_RING[state.hopIdx];
          state.hopToX = wp.x; state.hopToY = wp.y;
          state.hopLanded = false;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const gFreq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const speedMul = clamp(params.speed ?? 1.0, 0.4, 2.2);
          const flex = clamp(params.tailFlex ?? 1.0, 0.4, 2.0);
          const patrol = eco && eco.patrol !== false;
          const maxR = (eco && eco.maxRadius) || 48;
          const fx = curSkin.fx || SKINS[0].fx;

          const kSlow = expSmooth(dt, 9.0);
          const kFast = expSmooth(dt, 16.0);

          let tgtX = eco ? (eco.homeX ?? 0) : 0;
          let tgtY = eco ? (eco.homeY ?? 0) : 0;
          let tgtLift = 0;
          let tgtYaw = eco ? (eco.homeYaw ?? 0) : 0;
          let tgtCrouch = Math.sin(time * 4.2 * gFreq) * 0.65 * sMul;
          let stepSpeed = 6.5 * gFreq;
          let tgtStepAmp = 0.7;
          let tgtHeadYaw = Math.sin(time * 1.6) * 0.28;
          let tgtPuff = ((time % 4.6) > 2.6 && (time % 4.6) < 3.4);
          let tgtTailWag = Math.sin(time * 4.2 * gFreq) * 0.32 * flex;
          let tgtArmLYaw = Math.sin(time * 3.0) * 0.12;
          let tgtArmLZ = 0;
          let tgtArmRYaw = -Math.sin(time * 3.0) * 0.12;
          let tgtArmRZ = Math.sin(time * 3.6) * 0.6 * sMul;
          let tgtTridentYaw = Math.sin(time * 3.6) * 0.10;

          if (patrol) {
            // 4 阶段两栖蛙跳巡滩：深蹲蓄力 -> 蹼足蹬跃腾空 -> 空中前扑 -> 踩水落滩
            const hopDur = clamp(1.06 / (gFreq * 0.55 + speedMul * 0.45), 0.55, 1.9);
            state.hopTimer += dt;
            if (state.hopTimer >= hopDur) {
              state.hopTimer -= hopDur;
              state.hopFromX = state.x;
              state.hopFromY = state.y;
              state.hopIdx = (state.hopIdx + 1) % HOP_RING.length;
              const wp = HOP_RING[state.hopIdx];
              let tx = wp.x + ((eco && eco.avoidX) || 0) * 0.45;
              let ty = wp.y + ((eco && eco.avoidY) || 0) * 0.45;
              const dR = Math.hypot(tx, ty);
              if (dR > maxR) { tx *= maxR / dR; ty *= maxR / dR; }
              state.hopToX = tx;
              state.hopToY = ty;
              state.hopLanded = false;
            }
            const u = state.hopTimer / hopDur;
            const dxH = state.hopToX - state.hopFromX;
            const dyH = state.hopToY - state.hopFromY;
            tgtYaw = Math.hypot(dxH, dyH) > 0.5 ? Math.atan2(-dxH, dyH) : state.yaw;
            tgtPuff = false;

            if (u < 0.24) {
              const p = u / 0.24;
              tgtX = state.hopFromX; tgtY = state.hopFromY; tgtLift = 0;
              tgtCrouch = -smoothstep(0, 1, p) * 2.8 * sMul;
              tgtStepAmp = 0.2;
              tgtTailWag = Math.sin(p * Math.PI * 2) * 0.45 * flex;
            } else if (u < 0.76) {
              const p = (u - 0.24) / 0.52;
              tgtX = lerp(state.hopFromX, state.hopToX, smoothstep(0, 1, p));
              tgtY = lerp(state.hopFromY, state.hopToY, smoothstep(0, 1, p));
              tgtLift = Math.sin(p * Math.PI) * 14.5 * clamp(0.8 + sp * 0.2, 0.8, 1.3) * sMul;
              tgtCrouch = 1.2 * Math.sin(p * Math.PI) * sMul;
              tgtStepAmp = 0.1;
              tgtTailWag = Math.sin(p * Math.PI * 3) * 0.55 * flex;
              tgtArmLZ = 1.8 * Math.sin(p * Math.PI) * sMul;
              tgtArmRZ = 2.0 * Math.sin(p * Math.PI) * sMul;
            } else {
              const p = (u - 0.76) / 0.24;
              tgtX = state.hopToX; tgtY = state.hopToY; tgtLift = 0;
              tgtCrouch = -Math.sin(p * Math.PI) * 2.4 * sMul;
              tgtHeadYaw = Math.sin(p * Math.PI * 2) * 0.35;
              if (!state.hopLanded) {
                state.hopLanded = true;
                if (vfx) {
                  EnvFeedback.emitFootstep(vfx, habitat, state.hopToX, state.hopToY, 1.25 * sMul);
                  for (let k = 0; k < 8; k++) {
                    const a = (k / 8) * TAU + Math.random() * 0.3;
                    const spd = (11 + Math.random() * 14) * sMul;
                    vfx.spawnParticle(
                      state.hopToX + Math.cos(a) * 4 * sMul, state.hopToY + Math.sin(a) * 4 * sMul, 1.5 * sMul,
                      Math.cos(a) * spd, Math.sin(a) * spd, (9 + Math.random() * 10) * sMul,
                      0.35, 1.6, k & 1 ? fx.core : fx.hot, true, 52
                    );
                  }
                }
              }
            }
          }

          state.stepPhase += dt * stepSpeed;
          state.stepAmp = lerp(state.stepAmp, tgtStepAmp, kFast);
          const kPos = patrol ? kFast : kSlow;
          const nx = lerp(state.x, tgtX, kPos);
          const ny = lerp(state.y, tgtY, kPos);
          state.vx = (nx - state.x) / Math.max(dt, 0.001);
          state.vy = (ny - state.y) / Math.max(dt, 0.001);
          state.x = nx;
          state.y = ny;
          state.z = lerp(state.z, tgtLift, kFast);
          state.yaw = wrapAngle(state.yaw + wrapAngle(tgtYaw - state.yaw) * kFast);
          state.crouchZ = lerp(state.crouchZ, tgtCrouch, kFast);
          state.puffHead = tgtPuff;

          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          headSpring.update(dt, tgtHeadYaw, 92 * sp, clamp(8.2 * dScale, 3.4, 12.5));
          tailSpring.update(dt, tgtTailWag, 96 * sp, clamp(6.8 * dScale, 2.8, 11.5));

          state.armLYaw = lerp(state.armLYaw, tgtArmLYaw, kFast);
          state.armLZ   = lerp(state.armLZ,   tgtArmLZ,   kFast);
          state.armRYaw = lerp(state.armRYaw, tgtArmRYaw, kFast);
          state.armRZ   = lerp(state.armRZ,   tgtArmRZ,   kFast);
          state.tridentYaw = lerp(state.tridentYaw, tgtTridentYaw, kFast);
        },

        buildPartList(habitat) {
          const list = [];
          const sMul = instance.scaleMul;
          const isWater = !!(habitat && habitat.isWater);
          const yw = state.yaw;
          const hYaw = wrapAngle(yw + clamp(headSpring.x, -0.55, 0.55));
          const cz = state.crouchZ;
          const subLeg = EnvFeedback.calcSubmerge(state.z, habitat ? habitat.waterLevel : 2.6, 4.4, isWater);

          // 1. 双腿 + 宽大三趾扇形蹼足
          const sSin = Math.sin(state.stepPhase);
          const lY = sSin * state.stepAmp * sMul, rY = -sSin * state.stepAmp * sMul;
          const lZ = Math.max(0, sSin) * (0.6 + state.stepAmp * 0.45) * sMul;
          const rZ = Math.max(0, -sSin) * (0.6 + state.stepAmp * 0.45) * sMul;
          const [lx, ly] = localToWorldXY(state.x, state.y, yw, -4.8 * sMul, lY);
          const [rx, ry] = localToWorldXY(state.x, state.y, yw,  4.8 * sMul, rY);
          list.push({ partKey: 'legL', asset: parts.legL, x: lx, y: ly, lift: state.z + lZ, ro: yw, bias: -0.25, submerge: subLeg });
          list.push({ partKey: 'legR', asset: parts.legR, x: rx, y: ry, lift: state.z + rZ, ro: yw, bias: -0.25, submerge: subLeg });

          // 2. 微驼背花纹躯干 + 3 枚锯齿背鳍
          list.push({
            partKey: 'torso', asset: parts.torso,
            x: state.x, y: state.y, lift: state.z + 7.4 * sMul + cz, ro: yw, bias: 0.1
          });

          // 3. 粗短两栖尾（尾根枢轴严格锁死躯干后臀 (0, -6.2)）
          const [tRootX, tRootY] = localToWorldXY(state.x, state.y, yw, 0, -6.2 * sMul);
          const tYaw = wrapAngle(yw + clamp(tailSpring.x, -0.65, 0.65));
          const [tWx, tWy] = localToWorldXY(tRootX, tRootY, tYaw, 0, -MURLOC_TAIL_PIVOT_Y * sMul);
          list.push({ partKey: 'tail', asset: parts.tail, x: tWx, y: tWy, lift: state.z + 6.4 * sMul + cz, ro: tYaw, bias: -0.35 });

          // 4. 扁圆蛙鱼头（常规 / 鼓腮双态）
          const [hx, hy] = localToWorldXY(state.x, state.y, yw, 0, 2.2 * sMul);
          const hKey = state.puffHead ? 'headPuff' : 'head';
          list.push({ partKey: hKey, asset: parts[hKey], x: hx, y: hy, lift: state.z + 16.0 * sMul + cz, ro: hYaw, bias: 0.4 });

          // 5. 左臂 + 绑海草扇形贝壳小盾
          const [lShX, lShY] = localToWorldXY(state.x, state.y, yw, -5.6 * sMul, -0.4 * sMul);
          const lArmY = yw + state.armLYaw;
          list.push({ partKey: 'armL', asset: parts.armL, x: lShX, y: lShY, lift: state.z + 11.4 * sMul + cz + state.armLZ, ro: lArmY, bias: 0.2 });
          const [sHdX, sHdY] = localToWorldXY(lShX, lShY, lArmY, -5.0 * sMul, 5.4 * sMul);
          list.push({ partKey: 'shield', asset: parts.shield, x: sHdX, y: sHdY, lift: state.z + 8.6 * sMul + cz + state.armLZ, ro: lArmY, bias: 0.35 });

          // 6. 右臂 + 锁枢轴海兽骨叉与自亮水珠饰坠
          const [rShX, rShY] = localToWorldXY(state.x, state.y, yw, 5.6 * sMul, -0.4 * sMul);
          const rArmY = yw + state.armRYaw;
          list.push({ partKey: 'armR', asset: parts.armR, x: rShX, y: rShY, lift: state.z + 11.4 * sMul + cz + state.armRZ, ro: rArmY, bias: 0.2 });
          const [rHdX, rHdY] = localToWorldXY(rShX, rShY, rArmY, 5.0 * sMul, 3.6 * sMul);
          const trYaw = rArmY + state.tridentYaw;
          const [trWx, trWy] = localToWorldXY(rHdX, rHdY, trYaw, 0, MURLOC_TRIDENT_PIVOT_Y * sMul);
          list.push({ partKey: 'tridentHold', asset: parts.tridentHold, x: trWx, y: trWy, lift: state.z + 1.5 * sMul + cz + state.armRZ, ro: trYaw, bias: 0.38 });

          return list;
        },

        exportManifest(params) {
          return {
            id: MurlocDef.id, name: MurlocDef.name, outlineMode: 'actorUnified',
            skin: curSkin.id, puffHead: state.puffHead,
            footRadius: MurlocDef.footRadius, headZ: 34, centerZ: 16,
            blocks: MurlocDef.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(MurlocDef);
})(window.PixelWorkshop);
