# modules/content

## 管什么

所有游戏内容的数据配置（设计稿 10.1）。阶段 1 先放战斗内容：
- `cards/`：29 张固定宝石牌定义 + 原型 8 种功能牌定义（效果均用 `shared/` 的「时机 + 条件 + 动作 + 数」写，不取名）；
- `monsters/`：阶段 1 的 5 种核心仗（双色盾、集色减伤、倒计时短、一群 1 厚 2 薄、3 条血看门的）以及 5.8 的另 2 种拓展仗、玩家试打属性预设；
- `createBattlePacket(...)`：把上述内容拼成符合 `shared` 约定的 `BattleStartPacket`。

不碰画面，不写战斗规则。

## 对外接口

唯一对外入口：`modules/content/index.js`

- 牌定义与构牌：`GEM_CARD_DEFS`、`FUNCTION_CARD_DEFS`、`FUNCTION_CARD_LIST`、`JUNK_CARD_DEFS`、`ALL_CARD_DEFS`、`instantiateCard`、`buildDeck`、`DECK_LOADOUTS`
- 遭遇与预设：`ENCOUNTERS`、`CORE_ENCOUNTERS`、`ALL_ENCOUNTERS`、`PLAYER_PRESETS`、`DEFAULT_RULES_CONFIG`
- 开战包组装：`createBattlePacket`

## 依赖边界

- 只导入 `../shared/index.js`，不碰 `document` 或 `canvas`。

## 单独运行与测试

- 单测（不开浏览器）：`node --test modules/content/test/content.test.js`
