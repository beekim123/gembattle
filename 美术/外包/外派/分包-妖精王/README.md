# 独立外包工具包：第三个大 Boss（妖精王 · `boss_fairy_king`）

> **本目录是一个 100% 自包含的外包开发包**：可直接用 `all_in_one.txt` 发给**无本地上下文的独立网页端 AI**。工坊像素堆叠渲染内核、林间妖精标杆源码、独立预览台与自动化格式校验脚本均已内置，**不需要访问本目录以外的任何文件**。

---

## 一、包内目录说明

```text
分包-妖精王/
├── README.md                    # 本文件：包内结构、发包与验收流程
├── 设计文档-妖精王.md            # 完整外观、三维坐标预算、六翼运动学、4 套四季换色与 4 大技能规格
├── 开工提示词.md                 # 发给无上下文网页端 AI 的完整提示词（已内置硬性 bundle_boss_fairy_king.zip 交付规范）
├── all_in_one.txt               # 已合并好的单文件合集，直接拖进网页端 AI 即可开工
├── 打包发给网页AI.command        # Mac 双击自动重新合并生成 all_in_one.txt
├── 预览验收.command              # Mac 双击自动跑 node verify.mjs + 开本地服务打开 preview.html
├── preview.html                 # 自带独立预览验收台（360° 旋转、4 套四季皮肤、7 个动作与 4 大技能）
├── verify.mjs                   # 自带 Node 硬性校验脚本（格式 / 防糊 / 零 NaN / 零禁用字）
├── core/                        # 【只读！严禁修改】主工坊完整像素堆叠内核（7 个文件）
├── references/                  # 【只读参考】主工坊林间妖精标杆 fairy.js、slime.js 与骨骼防糊经验
├── bundle/                      # 【验收放置区】把交回的 bundle_boss_fairy_king.zip 解压覆盖到这里即可预览验收
└── 交回/                        # 存放外包交回的原始 bundle_boss_fairy_king.zip 备份
```

---

## 二、发包与验收 3 步走

1. **发出去**：把本目录里的 **`all_in_one.txt`** 拖进网页端 AI 对话框，直接发这句口令（或贴 `开工提示词.md`）：
   > 严格按附件末尾的 `开工提示词.md` 开发。务必用单个脚本一次性生成 3 个文件、自检并打包出可下载的 `bundle_boss_fairy_king.zip`；正文严禁贴任何代码、JSON 或文档内容，若未打包完成直接停下汇报进度。
2. **收回来**：把下载的 `bundle_boss_fairy_king.zip` 存到 `交回/` 备底，并把里面的 3 个文件（`boss_fairy_king.js`、`manifest.json`、`交付说明.md`）覆盖放进本目录的 `bundle/`。
3. **一键验收**：直接双击 **`预览验收.command`** —— 自动先跑 `node verify.mjs`，再在浏览器打开 `http://127.0.0.1:8130/preview.html`（与蜘蛛 Boss 的 `8128`、哥布林王的 `8129` 端口错开，可三只同时开着对比！）。确认完美后，把 `bundle/boss_fairy_king.js` 拷进主工坊 `creatures/` 即可零改动合入。
