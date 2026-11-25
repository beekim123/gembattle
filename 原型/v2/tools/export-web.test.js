// 导出脚本的测试：真的导一遍到临时目录，再把 zip 读回来逐项核对。
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildExport, collectModules, artScripts, rewriteIndex, isPack, ART_ROOT } from './export-web.js';
import { readZip, zipEntries, crc32 } from './zip.js';

// 方案 4.2 清单：31 个工坊脚本（内核 6 + 地貌 1 + 主角与行商 2 + 怪物 8 + 摆件与建筑 14）
const PLAN_4_2 = [
  'core/math.js', 'core/voxel.js', 'core/solvers.js', 'core/behaviors.js', 'core/renderer.js', 'core/registry.js',
  'scenes/habitats.js', 'npc/npc_mage.js', 'npc/npc_gear_smith.js',
  'creatures/slime.js', 'creatures/earth2_barometz.js', 'creatures/goblin.js', 'creatures/fairy.js',
  'creatures/earth6_long_arm.js', 'creatures/earth3_zheng.js', 'creatures/earth1_belly_maw.js', 'creatures/tree3_leshy.js',
  'scenes/scene_forest_tree.js', 'scenes/scene_t09_fallen_fruit_log.js', 'scenes/scene_t17_swamp_cypress.js',
  'scenes/scene_flora_cluster.js', 'scenes/scene_t10_giant_bud.js', 'scenes/scene_t16_moss_obelisk.js', 'buildings/building_ruin_arch.js',
  'scenes/scene_t11_canopy_bough.js', 'scenes/scene_t11_epiphyte_nest.js',
  'scenes/scene_campfire.js', 'scenes/scene_rock_hollow.js', 'scenes/scene_crates_sign.js', 'buildings/building_camp_tent.js', 'buildings/building_stone_gate.js',
];

// 已接入的界面与特效包（第 1 段：地面与特效；第 2 段再接另外 4 个）
const PACKS_NOW = ['art-packs/pack_ground_vfx.js'];

export default function (t) {
  t.test('zip 读写：往返一致，坏文件会被发现', () => {
    const files = [{ name: 'a.txt', data: Buffer.from('你好 hello '.repeat(50)) }, { name: 'dir/b.bin', data: Buffer.from([1, 2, 3, 4]) }, { name: 'empty.txt', data: Buffer.alloc(0) }];
    const back = readZip(zipEntries(files));
    t.assert.deepEqual(back.map(f => f.name), files.map(f => f.name));
    back.forEach((f, i) => t.assert.ok(f.data.equals(files[i].data)));
    t.assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
    const bad = Buffer.from(zipEntries([{ name: 'x', data: Buffer.from('abcdefg') }]));
    bad[bad.indexOf('abcdefg')] = 0x7a;
    t.assert.throws(() => readZip(bad));
    t.assert.deepEqual(zipEntries(files), zipEntries(files), '同样的输入出同样的包');
  });

  t.test('入口页点名的资产脚本，正好是方案 4.2 的 31 个；美术包是已接入的那几个', () => {
    const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
    const all = artScripts(html), got = all.filter(a => !isPack(a)), packs = all.filter(isPack);
    t.assert.equal(got.length, 31);
    t.assert.deepEqual([...got].sort(), [...PLAN_4_2].sort());
    t.assert.equal(new Set(all).size, all.length, '没有重复');
    t.assert.deepEqual([...packs].sort(), [...PACKS_NOW].sort());
  });

  t.test('实装库的清单和入口页对得上：31 个资产路径一个不少，接入的包文件都在 art-packs/ 里', () => {
    const man = JSON.parse(readFileSync(join(ART_ROOT, 'manifest.json'), 'utf8'));
    const listed = Object.values(man.groups).flat().map(x => x.path);
    for (const rel of [...PLAN_4_2, ...PACKS_NOW]) t.assert.ok(listed.includes(rel), rel + ' 要登记在 manifest.json');
  });

  t.test('入口页改写：路径变成相对根目录，file:// 打开会提示', () => {
    const out = rewriteIndex(readFileSync(new URL('../app/index.html', import.meta.url), 'utf8'));
    t.assert.doesNotMatch(out, /\.\.\/art\//);
    t.assert.match(out, /src="\.\/art\/core\/math\.js"/);
    t.assert.match(out, /src="\.\/app\/main\.js"/);
    t.assert.match(out, /file:/);
  });

  t.test('运行代码从 main.js 顺着 import 找全：含假玩家，不含单测', () => {
    const mods = collectModules('app/main.js');
    for (const need of ['app/main.js', 'app/flow.js', 'app/autopilot.js', 'app/record.js', 'modules/audio/index.js', 'modules/audio/bgm.js', 'modules/render/workshop-adapter.js', 'modules/render/world-stage.js', 'modules/render/camera.js', 'modules/render/battle-pose.js', 'modules/ui/audio-bar.js', 'modules/run-rules/record.js']) t.assert.ok(mods.includes(need), need);
    t.assert.ok(!mods.some(m => /\.test\.js$|\/tests\//.test(m)), '不带单测');
    t.assert.ok(!mods.some(m => m.startsWith('tools/')));
  });

  t.test('导出一遍：index.html 在 zip 根目录，资产脚本和美术包逐字节照搬实装库，没有单测，没有越界路径', () => {
    const dir = mkdtempSync(join(tmpdir(), 'code00-export-'));
    try {
      const { zip, entries } = buildExport({ outDir: dir, quiet: true });
      const files = readZip(zip), names = files.map(f => f.name);
      t.assert.equal(names[0], 'index.html');
      t.assert.equal(names.filter(n => n.startsWith('art/')).length, 31 + PACKS_NOW.length);
      for (const rel of [...PLAN_4_2, ...PACKS_NOW]) {
        const f = files.find(x => x.name === 'art/' + rel);
        t.assert.ok(f, rel);
        t.assert.ok(f.data.equals(readFileSync(join(ART_ROOT, rel))), rel + ' 要和实装库里的一个字都不差');
      }
      t.assert.ok(names.every(n => !n.includes('..') && !n.startsWith('/')), '路径里没有 .. 或绝对路径');
      t.assert.ok(!names.some(n => /\.test\.js$|\/tests\//.test(n)));
      t.assert.ok(names.includes('app/main.js') && names.includes('modules/audio/sfx.js'));
      t.assert.equal(entries.length, files.length);
      t.assert.ok(zip.length < 4 * 1024 * 1024, '包很小：' + zip.length);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
