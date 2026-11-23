// 自动截图工具（零依赖）：内置临时本地小服务 + 本机 Chrome 无头模式 + CDP WebSocket。
// 不需要人工点浏览器，也能同步检查页面有没有 console.error 或未捕获 JS 异常。
//
// 默认一键截全套：
//   npm run shot
//   node tools/shot.js
//
// 指定单页截取：
//   node tools/shot.js /modules/battle-view/demo.html --out shots/custom.png --width 1040 --height 640

import { access, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { startServer } from './serve.js';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

const DEFAULT_JOBS = [
  {
    name: '试打选仗台（阶段 1 入口）',
    path: '/app/',
    out: 'shots/app.png',
    width: 1040,
    height: 600,
    full: false,
  },
  {
    name: '实战·双色盾（自动帮排预览）',
    path: '/app/?encounter=dual_shield&seed=shot-dual-1',
    out: 'shots/battle-dual-shield.png',
    width: 1040,
    height: 600,
    full: false,
    clicks: [{ x: 750, y: 306 }], // 点「自动帮排」看排链和两行算式预览
  },
  {
    name: '实战·一群怪（打出飘纯数字）',
    path: '/app/?encounter=pack_mixed&seed=shot-pack-1',
    out: 'shots/battle-pack-cast.png',
    width: 1040,
    height: 600,
    full: false,
    clicks: [
      { x: 750, y: 306 }, // 点「自动帮排」
      { x: 780, y: 260, frames: 1, waitMs: 650 }, // 点「打出」看飘字与总伤面板
    ],
    freeze: true,
  },
  {
    name: '实战·看门的 3 条血',
    path: '/app/?encounter=gatekeeper_layer2&seed=shot-gate-1',
    out: 'shots/battle-gatekeeper.png',
    width: 1040,
    height: 600,
    full: false,
  },
  {
    name: '实战·万发飘字压测（12 张大链）',
    path: '/app/?encounter=dual_shield&stress=1&seed=shot-stress',
    out: 'shots/battle-stress.png',
    width: 1040,
    height: 600,
    full: false,
    clicks: [
      { x: 750, y: 306 }, // 自动帮排 12 张
      { x: 780, y: 260, frames: 1, waitMs: 650 }, // 打出上万发
    ],
    freeze: true,
  },
  {
    name: 'battle-view 假数据演示页',
    path: '/modules/battle-view/demo.html',
    out: 'shots/battle-view-demo.png',
    width: 1040,
    height: 640,
    full: false,
  },
  {
    name: 'shared 演示页',
    path: '/modules/shared/demo.html',
    out: 'shots/shared-demo.png',
    width: 1200,
    height: 820,
    full: true,
  },
  {
    name: 'render 统一接口演示页',
    path: '/modules/render/demo.html',
    out: 'shots/render-demo.png',
    width: 1040,
    height: 640,
    full: false,
  },
  {
    name: 'render/blocks 演示页',
    path: '/modules/render/blocks/demo.html',
    out: 'shots/render-blocks-demo.png',
    width: 1040,
    height: 640,
    full: false,
  },
  {
    name: 'ui 小件演示页',
    path: '/modules/ui/demo.html',
    out: 'shots/ui-demo.png',
    width: 1040,
    height: 640,
    full: false,
  },
];

async function findChrome() {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // 继续查下一个
    }
  }
  throw new Error('没找到可用的 Chrome / Chromium。可设置环境变量 CHROME_PATH 指向浏览器可执行文件。');
}

function parseCliArgs(argv) {
  if (argv.length === 0) return DEFAULT_JOBS;

  const pagePath = argv[0].startsWith('/') ? argv[0] : `/${argv[0]}`;
  let out = 'shots/page.png';
  let width = 1040;
  let height = 640;
  let full = false;
  const clicks = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--out' && argv[i + 1]) out = argv[++i];
    else if (arg === '--width' && argv[i + 1]) width = Number(argv[++i]);
    else if (arg === '--height' && argv[i + 1]) height = Number(argv[++i]);
    else if (arg === '--full') full = true;
    else if (arg === '--click-canvas' && argv[i + 1]) {
      const [x, y] = argv[++i].split(',').map(Number);
      clicks.push({ x, y });
    }
  }

  return [{ name: pagePath, path: pagePath, out, width, height, full, clicks }];
}

