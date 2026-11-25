// 唯一组装处：画布缩放（960×540 布局单位 → 1920×1080）、主循环、输入分发。
import { Flow } from './flow.js';
import { initArt, beginArtFrame, artMode, artInfo, artStats } from '../modules/render/index.js';
import { audio } from '../modules/audio/index.js';

const W = 960, H = 540;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const errBox = document.getElementById('err');
let scale = 2;
// ?dpr=1 把画布的物理像素压到 1920×1080（测帧率、模拟 1080p 屏幕用）；默认跟屏幕走，最多 2 倍。
// 不再自动降分辨率：主画布上没有滤镜和实时模糊，2 倍屏也应当稳在 120 帧以上。按 P 键看性能浮层。
const dprParam = Number(new URLSearchParams(location.search).get('dpr'));
const dprCap = dprParam || 2;

// 性能浮层（P 键开关）：只是一块 DOM 文字，每 0.4 秒刷新一次，不占画布。
const perfEl = document.getElementById('perf');
const perf = { on: false, frames: 0, dt: 0, cpu: 0, worst: 0, since: performance.now() };
function perfTick(dtMs, cpuMs) {
  if (!perf.on) return;
  perf.frames++; perf.dt += dtMs; perf.cpu += cpuMs; perf.worst = Math.max(perf.worst, cpuMs);
  const t = performance.now();
  if (t - perf.since < 400) return;
  const fps = perf.frames * 1000 / Math.max(1, perf.dt), st = artStats(), info = st ? st.atlas : null;
  const lines = [
    `${fps.toFixed(0)} 帧/秒  帧间隔 ${(perf.dt / perf.frames).toFixed(1)} 毫秒  脚本 ${(perf.cpu / perf.frames).toFixed(2)} 毫秒（最慢 ${perf.worst.toFixed(1)}）`,
    `画布 ${canvas.width}×${canvas.height}  每布局单位 ${(canvas.width / W).toFixed(2)} 像素  美术像素 ${st ? st.k : '-'} 倍`,
    `画法 ${artMode()}  图集 ${info ? info.mb + ' / ' + info.budgetMB + ' MB（' + info.pages + ' 页）' : '无'}  镜头角 ${st ? (st.th * 180 / Math.PI).toFixed(0) + '°' : '-'}`,
    `世界 ${st ? st.stats.items : 0} 件  部件 ${st ? st.stats.parts : 0}  世界绘制 ${st ? st.stats.drawMs.toFixed(2) : '-'} 毫秒`,
    `地砖 ${st && st.grounds.length ? st.grounds.map(g => g.id + (g.fromPack ? '' : '(兜底)') + ' ' + g.ms + 'ms').join('  ') : '未建'}`,
    `美术包 ${st && st.packs.length ? st.packs.map(p => p.key).join('、') : '没有挂载'}`,
  ];
  perfEl.textContent = lines.join('\n');
  perf.frames = 0; perf.dt = 0; perf.cpu = 0; perf.worst = 0; perf.since = t;
}
function togglePerf() { perf.on = !perf.on; perfEl.hidden = !perf.on; perf.since = 0; perf.frames = 0; perf.dt = 0; perf.cpu = 0; perf.worst = 0; }

function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const k = Math.min(vw / W, vh / H);              // 非 16:9 等比缩放，留黑边
  const cssW = Math.floor(W * k), cssH = Math.floor(H * k);
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, dprCap);
  canvas.width = Math.max(W, Math.round(cssW * dpr)); canvas.height = Math.round(canvas.width * H / W);
  scale = canvas.width / W;
}
window.addEventListener('resize', fit);
fit();

// 网址参数：?seed=数字 固定一趟的随机种子；?mode=tutorial 直接打第 1 步的 4 场教学仗；
// ?speed=数字 动画加速（只用来测试）；?auto=1 开假玩家自动打（只用来测试）。
const params = new URLSearchParams(location.search);
// 画法：默认接工坊的 3D 像素模型；?art=blocks 或工坊没加载成功就用色块。要在建任何场景以前定下来。
initArt(canvas, params);
const scene = new Flow();
if (params.get('show')) scene.debugShow(params.get('show'), params.get('biome'));
else if (params.get('mode') === 'tutorial') scene.startTutorial();
else if (params.get('seed')) scene.startTrip(Number(params.get('seed')));
const speed = Math.max(1, Number(params.get('speed')) || 1);
// 浏览器规矩：用户第一次点击、拖牌或按键以后才许出声。这以前 audio 的调用都静默。
for (const ev of ['pointerdown', 'keydown']) window.addEventListener(ev, () => audio.unlock(), { capture: true });
window.__audio = audio;
window.__game = scene; // 调试用
window.__art = { mode: artMode, info: artInfo, stats: artStats, perf };
if (params.get('auto')) import('./autopilot.js').then(m => m.startAutopilot(scene, params));

const toLayout = e => {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
};
// 第三个参数是哪个键（0 左键，2 右键）：右键拖动用来转镜头
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); scene.pointerDown(...toLayout(e), e.button); });
canvas.addEventListener('pointermove', e => scene.pointerMove(...toLayout(e)));
canvas.addEventListener('pointerup', e => scene.pointerUp(...toLayout(e), e.button));
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointercancel', () => scene.cancelDrag());
window.addEventListener('blur', () => scene.cancelDrag());
canvas.addEventListener('wheel', e => { e.preventDefault(); scene.wheel(e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY); }, { passive: false });
window.addEventListener('keydown', e => {
  if ((e.key === 'p' || e.key === 'P') && !e.repeat && !e.metaKey && !e.ctrlKey) { togglePerf(); return; }
  if (e.key === ' ' || e.key === 'Backspace' || e.key.startsWith('Arrow') || e.key.startsWith('Page')) e.preventDefault();
  scene.key(e.key);
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000), gap = now - last;
  last = now;
  const t0 = performance.now();
  try {
    for (let k = 0; k < speed; k++) scene.update(dt);
    beginArtFrame(now / 1000);
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.clearRect(0, 0, W, H);
    scene.draw(ctx);
  } catch (err) {
    errBox.textContent = '出错了：' + (err && err.stack || err);
    console.error(err);
    return; // 出错就停，别刷屏
  }
  perfTick(gap, performance.now() - t0);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
