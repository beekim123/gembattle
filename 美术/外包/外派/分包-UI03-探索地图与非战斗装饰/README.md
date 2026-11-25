# 独立外包制作包 UI-03：探索路线图卷轴与非战斗页面装饰（`mapPanels`）

> **本目录是 100% 自包含的外包制作包**：可直接合并发给**无本地上下文的独立网页端 AI**。包含落果密林纵向羊皮卷地图、6 种节点×4 态徽章、青苔界门分界装饰、标题页招牌、非战斗标题卷轴与 11 种选项图标、结算页三枚大纹章的完整规格、可视化预览验收台与硬校验脚本。

---

## 一、包内目录说明

```text
分包-UI03-探索地图与非战斗装饰/
├── README.md                    # 本文件
├── 设计文档-探索地图与非战斗装饰.md # 路线图手绘羊皮卷、节点徽章、标题/卷轴/选项图标与结算纹章规范
├── 开工提示词.md                 # 发给网页端 AI 的完整提示词（置底于 all_in_one.txt）
├── preview.html                 # 独立预览验收台（支持滚动验收 8 步路线图 + 标题/营火/界门/结算装饰全览）
├── verify.mjs                   # 零依赖 Node 硬校验脚本（接口、禁用字、零 filter/shadowBlur、<=4MB）
├── 打包发给网页AI.command        # Mac 双击生成 all_in_one.txt
├── 预览验收.command              # Mac 双击先跑 verify.mjs，再自动开浏览器进 preview.html 验收
├── 交回/                        # 收到的 bundle_ui03_map.zip 放这里
└── bundle/                      # 【交付区】产出以下 3 个文件并打包为 bundle_ui03_map.zip
    ├── README.md
    ├── pack_map_panels.js       #   注册 window.Code00ArtPacks.mapPanels
    ├── manifest.json            #   装饰件元数据与离屏贴图内存清单
    └── 交付说明.md               #   verify.mjs 实测与目检记录
```

---

## 二、发包与验收 3 步走

1. **发包**：将 `all_in_one.txt` 拖进网页端 AI 对话框，附口令：
   > 严格按附件末尾的 `开工提示词.md` 开发。务必用单个脚本一次性生成 3 个文件、自检并打包出可下载的 `bundle_ui03_map.zip`；正文严禁贴任何代码、JSON 或文档内容。
2. **收包**：把 `bundle_ui03_map.zip` 放进 `交回/` 解压覆盖到 `bundle/`。
3. **一键验收与合入**：双击 `预览验收.command` 跑校验并滚动目检，通过后将 `bundle/pack_map_panels.js` 拷进 `原型/v2/modules/art-packs/` 并在 `app/index.html` 引入即可。
