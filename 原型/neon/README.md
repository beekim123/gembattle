# code00 原型（neon 做的那份）

目前完成：**阶段 1 前半段（完整战斗可试玩）**。可以直接选仗、调开关、排链打仗、跑假玩家模拟器。

- 技术：浏览器原生 ES 模块 + HTML + 原生 JS + Canvas 2D，全用简单色块，界面中文，不取名。
- 依赖：**零 npm 依赖**（只需要系统已安装的 Node.js；自动截图脚本复用本机已安装的 Chrome / Chromium）。
- 未来搬到 Electron 时只加壳目录打开 `app/index.html`，现有模块不改。

## 怎么玩 / 怎么打开

三种开法效果一致，服务只监听本机 `127.0.0.1`：

1. **Mac 双击 `启动.command`**：弹出终端并自动在浏览器打开试打大厅（`http://localhost:8000/app/`），关掉终端窗口即停止。
2. 终端在当前目录运行：
   ```bash
   npm start
   ```
3. 或直接用 node：
   ```bash
   node tools/serve.js --open
   ```

8000 端口被占时自动顺延寻找空闲端口；指定端口可用 `node tools/serve.js --port 9000`。

**进入后怎么玩**：
- 左栏挑一种仗（5 种阶段 1 核心仗 + 2 种拓展仗），切换功能牌套装；
- 右栏可随时切换 8 项手感与规则开关（补到 N 张 / 每回合摸 1 张、留 1 张不占名额、N 值、盾倍数、破盾推格、倒计时 4/3、自动帮排、显示精确总伤害）；
- 点 **「开始试打」** 进入战斗（也可点 **「万发飘字压测」** 直接体验上万发大链）；
- 实战中点击手牌排进链或马上使用，点链上牌撤回，点怪卡片切换目标；快捷键：空格打出、`Z` 撤回、`Esc` 返回。

各模块独立演示页也可直接从本地服务打开：
- `/modules/battle-view/demo.html`（假数据战斗画面演示）
- `/modules/shared/demo.html`
- `/modules/render/demo.html`
- `/modules/render/blocks/demo.html`
- `/modules/ui/demo.html`

## 怎么跑单测、模拟器与截图

- **跑全部单测（不开浏览器，含解耦边界与禁字检查）**：
  ```bash
  npm test
  ```
- **跑假玩家模拟器（4 种假玩家 × 5 种核心仗 + 8 种功能牌陷阱对照 + 排法分量 + 万发压测）**：
  ```bash
  npm run sim
  ```
- **自动截图（内置临时服务 + 本机无头 Chrome，检错并截全套图存入 `shots/`）**：
  ```bash
  npm run shot
  ```

## 目录说明

| 位置 | 是什么 |
|---|---|
| `启动.command` | Mac 双击启动脚本 |
| `package.json` | 仅声明 `"type": "module"` 与 `start` / `test` / `sim` / `shot` 命令，零依赖 |
| `README.md` / `进度.md` / `偏离.md` | 使用说明、当前进度与设计差异记录 |
| `app/` | 唯一组装处：`index.html`、`main.js`、主循环、场景切换、试打选仗页 `try-setup.js`、实战组装 `battle-scene.js` |
| `modules/shared/` | 色环七色、时机与动作表、可指定种子随机数、战斗四样约定及校验函数 |
| `modules/content/` | 29 张固定宝石牌、8 种功能牌、5 种核心仗 + 2 种拓展仗与开战包构造 |
| `modules/battle-rules/` | 一仗的完整规则引擎、每个动作独立小函数、自动帮排算法（纯逻辑零 DOM） |
| `modules/battle-view/` | 战斗色块画面、鼠标交互与飘字演出（只读快照/预览/事件，自己不算规则） |
| `modules/render/` | 统一绘制接口入口（转发 `blocks/`，阶段 5 换 `stack/` 时只改此处） |
| `modules/ui/` | 公共界面小件（按钮、文字、纯数字、面板、提示框、无 DOM 交互层） |
| `tools/` | `serve.js` 本地小服务、`test.js` 一键单测、`boundary.test.js` 解耦守卫、`sim.js` 假玩家模拟器、`shot.js` 自动截图 |
| `shots/` | 自动截图工具生成的验收截图 |
