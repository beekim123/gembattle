// 镜头与世界坐标：纯数学，不碰画布、不碰浏览器，node 里能直接测。
//
// 世界坐标 (wx, wy, wz)：wx 向右，wy 向画面下方（朝主角这边），wz 向上。单位是工坊的「格」。
// 屏幕位置的算法照工坊 StackRenderer.proj：先绕镜头中心转 th，再把地面压扁 TILT，高度每升 1 格抬 HS 格：
//     rx = cos(th)·wx − sin(th)·wy        ry = sin(th)·wx + cos(th)·wy
//     屏幕 x = 原点 x + rx · S           屏幕 y = 原点 y + ry · TILT · S − wz · HS · S
// 这里的 S 取「每格几个布局单位」= BAKE_SCALE = 2.5，所以 th = 0 时世界和 960×540 布局一一对应：
//     布局 x = 480 + wx · 2.5      布局 y = 原点 y + wy · 1.5      高度每格抬 2 个布局单位
// 画布上真正的设备像素 = 布局单位 × unit（unit = 画布宽 / 960）。
//
// 镜头角 th 由 Camera 管：
//   free   开放 360°，可自转（标题页慢速缓转）
//   battle 默认微斜机位 th0，只能在 th0 ± 45° 里转；解锁以后也能转满 360°；没在拖牌时再叠一点鼠标阻尼视差（± 4°）
//   fixed  不转（路线图）
export const TILT = 0.6;               // 俯视压扁，跟工坊一致
export const HS = 0.8;                 // 每升高 1 格，屏幕上抬 0.8 格
export const BAKE_SCALE = 2.5;         // 1 格体素 = 2.5 个美术像素；这里也是「每格几个布局单位」
export const TAU = Math.PI * 2;
export const BATTLE_TH0 = 0.28;                    // 战斗默认机位，约 16°
export const BATTLE_SPAN = Math.PI / 4;            // 战斗里允许在机位两边各转 45°
export const PARALLAX_MAX = 4 * Math.PI / 180;     // 鼠标视差最多 ± 4°
export const STEP_ANGLE = Math.PI / 12;            // Q / E 每按一下转 15°
export const DRAG_RAD_PER_UNIT = 0.0065;           // 拖动：每横移 1 个布局单位转多少弧度
export const IDLE_BEFORE_SPIN = 2.0;               // 标题页：松手后多少秒又开始慢转

export const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
// 角度归到 (−π, π]
export function wrapAngle(a) {
  if (!Number.isFinite(a)) return 0;
  a %= TAU;
  if (a > Math.PI) a -= TAU; else if (a <= -Math.PI) a += TAU;
  return a;
}

// ---------- 世界到屏幕（布局单位）----------
// origin：世界原点（0, 0, 0）在 th = 0 时落在布局的哪一点；转镜头就是绕这一点转。
// 返回 [布局 x, 布局 y, 深度]，深度就是 ry（越大越靠近镜头，越晚画）。
export function project(origin, th, wx, wy, wz = 0) {
  const c = Math.cos(th), s = Math.sin(th);
  const rx = c * wx - s * wy, ry = s * wx + c * wy;
  return [origin[0] + rx * BAKE_SCALE, origin[1] + ry * TILT * BAKE_SCALE - wz * HS * BAKE_SCALE, ry];
}
// th = 0 时布局点 → 世界地面点（高度 0）
export function layoutToWorld(origin, lx, ly) {
  return [(lx - origin[0]) / BAKE_SCALE, (ly - origin[1]) / (BAKE_SCALE * TILT)];
}
// 反过来：屏幕上的一点（当前镜头角 th）落在世界地面哪里（点击地面用）
export function unproject(origin, th, sx, sy) {
  const rx = (sx - origin[0]) / BAKE_SCALE, ry = (sy - origin[1]) / (BAKE_SCALE * TILT);
  const c = Math.cos(th), s = Math.sin(th);
  return [c * rx + s * ry, -s * rx + c * ry];
}
// 一个站在布局点 (lx, ly) 的东西，头顶高 hLayout 个布局单位处，现在在屏幕的哪里：血条、飘字、点选框都挂这里。
export function anchor(origin, th, lx, ly, hLayout = 0) {
  const [wx, wy] = layoutToWorld(origin, lx, ly);
  return project(origin, th, wx, wy, hLayout / (HS * BAKE_SCALE));
}
// 世界里的一格高，对应布局里多少单位
export const heightToWorld = hLayout => hLayout / (HS * BAKE_SCALE);
export const heightToLayout = wz => wz * HS * BAKE_SCALE;

// 屏幕深度排序用：世界点在当前镜头角下的 ry
export function depthOf(th, wx, wy) { return Math.sin(th) * wx + Math.cos(th) * wy; }

