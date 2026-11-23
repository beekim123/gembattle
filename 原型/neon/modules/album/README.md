# modules/album

## 管什么

卡册（设计稿 8.5）：牌、加成、队友、怪、装备、战利品六页。只读存档，不写。

- `rules/`：`albumEntries(save, data)` 算每一格亮没亮（牌全亮；加成、队友、装备看解锁和冒险家等级；怪看碰没碰到过；战利品原型只有空格子）。
- `view/`：`createAlbumView()` → `setState({ save, data })`、`render(r, panelRect)`、`onPointer(ev)`。

`data` 由 `app/` 从 `content` 拼：`{ cards, buffs, allies, monsters, gear }`。

## 单独运行与测试

- `node --test modules/album/test/album.test.js`
- 演示页：`/modules/album/demo.html`
