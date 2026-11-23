// 本地小服务：把这份原型目录通过 http://127.0.0.1 发出来，方便浏览器加载原生 ES 模块。
// 命令行用法：node tools/serve.js [--port 8000] [--open]
// 程序调用：import { startServer } from './serve.js'
// 只监听本机 127.0.0.1，不装任何外部依赖。

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exec } from 'node:child_process';

const DEFAULT_ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DEFAULT_START_PAGE = '/app/';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function createHandler(root, startPage) {
  return async function handle(req, res) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url || '/', 'http://127.0.0.1').pathname);
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('请求路径无效');
      return;
    }

    if (pathname === '/') {
      res.writeHead(302, { Location: startPage }).end();
      return;
    }

    // 限制在原型根目录内，不许越界读取外部文件
    let filePath = normalize(join(root, pathname));
    if (filePath !== root && !filePath.startsWith(root + sep)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' }).end('禁止访问目录外的文件');
      return;
    }

    try {
      const info = await stat(filePath);
      if (info.isDirectory()) {
        filePath = join(filePath, 'index.html');
      }
      const body = await readFile(filePath);
      const mime = MIME_TYPES[extname(filePath).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, {
        'Content-Type': mime,
        'Cache-Control': 'no-store',
      });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`没有这个文件：${pathname}`);
    }
  };
}

function openBrowser(url) {
  const cmd = process.platform === 'darwin'
    ? `open "${url}"`
    : process.platform === 'win32'
      ? `start "" "${url}"`
      : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

/**
 * 启动本地静态服务。
 * @param {object} [options]
 * @param {string} [options.root] 根目录，默认当前原型根目录
 * @param {number} [options.port] 首选端口；传 0 时由系统分配空闲端口
 * @param {number} [options.tries] 端口被占时往后顺延尝试次数
 * @param {string} [options.startPage] 根路径跳转页，默认 /app/
 * @param {boolean} [options.open] 是否自动用浏览器打开
 * @param {boolean} [options.silent] 是否静默不打终端提示
 * @returns {Promise<{ server: import('node:http').Server, port: number, origin: string, url: string, close: () => Promise<void> }>}
 */
export function startServer(options = {}) {
  const {
    root = DEFAULT_ROOT,
    port = 8000,
    tries = 20,
    startPage = DEFAULT_START_PAGE,
    open = false,
    silent = false,
  } = options;

  const handler = createHandler(root, startPage);

  return new Promise((resolvePromise, rejectPromise) => {
    function attempt(currentPort, triesLeft) {
      const server = createServer(handler);
      server.once('error', (err) => {
        if (err.code === 'EADDRINUSE' && currentPort !== 0 && triesLeft > 0) {
          attempt(currentPort + 1, triesLeft - 1);
          return;
        }
        rejectPromise(err);
      });

      server.listen(currentPort, '127.0.0.1', () => {
        const address = server.address();
        const actualPort = typeof address === 'object' && address ? address.port : currentPort;
        const origin = `http://127.0.0.1:${actualPort}`;
        const displayOrigin = `http://localhost:${actualPort}`;
        const url = `${displayOrigin}${startPage}`;

        if (!silent) {
          console.log(`code00 原型已启动：${url}`);
          console.log('各模块演示页也可从这个地址打开，例如：');
          console.log(`  - ${displayOrigin}/modules/shared/demo.html`);
          console.log(`  - ${displayOrigin}/modules/render/demo.html`);
          console.log(`  - ${displayOrigin}/modules/render/blocks/demo.html`);
          console.log(`  - ${displayOrigin}/modules/ui/demo.html`);
          console.log('关掉这个窗口，或按 Ctrl+C，即可停止服务。');
        }

        if (open) openBrowser(url);

        resolvePromise({
          server,
          port: actualPort,
          origin,
          url,
          close: () => new Promise((done) => server.close(() => done())),
        });
      });
    }

    attempt(port, tries);
  });
}

// 直接作为命令行脚本运行时才监听端口
const isEntry = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isEntry) {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf('--port');
  const firstPort = portIndex >= 0 ? Number(args[portIndex + 1]) : 8000;
  const shouldOpen = args.includes('--open');

  if (!Number.isInteger(firstPort) || firstPort < 0 || firstPort > 65535) {
    console.error('端口参数无效：', args[portIndex + 1]);
    process.exit(1);
  }

  startServer({ port: firstPort, open: shouldOpen }).catch((err) => {
    console.error('开不了本地小服务：', err.message);
    process.exit(1);
  });
}
