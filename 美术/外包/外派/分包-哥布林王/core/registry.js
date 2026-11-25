'use strict';

window.PixelWorkshop = window.PixelWorkshop || {};

// =============================================================================
// 资产登记：工坊里所有能放上台的东西（怪物 / NPC / 建筑 / 场景摆件）都在这里登记。
//
// 每个资产脚本照旧调用：
//   PW.Creatures.push(Def)                 // 怪物（旧写法，继续可用）
//   PW.Assets.register(Def, 'npc')         // NPC / 建筑 / 场景摆件
//
// Def 里可以多写这几个字段（都可选）：
//   code:     '天1'          对上 文档/生物图鉴与逐只精制规划.md 和 app/catalog.js 里的编号；
//                            不写的话，id 用 sky1_xxx / water3_xxx 这种前缀也能自动对上
//   status:   'draft' | 'done'   初版 / 精制完成（不写当 draft）
//   actions:  [{ id, name, loop, duration, status }]
//             展示动作清单。默认是「自由巡游」「原地待机」两个循环动作；
//             以后加技能展示，就在这里加 { id: 'skill_xxx', name: '…', loop: false, duration: 2.4 }，
//             脚本的 update() 从 eco.action / eco.actionTime 读当前在放哪个动作、放了几秒。
// =============================================================================
(function (PW) {
  const CATEGORIES = [
    { id: 'creature', name: '怪物', dir: 'creatures/' },
    { id: 'npc', name: 'NPC', dir: 'npc/' },
    { id: 'building', name: '建筑', dir: 'buildings/' },
    { id: 'scene', name: '场景环境', dir: 'scenes/' }
  ];

  const DEFAULT_ACTIONS = [
    { id: 'patrol', name: '自由巡游', loop: true, status: 'draft' },
    { id: 'idle', name: '原地待机', loop: true, status: 'draft' }
  ];

  // id 前缀 → 清单编号的字头
  const CODE_PREFIX = { sky: '天', water: '水', sea: '海', earth: '地', tree: '树', sand: '沙', cave: '洞', marsh: '泽', special: '特' };

  const list = [];
  const byId = Object.create(null);

  function guessCode(id) {
    const m = /^([a-z]+)(\d+)_/.exec(id || '');
    if (m && CODE_PREFIX[m[1]]) return CODE_PREFIX[m[1]] + m[2];
    return null;
  }

  function register(def, category) {
    if (!def || !def.id) throw new Error('资产缺 id');
    if (byId[def.id]) return def;
    def.category = def.category || category || 'creature';
    if (!def.code) def.code = guessCode(def.id);
    if (!def.status) def.status = 'draft';
    if (!def._scriptSrc && typeof document !== 'undefined' && document.currentScript) {
      def._scriptSrc = document.currentScript.getAttribute('src') || '';
    }
    if (!Array.isArray(def.actions) || !def.actions.length) def.actions = DEFAULT_ACTIONS.map(a => ({ ...a }));
    list.push(def);
    byId[def.id] = def;
    return def;
  }

  // 生成一个实例。传 template（同一种资产的另一个实例）时共用它的部件：
  // 体素模型不再重建，烘焙缓存也共用（缓存挂在部件对象上），同屏放几十只同种怪也不涨内存。
  function spawn(def, opts, template) {
    const makeCanvas = PW.Renderer.makeCanvas;
    const inst = def.createInstance(makeCanvas, opts || {});
    if (template && template.parts && inst.parts) {
      for (const k of Object.keys(template.parts)) inst.parts[k] = template.parts[k];
      if (inst.partListAssets) inst.partListAssets = Object.values(inst.parts);
      inst.sharedWith = template;
    }
    return inst;
  }

  // 旧写法 PW.Creatures.push(Def) 也走登记
  const creatures = PW.Creatures || [];
  for (const d of creatures) register(d, 'creature');
  creatures.push = function (...defs) {
    for (const d of defs) register(d, 'creature');
    return Array.prototype.push.apply(this, defs);
  };
  PW.Creatures = creatures;

  PW.Assets = { CATEGORIES, DEFAULT_ACTIONS, CODE_PREFIX, list, byId, register, spawn, guessCode };
})(window.PixelWorkshop);
