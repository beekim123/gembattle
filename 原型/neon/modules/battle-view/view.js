// 战斗画面模块（设计稿 10.1、10.2）：
// 只读 BattleSnapshot / BattlePreview / BattleEvent，自己不算规则；
// 只导入 shared / render / ui 三个模块的唯一对外入口，所有操作经 callbacks 回调给外部。

import {
  CHAIN_RELATIONS,
  CHAIN_RELATION_LABELS,
  COLOR_META,
  COLOR_RING,
  PRIMARY_GEMS,
  SEVEN_COLORS,
} from '../shared/index.js';
import {
  UI_THEME,
  createButton,
  createUiLayer,
  drawNumber,
  drawPanel,
  drawText,
  drawTooltip,
  formatNumber,
  hitTestRect,
} from '../ui/index.js';
import { createBattleFx } from './fx.js';

const LOGICAL_W = 960;
const LOGICAL_H = 540;

const TIER_LABELS = {
  normal: '普通',
  elite: '精英',
  gatekeeper: '看门的',
};

function isLightSwatch(colorId) {
  return colorId === 'white' || colorId === 'yellow' || colorId === 'cyan';
}

function drawGemDots(renderer, centerX, y, gems, radius = 5, gap = 14) {
  if (!Array.isArray(gems) || gems.length === 0) return;
  const startX = centerX - ((gems.length - 1) * gap) / 2;
  gems.forEach((g, idx) => {
    renderer.circle({
      x: startX + idx * gap,
      y,
      r: radius,
      fill: COLOR_META[g]?.swatch || '#ffffff',
      stroke: '#12151c',
      lineWidth: 1.5,
    });
  });
}

function drawHeartsBar(renderer, x, y, hearts, maxHearts) {
  const totalSlots = Math.ceil(maxHearts);
  for (let i = 0; i < totalSlots; i++) {
    const sx = x + i * 22;
    const remain = hearts - i;
    renderer.rect({
      x: sx,
      y,
      w: 18,
      h: 18,
      fill: '#2a3040',
      stroke: '#5a6680',
      lineWidth: 1.2,
      radius: 4,
    });
    if (remain >= 1) {
      renderer.rect({ x: sx + 2, y: y + 2, w: 14, h: 14, fill: '#e05252', radius: 3 });
    } else if (remain >= 0.5) {
      renderer.rect({ x: sx + 2, y: y + 2, w: 7, h: 14, fill: '#e05252', radius: 2 });
    }
  }
  drawNumber(renderer, {
    value: hearts,
    decimals: 'auto',
    suffix: ` / ${formatNumber(maxHearts, { decimals: 'auto' })}`,
    x: x + totalSlots * 22 + 6,
    y: y + 2,
    size: 13,
    tone: 'normal',
  });
}

/**
 * 创建战斗画面控制器。
 * @param {object} [options]
 * @param {boolean} [options.allowAutoArrange=true] 是否显示「自动帮排」按钮
 * @param {object} [options.callbacks] 操作回调集合
 */
