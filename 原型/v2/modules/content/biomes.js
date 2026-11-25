// 生态场景的色板与摆件（只是数据；怎么画在 render/scene-env.js）。
// 战斗用：forest swamp meadow ruins canopy；非战斗用：camp trade gate（第 6 套「营火 行商 界门」的三个变体）。
export const BIOMES = {
  forest: {
    id: 'forest', name: '落果浅林',
    groundTop: '#24472c', groundBottom: '#34663c', patch: '#2c5934', leaf: ['#5c9a48', '#7ab356', '#4a8a3c'],
    fruit: '#c8402e', vignette: 'rgba(8,20,10,0.55)', sunPatch: 'rgba(255,230,160,0.10)',
  },
  swamp: {
    id: 'swamp', name: '泽畔浅洼',
    groundTop: '#243826', groundBottom: '#365435', patch: '#2c4a30', leaf: ['#7fbf86', '#5fa070', '#a8d8a0'],
    water: '#2f5a58', fruit: '#c8402e', vignette: 'rgba(6,16,12,0.60)', sunPatch: 'rgba(190,230,200,0.08)',
  },
  meadow: {
    id: 'meadow', name: '花甸林隙',
    groundTop: '#488244', groundBottom: '#6ca856', patch: '#5a9a4e', leaf: ['#f2e8c4', '#f4c0d0', '#f6d878'],
    fruit: '#f6d878', vignette: 'rgba(14,30,12,0.40)', sunPatch: 'rgba(255,240,180,0.12)',
  },
  ruins: {
    id: 'ruins', name: '苔石古径',
    groundTop: '#404a48', groundBottom: '#5d6966', patch: '#4d5856', leaf: ['#7fb078', '#5a8756', '#a0c890'],
    moss: '#5a8756', water: '#6a7f76', fruit: '#c8402e', vignette: 'rgba(8,14,12,0.58)', sunPatch: 'rgba(220,240,210,0.07)',
  },
  canopy: {
    id: 'canopy', name: '巨木树冠',
    groundTop: '#3d281b', groundBottom: '#61412b', patch: '#4d3322', leaf: ['#7ab356', '#5c9a48', '#a8c860'],
    sea: '#1f4a2c', fruit: '#c8402e', vignette: 'rgba(10,8,4,0.62)', sunPatch: 'rgba(255,236,170,0.10)',
  },
  camp: {
    id: 'camp', family: 'bivouac', name: '林间营地',
    groundTop: '#1c3a26', groundBottom: '#2c5236', patch: '#25462e', leaf: ['#5c9a48', '#4a8a3c', '#7ab356'],
    fruit: '#c8402e', warm: 'rgba(255,150,60,0.22)', vignette: 'rgba(6,12,8,0.62)', sunPatch: 'rgba(255,170,80,0.10)',
  },
  trade: {
    id: 'trade', family: 'bivouac', name: '林间土路',
    groundTop: '#5a4a32', groundBottom: '#7a6644', patch: '#6a573a', leaf: ['#8aa860', '#6a8a48', '#b0a060'],
    fruit: '#c8402e', vignette: 'rgba(14,10,4,0.50)', sunPatch: 'rgba(255,230,160,0.10)',
  },
  gate: {
    id: 'gate', family: 'bivouac', name: '青石林道岔口',
    groundTop: '#3a4a46', groundBottom: '#566660', patch: '#465650', leaf: ['#6aa078', '#5a8756', '#8ac090'],
    moss: '#5a8756', fruit: '#c8402e', vignette: 'rgba(6,14,12,0.60)', sunPatch: 'rgba(200,240,210,0.08)',
  },
};
export const BIOME_IDS = Object.keys(BIOMES);
