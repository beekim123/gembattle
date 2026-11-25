// 工坊接入层的兼容出口：实现搬到了 world-stage.js（统一伪 3D 世界舞台），这里只把原来对外的名字原样再导出，
// 老的引用（render/index.js、单测）不用改。
export { pickK, sizeFromBox, workshopReady, hasAsset, createStage, getStage, groundPack, mountedPacks } from './world-stage.js';