export function createBattleView(options = {}) {
  const callbacks = options.callbacks || {};
  let allowAutoArrange = options.allowAutoArrange ?? true;
  let arrangeMode = 'longest'; // 'longest' | 'break_first'

  let snapshot = null;
  let preview = null;
  let result = null;

  const fx = createBattleFx();
  const ui = createUiLayer();

  // 实时交互命中区（每次布局更新）
  let monsterBoxes = [];
  let handBoxes = [];
  let chainBoxes = [];
  let pointer = { x: -1, y: -1, inside: false };
  let hoveredHandUid = null;
  let hoveredMonsterUid = null;
  let hoveredChainUid = null;

  function computeMonsterAnchors(snap) {
    const anchors = new Map();
    if (!snap || !Array.isArray(snap.monsters)) return anchors;
    const count = snap.monsters.length;
    const cardW = count === 1 ? 350 : count === 2 ? 300 : 276;
    const gap = 18;
    const totalW = count * cardW + (count - 1) * gap;
    const startX = (LOGICAL_W - totalW) / 2;
    snap.monsters.forEach((m, idx) => {
      anchors.set(m.uid, { x: startX + idx * (cardW + gap) + cardW / 2, y: 148 });
    });
    return anchors;
  }

  function rebuildButtons() {
    const btns = [];

    // 顶栏返回选仗按钮
    btns.push(
      createButton({
        id: 'back',
        label: '返回选仗',
        x: LOGICAL_W - 104,
        y: 8,
        w: 88,
        h: 30,
        variant: 'default',
        fontSize: 12,
        onClick: () => callbacks.onBack?.(),
      }),
    );

    if (snapshot && snapshot.outcome !== null) {
      // 战斗结束浮层按钮
      btns.push(
        createButton({
          id: 'retry',
          label: '再打一仗',
          x: LOGICAL_W / 2 - 156,
          y: 356,
          w: 142,
          h: 44,
          variant: 'primary',
          fontSize: 15,
          onClick: () => callbacks.onRetry?.(),
        }),
      );
      btns.push(
        createButton({
          id: 'result-back',
          label: '换仗 / 调开关',
          x: LOGICAL_W / 2 + 14,
          y: 356,
          w: 142,
          h: 44,
          variant: 'default',
          fontSize: 15,
          onClick: () => callbacks.onBack?.(),
        }),
      );
      ui.setButtons(btns);
      return;
    }

    const canAct = Boolean(snapshot && snapshot.phase === 'player_input' && snapshot.outcome === null);
    const hasChain = Boolean(snapshot && snapshot.chain.length > 0);
    const hasChainable = Boolean(snapshot && (snapshot.chain.length > 0 || snapshot.hand.some((c) => c.hidden || c.usage === 'chain')));

    // 主按钮：打出（链为空时标注「空过回合」）
    btns.push(
      createButton({
        id: 'commit',
        label: hasChain ? '打出' : '结束回合',
        x: 682,
        y: 238,
        w: 256,
        h: 44,
        variant: hasChain ? 'primary' : 'default',
        disabled: !canAct,
        fontSize: 17,
        tooltip: {
          title: hasChain ? '打出当前排链' : '本回合不出牌',
          lines: [hasChain ? '按链上顺序逐张结算伤害与削盾。' : '直接进入怪的倒计时阶段。'],
        },
        onClick: () => callbacks.onCommitChain?.(),
      }),
    );

    if (allowAutoArrange) {
      btns.push(
        createButton({
          id: 'auto-arrange',
          label: arrangeMode === 'longest' ? '自动帮排（最长）' : '自动帮排（破盾）',
          x: 682,
          y: 290,
          w: 174,
          h: 34,
          variant: 'default',
          disabled: !canAct || !hasChainable,
          fontSize: 12,
          tooltip: {
            title: '自动帮排',
            lines: ['由 battle-rules 按所选策略一键排链，排完仍可手动撤回微调。'],
          },
          onClick: () => callbacks.onAutoArrange?.(arrangeMode),
        }),
      );
      btns.push(
        createButton({
          id: 'toggle-arrange-mode',
          label: '切策略',
          x: 862,
          y: 290,
          w: 76,
          h: 34,
          variant: 'default',
          disabled: !canAct,
          fontSize: 12,
          tooltip: {
            title: '切换自动帮排策略',
            lines: ['在「最长链」与「先破盾」之间切换。'],
          },
          onClick: () => {
            arrangeMode = arrangeMode === 'longest' ? 'break_first' : 'longest';
            rebuildButtons();
          },
        }),
      );
    }

    btns.push(
      createButton({
        id: 'undo',
        label: '撤回最后一张',
        x: 682,
        y: 332,
        w: 124,
        h: 32,
        variant: 'default',
        disabled: !canAct || !hasChain,
        fontSize: 12,
        onClick: () => callbacks.onUndoLast?.(),
      }),
    );

    btns.push(
      createButton({
        id: 'clear',
        label: '清空排链',
        x: 814,
        y: 332,
        w: 124,
        h: 32,
        variant: 'default',
        disabled: !canAct || !hasChain,
        fontSize: 12,
        onClick: () => callbacks.onClearChain?.(),
      }),
    );

    ui.setButtons(btns);
  }

  function rebuildHitBoxes() {
    monsterBoxes = [];
    handBoxes = [];
    chainBoxes = [];
    if (!snapshot) return;

    // 怪卡片布局
    const mCount = snapshot.monsters.length;
    const mW = mCount === 1 ? 350 : mCount === 2 ? 300 : 276;
    const mH = 140;
    const mGap = 18;
    const mStartX = (LOGICAL_W - (mCount * mW + (mCount - 1) * mGap)) / 2;
    snapshot.monsters.forEach((m, idx) => {
      monsterBoxes.push({
        monster: m,
        x: mStartX + idx * (mW + mGap),
        y: 82,
        w: mW,
        h: mH,
      });
    });

    // 链区卡片布局（x: 28..658, y: 242..314）
    const cCount = snapshot.chain.length;
    if (cCount > 0) {
      const areaX = 32;
      const areaW = 620;
      const cardW = Math.min(82, Math.floor((areaW - (cCount - 1) * 6) / cCount));
      const gap = cCount > 1 ? Math.min(8, Math.floor((areaW - cardW * cCount) / (cCount - 1))) : 0;
      snapshot.chain.forEach((card, idx) => {
        chainBoxes.push({
          card,
          step: preview?.steps?.[idx] || null,
          x: areaX + idx * (cardW + gap),
          y: 251,
          w: cardW,
          h: 64,
        });
      });
    }

    // 底部手牌布局（最多 12 张，自适应宽度不越界）
    const hCount = snapshot.hand.length;
    if (hCount > 0) {
      const areaW = 916;
      const cardW = Math.min(104, Math.floor((areaW - Math.max(0, hCount - 1) * 8) / hCount));
      const gap = hCount > 1 ? Math.min(10, Math.floor((areaW - cardW * hCount) / (hCount - 1))) : 0;
      const totalW = cardW * hCount + gap * Math.max(0, hCount - 1);
      const startX = (LOGICAL_W - totalW) / 2;
      snapshot.hand.forEach((card, idx) => {
        handBoxes.push({
          card,
          x: startX + idx * (cardW + gap),
          y: 392,
          w: cardW,
          h: 132,
        });
      });
    }
  }

  function setState({ snapshot: nextSnap, preview: nextPrev, result: nextRes = null, events = [], allowAutoArrange: allowAuto }) {
    if (allowAuto !== undefined) allowAutoArrange = Boolean(allowAuto);
    snapshot = nextSnap;
    preview = nextPrev;
    result = nextRes;
    rebuildHitBoxes();
    rebuildButtons();
    if (events && events.length > 0) {
      fx.pushEvents(events, computeMonsterAnchors(nextSnap));
    }
  }

  function update(dt) {
    fx.update(dt);
  }

  function onPointer(event) {
    if (!event) return { cursor: 'default' };
    const { type, x, y } = event;

    if (type === 'leave') {
      pointer = { x: -1, y: -1, inside: false };
      hoveredHandUid = null;
      hoveredMonsterUid = null;
      hoveredChainUid = null;
      return ui.onPointerLeave();
    }

    pointer = { x, y, inside: true };

    // 先交给公共按钮层
    let uiRes;
    if (type === 'move') uiRes = ui.onPointerMove(x, y);
    else if (type === 'down') uiRes = ui.onPointerDown(x, y);
    else if (type === 'up') uiRes = ui.onPointerUp(x, y);

    // 战斗结束时仅响应结算按钮
    if (snapshot && snapshot.outcome !== null) {
      hoveredHandUid = null;
      hoveredMonsterUid = null;
      hoveredChainUid = null;
      return { cursor: uiRes?.cursor || 'default' };
    }

    const hitHand = handBoxes.find((b) => hitTestRect(b, x, y)) || null;
    const hitChain = chainBoxes.find((b) => hitTestRect(b, x, y)) || null;
    const hitMonster = monsterBoxes.find((b) => b.monster.alive && hitTestRect(b, x, y)) || null;

    hoveredHandUid = hitHand ? hitHand.card.uid : null;
    hoveredChainUid = hitChain ? hitChain.card.uid : null;
    hoveredMonsterUid = hitMonster ? hitMonster.monster.uid : null;

    // 抬起且没点中 UI 按钮时，触发手牌/链牌/怪卡片操作
    if (type === 'up' && !uiRes?.clickedId && snapshot?.phase === 'player_input') {
      if (hitHand) {
        if (!hitHand.card.hidden && hitHand.card.usage === 'instant') {
          callbacks.onPlayInstant?.(hitHand.card.uid);
        } else {
          callbacks.onQueueCard?.(hitHand.card.uid);
        }
      } else if (hitChain) {
        callbacks.onUnqueueCard?.(hitChain.card.uid);
      } else if (hitMonster) {
        callbacks.onSelectTarget?.(hitMonster.monster.uid);
      }
    }

    const interactive = uiRes?.cursor === 'pointer' || Boolean(hitHand || hitChain || hitMonster);
    return { cursor: interactive ? 'pointer' : 'default' };
  }

  function renderTopBar(renderer) {
    renderer.rect({ x: 0, y: 0, w: LOGICAL_W, h: 46, fill: '#1d222e' });
    renderer.line({ x1: 0, y1: 46, x2: LOGICAL_W, y2: 46, color: '#313a4f', lineWidth: 1 });

    // 回合数
    drawText(renderer, { text: `第 ${snapshot.turn} 回合`, x: 18, y: 13, size: 16, weight: 'bold' });

    // 主角心
    drawHeartsBar(renderer, 114, 14, snapshot.player.hearts, snapshot.player.maxHearts);

    // 挡的层数
    const totalBlock = snapshot.player.blocks.thisTurn + snapshot.player.blocks.untilConsumed + snapshot.player.blocks.allyCharges;
    if (totalBlock > 0) {
      renderer.rect({ x: 256, y: 10, w: 94, h: 26, fill: '#1d3652', stroke: '#66b2ff', lineWidth: 1.2, radius: 5 });
      drawText(renderer, {
        text: `挡 ×${totalBlock}`,
        x: 303,
        y: 23,
        size: 12,
        weight: 'bold',
        color: '#b8e0ff',
        align: 'center',
        baseline: 'middle',
      });
    }

    // 三原色宝石等级
    PRIMARY_GEMS.forEach((gem, i) => {
      const gx = 366 + i * 70;
      const lv = snapshot.player.gemLevels[gem];
      renderer.rect({ x: gx, y: 11, w: 64, h: 24, fill: '#151822', stroke: COLOR_META[gem].swatch, lineWidth: 1, radius: 5 });
      renderer.circle({ x: gx + 12, y: 23, r: 5, fill: COLOR_META[gem].swatch });
      drawText(renderer, {
        text: `Lv.${lv.level}`,
        x: gx + 22,
        y: 23,
        size: 12,
        weight: 'bold',
        baseline: 'middle',
      });
    });

    // 集色六色指示器
    const recSet = new Set(snapshot.recordedColors);
    const recX = 592;
    drawText(renderer, {
      text: `集色 ${recSet.size}/6`,
      x: recX,
      y: 23,
      size: 12,
      color: recSet.size >= 5 ? '#f5d76e' : UI_THEME.textSecondary,
      weight: recSet.size >= 5 ? 'bold' : 'normal',
      baseline: 'middle',
    });
    COLOR_RING.forEach((c, idx) => {
      const has = recSet.has(c);
      renderer.circle({
        x: recX + 68 + idx * 20,
        y: 23,
        r: 7,
        fill: has ? COLOR_META[c].swatch : '#161a24',
        stroke: COLOR_META[c].swatch,
        lineWidth: has ? 1.5 : 1.2,
        alpha: has ? 1 : 0.45,
      });
    });
  }

  function renderDeckStrip(renderer) {
    renderer.rect({ x: 16, y: 52, w: LOGICAL_W - 32, h: 24, fill: '#1a1e28', stroke: '#2c3345', lineWidth: 1, radius: 5 });
    drawText(renderer, {
      text: `牌堆 ${snapshot.drawPileCount} 张：`,
      x: 26,
      y: 64,
      size: 12,
      color: UI_THEME.textSecondary,
      baseline: 'middle',
    });

    // 牌堆各色剩余张数（5.2 算牌）
    SEVEN_COLORS.forEach((c, idx) => {
      const cx = 122 + idx * 62;
      const cnt = snapshot.drawPileByColor[c] || 0;
      renderer.circle({ x: cx, y: 64, r: 5.5, fill: COLOR_META[c].swatch, alpha: cnt > 0 ? 1 : 0.25 });
      drawText(renderer, {
        text: `${COLOR_META[c].label}${cnt}`,
        x: cx + 9,
        y: 64,
        size: 12,
        color: cnt > 0 ? UI_THEME.textPrimary : UI_THEME.textMuted,
        baseline: 'middle',
      });
    });

    const curLabel = snapshot.currentColor ? COLOR_META[snapshot.currentColor].label : '起色';
    drawText(renderer, {
      text: `弃牌 ${snapshot.discardPileCount} · 上张色：${curLabel} · 补牌上限 N=${snapshot.player.drawTarget}`,
      x: LOGICAL_W - 26,
      y: 64,
      size: 12,
      color: UI_THEME.textSecondary,
      align: 'right',
      baseline: 'middle',
    });
  }

  function renderMonsters(renderer) {
    const fxState = fx.getState();

    for (const box of monsterBoxes) {
      const m = box.monster;
      const isSelected = m.uid === snapshot.selectedTargetUid && m.alive;
      const isHovered = m.uid === hoveredMonsterUid && m.alive;
      const flash = fxState.monsterFlash.get(m.uid) || 0;

      let fill = m.alive ? '#222736' : '#181b23';
      if (flash > 0) fill = '#42303c';
      const border = !m.alive
        ? '#2d3240'
        : isSelected
          ? '#f5d76e'
          : isHovered
            ? '#8ab4ff'
            : '#3e4860';

      renderer.rect({
        x: box.x,
        y: box.y,
        w: box.w,
        h: box.h,
        fill,
        stroke: border,
        lineWidth: isSelected ? 2.5 : 1.5,
        radius: 10,
        alpha: m.alive ? 1 : 0.55,
      });

      // 标题行：层级标签 + 名称 + 倒计时块
      const tierBadge = TIER_LABELS[m.tier] || '怪';
      const tierColor = m.tier === 'gatekeeper' ? '#6c4db8' : m.tier === 'elite' ? '#a6424c' : '#33425c';
      renderer.rect({ x: box.x + 12, y: box.y + 10, w: 46, h: 20, fill: tierColor, radius: 4 });
      drawText(renderer, { text: tierBadge, x: box.x + 35, y: box.y + 20, size: 11, weight: 'bold', align: 'center', baseline: 'middle' });

      drawText(renderer, {
        text: m.label,
        x: box.x + 64,
        y: box.y + 20,
        size: 14,
        weight: 'bold',
        baseline: 'middle',
      });

      // 倒计时大块
      if (m.alive) {
        const urgent = m.countdown <= 1;
        renderer.rect({
          x: box.x + box.w - 64,
          y: box.y + 8,
          w: 52,
          h: 28,
          fill: urgent ? '#8f2c36' : '#182030',
          stroke: urgent ? '#ff99a2' : '#4a5a7a',
          lineWidth: 1.5,
          radius: 6,
        });
        drawText(renderer, {
          text: `${m.countdown} 回合`,
          x: box.x + box.w - 38,
          y: box.y + 22,
          size: 12,
          weight: 'bold',
          color: urgent ? '#ffffff' : '#d6e2f5',
          align: 'center',
          baseline: 'middle',
        });
      }

      // 多重血条指示块 + 意图
      const barsLeft = m.alive ? (m.totalBars - m.barIndex) : 0;
      for (let b = 0; b < m.totalBars; b++) {
        const filled = b < barsLeft;
        renderer.rect({
          x: box.x + 12 + b * 24,
          y: box.y + 39,
          w: 20,
          h: 6,
          fill: filled ? '#e05252' : '#2d3344',
          radius: 2,
        });
      }
      drawText(renderer, {
        text: m.intentLabel,
        x: box.x + box.w - 12,
        y: box.y + 42,
        size: 11,
        color: m.alive ? '#f0b8b8' : UI_THEME.textMuted,
        align: 'right',
        baseline: 'middle',
      });

      // 血条（纯数字）
      const hpX = box.x + 12;
      const hpY = box.y + 54;
      const hpW = box.w - 24;
      const hpRatio = m.maxHp > 0 ? Math.max(0, Math.min(1, m.hp / m.maxHp)) : 0;
      renderer.rect({ x: hpX, y: hpY, w: hpW, h: 22, fill: '#141720', stroke: '#3a4256', lineWidth: 1, radius: 5 });
      if (hpRatio > 0) {
        renderer.rect({ x: hpX + 1, y: hpY + 1, w: Math.max(4, (hpW - 2) * hpRatio), h: 20, fill: '#c9434b', radius: 4 });
      }
      drawText(renderer, {
        text: `${formatNumber(m.hp)} / ${formatNumber(m.maxHp)}`,
        x: hpX + hpW / 2,
        y: hpY + 11,
        size: 12,
        weight: 'bold',
        color: '#ffffff',
        align: 'center',
        baseline: 'middle',
      });

      // 盾格显示（红 / 绿 / 蓝）
      const shY = box.y + 84;
      if (m.shields.length === 0) {
        drawText(renderer, { text: '无盾（吃 1.0 倍伤害）', x: hpX, y: shY + 2, size: 11, color: UI_THEME.textMuted });
      } else if (m.shieldBroken) {
        renderer.rect({ x: hpX, y: shY, w: hpW, h: 20, fill: '#1c3b2c', stroke: '#5ee0a0', lineWidth: 1, radius: 4 });
        drawText(renderer, {
          text: '已破盾 · 受到伤害提高（出完手回满）',
          x: hpX + hpW / 2,
          y: shY + 10,
          size: 11,
          weight: 'bold',
          color: '#93f2c2',
          align: 'center',
          baseline: 'middle',
        });
      } else {
        let sx = hpX;
        for (const sh of m.shields) {
          const cMeta = COLOR_META[sh.color];
          drawText(renderer, { text: `${cMeta.label}盾`, x: sx, y: shY + 10, size: 11, color: cMeta.swatch, weight: 'bold', baseline: 'middle' });
          sx += 28;
          const cellW = sh.max > 5 ? 11 : 14;
          for (let k = 0; k < sh.max; k++) {
            renderer.rect({
              x: sx + k * (cellW + 3),
              y: shY + 3,
              w: cellW,
              h: 13,
              fill: k < sh.current ? cMeta.swatch : '#161a24',
              stroke: cMeta.swatch,
              lineWidth: 1,
              radius: 2,
            });
          }
          sx += sh.max * (cellW + 3) + 12;
        }
      }

      // 生效特性说明行
      const traitY = box.y + 112;
      if (m.activeTraits.length > 0) {
        const t = m.activeTraits[0];
        let traitText = t.label;
        if (t.halvedColor) traitText += `（本回合：${COLOR_META[t.halvedColor].label}）`;
        if (t.ignoredHitsLeft > 0) traitText += `（剩余 ${t.ignoredHitsLeft} 发）`;
        drawText(renderer, { text: traitText, x: hpX, y: traitY, size: 11, color: '#c8d4ea', maxWidth: hpW });
      } else if (isSelected) {
        drawText(renderer, { text: '当前选中目标（点击其他怪可切换）', x: hpX, y: traitY, size: 11, color: '#f5d76e' });
      }
    }
  }

  function renderChainAndPreview(renderer) {
    // 排链面板
    renderer.rect({ x: 16, y: 230, w: 652, h: 140, fill: '#1c212d', stroke: '#333d52', lineWidth: 1.5, radius: 10 });
    drawText(renderer, {
      text: `排链区（已排 ${snapshot.chain.length} 张 · 点击链上牌可撤回）`,
      x: 28,
      y: 236,
      size: 11,
      color: UI_THEME.textSecondary,
    });

    if (chainBoxes.length === 0) {
      drawText(renderer, {
        text: '点击下方手牌按顺序排进这条链，或点右侧「自动帮排」',
        x: 342,
        y: 280,
        size: 14,
        color: UI_THEME.textMuted,
        align: 'center',
        baseline: 'middle',
      });
    } else {
      for (let i = 0; i < chainBoxes.length; i++) {
        const box = chainBoxes[i];
        const card = box.card;
        const step = box.step;
        const resolvedColor = step?.resolvedColor || card.color || 'colorless';
        const meta = COLOR_META[resolvedColor] || COLOR_META.colorless;
        const light = isLightSwatch(resolvedColor);
        const hovered = hoveredChainUid === card.uid;

        renderer.rect({
          x: box.x,
          y: box.y + 12,
          w: box.w,
          h: box.h - 12,
          fill: card.hidden ? '#2e3445' : meta.swatch,
          stroke: hovered ? '#ffffff' : '#12151c',
          lineWidth: hovered ? 2 : 1.5,
          radius: 7,
        });

        // 顶部关系角标
        const relLabel = step?.triggersRainbow
          ? '彩虹'
          : step?.triggersComplementWhite
            ? '合白'
            : step
              ? (step.relation === CHAIN_RELATIONS.BREAK ? '断色' : `×${step.multiplierAfter}`)
              : '';
        if (relLabel) {
          const badgeBg = step?.triggersRainbow
            ? '#99751c'
            : step?.triggersComplementWhite
              ? '#3f4860'
              : step?.relation === CHAIN_RELATIONS.BREAK
                ? '#5c2d33'
                : '#161b26';
          renderer.rect({ x: box.x + 4, y: box.y + 2, w: box.w - 8, h: 16, fill: badgeBg, stroke: '#5a6680', lineWidth: 1, radius: 4 });
          drawText(renderer, {
            text: relLabel,
            x: box.x + box.w / 2,
            y: box.y + 10,
            size: 10,
            weight: 'bold',
            color: '#ffffff',
            align: 'center',
            baseline: 'middle',
          });
        }

        drawText(renderer, {
          text: card.hidden ? '？' : (card.kind === 'gem' ? meta.label : card.label.slice(0, 4)),
          x: box.x + box.w / 2,
          y: box.y + 34,
          size: 13,
          weight: 'bold',
          color: card.hidden ? '#d6deec' : (light ? '#171a22' : '#ffffff'),
          align: 'center',
          baseline: 'middle',
        });

        if (!card.hidden) {
          const gems = COLOR_META[resolvedColor]?.gems || card.gems || [];
          drawGemDots(renderer, box.x + box.w / 2, box.y + 54, gems, 4, 11);
        }
      }
    }

    // 预览两行算式条（y: 320..364）
    renderer.rect({ x: 26, y: 320, w: 632, h: 42, fill: '#141720', stroke: '#2c3448', lineWidth: 1, radius: 6 });
    if (preview && preview.chainLength > 0) {
      const shredParts = PRIMARY_GEMS
        .filter((g) => preview.shieldShred[g] > 0)
        .map((g) => `${COLOR_META[g].label}-${preview.shieldShred[g]}`);
      const breakHint = preview.expectedBreakUids.length > 0 ? ' · 可破盾！' : '';
      const dmgText = preview.estimatedDamage === null
        ? '精确伤害：已隐藏'
        : `预计伤害：${formatNumber(preview.estimatedDamage)}`;

      drawText(renderer, {
        text: `${preview.formulaLines?.[0] || `倍率 ×${preview.finalMultiplier} · 预计 ${preview.estimatedHits} 发`}`,
        x: 36,
        y: 326,
        size: 11,
        color: preview.willTriggerRainbow ? '#f5d76e' : '#dbe5f7',
      });
      drawText(renderer, {
        text: `${dmgText}  |  削盾：${shredParts.length ? shredParts.join(' ') : '无'}${breakHint}  |  差 ${preview.colorsNeededForRainbow} 色彩虹`,
        x: 36,
        y: 344,
        size: 11,
        color: preview.expectedBreakUids.length > 0 ? '#7ee39b' : UI_THEME.textSecondary,
      });
    } else {
      drawText(renderer, {
        text: '预览区：选牌进链后，实时显示接链关系、倍率、削盾格数与两行算式',
        x: 36,
        y: 341,
        size: 12,
        color: UI_THEME.textMuted,
        baseline: 'middle',
      });
    }
  }

  function renderHand(renderer) {
    drawText(renderer, {
      text: `手牌（${snapshot.hand.length} / ${snapshot.player.maxHandSize}）· 绿框可接上 · 金框可合白 · 暗边会断色`,
      x: 24,
      y: 374,
      size: 11,
      color: UI_THEME.textSecondary,
    });

    for (const box of handBoxes) {
      const card = box.card;
      const isHovered = hoveredHandUid === card.uid;
      const liftY = isHovered ? -8 : 0;
      const y = box.y + liftY;

      if (card.hidden) {
        renderer.rect({
          x: box.x,
          y,
          w: box.w,
          h: box.h,
          fill: '#262b38',
          stroke: isHovered ? '#eef2f9' : '#525c75',
          lineWidth: isHovered ? 2 : 1.5,
          radius: 9,
        });
        drawText(renderer, { text: '？', x: box.x + box.w / 2, y: y + 52, size: 32, weight: 'bold', color: '#9aa6bd', align: 'center', baseline: 'middle' });
        drawText(renderer, { text: '已遮住', x: box.x + box.w / 2, y: y + 96, size: 12, color: '#8a95ad', align: 'center', baseline: 'middle' });
        continue;
      }

      const meta = COLOR_META[card.color] || COLOR_META.colorless;
      const light = isLightSwatch(card.color);
      const rel = card.relationToCurrent;

      // 接链提示样式（设计稿 5.2）
      let borderColor = '#141720';
      let borderWidth = 2;
      let cardAlpha = 1;
      let tagText = '';
      let tagBg = '#171a22';

      if (rel === CHAIN_RELATIONS.CONNECT) {
        borderColor = '#66e095';
        borderWidth = 2.5;
        tagText = '接上';
        tagBg = '#1c5234';
      } else if (rel === CHAIN_RELATIONS.COMPLEMENT) {
        borderColor = '#ffd559';
        borderWidth = 3;
        tagText = '合白';
        tagBg = '#735714';
      } else if (rel === CHAIN_RELATIONS.BREAK) {
        borderColor = '#404656';
        cardAlpha = 0.72;
        tagText = '断色';
        tagBg = '#3b242a';
      } else if (rel === CHAIN_RELATIONS.INSTANT) {
        borderColor = '#5cd1d9';
        borderWidth = 2;
        tagText = '马上用';
        tagBg = '#1b474d';
      } else if (rel === CHAIN_RELATIONS.START) {
        borderColor = '#9cc0ff';
        tagText = '起色';
        tagBg = '#203b6b';
      }

      if (isHovered) {
        borderColor = '#ffffff';
        borderWidth = 3;
        cardAlpha = 1;
      }

      renderer.rect({
        x: box.x,
        y,
        w: box.w,
        h: box.h,
        fill: card.usage === 'instant' ? '#242c3d' : meta.swatch,
        stroke: borderColor,
        lineWidth: borderWidth,
        radius: 9,
        alpha: cardAlpha,
      });

      // 顶部关系角标
      if (tagText) {
        renderer.rect({ x: box.x + 6, y: y + 6, w: box.w - 12, h: 18, fill: tagBg, radius: 4, alpha: 0.95 });
        drawText(renderer, {
          text: tagText,
          x: box.x + box.w / 2,
          y: y + 15,
          size: 11,
          weight: 'bold',
          color: '#ffffff',
          align: 'center',
          baseline: 'middle',
        });
      }

      // 牌面功能文字（自适应多行，保证不溢出）
      const textColor = card.usage === 'instant' ? '#eef2f9' : (light ? '#151822' : '#ffffff');
      drawText(renderer, {
        text: card.label,
        x: box.x + box.w / 2,
        y: y + 36,
        size: box.w < 84 ? 11 : 13,
        weight: 'bold',
        color: textColor,
        align: 'center',
        maxWidth: box.w - 12,
        lineHeight: 16,
      });

      // 底部画红绿蓝原色宝石小点（或功能牌补摸标注）
      if (card.gems && card.gems.length > 0) {
        drawGemDots(renderer, box.x + box.w / 2, y + box.h - 22, card.gems, 6, 16);
      } else if (card.drawAfterPlay > 0) {
        drawText(renderer, {
          text: `补摸 ${card.drawAfterPlay}`,
          x: box.x + box.w / 2,
          y: y + box.h - 20,
          size: 11,
          color: '#93e5eb',
          align: 'center',
          baseline: 'middle',
        });
      }
    }
  }

  function renderFx(renderer) {
    const state = fx.getState();

    // 主角挨打边框闪红
    if (state.screenHitFlash > 0) {
      renderer.rect({
        x: 3,
        y: 3,
        w: LOGICAL_W - 6,
        h: LOGICAL_H - 6,
        stroke: '#ff5252',
        lineWidth: 6,
        alpha: state.screenHitFlash * 2,
      });
    }

    // 飘纯数字伤害
    for (const f of state.floaters) {
      if (f.delay > 0) continue;
      const alpha = Math.max(0, Math.min(1, f.life / (f.maxLife * 0.45)));
      // 深色底描边感（偏移 1px 垫底增强可读性）
      renderer.text({
        text: f.text,
        x: f.x + 1,
        y: f.y + 1,
        color: '#0c0e14',
        size: f.size,
        weight: 'bold',
        align: 'center',
        baseline: 'middle',
        alpha,
      });
      renderer.text({
        text: f.text,
        x: f.x,
        y: f.y,
        color: f.color,
        size: f.size,
        weight: 'bold',
        align: 'center',
        baseline: 'middle',
        alpha,
      });
    }

    // 顶部短横幅（落位在牌堆条附近，不压怪卡片正文）
    state.banners.forEach((b, idx) => {
      const alpha = Math.max(0, Math.min(1, b.life / 0.4));
      const bw = Math.min(420, renderer.measureText(b.text, { size: 12, weight: 'bold' }).width + 28);
      const bx = (LOGICAL_W - bw) / 2;
      const by = 52 + idx * 25;
      renderer.rect({ x: bx, y: by, w: bw, h: 22, fill: '#12151e', stroke: b.color, lineWidth: 1.2, radius: 6, alpha: alpha * 0.94 });
      drawText(renderer, { text: b.text, x: LOGICAL_W / 2, y: by + 11, size: 12, weight: 'bold', color: b.color, align: 'center', baseline: 'middle', alpha });
    });

    // 本回合总伤害浮条（落位在刚清空的排链区中，不挡怪血条与手牌）
    if (state.summaryBanner && snapshot.chain.length === 0) {
      const sb = state.summaryBanner;
      const alpha = Math.max(0, Math.min(1, sb.life / 0.5));
      renderer.rect({
        x: 112,
        y: 252,
        w: 460,
        h: 58,
        fill: '#10141f',
        stroke: sb.rainbow ? '#ffd559' : '#5778c4',
        lineWidth: 2,
        radius: 8,
        alpha: alpha * 0.95,
      });
      drawNumber(renderer, {
        value: sb.totalDamage,
        prefix: '本回合总伤害：',
        x: 342,
        y: 263,
        size: 19,
        tone: sb.rainbow ? 'accent' : 'normal',
        align: 'center',
        alpha,
      });
      if (sb.formulaLines[0]) {
        drawText(renderer, {
          text: sb.formulaLines[0],
          x: 342,
          y: 290,
          size: 11,
          color: UI_THEME.textSecondary,
          align: 'center',
          alpha,
        });
      }
    }
  }

  function renderOutcomeModal(renderer) {
    if (!snapshot || snapshot.outcome === null) return;
    renderer.rect({ x: 0, y: 0, w: LOGICAL_W, h: LOGICAL_H, fill: '#0b0d12', alpha: 0.72 });

    const win = snapshot.outcome === 'win';
    const box = drawPanel(renderer, {
      x: 250,
      y: 126,
      w: 460,
      h: 292,
      title: win ? '这一仗打赢了！' : '主角的心掉完了（战败）',
      subtitle: win ? '胜利结算' : '战败结算',
      border: win ? '#66e095' : '#e05252',
      radius: 12,
    });

    const st = result?.stats || { turns: snapshot.turn, totalDamage: 0, maxChainLength: 0, rainbowCount: 0, shieldBreaks: 0, heartsLost: 0 };
    const rows = [
      `剩几颗心：${formatNumber(snapshot.player.hearts, { decimals: 'auto' })} / ${formatNumber(snapshot.player.maxHearts, { decimals: 'auto' })}（共掉 ${formatNumber(st.heartsLost, { decimals: 'auto' })} 心）`,
      `打了几回合：${formatNumber(st.turns)} 回合 · 最长链：${formatNumber(st.maxChainLength)} 张`,
      `破盾次数：${formatNumber(st.shieldBreaks)} 次 · 彩虹次数：${formatNumber(st.rainbowCount)} 次`,
      `累计总伤害：${formatNumber(st.totalDamage)} · 最高单发：${formatNumber(st.maxSingleHit)}`,
    ];
    rows.forEach((line, idx) => {
      drawText(renderer, {
        text: line,
        x: box.x + 8,
        y: box.y + 8 + idx * 32,
        size: 14,
        color: idx === 3 ? '#f5d76e' : UI_THEME.textPrimary,
      });
    });
  }

  function renderHoverTooltip(renderer) {
    if (!pointer.inside || !snapshot || snapshot.outcome !== null) return;

    if (hoveredHandUid) {
      const box = handBoxes.find((b) => b.card.uid === hoveredHandUid);
      if (!box) return;
      const c = box.card;
      if (c.hidden) {
        drawTooltip(renderer, {
          x: pointer.x,
          y: pointer.y - 10,
          title: '被遮住的手牌',
          lines: ['本回合看不见颜色与宝石，打出去时才会翻开。'],
          tag: '状态：已遮住',
        }, { width: LOGICAL_W, height: LOGICAL_H });
        return;
      }
      const meta = COLOR_META[c.color] || COLOR_META.colorless;
      const gemsText = c.gems?.length ? `带宝石：${c.gems.map((g) => COLOR_META[g].label).join(' + ')}` : '无宝石（马上用功能牌）';
      drawTooltip(renderer, {
        x: pointer.x,
        y: pointer.y - 10,
        title: c.label,
        lines: [
          c.description || gemsText,
          `关系：${CHAIN_RELATION_LABELS[c.relationToCurrent] || c.relationToCurrent}`,
        ],
        tag: c.usage === 'instant' ? '点击立即生效' : '点击排进链尾',
        accentColor: meta.swatch,
      }, { width: LOGICAL_W, height: LOGICAL_H });
      return;
    }

    if (hoveredMonsterUid) {
      const box = monsterBoxes.find((b) => b.monster.uid === hoveredMonsterUid);
      if (!box) return;
      const m = box.monster;
      const lines = [
        `血条：第 ${m.barIndex + 1} / ${m.totalBars} 条（${formatNumber(m.hp)} / ${formatNumber(m.maxHp)}）`,
        `意图：${m.intentLabel}`,
        ...(m.activeTraits.length ? m.activeTraits.map((t) => `特性：${t.label}`) : ['特性：无特殊特性']),
      ];
      drawTooltip(renderer, {
        x: pointer.x,
        y: pointer.y,
        title: m.label,
        lines,
        tag: m.uid === snapshot.selectedTargetUid ? '当前目标' : '点击切换为目标',
      }, { width: LOGICAL_W, height: LOGICAL_H });
    }
  }

  function render(renderer) {
    renderer.clear(UI_THEME.bg);
    if (!snapshot) {
      drawText(renderer, { text: '等待开战快照……', x: LOGICAL_W / 2, y: LOGICAL_H / 2, align: 'center', baseline: 'middle' });
      return;
    }

    renderTopBar(renderer);
    renderDeckStrip(renderer);
    renderMonsters(renderer);
    renderChainAndPreview(renderer);
    renderHand(renderer);
    renderFx(renderer);
    renderOutcomeModal(renderer);
    ui.render(renderer);
    renderHoverTooltip(renderer);
  }

  return {
    setState,
    update,
    onPointer,
    render,
    clearFx: () => fx.clear(),
    getLayoutBoxes: () => ({
      monsters: monsterBoxes.map(({ x, y, w, h, monster }) => ({ uid: monster.uid, x, y, w, h })),
      hand: handBoxes.map(({ x, y, w, h, card }) => ({ uid: card.uid, x, y, w, h })),
      chain: chainBoxes.map(({ x, y, w, h, card }) => ({ uid: card.uid, x, y, w, h })),
    }),
  };
}
