# 外包分包 UI-02B：印记、雕琢与战利品图标（轻量包）

> **拆分说明**：本包是从原 `UI-02` 拆出的**后半轻包**，专攻 **20 枚高频小图标 / 徽章**（10 枚印记 + 6 枚战利品 + 4 枚雕琢），不含卡牌牌面。与 `UI-02A`（卡牌牌面）完全解耦，可并行外派，两者通过 `Object.assign` 无缝合并到同一个 `window.Code00ArtPacks.cards` 契约对象上，加载顺序不限。

## 本包只交付什么
解压后放入本目录 `bundle/`，共 3 个文件：
1. `bundle/pack_icons.js`（核心绘制脚本，合并挂载到 `window.Code00ArtPacks.cards`）
2. `bundle/manifest.json`（包元信息：id、version、iconsCount、author 等）
3. `bundle/交付说明.md`（20 枚图标配色与造型要点说明）

## 怎么发给网页端 AI
1. 双击 **`打包发给网页AI.command`**，生成本目录下的 `all_in_one.txt`；
2. 把 `all_in_one.txt` 拖进网页端 AI，发送口令：
   > 严格按附件末尾的 `开工提示词.md` 开发。务必用单个脚本一次性生成 3 个文件、自检并打包出可下载的 `bundle_ui02b_icons.zip`；正文严禁贴任何代码、JSON 或文档内容，若未打包完成直接停下汇报进度。

## 收包后怎么验收
1. 将收回的 `bundle_ui02b_icons.zip` 解压到 `交回/` 并把里面的 `bundle/` 覆盖到本目录 `bundle/`；
2. 双击 **`预览验收.command`** —— 自动先跑 `node verify.mjs`（校验合并挂载安全性、全部 20 枚图标、零 `ctx.filter`、零 `shadowBlur`、零禁用字、离屏 ≤ 1 MB、初始化 ≤ 30 ms），再自动打开浏览器 `preview.html` 实机目检。
