// 生态场景的色板与摆件（只是数据；怎么画在 render/scene-env.js 和 render/tilemap-ground.js）。
// 战斗用：forest swamp meadow ruins canopy；非战斗用：camp trade gate（第 6 套「营火 行商 界门」的三个变体）。
// props：当前生态摆几件工坊的像素堆叠摆件（方案 4.1 / 4.2）。每件 { id 工坊资产 id, x, y 落脚点（960×540 布局单位）, yaw 朝向（可选）, act 动作（可选）}。
// 摆件的摆法（第 5 步收官重排）：
//   1. 成簇，不对称：左边密、右边疏，错开朝向，一簇里搭配不同的摆件（树丛、倒木、花丛、石碑），不再是左右各 1 棵一模一样的树；
//   2. 只在左右两翼和远景，主动避开战斗里的界面：左上集色面板（x 6~122、y 38~214）、右上生态名签与印记（x 790~954、y 38~110）、
//      右下三个按钮（x 836~950、y 410~512）、中央战区（怪、主角、手牌、链槽）；
//   3. 全部静止（营火除外），脚下带柔和接地暗斑（render/world-stage.js）。
// 战斗里镜头默认转 16°（render/camera.js 的 BATTLE_TH0），布局坐标是 th = 0 时的位置，所以战斗生态的坐标用 atBattle(屏幕 x, 屏幕 y)
// 换算：想让摆件在默认镜头下落在屏幕哪一点，就写哪一点。BATTLE_TH0 和世界原点要和战斗场景保持一致（单测盯着）。
export const BATTLE_VIEW = { th0: 0.28, origin: [480, 258] };
const TILT_RATIO = 2.5 / 1.5;                       // 世界里每格：横向 2.5 个布局单位，纵向 1.5 个
function atBattle(sx, sy) {
  const { th0, origin } = BATTLE_VIEW, c = Math.cos(th0), s = Math.sin(th0), X = sx - origin[0], Y = sy - origin[1];
  return { x: Math.round(origin[0] + c * X + s * TILT_RATIO * Y), y: Math.round(origin[1] - (s / TILT_RATIO) * X + c * Y) };
}
const P = (id, sx, sy, yaw) => ({ id, ...atBattle(sx, sy), ...(yaw !== undefined ? { yaw } : {}) });

