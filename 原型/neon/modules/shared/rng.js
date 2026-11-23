// 可指定种子的确定性伪随机数（Mulberry32 + FNV-1a 种子归一化）。
// 不依赖 Math.random，确保单测、模拟器与战斗回放完全一致。

function hashSeed(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) {
    return (Math.trunc(seed) >>> 0) || 0x9e3779b9;
  }
  if (typeof seed === 'string' && seed.length > 0) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h || 0x9e3779b9;
  }
  throw new TypeError('随机数种子必须是有限数字或非空字符串');
}

/**
 * 创建一个可复现的随机数生成器。
 * @param {number | string} seed 随机数种子
 */
export function createRng(seed) {
  let state = hashSeed(seed);
  const initialSeed = seed;

  /** 返回 [0, 1) 的均匀分布浮点数 */
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** 返回 [min, max] 含两端的随机整数 */
  function int(min, max) {
    if (!Number.isInteger(min) || !Number.isInteger(max) || max < min) {
      throw new RangeError('int(min, max) 需要整数且 max >= min');
    }
    return min + Math.floor(next() * (max - min + 1));
  }

  /** 按概率 p（0~1）返回布尔值 */
  function chance(p) {
    if (typeof p !== 'number' || Number.isNaN(p)) {
      throw new TypeError('chance(p) 需要有效数字');
    }
    if (p <= 0) return false;
    if (p >= 1) return true;
    return next() < p;
  }

  /** 从非空数组中随机挑选一个元素 */
  function pick(list) {
    if (!Array.isArray(list) || list.length === 0) {
      throw new RangeError('pick(list) 需要非空数组');
    }
    return list[Math.floor(next() * list.length)];
  }

  /** 返回洗乱后的新数组（不修改原数组） */
  function shuffle(list) {
    if (!Array.isArray(list)) {
      throw new TypeError('shuffle(list) 需要数组');
    }
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  /** 导出当前内部 32 位状态，用于断点复现 */
  function getState() {
    return state >>> 0;
  }

  /** 恢复内部 32 位状态 */
  function setState(nextState) {
    if (!Number.isInteger(nextState) || nextState < 0 || nextState > 0xffffffff) {
      throw new RangeError('状态必须是 0 到 4294967295 的整数');
    }
    state = nextState >>> 0;
  }

  /** 派生一个独立子随机流，不干扰原流 */
  function fork(salt) {
    const derived = hashSeed(`${initialSeed}:${state}:${String(salt ?? '')}`);
    return createRng(derived);
  }

  return {
    seed: initialSeed,
    next,
    int,
    chance,
    pick,
    shuffle,
    getState,
    setState,
    fork,
  };
}
