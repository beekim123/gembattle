# code00 v2 原型（第 1 步：核心战斗）

照 `设计/重制开发方案-第一到第三步.md` 第一、二节做的全新独立原型。浏览器里跑：原生 JS（ES 模块）+ Canvas 2D，零依赖、零构建。

## 怎么玩

Mac 上双击 `启动.command`（会开本地小服务并自动打开浏览器），或者：

```bash
node tools/serve.js --open
```

然后打开 `http://localhost:8200/app/index.html`。网址后面可加 `?seed=数字` 固定随机种子。

连打 4 仗，心和宝石等级跨战保留。心耗尽点「重新开始」；左上角随时能「重开」。

操作：
- 把手里的牌**拖**进链里（只能接在链尾；链里的牌不能拖、不能改顺序）。
- 「退回一张」（退格键）、「清空」（Esc）撤销；「施法」（空格）打出整条链；链空着时这个键变成「过回合」。
- 点怪切换目标；鼠标放到怪上看详情；「查看牌组」看 29 张的去向。

## 怎么测

```bash
node tools/test.js
```

跑 `modules/` 里全部 `*.test.js`（色环、断色、合白、彩虹、跨回合、破盾、留牌上限、宝石等级、预览与实战一致、四场仗配置、禁用字扫描）。

## 目录

```
app/                 index.html、main.js（唯一组装处）、scenes/battle-scene.js
modules/shared/      色环常量与关系、数值配置、可重放随机数
modules/content/     数据表：29 张牌、怪、4 场仗、2 个生态色板
modules/battle-rules/ 纯逻辑战斗（不碰 canvas，node 直接测）
modules/render/      色块角色（blocks.js）+ 生态地面与微粒（scene-env.js）
modules/ui/          弧形手牌、血条盾格倒计时、集色环、按钮、飘字
tools/serve.js       本地小服务；/art/ 只读映射到 ../../美术/像素堆叠生物工坊/
tools/test.js        一键测试
```

## 三条工程底线

1. `battle-rules` 不碰 `document` / `canvas`。
2. 战斗状态是一份纯数据对象；预览 = 深拷贝后空跑同一个 `resolveChain`，跑完丢弃，所以预览和实战不会不一致。
3. 角色和场景摆件只经 `modules/render/` 画，第 3 步换工坊的 3D 像素模型只改这里。

## 这一步没做的

路线图、秘术牌、秘宝印记、音效、工坊 3D 模型接入（第 2、3 步）。不调平衡（用户 2026-11-24 说的）。
