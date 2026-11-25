'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { TAU, clamp, lerp, expSmooth, wrapAngle, localToWorldXY, pivotToWorldXY } = PW.Math;
  const { createPaletteSpec, VoxelModel, recolorAsset } = PW.Voxel;

  // =========================================================================
  // B01 林间酒馆工会木屋（建筑拆块标杆，+Y 正门朝前）
  //   1. 全拆块单盒 <= 36×36×34，严守 28MB 图集上限：
  //      - foundation (36×30×8)：青灰石块地基 + 正门台阶
  //      - walls      (34×26×18)：浅米灰泥墙 + 深暖胡桃木桁架 + 拱门 + 两侧木百叶窗
  //      - roofSlope  (36×16×16)：双坡赤红陶瓦顶单坡资产（前后旋转 180° 复用，省一半贴图）
  //      - roofRidge  (36×14×14)：人字山墙封顶 + 脊梁与两端木雕脊饰（symDeg: 180）
  //      - chimney    (10×10×32)：侧立石烟囱 + 顶部陶烟口（symDeg: 90）
  //      - porch      (16×10×14)：门前木檐与撑柱 + 招牌横杆
  //      - signboard  (10×6×10) ：双面麦酒杯铜框木招牌（绕挂钩微风左右轻摆）
  //      - doorGlow   (26×22×12)：门缝与窗内暖火内芯（仅真炉火进 glowKeys）
  //   2. 俯视 ×4 强对比分色：暖胡桃木 / 浅米灰泥 / 赤红陶瓦 / 亮金铜件 / 青灰石基
  //   3. 动作：idle（柔和炊烟+招牌微晃）、busy（门窗暖火微闪+炊烟加密+招牌欢快轻摆）
  //   4. 3 套换色皮肤（红瓦林屋、青石蓝瓦、秋赭木屋），<= 48 色 0 重色 0 禁用字
  // =========================================================================
  const SPEC = createPaletteSpec({
    pal: {
      stoneDark:   '#464b52',
      stoneMid:    '#6c737c',
      stoneHi:     '#969ea8',

      plasterDark: '#c7baa0',
      plasterMid:  '#e8dec8',
      plasterHi:   '#f8f2e4',

      timberDark:  '#3a2214',
      timberMid:   '#623b22',
      timberHi:    '#8d5a36',

      roofDark:    '#8a281c',
      roofMid:     '#c9442c',
      roofHi:      '#ef784f',

      ridgeDark:   '#5c1b14',
      ridgeMid:    '#9c3222',
      ridgeHi:     '#d8603c',

      doorDark:    '#4f2c16',
      doorMid:     '#7d4924',
      doorHi:      '#aa6b39',

      brassDark:   '#8f6014',
      brassMid:    '#d89b24',
      brassHi:     '#fae06b',

      shutterDark: '#234a34',
      shutterMid:  '#36734e',
      shutterHi:   '#5ca372',

      glassDark:   '#4d321c',
      glassMid:    '#9c5d28',
      glassHi:     '#e09a44',

      foamCream:   '#f4ead5',
      aleAmber:    '#d47a1e',
      sootDark:    '#292526',

      hearthMid:   '#f06418',
      hearthHot:   '#ffa82e',
      hearthCore:  '#fff09c'
    },
    glowKeys: ['hearthMid', 'hearthHot', 'hearthCore'],
    parts: [
      'stone', 'plaster', 'timber', 'roof', 'ridge',
      'door', 'brass', 'shutter', 'glass', 'signWood',
      'mugBody', 'mugFoam', 'soot', 'hearth'
    ],
    noCrease: [
      ['hearth', 'glass'], ['hearth', 'door'], ['hearth', 'plaster'],
      ['mugBody', 'mugFoam'], ['mugBody', 'signWood'], ['mugFoam', 'signWood'],
      ['roof', 'ridge']
    ],
    materials: {
      stone:   ['stoneDark',   'stoneMid',   'stoneHi'],
      plaster: ['plasterDark', 'plasterMid', 'plasterHi'],
      timber:  ['timberDark',  'timberMid',  'timberHi'],
      roof:    ['roofDark',    'roofMid',    'roofHi'],
      ridge:   ['ridgeDark',   'ridgeMid',   'ridgeHi'],
      door:    ['doorDark',    'doorMid',    'doorHi'],
      brass:   ['brassDark',   'brassMid',   'brassHi'],
      shutter: ['shutterDark', 'shutterMid', 'shutterHi'],
      glass:   ['glassDark',   'glassMid',   'glassHi']
    },
    protectedParts: ['brass', 'mugFoam', 'mugBody', 'hearth']
  });

  const SKINS = [
    {
      id: 'red_tile', name: '红瓦林屋', dot: '#c9442c', outline: '#18100c',
      pal: {},
      fx: { smoke: '#d9d3cb', smokeHi: '#f0ebe4', ember: '#ff9c33' }
    },
    {
      id: 'blue_slate', name: '青石蓝瓦', dot: '#4270a3', outline: '#101620',
      pal: {
        stoneDark:   '#3b4654', stoneMid:   '#5d6e82', stoneHi:   '#8ba0b8',
        plasterDark: '#bec8d4', plasterMid: '#dfe6ee', plasterHi: '#f2f6fa',
        timberDark:  '#2e2932', timberMid:  '#4d4654', timberHi:  '#736a7d',
        roofDark:    '#254266', roofMid:    '#3c6b9e', roofHi:    '#6ea0d4',
        ridgeDark:   '#1a304d', ridgeMid:   '#2e5480', ridgeHi:   '#5889bd',
        shutterDark: '#233c52', shutterMid: '#375e7d', shutterHi: '#5b8aad'
      },
      fx: { smoke: '#cfd8e3', smokeHi: '#eaf0f7', ember: '#ffaa40' }
    },
    {
      id: 'autumn_ochre', name: '秋赭木屋', dot: '#c97a26', outline: '#1d120a',
      pal: {
        stoneDark:   '#4f463c', stoneMid:   '#786b5c', stoneHi:   '#a39482',
        plasterDark: '#d1ba92', plasterMid: '#ebd8b3', plasterHi: '#f9edd6',
        timberDark:  '#4a2214', timberMid:  '#753922', timberHi:  '#a35636',
        roofDark:    '#824614', roofMid:    '#c47222', roofHi:    '#eba442',
        ridgeDark:   '#592e0d', ridgeMid:   '#945418', ridgeHi:   '#d48832',
        shutterDark: '#66281c', shutterMid: '#993e2b', shutterHi: '#cc6448'
      },
      fx: { smoke: '#dfd3c3', smokeHi: '#f5ede2', ember: '#ff962e' }
    }
  ];

  // 1. 石块地基（36×30×8）
  function buildFoundation(makeCanvas) {
    const m = new VoxelModel(36, 30, 8, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 主石基座（外扩 1 格形成踏步裙边）
    m.fillAABB(-16, 16, -12, 12, 0, 5, (x, y, z, X, Y) => {
      const margin = z >= 4 ? 0.5 : 0;
      if (Math.abs(X) <= 15.5 - margin && Math.abs(Y) <= 11.5 - margin) {
        // 交错石砖缝
        const row = Math.floor(z / 2);
        const isSeam = (z === 2 || z === 4) && ((Math.round(X + row * 3) % 5 === 0) || (Math.round(Y + row * 2) % 5 === 0));
        m.setRaw(x, y, z, isSeam ? keyToId.stoneDark : mat('stone'), partId.stone);
      }
    });
    // 正门石台阶（+Y 方向伸出两级）
    m.fillAABB(-5, 5, 11, 14, 0, 3, (x, y, z, X, Y) => {
      if (Y <= 12.6 && z <= 3) m.setRaw(x, y, z, mat('stone'), partId.stone);
      else if (Y <= 14.0 && z <= 1) m.setRaw(x, y, z, mat('stone'), partId.stone);
    });
    // 四角石隅角石略突出
    for (const sx of [-15, 15]) {
      for (const sy of [-11, 11]) {
        m.fillAABB(sx - 1, sx + 1, sy - 1, sy + 1, 0, 6, (x, y, z) => {
          m.setRaw(x, y, z, mat('stone'), partId.stone);
        });
      }
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 17, headZ: 7, centerZ: 3 });
  }

  // 2. 浅米泥墙 + 深木桁架主体（34×26×18）
  function buildWalls(makeCanvas) {
    const m = new VoxelModel(34, 26, 18, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 浅米灰泥主体墙箱
    m.fillAABB(-14.5, 14.5, -10.5, 10.5, 0, 16, (x, y, z, X, Y) => {
      const onWall = Math.abs(X) >= 12.8 || Math.abs(Y) >= 8.8 || z >= 15;
      if (onWall) m.setRaw(x, y, z, mat('plaster'), partId.plaster);
    });

    // 深暖胡桃木桁架：四角立柱 + 底部/中腰/顶部横梁 + 中间立柱
    m.fillAABB(-15.2, 15.2, -11.2, 11.2, 0, 17, (x, y, z, X, Y) => {
      const ax = Math.abs(X), ay = Math.abs(Y);
      const isCorner = ax >= 13.4 && ay >= 9.4;
      const isBand = (z <= 1 || z === 8 || z === 9 || z >= 15) && (ax >= 13.6 || ay >= 9.6);
      const isFrontPost = (Math.abs(ax - 5.0) <= 0.8) && ay >= 9.6;
      const isSidePost = (Math.abs(Y) <= 0.9) && ax >= 13.6;
      if (isCorner || isBand || isFrontPost || isSidePost) {
        if (ax <= 15.1 && ay <= 11.1) m.setRaw(x, y, z, mat('timber'), partId.timber);
      }
    });

    // 斜撑木桁架（正背面上半段）
    for (const sy of [-10.3, 10.3]) {
      for (const sx of [-1, 1]) {
        m.paintCapsule(sx * 14.0, sy, 9.5, sx * 9.5, sy, 15.2, 0.85, 0.85, mat('timber'), partId.timber, true);
      }
    }

    // 正门（+Y 中央拱形厚木门 + 亮金铜门环与合页）
    m.fillAABB(-3.5, 3.5, 9.2, 11.4, 0, 11, (x, y, z, X, Y) => {
      const arch = z <= 8 || (X * X / 10.5 + (z - 8) * (z - 8) / 8.5 <= 1.0);
      if (!arch) return;
      if (Y >= 9.5 && Y <= 10.6) {
        const isPlankGap = (Math.round(X) === 0 || Math.abs(Math.round(X)) === 2) && Y > 10.0;
        m.setRaw(x, y, z, isPlankGap ? keyToId.doorDark : mat('door'), partId.door);
      }
    });
    // 门框加厚木拱
    m.fillAABB(-4.5, 4.5, 9.8, 11.4, 0, 12, (x, y, z, X, Y) => {
      const inOuter = z <= 8 || (X * X / 18.5 + (z - 8) * (z - 8) / 14.5 <= 1.0);
      const inInner = z <= 8 ? Math.abs(X) <= 3.2 : (X * X / 10.0 + (z - 8) * (z - 8) / 8.0 <= 1.0);
      if (inOuter && !inInner && Y >= 10.1) {
        m.setRaw(x, y, z, mat('timber'), partId.timber);
      }
    });
    // 铜门环与横铁带
    m.setRaw(Math.round(34 * 0.5 - 0.5 + 1.8), Math.round(26 * 0.5 - 0.5 + 11.0), 5, keyToId.brassHi, partId.brass);
    m.setRaw(Math.round(34 * 0.5 - 0.5 + 1.8), Math.round(26 * 0.5 - 0.5 + 11.0), 4, keyToId.brassMid, partId.brass);

    // 正面左右两扇百叶木窗 + 暖色窗格
    for (const sx of [-1, 1]) {
      const wx = sx * 9.5;
      // 窗框 + 暖色玻璃
      m.fillAABB(wx - 2.2, wx + 2.2, 9.6, 11.2, 5, 11, (x, y, z, X, Y) => {
        const isFrame = Math.abs(X - wx) >= 1.6 || z === 5 || z === 11 || Math.abs(X - wx) <= 0.4 || z === 8;
        if (isFrame) m.setRaw(x, y, z, mat('timber'), partId.timber);
        else if (Y <= 10.5) m.setRaw(x, y, z, mat('glass'), partId.glass);
      });
      // 两侧深绿木百叶窗扇
      for (const side of [-1, 1]) {
        m.fillAABB(wx + side * 2.8 - 0.6, wx + side * 2.8 + 0.6, 10.2, 11.3, 5, 11, (x, y, z) => {
          m.setRaw(x, y, z, mat('shutter'), partId.shutter);
        });
      }
    }

    // 左侧墙（-X）一扇小暖窗，右侧留给石烟囱贴靠
    m.fillAABB(-15.2, -13.6, -2.5, 2.5, 6, 12, (x, y, z, X, Y) => {
      const isFrame = Math.abs(Y) >= 1.8 || z === 6 || z === 12 || Math.abs(Y) <= 0.4 || z === 9;
      m.setRaw(x, y, z, isFrame ? mat('timber') : mat('glass'), isFrame ? partId.timber : partId.glass);
    });

    // 背面（-Y）两扇高窗
    for (const wx of [-8.5, 8.5]) {
      m.fillAABB(wx - 2.0, wx + 2.0, -11.2, -9.6, 6, 11, (x, y, z, X) => {
        const isFrame = Math.abs(X - wx) >= 1.5 || z === 6 || z === 11 || z === 8;
        m.setRaw(x, y, z, isFrame ? mat('timber') : mat('glass'), isFrame ? partId.timber : partId.glass);
      });
    }

    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 15, headZ: 17, centerZ: 8 });
  }

  // 3. 双坡赤红陶瓦顶单坡资产（36×16×16，前后旋转 180° 复用！）
  function buildRoofSlope(makeCanvas) {
    const m = new VoxelModel(36, 16, 16, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 坡面从 Y=-6.5 (屋脊高 Z=13) 向 Y=+7.2 (屋檐低 Z=1) 倾斜
    m.fillAABB(-17.5, 17.5, -7.2, 7.2, 0, 15, (x, y, z, X, Y) => {
      const u = clamp((Y + 6.5) / 13.5, 0, 1); // 0=脊, 1=檐
      const surfZ = 13.0 - u * 11.2;
      if (z >= surfZ - 2.4 && z <= surfZ + 0.8) {
        const isBargeboard = Math.abs(X) >= 16.3;
        if (isBargeboard) {
          m.setRaw(x, y, z, mat('timber'), partId.timber);
          return;
        }
        // 瓦垄凹凸纹（沿 X 每 3 格一道瓦垄，沿 Y 分层瓦片叠搭）
        const tileCol = ((Math.round(X + 20) % 3) === 0);
        const tileRow = ((Math.round(Y + 10) % 2) === 0);
        if (z > surfZ - 0.4) {
          if (tileCol && tileRow) m.setRaw(x, y, z, keyToId.roofHi, partId.roof);
          else if (!tileCol && !tileRow) m.setRaw(x, y, z, keyToId.roofDark, partId.roof);
          else m.setRaw(x, y, z, mat('roof'), partId.roof);
        } else {
          m.setRaw(x, y, z, mat('timber'), partId.timber);
        }
      }
    });
    // 屋檐底部一排深木封檐板 + 铜钉点缀
    m.fillAABB(-16.5, 16.5, 6.2, 7.2, 0, 2, (x, y, z, X) => {
      if (z === 1 && Math.abs(X) % 6 < 0.8) m.setRaw(x, y, z, keyToId.brassMid, partId.brass);
      else m.setRaw(x, y, z, mat('timber'), partId.timber);
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 16, headZ: 15, centerZ: 7 });
  }

  // 4. 人字山墙封顶 + 脊梁脊饰（36×14×14，symDeg: 180）
  function buildRoofRidge(makeCanvas) {
    const m = new VoxelModel(36, 14, 14, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 左右两端山墙三角封堵（消除双坡衔接处的镂空）
    m.fillAABB(-14.6, 14.6, -6.5, 6.5, 0, 11, (x, y, z, X, Y) => {
      const halfSpan = (11.2 - z) * 0.62;
      if (Math.abs(Y) <= halfSpan && Math.abs(X) >= 12.6) {
        const isBeam = Math.abs(Y) <= 0.8 || z <= 1 || Math.abs(Math.abs(Y) - halfSpan) <= 1.2;
        m.setRaw(x, y, z, isBeam ? mat('timber') : mat('plaster'), isBeam ? partId.timber : partId.plaster);
      }
    });
    // 顶部赤红陶脊瓦 + 两端翘角铜饰
    m.fillAABB(-17.4, 17.4, -1.8, 1.8, 10, 13, (x, y, z, X, Y) => {
      if (z <= 12 && Math.abs(Y) <= (z === 12 ? 1.1 : 1.7)) {
        m.setRaw(x, y, z, mat('ridge'), partId.ridge);
      }
    });
    for (const sx of [-16.6, 16.6]) {
      m.fillAABB(sx - 0.9, sx + 0.9, -1.2, 1.2, 11, 13, (x, y, z) => {
        m.setRaw(x, y, z, z === 13 ? keyToId.brassHi : mat('brass'), partId.brass);
      });
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 15, headZ: 13, centerZ: 8 });
  }

  // 5. 侧立石烟囱（10×10×32，四重对称 symDeg: 90）
  function buildChimney(makeCanvas) {
    const m = new VoxelModel(10, 10, 32, SPEC);
    const { mat, partId, keyToId } = SPEC;
    m.fillAABB(-4.5, 4.5, -4.5, 4.5, 0, 31, (x, y, z, X, Y) => {
      const ax = Math.abs(X), ay = Math.abs(Y);
      // 下宽上收的石砌烟囱体
      let half = 3.8;
      if (z >= 10) half = 3.1;
      if (z >= 20) half = 2.6;
      if (z === 28 || z === 29) half = 3.2; // 顶部石砌挑檐
      if (z >= 30) half = 2.2;              // 陶制烟囱口
      if (ax <= half && ay <= half) {
        if (z >= 29 && ax <= 1.2 && ay <= 1.2) {
          m.setRaw(x, y, z, keyToId.sootDark, partId.soot);
          return;
        }
        if (z >= 30) {
          m.setRaw(x, y, z, mat('ridge'), partId.ridge);
          return;
        }
        const seam = (z % 4 === 0) && ((Math.round(X + z) % 3 === 0) || (Math.round(Y + z) % 3 === 0));
        m.setRaw(x, y, z, seam ? keyToId.stoneDark : mat('stone'), partId.stone);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.5, headZ: 31, centerZ: 15 });
  }

  // 6. 门前木檐与撑柱（16×10×14）
  function buildPorch(makeCanvas) {
    const m = new VoxelModel(16, 10, 14, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 两根门前立柱
    for (const sx of [-5.2, 5.2]) {
      m.fillAABB(sx - 0.9, sx + 0.9, 1.5, 3.2, 0, 9, (x, y, z) => {
        m.setRaw(x, y, z, z <= 1 ? mat('stone') : mat('timber'), z <= 1 ? partId.stone : partId.timber);
      });
    }
    // 门檐横梁
    m.fillAABB(-6.4, 6.4, 1.2, 3.4, 8, 9, (x, y, z) => {
      m.setRaw(x, y, z, mat('timber'), partId.timber);
    });
    // 小斜坡赤红瓦雨檐（从 Y=-3.5 贴墙高 Z=13 斜到 Y=+4.2 低 Z=9）
    m.fillAABB(-7.2, 7.2, -3.5, 4.4, 8, 13, (x, y, z, X, Y) => {
      const u = clamp((Y + 3.5) / 7.9, 0, 1);
      const surfZ = 12.6 - u * 3.4;
      if (z >= surfZ - 1.4 && z <= surfZ + 0.5) {
        const isEdge = Math.abs(X) >= 6.4;
        m.setRaw(x, y, z, isEdge ? mat('timber') : mat('roof'), isEdge ? partId.timber : partId.roof);
      }
    });
    // 挑出悬挂招牌的亮铜横杆
    m.fillAABB(-2.5, 2.5, 3.2, 4.6, 8, 9, (x, y, z, X, Y) => {
      if (z === 8 && (Math.abs(X) <= 2.2 && Y >= 3.4)) {
        m.setRaw(x, y, z, keyToId.brassMid, partId.brass);
      }
    });
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 6.5, headZ: 13, centerZ: 7 });
  }

  // 7. 晃动麦酒杯木招牌（10×6×10，双面浮雕酒杯图徽）
  function buildSignboard(makeCanvas) {
    const m = new VoxelModel(10, 6, 10, SPEC);
    const { mat, partId, keyToId } = SPEC;
    // 顶部两只亮铜吊环
    for (const sx of [-2.0, 2.0]) {
      m.fillAABB(sx - 0.5, sx + 0.5, -0.5, 0.5, 7, 9, (x, y, z) => {
        m.setRaw(x, y, z, keyToId.brassHi, partId.brass);
      });
    }
    // 招牌底板 + 金铜外框
    m.fillAABB(-4.2, 4.2, -1.2, 1.2, 1, 7, (x, y, z, X, Y) => {
      const isBorder = Math.abs(X) >= 3.4 || z === 1 || z === 7;
      if (isBorder) m.setRaw(x, y, z, mat('brass'), partId.brass);
      else if (Math.abs(Y) <= 0.8) m.setRaw(x, y, z, mat('timber'), partId.signWood);
    });
    // 双面浮雕麦酒杯图标（琥珀杯身 + 奶白厚泡沫顶）
    for (const sy of [-1.2, 1.2]) {
      m.fillAABB(-1.6, 1.4, sy - 0.4, sy + 0.4, 2, 6, (x, y, z, X) => {
        if (z === 6 || (z === 5 && X <= 0.8)) {
          m.setRaw(x, y, z, keyToId.foamCream, partId.mugFoam);
        } else if (X >= -1.2 && X <= 0.6 && z >= 2 && z <= 4) {
          m.setRaw(x, y, z, keyToId.aleAmber, partId.mugBody);
        } else if (X > 0.6 && X <= 1.5 && (z === 3 || z === 4)) {
          m.setRaw(x, y, z, keyToId.brassHi, partId.brass);
        }
      });
    }
    m.despeckle();
    m.applyArtShading(true);
    return m.toStripAsset(makeCanvas, { footRadius: 4.0, headZ: 9, centerZ: 5 });
  }

  // 8. 门缝与窗内暖火内芯（26×22×12，仅真火暖源进 glowKeys）
  function buildDoorGlow(makeCanvas) {
    const m = new VoxelModel(26, 22, 12, SPEC);
    const { partId, keyToId } = SPEC;
    // 正门下缘与门缝暖火
    m.fillAABB(-2.6, 2.6, 9.6, 10.6, 1, 7, (x, y, z, X) => {
      const isCrack = Math.abs(X) <= 0.6 || z <= 2;
      if (isCrack) {
        const k = z <= 1 ? keyToId.hearthCore : (z <= 3 ? keyToId.hearthHot : keyToId.hearthMid);
        m.setRaw(x, y, z, k, partId.hearth);
      }
    });
    // 正面左右两扇窗暖火芯
    for (const wx of [-9.5, 9.5]) {
      m.fillAABB(wx - 1.3, wx + 1.3, 9.5, 10.4, 6, 10, (x, y, z, X) => {
        if (z === 8 || Math.abs(X - wx) <= 0.3) return;
        const k = z <= 7 ? keyToId.hearthCore : keyToId.hearthHot;
        m.setRaw(x, y, z, k, partId.hearth);
      });
    }
    return m.toStripAsset(makeCanvas, { footRadius: 12, headZ: 11, centerZ: 6 });
  }

  const Def = {
    id: 'building_guild',
    code: 'B01',
    name: '林间酒馆工会木屋',
    tag: '建筑标杆 · 拆块木屋',
    summary: 'B01 单体木石房屋标杆：全拆块 ≤36×36×34，双坡陶瓦顶前后复用、四重对称石烟囱周期飘炊烟、微风轻摆酒杯招牌与热闹营业态门窗暖火',
    defaultHabitat: 'forest',
    status: 'done',
    footRadius: 19,
    ecoWeight: 1.0,
    spec: SPEC,
    skins: SKINS,
    actions: [
      { id: 'idle', name: '柔和炊烟', loop: true, status: 'done' },
      { id: 'busy', name: '热闹营业', loop: true, status: 'done' }
    ],
    blocks: ['石基泥墙木桁架', '双坡陶瓦复用', '侧立石烟囱炊烟', '门檐晃动酒杯招牌', '门窗暖火营业态'],
    soulHabit: '林间冒着灰白炊烟的温暖酒馆工会木屋，招牌随风轻摆，热闹营业时门窗透出跳动暖火',
    defaultParams: { gaitFreq: 1.0, tailFlex: 1.0, springiness: 1.0, speed: 1.0, scaleMul: 1.0 },

    createInstance(makeCanvas, opts = {}) {
      const parts = {
        foundation: buildFoundation(makeCanvas),
        walls:      buildWalls(makeCanvas),
        roofSlope:  buildRoofSlope(makeCanvas),
        roofRidge:  buildRoofRidge(makeCanvas),
        chimney:    buildChimney(makeCanvas),
        porch:      buildPorch(makeCanvas),
        signboard:  buildSignboard(makeCanvas),
        doorGlow:   buildDoorGlow(makeCanvas)
      };

      const state = {
        x: opts.homeX ?? 0,
        y: opts.homeY ?? 0,
        z: 0,
        yaw: opts.homeYaw ?? 0,
        signSwing: 0,
        smokeTimer: 0,
        hearthPulse: 0.45,
        busyBlend: 0
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
          for (const a of Object.values(parts)) recolorAsset(a, tbl, SPEC.glowIdSet);
          return curSkin;
        },

        reset(x, y, yaw) {
          state.x = x; state.y = y; state.z = 0; state.yaw = yaw;
          state.signSwing = 0; state.smokeTimer = 0;
          state.hearthPulse = 0.45; state.busyBlend = 0;
        },

        update(dt, time, params, habitat, vfx, eco) {
          instance.scaleMul = params.scaleMul ?? 1.0;
          const sMul = instance.scaleMul;
          const sp = clamp(params.springiness ?? 1.0, 0.4, 2.2);
          const freq = clamp(params.gaitFreq ?? 1.0, 0.4, 2.2);
          const isBusy = !!(eco && eco.action === 'busy');
          state.busyBlend = lerp(state.busyBlend, isBusy ? 1 : 0, expSmooth(dt, 6.0));

          // 招牌随风轻摆（busy 时节奏更欢快）
          const swingAmp = lerp(0.14, 0.28, state.busyBlend) * clamp(0.75 + sp * 0.25, 0.6, 1.4);
          const swingFreq = lerp(1.85, 3.3, state.busyBlend) * freq;
          state.signSwing = Math.sin(time * swingFreq) * swingAmp + Math.sin(time * swingFreq * 2.1 + 0.7) * swingAmp * 0.22;

          // 门窗暖火脉动（busy 时微闪更明亮）
          const flicker = 0.5 + 0.5 * Math.sin(time * 7.4) * Math.cos(time * 4.3 + 0.6);
          state.hearthPulse = lerp(0.28 + flicker * 0.14, 0.72 + flicker * 0.28, state.busyBlend);

          // 烟囱顶部周期飘出灰白炊烟粒子（busy 时炊烟加密，偶带暖火屑）
          if (vfx) {
            const smokeInterval = lerp(0.42, 0.19, state.busyBlend) / freq;
            state.smokeTimer += dt;
            if (state.smokeTimer >= smokeInterval) {
              state.smokeTimer -= smokeInterval;
              const [cx, cy] = localToWorldXY(state.x, state.y, state.yaw, 14.5 * sMul, -3.5 * sMul);
              const fx = curSkin.fx || SKINS[0].fx;
              const puffCol = Math.random() > 0.45 ? fx.smokeHi : fx.smoke;
              vfx.spawnParticle(
                cx + (Math.random() - 0.5) * 2.2 * sMul,
                cy + (Math.random() - 0.5) * 2.2 * sMul,
                (state.z + 32.5) * sMul,
                (1.8 + Math.random() * 2.4) * sMul,
                (-1.0 + Math.random() * 2.0) * sMul,
                (7.2 + Math.random() * 4.0) * sMul,
                1.65 + Math.random() * 0.75,
                2.2 + Math.random() * 1.4,
                puffCol, false, -0.8
              );
              if (state.busyBlend > 0.4 && Math.random() < 0.45) {
                vfx.spawnParticle(
                  cx + (Math.random() - 0.5) * 1.6 * sMul,
                  cy + (Math.random() - 0.5) * 1.6 * sMul,
                  (state.z + 32.2) * sMul,
                  (Math.random() - 0.5) * 4.5 * sMul,
                  (Math.random() - 0.5) * 4.5 * sMul,
                  (10.5 + Math.random() * 5.0) * sMul,
                  0.65 + Math.random() * 0.35,
                  1.15,
                  fx.ember, true, 2.0
                );
              }
            }
          }
        },

        buildPartList() {
          const sMul = instance.scaleMul;
          const x = state.x, y = state.y, z = state.z, yaw = state.yaw;
          const list = [];

          // 1. 石块地基
          list.push({
            partKey: 'foundation', asset: parts.foundation,
            x, y, lift: z, ro: yaw, symDeg: 360, bias: -0.4
          });

          // 2. 浅米泥墙 + 深木桁架主体
          list.push({
            partKey: 'walls', asset: parts.walls,
            x, y, lift: z + 5.0 * sMul, ro: yaw, symDeg: 360, bias: 0
          });

          // 3. 门缝与窗内暖火内芯（仅真炉火进 glowKeys，通过透明度表现闲时/热闹营业微闪）
          list.push({
            partKey: 'doorGlow', asset: parts.doorGlow,
            x, y, lift: z + 5.0 * sMul, ro: yaw, symDeg: 360, bias: 0.25,
            opacity: clamp(state.hearthPulse, 0.2, 1.0), noOutline: true
          });

          // 4. 双坡赤红陶瓦顶（单坡资产前后旋转 180° 复用）
          const [rfx, rfy] = localToWorldXY(x, y, yaw, 0,  6.2 * sMul);
          const [rbx, rby] = localToWorldXY(x, y, yaw, 0, -6.2 * sMul);
          list.push({
            partKey: 'roofFront', asset: parts.roofSlope,
            x: rfx, y: rfy, lift: z + 20.0 * sMul, ro: yaw, symDeg: 360, bias: 0.35
          });
          list.push({
            partKey: 'roofBack', asset: parts.roofSlope,
            x: rbx, y: rby, lift: z + 20.0 * sMul, ro: wrapAngle(yaw + Math.PI), symDeg: 360, bias: 0.35
          });

          // 5. 山墙封顶与屋脊脊饰（symDeg: 180）
          list.push({
            partKey: 'roofRidge', asset: parts.roofRidge,
            x, y, lift: z + 21.0 * sMul, ro: yaw, symDeg: 180, bias: 0.45
          });

          // 6. 侧立石烟囱（贴靠右侧 +X 偏后，symDeg: 90）
          const [chx, chy] = localToWorldXY(x, y, yaw, 14.5 * sMul, -3.5 * sMul);
          list.push({
            partKey: 'chimney', asset: parts.chimney,
            x: chx, y: chy, lift: z + 1.0 * sMul, ro: yaw, symDeg: 90, bias: 0.2
          });

          // 7. 门前木檐与撑柱（+Y 正门前）
          const [px, py] = localToWorldXY(x, y, yaw, 0, 12.2 * sMul);
          list.push({
            partKey: 'porch', asset: parts.porch,
            x: px, y: py, lift: z + 5.0 * sMul, ro: yaw, symDeg: 360, bias: 0.3
          });

          // 8. 晃动麦酒杯木招牌（锁死上方挂钩，随微风轻轻左右摆动）
          const [hx, hy] = localToWorldXY(x, y, yaw, 0, 16.0 * sMul);
          const signYaw = wrapAngle(yaw + state.signSwing);
          const [sx, sy] = pivotToWorldXY(hx, hy, signYaw, 0, -0.4 * sMul);
          list.push({
            partKey: 'signboard', asset: parts.signboard,
            x: sx, y: sy, lift: z + (6.6 + Math.abs(state.signSwing) * 0.8) * sMul,
            ro: signYaw, symDeg: 360, bias: 0.65
          });

          return list;
        },

        exportManifest(params) {
          return {
            id: Def.id, code: Def.code, name: Def.name, skin: curSkin.id,
            footRadius: Def.footRadius, blocks: Def.blocks, params: { ...params },
            parts: Object.keys(parts).map(k => ({ id: k, w: parts[k].w, d: parts[k].d, h: parts[k].h }))
          };
        }
      };

      instance.reset(state.x, state.y, state.yaw);
      return instance;
    }
  };

  PW.Assets.register(Def, 'building');
})(window.PixelWorkshop);
