# code00 v2 原型（第 1~3 步：核心战斗 + 落果密林一趟 + 像素美术与音乐音效）

照 `设计/重制开发方案-第一到第三步.md` 第一~四节做的全新独立原型。浏览器里跑：原生 JS（ES 模块）+ Canvas 2D，零依赖、零构建。

## 怎么玩

Mac 上双击 `启动.command`（会开本地小服务并自动打开浏览器），或者：

```bash
node tools/serve.js --open
```

然后打开 `http://localhost:8200/app/index.html`（8200 被占会自动换下一个口）。

打开是标题页：点「深入林地」走一趟——路线图上挑路（第 1 步到第 8 步）、打怪拿战利品、营火 / 行商 / 林中偶遇，第 4 步打完在青苔界门选「折返结算」或「深入腹地」，第 8 步是林地首领。点「核心试玩（4 场教学仗）」是第 1 步的 4 场递进仗。结算页有「复制试玩记录」，一键把这次的时长、趟数、走到哪、平均思考秒数、撤回次数、印记和雕琢复制出来，发给我。

操作：
- 把手里的牌**拖**进链里（只能接在链尾；链里的牌不能拖、不能改顺序）。
- 「退回一张」（退格键）、「清空」（Esc）撤销；「施法」（空格）打出整条链；链空着时这个键变成「过回合」。
- 路线图是一张长图：按住上下拖动、滚轮、方向键（或 W / S）、PageUp / PageDown 看全图；Home 看最深处，End 回起点。拖动不会误点节点。
- 点怪切换目标；鼠标放到怪上看详情；「查看牌组」看牌组的去向。
- 紫色的瞬发秘术牌也是拖进链区，**松手立刻生效**，不占链位，自动补摸 1 张；废牌拖进来是直接丢掉。入链秘术（带色）照常拖进链尾。
- 鼠标放到手牌、印记上看说明。
- 右上角「音乐」「音效」两个按钮：点一下开关，鼠标放上去出音量条，拖动调音量。设置存在浏览器里，下次打开还是这样。第一次点击或按键以后才会出声（浏览器规矩）。

## 网址参数（调试和验收用）

| 参数 | 作用 |
|---|---|
| `?seed=数字` | 固定一趟的随机种子 |
| `?mode=tutorial` | 直接进第 1 步的 4 场教学仗 |
| `?auto=1&speed=8` | 假玩家自动打（只用来测试，可加 `gate=retreat`、`heal=1`、`loop=1`） |
| `?art=blocks` | 不用工坊像素模型，退回色块（排错、对照用）；工坊脚本没加载成功时也会自动退回 |
| `?dpr=1` | 把画布的物理像素压到 1920×1080（测帧率用）。不写时默认跟屏幕走、最多 2 倍（3840×2160 画布稳 120 帧，不再自动降分辨率）。按 P 键看性能浮层 |
| `?show=名字` | 直接看某个画面：`title`、`map`、`camp`、`shop`、`gate`、`event`、`summary`、`summary-defeat`、`enc:e_slime` 等 8 场遭遇（`e_slime`、`e_sheep`、`e_goblin`、`e_fairy`、`e_leopard`、`e_gibbon`、`e_sloth`、`e_boss`）；可加 `&biome=` |

## 美术（第 3 步）

- 角色、生态摆件、建筑用 `美术/游戏实装美术库/` 里现成的像素堆叠模型，**严格只读**，一个字没改。`app/index.html` 按方案 4.2 清单加载 31 个脚本（6 个内核、1 个地貌色板、11 个生态摆件、8 只怪、主角和行商、3 个建筑），外加 5 个界面与特效包（`art-packs/` 下的 `pack_ui_skin.js`、`pack_cards.js`、`pack_icons.js`、`pack_map_panels.js`、`pack_ground_vfx.js`；全部经 `modules/ui/skin.js` 取用，缺了或 `?art=blocks` 退回内置色块）。开发时 `/art/` 由 `tools/serve.js` 映射过去；导出时抽进 `art/`。
- 没有工坊的圆形展示台。每个场景是：无缝大 Tilemap 生态地面（加一个唯一地标）+ 微粒在最下，5~8 个摆件成簇放在左右和上方（避开中间的战斗区、左上的集色环和右下的按钮），怪在上，主角（`npc_mage`，背对镜头）在下。营火场景 = 营火 + 岩洞 + 主角；行商 = 帐篷 + 货箱木牌 + 行商 + 主角；界门 = 青苔石门。
- 接法在 `modules/render/world-stage.js`（统一世界舞台，镜头在 `camera.js`；`workshop-adapter.js` 只是兼容出口）：缓存模式（`prepareActor` + `drawPreparedActor`），同一种模型同时出现几只时共用体素和图集，图集上限 28MB（实际 5~6MB）；像素层关平滑、整数倍缩放，不拉伸半个像素。
- **战斗姿态和技能是 v2 这边自己做的**（工坊模型只有待机动作）：`modules/render/battle-pose.js` 管姿态（蓄力、扑出、受击、倒下、主角施法），`modules/ui/attack-fx.js` 管 8 只怪各自的出手特效（吐液、喷粉、挥棒、撒花瓣、抛果、扑爪、啃咬、地刺）。这些是我先定的默认，要不要换见 `偏离.md` 第 32 条。

