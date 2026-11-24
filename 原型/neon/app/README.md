# app

## 管什么

整个游戏**唯一的组装处**（设计稿 10.0、10.1、10.2）。各模块互相不认识，全靠这里把一块交出来的包递给下一块。

| 文件 | 干什么 |
|---|---|
| `index.html` | 浏览器入口页。以后套 Electron 的壳也只打开这一个 |
| `main.js` | 建画布（至少按 1920×1080 画，设计稿 10.6）、存档、注册场景、转发鼠标和键盘；URL 参数直达（`?fresh=1` 新档、`?run=1` 直接进林子、`?encounter=` 直接打一仗、`?scene=trial` 试打台） |
| `loop.js` | 主循环 |
| `scene-manager.js` | 场景注册和切换 |
| `session.js` | 跨场景的东西：这一趟、存档、出发包、结算以后的小结、试打台改的开关、试玩记录（`playLog`，战斗场景每回合记想了几秒、打了几张，`formatPlayLog` 写成文字；试打台「复制试玩记录」、控制台 `__CODE00_APP__.getPlayLog()` 都能拿）。场景每次切换都会重建，所以这些不放在场景里 |
| `scenes/hub-scene.js` | 大厅：`hub` 摆入口，点了哪个就把工会 / 招募 / 出发 / 卡册的板画在右边；各模块交回的新存档交给 `save` 写；出发时拼出发包 |
| `scenes/run-scene.js` | 走一趟：`run-rules` + `explore-view`；碰到鬼火换到战斗场景，打完回来；走完结算进存档 |
| `scenes/battle-scene.js` | 打一仗：`battle-rules` + `battle-view`；走一趟里的仗打完把战斗结果交回走一趟 |
| `scenes/trial-scene.js` | 试打台（从大厅的「设置」进）：只打一仗、测手感；开关（设计稿 10.4）改了出发也照着用 |

## 一局里包怎么递（设计稿 10.0）

大厅 `hub-scene` → 出发包 → `run-scene`（`run-rules`）→ 开战包 → `battle-scene`（`battle-rules`）→ 战斗结果 → `run-scene` → 回来包 → `settleRun` → 存档 → 大厅。

## 依赖边界

- 只导入各模块的对外入口 `../modules/<模块>/index.js`。`tools/boundary.test.js` 自动查。

## 单独运行与测试

- 浏览器：`npm start` 或双击 `启动.command`，开 `/app/`。
- 单测：`node --test app/test/app.test.js`。
