// 音乐和音效的开关与音量，记在浏览器 localStorage 里。纯函数，storage 可以换成假的来测。
export const STORE_KEY = 'code00-v2-audio';
export const DEFAULTS = Object.freeze({ music: { on: true, vol: 0.6 }, sfx: { on: true, vol: 0.8 } });

const clamp01 = v => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
export function normalize(raw) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const one = (k) => ({ on: typeof r[k]?.on === 'boolean' ? r[k].on : DEFAULTS[k].on, vol: r[k] && 'vol' in r[k] ? clamp01(Number(r[k].vol)) : DEFAULTS[k].vol });
  return { music: one('music'), sfx: one('sfx') };
}
export function loadSettings(storage) {
  try { return normalize(JSON.parse(storage?.getItem(STORE_KEY) || 'null')); } catch { return normalize(null); }
}
export function saveSettings(storage, s) {
  try { storage?.setItem(STORE_KEY, JSON.stringify(s)); } catch { /* 隐私模式写不进去，不管 */ }
}
// 滑条的音量走平方曲线，低音量处调得更细
export const volumeGain = (on, vol) => (on ? vol * vol : 0);
