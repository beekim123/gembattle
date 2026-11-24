// 实战组装场景：把 content + battle-rules + battle-view 拼在一起。
// 唯一负责把 view 的操作回调转给 rules，并把最新快照/预览/演出事件喂回 view。

import { createBattle } from '../../modules/battle-rules/index.js';
import { createBattleView } from '../../modules/battle-view/index.js';
import { createBattlePacket, instantiateCard } from '../../modules/content/index.js';
import { session } from '../session.js';

export function createBattleScene(context) {
  let battle = null;
  let view = null;
  let lastConfig = null;
  let retryCount = 0;
  // 试玩记录：这回合从「能动手」到「打出去」想了几秒（演出播放的时间不算）
  let logEntry = null;
  let timedTurn = -1;
  let turnStartedAt = 0;

  function commit() {
    const snap = battle.getSnapshot();
    if (logEntry && snap.phase === 'player_input') {
      logEntry.turns.push({ turn: snap.turn, thinkSec: Math.max(0, (Date.now() - turnStartedAt) / 1000), played: snap.chain.length });
    }
    const out = battle.commitChain();
    if (logEntry) {
      logEntry.undoCount = battle.getMetrics().undoCount;
      if (out.result) logEntry.outcome = out.result.outcome === 'win' ? '赢' : '输';
    }
    syncView(out.events, out.result);
  }

  function syncView(events = [], result = null) {
    if (!battle || !view) return;
    view.setState({
      snapshot: battle.getSnapshot(),
      preview: battle.getPreview(),
      result: result ?? battle.getResult(),
      events,
      allowAutoArrange: lastConfig?.rulesConfig?.allowAutoArrange ?? true,
    });
  }

  function startFromConfig(config) {
    lastConfig = config;
    // 走一趟里的仗：开战包由 run-rules 给（app/scenes/run-scene.js），打完交回去
    const packet = config.runPacket ? config.runPacket : createBattlePacket({
      encounterId: config.encounterId || 'dual_shield',
      extraCards: config.extraCards || [],
      drawTarget: config.drawTarget ?? 4,
      seed: config.seed || `battle-${Date.now()}`,
      rulesConfig: config.rulesConfig || {},
      buffs: config.buffs || [],
      allies: config.allies || [],
    });

    // 万发压测模式：给 12 张高连携黄/白宝石 + 高血量木桩，方便直接验证万发打包飘字
    if (config.stressMode) {
      packet.player.drawTarget = 12;
      packet.player.stats.attack = 320;
      packet.player.stats.critRate = 0.35;
      packet.player.stats.critDamage = 2.5;
      packet.player.deck = Array.from({ length: 14 }, (_, i) => {
        const defId = i % 3 === 0 ? 'gem_white' : (i % 2 === 0 ? 'gem_yellow' : 'gem_green');
        return instantiateCard(defId, `stress-${i + 1}`);
      });
      packet.monsters[0].label = '万发压测木桩怪';
      packet.monsters[0].bars[0].maxHp = 5000000;
    }

    battle = createBattle(packet, {
      showExactDamage: config.rulesConfig?.showExactDamage ?? true,
    });
    if (!config.stressMode) {
      const d = new Date();
      logEntry = { at: `${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`, encounter: packet.monsters.map((m) => m.label).join('+'), outcome: null, undoCount: 0, turns: [] };
      session.playLog = [...(session.playLog || []), logEntry].slice(-50);
    } else logEntry = null;
    timedTurn = -1;

    view = createBattleView({
      allowAutoArrange: config.rulesConfig?.allowAutoArrange ?? true,
      outcomeMode: config.runPacket ? 'run' : 'single',
      outcomeLabels: config.outcomeLabels || null,
      callbacks: {
        onSelectTarget(uid) {
          if (battle.selectTarget(uid)) syncView();
        },
        onQueueCard(uid, index) {
          if (battle.queueCard(uid, index)) syncView();
        },
        onUndoLast() {
          if (battle.undoLast()) syncView();
        },
        onClearChain() {
          if (battle.clearChain()) syncView();
        },
        onPlayInstant(uid) {
          const out = battle.playInstantCard(uid);
          if (out.ok) syncView(out.events);
        },
        onAutoArrange(strategy) {
          battle.autoArrange(strategy);
          syncView();
        },
        onCommitChain() {
          commit();
        },
        onRetry() {
          retryCount++;
          startFromConfig({
            ...lastConfig,
            seed: `${lastConfig.encounterId}-retry-${retryCount}`,
          });
        },
        onBack() {
          if (config.runPacket) {
            const result = battle.getResult();
            // 走一趟里的仗回走一趟；核心试玩的仗回核心试玩（returnTo: 'core'）
            if (result) context.switchTo(config.returnTo || 'run', { battleResult: result });
            return;
          }
          context.switchTo(lastConfig.backTo || 'trial', {
            encounterId: lastConfig.encounterId,
            rulesConfig: lastConfig.rulesConfig,
            buffs: lastConfig.buffs,
            allies: lastConfig.allies,
          });
        },
      },
    });

    syncView(battle.getInitialEvents());
  }

  return {
    getBattle: () => battle,
    getView: () => view,

    onEnter(payload) {
      startFromConfig(payload || { encounterId: 'dual_shield' });
    },

    onUpdate(dt) {
      if (view) view.update(dt);
      // 新的一回合、演出播完了才开始计时
      if (battle && view && !view.isBusy?.()) {
        const t = battle.getSnapshot().turn;
        if (t !== timedTurn) { timedTurn = t; turnStartedAt = Date.now(); }
      }
    },

    onPointer(event) {
      return view ? view.onPointer(event) : { cursor: 'default' };
    },

    onKeyDown(key) {
      if (!battle || battle.getResult()) return;
      if (view?.isBusy?.()) return; // 正在播打出去的那一下
      if (key === ' ') {
        commit();
      } else if (key === 'z' || key === 'Z') {
        if (battle.undoLast()) syncView();
      } else if (key === 'Escape' && !lastConfig.runPacket) {
        context.switchTo(lastConfig.backTo || 'trial', {
          encounterId: lastConfig.encounterId,
          rulesConfig: lastConfig.rulesConfig,
          buffs: lastConfig.buffs,
          allies: lastConfig.allies,
        });
      }
    },

    onRender(renderer) {
      if (view) view.render(renderer);
    },
  };
}
