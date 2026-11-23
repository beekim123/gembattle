// modules/ui 公共界面配色与尺寸主题（纯色块风格，引用 shared 七色常量）。

import { COLOR_META } from '../shared/index.js';
import { DEFAULT_FONT_FAMILY } from '../render/index.js';

export const UI_THEME = Object.freeze({
  font: DEFAULT_FONT_FAMILY,
  bg: '#171a22',
  panelBg: '#202532',
  panelHeaderBg: '#272e3e',
  panelBorder: '#3b455c',
  textPrimary: '#eef2f9',
  textSecondary: '#a6b2c7',
  textMuted: '#6f7b92',
  numberNormal: '#eef2f9',
  numberAccent: COLOR_META.yellow.swatch,
  numberCrit: '#ff7d6b',
  tooltipBg: '#12151c',
  tooltipBorder: '#576685',
  buttons: Object.freeze({
    primary: Object.freeze({
      fill: '#376bc9',
      hoverFill: '#4a7fe0',
      pressedFill: '#2956a8',
      border: '#8ab4ff',
      text: '#ffffff',
    }),
    default: Object.freeze({
      fill: '#2a3142',
      hoverFill: '#353f56',
      pressedFill: '#212736',
      border: '#505c78',
      text: '#eef2f9',
    }),
    danger: Object.freeze({
      fill: '#9c3640',
      hoverFill: '#b8434e',
      pressedFill: '#7d2831',
      border: '#f09aa3',
      text: '#ffffff',
    }),
    disabled: Object.freeze({
      fill: '#222630',
      border: '#353b4a',
      text: '#6d7588',
    }),
  }),
});
