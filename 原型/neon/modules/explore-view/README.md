# modules/explore-view

## 管什么

一片空地的画面和操作（设计稿 7.1、7.4）：主角走（点地 / WASD）、鬼火（碰到开打）、藏着的东西和小事件、采集点、任务物品、打完亮起来的出口（牌子上写片的种类、奖励、一只还是一群、任务记号），还有等着挑的板（功能牌 / 加成三选一、强化、删牌、歇脚、事件、提示）和看牌组。

只看 `run-rules` 的 `getState()`，自己不算规则；玩家做了什么，调 `callbacks` 交给 `app/`。会动的东西（主角、队友、怪）都走 `render.drawActor(look)`，以后换堆叠美术不改这里。

## 对外接口（`index.js`）

- `createExploreView({ catalog, callbacks })`
  - `catalog`：`{ cards, buffs, allies }`，按 id 查名字和说明（由 `app/` 从 `content` 拼好）；
  - `callbacks`：`onFight()`、`onExit(id)`、`onTakeHidden()`、`onGather(id)`、`onFindItem()`、`onChoose(choice)`、`onMenu()`。
- 实例：`setState(runState)`、`update(dt)`、`render(renderer)`、`onPointer({type,x,y})`、`onKey(key, down)`、`isBusy()`、`getLayout()`（测试、截图用）。

## 单独运行与测试

- 单测：`node --test modules/explore-view/test/explore-view.test.js`
- 演示页：`/modules/explore-view/demo.html`（假数据）
