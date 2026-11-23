# modules/render/blocks

## 管什么

`modules/render/` 当前使用的**色块渲染实现**（Canvas 2D）。提供清屏、方块（含圆角/描边）、圆、线段（含虚线）、多边形、文字、文字测量、裁剪、透明组、局部坐标平移，以及供后续换皮用的实体占位接口 `spriteSlot`。

## 对外接口

入口：`modules/render/blocks/index.js`（外部模块应统一通过上层 `modules/render/index.js` 调用，不要直接深入 `blocks/`）：

- `RENDER_BACKEND`（`'blocks'`）
- `DEFAULT_FONT_FAMILY`
- `createBlockRenderer(target, options)`

## 读写哪些数据

- 只向传入的 Canvas 2D 上下文输出绘制命令，不读写存档，不访问全局 `document` / `window`，不保存任何玩法状态。

## 单独运行与测试

- 单测（不开浏览器）：`node --test modules/render/blocks/test/blocks.test.js`
- 演示页：启动本地小服务后打开 `/modules/render/blocks/demo.html`