function launchChrome(chromePath, userDataDir) {
  return new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(
      chromePath,
      [
        '--headless=new',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--hide-scrollbars',
        '--remote-debugging-port=0',
        `--user-data-dir=${userDataDir}`,
        'about:blank',
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );

    let stderrBuf = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      rejectPromise(new Error(`启动无头 Chrome 超时。stderr:\n${stderrBuf}`));
    }, 15000);

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk;
      const match = stderrBuf.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:(\d+)\/devtools\/browser\/[^\s]+)/);
      if (match) {
        clearTimeout(timer);
        resolvePromise({ child, debugPort: Number(match[2]) });
      }
    });

    child.once('error', (err) => {
      clearTimeout(timer);
      rejectPromise(err);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      rejectPromise(new Error(`Chrome 提前退出（code=${code}）：\n${stderrBuf}`));
    });
  });
}

class CdpClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async connect() {
    await new Promise((resolvePromise, rejectPromise) => {
      const ws = new WebSocket(this.wsUrl);
      this.ws = ws;
      ws.addEventListener('open', () => resolvePromise());
      ws.addEventListener('error', (ev) => rejectPromise(new Error(`CDP 连接失败：${ev.message || 'unknown'}`)));
      ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(String(ev.data));
        if (msg.id) {
          const item = this.pending.get(msg.id);
          if (item) {
            this.pending.delete(msg.id);
            if (msg.error) item.reject(new Error(`CDP ${item.method} 失败：${msg.error.message}`));
            else item.resolve(msg.result);
          }
          return;
        }
        if (msg.method) {
          const handlers = this.listeners.get(msg.method);
          if (handlers) {
            for (const fn of handlers) fn(msg.params);
          }
        }
      });
    });
  }

  on(method, fn) {
    if (!this.listeners.has(method)) this.listeners.set(method, new Set());
    this.listeners.get(method).add(fn);
    return () => this.listeners.get(method)?.delete(fn);
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolvePromise, rejectPromise) => {
      this.pending.set(id, { method, resolve: resolvePromise, reject: rejectPromise });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    if (this.ws && this.ws.readyState <= 1) {
      this.ws.close();
    }
  }
}

async function waitForPageLoad(cdp, navigateUrl) {
  let loadedResolve;
  const loadedPromise = new Promise((r) => { loadedResolve = r; });
  const off = cdp.on('Page.loadEventFired', () => loadedResolve());
  try {
    await cdp.send('Page.navigate', { url: navigateUrl });
    await Promise.race([
      loadedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`页面加载超时：${navigateUrl}`)), 12000)),
    ]);
  } finally {
    off();
  }
}

async function waitFrames(cdp, count = 3) {
  await cdp.send('Runtime.evaluate', {
    awaitPromise: true,
    expression: `(async () => {
      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      for (let i = 0; i < ${count}; i++) {
        await new Promise((r) => requestAnimationFrame(r));
      }
    })()`,
  });
}

