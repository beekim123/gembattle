// 实战组装场景：把 content + battle-rules + battle-view 拼在一起。
// 唯一负责把 view 的操作回调转给 rules，并把最新快照/预览/演出事件喂回 view。

import { createBattle } from '../../modules/battle-rules/index.js';
import { createBattleView } from '../../modules/battle-view/index.js';
import { createBattlePacket, instantiateCard } from '../../modules/content/index.js';

export function createBattleScene(context) {
  let battle = null;
  let view = null;
  let lastConfig = null;
  let retryCount = 0;

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
    const packet = createBattlePacket({
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

    view = createBattleView({
      allowAutoArrange: config.rulesConfig?.allowAutoArrange ?? true,
      callbacks: {
        onSelectTarget(uid) {
          if (battle.selectTarget(uid)) syncView();
        },
        onQueueCard(uid, index) {
          if (battle.queueCard(uid, index)) syncView();
        },
        onMoveChainCard(uid, index) {
          if (battle.moveChainCard(uid, index)) syncView();
        },
        onUnqueueCard(uid) {
          if (battle.unqueueCard(uid)) syncView();
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
          const out = battle.commitChain();
          syncView(out.events, out.result);
        },
        onRetry() {
          retryCount++;
          startFromConfig({
            ...lastConfig,
            seed: `${lastConfig.encounterId}-retry-${retryCount}`,
          });
        },
        onBack() {
          context.switchTo('home', {
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
    },

    onPointer(event) {
      return view ? view.onPointer(event) : { cursor: 'default' };
    },

    onKeyDown(key) {
      if (!battle || battle.getResult()) return;
      if (view?.isBusy?.()) return; // 正在播打出去的那一下
      if (key === ' ') {
        const out = battle.commitChain();
        syncView(out.events, out.result);
      } else if (key === 'z' || key === 'Z') {
        if (battle.undoLast()) syncView();
      } else if (key === 'Escape') {
        context.switchTo('home', {
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
