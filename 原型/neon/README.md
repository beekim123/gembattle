# code00 原型（neon 做的那份）

目前完成：**阶段 0（搭架子）**。只搭好模块骨架、战斗数据约定与开发工具，不含玩法逻辑。

- 技术：浏览器原生 ES 模块 + HTML + 原生 JS + Canvas 2D，全用简单色块，界面中文，不取名。
- 依赖：**零 npm 依赖**（只需要系统已安装的 Node.js；自动截图脚本复用本机已安装的 Chrome / Chromium）。
- 未来搬到 Electron 时只加壳目录打开 `app/index.html`，现有模块不改。

## 怎么打开

三种开法效果一致，服务只监听本机 `127.0.0.1`：

1. **Mac 双击 `启动.command`**：弹出终端并自动在浏览器打开游戏空画面（`http://localhost:8000/app/`），关掉终端窗口即停止。
2. 终端在当前目录运行：
   ```bash
   npm start
   ```
3. 或直接用 node：
   ```bash
   node tools/serve.js --open
   ```

8000 端口被占时自动顺延寻找空闲端口；指定端口可用 `node tools/serve.js --port 9000`。

服务开启后，以下演示页均可直接访问：

- 游戏入口空画面：`http://localhost:8000/app/`
- shared 约定演示：`http://localhost:8000/modules/shared/demo.html`
- render 统一接口演示：`http://localhost:8000/modules/render/demo.html`
- render/blocks 色块后端演示：`http://localhost:8000/modules/render/blocks/demo.html`
- ui 公共界面小件演示：`http://localhost:8000/modules/ui/demo.html`

## 怎么跑单测（不开浏览器）

```bash
npm test
```

会自动运行所有模块和 `app/` 的单测，并额外执行解耦边界与硬约束守卫检查（`tools/boundary.test.js`）：
- 检查跨模块导入是否严格只走 `index.js`、有没有越界互引；
- 检查 `modules/` 下的 `.js` 代码是否零触碰 `document` / `window`；
- 检查阶段 0 没有提前创建阶段 1 以后的空目录；
- 检查全目录是否包含项目禁用的十个套路字或固定套路格式。

## 怎么自动截图

```bash
npm run shot
```

自动拉起临时端口的本地小服务与本机无头 Chrome，依次截取游戏页（含点击「试打」后状态）及全部模块演示页保存到 `shots/`，同时监听页面异常与 `console.error`（有任何报错即判失败）。

也可单独截取任意页面：

```bash
node tools/shot.js /modules/ui/demo.html --out shots/custom.png --width 1040 --height 640
```

## 目录说明

| 位置 | 是什么 |
|---|---|
| `启动.command` | Mac 双击启动脚本 |
| `package.json` | 仅声明 `"type": "module"` 与 `start` / `test` / `shot` 命令，零依赖 |
| `README.md` | 本文件：怎么跑、怎么测、目录说明 |
| `进度.md` | 这份原型的当前进度与每阶段记录 |
| `偏离.md` | 与设计稿第 3 版的差异和补充约定说明 |
| `app/` | 唯一组装处：`index.html`、`main.js`、主循环 `loop.js`、场景切换 `scene-manager.js`、阶段 0 空画面与单测 |
| `modules/shared/` | 色环七色、时机与动作表、可指定种子的随机数、战斗四样约定及校验函数、单测与演示页 |
| `modules/render/` | 统一绘制接口入口（转发 `blocks/`，阶段 5 换 `stack/` 时只改此处），带单测与演示页 |
| `modules/render/blocks/` | Canvas 2D 色块渲染后端实现，带单测与演示页 |
| `modules/ui/` | 公共界面小件（按钮、文字、纯数字、面板、提示框、无 DOM 交互层），带单测与演示页 |
| `tools/` | `serve.js` 本地小服务、`test.js` 一键单测、`boundary.test.js` 解耦与硬约束守卫、`shot.js` 自动截图工具 |
| `shots/` | 自动截图工具生成的阶段 0 验收截图 |
