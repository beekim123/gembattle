# `bundle/` 交付目录（UI-02A 七色宝石与秘术卡牌）

外包方请将最终产出的 3 个文件放入本目录，并打包成 **`bundle_ui02a_cards.zip`** 交回：

1. `pack_cards.js` —— 合并挂载到 `window.Code00ArtPacks.cards`，实现 `initCards / drawCard / drawCardBack / drawChainSlot`
2. `manifest.json` —— 7 色牌、8 秘术牌、废牌/牌背/链槽清单与内存统计
3. `交付说明.md` —— `node verify.mjs` 自检结果与 `preview.html` 目检记录
