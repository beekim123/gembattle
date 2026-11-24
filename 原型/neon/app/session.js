// 跨场景留着的东西：场景每次切换都会重新建，这一趟（run）和存档放在这里。
// 只在 app/ 里用。
export const session = {
  run: null, // 正在走的一趟（run-rules 的 createRun）
  depart: null, // 出发包
  summary: null, // 这一趟结束以后的结果
  save: null, // 存档（阶段 3）
  onSettled: null, // 结算以后怎么写存档（阶段 3）
  // 试玩记录（设计稿 10.4）：最近几仗每回合想了几秒、打了几张，撤回几次、空过几回合。试打台「复制试玩记录」拷出来
  playLog: [],
  // 核心试玩这一趟（app/scenes/core-scene.js）：第几只、剩几颗心、之前几趟打到哪
  core: null,
};

/** 试玩记录写成几行字：先总的（想几秒的中位数、空过占几成、撤回几次），再一仗一行 */
export function formatPlayLog(log) {
  const turns = log.flatMap((b) => b.turns);
  const secs = turns.map((t) => t.thinkSec).sort((a, b) => a - b);
  const median = secs.length ? secs[Math.floor(secs.length / 2)] : 0;
  const empty = turns.filter((t) => t.played === 0).length;
  const lines = [
    `code00 试玩记录 · ${log.length} 仗 · ${turns.length} 回合`,
    `每回合想几秒：中位 ${median.toFixed(1)}，最长 ${(secs[secs.length - 1] || 0).toFixed(1)}（设计稿 10.4 合格线：中位不超过 15 秒）`,
    `一张不打的回合：${empty} 个，占 ${turns.length ? Math.round((empty / turns.length) * 100) : 0}%`,
    `撤回：一共 ${log.reduce((s, b) => s + b.undoCount, 0)} 次`,
    '',
    ...log.map((b) => `${b.at} ${b.encounter} ${b.outcome || '没打完'} · ${b.turns.length} 回合 · 撤回 ${b.undoCount} · 每回合秒数 ${b.turns.map((t) => t.thinkSec.toFixed(1)).join(' / ')} · 每回合张数 ${b.turns.map((t) => t.played).join(' / ')}`),
  ];
  return lines.join('\n');
}