## 音乐音效（第 3 步）

`modules/audio/`，零依赖 Web Audio，全部现场合成：
- 3 首循环音乐：探索 / 营火（五声音阶，约 82 BPM）、普通战斗（约 112 BPM）、精英 / 首领（紧张，约 128 BPM；首领第 3 条血更快、多一层高频）；另有一段约 3 秒的结算短句；切换交叉淡入淡出 0.6 秒。
- 环境声：林地 / 花甸 / 树冠是风声，泥泽 / 遗迹是滴水和水泡，营火是柴火噼啪，音量约为音乐的 15%。
- 10 种音效：点击、拖牌 / 放回、链上音阶（Do Re Mi Sol La 高 Do，越接越高）、断色、白色爆发、彩虹琶音、命中（限流）、破盾、掉心、奖励。
- 预留了换真音频的口：`audio.loadSamples({ 名字: 文件地址 })`，给了 `.mp3` / `.ogg` 就盖过合成的。

## 外测包（第 3 步）

```bash
node tools/export-web.js
```

从 `app/main.js` 顺着 import 找出全部运行代码，加上用到的 31 个工坊脚本，抽进 `dist/`（`art/`、`app/`、`modules/`、`index.html`），再打成 `dist/code00-forest-web.zip`（`index.html` 在 zip 根目录，纯静态，约 400KB，含假玩家（`?auto=1` 还能用），不含单测，工坊脚本逐字节照搬）。上传 itch.io：新建项目 → Kind of project 选 HTML → 上传这个 zip，勾选 This file will be played in the browser → Visibility 选 Restricted 并设密码。

注意：ES 模块在 `file://` 下浏览器不让加载，导出的 `index.html` 里写了提示，要用 itch.io 或任意静态服务（比如 `python3 -m http.server`）打开。

## 怎么测

```bash
node tools/test.js
```

跑 `modules/` 和 `tools/` 里全部 `*.test.js`（色环、断色、合白、彩虹、跨回合、破盾、留牌上限、宝石等级、预览与实战一致、四场仗配置、8 张秘术牌、4 种雕琢、10 个印记、8 场遭遇、路线图连通性、成长与行商与偶遇、假玩家整趟跑通、试玩记录、音乐音效（假的 AudioContext）、音量条、战斗姿态与出手特效、导出包、禁用字扫描），一共 193 个（含 skin、tilemap、排版安全区三组新增）。

## 目录

```
app/                 index.html、main.js（唯一组装处）、flow.js（场景切换）、autopilot.js（测试用假玩家）、record.js（复制试玩记录）
app/scenes/          battle-scene（战斗）、map-scene（整屏路线图）、panel-scene（标题 / 战利品 / 营火 / 行商 / 偶遇 / 界门 / 结算）
modules/shared/      色环常量与关系、数值配置、可重放随机数
modules/content/     数据表：29 张牌、秘术牌、印记、雕琢、怪、8 场遭遇、4 个偶遇、8 套生态色板和摆件位置
modules/battle-rules/ 纯逻辑战斗（不碰 canvas，node 直接测）
modules/run-rules/   纯逻辑一趟：路线图生成、节点流程、成长、行商、偶遇、界门、结算、试玩记录（record.js）
modules/render/      出口 index.js；world-stage.js + camera.js + tilemap-ground.js（无缝大 Tilemap 地面与唯一地标）+ ground-fallback.js（统一世界舞台：像素模型、地面、镜头）、workshop-adapter.js（兼容出口）、battle-pose.js（战斗姿态）、blocks.js（色块备用）、env-ground.js + scene-env.js（生态地面、微粒、摆件）
modules/audio/       音乐、环境声、音效（music-data / synth / bgm / sfx / settings / index）
modules/ui/          弧形手牌、血条盾格倒计时、集色环、按钮、飘字、牌组网格、路线图图标、attack-fx（出手特效）、audio-bar（音乐音效按钮）
tools/serve.js       本地小服务；/art/ 只读映射到 ../../美术/游戏实装美术库/
tools/export-web.js  导出外测包（zip.js 是不依赖第三方的 zip 写入）
tools/test.js        一键测试
```

## 三条工程底线

1. `battle-rules`、`run-rules` 不碰 `document` / `canvas`。
2. 战斗状态是一份纯数据对象；预览 = 深拷贝后空跑同一个 `resolveChain`，跑完丢弃，所以预览和实战不会不一致。
3. 角色和场景摆件只经 `modules/render/` 画；音乐音效只经 `modules/audio/`；两者都只在 `app/` 组装。

## 没做的

不调平衡（用户 2026-11-24 说的）。真音频文件、怪的正式战斗动作美术（现在的姿态和特效是代码做的占位）、取名，都等用户定。
