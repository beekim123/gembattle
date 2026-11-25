#!/usr/bin/env node
'use strict';

// =============================================================================
// 把「制作清单」+「全品类模板规划」+「脚本创建/修改时间」同步成 app/catalog.js（工坊左栏用）。
//
// 用法（在工坊目录里）：
//   node tools/sync-catalog.js
//
// 数据来源（单一真源，别手改 app/catalog.js）：
//   1. 文档/生物图鉴与逐只精制规划.md 第三节（怪物 42 条与状态）
//   2. 文档/全品类模板规划与参考.md（怪物骨架类型 M01~M17 + NPC/建筑/场景待做模板）
//   3. creatures/ npc/ buildings/ scenes/ 实际脚本的文件创建与修改时间
// =============================================================================

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, '文档', '生物图鉴与逐只精制规划.md');
const TPL_SRC = path.join(ROOT, '文档', '全品类模板规划与参考.md');
const OUT = path.join(ROOT, 'app', 'catalog.js');

const KNOWN_ASSETS = {
  '特1': 'slime_jelly',
  '特2': 'bat_cavern',
  '特3': 'fairy_meadow',
  '特4': 'goblin_scout',
  '特5': 'murloc_tide',
  '特6': 'snake_wyrm',
  '特7': 'siren_tide',
  '特8': 'feilong_drake',
  '特9': 'special9_long'
};

const CODE_PREFIX = { sky: '天', water: '水', sea: '海', earth: '地', tree: '树', sand: '沙', cave: '洞', marsh: '泽', special: '特' };
const STATUS = { ' ': 'todo', '~': 'draft', 'x': 'done', 'X': 'done' };

