// 试玩记录：给外测用。把一次打开游戏里玩过的几趟，整理成一段纯文本，让玩家一键复制发回来。
// 纯逻辑、不碰 DOM：时间从外面传进来（测试好控制）。
//   recorder.startTrip(trip)    开了新的一趟
//   recorder.beginTurn()        玩家回合开始（开始计思考时间）
//   recorder.endTurn()          玩家点了施法或过回合（记下这一回合想了几秒）
//   recorder.undo()             退回一张 / 清空，各算一次撤回
//   recorder.finish(summary)    这一趟结束（summary 是 trip.js 的 summarize）
//   recorder.text(liveSummary)  整理成文本；最后一趟还没结束时传 liveSummary 看当前进度
import { SEALS, CARVES, ARCANA } from '../content/index.js';
import { COLOR_NAMES } from '../shared/index.js';

export const MAX_THINK_SEC = 180;           // 单回合思考时间封顶，免得人走开了把平均数拉歪
const OUTCOME = { retreat: '见好就收，折返结算', defeat: '阵亡，战利品尽失', victory: '击败千丈古树精，通关', running: '中途退出（没打完）' };

export function createRecorder(now = () => Date.now()) {
  const r = { startedAt: now(), trips: [], turnAt: null };
  const cur = () => r.trips[r.trips.length - 1] || null;
  const open = () => { const c = cur(); return c && !c.summary ? c : null; };
  const api = {
    r,
    startTrip(trip) {
      const c = open(); if (c) { c.summary = { outcome: 'running', step: c.lastStep || 0 }; c.endedAt = now(); }   // 上一趟没打完就重开了
      r.trips.push({ seed: trip.seed, startedAt: now(), endedAt: null, turns: [], undos: 0, summary: null, lastStep: 0 });
      r.turnAt = null;
    },
    beginTurn() { if (open()) r.turnAt = now(); },
    endTurn() {
      const c = open();
      if (c && r.turnAt != null) c.turns.push(Math.min(MAX_THINK_SEC, Math.max(0, (now() - r.turnAt) / 1000)));
      r.turnAt = null;
    },
    undo() { const c = open(); if (c) c.undos++; },
    progress(step) { const c = open(); if (c) c.lastStep = Math.max(c.lastStep, step); },
    finish(summary) { const c = open(); if (c) { c.summary = summary; c.endedAt = now(); } },
    text(liveSummary = null) { return formatRecord(r, now(), liveSummary); },
  };
  return api;
}

export function fmtDuration(sec) {
  sec = Math.max(0, Math.round(sec));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m ? `${m} 分 ${s} 秒` : `${s} 秒`;
}
const names = (arr, f) => (arr.length ? arr.map(f).join('、') : '没有');
const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

export function formatRecord(r, nowMs, liveSummary = null) {
  const lines = [];
  lines.push('code00 试玩记录（落果密林）');
  lines.push(`试玩时长：${fmtDuration((nowMs - r.startedAt) / 1000)}`);
  lines.push(`开了几趟：${r.trips.length} 趟`);
  const allTurns = [];
  r.trips.forEach((t, i) => {
    const live = !t.summary && i === r.trips.length - 1;
    const s = t.summary || (live && liveSummary) || { outcome: 'running', step: t.lastStep };
    allTurns.push(...t.turns);
    lines.push('', `—— 第 ${i + 1} 趟 ——`);
    lines.push(`结果：${live && !t.summary ? '还在进行中' : OUTCOME[s.outcome] || s.outcome}`);
    lines.push(`走到：第 ${s.step || t.lastStep || 0} 步（共 ${s.steps || 8} 步）`);
    if (s.battles !== undefined) lines.push(`打赢：${s.battles} 场`);
    lines.push(`回合数：${t.turns.length}，平均思考 ${avg(t.turns).toFixed(1)} 秒 / 回合`);
    lines.push(`撤回次数：${t.undos}`);
    if (s.seals) lines.push(`秘宝印记：${names(s.seals, id => SEALS[id]?.name || id)}`);
    if (s.carves) lines.push(`宝石雕琢：${names(s.carves, c => `${COLOR_NAMES[c.color] ?? '?'}牌${CARVES[c.kind]?.name || c.kind}`)}`);
    if (s.arcana) lines.push(`秘术牌：${names(s.arcana, id => ARCANA[id]?.name || id)}`);
    if (s.handBase !== undefined) lines.push(`结束时：心 ${s.hearts}/${s.maxHearts}，手牌 N = ${s.handBase}，攻击 ${s.atk}，金币 ${s.gold}${s.kept === false ? '（没带出去）' : ''}`);
  });
  lines.push('', `—— 合计 ——`);
  lines.push(`总回合数：${allTurns.length}，平均思考 ${avg(allTurns).toFixed(1)} 秒 / 回合（单回合超过 ${MAX_THINK_SEC} 秒按 ${MAX_THINK_SEC} 秒算）`);
  lines.push(`总撤回次数：${r.trips.reduce((a, t) => a + t.undos, 0)}`);
  return lines.join('\n');
}
