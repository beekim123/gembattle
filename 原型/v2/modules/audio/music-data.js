// 音乐的纯数据与小算法（不碰 Web Audio，node 里能直接测）。
// 四段背景音乐：explore 探索（路线图、营火、行商、偶遇、界门）、battle 普通战、tense 强敌与首领战、result 结算短乐句。
// 每段给一个 events(bar, step, intensity)：这一小节的第几个十六分音符该发哪些声音。声音都是合成的，不用任何外部素材。

export const midi = m => 440 * Math.pow(2, (m - 69) / 12);
const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
// 'C4' 'F#3' 'Bb2' → 频率
export function note(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('不认识的音名：' + name);
  const n = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  return midi(n);
}

export const stepSeconds = (bpm, tempoMul = 1) => 60 / (bpm * tempoMul) / 4;

// ---------- 接链音阶：Do Re Mi Sol La 高 Do，链越长音越高 ----------
export const CHAIN_NOTES = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6'];
export function chainPitch(n) {
  const i = Math.max(0, Math.min(CHAIN_NOTES.length - 1, Math.floor(n)));
  return note(CHAIN_NOTES[i]);
}

// ---------- 小工具 ----------
const ev = (v, f, d, g) => ({ v, f, d, g });          // 声音 种类 / 频率 / 持续几个十六分音符 / 音量
const pick = (arr, i) => arr[((i % arr.length) + arr.length) % arr.length];

// ---------- 探索：约 82 BPM，五声音阶拨弦 + 木琴质感低音 + 轻柔长音垫底 ----------
const EXPLORE_CHORDS = {
  C: { root: 'C2', tri: ['C4', 'E4', 'G4'] }, Am: { root: 'A1', tri: ['A3', 'C4', 'E4'] },
  F: { root: 'F2', tri: ['F3', 'A3', 'C4'] }, G: { root: 'G1', tri: ['G3', 'B3', 'D4'] },
};
const EXPLORE_BARS = ['C', 'Am', 'F', 'G', 'C', 'Am', 'F', 'G'];
const EXPLORE_MELODY = [
  ['E5', 'G5', 'A5', 'G5', 'E5', 'D5', 'C5', null], ['A4', 'C5', 'E5', 'D5', 'C5', 'A4', 'G4', null],
  ['C5', 'D5', 'E5', 'G5', 'E5', 'D5', 'C5', 'A4'], ['D5', 'E5', 'G5', 'E5', 'D5', 'C5', 'D5', null],
  ['G5', 'A5', 'G5', 'E5', 'D5', 'E5', 'G5', null], ['E5', 'D5', 'C5', 'A4', 'C5', 'D5', 'E5', null],
  ['A4', 'C5', 'E5', 'D5', 'C5', 'A4', 'C5', 'D5'], ['E5', 'D5', 'C5', 'D5', 'E5', 'G5', 'A5', 'G5'],
];
function exploreEvents(bar, step) {
  const ch = EXPLORE_CHORDS[pick(EXPLORE_BARS, bar)], out = [];
  if (step === 0) for (const n of ch.tri) out.push(ev('pad', note(n), 16, 0.035));
  if (step === 0) out.push(ev('marimba', note(ch.root), 6, 0.22));
  if (step === 8) out.push(ev('marimba', note(ch.root) * 2, 4, 0.14));
  if (step % 2 === 0) {
    const n = pick(EXPLORE_MELODY, bar)[step / 2];
    if (n) out.push(ev('pluck', note(n), 3, 0.16));
  }
  return out;
}

// ---------- 普通战：约 112 BPM，弹跳低音 + 清亮主旋律 ----------
const BATTLE_CHORDS = {
  C: { root: 'C2', fifth: 'G2' }, G: { root: 'G1', fifth: 'D2' }, Am: { root: 'A1', fifth: 'E2' }, F: { root: 'F1', fifth: 'C2' },
};
const BATTLE_BARS = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'];
const BATTLE_LEAD = [
  ['E5', null, 'G5', 'A5', null, 'G5', 'E5', null], ['D5', null, 'G5', 'B5', null, 'A5', 'G5', null],
  ['C5', 'E5', null, 'A5', 'G5', null, 'E5', 'C5'], ['A4', null, 'C5', 'F5', null, 'E5', 'C5', null],
  ['G5', null, 'A5', 'C6', null, 'A5', 'G5', null], ['B5', null, 'A5', 'G5', null, 'D5', 'G5', null],
  ['A5', 'F5', null, 'C5', 'F5', null, 'A5', 'C6'], ['B5', null, 'G5', 'D5', 'G5', 'B5', 'D6', null],
];
function battleEvents(bar, step) {
  const ch = BATTLE_CHORDS[pick(BATTLE_BARS, bar)], out = [];
  const bass = { 0: [ch.root, 2], 4: [ch.root, 1], 6: [ch.fifth, 1], 8: [ch.root, 2], 12: [ch.root, 1], 14: [ch.fifth, 1] }[step];
  if (bass) out.push(ev('bounce', note(bass[0]), bass[1], 0.2));
  if (step === 0 || step === 8) out.push(ev('kick', 0, 1, 0.28));
  if (step === 10 && bar % 2 === 1) out.push(ev('kick', 0, 1, 0.2));
  if (step % 4 === 2) out.push(ev('hat', 0, 1, 0.05));
  if (step === 4 || step === 12) out.push(ev('hat', 0, 1, 0.08));
  if (step % 2 === 0) {
    const n = pick(BATTLE_LEAD, bar)[step / 2];
    if (n) out.push(ev('lead', note(n), 3, 0.11));
  }
  return out;
}

