// 一键运行全部单测（不开浏览器，纯 Node 内置 node:test）。
// 用法：npm test 或 node tools/test.js

import { readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

async function findTestFiles(dir, out = []) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'shots') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      await findTestFiles(full, out);
    } else if (entry.name.endsWith('.test.js')) {
      out.push(full);
    }
  }
  return out;
}

const testFiles = (await findTestFiles(ROOT)).sort();

if (testFiles.length === 0) {
  console.error('没有找到任何 *.test.js 测试文件。');
  process.exit(1);
}

console.log(`正在运行 ${testFiles.length} 个测试文件（Node ${process.version}，不开浏览器）：`);
for (const file of testFiles) {
  console.log(`  - ${relative(ROOT, file)}`);
}
console.log('');

const child = spawn(process.execPath, ['--test', ...testFiles], {
  cwd: ROOT,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`测试进程被信号中断：${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
