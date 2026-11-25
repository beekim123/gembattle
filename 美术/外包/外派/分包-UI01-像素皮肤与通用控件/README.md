# 独立外包制作包 UI-01：复古奇幻像素皮肤与通用控件（`uiSkin`）

> **本目录是 100% 自包含的外包制作包**：可直接合并发给**无本地上下文的独立网页端 AI**。设计规格、独立可视化预览验收台、Node 自动化硬校验脚本与交付规范全部内置，无需依赖外部目录。

---

## 一、包内目录说明

```text
分包-UI01-像素皮肤与通用控件/
├── README.md                    # 本文件：包内结构、发包与验收流程
├── 设计文档-UI像素皮肤与控件.md  # 复古奇幻像素风视觉基调、色板、9-slice 规格与全部 10 个导出接口定义
├── 开工提示词.md                 # 发给网页端 AI 的完整开工提示词（自动置底于 all_in_one.txt）
├── preview.html                 # 独立可视化验收台（一屏展示全部控件、3 态交互、多尺寸拉伸与像素数字压测）
├── verify.mjs                   # 零依赖 Node 硬校验脚本（查接口、零禁用字、零 filter/shadowBlur、<=2MB 内存）
├── 打包发给网页AI.command        # Mac 双击合并全包为单个 all_in_one.txt
├── 预览验收.command              # Mac 双击先跑 verify.mjs，再自动开浏览器进 preview.html 验收
├── 交回/                        # 收到的 bundle_ui01_skin.zip 解压放这里
└── bundle/                      # 【交付区】外包方需产出以下 3 个文件并打包交回
    ├── README.md                #   交付物清单说明
    ├── pack_ui_skin.js          #   （外包产出）注册 window.Code00ArtPacks.uiSkin
    ├── manifest.json            #   （外包产出）控件清单、色板与内存占用数据
    └── 交付说明.md               #   （外包产出）verify.mjs 实测结果与目检记录
```

---

## 二、发包与验收 3 步走

1. **发包**：直接把本目录已生成的 **`all_in_one.txt`**（或双击 `打包发给网页AI.command` 重新生成）拖进网页端 AI 对话框，附口令：
   > 严格按附件末尾的 `开工提示词.md` 开发。务必用单个脚本一次性生成 3 个文件、自检并打包出可下载的 `bundle_ui01_skin.zip`；正文严禁贴任何代码、JSON 或文档内容。
2. **收包**：把下载的 `bundle_ui01_skin.zip` 放进 `交回/` 解压，把里面的 `pack_ui_skin.js`、`manifest.json`、`交付说明.md` 覆盖到本目录 `bundle/`。
3. **一键验收与合入**：双击 **`预览验收.command`** —— 自动先跑 `node verify.mjs` 过全部红线，再自动在浏览器打开 `preview.html` 肉眼检视所有面板/按钮/血条/护盾/集色环/像素数字。确认满意后，直接把 `bundle/pack_ui_skin.js` 拷进 `原型/v2/modules/art-packs/` 并在 `app/index.html` 引入即可热插拔生效！
