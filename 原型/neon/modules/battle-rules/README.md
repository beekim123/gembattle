# modules/battle-rules

## 管什么

一仗的完整规则引擎（设计稿 5.1~5.9、10.1、10.3 第 3 版）：
- 输入：符合 `shared/` 约定的 `BattleStartPacket` 与玩家操作；
- 输出：严格通过 `shared/` 校验的只读 `BattleSnapshot`、`BattlePreview`、`BattleEvent[]` 和结束时的 `BattleResult`（不管掉落）；
- 每个动作一个独立小函数（`actions.js`），不写通用脚本解释器；
- 内置自动帮排（`arrange.js`，支持按最长链、按先破盾、按追彩虹三种策略）。

不碰 `document` / `canvas` / `window`，可在 Node 中直接跑单测和几百仗模拟器。

## 对外接口

唯一对外入口：`modules/battle-rules/index.js`

- `createBattle(startPacket, options)`：返回战斗实例（`getSnapshot`、`getPreview`、`selectTarget`、`queueCard`、`unqueueCard`、`undoLast`、`clearChain`、`playInstantCard`、`autoArrange`、`commitChain`、`getResult`、`getMetrics`、`getInitialEvents`）
- `resolveCardForChain`、`computeChainRelation`、`advanceRecordedColors`、`pickColorsToRecord`、`gemLevelThreshold`、`gemLevelMultiplier`
- `ACTION_HANDLERS`、`executeAction`
- `findBestChainOrder`

## 依赖边界

- 只导入 `../shared/index.js`，不知道 `content/`、`battle-view/`、`render/`、`ui/` 或 `app/` 的存在。

## 单独运行与测试

- 单测（不开浏览器）：`node --test modules/battle-rules/test/battle-rules.test.js`
