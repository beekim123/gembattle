# modules/battle-view

## 管什么

一仗的色块画面和鼠标操作（设计稿 10.1、10.2），**上下布局**（用户 2026-11-23 定的）：
- 怪在上面森林空地里，头顶只有血条、细盾条、倒计时和几个小图标；鼠标放上去才出细节；
- 链浮在中间，主角和队友在下面，手牌在最下面排成一道弧；左边集色环，右边预览框；
- **出牌只认拖拽**：手里的牌拖到上面进链（只接在链尾），「马上用」的牌拖上去就用；链里的牌拖不动、不能换位子，放错了点「撤销上一步」「撤销全部」；点一下手牌什么都不做；
- 打出去以后照 `BattleEvent[]` 播一段（`playback.js`）：每张牌亮起、飞出去，一发一个数（设计稿 5.3），合白、彩虹、破盾、换血条、队友出手、加成的小字、总数、怪的回合；播的时候不能操作；
- 「马上用」的牌拖进中间虚线框（「松手就用」）就用，往上拖一点就够；
- 强化过的牌在手里、链里都有个小记号，悬停多说一句强化成了什么；断色的牌悬停写「断色：色环上没挨着」；手里超过 7 张时只给悬停的那张写提示；
- 悬停集色环：链尾颜色的两个邻色画绿圈、补色画金圈；悬停预览框：「这条链怎么算」两行算式（`preview.formulaLines`）；
- 预览照 `preview.byMonster` 给每只怪的血条画预计伤害、盾格闪一下要削掉的；
- 所有操作通过 `callbacks` 回传给调用方，自己不算任何战斗规则。

## 文件

- `view.js`：`createBattleView`，画面 + 鼠标；
- `layout.js`：所有位置（`REGIONS`、手牌弧 `fanSlots`、链 `chainSlots`）；
- `playback.js`：`buildPlayback(events, prevSnap, nextSnap)`，把一回合的事件排成时间表；
- 色块小画法（牌、心、宝石点、色环……）在 `ui/kit.js`，空地、大厅也用。以前挑布局的候选页挪到了 `原型/neon/记录/布局候选/`，只当记录。

## 对外接口

唯一对外入口：`modules/battle-view/index.js`

- `createBattleView({ allowAutoArrange, callbacks })`：`setState`、`update`、`onPointer`、`render`、`isBusy`、`getLayoutBoxes`
- callbacks：`onQueueCard(uid, index)`（index 总是链尾）、`onPlayInstant(uid)`、`onSelectTarget(uid)`、`onAutoArrange(strategy)`、`onUndoLast()`、`onClearChain()`、`onCommitChain()`、`onRetry()`、`onBack()`
- **出牌**（照用户原型，用户 2026-11-24 又说了一次）：只能从手里拖；拖进链只接在链尾，不插到中间；链里的牌不能再拖、不能改顺序。放错了点「撤销上一步」（链尾那张回手里）或「撤销全部」，这两个键链里有牌才出。
- `buildPlayback`、`REGIONS`、`fanSlots`、`chainSlots`、`monsterSlots`

## 依赖边界

- 只导入 `../shared/index.js`、`../render/index.js`、`../ui/index.js`；不碰 `document` / `window`，不导入 `battle-rules` 或 `content`。

## 单独运行与测试

- 单测（不开浏览器）：`node --test modules/battle-view/test/battle-view.test.js`
- 演示页（纯假数据快照）：启动本地小服务后打开 `/modules/battle-view/demo.html`
