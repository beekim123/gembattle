// 4 个林中偶遇（二选一）。文案照方案文档 3.3。
// effect 的含义在 run-rules/events.js 里执行；need 是选项能不能选的条件。
export const EVENTS = {
  old_wood: {
    id: 'old_wood', name: '红果老木', biome: 'forest',
    text: '空心倒木里淌出温热的红果浆。',
    options: [
      { id: 'drink', label: '俯身舀饮', note: '扣半颗心（最多扣到剩半颗），获 1 次印记三选一', effect: 'hurt_seal' },
      { id: 'leave', label: '绕道离开', note: '什么也不发生', effect: 'none' },
    ],
  },
  moss_stele: {
    id: 'moss_stele', name: '青苔古碑', biome: 'ruins',
    text: '碑面凹槽里嵌着半枚无色晶石，摸上去微微发烫。',
    options: [
      { id: 'hone', label: '以碑砺晶', note: '任挑 1 张宝石雕琢，往牌组塞 1 张缠藤废牌', effect: 'carve_junk' },
      { id: 'leave', label: '离开', note: '什么也不发生', effect: 'none' },
    ],
  },
  spring_pool: {
    id: 'spring_pool', name: '林泉水洼', biome: 'swamp',
    text: '石缝间渗出带着矿香的清泉，水底沉着几枚旧币。',
    options: [
      { id: 'bathe', label: '投入 30 金币洗礼', note: '回 1 颗心', effect: 'pay_heal', cost: 30 },
      { id: 'leave', label: '直接离开', note: '什么也不发生', effect: 'none' },
    ],
  },
  hollow_bag: {
    id: 'hollow_bag', name: '树洞遗囊', biome: 'forest',
    text: '树根空腔里塞着前一位旅人落下的干瘪皮袋。',
    options: [
      { id: 'trade', label: '以旧换钱', note: '删 1 张秘术牌或废牌，换 25 金币', effect: 'purge_gold' },
      { id: 'search', label: '翻找内袋', note: '随机得 1 张秘术牌', effect: 'rand_arcana' },
    ],
  },
};
export const EVENT_IDS = Object.keys(EVENTS);
