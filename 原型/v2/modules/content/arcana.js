// 8 张原生秘术牌（混入 29 张宝石牌循环）。
// instant：无色，拖进链区松手立刻生效，并自动补摸 1 张，不占链位。
// chain：带色，拖进链尾参与接链。pool 里的色是「摸到时随机定色」。
import { WHITE } from '../shared/index.js';

export const ARCANA = {
  spring: { id: 'spring', kind: 'instant', name: '涌泉抽牌', text: '立即额外摸 2 张牌（可突破回合上限，手里最多 12 张）。' },
  ward: { id: 'ward', kind: 'instant', name: '护身结界', text: '获得 1 层护壁，完整抵挡下一次敌方攻击。' },
  shatter: { id: 'shatter', kind: 'instant', name: '震裂破甲', text: '直接击碎目标 2 格任意颜色护盾。目标没有护盾时用不了。' },
  surge: { id: 'surge', kind: 'instant', name: '魔力沸腾', text: '本回合所有宝石每发伤害 +50%。' },
  resonance: { id: 'resonance', kind: 'instant', name: '双色共鸣', text: '立即点亮色环上当前颜色左右相邻的 2 色。需要先有当前色。' },
  refract: { id: 'refract', kind: 'chain', color: WHITE, name: '逆色折射', text: '白色。视作前一张牌的补色，强制触发合白。' },
  prism: { id: 'prism', kind: 'chain', pool: [0, 2, 4], name: '倍增棱镜', text: '摸到时随机定为红 / 绿 / 蓝。正常接链，链倍率额外再 ×2 一次。' },
  keep: { id: 'keep', kind: 'chain', pool: [1, 3, 5], name: '凝色留存', text: '摸到时随机定为黄 / 青 / 紫。正常接链；本回合末手里最多 1 张留牌不占下回合上限。' },
};
export const ARCANA_IDS = Object.keys(ARCANA);
export const JUNK = { id: 'junk', name: '缠藤废牌', text: '没有用的牌，占一个手牌位。拖进链区可以直接丢掉（不补牌）。' };

let seq = 0;
// uid 前缀区分来源，同一趟里不会重复
export function makeArcanaCard(id, uid) {
  const d = ARCANA[id];
  const c = { uid: uid || 'a' + (++seq), color: d.kind === 'instant' ? -1 : (d.color ?? d.pool[0]), arcana: id };
  return c;
}
export function makeJunkCard(uid) { return { uid: uid || 'j' + (++seq), color: -1, junk: true }; }
export const isInstant = c => !!c && (c.junk || (c.arcana && ARCANA[c.arcana].kind === 'instant'));
export const isGem = c => !!c && !c.arcana && !c.junk;
