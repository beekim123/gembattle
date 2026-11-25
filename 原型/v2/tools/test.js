// 一键跑全部单测：node tools/test.js
// 极简测试器：每个 *.test.js 默认导出 (t) => { t.test('名字', () => {...}) }。
import { readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
function findTests(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) findTests(p, out);
    else if (name.endsWith('.test.js')) out.push(p);
  }
  return out;
}

const cases = [];
const t = { test: (name, fn) => cases.push({ name, fn }), assert };
const files = findTests(ROOT).sort();
for (const f of files) {
  const mod = await import(pathToFileURL(f).href);
  const before = cases.length;
  mod.default(t);
  for (let i = before; i < cases.length; i++) cases[i].file = relative(ROOT, f);
}

let pass = 0, fail = 0;
for (const c of cases) {
  try { await c.fn(); pass++; console.log('  通过  ' + c.name); }
  catch (e) { fail++; console.log('  失败  ' + c.name + '\n        ' + c.file + '\n        ' + String(e.stack || e).split('\n').slice(0, 6).join('\n        ')); }
}
console.log(`\n${pass} 个通过，${fail} 个失败（共 ${cases.length} 个，${files.length} 个文件）`);
process.exit(fail ? 1 : 0);
