'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Creatures = window.PixelWorkshop.Creatures || [];

(function (PW) {
  const { clamp, lerp, smoothstep, smin, localToWorldXY, expSmooth } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;
  const { SpringDamper1D, SocketTracker } = PW.Solvers;
  const { Propulsion } = PW.Behaviors;

  // =========================================================================
  // 特2 · 洞窟翼蝠（v3 高精锐利骨骼化纯生态版，+Y 正前）
  // 严格复用已验证的 v3 魔物蝙蝠精制比例与 4 段折臂锯齿膜翼结构：
  //   1. 14 部件高精建模：毛绒圆躯(14×14×13)、腹下双弯爪(10×8×7)、常规/尖啸双态头(14×14×12)、
  //      厚实内槽雷达大耳(10×8×12)、4 姿锯齿宽膜翼(22×16×16：根→肘→腕→翼尖+腕爪+3辐射指骨+翼斑)
  //   2. 防糊红线：eyeGlint 严禁进 glowKeys，常态全程 1:1 像素无损绘制（零小数缩放）
  //   3. 翼根严格锁死肩关节 (±3.8, 0.2)，任意挥拍与滑翔后掠 0 脱节 0 挤捏缝
  //   4. 真实蝙蝠飞行运动学：下拍升力滞后 0.75 rad + 拍两下展翼滑翔（Flap-and-Glide）+ 双耳雷达侦听
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      furDark:      '#241a29',
      furMid:       '#42304a',
      furHi:        '#695075',
      bellyDark:    '#382a3d',
      bellyMid:     '#5b4563',
      bellyHi:      '#84698f',
      earInDark:    '#6b4e5c',
      earInMid:     '#a3798c',
      earInHi:      '#d9afc2',
      wingDark:     '#2e263d',
      wingMid:      '#504366',
      wingHi:       '#796896',
      spotDark:     '#3c314f',
      spotMid:      '#635380',
      spotHi:       '#8e7ab0',
      boneDark:     '#1c1521',
      boneMid:      '#352a3d',
      boneHi:       '#574863',
      mouthDark:    '#1a0c14',
      fangWhite:    '#f7f9fc',
      eyeDark:      '#140e1a',
      eyeIris:      '#ffd224',
      eyeGlint:     '#fffef2',
      emissiveMid:  '#9e6be6',
      emissiveHot:  '#cca3ff',
      emissiveCore: '#f4e8ff'
    },
    glowKeys: ['emissiveMid', 'emissiveHot', 'emissiveCore'],
    parts: [
      'body', 'belly', 'tail', 'head', 'snout', 'mouth', 'fang', 'eye',
      'earOuter', 'earInner', 'wingBone', 'wingMem', 'wingSpot', 'leg', 'claw', 'echoCore'
    ],
    noCrease: [
      ['eye', 'head'], ['eye', 'snout'],
      ['fang', 'mouth'], ['fang', 'snout'], ['fang', 'head'],
      ['mouth', 'snout'], ['mouth', 'head'], ['mouth', 'echoCore'],
      ['head', 'body'], ['body', 'belly'], ['body', 'tail'],
      ['wingMem', 'wingSpot']
    ],
    materials: {
      fur:   ['furDark',   'furMid',   'furHi'],
      belly: ['bellyDark', 'bellyMid', 'bellyHi'],
      earIn: ['earInDark', 'earInMid', 'earInHi'],
      wing:  ['wingDark',  'wingMid',  'wingHi'],
      spot:  ['spotDark',  'spotMid',  'spotHi'],
      bone:  ['boneDark',  'boneMid',  'boneHi']
    },
    protectedParts: ['eye', 'fang', 'echoCore']
  });

  const SKINS = [
    {
      id: 'cave', name: '深紫褐', dot: '#7d5696', outline: '#0d0b14', pal: {},
      fx: { echo: '#cca3ff', wind: '#eee3ff' }
    },
    {
      id: 'crimson', name: '猩红精锐', dot: '#d9323a', outline: '#16090c',
      pal: {
        furDark: '#1e1618', furMid: '#36272a', furHi: '#574045',
        bellyDark: '#2e1f23', bellyMid: '#4d353b', bellyHi: '#735159',
        earInDark: '#7a1922', earInMid: '#bd2b38', earInHi: '#f25c66',
        wingDark: '#63131c', wingMid: '#a6212f', wingHi: '#de4550',
        spotDark: '#4a0e16', spotMid: '#851b27', spotHi: '#bf3441',
        boneDark: '#171012', boneMid: '#2e2024', boneHi: '#4d363c',
        eyeIris: '#ff382e',
        emissiveMid: '#b81d2a', emissiveHot: '#f24952', emissiveCore: '#ffd6d6'
      },
      fx: { echo: '#f24952', wind: '#ffcfcf' }
    },
    {
      id: 'frost', name: '冰蓝白耳', dot: '#5ec9f2', outline: '#091320',
      pal: {
        furDark: '#28394d', furMid: '#45617d', furHi: '#6f91b3',
        bellyDark: '#4d657d', bellyMid: '#7995b0', bellyHi: '#abc7e0',
        earInDark: '#96aec2', earInMid: '#cfe1f0', earInHi: '#f0f8ff',
        wingDark: '#285f78', wingMid: '#489db8', wingHi: '#85daf0',
        spotDark: '#35738f', spotMid: '#5fb5cf', spotHi: '#a6ebfc',
        boneDark: '#1d2b3b', boneMid: '#364d66', boneHi: '#597796',
        eyeIris: '#2bf0ff',
        emissiveMid: '#2d96d6', emissiveHot: '#6be0ff', emissiveCore: '#e8fcff'
      },
      fx: { echo: '#6be0ff', wind: '#f0fbff' }
    },
    {
      id: 'venom', name: '墨青毒绿', dot: '#5cd93b', outline: '#081410',
      pal: {
        furDark: '#162922', furMid: '#25473b', furHi: '#3d705e',
        bellyDark: '#20382e', bellyMid: '#345e4d', bellyHi: '#538c74',
        earInDark: '#426b26', earInMid: '#72b03b', earInHi: '#b0eb65',
        wingDark: '#1d4d27', wingMid: '#34873c', wingHi: '#66c955',
        spotDark: '#5c851c', spotMid: '#9ad62b', spotHi: '#dbff52',
        boneDark: '#101d19', boneMid: '#1f362f', boneHi: '#37574d',
        eyeIris: '#d2ff24',
        emissiveMid: '#2fa83b', emissiveHot: '#78ed45', emissiveCore: '#ebffbd'
      },
      fx: { echo: '#78ed45', wind: '#d9ffc2' }
    }
  ];

  // 锯齿弧边翼膜曲面填充器（带斑纹点缀，严格防漏缝）
  function paintWingQuad(m, p00, p10, p11, p01, halfThick, val, partId, scallop = 0, spotVal = 0, spotPart = 0) {
    const hw = m.w * 0.5 - 0.5, hd = m.d * 0.5 - 0.5;
    const minX = Math.min(p00[0], p10[0], p11[0], p01[0]);
    const maxX = Math.max(p00[0], p10[0], p11[0], p01[0]);
    const x0 = clamp(Math.floor(minX - 0.6 + hw), 0, m.w - 1);
    const x1 = clamp(Math.ceil(maxX + 0.6 + hw),  0, m.w - 1);
    const ux = p10[0] - p00[0];
    const uSign = ux >= 0 ? 1 : -1;
    const invSpanX = 1 / Math.max(0.5, Math.abs(ux));
    const { w, d, h, grid, parts } = m;
    const wd = w * d;

    for (let x = x0; x <= x1; x++) {
      const X = x - hw;
      const u = clamp(uSign > 0 ? (X - p00[0]) * invSpanX : (p00[0] - X) * invSpanX, 0, 1);
      const ly = p00[1] + (p10[1] - p00[1]) * u;
      const lz = p00[2] + (p10[2] - p00[2]) * u;
      const ty = p01[1] + (p11[1] - p01[1]) * u + scallop * Math.sin(u * Math.PI);
      const tz = p01[2] + (p11[2] - p01[2]) * u;
      const yLo = Math.min(ly, ty) - 0.35, yHi = Math.max(ly, ty) + 0.35;
      const y0 = clamp(Math.floor(yLo + hd), 0, d - 1), y1 = clamp(Math.ceil(yHi + hd), 0, d - 1);
      const invSpanY = 1 / Math.max(0.5, ly - ty);
      const uInSpot = spotVal && u > 0.25 && u < 0.78;
      const duSpot = (u - 0.52) * 3.0, duSpot2 = duSpot * duSpot;

      for (let y = y0; y <= y1; y++) {
        const Y = y - hd;
        if (Y < yLo || Y > yHi) continue;
        const v = clamp((ly - Y) * invSpanY, 0, 1);
        const surfZ = lz + (tz - lz) * v;
        const z0 = clamp(Math.ceil(surfZ - halfThick), 0, h - 1);
        const z1 = clamp(Math.floor(surfZ + halfThick), 0, h - 1);
        let isSpot = false;
        if (uInSpot && v > 0.25 && v < 0.72) {
          const dv = (v - 0.48) * 3.0;
          if (duSpot2 + dv * dv < 0.3844) isSpot = true;
        }
        const writeVal = isSpot ? spotVal : val;
        const writePart = isSpot ? spotPart : partId;
        const xyOff = y * w + x;
        for (let z = z0; z <= z1; z++) {
          const i = z * wd + xyOff;
          if (!grid[i]) { grid[i] = writeVal; parts[i] = writePart; }
        }
      }
    }
  }

  // 1. 毛绒圆躯 + 浅色胸腹毛 + 后短尾（14×14×13）
  function buildTorso(makeCanvas) {
    const m = new VoxelModel(14, 14, 13, SPEC);
    const { mat, partId } = SPEC;
    m.fillAABB(-5.8, 5.8, -6.5, 5.5, 0, 12, (x, y, z, X, Y) => {
      const dBody = (Math.hypot(X / 5.0, (Y + 0.4) / 4.7, (z - 6.0) / 5.1) - 1) * 4.7;
      const dTail = (Math.hypot(X / 1.7, (Y + 5.2) / 1.8, (z - 3.4) / 1.4) - 1) * 1.4;
      if (smin(dBody, dTail, 1.0) <= 0) {
        if (Y < -4.2 && z < 5.2) m.setRaw(x, y, z, mat('fur'), partId.tail);
        else {
          const isBelly = Y > 1.0 && Math.abs(X) < 3.3 && z > 1.8 && z < 9.2;
          m.setRaw(x, y, z, isBelly ? mat('belly') : mat('fur'), isBelly ? partId.belly : partId.body);
        }
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.0 });
  }

  // 2. 独立蝙蝠头（14×14×12：常规微咧 / 尖啸张口双态，额前 2×2 锐利双眼 0 遮挡 + 两颗洁白尖牙）
  function buildHead(makeCanvas, screech = false) {
    const W = 14, D = 14, H = 12;
    const m = new VoxelModel(W, D, H, SPEC);
    const { mat, partId, keyToId } = SPEC;
    const hz = 5.4, hy = 0.2;
    m.paintEllipsoid(0, hy, hz, 4.6, 4.2, 3.8, mat('fur'), partId.head, true);
    m.paintEllipsoid(0, hy + 4.2, hz - 0.5, 2.1, 1.4, 1.2, mat('bone'), partId.snout, true);
    const jawZ = hz - 2.4 - (screech ? 0.8 : 0);
    m.paintEllipsoid(0, hy + 4.0, jawZ, 2.2, 1.4, 1.0, mat('fur'), partId.mouth, true);
    const mouthZ = Math.round(hz - 1.5 - (screech ? 0.3 : 0));
    m.fillAABB(-2.0, 2.0, hy + 3.8, hy + 5.4, mouthZ - 1, mouthZ + 1, (x, y, z, X, Y) => {
      if (Math.abs(X) <= 1.7 && Y >= hy + 4.0 && Y <= hy + 5.2 && z >= mouthZ - (screech ? 1 : 0) && z <= mouthZ) {
        m.setRaw(x, y, z, keyToId.mouthDark, partId.mouth);
      }
    });
    if (screech) {
      m.paintEllipsoid(0, hy + 4.2, mouthZ - 0.3, 1.0, 0.8, 0.8, keyToId.emissiveHot, partId.echoCore, true);
    }
    m.despeckle();
    m.applyArtShading(true);

    // 两颗洁白小尖牙
    const hw = W * 0.5 - 0.5, hd = D * 0.5 - 0.5;
    const fangZTop = Math.round(hz - 1.1);
    const fangY = Math.round(hd + hy + 4.9);
    for (const s of [-1, 1]) {
      const fx = Math.round(hw + s * 1.6);
      m.setRaw(fx, fangY, fangZTop,     keyToId.fangWhite, partId.fang);
      m.setRaw(fx, fangY, fangZTop - 1, keyToId.fangWhite, partId.fang);
    }
    // 额前 2×2 锐利大眼（齐平额前 0 遮挡，eyeGlint 绝不进 glowKeys 防糊）
    const eyeZ = Math.round(hz + 0.7);
    for (const s of [-1, 1]) {
      const ex0 = Math.round(hw + s * 2.2);
      const ex1 = ex0 + s;
      let sy0 = -1;
      for (let y = D - 2; y >= Math.floor(hd); y--) {
        if (m.getPartId(ex0, y, eyeZ) === partId.head) { sy0 = y; break; }
      }
      if (sy0 < 0) sy0 = Math.round(hd + hy + 3.8);
      m.setRaw(ex0, sy0, eyeZ,     keyToId.eyeIris,  partId.eye);
      m.setRaw(ex0, sy0, eyeZ + 1, keyToId.eyeGlint, partId.eye);
      m.setRaw(ex1, sy0, eyeZ,     keyToId.eyeDark,  partId.eye);
      m.setRaw(ex1, sy0, eyeZ + 1, keyToId.eyeIris,  partId.eye);
    }
    return m.toStripAsset(makeCanvas, { footRadius: 4.6 });
  }

  // 3. 独立厚实大尖耳（10×8×12，外厚 ≥ 2.2 格防旋转破碎 + 内耳槽，耳根枢轴在 (0, 0)）
  function buildEar(makeCanvas, side) {
    const m = new VoxelModel(10, 8, 12, SPEC);
    const { mat, partId } = SPEC;
    const s = side;
    const b = [0, 0, 1.4], mid = [s * 2.1, -0.3, 5.4], tip = [s * 3.8, -0.7, 9.6];
    m.paintCapsule(b[0], b[1], b[2], mid[0], mid[1], mid[2], 2.15, 1.82, mat('fur'), partId.earOuter, true);
    m.paintCapsule(mid[0], mid[1], mid[2], tip[0], tip[1], tip[2], 1.78, 1.15, mat('fur'), partId.earOuter, true);
    m.paintCapsule(b[0] + s * 1.0, b[1] - 0.3, b[2] + 0.5, mid[0] + s * 0.8, mid[1] - 0.2, mid[2] - 0.2, 1.32, 1.12, mat('fur'), partId.earOuter, true);
    m.paintCapsule(b[0] + s * 0.2, b[1] + 1.0, b[2] + 0.9, mid[0] + s * 0.1, mid[1] + 0.9, mid[2] + 0.4, 1.22, 1.02, mat('earIn'), partId.earInner, true);
    m.paintCapsule(mid[0] + s * 0.1, mid[1] + 0.9, mid[2] + 0.4, tip[0] - s * 0.5, tip[1] + 0.6, tip[2] - 1.4, 0.98, 0.72, mat('earIn'), partId.earInner, true);
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 2.5 });
  }

  // 4. 宽大锯齿弧边膜翼（22×16×16，4 姿 up/mid/down/glide，完整根→肘→腕→翼尖+3指骨+翼斑）
  const WING_PIVOT_X = 8.2;
  const WING_PIVOT_Y = 1.0;

  function buildWing(makeCanvas, side, pose = 'mid') {
    const m = new VoxelModel(22, 16, 16, SPEC);
    const { mat, partId } = SPEC;
    const s = side;
    const rx = -s * WING_PIVOT_X;
    const ry = WING_PIVOT_Y;
    const rz = 6.8;

    const cfg = {
      up:    { spread: 0.95, back: -0.6, eZ: 8.8, wZ: 12.2, tZ: 14.0 },
      mid:   { spread: 1.00, back:  0.0, eZ: 6.6, wZ:  8.4, tZ:  8.0 },
      down:  { spread: 0.92, back:  0.4, eZ: 4.8, wZ:  4.2, tZ:  2.2 },
      glide: { spread: 1.04, back: -2.2, eZ: 6.8, wZ:  8.0, tZ:  7.6 }
    }[pose] || { spread: 1.0, back: 0, eZ: 6.6, wZ: 8.4, tZ: 8.0 };

    const sp = cfg.spread, bk = cfg.back;
    const pRoot  = [rx,                 ry,                  rz];
    const pElbow = [rx + s * 5.2 * sp,  ry - 1.4 + bk * 0.3, cfg.eZ];
    const pWrist = [rx + s * 10.4 * sp, ry + 3.0 + bk * 0.7, cfg.wZ];
    const pTip   = [rx + s * 17.2 * sp, ry + 0.2 + bk * 1.0, cfg.tZ];

    const pTRoot   = [rx,                 ry - 4.4,            rz - 2.6];
    const pTRib3   = [rx + s * 5.0 * sp,  ry - 7.4 + bk * 0.4, cfg.eZ - 2.6];
    const pTRib2   = [rx + s * 10.2 * sp, ry - 8.0 + bk * 0.6, lerp(cfg.wZ, cfg.tZ, 0.35) - 3.0];
    const pTRib1   = [rx + s * 14.4 * sp, ry - 5.6 + bk * 0.8, cfg.tZ - 2.2];
    const pTipBack = [rx + s * 16.8 * sp, ry - 2.2 + bk * 0.9, cfg.tZ - 0.9];

    paintWingQuad(m, pRoot,  pElbow, pTRib3,   pTRoot, 1.24, mat('wing'), partId.wingMem, 1.3, mat('spot'), partId.wingSpot);
    paintWingQuad(m, pElbow, pWrist, pTRib2,   pTRib3, 1.24, mat('wing'), partId.wingMem, 1.4, mat('spot'), partId.wingSpot);
    paintWingQuad(m, pWrist, pTRib1, pTRib1,   pTRib2, 1.24, mat('wing'), partId.wingMem, 1.6, mat('spot'), partId.wingSpot);
    paintWingQuad(m, pWrist, pTip,   pTipBack, pTRib1, 1.20, mat('wing'), partId.wingMem, 1.5, mat('spot'), partId.wingSpot);

    m.paintCapsule(pRoot[0],  pRoot[1],  pRoot[2],  pElbow[0], pElbow[1], pElbow[2], 1.48, 1.32, mat('bone'), partId.wingBone, true);
    m.paintCapsule(pElbow[0], pElbow[1], pElbow[2], pWrist[0], pWrist[1], pWrist[2], 1.38, 1.32, mat('bone'), partId.wingBone, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pTip[0],   pTip[1],   pTip[2],   1.32, 0.98, mat('bone'), partId.wingBone, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pWrist[0] + s * 0.8, pWrist[1] + 1.8, pWrist[2] + 1.4, 1.02, 0.78, mat('bone'), partId.claw, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pTRib1[0], pTRib1[1], pTRib1[2], 1.12, 0.92, mat('bone'), partId.wingBone, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pTRib2[0], pTRib2[1], pTRib2[2], 1.12, 0.92, mat('bone'), partId.wingBone, true);
    m.paintCapsule(pWrist[0], pWrist[1], pWrist[2], pTRib3[0], pTRib3[1], pTRib3[2], 1.12, 0.92, mat('bone'), partId.wingBone, true);

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 8.0 });
  }

  // 5. 腹下双弯爪（10×8×7）
  function buildClaws(makeCanvas) {
    const m = new VoxelModel(10, 8, 7, SPEC);
    const { mat, partId } = SPEC;
    for (const s of [-1, 1]) {
      m.paintCapsule(s * 2.5, -1.0, 5.2, s * 2.7, 0.0, 1.8, 1.3, 1.1, mat('fur'), partId.leg, true);
      m.paintCapsule(s * 2.7, 0.0, 1.8, s * 2.5, 1.8, 0.8, 1.1, 0.88, mat('bone'), partId.claw, true);
      m.paintEllipsoid(s * 2.5, 1.2, 0.7, 1.08, 1.18, 0.82, mat('bone'), partId.claw, true);
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 3.2 });
  }

  const BatDef = {
    id: 'bat_cavern',
    name: '洞窟翼蝠',
    tag: '翼手滑翔飞行',
    summary: 'v3 标杆重做：4 段折臂锯齿宽膜翼（根→肘→腕→尖+3指骨+翼斑）+ 厚实内槽大尖耳 + 下拍升力滞后',
    defaultHabitat: 'cave',
    footRadius: 7.5,
    ecoWeight: 0.72,
    useWaterFoam: false,
    spec: SPEC,
    skins: SKINS,
    blocks: ['4 姿锯齿宽膜翼', '翼根锁枢轴零脱节', '独立雷达大尖耳', '下拍升力滞后', '拍两下滑翔节律'],
    soulHabit: '低空扑翼悬停双耳侦听 ↔ 拍两下强力爬升后展翼压弯滑翔',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        torso:       buildTorso(makeCanvas),
        head:        buildHead(makeCanvas, false),
        headScreech: buildHead(makeCanvas, true),
        earL:        buildEar(makeCanvas, -1),
        earR:        buildEar(makeCanvas,  1),
        claws:       buildClaws(makeCanvas),
        wingL_up:    buildWing(makeCanvas, -1, 'up'),
        wingL_mid:   buildWing(makeCanvas, -1, 'mid'),
        wingL_down:  buildWing(makeCanvas, -1, 'down'),
        wingL_glide: buildWing(makeCanvas, -1, 'glide'),
        wingR_up:    buildWing(makeCanvas,  1, 'up'),
        wingR_mid:   buildWing(makeCanvas,  1, 'mid'),
        wingR_down:  buildWing(makeCanvas,  1, 'down'),
        wingR_glide: buildWing(makeCanvas,  1, 'glide')
      };

      const wingSpring = new SpringDamper1D(0, 145, 8.6);
      const earLSpring = new SpringDamper1D(0, 130, 10.5);
      const earRSpring = new SpringDamper1D(0, 130, 10.5);
      const headSpring = new SpringDamper1D(0, 88, 7.6);

      const state = {
        x: opts.homeX ?? 0, y: opts.homeY ?? 0, z: 13.0,
        vx: 0, vy: 0, yaw: opts.homeYaw ?? 0,
        phase: 0, glideCycle: opts.seed ? (opts.seed % 1) : 0,
        glideBlend: 0, wingPose: 'mid', wingSweepL: 0, wingSweepR: 0, wingZOff: 0,
        echoTimer: 3.4, echoCd: 0, screech: false, trailCd: 0
      };
      const sockets = new SocketTracker();
      let curSkin = SKINS[0];

      const instance = {
        def: BatDef,
        cachePrefix: `bat_v3b_${Math.random().toString(36).slice(2, 7)}`,
        parts, partListAssets: Object.values(parts), state, sockets, scaleMul: 1.0,
        get curSkin() { return curSkin; },

        applySkin(idx) {
          curSkin = SKINS[((idx % SKINS.length) + SKINS.length) % SKINS.length];
          const tbl = SPEC.buildRgbaTable(curSkin);
          for (const a of instance.partListAssets) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(hx, hy, hyaw) {
          state.x = hx; state.y = hy; state.yaw = hyaw;
          state.z = 13.0; state.glideBlend = 0; state.screech = false;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = params.springiness ?? 1.0;
          const dScale = 1 / Math.sqrt(Math.max(0.35, sp));
          const patrol = eco.patrol !== false;
          const gFreq = params.gaitFreq ?? 1.0;

          // Flap-and-Glide 连续节律：前 44% 强拍两下爬升，后 56% 展翼滑翔
          state.glideCycle = (state.glideCycle + dt * 0.36 * gFreq) % 1.0;
          const glideTgt = patrol
            ? smoothstep(0.42, 0.50, state.glideCycle) * (1 - smoothstep(0.90, 0.98, state.glideCycle))
            : 0;
          state.glideBlend = lerp(state.glideBlend, glideTgt, expSmooth(dt, 9.0));

          const baseLift = lerp(13.5, 19.0, state.glideBlend) * sMul;
          Propulsion.wingFlap(state, dt, time, {
            ...params,
            gaitFreq: gFreq * lerp(1.55, 0.55, state.glideBlend),
            speed: (params.speed ?? 1.0) * lerp(0.92, 1.32, state.glideBlend)
          }, { ...eco, baseLift });

          const flapVal = Math.sin(state.phase);
          wingSpring.update(dt, lerp(flapVal, 0.05, state.glideBlend), 145 * sp, clamp(8.6 * dScale, 3.2, 12.5));

          state.wingPose = state.glideBlend > 0.52
            ? 'glide'
            : (wingSpring.x > 0.32 ? 'up' : (wingSpring.x < -0.32 ? 'down' : 'mid'));
          const tgtSweep = state.glideBlend > 0.52 ? -0.22 : (wingSpring.x * 0.18);
          state.wingSweepL = lerp(state.wingSweepL,  tgtSweep, expSmooth(dt, 14));
          state.wingSweepR = lerp(state.wingSweepR, -tgtSweep, expSmooth(dt, 14));
          state.wingZOff   = lerp(state.wingZOff, state.glideBlend > 0.52 ? 0.4 : wingSpring.x * 0.75, expSmooth(dt, 14));

          // 独立雷达大耳微转 + 头部轻扫
          const earTwitch = Math.sin(time * 4.5) > 0.76 ? Math.sin(time * 24) * 0.24 : 0;
          earLSpring.update(dt,  Math.sin(time * 1.9) * 0.14 + earTwitch, 130 * sp, clamp(10.5 * dScale, 4.0, 14.0));
          earRSpring.update(dt, -Math.sin(time * 2.3) * 0.14 - earTwitch * 0.8, 130 * sp, clamp(10.5 * dScale, 4.0, 14.0));
          headSpring.update(dt, patrol ? Math.sin(time * 1.8) * 0.16 : Math.sin(time * 2.1) * 0.24, 88 * sp, clamp(7.6 * dScale, 3.2, 11.5));

          // 滑翔翼尖气流微粒 + 偶发回声微粒
          state.trailCd -= dt;
          if (patrol && state.glideBlend > 0.45 && state.trailCd <= 0) {
            state.trailCd = 0.09;
            for (const s of [-1, 1]) {
              const [tx, ty] = localToWorldXY(state.x, state.y, state.yaw, s * 17.0 * sMul, -2.0 * sMul);
              vfx.spawnParticle(tx, ty, state.z + 9.0 * sMul, -state.vx * 0.12, -state.vy * 0.12, -1.2, 0.36, 1.25, curSkin.fx ? curSkin.fx.wind : '#eee3ff', true, 0);
            }
          }

          state.echoTimer -= dt;
          if (state.echoTimer <= 0) {
            state.echoTimer = 4.6 + Math.random() * 2.0;
            state.echoCd = 0.46;
          }
          state.screech = state.echoCd > 0;
          if (state.echoCd > 0) {
            const prevStep = Math.floor(state.echoCd / 0.15);
            state.echoCd = Math.max(0, state.echoCd - dt);
            if (Math.floor(state.echoCd / 0.15) !== prevStep) {
              const [mx, my] = localToWorldXY(state.x, state.y, state.yaw, 0, 6.2 * sMul);
              const [fx, fy] = localToWorldXY(0, 0, state.yaw, 0, 16);
              vfx.spawnParticle(mx, my, state.z + 14.0 * sMul, fx, fy, -1.0, 0.40, 1.4, curSkin.fx ? curSkin.fx.echo : '#cca3ff', true, 0);
            }
          }
        },

        buildPartList() {
          const list = [];
          const sMul = instance.scaleMul;
          const yw = state.yaw;
          const hYaw = yw + clamp(headSpring.x, -0.45, 0.45);
          // 身体升沉相位滞后于翼下拍 0.75 rad（真实空气动力学升力托举，零小数缩放）
          const liftLag = -Math.sin(state.phase - 0.75) * 1.65 * (1 - state.glideBlend) * sMul;
          const zBase = Math.max(4.0, state.z + liftLag);

          // 1. 腹下双弯爪
          list.push({
            partKey: 'claws', asset: parts.claws,
            x: state.x, y: state.y, lift: zBase, ro: yw, bias: -0.4
          });

          // 2. 毛绒圆躯
          list.push({
            partKey: 'torso', asset: parts.torso,
            x: state.x, y: state.y, lift: zBase + 3.6 * sMul, ro: yw, bias: 0.0
          });

          // 3. 独立蝙蝠头（常规 / 尖啸张口双态）
          const [hdX, hdY] = localToWorldXY(state.x, state.y, yw, 0, 1.4 * sMul);
          const hKey = state.screech ? 'headScreech' : 'head';
          list.push({
            partKey: hKey, asset: parts[hKey],
            x: hdX, y: hdY, lift: zBase + 10.6 * sMul, ro: hYaw, bias: 0.35
          });

          // 4. 左右独立厚实雷达大尖耳（耳根严格锁死头顶两侧 ±2.9, -0.5）
          const [elX, elY] = localToWorldXY(hdX, hdY, hYaw, -2.9 * sMul, -0.5 * sMul);
          const [erX, erY] = localToWorldXY(hdX, hdY, hYaw,  2.9 * sMul, -0.5 * sMul);
          list.push({ partKey: 'earL', asset: parts.earL, x: elX, y: elY, lift: zBase + 17.6 * sMul, ro: hYaw + clamp(earLSpring.x, -0.4, 0.4), bias: 0.25 });
          list.push({ partKey: 'earR', asset: parts.earR, x: erX, y: erY, lift: zBase + 17.6 * sMul, ro: hYaw + clamp(earRSpring.x, -0.4, 0.4), bias: 0.25 });

          // 5. 左右宽锯齿膜翼（局部翼根 (-s*8.2, 1.0) 严格锁死肩关节 (±3.8, 0.2)，0 脱节 0 挤捏缝）
          const wp = state.wingPose;
          for (const s of [-1, 1]) {
            const [shX, shY] = localToWorldXY(state.x, state.y, yw, s * 3.8 * sMul, 0.2 * sMul);
            const wYaw = yw + (s < 0 ? state.wingSweepL : state.wingSweepR);
            const [wx, wy] = localToWorldXY(shX, shY, wYaw, s * WING_PIVOT_X * sMul, -WING_PIVOT_Y * sMul);
            const wid = (s < 0 ? 'wingL_' : 'wingR_') + wp;
            list.push({
              partKey: wid, asset: parts[wid],
              x: wx, y: wy, lift: zBase + (4.8 + state.wingZOff) * sMul, ro: wYaw, bias: -0.1
            });
          }

          return list;
        },

        exportManifest(params) {
          return {
            id: BatDef.id, name: BatDef.name, outlineMode: 'actorUnified',
            skin: curSkin.id, wingPose: state.wingPose,
            footRadius: BatDef.footRadius, headZ: 30, centerZ: 18,
            blocks: BatDef.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Creatures.push(BatDef);
})(window.PixelWorkshop);
