// 唯一组装处：画布缩放（960×540 布局单位 → 1920×1080）、主循环、输入分发。
import { Flow } from './flow.js';

const W = 960, H = 540;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const errBox = document.getElementById('err');
let scale = 2;

function fit() {
  const vw = window.innerWidth, vh = window.innerHeight;
  const k = Math.min(vw / W, vh / H);              // 非 16:9 等比缩放，留黑边
  const cssW = Math.floor(W * k), cssH = Math.floor(H * k);
  canvas.style.width = cssW + 'px'; canvas.style.height = cssH + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(W, Math.round(cssW * dpr)); canvas.height = Math.round(canvas.width * H / W);
  scale = canvas.width / W;
}
window.addEventListener('resize', fit);
fit();

// 网址参数：?seed=数字 固定一趟的随机种子；?mode=tutorial 直接打第 1 步的 4 场教学仗；
// ?speed=数字 动画加速（只用来测试）；?auto=1 开假玩家自动打（只用来测试）。
const params = new URLSearchParams(location.search);
const scene = new Flow();
if (params.get('mode') === 'tutorial') scene.startTutorial();
else if (params.get('seed')) scene.startTrip(Number(params.get('seed')));
const speed = Math.max(1, Number(params.get('speed')) || 1);
window.__game = scene; // 调试用
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
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try {
    for (let k = 0; k < speed; k++) scene.update(dt);
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
