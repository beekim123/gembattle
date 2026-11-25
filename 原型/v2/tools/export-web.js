// 一键导出网页试玩包：node tools/export-web.js [--out dist]
// 把运行游戏要用的代码（从 app/main.js 顺着 import 找全）和 app/index.html 里点名的 31 个工坊脚本，
// 抽进 dist/，再打成 index.html 在根目录的纯静态 zip（dist/code00-forest-web.zip）。
// 直接上传 itch.io（HTML5，选 Restricted 密码访问），朋友点链接就能玩，不用装任何东西，也不用本地服务。
// 工坊目录（美术/）只读：这里只读它的文件，绝不写回去。
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, statSync } from 'node:fs';
import { dirname, join, resolve, relative, posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipEntries } from './zip.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
export const ART_ROOT = resolve(ROOT, '../../美术/像素堆叠生物工坊');
export const ZIP_NAME = 'code00-forest-web.zip';

// 顺着 import / export ... from / import() 找全要用的 js（相对路径），返回相对 ROOT 的文件列表
export function collectModules(entry = 'app/main.js', root = ROOT) {
  const seen = new Set(), stack = [entry];
  const re = /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+)['"](\.{1,2}\/[^'"]+)['"]/g;
  while (stack.length) {
    const rel = stack.pop();
    if (seen.has(rel)) continue;
    const file = join(root, rel);
    if (!existsSync(file)) throw new Error(`找不到被引用的文件：${rel}`);
    seen.add(rel);
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(re)) stack.push(posix.normalize(posix.join(posix.dirname(rel), m[1])));
  }
  return [...seen].sort();
}

// index.html 里点名的工坊脚本（../art/ 开头）
export function artScripts(html) { return [...html.matchAll(/<script src="\.\.\/art\/([^"]+)"/g)].map(m => m[1]); }

// 导出用的入口页：路径改成相对根目录；file:// 打开时给一句提示（浏览器不让 file:// 用模块脚本）
export function rewriteIndex(html) {
  const notice = `<script>
  if (location.protocol === 'file:') document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('err').textContent = '这个页面要放到网站上打开（比如上传到 itch.io），或在本文件夹里运行 python3 -m http.server 再访问 http://localhost:8000 。浏览器不允许直接双击打开。';
  });
</script>`;
  return html
    .replaceAll('"../art/', '"./art/')
    .replace('src="./main.js"', 'src="./app/main.js"')
    .replace('<script type="module"', notice + '\n<script type="module"');
}

export function buildExport({ outDir = join(ROOT, 'dist'), artRoot = ART_ROOT, root = ROOT, quiet = false } = {}) {
  const html = readFileSync(join(root, 'app/index.html'), 'utf8');
  const arts = artScripts(html);
  if (arts.length !== 31) throw new Error(`index.html 里应当点名 31 个工坊脚本，实际 ${arts.length} 个`);
  const entries = [{ name: 'index.html', data: Buffer.from(rewriteIndex(html), 'utf8') }];
  for (const rel of collectModules('app/main.js', root)) entries.push({ name: rel, data: readFileSync(join(root, rel)) });
  for (const rel of arts) {
    const file = join(artRoot, rel);
    if (!existsSync(file)) throw new Error(`工坊里没有这个脚本：${rel}`);
    entries.push({ name: 'art/' + rel, data: readFileSync(file) });
  }
  entries.sort((a, b) => (a.name === 'index.html' ? -1 : b.name === 'index.html' ? 1 : a.name.localeCompare(b.name)));

  rmSync(outDir, { recursive: true, force: true });
  for (const e of entries) { const f = join(outDir, e.name); mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, e.data); }
  const zip = zipEntries(entries);
  const zipPath = join(outDir, ZIP_NAME);
  writeFileSync(zipPath, zip);
  const total = entries.reduce((a, e) => a + e.data.length, 0);
  if (!quiet) {
    console.log(`已导出 ${entries.length} 个文件（运行代码 ${entries.length - arts.length - 1} 个，工坊脚本 ${arts.length} 个，入口页 1 个），共 ${(total / 1024).toFixed(0)} KB`);
    console.log(`网页试玩包：${relative(process.cwd(), zipPath) || zipPath}（${(zip.length / 1024).toFixed(0)} KB）`);
    console.log('上传 itch.io：新建项目 → Kind of project 选 HTML → 上传这个 zip，勾选 This file will be played in the browser → Visibility 选 Restricted 并设密码。');
  }
  return { entries, zipPath, zip, outDir };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const oi = process.argv.indexOf('--out');
  const outDir = oi >= 0 ? resolve(process.argv[oi + 1]) : join(ROOT, 'dist');
  try { buildExport({ outDir }); } catch (err) { console.error('导出失败：', err.message); process.exit(1); }
}
