# modules/run-rules

## 管什么

一趟的规则（设计稿 6.2~6.4、7、8.2~8.3）：区、层、片、出口、奖励、藏着的东西、小事件、任务进度、回去、死了；回来以后的结算（`settleRun`）。

不碰画面，不认识 `content` 模块：怪、牌、加成、队友、事件、任务和数，都由调用方（`app/`）用纯数据传进来（contentPack）。

## 对外接口（`index.js`）

- `createRun(departPacket, contentPack)` → 一趟：
  - `getState()`：现在这一片什么样、等玩家挑什么（`pending`）、身上的牌组 / 属性 / 心 / 金币 / 任务；
  - `getBattlePacket(rulesConfig?)`：这一片要打的仗的开战包（交给 `battle-rules`）；
  - `finishBattle(result)`：交回战斗结果；
  - `choose(choice)`：挑等着的东西（功能牌 / 加成三选一、强化、删牌、歇脚、事件、提示）；
  - `takeHidden()` / `gather(id)` / `takeFindItem()`：走到藏着的东西、采集点、任务物品跟前；
  - `chooseExit(id)`：挑出口；走「回去」就结束；
  - `getReturnPacket()`：结束以后的回来包。
- `settleRun(save, returnPacket, contentPack)` → 存档要改什么（死了丢什么、磨几点、卡册记什么）。

### contentPack 里要有

`zones`、`cardDefs`、`baseDeck`（29 张宝石的 defId）、`functionCardList`、`functionEnhance`、`junkCardId`、`buffDefs`、`buffList`、`allyDefs`、`encounters`、`events`、`eventList`、`hiddenQuest`、`defaultRules`、`gearDefs`。由 `content` 的 `createRunContent()` 拼好。

## 单独运行与测试

- `node --test modules/run-rules/test/run.test.js`（用假数据，不开浏览器）
