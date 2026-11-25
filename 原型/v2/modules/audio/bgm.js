// 背景音乐的调度器和环境音。纯 Web Audio：每 25 毫秒醒一次，把接下来 0.18 秒内的音符提前排进去。
// 换曲 0.6 秒淡出淡入，绝不生硬切断。
import { TRACKS, stepSeconds, resultPhrase, RESULT_SECONDS } from './music-data.js';
import { VOICES, noise, tone } from './synth.js';

export const FADE = 0.6;
const LOOKAHEAD = 0.18;

export function createBgm(ctx, dest, noiseBuf) {
  const tracks = new Set();
  let current = null;
  const samples = new Map();            // 预留：曲目 id → AudioBuffer（以后换成录好的 .ogg / .mp3）

  function fadeOut(tr, now, sec = FADE) {
    tr.stopping = true; tr.stopAt = now + sec + 0.15;
    try { tr.gain.gain.cancelScheduledValues(now); tr.gain.gain.setTargetAtTime(0, now, sec / 4); } catch { /* 已经停了 */ }
    if (tr.src) { try { tr.src.stop(now + sec + 0.1); } catch { /* 同上 */ } }
  }

  // id：explore | battle | tense | result；variant：result 的 win | lose；intensity：tense 的紧迫档（首领第 3 条血给 1）
  function start(id, { variant = 'win', intensity = 0 } = {}) {
    const now = ctx.currentTime;
    if (current && current.id === id && !current.once && !current.stopping) { current.intensity = intensity; return current; }
    if (current) fadeOut(current, now);
    const gain = ctx.createGain();
    const once = id === 'result';
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(1, now + (once ? 0.05 : FADE));
    gain.connect(dest);
    const tr = { id, variant, gain, once, bar: 0, step: 0, nextT: now + 0.06, intensity, stopping: false, stopAt: 0, src: null };
    if (samples.has(id)) {                                   // 有录好的就放录好的（循环）
      const s = ctx.createBufferSource(); s.buffer = samples.get(id); s.loop = !once; s.connect(gain); s.start(now + 0.02); tr.src = s;
      tr.sample = true; if (once) tr.stopAt = now + RESULT_SECONDS + 0.8;
    } else if (once) {
      for (const e of resultPhrase(variant)) {
        const v = VOICES[e.v]; if (!v) continue;
        v(ctx, gain, noiseBuf, now + 0.06 + e.at, { f: e.f, g: e.g, d: Math.max(1, Math.round(e.dur / 0.12)) }, 0.12);
      }
      tr.stopAt = now + RESULT_SECONDS + 0.8;
    }
    tracks.add(tr); current = tr;
    return tr;
  }

  function stop(sec = FADE) { if (current) { fadeOut(current, ctx.currentTime, sec); current = null; } }
  function setIntensity(n) { if (current && !current.once) current.intensity = n; }

  function tick() {
    const now = ctx.currentTime;
    for (const tr of [...tracks]) {
      if (tr.stopAt && now >= tr.stopAt) { try { tr.gain.disconnect(); } catch { /* 已断 */ } tracks.delete(tr); if (current === tr) current = null; continue; }
      if (tr.stopping || tr.once || tr.sample) continue;
      const def = TRACKS[tr.id]; if (!def) continue;
      const sec = stepSeconds(def.bpm, 1 + (def.tempoPerIntensity || 0) * tr.intensity);
      if (tr.nextT < now - 0.25) tr.nextT = now + 0.05;      // 页面在后台睡过头了：重新对表，别一口气补一大串
      while (tr.nextT < now + LOOKAHEAD) {
        for (const e of def.events(tr.bar, tr.step, tr.intensity)) { const v = VOICES[e.v]; if (v) v(ctx, tr.gain, noiseBuf, tr.nextT, e, sec); }
        tr.nextT += sec; tr.step++;
        if (tr.step >= 16) { tr.step = 0; tr.bar = (tr.bar + 1) % def.bars; }
      }
    }
  }
  return { start, stop, setIntensity, tick, samples, get current() { return current; } };
}

