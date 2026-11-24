# modules/shared

## 管什么

跨模块共用的基础定义与数据约定（设计稿 5.2、5.9、10.3）：

1. **色环与七种颜色**：红、黄、绿、青、蓝、紫六色环 + 圆心白，外加「变色」「无色」标记、三原色宝石组成、邻色与补色查表、固定 29 张宝石牌数量定义。
2. **时机与动作表**：15 个时机名、18 个动作定义（含参数说明、允许来源、持续多久、会不会再触发别的）。
3. **可指定种子的随机数**：`createRng(seed)`，跨平台确定性输出，支持 `next`、`int`、`chance`、`pick`、`shuffle`、`getState`、`setState`、`fork`。
4. **战斗四样约定及校验函数**：
   - 动作表（`validateActionTable`、`validateEffect`）
   - 开战包（`validateBattleStartPacket`）
   - 战斗快照 / 预览 / 演出事件（`validateBattleSnapshot`、`validateBattlePreview`、`validateBattleEvent`、`validateBattleEvents`）
   - 战斗结果（`validateBattleResult`，明确拒绝携带掉落字段）
5. **一趟和大厅之间的三样约定**（`run-contracts.js`，第 3 轮审核后补的）：出发包（`validateDepartPacket`）、回来包（`validateReturnPacket`）、存档（`validateSaveData`），外加 `RUN_OUTCOMES`、`ADVENTURER_RANKS`。`run-rules` 开一趟、交回来包时查，`save` 写存档时查。

不放玩法逻辑（不算接链、不算伤害、不执行动作），不碰 `document` 或 `canvas`。

## 对外接口

唯一对外入口：`modules/shared/index.js`。

- 颜色常量与查表：`PRIMARY_GEMS`、`COLOR_RING`、`SEVEN_COLORS`、`CARD_COLORS`、`BASE_GEM_DECK_TOTAL`、`CHAIN_RELATIONS`、`CHAIN_RELATION_LABELS`、`COLOR_META`、`isPrimaryGem`、`isRingColor`、`isSevenColor`、`isCardColor`、`getColorMeta`
- 时机与动作：`EFFECT_SOURCES`、`TIMINGS`、`TIMING_LABELS`、`ACTION_DURATIONS`、`ACTION_DURATION_LABELS`、`RETRIGGER_POLICIES`、`RETRIGGER_POLICY_LABELS`、`ACTIONS`、`DEFAULT_ACTION_TABLE`
- 随机数：`createRng`
- 约定校验：`SCHEMA_VERSION`、`BATTLE_EVENT_TYPES`、`createEmptyDrawPileByColor` 及上述 7 个 `validate*` 函数；`RUN_OUTCOMES`、`ADVENTURER_RANKS`、`validateDepartPacket`、`validateReturnPacket`、`validateSaveData`

## 读写哪些数据

- 只读外部传入的数据对象进行结构校验，不修改入参，不读写存档，不持有全局可变状态。

## 单独运行与测试

- 单测（不开浏览器）：`node --test modules/shared/test/shared.test.js`
- 演示页：启动本地小服务后打开 `/modules/shared/demo.html`

## 第 4 版加的两样

- `rule-keys.js`：「改规则」动作（`ACTIONS.MODIFY_RULE`）能改的规则名，加成、装备、怪的特性都只能用这里的名字（`RULE_KEYS.xxx`），`content` 的单测会查有没有写错。
- `screen.js`：画面尺寸 `SCREEN`。画面按 1920×1080 设计，代码坐标用 960×540 的布局单位（设计稿 10.6）。
