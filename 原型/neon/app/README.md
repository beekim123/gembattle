# app

## 管什么

整个游戏的唯一组装入口（设计稿 10.1、10.2）：

- `index.html`：浏览器入口页（将来阶段 5 套 Electron 壳时也只打开这一个文件）。
- `main.js`：初始化 `render`、注册 `home`（选仗与开关页）和 `battle`（实战场景）、启动主循环并转发指针和快捷键事件（空格打出、`Z` 撤回、`Esc` 返回）。
- `loop.js`：主循环（带 dt 限幅，支持无浏览器单步驱动）。
- `scene-manager.js`：场景注册与切换器。
- `scenes/lobby.js`：大厅（用户 2026-11-23 定的，跟旧样片一样干净）：整屏森林，左边文字按钮「开始游戏 / 卡册 / 设置 / 退出」。开始游戏 → 右边滑出挑仗板（7 种仗、牌组、加成和队友，点「出发」）；设置 → 「试玩调整」（设计稿 10.4 的手感开关、万发压测）；卡册 → 牌 / 加成 / 队友三栏。阶段 1 没有地图，以后「开始游戏」换成真的出发。
- `scenes/battle-scene.js`：唯一把 `content`、`battle-rules`、`battle-view` 拼在一起的战斗场景。

## 依赖边界

- 只导入各模块的唯一对外入口：`../modules/shared/index.js`、`../modules/render/index.js`、`../modules/ui/index.js`、`../modules/content/index.js`、`../modules/battle-rules/index.js`、`../modules/battle-view/index.js`。

## 单独运行与测试

- 浏览器打开：运行 `npm start` 或双击 `启动.command`，访问 `/app/`
- 单测（不开浏览器）：`node --test app/test/app.test.js`
