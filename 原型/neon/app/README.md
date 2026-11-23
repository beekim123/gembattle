# app

## 管什么

整个游戏的唯一组装入口（设计稿 10.1、10.2）：

- `index.html`：浏览器打开的入口页（将来阶段 5 套 Electron 壳时也只打开这一个文件）。
- `main.js`：初始化 `render`、注册场景、启动主循环、把浏览器指针坐标转成画布逻辑坐标。
- `loop.js`：主循环空壳（带 dt 限幅，支持无浏览器单步驱动）。
- `scene-manager.js`：场景注册与切换器（负责 `onEnter` / `onExit` / `onUpdate` / `onRender` / `onPointer` 生命周期）。
- `scenes/stage-placeholder.js`：阶段 0 的空游戏画面，仅提供「试打」占位按钮，不含玩法。

## 依赖边界

- 只导入各模块的唯一对外入口：`../modules/shared/index.js`、`../modules/render/index.js`、`../modules/ui/index.js`。

## 单独运行与测试

- 浏览器打开：运行 `npm start` 或双击 `启动.command`，访问 `/app/`
- 单测（不开浏览器）：`node --test app/test/app.test.js`
