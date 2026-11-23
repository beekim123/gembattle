// 轻量 UI 交互层：不碰 DOM，只接收逻辑指针坐标，管理按钮悬停/按下/点击与提示框。

import { drawButton, hitTestRect } from './button.js';
import { drawTooltip } from './tooltip.js';

export function createUiLayer() {
  let buttons = [];
  let hoveredId = null;
  let pressedId = null;
  let pointer = { x: -1, y: -1, inside: false };
  let manualTooltip = null;

  function findButtonAt(x, y) {
    // 后注册的按钮在上层，逆序检测
    for (let i = buttons.length - 1; i >= 0; i--) {
      if (hitTestRect(buttons[i], x, y)) return buttons[i];
    }
    return null;
  }

  function setButtons(nextButtons) {
    buttons = Array.isArray(nextButtons) ? nextButtons : [];
    if (pointer.inside) {
      const hit = findButtonAt(pointer.x, pointer.y);
      hoveredId = hit ? hit.id : null;
    }
  }

  function setTooltip(tip) {
    manualTooltip = tip || null;
  }

  function getCursor() {
    const hovered = buttons.find((b) => b.id === hoveredId);
    return hovered && !hovered.disabled ? 'pointer' : 'default';
  }

  function onPointerMove(x, y) {
    pointer = { x, y, inside: true };
    const hit = findButtonAt(x, y);
    hoveredId = hit ? hit.id : null;
    return { hoveredId, cursor: getCursor() };
  }

  function onPointerDown(x, y) {
    pointer = { x, y, inside: true };
    const hit = findButtonAt(x, y);
    hoveredId = hit ? hit.id : null;
    pressedId = hit && !hit.disabled ? hit.id : null;
    return { hoveredId, pressedId, cursor: getCursor() };
  }

  function onPointerUp(x, y) {
    pointer = { x, y, inside: true };
    const hit = findButtonAt(x, y);
    hoveredId = hit ? hit.id : null;
    let clickedId = null;
    if (hit && !hit.disabled && hit.id === pressedId) {
      clickedId = hit.id;
      if (typeof hit.onClick === 'function') {
        hit.onClick(hit);
      }
    }
    pressedId = null;
    return { hoveredId, clickedId, cursor: getCursor() };
  }

  function onPointerLeave() {
    pointer = { x: -1, y: -1, inside: false };
    hoveredId = null;
    pressedId = null;
    return { hoveredId: null, cursor: 'default' };
  }

  function render(renderer) {
    let activeTip = manualTooltip;

    for (const btn of buttons) {
      let state = 'normal';
      if (btn.disabled) {
        state = 'disabled';
      } else if (pressedId === btn.id && hoveredId === btn.id) {
        state = 'pressed';
      } else if (hoveredId === btn.id) {
        state = 'hover';
      }
      drawButton(renderer, btn, state);

      if (!activeTip && hoveredId === btn.id && btn.tooltip && pointer.inside) {
        activeTip = {
          ...btn.tooltip,
          x: pointer.x,
          y: pointer.y,
        };
      }
    }

    if (activeTip) {
      drawTooltip(renderer, activeTip, renderer.getSize());
    }
  }

  return {
    setButtons,
    setTooltip,
    onPointerMove,
    onPointerDown,
    onPointerUp,
    onPointerLeave,
    render,
    getState: () => ({ hoveredId, pressedId, cursor: getCursor() }),
  };
}
