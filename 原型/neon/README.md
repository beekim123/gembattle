# code00 原型（`原型/neon/`）

neon 做了阶段 0 和阶段 1 前半段，claude 接手做完了阶段 1~4（2026-11-23）。现在能从大厅接任务、买装备、雇队友，出发进林子一片一片地走，打仗、挑奖励、挑出口，打到看门的，活着回来在工会提交，再出发。

- 技术：浏览器原生 ES 模块 + Canvas 2D，全用简单色块，界面中文，不取名（游戏暂叫 code00）。
- **零 npm 依赖**，只要本机有 Node.js；截图工具用本机的 Chrome。
- 以后搬到 Electron 只加一个壳打开 `app/index.html`，模块不改。

## 打开

1. Mac 双击 `启动.command`；或
2. `npm start`；或 `node tools/serve.js --port 8123`，开 `http://localhost:8123/app/`。

直达（调试、截图用）：`?fresh=1` 重开存档；`?run=1` 直接进林子；`?panel=guild` 打开工会；`?scene=trial` 试打台；`?encounter=pack_mixed` 直接打一仗（`&bare=1` 不带加成队友）。

## 怎么玩

- **大厅**：出发 / 工会 / 招募 / 卡册 / 设置 / 退出。先去工会接任务（最多 3 个）、商店买装备（会磨损，坏了能再买）；招募雇队友（只管一趟，出发前能退）；出发里穿脱装备。
- **林子**：点地走（WASD 也行）。碰到鬼火开打；角落里一闪一闪的是藏着的东西；带「任」记号的是任务要的。打完出口亮起来，牌子上写打完下一片给什么、一只还是一群、是不是精英、有没有任务的东西。右上角「牌组」看牌组和属性，`Esc` 暂停。
- **打仗**：**出牌只用拖拽**：手牌拖到上面进链，拖回手里撤回，马上用的牌拖上去就用；点右下圆按钮打出（空格也行）。打的时候点一下画面加速，再点跳过。
- **回来**：在工会点「提交」才拿钱；做够 3 个 C 级任务出升级任务。
- **设置 → 试打台**：只打一仗，挑仗、开关摸牌规则和盾的倍数、带哪些加成队友、万发压测。那里改的开关，出发也照着用。

## 跑检查

- `npm test`：全部单测（不开浏览器），含解耦边界和禁用字检查。
- `npm run sim`：阶段 1 假玩家（一仗）。
- `node tools/sim-run.js`：阶段 4 假玩家（整趟 + 金币），结果在 `记录/阶段4-假玩家结果.md`。
- `npm run shot`：截全套图到 `shots/`（同时检查页面有没有报错）。

## 目录

14 个模块怎么拼起来、一局里传哪几个包，先看设计稿 **10.0「一页看懂」**（`设计/设计.md`）。

| 位置 | 是什么 |
|---|---|
| `app/` | 唯一组装处：`main.js`、主循环、场景切换；`scenes/` 里是大厅 `hub-scene.js`、走一趟 `run-scene.js`、打仗 `battle-scene.js`、试打台 `trial-scene.js`；`session.js` 放跨场景的这一趟和存档 |
| `modules/shared/` | 色环七色、时机和动作表、「改规则」能改哪些（`rule-keys.js`）、画面尺寸（`screen.js`）、随机数、几个包的约定和校验 |
| `modules/content/` | 内容数据：牌、怪和仗、加成、队友、地点、事件、任务、装备；拼开战包、拼给 run-rules 的内容包 |
| `modules/battle-rules/` | 一仗的规则（不碰画面） |
| `modules/battle-view/` | 一仗的画面和拖拽操作 |
| `modules/run-rules/` | 一趟的规则（区、层、片、出口、奖励、任务进度、回去、死了）和回来以后的结算 |
| `modules/explore-view/` | 一片空地的画面和操作 |
| `modules/save/` | 存档（浏览器里存 localStorage） |
| `modules/guild/`、`recruit/`、`depart/`、`album/` | 工会、招募、出发、卡册，各自 `rules/` 和 `view/` |
| `modules/hub/` | 大厅，只摆入口 |
| `modules/render/` | 画东西的接口；`blocks/` 是现在的色块，`blocks/looks.js` 是「样子」表 |
| `modules/ui/` | 公共小件：文字、按钮、牌、心、板 |
| `tools/` | 本地小服务、单测、边界守卫、两个假玩家、截图 |
| `进度.md` | 这份原型做到哪、下一步 |
| `偏离.md` | 原型跟设计稿不一样、或者还没做到的地方（第 7 节是总表） |
| `记录/` | 只当记录：当初给用户挑的候选（都定了，进了设计稿 9.3、10.6）、阶段 4 假玩家结果、挑布局时的候选页 |
| `shots/` | 截图、假玩家报告 |

## 以后换上像素堆叠美术

每个会动的东西（怪、主角、队友）都带一个 `look` 编号（怪的编号写在 `content/monsters/encounters.js`），画面模块只调 `render.drawActor({ look, x, y, size, state, t })`。换美术时：

1. 在 `modules/render/` 下加 `stack/`，实现同样的 `drawActor`，按 `look` 编号找用户在 `美术/像素堆叠生物工坊/` 做的怪（工坊里每只怪是 `createInstance` → `update` → `buildPartList`，由 `StackRenderer` 画）；
2. `render/blocks/looks.js` 的 `art` 一栏填上工坊里怪的 id（比如 `slime_jelly`）；
3. `modules/render/index.js` 换成 `stack/` 的实现。

战斗、空地、大厅、卡册的代码都不用改。
