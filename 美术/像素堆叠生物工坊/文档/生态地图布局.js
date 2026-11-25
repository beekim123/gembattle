'use strict';
// =============================================================================
// 生态世界平面地图布局 & 可视化视觉配置
//   - 与 文档/生态设计数据.js 解耦：设计数据只管生态逻辑，本文件管地图地理摆位、区域形状、
//     地貌纹理、吃食图标与模板像素轮廓，改地图排版不用动生态主数据。
//   - 地理逻辑（1280 × 740 平面世界）：
//       顶层飘云：雷云峰顶（左）+ 高空云海（中右）→ 降水落入巨木树冠与河湖深潭；
//       西部干地：戈壁沙丘 → 沙漠绿洲水边 → 低洼盐壳湖；
//       中部林木：翠绿竹林 / 巨木树冠 / 花丛草甸 / 林地落果空坪 / 林缘巨兽遗骸；
//       东部水海：河湖深潭 → 石缝河湾 → 沼泽泥潭 → 潮汐滩涂 → 浅海环礁 → 远洋浮岛 → 极地冰缝；
//       底部剖面：清晰岩层断面以下——苔藓古石遗迹、地下暗河溶洞、热泉梯田 ← 熔岩火山口。
// =============================================================================
window.EcoMapLayout = {
  width: 1280,
  height: 740,

  // 五大地理底景区块（用于地图分区背景与剖面线）
  zones: [
    { id: 'sky',   label: '高空云带',     x: 168, y: 14,  w: 690, h: 126, kind: 'cloud' },
    { id: 'dry',   label: '西部干地',     x: 20,  y: 162, w: 236, h: 392, kind: 'dry' },
    { id: 'wood',  label: '林木腹地',     x: 274, y: 162, w: 406, h: 392, kind: 'wood' },
    { id: 'water', label: '河道与海域',   x: 698, y: 162, w: 562, h: 392, kind: 'water' },
    { id: 'under', label: '地下剖面与热源', x: 20,  y: 578, w: 1240, h: 148, kind: 'under' }
  ],

  // 21 个生境的平面位置、尺寸、多边形轮廓形态与地貌纹理类型
  // cx, cy 为视觉中心；w, h 为色块包围尺寸；shape 控制轮廓圆角/地形感；pat 控制像素风地貌纹
  regions: {
    // --- 天上（飘浮云块 + 尖峰）---
    thunderPeak: { cx: 332, cy: 82,  w: 196, h: 80, shape: 'peak',  pat: 'thunder' },
    sky:         { cx: 642, cy: 74,  w: 274, h: 86, shape: 'cloud', pat: 'cloud' },

    // --- 干地（左列自高向低盆地）---
    desert:      { cx: 138, cy: 232, w: 192, h: 98, shape: 'dune',  pat: 'dune' },
    oasis:       { cx: 138, cy: 360, w: 192, h: 96, shape: 'oval',  pat: 'oasis' },
    saltlake:    { cx: 138, cy: 486, w: 192, h: 96, shape: 'hex',   pat: 'salt' },

    // --- 林木（中区核心陆地）---
    bamboo:      { cx: 366, cy: 224, w: 156, h: 84, shape: 'land',  pat: 'bamboo' },
    canopy:      { cx: 560, cy: 224, w: 178, h: 88, shape: 'cloud', pat: 'canopy' },
    meadow:      { cx: 368, cy: 356, w: 160, h: 98, shape: 'land',  pat: 'meadow' },
    forest:      { cx: 562, cy: 352, w: 184, h: 108, shape: 'land', pat: 'forest' },
    carcass:     { cx: 540, cy: 490, w: 226, h: 88, shape: 'rib',   pat: 'carcass' },

    // --- 水边与海（左列淡水自上而下，右列近海至远洋极海）---
    river:       { cx: 794, cy: 236, w: 158, h: 86, shape: 'pool',  pat: 'water' },
    stoneBay:    { cx: 794, cy: 356, w: 158, h: 86, shape: 'pool',  pat: 'pebble' },
    swamp:       { cx: 794, cy: 482, w: 164, h: 90, shape: 'pool',  pat: 'swamp' },
    tideflat:    { cx: 996, cy: 486, w: 168, h: 86, shape: 'coast', pat: 'tide' },
    reef:        { cx: 1144, cy: 396, w: 174, h: 84, shape: 'oval', pat: 'reef' },
    openSea:     { cx: 1020, cy: 298, w: 174, h: 84, shape: 'pool', pat: 'sea' },
    iceSea:      { cx: 1146, cy: 214, w: 168, h: 78, shape: 'ice',  pat: 'ice' },

    // --- 地下与热（底部剖面，自左向右温度升高）---
    ruins:       { cx: 246, cy: 656, w: 226, h: 88, shape: 'brick', pat: 'ruins' },
    cave:        { cx: 546, cy: 656, w: 244, h: 88, shape: 'cave',  pat: 'cave' },
    hotspring:   { cx: 848, cy: 656, w: 234, h: 88, shape: 'step',  pat: 'terrace' },
    volcano:     { cx: 1126, cy: 656, w: 214, h: 88, shape: 'peak',  pat: 'volcano' }
  },

  // 连线弧度微调（覆盖自动弯度，让每条线都避开文字、顺眼不打架）
  flowBends: {
    'sky->canopy': -0.10,
    'thunderPeak->river': -0.18,
    'river->stoneBay': 0.0,
    'stoneBay->swamp': 0.0,
    'swamp->tideflat': 0.08,
    'tideflat->reef': 0.14,
    'reef->openSea': -0.14,
    'openSea->iceSea': -0.12,
    'river->sky': -0.22,
    'sky->carcass': -0.34,
    'carcass->forest': -0.16,
    'canopy->forest': 0.0,
    'forest->meadow': 0.0,
    'sky->thunderPeak': -0.16,
    'forest->cave': -0.18,
    'volcano->hotspring': 0.0,
    'hotspring->cave': 0.0,
    'desert->oasis': 0.0,
    'oasis->saltlake': 0.0,
    'cave->carcass': 0.12,
    'forest->ruins': 0.22
  },

  // 7 种连接视觉风格（不靠文字也能一眼分辨）
  flowStyles: {
    '水':   { color: '#2980d9', glow: '#9ad0ff', width: 4.0, kind: 'river', label: '水流' },
    '迁徙': { color: '#7b6b58', glow: '#e8dfd1', width: 2.6, kind: 'track', label: '迁徙' },
    '一生': { color: '#8e44ad', glow: '#e2b8f5', width: 3.2, kind: 'life',  label: '一生' },
    '尸体': { color: '#5c3c28', glow: '#d4b89c', width: 2.8, kind: 'fall',  label: '坠骸' },
    '养分': { color: '#9c6224', glow: '#f2d3a2', width: 3.0, kind: 'nutri', label: '养分' },
    '种子': { color: '#3b9b47', glow: '#b9efb8', width: 2.8, kind: 'seed',  label: '种子' },
    '热':   { color: '#e65a24', glow: '#ffc199', width: 3.6, kind: 'heat',  label: '热流' }
  },

  // 42 种底层吃食的简洁直观图标（纯字符/几何简标，无禁用字）
  foodIcons: {
    p_cloudfluff: '☁', p_mist: '💧', p_thundermoss: '⚡', p_windseed: '🌾',
    p_leaf: '🍃', p_canopycritter: '🐞', p_bambooleaf: '🎋', p_bamboobug: '🐛',
    p_fruit: '🍎', p_grass: '🌿', p_nectar: '🌼', p_carrion: '🦴',
    p_flies: '🦟', p_pondweed: '🌱', p_snail: '🐚', p_waterbug: '🪲',
    p_duckweed: '🍀', p_mudworm: '🪱', p_humus: '🍂', p_frog: '🐸',
    p_tidebits: '🫧', p_clam: '🦪', p_plankton: '◌', p_reeffish: '🐟',
    p_icealgae: '❄', p_icefish: '🐠', p_root: '🥔', p_moisture: '💧',
    p_metal: '⚙', p_drinker: '🐾', p_oasisgrass: '🌴', p_salt: '◇',
    p_brinebug: '🦐', p_ruinmoss: '🧱', p_mineralwater: '💎', p_ruincritter: '🦎',
    p_debris: '🪨', p_rockdebris: '⛰', p_cavefungus: '🍄', p_hotmat: '♨',
    p_heatmoss: '🌋', p_crackheat: '🔥'
  },

  // 生态位简洁图标（无禁用字）
  nicheIcons: {
    '吃草': '🌿',
    '追猎': '⚡',
    '伏击': '◉',
    '分解': '🍄',
    '寄生清洁': '❖',
    '传粉播种': '🌼',
    '改地形': '▲',
    '驮着共生': '◎'
  }
};
