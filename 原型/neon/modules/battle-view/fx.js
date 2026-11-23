// 战斗演出状态管理：只消费 battle-rules 输出的 BattleEvent[]，驱动飘字、横幅、总伤害展示与受击闪动。
// 严格遵守：同屏飘字有上限（避免上万发糊屏），纯数字显示不写万/亿。

import { BATTLE_EVENT_TYPES, COLOR_META } from '../shared/index.js';
import { formatNumber } from '../ui/index.js';

const MAX_FLOATING_NUMBERS = 36;

export function createBattleFx() {
  const floaters = [];
  const banners = [];
  const monsterFlash = new Map();
  let screenHitFlash = 0;
  let summaryBanner = null;

  function addFloater(item) {
    if (floaters.length >= MAX_FLOATING_NUMBERS) {
      floaters.shift();
    }
    floaters.push(item);
  }

  function addBanner(text, color = '#f2f5fb', duration = 1.6) {
    banners.push({ text, color, life: duration, maxLife: duration });
    if (banners.length > 4) banners.shift();
  }

  /**
   * 消费一批演出事件，结合当前怪在画面上的锚点坐标生成动画。
   * @param {object[]} events
   * @param {Map<string, { x: number, y: number }>} monsterAnchors
   */
  function pushEvents(events, monsterAnchors = new Map()) {
    if (!Array.isArray(events) || events.length === 0) return;

    let packetIndex = 0;
    for (const ev of events) {
      const p = ev.payload || {};
      switch (ev.type) {
        case BATTLE_EVENT_TYPES.DAMAGE_PACKET: {
          const anchor = monsterAnchors.get(p.targetUid) || { x: 480, y: 150 };
          // 轻微错开飘字落点，避免完全重叠
          const spreadX = ((packetIndex % 7) - 3) * 26;
          const spreadY = ((packetIndex % 3) - 1) * 16;
          packetIndex++;

          let label;
          let color = '#eef2f9';
          let size = 18;
          if (p.ignored) {
            label = `格挡 0（${p.hitsInPacket} 发）`;
            color = '#8e99ad';
            size = 14;
          } else {
            const per = formatNumber(p.perHitDamage ?? p.damage);
            label = p.hitsInPacket > 1 ? `${per} ×${p.hitsInPacket}` : per;
            if (p.isRainbow) {
              color = '#f5d76e';
              size = p.isCrit ? 24 : 20;
            } else if (p.isWhite) {
              color = '#ffffff';
              size = p.isCrit ? 23 : 19;
            } else if (p.isCrit) {
              color = '#ff7d6b';
              size = 24;
            } else if (p.color && COLOR_META[p.color]) {
              color = COLOR_META[p.color].swatch;
            }
          }

          addFloater({
            text: label,
            x: anchor.x + spreadX,
            y: anchor.y + spreadY,
            vy: -36 - (packetIndex % 4) * 8,
            color,
            size,
            isCrit: Boolean(p.isCrit),
            minY: anchor.minY ?? -Infinity,
            delay: Math.min(0.45, packetIndex * 0.02),
            life: 1.15,
            maxLife: 1.15,
          });
          monsterFlash.set(p.targetUid, 0.22);
          break;
        }

        case BATTLE_EVENT_TYPES.COMPLEMENT_WHITE:
          addBanner('补色合白 · 全体白色伤害！', '#eef2f9', 1.6);
          break;

        case BATTLE_EVENT_TYPES.RAINBOW_TRIGGER:
          addBanner('六色集齐 · 彩虹再打两遍！', '#f5d76e', 2.0);
          break;

        case BATTLE_EVENT_TYPES.SHIELD_BREAK: {
          const delta = p.countdownDelta;
          const msg = delta > 0
            ? `破盾！伤害 ×1.5，倒计时 +${delta}`
            : `破盾！特性触发：倒计时 ${delta}`;
          addBanner(msg, '#5ee0a0', 1.8);
          monsterFlash.set(p.targetUid, 0.35);
          break;
        }

        case BATTLE_EVENT_TYPES.BAR_SWITCHED:
          addBanner('击破血条 · 切换下一条血！', '#c69cff', 1.7);
          break;

        case BATTLE_EVENT_TYPES.MONSTER_ATTACK:
          if (p.blocked) {
            addBanner(`${p.monsterLabel || '怪'} 出手被挡住！`, '#6dc9ff', 1.7);
          } else {
            addBanner(`${p.monsterLabel || '怪'} 出手，掉 ${p.heartsLost} 颗心`, '#ff8a8a', 1.9);
            screenHitFlash = 0.35;
          }
          break;

        case BATTLE_EVENT_TYPES.GEM_LEVEL_UP: {
          const cLabel = COLOR_META[p.color]?.label || p.color;
          addBanner(`${cLabel}宝石升到 ${p.toLevel} 级！`, COLOR_META[p.color]?.swatch || '#f5d76e', 1.7);
          break;
        }

        case BATTLE_EVENT_TYPES.CHAIN_SUMMARY:
          if (p.playedCount > 0 || p.totalDamage > 0) {
            summaryBanner = {
              totalDamage: p.totalDamage,
              formulaLines: p.formulaLines || [],
              rainbow: Boolean(p.rainbowTriggered),
              life: 2.6,
              maxLife: 2.6,
            };
          }
          break;

        default:
          break;
      }
    }
  }

  function update(dt) {
    const step = Math.max(0, Number(dt) || 0);
    if (screenHitFlash > 0) screenHitFlash = Math.max(0, screenHitFlash - step);

    for (const [uid, t] of monsterFlash.entries()) {
      const next = t - step;
      if (next <= 0) monsterFlash.delete(uid);
      else monsterFlash.set(uid, next);
    }

    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i];
      if (f.delay > 0) {
        f.delay -= step;
        continue;
      }
      f.y = Math.max(f.minY ?? -Infinity, f.y + f.vy * step);
      f.life -= step;
      if (f.life <= 0) floaters.splice(i, 1);
    }

    for (let i = banners.length - 1; i >= 0; i--) {
      banners[i].life -= step;
      if (banners[i].life <= 0) banners.splice(i, 1);
    }

    if (summaryBanner) {
      summaryBanner.life -= step;
      if (summaryBanner.life <= 0) summaryBanner = null;
    }
  }

  function clear() {
    floaters.length = 0;
    banners.length = 0;
    monsterFlash.clear();
    screenHitFlash = 0;
    summaryBanner = null;
  }

  return {
    pushEvents,
    update,
    clear,
    getState: () => ({
      floaters,
      banners,
      monsterFlash,
      screenHitFlash,
      summaryBanner,
    }),
  };
}
