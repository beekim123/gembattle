// 主循环空壳：支持浏览器 requestAnimationFrame，也支持在 Node 单测中注入假调度器或直接 step(dt)。

/**
 * 创建主循环实例。
 * @param {object} options
 * @param {(dt: number, elapsed: number) => void} [options.onUpdate] 每帧逻辑更新（秒）
 * @param {() => void} [options.onRender] 每帧画面绘制
 * @param {number} [options.maxDt=0.1] 单帧最大步长（秒），切标签回来时防止跳变
 * @param {{ request: Function, cancel: Function, now: Function }} [options.scheduler] 可选调度器（单测用）
 */
export function createGameLoop({
  onUpdate = () => {},
  onRender = () => {},
  maxDt = 0.1,
  scheduler = null,
} = {}) {
  const driver = scheduler || {
    request: (cb) => globalThis.requestAnimationFrame(cb),
    cancel: (id) => globalThis.cancelAnimationFrame(id),
    now: () => (globalThis.performance ? globalThis.performance.now() : Date.now()),
  };

  let running = false;
  let rafId = null;
  let lastTime = 0;
  let elapsed = 0;
  let frameCount = 0;

  function step(dtSeconds) {
    const safeDt = Math.max(0, Math.min(Number(dtSeconds) || 0, maxDt));
    elapsed += safeDt;
    frameCount++;
    onUpdate(safeDt, elapsed);
    onRender();
  }

  function tick(timestamp) {
    if (!running) return;
    const now = typeof timestamp === 'number' ? timestamp : driver.now();
    const dt = lastTime > 0 ? (now - lastTime) / 1000 : 0;
    lastTime = now;
    step(dt);
    if (running) {
      rafId = driver.request(tick);
    }
  }

  function start() {
    if (running) return;
    running = true;
    lastTime = driver.now();
    rafId = driver.request(tick);
  }

  function stop() {
    if (!running) return;
    running = false;
    if (rafId !== null) {
      driver.cancel(rafId);
      rafId = null;
    }
  }

  return {
    start,
    stop,
    step,
    isRunning: () => running,
    getStats: () => ({ frameCount, elapsed }),
  };
}
