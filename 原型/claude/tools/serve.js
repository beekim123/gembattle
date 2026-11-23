// 本地小服务：把这份原型的目录用 http://localhost 发出来，浏览器才能加载 ES 模块。
// 用法：node tools/serve.js [--port 8000] [--open]
// 只监听本机 127.0.0.1，别的电脑连不上。不用装任何依赖。

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const portArg = args.indexOf('--port');
const firstPort = portArg >= 0 ? Number(args[portArg + 1]) : 8000;
const shouldOpen = args.includes('--open');
const startPage = '/app/';

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

async function handle(req, res) {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400).end('bad request');
    return;
  }
  if (path === '/') {
    res.writeHead(302, { Location: startPage }).end();
    return;
  }
  // 不许跳出原型目录
  let file = normalize(join(root, path));
  if (file !== root && !file.startsWith(root + sep)) {
    res.writeHead(403).end('forbidden');
    return;
  }
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store', // 改了代码刷新就能看到
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('没有这个文件：' + path);
  }
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin' ? `open "${url}"`
    : process.platform === 'win32' ? `start "" "${url}"`
    : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

function listen(port, triesLeft) {
  const server = createServer(handle);
  server.once('error', (err) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) listen(port + 1, triesLeft - 1);
    else { console.error('开不了本地小服务：', err.message); process.exit(1); }
  });
  server.listen(port, '127.0.0.1', () => {
    const url = `http://localhost:${port}${startPage}`;
    console.log(`code00 原型已经开好：${url}`);
    console.log('别的页面也从这个地址往下找，比如 /modules/<模块>/demo.html');
    console.log('关掉这个窗口，或者按 Ctrl+C，就停了。');
    if (shouldOpen) openBrowser(url);
  });
}

listen(firstPort, 20);
