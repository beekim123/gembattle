// 林中偶遇：选项能不能选，选了以后发生什么（纯逻辑）。
import { EVENTS } from '../content/index.js';
import { offerSeals, heal, addJunk, removable, removeCard, addArcana } from './rewards.js';
import { nextRand } from '../shared/index.js';
import { ARCANA_IDS } from '../content/index.js';

// 选项现在能不能选；不能的话给个理由
export function optionCheck(trip, eventId, optId) {
  const opt = EVENTS[eventId].options.find(o => o.id === optId);
  if (opt.effect === 'pay_heal') {
    if (trip.gold < opt.cost) return { ok: false, reason: `金币不够（要 ${opt.cost}）` };
  }
  if (opt.effect === 'purge_gold' && !removable(trip).length) return { ok: false, reason: '牌组里没有秘术牌或废牌可以换' };
  return { ok: true };
}

// 返回 { next, ... }：next 告诉界面接下来要弹什么（seal 三选一 / carve 挑牌 / purge 挑牌 / done）
export function chooseOption(trip, eventId, optId) {
  const opt = EVENTS[eventId].options.find(o => o.id === optId);
  if (!optionCheck(trip, eventId, optId).ok) return { next: 'refused' };
  switch (opt.effect) {
    case 'none': return { next: 'done', text: '你转身离开了。' };
    case 'hurt_seal': {
      const p = trip.player;
      p.hearts = Math.max(0.5, p.hearts - 0.5);        // 扣心最多扣到剩半颗
      return { next: 'seal', options: offerSeals(trip, 3), text: '温热的红果浆下肚，你觉得有什么东西在发烫。' };
    }
    case 'carve_junk': return { next: 'carve', thenJunk: true };
    case 'pay_heal': trip.gold -= opt.cost; return { next: 'done', text: `回了 ${heal(trip, 1)} 颗心。` };
    case 'purge_gold': return { next: 'purge' };
    case 'rand_arcana': {
      const id = ARCANA_IDS[Math.floor(nextRand(trip) * ARCANA_IDS.length)];
      addArcana(trip, id);
      return { next: 'done', gotArcana: id, text: '内袋里翻出一张秘术牌。' };
    }
  }
  return { next: 'done' };
}
// 以旧换钱：删掉选中的那张牌，换 25 金币
export function finishPurgeForGold(trip, uid) {
  if (!removeCard(trip, uid)) return false;
  trip.gold += 25;
  return true;
}
// 以碑砺晶：雕琢完以后塞 1 张缠藤废牌
export function finishCarveJunk(trip) { addJunk(trip); }
