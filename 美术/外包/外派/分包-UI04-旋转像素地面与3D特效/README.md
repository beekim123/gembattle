# 独立外包制作包 UI-04：六生态可旋转像素地面与 3D 战斗特效（`groundVfx`）

> **本目录是 100% 自包含的外包制作包**：可直接合并发给**无本地上下文的独立网页端 AI**。本包内置工坊 `core/` 渲染内核与 3 个真实 3D 像素堆叠模型（法师、地精、落果古树），打开 `preview.html` 即可在 **360° 可自由旋转的真实 3D 堆叠战场**里直接验收地面像素接缝、旋转流畅度（120fps）与全部 3D 战斗特效！

---

## 一、包内目录说明

```text
分包-UI04-旋转像素地面与3D特效/
├── README.md                    # 本文件
├── 设计文档-旋转像素地面与3D特效.md # 8 套像素地面纹理、3D 生态微粒、弹道/波纹与 8 只怪 3D 像素出手特效规范
├── 开工提示词.md                 # 发给网页端 AI 的完整提示词（置底于 all_in_one.txt）
├── preview.html                 # 360° 真 3D 像素堆叠实景验收台（拖动旋转/Q·E/一键试放全部生态与特效）
├── verify.mjs                   # 零依赖 Node 硬校验脚本（查接口、零禁用字、零 filter/shadowBlur、<=6MB、0 NaN）
├── 打包发给网页AI.command        # Mac 双击生成 all_in_one.txt（已自动排除冗余模型源码保持精炼）
├── 预览验收.command              # Mac 双击先跑 verify.mjs，再自动开浏览器进 3D 实景 preview.html 验收
├── core/                        # 【只读！严禁修改】工坊渲染内核与色板（math / habitats / renderer 等）
├── references/                  # 【只读参考】实景验收用真 3D 像素模型（npc_mage / goblin / scene_forest_tree）
├── 交回/                        # 收到的 bundle_ui04_ground_vfx.zip 放这里
└── bundle/                      # 【交付区】产出以下 3 个文件并打包为 bundle_ui04_ground_vfx.zip
    ├── README.md
    ├── pack_ground_vfx.js       #   注册 window.Code00ArtPacks.groundVfx
    ├── manifest.json            #   地面纹理尺寸、特效清单与内存占用
    └── 交付说明.md               #   verify.mjs 实测数据与 360° 目检记录
```

---

## 二、发包与验收 3 步走

1. **发包**：将 `all_in_one.txt` 拖进网页端 AI 对话框，附口令：
   > 严格按附件末尾的 `开工提示词.md` 开发。务必用单个脚本一次性生成 3 个文件、自检并打包出可下载的 `bundle_ui04_ground_vfx.zip`；正文严禁贴任何代码、JSON 或文档内容。
2. **收包**：把 `bundle_ui04_ground_vfx.zip` 放进 `交回/` 解压覆盖到 `bundle/`。
3. **一键验收与合入**：双击 `预览验收.command` 跑校验并在 360° 实景台里逐生态拖动旋转、点放全部 8 怪与主角特效。确认满意后，将 `bundle/pack_ground_vfx.js` 拷进 `原型/v2/modules/art-packs/` 并在 `app/index.html` 引入即可。
