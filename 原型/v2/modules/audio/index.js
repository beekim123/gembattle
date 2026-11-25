// 音频出口：玩法和界面只认 audio.scene() 和 audio.sfx()，不碰 Web Audio。
//   audio.unlock()                         第一次点击 / 拖牌 / 按键时调（浏览器规矩：没交互以前不许出声，前面的调用都静默不报错）
//   audio.scene('explore'|'battle'|'tense'|'result', { biome, variant, intensity })   换背景音乐和环境音（0.6 秒淡入淡出）
//   audio.intensity(n)                     强敌战里紧迫档位（首领第 3 条血给 1：提速并叠一层高频节拍）
//   audio.sfx(name, arg)                   10 种短音效里的一种；chain 的 arg 是这是链里第几张（从 0 数）
//   audio.getState() / setOn(kind, on) / setVolume(kind, v)   kind 是 'music' 或 'sfx'，设置记在 localStorage
// 以后换成真人录的 .ogg / .mp3：audio.loadSamples({ bgm: { battle: 'x.ogg' }, sfx: { hit: 'y.ogg' } })，有就放录的、没有就放合成的。
import { makeNoise } from './synth.js';
import { createBgm, createAmbience } from './bgm.js';
import { createSfx } from './sfx.js';
import { ambienceFor } from './music-data.js';
import { loadSettings, saveSettings, volumeGain } from './settings.js';

export { makeThrottle, SFX_NAMES } from './sfx.js';
export { chainPitch, ambienceFor, TRACKS } from './music-data.js';

export function createAudio({
  AudioCtx = globalThis.AudioContext || globalThis.webkitAudioContext,
  storage = globalThis.localStorage,
  timer = { set: (...a) => globalThis.setInterval(...a), clear: id => globalThis.clearInterval(id) },
} = {}) {
  let settings = loadSettings(storage);
  let ctx = null, g = null, bgm = null, amb = null, sfx = null, timerId = null, comp = null;
  let want = null;                                           // 想放什么（还没解锁时先记着）
  let pendingSamples = null;

  const applyVolumes = () => {
    if (!ctx) return;
    const t = ctx.currentTime;
    g.music.gain.setTargetAtTime(volumeGain(settings.music.on, settings.music.vol) * 1.4, t, 0.05);
    g.sfx.gain.setTargetAtTime(volumeGain(settings.sfx.on, settings.sfx.vol) * 0.9, t, 0.05);
  };
  const apply = () => {
    if (!ctx || !want) return;
    bgm.start(want.scene, want.opts);
    amb.set(ambienceFor(want.scene, want.opts.biome));
  };

  const api = {
    get supported() { return !!AudioCtx; },
    get unlocked() { return !!ctx && ctx.state !== 'suspended'; },
    unlock() {
      if (!AudioCtx) return false;
      if (!ctx) {
        ctx = new AudioCtx();
        const master = ctx.createGain(); master.gain.setValueAtTime(0.9, ctx.currentTime);
        comp = ctx.createDynamicsCompressor();             // 总出口压一道，长链万发也不破音
        comp.threshold.setValueAtTime(-16, ctx.currentTime); comp.knee.setValueAtTime(24, ctx.currentTime);
        comp.ratio.setValueAtTime(6, ctx.currentTime); comp.attack.setValueAtTime(0.004, ctx.currentTime); comp.release.setValueAtTime(0.2, ctx.currentTime);
        master.connect(comp); comp.connect(ctx.destination);
        g = { master, music: ctx.createGain(), sfx: ctx.createGain(), amb: ctx.createGain() };
        g.music.connect(master); g.sfx.connect(master); g.amb.connect(g.music);
        g.amb.gain.setValueAtTime(0.7, ctx.currentTime);        // 环境音挂在音乐总线上，再压低一档
        const noiseBuf = makeNoise(ctx, 2);
        bgm = createBgm(ctx, g.music, noiseBuf);
        amb = createAmbience(ctx, g.amb, noiseBuf);
        sfx = createSfx(ctx, g.sfx, noiseBuf);
        applyVolumes();
        timerId = timer.set(() => { bgm.tick(); amb.tick(); }, 25);
        if (pendingSamples) { const p = pendingSamples; pendingSamples = null; api.loadSamples(p); }
      }
      if (ctx.state === 'suspended' && ctx.resume) ctx.resume();
      apply();
      return true;
    },
    scene(scene, opts = {}) { want = { scene, opts }; apply(); },
    intensity(n) { if (want) want.opts = { ...want.opts, intensity: n }; if (bgm) bgm.setIntensity(n); },
    sfx(name, arg) { if (!ctx || !settings.sfx.on || ctx.state === 'suspended') return false; return sfx.play(name, arg); },
    getState() { return { music: { ...settings.music }, sfx: { ...settings.sfx }, unlocked: api.unlocked, supported: api.supported }; },
    setOn(kind, on) { settings[kind].on = !!on; saveSettings(storage, settings); applyVolumes(); },
    toggle(kind) { api.setOn(kind, !settings[kind].on); },
    setVolume(kind, v) { settings[kind].vol = Math.max(0, Math.min(1, v)); if (v > 0 && !settings[kind].on) settings[kind].on = true; saveSettings(storage, settings); applyVolumes(); },
    // 预留接口：以后用录好的 .ogg / .mp3 替换合成的声音
    async loadSamples(manifest, fetchFn = globalThis.fetch) {
      if (!ctx) { pendingSamples = manifest; return; }
      const load = async url => ctx.decodeAudioData(await (await fetchFn(url)).arrayBuffer());
      for (const [id, url] of Object.entries(manifest.bgm || {})) bgm.samples.set(id, await load(url));
      for (const [id, url] of Object.entries(manifest.sfx || {})) sfx.samples.set(id, await load(url));
    },
    // 只给测试用
    _tick() { if (bgm) { bgm.tick(); amb.tick(); } },
    get _ctx() { return ctx; },
    // 测试用：在总出口（压缩器后面）接一个分析器，量实际输出的电平
    _tap() { const an = ctx.createAnalyser(); an.fftSize = 2048; comp.connect(an); return an; },
    get _ambience() { return amb ? amb.kind : null; },
    get _track() { return bgm && bgm.current ? bgm.current.id : null; },
  };
  return api;
}

export const audio = createAudio();