// ---------- 强敌 / 首领：约 128 BPM，紧张鼓点 + 厚重低音脉冲；intensity ≥ 1（首领第 3 条血）加速并叠高频紧迫节拍 ----------
const TENSE_CHORDS = {
  Am: { root: 'A1', tri: ['A3', 'C4', 'E4'] }, F: { root: 'F1', tri: ['F3', 'A3', 'C4'] },
  G: { root: 'G1', tri: ['G3', 'B3', 'D4'] }, E: { root: 'E1', tri: ['E3', 'G#3', 'B3'] },
};
const TENSE_BARS = ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E'];
const TENSE_LEAD = ['A4', 'C5', 'E5', 'Eb5', 'E5', 'C5', 'A4', null];
function tenseEvents(bar, step, intensity = 0) {
  const ch = TENSE_CHORDS[pick(TENSE_BARS, bar)], out = [];
  if (step % 2 === 0) out.push(ev('pulse', note(step % 8 === 6 ? ch.root : ch.root), 2, 0.13));
  if (step % 4 === 0) out.push(ev('kick', 0, 1, 0.36));
  if (step === 4 || step === 12) out.push(ev('snare', 0, 1, 0.18));
  if (step === 0) for (const n of ch.tri) out.push(ev('stab', note(n), 5, 0.045));
  if (step === 10 && bar % 2 === 1) for (const n of ch.tri) out.push(ev('stab', note(n), 2, 0.03));
  if (step % 2 === 0) out.push(ev('hat', 0, 1, 0.05));
  if (step === 8 && bar % 2 === 0) { const n = pick(TENSE_LEAD, bar * 3 + 1); if (n) out.push(ev('lead', note(n), 6, 0.07)); }
  if (intensity >= 1) {
    out.push(ev('hat', 0, 1, 0.06));                                        // 十六分高频紧迫节拍
    if (step % 2 === 1) out.push(ev('tick', note('A6'), 1, 0.05));
    if (step === 14) out.push(ev('snare', 0, 1, 0.12));
  }
  return out;
}

export const TRACKS = {
  explore: { id: 'explore', bpm: 82, bars: 8, events: exploreEvents },
  battle: { id: 'battle', bpm: 112, bars: 8, events: battleEvents },
  tense: { id: 'tense', bpm: 128, bars: 8, events: tenseEvents, tempoPerIntensity: 0.12 },
};

// ---------- 结算短乐句：播完即停（约 3 秒），不死循环 ----------
// 返回 [{ at 秒, v, f, dur 秒, g }]。win 明快收尾和弦；lose 同样短，换成柔和的小调。
export function resultPhrase(variant = 'win') {
  if (variant === 'lose') {
    return [
      ...['A3', 'C4', 'E4'].map(n => ({ at: 0, v: 'pad', f: note(n), dur: 2.8, g: 0.05 })),
      ...['E5', 'C5', 'A4', 'E4', 'A3'].map((n, i) => ({ at: i * 0.32, v: 'pluck', f: note(n), dur: 0.7, g: 0.15 })),
    ];
  }
  return [
    ...['C3', 'G3', 'C4', 'E4'].map(n => ({ at: 0, v: 'pad', f: note(n), dur: 3, g: 0.06 })),
    ...['C4', 'E4', 'G4', 'C5', 'E5', 'G5'].map((n, i) => ({ at: i * 0.11, v: 'pluck', f: note(n), dur: 0.6, g: 0.16 })),
    { at: 0.8, v: 'bell', f: note('C6'), dur: 2.0, g: 0.12 },
    { at: 0.8, v: 'pluck', f: note('E6'), dur: 1.2, g: 0.06 },
  ];
}
export const RESULT_SECONDS = 3.2;

// 当前画面 → 背景音乐与环境音（逻辑放这里，好测）
// scene：'explore' | 'battle' | 'tense' | 'result'；biome 是生态 id
export function ambienceFor(scene, biome) {
  if (scene === 'result') return null;
  if (biome === 'camp') return 'fire';
  if (biome === 'swamp' || biome === 'ruins' || biome === 'gate') return 'drip';
  return 'wind';                                           // forest meadow canopy trade 和路线图
}
