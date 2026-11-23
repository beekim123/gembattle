// 自动化解耦与硬约束边界守卫单测（随 npm test 一起在 Node 中运行）。
// 检查：模块齐全、无超前空目录、跨模块只走 index.js、无越界依赖、核心模块不碰 DOM、全目录无禁用套路字。

import test from 'node:test';
import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const ALLOWED_MODULE_DEPS = {
  shared: [],
  content: ['shared'],
  'battle-rules': ['shared'],
  render: ['shared'],
  ui: ['shared', 'render'],
  'battle-view': ['shared', 'render', 'ui'],
  'run-rules': ['shared'],
  'explore-view': ['shared', 'render', 'ui'],
  app: ['shared', 'content', 'battle-rules', 'render', 'ui', 'battle-view', 'run-rules', 'explore-view'],
};

const FORBIDDEN_FUTURE_MODULES = [
  'save',
  'guild',
  'recruit',
  'depart',
  'album',
  'hub',
];

// 用码点构造，防止源码本身触发字面命中
const FORBIDDEN_CHAR_RE = /[\u706f\u70ec\u5f71\u591c\u9b42\u566c\u5e7d\u6e0a\u661f\u5149]/g;
const GUARDIAN_PATTERN_RE = /\u5b88[\u4e00-\u9fa5]\u8005/g;
// 排除常规汉语虚词搭配（之一、之间、之和、之外、之前、之后、之内等），抓命名套路格式
const ZHI_PATTERN_RE = /[\u4e00-\u9fa5]\u4e4b(?![\u4e00\u95f4\u548c\u5916\u524d\u540e\u5185\u5904\u7c7b\u6240])[\u4e00-\u9fa5]/g;

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function walkFiles(dir, result = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'shots') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(full, result);
    } else {
      result.push(full);
    }
  }
  return result;
}

function getOwnerZone(filePath) {
  const rel = relative(ROOT, filePath).split(sep);
  if (rel[0] === 'modules' && rel[1]) return rel[1];
  if (rel[0] === 'app') return 'app';
  return null;
}

function extractRelativeImports(code) {
  const specifiers = [];
  const re = /(?:import|export)\s+(?:[^'"]*?\s+from\s+)?['"](\.\.?\/[^'"]+)['"]|import\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;
  let match;
  while ((match = re.exec(code)) !== null) {
    specifiers.push(match[1] || match[2]);
  }
  return specifiers;
}

function extractModuleScripts(html) {
  const blocks = [];
  const re = /<script\b[^>]*type=["']module["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

test('模块目录齐全，且不提前创建阶段 3 以后的空目录', async () => {
  const requiredModules = [
    { path: 'modules/shared', needDemo: true },
    { path: 'modules/content', needDemo: false },
    { path: 'modules/battle-rules', needDemo: false },
    { path: 'modules/render', needDemo: true },
    { path: 'modules/render/blocks', needDemo: true },
    { path: 'modules/ui', needDemo: true },
    { path: 'modules/battle-view', needDemo: true },
    { path: 'modules/run-rules', needDemo: false },
    { path: 'modules/explore-view', needDemo: true },
  ];

  for (const unit of requiredModules) {
    const base = join(ROOT, unit.path);
    assert.equal(await exists(join(base, 'index.js')), true, `${unit.path} 缺少 index.js`);
    assert.equal(await exists(join(base, 'README.md')), true, `${unit.path} 缺少 README.md`);
    assert.equal(await exists(join(base, 'test')), true, `${unit.path} 缺少 test/ 目录`);
    if (unit.needDemo) {
      assert.equal(await exists(join(base, 'demo.html')), true, `${unit.path} 缺少 demo.html`);
    }
  }

  for (const futureMod of FORBIDDEN_FUTURE_MODULES) {
    assert.equal(
      await exists(join(ROOT, 'modules', futureMod)),
      false,
      `阶段 2 不应提前创建未来目录：modules/${futureMod}`,
    );
  }
});

test('跨模块依赖严格遵守解耦规矩：只走 index.js，且不越界互相引用', async () => {
  const files = await walkFiles(ROOT);
  const violations = [];

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (ext !== '.js' && ext !== '.html') continue;

    const zone = getOwnerZone(file);
    if (!zone || !(zone in ALLOWED_MODULE_DEPS)) continue;

    const raw = await readFile(file, 'utf8');
    const chunks = ext === '.html' ? extractModuleScripts(raw) : [raw];
    const allowedTargets = ALLOWED_MODULE_DEPS[zone];

    for (const chunk of chunks) {
      for (const spec of extractRelativeImports(chunk)) {
        const targetAbs = resolve(dirname(file), spec);
        const targetRel = relative(ROOT, targetAbs).split(sep);

        if (targetRel[0] === '..') {
          violations.push(`${relative(ROOT, file)} 引用了原型目录外的文件：${spec}`);
          continue;
        }

        const targetZone = targetRel[0] === 'modules' ? targetRel[1] : targetRel[0];
        if (targetZone === zone) continue;

        if (targetRel[0] === 'modules') {
          if (!allowedTargets.includes(targetZone)) {
            violations.push(`${relative(ROOT, file)}（${zone}）违规依赖了 ${targetZone}：${spec}`);
          }
          const expectedEntry = join(ROOT, 'modules', targetZone, 'index.js');
          if (targetAbs !== expectedEntry) {
            violations.push(`${relative(ROOT, file)} 越过 ${targetZone}/index.js 直接导入内部文件：${spec}`);
          }
        } else if (targetRel[0] === 'app') {
          violations.push(`${relative(ROOT, file)}（${zone}）不允许反向依赖 app/：${spec}`);
        }
      }
    }
  }

  assert.deepEqual(violations, [], `发现解耦边界违规：\n${violations.join('\n')}`);
});

test('modules/ 下的 JS 模块代码不直接访问 document / window 全局对象', async () => {
  const files = await walkFiles(join(ROOT, 'modules'));
  const domHits = [];

  for (const file of files) {
    if (extname(file).toLowerCase() !== '.js') continue;
    const raw = await readFile(file, 'utf8');
    const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    if (/\b(?:document|window|HTMLCanvasElement)\b/.test(stripped)) {
      domHits.push(relative(ROOT, file));
    }
  }

  assert.deepEqual(domHits, [], `以下模块代码直接触碰了浏览器全局对象：${domHits.join(', ')}`);
});

test('原型全目录文本不含禁用的十个套路字或固定套路格式', async () => {
  const files = await walkFiles(ROOT);
  const hits = [];

  for (const file of files) {
    const ext = extname(file).toLowerCase();
    if (!['.js', '.html', '.md', '.json', '.command'].includes(ext)) continue;
    const content = await readFile(file, 'utf8');
    const charMatches = content.match(FORBIDDEN_CHAR_RE);
    const guardianMatches = content.match(GUARDIAN_PATTERN_RE);
    const zhiMatches = content.match(ZHI_PATTERN_RE);
    if (charMatches || guardianMatches || zhiMatches) {
      const found = [...new Set([...(charMatches || []), ...(guardianMatches || []), ...(zhiMatches || [])])];
      hits.push(`${relative(ROOT, file)} 命中：${found.join('、')}`);
    }
  }

  assert.deepEqual(hits, [], `发现禁用用词：\n${hits.join('\n')}`);
});
