# 独立外包制作包 UI-02：七色宝石牌、8 张秘术牌与全套图标集（`cards`）

> **本目录是 100% 自包含的外包制作包**：可直接合并发给**无本地上下文的独立网页端 AI**。含设计规格、独立可视化预览验收台、Node 自动化硬校验脚本与一键打包命令。

---

## 一、包内目录说明

```text
分包-UI02-七色宝石与秘术卡牌/
├── README.md                    # 本文件
├── 设计文档-宝石卡牌与图标集.md  # 7色宝石牌、8秘术牌、废牌/牌背、4雕琢、10印记、6战利品徽章精确规格
├── 开工提示词.md                 # 发给网页端 AI 的完整提示词（置底于 all_in_one.txt）
├── preview.html                 # 独立预览验收台（一屏陈列全部 7 色牌×4高亮态 + 8 秘术 + 10 印记 + 6 战利品）
├── verify.mjs                   # 零依赖 Node 硬校验脚本（接口、禁用字、零 filter/shadowBlur、<=3MB）
├── 打包发给网页AI.command        # Mac 双击生成 all_in_one.txt
├── 预览验收.command              # Mac 双击先跑 verify.mjs，再自动开浏览器进 preview.html 验收
├── 交回/                        # 收到的 bundle_ui02_cards.zip 放这里
└── bundle/                      # 【交付区】产出以下 3 个文件并打包为 bundle_ui02_cards.zip
    ├── README.md
    ├── pack_cards_icons.js      #   注册 window.Code00ArtPacks.cards
    ├── manifest.json            #   卡牌与图标元数据及离屏内存清单
    └── 交付说明.md               #   verify.mjs 实测与目检记录
```

---

## 二、发包与验收 3 步走

1. **发包**：将 `all_in_one.txt` 拖进网页端 AI 对话框，附口令：
   > 严格按附件末尾的 `开工提示词.md` 开发。务必用单个脚本一次性生成 3 个文件、自检并打包出可下载的 `bundle_ui02_cards.zip`；正文严禁贴任何代码、JSON 或文档内容。
2. **收包**：把 `bundle_ui02_cards.zip` 放进 `交回/` 解压覆盖到 `bundle/`。
3. **一键验收与合入**：双击 `预览验收.command` 跑校验并目检，通过后将 `bundle/pack_cards_icons.js` 拷进 `原型/v2/modules/art-packs/` 并在 `app/index.html` 引入即可。