function fmtTime(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function guessCodeFromId(id) {
  const m = /^([a-z]+)(\d+)_/.exec(id || '');
  if (m && CODE_PREFIX[m[1]]) return CODE_PREFIX[m[1]] + m[2];
  return null;
}

// 1. 扫描各目录脚本的创建时间（birthtimeMs）与修改时间（mtimeMs）
const assetTimes = Object.create(null);
const codeToAssetId = Object.create(null);
for (const [c, id] of Object.entries(KNOWN_ASSETS)) codeToAssetId[c] = id;

for (const dirName of ['creatures', 'npc', 'buildings', 'scenes']) {
  const dirPath = path.join(ROOT, dirName);
  if (!fs.existsSync(dirPath)) continue;
  for (const file of fs.readdirSync(dirPath)) {
    if (!file.endsWith('.js') || file === 'habitats.js') continue;
    const full = path.join(dirPath, file);
    const st = fs.statSync(full);
    const srcText = fs.readFileSync(full, 'utf8');
    const defBlock = /\b(?:const|let|var)\s+\w*Def\s*=\s*\{([\s\S]{0,420})/.exec(srcText);
    const body = defBlock ? defBlock[1] : srcText;
    const idMatch = /\bid\s*:\s*['"]([a-zA-Z0-9_-]+)['"]/.exec(body);
    const codeMatch = /\bcode\s*:\s*['"]([^'"]+)['"]/.exec(body);
    const id = idMatch ? idMatch[1] : file.replace(/\.js$/, '');
    const createdAt = Math.round((st.birthtimeMs && st.birthtimeMs > 1000000000) ? st.birthtimeMs : st.mtimeMs);
    const updatedAt = Math.round(st.mtimeMs);
    assetTimes[id] = {
      file: `${dirName}/${file}`,
      createdAt,
      updatedAt,
      createdLabel: fmtTime(createdAt),
      updatedLabel: fmtTime(updatedAt)
    };
    const code = (codeMatch && codeMatch[1]) || guessCodeFromId(id);
    if (code && !codeToAssetId[code]) codeToAssetId[code] = id;
  }
}

// 2. 解析 全品类模板规划与参考.md（怪物骨架类型 M01~M17 + NPC/建筑/场景/拓展载体模板）
const typeGroups = [];          // [{ code: 'M01', name: '脉冲漂浮 / 悬停', label: 'M01 脉冲漂浮 / 悬停', spec, sample, status }]
const codeToType = Object.create(null); // '地3' -> { code: 'M07', name: '...', label: '...' }
const extraCreatureTemplates = [];      // M14 / M15 / M17 等尚未进图鉴表的新拓展怪物模板
const categoryTemplates = { npc: [], building: [], scene: [], vfx: [] };

if (fs.existsSync(TPL_SRC)) {
  const tplMd = fs.readFileSync(TPL_SRC, 'utf8');
  let section = '';
  for (const raw of tplMd.split('\n')) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      if (line.includes('怪物')) section = 'creature';
      else if (line.includes('NPC')) section = 'npc';
      else if (line.includes('建筑')) section = 'building';
      else if (line.includes('场景')) section = 'scene';
      else if (line.includes('动态机制')) section = 'vfx';
      else section = '';
      continue;
    }
    if (!section || !line.startsWith('| `[')) continue;
    const cells = line.split('|').slice(1, -1).map(s => s.trim());
    if (cells.length < 6) continue;
    const mark = (/`\[(.)\]`/.exec(cells[0]) || [])[1] || ' ';
    const status = STATUS[mark] || 'todo';
    const tplCode = cells[1].replace(/\*/g, '').trim();
    const typeName = cells[2].replace(/\*\*/g, '').trim();
    const sample = cells[3].replace(/\*\*/g, '').replace(/`/g, '').trim();
    const covers = cells[4].replace(/\*\*/g, '').trim();
    const spec = cells[5].replace(/\*\*/g, '').trim();

    if (section === 'creature') {
      const label = `${tplCode} ${typeName}`;
      typeGroups.push({ code: tplCode, name: typeName, label, sample, covers, spec, status });
      const codes = [...covers.matchAll(/[天水海地树沙洞泽特]\d+/g)].map(m => m[0]);
      for (const c of codes) codeToType[c] = { code: tplCode, name: typeName, label };
      if (!codes.length) {
        // 尚无图鉴代号的拓展骨架模板（如 M14 / M15 / M17）
        const sugMatch = /([a-z]+\d*_[a-z0-9_]+)/i.exec(sample);
        extraCreatureTemplates.push({
          code: tplCode,
          group: '拓展骨架模板',
          typeCode: tplCode,
          typeName,
          typeLabel: label,
          status,
          ref: sample,
          nick: typeName,
          size: '中~大',
          look: sample,
          habit: spec,
          blocks: covers,
          habitats: ['林地落果空坪'],
          suggestedId: sugMatch ? sugMatch[1] : `special_${tplCode.toLowerCase()}`,
          isTemplateOnly: true
        });
      }
    } else if (categoryTemplates[section]) {
      const idMatch = /([a-z]+_[a-z0-9_]+)/i.exec(sample);
      const suggestedId = idMatch ? idMatch[1] : `${section}_${tplCode.toLowerCase()}`;
      const displayName = sample.includes('·') ? sample.split('·').slice(1).join('·').trim() : typeName;
      categoryTemplates[section].push({
        code: tplCode,
        category: section,
        typeCode: tplCode,
        typeName,
        typeLabel: `${tplCode} ${typeName}`,
        name: displayName,
        suggestedId,
        covers,
        spec,
        status
      });
    }
  }
}

// 3. 解析 生物图鉴与逐只精制规划.md 第三节
const md = fs.readFileSync(SRC, 'utf8');
const lines = md.split('\n');

const nick = {};
for (const m of md.matchAll(/`([天水海地树沙洞泽特]\d+)（([^）]+)）`/g)) {
  if (!nick[m[1]]) nick[m[1]] = m[2];
}

const groups = [];
const items = [];
let group = null;
let inSection3 = false;
for (const raw of lines) {
  const line = raw.trim();
  if (line.startsWith('## ')) inSection3 = line.includes('全量');
  if (!inSection3) continue;
  const g = /^###\s*\d+\.\s*(.+?)（/.exec(line);
  if (g) {
    group = g[1].trim();
    groups.push(group);
    continue;
  }
  if (!group || !line.startsWith('| `[')) continue;
  const cells = line.split('|').slice(1, -1).map(s => s.trim());
  if (cells.length < 8) continue;
  const mark = (/`\[(.)\]`/.exec(cells[0]) || [])[1] || ' ';
  const code = cells[1].replace(/\*/g, '').trim();
  const typeInfo = codeToType[code] || { code: 'M00', name: '其他未归类', label: 'M00 其他未归类' };
  const mappedId = codeToAssetId[code] || null;
  const timeInfo = (mappedId && assetTimes[mappedId]) || null;

  items.push({
    code,
    group,
    typeCode: typeInfo.code,
    typeName: typeInfo.name,
    typeLabel: typeInfo.label,
    status: STATUS[mark] || 'todo',
    ref: cells[2],
    nick: nick[code] || '',
    size: cells[3].replace(/\*/g, ''),
    look: cells[4].replace(/\*\*/g, ''),
    habit: cells[5].replace(/\*\*/g, ''),
    blocks: cells[6],
    habitats: cells[7].split('/').map(s => s.trim()).filter(Boolean),
    createdAt: timeInfo ? timeInfo.createdAt : 0,
    updatedAt: timeInfo ? timeInfo.updatedAt : 0,
    createdLabel: timeInfo ? timeInfo.createdLabel : '',
    updatedLabel: timeInfo ? timeInfo.updatedLabel : ''
  });
}

// 追加 M14/M15/M17 拓展骨架模板条目，方便在「按类型分类」和「待做筛选」里一目了然
if (extraCreatureTemplates.length) {
  groups.push('拓展骨架模板');
  for (const ex of extraCreatureTemplates) {
    items.push({ ...ex, createdAt: 0, updatedAt: 0, createdLabel: '', updatedLabel: '' });
  }
}

const payload = {
  source: '文档/生物图鉴与逐只精制规划.md',
  templateSource: '文档/全品类模板规划与参考.md',
  groups,
  typeGroups,
  knownAssets: KNOWN_ASSETS,
  assetTimes,
  templates: categoryTemplates,
  items
};

const out = `'use strict';

// 自动生成，别手改。来源：文档/生物图鉴与逐只精制规划.md + 文档/全品类模板规划与参考.md
// 重新生成：node tools/sync-catalog.js
window.PixelWorkshop = window.PixelWorkshop || {};
window.PixelWorkshop.Catalog = ${JSON.stringify(payload, null, 2)};
`;
fs.writeFileSync(OUT, out);
console.log(
  `已写入 ${path.relative(ROOT, OUT)}：` +
  `生境组 ${groups.length} / 骨架类型 ${typeGroups.length} / 怪物条目 ${items.length}` +
  `（待做 ${items.filter(i => i.status === 'todo').length} / 初版 ${items.filter(i => i.status === 'draft').length} / 精制完成 ${items.filter(i => i.status === 'done').length}）` +
  ` / 已扫描脚本时间戳 ${Object.keys(assetTimes).length} 个` +
  ` / 非怪模板 NPC ${categoryTemplates.npc.length} · 建筑 ${categoryTemplates.building.length} · 场景 ${categoryTemplates.scene.length}`
);