// ---------- 环境音：林风 / 泥泽水滴与泡 / 营火噼啪；比背景音乐低很多 ----------
export function createAmbience(ctx, dest, noiseBuf) {
  let cur = null;
  const dead = new Set();

  function loopNoise() { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }
  function build(kind) {
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(1, now + FADE); gain.connect(dest);
    const a = { kind, gain, srcs: [], next: now + 0.4 };
    const bed = (type, freq, q, level) => {
      const s = loopNoise(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = type; f.frequency.setValueAtTime(freq, now); f.Q.setValueAtTime(q, now); g.gain.setValueAtTime(level, now);
      s.connect(f); f.connect(g); g.connect(gain); s.start(now, Math.random()); a.srcs.push(s);
      return { f, g };
    };
    const lfo = (param, rate, depth) => {
      const o = ctx.createOscillator(), d = ctx.createGain();
      o.frequency.setValueAtTime(rate, now); d.gain.setValueAtTime(depth, now); o.connect(d); d.connect(param); o.start(now); a.srcs.push(o);
    };
    if (kind === 'wind') { const w = bed('bandpass', 420, 0.5, 0.05); lfo(w.f.frequency, 0.11, 160); lfo(w.g.gain, 0.07, 0.025); }
    else if (kind === 'fire') { bed('lowpass', 170, 0.7, 0.05); }
    else if (kind === 'drip') { bed('lowpass', 260, 0.6, 0.012); }
    return a;
  }
  function set(kind) {
    if ((cur ? cur.kind : null) === kind) return;
    const now = ctx.currentTime;
    if (cur) {
      try { cur.gain.gain.cancelScheduledValues(now); cur.gain.gain.setTargetAtTime(0, now, FADE / 4); } catch { /* 已停 */ }
      cur.stopAt = now + FADE + 0.2; dead.add(cur);
    }
    cur = kind ? build(kind) : null;
  }
  function tick() {
    const now = ctx.currentTime;
    for (const d of [...dead]) if (now >= d.stopAt) { for (const s of d.srcs) { try { s.stop(); } catch { /* 已停 */ } } try { d.gain.disconnect(); } catch { /* 已断 */ } dead.delete(d); }
    if (!cur) return;
    if (cur.next < now - 0.5) cur.next = now + 0.1;
    while (cur.next < now + LOOKAHEAD) {
      const t = cur.next;
      if (cur.kind === 'drip') {
        if (Math.random() < 0.7) { const f = 900 + Math.random() * 700; tone(ctx, cur.gain, { t, freq: f, endFreq: f * 1.7, dur: 0.07, gain: 0.05, attack: 0.002 }); }
        else { tone(ctx, cur.gain, { t, freq: 210, endFreq: 380, dur: 0.14, gain: 0.07, attack: 0.004, lp: 900 }); noise(ctx, cur.gain, noiseBuf, { t, dur: 0.1, gain: 0.02, type: 'lowpass', freq: 600 }); }
        cur.next += 0.5 + Math.random() * 1.7;
      } else if (cur.kind === 'fire') {
        noise(ctx, cur.gain, noiseBuf, { t, dur: 0.015 + Math.random() * 0.04, gain: 0.025 + Math.random() * 0.06, type: 'highpass', freq: 2200 + Math.random() * 2600, q: 0.8 });
        if (Math.random() < 0.08) tone(ctx, cur.gain, { t, freq: 1400 + Math.random() * 800, endFreq: 500, dur: 0.04, gain: 0.04, type: 'square', lp: 3000 });
        cur.next += 0.04 + Math.random() * 0.14;
      } else cur.next += 1;                                     // 林风是连续的，不用排事件
    }
  }
  return { set, tick, get kind() { return cur ? cur.kind : null; } };
}
