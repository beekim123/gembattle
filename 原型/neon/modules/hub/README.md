# modules/hub

## 管什么

大厅（设计稿 8.1）：只摆入口。整屏森林，左上大字，下面一列没框的文字按钮；入口上能挂记号（比如工会有几个能交的）。点了哪个入口，就在右边那块（`HUB_PANEL`）里画那个模块的板——板由 `app/` 交给工会、招募、出发、卡册这些模块自己画，大厅不认识它们。

## 对外接口（`index.js`）

- `HUB_PANEL`：右边那块板的位置。
- `createHubView({ entries, callbacks: { onSelect(id) } })` → `setState({ gold, rank, badges, allies, active, note, subtitle })`、`update(dt)`、`render(r)`、`panelFrame(r, k)`（画板的底和 ×，返回板的位置）、`onPointer(ev)`（只管入口和 ×）。

## 单独运行与测试

- `node --test modules/hub/test/hub.test.js`
- 演示页：`/modules/hub/demo.html`
