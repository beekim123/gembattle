// 十种短音效（方案 4.4）。全是合成的；每一种只发几个音，放完自动清理。
// 命中音走节流：长链、高发数时一秒钟里也只放有限的几下，音量还会随密度往下压，绝不破音。
import { tone, noise } from './synth.js';
import { chainPitch, note } from './music-data.js';

// 节流器：minGap 相邻两下最短间隔，windowSec 内最多 maxPer 下；返回这一下的音量倍数（0 = 不放）
export function makeThrottle({ minGap = 0.045, windowSec = 0.5, maxPer = 7 } = {}) {
  const recent = [];
  return function allow(now) {
    while (recent.length && now - recent[0] > windowSec) recent.shift();
    if (recent.length && now - recent[recent.length - 1] < minGap) return 0;
    if (recent.length >= maxPer) return 0;
    const g = 1 / (1 + 0.28 * recent.length);
    recent.push(now);
    return g;
  };
}

export const SFX_NAMES = ['click', 'card', 'chain', 'cut', 'white', 'rainbow', 'hit', 'break', 'hurt', 'reward'];

export function createSfx(ctx, dest, noiseBuf) {
  const hitGate = makeThrottle();
  const voices = [];                                   // 正在响的音效的结束时刻，用来封顶同时发声数
  const samples = new Map();                           // 预留：音效名 → AudioBuffer
  const T = () => ctx.currentTime + 0.005;

  const bank = {
    // ① 选路线 / 点按钮：清脆木键
    click(t) { tone(ctx, dest, { t, freq: 560, endFreq: 300, dur: 0.07, gain: 0.16, type: 'triangle' }); noise(ctx, dest, noiseBuf, { t, dur: 0.03, gain: 0.08, freq: 1800, q: 1.2 }); return 0.1; },
    // ② 拖牌 / 退回：轻柔纸牌摩擦
    card(t) { noise(ctx, dest, noiseBuf, { t, dur: 0.11, gain: 0.07, freq: 3200, endFreq: 1500, q: 0.9, attack: 0.02 }); return 0.12; },
    // ③ 接色成功：清脆升调，链越长音越高（Do Re Mi Sol La 高 Do）
    chain(t, n = 0) { const f = chainPitch(n); tone(ctx, dest, { t, freq: f, dur: 0.28, gain: 0.15, type: 'triangle', lp: 4500 }); tone(ctx, dest, { t, freq: f * 2, dur: 0.12, gain: 0.04 }); return 0.3; },
    // ④ 断色：低沉顿挫
    cut(t) { tone(ctx, dest, { t, freq: 170, endFreq: 80, dur: 0.22, gain: 0.22, type: 'sine' }); tone(ctx, dest, { t, freq: 110, dur: 0.16, gain: 0.07, type: 'sawtooth', lp: 320 }); return 0.25; },
    // ⑤ 补色合白：厚重和弦爆发
    white(t) {
      for (const n of ['C3', 'G3', 'C4', 'E4', 'G4']) tone(ctx, dest, { t, freq: note(n), dur: 0.9, gain: 0.09, type: 'triangle', lp: 3200, attack: 0.01 });
      tone(ctx, dest, { t, freq: 62, endFreq: 40, dur: 0.5, gain: 0.26 });
      noise(ctx, dest, noiseBuf, { t, dur: 0.5, gain: 0.07, type: 'lowpass', freq: 5000, endFreq: 600, attack: 0.01 });
      return 1;
    },
    // ⑥ 集齐六色彩虹：七个音的琶音连响
    rainbow(t) {
      ['C5', 'D5', 'E5', 'F#5', 'G5', 'A5', 'B5'].forEach((n, i) => tone(ctx, dest, { t: t + i * 0.075, freq: note(n), dur: 0.5, gain: 0.11, type: 'triangle', lp: 5000 }));
      for (const n of ['C5', 'E5', 'G5', 'C6']) tone(ctx, dest, { t: t + 0.56, freq: note(n), dur: 0.9, gain: 0.07 });
      return 1.5;
    },
    // ⑦ 宝石命中：短促击打（节流）
    hit(t, arg = 0) {
      const g = hitGate(ctx.currentTime); if (!g) return 0;
      const f = 300 + (arg % 5) * 28;
      tone(ctx, dest, { t, freq: f, endFreq: 120, dur: 0.07, gain: 0.17 * g, type: 'triangle' });
      noise(ctx, dest, noiseBuf, { t, dur: 0.025, gain: 0.07 * g, freq: 2600, q: 1 });
      return 0.1;
    },
    // ⑧ 破盾：清脆碎裂
    break(t) {
      noise(ctx, dest, noiseBuf, { t, dur: 0.26, gain: 0.13, type: 'highpass', freq: 3200, q: 0.8 });
      [2093, 2637, 3136, 3951].forEach((f, i) => tone(ctx, dest, { t: t + i * 0.012, freq: f, endFreq: f * 0.8, dur: 0.22, gain: 0.05 }));
      tone(ctx, dest, { t, freq: 240, endFreq: 90, dur: 0.12, gain: 0.12, type: 'triangle' });
      return 0.35;
    },
    // ⑨ 敌方出手、主角扣心：闷击警示
    hurt(t) {
      tone(ctx, dest, { t, freq: 120, endFreq: 48, dur: 0.34, gain: 0.3 });
      noise(ctx, dest, noiseBuf, { t, dur: 0.18, gain: 0.1, type: 'lowpass', freq: 800, endFreq: 200 });
      tone(ctx, dest, { t: t + 0.05, freq: 233, dur: 0.22, gain: 0.05, type: 'sawtooth', lp: 500 });
      return 0.4;
    },
    // ⑩ 得印记 / 雕琢升级：明快提示
    reward(t) {
      ['E5', 'G5', 'C6'].forEach((n, i) => tone(ctx, dest, { t: t + i * 0.085, freq: note(n), dur: 0.42, gain: 0.12, type: 'triangle', lp: 6000 }));
      tone(ctx, dest, { t: t + 0.26, freq: note('E6'), dur: 0.6, gain: 0.07 });
      return 0.9;
    },
  };

  function play(name, arg) {
    const now = ctx.currentTime;
    while (voices.length && voices[0] <= now) voices.shift();
    if (voices.length >= 20) return false;               // 同时发声封顶，免得叠到破音
    if (samples.has(name)) { const s = ctx.createBufferSource(); s.buffer = samples.get(name); s.connect(dest); s.start(); return true; }
    const f = bank[name]; if (!f) return false;
    const len = f(T(), arg);
    if (!len) return false;
    voices.push(now + len); voices.sort((a, b) => a - b);
    return true;
  }
  return { play, samples, names: SFX_NAMES };
}
