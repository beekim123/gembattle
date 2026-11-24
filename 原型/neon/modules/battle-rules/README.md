# modules/battle-rules

## 管什么

一仗的完整规则引擎（设计稿 5.1~5.9、10.1、10.3）：
- 输入：符合 `shared/` 约定的 `BattleStartPacket` 与玩家操作；
- 输出：严格通过 `shared/` 校验的只读 `BattleSnapshot`、`BattlePreview`、`BattleEvent[]` 和结束时的 `BattleResult`（不管掉落）；
- 每个动作一个独立小函数（`actions.js`），不写通用脚本解释器；
- 内置自动帮排（`arrange.js`，支持按最长链、按先破盾、按追彩虹三种策略）。

不碰 `document` / `canvas` / `window`，可在 Node 中直接跑单测和几百仗模拟器。

## 文件

| 文件 | 干什么 |
|---|---|
| `engine.js` | 一仗的状态机：回合开始（摸牌照设计稿 5.1 `draw_floor`：先摸 2、不到 N 补到 N、回合开始最多 N + 1）、排链、打出去一张张结算（`resolveChain`）、预览、怪出手、结果 |
| `battle-state.js` | 默认规则开关、从开战包建出牌和怪的初始状态（纯函数） |
| `actions.js` | 动作表：每个动作一个小函数（设计稿 5.9） |
| `chain-math.js` | 接链的算法：关系（接上 / 断 / 合白）、集色、宝石等级 |
| `arrange.js` | 自动帮排 |

- 加成、装备、怪的特性要「改规则」，用 `shared` 的 `RULE_KEYS` 里的名字（`ruleOn(RULE_KEYS.xxx)` / `ruleVal(...)`），名字全列在 `shared/rule-keys.js`。
- **预览和打出去是同一份算法**（第 3 轮审核以后改的）：`resolveChain` 管一条链怎么结算；`commitChain` 真打，`getPreview` 先把状态记下来（怪换成复制品），照 `resolveChain` 空跑一遍，读完结果全换回去。空跑时暴击按期望算、不掷骰子。加一个改规则的加成，只改 `resolveChain` 一处。`test/review3.test.js` 查「预览 = 打出去」和「看预览不动状态」。
  - 空跑要换回去的状态都列在 `saveStateForDryRun` 里。**往 engine 里加新的、会在链里变的状态，要记得加进去**，不然预览会把它改掉。
- **已知的毛病**：`engine.js` 还是一个大文件（一千六百多行）。以后按「回合开始 / 链结算 / 怪出手」拆。

## 对外接口

唯一对外入口：`modules/battle-rules/index.js`

- `createBattle(startPacket, options)`：返回战斗实例（`getSnapshot`、`getPreview`、`selectTarget`、`queueCard`、`unqueueCard`、`undoLast`、`clearChain`、`playInstantCard`、`autoArrange`、`commitChain`、`getResult`、`getMetrics`、`getInitialEvents`）
- `resolveCardForChain`、`computeChainRelation`、`advanceRecordedColors`、`pickColorsToRecord`、`gemLevelThreshold`、`gemLevelMultiplier`
- `ACTION_HANDLERS`、`executeAction`
- `findBestChainOrder`

## 依赖边界

- 只导入 `../shared/index.js`，不知道 `content/`、`battle-view/`、`render/`、`ui/` 或 `app/` 的存在。

## 单独运行与测试

- 单测（不开浏览器）：`node --test modules/battle-rules/test/`
