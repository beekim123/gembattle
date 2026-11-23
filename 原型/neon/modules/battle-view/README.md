# modules/battle-view

## 管什么

一仗的色块画面与鼠标操作（设计稿 10.1、10.2）：
- 渲染顶部回合/心/挡/宝石等级/集色指示、牌堆各色剩余张数条、敌方怪色块（血条/多重血条/带色盾格/倒计时/特性）、排链轨道与两行算式预览、底部带原色小点与接链亮牌提示的手牌区；
- 消费 `BattleEvent[]` 驱动纯数字飘字（同屏上限防糊屏）、合白/彩虹/破盾横幅、本回合总伤害面板和结算浮层；
- 所有点击通过 `callbacks` 回传给调用方，自己不算任何战斗规则。

## 对外接口

唯一对外入口：`modules/battle-view/index.js`

- `createBattleView({ allowAutoArrange, callbacks })`：提供 `setState`、`update`、`onPointer`、`render`、`clearFx`、`getLayoutBoxes`
- `createBattleFx()`：独立演出动画状态机

## 依赖边界

- 只导入 `../shared/index.js`、`../render/index.js`、`../ui/index.js`；不碰 `document` / `window`，不导入 `battle-rules` 或 `content`。

## 单独运行与测试

- 单测（不开浏览器）：`node --test modules/battle-view/test/battle-view.test.js`
- 演示页（纯假数据快照）：启动本地小服务后打开 `/modules/battle-view/demo.html`
