# modules/ui

## 管什么

公共界面小件（设计稿 10.1）：按钮、文字、纯数字、面板、提示框，以及无 DOM 依赖的交互状态层 `createUiLayer`。所有绘制均通过调用方传入的 `render/` 接口完成，数字严格按纯数字显示（不写「万」「亿」）。

## 对外接口

唯一对外入口：`modules/ui/index.js`

- 主题：`UI_THEME`
- 文字与数字：`formatNumber`、`wrapText`、`drawText`、`drawNumber`
- 面板：`drawPanel`
- 按钮：`createButton`、`hitTestRect`、`drawButton`
- 提示框：`layoutTooltip`、`drawTooltip`
- 交互层：`createUiLayer`

## 依赖边界

- 只导入 `../shared/index.js` 和 `../render/index.js`；不碰 `document` 或 `window`，不依赖任何玩法模块。

## 读写哪些数据

- 只维护界面交互瞬时态（悬停、按下、提示框坐标），不读写存档或业务规则状态。

## 单独运行与测试

- 单测（不开浏览器）：`node --test modules/ui/test/ui.test.js`
- 演示页：启动本地小服务后打开 `/modules/ui/demo.html`
