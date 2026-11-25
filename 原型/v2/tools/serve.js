// 本地静态小服务：托管 原型/v2/，并把 /art/ 只读映射到 ../../美术/像素堆叠生物工坊/。
// 命令行：node tools/serve.js [--port 8200] [--open]
// 程序调用：import { startServer } from './serve.js'
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const ART_ROOT = resolve(ROOT, '../../美术/像素堆叠生物工坊');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.wav': 'audio/wav', '.mp3': 'audio/mpeg',
};

// 把请求路径变成磁盘路径；跳出根目录的一律拒绝。/art/ 只读映射到工坊目录。
export function mapPath(urlPath) {
  let p;
  try { p = decodeURIComponent(urlPath.split('?')[0].split('#')[0]); } catch { return null; }
  if (p === '/') p = '/app/index.html';
  let base = ROOT;
  if (p.startsWith('/art/')) { base = ART_ROOT; p = p.slice(4); }
  const full = normalize(join(base, p));
  if (full !== base && !full.startsWith(base + sep)) return null;
  return full;
}

export function startServer({ port = 8200, host = '127.0.0.1' } = {}) {
  const server = createServer(async (req, res) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405).end('只读服务'); return; }
    const file = mapPath(req.url || '/');
    if (!file) { res.writeHead(403).end('403'); return; }
    try {
      let target = file;
      const st = await stat(target);
      if (st.isDirectory()) target = join(target, 'index.html');
      const data = await readFile(target);
      res.writeHead(200, { 'Content-Type': MIME[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404 ' + req.url);
    }
  });
  return new Promise((ok, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => ok(server));
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--port');
  const port = pi >= 0 ? Number(args[pi + 1]) : 8200;
  startServer({ port }).then(() => {
    const url = `http://localhost:${port}/app/index.html`;
    console.log(`code00 v2 原型已启动：${url}\n（按 Ctrl+C 或关掉窗口停止）`);
    if (args.includes('--open')) spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { stdio: 'ignore', detached: true }).unref();
  }).catch(err => { console.error('启动失败：', err.message); process.exit(1); });
}
