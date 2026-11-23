# modules/battle-view

## 管什么

一仗的色块画面和鼠标操作（设计稿 10.1、10.2），**上下布局**（用户 2026-11-23 定的）：
- 怪在上面森林空地里，头顶只有血条、细盾条、倒计时和几个小图标；鼠标放上去才出细节；
- 链浮在中间，主角和队友在下面，手牌在最下面排成一道弧；左边集色环，右边预览框；
- **出牌只认拖拽**：手里的牌拖到上面进链（松手的地方决定插第几个），「马上用」的牌拖上去就用，链里的牌拖回手里就是撤回，链里拖来拖去换位子；点一下手牌什么都不做；
- 打出去以后照 `BattleEvent[]` 播一段（`playback.js`）：每张牌亮起、飞出去，一发一个数（设计稿 5.3），合白、彩虹、破盾、换血条、队友出手、加成的小字、总数、怪的回合；播的时候不能操作；
- 所有操作通过 `callbacks` 回传给调用方，自己不算任何战斗规则。

## 文件

- `view.js`：`createBattleView`，画面 + 鼠标；
- `layout.js`：所有位置（`REGIONS`、手牌弧 `fanSlots`、链 `chainSlots`、插第几个 `chainInsertIndex`）；
- `playback.js`：`buildPlayback(events, prevSnap, nextSnap)`，把一回合的事件排成时间表；
- `draw.js`：色块小画法（牌、心、宝石点、色环、像素堆叠色块小人……）；
- `proposals/`：布局候选页（记录用，不进游戏）。

## 对外接口

唯一对外入口：`modules/battle-view/index.js`

- `createBattleView({ allowAutoArrange, callbacks })`：`setState`、`update`、`onPointer`、`render`、`isBusy`、`getLayoutBoxes`
- callbacks：`onQueueCard(uid, index)`、`onMoveChainCard(uid, index)`、`onUnqueueCard(uid)`、`onPlayInstant(uid)`、`onSelectTarget(uid)`、`onAutoArrange(strategy)`、`onClearChain()`、`onCommitChain()`、`onRetry()`、`onBack()`
- `buildPlayback`、`REGIONS`、`fanSlots`、`chainSlots`、`monsterSlots`

## 依赖边界

- 只导入 `../shared/index.js`、`../render/index.js`、`../ui/index.js`；不碰 `document` / `window`，不导入 `battle-rules` 或 `content`。

## 单独运行与测试

- 单测（不开浏览器）：`node --test modules/battle-view/test/battle-view.test.js`
- 演示页（纯假数据快照）：启动本地小服务后打开 `/modules/battle-view/demo.html`
