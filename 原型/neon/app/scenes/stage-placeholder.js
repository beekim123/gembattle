// 阶段 0 的空游戏画面：只有一个「试打」按钮，点了还没接战斗模块。
// 只通过模块对外入口 import shared / ui，不直接操作 DOM。

import { COLOR_META, COLOR_RING } from '../../modules/shared/index.js';
import {
  UI_THEME,
  createButton,
  createUiLayer,
  drawPanel,
  drawText,
} from '../../modules/ui/index.js';

export function createEmptyStageScene() {
  const ui = createUiLayer();
  let tryClicks = 0;
  let notice = '';
  let noticeTimer = 0;

  const TRY_BTN_RECT = { x: 390, y: 266, w: 180, h: 52 };

  function buildButtons() {
    ui.setButtons([
      createButton({
        id: 'try-battle',
        label: '试打',
        x: TRY_BTN_RECT.x,
        y: TRY_BTN_RECT.y,
        w: TRY_BTN_RECT.w,
        h: TRY_BTN_RECT.h,
        variant: 'primary',
        fontSize: 18,
        tooltip: {
          title: '试打（阶段 1 接入）',
          lines: ['当前是阶段 0 骨架，战斗规则与画面还没接入。'],
          tag: '占位入口',
          accentColor: COLOR_META.blue.swatch,
        },
        onClick: () => {
          tryClicks++;
          notice = `战斗模块尚未接入（阶段 1 补上），已点击 ${tryClicks} 次`;
          noticeTimer = 6;
        },
      }),
    ]);
  }

  return {
    getTryButtonRect: () => ({ ...TRY_BTN_RECT }),
    getState: () => ({ tryClicks, notice }),

    onEnter() {
      buildButtons();
    },

    onUpdate(dt) {
      if (noticeTimer > 0) {
        noticeTimer = Math.max(0, noticeTimer - dt);
      }
    },

    onPointer(event) {
      if (!event) return { cursor: 'default' };
      if (event.type === 'move') return ui.onPointerMove(event.x, event.y);
      if (event.type === 'down') return ui.onPointerDown(event.x, event.y);
      if (event.type === 'up') return ui.onPointerUp(event.x, event.y);
      if (event.type === 'leave') return ui.onPointerLeave();
      return { cursor: 'default' };
    },

    onRender(renderer) {
      const { width, height } = renderer.getSize();
      renderer.clear(UI_THEME.bg);

      // 顶部极简状态栏
      renderer.rect({ x: 0, y: 0, w: width, h: 48, fill: '#1d222e' });
      renderer.line({ x1: 0, y1: 48, x2: width, y2: 48, color: '#30394d', lineWidth: 1 });
      drawText(renderer, { text: 'code00', x: 24, y: 14, size: 18, weight: 'bold' });
      drawText(renderer, {
        text: '阶段 0 · 骨架空壳（仅色块）',
        x: width - 24,
        y: 16,
        size: 13,
        color: UI_THEME.textSecondary,
        align: 'right',
      });

      // 中央空画面色块面板
      const panelW = 500;
      const panelH = 264;
      const panelX = (width - panelW) / 2;
      const panelY = (height - panelH) / 2 + 12;

      drawPanel(renderer, {
        x: panelX,
        y: panelY,
        w: panelW,
        h: panelH,
        title: '空游戏画面',
        subtitle: '场景：home',
        radius: 12,
      });

      // 色环七色小点装饰（体现原型色块主题）
      const dotColors = [...COLOR_RING, 'white'];
      const dotGap = 24;
      const dotStartX = width / 2 - ((dotColors.length - 1) * dotGap) / 2;
      dotColors.forEach((cid, idx) => {
        renderer.circle({
          x: dotStartX + idx * dotGap,
          y: panelY + 68,
          r: 6,
          fill: COLOR_META[cid].swatch,
          stroke: '#12151c',
          lineWidth: 1.5,
        });
      });

      drawText(renderer, {
        text: '主循环、场景切换与基础色块模块已拼装完成。',
        x: width / 2,
        y: panelY + 90,
        size: 14,
        color: UI_THEME.textSecondary,
        align: 'center',
      });

      // 点击「试打」后的占位提示条
      if (notice) {
        renderer.rect({
          x: panelX + 36,
          y: panelY + 200,
          w: panelW - 72,
          h: 38,
          fill: '#182438',
          stroke: '#4a7fe0',
          lineWidth: 1,
          radius: 6,
        });
        drawText(renderer, {
          text: notice,
          x: width / 2,
          y: panelY + 219,
          size: 13,
          color: '#b8d4ff',
          align: 'center',
          baseline: 'middle',
        });
      } else {
        drawText(renderer, {
          text: '点击上方按钮测试界面交互（战斗内容留到阶段 1）',
          x: width / 2,
          y: panelY + 212,
          size: 12,
          color: UI_THEME.textMuted,
          align: 'center',
        });
      }

      // 渲染按钮与悬停提示框
      ui.render(renderer);
    },
  };
}
