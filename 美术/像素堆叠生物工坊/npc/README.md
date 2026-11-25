# NPC

一个 NPC 一个脚本，放在这个目录。写法跟怪物一样（照 `../creatures/slime.js` 抄结构），只有三处不同：

1. 脚本末尾用 `PixelWorkshop.Assets.register(Def, 'npc')` 登记，不用 `PW.Creatures.push`；
2. `../index.html` 里「NPC」那段加一行 `<script src="npc/xxx.js"></script>`；
3. 文件名、id 用 `npc_` 开头，比如 `npc_xxx.js`（NPC 没有制作清单编号，`code` 可以不写）。

工坊左栏「NPC」页会自动列出来，点一下放上台。

## 要注意的

- **动作**：NPC 的展示动作写在 `actions` 里（默认有「自由巡游」「原地待机」）。对话、交易、指路这类以后要在游戏里放的动作，一个一条，`loop: false` 加 `duration`。脚本 `update()` 从 `eco.action` / `eco.actionTime` 读。
- **人形**：两条腿走路用 `PW.Solvers` 的两段 IK（照 `../creatures/goblin.js`），手臂拆大臂、小臂两段，小臂滞后一点（见 `../文档/骨骼化改造交接与经验.md` 第三节第 3 条）。
- **换色**：有几套衣服就写 `skins`；没有就不写，右栏的「换色」会自己藏起来。
- **性能规矩**跟怪一样，见 `../README.md`「画质和性能的规矩」。
- **酒馆 NPC 制作清单与同步生成提示词**：见 `../文档/酒馆NPC与生态场景制作清单.md` 与 `../文档/提示词-酒馆NPC/README.md`（含酒馆地台、建筑家具及全部 12 位酒馆 NPC，共 6 档可直接并行开跑）。
