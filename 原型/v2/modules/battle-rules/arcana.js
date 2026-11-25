// 瞬发秘术与废牌：拖进链区松手立刻生效，不占链位。
// 瞬发秘术生效后自动补摸 1 张（打一张补一张）；废牌直接丢掉，不补牌。
import { CONFIG, ringBit, sum3 } from '../shared/index.js';
import { ARCANA } from '../content/index.js';
import { drawOne, breakShield, enemyView } from './state.js';

// 这张手牌现在能不能打；不能的话说明为什么（界面上提示）
export function instantCheck(b, handIndex) {
  const c = b.deck.hand[handIndex];
  if (b.phase !== 'player') return { ok: false, reason: '现在不能出牌' };
  if (!c || c.color >= 0) return { ok: false, reason: '这张牌要拖进链尾' };
  if (c.junk) return { ok: true };
  if (c.arcana === 'shatter') {
    const t = b.enemies[b.target];
    if (!t?.alive || sum3(t.shield) === 0) return { ok: false, reason: '目标没有护盾，震裂破甲用不了' };
  }
  if (c.arcana === 'resonance') {
    const cur = b.color.cursor;
    if (cur < 0 || cur > 5) return { ok: false, reason: '还没有当前色，先打出一张带色的牌' };
  }
  return { ok: true };
}

export function playInstant(b, handIndex) {
  const chk = instantCheck(b, handIndex);
  if (!chk.ok) return { ok: false, reason: chk.reason, events: [] };
  const c = b.deck.hand.splice(handIndex, 1)[0];
  const events = [];
  b.deck.discard.push(c);
  if (c.junk) { events.push({ type: 'junkDrop', uid: c.uid }); return { ok: true, events }; }
  events.push({ type: 'instant', id: c.arcana, uid: c.uid });
  switch (c.arcana) {
    case 'spring': drawMany(b, 3, events); break;                      // 补摸 1 张 + 额外 2 张
    case 'ward': b.ward++; events.push({ type: 'ward', ward: b.ward }); drawMany(b, 1, events); break;
    case 'surge': b.buff.surge++; events.push({ type: 'surge', n: b.buff.surge }); drawMany(b, 1, events); break;
    case 'resonance': {
      const cur = b.color.cursor, a = (cur + 1) % 6, d = (cur + 5) % 6;
      b.color.collected |= ringBit(a) | ringBit(d);
      events.push({ type: 'light', colors: [a, d], collected: b.color.collected });
      drawMany(b, 1, events);
      break;
    }
    case 'shatter': {
      const t = b.enemies[b.target];
      let left = 2;
      const cells = [0, 0, 0];
      while (left > 0 && sum3(t.shield) > 0) {                        // 先削格数最多的颜色
        let ch = 0;
        for (let k = 1; k < 3; k++) if (t.shield[k] > t.shield[ch]) ch = k;
        t.shield[ch]--; cells[ch]++; left--;
      }
      events.push({ type: 'shave', enemy: t.idx, cells, view: enemyView(t) });
      if (sum3(t.shield) === 0) breakShield(b, t, events, null);
      drawMany(b, 1, events);
      break;
    }
  }
  return { ok: true, events };
}

function drawMany(b, n, events) {
  const got = [];
  for (let k = 0; k < n; k++) { const c = drawOne(b, CONFIG.handMax); if (!c) break; got.push(c.uid); }
  events.push({ type: 'draw', uids: got });
}
