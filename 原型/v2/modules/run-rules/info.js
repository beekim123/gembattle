// 路线图上悬停一个节点时显示的详情：类型、生态、敌人、战利品、风险。
import { ENCOUNTERS, MONSTERS, BIOMES, LOOT, EVENTS, GOLD_DROP } from '../content/index.js';
import { biomeOfNode } from './trip.js';

export const TYPE_NAME = { battle: '遭遇战', elite: '强敌战', event: '林中偶遇', shop: '行商营帐', camp: '营火整备', boss: '林地首领' };

const shieldText = sh => (sh ? ['红', '绿', '蓝'].map((n, i) => (sh[i] ? `${n}盾 ${sh[i]} 格` : '')).filter(Boolean).join('、') : '无盾');
const atkText = h => (h >= 1 ? `扣 ${h} 心` : '扣半心');

export function nodeInfo(node) {
  const biome = BIOMES[biomeOfNode(node)].name;
  const info = { title: TYPE_NAME[node.type], biome, lines: [], loot: null, risk: '' };
  if (node.enc) {
    const enc = ENCOUNTERS[node.enc];
    info.title = `${TYPE_NAME[node.type]}：${enc.title}`;
    for (const e of enc.enemies) {
      const b0 = e.bars[0];
      const bars = e.bars.length > 1 ? `${e.bars.length} 条血（各 ${b0.hp}）` : `血 ${b0.hp}`;
      info.lines.push(`${MONSTERS[e.monster].name}：${bars}，${shieldText(b0.shield)}，倒计时 ${e.countdown}（${atkText(e.hearts)}）`);
    }
    info.lines.push(enc.lesson);
    if (node.loot) { info.loot = LOOT[node.loot]; }
    const gold = GOLD_DROP[node.type];
    if (gold) info.lines.push(`掉落金币 ${gold}`);
    info.risk = node.type === 'boss' ? '这是终点：所有路线最后都汇到这里。'
      : node.type === 'elite' ? '血厚、倒计时短，打不好要掉心；赢了有手牌扩容。' : '普通战斗，输了才会掉心。';
  } else if (node.type === 'event') {
    info.title = '林中偶遇：？';
    info.lines.push('走近了才知道会遇到什么。');
    info.lines.push('一般是二选一：有的要花心或金币，有的送你东西。');
    info.risk = '有些选项要扣半颗心或几十金币，不想碰可以绕开。';
  } else if (node.type === 'shop') {
    info.lines.push('花本趟打怪掉落的金币：印记 2 个、秘术牌 2 张、宝石雕琢 1 次、红果饮 1 瓶（回半颗心）。');
    info.risk = '没有战斗，没有风险。';
  } else if (node.type === 'camp') {
    info.lines.push('三选一：围火疗伤（回 1 颗心）、雕琢宝石、清理行囊（删 1 张秘术牌或废牌）。');
    info.risk = node.step === 7 ? '这一步所有路线都要经过：打首领前回心或雕琢。' : '没有战斗，没有风险。';
  }
  return info;
}
