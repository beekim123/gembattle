# 独立外包制作包 UI-02A：七色宝石牌与 8 张秘术牌（`cards` 牌面部分）

> **轻量拆分子包**：从原 UI-02 拆分出的**纯卡牌部分**（仅负责牌面与链槽，印记/战利品/雕琢小图标已拆到 UI-02B），大幅缩减单次代码量，确保网页端 AI 在 5~10 分钟内稳定打包交回。

---

## 一、包内目录说明

```text
分包-UI02A-七色宝石与秘术卡牌/
├── README.md                    # 本文件
├── 设计文档-宝石与秘术卡牌.md    # 7 色切面宝石牌、8 张秘术牌、废牌/牌背与链槽规格
├── 开工提示词.md                 # 发给网页端 AI 的完整提示词（置底于 all_in_one.txt）
├── preview.html                 # 独立可视化验收台（一屏展示 7 色牌×6态 + 8 秘术 + 废牌/牌背/链槽）
├── verify.mjs                   # 零依赖 Node 硬校验脚本（查接口、零禁用字、零 filter/shadowBlur、<=2MB）
├── 打包发给网页AI.command        # Mac 双击生成 all_in_one.txt
├── 预览验收.command              # Mac 双击先跑 verify.mjs，再自动开浏览器进 preview.html 验收
├── 交回/                        # 收到的 bundle_ui02a_cards.zip 放这里
└── bundle/                      # 【交付区】产出以下 3 个文件并打包为 bundle_ui02a_cards.zip
    ├── README.md
    ├── pack_cards.js            #   合并注册到 window.Code00ArtPacks.cards
    ├── manifest.json            #   卡牌清单与离屏内存统计
    └── 交付说明.md               #   verify.mjs 实测与目检记录
```

---

## 二、发包与验收 3 步走

1. **发包**：把 `all_in_one.txt` 拖进网页端 AI 对话框，附口令：
   > 严格按附件末尾的 `开工提示词.md` 开发。务必用单个脚本一次性生成 3 个文件、自检并打包出可下载的 `bundle_ui02a_cards.zip`；正文严禁贴任何代码、JSON 或文档内容，若未打包完成直接停下汇报进度。
2. **收包**：把 `bundle_ui02a_cards.zip` 放进 `交回/` 解压覆盖到 `bundle/`。
3. **验收与双库交付**：双击 `预览验收.command` 跑校验并目检，通过后优先交一份进 `美术/像素堆叠生物工坊/art-packs/`，再同步一份进 `美术/游戏实装美术库/art-packs/`（并拷入 `原型/v2/modules/art-packs/`）。
