// 测试用的假玩家：随便排链、随便出瞬发秘术，用来把整趟跑通（不求聪明，求不报错）。
import { nextRand } from '../../shared/index.js';
import { queueCard, cast, playInstant, instantCheck, previewChain, setTarget } from '../../battle-rules/index.js';

export function playBattle(b, r, maxTurns = 60) {
  let turns = 0;
  while (b.phase === 'player' && turns++ < maxTurns) {
    // 先随手出瞬发
    for (let k = 0; k < 4; k++) {
      const i = b.deck.hand.findIndex((c, ix) => c.color < 0 && instantCheck(b, ix).ok);
      if (i < 0) break;
      if (nextRand(r) < 0.8) playInstant(b, i);
    }
    // 随机目标
    const alive = b.enemies.filter(e => e.alive);
    if (alive.length > 1) setTarget(b, alive[Math.floor(nextRand(r) * alive.length)].idx);
    // 排链：贪心——每次挑「接上」的牌，没有就随便
    const want = 1 + Math.floor(nextRand(r) * b.deck.hand.length);
    for (let k = 0; k < want; k++) {
      const idxs = b.deck.hand.map((c, i) => (c.color >= 0 ? i : -1)).filter(i => i >= 0);
      if (!idxs.length) break;
      queueCard(b, idxs[Math.floor(nextRand(r) * idxs.length)]);
    }
    previewChain(b);
    cast(b);
  }
  return b.phase;
}
