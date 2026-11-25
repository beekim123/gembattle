// 唯一组装处：画布缩放（960×540 布局单位 → 1920×1080）、主循环、输入分发。
import { BattleScene } from './scenes/battle-scene.js';

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

const seedParam = new URLSearchParams(location.search).get('seed');
const scene = new BattleScene();
if (seedParam) scene.newRun(Number(seedParam));
window.__game = scene; // 调试用

const toLayout = e => {
  const r = canvas.getBoundingClientRect();
  return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H];
};
canvas.addEventListener('pointerdown', e => { canvas.setPointerCapture(e.pointerId); scene.pointerDown(...toLayout(e)); });
canvas.addEventListener('pointermove', e => scene.pointerMove(...toLayout(e)));
canvas.addEventListener('pointerup', e => scene.pointerUp(...toLayout(e)));
canvas.addEventListener('pointercancel', () => { scene.drag = null; });
window.addEventListener('blur', () => { scene.drag = null; });
window.addEventListener('keydown', e => {
  if (e.key === ' ' || e.key === 'Backspace') e.preventDefault();
  scene.key(e.key);
});

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  try {
    scene.update(dt);
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
