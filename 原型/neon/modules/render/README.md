# modules/render

## 管什么

统一的绘制接口层（设计稿 10.1）。原型阶段接入 `blocks/`（简单色块），阶段 5 切换到 `stack/`（像素堆叠）时，只需在 `modules/render/index.js` 切换后端实现，所有画面模块不改代码。

## 对外接口

唯一对外入口：`modules/render/index.js`

- `RENDER_BACKEND`：当前生效的渲染后端名称（当前为 `'blocks'`）
- `DEFAULT_FONT_FAMILY`：默认中文无衬线字体栈
- `createRenderer(target, options)`：创建当前默认渲染器
- `createBlockRenderer(target, options)`：显式创建色块渲染器

渲染器实例统一提供：`getSize`、`getSurfaceScale`（画布实际按几倍画；画面按 1920×1080 设计，代码坐标是 960×540 的布局单位，至少按 2 倍画）、`resize`、`clear`、`rect`、`circle`、`line`、`polygon`、`text`、`measureText`、`clipRect`、`withAlpha`、`group`、`transform`（平移 + 旋转 + 缩放）、`spriteSlot`。

## 读写哪些数据

- 只操作调用方传入的 Canvas 或 2D 上下文，不直接碰 `document` / `window`，不读写存档。

## 单独运行与测试

- 单测（不开浏览器）：`node --test modules/render/test/render.test.js`
- 演示页：启动本地小服务后打开 `/modules/render/demo.html`（或子目录 `/modules/render/blocks/demo.html`）
