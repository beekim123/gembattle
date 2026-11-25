// 禁用字扫描：整个 v2 目录（代码、页面、文档）里不许出现。
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
// 用转义写，免得这个文件自己被扫到
const BAD = /[\u706f\u70ec\u5f71\u591c\u9b42\u566c\u5e7d\u6e0a\u661f\u5149]|\u5b88.\u8005|\u4e4b/;
function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    if (n === 'node_modules' || n.startsWith('.') || n === 'dist') continue;
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|html|md|json|command)$/.test(n)) out.push(p);
  }
  return out;
}
export default function (t) {
  t.test('全部文件里没有禁用字（十个字和两种格式）', () => {
    const bad = [];
    for (const f of walk(ROOT)) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => { if (BAD.test(line)) bad.push(`${relative(ROOT, f)}:${i + 1}  ${line.trim().slice(0, 50)}`); });
    }
    t.assert.deepEqual(bad, []);
  });
}
