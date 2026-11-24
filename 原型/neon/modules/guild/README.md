# modules/guild

## 管什么

工会（设计稿 8.1~8.4、6.5）：任务板（接、放弃、提交、全部提交、上次失败的）、商店（买装备，坏了能再买）、冒险家等级（做够 3 个出升级任务）。

- `rules/`：纯函数，给存档和内容数据，返回 `{ save, ok, msg }`（新存档，不改传进来的）。不碰画面。
- `view/`：画在大厅右边那块里，三页：任务 / 商店 / 等级。做完的任务有 2 个以上时改成窄行；任务板放不下的写「还有 N 个放不下」，不悄悄截掉。
- 升级任务上次失败了，就只在「上次失败的」那栏，任务板上不再摆一份。

## 对外接口（`index.js`）

- 规则：`refreshBoard`、`takeQuest`、`abandonQuest`、`submitQuest`、`submitAll`、`shopList`、`buyGear`、`submittableCount`、`rankInfo`。
- 画面：`createGuildView({ callbacks })` → `setState({ save, content })`、`render(r, panelRect)`、`onPointer(ev)`。

内容（`content`）由 `app/` 传：`{ quests, board, rankQuestId, hiddenQuest, gear }`。

## 单独运行与测试

- `node --test modules/guild/test/guild.test.js`
- 演示页：`/modules/guild/demo.html`
