# `bundle/` 交付目录

外包方请将最终产出的 3 个文件放进本目录，完成后将整个 `bundle/` 打包交回：

1. `boss_weaver_spider.js` —— 核心像素堆叠资产脚本（符合 `./core/registry.js` 与 `PW.Creatures.push` 规范）
2. `manifest.json` —— 资产与技能清单（id、部件尺寸、4 套皮肤、7 个动作与战斗机制说明）
3. `交付说明.md` —— `node verify.mjs` 校验结果与 `preview.html` 实机目检记录

> 放好 `boss_weaver_spider.js` 后，在上一级目录运行 `node verify.mjs` 并打开 `preview.html` 即可一键验收。
