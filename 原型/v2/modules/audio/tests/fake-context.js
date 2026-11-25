// 一个假的 AudioContext：只记账，不出声。用来在 node 里把音频代码整套跑一遍，抓运行时错误。
class Param {
  constructor() { this.value = 0; this.calls = 0; }
  setValueAtTime(v) { this.value = v; this.calls++; return this; }
  linearRampToValueAtTime(v) { this.value = v; this.calls++; return this; }
  exponentialRampToValueAtTime(v) { if (!(v > 0)) throw new Error('指数渐变的目标必须大于 0'); this.value = v; this.calls++; return this; }
  setTargetAtTime(v) { this.value = v; this.calls++; return this; }
  cancelScheduledValues() { return this; }
}
class Node {
  constructor(ctx, kind) { this.ctx = ctx; this.kind = kind; this.connected = []; this.started = false; ctx.created.push(this); ctx.live++; }
  connect(n) { this.connected.push(n); return n; }
  disconnect() { if (!this.gone) { this.gone = true; this.ctx.live--; } }
  start(t = 0) { if (this.started) throw new Error('start 了两次'); this.started = true; this.startAt = t; this.ctx.starts++; }
  stop(t = 0) { this.stopAt = t; if (this.onended) { const f = this.onended; this.onended = null; f(); } }
}
export class FakeAudioContext {
  constructor() { this.currentTime = 0; this.sampleRate = 8000; this.state = 'suspended'; this.created = []; this.live = 0; this.starts = 0; this.destination = new Node(this, 'destination'); }
  resume() { this.state = 'running'; return Promise.resolve(); }
  createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n), length: n }; }
  createGain() { const n = new Node(this, 'gain'); n.gain = new Param(); return n; }
  createOscillator() { const n = new Node(this, 'osc'); n.frequency = new Param(); n.detune = new Param(); n.type = 'sine'; return n; }
  createBufferSource() { const n = new Node(this, 'src'); n.playbackRate = new Param(); return n; }
  createBiquadFilter() { const n = new Node(this, 'filter'); n.frequency = new Param(); n.Q = new Param(); n.gain = new Param(); n.type = 'lowpass'; return n; }
  createDynamicsCompressor() { const n = new Node(this, 'comp'); for (const k of ['threshold', 'knee', 'ratio', 'attack', 'release']) n[k] = new Param(); return n; }
  decodeAudioData() { return Promise.resolve({ length: 1 }); }
}
