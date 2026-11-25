// 可重放随机数：状态存在对象的 rngState 上（纯数据），深拷贝以后各走各的。
export function nextRand(s) {
  let t = (s.rngState = (s.rngState + 0x6D2B79F5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
export function shuffle(arr, s) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export function gauss(s) {
  const u = Math.max(1e-9, nextRand(s)), v = nextRand(s);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
