'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

(function (PW) {
  const { periodicNoise2, hexToRgba } = PW.Math;

  // =========================================================================
  // 全部 22 种细分生境地台（含 T00 冒险家酒馆大厅底座 + T01~T21 野外生态，零禁用字）
  // =========================================================================
  const HABITAT_DEFS = [
    // --- 大厅酒馆（1）---
    {
      id: 'tavern', code: 'T00', name: '冒险家酒馆', short: '冒险酒馆', group: '大厅酒馆', isWater: false, waterLevel: -99,
      desc: '深暖胡桃木拼接长条木板、中央金边绛红圆形编织地毯与外缘石砌暖炉边',
      skyTop: '#1a110c', skyMid: '#2f1e14', skyBot: '#4c301e', skyHalo: 'rgba(255, 184, 108, 0.22)',
      fx: { ringRGB: '240, 178, 102', foamRGB: '255, 226, 172', dustRGB: '188, 146, 104', waterTint: 'rgba(130, 86, 48, 0.20)', accent: '#e08b3e' },
      pal: {
        rimA: '#4d4744', rimB: '#736b65', stoneHi: '#968c84',
        deep: '#3a2113', mid: '#5f3921', hi: '#7e4e2e',
        foam: '#9e242b', rugDark: '#6b151c', rugHi: '#c63b3d',
        speck: '#deb048', hearth: '#e8782e'
      }
    },

    // --- 天上（2）---
    {
      id: 'sky', code: 'T01', name: '高空云海', short: '高空云海', group: '天上', isWater: false, waterLevel: -99,
      desc: '浮云层叠、无水面、随高度淡化接地印与轻风微粒',
      skyTop: '#16274a', skyMid: '#2c4f82', skyBot: '#6590bf', skyHalo: 'rgba(218, 236, 255, 0.26)',
      fx: { ringRGB: '198, 228, 255', foamRGB: '245, 250, 255', dustRGB: '220, 235, 250', waterTint: 'rgba(210, 230, 250, 0.16)', accent: '#7ab8f5' },
      pal: { rimA: '#5f7696', rimB: '#8ca5c7', deep: '#8aa5c9', mid: '#b8cde6', hi: '#e3eefc', foam: '#f7fbff', speck: '#9eb7d9' }
    },
    {
      id: 'thunderPeak', code: 'T02', name: '雷云峰顶', short: '雷云峰顶', group: '天上', isWater: false, waterLevel: -99,
      desc: '深灰积雨云与岩峰交错，带静电闪纹与强风氛围',
      skyTop: '#0d101f', skyMid: '#1d243d', skyBot: '#394666', skyHalo: 'rgba(130, 198, 255, 0.22)',
      fx: { ringRGB: '146, 212, 255', foamRGB: '226, 246, 255', dustRGB: '158, 176, 204', waterTint: 'rgba(72, 108, 162, 0.22)', accent: '#6ec2ff' },
      pal: { rimA: '#24293b', rimB: '#3e4763', deep: '#2b3247', mid: '#454f6e', hi: '#6a799e', foam: '#a6e4ff', speck: '#e3f7ff' }
    },

    // --- 河湖（2）---
    {
      id: 'river', code: 'T03', name: '河湖深潭', short: '河湖深潭', group: '河湖', isWater: true, waterLevel: 2.8,
      desc: '深碧静水、水下折射印、3D 半潜淡化与 V 形尾迹',
      skyTop: '#0a1f30', skyMid: '#133c59', skyBot: '#216682', skyHalo: 'rgba(72, 214, 240, 0.22)',
      fx: { ringRGB: '76, 218, 245', foamRGB: '226, 250, 255', dustRGB: '164, 224, 236', waterTint: 'rgba(20, 126, 162, 0.28)', accent: '#36c8db' },
      pal: { rimA: '#3b4e5c', rimB: '#536c7d', deep: '#114d6e', mid: '#1e80a6', hi: '#4fb6cc', foam: '#c4f1f8', speck: '#296e8c' }
    },
    {
      id: 'stoneBay', code: 'T04', name: '石缝河湾', short: '石缝河湾', group: '河湖', isWater: true, waterLevel: 1.9,
      desc: '浅滩鹅卵石与岸边岩缝交错，浅水漫过涟漪',
      skyTop: '#0e222e', skyMid: '#1b4052', skyBot: '#336b78', skyHalo: 'rgba(122, 212, 224, 0.20)',
      fx: { ringRGB: '104, 214, 226', foamRGB: '230, 248, 250', dustRGB: '170, 184, 182', waterTint: 'rgba(32, 124, 142, 0.26)', accent: '#4bc4cf' },
      pal: { rimA: '#495459', rimB: '#6d7b80', deep: '#185469', mid: '#2b8299', hi: '#7b878a', foam: '#cceef2', speck: '#9ca8ab' }
    },

    // --- 海和冰（4）---
    {
      id: 'iceSea', code: 'T05', name: '极地冰缝', short: '极地冰缝', group: '海和冰', isWater: true, waterLevel: 2.6,
      desc: '洁白冰面裂开深蓝冰缝、雪面足印与冰下波纹',
      skyTop: '#091829', skyMid: '#153452', skyBot: '#2c5c80', skyHalo: 'rgba(150, 232, 255, 0.24)',
      fx: { ringRGB: '148, 232, 255', foamRGB: '240, 252, 255', dustRGB: '214, 244, 255', waterTint: 'rgba(42, 134, 178, 0.30)', accent: '#7ce2ff' },
      pal: { rimA: '#6c98b5', rimB: '#9ec8e0', deep: '#0e3759', mid: '#1d618a', hi: '#9ad8ed', foam: '#ebfaff', speck: '#c4ecfa' }
    },
    {
      id: 'openSea', code: 'T06', name: '远洋浮岛海域', short: '远洋海域', group: '海和冰', isWater: true, waterLevel: 3.0,
      desc: '开阔深蓝洋面、长波浪纹与破水白沫弧',
      skyTop: '#061429', skyMid: '#0d2c54', skyBot: '#185082', skyHalo: 'rgba(84, 184, 245, 0.22)',
      fx: { ringRGB: '88, 198, 252', foamRGB: '232, 248, 255', dustRGB: '174, 218, 245', waterTint: 'rgba(14, 90, 152, 0.30)', accent: '#3da8f5' },
      pal: { rimA: '#264361', rimB: '#3c678f', deep: '#0a315c', mid: '#145894', hi: '#2c84bd', foam: '#d9f2ff', speck: '#1d6ca8' }
    },
    {
      id: 'reef', code: 'T07', name: '浅海环礁', short: '浅海环礁', group: '海和冰', isWater: true, waterLevel: 2.8,
      desc: '清澈碧水环礁池、礁石外圈与珊瑚点缀',
      skyTop: '#071b2b', skyMid: '#0e3a57', skyBot: '#1c6d87', skyHalo: 'rgba(84, 230, 245, 0.24)',
      fx: { ringRGB: '64, 224, 240', foamRGB: '232, 252, 255', dustRGB: '182, 236, 242', waterTint: 'rgba(16, 140, 168, 0.26)', accent: '#2ed6d6' },
      pal: { rimA: '#4a5a66', rimB: '#708591', deep: '#0c4866', mid: '#1787a3', hi: '#5fd4db', foam: '#d9fafc', speck: '#c96f6b' }
    },
    {
      id: 'tideflat', code: 'T08', name: '潮汐滩涂', short: '潮汐滩涂', group: '海和冰', isWater: true, waterLevel: 2.0,
      desc: '浅水与湿泥沙交错、落脚溅水花与浅泥印',
      skyTop: '#13242b', skyMid: '#23424d', skyBot: '#3b666e', skyHalo: 'rgba(130, 212, 206, 0.20)',
      fx: { ringRGB: '112, 204, 198', foamRGB: '228, 245, 240', dustRGB: '166, 160, 134', waterTint: 'rgba(42, 108, 114, 0.28)', accent: '#5ebdb6' },
      pal: { rimA: '#4a463c', rimB: '#6b6454', deep: '#245963', mid: '#3b7e82', hi: '#8c8369', foam: '#d2e8e2', speck: '#a89c7d' }
    },

    // --- 林地与树冠（4）---
    {
      id: 'forest', code: 'T09', name: '林地落果空坪', short: '林地落果', group: '林地树冠', isWater: false, waterLevel: -99,
      desc: '林间草地、散落赤果与碎叶，重步落地扬尘',
      skyTop: '#10211a', skyMid: '#1e3d2d', skyBot: '#335e40', skyHalo: 'rgba(130, 214, 146, 0.20)',
      fx: { ringRGB: '144, 214, 134', foamRGB: '214, 245, 196', dustRGB: '166, 152, 114', waterTint: 'rgba(72, 130, 82, 0.20)', accent: '#62c77c' },
      pal: { rimA: '#3d3326', rimB: '#594b38', deep: '#24472c', mid: '#34663c', hi: '#528c4d', foam: '#d9663c', speck: '#70583c' }
    },
    {
      id: 'meadow', code: 'T10', name: '花丛草甸', short: '花丛草甸', group: '林地树冠', isWater: false, waterLevel: -99,
      desc: '繁花草坪、飘浮花粉微粒与轻柔暖风',
      skyTop: '#182e2a', skyMid: '#2c5446', skyBot: '#4c8062', skyHalo: 'rgba(245, 214, 168, 0.22)',
      fx: { ringRGB: '245, 196, 128', foamRGB: '255, 240, 206', dustRGB: '238, 212, 146', waterTint: 'rgba(130, 196, 122, 0.18)', accent: '#e8b954' },
      pal: { rimA: '#4a4734', rimB: '#6e694d', deep: '#2f5c35', mid: '#488244', hi: '#6ca856', foam: '#f5b5c8', speck: '#fae078' }
    },
    {
      id: 'canopy', code: 'T11', name: '巨木树冠', short: '巨木树冠', group: '林地树冠', isWater: false, waterLevel: -99,
      desc: '粗壮横枝与层叠叶冠平台，林梢立体空间感',
      skyTop: '#0d1f18', skyMid: '#1a3b2c', skyBot: '#2f6142', skyHalo: 'rgba(148, 224, 138, 0.22)',
      fx: { ringRGB: '140, 216, 126', foamRGB: '218, 247, 194', dustRGB: '152, 130, 96', waterTint: 'rgba(54, 118, 72, 0.20)', accent: '#58c96b' },
      pal: { rimA: '#3d281b', rimB: '#61412b', deep: '#1e4526', mid: '#2f6b36', hi: '#529c4a', foam: '#8ed169', speck: '#7a5234' }
    },
    {
      id: 'bamboo', code: 'T12', name: '翠绿竹林', short: '翠绿竹林', group: '林地树冠', isWater: false, waterLevel: -99,
      desc: '竹节林地与散落细竹叶，清净雅致',
      skyTop: '#0e241c', skyMid: '#1d4534', skyBot: '#397353', skyHalo: 'rgba(164, 235, 174, 0.22)',
      fx: { ringRGB: '154, 226, 152', foamRGB: '226, 250, 212', dustRGB: '164, 186, 134', waterTint: 'rgba(72, 148, 96, 0.18)', accent: '#6dd480' },
      pal: { rimA: '#2a422c', rimB: '#436942', deep: '#2b5933', mid: '#47874b', hi: '#78b867', foam: '#b8e38a', speck: '#94865b' }
    },

    // --- 沙漠（2）---
    {
      id: 'desert', code: 'T13', name: '戈壁沙丘', short: '戈壁沙丘', group: '沙漠', isWater: false, waterLevel: -99,
      desc: '流动风纹沙丘、细沙扬尘与干裂沙痕',
      skyTop: '#2b1c12', skyMid: '#5c3b20', skyBot: '#9c6c3b', skyHalo: 'rgba(255, 206, 128, 0.24)',
      fx: { ringRGB: '242, 196, 122', foamRGB: '255, 236, 196', dustRGB: '224, 182, 124', waterTint: 'rgba(196, 146, 84, 0.20)', accent: '#e8a84a' },
      pal: { rimA: '#6b4728', rimB: '#8f6339', deep: '#a3713c', mid: '#c99352', hi: '#e3b370', foam: '#f5d69f', speck: '#875a31' }
    },
    {
      id: 'oasis', code: 'T14', name: '沙漠绿洲水边', short: '沙漠绿洲', group: '沙漠', isWater: true, waterLevel: 1.8,
      desc: '暖沙环抱一汪浅碧绿洲水潭与棕榈草缘，水陆交界',
      skyTop: '#241b13', skyMid: '#4c3822', skyBot: '#7d633b', skyHalo: 'rgba(130, 224, 212, 0.22)',
      fx: { ringRGB: '88, 218, 212', foamRGB: '236, 252, 245', dustRGB: '222, 188, 134', waterTint: 'rgba(26, 146, 152, 0.26)', accent: '#42cfc2' },
      pal: { rimA: '#7a5430', rimB: '#a87948', deep: '#146978', mid: '#259ca6', hi: '#d6a460', foam: '#c8f5eb', speck: '#4b8c4a' }
    },

    // --- 地下与特殊（4）---
    {
      id: 'cave', code: 'T15', name: '地下暗河溶洞', short: '暗河溶洞', group: '地下特殊', isWater: true, waterLevel: 1.6,
      desc: '深色岩台、石笋与地下暗河交汇，潮湿回响波纹',
      skyTop: '#12131c', skyMid: '#1f2233', skyBot: '#31364d', skyHalo: 'rgba(138, 152, 224, 0.18)',
      fx: { ringRGB: '148, 166, 224', foamRGB: '216, 224, 245', dustRGB: '146, 148, 168', waterTint: 'rgba(42, 58, 96, 0.28)', accent: '#8e9ce6' },
      pal: { rimA: '#232633', rimB: '#383d52', deep: '#172947', mid: '#3a4054', hi: '#5c647d', foam: '#7098c9', speck: '#1d202b' }
    },
    {
      id: 'ruins', code: 'T16', name: '苔藓古石遗迹', short: '苔藓古石', group: '地下特殊', isWater: false, waterLevel: -99,
      desc: '青苔石板缝隙、落叶碎石与浅水洼',
      skyTop: '#131b1c', skyMid: '#223133', skyBot: '#394f4c', skyHalo: 'rgba(156, 204, 178, 0.18)',
      fx: { ringRGB: '162, 196, 174', foamRGB: '218, 232, 222', dustRGB: '158, 166, 156', waterTint: 'rgba(84, 108, 96, 0.22)', accent: '#7eb598' },
      pal: { rimA: '#303838', rimB: '#4b5754', deep: '#404a48', mid: '#5d6966', hi: '#818f8a', foam: '#5a8756', speck: '#38403e' }
    },
    {
      id: 'swamp', code: 'T17', name: '沼泽泥潭', short: '沼泽泥潭', group: '地下特殊', isWater: true, waterLevel: 2.2,
      desc: '浑浊泥水、冒泡沼气与泥渍溅花',
      skyTop: '#111c16', skyMid: '#1e3326', skyBot: '#314d36', skyHalo: 'rgba(146, 206, 126, 0.18)',
      fx: { ringRGB: '142, 202, 118', foamRGB: '204, 236, 178', dustRGB: '132, 152, 104', waterTint: 'rgba(46, 84, 52, 0.34)', accent: '#86bf5e' },
      pal: { rimA: '#2e3324', rimB: '#444c33', deep: '#243826', mid: '#365435', hi: '#547846', foam: '#92b86e', speck: '#453e2b' }
    },
    {
      id: 'volcano', code: 'T18', name: '熔岩火山口', short: '熔岩火山', group: '地下特殊', isWater: false, waterLevel: -99,
      desc: '黑曜岩台、炽热熔岩裂隙与上升火屑氛围',
      skyTop: '#1c0c0c', skyMid: '#3d1714', skyBot: '#6b281c', skyHalo: 'rgba(255, 134, 64, 0.24)',
      fx: { ringRGB: '255, 136, 66', foamRGB: '255, 212, 138', dustRGB: '166, 118, 102', waterTint: 'rgba(220, 84, 34, 0.24)', accent: '#f0743a' },
      pal: { rimA: '#261b1c', rimB: '#3d2a2a', deep: '#2e2224', mid: '#473638', hi: '#664e4d', foam: '#ff8a3d', speck: '#d94826' }
    },

    // --- 新增生态生境（T19~T21）---
    {
      id: 'carcass', code: 'T19', name: '巨兽遗骸', short: '巨兽遗骸', group: '林地树冠', isWater: false, waterLevel: -99, isNew: true,
      desc: '黑褐腐土、跨台白骨肋拱与淡青菌斑',
      skyTop: '#151210', skyMid: '#2a231c', skyBot: '#463a2c', skyHalo: 'rgba(214, 196, 160, 0.18)',
      fx: { ringRGB: '214, 200, 168', foamRGB: '236, 228, 210', dustRGB: '120, 100, 78', waterTint: 'rgba(70, 58, 40, 0.24)', accent: '#cdb98a' },
      pal: { rimA: '#2b231b', rimB: '#46382a', deep: '#2a2018', mid: '#3d2f22', hi: '#5a4630', foam: '#e6dcc4', speck: '#7fb3a2' }
    },
    {
      id: 'saltlake', code: 'T20', name: '盐壳湖', short: '盐壳湖', group: '沙漠', isWater: true, waterLevel: 1.0, isNew: true,
      desc: '白色六边形盐壳、翘边缝隙与粉红浓盐水洼',
      skyTop: '#2a2128', skyMid: '#55444d', skyBot: '#9a8088', skyHalo: 'rgba(255, 214, 226, 0.22)',
      fx: { ringRGB: '240, 200, 210', foamRGB: '255, 248, 250', dustRGB: '232, 224, 214', waterTint: 'rgba(199, 111, 134, 0.22)', accent: '#e48aa0' },
      pal: { rimA: '#8f8577', rimB: '#b3aa9b', deep: '#c76f86', mid: '#e9e4dc', hi: '#fbf8f2', foam: '#cfc6b8', speck: '#e09aa8' }
    },
    {
      id: 'hotspring', code: 'T21', name: '热泉梯田', short: '热泉梯田', group: '地下特殊', isWater: true, waterLevel: 1.6, isNew: true,
      desc: '石灰矿壳台阶与橙黄绿三色热水菌毯',
      skyTop: '#1d1a17', skyMid: '#3a332c', skyBot: '#6b5e4e', skyHalo: 'rgba(255, 196, 140, 0.20)',
      fx: { ringRGB: '150, 220, 220', foamRGB: '240, 250, 248', dustRGB: '210, 200, 186', waterTint: 'rgba(47, 143, 154, 0.26)', accent: '#e88a3c' },
      pal: { rimA: '#6e675c', rimB: '#8f877a', deep: '#2f8f9a', mid: '#b9b2a2', hi: '#dcd6c8', foam: '#e0742c', speck: '#c9b23a', green: '#6aa84f' }
    }
  ];

  const HABITAT_MAP = Object.create(null);
  for (const h of HABITAT_DEFS) HABITAT_MAP[h.id] = h;

  const platformCache = Object.create(null);

  function buildHabitatPlatform(habitatId, makeCanvas, size = 200) {
    const def = HABITAT_MAP[habitatId] || HABITAT_DEFS[0];
    if (platformCache[def.id]) return platformCache[def.id];

    const base = makeCanvas(size, size);
    const bg = base.getContext('2d');
    const bim = bg.createImageData(size, size);
    const half = size * 0.5;
    const rOuter = size * 0.485;
    const rRim = size * 0.435;
    const rInner = size * 0.405;

    const rgba = {};
    for (const k in def.pal) rgba[k] = hexToRgba(def.pal[k]);

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - half, dy = y - half;
        const dist = Math.hypot(dx, dy);
        if (dist > rOuter) continue;

        const ang = Math.atan2(dy, dx);
        const wave = Math.sin(ang * 8) * 1.3 + Math.cos(ang * 5) * 0.9;
        const n1 = periodicNoise2(x, y, 64, 64, 16, 19);
        const n2 = periodicNoise2(x + 13, y + 7, 32, 32, 8, 47);
        const v = n1 * 0.62 + n2 * 0.38;

        let key = 'mid';
        if (def.id === 'tavern') {
          if (dist > rRim) {
            const seg = ((ang + Math.PI) / (Math.PI * 2)) * 32;
            const seam = Math.abs(seg - Math.round(seg)) < 0.08;
            if (dist > rOuter - 2.0) key = 'deep';
            else if (seam) key = 'deep';
            else key = ((Math.floor(seg) & 1) ? (v > 0.56 ? 'stoneHi' : 'rimB') : 'rimA');
          } else if (dist > rInner) {
            const seg = ((ang + Math.PI) / (Math.PI * 2)) * 28;
            const seam = Math.abs(seg - Math.round(seg)) < 0.08;
            const isHearthArc = Math.abs(ang + Math.PI * 0.5) < 0.46 && dist < rInner + 3.2;
            if (isHearthArc && ((Math.floor(seg * 2) & 1) === 0)) key = 'hearth';
            else if (seam || dist < rInner + 1.2) key = 'deep';
            else key = ((Math.floor(seg) & 1) ? 'rimB' : (v > 0.58 ? 'stoneHi' : 'rimA'));
          } else if (dist <= 44.0) {
            // 中央金边绛红圆形编织地毯
            const weave = ((x + y) & 1) ^ (((x >> 1) + (y >> 1)) & 1);
            const petal = Math.sin(ang * 16);
            if (dist > 41.6) {
              key = (petal > 0.15) ? 'speck' : 'rugDark';
            } else if (dist > 37.8) {
              const motif = Math.abs(Math.sin(ang * 12));
              key = (dist > 39.2 && dist < 40.4 && motif > 0.45) ? 'rugDark' : 'speck';
            } else if (dist > 17.5 && dist < 20.5) {
              key = (Math.sin(ang * 8) > -0.25) ? 'speck' : 'rugHi';
            } else if (dist < 7.5) {
              const centerDiamond = Math.abs(dx) + Math.abs(dy);
              key = centerDiamond < 5.2 ? 'speck' : 'rugHi';
            } else {
              if (v > 0.68 && weave) key = 'rugHi';
              else if (v < 0.34 || !weave) key = 'rugDark';
              else key = 'foam';
            }
          } else {
            // 深暖胡桃木拼接长条木板（板缝清晰、带微木纹）
            const plankH = 11;
            const rowIdx = Math.floor(y / plankH);
            const inRowY = y - rowIdx * plankH;
            const jointX = (x + rowIdx * 37) % 36;
            const grain = Math.sin(x * 0.16 + rowIdx * 1.9 + n1 * 3.2);
            if (inRowY === 0 || jointX === 0) {
              key = 'deep';
            } else if (inRowY === 1) {
              key = grain > 0.15 ? 'hi' : 'mid';
            } else if (inRowY === plankH - 1) {
              key = 'deep';
            } else {
              const rowTone = (rowIdx * 13) % 3;
              if (grain > 0.48 || (rowTone === 0 && v > 0.56)) key = 'hi';
              else if (grain < -0.58 && rowTone === 2) key = 'deep';
              else key = 'mid';
            }
          }
        } else if (dist > rRim + wave * 0.45) {
          key = (dist > rOuter - 2.2 || v > 0.66) ? 'foam' : (v < 0.38 ? 'deep' : 'mid');
        } else if (dist > rInner + wave * 0.4) {
          const seg = ((ang + Math.PI) / (Math.PI * 2)) * 26;
          const seam = Math.abs(seg - Math.round(seg)) < 0.09;
          key = seam ? 'rimA' : ((Math.floor(seg) & 1) ? 'rimB' : 'rimA');
        } else {
          if (def.id === 'desert') {
            const dune = Math.sin((x * 0.12 + y * 0.08) + n1 * 2.2);
            key = dune > 0.45 ? 'hi' : (dune < -0.4 ? 'deep' : 'mid');
            if (v > 0.74) key = 'foam';
          } else if (def.id === 'oasis') {
            // 沙地环抱中央浅碧绿洲水潭 + 岸边棕榈草缘
            const poolR = 46 + Math.sin(ang * 3 + n1 * 2.4) * 7.5;
            if (dist < poolR - 5) key = (v > 0.52) ? 'mid' : 'deep';
            else if (dist < poolR) key = 'foam';
            else if (dist < poolR + 9 && n2 > 0.42) key = 'speck';
            else key = (v > 0.58) ? 'hi' : 'rimB';
          } else if (def.id === 'sky') {
            const puff = Math.sin(x * 0.09) * Math.cos(y * 0.09) + v;
            key = puff > 0.85 ? 'foam' : (puff > 0.45 ? 'hi' : (puff > 0.15 ? 'mid' : 'deep'));
          } else if (def.id === 'thunderPeak') {
            const bolt = Math.abs(Math.sin(x * 0.08 + y * 0.06 + n1 * 4.2));
            if (bolt < 0.06 && dist < rInner - 10 && n2 > 0.58) key = bolt < 0.025 ? 'speck' : 'foam';
            else key = v > 0.66 ? 'hi' : (v < 0.36 ? 'deep' : 'mid');
          } else if (def.id === 'iceSea') {
            // 洁白冰面裂开深蓝冰缝
            const fissure = Math.abs(Math.sin(x * 0.065 - y * 0.045 + n1 * 3.2));
            if (fissure < 0.14 && dist < rInner - 4) key = fissure < 0.07 ? 'deep' : 'mid';
            else key = v > 0.56 ? 'foam' : (v > 0.34 ? 'speck' : 'hi');
          } else if (def.id === 'openSea') {
            const swell = Math.sin(y * 0.14 + Math.sin(x * 0.05) * 2.0 + n1 * 1.4);
            if (swell > 0.86) key = 'foam';
            else if (swell > 0.30) key = 'hi';
            else if (swell < -0.35) key = 'deep';
            else key = 'mid';
          } else if (def.id === 'stoneBay') {
            // 浅滩鹅卵石 + 岸边岩缝 + 漫过浅水
            const riverBand = Math.sin(x * 0.045) * 16 + dy;
            if (Math.abs(riverBand) < 26 + n1 * 12) key = (v > 0.62) ? 'foam' : (v > 0.35 ? 'mid' : 'deep');
            else key = (n2 > 0.68) ? 'speck' : (v > 0.46 ? 'hi' : 'rimB');
          } else if (def.id === 'canopy') {
            // 粗壮树干横枝 + 层叠叶冠
            const branch = Math.abs(Math.sin((dx * 0.032 - dy * 0.028) + n1 * 1.8));
            if (branch < 0.18 && dist < rInner - 6) key = v > 0.5 ? 'speck' : 'rimB';
            else key = v > 0.72 ? 'foam' : (v > 0.50 ? 'hi' : (v < 0.30 ? 'deep' : 'mid'));
          } else if (def.id === 'bamboo') {
            // 竹林地台 + 横向竹节纹 + 散落竹叶
            const stalk = ((Math.round(x + n1 * 3) % 14) === 0);
            const node = ((y % 18) === 0 && (x % 14) < 3);
            if (node) key = 'foam';
            else if (stalk) key = 'deep';
            else if (n2 > 0.80 && ((x + y) & 3) === 0) key = 'speck';
            else key = v > 0.64 ? 'hi' : (v < 0.34 ? 'deep' : 'mid');
          } else if (def.id === 'cave') {
            // 地下暗河贯穿深色溶洞岩台
            const stream = Math.abs(dx + Math.sin(dy * 0.06) * 18);
            if (stream < 18 + n1 * 8) key = (stream > 14 && v > 0.52) ? 'foam' : 'deep';
            else key = v > 0.66 ? 'hi' : (v < 0.32 ? 'speck' : 'mid');
          } else if (def.id === 'volcano') {
            const crack = Math.abs(Math.sin(x * 0.07 + n1 * 3.8) + Math.cos(y * 0.07 - n2 * 2.5));
            if (crack < 0.14 && dist < rInner - 6) key = crack < 0.06 ? 'foam' : 'speck';
            else key = v > 0.64 ? 'hi' : (v < 0.34 ? 'deep' : 'mid');
          } else if (def.id === 'forest') {
            if (n2 > 0.86 && ((x * 5 + y * 3) & 7) === 0) key = 'foam';
            else if (v > 0.66) key = 'hi';
            else if (v < 0.32) key = 'deep';
            else if (n2 > 0.78) key = 'speck';
            else key = 'mid';
          } else if (def.id === 'meadow') {
            if (n2 > 0.84 && ((x + y) & 3) === 0) key = ((x * 7 + y) & 1) ? 'foam' : 'speck';
            else key = v > 0.65 ? 'hi' : (v < 0.34 ? 'deep' : 'mid');
          } else if (def.id === 'ruins') {
            const tile = (x % 16 === 0 || y % 16 === 0);
            if (tile) key = 'speck';
            else if (v > 0.70) key = 'foam';
            else key = v > 0.55 ? 'hi' : (v < 0.35 ? 'deep' : 'mid');
          } else if (def.id === 'tideflat') {
            if (v > 0.56) key = v > 0.72 ? 'speck' : 'hi';
            else if (v > 0.48) key = 'foam';
            else key = v > 0.32 ? 'mid' : 'deep';
          } else if (def.id === 'carcass') {
            // 黑褐腐土打底 + 5 道白色肋骨拱（带暗边）+ 淡青菌斑
            key = v > 0.66 ? 'hi' : (v < 0.36 ? 'deep' : 'mid');
            for (let k = 0; k < 5; k++) {
              const ribX = 42 + k * 29 + Math.sin(y * 0.036 + k * 0.9) * 9;
              const dRib = Math.abs(x - ribX);
              if (Math.abs(dy) < 70 && dRib < 2.7) { key = 'foam'; break; }
              if (Math.abs(dy) < 70 && dRib < 4.0) { key = 'rimA'; break; }
            }
            if (key !== 'foam' && key !== 'rimA' && n2 > 0.79 && ((x * 3 + y * 5) & 3) === 0) key = 'speck';
          } else if (def.id === 'saltlake') {
            // 白色六边形盐壳 + 浅灰翘边 + 粉红浓盐水裂隙与浅洼
            const S = 15, HY = S * 0.866;
            const j0 = Math.round(y / HY);
            let d1 = 1e9, d2 = 1e9, best = 0;
            for (let j = j0 - 1; j <= j0 + 1; j++) {
              const off = (j & 1) ? S * 0.5 : 0;
              const i0 = Math.round((x - off) / S);
              for (let i = i0 - 1; i <= i0 + 1; i++) {
                const dd = Math.hypot(x - (i * S + off), y - j * HY);
                if (dd < d1) { d2 = d1; d1 = dd; best = i * 31 + j * 17; }
                else if (dd < d2) d2 = dd;
              }
            }
            const pool = (((best * 2654435761) >>> 0) % 9) === 0;
            if (d2 - d1 < 1.35) key = (n2 > 0.54) ? 'speck' : 'foam';
            else if (pool) key = d1 < S * 0.38 ? 'deep' : 'speck';
            else key = (v > 0.62 || (n2 > 0.86 && ((x + y) & 3) === 0)) ? 'hi' : 'mid';
          } else if (def.id === 'hotspring') {
            // 石灰梯田台阶 + 白矿堰边 + 橙红 / 黄 / 绿三色热水菌毯
            const yy = y + Math.sin(x * 0.06 + n1 * 3.0) * 6.0;
            const band = Math.floor(yy / 26);
            const rel = ((yy % 26) + 26) % 26;
            const mats = ['foam', 'foam', 'speck', 'green', 'green', 'green', 'green', 'green'];
            if (rel < 2.8) key = 'hi';
            else if (rel < 4.4) key = 'rimB';
            else if (v > 0.64) key = 'deep';
            else key = mats[Math.max(0, Math.min(mats.length - 1, band))];
          } else if (def.isWater) {
            const caustic = Math.sin((x + y * 0.55) * 0.13) * Math.cos((y - x * 0.48) * 0.13);
            if (dist > rInner - 2.4 && v > 0.5) key = 'foam';
            else if (def.id === 'reef' && dist > rInner - 10 && n2 > 0.76) key = 'speck';
            else if (dist < 48 && (v > 0.38 || caustic > 0.48)) key = 'mid';
            else key = (v > 0.54 || caustic > 0.58) ? 'mid' : 'deep';
          } else {
            if (v > 0.68) key = 'hi';
            else if (v < 0.32) key = 'deep';
            else if (n2 > 0.78) key = 'speck';
            else key = 'mid';
            if (dist > rInner - 3.5 && v > 0.56) key = 'rimB';
          }
        }

        const c = rgba[key];
        const i = (y * size + x) * 4;
        bim.data[i] = c[0]; bim.data[i + 1] = c[1]; bim.data[i + 2] = c[2]; bim.data[i + 3] = 255;
      }
    }

    bg.putImageData(bim, 0, 0);
    const res = { id: def.id, def, size, base, rInner, rRim, rOuter };
    platformCache[def.id] = res;
    return res;
  }

  PW.Habitats = { HABITAT_DEFS, HABITAT_MAP, buildHabitatPlatform };
})(window.PixelWorkshop);
