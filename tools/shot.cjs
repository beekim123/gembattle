// 无窗口试玩 + 截图：用 Electron 开一个隐藏窗口跑游戏，按脚本操作、截图、收控制台输出。
// 用法：npx electron tools/shot.cjs <脚本.js> [输出目录=/tmp/shots] [宽=1280] [高=720]
// 脚本是一个 module.exports = async (g) => { ... }，g 提供：
//   g.js(code)          在页面里执行 JS，返回结果（可 await）
//   g.wait(ms)          等
//   g.shot(name)        截图存成 <输出目录>/<name>.png
//   g.key(k, ms)        按住一个键 ms 毫秒（k 用 Electron keyCode，如 'W'、'Shift'、'Escape'）
//   g.click(x, y)       在 1280×720 的界面坐标上点一下
//   g.drag(x0,y0,x1,y1) 拖
//   g.log(...)          往终端打印
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const [scriptArg, outArg, wArg, hArg] = process.argv.slice(2).filter(a => !a.startsWith('--'));
const OUT = outArg || '/tmp/shots';
const W = +(wArg || 1280), H = +(hArg || 720);
fs.mkdirSync(OUT, { recursive: true });

app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: W, height: H, show: false, useContentSize: true, paintWhenInitiallyHidden: true,
    webPreferences: { backgroundThrottling: false } });
  const logs = [];
  win.webContents.on('console-message', (e, level, message, line, src) => {
    const m = typeof e === 'object' && e.message !== undefined ? e : { level, message, lineNumber: line, sourceId: src };
    const s = `[${m.level}] ${m.message}${m.sourceId ? ` (${path.basename(String(m.sourceId))}:${m.lineNumber})` : ''}`;
    logs.push(s); console.log('页面:', s);
  });
  win.webContents.on('render-process-gone', (e, d) => console.log('渲染进程挂了', d));
  const url = 'file://' + path.join(__dirname, '..', 'index.html') + (process.env.Q ? '?' + process.env.Q : '');
  await win.loadURL(url);
  const ui = (x, y) => win.webContents.executeJavaScript(`(()=>{const r=document.getElementById('stage').getBoundingClientRect();return [r.left+${x}/1280*r.width, r.top+${y}/720*r.height];})()`);
  const g = {
    js: code => win.webContents.executeJavaScript(code),
    wait: ms => new Promise(r => setTimeout(r, ms)),
    shot: async name => { const im = await win.webContents.capturePage(); fs.writeFileSync(path.join(OUT, name + '.png'), im.toPNG()); console.log('截图', path.join(OUT, name + '.png')); },
    key: async (k, ms = 100) => { win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }); await g.wait(ms); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k }); },
    keyDown: k => win.webContents.sendInputEvent({ type: 'keyDown', keyCode: k }),
    keyUp: k => win.webContents.sendInputEvent({ type: 'keyUp', keyCode: k }),
    move: async (x, y) => { const [px, py] = await ui(x, y); win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(px), y: Math.round(py) }); },
    click: async (x, y) => {
      const [px, py] = await ui(x, y), X = Math.round(px), Y = Math.round(py);
      win.webContents.sendInputEvent({ type: 'mouseMove', x: X, y: Y });
      win.webContents.sendInputEvent({ type: 'mouseDown', x: X, y: Y, button: 'left', clickCount: 1 });
      await g.wait(30);
      win.webContents.sendInputEvent({ type: 'mouseUp', x: X, y: Y, button: 'left', clickCount: 1 });
      await g.wait(30);
    },
    drag: async (x0, y0, x1, y1, steps = 8) => {
      const [a, b] = await ui(x0, y0), [c, d] = await ui(x1, y1);
      win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(a), y: Math.round(b) });
      win.webContents.sendInputEvent({ type: 'mouseDown', x: Math.round(a), y: Math.round(b), button: 'left', clickCount: 1 });
      for (let i = 1; i <= steps; i++) { await g.wait(16); win.webContents.sendInputEvent({ type: 'mouseMove', x: Math.round(a + (c - a) * i / steps), y: Math.round(b + (d - b) * i / steps), button: 'left' }); }
      win.webContents.sendInputEvent({ type: 'mouseUp', x: Math.round(c), y: Math.round(d), button: 'left', clickCount: 1 });
      await g.wait(30);
    },
    log: (...a) => console.log(...a),
    logs,
  };
  try {
    const fn = require(path.resolve(scriptArg));
    await fn(g);
  } catch (e) { console.log('脚本出错', e); }
  const errs = logs.filter(l => l.startsWith('[3]') || l.startsWith('[error]') || /Error|错/.test(l));
  console.log(errs.length ? `控制台有 ${errs.length} 条错误` : '控制台没有错误');
  app.quit();
});
