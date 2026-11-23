# modules/recruit

## 管什么

招募（设计稿 8.1、8.4）：花金币雇这一趟的队友，出发前能退（全额退钱）；席位 C 级 1 个、B 级 2 个、S 级 3 个。

- `rules/`：`seatsFor(rank)`、`availableAllies(save, allies)`、`hireAlly(save, id, allies)`、`refundAlly(save, id, allies)`，返回 `{ save, ok, msg }`。
- `view/`：`createRecruitView({ callbacks: { onHire, onRefund } })` → `setState({ save, allies })`、`render(r, panelRect)`、`onPointer(ev)`。

队友数据（`allies`）由 `app/` 从 `content` 传，要有 `hireCost`、`unlockRank`、`explore`。

## 单独运行与测试

- `node --test modules/recruit/test/recruit.test.js`
- 演示页：`/modules/recruit/demo.html`
