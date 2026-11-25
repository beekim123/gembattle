import { generateMap, nodeInfo, TYPE_NAME } from '../index.js';
export default function (t) {
  t.test('每个节点都有悬停详情：标题、生态；战斗节点带战利品', () => {
    for (let s = 1; s <= 60; s++) {
      for (const n of Object.values(generateMap(s).nodes)) {
        const i = nodeInfo(n);
        t.assert.ok(i.title && i.biome && i.lines.length, n.id);
        if (n.type === 'battle' || n.type === 'elite') t.assert.ok(i.loot && i.loot.name, n.id);
        t.assert.ok(TYPE_NAME[n.type]);
      }
    }
  });
}