async function clickLogicalCanvas(cdp, lx, ly, settleFrames = 6) {
  const evalRes = await cdp.send('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => {
      const c = document.querySelector('canvas');
      if (!c) return null;
      const r = c.getBoundingClientRect();
      const logical = window.__CODE00_APP__?.getLogicalSize?.() || { width: 960, height: 540 };
      return {
        x: r.left + (${lx} / logical.width) * r.width,
        y: r.top + (${ly} / logical.height) * r.height,
      };
    })()`,
  });
  const pt = evalRes.result?.value;
  if (!pt) throw new Error('页面没找到 canvas，无法执行点击');

  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: pt.x, y: pt.y, button: 'none' });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pt.x, y: pt.y, button: 'left', clickCount: 1 });
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 12, y: 12, button: 'none' });
  await waitFrames(cdp, settleFrames);
}

async function runJob(cdp, origin, job) {
  const errors = [];
  const offException = cdp.on('Runtime.exceptionThrown', (params) => {
    const desc = params.exceptionDetails?.exception?.description || params.exceptionDetails?.text || '未知运行时异常';
    errors.push(`Runtime 异常：${desc}`);
  });
  const offConsole = cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      const msg = (params.args || []).map((a) => a.value ?? a.description ?? '').join(' ');
      errors.push(`console.error：${msg}`);
    }
  });

  try {
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: job.width,
      height: job.height,
      deviceScaleFactor: 2,
      mobile: false,
    });

    const targetUrl = `${origin}${job.path}`;
    await waitForPageLoad(cdp, targetUrl);
    await waitFrames(cdp, 4);

    if (Array.isArray(job.clicks)) {
      for (const pt of job.clicks) {
        await clickLogicalCanvas(cdp, pt.x, pt.y, pt.frames ?? 6);
        if (pt.waitMs) {
          await cdp.send('Runtime.evaluate', { awaitPromise: true, expression: `new Promise((r) => setTimeout(r, ${Number(pt.waitMs)}))` });
        }
      }
    }
    if (job.freeze) {
      // 停住主循环再截：飘字只活一秒多，截图本身就要几百毫秒
      await cdp.send('Runtime.evaluate', { expression: 'window.__CODE00_APP__?.freeze?.()' });
    }

    let captureParams = { format: 'png' };
    if (job.full) {
      const metrics = await cdp.send('Page.getLayoutMetrics');
      const content = metrics.cssContentSize || metrics.contentSize;
      const fullH = Math.ceil(content.height);
      await cdp.send('Emulation.setDeviceMetricsOverride', {
        width: job.width,
        height: Math.max(job.height, fullH),
        deviceScaleFactor: 2,
        mobile: false,
      });
      await waitFrames(cdp, 2);
      captureParams = { format: 'png', captureBeyondViewport: true };
    }

    const { data } = await cdp.send('Page.captureScreenshot', captureParams);
    const outAbs = resolve(ROOT, job.out);
    await mkdir(dirname(outAbs), { recursive: true });
    await writeFile(outAbs, Buffer.from(data, 'base64'));

    if (errors.length > 0) {
      throw new Error(`页面 ${job.path} 产生错误：\n  ${errors.join('\n  ')}`);
    }

    console.log(`✔ ${job.name}（${job.path}）→ ${relative(ROOT, outAbs)}`);
  } finally {
    offException();
    offConsole();
  }
}

async function main() {
  const jobs = parseCliArgs(process.argv.slice(2));
  const chromePath = await findChrome();
  const userDataDir = await mkdtemp(join(tmpdir(), 'code00-shot-'));
  const srv = await startServer({ port: 0, silent: true });

  let chromeChild = null;
  let cdp = null;

  try {
    const launched = await launchChrome(chromePath, userDataDir);
    chromeChild = launched.child;

    const listRes = await fetch(`http://127.0.0.1:${launched.debugPort}/json/list`);
    const targets = await listRes.json();
    const pageTarget = targets.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
    if (!pageTarget) throw new Error('未能获取 Chrome 页面调试通道');

    cdp = new CdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');

    for (const job of jobs) {
      await runJob(cdp, srv.origin, job);
    }
    console.log(`全部 ${jobs.length} 张截图完成，无任何页面报错。`);
  } finally {
    if (cdp) cdp.close();
    if (chromeChild && chromeChild.exitCode === null) {
      const exited = new Promise((r) => chromeChild.once('exit', r));
      chromeChild.kill('SIGTERM');
      await Promise.race([
        exited,
        new Promise((r) => setTimeout(() => {
          if (chromeChild.exitCode === null) chromeChild.kill('SIGKILL');
          r();
        }, 3000)),
      ]);
    }
    await srv.close();
    await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  }
}

main().catch((err) => {
  console.error('截图失败：', err.message);
  process.exit(1);
});
