// 界面公共色板与字体。字号以 960×540 布局单位计，最小 12 单位 = 1920×1080 下的 24px。
export const FONT = '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif';
export const MIN_FONT = 12;
export const font = (size, weight = 600) => `${weight} ${Math.max(MIN_FONT, size)}px ${FONT}`;

// 色环六色 + 白
export const WHEEL_HEX = ['#e2483c', '#efc93f', '#4cb050', '#3fbac4', '#4474dd', '#9254cf', '#f4f0e6'];
export const WHEEL_DARK = ['#8e1f18', '#9a7a10', '#1f6a24', '#14727c', '#1f3f9a', '#561e8c', '#9a9684'];
// 宝石三原色（牌面圆点、宝石等级条）
export const GEM_HEX = ['#ff5a4a', '#52d65a', '#5a8cff'];
export const ART_HEX = { red: '#ff6b5a', green: '#62e06a', blue: '#6a98ff', white: '#ffffff', rainbow: '#ffd0ff' };

export const REL_HEX = { start: '#cfd8dc', near: '#6fe07a', comp: '#ffd24a', wild: '#fff1b8', break: '#ff7a6a' };
export const INK = '#f4efe4';
export const PANEL = 'rgba(14,22,16,0.62)';
export const GOLD = '#ffd24a';