export const BIOMES = {
  forest: {
    id: 'forest', name: '落果浅林',
    props: [
      // 左翼：一丛两棵树、一根倒木、一小簇花；右翼：一棵树和一根倒木；远处右上再立一棵
      P('scene_forest_tree', 40, 334, 0.2), P('scene_forest_tree', 152, 278, -0.5), P('scene_t09_fallen_fruit_log', 92, 394, 0.3), P('scene_flora_cluster', 176, 340, 1.1),
      P('scene_forest_tree', 900, 318, 0.7), P('scene_t09_fallen_fruit_log', 826, 388, -0.4), P('scene_forest_tree', 776, 198, 0.1),
    ],
    groundTop: '#24472c', groundBottom: '#34663c', patch: '#2c5934', leaf: ['#5c9a48', '#7ab356', '#4a8a3c'],
    fruit: '#c8402e', vignette: 'rgba(8,20,10,0.55)', sunPatch: 'rgba(255,230,160,0.10)',
  },
  swamp: {
    id: 'swamp', name: '泽畔浅洼',
    props: [
      P('scene_t17_swamp_cypress', 38, 326, 0.3), P('scene_t17_swamp_cypress', 150, 278, -0.4), P('scene_flora_cluster', 168, 372, 0.8),
      P('scene_t17_swamp_cypress', 904, 306, 0.5), P('scene_t17_swamp_cypress', 780, 200, -0.2),
    ],
    groundTop: '#243826', groundBottom: '#365435', patch: '#2c4a30', leaf: ['#7fbf86', '#5fa070', '#a8d8a0'],
    water: '#2f5a58', fruit: '#c8402e', vignette: 'rgba(6,16,12,0.60)', sunPatch: 'rgba(190,230,200,0.08)',
  },
  meadow: {
    id: 'meadow', name: '花甸林隙',
    props: [
      P('scene_t10_giant_bud', 46, 322, 0.4), P('scene_flora_cluster', 122, 296, -0.6), P('scene_flora_cluster', 70, 398, 0.9), P('scene_flora_cluster', 190, 252, 0.2),
      P('scene_flora_cluster', 902, 332, 0.5), P('scene_t10_giant_bud', 806, 206, -0.3), P('scene_flora_cluster', 850, 392, 1.2),
    ],
    groundTop: '#488244', groundBottom: '#6ca856', patch: '#5a9a4e', leaf: ['#f2e8c4', '#f4c0d0', '#f6d878'],
    fruit: '#f6d878', vignette: 'rgba(14,30,12,0.40)', sunPatch: 'rgba(255,240,180,0.12)',
  },
  ruins: {
    id: 'ruins', name: '苔石古径',
    props: [
      P('building_ruin_arch', 192, 168, 0.1), P('scene_flora_cluster', 60, 360, 0.6), P('scene_t09_fallen_fruit_log', 122, 410, 0.2),
      P('scene_t16_moss_obelisk', 898, 330, 0.3), P('scene_flora_cluster', 824, 388, -0.7),
    ],
    groundTop: '#404a48', groundBottom: '#5d6966', patch: '#4d5856', leaf: ['#7fb078', '#5a8756', '#a0c890'],
    moss: '#5a8756', water: '#6a7f76', fruit: '#c8402e', vignette: 'rgba(8,14,12,0.58)', sunPatch: 'rgba(220,240,210,0.07)',
  },
  canopy: {
    id: 'canopy', name: '巨木树冠',
    props: [
      P('scene_t11_canopy_bough', 220, 108, 0.1), P('scene_t11_epiphyte_nest', 44, 332, 0.3), P('scene_t11_epiphyte_nest', 152, 286, -0.5), P('scene_flora_cluster', 170, 380, 0.9),
      P('scene_t11_epiphyte_nest', 902, 322, 0.6), P('scene_t11_canopy_bough', 790, 152, -0.2),
    ],
    groundTop: '#3d281b', groundBottom: '#61412b', patch: '#4d3322', leaf: ['#7ab356', '#5c9a48', '#a8c860'],
    sea: '#1f4a2c', fruit: '#c8402e', vignette: 'rgba(10,8,4,0.62)', sunPatch: 'rgba(255,236,170,0.10)',
  },
  camp: {
    id: 'camp', family: 'bivouac', name: '林间营地',
    props: [
      { id: 'scene_campfire', x: 480, y: 292 }, { id: 'scene_rock_hollow', x: 676, y: 262, yaw: 0.4 },
      { id: 'scene_forest_tree', x: 84, y: 296, yaw: 0.3 }, { id: 'scene_forest_tree', x: 168, y: 232, yaw: -0.4 }, { id: 'scene_t09_fallen_fruit_log', x: 800, y: 330, yaw: 0.5 },
    ],
    fire: { x: 480, y: 280 },
    groundTop: '#1c3a26', groundBottom: '#2c5236', patch: '#25462e', leaf: ['#5c9a48', '#4a8a3c', '#7ab356'],
    fruit: '#c8402e', warm: 'rgba(255,150,60,0.22)', vignette: 'rgba(6,12,8,0.62)', sunPatch: 'rgba(255,170,80,0.10)',
  },
  trade: {
    id: 'trade', family: 'bivouac', name: '林间土路',
    props: [
      { id: 'building_camp_tent', x: 160, y: 262 }, { id: 'scene_crates_sign', x: 808, y: 270 },
      { id: 'scene_forest_tree', x: 906, y: 196, yaw: 0.5 }, { id: 'scene_flora_cluster', x: 70, y: 340, yaw: 0.8 },
    ],
    groundTop: '#5a4a32', groundBottom: '#7a6644', patch: '#6a573a', leaf: ['#8aa860', '#6a8a48', '#b0a060'],
    fruit: '#c8402e', vignette: 'rgba(14,10,4,0.50)', sunPatch: 'rgba(255,230,160,0.10)',
  },
  gate: {
    id: 'gate', family: 'bivouac', name: '青石林道岔口',
    props: [
      { id: 'building_stone_gate', x: 480, y: 292 },
      { id: 'scene_forest_tree', x: 96, y: 290, yaw: 0.3 }, { id: 'scene_t16_moss_obelisk', x: 170, y: 340, yaw: 0.6 }, { id: 'scene_forest_tree', x: 874, y: 262, yaw: -0.5 }, { id: 'scene_flora_cluster', x: 800, y: 350, yaw: 1 },
    ],
    groundTop: '#3a4a46', groundBottom: '#566660', patch: '#465650', leaf: ['#6aa078', '#5a8756', '#8ac090'],
    moss: '#5a8756', fruit: '#c8402e', vignette: 'rgba(6,14,12,0.60)', sunPatch: 'rgba(200,240,210,0.08)',
  },
};
export const BIOME_IDS = Object.keys(BIOMES);
