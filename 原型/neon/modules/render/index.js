// modules/render/ 唯一对外入口。
// 画面模块（ui、未来 battle-view / explore-view 等）只导入这里。
// 阶段 5 换像素堆叠（stack/）时，只改这里切换默认实现，业务模块一行不动。

export {
  RENDER_BACKEND,
  DEFAULT_FONT_FAMILY,
  LOOKS,
  createBlockRenderer,
  createBlockRenderer as createRenderer,
} from './blocks/index.js';
