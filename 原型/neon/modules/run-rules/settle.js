// 回来以后的结算（设计稿 8.1）：给它旧存档和回来包，它给出新存档和一串「发生了什么」。
// 存档的形状由 save 模块定（见 save/README），这里只改用得到的几样；纯函数，不改传进来的东西。

const clone = (v) => JSON.parse(JSON.stringify(v));

/**
 * @param {object} save 旧存档
 * @param {object} ret 回来包（createRun().getReturnPacket()）
 * @param {object} [pack] contentPack（要 gearDefs 看哪件会坏）
 * @returns {{ save: object, lines: string[] }}
 */
export function settleRun(save, ret, pack = {}) {
  const next = clone(save);
  const lines = [];
  const alive = ret.outcome === 'returned';
  lines.push(alive ? '活着回来了' : '死在林子里了');

  // 金币：活着全带回，死了只剩每仗掉的（8.3）
  next.gold += ret.gold;
  lines.push(`带回 ${ret.gold} 金币${alive ? '' : `（丢了 ${ret.goldDetail?.risky ?? 0}）`}`);

  // 任务：进度存进存档；做完了等着在工会提交；死了做完没交的算失败（8.2）
  const taken = next.quests.taken || [];
  let doneCount = 0;
  let failedCount = 0;
  for (const rq of ret.quests) {
    let q = taken.find((x) => x.id === rq.id);
    if (!q && rq.hidden && alive) {
      q = { id: rq.id, progress: 0, done: false, hidden: true };
      taken.push(q);
      lines.push('带回一个隐藏任务');
    }
    if (!q) continue;
    if (rq.failed) {
      q.failed = true;
      q.done = false;
      failedCount++;
      continue;
    }
    q.progress = Math.max(q.progress || 0, rq.progress);
    if (rq.done && !q.done) {
      q.done = true;
      doneCount++;
    }
  }
  // 一样的话合成一句（原来一个任务一句，三个任务就三行一样的）
  if (doneCount) lines.push(`做完了 ${doneCount} 个任务，去工会提交`);
  if (failedCount) lines.push(`${failedCount} 个做完的任务没带回来，算失败，在工会「上次失败的」那栏能再接`);
  // 失败的挪到「上次失败的」一栏，最多 3 个（8.2）
  const failed = taken.filter((q) => q.failed && !q.hidden);
  next.quests.taken = taken.filter((q) => !q.failed);
  next.quests.failed = [...(next.quests.failed || []), ...failed.map((q) => q.id)].slice(-3);

  // 装备磨损：每出一趟磨 1 点，死了不多磨；磨到 0 就坏了（6.5）
  for (const slot of ['weapon', 'armor', 'trinket']) {
    const id = next.gear?.equipped?.[slot];
    if (!id) continue;
    const def = pack.gearDefs?.[id];
    if (!def || def.free) continue;
    const item = next.gear.owned.find((g) => g.id === id);
    if (!item) continue;
    item.wear = Math.max(0, item.wear - 1);
    if (item.wear === 0) {
      next.gear.owned = next.gear.owned.filter((g) => g !== item);
      next.gear.equipped[slot] = null;
      lines.push(`「${def.label}」磨坏了`);
    }
  }

  // 队友只管一趟（3 节）
  next.hired = [];

  // 卡册：碰到过的怪
  const seen = new Set(next.album?.monsters || []);
  ret.encountered.forEach((d) => seen.add(d));
  next.album = { ...(next.album || {}), monsters: [...seen] };

  next.runs = (next.runs || 0) + 1;
  next.lastRun = { outcome: ret.outcome, gold: ret.gold, stats: ret.stats };
  return { save: next, lines };
}
