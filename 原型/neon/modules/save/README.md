# modules/save

## 管什么

存档读写、版本、旧存档升级（设计稿 8.1、10.3）。大厅各模块不直接改存档，只交回「要改什么」，由这里统一写。

浏览器和桌面版不一样的地方（存在哪）只放在这里：`storage` 由调用方传进来。原型在浏览器里用 `localStorage`；以后 Electron 换成存文件，只改调用的地方传什么。

## 对外接口（`index.js`）

- `createDefaultSave()`：新档（金币 120、C 级、没装备、没任务）。
- `migrateSave(raw)`：旧存档缺什么补什么。
- `createSaveStore(storage)` → `load()`、`get()`、`replace(next)`、`apply(change)`、`reset()`。

## 存档里有什么

`gold`、`rank`（C/B/…）、`rankDone`、`quests { board, taken, failed }`、`gear { owned: [{id, wear}], equipped }`、`unlocks { buffs }`、`hired`、`album { monsters, loot }`、`runs`、`lastRun`、`run`（预留给中途存档，原型不用）。

## 单独运行与测试

- `node --test modules/save/test/save.test.js`
