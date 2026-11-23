# modules/depart

## 管什么

出发（设计稿 8.1、10.3）：挑地点（原型只有森林外头区）、看这趟带了什么（任务、队友）、穿脱装备、出发。出发时拼好**出发包**交给 `run-rules`。

- `rules/`：`slotOptions`、`equipGear`、`cycleGear`、`buildDepartPacket(save, { loadout, quests, seed, rulesConfig })`。主角属性（`loadout`）由调用方从装备算好传进来（`content.buildHeroLoadout`），这里不认识 `content`。
- `view/`：`createDepartView({ callbacks: { onCycle(slot, dir), onGo() } })` → `setState({ save, gear, quests, allies, loadout, zoneLabel })`、`render(r, panelRect)`、`onPointer(ev)`。

## 单独运行与测试

- `node --test modules/depart/test/depart.test.js`
- 演示页：`/modules/depart/demo.html`