// ---------- 镜头 ----------
export class Camera {
  constructor() { this.setup({ mode: 'fixed' }); }

  // mode: 'free' | 'battle' | 'fixed'；th0 默认机位；autoSpin 弧度 / 秒（只对 free）；parallax 要不要鼠标视差
  setup({ mode = 'free', th0 = 0, origin = [480, 258], autoSpin = 0, span = BATTLE_SPAN, parallax = false, keepAngle = false } = {}) {
    this.mode = mode; this.th0 = th0; this.origin = origin; this.autoSpin = autoSpin; this.span = span; this.parallaxOn = parallax;
    this.unlocked = false;
    if (!keepAngle) { this.user = 0; this.cur = 0; }
    this.par = 0; this.parCur = 0;
    this.idle = IDLE_BEFORE_SPIN; this.dragging = false;
    return this;
  }
  get th() { return wrapAngle(this.th0 + this.cur + (this.parallaxOn ? this.parCur : 0)); }
  // 是不是转得动（路线图不能转）
  get canRotate() { return this.mode !== 'fixed'; }
  // 现在是不是被限在扇形里（战斗没解锁）
  get limited() { return this.mode === 'battle' && !this.unlocked; }

  // 拖动：d 是弧度增量（正数 = 顺时针转）
  rotateBy(d) {
    if (!this.canRotate || !Number.isFinite(d)) return;
    this.idle = 0;
    this.user += d;
    this._fix();
  }
  // Q / E：dir = −1 或 +1
  step(dir) { this.rotateBy(Math.sign(dir) * STEP_ANGLE); }
  // R：回正（默认机位）
  recenter() { if (!this.canRotate) return; this.idle = 0; this.user = 0; if (this.mode === 'free') this.cur = wrapAngle(this.cur); }
  // 战斗里的「解锁 360°」开关
  setUnlocked(on) {
    if (this.mode !== 'battle') return;
    this.unlocked = !!on;
    if (!this.unlocked) this.user = clamp(wrapAngle(this.user), -this.span, this.span);
  }
  // 鼠标视差：v 是鼠标横向位置归一化到 −1..1；传 0 就是不偏
  setParallax(v) { this.par = clamp(Number.isFinite(v) ? v : 0, -1, 1) * PARALLAX_MAX; }

  _fix() {
    if (this.limited) this.user = clamp(this.user, -this.span, this.span);
    else this.user = wrapAngle(this.user);
  }

  update(dt) {
    if (!(dt > 0)) return;
    this.idle += dt;
    if (this.mode === 'free' && this.autoSpin && this.idle > IDLE_BEFORE_SPIN && !this.dragging) { this.user += this.autoSpin * dt; this._fix(); }
    const k = 1 - Math.exp(-dt * 14);
    // 转的时候走最短的那一边；战斗限幅时直接差值
    const diff = this.limited ? this.user - this.cur : wrapAngle(this.user - this.cur);
    this.cur += diff * k;
    if (!this.limited) this.cur = wrapAngle(this.cur);
    this.parCur += (this.par - this.parCur) * (1 - Math.exp(-dt * 6));
  }
}

// 全游戏共用一台镜头（一次只显示一个场景，场景进来时用 setup 重新配置）
export const camera = new Camera();

// 拖动与按键的输入翻译：场景把指针和按键转给它，它去转镜头。纯逻辑，不碰 DOM。
export class ViewInput {
  constructor(cam = camera) { this.cam = cam; this.drag = null; }
  get active() { return !!this.drag; }
  // 开始拖：左键拖空白地面或右键随便拖。返回 true 表示镜头接手了
  down(x, button = 0) {
    if (!this.cam.canRotate) return false;
    this.drag = { x, button, moved: 0 };
    this.cam.dragging = true;
    return true;
  }
  // 向右拖 = 抓住地面往右推：近处的地面往右走，镜头角减小
  move(x) {
    if (!this.drag) return false;
    const dx = x - this.drag.x;
    this.drag.x = x; this.drag.moved += Math.abs(dx);
    this.cam.rotateBy(-dx * DRAG_RAD_PER_UNIT);
    return true;
  }
  // 松手。返回这次是不是真的拖过（挪动超过 4 个布局单位）
  up() { const was = this.drag; this.drag = null; this.cam.dragging = false; return !!was && was.moved > 4; }
  cancel() { this.drag = null; this.cam.dragging = false; }
  // Q / E 步进，R 回正。返回 true 表示按键用掉了
  key(k) {
    const c = String(k).toLowerCase();
    if (!this.cam.canRotate) return false;
    if (c === 'q') { this.cam.step(-1); return true; }
    if (c === 'e') { this.cam.step(1); return true; }
    if (c === 'r') { this.cam.recenter(); return true; }
    return false;
  }
}
