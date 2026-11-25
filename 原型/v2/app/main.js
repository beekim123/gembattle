// 唯一组装处：画布缩放（960×540 布局单位 → 1920×1080）、主循环、输入分发。
import { Flow } from './flow.js';
import { initArt, beginArtFrame, artMode, artInfo } from '../modules/render/index.js';
import { audio } from '../modules/audio/index.js';

const W = 960, H = 540;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const errBox = document.getElementById('err');
let scale = 2;
// ?dpr=1 把画布的物理像素压到 1920×1080（测帧率、模拟 1080p 屏幕用）；默认跟屏幕走，最多 2 倍。
// 没写 ?dpr= 时还有一道保险：连续两段 60 帧都慢于 26 毫秒，就自动降到 1 倍（画布 1920×1080），只降不升。
const dprParam = Number(new URLSearchParams(location.search).get('dpr'));
let dprCap = dprParam || 2;
const perf = { auto: !dprParam, slow: 0, n: 0, sum: 0, skip: 20, lowered: false };
function watchFrameTime(dtMs) {
  if (!perf.auto || perf.lowered || dprCap <= 1 || canvas.width <= 1920) return;
  if (document.hidden || dtMs > 200) { perf.n = 0; perf.sum = 0; return; }   // 切走、卡顿尖峰不算
  if (perf.skip > 0) { perf.skip--; return; }                               // 开头几帧在烘图集，不算
  perf.n++; perf.sum += dtMs;
  if (perf.n < 60) return;
  perf.slow = perf.sum / perf.n > 26 ? perf.slow + 1 : 0;
  perf.n = 0; perf.sum = 0;
  if (perf.slow >= 2) { perf.lowered = true; dprCap = 1; fit(); }
}

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
window.__art = { mode: artMode, info: artInfo, perf };
if (params.get('auto')) import('./autopilot.js').then(m => m.startAutopilot(scene, params));

const toLayout = e => {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
};
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); scene.pointerDown(...toLayout(e)); });
canvas.addEventListener('pointermove', e => scene.pointerMove(...toLayout(e)));
canvas.addEventListener('pointerup', e => scene.pointerUp(...toLayout(e)));
canvas.addEventListener('pointercancel', () => scene.cancelDrag());
window.addEventListener('blur', () => scene.cancelDrag());
canvas.addEventListener('wheel', e => { e.preventDefault(); scene.wheel(e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY); }, { passive: false });
window.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Backspace' || e.key.startsWith('Arrow') || e.key.startsWith('Page')) e.preventDefault();
  scene.key(e.key);
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  watchFrameTime(now - last); last = now;
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
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
