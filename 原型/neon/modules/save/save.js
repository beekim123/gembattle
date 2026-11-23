// 存档（设计稿 8.1、10.3）：读写、版本、旧存档升级；统一写入各模块交回的「要改什么」。
// 浏览器和桌面版不一样的地方（存在哪）只在这里：storage 由调用方传进来（浏览器里是 localStorage，单测里是一个 Map）。

export const SAVE_VERSION = 1;
const KEY = 'code00.save';

const clone = (v) => JSON.parse(JSON.stringify(v));

/** 新开一个档 */
export function createDefaultSave() {
  return {
    saveVersion: SAVE_VERSION,
    gold: 120,
    rank: 'C',
    rankDone: 0, // 当前等级做完了几个任务（做够 3 个出升级任务，8.4）
    quests: { board: [], taken: [], failed: [] },
    gear: { owned: [], equipped: { weapon: null, armor: null, trinket: null } },
    unlocks: { buffs: [] },
    hired: [],
    album: { monsters: [], loot: [] },
    runs: 0,
    lastRun: null,
    // 预留：中途存档用（neon 提的），原型不做
    run: null,
  };
}

/** 旧存档升级：缺什么补什么 */
export function migrateSave(raw) {
  const base = createDefaultSave();
  if (!raw || typeof raw !== 'object') return base;
  const out = { ...base, ...clone(raw) };
  out.quests = { ...base.quests, ...(raw.quests || {}) };
  out.gear = { ...base.gear, ...(raw.gear || {}), equipped: { ...base.gear.equipped, ...(raw.gear?.equipped || {}) } };
  out.unlocks = { ...base.unlocks, ...(raw.unlocks || {}) };
  out.album = { ...base.album, ...(raw.album || {}) };
  out.saveVersion = SAVE_VERSION;
  return out;
}

/**
 * 存档仓库。
 * @param {{ getItem(k): string|null, setItem(k, v): void, removeItem?(k): void }} storage
 */
export function createSaveStore(storage) {
  let current = null;

  function load() {
    let raw = null;
    try {
      const text = storage?.getItem(KEY);
      raw = text ? JSON.parse(text) : null;
    } catch {
      raw = null;
    }
    current = migrateSave(raw);
    return clone(current);
  }

  function write() {
    try {
      storage?.setItem(KEY, JSON.stringify(current));
    } catch {
      // 存不下就算了（原型）
    }
  }

  return {
    load,
    get: () => clone(current || load()),
    /** 整份换掉（结算函数给的新存档） */
    replace(next) {
      current = migrateSave(next);
      write();
      return clone(current);
    },
    /** 交回「要改什么」：一个函数，拿到旧存档的拷贝，返回新存档 */
    apply(change) {
      const next = change(clone(current || load()));
      current = migrateSave(next);
      write();
      return clone(current);
    },
    reset() {
      current = createDefaultSave();
      write();
      return clone(current);
    },
  };
}
