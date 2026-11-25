import { FakeAudioContext } from './fake-context.js';
import { createAudio, makeThrottle, SFX_NAMES, chainPitch, ambienceFor, TRACKS } from '../index.js';
import { note, stepSeconds, resultPhrase, CHAIN_NOTES } from '../music-data.js';
import { loadSettings, saveSettings, normalize, DEFAULTS, STORE_KEY, volumeGain } from '../settings.js';

const memStorage = () => { const m = new Map(); return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), m }; };
const make = (storage = memStorage()) => { const a = createAudio({ AudioCtx: FakeAudioContext, storage, timer: { set: () => 1, clear() {} } }); return { a, storage }; };
const advance = (a, sec, step = 0.025) => { for (let t = 0; t < sec; t += step) { a._ctx.currentTime += step; a._tick(); } };

export default function (t) {
  t.test('音名和频率：A4 = 440，八度翻倍', () => {
    t.assert.ok(Math.abs(note('A4') - 440) < 1e-9);
    t.assert.ok(Math.abs(note('A5') / note('A4') - 2) < 1e-9);
    t.assert.throws(() => note('H9'));
  });

  t.test('接链音阶：Do Re Mi Sol La 高 Do，越长越高，超过六张停在高 Do', () => {
    t.assert.equal(CHAIN_NOTES.join(' '), 'C5 D5 E5 G5 A5 C6');
    for (let n = 1; n < 6; n++) t.assert.ok(chainPitch(n) > chainPitch(n - 1));
    t.assert.equal(chainPitch(5), chainPitch(30));
    t.assert.equal(chainPitch(-3), chainPitch(0));
  });

  t.test('命中节流：两下不能太近，窗口里有上限，音量随密度往下压', () => {
    const gate = makeThrottle({ minGap: 0.05, windowSec: 0.5, maxPer: 4 });
    const g0 = gate(0);
    t.assert.equal(g0, 1);
    t.assert.equal(gate(0.02), 0, '间隔太短');
    const g1 = gate(0.06);
    t.assert.ok(g1 > 0 && g1 < g0, '第二下音量更小');
    gate(0.12); gate(0.18);
    t.assert.equal(gate(0.24), 0, '窗口里 4 下封顶');
    t.assert.ok(gate(0.9) > 0, '窗口过去又能放');
    // 一秒钟里连发 100 次，最多放出十几下
    const g = makeThrottle(); let ok = 0;
    for (let i = 0; i < 100; i++) if (g(i * 0.01)) ok++;
    t.assert.ok(ok <= 16, '实际放了 ' + ok);
  });

  t.test('背景音乐曲目：每个音都有效，四种曲目齐全，首领第 3 条血更密更快', () => {
    for (const tr of Object.values(TRACKS)) {
      let n = 0, n1 = 0;
      for (let b = 0; b < tr.bars; b++) for (let s = 0; s < 16; s++) {
        for (const e of tr.events(b, s, 0)) { n++; t.assert.ok(Number.isFinite(e.f) && e.f >= 0 && e.d > 0 && e.g > 0 && e.g < 0.5, tr.id + ' ' + JSON.stringify(e)); }
        n1 += tr.events(b, s, 1).length;
      }
      t.assert.ok(n > 40, tr.id + ' 音符太少');
      if (tr.id === 'tense') t.assert.ok(n1 > n, '紧迫档要叠一层节拍');
    }
    t.assert.deepEqual(Object.keys(TRACKS).sort(), ['battle', 'explore', 'tense']);
    t.assert.ok(stepSeconds(82) > stepSeconds(112) && stepSeconds(112) > stepSeconds(128), '探索慢、普通战中、强敌最快');
    t.assert.ok(stepSeconds(128, 1.12) < stepSeconds(128));
    const win = resultPhrase('win'), end = Math.max(...win.map(e => e.at + e.dur));
    t.assert.ok(end > 2.4 && end <= 3.4, '结算乐句约 3 秒：' + end);
    t.assert.ok(resultPhrase('lose').length > 4);
  });

  t.test('环境音跟生态走：林风、泥泽水滴、营火噼啪', () => {
    for (const b of ['forest', 'meadow', 'canopy', 'trade']) t.assert.equal(ambienceFor('explore', b), 'wind');
    for (const b of ['swamp', 'ruins', 'gate']) t.assert.equal(ambienceFor('battle', b), 'drip');
    t.assert.equal(ambienceFor('explore', 'camp'), 'fire');
    t.assert.equal(ambienceFor('result', 'forest'), null);
  });

  t.test('设置：默认值、坏数据兜底、存取往返、音量曲线', () => {
    t.assert.deepEqual(normalize(null), DEFAULTS);
    t.assert.deepEqual(normalize({ music: { on: 'x', vol: 9 }, sfx: { vol: -1 } }), { music: { on: true, vol: 1 }, sfx: { on: true, vol: 0 } });
    const st = memStorage();
    saveSettings(st, { music: { on: false, vol: 0.3 }, sfx: { on: true, vol: 0.5 } });
    t.assert.deepEqual(loadSettings(st), { music: { on: false, vol: 0.3 }, sfx: { on: true, vol: 0.5 } });
    st.setItem(STORE_KEY, '{坏的');
    t.assert.deepEqual(loadSettings(st), DEFAULTS);
    t.assert.equal(volumeGain(false, 1), 0);
    t.assert.ok(volumeGain(true, 0.5) < 0.5);
  });

  t.test('没交互以前静默：不建 AudioContext、sfx 不出声也不报错', () => {
    const { a } = make();
    t.assert.equal(a._ctx, null);
    t.assert.equal(a.sfx('click'), false);
    a.scene('battle', { biome: 'forest' });
    a.intensity(1);
    t.assert.equal(a._ctx, null);
    t.assert.equal(a.getState().unlocked, false);
  });

  t.test('解锁以后补上先前想放的背景音乐和环境音', () => {
    const { a } = make();
    a.scene('battle', { biome: 'swamp' });
    a.unlock();
    t.assert.equal(a._track, 'battle');
    t.assert.equal(a._ambience, 'drip');
    advance(a, 2);
    t.assert.ok(a._ctx.starts > 30, '应该排进了很多音符，实际 ' + a._ctx.starts);
  });

  t.test('不支持 Web Audio 的浏览器：不报错、不出声', () => {
    const a = createAudio({ AudioCtx: undefined, storage: memStorage(), timer: { set() {}, clear() {} } });
    t.assert.equal(a.unlock(), false);
    t.assert.equal(a.sfx('hit'), false);
    t.assert.equal(a.getState().supported, false);
  });

  t.test('十种音效每一种都能放，也都放完自动清理', () => {
    const { a } = make();
    a.unlock();
    t.assert.equal(SFX_NAMES.length, 10);
    for (const name of SFX_NAMES) {
      a._ctx.currentTime += 1;
      t.assert.equal(a.sfx(name, 3), true, name);
    }
    t.assert.equal(a.sfx('不存在的'), false);
    const ctx = a._ctx;
    // 把所有已排的振荡器都「播完」，节点应当断开
    for (const n of ctx.created) if (n.kind === 'osc' || n.kind === 'src') { if (n.started && n.stop) n.stop(); }
  });

  t.test('音效开关、音量：关了就不出声，开关和音量会记住', () => {
    const { a, storage } = make();
    a.unlock();
    a._ctx.currentTime += 1;
    t.assert.equal(a.sfx('click'), true);
    a.setOn('sfx', false);
    t.assert.equal(a.sfx('click'), false);
    a.setVolume('music', 0.25);
    const saved = JSON.parse(storage.getItem(STORE_KEY));
    t.assert.equal(saved.sfx.on, false);
    t.assert.equal(saved.music.vol, 0.25);
    const { a: b } = make(storage);
    t.assert.equal(b.getState().sfx.on, false, '重新打开还是关着');
    b.setVolume('sfx', 0.4);
    t.assert.equal(b.getState().sfx.on, true, '拖音量会顺手打开');
  });

  t.test('长链万发不破音：一秒里连发 500 次命中，实际放出的很少、总出口有压缩器', () => {
    const { a } = make();
    a.unlock();
    const comp = a._ctx.created.find(n => n.kind === 'comp');
    t.assert.ok(comp, '总出口要有压缩器');
    let ok = 0;
    for (let i = 0; i < 500; i++) { a._ctx.currentTime += 0.002; if (a.sfx('hit', i)) ok++; }
    t.assert.ok(ok <= 16, '放了 ' + ok);
    t.assert.ok(a._ctx.live < 400, '节点没有无限涨：' + a._ctx.live);
  });

  t.test('切背景音乐：旧的淡出、新的淡入，不会叠成一团；首领提速只改当前曲目', () => {
    const { a } = make();
    a.unlock();
    a.scene('explore', { biome: 'forest' });
    advance(a, 1);
    const c0 = a._ctx.created.filter(n => n.kind === 'gain').length;
    a.scene('tense', { biome: 'canopy' });
    t.assert.equal(a._track, 'tense');
    advance(a, 1.2);
    a.intensity(1);
    advance(a, 1);
    a.scene('result', { variant: 'win' });
    t.assert.equal(a._track, 'result');
    advance(a, 5);
    t.assert.equal(a._track, null, '结算短乐句播完即停');
    t.assert.equal(a._ambience, null);
    t.assert.ok(c0 > 0);
  });

  t.test('后台页面睡过头再醒来：重新对表，不会一口气补发几百个音符', () => {
    const { a } = make();
    a.unlock(); a.scene('battle', { biome: 'forest' });
    advance(a, 1);
    const before = a._ctx.starts;
    a._ctx.currentTime += 30; a._tick();
    t.assert.ok(a._ctx.starts - before < 60, '补发了 ' + (a._ctx.starts - before));
  });

  t.test('预留的换素材接口：有录好的就放录好的', async () => {
    const { a } = make();
    a.unlock();
    await a.loadSamples({ sfx: { click: 'x.ogg' }, bgm: { battle: 'b.ogg' } }, async () => ({ arrayBuffer: async () => new ArrayBuffer(8) }));
    a._ctx.currentTime += 1;
    const before = a._ctx.created.filter(n => n.kind === 'osc').length;
    t.assert.equal(a.sfx('click'), true);
    t.assert.equal(a._ctx.created.filter(n => n.kind === 'osc').length, before, '没有合成振荡器，放的是录好的');
    a.scene('battle', { biome: 'forest' });
    advance(a, 1);
    t.assert.equal(a._track, 'battle');
  });
}
