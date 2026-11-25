# 游戏实装美术库（code00 · 落果密林）

本目录是 **code00 游戏实装专库**，只存放确认进游戏、按回合制标准验收通过的正式美术资产，与全量研发母库 `美术/像素堆叠生物工坊/` 职责分离。

## 与总工坊的分工

- **`美术/像素堆叠生物工坊/`（全量总资产母库）**：唯一源码真源，存放所有研发中的怪物、NPC、生态摆件、建筑与实验资产。
- **`美术/游戏实装美术库/`（游戏实装专库）**：只放确认进游戏的 31 个现役资产、外派 UI 包收口目录 `art-packs/`、单向同步脚本与独立展示验收页 `index.html`。

> **双库交付铁律**：以后凡是新增或修改美术资产（含怪物、NPC、场景、建筑、UI 外派包），一律先交总工坊；只要游戏里用到了，再通过 `tools/sync-from-workshop.js`（或同步进 `art-packs/`）单向同步进本目录，绝不两边手工各改一份。按 `CLAUDE.md` 规范，`美术/` 目录不提交 git。

## 当前已登记实装资产（共 31 个）

- **内核（6）**：`core/math.js`、`voxel.js`、`solvers.js`、`behaviors.js`、`renderer.js`、`registry.js`
- **地貌色板（1）**：`scenes/habitats.js`
- **主角与 NPC（2）**：`npc/npc_mage.js`、`npc/npc_gear_smith.js`
- **落果密林怪物（8）**：`slime.js`、`earth2_barometz.js`、`goblin.js`、`fairy.js`、`earth6_long_arm.js`、`earth3_zheng.js`、`earth1_belly_maw.js`、`tree3_leshy.js`
- **生态摆件与建筑（14）**：11 个生态摆件（`scenes/`）+ 3 个建筑（`buildings/`）

## 同步与预览

1. **单向同步**：运行 `node 美术/游戏实装美术库/tools/sync-from-workshop.js`（加 `--check` 仅校验一致性）。
2. **预览验收**：双击 `启动预览.command` 或直接在本目录启动本地静态服务后访问 `index.html`，支持顶部一键切换「图鉴待机」与「回合制对阵演练」。
