// 「样子」表：每个会动的东西（怪、主角、队友、地图上的小东西）带一个 look 编号，
// 画面模块只说「在这儿画 look=xxx，姿势是 yyy」，长什么样由渲染后端决定。
// 色块后端（这里）画成一摞往上叠的色块；以后的堆叠后端（stack/）照同一个编号，
// 换成用户在 美术/像素堆叠生物工坊/ 里做的怪（art 那一栏先空着，到时候填工坊里的 id）。

export const LOOKS = Object.freeze({
  // 主角、队友
  hero: { hue: '#3a3550', top: '#e8cfa0', eyes: null, size: 1, art: null },
  ally_assassin: { hue: '#3a3550', top: '#9a78c2', eyes: null, size: 0.85, art: null },
  ally_support: { hue: '#3a3550', top: '#86d6a6', eyes: null, size: 0.85, art: null },
  ally_tank: { hue: '#3a3550', top: '#86b4dc', eyes: null, size: 0.95, art: null },
  ally_warrior: { hue: '#3a3550', top: '#e09a62', eyes: null, size: 0.9, art: null },

  // 怪（编号只说是哪种怪，不是名字）
  mon_dual_shield: { hue: '#4f5a86', top: '#9aa8e6', eyes: '#ffe27a', size: 1, art: null },
  mon_recorded_down: { hue: '#4a6a52', top: '#8fd09a', eyes: '#ffe27a', size: 1, art: null },
  mon_fast: { hue: '#7a4a3a', top: '#e0906a', eyes: '#ffe27a', size: 0.85, art: null },
  mon_pack_tank: { hue: '#5b4f7e', top: '#9d8ad6', eyes: '#ffe27a', size: 1.05, art: null },
  mon_pack_small: { hue: '#6a5a3a', top: '#d8c07a', eyes: '#1a1406', size: 0.6, art: null },
  mon_halve: { hue: '#5a4a6e', top: '#c08ad6', eyes: '#ffe27a', size: 1, art: null },
  mon_elite: { hue: '#6a4a2e', top: '#d8a25a', eyes: '#ffe27a', size: 1.15, art: null },
  mon_gatekeeper: { hue: '#463a7e', top: '#8f7ae8', eyes: '#ff6b6b', size: 1.3, art: null },
});

const FALLBACK = { hue: '#5b4f7e', top: '#9d8ad6', eyes: '#ffe27a', size: 1, art: null };

export function getLook(id) {
  return LOOKS[id] || FALLBACK;
}
