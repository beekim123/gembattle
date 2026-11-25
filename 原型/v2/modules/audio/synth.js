// 零依赖 Web Audio 合成零件：每个函数在时刻 t 往 dest 里发一个声音，自己安排好起止，放完自动断开。
// 不依赖任何外部素材；以后换成真人录的 .ogg / .mp3，只改 modules/audio/，玩法代码一行不动。

export function makeNoise(ctx, seconds = 2) {
  const n = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

const EPS = 0.0001;
function done(node, ...more) { node.onended = () => { try { node.disconnect(); for (const m of more) m.disconnect(); } catch { /* 已经断开 */ } }; }

// 单个音：freq 起始频率，endFreq 滑到哪，attack 起音，hold 为 true 时先保持再收尾（长音垫底）
export function tone(ctx, dest, { t, freq, dur, type = 'sine', gain = 0.1, attack = 0.004, endFreq = 0, lp = 0, hold = false, release = 0.25, detune = 0 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(Math.max(20, freq), t);
  if (endFreq) o.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
  if (detune) o.detune.setValueAtTime(detune, t);
  let f = null;
  if (lp) { f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(lp, t); o.connect(f); f.connect(g); } else o.connect(g);
  g.gain.setValueAtTime(EPS, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  if (hold) { g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release)); g.gain.exponentialRampToValueAtTime(EPS, t + dur); }
  else g.gain.exponentialRampToValueAtTime(EPS, t + dur);
  g.connect(dest);
  o.start(t); o.stop(t + dur + 0.05);
  done(o, g, ...(f ? [f] : []));
}

// 一声噪音：type 滤波种类，freq 中心频率，endFreq 滑到哪
export function noise(ctx, dest, buf, { t, dur, gain = 0.1, type = 'bandpass', freq = 2000, endFreq = 0, q = 1, attack = 0.003 }) {
  const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = buf; s.loop = true;
  f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.setValueAtTime(q, t);
  if (endFreq) f.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t + dur);
  g.gain.setValueAtTime(EPS, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(EPS, t + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  done(s, f, g);
}

// ---------- 乐器：把 music-data 里的 { v, f, d, g } 变成声音 ----------
// sec：一个十六分音符多少秒。返回时不用管清理。
export const VOICES = {
  pad(ctx, dest, noiseBuf, t, e, sec) { const dur = e.d * sec; tone(ctx, dest, { t, freq: e.f, dur, type: 'sine', gain: e.g, attack: 0.5, hold: true, release: 0.6, lp: 1400 }); tone(ctx, dest, { t, freq: e.f, dur, type: 'triangle', gain: e.g * 0.5, attack: 0.6, hold: true, release: 0.6, detune: 7, lp: 1200 }); },
  marimba(ctx, dest, noiseBuf, t, e, sec) { tone(ctx, dest, { t, freq: e.f, dur: Math.max(0.35, e.d * sec), type: 'sine', gain: e.g, attack: 0.004 }); tone(ctx, dest, { t, freq: e.f * 4, dur: 0.12, type: 'sine', gain: e.g * 0.18 }); },
  pluck(ctx, dest, noiseBuf, t, e, sec) { const dur = Math.max(0.3, e.d * sec * 1.6); tone(ctx, dest, { t, freq: e.f, dur, type: 'triangle', gain: e.g, attack: 0.003, lp: 3600 }); tone(ctx, dest, { t, freq: e.f * 2, dur: dur * 0.4, type: 'sine', gain: e.g * 0.22 }); },
  bell(ctx, dest, noiseBuf, t, e) { tone(ctx, dest, { t, freq: e.f, dur: e.d * 0.0 + 1.8, type: 'sine', gain: e.g, attack: 0.002 }); tone(ctx, dest, { t, freq: e.f * 2.76, dur: 0.9, type: 'sine', gain: e.g * 0.3 }); },
  bounce(ctx, dest, noiseBuf, t, e, sec) { tone(ctx, dest, { t, freq: e.f, dur: Math.max(0.12, e.d * sec * 0.95), type: 'triangle', gain: e.g, attack: 0.004, lp: 520 }); tone(ctx, dest, { t, freq: e.f * 2, dur: 0.08, type: 'sine', gain: e.g * 0.25 }); },
  lead(ctx, dest, noiseBuf, t, e, sec) { const dur = Math.max(0.14, e.d * sec); tone(ctx, dest, { t, freq: e.f, dur, type: 'triangle', gain: e.g, attack: 0.008, lp: 4200 }); tone(ctx, dest, { t, freq: e.f * 1.005, dur, type: 'square', gain: e.g * 0.22, attack: 0.01, lp: 2600 }); },
  kick(ctx, dest, noiseBuf, t, e) { tone(ctx, dest, { t, freq: 130, endFreq: 42, dur: 0.16, type: 'sine', gain: e.g, attack: 0.002 }); },
  snare(ctx, dest, noiseBuf, t, e) { noise(ctx, dest, noiseBuf, { t, dur: 0.14, gain: e.g, type: 'bandpass', freq: 1900, q: 0.8 }); tone(ctx, dest, { t, freq: 190, endFreq: 120, dur: 0.08, type: 'triangle', gain: e.g * 0.5 }); },
  hat(ctx, dest, noiseBuf, t, e) { noise(ctx, dest, noiseBuf, { t, dur: 0.05, gain: e.g, type: 'highpass', freq: 7000, q: 0.7 }); },
  pulse(ctx, dest, noiseBuf, t, e, sec) { tone(ctx, dest, { t, freq: e.f, dur: Math.max(0.1, e.d * sec * 0.9), type: 'sawtooth', gain: e.g, attack: 0.004, lp: 260 }); tone(ctx, dest, { t, freq: e.f / 2, dur: Math.max(0.1, e.d * sec), type: 'sine', gain: e.g * 0.9 }); },
  stab(ctx, dest, noiseBuf, t, e, sec) { tone(ctx, dest, { t, freq: e.f, dur: Math.max(0.15, e.d * sec), type: 'sawtooth', gain: e.g, attack: 0.01, lp: 1100 }); },
  tick(ctx, dest, noiseBuf, t, e) { tone(ctx, dest, { t, freq: e.f, dur: 0.035, type: 'square', gain: e.g, attack: 0.001, lp: 5000 }); },
};
