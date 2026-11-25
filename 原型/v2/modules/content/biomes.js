// 生态场景的色板与摆件（只是数据；怎么画在 render/scene-env.js）。
export const BIOMES = {
  forest: {
    id: 'forest', name: '落果浅林',
    groundTop: '#24472c', groundBottom: '#34663c', patch: '#2c5934', leaf: ['#5c9a48', '#7ab356', '#4a8a3c'],
    fruit: '#c8402e', vignette: 'rgba(8,20,10,0.55)', sunPatch: 'rgba(255,230,160,0.10)',
  },
  meadow: {
    id: 'meadow', name: '花甸林隙',
    groundTop: '#488244', groundBottom: '#6ca856', patch: '#5a9a4e', leaf: ['#f2e8c4', '#f4c0d0', '#f6d878'],
    fruit: '#f6d878', vignette: 'rgba(14,30,12,0.40)', sunPatch: 'rgba(255,240,180,0.12)',
  },
};
